import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Regression pin (Task 7): a sync crew UPSERT of the SAME-named member must NOT clobber
// crew_members.selections_reset_at — exactly as it preserves claimed_via_oauth_at. The sync
// UPSERT (runScheduledCronSync.ts upsertCrewMembers) is column-scoped:
//   on conflict (show_id, name) do update set email/phone/role/role_flags/date_restriction/
//   stage_restriction/flight_info
// so a same-name field change leaves the picker marker intact. (A NAME change is delete+insert
// and loses the marker — acceptable, and identical to claimed_via_oauth_at; a rename re-stages.)

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}
const s = (v: string) => `'${v.replaceAll("'", "''")}'`;

describe("sync preserves selections_reset_at", () => {
  test("same-name crew UPSERT with a changed role leaves selections_reset_at intact", () => {
    const drive = `sync-preserve-${randomUUID()}`;
    // Replays the EXACT sync UPSERT column list (runScheduledCronSync.ts:1310-1323).
    const out = runPsql(`
      begin;
      insert into public.shows (drive_file_id, slug, title, client_label, template_version)
        values (${s(drive)}, ${s(drive)}, 'Sync Preserve', 'FXAV', 'v4');
      insert into public.crew_members (show_id, name, role)
        values ((select id from public.shows where drive_file_id = ${s(drive)}), 'Alice', 'A2');
      update public.crew_members set selections_reset_at = clock_timestamp()
        where name = 'Alice' and show_id = (select id from public.shows where drive_file_id = ${s(drive)});
      select 'before=' || coalesce(selections_reset_at::text,'null') from public.crew_members
        where name = 'Alice' and show_id = (select id from public.shows where drive_file_id = ${s(drive)});
      -- sync UPSERT: same name, role changes A2 -> A1
      insert into public.crew_members (show_id, name, email, phone, role, role_flags,
        date_restriction, stage_restriction, flight_info)
        values ((select id from public.shows where drive_file_id = ${s(drive)}), 'Alice', null, null,
        'A1', '{}', null::jsonb, null::jsonb, null)
      on conflict (show_id, name) do update set
        email = excluded.email, phone = excluded.phone, role = excluded.role,
        role_flags = excluded.role_flags, date_restriction = excluded.date_restriction,
        stage_restriction = excluded.stage_restriction, flight_info = excluded.flight_info;
      select 'after=' || coalesce(selections_reset_at::text,'null') || '|role=' || role
        from public.crew_members
        where name = 'Alice' and show_id = (select id from public.shows where drive_file_id = ${s(drive)});
      rollback;
    `);
    const before = out.match(/before=(.+)/)?.[1];
    const after = out.match(/after=(.+)\|role=/)?.[1];
    const role = out.match(/\|role=(.+)/)?.[1];
    expect(before).not.toBe("null");
    expect(after).toBe(before); // marker survived the UPSERT
    expect(role).toBe("A1"); // ...and the UPSERT actually happened (role changed)
  });

  test("the sync UPSERT column list does NOT include selections_reset_at (source guard)", () => {
    const src = readFileSync(join(process.cwd(), "lib/sync/runScheduledCronSync.ts"), "utf8");
    // Isolate the upsertCrewMembers do-update block and assert the marker is absent from it.
    const upsertIdx = src.indexOf("upsertCrewMembers");
    expect(upsertIdx).toBeGreaterThan(-1);
    const block = src.slice(upsertIdx, upsertIdx + 1200);
    expect(block).toMatch(/on conflict \(show_id, name\)/);
    expect(block).not.toMatch(/selections_reset_at/);
  });
});
