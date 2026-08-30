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

with two shows checked out of seven. Three separate statements in one wizard flow contradict each other:

| Surface | Text | Citation |
| --- | --- | --- |
| Idle button | `Publish 2 shows & finish setup` | `components/admin/FinalizeButton.tsx:463` |
| Soft confirm | `5 sheets won't be published` | `components/admin/FinalizeButton.tsx:1096` |
| Batch progress | `Publishing your shows… 1 of 7` | `components/admin/wizard/Step3ReviewWithFinalize.tsx:257`, `components/admin/FinalizeButton.tsx:974` |

The count is not wrong. The verb is.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Seven rows IS the correct unit of work for the batch phase; this spec does not change which rows finalize processes | `app/api/admin/onboarding/finalize/route.ts:130` (Task B2), predicate at `app/api/admin/onboarding/finalize/route.ts:468-469` |
| The batch phase publishes nothing; the Live flip is `/finalize-cas` | `app/api/admin/onboarding/finalize/route.ts:1407` (`firstSeenPublished: false`, unconditional), `app/api/admin/onboarding/finalize/route.ts:132`, `supabase/migrations/20260501000000_initial_public_schema.sql:26` |
| Approval alone does NOT determine destiny; the flip also requires `created_show_id is not null` | §2.1, `app/api/admin/onboarding/finalize-cas/route.ts:680-687`. Settled by spec review R1 finding 1. |
| Destiny is read from the manifest post-commit, not from `wizard_approved`, not from the locked row, not from the client overlay | §5.1, with all three alternatives and their refutations |
| `RowEnvelope` / `carried` is NOT extended | §5.1 (`app/api/admin/onboarding/finalize/route.ts:886-888`, `app/api/admin/onboarding/finalize/route.ts:898`) |
| The four `Publish progress` accessible names change too | §3.3, with the class-sweep command and its full result. Settled by spec review R1 finding 2. |
| Test rows declare RED vs PRESERVATION explicitly; three preservation checks are not claimed as failing-first | §6. Settled by spec review R1 finding 3. |
| The `listed` event shape is UNCHANGED | §5.2 |
| The CAS phase gets no `N of M` count | §5.3 |
| `FakeFinalizeDb.approved` keeps its name | §5.4 |
| The `N of M` count, the progress bar geometry, and the idle button label are unchanged | §3.3 |
| No DB change, no migration, no new error code, no advisory-lock change | §7 |

## 1.2 Flag lifecycle: `destiny`

| | |
| --- | --- |
| **Storage** | None. Not persisted anywhere new. Derived per emit from two existing `onboarding_scan_manifest` columns, `created_show_id` and `publish_intent`, both written by the per-row transaction that just committed. |
| **Write path** | One: the `onRow` emit at `app/api/admin/onboarding/finalize/route.ts:1710-1714`, from the manifest read described in §3.2, or `null` for a row whose `result.code !== "OK"`. |
| **Read path** | One: `readFinalizeBatch`'s `row` handler (`components/admin/FinalizeButton.tsx:228-234`), into `ButtonState.lastDestiny`. |
| **Effect on output** | Selects the leading label on the batch-phase subline, in both rendering surfaces (§3.3). Nothing else reads it. It does not gate any request, mutation, or navigation, and it is never persisted. |

## 2. What the batch phase actually does

`selectFinishableCleanRows` returns every finishable clean row, approved or not — this is deliberate, recorded at `app/api/admin/onboarding/finalize/route.ts:130` ("finalize processes EVERY clean row, not only wizard_approved=true") and enforced by the predicate at `app/api/admin/onboarding/finalize/route.ts:468-469`. Seven rows is the correct unit of work.

The batch phase publishes nothing. The first-seen apply passes `firstSeenPublished: false` unconditionally (`app/api/admin/onboarding/finalize/route.ts:1407`), and `shows.published` defaults `true` (`supabase/migrations/20260501000000_initial_public_schema.sql:26`), so that argument exists precisely to create every show Held. The Live flip belongs to the later `/finalize-cas` call, whose own phase vocabulary already contains `publishing` (`lib/onboarding/finalizeProgress.ts:76`) and whose relationship to approval is recorded at `app/api/admin/onboarding/finalize/route.ts:132`: "CAS flips to Live; unchecked → the created show stays Held, published=false".

So `Publishing your shows…` is wrong for all seven rows, not merely the five unchecked ones. `Publishing: <name>` is wrong for whichever row it names, always. The count of seven is the only honest number on the panel.

The local variable holding those rows is named `approvedRows` (`app/api/admin/onboarding/finalize/route.ts:1593`), which is where the misreading starts; the emit at `app/api/admin/onboarding/finalize/route.ts:1710-1714` sends `total: approvedRows.length` and the client renders it under a publish verb.

### 2.1 Approval is not destiny

The first draft of this spec treated `wizard_approved` as "will this show go Live". It does not, and the review round that caught it is recorded here so the claim is not made a third time.

The CAS flip selects on TWO columns, not one (`app/api/admin/onboarding/finalize-cas/route.ts:680-687`): `created_show_id is not null` AND `publish_intent = true`. `created_show_id` is the session-provenance marker written ONLY by the first-seen create (`app/api/admin/onboarding/finalize/route.ts:1296`), so the flip reaches session-created shows and nothing else. `showExists` does not consult `published` at all (`app/api/admin/onboarding/finalize/route.ts:546-555`), so "the show already exists" covers both a Live show and an Unpublished one.

| Row | This run's effect on `published` | Destiny |
| --- | --- | --- |
| First-seen, checked | created Held, then CAS flips it Live | `publish` |
| First-seen, unchecked | created Held, flip excluded (`publish_intent=false`) | `hold` |
| Pre-existing Live, checked | shadow staged; flip excluded (`created_show_id` is NULL) — stays Live | `unchanged` |
| Pre-existing Live, unchecked | §7.4 D10 NO-OP, `public.shows` untouched — stays Live | `unchanged` |
| Pre-existing Unpublished, checked | shadow staged; flip excluded — stays Unpublished | `unchanged` |
| Pre-existing Unpublished, unchecked | untouched — stays Unpublished | `unchanged` |
| Any row that did not complete | demoted or failed; `per_row` governs | `null` |

Rows 3 and 5 are the two an approval-keyed label gets wrong, and the existing DB test names the behavior in its own title: "publish flip narrowed: session-created publishes; pre-existing unpublished + forged manifests do NOT" (`tests/onboarding/finalizeCasFullApply.db.test.ts:655-656`).

## 3. What ships

### 3.1 Wire: the row event gains a destiny

`lib/onboarding/finalizeProgress.ts:69` becomes:

```ts
| {
    type: "row";
    done: number;
    total: number;
    name: string | null;
    driveFileId: string;
    // What THIS RUN does to this show's published state. Not "is it checked":
    // approval alone does not determine it (§2.1). Sourced from the exact predicate
    // the CAS flip uses. `null` = the row did not complete; the terminal result governs.
    destiny: "publish" | "hold" | "unchanged" | null;
  }
```

`destiny` is REQUIRED (its value may be `null`, the key may not be absent). An optional key reads as `undefined` when a producer forgets it, which renders as the no-claim case and hides the omission; required makes producer drift a compile error, which is the stated reason this file exists (`lib/onboarding/finalizeProgress.ts:5-7`).

The `listed` event is UNCHANGED. See §5.2.

### 3.2 Route: source destiny from the predicate CAS actually uses

At the emit site (`app/api/admin/onboarding/finalize/route.ts:1710-1714`), AFTER `withRowTx` has resolved for that row:

- If the row's `result.code !== "OK"`, emit `destiny: null`. The row did not complete; `per_row` governs.
- Otherwise read the manifest row the per-row transaction just committed:

  ```sql
  select created_show_id is not null as session_created, publish_intent
    from public.onboarding_scan_manifest
   where wizard_session_id = $1::uuid and drive_file_id = $2
  ```

  and map: `session_created && publish_intent` → `"publish"`; `session_created && !publish_intent` → `"hold"`; `!session_created` → `"unchanged"`.

This is READ COMMITTED (no isolation level is set anywhere in this route or in `lib/db`), so the outer `tx` observes the per-row commit. That is not an assumption: `countRemainingCleanRows` already runs on the outer `tx` inside the same loop (`app/api/admin/onboarding/finalize/route.ts:482-494`, called at `app/api/admin/onboarding/finalize/route.ts:1718`) and its count only decreases because it sees committed per-row work.

The predicate is copied from the flip itself rather than re-derived: `publishAppliedWizardShows` selects `status = 'applied' and created_show_id is not null and publish_intent = true` (`app/api/admin/onboarding/finalize-cas/route.ts:680-687`). Using the same two columns is what makes the label true by construction instead of by argument.

Cost: one indexed lookup per completed row, on a batch capped at `BATCH_CAP = 100` (`app/api/admin/onboarding/finalize/route.ts:52`).

Also in this task: `app/api/admin/onboarding/finalize/route.ts:1593` and its five readers rename `approvedRows` → `finishableRows`. Pure rename, no behavior change. It is in scope because the misnomer is the proximate cause of the shipped defect: the name asserts a filter the query does not apply, and this spec's first draft repeated the same error one level up by treating approval as destiny.

`RowEnvelope` / `carried` is NOT touched — see §5.1.

### 3.3 UI copy

Both surfaces render the same batch-phase text and both change identically.

| Element | Before | After |
| --- | --- | --- |
| Batch header (`FinalizeButton.tsx:974`, `Step3ReviewWithFinalize.tsx:257`) | `Publishing your shows…` | `Setting up your shows…` |
| Batch SR live message (`FinalizeButton.tsx:485`) | `Publishing your shows` | `Setting up your shows` |
| Batch button label (`FinalizeButton.tsx:493`) | `Publishing…` | `Setting up…` |
| Subline, `destiny: "publish"` | `Publishing: <name>` | `Will publish: <name>` |
| Subline, `destiny: "hold"` | `Publishing: <name>` | `Stays Unpublished: <name>` |
| Subline, `destiny: "unchanged"` | `Publishing: <name>` | `Updating: <name>` |
| Subline, `destiny: null` | `Publishing: <name>` | `Setting up: <name>` |
| Group accessible name, BOTH phases (`FinalizeButton.tsx:967`, `Step3ReviewWithFinalize.tsx:249`) | `Publish progress` | `Setup progress` |
| Progress bar accessible name (`FinalizeButton.tsx:983`, `Step3ReviewWithFinalize.tsx:270`) | `Publish progress` | `Setup progress` |

Unchanged: the `N of M` count, the progress bar geometry, the CAS-phase header `Finishing setup…`, the CAS sub-label from `casPhaseLabel`, the idle button label, and the `title={state.lastName}` truncation tooltips (they name the show, and the show's name did not change).

The four accessible names are in scope because they are the same false claim in the layer a sighted operator cannot see. Both labelled groups wrap `state.phase === "batch" ? … : …` (`FinalizeButton.tsx:962-972`, `Step3ReviewWithFinalize.tsx:245-254`) and both take focus when the batch starts, so without this a screen-reader operator hears "Setting up your shows" immediately followed by "Publish progress". `Setup progress` is correct for the CAS phase too, whose header is `Finishing setup…`.

**Class-sweep record.** The sweep is `rg -n 'aria-label|aria-labelledby|sr-only|title=' ` over both components. It returns exactly four `Publish progress` instances (the four above) and no other accessible name carrying the publish verb in either phase. The remaining hits are the unrelated modal Close/dismiss labels, the confirm dialog's `aria-labelledby`, the announcer's `sr-only`, and the two name tooltips.

`Unpublished` is capitalized to match the destination the soft confirm already names (`FinalizeButton.tsx:1127`: "You&rsquo;ll find them under **Unpublished**"). No em dash appears in any string (pre-code mechanical UI gate).

The destiny label LEADS the subline and the show name trails it. This is forced by §3.5: both sublines are single truncating text nodes, so a trailing destiny label is the first thing a long name pushes out of the visible box, and it would vanish exactly for the rows whose names are long enough to be ambiguous. Leading it also puts the answer to "what happens to this one?" at the start of the line rather than past a name that may run the width of the footer.

### 3.4 Client state

`ButtonState`'s running/batch variant (`FinalizeButton.tsx:106`) gains `lastDestiny: "publish" | "hold" | "unchanged" | null`, written from the row event in the same `setState` as `lastName` (`FinalizeButton.tsx:230-234`). Before the first row event `lastName` is `null` and no subline renders at all, which is today's behavior and is why `lastDestiny` needs no separate "not yet" value.

### 3.5 Dimensional invariants

The batch tracking sits in the sticky footer, whose height is load-bearing: the compact readout exists specifically so that publishing barely changes the height of the bar (`components/admin/wizard/Step3ReviewWithFinalize.tsx:223-226`), after an in-footer render caused a layout shift Doug flagged (`Step3ReviewWithFinalize.tsx:159-164`).

| Parent → child | Relationship | Guaranteed by |
| --- | --- | --- |
| `wizard-step3-tracking` (flex column, `gap-1`) → subline | Subline occupies exactly ONE line regardless of name length, so the footer height is independent of show-name length | `truncate` on the subline (`Step3ReviewWithFinalize.tsx:273`), unchanged by this spec |
| `ProgressPanel` subline `<p>` → its two spans | Same one-line guarantee on the other surface | `truncate text-text` on the `<p>` (`FinalizeButton.tsx:997`), unchanged |
| Destiny label → truncation | The label survives truncation of an arbitrarily long name | The label LEADS the text node (§3.3). This is the invariant the leading-label decision exists to hold. |
| Footer height, before vs after | Identical | No element is added or removed; only the text content of an existing node changes |

This project's Tailwind v4 does not default `.flex` to `align-items: stretch`, so no new flex parent is introduced by this spec; the existing containers are untouched. The plan carries a real-browser Playwright assertion (jsdom computes no layout): with a 200-character show name, the subline's `getBoundingClientRect().height` equals the single-line height within 0.5px, and the footer's height equals its height with a short name within 0.5px.

### 3.6 Transition inventory

Batch-phase subline states, one per destiny value plus the pre-first-row state:
**A** none (`lastName === null`), **B** `Will publish:`, **C** `Stays Unpublished:`, **D** `Updating:`, **E** `Setting up:` (`destiny: null`). Phase states: **batch**, **cas**.

Ten pairs over the five subline states. Every one is instant, and deliberately so: rows advance as fast as they commit, and any enter/exit treatment on a line that changes several times a second reads as flicker rather than motion. There is no `AnimatePresence` or `motion.*` in either renderer today and none is added.

| Pair | Treatment |
| --- | --- |
| A → B, A → C, A → D, A → E | Instant. Text node appears; today's behavior when `lastName` goes non-null. |
| B → C, B → D, B → E | Instant. Text content swap inside one persistent node. |
| C → D, C → E | Instant. Same mechanism. |
| D → E | Instant. Same mechanism. |
| Reverse of every pair above | Instant, identical. The node is the same one; direction carries no meaning here. |
| A → A | Not a transition (no row event has arrived). |
| X → X (name changes, destiny does not) | Instant text swap. Today's behavior, unchanged. |

Return to A never occurs within a batch: `lastName` is only ever set, never cleared, until the phase changes.

Compound transitions:

- A destiny change arriving in the same `setState` as `done`/`total` (the common case: every row event carries all of them) is ONE commit, so the count, the bar and the subline update together with no interleaving to animate.
- batch → cas replaces the whole subtree (header, bar, subline) with the CAS header and sub-label. Instant today, instant after this change. The group's accessible name is deliberately phase-neutral (`Setup progress`) so it does not change across this boundary, which is what keeps a screen reader from re-announcing the group mid-run.
- A phase change arriving while a destiny is mid-render is not a distinct case: React commits one state at a time and the CAS branch reads no destiny.

## 4. Guard conditions

| Input | Rendered |
| --- | --- |
| `lastName: null` (no row event yet) | No subline. Unchanged from today. |
| `destiny: null` (row did not complete) | `Setting up: <name>` — no claim about publishing. The terminal `per_row` carries the failure and the client already renders those (`FinalizeButton.tsx:374`). |
| `destiny: "unchanged"` | `Updating: <name>`. Covers all four pre-existing-show rows of §2.1, Live and Unpublished alike, checked or not. |
| `name: null` on the wire (no parsed title) | Existing fallback stands: `msg.name \|\| msg.driveFileId` (`FinalizeButton.tsx:232`), behind the destiny label. |
| Manifest read returns 0 rows at the emit site | Emit `destiny: null`. Only reachable if the row was consumed and its manifest resolved away between commit and read; the subline then makes no claim rather than guessing. |
| `total: 0` | No count, no bar value — existing `state.total > 0` guards (`FinalizeButton.tsx:981-985`, `Step3ReviewWithFinalize.tsx:259-269`). Unchanged. |
| `done > total` | Existing `Math.min(state.done, state.total)` clamp. Unchanged. |
| Zero-row finish | `listed(0)`, no row events, no subline. Covered today by `tests/onboarding/finalizeStream.test.ts:63`. |
| Non-stream response (proxy stripped Accept) | No progress events at all; the `!isStream` path reads `response.json()` (`FinalizeButton.tsx:203-205`). Unchanged. |

## 5. Decisions fenced against relitigation

### 5.1 Destiny is read from the manifest post-commit, not from `wizard_approved` and not from the locked row

The first draft keyed the label on `wizard_approved` at select time. Spec review round 1 refuted it (§2.1): approval is one of the flip's two conditions, and the other one, `created_show_id is not null`, is what excludes every pre-existing show. Two of the seven rows in the §2.1 table would have shipped a false, uncorrected label.

Three alternatives were considered and rejected:

- **Carry the locked approval out through `RowEnvelope.carried`.** Rejected on contract: `carried` is written "ONLY on the committed-success path" (`app/api/admin/onboarding/finalize/route.ts:898`) and "a row that throws … carries nothing, exactly matching its rollback" (`app/api/admin/onboarding/finalize/route.ts:886-888`). A field that must be present for failed rows cannot live there. It also would not have helped — approval was the wrong input, not the wrong snapshot of it.
- **Plumb a destiny out-parameter through `processApprovedRow`.** Rejected on blast radius: fifteen return-object sites, eleven of them coded failure returns (`app/api/admin/onboarding/finalize/route.ts:897-1478`), every one needing a value for a field only the progress subline reads.
- **Compute destiny on the client from the checkbox overlay.** Rejected because the overlay is optimistic and does not know `created_show_id`; it is the very thing that disagreed with the server in the reported screenshot.

The manifest read wins because it reads the same two columns the flip reads, after the row committed, so the label cannot drift from the outcome without the flip changing too.

**Documented limit.** The read is a second statement, so a concurrent writer could in principle change the manifest between the row's commit and the read. No such writer exists: finalize is self-serialized by the session-level finalize lock, and the per-show advisory lock is released only at the row tx's commit. If one is ever added, the failure is a transient wrong word on one subline, corrected by the terminal result. **Fenced in both directions:** a later round must not add a lock or a same-transaction read for this without evidence of an actual concurrent writer, and must not fall back to `wizard_approved` alone, which §2.1 refutes.

### 5.2 The `listed` event is not extended with an approved count

A `Setting up your shows… 1 of 7` header plus an accurate per-row destiny removes the false claim. Adding `approvedTotal` to `listed` would add a second COUNT query per batch to restate a number the soft confirm just showed on the previous screen ("5 sheets won&rsquo;t be published") and the idle button showed before that (`Publish 2 shows`). Rejected as redundant. Also note `tests/onboarding/finalizeStream.test.ts:45` asserts the `listed` object by strict `toEqual`, so extending it is not free.

### 5.3 The CAS phase gets no count

`/finalize-cas` is where the Live flip happens and it shows no `N of M` at all. Adding one is a real improvement and is OUT OF SCOPE: it is a different route, a different stream contract, and it is not the reported defect.

### 5.4 `FakeFinalizeDb.approved` keeps its name

The same misnomer exists on the test fake (`tests/onboarding/_finalizeFake.ts:92`). It is test-only, off the defect's path, and renaming it touches every seeding site in eight suites (`rg -l '\.approved = ' tests/`). Out of scope.

## 6. Test plan

All DB-free unless a row says otherwise. Each row declares whether it FAILS against current code (a real red) or is a PRESERVATION check (green today, pinned so a later edit cannot quietly break it). Review round 1 found three rows claiming to be the former while being the latter; the distinction is now explicit per row.

| Test | Kind | File | Failure it catches |
| --- | --- | --- | --- |
| Wire union accepts every `destiny` value including `null` | RED (typecheck) | `tests/onboarding/finalizeProgress.test.ts` | Producer/consumer shape drift. |
| First-seen checked → `"publish"`; first-seen unchecked → `"hold"`; pre-existing (fake seeded with an existing show) → `"unchanged"`, for BOTH checked and unchecked | RED | `tests/onboarding/finalizeStream.test.ts` | The whole of §2.1. The pre-existing pair is the case round 1 caught; without it an approval-keyed implementation passes. Expected values are derived from the seeded fixture, never a literal list. |
| A failing row emits `destiny: null` | RED | `tests/onboarding/finalizeStream.test.ts` | Guessing a destiny for a row that did not complete. |
| The emitted destiny equals the CAS flip's own predicate for the same seed, asserted by running `publishAppliedWizardShows`'s SELECT against the fake and comparing sets | RED | `tests/onboarding/finalizeStream.test.ts` | The two predicates drifting apart later. This is the anti-tautology form: it compares against the flip, not against a copy of my mapping. |
| Subline reads `Will publish:` / `Stays Unpublished:` / `Updating:` / `Setting up:` for the four destiny values | RED | both component suites | The flag arriving and being ignored. |
| Batch header reads `Setting up your shows…`, and `Publishing your shows` appears nowhere in the batch phase | RED | both component suites | Copy reverted on one of two surfaces that render the same sentence. |
| All four accessible names read `Setup progress`, asserted by querying the batch phase for `[aria-label]` and comparing the SET of values, not four separate string checks | RED | both component suites | Round 1 finding 2, and any fifth instance a later edit adds. The set form is what makes it a class guard rather than four spot checks. |
| `lastName` and `lastDestiny` move together from ONE event | RED | `tests/components/admin/FinalizeButton.test.tsx` | A partial `setState` leaving a stale destiny beside a fresh name. |
| CAS-phase header still reads `Finishing setup…` | PRESERVATION | `tests/components/admin/FinalizeButton.test.tsx` | An over-broad copy edit reaching the wrong phase. Green today by construction. |
| With a 200-character name, the destiny label's right edge is inside the subline container's right edge | RED (real browser) | Playwright | The label being placed after the name, where truncation hides it. Round 1 correctly observed that geometry alone cannot catch this: both a leading and a trailing label yield one line of identical height. Measuring the LABEL's own box against the container's is what discriminates, which is why the label gets its own element and testid. |
| Subline stays one line and footer height is name-length independent | PRESERVATION (real browser) | Playwright | A later change dropping `truncate` or wrapping the subline. Green today; pinned because the footer height is a stated owner constraint (`Step3ReviewWithFinalize.tsx:223-226`). |

Existing suites that must stay green unmodified: `tests/onboarding/finalizeStream.test.ts` listed-strict-equality (`tests/onboarding/finalizeStream.test.ts:45`), listed-query-count (`tests/onboarding/finalizeStream.test.ts:114` — note this test counts `countRemainingCleanRows` calls and is NOT affected by the new manifest read, which matches a different SQL string; if the counter's substring ever widens, this test is the tripwire), and the two-batch reconciliation (`tests/onboarding/finalizeStream.test.ts:141`). Invariant 10: `tests/log/adminOutcomeBehavior.test.ts` and `tests/log/_metaMutationSurfaceObservability.test.ts` — this change alters the progress emit shape, not the audit sink; the `AUDITABLE_MUTATIONS` row for this route and its success-branch sink-spy are untouched.

## 7. Invariants

| Invariant | Bearing |
| --- | --- |
| 1 TDD per task | Every task below is failing test first. |
| 2 Advisory lock | Untouched. No lock is acquired, released, or nested by this change; the emit at `app/api/admin/onboarding/finalize/route.ts:1710` is outside `withRowTx`. |
| 5 No raw error codes in UI | No new codes. No `lib/messages` change. |
| 8 UI quality gate | `components/**` touched → `/impeccable critique` + `/impeccable audit` before the whole-diff review, findings dispositioned, closeout marker line. |
| 9 Supabase call boundary | No new Supabase call sites. |
| 10 Mutation-surface observability | `app/api/admin/onboarding/finalize` is an admin mutating route already in `AUDITABLE_MUTATIONS`; its telemetry emit is not on the diff. |
| 11 Worktree | `/Users/ericweiss/FX-worktrees/step3-publish-progress-scope`, branched off `origin/main` @ `6bfb58e4f`. |
| 12 Ledger | No `BL-`/`DEF-` row exists for this defect and none is filed: the arc IS the repair (bl-orch ruling, 2026-08-29, reflink precedent). |

## 8. Out of scope

A publish count on the CAS phase (§5.3). Renaming `FakeFinalizeDb.approved` (§5.4). Any change to `listed` (§5.2). Any change to which rows finalize processes — the seven-row unit of work is correct and is not what this spec touches.
