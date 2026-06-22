/**
 * STRUCTURAL class-guard (WM-F4) — "suppression deletes a pre-existing live owner" has now recurred
 * THREE times (P2-F4 reservation, WM-F3 rename-fold, WM-F4 reject→undo_override rename). This test
 * pins the WHOLE class: for EVERY suppression path that can add a name/email belonging to a DIFFERENT
 * entity to suppressedNames/suppressedEmails, a PRE-EXISTING live crew member whose name/email is the
 * collision target MUST survive the apply (NOT be deleted by deleteCrewMembersNotIn).
 *
 * Paths exercised (one row per suppression path that targets a different-entity name/email):
 *   - mi11_pending rename-fold  (WM-F3)  — fold target IS a live owner
 *   - reject → undo_override rename (WM-F4) — suppressed_added IS a live owner, incl. SAME-email case
 *   - reservation (P2-F4)        — reserved-name collision IS a live owner
 *
 * Anti-tautology: each case DERIVES the live owner from a seeded crew_members row; the assertion reads
 * crew_members back, not the in-memory plan. Negative regression: revert the guard in each path and the
 * corresponding live owner is deleted (red) — see the per-case comment naming the guard line.
 *
 * The undo-of-ADD tombstone path is deliberately NOT in this class: it self-suppresses the entity's
 * OWN added row (no different-entity live owner), so it has no live-owner-deletion failure mode. A
 * positive control asserts that legitimate self-suppression still works.
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { applyParseResult } from "@/lib/sync/applyParseResult";
import { writeMi11Holds } from "@/lib/sync/holds/writeMi11Holds";

import {
  applyTx,
  crew,
  holdPort,
  parseResult,
  prevMember,
  readCrew,
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

async function seedUndoOverride(
  tx: Sql,
  showId: string,
  driveFileId: string,
  domain: "crew_email" | "crew_identity",
  entityKey: string,
  heldValue: Record<string, unknown>,
) {
  await tx.unsafe(
    `insert into public.sync_holds
       (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
     values ($1,$2,$3,$4,$5::jsonb,'undo_override','admin@x')`,
    [showId, driveFileId, domain, entityKey, heldValue] as never,
  );
}

describe("hold-aware apply — a pre-existing live owner is NEVER deleted by any suppression path (WM-F4 class)", () => {
  // -------- WM-F4: reject → undo_override rename, SAME-email Bob case (the prompt's exact repro) --------
  // Guard under test: holdAwareApply.ts applyUndoOverrideToMaps rename branch
  // `!maps.previousCrewNames.has(sa.name)`. Revert → Bob is suppressed → DELETED (red).
  it("reject→undo_override rename: suppressed_added name belongs to a live Bob (same email) → Bob STAYS", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      // Prior live roster: Alice(a@old) + an INDEPENDENT Bob who happens to carry a@new.
      const aliceLive = crew("Alice", { email: "a@old" });
      const bobLive = crew("Bob", { email: "a@new" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      const bobRow = await seedCrew(tx, showId, bobLive);
      // The reject of Alice's folded rename produced an undo_override whose baseline.suppressed_added
      // is the fold target = {Bob, a@new} (Bob carried Alice's proposed email).
      await seedUndoOverride(tx, showId, driveFileId, "crew_identity", "Alice", {
        name: "Alice",
        email: "a@old",
        phone: "555-OLD",
        role: "A1",
        role_flags: ["A1"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
        baseline: { kind: "rename", suppressed_added: { name: "Bob", email: "a@new" } },
      });

      // Next sync: the sheet STILL lists Bob(a@new) (an independent live crew member the sheet keeps).
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Bob", { email: "a@new" })]),
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive), prevMember(bobRow, bobLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      // The independent live Bob (derived from the seeded row) survives.
      expect(rows.find((r) => r.name === "Bob")).toBeDefined();
      expect(rows.find((r) => r.name === "Bob")!.email).toBe("a@new");
      // Alice's restored row is retained too (override still active).
      expect(rows.find((r) => r.name === "Alice")).toBeDefined();
      expect((await readHolds(tx, showId)).find((h) => h.entity_key === "Alice")).toBeDefined();
    });
  });

  // -------- WM-F3: mi11_pending rename-fold target IS a pre-existing live owner --------
  // Guard under test: holdAwareApply.ts rename-fold `!previousCrewNames.has(renameRow.name)`.
  it("mi11_pending rename-fold: fold target Bob is a pre-existing live owner → Bob STAYS", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@old" });
      const bobLive = crew("Bob", { email: "b@x" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      const bobRow = await seedCrew(tx, showId, bobLive);
      await writeMi11Holds(holdPort(tx), {
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
        liveCrewByName: new Map([["Alice", aliceLive]]),
        baseModifiedTime: MT,
      });

      // Next sync: Alice dropped; Bob now carries a@new (Alice's proposed email) → fold targets Bob.
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Bob", { email: "a@new" })]),
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive), prevMember(bobRow, bobLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      expect(rows.find((r) => r.name === "Bob")).toBeDefined(); // live owner survives the fold
      expect(rows.find((r) => r.name === "Alice")).toBeDefined(); // held crew pinned/retained
    });
  });

  // -------- WM-F6: rename-fold ONTO a live owner must NOT bleed the owner's non-identity --------
  // Guard under test: holdAwareApply.ts rename-fold — the WHOLE fold (suppression + foldConsumed +
  // nonIdentityOverride + rename retarget) is gated on `!previousCrewNames.has(renameRow.name)`.
  // Revert the override guard → Alice's retained row gets BOB's role/phone (red).
  it("rename-fold onto a live owner: held crew keeps ITS OWN non-identity (no Bob bleed) + approve blocks", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      // Distinct non-identity per person so a bleed is detectable (anti-tautology: derived from seeds).
      const aliceLive = crew("Alice", { email: "a@old", role: "A1", phone: "P-A" });
      const bobLive = crew("Bob", {
        email: "b@x",
        role: "V1",
        phone: "P-B",
        date_restriction: { kind: "explicit", days: ["2026-05-09"] },
      });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      const bobRow = await seedCrew(tx, showId, bobLive);
      await writeMi11Holds(holdPort(tx), {
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
        liveCrewByName: new Map([["Alice", aliceLive]]),
        baseModifiedTime: MT,
      });

      // Next sync: Alice dropped; the sheet lists only Bob carrying a@new (Alice's proposed email) →
      // the fold matches Bob's row. Bob keeps his OWN sheet non-identity (V1 / P-B / R-B here).
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([
          crew("Bob", {
            email: "a@new",
            role: "V1",
            phone: "P-B",
            date_restriction: { kind: "explicit", days: ["2026-05-09"] },
          }),
        ]),
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive), prevMember(bobRow, bobLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      // (a) Bob survives with HIS OWN non-identity intact (not Alice's).
      const bob = rows.find((r) => r.name === "Bob")!;
      expect(bob).toBeDefined();
      expect(bob.role).toBe("V1");
      expect(bob.phone).toBe("P-B");
      // (b) Alice's retained held row keeps HER OWN held non-identity — NOT Bob's (the WM-F6 bug).
      const alice = rows.find((r) => r.name === "Alice")!;
      expect(alice).toBeDefined();
      expect(alice.role).toBe("A1"); // would be "V1" (Bob's) under the bug
      expect(alice.phone).toBe("P-A"); // would be "P-B" (Bob's) under the bug
      // (c) Alice's email still held at the OLD value (identity pinned, gate pending).
      expect(alice.email).toBe("a@old");

      // (d) Approving Alice's hold is BLOCKED — the live-owner collision was recorded.
      const hold = (await readHolds(tx, showId)).find((h) => h.entity_key === "Alice")!;
      expect(hold.reservation_collisions.some((c) => c.name === "Bob")).toBe(true);
      const adminClaims = JSON.stringify({
        sub: "00000000-0000-0000-0000-000000000020",
        email: "dlarson@fxav.net",
        app_metadata: { role: "admin" },
      });
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${adminClaims}, true)`;
      const [approveRow] = (await tx.unsafe(
        `select public.mi11_approve_hold($1::uuid, $2::timestamptz, $3::timestamptz) as r`,
        [hold.id, hold.base_modified_time, hold.base_modified_time] as never,
      )) as Array<{ r: { ok: boolean; code?: string } }>;
      expect(approveRow!.r.ok).toBe(false);
      expect(approveRow!.r.code).toBe("IDENTITY_WOULD_COLLIDE");
    });
  });

  // -------- P2-F4: reservation EMAIL collision IS a pre-existing live owner --------
  // Guard under test: holdAwareApply.ts computeReservations `!priorCrewNames.has(m.name)`.
  // Alice's MI-11 hold reserves email x@new (a real email-change progression, via writeMi11Holds so
  // proposed_value stays a stable email_change). A pre-existing live Carol already carries x@new — she
  // must NOT be suppressed/deleted; the conflict is resolved at Approve by Phase-3's collision graph.
  it("reservation: a pre-existing live owner carries the reserved email → live owner STAYS", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "alice@old" });
      const carolLive = crew("Carol", { email: "x@new" }); // pre-existing owner of the reserved email
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      const carolRow = await seedCrew(tx, showId, carolLive);
      await writeMi11Holds(holdPort(tx), {
        showId,
        driveFileId,
        mi11Items: [
          {
            id: "1",
            invariant: "MI-11",
            crew_name: "Alice",
            prior_email: "alice@old",
            new_email: "x@new",
          },
        ],
        liveCrewByName: new Map([["Alice", aliceLive]]),
        baseModifiedTime: MT,
      });

      // Sheet keeps Alice AT her proposed x@new (hold stays a stable email_change) AND still lists the
      // pre-existing live Carol who also carries x@new → the reservation collides with a LIVE owner.
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([
          crew("Alice", { email: "x@new" }),
          crew("Carol", { email: "x@new" }),
        ]),
        snapshot: snapshot(showId, [
          prevMember(aliceRow, aliceLive),
          prevMember(carolRow, carolLive),
        ]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      // Class invariant: the pre-existing live owner (seeded row, derived — not the in-memory plan)
      // is NOT deleted even though it owns the reserved email.
      expect(rows.find((r) => r.name === "Carol")).toBeDefined();
      expect(rows.find((r) => r.name === "Carol")!.email).toBe("x@new");
      expect(rows.find((r) => r.name === "Alice")).toBeDefined(); // held crew pinned to alice@old
      expect(rows.find((r) => r.name === "Alice")!.email).toBe("alice@old");
      // The hold records the live-owner collision so Phase-3 Approve blocks IDENTITY_WOULD_COLLIDE.
      const hold = (await readHolds(tx, showId)).find((h) => h.entity_key === "Alice")!;
      expect(hold.reservation_collisions.some((c) => c.name === "Carol")).toBe(true);
    });
  });

  // -------- Positive control: legitimate undo-of-ADD self-suppression still works --------
  it("undo-of-add tombstone STILL suppresses the entity's own re-added row (not a regression)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      await seedUndoOverride(tx, showId, driveFileId, "crew_identity", "Zed", {
        absent: true,
        name: "Zed",
        email: "z@x",
        baseline: { kind: "add", added: { name: "Zed", email: "z@x" } },
      });
      // Sheet still lists Zed (and Zed has no prior live row — it's a genuine self-suppression).
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Zed", { email: "z@x" })]),
        snapshot: snapshot(showId, []),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });
      expect((await readCrew(tx, showId)).find((r) => r.name === "Zed")).toBeUndefined();
    });
  });
});
