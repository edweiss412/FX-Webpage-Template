# Plan: near-miss candidate render (phase 1)

**Spec:** `docs/superpowers/specs/2026-08-26-nearmiss-candidate-render.md` (APPROVED, spec review round 3, 0 findings).
**Row:** `BL-NEARMISS-CANDIDATE-RENDER`. **Branch:** `feat/nearmiss-surface`. **Base:** `b30413cf5`.
**Out of scope:** `BL-TYPO-NORMALIZED-V4-VENUE-SHAPE` is phase 2 of this arc and is not planned here.

Every task is TDD per invariant 1: failing test, minimal implementation, passing test, one commit. The `red=` on each marker is the command that must fail before the implementation and pass after.

## Pre-draft code-verification pass

Run before drafting, not during self-review. Every file, symbol, testid, line, and test-file path cited below was read on this base. Three things it caught, recorded because they are the reason the pass is mandatory rather than advisory:

- The arc brief's tap-target anchors are off by one. It cites `components/admin/PerShowActionableWarnings.tsx:281` and `components/admin/wizard/step3ReviewSections.tsx:3129`; those lines are `rel="noopener noreferrer"` and a bare `>`. The real `min-h-tap-min` class lines are `components/admin/PerShowActionableWarnings.tsx:282` and `components/admin/wizard/step3ReviewSections.tsx:3128`. An anchor handed to you by a brief is still an anchor you have to read.
- The step-3 row-label testid at `components/admin/wizard/step3ReviewSections.tsx:3106` has ZERO assertions anywhere in `tests/`. Its only coverage is by visible text at `tests/components/step3SheetCard.test.tsx:819-820`. Tasks 3 and 4 are the first testid-keyed assertions on that row, so there is no local model to copy.
- The empty-fragment detail-band case is covered nowhere: `tests/components/admin/compactAlertCard.test.tsx:25-32` tests `null | undefined | false | ""` and stops. That is why task 2 exists and why it fails on the obvious implementation.

<!-- tasks: depth=2 -->

## Task 1: the guard, over its whole input domain

<!-- task: red=`pnpm vitest run tests/parser/candidateLabel.test.ts` ac=AC-3 -->

RED: a new tests/parser/candidateLabel.test.ts covering spec §5's table, one case per row, including the non-string jsonb cases (`42`, `{}`, `[]`) that a `string | null` signature cannot express. It imports a module that does not exist, so it fails to collect.

GREEN: a new lib/parser/candidateLabel.ts, one exported function taking `unknown`, returning the trimmed string or `null`.

**The defect this catches:** a guard written as `w.candidate ?? null`. It passes every string case and renders `42` or `{}` straight into the DOM from an unvalidated jsonb boundary. The non-string cases are the discriminating ones, so the suite can only go green on the real rule.

## Task 2: the per-show band, and the composition collapse

<!-- task: red=`pnpm vitest run tests/components/perShowActionableWarnings.candidateBand.test.tsx` ac=AC-1,AC-3 -->

RED, three cases, all reading the new shared helper from the appendix below:

1. Candidate present: `per-show-actionable-candidate-value` carries THAT warning's own `candidate`, and `per-show-actionable-row-label-value` still renders. Two bands, one card.
2. Key absent: no `per-show-actionable-candidate`; the row-label band is untouched.
3. Neither row label nor candidate: NO `compact-alert-detail-band` at all.

Case 3 fails on the obvious implementation and is the reason this task is not just markup. Its premise is executable: it asserts first that the warning reached the component and rendered a card, so a fixture that silently rendered nothing cannot pass it vacuously.

GREEN: the band markup at spec §3.2 and the four-state collapse at spec §3.3.

**The defect this catches:** the empty-fragment trap. `present()` at `components/admin/CompactAlertCard.tsx:47` is four inequalities; a JSX fragment is an object and satisfies all four, so wrapping unconditionally renders a bordered but empty band on every card with no detail content.

Keep green, do not edit: `pnpm vitest run tests/components/perShowActionableWarnings.fieldBand.test.tsx` (its `tests/components/perShowActionableWarnings.fieldBand.test.tsx:191-194` pins row-label/field-band mutual exclusivity) and `pnpm vitest run tests/admin/perShowDataQualityActionable.test.tsx`.

## Task 3: the wizard step-3 line

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3CandidateBand.test.tsx` ac=AC-2,AC-3 -->

The same three cases against `wizard-step3-card-${dfid}-warning-${i}-candidate`, reading the same helper.

GREEN: the prose lead-in line at spec §4.2. No `w.code` gate: the guard is on the field, and the field is set on no other code, so a second predicate could only ever agree with the first.

**The defect this catches:** the line rendering the raw field instead of the guarded one, or rendering at all on a warning with no candidate.

## Task 4: step-3 row-label gate parity

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3RowLabelGate.test.tsx` ac=AC-8 -->

RED: a `PULL_SHEET_PARSE_PARTIAL` warning whose `rawSnippet` is a raw pipe row renders NO `wizard-step3-card-${dfid}-warning-${i}-label`. It fails today, because `labelFromRawSnippet` runs ungated at `components/admin/wizard/step3ReviewSections.tsx:3103`.

The same test asserts a sibling `UNKNOWN_FIELD` in the SAME render keeps its label. Without that control, a gate suppressing every label would pass, which is the tautology the first assertion invites.

GREEN: the `w.code === "UNKNOWN_FIELD"` gate, copied from the ratified sibling at `components/admin/PerShowActionableWarnings.tsx:200`.

Verified safe before planning it: the only existing assertions on that label are `tests/components/step3SheetCard.test.tsx:805-821`, for "Floor Plan" and "GS Podium Type", and both of those warnings are `UNKNOWN_FIELD`.

## Task 5: the copy lockstep, one commit

<!-- task: red=`pnpm vitest run tests/messages/_metaWarningCardCopy.test.ts tests/cross-cutting/codes.test.ts` ac=AC-4 -->

Nine sites, spec §6.4, in ONE commit, plus the catalog comment block at `lib/messages/catalog.ts:1324-1339`, which currently asserts as fact the gap this PR closes.

Order that keeps the gates honest: edit the §12.4 table row, edit the §12.4 YAML appendix, run `pnpm gen:spec-codes`, edit `lib/messages/catalog.ts` (four fields plus the comment), edit the §4.2 table row, edit the three registry constants. Stage together.

**The defect this catches:** any one of the nine sites missed. The gates catch different subsets on different axes, which is why the red names two files: `x1` for the §12.4 join, the §4.2 document read for the canonical table, the frozen fixtures for the registry.

Already verified mechanically on the exact strings: `helpfulContext` 246 of 300, `triggerContext` 75 of 160, no em dash, no banned vocabulary, no pipe, straight apostrophes only.

## Task 6: real-browser verification, both surfaces

<!-- task: red=`sh -c 'pnpm exec playwright test tests/e2e/warning-panel-polish.spec.ts tests/e2e/step3-review-modal.interactions.spec.ts -g "candidate"'` ac=AC-6,AC-8 -->

Two different paths, and spec §7.5 gives the reason: a warn-severity row is trimmed out of the step-3 panel on every published surface, so surface B is not reachable from an app route without driving the onboarding wizard through a full folder scan.

Surface A: `tests/e2e/warning-panel-polish.spec.ts` at `/admin?show=<slug>`, which already seeds `shows_internal.parse_warnings` and already carries a candidate-less `UNKNOWN_FIELD`, so the absent case is there for free.

Surface B: `tests/e2e/_step3ReviewModalHarness.tsx`, which mounts the real step-3 modal in a real browser.

**The defect this catches:** both renders passing in jsdom while broken in a browser, plus the narrow-viewport wrap that jsdom cannot compute at all. The wrap is asserted on surface A, where the two bands share one flex container.

## Task 7: invariant-8 dual gate

<!-- task: red=`grep -qE "^impeccable-gate: critique=RAN(-DEGRADED)? audit=RAN(-DEGRADED)? p0=[0-9]+ p1=[0-9]+ dispositions=(recorded|none)$" docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md` ac=AC-7 -->

BEFORE writing any UI code in tasks 2 through 4, run the pre-code mechanical checklist as a checklist, because the dual gate verifies and does not discover: em-dash ban in user-visible copy, apostrophe literals, 44px tap targets, canonical type and token classes (`text-xs/relaxed`, `text-subtle`). No new color token is introduced, so no new contrast pin is owed.

Then `/impeccable critique` AND `/impeccable audit` on the diff with the canonical v3 setup gates. P0 and P1 fixed in-branch: no `DEFERRED.md` escape, per the standing directive on this arc. Findings and dispositions in the closeout section; the marker's grammar is pinned at `tests/docs/_metaInvariant8Closeout.test.ts:254`.

**The defect this catches:** a run that executed critique and skipped audit. The red pins BOTH halves of the marker, not just the first.

## Task 8: graduate the row, last commit

<!-- task: red=`sh -c '! grep -q "^### BL-NEARMISS-CANDIDATE-RENDER" BACKLOG.md'` ac=AC-4 -->

Archive `BL-NEARMISS-CANDIDATE-RENDER` with the render sites, the retargeted copy, and the nine-site lockstep recorded in the entry. Its IN PROGRESS marker comes off in this same commit, because archives reject in-flight entries.

`BL-TYPO-NORMALIZED-V4-VENUE-SHAPE` KEEPS its marker: phase 2 is still live.

Resolve any `BACKLOG.md` conflict by set arithmetic with one extractor on both parents, cutting rows heading to any next heading. Keep-both text resurrects an archived row.

**The defect this catches:** a merge that leaves the row open, or an IN PROGRESS marker reaching main.

<!-- tasks: end -->

## The two mandatory task types, and why each is or is not here

`docs/agents/writing-plans.md` makes two task types mandatory under stated conditions. Both conditions were checked rather than assumed, and the answers are here so a reviewer sees the check happened instead of inferring an omission.

**Layout-dimensions task: NOT required.** The rule fires on a fixed-height or fixed-width parent containing flex or grid children, because Tailwind v4 does not default `.flex` to `align-items: stretch`. Neither new element has such a parent. Surface A's band sits in `CompactAlertCard`'s detail band, `flex flex-wrap items-center gap-x-4 gap-y-1 ... px-3 py-1.5` (`components/admin/CompactAlertCard.tsx:118-119`): content-height, no `min-h`, no `h-full`. Surface B's line sits in `flex min-w-0 flex-1 flex-col gap-0.5` (`components/admin/wizard/step3ReviewSections.tsx:3082`), also content-height. There is no parent-to-child dimension relationship to assert, so a `getBoundingClientRect` equality task would assert nothing.

What DOES need a real browser is the narrow-viewport wrap, and that lives in task 6 rather than in a jsdom suite.

**Transition-audit task: NOT required.** The spec's Transition Inventory has two states and both directions are declared instant. Neither is animated, neither sits inside an `AnimatePresence`, and the state is a pure function of the warning's data: the per-show list is a server component and the wizard list re-renders from a new parse, so nothing toggles the band within a mounted card. There is no exit or initial prop to audit. The compound case holds too: a card whose Ignore or Report control is mid-transition never changes candidate state, because those controls mutate a decision record rather than the warning's fields.

## Appendix A: the shared fixture helper

A new tests/_shared/nearMissWarning.ts, read by tasks 2, 3, and 4.

Fixture: `fixtures/shows/exporter-xlsx/consultants.md`. It yields 5 `UNKNOWN_FIELD` rows; the first is `key='Address:'` with `candidate='VENUE ADDRESS'` and `kind='client'`. Chosen for having several rows rather than exactly one, so a single row's disappearance does not empty the helper.

**It needs a premise on ITSELF**, or a fixture change makes every test reading it vacuously green. Before returning anything it asserts that the parse produced at least one `UNKNOWN_FIELD` and that the one it returns carries a non-empty `candidate`. Both assertions are about the helper's own inputs, so they fail at the helper rather than surfacing as a confusing null-render assertion three files away.

**Both halves of the pair come from the producer.** Take the real warning's key and value, then call `emitUnknownField` twice, once passing `candidate` and once omitting it. Do NOT build the absent case by deleting the key from the present one: spec §7.3 has the probe transcript showing that copy keeps the "looks like" clause in `message`, which a real candidate-less emission does not have.

## Appendix B: the step-3 harness injection point

`tests/e2e/_step3ReviewModalHarness.tsx` builds its parse result as `buildParseResult({ diagrams: harnessDiagrams(), warnings: harnessWarnings(), ...prOverrides })` at `tests/e2e/_step3ReviewModalHarness.tsx:140-143`. **`prOverrides` layers OVER the defaults**, so a new case passes its own `warnings` array and every existing case is untouched.

Do NOT append to `harnessWarnings()` itself. Its length is `HARNESS_CREW_WARNING_COUNT` (`tests/e2e/_step3ReviewModalHarness.tsx:57`), deliberately sized off the callout cap, and lengthening it would silently retune that case.

The new case carries all three warnings in one render so the assertions are a controlled comparison: an `UNKNOWN_FIELD` with a candidate, one without, and a `PULL_SHEET_PARSE_PARTIAL` for AC-8.

## Appendix C: task 5's cell mechanics, verified against the extractor

The §12.4 table row is edited by hand and parsed by index, so these are not stylistic:

1. **`dougFacing` is `cells[2]`** (`scripts/extract-spec-codes.ts:311`), against the header `Code | Where it surfaces | Doug-facing message | Crew-facing message | Follow-up`. A cell containing a pipe splits the row and shifts every later column.
2. **The cell is wrapped in double quotes** in the live row, and `normalizeCell` calls `stripOuterQuotes` (`scripts/extract-spec-codes.ts:163`). Keep them.
3. **The placeholders are LITERAL**, `_<key>_` and `_<sheet-name>_`. A review tool may display them escaped; that is the tool's output, not the file. Writing the escaped form would ship entity text to Doug.

**Column 2 is deliberately not rewritten.** It reads "row whose label nearly matches a known field label", the same assertion spec §6.2 removes from four fields. It stays because it is not operator-facing: it documents where the code surfaces, for developers reading it beside the producer, and it describes today's producer accurately. Rendered-to-Doug versus read-by-developers is the line, and it is worth stating because the sentences look alike.

## Acceptance criteria this plan's tasks claim

Handles only. `docs/superpowers/specs/2026-08-26-nearmiss-candidate-render.md` §11 is the authoritative text, and it is deliberately not duplicated here: two copies of an acceptance criterion drift, and the spec is the one the reviewer reads.

| Id | Handle | Tasks |
|---|---|---|
| AC-1 | Every near-miss card on the per-show surface names its matched suggestion | 2, 6 |
| AC-2 | The same on the wizard step-3 row | 3, 6 |
| AC-3 | A candidate-less warning renders no band, and no string on that card asserts a near-miss | 1, 2, 3, 5 |
| AC-4 | Live copy sites carrying the unrepresentative example go to zero, counted by the spec's own command | 5, 8 |
| AC-5 | All twelve required CI checks green | close-out |
| AC-6 | Both renders verified in a real browser, not only jsdom | 6 |
| AC-7 | Both impeccable halves pass, P0 and P1 fixed in-branch | 7 |
| AC-8 | A `PULL_SHEET_*` warning on the wizard list renders no row label; an `UNKNOWN_FIELD` keeps its | 4, 6 |

AC-5 has no task marker because no `red=` can express it: it is satisfied by real CI on the pushed branch, not by a local command, and a red that shelled out to `gh` would go green on a stale run.

## Gates before every push

`pnpm heavy pnpm test` for the whole tree, then `pnpm typecheck`, `pnpm exec eslint .`, and `pnpm format:check`, each as its own command. Vitest strips types, so a green suite proves nothing about type errors.

Baseline at the pre-implementation head, so a later regression is attributable: eslint 0 errors and 70 warnings, typecheck clean, format clean, and the seven suites these tasks touch green at 146 tests.

## Not in this plan

- Phase 2, `BL-TYPO-NORMALIZED-V4-VENUE-SHAPE`.
- Any mutation score. `tests/mutation/source/registry.ts` holds zero rows under `components/` or `app/`, and the one new module is unenrolled, so no round-1 diff brief for this phase carries a guard-surface declaration.
