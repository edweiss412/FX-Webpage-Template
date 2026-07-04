import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import ts from "typescript";
import {
  scanBody,
  moduleHasUseServer,
  functionBodyHasUseServer,
  importBindingOk,
  parse,
  collectSurfaceUnits,
  moduleDefaultExports,
  routeMutatingMethods,
} from "./enumerate";

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
      scanBody(firstFn(IMP + 'async function m(){ if(ok){ await logAdminOutcome({code:"X"}); } }'), {
        descend: false,
      }).adminOutcome,
    ).toBe(true);
  });
  test("requireAdmin in body → adminGated true", () => {
    expect(
      scanBody(firstFn(IMP + 'async function m(){ await requireAdmin(); doIt(); }'), {
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
    const src = IMP + 'async function m(){ const log = { warn(){} }; log.warn("x", { code:"FOO" }); }';
    // scanBody must reject because the call's `log` is locally rebound
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(false);
  });
  test("real import but logAdminOutcome rebound → adminOutcome false", () => {
    const src =
      IMP + 'async function m(){ const logAdminOutcome = async () => {}; await logAdminOutcome({ code:"X" }); }';
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
      'export async function POST(){ await requireAdminIdentity(); doIt(); }\n',
    );
    const units = collectSurfaceUnits([root]);
    expect(units[0]!.admin).toBe(false);
  });
});
