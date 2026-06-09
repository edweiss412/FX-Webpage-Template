# Phase 1 — Tables & lockdown

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this phase task-by-task. Steps use checkbox (`- [ ]`) syntax. Every task is TDD: failing test → minimal impl → passing test → commit. **Owner:** Codex (backend; no UI files).

**Goal:** Land the two new public tables (`sync_holds`, `show_change_log`) with their exact DDL/CHECKs/indexes per `00-overview.md` "Shared contracts", REVOKE INSERT/UPDATE/DELETE from `anon`/`authenticated`, enable RLS with an admin-only / no-anon-SELECT read posture (F9 — `before_image` carries crew PII), register both in the PostgREST-DML-lockdown meta-test, prove the read-lockdown with real role-switched SELECT attempts, and bring the validation project + committed schema manifest into parity (mandatory in THIS phase — `validation-schema-parity` reds otherwise).

**Depends on:** none. (Phase 2+ depend on this phase's tables existing.)

**Shared contracts (verbatim — do NOT redefine):** the `sync_holds` and `show_change_log` DDL blocks in `00-overview.md` lines 31–69. This phase implements them character-for-character; later phases consume them.

**Transitional-window discipline:** this repo applies `supabase/migrations/` to a fresh DB on every CI run and surgically to the persistent validation project. There is no separate `tables/` directory for these tables (they are migration-born), so the inline CREATE and the migration are the same file — no dual-CHECK window. Still: every CHECK is written `ALTER TABLE ... DROP CONSTRAINT IF EXISTS <name>; ALTER TABLE ... ADD CONSTRAINT <name> ...` so a re-apply (validation surgical apply + fresh-CI apply) is idempotent, and a future Phase-2 domain widening (`section_row`/`field`) only edits the ADD half. `create table if not exists` + `create index if not exists` + `revoke` are naturally idempotent; `enable row level security` is idempotent; `create policy` is guarded with `drop policy if exists` first.

---

## Task 1.1 — `sync_holds` table + CHECKs + index + REVOKE + RLS

**Files:**
- Create `supabase/migrations/20260608000000_sync_holds.sql`
- Create `tests/db/sync-holds-schema.test.ts`

**Steps:**

- [ ] **1. Write failing test** — `tests/db/sync-holds-schema.test.ts`. Asserts the table exists with the exact column set + types, the three CHECK constraints reject bad values and accept good ones, the unique constraint is enforced, and the index exists. Uses `postgres.js` against `TEST_DATABASE_URL` (local fallback), each mutation inside a ROLLBACK'd txn so nothing persists.

```ts
/**
 * tests/db/sync-holds-schema.test.ts (Phase 1 Task 1.1 — 00-overview.md §"Shared contracts")
 *
 * Pins the public.sync_holds DDL: column set, the three CHECK constraints
 * (domain / kind / unique entity), and the show index. Real DB; each write
 * inside a ROLLBACK'd txn so the table stays empty for sibling tests.
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

const ROLLBACK = Symbol("rollback");
async function inRollback<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  let out: T;
  try {
    await sql.begin(async (tx) => {
      out = await fn(tx as unknown as Sql);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return out!;
}

// Seed a show row in-txn so the FK is satisfiable; returns its id.
async function seedShow(tx: Sql): Promise<string> {
  const slug = `sh-${randomUUID().slice(0, 8)}`;
  const [row] = await tx`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${`drv-${randomUUID()}`}, ${slug}, 'T', 'c', 'v')
    returning id
  `;
  return row.id as string;
}

describe("public.sync_holds DDL", () => {
  it("has exactly the contract columns", async () => {
    const cols = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'sync_holds'
      order by column_name
    `;
    expect(cols.map((c) => c.column_name)).toEqual([
      "base_modified_time",
      "created_at",
      "created_by",
      "domain",
      "drive_file_id",
      "entity_key",
      "held_value",
      "id",
      "kind",
      "proposed_value",
      "show_id",
    ]);
  });

  it("the show index exists", async () => {
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from pg_indexes
      where schemaname = 'public' and tablename = 'sync_holds'
        and indexname = 'sync_holds_show_idx'
    `;
    expect(count).toBe(1);
  });

  it("accepts a valid mi11_pending hold and rejects a bad domain / bad kind", async () => {
    await inRollback(async (tx) => {
      const showId = await seedShow(tx);
      const inserted = await tx`
        insert into public.sync_holds
          (show_id, drive_file_id, domain, entity_key, held_value,
           proposed_value, base_modified_time, kind, created_by)
        values (${showId}, 'drv', 'crew_email', 'Alice',
                ${tx.json({ email: "a@old", name: "Alice" })},
                ${tx.json({ disposition: "email_change", name: "Alice", email: "a@new" })},
                now(), 'mi11_pending', 'system')
        returning id
      `;
      expect(inserted.count).toBe(1);

      await expect(
        tx`insert into public.sync_holds
             (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
           values (${showId}, 'drv', 'NOT_A_DOMAIN', 'Bob',
                   ${tx.json({})}, 'mi11_pending', 'system')`,
      ).rejects.toThrow(/sync_holds_domain_chk/);

      await expect(
        tx`insert into public.sync_holds
             (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
           values (${showId}, 'drv', 'crew_email', 'Carol',
                   ${tx.json({})}, 'NOT_A_KIND', 'system')`,
      ).rejects.toThrow(/sync_holds_kind_chk/);
    });
  });

  it("enforces UNIQUE (show_id, domain, entity_key)", async () => {
    await inRollback(async (tx) => {
      const showId = await seedShow(tx);
      const ins = (key: string) => tx`
        insert into public.sync_holds
          (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
        values (${showId}, 'drv', 'crew_email', ${key},
                ${tx.json({})}, 'mi11_pending', 'system')
      `;
      await ins("Alice");
      await expect(ins("Alice")).rejects.toThrow(/sync_holds_uniq/);
    });
  });
});
```

- [ ] **2. Run it — fails** — `pnpm vitest run tests/db/sync-holds-schema.test.ts`. Expected: every case errors with `relation "public.sync_holds" does not exist` (table not created yet).

- [ ] **3. Minimal impl** — create `supabase/migrations/20260608000000_sync_holds.sql` with the exact `00-overview.md` DDL, CHECKs via DROP-IF-EXISTS+ADD, REVOKE, RLS-enable, and a no-policy deny-by-default posture (service_role bypasses RLS; F9 — no anon/authenticated SELECT):

```sql
-- Phase 1 Task 1.1 — sync_holds: per-entity identity holds (MI-11 gate + undo).
-- DDL is the canonical "Shared contracts" block from
-- docs/superpowers/plans/2026-06-08-sync-changes-feed-identity-gate/00-overview.md.
-- Read posture (F9): crew identity (email) in held_value/proposed_value is admin-only —
-- RLS enabled, NO anon/authenticated SELECT or DML; the feed reads as service_role.

create table if not exists public.sync_holds (
  id                 uuid primary key default gen_random_uuid(),
  show_id            uuid not null references public.shows(id) on delete cascade,
  drive_file_id      text not null,
  domain             text not null,
  entity_key         text not null,
  held_value         jsonb not null,
  proposed_value     jsonb,
  base_modified_time timestamptz,
  kind               text not null,
  created_at         timestamptz not null default now(),
  created_by         text not null
);

-- CHECKs: DROP IF EXISTS + ADD for apply-twice idempotency + future-domain widening.
alter table public.sync_holds drop constraint if exists sync_holds_domain_chk;
alter table public.sync_holds add  constraint sync_holds_domain_chk
  check (domain in ('crew_email','crew_identity'));
alter table public.sync_holds drop constraint if exists sync_holds_kind_chk;
alter table public.sync_holds add  constraint sync_holds_kind_chk
  check (kind in ('mi11_pending','undo_override'));
alter table public.sync_holds drop constraint if exists sync_holds_uniq;
alter table public.sync_holds add  constraint sync_holds_uniq
  unique (show_id, domain, entity_key);

create index if not exists sync_holds_show_idx on public.sync_holds (show_id);

-- PostgREST DML lockdown + admin-only read (F9).
alter table public.sync_holds enable row level security;
revoke all on table public.sync_holds from anon, authenticated;
grant all on table public.sync_holds to service_role;
-- deny-by-default: NO anon/authenticated RLS policy is created (service-role bypasses RLS).
```

- [ ] **4. Apply locally + run — passes** — apply the migration to the local stack (`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260608000000_sync_holds.sql`), then `pnpm vitest run tests/db/sync-holds-schema.test.ts`. Expected: all cases pass.

- [ ] **5. Commit** — `feat(db): add sync_holds table with CHECKs, index, REVOKE, RLS deny-by-default`.

---

## Task 1.2 — `show_change_log` table + CHECKs + index + REVOKE + RLS

**Files:**
- Create `supabase/migrations/20260608000001_show_change_log.sql`
- Create `tests/db/show-change-log-schema.test.ts`

**Steps:**

- [ ] **1. Write failing test** — `tests/db/show-change-log-schema.test.ts`. Asserts the exact column set, the `(show_id, occurred_at desc)` feed index, the `source`/`status`/`change_kind` CHECKs accept the contract values and reject junk, and the `undo_of` self-FK accepts a same-table parent. Reuses the same `inRollback`/`seedShow` helpers (copy them in — keep the test self-contained).

```ts
/**
 * tests/db/show-change-log-schema.test.ts (Phase 1 Task 1.2)
 *
 * Pins public.show_change_log DDL: columns, feed index (show_id, occurred_at desc),
 * source/status/change_kind CHECKs, and the undo_of self-FK. Real DB; ROLLBACK'd.
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

const ROLLBACK = Symbol("rollback");
async function inRollback<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  let out: T;
  try {
    await sql.begin(async (tx) => {
      out = await fn(tx as unknown as Sql);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return out!;
}
async function seedShow(tx: Sql): Promise<string> {
  const slug = `sh-${randomUUID().slice(0, 8)}`;
  const [row] = await tx`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${`drv-${randomUUID()}`}, ${slug}, 'T', 'c', 'v') returning id
  `;
  return row.id as string;
}
async function insertLog(
  tx: Sql,
  showId: string,
  o: { source: string; change_kind: string; status: string; undo_of?: string },
) {
  const [row] = await tx`
    insert into public.show_change_log
      (show_id, drive_file_id, source, change_kind, entity_ref, summary,
       before_image, after_image, status, undo_of)
    values (${showId}, 'drv', ${o.source}, ${o.change_kind}, 'Alice',
            'rendered summary', ${tx.json({ email: "a@old" })},
            ${tx.json({ email: "a@new" })}, ${o.status}, ${o.undo_of ?? null})
    returning id
  `;
  return row.id as string;
}

describe("public.show_change_log DDL", () => {
  it("has exactly the contract columns", async () => {
    const cols = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'show_change_log'
      order by column_name
    `;
    expect(cols.map((c) => c.column_name)).toEqual([
      "after_image",
      "before_image",
      "change_kind",
      "drive_file_id",
      "entity_ref",
      "id",
      "occurred_at",
      "show_id",
      "source",
      "status",
      "summary",
      "undo_of",
    ]);
  });

  it("the feed index (show_id, occurred_at desc) exists", async () => {
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from pg_indexes
      where schemaname = 'public' and tablename = 'show_change_log'
        and indexname = 'show_change_log_feed_idx'
    `;
    expect(count).toBe(1);
  });

  it("accepts contract source/status/change_kind and an undo_of self-reference", async () => {
    await inRollback(async (tx) => {
      const showId = await seedShow(tx);
      const parent = await insertLog(tx, showId, {
        source: "auto_apply",
        change_kind: "crew_removed",
        status: "applied",
      });
      const undoId = await insertLog(tx, showId, {
        source: "undo",
        change_kind: "crew_removed",
        status: "undone",
        undo_of: parent,
      });
      expect(undoId).toBeTruthy();
    });
  });

  it("rejects a bad source / status", async () => {
    await inRollback(async (tx) => {
      const showId = await seedShow(tx);
      await expect(
        insertLog(tx, showId, { source: "NOPE", change_kind: "crew_added", status: "applied" }),
      ).rejects.toThrow(/show_change_log_source_chk/);
      await expect(
        insertLog(tx, showId, { source: "auto_apply", change_kind: "crew_added", status: "NOPE" }),
      ).rejects.toThrow(/show_change_log_status_chk/);
    });
  });
});
```

- [ ] **2. Run it — fails** — `pnpm vitest run tests/db/show-change-log-schema.test.ts`. Expected: `relation "public.show_change_log" does not exist`.

- [ ] **3. Minimal impl** — create `supabase/migrations/20260608000001_show_change_log.sql`:

```sql
-- Phase 1 Task 1.2 — show_change_log: per-show changes-feed source + before/after images.
-- DDL is the canonical "Shared contracts" block from 00-overview.md.
-- Read posture (F9): before_image/after_image carry crew PII (email/phone/role/...) — admin-only:
-- RLS enabled, NO anon/authenticated SELECT or DML; the feed reads as service_role.

create table if not exists public.show_change_log (
  id            uuid primary key default gen_random_uuid(),
  show_id       uuid not null references public.shows(id) on delete cascade,
  drive_file_id text not null,
  occurred_at   timestamptz not null default now(),
  source        text not null,
  change_kind   text not null,
  entity_ref    text,
  summary       text not null,
  before_image  jsonb,
  after_image   jsonb,
  status        text not null,
  undo_of       uuid references public.show_change_log(id)
);

-- CHECKs: DROP IF EXISTS + ADD for apply-twice idempotency + future-value widening.
alter table public.show_change_log drop constraint if exists show_change_log_source_chk;
alter table public.show_change_log add  constraint show_change_log_source_chk
  check (source in ('auto_apply','mi11_approve','mi11_reject','undo'));
alter table public.show_change_log drop constraint if exists show_change_log_status_chk;
alter table public.show_change_log add  constraint show_change_log_status_chk
  check (status in ('applied','pending','rejected','undone'));
-- change_kind is open-ended (invariant codes MI-* plus structural kinds); guard only
-- against empty so a row always carries a renderable kind.
alter table public.show_change_log drop constraint if exists show_change_log_change_kind_chk;
alter table public.show_change_log add  constraint show_change_log_change_kind_chk
  check (length(change_kind) > 0);

create index if not exists show_change_log_feed_idx
  on public.show_change_log (show_id, occurred_at desc);

-- PostgREST DML lockdown + admin-only read (F9).
alter table public.show_change_log enable row level security;
revoke all on table public.show_change_log from anon, authenticated;
grant all on table public.show_change_log to service_role;
-- deny-by-default: NO anon/authenticated RLS policy is created (service-role bypasses RLS).
```

- [ ] **4. Apply locally + run — passes** — `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260608000001_show_change_log.sql`, then `pnpm vitest run tests/db/show-change-log-schema.test.ts`. Expected: all pass.

- [ ] **5. Commit** — `feat(db): add show_change_log table with CHECKs, feed index, REVOKE, RLS deny-by-default`.

---

## Task 1.3 — Register both tables in the PostgREST-DML-lockdown meta-test

**Files:**
- Modify `tests/db/postgrest-dml-lockdown.test.ts` (append two entries to the `RPC_GATED_TABLES` array, ending at line 248 `] as const;`; the array opens at line 124)

**Steps:**

- [ ] **1. Write failing assertion (extend the meta-test)** — add two `RPC_GATED_TABLES` rows. Both have `selectAnon:false` + `selectAuthenticated:false` (F9 — no PostgREST SELECT). This *is* the failing test: Layer 1 asserts the grant posture; Layer 4 asserts a live REVOKE exists for each registered table; Layers 2+3 probe POST/PATCH/DELETE + (because SELECT is revoked) GET. Insert before the closing `] as const;` at line 248:

```ts
  {
    table: "sync_holds",
    closed_at:
      "supabase/migrations/20260608000000_sync_holds.sql:30",
    selectAnon: false,
    selectAuthenticated: false,
    postBody: {
      show_id: "00000000-0000-0000-0000-000000000000",
      drive_file_id: "lockdown-test",
      domain: "crew_email",
      entity_key: "postgrest-dml-lockdown-test",
      held_value: {},
      kind: "mi11_pending",
      created_by: "postgrest-dml-lockdown-test",
    },
    rowFilter: "?entity_key=eq.postgrest-dml-lockdown-test-no-such-row",
  },
  {
    table: "show_change_log",
    closed_at:
      "supabase/migrations/20260608000001_show_change_log.sql:30",
    selectAnon: false,
    selectAuthenticated: false,
    postBody: {
      show_id: "00000000-0000-0000-0000-000000000000",
      drive_file_id: "lockdown-test",
      source: "auto_apply",
      change_kind: "crew_added",
      summary: "postgrest-dml-lockdown-test",
      status: "applied",
    },
    rowFilter: "?summary=eq.postgrest-dml-lockdown-test-no-such-row",
  },
```

> `closed_at` line numbers (`:30`) point at the `revoke all on table ...` line in each migration. After writing the migrations, confirm the actual line with `grep -n "revoke all on table" supabase/migrations/20260608000000_sync_holds.sql supabase/migrations/20260608000001_show_change_log.sql` and update the two `closed_at` citations to match exactly — Layer 4 only needs the table name, but the citation must be truthful.

- [ ] **2. Run it — fails (before migrations are applied to the probe target)** — `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts`. With migrations applied locally (Tasks 1.1/1.2 step 4 already applied them), Layer 1 + Layer 4 pass immediately; **the meaningful failing-first signal is Layer 4's inverse check** if you stage the registry rows BEFORE writing the REVOKE lines — so author this task by first adding the registry rows with NO migration REVOKE present and confirming `every RPC_GATED_TABLES entry has a matching live table-level REVOKE` fails for `sync_holds, show_change_log`, then (Tasks 1.1/1.2 already supplied the REVOKE) re-run green. If Tasks 1.1/1.2 are already merged, demonstrate the red by temporarily commenting the `revoke all on table` line in one migration, re-applying to local, and confirming Layer 1 flips `anon:INSERT:false`→`true`.

- [ ] **3. Minimal impl** — none beyond the registry rows (the REVOKE/RLS already shipped in 1.1/1.2). Restore any temporarily-commented REVOKE line and re-apply locally.

- [ ] **4. Run it — passes** — `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts`. Expected: Layer 1 (grant posture both `false`/`false`), Layers 2+3 (POST/PATCH/DELETE 403/401 with PG 42501, and GET 403/401 since SELECT is revoked), and Layer 4 (registry ↔ live-REVOKE parity) all green for both new tables.

- [ ] **5. Commit** — `test(db): register sync_holds + show_change_log in PostgREST DML-lockdown meta-test`.

---

## Task 1.4 — Real read-lockdown test (anti-tautology: attempt SELECT as anon + non-admin)

**Files:**
- Create `tests/db/feed-tables-read-lockdown.test.ts`

> This is distinct from Task 1.3's Layer-2/3 PostgREST GET probe (which proves the *grant-layer* REVOKE fires). This task proves the **role-level RLS/grant denial** directly via `set_config('role', ...)` + a JWT-claims GUC inside a transaction, and asserts a service-role connection *can* read the same rows — i.e. the data exists and is genuinely hidden, not just absent. It actually executes a `SELECT` as each role and asserts denial / zero rows, including reading `before_image`.

**Steps:**

- [ ] **1. Write failing test** — `tests/db/feed-tables-read-lockdown.test.ts`:

```ts
/**
 * tests/db/feed-tables-read-lockdown.test.ts (Phase 1 Task 1.4 — spec §4.1 / §6.1 finding F9)
 *
 * sync_holds + show_change_log carry crew PII (email in held_value/proposed_value;
 * email/phone/role/... in before_image/after_image). They are admin-only / server-only:
 * RLS enabled, NO anon/authenticated SELECT. This test SEEDS one row in each table as a
 * privileged connection, then proves a `set_config('role','authenticated')` (non-admin
 * claims) and `set_config('role','anon')` SELECT returns ZERO rows / is denied — including
 * an explicit attempt to read before_image — while the privileged connection reads them.
 *
 * Anti-tautology: the assertion is not "a deny policy exists" — it actually runs the SELECT
 * as the untrusted role and asserts no row / no PII leaks back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Privileged connection: connects as the DB owner (postgres) / service_role-equivalent.
// It bypasses RLS so it can seed + read the rows the untrusted roles must NOT see.
const priv: Sql = postgres(DB_URL, { max: 2, prepare: false });

const SECRET_EMAIL = `secret-${randomUUID()}@example.invalid`;
let showId = "";
let holdId = "";
let logId = "";

const nonAdminClaims = () =>
  JSON.stringify({
    sub: "00000000-0000-0000-0000-000000000099",
    email: `read-lockdown-nonadmin-${randomUUID()}@example.com`,
  });

beforeAll(async () => {
  const [show] = await priv`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${`drv-${randomUUID()}`}, ${`sh-${randomUUID().slice(0, 8)}`}, 'T', 'c', 'v')
    returning id
  `;
  showId = show.id as string;
  const [hold] = await priv`
    insert into public.sync_holds
      (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
    values (${showId}, 'drv', 'crew_email', 'Alice',
            ${priv.json({ email: SECRET_EMAIL, name: "Alice" })}, 'mi11_pending', 'system')
    returning id
  `;
  holdId = hold.id as string;
  const [log] = await priv`
    insert into public.show_change_log
      (show_id, drive_file_id, source, change_kind, summary, before_image, after_image, status)
    values (${showId}, 'drv', 'auto_apply', 'crew_removed', 'removed Alice',
            ${priv.json({ email: SECRET_EMAIL, phone: "555" })}, ${priv.json({})}, 'applied')
    returning id
  `;
  logId = log.id as string;
});

afterAll(async () => {
  // Tear down seeded rows (cascades clean child rows via show delete).
  await priv`delete from public.shows where id = ${showId}`;
  await priv.end({ timeout: 5 });
});

// Run a SELECT as a given role/claims and return the rows it can see.
async function selectAs<T>(
  role: "anon" | "authenticated",
  claims: string | null,
  query: (tx: Sql) => Promise<T[]>,
): Promise<T[]> {
  let rows: T[] = [];
  const ROLLBACK = Symbol("rollback");
  try {
    await priv.begin(async (tx) => {
      await tx`select set_config('role', ${role}, true)`;
      if (claims) await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      rows = await query(tx as unknown as Sql);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) {
      // A grant-level REVOKE surfaces as a thrown "permission denied" — that is
      // ALSO a pass (denied, not zero-rows). Normalize both to "saw nothing".
      const msg = String((err as Error).message ?? "");
      if (/permission denied/i.test(msg)) {
        rows = [];
        return;
      }
      throw err;
    }
  }
  return rows;
}

describe("feed tables are admin-only / server-only (F9)", () => {
  it("the privileged connection CAN read the seeded rows (anti-tautology: data exists)", async () => {
    const holds = await priv`
      select held_value->>'email' as email from public.sync_holds where id = ${holdId}
    `;
    const logs = await priv`
      select before_image->>'email' as email from public.show_change_log where id = ${logId}
    `;
    expect(holds[0]?.email).toBe(SECRET_EMAIL);
    expect(logs[0]?.email).toBe(SECRET_EMAIL);
  });

  for (const role of ["anon", "authenticated"] as const) {
    it(`${role} SELECT on sync_holds returns no rows / is denied (incl. held_value PII)`, async () => {
      const rows = await selectAs(role, role === "authenticated" ? nonAdminClaims() : null, (tx) =>
        tx`select id, held_value->>'email' as email from public.sync_holds where id = ${holdId}`,
      );
      expect(rows).toHaveLength(0);
      expect(rows.map((r) => (r as { email?: string }).email)).not.toContain(SECRET_EMAIL);
    });

    it(`${role} SELECT on show_change_log returns no rows / is denied (incl. before_image PII)`, async () => {
      const rows = await selectAs(role, role === "authenticated" ? nonAdminClaims() : null, (tx) =>
        tx`select id, before_image->>'email' as email from public.show_change_log where id = ${logId}`,
      );
      expect(rows).toHaveLength(0);
      expect(rows.map((r) => (r as { email?: string }).email)).not.toContain(SECRET_EMAIL);
    });
  }
});
```

- [ ] **2. Run it — fails** — `pnpm vitest run tests/db/feed-tables-read-lockdown.test.ts`. Expected, IF a deny-by-default REVOKE/RLS were ever missing: the `anon`/`authenticated` SELECTs would return the seeded row and the `not.toContain(SECRET_EMAIL)` assertion would fail. To prove the test is non-tautological at authoring time, temporarily `grant select on public.sync_holds to authenticated;` on the local DB and confirm the `authenticated` cases fail (PII leaks); then revoke it again.

- [ ] **3. Minimal impl** — none (the deny-by-default RLS + REVOKE shipped in 1.1/1.2). Ensure the temporary grant from step 2 is reverted: `revoke select on public.sync_holds from authenticated;` on local.

- [ ] **4. Run it — passes** — `pnpm vitest run tests/db/feed-tables-read-lockdown.test.ts`. Expected: privileged read sees `SECRET_EMAIL`; both roles see zero rows / are denied on both tables.

- [ ] **5. Commit** — `test(db): prove anon + non-admin cannot SELECT sync_holds / show_change_log (F9 read lockdown)`.

---

## Task 1.5 — Regenerate schema manifest + apply both migrations to the validation project

**Files:**
- Modify `supabase/__generated__/schema-manifest.json` (regenerated by `pnpm gen:schema-manifest` — do not hand-edit)

> Mandatory in THIS phase, not deferred: `validation-schema-parity` Layer 1 reds the moment the two `create table public.*` migrations exist without a matching manifest entry, and Layer 2 reds until the tables exist in the validation project (`supabase db push` is blocked on validation by Phase-0 history divergence — apply surgically per `feedback_validation_project_migration_mechanism`).

**Steps:**

- [ ] **1. Confirm the parity gate is RED first** — `pnpm vitest run tests/db/validation-schema-parity.test.ts`. Expected (before this task): Layer 1 fails with `Committed ...schema-manifest.json is STALE — it is missing public table(s) ...: sync_holds, show_change_log` (the migrations create tables not yet in the committed manifest). This is the failing-first signal.

- [ ] **2. Regenerate the manifest from the local all-migrations-applied stack** — `pnpm gen:schema-manifest`. This introspects the local DB (where Tasks 1.1/1.2 already applied both migrations) and rewrites `supabase/__generated__/schema-manifest.json` to include `sync_holds` + `show_change_log` with their columns.

- [ ] **3. Apply both migrations to the validation project** (Layer 2 target) — run against `"$TEST_DATABASE_URL"` (the validation session-pooler URL), then reload PostgREST:

```bash
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260608000000_sync_holds.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260608000001_show_change_log.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c "notify pgrst, 'reload schema';"
```

> If `supabase db query --linked` is the available mechanism instead of a direct pooler `psql` (per `feedback_validation_project_migration_mechanism`), apply each migration's body through it surgically. Both migrations are idempotent (`create table if not exists` + DROP/ADD CHECKs + idempotent REVOKE/RLS), so a re-apply is safe.

- [ ] **4. Run the parity gate — passes** — `TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm vitest run tests/db/validation-schema-parity.test.ts`. Expected: Layer 1 (manifest now lists both tables), Layer 2 (validation is a superset — both tables present live), Layer 3 (skipped under `TEST_DATABASE_URL`, or — unset locally — committed manifest == fresh local introspection) all green. Also re-run `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` with the validation `SUPABASE_TEST_*` vars set to confirm Layers 2+3 fire against validation too.

- [ ] **5. Commit** — `feat(db): regen schema manifest + apply sync_holds/show_change_log to validation project`.

---

## Task 1.6 — Phase 1 self-review

**Steps (no code; a checklist sweep, then commit a notes file only if findings are deferred):**

- [ ] **1. DDL parity sweep** — diff the two migrations character-by-character against `00-overview.md` lines 31–69. Every column name/type, CHECK value set, unique tuple, and index spec must match. Grep both migrations for each contract column name; confirm no extra/missing columns vs the `information_schema` assertions in 1.1/1.2.
- [ ] **2. Idempotency sweep** — re-apply both migrations to the local stack a SECOND time; confirm no error (CHECK DROP-IF-EXISTS+ADD, `create table if not exists`, `create index if not exists`, REVOKE, `enable row level security`, `grant ... to service_role` all idempotent).
- [ ] **3. Lockdown completeness** — confirm both tables appear in `RPC_GATED_TABLES` with `selectAnon:false`/`selectAuthenticated:false`; confirm `service_role` retains ALL (Layer 1). Confirm Layer 4 registry↔live-REVOKE parity is green.
- [ ] **4. Anti-tautology confirm** — re-run the read-lockdown's "privileged CAN read" case; confirm it sees `SECRET_EMAIL` (proves the rows exist and the deny is real, not vacuous).
- [ ] **5. Numeric/value sweep** — confirm the CHECK value sets exactly match the spec enums: `domain ∈ {crew_email, crew_identity}`, `kind ∈ {mi11_pending, undo_override}`, `source ∈ {auto_apply, mi11_approve, mi11_reject, undo}`, `status ∈ {applied, pending, rejected, undone}`. No stale/extra value.
- [ ] **6. Citation pass** — confirm the two `closed_at` line citations in `RPC_GATED_TABLES` point at the actual `revoke all on table ...` lines (`grep -n`).

---

## Task 1.7 — Phase 1 adversarial review (cross-model)

> **Placeholder — runs AFTER Phase 1 self-review (Task 1.6) completes.** Invoke the cross-model adversarial review of the Phase-1 diff (the two migrations + the three test files + the manifest regen). Implementer is Codex → reviewer is Opus-side (the `adversarial-review` skill / `/codex` companion across the harness boundary, per `00-overview.md` "Per-phase the cross-model adversarial review pairs across the harness boundary"). Reviewer is REVIEWER ONLY — surfaces findings, does not fix. Iterate until APPROVE; only escalate genuine ambiguity to the orchestrator. Do not mark Phase 1 closed (or hand off to Phase 2) without this step.

**Pre-loaded do-not-relitigate (cite to the reviewer):**
- `change_kind` is intentionally an open-ended `length > 0` CHECK, not an enum (spec §6.1: "invariant code (`MI-12`, …) or structural") — by design, not a missing constraint.
- No anon/authenticated RLS *policy* is intentional: deny-by-default + service-role-bypass is the admin-only posture, mirroring `email_deliveries` (`supabase/migrations/20260602000004_b3_email_deliveries.sql:20-23`). Not a missing policy.
- `before_image`/`after_image`/`held_value`/`proposed_value` are nullable-or-`jsonb`-not-null per the contract; their *write*-path semantics are Phase 2–5 scope, out of Phase 1.
- Migrations are surgically applied to validation (not `supabase db push`) by Phase-0 history divergence (`feedback_validation_project_migration_mechanism`) — intentional, not a process gap.
