// scripts/observe/format.ts
import type { AppEventRow, CronHealthRow } from "@/lib/admin/telemetryTypes";
import type { AlertRow, ChangeRow } from "@/lib/observe/query";

const trunc = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function formatEvents(rows: AppEventRow[], json: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map(
      (r) =>
        `${r.occurredAt}  ${r.level.padEnd(5)}  ${(r.code ?? "-").padEnd(24)}  ${r.source.padEnd(18)}  ${trunc(r.message)}`,
    )
    .join("\n");
}
export function formatEventLineNdjson(row: AppEventRow): string {
  return JSON.stringify(row) + "\n";
}
export function formatAlerts(rows: AlertRow[], json: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map(
      (r) =>
        `${r.raisedAt}  ${r.code.padEnd(28)}  ${(r.showTitle ?? r.showId ?? "-").padEnd(20)}  x${r.occurrenceCount}  ${r.resolvedAt ? "resolved" : "OPEN"}`,
    )
    .join("\n");
}
export function formatCron(rows: CronHealthRow[], json: boolean, nowMs: number): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map((r) => {
      const stale = r.lastRunAt ? nowMs - Date.parse(r.lastRunAt) > r.staleAfterMs : true;
      return `${r.jobName.padEnd(16)}  ${(r.outcome ?? "-").padEnd(8)}  ${(r.lastRunAt ?? "never").padEnd(26)}  ${stale ? "STALE" : "ok"}`;
    })
    .join("\n");
}
export function formatChanges(rows: ChangeRow[], json: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map(
      (r) =>
        `${r.occurredAt}  ${r.status.padEnd(10)}  ${r.changeKind.padEnd(16)}  ${r.showId.padEnd(20)}  ${trunc(r.summary)}`,
    )
    .join("\n");
}
