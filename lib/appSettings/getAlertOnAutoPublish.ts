import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export type ToggleReadResult = { kind: "value"; enabled: boolean } | { kind: "infra_error" };

export async function getAlertOnAutoPublish(client?: Client): Promise<ToggleReadResult> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("alert_on_auto_publish")
      .eq("id", "default")
      .maybeSingle();
    if (error) return { kind: "infra_error" };
    const value = (data as { alert_on_auto_publish?: unknown } | null)?.alert_on_auto_publish;
    return { kind: "value", enabled: value === true };
  } catch {
    return { kind: "infra_error" };
  }
}
