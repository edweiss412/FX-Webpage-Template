/**
 * tests/ci/attentionPillFocusWorkflow.test.ts
 *
 * Structural gate for the attention-pill-focus CI wiring (attention-index plan
 * Task 7).
 *
 * Why this file exists: the coverage meta-test CANNOT serve as that task's
 * oracle. `scanWorkflowCoverage` deliberately rejects any workflow carrying a
 * `pull_request.paths` filter (tests/ci/_workflowCoverageScan.ts), so a
 * path-gated job leaves this spec in LOCAL_ONLY_ALLOWLIST exactly as before —
 * and the meta-test only ever reads Object.keys of that map, never the reason
 * values. Flipping UNSEEN → PATH_GATED therefore has zero executable effect.
 *
 * Without the assertions below the whole suite stays green if the workflow is
 * missing, invokes the wrong spec, or omits a dependency path — and an omitted
 * path is not a cosmetic defect: it leaves the job dark for changes to that
 * input, which is the exact failure the gate exists to remove.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const WORKFLOW = ".github/workflows/attention-pill-focus-e2e.yml";
const SPEC = "tests/e2e/attention-pill-focus.spec.ts";

/** Every repository input the spec/entry loads BEFORE the production import,
 *  plus the production surfaces it renders, the toolchain inputs, and the
 *  workflow's own path (or a workflow-only repair never exercises the job).
 *  Derived by reading the spec and entry, not by copying the template — the
 *  template omits tsconfig.json despite its own live bundle passing it. */
const REQUIRED_PATHS = [
  SPEC,
  "tests/e2e/_pillFocusLiveEntry.tsx",
  "tests/e2e/_publishedReviewModalHarness.tsx",
  "tests/e2e/_step3ReviewModalBundle.mjs",
  "tests/e2e/standalone.config.ts",
  "tsconfig.json",
  "app/globals.css",
  "package.json",
  "pnpm-lock.yaml",
  WORKFLOW,
];

/** True when `path` is matched by a filter entry, exactly or via a `/**` glob. */
function coveredBy(filters: string[], path: string): boolean {
  return filters.some((f) => (f.endsWith("/**") ? path.startsWith(f.slice(0, -2)) : f === path));
}

/**
 * Walk the harness's TRANSITIVE import graph and return every repository source
 * file it pulls in, INCLUDING `tests/**` helpers — the workflow enumerates only
 * today's direct helpers, so a newly imported one would otherwise sit outside
 * the gate unseen (whole-diff review round 5).
 *
 * Derived, not hand-maintained (whole-diff review rounds 2 and 3). Two
 * successive enumerated lists both shipped with omissions — first
 * `AttentionBanner` and `sectionAttention`, then `needsLookHints` and
 * `audience`, then a further seven including `CompactAlertCard` and
 * `lib/messages/lookup`. A list was never going to track it; the only honest
 * check is to compute it.
 *
 * This is a LEXICAL closure, deliberately CONSERVATIVE and larger than the real
 * bundle. Three counts, all measured at this commit and easy to conflate:
 *   155 — actual production inputs, per an esbuild metafile
 *   321 — production files in this lexical closure (it also follows type-only
 *         edges and imports that "use server" elision strips)
 *   323 — the full closure, i.e. those 321 plus 2 `tests/**` helpers
 * Over-covering is the safe direction for a path gate: every real input is
 * inside the closure, so the job can only fire more often than strictly needed,
 * never less. Calling any of these "bundled files" would be wrong, and this
 * comment exists so nobody repeats that claim.
 */
function harnessImportGraph(entry: string): string[] {
  const EXT = [".ts", ".tsx", ".mjs", ".js"];
  const seen = new Set<string>();
  const repoFiles = new Set<string>();

  const resolveSpec = (spec: string, from: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
    else return null; // bare package specifier — not a repository input
    for (const suffix of ["", ...EXT, ...EXT.map((e) => `/index${e}`)]) {
      const candidate = base + suffix;
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
  };

  const walk = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    // tests/** helpers count too: the harness imports them, and the workflow
    // enumerates only TODAY's direct ones, so a newly-imported helper would
    // otherwise sit outside the gate unseen (whole-diff review round 5).
    const rel = file.replace(`${ROOT}/`, "");
    repoFiles.add(rel);
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      return;
    }
    // Four forms: `... from "x"` (covers import, import type, and export-from),
    // dynamic `import("x")`, side-effect `import "x"` (no `from` clause), and
    // `require("x")`. The last two have no repo-local instance in the graph
    // today, which is exactly why they would rot unnoticed.
    for (const m of src.matchAll(
      /from\s+["']([^"']+)["']|import\(["']([^"']+)["']\)|^\s*import\s+["']([^"']+)["']|require\(["']([^"']+)["']\)/gm,
    )) {
      const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
      if (!spec) continue;
      const resolved = resolveSpec(spec, file);
      if (resolved) walk(resolved);
    }
  };

  walk(join(ROOT, entry));
  return [...repoFiles];
}

describe("attention-pill-focus CI wiring", () => {
  const yaml = readFileSync(join(ROOT, WORKFLOW), "utf8");
  /**
   * ONLY `on.pull_request.paths` — not every quoted list item in the file
   * (whole-diff review round 4). The loose version accepted a path that appeared
   * anywhere in the YAML, so a dependency could be dropped from the real gate and
   * still "pass" because it survived in a comment or an unrelated sequence.
   */
  const filters = (() => {
    const onPr = /\non:\n {2}pull_request:\n((?: {4}[^\n]*\n| {6}[^\n]*\n| *#[^\n]*\n)+)/.exec(
      yaml,
    );
    if (!onPr) throw new Error("no on.pull_request block found");
    const block = /^ {4}paths:\n((?: {6}- "[^"]+"\n| *#[^\n]*\n)+)/m.exec(onPr[1]!);
    if (!block) throw new Error("no on.pull_request.paths sequence found");
    return [...block[1]!.matchAll(/^ {6}- "([^"]+)"$/gm)].map((m) => m[1]!);
  })();

  it("invokes the spec under the standalone config", () => {
    // the runner is reached through a package script, so accept either form
    const script = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const runLine = /run:\s*(.+)/g;
    const runs = [...yaml.matchAll(runLine)].map((m) => m[1]!.trim());
    const resolved = runs.map((r) => {
      const m = /^pnpm\s+(\S+)$/.exec(r);
      return m && script.scripts[m[1]!] ? script.scripts[m[1]!]! : r;
    });
    const invocation = resolved.find((r) => r.includes(SPEC));
    expect(invocation, `no run step invokes ${SPEC}`).toBeDefined();
    expect(invocation).toContain("tests/e2e/standalone.config.ts");
  });

  it("fires on every direct harness, production, and toolchain input", () => {
    // consumes the PARSED paths sequence, not `yaml.includes` — the latter
    // accepted a path that survived only in a comment (whole-diff review round 5)
    const missing = REQUIRED_PATHS.filter((p) => !coveredBy(filters, p));
    expect(missing, `path filter omits: ${missing.join(", ")}`).toEqual([]);
  });

  it("fires on EVERY production file in the harness's transitive import graph", () => {
    const graph = harnessImportGraph("tests/e2e/_pillFocusLiveEntry.tsx");
    // sanity: the walker actually resolved a real graph, so an empty result
    // caused by a broken resolver can never read as "everything is covered"
    expect(graph.length).toBeGreaterThan(100);
    const missing = graph.filter((f) => !coveredBy(filters, f)).sort();
    expect(
      missing,
      `${missing.length} file(s) in the harness import closure but outside the path filter: ${missing.slice(0, 12).join(", ")}`,
    ).toEqual([]);
  });

  it("is classified PATH_GATED, not UNSEEN, in the coverage registry", () => {
    const registry = readFileSync(join(ROOT, "tests/ci/_metaE2eWorkflowCoverage.test.ts"), "utf8");
    const row = new RegExp(`"${SPEC.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}":\\s*(\\w+)`);
    const m = row.exec(registry);
    expect(m, `no allowlist row for ${SPEC}`).not.toBeNull();
    expect(m![1]).toBe("PATH_GATED");
  });
});
