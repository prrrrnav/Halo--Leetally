# LeetAlly website

Public marketing and account website for LeetAlly, built with React, Vite and Supabase.

## Local development

1. Copy `.env.example` to `.env` and fill in the public environment values.
2. Run `pnpm install`.
3. Run `pnpm dev`.

Keep `VITE_EXTENSION_URL=/contact` while the extension is distributed as an unpacked development build. Replace it with the public Chrome Web Store listing URL after publication. A `chrome-extension://` URL or the ID shown on `chrome://extensions` cannot install the extension for another user.

## Supabase

Apply `../supabase/migrations/0005_website_forms.sql` to create the contact and feedback tables. The browser receives insert-only access; submissions cannot be listed, changed or deleted through the public API.

For authentication, enable Email and Google in Supabase Auth and add the production `/login` URL to the allowed redirect URLs.

## Vercel

Import the repository, set the Root Directory to `website`, and add every variable from `.env.example`. Vercel uses `vercel.json` to serve SPA routes correctly.
