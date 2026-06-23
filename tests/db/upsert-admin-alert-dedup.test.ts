import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

/**
 * Validation-backed proof of the §6 upsert_admin_alert failedKeys-union-merge
 * semantics (migration 20260618000000). Runs against TEST_DATABASE_URL (the
 * validation project in x-audits.yml; locally, the dev DB). `gen:schema-manifest`
 * does NOT capture functions, and `validation-schema-parity` only checks
 * tables/columns — so this live RPC test is the ONLY guard that the surgical
 * function apply actually landed in validation. Skipped when no DB_URL.
 *
 * Connection pattern mirrors tests/notify/deliver-real-db.test.ts.
 */
const DB_URL = process.env.TEST_DATABASE_URL;
const CODE = "TILE_PROJECTION_FETCH_FAILED";
// The viewer-independent constant message the CrewShell producer sends (R3-HIGH-1).
const MESSAGE =
  "One or more crew-page data sources failed to load; the affected domains are listed in the alert detail.";

const sql = DB_URL ? postgres(DB_URL, { max: 2, prepare: false }) : null;

afterAll(async () => {
  if (sql) await sql.end({ timeout: 5 });
});

async function makeShow(tag: string): Promise<string> {
  const suffix = `tpff-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [show] = await sql!<{ id: string }[]>`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived)
    values (${`drive-${suffix}`}, ${`show-${suffix}`}, 'TPFF Dedup', 'Client', 'v4', true, false)
    returning id
  `;
  return show!.id;
}

async function cleanup(showId: string): Promise<void> {
  await sql!`delete from public.admin_alerts where show_id = ${showId}::uuid`;
  await sql!`delete from public.shows where id = ${showId}::uuid`;
}

function ctx(
  failedKeys: readonly string[] | null,
  message: string = MESSAGE,
): Record<string, string | string[]> {
  const base: Record<string, string | string[]> = {
    sheet_name: "TPFF Dedup",
    tileId: "crew:projection-alert",
    message,
  };
  if (failedKeys) base.failedKeys = [...failedKeys];
  return base;
}

async function upsert(showId: string, context: Record<string, string | string[]>): Promise<void> {
  await sql!`select public.upsert_admin_alert(${showId}::uuid, ${CODE}, ${sql!.json(context)})`;
}

type Row = {
  failed_keys: string[] | null;
  occurrence_count: number;
  // microsecond-precision epoch as text — avoids Date ms-truncation when comparing
  last_seen_us: string;
  has_last_counted: boolean;
  message: string | null;
};

async function readRow(showId: string): Promise<Row> {
  const [row] = await sql!<Row[]>`
    select
      context->'failedKeys' as failed_keys,
      occurrence_count,
      (floor(extract(epoch from last_seen_at) * 1e6)::bigint)::text as last_seen_us,
      (context ? 'lastCountedAt') as has_last_counted,
      context->>'message' as message
    from public.admin_alerts
    where show_id = ${showId}::uuid and code = ${CODE}
  `;
  return row!;
}

describe.skipIf(!DB_URL)("upsert_admin_alert failedKeys union-merge (validation-backed §6)", () => {
  test("union-merge never shrinks: a subset render preserves all prior domains (R41/R43)", async () => {
    const showId = await makeShow("noshrink");
    try {
      await upsert(showId, ctx(["rooms", "financials", "transportation"]));
      await upsert(showId, ctx(["rooms"]));
      const row = await readRow(showId);
      // sorted distinct union, NOT the smaller second set
      expect(row.failed_keys).toEqual(["financials", "rooms", "transportation"]);
    } finally {
      await cleanup(showId);
    }
  });

  test("union grows when a new domain appears", async () => {
    const showId = await makeShow("grow");
    try {
      await upsert(showId, ctx(["rooms"]));
      await upsert(showId, ctx(["rooms", "hotel"]));
      const row = await readRow(showId);
      expect(row.failed_keys).toEqual(["hotel", "rooms"]);
    } finally {
      await cleanup(showId);
    }
  });

  test("write-debounce no-op: same failedKeys + same message in-window does not churn last_seen or count (R39)", async () => {
    const showId = await makeShow("debounce");
    try {
      await upsert(showId, ctx(["rooms", "hotel"]));
      const before = await readRow(showId);
      await upsert(showId, ctx(["rooms", "hotel"]));
      const after = await readRow(showId);
      expect(after.occurrence_count).toBe(before.occurrence_count); // not incremented
      expect(after.last_seen_us).toBe(before.last_seen_us); // byte-identical row (true no-op)
      expect(after.failed_keys).toEqual(["hotel", "rooms"]);
    } finally {
      await cleanup(showId);
    }
  });

  test("mixed-viewer consistency + no-churn: a subset crew render after a lead render holds the union with the SAME constant message (R3-HIGH-1)", async () => {
    const showId = await makeShow("mixed");
    try {
      // lead render observes financials too
      await upsert(showId, ctx(["rooms", "financials", "transportation"]));
      const lead = await readRow(showId);
      // ordinary-crew render: subset (no financials), SAME viewer-independent message, in-window
      await upsert(showId, ctx(["rooms", "transportation"]));
      const crew = await readRow(showId);
      expect(crew.failed_keys).toEqual(["financials", "rooms", "transportation"]); // financials preserved
      expect(crew.message).toBe(MESSAGE); // message consistent with the union, unchanged
      expect(crew.occurrence_count).toBe(lead.occurrence_count); // no count churn
      expect(crew.last_seen_us).toBe(lead.last_seen_us); // true no-op (the whole point of the constant message)
    } finally {
      await cleanup(showId);
    }
  });

  test("union-grow in-window updates context + last_seen but does NOT increment occurrence_count", async () => {
    const showId = await makeShow("growupdate");
    try {
      await upsert(showId, ctx(["rooms"]));
      const before = await readRow(showId);
      await upsert(showId, ctx(["hotel"])); // union grows to {hotel,rooms}
      const after = await readRow(showId);
      expect(after.failed_keys).toEqual(["hotel", "rooms"]);
      expect(after.occurrence_count).toBe(before.occurrence_count); // in-window: not counted
      expect(BigInt(after.last_seen_us)).toBeGreaterThan(BigInt(before.last_seen_us)); // but last_seen advances
    } finally {
      await cleanup(showId);
    }
  });

  test("window expiry: an out-of-window sighting increments occurrence_count", async () => {
    const showId = await makeShow("expiry");
    try {
      await upsert(showId, ctx(["rooms"]));
      const before = await readRow(showId);
      // back-date the debounce window past 10 minutes
      await sql!`
        update public.admin_alerts
        set context = jsonb_set(context, '{lastCountedAt}', to_jsonb((now() - interval '20 minutes')))
        where show_id = ${showId}::uuid and code = ${CODE}
      `;
      await upsert(showId, ctx(["rooms"])); // same domain, but out of window
      const after = await readRow(showId);
      expect(after.occurrence_count).toBe(before.occurrence_count + 1);
    } finally {
      await cleanup(showId);
    }
  });

  test("concurrency: two near-concurrent upserts merge the union and count at most once", async () => {
    const showId = await makeShow("concurrent");
    try {
      await Promise.all([upsert(showId, ctx(["rooms"])), upsert(showId, ctx(["hotel"]))]);
      const row = await readRow(showId);
      expect(row.failed_keys).toEqual(["hotel", "rooms"]); // union preserved under the race
      expect(row.occurrence_count).toBeGreaterThanOrEqual(1);
      expect(row.occurrence_count).toBeLessThanOrEqual(2); // in-window debounce caps the count
    } finally {
      await cleanup(showId);
    }
  });

  test("backward-compat: a no-failedKeys producer increments every call and stores context byte-for-byte (no lastCountedAt)", async () => {
    const showId = await makeShow("bc");
    try {
      // SHEET_UNAVAILABLE-style producer (no failedKeys key)
      const plain = { sheet_name: "TPFF Dedup", source: "legacy" };
      await sql!`select public.upsert_admin_alert(${showId}::uuid, ${CODE}, ${sql!.json(plain)})`;
      await sql!`select public.upsert_admin_alert(${showId}::uuid, ${CODE}, ${sql!.json(plain)})`;
      const row = await readRow(showId);
      expect(row.occurrence_count).toBe(2); // increments on every call (old behavior)
      expect(row.has_last_counted).toBe(false); // no lastCountedAt injected for non-failedKeys context
      expect(row.failed_keys).toBeNull();
    } finally {
      await cleanup(showId);
    }
  });
});
