import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ToggleReadResult } from "@/lib/appSettings/getAlertOnSyncProblems";

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export async function getDailyReviewDigest(client?: Client): Promise<ToggleReadResult> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("daily_review_digest")
      .eq("id", "default")
      .maybeSingle();
    if (error) return { kind: "infra_error" };
    const value = (data as { daily_review_digest?: unknown } | null)?.daily_review_digest;
    return { kind: "value", enabled: value === true };
  } catch {
    return { kind: "infra_error" };
  }
}
