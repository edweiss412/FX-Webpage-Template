import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { buildMonitorDigestModel } from "@/lib/notify/monitorDigest";
import type { DigestBuilderSql } from "@/lib/notify/digest";

// Flow 6.2 new-show-gaps §3.2 / plan Task 2: DB-integration filter proof. Proves the
// first-seen complement of drift — a published show with a `current` applied sync but NO
// `baseline` row is reported; a baselined / unpublished / orphan show is excluded.
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, {
    max: 2,
    idle_timeout: 2,
    connect_timeout: 3,
    prepare: false,
  });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

const MARK = `f62ng-${Date.now()}`;
const FIRST = `${MARK}-first`;
const BASED = `${MARK}-based`;
const UNPUB = `${MARK}-unpub`;
const ORPHAN = `${MARK}-orphan`;
const gap = (code: string) => [{ code, severity: "warn", message: "x" }];

afterAll(async () => {
  if (!sql) return;
  await sql`delete from public.sync_log where drive_file_id in (${FIRST}, ${BASED}, ${UNPUB}, ${ORPHAN})`.catch(
    () => {},
  );
  await sql`delete from public.shows where drive_file_id in (${FIRST}, ${BASED}, ${UNPUB})`.catch(
    () => {},
  );
  await sql.end().catch(() => {});
});

describe.runIf(dbUp)("buildMonitorDigestModel — new-show-gaps DB filter proof", () => {
  test("reports only the first-seen published show's gap; excludes baselined/unpublished/orphan", async () => {
    if (!sql) throw new Error("db not up");
    // Far-future window isolates from concurrent ~now() sibling .db.test.ts rows
    // (production filter is occurred_at-lower-bound only).
    const pre = "2097-01-01T10:00:00Z"; // <= windowStart (would-be baseline)
    const curr = "2099-01-01T10:00:00Z"; // > windowStart

    const mkShow = (drive: string, slug: string, pub: boolean) =>
      sql!`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${drive}, ${slug}, ${"T"}, ${"c"}, ${"v1"}, ${pub})`;
    await mkShow(FIRST, MARK + "-fs", true);
    await mkShow(BASED, MARK + "-bs", true);
    await mkShow(UNPUB, MARK + "-us", false);

    const log = (drive: string, status: string, code: string | null, at: string) => sql!`
      insert into public.sync_log (drive_file_id, status, message, parse_warnings, occurred_at)
      values (${drive}, ${status}, ${status}, ${sql!.json(code ? gap(code) : [])}, ${at})`;

    // First-seen published: only a current row with a gap → REPORTED.
    await log(FIRST, "applied", "ROOM_HEADER_SPLIT_AMBIGUOUS", curr);
    // Baselined published: has a prior applied row → NOT reported (drift owns it).
    await log(BASED, "applied", "ROOM_HEADER_SPLIT_AMBIGUOUS", pre);
    await log(BASED, "applied", "ROOM_HEADER_SPLIT_AMBIGUOUS", curr);
    // Unpublished first-seen: excluded by s.published = true.
    await log(UNPUB, "applied", "ROOM_HEADER_SPLIT_AMBIGUOUS", curr);
    // Orphan first-seen (no shows row): excluded by inner join.
    await log(ORPHAN, "applied", "ROOM_HEADER_SPLIT_AMBIGUOUS", curr);

    const r = await buildMonitorDigestModel(new Date("2099-01-01T12:00:00Z"), {
      sql: sql as unknown as DigestBuilderSql,
      getWatermark: async () => ({ kind: "value", watermark: new Date("2098-01-01T00:00:00Z") }),
    });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.model.newShowGaps.map((g) => g.slug)).toEqual([MARK + "-fs"]);
    expect(r.model.newShowGaps[0]!.items).toEqual(["unclear room split"]);
  });
});
