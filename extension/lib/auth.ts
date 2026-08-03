import { browser } from "wxt/browser";
import { supabase } from "./supabase";

export const POLICY_VERSION = "2026-08-03";

export function googleOAuthRedirectUrl(): string {
  return browser.identity.getRedirectURL("auth/callback");
}

export async function signInWithGoogle(): Promise<void> {
  const response = await browser.runtime.sendMessage({ type: "LEETALLY_GOOGLE_SIGN_IN" }) as { ok: boolean; error?: string } | undefined;
  if (!response?.ok) throw new Error(response?.error ?? "Google sign-in did not complete.");
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
}

export async function signUpWithEmail(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        policy_version: POLICY_VERSION,
        policy_accepted_at: new Date().toISOString(),
      },
    },
  });
  if (error) throw error;
  return !data.session;
}

export async function recordPolicyAcceptance(): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: {
      policy_version: POLICY_VERSION,
      policy_accepted_at: new Date().toISOString(),
    },
  });
  if (error) throw error;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}
