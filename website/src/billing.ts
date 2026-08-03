const apiUrl = ((import.meta.env.VITE_API_URL as string | undefined) || "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");

export type BillingPlan = {
  id: "sde1_sprint" | "sde1_intensive";
  name: string;
  purchase_type: "one_time" | "subscription";
  amount_inr: number;
  currency: string;
  interview_minutes_per_month: number;
  interval: string | null;
  supports_auto_renew: boolean;
  period_days: number;
};

export type BillingEntitlement = {
  plan_id?: string;
  status: "none" | "active" | "past_due" | "cancelled" | "expired";
  auto_renew: boolean;
  minutes_limit: number;
  minutes_used: number;
  minutes_remaining: number;
  period_end?: string;
};

export type BillingCheckout = {
  reference: string;
  plan_id: string;
  purchase_type: "one_time" | "subscription";
  amount_inr: number;
  currency: string;
  session_id: string;
  environment: "sandbox" | "production";
};

async function request<T>(path: string, init?: RequestInit, accessToken?: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Billing is temporarily unavailable.");
  }
  return response.json() as Promise<T>;
}

export const getBillingPlans = () => request<BillingPlan[]>("/billing/plans");
export const getEntitlement = (token: string) => request<BillingEntitlement>("/billing/me", undefined, token);
export const createCheckout = (
  token: string,
  body: { plan_id: BillingPlan["id"]; customer_name: string; phone: string; auto_renew: boolean },
) => request<BillingCheckout>("/billing/checkout", { method: "POST", body: JSON.stringify(body) }, token);
export const cancelRenewal = (token: string) => request<{ cancelled: boolean; access_until: string }>(
  "/billing/cancel", { method: "POST" }, token,
);

type CashfreeResult = Promise<{ error?: { message?: string } }>;
type CashfreeSdk = {
  checkout(options: { paymentSessionId: string; redirectTarget: "_self" }): CashfreeResult;
  subscriptionsCheckout(options: { subsSessionId: string; redirectTarget: "_self" }): CashfreeResult;
};

declare global {
  interface Window { Cashfree?: (options: { mode: "sandbox" | "production" }) => CashfreeSdk; }
}

let sdkPromise: Promise<void> | null = null;
function loadCashfree(): Promise<void> {
  if (window.Cashfree) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Secure checkout could not be loaded. Please try again."));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export async function openCashfreeCheckout(checkout: BillingCheckout): Promise<void> {
  await loadCashfree();
  if (!window.Cashfree) throw new Error("Secure checkout is unavailable.");
  const cashfree = window.Cashfree({ mode: checkout.environment });
  const result = checkout.purchase_type === "subscription"
    ? await cashfree.subscriptionsCheckout({ subsSessionId: checkout.session_id, redirectTarget: "_self" })
    : await cashfree.checkout({ paymentSessionId: checkout.session_id, redirectTarget: "_self" });
  if (result?.error) throw new Error(result.error.message || "Checkout was not completed.");
}
