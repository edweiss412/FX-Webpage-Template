import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export type ToggleReadResult = { kind: "value"; enabled: boolean } | { kind: "infra_error" };

export async function getAlertOnSyncProblems(client?: Client): Promise<ToggleReadResult> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("alert_on_sync_problems")
      .eq("id", "default")
      .maybeSingle();
    if (error) return { kind: "infra_error" };
    const value = (data as { alert_on_sync_problems?: unknown } | null)?.alert_on_sync_problems;
    return { kind: "value", enabled: value === true };
  } catch {
    return { kind: "infra_error" };
  }
}
