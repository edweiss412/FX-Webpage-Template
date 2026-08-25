import { readFileSync } from "node:fs";

import { remark } from "remark";
import remarkGfm from "remark-gfm";

import { describe, expect, it } from "vitest";

import {
  acCommandPlan,
  checkAcCoverage,
  citedTestPins,
  pinUnobserved,
} from "../../lib/specLint/acCoverage";
import { acKey } from "../../lib/specLint/types";
import { viewOf } from "./acCoverageView";

/** Codes the arm may emit, per spec §8.2. AC-13 pins this against the spec. */
const CODES = [
  "AC_COVERAGE_MALFORMED",
  "AC_COVERAGE_NO_TABLE",
  "AC_COVERAGE_COL_OUT_OF_RANGE",
  "AC_COVERAGE_EMPTY_TABLE",
  "AC_COVERAGE_NOT_A_PLAN",
  "AC_COMMAND_CELL_NOT_RUNNABLE",
  "AC_COMMAND_UNPARSABLE",
  "AC_COMMAND_PIN_UNOBSERVED",
  "AC_COMMAND_PARSE_UNOBSERVED",
] as const;

/**
 * The catalog AS THE SPEC STATES IT, read from the spec document.
 *
 * AC-13's assertion compared `CODES` to itself — `expect([...CODES].sort())
 * .toEqual([...CODES].sort())` — and read no spec at all, so adding, removing or
 * renaming a catalog entry could not fail it (whole-diff review round 2 finding
 * 2). Both sides are now derived from OUTSIDE this file: one from the spec's
 * section 8.2 table, one from the arm's own source. `CODES` above is asserted
 * against them rather than standing in for either.
 */
const SPEC = "docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md";
const specCatalogCodes = (): string[] => {
  const rows = [
    ...readFileSync(SPEC, "utf8").matchAll(/^\| `(AC_[A-Z_]+)` \| (fail|advisory) \|/gm),
  ];
  return rows.map((m) => m[1]!).sort();
};

/** The codes the ARM can actually emit, read from its source. */
const sourceEmittedCodes = (): string[] => {
  const src = readFileSync("lib/specLint/acCoverage.ts", "utf8");
  return [...new Set([...src.matchAll(/"(AC_[A-Z_]+)"/g)].map((m) => m[1]!))].sort();
};

const codesOf = (md: string, kind: "spec" | "plan" = "plan"): string[] =>
  checkAcCoverage(viewOf(md), kind).map((f) => f.code);

const TABLE = ["| AC | Proved by | Cmd |", "| --- | --- | --- |", "| AC-1 | T | `a` |"].join("\n");

describe("acCoverage — the declaration", () => {
  it("a well-formed declaration over a well-formed table draws nothing", () => {
    expect(codesOf(`<!-- ac-coverage: command-col=3 -->\n\n${TABLE}\n`)).toEqual([]);
  });

  it("a declaration-shaped line that is not the grammar is AC_COVERAGE_MALFORMED", () => {
    expect(codesOf(`<!-- ac-coverage: col=3 -->\n\n${TABLE}\n`)).toEqual(["AC_COVERAGE_MALFORMED"]);
  });

  it("command-col=0 is rejected by the grammar, not by a range check", () => {
    expect(codesOf(`<!-- ac-coverage: command-col=0 -->\n\n${TABLE}\n`)).toEqual([
      "AC_COVERAGE_MALFORMED",
    ]);
  });

  it("a declaration with no table after it is AC_COVERAGE_NO_TABLE", () => {
    expect(codesOf("<!-- ac-coverage: command-col=3 -->\n\njust prose\n")).toEqual([
      "AC_COVERAGE_NO_TABLE",
    ]);
  });

  it("blank lines between the declaration and its table are irrelevant", () => {
    expect(codesOf(`<!-- ac-coverage: command-col=3 -->\n\n\n\n${TABLE}\n`)).toEqual([]);
  });

  it("command-col beyond the header's width is AC_COVERAGE_COL_OUT_OF_RANGE", () => {
    expect(codesOf(`<!-- ac-coverage: command-col=9 -->\n\n${TABLE}\n`)).toEqual([
      "AC_COVERAGE_COL_OUT_OF_RANGE",
    ]);
  });

  it("a declared table with a header and no data rows is AC_COVERAGE_EMPTY_TABLE", () => {
    const empty = ["| AC | Proved by | Cmd |", "| --- | --- | --- |"].join("\n");
    expect(codesOf(`<!-- ac-coverage: command-col=3 -->\n\n${empty}\n`)).toEqual([
      "AC_COVERAGE_EMPTY_TABLE",
    ]);
  });

  it("a declaration in a spec-kind document is AC_COVERAGE_NOT_A_PLAN, never silence", () => {
    expect(codesOf(`<!-- ac-coverage: command-col=3 -->\n\n${TABLE}\n`, "spec")).toEqual([
      "AC_COVERAGE_NOT_A_PLAN",
    ]);
  });

  it("a spec-kind declaration governs NO table — the code alone does not prove that", () => {
    // The assertion above passes whether or not the declaration still BINDS its
    // table, because the code is pushed before the binding search either way.
    // Deleting the `continue` that ends the not-a-plan branch leaves the code in
    // place and starts governing the table anyway, so a spec would silently be
    // parse-checked. Pin the binding itself: a spec plans no spawn at all.
    const md = `<!-- ac-coverage: command-col=3 -->\n\n${TABLE}\n`;
    expect(acCommandPlan(viewOf(md), "spec")).toEqual([]);
    expect(acCommandPlan(viewOf(md), "plan")).toHaveLength(1);
  });

  it("a declaration inside a fence is inert BY CONSTRUCTION — remark yields no html node", () => {
    const fenced = ["```", "<!-- ac-coverage: command-col=3 -->", "```", "", TABLE].join("\n");
    expect(codesOf(fenced)).toEqual([]);
  });

  it("two consecutive declarations do NOT both bind to one table", () => {
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "<!-- ac-coverage: command-col=2 -->",
      "",
      TABLE,
    ].join("\n");
    // The first is followed by a declaration, not a table, so it reports; the
    // second governs, and the table's column 2 holds "T" with no code span. The
    // SECOND code is what proves the second declaration is the one applied:
    // without the proviso both bind, and column 3 (`a`) would report nothing
    // while column 2 reported, so the pair would be indistinguishable from one
    // declaration governing badly.
    expect(codesOf(md)).toEqual(["AC_COVERAGE_NO_TABLE", "AC_COMMAND_CELL_NOT_RUNNABLE"]);
  });

  it("several declarations each govern their own table", () => {
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      TABLE,
      "",
      "<!-- ac-coverage: command-col=9 -->",
      "",
      TABLE,
    ].join("\n");
    expect(codesOf(md)).toEqual(["AC_COVERAGE_COL_OUT_OF_RANGE"]);
  });

  it("a document with no declaration draws nothing and reads no tables", () => {
    expect(codesOf(`${TABLE}\n`)).toEqual([]);
  });

  it("plans EVERY command-carrying span of a cell, not just the first", () => {
    // Kills the first-span mutant. The every-span rule is otherwise observable
    // only through AC_COMMAND_UNPARSABLE, which needs the adapter's outcomes, so
    // without this the restriction survives every pure test.
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | Proved by | Cmd |",
      "| --- | --- | --- |",
      "| AC-1 | T | `one`; `two`; `three` |",
    ].join("\n");
    const plan = acCommandPlan(viewOf(md), "plan");
    expect(plan.map((e) => e.command)).toEqual(["one", "two", "three"]);
    expect(plan.map((e) => e.spanIndex)).toEqual([0, 1, 2]);
    // One line, three entries: a line-keyed store would hold one of them.
    expect(new Set(plan.map((e) => e.line)).size).toBe(1);
  });

  it("a blank or comment-only span carries no command and is not planned", () => {
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | Proved by | Cmd |",
      "| --- | --- | --- |",
      "| AC-1 | T | `# both red commands above` |",
    ].join("\n");
    expect(acCommandPlan(viewOf(md), "plan")).toEqual([]);
    expect(codesOf(md)).toEqual(["AC_COMMAND_CELL_NOT_RUNNABLE"]);
  });

  it("a short row is reported and contributes NO spawn entry", () => {
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | Proved by | Cmd |",
      "| --- | --- | --- |",
      "| AC-1 | T |",
    ].join("\n");
    expect(codesOf(md)).toEqual(["AC_COVERAGE_COL_OUT_OF_RANGE"]);
    expect(acCommandPlan(viewOf(md), "plan")).toEqual([]);
  });

  it("governs a NESTED table, because a reader's next table is the nested one", () => {
    // Blocks are flattened into document order, so a table inside a blockquote or
    // a list item participates. Top-level-only iteration would bind PAST it to
    // the next one down, which is a silently different table.
    const quoted = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "> | AC | P | Cmd |",
      "> | --- | --- | --- |",
      "> | AC-1 | T | prose |",
      "",
      TABLE,
    ].join("\n");
    expect(codesOf(quoted)).toEqual(["AC_COMMAND_CELL_NOT_RUNNABLE"]);
  });

  it("a row with MORE cells than the header is checked, not skipped", () => {
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | P | Cmd |",
      "| --- | --- | --- |",
      "| AC-1 | T | `a` | extra |",
    ].join("\n");
    expect(codesOf(md)).toEqual([]);
  });

  it("a MIS-declaration reports on every row rather than guessing what was meant", () => {
    // command-col=1 points at the AC id column. The arm cannot tell a
    // mis-declaration from a table full of defects and does not try (spec L-4);
    // the declaration is deliberate and the fix is to remove it.
    expect(codesOf(`<!-- ac-coverage: command-col=1 -->\n\n${TABLE}\n`)).toEqual([
      "AC_COMMAND_CELL_NOT_RUNNABLE",
    ]);
  });

  it("an UNOBSERVED parse outcome is advisory, never a hard unparsable", () => {
    // A spawn error, a signal or a timeout does not OBSERVE parseability.
    // Reading one as a non-zero exit would accuse the author of a malformed
    // command on the strength of an infra fault, which is the silent-corruption
    // direction `classifySpawnResult` exists to prevent.
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | P | Cmd |",
      "| --- | --- | --- |",
      "| AC-1 | T | `a` |",
    ].join("\n");
    const blocks = viewOf(md);
    const line = 5;
    for (const outcome of [
      { kind: "spawn-error", message: "no exit status" },
      { kind: "timeout" },
      { kind: "signal", signal: "SIGKILL" },
    ] as const) {
      const found = checkAcCoverage(blocks, "plan", {
        outcomes: new Map([[acKey(line, 0), outcome]]),
      });
      expect(found.map((f) => [f.code, f.severity])).toEqual([
        ["AC_COMMAND_PARSE_UNOBSERVED", "advisory"],
      ]);
    }
    // and a real non-zero EXIT still reports hard
    expect(
      checkAcCoverage(blocks, "plan", {
        outcomes: new Map([[acKey(line, 0), { kind: "exit", code: 2 } as const]]),
      }).map((f) => [f.code, f.severity]),
    ).toEqual([["AC_COMMAND_UNPARSABLE", "fail"]]);
  });

  it("anchors every finding at column 1, and carries a detail only when it has one", () => {
    // Kills integer-literal:column and equality-flip:detail. Neither the column
    // nor the presence of `detail` was asserted anywhere, so both could move
    // without a single case noticing — and the renderer prints both.
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | P | Cmd |",
      "| --- | --- | --- |",
      "| AC-1 | T | prose |",
    ].join("\n");
    const [f, ...rest] = checkAcCoverage(viewOf(md), "plan");
    expect(rest).toEqual([]);
    expect(f!.column).toBe(1);
    expect(f!.detail).toBe("cell: prose");

    // and the complement: a declaration-level finding carries NO detail, so the
    // conditional spread is exercised in both directions.
    const noTable = checkAcCoverage(
      viewOf("<!-- ac-coverage: command-col=3 -->\n\nprose\n"),
      "plan",
    );
    expect(noTable).toHaveLength(1);
    expect(noTable[0]!.column).toBe(1);
    expect(noTable[0]!.detail).toBeUndefined();
  });

  it("tolerates 0 to 3 spaces of declaration indent, and 4 is inert by CommonMark", () => {
    // remark preserves 0-3 leading spaces in an html node's value; at 4 there is
    // no html node at all, because CommonMark makes it an indented code block.
    // That is the whole live domain of the `^ {0,3}` bound.
    const table = ["| AC | P | Cmd |", "| --- | --- | --- |", "| AC-1 | T | prose |"].join("\n");
    for (const indent of ["", " ", "  ", "   "]) {
      expect(
        checkAcCoverage(
          viewOf(`${indent}<!-- ac-coverage: command-col=3 -->\n\n${table}\n`),
          "plan",
        ),
        `indent ${indent.length} must be read as a declaration`,
      ).toHaveLength(1);
    }
    expect(
      checkAcCoverage(viewOf(`    <!-- ac-coverage: command-col=3 -->\n\n${table}\n`), "plan"),
      "indent 4 is a code block, so there is no declaration to read",
    ).toEqual([]);
  });

  it("AC-13: every code the arm can emit is in the spec's catalog and vice versa", () => {
    // Both sides read from OUTSIDE this file, so the assertion can fail: the spec's
    // section 8.2 table, and the arm's own source. A catalog entry added, removed or
    // renamed on either side now reds this test.
    const fromSpec = specCatalogCodes();
    const fromSource = sourceEmittedCodes();
    expect(fromSpec.length).toBeGreaterThanOrEqual(9); // the table was found and parsed at all
    expect(fromSource).toEqual(fromSpec);
    // and the convenience list used by the rest of this file agrees with both
    expect([...CODES].sort()).toEqual(fromSpec);
    expect(new Set(CODES).size).toBe(CODES.length);
  });
});

describe("acCoverage — the skips and boundaries the arm depends on", () => {
  it("a pin at index 0 is OBSERVED — nothing is read before the start of the string", () => {
    // `i === 0 ? "" : commandText[i - 1]` exists so the first character has no
    // predecessor. Read the predecessor anyway and you get `commandText[-1]`,
    // which is `undefined`; `PATH_CHAR.test(undefined)` is TRUE because the
    // regex stringifies it to "undefined". The boundary then looks like a path
    // character, the pin reads as unobserved, and a correct row draws a false
    // advisory. This is the ONLY position where that branch is exercised.
    expect(pinUnobserved("tests/a.test.ts --run", "tests/a.test.ts")).toBe(false);
    // and the ordinary interior position still behaves
    expect(pinUnobserved("pnpm vitest run tests/a.test.ts", "tests/a.test.ts")).toBe(false);
    // a superstring is NOT an observation, at index 0 or anywhere else
    expect(pinUnobserved("tests/a.test.tsx", "tests/a.test.ts")).toBe(true);
  });

  it.each([
    ["an inline link", "[driver](tests/paneCompaction/driver.test.ts:72)"],
    ["a reference link", "[driver][ref]"],
    ["an image", "![driver](tests/paneCompaction/driver.test.ts:72)"],
    ["a raw HTML anchor", '<a href="tests/paneCompaction/driver.test.ts:72">driver</a>'],
    ["bare text", "tests/paneCompaction/driver.test.ts:72"],
  ])("sees a pin cited as %s, not just as bare text", (_label, cell) => {
    // The cell view collected `text` and `inlineCode` only, so a link reduced to
    // its LABEL and the destination was dropped: a row citing its criterion's
    // pin as an ordinary Markdown link read as citing nothing, and the advisory
    // could never fire on it (whole-diff review round 2 finding 1). Writing a
    // pin as a link is ordinary authoring, so that was a silent miss. Every form
    // here is a regression case; `bare text` is the control that always worked,
    // and it is present so a repair that broke it would fail rather than pass.
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | Pin | Cmd |",
      "| --- | --- | --- |",
      `| AC-14 | ${cell} | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |`,
      "",
      "[ref]: tests/paneCompaction/driver.test.ts:72",
    ].join("\n");
    const view = viewOf(md);
    const plan = acCommandPlan(view, "plan");
    const parse = {
      outcomes: new Map(
        plan.map((e) => [acKey(e.line, e.spanIndex), { kind: "exit" as const, code: 0 }]),
      ),
    };
    expect(checkAcCoverage(view, "plan", parse).map((f) => f.code)).toContain(
      "AC_COMMAND_PIN_UNOBSERVED",
    );
  });

  it("collects EVERY string mdast carries in the cell, not an enumerated list of fields", () => {
    // THE CLASS, not another instance. Four rounds each found one more field the
    // view dropped -- link destinations (r2), duplicate-definition precedence and
    // `imageReference` alt (r3), titles on all four title-bearing forms (r4) --
    // because an enumeration of text-bearing fields is always one field behind the
    // format. The view now DEFAULT-INCLUDES: a string reaches the scan unless its
    // key is structural. This asserts that property against the nodes remark
    // actually produces, so a regression to enumeration fails here rather than
    // being found by a fifth round.
    const STRUCTURAL = new Set(["type", "referenceType", "align", "lang", "meta", "checked"]);
    const cell = '[a](u1 "t1") ![b](u2 "t2") [c][r1] ![d][r2] `code` <a href="h1">e</a> plain';
    const md = [
      "<!-- ac-coverage: command-col=2 -->",
      "",
      "| AC | Pin |",
      "| --- | --- |",
      `| AC-1 | ${cell} |`,
      "",
      '[r1]: u3 "t3"',
      '[r2]: u4 "t4"',
    ].join("\n");
    const root = remark().use(remarkGfm).parse(md);
    // Scope the walk to the ROW UNDER TEST plus the definitions it resolves
    // through. An earlier version walked the whole document and reported the
    // header cell as "dropped" -- a defect in the assertion's extraction, not in
    // the view, and exactly the scoping mistake the anti-tautology rule warns
    // about in the other direction.
    type Nodeish = { type: string; children?: unknown[] };
    const kids = root.children as unknown as Nodeish[];
    const tableNode = kids.find((n) => n.type === "table")!;
    const bodyRow = tableNode.children![1];
    const defNodes = kids.filter((n) => n.type === "definition");

    // every non-structural string on every node inside that row and its definitions
    const strings: string[] = [];
    const walk = (n: unknown): void => {
      if (typeof n !== "object" || n === null) return;
      for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
        if (typeof v === "string" && v !== "" && !STRUCTURAL.has(k)) strings.push(v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (typeof v === "object" && v !== null) walk(v);
      }
    };
    [bodyRow, ...defNodes].forEach(walk);
    expect(strings.length).toBeGreaterThanOrEqual(12); // the fixture exercises many fields

    const view = viewOf(md);
    const table = view.find((b) => b.kind === "table");
    const seen =
      table && table.kind === "table" ? table.rows[0]!.cells.map((c) => c.text).join(" ") : "";
    const dropped = [...new Set(strings)].filter((v) => !seen.includes(v));
    expect(dropped, `strings mdast carries but the view dropped: ${dropped.join(", ")}`).toEqual(
      [],
    );
  });

  it("takes the FIRST duplicate reference definition, as CommonMark renders it", () => {
    // `Map.set` per definition took the LAST one, so the arm inspected a different
    // destination than the document RENDERS: the row visibly cited the required
    // test while the scan read some other URL, which is a silent WRONG ACCEPT
    // rather than a miss (round 3 finding 1). Both reference-bearing node types
    // are covered, because the defect was in the shared resolver.
    for (const cell of ["[driver][ref]", "![driver][ref]"]) {
      const md = [
        "<!-- ac-coverage: command-col=3 -->",
        "",
        "| AC | Pin | Cmd |",
        "| --- | --- | --- |",
        `| AC-14 | ${cell} | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |`,
        "",
        "[ref]: tests/paneCompaction/driver.test.ts:72",
        "[ref]: docs/other.md:1",
      ].join("\n");
      const view = viewOf(md);
      const plan = acCommandPlan(view, "plan");
      const parse = {
        outcomes: new Map(
          plan.map((e) => [acKey(e.line, e.spanIndex), { kind: "exit" as const, code: 0 }]),
        ),
      };
      expect(checkAcCoverage(view, "plan", parse).map((f) => f.code)).toContain(
        "AC_COMMAND_PIN_UNOBSERVED",
      );
    }
  });

  it("sees a pin written as reference-image ALT text", () => {
    // `image` carried its alt and `imageReference` did not, so a pin that renders
    // visibly was invisible to the scan (round 3 finding 2) — the same omission
    // one node type over, which a class sweep should have caught the first time.
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | Pin | Cmd |",
      "| --- | --- | --- |",
      "| AC-14 | ![tests/paneCompaction/driver.test.ts:72][icon] | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |",
      "",
      "[icon]: public/icon.png",
    ].join("\n");
    const view = viewOf(md);
    const plan = acCommandPlan(view, "plan");
    const parse = {
      outcomes: new Map(
        plan.map((e) => [acKey(e.line, e.spanIndex), { kind: "exit" as const, code: 0 }]),
      ),
    };
    expect(checkAcCoverage(view, "plan", parse).map((f) => f.code)).toContain(
      "AC_COMMAND_PIN_UNOBSERVED",
    );
  });

  it("a pin the command DOES name stays silent through every citation form", () => {
    // The other half: the repair must not make every linked pin draw. Same forms,
    // command now naming the cited file.
    for (const cell of [
      "[driver](tests/paneCompaction/driver.test.ts:72)",
      "![driver](tests/paneCompaction/driver.test.ts:72)",
      '<a href="tests/paneCompaction/driver.test.ts:72">driver</a>',
    ]) {
      const md = [
        "<!-- ac-coverage: command-col=3 -->",
        "",
        "| AC | Pin | Cmd |",
        "| --- | --- | --- |",
        `| AC-14 | ${cell} | \`pnpm vitest run tests/paneCompaction/driver.test.ts\` |`,
      ].join("\n");
      const view = viewOf(md);
      const plan = acCommandPlan(view, "plan");
      const parse = {
        outcomes: new Map(
          plan.map((e) => [acKey(e.line, e.spanIndex), { kind: "exit" as const, code: 0 }]),
        ),
      };
      expect(checkAcCoverage(view, "plan", parse).map((f) => f.code)).not.toContain(
        "AC_COMMAND_PIN_UNOBSERVED",
      );
    }
  });

  it("a malformed pin candidate is skipped before anything reads its path", () => {
    // `tests/x.test.ts:0` matches PIN_CANDIDATE (it has `:` and digits) but
    // classifies as MALFORMED, because 0 is not a line number -- so it carries no
    // `path` at all. The guard's `continue` is what stops the next line reading
    // `cls.path.startsWith(...)` on `undefined` and throwing. A test that only
    // feeds well-formed citations never reaches that.
    expect(citedTestPins([{ text: "see tests/x.test.ts:0", codes: [] }])).toEqual([]);
    // the well-formed neighbour still resolves, so the skip is not over-broad
    expect(citedTestPins([{ text: "see tests/x.test.ts:12", codes: [] }])).toEqual([
      "tests/x.test.ts",
    ]);
  });

  it("a row with no command draws NOT_RUNNABLE alone, never also an unobserved pin", () => {
    // With no command there is no command text, so the pin check would compare
    // every cited pin against the empty string and call all of them unobserved.
    // The `continue` after NOT_RUNNABLE is what prevents that second, false
    // accusation on a row already reported for the real defect.
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | Proved by | Cmd |",
      "| --- | --- | --- |",
      "| AC-1 | `tests/a.test.ts:12` | prose, not a command |",
    ].join("\n");
    expect(codesOf(md)).toEqual(["AC_COMMAND_CELL_NOT_RUNNABLE"]);
  });

  it("acCommandPlan is emitted in document order, which is why it needs no sort", () => {
    // Tables come in document order, rows in document order, and `spanIndex` is
    // assigned by `forEach`, so the result is ordered when it is built. A sort
    // stood here and could not reorder anything; this pins the property it was
    // pretending to provide, over two tables and multi-span rows.
    const md = [
      "<!-- ac-coverage: command-col=2 -->",
      "",
      "| AC | Cmd |",
      "| --- | --- |",
      "| AC-1 | `a` and `b` |",
      "| AC-2 | `c` |",
      "",
      "<!-- ac-coverage: command-col=2 -->",
      "",
      "| AC | Cmd |",
      "| --- | --- |",
      "| AC-3 | `d` and `e` |",
    ].join("\n");
    const plan = acCommandPlan(viewOf(md), "plan");
    expect(plan.map((e) => `${e.line}#${e.spanIndex}:${e.command}`)).toEqual([
      "5#0:a",
      "5#1:b",
      "6#0:c",
      "12#0:d",
      "12#1:e",
    ]);
  });
});
