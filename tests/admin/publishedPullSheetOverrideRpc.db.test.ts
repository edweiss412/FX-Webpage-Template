import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import postgres from "postgres";

/**
 * set_published_pull_sheet_override RPC (spec 2026-07-23 §3.2), real DB.
 * Failure modes caught: lifecycle-guard bypass (archived/unpublished/missing rows writable),
 * CAS lost-update, structural-vs-text CAS drift, malformed-row permanent 40001 lock-out,
 * grant leak to authenticated/anon.
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const loopback = /127\.0\.0\.1|localhost/.test(LOCAL_URL);
const d = loopback ? describe : describe.skip;

const DFID = "test-pso-dfid-1";
const SIG = "set_published_pull_sheet_override(text,text,text,text,jsonb)";

d("set_published_pull_sheet_override", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(LOCAL_URL, { max: 1 });
  });
  afterAll(async () => {
    await sql`delete from public.shows where drive_file_id = ${DFID}`;
    await sql.end();
  });
  beforeEach(async () => {
    await sql`delete from public.shows where drive_file_id = ${DFID}`;
    await sql`insert into public.shows
        (id, drive_file_id, slug, title, client_label, template_version, published, archived)
      values (gen_random_uuid(), ${DFID}, 'test-pso-slug-1', 'PSO Test', 'PSO Client', 'v4', true, false)`;
  });

  test("accept with null snapshot writes the 4-field override", async () => {
    const [row] = await sql`
      select public.set_published_pull_sheet_override(${DFID}, 'OLD PULL SHEET', 'fp1', 'a@b.com', null) as out`;
    const out = row!.out as { override: Record<string, unknown> };
    expect(out.override.tabName).toBe("OLD PULL SHEET");
    expect(out.override.fingerprint).toBe("fp1");
    expect(out.override.acceptedBy).toBe("a@b.com");
    expect(typeof out.override.acceptedAt).toBe("string");
  });

  test("CAS: stale null snapshot after an accept raises 40001", async () => {
    await sql`
      select public.set_published_pull_sheet_override(${DFID}, 'OLD PULL SHEET', 'fp1', 'a@b.com', null)`;
    await expect(
      sql`select public.set_published_pull_sheet_override(${DFID}, 'OLD PULL SHEET', 'fp2', 'a@b.com', null)`,
    ).rejects.toMatchObject({ code: "40001" });
  });

  test("structural CAS: revoke matches the two-field projection of the stored 4-field object", async () => {
    await sql`
      select public.set_published_pull_sheet_override(${DFID}, 'OLD PULL SHEET', 'fp1', 'a@b.com', null)`;
    const [row] = await sql`
      select public.set_published_pull_sheet_override(${DFID}, null, null, 'a@b.com',
        ${sql.json({ tabName: "OLD PULL SHEET", fingerprint: "fp1" })}) as out`;
    expect((row!.out as { override: unknown }).override).toBeNull();
  });

  test("well-formed row with a missing field: absent key projects to JSON null, revoke matches", async () => {
    await sql`update public.shows set pull_sheet_override = ${sql.json({ tabName: "x" })}
              where drive_file_id = ${DFID}`;
    const [row] = await sql`
      select public.set_published_pull_sheet_override(${DFID}, null, null, 'a@b.com',
        ${sql.json({ tabName: "x", fingerprint: null })}) as out`;
    expect((row!.out as { override: unknown }).override).toBeNull();
  });

  test("malformed row (non-string field types): revoke skips CAS and succeeds", async () => {
    await sql`update public.shows set pull_sheet_override = ${sql.json({ tabName: 123, fingerprint: false })}
              where drive_file_id = ${DFID}`;
    const [row] = await sql`
      select public.set_published_pull_sheet_override(${DFID}, null, null, 'a@b.com',
        ${sql.json({ tabName: null, fingerprint: null })}) as out`;
    expect((row!.out as { override: unknown }).override).toBeNull();
  });

  test("malformed row: accept raises 40001 (belt-and-suspenders)", async () => {
    await sql`update public.shows set pull_sheet_override = ${sql.json({ tabName: 123, fingerprint: false })}
              where drive_file_id = ${DFID}`;
    await expect(
      sql`select public.set_published_pull_sheet_override(${DFID}, 'T', 'fp', 'a@b.com',
            ${sql.json({ tabName: null, fingerprint: null })})`,
    ).rejects.toMatchObject({ code: "40001" });
  });

  test("archived row (legacy archived && published) raises 55000", async () => {
    await sql`update public.shows set archived = true where drive_file_id = ${DFID}`;
    await expect(
      sql`select public.set_published_pull_sheet_override(${DFID}, 'T', 'fp', 'a@b.com', null)`,
    ).rejects.toMatchObject({ code: "55000" });
  });

  test("unpublished row raises 55000; missing row raises P0002", async () => {
    await sql`update public.shows set published = false where drive_file_id = ${DFID}`;
    await expect(
      sql`select public.set_published_pull_sheet_override(${DFID}, 'T', 'fp', 'a@b.com', null)`,
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      sql`select public.set_published_pull_sheet_override('no-such-dfid', 'T', 'fp', 'a@b.com', null)`,
    ).rejects.toMatchObject({ code: "P0002" });
  });

  test("accept path rejects empty fingerprint/actor and empty drive_file_id with 22023", async () => {
    await expect(
      sql`select public.set_published_pull_sheet_override(${DFID}, 'T', '', 'a@b.com', null)`,
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      sql`select public.set_published_pull_sheet_override(${DFID}, 'T', 'fp', '', null)`,
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      sql`select public.set_published_pull_sheet_override('', 'T', 'fp', 'a@b.com', null)`,
    ).rejects.toMatchObject({ code: "22023" });
  });

  test("empty p_drive_file_id raises 22023 (before any row read)", async () => {
    await expect(
      sql`select public.set_published_pull_sheet_override('', null, null, 'a@b.com', null)`,
    ).rejects.toMatchObject({ code: "22023" });
  });

  test("edge-whitespace tab name is stored VERBATIM (no trim)", async () => {
    const [row] = await sql`
      select public.set_published_pull_sheet_override(${DFID}, ${" OLD PULL SHEET "}, 'fpw', 'a@b.com', null) as out`;
    expect((row!.out as { override: { tabName: string } }).override.tabName).toBe(
      " OLD PULL SHEET ",
    );
    const [db] =
      await sql`select pull_sheet_override->>'tabName' as t from public.shows where drive_file_id = ${DFID}`;
    expect(db!.t).toBe(" OLD PULL SHEET ");
  });

  test("EXECUTE is revoked from authenticated and anon but granted to service_role", async () => {
    const [row] = await sql`
      select has_function_privilege('authenticated', ${SIG}, 'EXECUTE') as a,
             has_function_privilege('anon', ${SIG}, 'EXECUTE') as b,
             has_function_privilege('service_role', ${SIG}, 'EXECUTE') as c`;
    expect(row).toEqual({ a: false, b: false, c: true });
  });
});
