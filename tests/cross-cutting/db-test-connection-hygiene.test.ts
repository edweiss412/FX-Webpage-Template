import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import vitestConfig from "@/vitest.config";

// Structural guard for DB-test connection hygiene.
//
// 106 module-scope postgres.js clients live across the test suite (102 declared
// and initialized in one statement, 4 assigned to a binding declared earlier),
// and 60 of them -- spread over 59 files -- are never `.end()`ed on their own
// binding. They are overwhelmingly the `probe` client that DB tests open to read
// state back. 86 of the suite's 155 constructions pass no `idle_timeout`, which
// postgres.js leaves `null` -- never auto-close. Nothing visibly closes those
// 60, so something else has to, and that something is process exit: vitest runs
// each test file in its own worker and terminates it when the file finishes,
// which closes its sockets.
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
// Two settings govern how many of those connections can be alive at once. They
// are independent -- file parallelism does NOT disable isolation, it schedules
// several still-isolated workers at the same time:
//
//   1. `isolate: false` -- one worker serves many files, so those 60 unclosed
//      clients stack up for the length of the run. Settable in the config file
//      AND from the command line (`--no-isolate`), so this guard checks the
//      RESOLVED runtime value, not the authored one. An earlier version read
//      only the imported config and passed 6/6 under
//      `--no-isolate --pool=threads`.
//   2. `fileParallelism: true` on the serial project -- vitest schedules files
//      concurrently, so many pools are held at once instead of roughly one at a
//      time. Settable in the config, from the command line, and via
//      VITEST_MAX_WORKERS, so this is likewise checked at runtime.
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
  globalThis as Record<string, unknown> & {
    __vitest_worker__?: {
      config?: { isolate?: boolean; name?: string; maxWorkers?: number };
    };
  }
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
// `.end()`ed anywhere in their file -- the closest syntactic proxy for "cleanup
// depends on process exit", with the limits spelled out below.
//
// This walks the AST rather than matching text. A regex version of this census
// reported 42 where the true figure is 106 module-scope clients: it missed
// constructions inside top-level `try` blocks, ternaries, `var` bindings, and
// indented declarations, while separately miscounting the loopback-guard regex
// literals (`/^postgres(?:ql)?:\/\/.../`) that several helpers declare.
//
// It stays a heuristic in one half: "closed" is a source-level search for
// `<binding>.end(`, so it errs in BOTH directions. A teardown routed through an
// alias, a wrapper, or a collection (`afterAll(() => closeSql(sql))`) is not
// seen, and the client is counted though it is genuinely closed; conversely the
// string appearing in a comment or an unreachable branch drops a client that is
// not.
//
// So read this floor for what it is: a COARSE tripwire that the suite still
// contains many clients with no teardown visible at the construction site. It is
// not a proof that 60 specific connections depend on process exit; it would not
// notice a wholesale migration to wrapper teardowns (every client genuinely
// closed, every one still counted, floor still green); and at `> 25` against 60
// it does not notice small drift either. What it does catch is the invariant
// losing its subjects wholesale -- which is the case where this whole file
// should be deleted rather than left passing over nothing.
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
        while (
          parent &&
          !ts.isVariableDeclaration(parent) &&
          !ts.isBinaryExpression(parent) &&
          !ts.isSourceFile(parent)
        ) {
          parent = parent.parent;
        }
        let binding: string | undefined;
        if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
          binding = parent.name.text;
        } else if (
          parent &&
          ts.isBinaryExpression(parent) &&
          parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(parent.left)
        ) {
          // `sql = postgres(...)` against a binding declared earlier. Four such
          // sites exist; all four are currently closed, so this branch changes
          // no count today — it is here so the classifier describes the shape
          // rather than accidentally excluding it.
          binding = parent.left.text;
        }
        if (binding && !new RegExp(`\\b${binding}\\s*\\.\\s*end\\s*\\(`).test(src)) {
          found.push(`${file} [${binding}]`);
        }
      }
      ts.forEachChild(node, (child) => visit(child, nowInside));
    };
    ts.forEachChild(sourceFile, (child) => visit(child, false));
  }
  return found;
}

// Overrides that defeat the invariant for the files a run covers. The runtime
// assertions below catch every one of these WHEN THIS FILE IS IN THE RUN; the
// scan exists for the runs that exclude it, e.g. a command targeting only
// tests/db.
//
// Quoted spellings are matched because a shell strips the quotes before vitest
// sees them: `--isolate="false"` arrives as `--isolate=false`.
//
// This is a text scan of committed run commands, and its coverage is bounded by
// that. It cannot see a flag assembled at runtime, a value arriving from repo or
// org CI settings, a composite action's internals, or an alternate `--config`
// whose file sets `isolate: false` (no token here would distinguish that from
// the ordinary `--config`/`--project` use this repo already makes). Treat it as
// catching the obvious committed spellings, not as a proof that no committed
// path can disable isolation.
const ISOLATION_KILLING_FLAGS = [
  /--no-isolate\b/,
  /--isolate[= ]["']?false["']?/,
  // Re-enabling file parallelism overrides the serial project's own setting.
  /--file-?[pP]arallelism\b(?!=["']?false)/,
  // Vitest applies VITEST_MAX_WORKERS AFTER fileParallelism:false has resolved
  // maxWorkers to 1, so the env var alone makes serial files concurrent. A
  // quote may sit on either side of the separator (`"VITEST_MAX_WORKERS": 2` in
  // YAML or JSON is the same instruction as `VITEST_MAX_WORKERS=2` in a shell),
  // and a literal 1 is benign — it is what serial resolves to anyway. There is
  // no VITEST_MIN_WORKERS in the installed vitest, so none is matched.
  /VITEST_MAX_WORKERS["']?\s*[=:]\s*["']?(?!1\b)\d/,
];

// Where runs are launched from. package.json and the workflows are the obvious
// surfaces; scripts/ matters because scripts/test-fast.mjs spawns vitest with
// an argv it builds in JS, so a flag added there reaches no other scanned file.
// A computed flag would still evade this — the scan catches literals.
//
// Walked RECURSIVELY. A flat readdir missed scripts/ci/*.sh, which is where the
// CI bootstrap lives; a `--no-isolate` added there passed the scan clean.
const RUN_COMMAND_SOURCES: Array<{ dir: string; match: RegExp }> = [
  { dir: ".github/workflows", match: /\.ya?ml$/ },
  { dir: "scripts", match: /\.([cm]?[jt]sx?|sh|bash)$/ },
];

function listMatching(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${ent.name}`;
    if (ent.isDirectory()) out.push(...listMatching(rel, match));
    else if (match.test(ent.name)) out.push(rel);
  }
  return out;
}

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

  // A floor alone does not pin the census DEFINITION: broadening it — dropping
  // the unended filter, or counting function-scoped constructions — only pushes
  // the count up, so the floor still passes over a census that means something
  // else entirely. These membership assertions make the classifier load-bearing.
  it("the census counts construction-site-unclosed module-scope clients", () => {
    const census = censusUnendedModuleScopeClients();
    const files = new Set(census.map((entry) => entry.split(" ")[0]));

    // In: a module-scope client whose binding is never ended anywhere in its file.
    expect(census, "the canonical unended module-scope client must be counted").toContain(
      "tests/db/_remediationHelpers.ts [sql]",
    );

    // Out: module-scope, but the binding IS ended — process exit is not what
    // saves it, so it is not this guard's subject.
    expect(
      files.has("tests/db/_holdsHelpers.ts"),
      "tests/db/_holdsHelpers.ts ends its module-scope client (closeHoldsHelpers) — must NOT be counted",
    ).toBe(false);

    // Out: constructions that live inside functions open on call, and their
    // caller owns the close.
    expect(
      files.has("tests/admin/extractAgenda.test.ts"),
      "tests/admin/extractAgenda.test.ts constructs only inside functions — must NOT be counted",
    ).toBe(false);
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
    for (const { dir, match } of RUN_COMMAND_SOURCES) {
      for (const entry of listMatching(dir, match)) {
        const body = readFileSync(join(ROOT, entry), "utf8");
        // Strip WHOLE comment lines only — `#` (YAML, shell) and `//` (the
        // .mjs/.ts launchers) — so a paragraph explaining these flags is not
        // read as a command.
        //
        // Trailing comments are deliberately NOT stripped. A previous version
        // cut each line at ` #`, which silently hid a real offender:
        // `spawn("vitest", ["run", "label #1", "--no-isolate"])` truncates
        // before the flag. The cost of not stripping is the opposite error — a
        // flag named in an end-of-line comment fails this test — and that is the
        // side to be wrong on, since it is loud rather than silent.
        const commands = body
          .split("\n")
          .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("#") && !trimmed.startsWith("//");
          })
          .join("\n");
        if (ISOLATION_KILLING_FLAGS.some((re) => re.test(commands))) {
          offenders.push(entry);
        }
      }
    }
    expect(offenders, "these run commands disable per-file isolation").toEqual([]);
  });

  it("the serial project runs one test file at a time", () => {
    // What this buys, precisely: vitest schedules one file's tasks at a time, so
    // N files do not deliberately hold N pools at once. It is NOT a guarantee of
    // strict non-overlap — vitest does not await worker teardown before starting
    // the next file, so a slow-exiting worker can still hold sockets while its
    // successor begins. That window is why the measurement reports a SAMPLED
    // peak and a trend rather than a hard ceiling.
    //
    // Two assertions, because the authored value and the effective value can
    // disagree: `vitest run --fileParallelism` makes the serial project
    // concurrent while `serial.fileParallelism` still reads false.
    //
    // The runtime side is `maxWorkers`, since the worker config does not carry
    // `fileParallelism` itself: vitest resolves fileParallelism:false to
    // maxWorkers 1, and `--fileParallelism` leaves maxWorkers unset. The project
    // name is asserted alongside it so that moving this file into the parallel
    // project — where maxWorkers 1 would NOT hold — fails loudly here instead of
    // quietly turning the check into a false alarm.
    expect(
      runtimeConfig,
      "expected vitest's worker context to expose the resolved config",
    ).toBeDefined();
    expect(
      runtimeConfig!.name,
      "this guard must run in the serial project; its maxWorkers assertion is only meaningful there",
    ).toBe("serial");
    expect(
      runtimeConfig!.maxWorkers,
      "maxWorkers must be 1 at RUNTIME — anything else lets vitest schedule files " +
        "concurrently, so their pools are held at the same time",
    ).toBe(1);

    // The authored value too. Also pinned by vitest-projects-partition.test.ts
    // for the DB-race reason; asserted here for the connection-count reason so
    // removing either guard does not silently drop the other's coverage.
    expect(serial, "vitest.config.ts must define a `serial` project").toBeDefined();
    expect(
      serial!.fileParallelism,
      "serial.fileParallelism must stay false — concurrent DB files hold their pools at once",
    ).toBe(false);
  });
});
