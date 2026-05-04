import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";

import {
  ShowAdvisoryLockUnavailableError,
  withShowAdvisoryLock,
} from "@/lib/db/advisoryLock";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const createdShowIds: string[] = [];

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function insertShow(driveFileId: string): string {
  const id = runPsql(`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
    values (
      ${sqlString(driveFileId)},
      ${sqlString(`advisory-lock-${randomUUID()}`)},
      'Advisory Lock Probe',
      'FXAV',
      'v1',
      true
    )
    returning id;
  `);
  createdShowIds.push(id);
  return id;
}

afterEach(() => {
  while (createdShowIds.length > 0) {
    const showId = createdShowIds.pop();
    if (showId) {
      runPsql(`delete from public.shows where id = ${sqlString(showId)}::uuid;`);
    }
  }
});

describe("withShowAdvisoryLock", () => {
  test("holds pg_advisory_xact_lock(hashtext('show:' || shows.drive_file_id)) during the callback", async () => {
    const driveFileId = `drive-lock-${randomUUID()}`;
    const showId = insertShow(driveFileId);

    await withShowAdvisoryLock(showId, "block", async () => {
      const competingTry = runPsql(`
        select pg_try_advisory_xact_lock(hashtext('show:' || ${sqlString(driveFileId)}));
      `);

      expect(competingTry).toBe("f");

      const matchingLockCount = runPsql(`
        with k as (
          select hashtext('show:' || ${sqlString(driveFileId)})::bigint as kb
        ),
        expected as (
          select ((kb >> 32) & x'FFFFFFFF'::bigint)::oid as expected_classid,
                 (kb & x'FFFFFFFF'::bigint)::oid         as expected_objid
            from k
        )
        select count(*)
          from pg_locks, expected
         where locktype = 'advisory'
           and mode = 'ExclusiveLock'
           and granted = true
           and classid = expected.expected_classid
           and objid = expected.expected_objid
           and objsubid = 1;
      `);

      expect(matchingLockCount).toBe("1");
    });

    const competingAfterCallback = runPsql(`
      begin;
      select pg_try_advisory_xact_lock(hashtext('show:' || ${sqlString(driveFileId)}));
      rollback;
    `);

    expect(competingAfterCallback).toBe("t");
  });

  test("try mode rejects immediately when a competing transaction already holds the show lock", async () => {
    const driveFileId = `drive-lock-${randomUUID()}`;
    const showId = insertShow(driveFileId);

    await expect(
      withShowAdvisoryLock(showId, "block", async () => {
        await expect(withShowAdvisoryLock(showId, "try", async () => "unexpected")).rejects.toBeInstanceOf(
          ShowAdvisoryLockUnavailableError,
        );
      }),
    ).resolves.toBeUndefined();
  });
});
