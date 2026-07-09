import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { buildMonitorDigestModel } from "@/lib/notify/monitorDigest";
import type { DigestBuilderSql } from "@/lib/notify/digest";

// Flow 6.2 §3 / plan Task 5 Step 7: DB-integration filter proof. A fake sql cannot
// prove the WHERE clauses; this seeds ONE eligible + FIVE excluded show_change_log
// rows against real Postgres and asserts the query returns only the eligible one.
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

const MARK = `f62aa-${Date.now()}`;
const DRIVE = `${MARK}-drive`;

afterAll(async () => {
  if (!sql) return;
  await sql`delete from public.show_change_log where drive_file_id = ${DRIVE}`.catch(() => {});
  await sql`delete from public.shows where drive_file_id = ${DRIVE}`.catch(() => {});
  await sql.end().catch(() => {});
});

describe.runIf(dbUp)("buildMonitorDigestModel — auto-applied DB filter proof", () => {
  test("returns ONLY the eligible row; excludes acked/pre-window/non-auto_apply/off-kind/non-applied", async () => {
    if (!sql) throw new Error("db not up");
    // Far-future window: the production query filters occurred_at > windowStart (lower
    // bound only), so any concurrent sibling .db.test.ts row at ~now() (< 2098) is
    // excluded — this test is isolated from shared-Postgres pollution.
    const windowStart = new Date("2098-01-01T00:00:00Z");
    const inWin = "2099-01-01T10:00:00Z";
    const preWin = "2097-01-01T10:00:00Z";

    const showRows = await sql<{ id: string }[]>`
      insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${DRIVE}, ${MARK + "-slug"}, ${"Marked Show"}, ${"client"}, ${"v1"}, true)
      returning id
    `;
    const showId = showRows[0]!.id;

    const base = (
      source: string,
      changeKind: string,
      status: string,
      summary: string,
      occurredAt: string,
      acked: boolean,
    ) => sql`
      insert into public.show_change_log
        (show_id, drive_file_id, source, change_kind, summary, status, occurred_at, acknowledged_at)
      values (${showId}, ${DRIVE}, ${source}, ${changeKind}, ${summary}, ${status}, ${occurredAt},
              ${acked ? occurredAt : null})
    `;

    await base("auto_apply", "crew_added", "applied", "ELIGIBLE Added Jane", inWin, false); // eligible
    await base("auto_apply", "crew_added", "applied", "EXCL acked", inWin, true); // acked
    await base("auto_apply", "crew_added", "applied", "EXCL prewindow", preWin, false); // pre-window
    await base("undo", "crew_added", "applied", "EXCL undo-source", inWin, false); // non-auto_apply
    await base("auto_apply", "some_other_kind", "applied", "EXCL off-kind", inWin, false); // off-list kind
    await base("auto_apply", "crew_added", "undone", "EXCL undone-status", inWin, false); // non-applied status

    const r = await buildMonitorDigestModel(new Date("2099-01-01T12:00:00Z"), {
      sql: sql as unknown as DigestBuilderSql,
      getWatermark: async () => ({ kind: "value", watermark: windowStart }),
    });

    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    const items = r.model.autoApplied.flatMap((g) => g.items);
    expect(items).toEqual(["ELIGIBLE Added Jane"]);
  });
});
