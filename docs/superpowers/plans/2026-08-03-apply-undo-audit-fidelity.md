# Apply/Undo Audit Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the system recording crew changes it did not perform, and stop an undo of those false records from restoring a wrong roster state.

**Architecture:** Five units against one spec. **A** makes `applyParseResult` report which identity-link renames actually landed and routes both the capability notice and the change-log feed off that single source instead of the raw request. **B** records an unlanded pair as a forensic `app_event` only. **C** adopts the existing `emitDeferredRoleFlagsNotice` helper and repairs four paths that obtain a `roleFlagsNotice` and emit nothing. **D** carries `selections_reset_at` through `before_image` and the `undo_change` restore so an undo cannot revalidate a deliberately invalidated picker cookie. **E** repoints the PF11 lock-topology guards, which currently inspect superseded migration bodies.

**Tech Stack:** Next.js 16, TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Supabase/Postgres, postgres.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-apply-undo-audit-fidelity-design.md` — APPROVED at cross-model review round 10. The spec is canonical; where this plan and the spec disagree, the spec wins and you should open a question rather than silently reconcile.

---

## Global Constraints

- **TDD per task** (invariant 1). Failing test → minimal implementation → passing test → commit. Never write implementation before the test that exercises it.
- **Commit per task** (invariant 6), conventional-commits style. Scopes in use here: `sync`, `db`, `auth`, `log`. Do not batch tasks into one commit.
- **No new advisory-lock holder** (invariant 2). See "Advisory-lock holder topology" below.
- **Emits are POST-COMMIT and outside every lock** (invariant 10). The spec's §2.3 table is the authority on which placements satisfy this; two obvious ones do not.
- **Supabase call-boundary discipline** (invariant 9) applies to genuine Supabase client calls. It does **not** apply to Task 1 — that path is postgres.js `unsafe`, which has no `{ data, error }` channel (spec §6).
- **`impeccable-gate: N/A — no UI surface.`** No file under `app/` except `app/api/**`, none under `components/`, no `globals.css`, no `DESIGN.md`. §4 items 2 and 3 note operator-visible text changes, but those come from corrected data, not from any component edit.
- **Secrets are never logged.** Unit B's event carries crew names and flag tokens only — no email, phone, or token.
- **Prettier + `pnpm spec:lint`** clean before every commit that touches docs.

---

## Meta-test inventory (mandatory declaration)

**Creates (structural meta-tests):** none.

**Extends:**

| Meta-test | Unit | Change |
|---|---|---|
| `tests/sync/_metaLeadRoleAppliedTopology.test.ts` | C | Expected emission-site list shrinks from two files to one (the shared helper) |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | E | Two stale migration lists → per-function derived resolution; dollar-tag-tolerant body extractor; non-empty self-check |
| `tests/db/undo-change-lock-order.test.ts` | E | Same derived resolution for `undo_change` |
| `tests/db/undo-change-no-phantom-columns.test.ts` | D | Repointed at the live migration; `selections_reset_at` added to `REAL_CREW_COLUMNS` |
**Verify only** (listed separately because no change is expected): `tests/log/_metaMutationSurfaceObservability.test.ts` — Unit C adds emits to admin surfaces already in `AUDITABLE_MUTATIONS`. Confirm no new registry row is required and the meta-test still passes; if it demands a row, add it in Task 11.

**New test files:** exactly one — tests/log/emitIdentityLinkRenameUnlanded.test.ts (new, Task 6), an ordinary unit test rather than a structural meta-test. Every other test extends an existing file. `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`) collects everything under `tests/`, so **no `testMatch` or workflow path-filter wiring is required by this plan** — for that file or any other.

---

## Advisory-lock holder topology (mandatory — this plan touches `pg_advisory*`)

| Hashkey | Existing holders | This plan's holder |
|---|---|---|
| `show:<drive_file_id>` (undo path) | `undo_change` acquires it **in-RPC**; `_undo_tombstone` runs inside that lock and never re-takes it | **Unchanged.** Task 8's migration is a `CREATE OR REPLACE` that preserves the lock acquisition and the `ROW_COUNT` fail-safe verbatim; only column lists change. |
| `show:<drive_file_id>` (MI-11 path) | `mi11_approve_hold` acquires it **in-RPC** | **Unchanged**, same reasoning (Task 9). |
| `show:<drive_file_id>` (wizard finalize-cas per-row) | `defaultWithRowTx` JS-side (`app/api/admin/onboarding/finalize-cas/route.ts:167`) | **Unchanged.** Unit C acquires nothing; it moves emits to *after* this releases. |
| `show:<drive_file_id>` (wizard finalize-cas outer publish loop) | JS-side (`app/api/admin/onboarding/finalize-cas/route.ts:665`) | **Unchanged.** No emit is placed inside it. |
| `show:<drive_file_id>` (ordinary finalize per-row) | `defaultWithRowTx` JS-side (`app/api/admin/onboarding/finalize/route.ts:208`) | **Unchanged.** Task 11's flush runs after the OUTER transaction, so strictly after this. |
| `show:<drive_file_id>` (staged apply) | `withPipelineLock` → `withPostgresSyncPipelineLock` (`lib/sync/applyStaged.ts:1824` and `lib/sync/applyStaged.ts:1870`) | **Unchanged.** Unit C's shared helper is called after it resolves, exactly where the inline emit sits today. |
| `show:<drive_file_id>` (cron/manual) | `withPostgresSyncPipelineLock` (`lib/sync/runScheduledCronSync.ts:2712` and `lib/sync/runScheduledCronSync.ts:2732`) | **Unchanged.** `emitDeferredRoleFlagsNotice` already runs post-lock; relocating the function does not move the call. |
| `show:<drive_file_id>` (pending-ingestion retry) | `withPostgresSyncPipelineLock(..., { tryOnly: true })` (`app/api/admin/pending-ingestions/[id]/retry/route.ts:117`); row-level `pg_try_advisory_xact_lock` in `lib/sync/lockedShowTx.ts:59` | **Unchanged.** Tasks 7 and 12 emit after `withRowTryLock` resolves. |
| `finalize:<session>` | `tryFinalizeLock` inside the outer `withTx` on ordinary finalize AND both finalize-cas handlers | **Unchanged.** Unit C's flush is in the `finally` after that transaction — this is the lock that makes the per-row placement invalid. |

**No layer gains or loses a holder, on any hashkey.** Unit C adds zero lock acquisitions; every new emit is placed strictly after an existing holder releases. Tasks 8 and 9 replace two in-RPC holders via `CREATE OR REPLACE` while preserving their acquisitions verbatim. The single-holder rule is untouched throughout.

Unit E repairs the guards that *pin* this topology — they have been reading superseded bodies, so the shipped topology is currently unverified. That is why Task 13 is in scope rather than deferred.

---

## File Structure

**Modify:**

| File | Responsibility after this plan |
|---|---|
| `lib/sync/applyParseResult.ts` | Reports `landedRenames` / `unlandedRenames[{pair, reason, sourceSurvived}]` alongside `appliedCrewMembers`; owns the `sourceSurvived` decision because `deleteKeepNames` is local to it |
| `lib/sync/runScheduledCronSync.ts` | `renameCrewMember` returns a rowcount boolean; `emitDeferredRoleFlagsNotice` is exported and relocated |
| `lib/sync/phase2.ts` | Threads landed/unlanded through; notice arm (a) takes landed, arm (c) takes landed ∪ survived; passes landed pairs to the feed writer |
| `lib/sync/changeLog/writeAutoApplyChanges.ts` | Consumes landed pairs; `crewImage` gains `selections_reset_at`; `renamePairs` deleted |
| lib/log/emitIdentityLinkRenameUnlanded.ts (new) | **New.** Forensic-only emitter on the `emitLeadRoleApplied` pattern |
| lib/sync/emitRoleFlagsNotice.ts (new) | **New.** The relocated shared emit helper (audit before alert, ordering preserved) |
| `app/api/admin/onboarding/finalize-cas/route.ts` | Surfaces the notice on its per-row envelope; accumulator + `finally` flush in BOTH handlers |
| `app/api/admin/onboarding/finalize/route.ts` | Same, via an internal envelope returned through `withRowTx` |
| `app/api/admin/pending-ingestions/[id]/retry/route.ts` | Emits post-commit after `withRowTryLock` resolves |
| `lib/sync/runManualStageForFirstSeen.ts` | Carries the notice on its return instead of dropping it |
| supabase/migrations/<new>.sql (new) | **New.** Replaces `undo_change` AND `mi11_approve_hold` |

---

## Task order and why

Tasks 1–5 (Unit A) are the spine: nothing downstream is testable until the outcome type carries landed/unlanded. Unit B (6–7) needs A's data. Unit D (8–10) is independent of A/B/C and could run in parallel, but is sequenced after so the migration lands against a settled `crewImage`. Unit C (11-12) is last among the features because its four sites are the widest blast radius. Unit E (13) is independent and comes after, since it repairs guards over the migration Task 8 ships. Task 14 is close-out.

---

### Task 1: `renameCrewMember` reports whether a row changed

**Files:**
- Modify: `lib/sync/applyParseResult.ts:38` (interface)
- Modify: `lib/sync/runScheduledCronSync.ts:1621-1637` (implementation)
- Test: `tests/sync/applyParseResult.identityLink.db.test.ts`

**Interfaces:**
- Produces: `renameCrewMember(showId: string, removedName: string, addedName: string): Promise<boolean>` — `true` iff the guarded UPDATE changed exactly one row.

**Context you need:** The current implementation runs a guarded `update … where show_id = $1 and name = $2 and not exists (select 1 … name = $3)`. A target-name collision or a missing source matches zero rows. **That no-op is ratified and must stay a no-op** — do not make it throw (spec §1.1 R1). This task only makes it *observable*. The call goes through `this.rows(...)`, which is postgres.js `unsafe` (`lib/sync/runScheduledCronSync.ts:728-729`) returning a row list carrying `.count`. There is no `{ data, error }` channel — do not add one.

- [ ] **Step 1: Write the failing tests**

Add to `tests/sync/applyParseResult.identityLink.db.test.ts`:

```ts
it("renameCrewMember returns true when the guarded update renames a row", async () => {
  await inRollback(async (tx) => {
    const { showId } = await seedShow(tx);
    await seedCrew(tx, showId, [{ name: "Old" }]);
    const pipelineTx = makeSyncPipelineTx(tx);
    const landed = await pipelineTx.renameCrewMember(showId, "Old", "New");
    expect(landed).toBe(true);
  });
});

it("renameCrewMember returns false on a target-name collision (still no-op, never throws)", async () => {
  await inRollback(async (tx) => {
    const { showId } = await seedShow(tx);
    await seedCrew(tx, showId, [{ name: "Old" }, { name: "New" }]);
    const pipelineTx = makeSyncPipelineTx(tx);
    const landed = await pipelineTx.renameCrewMember(showId, "Old", "New");
    expect(landed).toBe(false);
    const rows = await readCrew(tx, showId);
    expect(rows.map((r) => r.name).sort()).toEqual(["New", "Old"]);
  });
});

it("renameCrewMember returns false when the source name is absent", async () => {
  await inRollback(async (tx) => {
    const { showId } = await seedShow(tx);
    await seedCrew(tx, showId, [{ name: "Other" }]);
    const pipelineTx = makeSyncPipelineTx(tx);
    const landed = await pipelineTx.renameCrewMember(showId, "Missing", "New");
    expect(landed).toBe(false);
  });
});
```

**Verified helpers** (do not invent others). Note `seedCrew` takes a SINGLE `CrewMemberRow`, not an array, and the established call is `makeSyncPipelineTx(tx as never)` — the illustrative snippets above pass arrays and omit the cast; reconcile both against the neighbouring tests before running. This file imports `seedShow`, `seedCrew`, `readCrew`, `crew`, `prevMember`, `snapshot`, `applyTx`, `holdPort`, `parseResult` from `./_holdAwareTestkit` (`tests/sync/applyParseResult.identityLink.db.test.ts:16-26`), plus `inRollback` (local, line 38) and `makeSyncPipelineTx` from `@/lib/sync/runScheduledCronSync` (line 14). Match the existing tests' call shapes for `seedShow`/`seedCrew` rather than the illustrative ones above.

**Failure mode this catches:** a pair that clears all five loop guards can still silently no-op. Today nothing observes that, so `unlandedRenames` would under-report and the notice would keep describing a rename that did not happen.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run tests/sync/applyParseResult.identityLink.db.test.ts -t "renameCrewMember returns"`
Expected: FAIL — the current signature returns `Promise<void>`, so `landed` is `undefined` and `toBe(true)` fails.

- [ ] **Step 3: Change the interface**

In `lib/sync/applyParseResult.ts`, at the `renameCrewMember` member of the tx interface (currently line 38), change the return type and extend the existing comment so the ratified no-op stays documented:

```ts
  // so the row's id (the picker cookie key) survives a classified rename. Idempotent, at-most-one
  // row; a target-name collision or missing source is a silent no-op (fail-safe delete+insert).
  // Returns whether the guarded update actually renamed a row -- the no-op is RATIFIED (never an
  // error), but callers must be able to observe it so the notice and feed can report what landed.
  renameCrewMember(showId: string, removedName: string, addedName: string): Promise<boolean>;
```

- [ ] **Step 4: Change the implementation**

In `lib/sync/runScheduledCronSync.ts`, in the `renameCrewMember` method (currently ~1621-1637), capture the result and return the rowcount test. Keep the SQL and its comment block exactly as they are:

```ts
  async renameCrewMember(showId: string, removedName: string, addedName: string): Promise<boolean> {
    // ... existing comment block unchanged ...
    const rows = await this.rows(
      `
        update public.crew_members
           set name = $3
         where show_id = $1 and name = $2
           and not exists (
             select 1 from public.crew_members where show_id = $1 and name = $3
           )
        returning id
      `,
      [showId, removedName, addedName],
    );
    return rows.length === 1;
  }
```

Note the added `returning id`: `this.rows` types its result as `T[]`, so `rows.length` is the portable rowcount test and does not depend on postgres.js's `.count` surviving the helper's cast.

- [ ] **Step 5: Fix every implementer of the interface — there are 14 test doubles**

Run: `pnpm tsc --noEmit`

Every stub must resolve a boolean; one modelling a successful rename returns `true`. Do not change what any existing test asserts about DB state — only satisfy the type. **Verified sweep list** (re-run `rg -n "renameCrewMember" tests lib` to confirm nothing has been added since):

```
tests/sync/phase2.test.ts:205
tests/sync/phase2RoleMappings.test.ts:195
tests/sync/_applyStagedCoreTestkit.ts:122
tests/sync/_holdAwareTestkit.ts:175
tests/sync/discardStaged.test.ts:57
tests/sync/runManualStageForFirstSeen.test.ts:98
tests/sync/sourceAnchorsPipeline.test.ts:273
tests/sync/applyRawParseNoOverride.test.ts:29
tests/sync/applyStaged.test.ts:158
tests/sync/runManualSyncForShow.test.ts:144
tests/sync/applyParseResult.identityLink.test.ts:32
tests/sync/applyParseResultScheduleDay.test.ts:29
tests/sync/applyStaged.wizardDriveReverify.test.ts:143
tests/sync/runScheduledCronSync.test.ts:410
```

`tests/sync/applyParseResult.identityLink.db.test.ts` needs no stub edit — it goes through the real `makeSyncPipelineTx` (`lib/sync/runScheduledCronSync.ts:1847`).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run tests/sync/applyParseResult.identityLink.db.test.ts`
Expected: PASS, including the file's pre-existing no-op tests (they assert DB state, which is unchanged).

- [ ] **Step 7: Commit**

```bash
git add lib/sync/applyParseResult.ts lib/sync/runScheduledCronSync.ts tests/sync/
git commit -m "feat(sync): let renameCrewMember report whether the guarded update landed"
```

`tests/sync/` rather than a file list, because Step 5 touches fourteen of them. Run `git status` first and confirm nothing unrelated is staged.

---

### Task 2: `ApplyParseResultOutcome` carries landed and unlanded pairs

**Files:**
- Modify: `lib/sync/applyParseResult.ts:117-122` (type), lines 175-186 (the rename loop)
- Test: `tests/sync/applyParseResult.identityLink.test.ts`

**Interfaces:**
- Consumes: Task 1's `Promise<boolean>`.
- Produces:

```ts
export type UnlandedRenameReason =
  | "source_absent"
  | "target_absent"
  | "name_held"
  | "pair_already_consumed"
  | "rename_no_op";

export type UnlandedRename = {
  pair: IdentityLinkRename;
  reason: UnlandedRenameReason;
  sourceSurvived: boolean;
};

export type ApplyParseResultOutcome = {
  appliedCrewMembers: ParseResult["crewMembers"];
  landedRenames: IdentityLinkRename[];
  unlandedRenames: UnlandedRename[];
};
```

**Context you need — read before writing the loop:**

1. **The union has FIVE members, not six.** The loop has five `continue` guards, but the delete-protected one (`lib/sync/applyParseResult.ts:179`) is **unreachable**: every `protectedNames` entry is a hold's `entity_key` (`lib/sync/holds/holdAwareApply.ts:237`, line 434, line 448) and every surviving hold adds that same key to `heldNames` first (`lib/sync/holds/holdAwareApply.ts:216`), so the `name_held` guard at line 178 always wins. Do **not** add a `source_delete_protected` member and do **not** write a test for it — it would require mocking an impossible planner state.
2. **`sourceSurvived` is a survival test, not a reason test.** It is `deleteKeepNames.includes(pair.removedName)`. `deleteKeepNames` is computed once at `lib/sync/applyParseResult.ts:153`, never mutated, and consumed at line 187, so evaluating it anywhere between is equivalent. Do **not** derive survival from the reason — `heldNames` takes every surviving hold while `protectedNames` only fires in specific hold-kind branches, so a `name_held` pair whose hold kind did not delete-protect it does lose its row.
3. This field exists because `deleteKeepNames` never leaves this function and a surviving protected row is absent from `appliedCrewMembers`, so no consumer can compute it (spec §2.1 A3).

- [ ] **Step 1: Write the failing tests**

**Verified helper signatures in this file — use these exactly:**

```ts
function makeTx(): { tx: {...vi.fn stubs...}; ops: string[] }   // :23, takes NO arguments
function crew(name: string, overrides: Partial<CrewMemberRow> = {}): CrewMemberRow  // :9
function baseArgs(
  previousCrewNames: string[],
  nextCrew: CrewMemberRow[],
  identityLinkRenames?: Array<{ removedName: string; addedName: string }>,
): ApplyParseResultArgs  // :47 -- POSITIONAL
```

`makeTx()` takes no overrides, so vary `renameCrewMember` via its `vi.fn` handle. After Task 1 its stub must resolve a boolean — update the stub in `makeTx` itself as part of Task 1 Step 5.

Add to `tests/sync/applyParseResult.identityLink.test.ts`:

```ts
it("reports a landed pair in landedRenames and nothing in unlandedRenames", async () => {
  const { tx } = makeTx();
  tx.renameCrewMember.mockResolvedValue(true);
  const outcome = await applyParseResult(tx, baseArgs(["Old"], [crew("New")], [
    { removedName: "Old", addedName: "New" },
  ]));
  expect(outcome.landedRenames).toEqual([{ removedName: "Old", addedName: "New" }]);
  expect(outcome.unlandedRenames).toEqual([]);
});

it("reports rename_no_op when the guarded update matched nothing", async () => {
  const { tx } = makeTx();
  tx.renameCrewMember.mockResolvedValue(false);
  const outcome = await applyParseResult(tx, baseArgs(["Old"], [crew("New")], [
    { removedName: "Old", addedName: "New" },
  ]));
  expect(outcome.landedRenames).toEqual([]);
  expect(outcome.unlandedRenames).toHaveLength(1);
  expect(outcome.unlandedRenames[0]?.reason).toBe("rename_no_op");
  expect(outcome.unlandedRenames[0]?.sourceSurvived).toBe(false);
});

it("maps source_absent, target_absent and pair_already_consumed to distinct reasons", async () => {
  const { tx } = makeTx();
  tx.renameCrewMember.mockResolvedValue(true);

  const sourceAbsent = await applyParseResult(tx, baseArgs(["Old"], [crew("New")], [
    { removedName: "Ghost", addedName: "New" },
  ]));
  expect(sourceAbsent.unlandedRenames[0]?.reason).toBe("source_absent");

  const targetAbsent = await applyParseResult(tx, baseArgs(["Old"], [crew("New")], [
    { removedName: "Old", addedName: "Nowhere" },
  ]));
  expect(targetAbsent.unlandedRenames[0]?.reason).toBe("target_absent");

  const duplicate = await applyParseResult(tx, baseArgs(["Old"], [crew("New"), crew("Other")], [
    { removedName: "Old", addedName: "New" },
    { removedName: "Old", addedName: "Other" },
  ]));
  expect(duplicate.unlandedRenames[0]?.reason).toBe("pair_already_consumed");
});

it("a same-name pair (source === target) is handled without corrupting state", async () => {
  const { tx } = makeTx();
  tx.renameCrewMember.mockResolvedValue(false);
  // Spec section 7 names this as a required boundary input. "Old" is both sides of the pair, so it
  // is present in previousCrewNames AND in the parse: the source/target guards both pass and the
  // consumed-once belt sees the same name twice. Assert we neither crash nor report a landed
  // rename of a row onto itself.
  const outcome = await applyParseResult(tx, baseArgs(["Old"], [crew("Old")], [
    { removedName: "Old", addedName: "Old" },
  ]));
  expect(outcome.landedRenames).toEqual([]);
  expect(outcome.unlandedRenames).toHaveLength(1);
  expect(outcome.unlandedRenames[0]?.sourceSurvived).toBe(true);
});

it("sets sourceSurvived=true when the source name is still in the parsed crew", async () => {
  const { tx } = makeTx();
  tx.renameCrewMember.mockResolvedValue(true);
  // "Old" is BOTH the rename source and a parsed row, so it is in deleteKeepNames and survives.
  // The pair is unlanded because its target is absent from the parse.
  const outcome = await applyParseResult(tx, baseArgs(["Old"], [crew("Old")], [
    { removedName: "Old", addedName: "Nowhere" },
  ]));
  expect(outcome.unlandedRenames[0]?.reason).toBe("target_absent");
  expect(outcome.unlandedRenames[0]?.sourceSurvived).toBe(true);
});
```

**Note on the held/delete-protected cases.** `baseArgs` has no `heldNames` or `deleteProtectedNames` knob — those flow through `args.holds` and a hold port, which this unit-test file does not wire. Put the `name_held` reason test and the survived-because-held case in `tests/sync/applyParseResult.identityLink.db.test.ts`, which already imports `holdPort` and `applyTx` and exercises the held-name skip (line 92). Do **not** widen `baseArgs` to fake hold state — that would test a planner shape production never produces.

**Failure mode each catches:** the first two catch an outcome that reports nothing at all; the third catches a collapsed union that reports every skip identically; the same-name test is the boundary input spec section 7 requires, and catches a rename-onto-itself being reported as landed (which would then suppress a real capability loss in Task 4); the last catches the reason-proxy implementation, the one that would fire false capability-loss notices in Task 4.

**On the expected reason for the same-name case:** derive it from the guard order rather than asserting a specific value up front — with source and target identical, whichever of the source/target/consumed guards fires first is an implementation detail of the existing loop, and pinning the wrong one would be a false failure. Assert the invariants that matter (`landedRenames` empty, one unlanded entry, source survived) and record the observed reason in the test name once you see it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run tests/sync/applyParseResult.identityLink.test.ts -t "landedRenames"`
Expected: FAIL — `outcome.landedRenames` is `undefined`.

- [ ] **Step 3: Extend the outcome type**

In `lib/sync/applyParseResult.ts`, replace the `ApplyParseResultOutcome` declaration (currently lines 117-122), keeping the existing P2-F2 comment and adding the new fields:

```ts
export type UnlandedRenameReason =
  | "source_absent"
  | "target_absent"
  | "name_held"
  | "pair_already_consumed"
  | "rename_no_op";

export type UnlandedRename = {
  pair: IdentityLinkRename;
  reason: UnlandedRenameReason;
  // Whether the SOURCE row survived this apply, i.e. removedName ∈ deleteKeepNames. Decided here
  // because deleteKeepNames is local to applyParseResult and never leaves it, and a surviving
  // protected row is absent from appliedCrewMembers -- so no consumer can compute this. The notice's
  // loss-suppression arm needs a survival test, NOT a reason test: heldNames takes every surviving
  // hold while protectedNames only fires in specific hold-kind branches, so a held pair whose hold
  // kind did not delete-protect it DOES lose its row and its loss is real.
  sourceSurvived: boolean;
};

export type ApplyParseResultOutcome = {
  // P2-F2: the crew list that ACTUALLY landed in crew_members (post-suppression / post-fold /
  // identity-pinned). The change-log writer must derive crew_added/removed/renamed from THIS, not
  // the raw parse list, so a reservation-suppressed row never gets a phantom auto_apply row.
  appliedCrewMembers: ParseResult["crewMembers"];
  // The same P2-F2 principle applied to the rename pairs, which were left on the raw path.
  landedRenames: IdentityLinkRename[];
  unlandedRenames: UnlandedRename[];
};
```

- [ ] **Step 4: Record outcomes in the rename loop**

Replace the loop at `lib/sync/applyParseResult.ts:175-186`. Every `continue` becomes a recorded outcome; the surviving structure and guard order are unchanged:

```ts
  const landedRenames: IdentityLinkRename[] = [];
  const unlandedRenames: UnlandedRename[] = [];
  const survived = (name: string): boolean => deleteKeepNames.includes(name);
  const recordUnlanded = (pair: IdentityLinkRename, reason: UnlandedRenameReason): void => {
    unlandedRenames.push({ pair, reason, sourceSurvived: survived(pair.removedName) });
  };

  for (const pair of args.identityLinkRenames ?? []) {
    if (!previousNamesSet.has(pair.removedName)) {
      recordUnlanded(pair, "source_absent");
      continue;
    }
    if (!nextNamesSet.has(pair.addedName)) {
      recordUnlanded(pair, "target_absent");
      continue;
    }
    if (heldNames.has(pair.removedName) || heldNames.has(pair.addedName)) {
      recordUnlanded(pair, "name_held");
      continue;
    }
    // NOTE: the delete-protected guard below is UNREACHABLE -- every protectedNames entry is a
    // hold's entity_key and every surviving hold adds that key to heldNames first, so the
    // name_held guard above always wins. Retained as a belt; deliberately has no reason member.
    if (deleteProtectedNames.includes(pair.removedName)) {
      recordUnlanded(pair, "name_held");
      continue;
    }
    if (consumedRenameNames.has(pair.removedName) || consumedRenameNames.has(pair.addedName)) {
      recordUnlanded(pair, "pair_already_consumed");
      continue;
    }
    consumedRenameNames.add(pair.removedName);
    consumedRenameNames.add(pair.addedName);
    const landed = await tx.renameCrewMember(args.snapshot.showId, pair.removedName, pair.addedName);
    if (landed) {
      landedRenames.push(pair);
    } else {
      recordUnlanded(pair, "rename_no_op");
    }
  }
```

Then add both arrays to the returned outcome object.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run tests/sync/applyParseResult.identityLink.test.ts tests/sync/applyParseResult.identityLink.db.test.ts`
Expected: PASS, including the pre-existing skip-branch tests at lines 74-133 (they assert `renameCrewMember` is not called, which is unchanged).

- [ ] **Step 6: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: clean. Every construction site of `ApplyParseResultOutcome` now needs the two new fields — fix each by returning the real arrays, never `[]` placeholders in production code.

- [ ] **Step 7: Commit**

```bash
git add lib/sync/applyParseResult.ts tests/sync/applyParseResult.identityLink.test.ts tests/sync/applyParseResult.identityLink.db.test.ts
git commit -m "feat(sync): report landed and unlanded identity-link renames from applyParseResult"
```

---

### Task 3: Thread landed/unlanded through phase2

**Files:**
- Modify: `lib/sync/phase2.ts` (result type ~line 168, and the `applyParseResult` call site ~line 507)
- Test: `tests/sync/phase2.test.ts`

**Interfaces:**
- Consumes: Task 2's `ApplyParseResultOutcome`.
- Produces: `Phase2Result` gains `unlandedRenames: UnlandedRename[]` (mirroring how `roleFlagsNotice?` already rides this type at `lib/sync/phase2.ts:168`).

**Context:** `roleFlagsNotice` is the proven template for a field that must survive every hop out to a post-commit sink — follow its declaration and propagation exactly. `landedRenames` does **not** need to leave phase2 (its only consumers are inside it, Tasks 4 and 5); `unlandedRenames` does, because Unit B emits it from post-commit sinks.

- [ ] **Step 1: Write the failing test**

**Verified harness** (`tests/sync/phase2.test.ts`): `class FakePhase2Tx` (line 136) and `async function runWith(tx: FakePhase2Tx, overrides = {})` (line 286), which does `vi.resetModules()`, re-imports `runPhase2`, and calls it with `{ ...baseArgs, ...overrides }`. The existing rename test at lines 548-571 is the pattern to copy — do **not** call `runPhase2` directly.

```ts
it("phase2 surfaces unlandedRenames on its result so post-commit sinks can emit them", async () => {
  const tx = new FakePhase2Tx();
  tx.shows.set("file-1", { /* copy the shape used at tests/sync/phase2.test.ts:548-571 */ });
  const result = await runWith(tx, {
    parseResult: parseResult({ crewMembers: [crew("New")] }),
    // requested pair whose target is absent from the parse -> target_absent
    identityLinkRenames: [{ removedName: "Old", addedName: "Nowhere" }],
  });
  expect(result.unlandedRenames).toHaveLength(1);
  expect(result.unlandedRenames[0]?.reason).toBe("target_absent");
});
```

**Failure mode:** a dropped propagation hop. Unit B's event is the ONLY signal for an unlanded pair (spec §1.1 R4), so a lost field is completely dark — and an emitter unit test passes with every hop broken.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/sync/phase2.test.ts -t "unlandedRenames"`
Expected: FAIL — property does not exist.

- [ ] **Step 3: Add the field and populate it**

Declare `unlandedRenames: UnlandedRename[]` on the phase2 result type beside `roleFlagsNotice?`, and populate it from `applyOutcome.unlandedRenames` at the call site. Non-optional with a `[]` default is correct here: an empty array is the honest value for a run with no unlanded pairs, and it removes an `undefined` check from every downstream hop.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/sync/phase2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/phase2.ts tests/sync/phase2.test.ts tests/db/stagedApplyIdentityLink.db.test.ts
git commit -m "feat(sync): surface unlandedRenames on the phase2 result"
```

---

### Task 4: The capability notice consumes landed pairs — with the two arms split

**Files:**
- Modify: `lib/sync/phase2.ts:265-335` (`capabilityRoleChangesForNotice`), lines 586-590 (call site)
- Test: `tests/sync/phase2.test.ts`

**Context you need — this is the subtlest change in the plan.** `capabilityRoleChangesForNotice` uses the rename pairs **twice, for opposite purposes**:

| Arm | Set | Purpose | Correct input |
|---|---|---|---|
| (a) | `priorNameForAdded` (`lib/sync/phase2.ts:279-280`) | map an added name back to its linked prior | `landedRenames` |
| (c) | `renamedAway` (`lib/sync/phase2.ts:281`, consumed line 325) | **suppress** a capability-loss notice | `landedRenames` ∪ unlanded-with-`sourceSurvived` |

A naive swap of both arms to `landedRenames` would fire a **false capability-loss notice** for every pair whose source row survived — a new defect pointing the opposite way from the one this unit fixes. Conversely, keeping the requested pairs in arm (c) means a genuine loss (source deleted because its rename target was hold-suppressed) stays silently suppressed, which is the bug being fixed.

- [ ] **Step 1: Write the failing tests — SPLIT ACROSS TWO FILES**

Three verified constraints decide where each test lives:

1. **`capabilityRoleChangesForNotice` is module-local, not exported** (`lib/sync/phase2.ts:265`). Never call it directly; assert on `runPhase2`'s `roleFlagsNotice`.
2. **`FakePhase2Tx` has no `holdPort`** — zero occurrences in `tests/sync/phase2.test.ts`. `runPhase2` only enables hold-aware apply via `tx.holdPort?.()` (`lib/sync/phase2.ts:479`), so **any case needing hold state is impossible in this file**. That is both survival cases, not just one.
3. **The crew helpers are `crew(name, email?)` (`tests/sync/phase2.test.ts:21`) and `crewWithFlags(name, roleFlags)` (`tests/sync/phase2.test.ts:34`).** `crew()`'s second parameter is an email string — use `crewWithFlags` whenever flags matter.

**In `tests/sync/phase2.test.ts`** (no hold state needed):

```ts
it("capability: a landed rename with unchanged flags emits no notice", async () => {
  const tx = new FakePhase2Tx();
  // seed prior crew Old(LEAD) on tx per the pattern at tests/sync/phase2.test.ts:869-920
  const result = await runWith(tx, {
    parseResult: parseResult({ crewMembers: [crewWithFlags("New", ["LEAD"])] }),
    identityLinkRenames: [{ removedName: "Old", addedName: "New" }],
  });
  expect(result.roleFlagsNotice).toBeUndefined();
});

it("capability: an unlanded pair whose SOURCE DIED reports the loss suppressed today", async () => {
  const tx = new FakePhase2Tx();
  // prior Old(LEAD); target absent from the parse and source not protected -> Old is deleted.
  const result = await runWith(tx, {
    parseResult: parseResult({ crewMembers: [crewWithFlags("Other", [])] }),
    identityLinkRenames: [{ removedName: "Old", addedName: "Nowhere" }],
  });
  expect(result.roleFlagsNotice?.context.changes).toEqual([
    { crew_name: "Old", prior_flags: ["LEAD"], new_flags: [] },
  ]);
});
```

**In `tests/db/stagedApplyIdentityLink.db.test.ts`** (real holds via `holdPort`) — both survival cases, since neither can run above:

```ts
it("capability: an unlanded pair whose SOURCE SURVIVED emits no capability-loss notice", async () => {
  // Hold Old(LEAD) with a kind that DOES delete-protect it, request Old -> New, assert no notice.
});

it("capability: a held pair whose hold kind did NOT delete-protect it still reports the loss", async () => {
  // Same shape, hold kind that holds without delete-protecting. THIS is the reason-proxy
  // discriminator: a reason-based implementation passes the test above and fails only here.
  // If no hold kind produces hold-without-delete-protect, say so in the commit message and
  // record it as a documented gap rather than faking planner state.
});
```

Every title starts with `capability:` so the `-t "capability"` filter in Step 2 selects all four across both files.


**Failure mode each catches:** the **source-survived** test catches the naive both-arms-landed implementation — that mutant reports a loss for a row still holding its flags. The **source-died** test catches leaving arm (c) on requested pairs, where a real loss stays silent. The **held-but-not-delete-protected** test is the only discriminator for the reason-proxy implementation: it passes both of the others and fails only here.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/sync/phase2.test.ts tests/db/stagedApplyIdentityLink.db.test.ts -t "capability"`
Expected: FAIL — the notice still derives from the requested pairs.

- [ ] **Step 3: Change the signature and the two arms**

Change the third parameter from `identityLinkRenames: IdentityLinkRename[] = []` to an object carrying both lists, then:

```ts
  const priorNameForAdded = new Map(
    renames.landedRenames.map((rename) => [rename.addedName, rename.removedName]),
  );
  // Arm (c) suppresses a loss when the prior row's absence from appliedCrewMembers is explained by
  // something other than a real loss: the rename landed (successor carries the capability, caught by
  // arm (a)), OR the source row survived this apply without being in the applied list -- held and
  // delete-protected rows are exactly that shape. This is a SURVIVAL test, not a reason test.
  const renamedAway = new Set<string>([
    ...renames.landedRenames.map((rename) => rename.removedName),
    ...renames.unlandedRenames.filter((u) => u.sourceSurvived).map((u) => u.pair.removedName),
  ]);
```

Update the call site at `lib/sync/phase2.ts:586-590` to pass `{ landedRenames: applyOutcome.landedRenames, unlandedRenames: applyOutcome.unlandedRenames }` in place of `args.identityLinkRenames ?? []`. Leave the second argument as `applyOutcome.appliedCrewMembers` — it is already correct.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/sync/phase2.test.ts tests/db/stagedApplyIdentityLink.db.test.ts`
Expected: PASS, including the pre-existing rename tests at tests/sync/phase2.test.ts lines 548, 879 and 901.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/phase2.ts tests/sync/phase2.test.ts tests/db/stagedApplyIdentityLink.db.test.ts
git commit -m "fix(sync): split the notice's rename arms so a surviving source suppresses, a dead one reports"
```

---

### Task 5: The feed writer consumes landed pairs and stops re-deriving

**Files:**
- Modify: `lib/sync/changeLog/writeAutoApplyChanges.ts:41` (type), lines 43-51 (`renamePairs`, deleted), line 78 (call), lines 145-170 (`field_changed` mapping)
- Modify: `lib/sync/phase2.ts:537-550` (call site)
- Test: `tests/db/stagedApplyIdentityLink.db.test.ts`

**Context — this is the P2-F2 violation.** `ApplyParseResultOutcome`'s own comment already requires the change-log writer to derive `crew_added`/`crew_removed`/**`crew_renamed`** from the applied list. That is honored for the crew list and was left unmet for the rename pairs: the writer computes its own via `renamePairs(args.triggeredItems)`, which accepts any MI-12/13/14 item **unconditionally** — no accept gate, no suppression check.

**What changes, measured** (spec §4 item 1). Requested-pair vs landed-pairs-only, same rosters:

| Case | Today | After |
|---|---|---|
| target collision | `crew_renamed:Old` | `crew_removed:Old` |
| source absent | `crew_renamed:Old` | `crew_added:New` |
| target absent (P2-F4) | `crew_renamed:Old` | `crew_removed:Old` |
| held source | (none) | `crew_added:New` |
| held target | (none) | `crew_removed:Old` |

It is **one-sided per reason**, not a uniform "removed + added" — the rename row was suppressing both the removals loop (lines 106-107) and the additions loop (line 121), but each unlanded reason leaves only one side present in the rosters being diffed.

- [ ] **Step 1: Write the failing tests**

```ts
it("a hold-suppressed rename target yields crew_removed for the prior name and NO crew_renamed", async () => {
  // ... apply with a requested pair whose target is suppressed ...
  const rows = (await readChangeLog(showId)).all;
  expect(rows.filter((r) => r.change_kind === "crew_renamed")).toEqual([]);
  expect(rows.filter((r) => r.change_kind === "crew_removed").map((r) => r.entity_ref)).toEqual(["Old"]);
});

it("an unaccepted MI-13 with a surviving target yields crew_removed AND crew_added", async () => {
  const rows = (await readChangeLog(showId)).all;
  expect(rows.filter((r) => r.change_kind === "crew_renamed")).toEqual([]);
  expect(rows.map((r) => r.change_kind).sort()).toEqual(["crew_added", "crew_removed"]);
});

it("an accepted, landed rename still yields exactly one crew_renamed keyed on the PRIOR name", async () => {
  const rows = (await readChangeLog(showId)).all;
  const renamed = rows.filter((r) => r.change_kind === "crew_renamed");
  expect(renamed).toHaveLength(1);
  expect(renamed[0]?.entity_ref).toBe("Old");
});

it("roster_shift_counts reports zero renamed for an unlanded pair", async () => {
  // No helper exists; query the function directly. Pattern: tests/db/roster-shift-counts.test.ts:41
  const [counts] = await holdsSql`
    select added, removed, renamed
      from public.roster_shift_counts(${[showId]}::uuid[])`;
  expect(Number(counts?.renamed)).toBe(0);
  expect(Number(counts?.removed)).toBe(1);
});

it("field_changed attribution follows landed pairs, not requested ones", async () => {
  // FIXTURE REQUIREMENT, probe-established: the successor must differ from the prior row in
  // NON-LEAD **role_flags** specifically. Measured against the current writer:
  //   role-only delta  -> ['crew_renamed']              (no field_changed)
  //   phone-only delta -> ['crew_renamed']              (no field_changed)
  //   date-only delta  -> ['crew_renamed']              (no field_changed)
  //   role_flags delta -> ['crew_renamed','field_changed']
  // So a role / phone / date_restriction fixture leaves this test green BEFORE the implementation
  // and proves nothing. Give "New" a non-LEAD role_flags value that "Old" does not have, then
  // request an UNLANDED pair Old -> New.
  const rows = (await readChangeLog(showId)).all;
  // With the pair unlanded, the delta must NOT be attributed through the prior name.
  expect(rows.filter((r) => r.change_kind === "field_changed")).toEqual([]);
});
```

**Failure mode each catches:** test 1 catches the false-rename-plus-missing-removal pair — asserting only the absent rename row would pass on a writer that dropped both, which is why it also requires the `crew_removed` row. Test 2 catches the additions half, which test 1 alone misses. Test 3 catches over-correction silencing legitimate renames, and pins resolution #19's `entity_ref`. Test 4 checks the aggregate the operator actually reads on the dashboard badge, catching a correct-rows-wrong-counts divergence that per-row assertions cannot see. Test 5 catches `field_changed` staying mis-attributed while every row-kind assertion passes.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/db/stagedApplyIdentityLink.db.test.ts`
Expected: FAIL — a `crew_renamed` row is present in the suppressed cases.

- [ ] **Step 3: Change the writer**

Add `landedRenames: IdentityLinkRename[]` to `WriteAutoApplyChangesArgs`. Replace `const renames = renamePairs(args.triggeredItems);` (line 78) with:

```ts
  // P2-F2: renames come from what the apply LANDED, never re-derived from triggeredItems. The old
  // renamePairs() accepted any MI-12/13/14 item unconditionally -- no accept gate, no suppression
  // check -- so it wrote a crew_renamed row for pairs that never landed and, worse, suppressed the
  // crew_removed row describing what actually happened.
  const renames = args.landedRenames.map((r) => ({ prior: r.removedName, added: r.addedName }));
```

Delete `renamePairs` (lines 43-51) and the `RenamePair` type (line 41) if nothing else uses them — grep first. **Keep** `hasInvariant` (lines 68-73) and the `triggeredItems` argument; both have other consumers. **Keep** the `heldNames` guard at line 93: it guards the feed independently of the apply path, and removing it is an unforced widening.

- [ ] **Step 4: Update the call site**

At `lib/sync/phase2.ts:537-550`, pass `landedRenames: applyOutcome.landedRenames` alongside the existing `nextCrewMembers: applyOutcome.appliedCrewMembers`.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm vitest run tests/db/stagedApplyIdentityLink.db.test.ts tests/sync/phase2.test.ts`
Expected: PASS, including the pre-existing identity-link feed tests at `tests/db/stagedApplyIdentityLink.db.test.ts:44`, line 74, line 91, line 124.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/changeLog/writeAutoApplyChanges.ts lib/sync/phase2.ts tests/db/stagedApplyIdentityLink.db.test.ts
git commit -m "fix(sync): derive crew_renamed from landed pairs, completing the P2-F2 contract"
```

---

### Task 6: The forensic unlanded-rename emitter

**Files:**
- Create: lib/log/emitIdentityLinkRenameUnlanded.ts (new)
- Test: tests/log/emitIdentityLinkRenameUnlanded.test.ts (new) *(new file — auto-collected by `BASE_INCLUDE`, no wiring needed)*

**Interfaces:**
- Produces: `emitIdentityLinkRenameUnlanded(unlanded: UnlandedRename[], ctx: { source: string; showId: string; driveFileId: string }): Promise<void>`

**Payload key casing — RESOLVED, spec wins.** An earlier revision proposed snake_case context keys on the grounds that `emitLeadRoleApplied` uses `crew_name` / `prior_flags`. That house convention is real but does not override an explicit canonical-spec contract: spec section 2.2 names the payload `{ showId, driveFileId, removedName, addedName, reason }`, so the context keys are **`removedName`, `addedName`, `reason`** as written. The convention argument is recorded here only so it is not re-derived.

**Context:** Model this file on `lib/log/emitLeadRoleApplied.ts` — read it in full first, including its header comment (lines 10-30), which documents the whole pattern. Key properties to copy: `persistAppEventStrict` (`lib/log/persist.ts:60`) as the writer; `{ ok: false }` escalates loudly via `log.error` with a distinct code and is never swallowed (invariant 9); the emitter never throws; the code is **not** a §12.4 user-facing code, so no catalog row, no `pnpm gen:spec-codes`, no lockstep update.

Payload per event, **verbatim from the approved spec**: context keys `removedName`, `addedName`, `reason`; `showId` and `driveFileId` as top-level event fields, as in `emitLeadRoleApplied`. Redaction-safe — crew names only, no email/phone/token.

- [ ] **Step 1: Write the failing test**

```ts
it("emits one event per unlanded pair, carrying the reason", async () => {
  await emitIdentityLinkRenameUnlanded(
    [
      { pair: { removedName: "Old", addedName: "New" }, reason: "target_absent", sourceSurvived: false },
      { pair: { removedName: "A", addedName: "B" }, reason: "name_held", sourceSurvived: true },
    ],
    { source: "sync.identityLink", showId: "s1", driveFileId: "d1" },
  );
  expect(persistAppEventStrict).toHaveBeenCalledTimes(2);
  expect(persistAppEventStrict).toHaveBeenNthCalledWith(1, expect.objectContaining({
    code: "IDENTITY_LINK_RENAME_UNLANDED",
    showId: "s1",
    context: expect.objectContaining({ removedName: "Old", addedName: "New", reason: "target_absent" }),
  }));
});

it("escalates loudly when the strict write fails, and does not throw", async () => {
  vi.mocked(persistAppEventStrict).mockResolvedValue({ ok: false, error: new Error("boom") });
  await expect(
    emitIdentityLinkRenameUnlanded(
      [{ pair: { removedName: "Old", addedName: "New" }, reason: "rename_no_op", sourceSurvived: false }],
      { source: "sync.identityLink", showId: "s1", driveFileId: "d1" },
    ),
  ).resolves.toBeUndefined();
  expect(log.error).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ code: "IDENTITY_LINK_RENAME_UNLANDED_PERSIST_FAILED" }),
  );
});

it("emits nothing for an empty list", async () => {
  await emitIdentityLinkRenameUnlanded([], { source: "s", showId: "s1", driveFileId: "d1" });
  expect(persistAppEventStrict).not.toHaveBeenCalled();
});
```

**Failure mode:** silent omission from the notice and feed degrading into silent-everything. R4 makes this the only signal that a rename was requested and did not land.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/log/emitIdentityLinkRenameUnlanded.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the emitter**

Mirror `lib/log/emitLeadRoleApplied.ts:52-80` structurally: loop the list, `await persistAppEventStrict({ level: "info", source: ctx.source, message: "identity-link rename did not land", code: "IDENTITY_LINK_RENAME_UNLANDED", showId, driveFileId, context: {...} })`, then `if (!result.ok) await log.error(...)` with the `_PERSIST_FAILED` code. Include a header comment stating the non-§12.4 status and the redaction posture, as its precedent does.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/log/emitIdentityLinkRenameUnlanded.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the code stays out of the §12.4 scans**

Run: `pnpm vitest run tests/messages/stripLogEmissionCalls.test.ts tests/cross-cutting/codes.test.ts`
Expected: PASS. If the strip-recognizer does not cover the new call, extend it the way it covers `emitLeadRoleApplied` (`tests/messages/stripLogEmissionCalls.test.ts:123-138`) — a forensic code must never register as a user-facing one.

- [ ] **Step 6: Commit**

```bash
git add lib/log/emitIdentityLinkRenameUnlanded.ts tests/log/emitIdentityLinkRenameUnlanded.test.ts
git commit -m "feat(log): add the forensic IDENTITY_LINK_RENAME_UNLANDED emitter"
```

---

### Task 7: Wire the unlanded emit to every post-commit sink

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (result type ~line 396, emit beside the existing deferred notice emit)
- Modify: `lib/sync/applyStagedCore.ts` (~line 474), `lib/sync/applyStaged.ts` (~line 265)
- Modify: `lib/sync/runManualStageForFirstSeen.ts:170` (carrier only; its emit is Task 12)
- Modify: `app/api/admin/pending-ingestions/[id]/retry/route.ts`
- Test: `tests/sync/runScheduledCronSync.test.ts`, `tests/sync/applyStaged.test.ts`, `tests/sync/runManualSyncForShow.test.ts`

**Context:** `roleFlagsNotice` rides these exact hops today — follow it. **Four sinks, and one of them is reachable by a path that crosses none of the core hops:** the pending-ingestion retry calls `runManualSyncForShowUnlocked`, which routes around `processOneFile`'s post-commit tail (`lib/sync/runManualSyncForShow.ts:287-288`), so it needs its own carrier and its own emit point.

**SCOPE OF THIS TASK — read before starting.** The two finalize routes' emits require the accumulator-and-`finally` infrastructure that **Task 11 builds**, and emitting them anywhere else violates invariant 10. So this task wires only the sinks that need no accumulator:

| Sink | Wired in |
|---|---|
| cron/manual (`processOneFile`'s post-commit tail) | **this task** |
| dashboard staged (`applyStaged`) | **this task** |
| pending-ingestion retry (post-`withRowTryLock`) | **this task** |
| ordinary finalize | **Task 11** |
| finalize-cas, both handlers | **Task 11** |

**Only the hops this task's tests exercise are added here.** An earlier revision had this task plumb the finalize routes' carrier while testing neither, which violates invariant 1 — an implementer cannot follow both that scope and TDD. The two finalize routes' carrier AND emit both belong to Task 11, which has the tests for them. This task touches `lib/sync/**` and the retry route only.

- [ ] **Step 1: Write the failing integration tests — one per sink wired here**

Three tests, in the harness that already drives each path:

| Sink | Test file |
|---|---|
| cron/manual | `tests/sync/runScheduledCronSync.test.ts` |
| dashboard staged | `tests/sync/applyStaged.test.ts` |
| pending-ingestion retry | **a route harness, not the sync helper.** The sink is the route *after* `withRowTryLock` resolves; `runManualSyncForShow_unlocked` runs INSIDE that lock, so a test there cannot observe the emit. Verified existing harnesses: `tests/admin/pendingIngestionsLiveActions.test.ts`, `tests/api/admin/pendingIngestionRetry-telemetry.test.ts`. Pick whichever already drives the retry POST. |

Each asserts the event fires end-to-end for an unlanded pair. The two finalize sinks get their integration tests in Task 11, alongside the flush that makes them possible.

**Failure mode:** a dropped propagation hop. An emitter unit test (Task 6) passes with every hop broken, and R4 makes this the only signal, so a lost field is fully dark. The retry sink is listed separately because the other three passing says nothing about it.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/sync/runScheduledCronSync.test.ts tests/sync/applyStaged.test.ts tests/api/admin/pendingIngestionRetry-telemetry.test.ts -t "unlanded"`
Expected: FAIL — no emit. (Swap the third file if a different harness drives the retry POST.)

- [ ] **Step 3: Add the field at each hop, then emit**

Add `unlandedRenames` beside `roleFlagsNotice` on each result type, populate it, and call the Task 6 emitter at each post-commit sink.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/sync tests/onboarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/ app/api/admin/pending-ingestions/ tests/
git commit -m "feat(sync): emit IDENTITY_LINK_RENAME_UNLANDED from the cron, staged and retry sinks"
```

---

### Task 8: `crewImage` and `undo_change` carry `selections_reset_at`

**Files:**
- Modify: `lib/sync/changeLog/writeAutoApplyChanges.ts:53-66` (`crewImage`)
- Create: supabase/migrations/20260804000000_undo_change_selections_reset_at.sql (new)
- Modify: `tests/db/_holdsHelpers.ts:62-71`, lines 92-97, line 275
- Test: `tests/db/undo-change-direction-a.test.ts`

**Context — D3 alone fixes the branch that almost never runs.** A normal `crew_renamed` undo **deletes the live successor first** (`supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:150-163`) precisely so the restore INSERT slot is free, so it takes the clean-INSERT path and any `greatest()` in the ON CONFLICT branch never runs. **D4 is the actual fix:** capture the successor's marker at the `select … for update` that already exists at lines 151-153, before the delete, and merge it into the INSERT. That also rescues historical rename rows for free — an absent `before_image` key is SQL NULL and `greatest` falls through to the captured value.

`greatest` semantics, probed: `greatest(NULL, ts) = ts`, `greatest(ts, NULL) = ts`, both-NULL is NULL, and it keeps the newer of two timestamps. The marker is monotonic by construction (its only writer stamps `clock_timestamp()`), so "keep the newer" is correct, not a heuristic.

**The test helpers cannot observe the column today** — `tests/db/_holdsHelpers.ts` omits it from `CrewSeed`, from the seed INSERT, and from `readCrew`'s select. Fix all three first or no assertion is possible.

- [ ] **Step 1: Extend the test helpers**

Add `selections_reset_at?: string | null` to `CrewSeed`, include it in the seed INSERT column list, and add it to `readCrew`'s select. This is scaffolding for the tests below and belongs in this task, not its own.

- [ ] **Step 2: Write the failing tests**

```ts
it("an undo of a crew_removed restores selections_reset_at from before_image", async () => { /* ... */ });

it("CLEAN-INSERT path: a rename undo keeps a reset stamped on the successor after the rename", async () => {
  // rename Old -> New, stamp selections_reset_at on New, undo, assert the restored row keeps it
});

it("historical before_image with no key: falls through to the successor's marker", async () => {
  // write a before_image WITHOUT the key, stamp the successor, undo, assert the successor's value survives
});

it("ON CONFLICT branch keeps the NEWER of the live and before_image markers", async () => { /* ... */ });

it("an invalidated picker cookie stays invalidated across an undo", async () => {
  // stamp the reset, record a change, undo, then assert resolvePickerSelection still returns selection_reset
});

it("a NULL marker stays NULL through an undo", async () => { /* ... */ });
```

**Failure mode each catches:** test 2 is **the D3-only failure** — this is the common path, and a `greatest()` living solely in the ON CONFLICT branch fails here while every other D test passes. Test 3 pins that old rows are rescued by capture rather than by backfill. Test 5 is the security-adjacent one: asserting the column alone would miss a reader-side regression. Test 6 is the boundary case — a NULL must not become a timestamp.

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm vitest run tests/db/undo-change-direction-a.test.ts`
Expected: FAIL — the restored row's `selections_reset_at` is NULL.

- [ ] **Step 4: Add the column to `crewImage`**

Add `selections_reset_at: member.selections_reset_at,` to the returned object (10 keys → 11). The field is already on the source type (`lib/sync/applyParseResult.ts:17`).

- [ ] **Step 5: Write the migration**

Copy the **entire current body** of `undo_change` from `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql` into the new migration as a `CREATE OR REPLACE FUNCTION`, then make exactly these changes:

- **D4:** at the successor `select … for update` (lines 151-153), also select `selections_reset_at` into a new local `v_succ_reset` (declare it `timestamptz`).
- **D2:** add `selections_reset_at` to the INSERT column list (lines 175-179) and, in the values list, `greatest((v_before->>'selections_reset_at')::timestamptz, v_succ_reset)`.
- **D3:** add `selections_reset_at = greatest(crew_members.selections_reset_at, excluded.selections_reset_at)` to the ON CONFLICT DO UPDATE SET list (lines 189-198) — **not** a bare `excluded.` assignment, which would overwrite a live newer marker with a stale one and reintroduce the exact revalidation this unit prevents.

Preserve the `ROW_COUNT` fail-safe (lines 199-204) and the advisory-lock acquisition verbatim. No new lock holder.

- [ ] **Step 6: Apply locally and run**

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260804000000_undo_change_selections_reset_at.sql
psql "$DATABASE_URL" -c "notify pgrst, 'reload schema';"
pnpm vitest run tests/db/undo-change-direction-a.test.ts
```
Expected: PASS.

- [ ] **Step 7: Regenerate the schema manifest**

Run: `pnpm gen:schema-manifest`
Expected: **a no-op diff** — this migration replaces functions and adds no columns or tables. If the manifest changes, stop and investigate; something unintended landed.

- [ ] **Step 8: Commit**

```bash
git add lib/sync/changeLog/writeAutoApplyChanges.ts supabase/migrations/ tests/db/ supabase/__generated__/
git commit -m "fix(db): carry selections_reset_at through before_image and the undo restore"
```

---

### Task 9: `mi11_approve_hold` carries the column — both sites

**Files:**
- Modify: the Task 8 migration (add a second `CREATE OR REPLACE`)
- Test: `tests/db/undo-change-direction-a.test.ts`

**Context:** `mi11_approve_hold` is the **second** production `before_image` builder, and `crewImage` is not the only one — a sweep that stays in TypeScript misses it entirely. It drops the column at **two** sites: the `before_image` builder (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:336`) and the rename successor INSERT it writes (lines 416-417). Fixing only the builder still loses the marker on every future MI-11 rename.

**It must ship as a `CREATE OR REPLACE` in the NEW migration, not as an edit to `20260608000002`.** That file is already applied everywhere, so editing it changes nothing on any deployed database — the runner will not re-run it.

- [ ] **Step 1: Write the failing tests**

```ts
it("mi11_approve_hold's before_image carries selections_reset_at, and an undo of an MI-11 removal round-trips it", async () => { /* ... */ });

it("MI-11 RENAME with no post-rename stamp: the successor keeps the original marker", async () => {
  // seed with selections_reset_at set, approve an MI-11 rename hold, assert the SUCCESSOR carries it.
  // Deliberately does NOT stamp the successor after the rename.
});

it("the LIVE mi11_approve_hold body carries the column (pg_proc, not the migration file)", async () => {
  // tests/db/undo-change-direction-a.test.ts has no `tx` in scope; its handle is holdsSql
  // (imported from ./_holdsHelpers, used at line 32).
  const [row] = await holdsSql`
    select prosrc from pg_proc where proname = 'mi11_approve_hold'`;
  expect(String(row?.prosrc)).toContain("selections_reset_at");
});
```

**Failure mode each catches:** test 2 is the successor-INSERT half, which a builder-only implementation skips — and it deliberately omits a post-rename stamp because the Task 8 clean-INSERT test stamps the successor, and that stamp *masks* the omission via D4's capture. Test 3 catches the change shipping as an edit to the already-applied migration: a file-reading assertion passes on a change that never reached a database.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/db/undo-change-direction-a.test.ts -t "mi11"`
Expected: FAIL.

- [ ] **Step 3: Add the second function to the migration**

Copy the entire current body of `mi11_approve_hold` (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:217`ff) into the Task 8 migration as a second `CREATE OR REPLACE FUNCTION public.mi11_approve_hold(...)`, adding `selections_reset_at` to the `jsonb_build_object` at line 336 and to the successor INSERT's column and values lists at lines 416-417, carrying the prior row's value onto the successor. Preserve its advisory-lock acquisition and signature exactly.

- [ ] **Step 4: Apply and run**

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260804000000_undo_change_selections_reset_at.sql
psql "$DATABASE_URL" -c "notify pgrst, 'reload schema';"
pnpm vitest run tests/db/undo-change-direction-a.test.ts tests/db/undo-change-guards.test.ts tests/db/undo_change_lifecycle_guard.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ tests/db/
git commit -m "fix(db): carry selections_reset_at through both mi11_approve_hold write sites"
```

---

### Task 10: Repoint the phantom-columns guard at the live migration

**Files:**
- Modify: `tests/db/undo-change-no-phantom-columns.test.ts:19`, lines 22-34

**Context:** This guard is aimed at a dead file. It reads `20260608000003_undo_change_rpc.sql` while the live definition is `20260719000001` (and, after Task 8, the newer one). Its `REAL_CREW_COLUMNS` set also omits `selections_reset_at`, so the current drop passes by construction. Repairing the drop without repairing its blind guard queues the next drop.

- [ ] **Step 1: Repoint and extend**

Two edits, and the second is the one that makes the guard bite:

1. Resolve the migration by scanning for the **last** `create or replace function public.undo_change` across `supabase/migrations/` rather than naming a file.
2. Add `selections_reset_at` to `REAL_CREW_COLUMNS` **and to the required-column subset**. `REAL_CREW_COLUMNS` is an *allowlist* — it asserts every INSERT column is real, so adding an entry can never make an omission fail. The required subset is the assertion that a column is *present* (`expect(insertCols).toContain(required)`). Adding to only the allowlist leaves Step 2's mutation passing, which is exactly the vacuity this task exists to remove.

- [ ] **Step 2: Verify it now guards something**

Temporarily remove `selections_reset_at` from the new migration's INSERT list and confirm the test **fails**; restore it and confirm it passes. A guard that cannot fail is not a guard.

- [ ] **Step 3: Commit**

```bash
git add tests/db/undo-change-no-phantom-columns.test.ts
git commit -m "test(db): point the phantom-columns guard at the shipped undo_change body"
```

---

### Task 11: Adopt the shared emit helper; repair the two finalize routes

**Files:**
- Create: lib/sync/emitRoleFlagsNotice.ts (new)
- Modify: the per-row envelope in BOTH finalize routes — carrier for `roleFlagsNotice` **and** `unlandedRenames` (Task 7 deliberately left both to this task, since this is where their tests live)
- Modify: `lib/sync/runScheduledCronSync.ts:2318-2331`, `lib/sync/applyStaged.ts:1993-2002`
- Modify: `app/api/admin/onboarding/finalize/route.ts`, `app/api/admin/onboarding/finalize-cas/route.ts`
- Test: `tests/onboarding/finalize.test.ts`, `tests/onboarding/finalize-cas.test.ts`

**Context — read the spec's §2.3 in full before starting. Three traps:**

1. **The helper already exists.** `emitDeferredRoleFlagsNotice` (`lib/sync/runScheduledCronSync.ts:2318-2331`) is already the intended shape, and `lib/sync/applyStaged.ts:1993-2002` is a near-verbatim duplicate. Export and relocate it; do not write a new one. Take the notice directly rather than a `ProcessOneFileResult` envelope, leaving the guard to callers. **Preserve the ordering**: durable audit BEFORE the throwing `upsertAdminAlert`.
2. **Both obvious emit placements are wrong.** Per row is inside the outer `withTx`'s `tryFinalizeLock` + `FOR UPDATE` session row (invariant 10 violation). Success-path-after-outer is skipped when a later row or the outer commit fails, dropping a notice for a change that already committed. **The trigger is a `finally` after the outer `withTx`** — outside every lock AND unskippable.
3. **The carrier must cross the commit boundary.** Not `PerRowResult` (serialized verbatim into the public response). Not a passed-in accumulator mutated inside the row function — `processApprovedRow` is module-scoped (no closure), and that mutation happens *inside* `sql.begin`, so a row whose commit then fails would emit a **false** audit event. The row callback returns an internal envelope `{ publicResult, roleFlagsNotice?, unlandedRenames? }`; `withRowTx` resolves only after `sql.begin` does, so destructuring at the call site is post-commit by construction.

**Three flush sites, not two:** ordinary finalize, non-streaming finalize-cas, and **streaming** finalize-cas (`app/api/admin/onboarding/finalize-cas/route.ts:1207` / line 1232) — the streaming handler is what the admin finalize button actually uses.

**Do NOT move the two pre-existing emits.** `SHOW_FINALIZED` stays: the two routes deliberately differ on it (ordinary finalize suppresses on outer failure, `tests/onboarding/finalize.test.ts:864`; finalize-cas preserves it, `tests/onboarding/finalize-cas.test.ts:685-686`) and both are pinned. `ONBOARDING_SHADOW_REBUILD_EXHAUSTED` is out of scope — filed as `BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT`.

- [ ] **Step 1: Write the failing tests**

Per route:

- **Unit C:** a LEAD-bit change reaches the bell + durable event.
- **Unit B, and this is the one Task 7 deferred here:** an **unlanded rename pair produces `IDENTITY_LINK_RENAME_UNLANDED`** end-to-end through this route. The response-shape assertion below does NOT cover this — it passes if the field is stripped before ever being emitted, so without this test a dropped finalize emit is invisible.
- **Durability:** row 1 commits, a later row throws (and separately the outer commit fails); assert row 1's notice AND its unlanded event still emit.
- **Ordering:** no emit of either kind while `tryFinalizeLock` is held.
- **Response shape:** `per_row` contains neither `roleFlagsNotice` nor `unlandedRenames`.
- **finalize-cas only:** a throwing `upsertAdminAlert` still reaches `markFinalCasDone`.

Run the durability, ordering and unlanded tests against the **streaming** handler too — it is the one in production use.

**Failure mode:** the durability test is the whole reason for the `finally` — the rejected success-path placement satisfies every other test here. The ordering test is the only thing separating the two rejected placements. The response-shape test catches leaking crew names and capability flags into the public API.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/onboarding/finalize.test.ts tests/onboarding/finalize-cas.test.ts`

- [ ] **Step 3: Extract the helper, then wire the three flush sites**

- [ ] **Step 4: Shrink the topology allowlist**

`tests/sync/_metaLeadRoleAppliedTopology.test.ts:35-38` expects two files; with the helper owning the only `upsertAdminAlert(...roleFlagsNotice` call it becomes one. Update the expectation.

- [ ] **Step 5: Run the full sync + onboarding + log suites**

Run: `pnpm vitest run tests/sync tests/onboarding tests/log`
Expected: PASS, including `tests/log/_metaMutationSurfaceObservability.test.ts` and `tests/log/adminOutcomeBehavior.test.ts`. If the mutation-surface meta-test demands a registry row for a newly-instrumented surface, add it here.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/ app/api/admin/onboarding/ tests/
git commit -m "fix(sync): route every roleFlagsNotice through one helper, flushed outside the lock"
```

---

### Task 12: The remaining two discard sites

**Files:**
- Modify: `lib/sync/runManualStageForFirstSeen.ts:139`, line 170
- Modify: `app/api/admin/pending-ingestions/[id]/retry/route.ts`
- Test: `tests/sync/runManualStageForFirstSeen.test.ts`, retry-route tests

**Context:** `runManualStageForFirstSeen` **builds the notice and then drops it** — it sets `applied.roleFlagsNotice` at line 139 and returns `{ outcome, showId }` at line 170. It runs INSIDE `withRowTryLock` (`app/api/admin/pending-ingestions/[id]/retry/route.ts:370`, line 455), so it must **carry** the notice on its return and its **caller** emits post-commit after that lock resolves (line 468). Asserting it co-emits would demand an emit inside the lock and contradict invariant 10.

- [ ] **Step 1: Write the failing tests** — `runManualStageForFirstSeen` returns the notice; the retry route emits it post-commit.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Carry on the return; emit at the caller.**

- [ ] **Step 4: Run to verify they pass.**

- [ ] **Step 5: Commit**

```bash
git add lib/sync/runManualStageForFirstSeen.ts app/api/admin/pending-ingestions/ tests/
git commit -m "fix(sync): carry the role-flags notice out of first-seen staging and emit it at the caller"
```

---

### Task 13: Repoint the PF11 lock-topology guards (Unit E)

**Files:**
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts:43`, line 46, line 244, line 245
- Modify: `tests/db/undo-change-lock-order.test.ts:15`

**Context — invariant 2 is a P0 and its guards have been reading superseded bodies.** `undo_change` ships from `20260719000001` (and after Task 8, the newer migration) while every PF11 guard inspects `20260608000003`. **Two mechanical hazards make naive repointing WORSE than the status quo:**

1. **Body-delimiter mismatch.** The scanners extract bodies delimited by `$$`, but the shipped `undo_change` uses `$function$` (`supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:11`, closing at line 227). Pointing the current scanner at it discovers **zero** functions and every assertion passes vacuously. The extractor must accept any `$tag$` form, and this task adds a **non-empty self-check** so a future delimiter change fails loudly.
2. **Resolution must UNION, not replace.** `mi11_reject_hold` is defined **only** in `20260608000002` — the new migration replaces `mi11_approve_hold` alone. Swapping the file entry would stop discovering it. Resolve **per function** (for each lock-taking name, scan its LAST defining migration), and assert the discovered function-name set still contains every name it contained before.

**There are TWO stale lists** in `advisoryLockRpcDeadlock.test.ts` (line 43/line 46 and line 244/line 245). Repairing one leaves the guard half-blind. The correct pattern is already in that file — `reset_validation_data` derives its defining migration, with the reason stated inline at lines 47-50.

- [ ] **Step 1: Prove the hazard first**

Point the existing scanner at `20260719000001` and confirm it discovers zero functions. This is the evidence that motivates the extractor change — do it before changing anything.

- [ ] **Step 2: Write the failing tests** — a dollar-tag-tolerant extractor finds the `$function$` body; the resolved function-name set is non-empty and still contains `mi11_reject_hold`.

- [ ] **Step 3: Run to verify they fail.**

- [ ] **Step 4: Implement per-function derived resolution + the tolerant extractor + the self-check.**

- [ ] **Step 5: Run both guards**

Run: `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts tests/db/undo-change-lock-order.test.ts`
Expected: PASS, now against the bodies that actually ship.

- [ ] **Step 6: Commit**

```bash
git add tests/auth/advisoryLockRpcDeadlock.test.ts tests/db/undo-change-lock-order.test.ts
git commit -m "test(auth): resolve PF11 lock-topology guards to the shipped function bodies"
```

---

### Task 14: Full suite, validation apply, and close-out

- [ ] **Step 1: Full local verification**

```bash
pnpm tsc --noEmit && pnpm lint && npx prettier --check . && pnpm vitest run
```

- [ ] **Step 2: Apply BOTH replaced functions to the validation project**

```bash
supabase db query --linked -f supabase/migrations/20260804000000_undo_change_selections_reset_at.sql
supabase db query --linked "notify pgrst, 'reload schema';"
```

**This step is unguarded.** The `validation-schema-parity` gate compares the public column/table manifest only and **never inspects functions** (`BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED`, BACKLOG.md). Both layers pass whether or not this migration reached validation. Do not skip it because CI is green.

- [ ] **Step 3: Confirm the invariant-8 marker**

The plan carries `impeccable-gate: N/A — no UI surface`. Verify with `git diff --name-only origin/main...HEAD` that no file under `components/` or `app/` (except `app/api/**`) is in the diff.

- [ ] **Step 4: Commit any residue and push**

---

## Self-review

**1. Spec coverage.** Unit A → Tasks 1-5. Unit B → Tasks 6-7. Unit C → Tasks 11-12. Unit D → Tasks 8-10. Unit E → Task 13. Close-out → Task 14. Spec §7's test table: every row maps to a task above. §5.1's validation caveat → Task 14 Step 2. §8's documented limits are limits, not work.

**2. Placeholder scan.** Tasks 7, 11, 12 and 13 carry compressed step bodies (the failing-test step names each test and its failure mode, but does not paste every assertion). This is deliberate for the multi-site wiring tasks, where the test bodies are near-duplicates across four sinks and the exact fixtures depend on each route's existing harness. **The executing agent must read the spec section named in each task's Context block before writing those tests.**

**3. Type consistency.** `UnlandedRename` / `UnlandedRenameReason` are defined in Task 2 and used identically in Tasks 3, 4, 6, 7. `renameCrewMember: Promise<boolean>` is defined in Task 1 and consumed in Task 2. `landedRenames` is `IdentityLinkRename[]` throughout. `sourceSurvived` is on the unlanded entry, never on the pair.

**4. Helper-name verification (rule 21).** Run against the live test files, and it caught three real defects in the first draft, all now fixed in Task 2: `makeTx()` takes **no** arguments (vary its `vi.fn` handle instead); the args builder is `baseArgs(previousCrewNames, nextCrew, identityLinkRenames?)` **positionally**, not an options object; and `baseArgs` has no hold knobs, so the held-name cases move to the db test file that already wires `holdPort`. Task 1's db helpers verified as `_holdAwareTestkit` exports (`tests/sync/applyParseResult.identityLink.db.test.ts:16-26`).

**5. Known residue for the plan review to target:**
- Tasks 7, 11, 12, 13 carry compressed step bodies — named tests and failure modes, but not every assertion pasted. Deliberate (near-duplicate bodies across four sinks, each depending on its route's harness), and each names the spec section to read first. A reviewer should judge whether that is enough for an implementer with no context.
- Task 4's crew-member literals are shape-illustrative; the real `CrewMemberRow` has more fields, and the file's `crew()` builder should be used.
- Tasks 11 and 12 name emit points but not the exact accumulator variable names — intentionally, since three routes have different existing local naming.

---

## Remaining checklist

- [ ] Plan self-review (above)
- [ ] **Adversarial review (cross-model)** — dispatch via `codex-guard` to APPROVE, no round budget
- [ ] Execution handoff
