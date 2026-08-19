# LeetAlly public release checklist

## Automated gate

- [ ] Run `powershell -ExecutionPolicy Bypass -File scripts/release-check.ps1`.
- [ ] Confirm backend tests, extension compile/build/ZIP and website build pass.
- [ ] Confirm the generated manifest contains only expected permissions/hosts.
- [ ] Confirm the ZIP contains no development VAD bundle, source secrets or
  remotely executed code.

## Supabase and backend

- [ ] Apply migrations `0001` through `0008` to the production Supabase project.
- [ ] Set `APP_ENV=production` in Vercel.
- [ ] Configure the server-only Supabase service-role key and provider keys.
- [ ] Set production `CORS_ORIGINS` to `https://leetally-web.vercel.app` and
  `chrome-extension://kbmamkkghfaagfplfdgpdocmgakhjmlo`; do not use a wildcard
  extension origin.
- [ ] Call `/api/v1/health/ready` and receive HTTP 200 with `status=ready`.
- [ ] Verify create → audio turn → context update → completion survives cold starts.
- [ ] Verify account export and deletion with a non-production test user.
- [ ] Configure log redaction and provider retention settings.
- [x] Keep billing and website checkout disabled for the initial public release.
- [ ] Before any future paid launch, finish Cashfree production KYC, webhook,
  refund, cancellation, invoice, tax and physical-address configuration.

## Extension

- [ ] Bump the version in both `package.json` and `wxt.config.ts` for the release.
- [ ] Confirm Terms and Privacy links open from both popup and page UI.
- [ ] Confirm no editor/page data is read until disclosure acceptance.
- [ ] Test microphone allow, deny, revoke, silence, short speech and device loss.
- [ ] Test email login, Google login, token refresh, logout and password reset.
- [ ] Test all interview types, end-session flow and scorecard persistence.
- [ ] Test on signed-in and signed-out LeetCode sessions and current Chrome stable.
- [ ] Test 100%, 125% and 150% browser zoom and light/dark LeetCode themes.

## Chrome Web Store

- [ ] Register the publisher account, enable 2-Step Verification and verify its
  contact email.
- [ ] Complete the listing using `docs/CHROME_WEB_STORE_SUBMISSION.md`.
- [ ] Upload real 1280×800 extension screenshots and the 440×280 promotional tile.
- [ ] Add the public support, homepage and Privacy Policy URLs.
- [ ] Complete every data-use checkbox and permission justification accurately.
- [ ] Add a private reviewer account and test instructions.
- [ ] Disclose in-app purchases if paid plans are enabled.
- [ ] Publish first to trusted testers/private visibility, complete smoke testing,
  then switch to Public.

## Legal and operations

- [x] Disclose LeetAlly as an unincorporated product operated by an individual
  based in India.
- [ ] Add the operator's personal legal name where legally or dashboard-required.
- [ ] Add a stable service address before enabling purchases or identifying as a
  trader; do not publish a temporary or inaccurate address.
- [x] Confirm the monitored privacy/grievance, security and billing contact:
  `watershaper9.1@gmail.com`.
- [ ] Execute required data-processing agreements with production providers.
- [ ] Verify published retention periods against actual database, logs, backups and
  provider settings.
- [ ] Decide launch countries and obtain qualified legal/tax review for those
  countries before accepting payment there.
- [ ] Complete name/trademark clearance for LeetAlly.
- [ ] Prepare incident response, breach notification, support and rights-request
  procedures.
