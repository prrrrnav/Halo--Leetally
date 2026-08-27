import { browser } from "wxt/browser";
import { supabase } from "./supabase";

export const POLICY_VERSION = "2026-08-17";
const WEBSITE_URL = ((import.meta.env.VITE_WEBSITE_URL as string | undefined) || "https://leetally-web.vercel.app").replace(/\/$/, "");

export function googleOAuthRedirectUrl(): string {
  return browser.identity.getRedirectURL("auth/callback");
}

export async function signInWithGoogle(): Promise<void> {
  const response = await browser.runtime.sendMessage({ type: "LEETALLY_GOOGLE_SIGN_IN" }) as { ok: boolean; error?: string } | undefined;
  if (!response?.ok) throw new Error(response?.error ?? "Google sign-in did not complete.");
}

export async function syncWebsiteSession(interactive = true): Promise<boolean> {
  const response = await browser.runtime.sendMessage({ type: "LEETALLY_WEBSITE_SIGN_IN", interactive }) as { ok: boolean; error?: string } | undefined;
  if (response?.ok) return true;
  if (interactive) throw new Error(response?.error ?? "Website login did not complete.");
  return false;
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
  if (!data.session && data.user && data.user.identities?.length === 0) {
    throw new Error("An account with this email already exists. Sign in instead.");
  }
  return !data.session;
}

export async function signOutOfExtension(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
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
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${WEBSITE_URL}/login?recovery=1`,
  });
  if (error) throw error;
}
