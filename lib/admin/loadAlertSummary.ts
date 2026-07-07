import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { HEALTH_CODES, DEGRADED_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { isNonNegInt, toCount } from "./telemetryNum";
import type { AlertSummary } from "./telemetryTypes";

const FAIL = { kind: "infra_error" } as const;

export async function loadAlertSummary(): Promise<AlertSummary> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase.rpc("admin_alert_summary", {
      _health_codes: HEALTH_CODES,
      _degraded_codes: DEGRADED_HEALTH_CODES,
    });
    if (error) {
      void log.error("admin_alert_summary returned error", {
        source: "admin.telemetry.alertSummary",
        code: "ALERT_SUMMARY_READ_RETURNED_ERROR",
      });
      return FAIL;
    }
    const row = Array.isArray(data) ? data[0] : undefined;
    if (!row) {
      void log.error("admin_alert_summary malformed row", {
        source: "admin.telemetry.alertSummary",
        code: "ALERT_SUMMARY_READ_RETURNED_ERROR",
      });
      return FAIL;
    }
    const total = toCount(row.total),
      degraded = toCount(row.degraded);
    if (!isNonNegInt(total) || !isNonNegInt(degraded) || degraded > total) {
      void log.error("admin_alert_summary malformed row", {
        source: "admin.telemetry.alertSummary",
        code: "ALERT_SUMMARY_READ_RETURNED_ERROR",
      });
      return FAIL;
    }
    if (total === 0) return { kind: "ok", degraded: 0, notice: 0, total: 0 };
    const notice = total - degraded;
    return { kind: degraded > 0 ? "degraded" : "notice", degraded, notice, total };
  } catch {
    void log.error("admin_alert_summary threw", {
      source: "admin.telemetry.alertSummary",
      code: "ALERT_SUMMARY_READ_THREW",
    });
    return FAIL;
  }
}
