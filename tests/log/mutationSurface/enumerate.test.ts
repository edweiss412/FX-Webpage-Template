import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
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

/**
 * Scratch roots this file creates, removed together in `afterAll`.
 *
 * `afterAll` rather than per-case: vitest runs it even when a case fails, and a
 * cleanup that only runs on success leaks exactly when a suite is being
 * debugged, which is when it runs most. Guard:
 * `tests/mutation/_metaScratchRootCleanup.test.ts`. Row:
 * BL-MUTATION-SCRATCH-FS-EVENT-STORM.
 */
const scratchRoots: string[] = [];
function trackScratch(root: string): string {
  scratchRoots.push(root);
  return root;
}
afterAll(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
  scratchRoots.length = 0;
});

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
  const root = trackScratch(mkdtempSync(join(tmpdir(), "mutation-surface-")));
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
  const root = trackScratch(mkdtempSync(join(tmpdir(), "mutation-surface-tree-")));
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

  // The D1 domain reads NAMES, so it must be total over exported declaration
  // KINDS. Round-1 review probed three that an earlier kind list omitted; each
  // was silently absent from BOTH the unit set and the refusal set.
  test.each([
    ["class", "export class Thing {}", "Thing"],
    ["enum", "export enum Thing { A }", "Thing"],
    ["namespace", "export namespace Thing { export const a = 1; }", "Thing"],
  ])("an exported %s is refused by name, not silently dropped", (_kind, decl, name) => {
    const { units, gaps } = resolveFixture(
      "lib/x/kind.ts",
      `"use server";\n${decl}\nexport async function mutate() { await db.from("t").delete(); }\n`,
    );
    expect(shape(units)).toEqual([["mutate", true]]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain(`\`${name}\``);
  });

  test("an ANONYMOUS default export contributes no name and does not crash the reader", () => {
    // It has no name to be addressed by, so it cannot be a D1 member. It is not
    // silently absent either: a `"use server"` module with ANY default export
    // fails by name in the observability walk's sibling check
    // (`tests/log/_metaMutationSurfaceObservability.test.ts:190`).
    const root = makeFixture(
      "lib/x/anondefault.ts",
      '"use server";\nexport default async function () { await db.from("t").delete(); }\n',
    );
    const units = collectSurfaceUnits([root]);
    expect(units).toEqual([]);
    expect(discoveryGaps([root], units)).toEqual([]);
    expect(moduleDefaultExports(parse(join(root, "lib/x/anondefault.ts")))).toBe(true);
  });

  test("an OVERLOAD signature does not become the action body", () => {
    // The signature is a bodyless FunctionDeclaration carrying the same name.
    // Binding the export to it produced a unit with nothing to scan while the
    // real implementation was never reached — silently wrong, not refused.
    const { units, gaps } = resolveFixture(
      "lib/x/overload.ts",
      '"use server";\nexport async function mutate(a: string): Promise<void>;\nexport async function mutate(a: unknown) { await db.from("t").delete(); }\n',
    );
    expect(shape(units)).toEqual([["mutate", true]]);
    expect(gaps).toEqual([]);
  });

  test("an object literal carrying a SPREAD refuses — the spread can replace the member", () => {
    const { units, gaps } = resolveFixture(
      "lib/x/objspread.ts",
      '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); }, ...other };\nexport const { doIt } = bag;\n',
    );
    expect(units).toEqual([]);
    expect(gaps).toHaveLength(1);
  });

  test("an object literal carrying a COMPUTED member refuses — it can override the match", () => {
    const { units, gaps } = resolveFixture(
      "lib/x/objcomputed.ts",
      '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); }, [key]: other };\nexport const { doIt } = bag;\n',
    );
    expect(units).toEqual([]);
    expect(gaps).toHaveLength(1);
  });

  test("an array literal carrying a SPREAD refuses — every later index shifts", () => {
    const { units, gaps } = resolveFixture(
      "lib/x/arrspread.ts",
      '"use server";\nconst arr = [...xs, async () => { await db.from("t").delete(); }];\nexport const [doIt] = arr;\n',
    );
    expect(units).toEqual([]);
    expect(gaps).toHaveLength(1);
  });

  test("an UNRESOLVABLE object member value refuses rather than crashing", () => {
    // `fetch` has no module-scope declaration, so the reduction yields nothing.
    // The guard must short-circuit BEFORE the checkable-function test rather
    // than lean on a downstream re-check that is never reached.
    const { units, gaps } = resolveFixture(
      "lib/x/objunres.ts",
      '"use server";\nconst bag = { doIt: fetch };\nexport const { doIt } = bag;\n',
    );
    expect(units).toEqual([]);
    expect(gaps).toHaveLength(1);
  });

  test("an UNRESOLVABLE array member value refuses rather than crashing", () => {
    const { units, gaps } = resolveFixture(
      "lib/x/arrunres.ts",
      '"use server";\nconst arr = [fetch];\nexport const [doIt] = arr;\n',
    );
    expect(units).toEqual([]);
    expect(gaps).toHaveLength(1);
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

// ---------------------------------------------------------------------------
// Diff review round 2. Two shapes, both "silently absent from BOTH sides".
// ---------------------------------------------------------------------------

describe("a module binding that can differ at export time is REFUSED, not resolved stale (round 2, finding 1)", () => {
  // The resolver reads the declaration a static walk reaches first. When the
  // binding is written afterwards, that node is not the body that runs, so the
  // unit pointed at dead code and `scanBody` read the wrong scope -- silently,
  // because a unit WAS produced and the refusal ledger stayed empty. The repair
  // is NARROWING: refuse the name. Modelling assignment order would be a
  // grammar, and a bigger target every round.
  test("`let` reassigned after its initializer produces no unit", () => {
    expect(
      unitsFor(
        "lib/x/reassign.ts",
        '"use server";\nlet doIt = async () => {};\ndoIt = async () => { await db.from("t").delete(); };\nexport { doIt };\n',
      ),
    ).toEqual([]);
  });

  test("`var` redeclared produces no unit (the second declaration is what runs)", () => {
    expect(
      unitsFor(
        "lib/x/redeclare.ts",
        '"use server";\nvar doIt = async () => {};\nvar doIt = async () => { await db.from("t").delete(); };\nexport { doIt };\n',
      ),
    ).toEqual([]);
  });

  test("an ALIAS hop whose target is reassigned produces no unit", () => {
    expect(
      unitsFor(
        "lib/x/aliasreassign.ts",
        '"use server";\nlet impl = async () => {};\nimpl = async () => { await db.from("t").delete(); };\nconst doIt = impl;\nexport { doIt };\n',
      ),
    ).toEqual([]);
  });

  test("a destructured holder mutated by a PROPERTY write produces no unit", () => {
    // `const` protects the binding, not the object: `bag.doIt = other` replaces
    // the member the literal appears to fix. The holder name is an alias hop,
    // so the same check catches it.
    expect(
      unitsFor(
        "lib/x/holderwrite.ts",
        '"use server";\nconst bag = { doIt: async () => {} };\nbag.doIt = async () => { await db.from("t").delete(); };\nexport const { doIt } = bag;\n',
      ),
    ).toEqual([]);
  });

  test("an ELEMENT write to the holder produces no unit", () => {
    expect(
      unitsFor(
        "lib/x/elemwrite.ts",
        '"use server";\nconst bag = { doIt: async () => {} };\nbag["doIt"] = async () => { await db.from("t").delete(); };\nexport const { doIt } = bag;\n',
      ),
    ).toEqual([]);
  });

  test("a COMPOUND assignment is a write (`??=`, the reachable one on an action)", () => {
    expect(
      unitsFor(
        "lib/x/compound.ts",
        '"use server";\nlet doIt = async () => {};\ndoIt ??= async () => { await db.from("t").delete(); };\nexport { doIt };\n',
      ),
    ).toEqual([]);
  });

  test("the LAST assignment operator (`^=`) is a write too", () => {
    // Boundary of the operator range, not a plausible edit: it exists so the
    // range's upper bound cannot be narrowed without a test noticing.
    expect(
      unitsFor(
        "lib/x/caret.ts",
        '"use server";\nlet doIt = async () => {};\ndoIt ^= 1;\nexport { doIt };\n',
      ),
    ).toEqual([]);
  });

  test("an increment is a write", () => {
    expect(
      unitsFor(
        "lib/x/incr.ts",
        '"use server";\nlet doIt = async () => {};\ndoIt++;\nexport { doIt };\n',
      ),
    ).toEqual([]);
  });

  test("a parenthesized assignment `(doIt) = ...` is a write", () => {
    // `(x) = f` is a legal assignment, so the parens must not hide the write.
    expect(
      unitsFor(
        "lib/x/parenwrite.ts",
        '"use server";\nlet doIt = async () => {};\n(doIt) = async () => { await db.from("t").delete(); };\nexport { doIt };\n',
      ),
    ).toEqual([]);
  });

  test("NEGATIVE: the name used as a SUBSCRIPT is not a write to it", () => {
    // `registry[doIt] = 1` writes `registry`, not `doIt`. Ascending here would
    // refuse an ordinary correct export.
    const units = unitsFor(
      "lib/x/subscript.ts",
      '"use server";\nconst doIt = async () => { await db.from("t").delete(); };\nconst registry: Record<string, number> = {};\nregistry[doIt] = 1;\nexport { doIt };\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
  });

  test("NEGATIVE: the name READ in a binary expression is not a write", () => {
    const units = unitsFor(
      "lib/x/readbinary.ts",
      '"use server";\nconst doIt = async () => { await db.from("t").delete(); };\nconst enabled = doIt !== undefined;\nexport { doIt };\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
  });

  test("NEGATIVE: a non-increment unary (`!doIt`) is not a write", () => {
    const units = unitsFor(
      "lib/x/readunary.ts",
      '"use server";\nconst doIt = async () => { await db.from("t").delete(); };\nconst missing = !doIt;\nexport { doIt };\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
  });

  test("NEGATIVE: an unrelated function declaration does not refuse THIS name", () => {
    // The rebinding scan must compare names. Treating every function
    // declaration as a rebind would refuse any action in a file with a helper.
    const units = unitsFor(
      "lib/x/tally.ts",
      '"use server";\nexport async function doIt() { await db.from("t").delete(); }\nfunction helper() { return 1; }\nhelper = helper;\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
  });

  test("NEGATIVE: a same-named LOCAL assignment does NOT refuse the export", () => {
    // The false-advisory case. Refusing here would fire on correct code, which
    // is the failure this design is most exposed to.
    const units = unitsFor(
      "lib/x/localshadow.ts",
      '"use server";\nexport const doIt = async () => { await db.from("t").delete(); };\nfunction helper() { let doIt = 1; doIt = 2; return doIt; }\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
    expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
  });

  test("NEGATIVE: an ordinary single-declaration const export still resolves", () => {
    const units = unitsFor(
      "lib/x/stable.ts",
      '"use server";\nconst doIt = async () => { await db.from("t").delete(); };\nexport { doIt };\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
    expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
  });

  test("NEGATIVE: an overload pair is ONE definition, not a redeclaration", () => {
    // The bodyless signature must not count toward the declaration tally, or
    // round 1's overload repair would regress into a refusal.
    const units = unitsFor(
      "lib/x/overload.ts",
      '"use server";\nexport async function doIt(a: string): Promise<void>;\nexport async function doIt(a: unknown): Promise<void> { await db.from("t").delete(); }\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
    expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
  });
});

const parseSrc = (src: string) => {
  const rel = "lib/x/parsed.ts";
  return parse(join(makeFixture(rel, src), rel));
};

describe("the stability rule is IMMUTABILITY, not write detection (round 3)", () => {
  // Round 3 attacked the write detector one write FORM per finding -- member
  // writes, destructuring assignment, `for..of` targets, `Object.assign`,
  // `Reflect.set`, `defineProperty`, `splice`. Enumerating write APIs does not
  // terminate, so the repair goes the other way: a name resolves only when its
  // binding CANNOT be rebound, and a holder literal resolves only when nothing
  // else in the file can reach it. Neither question mentions a write form.

  test("a `let` binding is refused even with no write at all", () => {
    // The documented limit this rule buys: `let` refuses, and the refusal names
    // the export and says to bind it directly. `const` is the remediation.
    expect(
      unitsFor(
        "lib/x/letnowrite.ts",
        '"use server";\nlet doIt = async () => { await db.from("t").delete(); };\nexport { doIt };\n',
      ),
    ).toEqual([]);
  });

  test("a `var` binding is refused even with no write at all", () => {
    expect(
      unitsFor(
        "lib/x/varnowrite.ts",
        '"use server";\nvar doIt = async () => { await db.from("t").delete(); };\nexport { doIt };\n',
      ),
    ).toEqual([]);
  });

  test("NEGATIVE: a property write on the ACTION does not refuse it (`doIt.displayName`)", () => {
    // `fn.displayName = "..."` is ordinary and leaves the body untouched. The
    // round-2 member-chain ascent refused it -- a false advisory on correct
    // code (round 3, finding 2).
    const units = unitsFor(
      "lib/x/displayname.ts",
      '"use server";\nexport const doIt = async () => { await db.from("t").delete(); };\ndoIt.displayName = "doIt";\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
    expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
  });

  test("NEGATIVE: an element write on the ACTION does not refuse it", () => {
    const units = unitsFor(
      "lib/x/elemprop.ts",
      '"use server";\nexport async function doIt() { await db.from("t").delete(); }\ndoIt["tag"] = 1;\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
  });

  test("a function declaration REBOUND by array destructuring is refused", () => {
    // A function declaration's binding is mutable, so it still needs the
    // target check -- but the check is over TARGET POSITIONS, which are closed,
    // not over write APIs, which are not.
    expect(
      unitsFor(
        "lib/x/fnarraydestr.ts",
        '"use server";\nexport async function doIt() {}\n[doIt] = [async () => { await db.from("t").delete(); }];\n',
      ),
    ).toEqual([]);
  });

  test("a function declaration REBOUND by object destructuring is refused", () => {
    expect(
      unitsFor(
        "lib/x/fnobjdestr.ts",
        '"use server";\nexport async function doIt() {}\n({ doIt } = bag);\n',
      ),
    ).toEqual([]);
  });

  test("a function declaration REBOUND by a `for..of` head is refused", () => {
    expect(
      unitsFor(
        "lib/x/fnforof.ts",
        '"use server";\nexport async function doIt() {}\nfor (doIt of impls) { break; }\n',
      ),
    ).toEqual([]);
  });

  test("a function declaration REBOUND through an `as` wrapper is refused", () => {
    expect(
      unitsFor(
        "lib/x/fnaswrap.ts",
        '"use server";\nexport async function doIt() {}\n(doIt as never) = other;\n',
      ),
    ).toEqual([]);
  });

  test("a holder the file can still REACH is refused (`Object.assign`)", () => {
    // No `Object.assign` case exists in the resolver. The holder is refused
    // because something OTHER than the destructuring mentions it, whatever that
    // something does.
    expect(
      unitsFor(
        "lib/x/holderassign.ts",
        '"use server";\nconst bag = { doIt: async () => {} };\nObject.assign(bag, { doIt: async () => { await db.from("t").delete(); } });\nexport const { doIt } = bag;\n',
      ),
    ).toEqual([]);
  });

  test("a holder that is itself EXPORTED is refused", () => {
    expect(
      unitsFor(
        "lib/x/holderexported.ts",
        '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nexport { bag };\nexport const { doIt } = bag;\n',
      ),
    ).toEqual([]);
  });

  test("NEGATIVE: a holder referenced ONLY by the destructuring still resolves", () => {
    const units = unitsFor(
      "lib/x/holderpristine.ts",
      '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nexport const { doIt } = bag;\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
    expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
  });
});

describe("the rebinding scan and the holder rule, mutant by mutant (round 3)", () => {
  const FN = '"use server";\nexport async function doIt() { await db.from("t").delete(); }\n';

  test("a plain `=` rebind of a function declaration is refused", () => {
    expect(unitsFor("lib/x/fnplain.ts", FN + "doIt = other;\n")).toEqual([]);
  });

  test("the LAST assignment operator (`^=`) rebinds too", () => {
    expect(unitsFor("lib/x/fncaret.ts", FN + "doIt ^= 1;\n")).toEqual([]);
  });

  test("an increment rebinds a function declaration", () => {
    expect(unitsFor("lib/x/fnincr.ts", FN + "doIt++;\n")).toEqual([]);
  });

  test("a KEYED object-destructuring target rebinds (`({ k: doIt } = obj)`)", () => {
    expect(unitsFor("lib/x/fnkeyed.ts", FN + "({ k: doIt } = obj);\n")).toEqual([]);
  });

  test("a DEFAULTED array-destructuring target rebinds (`[doIt = f] = xs`)", () => {
    expect(unitsFor("lib/x/fndefault.ts", FN + "[doIt = fallback] = xs;\n")).toEqual([]);
  });

  test("NEGATIVE: a default VALUE is not a target (`[other = doIt] = xs`)", () => {
    // The right side of a destructuring default is read, not bound. Descending
    // into it would refuse an action merely used as a fallback.
    expect(unitsFor("lib/x/fndefaultval.ts", FN + "[other = doIt] = xs;\n").length).toBe(1);
  });

  test("NEGATIVE: a property KEY is not a target (`({ doIt: other } = obj)`)", () => {
    expect(unitsFor("lib/x/fnkeyname.ts", FN + "({ doIt: other } = obj);\n").length).toBe(1);
  });

  test("a rebind INSIDE a function still refuses (a function is not a shadow)", () => {
    // `shadowsName` must require a DECLARATION, not merely a function boundary.
    expect(unitsFor("lib/x/fninside.ts", FN + "function f() { doIt = other; }\n")).toEqual([]);
  });

  test("NEGATIVE: a DESTRUCTURED parameter shadow is a different binding", () => {
    expect(
      unitsFor("lib/x/fnparampat.ts", FN + "function f({ doIt }: { doIt: number }) { doIt = 1; }\n")
        .length,
    ).toBe(1);
  });

  test("a `var` in a NESTED function does not shadow the outer rebind", () => {
    // `var` hoists to ITS OWN function, so the nested declaration says nothing
    // about the assignment in the outer one -- which is still a rebind.
    expect(
      unitsFor(
        "lib/x/fnnestedvar.ts",
        FN + "function f() { function g() { var doIt = 1; return doIt; } doIt = other; }\n",
      ),
    ).toEqual([]);
  });

  test("NEGATIVE: `const` wins even in a file that also declares functions", () => {
    // The rebind scan runs only for a function-declaration binding. A `const`
    // is immutable whatever else the file contains.
    const units = unitsFor(
      "lib/x/constwins.ts",
      '"use server";\nexport const doIt = async () => { await db.from("t").delete(); };\nfunction helper() { return 1; }\ndoIt = other;\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
  });

  test("NEGATIVE: a COMPARISON is not an assignment (`doIt === other`)", () => {
    expect(unitsFor("lib/x/fncompare.ts", FN + "const same = doIt === other;\n").length).toBe(1);
  });

  test("NEGATIVE: a non-increment unary is not a rebind (`!doIt`)", () => {
    expect(unitsFor("lib/x/fnnotunary.ts", FN + "const missing = !doIt;\n").length).toBe(1);
  });

  test("NEGATIVE: a CLASS MEMBER named like the holder is not a reference to it", () => {
    // A class member's name labels the member, not the holder binding. Counting
    // it as a reference refuses a correct holder.
    const units = unitsFor(
      "lib/x/holderclassmember.ts",
      '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nclass C { bag = 1; }\nexport const { doIt } = bag;\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
  });

  test("NEGATIVE: an object-literal KEY named like the holder is not a reference", () => {
    const units = unitsFor(
      "lib/x/holderobjkey.ts",
      '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nconst other = { bag: 1 };\nexport const { doIt } = bag;\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
  });

  test("a PARENTHESIZED holder is still checked for reachability", () => {
    expect(
      unitsFor(
        "lib/x/holderparen.ts",
        '"use server";\nconst bag = { doIt: async () => {} };\nbag.doIt = async () => { await db.from("t").delete(); };\nexport const { doIt } = (bag);\n',
      ),
    ).toEqual([]);
  });

  test("NEGATIVE: a holder whose literal is PARENTHESIZED still resolves", () => {
    const units = unitsFor(
      "lib/x/holderparenlit.ts",
      '"use server";\nconst bag = ({ doIt: async () => { await db.from("t").delete(); } });\nexport const { doIt } = bag;\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
  });

  test("NEGATIVE: an ARRAY holder resolves", () => {
    const units = unitsFor(
      "lib/x/holderarray.ts",
      '"use server";\nconst bag = [async () => { await db.from("t").delete(); }];\nexport const [doIt] = bag;\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
  });

  test("a holder with NO module declaration (imported) is refused", () => {
    expect(
      unitsFor(
        "lib/x/holderimported.ts",
        '"use server";\nimport { bag } from "./b";\nexport const { doIt } = bag;\n',
      ),
    ).toEqual([]);
  });

  test("a holder bound by a PATTERN is refused (the declaration is not a name)", () => {
    expect(
      unitsFor(
        "lib/x/holderpattern.ts",
        '"use server";\nconst [bag] = pairs;\nexport const { doIt } = bag;\n',
      ),
    ).toEqual([]);
  });

  test("NEGATIVE: the holder's OWN declaration is the one read, not another name's", () => {
    // The declaration scan must match on the holder's name. Taking any
    // identifier-named declaration reads a different initializer, and a
    // non-literal one refuses a correct holder.
    const units = unitsFor(
      "lib/x/holderpicks.ts",
      '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nconst zzz = makeThing();\nexport const { doIt } = bag;\n',
    );
    expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "module-action"]]);
  });
});

describe("a shadow in ANY enclosing scope is a different binding (round 3, finding 1)", () => {
  // The shadow test walks every ancestor and reads declaration names
  // GENERICALLY. A kind list missed setter parameters, loop heads, unbraced
  // switch cases, hoisted nested `var`, class declarations and namespace
  // blocks, and each miss was a REFUSAL fired on correct code.
  const stable = (rel: string, extra: string) =>
    unitsFor(
      rel,
      '"use server";\nexport async function doIt() { await db.from("t").delete(); }\n' + extra,
    );

  test("a `for..of` loop head shadow does not refuse the export", () => {
    expect(
      stable("lib/x/shloop.ts", "function f(xs: number[]) { for (let doIt of xs) { doIt = 1; } }\n")
        .length,
    ).toBe(1);
  });

  test("a classic `for` head shadow does not refuse the export", () => {
    expect(
      stable("lib/x/shfor.ts", "function f() { for (let doIt = 0; doIt < 2; doIt++) {} }\n").length,
    ).toBe(1);
  });

  test("a SETTER parameter shadow does not refuse the export", () => {
    expect(
      stable("lib/x/shsetter.ts", "class C { set v(doIt: number) { doIt = 1; } }\n").length,
    ).toBe(1);
  });

  test("a CONSTRUCTOR parameter shadow does not refuse the export", () => {
    expect(
      stable("lib/x/shctor.ts", "class C { constructor(doIt: number) { doIt = 1; } }\n").length,
    ).toBe(1);
  });

  test("an unbraced switch-case shadow does not refuse the export", () => {
    expect(
      stable(
        "lib/x/shswitch.ts",
        "function f(k: number) { switch (k) { case 1: let doIt = 1; doIt = 2; } }\n",
      ).length,
    ).toBe(1);
  });

  test("a namespace-block shadow does not refuse the export", () => {
    expect(stable("lib/x/shns.ts", "namespace N { let doIt = 1; doIt = 2; }\n").length).toBe(1);
  });

  test("a nested-function `var` shadow does not refuse the export", () => {
    expect(
      stable("lib/x/shvar.ts", "function f() { if (true) { var doIt = 1; } doIt = 2; }\n").length,
    ).toBe(1);
  });

  test("a catch-clause shadow does not refuse the export", () => {
    expect(
      stable("lib/x/shcatch.ts", "function f() { try { g(); } catch (doIt) { doIt = 1; } }\n")
        .length,
    ).toBe(1);
  });
});

describe("`export { x as default }` is a DEFAULT export (round 2, finding 2)", () => {
  // The ratified contract is: a default-exported action produces NO unit and IS
  // refused by name. The export-clause form hard-coded `isDefault: false`, so
  // it produced a unit keyed `default` and passed the module-level ban.
  test("`as default` produces no unit", () => {
    expect(
      unitsFor(
        "lib/x/clausedefault.ts",
        '"use server";\nconst doIt = async () => { await db.from("t").delete(); };\nexport { doIt as default };\n',
      ),
    ).toEqual([]);
  });

  test('`as "default"` (string form) produces no unit', () => {
    expect(
      unitsFor(
        "lib/x/clausedefaultstr.ts",
        '"use server";\nconst doIt = async () => { await db.from("t").delete(); };\nexport { doIt as "default" };\n',
      ),
    ).toEqual([]);
  });

  test("`as default` trips moduleDefaultExports, so the module-level ban fires", () => {
    const src = '"use server";\nconst doIt = async () => {};\nexport { doIt as default };\n';
    expect(moduleDefaultExports(parseSrc(src))).toBe(true);
  });

  test('`as "default"` trips moduleDefaultExports', () => {
    const src = '"use server";\nconst doIt = async () => {};\nexport { doIt as "default" };\n';
    expect(moduleDefaultExports(parseSrc(src))).toBe(true);
  });

  test("`export { default } from` (re-export) trips moduleDefaultExports", () => {
    expect(moduleDefaultExports(parseSrc('"use server";\nexport { default } from "./m";\n'))).toBe(
      true,
    );
  });

  test("`export * as default from` trips moduleDefaultExports", () => {
    expect(moduleDefaultExports(parseSrc('"use server";\nexport * as default from "./m";\n'))).toBe(
      true,
    );
  });

  test("NEGATIVE: an ordinary export clause does NOT trip the default ban", () => {
    expect(
      moduleDefaultExports(
        parseSrc('"use server";\nconst doIt = async () => {};\nexport { doIt };\n'),
      ),
    ).toBe(false);
  });

  test("NEGATIVE: a re-export of a NAMED symbol does not trip the ban", () => {
    expect(moduleDefaultExports(parseSrc('"use server";\nexport { doIt } from "./m";\n'))).toBe(
      false,
    );
  });

  test("NEGATIVE: a type-only `default` export clause is not a value default export", () => {
    expect(
      moduleDefaultExports(parseSrc('"use server";\nexport type { T as default } from "./m";\n')),
    ).toBe(false);
  });
});
