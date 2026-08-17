import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import ts from "typescript";
import {
  scanBody,
  moduleHasUseServer,
  importBindingOk,
  parse,
  collectSurfaceUnits,
  moduleDefaultExports,
  routeMutatingMethods,
} from "./enumerate";
import { discoveryGaps } from "./totality";

const sf = (src: string) =>
  ts.createSourceFile("t.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const firstFn = (src: string) => {
  let f: ts.FunctionLikeDeclaration | undefined;
  const walk = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && !f) f = n;
    ts.forEachChild(n, walk);
  };
  walk(sf(src));
  return f!;
};
const IMP =
  'import { log } from "@/lib/log";\nimport { logAdminOutcome } from "@/lib/log/logAdminOutcome";\n';

describe("scanBody durability predicate", () => {
  test("awaited logAdminOutcome → adminOutcome true", () => {
    expect(
      scanBody(firstFn(IMP + 'async function m(){ await logAdminOutcome({code:"X"}); }'), {
        descend: false,
      }).adminOutcome,
    ).toBe(true);
  });
  test("void logAdminOutcome → adminOutcome false", () => {
    expect(
      scanBody(firstFn(IMP + 'async function m(){ void logAdminOutcome({code:"X"}); }'), {
        descend: false,
      }).adminOutcome,
    ).toBe(false);
  });
  test("bare unawaited logAdminOutcome → adminOutcome false (Codex plan-R4 F4)", () => {
    expect(
      scanBody(firstFn(IMP + 'async function m(){ logAdminOutcome({code:"X"}); }'), {
        descend: false,
      }).adminOutcome,
    ).toBe(false);
  });
  test("log.info with SHOUTY message but no code field → codedLog false (non-durable)", () => {
    expect(
      scanBody(firstFn(IMP + 'async function m(){ log.info("FOO", { source:"s" }); }'), {
        descend: false,
      }).codedLog,
    ).toBe(false);
  });
  test("log.info with code field → codedLog true", () => {
    expect(
      scanBody(firstFn(IMP + 'async function m(){ log.info("m", { code:"FOO" }); }'), {
        descend: false,
      }).codedLog,
    ).toBe(true);
  });
  test("log.warn message-only → codedLog false", () => {
    expect(
      scanBody(firstFn(IMP + 'async function m(){ log.warn("FOO"); }'), { descend: false })
        .codedLog,
    ).toBe(false);
  });
  test("nested unused emitter → false when descend:false", () => {
    expect(
      scanBody(
        firstFn(
          IMP +
            'async function m(){ async function u(){ await logAdminOutcome({code:"X"}); } return; }',
        ),
        { descend: false },
      ).adminOutcome,
    ).toBe(false);
  });
  test("emit inside if-block → true (control-flow descended)", () => {
    expect(
      scanBody(
        firstFn(IMP + 'async function m(){ if(ok){ await logAdminOutcome({code:"X"}); } }'),
        {
          descend: false,
        },
      ).adminOutcome,
    ).toBe(true);
  });
  test("requireAdmin in body → adminGated true", () => {
    expect(
      scanBody(firstFn(IMP + "async function m(){ await requireAdmin(); doIt(); }"), {
        descend: false,
      }).adminGated,
    ).toBe(true);
  });
  test(".rpc detected", () => {
    expect(
      scanBody(firstFn(IMP + 'async function m(){ await sb.rpc("x"); }'), { descend: false }).rpc,
    ).toBe(true);
  });
});
describe("directives", () => {
  test("module-level use server", () => {
    expect(moduleHasUseServer(sf('"use server";\nexport async function m(){}'))).toBe(true);
  });
  test("use client is not use server", () => {
    expect(moduleHasUseServer(sf('"use client";\nexport function C(){}'))).toBe(false);
  });
});
describe("importBindingOk", () => {
  test("real imports", () => {
    const r = importBindingOk(sf(IMP + "export async function m(){}"));
    expect(r.log && r.logAdminOutcome).toBe(true);
  });
  test("module-level shadow: no real import", () => {
    const r = importBindingOk(sf("const log = { info(){} };\nexport async function m(){}"));
    expect(r.log).toBe(false);
  });
  test("wrong-source import rejected", () => {
    const r = importBindingOk(sf('import { log } from "./fake";\nexport async function m(){}'));
    expect(r.log).toBe(false);
  });
});

describe("call-site binding (Codex plan-R1 F2): local shadow does NOT satisfy the floor", () => {
  test("real import but log rebound in the fn body → codedLog false", () => {
    const src =
      IMP + 'async function m(){ const log = { warn(){} }; log.warn("x", { code:"FOO" }); }';
    // scanBody must reject because the call's `log` is locally rebound
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(false);
  });
  test("real import but logAdminOutcome rebound → adminOutcome false", () => {
    const src =
      IMP +
      'async function m(){ const logAdminOutcome = async () => {}; await logAdminOutcome({ code:"X" }); }';
    expect(scanBody(firstFn(src), { descend: false }).adminOutcome).toBe(false);
  });
  test("destructured shadow const { log } = fake → codedLog false (Codex plan-R3)", () => {
    const src = IMP + 'async function m(){ const { log } = fake; log.warn("x", { code:"FOO" }); }';
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(false);
  });
  test("catch (log) shadow → codedLog false", () => {
    const src =
      IMP + 'async function m(){ try { doIt(); } catch (log) { log.error("x", { code:"FOO" }); } }';
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(false);
  });
  test("param shadow (log) → codedLog false", () => {
    const src = IMP + 'async function m(log){ log.info("x", { code:"FOO" }); }';
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(false);
  });
});

function makeFixture(relPath: string, contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "mutation-surface-"));
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, "utf8");
  return root;
}

const unitsFor = (relPath: string, contents: string) =>
  collectSurfaceUnits([makeFixture(relPath, contents)]);

describe("collectSurfaceUnits — module-level server actions", () => {
  test("2 exported async fns → 2 module-action units, correct fn names", () => {
    const root = makeFixture(
      "lib/x/actions.ts",
      '"use server";\nexport async function alpha(){}\nexport async function beta(){}\n',
    );
    const units = collectSurfaceUnits([root]);
    expect(units.length).toBe(2);
    expect(units.every((u) => u.kind === "module-action")).toBe(true);
    expect(new Set(units.map((u) => u.fn))).toEqual(new Set(["alpha", "beta"]));
  });

  test("export-list `export { mutate }` is collected", () => {
    const root = makeFixture(
      "lib/x/actions.ts",
      '"use server";\nasync function mutate(){}\nexport { mutate };\n',
    );
    const units = collectSurfaceUnits([root]);
    expect(units.map((u) => u.fn)).toEqual(["mutate"]);
  });

  test("aliased export-list `export { local as mutate }` binds to local's declaration/body", () => {
    const root = makeFixture(
      "lib/x/actions.ts",
      '"use server";\nasync function local(){ await doIt(); }\nexport { local as mutate };\n',
    );
    const units = collectSurfaceUnits([root]);
    expect(units.length).toBe(1);
    expect(units[0]!.fn).toBe("mutate");
  });

  test("'use server' module with export default → moduleDefaultExports true", () => {
    const relPath = "lib/x/default-actions.ts";
    const root = makeFixture(relPath, '"use server";\nexport default async function mutate(){}\n');
    const sf = parse(join(root, relPath));
    expect(moduleDefaultExports(sf)).toBe(true);
  });
});

describe("collectSurfaceUnits — routes", () => {
  test("route file exporting POST → one route unit (fn: POST)", () => {
    const root = makeFixture("app/api/x/route.ts", "export async function POST(){}\n");
    const units = collectSurfaceUnits([root]);
    expect(units.length).toBe(1);
    expect(units[0]!.kind).toBe("route");
    expect(units[0]!.fn).toBe("POST");
  });

  test("route re-export `export { POST } from './x'` is detected by routeMutatingMethods", () => {
    const root = makeFixture("app/api/x/route.ts", 'export { POST } from "./impl";\n');
    const sf = parse(join(root, "app/api/x/route.ts"));
    expect(routeMutatingMethods(sf).length).toBeGreaterThanOrEqual(1);
  });

  test("route re-export with rename `export { handler as POST } from './x'` is detected", () => {
    const root = makeFixture("app/api/y/route.ts", 'export { handler as POST } from "./impl";\n');
    const sf = parse(join(root, "app/api/y/route.ts"));
    expect(routeMutatingMethods(sf).length).toBeGreaterThanOrEqual(1);
  });

  test("route with POST + DELETE → routeMutatingMethods length 2", () => {
    const root = makeFixture(
      "app/api/z/route.ts",
      "export async function POST(){}\nexport async function DELETE(){}\n",
    );
    const sf = parse(join(root, "app/api/z/route.ts"));
    expect(routeMutatingMethods(sf).length).toBe(2);
  });
});

describe("collectSurfaceUnits — admin classification", () => {
  test("module action calling requireAdmin in-body → admin:true", () => {
    const root = makeFixture(
      "lib/x/actions.ts",
      '"use server";\nexport async function mutate(){ await requireAdmin(); doIt(); }\n',
    );
    const units = collectSurfaceUnits([root]);
    expect(units[0]!.admin).toBe(true);
  });

  test("route under app/api/admin/** → admin:true (path-based)", () => {
    const root = makeFixture("app/api/admin/x/route.ts", "export async function POST(){}\n");
    const units = collectSurfaceUnits([root]);
    expect(units[0]!.admin).toBe(true);
  });

  test("app/api/report/route.ts-style path → admin:false (not path-matched, not scanned for require*)", () => {
    const root = makeFixture(
      "app/api/report/route.ts",
      "export async function POST(){ await requireAdminIdentity(); doIt(); }\n",
    );
    const units = collectSurfaceUnits([root]);
    expect(units[0]!.admin).toBe(false);
  });
});

describe("collectSurfaceUnits — D2 total inline collection", () => {
  test("inline object method carrying the directive → inline-action unit `doIt` (spec §3.6 row 4)", () => {
    const units = unitsFor(
      "components/x/G.tsx",
      'export function G() {\n  const a = { async doIt() { "use server"; await db.from("t").delete(); } };\n  return a;\n}\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "inline-action"]]);
    // anti-tautology: the resolved node is live for instrumentation — scanBody
    // sees the fixture's write builder through the SAME node the unit carries.
    expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
  });

  test("static class method carrying the directive → inline-action unit `doIt` (spec §3.6 row 9)", () => {
    const units = unitsFor(
      "components/x/I.tsx",
      'export class I {\n  static async doIt() { "use server"; await db.from("t").delete(); }\n}\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "inline-action"]]);
    expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
  });

  test('inline action nested inside a file-level "use server" module → BOTH units (spec §3.6 row 7)', () => {
    const units = unitsFor(
      "lib/x/e.ts",
      '"use server";\nexport async function outer() {\n  const nested = async () => { "use server"; await db.from("t").delete(); };\n  return nested;\n}\n',
    );
    expect(units.map((u) => [u.fn, u.kind]).sort()).toEqual([
      ["nested", "inline-action"],
      ["outer", "module-action"],
    ]);
    // liveness on BOTH nodes: a correct key on the wrong node is the unpinned failure mode.
    const nested = units.find((u) => u.fn === "nested")!;
    expect(scanBody(nested.node, { descend: false }).writeBuilder).toBe(true);
  });

  test("a module-exported action whose body ALSO carries the directive is ONE unit, not two (dedupe by node identity)", () => {
    const units = unitsFor(
      "lib/x/dd.ts",
      '"use server";\nexport const mutate = async () => { "use server"; await db.from("t").delete(); };\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["mutate", "module-action"]]);
    expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
  });
});

describe("collectSurfaceUnits — D1 closed resolver", () => {
  const D1_CASES: ReadonlyArray<{ label: string; rel: string; src: string; fn: string }> = [
    {
      label: "row 1: paren-wrapped module export",
      rel: "lib/x/a.ts",
      src: '"use server";\nexport const wrapped = (async () => { await db.from("t").delete(); });\n',
      fn: "wrapped",
    },
    {
      label: "row 2: export aliased through an intermediate binding",
      rel: "lib/x/b.ts",
      src: '"use server";\nconst impl = async () => { await db.from("t").delete(); };\nconst alias = impl;\nexport { alias as doIt };\n',
      fn: "doIt",
    },
    {
      label: "row 5: OBJECT binding-pattern export",
      rel: "lib/x/c.ts",
      src: '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nexport const { doIt } = bag;\n',
      fn: "doIt",
    },
    {
      label: "row 6: ARRAY binding-pattern export",
      rel: "lib/x/d.ts",
      src: '"use server";\nconst arr = [async () => { await db.from("t").delete(); }];\nexport const [doIt] = arr;\n',
      fn: "doIt",
    },
  ];

  test.each(D1_CASES.map((c) => [c.label, c] as const))(
    "%s resolves to a module-action unit",
    (_l, c) => {
      const units = unitsFor(c.rel, c.src);
      expect(units.map((u) => [u.fn, u.kind])).toEqual([[c.fn, "module-action"]]);
      // the resolved node is the REAL body, not a stub or the specifier
      expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
    },
  );

  test("unresolvable initializer (higher-order call) yields NO unit — the refusal is totality's job", () => {
    const units = unitsFor(
      "lib/x/hof.ts",
      '"use server";\nexport const x = withFoo(async () => {});\n',
    );
    expect(units).toEqual([]);
  });

  test("COMPUTED binding property refuses even when it names a literal member (plan review R1 F3)", () => {
    const units = unitsFor(
      "lib/x/cp.ts",
      '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nexport const { ["doIt"]: doIt } = bag;\n',
    );
    expect(units).toEqual([]);
  });

  test("alias CYCLE yields no unit and does not hang", () => {
    const units = unitsFor(
      "lib/x/cy.ts",
      '"use server";\nconst a = b;\nconst b = a;\nexport { a as doIt };\nexport async function ok() { await db.from("t").delete(); }\n',
    );
    expect(units.map((u) => u.fn)).toEqual(["ok"]);
  });
});

// ── coverage repaid at source-mutation enrolment (2026-08-17) ───────────────
// Each case below was authored against a SURVIVING mutant from the first scored
// run. The failure mode named in each comment is the one its mutant demonstrates.

function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "mutation-surface-tree-"));
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
  return root;
}

// A NAMEABLE action: an anonymous one produces no unit whether or not the tree
// is walked, so it cannot tell a working filter from a broken one.
const VENDORED =
  '"use server";\nexport async function vendored() { await db.from("t").delete(); }\n';

describe("the walk's own boundaries", () => {
  test("vendored and build-output trees are NOT walked (node_modules, .next, .git)", () => {
    // walkSourceFiles skips none of these itself, so this filter is the only
    // thing between discovery and every dependency in node_modules.
    const root = makeTree({
      "lib/x/ok.ts":
        '"use server";\nexport async function mutate() { await db.from("t").delete(); }\n',
      "node_modules/pkg/vendored.ts": VENDORED,
      ".next/server/vendored.ts": VENDORED,
      ".git/hooks/vendored.ts": VENDORED,
    });
    expect(collectSurfaceUnits([root]).map((u) => u.fn)).toEqual(["mutate"]);
  });
});

describe("the directive prologue is read as a RUN, and only as a prologue", () => {
  test('"use strict" before "use server" is still a use-server module', () => {
    // The prologue scan must step OVER a non-matching directive, not stop at it.
    const units = unitsFor(
      "lib/x/pro.ts",
      '"use strict";\n"use server";\nexport async function mutate() { await db.from("t").delete(); }\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["mutate", "module-action"]]);
  });

  test("a bare string statement AFTER real code is not a directive", () => {
    // The scan must STOP at the first non-string statement. Without that stop it
    // finds `"use server"` anywhere in the body and calls the module an action
    // module — the false-positive direction.
    expect(
      unitsFor(
        "lib/x/late.ts",
        'const x = 1;\n"use server";\nexport async function mutate() { await db.from("t").delete(); }\n',
      ),
    ).toEqual([]);
  });
});

describe("scanBody's action scope stops at EVERY function-like kind", () => {
  const nested = (inner: string) => firstFn(IMP + `async function m(){ ${inner} }`);

  test("does not descend into a nested function EXPRESSION", () => {
    expect(
      scanBody(nested('const u = async function(){ await logAdminOutcome({code:"X"}); };'), {
        descend: false,
      }).adminOutcome,
    ).toBe(false);
  });

  test("does not descend into a nested ARROW", () => {
    expect(
      scanBody(nested('const u = async () => { await logAdminOutcome({code:"X"}); };'), {
        descend: false,
      }).adminOutcome,
    ).toBe(false);
  });

  test("does not descend into a nested object METHOD", () => {
    expect(
      scanBody(nested('const u = { async go(){ await logAdminOutcome({code:"X"}); } };'), {
        descend: false,
      }).adminOutcome,
    ).toBe(false);
  });

  test("does not descend into a nested CLASS declaration", () => {
    // The write is a PROPERTY INITIALIZER, not a method body: a method is caught
    // by the method arm of the same predicate, so it cannot tell whether the
    // class arm is doing anything.
    expect(
      scanBody(nested('class K { p = db.from("t").delete(); }'), { descend: false }).writeBuilder,
    ).toBe(false);
  });

  test("does not descend into a nested class EXPRESSION", () => {
    expect(
      scanBody(nested('const K = class { p = db.from("t").delete(); };'), { descend: false })
        .writeBuilder,
    ).toBe(false);
  });
});

describe("local-rebinding detection discriminates by NAME and by binder kind", () => {
  test("an unrelated local function declaration does NOT count as a rebind", () => {
    // Treating any local function declaration as a rebind would blind the floor
    // on every action that declares a helper.
    const src = IMP + 'async function m(){ function helper(){} log.info("x", { code:"FOO" }); }';
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(true);
  });

  test("a local function declaration NAMED log IS a rebind", () => {
    const src = IMP + 'async function m(){ function log(){} log.info("x", { code:"FOO" }); }';
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(false);
  });

  test("a catch clause binding a DIFFERENT name does not rebind log", () => {
    const src =
      IMP + 'async function m(){ try { doIt(); } catch (e) { log.error("x", { code:"FOO" }); } }';
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(true);
  });
});

describe("the code-field predicate reads the FIELD, not merely a SHOUTY string", () => {
  const coded = (obj: string) =>
    scanBody(firstFn(IMP + `async function m(){ log.info("x", ${obj}); }`), { descend: false })
      .codedLog;

  test("a SHOUTY value under a NON-code identifier key does not count", () => {
    expect(coded('{ source: "FOO" }')).toBe(false);
  });

  test("a SHOUTY value under a NON-code string-literal key does not count", () => {
    expect(coded('{ "source": "FOO" }')).toBe(false);
  });

  test('a string-literal "code" key DOES count', () => {
    expect(coded('{ "code": "FOO" }')).toBe(true);
  });

  test("a SHOUTY IDENTIFIER under `code` does not count — the value must be a literal", () => {
    expect(coded("{ code: SOMEVAR }")).toBe(false);
  });
});

describe("import-binding detection", () => {
  test("a namespace import of the log module binds nothing", () => {
    expect(
      importBindingOk(sf('import * as x from "@/lib/log";\nexport async function m(){}')).log,
    ).toBe(false);
  });

  test("logAdminOutcome imported from the WRONG module does not bind", () => {
    const r = importBindingOk(
      sf('import { logAdminOutcome } from "./fake";\nexport async function m(){}'),
    );
    expect(r.logAdminOutcome).toBe(false);
  });
});

describe("moduleDefaultExports discriminates default from ordinary exports", () => {
  test("a module with only NAMED exports has no default export", () => {
    const root = makeFixture("lib/x/named.ts", '"use server";\nexport async function mutate(){}\n');
    expect(moduleDefaultExports(parse(join(root, "lib/x/named.ts")))).toBe(false);
  });

  test("`export default` IS a default export even alongside named ones", () => {
    const root = makeFixture(
      "lib/x/both.ts",
      '"use server";\nexport async function mutate(){}\nexport default async function other(){}\n',
    );
    expect(moduleDefaultExports(parse(join(root, "lib/x/both.ts")))).toBe(true);
  });
});

describe("route method discovery discriminates export form, kind, and name", () => {
  const methods = (rel: string, src: string) =>
    routeMutatingMethods(parse(join(makeFixture(rel, src), rel)));

  test("an exported const handler is a route method", () => {
    expect(methods("app/api/a/route.ts", "export const POST = handler;\n")).toEqual(["POST"]);
  });

  test("a NON-exported function named POST is not a route method", () => {
    expect(methods("app/api/b/route.ts", "async function POST(){}\n")).toEqual([]);
  });

  test("an exported non-mutating method (GET) is not collected", () => {
    expect(methods("app/api/c/route.ts", "export async function GET(){}\n")).toEqual([]);
  });

  test("an exported const with a non-method name is not collected", () => {
    expect(
      methods("app/api/d/route.ts", "export const helper = 1;\nexport async function POST(){}\n"),
    ).toEqual(["POST"]);
  });

  test("`export * from` carries no named clause and is skipped, not crashed on", () => {
    expect(methods("app/api/e/route.ts", 'export * from "./impl";\n')).toEqual([]);
  });
});

describe("the D1 resolver's closed reductions, pinned reduction by reduction", () => {
  const resolveFixture = (rel: string, src: string) => {
    const root = makeFixture(rel, src);
    const units = collectSurfaceUnits([root]);
    return { units, gaps: discoveryGaps([root], units) };
  };
  /** `[fn, writes-in-own-scope]` — the second element is what proves the
   * resolver landed on the REAL body rather than some other node of the file. */
  const shape = (units: ReturnType<typeof collectSurfaceUnits>) =>
    units.map((u) => [u.fn, scanBody(u.node, { descend: false }).writeBuilder] as const);

  test("an exported CLASS resolves to no unit and is refused, not silently dropped", () => {
    const { units, gaps } = resolveFixture(
      "lib/x/cls.ts",
      '"use server";\nexport class Thing {}\nexport async function mutate() { await db.from("t").delete(); }\n',
    );
    expect(shape(units)).toEqual([["mutate", true]]);
    expect(gaps).toEqual([]);
  });

  test("a re-export WITH a module specifier is checked where declared, not here", () => {
    // Its body lives in the other module. Claiming it here would refuse a name
    // this file cannot resolve BY CONSTRUCTION, on every barrel in the tree.
    const { units, gaps } = resolveFixture(
      "lib/x/reexp.ts",
      '"use server";\nexport { doIt } from "./impl";\nexport async function mutate() { await db.from("t").delete(); }\n',
    );
    expect(shape(units)).toEqual([["mutate", true]]);
    expect(gaps).toEqual([]);
  });

  test("a FUNCTION EXPRESSION initializer is a checkable body", () => {
    const { units } = resolveFixture(
      "lib/x/fexpr.ts",
      '"use server";\nexport const mutate = async function () { await db.from("t").delete(); };\n',
    );
    expect(shape(units)).toEqual([["mutate", true]]);
  });

  test("the alias walk resolves the NAMED declaration, not the first one it passes", () => {
    const { units } = resolveFixture(
      "lib/x/alias2.ts",
      '"use server";\nasync function other() { return 1; }\nexport const mutate = async () => { await db.from("t").delete(); };\n',
    );
    expect(shape(units)).toEqual([["mutate", true]]);
  });

  test("an unrelated destructuring statement does not capture the resolution", () => {
    // A pattern that does not BIND the name must be stepped over. Consuming it
    // aborts the walk and the real declaration below is never reached.
    const { units } = resolveFixture(
      "lib/x/otherpat.ts",
      '"use server";\nconst { a } = bag;\nexport const doIt = async () => { await db.from("t").delete(); };\n',
    );
    expect(shape(units)).toEqual([["doIt", true]]);
  });

  test("an OBJECT pattern against an ARRAY literal refuses (kind mismatch)", () => {
    const { units, gaps } = resolveFixture(
      "lib/x/mismatch1.ts",
      '"use server";\nconst arr = [async () => { await db.from("t").delete(); }];\nexport const { doIt } = arr;\n',
    );
    expect(units).toEqual([]);
    expect(gaps).toHaveLength(1);
  });

  test("an ARRAY pattern against an OBJECT literal refuses (kind mismatch)", () => {
    const { units, gaps } = resolveFixture(
      "lib/x/mismatch2.ts",
      '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nexport const [doIt] = bag;\n',
    );
    expect(units).toEqual([]);
    expect(gaps).toHaveLength(1);
  });

  test("the matching object-pattern element is selected, not the first one", () => {
    const { units } = resolveFixture(
      "lib/x/twoprops.ts",
      '"use server";\nconst bag = { a: async () => { return 1; }, doIt: async () => { await db.from("t").delete(); } };\nexport const { a, doIt } = bag;\n',
    );
    expect(shape(units).sort()).toEqual([
      ["a", false],
      ["doIt", true],
    ]);
  });

  test("the matching object-LITERAL property is selected, not the first one", () => {
    const { units } = resolveFixture(
      "lib/x/twoprops2.ts",
      '"use server";\nconst bag = { other: async () => { return 1; }, doIt: async () => { await db.from("t").delete(); } };\nexport const { doIt } = bag;\n',
    );
    expect(shape(units)).toEqual([["doIt", true]]);
  });

  test("a DEFAULTED object-pattern element refuses", () => {
    const { units, gaps } = resolveFixture(
      "lib/x/objdefault.ts",
      '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nexport const { doIt = fallback } = bag;\n',
    );
    expect(units).toEqual([]);
    expect(gaps).toHaveLength(1);
  });

  test("a RENAMED object-pattern element resolves under the EXPORTED name", () => {
    const { units } = resolveFixture(
      "lib/x/rename.ts",
      '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nexport const { doIt: renamed } = bag;\n',
    );
    expect(shape(units)).toEqual([["renamed", true]]);
  });

  test("an object-literal METHOD member is a checkable body", () => {
    const { units } = resolveFixture(
      "lib/x/objmethod.ts",
      '"use server";\nconst bag = { async doIt() { await db.from("t").delete(); } };\nexport const { doIt } = bag;\n',
    );
    expect(shape(units)).toEqual([["doIt", true]]);
  });

  test("the matching METHOD member is selected, not the first one", () => {
    const { units } = resolveFixture(
      "lib/x/twomethods.ts",
      '"use server";\nconst bag = { async other() { return 1; }, async doIt() { await db.from("t").delete(); } };\nexport const { doIt } = bag;\n',
    );
    expect(shape(units)).toEqual([["doIt", true]]);
  });

  test("a SHORTHAND member resolves through the module-scope name it names", () => {
    const { units } = resolveFixture(
      "lib/x/shorthand.ts",
      '"use server";\nconst impl = async () => { await db.from("t").delete(); };\nconst bag = { impl };\nexport const { impl } = bag;\n',
    );
    expect(shape(units)).toEqual([["impl", true]]);
  });

  test("a NON-matching shorthand member is stepped over, not consumed", () => {
    const { units } = resolveFixture(
      "lib/x/shorthand2.ts",
      '"use server";\nconst other = 1;\nconst bag = { other, doIt: async () => { await db.from("t").delete(); } };\nexport const { doIt } = bag;\n',
    );
    expect(shape(units)).toEqual([["doIt", true]]);
  });

  test("an ARRAY HOLE in the pattern is stepped over", () => {
    const { units } = resolveFixture(
      "lib/x/hole.ts",
      '"use server";\nconst arr = [null, async () => { await db.from("t").delete(); }];\nexport const [, doIt] = arr;\n',
    );
    expect(shape(units)).toEqual([["doIt", true]]);
  });

  test("the matching array-pattern index is selected, not the first one", () => {
    const { units } = resolveFixture(
      "lib/x/twoidx.ts",
      '"use server";\nconst arr = [async () => { return 1; }, async () => { await db.from("t").delete(); }];\nexport const [a, doIt] = arr;\n',
    );
    expect(shape(units).sort()).toEqual([
      ["a", false],
      ["doIt", true],
    ]);
  });

  test("a DEFAULTED array-pattern element refuses", () => {
    const { units, gaps } = resolveFixture(
      "lib/x/arrdefault.ts",
      '"use server";\nconst arr = [async () => { await db.from("t").delete(); }];\nexport const [doIt = fallback] = arr;\n',
    );
    expect(units).toEqual([]);
    expect(gaps).toHaveLength(1);
  });

  test("a pattern index PAST the literal's length refuses rather than crashing", () => {
    const { units, gaps } = resolveFixture(
      "lib/x/past.ts",
      '"use server";\nconst arr = [async () => { await db.from("t").delete(); }];\nexport const [a, doIt] = arr;\n',
    );
    expect(shape(units)).toEqual([["a", true]]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain("`doIt`");
  });

  test("a DEFAULT export produces no unit and is refused by name", () => {
    // Ratified: a default-exported action is un-named and evades per-function
    // keying (spec §1.1.2). Refusing it is the designed outcome; producing a
    // unit for it would re-open exactly that hole.
    const { units, gaps } = resolveFixture(
      "lib/x/def.ts",
      '"use server";\nexport default async function mutate() { await db.from("t").delete(); }\n',
    );
    expect(units).toEqual([]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain("`mutate`");
  });

  test("one exported name produces at most ONE unit, even when declared twice", () => {
    const { units, gaps } = resolveFixture(
      "lib/x/dupname.ts",
      '"use server";\nasync function local() { await db.from("t").delete(); }\nexport const doIt = async () => { await db.from("t").insert(); };\nexport { local as doIt };\n',
    );
    expect(units.map((u) => u.fn)).toEqual(["doIt"]);
    expect(gaps).toEqual([]);
  });
});

describe("inline naming reads the nearest naming context, kind by kind", () => {
  const inlineFixture = (rel: string, src: string) => {
    const root = makeFixture(rel, src);
    const units = collectSurfaceUnits([root]);
    return { units, gaps: discoveryGaps([root], units) };
  };

  test("an inline named function DECLARATION is named by its own name", () => {
    const { units, gaps } = inlineFixture(
      "components/x/D1.tsx",
      'export function C() {\n  async function doIt() { "use server"; await db.from("t").delete(); }\n  return doIt;\n}\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "inline-action"]]);
    expect(gaps).toEqual([]);
  });

  test("an ANONYMOUS function expression is named by its binding, not crashed on", () => {
    const { units, gaps } = inlineFixture(
      "components/x/D2.tsx",
      'export function C() {\n  const doIt = async function () { "use server"; await db.from("t").delete(); };\n  return doIt;\n}\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "inline-action"]]);
    expect(gaps).toEqual([]);
  });

  test("an arrow assigned to an object PROPERTY is named by that property", () => {
    const { units, gaps } = inlineFixture(
      "components/x/D3.tsx",
      'export function C() {\n  const a = { doIt: async () => { "use server"; await db.from("t").delete(); } };\n  return a;\n}\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "inline-action"]]);
    expect(gaps).toEqual([]);
  });

  test("an ACCESSOR carrying the directive is named by its member name", () => {
    // Accessors are in the D2 domain because the predicate is `isFunctionLike`,
    // not a kind list — so the NAMING side has to cover them too, or the domain
    // widens without the accept-set following and every one becomes a refusal.
    const { units, gaps } = inlineFixture(
      "components/x/D4.tsx",
      'export class K {\n  set doIt(v) { "use server"; db.from("t").delete(); }\n}\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "inline-action"]]);
    expect(gaps).toEqual([]);
  });
});

describe("admin classification of ACTIONS reads the gate names, not merely a call", () => {
  test("a module action calling an ordinary helper is NOT admin", () => {
    // Treating any identifier call as a gate would mark nearly every action
    // admin, and the stricter admin contract would then demand registry rows
    // for crew surfaces that never had one.
    const units = unitsFor(
      "lib/x/plain.ts",
      '"use server";\nexport async function mutate(){ await doIt(); await db.from("t").delete(); }\n',
    );
    expect(units.map((u) => [u.fn, u.admin])).toEqual([["mutate", false]]);
  });

  test("a module action calling requireDeveloperIdentity IS admin", () => {
    const units = unitsFor(
      "lib/x/gated.ts",
      '"use server";\nexport async function mutate(){ await requireDeveloperIdentity(); await db.from("t").delete(); }\n',
    );
    expect(units.map((u) => [u.fn, u.admin])).toEqual([["mutate", true]]);
  });
});
