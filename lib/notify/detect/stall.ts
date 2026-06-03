import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { resolveAdminAlert } from "@/lib/adminAlerts/resolveAdminAlert";
import { STALENESS_THRESHOLD_MS } from "@/lib/notify/constants";

export type MaintenanceResult = { kind: "ok" } | { kind: "infra_error" };

export async function detectAndResolveStall(
  heartbeat: Date | null,
  now: Date,
): Promise<MaintenanceResult> {
  const stale = !heartbeat || now.getTime() - heartbeat.getTime() > STALENESS_THRESHOLD_MS;

  try {
    if (stale) {
      await upsertAdminAlert({ showId: null, code: "SYNC_STALLED", context: {} });
    } else {
      await resolveAdminAlert({ showId: null, code: "SYNC_STALLED" });
    }
    return { kind: "ok" };
  } catch {
    return { kind: "infra_error" };
  }
}
