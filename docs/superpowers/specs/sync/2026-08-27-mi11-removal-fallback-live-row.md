# The mi11 retain prefers the crew member's own live row

`BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE`. Arc `fix/mi11-removal-fallback-live-row`, 2026-08-27.

A crew member with an open MI-11 hold drops off the sheet. The hold-aware apply keeps them alive, and puts back the row the hold captured when it OPENED. Every field edited on that member in between is silently reverted: phone, role, role flags, restrictions, flight info. This closes that, and the sibling site next to it that fails the same way.

## 1. What this arc is for

`lib/sync/holds/holdAwareApply.ts:337` is the genuine-removal fallback: the held entity is absent from the parse and nothing in the sheet folds onto it, so the planner retains `rowFromHeldValue(held)` and the snapshot-replace engine upserts that row across every column (`lib/sync/runScheduledCronSync.ts:1701` `upsertCrewMembers` names each column in its `do update set`). `held` is `sync_holds.held_value`, written once when the hold opened. So the upsert writes month-old values over whatever the sheet has taught the row since.

This is executable today, not inferred. `tests/sync/capabilityLossReachability.probe.test.ts` seeds the live row at `555-NEW` and every `held_value` at `555-OLD`, and the `mi11_pending/crew_email` case pins `phoneAfter: HELD_PHONE` (`phoneAfter`, `tests/sync/capabilityLossReachability.probe.test.ts:281`) — the revert, observed end-to-end through `runPhase2`.

## 1.1 Resolved scope, do not relitigate

- **The ruling is DEFECT.** bl-orch ruled 2026-08-27 07:45, and confirmed the same morning that the second site is the same shape. §2 records the rejected alternative and why.
- **The `crew_identity` restore branch is unchanged**, its `retainRows.set` at `holdAwareApply.ts:477`. It resurrects a row the sheet deleted and the admin un-deleted; the held snapshot is what the undo restores, and the probe pins `phoneAfter: HELD_PHONE` there as INTENDED (`tests/sync/capabilityLossReachability.probe.test.ts:328`). Not an oversight, not this arc's class.
- **Identity stays pinned from the held snapshot at every mi11 site.** Only non-identity moves to the live row. The hold exists to freeze the identity; §3.2 is the mechanism.
- **The threading is arc C's, already shipped.** `previousCrewMembers` reaches the planner from `lib/sync/runScheduledCronSync.ts:1653` through `lib/sync/applyParseResult.ts:171-172`. This arc adds no plumbing; it consumes what is there. The `previousByName` retain shape is precedent (`lib/sync/holds/holdAwareApply.ts:465-466`), not an open axis.
- **No lock topology changes.** The hold-aware apply runs inside the per-show advisory lock its caller already holds (`lib/sync/lockedShowTx.ts:59-61`). This arc adds no acquisition at any layer, so invariant 2's single-holder rule is untouched.
- **Concurrent edits racing the same sync are out of scope.** The advisory lock serializes them. The threat fence is ordinary operator edits between a hold opening and a later sync.
- **Nothing here touches the database, a config flag, or a UI surface.** No DDL, no CHECK, no enum, no RPC signature, no `app/` or `components/` file — so the tier x domain matrix, the CHECK/enum matrix, the flag lifecycle table and the invariant-8 impeccable pair are all N/A, and this arc carries `impeccable-gate: N/A — no UI surface`. The diff is one library function, one probe file, one structural test.
- **No new ledger row.** Per the 2026-08-27 arc batch directive, every instance of this shape is repaired in-branch; anything unrepaired is named in the PR body, not filed.

## 2. The ruling, and the alternative it rejects

The `retainRows.set` fallback at `holdAwareApply.ts:337` fires when the member is genuinely absent from the SHEET. That is a fact about the sheet. It says nothing about whether a LIVE row exists in `crew_members`. For an MI-11-held member one always does: `protectedNames.add(hold.entity_key)` is unconditional for a surviving mi11 hold (`lib/sync/holds/holdAwareApply.ts:250`), so every sync since the hold opened has kept that row from deletion.

When a live row exists, it is the operator's most recent word on that member and the held snapshot is older by construction. So the live row wins.

**Rejected: "a hold freezes the row."** A hold exists to stop a row from being REMOVED and to stop its IDENTITY from moving while an admin decides. Nothing in the hold's opening path tells the operator that edits they make afterwards will be discarded, and the discard is silent — no warning, no feed entry, no notice. A freeze nobody was told about and nobody can see is a data-loss bug wearing a semantics argument. Recorded here so it is not re-derived.

## 3. The four snapshot retains

Every `rowFromHeldValue(held)` call site in `lib/sync/holds/**`, from `grep -rn "rowFromHeldValue" lib`. The classification axis is the one the ruling turns on: **does a live row for `hold.entity_key` exist when this line runs?**

| Site | Branch | Live row for `entity_key`? | Disposition |
| --- | --- | --- | --- |
| `holdAwareApply.ts:300` | mi11 rename-fold onto a truly-added row | Yes | **Inert change.** Moves to the helper for uniformity. The value is never read: `nonIdentityOverride.set` at `holdAwareApply.ts:299` is unconditional on this branch, so the build loop at `lib/sync/holds/holdAwareApply.ts:403-410` takes `override` as its base (`holdAwareApply.ts:407`). §3.3. |
| `holdAwareApply.ts:321` | mi11 WM-F6, fold target is a pre-existing live owner | Yes | **Change.** Same shape as `holdAwareApply.ts:337`. §3.1. |
| `holdAwareApply.ts:337` | mi11 genuine removal | Yes | **Change.** The filed defect. §3.1. |
| `holdAwareApply.ts:477` | `crew_identity` undo restore | **No, by construction** | **Unchanged.** The row was deleted; `rowFromHeldValue` is the only source there is. |

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

### 3.2 Why the helper re-imposes the held identity

The build loop reads `email: pin?.email ?? row.email` (`holdAwareApply.ts:407`). `pinnedIdentity` is set for every mi11 hold (`holdAwareApply.ts:246-249`) to `{ name: held.name ?? entity_key, email: held.email ?? null }` — so when `held.email` is null, `pin.email` is null and the loop falls through to the RETAINED row's email. A helper that returned the live row unmodified would put the LIVE email onto a row whose hold pins it to none, which is the identity move the hold exists to prevent. Taking `name` and `email` from the snapshot closes that before the loop ever sees it, at every site, rather than relying on the pin being non-null.

This is also what makes the `retainRows.set` at `holdAwareApply.ts:300` inert: with identity taken from the snapshot, `row.email` is the same value in both worlds, so the `pin?.email ?? row.email` fallback cannot diverge there either.

### 3.3 Why `holdAwareApply.ts:300` moves anyway

Its value is unreachable, so moving it is a no-op the compiler cannot prove and a reader cannot see. Moving it makes the mi11 branch uniform, which is what lets the class cover in §5 be a partition of the file rather than a list of three line numbers that goes stale the moment somebody adds a fourth. The cost is one identical call; the benefit is that a new retain added to `planHoldAwareApply` fails by default instead of joining the class silently.

### 3.4 WM-F6 at `holdAwareApply.ts:321` is the same shape

The comment there guarantees something real and this arc does not touch it: when the fold target is a pre-existing LIVE OWNER (a different person), the held crew must not take that owner's fields, must not suppress or consume them, and the collision must still be recorded so Approve blocks on `IDENTITY_WOULD_COLLIDE`. All of that is about the OWNER's row. None of it requires the held crew's OWN non-identity fields to come from the opening snapshot. The held crew stays pinned to its held identity, the owner is untouched, and the `collisions.push` at `holdAwareApply.ts:568-569` is unchanged.

## 4. Guard conditions

| Input | Value | Behaviour |
| --- | --- | --- |
| `args.previousCrewMembers` | `undefined` (caller does not pass it) | `previousByName` is empty; every site falls back to the held snapshot. Today's behaviour, L1. |
| `args.previousCrewMembers` | `[]` | Same as `undefined`. |
| `previousByName.get(entityKey)` | miss | Held snapshot. L1. |
| `held.email` | `null` | Retained row's email is `null`, from the snapshot, never the live row's. §3.2. |
| `held.name` | absent | `rowFromHeldValue` yields `""`; the build loop overwrites `name` with the map key regardless (`holdAwareApply.ts:408`). Unchanged. |
| live row's non-identity | any, including `null` phone | Retained verbatim. A member whose phone was CLEARED live keeps it cleared; that is the operator's latest word too. |

## 5. The class cover

A structural test walks `lib/sync/holds/**` from disk and partitions every `retainRows.set(...)` call by its enclosing function:

- inside `planHoldAwareApply` — the value expression must be `retainRowFor(`;
- inside `applyUndoOverrideToMaps` — either `retainRowFor(`/a live-row variable, or `rowFromHeldValue(` on the documented restore branch.

It carries its own premise: it fails by name if it finds fewer than five `retainRows.set` sites, or none in either partition, so a parser that stopped matching cannot make the assertion vacuously true. A new retain added to `planHoldAwareApply` with a bare snapshot fails without anyone remembering this document.

Keyed on the enclosing function rather than on line numbers on purpose: line numbers are what made the original sweep an enumeration.

## 6. Acceptance criteria

- **AC-1.** A member whose phone was edited after the hold opened keeps the edited phone through a sync in which the sheet drops them. The probe's `mi11_pending/crew_email` row reads `phoneAfter: LIVE_PHONE`.
- **AC-2.** The WM-F6 path does the same. A new probe case seeds a live second member carrying the hold's proposed email, so the fold target is a live owner and the `retainRows.set` at `holdAwareApply.ts:321` runs; its `phoneAfter` reads `LIVE_PHONE`, the live owner's own row is untouched, and the reservation collision is still recorded.
- **AC-3.** The `crew_identity` restore row still reads `phoneAfter: HELD_PHONE`, with a comment naming this arc as the reason the two differ.
- **AC-4.** The tombstone row still reads `survived: false, reported: true` — the counterweight against a repair that quiets arm (c) instead of retaining a row.
- **AC-5.** A planted mutant that restores the held-snapshot preference turns AC-1 and AC-2 red. Planted and observed, not asserted.
- **AC-6.** The structural cover in §5 is red before the `retainRows.set` at `holdAwareApply.ts:300` moves and green after, and red on a bare `rowFromHeldValue` added to `planHoldAwareApply`.
- **AC-7.** No new advisory-lock acquisition anywhere in the diff.

## 7. Documented limits

- **L1 — no live row, no repair.** When `previousCrewMembers` is absent or carries no row for `entity_key`, the held snapshot is retained, exactly as today. Not a silent wrong answer: it is the pre-arc behaviour, reached only when there is no better source. Same limit arc C recorded for the `crew_email` branch (`lib/sync/holds/holdAwareApply.ts:145-156`).
- **L2 — the snapshot is pre-apply, per sync.** `previousCrewMembers` is read once when the show row is updated (`lib/sync/runScheduledCronSync.ts:1653`). An edit landing between that read and the upsert is not visible. The per-show advisory lock serializes syncs, so this window is inside one locked transaction; concurrent editors are fenced out of scope per §1.1.
- **L3 — identity does not follow the live row.** By design, §3.2. An operator who changes the email of a member with an open MI-11 hold still sees the held email until the hold resolves. That is the hold's whole job.
- **L4 — the restore branch still reverts.** A restore whose live row drifted after the undo landed is restored to the snapshot. Fenced in §1.1, pinned by AC-3.
