/**
 * tests/admin/dev/filesMembership.test.ts
 * (spec 2026-07-20-attention-scenario-gallery §6a)
 *
 * Every dev-only route module under `app/admin/dev/` must be registered in the
 * `FILES` array of `scripts/with-admin-dev-flag.mjs`, which renames those files
 * aside before a flag-unset `next build` so the production artifact cannot
 * contain them.
 *
 * Why this test exists at all: the only existing proof was
 * `tests/admin/build-artifact-gate.test.ts`, which is opt-in behind
 * RUN_BUILD_ARTIFACT_GATE_TEST and is set in NO workflow — so in practice a new
 * unregistered dev route shipped with nothing checking it. This test costs
 * milliseconds, runs on every `pnpm test`, and FAILS BY DEFAULT for a new
 * surface because it walks the filesystem rather than consulting a hand-written
 * list of routes to check.
 *
 * The FILES array is PARSED, not string-searched. `script.includes(path)` would
 * be satisfied by the path appearing inside a comment — including the very
 * comments these entries carry — so an unregistered route could pass while the
 * build gate leaked it. `parseFilesArray` is self-tested below against exactly
 * that case.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const DEV_ROOT = join(ROOT, "app", "admin", "dev");
const SCRIPT = join(ROOT, "scripts", "with-admin-dev-flag.mjs");

/**
 * Route modules Next treats as an entry point. A plain helper module (params.ts,
 * buildBlockProps.ts) is NOT one: with its importing page renamed aside nothing
 * references it, so it never reaches the artifact.
 */
const ROUTE_FILES = new Set(["page.tsx", "actions.ts", "route.ts", "layout.tsx"]);

/**
 * The suffix `with-admin-dev-flag.mjs` appends while a flag-unset build runs.
 * A file wearing it is still the same registered surface, so the walk normalizes
 * it away: without this the suite fails spuriously against a checkout that is
 * mid-build (or one left renamed aside by an interrupted build), reporting every
 * FILES entry as stale — which reads as a real defect and is not one.
 */
const DISABLED_SUFFIX = ".disabled-by-build-gate";

/**
 * Deliberately PROD-AVAILABLE dev surfaces: developer-gated at RUNTIME rather
 * than build-gated out. Each needs a reason, so adding one is a decision rather
 * than a way to silence this test.
 */
const PROD_AVAILABLE: Record<string, string> = {
  "app/admin/dev/telemetry/page.tsx":
    "Telemetry is intentionally reachable in production behind requireDeveloper (M11 §8).",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    const logical = name.endsWith(DISABLED_SUFFIX) ? name.slice(0, -DISABLED_SUFFIX.length) : name;
    if (ROUTE_FILES.has(logical)) {
      out.push(relative(ROOT, join(dir, logical)).split(sep).join("/"));
    }
  }
  return out;
}

/** Extracts the string literals of the `const FILES = [...]` array, comments stripped. */
export function parseFilesArray(source: string): string[] {
  const start = source.indexOf("const FILES = [");
  if (start === -1) throw new Error("with-admin-dev-flag.mjs no longer declares `const FILES = [`");
  const end = source.indexOf("];", start);
  if (end === -1) throw new Error("`const FILES = [` is not closed by `];`");
  const body = source
    .slice(start + "const FILES = [".length, end)
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  return [...body.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]!);
}

describe("parseFilesArray", () => {
  test("reads entries and IGNORES paths that appear only in comments", () => {
    const fake = [
      "const FILES = [",
      '  "app/admin/dev/page.tsx",',
      '  // "app/admin/dev/commented-out/page.tsx" — deliberately not registered',
      "  // see also app/admin/dev/mentioned-in-prose/page.tsx",
      '  "app/admin/dev/real/page.tsx",',
      "];",
    ].join("\n");
    expect(parseFilesArray(fake)).toEqual([
      "app/admin/dev/page.tsx",
      "app/admin/dev/real/page.tsx",
    ]);
  });

  test("throws rather than silently returning nothing if the array is renamed away", () => {
    expect(() => parseFilesArray("const OTHER = [];")).toThrow(/no longer declares/);
  });
});

describe("with-admin-dev-flag FILES membership", () => {
  const registered = parseFilesArray(readFileSync(SCRIPT, "utf8"));
  const discovered = walk(DEV_ROOT);

  test("the walk and the parse both found something, so nothing below is vacuous", () => {
    expect(discovered.length).toBeGreaterThanOrEqual(4);
    expect(registered.length).toBeGreaterThanOrEqual(4);
  });

  test("every dev-only route module under app/admin/dev is registered", () => {
    const missing = discovered.filter((f) => !(f in PROD_AVAILABLE) && !registered.includes(f));
    expect(
      missing,
      `unregistered dev route module(s): ${missing.join(", ")}. Add each to the FILES array in ` +
        `scripts/with-admin-dev-flag.mjs, or add a PROD_AVAILABLE entry here with the reason ` +
        `it is deliberately reachable in production.`,
    ).toEqual([]);
  });

  test("no FILES entry names a file that no longer exists", () => {
    // A stale entry is silently harmless to the build and silently useless as a
    // gate, which is exactly the combination that survives review.
    const stale = registered.filter((f) => !discovered.includes(f));
    expect(stale, `FILES entries with no matching file on disk: ${stale.join(", ")}`).toEqual([]);
  });

  test("a PROD_AVAILABLE carve-out is never ALSO registered for build-gating", () => {
    // Both at once means the file is renamed aside on flag-unset builds while
    // this test claims it ships to production — one of the two is wrong.
    const contradictory = Object.keys(PROD_AVAILABLE).filter((f) => registered.includes(f));
    expect(contradictory).toEqual([]);
  });

  test("every PROD_AVAILABLE carve-out still exists and carries a reason", () => {
    for (const [file, reason] of Object.entries(PROD_AVAILABLE)) {
      expect(discovered, `${file} no longer exists; drop its carve-out`).toContain(file);
      expect(reason.trim().length, file).toBeGreaterThan(20);
    }
  });

  test("the gallery route specifically is registered", () => {
    // Named explicitly: the generic sweep above would also pass if the walk
    // silently stopped recursing into a new subdirectory.
    expect(registered).toContain("app/admin/dev/attention-gallery/page.tsx");
  });
});
