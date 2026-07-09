import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

// Step 4.3 — the FULL §12 set_field_override RPC matrix (DB-integration). Each `it` seeds a fresh show +
// live rows, calls the committed SECURITY DEFINER RPC directly, and asserts BOTH the live-row effect AND
// the admin_overrides row state. Every expected value is DERIVED from the seeded fixture (anti-tautology:
// never hardcode a value a fixture could contradict). Mirrors tests/overrides/setFieldOverrideCore.test.ts
// (postgres.js, max:1, inTx rollback, first() narrowing, jb() jsonb cast).
//
// NOTE (Task-4 finding — flagged for Task-3/plan review): the §7.6 bullet "inactive/stale crew-NAME
// repoint succeeds with no old live row" does NOT hold against the committed RPC. Crew-name repoint's
// apply step re-resolves the target via _resolve_live_id on the freshly-activated override at
// p_new_match_key, so it looks for a crew member ALREADY named the override output — which never exists
// pre-apply. The RPC therefore RAISES SQLSTATE 40001 (→ helper maps to OVERRIDE_STALE_REVIEW) and rolls
// the locked tx back, leaving admin_overrides unchanged. That is exactly the RPC-7 "apply matched no live
// row" structural class, so this file asserts the REAL raise+rollback behavior (see the §7.6 / RPC-7
// tests below). The literal "succeeds" wording is unreachable with the committed migration.
const url =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type Rpc = { ok: true; value: unknown } | { ok: false; code: string };

// A JSON value bound as a `::jsonb` param — postgres.js's parameter *types* only model primitive
// Serializable values, so name the JSON shape then cast to the accepted parameter type at each site.
type JsonbParam = Record<string, unknown> | unknown[] | string | number | boolean | null;
const jb = (v: JsonbParam): postgres.SerializableParameter => v as postgres.SerializableParameter;

function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected exactly one row, got none");
  return row;
}

describe.skipIf(!url)("set_field_override — full RPC matrix (§12)", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(url!, { max: 1, prepare: false });
  });
  afterAll(async () => {
    await sql.end();
  });

  async function inTx(body: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
    await sql
      .begin(async (tx) => {
        await body(tx);
        throw new Error("rollback");
      })
      .catch((e) => {
        if (!/rollback/.test(String(e))) throw e;
      });
  }

  async function seedShow(
    tx: postgres.TransactionSql,
    opts: { dates?: JsonbParam; venue?: JsonbParam } = {},
  ): Promise<{ showId: string; drive: string }> {
    const drive = `affo-mtx-${randomUUID()}`;
    const { id } = first(
      await tx<{ id: string }[]>`
      insert into public.shows (drive_file_id, slug, title, client_label, template_version, dates, venue)
      values (${drive}, ${drive}, 'AFFO Matrix', 'AFFO', 'v1', ${jb(opts.dates ?? null)}::jsonb, ${jb(opts.venue ?? null)}::jsonb)
      returning id`,
    );
    return { showId: id, drive };
  }
  async function seedCrew(
    tx: postgres.TransactionSql,
    showId: string,
    name: string,
    role: string,
  ): Promise<string> {
    const { id } = first(
      await tx<{ id: string }[]>`
      insert into public.crew_members (show_id, name, role) values (${showId}, ${name}, ${role}) returning id`,
    );
    return id;
  }
  async function seedHotel(
    tx: postgres.TransactionSql,
    showId: string,
    opts: {
      name: string;
      ordinal?: number;
      address?: string | null;
      checkIn?: string | null;
      confirmationNo?: string | null;
    },
  ): Promise<string> {
    const { id } = first(
      await tx<{ id: string }[]>`
      insert into public.hotel_reservations (show_id, ordinal, hotel_name, hotel_address, check_in, confirmation_no)
      values (${showId}, ${opts.ordinal ?? 1}, ${opts.name}, ${opts.address ?? null},
              ${opts.checkIn ?? null}::date, ${opts.confirmationNo ?? null})
      returning id`,
    );
    return id;
  }

  async function callRpc(
    tx: postgres.TransactionSql,
    p: {
      drive: string;
      op: string;
      domain: string;
      field: string;
      matchKey: string;
      newMatchKey?: string | null;
      overrideValue?: JsonbParam;
      actor?: string;
      expectedVersion?: number | null;
      expectedCurrent?: JsonbParam;
      currentOrdinal?: number | null;
      expectedLiveHotelName?: string | null;
    },
  ): Promise<Rpc> {
    const row = first(
      await tx<{ result: Rpc }[]>`
      select public.set_field_override(
        ${p.drive}::text, ${p.op}::text, ${p.domain}::text, ${p.field}::text, ${p.matchKey}::text,
        ${p.newMatchKey ?? null}::text, ${jb(p.overrideValue ?? null)}::jsonb, ${p.actor ?? "admin@fx.co"}::text,
        ${p.expectedVersion ?? null}::int, ${jb(p.expectedCurrent ?? null)}::jsonb,
        ${p.currentOrdinal ?? null}::int, ${p.expectedLiveHotelName ?? null}::text
      ) as result`,
    );
    return row.result;
  }

  // Some RPC paths RAISE (SQLSTATE 40001) rather than returning a discriminated jsonb. Run those inside a
  // SAVEPOINT so the raise rolls back ONLY the subtransaction — the outer tx stays alive so we can then
  // assert the admin_overrides row is UNCHANGED (the raise-rollback contract). Returns the SQLSTATE.
  async function rpcRaises(
    tx: postgres.TransactionSql,
    p: Parameters<typeof callRpc>[1],
  ): Promise<string> {
    try {
      await tx.savepoint(async (sp) => {
        await callRpc(sp, p);
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code) return code;
      throw e;
    }
    throw new Error("expected the RPC to RAISE, but it returned normally");
  }

  async function readOverride(
    tx: postgres.TransactionSql,
    showId: string,
    domain: string,
    field: string,
    matchKey: string,
  ) {
    const [row] = await tx<
      {
        id: string;
        active: boolean;
        version: number;
        sheet_value: unknown;
        override_value: unknown;
        deactivation_code: string | null;
        created_by: string;
      }[]
    >`select id, active, version, sheet_value, override_value, deactivation_code, created_by
        from public.admin_overrides
       where show_id=${showId} and domain=${domain} and field=${field} and match_key=${matchKey}`;
    return row;
  }
  async function mustOverride(
    tx: postgres.TransactionSql,
    showId: string,
    domain: string,
    field: string,
    matchKey: string,
  ) {
    const ov = await readOverride(tx, showId, domain, field, matchKey);
    if (!ov)
      throw new Error(`expected an admin_overrides row for (${domain},${field},${matchKey})`);
    return ov;
  }
  async function countOverrides(
    tx: postgres.TransactionSql,
    showId: string,
    domain: string,
    field: string,
    matchKey: string,
  ): Promise<number> {
    return first(
      await tx<{ n: number }[]>`
      select count(*)::int as n from public.admin_overrides
       where show_id=${showId} and domain=${domain} and field=${field} and match_key=${matchKey}`,
    ).n;
  }
  const showCol = async (tx: postgres.TransactionSql, showId: string, col: "dates" | "venue") =>
    first(await tx<{ v: unknown }[]>`select ${tx(col)} as v from public.shows where id=${showId}`)
      .v;
  const crewCol = async (
    tx: postgres.TransactionSql,
    showId: string,
    col: "name" | "role" | "sheet_name",
    id: string,
  ) =>
    first(
      await tx<{ v: unknown }[]>`select ${tx(col)} as v from public.crew_members where id=${id}`,
    ).v;
  const hotelName = async (tx: postgres.TransactionSql, id: string) =>
    first(
      await tx<
        { v: string }[]
      >`select hotel_name as v from public.hotel_reservations where id=${id}`,
    ).v;
  const hotelAddr = async (tx: postgres.TransactionSql, id: string) =>
    first(
      await tx<
        { v: string | null }[]
      >`select hotel_address as v from public.hotel_reservations where id=${id}`,
    ).v;

  // ─────────────────────────────────────────────────────────────────────────────
  // ops — create / edit / revert / discard per domain
  // ─────────────────────────────────────────────────────────────────────────────
  describe("ops (per-domain create/edit/revert/discard)", () => {
    it("create show/venue: live venue := override; row active v1 sheet_value=prior live", async () => {
      // Failure mode: create writes override_value but never captures prior live as sheet_value.
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx, { venue: { city: "NYC" } });
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "show",
          field: "venue",
          matchKey: "",
          overrideValue: { city: "LA" },
          expectedCurrent: { city: "NYC" },
        });
        expect(res).toEqual({ ok: true, value: { city: "LA" } });
        expect(await showCol(tx, showId, "venue")).toEqual({ city: "LA" });
        const ov = await mustOverride(tx, showId, "show", "venue", "");
        expect(ov.active).toBe(true);
        expect(ov.version).toBe(1);
        expect(ov.sheet_value).toEqual({ city: "NYC" });
      });
    });

    it("create crew/role: live role := override; sheet_value=prior role", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const cid = await seedCrew(tx, showId, "Jon", "Tech");
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        expect(res).toEqual({ ok: true, value: "Lead" });
        expect(await crewCol(tx, showId, "role", cid)).toBe("Lead");
        const ov = await mustOverride(tx, showId, "crew", "role", "Jon");
        expect(ov.sheet_value).toBe("Tech");
      });
    });

    it("create hotel/hotel_address: live address := override; sheet_value=prior address", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const hid = await seedHotel(tx, showId, { name: "Hilton", address: "1 St" });
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_address",
          matchKey: "Hilton",
          overrideValue: "2 Ave",
          expectedCurrent: "1 St",
          expectedLiveHotelName: "Hilton",
        });
        expect(res).toEqual({ ok: true, value: "2 Ave" });
        expect(await hotelAddr(tx, hid)).toBe("2 Ave");
        const ov = await mustOverride(tx, showId, "hotel", "hotel_address", "Hilton");
        expect(ov.sheet_value).toBe("1 St");
      });
    });

    it("edit show/dates: override_value updated, sheet_value PRESERVED, version bumped", async () => {
      // Failure mode: an edit recaptures live into sheet_value, losing the true sheet value (R7).
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx, { dates: { start: "2026-01" } });
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "show",
          field: "dates",
          matchKey: "",
          overrideValue: { start: "2026-02" },
          expectedCurrent: { start: "2026-01" },
        });
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "show",
          field: "dates",
          matchKey: "",
          overrideValue: { start: "2026-09" },
          expectedVersion: 1,
        });
        expect(res).toEqual({ ok: true, value: { start: "2026-09" } });
        expect(await showCol(tx, showId, "dates")).toEqual({ start: "2026-09" });
        const ov = await mustOverride(tx, showId, "show", "dates", "");
        expect(ov.override_value).toEqual({ start: "2026-09" });
        expect(ov.sheet_value).toEqual({ start: "2026-01" });
        expect(ov.version).toBe(2);
      });
    });

    it("discard on an INACTIVE row → deletes the retained row", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        // sync-side deactivation: retain row, bump version.
        await tx`update public.admin_overrides set active=false, deactivation_code='target_missing', version=version+1
                 where show_id=${showId} and domain='crew' and field='role' and match_key='Jon'`;
        const v = (await mustOverride(tx, showId, "crew", "role", "Jon")).version;
        const res = await callRpc(tx, {
          drive,
          op: "discard",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          expectedVersion: v,
        });
        expect(res).toEqual({ ok: true, value: "discarded" });
        expect(await readOverride(tx, showId, "crew", "role", "Jon")).toBeUndefined();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CAS-A version (R15)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("CAS-A version optimistic concurrency (R15)", () => {
    it("two stale edits: first bumps version, second (stale expected_version) → 409", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        // page A edits (v1 → v2)
        const a = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Manager",
          expectedVersion: 1,
        });
        expect(a.ok).toBe(true);
        // page B edits with stale v1 → 409
        const b = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Director",
          expectedVersion: 1,
        });
        expect(b).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
        const ov = await mustOverride(tx, showId, "crew", "role", "Jon");
        expect(ov.override_value).toBe("Manager");
        expect(ov.version).toBe(2);
      });
    });

    it("stale revert (wrong expected_version) → 409, row untouched", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Jonathan",
          expectedCurrent: "Jon",
        });
        const res = await callRpc(tx, {
          drive,
          op: "revert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          expectedVersion: 99,
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
        const ov = await mustOverride(tx, showId, "crew", "name", "Jon");
        expect(ov.active).toBe(true);
        expect(ov.version).toBe(1);
      });
    });

    it("create when an ACTIVE override already exists → 409, existing untouched", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Jonathan",
          expectedCurrent: "Jon",
        });
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Johnny",
          expectedCurrent: "Jonathan",
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
        const ov = await mustOverride(tx, showId, "crew", "name", "Jon");
        expect(ov.override_value).toBe("Jonathan");
        expect(ov.version).toBe(1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // R30 benign refresh vs deactivation
  // ─────────────────────────────────────────────────────────────────────────────
  describe("R30 benign sheet_value refresh vs deactivation", () => {
    it("benign sheet_value refresh (no version bump) does NOT 409 an open edit", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        // routine cron sync refreshes the display chip WITHOUT bumping version (R30).
        await tx`update public.admin_overrides set sheet_value=to_jsonb('Technician'::text)
                 where show_id=${showId} and domain='crew' and field='role' and match_key='Jon'`;
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Manager",
          expectedVersion: 1,
        });
        expect(res).toEqual({ ok: true, value: "Manager" });
        const ov = await mustOverride(tx, showId, "crew", "role", "Jon");
        expect(ov.version).toBe(2);
        expect(ov.sheet_value).toBe("Technician"); // refresh preserved through the edit
      });
    });

    it("deactivation (version bumped) DOES 409 an open edit on the stale version", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        await tx`update public.admin_overrides set active=false, deactivation_code='target_missing', version=version+1
                 where show_id=${showId} and domain='crew' and field='role' and match_key='Jon'`;
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Manager",
          expectedVersion: 1,
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // R28 create-reactivate
  // ─────────────────────────────────────────────────────────────────────────────
  describe("R28 create reactivates a retained inactive row", () => {
    it("create on a target with an inactive row → reactivate (no uniq violation), sheet_value recaptured", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const cid = await seedCrew(tx, showId, "Jon", "Tech");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        // sync deactivates + restores the parsed role.
        await tx`update public.admin_overrides set active=false, deactivation_code='target_missing', version=version+1
                 where show_id=${showId} and domain='crew' and field='role' and match_key='Jon'`;
        await tx`update public.crew_members set role='Tech' where id=${cid}`;
        const vBefore = (await mustOverride(tx, showId, "crew", "role", "Jon")).version; // = 2
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Manager",
          expectedCurrent: "Tech",
        });
        expect(res).toEqual({ ok: true, value: "Manager" });
        const ov = await mustOverride(tx, showId, "crew", "role", "Jon");
        expect(ov.active).toBe(true);
        expect(ov.deactivation_code).toBeNull();
        expect(ov.override_value).toBe("Manager");
        expect(ov.sheet_value).toBe("Tech"); // recaptured from current live
        expect(ov.version).toBe(vBefore + 1);
        expect(await countOverrides(tx, showId, "crew", "role", "Jon")).toBe(1);
        expect(await crewCol(tx, showId, "role", cid)).toBe("Manager");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // sheet_value invariant (R6/R7) — all 6 fields, create-then-revert AND edit-then-revert
  // ─────────────────────────────────────────────────────────────────────────────
  describe("sheet_value invariant restores the true sheet value (R6/R7)", () => {
    type Cfg = {
      key: string;
      domain: string;
      field: string;
      matchKey: string;
      live: JsonbParam;
      override: JsonbParam;
      edit: JsonbParam;
      hotel: boolean;
      seed: (
        tx: postgres.TransactionSql,
      ) => Promise<{ showId: string; drive: string; liveId: string }>;
      readLive: (tx: postgres.TransactionSql, showId: string, liveId: string) => Promise<unknown>;
    };
    const CFGS: Cfg[] = [
      {
        key: "show/dates",
        domain: "show",
        field: "dates",
        matchKey: "",
        live: { start: "2026-01" },
        override: { start: "2026-02" },
        edit: { start: "2026-08" },
        hotel: false,
        seed: async (tx) => {
          const b = await seedShow(tx, { dates: { start: "2026-01" } });
          return { ...b, liveId: b.showId };
        },
        readLive: (tx, s) => showCol(tx, s, "dates"),
      },
      {
        key: "show/venue",
        domain: "show",
        field: "venue",
        matchKey: "",
        live: { city: "NYC" },
        override: { city: "LA" },
        edit: { city: "SF" },
        hotel: false,
        seed: async (tx) => {
          const b = await seedShow(tx, { venue: { city: "NYC" } });
          return { ...b, liveId: b.showId };
        },
        readLive: (tx, s) => showCol(tx, s, "venue"),
      },
      {
        key: "crew/name",
        domain: "crew",
        field: "name",
        matchKey: "Jon",
        live: "Jon",
        override: "Jonathan",
        edit: "Johnny",
        hotel: false,
        seed: async (tx) => {
          const b = await seedShow(tx);
          const liveId = await seedCrew(tx, b.showId, "Jon", "Tech");
          return { ...b, liveId };
        },
        readLive: (tx, s, id) => crewCol(tx, s, "name", id),
      },
      {
        key: "crew/role",
        domain: "crew",
        field: "role",
        matchKey: "Jon",
        live: "Tech",
        override: "Lead",
        edit: "Manager",
        hotel: false,
        seed: async (tx) => {
          const b = await seedShow(tx);
          const liveId = await seedCrew(tx, b.showId, "Jon", "Tech");
          return { ...b, liveId };
        },
        readLive: (tx, s, id) => crewCol(tx, s, "role", id),
      },
      {
        key: "hotel/hotel_name",
        domain: "hotel",
        field: "hotel_name",
        matchKey: "Hilton",
        live: "Hilton",
        override: "Marriott",
        edit: "Westin",
        hotel: true,
        seed: async (tx) => {
          const b = await seedShow(tx);
          const liveId = await seedHotel(tx, b.showId, { name: "Hilton", address: "1 St" });
          return { ...b, liveId };
        },
        readLive: (tx, _s, id) => hotelName(tx, id),
      },
      {
        key: "hotel/hotel_address",
        domain: "hotel",
        field: "hotel_address",
        matchKey: "Hilton",
        live: "1 St",
        override: "2 Ave",
        edit: "3 Blvd",
        hotel: true,
        seed: async (tx) => {
          const b = await seedShow(tx);
          const liveId = await seedHotel(tx, b.showId, { name: "Hilton", address: "1 St" });
          return { ...b, liveId };
        },
        readLive: (tx, _s, id) => hotelAddr(tx, id),
      },
    ];

    // resolution needs the CURRENT live hotel_name (only for hotel domain).
    const liveHotel = async (tx: postgres.TransactionSql, cfg: Cfg, liveId: string) =>
      cfg.hotel ? await hotelName(tx, liveId) : null;

    for (const cfg of CFGS) {
      it(`${cfg.key}: create-then-revert restores the true sheet value`, async () => {
        // Failure mode: revert restores the override (or a stale/empty value) instead of the parsed sheet value.
        await inTx(async (tx) => {
          const { showId, drive, liveId } = await cfg.seed(tx);
          const created = await callRpc(tx, {
            drive,
            op: "upsert",
            domain: cfg.domain,
            field: cfg.field,
            matchKey: cfg.matchKey,
            overrideValue: cfg.override,
            expectedCurrent: cfg.live,
            expectedLiveHotelName: await liveHotel(tx, cfg, liveId),
          });
          expect(created.ok).toBe(true);
          expect(await cfg.readLive(tx, showId, liveId)).toEqual(cfg.override);
          const res = await callRpc(tx, {
            drive,
            op: "revert",
            domain: cfg.domain,
            field: cfg.field,
            matchKey: cfg.matchKey,
            expectedVersion: 1,
            expectedLiveHotelName: await liveHotel(tx, cfg, liveId),
          });
          expect(res).toEqual({ ok: true, value: cfg.live });
          expect(await cfg.readLive(tx, showId, liveId)).toEqual(cfg.live); // true sheet value
          expect(
            await readOverride(tx, showId, cfg.domain, cfg.field, cfg.matchKey),
          ).toBeUndefined();
        });
      });

      it(`${cfg.key}: edit-then-revert restores the sheet value (NOT the prior override)`, async () => {
        await inTx(async (tx) => {
          const { showId, drive, liveId } = await cfg.seed(tx);
          await callRpc(tx, {
            drive,
            op: "upsert",
            domain: cfg.domain,
            field: cfg.field,
            matchKey: cfg.matchKey,
            overrideValue: cfg.override,
            expectedCurrent: cfg.live,
            expectedLiveHotelName: await liveHotel(tx, cfg, liveId),
          });
          await callRpc(tx, {
            drive,
            op: "upsert",
            domain: cfg.domain,
            field: cfg.field,
            matchKey: cfg.matchKey,
            overrideValue: cfg.edit,
            expectedVersion: 1,
            expectedLiveHotelName: await liveHotel(tx, cfg, liveId),
          });
          expect(await cfg.readLive(tx, showId, liveId)).toEqual(cfg.edit);
          const res = await callRpc(tx, {
            drive,
            op: "revert",
            domain: cfg.domain,
            field: cfg.field,
            matchKey: cfg.matchKey,
            expectedVersion: 2,
            expectedLiveHotelName: await liveHotel(tx, cfg, liveId),
          });
          expect(res).toEqual({ ok: true, value: cfg.live });
          expect(await cfg.readLive(tx, showId, liveId)).toEqual(cfg.live); // sheet value, not cfg.override
        });
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // §7.6 crew anchor matrix
  // ─────────────────────────────────────────────────────────────────────────────
  describe("§7.6 crew anchor resolution", () => {
    it("edit + revert hit the correct row via currentLiveName (active name override)", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const cid = await seedCrew(tx, showId, "Jon", "Tech");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Jonathan",
          expectedCurrent: "Jon",
        });
        // edit resolves via currentLiveName = active override output "Jonathan".
        const edit = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Johnny",
          expectedVersion: 1,
        });
        expect(edit).toEqual({ ok: true, value: "Johnny" });
        expect(await crewCol(tx, showId, "name", cid)).toBe("Johnny");
        const rev = await callRpc(tx, {
          drive,
          op: "revert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          expectedVersion: 2,
        });
        expect(rev).toEqual({ ok: true, value: "Jon" }); // restored to parsed sheet name
        expect(await crewCol(tx, showId, "name", cid)).toBe("Jon");
      });
    });

    it("role apply+revert while a name override is active resolves via the sibling name override", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const cid = await seedCrew(tx, showId, "Jon", "Tech");
        // name override Jon → Jonathan (live name now Jonathan).
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Jonathan",
          expectedCurrent: "Jon",
        });
        // role override with match_key 'Jon' must resolve the SAME member via the active name override.
        const roleCreate = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        expect(roleCreate).toEqual({ ok: true, value: "Lead" });
        expect(await crewCol(tx, showId, "role", cid)).toBe("Lead");
        const roleRevert = await callRpc(tx, {
          drive,
          op: "revert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          expectedVersion: 1,
        });
        expect(roleRevert).toEqual({ ok: true, value: "Tech" });
        expect(await crewCol(tx, showId, "role", cid)).toBe("Tech");
        // the name override is unaffected.
        expect(await crewCol(tx, showId, "name", cid)).toBe("Jonathan");
      });
    });

    it("wrong active-anchor (concurrent sync moved the live name) → 409, not a silent no-op", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const cid = await seedCrew(tx, showId, "Jon", "Tech");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Jonathan",
          expectedCurrent: "Jon",
        });
        // concurrent sync renamed the live row away from currentLiveName "Jonathan".
        await tx`update public.crew_members set name='Elsewhere' where id=${cid}`;
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
        expect(await crewCol(tx, showId, "name", cid)).toBe("Elsewhere"); // untouched
      });
    });

    it("inactive crew-name repoint with the overridden live row gone → RAISES 40001 (committed RPC rejects; see file NOTE)", async () => {
      // §7.6 / RPC-7: the committed apply step re-resolves the target via the freshly-activated override at
      // p_new_match_key, so it can never find the pre-apply row → SQLSTATE 40001 (helper → OVERRIDE_STALE_REVIEW).
      // Asserts the raise-and-rollback contract: admin_overrides UNCHANGED.
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Bob", "Sound"); // only B exists; old A ("Jonathan") is gone.
        await tx`insert into public.admin_overrides
          (show_id,domain,field,match_key,override_value,sheet_value,active,deactivation_code,created_by,version)
          values (${showId},'crew','name','Jon',to_jsonb('Jonathan'::text),to_jsonb('Jon'::text),false,'target_missing','admin@fx.co',3)`;
        const code = await rpcRaises(tx, {
          drive,
          op: "repoint",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          newMatchKey: "Bob",
          expectedVersion: 3,
          expectedCurrent: "Bob",
        });
        expect(code).toBe("40001");
        // rolled back to the savepoint: the inactive row is exactly as seeded.
        const ov = await mustOverride(tx, showId, "crew", "name", "Jon");
        expect(ov.active).toBe(false);
        expect(ov.version).toBe(3);
        expect(ov.override_value).toBe("Jonathan");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // R25 active crew-name repoint 409 + active role/hotel repoint succeed (RPC-1)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("R25 active repoint (crew-name rejected; role/hotel released-then-applied)", () => {
    it("active crew-NAME repoint → INVALID_STATE; A, B, and the override row unchanged", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const a = await seedCrew(tx, showId, "Jon", "Tech");
        const b = await seedCrew(tx, showId, "Bob", "Sound");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Jonathan",
          expectedCurrent: "Jon",
        });
        const res = await callRpc(tx, {
          drive,
          op: "repoint",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          newMatchKey: "Bob",
          expectedVersion: 1,
          expectedCurrent: "Bob",
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_STATE" });
        expect(await crewCol(tx, showId, "name", a)).toBe("Jonathan");
        expect(await crewCol(tx, showId, "name", b)).toBe("Bob");
        const ov = await mustOverride(tx, showId, "crew", "name", "Jon");
        expect(ov.version).toBe(1);
        expect(ov.active).toBe(true);
      });
    });

    it("active crew-ROLE repoint → release A to sheet_value, apply override to B (RPC-1)", async () => {
      // Failure mode: A's role is left at the override value (release no-op) because the crew resolver is
      // gated to upsert/revert and the repoint branch never resolves/releases A.
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const a = await seedCrew(tx, showId, "Jon", "Tech");
        const b = await seedCrew(tx, showId, "Bob", "Sound");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        const res = await callRpc(tx, {
          drive,
          op: "repoint",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          newMatchKey: "Bob",
          expectedVersion: 1,
          expectedCurrent: "Sound", // B's current role
        });
        expect(res).toEqual({ ok: true, value: "Lead" });
        expect(await crewCol(tx, showId, "role", a)).toBe("Tech"); // A released to its sheet_value
        expect(await crewCol(tx, showId, "role", b)).toBe("Lead"); // B carries the override
        const ov = await mustOverride(tx, showId, "crew", "role", "Bob");
        expect(ov.active).toBe(true);
        expect(ov.override_value).toBe("Lead");
        expect(await readOverride(tx, showId, "crew", "role", "Jon")).toBeUndefined();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // R14 active discard
  // ─────────────────────────────────────────────────────────────────────────────
  describe("R14 discard on an ACTIVE row → INVALID_STATE, nothing mutated", () => {
    it("show", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx, { dates: { start: "2026-01" } });
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "show",
          field: "dates",
          matchKey: "",
          overrideValue: { start: "2026-02" },
          expectedCurrent: { start: "2026-01" },
        });
        const res = await callRpc(tx, {
          drive,
          op: "discard",
          domain: "show",
          field: "dates",
          matchKey: "",
          expectedVersion: 1,
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_STATE" });
        expect(await showCol(tx, showId, "dates")).toEqual({ start: "2026-02" });
        expect((await mustOverride(tx, showId, "show", "dates", "")).active).toBe(true);
      });
    });
    it("crew", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const cid = await seedCrew(tx, showId, "Jon", "Tech");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        const res = await callRpc(tx, {
          drive,
          op: "discard",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          expectedVersion: 1,
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_STATE" });
        expect(await crewCol(tx, showId, "role", cid)).toBe("Lead");
      });
    });
    it("hotel", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const hid = await seedHotel(tx, showId, { name: "Hilton", address: "1 St" });
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_name",
          matchKey: "Hilton",
          overrideValue: "Marriott",
          expectedCurrent: "Hilton",
          expectedLiveHotelName: "Hilton",
        });
        const res = await callRpc(tx, {
          drive,
          op: "discard",
          domain: "hotel",
          field: "hotel_name",
          matchKey: "Hilton",
          expectedVersion: 1,
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_STATE" });
        expect(await hotelName(tx, hid)).toBe("Marriott");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // R29 repoint target-key collision
  // ─────────────────────────────────────────────────────────────────────────────
  describe("R29 repoint target-key collision (crew role)", () => {
    it("repoint into an ACTIVE override at the new key → INVALID_STATE, nothing mutated", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const a = await seedCrew(tx, showId, "Jon", "Tech");
        const b = await seedCrew(tx, showId, "Bob", "Sound");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Bob",
          overrideValue: "Star",
          expectedCurrent: "Sound",
        });
        const res = await callRpc(tx, {
          drive,
          op: "repoint",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          newMatchKey: "Bob",
          expectedVersion: 1,
          expectedCurrent: "Star", // B's current (overridden) role
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_STATE" });
        expect(await crewCol(tx, showId, "role", a)).toBe("Lead");
        expect(await crewCol(tx, showId, "role", b)).toBe("Star");
        expect((await mustOverride(tx, showId, "crew", "role", "Jon")).version).toBe(1);
        expect((await mustOverride(tx, showId, "crew", "role", "Bob")).version).toBe(1);
      });
    });

    it("repoint into an INACTIVE override at the new key → supersede (deleted), exactly one row", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const a = await seedCrew(tx, showId, "Jon", "Tech");
        const b = await seedCrew(tx, showId, "Bob", "Sound");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Bob",
          overrideValue: "Star",
          expectedCurrent: "Sound",
        });
        // deactivate the 'Bob' override + restore its parsed role.
        await tx`update public.admin_overrides set active=false, deactivation_code='target_missing', version=version+1
                 where show_id=${showId} and domain='crew' and field='role' and match_key='Bob'`;
        await tx`update public.crew_members set role='Sound' where id=${b}`;
        const res = await callRpc(tx, {
          drive,
          op: "repoint",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          newMatchKey: "Bob",
          expectedVersion: 1,
          expectedCurrent: "Sound",
        });
        expect(res).toEqual({ ok: true, value: "Lead" });
        expect(await countOverrides(tx, showId, "crew", "role", "Bob")).toBe(1); // superseded → exactly one
        expect(await readOverride(tx, showId, "crew", "role", "Jon")).toBeUndefined();
        expect(await crewCol(tx, showId, "role", a)).toBe("Tech"); // A released
        expect(await crewCol(tx, showId, "role", b)).toBe("Lead"); // B now carries the override
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CAS-B live-value (R16/R17)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("CAS-B create-time live-value guard (R16/R17)", () => {
    it("show/dates: a sync corrected the live field between UI-load and create → 409", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx, { dates: { start: "2026-01" } });
        // concurrent sync corrected the live dates AFTER the UI captured expected {start:2026-01}.
        await tx`update public.shows set dates=to_jsonb('{"start":"2026-04"}'::json) where id=${showId}`;
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "show",
          field: "dates",
          matchKey: "",
          overrideValue: { start: "2026-02" },
          expectedCurrent: { start: "2026-01" }, // stale
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
        expect(await readOverride(tx, showId, "show", "dates", "")).toBeUndefined();
      });
    });
    it("crew/role: a sync corrected the live role between UI-load and create → 409", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const cid = await seedCrew(tx, showId, "Jon", "Tech");
        await tx`update public.crew_members set role='Audio' where id=${cid}`;
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech", // stale
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
      });
    });
    it("hotel/hotel_name: a sync corrected the live name between UI-load and create → 409", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const hid = await seedHotel(tx, showId, { name: "Hilton", address: "1 St" });
        // rename to a UNIQUE new name so the row still resolves 1:1 but the value CAS-B mismatches.
        await tx`update public.hotel_reservations set hotel_name='Hilton Garden' where id=${hid}`;
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_name",
          matchKey: "Hilton Garden",
          overrideValue: "Marriott",
          expectedCurrent: "Hilton", // stale
          expectedLiveHotelName: "Hilton Garden",
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // hotel row-locator (R19/R20)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("hotel row-locator: unconditional exactly-one match (R19/R20)", () => {
    it("two same-name reservations → 409 on hotel_name (ambiguous, no guessed row)", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedHotel(tx, showId, { name: "Hilton", ordinal: 1, checkIn: "2026-03-01" });
        await seedHotel(tx, showId, { name: "Hilton", ordinal: 2, checkIn: "2026-03-05" });
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_name",
          matchKey: "Hilton", // no disambiguator → count=2
          overrideValue: "Marriott",
          expectedCurrent: "Hilton",
          expectedLiveHotelName: "Hilton",
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
        expect(await readOverride(tx, showId, "hotel", "hotel_name", "Hilton")).toBeUndefined();
      });
    });
    it("two same-name reservations → 409 on hotel_address (ambiguous)", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedHotel(tx, showId, {
          name: "Hilton",
          ordinal: 1,
          address: "1 St",
          checkIn: "2026-03-01",
        });
        await seedHotel(tx, showId, {
          name: "Hilton",
          ordinal: 2,
          address: "9 Rd",
          checkIn: "2026-03-05",
        });
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_address",
          matchKey: "Hilton",
          overrideValue: "2 Ave",
          expectedCurrent: "1 St",
          expectedLiveHotelName: "Hilton",
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
      });
    });
    it("disambiguated by check_in → resolves the exact row (RPC2-1 real row)", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const h1 = await seedHotel(tx, showId, {
          name: "Hilton",
          ordinal: 1,
          checkIn: "2026-03-01",
        });
        const h2 = await seedHotel(tx, showId, {
          name: "Hilton",
          ordinal: 2,
          checkIn: "2026-03-05",
        });
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_name",
          matchKey: `Hilton2026-03-01`,
          overrideValue: "Marriott",
          expectedCurrent: "Hilton",
          expectedLiveHotelName: "Hilton",
        });
        expect(res).toEqual({ ok: true, value: "Marriott" });
        expect(await hotelName(tx, h1)).toBe("Marriott"); // the check_in-matched row
        expect(await hotelName(tx, h2)).toBe("Hilton"); // sibling untouched
      });
    });
    it("a UNIQUE-at-load name gaining a same-name sibling → 409 via the unconditional gate", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedHotel(tx, showId, { name: "Hilton", ordinal: 1, checkIn: "2026-03-01" });
        // a sync inserted a same-name sibling AFTER the UI loaded the unique 'Hilton'.
        await seedHotel(tx, showId, { name: "Hilton", ordinal: 2, checkIn: "2026-03-05" });
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_name",
          matchKey: "Hilton", // loaded as unique, now ambiguous
          overrideValue: "Marriott",
          expectedCurrent: "Hilton",
          expectedLiveHotelName: "Hilton",
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
      });
    });
    it("a benign pure reorder keeping the name unique → resolves with no false 409", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const hid = await seedHotel(tx, showId, {
          name: "Hilton",
          ordinal: 1,
          checkIn: "2026-03-01",
        });
        // pure reorder: ordinal changed, name still unique (ordinal is advisory-only, R20).
        await tx`update public.hotel_reservations set ordinal=5 where id=${hid}`;
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_name",
          matchKey: "Hilton",
          overrideValue: "Marriott",
          expectedCurrent: "Hilton",
          currentOrdinal: 1, // stale advisory ordinal — must NOT drive resolution
          expectedLiveHotelName: "Hilton",
        });
        expect(res).toEqual({ ok: true, value: "Marriott" });
        expect(await hotelName(tx, hid)).toBe("Marriott");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // guards §7.4 (RPC-side _validate_override_value, F3)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("§7.4 value guards (RPC-enforced, collapse to STALE_REVIEW, RPC-9)", () => {
    it("crew name collision with another member → rejected, no row written", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        await seedCrew(tx, showId, "Bob", "Sound");
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Bob", // collides with the other member
          expectedCurrent: "Jon",
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
        expect(await readOverride(tx, showId, "crew", "name", "Jon")).toBeUndefined();
      });
    });
    it("hotel_name FINAL-name collision with another reservation → rejected", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedHotel(tx, showId, { name: "Hilton", ordinal: 1 });
        await seedHotel(tx, showId, { name: "Marriott", ordinal: 2 });
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_name",
          matchKey: "Hilton",
          overrideValue: "Marriott", // collides with the other reservation
          expectedCurrent: "Hilton",
          expectedLiveHotelName: "Hilton",
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
      });
    });
    it("empty and whitespace-only names → rejected, no row", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        for (const bad of ["", "   "]) {
          const res = await callRpc(tx, {
            drive,
            op: "upsert",
            domain: "crew",
            field: "name",
            matchKey: "Jon",
            overrideValue: bad,
            expectedCurrent: "Jon",
          });
          expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
        }
        expect(await readOverride(tx, showId, "crew", "name", "Jon")).toBeUndefined();
      });
    });
    it("value equal to match_key (no-op) → rejected", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Jon", // == match_key
          expectedCurrent: "Jon",
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
      });
    });
    it("cap: crew name > 200 chars → rejected", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "x".repeat(201),
          expectedCurrent: "Jon",
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // F1 create-row durability
  // ─────────────────────────────────────────────────────────────────────────────
  describe("F1 create-row durability (row EXISTS after create, all domains)", () => {
    it("show/crew/hotel creates each insert a durable admin_overrides row", async () => {
      // Failure mode: a create silently falls into the edit branch (where id=NULL no-op), the live apply
      // still runs, but NO override row is inserted — the stale-plpgsql-FOUND regression.
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx, { dates: { start: "2026-01" } });
        await seedCrew(tx, showId, "Jon", "Tech");
        await seedHotel(tx, showId, { name: "Hilton", address: "1 St" });
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "show",
          field: "dates",
          matchKey: "",
          overrideValue: { start: "2026-02" },
          expectedCurrent: { start: "2026-01" },
        });
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Jonathan",
          expectedCurrent: "Jon",
        });
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_name",
          matchKey: "Hilton",
          overrideValue: "Marriott",
          expectedCurrent: "Hilton",
          expectedLiveHotelName: "Hilton",
        });
        expect(await countOverrides(tx, showId, "show", "dates", "")).toBe(1);
        expect(await countOverrides(tx, showId, "crew", "name", "Jon")).toBe(1);
        expect(await countOverrides(tx, showId, "hotel", "hotel_name", "Hilton")).toBe(1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // F2 inactive repoint no false-409 (CAS-B evaluated against B, the new target)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("F2 inactive repoint evaluates CAS-B against the NEW target", () => {
    it("inactive crew-ROLE repoint to B (old A gone) with expected_current SET → succeeds", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const a = await seedCrew(tx, showId, "Jon", "Tech");
        const b = await seedCrew(tx, showId, "Bob", "Sound");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        // deactivate + old target A vanishes.
        await tx`update public.admin_overrides set active=false, deactivation_code='target_missing', version=version+1
                 where show_id=${showId} and domain='crew' and field='role' and match_key='Jon'`;
        await tx`delete from public.crew_members where id=${a}`;
        const res = await callRpc(tx, {
          drive,
          op: "repoint",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          newMatchKey: "Bob",
          expectedVersion: 2,
          expectedCurrent: "Sound", // CAS-B vs B (Bob), NOT the gone A
        });
        expect(res).toEqual({ ok: true, value: "Lead" });
        expect(await crewCol(tx, showId, "role", b)).toBe("Lead");
        expect((await mustOverride(tx, showId, "crew", "role", "Bob")).active).toBe(true);
      });
    });
    it("inactive hotel_address repoint to B (old A gone) → succeeds (CAS-B vs B)", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const a = await seedHotel(tx, showId, { name: "Hilton", ordinal: 1, address: "1 St" });
        const b = await seedHotel(tx, showId, { name: "Grand", ordinal: 2, address: "9 Rd" });
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_address",
          matchKey: "Hilton",
          overrideValue: "2 Ave",
          expectedCurrent: "1 St",
          expectedLiveHotelName: "Hilton",
        });
        await tx`update public.admin_overrides set active=false, deactivation_code='target_missing', version=version+1
                 where show_id=${showId} and domain='hotel' and field='hotel_address' and match_key='Hilton'`;
        await tx`delete from public.hotel_reservations where id=${a}`;
        const res = await callRpc(tx, {
          drive,
          op: "repoint",
          domain: "hotel",
          field: "hotel_address",
          matchKey: "Hilton",
          newMatchKey: "Grand",
          expectedVersion: 2,
          expectedCurrent: "9 Rd", // B's current address
          expectedLiveHotelName: "Grand",
        });
        expect(res).toEqual({ ok: true, value: "2 Ave" });
        expect(await hotelAddr(tx, b)).toBe("2 Ave");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // RPC-2/3 op-on-missing/inactive row
  // ─────────────────────────────────────────────────────────────────────────────
  describe("RPC-2/3 ops against missing / inactive rows", () => {
    it("revert with version NULL against a non-existent row → 409, nothing created", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        const res = await callRpc(tx, {
          drive,
          op: "revert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          expectedVersion: null,
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
        expect(await readOverride(tx, showId, "crew", "name", "Jon")).toBeUndefined();
      });
    });
    it("revert on an INACTIVE row → OVERRIDE_INVALID_STATE", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Jonathan",
          expectedCurrent: "Jon",
        });
        await tx`update public.admin_overrides set active=false, deactivation_code='target_missing', version=version+1
                 where show_id=${showId} and domain='crew' and field='name' and match_key='Jon'`;
        const v = (await mustOverride(tx, showId, "crew", "name", "Jon")).version;
        const res = await callRpc(tx, {
          drive,
          op: "revert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          expectedVersion: v,
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_STATE" });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // RPC-5 unknown (domain,field)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("RPC-5 unknown (domain,field) → INVALID_OP, nothing written", () => {
    it("('show','name') → INVALID_OP", async () => {
      await inTx(async (tx) => {
        const { drive } = await seedShow(tx);
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "show",
          field: "name",
          matchKey: "",
          overrideValue: "x",
          expectedCurrent: null,
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_OP" });
      });
    });
    it("('crew','hotel_name') → INVALID_OP", async () => {
      await inTx(async (tx) => {
        const { drive } = await seedShow(tx);
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "hotel_name",
          matchKey: "Jon",
          overrideValue: "x",
          expectedCurrent: null,
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_OP" });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // RPC-7 apply-matches-no-live-row (structural class defense)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("RPC-7 apply matches no live row → RAISE 40001, tx rolled back", () => {
    it("an active crew-role repoint whose released target A is concurrently deleted → RAISE 40001, override unchanged", async () => {
      // The repoint resolves A's release id up front, then apply. If A's live row vanishes before the
      // release-apply the _apply_override_live FOUND-assert raises 40001 rather than silently no-op'ing.
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const a = await seedCrew(tx, showId, "Jon", "Tech");
        await seedCrew(tx, showId, "Bob", "Sound");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        // A's live row is gone at apply time → currentLiveName("Jon") resolves nothing → 40001.
        await tx`delete from public.crew_members where id=${a}`;
        const code = await rpcRaises(tx, {
          drive,
          op: "repoint",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          newMatchKey: "Bob",
          expectedVersion: 1,
          expectedCurrent: "Sound",
        });
        expect(code).toBe("40001");
        // rolled back to the savepoint: the override row is exactly as it was (still at 'Jon', v1, active).
        const ov = await mustOverride(tx, showId, "crew", "role", "Jon");
        expect(ov.version).toBe(1);
        expect(ov.active).toBe(true);
        expect(ov.override_value).toBe("Lead");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // RPC2-2 active hotel_name repoint keeping the same value
  // ─────────────────────────────────────────────────────────────────────────────
  describe("RPC2-2 active hotel_name repoint keeping the same value", () => {
    it("override omitted → A reverts to parsed name, B becomes the value, exactly one live match", async () => {
      // A is EXCLUDED from the FINAL-name collision because it is the releasing target (RPC2-2).
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        const a = await seedHotel(tx, showId, { name: "Old", ordinal: 1, address: "1 St" });
        const b = await seedHotel(tx, showId, { name: "Grand", ordinal: 2, address: "9 Rd" });
        // active hotel_name override Old → Hilton (A.hotel_name now 'Hilton', sheet_value 'Old').
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "hotel",
          field: "hotel_name",
          matchKey: "Old",
          overrideValue: "Hilton",
          expectedCurrent: "Old",
          expectedLiveHotelName: "Old",
        });
        expect(await hotelName(tx, a)).toBe("Hilton");
        const res = await callRpc(tx, {
          drive,
          op: "repoint",
          domain: "hotel",
          field: "hotel_name",
          matchKey: "Old",
          newMatchKey: "Grand",
          // p_override_value omitted → keeps 'Hilton'
          expectedVersion: 1,
          expectedCurrent: "Grand", // B's current name
          expectedLiveHotelName: "Grand",
        });
        expect(res).toEqual({ ok: true, value: "Hilton" });
        expect(await hotelName(tx, a)).toBe("Old"); // A reverts to its parsed name
        expect(await hotelName(tx, b)).toBe("Hilton"); // B becomes the value
        // exactly one live 'Hilton'.
        expect(
          first(
            await tx<{ n: number }[]>`
            select count(*)::int as n from public.hotel_reservations
             where show_id=${showId} and hotel_name='Hilton'`,
          ).n,
        ).toBe(1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // RPC2-3 non-create ops require a version
  // ─────────────────────────────────────────────────────────────────────────────
  describe("RPC2-3 revert/repoint/discard require p_expected_version", () => {
    it("each op with version NULL → OVERRIDE_STALE_REVIEW", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        await seedCrew(tx, showId, "Bob", "Sound");
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "role",
          matchKey: "Jon",
          overrideValue: "Lead",
          expectedCurrent: "Tech",
        });
        for (const op of ["revert", "repoint", "discard"] as const) {
          const res = await callRpc(tx, {
            drive,
            op,
            domain: "crew",
            field: "role",
            matchKey: "Jon",
            newMatchKey: op === "repoint" ? "Bob" : null,
            expectedVersion: null, // missing CAS
            expectedCurrent: "Sound",
          });
          expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
        }
        // untouched.
        expect((await mustOverride(tx, showId, "crew", "role", "Jon")).version).toBe(1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // RPC3-1 NULL / invalid discriminators
  // ─────────────────────────────────────────────────────────────────────────────
  describe("RPC3-1 NULL/invalid discriminators → INVALID_OP (never fall through to upsert)", () => {
    const bad: Array<{ label: string; op: string; domain: string; field: string }> = [
      { label: "NULL op", op: null as unknown as string, domain: "crew", field: "role" },
      { label: "unknown op", op: "frobnicate", domain: "crew", field: "role" },
      { label: "NULL domain", op: "upsert", domain: null as unknown as string, field: "role" },
      { label: "unknown field", op: "upsert", domain: "crew", field: "wingspan" },
    ];
    for (const c of bad) {
      it(c.label, async () => {
        await inTx(async (tx) => {
          const { showId, drive } = await seedShow(tx);
          await seedCrew(tx, showId, "Jon", "Tech");
          const res = await callRpc(tx, {
            drive,
            op: c.op,
            domain: c.domain,
            field: c.field,
            matchKey: "Jon",
            overrideValue: "Lead",
            expectedCurrent: "Tech",
          });
          expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_OP" });
          expect(
            await crewCol(
              tx,
              showId,
              "role",
              (
                await tx<
                  { id: string }[]
                >`select id from public.crew_members where show_id=${showId}`
              )[0]!.id,
            ),
          ).toBe("Tech");
        });
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // RPC5-1 show singleton match_key
  // ─────────────────────────────────────────────────────────────────────────────
  describe("RPC5-1 show singleton match_key is canonicalized to ''", () => {
    it("a second show/dates create with a DIFFERENT match_key hits the SAME active target → 409", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx, { dates: { start: "2026-01" } });
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "show",
          field: "dates",
          matchKey: "",
          overrideValue: { start: "2026-02" },
          expectedCurrent: { start: "2026-01" },
        });
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "show",
          field: "dates",
          matchKey: "some-other-key", // forced to '' inside the RPC → same active row
          overrideValue: { start: "2026-03" },
          expectedCurrent: { start: "2026-02" },
        });
        expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
        // exactly one show/dates override row, at the canonical '' key.
        expect(await countOverrides(tx, showId, "show", "dates", "")).toBe(1);
        expect(await countOverrides(tx, showId, "show", "dates", "some-other-key")).toBe(0);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // canonical created_by
  // ─────────────────────────────────────────────────────────────────────────────
  describe("created_by is stored lower(trim())", () => {
    it("a mixed-case actor is canonicalized", async () => {
      await inTx(async (tx) => {
        const { showId, drive } = await seedShow(tx);
        await seedCrew(tx, showId, "Jon", "Tech");
        const res = await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "crew",
          field: "name",
          matchKey: "Jon",
          overrideValue: "Jonathan",
          expectedCurrent: "Jon",
          actor: "  Admin@FX.CO  ",
        });
        expect(res.ok).toBe(true);
        expect((await mustOverride(tx, showId, "crew", "name", "Jon")).created_by).toBe(
          "admin@fx.co",
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // lock held (invariant 2 — in-RPC single-holder advisory xact lock)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("per-show advisory xact lock (invariant 2)", () => {
    it("the RPC takes exactly one advisory xact lock, held to tx end", async () => {
      await inTx(async (tx) => {
        const { drive } = await seedShow(tx, { dates: { start: "2026-01" } });
        const before = first(
          await tx<{ n: number }[]>`
          select count(*)::int as n from pg_locks
           where locktype='advisory' and pid=pg_backend_pid()`,
        ).n;
        expect(before).toBe(0);
        await callRpc(tx, {
          drive,
          op: "upsert",
          domain: "show",
          field: "dates",
          matchKey: "",
          overrideValue: { start: "2026-02" },
          expectedCurrent: { start: "2026-01" },
        });
        const after = first(
          await tx<{ n: number }[]>`
          select count(*)::int as n from pg_locks
           where locktype='advisory' and pid=pg_backend_pid()`,
        ).n;
        expect(after).toBe(1); // single-holder, still held (xact-scoped)
      });
    });
  });
});
