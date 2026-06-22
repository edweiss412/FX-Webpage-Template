/**
 * Phase 2 Task 2.2 — writeMi11Holds: persist one mi11_pending hold per distinct
 * MI-11 crew via service-role SQL inside the show lock.
 *
 * DB-backed (TEST_DATABASE_URL / local Supabase). Assertions read the DB rows,
 * never the input array (anti-tautology). $N::jsonb params receive raw objects.
 */
import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { writeMi11Holds } from "@/lib/sync/holds/writeMi11Holds";

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

async function seedShow(tx: Sql): Promise<{ showId: string; driveFileId: string }> {
  const driveFileId = `drv-${randomUUID()}`;
  const slug = `sh-${randomUUID().slice(0, 8)}`;
  const [row] = await tx`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${driveFileId}, ${slug}, 'T', 'c', 'v')
    returning id
  `;
  return { showId: row!.id as string, driveFileId };
}

// The tx port writeMi11Holds expects: a thin unsafe(sql, params) wrapper over the locked txn.
function makeTx(tx: Sql) {
  return {
    async unsafe(query: string, params: unknown[]): Promise<unknown[]> {
      return (await tx.unsafe(query, params as never)) as unknown[];
    },
  };
}

function liveCrew(name: string, email: string | null) {
  return {
    name,
    email,
    phone: "555-0000",
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
  };
}

describe("writeMi11Holds (Task 2.2)", () => {
  const baseModifiedTime = "2026-06-08T12:00:00.000Z";

  it("writes one mi11_pending hold per distinct MI-11 crew", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const liveCrewByName = new Map([
        ["Alice", liveCrew("Alice", "a@old")],
        ["Bob", liveCrew("Bob", "b@old")],
      ]);
      await writeMi11Holds(makeTx(tx), {
        showId,
        driveFileId,
        mi11Items: [
          {
            id: "1",
            invariant: "MI-11",
            crew_name: "Alice",
            prior_email: "a@old",
            new_email: "a@new",
          },
          {
            id: "2",
            invariant: "MI-11",
            crew_name: "Bob",
            prior_email: "b@old",
            new_email: "b@new",
          },
        ],
        liveCrewByName,
        baseModifiedTime,
      });

      const rows = await tx<
        { entity_key: string; kind: string; domain: string; created_by: string }[]
      >`
        select entity_key, kind, domain, created_by from public.sync_holds
        where show_id = ${showId} order by entity_key
      `;
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.entity_key)).toEqual(["Alice", "Bob"]);
      expect(rows.every((r) => r.kind === "mi11_pending")).toBe(true);
      expect(rows.every((r) => r.domain === "crew_email")).toBe(true);
      expect(rows.every((r) => r.created_by === "system")).toBe(true);
    });
  });

  it("held_value carries the prior LIVE crew row (old email + name + non-identity fields)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const liveCrewByName = new Map([["Alice", liveCrew("Alice", "a@old")]]);
      await writeMi11Holds(makeTx(tx), {
        showId,
        driveFileId,
        mi11Items: [
          {
            id: "1",
            invariant: "MI-11",
            crew_name: "Alice",
            prior_email: "a@old",
            new_email: "a@new",
          },
        ],
        liveCrewByName,
        baseModifiedTime,
      });
      const [row] = await tx<{ held_email: string; held_name: string; held_phone: string }[]>`
        select held_value->>'email' as held_email,
               held_value->>'name'  as held_name,
               held_value->>'phone' as held_phone
        from public.sync_holds where show_id = ${showId} and entity_key = 'Alice'
      `;
      expect(row!.held_email).toBe("a@old");
      expect(row!.held_name).toBe("Alice");
      expect(row!.held_phone).toBe("555-0000");
    });
  });

  it("proposed_value is the email_change disposition with the sheet's NEW email + base_modified_time", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const liveCrewByName = new Map([["Alice", liveCrew("Alice", "a@old")]]);
      await writeMi11Holds(makeTx(tx), {
        showId,
        driveFileId,
        mi11Items: [
          {
            id: "1",
            invariant: "MI-11",
            crew_name: "Alice",
            prior_email: "a@old",
            new_email: "a@new",
          },
        ],
        liveCrewByName,
        baseModifiedTime,
      });
      const [row] = await tx<{ proposed: unknown; disposition: string; base: string }[]>`
        select proposed_value as proposed,
               proposed_value->>'disposition' as disposition,
               base_modified_time as base
        from public.sync_holds where show_id = ${showId} and entity_key = 'Alice'
      `;
      // disposition reads back as a STRING scalar (proves $::jsonb got a raw object, not a stringified scalar)
      expect(row!.disposition).toBe("email_change");
      expect(row!.proposed).toEqual({ disposition: "email_change", name: "Alice", email: "a@new" });
      expect(new Date(row!.base as unknown as string).toISOString()).toBe(baseModifiedTime);
    });
  });

  it("re-detecting the same crew updates in place, never duplicates", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const liveCrewByName = new Map([["Alice", liveCrew("Alice", "a@old")]]);
      const port = makeTx(tx);
      await writeMi11Holds(port, {
        showId,
        driveFileId,
        mi11Items: [
          {
            id: "1",
            invariant: "MI-11",
            crew_name: "Alice",
            prior_email: "a@old",
            new_email: "a@new",
          },
        ],
        liveCrewByName,
        baseModifiedTime,
      });
      const secondModifiedTime = "2026-06-08T13:00:00.000Z";
      await writeMi11Holds(port, {
        showId,
        driveFileId,
        mi11Items: [
          {
            id: "2",
            invariant: "MI-11",
            crew_name: "Alice",
            prior_email: "a@old",
            new_email: "a@newer",
          },
        ],
        liveCrewByName,
        baseModifiedTime: secondModifiedTime,
      });
      const rows = await tx<{ email: string; base: string }[]>`
        select proposed_value->>'email' as email, base_modified_time as base
        from public.sync_holds where show_id = ${showId} and entity_key = 'Alice'
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.email).toBe("a@newer");
      expect(new Date(rows[0]!.base as unknown as string).toISOString()).toBe(secondModifiedTime);
    });
  });

  it("null new email is held as a null-email disposition", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const liveCrewByName = new Map([["Alice", liveCrew("Alice", "a@old")]]);
      await writeMi11Holds(makeTx(tx), {
        showId,
        driveFileId,
        mi11Items: [
          {
            id: "1",
            invariant: "MI-11",
            crew_name: "Alice",
            prior_email: "a@old",
            new_email: null,
          },
        ],
        liveCrewByName,
        baseModifiedTime,
      });
      const [row] = await tx<{ proposed: unknown }[]>`
        select proposed_value as proposed from public.sync_holds
        where show_id = ${showId} and entity_key = 'Alice'
      `;
      expect(row!.proposed).toEqual({ disposition: "email_change", name: "Alice", email: null });
    });
  });

  it("P2-F5 — re-detection against a terminal undo_override hold does NOT overwrite it (or throw)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      // Seed a terminal crew_email undo_override (e.g. a Phase-3 reject): proposed_value NULL + baseline.
      await tx.unsafe(
        `insert into public.sync_holds
           (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
         values ($1,$2,'crew_email','Alice',$3::jsonb,'undo_override','admin@x')`,
        [
          showId,
          driveFileId,
          { name: "Alice", email: "a@old", baseline: { email: "a@old" } },
        ] as never,
      );

      // Next sync: the rejected email still on the sheet → MI-11 re-detects for Alice. The
      // unconditional upsert would try to set a non-null proposed_value on the undo_override row →
      // sync_holds_kind_shape_chk violation. The conditional upsert must SKIP it instead.
      await expect(
        writeMi11Holds(makeTx(tx), {
          showId,
          driveFileId,
          mi11Items: [
            {
              id: "1",
              invariant: "MI-11",
              crew_name: "Alice",
              prior_email: "a@old",
              new_email: "a@new",
            },
          ],
          liveCrewByName: new Map([["Alice", liveCrew("Alice", "a@old")]]),
          baseModifiedTime,
        }),
      ).resolves.toBeUndefined(); // (a) no throw / no shape-CHECK violation

      // (b) the undo_override row remains valid + intact.
      const [row] = await tx<{ kind: string; proposed: unknown; baseline: unknown }[]>`
        select kind, proposed_value as proposed, held_value->'baseline' as baseline
        from public.sync_holds where show_id = ${showId} and entity_key = 'Alice'
      `;
      expect(row!.kind).toBe("undo_override");
      expect(row!.proposed).toBeNull();
      expect(row!.baseline).toEqual({ email: "a@old" });

      // Exactly one row for Alice (the INSERT was a no-op on conflict).
      const [countRow] = await tx<{ count: number }[]>`
        select count(*)::int as count from public.sync_holds where show_id = ${showId} and entity_key = 'Alice'
      `;
      expect(countRow!.count).toBe(1);
    });
  });
});
