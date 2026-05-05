/**
 * lib/supabase/browser.ts (M4 Task 4.16 Checkpoint B)
 *
 * Browser-side Supabase client factory used by the `<ShowRealtimeBridge>`
 * client island for Realtime Broadcast subscriptions.
 *
 * Why a separate factory?
 *   - lib/supabase/server.ts uses next/headers cookies, which is ONLY
 *     valid inside a Server Component / route handler. A browser-side
 *     import of that module would crash with "next/headers is only
 *     available on the server".
 *   - The bridge runs in the browser and only needs Realtime auth +
 *     channel methods — no cookie access, no auth-state subscriptions.
 *     A minimal `createBrowserClient` bound to the public anon key is
 *     correct: the JWT minted by /api/realtime/subscriber-token is
 *     applied via `supabase.realtime.setAuth(jwt)` BEFORE channel open.
 *
 * The anon key is intentionally NOT used to authenticate the channel
 * subscription itself — the subscriber-token JWT handles that. The anon
 * key is only the bootstrap credential for the realtime client to
 * negotiate the websocket connection.
 *
 * Singleton pattern: the bridge mounts at most once per page; a single
 * shared browser client across multiple bridge mounts (e.g. during
 * Fast Refresh in dev) avoids leaking duplicate websocket connections.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "";
  if (!url || !publishableKey) {
    throw new Error(
      "getSupabaseBrowserClient: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set",
    );
  }
  cachedClient = createBrowserClient(url, publishableKey);
  return cachedClient;
}
