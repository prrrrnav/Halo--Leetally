export type AuthCallbackResult =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "code"; code: string };

export function parseAuthCallback(callbackUrl: string): AuthCallbackResult {
  const callback = new URL(callbackUrl);
  const hash = new URLSearchParams(callback.hash.slice(1));
  const callbackError =
    callback.searchParams.get("error_description") ??
    hash.get("error_description") ??
    callback.searchParams.get("error") ??
    hash.get("error");
  if (callbackError) throw new Error(callbackError);

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "tokens", accessToken, refreshToken };
  }

  const code = callback.searchParams.get("code");
  if (code) return { kind: "code", code };

  throw new Error("The login did not return a LeetAlly session.");
}
