import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Flow 6.2 §4.2 — the monitor-digest watermark. `app_settings.last_monitor_digest_sent_at`
 * defines the "since last digest" window; it is advanced once per run after a successful
 * monitor-bearing send (§4.4). Mirrors lib/appSettings/getDailyReviewDigest.ts (read) and
 * lib/appSettings/writeSyncCronHeartbeat.ts (write): service-role, { data, error } destructure,
 * returned-vs-thrown distinguished, typed infra_error (invariant 9). Registered in
 * tests/notify/_metaInfraContract.test.ts.
 */
type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export type WatermarkReadResult =
  | { kind: "value"; watermark: Date | null }
  | { kind: "infra_error" };
export type WatermarkWriteResult = { kind: "ok" } | { kind: "infra_error" };

export async function getMonitorDigestWatermark(client?: Client): Promise<WatermarkReadResult> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("last_monitor_digest_sent_at")
      .eq("id", "default")
      .maybeSingle();
    if (error) return { kind: "infra_error" };
    const raw = (data as { last_monitor_digest_sent_at?: string | null } | null)
      ?.last_monitor_digest_sent_at;
    return { kind: "value", watermark: raw ? new Date(raw) : null };
  } catch {
    return { kind: "infra_error" };
  }
}

export async function writeMonitorDigestWatermark(
  when: Date,
  client?: Client,
): Promise<WatermarkWriteResult> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .update({ last_monitor_digest_sent_at: when.toISOString() })
      .eq("id", "default")
      .select("id");
    if (error) return { kind: "infra_error" };
    if (!data || data.length === 0) return { kind: "infra_error" };
    return { kind: "ok" };
  } catch {
    return { kind: "infra_error" };
  }
}
