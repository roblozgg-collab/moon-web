"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

// Public browser credentials. Environment variables override these values, but the
// publishable fallback keeps the production GitHub Pages build connected even if
// dot-env files were not committed. Never place a service_role/secret key here.
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lxisyqachdbwymmlwkgo.supabase.co").trim();
const SUPABASE_PUBLISHABLE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_mZzhJ4oFb7narRGoH7FqsQ_l77msmUA").trim();

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (browserClient) return browserClient;

  browserClient = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: { eventsPerSecond: 20 },
      },
    },
  );
  return browserClient;
}
