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
        // `error`, not `error.message`: serializeError captures the returned
        // error's own code/details/hint (lib/log/logger.ts:38), which is strictly
        // more than the message the flattened form kept.
        error,
      });
      return FAIL;
    }
    const row = Array.isArray(data) ? data[0] : undefined;
    if (!row) {
      void log.error("admin_alert_summary malformed row", {
        source: "admin.telemetry.alertSummary",
        // A successful RPC that returned unusable data is NOT a returned error.
        // Sharing the RETURNED_ERROR code conflated two faults an operator has to
        // tell apart: one means the read failed, this one means the read
        // succeeded and the shape was wrong.
        code: "ALERT_SUMMARY_MALFORMED_ROW",
        // A data-integrity fault has no error object, so the evidence IS the
        // payload: what came back instead of a row.
        error: { received: data },
      });
      return FAIL;
    }
    const total = toCount(row.total),
      degraded = toCount(row.degraded);
    if (!isNonNegInt(total) || !isNonNegInt(degraded) || degraded > total) {
      void log.error("admin_alert_summary malformed row", {
        source: "admin.telemetry.alertSummary",
        code: "ALERT_SUMMARY_MALFORMED_ROW",
        error: { total, degraded },
      });
      return FAIL;
    }
    if (total === 0) return { kind: "ok", degraded: 0, notice: 0, total: 0 };
    const notice = total - degraded;
    return { kind: degraded > 0 ? "degraded" : "notice", degraded, notice, total };
  } catch (err) {
    void log.error("admin_alert_summary threw", {
      source: "admin.telemetry.alertSummary",
      code: "ALERT_SUMMARY_READ_THREW",
      // Same reason as the returned-error branch above: the code says a read failed, the message
      // says WHICH fault it was. A thrown 502 and a thrown type error were indistinguishable here.
      error: err,
    });
    return FAIL;
  }
}
