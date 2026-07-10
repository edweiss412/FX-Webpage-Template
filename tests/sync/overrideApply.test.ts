/**
 * Task 7 Step 7.3 — §3.6 id-keyed crew reconciliation, DB integration (real crew_members writes).
 * Drives `applyParseResult` with `activeCrewOverrides` through two real sync runs. Assertions read
 * crew_members / admin_overrides state (anti-tautology), not the plan object. The four-phase executor
 * (delete → park → insert → assign-finals) runs against real Postgres, so a naive write order would
 * surface as a live `unique(show_id, name)` violation.
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/email/canonicalize";
import { applyParseResult, type PreviousCrewMember } from "@/lib/sync/applyParseResult";
import { loadActiveOverrides } from "@/lib/sync/loadActiveOverrides";
import type { ActiveCrewOverride } from "@/lib/sync/reconcileCrewOverrides";

import { applyTx, crew, parseResult, seedShow } from "./_holdAwareTestkit";
import type { CrewMemberRow } from "@/lib/parser/types";

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

/** Insert a crew row in its ALREADY-APPLIED state (name = display, sheet_name = parsed name). */
async function seedCrewRow(
  tx: Sql,
  showId: string,
  member: CrewMemberRow,
  opts: { sheetName?: string | null } = {},
): Promise<string> {
  const [row] = await tx`
    insert into public.crew_members
      (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
       flight_info, sheet_name)
    values (${showId}, ${member.name}, ${canonicalize(member.email)}, ${member.phone}, ${member.role},
            ${member.role_flags}, ${tx.json(member.date_restriction)}, ${tx.json(member.stage_restriction)},
            ${member.flight_info}, ${opts.sheetName ?? null})
    returning id
  `;
  return row!.id as string;
}

async function seedOverride(
  tx: Sql,
  showId: string,
  o: { domain: string; field: string; match_key: string; value: string },
): Promise<string> {
  const [row] = await tx`
    insert into public.admin_overrides (show_id, domain, field, match_key, override_value, created_by)
    values (${showId}, ${o.domain}, ${o.field}, ${o.match_key}, ${tx.json(o.value)}, 'doug@example.com')
    returning id
  `;
  return row!.id as string;
}

async function readCrewFull(tx: Sql, showId: string) {
  return (await tx`
    select id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
           flight_info, sheet_name, claimed_via_oauth_at, selections_reset_at
      from public.crew_members where show_id = ${showId} order by name
  `) as unknown as Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    sheet_name: string | null;
    claimed_via_oauth_at: string | null;
    selections_reset_at: string | null;
    role_flags: unknown;
    date_restriction: unknown;
    stage_restriction: unknown;
    flight_info: string | null;
  }>;
}

function prevFromDb(rows: Awaited<ReturnType<typeof readCrewFull>>): PreviousCrewMember[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    role_flags: r.role_flags as PreviousCrewMember["role_flags"],
    date_restriction: r.date_restriction as PreviousCrewMember["date_restriction"],
    stage_restriction: r.stage_restriction as PreviousCrewMember["stage_restriction"],
    flight_info: r.flight_info,
    claimed_via_oauth_at: r.claimed_via_oauth_at,
    selections_reset_at: r.selections_reset_at,
  }));
}

async function readOverrides(tx: Sql, showId: string) {
  return (await tx`
    select id, field, match_key, override_value, sheet_value, active, deactivation_code
      from public.admin_overrides where show_id = ${showId} order by field, match_key
  `) as unknown as Array<{
    id: string;
    field: string;
    match_key: string;
    override_value: unknown;
    sheet_value: unknown;
    active: boolean;
    deactivation_code: string | null;
  }>;
}

/** The read port over the raw tx — the SAME shape runScheduledCronSync's loadActiveOverrides uses. */
function overridesPort(tx: Sql, spy?: { calls: number }) {
  return {
    async loadActiveOverrides(driveFileId: string) {
      if (spy) spy.calls += 1;
      const data = (await tx`
        select o.id, o.domain, o.field, o.match_key, o.override_value
          from public.admin_overrides o
          join public.shows s on s.id = o.show_id
         where s.drive_file_id = ${driveFileId} and o.active
         order by o.id
      `) as unknown as {
        id: string;
        domain: "show" | "crew" | "hotel";
        field: "name" | "role" | "dates" | "venue" | "hotel_name" | "hotel_address";
        match_key: string;
        override_value: unknown;
      }[];
      return { data, error: null };
    },
  };
}

async function activeCrew(tx: Sql, driveFileId: string, spy?: { calls: number }) {
  const loaded = await loadActiveOverrides(overridesPort(tx, spy), driveFileId);
  return loaded
    .filter((o) => o.domain === "crew")
    .map<ActiveCrewOverride>((o) => ({
      id: o.id,
      field: o.field as "name" | "role",
      match_key: o.match_key,
      override_value: o.override_value,
    }));
}

describe("overrideApply — §3.6 id-keyed crew reconciliation (DB)", () => {
  it("crew_members.id is stable across two full-replace re-syncs, and comes from ONE locked-tx read", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      await seedCrewRow(tx, showId, crew("John", { role: "A1" }), { sheetName: "Jon" });
      await seedOverride(tx, showId, {
        domain: "crew",
        field: "name",
        match_key: "Jon",
        value: "John",
      });

      const runSync = async () => {
        const spy = { calls: 0 };
        const active = await activeCrew(tx, driveFileId, spy);
        expect(spy.calls).toBe(1); // SYNC-2: exactly one read feeds the reconciliation
        await applyParseResult(applyTx(tx), {
          driveFileId,
          parseResult: parseResult([crew("Jon", { role: "A1" })]),
          snapshot: {
            showId,
            previousCrewNames: [],
            previousCrewMembers: prevFromDb(await readCrewFull(tx, showId)),
          },
          activeCrewOverrides: active,
        });
      };

      await runSync();
      const idAfter1 = (await readCrewFull(tx, showId))[0]!.id;
      await runSync();
      const rows = await readCrewFull(tx, showId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(idAfter1); // stable across the second re-sync (criterion 2)
      expect(rows[0]!.name).toBe("John"); // display value survives the full-replace
      expect(rows[0]!.sheet_name).toBe("Jon");
      // applyParseResult is PURE w.r.t. admin_overrides (Stage B / Task 8 commits) — untouched here.
      expect((await readOverrides(tx, showId))[0]!.active).toBe(true);
    });
  });

  it("runtime collision (R11): the pre-conflict id stays bound to its parsed identity; the new member is a fresh row (no id swap)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      // un-overridden columns (incl. email) carry the PARSED Jon's values; only name is overridden.
      const jonId = await seedCrewRow(tx, showId, crew("John", { email: "jon@example.com" }), {
        sheetName: "Jon",
      });
      const ovId = await seedOverride(tx, showId, {
        domain: "crew",
        field: "name",
        match_key: "Jon",
        value: "John",
      });

      const active = await activeCrew(tx, driveFileId);
      const outcome = await applyParseResult(applyTx(tx), {
        driveFileId,
        // sheet keeps Jon AND adds a real new member literally named "John" (distinct email)
        parseResult: parseResult([crew("Jon"), crew("John", { role: "NEW" })]),
        snapshot: {
          showId,
          previousCrewNames: [],
          previousCrewMembers: prevFromDb(await readCrewFull(tx, showId)),
        },
        activeCrewOverrides: active,
      });

      const rows = await readCrewFull(tx, showId);
      const jon = rows.find((r) => r.name === "Jon")!;
      const john = rows.find((r) => r.name === "John")!;
      expect(jon.id).toBe(jonId); // pre-conflict id NEVER reassigned to the colliding member
      expect(john.id).not.toBe(jonId); // new John is a fresh row/id
      expect(jon.sheet_name).toBeNull(); // override fell back → alias cleared
      // override deactivation planned (name_conflict) — the four-phase write committed (no unique violation)
      expect(outcome.crewSideEffects).toContainEqual({
        overrideId: ovId,
        deactivate: "name_conflict",
      });
    });
  });

  it("R23 fail-closed: a vanished parsed identity deletes + deactivates BOTH override rows; an arriving same-name person is a fresh id", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const jonId = await seedCrewRow(tx, showId, crew("John"), { sheetName: "Jon" });
      const ovName = await seedOverride(tx, showId, {
        domain: "crew",
        field: "name",
        match_key: "Jon",
        value: "John",
      });
      const ovRole = await seedOverride(tx, showId, {
        domain: "crew",
        field: "role",
        match_key: "Jon",
        value: "Lead",
      });

      const active = await activeCrew(tx, driveFileId);
      const outcome = await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("John", { role: "X" })]), // Jon gone; a different John arrives
        snapshot: {
          showId,
          previousCrewNames: [],
          previousCrewMembers: prevFromDb(await readCrewFull(tx, showId)),
        },
        activeCrewOverrides: active,
      });

      const rows = await readCrewFull(tx, showId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe("John");
      expect(rows[0]!.id).not.toBe(jonId); // NOT re-keyed — fresh id, no cookie continuity
      expect(rows[0]!.sheet_name).toBeNull();
      expect(outcome.crewSideEffects).toContainEqual({
        overrideId: ovName,
        deactivate: "target_missing",
      });
      expect(outcome.crewSideEffects).toContainEqual({
        overrideId: ovRole,
        deactivate: "target_missing",
      });
    });
  });

  it("R29 full-column refresh: a sheet edit to email/phone/flags/restrictions/flight_info still lands on an override-active member", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const id = await seedCrewRow(
        tx,
        showId,
        crew("Alicia", { email: "old@x.com", phone: "555-OLD" }),
        {
          sheetName: "Alice",
        },
      );
      await seedOverride(tx, showId, {
        domain: "crew",
        field: "name",
        match_key: "Alice",
        value: "Alicia",
      });

      const active = await activeCrew(tx, driveFileId);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([
          crew("Alice", {
            email: "NEW@X.COM",
            phone: "555-NEW",
            role: "A3",
            role_flags: ["V1"],
            flight_info: "AA123",
          }),
        ]),
        snapshot: {
          showId,
          previousCrewNames: [],
          previousCrewMembers: prevFromDb(await readCrewFull(tx, showId)),
        },
        activeCrewOverrides: active,
      });

      const row = (await readCrewFull(tx, showId))[0]!;
      expect(row.id).toBe(id); // id preserved
      expect(row.name).toBe("Alicia"); // name still overridden
      expect(row.email).toBe(canonicalize("NEW@X.COM")); // new + canonicalized
      expect(row.phone).toBe("555-NEW");
      expect(row.role).toBe("A3");
      expect(row.flight_info).toBe("AA123");
      expect(row.sheet_name).toBe("Alice");
    });
  });

  it("crew active=false is planned POST-HOLD: a removal-suppression hold retains the row and keeps the override active", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      await seedCrewRow(tx, showId, crew("Bob"));
      await seedCrewRow(tx, showId, crew("Eve"));
      const ovId = await seedOverride(tx, showId, {
        domain: "crew",
        field: "role",
        match_key: "Eve",
        value: "Lead",
      });

      // Open a removal-suppression hold on Eve (undo_override, crew_identity, baseline removal). It
      // stays open because the parse OMITS Eve — so Eve is protected/retained post-hold.
      await tx`
        insert into public.sync_holds
          (show_id, drive_file_id, entity_key, kind, domain, held_value, created_by)
        values (${showId}, ${driveFileId}, 'Eve', 'undo_override', 'crew_identity',
                ${tx.json({ name: "Eve", baseline: { kind: "removal" } })}, 'doug@example.com')
      `;

      const active = await activeCrew(tx, driveFileId);
      const holdPortObj = {
        async unsafe(q: string, p: unknown[]) {
          return (await tx.unsafe(q, p as never)) as unknown[];
        },
      };
      const outcome = await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Bob")]), // Eve dropped from the parse (would be a removal)
        snapshot: {
          showId,
          previousCrewNames: ["Bob", "Eve"],
          previousCrewMembers: prevFromDb(await readCrewFull(tx, showId)),
        },
        holds: { port: holdPortObj, baseModifiedTime: MT },
        activeCrewOverrides: active,
      });

      const rows = await readCrewFull(tx, showId);
      // Eve retained (held), NOT deleted; her override NOT deactivated (post-hold decision).
      expect(rows.some((r) => r.name === "Eve")).toBe(true);
      expect(
        (outcome.crewSideEffects ?? []).some(
          (s) => "overrideId" in s && s.overrideId === ovId && "deactivate" in s,
        ),
      ).toBe(false);
    });
  });
});
