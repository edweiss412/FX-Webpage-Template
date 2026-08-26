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

## Before the first UI task, and therefore before the task region

Round 1 caught this as a placement defect: the pre-code mechanical checklist used to live inside the dual-gate task, which runs LAST, so a contributor executing tasks in order could not satisfy it. It is a precondition, not a task, and it belongs here.

Run it as a checklist before writing any UI code in tasks 2, 3, and 4, because the invariant-8 dual gate VERIFIES and does not discover:

- Em-dash ban in user-visible copy, and apostrophe literals.
- 44px tap targets. The two sibling deep links are at `components/admin/PerShowActionableWarnings.tsx:282` and `components/admin/wizard/step3ReviewSections.tsx:3128`.
- Canonical type and token classes: `text-xs/relaxed`, `text-subtle`.
- No new color token is introduced, so no new contrast pin is owed.

## Meta-test inventory

Mandatory per `docs/agents/writing-plans.md:19`, which accepts "none applies" only when the reason is declared.

**This plan creates no structural meta-test and extends none.** The registries that rule names are Supabase call boundaries (`tests/auth/_metaInfraContract.test.ts`), sentinel hiding in optional text (`tests/components/tiles/_metaSentinelHidingContract.test.ts`), `admin_alerts.upsert` catalog completeness (`tests/messages/_metaAdminAlertCatalog.test.ts`), advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`), and no-inline-email-normalization (`tests/admin/no-inline-email-normalization.test.ts`). This diff touches no Supabase call boundary, no DB write, no advisory lock, no `admin_alerts` row, and no email path, so none of the five has a new member to register.

The one registry it DOES touch is already structural and already total: `WARNING_CARD_COPY_CODES` in `tests/messages/warningCardCopyRegistry.ts:35` holds `UNKNOWN_FIELD` already, and `tests/messages/_metaWarningCardCopy.test.ts` walks every member. Task 6 changes the frozen expectations for an existing member; it adds no member, so the walker's population is unchanged and no new registry row is owed.

**Deliberately NOT proposing a new meta-test for the render guard.** The obvious candidate is a walker asserting that every surface reading `ParseWarning.candidate` guards it. There are two such surfaces, both in this diff, both directly asserted by tasks 3 and 4. A walker over a population of two, added by the arc that creates the population, is a guard whose done condition is a property of itself rather than a number anyone would notice moving.

<!-- tasks: depth=2 -->

## Task 1: the guard, over its whole input domain

<!-- task: red=`pnpm vitest run tests/parser/candidateLabel.test.ts` ac=AC-3 -->

RED: a new tests/parser/candidateLabel.test.ts covering spec §5's table, one case per row, including the non-string jsonb cases (`42`, `{}`, `[]`) that a `string | null` signature cannot express. It imports a module that does not exist, so it fails to collect.

GREEN: a new lib/parser/candidateLabel.ts, one exported function taking `unknown`, returning the trimmed string or `null`.

**A round-trip over the WHOLE corpus vocabulary, because round 2 caught that two cases were not enough.** An earlier draft tested only `"VENUE ADDRESS"` and its padded form, both already uppercase, so an implementation that trimmed AND uppercased passed the entire red while corrupting `"Client Phone"` and `"Backdrop / Scenic"`. Canonicalization mistaken for normalization is an ordinary contributor error, not an adversarial one.

The case is derived, not hand-listed: read the distinct `candidate` values out of `tests/parser/__fixtures__/fieldNearMiss.baseline.json` and assert each round-trips BYTE-IDENTICAL. There are 10, and two of them do the real work: `"DIagrams"` has an internal capital that any normalization destroys, and `"Backdrop / Scenic"` carries mixed case, spaces, and a slash. Derived rather than enumerated so a vocabulary change extends the cover instead of stranding it.

**The defects this catches:** a guard written as `w.candidate ?? null`, which passes every string case and renders `42` or `{}` straight into the DOM from an unvalidated jsonb boundary; and any implementation that alters the spelling of a value it accepts.

## Task 2: the per-show band, and the composition collapse

<!-- task: red=`pnpm vitest run tests/components/perShowActionableWarnings.candidateBand.test.tsx` ac=AC-1,AC-3 -->

RED, three cases, all reading the new shared helper from the appendix below:

1. Candidate present: `per-show-actionable-candidate-value` carries THAT warning's own `candidate`, and `per-show-actionable-row-label-value` still renders. Two bands, one card.
2. Key absent: no `per-show-actionable-candidate`; the row-label band is untouched.
3. Neither row label nor candidate: NO `compact-alert-detail-band` at all.

**The three cases do not have the same status against today's code, and the plan says so rather than letting a reviewer discover it by running them.** Case 1 FAILS today, because nothing renders the candidate; it is the red. Cases 2 and 3 PASS today, trivially, because nothing renders at all. Case 3 is the only one that fails on the OBVIOUS WRONG implementation, so it is a regression guard rather than a red, and that is exactly what earns it a place: it is the sole assertion standing between a correct collapse and an empty bordered band on every card with no detail content.

Each absence case carries an executable premise: it asserts first that the warning reached the component and rendered a card, so a fixture that silently rendered nothing cannot pass it vacuously.

**Two more cases, added across rounds 2 and 3, each killing a different wrong implementation.**

Round 2: a warning whose persisted `candidate` is the NUMBER `42` renders no band. That fails on a direct `w.candidate` read, which would put `42` in the DOM.

Round 3: a warning whose `candidate` is `"  VENUE ADDRESS  "` renders the band with the value TRIMMED. Round 3 caught that all ten committed candidates are already trimmed, so `42` alone still licenses a local `typeof w.candidate === "string" ? w.candidate : null` at each call site, which passes every other case and renders padding into the DOM. A padded input is the only one that separates the guard's rule from the nearest wrong rule.

**A sixth case, pinning the GRAMMAR and not just the value.** A concurrent second reviewer of the round-3 head found that every case above is satisfied by rendering the bare guarded value: nothing requires the `Looks like` label or the wrapper nesting the spec settled. So the present-case assertion also requires that `per-show-actionable-candidate` contains the literal `Looks like` AND a `per-show-actionable-candidate-value` descendant. Without it the settled markup is optional and the band would ship as a naked string beside the row label.

**What these cases can and cannot establish, stated so it is not re-raised.** Together they pin the BEHAVIOR and the MARKUP at this call site: no non-string, no padding, no absent key, and the band's shape. They cannot prove that `candidateLabel` is the function called, because a byte-identical inline duplicate is observationally identical, and a test asserting otherwise would be asserting call structure rather than output. That is deliberate. The defect worth catching is divergent behavior between the two surfaces, and pinning both against the same rule catches it whichever way the code is factored.

GREEN: the band markup at spec §3.2 and the four-state collapse at spec §3.3.

**The defect this catches:** the empty-fragment trap. `present()` at `components/admin/CompactAlertCard.tsx:47` is four inequalities; a JSX fragment is an object and satisfies all four, so wrapping unconditionally renders a bordered but empty band on every card with no detail content.

Keep green, do not edit: `pnpm vitest run tests/components/perShowActionableWarnings.fieldBand.test.tsx` (its `tests/components/perShowActionableWarnings.fieldBand.test.tsx:191-194` pins row-label/field-band mutual exclusivity) and `pnpm vitest run tests/admin/perShowDataQualityActionable.test.tsx`.

## Task 3: the wizard step-3 line

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3CandidateBand.test.tsx` ac=AC-2,AC-3 -->

The same SIX cases against `wizard-step3-card-${dfid}-warning-${i}-candidate`, reading the same helper, and with the same split of status: case 1 is the red, the rest are regression guards that pass today. None of the non-string, padded, or grammar cases is optional here: every one of those gaps was found on BOTH surfaces, and repairing one surface would leave the class open on the other, which is the drip this project's round economy exists to prevent. Surface B's grammar case asserts the line reads `Looks like ` followed by the candidate in a mono descendant, which is this surface's flatter rendering of the same information grammar (spec §4.1).

GREEN: the prose lead-in line at spec §4.2. No `w.code` gate: the guard is on the field, and the field is set on no other code, so a second predicate could only ever agree with the first.

**The defect this catches:** the line rendering the raw field instead of the guarded one, or rendering at all on a warning with no candidate.

## Task 4: step-3 row-label gate parity

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3RowLabelGate.test.tsx` ac=AC-8 -->

RED: a warning from EACH `PULL_SHEET_*` producer, both carrying a raw pipe row, renders NO `wizard-step3-card-${dfid}-warning-${i}-label`. Both, because round 2 caught that a single fixture licenses a gate excluding only that one code while `PULL_SHEET_AMBIGUOUS_FORMAT` keeps rendering a fake label, which is narrower than both the stated implementation and AC-8's `PULL_SHEET_*` claim. The two producers are `lib/parser/pull-sheet.ts:252` (`rawSnippet: nonFiveColumnRow`) and `lib/parser/pull-sheet.ts:343` (`rawSnippet: row`).

**And a THIRD fixture whose code is neither**, because two PULL codes plus one `UNKNOWN_FIELD` still cannot separate the stated gate from its negative twin `!w.code.startsWith("PULL_SHEET_")`: those two implementations agree on all three. An `UNKNOWN_ROLE_TOKEN` carrying a pipe-bearing `rawSnippet` separates them, since the negative gate renders a label for it and `w.code === "UNKNOWN_FIELD"` does not. A concurrent second reviewer of the round-3 head found this; an accept-set fails CLOSED on the unknown case and a deny-set fails OPEN, which is why the fixture set has to contain a member of neither family.

It fails today, and the failure is measured rather than inferred: `labelFromRawSnippet` splits on the first `" | "`, so `"| 2x | Shure SM58 | wireless | Case 3 |"` yields `"| 2x"`, which is non-empty and therefore renders as a field label that is not in the sheet.

The same test asserts a sibling `UNKNOWN_FIELD` in the SAME render keeps its label. Without that control, a gate suppressing every label would pass, which is the tautology the first assertion invites.

GREEN: the `w.code === "UNKNOWN_FIELD"` gate, copied from the ratified sibling at `components/admin/PerShowActionableWarnings.tsx:200`.

Verified safe before planning it: the only existing assertions on that label are `tests/components/step3SheetCard.test.tsx:805-821`, for "Floor Plan" and "GS Podium Type", and both of those warnings are `UNKNOWN_FIELD`.

## Task 5: the copy lockstep, one commit

<!-- task: red=`sh -c 'grep -q "NOTHING renders it" lib/messages/catalog.ts && exit 1; pnpm vitest run tests/messages/_metaWarningCardCopy.test.ts tests/cross-cutting/codes.test.ts'` ac=AC-4 -->

**The RED comes first here too, and round 1 caught that an earlier draft had this backwards.** Both named suites exist and are GREEN at the base, because every one of the nine sites currently agrees on the old copy. Editing the lockstep inputs first and running afterwards is not a TDD cycle, it is a change followed by a confirmation.

So the failing observation is made by moving the FROZEN EXPECTATIONS first, which is where this surface's test actually lives:

**RED.** Update the three frozen constants in `tests/messages/warningCardCopyRegistry.ts` to the new strings: `EXPECTED_HELPFUL_CONTEXT`, `EXPECTED_TRIGGER_CONTEXT`, and `EXPECTED_LONG_EXPLANATION`. Nothing else moves. `tests/messages/_metaWarningCardCopy.test.ts` now fails, because `lib/messages/catalog.ts` and the §4.2 document still carry the old strings, and it byte-compares both against the frozen set.

**GREEN.** Then the six remaining sites, in this order so the gates stay honest: the §12.4 table row (`dougFacing`), the §12.4 YAML appendix (`helpfulContext`), `pnpm gen:spec-codes`, `lib/messages/catalog.ts` (four fields plus the comment block at `lib/messages/catalog.ts:1324-1339`), and the §4.2 table row. `tests/cross-cutting/codes.test.ts` is in the red command because x1 goes red the moment §12.4 and the catalog disagree, which they do throughout the middle of this edit, and green only when both land.

**Measured, so a reviewer running the reds is not surprised.** Task 5's command PASSES at this head: `pnpm vitest run tests/messages/_metaWarningCardCopy.test.ts tests/cross-cutting/codes.test.ts` reports 15 passed. Tasks 1 through 4 exit 1 today, but incidentally, on "No test files found, exiting with code 1" rather than on an assertion.

That difference is presentational, not structural. Every task here authors its failing observation first and then satisfies it; tasks 1 through 4 happen to get a non-zero exit for free because the file they author does not exist yet, and task 5's test surface already exists so its failing observation has to be written INTO it. The frozen-expectations move is that writing. What would be a real defect, and what round 1 correctly caught, is a task that edits the implementation first and runs the command afterwards as a confirmation.

**The comment is IN the red, because round 2 caught that no suite can see it.** `_metaWarningCardCopy` imports catalog VALUES and reads the §4.2 document; `codes.test.ts` compares runtime fields with generated ones. Neither reads a comment. So all nine copy sites could be correct while `lib/messages/catalog.ts:1334` still says the candidate "is computed and attached but NOTHING renders it" and the work "is filed as BL-NEARMISS-CANDIDATE-RENDER", both false the moment tasks 2 and 3 land.

The red therefore fails while that sentence survives. It is a crude assertion on one phrase rather than a comment-semantics guard, and deliberately so: the replacement text is authored in this task, the phrase is unique in the file, and a guard that tried to judge comment truth would be a process surface with no done condition. See the replacement block prepared for this task.

All nine sites, and the gate that catches each being missed, are enumerated in spec §6.4. One commit.

**The defect this catches:** any one of the nine sites missed. The gates catch different subsets on different axes, which is why the red names two files: x1 for the §12.4 join, the §4.2 document read for the canonical table, the frozen fixtures for the registry.

Already verified mechanically on the exact strings: `helpfulContext` 246 of 300, `triggerContext` 75 of 160, no em dash, no banned vocabulary, no pipe, straight apostrophes only.

## Task 6: real-browser verification, both surfaces

<!-- task: red=`sh -c 'pnpm exec playwright test tests/e2e/warning-panel-polish.spec.ts -g "candidate" && pnpm exec playwright test tests/e2e/step3-review-modal.interactions.spec.ts -g "candidate" && node scripts/check-standalone-baseline.mjs --list-check'` ac=AC-6,AC-8 -->

**Two commands, not one selection.** Round 1 caught that Playwright applies `-g` across the COMBINED selection, so a single invocation naming both files exits zero as soon as EITHER file contributes a matching test. Omitting surface B entirely would have gone green. Run separately and AND them: each invocation then requires at least one matching test in its own file, and Playwright's default fails a run that selects none.

Two different paths, and spec §7.5 gives the reason: a warn-severity row is trimmed out of the step-3 panel on every published surface, so surface B is not reachable from an app route without driving the onboarding wizard through a full folder scan.

**Surface A:** `tests/e2e/warning-panel-polish.spec.ts` at `/admin?show=<slug>`, which already seeds `shows_internal.parse_warnings` and already carries a candidate-less `UNKNOWN_FIELD`, so the absent case is there for free. It gains one entry with a candidate.

**Surface B, and round 1 corrected how it is reached.** An earlier draft said the harness's `prOverrides` carries the new warnings. That is true of the harness function and FALSE of the browser: the live entry the interactions suite mounts calls `buildSectionData()` with no arguments at `tests/e2e/_step3ReviewModalLiveEntry.tsx:88`, and the spec never imports the harness. A per-case override cannot reach the page.

The mechanism to use is the one that entry already has. It reads `URLSearchParams` at `tests/e2e/_step3ReviewModalLiveEntry.tsx:76` and gates two existing variants on `?deferActions=1` and `?resolution=1` (`tests/e2e/_step3ReviewModalLiveEntry.tsx:77-78`). Add a third flag in the same idiom, and pass the warnings through the first parameter of `buildSectionData`, which is `prOverrides: Partial<ParseResult> = {}` (`tests/e2e/_step3ReviewModalHarness.tsx:129-130`):

```
const NEAR_MISS = params.get("nearMiss") === "1";
...
modalElement(buildSectionData(NEAR_MISS ? { warnings: nearMissHarnessWarnings() } : {}), { ... })
```

Every existing case navigates without the flag and therefore passes `{}`, which is byte-identical to today's `buildSectionData()`. That is what makes "every existing case is untouched" a true claim rather than a hopeful one.

The variant carries all three warnings in one render so the assertions are a controlled comparison: an `UNKNOWN_FIELD` with a candidate, one without, and a `PULL_SHEET_PARSE_PARTIAL` for AC-8.

**This task also regenerates the standalone baseline, which round 2 caught and the plan did not know about.** `tests/e2e/step3-review-modal.interactions.spec.ts` runs under `tests/e2e/standalone.config.ts:85`, and `tests/e2e/standalone-baseline.json:493` enumerates that file's EXACT test identities. `tests/ci/_metaSpecRegistration.test.ts:82` requires exact agreement, so adding a test necessarily drifts it: the Playwright commands would pass while the unit suite and standalone CI go red.

Regenerate with `node scripts/check-standalone-baseline.mjs --write` and commit the changed `tests/e2e/standalone-baseline.json` in this task. The red carries `--list-check` so the task cannot go green having skipped it.

**The defect this catches:** both renders passing in jsdom while broken in a browser, plus the narrow-viewport wrap that jsdom cannot compute at all. The wrap is asserted on surface A, where the two bands share one flex container.

## Task 7: invariant-8 dual gate

<!-- task: red=`sh -c 'P=docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md; grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9][0-9]*) p1=(0|[1-9][0-9]*) dispositions=(recorded|none)$" $P || exit 1; grep -q "^### Findings and dispositions" $P || exit 1; grep -q "^### Pre-code checklist result" $P || exit 1; exit 0'` ac=AC-7 -->

The pre-code mechanical checklist is a PRECONDITION and runs before tasks 2 through 4, not here. See the section above the task region; round 1 caught it placed after the code it was meant to precede.

Run `/impeccable critique` AND `/impeccable audit` on the diff with the canonical v3 setup gates. P0 and P1 fixed in-branch: no `DEFERRED.md` escape, per the standing directive on this arc. Findings and dispositions go in the closeout section of this plan.

**The red mirrors the repository's ACTUAL grammar**, and round 1 caught two things wrong with an earlier version. The grammar is `RAN_FORM` at `tests/docs/_invariant8Closeout.ts:45`, whose integers reject leading zeros: `p0=(0|[1-9]\d*)`. A `[0-9]+` would accept `p0=00`, making this task green while `_metaInvariant8Closeout` stays red. The line an earlier draft cited, `tests/docs/_metaInvariant8Closeout.test.ts:254`, is a TEMPLATE-form fixture inside a deliberately-failing case, not the executable rule.

**What this red proves, and what nothing local can.** It proves three artifacts exist: a well-formed marker line, a findings-and-dispositions section, and a pre-code checklist result. Round 3 pushed on the marker alone being forgeable, correctly, so the red now requires the whole record rather than the one line a fabricator would think to write.

It still CANNOT prove the gates ran, and no command in this repository can. The guard says so about itself: "this walker and its guard verify that a declaring plan unit CARRIES a well-formed gate claim, not that the impeccable gate actually ran or that its findings are honest" (`tests/docs/_invariant8Closeout.ts:11-16`), and it names a fabricated marker "a deliberate lie in a reviewed diff, reviewer territory". That is a ratified boundary, not an oversight in this plan.

So AC-7 splits the way AC-5 already does. Its RECORDING half is mechanical and this red covers it. Its SUBSTANTIVE half, that two interactive gates were actually run by a person, is established by the diff review, exactly as AC-5's "real CI green" is established by CI rather than by a local command that would pass on a stale run. The earlier claim that this red catches "a run that executed critique and skipped audit" was false and is withdrawn rather than reworded.

## Task 8: graduate the row, last commit

<!-- task: red=`sh -c 'grep -qE "^#{2,3} BL-NEARMISS-CANDIDATE-RENDER" BACKLOG.md && exit 1; awk "/^#+ BL-NEARMISS-CANDIDATE-RENDER/{f=1;next} f&&/^#/{f=0} f" BACKLOG-archive.md > /tmp/nm-entry.txt; test -s /tmp/nm-entry.txt || exit 1; grep -q "IN PROGRESS" /tmp/nm-entry.txt && exit 1; for t in "Resolution:" "dougFacing" "triggerContext" "nine-site"; do grep -q "$t" /tmp/nm-entry.txt || exit 1; done; exit 0'` ac=AC-4 -->

**Five conditions now, across two rounds of narrowing.** Round 1 caught that asserting only "the heading left `BACKLOG.md`" passes on a delete, a rename, or a move anywhere at all, including into the archive with the marker intact. Round 2 caught that even those three pass on moving the entry VERBATIM: the task's GREEN requires the entry to record the settled four-field rewrite and the nine-site lockstep, and none of the three conditions observes the entry's content.

So: gone from `BACKLOG.md`; a non-empty entry block PRESENT in `BACKLOG-archive.md`; no `IN PROGRESS` in that block; the block carries a `Resolution:` line; and the block mentions `triggerContext`.

**Three rounds narrowed this one red, and the history is kept because each found a different way for it to lie.**

Round 1: asserting only "the heading left `BACKLOG.md`" passes on a delete, a rename, or a move anywhere at all.

Round 3: the extractor was broken in the OTHER direction. `awk "/^### BL-.../,/^### /"` uses an END pattern that also matches its START, so awk closed the range on the same line and emitted the heading alone. Probed: one line out, both body greps failing on a CORRECT entry. A red that cannot pass on the right implementation is the same defect as one that passes on the wrong one, wearing the other face.

Round 4, and a concurrent second reviewer of the same head, found the two remaining holes. The `###`-only terminator runs away, because the archive's newest entries are `##` (405 of them against 114 `###`), so the block ran 990 lines and BORROWED a neighbour's `Resolution:`. And `triggerContext` alone was too weak: an entry carrying only `**Resolution:** triggerContext` satisfied every predicate while recording nothing.

The extractor is now level-agnostic on the heading and terminates on ANY subsequent heading, and the content set is four tokens. Verified across SEVEN states, six rejecting and one accepting:

| State | Verdict |
|---|---|
| still open in `BACKLOG.md` | red |
| absent from the archive | red |
| moved verbatim | red |
| moved with the IN PROGRESS marker intact | red |
| `**Resolution:** triggerContext` and nothing else | red |
| incomplete entry able to borrow a neighbour's `Resolution:` | red |
| the resolution this task actually requires | GREEN |

`dougFacing` and `nine-site` join `triggerContext` for the same measured reason: the row's body today mentions none of the three, because only `helpfulContext` and `longExplanation` were in scope when it was filed.

`triggerContext` is the discriminator and it was chosen by measurement, not taste. The row's body today mentions neither `triggerContext` nor `dougFacing` (`awk` over the entry returns 0 matches for both), because when it was filed only `helpfulContext` and `longExplanation` were in scope. The four-field rewrite is this arc's finding. So a verbatim move fails the red and a real resolution passes it, which is exactly the distinction round 2 asked for.

Archive `BL-NEARMISS-CANDIDATE-RENDER` with the render sites, the retargeted copy, and the nine-site lockstep recorded in the entry. Its IN PROGRESS marker comes off in this same commit, because archives reject in-flight entries.

`BL-TYPO-NORMALIZED-V4-VENUE-SHAPE` KEEPS its marker: phase 2 is still live. The red is scoped to one id for exactly that reason.

Resolve any `BACKLOG.md` conflict by set arithmetic with one extractor on both parents, cutting rows heading to any next heading. Keep-both text resurrects an archived row.

**The defect this catches:** a merge that leaves the row open, an entry that never reaches the archive, or an IN PROGRESS marker reaching main.

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

## Appendix B: the step-3 harness, and the two layers that are not the same thing

Round 1 found an earlier version of this appendix asserting a reachability it had not traced. Recorded in full, because the distinction is the whole reason task 6's surface B is not one line of work.

**Layer 1, the harness function.** `buildParseResult({ diagrams: harnessDiagrams(), warnings: harnessWarnings(), ...prOverrides })` at `tests/e2e/_step3ReviewModalHarness.tsx:140-143`, reached through `buildSectionData(prOverrides: Partial<ParseResult> = {}, ...)` at `tests/e2e/_step3ReviewModalHarness.tsx:129-130`. `prOverrides` genuinely layers over the defaults, so a caller CAN replace the warnings.

**Layer 2, the page the browser loads, which has no such caller.** `tests/e2e/_step3ReviewModalLiveEntry.tsx:88` calls `buildSectionData()` with no arguments, and the Playwright spec never imports the harness at all: it navigates to a bundled page. So a per-case override in a spec file cannot reach the render, and the earlier claim that it could was wrong.

**The mechanism that does work is already in that entry.** It reads `URLSearchParams` at `tests/e2e/_step3ReviewModalLiveEntry.tsx:76` and gates two variants on `?deferActions=1` and `?resolution=1` at `tests/e2e/_step3ReviewModalLiveEntry.tsx:77-78`. Task 6 adds a third flag in the same idiom and threads the warnings through `buildSectionData`'s first parameter. A navigation without the flag passes `{}`, byte-identical to today's no-argument call, which is what makes "every existing case is untouched" verifiable rather than hopeful.

**Do NOT append to `harnessWarnings()` itself.** Its length is `HARNESS_CREW_WARNING_COUNT` (`tests/e2e/_step3ReviewModalHarness.tsx:57`), deliberately sized off the callout cap, so lengthening it would silently retune that case. This is the second reason the flag exists rather than a default change: round 1 noted that changing the default would touch every existing interaction case, which contradicts the claim this plan makes about them.

The variant carries all three warnings in one render so the assertions are a controlled comparison: an `UNKNOWN_FIELD` with a candidate, one without, and a `PULL_SHEET_PARSE_PARTIAL` for AC-8.

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

AC-7 is the same shape, split rather than exempted. Task 7's red covers its recording half, three artifacts that must exist. Its substantive half, that a person ran both interactive gates, is reviewer territory by the guard's own ratified statement (`tests/docs/_invariant8Closeout.ts:11-16`), and this plan says so instead of implying a command settles it.

## Gates before every push

`pnpm heavy pnpm test` for the whole tree, then `pnpm typecheck`, `pnpm exec eslint .`, and `pnpm format:check`, each as its own command. Vitest strips types, so a green suite proves nothing about type errors.

Baseline at the pre-implementation head, so a later regression is attributable: eslint 0 errors and 70 warnings, typecheck clean, format clean, and the seven suites these tasks touch green at 146 tests.

## Not in this plan

- Phase 2, `BL-TYPO-NORMALIZED-V4-VENUE-SHAPE`.
- Any mutation score. `tests/mutation/source/registry.ts` holds zero rows under `components/` or `app/`, and the one new module is unenrolled, so no round-1 diff brief for this phase carries a guard-surface declaration.

---

## 12. Close-out

impeccable-gate: critique=RAN audit=RAN p0=1 p1=2 dispositions=recorded

Grammar is `RAN_FORM` at `tests/docs/_invariant8Closeout.ts:45`. Both halves ran as two isolated sub-agents per the skill's hard invariant, A finishing before B's findings entered synthesis. Critique heuristics 25/40 (serviceable), AI-slop verdict clean for the product register. Audit 19/20 (excellent).

**What this marker claims and what it cannot.** It records a gate result. It does not prove the gates ran: the guard says so about itself at `tests/docs/_invariant8Closeout.ts:11-16`, and assigns a fabricated marker to reviewer territory. The evidence a reader should weigh is the table below.

### Findings and dispositions

| Tier | Finding | Disposition |
|---|---|---|
| P0 | The band rendered `match.entry.raw`, an insertion-order winner, as if it were a string to transcribe. 25 of 65 baseline emissions are a section header (15), an alias-order winner shown shouty (9), or a known corpus typo (1). Mono under a rename imperative composes into "type a section-header path into a row label". | FIXED in `aa3dfd0e0`. Value is no longer mono; label is `Closest match`, a noun phrase whose claim survives all three cases. Detector-side residue recorded as spec §8 limit 4 with a re-file trigger: repairing the spelling moves the 65-row baseline and an enrolled mutation surface. All three claims probed against source before acting. |
| P1 | `helpfulContext` said "this card names it" while rendering in an `<li>` on wizard step 3, and pre-explained a draining state on every card. | FIXED in `aa3dfd0e0`. Cut across the lockstep, 245 to 188 chars. `dougFacing` and `longExplanation` keep the conditional; both are surface-neutral. |
| P1 | §4.1's no-eyebrow decision left the row label as the only unlabeled line on the wizard row, and it is the more important fact. | FIXED in `aa3dfd0e0`. Same prose lead-in, value in its own span so existing by-text assertions still match. |
| P2 | The eyebrow was a predicate (`Looks like`) in a field slot beside `SHEET ROW` and `PHONE`, and was most confident exactly where least right. Its cited precedent was dead code: `.message` carries "; looks like" and never renders. | FIXED in `aa3dfd0e0`, by the same change as the P0. |
| P2 | Two bands encode a mapping as two peer chips; the relation between them is encoded only by a 2.7x gap ratio, and wrapping destroys even that. | RECORDED, not fixed. A directional single band is a design change to a shipped, ratified band grammar (R4), not a defect repair. |
| P3 ×2 | `tracking-wider` vs the repo's named `tracking-eyebrow`; `text-[10px]` is fixed px with no named token. | RECORDED. Both are repo-wide divergences across 13 and 8+ sites; the new node correctly matches its 6-site warning-plate family. Reconciling belongs in one sweep, not here. |
| P3 | The sibling `Sheet row` band lacks the `min-w-0`/wrap the new band has, and now shares a `flex-wrap` row with it. | RECORDED. Pre-existing, and R4 fences re-deriving that band. |
| P3 | The row-label gate comment named only `PULL_SHEET_*`; `DAY_RESTRICTION_DOUBLE_LOCATION` also writes a pipe snippet. | FIXED in `2b366d907`. All three families named, and the suite's third fixture swapped from a synthetic code to that real producer. |
| P3 | Step 3 has no `fieldBand` twin, so `FIELD_UNREADABLE` rows carry no per-row discriminator there. | RECORDED. Out of scope: this arc renders `candidate`, and porting the field band is a separate surface. |

No P0 or P1 is deferred. There is no `DEFERRED.md` entry and no ledger row, per the standing directive on this arc: everything is either repaired here or recorded on the surface that owns it.

Assessment B also produced one measurement I corrected rather than accepted: it put the longest vocabulary entry at 36 characters; measured over `buildVocabulary()`'s 132 entries it is 25 (`Hotel Contact Information`). Its structural point held, so the wrap classes landed with the measured bound recorded in the code.

### Cross-model review, and the ruling that closed it

diff r2 APPROVE at base fc9d246ed; absorb 97754d5bc changed only main's files plus the ledger resolution; no round at the new base (Codex usage wall, resets Sep 1).

The fresh round at the new base returned `no_verdict` / `attempts_exhausted`, which is
infrastructure and not a finding of nothing. It stays in the corpus recorded as such rather than
retried into a pass. bl-orch ruled the carry after verifying independently that the merge
commit's diff against the prior head is exactly the set of files main changed between the two
bases, with the only overlap on this arc's own files being `BACKLOG.md` and `BACKLOG-archive.md`,
resolved by set arithmetic with zero ids in both. Same shape as the shardbudget precedent earlier
that day.

### Pre-code checklist result

Run before tasks 2 through 4, per the precondition section above the task region. Clean, with nothing to fix: no em dash and no apostrophe literal in either new string; no new interactive element, so no tap-target owed and the sibling deep links keep `min-h-tap-min` untouched; every color a named token; and no new color token, so no new contrast pin. The one arbitrary value, `text-[10px]`, is the shipped detail-band eyebrow idiom the audit independently confirmed at five pre-existing sites.
