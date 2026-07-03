import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { codeProducerLiterals } from "@/lib/messages/__internal__/codeProducers";

// Registry-walk structural guard for the durable admin-mutation audit trail.
// Every registered mutation route MUST emit a logAdminOutcome with its outcome
// code; applyStaged's typed infra_error path MUST log; and the outcome codes MUST
// stay OUT of the §12.4 producer set (they are forensic app_events codes). This is
// the single source of truth for the sanctioned outcome codes.
// Non-tautology is proven by the negative-regression step in the plan (Task 14.7).

const AUDITABLE_MUTATIONS: ReadonlyArray<{ file: string; code: string }> = [
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts",
    code: "STAGE_APPLIED",
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts",
    code: "STAGE_APPROVED",
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts",
    code: "STAGE_UNAPPROVED",
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts",
    code: "STAGE_DISCARDED",
  },
  { file: "app/api/admin/onboarding/finalize/route.ts", code: "SHOW_FINALIZED" },
  { file: "app/api/admin/onboarding/finalize-cas/route.ts", code: "SHOW_FINALIZED" },
  // Carve-out (2026-07-02): live-show mutation telemetry.
  { file: "app/api/admin/staged/[fileId]/apply/route.ts", code: "SHOW_APPLIED" },
  { file: "app/api/admin/show/staged/[stagedId]/apply/route.ts", code: "SHOW_APPLIED" },
  { file: "app/api/admin/sync/[slug]/route.ts", code: "SHOW_SYNCED_MANUAL" },
  {
    file: "app/api/admin/pending-ingestions/[id]/retry/route.ts",
    code: "PENDING_INGESTION_RETRIED",
  },
  {
    file: "app/api/admin/snapshot-rollback/[id]/repair/route.ts",
    code: "SNAPSHOT_ROLLBACK_REPAIRED",
  },
  // Completion (2026-07-02): publish/archive/unpublish lifecycle telemetry.
  { file: "app/admin/show/[slug]/_actions/publish.ts", code: "SHOW_PUBLISHED" },
  { file: "app/admin/show/[slug]/_actions/archive.ts", code: "SHOW_ARCHIVED" },
  { file: "app/admin/show/[slug]/_actions/unarchive.ts", code: "SHOW_UNARCHIVED_BY_ADMIN" },
  { file: "app/admin/show/[slug]/_actions/undoAutoPublish.ts", code: "SHOW_UNPUBLISHED_BY_ADMIN" },
  // DQIGNORE-4 (2026-07-02): data-quality warning ignore/un-ignore forensic trace.
  { file: "app/api/admin/show/[slug]/data-quality/ignore/route.ts", code: "WARNING_IGNORED" },
  { file: "app/api/admin/show/[slug]/data-quality/unignore/route.ts", code: "WARNING_UNIGNORED" },
  // Observability PR-2 (2026-07-03): silent-surface instrumentation.
  {
    file: "app/api/show/[slug]/unpublish/route.ts",
    code: "SHOW_UNPUBLISHED_VIA_EMAILED_LINK",
  },
  {
    file: "app/api/admin/admin-alerts/[id]/resolve/route.ts",
    code: "ADMIN_ALERT_RESOLVED",
  },
  {
    file: "app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts",
    code: "ADMIN_ALERT_RESOLVED",
  },
  {
    file: "app/api/admin/pending-ingestions/[id]/discard/route.ts",
    code: "PENDING_INGESTION_DISCARDED",
  },
  // Wizard shared handler (handleWizardPendingIngestionAction lives in the retry route file):
  // defer/ignore/retry all emit here; the thin defer_until_modified/permanent_ignore route files
  // re-export it and are NOT registered. RETRIED is REUSED (already SANCTIONED via the live route).
  {
    file: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
    code: "PENDING_INGESTION_DEFERRED",
  },
  {
    file: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
    code: "PENDING_INGESTION_IGNORED",
  },
  {
    file: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
    code: "PENDING_INGESTION_RETRIED",
  },
  {
    file: "app/api/admin/onboarding/rescan-sheet/route.ts",
    code: "SHEET_RESCANNED",
  },
  {
    file: "app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts",
    code: "FINALIZE_CLEANUP_DONE",
  },
  {
    file: "app/api/admin/show/staged/[stagedId]/discard/route.ts",
    code: "STAGE_DISCARDED",
  },
];

const SANCTIONED_CODES = new Set([
  "STAGE_APPLIED",
  "STAGE_APPROVED",
  "STAGE_UNAPPROVED",
  "STAGE_DISCARDED",
  "SHOW_FINALIZED",
  // Carve-out (2026-07-02).
  "SHOW_APPLIED",
  "SHOW_SYNCED_MANUAL",
  "PENDING_INGESTION_RETRIED",
  "SNAPSHOT_ROLLBACK_REPAIRED",
  // Completion (2026-07-02).
  "SHOW_PUBLISHED",
  "SHOW_ARCHIVED",
  "SHOW_UNARCHIVED_BY_ADMIN",
  "SHOW_UNPUBLISHED_BY_ADMIN",
  // DQIGNORE-4 (2026-07-02).
  "WARNING_IGNORED",
  "WARNING_UNIGNORED",
  // Observability PR-2 (2026-07-03).
  "SHOW_UNPUBLISHED_VIA_EMAILED_LINK",
  "ADMIN_ALERT_RESOLVED",
  "PENDING_INGESTION_DISCARDED",
  "PENDING_INGESTION_DEFERRED",
  "PENDING_INGESTION_IGNORED",
  "SHEET_RESCANNED",
  "FINALIZE_CLEANUP_DONE",
]);

// Every NEW forensic-only code this feature introduces. EXCLUDES pre-existing
// §12.4 codes that are (correctly) still producers — SYNC_INFRA_ERROR and
// ADMIN_SESSION_LOOKUP_FAILED (mirrored into logs but cataloged elsewhere) — and
// the lock-contention skip which durably persists via the cataloged
// CONCURRENT_SYNC_SKIPPED (no new code needed).
const NEW_FORENSIC_CODES = new Set([
  ...SANCTIONED_CODES,
  "AGENDA_EXTRACT_STALE",
  "AGENDA_EXTRACT_SESSION_GONE",
  // Carve-out (2026-07-02) plain-log forensic codes (inside log.* spans; NOT cataloged).
  // AGENDA_SCHEDULE_LOW_CONFIDENCE is deliberately EXCLUDED — it is a REUSED §12.4
  // catalog code, so it is (correctly) a producer and must not be leak-checked here.
  "AGENDA_GETFILE_GONE",
  "AGENDA_GETFILE_FAULT",
  "AGENDA_TOO_MANY_PAGES",
  "AGENDA_PDFJS_THREW",
  "AGENDA_SCHEDULE_HIGH_CONFIDENCE",
  "HOTELS_PARSE_WARNING",
  "ADMIN_ACCESS_DENIED",
  // Completion (2026-07-02) plain-log + client forensic codes (inside log.*/clientLog spans
  // or components/ (unscanned) or runtime variables; NOT cataloged). The 4 SHOW_* lifecycle
  // codes are admin-outcome (already in SANCTIONED above via spread).
  "REALTIME_UNKNOWN_SYSTEM_EVENT",
  "CLIENT_WINDOW_ERROR",
  "CLIENT_UNHANDLED_REJECTION",
  "OAUTH_CLAIM_RPC_FAILED",
  "OAUTH_CLAIM_STAMP_FAILED",
  "AGENDA_EXTRACT_REGION_FAILED",
  "AGENDA_EXTRACT_PREEXTRACT_FAILED",
  "DRIVE_WEBHOOK_RECEIVED",
  "DRIVE_WEBHOOK_HEADERS_INCOMPLETE",
  "DRIVE_WEBHOOK_CHANNEL_INACTIVE",
  "DRIVE_WEBHOOK_INFRA_FAULT",
  "DRIVE_WATCH_RENEWAL_FAILED",
  "DRIVE_WATCH_INFRA_FAULT",
  "MANUAL_RESYNC_CLEARED_STANDING_IGNORE",
  // Observability PR-2 (2026-07-03) forensic infra codes (inside log.* spans; NOT cataloged).
  "UNPUBLISH_INFRA_FAILED",
  "ADMIN_ALERT_RESOLVE_FAILED",
  "PENDING_INGESTION_DISCARD_FAILED",
  "PENDING_INGESTION_ACTION_FAILED",
  "RESCAN_INFRA_ERROR",
  "FINALIZE_CLEANUP_FAILED",
  "STAGE_DISCARD_FAILED",
  // S4 — OAuth callback session-exchange leg (all log.error/info, strip-exempt).
  "OAUTH_CLIENT_CONSTRUCTION_FAILED",
  "OAUTH_EXCHANGE_THREW",
  "OAUTH_EXCHANGE_REJECTED",
  "OAUTH_IS_ADMIN_INFRA_ERROR",
  "OAUTH_SIGN_IN_SUCCEEDED",
]);

const read = (f: string) => readFileSync(f, "utf8");

describe("_metaAdminOutcomeContract", () => {
  test("Assertion 1 — every registered mutation route emits logAdminOutcome with its code", () => {
    for (const { file, code } of AUDITABLE_MUTATIONS) {
      const src = read(file);
      expect(src, `${file} must import logAdminOutcome`).toContain(
        'from "@/lib/log/logAdminOutcome"',
      );
      // Must be AWAITED — a fire-and-forget logAdminOutcome in a Server Action can be
      // frozen/terminated after return before the async persist completes → dropped audit row.
      expect(src, `${file} must AWAIT logAdminOutcome(`).toMatch(/await\s+logAdminOutcome\(/);
      expect(src, `${file} must carry code "${code}"`).toContain(`"${code}"`);
    }
  });

  test("Assertion 2 — every applyStaged infra_error return logs SYNC_INFRA_ERROR + source in-window", () => {
    const file = "lib/sync/applyStaged.ts";
    const lines = read(file).split("\n");
    const offenders: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/return\s*\{\s*outcome:\s*"infra_error"/.test(lines[i]!)) {
        const window = lines.slice(Math.max(0, i - 12), i).join("\n");
        const ok =
          /\blog\.(error|warn)\(/.test(window) &&
          /SYNC_INFRA_ERROR/.test(window) &&
          /source:\s*"sync\.applyStaged"/.test(window);
        if (!ok) offenders.push(`${file}:${i + 1}`);
      }
    }
    expect(
      offenders,
      "each infra_error return needs a preceding log with SYNC_INFRA_ERROR + source",
    ).toEqual([]);
  });

  test("Assertion 3 — registry codes are sanctioned + SHOUTY; every sanctioned code is used", () => {
    const used = new Set<string>();
    for (const { code } of AUDITABLE_MUTATIONS) {
      expect(SANCTIONED_CODES.has(code), `${code} must be a sanctioned code`).toBe(true);
      expect(code, `${code} must be SHOUTY_SNAKE_CASE`).toMatch(/^[A-Z][A-Z0-9_]*$/);
      used.add(code);
    }
    for (const code of SANCTIONED_CODES) {
      expect(used.has(code), `sanctioned code ${code} must be used by ≥1 route`).toBe(true);
    }
  });

  test("Assertion 4 — no new forensic outcome code leaks into the §12.4 producer set", () => {
    const producers = codeProducerLiterals();
    const leaked = [...NEW_FORENSIC_CODES].filter((c) => producers.has(c));
    expect(leaked, "outcome codes must stay OUT of the §12.4 producer scan").toEqual([]);
  });
});
