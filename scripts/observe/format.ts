// scripts/observe/format.ts
import type { AppEventRow, CronHealthRow } from "@/lib/admin/telemetryTypes";
import type {
  AlertRow,
  ChangeRow,
  StagedRow,
  FailureRow,
  PublishedWarningsRow,
  SyncLogRow,
  DeferredRow,
  WatchRow,
} from "@/lib/observe/query";
import { describeAlert } from "@/lib/adminAlerts/describeAlert";

const trunc = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// Class-D display helper: shared by formatStaged + formatFailures — a raw
// class-D code that failed the emitClassDCode allowlist renders as
// UNKNOWN_CODE rather than an empty cell, so an operator can tell "no code"
// apart from "unrecognized code" at a glance.
const codeCell = (code: string, unrecognized: boolean) =>
  unrecognized ? "UNKNOWN_CODE" : code || "-";

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
    .map((r) => {
      const base = `${r.raisedAt}  ${r.code.padEnd(28)}  ${(r.showTitle ?? r.showId ?? "-").padEnd(20)}  x${r.occurrenceCount}  ${r.resolvedAt ? "resolved" : "OPEN"}`;
      // Render with includePii:true UNCONDITIONALLY — the read-core already gated
      // which segments are present (Codex P9); re-gating here would double-drop
      // an already-revealed email.
      const idLine = describeAlert(r.identity, { includePii: true });
      return idLine ? `${base}\n    ${idLine}` : base;
    })
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
export function formatStaged(rows: StagedRow[], json: boolean, full: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map((r) => {
      const base = `${r.parsedAt}  ${r.driveFileId.padEnd(44)}  ${r.sourceKind.padEnd(15)}  ${r.wizardApproved ? "approved" : "pending "}  w:${r.warnings.length}  ${codeCell(r.lastFinalizeFailureCode, r.lastFinalizeFailureCodeUnrecognized).padEnd(28)}  ${trunc(r.warningSummary, 60)}`;
      if (!full || r.warnings.length === 0) return base;
      const warningLines = r.warnings
        .map((w) => `    ${w.severity.padEnd(5)}  ${w.code.padEnd(28)}  ${trunc(w.message)}`)
        .join("\n");
      return `${base}\n${warningLines}`;
    })
    .join("\n");
}
export function formatFailures(rows: FailureRow[], json: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map(
      (r) =>
        `${r.lastAttemptAt}  ${r.driveFileId.padEnd(44)}  x${r.attemptCount}  ${codeCell(r.lastErrorCode, r.lastErrorCodeUnrecognized).padEnd(28)}  ${trunc(r.driveFileName, 60)}`,
    )
    .join("\n");
}
export function formatPublishedWarnings(rows: PublishedWarningsRow[], json: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map((r) => {
      const header = `${r.showTitle ?? r.showSlug ?? r.showId}  ${r.warnings.length}`;
      const warningLines = r.warnings
        .map((w) => `    ${w.severity.padEnd(5)}  ${w.code.padEnd(28)}  ${trunc(w.message)}`)
        .join("\n");
      return warningLines ? `${header}\n${warningLines}` : header;
    })
    .join("\n");
}
export function formatSyncLog(rows: SyncLogRow[], json: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map(
      (r) =>
        `${r.occurredAt}  ${(r.driveFileId ?? "-").padEnd(44)}  ${r.status.padEnd(10)}  w:${r.warningCount}  ${String(r.durationMs ?? "-").padEnd(8)}  ${trunc(r.message)}`,
    )
    .join("\n");
}
export function formatDeferred(rows: DeferredRow[], json: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map(
      (r) =>
        `${r.deferredAt}  ${r.driveFileId.padEnd(44)}  ${r.deferredKind.padEnd(16)}  ${trunc(r.reason)}`,
    )
    .join("\n");
}
export function formatWatch(rows: WatchRow[], json: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map(
      (r) =>
        `${r.status.padEnd(10)}  ${r.id.padEnd(36)}  ${r.watchedFolderId.padEnd(44)}  ${r.expiresAt ?? "-"}  ${r.createdAt}`,
    )
    .join("\n");
}
