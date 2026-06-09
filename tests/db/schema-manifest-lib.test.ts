// Pure-logic unit tests for the validation-schema-parity gate (DB-free).
// These pin the SQL-noise stripping + alter-add-column extraction against the
// EXACT gotchas present in this repo's real migrations, where a naive line-by-
// line regex mis-fires.
import { describe, expect, it } from "vitest";
import {
  collectDroppedPublicTables,
  diffManifestAgainstLive,
  manifestFromRows,
  parseAlterAddColumns,
  parsePsqlRows,
  serializeManifest,
  stripSqlNoise,
  type SchemaManifest,
} from "../../scripts/schema-manifest/lib";

describe("stripSqlNoise", () => {
  it("removes line comments containing DDL keywords", () => {
    const out = stripSqlNoise("-- CREATE TABLE public.ghost (x int)\nselect 1;");
    expect(out).not.toMatch(/create table/i);
    expect(out).toContain("select 1");
  });

  it("blanks string-literal bodies (RAISE EXCEPTION '...ADD COLUMN...')", () => {
    const sql =
      "do $$ begin raise exception 'validation_state.alias_map column missing after ADD COLUMN'; end $$;";
    const out = stripSqlNoise(sql);
    expect(out).not.toMatch(/add column/i);
  });

  it("collapses dollar-quoted function bodies", () => {
    const sql =
      "create function f() returns void as $func$ begin alter table public.x add column y int; end $func$ language plpgsql;";
    const out = stripSqlNoise(sql);
    // the add column is inside the function body string → not real DDL here
    expect(out).not.toMatch(/add column/i);
  });

  it("preserves real DDL outside comments/strings", () => {
    const sql =
      "alter table public.app_settings add column if not exists alert_on_sync_problems boolean; -- trailing note";
    const out = stripSqlNoise(sql);
    expect(out).toMatch(/alter table public\.app_settings add column/i);
    expect(out).not.toContain("trailing note");
  });
});

describe("parseAlterAddColumns", () => {
  it("captures the #9 vector verbatim", () => {
    const sql =
      "alter table public.app_settings add column if not exists alert_on_sync_problems boolean not null default true;\n" +
      "alter table public.app_settings add column if not exists daily_review_digest boolean not null default true;\n" +
      "alter table public.app_settings add column if not exists sync_cron_heartbeat_at timestamptz;";
    const pairs = parseAlterAddColumns(sql);
    expect(pairs).toEqual([
      { table: "app_settings", column: "alert_on_sync_problems" },
      { table: "app_settings", column: "daily_review_digest" },
      { table: "app_settings", column: "sync_cron_heartbeat_at" },
    ]);
  });

  it("treats a bare (unqualified) table as public", () => {
    const pairs = parseAlterAddColumns(
      "alter table shows add column if not exists archived_at timestamptz;",
    );
    expect(pairs).toEqual([{ table: "shows", column: "archived_at" }]);
  });

  it("excludes the dev.* shadow schema (incl. `alter table if exists dev.x`)", () => {
    const pairs = parseAlterAddColumns(
      "alter table if exists dev.crew_members add column if not exists claimed_via_oauth_at timestamptz;",
    );
    expect(pairs).toEqual([]);
  });

  it("captures multiple comma-separated add-columns spanning lines in one alter", () => {
    const sql =
      "alter table public.crew_members\n  add column if not exists created_at timestamptz,\n  add column if not exists picker_epoch int not null default 1;";
    const pairs = parseAlterAddColumns(sql);
    expect(pairs).toEqual([
      { table: "crew_members", column: "created_at" },
      { table: "crew_members", column: "picker_epoch" },
    ]);
  });

  it("ignores ADD COLUMN inside a comment or string literal", () => {
    const sql =
      "-- alter table public.ghost add column boo int\n" +
      "do $$ begin raise exception 'after ADD COLUMN x'; end $$;";
    expect(parseAlterAddColumns(sql)).toEqual([]);
  });

  it("excludes columns added to a table that is later dropped", () => {
    const sql =
      "alter table public.link_sessions add column if not exists rotated_at timestamptz;\n" +
      "drop table if exists public.link_sessions;";
    expect(parseAlterAddColumns(sql)).toEqual([]);
  });

  it("is case-insensitive and dedupes repeated (table,column) pairs", () => {
    const sql =
      "ALTER TABLE PUBLIC.app_settings ADD COLUMN IF NOT EXISTS rotated_at timestamptz;\n" +
      "alter table public.app_settings add column if not exists rotated_at timestamptz;";
    expect(parseAlterAddColumns(sql)).toEqual([{ table: "app_settings", column: "rotated_at" }]);
  });
});

describe("collectDroppedPublicTables", () => {
  it("collects public drops and ignores non-public", () => {
    const dropped = collectDroppedPublicTables(
      "drop table if exists public.a; drop table b; drop table if exists dev.c;",
    );
    expect([...dropped].sort()).toEqual(["a", "b"]);
  });
});

describe("manifest serialization + psql parsing", () => {
  it("builds a sorted manifest from rows and serializes deterministically", () => {
    const manifest = manifestFromRows([
      ["shows", "title"],
      ["app_settings", "daily_review_digest"],
      ["app_settings", "alert_on_sync_problems"],
      ["shows", "archived_at"],
    ]);
    expect(manifest).toEqual({
      app_settings: ["alert_on_sync_problems", "daily_review_digest"],
      shows: ["archived_at", "title"],
    });
    const json = serializeManifest(manifest);
    // sorted keys + trailing newline
    expect(json.endsWith("\n")).toBe(true);
    expect(Object.keys(JSON.parse(json))).toEqual(["app_settings", "shows"]);
  });

  it("parses pipe-separated psql -qAt rows", () => {
    expect(parsePsqlRows("shows|title\napp_settings|daily_review_digest\n\n")).toEqual([
      ["shows", "title"],
      ["app_settings", "daily_review_digest"],
    ]);
  });
});

describe("diffManifestAgainstLive (the parity comparison)", () => {
  const manifest: SchemaManifest = {
    app_settings: ["alert_on_sync_problems", "daily_review_digest", "id"],
    shows: ["id", "title"],
  };

  it("flags a column present in the manifest but missing live (the #9 failure)", () => {
    const live: SchemaManifest = {
      app_settings: ["id"], // missing the two notify columns
      shows: ["id", "title"],
    };
    const diff = diffManifestAgainstLive(manifest, live);
    expect(diff.missingTables).toEqual([]);
    expect(diff.missingColumns).toEqual([
      { table: "app_settings", column: "alert_on_sync_problems" },
      { table: "app_settings", column: "daily_review_digest" },
    ]);
  });

  it("flags a whole table missing live", () => {
    const live: SchemaManifest = {
      app_settings: ["alert_on_sync_problems", "daily_review_digest", "id"],
    };
    const diff = diffManifestAgainstLive(manifest, live);
    expect(diff.missingTables).toEqual(["shows"]);
  });

  it("ignores extra live tables/columns (validation Phase-0 extras)", () => {
    const live: SchemaManifest = {
      app_settings: ["alert_on_sync_problems", "daily_review_digest", "id", "extra_col"],
      shows: ["id", "title"],
      phase0_only: ["x"],
    };
    const diff = diffManifestAgainstLive(manifest, live);
    expect(diff.missingTables).toEqual([]);
    expect(diff.missingColumns).toEqual([]);
  });
});
