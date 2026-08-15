// tests/sync/pendingOrphanAgeGatePremise.test.ts
//
// Spec §4 / §7 L8. The row-less `_pending` reclamation stage deletes a prefix
// whose newest object is older than PENDING_ORPHAN_MIN_AGE_MS and that no
// VISIBLE ledger row claims. An in-flight run's row is uncommitted and
// therefore invisible, so the deletion is safe only while a live
// `snapshotAssets` run cannot outlive the gate.
//
// That bound does NOT come from any guard inside the run. The drive stall guard
// is an IDLE timer (`reset()` per chunk, lib/drive/stallGuard.ts) so it bounds
// the gap between chunks, never the total: a 50 MiB asset trickling 16 KiB every
// 29s stays inside the idle limit for ~25.8h, and an asset is uploaded only
// after its download completes. The bound that actually holds belongs to the
// EXECUTION CONTEXT: every entry point that reaches snapshotAssets today runs
// inside the Next.js app server -- a route handler, or a server action invoked
// from one -- and the platform bounds those in minutes.
//
// So this guard pins two things, and needs both, because either alone is a
// half-truth:
//
//   1. CONTAINMENT -- nothing outside the app tree WIRES the real, Supabase-backed
//      upload adapter. This is the half that makes the "a long-running worker reds
//      this test" promise TRUE. Rooting only at app/api/**/route.ts (this file's
//      first version) did not: server actions already reach snapshotAssets through
//      runManualSyncForShow, and a future scripts/ worker would have left the
//      route-root set unchanged and the guard green. Containment is on the WIRING
//      rather than on the import, because importing is not executing -- the
//      committed probe and the screenshot scripts both reach the module without
//      ever handing it real storage.
//   2. HEADROOM -- no app-tree module declares a maxDuration large enough to
//      approach the gate.
//
// Raising a declared maxDuration toward the gate, or introducing a caller
// outside the app tree, reds this test -- which is the signal to revisit the
// gate, not to raise the constant.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { PENDING_ORPHAN_MIN_AGE_MS } from "@/lib/sync/diagramGc";
import { premise } from "@/tests/_shared/premise";

const root = process.cwd();
const TARGET = join(root, "lib/sync/snapshotAssets.ts");

/** How much slack the gate keeps over the longest run the platform permits. */
const SAFETY_FACTOR = 24;

/**
 * Trees whose modules only ever execute inside the Next.js app server (`app/`)
 * or as libraries reached from it (`lib/`). A reaching file anywhere else is a
 * standalone process with no platform duration bound -- exactly the shape the
 * age gate cannot survive.
 */
const PLATFORM_BOUNDED_TREES = ["app", "lib"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * file -> in-repo files it imports. Static `from "…"` plus dynamic `import("…")`,
 * so a lazily-imported caller cannot slip the containment check. Built by
 * walking the filesystem, so a new file is covered by default rather than
 * silently exempt.
 */
function importGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, "utf8");
    const specifiers = [
      ...[...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]!),
      ...[...source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]!),
    ];
    graph.set(
      file,
      specifiers
        .map((specifier) => resolveSpecifier(specifier, file))
        .filter((resolved): resolved is string => resolved !== null),
    );
  }
  return graph;
}

function reachesTarget(file: string, graph: Map<string, string[]>): boolean {
  const seen = new Set<string>();
  const stack = [file];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === TARGET) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(graph.get(current) ?? []));
  }
  return false;
}

describe("row-less _pending age gate: the premise it rests on (spec §4, §7 L8)", () => {
  const graph = importGraph();
  const allFiles = [...graph.keys()];
  // Tests describe callers without being them; excluding them keeps the
  // containment assertion about production reachability.
  const productionFiles = allFiles.filter(
    (file) => !relative(root, file).startsWith("tests/") && file !== TARGET,
  );
  const reaching = productionFiles.filter((file) => reachesTarget(file, graph));
  const reachingRel = reaching.map((file) => relative(root, file));
  const declared = reaching
    .map((file) => {
      const match = readFileSync(file, "utf8").match(/export const maxDuration\s*=\s*(\d+)/);
      return match ? { file: relative(root, file), seconds: Number(match[1]) } : null;
    })
    .filter((entry): entry is { file: string; seconds: number } => entry !== null);

  test("the graph actually reaches snapshotAssets from production code", () => {
    // Without this, every assertion below ranges over an empty set and would
    // pass forever -- including after a refactor that renames the target module.
    premise("production files reach lib/sync/snapshotAssets.ts", reaching.length, 0);
    premise("at least one of them declares maxDuration", declared.length, 0);
  });

  test("every production upload wiring lives in a platform-bounded tree (no standalone worker owns an upload)", () => {
    premise("there are reaching files to classify", reachingRel.length, 0);
    // The containment half -- scoped to WIRING, not to importing. Merely
    // importing the module is not executing an upload: the committed probe and
    // the screenshot capture scripts pull it in transitively (through in-memory
    // ports and through page imports respectively) and never touch storage.
    // What actually opens a live `_pending` prefix is constructing the real
    // Supabase-backed adapter, so that is what must stay inside the app server.
    // A queue consumer, cron worker, or one-off script that wired it would have
    // no maxDuration and could hold a run open past the gate.
    const wiringSites = productionFiles.filter((file) => {
      if (file === join(root, "lib/sync/defaultSnapshotAssetsForApply.ts")) return false; // the definitions themselves
      const source = readFileSync(file, "utf8");
      return /\b(makeSnapshotAssetsForApply|applySnapshotStorage)\s*\(/.test(source);
    });
    premise("production code wires the real adapter somewhere", wiringSites.length, 0);
    const outsideBoundedTrees = wiringSites
      .map((file) => relative(root, file))
      .filter((file) => !PLATFORM_BOUNDED_TREES.some((tree) => file.startsWith(`${tree}/`)));
    expect(outsideBoundedTrees).toEqual([]);
  });

  test("every declared cap leaves the age gate at least 24x the longest permitted run", () => {
    premise("there is a declared cap to measure", declared.length, 0);
    const violations = declared.filter(
      (entry) => entry.seconds * 1000 * SAFETY_FACTOR > PENDING_ORPHAN_MIN_AGE_MS,
    );
    expect(violations).toEqual([]);
    // Stated as an absolute too, so a future reader sees the actual headroom
    // rather than only the ratio: 300s x 24 = 2h, against a 24h gate.
    const longestMs = Math.max(...declared.map((entry) => entry.seconds)) * 1000;
    expect(longestMs * SAFETY_FACTOR).toBeLessThanOrEqual(PENDING_ORPHAN_MIN_AGE_MS);
  });
});
