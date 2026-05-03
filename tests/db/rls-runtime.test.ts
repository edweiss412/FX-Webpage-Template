import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function runPsql(sql: string): string {
  return execFileSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"],
    { input: sql, encoding: "utf8" },
  ).trim();
}

describe("RLS runtime behavior", () => {
  test("matching crew can select only published rows while admins can select unpublished rows", () => {
    const suffix = randomUUID();
    const crewEmail = `crew-${suffix}@example.com`;
    const publishedSlug = `rls-published-${suffix}`;
    const unpublishedSlug = `rls-unpublished-${suffix}`;
    const otherSlug = `rls-other-${suffix}`;

    const output = runPsql(`
      begin;

      insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values
        ('drive-${publishedSlug}', '${publishedSlug}', 'Published', 'Client', 'v1', true),
        ('drive-${unpublishedSlug}', '${unpublishedSlug}', 'Unpublished', 'Client', 'v1', false),
        ('drive-${otherSlug}', '${otherSlug}', 'Other', 'Client', 'v1', true);

      insert into public.crew_members (show_id, name, email, role)
      select id, 'Crew Member', ${sqlString(crewEmail)}, 'A1'
        from public.shows
       where slug in ('${publishedSlug}', '${unpublishedSlug}');

      insert into public.crew_members (show_id, name, email, role)
      select id, 'Other Member', 'other-${suffix}@example.com', 'A1'
        from public.shows
       where slug = '${otherSlug}';

      set local role authenticated;
      set local request.jwt.claims = '{"email":"${crewEmail.toUpperCase()}","app_metadata":{"role":"crew"}}';
      select 'crew_shows=' || coalesce(string_agg(slug, ',' order by slug), '')
        from public.shows
       where slug like 'rls-%-${suffix}';
      select 'crew_members=' || count(*)
        from public.crew_members
       where show_id in (select id from public.shows where slug like 'rls-%-${suffix}');

      reset role;
      set local role authenticated;
      set local request.jwt.claims = '{"email":"viewer-${suffix}@example.com","app_metadata":{"role":"admin"}}';
      select 'admin_shows=' || coalesce(string_agg(slug, ',' order by slug), '')
        from public.shows
       where slug like 'rls-%-${suffix}';

      reset role;
      set local role authenticated;
      set local request.jwt.claims = '{"email":"crew-${suffix}@example.com","app_metadata":{"role":"crew"}}';
      select 'crew_app_settings=' || count(*) from public.app_settings;

      rollback;
    `);
    const lines = output.split("\n");
    const crewShows = lines.find((line) => line.startsWith("crew_shows="));
    const adminShows = lines.find((line) => line.startsWith("admin_shows="));

    expect(crewShows).toBe(`crew_shows=${publishedSlug}`);
    expect(output).toContain("crew_members=1");
    expect(adminShows).toBe(
      `admin_shows=${otherSlug},${publishedSlug},${unpublishedSlug}`,
    );
    expect(output).toContain("crew_app_settings=0");
  });
});
