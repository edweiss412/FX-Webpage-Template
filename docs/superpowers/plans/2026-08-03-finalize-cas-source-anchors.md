# Plan — carry source anchors through the existing-show shadow

**Spec:** `docs/superpowers/specs/step3-onboarding/2026-08-03-finalize-cas-source-anchors.md` (canonical; this plan implements it and does not override it).
**Backlog:** `BL-ONBOARDING-CAS-SOURCE-ANCHORS` (`BACKLOG.md:847`), marked IN PROGRESS on this branch per invariant 12.
**Branch:** `fix/onboarding-cas-source-anchors` (worktree off `origin/main` at `67074d4dc`).
**Preflight:** RUN, not skipped. `pnpm install` + `pnpm worktree:link-env` + `pnpm preflight` all green at Stage 0 (`preflight: env ✓ local DB ✓`). This branch touches app code and tests, so the docs-only skip does not apply.

impeccable-gate: N/A — no UI surface

No file under `app/` outside `app/api/**`, none under `components/`, no `@theme` token block, no `DESIGN.md` or `tailwind.config.*` change. The two source files this plan edits are `app/api/admin/onboarding/finalize/route.ts` and `app/api/admin/onboarding/finalize-cas/route.ts` — both under `app/api/**`, which the invariant-8 definition excludes — plus `lib/onboarding/shadowPayload.ts`.

## Meta-test inventory

**CREATES none.** The change adds no registry-governed surface.

**EXTENDS none.** Declared explicitly, per surface:

- Supabase call boundary (`tests/auth/_metaInfraContract.test.ts`) — N/A. No Supabase client call is added; all three edits sit on postgres.js transaction objects.
- Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — N/A, and see the topology enumeration below: no acquisition is added, so there is no new holder for the guard to pin.
- Mutation-surface observability (`tests/log/_metaMutationSurfaceObservability.test.ts`) — N/A. No route handler, no `"use server"` action, no mutation surface is added or removed. Both routes already carry their registered emits and neither route's exported surface changes.
- Admin-alert catalog (`tests/messages/_metaAdminAlertCatalog.test.ts`) and the §12.4 catalog (`tests/cross-cutting/codes.test.ts`) — N/A. No new code; the anchors path has no user-visible error state.
- Ledger in-progress (`tests/docs/_metaLedgerInProgress.test.ts`) — **activated, not edited.** The Stage-0 marker on `BL-ONBOARDING-CAS-SOURCE-ANCHORS` opts that entry into the guard, which then requires the branch to exist on `origin` (it does, pushed at Stage 0) and requires the marker to come off at Stage 4.4.

**Test-file wiring.** The one new test file lands under `tests/onboarding/`, matched by `BASE_INCLUDE` (`vitest.projects.ts:34`) and absent from `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:86`), so it joins the **serial** project by glob — no config edit, and CI runs it in `unit-suite-db` (`.github/workflows/unit-suite.yml:101`), which boots Supabase. It is not added to `ENV_BOUND_EXCLUDES` (`vitest.projects.ts:69`); it self-skips when Postgres is unreachable, matching every sibling `*.db.test.ts`.

## Advisory-lock holder topology (invariant 2)

The plan touches two code paths that run under `hashtext('show:' || drive_file_id)`. Neither acquires.

| Site | Existing holder | This plan |
| --- | --- | --- |
| `stageExistingShowShadow` (`app/api/admin/onboarding/finalize/route.ts:602`) | The caller's `defaultWithRowTx` already holds `pg_advisory_xact_lock` for the row (`app/api/admin/onboarding/finalize/route.ts:208`) | Adds one bind parameter to an INSERT that already runs there. No acquisition, no new statement outside the lock. |
| `applyShadow` (`app/api/admin/onboarding/finalize-cas/route.ts:410`) | `adoptShowLockHeld` (`app/api/admin/onboarding/finalize-cas/route.ts:502`) — asserts the held lock, never acquires; `applyStagedCore` re-asserts (`lib/sync/applyStagedCore.ts:543`) | Adds one conditional property to an existing args object. No acquisition. |

Single-holder rule holds unchanged: exactly one acquisition per hashkey, at the row-transaction wrapper, in both flows.

---

## Task 1 — the payload parse boundary surfaces anchors, tolerantly

**Failure mode the RED catches:** `parseShadowPayloadForApply` silently dropping a key it does not know about, so anchors written by Phase B never reach Phase D even after Task 2 lands. The tolerance cases separately catch the opposite defect — a fail-closed implementation that refuses a whole shadow (and blocks a publish) over a cosmetic deep-link map.

### 1.1 RED

Add to `tests/onboarding/shadowPayload.test.ts`:

- a populated `source_anchors` map surfaces verbatim on `parsed.sourceAnchors`;
- `source_anchors` absent → `{}`, `ok: true`;
- `source_anchors: null` → `{}`, `ok: true`;
- `source_anchors: []` (array) → `{}`, `ok: true`;
- `source_anchors: "not-json"` (unparseable scalar) → `{}`, `ok: true`;
- a legacy double-encoded `JSON.stringify(map)` string → the decoded map;
- a map whose individual entry is malformed (`{schedule: {title: 5}}`) → passed through unchanged, `ok: true` (the documented §1.1 no-element-validation decision; the read boundary degrades it to `#gid=0`).

Every case asserts `ok: true` explicitly, so a fail-closed implementation fails the suite rather than passing through a shared helper.

```
pnpm vitest run tests/onboarding/shadowPayload.test.ts
```

Expected: FAIL — `sourceAnchors` does not exist on `ParsedShadowPayloadForApply`, so the file does not even typecheck under `vitest`'s transform, and the assertions fail on `undefined`. Record the failure. Do not proceed until it is red for that reason.

### 1.2 GREEN

In `lib/onboarding/shadowPayload.ts`:

1. Import the `SourceAnchor` type from `@/lib/sheet-links/buildSheetDeepLink` and `coerceJsonbObject` from `@/lib/db/coerceJsonbObject` (`asParseResult` and `coerceJsonbArray` already come from that module at `lib/onboarding/shadowPayload.ts:6`).
2. Add `sourceAnchors: Record<string, SourceAnchor>;` to the `ok: true` arm of `ParsedShadowPayloadForApply`, with a comment naming it a tolerant field and citing the wipe-guard contract.
3. In `parseShadowPayloadForApply`, immediately before the return object:

```ts
// Deep-link region anchors staged at Phase B (spec §3.2). TOLERANT, unlike the fields above:
// anchors are cosmetic deep links, so a corrupt map degrades to {}, which the Phase-D call site
// turns into an OMITTED core arg, preserving whatever shows.source_anchors already holds. Never a
// refusal: a bad anchor map must not block an otherwise-valid publish. Bare catch keeps this
// parser's no-throw contract.
let sourceAnchors: Record<string, SourceAnchor> = {};
try {
  sourceAnchors = coerceJsonbObject<Record<string, SourceAnchor>>(obj.source_anchors);
} catch {
  sourceAnchors = {};
}
```

4. Return `sourceAnchors` in the `ok: true` object.

**Verify before committing** that `coerceJsonbObject` maps `undefined`, `null`, and an array to `{}` rather than throwing or returning them — read `lib/db/coerceJsonbObject.ts:61` and make the RED cases the proof. If it returns an array as-is for the array case, normalize with an explicit `Array.isArray` guard rather than trusting the helper.

### 1.3 Verify

```
pnpm vitest run tests/onboarding/shadowPayload.test.ts tests/onboarding/pullSheetOverridePropagation.test.ts
pnpm typecheck
```

Commit: `feat(onboarding): surface staged source anchors on the shadow payload parse`

---

## Task 2 — Phase B writes the anchors into the shadow payload

**Failure mode the RED catches:** the value the scan persisted is read at `app/api/admin/onboarding/finalize/route.ts:1041`, used by Flow A, and dropped on the floor by Flow B — the actual bug. The assertion reads the payload back out of `shows_pending_changes`, not the argument handed to the staging function, so a version that accepts the parameter and forgets the `jsonb_build_object` member still fails.

### 2.1 RED

New file `tests/onboarding/` + `finalizeCasSourceAnchors` + the repo's real-DB suffix, modeled on `tests/onboarding/finalizeCasReonboardBaseline.db.test.ts` (which already drives Phase B via `handleOnboardingFinalize` and Phase D via `handleOnboardingFinalizeCas` against a live show) and on `tests/onboarding/finalizeReadsSourceAnchors.db.test.ts` (which pins the Drive-free posture by `vi.mock`ing the export functions to throw).

This task adds only the Phase-B case:

- seed a live show + a `pending_syncs` row whose `source_anchors` is the fixture map `FRESH`;
- run Phase B;
- read `payload->'source_anchors'` from `shows_pending_changes` and assert it deep-equals `FRESH`.

`FRESH` is defined once as a fixture constant and the expectation is derived from it — never a hand-written literal repeated in the assertion (anti-tautology rule).

```
pnpm vitest run tests/onboarding/<new file>
```

Expected: FAIL — the payload has no `source_anchors` key, so the read is `null`.

### 2.2 GREEN

In `app/api/admin/onboarding/finalize/route.ts`:

1. `stageExistingShowShadow` gains a required parameter `sourceAnchors: Record<string, SourceAnchor>`, documented with the same reason `use_raw_decisions` carries (`app/api/admin/onboarding/finalize/route.ts:613-617`): Phase B deletes the `pending_syncs` row, so the value must ride in the payload or cease to exist.
2. Add `'source_anchors', $14::jsonb` to the `jsonb_build_object`, and `sourceAnchors` as the 14th bind parameter — the raw object, never `JSON.stringify`d (`lib/sync/runScheduledCronSync.ts:1427` documents the double-encode trap).
3. The call site at `app/api/admin/onboarding/finalize/route.ts:1140` passes the `sourceAnchors` local computed at `app/api/admin/onboarding/finalize/route.ts:1041`.

`SourceAnchor` is already imported in this file (it types the local at `app/api/admin/onboarding/finalize/route.ts:1041`); confirm rather than re-adding the import.

### 2.3 Verify

```
pnpm vitest run tests/onboarding/<new file> tests/onboarding/finalize.test.ts tests/onboarding/finalizeCasReonboardBaseline.db.test.ts
pnpm typecheck
```

Commit: `feat(onboarding): stage source anchors into the existing-show shadow payload`

---

## Task 3 — Phase D applies them, and cannot wipe them

**Failure mode the RED catches:** two distinct defects, one per case. The refresh case catches Phase D never forwarding the parsed anchors (the remaining half of the bug). The wipe case catches an implementation that forwards unconditionally — a defined `{}` reaching `source_anchors = coalesce($18::jsonb, source_anchors)` (`lib/sync/runScheduledCronSync.ts:1527`) durably erases anchors a prior cron sync computed, which is strictly worse than the bug being fixed.

### 3.1 RED

Extend the Task-2 file with two cases, both running Phase B then Phase D end to end:

- **Refresh:** live show seeded with `shows.source_anchors = PRIOR`; `pending_syncs.source_anchors = FRESH`; after Phase D, `shows.source_anchors` deep-equals `FRESH`. `PRIOR` and `FRESH` are distinct fixture maps (different `gid` and `title` values), so neither case can pass by coincidence.
- **Wipe guard:** live show seeded with `shows.source_anchors = PRIOR`; `pending_syncs.source_anchors = '{}'`; after a Phase D that reports success, `shows.source_anchors` still deep-equals `PRIOR`.

Both cases assert the apply actually succeeded (the row's result code is the OK code and the shadow row is consumed) before asserting on anchors — an apply that refused would trivially "preserve" `PRIOR` and make the wipe guard vacuous.

What the wipe guard does NOT prove is spec §4.1: a preserved `PRIOR` map can predate the revision just applied, and no assertion at this layer can tell that apart from a correctly preserved one. The test is a guard against wiping, not a claim of freshness.

Keep the `vi.mock` of the Drive export functions from `tests/onboarding/finalizeReadsSourceAnchors.db.test.ts:16-30` so the file also pins that Phase D performs no XLSX export.

Expected: refresh FAILS (anchors still `PRIOR`), wipe guard PASSES (vacuously — Phase D forwards nothing today). Record both; the wipe guard becomes load-bearing the moment 3.2 lands.

### 3.2 GREEN

In `app/api/admin/onboarding/finalize-cas/route.ts`, in the `applyStagedCore` args at `app/api/admin/onboarding/finalize-cas/route.ts:546`:

```ts
// Deep-link anchors staged at Phase B (spec §3.3). OMITTED when empty, never a defined {}: the
// applyShowSnapshot UPDATE arm coalesces (runScheduledCronSync.ts:1527), so a defined empty map
// durably wipes anchors a prior cron sync computed. Same guard as Flow A (finalize/route.ts:1280).
...(Object.keys(parsed.sourceAnchors).length > 0 ? { sourceAnchors: parsed.sourceAnchors } : {}),
```

### 3.3 Verify

```
pnpm vitest run tests/onboarding/<new file>
pnpm vitest run tests/onboarding tests/sync
pnpm typecheck && pnpm lint && pnpm format:check
```

Commit: `feat(onboarding): apply staged source anchors on the finalize-cas shadow apply`

---

## Task 4 — close-out

1. Full suite: `pnpm test`. Any failure triaged against the merge-base before it is treated as this branch's.
2. `pnpm spec:lint` on the spec; re-run the numeric and self-consistency sweeps over both spec and plan after every repair round.
3. Whole-diff cross-model adversarial review to APPROVE.
4. Push, real CI green, `gh pr merge --merge`, fast-forward local `main`, verify `git rev-list --left-right --count main...origin/main` reports `0  0`.
5. Clear the `BL-ONBOARDING-CAS-SOURCE-ANCHORS` IN PROGRESS marker (invariant 12) — in the same PR, so no marker outlives its branch. The entry graduates to `BACKLOG-archive.md` per the open-queue-only rule.

## Regression budget

If a review round patches any of the three edits, the next round's preparation re-greps the class across all three sites (`grep -n "sourceAnchors" app/api/admin/onboarding/finalize/route.ts app/api/admin/onboarding/finalize-cas/route.ts lib/onboarding/shadowPayload.ts`), confirms the wipe guard is still present at both Flow-A and Flow-B call sites, and records both in the round closure. The Flow-A guard at `app/api/admin/onboarding/finalize/route.ts:1280` is pre-existing and must not be disturbed by any repair to Flow B.
