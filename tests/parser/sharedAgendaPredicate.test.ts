/**
 * tests/parser/sharedAgendaPredicate.test.ts (agenda Phase B, Task 11)
 *
 * The §4.5.1 ordinal correlation is sound only if parseAgendaLinks and
 * getAgendaChips select the SAME rows. Both route through the single shared
 * predicate `isAgendaLinkRow`, so a blank-value / label-only / template row is
 * excluded by BOTH and the two ordered sequences stay aligned 1:1 — a stray INFO
 * row can never silently suppress every chip PDF (the Codex round-3 failure mode).
 *
 * Primary (behavioral): feed equivalent INFO data — `[valid, blank-value, valid]` —
 * to both paths and assert each yields exactly the 2 non-blank entries in the same
 * order. Supplement (structural): pin that both call sites import the shared predicate.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/drive/client", () => ({ getDriveAuth: () => ({}) }));

const sheetsSpreadsheetsGet = vi.fn();
vi.mock("googleapis", () => ({
  google: {
    drive: () => ({ files: { get: vi.fn() } }),
    sheets: () => ({ spreadsheets: { get: sheetsSpreadsheetsGet } }),
  },
}));

import { getAgendaChips } from "@/lib/drive/agendaDrive";
import { parseSheet } from "@/lib/parser";

function chipCell(formattedValue: string, uri: string) {
  return { formattedValue, chipRuns: [{ chip: { richLinkProperties: { uri } } }] };
}

beforeEach(() => sheetsSpreadsheetsGet.mockReset());

describe("shared agenda-link predicate keeps both selectors aligned", () => {
  test("a blank-value AGENDA LINK row is excluded by BOTH → 2 aligned entries", async () => {
    // getAgendaChips path — real impl over a mocked grid: [valid, blank, valid].
    sheetsSpreadsheetsGet.mockResolvedValue({
      data: {
        sheets: [
          {
            data: [
              {
                rowData: [
                  {
                    values: [
                      { formattedValue: "AGENDA LINK - RFI" },
                      chipCell("RFI.pdf", "https://drive.google.com/file/d/RFI_FILE/view"),
                    ],
                  },
                  // blank value → excluded by isAgendaLinkRow
                  { values: [{ formattedValue: "AGENDA LINK - X" }, { formattedValue: "   " }] },
                  {
                    values: [
                      { formattedValue: "AGENDA LINK - PCF" },
                      chipCell("PCF.pdf", "https://drive.google.com/file/d/PCF_FILE/view"),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const chips = await getAgendaChips("sheet-1");
    expect(chips.kind).toBe("rows");
    const chipLabels = chips.kind === "rows" ? chips.rows.map((r) => r.label) : [];

    // parseAgendaLinks path — equivalent markdown with the same 3 rows.
    const markdown = [
      "| AGENDA LINK - RFI | https://drive.google.com/file/d/RFI_FILE/view |",
      "| AGENDA LINK - X |    |", // blank value
      "| AGENDA LINK - PCF | https://drive.google.com/file/d/PCF_FILE/view |",
    ].join("\n");
    const links = parseSheet(markdown).show.agenda_links;
    const linkLabels = links.map((l) => l.label);

    // Both exclude the blank row → exactly 2 entries each, aligned 1:1 by order.
    expect(chipLabels).toEqual(["AGENDA LINK - RFI", "AGENDA LINK - PCF"]);
    expect(linkLabels).toEqual(["AGENDA LINK - RFI", "AGENDA LINK - PCF"]);
    expect(chipLabels).toEqual(linkLabels);
  });

  test("both call sites import the shared isAgendaLinkRow predicate (no bypass)", () => {
    const parserSrc = readFileSync("lib/parser/index.ts", "utf8");
    const driveSrc = readFileSync("lib/drive/agendaDrive.ts", "utf8");
    for (const src of [parserSrc, driveSrc]) {
      expect(src).toMatch(/import\s+\{\s*isAgendaLinkRow\s*\}\s+from\s+["'][^"']*agendaLinkRow["']/);
      expect(src).toMatch(/isAgendaLinkRow\(/);
    }
  });
});
