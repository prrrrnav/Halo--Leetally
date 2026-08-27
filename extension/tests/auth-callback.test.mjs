import assert from "node:assert/strict";
import test from "node:test";
import { parseAuthCallback } from "../lib/auth-callback.ts";

test("parses implicit OAuth tokens from the Chrome callback hash", () => {
  assert.deepEqual(
    parseAuthCallback("https://extension.chromiumapp.org/auth/callback#access_token=access&refresh_token=refresh"),
    { kind: "tokens", accessToken: "access", refreshToken: "refresh" },
  );
});

test("parses a PKCE authorization code", () => {
  assert.deepEqual(
    parseAuthCallback("https://extension.chromiumapp.org/auth/callback?code=authorization-code"),
    { kind: "code", code: "authorization-code" },
  );
});

test("surfaces provider errors", () => {
  assert.throws(
    () => parseAuthCallback("https://extension.chromiumapp.org/auth/callback?error_description=Access%20denied"),
    /Access denied/,
  );
});

test("rejects callbacks without a session", () => {
  assert.throws(
    () => parseAuthCallback("https://extension.chromiumapp.org/auth/callback"),
    /did not return a LeetAlly session/,
  );
});
