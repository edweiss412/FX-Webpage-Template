# Step-3 finalize progress: report the work being done, not a publish that has not happened

**Date:** 2026-08-29
**Branch:** `fix/step3-publish-progress-scope`
**Reported by:** Eric, 2026-08-29 (screenshot: two shows checked, footer reads `Publishing your shows… 1 of 7`)
**Status:** spec

---

## 1. The defect

Step 3's publish footer renders, during the batch phase:

```
Publishing your shows…            1 of 7
[progress bar]
Publishing: RFI & PC Chicago
```

with two shows checked out of seven. Three statements in one wizard flow contradict each other:

| Surface | Text | Citation |
| --- | --- | --- |
| Idle button | `Publish 2 shows & finish setup` | `components/admin/FinalizeButton.tsx:463` |
| Soft confirm | `5 sheets won&rsquo;t be published` | `components/admin/FinalizeButton.tsx:1096` |
| Batch progress | `Publishing your shows… 1 of 7` | `components/admin/wizard/Step3ReviewWithFinalize.tsx:257`, `components/admin/FinalizeButton.tsx:974` |

The count is not wrong. The verb is.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Seven rows IS the correct unit of work for the batch phase; this spec does not change which rows finalize processes | `app/api/admin/onboarding/finalize/route.ts:130` (Task B2), predicate at `app/api/admin/onboarding/finalize/route.ts:468-469` |
| The batch phase publishes nothing; the Live flip is `/finalize-cas` | `app/api/admin/onboarding/finalize/route.ts:1438` (`firstSeenPublished: false`, unconditional), `app/api/admin/onboarding/finalize/route.ts:132`, `supabase/migrations/20260501000000_initial_public_schema.sql:26` |
| The progress stream makes NO per-row claim about publishing; the wire is unchanged | §2.1 — the ratified narrowing decision, owner call 2026-08-29 |
| The displayed NAME is a claim this spec keeps, so it must name the applied parse | §3.1b — settled by spec review R4 |
| The four `Publish progress` accessible names change too | §3.2, with the class-sweep command and its full result |
| The `N of M` count, the progress bar, the CAS-phase copy, and the idle button label are unchanged | §3.2 |
| No wire change, no DB change, no migration, no new error code, no advisory-lock change | §6 |

## 2. What the batch phase actually does

`selectFinishableCleanRows` returns every finishable clean row, approved or not — deliberate, recorded at `app/api/admin/onboarding/finalize/route.ts:130` ("finalize processes EVERY clean row, not only wizard_approved=true") and enforced by the predicate at `app/api/admin/onboarding/finalize/route.ts:468-469`. Seven rows is the correct unit of work.

The batch phase publishes nothing. The first-seen apply passes `firstSeenPublished: false` unconditionally (`app/api/admin/onboarding/finalize/route.ts:1438`), and `shows.published` defaults `true` (`supabase/migrations/20260501000000_initial_public_schema.sql:26`), so that argument exists precisely to create every show Held. The Live flip belongs to the later `/finalize-cas` call, whose own phase vocabulary already contains `publishing` (`lib/onboarding/finalizeProgress.ts:76`) and whose relationship to approval is recorded at `app/api/admin/onboarding/finalize/route.ts:132`.

So `Publishing your shows…` is wrong for all seven rows, not merely the five unchecked ones, and `Publishing: <name>` is wrong for whichever row it names, always. The count of seven is the only honest number on the panel.

The local variable holding those rows is named `approvedRows` (`app/api/admin/onboarding/finalize/route.ts:1624`) while the query applies no such filter, which is where the misreading starts.

## 2.1 Why no per-row publish claim is made (ratified narrowing)

**Ratified reversal, 2026-08-29.** The owner originally chose the per-row wire flag ("option 2") over a copy-only fix ("option 1"), on my representation that a per-row publish claim was cheap and truthful. Two adversarial rounds showed it is neither. The owner reversed that choice on 2026-08-29 and ruled NARROW; bl-orch recorded the ruling the same day. This section is the record, and the decision is fenced in BOTH directions: the per-row classifier is not to be reintroduced without the mechanism named at the end of this section, and the copy repairs in §3.2 are not to be reopened on the grounds that the subline now says less than it could.

Two earlier drafts of this spec tried to state, per row, where that show was headed. The record, because it is the reason the current design deliberately says less:

| Round | Finding |
| --- | --- |
| Spec R1 | Destiny is not `wizard_approved`. The CAS flip also requires `created_show_id is not null`, so it never reaches a pre-existing show. |
| Spec R3 | The subline said `Setting up: <name>` about a row the event marks as COMPLETED, and said it for failed rows too. See §2.2. |
| Spec R2 | It also requires `status = 'applied'`, and `recordCreatedShowProvenance` never restores that status (`app/api/admin/onboarding/finalize/route.ts:641-650`), so a checked first-seen row can commit as `staged` and be excluded. Separately, a single `unchanged` label conflated "content updated" with "nothing happens to this show at all". |

The full predicate is three columns (`app/api/admin/onboarding/finalize-cas/route.ts:680-687`). But copying all three would still not close the class: the batch and the flip are SEPARATE HTTP calls, and R2's own reachability argument is that manifest state changes between them. Any per-row destiny computed during the batch is a PREDICTION that a later route will still agree, over state that is still mutable.

Per AGENTS.md's repair direction under same-axis recurrence — "the class-level repair is NARROWING: decline to fire on what the recognizer cannot classify and file the documented limit... Never parser growth" — this spec declines to make the claim.

**Documented limit.** The batch-phase subline names the show being set up and does not say whether it will end up published. The operator gets that, for every row, from the two surfaces immediately preceding this one: the soft confirm names each sheet that will not be published (`components/admin/FinalizeButton.tsx:1096-1129`) and the idle button carries the count (`components/admin/FinalizeButton.tsx:463`). Both are computed from the checkbox state the operator just set, not predicted about a downstream route. **Fenced in both directions:** a later round must not add a per-row publish claim to this stream without a mechanism that observes the flip rather than predicting it, and must not remove the header/label repairs below on the grounds that the subline says less than it could.

## 2.2 The row event marks a COMPLETED row, so the subline is past tense

`onRow` fires after `await runtime.withRowTx(...)` has resolved for that row and after its result is pushed, and it carries `done: perRow.length` — rows finished so far (`app/api/admin/onboarding/finalize/route.ts:1732-1746`). The named row is therefore done, not in progress: across a seven-row batch, events 1 through 6 each name a row that has just completed while the server works on the next one, and event 7 names a completed row until the terminal result replaces the panel.

The same event fires for a row that FAILED. The route's own comment says so: "a row that fails still surfaces via per_row (client stops on non-OK)" (`app/api/admin/onboarding/finalize/route.ts:1740`). A failure is not reported to the client until the terminal `result` at the END of the batch, so a failed row's name can sit in the subline for the remainder of the batch.

Both facts constrain the label. It cannot be present tense ("Setting up: X" names a row that is finished), and it cannot imply success ("Done: X", "Finished: X" would be false for the failed row sitting there until the batch ends).

**So the line carries NO prefix at all.** An earlier draft used `Processed: `, which is true in both branches but is warehouse vocabulary in a register whose voice is explicitly plain-language, and it reads as success to a non-technical operator even though the code means it neutrally. The impeccable critique (P1) made the better argument: the name sits under a labelled progress bar and a `N of M` count, so its role is already established by position. Dropping the prefix removes a word, removes a claim, and returns roughly eleven characters to a line that truncates on a phone. The strongest form of "true in both branches" is to assert nothing.

## 3. What ships

### 3.1 Route: the misnomer that started this

`app/api/admin/onboarding/finalize/route.ts:1624` and its five readers rename `approvedRows` → `finishableRows`. Pure rename, no behavior change, no emit change. In scope because the name asserts a filter the query does not apply, and this spec's own first two drafts repeated that error one level up by treating approval as destiny.

`lib/onboarding/finalizeProgress.ts` is NOT modified. The stream contract is unchanged.

### 3.1b The displayed name must come from the parse that was applied

`onRow` derives the displayed name from the OUTER, select-time row: `name: parsedShowTitle(row.parse_result)` (`app/api/admin/onboarding/finalize/route.ts:1744`). When an inline re-scan heals a modified sheet, the route re-parses it and applies the REFRESHED parse, but the auto-heal block rebinds only three fields onto the local row — its own comment says "Rebind those three onto the local `row`" — and its query selects `staged_id, staged_modified_time, triggered_review_items` and not `parse_result` (`app/api/admin/onboarding/finalize/route.ts:1064-1073`). The freshly-read parse lives on a LOCAL copy inside `processApprovedRow` and never reaches the outer row.

A title-only rename survives as clean, because `computeRescanDecision` weighs selected crew invariants and data-gap regressions rather than the title (`lib/onboarding/rescanDecision.ts:35`). So an ordinary rename produces a row that is set up as `New Show` while the stream says `Old Show`, with nothing downstream to correct it: a successful `per_row` entry carries no name at all.

The same stale source feeds the failure `display_name` (`app/api/admin/onboarding/finalize/route.ts:1735`), so this repair fixes both.

**Fix:** widen that query to include `parse_result` and rebind it onto the local row alongside the other three, coercing with `asParseResult` exactly as the inner path does, so the outer row's shape matches `coercedRow`. Note the coercion is defence in depth rather than a correctness requirement for the two consumers at hand: both read through `parsedShowTitle`, which already JSON-parses a legacy string scalar and returns null if it will not parse (`lib/onboarding/blockerDisplayName.ts:12-23`). An earlier draft of this section claimed `parsedShowTitle` must not receive a string scalar; that was wrong, and it is corrected here rather than in a reopened spec round, per the orchestrator's 2026-08-29 fence. The block already exists to make the outer row match the generation that will be applied; this makes it do that for the one field the operator actually reads.

Rows that fail BEFORE the re-parse have no refreshed title and are unaffected.

### 3.2 UI copy

Both surfaces render the same batch-phase text and both change identically.

| Element | Before | After |
| --- | --- | --- |
| Batch header (`components/admin/FinalizeButton.tsx:974`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:257`) | `Publishing your shows…` | `Setting up your shows…` |
| Batch SR live message (`components/admin/FinalizeButton.tsx:485`) | `Publishing your shows` | `Setting up your shows` |
| Batch button label (`components/admin/FinalizeButton.tsx:493`) | `Publishing…` | `Setting up…` |
| Row subline (`components/admin/FinalizeButton.tsx:1002`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:279`) | `Publishing: <name>` | `<name>`, with no prefix |
| Group accessible name, BOTH phases (`components/admin/FinalizeButton.tsx:967`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:249`) | `Publish progress` | `Show setup progress` |
| Progress bar accessible name (`components/admin/FinalizeButton.tsx:987`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:274`) | `Publish progress` | `Show setup progress` |

Unchanged: the `N of M` count, the progress bar geometry, the CAS-phase header `Finishing setup…`, the CAS sub-label from `casPhaseLabel`, the idle button label, and the `title={state.lastName}` truncation tooltips.

The four accessible names are in scope because they are the same false claim in the layer a sighted operator cannot see. Both labelled groups wrap `state.phase === "batch" ? … : …` (`components/admin/FinalizeButton.tsx:962-972`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:245-254`) and both take focus when the batch starts, so without this a screen-reader operator hears "Setting up your shows" immediately followed by "Publish progress". `Show setup progress` is correct for the CAS phase too, whose header is `Finishing setup…`, and it follows the pattern its siblings already set — `Onboarding progress` on the wizard stepper (`components/admin/OnboardingWizard.tsx:197`) and `Folder scan progress` on step 2 (`components/admin/wizard/Step2Verify.tsx:487`). A bare `Setup progress` was the vaguest of the three and the nearest to the stepper's own name; the impeccable critique (P2) caught it.

**Class-sweep record.** The sweep is `rg -n 'aria-label|aria-labelledby|sr-only|title=' components/admin/FinalizeButton.tsx components/admin/wizard/Step3ReviewWithFinalize.tsx`. It returns exactly four `Publish progress` instances (the four above) and no other accessible name carrying the publish verb in either phase. The remaining hits are the modal Close/dismiss labels, the confirm dialog's `aria-labelledby`, the announcer's `sr-only`, and the two name tooltips.

No em dash appears in any new string (pre-code mechanical UI gate). No client state is added: the subline continues to read `state.lastName` alone.

### 3.3 Dimensional invariants

The batch tracking sits in the sticky footer, whose height is load-bearing: the compact readout exists specifically so that publishing barely changes the height of the bar (`components/admin/wizard/Step3ReviewWithFinalize.tsx:223-226`), after an in-footer render caused a layout shift Doug flagged (`components/admin/wizard/Step3ReviewWithFinalize.tsx:159-164`).

| Parent → child | Relationship | Guaranteed by |
| --- | --- | --- |
| `wizard-step3-tracking` (flex column, `gap-1`) → subline | Subline occupies exactly ONE line regardless of name length, so footer height is independent of show-name length | `truncate` on the subline (`components/admin/wizard/Step3ReviewWithFinalize.tsx:273`), unchanged by this spec |
| `ProgressPanel` subline `<p>` → its two spans | Same one-line guarantee on the other surface | `truncate text-text` on the `<p>` (`components/admin/FinalizeButton.tsx:997`), unchanged |
| Footer height, before vs after | Identical | No element is added or removed; only the text content of existing nodes changes, and the node is `truncate`d to one line at any length |

This project's Tailwind v4 does not default `.flex` to `align-items: stretch`; no new flex parent is introduced and the existing containers are untouched.

### 3.4 Transition inventory

Batch-phase subline states: **A** none (`lastName === null`), **B** the bare `<name>`. Phase states: **batch**, **cas**.

| Pair | Treatment |
| --- | --- |
| A → B | Instant. Text node appears; today's behavior when `lastName` goes non-null. |
| B → B (name changes) | Instant text swap inside one persistent node. Today's behavior. |
| B → A | Does not occur: `lastName` is only ever set, never cleared, within a batch. |

Compound: a name change arriving in the same `setState` as `done`/`total` is ONE commit (every row event carries all three), so the count, the bar and the subline update together with no interleaving to animate. The batch → cas change replaces the whole subtree, instant today and instant after. The group's accessible name is deliberately phase-neutral (`Show setup progress`) so it does not change across that boundary, which keeps a screen reader from re-announcing the group mid-run. There is no `AnimatePresence` or `motion.*` in either renderer and none is added.

## 4. Guard conditions

| Input | Rendered |
| --- | --- |
| `lastName: null` (no row event yet) | No subline. Unchanged from today. |
| `name: null` on the wire (no parsed title) | Existing fallback stands: `msg.name \|\| msg.driveFileId` (`components/admin/FinalizeButton.tsx:232`), rendered bare like any other name. |
| `total: 0` | No count, no bar value — existing `state.total > 0` guards (`components/admin/FinalizeButton.tsx:981-985`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:259-269`). Unchanged. |
| `done > total` | Existing `Math.min(state.done, state.total)` clamp. Unchanged. |
| Zero-row finish | `listed(0)`, no row events, no subline. Covered today by `tests/onboarding/finalizeStream.test.ts:63`. |
| A row that fails | The subline is transient; the terminal `per_row` is authoritative and the client already renders failures (`components/admin/FinalizeButton.tsx:374`). Unchanged. |
| Non-stream response (proxy stripped Accept) | No progress events at all; the `!isStream` path reads `response.json()` (`components/admin/FinalizeButton.tsx:203-205`). Unchanged. |

## 5. Test plan

All DB-free. No `TEST_DATABASE_URL` and no DB slot are required. Each row declares whether it FAILS against current code or is a PRESERVATION check, because an earlier draft claimed three preservation checks as failing-first.

| Test | Kind | File | Failure it catches |
| --- | --- | --- | --- |
| Batch header reads `Setting up your shows…`, and `Publishing your shows` appears nowhere in the batch phase | RED | both component suites | Copy reverted on one of two components that independently render the same sentence. |
| Subline text equals `<name>` EXACTLY, and `Publishing: ` appears nowhere in the batch phase | RED | both component suites | Same, for the subline. Exact equality, so a prefix creeping back in fails it. |
| The SET of `[aria-label]` values inside the batch phase equals `{"Show setup progress"}` | RED | both component suites | The four instances, AND any fifth a later edit adds. The set form is what makes it a class guard rather than four spot checks. |
**Documented limits of the transition audit, 2026-08-30 (whole-diff R1 findings 2 and 3).**
R1 named six ways the oracle could miss an animation. Four were CLOSED sets and are now
closed: the renderer x phase matrix runs all four cells rather than FinalizeButton's batch
alone; the stylesheet parse accepts `animation-*` / `transition-*` longhands, not only the
shorthands; the class check matches Tailwind's BARE `transition` and `animate` utilities,
not only the hyphenated families; and every widening was proved by a planted mutant that
the previous form passed.

Two are genuinely open, and are recorded here rather than chased, per the repair-direction
rule in AGENTS.md: when successive rounds each widen a recognizer, the class-level repair is
NARROWING plus a documented limit, because each widening is a bigger target for the next
round.

1. **Selectors jsdom cannot parse are treated as non-matching.** `el.matches(sel)` throws on
   some pseudo-element selectors, and the audit catches and continues. This is FAIL-OPEN and
   deliberately so: the alternative is failing the suite on a selector that no jsdom node can
   match either way. A real-browser assertion is the only thing that would close it, which is
   a Playwright surface this arc does not open.
2. **Aliased Framer imports evade the source-text check.** It matches `AnimatePresence` and
   `motion.`, so `import { motion as m }` then `m.div` passes. Closing it means parsing the
   import graph, which is the recognizer growth this rule exists to refuse.

**Threat fence for both:** the audit defends against an ordinary contributor adding an
animation to these subtrees in the normal way. It does not defend against a contributor
deliberately obscuring one, and a probe constructed to evade it files here rather than
opening a round.

**Amendment, 2026-08-30 (whole-diff R1 finding 7).** The accessible name is
`Show setup progress`, and this section said `Setup progress` in the acceptance row
while its own normative table above and all four implementation sites said the longer
form. The bare form was the one the impeccable critique rejected as the vaguest of the
three and the nearest to the wizard stepper's own name, so the table was right and the
acceptance row was a leftover from before that P2. Left standing it made invariant 7's
canonical-acceptance obligation impossible to satisfy: any reader taking the acceptance
row literally would have had to change shipped, dual-gate-ratified copy to match a line
nothing else agreed with. Corrected here, in the plan's AC-4 and guard description, and
in both test names.

| Running button label reads `Setting up…` | RED | `tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx` | The most prominent control keeping the false verb. NOT the FinalizeButton suite: in that composition the trigger UNMOUNTS while running, so `runningLabel` is only observable through the wizard's `FinalizeTrigger`. |
| CAS-phase header still reads `Finishing setup…` and its accessible name is still reachable | PRESERVATION | `tests/components/admin/FinalizeButton.test.tsx` | An over-broad copy edit reaching the wrong phase. Green today by construction. |
| `finishableRows` rename is behavior-neutral: the existing stream suite passes unmodified | PRESERVATION | `tests/onboarding/finalizeStream.test.ts` | A rename that accidentally changes a reader. |
| After an inline re-scan that changes ONLY the title, the emitted `name` is the NEW title | RED | `tests/onboarding/finalizeInlineRescan.test.ts` | §3.1b. The fixture must actually CHANGE the title across the re-parse; a fixture whose title is stable cannot distinguish the stale source from the fresh one, which is exactly why the existing suite does not catch this. |

Feeding stream events is NOT symmetric across the two suites and the plan must budget for it. `controllableNdjson()` is a module-local function in the FinalizeButton suite (`tests/components/admin/FinalizeButton.test.tsx:961`), not exported and not shared. The Step3 suite holds the running state with a never-resolving fetch (`tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:231`), which produces NO row events, so `state.lastName` stays null and its subline never renders at all. Asserting the compact subline therefore requires extracting that helper to a shared module and importing it in both suites. The extraction is mechanical and is part of the compact-surface task. Existing suites that must stay green unmodified: the whole of `tests/onboarding/finalizeStream.test.ts` (§3.1b changes which parse the emit READS, never the event shape or the emit site, and that suite's fixtures hold the title stable across the re-parse so they cannot distinguish the two sources either way), plus `tests/log/adminOutcomeBehavior.test.ts` and `tests/log/_metaMutationSurfaceObservability.test.ts` (invariant 10 — the audit sink is not on the diff).

No Playwright task. The earlier draft's geometry test existed to protect a trailing destiny label from truncation; with no destiny label there is nothing for it to protect, and the one-line guarantee is an unchanged `truncate` that no line of this diff touches.

## 6. Invariants

| Invariant | Bearing |
| --- | --- |
| 1 TDD per task | Every task is failing test first, except the two rows declared PRESERVATION. |
| 2 Advisory lock | Untouched. No lock is acquired, released, or nested. |
| 5 No raw error codes in UI | No new codes. No `lib/messages` change. |
| 8 UI quality gate | `components/**` touched → the invariant-8 gate runs on the diff at close-out, findings dispositioned, marker line written by that commit. |
| 9 Supabase call boundary | No new Supabase call sites. |
| 10 Mutation-surface observability | `app/api/admin/onboarding/finalize` keeps its `AUDITABLE_MUTATIONS` row; its telemetry emit is not on the diff. |
| 11 Worktree | `/Users/ericweiss/FX-worktrees/step3-publish-progress-scope`, branched off `origin/main` @ `6bfb58e4f`. |
| 12 Ledger | No `BL-`/`DEF-` row exists for this defect and none is filed: the arc IS the repair (bl-orch ruling, 2026-08-29, reflink precedent). |

## 7. Out of scope

Any per-row publish claim on the progress stream (§2.1, ratified). A publish count on the CAS phase. Renaming `FakeFinalizeDb.approved`. Any change to `listed`, to the `row` event, or to which rows finalize processes.
