import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { isNonNegInt, toCount } from "./telemetryNum";
import type { LoadTelemetryStatsResult } from "./telemetryTypes";

const FAIL = { kind: "infra_error", message: "telemetry stats read failed" } as const;

export async function loadTelemetryStats(now: Date): Promise<LoadTelemetryStatsResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase.rpc("admin_event_stats_24h", {
      _now: now.toISOString(),
    });
    if (error) {
      void log.error("admin_event_stats_24h returned error", {
        source: "admin.telemetry.stats",
        code: "TELEMETRY_STATS_READ_RETURNED_ERROR",
      });
      return FAIL;
    }
    const row = Array.isArray(data) ? data[0] : undefined;
    if (!row) {
      void log.error("admin_event_stats_24h malformed row", {
        source: "admin.telemetry.stats",
        code: "TELEMETRY_STATS_READ_RETURNED_ERROR",
      });
      return FAIL;
    }
    const total = toCount(row.total),
      errorCount = toCount(row.error_count);
    const warnCount = toCount(row.warn_count),
      infoCount = toCount(row.info_count);
    const buckets = Array.isArray(row.buckets) ? row.buckets.map(toCount) : null;
    if (
      !isNonNegInt(total) ||
      !isNonNegInt(errorCount) ||
      !isNonNegInt(warnCount) ||
      !isNonNegInt(infoCount) ||
      buckets === null ||
      buckets.length !== 24 ||
      !buckets.every(isNonNegInt)
    ) {
      void log.error("admin_event_stats_24h malformed row", {
        source: "admin.telemetry.stats",
        code: "TELEMETRY_STATS_READ_RETURNED_ERROR",
      });
      return FAIL;
    }
    return { kind: "ok", stats: { total, errorCount, warnCount, infoCount, buckets } };
  } catch {
    void log.error("admin_event_stats_24h threw", {
      source: "admin.telemetry.stats",
      code: "TELEMETRY_STATS_READ_THREW",
    });
    return FAIL;
  }
}
