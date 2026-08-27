# Every hold-aware retain prefers the crew member's own live row

`BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE`. Arc `fix/mi11-removal-fallback-live-row`, 2026-08-27.

A crew member with an open hold drops off the sheet. The hold-aware apply keeps them alive, and puts back a snapshot the hold captured at its last write. Every field edited on that member since is silently reverted: phone, role, role flags, restrictions, flight info. This closes that at every site in the file, under one rule.

## 1. What this arc is for

`lib/sync/holds/holdAwareApply.ts:337` is the genuine-removal fallback: the held entity is absent from the parse and nothing in the sheet folds onto it, so the planner retains `rowFromHeldValue(held)` and the snapshot-replace engine upserts that row across every column (`upsertCrewMembers` names nine columns in its `do update set`, `lib/sync/runScheduledCronSync.ts:1701`). `held` is `sync_holds.held_value`. So the upsert writes an old set of values over whatever the sheet has taught the row since.

**How old, exactly.** `held_value` is not written once and never again. `writeMi11Holds` upserts on `(show_id, domain, entity_key)` with `held_value = excluded.held_value` (`lib/sync/holds/writeMi11Holds.ts:78`), so a later sync that still reports the same MI-11 refreshes it from that sync's `liveCrewByName`. What the retain re-inserts is therefore the snapshot as of the last sync that re-asserted the hold — a LAGGING snapshot, not necessarily the opening one. The defect is the same either way: once the member stops appearing in the sheet, the hold stops being re-written, the snapshot stops advancing, and the retain keeps writing it back.

This is executable today, not inferred. `tests/sync/capabilityLossReachability.probe.test.ts` seeds the live row at `555-NEW` and every `held_value` at `555-OLD`, and the `mi11_pending/crew_email` case pins `phoneAfter: HELD_PHONE` (`phoneAfter`, `tests/sync/capabilityLossReachability.probe.test.ts:281`) — the revert, observed end-to-end through `runPhase2`.

## 1.1 Resolved scope, do not relitigate

- **The ruling is DEFECT.** Ruled by the orchestrator 2026-08-27 07:45. §2 records the rejected alternative, what supports it, and why it still loses.
- **ONE RULE AT EVERY RETAIN.** Identity from the held snapshot; non-identity from the freshest source that is THIS member: the sheet row when the sheet carries one for them (under their own name or the replacement name a rejected rename gave them), their own live row otherwise, the snapshot only when neither exists. §3 is the site table, **§3.7 is the closed enumeration of every path that reaches a retain**, and §3.5 is why the restore branch is inside the rule rather than beside it.
- **Three refuted claims, recorded so none is re-derived.** Round 1 killed the live-row-existence axis as the thing that separates the sites — the restore branch runs WITH a live row, because `undo_change` re-inserts the crew row (`supabase/migrations/20260804000000_undo_change_selections_reset_at.sql:198`). Round 2 killed its replacement, the reading on which the restore branch carries an undo's payload: `mi11_reject_hold` writes the same persisted shape and never touches `crew_members` (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:83-98`), so that site serves two producers and `readOpenHolds` cannot tell them apart (`lib/sync/holds/holdPort.ts:27`). Round 3 killed a claim inside the uniform rule itself — that the retain is never consulted while the sheet lists the member — which is false for a rename baseline, where the hold survives BECAUSE a parse row carries the suppressed email (`holdAwareApply.ts:107-110`). The rule now names the sheet's replacement row as the freshest source on that path (§3.8), and §3.7 enumerates the paths instead of asserting a general claim about them. Both fences the earlier drafts carried are LIFTED, by the orchestrator, on that evidence.

- **Enumerate, do not assert.** Three consecutive rounds each found one more state on this one surface. §3.7 is the response the same-vector rule asks for: a closed table over the code's own branch structure, not another sentence claiming a property of it. A new finding on this axis is admissible with the row it belongs in, or as a row the table is missing.
- **No origin discriminator is added.** No migration, no RPC change, no new `sync_holds` column, no `readOpenHolds` field. §3.5 says why the distinction has no observable consequence once the rule is uniform.
- **Identity stays pinned from the held snapshot at every site.** Only non-identity moves. §3.2 is the mechanism; AC-7 and AC-8 are the cases.
- **The threading is arc C's, already shipped.** `previousCrewMembers` reaches the planner from `lib/sync/runScheduledCronSync.ts:1653` through `lib/sync/applyParseResult.ts:171-172`. This arc adds no plumbing.
- **No lock topology changes.** The planner acquires nothing; it runs inside the per-show advisory lock its caller already holds (`lib/sync/lockedShowTx.ts:59-61`). Invariant 2's single-holder rule is preserved by not participating.
- **Concurrent edits racing the same sync are out of scope.** The advisory lock serializes them. The threat fence is ordinary operator edits between a hold's last write and a later sync.
- **No DB schema change.** No DDL, no CHECK, no enum, no RPC signature — the tier x domain matrix, the CHECK/enum matrix and the flag lifecycle table are N/A. The two RPCs this document cites are READ as evidence and not edited.
- **No new ledger row.** Per the 2026-08-27 arc batch directive, every instance of this shape is repaired in-branch; anything unrepaired is named in the PR body.

## 2. The ruling, and the alternative it rejects

The fallback at `holdAwareApply.ts:337` fires when the member is genuinely absent from the SHEET. Non-identity fields have exactly one ordinary source, the sheet, and the hold does not hold them: for a held member the sheet still lists, `crewMembers.push({ ...m, name: pin.name, email: pin.email })` (`holdAwareApply.ts:395`) takes the sheet's non-identity verbatim and pins only the identity. So the hold's own code says non-identity follows the freshest source. When the sheet has nothing to say, the live row is the freshest source there is, and the snapshot is strictly older than it.

**Rejected: "a hold freezes the row."** A hold exists to stop a row from being REMOVED and to stop its IDENTITY from moving while an admin decides.

That reading is not baseless, and round 1 was right to say so. Two shipped help pages tell the operator that a held member's "prior details stay in effect" until they decide (`app/help/admin/review-queues/page.mdx:59`, `app/help/admin/per-show-panel/page.mdx:20`). "Prior details" reads as the whole row. So the freeze reading has operator-facing copy behind it, and this spec does not claim nobody was ever told.

It still loses, for two reasons. The code says identity: every hold-aware path pins identity and lets non-identity follow the sheet, and no path holds non-identity on purpose. And the freeze, as implemented, is invisible and unbounded — an admin who edits a held member's phone in the sheet sees the edit apply, sees it on the crew page, and then sees it silently revert on the sync after the member drops off the sheet. No warning, no feed entry, no notice. A freeze the operator cannot observe and was never asked to confirm is a data-loss bug, whatever the help page says. What the help copy earns is not the ruling; it is §6.

## 3. The five retains, and the one rule

Every `retainRows.set` in `lib/sync/holds/**`, from `grep -rn "retainRows.set" lib`. All five take the same helper.

| Site | Branch | Today | Disposition |
| --- | --- | --- | --- |
| `holdAwareApply.ts:300` | mi11 rename-fold onto a truly-added row | `rowFromHeldValue(held)` | **Inert change.** The value is never read: `nonIdentityOverride.set` at `holdAwareApply.ts:299` is unconditional on this branch, so the build loop at `holdAwareApply.ts:407` takes `override` as its base. §3.4. |
| `holdAwareApply.ts:321` | mi11 WM-F6, fold target is a pre-existing live owner | `rowFromHeldValue(held)` | **Change.** §3.3. |
| `holdAwareApply.ts:337` | mi11 genuine removal | `rowFromHeldValue(held)` | **Change.** The filed defect. |
| `holdAwareApply.ts:466` | `crew_email` reject, arc C's repair | `retainRows.set` from `live`, or NO RETAIN when there is none | **Change.** §3.6 — it gains the identity re-imposition it never had, and its no-retain degrade closes. |
| `holdAwareApply.ts:477` | `crew_identity` restore, from an undo OR a reject | `maps.retainRows.set` of `rowFromHeldValue(held)` | **Change.** §3.5. |

### 3.1 What changes

`planHoldAwareApply` builds the prior-live index once, above the hold loop, and every retain in the file goes through one helper:

```ts
const previousByName = new Map((args.previousCrewMembers ?? []).map((m) => [m.name, m]));

/** The row to retain for a held member: the member's OWN live non-identity, the held identity. */
function retainRowFor(entityKey: string, heldValue: Record<string, unknown>): CrewMemberRow {
  const snapshot = rowFromHeldValue(heldValue);
  const live = previousByName.get(entityKey);
  return live ? { ...live, name: snapshot.name, email: snapshot.email } : snapshot;
}
```

All five sites call `retainRowFor(hold.entity_key, held)`. `applyUndoOverrideToMaps` receives the hoisted map instead of rebuilding `previousByName` per hold (`holdAwareApply.ts:239`), and takes the helper as a parameter.

**The merge is a spread, not a field-by-field pick, and not a falsey coalesce.** Every non-identity field comes from `live` when `live` exists — including one whose live value is `null`, `""` or `[]`. A member whose phone was CLEARED, whose role cell went blank, or whose capability flags were emptied keeps all three that way; that is the operator's latest word too. A blank role cell is reachable: the crew parser skips a row only for a blank NAME and persists the trimmed role as it finds it (`lib/parser/blocks/crew.ts:189-195`). AC-6 is the case set that makes a `live.phone || snapshot.phone` implementation fail, on all three empty shapes.

### 3.2 Why the helper re-imposes the held identity

The build loop reads `email: pin?.email ?? row.email` (`holdAwareApply.ts:407`). `pinnedIdentity` is set for every mi11 hold (`holdAwareApply.ts:246-249`) and for the `crew_email` reject branch (`holdAwareApply.ts:449-452`), in both cases to `{ name: held.name ?? entity_key, email: held.email ?? null }` — so when `held.email` is null, `pin.email` is null and the loop falls through to the RETAINED row's email. A helper that returned the live row unmodified would put the LIVE email onto a row whose hold pins it to none, which is the identity move the hold exists to prevent.

Taking `name` and `email` from the snapshot closes that before the loop ever sees it, rather than relying on the pin being non-null. AC-7 is the case at an mi11 site and AC-8 at the `crew_email` site, both with a null `held_value.email` and a live row carrying one. Without them the defect is invisible, because every non-null-email case passes either way — the pin masks it.

This is also what makes the `retainRows.set` at `holdAwareApply.ts:300` inert: with identity taken from the snapshot, `row.email` is the same value in both worlds, so the `pin?.email ?? row.email` fallback cannot diverge there either.

### 3.3 WM-F6 at `holdAwareApply.ts:321`

The comment there guarantees something real and this arc does not touch it: when the fold target is a pre-existing LIVE OWNER (a different person), the held crew must not take that owner's fields, must not suppress or consume them, and the collision must still be recorded so Approve blocks on `IDENTITY_WOULD_COLLIDE`. All of that is about the OWNER's row. None of it requires the held crew's OWN non-identity to come from the snapshot. The held crew stays pinned to its held identity, the owner is untouched, and the `collisions.push` at `holdAwareApply.ts:568-569` is unchanged.

**Two comments and one test currently say otherwise, and this arc owes them an edit.** `holdAwareApply.ts:283` and `holdAwareApply.ts:313` both say the held crew keeps "held non-identity", which stops being true. Both are rewritten to say what WM-F6 actually protects: the held crew keeps ITS OWN non-identity, never the live owner's.

The `alice.role` and `alice.phone` assertions at `tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts:220-222` assert the same thing and CANNOT currently tell the difference: its `held_value` is built from `aliceLive` (`tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts:194`), so held and live are equal by construction and both implementations pass. That is a fixture that cannot reach the boundary it names. The arc diverges Alice's live row from her held snapshot after the hold is written and asserts the live values, with `premiseHolds` stating the divergence on the case's own inputs.

### 3.4 Why `holdAwareApply.ts:300`'s retain moves anyway

Its value is unreachable, so moving it is a no-op the compiler cannot prove and a reader cannot see. Moving it is what makes §5's guard a single rule with no exceptions, rather than a rule plus a ratified site that every future reader has to look up. The cost is one identical call.

### 3.5 The restore branch is inside the rule, not beside it

Round 2's finding, and the reason the earlier fence is gone. `mi11_reject_hold` converts a rejected RENAME or REMOVAL into `kind = 'undo_override'`, `domain = 'crew_identity'`, `held_value = held_value || {baseline}`, `proposed_value = null` (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:83-98`) — the same persisted shape `undo_change` writes — and it does NOT touch `crew_members`, because a rejected removal means keep the member exactly as they are. `readOpenHolds` selects no column that distinguishes the two producers (`lib/sync/holds/holdPort.ts:27`).

So the site serves both, and under the old design a Reject reproduced the very defect this arc closes: current live row, lagging `held_value`, snapshot wins.

**The uniform rule needs no discriminator, because live-row presence already is one.**

- **Reject:** the live row is untouched and current, so it wins. The repair.
- **Undo:** `undo_change` re-inserts the crew row from `before_image`, and `held_value` IS that `before_image`, so live equals the snapshot and the rule returns the same row either way. A no-op.
- **No live row at all** — a genuine resurrection — falls back to the snapshot, which is exactly the restore semantics.

**Earlier drafts of this section carried a fourth bullet claiming the retain is never consulted while the sheet lists the member. Round 3 refuted it and §3.7 replaces it with an enumeration.** For a RENAME baseline the sheet does list the member, under the replacement name, and the hold survives precisely because it does (`holdAwareApply.ts:107-110` keeps the hold while any parse row carries the suppressed email). That is one reachable path, not a general hole, and §3.7 is the closed set that says so.

Adding an origin marker instead would mean a migration, a write in both SECURITY DEFINER RPCs, a `readOpenHolds` field and validation-schema parity, to encode a distinction with no observable consequence. Recorded here so it is not proposed again.

### 3.6 The `crew_email` reject branch gains what it never had

`holdAwareApply.ts:466` is arc C's repair and already retains the live row, so this arc changes it for two smaller reasons.

**Identity.** It sets `pinnedIdentity` and then retains the live row RAW, so a hold whose `held_value.email` is null leaks the live email through the same `pin?.email ?? row.email` fallback as §3.2. Reachable: a member with no email, the sheet adds one, the admin rejects. AC-8 is the case.

**Its no-retain degrade closes.** Today the retain is guarded — `if (live) maps.retainRows.set(...)` — so with no live row the branch adds `protectedNames` and no row, which is the shape that produced arc C's original false capability-loss report (`tests/sync/capabilityLossReachability.probe.test.ts:1-60`). Through the helper the call is unconditional and the snapshot is retained instead, so the name is back in `plan.crewMembers` and arm (c) sees no absence. Strictly better than retaining nothing: the row is delete-protected either way, and this is what all four sibling sites already do. Arc C recorded the gap as a documented degrade (`lib/sync/holds/holdAwareApply.ts:145-156`); this closes it. AC-9.

### 3.7 Every path that reaches a retain

Three consecutive rounds each found one more site or state where the rule's source was wrong. That is the signature of patching instances instead of closing a class, so this is the enumeration rather than a fourth patch. The axes are the code's own branch structure, not an imagined input space: which branch sets the retain, which `baseline` the hold carries, and whether the replacement row is truly added. Eight rows, and they are all of them.

| # | Branch | Hold state | Is `entity_key` in the parse? | Freshest source for this member | Code, after this arc |
| --- | --- | --- | --- | --- | --- |
| 1 | `holdAwareApply.ts:300` mi11 rename-fold | fold target truly added | no | the sheet's fold-target row | the sheet row, via `nonIdentityOverride` |
| 2 | `holdAwareApply.ts:321` mi11 WM-F6 | fold target is a pre-existing live owner | no | the member's own live row — the owner's row is a different person | live |
| 3 | `holdAwareApply.ts:337` mi11 genuine removal | no fold target | no | the member's own live row | live |
| 4 | `holdAwareApply.ts:466` `crew_email` reject | — | no (if yes, the parse pass emits it and `seen` blocks the retain, `holdAwareApply.ts:404`) | the member's own live row | live |
| 5 | `holdAwareApply.ts:477` restore | baseline `removal` or `delete` | no — reappearing RELEASES the hold (`holdAwareApply.ts:93-95`) | the member's own live row | live |
| 6 | `holdAwareApply.ts:477` restore | baseline `rename`, replacement truly added | **yes, under the replacement name** — and the hold survives BECAUSE it is there | **the suppressed replacement row**, which is this member under a name the undo rejected | the replacement row, via `nonIdentityOverride`. §3.8 |
| 7 | `holdAwareApply.ts:477` restore | baseline `rename`, replacement is a pre-existing live owner | yes, but that row is a DIFFERENT person and WM-F4 leaves it alone | the member's own live row | live |
| 8 | `applyUndoOverrideToMaps` tombstone | `absent === true` | — | — | no retain at all; suppression only |

Rows 2 and 7 are the same guarantee twice: when the other row belongs to someone else, it is never a source for this member. Rows 1 and 6 are the same guarantee twice the other way: when the other row IS this member under a different name, the sheet wins. Row 6 was the asymmetry — the restore branch already suppressed the replacement and never adopted its non-identity, while the mi11 fold at row 1 does both.

### 3.8 The rename-restore adopts what it suppresses

Inside the existing truly-added guard at `holdAwareApply.ts:495` — the same `!maps.previousCrewNames.has(sa.name)` test that decides whether to suppress at all — the branch also records the replacement as this hold's `nonIdentityOverride`. The build loop then composes it exactly as it does for the mi11 fold: `base = { ...override, name, email: pin?.email ?? row.email }` (`holdAwareApply.ts:407`), and since the restore branch sets no `pinnedIdentity`, `row.email` supplies the identity from the retained snapshot row. Identity from the hold, non-identity from the sheet.

The replacement is found the way the release check finds it (`holdAwareApply.ts:106-110`): the parse row whose canonical email equals the suppressed email, under ANY name, falling back to the row at `sa.name`. That is why `parseByName` is a parameter of `applyUndoOverrideToMaps` and why it currently ends in `void parseByName;` (`holdAwareApply.ts:503`) — the argument was threaded and never used.

**The guard is load-bearing in both directions.** Adopting an override for a PRE-EXISTING live owner is the WM-F4 bleed (row 7), so the override is set only when the replacement is truly added, which is precisely when it was suppressed. A replacement that stays live keeps its own fields and gives none away. AC-16 is the case.

## 4. Guard conditions

| Input | Value | Behaviour |
| --- | --- | --- |
| `args.previousCrewMembers` | `undefined` (caller does not pass it) | `previousByName` is empty; every site falls back to the held snapshot, no throw. L1, AC-10. |
| `args.previousCrewMembers` | `[]` | Same as `undefined`. AC-10. |
| `previousByName.get(entityKey)` | miss (a prior list carrying other members) | Held snapshot. L1, AC-10. |
| `held.email` | `null` | Retained row's email is `null`, from the snapshot, never the live row's. §3.2, AC-7 and AC-8. |
| `held.name` | absent | `rowFromHeldValue` yields `""`; the build loop overwrites `name` with the map key regardless (`holdAwareApply.ts:408`). Unchanged. |
| live `phone` | `null` | Retained as `null`. AC-6. |
| live `flight_info` | `null` | Retained as `null`. AC-6. |
| live `date_restriction` | `{ kind: "none" }` or `{ kind: "explicit", days: [] }` | Retained as given. A semantic fallback that treats either as absent and reaches for the snapshot fails AC-6. |
| live `stage_restriction` | `{ kind: "none" }` | Retained as given. Same. |
| live `role` | `""` | Retained as `""`. Reachable from a blank role cell (`lib/parser/blocks/crew.ts:189-195`). AC-6. |
| live `role_flags` | `[]` | Retained as `[]`. AC-6. |
| live non-identity | any | Retained in FULL — phone, role, role_flags, date_restriction, stage_restriction, flight_info. AC-1 asserts every one. |

## 5. The class guard

A new `_metaHoldRetainSource` suite under `tests/sync/` walks `lib/sync/holds/**` from disk, parses each file with the TypeScript compiler API, and for every `retainRows.set` call records the enclosing function and the second argument. Because the rule is uniform, so is the assertion:

- every `retainRows.set` in the tree passes exactly `retainRowFor(hold.entity_key, held)` — callee AND argument text, so a right-callee-wrong-key call fails and so does an indirection through a local variable;
- the site COUNT is exactly five. A sixth retain fails even in the admitted shape, which is the tripwire: whoever adds one has to come back here and say why it is a retain.

It carries its premise: it fails by name if the walk finds no `retainRows.set` at all, so a parser that stopped matching cannot make the assertions vacuously true.

**What it does not establish, stated because rounds 1 and 2 both pressed on it.** This is a syntactic guard. It does not check `retainRowFor`'s BODY — an implementation that returned the snapshot unconditionally satisfies every rule above, and is caught by §7's behavioural criteria, not here. It does not derive that five is the right number of retains, only that the number has not changed unremarked. Its whole job is that no retain can join or change shape in this file without failing a test first. §6.2 of the plan enumerates the mutants it does and does not kill.

## 6. The help copy

Two shipped operator pages say a held member's "prior details stay in effect" (`app/help/admin/review-queues/page.mdx:59`, `app/help/admin/per-show-panel/page.mdx:20`). After this arc, only the prior IDENTITY stays in effect; the rest of the row follows the sheet and the live record. The sentences become wrong in the direction that matters, promising the operator a freeze this arc deliberately removes.

**Both are repaired in this arc.** Ruled by the orchestrator 2026-08-27: copy an arc makes wrong is that arc's defect, and deferring it merges main with false help. The replacement says identity rather than details, and says what happens to everything else:

> that person's prior identity stays in effect; their other details keep following the sheet and your edits.

The sweep for the same shape covered `app/help/**`, `lib/messages/**` and `components/**` and found exactly these two sites. `app/help/admin/dashboard/page.mdx:58` is about clearing an item, not about what a hold preserves, and is unchanged. AC-12 is the walker that keeps it that way.

Both files are under `app/`, so **this IS a UI surface** under invariant 8. The `/impeccable critique` + `/impeccable audit` pair runs on the two MDX files before the whole-diff review, P0 and P1 findings are fixed or deferred with a `DEFERRED.md` entry, and the closeout carries the `impeccable-gate:` marker line. The pre-code mechanical UI checklist applies to the replacement copy: no em dashes, apostrophe literals, no raw error codes — it has none of the three, and it is prose in an MDX page rather than a control, so tap targets and type tokens do not arise.

**Screenshot drift.** If any committed help screenshot frames either paragraph, its baseline moves. Regenerate only from the pinned Playwright Docker image with `--platform linux/amd64`, never from this arm64 host; and if `pnpm screenshot:help` is run locally for any reason, `git restore public/help/screenshots/` afterwards, because a local capture overwrites the x64-Linux baseline with host-architecture bytes that look like proposed changes and are not.

## 6.1 Dimensional Invariants

N/A. The only UI change is two sentences of MDX prose inside existing paragraphs. No component, no fixed-dimension parent, no flex or grid child, no new element with a dimension to relate to a parent's.

## 6.2 Transition Inventory

N/A. The changed copy is static prose with a single visual state. No component, no conditional render, no animation, and therefore no state pair to enumerate.

## 7. Acceptance criteria

- **AC-1.** A member whose row was edited after the hold's last write keeps EVERY edited non-identity field through a sync in which the sheet drops them: `phone`, `role`, `role_flags`, `date_restriction`, `stage_restriction` and `flight_info` are each seeded to differ from the held snapshot and each asserted against the live value, individually. A helper that takes the live phone and the snapshot's role fails here and names the field.
- **AC-2.** The probe's `mi11_pending/crew_email` row reads `phoneAfter: LIVE_PHONE` — the filed defect's own reproduction, flipped.
- **AC-3.** The WM-F6 path does the same. A probe case seeds a live second member carrying the hold's proposed email, so `renameRow` resolves to a live owner and the `retainRows.set` at `holdAwareApply.ts:321` runs; the held member's `phoneAfter` reads the live value, the owner's own row reads a THIRD distinct value (so a bleed in either direction is visible), and the reservation collision still names the owner.
- **AC-4.** `tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts`'s WM-F6 case is made discriminating: Alice's live row diverges from her held snapshot, the assertions move to the live values, and a premise states the divergence on that case's own inputs.
- **AC-5.** THE REJECT PATH. A case that drives `mi11_reject_hold` on a rejected removal, then syncs with the member absent, asserts the surviving row carries the LIVE non-identity and not `held_value`'s. This is the §3.5 finding made executable; a planted mutant restoring `rowFromHeldValue` at `holdAwareApply.ts:477` turns it red. The `crew_identity` restore row in the probe suite moves to the live value with a comment naming §3.5 as the reason, and the tombstone row still reads `survived: false, reported: true`.
- **AC-6.** Empty live values survive, on EVERY non-identity field, not a sample of them: `null` phone, `null` flight_info, `""` role, `[]` role_flags, `{ kind: "none" }` stage_restriction, and both `{ kind: "none" }` and `{ kind: "explicit", days: [] }` date_restriction — each against a non-empty snapshot value for the same field, each asserted individually. Six fields, seven shapes. The field list is derived from `CrewMemberRow` (`lib/parser/types.ts:186-195`) rather than chosen, and the test asserts that derivation: it enumerates the type's non-identity keys and fails if any lacks a case, so a field added to the type cannot silently escape. A helper that coalesces only `flight_info` back to the snapshot fails here and names it.
- **AC-7. DEFENSIVE, not reachable-path proof — labelled as such in the file.** At an mi11 site, a hold whose `held_value.email` is `null` on a member whose live row carries an email retains a row with a `null` email. Round 3 showed the divergence is not reachable under the threat fence: with a null `held.email` every parse-present sync writes `email: pin.email`, which is null (`holdAwareApply.ts:391`), and rejecting an email change does not mutate `crew_members` (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:67`), so the live row's email is null too by the time any retain runs. The case hand-seeds the inconsistent pair. It is kept because the identity re-imposition costs two words and the alternative is a helper whose correctness depends on a coincidence between two tables; it is NOT evidence that the leak happens today, and the spec does not claim it is.
- **AC-8. DEFENSIVE, same classification.** The same at the `crew_email` reject branch, whose `retainRows.set` at `holdAwareApply.ts:466` sets `pinnedIdentity` and today retains `live` raw.
- **AC-9.** The `crew_email` branch's no-retain degrade is closed: with no live row for `entity_key`, the branch retains the held snapshot rather than nothing, and the capability-loss notice reports no loss for a name that survived.
- **AC-10.** With `previousCrewMembers` absent, empty, or carrying no row for `entity_key`, the held snapshot is retained and nothing throws. Three cases, one per shape.
- **AC-11.** Planted mutants, each observed and reverted: full reversion to the snapshot turns AC-1 red; a field-subset merge turns AC-1 red; a falsey coalesce turns AC-6 red; dropping the identity re-imposition turns AC-7 and AC-8 red; assuming a live row exists turns AC-10 red; restoring the snapshot preference at `holdAwareApply.ts:477` turns AC-5 red.
- **AC-12.** No help page promises that a held member's prior DETAILS stay in effect, and both primary pages carry the identity wording. Asserted by a walker over every help `.mdx`, so a third page cannot acquire the phrase unnoticed.
- **AC-13.** The §5 guard: red before the last retain moves and green after; red on a bare `rowFromHeldValue` retain added anywhere in the tree; red on a `retainRowFor` call with the wrong arguments; red on an indirection through a local variable; red on a sixth retain even in the admitted shape; and red rather than silent when the walk finds nothing.
- **AC-14.** No new advisory-lock acquisition anywhere in the diff.
- **AC-15.** THE RENAME RESTORE, §3.7 row 6. A rename-baseline `undo_override` whose suppressed replacement is TRULY ADDED and present in the parse: the retained row carries the REPLACEMENT ROW's non-identity, not the old-name live row's and not the snapshot's, while its identity stays the held one. Three sources must be distinguishable in the fixture, so the replacement, the old-name live row and `held_value` each carry a different value for every asserted field. The case also covers the release path it depends on: it asserts the hold SURVIVED this sync, because if it released there is no retain and the assertion proves nothing.
- **AC-16.** §3.7 row 7, the guard on AC-15. The same shape with the replacement being a PRE-EXISTING LIVE OWNER: the held member keeps its own live non-identity, the owner keeps its own row untouched, and neither takes the other's — the WM-F4 guarantee, now extended to the override. A repair that sets the override unconditionally fails here.

## 8. Documented limits

- **L1 — no live row for this member, no repair.** When `previousCrewMembers` is absent or carries no row for `entity_key`, the held snapshot is retained. Not a silent wrong answer: it is the pre-arc behaviour at four of the five sites, reached only when there is no better source, and at the fifth it is an improvement on retaining nothing (§3.6). Executable at AC-10.
- **L2 — the snapshot is pre-apply, per sync.** `previousCrewMembers` is read once when the show row is updated (`lib/sync/runScheduledCronSync.ts:1653`). An edit landing between that read and the upsert is not visible. The per-show advisory lock serializes syncs, so this window sits inside one locked transaction; concurrent editors are fenced out of scope per §1.1.
- **L3 — identity does not follow the live row.** By design, §3.2. An operator who changes the email of a member with an open hold still sees the held email until the hold resolves. That is the hold's whole job.
- **L4a — the rename restore adopts the replacement's non-identity, never its identity.** §3.8. A member whose rename was undone keeps the old name and email and takes the sheet's current phone, role, flags, restrictions and flight info from the row the sheet now lists them under. That is deliberate: the undo rejected the RENAME, not the person's details. AC-15.
- **L4 — a resurrection restores the snapshot, because there is nothing else.** When the undo path's re-inserted row is gone by the time a later sync runs, the retain rebuilds it from `held_value`, which may lag the row's last live state. This is L1 seen from the restore branch rather than a separate limit, and it is the only remaining case where a snapshot beats a live record — because there is no live record. Earlier drafts stated a wider version of this limit involving a member edited in the sheet and then dropped again; that sequence is unreachable for a removal baseline, because `undoOverrideReleased` returns `parseByName.has(hold.entity_key)` for a removal baseline and releases the hold before any retain runs (`holdAwareApply.ts:93-95`). Recorded so the unreachable version is not restored.
