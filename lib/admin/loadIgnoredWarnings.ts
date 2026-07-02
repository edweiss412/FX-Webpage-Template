import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoadIgnoredWarningsResult =
  | { kind: "ok"; fingerprints: Set<string> }
  | { kind: "infra_error"; message: string };

/**
 * Reads the show's ignored-warning fingerprints via the RLS session client (admin-gated
 * by the ignored_warnings admin_only policy). Invariant-9 discipline: construction throw,
 * query throw, and returned {error} each resolve to a typed infra_error with a descriptive
 * message. The caller treats infra_error as an EMPTY ignore set (warnings stay visible).
 * Registered in tests/admin/_metaInfraContract.test.ts.
 */
export async function loadIgnoredWarnings(
  showId: string,
  opts?: { supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>> },
): Promise<LoadIgnoredWarningsResult> {
  let supabase = opts?.supabase;
  if (!supabase) {
    try {
      supabase = await createSupabaseServerClient();
    } catch (err) {
      return {
        kind: "infra_error",
        message: `supabase client construction failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  try {
    const { data, error } = await supabase
      .from("ignored_warnings")
      .select("fingerprint")
      .eq("show_id", showId);
    if (error) return { kind: "infra_error", message: `ignored_warnings query failed: ${error.message}` };
    return { kind: "ok", fingerprints: new Set((data ?? []).map((r) => r.fingerprint as string)) };
  } catch (err) {
    return {
      kind: "infra_error",
      message: `ignored_warnings query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
