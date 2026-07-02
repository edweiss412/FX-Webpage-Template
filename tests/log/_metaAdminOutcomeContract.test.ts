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
]);

const read = (f: string) => readFileSync(f, "utf8");

describe("_metaAdminOutcomeContract", () => {
  test("Assertion 1 — every registered mutation route emits logAdminOutcome with its code", () => {
    for (const { file, code } of AUDITABLE_MUTATIONS) {
      const src = read(file);
      expect(src, `${file} must import logAdminOutcome`).toContain(
        'from "@/lib/log/logAdminOutcome"',
      );
      expect(src, `${file} must call logAdminOutcome(`).toMatch(/logAdminOutcome\(/);
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
