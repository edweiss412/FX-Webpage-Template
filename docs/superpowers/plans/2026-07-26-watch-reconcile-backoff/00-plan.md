# Watch Reconcile Backoff v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `BL-WATCH-RECONCILE-BACKOFF`: 15-minute watch cadence, `drive_watch_reconcile_state` table, exponential backoff on reconcile's single retry surface, duration-based escalation, and tiered surfacing.

**Architecture:** Spec is canonical: `docs/superpowers/specs/observability/2026-07-26-watch-reconcile-backoff-v2-design.md` (APPROVED, Codex R6). Every §-reference below is that spec unless prefixed "master spec". State writes live inside `subscribeToWatchedFolder` behind a `recordAttempt` opt-in; the ladder gates only reconcile's `!live` branch; escalation keys on `raised_at` age.

**Tech Stack:** Next.js 16 route handlers, postgres.js `WatchTx` port, Supabase service-role reads, Vitest, pg SQL migrations.

## Global Constraints

- TDD per task; commit per task (`feat(sync)` / `test(sync)` / `feat(admin)` / `docs` scopes as noted). `--no-verify` allowed in the worktree.
- Constants by NAME everywhere: `SAMPLING_PERIOD_MS` 900_000, `BACKOFF_LADDER_MS` [900_000, 1_800_000, 3_600_000, 7_200_000], `BACKOFF_MAX_MS` equals the last ladder rung (implementation may use indexed access for TS narrowing; the Task 1 test asserts equality with `.at(-1)`), `ESCALATION_AFTER_MS` 10_800_000, `T_EXEC_BUDGET_MS` stays 300_000 (§1.1a-11).
- Schedule literal `'7,22,37,52 * * * *'` (§2.1).
- No advisory locks (§1.1a-5). No new cron job or route (§1.1a-9). No em-dashes/straight-quote violations in user-visible copy (§3.7 strings are exact).
- Vitest placement (§6): `tests/drive/**`, `tests/cron/**` = PARALLEL DB-free; DB tests under `tests/db/**`; components `tests/components/**`; CLI `tests/observe/**`. New files match existing `testMatch` globs by directory (verify with `pnpm vitest list <file>` on first run of each new file).
- Post-commit emits only; secrets never logged; `redactWatchError` is the only path to `last_error_message`.

## Meta-test inventory (declared per writing-plans rule)

- **EXTENDS** `tests/db/postgrest-dml-lockdown.test.ts` — new `RPC_GATED_TABLES` row (Task 3).
- **EXTENDS** `tests/sync/_metaInfraContract.test.ts` — rows for the two `WatchTx` state-write methods + gate read (Task 4/5).
- **EXTENDS** `tests/admin/_metaInfraContract.test.ts` — row for `readWatchSurfaceState` (Task 8).
- **CREATES** CHECK↔array meta-test (tests/db/watchReconcileStateChecks.test.ts, Task 3) pinning both CHECKs against `ATTEMPT_OUTCOMES` / `WATCH_ERROR_CLASSES` with negative controls.
- **CREATES** structural source pins: reconcile call-site `recordAttempt: true`; refresh default binding WITHOUT `recordAttempt` (Task 5).
- Advisory-lock topology: N/A — zero holders on watch surfaces (§1.1a-5), none added.
- Layout-dimensions Playwright task: N/A per spec Dimensional Invariants (no fixed-dimension parent); the one layout contract (`w-full` in the bell flex-wrap row) is asserted in Task 9's component test via class list, and visually via the impeccable gate (Task 13).
- Transition-audit: spec Transition Inventory declares every pair instant/server-rendered; Task 9 includes an audit step asserting the new line introduces no `AnimatePresence`/`motion.` wrapper and no client timer.

## Reconciliation sweeps (authored AND run at plan time)

The cadence-copy sweep was run at spec time with per-hit dispositions (§3.7 table — grep command inline there). Task 12 executes those dispositions verbatim and re-runs the grep expecting zero undispositioned watch-relevant hits.

---

### Task 1: Ladder + escalation constants, runtime arrays, timing-invariant tests

**Files:**
- Modify: `lib/drive/watchErrors.ts` (add `BACKOFF_LADDER_MS`, `BACKOFF_MAX_MS`, `ESCALATION_AFTER_MS`, `ATTEMPT_OUTCOMES`; refactor `WatchErrorClass` to derive from new `WATCH_ERROR_CLASSES`; do NOT touch `ESCALATION_THRESHOLD` yet — Task 6 deletes it)
- Test: tests/drive/watchBackoffConstants.test.ts (new)

**Interfaces:**
- Produces: `export const BACKOFF_LADDER_MS: readonly [number, number, number, number]`; `export const BACKOFF_MAX_MS: number`; `export const ESCALATION_AFTER_MS: number`; `export const WATCH_ERROR_CLASSES = ["config", "drive_api", "db"] as const`; `export type WatchErrorClass = (typeof WATCH_ERROR_CLASSES)[number]` (structurally identical to today's union — zero consumer edits); `export const ATTEMPT_OUTCOMES = ["failed", "succeeded"] as const`; `export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number]`.

- [ ] **Step 1: Write the failing test** — tests/drive/watchBackoffConstants.test.ts:

```ts
import { describe, expect, it } from "vitest";
import {
  ATTEMPT_OUTCOMES,
  BACKOFF_LADDER_MS,
  BACKOFF_MAX_MS,
  ESCALATION_AFTER_MS,
  RENEWAL_LIFE_FRACTION,
  RENEWAL_MIN_LEAD_MS,
  SAMPLING_PERIOD_MS,
  T_EXEC_BUDGET_MS,
  WATCH_ERROR_CLASSES,
} from "@/lib/drive/watchErrors";

// Independent literal expectation table (spec §6 class 1): human units,
// converted here - NEVER derived from BACKOFF_LADDER_MS itself.
const LADDER_EXPECTATION: ReadonlyArray<readonly [number, string]> = [
  [1, "15m"], [2, "30m"], [3, "1h"], [4, "2h"], [5, "2h"], [6, "2h"],
];
const toMs = (h: string) =>
  h.endsWith("h") ? Number(h.slice(0, -1)) * 3_600_000 : Number(h.slice(0, -1)) * 60_000;
const waitFor = (n: number) => BACKOFF_LADDER_MS[Math.min(n, BACKOFF_LADDER_MS.length) - 1];

describe("backoff constants (spec §2.1)", () => {
  it("ladder matches the independent literal table", () => {
    for (const [n, human] of LADDER_EXPECTATION) expect(waitFor(n), `rung ${n}`).toBe(toMs(human));
  });
  it("BACKOFF_MAX_MS is definitionally the last rung", () => {
    expect(BACKOFF_MAX_MS).toBe(BACKOFF_LADDER_MS.at(-1));
  });
  it("escalation window is 3h", () => {
    expect(ESCALATION_AFTER_MS).toBe(10_800_000);
  });
  it("runtime arrays carry the exact CHECK value sets", () => {
    expect([...WATCH_ERROR_CLASSES].sort()).toEqual(["config", "db", "drive_api"]);
    expect([...ATTEMPT_OUTCOMES].sort()).toEqual(["failed", "succeeded"]);
  });
});

describe("I1 phase sweep (spec §2.1a) - simulated tick series, not the formula", () => {
  // L(G) mirrors the SHIPPED predicate shape (lib/drive/watch.ts:362-365).
  const L = (g: number) => Math.max(RENEWAL_MIN_LEAD_MS, g * (1 - RENEWAL_LIFE_FRACTION));
  const P = SAMPLING_PERIOD_MS;
  const T = T_EXEC_BUDGET_MS;
  const GRANTS = [P - 1, P, P + T, P + T + 1, 3_600_000, 21_600_000, 86_400_000];

  it.each(GRANTS.map((g) => [g] as const))("grant %d ms", (G) => {
    // Ticks at every offset step across one full period; a channel activated at
    // offset o is examined at ticks o', o'+P, … where o' is the first tick >= o,
    // and "examined-and-due" means remaining life <= L(G) at a tick that lands
    // at most T after its scheduled time.
    const offsets = new Set<number>([0, 1, P - 1, P - T, P - T - 1, P - T + 1]);
    for (let o = 0; o < P; o += 60_000) offsets.add(o);
    for (const offset of offsets) {
      let examinedDueBeforeExpiry = false;
      for (let tick = offset === 0 ? 0 : P - offset; tick <= G + P; tick += P) {
        const at = tick + T; // worst-case execution lag
        if (at >= G) break;
        if (G - at <= L(G)) { examinedDueBeforeExpiry = true; break; }
      }
      if (G > P + T) {
        expect(examinedDueBeforeExpiry, `G=${G} offset=${offset}`).toBe(true);
      }
      // G <= P + T: anomalous band - no assertion; GRANT_TOO_SHORT posture is
      // pinned by the shipped tests/drive/watchExpiration.test.ts suite.
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/drive/watchBackoffConstants.test.ts`. Expected: FAIL (`BACKOFF_LADDER_MS` has no export).
- [ ] **Step 3: Implement in `lib/drive/watchErrors.ts`** — replace line 5 and add below the lease constants:

```ts
export const WATCH_ERROR_CLASSES = ["config", "drive_api", "db"] as const;
export type WatchErrorClass = (typeof WATCH_ERROR_CLASSES)[number];

// Reconnect ladder (spec §2.1/§3.3): Nth consecutive failure waits
// BACKOFF_LADDER_MS[min(N, len) - 1]; the final rung repeats indefinitely.
export const BACKOFF_LADDER_MS = [900_000, 1_800_000, 3_600_000, 7_200_000] as const;
// Literal tuple index (not computed) so noUncheckedIndexedAccess yields `number`,
// not `number | undefined` (plan review r4 finding 1). The Task 1 test asserts
// equality with .at(-1) so a ladder-length change cannot silently desync this.
export const BACKOFF_MAX_MS: number = BACKOFF_LADDER_MS[3];

// Escalate once an unresolved WATCH_CHANNEL_ORPHANED has persisted this long.
// Duration replaces the retired count-based trigger (deleted in the escalation task).
export const ESCALATION_AFTER_MS = 10_800_000;

// The only two values a completed subscribe attempt can persist (spec §3.2) -
// deliberately narrower than ReconcileOutcome.
export const ATTEMPT_OUTCOMES = ["failed", "succeeded"] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];
```

- [ ] **Step 4: Run tests** — same command, PASS; then `pnpm vitest run tests/drive` (whole dir green — the `WatchErrorClass` refactor is type-only) and `pnpm typecheck` if the repo exposes it, else `pnpm tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(sync): add backoff ladder, escalation-window, and attempt-outcome constants`

### Task 2: 15-minute cadence cluster (migration + registry + tests, atomic)

**Files:**
- Create: supabase/migrations/20260727000001_reschedule_refresh_watch.sql
- Modify: `lib/drive/watchErrors.ts` (`SAMPLING_PERIOD_MS` 3_600_000 → 900_000, line ~68)
- Modify: `lib/cron/runSummary.ts:54-59` (`cadence: "every 15 min"`, `staleAfterMs: 45 * 60_000`)
- Modify: `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json:10` (schedule value only)
- Modify: `tests/cron/runSummary.test.ts` (CADENCE_MS `"refresh-watch": 900_000` + NEW exact-value assertions)
- Modify: `tests/cross-cutting/pg-cron-coverage.test.ts:68-71` (append migration path to `SCHEDULE_MIGRATION_PATHS`) AND `tests/cross-cutting/pg-cron-coverage.test.ts:273` (the exactly-nine `timeout_milliseconds := 300000` occurrence count across registered migrations becomes exactly TEN - the copied command body carries one more; plan review r1 finding 1)
- Modify: `tests/cron/samplingPeriodParity.test.ts` only if its pinned literals require it (read it first; §3.1 lists it as a fan-out surface)
- Modify: `tests/cron/refreshWatchRoute.test.ts:5`, `tests/cron/refreshWatchRoute.test.ts:80` (comment/message "hourly" → "every 15 minutes", §3.7 sweep)

**Interfaces:**
- Produces: `SAMPLING_PERIOD_MS === 900_000` (consumed by Task 1's sweep test at import time — that test stays green for both values by construction).

- [ ] **Step 1: Write the failing exact-value test** — append to `tests/cron/runSummary.test.ts` (inside the existing describe):

```ts
it("refresh-watch runs every 15 min with a 45-min staleness window (spec §3.1)", () => {
  const row = CRON_JOBS.find((j) => j.jobName === "refresh-watch");
  expect(row?.cadence).toBe("every 15 min");
  expect(row?.staleAfterMs).toBe(45 * 60_000);
});
```

(Use the file's existing import of the registry — it already iterates `CRON_JOBS`; match its actual identifier when editing.) Also flip `CADENCE_MS["refresh-watch"]` to `900_000`.

- [ ] **Step 2: Run** — `pnpm vitest run tests/cron/runSummary.test.ts`. Expected: FAIL on both (registry still hourly; staleAfterMs 3h fails the >=2× floor against 900_000? No — floor still passes; the exact-value test is the red signal).
- [ ] **Step 3: Implement** —
  - `lib/drive/watchErrors.ts`: `export const SAMPLING_PERIOD_MS = 900_000;` (comment unchanged).
  - `lib/cron/runSummary.ts` refresh-watch row: `cadence: "every 15 min"`, `staleAfterMs: 45 * 60_000` (copies the asset-recovery pattern, lines 68-73).
  - New migration (pattern: `supabase/migrations/20260527000003_schedule_cron_jobs.sql:106-112` — copy the `format($body$...)` command body VERBATIM from that file):

```sql
-- Reschedule fxav_cron_refresh_watch from hourly to a 15-minute cadence at a
-- 7-minute offset (spec 2026-07-26-watch-reconcile-backoff-v2 §2.1/§3.1).
-- Minutes 7/22/37/52 collide with none of the ten live schedules.
-- Plumbing mirrors supabase/migrations/20260527000003_schedule_cron_jobs.sql:43-58
-- (vercel_url GUC + prereq check; ONE format argument), NOT its global
-- fxav_cron_* unschedule loop (plan review r2 finding 1 / r3 finding 1).
do $$
declare
  vercel_url text := current_setting('app.fxav_vercel_url', true);
begin
  if vercel_url is null or vercel_url = '' then
    raise exception 'reschedule_refresh_watch: app.fxav_vercel_url GUC must be set (see 20260527000003).';
  end if;
  if exists (select 1 from cron.job where jobname = 'fxav_cron_refresh_watch') then
    perform cron.unschedule('fxav_cron_refresh_watch');
  end if;
  perform cron.schedule('fxav_cron_refresh_watch', '7,22,37,52 * * * *', format($body$
    select net.http_get(
      url := %L,
      headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
      timeout_milliseconds := 300000
    );
  $body$, vercel_url || '/api/cron/refresh-watch'));
end $$;
```

  (Command body is byte-identical to `supabase/migrations/20260527000003_schedule_cron_jobs.sql:106-112` — only the schedule differs. Apply-twice safety: unschedule-if-exists.)
  - `pg-cron-jobs.json:10`: `"schedule": "7,22,37,52 * * * *"`.
  - `SCHEDULE_MIGRATION_PATHS` in `tests/cross-cutting/pg-cron-coverage.test.ts:68-71`: append "supabase/migrations/20260727000001_reschedule_refresh_watch.sql".
  - Read `tests/cron/samplingPeriodParity.test.ts`; update any pinned literal that names the old schedule/period so it derives or matches the new values.
- [ ] **Step 4: Apply migration locally + run** — `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260727000001_reschedule_refresh_watch.sql` then `pnpm vitest run tests/cron tests/drive tests/cross-cutting/pg-cron-coverage.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(sync): move fxav_cron_refresh_watch to 15-minute cadence`

### Task 3: State table + `watch_backoff_ms` migration, lockdown, meta-tests

**Files:**
- Create: supabase/migrations/20260727000000_drive_watch_reconcile_state.sql (DDL + function + lockdown EXACTLY as spec §3.2/§3.3 — copy the three SQL blocks verbatim: `create table` with the three CHECKs, `revoke/grant/enable row level security`, `create function public.watch_backoff_ms`)
- Modify: `tests/db/postgrest-dml-lockdown.test.ts` (new `RPC_GATED_TABLES` row)
- Test: tests/db/watchReconcileState.test.ts (new — class 4 + class 20)
- Test: tests/db/watchReconcileStateChecks.test.ts (new — CHECK↔array meta-test)
- Modify: `supabase/__generated__/schema-manifest.json` via `pnpm gen:schema-manifest`

**Interfaces:**
- Produces: table `public.drive_watch_reconcile_state` (columns per spec §3.2: `watched_folder_id` PK text, `consecutive_failures` int, `last_attempt_at`, `next_attempt_at`, `last_attempt_outcome`, `last_error_class`, `last_error_message`, `updated_at`); `public.watch_backoff_ms(integer) returns bigint`.

- [ ] **Step 1: Failing tests** — tests/db/watchReconcileState.test.ts:

```ts
// Serial DB project. Guard pattern copied from tests/db/watchRenewalDue.test.ts:14-29
// (plan review r3 finding 2 / r4 finding 2): guarded URL, {max:1, idle_timeout:1,
// prepare:false}, RUN-scoped cleanup in beforeAll AND afterAll, await sql.end()
// in afterAll. Same shape in EVERY new DB suite in this plan (Tasks 3, 4, 8).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { ATTEMPT_OUTCOMES, BACKOFF_LADDER_MS } from "@/lib/drive/watchErrors";
import { assertLocalDbUrl } from "./_localDbUrl";

const databaseUrl = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
const sql = postgres(databaseUrl, { max: 1, idle_timeout: 1, prepare: false });

const RUN = `plan-t3-${process.pid}-${Date.now()}`;
const FOLDER = `${RUN}-folder`;
const cleanup = () => sql`delete from drive_watch_reconcile_state where watched_folder_id like ${RUN + "%"}`;

describe("drive_watch_reconcile_state (spec §3.2, §6 class 4)", () => {
  beforeAll(async () => { await cleanup(); });
  afterAll(async () => { await cleanup(); await sql.end(); });
  afterAll(async () => { await cleanup(); await sql.end(); });

  it("rejects a ReconcileOutcome value in last_attempt_outcome - the narrowing pin", async () => {
    await expect(
      sql`insert into drive_watch_reconcile_state (watched_folder_id, last_attempt_outcome)
          values (${FOLDER + "-chk"}, 'still_orphaned')`,
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("rejects out-of-union error class and negative failures", async () => {
    await expect(
      sql`insert into drive_watch_reconcile_state (watched_folder_id, last_error_class)
          values (${FOLDER + "-ec"}, 'network')`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`insert into drive_watch_reconcile_state (watched_folder_id, consecutive_failures)
          values (${FOLDER + "-neg"}, -1)`,
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("watch_backoff_ms matches the independent table incl. defensive floor (class 20)", async () => {
    const cases: Array<[number | null, number]> = [
      [0, 900_000], [1, 900_000], [2, 1_800_000], [3, 3_600_000],
      [4, 7_200_000], [5, 7_200_000], [8, 7_200_000], [null, 900_000],
    ];
    for (const [n, want] of cases) {
      const [row] = await sql`select public.watch_backoff_ms(${n}::int) as ms`;
      expect(Number(row!.ms), `n=${n}`).toBe(want);
    }
    // and TS-side parity with the constant
    expect(BACKOFF_LADDER_MS.at(-1)).toBe(7_200_000);
    expect(ATTEMPT_OUTCOMES).toContain("failed");
  });
});
```

  tests/db/watchReconcileStateChecks.test.ts (meta-test, DB-free file read — still under tests/db for pathing consistency with its subject):

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ATTEMPT_OUTCOMES, WATCH_ERROR_CLASSES } from "@/lib/drive/watchErrors";

const MIGRATION = "supabase/migrations/20260727000000_drive_watch_reconcile_state.sql";
const src = readFileSync(MIGRATION, "utf8");

function checkValues(constraint: string): string[] {
  const m = src.match(new RegExp(`${constraint}[\\s\\S]*?in \\(([^)]+)\\)`));
  if (!m) throw new Error(`constraint ${constraint} not found`);
  return m[1]!.split(",").map((s) => s.trim().replace(/'/g, "")).sort();
}

describe("CHECK <-> runtime array parity (spec §4.2)", () => {
  it("attempt-outcome CHECK equals ATTEMPT_OUTCOMES, both directions", () => {
    expect(checkValues("drive_watch_reconcile_state_attempt_outcome_check")).toEqual([...ATTEMPT_OUTCOMES].sort());
  });
  it("error-class CHECK equals WATCH_ERROR_CLASSES, both directions", () => {
    expect(checkValues("drive_watch_reconcile_state_error_class_check")).toEqual([...WATCH_ERROR_CLASSES].sort());
  });
  it("negative control: a perturbed value list fails both ways", () => {
    const vals = checkValues("drive_watch_reconcile_state_attempt_outcome_check");
    expect([...vals, "extra"].sort()).not.toEqual([...ATTEMPT_OUTCOMES].sort());
    expect(vals.slice(1)).not.toEqual([...ATTEMPT_OUTCOMES].sort());
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/db/watchReconcileState.test.ts tests/db/watchReconcileStateChecks.test.ts` (serial project command per repo). Expected: FAIL (migration file absent / relation absent).
- [ ] **Step 3: Write the migration** — spec §3.2 DDL + lockdown + §3.3 `watch_backoff_ms`, copied verbatim. Apply locally (`psql ... -f`). Add the `RPC_GATED_TABLES` row copying the `app_events` row shape (`tests/db/postgrest-dml-lockdown.test.ts:213`) with every field the row type (`tests/db/postgrest-dml-lockdown.test.ts:138`) requires: table name, `selectAnon: false`, `selectAuthenticated: false`, a minimal valid `postBody` (`{ watched_folder_id: "probe" }`), `rowFilter: "?watched_folder_id=eq.probe"` (LEADING `?` - the harness concatenates it straight onto the table URL, `tests/db/postgrest-dml-lockdown.test.ts:653`), and `closed_at` as a FILE CITATION per the registry contract (`tests/db/postgrest-dml-lockdown.test.ts:116`) - cite the lockdown migration file path. Copy the `app_events` row and mirror its field shapes exactly.
- [ ] **Step 4: Run** — the two new files + `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts`; then `pnpm gen:schema-manifest`, commit the regenerated manifest, and run the manifest's own DB-free guard layer (`pnpm vitest run tests/db/validation-schema-parity.test.ts` — Layer 1 runs without the validation DB and trips if the manifest regen was skipped or stale; plan review r4 finding 4). Expected: all PASS, manifest diff shows the new table only.
- [ ] **Step 5: Commit** — `feat(db): drive_watch_reconcile_state table, watch_backoff_ms, full lockdown`

### Task 4: State writes inside `subscribeToWatchedFolder` (`recordAttempt` opt-in)

**Files:**
- Modify: `lib/drive/watch.ts` — `WatchTx` interface (+2 methods), `PostgresWatchTx` (+2 impls with spec §3.3a SQL verbatim), `SubscribeResult` widening, `SubscribeDeps.recordAttempt`, write calls at the three §3.3a sites
- Test: extend `tests/drive/watch.test.ts` (16b/16c cells) and tests/db/watchReconcileStateWrites.test.ts (new — 16d)
- Modify: `tests/drive/watchExpiration.test.ts` (exact-assertion dispositions below)

**Exact-assertion dispositions (plan review r1 finding 4 / r2 finding 3 — the widening breaks ten exact-result sites; each becomes `toMatchObject` on the shipped fields OR gains the new fields, in THIS task's commit):** `tests/drive/watch.test.ts:384`, `tests/drive/watch.test.ts:422`, `tests/drive/watch.test.ts:495`, `tests/drive/watch.test.ts:542`, `tests/drive/watch.test.ts:1549`, `tests/drive/watch.test.ts:1632`; `tests/drive/watchExpiration.test.ts:121`, `tests/drive/watchExpiration.test.ts:316`, `tests/drive/watchExpiration.test.ts:342`, `tests/drive/watchExpiration.test.ts:373`. After widening, re-grep `toEqual({ outcome` across BOTH files and disposition any residue.

**Compile-fallout producer sites (plan review r3 finding 3 - fixture literals that CONSTRUCT `SubscribeResult` values and miss the new required fields; each gains `attempt: null` plus, on orphaned literals, `errorClass`/`errorMessage`):** `tests/db/watchRenewalDue.test.ts:60`, `tests/db/watchRenewalDue.test.ts:78`; `tests/drive/watch.test.ts:590`, `tests/drive/watch.test.ts:653`, `tests/drive/watch.test.ts:685`, `tests/drive/watch.test.ts:717`, `tests/drive/watch.test.ts:1496`, `tests/drive/watch.test.ts:1528`, `tests/drive/watch.test.ts:1739`, `tests/drive/watch.test.ts:2108`, `tests/drive/watch.test.ts:2132`, `tests/drive/watch.test.ts:2154`, `tests/drive/watch.test.ts:2263`; AND the central producer `tests/drive/watch.test.ts:321` (`reconcileDeps`' default active result — plan review r4 finding 3). After the edits run `pnpm tsc --noEmit` and disposition every remaining error mentioning `SubscribeResult`.

**Interfaces:**
- Produces:

```ts
// WatchTx additions - ALL THREE port methods land in Task 4 so the port layer
// ships together and the Task 4 DB shape pins can run (plan review r3 finding 4);
// Task 5 only WIRES readReconcileGate into reconcile.
recordAttemptFailure(folderId: string, errorClass: WatchErrorClass, errorMessage: string):
  Promise<{ consecutiveFailures: number; nextAttemptAt: string }>;
recordAttemptSuccess(folderId: string):
  Promise<{ consecutiveFailures: number; nextAttemptAt: string }>;
readReconcileGate(folderId: string): Promise<
  { consecutiveFailures: number; nextAttemptAt: string; waiting: boolean } | null>;
// SQL: select consecutive_failures, next_attempt_at, next_attempt_at > now() as waiting
//        from drive_watch_reconcile_state where watched_folder_id = $1

export type SubscribeAttempt = { consecutiveFailures: number; nextAttemptAt: string } | null;
export type SubscribeResult =
  | { outcome: "active"; channelId: string; attempt: SubscribeAttempt }
  | { outcome: "orphaned"; channelId: string; reason: SubscribeOrphanReason;
      errorClass: WatchErrorClass; errorMessage: string; attempt: SubscribeAttempt };
// SubscribeDeps gains: recordAttempt?: boolean  (default false)
```

- Consumes: Task 3's table + function.

- [ ] **Step 1: Failing unit tests (16b/16c)** — extend `tests/drive/watch.test.ts` near the existing subscribe suite; the principal fake `WatchTx` (top of file) gains ALL THREE new methods (`recordAttemptFailure`, `recordAttemptSuccess`, `readReconcileGate` returning `null` by default) so it keeps satisfying the widened `WatchTx` interface (plan review r4 finding 3), the write methods returning canned `{ consecutiveFailures, nextAttemptAt }` and recording calls:

```ts
// in the fake tx: 
recordAttemptFailure: vi.fn(async () => ({ consecutiveFailures: 1, nextAttemptAt: FUTURE_ISO })),
recordAttemptSuccess: vi.fn(async () => ({ consecutiveFailures: 0, nextAttemptAt: NOW_ISO })),

describe("write-iff-attempt inside subscribeToWatchedFolder (spec §3.3a, 16b/16c)", () => {
  it("records (A) BEFORE markOrphaned when watchFolder rejects, with recordAttempt: true", async () => {
    const order: string[] = [];
    tx.recordAttemptFailure.mockImplementation(async () => { order.push("A"); return { consecutiveFailures: 1, nextAttemptAt: FUTURE_ISO }; });
    tx.markOrphaned.mockImplementation(async () => { order.push("orphan"); });
    const res = await subscribeToWatchedFolder("f", { tx, recordAttempt: true,
      watchFolder: async () => { throw new Error("boom"); } });
    expect(res.outcome).toBe("orphaned");
    expect(res.attempt).toEqual({ consecutiveFailures: 1, nextAttemptAt: FUTURE_ISO });
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("orphan"));
  });
  it("records (B) on the success path", async () => { /* watchFolder resolves; expect recordAttemptSuccess called once, attempt fields returned */ });
  it("pre-boundary insertPending throw records NOTHING", async () => {
    tx.insertPending.mockRejectedValueOnce(new Error("db down"));
    await expect(subscribeToWatchedFolder("f", { tx, recordAttempt: true })).rejects.toThrow();
    expect(tx.recordAttemptFailure).not.toHaveBeenCalled();
    expect(tx.recordAttemptSuccess).not.toHaveBeenCalled();
  });
  it("default recordAttempt=false writes nothing on ANY arm", async () => {
    await subscribeToWatchedFolder("f", { tx, watchFolder: async () => { throw new Error("x"); } });
    expect(tx.recordAttemptFailure).not.toHaveBeenCalled();
  });
  it("failed (A) emits DRIVE_WATCH_STATE_WRITE_FAILED warn, attempt null, alert still raised (16c)", async () => {
    tx.recordAttemptFailure.mockRejectedValueOnce(new Error("write down"));
    const res = await subscribeToWatchedFolder("f", { tx, recordAttempt: true,
      watchFolder: async () => { throw new Error("boom"); } });
    expect(res.outcome).toBe("orphaned");
    expect(res.attempt).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("drive watch state write failed",
      expect.objectContaining({ code: "DRIVE_WATCH_STATE_WRITE_FAILED" }));
    expect(tx.markOrphaned).toHaveBeenCalled(); // alert path unaffected
  });
  it("finalization throw AFTER Drive failure leaves (A) recorded (16c)", async () => {
    tx.markOrphaned.mockRejectedValueOnce(new Error("orphan write down"));
    await expect(subscribeToWatchedFolder("f", { tx, recordAttempt: true,
      watchFolder: async () => { throw new Error("boom"); } })).rejects.toThrow();
    expect(tx.recordAttemptFailure).toHaveBeenCalledTimes(1);
  });
  it("alert-upsert throw AFTER Drive failure leaves (A) recorded (16c, second fault point)", async () => {
    tx.upsertAdminAlert.mockRejectedValueOnce(new Error("alert write down"));
    await expect(subscribeToWatchedFolder("f", { tx, recordAttempt: true,
      watchFolder: async () => { throw new Error("boom"); } })).rejects.toThrow();
    expect(tx.recordAttemptFailure).toHaveBeenCalledTimes(1);
  });
  it("persistent finalization fault across three cycles still records three attempts (16c)", async () => {
    tx.markOrphaned.mockRejectedValue(new Error("persistent"));
    for (let i = 0; i < 3; i++) {
      await subscribeToWatchedFolder("f", { tx, recordAttempt: true,
        watchFolder: async () => { throw new Error("boom"); } }).catch(() => {});
    }
    expect(tx.recordAttemptFailure).toHaveBeenCalledTimes(3);
  });
  it("activation-throw arm records exactly one (A) with recordAttempt: true (16b)", async () => {
    tx.activatePending.mockRejectedValueOnce(new Error("activate down"));
    const res = await subscribeToWatchedFolder("f", { tx, recordAttempt: true,
      watchFolder: async () => WATCH_OK });
    expect(res.outcome).toBe("orphaned");
    expect(tx.recordAttemptFailure).toHaveBeenCalledTimes(1);
  });
  it("success and activation-failure arms write NOTHING with default recordAttempt (16b)", async () => {
    await subscribeToWatchedFolder("f", { tx, watchFolder: async () => WATCH_OK });
    tx.activatePending.mockRejectedValueOnce(new Error("activate down"));
    await subscribeToWatchedFolder("f", { tx, watchFolder: async () => WATCH_OK });
    expect(tx.recordAttemptSuccess).not.toHaveBeenCalled();
    expect(tx.recordAttemptFailure).not.toHaveBeenCalled();
  });
  it("failed (B) on the success path emits the warn and returns attempt null (16b)", async () => {
    tx.recordAttemptSuccess.mockRejectedValueOnce(new Error("write down"));
    const res = await subscribeToWatchedFolder("f", { tx, recordAttempt: true,
      watchFolder: async () => WATCH_OK });
    expect(res.outcome).toBe("active");
    expect(res.attempt).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("drive watch state write failed",
      expect.objectContaining({ code: "DRIVE_WATCH_STATE_WRITE_FAILED", statement: "record_attempt_success" }));
  });
});
```

  (SHAPE GUIDE, not paste-ready (plan review r2 finding 13): the live harness is a `FakeWatchTx` CLASS with ordinary methods and the sanctioned `logRecords` sink - NOT vi.fn fields. Adapt each cell: override the class method (subclass or property assignment) instead of `.mockImplementation`/`.mockRejectedValue`; count invocations with a local counter in the override; assert warn emits against `logRecords` entries (`code: "DRIVE_WATCH_STATE_WRITE_FAILED"`) instead of a `warnSpy`. Read `tests/drive/watch.test.ts:1-120` for the harness before writing any cell; the method surface mirrors `WatchTx` at `lib/drive/watch.ts:60-111`.)
- [ ] **Step 2: Run to verify failure** — the new describe FAILS (`recordAttempt` unknown / methods missing).
- [ ] **Step 3: Implement** —
  - `WatchTx` + `PostgresWatchTx` methods with spec §3.3a statements (A)/(B) verbatim, wrapped `callWatchTx("drive_watch_reconcile_state.record_attempt", …)`.
  - `SubscribeResult`/`SubscribeDeps` widening per Interfaces (all `return` sites updated; `errorClass`/`errorMessage` are already computed at both catch sites `lib/drive/watch.ts:724`, `lib/drive/watch.ts:817` — attach them).
  - Write sites: helper `recordAttemptSafe(kind, …)` inside the module — calls the tx method, catches, emits the `DRIVE_WATCH_STATE_WRITE_FAILED` warn per spec §3.3a (fire-and-forget `.catch(() => {})` per the house pattern at `lib/drive/watch.ts:798-809`), returns `SubscribeAttempt`. Invoked: first line of the `watchFolder` catch (before `markWatchOrphanedWithTx`); first line of the activation catch; after activation commit on the success path. All three gated on `deps.recordAttempt === true`.
  - **Row-shape mapping (r1 finding 6 / r2 finding 8), explicit implementation step:** postgres.js returns snake_case columns with `timestamptz` as `Date`. BOTH `PostgresWatchTx` methods map: `{ consecutiveFailures: Number(row.consecutive_failures), nextAttemptAt: new Date(row.next_attempt_at as Date | string).toISOString() }`. The 16d DB tests pin the shape for BOTH methods (`failViaPort` AND `succeedViaPort`): `typeof r.nextAttemptAt === "string"`, `Number.isFinite(Date.parse(r.nextAttemptAt))`.
- [ ] **Step 4: Failing-then-passing DB test (16d)** — tests/db/watchReconcileStateWrites.test.ts: two concurrent `recordAttemptFailure` through real `PostgresWatchTx` → final `consecutive_failures === 2` and each `returning` distinct; first-failure insert → `1`; mixed-outcome interleaving — `recordAttemptSuccess` commits, then a delayed `recordAttemptFailure` → row reads `failed`/`1` (the §3.3a accepted race, pinned):

```ts
// TWO separate connections so the writers genuinely race on distinct sessions
// (plan review r1 finding 5 / r4 finding 2). Full scaffold, same guard as Task 3:
//   const databaseUrl = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL
//     ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres");
//   const sqlA = postgres(databaseUrl, { max: 1, idle_timeout: 1, prepare: false });
//   const sqlB = postgres(databaseUrl, { max: 1, idle_timeout: 1, prepare: false });
//   const RUN = `plan-t4-${process.pid}-${Date.now()}`; F/F2/F3c/F4/F5/F6 = `${RUN}-a`… etc.
//   beforeAll/afterAll: delete where watched_folder_id like RUN+'%'; afterAll also
//   awaits sqlA.end() AND sqlB.end().
it("two concurrent failures on separate sessions both count (16d)", async () => {
  await Promise.all([failVia(sqlA, F), failVia(sqlB, F)]);
  const [row] = await sqlA`select consecutive_failures from drive_watch_reconcile_state where watched_folder_id = ${F}`;
  expect(row!.consecutive_failures).toBe(2);
});
it("two SEQUENTIAL failures from a stale in-memory zero still reach 2 (class 4)", async () => {
  await failVia(sqlA, F4); await failVia(sqlA, F4); // no read-modify-write anywhere
  const [row] = await sqlA`select consecutive_failures from drive_watch_reconcile_state where watched_folder_id = ${F4}`;
  expect(row!.consecutive_failures).toBe(2);
});
it("(B) commits, then a delayed (A) lands failed/1 - the accepted bounded race end state (spec §3.3a/16d)", async () => {
  // The spec's 16d case IS this deterministic ordering ("(B) commits, then a
  // delayed (A)"). An in-flight variant that holds (A) uncommitted while awaiting
  // (B) is an application-level wait cycle on the row lock - it hangs the test,
  // not the system (plan review r2 finding 6) - so the ordering is pinned
  // deterministically on two separate sessions.
  await succeedVia(sqlB, F2);
  await failVia(sqlA, F2);
  const [row] = await sqlA`select consecutive_failures, last_attempt_outcome from drive_watch_reconcile_state where watched_folder_id = ${F2}`;
  expect(row).toMatchObject({ consecutive_failures: 1, last_attempt_outcome: "failed" });
});
it("three sequential failures persist consecutive_failures === 3 (16c persistence half)", async () => {
  await failVia(sqlA, F3c); await failVia(sqlA, F3c); await failVia(sqlA, F3c);
  const [row] = await sqlA`select consecutive_failures from drive_watch_reconcile_state where watched_folder_id = ${F3c}`;
  expect(row!.consecutive_failures).toBe(3);
  // pairs with the unit half: three subscribe cycles under a persistent
  // finalization fault call recordAttemptFailure three times (16c unit cell).
});
it("BOTH port methods return camelCase ISO strings (row-shape pin, r2 finding 8)", async () => {
  const rf = await failViaPort(F5); // real PostgresWatchTx.recordAttemptFailure
  expect(typeof rf.nextAttemptAt).toBe("string");
  expect(Number.isFinite(Date.parse(rf.nextAttemptAt))).toBe(true);
  expect(rf.consecutiveFailures).toBe(1);
  const rs = await succeedViaPort(F5); // real PostgresWatchTx.recordAttemptSuccess
  expect(typeof rs.nextAttemptAt).toBe("string");
  expect(rs.consecutiveFailures).toBe(0);
});
it("readReconcileGate returns waiting boolean + ISO string against the real DB", async () => {
  await failViaPort(F6);
  const gate = await gateViaPort(F6);
  expect(gate).toMatchObject({ consecutiveFailures: 1, waiting: true });
  expect(typeof gate!.nextAttemptAt).toBe("string");
});
```

- [ ] **Step 5: Registry rows FIRST, then run (plan review r3 finding 6)** — add `tests/sync/_metaInfraContract.test.ts` rows for all three port methods (pattern: existing `lib/drive/watch.ts` rows near `tests/sync/_metaInfraContract.test.ts:43-55`; contract text "state-write/gate-read faults surface as DriveWatchInfraError via callWatchTx; write faults swallowed at the subscribe layer into attempt:null + forensic warn"). Then `pnpm vitest run tests/drive/watch.test.ts tests/drive/watchExpiration.test.ts tests/db/watchRenewalDue.test.ts tests/db/watchReconcileState.test.ts tests/db/watchReconcileStateWrites.test.ts tests/sync/_metaInfraContract.test.ts` + `pnpm tsc --noEmit` (the two extra suites carry this task's fixture dispositions; plan review r4 finding 4). PASS.
- [ ] **Step 6: Commit** — `feat(sync): record reconnect attempts inside subscribeToWatchedFolder behind recordAttempt opt-in`

### Task 5: Reconcile backoff gate, `backoff_waiting`, route body, structural pins

**Files:**
- Modify: `lib/drive/watch.ts` — `WatchTx.readReconcileGate`, `ReconcileOutcome` + `ReconcileResult` widening, gate in the `!live` branch (`lib/drive/watch.ts:1334`), `recordAttempt: true` at the reconcile call site, escalation condition (`lib/drive/watch.ts:1372`) + `state_write` mapping
- Modify: `app/api/cron/refresh-watch/route.ts` — MANDATORY (plan review r2 finding 4): the live route manually constructs BOTH response branches (`app/api/cron/refresh-watch/route.ts:18` region); add `nextAttemptAt` and `consecutiveFailures` to both
**Exact-assertion dispositions (r2 finding 4):** `tests/drive/watch.test.ts:1023`, `tests/drive/watch.test.ts:1077`, `tests/drive/watch.test.ts:1097` gain the two new `ReconcileResult` fields (or become `toMatchObject`); re-grep `toEqual({ outcome` in the reconcile suite after widening.
- Test: extend `tests/drive/watch.test.ts` (16a matrix, class 6, class 7 additions), `tests/cron/refreshWatchRoute.test.ts` (class 10), new structural pin file tests/drive/watchRecordAttemptPins.test.ts

**Interfaces:**
- Produces:

```ts
// readReconcileGate and its registry row shipped in Task 4; this task ONLY wires
// it into reconcile's !live branch (DB clock domain per spec D8) - no new port
// method, no new registry row here (plan review r4 finding 3).
export type ReconcileOutcome = "healthy" | "recovered" | "still_orphaned"
  | "renewal_failing" | "vacuous" | "backoff_waiting" | "infra_error";
export type ReconcileResult = { outcome: ReconcileOutcome; sweptPending: number;
  escalated: boolean; faults: string[];
  nextAttemptAt: string | null; consecutiveFailures: number | null };
```

- [ ] **Step 1: Failing tests** — 16a three-input matrix + class 6 additions in `tests/drive/watch.test.ts` (reconcile suite, existing fixture style):

```ts
describe("backoff gate (spec §3.4, 16a)", () => {
  it("!live + waiting → backoff_waiting, zero subscribes, zero writes, escalation still runs", async () => {
    tx.readReconcileGate.mockResolvedValueOnce({ consecutiveFailures: 2, nextAttemptAt: FUTURE_ISO, waiting: true });
    const r = await reconcileWatchChannels(cleanRefresh, { tx, subscribeToWatchedFolder: subSpy, maybeEscalateWatchOrphaned: escSpy, ... });
    expect(r.outcome).toBe("backoff_waiting");
    expect(r.nextAttemptAt).toBe(FUTURE_ISO);
    expect(r.consecutiveFailures).toBe(2);
    expect(subSpy).not.toHaveBeenCalled();
    expect(escSpy).toHaveBeenCalled();
  });
  it("!live + not waiting → subscribe attempted", async () => { /* gate row waiting:false → subSpy called */ });
  it("live paths NEVER read the gate (I2 structural pin)", async () => {
    // live + clean → healthy ; live + renewalFailed → renewal_failing
    expect(tx.readReconcileGate).not.toHaveBeenCalled();
  });
  it("gate read fault → state_read fault, infra_error, no subscribe", async () => { ... });
  it("returned attempt:null on an attempt cycle → state_write fault, infra_error", async () => {
    subSpy.mockResolvedValueOnce({ outcome: "orphaned", channelId: "c", reason: "watch_create_failed",
      errorClass: "drive_api", errorMessage: "m", attempt: null });
    const r = await reconcileWatchChannels(cleanRefresh, deps);
    expect(r.faults).toContain("state_write");
    expect(r.outcome).toBe("infra_error");
  });
});
```

  Structural pins — tests/drive/watchRecordAttemptPins.test.ts:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const src = readFileSync("lib/drive/watch.ts", "utf8");

describe("recordAttempt call-site pins (spec §6 class 18/7)", () => {
  it("reconcile default binding opts IN", () => {
    const m = src.match(/deps\.subscribeToWatchedFolder \?\?[\s\S]{0,200}?recordAttempt: true/);
    expect(m, "reconcile call site must pass recordAttempt: true").toBeTruthy();
  });
  it("refresh default binding does NOT opt in (class 7 half b)", () => {
    const refresh = src.match(/const subscribe =[\s\S]{0,300}?;/)![0];
    expect(refresh).not.toContain("recordAttempt");
  });
});
```

  Behavioral-fake sweep (plan review r4 finding 3): the result-producing overrides at `tests/drive/watch.test.ts:1116`, `tests/drive/watch.test.ts:1137`, `tests/drive/watch.test.ts:1356`, `tests/drive/watch.test.ts:1403` gain the widened attempt/error shape (they bypass compile checks via `over: Record<string, unknown>`, so grep for them — tsc will not). Class 7 deps-spy half + class 17 loop extend the existing refresh/reconcile fault suites (every post-attempt fault name except `state_write` → `infra_error` AND write landed). Class 10: `tests/cron/refreshWatchRoute.test.ts` gains `backoff_waiting` → 200 and body carries `nextAttemptAt`/`consecutiveFailures` in BOTH route branches; `state_read`/`state_write` faults → 500 `outcome: "infra"`. The gate read's real-DB return shape (`waiting` boolean, ISO-string `nextAttemptAt`) is asserted in tests/db/watchReconcileStateWrites.test.ts alongside the port-shape pin.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** per Interfaces + spec §3.4 steps 2–5: gate consulted only inside `!live` before the subscribe; reconcile call becomes `(deps.subscribeToWatchedFolder ?? ((folderId: string) => subscribeToWatchedFolder(folderId, { recordAttempt: true })))(folder.folderId)`; escalation condition gains `|| outcome === "backoff_waiting"`; result carries `nextAttemptAt`/`consecutiveFailures` from `result.attempt` (attempt cycles) or the gate row (`backoff_waiting`), else null; `ReconcileDeps.subscribeToWatchedFolder` signature widens to return the widened `SubscribeResult` (its injected fakes updated).
- [ ] **Step 4: Run** — `pnpm vitest run tests/drive tests/cron tests/sync/_metaInfraContract.test.ts` + typecheck (the meta-test verifies this task's registry row for the gate wiring; plan review r3 finding 6). PASS.
- [ ] **Step 5: Commit** — `feat(sync): backoff-gate reconcile reconnects with backoff_waiting outcome`

### Task 6: Duration-based escalation

**Files:**
- Modify: `lib/drive/watchEscalation.ts` (`lib/drive/watchEscalation.ts:8` import → `ESCALATION_AFTER_MS`; `lib/drive/watchEscalation.ts:19-23` `WatchAlertRow` + `raised_at`; `lib/drive/watchEscalation.ts:32` SELECT + `raised_at`; `lib/drive/watchEscalation.ts:102` `due`)
- Modify: `lib/drive/watchErrors.ts` (DELETE `ESCALATION_THRESHOLD`)
- Test: extend `tests/drive/watchEscalation*.test.ts` (class 8); new scan in tests/drive/watchBackoffConstants.test.ts (class 9)

**Interfaces:**
- Consumes: `ESCALATION_AFTER_MS` (Task 1). Produces: `WatchAlertRow` gains `raised_at: string`; `EscalationDeps` gains `now?: () => Date` (default `() => new Date()`) - the deps type at `lib/drive/watchEscalation.ts:79` has no clock today (plan review r1 finding 10), and the class-8 ages need injection.

**Straggler dispositions (plan review r1 finding 9 - every remaining occurrence of the retired constant):**
- `tests/drive/watchErrors.test.ts:5` (import) and `tests/drive/watchErrors.test.ts:66` (assertion): replace with `ESCALATION_AFTER_MS === 10_800_000`.
- `tests/e2e/helpers/seedAlerts.ts:96`: comment reworded to "escalation window" phrasing without the identifier.
- `tests/drive/watchEscalation.test.ts:3`, `tests/drive/watchEscalation.test.ts:9`, `tests/drive/watchEscalation.test.ts:33`, `tests/drive/watchEscalation.test.ts:60` (plan review r2 finding 9): the import and every count-based fixture/assertion move to `ESCALATION_AFTER_MS`-derived ages in the same commit - the class-8 rewrite owns these lines.
- The class-9 scan builds the identifier by concatenation (`"ESCALATION_" + "THRESHOLD"`) in both its title-adjacent comment and grep argument, and excludes its own file: `grep -rl "ESCALATION_THRESHOLD" lib/ app/ tests/ --exclude=watchBackoffConstants.test.ts` composed from the concatenated parts - so the scan cannot find itself.

- [ ] **Step 1: Failing tests (class 8)** — in the escalation suite (fixtures gain `raised_at`):

```ts
it("fires at raised_at age >= ESCALATION_AFTER_MS even at occurrence_count 1", ...);
it("does NOT fire below the window even at occurrence_count 99 - the decoupling", ...);
it("config class fires at age 0", ...);
it("future raised_at (skew) does not fire", ...);
```

  Ages derived `ESCALATION_AFTER_MS ± 60_000` from the injected clock. Class 9 (anti-tautology on the retired constant), added to tests/drive/watchBackoffConstants.test.ts:

```ts
it("the retired count-threshold identifier appears nowhere (spec §2.1, class 9)", () => {
  const { execSync } = require("node:child_process");
  const retired = "ESCALATION_" + "THRESHOLD"; // concatenated so this file cannot match
  const out = execSync(
    `grep -rl "${retired}" lib/ app/ tests/ --exclude=watchBackoffConstants.test.ts || true`,
  ).toString().trim();
  expect(out).toBe("");
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — `due = now().getTime() - Date.parse(alert.raised_at) >= ESCALATION_AFTER_MS || errorClass === "config"`; SELECT + row type + fixtures; delete the constant + its import. The guard-read/recheck/guard-write/send ordering (`lib/drive/watchEscalation.ts:105-169`) is untouched — if any ordering assertion needs a rewrite beyond adding `raised_at` to fixtures, STOP: that is spec §3.5's leak signal.
- [ ] **Step 4: Run** — `pnpm vitest run tests/drive` + typecheck. PASS (incl. email-copy suites — strings change in Task 12, so do NOT touch copy here).
- [ ] **Step 5: Commit** — `feat(sync): escalate WATCH_CHANNEL_ORPHANED on 3h duration, retire count threshold`

### Task 7: Retry action opt-in + module-mock pin

**Files:**
- Modify: `app/admin/actions.ts:326` — `subscribeToWatchedFolder(folder.folderId, { recordAttempt: true })`
- Test: the actions suite covering retry (locate: `grep -rln "retryWatch\|subscribeToWatchedFolder" tests/admin/`) gains the vi.mock pin

- [ ] **Step 1: Failing test** — in the retry action suite (which already mocks `lib/drive/watch` per the actions-test pattern):

```ts
it("passes recordAttempt: true to the shared subscribe (spec §3.3a pin)", async () => {
  await retryWatchAction(...);
  expect(subscribeMock).toHaveBeenCalledWith(FOLDER_ID, expect.objectContaining({ recordAttempt: true }));
});
```

- [ ] **Step 2: Run — FAIL.** **Step 3:** one-line action edit PLUS update the existing one-argument call assertion at `tests/admin/retryWatchAction.test.ts:126` to expect `(FOLDER_ID, { recordAttempt: true })` (plan review r1 finding 11 — it becomes the pin rather than a casualty). **Step 4: Run `pnpm vitest run tests/admin/retryWatchAction.test.ts` + `pnpm tsc --noEmit` — PASS** (other retry tests inspect `outcome` only and stay green). **Step 5: Commit** — `feat(admin): retry action opts into attempt recording`

### Task 8: `readWatchSurfaceState` + both loaders

**Files:**
- Create: lib/admin/watchSurfaceState.ts
- Modify: `lib/admin/bellFeed.ts` (BellEntry + loader mapping). The Settings PAGE read moves to Task 10 with the panel prop (plan review r3 finding 5 - the page cannot pass a prop the component does not yet accept)
- Modify: `tests/admin/_metaInfraContract.test.ts` (+1 row)
- Test: tests/admin/watchSurfaceState.test.ts (new), extend the bellFeed suite (class 18 loader pins; the settings-page loader test lives in Task 10 with the page edit)

**Interfaces:**
- Produces:

```ts
export type WatchSurfaceState = {
  nextAttemptAt: string | null;
  consecutiveFailures: number;
  lastAttemptOutcome: "failed" | "succeeded" | null;
};
export async function readWatchSurfaceState(folderId: string):
  Promise<WatchSurfaceState | null | { kind: "infra_error" }>;
// BellEntry gains: watchState?: WatchSurfaceState | null
// (DriveConnectionPanel's matching prop lands in Task 10 with the page read)
```

- [ ] **Step 1: Failing tests** — helper: returned `{error}` → `{kind:"infra_error"}`; thrown query → same; client-construction throw → same; zero rows → `null`; row → mapped camelCase. Loaders (class 18, BOTH directions - plan review r1 finding 12): bellFeed with helper faulting → `watchState: null` on the watch entry, feed intact; bellFeed with helper returning a state row → the watch entry's `watchState` carries those exact values (assert against the fixture, not a snapshot); AND `getActiveWatchedFolderId()` returning its typed infra result → feed still renders, `watchState: null`, helper NOT called (plan review r2 finding 14 - the folder read is its own boundary and must not fail the feed); AND every NON-watch entry carries `watchState: null` explicitly - asserted `toBeNull()`, not `toBeUndefined()` (spec §3.6; plan review r3 finding 9 - the loader sets the field, it does not leave it absent). Follow the existing bellFeed suite's mock harness (`tests/admin/bellFeed.test.ts`). Plus a real-DB helper integration test, tests/db/watchSurfaceStateIntegration.test.ts (new): seed a real `drive_watch_reconcile_state` row (full Task-3 scaffold shape: `assertLocalDbUrl` around `LOCAL_TEST_DATABASE_URL ?? loopback`, `{max:1, idle_timeout:1, prepare:false}`, RUN-scoped fixtures `plan-t8-${process.pid}-${Date.now()}`, cleanup in beforeAll+afterAll, `await sql.end()` in afterAll), and BEFORE calling the helper assert the ambient `SUPABASE_URL` hostname is loopback — the service-role client reads the ambient env (`lib/supabase/server.ts:79`), and seeding local while reading a remote project is exactly the split this guard prevents (plan review r3 finding 2); then call the REAL `readWatchSurfaceState`, assert the mapped camelCase values and ISO-string `nextAttemptAt` round-trip.
- [ ] **Step 2: FAIL.** **Step 3: Implement** — service-role client per the bellFeed pattern; single `.select("next_attempt_at, consecutive_failures, last_attempt_outcome").eq("watched_folder_id", folderId).maybeSingle()`; loader mapping with the inline render-boundary comment (spec §3.6); bell folder id from `getActiveWatchedFolderId()` (`lib/appSettings/getWatchedFolderId.ts:76` shape). Registry row in the admin meta-test (pattern `tests/admin/_metaInfraContract.test.ts:287-313`) stating both halves (typed infra result; deliberate hide-on-fault in consumers).
- [ ] **Step 4: Run `tests/admin` AND the new DB integration file + typecheck — PASS.** **Step 5: Commit** — `feat(admin): watch surface state read with typed infra fault, wired to the bell feed`

### Task 9: Bell line + developer telemetry link

**Files:**
- Modify: `components/admin/BellPanel.tsx` (line in `BellActionRow`; `viewerIsDeveloper` threading; link condition)
- Test: extend `tests/components/bellPanel.test.tsx` (or the suite covering `BellActionRow` — locate by `bell-action-cell` testid)

- [ ] **Step 1: Failing tests (classes 11, 19, per spec §3.6 tables)** — cases: `failed`+future → `Trying again at <formatted> · 2 reconnect attempts so far` (the formatter stays module-local per spec §3.6; the test derives the expected string by calling `toLocaleString` on the fixture timestamp with the SAME options literal the spec mandates — `{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }` — never a hardcoded string; plan review r2 finding 11 resolves the exported-vs-local contradiction in favor of module-local, and Task 10 duplicates the ~8-line local formatter rather than sharing); `failed`+past and `failed`+null → `Trying again shortly …`; `succeeded` / state null → line ABSENT; count 0 → clause omitted; count 1 → singular; error class/message strings NEVER present anywhere in the rendered tree (scan the whole container against the fixture's `errorMessage` literal); `w-full` present in the line's class list; developer link visible only when `viewerIsDeveloper` and href is the unfiltered telemetry route; transition-audit step: assert no `AnimatePresence`/`motion.` import added by the diff (source scan) and the `<time>` element carries `suppressHydrationWarning`.
- [ ] **Step 2: FAIL.** **Step 2a: Companion render sites (plan review r2 finding 12):** the threaded prop is OPTIONAL (`viewerIsDeveloper?: boolean`, default false), so the direct `BellActionRow` renders at `tests/components/a11y/newTabAnnouncementBehavior.test.tsx:181`, `tests/components/a11y/newTabAnnouncementBehavior.test.tsx:188`, `tests/e2e/_pusherRowsHarness.tsx:54`, and `tests/components/admin/bellActionRow.export.test.tsx:40`, `tests/components/admin/bellActionRow.export.test.tsx:69`, `tests/components/admin/bellActionRow.export.test.tsx:106` stay green unchanged - the Vitest suites verified by running them in Step 4; the Playwright harness site (`tests/e2e/_pusherRowsHarness.tsx:54`) is compile-checked by `pnpm tsc --noEmit` only, since the optional prop needs no edit there and e2e runs at close-out (plan review r3 finding 7). **Step 3: Implement** — `<p data-testid={...} className="w-full wrap-break-word text-sm text-text-subtle">` as last child of the `components/admin/BellPanel.tsx:303-306` flex row; module-local `formatNextAttempt` copying `formatStagedAt` (`components/admin/StagedReviewCard.tsx:104-113`) incl. NaN guard + `<time dateTime={iso} suppressHydrationWarning>`; thread `viewerIsDeveloper` into the action cell; render condition `entry.isHealth || (isWatch && viewerIsDeveloper)` with per-arm href (spec §3.6).
- [ ] **Step 4: Run `tests/components` + typecheck — PASS.** **Step 5: Commit** — `feat(admin): bell next-attempt line and developer telemetry link`

### Task 10: Settings line (panel prop + page read together)

**Files:**
- Modify: `components/admin/settings/DriveConnectionPanel.tsx` (optional `watchState?: WatchSurfaceState | null` prop; sentence after the re-run-setup row, column flow)
- Modify: `app/admin/settings/page.tsx` (service-role read via `readWatchSurfaceState`, folder id from the health union's `folderId` at `lib/admin/driveConnectionHealth.ts:43`/`lib/admin/driveConnectionHealth.ts:52`, helper not called when null; prop passed to the panel) — lands HERE, in the same commit as the prop, so every commit typechecks (plan review r3 finding 5)
- Test: `tests/components/admin/settings/DriveConnectionPanel.test.tsx` (the panel's actual component suite — r3 finding 5 corrected the earlier wrong suite name) + a settings-page loader test beside the existing page suites
- Modify: `tests/app` suites `settingsDataLoad`, `settingsHeader`, `settings-developer-visibility` — add `vi.mock("@/lib/admin/watchSurfaceState", ...)` returning `null` (or to their shared harness) so the page's new service-role read never fires in the DB-free project (plan review r2 finding 10)

- [ ] **Step 1: Failing tests (class 12)** — line present for `watch_inactive`/`watch_expired`/`not_configured`-with-folder when state `failed`; absent for `not_configured` without folder, for healthy/`sync_*`/`stale_*`/`infra_error` reasons, and when `watchState` null/absent; same copy branches as Task 9 (module-local formatter duplicated per r2 finding 11); page loader: read faulting → prop `null`; read succeeding → prop carries fixture values.
- [ ] **Step 2: FAIL.** **Step 3: Implement** per spec §3.6 placement (sibling `<p>` AFTER the flex row at `components/admin/settings/DriveConnectionPanel.tsx:234`, no width class), plus the page read and the three `tests/app` mocks. **Step 4: Run `tests/components/admin/settings` + `tests/app` + typecheck — PASS.** **Step 5: Commit** — `feat(admin): settings next-attempt line`

### Task 11: Observe CLI columns

**Files:**
- Modify: `lib/observe/query/watch.ts` (second query keyed on `watched_folder_id`; SELECT constant untouched by the secret pin, `lib/observe/query/watch.ts:1-5` and `lib/observe/query/watch.ts:9-10`)
- Modify: `lib/observe/query/types.ts:166` (`WatchRow` gains the new optional fields)
- Modify: `scripts/observe/format.ts:128` (`formatWatch` prints the new columns - plan review r1 finding 13: without this the default non-JSON output hides them)
- Test: extend `tests/observe/queryWatch.test.ts` AND `tests/observe/format.test.ts:258` fixtures

- [ ] **Step 1: Failing tests (class 13)** — query output includes `consecutive_failures`, `next_attempt_at`, `last_attempt_outcome`, `last_error_class`, sanitized `last_error_message` (through the `sanitizeIdentityString` treatment used at `lib/observe/query/failures.ts:55` and `lib/observe/query/failures.ts:61`); `formatWatch` renders the new columns for a fixture row AND omits gracefully when the state fields are absent; the structural secret-scan (`tests/observe/queryWatch.test.ts:61-63`) still green; the second query's returned-`{error}` and thrown paths each surface as the module's existing typed failure shape (add both cases). Invariant-9 disposition: follow whatever registry/inline convention `lib/observe/query/*.ts` already uses for its Supabase reads - if the module's queries carry no registry rows, add `// not-subject-to-meta: read-only observe CLI adapter; faults surface to the CLI as typed failures` at the new call site, matching invariant 9's inline-exemption arm.
- [ ] **Step 2: FAIL.** **Step 3: Implement (query + types + formatter).** **Step 4: Run `pnpm vitest run tests/observe` + `pnpm tsc --noEmit` — PASS** (plan review r4 finding 4). **Step 5: Commit** — `feat(observe): reconcile state columns on observe watch`

### Task 12: Copy lockstep + full cadence sweep execution

**Files:** every §3.7 disposition — `lib/messages/catalog.ts:364`, `lib/messages/catalog.ts:366`, `lib/messages/catalog.ts:369`; master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1321`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2817` (both `followUp` literal AND the "kept current by the hourly reconcile" clause), `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3336`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3844` residual "hourly"; `docs/superpowers/plans/coverage.md:143`; `docs/alerts/admin-alert-system-explainer.html:915`+`docs/alerts/admin-alert-system-explainer.html:924`; `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md:346`; `lib/drive/watchEscalation.ts:67` and `lib/drive/watchEscalation.ts:73`; `tests/messages/popoverContextCopy.test.ts:30`; comment-only hits (`lib/drive/watch.ts:956`, `app/admin/actions.ts:300`, `lib/drive/errorStatus.ts:7`, `tests/drive/watchImportGraph.test.ts:4`, `tests/drive/watchImportGraph.test.ts:70`, `tests/drive/watchExpiration.test.ts:4`, `tests/drive/watchExpiration.test.ts:242`, `tests/db/watchRenewalDue.test.ts:145`); regen `lib/messages/__generated__/spec-codes.ts`.

- [ ] **Step 1:** Update `tests/messages/popoverContextCopy.test.ts:30` to the spec §3.7 literal, and ADD a new escalation-email copy assertion — the current suite pins only the SUBJECT (`tests/drive/watchEscalation.test.ts:169`), so write a new test asserting the canonical replacement sentence appears in BOTH the text and HTML email bodies (plan review r3 finding 8). Run both — FAIL (red).
- [ ] **Step 2:** Apply every disposition with the exact §3.7 replacement strings (copy verbatim from the spec — they are canonical); `pnpm gen:spec-codes`; never run prettier on the master spec.
- [ ] **Step 3:** `pnpm test:audit:x1-catalog-parity` + `pnpm vitest run tests/messages tests/drive/watchEscalation* tests/cross-cutting/codes.test.ts` — PASS. Re-run the §3.7 grep — zero undispositioned watch-relevant hits (frozen dated artifacts remain, per disposition).
- [ ] **Step 4: Commit** — `docs: retire hourly-cadence copy across catalog, master spec, emails, and mirrors` (single commit: the three-way lockstep must land atomically, §3.7).

### Task 13: Impeccable dual-gate (invariant 8)

- [ ] **Pre-code mechanical gate check (retroactive verification):** grep the Tasks 7/9/10/12 diff for the mechanical invariants (em-dash ban and apostrophe literals in user-visible copy, canonical `text-sm`/`text-text-subtle` classes, no invented abbreviations) — the spec's §3.6/§3.7 strings were pre-checked at spec time; this step verifies the implementation matched them.
- [ ] Run `/impeccable critique` then `/impeccable audit` with the canonical v3 setup gates (context.mjs: PRODUCT.md + DESIGN.md → register read) on the FULL invariant-8 surface of this branch's diff: every touched file under `app/` except `app/api/**` — which includes `app/admin/actions.ts` (Tasks 7, 12) and `app/admin/settings/page.tsx` (Task 10) — plus every touched file under `components/` (Tasks 9, 10). Scoping the gate to Tasks 9+10 alone misses the actions/page edits (plan review r4 finding 5).
- [ ] Fix P0/P1 or defer via `DEFERRED.md` entry; re-run the failing gate after fixes until it passes. Commit fixes as `fix(admin): impeccable findings on watch backoff lines`.
- [ ] Record findings + dispositions in docs/superpowers/plans/2026-07-26-watch-reconcile-backoff/CLOSEOUT.md §12 (created here; also carries the class-21 probe transcript and the close-out suite list from Task 14). Commit as `docs: watch backoff closeout findings`.

### Task 14: Validation applies, live probe, full-suite close-out

- [ ] **Apply both migrations to validation** `vzakgrxqwcalbmagufjh` surgically (`supabase db query --linked` or psql), then `notify pgrst, 'reload schema';`.
- [ ] **Class 21 probe:** `pnpm observe watch --env validation` shows the state columns; `select public.watch_backoff_ms(3)` → `3600000`; `cron.job` row shows `'7,22,37,52 * * * *'`; and the renewal-window regression check (plan review r1 finding 14) - `pnpm observe watch --env validation --json`: newest channel's `expiresAt - createdAt` ≈ 24h and channel creation events do NOT recur every 15 minutes across the post-apply hour (no churn regression; ~1 renewal/day steady state per spec §3.1).
- [ ] **Full local suite** (`pnpm test` / the repo's CI-mirror commands) including: literal-nine cron suites, `postgrest-dml-lockdown`, `validation-schema-parity` both layers, both `_metaInfraContract` registries, `_metaMutationSurfaceObservability`, x1.
- [ ] Whole-diff Codex review (split tight-scope briefs per AGENTS.md: sync/db surface; admin/UI surface), iterate to APPROVE.
- [ ] Push, open PR (body per repo conventions) — the PR number now exists for the ledger edit.
- [ ] **Ledger graduation (plan review r4 finding 6 — the active queue rejects terminal statuses):** MOVE the `BL-WATCH-RECONCILE-BACKOFF` entry from `BACKLOG.md` to the archive file per the repo's graduation convention (see `tests/docs/_metaDeferralLedgerGraduation.test.ts` for the enforced shape), with the PR reference; note the deferred design stays DEFERRED as the analysis record. Run `pnpm vitest run tests/docs` + the docs meta-suites touched, then commit `docs: graduate BL-WATCH-RECONCILE-BACKOFF` and push the addendum commit.
- [ ] Real CI green on the final head, `gh pr merge --merge`, fast-forward main, verify `git rev-list --left-right --count main...origin/main` = `0  0`.

## Self-review (run at plan time)

1. **Spec coverage:** §2.1 constants → T1/T2; §3.1 cadence fan-out → T2; §3.2 table/lockdown/registry → T3; §3.3/§3.3a → T4; §3.4 → T5; §3.5 → T6; Retry → T7; §3.6 transport → T8, bell → T9, settings → T10, CLI → T11; §3.7 → T12; §4.3 validation → T14; §6 classes 1(T1), 4(T3), 6/7/10/16a/17(T5), 16b/16c(T4), 16d(T3/T4), 8/9(T6), 11/19(T9), 12(T10), 13(T11), 14(T12), 18(T7/T8 pins + T5 source pin), 20(T3), 21(T14), meta-suites(T14). No gaps found.
2. **Placeholder scan:** the two deliberate copy-from-source markers (migration body verbatim-copy in T2; suite-pattern adaptations) name their exact source lines — not TBDs.
3. **Type consistency:** `SubscribeAttempt`/`attempt` field names match across T4 (producer), T5 (reconcile consumer), T7 (action pin); `WatchSurfaceState.lastAttemptOutcome` matches T8→T9/T10.
