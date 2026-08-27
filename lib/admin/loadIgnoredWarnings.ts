import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

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
      void log.error("ignored-warnings client construction failed", {
        source: "admin.loadIgnoredWarnings",
        code: "IGNORED_WARNINGS_CLIENT_THREW",
        error: err,
      });
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
    if (error) {
      void log.error("ignored_warnings read returned error", {
        source: "admin.loadIgnoredWarnings",
        code: "IGNORED_WARNINGS_READ_RETURNED_ERROR",
        error,
      });
      return { kind: "infra_error", message: `ignored_warnings query failed: ${error.message}` };
    }
    return { kind: "ok", fingerprints: new Set((data ?? []).map((r) => r.fingerprint as string)) };
  } catch (err) {
    void log.error("ignored_warnings read threw", {
      source: "admin.loadIgnoredWarnings",
      code: "IGNORED_WARNINGS_READ_THREW",
      error: err,
    });
    return {
      kind: "infra_error",
      message: `ignored_warnings query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
