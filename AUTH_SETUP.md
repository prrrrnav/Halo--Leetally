# LeetAlly authentication setup

The code uses Supabase Auth for both Google and email/password accounts. The
Supabase user UUID is also the owner key for cloud progress and Cashfree
entitlements.

## 1. Apply the database migration

Apply the repository migrations through
`supabase/migrations/0009_auth_signup_reliability.sql` in the Supabase SQL
Editor. This production project has previously had schema changes without a
matching remote migration history, so do not run `supabase db push` until that
history has been explicitly reconciled. The migrations create the private
progress tables, row-level-security policies, and reliable Auth profile trigger.

## 2. Get the Chrome OAuth callback

1. Build and load `extension/.output/chrome-mv3` as an unpacked extension.
2. Open `chrome://extensions`, enable Developer mode, and copy the LeetAlly ID.
3. Build this callback URL with that ID:

   `https://EXTENSION_ID.chromiumapp.org/auth/callback`

Keep the extension ID stable in production by using the Chrome Web Store build
or a fixed manifest key for development.

## 3. Configure Supabase URLs

In Supabase Dashboard -> Authentication -> URL Configuration:

- Set Site URL to your public landing page. Until that exists, a temporary URL
  such as `https://leetcode.com/` is sufficient for email-confirmation links.
- Add the Chromium callback from step 2 to Redirect URLs.
- Add the callback for every development extension ID that you actively use.

## 4. Enable Google login

1. In Google Cloud Console, configure the OAuth consent screen.
2. Create an OAuth 2.0 Client ID of type **Web application**.
3. Add this authorized redirect URI (use your real Supabase project reference):

   `https://PROJECT_REF.supabase.co/auth/v1/callback`

4. In Supabase Dashboard -> Authentication -> Providers -> Google, enable
   Google and paste the Google client ID and client secret.

The Google client secret belongs only in Supabase. Never place it in the
extension or a `VITE_` environment variable.

The extension starts the Supabase Google authorization URL directly with
`chrome.identity.launchWebAuthFlow`. After Google redirects to the Chromium
callback from step 2, Chrome closes the auth window and the extension stores the
returned Supabase session. The public website is not part of this Google-login
round trip.

## 5. Enable email/password

In Supabase Dashboard -> Authentication -> Providers -> Email:

- Enable email/password signups.
- Keep **Confirm email** enabled for production.
- Set minimum password length to at least 8 characters.
- Enable CAPTCHA before a public launch.

Supabase's built-in sender is for testing and is heavily restricted. For
production, connect Resend:

1. Create a Resend account and verify a sending domain, preferably
   `auth.yourdomain.com`.
2. Create a Resend API key.
3. In Supabase Dashboard -> Authentication -> Email -> SMTP Settings use:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
   - Sender: for example `LeetAlly <no-reply@auth.yourdomain.com>`
4. Customize confirmation and password-reset templates in Supabase.
5. Disable click tracking for authentication emails and configure SPF, DKIM,
   and DMARC for the sending domain.

## 6. Production checks

- Keep only the Supabase URL and anon/publishable key in `extension/.env`.
- Keep service-role, Google client secret, Resend key, and Cashfree secrets on
  trusted services only.
- Apply migrations `0001_initial.sql` through
  `0009_auth_signup_reliability.sql` to the same Supabase project.
- Restart FastAPI, rebuild the extension, reload it in Chrome, and refresh the
  open LeetCode tab.
- Test Google login, email confirmation, email login, password reset, logout,
  cloud progress on a second browser profile, and account-specific billing.
