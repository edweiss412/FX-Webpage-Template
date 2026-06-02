import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type AppSettingsSupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

/**
 * Fail-closed read of the auto-publish-clean-first-seen toggle (app_settings singleton id='default').
 * - returned error OR a THROWN client-construction/query fault → `infra_error` (NOT fail-open true).
 * - missing row / non-boolean value → `{ value, autoPublish: false }` (fail closed → stage for approval).
 * - column true → `{ value, autoPublish: true }`.
 *
 * R8: this is the full 3-path returned-result contract (AGENTS.md invariant 9) — it NEVER throws to its
 * callers. Both callers depend on that: the sync pipeline (lib/sync/phase1.ts:308-318) converts a
 * returned `infra_error` into a Phase1InfraError (retry, still no auto-publish), and the settings page
 * (app/admin/settings/page.tsx) renders the DEGRADED toggle on `infra_error`. Before R8 the helper let a
 * thrown construction/network fault escape, which tore down the whole settings page (500) instead of the
 * documented degraded control. Pinned by behavioral throwOnConstruct/throwOnFrom regressions in
 * tests/sync/_metaInfraContract.test.ts.
 */
export type AutoPublishCleanFirstSeenResult =
  | { kind: "value"; autoPublish: boolean }
  | { kind: "infra_error" };

export async function getAutoPublishCleanFirstSeen(
  client?: AppSettingsSupabaseClient,
): Promise<AutoPublishCleanFirstSeenResult> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("auto_publish_clean_first_seen")
      .eq("id", "default")
      .maybeSingle();
    if (error) {
      return { kind: "infra_error" };
    }
    const value = (data as { auto_publish_clean_first_seen?: unknown } | null)
      ?.auto_publish_clean_first_seen;
    return { kind: "value", autoPublish: value === true };
  } catch {
    // Thrown construction/query/network fault → typed infra_error (never propagate to UI callers).
    return { kind: "infra_error" };
  }
}
