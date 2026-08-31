# Plan: theme the finalize progress bar, and settle the three decisions around it

**Rows:** `FINALIZE-PROGRESSBAR-UNTHEMED-1`, `FINALIZE-COMPACT-COUNT-NOUN-1`, `FINALIZE-CAS-PROGRESS-AFFORDANCE-1`, `FINALIZE-PROGRESS-AT-PERCEIVABILITY-1` (all `DEFERRED.md`).
**Branch:** `fix/finalize-progress-polish`. **Base:** `47e9544e6`. **Worktree:** `/Users/ericweiss/FX-worktrees/finalizeprog`.
**Amends:** `docs/superpowers/specs/2026-08-29-step3-finalize-progress-scope.md` (invariant 7: the spec is canonical, so the code and the spec move together).
**Out of scope:** a forced-colors arc will touch `app/globals.css` after this branch lands; this plan adds no `forced-colors` block.

Every task is TDD per invariant 1: failing test, minimal implementation, passing test, one commit. Each marker's `red=` is the command that must fail before the implementation and pass after.

Two of the four rows are DECISION-FENCED. Eric's ruling on rows 3 and 4 arrives mid-arc through bl-orch. Tasks 7 and 8 carry those repairs behind a task boundary so the diff lands either way: if a ruling declines a row, that task is dropped, its row's claim comes off, and the row itself is left untouched in `DEFERRED.md`.

## Pre-draft code-verification pass

Run on `47e9544e6` before drafting. Six things it caught, recorded because they are why the pass is mandatory.

- **The row says six selectors. There are eight.** `app/globals.css` carries `wizard-step2-progressbar` at `app/globals.css:688`, `app/globals.css:696`, `app/globals.css:700`, `app/globals.css:704`, `app/globals.css:717`, `app/globals.css:730`, `app/globals.css:756` and `app/globals.css:757`. `FINALIZE-PROGRESSBAR-UNTHEMED-1` counts the six top-level rules and omits the `prefers-reduced-motion` pair at `app/globals.css:756-757`, which is one comma-grouped rule holding two of the occurrences. A widening that trusts the row's count leaves the finalize bar's reduced-motion behaviour unwidened.
- **That reduced-motion rule does not apply in Chromium or WebKit, and never has.** It mixes `progress::-webkit-progress-bar` and `progress::-moz-progress-bar` in one selector list. A selector list is invalid as a whole if any selector in it is invalid, and an unknown vendor pseudo-element is invalid. Probe below. This is a live accessibility defect on step 2 today, and widening the rule unrepaired would ship the same dead guarantee to the finalize bar.
- **`casPhaseLabel(null)` returns `""`, and React renders that as ZERO child nodes**, so `element:empty` matches and DESIGN.md §7a's `empty:hidden` is available for row 3. Probe below. The critique's wording ("drop the `<p>` entirely") and the house rule reach the same pixels; §7a is ratified and its wrapper-keeping form wins.
- **The compact count's sibling heading has no `truncate` and no `shrink-0`.** `components/admin/wizard/Step3ReviewWithFinalize.tsx:256-262` is the heading; `components/admin/wizard/Step3ReviewWithFinalize.tsx:263-267` is the count, and the count is the one carrying `shrink-0`. So in a squeeze the HEADING is what yields, silently, exactly the shape DESIGN.md §7a's section-header note describes. This is why row 2 is a measurement and not a copy edit.
- **A shipped test pins the bare count.** `tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:322-335` asserts `not.toContain("1 of 2 shows")` and its body records the bare form as deliberate. That test is row 2's RED, and it is only rewritten if the measurement licenses it.
- **One row-4 citation has drifted by one line.** The row cites `components/admin/FinalizeButton.tsx:1016`; the fifth `aria-hidden` is at `components/admin/FinalizeButton.tsx:1015`. The other nine (`components/admin/FinalizeButton.tsx:976`, `components/admin/FinalizeButton.tsx:993`, `components/admin/FinalizeButton.tsx:1004`, `components/admin/FinalizeButton.tsx:1022`; `Step3ReviewWithFinalize.tsx:259`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:264`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:281`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:289`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:292`) are exact. The claim itself holds: every visible string in both renderers is `aria-hidden`.

### Probe 1 — a mixed-vendor selector list is dropped in two of three engines

Run against `@playwright/test`'s bundled browsers, three rules on one page: `#a` pure webkit, `#b` a webkit+moz list, `#c` pure moz. Reported from `document.styleSheets`, so it reports what each engine PARSED rather than what it painted.

```
=== chromium
  selectorText="progress#a::-webkit-progress-bar"
=== webkit
  selectorText="progress#a::-webkit-progress-bar"
=== firefox
  selectorText="progress#a::-webkit-progress-bar"
  selectorText="progress#b::-webkit-progress-bar, progress#b::-moz-progress-bar"
  selectorText="progress#c::-moz-progress-bar"
```

Chromium and WebKit keep only the pure-webkit rule: the mixed list `#b` is gone. Firefox keeps all three, because it aliases `progress::-webkit-progress-bar` for web compatibility. So `app/globals.css:756-757` reduces motion in Firefox alone, and Doug is on a phone, which is WebKit.

Repo-wide sweep for the shape, derived rather than enumerated: `git ls-files -z '*.css' '*.ts' '*.tsx' | xargs -0 grep -n '::-webkit-progress\|::-moz-progress\|::-ms-fill'` returns ten lines, four of them prose inside a comment block. Every rule selector among them is single-vendor except `app/globals.css:756-757`. **One instance, repaired in this branch; the class is closed by the sweep, not by a list.**

### Probe 2 — React's empty string leaves no text node

jsdom, `@testing-library/react`, three sibling `<p>` elements:

```
empty-string: childNodes=0 matches(:empty)=true  html=""
null-child:   childNodes=0 matches(:empty)=true  html=""
nonempty:     childNodes=1 matches(:empty)=false html="Applying your edits…"
```

`{""}` and `{null}` are indistinguishable in the DOM, so `empty:hidden` suppresses the CAS phase-label element exactly when `casPhaseLabel` returns `""`, with no conditional in the JSX.

## Meta-test inventory

Mandatory per `docs/agents/writing-plans.md`, which accepts "none applies" only with a declared reason.

**This plan creates no structural meta-test. It EXTENDS two registries and REWRITES one guard's claim.**

1. `tests/docs/_metaDeferralLedgerGraduation.test.ts:72` holds `GRADUATED`, the DEFERRED-side registry. Task 8 adds each row that actually graduates. A row whose ruling declines it is NOT added, because it does not leave the open queue.
2. `tests/docs/designSevenAEmptyHiddenSites.test.ts` walks `components/**` for `empty:hidden` and fails when DESIGN.md §7a's "Current sites" list does not name every component using it. Task 6 adds `empty:hidden` to two components, so §7a's list gains both names in the same commit. This guard is the task's RED contract.
3. `tests/styles/progressShimmerPseudoElements.test.ts:70-88` case `(c)` requires the comma-grouped reduced-motion rule BY NAME: its regex demands `…::-webkit-progress-bar\s*,\s*…::-moz-progress-bar` and its failure message reads "missing comma-grouped reduced-motion rule". **The guard asserts the defect.** Task 2 rewrites it to require two separate rules, and that rewrite is licensed by probe 1, not by convenience. This is the one place in the plan where a test changes shape, and it changes because its claim about browsers is false.

The five registries the writing-plans rule names are Supabase call boundaries (`tests/auth/_metaInfraContract.test.ts`), sentinel hiding (`tests/components/tiles/_metaSentinelHidingContract.test.ts`), `admin_alerts.upsert` completeness (`tests/messages/_metaAdminAlertCatalog.test.ts`), advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) and no-inline-email-normalization (`tests/admin/no-inline-email-normalization.test.ts`). This diff touches no Supabase call, no DB write, no advisory lock, no `admin_alerts` row and no email path, so none gains a member.

**No new meta-test is proposed for the vendor-pseudo shape.** The obvious candidate is a walker asserting no selector list mixes vendor prefixes. Its population is one file, its done condition is a property of the walker, and the 2026-08-25 process mint freeze declines exactly that. The contract is held instead by task 2's executable browser assertion, which measures the computed animation rather than the selector text.

## Mutation enrolment

`grep -n sourcePath tests/mutation/source/registry.ts` on this base lists 68 enrolled surfaces. None is `app/globals.css`, `components/admin/FinalizeButton.tsx` or `components/admin/wizard/Step3ReviewWithFinalize.tsx`. **No enrolled surface is touched, no score is owed, and none is enrolled under review pressure.**

## Test harness

The three real-browser obligations (row 1's paint, row 1's reduced-motion repair, row 2's measurement) share one harness, built on the repo's live-entry pattern rather than a new dev route.

`tests/e2e/standalone.config.ts` starts no server and needs no database: each spec boots its own `node:http` server on port 0. `testMatch` is an explicit allow-list, so a new spec runs nowhere until its filename is added. `tests/e2e/helpers/liveEntryToolchain.ts` bundles a real component tree with esbuild and compiles `app/globals.css` through Tailwind with an `@source` pointing at the component, which is what makes the CSS under test the shipped CSS. Dark mode is `page.evaluate` setting `data-theme` on the root, the form used at `tests/e2e/section-header-visual.spec.ts:168`.

No existing e2e reaches the finalize RUNNING state. The state is reached in jsdom at `tests/components/admin/finalizeTransitionAudit.test.tsx:116-146` by pushing `{type:"listed",total}` then `{type:"row",done,total,name}` into a controllable NDJSON stream from `tests/components/admin/_finalizeStreamHarness.ts`. The live entry replays that same sequence from the host page.

## Acceptance criteria

- AC-1 — The finalize progressbar paints `var(--color-accent)` on its filled track in Chromium, in both themes, and paints no platform accent.
- AC-2 — Every one of the eight step-2 selector occurrences also matches `wizard-finalize-progressbar`.
- AC-3 — Under `prefers-reduced-motion: reduce`, the indeterminate track's computed `animation-name` is `none` in Chromium, for both testids.
- AC-4 — `ProgressPanel`'s docstring makes no claim the stylesheet contradicts.
- AC-5 — The footer's height at 375px is measured with and without the count noun, across a ladder of counts, and the numbers are recorded in this plan.
- AC-6 — Row 2 ships the noun only if AC-5's measurement holds the footer height, and the 2026-08-29 spec's §3.2 unchanged-list and §3.3 dimensional table move with it.
- AC-7 — (ruling-gated) The CAS phase renders no empty element, and DESIGN.md §7a names every component carrying `empty:hidden`.
- AC-8 — (ruling-gated) The CAS sub-phase reaches assistive technology.
- AC-9 — Every graduating row is archive-only, names its branch, and carries no IN PROGRESS marker on the merge commit.

## Dimensional invariants

The compact readout sits in the sticky footer, whose height is load-bearing (`components/admin/wizard/Step3ReviewWithFinalize.tsx:159-164` records the layout shift Doug flagged). The 2026-08-29 spec §3.3 states three relationships. Row 2 puts a fourth under test, and it is the one that decides the row.

| Parent to child | Relationship | Guaranteed by |
| --- | --- | --- |
| `wizard-step3-footer-center` (`min-h-12 w-full max-w-md`) to `wizard-step3-tracking` | The tracking block never exceeds the reserved 48px, so the footer's height is the same running as idle | The reserved `min-h-12` plus every line inside the tracking block being exactly one line |
| Heading row (`flex items-baseline justify-between gap-2`) to the heading span | The heading occupies exactly one line at 375px | Nothing today. The span carries neither `truncate` nor `shrink-0`, so it is the flexible item and it WRAPS when the count grows. **This is the invariant row 2's measurement tests.** |
| Heading row to the count span | The count never shrinks or wraps | `shrink-0 tabular-nums` (`components/admin/wizard/Step3ReviewWithFinalize.tsx:264`) |
| `wizard-step3-tracking` to the subline | One line at any name length | `truncate` (`components/admin/wizard/Step3ReviewWithFinalize.tsx:273`), unchanged |

Tailwind v4 here does not default `.flex` to `align-items: stretch`; this plan introduces no new flex parent.

## Transition inventory

Row 3, if its ruling lands, adds a visual state. The states of the progress surface are **A** batch (determinate bar, count, subline), **B** CAS with an empty phase label, **C** CAS with a phase label. Three states, three pairs.

| Pair | Treatment |
| --- | --- |
| A to B | Instant. The subtree is replaced on the phase change; today's behaviour and unchanged. |
| B to C | Instant. Under row 3 the phase-label element goes from suppressed to painted, which is a `display` change and is not animatable. |
| A to C | Does not occur directly: the CAS phase is always entered before the first phase event, so A reaches C through B. |

Compound: a phase event arriving in the same commit as the batch-to-CAS transition is one `setState`, so B is passed through within a single commit rather than painted. Under row 3 that means the element is never painted empty even for one frame. There is no `AnimatePresence` and no `motion.*` in either renderer, and none is added; `tests/components/admin/finalizeTransitionAudit.test.tsx` already walks both renderers times both phases and stays green.

## Guard conditions

| Input | Rendered |
| --- | --- |
| `casPhase: null` | Under row 3, no phase-label element at all (`element:empty` matches, `empty:hidden` applies). Today, an empty element charging the column's `gap`. |
| `total: 0` | No count and no noun. The existing `state.total > 0` guard (`components/admin/wizard/Step3ReviewWithFinalize.tsx:263`) is unchanged, so row 2 adds no new empty-string case. |
| `total: 1` | `1 of 1 show`, singular, matching the panel's existing `state.total === 1 ? "" : "s"` (`components/admin/FinalizeButton.tsx:1006`). |
| `done > total` | Existing `Math.min` clamp, unchanged. |
| A count wider than the ladder measured in task 4 | The measurement reports the width at which the heading wraps; beyond it the noun does not ship. This is the row's decision, not a runtime guard. |
| `prefers-reduced-motion: reduce` | Indeterminate track paints a static centred accent hint, no animation, in every engine. Today: in Firefox only. |

## Invariants

| Invariant | Bearing |
| --- | --- |
| 1 TDD per task | Every task is failing test first. Task 4 is a measurement whose recorded numbers are its deliverable, and its assertion is written against them. |
| 2 Advisory lock | Untouched. No lock acquired, released or nested. |
| 5 No raw error codes in UI | No new codes, no `lib/messages` change. |
| 7 Spec is canonical | The 2026-08-29 spec's §3.2 unchanged-list, §3.3 dimensional table and §5's "No Playwright task" line all move with the code, in the commits that move it. |
| 8 UI quality gate | `components/**` and `app/globals.css` touched, so the impeccable pair runs before the whole-diff review and the closeout marker line is written by task 8. |
| 9 Supabase call boundary | No new Supabase call sites. |
| 10 Mutation-surface observability | No mutating route or action on the diff. |
| 11 Worktree | `/Users/ericweiss/FX-worktrees/finalizeprog`, branched off `origin/main` at `47e9544e6`. |
| 12 Ledger | Four rows claimed at Stage 0 and pushed; graduating rows archived in the PR's last commit. |

## Do not relitigate

| Decision | Ratified at |
| --- | --- |
| The batch phase's `<progress>` plus `FinalizeAnnouncer` split is sound; the perceivability defect is CAS-phase only. Do not add double-announcement to the batch phase. | `DEFERRED.md` `FINALIZE-PROGRESS-AT-PERCEIVABILITY-1`; `components/admin/FinalizeButton.tsx:459-469` records why completion goes through the channel and not the local announcer. |
| `casPhaseLabel(null)` returning `""` is deliberate, not a bug. Row 3 suppresses the ELEMENT, never changes the function. | `components/admin/FinalizeButton.tsx:122-125`. |
| The bare compact count is the current correct state. The earlier fix was reverted and the revert stands until a measurement licenses otherwise. | `tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:322-335`. |
| No per-row publish claim on the progress stream; no publish count on the CAS phase. | `docs/superpowers/specs/2026-08-29-step3-finalize-progress-scope.md` §2.1, §7. |
| Rows 3 and 4 are Eric's calls. This plan stages them; it does not decide them. | Arc brief, the arc brief. |
| This arc files no new ledger row of any facing. Unrepairable peers go in the PR body under "Unfixed peers". | the common arc brief; AGENTS.md process mint freeze, 2026-08-25. |

<!-- tasks: depth=2 red-contract -->

## Task 1 — a real-browser harness, and the finalize bar joins the themed pair

<!-- task: red=`pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-finalize-progress.layout.spec.ts` red-state=authored red-target=`app/globals.css:688` why=`the new spec asserts the finalize progressbar's filled track computes to the FXAV accent, and app/globals.css styles wizard-step2-progressbar alone, so the finalize bar paints the UA default and the assertion fails on the production stylesheet rather than on anything test-local; the SAME command greens within this task when the eight selector occurrences widen. Harness and widening are ONE task because the marker contract is red-then-green on one command, and a task that ends red cannot satisfy it` ac=AC-1,AC-2 -->

**RED.** Create tests/e2e/_step3FinalizeProgressLiveEntry.tsx and tests/e2e/step3-finalize-progress.layout.spec.ts, following `tests/e2e/blocked-row-resolver-transitions.spec.ts:65-125` for the workDir, the served HTML page, the `node:http` server on port 0 and the teardown. `test` and `expect` come from `./helpers/fontFidelityFixture`, not from `@playwright/test`.

The entry mounts two trees under one root: `FinalizeButton`, taking `wizardSessionId` and `publishCount` (`components/admin/FinalizeButton.tsx:922`), for the panel renderer; and `Step3ReviewWithFinalize` for the compact renderer. It drives both by intercepting `window.fetch` on the finalize route with a controllable NDJSON stream, replaying the sequence `tests/components/admin/finalizeTransitionAudit.test.tsx:116-146` uses: a `listed` event carrying the total, then `row` events carrying `done`, `total` and `name` for the batch phase; a result with `all_batches_complete` then a `phase` event for CAS. The host advances it through window hooks, the read-back shape of `tests/e2e/_blockedRowResolverLiveEntry.tsx:36-41`.

Bundle with `bundleLiveEntry` (`tests/e2e/helpers/liveEntryToolchain.ts:74`), aliasing `next/navigation` to `tests/e2e/_nextNavigationStub.ts` and `node:crypto` to `tests/e2e/_nodeCryptoStub.ts`. Every other server-tree edge `Step3ReviewWithFinalize` reaches through `Step3Review` and `Step3SheetCard` terminates on a module whose prologue is the server directive, which the bundler's own plugin cuts automatically (`tests/e2e/helpers/_bundleLiveEntryChild.mjs:64`); `packlist-rescan-recovery.spec.ts` is the precedent for that exact subtree. Pass `metafilePath` and assert zero inputs matching `googleapis|postgres|google-auth-library`, so a future import reaching the browser graph fails here rather than silently bloating the bundle.

Compile the CSS with `compileEntryCss` (`tests/e2e/helpers/liveEntryToolchain.ts:131`), the entry stylesheet built as source directives for both renderers and for the live entry itself, followed by the whole of `app/globals.css` (the multi-source form at `tests/e2e/resolve-label-layout.spec.ts:84-96`). The compiled output must be written inside the served workDir: the helper appends the Inter face with a bare sibling source and copies the woff2 next to it.

AC-1: with the batch phase running, the finalize progressbar's filled track computes to the resolved value of the accent token, in light and in dark. Read it with one `page.evaluate` calling `getComputedStyle(el, "::-webkit-progress-value")`, never through two `Locator` reads, because actionability scrolls between them.

**GREEN.** Widen all EIGHT occurrences of the step-2 selector in `app/globals.css` (`app/globals.css:688`, `app/globals.css:696`, `app/globals.css:700`, `app/globals.css:704`, `app/globals.css:717`, `app/globals.css:730`, `app/globals.css:756`, `app/globals.css:757`) so each rule's selector list also carries the finalize form. Both renderers emit that testid on a native progress element (`components/admin/FinalizeButton.tsx:983`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:270`), so no component changes. Update the block's leading comment, which says "wizard Step 2" and now covers both surfaces.

AC-2 asserts the two testids resolve to the same computed values across the four track states. **On its own that assertion is tautological**: two UNSTYLED progress elements also match each other, so it would have passed before the widening. It is therefore written with an executable premise, `premise` from `tests/_shared/premise.ts`, asserting the shared value is the accent token's resolved value and NOT the UA default, immediately above the equality. AC-1 is the discriminator; AC-2 is the class guarantee that a later token change cannot split the pair. Recorded here because a sibling-equality check that can pass while both siblings are broken is exactly the shape the anti-tautology rule exists to catch, and this plan wrote it before catching it.

Registration, all three steps or the unit suite reds:

- Add this alternative to the `testMatch` alternation at `tests/e2e/standalone.config.ts:86`:

  ```
  step3-finalize-progress\.layout
  ```

  The dot is escaped, as in every existing member. Do not append the spec suffix: the regex already carries it.
- Regenerate the standalone baseline with `node scripts/check-standalone-baseline.mjs --write` and commit it. `tests/ci/_metaSpecRegistration.test.ts:82-84` checks it.
- No workflow edit. `.github/workflows/standalone-e2e.yml:70-71` runs the whole config with no spec list.

## Task 2 — the reduced-motion override is dead in two of three engines

<!-- task: red=`pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-finalize-progress.layout.spec.ts` red-state=authored red-target=`app/globals.css:756` why=`the new case emulates prefers-reduced-motion reduce and reads the indeterminate track's computed animation-name in Chromium, where the comma-grouped webkit-plus-moz selector list at :756-757 is invalid as a whole and the rule is dropped, so the shimmer still animates and the assertion fails against the production stylesheet; the SAME command greens when the list is split into two single-vendor rules` ac=AC-3 -->

Probe 1 above is the evidence: Chromium and WebKit drop the whole rule, Firefox keeps it. Split `app/globals.css:755-760` into two rules, one per vendor pseudo-element, with the same declarations. Widen both to carry the finalize testid, as task 1 did for the other six occurrences.

`tests/styles/progressShimmerPseudoElements.test.ts:70-88` case `(c)` requires the comma-grouped form by name and its message reads "missing comma-grouped reduced-motion rule". **That guard asserts the defect**, so it is rewritten to require two separate single-vendor rules, each inside a `prefers-reduced-motion: reduce` block, each setting `animation: none`. The rewrite is licensed by the probe, not by convenience: without it the guard would red on a repair that makes the browser behaviour correct. The rewritten case keeps the media-block anchoring the original had.

Class-sweep, derived rather than enumerated: `git ls-files -z '*.css' '*.ts' '*.tsx' | xargs -0 grep -n '::-webkit-progress\|::-moz-progress\|::-ms-fill'` returns ten lines on this base, four of them prose inside a comment. Every rule selector among the remaining six is single-vendor except `app/globals.css:756-757`. Re-run the sweep after the repair and confirm it returns no mixed list.

## Task 3 — the panel docstring claims something the stylesheet contradicts

<!-- task: red=`pnpm vitest run tests/styles/progressShimmerPseudoElements.test.ts` red-state=authored red-target=`components/admin/FinalizeButton.tsx:955` why=`the new case asserts the ProgressPanel docstring makes no same-tokens claim while the finalize testid is absent from app/globals.css; before task 1's widening the docstring says "same tokens, same native bar" and the stylesheet names only the step-2 testid, so the pair is contradictory and the case fails; it greens once the docstring states what is true after the widening` ac=AC-4 -->

`components/admin/FinalizeButton.tsx:955` claims the panel "mirrors `<Step2Verify>`'s scan panel (same tokens, same native bar)". Before task 1's widening that was false. After it, that is true for the bar and still loose about tokens, since the two panels differ in padding and surface. Rewrite the sentence to say what the code does: the two wizard progress surfaces share the bar's styling through `app/globals.css`, and the panel's own container tokens are its own.

**Four pre-dispatch mutants, because this is a string-presence guard.** Run each before the diff review and record the result in the commit: (a) the docstring sentence emptied; (b) the sentence present with an appended suffix; (c) the sentence present but not live, moved into a neighbouring comment block so it exists in the file and not on the symbol the assertion reads; (d) the stylesheet side varied, the finalize testid removed from `app/globals.css` with the docstring left claiming the shared bar. A guard that survives (c) or (d) is reading the file rather than the pair, and is not the guard this task claims.

The assertion pairs the docstring with the stylesheet so neither can drift alone: if `app/globals.css` names both testids then the docstring may claim the shared bar, and if it names only one then the claim must be absent. That is a real coupling, not a spelling check.

## Task 4 — measure the footer at 375px, with and without the count noun

<!-- task: red=`pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-finalize-progress.layout.spec.ts` red-state=authored red-target=`components/admin/wizard/Step3ReviewWithFinalize.tsx:256` why=`the new case pins the footer's height at 375px against the reserved min-h-12 and pins the heading span to a single line, and it is authored to fail first by asserting the noun-bearing variant's numbers before the measurement has been taken, so the ladder must actually be run to write them; the heading span at :256 carries neither truncate nor shrink-0, which is the production line that decides whether the assertion can hold` ac=AC-5 -->

At a 375px viewport, in the compact renderer, running, batch phase, measure in ONE `page.evaluate` per sample (a `getBoundingClientRect` read per element, never two `Locator` calls, because actionability scrolls between them):

- `wizard-step3-footer-center` height
- `wizard-step3-tracking` height
- `wizard-step3-tracking-heading` height and its line count, derived as `getClientRects().length`

Ladder, each sampled bare and with the noun appended: `1 of 2`, `9 of 12`, `12 of 12`, `99 of 120`, `120 of 120`. The noun follows the panel's existing rule, `show` at `total === 1` and `shows` otherwise (`components/admin/FinalizeButton.tsx:1006`).

Record the full table in this section of the plan, in the same commit. The numbers are the deliverable; report them to bl-orch. **This task decides nothing.** If the heading stays one line and the footer height is unchanged across the whole ladder, task 5 ships. If it wraps at any rung, task 5 is dropped, row 2 keeps its deferral, and the rung where it wrapped goes to bl-orch.

The premise is stated executably with `premise` from `tests/_shared/premise.ts` immediately above the assertion: the sample must actually be in the running batch phase with `total > 0`, because a sample that never entered it renders no count at all and every height comparison would then be between two identical idle footers reporting a confident pass.

## Task 5 — the count says what it counts (gated on task 4)

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx` red-state=authored red-target=`components/admin/wizard/Step3ReviewWithFinalize.tsx:265` why=`the new case asserts the compact count contains "1 of 2 shows" while :265 renders the bare "of" form with no noun, so it fails on the production render; the SAME command greens when the noun lands. The existing case at :322-335 asserting not.toContain the noun is REPLACED in this task, and its ratification comment is rewritten to cite task 4's measurement rather than deleted` ac=AC-6 -->

**Runs only if task 4's ladder held the footer height at every rung.** Otherwise this task does not exist and row 2 stays deferred.

Append the noun to `components/admin/wizard/Step3ReviewWithFinalize.tsx:265`, matching the panel's singular rule exactly.

`tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:322-335` is the test that pins the bare form. Its body is a ratification record, so the replacement states what changed and why: the plan settled the bare form without a measurement because that worktree could not start a dev server, this arc took the measurement, and here are the numbers. A test comment that records a decision is rewritten when the decision changes, never quietly deleted.

Invariant 7, in the same commit: `docs/superpowers/specs/2026-08-29-step3-finalize-progress-scope.md` §3.2's "Unchanged:" line currently opens with "the `N of M` count", which stops being true; §3.3's dimensional table gains the heading-row relationship this plan's table states; and §5's closing "No Playwright task" line is superseded by task 1's spec, with the reason recorded (that section's own justification was "there is nothing for it to protect", and the footer height under a widened count is exactly such a thing).

## Task 6 — the CAS phase renders no empty element (ruling-gated)

<!-- task: red=`pnpm vitest run tests/docs/designSevenAEmptyHiddenSites.test.ts` red-state=authored red-target=`components/admin/FinalizeButton.tsx:1021` why=`the task adds empty:hidden to the CAS phase-label elements in both renderers while DESIGN.md §7a's Current sites list names only OverviewSection, ScheduleDayRow and TravelSection, and the guard walks components/** for the idiom and fails on any file the list does not name; the SAME command greens when §7a names both components. The behavioural half is a browser assertion that the CAS column's height with a null phase equals its height with the element absent` ac=AC-7 -->

**Runs only if Eric's ruling takes row 3.** The ruling may take any subset of the critique's three recommendations; this task's body covers the third, which is the only one that is a defect rather than a design addition. If the ruling takes the settled batch line or the indeterminate CAS bar, those are added here as separate commits with their own failing tests.

`casPhaseLabel(state.casPhase)` returns `""` for a null phase, and both renderers paint an element for it (`components/admin/FinalizeButton.tsx:1017-1023`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:292-294`), so a `gap-2` column and a `gap-1` column each spend a gap on nothing. Probe 2 above settles the mechanism: React leaves zero child nodes for `{""}`, `element:empty` matches, and DESIGN.md §7a's `empty:hidden` is the ratified idiom. It keeps the documented slot, which a bare conditional would not.

The critique's wording was "drop the `<p>` entirely". The house rule reaches the same pixels and is ratified, so it wins; recorded here so the divergence is deliberate rather than a misread.

DESIGN.md §7a's "Current sites" list gains both component names in the same commit. Do not narrow the guard's walk.

**The transition-audit obligation is discharged by an existing suite, extended.** `tests/components/admin/finalizeTransitionAudit.test.tsx` already walks both renderers times both phases and is the plan's transition-audit task. This task adds the B to C pair from the inventory above: with the CAS phase entered and no phase event yet, the phase-label element is suppressed; when the first phase event arrives it paints, with no animation on either side. The suite must stay green unmodified in every other respect, and its two documented limits (jsdom-unparseable selectors treated as non-matching, aliased Framer imports) are unchanged and not reopened.

## Task 7 — the CAS sub-phase reaches assistive technology (ruling-gated)

<!-- task: red=`pnpm vitest run tests/components/admin/FinalizeButton.test.tsx` red-state=authored red-target=`components/admin/FinalizeButton.tsx:481` why=`the new case drives the CAS phase to applying and asserts the announcer's text names that sub-phase, while liveMessage at :481 keys on phase alone and returns the constant "Finishing setup", so the assertion fails on the production reducer; the SAME command greens when the sub-phase folds in` ac=AC-8 -->

**Runs only if Eric's ruling takes row 4.** The call is announcement cadence: one utterance per phase today, up to four under the change.

`liveMessage` (`components/admin/FinalizeButton.tsx:481-486`) returns `"Finishing setup"` for every CAS sub-phase, so the three labels `casPhaseLabel` renders are never announced. Fold the sub-phase in, keeping the phase-alone message for a null `casPhase` so entry into CAS still announces once.

Two fences the file already sets and this task must not cross: completion goes through the channel and NOT the local announcer (`components/admin/FinalizeButton.tsx:459-469`), and the batch phase's `<progress>` plus announcer split stays as it is. If the ruling declines this row, note that task 6's indeterminate progress element (if that half lands) gives the CAS group a perceivable child on its own, which narrows row 4 without closing it; that goes in the PR body under "Unfixed peers", not into a new ledger row.

## Task 8 — close out

<!-- task: red=`sh -c 'set -e; P=docs/superpowers/plans/2026-08-31-finalize-progress-polish.md; if ! grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9][0-9]*) p1=(0|[1-9][0-9]*) dispositions=(recorded|none)$" "$P"; then exit 1; fi; if grep -qE "^\*\*Status:\*\* IN PROGRESS" DEFERRED.md; then exit 1; fi'` red-state=live red-target=`docs/superpowers/plans/2026-08-31-finalize-progress-polish.md:1` why=`two independent conjuncts, each red on the tree as it stands and neither able to short-circuit the other: the plan carries no impeccable-gate marker line until this task writes one, and DEFERRED.md carries four IN PROGRESS markers this task removes. Written as if-blocks under set -e rather than an && chain so each failure is observed on its own line. The red-target is this plan, because the missing marker line IS the surface: DEFERRED.md is a root file and a bare filename is not legal in a marker` ac=AC-9 -->

Runs after the impeccable pair and the whole-diff review, as the PR's last commit.

Every row whose task actually shipped moves from `DEFERRED.md` to `DEFERRED-archive.md`, its archived section naming this branch, and its id joins `GRADUATED` at `tests/docs/_metaDeferralLedgerGraduation.test.ts:72` with a comment recording what shipped and why. A row whose ruling declined it does NOT graduate: its IN PROGRESS marker comes off and the row is left in the open queue untouched.

Every remaining `**Status:** IN PROGRESS` marker for this branch comes off in this commit, before the merge. A marker that reaches main names a branch the merge deleted and reds `tests/docs/_metaLedgerInProgress.test.ts`.

The `impeccable-gate:` marker line is written here and nowhere earlier: `tests/docs/_invariant8Closeout.ts:49` treats any non-conforming `impeccable-gate:` line as malformed and one malformed line reds the unit, so a placeholder would be worse than nothing.

<!-- tasks: end -->

## Impeccable dispositions

Written by task 8. The pair runs on the whole diff, before the whole-diff Codex review.

## Round economy

Rounds restart at 1 on this branch, keyed by `git merge-base origin/main HEAD`. Cap is four per stage. At the cap the filing goes in the branch directory under `docs/review-rounds/fix/finalize-progress-polish/`, and any later brief states the closed criterion only.

## Self-review record

Run before the plan dispatch, per `docs/agents/writing-plans.md`. What it caught, recorded because these are the findings that would otherwise have been round-1 findings.

- **The AC-2 sibling-equality assertion was tautological as first written.** Two unstyled progress elements match each other, so the check would have passed before the widening. Repaired in task 1 with an executable premise pinning the shared value away from the UA default.
- **Tasks 1 and 2 were split across the red and the green of one command.** The marker contract is red-then-green on the SAME command within one task, and a task that ends red cannot satisfy it. Merged.
- **`red-state=live` was claimed for a command that could not express a verdict yet.** The playwright command names a spec file that does not exist at plan time, so it exits non-zero for a collection reason rather than the stated one. Both playwright markers are `red-state=authored`, and the one live marker (task 8) was RUN: it exits 1 on this tree, and the marker form it will write is accepted by the same regex, so the cycle can complete in both directions.
- **A string-presence guard shipped without its four mutants.** Task 3 now carries them.
- **The transition-audit obligation had no owner.** It is the existing audit suite, extended by task 6, and that is now stated.

Lint: `pnpm spec:lint` on this plan reports 0 hard, 11 advisory. The advisories are `CITATION_SYMBOL_UNMATCHED` on range citations that name a region rather than a symbol, `NUMERIC_NOUN_MISMATCH` on ordinary English words the recogniser pairs with numbers, and one `COPY_STRAIGHT_APOSTROPHE` inside a verbatim quotation of `components/admin/FinalizeButton.tsx:955`. That last one is deliberate: correcting the apostrophe would misquote the source line the task is about.
