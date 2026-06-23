import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

type Result =
  | {
      kind: "value";
      autoPublishCleanFirstSeen: boolean;
      alertOnSyncProblems: boolean;
      dailyReviewDigest: boolean;
      alertOnAutoPublish: boolean;
    }
  | { kind: "infra_error" };

// Single 4-column read of the app_settings singleton so the settings page can
// derive all four toggle initials from one round-trip (A3). Each flag is
// FAIL-CLOSED via a literal `=== true` check — matching the existing single
// getters (getAutoPublishCleanFirstSeen / getAlertOnSyncProblems): a missing,
// null, or truthy-non-boolean value ('false'/'true'/1/'yes') never enables a
// toggle. Returned error / missing row / thrown fault → typed infra_error.
export async function getSettingsPageFlags(client?: Client): Promise<Result> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select(
        "auto_publish_clean_first_seen, alert_on_sync_problems, daily_review_digest, alert_on_auto_publish",
      )
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return { kind: "infra_error" };
    const row = data as {
      auto_publish_clean_first_seen?: unknown;
      alert_on_sync_problems?: unknown;
      daily_review_digest?: unknown;
      alert_on_auto_publish?: unknown;
    };
    return {
      kind: "value",
      autoPublishCleanFirstSeen: row.auto_publish_clean_first_seen === true,
      alertOnSyncProblems: row.alert_on_sync_problems === true,
      dailyReviewDigest: row.daily_review_digest === true,
      alertOnAutoPublish: row.alert_on_auto_publish === true,
    };
  } catch {
    return { kind: "infra_error" };
  }
}
