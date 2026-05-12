import { execFileSync } from "node:child_process";

export const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function seedShow(showId: string, slug: string): void {
  runPsql(`
    insert into public.shows (id, drive_file_id, slug, title, client_label, template_version)
    values (
      ${sqlString(showId)}::uuid,
      ${sqlString(`drive-${slug}`)},
      ${sqlString(slug)},
      ${sqlString(`Show ${slug}`)},
      'Client',
      'v1'
    )
    on conflict (id) do nothing;
  `);
}

export function cleanupReportFixtures(showId: string, identities: string[]): void {
  runPsql(`
    delete from public.reports where show_id = ${sqlString(showId)}::uuid;
    delete from public.report_rate_limits
     where identity in (${identities.map(sqlString).join(", ")});
    delete from public.shows where id = ${sqlString(showId)}::uuid;
  `);
}

export function reportRows(idempotencyKey: string): string[] {
  const raw = runPsql(`
    select reported_by_kind || ':' || reported_by || ':' || coalesce(reporter_role, '') || ':' || coalesce(github_issue_url, '')
      from public.reports
     where idempotency_key = ${sqlString(idempotencyKey)}::uuid
     order by created_at;
  `);
  return raw ? raw.split("\n") : [];
}

export function quotaCount(identity: string): number {
  return Number(
    runPsql(`
      select coalesce(sum(count), 0)::int
        from public.report_rate_limits
       where identity = ${sqlString(identity)};
    `),
  );
}
