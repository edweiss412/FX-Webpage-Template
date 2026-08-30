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
| Seven rows IS the correct unit of work for the batch phase; this spec does not change which rows finalize processes | `app/api/admin/onboarding/finalize/route.ts:130` (Task B2), predicate at `route.ts:468-469` |
| The batch phase publishes nothing; the Live flip is `/finalize-cas` | `route.ts:1407` (`firstSeenPublished: false`, unconditional), `route.ts:132`, `supabase/migrations/20260501000000_initial_public_schema.sql:26` |
| `approved` is read at SELECT time, not from the locked row | §5.1 — the `carried` envelope contract at `route.ts:886-888` and `route.ts:898` forbids the alternative |
| `RowEnvelope` / `carried` is NOT extended | §5.1 |
| The `listed` event shape is UNCHANGED | §5.2 |
| The CAS phase gets no `N of M` count | §5.3 |
| `FakeFinalizeDb.approved` keeps its name | §5.4 |
| The `N of M` count, the progress bar, and the idle button label are unchanged | §3.3 |
| No DB change, no migration, no new error code, no advisory-lock change | §7 |

## 1.2 Flag lifecycle: `approved`

| | |
| --- | --- |
| **Storage** | None. Not persisted anywhere new. Derived per emit from the pending-row approval column the approve/unapprove POST already writes (`lib/admin/publishIntent.ts:16-19`, `postPublishIntent`). |
| **Write path** | One: the `onRow` emit at `route.ts:1710-1714`, as `row.wizard_approved === true`. |
| **Read path** | One: `readFinalizeBatch`'s `row` handler (`components/admin/FinalizeButton.tsx:228-234`), into `ButtonState.lastApproved`. |
| **Effect on output** | Selects the leading destiny label on the batch-phase subline, in both rendering surfaces (§3.3). Nothing else reads it. It does not gate any request, mutation, or navigation. |

## 2. What the batch phase actually does

`selectFinishableCleanRows` returns every finishable clean row, approved or not — this is deliberate, recorded at `app/api/admin/onboarding/finalize/route.ts:130` ("finalize processes EVERY clean row, not only wizard_approved=true") and enforced by the predicate at `route.ts:468-469`. Seven rows is the correct unit of work.

The batch phase publishes nothing. The first-seen apply passes `firstSeenPublished: false` unconditionally (`route.ts:1407`), and `shows.published` defaults `true` (`supabase/migrations/20260501000000_initial_public_schema.sql:26`), so that argument exists precisely to create every show Held. The Live flip belongs to the later `/finalize-cas` call, whose own phase vocabulary already contains `publishing` (`lib/onboarding/finalizeProgress.ts:76`) and whose relationship to approval is recorded at `route.ts:132`: "CAS flips to Live; unchecked → the created show stays Held, published=false".

So `Publishing your shows…` is wrong for all seven rows, not merely the five unchecked ones. `Publishing: <name>` is wrong for whichever row it names, always. The count of seven is the only honest number on the panel.

The local variable holding those rows is named `approvedRows` (`route.ts:1593`), which is where the misreading starts; the emit at `route.ts:1710-1714` sends `total: approvedRows.length` and the client renders it under a publish verb.

## 3. What ships

### 3.1 Wire: the row event gains a destiny flag

`lib/onboarding/finalizeProgress.ts:69` becomes:

```ts
| {
    type: "row";
    done: number;
    total: number;
    name: string | null;
    driveFileId: string;
    // Whether THIS row is checked for publish, i.e. whether the later /finalize-cas
    // flip will take the show Live. Not "did it publish": nothing publishes during
    // the batch phase (route.ts:1407). Destiny, read at select time (§5.1).
    approved: boolean;
  }
```

`approved` is REQUIRED, not optional. An optional flag reads as `false` when a producer forgets it, which is silently the "stays Unpublished" copy; required makes producer drift a compile error, which is the stated reason this file exists (`lib/onboarding/finalizeProgress.ts:5-7`).

The `listed` event is UNCHANGED. See §6.

### 3.2 Route: populate it, and fix the name that caused this

- `route.ts:1480` `onRow` callback type gains `approved: boolean`.
- `route.ts:1710-1714` emit site passes `approved: row.wizard_approved === true`.
- `route.ts:1593` and its five readers rename `approvedRows` → `finishableRows`. Pure rename, no behavior change. It is in scope because the misnomer is the proximate cause of the shipped defect: the name asserts a filter the query does not apply.

No other route change. In particular `RowEnvelope` / `carried` is NOT touched — see §5.1.

### 3.3 UI copy

Both surfaces render the same batch-phase text and both change identically.

| Element | Before | After |
| --- | --- | --- |
| Batch header (`FinalizeButton.tsx:974`, `Step3ReviewWithFinalize.tsx:257`) | `Publishing your shows…` | `Setting up your shows…` |
| Batch SR live message (`FinalizeButton.tsx:485`) | `Publishing your shows` | `Setting up your shows` |
| Batch button label (`FinalizeButton.tsx:493`) | `Publishing…` | `Setting up…` |
| Row subline, approved (`FinalizeButton.tsx:1002`, `Step3ReviewWithFinalize.tsx:274`) | `Publishing: <name>` | `Will publish: <name>` |
| Row subline, unapproved | `Publishing: <name>` | `Stays Unpublished: <name>` |

Unchanged: the `N of M` count, the progress bar, the CAS-phase header `Finishing setup…`, the CAS sub-label from `casPhaseLabel`, and the idle button label.

`Unpublished` is capitalized to match the destination the soft confirm already names (`FinalizeButton.tsx:1127`: "You&rsquo;ll find them under **Unpublished**"). No em dash appears in any string (pre-code mechanical UI gate).

The destiny label LEADS the subline and the show name trails it. This is forced by §3.5: both sublines are single truncating text nodes, so a trailing destiny suffix is the first thing a long name destroys, and it would vanish exactly for the rows whose names are long enough to be ambiguous. Leading the label also puts the answer to "will this one go live?" at the start of the line rather than past a name that may be 60 characters wide. The phase verb is not repeated here because the header two lines above already carries it.

### 3.4 Client state

`ButtonState`'s running/batch variant (`FinalizeButton.tsx:106`) gains `lastApproved: boolean | null`, set from the row event alongside `lastName` at `FinalizeButton.tsx:232`. `null` is the pre-first-row value and renders no subline at all, exactly as `lastName: null` does today.

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

Batch-phase subline states: **A** none (no row event yet, `lastName === null`), **B** `Will publish: <name>`, **C** `Stays Unpublished: <name>`. Phase states: **batch**, **cas**.

| Pair | Treatment |
| --- | --- |
| A → B | Instant. No animation. Text node appears; matches today's behavior for `lastName` going non-null. |
| A → C | Instant. No animation. Same mechanism as A → B. |
| B → C | Instant. Text content swap within one persistent node. Deliberately NOT animated: rows advance as fast as they commit and any transition would read as flicker. |
| C → B | Instant. Same as B → C. |
| A → A | Not a transition. |
| B → B / C → C (name changes, destiny does not) | Instant text swap. Today's behavior, unchanged. |

Compound: a destiny change (B ↔ C) arriving in the same `setState` as a `done`/`total` change is one commit, so the count, the bar and the subline update together; there is no interleaving to animate. The batch → cas phase change replaces the whole subtree (header, bar, subline) with the CAS header and sub-label, instant today and instant after this change.

## 4. Guard conditions

| Input | Rendered |
| --- | --- |
| `lastName: null` (no row event yet) | No subline. Unchanged from today. |
| `lastApproved: null` with a non-null `lastName` | Unreachable by construction: both are written from the same `row` event in one `setState`. Test pins that they are written together. |
| `name: null` on the wire (no parsed title) | Existing fallback stands: subline shows `msg.driveFileId` (`FinalizeButton.tsx:232`), behind the destiny label. |
| `total: 0` | No count, no bar value — existing `state.total > 0` guards at `FinalizeButton.tsx:981-985` and `Step3ReviewWithFinalize.tsx:259-269`. Unchanged. |
| `done > total` | Existing `Math.min(state.done, state.total)` clamp. Unchanged. |
| Zero-row finish | `listed(0)`, no row events, no subline. Covered today by `tests/onboarding/finalizeStream.test.ts:63`. |
| Non-stream response (proxy stripped Accept) | No progress events at all; the `!isStream` path reads `response.json()` (`FinalizeButton.tsx:203-205`). Unchanged. |

## 5. Decisions fenced against relitigation

### 5.1 `approved` is read at SELECT time, not from the locked row

The authoritative approval value for a row's outcome is the one re-read under the per-show advisory lock (`route.ts:1141-1150`), and it can differ from select time — that is the documented `clean_unchecked` branch at `route.ts:1032-1038`.

This spec emits the SELECT-TIME value anyway, deliberately:

- `RowEnvelope`'s `carried` is the only existing channel for per-row data crossing the commit boundary, and its contract is explicit: written "ONLY on the committed-success path" (`route.ts:898`), and "a row that throws … carries nothing, exactly matching its rollback" (`route.ts:886-888`). A field that must be present for failed rows too cannot live there without breaking that contract.
- Plumbing a separate locked-approval out-parameter means touching every early-return site inside `processApprovedRow` — fifteen return-object sites, eleven of them coded failure returns (`route.ts:897-1478`) — all of which are demote/fail paths that publish nothing either way.
- The consequence of the staleness is bounded: one transient subline names the wrong destiny for one row, for the duration of that row. The terminal `result.per_row` is authoritative and already governs what the operator is told (`route.ts:1707-1709`).

**Documented limit:** if a row's approval changes between the batch's select and that row's lock, its subline states the pre-change destiny. Correcting this requires the out-parameter above and is not worth six fail-path edits. **Fenced in both directions:** a later round must not add locked-value plumbing without new evidence that an operator was actually misled, and must not remove the flag in favor of a client-side guess (the client's overlay is optimistic and is the very thing that disagrees with the server).

### 5.2 The `listed` event is not extended with an approved count

A `Setting up your shows… 1 of 7` header plus an accurate per-row destiny removes the false claim. Adding `approvedTotal` to `listed` would add a second COUNT query per batch to restate a number the soft confirm just showed on the previous screen ("5 sheets won&rsquo;t be published") and the idle button showed before that (`Publish 2 shows`). Rejected as redundant. Also note `tests/onboarding/finalizeStream.test.ts:45` asserts the `listed` object by strict `toEqual`, so extending it is not free.

### 5.3 The CAS phase gets no count

`/finalize-cas` is where the Live flip happens and it shows no `N of M` at all. Adding one is a real improvement and is OUT OF SCOPE: it is a different route, a different stream contract, and it is not the reported defect.

### 5.4 `FakeFinalizeDb.approved` keeps its name

The same misnomer exists on the test fake (`tests/onboarding/_finalizeFake.ts:92`). It is test-only, off the defect's path, and renaming it touches every seeding site in eight suites (`rg -l '\.approved = ' tests/`). Out of scope.

## 6. Test plan

All DB-free. No `TEST_DATABASE_URL` and no DB slot are required for any test below.

| Test | File | Failure it catches |
| --- | --- | --- |
| Wire union accepts `approved` on row, both values | `tests/onboarding/finalizeProgress.test.ts` | Producer/consumer shape drift (compile-time). |
| A checked row emits `approved: true`; an unchecked-clean row (`pending(id, { wizard_approved: false })`) emits `approved: false`, in ONE batch containing both | `tests/onboarding/finalizeStream.test.ts` | Emitting a constant, or reading the wrong row's flag. A mixed batch is required: a single-row fixture passes against a hardcoded literal. |
| Row ordering: the flag tracks the row it is emitted with, asserted by `driveFileId` → `approved` pairs derived from the seeded fixture, not from a literal list | `tests/onboarding/finalizeStream.test.ts` | Off-by-one pairing of name to flag. |
| Batch header reads `Setting up your shows…` and the string `Publishing your shows` appears nowhere in the batch phase | `tests/components/admin/FinalizeButton.test.tsx`, `tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx` | Copy reverted on one of the two surfaces. Both are asserted; they are separate components rendering the same sentence. |
| Subline reads `Will publish: <name>` for `approved: true` and `Stays Unpublished: <name>` for `approved: false`, driven by a fed row event | both component suites | The flag arriving and being ignored. |
| Subline stays one line and the footer height is unchanged with a 200-character name (real browser, `getBoundingClientRect`) | Playwright | §3.5. A trailing-suffix regression, or any wrap that grows the sticky footer. |
| `lastName` and `lastApproved` are written by the same event: feeding one row event and asserting both changed together | `tests/components/admin/FinalizeButton.test.tsx` | A partial `setState` leaving a stale flag beside a fresh name. |
| CAS-phase header still reads `Finishing setup…` | `tests/components/admin/FinalizeButton.test.tsx` | Over-broad copy edit hitting the wrong phase. |

Existing suites that must stay green unmodified: `tests/onboarding/finalizeStream.test.ts` batch-reconciliation and listed-query-count cases, `tests/log/adminOutcomeBehavior.test.ts` and `tests/log/_metaMutationSurfaceObservability.test.ts` (invariant 10 — this change alters the progress emit shape, not the audit sink; the `AUDITABLE_MUTATIONS` row for this route and its success-branch sink-spy are untouched).

## 7. Invariants

| Invariant | Bearing |
| --- | --- |
| 1 TDD per task | Every task below is failing test first. |
| 2 Advisory lock | Untouched. No lock is acquired, released, or nested by this change; the emit at `route.ts:1710` is outside `withRowTx`. |
| 5 No raw error codes in UI | No new codes. No `lib/messages` change. |
| 8 UI quality gate | `components/**` touched → `/impeccable critique` + `/impeccable audit` before the whole-diff review, findings dispositioned, closeout marker line. |
| 9 Supabase call boundary | No new Supabase call sites. |
| 10 Mutation-surface observability | `app/api/admin/onboarding/finalize` is an admin mutating route already in `AUDITABLE_MUTATIONS`; its telemetry emit is not on the diff. |
| 11 Worktree | `/Users/ericweiss/FX-worktrees/step3-publish-progress-scope`, branched off `origin/main` @ `6bfb58e4f`. |
| 12 Ledger | No `BL-`/`DEF-` row exists for this defect and none is filed: the arc IS the repair (bl-orch ruling, 2026-08-29, reflink precedent). |

## 8. Out of scope

A publish count on the CAS phase (§5.3). Renaming `FakeFinalizeDb.approved` (§5.4). Any change to `listed` (§5.2). Any change to which rows finalize processes — the seven-row unit of work is correct and is not what this spec touches.
