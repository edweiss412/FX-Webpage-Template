# Flow 4.1 — Gate Single-Crew Drops on Published Shows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-crew-member removal on a **published** show routes through the existing `shrink_held` confirm path instead of auto-applying silently (kills P0-1).

**Architecture:** `runInvariants` stays pure (MI-6 keeps `crewDrop > 1`). Publish-awareness lives only in `lib/sync/phase1.ts`: a synthetic `{ id, invariant: "MI-6" }` is pushed into the **filtered `materialShrinkItems` array** (never into `reviewItems`) when `show.published === true && crewDrop === 1`. That reuses the existing hold outcome, `describeShrink`, `RESYNC_SHRINK_HELD` alert, and `ReSyncButton` confirm verbatim. `Phase1ShowRow` gains a REQUIRED `published: boolean`.

**Tech Stack:** TypeScript, Next.js 16, Vitest, postgres.js. No new deps, no migration, no UI, no new error code.

**Spec:** `docs/superpowers/specs/2026-07-07-flow4-gate-single-crew-drop.md` (Codex-APPROVED, round 1, zero findings).

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → green → commit. Never impl before its test.
- **Commit per task** (invariant 6), conventional-commits: `<type>(sync): <summary>`. One task per commit.
- **`runInvariants` stays pure** — no edit to `lib/parser/invariants.ts`. MI-6 threshold is `crewDrop > 1` and stays that way.
- **Synthetic MI-6 goes into `materialShrinkItems` only, never `reviewItems`** — a single removal already produces an MI-13/MI-14 orphan-remove item in `reviewItems`; putting the synthetic MI-6 there too would double-represent the removal in feed rows. Verified: accept-path `notableItems` is recomputed fresh from `runInvariants` + `syncLayerReviewItems` at `lib/sync/runScheduledCronSync.ts:3319-3343`, so the synthetic item cannot leak into phase2/feed regardless.
- **REQUIRED `published: boolean`** on `Phase1ShowRow` (not optional-with-default) — mirrors the `priorParseWarningsRaw` fail-loud precedent (`lib/sync/phase1.ts:34-38`).
- **No new mutation surface, no advisory-lock edit, no meta-test** — producer discipline is enforced structurally by the TS REQUIRED field (fails `tsc` on omission).
- Run against worktree `/Users/ericweiss/fxav-flow4` (branch `feat/flow4-gate-single-crew-drop`). Commits use `--no-verify` (shared lint-staged hook belongs to the main checkout).

---

## Task 1: Thread REQUIRED `published` through `Phase1ShowRow` (plumbing, no behavior change)

**Files:**
- Modify: `lib/sync/phase1.ts` (add field to `Phase1ShowRow`, ~:38)
- Modify: `lib/sync/runScheduledCronSync.ts` (real producer inline row type ~:770-790 + assembly return ~:862)
- Modify (add `published: true` to each `Phase1ShowRow` literal / fake-row helper type): the 16 test-double files below
- Test: `tests/sync/readShowPriorWarningsRaw.test.ts` (extend — type contract + producer mapping)

**Interfaces:**
- Produces: `Phase1ShowRow` now has `published: boolean` (REQUIRED). Every producer + test double supplies it. Consumed by Task 2's hold predicate.

The 16 test-double files that construct a `Phase1ShowRow` (each supplies `priorParseWarningsRaw` today):
`tests/sync/recovery-resolution-syncpath.test.ts`, `tests/sync/phase1WarningBridge.test.ts`, `tests/sync/phase1.test.ts`, `tests/sync/phase1.decision-rule.test.ts`, `tests/sync/manual-sync-producer-parity.test.ts`, `tests/sync/resync-shrink-held-producer.test.ts`, `tests/sync/runScheduledCronSync.test.ts`, `tests/sync/phase2.test.ts`, `tests/sync/parseSheetCallSiteGuard.test.ts`, `tests/sync/parse-error-last-good-producer.test.ts`, `tests/sync/qualityRegressionLifecycle.test.ts`, `tests/sync/drive-fetch-failed-producer.test.ts`, `tests/sync/sourceAnchorsPipeline.test.ts`, `tests/sync/readShowPriorWarningsRaw.test.ts`, `tests/sync/runManualSyncForShow.test.ts`, `tests/sync/quality-regressed-producer.test.ts`.

(NOT a construct site — do not edit: `lib/sync/phase1.ts` type def itself; `lib/sync/runManualStageForFirstSeen.ts:147` — that `priorParseWarningsRaw: null` is an arg to `evaluateQualityRegression_unlocked`, not a `Phase1ShowRow`; `lib/sync/runOnboardingScan.ts:383` `readShowForPhase1` returns `null`.)

- [ ] **Step 1: Write the failing test** — extend `tests/sync/readShowPriorWarningsRaw.test.ts`

```ts
it("Phase1ShowRow carries published as a REQUIRED boolean (type contract)", () => {
  // Compile-time contract: omitting `published` must fail tsc; present values compile.
  const pub: Pick<Phase1ShowRow, "published"> = { published: true };
  const unpub: Pick<Phase1ShowRow, "published"> = { published: false };
  expect(pub.published).toBe(true);
  expect(unpub.published).toBe(false);
});

it("the concrete readShowForPhase1 producer maps show.published", () => {
  const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
  // producer returns the raw column onto Phase1ShowRow.published (not a hardcoded literal)
  expect(src).toMatch(/published:\s*show\.published/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/fxav-flow4 && pnpm exec vitest run tests/sync/readShowPriorWarningsRaw.test.ts`
Expected: FAIL — `Property 'published' does not exist on type 'Phase1ShowRow'` (or the src regex assertion fails).

- [ ] **Step 3: Add the REQUIRED field to the type** — `lib/sync/phase1.ts`, immediately after `priorParseWarningsRaw` (~:38)

```ts
  priorParseWarningsRaw: ParseResult["warnings"] | null;
  /**
   * Whether the show is crew-live (shows.published, boolean NOT NULL DEFAULT true).
   * REQUIRED (not optional) so every producer supplies it explicitly — an omission
   * fails typecheck rather than silently defaulting a publish state (same fail-loud
   * rationale as priorParseWarningsRaw above). Read by runPhase1's single-crew-drop
   * hold gate: a published show holds a 1-member drop; an unpublished one auto-applies.
   */
  published: boolean;
```

- [ ] **Step 4: Map the column in the real producer** — `lib/sync/runScheduledCronSync.ts`

In the inline `this.one<{ ... }>` row type for `readShowForPhase1` (~:770-790), add:
```ts
      last_seen_modified_time: string | null;
      published: boolean;
```
In the returned `Phase1ShowRow` object (~:862, alongside `lastSyncStatus: show.last_sync_status`), add:
```ts
      published: show.published,
```

- [ ] **Step 5: Add `published` to all 16 test doubles**

For each file listed above, add `published: true,` to every `Phase1ShowRow`/fake-show object literal (co-located with the existing `priorParseWarningsRaw:` line), and add `published: boolean;` to any local fake-row TYPE that mirrors `Phase1ShowRow` fields. Concretely:

- `tests/sync/phase1.test.ts`: type `FakeShowRow` at `:12-21` gains `published: boolean;`; every `tx.shows.set("file-1", { ... })` literal (13 sites — grep `shows.set(`) gains `published: true,`.
- `tests/sync/phase1.decision-rule.test.ts`: its local fake-row type gains `published: boolean;`; the `seedPriorShow(tx, prior)` helper at `:191-192` gains `published: true` in its `tx.shows.set` literal AND an optional param so Task 2 can seed an unpublished show — change its signature to `seedPriorShow(tx: FakePhase1Tx, prior: ParseResult, opts: { published?: boolean } = {})` and set `published: opts.published ?? true` in the literal.
- `tests/sync/phase1WarningBridge.test.ts`: its local fake-row type (`:13-19`) gains `published: boolean;`; each literal gains `published: true,`.
- Remaining 13 files: add `published: true,` beside each `priorParseWarningsRaw:` in their `Phase1ShowRow` literals; where a file declares a local mirror type, add the field there too.

Default `true` — these are existing tests whose behavior must not change (a published show that does NOT single-drop behaves identically). Grep to confirm none missed:

```bash
cd /Users/ericweiss/fxav-flow4 && pnpm exec tsc --noEmit 2>&1 | grep -i "published" | head
```

- [ ] **Step 6: Run typecheck + the full sync suite to verify green (no behavior change)**

Run: `cd /Users/ericweiss/fxav-flow4 && pnpm exec tsc --noEmit && pnpm exec vitest run tests/sync/`
Expected: PASS — typecheck clean, every existing sync test still green.

- [ ] **Step 7: Commit**

```bash
cd /Users/ericweiss/fxav-flow4 && git add lib/sync/phase1.ts lib/sync/runScheduledCronSync.ts tests/sync/ && git commit --no-verify -m "feat(sync): thread REQUIRED published onto Phase1ShowRow

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BuoDUY5s1N3hF3GD9k7LSU"
```

---

## Task 2: Hold a published single-crew drop (`shrink_held`)

**Files:**
- Modify: `lib/sync/phase1.ts` (`materialShrinkItems` computation, ~:422-425)
- Test: `tests/sync/phase1.decision-rule.test.ts` (new `describe` block — the existing material-shrink/`shrink_held` + accept-bypass coverage home; `phase1.test.ts` only asserts routing changed)

**Interfaces:**
- Consumes: `Phase1ShowRow.published` + `seedPriorShow(tx, prior, { published })` (Task 1); existing `materialShrinkItems` → `shrink_held` outcome (`lib/sync/phase1.ts:426-453`); existing `describeShrink` (`:212-229`).
- Produces: nothing new downstream — reuses `Phase1Result` `shrink_held`.

Real test infra (verified `tests/sync/phase1.decision-rule.test.ts`): `crew(name)` (`:24`), `crewList(n)` (`:205`), `seedPriorShow(tx, prior[, {published}])` (`:191`, seeds `tx.shows` with `id:"show-1"`), `runWith(tx, next, overrides?, deps?)`, `baseArgs.binding.modifiedTime = "2026-05-08T12:00:00.000Z"`, and `FakePhase1Tx.shrinkHeldCalls` (array of `{driveFileId, payload}`) — assert against `tx.shrinkHeldCalls`, NOT a `vi.fn` spy. The existing MI-6 hold test is `crewList(5) → crewList(2)`. Anti-tautology: derive the count string from `prior.crewMembers.length`/`next.crewMembers.length`, never hardcode.

- [ ] **Step 1: Write the failing tests** — append to `tests/sync/phase1.decision-rule.test.ts`

```ts
describe("single-crew drop gate on published shows (Flow 4.1)", () => {
  test("published single-drop (cron) → shrink_held with exactly one MI-6", async () => {
    const tx = new FakePhase1Tx();
    const prior = parseResult({ crewMembers: crewList(5) });
    seedPriorShow(tx, prior); // published defaults true
    const next = parseResult({ crewMembers: crewList(4) }); // subset → crewDrop === 1
    const res = await runWith(tx, next);
    expect(res.outcome).toBe("shrink_held");
    if (res.outcome !== "shrink_held") throw new Error("unreachable");
    // failure mode caught: P0-1 — a live single-crew drop applying silently
    expect(res.shrinkItems.filter((i) => i.invariant === "MI-6")).toHaveLength(1);
    // count derived from fixture lengths, not hardcoded
    expect(res.message).toContain(`${prior.crewMembers.length}→${next.crewMembers.length}`);
    expect(res.message.toLowerCase()).toContain("crew");
    expect(tx.shrinkHeldCalls).toHaveLength(1);
  });

  test("unpublished single-drop → applies (not held)", async () => {
    const tx = new FakePhase1Tx();
    seedPriorShow(tx, parseResult({ crewMembers: crewList(5) }), { published: false });
    const res = await runWith(tx, parseResult({ crewMembers: crewList(4) }));
    // failure mode caught: over-gating drafts with setup friction
    expect(res.outcome).not.toBe("shrink_held");
    expect(tx.shrinkHeldCalls).toEqual([]);
  });

  test("published multi-drop still holds with exactly one MI-6 (no synthetic double)", async () => {
    const tx = new FakePhase1Tx();
    const prior = parseResult({ crewMembers: crewList(5) });
    seedPriorShow(tx, prior);
    const next = parseResult({ crewMembers: crewList(2) }); // crewDrop === 3
    const res = await runWith(tx, next);
    expect(res.outcome).toBe("shrink_held");
    if (res.outcome !== "shrink_held") throw new Error("unreachable");
    // failure mode caught: synthetic MI-6 double-firing → duplicate "crew" part in describeShrink
    expect(res.shrinkItems.filter((i) => i.invariant === "MI-6")).toHaveLength(1);
    expect(res.message).toContain(`${prior.crewMembers.length}→${next.crewMembers.length}`);
  });

  test("published single-drop with version-bound accept applies (bypass); no hold write", async () => {
    const tx = new FakePhase1Tx();
    seedPriorShow(tx, parseResult({ crewMembers: crewList(5) }));
    const res = await runWith(tx, parseResult({ crewMembers: crewList(4) }), {
      acceptShrink: true,
      expectedModifiedTime: baseArgs.binding.modifiedTime,
    });
    // failure mode caught: the accept fall-through broken by the new branch
    expect(["pass", "auto_apply_with_holds"]).toContain(res.outcome);
    expect(tx.shrinkHeldCalls).toEqual([]);
    // Layer note: the single removal's show_change_log orphan-remove row is written by the
    // phase2/scheduled-sync apply path (lib/sync/runScheduledCronSync.ts:3313+), which this change
    // does NOT touch and which existing phase2/producer tests already cover — out of runPhase1's layer.
  });
});
```

(`crewList(5) → crewList(4)` yields a 5→4 subset removing exactly one member → `crewDrop === 1`. `FakePhase1Tx`, `crewList`, `seedPriorShow`, `runWith`, `baseArgs` are pre-existing in this file — do NOT introduce `makeTx`/`vi.fn`/`crewMember`; use the file's own helpers as shown. `seedPriorShow` gained its optional `{published}` param in Task 1 Step 5.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ericweiss/fxav-flow4 && pnpm exec vitest run tests/sync/phase1.decision-rule.test.ts -t "single-crew drop gate"`
Expected: FAIL — published single-drop currently returns `pass`/auto-apply (not `shrink_held`); no MI-6 in shrink items.

- [ ] **Step 3: Add the synthetic-MI-6 push** — `lib/sync/phase1.ts`, replacing the `materialShrinkItems` const (~:422-425)

```ts
  const materialShrinkItems: TriggeredReviewItem[] =
    show && args.mode !== "onboarding_scan"
      ? reviewItems.filter((item) => item.invariant === "MI-6" || item.invariant === "MI-7")
      : [];
  // Flow 4.1 (audit P0-1): a PUBLISHED show losing exactly ONE crew member holds last-good
  // instead of auto-applying silently. MI-6 (invariants.ts) only fires at crewDrop > 1, so the
  // single-drop case is synthesized HERE, where publish state is known. Pushed into
  // materialShrinkItems ONLY (never reviewItems): a single removal already yields an MI-13/MI-14
  // orphan-remove item in reviewItems, so this synthetic item just triggers the hold + labels
  // describeShrink ("crew N→N-1"). crewDrop === 1 can never coexist with a real MI-6 (needs > 1),
  // so describeShrink never double-counts. Unpublished / first-seen / onboarding_scan are excluded.
  if (show && args.mode !== "onboarding_scan" && show.published) {
    const crewDrop = show.priorParseResult.crewMembers.length - args.parseResult.crewMembers.length;
    if (crewDrop === 1) {
      materialShrinkItems.push({ id: randomUUID(), invariant: "MI-6" });
    }
  }
```

- [ ] **Step 4: Run the new tests + full sync suite to verify green**

Run: `cd /Users/ericweiss/fxav-flow4 && pnpm exec vitest run tests/sync/`
Expected: PASS — the four new cases pass; every pre-existing sync test still green (multi-drop pin proves no double-fire; unpublished proves no over-gating).

- [ ] **Step 5: Commit**

```bash
cd /Users/ericweiss/fxav-flow4 && git add lib/sync/phase1.ts tests/sync/phase1.decision-rule.test.ts && git commit --no-verify -m "feat(sync): hold published single-crew drops via shrink_held (P0-1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BuoDUY5s1N3hF3GD9k7LSU"
```

---

## Task 3: Full-suite + typecheck + lint + format verification (pre-push gate)

**Files:** none (verification only).

Per project memory, scoped gates miss regressions; run the full suite + all quality gates before the close-out review.

- [ ] **Step 1: Typecheck**

Run: `cd /Users/ericweiss/fxav-flow4 && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `cd /Users/ericweiss/fxav-flow4 && pnpm test`
Expected: PASS (note any pre-existing failures also present on `origin/main` — verify at merge-base, do not attribute to this diff).

- [ ] **Step 3: Lint + format**

Run: `cd /Users/ericweiss/fxav-flow4 && pnpm exec eslint lib/sync/phase1.ts lib/sync/runScheduledCronSync.ts && pnpm format:check`
Expected: clean. (`pnpm format:check` catches the `--no-verify` prettier bypass.)

- [ ] **Step 4: Confirm no stray changes**

Run: `cd /Users/ericweiss/fxav-flow4 && git status --porcelain`
Expected: empty (all work committed; no scratch files).

---

## Self-Review (author checklist — completed at plan-write time)

**1. Spec coverage:**
- §3.1 invariant unchanged → Global Constraint (no edit to invariants.ts). ✓
- §3.2 synthetic MI-6 in materialShrinkItems → Task 2 Step 3. ✓
- §3.3 REQUIRED `published` threading → Task 1. ✓
- §4 behavior matrix → Task 2 tests (published/unpublished × single/multi). ✓
- §5 guard conditions (crewDrop 0/negative/accept) → Task 2 accept-path test + `crewDrop === 1` exactness. ✓
- §11 testing table → Task 1 producer test + Task 2 four cases. ✓
- §13 meta-test inventory (none) → Global Constraints. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows the actual code. ✓

**3. Type consistency:** `published: boolean` used identically in type def (Task 1 Step 3), producer (Step 4), doubles (Step 5), and predicate (Task 2 Step 3). `materialShrinkItems: TriggeredReviewItem[]` mutable-array form consistent with the `.push`. `shrink_held` result shape (`shrinkItems`, `message`) matches `lib/sync/phase1.ts:444-450`. ✓
