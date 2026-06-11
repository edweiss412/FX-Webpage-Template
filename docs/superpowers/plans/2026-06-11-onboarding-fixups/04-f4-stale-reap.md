# Phase 4 — F4 stale checkpoint / orphaned shadow reap

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or superpowers:executing-plans). TDD per task: failing test → minimal impl → passing test → commit. Conventional-commits per AGENTS.md invariant 6.

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-onboarding-fixups-design.md` §6 (F4), §3.3 (lock matrix row "F4 stale-session reap"), §9 (meta-test inventory), §10.6/§10.8 (testing spine).

**Depends on:**

- **F1 Phase B provenance column (HARD dependency — Phase 1/2 of this plan).** §6 keys first-seen interim-show deletion to a `created_show_id` column on `onboarding_scan_manifest`, written by F1's Phase B first-seen branch in the same per-row transaction as the show INSERT. **Verified absent today:** `supabase/__generated__/schema-manifest.json` lists `onboarding_scan_manifest` columns as `drive_file_id, folder_id, id, mime_type, name, observed_at, status, transitioned_at, wizard_session_id` — no `created_show_id`. Tasks 4.1 and 4.4 cannot go GREEN until the F1 phase has landed the column + writer. If executing this phase standalone for review, stub the column via the F1 migration first.
- **F2 migration (Phase 3)** carries the ONE-TIME purge of the current 18+18 synthetic validation rows (§6 second bullet, keyed to the exact 18 `wizard_session_id` values). That purge is Phase 3's deliverable, NOT this phase's — this phase ships the durable reap mechanism only.

**Scope (spec §6):** a NEW, strictly session-scoped stale-debris reap in `lib/onboarding/sessionLifecycle.ts` — NOT a loop over `cleanupAbandonedFinalize`. The existing cleanup is single-session by construction: it calls `purgeWizardRows` (`lib/onboarding/sessionLifecycle.ts:147-152`, invoked at `:425`), which deletes wizard-scoped `pending_syncs`/`pending_ingestions`/`deferred_ingestions` across ALL sessions and truncates `onboarding_scan_manifest` UNCONDITIONALLY, and it rotates `app_settings` (`:408-419`). The reap NEVER calls `purgeWizardRows` and NEVER touches `app_settings` beyond reads. Plus: the class-sweep of `cleanupAbandonedFinalize`'s `published = false` interim-show delete (`:379-391`) to `created_show_id` provenance.

**Meta-test inventory (declared per AGENTS.md writing-plans rule):**

- `tests/auth/advisoryLockRpcDeadlock.test.ts` — EXTEND (Task 4.3): pin the reap's lock topology (finalize-lock-then-show-locks, direct SQL, no `.rpc(`), mirroring the existing "abandoned finalize cleanup uses direct SQL locks" test at `:174`.
- `tests/auth/_metaInfraContract.test.ts` — **none applies:** the reap and its route use the `postgres.js` tx adapter (`OnboardingSessionTx`), not Supabase client calls; invariant 9's registry covers Supabase `{ data, error }` boundaries. Declared explicitly per the "None applies because <reason>" rule. Infra faults still surface typed: `defaultWithTx` wraps every failure in `OnboardingSessionInfraError` (`sessionLifecycle.ts:102-116`).
- `tests/messages/_metaAdminAlertCatalog.test.ts` — not touched (F4 writes `sync_log` rows like cleanup does at `:396-406`, no `admin_alerts`).
- `tests/db/postgrest-dml-lockdown.test.ts` — **EXTEND (Task 4.7; reverses this phase's earlier "not touched" call — R14 HIGH).** The earlier rationale ("all mutated tables already flow through server-side SQL") conflated *how our code mutates* with *what PostgREST exposes*: `onboarding_scan_manifest`, `wizard_finalize_checkpoints`, and `shows_pending_changes` still `GRANT insert, update, delete` to `anon, authenticated` (`supabase/migrations/20260501002000_rls_policies.sql:179/:203/:211`), so every guard this milestone builds (finalize/show lock ordering, 24h freshness, `created_show_id` provenance, F5 currency predicates) is bypassable by a direct `from('<table>')` write that never enters the guarded SQL paths. Task 4.7 ships the REVOKE migration + registry rows in the same commit per the lockdown discipline.

**Advisory-lock holder topology (spec §3.3, mandatory enumeration for this phase):**

| Hashkey | Existing holders | This phase |
|---|---|---|
| `finalize:<session_id>` | finalize routes via `pg_try_advisory_xact_lock` (pinned at `tests/auth/advisoryLockRpcDeadlock.test.ts:185-195`); `cleanupAbandonedFinalize` via `pg_advisory_xact_lock` (`sessionLifecycle.ts:329`) | reap acquires `pg_advisory_xact_lock` once per eligible session, FIRST, inside that session's **own dedicated transaction** — same layer as cleanup (JS-side SQL), single holder |
| `show:<drive_file_id>` | cron/manual/push (`withPostgresSyncPipelineLock`), finalize per-row txs, cleanup via `lockCleanupDriveFiles` (`sessionLifecycle.ts:154-184`, call at `:374`) | reap acquires per affected file in deterministic alphabetical order AFTER the session's finalize lock, before any DELETE — same layer, single holder. **Per-session tx boundary (R5 HIGH):** one outer transaction spanning all candidates would still HOLD session A's `show:` locks while acquiring session B's `finalize:` lock — a show→finalize ordering that deadlocks against a concurrent `cleanupAbandonedFinalize(B)` holding `finalize:B` and waiting on an overlapping `show:` lock (finalize→show, `:329`→`:374`). Each candidate session therefore runs in its OWN transaction (finalize lock → re-checks → drive-id collection → show locks → deletes → COMMIT), releasing ALL its advisory locks before the next session's finalize lock is requested. Candidate enumeration is a separate read-only step that takes no locks. **Advisory-before-row (R15 HIGH):** drive-id collection takes NO `FOR UPDATE` row locks — pending-ingestion actions hold the show ADVISORY lock first (`withPostgresSyncPipelineLock`, retry/route.ts:73) and row-lock second (`readLockedPendingIngestion`, retry/route.ts:114-128); a reap that row-locked before its advisory locks would deadlock AB-BA against a concurrent stale-tab retry. Collection is a plain SELECT; the union is RE-COLLECTED under the advisory locks (the re-check replaces the row-lock guarantee). |
| `app_settings` row lock | `cleanupAbandonedFinalize` `FOR UPDATE` (`:331-341`) — order is finalize-lock → app_settings → show locks | **reap takes NO `app_settings` row lock** (plain read only). Rationale: even with per-session transactions, holding it alongside show locks adds a third lock class for no benefit. A plain read is sufficient because rotation (`purgeAndRotateOnboardingSession` `:227`, cleanup `:408`) always mints a FRESH `randomUUID()` — a candidate stale session can never become active again, and rows of the new active session are never touched because every DELETE is `wizard_session_id`-scoped to the candidate. Document this in the reap's source comment. |

---

## Task 4.1 — Class-sweep: `cleanupAbandonedFinalize` first-seen delete moves from `published = false` proxy to `created_show_id` provenance

**Files:**
- `lib/onboarding/sessionLifecycle.ts` (modify the DELETE at `:379-391`)
- `tests/onboarding/cleanupProvenance.db.test.ts` (new, real-Postgres)
- `tests/onboarding/sessionLifecycle.test.ts` (update `FakeLifecycleTx.classify` for the new SQL shape)

**Failure mode caught (data loss):** a pre-existing unpublished/archived/held show (`published = false` for a legitimate reason) whose `drive_file_id` appears in a session's applied manifest rows — i.e., an existing show approved into a shadow — is DELETED by cleanup's current predicate (`delete from shows where published = false and drive_file_id in (manifest-applied)`, `sessionLifecycle.ts:379-391`). Spec §6 / R11 finding 1: `published = false` is a proxy that the existing-show shadow branch breaks (master spec line 2591 b: shadows are created "regardless of its published value"). Provenance (`created_show_id`) implements the master spec's stated intent ("removes the FIRST-SEEN interim rows", line 2591 a/d) correctly.

- [ ] **RED.** Add `tests/onboarding/cleanupProvenance.db.test.ts` (real-Postgres; mirror the top-level connection-probe + `test.skipIf(!dbUp)` harness of `tests/onboarding/onboardingApplyRevisionRaceDb.test.ts:38-72`). Two cases under one seeded stale session:

```ts
import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { cleanupAbandonedFinalize } from "@/lib/onboarding/sessionLifecycle";

const databaseUrl =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// Loopback guard (plan R13): assertLocalDbUrl(databaseUrl) — throws on non-loopback hosts before any
// connection. NEVER read TEST_DATABASE_URL here: it is the VALIDATION project; this suite seeds and
// DELETES app_settings/shows/manifest/pending rows and must be impossible to point at validation.

const SESSION = "f4f4f4f4-0001-4001-8001-f4f4f4f4f4f4";
const PRE_EXISTING_FILE = "f4-cleanup-preexisting-file";
const SESSION_CREATED_FILE = "f4-cleanup-created-file";

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(databaseUrl, { max: 1, idle_timeout: 2, connect_timeout: 3 });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  sql = null;
  dbUp = false;
}

async function seed() {
  const db = sql!;
  await cleanupFixture();
  // Stale active session (DB-clock based: cleanup requires pending_wizard_session_at > 24h old, sessionLifecycle.ts:337).
  await db.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid,
            pending_wizard_session_at = now() - interval '25 hours'
      where id = 'default'`,
    [SESSION],
  );
  // Pre-existing REAL show, legitimately unpublished, approved into this session (manifest applied, NO created_show_id provenance).
  const [preExisting] = (await db.unsafe(
    `insert into public.shows (drive_file_id, title, slug, published, client_label, template_version)
     values ($1, 'Pre-existing unpublished', 'f4-preexisting', false, 'Fixture Client', 'v2')
     returning id`,
    [PRE_EXISTING_FILE],
  )) as Array<{ id: string }>;
  // Session-CREATED interim show: manifest row records provenance.
  const [created] = (await db.unsafe(
    `insert into public.shows (drive_file_id, title, slug, published, client_label, template_version)
     values ($1, 'Wizard interim', 'f4-interim', false, 'Fixture Client', 'v2')
     returning id`,
    [SESSION_CREATED_FILE],
  )) as Array<{ id: string }>;
  await db.unsafe(
    `insert into public.onboarding_scan_manifest (wizard_session_id, drive_file_id, folder_id, name, mime_type, status, created_show_id)
     values ($1::uuid, $2, 'f4-folder', 'pre-existing', 'application/vnd.google-apps.spreadsheet', 'applied', null),
            ($1::uuid, $3, 'f4-folder', 'created', 'application/vnd.google-apps.spreadsheet', 'applied', $4::uuid)`,
    [SESSION, PRE_EXISTING_FILE, SESSION_CREATED_FILE, created.id],
  );
  return { preExistingId: preExisting.id, createdId: created.id };
}

async function cleanupFixture() {
  const db = sql!;
  await db.unsafe(`delete from public.onboarding_scan_manifest where wizard_session_id = $1::uuid`, [SESSION]);
  await db.unsafe(`delete from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`, [SESSION]);
  await db.unsafe(`delete from public.shows where drive_file_id in ($1, $2)`, [PRE_EXISTING_FILE, SESSION_CREATED_FILE]);
}

// Plan R18-1: capture the ORIGINAL app_settings row BEFORE mutating the singleton, and restore it
// in afterEach/afterAll even on failure — cleanupAbandonedFinalize ROTATES pending_wizard_session_id,
// so without restoration this suite leaks an unexpected active wizard session into later DB tests.
// const originalSettings = await db.unsafe(`select pending_wizard_session_id, pending_wizard_session_at from public.app_settings where id = 'default'`);
// ... afterAll: restore those exact values + assert the restore landed.
afterAll(async () => {
  if (sql) {
    await cleanupFixture().catch(() => {});
    await sql.end({ timeout: 5 });
  }
});

describe("cleanupAbandonedFinalize first-seen delete is provenance-keyed (F4 / R11-1)", () => {
  test.skipIf(!dbUp)(
    "a pre-existing published=false show approved into the session SURVIVES; the session-created interim row is deleted",
    async () => {
      const { preExistingId, createdId } = await seed();
      const result = await cleanupAbandonedFinalize(SESSION, {
        requireAdminIdentity: async () => ({ email: "admin@example.com" }),
      });
      expect(result.status).toBe("cleaned");
      const survivors = (await sql!.unsafe(
        `select id from public.shows where id in ($1::uuid, $2::uuid)`,
        [preExistingId, createdId],
      )) as Array<{ id: string }>;
      // Concrete failure mode: the current :379-391 predicate deletes BOTH rows
      // (both are published=false with manifest-applied drive_file_ids); this
      // assertion fails against it, passes once the delete is provenance-keyed.
      expect(survivors.map((row) => row.id)).toEqual([preExistingId]);
    },
  );
});
```

- [ ] **VERIFY (RED).** `pnpm vitest run tests/onboarding/cleanupProvenance.db.test.ts` → 1 failing test: `survivors` is `[]` because the proxy predicate deleted the pre-existing show. (Requires local Supabase up + the F1 `created_show_id` migration applied; if the column is missing the seed INSERT errors — confirm Phase 1/2 landed first.)
- [ ] **GREEN.** Replace the DELETE at `lib/onboarding/sessionLifecycle.ts:379-391` with the provenance form:

```ts
    await tx.query(
      `
        delete from public.shows s
         using public.onboarding_scan_manifest m
         where m.wizard_session_id = $1::uuid
           and m.created_show_id = s.id
           and s.published = false
      `,
      [sessionId],
    );
```

  Keep the `published = false` conjunct as a belt-and-suspenders guard (a session-created row that somehow got published must never be deleted by cleanup). Update `FakeLifecycleTx.classify` in `tests/onboarding/sessionLifecycle.test.ts` to recognize the new SQL shape (match on `using public.onboarding_scan_manifest` + `created_show_id`) so existing cleanup unit tests stay green.
- [ ] **VERIFY (GREEN).** `pnpm vitest run tests/onboarding/cleanupProvenance.db.test.ts tests/onboarding/sessionLifecycle.test.ts tests/onboarding/cleanupAbandonedFinalize.test.ts` → all pass.
- [ ] **Negative-regression check** (per feedback discipline): `git stash` the `sessionLifecycle.ts` hunk, re-run the db test, confirm it FAILS, `git stash pop`.
- [ ] **COMMIT.** `fix(onboarding): key cleanup first-seen show delete to created_show_id provenance, not published=false`

---

## Task 4.2 — Reap core: eligibility + strictly session-scoped deletes; never purge, never rotate

**Files:**
- `lib/onboarding/sessionLifecycle.ts` (new exported `reapStaleOnboardingSessions` + types)
- `tests/onboarding/reapStaleSessions.test.ts` (new)

**Failure mode caught:** (a) a reap implemented by looping `cleanupAbandonedFinalize` erases the ACTIVE session's staging via `purgeWizardRows`' cross-session deletes + unconditional manifest truncation (`sessionLifecycle.ts:147-152`) and rotates the operator's live session (`:408-419`); (b) a reap whose DELETEs are not `wizard_session_id`-scoped removes another session's rows; (c) sessions in terminal `final_cas_done` state or with no checkpoint at all are skipped, leaving exactly the F5 commit-window residue (a lone `deferred_ingestions` row) unsweepable; (d) a NEWLY superseded non-active session (rotated minutes ago, staging rows present, checkpoint `last_processed_at` NULL) is reaped immediately — "not active" + "no in-progress checkpoint in the last hour" alone do NOT make it ineligible, so its staging is deleted in violation of spec §6's fresh-session preservation guarantee (the data-loss class this phase exists to prevent).

**Freshness contract for non-active sessions (adversarial-review R1 HIGH fix).** "Not the active session" is NOT staleness — rotation makes a session non-active instantly. A candidate session is reap-eligible ONLY if its **most-recent activity timestamp** is older than **24 hours** (mirroring `cleanupAbandonedFinalize`'s `pending_wizard_session_at < now() - interval '24 hours'` convention, `sessionLifecycle.ts:337`), evaluated UNDER the `finalize:<session>` advisory lock BEFORE any show locks or deletes. The activity max is `GREATEST` across the per-session `max(...)` of (every column verified `timestamptz` against the live DDL in `supabase/migrations/20260501001000_internal_and_admin.sql` / sibling table files):

| Table | Activity columns |
|---|---|
| `wizard_finalize_checkpoints` | `last_processed_at` (nullable) |
| `shows_pending_changes` | `staged_at` |
| `pending_syncs` | `parsed_at`, `wizard_approved_at` (nullable) |
| `onboarding_scan_manifest` | `observed_at`, `transitioned_at` |
| `pending_ingestions` | `first_seen_at`, `last_attempt_at` |
| `deferred_ingestions` | `deferred_at` |

**All-NULL case, defined explicitly:** an activity max of NULL means the session has no timestamped rows anywhere — at most a checkpoint row with `last_processed_at IS NULL` and nothing else to preserve (`wizard_finalize_checkpoints` carries no other timestamp column: `batches_completed, id, last_processed_at, last_processed_drive_file_id, status, wizard_session_id`). Treat as **stale**: `coalesce(activity_max < now() - interval '24 hours', true)`. The existing 1-hour `in_progress` checkpoint guard stays as written (spec §6 cites it) but is subsumed by the 24-hour activity window — note the subsumption in the source comment.

- [ ] **RED.** Add `tests/onboarding/reapStaleSessions.test.ts` with a generic fake tx (operations log + in-memory tables, modeled on `FakeLifecycleTx` in `tests/onboarding/sessionLifecycle.test.ts`):

```ts
import { describe, expect, test } from "vitest";
import {
  reapStaleOnboardingSessions,
  type OnboardingSessionTx,
} from "@/lib/onboarding/sessionLifecycle";

const ACTIVE = "aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa";
const STALE = "bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb";
const TERMINAL = "cccccccc-0000-4000-8000-cccccccccccc";

type Row = Record<string, unknown>;

export class FakeReapTx implements OnboardingSessionTx {
  activeSession: string | null = ACTIVE;
  /** Sessions whose GREATEST activity timestamp is within 24h (freshness contract). */
  freshSessions = new Set<string>();
  tables: Record<string, Row[]> = {
    wizard_finalize_checkpoints: [],
    onboarding_scan_manifest: [],
    shows_pending_changes: [],
    pending_syncs: [],
    pending_ingestions: [],
    deferred_ingestions: [],
    shows: [],
    sync_log: [],
  };
  operations: string[] = [];

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const q = sql.replace(/\s+/g, " ").trim();
    if (/pg_advisory_xact_lock\(hashtext\('finalize:'/.test(q)) {
      this.operations.push(`lock-finalize:${String(params[0])}`);
      return { rows: [] as T[], rowCount: 0 };
    }
    if (/pg_advisory_xact_lock\(hashtext\('show:'/.test(q)) {
      this.operations.push(`lock-show:${String(params[0])}`);
      return { rows: [] as T[], rowCount: 0 };
    }
    if (/select pending_wizard_session_id from public\.app_settings/.test(q)) {
      this.operations.push("read-active-session");
      return { rows: [{ pending_wizard_session_id: this.activeSession }] as T[], rowCount: 1 };
    }
    if (/select coalesce\(.* < now\(\) - interval '24 hours', true\) as stale/.test(q) || /greatest\(/.test(q)) {
      this.operations.push(`activity-check:${String(params[0])}`);
      return {
        rows: [{ stale: !this.freshSessions.has(String(params[0])) }] as T[],
        rowCount: 1,
      };
    }
    if (/from public\.wizard_finalize_checkpoints where wizard_session_id = \$1::uuid and status = 'in_progress'/.test(q)) {
      this.operations.push(`recency-check:${String(params[0])}`);
      const rows = this.tables.wizard_finalize_checkpoints.filter(
        (r) => r.wizard_session_id === params[0] && r.status === "in_progress" && r.recent === true,
      );
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (/^select distinct wizard_session_id from \(/.test(q)) {
      this.operations.push("enumerate-candidates");
      const ids = new Set<string>();
      for (const name of [
        "wizard_finalize_checkpoints", "onboarding_scan_manifest", "shows_pending_changes",
        "pending_syncs", "pending_ingestions", "deferred_ingestions",
      ]) {
        for (const r of this.tables[name]!) {
          const sid = r.wizard_session_id as string | null;
          if (sid && sid !== this.activeSession) ids.add(sid);
        }
      }
      const rows = [...ids].sort().map((wizard_session_id) => ({ wizard_session_id }));
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (/select status from public\.wizard_finalize_checkpoints where wizard_session_id/.test(q)) {
      const rows = this.tables.wizard_finalize_checkpoints
        .filter((r) => r.wizard_session_id === params[0])
        .map((r) => ({ status: r.status }));
      return { rows: rows as T[], rowCount: rows.length };
    }
    const driveSelect = q.match(/select drive_file_id from public\.([a-z_]+) where wizard_session_id = \$1::uuid/);
    if (driveSelect) {
      this.operations.push(`collect:${driveSelect[1]}:${String(params[0])}`);
      const rows = this.tables[driveSelect[1]!]!
        .filter((r) => r.wizard_session_id === params[0])
        .map((r) => ({ drive_file_id: r.drive_file_id }));
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (/delete from public\.shows s using public\.onboarding_scan_manifest m/.test(q)) {
      this.operations.push(`delete-interim-shows:${String(params[0])}`);
      const created = new Set(
        this.tables.onboarding_scan_manifest
          .filter((r) => r.wizard_session_id === params[0] && r.created_show_id != null)
          .map((r) => r.created_show_id),
      );
      const before = this.tables.shows.length;
      this.tables.shows = this.tables.shows.filter(
        (r) => !(created.has(r.id) && r.published === false),
      );
      const count = before - this.tables.shows.length;
      // Mirror the adapter contract (sessionLifecycle.ts:93-99): rowCount derives from
      // `returning` rows — the R4 idempotency fix depends on real counts here.
      return { rows: Array.from({ length: count }, () => ({ deleted: 1 })) as T[], rowCount: count };
    }
    const scopedDelete = q.match(
      /^delete from public\.([a-z_]+) where wizard_session_id = \$1::uuid returning 1 as deleted$/,
    );
    if (scopedDelete) {
      this.operations.push(`delete:${scopedDelete[1]}:${String(params[0])}`);
      const before = this.tables[scopedDelete[1]!]!.length;
      this.tables[scopedDelete[1]!] = this.tables[scopedDelete[1]!]!.filter(
        (r) => r.wizard_session_id !== params[0],
      );
      const count = before - this.tables[scopedDelete[1]!]!.length;
      return { rows: Array.from({ length: count }, () => ({ deleted: 1 })) as T[], rowCount: count };
    }
    if (/insert into public\.sync_log/.test(q)) {
      this.operations.push(`sync-log:${String(params[0])}`); // params: [sessionId, adminEmail, deletedCount]
      this.tables.sync_log.push({ params: [...params] });
      return { rows: [] as T[], rowCount: 1 };
    }
    throw new Error(`FakeReapTx: unclassified SQL: ${q}`);
  }
}

function deps(tx: FakeReapTx) {
  let txCount = 0;
  return {
    // Each withTx call models ONE real transaction (R5: enumeration tx + one tx per
    // session). The marker lets tests assert the per-session tx boundary structurally.
    withTx: async <R>(fn: (t: OnboardingSessionTx) => Promise<R>) => {
      txCount += 1;
      tx.operations.push(`tx-begin:${txCount}`);
      const result = await fn(tx);
      tx.operations.push(`tx-commit:${txCount}`);
      return result;
    },
    requireAdminIdentity: async () => ({ email: "admin@example.com" }),
  };
}

function staleSessionFixture(tx: FakeReapTx) {
  tx.tables.wizard_finalize_checkpoints.push({ wizard_session_id: STALE, status: "in_progress", recent: false });
  tx.tables.onboarding_scan_manifest.push(
    { wizard_session_id: STALE, drive_file_id: "drive-m1", status: "applied", created_show_id: "show-1" },
    { wizard_session_id: ACTIVE, drive_file_id: "drive-active", status: "staged", created_show_id: null },
  );
  tx.tables.shows_pending_changes.push(
    { wizard_session_id: STALE, drive_file_id: "drive-s1" },
    { wizard_session_id: ACTIVE, drive_file_id: "drive-active" },
  );
  tx.tables.pending_syncs.push(
    { wizard_session_id: STALE, drive_file_id: "drive-p1" },
    { wizard_session_id: ACTIVE, drive_file_id: "drive-active" },
    { wizard_session_id: null, drive_file_id: "drive-live" },
  );
  tx.tables.pending_ingestions.push({ wizard_session_id: STALE, drive_file_id: "drive-i1" });
  tx.tables.deferred_ingestions.push(
    { wizard_session_id: STALE, drive_file_id: "drive-d1" },
    { wizard_session_id: null, drive_file_id: "drive-live" },
  );
  tx.tables.shows.push({ id: "show-1", drive_file_id: "drive-m1", published: false });
}

describe("reapStaleOnboardingSessions — session-scoped reap (F4)", () => {
  test("a stale in_progress session is fully reaped; the active session and live-partition rows are untouched", async () => {
    const tx = new FakeReapTx();
    staleSessionFixture(tx);
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([{ wizardSessionId: STALE, outcome: "reaped_full" }]);
    // Stale session debris fully removed (checkpoints + shadows + manifest + all three staging tables + interim show).
    for (const name of [
      "wizard_finalize_checkpoints", "shows_pending_changes", "onboarding_scan_manifest",
      "pending_syncs", "pending_ingestions", "deferred_ingestions",
    ]) {
      expect(
        tx.tables[name]!.filter((r) => r.wizard_session_id === STALE),
        `${name} must hold no rows for the reaped session`,
      ).toEqual([]);
    }
    expect(tx.tables.shows).toEqual([]); // session-created interim row deleted (provenance, Task 4.4 hardens)
    // Active-session rows and live-partition (wizard_session_id IS NULL) rows survive.
    expect(tx.tables.onboarding_scan_manifest.filter((r) => r.wizard_session_id === ACTIVE)).toHaveLength(1);
    expect(tx.tables.shows_pending_changes.filter((r) => r.wizard_session_id === ACTIVE)).toHaveLength(1);
    expect(tx.tables.pending_syncs.filter((r) => r.wizard_session_id === ACTIVE)).toHaveLength(1);
    expect(tx.tables.pending_syncs.filter((r) => r.wizard_session_id === null)).toHaveLength(1);
    expect(tx.tables.deferred_ingestions.filter((r) => r.wizard_session_id === null)).toHaveLength(1);
    // sync_log row written for the reaped session.
    expect(tx.operations).toContain(`sync-log:${STALE}`);
  });

  test("the reap NEVER issues purgeWizardRows-shaped statements or app_settings writes", async () => {
    const tx = new FakeReapTx();
    staleSessionFixture(tx);
    await reapStaleOnboardingSessions(deps(tx));
    // FakeReapTx throws on unclassified SQL, so a `delete ... where wizard_session_id is not null`
    // (purgeWizardRows shape, :148-151), a bare `delete from public.onboarding_scan_manifest`
    // (:150), or an `update public.app_settings` (:408-419) would have thrown above.
    // Belt-and-suspenders: source-level pin.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/onboarding/sessionLifecycle.ts", "utf8");
    const reapBody = source.slice(source.indexOf("export async function reapStaleOnboardingSessions"));
    expect(reapBody).not.toMatch(/purgeWizardRows\(/);
    expect(reapBody).not.toMatch(/update\s+public\.app_settings/i);
  });

  test("orphan rows of a final_cas_done session are reaped (staging tables only); checkpoint + shadows are preserved", async () => {
    const tx = new FakeReapTx();
    tx.tables.wizard_finalize_checkpoints.push({ wizard_session_id: TERMINAL, status: "final_cas_done", recent: false });
    tx.tables.deferred_ingestions.push({ wizard_session_id: TERMINAL, drive_file_id: "drive-t1" });
    tx.tables.shows_pending_changes.push({ wizard_session_id: TERMINAL, drive_file_id: "drive-t2" });
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([{ wizardSessionId: TERMINAL, outcome: "reaped_orphan_rows" }]);
    expect(tx.tables.deferred_ingestions).toEqual([]); // the F5 commit-window residue shape is sweepable
    // Terminal checkpoint row is the terminal record; CAS-failed shadows are operator-recovery surface (spec §3.2) — both preserved.
    expect(tx.tables.wizard_finalize_checkpoints).toHaveLength(1);
    expect(tx.tables.shows_pending_changes).toHaveLength(1);
  });

  test("a terminal session with ONLY preserved surfaces is NOT reaped: no result entry, no sync_log row", async () => {
    // Concrete failure mode (R4 HIGH): preserved checkpoint + shadows keep the session in the
    // candidate query forever; without the zero-delete guard every run returns it as
    // "reaped_orphan_rows" and writes a sync_log row — inflated success counts + log spam
    // while deleting nothing, on every reap, indefinitely.
    const tx = new FakeReapTx();
    tx.tables.wizard_finalize_checkpoints.push({ wizard_session_id: TERMINAL, status: "final_cas_done", recent: false });
    tx.tables.shows_pending_changes.push({ wizard_session_id: TERMINAL, drive_file_id: "drive-t2" });
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([]); // skipped_no_residue filtered from reaped output
    expect(tx.operations.filter((op) => op.startsWith("sync-log"))).toEqual([]);
    expect(tx.tables.wizard_finalize_checkpoints).toHaveLength(1);
    expect(tx.tables.shows_pending_changes).toHaveLength(1);
  });

  test("two-run idempotency: run 1 sweeps the terminal session's residue; run 2 reaps nothing and logs nothing", async () => {
    const tx = new FakeReapTx();
    tx.tables.wizard_finalize_checkpoints.push({ wizard_session_id: TERMINAL, status: "final_cas_done", recent: false });
    tx.tables.shows_pending_changes.push({ wizard_session_id: TERMINAL, drive_file_id: "drive-t2" });
    tx.tables.deferred_ingestions.push({ wizard_session_id: TERMINAL, drive_file_id: "drive-t1" });

    const run1 = await reapStaleOnboardingSessions(deps(tx));
    expect(run1.sessions).toEqual([{ wizardSessionId: TERMINAL, outcome: "reaped_orphan_rows" }]);
    expect(tx.tables.deferred_ingestions).toEqual([]);
    expect(tx.operations.filter((op) => op.startsWith("sync-log"))).toHaveLength(1);

    const run2 = await reapStaleOnboardingSessions(deps(tx));
    expect(run2.sessions).toEqual([]); // session still a candidate (preserved rows), but zero deletes → skipped
    expect(tx.operations.filter((op) => op.startsWith("sync-log"))).toHaveLength(1); // STILL exactly one
    expect(tx.tables.wizard_finalize_checkpoints).toHaveLength(1); // preserved surfaces untouched by run 2
    expect(tx.tables.shows_pending_changes).toHaveLength(1);
  });

  test("a checkpoint-less session with orphan staging rows is fully reaped", async () => {
    const tx = new FakeReapTx();
    tx.tables.pending_ingestions.push({ wizard_session_id: STALE, drive_file_id: "drive-x1" });
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([{ wizardSessionId: STALE, outcome: "reaped_full" }]);
    expect(tx.tables.pending_ingestions).toEqual([]);
  });

  test("no candidates → empty result, zero lock acquisitions, zero deletes", async () => {
    const tx = new FakeReapTx();
    tx.tables.pending_syncs.push({ wizard_session_id: ACTIVE, drive_file_id: "drive-active" });
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([]);
    expect(tx.operations.filter((op) => op.startsWith("lock-") || op.startsWith("delete"))).toEqual([]);
  });
});
```

- [ ] **VERIFY (RED).** `pnpm vitest run tests/onboarding/reapStaleSessions.test.ts` → fails: `reapStaleOnboardingSessions` is not exported.
- [ ] **GREEN.** Implement in `lib/onboarding/sessionLifecycle.ts` (below `cleanupAbandonedFinalize`). Minimal implementation:

```ts
export type ReapedSession = {
  wizardSessionId: string;
  outcome:
    | "reaped_full"
    | "reaped_orphan_rows"
    | "skipped_active"
    | "skipped_recent_finalize"
    | "skipped_fresh_activity"
    | "skipped_no_residue"
    | "skipped_unstable";  // R27/R28: lock-set expanded on every retry (budget 3) — no deletes, no sync_log
};

export type ReapStaleSessionsResult = { sessions: ReapedSession[] };

const REAP_STAGING_TABLES = [
  "pending_syncs",
  "pending_ingestions",
  "deferred_ingestions",
  "onboarding_scan_manifest",
] as const;

async function readActiveSessionId(tx: OnboardingSessionTx): Promise<string | null> {
  // Plain read, deliberately NOT `for update`: taking the app_settings row lock here and
  // then acquiring the NEXT session's finalize lock would invert cleanupAbandonedFinalize's
  // finalize-lock → app_settings order (:329 → :331) — AB-BA deadlock. A plain read is safe
  // because every rotation mints a fresh randomUUID() (:227, :254, :408): a candidate stale
  // session can never become the active session again, and the reap's DELETEs are all
  // wizard_session_id-scoped, so rows of a newly-rotated session are structurally untouchable.
  const { rows } = await tx.query<{ pending_wizard_session_id: string | null }>(
    `select pending_wizard_session_id from public.app_settings where id = 'default'`,
  );
  return rows[0]?.pending_wizard_session_id ?? null;
}

const REAP_DRIVE_ID_TABLES = [
  "onboarding_scan_manifest",
  "shows_pending_changes",
  "pending_syncs",
  "pending_ingestions",
  "deferred_ingestions",
] as const;

async function collectReapDriveFileIds(
  tx: OnboardingSessionTx,
  sessionId: string,
): Promise<string[]> {
  // Union across ALL FIVE session-scoped surfaces (lockCleanupDriveFiles at :154-184 only
  // covers applied-manifest + shadows; spec §6 R5-1 requires pending_syncs,
  // pending_ingestions AND deferred_ingestions too — a stale session can hold ONLY a
  // deferred row, the F5 commit-window residue shape).
  //
  // PLAIN SELECT — deliberately NO `for update` (R15 HIGH). Taking row locks BEFORE the
  // show: advisory locks inverts the order every pending-ingestion action uses:
  // withPostgresSyncPipelineLock takes the show ADVISORY lock first (retry/route.ts:73),
  // THEN readLockedPendingIngestion row-locks FOR UPDATE (retry/route.ts:114-128). A
  // concurrent stale-tab retry holding the advisory lock and waiting on our row lock,
  // while we hold the row lock and wait on its advisory lock, is an AB-BA deadlock —
  // the same advisory-before-row rule the PF11 lock-order test pins for RPCs.
  const driveFileIds = new Set<string>();
  for (const table of REAP_DRIVE_ID_TABLES) {
    const { rows } = await tx.query<DriveFileIdRow>(
      `select drive_file_id from public.${table} where wizard_session_id = $1::uuid`,
      [sessionId],
    );
    for (const row of rows) driveFileIds.add(row.drive_file_id);
  }
  return [...driveFileIds].sort((a, b) => a.localeCompare(b));
}

**Lock-acquisition algorithm (plan R24-1 supersedes any incremental-lock phrasing below):** the per-session transaction acquires show locks from a SINGLE globally sorted list, exactly once. Procedure: (1) under the `finalize:<session>` lock, collect candidate drive ids (plain SELECT, no row locks); (2) sort; (3) acquire all `show:` locks in that order; (4) re-collect under the locks; (5) if the re-collection discovers ANY id not already held — regardless of sort position — ROLLBACK this session's transaction and retry the session from step 1 (bounded retries, e.g. 3, then `skipped_unstable` outcome with no deletes). NEVER acquire an additional show lock while already holding higher-sorted ones (AB-BA with any alphabetical-order path). Required regression: a concurrent insert adds a lower-sorted drive id between first collection and re-collection → the reap retries (or skips) without out-of-order acquisition; assert via a paired alphabetical locker that no 40P01 occurs.

class ReapLockSetExpandedError extends Error {}  // R24-1/R27-1: triggers per-session rollback + retry

async function lockReapDriveFiles(tx: OnboardingSessionTx, sessionId: string): Promise<string[]> {
  // R24-1/R27-1 algorithm: collect WITHOUT row locks → acquire ALL show locks from ONE
  // globally sorted list, exactly once → re-collect under the locks. If the re-collection
  // discovers ANY id not already held (regardless of sort position), we must NOT acquire it
  // in-place — acquiring while holding higher-sorted locks is the AB-BA class against any
  // alphabetical locker. Instead throw; the caller rolls back this session's transaction and
  // retries the session from a clean lock set (bounded retries, then `skipped_unstable` with
  // zero deletes and no sync_log row).
  const initial = await collectReapDriveFileIds(tx, sessionId);   // already sorted
  for (const driveFileId of initial) {
    await tx.query(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
  }
  const recheck = await collectReapDriveFileIds(tx, sessionId);
  const held = new Set(initial);
  if (recheck.some((id) => !held.has(id))) {
    throw new ReapLockSetExpandedError(`reap lock set expanded for session ${sessionId}`);
  }
  return initial;  // R43-1: the LOCKED set — every drive-id-bearing DELETE + residue check uses exactly this array
}
// Caller contract: reapOneSession's per-session transaction catches ReapLockSetExpandedError
// OUTSIDE the aborted transaction, decrements a per-session retry budget (3), and re-runs the
// session from step 1; budget exhausted → outcome `skipped_unstable` (no deletes, no sync_log).

async function reapOneSession(
  tx: OnboardingSessionTx,
  sessionId: string,
  adminEmail: string,
): Promise<ReapedSession> {
  // (1) Session lifecycle lock FIRST — same lock finalize Phase B and cleanup take (:329).
  await tx.query(`select pg_advisory_xact_lock(hashtext('finalize:' || $1))`, [sessionId]);

  // (2) Re-check eligibility UNDER the lock (spec §6 R3-1/R5-1/R12-1).
  if ((await readActiveSessionId(tx)) === sessionId) {
    return { wizardSessionId: sessionId, outcome: "skipped_active" };
  }
  const recent = await tx.query<{ id: string }>(
    `
      select id
        from public.wizard_finalize_checkpoints
       where wizard_session_id = $1::uuid
         and status = 'in_progress'
         and last_processed_at is not null
         and last_processed_at > now() - interval '1 hour'
       for update
    `,
    [sessionId],
  );
  if (recent.rowCount > 0) {
    return { wizardSessionId: sessionId, outcome: "skipped_recent_finalize" };
  }
  // (2b) Freshness re-check UNDER the lock (R1 HIGH): a just-rotated non-active session is
  //      NOT stale. Eligible only if the session's most-recent activity across every
  //      session-scoped surface is older than 24 hours (cleanup's staleness convention,
  //      :337). NULL activity max (no timestamped rows anywhere; checkpoint has no other
  //      timestamp column) ⇒ nothing to preserve ⇒ stale. Note: this subsumes the 1-hour
  //      in_progress guard above, which is kept because spec §6 names it explicitly.
  const freshness = await tx.query<{ stale: boolean }>(
    `
      select coalesce(greatest(
        (select max(last_processed_at) from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid),
        (select max(staged_at) from public.shows_pending_changes where wizard_session_id = $1::uuid),
        (select greatest(max(parsed_at), max(wizard_approved_at)) from public.pending_syncs where wizard_session_id = $1::uuid),
        (select greatest(max(observed_at), max(transitioned_at)) from public.onboarding_scan_manifest where wizard_session_id = $1::uuid),
        (select greatest(max(first_seen_at), max(last_attempt_at)) from public.pending_ingestions where wizard_session_id = $1::uuid),
        (select max(deferred_at) from public.deferred_ingestions where wizard_session_id = $1::uuid)
      ) < now() - interval '24 hours', true) as stale
    `,
    [sessionId],
  );
  if (!freshness.rows[0]?.stale) {
    return { wizardSessionId: sessionId, outcome: "skipped_fresh_activity" };
  }

  // (3) Per-show advisory locks for every affected drive_file_id, deterministic order.
  const lockedDriveFileIds = await lockReapDriveFiles(tx, sessionId);

  // (4) Terminal sessions (final_cas_done) get the orphan-row sweep ONLY (spec §6 R5-2):
  //     staging tables are reapable, but the terminal checkpoint row and any retained
  //     CAS-failure shadows are operator-recovery surface and stay.
  const checkpoint = await tx.query<{ status: string }>(
    `select status from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`,
    [sessionId],
  );
  const terminal = checkpoint.rows.some((row) => row.status === "final_cas_done");

  // (5) Deletes, COUNTED. Terminal-session idempotency (R4 HIGH): a final_cas_done session's
  //     checkpoint + retained CAS-failure shadows are PRESERVED surfaces, so a completed
  //     session with nothing else would otherwise stay a candidate forever — every reap run
  //     would re-"reap" it, inflate the success count, and spam sync_log while deleting
  //     nothing. Every DELETE therefore carries `returning 1 as deleted` (the postgres tx
  //     adapter derives rowCount from returned rows, sessionLifecycle.ts:93-99 — a bare
  //     DELETE reports 0), counts are summed, and a zero-delete run exits as
  //     skipped_no_residue with NO sync_log row.
  let deleted = 0;
  if (!terminal) {
    // First-seen interim rows: provenance-keyed (created_show_id), NEVER the published=false proxy.
    deleted += (
      await tx.query(
        `
          delete from public.shows s
           using public.onboarding_scan_manifest m
           where m.wizard_session_id = $1::uuid
             and m.created_show_id = s.id
             and s.published = false
          returning 1 as deleted
        `,
        [sessionId],
      )
    ).rowCount;
    deleted += (
      await tx.query(
        `delete from public.shows_pending_changes
          where wizard_session_id = $1::uuid
            and drive_file_id = any($2)   -- R44-1: same locked-set contract as the staging tables
          returning 1 as deleted`,
        [sessionId, lockedDriveFileIds],
      )
    ).rowCount;
    deleted += (
      await tx.query(
        `delete from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid returning 1 as deleted`,
        [sessionId],
      )
    ).rowCount;
  }
  for (const table of REAP_STAGING_TABLES) {
    // R42-1: deletes are constrained to the LOCKED drive-id set, never wizard_session_id alone —
    // a stale-tab action committing a NEW-drive row after the recheck must not be swept without
    // holding show:<new_drive_id>. Rows with NULL drive_file_id (none exist in these tables' DDL,
    // verify at implementation) would otherwise escape the lock contract.
    deleted += (
      await tx.query(
        `delete from public.${table}
          where wizard_session_id = $1::uuid
            and drive_file_id = any($2)
          returning 1 as deleted`,
        [sessionId, lockedDriveFileIds],
      )
    ).rowCount;
  }
  // R42-1: post-delete residue check — if any session-scoped row remains in a staging table
  // (i.e., a row outside the locked set appeared mid-transaction), throw ReapLockSetExpandedError
  // so the bounded retry re-runs the session with a fresh lock set (or skipped_unstable).
  // R45-1: the residue surface depends on session state — TERMINAL (final_cas_done) sessions
  // intentionally PRESERVE their checkpoint + shows_pending_changes shadows (operator recovery),
  // so scanning shadows there would false-positive every terminal reap into skipped_unstable and
  // roll back the deferral sweep F5 depends on. Non-terminal sessions include shadows.
  const residueTables = isTerminalSession ? REAP_STAGING_TABLES : [...REAP_STAGING_TABLES, "shows_pending_changes"];
  for (const table of residueTables) {
    const residue = await tx.query(
      `select 1 from public.${table} where wizard_session_id = $1::uuid limit 1`,
      [sessionId],
    );
    if (residue.rowCount > 0) throw new ReapLockSetExpandedError(`post-delete residue in ${table}`);
  }
  if (deleted === 0) {
    // Nothing but preserved surfaces (terminal checkpoint / retained shadows): not a reap.
    return { wizardSessionId: sessionId, outcome: "skipped_no_residue" };
  }
  await tx.query(
    `
      insert into public.sync_log (status, message, parse_warnings)
      values (
        'reap_stale_session',
        'stale onboarding session debris reaped by an admin',
        jsonb_build_array(jsonb_build_object('wizard_session_id', $1::uuid, 'admin_email', $2, 'deleted_rows', $3::int))
      )
    `,
    [sessionId, adminEmail, deleted],
  );
  return { wizardSessionId: sessionId, outcome: terminal ? "reaped_orphan_rows" : "reaped_full" };
}

export async function reapStaleOnboardingSessions(
  deps: SessionLifecycleDeps = {},
): Promise<ReapStaleSessionsResult> {
  const runtime = depsWithDefaults(deps);
  const admin = await runtime.requireAdminIdentity();

  // STEP 1 — read-only candidate enumeration in its OWN transaction. Takes no locks;
  // every candidate is fully re-validated under its session's finalize lock in step 2.
  const candidates = await runtime.withTx(async (tx) => {
    const { rows } = await tx.query<{ wizard_session_id: string }>(
      `
        select distinct wizard_session_id from (
          select wizard_session_id from public.wizard_finalize_checkpoints
          union all select wizard_session_id from public.onboarding_scan_manifest
          union all select wizard_session_id from public.shows_pending_changes
          union all select wizard_session_id from public.pending_syncs
          union all select wizard_session_id from public.pending_ingestions
          union all select wizard_session_id from public.deferred_ingestions
        ) candidate_sessions
        where wizard_session_id is not null
          and wizard_session_id is distinct from (
            select pending_wizard_session_id from public.app_settings where id = 'default'
          )
        order by wizard_session_id
      `,
    );
    return rows;
  });

  // STEP 2 — ONE TRANSACTION PER SESSION (R5 HIGH — deadlock prevention, NOT an
  // optimization). A single outer tx would still hold session A's show: locks while
  // requesting session B's finalize: lock (show→finalize). A concurrent
  // cleanupAbandonedFinalize(B) holds finalize:B and then waits on an overlapping
  // show: lock (finalize→show, sessionLifecycle.ts:329→:374) — classic AB-BA.
  // Committing per session releases ALL advisory locks (pg_advisory_XACT_lock) before
  // the next session's finalize lock is requested, so the only ordering any concurrent
  // holder ever observes is cleanup's own finalize→show. Trade-off: the reap is no
  // longer all-or-nothing across sessions — a failure mid-list leaves earlier sessions
  // reaped (each internally atomic), mirroring Phase D's ratified per-row independence.
  const sessions: ReapedSession[] = [];
  for (const candidate of candidates) {
    // R28-1: bounded rollback-and-retry OUTSIDE the per-session transaction. A
    // ReapLockSetExpandedError aborts that session's tx (locks released); we retry from a
    // clean sorted lock set; budget exhausted -> skipped_unstable (no deletes, no sync_log).
    // R38-1: defaultWithTx wraps every error EXCEPT CleanupRequiresStaleSessionError in
    // OnboardingSessionInfraError (sessionLifecycle.ts:102-110) — ReapLockSetExpandedError MUST be
    // added to that pass-through allowlist in the same commit, or the retry loop below never sees
    // it and the route 500s REAP_STALE_SESSIONS_FAILED instead of returning skipped_unstable.
    // Regression (Task 4.4): force lock-set expansion through the REAL defaultWithTx (not the fake)
    // and assert skipped_unstable is returned with zero deletes/log rows — the fake withTx rethrows
    // raw errors and cannot catch this production-only mismatch.
    let outcome: ReapedSession | null = null;
    for (let attempt = 0; attempt < 3 && outcome === null; attempt++) {
      try {
        outcome = await runtime.withTx((tx) => reapOneSession(tx, candidate.wizard_session_id, admin.email));
      } catch (error) {
        if (!(error instanceof ReapLockSetExpandedError)) throw error;
      }
    }
    sessions.push(outcome ?? { wizardSessionId: candidate.wizard_session_id, outcome: "skipped_unstable" });
  }
  // R29-2: skipped_unstable MUST be visible to the admin caller — silently dropping it lets an
  // operator believe the sweep completed while debris remains. Return reaped + skipped_unstable;
  // the quiet skips (active/fresh/recent/no_residue) stay filtered (intentional, covered by tests).
  return { sessions: sessions.filter((s) => s.outcome.startsWith("reaped") || s.outcome === "skipped_unstable") };
}
```

  Route/UI note (R29-2): the reap route response and the admin affordance surface `skipped_unstable` sessions distinctly from successful reaps (copy: "1 session couldn't be cleaned this run — try again"); add a route test asserting the outcome appears in the JSON body. R43-1 RED/GREEN checklist item (explicit): the SQL-shape structural test is written FIRST and must be RED against any session-only DELETE for the staging tables (temporarily revert the `and drive_file_id = any($2)` clause to confirm red), then GREEN with the locked-set contract. R45-1 regression: terminal session (final_cas_done) + retained shadow + stale deferral → deferral DELETED, shadow + checkpoint survive, outcome reaped_orphan_rows (NOT skipped_unstable), exactly one sync_log row. R42-1 regressions: (a) real-DB race — a stale action inserts a new-drive residue row after the reap's recheck; assert the reap does NOT delete it in that transaction and instead retries (fresh lock set covering the new id) or returns skipped_unstable; (b) structural test — every reap staging DELETE must filter BOTH wizard_session_id AND the locked drive-id set (reject session-only DELETEs by SQL-shape scan of the reap module — for EVERY drive-id-bearing reap table including shows_pending_changes (R44-1)). Adjust the candidate-enumeration SQL / fake-classifier pairing as needed — the fake must classify EXACTLY the SQL the implementation issues (the fake throws on anything unclassified, which is the structural no-purge/no-rotate guarantee).
- [ ] **VERIFY (GREEN).** `pnpm vitest run tests/onboarding/reapStaleSessions.test.ts tests/onboarding/sessionLifecycle.test.ts` → all pass.
- [ ] **COMMIT.** `feat(onboarding): session-scoped stale-debris reap (never purges, never rotates)`

---

## Task 4.3 — Reap lock topology: finalize-lock-first + re-check under lock + deterministic show locks; extend the structural lock test

**Files:**
- `tests/onboarding/reapStaleSessions.test.ts` (extend)
- `tests/auth/advisoryLockRpcDeadlock.test.ts` (extend)

**Failure mode caught:** (a) the reap deletes session rows BEFORE holding `finalize:<session>` — a concurrent finalize/cleanup for the same session races it (per-show locks do not protect session-level state, spec §6 R3-1/R12-1); (b) eligibility checked only at enumeration time — a finalize batch that became active between enumeration and the lock is reaped mid-flight; (c) show locks acquired in nondeterministic order deadlock against `lockCleanupDriveFiles` / F2's `order by drive_file_id` loop; (d) a deferred-only session's `drive_file_id` is never locked because the union missed `deferred_ingestions`; (e) **one outer transaction spanning all candidates (R5 HIGH):** session A's `show:` advisory locks are still held when the loop requests session B's `finalize:` lock — a show→finalize ordering that deadlocks against a concurrent `cleanupAbandonedFinalize(B)` holding `finalize:B` (`sessionLifecycle.ts:329`) and waiting on an overlapping `show:` lock (`:374`); the fix is structural — one transaction PER session, all locks released at each commit.

- [ ] **RED.** Extend `tests/onboarding/reapStaleSessions.test.ts`:

```ts
describe("reap lock topology (F4 / spec §3.3 + §6)", () => {
  test("finalize lock precedes EVERY other per-session operation, including eligibility re-checks and deletes", async () => {
    const tx = new FakeReapTx();
    staleSessionFixture(tx);
    await reapStaleOnboardingSessions(deps(tx));
    const ops = tx.operations;
    const lockIdx = ops.indexOf(`lock-finalize:${STALE}`);
    expect(lockIdx).toBeGreaterThan(-1);
    const recheckIdx = ops.indexOf("read-active-session", ops.indexOf("enumerate-candidates") + 1);
    const recencyIdx = ops.indexOf(`recency-check:${STALE}`);
    const firstDelete = ops.findIndex((op) => op.startsWith("delete"));
    const firstShowLock = ops.findIndex((op) => op.startsWith("lock-show:"));
    // finalize lock → re-checks → show locks → deletes (cleanup's :329→:331→:374→:376 order)
    expect(lockIdx).toBeLessThan(recheckIdx);
    expect(lockIdx).toBeLessThan(recencyIdx);
    expect(recencyIdx).toBeLessThan(firstShowLock);
    expect(firstShowLock).toBeLessThan(firstDelete);
  });

  test("show locks cover the union of all five session tables in deterministic alphabetical order", async () => {
    const tx = new FakeReapTx();
    staleSessionFixture(tx); // drive ids: drive-m1, drive-s1, drive-p1, drive-i1, drive-d1
    await reapStaleOnboardingSessions(deps(tx));
    const showLocks = tx.operations
      .filter((op) => op.startsWith("lock-show:"))
      .map((op) => op.slice("lock-show:".length));
    // Derived from the fixture's five tables, sorted — NOT hardcoded independently of the fixture.
    expect(showLocks).toEqual(["drive-d1", "drive-i1", "drive-m1", "drive-p1", "drive-s1"]);
  });

  test("per-session tx boundary: two stale sessions sharing a drive_file_id never hold show locks across a finalize-lock acquisition (R5)", async () => {
    // Concrete failure mode: in ONE outer tx, session A's show: locks (incl. the SHARED
    // drive-shared file) are still held when finalize:B is requested — deadlocks against a
    // concurrent cleanupAbandonedFinalize(B) (finalize:B held, waiting on show:drive-shared).
    // Per-session transactions make the inversion structurally impossible: every lock is
    // released at the session's commit, so each finalize: acquisition happens in a tx that
    // holds NOTHING yet.
    const A = "bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb"; // sorts before B below
    const B = "eeeeeeee-0000-4000-8000-eeeeeeeeeeee";
    const tx = new FakeReapTx();
    tx.tables.pending_syncs.push(
      { wizard_session_id: A, drive_file_id: "drive-shared" },
      { wizard_session_id: B, drive_file_id: "drive-shared" },
      { wizard_session_id: B, drive_file_id: "drive-b-only" },
    );
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions.map((s) => s.wizardSessionId)).toEqual([A, B]);

    const ops = tx.operations;
    // 1 enumeration tx + 1 tx per candidate session.
    expect(ops.filter((op) => op.startsWith("tx-begin:"))).toHaveLength(3);
    // Each session's ENTIRE lock+delete sequence sits inside its own tx segment:
    // no show: lock op may appear between a tx-commit and the next tx-begin, and the
    // finalize: lock of session B must come AFTER the commit that released A's locks.
    const commitA = ops.indexOf("tx-commit:2");
    const finalizeB = ops.indexOf(`lock-finalize:${B}`);
    expect(ops.indexOf(`lock-finalize:${A}`)).toBeGreaterThan(ops.indexOf("tx-begin:2"));
    expect(commitA).toBeGreaterThan(-1);
    expect(finalizeB).toBeGreaterThan(commitA); // A fully committed (locks released) first
    // No show-lock op from A's segment leaks past A's commit.
    const showLockIdxs = ops
      .map((op, i) => (op.startsWith("lock-show:") ? i : -1))
      .filter((i) => i >= 0 && i < finalizeB);
    for (const i of showLockIdxs) expect(i).toBeLessThan(commitA);
  });

  test("a stale session whose ONLY row is a deferred_ingestions row is reaped under its show lock", async () => {
    const tx = new FakeReapTx();
    tx.tables.deferred_ingestions.push({ wizard_session_id: STALE, drive_file_id: "drive-only-deferral" });
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([{ wizardSessionId: STALE, outcome: "reaped_full" }]);
    expect(tx.operations).toContain("lock-show:drive-only-deferral");
    expect(tx.tables.deferred_ingestions).toEqual([]);
  });

  test("re-check under the lock: a session that became active between enumeration and lock is skipped untouched", async () => {
    const tx = new FakeReapTx();
    staleSessionFixture(tx);
    // Simulate the race: the moment the finalize lock is granted, the session IS the active one.
    const originalQuery = tx.query.bind(tx);
    tx.query = (async (sql: string, params: readonly unknown[] = []) => {
      const result = await originalQuery(sql, params);
      if (/'finalize:'/.test(sql)) tx.activeSession = STALE;
      return result;
    }) as FakeReapTx["query"];
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([]); // skipped_active filtered from reaped output
    expect(tx.operations.filter((op) => op.startsWith("delete"))).toEqual([]);
  });

  test("a session with finalize activity within the last hour is skipped untouched", async () => {
    const tx = new FakeReapTx();
    tx.tables.wizard_finalize_checkpoints.push({ wizard_session_id: STALE, status: "in_progress", recent: true });
    tx.tables.pending_syncs.push({ wizard_session_id: STALE, drive_file_id: "drive-busy" });
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([]);
    expect(tx.tables.pending_syncs).toHaveLength(1);
    expect(tx.operations.filter((op) => op.startsWith("delete"))).toEqual([]);
  });
});
```

  And extend `tests/auth/advisoryLockRpcDeadlock.test.ts` with a sibling of the cleanup pin at `:174-186`:

```ts
  test("stale-session reap uses direct SQL locks (finalize then show), no lock-taking RPC, no rotation", () => {
    const source = stripComments(
      readFileSync(join(ROOT, "lib/onboarding/sessionLifecycle.ts"), "utf8"),
    );
    const reapBody = source.slice(source.indexOf("async function reapOneSession"));
    expect(reapBody).toMatch(/pg_advisory_xact_lock\(hashtext\('finalize:' \|\| \$1\)\)/);
    expect(reapBody).toMatch(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/);
    expect(reapBody).not.toMatch(/\.rpc\(/);
    // Single-holder + no-rotation pins: the reap never re-acquires inside a nested layer
    // and never touches app_settings beyond the plain read.
    expect(reapBody).not.toMatch(/update\s+public\.app_settings/i);
    expect(reapBody).not.toMatch(/for update[\s\S]*?app_settings|app_settings[\s\S]{0,200}for update/i);
    // R15 HIGH — advisory-before-row: drive-id collection must take NO row locks. A
    // FOR UPDATE before the show: advisory locks inverts the order pending-ingestion
    // actions use (advisory via withPostgresSyncPipelineLock first, retry/route.ts:73;
    // FOR UPDATE second, retry/route.ts:114-128) — AB-BA deadlock with a stale-tab retry.
    const collectBody = source.slice(
      source.indexOf("async function collectReapDriveFileIds"),
      source.indexOf("async function lockReapDriveFiles"),
    );
    expect(collectBody).not.toMatch(/for\s+update/i);
  });
```

- [ ] **VERIFY.** `pnpm vitest run tests/onboarding/reapStaleSessions.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts` — RED first (ordering/union assertions fail if Task 4.2's GREEN cut corners), then GREEN after any fixes. Expected final output: all tests pass.
- [ ] **COMMIT.** `test(onboarding): pin reap lock topology (finalize-first, five-table union, deterministic show locks)`

---

## Task 4.4 — Preservation regressions + real-DB integration

**Files:**
- `tests/onboarding/reapStaleSessions.test.ts` (extend — preservation unit tests)
- `tests/onboarding/reapStaleSessionsDb.test.ts` (new, real-Postgres)

**Failure mode caught:** the reap is over-eager — it deletes (a) the ACTIVE session's staging (the exact `purgeWizardRows` failure the spec forbids), (b) a fresh just-rotated session's rows, (c) a deferred-only session is missed (under-eager), or (d) a pre-existing `published = false` show approved into a shadow (the R11-1 data-loss path, reap side).

- [ ] **RED (unit).** Extend `tests/onboarding/reapStaleSessions.test.ts`:

```ts
describe("reap preservation (F4 §6 required tests)", () => {
  test("active session retains ALL pending/manifest/shadow rows while a stale session's debris is removed in the same run", async () => {
    const tx = new FakeReapTx();
    staleSessionFixture(tx); // seeds BOTH active-session rows and stale-session rows
    await reapStaleOnboardingSessions(deps(tx));
    for (const name of ["onboarding_scan_manifest", "shows_pending_changes", "pending_syncs"]) {
      expect(
        tx.tables[name]!.filter((r) => r.wizard_session_id === ACTIVE),
        `${name}: active session row must survive`,
      ).toHaveLength(1);
      expect(tx.tables[name]!.filter((r) => r.wizard_session_id === STALE)).toEqual([]);
    }
  });

  test("a pre-existing published=false show approved into a shadow SURVIVES the reap", async () => {
    const tx = new FakeReapTx();
    // Shadow for a REAL existing show: manifest row applied but created_show_id is NULL (not session-created).
    tx.tables.onboarding_scan_manifest.push({
      wizard_session_id: STALE, drive_file_id: "drive-real", status: "applied", created_show_id: null,
    });
    tx.tables.shows_pending_changes.push({ wizard_session_id: STALE, drive_file_id: "drive-real" });
    tx.tables.shows.push({ id: "real-show", drive_file_id: "drive-real", published: false });
    await reapStaleOnboardingSessions(deps(tx));
    // Concrete failure mode: a published=false-proxy delete removes "real-show"; provenance keeps it.
    expect(tx.tables.shows).toEqual([{ id: "real-show", drive_file_id: "drive-real", published: false }]);
    expect(tx.tables.shows_pending_changes).toEqual([]); // shadow debris itself IS reaped
  });

  test("a FRESH non-active session (just rotated, staging present, checkpoint last_processed_at NULL) survives intact", async () => {
    // Concrete failure mode (R1 HIGH): a newly-superseded session is non-active the instant
    // rotation commits and its checkpoint may have last_processed_at NULL — the active-session
    // and 1-hour-checkpoint guards alone leave it ELIGIBLE, so the reap deletes staging an
    // operator's stale tab may still legitimately re-attach to. This is the data-loss class
    // this phase exists to prevent.
    const FRESH = "dddddddd-0000-4000-8000-dddddddddddd";
    const tx = new FakeReapTx();
    tx.freshSessions.add(FRESH); // activity max within 24h → freshness predicate says NOT stale
    tx.tables.wizard_finalize_checkpoints.push({ wizard_session_id: FRESH, status: "in_progress", recent: false /* last_processed_at NULL */ });
    tx.tables.onboarding_scan_manifest.push({ wizard_session_id: FRESH, drive_file_id: "drive-f1", status: "staged", created_show_id: null });
    tx.tables.pending_syncs.push({ wizard_session_id: FRESH, drive_file_id: "drive-f1" });
    tx.tables.shows_pending_changes.push({ wizard_session_id: FRESH, drive_file_id: "drive-f2" });
    const result = await reapStaleOnboardingSessions(deps(tx));
    expect(result.sessions).toEqual([]); // skipped_fresh_activity filtered from reaped output
    expect(tx.operations).toContain(`activity-check:${FRESH}`); // the guard actually ran, under the finalize lock
    for (const name of ["wizard_finalize_checkpoints", "onboarding_scan_manifest", "pending_syncs", "shows_pending_changes"]) {
      expect(
        tx.tables[name]!.filter((r) => r.wizard_session_id === FRESH),
        `${name}: fresh session rows must survive`,
      ).toHaveLength(1);
    }
    expect(tx.operations.filter((op) => op.startsWith("delete"))).toEqual([]);
  });
});
```

- [ ] **RED (real DB).** Add `tests/onboarding/reapStaleSessionsDb.test.ts` (same probe + `test.skipIf(!dbUp)` harness as Task 4.1). Seed: active session A (in `app_settings`, with one manifest + one pending_syncs row), stale session B (`in_progress` checkpoint with `last_processed_at = now() - interval '25 hours'`, one manifest row with `created_show_id` → an interim `published=false` show, one shadow, one pending_syncs, one pending_ingestions, one deferred_ingestions — **every B row's activity columns backdated past 24h**: `staged_at` / `parsed_at` / `wizard_approved_at` / `observed_at` / `transitioned_at` / `first_seen_at` / `last_attempt_at` / `deferred_at` all set to `now() - interval '25 hours'`, since most default to `now()` on insert), stale session C whose ONLY row is a `deferred_ingestions` row with `deferred_at = now() - interval '25 hours'`, **FRESH non-active session D** (rotated minutes ago: checkpoint row with `last_processed_at` NULL, one manifest + one pending_syncs + one shadow row inserted with DEFAULT timestamps, i.e. `now()`), and one pre-existing `published=false` show whose `drive_file_id` matches a B manifest row with `created_show_id IS NULL`. Run `reapStaleOnboardingSessions({ requireAdminIdentity: async () => ({ email: "admin@example.com" }) })` against the loopback-guarded `LOCAL_TEST_DATABASE_URL` harness (and pin `process.env.TEST_DATABASE_URL` AND `DATABASE_URL` to the assertLocalDbUrl-validated loopback URL (plan R19-1: route/lib default openers fall back TEST_DATABASE_URL ?? DATABASE_URL, so deleting one is insufficient; assert the resolved opener URL is loopback before the first call; restore originals in teardown) for the test process so route/lib defaults that prefer it cannot escape to validation). Assert: every B/C-scoped row across all six tables is gone; B's interim show is gone; the pre-existing show, EVERY A-scoped row, AND **every D-scoped row including D's checkpoint** survive (concrete failure mode: without the 24h activity guard, D — non-active, no recent `last_processed_at` — is reaped and a newly-superseded session's staging is destroyed); a `sync_log` row with status `reap_stale_session` exists per reaped session; result lists B (`reaped_full`) and C (`reaped_full`) and does NOT list D. Derive all expected survivor sets from the seeded fixtures (anti-tautology: build the expected arrays from the seed constants, not literals repeated inline). **Two-run idempotency (R4 HIGH):** also seed terminal session E (`final_cas_done` checkpoint + one retained shadow + one `deferred_ingestions` residue row, all activity columns backdated 25h). Run the reap TWICE: run 1 lists E as `reaped_orphan_rows`, deletes only E's deferral, preserves E's checkpoint + shadow, and writes exactly one `reap_stale_session` `sync_log` row for E; run 2 lists NO sessions, leaves every surviving row byte-identical, and adds ZERO new `sync_log` rows (count `sync_log` before/after). Concrete failure mode: E's preserved checkpoint/shadow keep it a candidate forever — without the zero-delete guard, every scheduled/operator reap re-reports it as reaped and appends a log row, inflating counts and spamming cleanup logs indefinitely. **Concurrent-cleanup overlap (R5 HIGH, real-DB half):** seed two stale sessions sharing a `drive_file_id` (B above plus a second stale session whose rows reference one of B's drive ids), then run `Promise.all([reapStaleOnboardingSessions(...), cleanupAbandonedFinalize(<second session>, ...)])` and assert BOTH settle (wrap in a 30s timeout — a deadlock manifests as the test hanging until Postgres's `deadlock_timeout` aborts one party with SQLSTATE 40P01; assert neither promise rejects with 40P01). The per-session tx boundary is what makes this pass: each reap session commits — releasing its `show:` locks — before the next `finalize:` lock is requested. **Retry-route overlap (R15 HIGH, real-DB half):** while a retry/defer route transaction HOLDS the `show:` advisory lock for one of B's drive ids (start `withPostgresSyncPipelineLock(driveFileId, fn, { tryOnly: false })` whose `fn` row-locks the pending_ingestions row FOR UPDATE — the retry route's exact sequence, retry/route.ts:73 + :114-128 — then parks on a deferred promise), run `reapStaleOnboardingSessions(...)` concurrently; release the route tx after a beat; assert BOTH settle with no SQLSTATE 40P01. Concrete failure mode: a reap that row-locked B's rows during collection (FOR UPDATE) while the route holds the advisory lock and waits on the same row is an AB-BA deadlock — plain-SELECT collection + advisory-first ordering is what makes this pass.
- [ ] **VERIFY.** `pnpm vitest run tests/onboarding/reapStaleSessions.test.ts tests/onboarding/reapStaleSessionsDb.test.ts` → all pass (db file skips cleanly when Postgres is down; runs in CI/local with the stack up). Any failure here is a Task 4.2 implementation gap — fix in `sessionLifecycle.ts`, not in the tests.
- [ ] **COMMIT.** `test(onboarding): reap preservation regressions (active/fresh sessions, deferred-only, pre-existing unpublished show) + real-DB integration`

---

## Task 4.5 — Admin route: `POST /api/admin/onboarding/reap-stale-sessions`

**Files:**
- `app/api/admin/onboarding/reap-stale-sessions/route.ts` (new)
- `tests/onboarding/reapStaleSessionsRoute.test.ts` (new)

**Failure mode caught:** the reap is reachable without an admin identity, or infra failures surface as raw 500 stack text instead of the typed codes the admin surface expects (invariant 5: UI reads codes through `lib/messages/lookup.ts`; the route must emit cataloged codes only — `ADMIN_FORBIDDEN` / `ADMIN_SESSION_LOOKUP_FAILED` are already cataloged and used by the sibling route at `app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts:176-182`).

- [ ] **RED.** Add `tests/onboarding/reapStaleSessionsRoute.test.ts` mirroring `tests/onboarding/cleanupAbandonedFinalize.test.ts:62-115`'s injected-deps shape:

```ts
import { describe, expect, test, vi } from "vitest";
import { handleReapStaleSessions } from "@/app/api/admin/onboarding/reap-stale-sessions/route";

describe("POST /api/admin/onboarding/reap-stale-sessions", () => {
  test("gates admin and returns the reap summary", async () => {
    const reap = vi.fn(async () => ({
      sessions: [{ wizardSessionId: "b", outcome: "reaped_full" as const }],
    }));
    const response = await handleReapStaleSessions(new Request("http://test"), {
      requireAdminIdentity: async () => ({ email: "admin@example.com" }),
      reapStaleOnboardingSessions: reap,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "reaped",
      sessions: [{ wizardSessionId: "b", outcome: "reaped_full" }],
    });
    // The route passes the already-resolved admin identity through (no double prompt).
    expect(reap).toHaveBeenCalledWith(
      expect.objectContaining({ requireAdminIdentity: expect.any(Function) }),
    );
  });

  test("non-admin callers get 403 ADMIN_FORBIDDEN before any reap work", async () => {
    const reap = vi.fn();
    const response = await handleReapStaleSessions(new Request("http://test"), {
      requireAdminIdentity: async () => {
        throw Object.assign(new Error("nope"), { code: "ADMIN_FORBIDDEN" });
      },
      reapStaleOnboardingSessions: reap,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, code: "ADMIN_FORBIDDEN" });
    expect(reap).not.toHaveBeenCalled();
  });

  test("session-lookup infra failure surfaces as 500 ADMIN_SESSION_LOOKUP_FAILED", async () => {
    const response = await handleReapStaleSessions(new Request("http://test"), {
      requireAdminIdentity: async () => {
        throw Object.assign(new Error("boom"), { code: "ADMIN_SESSION_LOOKUP_FAILED" });
      },
      reapStaleOnboardingSessions: vi.fn(),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, code: "ADMIN_SESSION_LOOKUP_FAILED" });
  });
});
```

- [ ] **GREEN.** New route, structurally a slim sibling of the cleanup route (admin gate shape from `cleanup-abandoned-finalize/[sessionId]/route.ts:167-182`):

```ts
import { NextResponse } from "next/server";
import {
  reapStaleOnboardingSessions as defaultReap,
  type ReapStaleSessionsResult,
  type SessionLifecycleDeps,
} from "@/lib/onboarding/sessionLifecycle";

export type ReapStaleSessionsRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  reapStaleOnboardingSessions?: (deps?: SessionLifecycleDeps) => Promise<ReapStaleSessionsResult>;
};

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function handleReapStaleSessions(
  _request: Request,
  routeDeps: ReapStaleSessionsRouteDeps = {},
): Promise<Response> {
  const requireAdmin = routeDeps.requireAdminIdentity ?? defaultRequireAdminIdentity;
  const reap = routeDeps.reapStaleOnboardingSessions ?? defaultReap;
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }
  try {
    const result = await reap({ requireAdminIdentity: async () => admin });
    return NextResponse.json({ status: "reaped", sessions: result.sessions });
  } catch (error) {
    // Plan-R1 finding 1: a thrown infra error from the reap transaction must surface as a
    // cataloged JSON code, never a raw 500 — the UI does a catalog lookup on `code`.
    // Plan R31-2: LOG the cause before returning the cataloged response — this route performs
    // advisory-locked deletes; losing the DB/lock/permission context makes failures unrecoverable.
    console.error("reap-stale-sessions failed", error);
    return errorResponse(500, "REAP_STALE_SESSIONS_FAILED");
  }
}

```

**Plan-R1 finding 1 additions (route infra-error contract):**

- [ ] **Extra failing test (write BEFORE the handler):** inject a `reapStaleOnboardingSessions` that throws (`async () => { throw new Error("connection reset"); }`); assert the response is `500` with JSON body `{ ok: false, code: "REAP_STALE_SESSIONS_FAILED" }` AND (plan R31-2) spy on `console.error` asserting the original error object was logged with the route's context prefix — NOT an unhandled rejection / opaque 500. Concrete failure mode caught: an `OnboardingSessionInfraError` thrown mid-reap escaping the route so the operator sees an unparseable error exactly when destructive cleanup fails.
- [ ] **Catalog lockstep, same commit:** `REAP_STALE_SESSIONS_FAILED` is a NEW user-visible code → master spec §12.4 row + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` row (title/longExplanation/helpHref per the docs-validator predicate) + run `pnpm test:audit:x1-catalog-parity`. Mirror the copy register of the existing cleanup-abandoned-finalize route's failure rows.
- [ ] **Task 4.6 UI consumes the code** through `lib/messages/lookup.ts` (invariant 5) — assert the rendered copy contains no raw code string.

```typescript
export async function POST(request: Request): Promise<Response> {
  return await handleReapStaleSessions(request);
}
```

- [ ] **VERIFY.** `pnpm vitest run tests/onboarding/reapStaleSessionsRoute.test.ts` → 3 pass.
- [ ] **COMMIT.** `feat(onboarding): admin route to reap stale wizard-session debris`

---

## Task 4.6 — Admin surface affordance (⚠️ OPUS-OWNED UI + impeccable dual-gate)

**Files (all UI — Opus territory per AGENTS.md routing rule, regardless of who executes the rest of this phase):**
- `components/admin/ReapStaleSessionsButton.tsx` (new — sibling of `components/admin/CleanupAbandonedFinalizeButton.tsx`)
- The hosting admin surface (exact placement is an execution-time design decision; the existing cleanup affordance renders via `components/admin/StaleReadyToPublish.tsx` / `components/admin/FinalizeInProgress.tsx` on `app/admin/page.tsx` — the reap action belongs adjacent to that cluster or on the onboarding admin surface)
- `tests/components/...` test for the new component

**Routing + gates (non-negotiable):**
- If this phase is being executed under Codex: **STOP at this task and hand back to the orchestrator.** UI files are Opus-owned (AGENTS.md "Hard rule: UI work is always Opus / Claude Code").
- The implementing Opus session uses the **impeccable v3** workflow (preflight gates: PRODUCT.md → DESIGN.md → register → preflight signal), NOT `frontend-design`.
- Before this phase's close-out: `/impeccable critique` + `/impeccable audit` on the affected diff, **externally attested** (fresh subagent or user-invoked — self-attestation by the authoring session fails §1.8). HIGH/CRITICAL findings fixed or DEFERRED.md-logged.
- If the affordance lands on a route captured by the help-screenshot manifest (`/admin` IS captured), budget baseline regen per the byte-comparison discipline (pinned amd64 Docker procedure) — check `pnpm screenshot:help` selectors before assuming no regen.

**Behavioral contract (plan-level; visual design is the Opus session's call):**
- One action: POST to `/api/admin/onboarding/reap-stale-sessions`, confirmation step first (destructive-class action — mirror `CleanupAbandonedFinalizeButton`'s confirm → running → error state machine and its catalog-driven error copy via `messageFor(code).dougFacing`, never raw codes — invariant 5).
- Success: `router.refresh()` + a count summary derived from the response's `sessions` array.
- Error: catalog lookup for the response `code`; generic fallback only when the code is uncataloged (the `lookupDougFacing` pattern at `CleanupAbandonedFinalizeButton.tsx:36-40`).

- [ ] **RED.** Component test: renders confirm step; POSTs on confirm; renders per-code catalog copy on `{ok:false, code:"ADMIN_FORBIDDEN"}`; renders the reaped-session count on success. Scope DOM-label assertions per the anti-tautology rule (query within the component root, not the document).
- [ ] **GREEN.** Implement the component + placement.
- [ ] **VERIFY.** `pnpm vitest run tests/components/<new test>` + a real-browser interaction check (prod build, NOT `next dev` — local dev hydration is broken in this sandbox per project memory).
- [ ] **Impeccable dual-gate** (external attestation) on the diff.
- [ ] **COMMIT.** `feat(admin): clean-up-stale-sessions affordance on the onboarding admin surface`

---

## Task 4.7 — PostgREST DML lockdown for the wizard staging tables (R14 HIGH)

**Files:**
- `supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql` (new — next free timestamp after this plan's F1 `20260611000000` and F2 `20260611000001`)
- `tests/db/postgrest-dml-lockdown.test.ts` (extend — 3 registry rows; **same commit as the migration**, Layer 4 fails otherwise)

**Concrete failure mode:** every F4/F5 invariant lives in server-side SQL paths, NOT in the schema. With `insert, update, delete` granted to `anon, authenticated` under the `is_admin()` RLS policy (`20260501002000_rls_policies.sql:179/:203/:211`), any admin-authenticated browser session (devtools, a stale tab, or future buggy client code) can `from("onboarding_scan_manifest").update(...)` / `.delete()` directly via PostgREST — deleting manifest rows without the `finalize:` lock, flipping a checkpoint's `status` mid-finalize, forging `created_show_id` provenance (turning Task 4.1's data-loss fix back ON), or resurrecting the F5 race by mutating rows with no currency predicate. RLS gates WHO; it does not gate WHICH CODE PATH — that is exactly the M9.5 R5+R6 lockdown class (AGENTS.md cross-cutting discipline: "RPC body checks … are bypassable if the caller hits the table directly").

- [ ] **Client-DML sweep FIRST (step 1 — done at plan time, re-verify at execution):** `rg -n '\.from\("(onboarding_scan_manifest|wizard_finalize_checkpoints|shows_pending_changes)"' app components lib middleware.ts` → exactly TWO call sites, both SELECT-only and thus unaffected by a DML-only REVOKE: `components/admin/OnboardingWizard.tsx:142` (`.select("drive_file_id, name, status")`) and `app/admin/_finalizeCheckpoint.ts:55` (`.select("status, batches_completed, last_processed_drive_file_id, last_processed_at")`). All mutations of these 3 tables flow through server-side `postgres.js` SQL (`sessionLifecycle.ts`, finalize routes, `runOnboardingScan.ts`, `discardStaged.ts`, retry route) or the service-role client, which the REVOKE does not touch. Document the sweep output in the commit message body.
- [ ] **RED.** Add the three registry rows to `RPC_GATED_TABLES` in `tests/db/postgrest-dml-lockdown.test.ts` (describe.each pattern; `selectAnon`/`selectAuthenticated: true` — SELECT stays per the existing RLS posture, matching the read-only call sites above):

```ts
  {
    table: "onboarding_scan_manifest",
    closed_at: "supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql:<line>",
    selectAnon: true,
    selectAuthenticated: true,
    postBody: {
      wizard_session_id: "00000000-0000-0000-0000-000000000000",
      drive_file_id: "postgrest-dml-lockdown-test",
      folder_id: "lockdown-test",
      name: "lockdown-test",
      mime_type: "application/vnd.google-apps.spreadsheet",
      status: "staged",
    },
    rowFilter: "?drive_file_id=eq.postgrest-dml-lockdown-no-such-row",
  },
  {
    table: "wizard_finalize_checkpoints",
    closed_at: "supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql:<line>",
    selectAnon: true,
    selectAuthenticated: true,
    postBody: {
      wizard_session_id: "00000000-0000-0000-0000-000000000000",
      status: "in_progress",
      batches_completed: 0,
    },
    rowFilter: "?wizard_session_id=eq.00000000-0000-0000-0000-000000000000",
  },
  {
    table: "shows_pending_changes",
    closed_at: "supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql:<line>",
    selectAnon: true,
    selectAuthenticated: true,
    postBody: {
      wizard_session_id: "00000000-0000-0000-0000-000000000000",
      drive_file_id: "postgrest-dml-lockdown-test",
      show_id: "00000000-0000-0000-0000-000000000001",          // R37-2: NOT NULL in live DDL
      payload: {},
      applied_by_email: "lockdown-probe@example.com",           // R37-2: NOT NULL
      applied_at_intent: "2026-06-11T00:00:00Z",                // R37-2: NOT NULL
    },
    // R37-2: body is structurally valid so a regressed grant fails on PERMISSION (42501), never on
    // column validation — the probe must prove the lockdown, not a 400.

    rowFilter: "?drive_file_id=eq.postgrest-dml-lockdown-no-such-row",
  },
```

  (Verify each `postBody` against the live NOT NULL set before landing — the probe must fail on PERMISSION, not on a missing column; the suite's live PostgREST probes distinguish 401/403 from 400.) Run `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` → RED: the live probes find INSERT/UPDATE/DELETE still granted, and Layer 4 flags registry rows whose `closed_at` migration doesn't exist yet.
- [ ] **GREEN.** New migration `20260611000002_lockdown_wizard_staging_tables.sql`, mirroring the established DML-only REVOKE shape (cf. `20260609000000_lockdown_allowed_watermark_columns.sql` for idempotency conventions — REVOKE/GRANT are no-ops when already in effect, so apply-twice safe):

```sql
-- PostgREST DML lockdown for the wizard staging tables (M-onboarding-fixups Task 4.7).
-- F4/F5 invariants (finalize/show lock ordering, 24h freshness, created_show_id
-- provenance, wizard-session currency predicates) live in server-side SQL paths;
-- table-level DML grants let an admin-authed PostgREST call bypass all of them
-- (AGENTS.md PostgREST-DML-lockdown discipline; M9.5 R5+R6 class).
-- SELECT stays: components/admin/OnboardingWizard.tsx:142 and
-- app/admin/_finalizeCheckpoint.ts:55 read these tables via PostgREST (read-only).
-- Idempotent: REVOKE is a no-op when the privilege is already absent.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.onboarding_scan_manifest FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.wizard_finalize_checkpoints FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.shows_pending_changes FROM anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.onboarding_scan_manifest TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.wizard_finalize_checkpoints TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.shows_pending_changes TO service_role;

NOTIFY pgrst, 'reload schema';
```

  Fill the three `closed_at` line references with the actual REVOKE line numbers.
- [ ] **VERIFY.** Apply LOCALLY (⚠️ NOT `TEST_DATABASE_URL` — that is the VALIDATION project in this repo's `.env.local`; validation gets its labeled surgical apply in the close-out checklist): `psql -v ON_ERROR_STOP=1 "${LOCAL_TEST_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}" -f supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql`, run TWICE (apply-twice idempotency; the loopback default matches the Task 4.1/4.4 harness convention — refuse non-loopback values per `tests/db/_remediationHelpers.ts`). Then `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` → all four layers pass; `pnpm vitest run tests/onboarding tests/sync --silent` → no regression (server-side SQL paths and service-role access are untouched; the two SELECT-only client reads still work).
- [ ] **Post-migration checklist (same PR):** `pnpm gen:schema-manifest` + commit the regenerated manifest; surgical apply to the validation project (`supabase db query --linked` or psql) + `notify pgrst, 'reload schema'` — recorded in the close-out checklist below.
- [ ] **COMMIT.** `fix(db): revoke PostgREST DML on wizard staging tables (onboarding_scan_manifest, wizard_finalize_checkpoints, shows_pending_changes)` — migration + registry rows + manifest regen in ONE commit.

---

## Phase close-out checklist

- [ ] All tasks committed individually (invariant 6), no batched commits.
- [ ] `pnpm vitest run tests/onboarding tests/auth/advisoryLockRpcDeadlock.test.ts` green.
- [ ] Task 4.6's impeccable dual-gate evidence recorded in the milestone handoff §12.
- [ ] Confirm Phase 3 (F2 migration) carries the one-time 18+18 validation purge — NOT re-implemented here.
- [ ] Task 4.7 lockdown migration applied to the validation project surgically (`supabase db query --linked` / psql — `supabase db push` is blocked) + `notify pgrst, 'reload schema'`; regenerated `supabase/__generated__/schema-manifest.json` committed (validation-schema-parity gate).
- [ ] F5 dependency note: Phase 5 Task 5.4's "F4 reap removes the residue" test imports `reapStaleOnboardingSessions` — this phase must merge (or be on the shared branch) before that task runs. **Freshness-guard interaction:** that test must backdate the residue's `deferred_at` past 24 hours (the row defaults to `now()`, which the new activity guard correctly treats as fresh → `skipped_fresh_activity`).
