import { createClient } from "@supabase/supabase-js";
import { browser } from "wxt/browser";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("VITE_SUPABASE_URL is missing");
}

if (!supabaseAnonKey) {
  throw new Error("VITE_SUPABASE_ANON_KEY is missing");
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "implicit",
      storage: {
        async getItem(key: string) {
          return ((await browser.storage.local.get(key))[key] as string | undefined) ?? null;
        },
        async setItem(key: string, value: string) {
          await browser.storage.local.set({ [key]: value });
        },
        async removeItem(key: string) {
          await browser.storage.local.remove(key);
        },
      },
    },
  },
);
