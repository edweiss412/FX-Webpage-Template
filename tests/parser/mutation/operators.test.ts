// tests/parser/mutation/operators.test.ts
import { describe, it, expect } from "vitest";
import {
  OPERATORS,
  OPERATOR_NAMES,
  boundedMutants,
  floorEligible,
  skippedInapplicable,
} from "./operators";
import { splitCells } from "./rows";
import { splitRow, clean } from "@/lib/parser/blocks/_helpers";

const CONSULTANTS_RUN = [
  "| DATES | DAY |",
  "| :---: | :---: |",
  "|  | Tuesday |",
  "|  |  |",
  "| CREW | NAME |",
  "|  | Doug Larson |",
  "|  | Eric Weiss |",
  "|  |  |",
  "| DRESS | Black Polo |",
].join("\n");

describe("operator inventory is complete (plan-R7)", () => {
  it("exactly the 9 expected operators are registered (8 corrupting + 1 cosmetic)", () => {
    expect(Object.keys(OPERATORS).sort()).toEqual(
      [
        "header-typo",
        "ref-sub",
        "unicode-inject",
        "column-shift",
        "blank-row:inject",
        "blank-row:remove",
        "merged-cell",
        "section-reorder",
        "trailing-whitespace",
      ].sort(),
    );
    expect([...OPERATOR_NAMES].sort()).toEqual(Object.keys(OPERATORS).sort()); // names ⟺ array keys
  });
  it("OPERATORS[op](md) is exactly the guarded stream materialized — no unguarded path (plan-R25)", () => {
    // Pins that the eager array form wraps `boundedMutants` (the budget-guarded stream), so any
    // fail-fast/O(1) guarantee proven for boundedMutants transitively holds for OPERATORS too —
    // there is NO unguarded enumeration path in the module.
    for (const op of OPERATOR_NAMES) {
      expect(OPERATORS[op]!(CONSULTANTS_RUN)).toEqual([...boundedMutants(op, CONSULTANTS_RUN)]);
    }
  });
});

describe("operator determinism + uniqueness", () => {
  it("every operator returns byte-distinct mutated markdown and unique siteIds", () => {
    for (const [name, op] of Object.entries(OPERATORS)) {
      const ms = op(CONSULTANTS_RUN);
      const ids = ms.map((m) => m.siteId);
      expect(new Set(ids).size, `${name} siteId collision`).toBe(ids.length);
      for (const m of ms) expect(m.md, `${name} no-op mutant`).not.toBe(CONSULTANTS_RUN);
    }
  });
});

describe("data-row-only exclusion (Codex R12)", () => {
  it("ref-sub never targets an alignment or spacer row", () => {
    for (const m of OPERATORS["ref-sub"]!(CONSULTANTS_RUN)) {
      expect(m.md).not.toMatch(/\| :?-+:? \| #REF! \|/); // never mutated the :---: row
    }
  });
});

describe("ref-sub skips already-#REF! cells — no byte-identical no-op (plan-R18)", () => {
  it("a cell already #REF! is not a site; only the real cell is mutated, none equal baseline", () => {
    const md = "| CREW | NAME | ROLE |\n|  | #REF! | Lead |"; // NAME already #REF!, ROLE=Lead
    const ms = OPERATORS["ref-sub"]!(md);
    expect(ms.length).toBe(1); // only ROLE=Lead is an eligible site
    expect(ms.every((m) => m.md !== md)).toBe(true); // no emitted mutant is byte-identical to baseline
  });
});

describe("blank-row:inject is per data-row gap, not per section (plan-R3)", () => {
  it("a section with 3 data rows yields 2 injection mutants with distinct siteIds", () => {
    const md = "| CREW | NAME |\n|  | Doug |\n|  | Eric |\n|  | Carl |";
    const ms = OPERATORS["blank-row:inject"]!(md);
    expect(ms).toHaveLength(2);
    expect(new Set(ms.map((m) => m.siteId)).size).toBe(2);
  });
});

describe("blank-row:remove deletes the FULL blank span so runs actually MERGE (Codex whole-diff R1)", () => {
  it("single-blank boundary: one mutant that removes the separator", () => {
    const md = "| CREW | NAME |\n|  | Doug |\n\n| TRANSPORTATION | NAME |\n|  | Carlos |";
    const ms = OPERATORS["blank-row:remove"]!(md);
    expect(ms).toHaveLength(1);
    // the two runs are now adjacent — no blank line survives between the CREW and TRANSPORTATION rows
    expect(ms[0]!.md).toBe(
      "| CREW | NAME |\n|  | Doug |\n| TRANSPORTATION | NAME |\n|  | Carlos |",
    );
  });
  it("multi-blank boundary: deleting ONE line would leave a separator — the mutant removes ALL blanks", () => {
    // TWO blank lines between the runs. A single-line deletion (the pre-fix bug) would leave one
    // blank, so the parser would still see two runs and the mutant would NOT test the merge.
    const md = "| CREW | NAME |\n|  | Doug |\n\n\n| TRANSPORTATION | NAME |\n|  | Carlos |";
    const ms = OPERATORS["blank-row:remove"]!(md);
    expect(ms).toHaveLength(1); // still exactly one boundary site
    // BOTH blank lines gone → the runs are truly fused (no residual blank separator)
    expect(ms[0]!.md).not.toMatch(/\n\s*\n/); // no blank-line separator anywhere
    expect(ms[0]!.md).toBe(
      "| CREW | NAME |\n|  | Doug |\n| TRANSPORTATION | NAME |\n|  | Carlos |",
    );
  });
});

describe("merged-cell is per interior pipe, not just the first (plan-R5)", () => {
  it("a 4-cell data row yields 3 merge mutants with distinct pipe loci", () => {
    const md = "| CREW | NAME | ROLE | PHONE |\n|  | Doug | Lead | 917 |"; // data row: ["", "Doug", "Lead", "917"] → 4 cells
    const ms = OPERATORS["merged-cell"]!(md);
    expect(ms).toHaveLength(3); // cells.length - 1
    expect(new Set(ms.map((m) => m.siteId)).size).toBe(3);
  });
});

describe("single-site invariant holds on ESCAPED-PIPE rows (plan-R14)", () => {
  it("mutating a NON-escaped cell leaves every other parser-space value (splitRow+clean) byte-identical", () => {
    // cell1 carries an escaped `\|` (fragments into 2 parser cells). Mutate cell0 (Hilton→#REF!)
    // and assert exactly ONE parser-space value changes — the raw-segment rewrite must not reshape
    // the escaped-pipe fragments in the untouched cells.
    const md = "| CREW | X |\n| Hilton | Gabriella \\| Events gd@hilton.com | Austin |";
    const before = splitRow(md.split("\n")[1]!).map(clean);
    const m = OPERATORS["ref-sub"]!(md).find((x) => x.md.includes("#REF!"))!;
    const after = splitRow(m.md.split("\n")[1]!).map(clean);
    expect(after.length).toBe(before.length); // no column count change
    expect(before.map((v, i) => v !== after[i]).filter(Boolean).length).toBe(1); // exactly one cell moved
  });
  it("merged-cell removes exactly one delimiter and preserves other segments byte-for-byte", () => {
    const md = "| A | Gabriella \\| Events | Austin |";
    const m = OPERATORS["merged-cell"]!(md)[0]!; // fuse cells 0,1
    expect((m.md.match(/\|/g) || []).length).toBe((md.match(/\|/g) || []).length - 1); // one fewer pipe
    expect(m.md).toContain("Austin"); // untouched tail cell present verbatim
  });
});

describe("section-reorder is exhaustive over adjacent block pairs (plan-R10)", () => {
  it("3 blocks yield 2 adjacent-pair swaps, INCLUDING the late (2nd–3rd) pair", () => {
    const md = "| CREW | NAME |\n|  | A |\n\n| HOTEL | G |\n|  | B |\n\n| DATES | D |\n|  | C |";
    const ms = OPERATORS["section-reorder"]!(md);
    expect(ms).toHaveLength(2); // (0,1) and (1,2)
    expect(new Set(ms.map((m) => m.siteId)).size).toBe(2);
    expect(ms.some((m) => m.siteId.includes("Xpair1"))).toBe(true); // the late pair is generated + will be parsed
  });
});

describe("column-shift requires a data row and is credited per logical section (Codex R11/R13)", () => {
  it("emits a crew-credited column-shift, none for a header/alignment-only section", () => {
    const ms = OPERATORS["column-shift"]!(CONSULTANTS_RUN);
    expect(ms.some((m) => m.domains.includes("crew"))).toBe(true);
    // DRESS section has only its header row + no data row → no column-shift site there
    expect(ms.every((m) => m.dataRowCount! >= 1)).toBe(true);
  });
  it("inserts a REAL empty leading cell so splitCells sees the shift (plan-R2)", () => {
    const md = "| CREW | NAME |\n|  | Doug Larson | 917 |";
    const m = OPERATORS["column-shift"]!(md)[0]!;
    const shiftedDataLine = m.md.split("\n").find((l) => l.includes("Doug Larson"))!;
    const cells = splitCells(shiftedDataLine);
    expect(cells[0]).toBe(""); // new empty leading cell
    expect(cells).toContain("Doug Larson"); // originals preserved, shifted right
    expect(cells.length).toBeGreaterThan(splitCells("|  | Doug Larson | 917 |").length - 1);
  });
});

describe("unicode-inject needs ≥2 scalar values (Codex R14)", () => {
  it("skips single-char cells", () => {
    const md = "| CREW | NAME |\n|  | A |"; // 'A' single char
    const ms = OPERATORS["unicode-inject"]!(md);
    expect(ms.every((m) => m.md !== md)).toBe(true); // any emitted are real
    // 'NAME' (header col1) is a header row cell → excluded; 'A' is 1-char → excluded ⇒ zero sites
    expect(ms).toHaveLength(0);
  });
});

describe("exhaustive generation + floor eligibility (plan-R2)", () => {
  it("every applicable site is generated (no cap) — a late section is still emitted", () => {
    const md = [
      ...Array.from({ length: 15 }, (_, i) => `| CLIENT | meta${i} |`).flatMap((h) => [
        h,
        "|  | v |",
        "",
      ]),
      "| CREW | NAME |",
      "|  | Doug Larson |",
    ].join("\n");
    // exhaustive: the late CREW section's ref-sub site is present in the FULL output.
    expect(OPERATORS["ref-sub"]!(md).some((m) => m.domains.includes("crew"))).toBe(true);
  });
  it("floorEligible over all generated mutants includes each present risk-critical domain that has sites", () => {
    const md = "| CREW | NAME |\n|  | Doug Larson |";
    expect(floorEligible(OPERATORS["ref-sub"]!(md)).has("crew")).toBe(true);
  });
});

describe("skippedInapplicable surfacing (Codex R5)", () => {
  it("a present risk-critical domain with no applicable site for an op is reported", () => {
    // A HOTEL section with only a 2-column data row → no merged-cell (needs ≥3 cells).
    const md = "| HOTEL | Kimpton |\n|  | 122 W Monroe |\n\n| CREW | NAME |\n|  | Doug | 917 | x |";
    expect(skippedInapplicable(md, "merged-cell")).toContain("hotel");
    expect(skippedInapplicable(md, "merged-cell")).not.toContain("crew"); // crew row has ≥3 cells
  });
});
