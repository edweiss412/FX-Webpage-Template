# Duration tokens emit no CSS — @theme alias fix

**Date:** 2026-07-27 · **Branch:** `fix/duration-tokens-emit-no-css` · **Status:** ratified (autonomous ship approved this session)
**Closes:** `BL-DURATION-TOKENS-EMIT-NO-CSS` (BACKLOG.md:831) · `DESTRUCT-DURATION-TOKENS-1` (DEFERRED.md:186)

## 1. Problem

Tailwind v4 resolves the `duration-<name>` utility from the `--transition-duration-<name>` theme namespace. This repo's `@theme` block (`app/globals.css:43`) defines `--duration-instant/fast/normal/slow` (`app/globals.css:222-225`) — the wrong namespace — so `duration-fast` / `duration-normal` classes compile to **nothing**. Every element carrying them falls back to Tailwind's default transition duration (150ms via `--default-transition-duration`), and the `@media (prefers-reduced-motion: reduce)` override that zeroes `--duration-*` (`app/globals.css:417-423`) never reaches any Tailwind-utility transition. That reduced-motion gap is the a11y defect this spec fixes.

The affected class sites are widespread across `app/` and `components/` — `duration-fast` dominates, `duration-normal` is common, `duration-slow`/`duration-instant` have no class sites today (exemplar: `components/crew/CrewSubNav.tsx:86`, `transition-colors duration-fast`). No exact site count is stated here deliberately: counts of this class proved grep-flavour dependent and drew findings in three consecutive review rounds of the agenda-fold docs, and the ratified resolution was to drop the number and keep the mechanism claim (`docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md` §5.2; enforced by `tests/docs/agendaFoldDocConsistency.test.ts:104-115`).

**Scope-accurate coverage claim:** the aliases fix every transition that carries a *named* `duration-<name>` utility (and every future one). Elements using a bare `transition-*` utility with NO named duration class keep Tailwind's 150ms default and remain outside the reduced-motion collapse — e.g. `app/me/page.tsx:246`, `components/shared/CardReportTrigger.tsx:90`, `components/crew/primitives/SourceLink.tsx:72`. That residual class is out of scope here (§8) and gets its own backlog row (§5).

### 1.0 Probe evidence (empirical spike, run 2026-07-27 on this branch)

Compiled with the repo's own `@tailwindcss/cli` 4.2.4 (`package.json:102`), probe HTML `<div class="duration-fast duration-normal duration-slow duration-150 transition">`:

- **Current shape** (`@theme { --duration-fast: 120ms; --duration-normal: 220ms; }`): output contains `.duration-150` but **no `.duration-fast` / `.duration-normal` rule**. Backlog claim confirmed.
- **Alias shape** (same + `--transition-duration-fast: var(--duration-fast); --transition-duration-normal: var(--duration-normal);`): output contains
  ```css
  .duration-fast {
    --tw-duration: var(--transition-duration-fast);
    transition-duration: var(--transition-duration-fast);
  }
  ```
  and the emitted theme layer's root scope carries `--transition-duration-fast: var(--duration-fast);`. The var chain terminates at the existing source token, so the reduced-motion override that sets `--duration-fast: 0ms` propagates to every Tailwind-utility transition with no further change.

## 1.1 Resolved scope — do not relitigate

| Decision | Disposition | Ratification |
| --- | --- | --- |
| **Alias, not rename.** `--duration-*` stays the source of truth; `--transition-duration-*` are four alias lines chaining to it. | User chose approach A over the backlog's literal rename this session (2026-07-27). Rename would sweep ~30 `var(--duration-*)` consumers (globals.css keyframes, inline styles at `components/admin/review/ReviewModalShell.tsx:487` and `ReviewModalShell.tsx:509`, arbitrary `animate-[...]` values, test regexes incl. the token-drift guard `tests/components/admin/wizard/Step3ReviewModal.test.tsx:2407-2412`) for identical runtime behavior. | This spec §2; user answer in session |
| **All four tokens aliased**, including `slow`/`instant` with zero current class sites. | Prevents the identical silent-inert trap for the next `duration-slow` class. 2 extra lines. | This spec §2 |
| **Timing change is intended behavior, not regression.** Every `duration-fast` class site moves 150ms→120ms; every `duration-normal` site moves 150ms→220ms; reduced-motion users move 150ms→0ms on all of them. | These are the values DESIGN.md:240-243 always specified; 150ms was the silent fallback. | DEFERRED.md:186 ("treat as an accessibility fix") |
| **Residual bare-`transition-*` sites are out of scope.** Elements with no named duration class keep the 150ms default and stay outside the reduced-motion collapse; filed as a new backlog row (§5), not fixed here. | Fixing them means a judgement call per site (add a duration class vs accept default) — a sweep, not a token fix. | This spec §1, §5, §8 |
| **No consumer sweep.** `var(--duration-*)` consumers are NOT converted to Tailwind classes; the hand-written `[data-agenda-day-chevron]` rule (`app/globals.css:721-723`) stays hand-written. Comments referencing the old gap are updated, nothing else. | Out of scope; behavior-neutral churn. | This spec §3 |
| **No new e2e spec file.** Browser assertions land in the already-CI-wired `tests/e2e/crew-section-toggle.spec.ts` (runs in `crew-e2e.yml:142`; that file is matched ONLY by the mobile-safari project — `playwright.config.ts:76-78` excludes it from desktop-chromium — so the browser oracle is WebKit-only, matching the file's single-writer seed discipline). | A new spec file would be born CI-dark (same class as `BL-E2E-LIFECYCLE-SPECS-CI-DARK`, BACKLOG.md:956 — every e2e workflow runs an explicit spec list) and would need a `tests/ci/_metaE2eWorkflowCoverage.test.ts` allowlist row or its own workflow. | This spec §4 T2 |
| **Ledger disposition:** BACKLOG entry graduates to `BACKLOG-archive.md`; DEFERRED entry gets a resolution UPDATE note in place (it is an audit-provenance record, not an active item). | Graduation meta-test `tests/docs/_metaDeferralLedgerGraduation.test.ts` enforces the archive move. | This spec §5 |

## 2. The change

`app/globals.css`, inside `@theme`, immediately after `--duration-slow: 360ms;` (line 225):

```css
/* Tailwind v4 resolves the `duration-<name>` utility from the
   `--transition-duration-<name>` namespace, NOT `--duration-<name>`. These
   aliases chain the utility namespace to the source tokens above so
   `duration-fast` etc. emit real CSS, and the prefers-reduced-motion
   override below (which zeroes `--duration-*`) propagates through the
   var() chain to every `duration-<name>` utility.
   (BL-DURATION-TOKENS-EMIT-NO-CSS; probe evidence in the 2026-07-27 spec.) */
--transition-duration-instant: var(--duration-instant);
--transition-duration-fast: var(--duration-fast);
--transition-duration-normal: var(--duration-normal);
--transition-duration-slow: var(--duration-slow);
```

No other runtime CSS or component change. The reduced-motion block (`app/globals.css:417-423`) is untouched — the chain does the work.

## 3. Comment / doc updates (stale-claim sweep)

Every live claim that the project "never defines `--transition-duration-*`" becomes false the moment §2 lands. Sweep (grep seed: `grep -rn "transition-duration" app tests docs DESIGN.md`):

1. `app/globals.css:714-720` — the `[data-agenda-day-chevron]` comment block. Rewrite: the rule stays hand-written (it predates the aliases and keeps the transition co-located with its `details[open]` sibling selector), but the "this project never defines it" rationale is replaced with a pointer to the §2 aliases.
2. `tests/e2e/agendaScheduleLayout.spec.ts:358-360` — same stale rationale in the comment above the chevron test. Comment-only edit; assertions unchanged (they test the hand-written rule, which still holds).
3. `docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md:670-705` — carries `grep -c "transition-duration-fast" app/globals.css -> 0` as "the load-bearing fact" plus the "never defines" prose. Add a dated **UPDATE 2026-07-27** note (this branch, this spec) stating the gap is closed; do not rewrite the historical analysis. `tests/docs/agendaFoldDocConsistency.test.ts:114` requires `/transition-duration-fast/` to keep matching — the note satisfies it trivially; re-run that test file. The UPDATE note must not introduce a site count (that file's "no un-sourced count" assertions scan both documents).
4. `docs/superpowers/plans/2026-07-26-agenda-perday-viewer-fold.md:71` (pins the alias grep count to zero) and `2026-07-26-agenda-perday-viewer-fold.md:263` ("A Tailwind `duration-fast` class emits NOTHING here … also misses the reduced-motion block") — the PLAN half of the same document pair, missed by the spec-only sweep. Same treatment: dated UPDATE note per stale claim (or a bracketed correction inline on the checklist row), no counts, historical analysis intact. Covered by the same doc-consistency test run.
5. `DESIGN.md` §5 motion (table at 240-243, reduced-motion paragraph at 267): add one sentence documenting that Tailwind `duration-*` utilities resolve through the `--transition-duration-*` aliases chained to these tokens, so utility classes and direct `var()` consumption are equally reduced-motion-safe.

## 4. Tests (TDD order: both red before §2 lands)

**T1 — compile-emission structural test**, a NEW vitest file at tests/design/durationTokenEmission.test.ts plus a committed fixture pair at tests/design/fixtures/duration-probe.css / duration-probe.html (plain-text paths — files are created by this branch; test colocated with `tests/design/statusDegradedToken.test.ts`). The fixture CSS `@import`s the real `app/globals.css` (relative path) and `@source`s the fixture HTML, which carries ALL FOUR named classes (`duration-instant duration-fast duration-normal duration-slow` + `transition`) — so every alias is a live utility candidate regardless of what app code uses (today `slow`/`instant` have zero class sites; without the probe, deleting those aliases would stay green). Compiled via the repo's `node_modules/.bin/tailwindcss` CLI (`execFileSync`, tmp output dir; measured ≈130ms). Asserts on the compiled output, for EACH of the four names:

- a `.duration-<name>` rule exists with `transition-duration: var(--transition-duration-<name>)`;
- the theme layer declares `--transition-duration-<name>: var(--duration-<name>)` (chain proof);

plus one terminus assertion: a `prefers-reduced-motion: reduce` block zeroes `--duration-fast`, `--duration-normal`, AND `--duration-slow` (`--duration-instant` is 0ms by value and deliberately absent from that block — `app/globals.css:417-423`).

*Failure mode caught:* wrong/renamed namespace (this bug), a Tailwind upgrade changing the resolution namespace, or deletion of ANY of the four aliases. Not a source-regex tautology: it exercises the real compiler. *Red pre-fix:* the emission and chain assertions fail (no rules emitted — probe §1.0). Witnessed red 2026-07-27 (2 failed pre-alias in the initial fast/normal shape; the four-name shape generalizes it).

**T2 — computed-value browser assertions**, added to `tests/e2e/crew-section-toggle.spec.ts` (wired: `crew-e2e.yml:142`; mobile-safari project only per §1.1 — the browser oracle is WebKit). The crew page's sub-nav tab carries a literal `duration-fast` class (`components/crew/CrewSubNav.tsx:86`). Two assertions:

- default media: `getComputedStyle(tab).transitionDuration` equals the `--duration-fast` value read from `app/globals.css` at test time (120ms → `"0.12s"`), not hardcoded — a token edit moves the expectation (anti-tautology: derived from the data source);
- after `page.emulateMedia({ reducedMotion: "reduce" })` + reload: `transitionDuration` is `"0s"` — the reduced-motion a11y contract, proven on a real Tailwind-utility transition for the first time.

*Failure mode caught:* aliases present in source but not reaching the browser (layer/order/purge regressions); reduced-motion chain broken. *Red pre-fix:* default media reads `"0.15s"` (Tailwind fallback), reduced-motion reads `"0.15s"` too.

### Dimensional Invariants

None — the diff adds no component, no layout container, and no fixed-dimension parent. It is a token block, comments, docs, and tests.

### Transition Inventory

No new visual states or state pairs are introduced. The change alters the *duration* of existing single-property transitions app-wide (150ms fallback → the token values components always declared) and activates the reduced-motion collapse for them; it adds no transition that needs pair enumeration. The affected-behavior inventory is §1.1's timing-change row.

## 5. Ledger graduation (same PR)

Ordered TDD steps — the registry row lands FIRST so the meta-test witnesses red before the move:

1. **Registry row (the fail-first mechanism, red):** add `{ id: "BL-DURATION-TOKENS-EMIT-NO-CSS", provenance: "fix/duration-tokens-emit-no-css" }` to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts:123` with a dated comment (matching the existing row idiom). Run the meta-test and witness it FAIL: the id is registered as graduated but still sits in the active queue / not in the archive. The row is what makes the meta-test enforce archive presence + provenance for THIS id — moving the entry without the row leaves the test blind to the move.
2. **Archive move (green):** `BL-DURATION-TOKENS-EMIT-NO-CSS` (root `BACKLOG.md`, line 831) → move to `BACKLOG-archive.md` with resolution line (PR #, branch, this spec path). Reconciliation header (root `BACKLOG.md`, line 7) gets the dated note per the 2026-07-27 convention. Meta-test now green.
- `DESTRUCT-DURATION-TOKENS-1` (root `DEFERRED.md`, line 186) → append **UPDATE 2026-07-27: fixed** note naming this branch/spec (entry stays in place as audit provenance; mirror the existing update-note idiom in that file; verify the wording does not trip the meta-test's terminal-status matcher).
- **File the residual-gap row:** new `BL-BARE-TRANSITION-NO-DURATION-CLASS` entry in root `BACKLOG.md` — bare `transition-*` sites with no named duration class keep Tailwind's 150ms default and sit outside the reduced-motion collapse (exemplars: `app/me/page.tsx:246`, `components/shared/CardReportTrigger.tsx:90`, `components/crew/primitives/SourceLink.tsx:72`); trigger: next motion/a11y pass. No site count in the entry (grep-flavour precedent, §1).
- Run `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` green.

## 6. Invariants touched

- **Invariant 8 (impeccable dual-gate):** applies — `app/globals.css` `@theme` change. Run `/impeccable critique` + `/impeccable audit` on the diff before adversarial close-out; findings + dispositions to the handoff doc.
- **Invariants 2/3/9/10:** N/A — no DB, no locks, no Supabase calls, no mutation surfaces.
- **Invariant 1 (TDD):** §4 tests land red first.
- **Invariant 6 (commit style):** cross-cutting token wiring → bare-type commits (`fix: …`, `test: …`, `docs: …`).
- **Routing:** UI-owned change → Opus / Claude Code (this session). Correct per the hard rule.

## 7. Verification gates

1. `pnpm test` full local suite green (T1 red→green witnessed; drift guards at `Step3ReviewModal.test.tsx:2407` and `tests/docs/agendaFoldDocConsistency.test.ts` re-run and green).
2. Local Playwright run of `crew-section-toggle.spec.ts` green on the mobile-safari project (T2 red→green witnessed; desktop-chromium does not match this file, §1.1).
3. `pnpm spec:lint docs/superpowers/specs/2026-07-27-duration-tokens-emit-no-css.md` output attached to the adversarial-review dispatch.
4. Impeccable dual-gate (§6).
5. Whole-diff Codex cross-model review APPROVE; real CI green; merge; `git rev-list --left-right --count main...origin/main` == `0 0`.

## 8. Out of scope

- Converting `var(--duration-*)` consumers to utility classes.
- Bare `transition-*` sites with no named duration class (150ms default, outside reduced-motion collapse) — filed as `BL-BARE-TRANSITION-NO-DURATION-CLASS` per §5, not fixed here.
- Any change to token *values* (120/220/360ms stay).
- The sibling backlog rows from the same audit (`BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`, `BL-FOCUS-RING-CONTRAST`).
- Framer-motion surfaces (`components/right-now/RightNowCard.tsx:360` documents why they are token-independent; unchanged).
