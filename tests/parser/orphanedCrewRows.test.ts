// Spec 2026-07-27-export-blank-row-segmentation §6 T4/T5 — ORPHANED_CREW_ROWS.
// Positives cover every corpus crew-row shape (east-coast name-embedded,
// rpas boolean-column, fixed-income bare, registry-token name collisions in both
// cases); negatives pin the probe-4/5 false-positive classes so a discriminator
// loosening fails loud. Assertions extract from parseSheet().warnings filtered
// by code — the data source, never rendered output.
import { describe, it, expect } from "vitest";
import { parseSheet } from "@/lib/parser";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const table = (rows: string[]): string => {
  const width = rows[0]!.split("|").length - 2;
  const delim = `| ${Array.from({ length: width }, () => ":---:").join(" | ")} |`;
  return [rows[0]!, delim, ...rows.slice(1)].join("\n");
};

const orphanWarnings = (md: string) =>
  parseSheet(md, "orphan-test.md").warnings.filter((w) => w.code === "ORPHANED_CREW_ROWS");

const CREW_HEADER = table([
  "| CREW | NAME | ROLE | PHONE | EMAIL |",
  "|  | Doug Larson | - Load In / Set / Strike / Load Out - LEAD |  |  |",
]);

describe("ORPHANED_CREW_ROWS positives (spec §6 T4)", () => {
  it("east-coast shape: role text embedded in the name cell, phone column", () => {
    const md = [
      CREW_HEADER,
      table([
        "| Carl Fenton - Load In/Set/Strike/Load Out - V1 | 914-224-8834 | JFK-FLL | FLL-JFK |",
      ]),
    ].join("\n\n");
    const w = orphanWarnings(md);
    expect(w).toHaveLength(1);
    expect(w[0]!.severity).toBe("warn");
    expect(w[0]!.blockRef?.kind).toBe("crew");
    expect(w[0]!.rawSnippet).toBe("Carl Fenton - Load In/Set/Strike/Load Out - V1");
  });

  it("rpas shape: empty col0, role cell, boolean column", () => {
    const md = [
      CREW_HEADER,
      table(["|  | John Carleo | - Load In / Set / Strike / Load Out - V1 |  |  | TRUE |"]),
    ].join("\n\n");
    const w = orphanWarnings(md);
    expect(w).toHaveLength(1);
    expect(w[0]!.rawSnippet).toBe("John Carleo");
  });

  it("fixed-income shape: name + role cell only, no phone, no boolean", () => {
    const md = [
      CREW_HEADER,
      table(["|  | DJ Johnson | - Load In / Set / Strike / Load Out - V1 |  |  |"]),
    ].join("\n\n");
    expect(orphanWarnings(md)).toHaveLength(1);
  });

  it("mixed-case registry-token name is not suppressed (Driver Jones)", () => {
    const md = [
      CREW_HEADER,
      table(["| Driver Jones | - Load In / Set / Strike / Load Out - V1 | 555-000-1111 |"]),
    ].join("\n\n");
    expect(orphanWarnings(md)).toHaveLength(1);
  });

  it("ALL-CAPS registry-token name is not suppressed (DRIVER JONES; exact-only suppression)", () => {
    const md = [
      CREW_HEADER,
      table(["| DRIVER JONES | - Load In / Set / Strike / Load Out - V1 |  |"]),
    ].join("\n\n");
    expect(orphanWarnings(md)).toHaveLength(1);
  });

  it("de-dup: the same orphan tail twice emits once", () => {
    const tail = table([
      "|  | Doug Larson | - Load In / Set / Strike / Load Out - LEAD |  |  | TRUE |",
    ]);
    const md = [CREW_HEADER, tail, tail].join("\n\n");
    expect(orphanWarnings(md)).toHaveLength(1);
  });

  it("de-dup key is the truncated first LINE: same line-1, different &#10; suffixes emit once", () => {
    const md = [
      CREW_HEADER,
      table(["| Doug Larson&#10;A | - Load In / Set / Strike / Load Out - LEAD |"]),
      table(["| Doug Larson&#10;B | - Load In / Set / Strike / Load Out - LEAD |"]),
    ].join("\n\n");
    expect(orphanWarnings(md)).toHaveLength(1);
  });
});

describe("ORPHANED_CREW_ROWS negatives (spec §6 T5)", () => {
  const cases: Array<[string, string]> = [
    ["GS Strike Time single-token row", table(["| GS Strike Time | 10/9 @ 4:30pm |"])],
    ["Setup / Load In label with boolean", table(["| Setup / Load In Date / Time | FALSE |"])],
    [
      "standalone ROLE-legend tail (single-cell rows)",
      table(["| - Load In / Set / Strike / Load Out - LEAD |"]),
    ],
    [
      "DRESS row as tail-first (exact raw-uppercase suppression)",
      table(["| DRESS | Set/Strike: Black Pants, Black Polo Shirt, Black Footwear |"]),
    ],
    [
      "legacy Drive-MCP fused header (role-cell arm: only one token per cell)",
      table([
        "| TRANSPORTATION/Load In: | TRANSPORTATION/Tracy Edwards | PHONE/484-547-6433 | EMAIL/tedwards8033@gmail.com | LICENSE |",
      ]),
    ],
    [
      "consultants agenda row (two single-token cells)",
      table(["|  | TRAVEL / SET | Tuesday | 10/7/25 | 9:00PM - LOAD IN&#10;10:00PM - SETUP |"]),
    ],
    [
      "multiline agenda cell (tokens on separate lines)",
      table(["| Day 3 | 8:00AM - LOAD IN&#10;5:00PM - LOAD OUT |"]),
    ],
    [
      "escaped-pipe role cell (parser pipe split decomposes it; documented residual)",
      table(["| Doug Larson | Load In \\| Set \\| Strike |"]),
    ],
  ];
  for (const [name, block] of cases) {
    it(name, () => {
      expect(orphanWarnings([CREW_HEADER, block].join("\n\n"))).toHaveLength(0);
    });
  }

  it("intact CREW table emits nothing", () => {
    expect(orphanWarnings(CREW_HEADER)).toHaveLength(0);
  });
});

describe("ORPHANED_CREW_ROWS catalog literals (spec §3.4; fields no gate freezes)", () => {
  it("title, longExplanation, helpHref match the spec byte-for-byte", () => {
    const entry = MESSAGE_CATALOG.ORPHANED_CREW_ROWS as unknown as Record<string, string>;
    expect(entry.title).toBe("Some crew rows came loose from their section");
    expect(entry.longExplanation).toBe(
      "A blank row inside the crew section splits the roster into two pieces, and the piece below the blank row loses its connection to the CREW header. Those rows were not read as crew, so the crew members on them may be missing from their pages. Remove the blank row in the sheet and the roster will read as one section again.",
    );
    expect(entry.helpHref).toBe("/help/errors#ORPHANED_CREW_ROWS");
  });
});

// Codex whole-diff r1 F3: newline-shape edge cases in the orphan scan.
describe("ORPHANED_CREW_ROWS newline edge cases (whole-diff r1 F3)", () => {
  it("a &#10;-only first cell does not suppress the orphan (tok comes from the next cell)", () => {
    const md = [
      CREW_HEADER,
      table(["| &#10; | Doug Larson | - Load In / Set / Strike / Load Out - V1 |"]),
    ].join("\n\n");
    const w = orphanWarnings(md);
    expect(w).toHaveLength(1);
    expect(w[0]!.rawSnippet).toBe("Doug Larson");
  });

  it("bare-CR separated role tokens stay on separate lines: single-token lines are NOT a role cell", () => {
    const md = [CREW_HEADER, table(["| Jane Doe | - Load In -\r- Set - | 555-000-1111 |"])].join(
      "\n\n",
    );
    expect(orphanWarnings(md)).toHaveLength(0);
  });
});
