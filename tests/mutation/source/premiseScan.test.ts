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
