/**
 * tests/db/tileAlertResolution.db.test.ts
 *
 * Discharges the spec's AC1, AC2, AC3, AC5 and AC7 against REAL admin_alerts
 * rows. The spec's anti-tautology note binds those ACs to post-callback row
 * state specifically because a mock-shaped assertion cannot see the failure that
 * matters: a resolver that builds a perfectly-shaped query and matches NOTHING
 * passes every call-argument test in tests/crew/ and tests/adminAlerts/.
 *
 * Lives in tests/db/ (a SERIAL, DB-capable project) rather than tests/adminAlerts/
 * or tests/crew/, which are in PARALLEL_TEST_GLOBS and run in CI's unit-suite-nodb
 * job without Supabase or psql.
 */
import { execFileSync } from "node:child_process";

import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { assertLocalDbUrl } from "./_localDbUrl";

// TEST_DATABASE_URL points at the VALIDATION project in this repo, so this file
// pins BOTH the psql URL and the REST client's URL to local loopback before any
// module that reads them is imported. The sweep reaches Postgres through the
// service-role client (SUPABASE_URL), while the seeds go through psql; pinning
// only one would seed one database and assert against another.
const LOCAL_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
{
  const dbHost = new URL(LOCAL_URL).hostname;
  if (dbHost !== "127.0.0.1" && dbHost !== "localhost") {
    throw new Error(`refusing to run a mutating DB test against DB host ${dbHost}`);
  }
}
process.env.TEST_DATABASE_URL = LOCAL_URL;
process.env.DATABASE_URL = LOCAL_URL;
const LOCAL_SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
// Parse, do not prefix-match: `http://localhost:54321@prod.example` passes a
// naive prefix regex while actually resolving to prod.example.
const restHost = new URL(LOCAL_SUPABASE_URL).hostname;
if (restHost !== "127.0.0.1" && restHost !== "localhost") {
  throw new Error(`refusing to run a mutating DB test against REST host ${restHost}`);
}
process.env.SUPABASE_URL = LOCAL_SUPABASE_URL;

const { createTileRenderLedger } = await import("@/lib/crew/tileRenderLedger");
const { sweepTileRenderAlerts } = await import("@/lib/crew/sweepTileRenderAlerts");

const SHOW_ID = "7c7c7c7c-1111-4111-8111-7c7c7c7c7c7c";
const OBSERVER_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const OBSERVER_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const TILE = "crew:travel:transport";

function runPsql(sql: string): string {
  return execFileSync("psql", [LOCAL_URL, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function seedOpenAlert(tileId: string, viewerKey: string): void {
  runPsql(`
    insert into public.admin_alerts (show_id, code, context)
    values (
      ${sqlString(SHOW_ID)}::uuid,
      'TILE_SERVER_RENDER_FAILED',
      jsonb_build_object(
        'tileId', ${sqlString(tileId)},
        'message', 'seeded',
        'sheet_name', 'Seeded Show',
        'viewerKey', ${sqlString(viewerKey)}
      )
    );
  `);
}

/** The open row's observer, or "" when no open row remains. */
function openRowObserver(): string {
  return runPsql(`
    select coalesce(context->>'viewerKey', '')
      from public.admin_alerts
     where show_id = ${sqlString(SHOW_ID)}::uuid
       and code = 'TILE_SERVER_RENDER_FAILED'
       and resolved_at is null;
  `);
}

function resolvedByColumn(): string {
  return runPsql(`
    select coalesce(resolved_by, 'NULL')
      from public.admin_alerts
     where show_id = ${sqlString(SHOW_ID)}::uuid
       and code = 'TILE_SERVER_RENDER_FAILED'
       and resolved_at is not null
     order by raised_at desc limit 1;
  `);
}

function clean(tileIds: string[]) {
  const ledger = createTileRenderLedger();
  for (const id of tileIds) ledger.attempted.add(id);
  return ledger;
}

function sweepArgs(viewerKey: string) {
  return { showId: SHOW_ID, sheetName: "Seeded Show", viewerKey };
}

beforeEach(() => {
  runPsql(`delete from public.admin_alerts where show_id = ${sqlString(SHOW_ID)}::uuid;`);
  runPsql(`
    insert into public.shows (id, drive_file_id, slug, title, client_label, template_version)
    values (${sqlString(SHOW_ID)}::uuid, 'drive-tile-alert-resolution', 'tile-alert-resolution',
            'Tile Alert Resolution', 'Client', 'v1')
    on conflict (id) do nothing;
  `);
});

afterAll(() => {
  runPsql(`
    delete from public.admin_alerts where show_id = ${sqlString(SHOW_ID)}::uuid;
    delete from public.shows where id = ${sqlString(SHOW_ID)}::uuid;
  `);
});

describe("tile alert resolution, real rows", () => {
  // AC1
  test("the observer who saw it clean resolves their own row", async () => {
    seedOpenAlert(TILE, OBSERVER_A);
    await sweepTileRenderAlerts(clean([TILE]), sweepArgs(OBSERVER_A));
    expect(openRowObserver()).toBe("");
    expect(resolvedByColumn()).toBe("NULL");
  });

  // AC2 — the entire point of the observer key. Deleting the viewerKey filter
  // from the resolver must fail THIS test.
  test("a DIFFERENT observer's clean render leaves the row open", async () => {
    seedOpenAlert(TILE, OBSERVER_A);
    await sweepTileRenderAlerts(clean([TILE]), sweepArgs(OBSERVER_B));
    expect(openRowObserver()).toBe(OBSERVER_A);
  });

  // AC3 negative
  test("a plain-admin render does not clear a crew member's row", async () => {
    seedOpenAlert(TILE, OBSERVER_A);
    await sweepTileRenderAlerts(clean([TILE]), sweepArgs("admin"));
    expect(openRowObserver()).toBe(OBSERVER_A);
  });

  // AC3 positive: without this, a resolver using an impossible discriminator
  // whenever viewerKey === "admin" would pass every other case here.
  test("a plain-admin render DOES resolve an admin-bucket row", async () => {
    seedOpenAlert(TILE, "admin");
    await sweepTileRenderAlerts(clean([TILE]), sweepArgs("admin"));
    expect(openRowObserver()).toBe("");
  });

  // AC1 multi-tile: a mutant passing only cleanTileIds(ledger).slice(0, 1) would
  // pass a single-tile test while stranding every later clean tile.
  test("every clean tile is resolvable, not just the first", async () => {
    seedOpenAlert("crew:today:notes", OBSERVER_A);
    await sweepTileRenderAlerts(
      clean(["crew:crew:roster", "crew:gear:scope", "crew:today:notes"]),
      sweepArgs(OBSERVER_A),
    );
    expect(openRowObserver()).toBe("");
  });

  // AC5 — a tile that never rendered is not resolvable.
  test("an unattempted tile leaves its row open", async () => {
    seedOpenAlert("crew:budget:rows", OBSERVER_A);
    // Budget was not entitled this render, so it never enters `attempted`.
    await sweepTileRenderAlerts(clean([TILE]), sweepArgs(OBSERVER_A));
    expect(openRowObserver()).toBe(OBSERVER_A);
  });

  // The partial unique index permits ONE unresolved row per (show, code), so a
  // second observer's raise REPLACES the context wholesale, including viewerKey.
  // Observer A can then no longer resolve "their" row. Spec 4.6 documents this;
  // this test pins it so the documented behavior cannot drift silently, and so a
  // future reader sees it is known rather than accidental.
  test("a second observer's raise takes over the single row", async () => {
    seedOpenAlert(TILE, OBSERVER_A);

    const bFailing = createTileRenderLedger();
    bFailing.attempted.add(TILE);
    bFailing.failed.set(TILE, { message: "b broke", error: new Error("b broke") });
    await sweepTileRenderAlerts(bFailing, sweepArgs(OBSERVER_B));

    // One row, now owned by B.
    expect(openRowObserver()).toBe(OBSERVER_B);

    // A's clean render no longer matches it. The row stays open, which is the
    // safe direction: it still reports a real, current failure (B's).
    await sweepTileRenderAlerts(clean([TILE]), sweepArgs(OBSERVER_A));
    expect(openRowObserver()).toBe(OBSERVER_B);

    // B's own clean render clears it.
    await sweepTileRenderAlerts(clean([TILE]), sweepArgs(OBSERVER_B));
    expect(openRowObserver()).toBe("");
  });

  // AC7 — the accepted race is self-healing, against real rows.
  test("a spuriously resolved row is re-opened by the next failing sweep", async () => {
    seedOpenAlert(TILE, OBSERVER_A);
    await sweepTileRenderAlerts(clean([TILE]), sweepArgs(OBSERVER_A));
    expect(openRowObserver()).toBe("");

    const failing = createTileRenderLedger();
    failing.attempted.add(TILE);
    failing.failed.set(TILE, { message: "still broken", error: new Error("still broken") });
    await sweepTileRenderAlerts(failing, sweepArgs(OBSERVER_A));
    expect(openRowObserver()).toBe(OBSERVER_A);
  });
});
