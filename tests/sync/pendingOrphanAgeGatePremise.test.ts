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
// after its download completes. The bound that actually holds is the execution
// context's -- every entry point that reaches snapshotAssets is a serverless
// function measured in minutes.
//
// Because that is a property of the DEPLOYMENT rather than of the module, it is
// pinned here rather than argued in prose. Raising a reaching route's
// maxDuration toward the gate, or moving snapshot uploads into a long-running
// worker, reds this test -- which is the signal to revisit the gate.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { PENDING_ORPHAN_MIN_AGE_MS } from "@/lib/sync/diagramGc";
import { premise } from "@/tests/_shared/premise";

const root = process.cwd();
const TARGET = join(root, "lib/sync/snapshotAssets.ts");

/** How much slack the gate keeps over the longest run the platform permits. */
const SAFETY_FACTOR = 24;

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

/** file -> in-repo files it imports, resolved. Built once from disk, so a new route is covered by default. */
function importGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, "utf8");
    const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]!);
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
  const routes = [...graph.keys()].filter((file) => /app\/api\/.*\/route\.ts$/.test(file));
  const reaching = routes.filter((route) => reachesTarget(route, graph));
  const declared = reaching
    .map((route) => {
      const match = readFileSync(route, "utf8").match(/export const maxDuration\s*=\s*(\d+)/);
      return match ? { route: route.replace(`${root}/`, ""), seconds: Number(match[1]) } : null;
    })
    .filter((entry): entry is { route: string; seconds: number } => entry !== null);

  test("some route actually reaches snapshotAssets and declares a duration cap", () => {
    // Without both, every assertion below ranges over an empty set and would
    // pass forever -- including after a refactor that renames the target module.
    premise("routes under app/api reach lib/sync/snapshotAssets.ts", reaching.length, 0);
    premise("at least one reaching route declares maxDuration", declared.length, 0);
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
