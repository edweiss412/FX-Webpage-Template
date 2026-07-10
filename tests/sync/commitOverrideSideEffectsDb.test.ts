import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { commitOverrideSideEffects } from "@/lib/sync/commitOverrideSideEffects";
import { makeSyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import type { OverrideSideEffect } from "@/lib/sync/overrideShowHotel";

// Load-bearing DB test for Stage B: drives the REAL PostgresPipelineTx executors (via makeSyncPipelineTx)
// against real Postgres and asserts the R30 version-bump ASYMMETRY that a mocked dispatch test cannot
// prove — a benign sheet_value refresh must NOT bump `version`; a deactivation MUST — AND that sheet_value
// is stored with the correct jsonb REPRESENTATION (object for dates/venue, string for name/role/hotel),
// never a double-encoded jsonb string scalar (feedback_postgres_js_jsonb_param_double_encode).
const url =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// The two Stage-B methods live on PostgresPipelineTx (Phase2Tx-optional); makeSyncPipelineTx returns the
// concrete instance. Extract the port surface commitOverrideSideEffects needs (the same cast the
// production caller uses — runScheduledCronSync passes the raw tx as PostgresTransaction).
function realPort(tx: postgres.TransactionSql) {
  const pipe = makeSyncPipelineTx(tx as never) as unknown as {
    refreshOverrideSheetValue(id: string, v: unknown): Promise<void>;
    deactivateOverride(id: string, c: "target_missing" | "name_conflict"): Promise<void>;
  };
  return {
    refreshOverrideSheetValue: pipe.refreshOverrideSheetValue.bind(pipe),
    deactivateOverride: pipe.deactivateOverride.bind(pipe),
  };
}

describe.skipIf(!url)("commitOverrideSideEffects — DB version-bump + jsonb representation", () => {
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

  async function seedShow(tx: postgres.TransactionSql): Promise<string> {
    const drive = `affo-stageb-${randomUUID()}`;
    const rows = await tx<{ id: string }[]>`
      insert into public.shows (drive_file_id, slug, title, client_label, template_version)
      values (${drive}, ${drive}, 'AFFO StageB', 'AFFO', 'v1') returning id`;
    return rows[0]!.id;
  }

  // Seed one admin_overrides row at a chosen version/active/field and return its id.
  async function seedOverride(
    tx: postgres.TransactionSql,
    showId: string,
    opts: {
      domain: string;
      field: string;
      matchKey: string;
      overrideValue: unknown;
      sheetValue: unknown;
      active: boolean;
      version: number;
      deactivationCode?: string | null;
    },
  ): Promise<string> {
    const rows = await tx<{ id: string }[]>`
      insert into public.admin_overrides
        (show_id, domain, field, match_key, override_value, sheet_value, active, deactivation_code, created_by, version)
      values (${showId}, ${opts.domain}, ${opts.field}, ${opts.matchKey},
              ${sql.json(opts.overrideValue as never)}, ${sql.json(opts.sheetValue as never)},
              ${opts.active}, ${opts.deactivationCode ?? null}, 'admin@fx.co', ${opts.version})
      returning id`;
    return rows[0]!.id;
  }

  async function readRow(tx: postgres.TransactionSql, id: string) {
    const rows = await tx<
      {
        active: boolean;
        version: number;
        deactivation_code: string | null;
        sheet_value: unknown;
        sheet_value_type: string;
      }[]
    >`select active, version, deactivation_code, sheet_value,
             jsonb_typeof(sheet_value) as sheet_value_type
        from public.admin_overrides where id = ${id}`;
    return rows[0]!;
  }

  it("refresh does NOT bump version (R30 benign — a routine cron must not false-409 an open edit)", async () => {
    await inTx(async (tx) => {
      const showId = await seedShow(tx);
      const id = await seedOverride(tx, showId, {
        domain: "crew",
        field: "name",
        matchKey: "Jon",
        overrideValue: "John",
        sheetValue: "Jon",
        active: true,
        version: 5,
      });
      const effects: OverrideSideEffect[] = [{ overrideId: id, sheetValue: "Jonny" }];
      await commitOverrideSideEffects(realPort(tx), effects);
      const row = await readRow(tx, id);
      expect(row.version).toBe(5); // UNCHANGED — the load-bearing R30 assertion
      expect(row.active).toBe(true);
      expect(row.sheet_value).toBe("Jonny"); // chip refreshed
    });
  });

  it("deactivate bumps version + sets active=false + reason (a genuine state change → open edit 409s)", async () => {
    await inTx(async (tx) => {
      const showId = await seedShow(tx);
      const id = await seedOverride(tx, showId, {
        domain: "hotel",
        field: "hotel_name",
        matchKey: "Hilton",
        overrideValue: "Marriott",
        sheetValue: "Hilton",
        active: true,
        version: 5,
      });
      await commitOverrideSideEffects(realPort(tx), [
        { overrideId: id, deactivate: "target_missing" },
      ]);
      const row = await readRow(tx, id);
      expect(row.version).toBe(6); // BUMPED
      expect(row.active).toBe(false);
      expect(row.deactivation_code).toBe("target_missing");
    });
  });

  it("deactivate on an already-inactive row is a no-op (`and active` — never a second version bump)", async () => {
    await inTx(async (tx) => {
      const showId = await seedShow(tx);
      const id = await seedOverride(tx, showId, {
        domain: "crew",
        field: "name",
        matchKey: "Jon",
        overrideValue: "John",
        sheetValue: "Jon",
        active: false,
        version: 5,
        deactivationCode: "name_conflict",
      });
      await commitOverrideSideEffects(realPort(tx), [
        { overrideId: id, deactivate: "target_missing" },
      ]);
      const row = await readRow(tx, id);
      expect(row.version).toBe(5); // NOT re-bumped
      expect(row.active).toBe(false);
      expect(row.deactivation_code).toBe("name_conflict"); // original reason preserved
    });
  });

  it("refresh stores an OBJECT sheet_value as a jsonb OBJECT (no double-encode) — dates/venue revert stays valid", async () => {
    await inTx(async (tx) => {
      const showId = await seedShow(tx);
      const id = await seedOverride(tx, showId, {
        domain: "show",
        field: "dates",
        matchKey: "",
        overrideValue: { start: "2026-02" },
        sheetValue: { start: "2026-01" },
        active: true,
        version: 3,
      });
      await commitOverrideSideEffects(realPort(tx), [
        { overrideId: id, sheetValue: { start: "2026-03", end: "2026-04" } },
      ]);
      const row = await readRow(tx, id);
      expect(row.sheet_value_type).toBe("object"); // NOT "string" — the double-encode symptom
      expect(row.sheet_value).toEqual({ start: "2026-03", end: "2026-04" });
    });
  });

  it("refresh stores a STRING sheet_value as a jsonb STRING (matches the RPC's to_jsonb) — text-field revert stays valid", async () => {
    await inTx(async (tx) => {
      const showId = await seedShow(tx);
      const id = await seedOverride(tx, showId, {
        domain: "crew",
        field: "role",
        matchKey: "Jon",
        overrideValue: "Lead",
        sheetValue: "Tech",
        active: true,
        version: 2,
      });
      await commitOverrideSideEffects(realPort(tx), [{ overrideId: id, sheetValue: "Manager" }]);
      const row = await readRow(tx, id);
      expect(row.sheet_value_type).toBe("string");
      expect(row.sheet_value).toBe("Manager");
    });
  });

  it("null sheet_value refresh stores SQL/JSON null (parsed-null dates path)", async () => {
    await inTx(async (tx) => {
      const showId = await seedShow(tx);
      const id = await seedOverride(tx, showId, {
        domain: "show",
        field: "venue",
        matchKey: "",
        overrideValue: { name: "X" },
        sheetValue: { name: "Y" },
        active: true,
        version: 1,
      });
      await commitOverrideSideEffects(realPort(tx), [{ overrideId: id, sheetValue: null }]);
      const row = await readRow(tx, id);
      // jsonb null OR SQL null are both acceptable "no sheet value"; assert it is not a stray object/string.
      expect(["null", null]).toContain(row.sheet_value_type);
    });
  });
});
