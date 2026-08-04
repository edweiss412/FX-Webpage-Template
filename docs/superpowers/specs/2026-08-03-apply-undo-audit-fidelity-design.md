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
| `source_delete_protected` | `deleteProtectedNames.includes(...)` | `applyParseResult.ts:179` |
| `pair_already_consumed` | consumed-once belt | `applyParseResult.ts:180-182` |
| `rename_no_op` | A1 returned `false` | new |

The `IdentityLinkRename` shape (`{ removedName, addedName }`) is unchanged — `lib/sync/identityLinkRenames.ts:3`.

**A3. The notice consumes landed pairs.**

```
lib/sync/phase2.ts:586-590
  capabilityRoleChangesForNotice(snapshot.previousCrewMembers,
                                 applyOutcome.appliedCrewMembers,
                                 args.identityLinkRenames ?? [])   // requested
→                                applyOutcome.landedRenames)       // landed
```

Note the second argument is *already* `applyOutcome.appliedCrewMembers` — the P2-F2 principle applied to the crew list. This change makes the third argument consistent with it.

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
- **Cardinality: one event per unlanded pair per apply attempt.** No dedup, no coalescing — matching the precedent, which emits per capability change per apply (`lib/log/emitLeadRoleApplied.ts:52-68`). All six `reason` values emit, including `name_held`, which is an ordinary operator-initiated state rather than a fault. The volume is bounded by how often a pair is *requested*, not by how long the blocking condition persists: the cron producer is gated on `acceptedShrinkThisVersion` (`lib/sync/runScheduledCronSync.ts:3541-3542`), so a standing hold does not re-emit on every pass — only when a new version re-requests the pair. See §8.

### 2.3 Unit C — one emit helper, three callers

The emit tail at `lib/sync/applyStaged.ts:1993-2002` — `emitLeadRoleApplied(...)` then `upsertAdminAlert(...)`, in that order, with the ordering rationale documented inline at `lib/sync/applyStaged.ts:1995-1999` — is extracted into a single helper under `lib/sync/`. Callers:

| Caller | Today | After |
|---|---|---|
| `lib/sync/applyStaged.ts:1993-2002` | inline emit | calls helper |
| `lib/sync/runScheduledCronSync.ts:2322-2330` | inline emit | calls helper |
| `app/api/admin/onboarding/finalize-cas/route.ts` | **discards `core.roleFlagsNotice`** (`app/api/admin/onboarding/finalize-cas/route.ts:619` returns without it) | surfaces it on the per-row result, caller emits post-commit |

The emit ordering (durable audit **before** the throwing `upsertAdminAlert`) moves into the helper unchanged — it is load-bearing per `applyStaged.ts:1995-1999`.

**finalize-cas plumbing.** `applyStagedCore` runs under `deps.withRowTx` → `defaultWithRowTx`'s `pg_advisory_xact_lock('show:'||$1)` (`route.ts:167`). The emit must therefore happen **after** that lock resolves, in the `runFinalizeCas` loop — exactly where the existing `logAdminOutcome({ code: "SHOW_FINALIZED", ... })` post-commit emit already sits (`route.ts:982-989`). The per-row result type `ShadowApplyResult` (`route.ts:83-114`) gains an optional `roleFlagsNotice` on its OK branch, set at the `app/api/admin/onboarding/finalize-cas/route.ts:619` return. **No new advisory lock is acquired** — invariant 2's single-holder rule is untouched.

**The topology pin gets stronger.** `tests/sync/_metaLeadRoleAppliedTopology.test.ts:29` matches `upsertAdminAlert(<expr>roleFlagsNotice` and `tests/sync/_metaLeadRoleAppliedTopology.test.ts:35-38` asserts exactly two files under `lib/sync`. It walks `lib/sync` **only**, so an `app/`-side emit would have been invisible to it. With the helper owning the only `upsertAdminAlert(...roleFlagsNotice` call, the expected site list becomes **one** file, and the app-side blindness stops mattering because there is no app-side emit to miss.

### 2.4 Unit D — `selections_reset_at` survives an undo

Three places drop the column; all three are repaired.

| # | Site | Change |
|---|---|---|
| D1 | `crewImage` — `lib/sync/changeLog/writeAutoApplyChanges.ts:53-66`, 10 keys | add `selections_reset_at` → 11 keys. Already available on the source type (`lib/sync/applyParseResult.ts:17`) |
| D2 | `undo_change` Direction A INSERT column list — `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:175-179` (12 columns) and the values list `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:181-188` | add the column, cast `(v_before->>'selections_reset_at')::timestamptz` |
| D3 | the same function's `ON CONFLICT (show_id, name) DO UPDATE SET` list — `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:189-198` | add `selections_reset_at = excluded.selections_reset_at` |

Delivered as a new migration using `CREATE OR REPLACE FUNCTION`, matching how `20260719000001` itself superseded `20260608000003_undo_change_rpc.sql:89`. The `ROW_COUNT` fail-safe at `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:199-200` is preserved verbatim.

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

1. **A suppressed/collided/no-op rename stops producing a `crew_renamed` feed row.** Instead the removal that actually happened produces a `crew_removed` row, because the removal loop's `renamedPriorNames` skip (`writeAutoApplyChanges.ts:106-107`) no longer fires for that name. The feed gains a row it was missing and loses one that was false.
2. **An unaccepted cron MI-13 stops producing a `crew_renamed` row.** `computeIdentityLinkRenames` is gated on `acceptedShrinkThisVersion` (`lib/sync/runScheduledCronSync.ts:3541-3542`); `renamePairs` had no such gate. This is the R7 fix.
3. **A staged `independent` decision stops producing a `crew_renamed` row.** Same mechanism as (2).
4. **First-seen shows are unaffected.** `runManualStageForFirstSeen.ts:125` passes `[]`, and a first-seen show has no prior roster, so it produced no legitimate rename rows before and produces none now.
5. **A suppressed rename no longer appears in the capability notice**, so a `ROLE_FLAGS_NOTICE` that would have been raised solely by a phantom rename is not raised at all.
6. **Undo restores `selections_reset_at`.** A picker cookie invalidated before the undone change stays invalidated afterward.
7. **A Phase D wizard apply that changes a LEAD/FINANCIALS bit now raises the bell alert and the durable event**, matching the dashboard and cron paths.

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
- **Invariant 9 at every new Supabase call boundary.** The A1 rowcount read destructures `{ data, error }`, distinguishes returned-error from thrown-error, and surfaces infra faults as typed results — never a bare `continue`.

---

## 7. Testing

TDD per task (invariant 1). Each row names the concrete failure it catches — no test that only proves a function is called.

| Unit | Test | Failure caught |
|---|---|---|
| A | Hold-suppressed rename target (P2-F4 shape): assert **no** notice entry, **no** `crew_renamed` row, **and a `crew_removed` row for the prior name** | The current false-rename-plus-missing-removal pair. Asserting only the absent rename row would pass on a writer that dropped both. |
| A | `renameCrewMember` returns `false` on target collision and on missing source; the pair surfaces as `rename_no_op` | The second silent layer — a pair clearing all five guards can still no-op. Existing tests (`tests/sync/applyParseResult.identityLink.db.test.ts:64` and `tests/sync/applyParseResult.identityLink.db.test.ts:80`) assert DB state only and pass today. |
| A | Each of the five guards maps to its distinct `reason` | A collapsed union that reports every skip identically |
| A | An **accepted** rename that lands still produces its notice entry and `crew_renamed` row | Over-correction — the fix silencing legitimate renames |
| B | One unlanded pair emits exactly one event carrying `reason`; `{ ok: false }` escalates via `log.error` | Silent omission degrading into silent-everything |
| B | The code does not register in the §12.4 / internal-code-enum scans — mirrors `tests/messages/stripLogEmissionCalls.test.ts:123-138` | A forensic code leaking into the user-facing catalog |
| C | finalize-cas Phase D LEAD-bit change co-emits `LEAD_ROLE_APPLIED` + `ROLE_FLAGS_NOTICE`, **post-commit** — mirrors `tests/sync/applyStaged.test.ts:272-316` | The entry-1 drop |
| C | Emit ordering preserved: durable audit attempted before a throwing `upsertAdminAlert` — mirrors `tests/sync/applyStaged.test.ts:321-366` | Extraction silently reordering a load-bearing sequence |
| C | `_metaLeadRoleAppliedTopology` expects **one** site | A fourth emit site added off-helper |
| C | finalize-cas admin behavioral coverage still passes (`tests/log/adminOutcomeBehavior.test.ts`); route stays in `AUDITABLE_MUTATIONS` (`tests/log/_auditableMutations.ts:35`) | Invariant 10 regression on an admin mutation surface |
| D | **db test:** seed a crew member, stamp `selections_reset_at`, record a change, undo it, assert the column round-trips **and** that `resolvePickerSelection` still returns `selection_reset` for a cookie stamped before the reset | The security-adjacent revalidation. Asserting the column alone would miss a reader-side regression. |
| D | `undo-change-no-phantom-columns` reads the **live** migration and `REAL_CREW_COLUMNS` includes the column | The blind guard that let this land |
| D | `_holdsHelpers` seed + `readCrew` carry the column | Otherwise no D test can observe anything |

**Anti-tautology.** The Unit A assertions scope extraction to the change-log rows for the specific `entity_ref` under test, not to a container that renders both a rename and a removal. Expected values derive from the fixture's seeded names, never hardcoded. Boundary inputs exercised: empty `identityLinkRenames`, a pair where source and target are the same name, and a NULL `selections_reset_at` (which must remain NULL through an undo, not become a timestamp).

---

## 8. Documented limits

- **An unlanded rename is invisible to Doug in the product.** By R4 it lives only in `app_events`, reachable via `pnpm observe`. If operators later need it surfaced, that is a new scoped change with a §12.4 row and the impeccable dual-gate.
- **`renameCrewMember`'s `false` does not distinguish collision from missing source.** Both are a zero-row guarded update; separating them needs a second query, which is not worth a round-trip on the locked show transaction. Both report as `rename_no_op`.
- **The validation apply stays manual** until `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` is closed (§5.1).
- **`name_held` emits a forensic event for an ordinary hold.** A held name is an expected operator flow, not a fault, so some fraction of `IDENTITY_LINK_RENAME_UNLANDED` events describe the system working as designed. Accepted deliberately: `reason` is on the event, so a reader filters by it, and suppressing `name_held` at the emit site would mean the one query that answers "was this rename ever requested?" silently omits the most common answer. If event volume later proves a problem, filtering belongs in the read path (`pnpm observe`), not the write path.

---

## 9. Out of scope

- Closing `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (§5.1) — its own change.
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
