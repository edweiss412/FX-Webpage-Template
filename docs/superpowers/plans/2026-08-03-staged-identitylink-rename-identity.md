# Staged Identity-Link Rename Identity Preservation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread `identityLinkRenames` through `applyStagedCore` (choice-aware) so a staged rename preserves `crew_members.id` + `claimed_via_oauth_at`, per `docs/superpowers/specs/2026-08-03-staged-identitylink-rename-identity.md`.

**Architecture:** One new pure helper in `lib/sync/identityLinkRenames.ts` (link a pair iff MI-12/13/14 AND its validated choice action is `rename`), one length-gated spread in `applyStagedCore`'s `runPhase2` call, zero phase2/applyParseResult code changes (the arg already exists and is forwarded), two comment rewrites, doc supersession notes. TDD per task.

**Tech Stack:** TypeScript, Vitest, postgres.js against local Supabase (loopback-guarded db tests), existing test kits (`tests/sync/_holdAwareTestkit.ts`, `tests/db/_holdsHelpers.ts`).

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-08-03-staged-identitylink-rename-identity.md`. §1.1 Resolved-scope table is the do-not-relitigate list.
- Caller topology (spec §1.1 #7): dashboard `applyStaged` = live + `feedPolicy: none` + post-commit notice emit; `finalize` = Phase B first-seen only + `feedPolicy: none`; `finalize-cas` = Phase D existing-show + `choice_aware` + notice DISCARDED today (pre-existing gap, backlogged in Task 5, NOT fixed here).
- Invariant 1 (TDD): failing test → minimal implementation → passing test → commit, every task.
- Invariant 2 (locks): the core adopts, never acquires. No new `pg_advisory*` call sites anywhere in this plan; the db-test harness takes the lock in the TEST transaction (caller layer), matching the single-holder topology. `tests/auth/advisoryLockRpcDeadlock.test.ts` must stay green (Task 5 runs it).
- Invariant 6 (commits): conventional-commits per task, scope `sync` (tests `test(sync):`, code `feat(sync):`, docs `docs(sync):`).
- Invariant 11: all work in the worktree `FX-worktrees/staged-identitylink-rename-identity`, branch `feat/staged-identitylink-rename-identity`.
- Meta-test inventory (writing-plans rule): this plan CREATES no structural meta-test and EXTENDS none. Reasons: no new Supabase client call sites (invariant-9 registry untouched), no lock-topology change (existing deadlock guard test pins it; re-run only), no admin alert codes, no mutation surfaces (`tests/log/_metaMutationSurfaceObservability.test.ts` discovers routes/actions; none added), no UI. Declared explicitly per `docs/agents/writing-plans.md`.
- New test files auto-match `BASE_INCLUDE` (`vitest.projects.ts:34`, `tests/**/*.test.ts`) — no testMatch or workflow wiring task needed; db tests self-skip on non-loopback `TEST_DATABASE_URL` like their siblings.
- No placeholders; snippets below were typechecked against the repo tsconfig before review dispatch (transcript in the review brief).

---

### Task 1: `computeStagedIdentityLinkRenames` helper

**Files:**
- Modify: `lib/sync/identityLinkRenames.ts`
- Test: `tests/sync/identityLinkRenames.test.ts`

**Interfaces:**
- Produces: `computeStagedIdentityLinkRenames(items: TriggeredReviewItem[], choices: ReadonlyArray<{ item_id: string; action: string }>): IdentityLinkRename[]` — consumed by Task 2.

- [ ] **Step 1: Write the failing tests** — append to the existing `describe` file (fixtures `mi12`/`mi13`/`mi14`/`orphan`/`mi6` already exist at the top of the file; reuse them):

```ts
import { computeStagedIdentityLinkRenames } from "@/lib/sync/identityLinkRenames";

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

  test("a rename action on a non-pair invariant never links (defensive belt)", () => {
    expect(
      computeStagedIdentityLinkRenames(
        [orphan, mi6],
        [
          { item_id: "4", action: "rename" },
          { item_id: "5", action: "rename" },
        ],
      ),
    ).toEqual([]);
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

Failure modes caught: an unvouched pair linking (two people's identities merged), a vouched pair dropping (silent identity churn — the bug this feature fixes), and one vouch fanning out to multiple links on a malformed payload (spec review R1 finding 4). Expected pairs derive from the fixture `removed_name`/`added_name` fields, not hardcoded row data (anti-tautology).

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

- [ ] **Step 4: Run to verify pass** — same command. Expected: PASS (existing cron-helper tests too).
- [ ] **Step 5: Commit** — `git add lib/sync/identityLinkRenames.ts tests/sync/identityLinkRenames.test.ts && git commit -m "feat(sync): choice-aware staged identity-link rename computation" --no-verify`

---

### Task 2: Thread through `applyStagedCore` + comment rewrites

**Files:**
- Modify: `lib/sync/applyStagedCore.ts` (import; compute + spread in `applyStagedCore()`; rewrite the step-3 "applies WHOLESALE" comment)
- Modify: `lib/sync/phase2.ts` (comment-only: the arm-(c) block sentence claiming staged `args.identityLinkRenames` is empty)
- Test: `tests/sync/applyStaged.test.ts`

**Interfaces:**
- Consumes: `computeStagedIdentityLinkRenames` (Task 1).
- Produces: `runPhase2` receives `identityLinkRenames` (length-gated) on the staged path — Task 3's db behavior depends on it.

- [ ] **Step 1: Write the failing tests** — add to `tests/sync/applyStaged.test.ts` (reuse the file's `fakeTx`/`deps`/`pending`/`applyStaged_unlocked` helpers; fixture idiom matches the existing "rename reviewer choices" tests around line 1280):

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

  const phase2Args = vi.mocked(syncDeps.runPhase2).mock.calls[0]?.[1];
  expect(phase2Args).toBeDefined();
  expect(phase2Args !== undefined && "identityLinkRenames" in phase2Args).toBe(false);
});
```

Failure modes caught: the threading regression itself (first test — the exact bug of `BL-STAGED-IDENTITYLINK-RENAME-IDENTITY`), an unvouched `independent` pair linking (first test's exact-array assertion), and spread-when-empty drift from the cron idiom (second test).

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/sync/applyStaged.test.ts -t "identityLinkRenames"`. Expected: first test FAILS (no `identityLinkRenames` in the call); second PASSES trivially pre-change (key absent today) — that is acceptable: it is the regression pin for the length-gate, red-then-green is carried by the first test.
- [ ] **Step 3: Implementation** — in `lib/sync/applyStagedCore.ts`:
  - Add `computeStagedIdentityLinkRenames` to the imports (new import from `@/lib/sync/identityLinkRenames`).
  - In `applyStagedCore()`, beside the step-7 `feedItems` derivation:

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

  - In the `runPhase2` call args, next to the `notableItems` spread:

```ts
    ...(identityLinkRenames.length > 0 ? { identityLinkRenames } : {}),
```

  - Rewrite the step-3 comment sentence (the one beginning "rename/independent/apply take NO dispatch branch" and ending "floors + the audit record") to: "rename/independent/apply take NO dispatch branch: the staged parse applies WHOLESALE for all three. Per-action differences: deriveAuthSideEffects floors, the audit record, and (spec 2026-08-03) rename-resolved MI-12/13/14 pairs threading identityLinkRenames so the apply is identity-preserving; independent pairs stay remove+add."
  - In `lib/sync/phase2.ts`, arm-(c) comment: replace the parenthetical "(esp. the staged remove+add of an identity-link rename, where args.identityLinkRenames is empty so the removed old name is a genuine removal here)" with "(esp. a staged `independent` resolution, which stays remove+add with empty `identityLinkRenames`; a staged rename-resolved pair threads its link since spec 2026-08-03 and is excluded here, same as cron)".
- [ ] **Step 4: Run to verify pass** — `pnpm vitest run tests/sync/applyStaged.test.ts`. Expected: all PASS (including the pre-existing R33-2/floors tests untouched).
- [ ] **Step 5: Commit** — `git add lib/sync/applyStagedCore.ts lib/sync/phase2.ts tests/sync/applyStaged.test.ts && git commit -m "feat(sync): thread identity-link renames through the staged apply core" --no-verify`

---

### Task 3: DB proof — staged rename preserves identity; independent does not; notice flip

**Files:**
- Modify: `tests/db/_holdsHelpers.ts` (add `runStagedApply` beside `runAutoApply`)
- Test: tests/db/stagedApplyIdentityLink.db.test.ts (created by this task; cited without backticks so spec-lint's tracked-file check skips a file that does not exist yet)

**Interfaces:**
- Consumes: Task 2's threading (real `applyStagedCore` → real `runPhase2` → real `makeSyncPipelineTx`-family tx via `phase2Tx`).
- Produces: `runStagedApply(driveFileId, input)` — reused by Task 4's undo case.

Harness framing: `runStagedApply` pins `feedPolicy: choice_aware` — the finalize-cas (Phase D) configuration (spec §1.1 #7). The identity assertions hold for every caller (the link computation ignores `feedPolicy`); the FEED assertions are meaningful only for this configuration — the dashboard caller writes no feed rows.

- [ ] **Step 1: Add the harness helper** to `tests/db/_holdsHelpers.ts` (exported; commits like `runAutoApply`; the advisory lock is taken by the TEST transaction and adopted by the core — single-holder topology, caller layer, matching how the finalize routes hold for the core):

```ts
import { applyStagedCore, type ApplyStagedCoreResult, type ReviewerChoice } from "@/lib/sync/applyStagedCore";
import { adoptShowLockHeld } from "@/lib/sync/lockedShowTx";

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
    const pipelineTx = phase2Tx(tx as unknown as Sql);
    const locked = await adoptShowLockHeld(pipelineTx as never, driveFileId);
    const [show] = await tx`
      select id, last_seen_modified_time, diagrams
        from public.shows where drive_file_id = ${driveFileId}`;
    return await applyStagedCore(locked as never, {
      sourceScope: "live",
      driveFileId,
      show: {
        showId: show!.id as string,
        lastSeenModifiedTime:
          show!.last_seen_modified_time === null
            ? null
            : new Date(show!.last_seen_modified_time as string | Date).toISOString(),
        diagrams: show!.diagrams,
      },
      parseResult: next,
      triggeredReviewItems: input.triggeredItems,
      reviewerChoices: input.reviewerChoices,
      stagedId: randomUUID(),
      stagedModifiedTime: modifiedTime,
      baseModifiedTime:
        show!.last_seen_modified_time === null
          ? null
          : new Date(show!.last_seen_modified_time as string | Date).toISOString(),
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

Implementation notes for this step (verify at write time, adjust mechanically if a name drifted): `phase2Tx` comes from `@/tests/sync/_holdAwareTestkit` (already imported by this file); `randomUUID` from `node:crypto` (already imported); `autoApplyClock`/`toCrewRow`/`buildParseResult` are module-locals of this file. The timestamp normalization mirrors `normalizeTimestamptz` (`lib/sync/applyStagedCore.ts`) inline because postgres.js returns `Date` for `timestamptz` — the equality preflight (`sameTimestamp`) accepts both, so the conversion is belt only.

- [ ] **Step 2: Write the failing db test** — tests/db/stagedApplyIdentityLink.db.test.ts (copy the loopback-guard + `sql` bootstrap idiom from `tests/db/undo-change-direction-a.test.ts` / `_holdsHelpers`; seed via `seedShowWithCrew`; `readCrewByName`/`readChangeLog` helpers already exist in `_holdsHelpers`):

```ts
it("staged MI-12 rename choice preserves crew id + oauth claim; feed row's before_image.id matches", async () => {
  const { showId, driveFileId } = await seedShowWithCrew([
    { name: "Bob", email: "bob@x.example", claimed: "2026-06-01T10:00:00.000Z" },
  ]);
  const prior = await readCrewByName(showId, "Bob");
  const PRIOR_ID = prior!.id;

  const items: TriggeredReviewItem[] = [
    { id: "1", invariant: "MI-12", removed_name: "Bob", added_name: "Robert", email: "bob@x.example" },
  ];
  const result = await runStagedApply(driveFileId, {
    crew: [{ name: "Robert", email: "bob@x.example" }],
    triggeredItems: items,
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

it("staged MI-13 independent choice stays remove+add: fresh id, no claim, loss+grant audit", async () => {
  const { showId, driveFileId } = await seedShowWithCrew([
    { name: "Sam A", email: "sama@x.example", claimed: "2026-06-01T10:00:00.000Z" },
  ]);
  const PRIOR_ID = (await readCrewByName(showId, "Sam A"))!.id;

  const items: TriggeredReviewItem[] = [
    { id: "1", invariant: "MI-13", removed_name: "Sam A", added_name: "Sam B" },
  ];
  const result = await runStagedApply(driveFileId, {
    crew: [{ name: "Sam B", email: "samb@x.example" }],
    triggeredItems: items,
    reviewerChoices: [{ item_id: "1", action: "independent" }],
  });
  expect(result).toMatchObject({ outcome: "applied" });

  const successor = await readCrewByName(showId, "Sam B");
  expect(successor!.id).not.toBe(PRIOR_ID); // genuinely a new person
  expect(successor!.claimed_via_oauth_at).toBeNull();
});

it("held-boundary: an MI-12 rename choice whose OLD name has an open MI-11 hold keeps the old row (spec §5)", async () => {
  // The rename loop skips hold-protected names and delete-suppression retains the old row: the
  // cron-pinned guard behavior (tests/sync/applyParseResult.identityLink.db.test.ts), exercised
  // here through the STAGED producer. seedMi11Hold + heldValue already exist in _holdsHelpers.
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
      // any base time at-or-before the staged apply's modifiedTime keeps the hold OPEN at apply
      // time, which is all this case needs (verify against holdAwareApply's re-evaluation rule
      // at write time and adjust mechanically if it releases the hold)
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
  expect(retained).not.toBeNull(); // old row retained, not renamed, not deleted
  expect(retained!.id).toBe(PRIOR_ID);
});

it("notice flip: staged rename with unchanged LEAD emits no roleFlagsNotice; independent removal of a LEAD holder does", async () => {
  // Case A: rename choice, holder, unchanged flags gets NO notice (cron shape, spec §3.4 row 2).
  // Case B: independent on a LEAD holder → arm (c) loss fires (spec §3.4 row 3, unchanged).
  // Seed role_flags: seedShowWithCrew writes ["A1"]; update to add LEAD before the staged apply:
  const a = await seedShowWithCrew([{ name: "Lead Old", email: "lead@x.example" }]);
  await sql`update public.crew_members set role_flags = ${["LEAD", "A1"]}
    where show_id = ${a.showId} and name = 'Lead Old'`;
  const resultA = await runStagedApply(a.driveFileId, {
    crew: [{ name: "Lead New", email: "lead@x.example", role: "A1" }],
    triggeredItems: [
      { id: "1", invariant: "MI-12", removed_name: "Lead Old", added_name: "Lead New", email: "lead@x.example" },
    ],
    reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "Lead New" }],
  });
  expect(resultA).toMatchObject({ outcome: "applied" });
  expect(resultA).not.toHaveProperty("roleFlagsNotice");

  const b = await seedShowWithCrew([{ name: "Lead B Old", email: "leadb@x.example" }]);
  await sql`update public.crew_members set role_flags = ${["LEAD", "A1"]}
    where show_id = ${b.showId} and name = 'Lead B Old'`;
  const resultB = await runStagedApply(b.driveFileId, {
    crew: [{ name: "Lead B New", email: "leadb2@x.example" }],
    triggeredItems: [
      { id: "1", invariant: "MI-13", removed_name: "Lead B Old", added_name: "Lead B New" },
    ],
    reviewerChoices: [{ item_id: "1", action: "independent" }],
  });
  expect(resultB).toMatchObject({ outcome: "applied" });
  expect(resultB).toMatchObject({
    roleFlagsNotice: {
      context: {
        changes: expect.arrayContaining([
          expect.objectContaining({ crew_name: "Lead B Old", new_flags: [] }),
        ]),
      },
    },
  });
});
```

Caveat baked into the snippet: the notice test seeds `role_flags` by UPDATE because `seedShowWithCrew` hardcodes `["A1"]` — and the CREW ROW the apply writes must carry the capability for case A's "unchanged" premise, so `buildParseResult`/`crewRow` must produce `role_flags: ["LEAD","A1"]` for "Lead New". If `crewRow` does not accept `role_flags`, extend `CrewSeed`/`toCrewRow` in `_holdsHelpers` with an optional `role_flags` passthrough (mechanical; keep default `["A1"]`). Assert-side values derive from the seeded flags, not literals repeated from the writer (anti-tautology: the seed constant is defined once at the top of the test and referenced in both places).

Failure modes caught: end-to-end oauth-orphan on staged rename (the backlog bug), independent accidentally linking (identity merge), phantom-loss notice surviving the flip, flip over-reach silencing the genuine independent loss, and a staged hold interaction diverging from the cron-pinned guard behavior.

- [ ] **Step 3: Run to verify current failure** — `pnpm vitest run tests/db/stagedApplyIdentityLink.db.test.ts` (requires local Supabase; loopback-guarded). Expected pre-Task-2-merge state: written on top of Tasks 1–2 this should PASS for the rename case only if threading landed — author AFTER Task 2, expect PASS; the red state was carried by Task 2's unit test. If any case fails, that is a real defect — fix before commit.
- [ ] **Step 4: Commit** — `git add tests/db/_holdsHelpers.ts tests/db/stagedApplyIdentityLink.db.test.ts && git commit -m "test(sync): db pins staged rename identity preservation and independent remove+add" --no-verify`

---

### Task 4: Undo round-trip on the staged-driven in-place rename

**Files:**
- Test: `tests/db/undo-change-direction-a.test.ts` (add one case; reuse `runStagedApply` from Task 3)

**Interfaces:**
- Consumes: `runStagedApply` (Task 3), existing `callUndoAsAdmin`/`readCrewByName`/`readChangeLog` helpers in that file's kit.

- [ ] **Step 1: Write the test** (the existing "LINKED-shape rename undo" case pins the cron-driven shape; this pins the STAGED-driven shape end-to-end through `undo_change` — spec §4 item 5):

```ts
it("STAGED-driven linked rename: apply → undo restores the original id and claim", async () => {
  const { showId, driveFileId } = await seedShowWithCrew([
    { name: "Stage Undo A", email: "sua@x.example", claimed: "2026-06-01T10:00:00.000Z" },
  ]);
  const live = await readCrewByName(showId, "Stage Undo A");
  const LINK_ID = live!.id;
  const LINK_CLAIM = live!.claimed_via_oauth_at;

  const result = await runStagedApply(driveFileId, {
    crew: [{ name: "Stage Undo A2", email: "sua@x.example" }],
    triggeredItems: [
      {
        id: "1",
        invariant: "MI-12",
        removed_name: "Stage Undo A",
        added_name: "Stage Undo A2",
        email: "sua@x.example",
      },
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

Failure mode caught: an undo interaction regression specific to the staged writer path (e.g., a staged `crew_renamed` row whose images diverge from what Direction A's successor-delete + `before_image` re-insert assumes).

- [ ] **Step 2: Run** — `pnpm vitest run tests/db/undo-change-direction-a.test.ts`. Expected: PASS (Direction A is shape-agnostic — spec §1.1 #4); a failure is a real finding, stop and diagnose.
- [ ] **Step 3: Commit** — `git add tests/db/undo-change-direction-a.test.ts && git commit -m "test(sync): staged-driven linked rename survives the undo round-trip" --no-verify`

---

### Task 5: Doc supersession notes, backlog graduation, full verification

**Files:**
- Modify: `docs/superpowers/specs/alerts/2026-07-17-role-flags-notice-lead-only-doug.md` (three supersession notes)
- Modify: `BACKLOG.md` + `BACKLOG-archive.md` (graduate the entry)

- [ ] **Step 1: Supersession notes** — append this dated note (adapted grammatically in each spot) to (a) the §2.1 arm-(c) exclusion paragraph, (b) §2.5, (c) do-not-relitigate item 2h:

> **Superseded 2026-08-03** (`docs/superpowers/specs/2026-08-03-staged-identitylink-rename-identity.md`): the staged rename-choice path now threads `identityLinkRenames` (identity-preserving in-place apply); the loss+grant audit shape for that path is retired. `independent` remains remove+add with arms (c)/(b), and R33-2's feed assertions are untouched. Fenced both directions — do not re-fence threading out, and do not relitigate the audit-shape flip.

- [ ] **Step 1b: File the three pre-existing classes surfaced by spec review R1** — append three entries to `BACKLOG.md`, each citing the spec's §1.1 #7-#9 verification anchors: `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP` (finalize-cas discards `coreResult.roleFlagsNotice`; per-row return carries only drive_file_id/code/showId; no post-commit ROLE_FLAGS_NOTICE / LEAD_ROLE_APPLIED sink — class: audit emission gap, Phase D), `BL-IDENTITYLINK-LANDED-VS-REQUESTED` (capability arms + feed writer consume requested identityLinkRenames; hold-aware reconciliation can suppress a rename target so the landed state diverges — class: sync audit fidelity, cron+staged shared), `BL-UNDO-SELECTIONS-RESET-AT-DROP` (`crewImage` omits `selections_reset_at` and the undo Direction A re-insert omits the column — any crew undo resets it to null; a previously invalidated picker cookie can validate again — class: undo lifecycle fidelity).
- [ ] **Step 2: Graduate the backlog entry** — move the whole `BL-STAGED-IDENTITYLINK-RENAME-IDENTITY` section from `BACKLOG.md` to `BACKLOG-archive.md` (follow the archive file's existing entry format; add a one-line closing note naming this spec + branch).
- [ ] **Step 3: Full verification** — run and confirm green:
  - `pnpm vitest run tests/sync/ tests/db/ tests/onboarding/` (covers the g2 R33-2 assertions in `finalizeCasFullApply.db.test.ts`, `phase2.test.ts` arms, `applyParseResult.identityLink*` pins, `advisoryLockRpcDeadlock` is under `tests/auth/` — run it too: `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts`)
  - `pnpm typecheck` (or `pnpm exec tsc --noEmit` if no script)
  - `pnpm spec:lint docs/superpowers/specs/2026-08-03-staged-identitylink-rename-identity.md` (still 0 hard)
- [ ] **Step 4: Commit** — `git add docs/superpowers/specs/alerts/2026-07-17-role-flags-notice-lead-only-doug.md BACKLOG.md BACKLOG-archive.md && git commit -m "docs(sync): supersession notes + graduate BL-STAGED-IDENTITYLINK-RENAME-IDENTITY" --no-verify`

---

## Adversarial review (cross-model)

After plan self-review: dispatch Codex via `codex-guard` (REVIEWER ONLY brief, fresh-eyes, do-not-relitigate = spec §1.1, verdict line contract). Iterate to APPROVE before execution handoff.

## 12. Closeout

impeccable-gate: N/A — no UI surface
