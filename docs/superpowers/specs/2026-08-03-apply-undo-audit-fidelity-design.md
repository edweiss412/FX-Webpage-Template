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
| R5 | **Both existing codes in Unit C are reused.** `ROLE_FLAGS_NOTICE` (`lib/messages/catalog.ts:886-901`, spec §12.4 row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2866`) and `LEAD_ROLE_APPLIED` already exist. Unit C adds callers, not a new code, so the §12.4 three-lockstep-update rule is not triggered by Unit C. | `lib/log/emitLeadRoleApplied.ts:21-23` |
| R6 | **NaN handling in the picker reset check is deliberate and unchanged.** `entry.t <= NaN` is false, so a corrupt marker fails open rather than forcing a spurious re-pick. Unit D restores the column; it does not touch the comparison. | `lib/auth/picker/resolvePickerSelection.ts:132-134` |
| R7 | **The feed's loss of rows for unaccepted/ungated renames is the fix, not a regression.** See §4 — it is a deliberate, enumerated behavior change. | Derives from R2: `lib/sync/applyParseResult.ts:117-121` requires `crew_renamed` to follow the applied list, and `lib/sync/changeLog/writeAutoApplyChanges.ts:78` does not |

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
  unlandedRenames: Array<{
    pair: IdentityLinkRename;
    reason: UnlandedRenameReason;
    // A3's suppression test, decided HERE because deleteKeepNames is local to this function
    // (lib/sync/applyParseResult.ts:153) and never leaves it. Without this field the consumer
    // cannot implement the survival test and would have to fall back to the reason proxy that
    // §2.1 A3 proves wrong.
    sourceSurvived: boolean;
  }>;
};
```

`UnlandedRenameReason` is a closed union with **five** members: the four REACHABLE `continue` guards in the loop at `lib/sync/applyParseResult.ts:175-186` (the loop has five guards, but one is unreachable — see the struck row), plus the newly observable A1 case.

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
              ∪  unlandedRenames where sourceSurvived
```

**`sourceSurvived` is computed in `applyParseResult`, not by the consumer.** `deleteKeepNames` is a local of that function (`lib/sync/applyParseResult.ts:153`) and is consumed there by `deleteCrewMembersNotIn` (`lib/sync/applyParseResult.ts:187`); it never crosses the return boundary, and a surviving protected row is by definition absent from `appliedCrewMembers`, so `phase2` has nothing to test against. The membership test therefore happens where the data lives and rides out on the outcome as a boolean.

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
  | **wizard per-row result** — `ShadowApplyResult` (`app/api/admin/onboarding/finalize-cas/route.ts:82-115`) | Unit C adds `roleFlagsNotice` here; Unit B must add its own field | `unlandedRenames` (stripped from the HTTP response with `roleFlagsNotice`, per §2.3) |
  | **first-seen manual result** (`lib/sync/runManualStageForFirstSeen.ts:170`) | returns `{ outcome, showId }` — carries neither | `unlandedRenames` |

  **One sink is reachable by a path that bypasses all of the above.** The pending-ingestion retry calls `runManualSyncForShowUnlocked`, which routes around `processOneFile`'s post-commit tail (`lib/sync/runManualSyncForShow.ts:287-288`, `app/api/admin/pending-ingestions/[id]/retry/route.ts:405-427`), and the route retains only `showId`/outcome telemetry. That path needs its own carrier and its own emit point; it is not covered by widening the four core hops. This is the same bypass that makes it a Unit C site.

  Each post-commit sink gets an **integration** assertion that the event fires end-to-end, not merely a unit test of the emitter in isolation. A unit test on the emitter proves nothing about whether the field survived the hops.
- **Cardinality: one event per unlanded pair per apply attempt.** No dedup, no coalescing — matching the precedent, which emits per capability change per apply (`lib/log/emitLeadRoleApplied.ts:52-68`). All five `reason` values emit, including `name_held`, which is an ordinary operator-initiated state rather than a fault.
- **Volume is NOT bounded by an accept gate.** `computeIdentityLinkRenames` gates only MI-13 and MI-14 on `acceptedThisVersion`; **MI-12 pairs are emitted unconditionally** (`lib/sync/identityLinkRenames.ts:20-23`), and `computeStagedIdentityLinkRenames` (`lib/sync/identityLinkRenames.ts:39-59`) has no accept gate at all. So a standing hold on an MI-12 pair DOES re-request, and therefore re-emit, on every pass until the hold clears. This is accepted — see §8 for why filtering belongs in the read path — but it must not be justified by a gate that does not cover the common case.

### 2.3 Unit C — one emit helper, every caller routed through it

**The filed entry named one instance of a four-instance class.** `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP` describes the finalize-cas discard. A sweep for the shape — *a path that obtains a real `roleFlagsNotice` and never emits it* — finds three more: the first-seen onboarding finalize, `runManualStageForFirstSeen` (which builds the notice and then returns a shape without it), and the pending-ingestion retry, which bypasses `processOneFile`'s post-commit tail entirely. All four are repaired here under the class-sweep disposition default; none qualifies for a deferral exception, since each is the same defect in code this PR is already touching.

**The helper already exists; this unit adopts it rather than creating one.** `emitDeferredRoleFlagsNotice` (`lib/sync/runScheduledCronSync.ts:2318-2331`) is already precisely the intended shape — same applied-and-notice-present guard, same `emitLeadRoleApplied` then `upsertAdminAlert` ordering, same rationale comment — and `lib/sync/applyStaged.ts:1993-2002` is a near-verbatim duplicate of it. The duplication this unit was written to prevent is therefore already present. The work is to **export it, relocate it to a shared module under `lib/sync/`, collapse the `applyStaged` copy into it, and route every discard site in the table below through it.**

One signature change: the existing function takes a `ProcessOneFileResult` envelope and re-derives the guard from it. finalize-cas's per-row result is a different shape (`ShadowApplyResult`), so the shared form takes the `roleFlagsNotice` directly and leaves the guard to each caller. Callers:

| Caller | Today | After |
|---|---|---|
| `lib/sync/runScheduledCronSync.ts:2318-2331` | **owns** `emitDeferredRoleFlagsNotice` (private) | exported + relocated; calls the shared form |
| `lib/sync/applyStaged.ts:1993-2002` | near-verbatim duplicate | calls the shared form |
| `app/api/admin/onboarding/finalize/route.ts:1266` | **discards** — calls `applyStagedCore`, zero `roleFlagsNotice` references in the file | out-of-band collection, emitted in the existing post-commit region (spelled out below) |
| `lib/sync/runManualStageForFirstSeen.ts:139` | **builds it, then drops it** — sets `applied.roleFlagsNotice` at `lib/sync/runManualStageForFirstSeen.ts:139` and returns `{ outcome, showId }` at `lib/sync/runManualStageForFirstSeen.ts:170` | carries it on the return; caller emits |
| `app/api/admin/pending-ingestions/[id]/retry/route.ts:405` | **bypasses the sink** — calls `runManualSyncForShowUnlocked`, which routes around `processOneFile`'s post-commit tail (`lib/sync/runManualSyncForShow.ts:287-288`) | emits at the route's own post-commit point |
| `app/api/admin/onboarding/finalize-cas/route.ts` | **discards `core.roleFlagsNotice`** (`app/api/admin/onboarding/finalize-cas/route.ts:619` returns without it) | surfaces it on the per-row result, caller emits post-commit |

The emit ordering (durable audit **before** the throwing `upsertAdminAlert`) moves into the helper unchanged — it is load-bearing per `applyStaged.ts:1995-1999`.

**finalize-cas plumbing.** `applyStagedCore` runs under `deps.withRowTx` → `defaultWithRowTx`'s `pg_advisory_xact_lock('show:'||$1)` (`app/api/admin/onboarding/finalize-cas/route.ts:167`), so the emit must happen after that lock resolves. It must ALSO happen after the outer transaction: `runFinalizeCas` runs inside `deps.withTx` (`app/api/admin/onboarding/finalize-cas/route.ts:1130`) holding `tryFinalizeLock` (`app/api/admin/onboarding/finalize-cas/route.ts:905`) and a `FOR UPDATE` session row (`app/api/admin/onboarding/finalize-cas/route.ts:911`) for its whole body. An earlier revision of this spec placed the emit beside the existing `logAdminOutcome({ code: "SHOW_FINALIZED", … })` call (`app/api/admin/onboarding/finalize-cas/route.ts:982-989`), which is post-**row**-commit but still inside that outer lock — not a valid invariant-10 point. finalize-cas therefore uses the same accumulator-plus-`finally`-flush described above for ordinary finalize.

The per-row result type `ShadowApplyResult` (`app/api/admin/onboarding/finalize-cas/route.ts:83-114`) still gains an optional `roleFlagsNotice` on its OK branch, set at the `app/api/admin/onboarding/finalize-cas/route.ts:619` return, since the row function already returns a private-then-stripped shape there; the accumulator is populated from it. **No new advisory lock is acquired** — invariant 2's single-holder rule is untouched.

**Ordinary finalize: carrier, trigger, and failure policy, all three named.** This route differs from finalize-cas in every one of them, so none can be inferred from that unit.

Two earlier revisions of this spec picked each of the two obvious triggers, and each is wrong on a different axis. Stating the constraint explicitly, because it is what makes the third design necessary:

| Trigger | Outside all locks? | Survives a later failure? |
|---|---|---|
| After each row's `withRowTx` | **No.** The row loop runs inside `runtime.withTx` (`app/api/admin/onboarding/finalize/route.ts:1408`), which holds `tryFinalizeLock` (`app/api/admin/onboarding/finalize/route.ts:1418`) and a `FOR UPDATE` session row (`app/api/admin/onboarding/finalize/route.ts:1421`) for its whole body. Violates invariant 10. | Yes |
| Inside the success path after `runtime.withTx` | Yes | **No.** A later row's failure or an outer-commit failure jumps to the catch and permanently skips a notice for a capability change that already committed independently. |

Neither horn is acceptable, so the trigger is **after** the outer transaction and **unconditional**:

- **Carrier — an internal envelope returned THROUGH `withRowTx`, so it crosses the commit boundary.** Two rejected mechanisms and why, since each looks right:
  - **Not `PerRowResult`.** It is serialized verbatim into the public `per_row` response (`app/api/admin/onboarding/finalize/route.ts:757-763`), so private payload would leak.
  - **Not a passed-in accumulator mutated inside the row function** — the shape `appliedShowIds` uses (declared at `app/api/admin/onboarding/finalize/route.ts:785`, mutated at `app/api/admin/onboarding/finalize/route.ts:1338`). `processApprovedRow` is module-scoped (`app/api/admin/onboarding/finalize/route.ts:767`), a sibling of `executeFinalizeBatch` (`app/api/admin/onboarding/finalize/route.ts:1370`), so there is no closure to capture — and, decisively, that mutation happens **inside** `sql.begin` (`app/api/admin/onboarding/finalize/route.ts:205-212`). A notice added there for a row whose commit then fails would be flushed anyway, emitting a **false audit event** for a capability change that never landed. An earlier revision of this spec specified exactly that and was wrong.

  The row callback instead returns an internal envelope — `{ publicResult: PerRowResult, roleFlagsNotice?, unlandedRenames? }` — and `runtime.withRowTx` resolves **only after `sql.begin` resolves**, i.e. only after the row committed. At the call site (`app/api/admin/onboarding/finalize/route.ts:1507`) the envelope is destructured: `publicResult` goes to `perRow`, the private fields go to the route-scope accumulator. Nothing private touches the public type, and nothing enters the accumulator for a row that did not commit.
- **Trigger — a `finally` after the outer `withTx`, not a success-path statement.** The flush runs whether `runtime.withTx` resolves or rejects, so a row that committed in its own independent transaction (`defaultWithRowTx` opens its own connection and `sql.begin`, `app/api/admin/onboarding/finalize/route.ts:199-205`) always has its notice emitted. This is the only placement that is simultaneously outside every lock and unskippable.
- **Failure policy — fail-open.** `upsertAdminAlert` throws; a throw from the flush must not replace the route's real outcome, and must not mask an in-flight outer error. The flush is wrapped and escalates via `log.error` rather than propagating.

**finalize-cas takes the same treatment for the same reason — in BOTH of its handlers.** Its per-row loop is likewise inside `deps.withTx` → `runFinalizeCas` holding `tryFinalizeLock` (`app/api/admin/onboarding/finalize-cas/route.ts:905`) and a `FOR UPDATE` session row (`app/api/admin/onboarding/finalize-cas/route.ts:911`), so the post-`withRowTx` point named earlier in this section is inside that lock too.

**The route has two handlers, and the streaming one is the production path.** `POST` dispatches to `handleOnboardingFinalizeCasStream` whenever the request's `Accept` header includes `FINALIZE_STREAM_CONTENT_TYPE` (`app/api/admin/onboarding/finalize-cas/route.ts:1273-1274`), and the admin finalize button sends exactly that header — so the streaming handler serves real operator traffic while the non-streaming one is the fallback. The streaming handler owns its **own** outer `deps.withTx` (`app/api/admin/onboarding/finalize-cas/route.ts:1207`) and its **own** `finally` (`app/api/admin/onboarding/finalize-cas/route.ts:1232`), distinct from the non-streaming pair at `app/api/admin/onboarding/finalize-cas/route.ts:1130` and `app/api/admin/onboarding/finalize-cas/route.ts:1149`. Wiring only the non-streaming handler — which an earlier revision of this spec did by citing only the non-streaming handler — would leave the path real operators actually use completely dark, for both Unit B and Unit C.

So: **three** accumulator-and-flush sites, not two — ordinary finalize, non-streaming finalize-cas, and streaming finalize-cas — each flushing in the `finally` of its own outer transaction. §7's "both finalize routes" rows mean all three handlers; the durability and lock-ordering tests run against the **streaming** finalize-cas handler as well, since it is the one in production use.

**The new field must be stripped from the HTTP response.** The caller currently destructures only `showId` off the per-row result before building `responseRow`, so an added `roleFlagsNotice` would ride into `per_row` and become part of the route's public response — leaking an internal payload (crew names and capability flags) and breaking the stated stable response contract (`app/api/admin/onboarding/finalize-cas/route.ts:82-94`, `app/api/admin/onboarding/finalize-cas/route.ts:980-994`). The destructure widens to drop it alongside `showId`, and §7 carries a response-shape assertion — the emission and failure tests do not cover this.

**`upsertAdminAlert` throws, and the finalize-cas loop is fail-open — the helper must not import a throw into it.** Every existing emit in `runFinalizeCas`'s per-row loop is deliberately non-throwing: the `log.warn`/`log.error` calls are wrapped (`app/api/admin/onboarding/finalize-cas/route.ts:1009-1017`), and `app/api/admin/onboarding/finalize-cas/route.ts:1023-1024` records that `logAdminOutcome` "never throws (fail-open internally)", needing no try/catch. That loop runs inside the outer `deps.withTx`, so a throw escaping it would abort the transaction **after** per-row shows already committed durably, skipping `deleteShadowRows`, `publishAppliedWizardShows` (`app/api/admin/onboarding/finalize-cas/route.ts:1059-1064`) and `markFinalCasDone` (`app/api/admin/onboarding/finalize-cas/route.ts:1094`).

Therefore the finalize-cas call site wraps the helper and escalates on failure rather than propagating, matching the loop's established posture. The **ordering inside** the helper is unchanged (durable audit before the alert upsert), so a thrown `upsertAdminAlert` still cannot skip the durable record — it is caught one level up, after the audit has already been attempted. `applyStaged` and `runScheduledCronSync` keep their current propagating behavior; the helper does not impose a failure policy on its callers. A test pins that a throwing `upsertAdminAlert` in the finalize-cas path leaves `markFinalCasDone` reached.

**The topology pin gets stronger — narrowly, and not in the way that would have caught this bug.** `tests/sync/_metaLeadRoleAppliedTopology.test.ts:29` matches `upsertAdminAlert(<expr>roleFlagsNotice` and `tests/sync/_metaLeadRoleAppliedTopology.test.ts:35-38` asserts exactly two files under `lib/sync`. With the helper owning the only such call, the expected site list becomes **one** file.

Stated precisely, because the obvious claim is wrong: this pin detects an emit site that *upserts the alert without the durable event*. It has never been able to detect a caller that **discards `roleFlagsNotice` entirely** — which is exactly the shape of `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP`. Consolidation does not change that, and §7's "expects one site" assertion would still pass if a fifth caller dropped the notice. The genuine gains are narrower: one implementation of the load-bearing emit order instead of three copies to drift, and no `app/`-side emit for a `lib/sync`-only walker to miss. **Detecting a dropped notice needs a different guard, and this branch does NOT ship one** — it is descoped and refiled as `BL-ROLEFLAGSNOTICE-DROP-GUARD`. See §9 for why, and §7 for what ships in its place (per-site behavioral tests on all four instances).

### 2.4 Unit D — `selections_reset_at` survives an undo

Five places drop or fail to deploy the column; all five are repaired (D1-D5).

| # | Site | Change |
|---|---|---|
| D1 | `crewImage` — `lib/sync/changeLog/writeAutoApplyChanges.ts:53-66`, 10 keys | add `selections_reset_at` → 11 keys. Already available on the source type (`lib/sync/applyParseResult.ts:17`) |
| D2 | `undo_change` Direction A INSERT column list — `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:175-179` (12 columns) and the values list `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:181-188` | add the column, cast `(v_before->>'selections_reset_at')::timestamptz` |
| D3 | the same function's `ON CONFLICT (show_id, name) DO UPDATE SET` list — `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:189-198` | `selections_reset_at = greatest(crew_members.selections_reset_at, excluded.selections_reset_at)` — **not** a bare `excluded.` assignment |
| D4 | the successor `select … for update` — `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:151-153` | also capture `selections_reset_at` into a new local, and feed the INSERT `greatest((v_before->>'selections_reset_at')::timestamptz, v_succ_reset)` |
| D5 | `mi11_approve_hold` — defined at `supabase/migrations/20260608000002_mi11_gate_rpcs.sql:217`. **Two sites inside it**: the `before_image` builder (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:336`) AND the rename successor INSERT (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:416-417`), whose column list also omits the field | add `selections_reset_at` to **both**, carrying the prior row's value onto the successor. Fixing only the builder still loses the marker on every future MI-11 rename, since the successor is written without it. **Ships as a `CREATE OR REPLACE FUNCTION public.mi11_approve_hold` in the NEW migration**, NOT as an edit to `20260608000002` — see below |

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

**The new migration replaces TWO functions, not one.** `20260608000002` is already applied everywhere — both `mi11_approve_hold` and `undo_change` are live in the local DB — so editing that file in place changes nothing on any deployed database; the runner will not re-run it. D5 therefore ships as a second `CREATE OR REPLACE FUNCTION public.mi11_approve_hold(...)` inside the SAME new migration as D2/D3/D4, carrying the full current body with `selections_reset_at` added to its `jsonb_build_object` at `supabase/migrations/20260608000002_mi11_gate_rpcs.sql:336`. The §5.1 surgical-apply step covers **both** replaced functions; anywhere this spec names only `undo_change` it is scoped to D2/D3/D4 and does not narrow D5.

**Historical `before_image` rows cast cleanly — which is a statement about types, not about safety.** Rows written before D1 have no `selections_reset_at` key. The new INSERT reads it as `(v_before->>'selections_reset_at')::timestamptz`, and an absent jsonb key yields SQL NULL, which casts to a NULL `timestamptz` without error:

```
$ psql -c "select (('{\"name\":\"A\"}'::jsonb)->>'selections_reset_at')::timestamptz as absent, ..."
 absent_key_yields_null | cast_type                | absent_cast_value | explicit_null_cast | roundtrip
 t                      | timestamp with time zone |                   |                    | 2026-08-03 01:02:03+00
```

No backfill is required and none is proposed, but the NULL is **not** benign on its own: restoring it over a live invalidation is the very revalidation this unit prevents. D4 is what makes historical rename rows safe, by falling through to the captured successor marker. A historical **`crew_removed`** row is the one case D4 cannot rescue — there is no successor to capture from and the deleted row's marker is genuinely gone. That is a real residual limit, recorded in §8 rather than papered over.

**The guard that should have caught this is aimed at a dead file.** `tests/db/undo-change-no-phantom-columns.test.ts:19` reads `20260608000003_undo_change_rpc.sql`, superseded by `20260719000001`. Its `REAL_CREW_COLUMNS` set (`tests/db/undo-change-no-phantom-columns.test.ts:22-34`) also omits `selections_reset_at`, and the test only asserts that named columns are real plus that a required subset is present — nothing forbids an omission. Repointing it at the live migration and adding the column is in scope: repairing the drop without repairing its blind guard queues the next drop.

**Test helpers cannot currently observe the column.** `tests/db/_holdsHelpers.ts` omits it from `CrewSeed` (`tests/db/_holdsHelpers.ts:62-71`), from the seed INSERT (`tests/db/_holdsHelpers.ts:92-97`), and from `readCrew`'s select (`tests/db/_holdsHelpers.ts:275`). All three need it before any assertion is possible.

### 2.5 Unit E — the lock-topology guards must follow the shipped body

Invariant 2 is a P0, and its structural guard is currently pinned to superseded files. `undo_change` ships from `20260719000001_undo_change_lifecycle_guard.sql`, but every PF11 guard inspects `20260608000003_undo_change_rpc.sql`:

| Guard | Inspects | Ships from |
|---|---|---|
| `tests/auth/advisoryLockRpcDeadlock.test.ts:46` | `20260608000003_undo_change_rpc.sql` | `20260719000001` |
| `tests/auth/advisoryLockRpcDeadlock.test.ts:43` | `20260608000002_mi11_gate_rpcs.sql` | `20260608000002` today, **the new migration after D5** |
| `tests/auth/advisoryLockRpcDeadlock.test.ts:245` | `20260608000003_undo_change_rpc.sql` | `20260719000001` |
| `tests/auth/advisoryLockRpcDeadlock.test.ts:244` | `20260608000002_mi11_gate_rpcs.sql` | as above |
| `tests/db/undo-change-lock-order.test.ts:15` | `20260608000003_undo_change_rpc.sql` | `20260719000001` |

**There are TWO stale lists in that file, not one** — a second PF11 migration list at `tests/auth/advisoryLockRpcDeadlock.test.ts:244-245` repeats both pins. Repairing only the first leaves the guard half-blind.

So the advisory-before-row-lock topology of the bodies that actually run has been unverified since `20260719000001` landed, and D5 would extend the same blind spot to `mi11_approve_hold`.

**The fix is already written in the same file.** The `reset_validation_data` entry is derived rather than hardcoded, with the reason stated inline at `tests/auth/advisoryLockRpcDeadlock.test.ts:47-50`: "Derived (not hardcoded) so the SHIPPED defining migration is scanned even after a future `create or replace` supersedes the current one." Unit E applies that existing pattern to the two entries above it and to `tests/db/undo-change-lock-order.test.ts:15` — resolve the defining migration by scanning for the last `create or replace function public.<name>` across `supabase/migrations/`, rather than naming a file.

**Two mechanical hazards make the naive repointing WORSE than the status quo, and both must be handled:**

1. **Body-delimiter mismatch — a repointed scanner would silently find nothing.** The existing scanners extract function bodies delimited by `$$`, but the shipped `undo_change` is emitted with `$function$` (`supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:11`, closing at `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:227`). Pointing the current scanner at `20260719000001` yields **zero** discovered functions, so every PF11 assertion would vacuously pass on an unscanned body — strictly worse than today's stale-but-scanning pin. The extractor must accept both `$$` and `$function$` (and any `$tag$` form), and Unit E carries a **self-check that the resolved body set is non-empty**, so a future delimiter change fails loudly instead of silently.
2. **Resolution must UNION, not replace.** `mi11_reject_hold` is defined **only** in `20260608000002_mi11_gate_rpcs.sql` — the new migration replaces `mi11_approve_hold` alone. Swapping the file entry for the new migration would stop discovering `mi11_reject_hold` entirely. Resolution is therefore per-FUNCTION (for each lock-taking function name, scan its LAST defining migration), not per-file, and the guard asserts the discovered function-name set still contains every name it contained before.

This is in scope rather than deferred because D2-D5 are what make it acute: this branch ships a migration that supersedes **two** lock-taking bodies, and shipping it while the guards read the old files would leave a P0 invariant unverified precisely where it changed. Scoped to repointing existing guards and hardening their extractor; no new assertion semantics.

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
                    └──────────────────────────────────────────▶ unlandedRenames[{pair,reason,sourceSurvived}]
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
4. **A staged `independent` decision is NOT affected** — correcting an earlier revision of this list, which claimed it as a change. `independent` is already excluded upstream of the feed (`lib/sync/applyStagedCore.ts:227-231` returns `false` for it, and `choiceAwareFeedItems` yields `[]`), so it contributes no rename input today and none after. Listed explicitly because the neighbouring cron cases DO change and the symmetry is misleading.
5. **First-seen shows are unaffected.** `runManualStageForFirstSeen.ts:125` passes `[]`, and a first-seen show has no prior roster, so it produced no legitimate rename rows before and produces none now.
6. **A suppressed rename no longer appears in the capability notice**, so a `ROLE_FLAGS_NOTICE` that would have been raised solely by a phantom rename is not raised at all.
7. **Undo restores `selections_reset_at`.** A picker cookie invalidated before the undone change stays invalidated afterward.
8. **Three more paths now raise the bell alert and the durable event on a LEAD/FINANCIALS change**, matching the dashboard and cron paths: the Phase D wizard apply (finalize-cas), the ordinary onboarding finalize, and the pending-ingestion retry. All three are operator-visible additions — an alert appears where none did before. This is the whole of Unit C's user-facing effect.
9. **A capability loss that is silently suppressed today now reports.** When a rename's target is hold-suppressed (P2-F4) or the update no-ops, the source row is not delete-protected, so `deleteCrewMembersNotIn` removes it and a LEAD/FINANCIALS capability genuinely disappears. Today `renamedAway` holds the requested `removedName` and suppresses arm (c), so no loss notice fires. Under §2.1 A3 it fires. This is a **new** `ROLE_FLAGS_NOTICE` in a case that previously produced none — an addition to the operator's bell, not a removal, and the opposite direction from items 1–5.
10. **Pairs whose source row SURVIVED continue to produce no loss notice.** Membership in `deleteKeepNames` (`lib/sync/applyParseResult.ts:152`) is the test, so §2.1 A3 keeps them in `renamedAway`. Called out because a naive reading of item 9 would predict otherwise. Note this is narrower than "held": a `name_held` pair whose hold kind did not delete-protect it falls under item 9, not here.

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
| A | Each of the four REACHABLE guards maps to its distinct `reason` (the fifth union member is `rename_no_op`) | A collapsed union that reports every skip identically. Deliberately does NOT assert `source_delete_protected` — §2.1 establishes it is unreachable, so a test for it would have to mock an impossible planner state. |
| A | An **accepted** rename that lands still produces its notice entry and `crew_renamed` row | Over-correction — the fix silencing legitimate renames |
| A | `field_changed` attribution follows landed pairs: an unlanded pair emits no `field_changed` row mapped through the prior name | §4 item 2. The rename/add/remove assertions all pass while this row is still mis-attributed. |
| B | One unlanded pair emits exactly one event carrying `reason`; `{ ok: false }` escalates via `log.error` | Silent omission degrading into silent-everything |
| B | **Integration, once per sink — all FOUR**: cron/manual, dashboard staged, finalize-cas, **and pending-ingestion retry** | A dropped propagation hop. R4 makes this the only signal, so a lost field is fully dark, and an emitter unit test passes with every hop broken. The retry sink is listed explicitly because it reaches a post-commit point without crossing any core hop (§2.2), so the other three passing says nothing about it — and Unit C's retry test exercises `ROLE_FLAGS_NOTICE`, a different signal, so it does not cover this either. |
| B | The code does not register in the §12.4 / internal-code-enum scans — mirrors `tests/messages/stripLogEmissionCalls.test.ts:123-138` | A forensic code leaking into the user-facing catalog |
| C | finalize-cas Phase D LEAD-bit change co-emits `LEAD_ROLE_APPLIED` + `ROLE_FLAGS_NOTICE`, **post-commit** — mirrors `tests/sync/applyStaged.test.ts:272-316` | The entry-1 drop |
| C | Emit ordering preserved: durable audit attempted before a throwing `upsertAdminAlert` — mirrors `tests/sync/applyStaged.test.ts:321-366` | Extraction silently reordering a load-bearing sequence |
| C | `_metaLeadRoleAppliedTopology` expects **one** site | A new emit site added off-helper, duplicating the ordering contract instead of calling the shared form |
| C | finalize-cas admin behavioral coverage still passes (`tests/log/adminOutcomeBehavior.test.ts`); route stays in `AUDITABLE_MUTATIONS` (`tests/log/_auditableMutations.ts:35`) | Invariant 10 regression on an admin mutation surface |
| C | A throwing `upsertAdminAlert` on the finalize-cas path still reaches `markFinalCasDone` | Importing a throw into a fail-open loop and aborting the outer tx post-commit |
| C | **Response shape:** `per_row` contains no `roleFlagsNotice` and no `unlandedRenames` key | Leaking crew names and capability flags into the public API response |
| C | **One test per discard site**, each asserting a LEAD-bit change reaches the bell + durable event. Asserted **at the emitting layer, not inside the locked callee**: first-seen finalize (`app/api/admin/onboarding/finalize/route.ts:1266`) emits itself; `runManualStageForFirstSeen` is asserted to CARRY the notice on its return (`lib/sync/runManualStageForFirstSeen.ts:170`) while its caller, the pending-ingestion retry route, is asserted to emit post-commit after `withRowTryLock` resolves (`app/api/admin/pending-ingestions/[id]/retry/route.ts:468`) | The three sites the filed entry did not name. A test covering only finalize-cas passes with all three dark. **The carry/emit split is deliberate:** `runManualStageForFirstSeen` runs INSIDE `withRowTryLock` (`app/api/admin/pending-ingestions/[id]/retry/route.ts:370`, `app/api/admin/pending-ingestions/[id]/retry/route.ts:455`), so asserting it co-emits would demand an emit inside the lock and contradict invariant 10. |
| C | **Durability, both finalize routes:** row 1 commits with a LEAD-bit change, then a LATER row throws (and separately, the outer commit fails) — assert the first row's `ROLE_FLAGS_NOTICE` and `LEAD_ROLE_APPLIED` are still emitted | **The `finally` flush is the whole point of §2.3's trigger, and nothing else tests it.** The rejected success-path placement satisfies every other Unit C test. Note the existing regression at `tests/onboarding/finalize.test.ts:864` does NOT cover this — it asserts `SHOW_FINALIZED` is *not* emitted on outer-commit failure and never observes either capability code. |
| C | Neither finalize route emits while `tryFinalizeLock` is held — assert emission happens only after the outer transaction resolves | Invariant 10 on the outer lock. Both rejected placements pass a "does it emit" test; only an ordering assertion separates them. |
| C | **DESCOPED — no structural guard ships in this branch.** See §9. The four instance-level repairs and their per-site tests above are the whole of Unit C's coverage. | — |
| D | **db test:** seed a crew member, stamp `selections_reset_at`, record a change, undo it, assert the column round-trips **and** that `resolvePickerSelection` still returns `selection_reset` for a cookie stamped before the reset | The security-adjacent revalidation. Asserting the column alone would miss a reader-side regression. |
| D | **db test on the CLEAN-INSERT path (the reachable one):** rename, stamp a reset on the successor, undo, assert the marker survives | **The D3-only failure.** This is the common path; a `greatest()` that lives solely in the ON CONFLICT branch fails here while every other D test passes. |
| D | **db test driving the ON CONFLICT branch:** a live row whose `selections_reset_at` is NEWER than `before_image`'s keeps the newer value through an undo | D3 written as a bare `excluded.` assignment |
| D | **historical-row test:** a `before_image` with no `selections_reset_at` key, undone against a successor carrying one, keeps the successor's | D4's fall-through. Pins that old rows are rescued by capture rather than by backfill. |
| D | `mi11_approve_hold`'s `before_image` carries `selections_reset_at`, and an undo of an MI-11-applied removal round-trips it | D5's builder half. The second producer — invisible to any test that only exercises `crewImage`. |
| D | **MI-11 RENAME, no post-rename stamp:** seed a crew member with `selections_reset_at` set, approve an MI-11 rename hold, then assert the SUCCESSOR row still carries the original marker | D5's successor-INSERT half, which a builder-only implementation would skip. Deliberately does **not** stamp the successor after the rename — the clean-INSERT test at the row above does, and that stamp masks the omission because D4 then captures it. Without this row, every named test passes while a live MI-11 rename silently clears an existing reset marker. |
| D | The new migration's `mi11_approve_hold` body is asserted against the **live** `pg_proc.prosrc`, not against a migration file | D5 shipped as an edit to the already-applied `20260608000002`, which never reaches a deployed database. A file-reading test passes on a change that was never deployed. |
| D | `undo-change-no-phantom-columns` reads the **live** migration and `REAL_CREW_COLUMNS` includes the column | The blind guard that let this land |
| D | `_holdsHelpers` seed + `readCrew` carry the column | Otherwise no D test can observe anything |

**Anti-tautology.** The Unit A assertions scope extraction to the change-log rows for the specific `entity_ref` under test, not to a container that renders both a rename and a removal. Expected values derive from the fixture's seeded names, never hardcoded. Boundary inputs exercised: empty `identityLinkRenames`, a pair where source and target are the same name, and a NULL `selections_reset_at` (which must remain NULL through an undo, not become a timestamp).

---

## 8. Documented limits

- **An unlanded rename is invisible to Doug in the product.** By R4 it lives only in `app_events`, reachable via `pnpm observe`. If operators later need it surfaced, that is a new scoped change with a §12.4 row and the impeccable dual-gate.
- **`renameCrewMember`'s `false` does not distinguish collision from missing source.** Both are a zero-row guarded update; separating them needs a second query, which is not worth a round-trip on the locked show transaction. Both report as `rename_no_op`.
- **The validation apply stays manual** until `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` is closed (§5.1).
- **Two historical shapes can still revalidate a cookie; D4 rescues neither.** D4 works by falling through to the live successor's marker, so it only helps when a successor row carries one.
  1. **A historical `crew_removed`** has no successor at all — the deleted row's marker is gone and the pre-D1 `before_image` never carried it.
  2. **A historical MI-11 rename** (applied before D5) is worse than it looks: `mi11_approve_hold` omits `selections_reset_at` from **both** its `before_image` builder (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:336`) **and** the fresh successor INSERT it writes (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:416-417`). So both of D4's inputs are NULL, `greatest(NULL, NULL)` is NULL, and the undo silently revalidates. An earlier revision of this limit named only removals and was wrong to.

  Both are bounded to rows written **before** this change; everything written after carries the value on at least one side. Neither is backfillable — the information no longer exists anywhere. Stated rather than hidden, per the preparedness posture.
- **`name_held` emits a forensic event for an ordinary hold.** A held name is an expected operator flow, not a fault, so some fraction of `IDENTITY_LINK_RENAME_UNLANDED` events describe the system working as designed. Accepted deliberately: `reason` is on the event, so a reader filters by it, and suppressing `name_held` at the emit site would mean the one query that answers "was this rename ever requested?" silently omits the most common answer. If event volume later proves a problem, filtering belongs in the read path (`pnpm observe`), not the write path.

---

## 9. Out of scope

- Closing `BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED` (§5.1) — its own change.
Both deferrals below name their exception under the class-sweep disposition rule (AGENTS.md, "Class-sweep before patching adversarial findings"), which makes same-PR repair of every instance the default and requires a deferred peer to cite (a) an unsettled product/design decision, (b) a ratified scope fence, or (c) a redesign of an untouched surface / scope-blowing breadth. "Same defect, different file" is explicitly not sufficient.

- **The structural dropped-notice guard — DESCOPED, refiled.** This vector produced a finding in four consecutive adversarial rounds: missing sites, then an in-scope/deferred contradiction, then keyed on the wrong producer family, then discovery roots that cannot see the one known bypass. Under this project's three-round cap on a recurring design vector, the exit is to descope rather than refine the wording a fifth time.

  The substance behind the cap: `roleFlagsNotice` reaches a sink through import aliases and dependency-injection seams (`lib/sync/runManualSyncForShow.ts:13`, `lib/sync/runManualSyncForShow.ts:287-288`), and the one known bypassing caller — the pending-ingestion retry route — is not itself a `runPhase2` or `processOneFile_unlocked` consumer. A guard keyed on direct consumers would approve `runManualSyncForShow_unlocked` for faithfully preserving the envelope while staying blind to the route that drops it. Catching that needs recursive carrier tracking through those seams to terminal sinks, plus exemption syntax and a registry — a static-analysis surface with its own design, not a bullet in this spec.

  **What ships instead:** all four instance-level repairs, each with its own behavioral test (§7). Those close every known occurrence. The guard is refiled as `BL-ROLEFLAGSNOTICE-DROP-GUARD` under class-sweep exception (c) — a redesign of a surface this PR does not otherwise touch — with the carrier-tracking requirement recorded so the next attempt starts from the real problem instead of rediscovering it.
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
| 2 — per-show advisory lock | **No new holder.** Unit C emits after `app/api/admin/onboarding/finalize-cas/route.ts:167`'s `pg_advisory_xact_lock` resolves, and after `withRowTryLock` resolves on the retry path. **Unit E restores verification of this invariant** — its PF11 guards currently inspect superseded migration bodies (§2.5), so the topology of the code that actually ships is unchecked. |
| 8 — impeccable dual-gate | **N/A — no UI surface** (R4). `impeccable-gate: N/A — no UI surface` |
| 9 — Supabase call-boundary | A1's rowcount read (§6) |
| 10 — mutation-surface observability | Unit C adds a code-carrying emit to an already-registered admin surface; Unit B adds a post-commit forensic emit outside the lock |
| 11 — isolated worktree | `../FX-worktrees/apply-undo-audit-fidelity` |
| 12 — ledger in-flight declaration | All three entries marked `**Status:** IN PROGRESS · **Branch:** fix/apply-undo-audit-fidelity` |
