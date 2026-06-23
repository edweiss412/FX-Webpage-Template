import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { AppSettingsRow } from "@/lib/onboarding/sessionLifecycle";

type Result = { kind: "value"; settings: AppSettingsRow } | { kind: "infra_error" };

// Single full-row read of the app_settings singleton so a caller can decide
// whether to invoke the heavier purgeAndRotateIfStale postgres.js tx.
export async function readAppSettingsRow(
  client?: ReturnType<typeof createSupabaseServiceRoleClient>,
): Promise<Result> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return { kind: "infra_error" };
    return { kind: "value", settings: data as AppSettingsRow };
  } catch {
    return { kind: "infra_error" };
  }
}
