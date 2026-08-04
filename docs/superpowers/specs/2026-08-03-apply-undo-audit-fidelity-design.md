# Apply/undo audit fidelity — design

**Date:** 2026-08-03
**Branch:** `fix/apply-undo-audit-fidelity`
**Closes:** `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP`, `BL-IDENTITYLINK-LANDED-VS-REQUESTED`, `BL-UNDO-SELECTIONS-RESET-AT-DROP` (BACKLOG.md)

---

## 1. The problem

Three filed entries, one thread: **the system records crew changes it did not perform, then lets an operator undo those false records into a wrong roster state.**

- A requested identity-link rename that does not land still produces a capability notice and a `crew_renamed` feed row (Unit A).
- Because the feed counts the pair as a rename, the removal that *actually* happened gets no `crew_removed` row at all (Unit A) — so the only undoable row is a rename that never occurred.
- Undoing any crew change silently drops `selections_reset_at`, re-validating a picker cookie an admin deliberately invalidated (Unit D).
- Separately, a capability gain or loss applied through the onboarding wizard's Phase D reaches the change log but never the bell or the durable event (Unit C).

Units A and D are coupled: A determines *which* rows are undoable, D determines whether undoing one restores the truth.

### 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|---|---|
| R1 | **`renameCrewMember`'s no-op stays a no-op.** A target-name collision or missing source must NOT throw and must NOT become a hard error. The guarded `NOT EXISTS` update is the ratified fail-safe: it degrades to delete+insert rather than raising a unique-violation. This spec changes only whether the no-op is *observable*, never whether it happens. | `lib/sync/applyParseResult.ts:36-37`; impl rationale `lib/sync/runScheduledCronSync.ts:1622-1625` |
| R2 | **Deriving change-log rows from what landed is already the ratified contract, not a new proposal.** P2-F2 states the change-log writer must derive `crew_added`/`crew_removed`/**`crew_renamed`** from the applied list, "not the raw parse list, so a reservation-suppressed row never gets a phantom auto_apply row." It is already honored for the crew list. Unit A extends the same contract to the rename pairs, which were left on the raw path. A reviewer should not re-derive whether landed-vs-requested is the right principle. | `lib/sync/applyParseResult.ts:117-121`; honored at `lib/sync/phase2.ts:543-546` |
| R3 | **`entity_ref` on a `crew_renamed` row stays the PRIOR name.** Resolution #19. Unit A changes which pairs produce a row, never the row's shape. | `lib/sync/changeLog/writeAutoApplyChanges.ts:91` |
| R4 | **An unlanded rename is reported forensically only — no user-visible surface.** Ratified by the user at design time (2026-08-03): silent omission from the notice and feed, plus a durable `app_event`. No §12.4 catalog row, no `pnpm gen:spec-codes` regeneration, no `lib/messages/catalog.ts` row, no warning-card copy, no UI. Consequently **invariant 8's impeccable dual-gate does not apply to this branch** — there is no UI surface in the diff. | §2.2 below |
| R5 | **Both existing codes in Unit C are reused.** `ROLE_FLAGS_NOTICE` (`lib/messages/catalog.ts:886-901`, spec §12.4 row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2866`) and `LEAD_ROLE_APPLIED` already exist. Unit C adds a third *caller*, not a new code, so the §12.4 three-lockstep-update rule is not triggered by Unit C. | `lib/log/emitLeadRoleApplied.ts:21-23` |
| R6 | **NaN handling in the picker reset check is deliberate and unchanged.** `entry.t <= NaN` is false, so a corrupt marker fails open rather than forcing a spurious re-pick. Unit D restores the column; it does not touch the comparison. | `lib/auth/picker/resolvePickerSelection.ts:132-134` |
| R7 | **The feed's loss of rows for unaccepted/ungated renames is the fix, not a regression.** See §4 — it is a deliberate, enumerated behavior change. |  |

---

## 2. Design

### 2.1 Unit A — one landed-pairs source

Four links in the producer chain are lossy today. Each is repaired in place.

**A1. `renameCrewMember` reports whether a row changed.**

```
lib/sync/applyParseResult.ts:38   renameCrewMember(showId, removedName, addedName): Promise<void>
                                → renameCrewMember(showId, removedName, addedName): Promise<boolean>
lib/sync/runScheduledCronSync.ts:1626  await this.rows(...)      // rowcount discarded
                                     → inspect the returned rows/rowcount, return the boolean
```

`true` = the guarded update matched and renamed one row. `false` = the `NOT EXISTS` guard or the `name = $2` predicate matched nothing (per R1, still not an error).

**A2. `ApplyParseResultOutcome` carries the rename outcome.**

```ts
export type ApplyParseResultOutcome = {
  appliedCrewMembers: ParseResult["crewMembers"];
  landedRenames: IdentityLinkRename[];
  unlandedRenames: Array<{ pair: IdentityLinkRename; reason: UnlandedRenameReason }>;
};
```

`UnlandedRenameReason` is a closed union over the five existing `continue` guards in the loop at `lib/sync/applyParseResult.ts:175-186`, plus the newly observable A1 case:

| Reason | Guard | Line |
|---|---|---|
| `source_absent` | `!previousNamesSet.has(pair.removedName)` | `applyParseResult.ts:176` |
| `target_absent` | `!nextNamesSet.has(pair.addedName)` — the P2-F4 hold-suppression landing point | `applyParseResult.ts:177` |
| `name_held` | `heldNames.has(...)` either side | `applyParseResult.ts:178` |
| ~~`source_delete_protected`~~ | **unreachable — not implemented.** Every `protectedNames` entry is a hold's `entity_key` (`lib/sync/holds/holdAwareApply.ts:237`, `lib/sync/holds/holdAwareApply.ts:434`, `lib/sync/holds/holdAwareApply.ts:448`) and every surviving hold adds that same key to `heldNames` first (`lib/sync/holds/holdAwareApply.ts:216`), so the `name_held` guard at `lib/sync/applyParseResult.ts:178` always wins before the delete-protected guard at `lib/sync/applyParseResult.ts:179` can fire. A test emitting this reason would have to mock an impossible planner state. The union has **five** members, not six. | `applyParseResult.ts:179` |
| `pair_already_consumed` | consumed-once belt | `applyParseResult.ts:180-182` |
| `rename_no_op` | A1 returned `false` | new |

The `IdentityLinkRename` shape (`{ removedName, addedName }`) is unchanged — `lib/sync/identityLinkRenames.ts:3`.

**A3. The notice consumes landed pairs — but the two arms need different sets.**

`capabilityRoleChangesForNotice` uses `identityLinkRenames` **twice, for opposite purposes**, and a naive swap to `landedRenames` is wrong for one of them:

| Arm | Derived set | Purpose | Correct input |
|---|---|---|---|
| (a) | `priorNameForAdded` (`lib/sync/phase2.ts:279-280`) | map an added name back to its linked prior, so an unchanged-flag rename is not reported as a fresh grant | `landedRenames`. An unlanded pair's `addedName` is absent from `appliedCrewMembers` anyway, so the lookup is inert either way; landed is correct and strictly safer. |
| (c) | `renamedAway` (`lib/sync/phase2.ts:281`, consumed `lib/sync/phase2.ts:325`) | **suppress** a capability-loss notice | **not** `landedRenames` — see below |

Arm (c) asks "is this prior row's absence from `appliedCrewMembers` explained by something other than a real capability loss?" Two things explain it:

1. **The rename landed** — the successor row carries the capability, caught by arm (a).
2. **The row survived without being in the applied list.** `appliedCrewMembers = crewMembers` is the post-hold parse (`lib/sync/applyParseResult.ts:163`), while `deleteKeepNames = [...nextCrewNames, ...deleteProtectedNames]` (`lib/sync/applyParseResult.ts:152`) protects held and delete-protected names from deletion **without adding them to that list**. Such a row is live in the DB with its flags intact but absent from `nextByName`.

So:

```
renamedAway  ←  landedRenames.map(removedName)
              ∪  unlandedRenames where removedName ∈ deleteKeepNames
```

**The second term is a survival test, not a reason test**, and the distinction is load-bearing. The intuitive formulation — suppress when `reason ∈ { name_held, source_delete_protected }` — is a proxy that does not hold. `heldNames.add(hold.entity_key)` runs for every surviving hold (`lib/sync/holds/holdAwareApply.ts:216`), but `protectedNames.add(...)` runs only inside specific hold-kind branches (`lib/sync/holds/holdAwareApply.ts:237`, `lib/sync/holds/holdAwareApply.ts:434`, `lib/sync/holds/holdAwareApply.ts:448`), and only `protectedNames` reaches `deleteKeepNames` (`lib/sync/applyParseResult.ts:146` into `lib/sync/applyParseResult.ts:152`). So a `name_held` pair whose hold kind did not also delete-protect it **does** lose its row, and suppressing its notice would hide a real capability loss.

`deleteKeepNames` is already computed one scope above the rename loop (`lib/sync/applyParseResult.ts:152`), so the correct predicate costs nothing and asks the question directly: *did the source row survive this apply?* Suppress the loss notice exactly when it did.

Feeding `landedRenames` alone would fire a **false capability-loss notice** for every pair whose source survived — a new defect in the opposite direction from the one this unit fixes. The `source_absent` reason is inert either way (the name is not in `previousCrewMembers`, so arm (c) never reaches it).

**This corrects a real loss that is silently suppressed today.** For `target_absent` (the P2-F4 shape) and `rename_no_op`, the source row is *not* protected — `deleteCrewMembersNotIn` removes it — so a capability genuinely disappears. Today `renamedAway` contains the requested `removedName` and suppresses the notice, so that loss is never reported. Under this design it reports. See §4 item 9.

**A4. The feed consumes landed pairs and stops re-deriving.**

`writeAutoApplyChanges` currently computes its own pairs: `const renames = renamePairs(args.triggeredItems)` (`lib/sync/changeLog/writeAutoApplyChanges.ts:78`), where `renamePairs` (`lib/sync/changeLog/writeAutoApplyChanges.ts:43-51`) accepts any MI-12/MI-13/MI-14 item unconditionally. This is the R2 violation. It gains a `landedRenames` argument from the `lib/sync/phase2.ts:537-550` call site, drops `renamePairs` and the `triggeredItems`-derived rename path, and iterates the passed pairs at `lib/sync/changeLog/writeAutoApplyChanges.ts:92`.

`renamePairs` and the `RenamePair` type (`lib/sync/changeLog/writeAutoApplyChanges.ts:41`) are deleted if `triggeredItems` retains no other rename consumer; `triggeredItems` itself stays — `hasInvariant` (`lib/sync/changeLog/writeAutoApplyChanges.ts:68-73`) has other callers.

The `heldNames` guard at `lib/sync/changeLog/writeAutoApplyChanges.ts:93` is retained. It is now partly redundant with `name_held` from A2, but it guards the feed independently of the apply path and removing it would be an unforced widening.

### 2.2 Unit B — durable unlanded event

A new forensic emitter modeled exactly on `lib/log/emitLeadRoleApplied.ts`, which documents the pattern at `lib/log/emitLeadRoleApplied.ts:10-30`.

- **Code:** `IDENTITY_LINK_RENAME_UNLANDED`, written via `persistAppEventStrict` (failure-visible `{ ok }`, does not swallow).
- **Not a §12.4 code.** The `persistAppEventStrict(...)` span is recognized by `stripLogEmissionCalls`, keeping it out of the §12.4 and internal-code-enum producer scans — the same mechanism asserted for its precedent at `tests/messages/stripLogEmissionCalls.test.ts:123-138`.
- **Escalation code:** `IDENTITY_LINK_RENAME_UNLANDED_PERSIST_FAILED`, surfaced via `log.error` on `{ ok: false }` (invariant 9 — never silently swallowed), mirroring `emitLeadRoleApplied.ts:73`.
- **Payload:** `{ showId, driveFileId, removedName, addedName, reason }`. Redaction-safe: crew names only, no email/phone/token. `persistAppEventStrict` also runs `sanitizeContext`.
- **Emission point:** post-commit, outside the advisory-lock transaction (invariant 10), from the same tail region that already emits `roleFlagsNotice`.
- **Propagation is specified per hop, because R4 makes this the ONLY signal.** `applyParseResult` returning `unlandedRenames` is worthless if any boundary between it and the post-commit sink drops the field — and a dropped hop would be completely dark, with no user-visible surface to notice its absence. The field therefore rides every boundary the existing `roleFlagsNotice` rides, which is the proven template for exactly this shape:

  | Hop | `roleFlagsNotice` precedent | Add |
  |---|---|---|
  | Phase 2 result | `lib/sync/phase2.ts:168` | `unlandedRenames` |
  | cron/manual result | `lib/sync/runScheduledCronSync.ts:396` | `unlandedRenames` |
  | staged core result | `lib/sync/applyStagedCore.ts:474` | `unlandedRenames` |
  | staged result | `lib/sync/applyStaged.ts:265` | `unlandedRenames` |

  Each of the three post-commit sinks (cron/manual, dashboard staged, finalize-cas) gets an **integration** assertion that the event fires end-to-end, not merely a unit test of the emitter in isolation. A unit test on the emitter proves nothing about whether the field survived four hops.
- **Cardinality: one event per unlanded pair per apply attempt.** No dedup, no coalescing — matching the precedent, which emits per capability change per apply (`lib/log/emitLeadRoleApplied.ts:52-68`). All six `reason` values emit, including `name_held`, which is an ordinary operator-initiated state rather than a fault.
- **Volume is NOT bounded by an accept gate.** `computeIdentityLinkRenames` gates only MI-13 and MI-14 on `acceptedThisVersion`; **MI-12 pairs are emitted unconditionally** (`lib/sync/identityLinkRenames.ts:20-23`), and `computeStagedIdentityLinkRenames` (`lib/sync/identityLinkRenames.ts:39-59`) has no accept gate at all. So a standing hold on an MI-12 pair DOES re-request, and therefore re-emit, on every pass until the hold clears. This is accepted — see §8 for why filtering belongs in the read path — but it must not be justified by a gate that does not cover the common case.

### 2.3 Unit C — one emit helper, three callers

**The helper already exists; this unit adopts it rather than creating one.** `emitDeferredRoleFlagsNotice` (`lib/sync/runScheduledCronSync.ts:2318-2331`) is already precisely the intended shape — same applied-and-notice-present guard, same `emitLeadRoleApplied` then `upsertAdminAlert` ordering, same rationale comment — and `lib/sync/applyStaged.ts:1993-2002` is a near-verbatim duplicate of it. The duplication this unit was written to prevent is therefore already present. The work is to **export it, relocate it to a shared module under `lib/sync/`, collapse the `applyStaged` copy into it, and add finalize-cas as a third caller.**

One signature change: the existing function takes a `ProcessOneFileResult` envelope and re-derives the guard from it. finalize-cas's per-row result is a different shape (`ShadowApplyResult`), so the shared form takes the `roleFlagsNotice` directly and leaves the guard to each caller. Callers:

| Caller | Today | After |
|---|---|---|
| `lib/sync/runScheduledCronSync.ts:2318-2331` | **owns** `emitDeferredRoleFlagsNotice` (private) | exported + relocated; calls the shared form |
| `lib/sync/applyStaged.ts:1993-2002` | near-verbatim duplicate | calls the shared form |
| `app/api/admin/onboarding/finalize-cas/route.ts` | **discards `core.roleFlagsNotice`** (`app/api/admin/onboarding/finalize-cas/route.ts:619` returns without it) | surfaces it on the per-row result, caller emits post-commit |

The emit ordering (durable audit **before** the throwing `upsertAdminAlert`) moves into the helper unchanged — it is load-bearing per `applyStaged.ts:1995-1999`.

**finalize-cas plumbing.** `applyStagedCore` runs under `deps.withRowTx` → `defaultWithRowTx`'s `pg_advisory_xact_lock('show:'||$1)` (`route.ts:167`). The emit must therefore happen **after** that lock resolves, in the `runFinalizeCas` loop — exactly where the existing `logAdminOutcome({ code: "SHOW_FINALIZED", ... })` post-commit emit already sits (`route.ts:982-989`). The per-row result type `ShadowApplyResult` (`route.ts:83-114`) gains an optional `roleFlagsNotice` on its OK branch, set at the `app/api/admin/onboarding/finalize-cas/route.ts:619` return. **No new advisory lock is acquired** — invariant 2's single-holder rule is untouched.

**The new field must be stripped from the HTTP response.** The caller currently destructures only `showId` off the per-row result before building `responseRow`, so an added `roleFlagsNotice` would ride into `per_row` and become part of the route's public response — leaking an internal payload (crew names and capability flags) and breaking the stated stable response contract (`app/api/admin/onboarding/finalize-cas/route.ts:82-94`, `app/api/admin/onboarding/finalize-cas/route.ts:980-994`). The destructure widens to drop it alongside `showId`, and §7 carries a response-shape assertion — the emission and failure tests do not cover this.

**`upsertAdminAlert` throws, and the finalize-cas loop is fail-open — the helper must not import a throw into it.** Every existing emit in `runFinalizeCas`'s per-row loop is deliberately non-throwing: the `log.warn`/`log.error` calls are wrapped (`app/api/admin/onboarding/finalize-cas/route.ts:1009-1017`), and `app/api/admin/onboarding/finalize-cas/route.ts:1023-1024` records that `logAdminOutcome` "never throws (fail-open internally)", needing no try/catch. That loop runs inside the outer `deps.withTx`, so a throw escaping it would abort the transaction **after** per-row shows already committed durably, skipping `deleteShadowRows`, `publishAppliedWizardShows` (`app/api/admin/onboarding/finalize-cas/route.ts:1059-1064`) and `markFinalCasDone` (`app/api/admin/onboarding/finalize-cas/route.ts:1094`).

Therefore the finalize-cas call site wraps the helper and escalates on failure rather than propagating, matching the loop's established posture. The **ordering inside** the helper is unchanged (durable audit before the alert upsert), so a thrown `upsertAdminAlert` still cannot skip the durable record — it is caught one level up, after the audit has already been attempted. `applyStaged` and `runScheduledCronSync` keep their current propagating behavior; the helper does not impose a failure policy on its callers. A test pins that a throwing `upsertAdminAlert` in the finalize-cas path leaves `markFinalCasDone` reached.

**The topology pin gets stronger — narrowly, and not in the way that would have caught this bug.** `tests/sync/_metaLeadRoleAppliedTopology.test.ts:29` matches `upsertAdminAlert(<expr>roleFlagsNotice` and `tests/sync/_metaLeadRoleAppliedTopology.test.ts:35-38` asserts exactly two files under `lib/sync`. With the helper owning the only such call, the expected site list becomes **one** file.

Stated precisely, because the obvious claim is wrong: this pin detects an emit site that *upserts the alert without the durable event*. It has never been able to detect a caller that **discards `roleFlagsNotice` entirely** — which is exactly the shape of `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP`. Consolidation does not change that, and §7's "expects one site" assertion would still pass if a fifth caller dropped the notice. The genuine gains are narrower: one implementation of the load-bearing emit order instead of three copies to drift, and no `app/`-side emit for a `lib/sync`-only walker to miss. **Detecting a dropped notice needs a different guard**, filed as a follow-up rather than claimed here (§9).

### 2.4 Unit D — `selections_reset_at` survives an undo

Three places drop the column; all three are repaired.

| # | Site | Change |
|---|---|---|
| D1 | `crewImage` — `lib/sync/changeLog/writeAutoApplyChanges.ts:53-66`, 10 keys | add `selections_reset_at` → 11 keys. Already available on the source type (`lib/sync/applyParseResult.ts:17`) |
| D2 | `undo_change` Direction A INSERT column list — `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:175-179` (12 columns) and the values list `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:181-188` | add the column, cast `(v_before->>'selections_reset_at')::timestamptz` |
| D3 | the same function's `ON CONFLICT (show_id, name) DO UPDATE SET` list — `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:189-198` | `selections_reset_at = greatest(crew_members.selections_reset_at, excluded.selections_reset_at)` — **not** a bare `excluded.` assignment |
| D4 | the successor `select … for update` — `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:151-153` | also capture `selections_reset_at` into a new local, and feed the INSERT `greatest((v_before->>'selections_reset_at')::timestamptz, v_succ_reset)` |
| D5 | `mi11_approve_hold`'s crew `before_image` builder — `supabase/migrations/20260608000002_mi11_gate_rpcs.sql:336` | add `selections_reset_at`; it is the **second** production builder and `crewImage` is not the only one |

**D3 alone is not enough — it guards the branch that almost never runs.** The ON CONFLICT branch is documented as defensive (`supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:172-174` calls the clean-INSERT path "the reachable one"). A normal `crew_renamed` undo **deletes the live successor first** (`supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:150-163`) precisely so the INSERT slot is free, so it takes the clean-INSERT path. Any reset stamped on that successor *after* the rename is destroyed by the delete, and `greatest(...)` in the conflict branch never sees it. D3 without D4 leaves the common case exactly as broken as it is today.

**D4 is the actual fix, and it subsumes the historical case.** The successor row is already `select … for update`'d at `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:151-153` before the delete, so its marker is capturable at zero extra cost:

```sql
select id, selections_reset_at into v_succ_id, v_succ_reset
  from public.crew_members
 where show_id = v_log.show_id and name = v_succ_name
   for update;
```

and the INSERT takes `greatest((v_before->>'selections_reset_at')::timestamptz, v_succ_reset)`. For `crew_removed` there is no successor, `v_succ_reset` is NULL, and `greatest` falls through to the `before_image` value. For a **historical** rename row whose `before_image` lacks the key, the term is NULL and `greatest` falls through to the live successor's marker — so old rows are protected too, without a backfill.

**Correcting an earlier overclaim in this spec.** A previous revision said historical rows "degrade safely" because the absent-key cast produces NULL rather than an error. That conflated *no error* with *no harm*: restoring NULL over a live invalidation is precisely the revalidation §1 exists to prevent. The probe below still holds as a statement about cast behavior; it never established safety.

`greatest(...)` is NULL-safe in the direction that matters — probed, not assumed:

```
 live_null_accepts_restored | older_null_never_clears | both_null_stays_null | keeps_newer
 2026-08-03 00:00:00+00     | 2026-08-03 00:00:00+00  | t                    | 2026-08-04 00:00:00+00
```

Postgres `greatest` ignores NULL arguments and returns NULL only when all are NULL, so an older NULL never clears a live timestamp, and a live NULL still accepts a restored one. The reset marker is monotonic by construction — its only writer stamps `clock_timestamp()` (`supabase/migrations/20260719000000_reset_crew_member_selection_lifecycle_guard.sql:48-51`) — so "keep the newer" is the correct merge, not a heuristic.

The branch is documented as defensive and hard to reach (`supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:172-174` calls the clean-INSERT path "the reachable one"), but "hard to reach" is not "unreachable", and the failure mode is a silent security-relevant regression. §7 carries a D3 test that drives the conflict branch directly.

Delivered as a new migration using `CREATE OR REPLACE FUNCTION`, matching how `20260719000001` itself superseded `20260608000003_undo_change_rpc.sql:89`. The `ROW_COUNT` fail-safe at `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:199-200` is preserved verbatim.

**Historical `before_image` rows cast cleanly — which is a statement about types, not about safety.** Rows written before D1 have no `selections_reset_at` key. The new INSERT reads it as `(v_before->>'selections_reset_at')::timestamptz`, and an absent jsonb key yields SQL NULL, which casts to a NULL `timestamptz` without error:

```
$ psql -c "select (('{\"name\":\"A\"}'::jsonb)->>'selections_reset_at')::timestamptz as absent, ..."
 absent_key_yields_null | cast_type                | absent_cast_value | explicit_null_cast | roundtrip
 t                      | timestamp with time zone |                   |                    | 2026-08-03 01:02:03+00
```

No backfill is required and none is proposed, but the NULL is **not** benign on its own: restoring it over a live invalidation is the very revalidation this unit prevents. D4 is what makes historical rename rows safe, by falling through to the captured successor marker. A historical **`crew_removed`** row is the one case D4 cannot rescue — there is no successor to capture from and the deleted row's marker is genuinely gone. That is a real residual limit, recorded in §8 rather than papered over.

**The guard that should have caught this is aimed at a dead file.** `tests/db/undo-change-no-phantom-columns.test.ts:19` reads `20260608000003_undo_change_rpc.sql`, superseded by `20260719000001`. Its `REAL_CREW_COLUMNS` set (`tests/db/undo-change-no-phantom-columns.test.ts:22-34`) also omits `selections_reset_at`, and the test only asserts that named columns are real plus that a required subset is present — nothing forbids an omission. Repointing it at the live migration and adding the column is in scope: repairing the drop without repairing its blind guard queues the next drop.

**Test helpers cannot currently observe the column.** `tests/db/_holdsHelpers.ts` omits it from `CrewSeed` (`tests/db/_holdsHelpers.ts:62-71`), from the seed INSERT (`tests/db/_holdsHelpers.ts:92-97`), and from `readCrew`'s select (`tests/db/_holdsHelpers.ts:275`). All three need it before any assertion is possible.

---

## 3. Data flow after the change

```
parse / staged decisions
      │
      ├─ computeIdentityLinkRenames        (cron,   identityLinkRenames.ts:14-28, accept-gated)
      ├─ computeStagedIdentityLinkRenames  (staged, identityLinkRenames.ts:39-59)
      └─ [] hardcoded                      (first-seen, runManualStageForFirstSeen.ts:125)
                    │  REQUESTED pairs
                    ▼
   applyParseResult  ── 5 guards + renameCrewMember rowcount ──▶ landedRenames
                    └──────────────────────────────────────────▶ unlandedRenames[{pair,reason}]
                    │
     ┌──────────────┼──────────────────┬─────────────────────────┐
     ▼              ▼                  ▼                         ▼
 notice        writeAutoApplyChanges   emitIdentityLinkRenameUnlanded   (unchanged)
 (landed)      (landed)                (unlanded, post-commit)          appliedCrewMembers
```

Single producer, three consumers. No consumer re-derives.

---

## 4. Visible behavior changes (enumerated)

Every change an operator could notice, stated so review does not have to discover them.

1. **A suppressed/collided/no-op rename stops producing a `crew_renamed` feed row.** What replaces it is **one-sided and depends on the reason**, not a uniform "removed + added". The rename row suppressed both loops — removals skip `renamedPriorNames` (`lib/sync/changeLog/writeAutoApplyChanges.ts:106-107`), additions skip `renamedAddedNames` (`lib/sync/changeLog/writeAutoApplyChanges.ts:121`) — but each unlanded reason leaves only one side of the pair actually present in the rosters being diffed. Measured against the current writer, requested-pair versus no-landed-pair:

   | Case | With requested pair (today) | With landed pairs only |
   |---|---|---|
   | target collision | `crew_renamed:Old` | `crew_removed:Old` |
   | source absent | `crew_renamed:Old` | `crew_added:New` |
   | target absent (P2-F4) | `crew_renamed:Old` | `crew_removed:Old` |
   | held source | (none) | `crew_added:New` |
   | held target | (none) | `crew_removed:Old` |

   In every case the feed row that appears is the one describing what actually happened to the rosters, and the false rename disappears. Note the last two rows: a held pair produces **no** feed row today and gains one.

2. **`field_changed` rows change too.** `renames` has a third use inside the writer beyond the two loops above — it maps prior names while deriving structured field changes (`lib/sync/changeLog/writeAutoApplyChanges.ts:145-170`). A requested-but-unlanded pair currently emits a `field_changed` row attributing the successor's field deltas to the prior member (measured: `field_changed: Role — New, A1 → V1` alongside the `crew_renamed` row). Sourcing from landed pairs drops that attribution with the rename. §7 pins this mapping explicitly.
3. **An unaccepted cron MI-13 or MI-14 stops producing a `crew_renamed` row** (replaced per the item 1 table). `computeIdentityLinkRenames` gates those two invariants on `acceptedThisVersion` (`lib/sync/identityLinkRenames.ts:20-23`); `renamePairs` had no gate at all. This is the R7 fix. MI-12 is ungated in both, so it is unaffected.
4. **A staged `independent` decision stops producing a `crew_renamed` row.** Same mechanism as (3).
5. **First-seen shows are unaffected.** `runManualStageForFirstSeen.ts:125` passes `[]`, and a first-seen show has no prior roster, so it produced no legitimate rename rows before and produces none now.
6. **A suppressed rename no longer appears in the capability notice**, so a `ROLE_FLAGS_NOTICE` that would have been raised solely by a phantom rename is not raised at all.
7. **Undo restores `selections_reset_at`.** A picker cookie invalidated before the undone change stays invalidated afterward.
8. **A Phase D wizard apply that changes a LEAD/FINANCIALS bit now raises the bell alert and the durable event**, matching the dashboard and cron paths.
9. **A capability loss that is silently suppressed today now reports.** When a rename's target is hold-suppressed (P2-F4) or the update no-ops, the source row is not delete-protected, so `deleteCrewMembersNotIn` removes it and a LEAD/FINANCIALS capability genuinely disappears. Today `renamedAway` holds the requested `removedName` and suppresses arm (c), so no loss notice fires. Under §2.1 A3 it fires. This is a **new** `ROLE_FLAGS_NOTICE` in a case that previously produced none — an addition to the operator's bell, not a removal, and the opposite direction from items 1–5.
10. **Pairs whose source row SURVIVED continue to produce no loss notice.** Membership in `deleteKeepNames` (`lib/sync/applyParseResult.ts:152`) is the test, so §2.1 A3 keeps them in `renamedAway`. Called out because a naive reading of item 8 would predict otherwise. Note this is narrower than "held": a `name_held` pair whose hold kind did not delete-protect it falls under item 9, not here.

---

## 5. DB completeness matrix

| Layer | Action |
|---|---|
| Table DDL | N/A — `selections_reset_at` already exists (`supabase/migrations/20260703000000_crew_members_selections_reset_at.sql:3-4`, nullable, no DEFAULT) |
| Inline CHECK | N/A — no CHECK involves this column |
| RPC write path | `undo_change` Direction A INSERT + ON CONFLICT (D2, D3) |
| RPC read path | N/A — `undo_change` reads `before_image` JSON, which D1 widens |
| Propagation trigger | N/A — none on this column |
| Cleanup function | N/A |
| Other writers | `reset_crew_member_selection` (`20260719000000_reset_crew_member_selection_lifecycle_guard.sql:48-51`) unchanged |
| Readers | `lib/auth/picker/resolvePickerSelection.ts:135-140` (select at `lib/auth/picker/resolvePickerSelection.ts:118`) and `lib/auth/picker/resolveShowPageAccess.ts:280-291` (select at `lib/auth/picker/resolveShowPageAccess.ts:179`) — unchanged, they simply stop seeing a spurious NULL |
| Frontend | N/A — no UI surface (R4) |
| Schema manifest | `pnpm gen:schema-manifest` run and committed; expected to be a **no-op diff** since no column/table changes |
| Tests | §7 |

### 5.1 Validation-parity caveat — CI will not catch a skipped apply

This migration replaces a **function**, and `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (BACKLOG.md:1450) records that the `validation-schema-parity` gate never inspects functions — it compares the public column/table manifest only. Layer 1 and Layer 2 of that gate will both pass whether or not the new `undo_change` reaches the validation project.

The surgical apply is therefore a **manual, unguarded step**, not a gate-enforced one:

```
supabase db query --linked -f supabase/migrations/<new>.sql   # or psql "$TEST_DATABASE_URL" -f ...
supabase db query --linked "notify pgrst, 'reload schema';"
```

This branch is a live instance of that open backlog row. It does not fix it — closing that gap is its own scoped change — but the plan carries the apply as an explicit checklist item rather than trusting CI.

---

## 6. Error handling and failure policy

- **A1 returning `false` is not an error.** Per R1 it flows into `unlandedRenames` and the Unit B event. Nothing throws.
- **Unit B follows the honest-durability posture** documented for its precedent (`lib/log/emitLeadRoleApplied.ts:19-23`): post-commit, so not transactionally atomic with the change; durable + failure-visible; `{ ok: false }` escalates loudly via `log.error` with a distinct code. Residual double-fault (strict insert and escalation both fail) is documented, not handled — same as the precedent.
- **Unit C preserves emit ordering.** Durable audit before the throwing `upsertAdminAlert`, so a transient alert-RPC failure can never skip the durable record.
- **Unit B emission never blocks the apply.** An unlanded rename is an expected outcome, not a fault; a failed *event write* must not fail the sync.
- **A1 is NOT a Supabase call boundary, so invariant 9's `{ data, error }` shape does not apply.** The sole production implementation runs through postgres.js `unsafe` (`lib/sync/runScheduledCronSync.ts:728-729`, bound at `lib/sync/runScheduledCronSync.ts:1847-1848`), which returns a row list carrying `.count` and signals faults by **throwing** — there is no returned-error channel to destructure. A1 therefore reads `.count` from the existing result and lets faults propagate as they already do; an earlier revision of this spec prescribed a destructure that would not compile against this client. Invariant 9's substance still binds elsewhere in the diff wherever a genuine Supabase client call is added.

---

## 7. Testing

TDD per task (invariant 1). Each row names the concrete failure it catches — no test that only proves a function is called.

| Unit | Test | Failure caught |
|---|---|---|
| A | Hold-suppressed rename target (P2-F4 shape): assert **no** `crew_renamed` row **and a `crew_removed` row for the prior name** | The current false-rename-plus-missing-removal pair. Asserting only the absent rename row would pass on a writer that dropped both. |
| A | Unaccepted MI-13 with a surviving target: assert `crew_removed` **and** `crew_added` both appear | §4 item 1's additions half. The removals half alone passes on a writer that still suppresses additions (`lib/sync/changeLog/writeAutoApplyChanges.ts:121`). |
| A | `renamedAway` survival split: an unlanded pair whose `removedName` IS in `deleteKeepNames` produces **no** loss notice; one whose `removedName` is NOT produces one (capability-flagged prior) | The §4 item 9 / item 10 pair. A single-set implementation cannot satisfy both, so this test is what forces the split. |
| A | A `name_held` pair whose hold kind did **not** delete-protect it still produces a loss notice | The reason-based proxy. A `reason ∈ {name_held, …}` implementation passes the row above and fails only here — which is exactly the case that would hide a real capability loss. |
| A | `renameCrewMember` returns `false` on target collision and on missing source; the pair surfaces as `rename_no_op` | The second silent layer — a pair clearing all five guards can still no-op. Existing tests (`tests/sync/applyParseResult.identityLink.db.test.ts:64` and `tests/sync/applyParseResult.identityLink.db.test.ts:80`) assert DB state only and pass today. |
| A | Each of the five guards maps to its distinct `reason` | A collapsed union that reports every skip identically |
| A | An **accepted** rename that lands still produces its notice entry and `crew_renamed` row | Over-correction — the fix silencing legitimate renames |
| A | `field_changed` attribution follows landed pairs: an unlanded pair emits no `field_changed` row mapped through the prior name | §4 item 2. The rename/add/remove assertions all pass while this row is still mis-attributed. |
| B | One unlanded pair emits exactly one event carrying `reason`; `{ ok: false }` escalates via `log.error` | Silent omission degrading into silent-everything |
| B | **Integration, once per sink** (cron/manual, dashboard staged, finalize-cas): an unlanded pair produces the event end-to-end | A dropped propagation hop. R4 makes this the only signal, so a lost field is fully dark — and an emitter unit test passes with all four hops broken. |
| B | The code does not register in the §12.4 / internal-code-enum scans — mirrors `tests/messages/stripLogEmissionCalls.test.ts:123-138` | A forensic code leaking into the user-facing catalog |
| C | finalize-cas Phase D LEAD-bit change co-emits `LEAD_ROLE_APPLIED` + `ROLE_FLAGS_NOTICE`, **post-commit** — mirrors `tests/sync/applyStaged.test.ts:272-316` | The entry-1 drop |
| C | Emit ordering preserved: durable audit attempted before a throwing `upsertAdminAlert` — mirrors `tests/sync/applyStaged.test.ts:321-366` | Extraction silently reordering a load-bearing sequence |
| C | `_metaLeadRoleAppliedTopology` expects **one** site | A fourth emit site added off-helper |
| C | finalize-cas admin behavioral coverage still passes (`tests/log/adminOutcomeBehavior.test.ts`); route stays in `AUDITABLE_MUTATIONS` (`tests/log/_auditableMutations.ts:35`) | Invariant 10 regression on an admin mutation surface |
| C | A throwing `upsertAdminAlert` on the finalize-cas path still reaches `markFinalCasDone` | Importing a throw into a fail-open loop and aborting the outer tx post-commit |
| C | **Response shape:** `per_row` contains no `roleFlagsNotice` key | Leaking crew names and capability flags into the public API response |
| D | **db test:** seed a crew member, stamp `selections_reset_at`, record a change, undo it, assert the column round-trips **and** that `resolvePickerSelection` still returns `selection_reset` for a cookie stamped before the reset | The security-adjacent revalidation. Asserting the column alone would miss a reader-side regression. |
| D | **db test on the CLEAN-INSERT path (the reachable one):** rename, stamp a reset on the successor, undo, assert the marker survives | **The D3-only failure.** This is the common path; a `greatest()` that lives solely in the ON CONFLICT branch fails here while every other D test passes. |
| D | **db test driving the ON CONFLICT branch:** a live row whose `selections_reset_at` is NEWER than `before_image`'s keeps the newer value through an undo | D3 written as a bare `excluded.` assignment |
| D | **historical-row test:** a `before_image` with no `selections_reset_at` key, undone against a successor carrying one, keeps the successor's | D4's fall-through. Pins that old rows are rescued by capture rather than by backfill. |
| D | `mi11_approve_hold`'s `before_image` carries `selections_reset_at`, and an undo of an MI-11-applied removal round-trips it | D5. The second producer — invisible to any test that only exercises `crewImage`. |
| D | `undo-change-no-phantom-columns` reads the **live** migration and `REAL_CREW_COLUMNS` includes the column | The blind guard that let this land |
| D | `_holdsHelpers` seed + `readCrew` carry the column | Otherwise no D test can observe anything |

**Anti-tautology.** The Unit A assertions scope extraction to the change-log rows for the specific `entity_ref` under test, not to a container that renders both a rename and a removal. Expected values derive from the fixture's seeded names, never hardcoded. Boundary inputs exercised: empty `identityLinkRenames`, a pair where source and target are the same name, and a NULL `selections_reset_at` (which must remain NULL through an undo, not become a timestamp).

---

## 8. Documented limits

- **An unlanded rename is invisible to Doug in the product.** By R4 it lives only in `app_events`, reachable via `pnpm observe`. If operators later need it surfaced, that is a new scoped change with a §12.4 row and the impeccable dual-gate.
- **`renameCrewMember`'s `false` does not distinguish collision from missing source.** Both are a zero-row guarded update; separating them needs a second query, which is not worth a round-trip on the locked show transaction. Both report as `rename_no_op`.
- **The validation apply stays manual** until `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` is closed (§5.1).
- **A historical `crew_removed` undo can still revalidate a cookie.** D4 rescues historical rename rows by falling through to the live successor's marker, but a removal has no successor — the deleted row's marker is gone and the pre-D1 `before_image` never carried it. Bounded to `crew_removed` rows written before this change; every row written after carries the value. Not backfillable, since the information no longer exists anywhere. Stated rather than hidden, per the preparedness posture.
- **`name_held` emits a forensic event for an ordinary hold.** A held name is an expected operator flow, not a fault, so some fraction of `IDENTITY_LINK_RENAME_UNLANDED` events describe the system working as designed. Accepted deliberately: `reason` is on the event, so a reader filters by it, and suppressing `name_held` at the emit site would mean the one query that answers "was this rename ever requested?" silently omits the most common answer. If event volume later proves a problem, filtering belongs in the read path (`pnpm observe`), not the write path.

---

## 9. Out of scope

- Closing `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (§5.1) — its own change.
Both deferrals below name their exception under the class-sweep disposition rule (AGENTS.md, "Class-sweep before patching adversarial findings"), which makes same-PR repair of every instance the default and requires a deferred peer to cite (a) an unsettled product/design decision, (b) a ratified scope fence, or (c) a redesign of an untouched surface / scope-blowing breadth. "Same defect, different file" is explicitly not sufficient.

- **A guard that detects a caller DROPPING `roleFlagsNotice`** — **exception (c)**. The existing topology pin cannot (§2.3). Building one means walking every `applyStagedCore` caller for a discarded return field, which is a different mechanism from the emit-site regex walker and a new guard surface this PR does not otherwise touch. Unit C closes the one known instance; the guard is what stops the next one.
- **A pre-existing false capability-loss for held members generally** — **exception (c)**. Arm (c) fires for ANY `previousCrewMembers` entry absent from `appliedCrewMembers` without a `renamedAway` entry, and held/delete-protected rows are exactly that shape when no rename pair names them (`lib/sync/applyParseResult.ts:152` vs `lib/sync/applyParseResult.ts:163`). This spec keeps rename-linked held pairs suppressed (§4 item 10) — the instances reachable through the rename path, which IS the shape this PR is in. Fixing the non-rename case requires redesigning arm (c)'s absence predicate to distinguish "row deleted" from "row survived but is not in the applied list", which is a change to the notice's core semantics on a path no unit here touches. Filed as a new BACKLOG row.
- Any user-visible surface for unlanded renames (R4).
- Changing `renameCrewMember`'s no-op semantics (R1).
- Changing `crew_renamed`'s `entity_ref` (R3).
- The `heldNames` guard in the feed writer, retained deliberately (§2.1 A4).

---

## 10. Invariants touched

| Invariant | Bearing |
|---|---|
| 1 — TDD per task | Every task: failing test first |
| 2 — per-show advisory lock | **No new holder.** Unit C emits after `route.ts:167`'s `pg_advisory_xact_lock` resolves |
| 8 — impeccable dual-gate | **N/A — no UI surface** (R4). `impeccable-gate: N/A — no UI surface` |
| 9 — Supabase call-boundary | A1's rowcount read (§6) |
| 10 — mutation-surface observability | Unit C adds a code-carrying emit to an already-registered admin surface; Unit B adds a post-commit forensic emit outside the lock |
| 11 — isolated worktree | `../FX-worktrees/apply-undo-audit-fidelity` |
| 12 — ledger in-flight declaration | All three entries marked `**Status:** IN PROGRESS · **Branch:** fix/apply-undo-audit-fidelity` |
