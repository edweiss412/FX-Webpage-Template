# BL-NULLCODE-STAMP-BATCH-2 — Implementation Plan

> **For agentic workers:** TDD per task (failing test → minimal impl → passing test → commit). Steps use `- [ ]`.

**Goal:** Stamp a forensic `code:` on 35 null-code `log.error`/`log.warn` sites; register all 35 in `NEW_FORENSIC_CODES`; add a per-call anchored structural guard that pins each code to its intended call.

**Spec:** `docs/superpowers/specs/observability/2026-07-03-nullcode-forensic-batch2-design.md` (Codex-APPROVE'd, 4 rounds).

**Architecture:** Pure observability enrichment — each edit adds one `code:` field to an existing fields object; zero behavior change. The structural meta-test is the primary proof; runtime spies cover the sink for the sites where structural placement is ambiguous.

## Global Constraints
- Codes are `log.error`/`warn` forensic → **strip-exempt**: registered ONLY in `NEW_FORENSIC_CODES` (`tests/log/_metaAdminOutcomeContract.test.ts:134`). NO §12.4 catalog / gen:spec-codes / help / _families / trustDomains work. Assertion 4 proves no §12.4-producer leak.
- Zero `SANCTIONED_CODES` / `AUDITABLE_MUTATIONS` additions (those are for `logAdminOutcome`).
- The reap route's forensic log code is `REAP_STALE_SESSIONS_INFRA_FAILED` (NOT the cataloged `REAP_STALE_SESSIONS_FAILED`, which stays the returned `errorResponse` producer).
- Commits: `--no-verify`, conventional-commits. **Before every push: `pnpm typecheck` AND `pnpm format:check`** (`--no-verify` bypasses the prettier hook — CI `quality` fails otherwise).
- Line numbers advisory; relocate each site by its message anchor.
- 10 sites are `app/` non-api (UI surface by invariant-8 path) → the impeccable dual-gate RUNS (Task 2).
- **TDD commit discipline (Codex plan-R1):** every commit leaves the branch GREEN. Within a task: write the failing test(s) → observe RED → implement → observe GREEN → commit ONCE (test+impl together). Never commit a RED state. Tests that cover an implementation are always written BEFORE that implementation, within the same task.

---

### Task 1: Write all tests (RED) → stamp all 35 → GREEN → single commit

This is ONE TDD cycle for the whole mechanical batch: the structural guard + the runtime emission tests are written and observed RED **before** any stamp, then all 35 stamps make them GREEN, then one green commit. No intermediate RED commit; runtime tests precede their implementation.

**Files:** Modify `tests/log/_metaAdminOutcomeContract.test.ts`; create `tests/log/nullcodeBatch2Emission.test.ts`; the 21 source files; `BACKLOG.md`.

- [ ] **Step 1 — add the 35 codes to `NEW_FORENSIC_CODES`.** Insert all 35 (spec §3) into the `NEW_FORENSIC_CODES` set (`:134`). This alone changes nothing failing yet.

- [ ] **Step 2 — add the registry + AST guard + assertions (RED).** The file ALREADY imports `readFileSync` (line 1) — do NOT re-import it. Add only the imports not already present: `import { join } from "node:path";` and `import ts from "typescript";` (typescript@5.9.3 is a dep; precedent: `tests/sync/runScheduledCronSync.test.ts` et al. import it). Then add:

```ts
// (readFileSync already imported at top of file; add `join` + `ts` imports there)
const REPO_ROOT = join(__dirname, "..", "..");

// {file, code, level, anchor} — anchor is a substring UNIQUE WITHIN THE FILE that
// identifies the intended call. For 34 string-message sites it is the FULL QUOTED
// message literal (incl. both quotes) so a prefix-overlapping sibling (finalize-cas
// non-stream vs stream) is distinguished. selectIdentity uses a unique JSON-blob token.
const NULLCODE_BATCH2_STAMPS: ReadonlyArray<{
  file: string; code: string; level: "error" | "warn"; anchor: string;
}> = [
  { file: "app/api/observe/client-error/route.ts", code: "CLIENT_ERROR_MIRROR_RATE_CAPPED", level: "warn", anchor: '"client-error mirror rate cap hit"' },
  { file: "app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts", code: "IGNORED_SHEET_UNIGNORE_FAILED", level: "error", anchor: '"un-ignore: unexpected failure"' },
  { file: "app/api/admin/staged/[fileId]/discard/route.ts", code: "LIVE_STAGED_DISCARD_CLIENT_CONSTRUCTION_FAILED", level: "error", anchor: '"server client construction failed"' },
  { file: "app/api/admin/staged/[fileId]/discard/route.ts", code: "LIVE_STAGED_DISCARD_GETUSER_THREW", level: "error", anchor: '"getUser threw"' },
  { file: "app/api/admin/staged/[fileId]/discard/route.ts", code: "LIVE_STAGED_DISCARD_GETUSER_FAILED", level: "error", anchor: '"getUser failed"' },
  { file: "app/api/admin/onboarding/reap-stale-sessions/route.ts", code: "REAP_STALE_SESSIONS_INFRA_FAILED", level: "error", anchor: '"reap-stale-sessions failed"' },
  { file: "app/api/admin/show/staged/[stagedId]/apply/route.ts", code: "LIVE_STAGED_APPLY_FAILED", level: "error", anchor: '"live staged apply: unexpected failure"' },
  { file: "app/api/admin/staged/[fileId]/apply/route.ts", code: "LIVE_STAGED_APPLY_SNAPSHOT_PROMOTION_FAILED", level: "error", anchor: '"snapshot promotion failed"' },
  { file: "app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts", code: "WIZARD_IGNORE_SUPERSEDED_ALERT_WRITE_FAILED", level: "error", anchor: '"WIZARD_SESSION_SUPERSEDED_RACE alert write failed"' },
  { file: "app/api/admin/onboarding/finalize-cas/route.ts", code: "FINALIZE_CAS_UNEXPECTED_FAILURE", level: "error", anchor: '"onboarding finalize-cas: unexpected failure"' },
  { file: "app/api/admin/onboarding/finalize-cas/route.ts", code: "FINALIZE_CAS_STREAM_UNEXPECTED_FAILURE", level: "error", anchor: '"onboarding finalize-cas: unexpected failure (stream)"' },
  { file: "app/api/admin/onboarding/finalize/route.ts", code: "FINALIZE_UNEXPECTED_FAILURE", level: "error", anchor: '"onboarding finalize: unexpected failure"' },
  { file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts", code: "WIZARD_STAGED_APPLY_SUPERSEDED_ALERT_WRITE_FAILED", level: "error", anchor: '"WIZARD_SESSION_SUPERSEDED_RACE alert write failed"' },
  { file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts", code: "WIZARD_STAGED_APPLY_FAILED", level: "error", anchor: '"wizard staged apply: unexpected failure"' },
  { file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts", code: "WIZARD_STAGED_APPROVE_FAILED", level: "error", anchor: '"wizard approve: unexpected failure"' },
  { file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts", code: "WIZARD_STAGED_UNAPPROVE_FAILED", level: "error", anchor: '"wizard un-approve: unexpected failure"' },
  { file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts", code: "WIZARD_STAGED_DISCARD_SUPERSEDED_ALERT_WRITE_FAILED", level: "error", anchor: '"WIZARD_SESSION_SUPERSEDED_RACE alert write failed"' },
  { file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts", code: "WIZARD_STAGED_DISCARD_FAILED", level: "error", anchor: '"wizard staged discard: unexpected failure"' },
  { file: "app/api/admin/onboarding/scan/route.ts", code: "ONBOARDING_SCAN_FAILED", level: "error", anchor: '"onboarding scan failed"' },
  { file: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts", code: "PENDING_INGESTION_RETRY_SUPERSEDED_ALERT_WRITE_FAILED", level: "error", anchor: '"WIZARD_SESSION_SUPERSEDED_RACE alert write failed"' },
  { file: "app/admin/actions.ts", code: "ADMIN_RESOLVE_CANONICAL_EMAIL_NULL", level: "error", anchor: '"requireAdmin returned but canonicalized email is null"' },
  { file: "app/admin/show/[slug]/page.tsx", code: "ADMIN_SHOW_CLIENT_CONSTRUCTION_FAILED", level: "error", anchor: '"supabase client construction threw:"' },
  { file: "app/admin/show/[slug]/page.tsx", code: "ADMIN_SHOW_LOOKUP_FAILED", level: "error", anchor: '"show lookup failed:"' },
  { file: "app/admin/show/[slug]/page.tsx", code: "ADMIN_SHOW_LOOKUP_THREW", level: "error", anchor: '"show lookup threw:"' },
  { file: "app/admin/show/[slug]/page.tsx", code: "ADMIN_SHOW_CHANGE_FEED_READ_FAILED", level: "error", anchor: '"changes feed read failed:"' },
  { file: "app/admin/show/[slug]/page.tsx", code: "ADMIN_SHOW_CREW_LOOKUP_FAILED", level: "error", anchor: '"crew_members lookup failed:"' },
  { file: "app/admin/show/[slug]/page.tsx", code: "ADMIN_SHOW_CREW_LOOKUP_THREW", level: "error", anchor: '"crew_members lookup threw:"' },
  { file: "app/admin/show/[slug]/page.tsx", code: "ADMIN_SHOW_INTERNAL_PARSE_WARNINGS_READ_FAILED", level: "error", anchor: '"shows_internal read failed:"' },
  { file: "app/admin/show/[slug]/page.tsx", code: "ADMIN_SHOW_INTERNAL_PARSE_WARNINGS_READ_THREW", level: "error", anchor: '"shows_internal read threw:"' },
  { file: "app/show/[slug]/[shareToken]/_CrewShell.tsx", code: "CREW_PROJECTION_ALERT_UPSERT_FAILED", level: "warn", anchor: '"projection-alert upsert failed (fail-quiet):"' },
  { file: "lib/auth/picker/selectIdentity.ts", code: "PICKER_IDENTITY_CLAIMED_TAMPER", level: "warn", anchor: "hand_crafted_post_bypassed_deactivated_row" },
  { file: "lib/admin/loadAppEvents.ts", code: "APP_EVENTS_READ_RETURNED_ERROR", level: "error", anchor: '"app_events read returned error"' },
  { file: "lib/admin/loadAppEvents.ts", code: "APP_EVENTS_READ_THREW", level: "error", anchor: '"app_events read threw"' },
  { file: "lib/admin/loadCronHealth.ts", code: "CRON_HEALTH_APP_EVENTS_READ_RETURNED_ERROR", level: "error", anchor: '"app_events read returned error"' },
  { file: "lib/admin/loadCronHealth.ts", code: "CRON_HEALTH_APP_EVENTS_READ_THREW", level: "error", anchor: '"app_events read threw"' },
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
  const out: Array<{ level: "error" | "warn"; firstArgText: string; secondArgTopLevelCode: string | null }> = [];
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

  test("35 rows, all codes distinct + all in NEW_FORENSIC_CODES", () => {
    expect(NULLCODE_BATCH2_STAMPS.length).toBe(35);
    expect(new Set(codes).size).toBe(35);
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
```

**Why this is class-closing (all of Codex R1/R2/R3's modes):** parsing the AST and reading `args[1]`'s top-level `code` PropertyAssignment is exactly what `lib/log/logger.ts` persists. A `code:` in a nested object, a 3rd argument, a comment, or under a different key (`source:`) is NOT a top-level property of `args[1]` → not matched. A code on `log.info`/`log.debug`/`logAdminOutcome` is never collected (only `log.error`/`log.warn` are). Duplication makes `bearers.length === 2`. Cross-wiring to the wrong `log.error`/`warn` fails the `firstArgText.includes(anchor)` message check. This also covers `selectIdentity` structurally (its `args[1]` is the fields object; a code wrongly placed in the `JSON.stringify` *first* arg would leave `args[1]` without the code → `bearers.length === 0`), so the §8.2 `selectIdentity` runtime test is now belt-and-suspenders sink-delivery proof rather than the sole guard.

- [ ] **Step 3 — write the runtime emission tests.** Create `tests/log/nullcodeBatch2Emission.test.ts`:
  - **`selectIdentity` (REQUIRED — the one site the structural guard can't fully pin):** drive the `PICKER_IDENTITY_CLAIMED` tamper branch; spy on `log.warn`; assert its **2nd arg (fields object)** has `code: "PICKER_IDENTITY_CLAIMED_TAMPER"` (NOT inside the stringified 1st arg). Use the existing selectIdentity test harness if present.
  - **`loadAppEvents`:** force returned-error → assert `log.error` fields include `code: "APP_EVENTS_READ_RETURNED_ERROR"`; force thrown → `APP_EVENTS_READ_THREW`.
  - **`loadCronHealth`:** same for `CRON_HEALTH_APP_EVENTS_READ_RETURNED_ERROR` / `_THREW`.
  - **`reap-stale-sessions`:** force the catch; assert `log.error` fields include `code: "REAP_STALE_SESSIONS_INFRA_FAILED"` AND the response body still returns `REAP_STALE_SESSIONS_FAILED` (rename didn't alter the contract).
- [ ] **Step 4 — run all tests, observe RED (tests precede impl).** `pnpm vitest run tests/log/_metaAdminOutcomeContract.test.ts tests/log/nullcodeBatch2Emission.test.ts` → the 35 structural per-row tests FAIL (codes not yet stamped) and the runtime tests FAIL (fields lack the code). The "35 rows/distinct/registered" test + the 3 pre-existing assertions PASS. **Do NOT commit this RED state.**
- [ ] **Step 5 — stamp all 35 sites.** Stamp = add `code: "<CODE>"` to the **existing fields object** (2nd arg) of the call whose message matches the anchor. Do NOT touch control flow, the message, the returned response, or any other field. Do NOT touch the 4 excluded-adjacent already-coded calls (spec §5).
  - *app/api (20):* locate each by anchor; add `code:`. `reap-stale-sessions:62` → `REAP_STALE_SESSIONS_INFRA_FAILED`, leaving `errorResponse(500,"REAP_STALE_SESSIONS_FAILED")` at `:63` UNCHANGED. `scan/route.ts:277` → `ONBOARDING_SCAN_FAILED`, leaving the SSE body `code:null` at `:282` UNCHANGED.
  - *lib (5):* `loadAppEvents.ts:53/67`, `loadCronHealth.ts:53/60`, `selectIdentity.ts:56` (code in the **2nd-arg fields object** with `source: "auth.picker.selectIdentity"`, NOT the `JSON.stringify(...)` blob).
  - *app/ non-api / UI (10):* `app/admin/actions.ts:83`, `app/admin/show/[slug]/page.tsx` (8), `app/show/[slug]/[shareToken]/_CrewShell.tsx:168`.
- [ ] **Step 6 — add the BACKLOG entries (part of shipped scope).** Add to `BACKLOG.md` (spec §9): `BL-SCAN-SSE-BODY-NULL-CODE` (scan SSE result body emits user-facing `code:null`) and `BL-PICKER-TAMPER-ADMIN-ALERT` (selectIdentity tamper could also raise an admin_alerts upsert). These land BEFORE push.
- [ ] **Step 7 — run all tests, observe GREEN.** `pnpm vitest run tests/log/_metaAdminOutcomeContract.test.ts tests/log/nullcodeBatch2Emission.test.ts` → all 35 structural per-row tests + the registry test + Assertion 4 (no §12.4 leak) + the runtime tests PASS.
- [ ] **Step 8 — commit (single green commit).** `git add -A && git commit --no-verify -m "feat(observability): stamp 35 forensic codes on null-code log sites + anchored guard + runtime tests (BL-NULLCODE-STAMP-BATCH-2)"`

---

### Task 2: Impeccable dual-gate on the app/ non-api subset (invariant 8)

The 10 UI-surface **sites** live across **3 `app/` non-api files**: `app/admin/actions.ts` (1), `app/admin/show/[slug]/page.tsx` (8), `app/show/[slug]/[shareToken]/_CrewShell.tsx` (1). Invariant 8 requires findings + dispositions be recorded in a **tracked handoff doc**, ALWAYS — even for a clean pass — not just the PR body.

**Files:** Create `docs/superpowers/handoffs/2026-07-03-nullcode-batch2-handoff.md`.

- [ ] **Step 1 — run `/impeccable critique`** on the affected diff of those 3 files, with the canonical v3 preflight (PRODUCT.md → DESIGN.md → register → preflight signal).
- [ ] **Step 2 — run `/impeccable audit`** on the same diff.
- [ ] **Step 3 — write the tracked disposition record (ALWAYS, even on a clean pass).** Create `docs/superpowers/handoffs/2026-07-03-nullcode-batch2-handoff.md` with a `## §12 — UI close-out (impeccable v3 dual-gate)` section recording: the 3 files/10 sites in scope, the critique result, the audit result, and each HIGH/CRITICAL finding with its disposition (fixed in-diff, or `DEFERRED.md` entry with rationale). Expected outcome: no HIGH/CRITICAL — the change adds only a server-side `code:` field inside a catch/guard, zero rendering delta — and that clean result is itself the recorded disposition. If any HIGH/CRITICAL IS found, fix it in-diff or add a `DEFERRED.md` entry, and record it here.
- [ ] **Step 4 — commit (ALWAYS — the handoff doc is a tracked artifact).** `git add -A && git commit --no-verify -m "docs(observability): impeccable v3 dual-gate close-out for batch-2 UI subset (§12 dispositions)"`

---

### Task 3: Full verification

- [ ] **Step 1 — typecheck.** `pnpm typecheck` → clean.
- [ ] **Step 2 — full suite.** `pnpm vitest run` → note any pre-existing env-bound failures vs merge-base; all new + source-scanning meta-tests (`_metaAdminOutcomeContract`, `codeProducers`, `codes.test.ts`, `x2`) PASS. Confirm `x1-catalog-parity` / `x2-no-raw-codes` unaffected (strip-exempt).
- [ ] **Step 3 — format check.** `pnpm format:check` → clean (else `prettier --write` the changed files, re-verify typecheck + affected tests, commit `style(observability): prettier-format batch-2 files`).

---

### Task 4: Whole-diff review + ship

- [ ] **Step 1 — whole-diff Codex adversarial-review to APPROVE.** Bounded prompt (inline the diff; ban repo-wide greps). Iterate to `===CDXV=== APPROVE`.
- [ ] **Step 2 — push + PR.** Confirm `pnpm typecheck` + `pnpm format:check` clean FIRST (both — `--no-verify` bypassed the prettier hook), then `git push -u origin fix/nullcode-forensic-batch2`; `gh pr create` (PR body records the impeccable dispositions from Task 2).
- [ ] **Step 3 — real CI green.** Monitor (count `bucket=="fail"`, emit on all terminal states); confirm `mergeStateStatus==CLEAN`.
- [ ] **Step 4 — merge + ff.** `gh pr merge --merge`; verify server-side merged; ff local main; `rev-list --left-right --count main...origin/main` == `0 0`; remove worktree + delete branch.

---

## Self-review checklist
- Spec coverage: §3 35 sites → Task 1 step 5; §4 reap rename → Task 1 steps 3+5; §5 excluded → Task 1 step 5 (do-not-touch); §6 special cases → Task 1 steps 3+5; §7 impeccable → Task 2 (always-committed §12 handoff disposition); §8.1(a) registry → Task 1 step 1; §8.1(b) guard → Task 1 step 2, now an **AST guard proving the top-level 2nd-arg `fields.code`** (not a text/regex match), closing nested/3rd-arg/comment/wrong-key/wrong-level/duplication/cross-wire; §8.2 runtime → Task 1 step 3 (belt-and-suspenders sink delivery); §9 BACKLOG → Task 1 step 6 (before push). ✓
- TDD (Codex plan-R1): all tests (structural + runtime) written and observed RED in Task 1 steps 1-4 BEFORE the stamps in step 5; single GREEN commit in step 8; NO red commit. ✓
- Anchor uniqueness within file: finalize-cas pair uses full quoted literals (non-stream anchor `"…unexpected failure"` incl. closing quote is NOT a substring of the stream call's `"…unexpected failure (stream)"`, and the code check disambiguates); the 4 shared `"WIZARD_SESSION_SUPERSEDED_RACE alert write failed"` anchors are each in a DIFFERENT file (per-file assertion). ✓
- Meta-test inventory: EXTENDS `_metaAdminOutcomeContract.test.ts`; adds `tests/log/nullcodeBatch2Emission.test.ts`. ✓
- No §12.4 / advisory-lock / DML changes. ✓
