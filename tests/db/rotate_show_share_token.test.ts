import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const ADMIN_JWT = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000020",
  email: "dlarson@fxav.net",
  app_metadata: { role: "admin" },
});

const CREW_JWT = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000021",
  email: "crew@example.com",
  app_metadata: { role: "crew" },
});

function seedShowSql(driveFileId: string): string {
  return `
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${sqlString(driveFileId)}, ${sqlString(driveFileId)}, 'Rotate RPC Test', 'FXAV', 'v4')
  `;
}

describe("rotate_show_share_token RPC", () => {
  test("atomically rotates share_token and bumps picker_epoch", () => {
    const driveFileId = `rotate-rpc-${randomUUID()}`;
    const out = runPsql(`
      begin;
      ${seedShowSql(driveFileId)};
      select 'before=' || t.share_token || ':' || s.picker_epoch
        from public.shows s
        join public.show_share_tokens t on t.show_id = s.id
       where s.drive_file_id = ${sqlString(driveFileId)};
      select pg_sleep(0.01);
      set local role authenticated;
      set local request.jwt.claims = ${sqlString(ADMIN_JWT)};
      select 'result=' || new_share_token || ':' || new_epoch
        from public.rotate_show_share_token(
          (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
        );
      reset role;
      select 'after=' || t.share_token || ':' || s.picker_epoch || ':' ||
             (t.rotated_at is not null) || ':' ||
             (s.picker_epoch_bumped_at > s.created_at)
        from public.shows s
        join public.show_share_tokens t on t.show_id = s.id
       where s.drive_file_id = ${sqlString(driveFileId)};
      rollback;
    `);

    const before = out.split("\n").find((line) => line.startsWith("before="));
    const result = out.split("\n").find((line) => line.startsWith("result="));
    const after = out.split("\n").find((line) => line.startsWith("after="));
    if (!before || !result || !after) throw new Error(`Unexpected psql output:\n${out}`);

    const [oldToken, beforeEpoch] = before.slice("before=".length).split(":");
    const [newToken, resultEpoch] = result.slice("result=".length).split(":");
    const [storedToken, storedEpoch, rotated, bumped] = after.slice("after=".length).split(":");

    expect(oldToken).toMatch(/^[0-9a-f]{64}$/);
    expect(newToken).toMatch(/^[0-9a-f]{64}$/);
    expect(newToken).not.toBe(oldToken);
    expect(storedToken).toBe(newToken);
    expect(beforeEpoch).toBe("1");
    expect(resultEpoch).toBe("2");
    expect(storedEpoch).toBe("2");
    expect(rotated).toBe("true");
    expect(bumped).toBe("true");
  });

  test("rejects non-admin without changing token or epoch", () => {
    const driveFileId = `rotate-rpc-${randomUUID()}`;
    const before = runPsql(`
      ${seedShowSql(driveFileId)};
      select t.share_token || ':' || s.picker_epoch
        from public.shows s
        join public.show_share_tokens t on t.show_id = s.id
       where s.drive_file_id = ${sqlString(driveFileId)};
    `);

    try {
      expect(() =>
        runPsql(`
          begin;
          set local role authenticated;
          set local request.jwt.claims = ${sqlString(CREW_JWT)};
          select * from public.rotate_show_share_token(
            (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
          );
          rollback;
        `),
      ).toThrow(/admin role required|42501|permission denied/i);

      const after = runPsql(`
        select t.share_token || ':' || s.picker_epoch
          from public.shows s
          join public.show_share_tokens t on t.show_id = s.id
         where s.drive_file_id = ${sqlString(driveFileId)};
      `);
      expect(after).toBe(before);
    } finally {
      runPsql(`delete from public.shows where drive_file_id = ${sqlString(driveFileId)};`);
    }
  });

  test("definition pins advisory-lock holder, clock timestamp, publish, and grants", () => {
    const out = runPsql(`
      select
        prosecdef || '|' ||
        (pg_get_functiondef(p.oid) ~ 'pg_advisory_xact_lock\\s*\\(\\s*hashtext\\s*\\(') || '|' ||
        (pg_get_functiondef(p.oid) like '%clock_timestamp()%') || '|' ||
        (pg_get_functiondef(p.oid) like '%public.publish_show_invalidation(p_show_id)%') || '|' ||
        has_function_privilege('authenticated', 'public.rotate_show_share_token(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public.rotate_show_share_token(uuid)', 'EXECUTE')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'rotate_show_share_token';
    `);

    expect(out).toBe("true|true|true|true|true|false");
  });
});
