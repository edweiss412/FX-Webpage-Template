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
// EXECUTION CONTEXT: every production path that hands snapshotAssets a real
// Supabase-backed adapter runs inside the Next.js app server -- a route handler,
// or a server action invoked from one -- and the platform bounds those in
// minutes.
//
// This guard pins that in two halves, and needs both:
//
//   1. CONTAINMENT -- no module outside the app trees can REACH a wiring module
//      (one that constructs the real adapter). Two earlier versions were weaker
//      and both were caught in review: rooting at `app/api/**/route.ts` missed
//      server actions, which reach snapshotAssets through runManualSyncForShow;
//      and source-scanning for the wiring symbols missed a caller that invokes
//      an existing lib/ wrapper without ever spelling one. Reachability to the
//      wiring modules is the property that survives both -- a scripts/ worker
//      calling applyStaged() is caught even though it names no adapter.
//   2. HEADROOM -- no module that reaches snapshotAssets declares a maxDuration
//      large enough to approach the gate.
//
// Reddening either half is the signal to revisit the gate, not to raise the
// constant.
//
// WHAT THIS CANNOT SEE, stated so it is a documented limit rather than the next
// round's finding. The threat model is an ordinary contributor adding a caller,
// not someone evading a test. Containment reads STATIC module edges -- `from`,
// `import()`, and `require()` with literal specifiers -- so a specifier built at
// runtime, a module loaded through a computed path, or an upload driven by
// shelling out to another process is outside its reach. Those are deliberate
// acts, not authoring slips, and the deployment bound (§7 L8) is what the
// spec relies on regardless; this guard exists to make an accidental
// regression loud, not to be unevadable.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { PENDING_ORPHAN_MIN_AGE_MS } from "@/lib/sync/diagramGc";
import { premise } from "@/tests/_shared/premise";

const root = process.cwd();
const TARGET = join(root, "lib/sync/snapshotAssets.ts");
const ADAPTER_MODULE = join(root, "lib/sync/defaultSnapshotAssetsForApply.ts");

/** How much slack the gate keeps over the longest run the platform permits. */
const SAFETY_FACTOR = 24;

/** Constructing either of these hands snapshotAssets a live Supabase storage port. */
const WIRING_SYMBOLS = /\b(makeSnapshotAssetsForApply|applySnapshotStorage)\s*\(/;

/**
 * The entry points that RUN an upload. An exempt module that calls one is no
 * longer render-only, so its exemption is void -- the row is granted for the
 * stated behavior, not for the filename.
 */
const UPLOAD_ENTRY_SYMBOLS =
  /\b(makeSnapshotAssetsForApply|applySnapshotStorage|snapshotAssets|applyStaged|runScheduledCronSync|runManualStageForFirstSeen|runManualSyncForShow)\s*\(/;

/** Trees whose modules only ever execute inside the Next.js app server. */
const PLATFORM_BOUNDED_TREES = ["app", "lib", "components"];

/**
 * Non-app modules that reach a wiring module through STATIC imports but cannot
 * execute one. Static reachability cannot distinguish importing from invoking,
 * so the residue is declared here with its reason rather than silently widened
 * away. Both directions are asserted: an unlisted reacher fails, and so does a
 * listed file that no longer reaches (a stale row).
 */
const NON_EXECUTING_EXEMPTIONS: Record<string, string> = {
  "scripts/captureStep3HeaderBaseline.ts":
    "screenshot capture -- imports page/component modules to render them; invokes no apply/sync entry point",
  "scripts/gallery-screenshots.ts":
    "screenshot capture -- imports the attention-gallery scenario builders to drive playwright; invokes no apply/sync entry point",
};

/**
 * Every module extension a worker could be written in -- not just `.ts`/`.tsx`.
 * A `scripts/worker.mjs` is exactly as capable of holding a run open, and
 * discovering only TypeScript would let it escape the walk entirely.
 */
const MODULE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const MODULE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (MODULE_FILE.test(full)) out.push(full);
  }
  return out;
}

function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;
  // An extensionless specifier resolves by trying each; an explicit one (`./x.js`,
  // common in ESM) is already a path, so it is tried verbatim first.
  const candidates = [
    base,
    ...MODULE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...MODULE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * file -> in-repo files it imports. Static `from "…"` plus dynamic `import("…")`,
 * so a lazily-imported caller cannot slip the containment check. Walked from
 * disk, so a new file is covered by default rather than silently exempt.
 */
function importGraph(files: string[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const specifiers = [
      ...[...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]!),
      ...[...source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]!),
      ...[...source.matchAll(/require\s*\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]!),
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

function reaches(file: string, targets: Set<string>, graph: Map<string, string[]>): boolean {
  const seen = new Set<string>();
  const stack = [file];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (targets.has(current)) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(graph.get(current) ?? []));
  }
  return false;
}

describe("row-less _pending age gate: the premise it rests on (spec §4, §7 L8)", () => {
  const allFiles = sourceFiles(root);
  const graph = importGraph(allFiles);
  // Tests describe callers without being them; excluding them keeps every
  // assertion about production reachability.
  const production = allFiles.filter((file) => !relative(root, file).startsWith("tests/"));

  // The containment TARGETS. The adapter module itself is one of them, which is
  // what makes the check immune to how a caller spells the symbol: an aliased
  // `import { makeSnapshotAssetsForApply as make }` still produces an edge to
  // this module, so no call-site regex has to recognize `make(`. The derived set
  // below adds the lib/ wrappers that construct the adapter internally -- they
  // all import it too, so they are strictly redundant today, and are kept so the
  // targets stay correct if one is ever restructured to build a port inline.
  const wiringModules = new Set([
    ADAPTER_MODULE,
    ...production.filter(
      (file) => file !== ADAPTER_MODULE && WIRING_SYMBOLS.test(readFileSync(file, "utf8")),
    ),
  ]);

  const reachingTarget = production.filter(
    (file) => file !== TARGET && reaches(file, new Set([TARGET]), graph),
  );
  const declared = reachingTarget
    .map((file) => {
      const match = readFileSync(file, "utf8").match(/export const maxDuration\s*=\s*(\d+)/);
      return match ? { file: relative(root, file), seconds: Number(match[1]) } : null;
    })
    .filter((entry): entry is { file: string; seconds: number } => entry !== null);

  test("the graph reaches snapshotAssets and finds the real wiring", () => {
    // Without these, every assertion below ranges over an empty set and would
    // pass forever -- including after a refactor that renames either module.
    premise("production files reach lib/sync/snapshotAssets.ts", reachingTarget.length, 0);
    premise("production code constructs the real adapter somewhere", wiringModules.size, 0);
    premise("at least one reaching module declares maxDuration", declared.length, 0);
  });

  test("no module outside the app trees can reach the real upload wiring", () => {
    const outsiders = production
      .map((file) => relative(root, file))
      .filter((file) => !PLATFORM_BOUNDED_TREES.some((tree) => file.startsWith(`${tree}/`)))
      .filter((file) => reaches(join(root, file), wiringModules, graph));

    // An exemption is granted for BEHAVIOR, so it is re-checked against that
    // behavior rather than trusted by filename: a listed script that gains a
    // direct apply/sync invocation stops being render-only and stops being
    // exempt, in the same run that introduces the call.
    const stillRenderOnly = (file: string) =>
      file in NON_EXECUTING_EXEMPTIONS &&
      !UPLOAD_ENTRY_SYMBOLS.test(readFileSync(join(root, file), "utf8"));

    // A standalone process -- queue consumer, cron worker, one-off script -- has
    // no platform duration bound and could hold a run open past the gate.
    // Reachability rather than a call-site scan, so a worker is caught whether it
    // calls an existing lib/ wrapper, aliases the factory on import, or reaches
    // it through require().
    expect(outsiders.filter((file) => !stillRenderOnly(file))).toEqual([]);

    // No stale exemption: a row that stopped reaching is a row that stopped
    // being an exemption, and leaving it invites the next one to be waved past.
    expect(
      Object.keys(NON_EXECUTING_EXEMPTIONS).filter((file) => !outsiders.includes(file)),
    ).toEqual([]);
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
