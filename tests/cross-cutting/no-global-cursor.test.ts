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

const specPath = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md";
const planPath = "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/11-cross-cutting.md";
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

function sortPairs<T extends { table_name: string; column_name: string }>(
  pairs: readonly T[],
): T[] {
  return [...pairs].sort((left, right) =>
    `${left.table_name}.${left.column_name}`.localeCompare(
      `${right.table_name}.${right.column_name}`,
    ),
  );
}

function diffWatermarkParity(
  spec: ReturnType<typeof extractWatermarkSymbolsFromSpec>,
  plan: ReturnType<typeof extractWatermarkSymbolsFromSpec>,
): string[] {
  const diffs: string[] = [];
  for (const key of ["authoritativeGatingWatermarks", "displayOnlyTimestamps"] as const) {
    const specValues = new Set(spec[key]);
    const planValues = new Set(plan[key]);
    for (const value of specValues) {
      if (!planValues.has(value)) diffs.push(`+missing_in_plan:${value}`);
    }
    for (const value of planValues) {
      if (!specValues.has(value)) diffs.push(`-extra_in_plan:${value}`);
    }
  }
  return diffs.sort();
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

    expect(Array.from(AUTHORITATIVE_GATING_WATERMARKS)).toEqual(
      fromSpec.authoritativeGatingWatermarks,
    );
    expect(Array.from(DISPLAY_ONLY_TIMESTAMPS)).toEqual(fromSpec.displayOnlyTimestamps);
    expect(Array.from(SYNC_ENTRY_POINTS)).toEqual(fromSpec.syncEntryPoints);
    expect(BANNED_COMBOS).toContainEqual(["last", "watermark"]);
    expect(diffWatermarkParity(fromSpec, fromPlan)).toEqual([]);
  });

  test("watermark parity emits named diffs when plan prose drifts from spec", () => {
    const fromSpec = extractWatermarkSymbolsFromSpec(read(specPath));
    const driftedPlan = read(planPath).replaceAll(
      "pending_syncs.base_modified_time",
      "shows.base_modified_time",
    );
    const fromPlan = extractWatermarkSymbolsFromSpec(driftedPlan);

    // Failure mode: an extractor that filters stale names from both sides would hide this spec/plan drift.
    expect(diffWatermarkParity(fromSpec, fromPlan)).toContain(
      "+missing_in_plan:pending_syncs.base_modified_time",
    );
    expect(diffWatermarkParity(fromSpec, fromPlan)).toContain(
      "-extra_in_plan:shows.base_modified_time",
    );
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
    expectSemanticFail(
      "bad-app-settings-cursor.ts",
      /forbidden source 'app_settings\.processed_at'/,
    );
    expectSemanticFail("bad-env-watermark.ts", /forbidden source 'process\.env\.LAST_WATERMARK'/);
    expectSemanticFail("bad-module-const-checkpoint.ts", /forbidden source 'module\.CHECKPOINT'/);
    expectSemanticFail("bad-untyped-any.ts", /could not be resolved to a per-row column/);
    expectSemanticPass("good-per-row.ts");
    expectSemanticPass("good-fileMeta-only.ts");
  });

  test("semantic layer distinguishes display-only timestamps from gating watermarks", () => {
    expectSemanticFail(
      "bad-display-only-in-sync-decision.fixture",
      /display-only timestamp 'shows\.last_synced_at'/,
    );
    expectSemanticFail(
      "bad-display-only-parsed-at.fixture",
      /display-only timestamp 'pending_syncs\.parsed_at'/,
    );
    expectSemanticFail(
      "bad-display-only-last-attempt-at.fixture",
      /display-only timestamp 'pending_ingestions\.last_attempt_at'/,
    );
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
    expectSemanticFail(
      "bad-uuid-cas-against-fresh-read.fixture",
      /compares pending_syncs\.staged_id against a fresh-read value/,
    );
    expectSemanticFail(
      "bad-uuid-cas-revision-id-against-fresh-read.fixture",
      /compares shows\.diagrams->>snapshot_revision_id against a fresh-read value/,
    );
    // Failure mode: JSONB CAS fresh-read detection must not depend on the variable being named "fresh".
    expectSemanticFail(
      "bad-uuid-cas-revision-id-against-renamed-fresh-read.fixture",
      /compares shows\.diagrams->>snapshot_revision_id against a fresh-read value/,
    );
    // Failure mode: a value named "expected*" must not be trusted when its initializer traces to a fresh DB helper.
    expectSemanticFail(
      "bad-fresh-read-helper-named-expected.fixture",
      /compares pending_syncs\.staged_id against a fresh-read value/,
    );
    expectSemanticFail(
      "bad-uncovered-gating-watermark.fixture",
      /gating watermark shows\.diagrams->>snapshot_revision_id is read by applyStagedParse but never enforced/,
    );
    // Failure mode: untyped any must be rejected by type provenance, not only by literal "as any" text.
    expectSemanticFail(
      "bad-implicit-any-expected.fixture",
      /could not be resolved to a per-row column/,
    );
  });

  test("semantic coverage sweep is scoped to write sinks on the same table", () => {
    // Failure mode: inserting an admin alert after reading pending_syncs.staged_id is not a pending_syncs write.
    expectSemanticPass("good-read-gating-watermark-admin-alert-write.fixture");
  });

  test("semantic precheck fails loudly for missing or ambiguous sync entry points", () => {
    expectSemanticFail(
      "bad-missing-entry-point.fixture",
      /zero declarations\): runScheduledCronSync/,
    );
    // Failure mode: arbitrary renamed entry points must fail even when the new name avoids the old "Renamed" substring.
    expectSemanticFail(
      "bad-missing-entry-point-v2.fixture",
      /zero declarations\): runScheduledCronSync/,
    );
    expectSemanticFail(
      "bad-ambiguous-entry-point.fixture",
      /multiple declarations\): runScheduledCronSync \(2 matches\)/,
    );
    expectSemanticFail(
      "bad-missing-applyStagedParse-entry-point.fixture",
      /zero declarations\): applyStagedParse/,
    );
    expectSemanticFail(
      "bad-missing-discardStagedParse-entry-point.fixture",
      /zero declarations\): discardStagedParse/,
    );
    // Failure mode: import-only/type-only declarations must not satisfy the semantic entry-point precheck.
    expectSemanticFail("bad-import-only-entry.fixture", /zero declarations\): applyStagedParse/);
  });

  test("project audit includes full semantic layer findings, not only precheck failures", () => {
    const file = semanticFixture("bad-app-settings-cursor.ts");

    // Failure mode: filtering auditSemanticWatermarks down to precheck errors hides live Layer 3 violations.
    expect(
      auditProjectNoGlobalCursor({
        syncSources: [{ ...file }],
        skipTokenLayer: true,
        requireAllEntries: false,
      }).join("\n"),
    ).toMatch(/forbidden source 'app_settings\.processed_at'/);
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
    // CI hygiene: this is a ts-morph AST walk over EVERY project source file, so its cost scales
    // with the codebase. GitHub Actions runners are reliably 3-4x slower than local. The repo has
    // grown materially (parser/timeline features + observability Phase 2), pushing the local walk
    // to ~18s and the CI walk past the old 45000ms budget (it timed out). 120s restores ~2x headroom
    // over the slowest observed CI run; bump again (not the audit) if the codebase keeps growing.
  }, 120000);
});
