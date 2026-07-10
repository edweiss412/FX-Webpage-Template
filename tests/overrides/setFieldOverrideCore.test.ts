import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

// Core behavioral subset for the Step-3.2 set_field_override RPC (spec §7.1-§7.6). DB-integration:
// each `it` seeds a fresh show + rows, calls the RPC directly, and asserts BOTH the live-row change
// AND the admin_overrides row — so the complex plpgsql body is exercised by real behavior in THIS
// task (R3b-1), not only by the grant assertion. The exhaustive edge matrix stays in Task 4.
// Sibling connection pattern (tests/db/_b2Helpers.ts:5-7): fall back to the local Supabase DB.
const url =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type Rpc = { ok: true; value: unknown } | { ok: false; code: string };

// A JSON value bound as a `::jsonb` param. postgres.js serializes native objects/arrays for the cast
// at runtime (verified: the 8 core cases pass), but its parameter *types* only model primitive
// `Serializable` values — so name the JSON shape here, then cast it to the accepted parameter type at
// each interpolation via `jb()`. The cast is type-only; the value sent on the wire is unchanged.
type JsonbParam = Record<string, unknown> | unknown[] | string | number | boolean | null;
const jb = (v: JsonbParam): postgres.SerializableParameter => v as postgres.SerializableParameter;

// Narrow a single-row result under `noUncheckedIndexedAccess` (throws if the query returned nothing).
function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected exactly one row, got none");
  return row;
}

describe.skipIf(!url)("set_field_override — core behavior (per-op, per-domain)", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    // max:1 + serial `it`s so each RPC's per-show advisory xact-lock is the sole holder.
    sql = postgres(url!, { max: 1, prepare: false });
  });
  afterAll(async () => {
    await sql.end();
  });

  // Every test runs inside a transaction that ALWAYS rolls back — the RPC's writes (live rows +
  // admin_overrides) and its pg_advisory_xact_lock are xact-scoped, so nothing persists. A failing
  // `expect` throws an AssertionError (not /rollback/), which the catch re-raises.
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
    const drive = `affo-core-${randomUUID()}`;
    const { id } = first(
      await tx<{ id: string }[]>`
      insert into public.shows (drive_file_id, slug, title, client_label, template_version, dates, venue)
      values (${drive}, ${drive}, 'AFFO Core', 'AFFO', 'v1', ${jb(opts.dates ?? null)}::jsonb, ${jb(opts.venue ?? null)}::jsonb)
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
    hotelName: string,
  ): Promise<string> {
    const { id } = first(
      await tx<{ id: string }[]>`
      insert into public.hotel_reservations (show_id, ordinal, hotel_name) values (${showId}, 1, ${hotelName}) returning id`,
    );
    return id;
  }

  // jsonb params are passed as NATIVE JS values (objects for object-shaped jsonb, JS strings for
  // string-shaped jsonb). postgres.js JSON-encodes them for the ::jsonb cast: {a:1} → jsonb object,
  // "Jon" → jsonb string "Jon", "" → jsonb string "". (A pre-encoded JSON *string* would be
  // double-encoded into a jsonb string — postgres@3 JSON.stringifies every string parameter.)
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

  async function readOverride(
    tx: postgres.TransactionSql,
    showId: string,
    domain: string,
    field: string,
    matchKey: string,
  ) {
    const [row] = await tx<
      {
        active: boolean;
        version: number;
        sheet_value: unknown;
        override_value: unknown;
        created_by: string;
      }[]
    >`select active, version, sheet_value, override_value, created_by
        from public.admin_overrides
       where show_id=${showId} and domain=${domain} and field=${field} and match_key=${matchKey}`;
    return row; // may be undefined (the revert/empty-name cases assert absence)
  }

  // Same read, but asserts the row exists (present-case sites that access its fields).
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

  it("create (show dates): live dates := override_value; override row active v1 sheet_value=prior live", async () => {
    await inTx(async (tx) => {
      const { showId, drive } = await seedShow(tx, { dates: { start: "2026-01" } });
      const res = await callRpc(tx, {
        drive,
        op: "upsert",
        domain: "show",
        field: "dates",
        matchKey: "",
        overrideValue: { start: "2026-02" },
        expectedCurrent: { start: "2026-01" },
      });
      expect(res).toEqual({ ok: true, value: { start: "2026-02" } });
      const show = first(
        await tx<{ dates: unknown }[]>`select dates from public.shows where id=${showId}`,
      );
      expect(show.dates).toEqual({ start: "2026-02" }); // LIVE row changed
      const ov = await mustOverride(tx, showId, "show", "dates", "");
      expect(ov.active).toBe(true);
      expect(ov.version).toBe(1);
      expect(ov.sheet_value).toEqual({ start: "2026-01" }); // prior live captured
      expect(ov.override_value).toEqual({ start: "2026-02" });
    });
  });

  it("create (crew name): live name := override; sheet_name := match_key; override row active v1", async () => {
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
      });
      expect(res).toEqual({ ok: true, value: "Jonathan" });
      const cm = first(
        await tx<{ name: string; sheet_name: string | null }[]>`
          select name, sheet_name from public.crew_members where show_id=${showId}`,
      );
      expect(cm.name).toBe("Jonathan"); // LIVE row changed
      expect(cm.sheet_name).toBe("Jon"); // R3b-3 alias set immediately = match_key
      const ov = await mustOverride(tx, showId, "crew", "name", "Jon");
      expect(ov.active).toBe(true);
      expect(ov.version).toBe(1);
      expect(ov.sheet_value).toBe("Jon");
      expect(ov.override_value).toBe("Jonathan");
    });
  });

  it("create (hotel hotel_name): live hotel_name := override; override row active v1 sheet_value=prior", async () => {
    await inTx(async (tx) => {
      const { showId, drive } = await seedShow(tx);
      await seedHotel(tx, showId, "Hilton");
      const res = await callRpc(tx, {
        drive,
        op: "upsert",
        domain: "hotel",
        field: "hotel_name",
        matchKey: "Hilton",
        overrideValue: "Marriott",
        expectedCurrent: "Hilton",
        expectedLiveHotelName: "Hilton",
      });
      expect(res).toEqual({ ok: true, value: "Marriott" });
      const hr = first(
        await tx<{ hotel_name: string }[]>`
          select hotel_name from public.hotel_reservations where show_id=${showId}`,
      );
      expect(hr.hotel_name).toBe("Marriott"); // LIVE row changed
      const ov = await mustOverride(tx, showId, "hotel", "hotel_name", "Hilton");
      expect(ov.active).toBe(true);
      expect(ov.version).toBe(1);
      expect(ov.sheet_value).toBe("Hilton");
      expect(ov.override_value).toBe("Marriott");
    });
  });

  it("edit (crew role): override_value updated, sheet_value PRESERVED, version bumped", async () => {
    await inTx(async (tx) => {
      const { showId, drive } = await seedShow(tx);
      await seedCrew(tx, showId, "Jon", "Tech");
      // create the role override first (v1, sheet_value='Tech')
      const created = await callRpc(tx, {
        drive,
        op: "upsert",
        domain: "crew",
        field: "role",
        matchKey: "Jon",
        overrideValue: "Lead",
        expectedCurrent: "Tech",
      });
      expect(created.ok).toBe(true);
      // edit: CAS-A version=1, new value; sheet_value must stay 'Tech'
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
      const cm = first(
        await tx<{ role: string }[]>`
          select role from public.crew_members where show_id=${showId}`,
      );
      expect(cm.role).toBe("Manager"); // LIVE row changed
      const ov = await mustOverride(tx, showId, "crew", "role", "Jon");
      expect(ov.override_value).toBe("Manager");
      expect(ov.sheet_value).toBe("Tech"); // R7 preserved through the edit
      expect(ov.version).toBe(2); // bumped
      expect(ov.active).toBe(true);
    });
  });

  it("revert (crew name): live restored to sheet_value; sheet_name cleared to NULL; override row deleted", async () => {
    await inTx(async (tx) => {
      const { showId, drive } = await seedShow(tx);
      await seedCrew(tx, showId, "Jon", "Tech");
      const created = await callRpc(tx, {
        drive,
        op: "upsert",
        domain: "crew",
        field: "name",
        matchKey: "Jon",
        overrideValue: "Jonathan",
        expectedCurrent: "Jon",
      });
      expect(created.ok).toBe(true);
      const res = await callRpc(tx, {
        drive,
        op: "revert",
        domain: "crew",
        field: "name",
        matchKey: "Jon",
        expectedVersion: 1,
      });
      expect(res).toEqual({ ok: true, value: "Jon" });
      const cm = first(
        await tx<{ name: string; sheet_name: string | null }[]>`
          select name, sheet_name from public.crew_members where show_id=${showId}`,
      );
      expect(cm.name).toBe("Jon"); // LIVE restored to sheet_value
      expect(cm.sheet_name).toBeNull(); // R3b-3 alias cleared on revert
      const ov = await readOverride(tx, showId, "crew", "name", "Jon");
      expect(ov).toBeUndefined(); // override row deleted
    });
  });

  it("CAS-A: create when an ACTIVE override already exists → 409 OVERRIDE_STALE_REVIEW", async () => {
    await inTx(async (tx) => {
      const { showId, drive } = await seedShow(tx);
      await seedCrew(tx, showId, "Jon", "Tech");
      const created = await callRpc(tx, {
        drive,
        op: "upsert",
        domain: "crew",
        field: "name",
        matchKey: "Jon",
        overrideValue: "Jonathan",
        expectedCurrent: "Jon",
      });
      expect(created.ok).toBe(true);
      // second create (expected_version NULL) against the now-active row → collision.
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
      // the existing override is untouched (still v1, still Jonathan).
      const ov = await mustOverride(tx, showId, "crew", "name", "Jon");
      expect(ov.version).toBe(1);
      expect(ov.override_value).toBe("Jonathan");
    });
  });

  it("discard on an ACTIVE row → 409 OVERRIDE_INVALID_STATE, nothing mutated", async () => {
    await inTx(async (tx) => {
      const { showId, drive } = await seedShow(tx);
      await seedCrew(tx, showId, "Jon", "Tech");
      const created = await callRpc(tx, {
        drive,
        op: "upsert",
        domain: "crew",
        field: "name",
        matchKey: "Jon",
        overrideValue: "Jonathan",
        expectedCurrent: "Jon",
      });
      expect(created.ok).toBe(true);
      const res = await callRpc(tx, {
        drive,
        op: "discard",
        domain: "crew",
        field: "name",
        matchKey: "Jon",
        expectedVersion: 1,
      });
      expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_STATE" });
      // nothing mutated: live name still overridden, override row still active.
      const cm = first(
        await tx<{ name: string }[]>`
          select name from public.crew_members where show_id=${showId}`,
      );
      expect(cm.name).toBe("Jonathan");
      const ov = await mustOverride(tx, showId, "crew", "name", "Jon");
      expect(ov.active).toBe(true);
      expect(ov.version).toBe(1);
    });
  });

  it("§7.4 guard: empty crew name → 409, no override row written, live name unchanged", async () => {
    await inTx(async (tx) => {
      const { showId, drive } = await seedShow(tx);
      await seedCrew(tx, showId, "Jon", "Tech");
      const res = await callRpc(tx, {
        drive,
        op: "upsert",
        domain: "crew",
        field: "name",
        matchKey: "Jon",
        overrideValue: "", // empty string → §7.4 'empty' → RPC-9 collapses to STALE_REVIEW
        expectedCurrent: "Jon",
      });
      expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
      const cm = first(
        await tx<{ name: string }[]>`
          select name from public.crew_members where show_id=${showId}`,
      );
      expect(cm.name).toBe("Jon"); // live untouched
      const ov = await readOverride(tx, showId, "crew", "name", "Jon");
      expect(ov).toBeUndefined(); // no row written
    });
  });
});
