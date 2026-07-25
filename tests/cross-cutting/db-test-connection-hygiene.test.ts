import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import vitestConfig from "@/vitest.config";

// Structural guard for DB-test connection hygiene.
//
// 102 module-scope postgres.js clients live across the test suite, and 60 of
// them are never `.end()`ed on their own binding (they are overwhelmingly the
// `probe` client that DB tests open to read state back). 86 of the suite's 155
// constructions pass no `idle_timeout`, which postgres.js defaults to 0 --
// "never auto-close". Nothing in those 60 files closes their connection, so
// something else has to, and that something is process exit: vitest runs each
// test file in its own worker and terminates it when the file finishes, which
// closes its sockets.
//
// `isolate` is the setting that governs this, and it is the ONLY one that does.
// An earlier version of this guard also pinned `pool` away from "threads" on the
// theory that thread workers share a process and would retain sockets. That is
// wrong: with isolate:true vitest terminates thread workers too
// (`await this.thread.terminate()`), so the pool choice does not affect
// connection lifetime. It also asserted `poolOptions.<pool>.isolate`, a config
// key vitest 4 removed outright -- an assertion vitest ignores cannot fail
// meaningfully, so mutating it proved nothing.
//
// What DOES defeat the isolation:
//
//   1. `isolate: false` -- one worker serves many files, so those 60 unclosed
//      clients stack up for the length of the run. Settable in the config file
//      AND from the command line (`--no-isolate`), so this guard checks the
//      RESOLVED runtime value, not the authored one. An earlier version read
//      only the imported config and passed 6/6 under
//      `--no-isolate --pool=threads`.
//   2. `fileParallelism: true` on the serial project -- files overlap, so their
//      peaks add instead of alternating.
//
// Measured 2026-07-24 against the full local suite with the sampler filtering on
// `application_name = 'postgres.js'` (postgres.js 3.4.9 sets that by default at
// node_modules/postgres/src/index.js:485 -- an earlier measurement filtered on
// an EMPTY application_name and was reading background processes, not this
// suite). Numbers are in BACKLOG.md's withdrawn BL-TEST-PG-CLIENT-TEARDOWN
// entry. They hold only while the isolation does, which is what this file pins.

const ROOT = process.cwd();
const TESTS_DIR = join(ROOT, "tests");

type ProjectTest = { name: string; fileParallelism?: boolean; isolate?: boolean };
type ProjectEntry = { test: ProjectTest };

const projects =
  (vitestConfig as { test?: { projects?: ProjectEntry[] } }).test?.projects ??
  ([] as ProjectEntry[]);
const serial = projects.find((p) => p.test.name === "serial")?.test;

// The resolved config this very worker is running under. Unlike the imported
// config object, this reflects CLI flags and env overrides, so a run that
// disables isolation fails the guard instead of sailing past it.
const runtimeConfig = (
  globalThis as Record<string, unknown> & { __vitest_worker__?: { config?: { isolate?: boolean } } }
).__vitest_worker__?.config;

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listTsFiles(full));
    else if (/\.tsx?$/.test(ent.name)) out.push(relative(ROOT, full).split(sep).join("/"));
  }
  return out;
}

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  );
}

// The census counts module-scope postgres.js clients whose own binding is never
// `.end()`ed anywhere in their file -- the clients whose cleanup genuinely
// depends on process exit, which is exactly what the isolation provides.
//
// This walks the AST rather than matching text. A regex version of this census
// reported 42 where the true figure is 102 module-scope clients: it missed
// constructions inside top-level `try` blocks, ternaries, `var` bindings, and
// indented declarations, while separately miscounting the loopback-guard regex
// literals (`/^postgres(?:ql)?:\/\/.../`) that several helpers declare.
function censusUnendedModuleScopeClients(): string[] {
  const found: string[] = [];
  for (const file of listTsFiles(TESTS_DIR)) {
    const src = readFileSync(join(ROOT, file), "utf8");
    if (!/postgres\s*\(/.test(src)) continue;
    const sourceFile = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node, insideFunction: boolean): void => {
      const nowInside = insideFunction || isFunctionLike(node);
      if (
        !nowInside &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "postgres"
      ) {
        let parent: ts.Node | undefined = node.parent;
        while (parent && !ts.isVariableDeclaration(parent) && !ts.isSourceFile(parent)) {
          parent = parent.parent;
        }
        if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
          const binding = parent.name.text;
          if (!new RegExp(`\\b${binding}\\s*\\.\\s*end\\s*\\(`).test(src)) {
            found.push(`${file} [${binding}]`);
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, nowInside));
    };
    ts.forEachChild(sourceFile, (child) => visit(child, false));
  }
  return found;
}

// Flags that switch off per-file isolation. A run command carrying one of these
// would defeat the invariant for the files it runs; the runtime assertion below
// only catches it when THIS file is part of that run.
const ISOLATION_KILLING_FLAGS = [/--no-isolate\b/, /--isolate[= ]false\b/];

describe("DB-test connection hygiene depends on per-file worker isolation", () => {
  // Anti-vacuity. Every assertion here exists to protect these clients; if the
  // suite ever stops having them, the guard should be retired deliberately
  // rather than left passing over an empty set.
  it("the invariant has real subjects — module-scope clients that nothing closes", () => {
    const unended = censusUnendedModuleScopeClients();
    expect(
      unended.length,
      "expected many module-scope postgres.js clients with no .end() on their own binding " +
        `(60 at 2026-07-24); found ${unended.length}. If this collapsed, the clients grew ` +
        "teardowns of their own and this guard can be retired",
    ).toBeGreaterThan(25);
  });

  it("the RESOLVED config this run is using keeps isolation on", () => {
    // Reading the imported config here would be the bug this assertion exists to
    // avoid: `vitest run --no-isolate` leaves the config file untouched.
    expect(
      runtimeConfig,
      "expected vitest's worker context to expose the resolved config; if vitest changed " +
        "this internal, replace it with another resolved-config source rather than falling " +
        "back to the authored config, which cannot see CLI overrides",
    ).toBeDefined();
    expect(
      runtimeConfig!.isolate,
      "isolate must be true at RUNTIME — false shares one worker across files, so the " +
        "module-scope clients that nothing closes accumulate for the whole run",
    ).toBe(true);
  });

  it("no run command disables isolation", () => {
    const offenders: string[] = [];
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    for (const [name, body] of Object.entries(pkg.scripts ?? {})) {
      if (ISOLATION_KILLING_FLAGS.some((re) => re.test(body))) {
        offenders.push(`package.json: ${name}`);
      }
    }
    const workflowsDir = join(ROOT, ".github", "workflows");
    for (const entry of readdirSync(workflowsDir)) {
      if (!/\.ya?ml$/.test(entry)) continue;
      const body = readFileSync(join(workflowsDir, entry), "utf8");
      // Strip comment lines so an explanatory mention is not read as a command.
      const commands = body
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
      if (ISOLATION_KILLING_FLAGS.some((re) => re.test(commands))) {
        offenders.push(`.github/workflows/${entry}`);
      }
    }
    expect(offenders, "these run commands disable per-file isolation").toEqual([]);
  });

  it("the serial project keeps files sequential, so per-file peaks alternate instead of adding", () => {
    // Also pinned by vitest-projects-partition.test.ts for the DB-race reason.
    // Asserted here for the connection-count reason so removing either guard
    // does not silently drop the other's coverage.
    expect(serial, "vitest.config.ts must define a `serial` project").toBeDefined();
    expect(
      serial!.fileParallelism,
      "serial.fileParallelism must stay false — overlapping DB files sum their pools",
    ).toBe(false);
  });
});
