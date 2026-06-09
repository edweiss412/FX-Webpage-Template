/**
 * Phase 1 Task 1.1 — public.sync_holds DDL.
 *
 * Pins the contract columns, CHECK constraints, unique entity tuple, show index,
 * and reservation_collisions default from 00-overview.md shared contracts.
 */
import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

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

// Assert an insert rejects with a constraint pattern WITHOUT aborting the enclosing
// transaction. Postgres aborts the whole txn on the first constraint violation, so each
// expected-failure insert runs inside its own savepoint that rolls back on error — letting
// sibling assertions in the same inRollback txn still target their specific constraint name.
async function expectRejectInSavepoint(
  tx: Sql,
  pattern: RegExp,
  run: (sp: Sql) => Promise<unknown>,
): Promise<void> {
  const SP_ROLLBACK = Symbol("sp-rollback");
  let caught: unknown;
  try {
    await tx.savepoint(async (sp) => {
      try {
        await run(sp as unknown as Sql);
      } catch (err) {
        caught = err;
      }
      // Always roll the savepoint back so the txn stays usable for the next assertion.
      throw SP_ROLLBACK;
    });
  } catch (err) {
    if (err !== SP_ROLLBACK) throw err;
  }
  expect(String((caught as Error | undefined)?.message ?? "")).toMatch(pattern);
}

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
      "reservation_collisions",
      "show_id",
    ]);
  });

  it("the reservation_collisions column is jsonb NOT NULL defaulting to an empty array", async () => {
    const cols = await sql<
      { data_type: string; is_nullable: string; column_default: string | null }[]
    >`
      select data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'sync_holds'
        and column_name = 'reservation_collisions'
    `;
    expect(cols).toHaveLength(1);
    expect(cols[0].data_type).toBe("jsonb");
    expect(cols[0].is_nullable).toBe("NO");
    expect(cols[0].column_default).toMatch(/'\[\]'::jsonb/);
  });

  it("a hold inserted without reservation_collisions reads back [] (not NULL)", async () => {
    await inRollback(async (tx) => {
      const showId = await seedShow(tx);
      const [row] = await tx`
        insert into public.sync_holds
          (show_id, drive_file_id, domain, entity_key, held_value,
           proposed_value, base_modified_time, kind, created_by)
        values (${showId}, 'drv', 'crew_email', 'Alice',
                ${tx.json({ email: "a@old", name: "Alice" })},
                ${tx.json({ disposition: "email_change", name: "Alice", email: "a@new" })},
                now(), 'mi11_pending', 'system')
        returning reservation_collisions
      `;
      expect(row.reservation_collisions).toEqual([]);
    });
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

      await expectRejectInSavepoint(
        tx,
        /sync_holds_domain_chk/,
        (sp) => sp`insert into public.sync_holds
             (show_id, drive_file_id, domain, entity_key, held_value,
              proposed_value, base_modified_time, kind, created_by)
           values (${showId}, 'drv', 'NOT_A_DOMAIN', 'Bob',
                   ${sp.json({ email: "b@old", name: "Bob" })},
                   ${sp.json({ disposition: "email_change", name: "Bob", email: "b@new" })},
                   now(), 'mi11_pending', 'system')`,
      );

      await expectRejectInSavepoint(
        tx,
        /sync_holds_kind_chk|sync_holds_kind_shape_chk/,
        (sp) => sp`insert into public.sync_holds
             (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
           values (${showId}, 'drv', 'crew_email', 'Carol',
                   ${sp.json({ email: "c@old", name: "Carol" })}, 'NOT_A_KIND', 'system')`,
      );
    });
  });

  it("enforces UNIQUE (show_id, domain, entity_key)", async () => {
    await inRollback(async (tx) => {
      const showId = await seedShow(tx);
      const ins = (key: string) => tx`
        insert into public.sync_holds
          (show_id, drive_file_id, domain, entity_key, held_value,
           proposed_value, base_modified_time, kind, created_by)
        values (${showId}, 'drv', 'crew_email', ${key},
                ${tx.json({ email: "a@old", name: key })},
                ${tx.json({ disposition: "email_change", name: key, email: "a@new" })},
                now(), 'mi11_pending', 'system')
      `;
      await ins("Alice");
      await expect(ins("Alice")).rejects.toThrow(/sync_holds_uniq/);
    });
  });

  it("the shape CHECK rejects malformed pending holds and accepts valid ones (PF41)", async () => {
    await inRollback(async (tx) => {
      const showId = await seedShow(tx);

      await expectRejectInSavepoint(
        tx,
        /sync_holds_kind_shape_chk/,
        (sp) => sp`insert into public.sync_holds
             (show_id, drive_file_id, domain, entity_key, held_value,
              base_modified_time, kind, created_by)
           values (${showId}, 'drv', 'crew_email', 'NoProposed',
                   ${sp.json({ email: "a@old", name: "NoProposed" })},
                   now(), 'mi11_pending', 'system')`,
      );

      await expectRejectInSavepoint(
        tx,
        /sync_holds_kind_shape_chk/,
        (sp) => sp`insert into public.sync_holds
             (show_id, drive_file_id, domain, entity_key, held_value,
              proposed_value, kind, created_by)
           values (${showId}, 'drv', 'crew_email', 'NoAnchor',
                   ${sp.json({ email: "a@old", name: "NoAnchor" })},
                   ${sp.json({ disposition: "email_change", name: "NoAnchor", email: "a@new" })},
                   'mi11_pending', 'system')`,
      );

      await expectRejectInSavepoint(
        tx,
        /sync_holds_kind_shape_chk/,
        (sp) => sp`insert into public.sync_holds
             (show_id, drive_file_id, domain, entity_key, held_value,
              proposed_value, base_modified_time, kind, created_by)
           values (${showId}, 'drv', 'crew_email', 'BadDisp',
                   ${sp.json({ email: "a@old", name: "BadDisp" })},
                   ${sp.json({ disposition: "bogus", name: "BadDisp", email: "a@new" })},
                   now(), 'mi11_pending', 'system')`,
      );

      await expectRejectInSavepoint(
        tx,
        /sync_holds_kind_shape_chk/,
        (sp) => sp`insert into public.sync_holds
             (show_id, drive_file_id, domain, entity_key, held_value,
              proposed_value, kind, created_by)
           values (${showId}, 'drv', 'crew_email', 'UndoWithProposed',
                   ${sp.json({ baseline: { email: "a@old", name: "UndoWithProposed" } })},
                   ${sp.json({ disposition: "email_change" })}, 'undo_override', 'system')`,
      );

      const okPending = await tx`
        insert into public.sync_holds
          (show_id, drive_file_id, domain, entity_key, held_value,
           proposed_value, base_modified_time, kind, created_by)
        values (${showId}, 'drv', 'crew_email', 'ValidPending',
                ${tx.json({ email: "a@old", name: "Alice" })},
                ${tx.json({ disposition: "email_change", name: "Alice", email: "a@new" })},
                now(), 'mi11_pending', 'system')
        returning id
      `;
      expect(okPending.count).toBe(1);

      const okUndo = await tx`
        insert into public.sync_holds
          (show_id, drive_file_id, domain, entity_key, held_value,
           kind, created_by)
        values (${showId}, 'drv', 'crew_email', 'ValidUndo',
                ${tx.json({ baseline: { email: "a@old", name: "ValidUndo" } })},
                'undo_override', 'system')
        returning id
      `;
      expect(okUndo.count).toBe(1);
    });
  });
});
