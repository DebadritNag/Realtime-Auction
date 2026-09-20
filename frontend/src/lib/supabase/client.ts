import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 * Safe to import in any "use client" component or service.
 * Uses NEXT_PUBLIC_ env vars — no secrets.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Singleton for use in services/stores (browser only). */
let _client: ReturnType<typeof createClient> | null = null;
export function getSupabaseClient() {
  if (typeof window === "undefined") {
    throw new Error("getSupabaseClient() must only be called in the browser.");
  }
  if (!_client) _client = createClient();
  return _client;
}
