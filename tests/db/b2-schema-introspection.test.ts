import { describe, it, expect } from "vitest";
import { sqlClient } from "@/tests/db/_b2Helpers";

describe("B2 lifecycle columns", () => {
  it("app_settings.auto_publish_clean_first_seen exists, boolean not null default true", async () => {
    const [row] = await sqlClient/*sql*/ `
      select data_type, is_nullable, column_default
        from information_schema.columns
       where table_schema='public' and table_name='app_settings'
         and column_name='auto_publish_clean_first_seen'`;
    expect(row).toBeTruthy();
    if (!row) throw new Error("auto_publish_clean_first_seen column is missing");
    expect(row.data_type).toBe("boolean");
    expect(row.is_nullable).toBe("NO");
    expect(row.column_default).toMatch(/true/);
  });

  it("shows.archived_at (timestamptz, nullable) and shows.requires_resync (boolean not null default false) exist", async () => {
    const rows = await sqlClient/*sql*/ `
      select column_name, data_type, is_nullable, column_default
        from information_schema.columns
       where table_schema='public' and table_name='shows'
         and column_name in ('archived_at','requires_resync')`;
    const byName = Object.fromEntries(rows.map((r: any) => [r.column_name, r]));
    expect(byName.archived_at?.data_type).toBe("timestamp with time zone");
    expect(byName.archived_at?.is_nullable).toBe("YES");
    expect(byName.requires_resync?.data_type).toBe("boolean");
    expect(byName.requires_resync?.is_nullable).toBe("NO");
    expect(byName.requires_resync?.column_default).toMatch(/false/);
  });
});
