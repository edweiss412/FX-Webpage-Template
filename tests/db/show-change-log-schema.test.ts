/**
 * tests/db/show-change-log-schema.test.ts (Phase 1 Task 1.2)
 *
 * Pins public.show_change_log DDL: columns, feed index (show_id, occurred_at desc),
 * source/status/change_kind CHECKs, and the undo_of self-FK. Real DB; ROLLBACK'd.
 */
import { randomUUID } from "node:crypto";

import postgres, { type Sql, type TransactionSql } from "postgres";
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
async function seedShow(tx: Sql): Promise<string> {
  const slug = `sh-${randomUUID().slice(0, 8)}`;
  const [row] = await tx`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${`drv-${randomUUID()}`}, ${slug}, 'T', 'c', 'v') returning id
  `;
  return row!.id as string;
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
  return row!.id as string;
}

// Assert an insert rejects with a constraint pattern WITHOUT aborting the enclosing
// transaction (each violating insert runs inside its own savepoint; see Task 1.1).
async function expectRejectInSavepoint(
  tx: Sql,
  pattern: RegExp,
  run: (sp: Sql) => Promise<unknown>,
): Promise<void> {
  const SP_ROLLBACK = Symbol("sp-rollback");
  let caught: unknown;
  try {
    // `savepoint` lives on TransactionSql; `tx` is the in-transaction handle (cast to Sql
    // by the inRollback wrapper), so reach it through a TransactionSql view.
    await (tx as unknown as TransactionSql).savepoint(async (sp) => {
      try {
        await run(sp as unknown as Sql);
      } catch (err) {
        caught = err;
      }
      throw SP_ROLLBACK;
    });
  } catch (err) {
    if (err !== SP_ROLLBACK) throw err;
  }
  expect(String((caught as Error | undefined)?.message ?? "")).toMatch(pattern);
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
      "created_by",
      "drive_file_id",
      "entity_ref",
      "id",
      "individually_undoable",
      "occurred_at",
      "show_id",
      "source",
      "status",
      "summary",
      "undo_of",
    ]);
  });

  it("individually_undoable is boolean NOT NULL defaulting to true (P4-F4)", async () => {
    const cols = await sql<
      { data_type: string; is_nullable: string; column_default: string | null }[]
    >`
      select data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'show_change_log'
        and column_name = 'individually_undoable'
    `;
    expect(cols).toHaveLength(1);
    expect(cols[0]!.data_type).toBe("boolean");
    expect(cols[0]!.is_nullable).toBe("NO");
    expect(cols[0]!.column_default).toMatch(/true/);
  });

  it("created_by is text NOT NULL defaulting to 'system' (PF7)", async () => {
    const cols = await sql<
      { data_type: string; is_nullable: string; column_default: string | null }[]
    >`
      select data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'show_change_log'
        and column_name = 'created_by'
    `;
    expect(cols).toHaveLength(1);
    expect(cols[0]!.data_type).toBe("text");
    expect(cols[0]!.is_nullable).toBe("NO");
    expect(cols[0]!.column_default).toMatch(/'system'::text/);
  });

  it("the feed index (show_id, occurred_at desc) exists", async () => {
    const [row] = await sql<{ count: number }[]>`
      select count(*)::int as count from pg_indexes
      where schemaname = 'public' and tablename = 'show_change_log'
        and indexname = 'show_change_log_feed_idx'
    `;
    expect(row!.count).toBe(1);
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

  it("accepts every contract status value incl. superseded", async () => {
    await inRollback(async (tx) => {
      const showId = await seedShow(tx);
      for (const status of ["applied", "pending", "rejected", "undone", "superseded"]) {
        const id = await insertLog(tx, showId, {
          source: "auto_apply",
          change_kind: "crew_added",
          status,
        });
        expect(id).toBeTruthy();
      }
    });
  });

  it("rejects a bad source / status", async () => {
    await inRollback(async (tx) => {
      const showId = await seedShow(tx);
      await expectRejectInSavepoint(tx, /show_change_log_source_chk/, (sp) =>
        insertLog(sp, showId, { source: "NOPE", change_kind: "crew_added", status: "applied" }),
      );
      await expectRejectInSavepoint(tx, /show_change_log_status_chk/, (sp) =>
        insertLog(sp, showId, { source: "auto_apply", change_kind: "crew_added", status: "NOPE" }),
      );
    });
  });

  it("rejects an empty change_kind (length>0 guard)", async () => {
    await inRollback(async (tx) => {
      const showId = await seedShow(tx);
      await expectRejectInSavepoint(tx, /show_change_log_change_kind_chk/, (sp) =>
        insertLog(sp, showId, { source: "auto_apply", change_kind: "", status: "applied" }),
      );
    });
  });
});
