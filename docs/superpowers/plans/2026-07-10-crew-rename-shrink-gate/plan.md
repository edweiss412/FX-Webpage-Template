# Crew Rename Shrink-Gate Seam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the drop+add (rename/swap) bypass of the published-show crew-shrink gate and preserve `crew_members.id` (picker continuity) across classified renames, per spec `docs/superpowers/specs/2026-07-10-crew-rename-shrink-gate.md` (APPROVED, 4 adversarial rounds).

**Architecture:** Three seams. (1) `runPhase1` gains removal-class hold items (MI-13/MI-14 pairs + orphan-removes) for published shows, replacing the `crewDrop === 1` synthetic; `describeShrink` renders the new item kinds. (2) A pure `computeIdentityLinkRenames(notableItems, accepted)` feeds a new optional `Phase2Args.identityLinkRenames`, threaded to `applyParseResult`, which renames rows in place (new required tx method `renameCrewMember`) before the delete+upsert. (3) DB e2e + undo round-trip tests pin the seams.

**Tech Stack:** TypeScript, vitest, postgres.js (local Supabase for `.db` tests). No migrations, no UI files, no new telemetry codes.

## Global Constraints

- TDD per task: failing test → minimal implementation → green → commit (`<type>(<scope>): <summary>`), one task per commit, `--no-verify` (worktree).
- Advisory-lock single-holder: every touched write already runs inside the JS-held show lock in `runScheduledCronSync.ts`; `renameCrewMember` is a plain tx statement under it (same layer as `upsertCrewMembers`). NO new lock acquisition anywhere.
- Email canonicalization untouched (rename writes `name` only; `upsertCrewMembers` already canonicalizes at `runScheduledCronSync.ts:1599`).
- No raw codes in user-visible strings: `describeShrink` emits human words only.
- exactOptionalPropertyTypes discipline: spread-conditional optional fields (`...(x !== undefined ? { x } : {})`), never `x: undefined`.
- Meta-test inventory (spec §7): none created/extended. `_metaInfraContract` N/A (postgres.js tx, no supabase client calls); `advisoryLockRpcDeadlock` unchanged (no new holder); mutation-surface walker unaffected (no new route/action); no-inline-email-normalization unaffected. Do NOT mention retired m9.5 surface names (e.g. the dropped session table) in any test file — `tests/cross-cutting/no-m9-5-surfaces.test.ts` walks `tests/`.
- Run the module-scoped suites after each task; FULL `pnpm test` + `pnpm typecheck` + `pnpm lint` + `pnpm format:check` + `pnpm build` in Task 5 before review/push.

## File Structure

- Modify `lib/sync/phase1.ts` — gate filter + `describeShrink` (Task 1)
- Create `lib/sync/identityLinkRenames.ts` — pure classifier (Task 3)
- Modify `lib/sync/applyParseResult.ts` — tx interface + linked-rename apply (Task 2)
- Modify `lib/sync/runScheduledCronSync.ts` — `PostgresPipelineTx.renameCrewMember` (Task 2); orchestrator computation + Phase2 arg (Task 3)
- Modify `lib/sync/phase2.ts` — `Phase2Args.identityLinkRenames` + threading (Task 3)
- Modify `tests/sync/_applyStagedCoreTestkit.ts` — `spyTx()` stub for `renameCrewMember` (Task 2)
- Modify `tests/sync/phase1.test.ts` (Task 1), `tests/sync/applyParseResult.identityLink.test.ts` NEW (Task 2), `tests/sync/identityLinkRenames.test.ts` NEW (Task 3), `tests/sync/resyncShrinkHold.db.test.ts` (Task 3), `tests/db/undo-change-direction-a.test.ts` (Task 4)

---

### Task 1: Gate re-key + describeShrink (spec §3.1–§3.2; tests 1–8)

**Files:**
- Modify: `lib/sync/phase1.ts:220-237` (describeShrink), `lib/sync/phase1.ts:436-446` (synthetic block)
- Test: `tests/sync/phase1.test.ts`

**Interfaces:**
- Consumes: `TriggeredReviewItem` union (`lib/parser/types.ts:490-501`), existing `materialShrinkItems` filter (`phase1.ts:430-435`, untouched).
- Produces: `shrink_held` outcomes whose `message` includes `possible rename: "X" → "Y"` (MI-13/MI-14), `crew removed: "X"` (orphan-removes), capped at 8 parts + `+N more`.

- [ ] **Step 1: Write failing tests** in `tests/sync/phase1.test.ts`, using the file's existing `crew()`, `parseResult()`, `runWith()`, `FakePhase1Tx` helpers and the existing published-show fixture pattern (`shows.set` with `priorParseResult: parseResult(...)`, `published: true` — copy the shape used at `tests/sync/phase1.test.ts:288-290`). Derive all expectations from fixture crew arrays (anti-tautology).

```ts
describe("crew removal-class publish gate (BL-CREW-RENAME-SILENT-REPLACEMENT)", () => {
  function publishedShow(tx: FakePhase1Tx, prior: ParseResult) {
    // copy the exact FakeShowRow shape used by the existing shrink tests in this file
    tx.shows.set("file-1", {
      id: "show-1",
      priorParseResult: prior,
      lastSeenModifiedTime: "2026-05-01T00:00:00.000Z",
      published: true,
      lastSyncStatus: "ok",
      lastSyncError: null,
    } as FakeShowRow);
  }

  test("net-zero MI-13-shape rename (email differs, similar name) holds", async () => {
    const tx = new FakePhase1Tx();
    publishedShow(tx, parseResult({ crewMembers: [crew("Jon Smith", { email: "jon@x.example" })] }));
    const next = parseResult({ crewMembers: [crew("John Smith", { email: "john@x.example" })] });
    const result = await runWith(tx, next);
    expect(result.outcome).toBe("shrink_held");
    expect((result as { message: string }).message).toContain(
      'possible rename: "Jon Smith" → "John Smith"',
    );
  });

  test("net-zero MI-12 rename (same canonical email) does NOT hold", async () => {
    const tx = new FakePhase1Tx();
    publishedShow(tx, parseResult({ crewMembers: [crew("Jon Smith", { email: "jon@x.example" })] }));
    const next = parseResult({ crewMembers: [crew("John Smith", { email: "JON@x.example" })] });
    const result = await runWith(tx, next);
    expect(result.outcome).not.toBe("shrink_held");
  });

  test("net-zero swap (dissimilar names, different emails) holds with crew-removed part", async () => {
    const tx = new FakePhase1Tx();
    publishedShow(tx, parseResult({ crewMembers: [crew("Sally Alpha", { email: "sally@x.example" })] }));
    const next = parseResult({ crewMembers: [crew("Bob Zulu", { email: "bob@x.example" })] });
    const result = await runWith(tx, next);
    expect(result.outcome).toBe("shrink_held");
    expect((result as { message: string }).message).toContain('crew removed: "Sally Alpha"');
  });

  test("single drop with no add still holds (regression pin for #359)", async () => {
    const tx = new FakePhase1Tx();
    const prior = parseResult({
      crewMembers: [crew("Alice", { email: "alice@x.example" }), crew("Bob", { email: "bob@x.example" })],
    });
    publishedShow(tx, prior);
    const next = parseResult({ crewMembers: [crew("Alice", { email: "alice@x.example" })] });
    const result = await runWith(tx, next);
    expect(result.outcome).toBe("shrink_held");
  });

  test("unpublished show: same rename edit auto-applies (no hold)", async () => {
    const tx = new FakePhase1Tx();
    tx.shows.set("file-1", {
      id: "show-1",
      priorParseResult: parseResult({ crewMembers: [crew("Jon Smith", { email: "jon@x.example" })] }),
      lastSeenModifiedTime: "2026-05-01T00:00:00.000Z",
      published: false,
      lastSyncStatus: "ok",
      lastSyncError: null,
    } as FakeShowRow);
    const next = parseResult({ crewMembers: [crew("John Smith", { email: "john@x.example" })] });
    const result = await runWith(tx, next);
    expect(result.outcome).not.toBe("shrink_held");
  });

  test("acceptShrink + matching modifiedTime falls through; mismatch re-holds", async () => {
    const prior = parseResult({ crewMembers: [crew("Jon Smith", { email: "jon@x.example" })] });
    const next = parseResult({ crewMembers: [crew("John Smith", { email: "john@x.example" })] });

    const txAccept = new FakePhase1Tx();
    publishedShow(txAccept, prior);
    const accepted = await runWith(txAccept, next, {
      acceptShrink: true,
      expectedModifiedTime: baseArgs.binding.modifiedTime,
    });
    expect(accepted.outcome).not.toBe("shrink_held");

    const txStale = new FakePhase1Tx();
    publishedShow(txStale, prior);
    const stale = await runWith(txStale, next, {
      acceptShrink: true,
      expectedModifiedTime: "2020-01-01T00:00:00.000Z",
    });
    expect(stale.outcome).toBe("shrink_held");
  });

  test("message caps at 8 parts with +N more", async () => {
    const priorCrew = Array.from({ length: 10 }, (_, i) =>
      crew(`Member Q${i}`, { email: `q${i}@x.example` }),
    );
    const tx = new FakePhase1Tx();
    publishedShow(tx, parseResult({ crewMembers: priorCrew }));
    const next = parseResult({ crewMembers: [] }); // 10 removals → MI-6 + 10 orphan items
    const result = await runWith(tx, next);
    expect(result.outcome).toBe("shrink_held");
    const message = (result as { message: string }).message;
    expect(message.split("; ").length).toBe(9); // 8 parts + "+N more"
    expect(message).toMatch(/\+\d+ more$/);
  });
});
```

Fill the two sketched bodies (`unpublished`, `acceptShrink`) with the same concrete helper calls — the acceptShrink overrides object is passed as `runWith(tx, next, { acceptShrink: true, expectedModifiedTime: ... })` (fields land on Phase1Args; see existing accept tests in this file if present, else `lib/sync/phase1.ts` Phase1Args fields).

Note: the MI-14 pair shape (both emails null) is covered by adding one more test cloning the MI-13 case with `email: null` on both sides — include it. The `→` arrow inside message assertions is intentional ratified spec copy (§3.2), not an ASCII-rule violation.

Also add the onboarding pin (spec test 6):

```ts
  test("onboarding_scan mode: same rename edit never holds", async () => {
    const tx = new FakePhase1Tx();
    publishedShow(tx, parseResult({ crewMembers: [crew("Jon Smith", { email: "jon@x.example" })] }));
    const next = parseResult({ crewMembers: [crew("John Smith", { email: "john@x.example" })] });
    const result = await runWith(tx, next, { mode: "onboarding_scan" });
    expect(result.outcome).not.toBe("shrink_held");
  });
```

(Belt over the real path's blinded `readShowForPhase1`: even with a show row visible, the explicit `mode` gate must refuse the hold. No orchestrator-level onboarding link pin is needed — `notableItems` is only computed for `pass`/`auto_apply_with_holds` outcomes (`runScheduledCronSync.ts:3329-3333`) and onboarding stages, never applies.)

- [ ] **Step 2: Run** `pnpm exec vitest run tests/sync/phase1.test.ts` — new tests FAIL (net-zero cases currently pass through; cap test gets uncapped message).

- [ ] **Step 3: Implement in `lib/sync/phase1.ts`.** (a) Replace the synthetic block at 436-446:

```ts
  // BL-CREW-RENAME-SILENT-REPLACEMENT (spec 2026-07-10): a PUBLISHED show holds on EVERY
  // crew-removal-class item — MI-13/MI-14 pairs (heuristic rename candidates) and their
  // orphan-removes (true removals, incl. the net-zero drop+add swap the old crewDrop === 1
  // synthetic missed). MI-12 pairs are deliberately EXCLUDED: same canonical email = same
  // person → identity-linked auto-apply (computeIdentityLinkRenames in the orchestrator).
  // Coverage lemma: every removed name lands in exactly one of MI-12/MI-13/MI-14 pair or
  // MI-13/MI-14-orphan-remove (invariants.ts pairing cascade), so this subsumes the #359
  // single-drop synthesis it replaces. Unpublished / first-seen / onboarding_scan excluded.
  if (show && args.mode !== "onboarding_scan" && show.published) {
    for (const item of reviewItems) {
      if (
        item.invariant === "MI-13" ||
        item.invariant === "MI-14" ||
        item.invariant === "MI-13-orphan-remove" ||
        item.invariant === "MI-14-orphan-remove"
      ) {
        materialShrinkItems.push(item);
      }
    }
  }
```

(b) Extend `describeShrink` (220-237): add cases + cap.

```ts
const MAX_SHRINK_PARTS = 8;
```

```ts
    } else if (item.invariant === "MI-13" || item.invariant === "MI-14") {
      parts.push(`possible rename: "${item.removed_name}" → "${item.added_name}"`);
    } else if (
      item.invariant === "MI-13-orphan-remove" ||
      item.invariant === "MI-14-orphan-remove"
    ) {
      parts.push(`crew removed: "${item.removed_name}"`);
    }
```

and replace the return:

```ts
  if (parts.length > MAX_SHRINK_PARTS) {
    const extra = parts.length - MAX_SHRINK_PARTS;
    return [...parts.slice(0, MAX_SHRINK_PARTS), `+${extra} more`].join("; ");
  }
  return parts.join("; ");
```

- [ ] **Step 4: Run** `pnpm exec vitest run tests/sync/phase1.test.ts` — ALL pass (new + existing; the old `crewDrop === 1` tests must stay green via orphan-remove coverage — if one asserts on the synthetic MI-6 item specifically, update it to the removal-class item while keeping the `shrink_held` outcome assertion).

- [ ] **Step 5: Commit** `fix(sync): hold published shows on crew removal-class items, not net crew delta`

### Task 2: Identity-preserving apply + `renameCrewMember` tx method (spec §3.4; tests 9–12)

**Files:**
- Modify: `lib/sync/applyParseResult.ts:31-58` (interface), `:120-140` (apply flow)
- Modify: `lib/sync/runScheduledCronSync.ts` (PostgresPipelineTx, next to `upsertCrewMembers` at 1577)
- Modify: `tests/sync/_applyStagedCoreTestkit.ts:92-151` (spyTx stub)
- Create: `tests/sync/applyParseResult.identityLink.test.ts`

**Interfaces:**
- Consumes: `ApplyParseResultTx` (`applyParseResult.ts:31`), `heldNames`/`deleteProtectedNames` from the hold plan (`applyParseResult.ts:103-118`).
- Produces: `renameCrewMember(showId: string, removedName: string, addedName: string): Promise<void>` REQUIRED on `ApplyParseResultTx`; `ApplyParseResultArgs.identityLinkRenames?: Array<{ removedName: string; addedName: string }>`; rename calls ordered BEFORE `deleteCrewMembersNotIn`.

- [ ] **Step 1: Write failing tests** in new `tests/sync/applyParseResult.identityLink.test.ts` using a local spy tx modeled on `spyTx()` from `tests/sync/_applyStagedCoreTestkit.ts` (or import it if its snapshot/args shape fits applyParseResult directly — check its usage in `tests/sync/applyStagedCore.test.ts` first; if it's applyStagedCore-shaped, build a minimal local fake implementing `ApplyParseResultTx` with an `ops: string[]` log). Cases:

```ts
test("linked pair renames BEFORE delete and both before upsert", async () => {
  // prior crew ["Jon"], next crew ["John"], identityLinkRenames [{removedName:"Jon", addedName:"John"}]
  // assert tx.ops ordering: ["renameCrewMember:Jon→John", "deleteCrewMembersNotIn", "upsertCrewMembers", ...]
});
test("pair skipped when removedName not in previous crew", async () => { /* no renameCrewMember op */ });
test("pair skipped when addedName absent from post-hold next crew", async () => { /* no op */ });
test("pair skipped when removedName is held", async () => {
  // CONCRETE CONTRACT (plan-R1 M3): use tests/sync/_holdAwareTestkit.ts REAL-DB helpers —
  // `seedShow`, `seedCrew`, `holdPort(tx)` (exports at _holdAwareTestkit.ts:22,84,95). Seed the
  // show + crew "Jon"; insert an open sync_holds row with domain 'crew_identity' and
  // entity_key 'Jon' (copy the insert shape an existing test in tests/sync/holdAwareApply*
  // uses with this testkit); run applyParseResult with holds: { port, baseModifiedTime } and
  // identityLinkRenames [{removedName:"Jon", addedName:"John"}]. The hold plan puts "Jon" in
  // heldNames → assert the crew row still has its ORIGINAL name (no rename applied) via
  // readCrew (_holdAwareTestkit.ts:119). This is a .db test — put it in the db-suite variant
  // of this file (applyParseResult.identityLink.db.test.ts) alongside the direct SQL tests in
  // Step 1b if mixing unit+db in one file fights the project config.
});
test("duplicate pair (same removedName twice) consumes first only", async () => {
  // identityLinkRenames [{Jon→John}, {Jon→Johnny}] → exactly one renameCrewMember op
});
test("empty/absent identityLinkRenames leaves op sequence identical to today", async () => {
  // snapshot ops with and without `identityLinkRenames: []` — identical
});
```

Write real bodies (fixture crew objects with `name`/`email`/`phone`/`role`/`role_flags`/`date_restriction`/`stage_restriction`/`flight_info`, mirroring `parseResult().crewMembers` element shape from `tests/sync/phase1.test.ts:105-140`), a minimal `args.snapshot` (`showId`, `previousCrewNames`, plus whatever `applyParseResult` requires — copy from an existing applyParseResult-driving test such as `tests/sync/applyParseResultScheduleDay.test.ts`).

- [ ] **Step 1b: Write failing DIRECT SQL tests** in new `tests/sync/applyParseResult.identityLink.db.test.ts` (real Postgres, loopback-guarded like siblings), against the exported real tx factory `makeSyncPipelineTx(tx)` (`lib/sync/runScheduledCronSync.ts:1777`) — NOT a copy of the SQL (anti-tautology). Rationale (plan-R1 M4): a sync-produced pair's `addedName` is next-minus-prior by construction, so a target-name collision is unreachable through the pipeline; the `NOT EXISTS` guard is defensive and must be pinned at the method level:

```ts
test("renameCrewMember renames in place preserving id", async () => {
  // seedShow + seedCrew(["Jon"]) via _holdAwareTestkit; capture id via readCrew
  // await sql.begin((tx) => makeSyncPipelineTx(tx).renameCrewMember(showId, "Jon", "John"))
  // readCrew → one row "John" with the captured id; no row "Jon"
});
test("renameCrewMember no-ops on target-name collision (no unique violation)", async () => {
  // seedCrew(["Jon", "John"]); call renameCrewMember(showId, "Jon", "John")
  // expect NO throw; both rows unchanged (names and ids identical to seed)
});
test("renameCrewMember no-ops when source row missing", async () => {
  // call renameCrewMember(showId, "Ghost", "Anyone") → no throw, crew table unchanged
});
```

Plus the held-guard test from Step 1 (it needs the real hold port — same file).

- [ ] **Step 2: Run** `pnpm exec vitest run tests/sync/applyParseResult.identityLink.test.ts` — FAIL (`renameCrewMember` not a function / arg unknown).

- [ ] **Step 3: Implement.**

(a) `applyParseResult.ts` interface (after `upsertCrewMembers` in `ApplyParseResultTx`):

```ts
  renameCrewMember(showId: string, removedName: string, addedName: string): Promise<void>;
```

(b) `ApplyParseResultArgs` gains:

```ts
  identityLinkRenames?: Array<{ removedName: string; addedName: string }>;
```

(c) In the apply flow, immediately BEFORE `await tx.deleteCrewMembersNotIn(...)` (line 135):

```ts
  // Identity-preserving renames (spec §3.4): rename the prior row in place so crew_members.id
  // (the picker cookie key) survives. MUST run before deleteCrewMembersNotIn — delete-first
  // would drop the old-name row and leave nothing to rename. A skipped pair degrades to
  // today's delete+insert, which is fail-safe (re-pick banner, never a wrong identity).
  const previousNamesSet = new Set(args.snapshot.previousCrewNames);
  const nextNamesSet = new Set(nextCrewNames);
  const consumedRenameNames = new Set<string>();
  for (const pair of args.identityLinkRenames ?? []) {
    if (!previousNamesSet.has(pair.removedName)) continue;
    if (!nextNamesSet.has(pair.addedName)) continue;
    if (heldNames.has(pair.removedName) || heldNames.has(pair.addedName)) continue;
    if (deleteProtectedNames.includes(pair.removedName)) continue;
    if (consumedRenameNames.has(pair.removedName) || consumedRenameNames.has(pair.addedName)) continue;
    consumedRenameNames.add(pair.removedName);
    consumedRenameNames.add(pair.addedName);
    await tx.renameCrewMember(args.snapshot.showId, pair.removedName, pair.addedName);
  }
```

(d) `PostgresPipelineTx` in `runScheduledCronSync.ts` (next to `upsertCrewMembers`, ~1577):

```ts
  async renameCrewMember(showId: string, removedName: string, addedName: string) {
    // Guarded, idempotent, at-most-one-row: the NOT EXISTS makes a target-name collision or a
    // re-run a no-op instead of a unique (show_id, name) violation; the subsequent
    // upsertCrewMembers refreshes every parsed field on the renamed row.
    await this.rows(
      `
        update public.crew_members
           set name = $3
         where show_id = $1 and name = $2
           and not exists (
             select 1 from public.crew_members where show_id = $1 and name = $3
           )
      `,
      [showId, removedName, addedName],
    );
  }
```

(e) `spyTx()` in `_applyStagedCoreTestkit.ts`: add a `renameCrewMember` stub recording to `ops` like its siblings. (f) Typecheck sweep: `pnpm typecheck` — fix EVERY fake/mock the compiler flags for the new required method (expected: the testkit(s) + any inline fakes in `tests/sync/applyRawParseNoOverride.test.ts`, `tests/sync/applyStagedCore.test.ts`, `tests/sync/sourceAnchorsPipeline.test.ts`, `tests/sync/quality-regressed-producer.test.ts`, `tests/sync/_holdAwareTestkit.ts`, `tests/onboarding/wizardApplyLivePartitionCoexistence.db.test.ts` — add the same one-line stub to each).

- [ ] **Step 4: Run** `pnpm exec vitest run tests/sync/applyParseResult.identityLink.test.ts tests/sync/applyParseResult.identityLink.db.test.ts tests/sync/applyStagedCore.test.ts tests/sync/applyRawParseNoOverride.test.ts && pnpm typecheck` — PASS (db file needs local Supabase up; `pnpm preflight` green first).

- [ ] **Step 5: Commit** `feat(sync): identity-preserving crew rename in applyParseResult (renameCrewMember tx)`

### Task 3: Classifier + orchestration threading, driven RED by the DB seam tests (spec §3.3; tests 12–14)

**Files:**
- Create: `lib/sync/identityLinkRenames.ts`
- Modify: `lib/sync/phase2.ts:76-118` (Phase2Args) + apply call (~369)
- Modify: `lib/sync/runScheduledCronSync.ts:3382-3401` (arg build in `processOneFile_unlocked`)
- Test: `tests/sync/identityLinkRenames.test.ts` (new), `tests/sync/phase2.test.ts` (threading case), `tests/sync/resyncShrinkHold.db.test.ts` (e2e seam tests — written RED in this task, per TDD; they are the acceptance tests this task exists to satisfy)

**Interfaces:**
- Consumes: `TriggeredReviewItem[]` (`notableItems` at `runScheduledCronSync.ts:3329`), `deps.acceptShrink`/`deps.expectedModifiedTime` (`runScheduledCronSync.ts:3212-3213` region), `pipeline.binding.modifiedTime`.
- Produces: `export type IdentityLinkRename = { removedName: string; addedName: string }`; `export function computeIdentityLinkRenames(items: TriggeredReviewItem[], acceptedThisVersion: boolean): IdentityLinkRename[]`; `Phase2Args.identityLinkRenames?: IdentityLinkRename[]`.

- [ ] **Step 1: Write failing tests** in `tests/sync/identityLinkRenames.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { computeIdentityLinkRenames } from "@/lib/sync/identityLinkRenames";
import type { TriggeredReviewItem } from "@/lib/parser/types";

const mi12: TriggeredReviewItem = { id: "1", invariant: "MI-12", removed_name: "Jon", added_name: "John", email: "j@x.example" };
const mi13: TriggeredReviewItem = { id: "2", invariant: "MI-13", removed_name: "Sam A", added_name: "Sam B" };
const mi14: TriggeredReviewItem = { id: "3", invariant: "MI-14", removed_name: "Pat A", added_name: "Pat B" };
const orphan: TriggeredReviewItem = { id: "4", invariant: "MI-13-orphan-remove", removed_name: "Gone" };

test("MI-12 always links; MI-13/14 only when accepted; orphans never", () => {
  expect(computeIdentityLinkRenames([mi12, mi13, mi14, orphan], false)).toEqual([
    { removedName: "Jon", addedName: "John" },
  ]);
  expect(computeIdentityLinkRenames([mi12, mi13, mi14, orphan], true)).toEqual([
    { removedName: "Jon", addedName: "John" },
    { removedName: "Sam A", addedName: "Sam B" },
    { removedName: "Pat A", addedName: "Pat B" },
  ]);
});
test("empty items → empty", () => {
  expect(computeIdentityLinkRenames([], true)).toEqual([]);
});
```

And in `tests/sync/phase2.test.ts` a threading case: build the file's existing fake Phase2Tx (it now has `renameCrewMember` from Task 2's sweep), call `runPhase2` with `identityLinkRenames: [{ removedName, addedName }]` matching a prior→next crew rename, assert the fake recorded a `renameCrewMember` call (proves Phase2Args→applyParseResult threading; copy the fixture pattern of an existing apply-path test in that file).

- [ ] **Step 1b: Write the failing END-TO-END seam tests** in `tests/sync/resyncShrinkHold.db.test.ts` (same harness: `processOneFile` + `runManualSyncForShow`, `makeParse` — file lines 40-100; add a local `readCrewRow(showId, name)` helper mirroring the file's existing row reads). These go RED now because nothing threads `identityLinkRenames` yet — they are the acceptance tests for this task (plan-R1 H1):

```ts
test("MI-12 rename end-to-end: no hold, crew_members.id preserved, feed parity", async () => {
  // seed + first sync with crew [{name: "Link Crew A", email: "linka@x.example"}] (published)
  // const before = await readCrewRow(showId, "Link Crew A"); // capture id
  // re-sync (cron processOneFile) with crew [{name: "Link Crew A2", email: "linka@x.example"}]
  // assert applied (not shrink_held)
  // const after = await readCrewRow(showId, "Link Crew A2");
  // expect(after.id).toBe(before.id); expect(await readCrewRow(showId, "Link Crew A")).toBeNull();
  // FEED PARITY (spec test 12): exactly one crew_renamed auto_apply row, zero crew_removed/added
  // rows naming either side (select change_kind, entity_ref from show_change_log for this show).
});
test("MI-13 rename end-to-end: hold; STALE accept stays held; version-bound accept links", async () => {
  // re-sync with {name: "Link Crew A2", email: "different@x.example"} → expect shrink_held
  // manual re-sync with acceptShrink: true + expectedModifiedTime: "2020-01-01T00:00:00.000Z"
  //   → STILL shrink_held; crew row unchanged (id + old name). Pins the version-bound predicate
  //   end-to-end (plan-R1 M5); the orchestrator predicate can only diverge inertly (phase1
  //   re-holds first), and this assertion locks that behavior.
  // manual re-sync with acceptShrink: true + expectedModifiedTime = the HELD modifiedTime
  //   → applies; same id; new name AND new email on the row.
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run tests/sync/identityLinkRenames.test.ts tests/sync/phase2.test.ts` — FAIL (module missing / arg dropped); run the db file (same invocation the file documents) — the two new e2e tests FAIL (id changes on rename; MI-13 accept applies without link).

- [ ] **Step 3: Implement.**

(a) `lib/sync/identityLinkRenames.ts`:

```ts
import type { TriggeredReviewItem } from "@/lib/parser/types";

export type IdentityLinkRename = { removedName: string; addedName: string };

/**
 * Spec §3.3 (2026-07-10-crew-rename-shrink-gate): MI-12 pairs (email-anchored, same person)
 * always identity-link; MI-13/MI-14 heuristic pairs link ONLY on the version-bound accepted
 * apply (the admin confirm is the vouch). Orphans and every other item never link.
 * Pairing is one-to-one by construction (invariants.ts:634,647,687,705,748,764,781).
 */
export function computeIdentityLinkRenames(
  items: TriggeredReviewItem[],
  acceptedThisVersion: boolean,
): IdentityLinkRename[] {
  const out: IdentityLinkRename[] = [];
  for (const item of items) {
    if (
      item.invariant === "MI-12" ||
      (acceptedThisVersion && (item.invariant === "MI-13" || item.invariant === "MI-14"))
    ) {
      out.push({ removedName: item.removed_name, addedName: item.added_name });
    }
  }
  return out;
}
```

(b) `phase2.ts`: add to `Phase2Args`:

```ts
  identityLinkRenames?: IdentityLinkRename[];
```

(import the type) and thread at the `applyParseResult` call (~369):

```ts
      ...(args.identityLinkRenames !== undefined
        ? { identityLinkRenames: args.identityLinkRenames }
        : {}),
```

(c) `processOneFile_unlocked` (`runScheduledCronSync.ts`, in the Phase2-args build at 3382-3401): compute once, spread conditionally:

```ts
  const acceptedShrinkThisVersion =
    deps.acceptShrink === true && deps.expectedModifiedTime === pipeline.binding.modifiedTime;
  const identityLinkRenames = computeIdentityLinkRenames(notableItems, acceptedShrinkThisVersion);
```

(use the exact local names for deps/binding in that scope — verify against `runScheduledCronSync.ts:3212-3213` where the same two values feed Phase1Args) and in the args object:

```ts
      ...(identityLinkRenames.length > 0 ? { identityLinkRenames } : {}),
```

- [ ] **Step 4: Run** `pnpm exec vitest run tests/sync/identityLinkRenames.test.ts tests/sync/phase2.test.ts tests/sync/runScheduledCronSync.test.ts && pnpm typecheck`, then the db file — ALL PASS including the Step-1b e2e tests.

- [ ] **Step 5: Commit** `feat(sync): thread MI-12/accepted-MI-13/14 identity-link renames into apply`

### Task 4: Undo round-trip pins (spec §3.5; tests 15–16)

**Files:**
- Modify: `tests/db/undo-change-direction-a.test.ts` (helpers: `seedShowWithCrew`, `runAutoApply`, `readChangeLog`, `callUndoAsAdmin`, `readCrewByName` — see imports at lines 14-26)

**Interfaces:** No production/SQL changes — `undo_change` ships unchanged; these pin the linked shape.

- [ ] **Step 1: Write two tests** following the file's existing seed→apply→undo pattern:

```ts
test("linked-shape crew_renamed undo restores prior name on the SAME crew_members.id", async () => {
  // seed crew "Undo Link A" (email ula@x.example), capture id
  // apply a rename via the real sync path with same email (MI-12 → linked apply from Task 3)
  //   OR, if driving the full sync here is out of this file's pattern, simulate the linked
  //   apply directly: update crew_members set name='Undo Link A2' where id=<captured>; then
  //   insert the applied crew_renamed show_change_log row with before_image built from the
  //   PRIOR row (id INCLUDED) and after_image {name:'Undo Link A2', email:'ula@x.example'} —
  //   mirroring what writeAutoApplyChanges records (readChangeLog an existing rename row in
  //   this file for the exact before_image shape and copy it).
  // callUndoAsAdmin(changeId) → ok:true
  // row named "Undo Link A" exists with id === captured id; "Undo Link A2" absent
  // claimed_via_oauth_at restored (seed it non-null to make the assertion meaningful)
});
test("replaced-shape crew_renamed undo still deletes successor and restores prior id", async () => {
  // existing delete+insert shape: successor row has a DIFFERENT id than before_image.id
  // callUndoAsAdmin → ok:true; successor gone; restored row carries before_image.id
});
```

- [ ] **Step 2: Run** the file with its documented db invocation — both PASS against the UNCHANGED `undo_change` (these are pins, not fixes; if the linked-shape test fails, STOP — the spec §3.5 analysis was wrong; re-open the spec rather than patching SQL ad hoc).

- [ ] **Step 3: Commit** `test(db): pin crew_renamed undo round-trip for linked and replaced shapes`

### Task 5: Close-out gates

- [ ] `pnpm test` (FULL suite — shared-chokepoint rule; includes `tests/messages/`, meta-tests, structural walkers)
- [ ] `pnpm typecheck` && `pnpm lint` && `pnpm format:check` (prettier the new/edited files first: `pnpm exec prettier --write <files>`; NEVER prettier the master spec)
- [ ] `pnpm build` (RSC/bundle regressions — required before push per repo lessons)
- [ ] Update `BACKLOG.md`: mark `BL-CREW-RENAME-SILENT-REPLACEMENT` resolved with PR ref + one-line outcome (branch commit; BACKLOG.md lives in main checkout tree — edit the worktree copy).
- [ ] Commit `docs(plan): close out BL-CREW-RENAME-SILENT-REPLACEMENT` then whole-diff adversarial review → push → PR → real CI green → merge (pipeline Stage 4).

## Advisory-lock holder topology (declared)

Hashkey `show:<driveFileId>` — existing holders: JS-side wrapper around `processOneFile_unlocked` / `runManualSyncForShow_unlocked` (cron try-lock; admin blocking). This plan adds ZERO acquisitions; `renameCrewMember` executes on the already-locked tx. `undo_change` keeps its own existing in-RPC lock on its own surface (untouched). Single-holder rule preserved on every path.

## Fix-round regression budget

Any adversarial finding on a surface S: re-grep the finding's class across `lib/sync/phase1.ts`, `applyParseResult.ts`, `phase2.ts`, `identityLinkRenames.ts`, `runScheduledCronSync.ts` after the patch; re-run `tests/sync/` + the two db files; note both in the round closure.
