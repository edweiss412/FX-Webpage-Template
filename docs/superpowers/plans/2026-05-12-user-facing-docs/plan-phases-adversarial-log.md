# M12 Plan Per-Phase Adversarial Review Log

Companion to `plan-overview-adversarial-log.md`. Tracks per-phase adversarial review state.

Same soft cap as overview: 10 rounds per phase. At round 10, remaining findings either fix-now-or-defer.

---

## Phase A — `01-foundation.md`

| Round | Verdict | Findings | Resolved in commit | Notes |
|---|---|---|---|---|
| R1 | needs-attention | 3 (2 high, 1 medium) | r2 — `394fa0a` | A.4/A.5/A.6 tests not executable under live vitest config (env:node default, no vi import, require()-style mock); A.5 omitted ThemeToggle despite AC-12.4; Sidebar used `bg-accent-soft`/`hover:bg-surface-2` tokens that don't exist in live @theme |
| R2 | needs-attention | 2 (1 high, 1 medium) | r3 — `e6718d1` | A.1 imported `mdx/types` without `@types/mdx` dev dep; Sidebar + Breadcrumb mocks vulnerable to `vi.mock` hoisting / TDZ failure |
| R3 | **approve** | — | — | Ship-confidence: r3 fixes intact, tokens backed by live @theme, NAV iterable, stubs consistent with Phase E edit-in-place flow. No material findings. |

**Phase A converged in 3 rounds.** Total findings raised + resolved: 5.

---

## Phase B — `02-catalog-extension.md`

| Round | Verdict | Findings | Resolved in commit | Notes |
|---|---|---|---|---|
| R1 | needs-attention | 4 (1 critical, 2 high, 1 medium) | r2 — `f67277c` | Parser used wrong column (cells[1] instead of cells[2]); B.2 listed STALE_MANUAL_REPLAY_ABORTED (Doug-facing per master-spec); seed regex couldn't handle multiline helpfulContext (~50% of entries); B.4 predicate inline → no real red state |
| R2 | needs-attention | 4 (2 high, 2 medium) | r3 — `0c0dd6c` | B.5 dual-mode (blocking gate + drift report); B.4 biconditional couldn't catch stray helpHref on crew-only entries; E.13 redefined predicate inline (bypass validator module); M12 spec contradicted master-spec on STALE_MANUAL_REPLAY_ABORTED |
| R3 | needs-attention | 4 (2 high, 2 medium) | r4 — `1b6cfcd` | r11 spec still required LINK_CROSS_SHOW_REUSE stub (parser doesn't derive it); B.4 fixtures missing 2 predicate-side violations; 00-overview had stale B.2/B.3 ordering; E.13 missing renderToStaticMarkup import |
| R4 | needs-attention | 3 (3 medium) | r5 — `1bfb651` | HTML companion stale; close-out said "13 cases" not 15; E.N pattern still pointed at removed H.6 |
| R5 | needs-attention | 3 (2 high, 1 medium) | r6 — `930d813` | Parser missed escaped pipes (BRANCH_PROTECTION_MONITOR_AUTH_FAILED); B.5 green-only commits; Markdown spec self-contradictory predicate |
| R6 | needs-attention | 3 (1 high, 2 medium) | r7 — `a2ba0f8` | B.5 stash mechanics could drop unrelated stash; HTML still 2-field; literal NUL bytes in plan |
| R7 | needs-attention | 2 (1 high, 1 medium) | r8 — `c3ba9d7` | Phase H still used destructive restore (sweep didn't reach H from B.5); HTML enumeration wording |
| R8 | needs-attention | 3 (1 critical, 2 high) | r9 — `0969646` | Phase G.4 committed UI before walker test (TDD ordering); Phase H.1/H.3/H.4 still labeled stash; Phase F.6 green-only |
| R9 | needs-attention | 2 (2 high) | r10 — `3cf0091` | F.6 wrong Screenshot path (`components/help/` vs `app/help/_components/`); G.4 walker filter included STAGED_ID_PLACEHOLDER row that G.5 deferred |
| R10 | needs-attention | 3 (2 high, 1 medium) | r10 fixes — `8e72ec9` | F.4 globalSetup as Project field (Playwright API mismatch); new E2E specs not in testMatch; spec test #3 + #6 paths stale (`tests/help/auth.test.ts`, `tests/playwright/help-mobile.spec.ts`) |
| **Close** | **approved-by-trajectory** | — | — | **Phase B closed at round-10 soft cap.** B.1-B.5 task bodies clean since R4 (6 rounds ago); R5-R10 surfaced only [CROSS-PHASE] findings in Phase F/G/H surfaces. Per user direction, r10 fixes applied without another review round. Remaining Playwright/path concerns naturally surface in Phase F/G/H's own reviews. |

**Phase B converged at round 10 (soft cap, user-approved close).** Total findings raised + resolved: 31 across 10 rounds.

---

## Phase C — `03-time-utility.md`

| Round | Verdict | Findings | Resolved in commit | Notes |
|---|---|---|---|---|
| R1 | needs-attention | 4 (2 high, 2 medium) | r2 — `8dcd13a` | C.1/C.3 TDD ordering (smoke vs gate); C.2 await inside sync JSX IIFE; wrong line citation (646 vs 697); /g regex statefulness |
| R2 | needs-attention | 4 (3 high, 1 medium) | r3 — `6433910` | now() returned ISO but test expected epoch; C.3 conflicting mocks; component scan missed `components/`; secret length < 16 |
| R3 | needs-attention | 2 (1 high, 1 medium) | r4 — `afd3eda` | Client-component exclusion (RightNowCard/ReportModal); deterministic verify-red mutation |
| R4 | needs-attention | 2 (1 high, 1 medium) | r5 — `967e8ae` | StaleFooter waiver path; isClientComponent directive-prologue boundary |
| R5 | needs-attention | 3 (1 high, 2 medium) | r6 — `a9a3f07` | Step 5b TDD ordering; TEST_AUTH_SECRET unset + Bearer undefined; isClientComponent statement-terminator |
| R6 | needs-attention | 3 (1 high, 1 medium, 1 low) | r7 — `ec91fe1` | Step 5b RED test unreliable (minute-floor); stripComments doesn't strip comments; case count |
| R7 | needs-attention | 4 (2 high, 2 medium) | r8 — `57e397f` | New test missing from git add; async StaleFooter breaks sync tests; stripComments line alignment; non-ISO parseable accept |
| R8 | needs-attention | 3 (1 high cross-phase, 2 medium) | r9 — `8d7feff` | F.9 E2E proof didn't isolate server; ISO check too strict (rejects no-ms); stripComments URL-string false-negative |
| **Close** | **approved-by-trajectory** | — | — | **Phase C closed at round-8 soft cap per user direction** ("Apply r8 fixes, declare Phase C approved"). 27 findings across rounds; r9 applied final fixes including lexer-based stripComments + regex-screen ISO + F.9 server-rendered-marker isolation. Trajectory mirrors Phase B's path. Remaining Playwright wiring concerns naturally surface in Phase F's own review (task #17). |

**Phase C converged at round 8** (soft cap, user-approved close). Total findings raised + resolved: 27.

---

## Phase D — `04-components.md`

| Round | Verdict | Findings | Resolved in commit | Notes |
|---|---|---|---|---|
| R1 | needs-attention | 3 (1 critical, 2 high) | r2 — `fa32ef7` | `<Screenshot key=>` (React reserved attr) — cross-phase rename to `name`; jsdom directive missing; nonexistent Tailwind tokens |
| R2 | needs-attention | 4 (1 high, 3 medium) | r3 — `5adf6fd` | F.8 walker still scanned `key=`; Callout text-color tokens stale; spec guard table stale; jsdom directives not line 1 |
| R3 | needs-attention | 2 (1 high, 1 medium) | r4 — `f3206ac` | E.9 used `<RefAnchor id="impersonation-banner">` (kebab) — D.5 rejects; empty Screenshot `name=""` would render `/help/screenshots/-light.webp` |
| R4 | needs-attention | 2 (2 high) | r5 — `2c82467` | RefAnchor h3 vs h2 (Phase E uses as page section); r4 RefAnchor sweep incomplete (sync-health, service-account, step-2, step-3) |
| R5 | needs-attention | 2 (1 high, 1 medium) | r6 — `a0db4b7` | §5.6 matrix lowercase kebab targets vs Phase E catalog-code RefAnchor ids; "expand regex" option contradicted D.5 contract |
| R6 | needs-attention | 2 (1 high, 1 medium) | r7 — `5cd30f8` | E.5 smoke test still required RefAnchor/ALL_CAPS variant; no test resolved §5.6 matrix targets (H.1 only walks MESSAGE_CATALOG.helpHref) |
| **Close** | **approved-by-trajectory** | — | — | **Phase D closed at round-6 soft cap per user direction** ("Declare Phase D approved"). 16 findings across rounds; r7 applied final fixes — E.5 smoke test aligned to plain h2 contract + G.5 matrix-target resolver added. Trajectory mirrors Phase B/C. Remaining edge cases naturally surface in Phase E/G's own reviews. |

**Phase D converged at round 6** (soft cap, user-approved close). Total findings raised + resolved: 16.

---

## Phase E — `05-content.md`

| Round | Verdict | Findings | Resolved in commit | Notes |
|---|---|---|---|---|
| R1 | needs-attention | 3 (3 high) | r2 — `5a2d5d0` | Smoke tests source-grep-only (don't catch invalid MDX); E.7 helpHref to topic page (contradicts §5.6 template-family); E.6/E.8/E.9/E.10/E.12 lack explicit TDD blocks |
| R2 | needs-attention | 4 (3 high, 1 medium) | r3 — `6909c3f` | E.5/E.6 task-local still set non-canonical helpHref; task-local smoke tests still grep-only; E.10 still bare; E.13 test predicate vs page predicate mismatch (dereferences null title) |
| **Close** | **approved-by-trajectory** | — | — | **Phase E closed at round-2 soft cap per user direction** ("Apply remaining r2 fixes, declare approved"). 7 findings across 2 rounds; r3 applied final fixes incl. real-render assertion injected into 9 task-local smoke tests + canonical helpHref sweep + E.10 TDD block + E.13 predicate alignment. Trajectory mirrors Phase B/C/D arc. Remaining content-quality drift surfaces at impeccable v3 close-out (per AGENTS.md invariant #8). |

**Phase E converged at round 2** (soft cap, user-approved close). Total findings raised + resolved: 7.

---

## Phase F — `06-screenshot-harness.md`

| Round | Verdict | Findings | Resolved in commit | Notes |
|---|---|---|---|---|
| R1 | needs-attention | 5 (1 critical, 3 high, 1 medium) | r2 — `c6ae414` | screenshot:help script never started webServer (CRITICAL); setup-project file used default-exported globalSetup (wrong API); port 3003 conflict; F.9 helper queried wrong DOM marker; F.7 missing route-validity assertion |
| R2 | needs-attention | 2 (2 high) | r3 — `434ea4b` | webServer.env doesn't reach test process; F.9 regex missed live ScheduleTile attribute order |
| R3 | needs-attention | 2 (1 high, 1 medium) | r4 — `de07663` | setup-project preflight broke F.9 + direct runs; F.6 still used literal-string attribute assertions (class-sweep miss from F.9) |
| **Close** | **approved-by-trajectory** | — | — | **Phase F closed at round-3 per user direction** ("Declare Phase F approved"). 9 findings across rounds, including 1 critical (script lifecycle). r4 applied final fixes: env-prefixed direct-run commands + attribute-independent F.6 + F.9 assertions. Trajectory mirrors Phase B/C/D/E close-out arc. Remaining edge cases naturally surface at execution time. |

**Phase F converged at round 3** (soft cap, user-approved close). Total findings raised + resolved: 9.

---

## Phase G — `07-affordance-retrofit.md`

| Round | Verdict | Findings | Resolved in commit | Notes |
|---|---|---|---|---|
| R1 | needs-attention | 3 (2 high, 1 medium) | r2 — `a470973` | Missing parse-warning row in §5.6 matrix; G.3 wired UI before walker test (TDD violation); G.5 import path mismatch (lib/help vs app/help/_affordanceMatrix) |
| R2 | needs-attention | 3 (2 high, 1 medium) | r3 — `0f4e19c` | Parse-warning row's single target lost per-code deep link; G.4 hard-coded 12-row count; G.0 sourceSurface not exact UI text |
| R3 | needs-attention | 3 (2 high, 1 medium) | r4 — `f172c74` | TemplateFamilyRow type didn't match new row's shape; parse-warning family duplicated existing `error-message` family; G.0 only walked concrete rows |
| **Close** | **approved-by-trajectory** | — | — | **Phase G closed at round-3 per user direction** ("Declare Phase G approved"). 9 findings across rounds. r4 collapsed parse-warning row into existing error-message template-family (clean structural fix). Trajectory mirrors Phase B/C/D/E/F. Remaining edges (if any) naturally surface in Phase H review or at execution. |

**Phase G converged at round 3** (soft cap, user-approved close). Total findings raised + resolved: 9.

---

## Phase H — `08-auth-integration.md`

(Pending — task #19.)

---

## Phase I — `09-close-out.md`

(Pending — task #20.)
