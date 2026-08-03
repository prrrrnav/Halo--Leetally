import { browser } from "wxt/browser";
import { supabase } from "../lib/supabase";

async function completeGoogleSignIn(): Promise<void> {
  const redirectTo = browser.identity.getRedirectURL("auth/callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Supabase did not return a Google authorization URL.");

  const callbackUrl = await browser.identity.launchWebAuthFlow({ url: data.url, interactive: true });
  if (!callbackUrl) throw new Error("Google sign-in was cancelled.");
  const callback = new URL(callbackUrl);
  const hash = new URLSearchParams(callback.hash.slice(1));
  const callbackError = callback.searchParams.get("error_description") ?? hash.get("error_description");
  if (callbackError) throw new Error(callbackError);

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (sessionError) throw sessionError;
  } else {
    const code = callback.searchParams.get("code");
    if (!code) throw new Error("Google returned no Supabase session.");
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }

  await browser.runtime.sendMessage({ type: "LEETALLY_AUTH_REFRESH" }).catch(() => undefined);
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if ((message as { type?: string })?.type !== "LEETALLY_GOOGLE_SIGN_IN") return undefined;
    return completeGoogleSignIn()
      .then(() => ({ ok: true }))
      .catch((cause: unknown) => ({ ok: false, error: cause instanceof Error ? cause.message : "Google sign-in failed." }));
  });
});
