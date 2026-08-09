// Spec §4 (docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md):
// #REF! is a broken-reference export artifact; the parser must SIGNAL it, never absorb
// it silently. Present in 3 of the 7 live shows, so this is observed reality, not a
// synthetic worry: the operator sees a crew page reading "#REF!" where a name or a time
// belongs, and nothing upstream said so.
//
// Failure modes these arms catch:
//  - raw-text matching that misses the ESCAPED corpus form (`\#REF\!`, which clean() unescapes)
//  - duplicate warnings when one cell fans out into several derived fields
//  - per-OCCURRENCE rather than per-CELL emission
//  - a hard-fail regression (spec §1.1.4: warn, never hard-fail)
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseSheet } from "@/lib/parser";
import { premiseHolds } from "@/tests/_shared/premise";

const refWarnings = (md: string, name: string) =>
  parseSheet(md, name).warnings.filter((w) => w.code === "REF_ERROR_LITERAL");

describe("REF_ERROR_LITERAL (spec §4)", () => {
  it("premise: the corpus carries the escaped form", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/consultants.md", "utf8");
    premiseHolds("consultants fixture carries escaped #REF!", md.includes("\\#REF\\!"));
  });

  it("detects a bare #REF! cell injected into a clean fixture (operator shape)", () => {
    const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
    premiseHolds("east-coast raw fixture is #REF-free", !md.includes("#REF"));
    // rewrite the first eligible data cell to the bare literal, mirroring refSub (operators.ts:70)
    const lines = md.split("\n");
    const i = lines.findIndex((l) => l.startsWith("|") && !/^\|\s*:?-+/.test(l));
    const cells = lines[i]!.split("|");
    cells[1] = " #REF! ";
    lines[i] = cells.join("|");
    const w = refWarnings(lines.join("\n"), "east-coast.md");
    expect(w).toHaveLength(1);
    expect(w[0]!.severity).toBe("warn");
    expect(w[0]!.rawSnippet).toContain("#REF!");
    // retro F2: kind is a canonical KIND_TO_SECTION routing key or the literal
    // "section" fallback, NEVER raw cell text.
    expect(w[0]!.blockRef?.kind).toBe("section");
  });

  it("detects the ESCAPED corpus form - per-fixture counts pinned (probe §13.A)", () => {
    const expected: Record<string, number> = {
      "fixtures/shows/exporter-xlsx/consultants.md": 6,
      "fixtures/shows/exporter-xlsx/fintech.md": 5,
      "fixtures/shows/exporter-xlsx/fixed-income.md": 5,
      "fixtures/shows/exporter-xlsx/rpas.md": 5,
      "fixtures/shows/raw/2025-10-consultants-roundtable.md": 3,
    };
    for (const [path, n] of Object.entries(expected)) {
      expect(refWarnings(readFileSync(path, "utf8"), path), path).toHaveLength(n);
    }
  });

  it("a cell containing #REF! twice warns ONCE (per-cell dedup, isolated)", () => {
    // r1 F5: isolate dedup on a synthetic cell with TWO occurrences in one cell -
    // the per-fixture pins above cannot distinguish per-cell from per-occurrence.
    const md = "| CLIENT | x |\n| range | #REF! - #REF! |";
    expect(refWarnings(md, "synthetic.md")).toHaveLength(1);
  });

  it("does not hard-fail: hardErrors unchanged by detection", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/consultants.md", "utf8");
    const clean = parseSheet(md.replaceAll("\\#REF\\!", "placeholder"), "consultants.md");
    expect(parseSheet(md, "consultants.md").hardErrors).toEqual(clean.hardErrors);
  });
});
