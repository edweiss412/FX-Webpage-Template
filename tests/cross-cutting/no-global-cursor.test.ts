import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  BANNED_COMBOS,
  AUTHORITATIVE_GATING_WATERMARKS,
  DISPLAY_ONLY_TIMESTAMPS,
  SYNC_ENTRY_POINTS,
} from "@/lib/audit/watermark-symbols.generated";
import {
  auditGlobalCursorDdl,
  auditProjectNoGlobalCursor,
  auditSchemaColumns,
  auditSemanticWatermarks,
  auditTokenAwareSource,
  extractAllowedWatermarkColumnPairs,
  parseWatermarkMigration,
} from "@/lib/audit/noGlobalCursor";
import { extractWatermarkSymbolsFromSpec } from "@/scripts/extract-watermark-symbols";

const specPath = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md";
const planPath = "docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/11-cross-cutting.md";
const tokenFixtureRoot = "tests/cross-cutting/fixtures/no-global-cursor";
const semanticFixtureRoot = "tests/cross-cutting/fixtures/no-global-cursor-semantic";
const migrationPath = "supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function tokenFixture(name: string): { path: string; source: string } {
  const path = join(tokenFixtureRoot, name);
  return { path, source: read(path) };
}

function semanticFixture(name: string): { path: string; source: string } {
  const path = join(semanticFixtureRoot, name);
  return { path, source: read(path) };
}

function sortPairs<T extends { table_name: string; column_name: string }>(pairs: readonly T[]): T[] {
  return [...pairs].sort((left, right) =>
    `${left.table_name}.${left.column_name}`.localeCompare(`${right.table_name}.${right.column_name}`),
  );
}

function expectTokenFail(name: string, expected: string | RegExp): void {
  const file = tokenFixture(name);
  expect(auditTokenAwareSource(file.path, file.source).join("\n")).toMatch(expected);
}

function expectTokenPass(name: string): void {
  const file = tokenFixture(name);
  expect(auditTokenAwareSource(file.path, file.source)).toEqual([]);
}

function expectSemanticFail(name: string, expected: string | RegExp): void {
  const file = semanticFixture(name);
  expect(auditSemanticWatermarks([{ ...file }]).join("\n")).toMatch(expected);
}

function expectSemanticPass(name: string): void {
  const file = semanticFixture(name);
  expect(auditSemanticWatermarks([{ ...file }])).toEqual([]);
}

describe("X.4 no-global-cursor audit", () => {
  test("watermark manifest is derived from spec §17.2 AC-X.4 and matches plan Step 1", () => {
    const fromSpec = extractWatermarkSymbolsFromSpec(read(specPath));
    const fromPlan = extractWatermarkSymbolsFromSpec(read(planPath));

    expect(Array.from(AUTHORITATIVE_GATING_WATERMARKS)).toEqual(fromSpec.authoritativeGatingWatermarks);
    expect(Array.from(DISPLAY_ONLY_TIMESTAMPS)).toEqual(fromSpec.displayOnlyTimestamps);
    expect(Array.from(SYNC_ENTRY_POINTS)).toEqual(fromSpec.syncEntryPoints);
    expect(BANNED_COMBOS).toContainEqual(["last", "watermark"]);
    expect(fromPlan.authoritativeGatingWatermarks).toEqual(fromSpec.authoritativeGatingWatermarks);
    expect(fromPlan.displayOnlyTimestamps).toEqual(fromSpec.displayOnlyTimestamps);
  });

  test("schema layer allows only generated watermark columns and rejects app_settings cursor columns", () => {
    expect(auditSchemaColumns(extractAllowedWatermarkColumnPairs())).toEqual([]);
    expect(
      auditSchemaColumns([
        ...extractAllowedWatermarkColumnPairs(),
        { table_name: "app_settings", column_name: "processed_at" },
        { table_name: "app_settings", column_name: "last_processed_at" },
      ]).join("\n"),
    ).toMatch(/app_settings\.last_processed_at/);
  });

  test("token-aware AST layer catches cursor token families without substring grep", () => {
    expectTokenFail("bad-camel.ts", /lastWatermark/);
    expectTokenFail("bad-snake.ts", /last_cursor/);
    expectTokenFail("bad-property.ts", /appState\.lastWatermark/);
    expectTokenFail("bad-bracket.ts", /LAST_WATERMARK/);
    expectTokenFail("bad-aliased.ts", /s\.lastWatermark/);
    expectTokenFail("bad-component.tsx", /lastWatermark/);
    expectTokenFail("bad-page-prop.tsx", /params\.lastWatermark/);
    expectTokenPass("good-allowlisted.ts");
    expectTokenPass("good-unrelated.ts");
    expectTokenPass("good-component.tsx");
  });

  test("semantic layer rejects singleton/env/module/untyped cursor sources", () => {
    expectSemanticFail("bad-app-settings-cursor.ts", /forbidden source 'app_settings\.processed_at'/);
    expectSemanticFail("bad-env-watermark.ts", /forbidden source 'process\.env\.LAST_WATERMARK'/);
    expectSemanticFail("bad-module-const-checkpoint.ts", /forbidden source 'module\.CHECKPOINT'/);
    expectSemanticFail("bad-untyped-any.ts", /could not be resolved to a per-row column/);
    expectSemanticPass("good-per-row.ts");
    expectSemanticPass("good-fileMeta-only.ts");
  });

  test("semantic layer distinguishes display-only timestamps from gating watermarks", () => {
    expectSemanticFail("bad-display-only-in-sync-decision.fixture", /display-only timestamp 'shows\.last_synced_at'/);
    expectSemanticFail("bad-display-only-parsed-at.fixture", /display-only timestamp 'pending_syncs\.parsed_at'/);
    expectSemanticFail("bad-display-only-last-attempt-at.fixture", /display-only timestamp 'pending_ingestions\.last_attempt_at'/);
  });

  test("semantic layer accepts per-row apply/discard and asset CAS forms", () => {
    expectSemanticPass("good-apply-cas.fixture");
    expectSemanticPass("good-discard-cas.fixture");
    expectSemanticPass("good-apply-cas-staged-id.fixture");
    expectSemanticPass("good-discard-cas-staged-id.fixture");
    expectSemanticPass("good-asset-route-cas-revision-id.fixture");
    expectSemanticPass("good-asset-route-cas-head-revision.fixture");
    expectSemanticPass("good-asset-route-cas-md5.fixture");
  });

  test("semantic layer rejects fresh-read CAS and uncovered gating watermark reads independently", () => {
    expectSemanticFail("bad-uuid-cas-against-fresh-read.fixture", /compares pending_syncs\.staged_id against a fresh-read value/);
    expectSemanticFail(
      "bad-uuid-cas-revision-id-against-fresh-read.fixture",
      /compares shows\.diagrams->>snapshot_revision_id against a fresh-read value/,
    );
    expectSemanticFail(
      "bad-uncovered-gating-watermark.fixture",
      /gating watermark shows\.diagrams->>snapshot_revision_id is read by applyStagedParse but never enforced/,
    );
  });

  test("semantic precheck fails loudly for missing or ambiguous sync entry points", () => {
    expectSemanticFail("bad-missing-entry-point.fixture", /zero declarations\): runScheduledCronSync/);
    expectSemanticFail("bad-ambiguous-entry-point.fixture", /multiple declarations\): runScheduledCronSync \(2 matches\)/);
    expectSemanticFail("bad-missing-applyStagedParse-entry-point.fixture", /zero declarations\): applyStagedParse/);
    expectSemanticFail("bad-missing-discardStagedParse-entry-point.fixture", /zero declarations\): discardStagedParse/);
  });

  test("DDL migration installs a public-schema event trigger with the generated allowlist", () => {
    const migration = parseWatermarkMigration(read(migrationPath));
    expect(sortPairs(migration.allowlist)).toEqual(sortPairs(extractAllowedWatermarkColumnPairs()));
    expect(migration.sql).toMatch(/CREATE EVENT TRIGGER no_global_cursor_columns/);
    expect(migration.sql).toMatch(/ddl_command_end/);
    expect(auditGlobalCursorDdl(migration.sql)).toEqual([]);
  });

  test("live project has no global cursor findings", () => {
    expect(auditProjectNoGlobalCursor()).toEqual([]);
  }, 20000);
});
