import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { buildMonitorDigestModel } from "@/lib/notify/monitorDigest";
import type { DigestBuilderSql } from "@/lib/notify/digest";

// Flow 6.2 §3.1 / plan Task 7 Step 4: DB-integration filter proof for drift. Proves
// status='applied' AND s.published AND the inner join (the round-3/4 contamination
// guard): a non-applied row must not become the current row; unpublished + orphan
// rows must not enter the candidate set.
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, { max: 2, idle_timeout: 2, connect_timeout: 3, prepare: false });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

const MARK = `f62dr-${Date.now()}`;
const PUB = `${MARK}-pub`;
const UNPUB = `${MARK}-unpub`;
const ORPHAN = `${MARK}-orphan`;
const gaps = (n: number) => Array(n).fill({ code: "FIELD_UNREADABLE", severity: "warn", message: "x" });

afterAll(async () => {
  if (!sql) return;
  await sql`delete from public.sync_log where drive_file_id in (${PUB}, ${UNPUB}, ${ORPHAN})`.catch(() => {});
  await sql`delete from public.shows where drive_file_id in (${PUB}, ${UNPUB})`.catch(() => {});
  await sql.end().catch(() => {});
});

describe.runIf(dbUp)("buildMonitorDigestModel — drift DB filter proof", () => {
  test("reports only the published show's 10→11; excludes non-applied-current/unpublished/orphan", async () => {
    if (!sql) throw new Error("db not up");
    const baseTime = "2026-07-07T10:00:00Z"; // <= windowStart
    const currTime = "2026-07-08T10:00:00Z"; // > windowStart
    const latestTime = "2026-07-08T11:00:00Z"; // even later — the drive_error row

    await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${PUB}, ${MARK + "-ps"}, ${"Pub"}, ${"c"}, ${"v1"}, true)`;
    await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${UNPUB}, ${MARK + "-us"}, ${"Unpub"}, ${"c"}, ${"v1"}, false)`;

    const log = (drive: string, status: string, n: number, at: string) => sql!`
      insert into public.sync_log (drive_file_id, status, message, parse_warnings, occurred_at)
      values (${drive}, ${status}, ${status}, ${sql!.json(gaps(n))}, ${at})
    `;

    // Published show: baseline 10, current 11 → REPORTED (sub-threshold).
    await log(PUB, "applied", 10, baseTime);
    await log(PUB, "applied", 11, currTime);
    // A NON-applied row at the LATEST time — must NOT become the current row.
    await log(PUB, "drive_error", 0, latestTime);
    // Unpublished show with real drift → excluded.
    await log(UNPUB, "applied", 10, baseTime);
    await log(UNPUB, "applied", 20, currTime);
    // Applied orphan (no matching shows row) with drift → excluded.
    await log(ORPHAN, "applied", 10, baseTime);
    await log(ORPHAN, "applied", 11, currTime);

    const r = await buildMonitorDigestModel(new Date("2026-07-08T12:00:00Z"), {
      sql: sql as unknown as DigestBuilderSql,
      getWatermark: async () => ({ kind: "value", watermark: new Date("2026-07-08T00:00:00Z") }),
    });

    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.model.drift.map((d) => d.slug)).toEqual([MARK + "-ps"]);
    expect(r.model.drift[0].classes).toEqual([{ label: "unreadable field", prior: 10, curr: 11 }]);
  });
});
