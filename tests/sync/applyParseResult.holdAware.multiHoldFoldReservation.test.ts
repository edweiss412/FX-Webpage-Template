/**
 * WM-F1 (whole-milestone cross-hold integration) — fold-consumed tracking must be PER-HOLD.
 *
 * The single-phase 2.5/2.7 tests only ever exercise ONE hold, so they never caught that
 * `foldConsumedNames` was a single GLOBAL set: a name consumed by hold A's rename fold was skipped
 * when computing EVERY hold's reservations. The integration bug: in one sync, hold A folds a rename
 * to target name N (consumes N), and a DIFFERENT hold B's proposed identity reserves name N. With a
 * global set, B's collision on N is silently dropped → B's reservation_collisions stays empty →
 * Phase-3 Approve does NOT reject B with IDENTITY_WOULD_COLLIDE → approving B can mutate into hold
 * A's pending target, stranding/misapplying A's gate.
 *
 * Fix: per-hold fold-consumed tracking (Map<holdId, Set<name>>). A name consumed by hold A's fold is
 * still a valid reservation_collision for hold B (a different entity); the P2-F1 single-hold behavior
 * (a hold's own folded target excluded from ITS OWN reservation_collisions) is preserved exactly.
 *
 * DB-backed; assertions read the DB hold rows + the approve RPC (anti-tautology).
 */
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { applyParseResult } from "@/lib/sync/applyParseResult";
import { writeMi11Holds } from "@/lib/sync/holds/writeMi11Holds";

import { callApprove } from "../db/_mi11Helpers";
import {
  applyTx,
  crew,
  holdPort,
  parseResult,
  prevMember,
  readHolds,
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

const MT = "2026-06-08T12:00:00.000Z";
const MT2 = "2026-06-08T13:00:00.000Z";

/**
 * Seed TWO open mi11_pending holds in the SAME show:
 *   Hold A (entity_key "Alice"): held a@old. In the apply below, the sheet drops Alice and adds a
 *     row "Alicia"/a@new whose email matches A's new email → A folds into proposed_value=rename with
 *     target NAME "Alicia" (the parse row "Alicia" is consumed by A's OWN fold).
 *   Hold B (entity_key "Bob"): seeded directly with proposed_value reserving the SAME target NAME
 *     "Alicia" (a folded-rename target from a prior sync). Bob's sheet row keeps the reserved email
 *     so B neither reconciles back to its held email nor re-targets — proposed_value stays stable
 *     and the RESERVED name "Alicia" is the thing under test.
 *
 * Because the parse row "Alicia" is consumed by A's fold, the OLD global set skipped "Alicia" for B
 * too → B's collision is dropped. The per-hold fix records it for B (a different entity) while still
 * excluding it from A's OWN reservation_collisions.
 */
async function setupTwoHolds(tx: Sql) {
  const { showId, driveFileId } = await seedShow(tx);

  // Hold A — held Alice a@old → a@new (the fold-target producer).
  const aliceLive = crew("Alice", { email: "a@old" });
  const aliceRow = await seedCrew(tx, showId, aliceLive);
  await writeMi11Holds(holdPort(tx), {
    showId,
    driveFileId,
    mi11Items: [
      { id: "1", invariant: "MI-11", crew_name: "Alice", prior_email: "a@old", new_email: "a@new" },
    ],
    liveCrewByName: new Map([["Alice", aliceLive]]),
    baseModifiedTime: MT,
  });

  // Hold B — held Bob bob@old; proposed_value reserves NAME "Alicia" (collides with A's fold target).
  const bobLive = crew("Bob", { email: "bob@old" });
  const bobRow = await seedCrew(tx, showId, bobLive);
  await tx.unsafe(
    `insert into public.sync_holds
       (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by)
     values ($1,$2,'crew_email','Bob',$3::jsonb,$4::jsonb,$5::timestamptz,'mi11_pending','system')`,
    [
      showId,
      driveFileId,
      { name: "Bob", email: "bob@old" },
      { disposition: "rename", name: "Alicia", email: "bob-x@new" },
      MT,
    ] as never,
  );

  return { showId, driveFileId, aliceLive, aliceRow, bobLive, bobRow };
}

describe("hold-aware apply — cross-hold fold/reservation isolation (WM-F1)", () => {
  it("a name consumed by hold A's fold is STILL recorded as hold B's reservation collision; A's own collisions stay empty", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow, bobLive, bobRow } =
        await setupTwoHolds(tx);

      // Sheet: drop Alice + add "Alicia"/a@new (folds into A's rename); keep Bob at his reserved
      // email so hold B neither reconciles nor re-targets and its reserved NAME "Alicia" is live.
      const next = parseResult([
        crew("Alicia", { email: "a@new" }),
        crew("Bob", { email: "bob-x@new" }),
      ]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [
          prevMember(aliceRow, aliceLive),
          prevMember(bobRow, bobLive),
        ]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const holds = await readHolds(tx, showId); // ordered by entity_key → [Alice (A), Bob (B)]
      const holdA = holds.find((h) => h.entity_key === "Alice")!;
      const holdB = holds.find((h) => h.entity_key === "Bob")!;

      // Derive the expected collision from the seeded fixture (anti-tautology): B reserves NAME
      // "Alicia"; the live parse row carrying that name is Alicia/a@new.
      const expectedName = (holdB.proposed_value as { name: string }).name; // "Alicia"
      const aliciaRow = next.crewMembers.find((m) => m.name === expectedName)!;

      // (a) Hold B DOES record the collision on the name A's fold consumed (different entity for B).
      expect(holdB.reservation_collisions).toEqual([
        { name: aliciaRow.name, email: aliciaRow.email },
      ]);

      // (b) Hold A's OWN reservation_collisions are unaffected by its OWN fold (P2-F1 preserved):
      //     A folded "Alicia" as its own rename target, so A must NOT record it as a collision.
      expect(holdA.proposed_value).toEqual({
        disposition: "rename",
        name: "Alicia",
        email: "a@new",
      });
      expect(holdA.reservation_collisions).toEqual([]);

      // (c) Stronger: Phase-3 Approve of hold B is BLOCKED with IDENTITY_WOULD_COLLIDE because B's
      //     reservation_collisions is non-empty (the gate the per-hold fix re-arms). mi11_approve_hold
      //     is admin-only (is_admin() reads request.jwt.claims), so set the admin claims for this call.
      const adminClaims = JSON.stringify({
        sub: "00000000-0000-0000-0000-000000000020",
        email: "dlarson@fxav.net",
        app_metadata: { role: "admin" },
      });
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${adminClaims}, true)`;
      // observed == expectedBase == the hold's OWN post-apply base, so the staleness pair (lines
      // 278/281) passes and approve reaches the reservation_collisions gate (line 285) — the gate
      // WM-F1 re-arms. (Matches the canonical mi11_approve_hold.test.ts call shape.)
      // tx is a real transaction (sql.begin callback arg), surfaced as Sql via inRollback's cast.
      const approve = await callApprove(
        tx as unknown as TransactionSql,
        holdB.id,
        holdB.base_modified_time!,
        holdB.base_modified_time!,
      );
      expect(approve.ok).toBe(false);
      expect(approve.code).toBe("IDENTITY_WOULD_COLLIDE");
    });
  });
});
