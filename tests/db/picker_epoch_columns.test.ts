import { execFileSync } from "node:child_process";
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

function requiredField(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing ${label} in psql output`);
  return value;
}

describe("picker_epoch columns migration", () => {
  test("shows.picker_epoch and picker_epoch_bumped_at exist with the required defaults", () => {
    const raw = runPsql(`
      select table_schema || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || column_default
      from information_schema.columns
      where table_schema in ('public', 'dev')
        and table_name = 'shows'
        and column_name in ('picker_epoch', 'picker_epoch_bumped_at')
      order by table_schema, column_name;
    `);

    expect(raw.split("\n")).toEqual([
      "dev.picker_epoch:integer:NO:1",
      "dev.picker_epoch_bumped_at:timestamp with time zone:NO:now()",
      "public.picker_epoch:integer:NO:1",
      "public.picker_epoch_bumped_at:timestamp with time zone:NO:now()",
    ]);
  });

  test("a new show row gets picker_epoch=1 and picker_epoch_bumped_at by default", () => {
    const suffix = crypto.randomUUID();
    const raw = runPsql(`
      insert into public.shows (drive_file_id, slug, title, client_label, template_version)
      values (${sqlString(`picker-epoch-${suffix}`)}, ${sqlString(`picker-epoch-${suffix}`)}, 'Test', 'Test', 'v4')
      returning id, picker_epoch, picker_epoch_bumped_at is not null;
    `);
    const parts = raw.split("|");
    const showId = requiredField(parts[0], "show id");
    const pickerEpoch = requiredField(parts[1], "picker_epoch");
    const hasBumpedAt = requiredField(parts[2], "picker_epoch_bumped_at presence");

    try {
      expect(pickerEpoch).toBe("1");
      expect(hasBumpedAt).toBe("t");
    } finally {
      runPsql(`delete from public.shows where id = ${sqlString(showId)}::uuid;`);
    }
  });

  test("changing picker_epoch stamps picker_epoch_bumped_at with clock time", () => {
    const suffix = crypto.randomUUID();
    const insertedRaw = runPsql(`
      insert into public.shows (drive_file_id, slug, title, client_label, template_version)
      values (${sqlString(`picker-trigger-${suffix}`)}, ${sqlString(`picker-trigger-${suffix}`)}, 'Test', 'Test', 'v4')
      returning id, picker_epoch_bumped_at;
    `);
    const insertedParts = insertedRaw.split("|");
    const showId = requiredField(insertedParts[0], "show id");
    const beforeBumpedAt = requiredField(insertedParts[1], "initial picker_epoch_bumped_at");

    try {
      runPsql("select pg_sleep(0.01);");
      const updatedRaw = runPsql(`
        update public.shows
           set picker_epoch = picker_epoch + 1
         where id = ${sqlString(showId)}::uuid
         returning picker_epoch, picker_epoch_bumped_at > ${sqlString(beforeBumpedAt)}::timestamptz;
      `);
      const updatedParts = updatedRaw.split("|");
      const pickerEpoch = requiredField(updatedParts[0], "updated picker_epoch");
      const bumpedAtAdvanced = requiredField(updatedParts[1], "picker_epoch_bumped_at comparison");

      expect(pickerEpoch).toBe("2");
      expect(bumpedAtAdvanced).toBe("t");
    } finally {
      runPsql(`delete from public.shows where id = ${sqlString(showId)}::uuid;`);
    }
  });
});
