# LeetAlly billing launch checklist

The application is designed so the browser never grants paid access. A signed Cashfree webhook activates or renews the Supabase entitlement after the backend verifies the reference, amount and currency.

## 1. Apply the database migrations

Apply every migration in `supabase/migrations` in filename order. Migration `0002_billing.sql` creates the billing tables; `0004_speech_only_usage.sql` makes detected speech the billable unit; `0006_sde1_pricing_and_expiry.sql` adds the launch plans, expiry, AutoPay state and lifecycle RPCs.

Do not expose billing tables to the browser. They intentionally have no `anon` or `authenticated` RLS policies; only the backend service role may read or change them.

## 2. Configure and deploy the backend

Set these server-only environment variables on the backend host:

```text
BILLING_ENABLED=true
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
CASHFREE_ENVIRONMENT=sandbox
CASHFREE_CLIENT_ID=YOUR_SERVER_ONLY_CLIENT_ID
CASHFREE_CLIENT_SECRET=YOUR_SERVER_ONLY_CLIENT_SECRET
CASHFREE_API_VERSION=2025-01-01
BILLING_RETURN_URL=https://leetally-web.vercel.app/pricing?payment=return
CORS_ORIGINS=https://leetally-web.vercel.app
```

Never add the service-role key or Cashfree secret to Vite, the website, the extension, Git, screenshots or support messages.

## 3. Configure Cashfree sandbox

In Cashfree Merchant Dashboard, add this HTTPS webhook endpoint:

```text
https://YOUR_API_DOMAIN/api/v1/billing/webhooks/cashfree
```

Enable payment success plus these subscription events:

- `SUBSCRIPTION_PAYMENT_SUCCESS`
- `SUBSCRIPTION_PAYMENT_FAILED`
- `SUBSCRIPTION_PAYMENT_CANCELLED`
- `SUBSCRIPTION_STATUS_CHANGED`

Use webhook version `2025-01-01`. Test delivery must return HTTP 200.

## 4. Configure the website

Set these Vercel variables and redeploy:

```text
VITE_API_URL=https://YOUR_API_DOMAIN/api/v1
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

## 5. Sandbox acceptance test

1. Sign up with a fresh user.
2. Buy Sprint as a one-time pass and complete sandbox payment.
3. Confirm no access appears before the webhook arrives.
4. Confirm `/api/v1/billing/me` reports `active`, 240 minutes and an end date 30 days later.
5. Repeat with AutoPay selected and confirm `auto_renew: true`.
6. Cancel AutoPay from the pricing page. Confirm access remains active through the paid end date and `auto_renew: false`.
7. Send a duplicate webhook and confirm the allowance does not reset twice.
8. Send a wrong-amount, stale-timestamp and invalid-signature webhook; each must fail without granting access.
9. Set a test entitlement end date in the past and confirm the API returns `expired` and interview endpoints refuse paid use.
10. Confirm silent microphone time does not change `speech_seconds_used`.

Move to production credentials only after all ten checks pass and Cashfree has enabled the required payment methods for the merchant account.
