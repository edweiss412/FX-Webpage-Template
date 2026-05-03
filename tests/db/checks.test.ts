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

function runViolationProbe(sql: string, expectedCondition: string): string {
  const output = runPsql(`
    begin;
    create temp table task_2_5_probe (code text) on commit drop;

    do $$
    begin
      begin
        ${sql}
        insert into task_2_5_probe values ('NO_ERROR');
      exception
        when ${expectedCondition} then
          insert into task_2_5_probe values (sqlstate);
        when others then
          insert into task_2_5_probe values (sqlstate);
      end;
    end $$;

    select code from task_2_5_probe;
    rollback;
  `);
  const code = output.split("\n").find((line) => /^\d{5}$/.test(line));

  if (!code) {
    throw new Error(`Expected SQLSTATE probe output, got:\n${output}`);
  }

  return code;
}

function insertShowSql(suffix: string): string {
  return `
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (
      ${sqlString(`task-2-5-drive-${suffix}`)},
      ${sqlString(`task-2-5-${suffix}`)},
      'Task 2.5 Probe',
      'FXAV',
      'v1'
    )
  `;
}

describe("Task 2.5 runtime CHECK and uniqueness enforcement", () => {
  test("AC-2.3 crew_members_email_canonical rejects mixed-case email", () => {
    const suffix = randomUUID();
    const code = runViolationProbe(
      `
        ${insertShowSql(suffix)};
        insert into public.crew_members (show_id, name, email, role)
        select id, 'Alice Probe', 'Alice@FXAV.NET', 'A1'
          from public.shows
         where slug = ${sqlString(`task-2-5-${suffix}`)};
      `,
      "check_violation",
    );

    expect(code).toBe("23514");
  });

  test("AC-2.2 crew_members_show_email_unique rejects duplicate non-null show email", () => {
    const suffix = randomUUID();
    const email = `duplicate-${suffix}@fxav.test`;
    const code = runViolationProbe(
      `
        ${insertShowSql(suffix)};
        insert into public.crew_members (show_id, name, email, role)
        select id, 'Duplicate One', ${sqlString(email)}, 'A1'
          from public.shows
         where slug = ${sqlString(`task-2-5-${suffix}`)};
        insert into public.crew_members (show_id, name, email, role)
        select id, 'Duplicate Two', ${sqlString(email)}, 'A2'
          from public.shows
         where slug = ${sqlString(`task-2-5-${suffix}`)};
      `,
      "unique_violation",
    );

    expect(code).toBe("23505");
  });

  test("AC-2.4 revoked_links_token_version_positive rejects token_version 0", () => {
    const suffix = randomUUID();
    const code = runViolationProbe(
      `
        ${insertShowSql(suffix)};
        insert into public.revoked_links (show_id, crew_name, token_version)
        select id, 'Version Zero', 0
          from public.shows
         where slug = ${sqlString(`task-2-5-${suffix}`)};
      `,
      "check_violation",
    );

    expect(code).toBe("23514");
  });

  test("transportation unique(show_id) rejects duplicate transportation rows", () => {
    const suffix = randomUUID();
    const code = runViolationProbe(
      `
        ${insertShowSql(suffix)};
        insert into public.transportation (show_id, driver_name)
        select id, 'Driver One'
          from public.shows
         where slug = ${sqlString(`task-2-5-${suffix}`)};
        insert into public.transportation (show_id, driver_name)
        select id, 'Driver Two'
          from public.shows
         where slug = ${sqlString(`task-2-5-${suffix}`)};
      `,
      "unique_violation",
    );

    expect(code).toBe("23505");
  });

  test("crew_member_auth survives crew_members delete and re-add", () => {
    const suffix = randomUUID();
    const name = `Durability ${suffix}`;
    const email = `durability-${suffix}@fxav.test`;

    const output = runPsql(`
      begin;

      ${insertShowSql(suffix)};

      insert into public.crew_members (show_id, name, email, role)
      select id, ${sqlString(name)}, ${sqlString(email)}, 'A1'
        from public.shows
       where slug = ${sqlString(`task-2-5-${suffix}`)};

      insert into public.crew_member_auth (
        show_id,
        crew_name,
        current_token_version,
        max_issued_version,
        revoked_below_version
      )
      select id, ${sqlString(name)}, 7, 9, 4
        from public.shows
       where slug = ${sqlString(`task-2-5-${suffix}`)};

      delete from public.crew_members
       where show_id = (select id from public.shows where slug = ${sqlString(`task-2-5-${suffix}`)})
         and name = ${sqlString(name)};

      select 'after_delete=' ||
        current_token_version || ',' || max_issued_version || ',' || revoked_below_version
        from public.crew_member_auth
       where show_id = (select id from public.shows where slug = ${sqlString(`task-2-5-${suffix}`)})
         and crew_name = ${sqlString(name)};

      insert into public.crew_members (show_id, name, email, role)
      select id, ${sqlString(name)}, ${sqlString(email)}, 'A2'
        from public.shows
       where slug = ${sqlString(`task-2-5-${suffix}`)};

      insert into public.crew_member_auth (show_id, crew_name)
      select id, ${sqlString(name)}
        from public.shows
       where slug = ${sqlString(`task-2-5-${suffix}`)}
      on conflict (show_id, crew_name) do nothing;

      select 'after_readd=' ||
        current_token_version || ',' || max_issued_version || ',' || revoked_below_version
        from public.crew_member_auth
       where show_id = (select id from public.shows where slug = ${sqlString(`task-2-5-${suffix}`)})
         and crew_name = ${sqlString(name)};

      rollback;
    `);

    expect(output.split("\n").filter((line) => line.startsWith("after_"))).toEqual([
      "after_delete=7,9,4",
      "after_readd=7,9,4",
    ]);
  });

  test("no global sync cursor identifier appears in source or tests", () => {
    const forbidden = "last" + "PollAt";

    try {
      const matches = execFileSync("rg", ["-n", forbidden, "lib", "app", "supabase", "tests"], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
      }).trim();

      expect(matches).toBe("");
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 1) {
        expect(true).toBe(true);
        return;
      }
      throw error;
    }
  });
});
