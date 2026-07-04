import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import ts from "typescript";

import { codeProducerLiterals } from "@/lib/messages/__internal__/codeProducers";
import {
  AUDITABLE_MUTATIONS,
  SANCTIONED_CODES,
  NEW_FORENSIC_CODES,
} from "./_auditableMutations";

// Registry-walk structural guard for the durable admin-mutation audit trail.
// Every registered mutation route MUST emit a logAdminOutcome with its outcome
// code; applyStaged's typed infra_error path MUST log; and the outcome codes MUST
// stay OUT of the §12.4 producer set (they are forensic app_events codes). This is
// the single source of truth for the sanctioned outcome codes.
// Non-tautology is proven by the negative-regression step in the plan (Task 14.7).
//
// AUDITABLE_MUTATIONS / SANCTIONED_CODES / NEW_FORENSIC_CODES are extracted to
// `./_auditableMutations` (Task 1, invariant #10 plan) so the new discovery
// meta-test can import the same source of truth. This file's assertions still
// key on `{ file, code }` — they ignore the extra `fn` field.

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

// (readFileSync already imported at top of file; add `join` + `ts` imports there)
const REPO_ROOT = join(__dirname, "..", "..");

// {file, code, level, anchor} — anchor is a substring UNIQUE WITHIN THE FILE that
// identifies the intended call. For 35 string-message sites it is the FULL QUOTED
// message literal (incl. both quotes) so a prefix-overlapping sibling (finalize-cas
// non-stream vs stream) is distinguished. selectIdentity uses a unique JSON-blob token.
const NULLCODE_BATCH2_STAMPS: ReadonlyArray<{
  file: string;
  code: string;
  level: "error" | "warn";
  anchor: string;
}> = [
  {
    file: "app/api/observe/client-error/route.ts",
    code: "CLIENT_ERROR_MIRROR_RATE_CAPPED",
    level: "warn",
    anchor: '"client-error mirror rate cap hit"',
  },
  {
    file: "app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts",
    code: "IGNORED_SHEET_UNIGNORE_FAILED",
    level: "error",
    anchor: '"un-ignore: unexpected failure"',
  },
  {
    file: "app/api/admin/staged/[fileId]/discard/route.ts",
    code: "LIVE_STAGED_DISCARD_CLIENT_CONSTRUCTION_FAILED",
    level: "error",
    anchor: '"server client construction failed"',
  },
  {
    file: "app/api/admin/staged/[fileId]/discard/route.ts",
    code: "LIVE_STAGED_DISCARD_GETUSER_THREW",
    level: "error",
    anchor: '"getUser threw"',
  },
  {
    file: "app/api/admin/staged/[fileId]/discard/route.ts",
    code: "LIVE_STAGED_DISCARD_GETUSER_FAILED",
    level: "error",
    anchor: '"getUser failed"',
  },
  {
    file: "app/api/admin/onboarding/reap-stale-sessions/route.ts",
    code: "REAP_STALE_SESSIONS_INFRA_FAILED",
    level: "error",
    anchor: '"reap-stale-sessions failed"',
  },
  {
    file: "app/api/admin/show/staged/[stagedId]/apply/route.ts",
    code: "LIVE_STAGED_APPLY_FAILED",
    level: "error",
    anchor: '"live staged apply: unexpected failure"',
  },
  {
    file: "app/api/admin/staged/[fileId]/apply/route.ts",
    code: "LIVE_STAGED_APPLY_SNAPSHOT_PROMOTION_FAILED",
    level: "error",
    anchor: '"snapshot promotion failed"',
  },
  {
    file: "app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts",
    code: "WIZARD_IGNORE_SUPERSEDED_ALERT_WRITE_FAILED",
    level: "error",
    anchor: '"WIZARD_SESSION_SUPERSEDED_RACE alert write failed"',
  },
  {
    file: "app/api/admin/onboarding/finalize-cas/route.ts",
    code: "FINALIZE_CAS_UNEXPECTED_FAILURE",
    level: "error",
    anchor: '"onboarding finalize-cas: unexpected failure"',
  },
  {
    file: "app/api/admin/onboarding/finalize-cas/route.ts",
    code: "FINALIZE_CAS_STREAM_UNEXPECTED_FAILURE",
    level: "error",
    anchor: '"onboarding finalize-cas: unexpected failure (stream)"',
  },
  {
    file: "app/api/admin/onboarding/finalize/route.ts",
    code: "FINALIZE_UNEXPECTED_FAILURE",
    level: "error",
    anchor: '"onboarding finalize: unexpected failure"',
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts",
    code: "WIZARD_STAGED_APPLY_SUPERSEDED_ALERT_WRITE_FAILED",
    level: "error",
    anchor: '"WIZARD_SESSION_SUPERSEDED_RACE alert write failed"',
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts",
    code: "WIZARD_STAGED_APPLY_FAILED",
    level: "error",
    anchor: '"wizard staged apply: unexpected failure"',
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts",
    code: "WIZARD_STAGED_APPROVE_FAILED",
    level: "error",
    anchor: '"wizard approve: unexpected failure"',
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts",
    code: "WIZARD_STAGED_UNAPPROVE_FAILED",
    level: "error",
    anchor: '"wizard un-approve: unexpected failure"',
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts",
    code: "WIZARD_STAGED_DISCARD_SUPERSEDED_ALERT_WRITE_FAILED",
    level: "error",
    anchor: '"WIZARD_SESSION_SUPERSEDED_RACE alert write failed"',
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts",
    code: "WIZARD_STAGED_DISCARD_FAILED",
    level: "error",
    anchor: '"wizard staged discard: unexpected failure"',
  },
  {
    file: "app/api/admin/onboarding/scan/route.ts",
    code: "ONBOARDING_SCAN_FAILED",
    level: "error",
    anchor: '"onboarding scan failed"',
  },
  {
    file: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
    code: "PENDING_INGESTION_RETRY_SUPERSEDED_ALERT_WRITE_FAILED",
    level: "error",
    anchor: '"WIZARD_SESSION_SUPERSEDED_RACE alert write failed"',
  },
  {
    file: "app/admin/actions.ts",
    code: "ADMIN_RESOLVE_CANONICAL_EMAIL_NULL",
    level: "error",
    anchor: '"requireAdmin returned but canonicalized email is null"',
  },
  {
    file: "app/admin/show/[slug]/page.tsx",
    code: "ADMIN_SHOW_CLIENT_CONSTRUCTION_FAILED",
    level: "error",
    anchor: '"supabase client construction threw:"',
  },
  {
    file: "app/admin/show/[slug]/page.tsx",
    code: "ADMIN_SHOW_LOOKUP_FAILED",
    level: "error",
    anchor: '"show lookup failed:"',
  },
  {
    file: "app/admin/show/[slug]/page.tsx",
    code: "ADMIN_SHOW_LOOKUP_THREW",
    level: "error",
    anchor: '"show lookup threw:"',
  },
  {
    file: "app/admin/show/[slug]/page.tsx",
    code: "ADMIN_SHOW_CHANGE_FEED_READ_FAILED",
    level: "error",
    anchor: '"changes feed read failed:"',
  },
  {
    file: "app/admin/show/[slug]/page.tsx",
    code: "ADMIN_SHOW_CREW_LOOKUP_FAILED",
    level: "error",
    anchor: '"crew_members lookup failed:"',
  },
  {
    file: "app/admin/show/[slug]/page.tsx",
    code: "ADMIN_SHOW_CREW_LOOKUP_THREW",
    level: "error",
    anchor: '"crew_members lookup threw:"',
  },
  {
    file: "app/admin/show/[slug]/page.tsx",
    code: "ADMIN_SHOW_INTERNAL_PARSE_WARNINGS_READ_FAILED",
    level: "error",
    anchor: '"shows_internal read failed:"',
  },
  {
    file: "app/admin/show/[slug]/page.tsx",
    code: "ADMIN_SHOW_INTERNAL_PARSE_WARNINGS_READ_THREW",
    level: "error",
    anchor: '"shows_internal read threw:"',
  },
  {
    file: "app/show/[slug]/[shareToken]/_CrewShell.tsx",
    code: "CREW_PROJECTION_ALERT_UPSERT_FAILED",
    level: "warn",
    anchor: '"projection-alert upsert failed (fail-quiet):"',
  },
  {
    file: "app/show/[slug]/[shareToken]/_CrewShell.tsx",
    code: "CREW_PROJECTION_ALERT_RESOLVE_FAILED",
    level: "warn",
    anchor: '"projection-alert resolve failed (fail-quiet):"',
  },
  {
    file: "lib/auth/picker/selectIdentity.ts",
    code: "PICKER_IDENTITY_CLAIMED_TAMPER",
    level: "warn",
    anchor: "hand_crafted_post_bypassed_deactivated_row",
  },
  {
    file: "lib/admin/loadAppEvents.ts",
    code: "APP_EVENTS_READ_RETURNED_ERROR",
    level: "error",
    anchor: '"app_events read returned error"',
  },
  {
    file: "lib/admin/loadAppEvents.ts",
    code: "APP_EVENTS_READ_THREW",
    level: "error",
    anchor: '"app_events read threw"',
  },
  {
    file: "lib/admin/loadCronHealth.ts",
    code: "CRON_HEALTH_APP_EVENTS_READ_RETURNED_ERROR",
    level: "error",
    anchor: '"app_events read returned error"',
  },
  {
    file: "lib/admin/loadCronHealth.ts",
    code: "CRON_HEALTH_APP_EVENTS_READ_THREW",
    level: "error",
    anchor: '"app_events read threw"',
  },
];

// AST-based guard (Codex plan-R3 HIGH): the runtime logger persists ONLY the
// top-level `code` of the SECOND argument (lib/log/logger.ts). Text/regex matching
// can't distinguish that from a nested object / 3rd arg / comment / wrong key. So we
// parse the AST and read args[1]'s top-level `code` PropertyAssignment directly.
// Returns one entry per log.error/log.warn CallExpression in the file.
function findLogErrorWarnCalls(
  src: string,
  file: string,
): Array<{ level: "error" | "warn"; firstArgText: string; secondArgTopLevelCode: string | null }> {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, /*setParentNodes*/ true, kind);
  const out: Array<{
    level: "error" | "warn";
    firstArgText: string;
    secondArgTopLevelCode: string | null;
  }> = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "log" &&
      (node.expression.name.text === "error" || node.expression.name.text === "warn")
    ) {
      const level = node.expression.name.text as "error" | "warn";
      const firstArgText = node.arguments[0]?.getText(sf) ?? "";
      let secondArgTopLevelCode: string | null = null;
      const arg2 = node.arguments[1];
      if (arg2 && ts.isObjectLiteralExpression(arg2)) {
        for (const p of arg2.properties) {
          if (
            ts.isPropertyAssignment(p) &&
            ((ts.isIdentifier(p.name) && p.name.text === "code") ||
              (ts.isStringLiteral(p.name) && p.name.text === "code")) &&
            ts.isStringLiteralLike(p.initializer)
          ) {
            secondArgTopLevelCode = p.initializer.text;
          }
        }
      }
      out.push({ level, firstArgText, secondArgTopLevelCode });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("BL-NULLCODE-STAMP-BATCH-2 forensic stamps", () => {
  const codes = NULLCODE_BATCH2_STAMPS.map((r) => r.code);

  test("36 rows, all codes distinct + all in NEW_FORENSIC_CODES", () => {
    expect(NULLCODE_BATCH2_STAMPS.length).toBe(36);
    expect(new Set(codes).size).toBe(36);
    for (const c of codes) expect(NEW_FORENSIC_CODES.has(c), `${c} must be registered`).toBe(true);
  });

  for (const row of NULLCODE_BATCH2_STAMPS) {
    test(`${row.code} is the top-level 2nd-arg fields.code of its intended ${row.level} call in ${row.file}`, () => {
      const src = readFileSync(join(REPO_ROOT, row.file), "utf8");
      const calls = findLogErrorWarnCalls(src, row.file);
      // (1) exactly one log call in the file carries fields.code === this code as its
      //     2nd-arg TOP-LEVEL property → closes nested-object / 3rd-arg / comment / wrong-key
      //     (a `source:"X"`, a nested `{code:"X"}`, or a commented `code:"X"` are NOT matched),
      //     and closes duplication (a second stamp of the same code makes length 2).
      const bearers = calls.filter((c) => c.secondArgTopLevelCode === row.code);
      expect(
        bearers.length,
        `exactly one log call must carry top-level fields.code === ${row.code} in ${row.file}`,
      ).toBe(1);
      // (2) that call is the INTENDED one + at the intended level → closes wrong-call / wrong-level
      //     (a code stamped on log.info/log.debug/logAdminOutcome isn't collected at all; a code on
      //     the wrong log.error/warn fails the anchor check because that call's message differs).
      expect(bearers[0]!.level, `${row.code} must be on a log.${row.level}`).toBe(row.level);
      expect(
        bearers[0]!.firstArgText.includes(row.anchor),
        `${row.code} must be on the call whose message matches its anchor (${row.anchor})`,
      ).toBe(true);
    });
  }
});
