import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
import { attachWarningAnchors } from "@/lib/sync/attachWarningAnchors";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { parseSheet } from "@/lib/parser";
import { premiseHolds } from "@/tests/_shared/premise";
import * as crewMod from "@/lib/drive/crewRoleAnchors";
import type { ParseWarning } from "@/lib/parser/types";
import { buildXlsx } from "../helpers/buildXlsx";

function xlsxBuffer(aoa: string[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "INFO");
  const u8 = new Uint8Array(
    XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayLike<number>,
  );
  return u8.buffer as ArrayBuffer;
}

const CREW = xlsxBuffer([
  ["CREW", "NAME", "ROLE", "PHONE"],
  ["", "Jane Doe", "- WIDGETMASTER", "555"],
]);
const gids = () => Promise.resolve(new Map([["INFO", 0]]));

describe("attachWarningAnchors", () => {
  it("attaches crew-role sourceCell (UNKNOWN_ROLE_TOKEN) via the lazy gids thunk", async () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "x",
        blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
      },
    ];
    await attachWarningAnchors(warnings, CREW, gids);
    // ROLE col index 2 → C; data row grid index 1 → row 2 → C2.
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C2" });
  });

  it("does NOT call resolveGids when no anchored warning is present (cost gate)", async () => {
    const resolveGids = vi.fn(gids);
    await attachWarningAnchors(
      [{ severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "x" }],
      CREW,
      resolveGids,
    );
    expect(resolveGids).not.toHaveBeenCalled();
  });

  it("returns early when bytes are undefined (link-less, no throw)", async () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "x",
        blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
      },
    ];
    await attachWarningAnchors(warnings, undefined, gids);
    expect(warnings[0]!.sourceCell).toBeUndefined();
  });

  it("swallows a thrown error (scan never breaks)", async () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "x",
        blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
      },
    ];
    await expect(
      attachWarningAnchors(warnings, CREW, () => Promise.reject(new Error("boom"))),
    ).resolves.toBeUndefined();
    expect(warnings[0]!.sourceCell).toBeUndefined();
  });

  it("degrades PER anchor family — a crew-scan throw still leaves valid schedule-time links", async () => {
    // whole-diff R1 [high]: one extractor throwing must NOT drop the others. Force
    // the crew-role extractor to throw and assert the SCHEDULE_TIME_UNPARSED anchor
    // still attaches.
    const spy = vi.spyOn(crewMod, "extractCrewRoleAnchors").mockImplementation(() => {
      throw new Error("bad crew geometry");
    });
    const DATES = xlsxBuffer([
      ["DATES", "", "", "", ""],
      ["", "SHOW DAY 1", "", "5/12/2026", "GS: ..."],
    ]);
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "SCHEDULE_TIME_UNPARSED",
        message: "x",
        blockRef: { kind: "dates", index: 0, iso: "2026-05-12" },
      },
    ];
    await attachWarningAnchors(warnings, DATES, gids);
    // SHOW DAY 1 = grid row index 1, TIME col index 4 → E2. Survives the crew throw.
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "E2" });
    spy.mockRestore();
  });

  it("reuses a precomputed region map when supplied (no recompute)", async () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "f",
        blockRef: { kind: "crew", index: 0 },
      },
    ];
    const region = { crew: { title: "INFO", gid: 0, a1: "A1:D2" } };
    await attachWarningAnchors(warnings, CREW, gids, region);
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A1:D2" });
  });
});

describe("attachWarningAnchors — UNKNOWN_FIELD end-to-end", () => {
  it("resolves an UNKNOWN_FIELD to its label cell via the raw workbook", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["DETAILS", ""],
      ["GS Podium Type", "(2) Acrylic Podium"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "INFO");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const warnings = [
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "x",
        blockRef: { kind: "details", name: "GS Podium Type" },
        rawSnippet: "GS Podium Type | (2) Acrylic Podium",
      },
    ] as ParseWarning[];
    await attachWarningAnchors(warnings, bytes, async () => new Map([["INFO", 0]]));
    // `scope: "cell"` (spec 2026-08-27 §2.5): scanner-produced anchors declare how far
    // they resolved, which is what lets buildSheetDeepLink trust them past the REGION
    // allowlist. Every other producer here is unscoped and unchanged.
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A2", scope: "cell" });
  });
});

// Spec docs/superpowers/specs/2026-08-29-ref-error-cell-anchors-design.md §5 T7.
// The replay must walk the block list the parsed markdown came from: same bytes, SAME
// `includePullSheetFromTab`. A mismatch changes the hit count and refuses; it cannot
// mis-pair. Both production call sites forward the option (runOnboardingScan,
// runScheduledCronSync), and a missing forward degrades to a link-less row.
describe("attachWarningAnchors forwards synthOpts to the wave-code replay (spec §5 T7)", () => {
  const OLD_TAB = "OLD PULL SHEET";

  function twoTabBuffer(): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["CREW", "NAME"],
        ["Alice", "#REF!"],
        ["Bob", "x"],
      ]),
      "INFO",
    );
    // The five rows that make an OLD tab collectable (regionA, tests/drive/synthesizeBlocks.test.ts).
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["PULL SHEET", "PULL SHEET"],
        ["RIA - CHICAGO, IL"],
        [],
        ["QTY", "ITEM"],
        ["2", "#REF!"],
      ]),
      OLD_TAB,
    );
    const u8 = new Uint8Array(
      XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayLike<number>,
    );
    return u8.buffer as ArrayBuffer;
  }

  const bothGids = () =>
    Promise.resolve(
      new Map([
        ["INFO", 0],
        [OLD_TAB, 1],
      ]),
    );

  function parsedWithOldTab(buffer: ArrayBuffer): ParseWarning[] {
    const { markdown } = synthesizeMarkdownFromXlsx(buffer, { includePullSheetFromTab: OLD_TAB });
    return parseSheet(markdown, "probe.xlsx").warnings;
  }

  it("with the fifth argument, the grid #REF! anchors to its cell", async () => {
    const buffer = twoTabBuffer();
    const warnings = parsedWithOldTab(buffer);
    const refs = () => warnings.filter((w) => w.code === "REF_ERROR_LITERAL");
    premiseHolds("the OLD tab was included, so both #REF! cells parsed", refs().length === 2);
    await attachWarningAnchors(
      warnings,
      buffer,
      bothGids,
      {},
      { includePullSheetFromTab: OLD_TAB },
    );
    expect(refs()[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "B2", scope: "cell" });
    // The opaque OLD-tab hit is archived content, never a place to send an operator.
    expect(refs()[1]!.sourceCell).toBeUndefined();
  });

  it("without it, the replay sees a different block list and refuses rather than mis-pairs", async () => {
    const buffer = twoTabBuffer();
    const warnings = parsedWithOldTab(buffer);
    await attachWarningAnchors(warnings, buffer, bothGids, {});
    for (const w of warnings.filter((w) => w.code === "REF_ERROR_LITERAL")) {
      expect(w.sourceCell).toBeUndefined();
    }
  });
});

describe("attachWarningAnchors drops hidden-tab generic #REF! warnings (hidden-tab #REF! suppression)", () => {
  /** `#REF!` where a crew NAME belongs: a recognised section on the visible INFO tab. */
  const CREW_WITH_REF: string[][] = [
    ["CREW", "NAME", "ROLE", "PHONE"],
    ["", "#REF!", "- A1", "555"],
  ];
  /** The live shape: an IMPORTRANGE lookup tab whose access lapsed, one unlabeled `#REF!`. */
  const LOOKUP_REF: string[][] = [["#REF!"]];
  const VENUE_GID = 354548247;
  const gidsAll = () =>
    Promise.resolve(
      new Map([
        ["INFO", 0],
        ["VENUE", VENUE_GID],
      ]),
    );
  const refs = (ws: ParseWarning[]) => ws.filter((w) => w.code === "REF_ERROR_LITERAL");
  const nonRefCodes = (ws: ParseWarning[]) =>
    ws.filter((w) => w.code !== "REF_ERROR_LITERAL").map((w) => w.code);
  function parsed(buffer: ArrayBuffer, opts?: { includePullSheetFromTab?: string }) {
    return parseSheet(synthesizeMarkdownFromXlsx(buffer, opts).markdown, "probe.xlsx").warnings;
  }

  it("removes the hidden generic #REF! from the caller's array and keeps the visible recognised one, anchored", async () => {
    const buffer = buildXlsx([
      { name: "INFO", grid: CREW_WITH_REF },
      { name: "VENUE", grid: LOOKUP_REF, hidden: true },
    ]);
    const warnings = parsed(buffer);
    premiseHolds("two #REF! warnings parsed before attachment", refs(warnings).length === 2);
    const othersBefore = nonRefCodes(warnings);
    await attachWarningAnchors(warnings, buffer, gidsAll);
    expect(refs(warnings)).toHaveLength(1);
    expect(refs(warnings)[0]!.blockRef?.kind).toBe("crew");
    expect(refs(warnings)[0]!.sourceCell).toEqual({
      title: "INFO",
      gid: 0,
      a1: "B2",
      scope: "cell",
    });
    // Only the hidden lookup artifact left; every other warning is exactly where it was.
    expect(nonRefCodes(warnings)).toEqual(othersBefore);
  });

  it("keeps a hidden-tab #REF! that sits inside a recognised section, and anchors it", async () => {
    const buffer = buildXlsx([
      { name: "INFO", grid: [["Timestamp", "t"]] },
      { name: "VENUE", grid: CREW_WITH_REF, hidden: true },
    ]);
    const warnings = parsed(buffer);
    premiseHolds(
      "one crew-kind #REF! parsed",
      refs(warnings).length === 1 && refs(warnings)[0]!.blockRef?.kind === "crew",
    );
    await attachWarningAnchors(warnings, buffer, gidsAll);
    expect(refs(warnings)).toHaveLength(1);
    expect(refs(warnings)[0]!.sourceCell).toEqual({
      title: "VENUE",
      gid: VENUE_GID,
      a1: "B2",
      scope: "cell",
    });
  });

  it("still suppresses when the gid map is empty (the onboarding scan's degraded path): visibility comes from the bytes, not the gids", async () => {
    const buffer = buildXlsx([
      { name: "INFO", grid: CREW_WITH_REF },
      { name: "VENUE", grid: LOOKUP_REF, hidden: true },
    ]);
    const warnings = parsed(buffer);
    premiseHolds("two #REF! warnings parsed before attachment", refs(warnings).length === 2);
    await attachWarningAnchors(warnings, buffer, () => Promise.resolve(new Map<string, number>()));
    expect(refs(warnings)).toHaveLength(1);
    expect(refs(warnings)[0]!.blockRef?.kind).toBe("crew");
    expect(refs(warnings)[0]!.sourceCell).toBeUndefined(); // link-less, as today without gids
  });

  it("suppresses nothing when the replay refuses (a synthOpts mismatch changes the hit count)", async () => {
    const OLD_TAB = "OLD PULL SHEET";
    const buffer = buildXlsx([
      { name: "INFO", grid: CREW_WITH_REF },
      {
        name: OLD_TAB,
        grid: [
          ["PULL SHEET", "PULL SHEET"],
          ["RIA - CHICAGO, IL"],
          [],
          ["QTY", "ITEM"],
          ["2", "#REF!"],
        ],
      },
      { name: "VENUE", grid: LOOKUP_REF, hidden: true },
    ]);
    const warnings = parsed(buffer, { includePullSheetFromTab: OLD_TAB });
    premiseHolds(
      "three #REF! warnings parsed with the OLD tab included",
      refs(warnings).length === 3,
    );
    // Attach WITHOUT the override: the replay sees two sites against three warnings and refuses.
    await attachWarningAnchors(warnings, buffer, gidsAll, {});
    expect(refs(warnings)).toHaveLength(3);
  });
});
