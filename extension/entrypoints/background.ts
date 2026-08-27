import { browser } from "wxt/browser";
import { parseAuthCallback } from "../lib/auth-callback";
import { supabase } from "../lib/supabase";

const websiteUrl = ((import.meta.env.VITE_WEBSITE_URL as string | undefined) || "https://leetally-web.vercel.app").replace(/\/$/, "");

async function saveSessionFromCallback(callbackUrl: string): Promise<void> {
  const result = parseAuthCallback(callbackUrl);
  if (result.kind === "tokens") {
    const { error } = await supabase.auth.setSession({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    });
    if (error) throw error;
    return;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(result.code);
  if (error) throw error;
}

async function completeGoogleSignIn(): Promise<void> {
  const redirectUri = browser.identity.getRedirectURL("auth/callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Google sign-in could not be started.");

  const callbackUrl = await browser.identity.launchWebAuthFlow({
    url: data.url,
    interactive: true,
  });
  if (!callbackUrl) throw new Error("Google sign-in was cancelled.");
  await saveSessionFromCallback(callbackUrl);
}

async function completeWebsiteSignIn(interactive: boolean): Promise<void> {
  const redirectUri = browser.identity.getRedirectURL("auth/callback");
  const handoffUrl = new URL("/extension-auth", websiteUrl);
  handoffUrl.searchParams.set("redirect_uri", redirectUri);
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
    return completeGoogleSignIn()
      .then(async () => {
        await browser.runtime.sendMessage({ type: "LEETALLY_AUTH_REFRESH" }).catch(() => undefined);
        return { ok: true };
      })
      .catch((cause: unknown) => ({ ok: false, error: cause instanceof Error ? cause.message : "Google sign-in failed." }));
  });
});
