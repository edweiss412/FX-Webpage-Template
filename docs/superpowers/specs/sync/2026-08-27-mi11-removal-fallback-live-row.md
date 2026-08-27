# The mi11 retain prefers the crew member's own live row

`BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE`. Arc `fix/mi11-removal-fallback-live-row`, 2026-08-27.

A crew member with an open MI-11 hold drops off the sheet. The hold-aware apply keeps them alive, and puts back a snapshot the hold captured at its last write. Every field edited on that member since is silently reverted: phone, role, role flags, restrictions, flight info. This closes that, and the sibling site next to it that fails the same way.

## 1. What this arc is for

`lib/sync/holds/holdAwareApply.ts:337` is the genuine-removal fallback: the held entity is absent from the parse and nothing in the sheet folds onto it, so the planner retains `rowFromHeldValue(held)` and the snapshot-replace engine upserts that row across every column (`upsertCrewMembers` names nine columns in its `do update set`, `lib/sync/runScheduledCronSync.ts:1701`). `held` is `sync_holds.held_value`. So the upsert writes an old set of values over whatever the sheet has taught the row since.

**How old, exactly.** `held_value` is not written once and never again. `writeMi11Holds` upserts on `(show_id, domain, entity_key)` with `held_value = excluded.held_value` (`lib/sync/holds/writeMi11Holds.ts:78`), so a later sync that still reports the same MI-11 refreshes it from that sync's `liveCrewByName`. What the retain re-inserts is therefore the snapshot as of the last sync that re-asserted the hold — a LAGGING snapshot, not necessarily the opening one. The defect is the same either way: once the member stops appearing in the sheet, the hold stops being re-written, the snapshot stops advancing, and the retain keeps writing it back.

This is executable today, not inferred. `tests/sync/capabilityLossReachability.probe.test.ts` seeds the live row at `555-NEW` and every `held_value` at `555-OLD`, and the `mi11_pending/crew_email` case pins `phoneAfter: HELD_PHONE` (`phoneAfter`, `tests/sync/capabilityLossReachability.probe.test.ts:281`) — the revert, observed end-to-end through `runPhase2`.

## 1.1 Resolved scope, do not relitigate

- **The ruling is DEFECT.** bl-orch ruled 2026-08-27 07:45, and confirmed the same morning that the second site is the same shape. §2 records the rejected alternative, what supports it, and why it still loses.
- **The classification axis is NOT "does a live row exist".** Spec round 1 refuted that: the `crew_identity` restore branch runs with a live row present, because `undo_change` re-inserts the crew row before the `undo_override` hold exists (`supabase/migrations/20260804000000_undo_change_selections_reset_at.sql:198`). §3 states the axis the ruling actually turns on. Recorded here so the refuted version is not re-derived.
- **The restore branch is unchanged**, its `retainRows.set` at `holdAwareApply.ts:477`. §3.5 says why on the corrected axis. Pinned as INTENDED by that suite's `phoneAfter` (`tests/sync/capabilityLossReachability.probe.test.ts:328`).
- **Identity stays pinned from the held snapshot at every mi11 site.** Only non-identity moves to the live row. The hold exists to freeze the identity; §3.2 is the mechanism and AC-7 is the case that proves it.
- **The threading is arc C's, already shipped.** `previousCrewMembers` reaches the planner from `lib/sync/runScheduledCronSync.ts:1653` through `lib/sync/applyParseResult.ts:171-172`. This arc adds no plumbing; it consumes what is there. The `previousByName` retain shape is precedent (`lib/sync/holds/holdAwareApply.ts:465-466`), not an open axis.
- **No lock topology changes.** The planner acquires nothing; it runs inside the per-show advisory lock its caller already holds (`lib/sync/lockedShowTx.ts:59-61`). Invariant 2's single-holder rule is preserved by not participating.
- **Concurrent edits racing the same sync are out of scope.** The advisory lock serializes them. The threat fence is ordinary operator edits between a hold's last write and a later sync.
- **Nothing here touches the database schema or a config flag.** No DDL, no CHECK, no enum, no RPC signature — so the tier x domain matrix, the CHECK/enum matrix and the flag lifecycle table are all N/A. The UI surface question is §6, and it is the one open decision in this document.
- **No new ledger row.** Per the 2026-08-27 arc batch directive, every instance of this shape is repaired in-branch; anything unrepaired is named in the PR body.

## 2. The ruling, and the alternative it rejects

The fallback at `holdAwareApply.ts:337` fires when the member is genuinely absent from the SHEET. Non-identity fields have exactly one ordinary source, the sheet, and the hold does not hold them: for a held member the sheet still lists, `crewMembers.push({ ...m, name: pin.name, email: pin.email })` (`holdAwareApply.ts:395`) takes the sheet's non-identity verbatim and pins only the identity. So the hold's own code says non-identity follows the freshest source. When the sheet has nothing to say, the live row is the freshest source there is, and the snapshot is strictly older than it.

**Rejected: "a hold freezes the row."** A hold exists to stop a row from being REMOVED and to stop its IDENTITY from moving while an admin decides.

That reading is not baseless, and round 1 was right to say so. Two shipped help pages tell the operator that a held member's "prior details stay in effect" until they decide (`app/help/admin/review-queues/page.mdx:59`, `app/help/admin/per-show-panel/page.mdx:20`). "Prior details" reads as the whole row. So the freeze reading has operator-facing copy behind it, and this spec does not claim nobody was ever told.

It still loses, for two reasons. The code says identity: every other hold-aware path pins identity and lets non-identity follow the sheet, and no path holds non-identity on purpose. And the freeze, as implemented, is invisible and unbounded — an admin who edits a held member's phone in the sheet sees the edit apply, sees it on the crew page, and then sees it silently revert on the sync after the member drops off the sheet. No warning, no feed entry, no notice. A freeze the operator cannot observe and was never asked to confirm is a data-loss bug, whatever the help page says. What the help copy earns is not the ruling; it is §6.

## 3. The four snapshot retains

Every `rowFromHeldValue(held)` call site in `lib/sync/holds/**`, from `grep -rn "rowFromHeldValue" lib`.

**The axis is WHOSE WORD the retained row is meant to carry** — not whether a live row exists. A live row exists at all four sites.

| Site | Branch | Whose word the retain must carry | Disposition |
| --- | --- | --- | --- |
| `holdAwareApply.ts:300` | mi11 rename-fold onto a truly-added row | the sheet's, via the fold target | **Inert change.** Moves to the helper for uniformity. The value is never read: `nonIdentityOverride.set` at `holdAwareApply.ts:299` is unconditional on this branch, so the build loop at `holdAwareApply.ts:407` takes `override` as its base. §3.4. |
| `holdAwareApply.ts:321` | mi11 WM-F6, fold target is a pre-existing live owner | the held member's own live row | **Change.** Same shape as `holdAwareApply.ts:337`. §3.3. |
| `holdAwareApply.ts:337` | mi11 genuine removal | the held member's own live row | **Change.** The filed defect. |
| `holdAwareApply.ts:477` | `crew_identity` undo restore | the UNDO's, which is the snapshot | **Unchanged.** §3.5. |

The fifth retain in the file already sources the live row: `retainRows` is set from `live` at `holdAwareApply.ts:466` — that is arc C's `crew_email` reject-branch repair, the first instance of this class.

### 3.1 What changes

`planHoldAwareApply` builds the prior-live index once, above the hold loop, and every retain in the mi11 branch goes through one helper:

```ts
const previousByName = new Map((args.previousCrewMembers ?? []).map((m) => [m.name, m]));

/** The row to retain for a held member: live non-identity, held identity. */
function retainRowFor(entityKey: string, heldValue: Record<string, unknown>): CrewMemberRow {
  const snapshot = rowFromHeldValue(heldValue);
  const live = previousByName.get(entityKey);
  return live ? { ...live, name: snapshot.name, email: snapshot.email } : snapshot;
}
```

The three mi11 sites call `retainRowFor(hold.entity_key, held)`; the restore branch keeps `rowFromHeldValue(held)`. The `previousByName` map that `applyUndoOverrideToMaps` currently rebuilds per hold (`holdAwareApply.ts:239`) is passed the hoisted one instead.

**The merge is a spread, not a field-by-field pick, and not a falsey coalesce.** Every non-identity field comes from `live` when `live` exists — including a field whose live value is `null`. A member whose phone was CLEARED in the sheet keeps it cleared; that is the operator's latest word too. AC-4 and AC-6 are the cases that make a `live.phone || snapshot.phone` implementation fail.

### 3.2 Why the helper re-imposes the held identity

The build loop reads `email: pin?.email ?? row.email` (`holdAwareApply.ts:407`). `pinnedIdentity` is set for every mi11 hold (`holdAwareApply.ts:246-249`) to `{ name: held.name ?? entity_key, email: held.email ?? null }` — so when `held.email` is null, `pin.email` is null and the loop falls through to the RETAINED row's email. A helper that returned the live row unmodified would put the LIVE email onto a row whose hold pins it to none, which is the identity move the hold exists to prevent.

Taking `name` and `email` from the snapshot closes that before the loop ever sees it, rather than relying on the pin being non-null. AC-7 is the case: a hold whose `held_value.email` is null, whose live row carries an email, asserting the retained row's email is null. Without it the defect is invisible, because every non-null-email case passes either way — the pin masks it.

This is also what makes the `retainRows.set` at `holdAwareApply.ts:300` inert: with identity taken from the snapshot, `row.email` is the same value in both worlds, so the `pin?.email ?? row.email` fallback cannot diverge there either.

### 3.3 WM-F6 at `holdAwareApply.ts:321` is the same shape

The comment there guarantees something real and this arc does not touch it: when the fold target is a pre-existing LIVE OWNER (a different person), the held crew must not take that owner's fields, must not suppress or consume them, and the collision must still be recorded so Approve blocks on `IDENTITY_WOULD_COLLIDE`. All of that is about the OWNER's row. None of it requires the held crew's OWN non-identity to come from the snapshot. The held crew stays pinned to its held identity, the owner is untouched, and the `collisions.push` at `holdAwareApply.ts:568-569` is unchanged.

**Two comments and one test currently say otherwise, and this arc owes them an edit.** `holdAwareApply.ts:283` and `holdAwareApply.ts:313` both say the held crew keeps "held non-identity", which stops being true at `holdAwareApply.ts:321`. Both are rewritten to say what WM-F6 actually protects: the held crew keeps ITS OWN non-identity, never the live owner's.

The `expect(alice.role)` / `expect(alice.phone)` pair at `tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts:220-222` asserts the same thing and CANNOT currently tell the difference: its `held_value` is built from `aliceLive` (`tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts:194`), so held and live are equal by construction and both implementations pass. That is a fixture that cannot reach the boundary it names. The arc diverges Alice's live row from her held snapshot after the hold is written and asserts the live values, turning a test that proves nothing on this axis into one that does — with `premiseHolds` stating the divergence on the case's own inputs.

### 3.4 Why `holdAwareApply.ts:300`'s `retainRows.set` moves anyway

Its value is unreachable, so moving it is a no-op the compiler cannot prove and a reader cannot see. Moving that `retainRows.set` makes the mi11 branch uniform, which is what lets §5's guard be a rule about a function rather than a list of three line numbers that goes stale the moment somebody adds a fourth. The cost is one identical call.

### 3.5 Why the restore branch keeps the snapshot

Not because no live row exists — one does. `undo_change` re-inserts the crew row (`supabase/migrations/20260804000000_undo_change_selections_reset_at.sql:198`, restoring the original id so the picker cookie and OAuth claim survive) before the `undo_override` hold is in play, so the next sync's `previousCrewMembers` carries it.

It keeps the snapshot because of whose word the row is. At every mi11 site the snapshot is a byproduct — nobody chose those values, they are just what the sheet said last time the hold was written. At the restore branch the snapshot IS the operator's decision: an admin looked at a removal or a rename and pressed undo, and `held_value` is the row they undid TO. It is more recent as an act than the live row is as a record, and the live row at that point is the snapshot's own re-insertion anyway. Preferring "live" there would mean preferring the undo's output over the undo's intent, which is the same value until something else has moved it, and wrong when something has.

## 4. Guard conditions

| Input | Value | Behaviour |
| --- | --- | --- |
| `args.previousCrewMembers` | `undefined` (caller does not pass it) | `previousByName` is empty; every mi11 site falls back to the held snapshot, no throw. L1, AC-8. |
| `args.previousCrewMembers` | `[]` | Same as `undefined`. AC-8. |
| `previousByName.get(entityKey)` | miss (a prior list that does not carry this member) | Held snapshot. L1, AC-8. |
| `held.email` | `null` | Retained row's email is `null`, from the snapshot, never the live row's. §3.2, AC-7. |
| `held.name` | absent | `rowFromHeldValue` yields `""`; the build loop overwrites `name` with the map key regardless (`holdAwareApply.ts:408`). Unchanged. |
| live row's `phone` | `null` | Retained as `null`. A cleared field is the operator's latest word. AC-6. |
| live row's `role_flags` | `[]` | Retained as `[]`, by the same rule. AC-6. |
| live row's non-identity | any | Retained in FULL — phone, role, role_flags, date_restriction, stage_restriction, flight_info. AC-1 asserts every one. |

## 5. The class guard

A new `_metaHoldRetainSource` suite under `tests/sync/` walks `lib/sync/holds/**` from disk, parses each file with the TypeScript compiler API, and for every `retainRows.set` call records the enclosing function and the second argument. It asserts:

- inside `planHoldAwareApply`, the value is `retainRowFor(hold.entity_key, held)` — the callee AND the argument list, so a call with the wrong key or the wrong held value fails;
- inside `applyUndoOverrideToMaps`, the value is `retainRowFor(...)`, a plain identifier (the live row at `holdAwareApply.ts:466`), or `rowFromHeldValue(...)` — and **at most one** of the last kind, so the restore branch is admitted and a SECOND snapshot retain added beside it is not;
- a retain in any other function fails by name, so a third home cannot appear and be governed by nothing.

It carries its premise: it fails by name if it finds fewer than five `retainRows.set` sites, or if either named function has none, so a parser that stopped matching cannot make the assertions vacuously true.

**What it does not establish, stated because round 1 was right to press on it.** This is a syntactic guard. It does not derive whose word a retain should carry, and it cannot: that is a judgement about hold semantics, which is what §3 is for and what §6's cases test. It does not check `retainRowFor`'s BODY — an implementation that returned the snapshot unconditionally satisfies every rule above, and is caught by AC-1 through AC-8, not here. And admitting `rowFromHeldValue` in `applyUndoOverrideToMaps` is a ratification of one site by count, not a derivation of what makes that site correct. The guard's whole job is narrower than "the class is closed": it is that a new retain cannot join this file without a reviewer being made to look at it. §7 of the plan enumerates the mutants it does and does not kill.

## 6. The help copy

Two shipped operator pages say a held member's "prior details stay in effect" (`app/help/admin/review-queues/page.mdx:59`, `app/help/admin/per-show-panel/page.mdx:20`). After this arc, only the prior IDENTITY stays in effect; the rest of the row follows the sheet and the live record. The sentences become wrong in the direction that matters, promising the operator a freeze this arc deliberately removes.

**Both are repaired in this arc.** Ruled by the orchestrator 2026-08-27: copy an arc makes wrong is that arc's defect, and deferring it merges main with false help. The replacement says identity rather than details, and says what happens to everything else:

> that person's prior identity stays in effect; their other details keep following the sheet and your edits.

The sweep for the same shape covered `app/help/**`, `lib/messages/**` and `components/**` and found exactly these two sites. `app/help/admin/dashboard/page.mdx:58` is about clearing an item, not about what a hold preserves, and is unchanged.

Both files are under `app/`, so **this IS a UI surface** under invariant 8. The `/impeccable critique` + `/impeccable audit` pair runs on the two MDX files before the whole-diff review, P0 and P1 findings are fixed or deferred with a `DEFERRED.md` entry, and the closeout carries the `impeccable-gate:` marker line. The pre-code mechanical UI checklist applies to the replacement copy: no em dashes, apostrophe literals, and no raw error codes — it has none of the three, and it is prose in an MDX page rather than a control, so tap targets and type tokens do not arise.

**Screenshot drift.** If any committed help screenshot frames either paragraph, its baseline moves. Regenerate only from the pinned Playwright Docker image with `--platform linux/amd64`, never from this arm64 host; and if `pnpm screenshot:help` is run locally for any reason, `git restore public/help/screenshots/` afterwards, because a local capture overwrites the x64-Linux baseline with host-architecture bytes that look like proposed changes and are not.

## 6.1 Dimensional Invariants

N/A. The only UI change is two sentences of MDX prose inside existing paragraphs. No component, no fixed-dimension parent, no flex or grid child, no new element with a dimension to relate to a parent's.

## 6.2 Transition Inventory

N/A. The changed copy is static prose with a single visual state. No component, no conditional render, no animation, and therefore no state pair to enumerate.

## 7. Acceptance criteria

- **AC-1.** A member whose row was edited after the hold's last write keeps EVERY edited non-identity field through a sync in which the sheet drops them: phone, role, role_flags, date_restriction, stage_restriction and flight_info are each seeded to differ from the held snapshot and each asserted against the live value. A helper that takes the live phone and the snapshot's role fails here.
- **AC-2.** The probe's `mi11_pending/crew_email` row reads `phoneAfter: LIVE_PHONE` — the filed defect's own reproduction, flipped.
- **AC-3.** The WM-F6 path does the same. A probe case seeds a live second member carrying the hold's proposed email, so `renameRow` resolves to a live owner and the `retainRows.set` at `holdAwareApply.ts:321` runs; the held member's `phoneAfter` reads the live value, the owner's own row reads a THIRD distinct value (so a bleed in either direction is visible), and the reservation collision still names the owner.
- **AC-4.** `tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts`'s WM-F6 case is made discriminating: Alice's live row diverges from her held snapshot, the assertions move to the live values, and a premise states the divergence on that case's own inputs.
- **AC-5.** The `crew_identity` restore row still reads `phoneAfter: HELD_PHONE`, with a comment naming this arc and §3.5 as the reason the two differ. The tombstone row still reads `survived: false, reported: true`.
- **AC-6.** A live non-identity field that is `null` or empty stays that way: a case whose live phone is `null` while the snapshot's is not asserts the retained phone is `null`. A `live.phone || snapshot.phone` implementation fails here.
- **AC-7.** A hold whose `held_value.email` is `null`, on a member whose live row carries an email, retains a row with a `null` email. An implementation that returns the live row without re-imposing identity fails here and passes every other case.
- **AC-8.** With `previousCrewMembers` absent, empty, or carrying no row for `entity_key`, the held snapshot is retained and nothing throws. Three cases, one per shape.
- **AC-9.** Planted mutants: a full reversion to the snapshot turns AC-1 red; a field-subset merge turns AC-1 red; a falsey coalesce turns AC-6 red; dropping the identity re-imposition turns AC-7 red. Each planted, observed, reverted, and pasted into the commit.
- **AC-10.** The §5 guard goes red before the `retainRows.set` at `holdAwareApply.ts:300` moves and green after. It also goes red on each of: a bare `rowFromHeldValue` added to `planHoldAwareApply`, a `retainRowFor` call with the wrong arguments, a second `rowFromHeldValue` retain added to `applyUndoOverrideToMaps`, and a walk that finds nothing.
- **AC-11.** No new advisory-lock acquisition anywhere in the diff.

## 8. Documented limits

- **L1 — no live row for this member, no repair.** When `previousCrewMembers` is absent or carries no row for `entity_key`, the held snapshot is retained, exactly as today. Not a silent wrong answer: it is the pre-arc behaviour, reached only when there is no better source. Same limit arc C recorded on the `previousCrewMembers` doc comment (`lib/sync/holds/holdAwareApply.ts:145-156`). Executable at AC-8.
- **L2 — the snapshot is pre-apply, per sync.** `previousCrewMembers` is read once when the show row is updated (`lib/sync/runScheduledCronSync.ts:1653`). An edit landing between that read and the upsert is not visible. The per-show advisory lock serializes syncs, so this window sits inside one locked transaction; concurrent editors are fenced out of scope per §1.1.
- **L3 — identity does not follow the live row.** By design, §3.2. An operator who changes the email of a member with an open MI-11 hold still sees the held email until the hold resolves. That is the hold's whole job.
- **L4 — the restore branch restores the undo's snapshot, including over a live row that has since drifted.** A member restored by an undo, then edited in the sheet, then dropped from the sheet again while the `undo_override` hold survives, is restored to the undo's values rather than the edited ones. Fenced in §1.1 and §3.5, pinned by AC-5. Narrower than it sounds: the restore branch only reaches the retain when the sheet has dropped the member, and the sheet dropping them is what stops their live row advancing in the first place.
