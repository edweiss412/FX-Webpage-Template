# last_checked_at Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `shows.last_checked_at` and base the age-tiers of both health surfaces (admin Drive badge + crew StaleFooter) on it, so an idle-but-healthy folder stops reading "needs attention" / "sync delayed."

**Architecture:** New nullable per-show timestamp, bumped on every non-error cron pass (incl. watermark-skip) while riding the existing per-show advisory lock. `last_synced_at` write behavior is untouched (still drives the version token + admin recency). Age tiers in `driveConnectionHealth` and `StaleFooter` switch from `last_synced_at` to `last_checked_at`; the `pending_review`/`shrink_held` >6h age clause is dropped from both. Crew-facing copy "synced"→"checked" via the §12.4 3-file lockstep.

**Tech Stack:** Next.js 16, Supabase/Postgres, postgres.js, TypeScript, Vitest, React Server Components.

**Spec:** `docs/superpowers/specs/2026-07-16-last-checked-at.md` (Codex-APPROVED).

## Global Constraints

- **TDD per task:** failing test → minimal impl → green → commit. Never impl before its test.
- **Commit per task**, conventional-commits: `<type>(<scope>): <summary>`. Scopes here: `db`, `sync`, `admin`, `crew-page`, `messages`. `--no-verify` (shared hooks live in the main checkout).
- **Invariant 2 (advisory lock, single-holder):** every new `last_checked_at` write rides an EXISTING held `show:<drive_file_id>` lock tx — never a second acquisition, never a lock-free `shows` mutation.
- **Invariant 5:** no raw error codes in UI; copy via `lib/messages/lookup.ts` / §12.4 catalog.
- **§12.4 3-file lockstep:** any §12.4 prose edit lands with `pnpm gen:spec-codes` regen + matching `lib/messages/catalog.ts` row in the SAME commit (x1 gate `tests/cross-cutting/codes.test.ts`).
- **Migration parity:** apply locally + `pnpm gen:schema-manifest` (commit) + apply surgically to validation project (`validation-schema-parity` gate).
- **`last_synced_at` untouched:** add no `last_synced_at` write, remove none. It keeps bumping on applied / pending_review-stage / the three error statuses; NOT on watermark-skip / shrink_held.
- **Version token untouched:** `viewer_version_token` RPC stays on `last_synced_at`; `last_checked_at` must NEVER enter it.
- **UI invariant 8:** `StaleFooter.tsx` + `DriveConnectionPanel.tsx` are UI surfaces → `/impeccable critique` + `/impeccable audit` before the whole-diff review; P0/P1 fixed or `DEFERRED.md`.

## Meta-test inventory (declared per project rule)

- **EXTENDS** `tests/admin/_metaInfraContract.test.ts` — `driveConnectionHealth` stays registered (invariant 9); no new registry row needed (function already listed).
- **TOUCHES** `tests/sync/_advisoryLockSingleHolderContract.test.ts` — the skip-path write rides the existing single holder; verify this contract still passes (no new holder). No new pin required (topology unchanged).
- **CREATES** no new meta-test. No new RPC-gated table → no PostgREST-DML-lockdown meta-test.
- **x4-no-global-cursor** (`tests/cross-cutting/no-global-cursor.test.ts`): `last_checked_at` is not a banned watermark name (verified in spec §9) → no allowlist/master-spec edit; run green as a gate.

## Advisory-lock holder topology (declared per project rule)

For hashkey `show:<drive_file_id>`, the sole holder is the JS-side wrapper
`withPostgresSyncPipelineLock` (`lib/sync/runScheduledCronSync.ts:1851` → `lib/sync/lockedShowTx.ts:88` `withShowLock` → `:74` `pg_try_advisory_xact_lock(hashtext('show:'||$1))`).
- Apply / pending_review / shrink_held writes run inside `processOneFile_unlocked` under that wrapper (cron loop `:2698-2708`).
- The new watermark-skip write goes inside the SAME wrapper's skip-branch callback (`:2688-2694`), reusing `lockedTx`. **No second acquisition anywhere.** `logSync` (inside that callback) does not re-take the lock.

## File map

- Create: `supabase/migrations/20260717000000_shows_last_checked_at.sql`
- Modify: `supabase/__generated__/schema-manifest.json` (regen)
- Modify: `lib/sync/runScheduledCronSync.ts` (4 write sites + skip callback)
- Modify: `lib/admin/driveConnectionHealth.ts` (age tiers, `readMaxLastCheckedAt`, drop clause)
- Modify: `components/shared/StaleFooter.tsx`, `components/layout/Footer.tsx`, `app/show/[slug]/[shareToken]/_CrewShell.tsx`, `lib/data/getShowForViewer.ts` (prop chain)
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 prose), `lib/messages/__generated__/spec-codes.ts` (regen), `lib/messages/catalog.ts` (2 rows)
- Test: `tests/sync/lastCheckedAt.db.test.ts` (new), `tests/admin/driveConnectionHealth.test.ts`, `tests/components/StaleFooter.test.tsx`, `tests/components/shared/staleFooter-now-prop.test.ts`, `tests/data/getShowForViewer.*`

---

### Task 1: Migration + backfill + schema-manifest

**Files:**
- Create: `supabase/migrations/20260717000000_shows_last_checked_at.sql`
- Modify: `supabase/__generated__/schema-manifest.json`

**Interfaces:**
- Produces: `shows.last_checked_at timestamptz` (nullable), backfilled to `last_synced_at`.
- Test: `tests/db/showsLastCheckedAt.schema.test.ts`

- [ ] **Step 1: Write the failing schema test (red-first, per invariant 1)**

Model on `tests/db/agendaExtractLeases.schema.test.ts` (postgres.js vs `TEST_DATABASE_URL`, defaults to local `54322`). New `tests/db/showsLastCheckedAt.schema.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const sql = postgres(
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
afterAll(async () => { await sql.end(); });

describe("shows.last_checked_at column", () => {
  it("exists as a nullable timestamptz", async () => {
    const rows = await sql`
      select data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public' and table_name = 'shows' and column_name = 'last_checked_at'`;
    expect(rows.length).toBe(1);
    expect(rows[0].data_type).toBe("timestamp with time zone");
    expect(rows[0].is_nullable).toBe("YES");
  });
  it("is backfilled: no active row has null last_checked_at where last_synced_at is set", async () => {
    const [{ orphans }] = await sql`
      select count(*)::int as orphans from public.shows
      where archived = false and last_synced_at is not null and last_checked_at is null`;
    expect(orphans).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run tests/db/showsLastCheckedAt.schema.test.ts`
Expected: FAIL — `rows.length` is 0 (column absent).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260717000000_shows_last_checked_at.sql
-- last_checked_at: "we successfully reached Drive and evaluated this show" timestamp.
-- Distinct from last_synced_at (last content apply / stage / error). Drives the age
-- tiers of driveConnectionHealth + StaleFooter so idle-but-healthy shows read healthy.
alter table public.shows add column if not exists last_checked_at timestamptz;

-- Backfill: best available seed is the last known terminal-outcome time.
update public.shows set last_checked_at = last_synced_at where last_checked_at is null;
```

- [ ] **Step 4: Apply locally + run the schema test — expect PASS**

Run: `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260717000000_shows_last_checked_at.sql` (or `supabase db query --linked` for the local stack), then
`pnpm vitest run tests/db/showsLastCheckedAt.schema.test.ts`
Expected: PASS (column exists, nullable timestamptz, backfill complete).

- [ ] **Step 5: Regenerate schema-manifest**

Run: `pnpm gen:schema-manifest`
Then confirm: `grep -n last_checked_at supabase/__generated__/schema-manifest.json`
Expected: the shows table block (≈`:328-363`) now lists `last_checked_at`.

- [ ] **Step 6: Apply to the validation project (parity gate)**

Run:
```bash
supabase db query --linked "alter table public.shows add column if not exists last_checked_at timestamptz; update public.shows set last_checked_at = last_synced_at where last_checked_at is null; notify pgrst, 'reload schema';"
```
Expected: success (idempotent). This satisfies `validation-schema-parity`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260717000000_shows_last_checked_at.sql supabase/__generated__/schema-manifest.json tests/db/showsLastCheckedAt.schema.test.ts
git commit --no-verify -m "feat(db): add shows.last_checked_at + backfill; regen schema-manifest"
```

---

### Task 2: Cron writes `last_checked_at` on applied / pending_review / shrink_held (in-lock)

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts:1114` (shrink_held), `:1130` (pending_review), `:1484` + `:1511` (applied UPDATE), `:1548`+`:1553` (first-seen INSERT)
- Test: `tests/sync/lastCheckedAt.db.test.ts`

**Interfaces:**
- Consumes: `shows.last_checked_at` (Task 1).
- Produces: applied → both timestamps; pending_review → both; shrink_held → `last_checked_at` only (`last_synced_at` still frozen per audit #3).

- [ ] **Step 1: Write the failing DB test**

Model on an existing cron-write DB test (e.g. `tests/sync/_holdAwareTestkit.ts` seeding + `tests/sync/qualityRegressionLifecycle.test.ts`). New file `tests/sync/lastCheckedAt.db.test.ts`:

```ts
// Seeds a show, drives each in-lock write helper directly, asserts the timestamp deltas.
// Uses the same PgWrites/tx harness the sibling cron DB tests use.
import { describe, it, expect } from "vitest";
// ... import the tx harness + the writer class used by the sibling tests ...

describe("last_checked_at cron writes (in-lock)", () => {
  it("pending_review bumps both last_synced_at and last_checked_at", async () => {
    const { showId, writer } = await seedShow({ lastSyncedAt: hoursAgo(3), lastCheckedAt: hoursAgo(3) });
    await writer.updateShowPendingReview(driveFileId);
    const row = await readShow(showId);
    expect(msAgo(row.last_synced_at)).toBeLessThan(60_000);
    expect(msAgo(row.last_checked_at)).toBeLessThan(60_000);
  });

  it("shrink_held bumps last_checked_at only; last_synced_at stays frozen", async () => {
    const frozen = hoursAgo(3);
    const { showId, writer } = await seedShow({ lastSyncedAt: frozen, lastCheckedAt: hoursAgo(3) });
    await writer.updateShowShrinkHeld(driveFileId, { message: "shrunk" });
    const row = await readShow(showId);
    expect(new Date(row.last_synced_at).getTime()).toBe(new Date(frozen).getTime()); // unchanged
    expect(msAgo(row.last_checked_at)).toBeLessThan(60_000); // bumped
  });

  it("applied (updateShow / applyShowSnapshot) bumps both", async () => {
    // Drive the applied UPDATE path; assert both timestamps < 60s old.
  });

  // Spec §9 regression guard: error writers keep their existing last_synced_at bump
  // and must NOT gain a last_checked_at bump. One case per error status.
  it("drive_error bumps last_synced_at (existing) but NOT last_checked_at", async () => {
    const frozenChecked = hoursAgo(3);
    const { showId, writer } = await seedShow({ lastSyncedAt: hoursAgo(3), lastCheckedAt: frozenChecked });
    await writer.markShowDriveError(driveFileId, "DRIVE_FETCH_FAILED");
    const row = await readShow(showId);
    expect(msAgo(row.last_synced_at)).toBeLessThan(60_000);                                  // existing bump preserved
    expect(new Date(row.last_checked_at).getTime()).toBe(new Date(frozenChecked).getTime());  // NOT bumped
  });
  it("sheet_unavailable bumps last_synced_at but NOT last_checked_at", async () => {
    const frozenChecked = hoursAgo(3);
    const { showId, writer } = await seedShow({ lastSyncedAt: hoursAgo(3), lastCheckedAt: frozenChecked });
    await writer.markShowSheetUnavailable(driveFileId, "SHEET_UNAVAILABLE");
    const row = await readShow(showId);
    expect(msAgo(row.last_synced_at)).toBeLessThan(60_000);
    expect(new Date(row.last_checked_at).getTime()).toBe(new Date(frozenChecked).getTime());
  });
  it("parse_error bumps last_synced_at but NOT last_checked_at", async () => {
    const frozenChecked = hoursAgo(3);
    const { showId, writer } = await seedShow({ lastSyncedAt: hoursAgo(3), lastCheckedAt: frozenChecked });
    await writer.updateShowParseError(driveFileId, { code: "PARSE_ERROR", message: "bad" });
    const row = await readShow(showId);
    expect(msAgo(row.last_synced_at)).toBeLessThan(60_000);
    expect(new Date(row.last_checked_at).getTime()).toBe(new Date(frozenChecked).getTime());
  });
});
```

(Implementer: reuse the exact seed/tx helpers the neighboring `tests/sync/*.db.test.ts` use — do NOT hand-roll a Supabase mock. Derive `hoursAgo`/`msAgo` locally; never hardcode wall-clock. Match `updateShowParseError`'s real signature at `runScheduledCronSync.ts:1075` — adjust the payload arg to the live shape. These three error cases are RED before Step 3 only in that the seed must carry `last_checked_at`; they must still PASS after Step 3 since Step 3 does NOT touch the error writers — they are the regression guard that the error writers stay `last_checked_at`-free.)

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run tests/sync/lastCheckedAt.db.test.ts`
Expected: FAIL — `last_checked_at` is null/unchanged after the writes.

- [ ] **Step 3: Add `last_checked_at = now()` to the four SQL sites**

`:1114` shrink_held UPDATE — add the line after `last_sync_error = $2,`:
```
               last_sync_error = $2,
               last_checked_at = now()
```
`:1130` pending_review UPDATE — after `last_synced_at = now()`:
```
               last_synced_at = now(),
               last_checked_at = now()
```
`:1484` skipDiagrams applied UPDATE and `:1511` full applied UPDATE — after `last_synced_at = now(),`:
```
                   last_synced_at = now(),
                   last_checked_at = now(),
```
`:1548` first-seen INSERT column list — insert `last_checked_at` right after `last_synced_at`:
```
                  last_synced_at, last_checked_at, last_sync_status, last_sync_error${extraColumns}
```
`:1553` INSERT values — add a second `now()` right after the `last_synced_at` `now()`:
```
                        $21::jsonb, now(), now(), 'ok', null${extraValues})
```
(Literal `now()` — no positional param added, so INSERT param arity is unchanged.)

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run tests/sync/lastCheckedAt.db.test.ts`
Expected: PASS. Then `pnpm vitest run tests/sync/_insertParamsArityContract.test.ts tests/sync/_advisoryLockSingleHolderContract.test.ts` — both green (arity balanced; no new lock holder).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/runScheduledCronSync.ts tests/sync/lastCheckedAt.db.test.ts
git commit --no-verify -m "feat(sync): bump last_checked_at on applied/pending_review/shrink_held writes"
```

---

### Task 3: Cron writes `last_checked_at` on watermark-skip / deferred (skip-path lock callback)

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts:2688-2694` (skip-branch lock callback)
- Test: `tests/sync/lastCheckedAt.db.test.ts` (extend)

**Interfaces:**
- Consumes: the existing `lock(driveFileId, async (lockedTx) => {…})` skip callback.
- Produces: non-archived watermark-skip / deferred → `last_checked_at` bumped, `last_synced_at` unchanged; archived skip → neither; error statuses → `last_synced_at` unchanged behavior preserved, `last_checked_at` NOT bumped.

- [ ] **Step 1: Extend the DB test (failing)**

```ts
it("watermark-skip bumps last_checked_at only; last_synced_at frozen", async () => {
  const frozen = hoursAgo(3);
  const { showId } = await seedShow({ lastSyncedAt: frozen, lastCheckedAt: hoursAgo(3) });
  await processOneFile(driveFileId, "cron", fileMetaUnchangedSince(frozen), deps); // watermark-skip
  const row = await readShow(showId);
  expect(new Date(row.last_synced_at).getTime()).toBe(new Date(frozen).getTime());
  expect(msAgo(row.last_checked_at)).toBeLessThan(60_000);
});

it("archived show skip writes NEITHER timestamp", async () => {
  const frozen = hoursAgo(3);
  const { showId } = await seedShow({ archived: true, lastSyncedAt: frozen, lastCheckedAt: frozen });
  await processOneFile(driveFileId, "cron", fileMetaUnchangedSince(frozen), deps);
  const row = await readShow(showId);
  expect(new Date(row.last_checked_at).getTime()).toBe(new Date(frozen).getTime()); // untouched
});
```

- [ ] **Step 2: Run — expect FAIL** (watermark-skip case: `last_checked_at` unchanged).

Run: `pnpm vitest run tests/sync/lastCheckedAt.db.test.ts`

- [ ] **Step 3: Add the write inside the skip callback**

At `:2688-2694`, inside the `lock(driveFileId, async (lockedTx) => {…})` callback, AFTER the `readShowArchived_unlocked` guard returns for archived, and alongside `logSync`, add the write using `lockedTx`:

```ts
const logged = await lock(driveFileId, async (lockedTx) => {
  if (await readShowArchived_unlocked(lockedTx, driveFileId)) {
    return { outcome: "skipped" as const, reason: ARCHIVED_SKIP_REASON };
  }
  // Non-error skip (watermark / deferred_modtime / deferred_permanent) = a successful Drive
  // check that applied nothing. Advance last_checked_at so idle-but-healthy shows stay fresh
  // for the age tiers. Rides THIS single held show-lock tx (invariant 2); last_synced_at untouched.
  await lockedTx.queryOne<{ updated: true } | undefined>(
    "update public.shows set last_checked_at = now() where drive_file_id = $1 returning true as updated",
    [driveFileId],
  );
  await logSync(deps, driveFileId, prepared.result, prepared.payload);
  return prepared.result;
});
```
(API note — verified: the tx handle is `LockableSyncTx` whose ONLY method is
`queryOne<T>(sql, params)` (`lib/sync/lockedShowTx.ts:5-7`); it tolerates zero
rows by typing `T | undefined` and using `returning …` — the exact shape
`readShowArchived_unlocked` (`lib/sync/lifecycleGuards.ts:12`) and `logSync`'s
writers (`runScheduledCronSync.ts:220-228`) use. A missing show row —
`deferred_permanent` for a non-show file — returns `undefined`, no throw. Do NOT
use `.query(...)`; it does not exist. Error outcomes never reach this skip branch:
`parse_error`/`drive_error`/`sheet_unavailable` are `gate.proceed`, handled by the
Task-2 error writers, which the spec leaves NOT bumping `last_checked_at`.)

- [ ] **Step 4: Run — expect PASS** (both new cases + all Task 2 cases still green).

Run: `pnpm vitest run tests/sync/lastCheckedAt.db.test.ts tests/sync/_advisoryLockSingleHolderContract.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/sync/runScheduledCronSync.ts tests/sync/lastCheckedAt.db.test.ts
git commit --no-verify -m "feat(sync): bump last_checked_at on non-archived watermark-skip (in-lock)"
```

---

### Task 4: `driveConnectionHealth` age tiers → `last_checked_at`; drop pending_review clause

**Files:**
- Modify: `lib/admin/driveConnectionHealth.ts` (`:238-260` tiers, `:341-359` `readMaxLastSyncedAt`→`readMaxLastCheckedAt`, `:123` comment)
- Test: `tests/admin/driveConnectionHealth.test.ts`

**Interfaces:**
- Consumes: `shows.last_checked_at`.
- Produces: `stale_moderate`/`stale_severe` derived from `last_checked_at`; `lastReadAt` = max `last_checked_at`; `pending_review`>6h clause removed; status tiers unchanged.

- [ ] **Step 1: Write/adjust failing unit tests**

In `tests/admin/driveConnectionHealth.test.ts` add the core regression + re-seed existing cases to `last_checked_at` (the mock rows must now carry `last_checked_at`):

```ts
it("idle-healthy: last_checked_at 5m ago + last_synced_at 3h ago + ok → positive", async () => {
  mockActiveShows([{ last_sync_status: "ok", last_synced_at: hoursAgo(3), last_checked_at: minutesAgo(5) }]);
  const h = await fetchDriveConnectionHealth();
  expect(h).toMatchObject({ health: "positive" });
});
it("last_checked_at 2h ago → stale_moderate", async () => { /* … reason: "stale_moderate" */ });
it("last_checked_at 7h ago (or null) → stale_severe", async () => { /* … */ });
it("pending_review + fresh last_checked_at → positive (dropped clause)", async () => {
  mockActiveShows([{ last_sync_status: "pending_review", last_checked_at: minutesAgo(5), last_synced_at: hoursAgo(9) }]);
  expect(await fetchDriveConnectionHealth()).toMatchObject({ health: "positive" });
});
it("drive_error still red regardless of fresh last_checked_at", async () => { /* status tier unchanged */ });
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run tests/admin/driveConnectionHealth.test.ts`

- [ ] **Step 3: Re-base the tiers**

In `lib/admin/driveConnectionHealth.ts`:
- `stale_severe` count (`:248-256`): replace the `last_synced_at` predicate with `last_checked_at`, and REMOVE the `and(last_sync_status.eq.pending_review,last_synced_at.lt.…)` sub-clause:
```ts
const staleSevereCount = await countActive(supabase, (q) =>
  q.or(`last_checked_at.is.null,last_checked_at.lt.${sixHoursAgo}`),
);
```
- `stale_moderate` count (`:259-260`): `q.lt("last_checked_at", oneHourAgo).gte("last_checked_at", sixHoursAgo)`.
- `sync_unknown` null-status-fresh probe (`:238-239`): the `.not("last_synced_at","is",null)` there detects a fresh-timestamp null-status row (an integrity signal). Leave on `last_synced_at` (it is about content-write integrity, not check-freshness) — DO NOT change (documented: this tier precedes the age tiers and is status-based).
- `readMaxLastSyncedAt` (`:343-359`): rename to `readMaxLastCheckedAt`, `.select("last_checked_at")`, `.order("last_checked_at", …)`, return `rows[0]?.last_checked_at`. Update its call site (`:124`) + comment (`:123`).

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run tests/admin/driveConnectionHealth.test.ts tests/admin/_metaInfraContract.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/admin/driveConnectionHealth.ts tests/admin/driveConnectionHealth.test.ts
git commit --no-verify -m "feat(admin): driveConnectionHealth age tiers use last_checked_at; drop pending_review clause"
```

---

### Task 5: Crew footer chain → `last_checked_at` (StaleFooter + Footer + _CrewShell + getShowForViewer)

**Files:**
- Modify: `components/shared/StaleFooter.tsx`, `components/layout/Footer.tsx:65/101/121/123`, `app/show/[slug]/[shareToken]/_CrewShell.tsx:481`, `lib/data/getShowForViewer.ts:200/846`
- Test: `tests/components/StaleFooter.test.tsx`, `tests/components/shared/staleFooter-now-prop.test.ts`, `tests/data/getShowForViewer.*`

**Interfaces:**
- Consumes: `getShowForViewer` row (already `select("*")`).
- Produces: `StaleFooter` prop `lastCheckedAt`; `Footer` prop `lastCheckedAt`; `getShowForViewer` return gains `lastCheckedAt: string | null` (keeps `lastSyncedAt`).

- [ ] **Step 0: Write the failing `getShowForViewer` projection test (spec §9)**

New `tests/data/getShowForViewer.lastCheckedAt.test.ts` (model the row-mock + call on the sibling `tests/data/getShowForViewer.test.ts` / `getShowForViewer-rooms-projection.test.ts`):

```ts
import { describe, it, expect } from "vitest";
// ... reuse the sibling test's row-mock + getShowForViewer invocation harness ...

describe("getShowForViewer — last_checked_at projection", () => {
  it("projects lastCheckedAt from the shows row (independent of lastSyncedAt)", async () => {
    const row = await getShowForViewerWith({ last_checked_at: "2026-07-16T20:00:00Z", last_synced_at: "2026-07-16T17:00:00Z" });
    expect(row.lastCheckedAt).toBe("2026-07-16T20:00:00Z");
    expect(row.lastSyncedAt).toBe("2026-07-16T17:00:00Z"); // still returned — version token depends on it
  });
  it("null last_checked_at → lastCheckedAt null", async () => {
    const row = await getShowForViewerWith({ last_checked_at: null, last_synced_at: "2026-07-16T17:00:00Z" });
    expect(row.lastCheckedAt).toBeNull();
  });
});
```

Run: `pnpm vitest run tests/data/getShowForViewer.lastCheckedAt.test.ts` → FAIL (`lastCheckedAt` undefined on the return type).

- [ ] **Step 1: Adjust failing StaleFooter tests**

Rename prop in the tests to `lastCheckedAt`; add the tier + copy assertions:

```tsx
it("checked 5m ago → subtle, copy 'Last checked'", () => {
  render(<StaleFooter lastCheckedAt={minutesAgo(5)} lastSyncStatus="ok" now={NOW} />);
  expect(screen.getByTestId("stale-footer")).toHaveTextContent(/Last checked/);
  expect(screen.getByTestId("stale-footer")).toHaveAttribute("data-tier", "subtle");
});
it("checked 2h ago → yellow SYNC_DELAYED_MODERATE", () => { /* data-code=SYNC_DELAYED_MODERATE */ });
it("checked 7h ago → red SYNC_DELAYED_SEVERE", () => { /* data-code=SYNC_DELAYED_SEVERE */ });
it("shrink_held + checked 5m ago → subtle (dropped clause)", () => {
  render(<StaleFooter lastCheckedAt={minutesAgo(5)} lastSyncStatus="shrink_held" now={NOW} />);
  expect(screen.getByTestId("stale-footer")).toHaveAttribute("data-tier", "subtle");
});
it("drive_error → red regardless", () => { /* data-code=DRIVE_FETCH_FAILED */ });
```
(Anti-tautology: assert on `data-code`/`data-tier`, derive expected tier from the fixture age, never hardcode.)

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm vitest run tests/components/StaleFooter.test.tsx tests/components/shared/staleFooter-now-prop.test.ts`

- [ ] **Step 3: Re-base StaleFooter + rename the chain**

`StaleFooter.tsx`: prop `lastSyncedAt`→`lastCheckedAt` (`:27`, `:82`, `:83` guard, `:85`), and in `selectCodeAndTier` REMOVE the `(pending_review||shrink_held) && hours>6` clause (`:70-72`) so those fall through to the age ladder; the hardcoded branch (`:98`) "Last synced {relative} ago"→"Last checked {relative} ago". `ageMs`/`relative` now derive from `lastCheckedAt`.
`Footer.tsx`: prop `lastSyncedAt`→`lastCheckedAt` (type `:65`, JSDoc `:60-67`, destructure `:101`), guard `{lastSyncedAt ? (`→`{lastCheckedAt ? (` (`:121`), pass `lastCheckedAt={lastCheckedAt}` (`:123`). `lastSyncStatus` unchanged.
`_CrewShell.tsx:481`: `lastSyncedAt={data.lastSyncedAt}`→`lastCheckedAt={data.lastCheckedAt}`.
`getShowForViewer.ts`: add `lastCheckedAt: string | null` to the return type (`:200`) and project `(showRowDb.last_checked_at as string | null | undefined) ?? null` (`:846`). Keep `lastSyncedAt`.

- [ ] **Step 4: Run — expect PASS** (+ getShowForViewer test still returns `lastSyncedAt` for the version token)

Run: `pnpm vitest run tests/data/getShowForViewer.lastCheckedAt.test.ts tests/components/StaleFooter.test.tsx tests/components/shared/staleFooter-now-prop.test.ts tests/data/getShowForViewer.parallel.test.ts`
(the last one — the version-token contract — must STILL pass unchanged, proving `last_checked_at` did not leak into the token.)

- [ ] **Step 5: Typecheck (RSC boundary + prop chain) + commit**

Run: `pnpm typecheck`
```bash
git add components/shared/StaleFooter.tsx components/layout/Footer.tsx "app/show/[slug]/[shareToken]/_CrewShell.tsx" lib/data/getShowForViewer.ts tests/data/getShowForViewer.lastCheckedAt.test.ts tests/components/StaleFooter.test.tsx tests/components/shared/staleFooter-now-prop.test.ts
git commit --no-verify -m "feat(crew-page): StaleFooter/Footer chain uses last_checked_at; copy synced→checked"
```

---

### Task 6: §12.4 copy lockstep — SYNC_DELAYED_MODERATE + ADMIN_DRIVE_HEALTH_UNAVAILABLE

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2977` (MODERATE trigger + crew copy), `:2978` (SEVERE trigger prose only), `:3000` (ADMIN_DRIVE_HEALTH trigger), `:3277` (ADMIN_DRIVE_HEALTH helpfulContext)
- Modify: `lib/messages/catalog.ts:2253` (MODERATE crewFacing), `:2519` (ADMIN_DRIVE_HEALTH helpfulContext)
- Regen: `lib/messages/__generated__/spec-codes.ts`
- Test: `tests/cross-cutting/codes.test.ts` (x1 gate)

**Interfaces:** none (copy only).

- [ ] **Step 1: Edit master spec §12.4 prose**

`:2977` MODERATE row — trigger `last_synced_at`→`last_checked_at`; crew copy "Last synced *<time>* ago…"→"Last checked *<time>* ago…".
`:2978` SEVERE row — trigger `last_synced_at is more than 6h old`→`last_checked_at is more than 6h old` (crew/doug copy unchanged).
`:3000` ADMIN_DRIVE_HEALTH trigger — "…or last_synced_at read failed"→"…or last_checked_at read failed".
`:3277` ADMIN_DRIVE_HEALTH helpfulContext — "…or last_synced_at read returned/threw"→"…last_checked_at…".
(Do NOT run prettier on the master spec — memory: mangles §12.4 → x1 fails.)

- [ ] **Step 2: Regenerate spec-codes**

Run: `pnpm gen:spec-codes`
Expected: `lib/messages/__generated__/spec-codes.ts` updated.

- [ ] **Step 3: Edit catalog.ts matching rows**

`:2253` `crewFacing: "Last checked *<time>* ago. Text Doug if anything looks off."`
`:2519` helpfulContext "…a watch-status, active-shows count, or last_checked_at read returned/threw…".

- [ ] **Step 4: Run x1 — expect PASS**

Run: `pnpm test:audit:x1-catalog-parity`
Expected: PASS (catalog ↔ §12.4 prose match).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts
git commit --no-verify -m "feat(messages): SYNC_DELAYED + ADMIN_DRIVE_HEALTH copy → checked (§12.4 lockstep)"
```

---

### Task 7: e2e stale-sync fixture → `last_checked_at`

**Files:**
- Modify: `tests/e2e/empty-state-reachability.spec.ts` (`:26-29` doc, `:61` const, `:68-70` Snapshot type, `:72-90` `snapshot()`, `:93-104` `restore()`, `:206-220` category-4 test)

**Why this is its own task:** e2e Playwright specs are EXCLUDED from `pnpm test` (memory: env-bound/e2e excluded), so the full suite in Task 8 does NOT cover this. The category-4 stale-sync test drives the crew `StaleFooter` by mutating `last_synced_at` — after Task 5, `StaleFooter` reads `last_checked_at`, so this fixture would set the wrong column and the SYNC_DELAYED_SEVERE assertion would fail.

- [ ] **Step 1: Switch the fixture column to `last_checked_at`**

- `snapshot()` select (`:75`): add `last_checked_at` → `"id, slug, venue, event_details, last_synced_at, last_checked_at, last_sync_status"`.
- `Snapshot` type (`:68`): add `originalLastCheckedAt: string | null;`.
- `snapshot()` return (`:88`): add `originalLastCheckedAt: (showRes.data.last_checked_at as string | null) ?? null,` (keep `originalLastSyncedAt`).
- `restore()` update (`:99`): add `last_checked_at: s.originalLastCheckedAt,` (keep `last_synced_at`).
- category-4 test (`:212`): change `.update({ last_synced_at: stale, last_sync_status: "ok" })` → `.update({ last_checked_at: stale, last_sync_status: "ok" })`. Keep the `data-code="SYNC_DELAYED_SEVERE"` assertion (`:219`).
- Update the doc comment (`:26-29`) "`shows.last_synced_at` is more than 6 hours old" → "`shows.last_checked_at`".

- [ ] **Step 2: Run the e2e stale-sync test**

Run: `pnpm test:e2e -- empty-state-reachability.spec.ts` (or the project's e2e runner; needs `TEST_DATABASE_URL` + a running app).
Expected: category-4 PASS — footer shows `data-code="SYNC_DELAYED_SEVERE"` driven by the 7h-old `last_checked_at`.

- [ ] **Step 3: Screenshot baseline check**

`SYNC_DELAYED_SEVERE.crewFacing` ("This page hasn't updated recently…") has NO `<time>` placeholder and is UNCHANGED by this feature, so `category-4-stale-sync-severe.png` is byte-stable — no rebaseline expected. IF any screenshot diff appears (or a subtle/moderate "Last checked" footer is captured elsewhere), regenerate the baseline FROM THE PINNED PLAYWRIGHT DOCKER IMAGE with `--platform linux/amd64` (byte-comparison discipline — never from this arm64 host), else the CI image-diff gate fails.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/empty-state-reachability.spec.ts
git commit --no-verify -m "test(crew-page): e2e stale-sync fixture drives last_checked_at"
```

---

### Task 8: Close-out — UI dual-gate, full suite, audits

**Files:** none (verification).

- [ ] **Step 1: Impeccable v3 dual-gate on the UI diff**

Run `/impeccable critique` then `/impeccable audit` scoped to `components/shared/StaleFooter.tsx` + `components/admin/settings/DriveConnectionPanel.tsx` (copy/data-source change; confirm amber/red tiers still render under the re-based thresholds, "Last checked" copy reads correctly). P0/P1 → fix or `DEFERRED.md`. Record findings + dispositions.

- [ ] **Step 2: Full gates**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:audit:x4-no-global-cursor && pnpm test`
Expected: all green. (Full `pnpm test` catches source-scanning meta-tests that render tests miss.)

- [ ] **Step 3: Verify the real behavior end-to-end**

Confirm on the running app (or the validation env after deploy) that an idle-healthy show reads "Healthy" / "Last checked …" not "needs attention". Note the observed result.

- [ ] **Step 4: Commit any close-out fixes**

```bash
git add -A && git commit --no-verify -m "chore(sync): last_checked_at close-out — impeccable dispositions + full-suite green"
```

---

## Self-review notes

- **Spec coverage:** §3 Task 1; §4 Tasks 2-3; §5.1 Task 4; §5.2/5.3 Task 5; §5.5 (admin per-show LEAVE) — no task, correct; §6 Task 6; §9 tests folded into Tasks 2-5 + e2e Task 7; §10 Task 8.
- **Advisory note carried:** existing unit tests seeding `last_synced_at` are re-seeded to `last_checked_at` in Tasks 4-5; the e2e stale-sync fixture is migrated in Task 7 (e2e is excluded from `pnpm test`, so it gets its own task, not folded into the Task 8 suite).
- **Type consistency:** `lastCheckedAt` used uniformly across StaleFooter/Footer/_CrewShell/getShowForViewer; `readMaxLastCheckedAt` renamed at def + call site.
