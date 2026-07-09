import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { buildMonitorDigestModel } from "@/lib/notify/monitorDigest";
import type { DigestBuilderSql } from "@/lib/notify/digest";

// Flow 6.2 §3 signal 2 / plan Task 6 Step 4: DB-integration filter proof for the
// autocorrect roll-up. Seeds an eligible applied sync_log row of a published show
// plus non-applied / unpublished / orphan rows and asserts only the eligible one counts.
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

const MARK = `f62af-${Date.now()}`;
const PUB = `${MARK}-pub`;
const UNPUB = `${MARK}-unpub`;
const ORPHAN = `${MARK}-orphan`;
const autofix = (code: string) => [{ code, severity: "warn", message: "x" }];

afterAll(async () => {
  if (!sql) return;
  await sql`delete from public.sync_log where drive_file_id in (${PUB}, ${UNPUB}, ${ORPHAN})`.catch(() => {});
  await sql`delete from public.shows where drive_file_id in (${PUB}, ${UNPUB})`.catch(() => {});
  await sql.end().catch(() => {});
});

describe.runIf(dbUp)("buildMonitorDigestModel — autofix DB filter proof", () => {
  test("counts only the applied row of a published show; excludes non-applied/unpublished/orphan", async () => {
    if (!sql) throw new Error("db not up");
    // Far-future window isolates from concurrent ~now() sibling .db.test.ts rows
    // (production query filter is occurred_at > windowStart, lower bound only).
    const inWin = "2099-01-01T10:00:00Z";

    await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${PUB}, ${MARK + "-ps"}, ${"Pub"}, ${"c"}, ${"v1"}, true)`;
    await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${UNPUB}, ${MARK + "-us"}, ${"Unpub"}, ${"c"}, ${"v1"}, false)`;

    const log = (drive: string, status: string, code: string) => sql!`
      insert into public.sync_log (drive_file_id, status, message, parse_warnings, occurred_at)
      values (${drive}, ${status}, ${status}, ${sql!.json(autofix(code))}, ${inWin})
    `;
    await log(PUB, "applied", "STAGE_WORD_AUTOCORRECTED"); // eligible (×1)
    await log(PUB, "applied", "STAGE_WORD_AUTOCORRECTED"); // eligible (×1) → total 2
    await log(PUB, "drive_error", "STAGE_WORD_AUTOCORRECTED"); // non-applied → excluded
    await log(UNPUB, "applied", "STAGE_WORD_AUTOCORRECTED"); // unpublished → excluded
    await log(ORPHAN, "applied", "STAGE_WORD_AUTOCORRECTED"); // orphan drive_file_id → excluded

    const r = await buildMonitorDigestModel(new Date("2099-01-01T12:00:00Z"), {
      sql: sql as unknown as DigestBuilderSql,
      getWatermark: async () => ({ kind: "value", watermark: new Date("2098-01-01T00:00:00Z") }),
    });

    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.model.autofix.total).toBe(2);
    expect(r.model.autofix.classes.STAGE_WORD_AUTOCORRECTED).toBe(2);
  });
});
