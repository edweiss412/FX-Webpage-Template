# Staged Identity-Link Rename Identity Preservation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread `identityLinkRenames` through `applyStagedCore` (choice-aware) so a staged rename preserves `crew_members.id` + `claimed_via_oauth_at`, per `docs/superpowers/specs/2026-08-03-staged-identitylink-rename-identity.md`.

**Architecture:** One new pure helper in `lib/sync/identityLinkRenames.ts` (link a pair iff MI-12/13/14 AND its validated choice action is `rename`, consume-once), one length-gated spread in `applyStagedCore`'s `runPhase2` call, zero phase2/applyParseResult code changes (the arg already exists and is forwarded), the eight-site comment reconciliation of spec §3.3, and the role-flags-spec supersession banner + tags of spec §3.5. TDD per code task; the docs task is declared test-exempt below.

**Tech Stack:** TypeScript, Vitest, postgres.js against local Supabase (db tests live under `tests/db/` with the `_holdsHelpers` kit), existing test kits (`tests/sync/_holdAwareTestkit.ts`, `tests/db/_holdsHelpers.ts`).

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-08-03-staged-identitylink-rename-identity.md`. §1.1 Resolved-scope table is the do-not-relitigate list.
- Caller topology (spec §1.1 #7): dashboard `applyStaged` = live + `feedPolicy: none` + post-commit notice emit; `finalize` = Phase B first-seen only + `feedPolicy: none`; `finalize-cas` = Phase D existing-show + `choice_aware` + notice DISCARDED today (pre-existing gap, backlogged in Task 3, NOT fixed here).
- Invariant 1 (TDD): failing test → minimal implementation → passing test → commit, for every CODE task (Tasks 1-2). Task 3 is docs-only: no test phase by declaration; its verification is `pnpm spec:lint` + the closure greps embedded in its steps. Task 4 is a verification task (runs suites; writes only fixes).
- Invariant 2 (locks): the core adopts, never acquires. No new `pg_advisory*` call sites in production code; the db-test harness takes the lock in the TEST transaction (caller layer) and the core adopts via `adoptShowLockHeld` — the production single-holder topology. `tests/auth/advisoryLockRpcDeadlock.test.ts` must stay green (Task 4).
- Invariant 6 (commits): conventional-commits per task, scope `sync`.
- Invariant 11: all work in the worktree `FX-worktrees/staged-identitylink-rename-identity`, branch `feat/staged-identitylink-rename-identity`.
- Meta-test inventory (writing-plans rule): this plan CREATES no structural meta-test and EXTENDS none. Reasons: no new Supabase client call sites (invariant-9 registry untouched), no lock-topology change (existing deadlock guard pins it; re-run only), no admin alert codes, no mutation surfaces (`tests/log/_metaMutationSurfaceObservability.test.ts` discovers routes/actions; none added), no UI.
- New test files auto-match `BASE_INCLUDE` (`vitest.projects.ts:34`, `tests/**/*.test.ts`) — no testMatch or workflow wiring task needed; db tests under `tests/db/` follow their siblings' environment expectations (local Supabase; CI provides `TEST_DATABASE_URL`).
- No placeholders. Every snippet below was MATERIALIZED in this worktree at plan time and passed `pnpm exec tsc --noEmit` (0 errors) plus the unit runs noted per task, AND the db suite was EXECUTED against local Supabase (TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres): pre-threading red set observed exactly as Step 5 predicts (identity case failed on the fresh-id assertion, notice case A failed on the present notice; independent + held rails passed), post-threading 4/4 green plus the staged undo round-trip 10/10 in its file. The materialization was then reverted so each task's red phase is real. Copy snippets verbatim; if a helper name drifted since plan time, verify with grep and adjust mechanically.

---

### Task 1: `computeStagedIdentityLinkRenames` helper

**Files:**
- Modify: `lib/sync/identityLinkRenames.ts`
- Test: `tests/sync/identityLinkRenames.test.ts`

**Interfaces:**
- Produces: `computeStagedIdentityLinkRenames(items: TriggeredReviewItem[], choices: ReadonlyArray<{ item_id: string; action: string }>): IdentityLinkRename[]` — consumed by Task 2.

- [ ] **Step 1: Write the failing tests** — append to the existing file (fixtures `mi12`/`mi13`/`mi14`/`orphan`/`mi6` already exist at the top; reuse them). Extend the import line to include `computeStagedIdentityLinkRenames`.

```ts
describe("computeStagedIdentityLinkRenames", () => {
  test("rename-resolved MI-12/13/14 link; independent and apply never link", () => {
    expect(
      computeStagedIdentityLinkRenames(
        [mi12, mi13, mi14, orphan, mi6],
        [
          { item_id: "1", action: "rename" },
          { item_id: "2", action: "independent" },
          { item_id: "3", action: "rename" },
          { item_id: "4", action: "apply" },
          { item_id: "5", action: "apply" },
        ],
      ),
    ).toEqual([
      { removedName: "Jon", addedName: "John" },
      { removedName: "Pat A", addedName: "Pat B" },
    ]);
  });

  test("all three pair invariants link on rename choices, MI-13 included", () => {
    expect(
      computeStagedIdentityLinkRenames(
        [mi12, mi13, mi14],
        [
          { item_id: "1", action: "rename" },
          { item_id: "2", action: "rename" },
          { item_id: "3", action: "rename" },
        ],
      ),
    ).toEqual([
      { removedName: "Jon", addedName: "John" },
      { removedName: "Sam A", addedName: "Sam B" },
      { removedName: "Pat A", addedName: "Pat B" },
    ]);
  });

  test("MI-11 items never link regardless of action", () => {
    const mi11: TriggeredReviewItem = {
      id: "6",
      invariant: "MI-11",
      crew_name: "Held",
      prior_email: "a@x.example",
      new_email: "b@x.example",
    };
    expect(
      computeStagedIdentityLinkRenames([mi11], [{ item_id: "6", action: "rename" }]),
    ).toEqual([]);
    expect(computeStagedIdentityLinkRenames([mi11], [{ item_id: "6", action: "apply" }])).toEqual(
      [],
    );
  });

  test("independent-only resolution links nothing", () => {
    expect(
      computeStagedIdentityLinkRenames(
        [mi13, mi14],
        [
          { item_id: "2", action: "independent" },
          { item_id: "3", action: "independent" },
        ],
      ),
    ).toEqual([]);
  });

  test("non-pair invariants never link: all orphan arms, all asset invariants, MI-6 (defensive belt)", () => {
    const nonPairs: TriggeredReviewItem[] = [
      orphan, // MI-13-orphan-remove (existing fixture)
      { id: "7", invariant: "MI-14-orphan-remove", removed_name: "Gone2" },
      { id: "8", invariant: "MI-13-orphan-add", added_name: "New1" },
      { id: "9", invariant: "MI-14-orphan-add", added_name: "New2" },
      { id: "10", invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE", spreadsheet_id: "s1" },
      { id: "11", invariant: "DIAGRAMS_EMBEDDED_NONE_FOUND", spreadsheet_id: "s1" },
      { id: "12", invariant: "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING", drift_count: 1 },
      { id: "13", invariant: "REEL_DRIFT_PENDING", reel_drive_file_id: "r1" },
      mi6,
    ];
    // "rename" is not a valid action for any of these (validation would refuse it); the helper
    // must not link even if handed one; belt for both action shapes.
    for (const action of ["rename", "apply"] as const) {
      expect(
        computeStagedIdentityLinkRenames(
          nonPairs,
          nonPairs.map((item) => ({ item_id: item.id, action })),
        ),
      ).toEqual([]);
    }
  });

  test("consume-once: two pair-items sharing one item_id with a single rename choice link exactly one pair", () => {
    const dupA: TriggeredReviewItem = {
      id: "2",
      invariant: "MI-13",
      removed_name: "Dup A",
      added_name: "Dup A2",
    };
    const dupB: TriggeredReviewItem = {
      id: "2",
      invariant: "MI-14",
      removed_name: "Dup B",
      added_name: "Dup B2",
    };
    expect(
      computeStagedIdentityLinkRenames([dupA, dupB], [{ item_id: "2", action: "rename" }]),
    ).toEqual([{ removedName: "Dup A", addedName: "Dup A2" }]);
  });

  test("missing choice for a pair item links nothing; empty inputs are empty", () => {
    expect(computeStagedIdentityLinkRenames([mi12], [])).toEqual([]);
    expect(computeStagedIdentityLinkRenames([], [])).toEqual([]);
  });
});
```

Failure modes caught: an unvouched pair linking (identity merge of two people), a vouched pair dropping (silent identity churn — the bug this feature fixes), one vouch fanning out to multiple links on a malformed payload, and an MI-13 rename (the heuristic pair with the explicit admin confirm) silently excluded. Expected pairs derive from fixture `removed_name`/`added_name` fields (anti-tautology).

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/sync/identityLinkRenames.test.ts`. Expected: FAIL, `computeStagedIdentityLinkRenames` is not exported.
- [ ] **Step 3: Minimal implementation** — append to `lib/sync/identityLinkRenames.ts`:

```ts
/**
 * Staged-path variant (spec 2026-08-03-staged-identitylink-rename-identity §3.1): the per-item
 * `rename` reviewer choice is the admin confirm, the per-pair form of the vouch the cron
 * helper's `acceptedThisVersion` parameter proxies version-wide. MI-12/13/14 link ONLY when
 * their validated choice action is "rename". `independent` never links (an explicit
 * not-the-same-person ruling); `reject` never reaches Phase 2 (the core discards first).
 * Choices are structurally typed ({ item_id, action }) because applyStagedCore imports this
 * module; importing ReviewerChoice back would be a cycle.
 */
export function computeStagedIdentityLinkRenames(
  items: TriggeredReviewItem[],
  choices: ReadonlyArray<{ item_id: string; action: string }>,
): IdentityLinkRename[] {
  const actionById = new Map(choices.map((choice) => [choice.item_id, choice.action]));
  const out: IdentityLinkRename[] = [];
  // Consume-once belt: validateReviewerChoices rejects duplicate CHOICES but never duplicate item
  // ids in `items`, so a malformed staged payload with two pair-items sharing an id must not turn
  // one vouch into two links. One vouch links at most one pair.
  const consumedItemIds = new Set<string>();
  for (const item of items) {
    if (
      (item.invariant === "MI-12" || item.invariant === "MI-13" || item.invariant === "MI-14") &&
      actionById.get(item.id) === "rename" &&
      !consumedItemIds.has(item.id)
    ) {
      consumedItemIds.add(item.id);
      out.push({ removedName: item.removed_name, addedName: item.added_name });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass** — same command; all cases green (plan-time materialization measured 9 passed).
- [ ] **Step 5: Commit** — `git add lib/sync/identityLinkRenames.ts tests/sync/identityLinkRenames.test.ts && git commit -m "feat(sync): choice-aware staged identity-link rename computation" --no-verify`

---

### Task 2: Thread through `applyStagedCore` — tests first (unit + db + undo), then implementation + eight-site comment reconciliation

All pins are authored BEFORE the implementation so the red set is genuinely red: pre-threading, a staged rename applies as delete+insert, so the identity, notice-case-A, and undo pins fail; the pins of UNCHANGED behavior (independent, held, spread-absent) pass before AND after — regression rails; the red set carries the TDD cycle.

**Files:**
- Modify: `lib/sync/applyStagedCore.ts` (import; compute + spread; step-3 comment)
- Modify: `lib/sync/phase2.ts` (comment-only: arm-(c) + `Phase2Args.identityLinkRenames` field doc)
- Modify: `lib/sync/applyParseResult.ts` (comment-only: arg doc + loop comment)
- Modify: `lib/sync/identityLinkRenames.ts` (comment-only: header vouch doc)
- Modify: `tests/sync/phase2.test.ts` (comment-only: arm-(c) test comment)
- Modify: `tests/sync/selectionsResetAtPreserved.test.ts` (comment-only: header name-change claim)
- Modify: `tests/sync/applyStaged.test.ts` (two spy tests)
- Modify: `tests/db/_holdsHelpers.ts` (add `runStagedApply`; `CrewSeed.role_flags` passthrough)
- Modify: `tests/db/undo-change-direction-a.test.ts` (one staged round-trip case)
- Test: tests/db/stagedApplyIdentityLink.db.test.ts (created by this task; cited without backticks so spec-lint's tracked-file check skips a file that does not exist yet)

**Interfaces:**
- Consumes: `computeStagedIdentityLinkRenames` (Task 1).
- Produces: `runStagedApply(driveFileId, input: { crew: CrewSeed[]; triggeredItems: TriggeredReviewItem[]; reviewerChoices: ReviewerChoice[]; modifiedTime?: string }): Promise<ApplyStagedCoreResult>` in `tests/db/_holdsHelpers.ts`.

- [ ] **Step 1: Spy unit tests** — add to `tests/sync/applyStaged.test.ts` (reuse `fakeTx`/`deps`/`pending`/`applyStaged_unlocked`; the fixture idiom matches the existing "rename reviewer choices" tests):

```ts
test("rename-resolved pairs thread identityLinkRenames to runPhase2; independent does not", async () => {
  const items: TriggeredReviewItem[] = [
    {
      id: "mi12",
      invariant: "MI-12",
      removed_name: "Bob",
      added_name: "Robert",
      email: "bob@test.test",
    },
    { id: "mi13", invariant: "MI-13", removed_name: "Sam A", added_name: "Sam B" },
  ];
  const tx = fakeTx() as LockedShowTx<FakeTx>;
  const syncDeps = deps({
    readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: items })),
  });

  const result = await applyStaged_unlocked(
    tx,
    {
      driveFileId: "drive-file-1",
      sourceScope: "live",
      stagedId: "staged-live",
      reviewerChoices: [
        { item_id: "mi12", action: "rename", rename_value: "Robert" },
        { item_id: "mi13", action: "independent" },
      ],
      appliedByEmail: "doug@fxav.test",
    },
    syncDeps,
  );

  expect(result).toMatchObject({ outcome: "applied" });
  expect(syncDeps.runPhase2).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({
      identityLinkRenames: [{ removedName: "Bob", addedName: "Robert" }],
    }),
  );
});

test("no rename choices: runPhase2 args carry NO identityLinkRenames key (length-gated spread)", async () => {
  const items: TriggeredReviewItem[] = [
    { id: "mi13", invariant: "MI-13", removed_name: "Sam A", added_name: "Sam B" },
  ];
  const tx = fakeTx() as LockedShowTx<FakeTx>;
  const syncDeps = deps({
    readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: items })),
  });

  await applyStaged_unlocked(
    tx,
    {
      driveFileId: "drive-file-1",
      sourceScope: "live",
      stagedId: "staged-live",
      reviewerChoices: [{ item_id: "mi13", action: "independent" }],
      appliedByEmail: "doug@fxav.test",
    },
    syncDeps,
  );

  const phase2Args = vi.mocked(syncDeps.runPhase2!).mock.calls[0]?.[1];
  expect(phase2Args).toBeDefined();
  expect(phase2Args !== undefined && "identityLinkRenames" in phase2Args).toBe(false);
});
```

Failure modes caught: the threading regression itself (the exact bug of `BL-STAGED-IDENTITYLINK-RENAME-IDENTITY`), an unvouched `independent` pair linking (exact-array assertion), spread-when-empty drift from the cron idiom.

- [ ] **Step 2: db harness** — in `tests/db/_holdsHelpers.ts`: (a) add `role_flags?: RoleFlag[]` to `CrewSeed` (import `RoleFlag` from `@/lib/parser/types`), thread it in `seedShowWithCrew`'s INSERT (`${member.role_flags ?? ["A1"]}`) and in `toCrewRow` (`...(member.role_flags ? { role_flags: member.role_flags } : {})`); (b) add imports `applyStagedCore`, `type ApplyStagedCoreResult`, `type ReviewerChoice` from `@/lib/sync/applyStagedCore`, `adoptShowLockHeld` from `@/lib/sync/lockedShowTx`, and `makeSyncPipelineTx` from `@/lib/sync/runScheduledCronSync` (the PRODUCTION SyncPipelineTx: it carries `queryOne` — required by the lock-adoption probe, the core's audit insert, and the live pending_syncs delete — plus `holdPort`; the testkit `phase2Tx` double has NO `queryOne` and would throw at adoption, review R6 finding 1); (c) add beside `runAutoApply`:

```ts
export type StagedApplyInput = {
  crew: CrewSeed[];
  triggeredItems: TriggeredReviewItem[];
  reviewerChoices: ReviewerChoice[];
  modifiedTime?: string;
};

/**
 * Drive a real applyStagedCore staged apply (choice_aware feed) of the given sheet state.
 * COMMITS. The test tx takes the advisory lock (caller layer); the core adopts it, the same
 * single-holder topology as the production callers.
 */
export async function runStagedApply(
  driveFileId: string,
  input: StagedApplyInput,
): Promise<ApplyStagedCoreResult> {
  const modifiedTime = input.modifiedTime ?? new Date((autoApplyClock += 60_000)).toISOString();
  const next: ParseResult = buildParseResult(input.crew.map(toCrewRow));
  return await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${"show:" + driveFileId}))`;
    // Production pipeline tx (queryOne + holdPort); `tx as never` is the established idiom for
    // handing a postgres.js TransactionSql to makeSyncPipelineTx in tests (_holdAwareTestkit).
    const pipelineTx = makeSyncPipelineTx(tx as never);
    const locked = await adoptShowLockHeld(pipelineTx, driveFileId);
    const [show] = (await tx`
      select id, last_seen_modified_time, diagrams
        from public.shows where drive_file_id = ${driveFileId}`) as unknown as Array<{
      id: string;
      last_seen_modified_time: string | Date | null;
      diagrams: unknown;
    }>;
    const lastSeen =
      show!.last_seen_modified_time === null
        ? null
        : new Date(show!.last_seen_modified_time).toISOString();
    return await applyStagedCore(locked, {
      sourceScope: "live",
      driveFileId,
      show: { showId: show!.id, lastSeenModifiedTime: lastSeen, diagrams: show!.diagrams },
      parseResult: next,
      triggeredReviewItems: input.triggeredItems,
      reviewerChoices: input.reviewerChoices,
      stagedId: randomUUID(),
      stagedModifiedTime: modifiedTime,
      baseModifiedTime: lastSeen,
      appliedByEmail: "doug@fxav.test",
      appliedAt: null,
      auditSource: "staged_apply",
      fileMeta: {
        driveFileId,
        name: "Sheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime,
        parents: ["f"],
      },
      mi11Items: [],
      feedPolicy: { kind: "choice_aware" },
      skipDiagramsWrite: true,
    });
  });
}
```

Harness framing: `feedPolicy: choice_aware` is the finalize-cas (Phase D) configuration (spec §1.1 #7). Identity assertions hold for every caller (the link computation ignores `feedPolicy`); FEED assertions are meaningful only for this configuration — the dashboard caller writes no feed rows.

- [ ] **Step 3: db test file** — create tests/db/stagedApplyIdentityLink.db.test.ts with the `_holdsHelpers` bootstrap idiom (`afterAll` cleanup + `closeHoldsHelpers`, as in `tests/db/undo-change-direction-a.test.ts`), a file-local `heldValue` builder (copy the file-local one in `tests/db/supersession-both-writers.test.ts` — it is not exported), `const LEAD_FLAGS: RoleFlag[] = ["LEAD", "A1"];`, and four cases:

```ts
it("staged MI-12 rename choice preserves crew id + oauth claim; feed row's before_image.id matches", async () => {
  const { showId, driveFileId } = await seedShowWithCrew([
    { name: "Bob", email: "bob@x.example", claimed: "2026-06-01T10:00:00.000Z" },
  ]);
  const PRIOR_ID = (await readCrewByName(showId, "Bob"))!.id;
  const result = await runStagedApply(driveFileId, {
    crew: [{ name: "Robert", email: "bob@x.example" }],
    triggeredItems: [
      { id: "1", invariant: "MI-12", removed_name: "Bob", added_name: "Robert", email: "bob@x.example" },
    ],
    reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "Robert" }],
  });
  expect(result).toMatchObject({ outcome: "applied" });
  expect(await readCrewByName(showId, "Bob")).toBeNull();
  const successor = await readCrewByName(showId, "Robert");
  expect(successor!.id).toBe(PRIOR_ID); // identity preserved (the backlog bug)
  expect(successor!.claimed_via_oauth_at).not.toBeNull(); // oauth claim survives
  const renamed = await readChangeLog(showId, { change_kind: "crew_renamed", entity_ref: "Bob" });
  expect(renamed.before_image?.id).toBe(PRIOR_ID); // feed row consistent with live row
});

it("staged MI-13 independent choice stays remove+add: old row gone, fresh id, no claim", async () => {
  const { showId, driveFileId } = await seedShowWithCrew([
    { name: "Sam A", email: "sama@x.example", claimed: "2026-06-01T10:00:00.000Z" },
  ]);
  const PRIOR_ID = (await readCrewByName(showId, "Sam A"))!.id;
  const result = await runStagedApply(driveFileId, {
    crew: [{ name: "Sam B", email: "samb@x.example" }],
    triggeredItems: [{ id: "1", invariant: "MI-13", removed_name: "Sam A", added_name: "Sam B" }],
    reviewerChoices: [{ item_id: "1", action: "independent" }],
  });
  expect(result).toMatchObject({ outcome: "applied" });
  expect(await readCrewByName(showId, "Sam A")).toBeNull(); // old row genuinely removed
  const successor = await readCrewByName(showId, "Sam B");
  expect(successor!.id).not.toBe(PRIOR_ID); // genuinely a new person
  expect(successor!.claimed_via_oauth_at).toBeNull();
});

it("held-boundary: an MI-12 rename choice whose OLD name has an open MI-11 hold keeps the old row", async () => {
  const { showId, driveFileId } = await seedShowWithCrew([
    { name: "Held Old", email: "held@x.example", claimed: "2026-06-01T10:00:00.000Z" },
  ]);
  const PRIOR_ID = (await readCrewByName(showId, "Held Old"))!.id;
  await seedMi11Hold(
    { showId, driveFileId },
    {
      entityKey: "Held Old",
      heldValue: heldValue("Held Old", "held@x.example"),
      proposedValue: { disposition: "removal" },
      baseModifiedTime: "2026-06-08T11:00:00.000Z",
    },
  );
  const result = await runStagedApply(driveFileId, {
    crew: [{ name: "Held New", email: "held@x.example" }],
    triggeredItems: [
      { id: "1", invariant: "MI-12", removed_name: "Held Old", added_name: "Held New", email: "held@x.example" },
    ],
    reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "Held New" }],
  });
  expect(result).toMatchObject({ outcome: "applied" });
  const retained = await readCrewByName(showId, "Held Old");
  expect(retained).not.toBeNull(); // old row retained, not renamed away
  expect(retained!.id).toBe(PRIOR_ID);
});

it("notice flip: rename unchanged-LEAD emits nothing; rename with delta emits one arm-(a) entry; independent holder emits loss+grant", async () => {
  // Case A: rename choice, holder, UNCHANGED flags gets NO roleFlagsNotice (cron shape, spec §3.4).
  const a = await seedShowWithCrew([
    { name: "Lead Old", email: "lead@x.example", role_flags: LEAD_FLAGS },
  ]);
  const resultA = await runStagedApply(a.driveFileId, {
    crew: [{ name: "Lead New", email: "lead@x.example", role_flags: LEAD_FLAGS }],
    triggeredItems: [
      { id: "1", invariant: "MI-12", removed_name: "Lead Old", added_name: "Lead New", email: "lead@x.example" },
    ],
    reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "Lead New" }],
  });
  expect(resultA).toMatchObject({ outcome: "applied" });
  expect(resultA).not.toHaveProperty("roleFlagsNotice");

  // Case B: rename choice WITH capability delta: exactly one arm-(a) entry, prior flags via the
  // rename map (spec §4 item 4).
  const b = await seedShowWithCrew([
    { name: "Delta Old", email: "delta@x.example", role_flags: LEAD_FLAGS },
  ]);
  const resultB = await runStagedApply(b.driveFileId, {
    crew: [{ name: "Delta New", email: "delta@x.example", role_flags: ["A1"] }],
    triggeredItems: [
      { id: "1", invariant: "MI-12", removed_name: "Delta Old", added_name: "Delta New", email: "delta@x.example" },
    ],
    reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "Delta New" }],
  });
  expect(resultB).toMatchObject({
    outcome: "applied",
    roleFlagsNotice: {
      context: { changes: [{ crew_name: "Delta New", prior_flags: LEAD_FLAGS, new_flags: ["A1"] }] },
    },
  });

  // Case C: independent on a holder with a capability-holding successor: arms (c)+(b), loss for
  // the removed old identity AND grant for the added new identity (unchanged behavior, spec §3.4).
  const c = await seedShowWithCrew([
    { name: "Ind Old", email: "ind@x.example", role_flags: LEAD_FLAGS },
  ]);
  const resultC = await runStagedApply(c.driveFileId, {
    crew: [{ name: "Ind New", email: "ind2@x.example", role_flags: LEAD_FLAGS }],
    triggeredItems: [{ id: "1", invariant: "MI-13", removed_name: "Ind Old", added_name: "Ind New" }],
    reviewerChoices: [{ item_id: "1", action: "independent" }],
  });
  expect(resultC).toMatchObject({ outcome: "applied" });
  const changesC = (
    resultC as { roleFlagsNotice?: { context: { changes: unknown[] } } }
  ).roleFlagsNotice?.context.changes;
  expect(changesC).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ crew_name: "Ind Old", prior_flags: LEAD_FLAGS, new_flags: [] }),
      expect.objectContaining({ crew_name: "Ind New", prior_flags: [], new_flags: LEAD_FLAGS }),
    ]),
  );
  expect(changesC).toHaveLength(2);
});
```

Failure modes caught: end-to-end oauth-orphan on staged rename; independent accidentally linking; a staged hold interaction diverging from the cron-pinned guard; phantom-loss notice surviving the flip; a wrong-prior arm-(a) entry on a capability delta; the flip over-reaching into `independent` (loss or grant lost).

- [ ] **Step 4: undo round-trip case** — add to `tests/db/undo-change-direction-a.test.ts` (import `runStagedApply` from `./_holdsHelpers`):

```ts
it("STAGED-driven linked rename: apply then undo restores the original id and claim (spec 2026-08-03 §4 item 5)", async () => {
  const { showId, driveFileId } = await seedShowWithCrew([
    { name: "Stage Undo A", email: "sua@x.example", claimed: "2026-06-01T10:00:00.000Z" },
  ]);
  const live = await readCrewByName(showId, "Stage Undo A");
  const LINK_ID = live!.id;
  const LINK_CLAIM = live!.claimed_via_oauth_at;

  const result = await runStagedApply(driveFileId, {
    crew: [{ name: "Stage Undo A2", email: "sua@x.example" }],
    triggeredItems: [
      { id: "1", invariant: "MI-12", removed_name: "Stage Undo A", added_name: "Stage Undo A2", email: "sua@x.example" },
    ],
    reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "Stage Undo A2" }],
  });
  expect(result).toMatchObject({ outcome: "applied" });
  expect((await readCrewByName(showId, "Stage Undo A2"))!.id).toBe(LINK_ID);

  const renamed = await readChangeLog(showId, {
    change_kind: "crew_renamed",
    entity_ref: "Stage Undo A",
  });
  const res = await callUndoAsAdmin(renamed.id);
  expect(res.ok).toBe(true);

  const back = await readCrewByName(showId, "Stage Undo A");
  expect(back!.id).toBe(LINK_ID);
  expect(new Date(back!.claimed_via_oauth_at as string).toISOString()).toBe(
    new Date(LINK_CLAIM as string).toISOString(),
  );
  expect(await readCrewByName(showId, "Stage Undo A2")).toBeNull();
});
```

Failure mode caught: an undo interaction regression specific to the staged writer path (a staged `crew_renamed` row whose images diverge from what Direction A's successor-delete + `before_image` re-insert assumes).

- [ ] **Step 5: Verify the red/green split** — `pnpm vitest run tests/sync/applyStaged.test.ts tests/db/stagedApplyIdentityLink.db.test.ts tests/db/undo-change-direction-a.test.ts` (local Supabase up). Expected RED (behavior under change): spy test 1 (no `identityLinkRenames` in the runPhase2 call yet); db case 1 (fresh successor id pre-threading); notice case A (loss+grant notice present pre-flip; case B's single-entry shape also differs pre-flip — record the observed pre-flip failures); the staged undo case (first `toBe(LINK_ID)` assertion fails). Expected GREEN (unchanged-behavior rails): spy test 2, db independent case, held-boundary case, every pre-existing case in the touched files.
- [ ] **Step 6: Implementation** — in `lib/sync/applyStagedCore.ts`: add `import { computeStagedIdentityLinkRenames } from "@/lib/sync/identityLinkRenames";`, then alongside the step-7 `feedItems` derivation:

```ts
// Identity-link renames (spec 2026-08-03 §3.2): a rename-resolved MI-12/13/14 item applies
// identity-preserving (in-place UPDATE, same crew_members.id); the reviewer's rename choice is
// the vouch. independent stays remove+add (R33-2 feed assertions untouched). Length-gated spread
// mirrors the cron producer (runScheduledCronSync).
const identityLinkRenames = computeStagedIdentityLinkRenames(
  args.triggeredReviewItems,
  validation.choices,
);
```

and in the `runPhase2` args, next to the `notableItems` spread:

```ts
    ...(identityLinkRenames.length > 0 ? { identityLinkRenames } : {}),
```

- [ ] **Step 7: Eight-site comment reconciliation** (spec §3.3 inventory, exact new texts):
    1. `lib/sync/applyStagedCore.ts` step-3: rewrite the sentence beginning "rename/independent/apply take NO dispatch branch" and ending "floors + the audit record" to: "rename/independent/apply take NO dispatch branch: the staged parse applies WHOLESALE for all three. Per-action differences: deriveAuthSideEffects floors, the audit record, and (spec 2026-08-03) rename-resolved MI-12/13/14 pairs threading identityLinkRenames so the apply is identity-preserving; independent pairs stay remove+add."
    2. `lib/sync/phase2.ts` arm-(c) comment: replace "(esp. the staged remove+add of an identity-link rename, where args.identityLinkRenames is empty so the removed old name is a genuine removal here)" with "(esp. a staged `independent` resolution, which stays remove+add with empty `identityLinkRenames`; a staged rename-resolved pair threads its link since spec 2026-08-03 and is excluded here, same as cron)".
    3. `lib/sync/phase2.ts` `Phase2Args.identityLinkRenames` field doc: after "via computeIdentityLinkRenames (MI-12 always; MI-13/14 only on the version-bound accept)", append "; the staged core computes via computeStagedIdentityLinkRenames (per-item rename choice, spec 2026-08-03)".
    4. `lib/sync/applyParseResult.ts` `identityLinkRenames` arg doc: after "MI-13/ MI-14 pairs only on the version-bound accepted apply", append " (cron), or on the per-item rename reviewer choice (staged, spec 2026-08-03)"; and change "A skipped/absent pair degrades to today's delete+insert (fail-safe re-pick, never a wrong identity)" to "A skipped/absent pair falls through to the ordinary delete+upsert flow; a hold-protected old name is retained, not replaced (fail-safe, never a wrong identity)".
    5. `lib/sync/applyParseResult.ts` rename-loop inline comment: change "a skipped pair degrades to today's delete+insert, which is fail-safe" to "a skipped pair falls through to the ordinary delete+upsert flow (a hold-protected old name is retained), which is fail-safe".
    6. `lib/sync/identityLinkRenames.ts` header doc: change "MI-13/MI-14 heuristic pairs link ONLY on the version-bound accepted apply (the admin confirm is the vouch" to "MI-13/MI-14 heuristic pairs link ONLY on a confirmed apply: cron's version-bound accept, or the staged per-item rename choice (the admin confirm is the vouch".
    7. `tests/sync/phase2.test.ts` arm-(c) test comment: change "Path-independent (covers the staged remove+add of an identity-link rename)" to "Path-independent (covers a staged `independent` resolution's remove+add)". Test body unchanged.
    8. `tests/sync/selectionsResetAtPreserved.test.ts` header comment: change the parenthetical beginning "(A NAME change is delete+insert and loses the marker" to "(An UNLINKED name change is delete+insert and loses the marker, identical to claimed_via_oauth_at; an identity-link rename, cron or a staged rename choice per spec 2026-08-03, updates in place and preserves it.)". Test body unchanged.
- [ ] **Step 8: Run to verify all green** — the Step 5 command plus `pnpm vitest run tests/sync/identityLinkRenames.test.ts tests/sync/phase2.test.ts`, and `pnpm exec tsc --noEmit`. Everything green (plan-time materialization measured 126 tests passing across tests/sync/identityLinkRenames.test.ts, tests/sync/applyStaged.test.ts, tests/sync/phase2.test.ts, and tests/auth/advisoryLockRpcDeadlock.test.ts, 0 tsc errors).
- [ ] **Step 9: Commit** — `git add lib/sync/applyStagedCore.ts lib/sync/phase2.ts lib/sync/applyParseResult.ts lib/sync/identityLinkRenames.ts tests/sync/applyStaged.test.ts tests/sync/phase2.test.ts tests/sync/selectionsResetAtPreserved.test.ts tests/db/_holdsHelpers.ts tests/db/stagedApplyIdentityLink.db.test.ts tests/db/undo-change-direction-a.test.ts && git commit -m "feat(sync): thread identity-link renames through the staged apply core" --no-verify`

---

### Task 3: Doc supersession + backlog ledger (docs-only — TDD N/A by declaration; verification = spec-lint + closure greps)

**Files:**
- Modify: `docs/superpowers/specs/alerts/2026-07-17-role-flags-notice-lead-only-doug.md`
- Modify: `BACKLOG.md` + `BACKLOG-archive.md`

- [ ] **Step 1: Supersession banner + per-site tags** (spec §3.5 item 1, as repaired in reviews R2/R3) — add ONE dated banner immediately after the role-flags spec's document header:

> **Superseded in part, 2026-08-03** (`docs/superpowers/specs/2026-08-03-staged-identitylink-rename-identity.md`): the staged RENAME-CHOICE path now threads `identityLinkRenames` (identity-preserving in-place apply); its loss+grant audit shape is retired. Staged `independent` remains remove+add with arms (c)/(b); R33-2 feed assertions untouched. Fenced both directions — do not re-fence threading out, and do not relitigate the audit-shape flip.

Then tag EVERY site in the spec §3.5 list with "(superseded 2026-08-03, see banner)": the §2.1 arm-(c) intro clause; the §2.1 exclusion paragraph's staged-path sentences; the §2.4 parenthetical; the §2.4 coverage-parity paragraph's "(cron threads `identityLinkRenames`; staged/manual pass empty)" parenthetical; the "Staged identity-linked renames (remove+add per R33-2)" summary line; both §2.5 paragraphs; the test-requirements "Staged rename + capability" item; the arm-(c)-exclusion test item's "Contrast: the STAGED remove+add" clause; the coverage-parity structural-pin item's "empty-`identityLinkRenames` (staged-shaped)" fixture label (annotate: independent/non-rename staged shape); do-not-relitigate items 2h and 2e. Verify closure with `rg -n "remove\+add|identityLinkRenames" <doc>`: every hit is either tagged, path-parametric (arm-table row, shared-writer signature, code snippet, roleFlagsEqual note), or cron-specific.

- [ ] **Step 2: File the three pre-existing classes surfaced by spec review R1** — append three entries to `BACKLOG.md`, each citing the spec's §1.1 #7-#9 verification anchors: `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP` (finalize-cas discards `coreResult.roleFlagsNotice`; per-row return carries only drive_file_id/code/showId; no post-commit ROLE_FLAGS_NOTICE / LEAD_ROLE_APPLIED sink — class: audit emission gap, Phase D), `BL-IDENTITYLINK-LANDED-VS-REQUESTED` (capability arms + feed writer consume requested identityLinkRenames; hold-aware reconciliation can suppress a rename target so the landed state diverges — class: sync audit fidelity, cron+staged shared), `BL-UNDO-SELECTIONS-RESET-AT-DROP` (`crewImage` + Direction A re-insert omit `selections_reset_at` — any crew undo resets it to null; a previously invalidated picker cookie can validate again — class: undo lifecycle fidelity).
- [ ] **Step 3: Graduate the backlog entry** — move the whole `BL-STAGED-IDENTITYLINK-RENAME-IDENTITY` section from `BACKLOG.md` to `BACKLOG-archive.md` (follow the archive file's existing entry format; add a one-line closing note naming this spec + branch).
- [ ] **Step 4: Verify + commit** — `pnpm spec:lint docs/superpowers/specs/2026-08-03-staged-identitylink-rename-identity.md` (0 hard); `pnpm spec:lint docs/superpowers/specs/alerts/2026-07-17-role-flags-notice-lead-only-doug.md`: this LEGACY doc's pre-edit baseline is 50 hard / 21 advisory (measured 2026-08-03); the gate is NO INCREASE in hard findings over that baseline (the banner/tags must not add new hard findings; fixing pre-existing ones is out of scope); and the Step 1 closure grep; then `git add docs/superpowers/specs/alerts/2026-07-17-role-flags-notice-lead-only-doug.md BACKLOG.md BACKLOG-archive.md && git commit -m "docs(sync): supersession banner and tags plus backlog filings and graduation" --no-verify`

---

### Task 4: Full verification

- [ ] **Step 1:** `pnpm vitest run tests/sync/ tests/db/ tests/onboarding/ tests/auth/advisoryLockRpcDeadlock.test.ts` — green (covers the g2 R33-2 assertions in `tests/onboarding/finalizeCasFullApply.db.test.ts`, the phase2 arm tests, the `applyParseResult.identityLink*` pins, and the lock-topology guard).
- [ ] **Step 2:** `pnpm typecheck` — 0 errors.
- [ ] **Step 3:** `pnpm spec:lint` on this plan and the spec — 0 hard; on the role-flags spec — hard count not above its 50-hard pre-edit baseline (Task 3 Step 4).
- [ ] **Step 4:** Any failure here is a defect: fix within the task that owns the surface, re-run, and only then proceed to the branch's ship stages (whole-diff review, CI, merge).

---

## Adversarial review (cross-model)

After plan self-review: dispatch Codex via `codex-guard` (REVIEWER ONLY brief, fresh-eyes, do-not-relitigate = spec §1.1, verdict line contract). Iterate to APPROVE before execution handoff.

## 12. Closeout

impeccable-gate: N/A — no UI surface
