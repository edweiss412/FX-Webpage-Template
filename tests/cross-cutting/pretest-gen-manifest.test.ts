import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

import { describe, expect, it } from "vitest";

import { MANIFEST } from "@/scripts/pretest-gen.mjs";

// Staleness guard (spec §4.3): the cache wrapper skips a generator when its
// manifest inputs are unchanged, so ANY read the generator performs outside its
// manifest row is a silent-staleness hole. Arms: (a) transitive local-import
// closure ⊆ inputs, no `@/`-alias or non-literal dynamic imports; (b) every
// fs READ call argument in a reached source is a covered literal, an
// in-file-resolved UPPER_SNAKE const, or a COMPUTED_READS pin; (c) no
// process.env reads. Plus: the four pre* hooks must invoke the wrapper.
//
// Arm (b) guards READ CALLS, not path-shaped literals: extract-email-boundaries
// carries ~24 repo-path literals that are canonicalization DATA (boundary-table
// keys), never read from disk — an all-literals arm would demand a churny
// allowlist that proves nothing.

type ManifestTarget = {
  name: string;
  script: string;
  inputs: string[];
  inputDirs?: { dir: string; pattern: string }[];
  output: string;
};

const TARGETS = MANIFEST as ManifestTarget[];

// Reads whose argument is a parameter or a computed path; each pinned to the
// manifest row that covers it. A new computed read fails until dispositioned.
const COMPUTED_READS: Record<string, string[]> = {
  // readPlanCorpus walks `dir` (dirname of PLAN_PATH) and reads each entry —
  // both covered by the gen:traceability inputDirs row; specPath/workflowPath
  // are parameters whose sole call sites pass SPEC_PATH / WORKFLOW_PATH.
  // (the READ_CALL capture stops at the first comma, so a nested call arrives
  // truncated — e.g. `join(dir, entry)` is seen as `join(dir`).
  "scripts/generate-traceability.ts": ["specPath", "workflowPath", "dir", "join(dir"],
};

const READ_CALL =
  /\b(?:readFileSync|readdirSync|existsSync|statSync|lstatSync|createReadStream|readFile|readdir|stat|access|open|glob|globSync)\(\s*([^,)]+)/g;
const STATIC_IMPORT = /(?:import|export)[^;]*?from\s+["'](\.[^"']+)["']/g;
const DYNAMIC_IMPORT_LITERAL = /import\(\s*["'](\.[^"']+)["']\s*\)/g;
const ALIAS_IMPORT = /(?:import|export)[^;]*?from\s+["']@\//;
const DYNAMIC_IMPORT_NONLITERAL = /import\(\s*[^"')\s]/;

function resolveLocal(fromFile: string, spec: string): string {
  const base = normalize(join(dirname(fromFile), spec)).replaceAll("\\", "/");
  for (const candidate of [base, `${base}.ts`, `${base}.mts`, `${base}.mjs`, `${base}.js`]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      /* try next extension */
    }
  }
  throw new Error(`cannot resolve import ${spec} from ${fromFile}`);
}

function importClosure(entry: string): string[] {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    const src = readFileSync(file, "utf8");
    expect(DYNAMIC_IMPORT_NONLITERAL.test(src), `${file}: non-literal dynamic import`).toBe(false);
    expect(ALIAS_IMPORT.test(src), `${file}: @/-alias import hides a manifest input`).toBe(false);
    for (const re of [STATIC_IMPORT, DYNAMIC_IMPORT_LITERAL]) {
      for (const m of src.matchAll(re)) {
        const resolved = resolveLocal(file, m[1]!);
        if (!seen.has(resolved)) {
          seen.add(resolved);
          queue.push(resolved);
        }
      }
    }
  }
  return [...seen];
}

/**
 * Resolve `const NAME = "literal";` in the same file, else null. Non-identifier
 * arguments (call expressions, template literals) never resolve — they must be
 * pinned in COMPUTED_READS instead.
 */
function resolveConst(src: string, name: string): string | null {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(src);
  return m ? m[1]! : null;
}

describe("pretest-gen manifest staleness guard", () => {
  it("covers all four generators", () => {
    expect(TARGETS.map((t) => t.name).sort()).toEqual([
      "gen:admin-tables",
      "gen:email-boundaries",
      "gen:traceability",
      "gen:watermark-symbols",
    ]);
  });

  it.each(TARGETS.map((t) => [t.name] as const))(
    "%s: import closure, read calls, and env reads are manifest-covered",
    (name) => {
      const target = TARGETS.find((t) => t.name === name)!;
      const covered = (path: string): boolean =>
        target.inputs.includes(path) ||
        target.output === path ||
        (target.inputDirs ?? []).some((d) => path.startsWith(d.dir));

      for (const file of importClosure(target.script)) {
        expect(target.inputs, `${file} reached by import walk — add to inputs`).toContain(file);
        const src = readFileSync(file, "utf8");
        expect(
          /process\.env/.test(src),
          `${file} reads process.env — extend the manifest schema first`,
        ).toBe(false);

        const pinned = COMPUTED_READS[file] ?? [];
        for (const m of src.matchAll(READ_CALL)) {
          const arg = m[1]!.trim();
          // Exact match (or exact call-prefix for a truncated nested call) — a
          // bare startsWith would also swallow `dirname(x)`, `dirs[0]`, etc.
          if (pinned.some((pin) => arg === pin || arg === `${pin})`)) continue;
          const literal = /^["'](.+)["']$/.exec(arg)?.[1] ?? resolveConst(src, arg);
          expect(
            literal !== null && covered(literal),
            `${file}: read of \`${arg}\` is not manifest-covered (add an input, or pin it in COMPUTED_READS)`,
          ).toBe(true);
        }
      }
    },
  );

  it("inputDirs pattern is derived from the generator's own readPlanCorpus filter", () => {
    const trace = TARGETS.find((t) => t.name === "gen:traceability")!;
    const dirs = trace.inputDirs ?? [];
    expect(dirs.length).toBe(1);
    const d = dirs[0]!;

    // Read the REAL filter out of the generator instead of restating it: a
    // widening there (a new accepted filename shape) must fail here, because
    // the cache would otherwise miss a file the generator actually reads.
    const gen = readFileSync("scripts/generate-traceability.ts", "utf8");
    const corpus = gen.slice(gen.indexOf("function readPlanCorpus"));
    const filterBody = corpus.slice(corpus.indexOf(".filter("), corpus.indexOf(".sort()"));
    const literals = [...filterBody.matchAll(/\/([^/]+)\/\.test|entry === "([^"]+)"/g)].map(
      (m) => m[1] ?? m[2]!,
    );
    // Today: the numeric-prefix regex plus the 11-cross-cutting.md special case.
    // Both are covered by the manifest's dir row (the special-cased file matches
    // the numeric-prefix pattern anyway); a THIRD accepted shape would not be.
    expect(literals.length).toBeLessThanOrEqual(2);
    expect(literals).toContain(d.pattern.replaceAll("\\\\", "\\"));

    expect(readdirSync(d.dir).filter((e) => new RegExp(d.pattern).test(e)).length).toBeGreaterThan(
      3,
    );
  });

  it("all four pre* hooks invoke the wrapper", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const hook of ["pretypecheck", "prelint", "pretest", "prebuild"]) {
      expect(pkg.scripts[hook], `${hook} must use the cache wrapper`).toBe(
        "node scripts/pretest-gen.mjs",
      );
    }
  });
});
