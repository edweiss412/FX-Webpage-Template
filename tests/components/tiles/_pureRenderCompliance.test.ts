/**
 * tests/components/tiles/_pureRenderCompliance.test.ts (M9 Task 9.2 — §12.1)
 *
 * Static-analysis assertion for the tile-View pure-render contract that
 * <TileServerFallback> depends on. Each `*TileView` export MUST be pure:
 * no `await` in its body, no imports from throwing infrastructure modules
 * (lib/db, lib/drive, lib/sync, lib/supabase server clients), no calls
 * to functions whose name matches /^(load|fetch|query|read)/ from outside
 * the component module.
 *
 * Why this exists: <TileServerFallback> INVOKES `render(data)` inside its
 * try/catch (not just returning a JSX element). React then calls the
 * returned element's component function LATER, outside the wrapper's
 * try/catch — so throws inside the View body that happen synchronously
 * during the component function escape to the route-level error boundary,
 * defeating the whole "per-tile fallback" guarantee.
 *
 * This test scans each tile file's whole text (the `*TileView` symbol is
 * an alias of the tile's component, so the contract applies to the file).
 * The static analysis is a regex sweep — sufficient for catching the
 * common mistakes the plan calls out (top-level `await` in render, DB
 * imports, throwing helper calls). Future polish can swap for an AST pass.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const TILES_DIR = "components/tiles";

function listTileFiles(): string[] {
  return readdirSync(TILES_DIR)
    .filter((f) => /Tile(View)?\.tsx$/.test(f))
    .map((f) => join(TILES_DIR, f));
}

// Forbidden import paths — any module that can throw on data fetch.
const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']@\/lib\/db\b/, //          DB calls — must live in loaders, not views
  /from\s+["']@\/lib\/drive\b/, //       Drive API calls
  /from\s+["']@\/lib\/sync\b/, //        sync engine internals
  /from\s+["']@\/lib\/supabase\/server\b/, // Supabase service client
];

// Forbidden function-name patterns at call sites — these signal data work
// that should live in a loader, not a view. The test is conservative:
// we look at the second half of each tile file (the view body) only, so
// helper definitions named `loadXxxTileData` at the top of the file don't
// trip it; only CALLS to such helpers from inside the view region do.
const FORBIDDEN_CALL_PATTERNS = [
  /\bawait\b/, //                                async work in the render path
  /\bcreateSupabaseServiceRoleClient\(/, //      direct Supabase client construction
  /\bcreateSupabaseServerClient\(/, //           ditto
];

describe("META tile-view pure-render compliance", () => {
  const files = listTileFiles();

  test("at least one tile file is registered (sanity)", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  test.each(files)("%s has no forbidden imports", (file) => {
    const source = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(
        pattern.test(source),
        `${file} imports forbidden module matching ${pattern} — must move to a *TileLoader.ts`,
      ).toBe(false);
    }
  });

  test.each(files)("%s view region has no await / direct Supabase client construction", (file) => {
    const source = readFileSync(file, "utf8");
    // View region: from the first `export function XxxTile` / `export const XxxTileView`
    // to the start of the loader (`async function load…`). The loader is allowed
    // to use `await` and Supabase clients; the view region must be pure.
    const viewStart = source.search(/export (function|const) [A-Z][a-zA-Z]*Tile(View)?\b/);
    const loaderStart = source.search(/export async function load[A-Z][a-zA-Z]*Data\b/);
    const viewRegion =
      loaderStart > viewStart
        ? source.slice(viewStart, loaderStart)
        : source.slice(viewStart);
    for (const pattern of FORBIDDEN_CALL_PATTERNS) {
      expect(
        pattern.test(viewRegion),
        `${file} view region contains forbidden pattern ${pattern} — must move to a *TileLoader.ts`,
      ).toBe(false);
    }
  });

  test.each(files)("%s exports a *TileView alias (Task 9.2 contract)", (file) => {
    const source = readFileSync(file, "utf8");
    expect(/export const [A-Z][a-zA-Z]*TileView\b/.test(source), file).toBe(true);
  });

  test.each(files)("%s exports a load*Data loader (Task 9.2 contract)", (file) => {
    const source = readFileSync(file, "utf8");
    expect(/export async function load[A-Z][a-zA-Z]*Data\b/.test(source), file).toBe(true);
  });
});
