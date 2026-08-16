import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { classifyTests } from "./premiseScan";

const ROOT = join(__dirname, "..", "..", "..");
const scratch = mkdtempSync(join(tmpdir(), "premise-scan-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
/** Write a synthetic suite and return its verdict. Parsed, never executed. */
function verdict(src: string): string {
  const p = join(scratch, `case${n++}.ts`);
  writeFileSync(p, src, "utf8");
  const [first] = classifyTests(ROOT, p);
  return first?.verdict ?? "<no test found>";
}

describe("provenance, over the declaration-reference graph", () => {
  it("finds a test at all, so every verdict below is about something", () => {
    // Non-vacuity: a scanner returning [] would make every case below read
    // "<no test found>" rather than fail, and a scanner returning a constant
    // would pass whichever half of each pair it happened to match.
    expect(verdict(`it("x", () => {});`)).toBe("environment-free");
  });

  it("direct spawn in the test body", () => {
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        it("x", () => { spawnSync("git", []); });`),
    ).toBe("environment-touching");
  });

  it("aliased import", () => {
    expect(
      verdict(`import { spawnSync as run } from "node:child_process";
        it("x", () => { run("git", []); });`),
    ).toBe("environment-touching");
  });

  it("namespace import", () => {
    expect(
      verdict(`import * as cp from "node:child_process";
        it("x", () => { cp.spawnSync("git", []); });`),
    ).toBe("environment-touching");
  });

  it("dynamic destructured import", () => {
    expect(
      verdict(`it("x", async () => {
        const { spawnSync } = await import("node:child_process");
        spawnSync("git", []); });`),
    ).toBe("environment-touching");
  });

  it("process.env direct member access", () => {
    expect(verdict(`it("x", () => { const r = process.env.ROOT; });`)).toBe("environment-touching");
  });

  it("process.env destructured", () => {
    expect(
      verdict(`const { env } = process;
        it("x", () => { const r = env.ROOT; });`),
    ).toBe("environment-touching");
  });

  it("two-level same-file chain", () => {
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        const inner = () => spawnSync("git", []);
        const outer = () => inner();
        it("x", () => { outer(); });`),
    ).toBe("environment-touching");
  });

  it("module-scope initializer that no body reads", () => {
    expect(
      verdict(`const root = process.env.ROOT;
        function readRoot() { return root; }
        it("x", () => { readRoot(); });`),
    ).toBe("environment-touching");
  });

  it("module-level assignment to a reachable binding", () => {
    expect(
      verdict(`let root;
        root = process.env.ROOT;
        function readRoot() { return root; }
        it("x", () => { readRoot(); });`),
    ).toBe("environment-touching");
  });

  it("default parameter initializer", () => {
    expect(
      verdict(`function f(x = process.env.ROOT) { return x; }
        it("x", () => { f(); });`),
    ).toBe("environment-touching");
  });

  it("hook-mediated read classifies the whole describe subtree", () => {
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        describe("d", () => {
          beforeEach(() => { spawnSync("git", []); });
          it("x", () => { expect(1).toBe(1); });
        });`),
    ).toBe("environment-touching");
  });

  it("an environment-derived .each producer is inside the test's extent", () => {
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        const rows = () => String(spawnSync("git", []).stdout).split("\\n");
        test.each(rows())("x %s", (r) => { expect(r).toBeDefined(); });`),
    ).toBe("environment-touching");
  });
});

describe("the foils — each differs from a case above in exactly one thing", () => {
  it("pure local wrapper", () => {
    expect(
      verdict(`import { join } from "node:path";
        const inner = () => join("a", "b");
        it("x", () => { inner(); });`),
    ).toBe("environment-free");
  });

  it("pure module constant, so the rule is not `any module constant`", () => {
    expect(
      verdict(`const n = 3;
        function readN() { return n; }
        it("x", () => { readN(); });`),
    ).toBe("environment-free");
  });

  it("a helper whose MODULE merely shares a file with a provenance importer", () => {
    // scripts/ledger-claims.ts imports realGitSurface from ledger-git, which
    // imports child_process -- but reportEnvelope's body references neither. A
    // module-CLOSURE rule marks this environment-touching, including the
    // 101-claim fixture that touches nothing. Declarations, not modules.
    expect(
      verdict(`import { reportEnvelope } from "@/scripts/ledger-claims";
        it("x", () => { reportEnvelope({ degraded: [], claims: [] }); });`),
    ).toBe("environment-free");
  });

  it("a pure .each producer", () => {
    expect(
      verdict(`const rows = () => ["a", "b"];
        test.each(rows())("x %s", (r) => { expect(r).toBeDefined(); });`),
    ).toBe("environment-free");
  });
});

describe("`process` is a BINDING, not the six characters before `.env` (whole-diff R3 #1)", () => {
  // The reach test read `node.getText().startsWith("process.env")`, so it
  // answered on source text in BOTH directions and said nothing either way:
  // every case here returned `detail: ""`, which is the silence the consequence
  // bound forbids. Resolution is structural now, through the same binder every
  // other reference uses.

  it("a PARAMETER named process is not the global", () => {
    expect(
      verdict(`function read(process: { env: Record<string, string> }) { return process.env.ROOT; }
        it("x", () => { read({ env: {} }); });`),
    ).toBe("environment-free");
  });

  it("a LOCAL named process is not the global", () => {
    expect(
      verdict(`it("x", () => { const process = { env: { ROOT: "." } }; const r = process.env.ROOT; });`),
    ).toBe("environment-free");
  });

  it("the global still reads through parentheses", () => {
    expect(verdict(`it("x", () => { const r = (process).env.ROOT; });`)).toBe(
      "environment-touching",
    );
  });

  it("the global still reads through a non-null assertion", () => {
    expect(verdict(`it("x", () => { const r = process!.env.ROOT; });`)).toBe(
      "environment-touching",
    );
  });

  it("the global still reads through an `as` cast", () => {
    expect(
      verdict(`it("x", () => { const r = (process as { env: Record<string, string> }).env.ROOT; });`),
    ).toBe("environment-touching");
  });

  it("the global still reads through an optional chain", () => {
    expect(verdict(`it("x", () => { const r = process?.env?.ROOT; });`)).toBe(
      "environment-touching",
    );
  });

  it("a STRING-LITERAL computed access is the same read, spelled differently", () => {
    // Distinct from the unclassifiable case below: a literal key IS resolvable,
    // so declining here would be a demote the recognizer does not need.
    expect(verdict(`it("x", () => { const r = process["env"].ROOT; });`)).toBe(
      "environment-touching",
    );
  });
});

describe("every applicable default, not only the deepest (whole-diff R3 #2)", () => {
  // `own ?? el.initializer` kept the INNER default and dropped the outer one,
  // so a binding whose provenance is the outer default lost it silently.
  //
  // The pattern is at MODULE scope in every case here, deliberately: inside a
  // test body the walk covers the pattern's own text and reaches the default
  // whether or not the binding recorded it, which hides the defect instead of
  // exposing it. At module scope the binding's registered extent is the only
  // route, so these fixtures discriminate.
  const spawner = `import { spawnSync } from "node:child_process";
    const mk = () => { spawnSync("git", []); return { b: 0 }; };
    const mkArr = () => { spawnSync("git", []); return [0]; };`;

  it("object nested in object", () => {
    expect(
      verdict(`${spawner}
        const { a: { b = 0 } = mk() } = {} as never;
        it("x", () => { void b; });`),
    ).toBe("environment-touching");
  });

  it("array nested in object", () => {
    expect(
      verdict(`${spawner}
        const { a: [b = 0] = mkArr() } = {} as never;
        it("x", () => { void b; });`),
    ).toBe("environment-touching");
  });

  it("object nested in array", () => {
    expect(
      verdict(`${spawner}
        const [{ b = 0 } = mk()] = [] as never;
        it("x", () => { void b; });`),
    ).toBe("environment-touching");
  });

  it("array nested in array", () => {
    expect(
      verdict(`${spawner}
        const [[b = 0] = mkArr()] = [] as never;
        it("x", () => { void b; });`),
    ).toBe("environment-touching");
  });

  it("the inner default is still reached when it is the spawning one", () => {
    // The pair to the four above: keeping the OUTER default must not become
    // dropping the inner one.
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        const inner = () => spawnSync("git", []);
        const { a: { b = inner } = { b: undefined } } = {} as never;
        it("x", () => { void b; });`),
    ).toBe("environment-touching");
  });

  it("a PARAMETER's default is reachable code too", () => {
    // Same shape, different binding form: parameters registered as bare shadows
    // with no extent, so a spawning default on one was lost exactly as the
    // nested case above lost the outer default.
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        const spawning = () => spawnSync("git", []);
        function run(helper = spawning) { return helper(); }
        it("x", () => { run(); });`),
    ).toBe("environment-touching");
  });
});

describe("a write is an assignment OPERATOR, not one statement shape (whole-diff R3 #3)", () => {
  // The write pass matched `ExpressionStatement > BinaryExpression(=) >
  // Identifier` — the single spelling. Every other assignment form lost the
  // provenance it assigns, silently, and each of these is an ordinary edit of
  // the assignment fixture that already existed.
  const spawner = `import { spawnSync } from "node:child_process";
    const spawning = () => spawnSync("git", []);`;

  it("a logical-assignment operator", () => {
    expect(
      verdict(`${spawner}
        let cache;
        cache ||= spawning;
        function read() { return cache; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("a nullish-assignment operator", () => {
    expect(
      verdict(`${spawner}
        let cache;
        cache ??= spawning;
        function read() { return cache; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("a compound arithmetic assignment", () => {
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        let n = 0;
        n += Number(spawnSync("git", []).status);
        function read() { return n; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("a chained assignment", () => {
    expect(
      verdict(`${spawner}
        let a, b;
        a = b = spawning;
        function read() { return a; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("a parenthesized target", () => {
    expect(
      verdict(`${spawner}
        let cache;
        (cache) = spawning;
        function read() { return cache; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("an assignment that is not its own statement", () => {
    expect(
      verdict(`${spawner}
        let cache;
        const ready = (cache = spawning);
        function read() { return cache; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("a `for…of` head that assigns to an existing binding", () => {
    expect(
      verdict(`${spawner}
        let row;
        for (row of [spawning]) { void row; }
        function read() { return row; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("an object destructuring assignment", () => {
    // Not a decline. This exact shape is live in the corpus —
    // tests/db/destructiveFileAnalysis.test.ts writes
    // `({ url } = { url: process.env.TEST_DATABASE_URL! })` — so the reachable
    // consequence of the old rule was a lost read of the environment, and
    // declining would trade that silence for an exemption rather than an answer.
    expect(
      verdict(`${spawner}
        let cache;
        ({ cache } = { cache: spawning });
        function read() { return cache; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("an array destructuring assignment", () => {
    expect(
      verdict(`${spawner}
        let cache;
        [cache] = [spawning];
        function read() { return cache; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("a destructuring assignment ELEMENT default", () => {
    expect(
      verdict(`${spawner}
        let cache;
        [cache = spawning] = [] as Array<() => unknown>;
        function read() { return cache; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("a PROPERTY write is not a binding write, and is not a decline either", () => {
    // The foil: `obj.x = …` is resolvable — it writes a property, not a name —
    // so declining it would be a demote invented out of an ordinary statement.
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        const obj: { x?: unknown } = {};
        obj.x = spawnSync;
        function read() { return obj; }
        it("x", () => { read(); });`),
    ).toBe("environment-free");
  });
});

describe("two binding forms that were scoped wrongly (whole-diff R3 #4)", () => {
  const spawner = `import { spawnSync } from "node:child_process";
    const cache = () => spawnSync("git", []);`;

  it("a `var` in a class static block belongs to that block, not the module", () => {
    // A class static block is a function-like boundary: its `var` does NOT
    // escape it. The block was not a scope node at all, so the var hoisted all
    // the way to module scope and merged its spawning extent into the unrelated
    // module `cache` an ordinary test then reads — over-classification, silent.
    //
    // The static block is at MODULE scope on purpose: with an enclosing function
    // the var lands in that function and the case passes for the wrong reason.
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        const cache = () => 1;
        class K { static v: unknown; static { var cache = () => spawnSync("git", []); K.v = cache; } }
        function read() { return cache; }
        it("x", () => { read(); });`),
    ).toBe("environment-free");
  });

  it("a `using` declaration stops binding at the end of its block", () => {
    // `using` is block-scoped like let/const. `isVarDeclaration` tested only for
    // the Let and Const flags, so `using` read as `var`, hoisted to the whole
    // function, and shadowed a read that sits AFTER its block — losing real
    // provenance, silently.
    expect(
      verdict(`${spawner}
        function read() {
          { using cache = { [Symbol.dispose]() {} }; void cache; }
          return cache;
        }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("a `using` declaration still shadows INSIDE its own block", () => {
    // The pair: block-scoping it must not become failing to bind it at all.
    expect(
      verdict(`${spawner}
        function read() {
          { using cache = { [Symbol.dispose]() {} }; return cache; }
        }
        it("x", () => { read(); });`),
    ).toBe("environment-free");
  });

  it("a `var` in a plain block still hoists out of it", () => {
    // The foil for the static-block change: an ordinary block is a scope for
    // let/const, and `var` must keep escaping it.
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        function read() {
          { var cache = () => spawnSync("git", []); }
          return cache;
        }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });
});

describe("unclassifiable — recognized but unresolvable, and it reds", () => {
  it("a dynamic import whose specifier is not a literal", () => {
    expect(
      verdict(`const m = "node:child_process";
        it("x", async () => { const cp = await import(m); cp.spawnSync("git", []); });`),
    ).toBe("unclassifiable");
  });

  it("a computed member access on process", () => {
    expect(
      verdict(`const k = "env";
        it("x", () => { const r = (process as never)[k]; });`),
    ).toBe("unclassifiable");
  });
});

describe("scope-aware extent resolution", () => {
  /** Write a helper module plus a test that imports it, and return the verdict. */
  function verdictWithModule(moduleSrc: string, testSrc: string): string {
    const id = n++;
    const mod = join(scratch, `mod${id}.ts`);
    writeFileSync(mod, moduleSrc, "utf8");
    const p = join(scratch, `case${id}-user.ts`);
    writeFileSync(p, testSrc.replace("__MODULE__", `./mod${id}`), "utf8");
    const [first] = classifyTests(ROOT, p);
    return first?.verdict ?? "<no test found>";
  }

  // The entry's own two-variant probe. The sources differ ONLY in WHERE the
  // helper is declared — same import, same spawn, same call site — so a
  // difference in verdict is a scope-resolution defect and nothing else.
  const HELPER_BODY = `function helper() { return spawnSync("git", []); }`;
  const IMPORT = `import { spawnSync } from "node:child_process";`;

  it("module-scope helper reaches the environment", () => {
    expect(
      verdict(`${IMPORT}
        ${HELPER_BODY}
        it("x", () => { helper(); });`),
    ).toBe("environment-touching");
  });

  it("describe-scope helper reaches the environment too — same helper, nested", () => {
    // The defect: `isModuleScope` registered no extent for a nested helper, so
    // the recognizer reported a clean corpus it no longer understood.
    expect(
      verdict(`${IMPORT}
        describe("suite", () => {
          ${HELPER_BODY}
          it("x", () => { helper(); });
        });`),
    ).toBe("environment-touching");
  });

  it("an ALIASED cross-module import resolves through the imported name", () => {
    // The cross-module lookup used the LOCAL name, so `helper as h` missed.
    expect(
      verdictWithModule(
        `import { spawnSync } from "node:child_process";
         export function helper() { return spawnSync("git", []); }`,
        `import { helper as h } from "__MODULE__";
         it("x", () => { h(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("AC-10b stays closed: a parameter named like an unrelated module const", () => {
    // The collision this whole scope rule exists to avoid. `res` as a PARAMETER
    // must not inherit the extent of an unrelated `const res = <provenance>`
    // declared inside a different function.
    expect(
      verdictWithModule(
        `import { spawnSync } from "node:child_process";
         export function reportEnvelope(res) { return res.body; }
         function main() { const res = spawnSync("git", []); return res; }`,
        `import { reportEnvelope } from "__MODULE__";
         it("x", () => { reportEnvelope({ body: 1 }); });`,
      ),
    ).toBe("environment-free");
  });

  it("a parameter SHADOWS a same-named module binding", () => {
    expect(
      verdict(`${IMPORT}
        const cache = spawnSync("git", []);
        function pure(cache) { return cache; }
        it("x", () => { pure(1); });`),
    ).toBe("environment-free");
  });

  // The assignment pair — both directions, because an implementation that
  // attaches every nested write to module scope passes the first and fails the
  // second, and one that attaches none fails the first.
  it("a nested write extends the MODULE binding's extent", () => {
    expect(
      verdict(`${IMPORT}
        let cache;
        function init() { cache = spawnSync("git", []); }
        it("x", () => { init(); return cache; });`),
    ).toBe("environment-touching");
  });

  it("a function-LOCAL write does not leak into a same-named module binding", () => {
    expect(
      verdict(`${IMPORT}
        let cache = 1;
        function init() { let cache; cache = spawnSync("git", []); return cache; }
        it("x", () => { return cache; });`),
    ).toBe("environment-free");
  });
});

describe("premise and exemption detection", () => {
  it("sees a premise inside the test body", () => {
    const p = join(scratch, "prem.ts");
    writeFileSync(
      p,
      `import { premise } from "@/tests/_shared/premise";
       it("x", () => { premise("d", 1, 0); });`,
      "utf8",
    );
    expect(classifyTests(ROOT, p)[0]?.hasPremise).toBe(true);
  });

  it("sees the ASSOCIATED placement for an environment-derived .each", () => {
    const p = join(scratch, "assoc.ts");
    writeFileSync(
      p,
      `import { premise } from "@/tests/_shared/premise";
       const rows = ["a"];
       premise("the producer yielded cases", rows.length, 0);
       test.each(rows)("x %s", (r) => { expect(r).toBeDefined(); });`,
      "utf8",
    );
    expect(classifyTests(ROOT, p)[0]?.hasPremise).toBe(true);
  });

  it("reads a no-premise exemption only when it carries a reason", () => {
    const p = join(scratch, "exempt.ts");
    writeFileSync(p, `it("x", () => { /* nothing */ });\n`, "utf8");
    expect(classifyTests(ROOT, p)[0]?.exemption).toBeNull();

    const q = join(scratch, "exempt2.ts");
    writeFileSync(q, `it("x", () => { // no-premise: the corpus is constructed\n });\n`, "utf8");
    expect(classifyTests(ROOT, q)[0]?.exemption).toBe("the corpus is constructed");
  });
});

// ── Mutation-gate repayments (enrolment 2026-08-16) ──────────────────────────
// Each case here exists because a declared mutant SURVIVED the suite. They are
// repayments, not decoration: the site each one kills is named.

describe("recognizer edges the mutation gate found unpinned", () => {
  it("a computed member access on a NON-process object is not unclassifiable", () => {
    // Kills equality-flip on the `=== "process"` guard: flipping it reports
    // every computed access EXCEPT process as unclassifiable.
    expect(verdict(`const k = "env"; const o = {}; it("x", () => { const r = o[k]; });`)).toBe(
      "environment-free",
    );
  });

  it("resolves a helper imported through the `@/` alias", () => {
    // Kills integer-literal on `spec.slice(2)`: slicing one more character
    // breaks every `@/` path, and the import silently stops resolving.
    expect(
      verdict(`import { premise } from "@/tests/_shared/premise";
        it("x", () => { premise("d", 1, 0); });`),
    ).toBe("environment-free");
  });

  it("ONE unresolvable construct is enough to report unclassifiable", () => {
    // Kills integer-literal on `unresolved.length > 0`: raising the threshold
    // to 1 lets a single unresolved edge report environment-free instead.
    expect(
      verdict(`const k = "env";
        it("x", () => { const r = (process as never)[k]; });`),
    ).toBe("unclassifiable");
  });

  it("reads the test name from the FIRST argument", () => {
    // Kills integer-literal on `node.arguments[0]`: reading argument 1 makes
    // every reported name the callback rather than the title.
    const p = join(scratch, "name-arg.ts");
    writeFileSync(p, `it("the declared title", () => {});`, "utf8");
    expect(classifyTests(ROOT, p)[0]?.testName).toBe("the declared title");
  });

  it("reports the 1-based line of the test it classifies", () => {
    // Kills the two `line + 1` integer-literal mutants: an off-by-one line
    // number points a reader at the wrong test.
    const p = join(scratch, "line-num.ts");
    writeFileSync(p, `// leading comment\n\nit("x", () => {});\n`, "utf8");
    expect(classifyTests(ROOT, p)[0]?.line).toBe(3);
  });
});

// ── Whole-diff review R1: the scope model resolved by NAME in three places ────
//
// Every case below is a SILENT wrong answer, not a refusal — the direction the
// consequence bound forbids. They are grouped by which of the three name-keyed
// steps produced them, and each pair fixes everything except the one thing
// under test, so a verdict difference is that step and nothing else.
describe("R1 — a reference denotes a BINDING, never a name", () => {
  const IMPORT = `import { spawnSync } from "node:child_process";`;
  const MODULE_CACHE = `const cache = spawnSync("git", []);`;

  // (1) Reference dedup collapsed same-named bindings, so which one a test was
  // judged against depended on SOURCE ORDER. Both halves read the module
  // `cache`; only the order of the shadowed reference differs.
  it("a shadow seen FIRST does not hide a later read of the module binding", () => {
    expect(
      verdict(`${IMPORT}
        ${MODULE_CACHE}
        it("x", () => { const f = (cache) => cache; f(1); return cache; });`),
    ).toBe("environment-touching");
  });

  it("the same source with the two references REVERSED agrees", () => {
    // The foil: this half already passed. Keeping it makes the pair a
    // source-order probe rather than a single assertion that could be
    // satisfied by classifying everything as touching.
    expect(
      verdict(`${IMPORT}
        ${MODULE_CACHE}
        it("x", () => { const r = cache; const f = (cache) => cache; f(1); return r; });`),
    ).toBe("environment-touching");
  });

  it("two same-named helpers in different scopes are both visited", () => {
    expect(
      verdict(`${IMPORT}
        function outer() { return spawnSync("git", []); }
        it("x", () => { const inner = () => { const outer = () => 1; return outer(); }; inner(); return outer(); });`),
    ).toBe("environment-touching");
  });

  // (2) The import map is file-global, and it was consulted BEFORE lexical
  // resolution — so any inner binding that happened to reuse an import's name
  // read as provenance it cannot reach.
  it("a parameter shadowing an import is not provenance", () => {
    expect(
      verdict(`${IMPORT}
        function pure(spawnSync) { return spawnSync; }
        it("x", () => { pure(1); });`),
    ).toBe("environment-free");
  });

  it("a function-local const shadowing an import is not provenance", () => {
    expect(
      verdict(`${IMPORT}
        it("x", () => { const spawnSync = 1; return spawnSync; });`),
    ).toBe("environment-free");
  });

  it("the unshadowed import still IS provenance", () => {
    // The foil for both cases above: same import, nothing shadowing it.
    expect(
      verdict(`${IMPORT}
        it("x", () => { spawnSync("git", []); });`),
    ).toBe("environment-touching");
  });

  // (3) Only identifier declarations and identifier parameters were bound, so
  // every other ordinary binding form fell through to a same-named outer one.
  const shadowingForms: ReadonlyArray<readonly [string, string]> = [
    ["object parameter pattern", `function pure({ cache }) { return cache; } pure({ cache: 1 });`],
    ["array parameter pattern", `function pure([cache]) { return cache; } pure([1]);`],
    [
      "nested parameter pattern",
      `function pure({ a: [cache] }) { return cache; } pure({ a: [1] });`,
    ],
    ["rest parameter", `function pure(...cache) { return cache; } pure(1);`],
    ["destructured const", `const { cache } = { cache: 1 }; return cache;`],
    ["array const", `const [cache] = [1]; return cache;`],
    ["destructured for-of binding", `for (const { cache } of []) { void cache; }`],
    ["destructured catch binding", `try { void 0; } catch ({ cache }) { void cache; }`],
    [
      "named function expression self-binding",
      `const p = function cache() { return cache; }; p();`,
    ],
  ];
  it.each(shadowingForms)("%s shadows the module binding", (_form, body) => {
    expect(
      verdict(`${IMPORT}
        ${MODULE_CACHE}
        it("x", () => { ${body} });`),
    ).toBe("environment-free");
  });

  it("a block-local binding does NOT shadow the read that follows the block", () => {
    // The other direction of the same model: a scope that ENDS must stop
    // shadowing, or the loss is silent in the false-negative direction.
    expect(
      verdict(`${IMPORT}
        ${MODULE_CACHE}
        it("x", () => { { const cache = 1; void cache; } return cache; });`),
    ).toBe("environment-touching");
  });

  it("a `var` is function-scoped, so a block does not confine it", () => {
    expect(
      verdict(`${IMPORT}
        ${MODULE_CACHE}
        it("x", () => { { var cache = 1; } return cache; });`),
    ).toBe("environment-free");
  });
});

// ── Whole-diff review R2: two more places a NAME stood in for a binding ──────
describe("R2 — dynamic imports and non-runtime positions", () => {
  const IMPORT = `import { spawnSync } from "node:child_process";`;

  /** Every verdict in a suite, in order — these cases turn on more than one test. */
  function verdicts(src: string): string[] {
    const p = join(scratch, `multi${n++}.ts`);
    writeFileSync(p, src, "utf8");
    return classifyTests(ROOT, p).map((t) => t.verdict);
  }

  /** A helper module plus a suite, returning every verdict. */
  function verdictsWithModule(moduleSrc: string, testSrc: string): string[] {
    const id = n++;
    writeFileSync(join(scratch, `pure${id}.ts`), moduleSrc, "utf8");
    const p = join(scratch, `multi${id}-user.ts`);
    writeFileSync(p, testSrc.replace(/__MODULE__/g, `./pure${id}`), "utf8");
    return classifyTests(ROOT, p).map((t) => t.verdict);
  }

  // A dynamic import binds a LOCAL name. Keeping those bindings in the
  // file-global import map made the answer depend on which one was registered
  // last, in both directions — a pure local hid a real dynamic provenance, and
  // a pure dynamic binding inherited an unrelated static import's edge.
  it("a dynamic provenance import is not hidden by a pure local of the same name", () => {
    expect(
      verdicts(`const spawnSync = () => 1;
        it("x", async () => { const { spawnSync } = await import("node:child_process"); spawnSync("git", []); });`),
    ).toEqual(["environment-touching"]);
  });

  it("a dynamic import ASSIGNED to an outer binding is still provenance", () => {
    // Self-review probe: the dynamic-import clause registers a binding only
    // when the call sits under a VariableDeclaration, so `m = await import(...)`
    // reached the write pass instead — and the write's extent is the bare
    // `await import(...)`, which named no provenance by itself. Silent false
    // negative, the direction the consequence bound forbids.
    expect(
      verdicts(`it("x", async () => {
        let m;
        { m = await import("node:child_process"); }
        return m.spawnSync("git", []); });`),
    ).toEqual(["environment-touching"]);
  });

  it("a pure dynamic import shadows a static provenance import of the same name", () => {
    expect(
      verdictsWithModule(
        `export const spawnSync = () => 1;`,
        `${IMPORT}
         it("x", async () => { const { spawnSync } = await import("__MODULE__"); return spawnSync(); });`,
      ),
    ).toEqual(["environment-free"]);
  });

  it("two dynamic bindings of one name keep their own edges — provenance first", () => {
    expect(
      verdictsWithModule(
        `export const spawnSync = () => 1;`,
        `it("a", async () => { const { spawnSync } = await import("node:child_process"); spawnSync("git", []); });
         it("b", async () => { const { spawnSync } = await import("__MODULE__"); return spawnSync(); });`,
      ),
    ).toEqual(["environment-touching", "environment-free"]);
  });

  it("two dynamic bindings of one name keep their own edges — pure first", () => {
    expect(
      verdictsWithModule(
        `export const spawnSync = () => 1;`,
        `it("a", async () => { const { spawnSync } = await import("__MODULE__"); return spawnSync(); });
         it("b", async () => { const { spawnSync } = await import("node:child_process"); spawnSync("git", []); });`,
      ),
    ).toEqual(["environment-free", "environment-touching"]);
  });

  // Positions that name something at COMPILE time only. None can reach the
  // environment at runtime, so resolving them against a same-named value
  // binding is provenance the test never touches.
  const nonRuntime: ReadonlyArray<readonly [string, string]> = [
    ["a typeof query on a type-only alias", `let f: typeof spawnSync; void f;`],
    ["a type annotation naming a type", `type cache = number; const v: cache = 1; void v;`],
    ["an enum declaration name", `enum cache { A } return cache.A;`],
    ["a getter key", `const o = { get cache() { return 1; } }; return o;`],
    ["a setter key", `const o = { set cache(v: number) { void v; } }; return o;`],
    ["a statement label", `cache: for (const _ of []) { break cache; }`],
    ["a continue label", `cache: for (const _ of []) { continue cache; }`],
    ["an interface name", `interface cache { a: number } const v: cache = { a: 1 }; void v;`],
  ];
  it.each(nonRuntime)("%s is not a value reference", (_label, body) => {
    expect(
      verdict(`${IMPORT}
        const cache = spawnSync("git", []);
        it("x", () => { ${body} });`),
    ).toBe("environment-free");
  });

  it("the SAME name in a runtime position still reaches the environment", () => {
    // The foil for the whole table: nothing above may be achieved by making
    // the recognizer stop resolving `cache` at all.
    expect(
      verdict(`${IMPORT}
        const cache = spawnSync("git", []);
        it("x", () => { return cache; });`),
    ).toBe("environment-touching");
  });
});

// ── Mutation-gate repayments: the R2 repair's own uncovered branches ─────────
describe("the reference rules the gate found unpinned", () => {
  const IMPORT = `import { spawnSync } from "node:child_process";`;

  /** A `.tsx` suite, so the JSX rules are reachable at all. */
  function verdictTsx(src: string): string {
    const p = join(scratch, `case${n++}.tsx`);
    writeFileSync(p, src, "utf8");
    return classifyTests(ROOT, p)[0]?.verdict ?? "<no test found>";
  }

  it("a lowercase JSX tag names an element, not the same-named binding", () => {
    // Kills the `p.tagName === id` flip: with `!==` the intrinsic rule stops
    // firing on the tag it was written for, and `<cache />` reads the module
    // binding.
    expect(
      verdictTsx(`${IMPORT}
        const cache = spawnSync("git", []);
        it("x", () => { return <cache />; });`),
    ).toBe("environment-free");
  });

  it("a Capitalized JSX tag IS a value reference", () => {
    // The foil: the intrinsic rule must not swallow component tags, which are
    // ordinary reads of a binding.
    expect(
      verdictTsx(`${IMPORT}
        const Cache = spawnSync("git", []);
        it("x", () => { return <Cache />; });`),
    ).toBe("environment-touching");
  });

  it("a JSX attribute NAME is not a value reference", () => {
    // Kills the `ts.isJsxAttribute(p) && p.name === id` flip.
    expect(
      verdictTsx(`${IMPORT}
        const cache = spawnSync("git", []);
        it("x", () => { return <Thing cache={1} />; });`),
    ).toBe("environment-free");
  });

  it("a destructuring KEY is not a value reference", () => {
    // Kills the `ts.isBindingElement(p) && p.propertyName === id` flip: the key
    // in `{ spawnSync: local }` names a property of the object being taken
    // apart, not the import.
    expect(
      verdict(`${IMPORT}
        it("x", () => { const { spawnSync: local } = { spawnSync: 1 }; return local; });`),
    ).toBe("environment-free");
  });

  it("an associated premise must name the binding the registration consumes", () => {
    // Kills the `id.text === name` flip in `referencesName`: with `!==` ANY
    // other identifier in a premise call counts as naming the producer, so a
    // premise about something else is accepted as this registration's.
    const p = join(scratch, `assoc${n++}.ts`);
    writeFileSync(
      p,
      `const rows = [[1]];
       const other = [2];
       premise("about something else", other.length, 0);
       it.each(rows)("case %s", (v) => { void v; });`,
      "utf8",
    );
    expect(classifyTests(ROOT, p)[0]?.hasPremise).toBe(false);
  });

  it("a premise that DOES name the producer is associated", () => {
    const p = join(scratch, `assoc${n++}.ts`);
    writeFileSync(
      p,
      `const rows = [[1]];
       premise("the producer yields cases", rows.length, 0);
       it.each(rows)("case %s", (v) => { void v; });`,
      "utf8",
    );
    expect(classifyTests(ROOT, p)[0]?.hasPremise).toBe(true);
  });
});

// ── Whole-diff review R3: four more silent losses ────────────────────────────
describe("R3 — heritage, dynamic-import priority, pattern defaults, premise dominance", () => {
  const IMPORT = `import { spawnSync } from "node:child_process";`;

  function verdicts3(src: string): string[] {
    const p = join(scratch, `r3-${n++}.ts`);
    writeFileSync(p, src, "utf8");
    return classifyTests(ROOT, p).map((t) => t.verdict);
  }

  it("a class EXTENDS clause is a value reference, not a type", () => {
    // `ExpressionWithTypeArguments` answers true to ts.isTypeNode even in a
    // class heritage clause, so the whole `extends` expression — the base, a
    // generic base, a mixin call and its arguments — was read as a type and
    // lost.
    expect(
      verdicts3(`${IMPORT}
        class Base { constructor() { spawnSync("git", []); } }
        class Derived extends Base {}
        it("x", () => new Derived());`),
    ).toEqual(["environment-touching"]);
  });

  it("an INTERFACE extends clause is still a type", () => {
    // The foil: heritage on an interface names types, and reading those as
    // values is the over-classification direction.
    expect(
      verdicts3(`${IMPORT}
        const Base = spawnSync("git", []);
        interface Derived extends Record<string, number> {}
        it("x", () => { const v: Derived = {}; return v; });`),
    ).toEqual(["environment-free"]);
  });

  it("an import() nested under an initializer does not swallow the initializer", () => {
    // The dynamic-import clause walked UP to the nearest VariableDeclaration,
    // so a lazy-loading helper registered the whole declaration as that import
    // and its real provenance — the `process.env` read — vanished.
    expect(
      verdicts3(`const helper = () =>
          process.env.FLAG ? import("some-package") : Promise.resolve(null);
        it("x", () => helper());`),
    ).toEqual(["environment-touching"]);
  });

  it("a WRITE to a dynamic-import binding is visited too", () => {
    // The write and the provenance sit OUTSIDE the test, so the only path to
    // them is through the binding the test reads. `resolveUncached` returned
    // the import edge and never looked at the writes stored beside it.
    expect(
      verdicts3(`${IMPORT}
        let m = await import("node:path");
        m = spawnSync("git", []);
        it("x", () => m);`),
    ).toEqual(["environment-touching"]);
  });

  const defaults: ReadonlyArray<readonly [string, string]> = [
    ["object pattern default", `const { helper = spawning } = {} as { helper?: () => unknown };`],
    ["array pattern default", `const [helper = spawning] = [] as Array<() => unknown>;`],
    [
      "nested pattern default",
      `const { a: { helper = spawning } = {} } = {} as { a?: { helper?: () => unknown } };`,
    ],
  ];
  it.each(defaults)("a %s carries its own provenance", (_label, decl) => {
    // A default can be the binding's SOLE provenance: with an empty source the
    // default is what actually runs. Declared OUTSIDE the test, so the only
    // path to the spawn is through the binding — a declaration inside the test
    // body would make the case pass on the default expression being textually
    // present rather than on the binding carrying it.
    expect(
      verdicts3(`${IMPORT}
        const spawning = () => spawnSync("git", []);
        ${decl}
        it("x", () => helper());`),
    ).toEqual(["environment-touching"]);
  });

  it("a premise inside a never-called helper does not count as associated", () => {
    // The associated placement must EXECUTE before registration. A premise in a
    // function body is a premise nobody runs.
    const p = join(scratch, `r3-assoc-${n++}.ts`);
    writeFileSync(
      p,
      `const rows = [[1]];
       function neverCalled() { premise("rows exist", rows.length, 0); }
       void neverCalled;
       test.each(rows)("x", (r) => { void r; });`,
      "utf8",
    );
    expect(classifyTests(ROOT, p)[0]?.hasPremise).toBe(false);
  });

  it("a premise naming a SHADOWED same-named producer does not count", () => {
    const p = join(scratch, `r3-assoc-${n++}.ts`);
    writeFileSync(
      p,
      `const rows = [[1]];
       { const shadow = [[2]]; void shadow; }
       (() => { const rows = [[3]]; premise("other rows", rows.length, 0); })();
       test.each(rows)("x", (r) => { void r; });`,
      "utf8",
    );
    expect(classifyTests(ROOT, p)[0]?.hasPremise).toBe(false);
  });
});
