import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { classifyTests, type TestClassification } from "./premiseScan";

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
      verdict(
        `it("x", () => { const process = { env: { ROOT: "." } }; const r = process.env.ROOT; });`,
      ),
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
      verdict(
        `it("x", () => { const r = (process as { env: Record<string, string> }).env.ROOT; });`,
      ),
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

describe("the repairs' own edges, each pinned by a surviving mutant the gate named", () => {
  // Every case here exists because the source-mutation gate reported a survivor
  // at that exact site after the R3 repairs — a branch the repair introduced
  // that no fixture discriminated. The siteId is named so the pin and the
  // mutant stay traceable to each other.
  const spawner = `import { spawnSync } from "node:child_process";
    const spawning = () => spawnSync("git", []);`;

  it("the LAST assignment operator in the range still records a write", () => {
    // relational-boundary on `kind <= ts.SyntaxKind.LastAssignment`: `<` drops
    // exactly the last kind in the range, which is `^=` (79) on TypeScript 5.9.
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        let n = 0;
        n ^= Number(spawnSync("git", []).status);
        function read() { return n; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("an UNRESOLVABLE producer's premise must still name that producer", () => {
    // equality-flip on `id.text === name` in referencesName, the fallback path
    // taken only when the producer resolves to no binding at all. Flipped, ANY
    // other identifier satisfies the premise.
    const p = join(scratch, `r3-ref-${n++}.ts`);
    writeFileSync(
      p,
      `import { premise } from "@/tests/_shared/premise";
       premise("something unrelated", 1, 0);
       test.each(undeclaredRows)("x", (r) => { void r; });`,
      "utf8",
    );
    expect(classifyTests(ROOT, p)[0]?.hasPremise).toBe(false);
  });

  it("a premise in an `if` CONDITION runs, and is credited", () => {
    // Kills three at once: the `n === undefined` guard in `within`, and the
    // `>=` start-boundary — the premise call shares its start with the
    // condition it opens.
    const p = join(scratch, `r3-dom-cond-${n++}.ts`);
    writeFileSync(
      p,
      `import { premise } from "@/tests/_shared/premise";
       const rows = [[process.env.ROOT]];
       if (premise("rows", rows.length, 0) === undefined) { void 0; }
       test.each(rows)("x", (r) => { void r; });`,
      "utf8",
    );
    expect(classifyTests(ROOT, p)[0]?.hasPremise).toBe(true);
  });

  it("a premise at the END of an `if` condition is credited too", () => {
    // The `<=` end-boundary half of the same pair: here the premise call shares
    // its END with the condition.
    const p = join(scratch, `r3-dom-cond-${n++}.ts`);
    writeFileSync(
      p,
      `import { premise } from "@/tests/_shared/premise";
       const rows = [[process.env.ROOT]];
       if (undefined === premise("rows", rows.length, 0)) { void 0; }
       test.each(rows)("x", (r) => { void r; });`,
      "utf8",
    );
    expect(classifyTests(ROOT, p)[0]?.hasPremise).toBe(true);
  });

  it("a NON-logical binary operator does not make its right operand conditional", () => {
    // equality-flip on the `||` and `??` arms of the short-circuit test. Flipped,
    // every ordinary binary expression is treated as short-circuiting and a
    // premise in its right operand stops being credited.
    const p = join(scratch, `r3-dom-bin-${n++}.ts`);
    writeFileSync(
      p,
      `import { premise } from "@/tests/_shared/premise";
       const rows = [[process.env.ROOT]];
       const ok = undefined === premise("rows", rows.length, 0);
       void ok;
       test.each(rows)("x", (r) => { void r; });`,
      "utf8",
    );
    expect(classifyTests(ROOT, p)[0]?.hasPremise).toBe(true);
  });

  it("an IIFE invoked WITHOUT parentheses around the function still runs at load", () => {
    // equality-flip on `caller.expression === p`, the un-parenthesized arm. The
    // parenthesized `(() => {})()` fixtures all take the other arm, so nothing
    // discriminated this one.
    const p = join(scratch, `r3-dom-iife-${n++}.ts`);
    writeFileSync(
      p,
      `import { premise } from "@/tests/_shared/premise";
       const rows = [[process.env.ROOT]];
       void function () { premise("rows", rows.length, 0); }();
       test.each(rows)("x", (r) => { void r; });`,
      "utf8",
    );
    expect(classifyTests(ROOT, p)[0]?.hasPremise).toBe(true);
  });

  it("a defaulted destructuring target still takes the OUTER right-hand side", () => {
    // equality-flip on `t.operatorToken.kind === ts.SyntaxKind.EqualsToken` in
    // assignmentTargets — the `[a = dflt]` arm.
    //
    // The provenance is deliberately in the OUTER RHS, not in the default. A
    // fixture with an empty outer RHS cannot discriminate this arm from its
    // absence: the write pass visits the inner `a = dflt` assignment on its own
    // and records the default either way. That non-discriminating shape is what
    // made this arm look redundant, and deleting it silently dropped the
    // environment read (whole-diff R4 #4).
    expect(
      verdict(`let value;
        [value = "d"] = [process.env.ROOT];
        function read() { return value; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("a RENAMED object target with a default takes the outer right-hand side too", () => {
    expect(
      verdict(`let value;
        ({ a: value = "d" } = { a: process.env.ROOT });
        function read() { return value; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("the same target WITHOUT a default is the control", () => {
    // The pair: if this one ever goes free, the loss is in the plain path rather
    // than the defaulted one.
    expect(
      verdict(`let value;
        [value] = [process.env.ROOT];
        function read() { return value; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });
});

describe("extracting `env` FROM the global, in every form (whole-diff R4 #1)", () => {
  // The clause read "the identifier `process`, bare, as a declaration's
  // initializer". That is wrong in both directions: it counted every extraction
  // from `process` whether or not `env` was among them, and it missed every
  // extraction that is not a bare identifier initializer — through a wrapper,
  // through an assignment, through a parameter default. Both directions silent.

  it("extracting something OTHER than env is not an environment read", () => {
    expect(
      verdict(`const { version } = process;
        function read() { return version; }
        it("x", () => { read(); });`),
    ).toBe("environment-free");
  });

  it("through an `as` cast", () => {
    expect(
      verdict(`const { env } = process as { env: Record<string, string> };
        function read() { return env.ROOT; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("through parentheses and a non-null assertion", () => {
    expect(
      verdict(`const { env } = (process)!;
        function read() { return env.ROOT; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("through a destructuring ASSIGNMENT rather than a declaration", () => {
    expect(
      verdict(`let env;
        ({ env } = process);
        function read() { return env.ROOT; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("through a parameter default", () => {
    expect(
      verdict(`function read({ env } = process) { return env.ROOT; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("a RENAMED extraction of env still counts", () => {
    expect(
      verdict(`const { env: vars } = process;
        function read() { return vars.ROOT; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("`globalThis.process.env` is the same global", () => {
    expect(verdict(`it("x", () => { const r = globalThis.process.env.ROOT; });`)).toBe(
      "environment-touching",
    );
  });

  it("a LOCAL named process is still not the global, in the destructuring form", () => {
    expect(
      verdict(`it("x", () => {
          const process = { env: { ROOT: "." } };
          const { env } = process;
          void env;
        });`),
    ).toBe("environment-free");
  });
});

describe("a dynamic-import binding still has a local extent (whole-diff R4 #2, #3)", () => {
  // Registering a dynamic import in `scopedImports` and NOTHING else dropped two
  // things that are not the module edge: the pattern's own defaults, which run
  // when the imported export is undefined, and later WRITES to the name, whose
  // scope lookup consulted `extents` and `shadows` but never `scopedImports`.
  // Both losses are silent.
  //
  // Every fixture is at MODULE scope, for the reason the nested-default cases
  // are: inside a test body the walk covers the body's own text and reaches the
  // provenance whether or not the binding recorded it, so a body-scoped fixture
  // passes either way and pins nothing.

  it("a destructuring DEFAULT on a dynamic import is reachable code", () => {
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        const { helper = spawnSync } = await import("node:path");
        function read() { return helper; }
        it("x", () => { read(); });`),
    ).toBe("environment-touching");
  });

  it("a WRITE to a dynamic-import binding inside a block reaches that binding", () => {
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        let out;
        {
          let mod = await import("node:path");
          mod = spawnSync as never;
          out = mod;
        }
        function read() { return out; }
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

  describe("a premise must DOMINATE the registration, not merely precede it (R3 #5)", () => {
    // `runsAtModuleLoad` asked only whether a non-IIFE function encloses the
    // call. Absence of one does not establish execution: a premise under a
    // false branch, a short-circuit, a zero-iteration loop, an unmatched switch
    // case, or a conditionally invoked IIFE never runs, and each was credited as
    // if it had. The producer here is environment-derived, so a false credit is
    // a premise contract satisfied by nothing.
    const conditioned = (stmt: string): boolean => {
      const p = join(scratch, `r3-dom-${n++}.ts`);
      writeFileSync(
        p,
        `import { premise } from "@/tests/_shared/premise";
         const rows = [[process.env.ROOT]];
         ${stmt}
         test.each(rows)("x", (r) => { void r; });`,
        "utf8",
      );
      return classifyTests(ROOT, p)[0]?.hasPremise ?? false;
    };

    it("a false branch", () => {
      expect(conditioned(`if (false) { premise("rows", rows.length, 0); }`)).toBe(false);
    });

    it("an else branch", () => {
      expect(
        conditioned(`if (rows.length) { void 0; } else { premise("rows", rows.length, 0); }`),
      ).toBe(false);
    });

    it("a short-circuit right operand", () => {
      expect(conditioned(`rows.length && premise("rows", rows.length, 0);`)).toBe(false);
    });

    it("a ternary branch", () => {
      expect(conditioned(`rows.length ? premise("rows", rows.length, 0) : void 0;`)).toBe(false);
    });

    it("a loop body that may run zero times", () => {
      expect(
        conditioned(`for (const r of rows) { premise("rows", rows.length, 0); void r; }`),
      ).toBe(false);
    });

    it("a switch case that may not match", () => {
      expect(
        conditioned(
          `switch (rows.length) { case 99: premise("rows", rows.length, 0); break; default: break; }`,
        ),
      ).toBe(false);
    });

    it("a catch clause", () => {
      expect(conditioned(`try { void 0; } catch { premise("rows", rows.length, 0); }`)).toBe(false);
    });

    it("a conditionally invoked IIFE", () => {
      expect(conditioned(`rows.length && (() => { premise("rows", rows.length, 0); })();`)).toBe(
        false,
      );
    });

    // The foils: dominance must not become "nothing counts". Each of these DOES
    // run whenever the module loads.
    it("still credits a bare statement", () => {
      expect(conditioned(`premise("rows", rows.length, 0);`)).toBe(true);
    });

    it("still credits an unconditionally invoked IIFE", () => {
      expect(conditioned(`(() => { premise("rows", rows.length, 0); })();`)).toBe(true);
    });

    it("still credits a try block, which runs", () => {
      expect(conditioned(`try { premise("rows", rows.length, 0); } catch { void 0; }`)).toBe(true);
    });

    it("still credits a finally block, which runs", () => {
      expect(conditioned(`try { void 0; } finally { premise("rows", rows.length, 0); }`)).toBe(
        true,
      );
    });
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

/**
 * Write N helper modules plus a test importing them; return the classification.
 * `modules` is keyed by basename; a key containing a dot carries its own
 * extension ("data.json"), otherwise `.ts`. In every source string,
 * `__MODULE_<basename>__` is replaced by the generated specifier, and
 * `__MODULE_NOEXT_<basename>__` by the same specifier with its extension
 * stripped (AC-5c's extensionless case): with the
 * extension included when it is not `.ts`, because `resolveSpecifier` only
 * reaches a non-TS file when the specifier spells it out.
 * split/join, not `replace`, so a module referenced twice substitutes twice.
 *
 * A key containing a SLASH ("d/index.tsx") builds a directory and registers its
 * placeholder under the FIRST segment, pointing at the DIRECTORY itself, which
 * is what AC-9c needs: resolveSpecifier reaches a directory only through its
 * bare-base candidate. Both halves were probed. Without the mkdir the write
 * throws ENOENT; without the first-segment rule `__MODULE_d__` substitutes
 * nothing and the fixture silently tests an unresolved bare specifier instead.
 */
function classificationsWithModules(
  modules: Record<string, string>,
  testSrc: string,
): TestClassification[] {
  const id = n++;
  const parse = (key: string): { base: string; ext: string } => {
    const dot = key.lastIndexOf(".");
    return dot === -1
      ? { base: key, ext: ".ts" }
      : { base: key.slice(0, dot), ext: key.slice(dot) };
  };
  const spec: Record<string, string> = {};
  for (const key of Object.keys(modules)) {
    const { base, ext } = parse(key);
    const slash = base.indexOf("/");
    if (slash !== -1) spec[base.slice(0, slash)] = `./mod${id}_${base.slice(0, slash)}`;
    else spec[base] = ext === ".ts" ? `./mod${id}_${base}` : `./mod${id}_${base}${ext}`;
  }
  const subst = (text: string): string => {
    let out = text;
    for (const [base, s] of Object.entries(spec)) {
      // `__MODULE_NOEXT_<base>__` yields the SAME specifier with its extension
      // stripped. AC-5c's unresolved-specifier case needs an extensionless
      // reference to an EXISTING `.mjs` sibling, same basename, so that it
      // reports only because candidate generation is not widened. A fixture
      // pointing at a different basename reports either way and cannot pin
      // that settled decision.
      out = out.split(`__MODULE_NOEXT_${base}__`).join(s.replace(/\.[^./]+$/, ""));
      out = out.split(`__MODULE_${base}__`).join(s);
    }
    return out;
  };
  for (const [key, src] of Object.entries(modules)) {
    const { base, ext } = parse(key);
    const abs = join(scratch, `mod${id}_${base}${ext}`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, subst(src), "utf8");
  }
  const p = join(scratch, `case${id}-user.ts`);
  writeFileSync(p, subst(testSrc), "utf8");
  return classifyTests(ROOT, p);
}

/**
 * The FIRST classification. Most cases build a single test, so this is the
 * ergonomic form, but a case asserting about a SIBLING test must use
 * `classificationsWithModules` and select by `testName`, or it asserts about a
 * test it never meant (AC-12b).
 */
function classificationWithModules(
  modules: Record<string, string>,
  testSrc: string,
): TestClassification | undefined {
  return classificationsWithModules(modules, testSrc)[0];
}

function verdictWithModules(modules: Record<string, string>, testSrc: string): string {
  return classificationWithModules(modules, testSrc)?.verdict ?? "<no test found>";
}

/**
 * EVERY case that expects a report goes through this, never through a bare
 * `.toBe("unclassifiable")`. A verdict-only assertion passes on a generic or
 * MISATTRIBUTED reason, and the whole contract of reporting is that the reader
 * is told which construct, in which module (spec §2.6 item 2), so a
 * verdict-only reporting case leaves the arc's central claim unproved.
 *
 * `construct` matches the reason text; `module` matches the module the
 * construct was FOUND in, which for a barrel defect is the BARREL, not the
 * importing test file.
 */
function expectReported(
  c: TestClassification | undefined,
  expected: { construct: RegExp; module: RegExp; notModule?: RegExp },
): void {
  expect(c?.verdict).toBe("unclassifiable");
  const detail = c?.detail ?? "";
  expect(detail).toMatch(expected.construct);
  expect(detail).toMatch(expected.module);
  // AC-5c: a reason names WHAT could not be bound, not merely WHERE. A generic
  // `dynamic import in case123-user.ts` satisfies construct and module and
  // proves nothing, which is what round 19 found across fourteen executions.
  // The target is a specifier, a generated module name, or - for the shapes
  // that genuinely have no nameable target - the word that says so.
  expect(
    /(\.\/|\.\.\/|@\/|mod\d+_[A-Za-z]+|non-literal|computed)/.test(detail),
    `the reason names no target: ${detail}`,
  ).toBe(true);
  // A generated-module attribution without its negative is tautological: the
  // importing test file quotes the specifier, so /barrel/ matches a reason
  // misattributed to the test file. Required, not optional, and enforced here
  // so a new case cannot omit it (round-19 finding 4 found four that had).
  if (String(expected.module) !== String(OWN_FILE) && !expected.notModule) {
    throw new Error(
      `a generated-module attribution must state notModule: ${String(expected.module)}`,
    );
  }
  // `notModule` is what stops module attribution passing tautologically. For a
  // BARREL defect the reason must name the barrel and NOT the importing test
  // file (spec §2.6 item 2); without the negative, /barrel/ also matches the
  // import specifier quoted back in a generic reason, so the assertion proves
  // nothing about where the construct was found.
  if (expected.notModule) expect(detail).not.toMatch(expected.notModule);
}

/** Single-module sibling of `classificationWithModules`, for `verdict`-style cases. */
function classification(src: string): TestClassification | undefined {
  const p = join(scratch, `case${n++}.ts`);
  writeFileSync(p, src, "utf8");
  return classifyTests(ROOT, p)[0];
}

/**
 * The reason families this arc reports. Cases name a family rather than
 * re-spelling a regex, so a wording change is one edit and no case silently
 * stops discriminating.
 */
const REPORTS = {
  dynamicImport: /dynamic import/i,
  sideEffect: /side-effect/i,
  unresolvedSpecifier: /unresolved in-repo specifier/i,
  moduleShape: /unsupported module shape/i,
  reexportCycle: /re-export cycle/i,
  unfollowable: /unfollowable re-export/i,
  namespaceExport: /export \* as/i,
  exportEquals: /export =/i,
  exportNamespace: /export namespace/i,
  nsLocalReexport: /local re-export of a namespace binding/i,
  nsNonMember:
    /namespace ns \(imported from [^)]+\) used in a position with no statically known member/i,
  computedProcess: /computed member access on process/i,
} as const;

/** The generated test file, for own-file constructs. */
const OWN_FILE = /case\d+/;

describe("export resolution: the lookup asks for an EXPORT, not a local name", () => {
  const SPAWNER_DEFAULT = `import { spawnSync } from "node:child_process";
    export default function spawnHelper(): string {
      return String(spawnSync("echo", ["x"]).stdout);
    }`;

  // A NON-default spawning declaration, for the AC-5d branch cases that need a
  // local to re-export or merge with. Kept separate from SPAWNER_DEFAULT so no
  // case accidentally passes through E4 when it means to exercise E1 or E3.
  const SPAWNER_NAMED = `import { spawnSync } from "node:child_process";
    function spawnHelper(): string {
      return String(spawnSync("echo", ["x"]).stdout);
    }`;

  it("a renamed default import resolves", () => {
    expect(
      classificationWithModules(
        { helper: SPAWNER_DEFAULT },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it("a same-named default import resolves for the RIGHT reason", () => {
    // The foil: passes even before the repair, by coincidence, because the local
    // name happens to match a module-scope declaration. Kept so no future repair
    // can be validated by it alone.
    expect(
      classificationWithModules(
        { helper: SPAWNER_DEFAULT },
        `import spawnHelper from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it("a default export that is an EXPRESSION resolves", () => {
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export default () => String(spawnSync("echo", ["x"]).stdout);`,
        },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a pure default export stays free", () => {
    expect(
      verdictWithModules(
        { helper: `export default function pureHelper(): number { return 2; }` },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-free");
  });

  it("an exported `const` resolves: the modifier is on the STATEMENT", () => {
    // `export const` carries its modifiers on the VariableStatement, not on the
    // VariableDeclaration. An E1 predicate read off the declaration misses the
    // commonest exported form in the repository (971 exported variable statements).
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export const spawnHelper = (): string => String(spawnSync("echo", ["x"]).stdout);`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { x }` with no specifier resolves to the local declaration", () => {
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
            export { spawnHelper };`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { x as y }` with no specifier resolves by the EXPORTED name", () => {
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
            export { spawnHelper as runIt };`,
        },
        `import { runIt } from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a data import is PURE, on a fixture that is RED today (AC-9)", () => {
    // Two conditions make this discriminating. The specifier must spell out the
    // extension, or resolveSpecifier never reaches the file at all. And the
    // payload must be TypeScript that reaches node:child_process, because a
    // .json target IS parsed as TypeScript today: probed environment-touching
    // on the unrepaired tree. A fixture holding real JSON is free before and
    // after and proves nothing.
    expect(
      verdictWithModules(
        {
          "data.json": `import { spawnSync } from "node:child_process";
            export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_data__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-free");
  });

  it("E4: an ANONYMOUS default function declaration resolves (AC-5d)", () => {
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export default function (): string { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E4: a RENAMED import of a default-exported class resolves (AC-5d)", () => {
    // The positive arm the named-class branch needs. Its twin below proves the
    // class's own name is NOT an export; this proves `default` IS one, for a
    // NAMED class declaration. Without it an implementation can map only
    // ANONYMOUS default classes, pass every other fixture, and silently lose a
    // live in-repo edge (round-19 finding 1).
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export default class K { go(): string { return String(spawnSync("echo", ["x"]).stdout); } }`,
        },
        `import Renamed from "__MODULE_helper__";
         it("x", () => { new Renamed().go(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E4: a default-exported class is NOT exported under its own name (AC-5d)", () => {
    // `export default class K {}` exports `default`; `K` is module-local, so a
    // NAMED import of `K` must resolve noSuchExport and stay pure.
    //
    // This shape is what discriminates the "only `default`" half of E4. The
    // earlier fixture imported the SAME name through DEFAULT syntax and
    // asserted touching: measured GREEN on the merged scanner (planRun), since
    // today's local-declaration lookup finds the class's own name `K` and
    // answers touching for the wrong reason, and a resolver recording BOTH
    // `default` and `K` would pass it just as happily. This one measures
    // touching today and must go FREE, so only a resolver that maps `default`
    // alone can green it.
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export default class K { go(): string { return String(spawnSync("echo", ["x"]).stdout); } }`,
        },
        `import { K } from "__MODULE_helper__";
         it("x", () => { new K().go(); });`,
      ),
    ).toBe("environment-free");
  });

  it("E3: `export default <expr>` resolves under a renamed default (AC-5d)", () => {
    // E3 has NO fixture in the round-3 plan and probes environment-free TODAY
    // (spec §3.13). AC-4 covers E4's `export default function`; an implementation
    // can omit E3 entirely and satisfy every other criterion.
    expect(
      verdictWithModules(
        { helper: `${SPAWNER_NAMED}\nexport default spawnHelper;` },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E1: an ARRAY binding pattern binds every identifier (AC-5d)", () => {
    expect(
      verdictWithModules(
        { helper: `${SPAWNER_NAMED}\nexport const [ , second ] = [null, spawnHelper];` },
        `import { second } from "__MODULE_helper__";
         it("x", () => { second(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E1: MULTIPLE declarators in one statement each bind (AC-5d)", () => {
    // `export const a = …, b = …`: the modifier is on the VariableStatement and
    // must map to every declarator, not just the first.
    expect(
      verdictWithModules(
        { helper: `${SPAWNER_NAMED}\nexport const first = 1, second = spawnHelper;` },
        `import { second } from "__MODULE_helper__";
         it("x", () => { second(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("value BEATS type when both export the same name (AC-5d)", () => {
    // Declaration merging is legal. A resolver checking typeOnly first returns
    // pure and silently frees the value, with every other AC still green.
    expect(
      verdictWithModules(
        {
          helper: `${SPAWNER_NAMED}\nexport interface thing { k: string }\nexport const thing = spawnHelper;`,
        },
        `import { thing } from "__MODULE_helper__";
         it("x", () => { thing(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a DIRECT noSuchExport is pure, not reported (AC-5d)", () => {
    // A guard is not a type checker: inventing a diagnostic here would fire on
    // every mid-edit tree. AC-5b covers only the star-fan-out miss.
    expect(
      verdictWithModules(
        { helper: SPAWNER_NAMED },
        `import { absent } from "__MODULE_helper__";
         it("x", () => { void absent; });`,
      ),
    ).toBe("environment-free");
  });

  it("an `.mdx` target is REPORTED, not purified (AC-9d)", () => {
    // AC-9's discriminating twin: byte-identical payload, only the extension
    // differs. MDX is EXECUTABLE in this repo (next.config.ts:54 pageExtensions,
    // @mdx-js/rollup in vitest.config.ts), so answer 2 would be a silent free
    // introduced by this repair; spec §2.4, §3.11, §4 limit 13. 31 .mdx import
    // edges live in the near-domain across 14 files; 0 are enrolled, so AC-1 holds.
    expectReported(
      classificationWithModules(
        {
          "page.mdx": `import { spawnSync } from "node:child_process";
            export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_page__";
         it("x", () => { spawnHelper(); });`,
      ),
      { construct: REPORTS.moduleShape, module: /mod\d+_page\.mdx/, notModule: OWN_FILE },
    ); // expectReported: construct /unsupported module shape|mdx/, module /page/
  });

  it("a renamed default CLASS resolves (AC-4b)", () => {
    // An E4 branch AC-4's default-FUNCTION fixture never reaches. Probe §3.9
    // measures this environment-free today.
    expect(
      classificationWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export default class { go(): string { return String(spawnSync("echo", ["x"]).stdout); } }`,
        },
        `import K from "__MODULE_helper__";
         it("x", () => { new K().go(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it("an exported CLASS resolves (AC-5, E1 branch)", () => {
    expect(
      classificationWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export class C { go(): string { return String(spawnSync("echo", ["x"]).stdout); } }`,
        },
        `import { C } from "__MODULE_helper__";
         it("x", () => { new C().go(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it("an exported ENUM resolves (AC-5, E1 branch)", () => {
    // Ask for the ENUM by name. A round-1 draft imported a sibling `useIt` that
    // merely READ the enum, so the case passed even if EnumDeclaration were
    // dropped from the E1 predicate entirely, it never requested the exported
    // enum, which is the branch it claims to pin.
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export enum E { A = String(spawnSync("echo", ["x"]).stdout) as unknown as never }`,
        },
        `import { E } from "__MODULE_helper__";
         it("x", () => { void E; });`,
      ),
    ).toBe("environment-touching");
  });

  it("a DESTRUCTURED exported const resolves (AC-5, E1 branch)", () => {
    // The modifier is on the VariableStatement and the names come out of a
    // binding pattern; an implementation reading only simple identifiers misses it.
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export const { stdout: out } = spawnSync("echo", ["x"]);`,
        },
        `import { out } from "__MODULE_helper__";
         it("x", () => { void out; });`,
      ),
    ).toBe("environment-touching");
  });

  it("an unrecognized module shape is REPORTED, not purified (AC-9c)", () => {
    // A directory reached through resolveSpecifier's bare-base candidate.
    // NOTE THE RED'S SHAPE: today this case THROWS EISDIR rather than returning
    // a wrong verdict (probe §3.9), so Step 3 sees an ERROR, not a mismatch.
    // That is a valid red (the test fails, and greens on the same command) but
    // an implementer who expects a wrong verdict may read the exception as a
    // broken fixture and repair the test instead of the scanner.
    // A guard that only moved the extension test before the read would turn the
    // crash into a silent pure, which is why the third answer must REPORT.
    expectReported(
      classificationWithModules(
        { "d/index.tsx": `export const x = 1;` },
        `import { x } from "__MODULE_d__";
         it("x", () => { void x; });`,
      ),
      { construct: REPORTS.moduleShape, module: /mod\d+_d/, notModule: OWN_FILE },
    );
  });

  it("an explicit `.jsx` target stays ANALYZED (AC-9b)", () => {
    // Probed environment-touching TODAY. An allowlist omitting .jsx would make
    // this repair introduce the very silent free the arc exists to close.
    expect(
      classificationWithModules(
        {
          "helper.jsx": `import { spawnSync } from "node:child_process";
            export function spawnHelper() { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it("a `.mjs` target stays ANALYZED (AC-9b)", () => {
    // AC-9's foil. The live tests/ci/phantomGapExecuted.test.ts edge is a named
    // import of an in-repo .mjs module; an over-reaching allowlist turns it into
    // data and silences a real environment reach.
    expect(
      classificationWithModules(
        {
          "helper.mjs": `import { spawnSync } from "node:child_process";
            export function spawnHelper() { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });
});

describe("forwarded exports: a re-export is followed to its source", () => {
  const SPAWNER = `import { spawnSync } from "node:child_process";
    export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
    export default spawnHelper;
    export function pureOne(): number { return 1; }`;

  it('L-2 through a forward: `export { x } from "bare"` stays PURE', () => {
    // The three forward paths this task introduces each resolve a specifier,
    // and a resolver that reports every unresolvable forward target violates
    // the ratified L-2 while passing every DIRECT-import foil. The wide
    // accept-set probe measures 37 pure-bare edges in the near domain, so this
    // is a live shape, not a constructed one (round-19 finding 5).
    expect(
      verdictWithModules(
        { barrel: `export { Resend } from "resend";` },
        `import { Resend } from "__MODULE_barrel__";
         it("x", () => { void Resend; });`,
      ),
    ).toBe("environment-free");
  });

  it('L-2 through a forward: `export * from "bare"` stays PURE', () => {
    expect(
      verdictWithModules(
        { barrel: `export * from "resend";` },
        `import { Resend } from "__MODULE_barrel__";
         it("x", () => { void Resend; });`,
      ),
    ).toBe("environment-free");
  });

  it("L-2 through E2: a BARE import then a local re-export stays PURE", () => {
    expect(
      verdictWithModules(
        { barrel: `import { Resend } from "resend";\n export { Resend };` },
        `import { Resend } from "__MODULE_barrel__";
         it("x", () => { void Resend; });`,
      ),
    ).toBe("environment-free");
  });

  it("`export { x } from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { spawnHelper } from "__MODULE_helper__";` },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { x as y } from` is followed by the SOURCE name", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { spawnHelper as renamed } from "__MODULE_helper__";` },
        `import { renamed } from "__MODULE_barrel__";
         it("x", () => { renamed(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { default as x } from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { default as runIt } from "__MODULE_helper__";` },
        `import { runIt } from "__MODULE_barrel__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { default } from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { default } from "__MODULE_helper__";` },
        `import runIt from "__MODULE_barrel__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export * from` is followed", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export * from "__MODULE_helper__";` },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export * from` does NOT forward `default`", () => {
    // ES semantics, and the foil that stops `export *` becoming a module-closure
    // rule by the back door. `default` is not exported by the barrel, so the
    // request answers noSuchExport and resolves pure: loud would be wrong here.
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export * from "__MODULE_helper__";` },
        `import runIt from "__MODULE_barrel__";
         it("x", () => { void runIt; });`,
      ),
    ).toBe("environment-free");
  });

  it("star-export ambiguity: the branch that HAS the name wins (AC-5b)", () => {
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          other: `export function unrelated(): number { return 7; }`,
          barrel: `export * from "__MODULE_other__";
                   export * from "__MODULE_helper__";`,
        },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a star-export miss on every branch is benign, not a report", () => {
    // AC-5b's foil: a name in no target resolves pure rather than loud.
    expect(
      verdictWithModules(
        {
          other: `export function unrelated(): number { return 7; }`,
          barrel: `export * from "__MODULE_other__";`,
        },
        `import { absent } from "__MODULE_barrel__";
         it("x", () => { void absent; });`,
      ),
    ).toBe("environment-free");
  });

  it("a re-export chain two deep is followed", () => {
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          mid: `export { spawnHelper } from "__MODULE_helper__";`,
          barrel: `export { spawnHelper } from "__MODULE_mid__";`,
        },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("import-then-`export { x }` is followed", () => {
    // No re-export SYNTAX at all: the case showing the defect is the
    // extents-only lookup, not any list of export spellings.
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          barrel: `import { spawnHelper } from "__MODULE_helper__";
                   export { spawnHelper };`,
        },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("an EXPORT beats a same-named non-exported local (AC-10c), moved here from Task 1, because it needs E5", () => {
    // Resolution order. An extents-first resolver answers with the local and
    // preserves the silent free through the barrel: the diagnosed defect under
    // a new name. Probe B8 measures this environment-free today.
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
          barrel: `function spawnHelper(): number { return 0; }
            void spawnHelper;
            export { spawnHelper } from "__MODULE_helper__";`,
        },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E5: `export { x as default } from` forwards named-to-DEFAULT", () => {
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { spawnHelper as default } from "__MODULE_helper__";` },
        `import runIt from "__MODULE_barrel__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E2: an import ALIAS then a local export forwards by the IMPORTED name", () => {
    // A resolver forwarding by the LOCAL name asks the target for `h`, gets
    // noSuchExport, and goes silently pure. The plain import-then-export case
    // cannot catch that, because there the two names coincide.
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          barrel: `import { spawnHelper as h } from "__MODULE_helper__";
                   export { h };`,
        },
        `import { h } from "__MODULE_barrel__";
         it("x", () => { h(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("E2: a DEFAULT import then a local export forwards as `default`", () => {
    expect(
      verdictWithModules(
        {
          // `SPAWNER` already carries `export default spawnHelper`, so appending a
          // second one makes a module with two default exports, which the
          // error-tolerant parser still classifies while proving nothing about
          // any module a refactor produces (round-8 finding 1).
          helper: SPAWNER,
          barrel: `import runIt from "__MODULE_helper__";
                   export { runIt };`,
        },
        `import { runIt } from "__MODULE_barrel__";
         it("x", () => { runIt(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a re-exported PURE binding stays free", () => {
    // The foil: following the edge must not mark the target's whole closure.
    expect(
      verdictWithModules(
        { helper: SPAWNER, barrel: `export { pureOne } from "__MODULE_helper__";` },
        `import { pureOne } from "__MODULE_barrel__";
         it("x", () => { pureOne(); });`,
      ),
    ).toBe("environment-free");
  });

  it("a MIXED barrel: importing only the pure name stays free (AC-5 foil)", () => {
    // Discriminates against a `forward` that falls back to the target's whole
    // closure: the regression spec §1.1 item 2 fences. A pure-module foil
    // cannot catch that; this one can.
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          barrel: `export { spawnHelper, pureOne } from "__MODULE_helper__";`,
        },
        `import { pureOne } from "__MODULE_barrel__";
         it("x", () => { pureOne(); });`,
      ),
    ).toBe("environment-free");
  });

  // NOTE what this pair can and cannot discriminate (spec §2.5, AC-10): it
  // catches an `active` set that is never POPPED, which would report this legal
  // barrel shape as a re-export cycle. It does NOT catch removing `done`, and no
  // fixture here pretends to. The star branch returns on the first arm that is
  // not noSuchExport, so the shared pair is never revisited inside one
  // resolution. `done` is a performance structure; AC-14 is its bound.
  it("a diamond whose shared target MISSES is not mistaken for a cycle (AC-10)", () => {
    // The shared target must MISS the sought name (spec AC-10). Two earlier
    // drafts gave `d` the export, and then the FIRST star arm returns an extent,
    // §2.2's source-order rule short-circuits, the second arm never revisits
    // (d, name), and the case passes even with an `active` set that is never
    // popped. Here both arms reach (d, "absent"), the first completes with
    // noSuchExport and POPS, and the second re-reaches the same pair: a
    // never-popped set sees a back edge and falsely reports `re-export cycle`.
    expect(
      verdictWithModules(
        {
          d: `export function present(): number { return 1; }`,
          b: `export * from "__MODULE_d__";`,
          c: `export * from "__MODULE_d__";`,
          a: `export * from "__MODULE_b__";
              export * from "__MODULE_c__";`,
        },
        `import { absent } from "__MODULE_a__";
         it("t", () => { void absent; });`,
      ),
    ).toBe("environment-free");
  });

  it("a TOUCHING diamond still short-circuits on the first branch", () => {
    // The pure diamond's companion: pins that the short-circuit is intact, so
    // the pure case cannot be satisfied by removing it.
    expect(
      verdictWithModules(
        {
          helper: SPAWNER,
          left: `export { spawnHelper } from "__MODULE_helper__";`,
          right: `export { spawnHelper } from "__MODULE_helper__";`,
          barrel: `export * from "__MODULE_left__";
                   export * from "__MODULE_right__";`,
        },
        `import { spawnHelper } from "__MODULE_barrel__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a re-export CYCLE terminates and reports, with its own reason", () => {
    const modules = {
      a: `export { spawnHelper } from "__MODULE_b__";`,
      b: `export { spawnHelper } from "__MODULE_a__";`,
    };
    const src = `import { spawnHelper } from "__MODULE_a__";
      it("x", () => { spawnHelper(); });`;
    expectReported(classificationWithModules(modules, src), {
      construct: REPORTS.reexportCycle,
      module: /mod\d+_/,
      notModule: OWN_FILE,
    });
    // The verdict alone cannot discriminate: Task 1's stub also reports
    // unclassifiable, so the REASON above is what proves cycle detection.
  });
});

const SPAWNS = `import { spawnSync } from "node:child_process";
  export function spawner(): string { return String(spawnSync("echo", ["x"]).stdout); }`;

describe("declined export forms: unmodelled runtime references REPORT (AC-5c)", () => {
  // Every case in this block reports, so every case goes through
  // `expectReported` with the construct AND the module it was found in, the
  // BARREL for a re-export defect, never the importing test file (spec §2.6
  // item 2). A bare .toBe("unclassifiable") is not sufficient here.
  it.each([
    [
      "assignment position",
      `let m: any; m = await import("__MODULE_helper__"); it("x", async () => { (await m).spawner(); });`,
      REPORTS.dynamicImport,
    ],
    [
      "embedded: awaited member call",
      `it("x", async () => { (await import("__MODULE_helper__")).spawner(); });`,
      REPORTS.dynamicImport,
    ],
    [
      "embedded: .then destructure",
      `it("x", () => { void import("__MODULE_helper__").then(({ spawner }) => spawner()); });`,
      REPORTS.dynamicImport,
    ],
    [
      "bare side-effect dynamic",
      `it("x", async () => { await import("__MODULE_helper__"); });`,
      REPORTS.dynamicImport,
    ],
  ])("an unmodelled runtime reference REPORTS: %s", (_label, testSrc, construct) => {
    // Assert the REASON, not only the verdict. A generic or misattributed
    // reason satisfies a verdict-only assertion while violating AC-5c, and the
    // whole point of REPORTING is that the reader is told WHICH construct and
    // WHICH module. Spec §2.6 item 2: the path names the module the construct
    // was FOUND in.
    // `module` matches the GENERATED module path (mod<N>_helper), not the bare
    // word "helper", and `notModule` rules out the test file. A round-2 draft
    // used /helper/, which the import specifier already contains, so it matched
    // even when the reason named the wrong module or none.
    // Each row carries its OWN construct, never a union: a union lets any row
    // pass on another row's reason. And these four constructs sit in the
    // GENERATED TEST FILE, not in the helper, so the module is OWN_FILE, a
    // round-3 draft asserted /mod\d+_helper/ and rejected the test file, which
    // is backwards for this table.
    expectReported(classificationWithModules({ helper: SPAWNS }, testSrc), {
      construct,
      module: OWN_FILE,
    });
  });

  it("an EXPORTED embedded dynamic import REPORTS through the importer", () => {
    expectReported(
      classificationWithModules(
        {
          helper: SPAWNS,
          barrel: `export const run = (await import("__MODULE_helper__")).spawner;`,
        },
        `import { run } from "__MODULE_barrel__";\n it("x", () => { run(); });`,
      ),
      // The construct is in the BARREL (spec §2.6 item 2), not the test file.
      { construct: REPORTS.dynamicImport, module: /mod\d+_barrel/, notModule: /case\d+-user/ },
    );
  });

  it("an in-repo STATIC side-effect import REPORTS", () => {
    // `import "./side"` has no importClause at all, so every clause-driven
    // branch skips it and the module's spawn is never seen. 9 near-domain sites.
    expectReported(
      classificationWithModules(
        { side: `import { spawnSync } from "node:child_process";\n spawnSync("echo", []);` },
        `import "__MODULE_side__";\n it("x", () => { expect(1).toBe(1); });`,
      ),
      // The construct is the side-effect IMPORT, in the test file that writes it.
      { construct: REPORTS.sideEffect, module: OWN_FILE },
    );
  });

  it("a side-effect import inside a REACHED module REPORTS, naming that module", () => {
    // One ordinary edit from the case above, and the one that decides whether
    // the seed is enough: the import sits in a helper, OUTSIDE the extent of the
    // pure function the test calls, so following the edge never passes over it.
    // Probed on the merged scanner: environment-free today, and silently so,
    // which is the failure mode §1's bound exists to forbid. It greens only when `reaches`
    // merges `sideEffectImports` for every module whose facts it loads.
    expectReported(
      classificationWithModules(
        {
          side: `import { spawnSync } from "node:child_process";\n spawnSync("echo", []);`,
          helper: `import "__MODULE_side__";\n export function pureOne(): number { return 1; }`,
        },
        `import { pureOne } from "__MODULE_helper__";\n it("x", () => { pureOne(); });`,
      ),
      // Named for the HELPER that carries the import, not the test file and not
      // the side-effect target (spec §2.6 item 2).
      { construct: REPORTS.sideEffect, module: /mod\d+_helper/, notModule: OWN_FILE },
    );
  });

  it("an embedded BARE dynamic import stays PURE (L-2 foil)", () => {
    // The foil §2.4b needs and had not got: the rule's positions are about
    // shape, and its DOMAIN is in-repo specifiers. `tests/notify/resend-dep.test.ts:9`
    // is a live `await expect(import("resend"))` in exactly this shape;
    // reporting it would break AC-1 on a suite nobody edited. Probed
    // environment-free today, and it must stay environment-free after.
    expect(
      verdict(`it("x", async () => { await expect(import("resend")).resolves.toBeTruthy(); });`),
    ).toBe("environment-free");
  });

  it("its IN-REPO twin REPORTS, differing only in the specifier", () => {
    // The pair is what makes each discriminating: same embedded position, same
    // await, one bare and one repo-relative. Probed environment-free today.
    expectReported(
      classificationWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export function go(): string { return String(spawnSync("echo", []).stdout); }`,
        },
        `it("x", async () => { (await import("__MODULE_helper__")).go(); });`,
      ),
      { construct: REPORTS.dynamicImport, module: OWN_FILE },
    );
  });

  it("a MODULE-LOAD dynamic reference REPORTS, though nothing references it", () => {
    // The seed is not only about clause-less STATIC imports. A reportable
    // runtime reference in a TOP-LEVEL STATEMENT runs at module load and is
    // inside no extent, so the walk - which starts at the `it`, its hooks and
    // its producers - never visits it. Probed: environment-free today, silently.
    // One ordinary edit from the near-domain case at
    // tests/auth/requireAdmin.getClaims.test.ts:211, hoisted out of its test.
    expectReported(
      classification(`const specifier = "./x" + String(1);
        void (await import(specifier));
        it("x", () => { expect(1).toBe(1); });`),
      { construct: REPORTS.dynamicImport, module: OWN_FILE },
    );
  });

  it("the same shape inside an UNCALLED helper does NOT seed", () => {
    // The foil that stops the seed from becoming "any occurrence anywhere in
    // the file". A construct inside a function body is reachable only by a
    // CALL, and nothing calls this one, so the test stays pure. Without this
    // pair, an implementation that seeds every `import()` in the file passes
    // the case above while breaking AC-1 on the enrolled domain.
    expect(
      verdict(`const specifier = "./x" + String(1);
        async function unused(): Promise<void> { void (await import(specifier)); }
        it("x", () => { expect(1).toBe(1); });`),
    ).toBe("environment-free");
  });

  it("a side-effect import on a FORWARDING barrel REPORTS, naming the barrel", () => {
    // One ordinary edit further: the module carrying the import now FORWARDS
    // rather than declaring, so it is loaded INSIDE resolveExport and the
    // caller never sees its ModuleFacts. Merging side-effect reasons only in
    // `reaches` loses it: the terminal extent is pure, so the test reads
    // environment-free with nothing reported (round-13 finding 1). It greens
    // only when a forward hop returns its module's reasons through
    // `ExportResolution.reasons`.
    expectReported(
      classificationWithModules(
        {
          side: `import { spawnSync } from "node:child_process";\n spawnSync("echo", []);`,
          leaf: `export function pureOne(): number { return 1; }`,
          barrel: `import "__MODULE_side__";\n export { pureOne } from "__MODULE_leaf__";`,
        },
        `import { pureOne } from "__MODULE_barrel__";\n it("x", () => { pureOne(); });`,
      ),
      { construct: REPORTS.sideEffect, module: /mod\d+_barrel/, notModule: OWN_FILE },
    );
  });

  it("an in-repo specifier that does NOT resolve REPORTS", () => {
    // Extensionless `./h` for a `.mjs` sibling. resolveSpecifier's candidates are
    // NOT widened (spec §2.4b): the miss is reported instead of passed as pure.
    expectReported(
      classificationWithModules(
        { "helper.mjs": SPAWNS },
        `import { spawner } from "__MODULE_NOEXT_helper__";\n it("x", () => { spawner(); });`,
      ),
      { construct: REPORTS.unresolvedSpecifier, module: OWN_FILE },
    );
  });

  it("a BARE unresolved specifier stays FREE, L-2 is unchanged", () => {
    // The foil that stops the rule swallowing node_modules. Without it, §2.4b
    // would report every third-party import in the corpus.
    expect(
      verdictWithModules(
        {},
        `import { thing } from "some-npm-package";\n it("x", () => { thing(); });`,
      ),
    ).toBe("environment-free");
  });

  // NOTE the LOCAL dynamic-namespace foil is NOT here. It expects
  // `environment-touching`, which needs Task 4's member resolution; probe DYN-NS
  // measures it environment-free today and nothing in this task changes that, so
  // asserting it here would make this task's green command depend on a later one.
  // It lives in Task 4 beside the other namespace cases.

  it.each([
    [
      "export const ns = await import()",
      `export const ns = await import("__MODULE_helper__");`,
      "ns",
    ],
    [
      "export const { spawner } = await import()",
      `export const { spawner } = await import("__MODULE_helper__");`,
      "spawner",
    ],
    [
      "const ns = await import(); export { ns }",
      `const ns = await import("__MODULE_helper__");\nexport { ns };`,
      "ns",
    ],
    [
      "const { spawner } = await import(); export { spawner }",
      `const { spawner } = await import("__MODULE_helper__");\nexport { spawner };`,
      "spawner",
    ],
  ])("an EXPORTED dynamic binding REPORTS: %s (spec §2.2)", (_l, barrel, name) => {
    // Each imports the name its own barrel exports. A fixture importing a name
    // the barrel lacks would be pure for a test-local reason and never go green.
    expectReported(
      classificationWithModules(
        { helper: SPAWNS, barrel },
        `import { ${name} } from "__MODULE_barrel__";\n it("x", () => { void ${name}; });`,
      ),
      // The construct is in the BARREL, not the test file (spec §2.6 item 2).
      { construct: REPORTS.dynamicImport, module: /mod\d+_barrel/, notModule: /case\d+-user/ },
    );
  });
});

describe("declined export forms: recognized, unresolvable, and REPORTED", () => {
  const SPAWNER = `import { spawnSync } from "node:child_process";
    export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`;

  it("an unfollowable re-export reports, naming the module", () => {
    const modules = { barrel: `export { spawnHelper } from "./definitely-not-here";` };
    const src = `import { spawnHelper } from "__MODULE_barrel__";
      it("x", () => { spawnHelper(); });`;
    expectReported(classificationWithModules(modules, src), {
      construct: REPORTS.unfollowable,
      module: /mod\d+_barrel/,
      notModule: /case\d+-user/,
    });
    expect(classificationWithModules(modules, src)?.detail ?? "").toMatch(/barrel/);
  });

  it("`export * as ns from` reports", () => {
    expectReported(
      classificationWithModules(
        { helper: SPAWNER, barrel: `export * as helpers from "__MODULE_helper__";` },
        `import { helpers } from "__MODULE_barrel__";
         it("x", () => { helpers.spawnHelper(); });`,
      ),
      { construct: REPORTS.namespaceExport, module: /mod\d+_barrel/, notModule: OWN_FILE },
    );
  });

  it("`export =` reports", () => {
    expectReported(
      classificationWithModules(
        // An export assignment cannot sit in a module that also has ES exports
        // (`TS2309`), so this fixture keeps the spawning function LOCAL and
        // exports it only through `export =`, which is the shape a CommonJS-authored
        // in-repo module actually has (round-8 finding 1, swept).
        {
          helper: `import { spawnSync } from "node:child_process";
            function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
            export = spawnHelper;`,
        },
        `import runIt from "__MODULE_helper__";
         it("x", () => { runIt(); });`,
      ),
      { construct: REPORTS.exportEquals, module: /mod\d+_helper/, notModule: OWN_FILE },
    );
  });

  it("`export namespace` reports", () => {
    // Probe B9: it carries an `export` modifier but registers no extent, so an
    // E1 predicate keyed on the modifier resolves it to an EMPTY extent and
    // passes it as free.
    expectReported(
      classificationWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export namespace NS {
              export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }
            }`,
        },
        `import { NS } from "__MODULE_helper__";
         it("x", () => { NS.spawnHelper(); });`,
      ),
      { construct: REPORTS.exportNamespace, module: /mod\d+_helper/, notModule: OWN_FILE },
    );
  });

  it("a VALUE import of a type-only export is PURE, not unresolvable", () => {
    // NOT written as `import type { Thing }`: that form is filtered by
    // isInTypePosition before any resolution, so it would pass whatever §2.2
    // decides about type-only exports and could not discriminate the rule it is
    // the foil for. This imports the name in a VALUE position, so it genuinely
    // reaches resolveExport and pins that a type-only export resolves pure.
    expect(
      verdictWithModules(
        { helper: `export type Thing = { a: number };\n${SPAWNER}` },
        `import { Thing } from "__MODULE_helper__";
         it("x", () => { void Thing; });`,
      ),
    ).toBe("environment-free");
  });

  it("an ordinary named export is NOT reported", () => {
    // The foil that stops this task's rule becoming "report everything".
    expect(
      verdictWithModules(
        { helper: SPAWNER },
        `import { spawnHelper } from "__MODULE_helper__";
         it("x", () => { spawnHelper(); });`,
      ),
    ).toBe("environment-touching");
  });
});

describe("namespace bindings: member-precise, and nothing else", () => {
  // The three non-member cases in this block report; each uses
  // `expectReported` with construct /namespace .* no statically known member/
  // and the module the namespace was imported from.
  const MIXED = `import { spawnSync } from "node:child_process";
    export function spawner(): string { return String(spawnSync("echo", ["x"]).stdout); }
    export function pureOne(): number { return 1; }`;

  const ENVELOPE = `import { spawnSync } from "node:child_process";
    export function reportEnvelope(res: { ok: boolean }): string { return res.ok ? "ok" : "no"; }
    export function main(): string {
      const res = spawnSync("git", ["status"]);
      return String(res.stdout);
    }`;

  it("`ns.member` resolves to that member", () => {
    expect(
      verdictWithModules(
        { helper: MIXED },
        `import * as ns from "__MODULE_helper__";
        it("x", () => { ns.spawner(); });`,
      ),
    ).toBe("environment-touching");
  });

  it('`ns["member"]` resolves to that member', () => {
    expect(
      verdictWithModules(
        { helper: MIXED },
        `import * as ns from "__MODULE_helper__";
        it("x", () => { ns["spawner"](); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a DYNAMIC namespace binding resolves (AC-2b)", () => {
    // bindPattern's identifier branch records the LOCAL name: the same
    // substitution, in the one place the round-1 draft called out of scope.
    expect(
      verdictWithModules(
        { helper: MIXED },
        `it("x", async () => { const ns = await import("__MODULE_helper__"); ns.spawner(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("a DYNAMIC destructured binding still resolves", () => {
    // AC-2b's foil: already touching today, so it proves the dynamic path was
    // never wholly broken and only the namespace spelling was.
    expect(
      verdictWithModules(
        { helper: MIXED },
        `it("x", async () => { const { spawner } = await import("__MODULE_helper__"); spawner(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("the namespace dedup identity includes the MEMBER: pure first (AC-2c)", () => {
    // The traversal dedups by the BINDING a reference resolves to. A namespace
    // resolves the SAME binding to DIFFERENT exports, so a member-blind key
    // marks it seen on ns.pureOne() and never visits ns.spawner().
    expect(
      verdictWithModules(
        { helper: MIXED },
        `import * as ns from "__MODULE_helper__";
        it("x", () => { ns.pureOne(); ns.spawner(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("the namespace dedup identity includes the MEMBER: spawn first (AC-2c)", () => {
    // Both orders are required: a member-blind key fails in exactly one of them
    // depending on which reference the walk meets first, so a single-order
    // fixture can pass while the hole remains.
    expect(
      verdictWithModules(
        { helper: MIXED },
        `import * as ns from "__MODULE_helper__";
        it("x", () => { ns.spawner(); ns.pureOne(); });`,
      ),
    ).toBe("environment-touching");
  });

  it("`export { ns }` over a namespace import reports", () => {
    // E2 forwarding would ask the target for an export named after the local
    // alias, get noSuchExport, and go silently pure. Probe §3.9 measures free
    // today; population 0 repo-wide, so reporting costs nothing.
    expectReported(
      classificationWithModules(
        {
          helper: MIXED,
          barrel: `import * as helpers from "__MODULE_helper__";
                   export { helpers };`,
        },
        `import { helpers } from "__MODULE_barrel__";
         it("x", () => { helpers.spawnHelper(); });`,
      ),
      { construct: REPORTS.nsLocalReexport, module: /mod\d+_barrel/, notModule: /case\d+-user/ },
    );
  });

  it("a namespace member that is PURE stays free even when a sibling spawns", () => {
    // AC-3, and the regression case for spec §1.1 item 2: a module-closure rule
    // fails here. AC-2's foil; neither may be removed without the other.
    expect(
      classificationWithModules(
        { helper: MIXED },
        `import * as ns from "__MODULE_helper__";
        it("x", () => { ns.pureOne(); });`,
      )?.verdict,
    ).toBe("environment-free");
  });

  it("AC-10b stays quiet through a namespace", () => {
    expect(
      verdictWithModules(
        { helper: ENVELOPE },
        `import * as env from "__MODULE_helper__";
        it("x", () => { env.reportEnvelope({ ok: true }); });`,
      ),
    ).toBe("environment-free");
  });

  it("AC-10b stays quiet through a direct import", () => {
    expect(
      verdictWithModules(
        { helper: ENVELOPE },
        `import { reportEnvelope } from "__MODULE_helper__";
        it("x", () => { reportEnvelope({ ok: true }); });`,
      ),
    ).toBe("environment-free");
  });

  it("a namespace in a NON-member position reports", () => {
    expectReported(
      classificationWithModules(
        { helper: MIXED },
        `import * as ns from "__MODULE_helper__";
        it("x", () => { Object.entries(ns); });`,
      ),
      // Found in the TEST file; the helper is named too, as the origin.
      { construct: REPORTS.nsNonMember, module: OWN_FILE },
    );
  });

  it("a destructured namespace reports", () => {
    expectReported(
      classificationWithModules(
        { helper: MIXED },
        `import * as ns from "__MODULE_helper__";
        it("x", () => { const { pureOne } = ns; pureOne(); });`,
      ),
      { construct: REPORTS.nsNonMember, module: OWN_FILE },
    );
  });

  it("`ns[computed]` reports", () => {
    expectReported(
      classificationWithModules(
        { helper: MIXED },
        `import * as ns from "__MODULE_helper__";
        const k = "spawner";
        it("x", () => { ns[k as keyof typeof ns]; });`,
      ),
      // A NON-literal element access is a namespace used with no statically
      // known member (spec §2.3), not a dynamic import. Found in the TEST file.
      { construct: REPORTS.nsNonMember, module: OWN_FILE },
    );
  });

  it("a namespace import of a PROVENANCE module stays touching whatever the member", () => {
    // AC-13. isProvenanceModule is checked before member resolution.
    expect(
      verdict(`import * as cp from "node:child_process";
        it("x", () => { cp.execSync("git status"); });`),
    ).toBe("environment-touching");
  });

  it("a namespace of a provenance module in a NON-member position stays touching", () => {
    // Order matters: provenance first, member precision second. A repair that
    // resolved members first would report unclassifiable here.
    expect(
      classification(`import * as cp from "node:child_process";
        it("x", () => { void Object.keys(cp); });`)?.verdict,
    ).toBe("environment-touching");
  });
});

describe("unclassifiable propagation: a construct anywhere reachable reaches the verdict", () => {
  // Every reporting case in this block uses `expectReported`, with the module
  // being the one HOLDING the construct, for the cross-module case that is the
  // loader module, not the test file. AC-12's precedence branches are the stated
  // exception: their subject is the lattice, so they assert the verdict alone.
  it("a module-scope helper holding a non-literal dynamic import reports", () => {
    expectReported(
      classification(`const specifier = "./x" + String(1);
        async function loader(): Promise<unknown> { return await import(specifier); }
        it("x", async () => { await loader(); });`),
      { construct: REPORTS.dynamicImport, module: OWN_FILE },
    );
  });

  it("a describe-scope helper holding a non-literal dynamic import reports", () => {
    expectReported(
      classification(`const specifier = "./x" + String(1);
        describe("d", () => {
          async function loader(): Promise<unknown> { return await import(specifier); }
          it("x", async () => { await loader(); });
        });`),
      { construct: REPORTS.dynamicImport, module: OWN_FILE },
    );
  });

  it("a module-scope helper holding a computed process access reports", () => {
    expectReported(
      classification(`const k = "PATH";
        function readEnv(): unknown { return (process as never)[k]; }
        it("x", () => { readEnv(); });`),
      { construct: REPORTS.computedProcess, module: OWN_FILE },
    );
  });

  it("a describe-scope helper holding a computed process access reports", () => {
    expectReported(
      classification(`const k = "PATH";
        describe("d", () => {
          function readEnv(): unknown { return (process as never)[k]; }
          it("x", () => { readEnv(); });
        });`),
      { construct: REPORTS.computedProcess, module: OWN_FILE },
    );
  });

  it("a beforeEach body holding a construct reports (C1)", () => {
    // The hook path: classifyTests tested the hook reaches() result for one
    // value only, so every reason reached this way was discarded.
    expectReported(
      classification(`const specifier = "./x" + String(1);
        describe("d", () => {
          beforeEach(async () => { await import(specifier); });
          it("x", () => { expect(1).toBe(1); });
        });`),
      { construct: REPORTS.dynamicImport, module: OWN_FILE },
    );
  });

  it("a beforeAll body holding a construct reports (C2)", () => {
    // computed PROCESS access, not a dynamic import: unclassifiableWithin emits
    // the process reason and a dynamicImport expectation could never match.
    expectReported(
      classification(`const k = "PATH";
        describe("d", () => {
          beforeAll(() => { void (process as never)[k]; });
          it("x", () => { expect(1).toBe(1); });
        });`),
      { construct: REPORTS.computedProcess, module: OWN_FILE },
    );
  });

  it("a describe.each producer holding a construct reports (C3)", () => {
    expectReported(
      classification(`const specifier = "./x" + String(1);
        const rows = [1];
        async function make(): Promise<unknown> { return await import(specifier); }
        describe.each(rows.map(() => make()))("d", () => {
          it("x", () => { expect(1).toBe(1); });
        });`),
      { construct: REPORTS.dynamicImport, module: OWN_FILE },
    );
  });

  it("a TOP-LEVEL hook reaching PROVENANCE classifies touching (AC-12)", () => {
    // The arc's only PROVENANCE silent free. classifyTests seeds its walk with
    // an empty hook list and only adds hooks at a `describe`, so a file whose
    // beforeEach sits at top level has none attached to any test. Probe §3.5
    // measures this environment-free today; 6 of the 33 enrolled suites are
    // shaped this way.
    expect(
      classificationWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         beforeEach(() => { spawnHelper(); });
         it("x", () => { expect(1).toBe(1); });`,
      )?.verdict,
    ).toBe("environment-touching");
  });

  it.each(["beforeEach", "beforeAll", "afterEach", "afterAll"])(
    "a TOP-LEVEL %s holding a construct reports (AC-11)",
    (hook) => {
      // AC-11 requires this separately for all four registrars, not just
      // beforeAll: probe §3.11 row D measures a top-level afterAll free today
      // exactly as beforeEach is, so a single-registrar block would read as
      // complete while leaving half the defect live.
      expectReported(
        classification(`const specifier = "./x" + String(1);
          ${hook}(async () => { await import(specifier); });
          it("x", () => { expect(1).toBe(1); });`),
        { construct: REPORTS.dynamicImport, module: OWN_FILE },
      );
    },
  );

  it("a TOP-LEVEL hook with a PURE body stays free", () => {
    // The foil: attaching top-level hooks must not mark every test in every
    // file that has one: and 6 enrolled suites have one.
    expect(
      verdict(`function pure(): number { return 1; }
        beforeEach(() => { pure(); });
        it("x", () => { expect(1).toBe(1); });`),
    ).toBe("environment-free");
  });

  it.each(["beforeEach", "beforeAll", "afterEach", "afterAll"])(
    "a TOP-LEVEL %s reaching provenance classifies touching (AC-12)",
    (hook) => {
      // Probe §3.11 row D measures a top-level afterAll environment-free today,
      // exactly as beforeEach is. Pinning only the two before* forms would leave
      // half the defect live while the block read as complete. The shipped
      // registrar regex already covers all four (tests/mutation/source/premiseScan.ts:1119).
      expect(
        classificationWithModules(
          {
            helper: `import { spawnSync } from "node:child_process";
              export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
          },
          `import { spawnHelper } from "__MODULE_helper__";
           ${hook}(() => { spawnHelper(); });
           it("x", () => { expect(1).toBe(1); });`,
        )?.verdict,
      ).toBe("environment-touching");
    },
  );

  it("the top-level seed does NOT leak a nested hook to a sibling (AC-12b)", () => {
    // The criterion AC-11's pure-hook foil cannot catch. hookBodies walks with
    // ts.forEachChild (tests/mutation/source/premiseScan.ts:1113), so a seed written as one recursive
    // call over the SourceFile attaches EVERY hook in the file to EVERY test in
    // it, turning this pure sibling environment-touching. A FALSE POSITIVE,
    // the direction spec §0 forbids trading into.
    //
    // Read by NAME, not by first-classification: verdictWithModules returns the
    // FIRST test (inA), which is environment-touching before the repair, after
    // it, AND under the wrong recursive implementation, so a fixture written
    // that way cannot fail for the reason it claims. inB is the discriminating
    // assertion and it is only reachable through the full list.
    //
    // NOTE the shared outer describe is deliberately ABSENT: with one, the
    // pre-existing recursive collection in the describe branch already leaks
    // (probe §3.11 row A, spec §4 limit 14) and inB would be touching before
    // and after, proving nothing about the seed.
    const all = classificationsWithModules(
      {
        helper: `import { spawnSync } from "node:child_process";
          export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
      },
      `import { spawnHelper } from "__MODULE_helper__";
       describe("A", () => {
         beforeEach(() => { spawnHelper(); });
         it("inA", () => { expect(1).toBe(1); });
       });
       describe("B", () => {
         it("inB", () => { expect(1).toBe(1); });
       });`,
    );
    expect(all.find((t) => t.testName === "inA")?.verdict).toBe("environment-touching");
    expect(all.find((t) => t.testName === "inB")?.verdict).toBe("environment-free");
  });

  it("AC-12b: a PURE top-level hook beside a spawning nested one", () => {
    // The second shape AC-12b requires. The top-level hook attaches to BOTH
    // tests, so if the seed were to carry the nested hook's provenance with it,
    // inB would flip. Pinning the pure top-level hook separately is what shows
    // the seed adds the hook without adding the nested one's reach.
    const all = classificationsWithModules(
      {
        helper: `import { spawnSync } from "node:child_process";
          export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
      },
      `import { spawnHelper } from "__MODULE_helper__";
       beforeEach(() => { void 0; });
       describe("A", () => {
         beforeEach(() => { spawnHelper(); });
         it("inA", () => { expect(1).toBe(1); });
       });
       describe("B", () => { it("inB", () => { expect(1).toBe(1); }); });`,
    );
    expect(all.find((t) => t.testName === "inA")?.verdict).toBe("environment-touching");
    expect(all.find((t) => t.testName === "inB")?.verdict).toBe("environment-free");
  });

  it("AC-12b: the SHARED-OUTER leak is pinned at its CURRENT value", () => {
    // Spec §4 limit 14 and AC-12b: under a shared outer describe, hookBodies'
    // recursion ALREADY leaks branch A's hook to sibling B, and this arc does
    // not fix it (repairing it moves live verdicts and breaks AC-1). Asserting
    // the leaked value pins "this arc did not WIDEN it", without this case a
    // seed change could deepen the leak with nothing going red.
    const all = classificationsWithModules(
      {
        helper: `import { spawnSync } from "node:child_process";
          export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
      },
      `import { spawnHelper } from "__MODULE_helper__";
       describe("outer", () => {
         describe("A", () => {
           beforeEach(() => { spawnHelper(); });
           it("inA", () => { expect(1).toBe(1); });
         });
         describe("B", () => { it("inB", () => { expect(1).toBe(1); }); });
       });`,
    );
    expect(all.find((t) => t.testName === "inA")?.verdict).toBe("environment-touching");
    // The documented pre-existing FALSE POSITIVE, asserted as-is (probe §3.11 row A).
    expect(all.find((t) => t.testName === "inB")?.verdict).toBe("environment-touching");
  });

  it("a hook reaching PROVENANCE still classifies touching (C6 foil)", () => {
    // The foil for the three hook cases: the hook path already carried
    // provenance correctly, so what the repair adds is the reason channel and
    // nothing else. If this regresses, the merge broke the hook loop.
    expect(
      verdictWithModules(
        {
          helper: `import { spawnSync } from "node:child_process";
            export function spawnHelper(): string { return String(spawnSync("echo", ["x"]).stdout); }`,
        },
        `import { spawnHelper } from "__MODULE_helper__";
         describe("d", () => {
           beforeEach(() => { spawnHelper(); });
           it("x", () => { expect(1).toBe(1); });
         });`,
      ),
    ).toBe("environment-touching");
  });

  it("a CROSS-MODULE helper holding a construct reports, naming that module", () => {
    const modules = {
      loader: `const specifier = "./x" + String(1);
        export async function load(): Promise<unknown> { return await import(specifier); }`,
    };
    const src = `import { load } from "__MODULE_loader__";
      it("x", async () => { await load(); });`;
    expectReported(classificationWithModules(modules, src), {
      construct: REPORTS.dynamicImport,
      module: /mod\d+_loader/,
      notModule: /case\d+-user/,
    });
    expect(classificationWithModules(modules, src)?.detail ?? "").toMatch(/loader/);
  });

  it("a helper WITHOUT the construct stays free", () => {
    // The foil: propagation must not report every reachable helper.
    //
    // It must contain NO import at all. A round-1 draft used
    // `return await import("./x")`, which after Task 3 is BOTH an embedded
    // dynamic import and an unresolved in-repo specifier, so §2.4b reports it
    // and the foil asserts a value no later task may restore.
    expect(
      verdict(`function loader(): number { return 1; }
        it("x", () => { loader(); });`),
    ).toBe("environment-free");
  });

  it("a construct in the test's OWN body outranks a provable environment reach", () => {
    // AC-12, branch one: shipped precedence, unchanged (spec §2.7).
    expectReported(
      classification(`import { spawnSync } from "node:child_process";
        const specifier = "./x" + String(1);
        it("x", async () => { spawnSync("git", []); await import(specifier); });`),
      { construct: REPORTS.dynamicImport, module: OWN_FILE },
    );
  });

  it("a construct reached only through a HELPER loses to a provable environment reach", () => {
    // AC-12, branch two: the asymmetry §2.7 states and §4 limit 7 files.
    expect(
      verdict(`import { spawnSync } from "node:child_process";
        const specifier = "./x" + String(1);
        async function loader(): Promise<unknown> { return await import(specifier); }
        it("x", async () => { spawnSync("git", []); await loader(); });`),
    ).toBe("environment-touching");
  });

  it("a reason is reported once, not twice", () => {
    // The test's own extent is also visited by the traversal, so both paths see
    // a construct in the test body; `detail` must not repeat it.
    const c = classificationWithModules(
      {},
      `const specifier = "./x" + String(1);
       it("x", async () => { await import(specifier); });`,
    );
    expect((c?.detail ?? "").match(/non-literal specifier/g) ?? []).toHaveLength(1);
  });
});
