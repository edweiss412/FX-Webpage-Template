/**
 * BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE — the crew_identity restore branch,
 * and the Reject path it actually serves.
 *
 * WHY THIS FILE EXISTS. Spec round 2 refuted the reading on which
 * `holdAwareApply.ts:477` carries an UNDO's payload. `mi11_reject_hold`
 * converts a rejected rename or removal into the same
 * `kind='undo_override'` / `domain='crew_identity'` shape `undo_change` writes
 * (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:83-98`), and it never
 * touches `crew_members` — a rejected removal means keep the member exactly as
 * they are. `readOpenHolds` selects no column that tells the two producers
 * apart. So that site runs with a CURRENT live row and a LAGGING `held_value`,
 * and before this arc it wrote the snapshot over the live row: the very defect
 * the arc closes, reached by pressing Reject.
 *
 * THE ROLE RESTORATION IS LOAD-BEARING, not hygiene. `sync_holds` revokes all
 * from `authenticated` (`supabase/migrations/20260608000000_sync_holds.sql:46`),
 * so a transaction left in that role after the RPC cannot read the table. The
 * hold assertion and `applyParseResult` would both fail on a permission error
 * BEFORE reaching line 477, and the case would report a red that has nothing to
 * do with the defect. The existing approve-driving test does not hit this
 * because its RPC call is the last thing in its transaction; this one continues.
 *
 * Spec: docs/superpowers/specs/sync/2026-08-27-mi11-removal-fallback-live-row.md §3.5
 * Plan: docs/superpowers/plans/2026-08-27-mi11-removal-fallback-live-row.md Task 3
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { CrewMemberRow } from "@/lib/parser/types";
import { applyParseResult } from "@/lib/sync/applyParseResult";
import { writeMi11Holds, type LiveCrewRow } from "@/lib/sync/holds/writeMi11Holds";
import { premiseHolds } from "@/tests/_shared/premise";

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
import { assertLocalDbUrl } from "../db/_localDbUrl";

const DB_URL = assertLocalDbUrl(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
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

const MT1 = "2026-06-08T12:00:00.000Z";
const MT2 = "2026-06-09T12:00:00.000Z";
const asLiveCrewRow = (m: CrewMemberRow): LiveCrewRow => m as unknown as LiveCrewRow;

/**
 * Call an admin RPC and put the transaction back the way it was found.
 *
 * The role and the JWT claims are set with `is_local = true`, so they last for
 * the transaction and not the session — but the transaction is exactly what the
 * rest of each case runs in. Restoring is what lets a case continue.
 */
async function asAdmin<T>(tx: Sql, fn: () => Promise<T>): Promise<T> {
  const adminClaims = JSON.stringify({
    sub: "00000000-0000-0000-0000-000000000020",
    email: "dlarson@fxav.net",
    app_metadata: { role: "admin" },
  });
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims', ${adminClaims}, true)`;
  try {
    return await fn();
  } finally {
    await tx`select set_config('role', 'postgres', true)`;
    await tx`select set_config('request.jwt.claims', '', true)`;
  }
}

/** Write an mi11 hold from `heldEra`, then reject it with the given disposition. */
async function rejectedHold(
  tx: Sql,
  args: {
    showId: string;
    driveFileId: string;
    heldEra: CrewMemberRow;
    disposition: "removal" | "rename";
    renameTo?: { name: string; email: string };
  },
) {
  await writeMi11Holds(holdPort(tx) as never, {
    showId: args.showId,
    driveFileId: args.driveFileId,
    mi11Items: [
      {
        id: "1",
        invariant: "MI-11",
        crew_name: args.heldEra.name,
        prior_email: args.heldEra.email,
        new_email: "held@new",
      },
    ],
    liveCrewByName: new Map([[args.heldEra.name, asLiveCrewRow(args.heldEra)]]),
    baseModifiedTime: MT1,
  });
  const [hold] = await readHolds(tx, args.showId);
  // The gate reads `proposed_value->>'disposition'`, so the hold has to carry
  // the disposition being rejected. writeMi11Holds always writes email_change.
  const proposed =
    args.disposition === "removal"
      ? { disposition: "removal" }
      : { disposition: "rename", name: args.renameTo!.name, email: args.renameTo!.email };
  await tx.unsafe(`update public.sync_holds set proposed_value = $1::jsonb where id = $2`, [
    proposed,
    hold!.id,
  ] as never);

  const rows = (await asAdmin(tx, () =>
    tx.unsafe(`select public.mi11_reject_hold($1::uuid, $2::timestamptz) as r`, [
      hold!.id,
      hold!.base_modified_time,
    ] as never),
  )) as unknown as Array<{ r: { ok: boolean; code?: string } }>;
  return { holdId: hold!.id, result: rows[0]!.r };
}

/** Seed a hold row directly. The release arms below are what is under test, not the RPCs that write them. */
async function seedHold(
  tx: Sql,
  args: {
    showId: string;
    driveFileId: string;
    kind: "mi11_pending" | "undo_override";
    domain: "crew_email" | "crew_identity";
    entityKey: string;
    heldValue: Record<string, unknown>;
    proposedValue?: Record<string, unknown> | null;
  },
) {
  await tx.unsafe(
    `insert into public.sync_holds
       (show_id, drive_file_id, domain, entity_key, held_value, proposed_value,
        base_modified_time, kind, created_by)
     values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::timestamptz,$8,'system')`,
    [
      args.showId,
      args.driveFileId,
      args.domain,
      args.entityKey,
      args.heldValue,
      args.proposedValue ?? null,
      MT1,
      args.kind,
    ] as never,
  );
}

const HELD_ERA: Omit<CrewMemberRow, "name" | "email"> = {
  phone: "555-HELD",
  role: "A1",
  role_flags: ["A1"],
  date_restriction: { kind: "none" },
  stage_restriction: { kind: "none" },
  flight_info: "AA-HELD",
};
const LIVE_NOW: Omit<CrewMemberRow, "name" | "email"> = {
  phone: "555-LIVE",
  role: "V1",
  role_flags: ["V1"],
  date_restriction: { kind: "explicit", days: ["2026-07-20"] },
  stage_restriction: { kind: "explicit", stages: ["Show"] },
  flight_info: "BB-LIVE",
};

describe("the crew_identity restore retain, on the path Reject actually produces", () => {
  it("a rejected REMOVAL keeps the member's own live row through a later sync that drops them", async () => {
    const out = await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const heldEra: CrewMemberRow = { name: "Held", email: "held@old", ...HELD_ERA };
      const liveNow: CrewMemberRow = { name: "Held", email: "held@old", ...LIVE_NOW };
      const row = await seedCrew(tx, showId, liveNow);
      const stays = crew("Stays", { email: "stays@x" });
      const staysRow = await seedCrew(tx, showId, stays);

      const { result } = await rejectedHold(tx, {
        showId,
        driveFileId,
        heldEra,
        disposition: "removal",
      });

      const holdsAfterReject = await readHolds(tx, showId);
      const converted = holdsAfterReject.find((h) => h.entity_key === "Held");
      const crewAfterReject = await readCrew(tx, showId);

      // The next sync: the sheet no longer lists Held.
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([stays]),
        snapshot: snapshot(showId, [prevMember(row, liveNow), prevMember(staysRow, stays)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const after = (await readCrew(tx, showId)).find((r) => r.name === "Held");
      return { result, converted, crewAfterReject, after };
    });

    // Premises on THIS case's own inputs. Without the first two the case is
    // exercising some other branch; without the third the assertion cannot
    // discriminate a live-row retain from a snapshot retain.
    premiseHolds("the reject RPC must have succeeded", out.result.ok === true);
    premiseHolds(
      "the hold must have converted to undo_override/crew_identity, or this is not the restore branch",
      out.converted?.kind === "undo_override" && out.converted?.domain === "crew_identity",
    );
    premiseHolds(
      "the live row and the held snapshot must differ on the asserted fields",
      LIVE_NOW.phone !== HELD_ERA.phone && LIVE_NOW.role !== HELD_ERA.role,
    );
    // The premise the whole finding rests on: Reject leaves crew_members alone.
    premiseHolds(
      "mi11_reject_hold must leave the crew row exactly where it was",
      out.crewAfterReject.find((r) => r.name === "Held")?.phone === LIVE_NOW.phone,
    );

    expect(out.after, "a rejected removal means keep the member").toBeDefined();
    expect(out.after!.phone, "phone").toBe(LIVE_NOW.phone);
    expect(out.after!.role, "role").toBe(LIVE_NOW.role);
    expect(out.after!.role_flags, "role_flags").toEqual(LIVE_NOW.role_flags);
    expect(out.after!.flight_info, "flight_info").toBe(LIVE_NOW.flight_info);
    // Identity still comes from the hold.
    expect(out.after!.email, "identity stays held").toBe("held@old");
  });

  /**
   * RELEASE regression pins.
   *
   * Not retain sites, and they complete no enumeration. Every retain case in
   * this arc depends on its hold SURVIVING the sync, so a release regression
   * would turn those cases green for the wrong reason — the retain simply never
   * runs. Each pin asserts one release arm fires on its own, so the regression
   * shows up as itself.
   */
  const RELEASES: ReadonlyArray<{
    label: string;
    arm: string;
    kind: "mi11_pending" | "undo_override";
    domain: "crew_email" | "crew_identity";
    heldValue: Record<string, unknown>;
    proposedValue?: Record<string, unknown> | null;
  }> = [
    {
      label: "mi11_pending reconciled back to the held name AND email",
      arm: "mi11Reconciled (holdAwareApply.ts:121-129)",
      kind: "mi11_pending",
      domain: "crew_email",
      heldValue: { name: "Held", email: "held@old", ...HELD_ERA },
      proposedValue: { disposition: "email_change", name: "Held", email: "held@new" },
    },
    {
      label: "undo_override removal baseline, entity_key back in the parse",
      arm: "parseByName.has(entity_key) (holdAwareApply.ts:93-95)",
      kind: "undo_override",
      domain: "crew_identity",
      heldValue: { name: "Held", email: "held@old", ...HELD_ERA, baseline: { kind: "removal" } },
    },
    {
      label: "undo_override rename baseline, entity_key back in the parse",
      arm: "the FIRST rename arm, parseByName.has(entity_key) (holdAwareApply.ts:103)",
      kind: "undo_override",
      domain: "crew_identity",
      heldValue: {
        name: "Held",
        email: "held@old",
        ...HELD_ERA,
        baseline: {
          kind: "rename",
          suppressed_added: { name: "Replacement", email: "replacement@x" },
        },
      },
    },
  ];

  it.each(RELEASES)("RELEASE PIN: $label releases via $arm", async (spec) => {
    const survived = await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const live: CrewMemberRow = { name: "Held", email: "held@old", ...LIVE_NOW };
      const row = await seedCrew(tx, showId, live);
      await seedHold(tx, {
        showId,
        driveFileId,
        kind: spec.kind,
        domain: spec.domain,
        entityKey: "Held",
        heldValue: spec.heldValue,
        proposedValue: spec.proposedValue ?? null,
      });
      premiseHolds(
        `${spec.label}: the hold must exist before the sync, or "released" is vacuous`,
        (await readHolds(tx, showId)).some((h) => h.entity_key === "Held"),
      );
      // The sheet lists Held again, under the held identity.
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([live]),
        snapshot: snapshot(showId, [prevMember(row, live)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });
      return (await readHolds(tx, showId)).some((h) => h.entity_key === "Held");
    });
    expect(survived, `${spec.arm} must have released the hold`).toBe(false);
  });

  /**
   * The tombstone suppresses and returns WITHOUT a retain
   * (`holdAwareApply.ts:469-472`). Asserted as an absence: a retain appearing
   * there would be a sixth site, which the class guard's count catches first.
   */
  it("the crew_identity tombstone suppresses its own added row and retains nothing", async () => {
    const names = await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const stays = crew("Stays", { email: "stays@x" });
      const staysRow = await seedCrew(tx, showId, stays);
      await seedHold(tx, {
        showId,
        driveFileId,
        kind: "undo_override",
        domain: "crew_identity",
        entityKey: "Tombstoned",
        heldValue: { name: "Tombstoned", email: "tomb@x", absent: true, ...HELD_ERA },
      });
      // The sheet still adds the tombstoned name, so the hold does NOT release.
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([stays, crew("Tombstoned", { email: "tomb@x" })]),
        snapshot: snapshot(showId, [prevMember(staysRow, stays)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });
      return (await readCrew(tx, showId)).map((r) => r.name);
    });
    expect(names, "the tombstoned name is suppressed, never retained").not.toContain("Tombstoned");
    expect(names, "and the bystander is untouched").toContain("Stays");
  });
});
