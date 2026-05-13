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

(Pending — task #14.)

---

## Phase D — `04-components.md`

(Pending — task #15.)

---

## Phase E — `05-content.md`

(Pending — task #16.)

---

## Phase F — `06-screenshot-harness.md`

(Pending — task #17.)

---

## Phase G — `07-affordance-retrofit.md`

(Pending — task #18.)

---

## Phase H — `08-auth-integration.md`

(Pending — task #19.)

---

## Phase I — `09-close-out.md`

(Pending — task #20.)
