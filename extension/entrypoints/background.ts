import { browser } from "wxt/browser";
import { supabase } from "../lib/supabase";

const websiteUrl = ((import.meta.env.VITE_WEBSITE_URL as string | undefined) || "https://leetally-web.vercel.app").replace(/\/$/, "");

async function saveSessionFromCallback(callbackUrl: string): Promise<void> {
  const callback = new URL(callbackUrl);
  const hash = new URLSearchParams(callback.hash.slice(1));
  const callbackError = callback.searchParams.get("error_description") ?? hash.get("error_description");
  if (callbackError) throw new Error(callbackError);

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
    return;
  }

  const code = callback.searchParams.get("code");
  if (!code) throw new Error("The login did not return a LeetAlly session.");
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}

async function completeWebsiteSignIn(interactive: boolean, provider?: "google"): Promise<void> {
  const redirectUri = browser.identity.getRedirectURL("auth/callback");
  const handoffUrl = new URL("/extension-auth", websiteUrl);
  handoffUrl.searchParams.set("redirect_uri", redirectUri);
  if (provider) handoffUrl.searchParams.set("provider", provider);
  const callbackUrl = await browser.identity.launchWebAuthFlow({ url: handoffUrl.toString(), interactive });
  if (!callbackUrl) throw new Error(interactive ? "Login was cancelled." : "No website session is available.");
  await saveSessionFromCallback(callbackUrl);
  await browser.runtime.sendMessage({ type: "LEETALLY_AUTH_REFRESH" }).catch(() => undefined);
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    const request = message as { type?: string; interactive?: boolean };
    if (request?.type === "LEETALLY_WEBSITE_SIGN_IN") {
      return completeWebsiteSignIn(request.interactive !== false)
        .then(() => ({ ok: true }))
        .catch((cause: unknown) => ({ ok: false, error: cause instanceof Error ? cause.message : "Website login failed." }));
    }
    if (request?.type !== "LEETALLY_GOOGLE_SIGN_IN") return undefined;
    return completeWebsiteSignIn(true, "google")
      .then(() => ({ ok: true }))
      .catch((cause: unknown) => ({ ok: false, error: cause instanceof Error ? cause.message : "Google sign-in failed." }));
  });
});
