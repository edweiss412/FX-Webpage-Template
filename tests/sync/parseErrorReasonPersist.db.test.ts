// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import postgres from "postgres";

describe("producer wiring", () => {
  it("builds its PARSE_ERROR_LAST_GOOD context via buildParseErrorContext, wiring phase1.code", () => {
    const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
    const i = src.indexOf('code: "PARSE_ERROR_LAST_GOOD"');
    const block = src.slice(i, i + 400);
    expect(block).toMatch(/buildParseErrorContext\(/);
    // the failure code must be WIRED, not a constant: the hard-fail result binding flows in.
    expect(block).toMatch(/failureCode:\s*phase1\.code/);
  });
});

// Local Supabase DB (the repo's established *.db.test.ts pattern): prefer an
// explicit LOCAL_TEST_DATABASE_URL, else the loopback default. TEST_DATABASE_URL
// in this worktree points at the remote pooler and must NOT be used here.
const DB =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// Full host-boundary match (the block does destructive cleanup): the host must be
// exactly a loopback name, followed by a port/path delimiter or end-of-string, so a
// remote like `postgres.example.com` is NOT accepted.
const loopback = /@(127\.0\.0\.1|localhost|postgres)([:/?]|$)/.test(DB);
const d = loopback ? describe : describe.skip;

d("upsert_admin_alert replaces context whole (latest error_code wins)", () => {
  let sql: ReturnType<typeof postgres>;
  const SHOW = "00000000-0000-4000-8000-0000000000a1";

  beforeAll(async () => {
    sql = postgres(DB!, { prepare: false });
    await sql`delete from public.admin_alerts where show_id = ${SHOW}::uuid`;
    // admin_alerts.show_id has a FK to shows, so the raise needs a real row.
    // Insert a dedicated fixture show (5 NOT-NULL columns) and tear it down after.
    await sql`
      insert into public.shows (id, drive_file_id, slug, title, client_label, template_version)
      values (${SHOW}::uuid, ${"drive-" + SHOW}, ${"parse-reason-fixture"}, ${"Parse Reason Fixture"}, ${"Fixture"}, ${"v1"})
      on conflict (id) do nothing`;
  });
  afterAll(async () => {
    await sql`delete from public.admin_alerts where show_id = ${SHOW}::uuid`;
    await sql`delete from public.shows where id = ${SHOW}::uuid`;
    await sql.end({ timeout: 5 });
  });

  const raise = (ctx: Record<string, unknown>) =>
    sql`select public.upsert_admin_alert(${SHOW}::uuid, 'PARSE_ERROR_LAST_GOOD', ${sql.json(
      ctx as Parameters<typeof sql.json>[0],
    )})`;
  const readCtx = async () => {
    const [r] = await sql<{ context: Record<string, unknown> }[]>`
      select context from public.admin_alerts
       where show_id = ${SHOW}::uuid and code = 'PARSE_ERROR_LAST_GOOD' and resolved_at is null`;
    return r?.context ?? null;
  };

  it("A then B: error_code is B (latest)", async () => {
    await raise({ drive_file_id: "f", sheet_name: "S", error_code: "MI-4_NO_CREW" });
    await raise({ drive_file_id: "f", sheet_name: "S", error_code: "MI-5_NO_ROOMS" });
    expect((await readCtx())?.error_code).toBe("MI-5_NO_ROOMS");
  });
  it("A then omitted: error_code disappears (whole-context replace)", async () => {
    await raise({ drive_file_id: "f", sheet_name: "S", error_code: "MI-4_NO_CREW" });
    await raise({ drive_file_id: "f", sheet_name: "S" });
    expect((await readCtx())?.error_code).toBeUndefined();
  });
});
