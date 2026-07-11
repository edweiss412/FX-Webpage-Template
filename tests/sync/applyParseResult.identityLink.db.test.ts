/**
 * BL-CREW-RENAME-SILENT-REPLACEMENT spec §3.4 — real-Postgres pins for the identity-preserving
 * rename, against the PRODUCTION tx (makeSyncPipelineTx), not a SQL copy (anti-tautology).
 *
 * Why direct method tests: a sync-produced identity-link pair's addedName is next-minus-prior by
 * construction, so a target-name collision is UNREACHABLE through the pipeline; the NOT EXISTS
 * guard in renameCrewMember is defensive and must be pinned at the method level. Plus the single
 * home of the held-name skip guard (real hold port → heldNames → no rename behind a hold).
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { applyParseResult } from "@/lib/sync/applyParseResult";
import { makeSyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

import {
  applyTx,
  crew,
  holdPort,
  parseResult,
  prevMember,
  readCrew,
  seedCrew,
  seedShow,
  snapshot,
} from "./_holdAwareTestkit";

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

describe("renameCrewMember (production tx) — guarded in-place rename", () => {
  it("renames in place preserving id", async () => {
    await inRollback(async (tx) => {
      const { showId } = await seedShow(tx);
      const seeded = await seedCrew(tx, showId, crew("Jon"));
      await makeSyncPipelineTx(tx as never).renameCrewMember(showId, "Jon", "John");
      const rows = await readCrew(tx, showId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe("John");
      expect(rows[0]!.id).toBe(seeded.id); // the assertion delete+insert cannot pass
    });
  });

  it("no-ops on target-name collision (no unique violation)", async () => {
    await inRollback(async (tx) => {
      const { showId } = await seedShow(tx);
      const jon = await seedCrew(tx, showId, crew("Jon"));
      const john = await seedCrew(tx, showId, crew("John"));
      await makeSyncPipelineTx(tx as never).renameCrewMember(showId, "Jon", "John"); // must not throw
      const rows = await readCrew(tx, showId);
      expect(rows.map((r) => [r.name, r.id]).sort()).toEqual(
        [
          ["John", john.id],
          ["Jon", jon.id],
        ].sort(),
      );
    });
  });

  it("no-ops when source row missing", async () => {
    await inRollback(async (tx) => {
      const { showId } = await seedShow(tx);
      const seeded = await seedCrew(tx, showId, crew("Solo"));
      await makeSyncPipelineTx(tx as never).renameCrewMember(showId, "Ghost", "Anyone");
      const rows = await readCrew(tx, showId);
      expect(rows.map((r) => [r.name, r.id])).toEqual([["Solo", seeded.id]]);
    });
  });
});

describe("identity-link apply — held-name skip guard (single home)", () => {
  it("held removedName: linked pair is skipped, row keeps original name and id", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const jon = crew("Jon");
      const seeded = await seedCrew(tx, showId, jon);
      // Open crew_email hold on "Jon" (mi11_pending shape used by sibling hold-aware tests) →
      // the hold plan puts "Jon" in heldNames; the identity-link loop must skip the pair.
      await tx.unsafe(
        `insert into public.sync_holds
           (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by)
         values ($1,$2,'crew_email','Jon',$3::jsonb,$4::jsonb,$5::timestamptz,'mi11_pending','system')`,
        [
          showId,
          driveFileId,
          { name: "Jon", email: jon.email },
          { disposition: "email_change", name: "Jon", email: "jon-new@example.com" },
          "2026-06-10T12:00:00.000Z",
        ] as never,
      );
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("John")]),
        snapshot: snapshot(showId, [prevMember(seeded, jon)]),
        holds: { port: holdPort(tx), baseModifiedTime: "2026-06-10T12:00:00.000Z" },
        identityLinkRenames: [{ removedName: "Jon", addedName: "John" }],
      });
      const rows = await readCrew(tx, showId);
      const jonRow = rows.find((r) => r.id === seeded.id);
      expect(jonRow).toBeDefined();
      expect(jonRow!.name).toBe("Jon"); // no rename fired behind the hold
    });
  });
});
