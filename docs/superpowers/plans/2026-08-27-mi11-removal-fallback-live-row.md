# Plan — every hold-aware retain prefers the crew member's own live row

Spec: `docs/superpowers/specs/sync/2026-08-27-mi11-removal-fallback-live-row.md` (canonical). Branch `fix/mi11-removal-fallback-live-row`. Closes `BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE`.

**The invariant-8 closeout marker lives in the stem-named sibling closeout file**, this plan's own stem with a closeout suffix, alongside it in `docs/superpowers/plans/`, written by Task 6 when the gate actually runs. AGENTS.md invariant 8 permits a flat plan either form; the sibling is the honest one here, because the marker's grammar has no placeholder (`tests/docs/_invariant8Closeout.ts:44-48`) and a plan authored before the run cannot state a true `p0=`/`p1=` count. Putting a false one in to keep a gate green is the thing that gate exists to prevent.

## 0. What makes this correct, in one paragraph

Not a case analysis. A held `entity_key`'s live `crew_members` row is written by exactly two things: this sync's own upsert for that key — which is whatever the plan put there, the sheet row with the identity pin (`lib/sync/holds/holdAwareApply.ts:395`) or the retain — and operator edits. A rejected rename's replacement cannot be the writer: it is suppressed by name AND canonical email (`lib/sync/holds/holdAwareApply.ts:495-501`) so it never enters `plan.crewMembers`, and the upsert keys on `(show_id, name)` so it could not land on `entity_key` regardless. Meanwhile `held_value` is a copy of a PRIOR live row — `writeMi11Holds` reads it from `liveCrewByName` (`lib/sync/holds/writeMi11Holds.ts:50-51`), which `lib/sync/phase2.ts:122` states is the pre-apply snapshot. Therefore the live row is never older than the snapshot, in any hold kind, any baseline, any sheet state, and **live-wins is correct unconditionally**. Spec §3.7. Every task below implements that one rule; §6.4's matrix is how it is proven rather than asserted.

## 1. Plan-wide invariants that bear on this diff

- **Invariant 1, TDD per task.** Every task is red-then-green on the SAME command, red observed and pasted into the commit. §7 labels the REGRESSION PINS that are green on arrival by construction and names the planted mutant that makes each one red instead.
- **Invariant 2, advisory locks.** §4. No acquisition is added, moved or removed.
- **Invariant 6, commit per task.** `fix(sync):`, `test(sync):`, `docs(help):`.
- **Invariant 7, spec is canonical.** No amendment. The one post-cap narrowing (§3.8 dropped) was an orchestrator ruling recorded IN the spec, not a plan override.
- **Invariant 8, UI quality gate.** IN SCOPE — spec §6 repairs two help MDX pages under `app/`. Task 6 runs the pair and fills the marker line above.
- **Invariant 9, Supabase call boundaries.** N/A. No Supabase client call is added; `planHoldAwareApply` takes a `HoldPort` and touches no client.
- **Invariant 10, mutation-surface observability.** N/A. No mutating route handler, no `"use server"` action.
- **Invariant 12, ledger.** Marked in progress at Stage 0; archived and unmarked in the PR's last commit.

## 1.1 Do not relitigate

- **The uniform rule and the writer-set argument** (§0, spec §3.7). Ruled at the four-round spec cap after rounds 1 through 4 each refuted a successive claim about WHEN the retain is consulted. Filing: `docs/review-rounds/fix/mi11-removal-fallback-live-row/4cb585b3508a.md`.
- **Spec §3.8 is DROPPED by ruling.** It preferred a suppressed replacement's sheet fields at the rename restore. The writer-set argument makes live-wins already correct there, and spec round 4 found a mixed-liveness defect in the mechanism itself. The resulting limit is spec L4a, recorded in both directions. **Do not propose it back**, and do not propose AC-15 or AC-16, which went with it.
- **No origin discriminator** between an Undo-produced and a Reject-produced `undo_override`. Spec §3.5: live-row presence already discriminates, and a marker would mean a migration and two SECURITY DEFINER RPC edits for a distinction with no observable consequence.
- **AC-7 and AC-8 are DEFENSIVE, not reachable-path claims.** Spec round 3 showed the null-held / non-null-live pair is unreachable under the threat fence. They ship as cheap insurance and the spec says so; a finding that they are unreachable is already recorded.
- **A new AXIS is admissible only with a retain SITE it reaches that the partition lacks.** The writer-set argument (spec §3.7) is why no further axis matters on its own: whatever `domain`, `absent` flag, `add` baseline or email-equality input a reviewer names, the live row is still written only by the retain and by operator edits, so live is still never older than the snapshot and the rule still holds at every site. Plan rounds 1 and 2 each named a missing axis and each widening was a bigger target than the last; §6.4 replaced the cross product with the site-derived set on the orchestrator's ruling. An axis finding that names no uncovered SITE is a documented limit, not a round.
- **The `lib/sync/holds/holdAwareApply.ts:259` correction, recorded so it is not re-derived in the other direction.** `lib/sync/holds/holdAwareApply.ts:259` gates the mi11 retain block on `!sheetForEntity`, so for an `mi11_pending` hold whose `entity_key` the parse contains, **no retain is created at all**. It is NOT set-then-discarded. That gate is mi11-only: the `crew_email` branch in `applyUndoOverrideToMaps` has no equivalent, so there the retain IS set and the build loop's `seen` check discards it (`lib/sync/holds/holdAwareApply.ts:404`), which is what spec §3.7 row 4a says and it is correct.
- **No new ledger row**, any facing, any exception clause. Per the 2026-08-27 arc-batch directive. Unrepaired peers go in the PR body.

## 2. Pre-draft code-verification pass, run 2026-08-27

```
$ grep -rn "retainRows.set" lib
lib/sync/holds/holdAwareApply.ts:300, :321, :337, :466, :477      (five sites)

$ grep -rn "rowFromHeldValue" lib
lib/sync/holds/holdAwareApply.ts:43 (def), :150 (comment), :300, :321, :337, :461 (comment), :477

$ grep -c 'sourcePath: "lib/sync' tests/mutation/source/registry.ts
0

$ grep -rn "prior details" app/ lib/
app/help/admin/per-show-panel/page.mdx:20
app/help/admin/review-queues/page.mdx:59
```

No `lib/sync/**` row in the source-mutation registry, so **no enrolled surface is touched** and no score is claimed. The help sweep finds exactly the two sites spec §6 names.

**`CrewMemberRow` in full** (`lib/parser/types.ts:186-195`), because AC-1 and AC-6 assert every non-identity field and a hand-written list that drifts from the type is the failure mode:

| Field | Type | Class | Empty shape AC-6 exercises |
| --- | --- | --- | --- |
| `name` | `string` | identity | — |
| `email` | `string \| null` | identity | — |
| `phone` | `string \| null` | non-identity | `null` |
| `role` | `string` | non-identity | `""` |
| `role_flags` | `RoleFlag[]` | non-identity | `[]` |
| `date_restriction` | `DateRestriction` (`lib/parser/types.ts:129-132`) | non-identity | `{ kind: "none" }` and `{ kind: "explicit", days: [] }` |
| `stage_restriction` | `StageRestriction` (`lib/parser/types.ts:133-135`) | non-identity | `{ kind: "none" }` |
| `flight_info` | `string \| null` | non-identity | `null` |

Six non-identity fields, seven empty shapes. The upsert writes exactly these columns with `name` as the conflict key (`lib/sync/runScheduledCronSync.ts:1705-1719`), so the type's non-identity set and the upsert's write set agree and there is no column a retain can move that the assertions do not see.

Symbols the tasks name, each confirmed present with the claimed shape:

| Symbol | Anchor | Shape confirmed |
| --- | --- | --- |
| planner args | `lib/sync/holds/holdAwareApply.ts:156` | `previousCrewMembers?: CrewMemberRow[]` |
| the per-hold rebuild this plan hoists | `lib/sync/holds/holdAwareApply.ts:239` | `previousByName: new Map(...)` |
| the identity pin, mi11 | `lib/sync/holds/holdAwareApply.ts:246-249` | `pinnedIdentity.set(hold.entity_key, { name, email })` |
| the identity pin, `crew_email` reject | `lib/sync/holds/holdAwareApply.ts:449-452` | same shape |
| the retained-row build loop | `lib/sync/holds/holdAwareApply.ts:403-410` | `base = override ? { ...override, name, email: pin?.email ?? row.email } : row` |
| `seen` blocks a retain for a parse-present name | `lib/sync/holds/holdAwareApply.ts:404` | `if (seen.has(name)) continue` |
| release, removal baseline | `lib/sync/holds/holdAwareApply.ts:93-95` | `return parseByName.has(hold.entity_key)` |
| release, rename baseline | `lib/sync/holds/holdAwareApply.ts:107-110` | matches `suppressed_added.email` under ANY parse name |
| the suppression guard | `lib/sync/holds/holdAwareApply.ts:495-501` | `if (!maps.previousCrewNames.has(sa.name))`, name AND canonical email |
| `held_value` is a prior live row | `lib/sync/holds/writeMi11Holds.ts:50-51` | `const live = args.liveCrewByName.get(item.crew_name)` |
| `liveCrewByName` is the pre-apply snapshot | `lib/sync/phase2.ts:122` | stated in the comment |
| reject leaves `crew_members` alone | `supabase/migrations/20260608000002_mi11_gate_rpcs.sql:83-98` | `update public.sync_holds` only |
| undo re-inserts the crew row | `supabase/migrations/20260804000000_undo_change_selections_reset_at.sql:198` | `insert into public.crew_members (id, show_id, ...)` |
| the probe's oracle | `tests/sync/capabilityLossReachability.probe.test.ts:155-156` | `LIVE_PHONE = "555-NEW"`, `HELD_PHONE = "555-OLD"` |
| the probe's `delete` baseline | `tests/sync/capabilityLossReachability.probe.test.ts:316` | `heldRow(name, email, { baseline: { kind: "delete" } })` |
| the WM-F6 fixture that cannot discriminate | `tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts:194` | `liveCrewByName: new Map([["Alice", aliceLive]])` |
| the direct-snapshot entry point | `tests/sync/_holdAwareTestkit.ts:265` | `snapshot(showId, previous)` |
| the reject RPC driven from a test | `tests/db/mi11_reject_hold.test.ts:110` | "removal → undo_override crew_identity … row still present" |
| the help-copy walker precedent | `tests/help/sheetChangesCopy.test.ts:16-20` | `readdirSync("app/help", { recursive: true })` |
| the premise helpers | `tests/_shared/premise.ts:26`, `tests/_shared/premise.ts:37` | `premise`, `premiseHolds` |

## 3. Meta-test inventory

**CREATES two.**

- a new `_metaHoldRetainSource` suite under `tests/sync/` — spec §5's syntactic guard over `retainRows.set` in `lib/sync/holds/**`. Task 5.
- a new `holdCopyIdentityOnly` suite under `tests/help/` — a walker over every help `.mdx` forbidding the whole-row-freeze promise, modelled on `tests/help/sheetChangesCopy.test.ts`, which is the same shape and the same failure mode (a third page carrying stale copy that a file list would miss). Task 6.

**EXTENDS none.** Checked against every candidate registry `docs/agents/writing-plans.md` names: Supabase call boundaries (`tests/auth/_metaInfraContract.test.ts`) N/A, no client call; advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) N/A, §4; admin-alert catalog, sentinel hiding, inline email normalization — none of those surfaces is in the diff.

## 4. Advisory-lock holder topology

The plan touches no `pg_advisory*` call. Enumerated for the one hashkey in reach, `show:<drive_file_id>`:

| Layer | Holder | This diff |
| --- | --- | --- |
| JS-side wrapper | `lib/sync/lockedShowTx.ts:59-61` — `pg_try_advisory_xact_lock` on the cron path, `pg_advisory_xact_lock` on the blocking path | unchanged |
| in-RPC | the mi11 gate and undo RPCs resolve their own `drive_file_id` and lock inside the RPC (`lib/sync/holds/mi11GateActions.ts:121`, `lib/sync/holds/undoChange.ts:7-10`) | unchanged. Task 3 CALLS `mi11_reject_hold`, which takes the lock in-RPC; the test holds none of its own, so the single-holder rule is preserved |
| `lib/sync/holds/holdAwareApply.ts` | **none — it acquires nothing**, running inside the transaction its caller already locked | unchanged |

`grep -rn "advisory" lib/sync/holds/` returns only comments naming the caller's lock. AC-14 is the closeout check.

## 5. The change

```ts
// hoisted above the survivingHolds loop, replacing the per-hold rebuild at :239
const previousByName = new Map((args.previousCrewMembers ?? []).map((m) => [m.name, m]));

/** The row to retain for a held member: the member's OWN live non-identity, the held identity. */
function retainRowFor(entityKey: string, heldValue: Record<string, unknown>): CrewMemberRow {
  const snapshot = rowFromHeldValue(heldValue);
  const live = previousByName.get(entityKey);
  return live ? { ...live, name: snapshot.name, email: snapshot.email } : snapshot;
}
```

A spread, never a field-by-field pick and never a falsey coalesce, so a live `null` phone, `""` role, `[]` role_flags or `{ kind: "none" }` restriction is retained as it stands.

**All five `retainRows.set` sites call `retainRowFor(hold.entity_key, held)`** — `lib/sync/holds/holdAwareApply.ts:300`, `lib/sync/holds/holdAwareApply.ts:321`, `lib/sync/holds/holdAwareApply.ts:337` inside `planHoldAwareApply`, and `lib/sync/holds/holdAwareApply.ts:466`, `lib/sync/holds/holdAwareApply.ts:477` inside `applyUndoOverrideToMaps`, which takes the helper as a parameter alongside the hoisted `previousByName` it stops rebuilding. Two of the five are more than a source swap:

- `lib/sync/holds/holdAwareApply.ts:466` becomes UNCONDITIONAL. It is `if (live) maps.retainRows.set(...)` today, so a member with no live row gets `protectedNames` and no row — the shape behind arc C's original false capability-loss report. Through the helper it retains the snapshot instead. Spec §3.6, AC-9.
- `lib/sync/holds/holdAwareApply.ts:477` changes behaviour on the Reject path and is a no-op on the Undo path. Spec §3.5, AC-5.

## 6. Mutation families and the deciding matrix

### 6.1 Behavioural mutants

**One helper, so one place to attack.** Plan round 2 added a per-site plant — one mutant per `retainRows.set`, each required to redden exactly one case — and plan round 3 showed the plan's own text predicting every one of them reddening several. It also showed the cross-file coverage registry those plants served could not run at all: Vitest isolates test files (the root `vitest.config.ts` project definitions), so a case in one file cannot register itself with a collector in another, and Task 3 imported a scanner Task 5 had not yet written.

Both are deleted rather than repaired, because they were apparatus for a claim the arc does not need. After this change all five retains call the SAME function. A case that exercises `retainRowFor` exercises the logic of every site, and §6.2's guard is what pins that they all call it — derived from the source, not declared. A per-site mapping would prove which case happens to route through which line, which is a fact about the fixtures rather than about the change. The two things that need proving are: every retain goes through the helper (guard, §6.2), and the helper is right (below).

| # | Mutant | Killed by |
| --- | --- | --- |
| B1 | `return snapshot` unconditionally (full reversion) | AC-1, AC-2, AC-3, AC-5, AC-9 — every case whose live row differs from its snapshot |
| B2 | `{ ...snapshot, phone: live.phone }` — a field-SUBSET merge | AC-1's other five field assertions, which name the field missed |
| B3 | `live.phone ?? snapshot.phone` or `\|\|` — a falsey coalesce | AC-6, on whichever of the seven empty shapes it mishandles |
| B4 | `return live ?? snapshot` — no identity re-imposition | AC-7 and AC-8 |
| B5 | `return previousByName.get(entityKey)!` — assumes a live row exists | AC-10 |

B2 through B5 are exactly the four partial implementations spec round 1 found; every one passes the pre-round-1 acceptance set. Each is planted, observed, reverted, and pasted with the list of cases it reddened.

**Every plant's contract is AT LEAST ONE case, and the count is reported rather than constrained.** Round 2's version required each per-site plant to redden exactly one, and round 3 showed the plan's own text predicting every one of them reddening several — a contract refuted by the document that declared it. The reddened list is still pasted in full, because it is worth reading; it is not asserted against a number.

**Three site plants**, because three sites change more than their argument and the helper cannot carry that:

| # | Mutant | Must redden at least |
| --- | --- | --- |
| R299 | delete `nonIdentityOverride.set` at `lib/sync/holds/holdAwareApply.ts:299` | the rename-fold suite. Site `lib/sync/holds/holdAwareApply.ts:300`'s own reversion is a declared no-op because the override wins there, so this is the plant that carries that site — and round 3 caught the earlier draft asserting exactly that and then having no task run it. Task 5 runs it. |
| R466 | restore the guarded `if (live)` form at `lib/sync/holds/holdAwareApply.ts:466` | Task 4's case (n) |
| R477 | restore `rowFromHeldValue(held)` at `lib/sync/holds/holdAwareApply.ts:477` | Task 3's Reject case |

### 6.2 Structural mutants — the class guard, Task 5

| # | Mutant | Expected |
| --- | --- | --- |
| S1 | any `retainRows.set` reverted to `rowFromHeldValue(held)` | RED |
| S2 | a SIXTH `retainRows.set` added, in the admitted shape | RED, by the exact-count pin — the tripwire that makes someone come back to the spec |
| S4 | a lookalike callee, `retainRowFor2(hold.entity_key, held)` | RED |
| S5 | `retainRowFor(hold.id, held)` — right callee, wrong argument | RED, by the argument pin |
| S6 | `const row = retainRowFor(...); retainRows.set(k, row)` — indirection through a local | RED, a bare identifier is not admitted |
| S7 | `retainRowFor(` present only in a comment on a line whose call is still `rowFromHeldValue(` | RED — the AST does not see comments as calls |
| S8 | the scanned file emptied or its call sites all deleted | RED via the premise, never a silent pass |
| S9 | `retainRowFor`'s BODY rewritten to return the snapshot (B1) | **GREEN — ACCEPTED GAP**, declared in spec §5. A syntactic guard cannot see a body change. The deciding suite is §6.1 and §6.4. |

S8 is the string-presence rule's (a); S4 is (b); S7 is (c); S1/S2/S5/S6 are (d).

**S3 is WITHDRAWN from the closure set, not left unkilled.** It proposed moving a retain into a third function. Round 2 killed the name-only multiset with a same-named function in another module; round 3 killed the file-qualified one with a same-named nested function expression wrapping the retain on its own line, which keeps the path, the line, the name, the count, the callee and both arguments. Each repair drew the next mutant, which is the signal to stop. And the mutant is behaviour-preserving by the reviewer's own account: the call still runs, with the same arguments, at the same point. A guard that cannot see it is not missing anything a reader would care about, and a fourth iteration chasing it would be recognizer growth on a surface with no defect behind it. Recorded as a documented limit of the guard: **it pins WHAT each retain is given and HOW MANY there are, not the lexical scope the call sits in.**

### 6.3 Copy-walker mutants — Task 6

| # | Mutant | Expected |
| --- | --- | --- |
| C1 | the forbidden phrase restored on either page | RED |
| C2 | the phrase restored on a THIRD help page the guard never named | RED — the walker fails-by-default on new pages |
| C3 | the phrase present with markdown bold splitting it | RED — normalized before matching |
| C4 | the replacement copy present but the forbidden phrase ALSO present | RED — the two assertions are independent |
| C5 | the identity wording present ONLY inside an MDX or JSX comment | RED — comments are stripped before the positive match |
| C6 | the identity wording's opening clause present, followed by a contradictory continuation | RED — the assertion spans the complete sentence, not a prefix |

### 6.4 What actually proves the rule

**Two things, and no third.**

1. **Every retain goes through the helper** — Task 5's guard, which walks and parses `lib/sync/holds/**` and asserts every `retainRows.set` passes `retainRowFor(hold.entity_key, held)`, with the site count pinned at five. The site set is DERIVED from the source, so a new retain fails without anyone remembering this document.
2. **The helper is right** — §6.1's mutants against the behavioural cases in Tasks 1 through 4.

Together those give the rule at every site, because after this change the sites do not differ: they all call the same function with the same arguments. That is the writer-set argument (spec §3.7) doing its work — one rule, one helper, no per-site reasoning.

**What this deliberately does NOT build**, recorded because two rounds went into it: a coverage registry mapping cases to sites, and a per-site plant proving that mapping. Plan round 3 showed the registry could not run (Vitest isolates test files, the root `vitest.config.ts` project definitions) and that the plan's own text predicted every per-site plant reddening several cases at once. They were apparatus for a claim the two proofs above already carry. A finding that the arc lacks per-site behavioural attribution is a documented limit, not a defect: the sites are provably identical in what they call.

**The behavioural cases, by what they exercise** — a reader's map, not an asserted cover:

| What | Where |
| --- | --- |
| every non-identity field follows live; all seven empty shapes; the two defensive identity pins; the three no-live-row pins | Task 1 |
| the WM-F6 live-owner path, the owner untouched, the collision still recorded | Task 2 |
| the Reject path through the real `mi11_reject_hold`, plus three release regression pins and the tombstone no-retain assertion | Task 3 |
| the `crew_email` identity re-imposition and the no-retain degrade closure | Task 4 |

**Three RELEASE regression pins**, kept because the retain cases depend on the hold surviving and a release regression should show up as itself: `mi11Reconciled` releasing on a reconciled name-and-email (`lib/sync/holds/holdAwareApply.ts:121-129`); the removal baseline releasing on reappearance (`lib/sync/holds/holdAwareApply.ts:93-95`); and the rename baseline releasing through its first arm, `parseByName.has(hold.entity_key)` (`lib/sync/holds/holdAwareApply.ts:103`).

**One no-retain assertion.** The `crew_identity` tombstone (`held_value.absent === true`) suppresses and returns without a retain (`lib/sync/holds/holdAwareApply.ts:469-472`); the live-owner suite's positive control already exercises the `add`-baseline form (`tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts:303`). Task 3 asserts the absence: a retain appearing there would be a new site, which the guard's count catches first.

## 7. Task list

<!-- tasks: depth=2 red-contract -->

## Task 1 — the helper, the genuine-removal retain, and the guard conditions

<!-- task: red=`pnpm vitest run tests/sync/holdRetainLiveRow.test.ts tests/sync/capabilityLossReachability.probe.test.ts` red-state=authored red-target=`lib/sync/holds/holdAwareApply.ts:337` why=`the genuine-removal fallback retains rowFromHeldValue(held), so the upsert writes the hold's lagging snapshot over every live non-identity field and both the new full-field case and the re-pinned probe row read the snapshot's values` ac=AC-1,AC-2,AC-6,AC-7,AC-10,AC-11 -->

**What is red and why.** Several new assertions fail on the unmodified planner, all for one production reason — `lib/sync/holds/holdAwareApply.ts:337` retains the snapshot: the full-field case reads the snapshot's `role`, `role_flags`, `date_restriction`, `stage_restriction` and `flight_info` where the live row's are expected; each empty-shape case reads the snapshot's non-empty value where the live empty one is expected; and `tests/sync/capabilityLossReachability.probe.test.ts:281`, re-pinned to `LIVE_PHONE`, reads `555-OLD`. No expected value is test-local — each is read from the seeded live row that `seedCrew` writes and the production path must carry.

**Two case groups are REGRESSION PINS, not TDD reds, and are labelled so in the file.** AC-7 (null `held.email`) and AC-10 (absent prior snapshot) describe behaviour already correct today, which the repair must not break; they are green on arrival because today's unconditional snapshot retain gives the right answer for the wrong reason. Neither is paired with a production red; each is paired with the planted mutant that kills it (B4, B5).

RED:

1. New suite `holdRetainLiveRow` under `tests/sync/`, driving `applyParseResult(applyTx(tx), { ..., snapshot: snapshot(showId, [...]) })` — the shape `tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts` uses, chosen because it puts `previousCrewMembers` under the case's direct control, which `runPhase2` does not.
   - **(a) full non-identity.** A held member whose live row differs from `held_value` on ALL SIX non-identity fields; the sheet drops them. Assert each of the six individually against the LIVE value, so a subset merge names the field it missed. Derive every expected value from the seeded row.
   - **(b)-(h) every empty shape.** `null` phone, `null` flight_info, `""` role, `[]` role_flags, `{ kind: "none" }` stage_restriction, and both `{ kind: "none" }` and `{ kind: "explicit", days: [] }` date_restriction — each against a non-empty snapshot value for the same field. **The field list is pinned to the TYPE at compile time, in both directions**, because a runtime tuple cannot enumerate the keys of an erased type and "every tuple entry has a case" would never notice a new one. The suite declares `const NON_IDENTITY = [...] as const` and two type-level equalities against `Exclude<keyof CrewMemberRow, "name" | "email">` — one asserting every type key is in the tuple, one asserting every tuple entry is a type key — each written as a `const` whose annotation resolves to `never` when the equality fails. Adding a field to `CrewMemberRow` then breaks `pnpm typecheck`, and removing one breaks it too. The case generator iterates `NON_IDENTITY`, so a field that reaches the tuple reaches a case. Vitest strips types, which is exactly why the check is a typecheck failure and the plan runs `pnpm typecheck` as its own command.
   - **(i) REGRESSION PIN — null held email.** `held_value.email` null, live email non-null, assert the retained email is `null`. Green on arrival; red under B4. Labelled DEFENSIVE per spec AC-7.
   - **(j), (k), (l) REGRESSION PINS — no live row.** `previousCrewMembers` absent from the snapshot object; present but `[]`; present and non-empty but carrying no row for `entity_key`. Each asserts the snapshot is retained and nothing throws. Green on arrival; red under B5. Three cases because they are three distinct paths through `args.previousCrewMembers ?? []` and `previousByName.get`.
   - Each case states its premise on its OWN inputs: `premiseHolds` that the live and held values it discriminates on actually differ, for (a) on every one of the six fields.
2. `tests/sync/capabilityLossReachability.probe.test.ts:281` → `phoneAfter: LIVE_PHONE`, and rewrite the comment above it, which says the revert is "not this arc's fix" and cites the row this branch closes.
3. Observe red. Paste every failure line into the commit.

GREEN:

4. Hoist `previousByName` above the `survivingHolds` loop and add `retainRowFor` (§5).
5. `lib/sync/holds/holdAwareApply.ts:337` → `retainRowFor(hold.entity_key, held)`.
6. Pass the hoisted map and the helper into `applyUndoOverrideToMaps` in place of the per-hold rebuild at `lib/sync/holds/holdAwareApply.ts:239`.
7. Re-run both files. Green.

VERIFY:

8. Plant B1 through B5, one at a time, reverting each. Paste each result with the list of cases it reddened. AC-11. B4 and B5 are what make cases (i) and (j)-(l) worth their lines.
9. `pnpm typecheck`.

## Task 2 — the WM-F6 live-owner retain, its comments, and the test that could not see it

<!-- task: red=`pnpm vitest run tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts tests/sync/capabilityLossReachability.probe.test.ts` red-state=authored red-target=`lib/sync/holds/holdAwareApply.ts:321` why=`the WM-F6 branch retains rowFromHeldValue(held) when the fold target is a pre-existing live owner, so both the diverged Alice fixture and the new probe case read the held snapshot's non-identity instead of the live row's` ac=AC-3,AC-4 -->

**What is red and why.** Two failures, one production line. `tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts:194` builds `held_value` from `aliceLive`, so held and live are equal by construction and that case's `alice.role` / `alice.phone` assertions pass under either implementation — a fixture that cannot reach the boundary it names. Diverging Alice's live row makes it read the snapshot's values against live expectations. The new probe case fails the same way. Both come from `lib/sync/holds/holdAwareApply.ts:321`.

RED:

1. In the live-owner test, diverge Alice's PRIOR-CREW SNAPSHOT, not her database row. `writeMi11Holds` captures `held_value` from `aliceLive` via `liveCrewByName`, and `applyParseResult` reads `previousCrewMembers` from the `snapshot(...)` argument (`lib/sync/applyParseResult.ts:168-173`), never from the database — so a DB `update` is invisible to the planner and the diverged expectations would stay red forever. Build a second row, `aliceLiveNow`, differing from `aliceLive` on role and phone, seed the DB with it too so the two agree, and pass `prevMember(aliceRow, aliceLiveNow)` to `snapshot(...)`. Move assertions (b) to `aliceLiveNow`'s values. Add `premiseHolds` that `aliceLiveNow` and the captured `held_value` differ on both asserted fields, on that case's own inputs. Bob's assertions (a) and the collision assertion (d) are unchanged — they are what WM-F6 protects.
2. Rewrite the two source comments saying the held crew keeps "held non-identity" (`lib/sync/holds/holdAwareApply.ts:283`, `lib/sync/holds/holdAwareApply.ts:313`) to say what WM-F6 actually protects: the held crew keeps ITS OWN non-identity, never the live owner's. A comment describing the behaviour this task removes is a defect, not a nit.
3. Add `OWNER_PHONE = "555-OWN"` to the probe suite, distinct from `LIVE_PHONE` and `HELD_PHONE`. Two phones cannot discriminate: with the testkit default (`tests/sync/_holdAwareTestkit.ts:35`, `"555-OLD"`) the owner carries the snapshot's phone and a bleed ONTO the held crew reads as a pass.
4. Give `observe` an optional second-member shape, defaulted to today's `crew("Stays", { email: "stays@x" })` so the four existing cases are byte-identical in behaviour.
5. Add the matrix's `mi11_pending` x none x replacement cell: hold on `Held`, `held_value.email = held@old`, `proposed_value = { name: "Held", email: "held@new" }`; second member `Owner` seeded live AND listed in the parse, email `held@new`, phone `OWNER_PHONE` on both sides. Assert the whole observation object as every sibling case does, with `phoneAfter: LIVE_PHONE`.
6. Assert the owner is untouched — read `Owner` back and assert `OWNER_PHONE`. Discriminating both ways.
7. Assert the reservation collision still names `Owner` (`lib/sync/holds/holdAwareApply.ts:568-569`); a repair that neutered the fold's collision path would otherwise pass everything above.
8. Premises on the case's own inputs: that `Owner`'s parse email canonicalizes equal to the hold's proposed email (so the case reaches the fold-target branch and not the genuine-removal path), and that the three phones are pairwise distinct.
9. Observe red. Paste it.

GREEN:

10. `lib/sync/holds/holdAwareApply.ts:321` → `retainRowFor(hold.entity_key, held)`.
11. Re-run both files. Green.

VERIFY:

12. Plant B1, observe the WM-F6 case and the diverged live-owner assertions red, revert. Paste the reddened list. AC-11.
13. `pnpm typecheck`.

## Task 3 — the restore branch, the Reject path it actually serves, and the rest of the matrix

<!-- task: red=`pnpm vitest run tests/sync/holdRetainRejectPath.test.ts tests/sync/capabilityLossReachability.probe.test.ts` red-state=authored red-target=`lib/sync/holds/holdAwareApply.ts:477` why=`the crew_identity restore retain passes rowFromHeldValue(held), so after an admin rejects a removal the next sync writes the lagging mi11 snapshot over a live row mi11_reject_hold deliberately left untouched` ac=AC-5 -->

**What is red and why.** `mi11_reject_hold` converts a rejected removal into `kind='undo_override'`, `domain='crew_identity'` and never touches `crew_members` (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:89-98`; `tests/db/mi11_reject_hold.test.ts:110` already pins "row still present"). So the live row is current and `held_value` is the lagging mi11 snapshot. The Reject cell drives the real RPC, then syncs with the member absent, and reads the snapshot's non-identity where the live row's is expected. `lib/sync/holds/holdAwareApply.ts:477` is the line.

RED:

1. New suite `holdRetainRejectPath` under `tests/sync/`. It carries the Reject case, the three release pins and the tombstone assertion — and nothing else. It imports no scanner and registers with no collector: plan round 3 showed that cross-file registration cannot run, because Vitest isolates test files (the root `vitest.config.ts` project definitions), and that the version of this step which imported Task 5's scanner could not turn green at all, since Task 5 had not written it yet.
2. The Reject case drives the real reject: seed a live member; write an mi11 hold with `disposition: 'removal'`; build the prior-crew snapshot from a row that diverges from the captured `held_value` (and seed the DB to match), because the planner reads `previousCrewMembers` from `snapshot(...)` and not from the database; call `mi11_reject_hold` through the authed admin path (`set_config('role','authenticated')` plus `request.jwt.claims`, the shape at `tests/sync/applyParseResult.holdAware.liveOwnerNeverDeleted.test.ts:228-240`); **then RESTORE the transaction role before anything else touches `sync_holds`** — `revoke all on table public.sync_holds from anon, authenticated` (`supabase/migrations/20260608000000_sync_holds.sql:46`) means the `authenticated` role cannot read the table, so the hold assertion and `applyParseResult` would both fail on a permission error before ever reaching line 477, and the case would report a red that has nothing to do with the defect. Reset the role and clear `request.jwt.claims` with `set_config(..., true)` immediately after the RPC returns. Only then assert the hold converted AND the crew row is still present, run `applyParseResult` with the member absent, and assert every non-identity field is the live one.
3. The three RELEASE pins §6.4 names, each asserting its own arm fires: `mi11Reconciled` on a reconciled name-and-email, the removal baseline on reappearance, and the rename baseline's `parseByName.has(hold.entity_key)` arm. Each states its premise on its own inputs — that the hold was in the state the pin names before the sync, and that it is gone after.
4. The tombstone no-retain assertion §6.4 names.
5. Premises per case on its OWN inputs: that the hold is in the state the case names (kind, domain, baseline, survived-or-released) and that live and `held_value` differ on the asserted fields. A case that silently tested another branch is the failure mode this catches.
6. In the probe suite, move the `undo_override/crew_identity(restore)` row to `phoneAfter: LIVE_PHONE` and rewrite its comment, which calls the snapshot retain intended by design — spec §3.5 refuted that. The new comment names §3.7's writer-set argument. The tombstone row is untouched.
7. Observe red. Paste it.

GREEN:

8. `lib/sync/holds/holdAwareApply.ts:477` → `retainRowFor(hold.entity_key, held)`.
9. Re-run. Green.

VERIFY:

10. Plant R477, observe the Reject case and the probe's restore row red, revert. Paste the reddened list. It reddens both, and §6.1 says so rather than claiming one.
11. The Undo cell drives `undo_change`, syncs with the member absent, and asserts the restored values survive. **It is a DOCUMENTATION CASE, not a regression pin, and NO declared mutant kills it** — `undo_change` re-inserts the crew row FROM `before_image` and `held_value` IS that `before_image`, so live and the snapshot are equal by construction on this path and B6 (which restores the snapshot preference) leaves it green. Recorded as such rather than paired with a mutant that does not kill it, per the RED-validity rule. What it would catch is a future change that makes the retain prefer something that is NEITHER the live row nor the snapshot on this path; that is worth a line, and claiming more for it would not be.
12. `pnpm typecheck`.

## Task 4 — the `crew_email` branch: the identity it never re-imposed, and the degrade it never closed

<!-- task: red=`pnpm vitest run tests/sync/holdRetainLiveRow.test.ts` red-state=authored red-target=`lib/sync/holds/holdAwareApply.ts:466` why=`the crew_email reject branch retains the live row RAW under a pinnedIdentity whose email may be null, so the build loop's pin?.email ?? row.email fallback writes the live email onto a row the hold pins to none; and the retain is guarded on live, so a member with no live row gets protectedNames and no row at all` ac=AC-8,AC-9 -->

**What is red and why.** Two independent defects on one line, both on the unmodified tree. **The identity leak:** `holdAwareApply.ts:449-452` pins `{ name, email: held.email ?? null }` and `lib/sync/holds/holdAwareApply.ts:466` retains `live` unmodified, so with a null `held_value.email` the build loop's `pin?.email ?? row.email` (`lib/sync/holds/holdAwareApply.ts:407`) falls through to the live email. **The no-retain degrade:** `if (live)` means no live row produces no retain, the exact shape that made arc C's capability-loss notice report a live LEAD as lost.

RED:

1. Two cases in the `holdRetainLiveRow` suite. **(m)** an `undo_override`/`crew_email` hold with `held_value.email` null, a live row carrying an email, member absent: assert the surviving row's email is `null`. Labelled DEFENSIVE per spec AC-8. **(n)** the same branch with NO live row for `entity_key`: assert the member survives the delete AND that the applied crew list contains the name — the latter is the mechanism, since `appliedCrewMembers` is what the retain feeds and what every downstream reader indexes. **Do NOT assert that the capability-loss notice reports no loss here**: arm (c) iterates `previousCrewMembers`, and this case's whole premise is that it holds no row for the member, so the notice cannot name them under ANY implementation and the assertion would be tautological. The arc-C symptom needs a live prior row to be reachable and this configuration deliberately has none; recorded so the missing assertion reads as a decision rather than an oversight.
2. Premises on each case's own inputs: for (m), that `held_value.email` is null AND the live row's is not; for (n), that the prior-crew snapshot carries no row for `entity_key`.
3. Observe red. Paste it.

GREEN:

4. `lib/sync/holds/holdAwareApply.ts:466` → an unconditional `maps.retainRows.set(hold.entity_key, retainRowFor(hold.entity_key, held))`; delete the `if (live)` guard and the now-unused `live` local.
5. Update the `previousCrewMembers` doc comment (`lib/sync/holds/holdAwareApply.ts:145-156`), which states the no-live-row degrade this task closes and cites "spec §4 limit 4" — arc C's spec section, which no longer describes the behaviour.
6. Re-run. Green.

VERIFY:

7. Plant R466, observe case (n) red, revert. Plant B4, observe case (m) red, revert. Paste both reddened lists. AC-11.
8. `pnpm typecheck`.

## Task 5 — the class guard

<!-- task: red=`pnpm vitest run tests/sync/_metaHoldRetainSource.test.ts` red-state=authored red-target=`lib/sync/holds/holdAwareApply.ts:300` why=`the rename-fold retain still passes rowFromHeldValue(held), and it is the last site doing so once Tasks 1 through 4 have moved the other four` ac=AC-13 -->

**What is red and why.** After Tasks 1 through 4, `lib/sync/holds/holdAwareApply.ts:300` is the one `retainRows.set` still passing `rowFromHeldValue(held)`, so the guard is red on exactly that site and green when it moves. A production line, not a fixture.

RED:

1. Write the `_metaHoldRetainSource` suite under `tests/sync/`. It walks `lib/sync/holds/**` from disk — never a hardcoded file list, so a new module there is covered by default — and parses each file with the TypeScript compiler API, the idiom at `tests/cross-cutting/no-vestigial-middleware.test.ts:3`. For every `CallExpression` whose callee text ends in `retainRows.set` it records the second argument's classification and that argument's argument text, plus the enclosing function name FOR THE FAILURE MESSAGE ONLY — nothing asserts on it, per step 2.
2. Assert, per spec §5: every retain's value is a call to `retainRowFor` with arguments `hold.entity_key, held` (callee AND argument text, so S5 and S6 die); and the site COUNT is exactly five (so S2 dies). **It asserts nothing about the enclosing function**, and §6.2 records why: two rounds of trying to pin lexical scope each drew the next mutant past the previous repair, and the mutant that survives is behaviour-preserving — the same call, the same arguments, the same line. The guard's documented limit is that it pins what each retain is GIVEN and how many there are, not the scope the call sits in.
3. State the premise unconditionally at describe scope, never inside a `.each` callback: `premise` that the walk found at least one `retainRows.set`. A parser that stopped matching then fails by name.
4. Observe red on `lib/sync/holds/holdAwareApply.ts:300`. Paste it.

GREEN:

5. `lib/sync/holds/holdAwareApply.ts:300` → `retainRowFor(hold.entity_key, held)`. Behaviour-inert: `nonIdentityOverride.set` at `lib/sync/holds/holdAwareApply.ts:299` is unconditional on that branch, so the build loop at `lib/sync/holds/holdAwareApply.ts:407` takes `override` as its base and the retained value is never read.
6. Re-run. Green.

VERIFY:

7. Run S1, S2, S4, S5, S6, S7 and S8 against the shipped guard, one at a time, reverting each. Paste each result. S3 is withdrawn (§6.2) and S9 is the declared accepted gap; neither is expected to go red.
8. Plant R299 from §6.1 — delete `nonIdentityOverride.set` at `lib/sync/holds/holdAwareApply.ts:299` — run the rename-fold suite against it, observe red, revert. Paste it. Site `lib/sync/holds/holdAwareApply.ts:300`'s own reversion changes nothing, so this plant is what carries that site behaviourally, and round 3 caught the earlier draft claiming it without any task running it.
9. `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.

## Task 6 — the help copy

<!-- task: red=`pnpm vitest run tests/help/holdCopyIdentityOnly.test.ts` red-state=authored red-target=`app/help/admin/per-show-panel/page.mdx:20` why=`the page promises the operator that a held member's prior details stay in effect, which is the whole-row freeze this arc removes; the new walker forbids that phrase on every help page and both live pages carry it` ac=AC-12 -->

**What is red and why.** Two shipped pages carry the forbidden phrase today (`app/help/admin/per-show-panel/page.mdx:20`, `app/help/admin/review-queues/page.mdx:59`). The walker names both. The red is in the MDX, not in the test's own fixtures.

RED:

1. Write the `holdCopyIdentityOnly` suite under `tests/help/`, modelled on `tests/help/sheetChangesCopy.test.ts:16-20`: `readdirSync("app/help", { recursive: true })` over every `.mdx`, normalizing away `**` before matching so a bold split cannot dodge it. Assert (i) no help page promises that a held member's prior DETAILS stay in effect, and (ii) both primary pages carry the identity wording. Two independent assertions, so C4 dies.
2. **The positive assertion has two escapes a raw-source scan does not close, and both are covered.** It strips MDX and JSX comments before matching, so wording that survives only in a comment does not satisfy it (C5). And it asserts the COMPLETE sentence through its terminating punctuation rather than a prefix, so a correct opening followed by a contradictory continuation fails (C6). Both are the string-presence rule's (c) and (b) on the positive side, which C1 through C4 only cover on the negative side.
3. Observe red naming both pages. Paste it.

GREEN:

4. Replace the sentence on both pages with the wording spec §6 ratifies: `that person's prior identity stays in effect; their other details keep following the sheet and your edits.` Fit it to each page's surrounding sentence rather than pasting twice verbatim — `review-queues` reads "and that person's ... until you choose", `per-show-panel` reads "Until you decide, that person's ...".
5. Re-run. Green.

VERIFY:

6. Run C1 through C6, reverting each. Paste each.
6. Pre-code mechanical UI checklist on the replacement copy: no em dashes, apostrophe literals, no raw error codes. Prose inside an existing paragraph, so tap targets, type tokens and contrast do not arise. Paste the grep.
7. **Screenshot drift.** Decide from the screenshot manifest tests whether any committed capture frames either paragraph. If one does, regenerate ONLY from the pinned Playwright Docker image with `--platform linux/amd64`, never from this arm64 host. If `pnpm screenshot:help` runs locally for any reason, `git restore public/help/screenshots/` afterwards.
8. **Invariant 8: run BOTH halves of the impeccable pair**, scoped to the two MDX files, each with the canonical v3 setup gates (the context load of PRODUCT.md and DESIGN.md, then the register reference read). P0 and P1 findings fixed, or deferred with a `DEFERRED.md` entry.
9. Write the stem-named sibling closeout file. It names both halves of the pair, records every finding with its disposition, and carries the marker line in the exact §3.3 grammar (`tests/docs/_invariant8Closeout.ts:44-48`): `critique=` and `audit=` each `RAN` or `RAN-DEGRADED`, `p0=` and `p1=` the real counts, `dispositions=recorded` or `none`. Run `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` and confirm green — before this file exists the unit declares nothing and the guard requires nothing, which is why the marker is not in the plan.

<!-- tasks: end -->

## Task 7 — close-out

**Deliberately outside the enrolled task region above, which closes before it.** Its red is real and is stated below, but its production surface is `BACKLOG-archive.md`, a repo-root file, and the `red-target=` grammar cannot express one: a bare filename is rejected as shorthand (`lib/specLint/redContract.ts:164`) and the path-only form is rejected for a tracked file (`lib/specLint/redContract.ts:167-169`), so a root-level markdown file has no legal line-bearing form. Enrolling the task with a `red-target` that pointed somewhere else to satisfy the grammar would be worse than not enrolling it. Recorded here rather than left as a silent gap.

**Red command:** `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts`.

**What is red and why.** Moving the row into `BACKLOG-archive.md` WITHOUT clearing the marker trips the archive rule. That is the observation; clearing it is the green. Lands as the PR's LAST commit, before the merge, so the marker never reaches main.

1. Move `BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE` to `BACKLOG-archive.md` with its outcome, marker still attached. Observe red. Paste it.
2. Remove `**Status:** IN PROGRESS · **Branch:** fix/mi11-removal-fallback-live-row · ` from the archived row's meta line. Re-run. Green.
3. The advisory-lock check (discharged by Task 7): `grep -rn "pg_advisory" lib/sync/holds/` returns no acquisition, and `git diff origin/main...HEAD -- lib | grep -i advisory` is empty. Paste both.
4. Full tree green under `pnpm heavy pnpm test`, then `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, each as its own command.

## 8. Acceptance-criteria coverage

Criteria are declared in the spec's §7; this is the coverage map. AC-12 is the copy walker spec §6 describes; AC-15 and AC-16 were dropped with spec §3.8 and are deliberately absent.

| AC | Owner |
| --- | --- |
| AC-1 every non-identity field follows the live row | Task 1 case (a) |
| AC-2 the probe's mi11 row reads `LIVE_PHONE` | Task 1 step 2 |
| AC-3 WM-F6 path, owner untouched, collision recorded | Task 2 steps 5-7 |
| AC-4 the live-owner test made discriminating | Task 2 step 1 |
| AC-5 the Reject path | Task 3 step 2 |
| AC-6 every empty shape, on a derived field list | Task 1 cases (b)-(h) |
| AC-7 null `held.email` at an mi11 site, DEFENSIVE | Task 1 case (i) |
| AC-8 the same at the `crew_email` branch, DEFENSIVE | Task 4 case (m) |
| AC-9 the no-retain degrade closes | Task 4 case (n) |
| AC-10 absent, empty, or non-matching prior snapshot | Task 1 cases (j)-(l) |
| AC-11 planted mutants: B1-B5 against the helper, plus R466 and R477 at the two sites that change more than an argument | Task 1 step 8, Task 2 step 12, Task 3 step 10, Task 4 step 7 |
| AC-12 no help page promises a whole-row freeze | Task 6 |
| AC-13 the class guard, its structural mutants, and R299 | Task 5 |
| AC-14 no new advisory-lock acquisition | Task 7 step 3 |

## 9. Close-out

Twelve required CI checks green at a head whose `git merge-base origin/main HEAD` equals `git rev-parse origin/main`; one green `pnpm heavy pnpm test` at that head; the impeccable pair run with its dispositions recorded and the `impeccable-gate:` line filled; the round corpus and the cap filing committed; the ledger row archived and the marker off in the PR's last commit; READINESS to bl-orch. The arc does not merge.
