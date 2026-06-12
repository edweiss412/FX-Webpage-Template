import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-F\t"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

describe("B3 app_settings notification columns", () => {
  test("app_settings has notify toggles and a non-watermark sync heartbeat", () => {
    const rows = runPsql(`
      select column_name, data_type, is_nullable, coalesce(column_default, '')
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'app_settings'
         and column_name in (
           'alert_on_sync_problems',
           'daily_review_digest',
           'alert_on_auto_publish',
           'sync_cron_heartbeat_at'
         )
       order by column_name;
    `)
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [columnName, dataType, isNullable, columnDefault] = line.split("\t");
        // The last row's empty `coalesce(column_default,'')` field is a trailing tab
        // that runPsql's .trim() strips, so split() yields no 4th element — normalize
        // a missing default back to "" (matches the coalesce intent).
        return { columnName, dataType, isNullable, columnDefault: columnDefault ?? "" };
      });

    const byName = Object.fromEntries(rows.map((row) => [row.columnName, row]));

    expect(byName.alert_on_sync_problems).toMatchObject({
      dataType: "boolean",
      isNullable: "NO",
    });
    expect(byName.alert_on_sync_problems?.columnDefault).toMatch(/true/);

    expect(byName.daily_review_digest).toMatchObject({
      dataType: "boolean",
      isNullable: "NO",
    });
    expect(byName.daily_review_digest?.columnDefault).toMatch(/true/);

    // M12.13 §4.5: dedicated auto-publish-undo toggle, default ON.
    expect(byName.alert_on_auto_publish).toMatchObject({
      dataType: "boolean",
      isNullable: "NO",
    });
    expect(byName.alert_on_auto_publish?.columnDefault).toMatch(/true/);

    expect(byName.sync_cron_heartbeat_at).toMatchObject({
      dataType: "timestamp with time zone",
      isNullable: "YES",
      columnDefault: "",
    });
  });

  test("the default singleton row is initialized with a heartbeat", () => {
    const heartbeat = runPsql(`
      select sync_cron_heartbeat_at is not null
        from public.app_settings
       where id = 'default';
    `);

    expect(heartbeat).toBe("t");
  });
});
