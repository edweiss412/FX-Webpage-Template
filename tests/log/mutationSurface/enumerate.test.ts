import { describe, expect, test } from "vitest";
import ts from "typescript";
import { scanBody, moduleHasUseServer, functionBodyHasUseServer, importBindingOk } from "./enumerate";

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
