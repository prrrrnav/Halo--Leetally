from __future__ import annotations

import base64
import hashlib
import hmac
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Protocol
from uuid import uuid4

import httpx

from .config import Settings
from .domain import AuthenticatedUser


class BillingConfigurationError(RuntimeError):
    pass


class BillingProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class BillingPlan:
    id: str
    name: str
    purchase_type: str
    amount_inr: int
    currency: str
    interview_minutes_per_month: int
    interval: str | None = None
    supports_auto_renew: bool = False
    period_days: int = 30
    features: tuple[str, ...] = ()

    def public_dict(self) -> dict[str, Any]:
        return asdict(self)


PLANS: dict[str, BillingPlan] = {
    "beta_monthly": BillingPlan(
        id="beta_monthly",
        name="LeetAlly Beta Monthly",
        purchase_type="subscription",
        amount_inr=799,
        currency="INR",
        interview_minutes_per_month=240,
        interval="month",
        supports_auto_renew=True,
        features=(
            "company_specific_interviews",
            "dsa_lld_hld_behavioral",
            "interview_scorecards",
            "interview_history",
            "monthly_usage_dashboard",
        ),
    ),
}


@dataclass
class CheckoutRecord:
    reference: str
    user_id: str
    plan_id: str
    purchase_type: str
    amount_inr: int
    currency: str
    status: str
    provider_session_id: str
    idempotency_key: str


@dataclass
class BillingEntitlement:
    user_id: str
    plan_id: str
    status: str
    is_lifetime: bool
    minutes_limit: int
    minutes_used: int
    period_start: datetime
    period_end: datetime
    speech_seconds_used: int = 0
    auto_renew: bool = False
    provider_reference: str = ""

    def public_dict(self) -> dict[str, Any]:
        plan = PLANS.get(self.plan_id)
        remaining_seconds = max(0, self.minutes_limit * 60 - self.speech_seconds_used)
        return {
            "plan_id": self.plan_id,
            "plan_name": plan.name if plan else self.plan_id,
            "status": self.status,
            "is_lifetime": self.is_lifetime,
            "minutes_limit": self.minutes_limit,
            "minutes_used": self.minutes_used,
            "minutes_remaining": max(0, self.minutes_limit - self.minutes_used),
            "speech_seconds_used": self.speech_seconds_used,
            "speech_seconds_remaining": remaining_seconds,
            "usage_percent": (
                min(100, round(self.speech_seconds_used * 100 / (self.minutes_limit * 60)))
                if self.minutes_limit else 0
            ),
            "auto_renew": self.auto_renew,
            "period_start": self.period_start,
            "period_end": self.period_end,
            "features": list(plan.features) if plan else [],
        }


class BillingRepository(Protocol):
    async def save_checkout(self, checkout: CheckoutRecord) -> None: ...
    async def get_checkout(self, reference: str) -> CheckoutRecord | None: ...
    async def get_entitlement(self, user_id: str) -> BillingEntitlement | None: ...
    async def activate(
        self, checkout: CheckoutRecord, event_id: str, event_type: str, payload_hash: str
    ) -> bool: ...
    async def consume_speech_seconds(
        self, user_id: str, event_id: str, interview_id: str, seconds: int
    ) -> int: ...
    async def update_lifecycle(
        self, reference: str, event_id: str, event_type: str, payload_hash: str,
        entitlement_status: str | None, auto_renew: bool | None,
    ) -> bool: ...
    async def cancel_renewal(self, reference: str) -> None: ...


class InMemoryBillingRepository:
    def __init__(self) -> None:
        self.checkouts: dict[str, CheckoutRecord] = {}
        self.entitlements: dict[str, BillingEntitlement] = {}
        self.events: set[str] = set()

    async def save_checkout(self, checkout: CheckoutRecord) -> None:
        self.checkouts[checkout.reference] = checkout

    async def get_checkout(self, reference: str) -> CheckoutRecord | None:
        return self.checkouts.get(reference)

    async def get_entitlement(self, user_id: str) -> BillingEntitlement | None:
        entitlement = self.entitlements.get(user_id)
        if (
            entitlement is not None and entitlement.status == "active"
            and not entitlement.is_lifetime
            and entitlement.period_end <= datetime.now(timezone.utc)
        ):
            entitlement.status = "expired"
            entitlement.auto_renew = False
        return entitlement

    async def activate(
        self, checkout: CheckoutRecord, event_id: str, event_type: str, payload_hash: str
    ) -> bool:
        del event_type, payload_hash
        if event_id in self.events:
            return False
        self.events.add(event_id)
        plan = PLANS[checkout.plan_id]
        now = datetime.now(timezone.utc)
        current = self.entitlements.get(checkout.user_id)
        # A verified renewal buys a full additional period. If Cashfree
        # delivers it slightly before the current period closes, extend from
        # that paid-through date instead of silently shortening access.
        period_start = (
            current.period_end
            if current is not None
            and current.provider_reference == checkout.reference
            and current.period_end > now
            else now
        )
        self.entitlements[checkout.user_id] = BillingEntitlement(
            user_id=checkout.user_id,
            plan_id=plan.id,
            status="active",
            is_lifetime=plan.id == "lifetime",
            minutes_limit=plan.interview_minutes_per_month,
            minutes_used=0,
            period_start=period_start,
            period_end=period_start + timedelta(days=plan.period_days),
            auto_renew=(
                checkout.purchase_type == "subscription"
                and checkout.status != "cancelled"
            ),
            provider_reference=checkout.reference,
        )
        checkout.status = "paid"
        return True

    async def consume_speech_seconds(
        self, user_id: str, event_id: str, interview_id: str, seconds: int
    ) -> int:
        del interview_id
        entitlement = self.entitlements.get(user_id)
        if entitlement is None or entitlement.status != "active":
            raise BillingProviderError("No active interview entitlement.")
        if event_id in self.events:
            return max(0, entitlement.minutes_limit * 60 - entitlement.speech_seconds_used)
        next_seconds = entitlement.speech_seconds_used + max(0, seconds)
        if next_seconds > entitlement.minutes_limit * 60:
            raise BillingProviderError("Speech-minute allowance exceeded.")
        self.events.add(event_id)
        entitlement.speech_seconds_used = next_seconds
        entitlement.minutes_used = (next_seconds + 59) // 60
        return entitlement.minutes_limit * 60 - next_seconds

    async def update_lifecycle(
        self, reference: str, event_id: str, event_type: str, payload_hash: str,
        entitlement_status: str | None, auto_renew: bool | None,
    ) -> bool:
        del event_type, payload_hash
        if event_id in self.events:
            return False
        self.events.add(event_id)
        checkout = self.checkouts.get(reference)
        if checkout is None:
            return False
        entitlement = self.entitlements.get(checkout.user_id)
        if entitlement is not None:
            if entitlement_status is not None:
                entitlement.status = entitlement_status
            if auto_renew is not None:
                entitlement.auto_renew = auto_renew
        return True

    async def cancel_renewal(self, reference: str) -> None:
        checkout = self.checkouts.get(reference)
        if checkout is not None:
            checkout.status = "cancelled"
            entitlement = self.entitlements.get(checkout.user_id)
            if entitlement is not None:
                entitlement.auto_renew = False


class SupabaseBillingRepository:
    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_service_role_key:
            raise BillingConfigurationError("Billing database credentials are not configured.")
        self.base_url = settings.supabase_url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.request(method, self.base_url + path, headers=self.headers, **kwargs)
        if response.status_code >= 400:
            raise BillingProviderError("The billing database operation failed.")
        return response

    async def save_checkout(self, checkout: CheckoutRecord) -> None:
        await self._request("POST", "/billing_checkouts", json={
            "provider_reference": checkout.reference,
            "user_id": checkout.user_id,
            "plan_id": checkout.plan_id,
            "purchase_type": checkout.purchase_type,
            "amount_inr": checkout.amount_inr,
            "currency": checkout.currency,
            "status": checkout.status,
            "provider_session_id": checkout.provider_session_id,
            "idempotency_key": checkout.idempotency_key,
        })

    async def get_checkout(self, reference: str) -> CheckoutRecord | None:
        response = await self._request(
            "GET", "/billing_checkouts",
            params={"provider_reference": f"eq.{reference}", "select": "*", "limit": "1"},
        )
        rows = response.json()
        if not rows:
            return None
        row = rows[0]
        return CheckoutRecord(
            reference=row["provider_reference"], user_id=row["user_id"],
            plan_id=row["plan_id"], purchase_type=row["purchase_type"],
            amount_inr=row["amount_inr"], currency=row["currency"],
            status=row["status"], provider_session_id=row["provider_session_id"],
            idempotency_key=row["idempotency_key"],
        )

    async def get_entitlement(self, user_id: str) -> BillingEntitlement | None:
        await self._request("POST", "/rpc/expire_billing_entitlement", json={
            "p_user_id": user_id,
        })
        response = await self._request(
            "GET", "/billing_entitlements",
            params={"user_id": f"eq.{user_id}", "select": "*", "limit": "1"},
        )
        rows = response.json()
        if not rows:
            return None
        row = rows[0]
        return BillingEntitlement(
            user_id=row["user_id"], plan_id=row["plan_id"], status=row["status"],
            is_lifetime=row["is_lifetime"], minutes_limit=row["minutes_limit"],
            minutes_used=row["minutes_used"], period_start=datetime.fromisoformat(row["period_start"]),
            period_end=datetime.fromisoformat(row["period_end"]),
            speech_seconds_used=row.get("speech_seconds_used", row["minutes_used"] * 60),
            auto_renew=row.get("auto_renew", False),
            provider_reference=row.get("provider_reference", ""),
        )

    async def consume_speech_seconds(
        self, user_id: str, event_id: str, interview_id: str, seconds: int
    ) -> int:
        response = await self._request("POST", "/rpc/consume_speech_seconds", json={
            "p_user_id": user_id,
            "p_event_id": event_id,
            "p_interview_id": interview_id,
            "p_seconds": seconds,
        })
        return int(response.json())

    async def activate(
        self, checkout: CheckoutRecord, event_id: str, event_type: str, payload_hash: str
    ) -> bool:
        response = await self._request("POST", "/rpc/activate_billing_entitlement", json={
            "p_event_id": event_id,
            "p_event_type": event_type,
            "p_provider_reference": checkout.reference,
            "p_payload_sha256": payload_hash,
        })
        return bool(response.json())

    async def update_lifecycle(
        self, reference: str, event_id: str, event_type: str, payload_hash: str,
        entitlement_status: str | None, auto_renew: bool | None,
    ) -> bool:
        response = await self._request("POST", "/rpc/update_billing_lifecycle", json={
            "p_event_id": event_id,
            "p_event_type": event_type,
            "p_provider_reference": reference,
            "p_payload_sha256": payload_hash,
            "p_entitlement_status": entitlement_status,
            "p_auto_renew": auto_renew,
        })
        return bool(response.json())

    async def cancel_renewal(self, reference: str) -> None:
        await self._request("PATCH", "/billing_checkouts", params={
            "provider_reference": f"eq.{reference}",
        }, json={"status": "cancelled", "updated_at": datetime.now(timezone.utc).isoformat()})
        await self._request("PATCH", "/billing_entitlements", params={
            "provider_reference": f"eq.{reference}",
        }, json={"auto_renew": False, "updated_at": datetime.now(timezone.utc).isoformat()})


class CashfreeClient:
    def __init__(self, settings: Settings) -> None:
        if not settings.cashfree_client_id or not settings.cashfree_client_secret:
            raise BillingConfigurationError("Cashfree server credentials are not configured.")
        if settings.cashfree_environment not in {"sandbox", "production"}:
            raise BillingConfigurationError("Invalid Cashfree environment.")
        if (
            settings.cashfree_environment == "production"
            and not settings.billing_return_url.startswith("https://")
        ):
            raise BillingConfigurationError("Production billing requires an HTTPS return URL.")
        self.settings = settings
        self.base_url = (
            "https://sandbox.cashfree.com/pg"
            if settings.cashfree_environment == "sandbox"
            else "https://api.cashfree.com/pg"
        )

    async def _post(self, path: str, payload: dict[str, Any], idempotency_key: str) -> dict[str, Any]:
        headers = {
            "x-client-id": self.settings.cashfree_client_id,
            "x-client-secret": self.settings.cashfree_client_secret,
            "x-api-version": self.settings.cashfree_api_version,
            "x-idempotency-key": idempotency_key,
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(self.base_url + path, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise BillingProviderError("Cashfree could not create the checkout session.") from error

    async def cancel_subscription(self, reference: str) -> None:
        await self._post(
            f"/subscriptions/{reference}/manage",
            {"subscription_id": reference, "action": "CANCEL"},
            str(uuid4()),
        )

    async def verify_paid_order(self, reference: str, plan: BillingPlan) -> bool:
        headers = {
            "x-client-id": self.settings.cashfree_client_id,
            "x-client-secret": self.settings.cashfree_client_secret,
            "x-api-version": self.settings.cashfree_api_version,
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(
                    f"{self.base_url}/orders/{reference}", headers=headers
                )
            response.raise_for_status()
            order = response.json()
            return (
                order.get("order_status") == "PAID"
                and int(float(order.get("order_amount"))) == plan.amount_inr
                and order.get("order_currency") == plan.currency
            )
        except (httpx.HTTPError, TypeError, ValueError) as error:
            raise BillingProviderError("Cashfree could not verify the paid order.") from error

    async def create_checkout(
        self, user: AuthenticatedUser, plan: BillingPlan, customer_name: str, phone: str,
        auto_renew: bool = False,
    ) -> CheckoutRecord:
        if not user.email:
            raise BillingConfigurationError("A verified account email is required for checkout.")
        unique = uuid4().hex
        idempotency_key = str(uuid4())
        customer = {
            "customer_name": customer_name,
            "customer_email": user.email,
            "customer_phone": phone,
        }
        purchase_type = plan.purchase_type
        if purchase_type == "one_time":
            reference = f"la_ord_{unique}"
            response = await self._post("/orders", {
                "order_id": reference,
                "order_amount": plan.amount_inr,
                "order_currency": plan.currency,
                "customer_details": {**customer, "customer_id": user.id[:50]},
                "order_meta": {"return_url": self.settings.billing_return_url},
                "order_tags": {"plan_id": plan.id},
            }, idempotency_key)
            session_id = response.get("payment_session_id")
        else:
            reference = f"la_sub_{unique}"
            now = datetime.now(timezone.utc)
            response = await self._post("/subscriptions", {
                "subscription_id": reference,
                "customer_details": customer,
                "plan_details": {
                    "plan_name": plan.name,
                    "plan_type": "PERIODIC",
                    "plan_amount": plan.amount_inr,
                    "plan_max_amount": plan.amount_inr,
                    "plan_intervals": 1,
                    "plan_currency": plan.currency,
                    "plan_interval_type": "MONTH",
                    "plan_note": f"{plan.interview_minutes_per_month} speaking minutes per cycle",
                    "plan_max_cycles": 120,
                },
                "authorization_details": {
                    "authorization_amount": plan.amount_inr,
                    "authorization_amount_refund": False,
                    "payment_methods": ["upi", "card", "enach"],
                },
                "subscription_meta": {
                    "return_url": self.settings.billing_return_url,
                    "notification_channel": ["EMAIL", "SMS"],
                },
                "subscription_first_charge_time": (now + timedelta(days=plan.period_days)).isoformat(),
                "subscription_expiry_time": (now + timedelta(days=3650)).isoformat(),
                "subscription_tags": {"plan_id": plan.id, "user_id": user.id},
            }, idempotency_key)
            session_id = response.get("subscription_session_id")
        if not isinstance(session_id, str) or not session_id:
            raise BillingProviderError("Cashfree returned an invalid checkout session.")
        return CheckoutRecord(
            reference=reference, user_id=user.id, plan_id=plan.id,
            purchase_type=purchase_type, amount_inr=plan.amount_inr,
            currency=plan.currency, status="created", provider_session_id=session_id,
            idempotency_key=idempotency_key,
        )


def verify_cashfree_signature(raw_body: bytes, timestamp: str, signature: str, secret: str) -> bool:
    digest = hmac.new(secret.encode(), timestamp.encode() + raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)


def parse_successful_webhook(raw_body: bytes) -> tuple[str, str, Decimal | None, str | None]:
    try:
        payload = json.loads(raw_body)
        data = payload.get("data", {})
        order = data.get("order", {})
        payment = data.get("payment", {})
        subscription = data.get("subscription", {}) or data.get("subscription_details", {})
        payment_details = data.get("payment_details", {})
        reference = (
            order.get("order_id") or subscription.get("subscription_id")
            or data.get("subscription_id")
        )
        event_type = str(payload.get("type") or "unknown")
        # Cashfree can emit AUTH_STATUS and PAYMENT_SUCCESS for the same
        # authorization. Only the canonical payment-success event may grant or
        # renew access, otherwise one payment can be applied twice.
        if event_type.upper() != "SUBSCRIPTION_PAYMENT_SUCCESS":
            raise ValueError("Webhook type cannot activate an entitlement.")
        payment_status = str(
            payment.get("payment_status") or payment_details.get("payment_status")
            or data.get("payment_status") or ""
        ).upper()
        successful = payment_status in {"SUCCESS", "PAID"}
        if not successful or not isinstance(reference, str):
            raise ValueError("Webhook is not an activation event.")
        amount = (
            payment.get("payment_amount")
            or payment_details.get("payment_amount")
            or order.get("order_amount")
            or data.get("payment_amount")
        )
        currency = (
            payment.get("payment_currency")
            or payment_details.get("payment_currency")
            or order.get("order_currency")
            or data.get("payment_currency")
        )
        parsed_amount = Decimal(str(amount)) if amount is not None else None
        return reference, event_type, parsed_amount, str(currency).upper() if currency else None
    except (AttributeError, TypeError, ValueError, InvalidOperation, json.JSONDecodeError) as error:
        raise ValueError("Invalid or non-successful Cashfree webhook.") from error


def parse_lifecycle_webhook(raw_body: bytes) -> tuple[str, str, str | None, bool | None]:
    """Return lifecycle changes that never grant paid access on their own."""
    try:
        payload = json.loads(raw_body)
        data = payload.get("data", {})
        details = data.get("subscription_details", {}) or data.get("subscription", {})
        reference = details.get("subscription_id") or data.get("subscription_id")
        event_type = str(payload.get("type") or "unknown").upper()
        provider_status = str(details.get("subscription_status") or "").upper()
        if not isinstance(reference, str) or not reference:
            raise ValueError("Missing subscription reference.")
        if event_type in {"SUBSCRIPTION_PAYMENT_FAILED", "SUBSCRIPTION_PAYMENT_CANCELLED"}:
            # A failed future renewal must not revoke the period the customer
            # has already paid for. The normal period expiry gate removes
            # access if no later successful charge arrives.
            return reference, event_type, None, None
        if event_type != "SUBSCRIPTION_STATUS_CHANGED":
            raise ValueError("Not a lifecycle event.")
        if provider_status == "ACTIVE":
            # Payment-success webhooks are the only source of paid access and
            # renewal state. An out-of-order ACTIVE event cannot undo a user's
            # cancellation.
            return reference, event_type, None, None
        if provider_status == "ON_HOLD":
            return reference, event_type, None, None
        if provider_status in {"CUSTOMER_PAUSED", "EXPIRED", "LINK_EXPIRED"}:
            return reference, event_type, None, False
        if provider_status in {"COMPLETED", "CUSTOMER_CANCELLED", "CANCELLED", "CARD_EXPIRED"}:
            return reference, event_type, None, False
        raise ValueError("Lifecycle status does not change entitlement.")
    except (AttributeError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise ValueError("Invalid Cashfree lifecycle webhook.") from error


def cashfree_webhook_unix_seconds(timestamp: str) -> int:
    value = int(timestamp)
    return value // 1000 if value > 100_000_000_000 else value
