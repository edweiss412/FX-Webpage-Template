# BL-NULLCODE-STAMP-BATCH-2 — Implementation Plan

> **For agentic workers:** TDD per task (failing test → minimal impl → passing test → commit). Steps use `- [ ]`.

**Goal:** Stamp a forensic `code:` on 35 null-code `log.error`/`log.warn` sites; register all 35 in `NEW_FORENSIC_CODES`; add a per-call anchored structural guard that pins each code to its intended call.

**Spec:** `docs/superpowers/specs/2026-07-03-nullcode-forensic-batch2-design.md` (Codex-APPROVE'd, 4 rounds).

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

- [ ] **Step 2 — add the registry + helper + assertions (RED).** Add near the top of the file:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// Positive-extraction sibling of stripLogEmissionCalls: same balanced-paren +
// string/comment-aware tokenizer, but COLLECTS each log.<level>(…)/logAdminOutcome(…)
// span's {level, text} instead of deleting it.
const LOG_CALL_AT = /(?:log\.(error|warn|info|debug)|logAdminOutcome)\s*\(/y;
const isIdentChar = (ch?: string) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
function skipQuoted(s: string, i: number, q: string): number {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "\\") { j++; continue; }
    if (s[j] === q) return j;
    if (s[j] === "\n") return j - 1;
  }
  return s.length - 1;
}
function skipTemplate(s: string, i: number): number {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "\\") { j++; continue; }
    if (s[j] === "`") return j;
    if (s[j] === "$" && s[j + 1] === "{") {
      let d = 1; j += 2;
      while (j < s.length && d > 0) {
        const cc = s[j];
        if (cc === "\\") { j += 2; continue; }
        if (cc === '"' || cc === "'") { j = skipQuoted(s, j, cc) + 1; continue; }
        if (cc === "`") { j = skipTemplate(s, j) + 1; continue; }
        if (cc === "{") d++;
        else if (cc === "}") { d--; if (d === 0) break; }
        j++;
      }
    }
  }
  return s.length - 1;
}
function matchParen(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipQuoted(s, i, c); continue; }
    if (c === "`") { i = skipTemplate(s, i); continue; }
    if (c === "/" && s[i + 1] === "/") { const nl = s.indexOf("\n", i); if (nl === -1) return -1; i = nl; continue; }
    if (c === "/" && s[i + 1] === "*") { const e = s.indexOf("*/", i + 2); if (e === -1) return -1; i = e + 1; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function collectLogSpans(source: string): Array<{ level: string; text: string }> {
  const spans: Array<{ level: string; text: string }> = [];
  let i = 0; const n = source.length;
  while (i < n) {
    const c = source[i];
    if (c === '"' || c === "'") { i = skipQuoted(source, i, c) + 1; continue; }
    if (c === "`") { i = skipTemplate(source, i) + 1; continue; }
    if (c === "/" && source[i + 1] === "/") { const nl = source.indexOf("\n", i); i = nl === -1 ? n : nl; continue; }
    if (c === "/" && source[i + 1] === "*") { const e = source.indexOf("*/", i + 2); i = e === -1 ? n : e + 2; continue; }
    if (c === "l" && !isIdentChar(source[i - 1])) {
      LOG_CALL_AT.lastIndex = i;
      const m = LOG_CALL_AT.exec(source);
      if (m) {
        const openParen = i + m[0].length - 1;
        const close = matchParen(source, openParen);
        if (close !== -1) {
          spans.push({ level: m[1] ?? "adminOutcome", text: source.slice(i, close + 1) });
          i = close + 1; continue;
        }
      }
    }
    i++;
  }
  return spans;
}

describe("BL-NULLCODE-STAMP-BATCH-2 forensic stamps", () => {
  const codes = NULLCODE_BATCH2_STAMPS.map((r) => r.code);

  test("35 rows, all codes distinct + all in NEW_FORENSIC_CODES", () => {
    expect(NULLCODE_BATCH2_STAMPS.length).toBe(35);
    expect(new Set(codes).size).toBe(35);
    for (const c of codes) expect(NEW_FORENSIC_CODES.has(c), `${c} must be registered`).toBe(true);
  });

  for (const row of NULLCODE_BATCH2_STAMPS) {
    test(`${row.code} is stamped as a code: property inside its intended ${row.level} call in ${row.file}`, () => {
      const src = readFileSync(join(REPO_ROOT, row.file), "utf8");
      // The forensic codes are [A-Z0-9_]+ (no regex-special chars), so no escaping needed.
      // Require the exact `code:` PROPERTY form — NOT a bare literal, so a wrong key like
      // `source: "<CODE>"` inside the same call CANNOT satisfy the guard (Codex plan-R2 HIGH).
      const codeProp = new RegExp(`\\bcode\\s*:\\s*["']${row.code}["']`);
      // global uniqueness: the code literal appears exactly once in the file (catches duplication)
      const occ =
        src.split(`"${row.code}"`).length - 1 + src.split(`'${row.code}'`).length - 1;
      expect(occ, `${row.code} literal must appear exactly once in ${row.file}`).toBe(1);
      // and that single occurrence must be a `code:` property; catch a wrong-key placement
      expect(codeProp.test(src), `${row.code} must be a code: property (not source:/other key)`).toBe(true);
      // exactly one collected span at the intended level containing BOTH the anchor AND the code: property
      const spans = collectLogSpans(src).filter(
        (s) => s.level === row.level && s.text.includes(row.anchor) && codeProp.test(s.text),
      );
      expect(
        spans.length,
        `expected exactly one ${row.level} span with anchor + code: property for ${row.code}`,
      ).toBe(1);
    });
  }
});
```

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
- Spec coverage: §3 35 sites → Task 1 step 5; §4 reap rename → Task 1 steps 3+5; §5 excluded → Task 1 step 5 (do-not-touch); §6 special cases → Task 1 steps 3+5; §7 impeccable → Task 2 (always-committed §12 handoff disposition); §8.1(a) registry → Task 1 step 1; §8.1(b) anchored guard (code: PROPERTY form, not bare literal) → Task 1 step 2; §8.2 runtime → Task 1 step 3; §9 BACKLOG → Task 1 step 6 (before push). ✓
- TDD (Codex plan-R1): all tests (structural + runtime) written and observed RED in Task 1 steps 1-4 BEFORE the stamps in step 5; single GREEN commit in step 8; NO red commit. ✓
- Anchor uniqueness within file: finalize-cas pair uses full quoted literals (non-stream anchor `"…unexpected failure"` incl. closing quote is NOT a substring of the stream call's `"…unexpected failure (stream)"`, and the code check disambiguates); the 4 shared `"WIZARD_SESSION_SUPERSEDED_RACE alert write failed"` anchors are each in a DIFFERENT file (per-file assertion). ✓
- Meta-test inventory: EXTENDS `_metaAdminOutcomeContract.test.ts`; adds `tests/log/nullcodeBatch2Emission.test.ts`. ✓
- No §12.4 / advisory-lock / DML changes. ✓
