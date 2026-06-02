import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export type HeartbeatWriteResult = { kind: "ok" } | { kind: "infra_error" };

export async function writeSyncCronHeartbeat(client?: Client): Promise<HeartbeatWriteResult> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .update({ sync_cron_heartbeat_at: new Date().toISOString() })
      .eq("id", "default")
      .select("id");
    if (error) return { kind: "infra_error" };
    if (!data || data.length === 0) return { kind: "infra_error" };
    return { kind: "ok" };
  } catch {
    return { kind: "infra_error" };
  }
}
