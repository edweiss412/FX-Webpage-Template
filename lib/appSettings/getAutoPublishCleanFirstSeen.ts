import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type AppSettingsSupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

/**
 * Fail-closed read of the auto-publish-clean-first-seen toggle (app_settings singleton id='default').
 * - error reading the row → `infra_error` (NOT fail-open true): the caller must NOT auto-publish this pass.
 * - missing row / non-boolean value → `{ value, autoPublish: false }` (fail closed → stage for approval).
 * - column true → `{ value, autoPublish: true }`.
 * Registered in tests/sync/_metaInfraContract.test.ts (Supabase call-boundary discipline, invariant 9).
 */
export type AutoPublishCleanFirstSeenResult =
  | { kind: "value"; autoPublish: boolean }
  | { kind: "infra_error" };

export async function getAutoPublishCleanFirstSeen(
  client?: AppSettingsSupabaseClient,
): Promise<AutoPublishCleanFirstSeenResult> {
  // not-subject-to-meta: fail-closed on BOTH paths — a returned `error` yields `infra_error` (handled
  // by the caller as "do not auto-publish this pass"), and a thrown construction/await error propagates
  // up the sync pipeline (retried, still no auto-publish). It deliberately does NOT coerce thrown faults
  // into a returned `infra_error`, so it is not the 3-path returned-result contract the infraRegistry pins.
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
}
