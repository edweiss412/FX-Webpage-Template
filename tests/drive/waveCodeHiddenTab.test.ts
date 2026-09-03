import { describe, expect, it } from "vitest";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractWaveCodeSites,
  hiddenTabRefSuppressions,
  parsedOutputHoldsRefLiteral,
  type WaveCodeSite,
} from "@/lib/drive/waveCodeAnchors";
import { parseSheet } from "@/lib/parser";
import { GENERIC_SECTION_KIND } from "@/lib/parser/sectionKind";
import type { ParseWarning } from "@/lib/parser/types";
import { premiseHolds } from "@/tests/_shared/premise";
import { buildXlsx, withHiddenTabAfter } from "../helpers/buildXlsx";

/**
 * A `#REF!` on a DEAD LOOKUP TAB, a hidden tab whose every non-blank cell holds the literal,
 * is the artifact an IMPORTRANGE leaves when its source access lapses: nobody can see it on
 * the crew page and nobody can reach it from the deep link (Google refuses to open a hidden
 * gid, measured 2026-09-03 on "II - FinTech Forum CTO Summit 2026": five such warnings, every
 * link landing on DIAGRAMS). The suppression is deliberately NARROW. Hidden tabs are still
 * parsed (AGENDA is hidden on that same show), and a section kind of "section" does NOT mean
 * unrendered: the AGENDA token-header table, `Event Name:`, `VENUE NAME`, `COI` all track as
 * generic and all render (Codex R1 probe). A tab of nothing but `#REF!` has no label to bind
 * a value to, which is why the rule is the tab's whole content and not the section kind.
 */

/** `#REF!` where a crew NAME belongs: a recognised section, kind "crew". */
const CREW_WITH_REF: string[][] = [
  ["CREW", "NAME", "ROLE", "PHONE"],
  ["", "#REF!", "- A1", "555"],
];
/** The live shape: a lookup tab whose IMPORTRANGE failed, one `#REF!` cell, no label. */
const LOOKUP_REF: string[][] = [["#REF!"]];
/** Several bare literals and a blank row: still nothing but `#REF!`, still dead. */
const LOOKUP_REF_MANY: string[][] = [["#REF!", "#REF!"], [], ["", "#REF!"]];
/** Composite cells: a literal with ANY other text beside it is content the parser can carry
 *  (Codex R2 probe: "Event #REF!" became the show title, "GENERAL SESSION Ballroom #REF!" a
 *  room name). Containment is the defect shape; only a cell that is exactly `#REF!` is bare. */
const LOOKUP_REF_COMPOSITE: string[][] = [["#REF!", "#REF! - #REF!"], [], ["", "#REF!/NAME"]];
/** A hidden tab with ONE label beside the literal: not dead, the label can bind a value. */
const LOOKUP_REF_WITH_LABEL: string[][] = [["#REF!"], ["Event Name:", "#REF!"]];
/** Codex R1 probe: a hidden AGENDA token-header table whose START cell is `#REF!`. The parser
 *  stores it and the run-of-show renders it, while its section kind tracks as generic. */
const AGENDA_WITH_REF: string[][] = [
  ["TRAVEL DAY", "TRAVEL DAY", "TRAVEL DAY", "DAY 1", "DAY 1", "DAY 1", "DAY 1", "DAY 1", "DAY 1"],
  ["9/3/25", "9/3/25", "9/3/25", "9/5/25", "9/5/25", "9/5/25", "9/5/25", "9/5/25", "9/5/25"],
  [
    "Wednesday",
    "Wednesday",
    "Wednesday",
    "Friday",
    "Friday",
    "Friday",
    "Friday",
    "Friday",
    "Friday",
  ],
  ["NAME", "ARRIVAL", "FLIGHT#", "START", "FINISH", "TRT", "TITLE", "ROOM", "AV"],
  ["", "", "", "#REF!", "9:30 AM", "1:00", "Keynote", "Hall A", "LAV"],
];

const GIDS = new Map([
  ["INFO", 0],
  ["VENUE", 354548247],
  ["ROLE", 633442094],
]);

type Tab = { name: string; grid: string[][]; hidden?: boolean | 1 | 2 };

function scenario(tabs: Tab[]): { warnings: ParseWarning[]; sites: WaveCodeSite[] } {
  const buffer = buildXlsx(tabs);
  const { markdown } = synthesizeMarkdownFromXlsx(buffer);
  const warnings = parseSheet(markdown, "probe.xlsx").warnings;
  const sites = extractWaveCodeSites(buffer, GIDS);
  return { warnings, sites };
}

const refWarnings = (ws: readonly ParseWarning[]) =>
  ws.filter((w) => w.code === "REF_ERROR_LITERAL");
const refSites = (ss: readonly WaveCodeSite[]) => ss.filter((s) => s.code === "REF_ERROR_LITERAL");

describe("extractWaveCodeSites names the dead lookup tab", () => {
  it("a site on a hidden all-#REF! tab reads deadLookupTab true, a visible tab's false", () => {
    const { sites } = scenario([
      { name: "INFO", grid: CREW_WITH_REF },
      { name: "VENUE", grid: LOOKUP_REF, hidden: true },
    ]);
    expect(refSites(sites).map((s) => [s.anchor?.title, s.deadLookupTab])).toEqual([
      ["INFO", false],
      ["VENUE", true],
    ]);
  });

  it("a hidden tab with any non-#REF! content is not dead", () => {
    const { sites } = scenario([
      { name: "INFO", grid: [["Timestamp", "t"]] },
      { name: "VENUE", grid: CREW_WITH_REF, hidden: true },
      { name: "ROLE", grid: LOOKUP_REF_WITH_LABEL, hidden: true },
    ]);
    expect(refSites(sites).map((s) => [s.anchor?.title, s.deadLookupTab])).toEqual([
      ["VENUE", false],
      ["ROLE", false],
      ["ROLE", false],
    ]);
  });

  it("a visible all-#REF! tab is not dead: visibility is half the rule", () => {
    const { sites } = scenario([
      { name: "INFO", grid: [["Timestamp", "t"]] },
      { name: "VENUE", grid: LOOKUP_REF },
    ]);
    expect(refSites(sites).map((s) => s.deadLookupTab)).toEqual([false]);
  });
});

describe("hiddenTabRefSuppressions (hidden-tab #REF! suppression)", () => {
  it("suppresses the hidden generic-section #REF!, keeps the visible recognised-section one, aligned to the warnings array", () => {
    const { warnings, sites } = scenario([
      { name: "INFO", grid: CREW_WITH_REF },
      { name: "VENUE", grid: LOOKUP_REF, hidden: true },
    ]);
    const refs = refWarnings(warnings);
    premiseHolds("two #REF! warnings parsed, crew then generic", refs.length === 2);
    premiseHolds("the INFO hit is a recognised section", refs[0]!.blockRef?.kind === "crew");
    premiseHolds(
      "the VENUE hit is a generic section",
      refs[1]!.blockRef?.kind === GENERIC_SECTION_KIND,
    );
    const out = hiddenTabRefSuppressions(warnings, sites);
    expect(out).toHaveLength(warnings.length);
    const suppressedIdx = out.flatMap((s, i) => (s ? [i] : []));
    expect(suppressedIdx).toEqual([warnings.indexOf(refs[1]!)]);
  });

  it("keeps a #REF! inside a recognised section even when its tab is hidden", () => {
    const { warnings, sites } = scenario([
      { name: "INFO", grid: [["Timestamp", "t"]] },
      { name: "VENUE", grid: CREW_WITH_REF, hidden: true },
    ]);
    const refs = refWarnings(warnings);
    premiseHolds("one #REF! warning parsed, crew kind", refs.length === 1);
    premiseHolds("the hit is a recognised section", refs[0]!.blockRef?.kind === "crew");
    expect(hiddenTabRefSuppressions(warnings, sites).some(Boolean)).toBe(false);
  });

  it("keeps a hidden AGENDA table's #REF! even though its section kind is generic (Codex R1 probe)", () => {
    const { warnings, sites } = scenario([
      { name: "INFO", grid: [["Timestamp", "t"]] },
      { name: "AGENDA", grid: AGENDA_WITH_REF, hidden: true },
    ]);
    const refs = refWarnings(warnings);
    premiseHolds("one #REF! warning parsed", refs.length === 1);
    premiseHolds(
      "and its kind is generic, the very case a kind gate would drop",
      refs[0]!.blockRef?.kind === GENERIC_SECTION_KIND,
    );
    expect(hiddenTabRefSuppressions(warnings, sites).some(Boolean)).toBe(false);
  });

  it("keeps a hidden tab's #REF! when one label sits beside it: a label can bind a value", () => {
    const { warnings, sites } = scenario([
      { name: "INFO", grid: [["Timestamp", "t"]] },
      { name: "ROLE", grid: LOOKUP_REF_WITH_LABEL, hidden: true },
    ]);
    premiseHolds("two #REF! warnings parsed", refWarnings(warnings).length === 2);
    expect(hiddenTabRefSuppressions(warnings, sites).some(Boolean)).toBe(false);
  });

  it("suppresses every #REF! on a hidden tab of several bare literals and blank rows", () => {
    const { warnings, sites } = scenario([
      { name: "INFO", grid: [["Timestamp", "t"]] },
      { name: "VENUE", grid: LOOKUP_REF_MANY, hidden: true },
    ]);
    const refs = refWarnings(warnings);
    premiseHolds("three #REF! warnings parsed", refs.length === 3);
    expect(hiddenTabRefSuppressions(warnings, sites).filter(Boolean)).toHaveLength(3);
  });

  it("keeps every #REF! on a hidden tab of composite cells: only a cell that is exactly #REF! is bare (Codex R2 probe)", () => {
    const { warnings, sites } = scenario([
      { name: "INFO", grid: [["Timestamp", "t"]] },
      { name: "VENUE", grid: LOOKUP_REF_COMPOSITE, hidden: true },
    ]);
    const refs = refWarnings(warnings);
    premiseHolds("three #REF! warnings parsed", refs.length === 3);
    expect(hiddenTabRefSuppressions(warnings, sites).some(Boolean)).toBe(false);
  });

  it("keeps a generic-section #REF! on a VISIBLE tab", () => {
    const { warnings, sites } = scenario([
      { name: "INFO", grid: [["Timestamp", "t"]] },
      { name: "VENUE", grid: LOOKUP_REF },
    ]);
    const refs = refWarnings(warnings);
    premiseHolds(
      "one generic #REF! parsed",
      refs.length === 1 && refs[0]!.blockRef?.kind === GENERIC_SECTION_KIND,
    );
    expect(hiddenTabRefSuppressions(warnings, sites).some(Boolean)).toBe(false);
  });

  it("suppresses a veryHidden (state=2) tab's generic #REF! the same as hidden", () => {
    const { warnings, sites } = scenario([
      { name: "INFO", grid: [["Timestamp", "t"]] },
      { name: "ROLE", grid: LOOKUP_REF, hidden: 2 },
    ]);
    premiseHolds("one generic #REF! parsed", refWarnings(warnings).length === 1);
    expect(hiddenTabRefSuppressions(warnings, sites).filter(Boolean)).toHaveLength(1);
  });

  it("refuses the whole code on a count mismatch: suppresses nothing rather than mis-pairing", () => {
    const { warnings, sites } = scenario([
      { name: "INFO", grid: CREW_WITH_REF },
      { name: "VENUE", grid: LOOKUP_REF, hidden: true },
    ]);
    premiseHolds(
      "the aligned case does suppress one",
      hiddenTabRefSuppressions(warnings, sites).filter(Boolean).length === 1,
    );
    const extra = { ...refSites(sites)[1]! };
    expect(hiddenTabRefSuppressions(warnings, [...sites, extra]).some(Boolean)).toBe(false);
  });

  it("never marks a non-#REF! warning, whatever tab it came from", () => {
    const { warnings, sites } = scenario([
      { name: "INFO", grid: CREW_WITH_REF },
      { name: "VENUE", grid: LOOKUP_REF, hidden: true },
    ]);
    premiseHolds(
      "the parse also emitted non-#REF! warnings",
      warnings.some((w) => w.code !== "REF_ERROR_LITERAL"),
    );
    const out = hiddenTabRefSuppressions(warnings, sites);
    warnings.forEach((w, i) => {
      if (w.code !== "REF_ERROR_LITERAL") expect(out[i]).toBe(false);
    });
  });
});

describe("parsedOutputHoldsRefLiteral: the oracle that says whether any #REF! reached a parsed field", () => {
  /** Read a committed workbook as a standalone ArrayBuffer (pooled Buffer, so slice it). */
  function fixtureBuffer(relative: string): ArrayBuffer {
    const b = readFileSync(join(process.cwd(), relative));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  const parse = (buffer: ArrayBuffer) =>
    parseSheet(synthesizeMarkdownFromXlsx(buffer).markdown, "probe.xlsx");

  it("is false when the literal appears only in warnings (a dead lookup tab nothing consumed)", () => {
    const parsed = parse(
      buildXlsx([
        {
          name: "INFO",
          grid: [
            ["Event Name:", "Real Show"],
            ["RENTAL PICKUP", "Mon"],
          ],
        },
        { name: "VENUE", grid: LOOKUP_REF, hidden: true },
      ]),
    );
    premiseHolds("the warnings do carry the literal", refWarnings(parsed.warnings).length === 1);
    expect(parsedOutputHoldsRefLiteral(parsed)).toBe(false);
  });

  it("is true when a parsed field carries the literal in its stored (escaped) form", () => {
    const parsed = parse(buildXlsx([{ name: "INFO", grid: [["Event Name:", "Event #REF!"]] }]));
    premiseHolds(
      "the title holds the literal, escaped",
      /\\#REF\\!|#REF!/.test(parsed.show.title ?? ""),
    );
    expect(parsedOutputHoldsRefLiteral(parsed)).toBe(true);
  });

  it("is true for the Codex R3 case: a dead tab right after GEAR feeds a room field", () => {
    const rpas = fixtureBuffer("fixtures/shows/exporter-xlsx/rpas.xlsx");
    const parsed = parse(withHiddenTabAfter(rpas, "GEAR", "ZZ_DEAD", LOOKUP_REF));
    premiseHolds(
      "parseGearTab carried the bare literal into rooms[*].other",
      parsed.rooms.some((r) => (r.other ?? "").includes("#REF!")),
    );
    expect(parsedOutputHoldsRefLiteral(parsed)).toBe(true);
  });

  it("is false for the same dead tab placed after DIAGRAMS, where no parser continues into it", () => {
    const rpas = fixtureBuffer("fixtures/shows/exporter-xlsx/rpas.xlsx");
    const parsed = parse(withHiddenTabAfter(rpas, "DIAGRAMS", "ZZ_DEAD", LOOKUP_REF));
    premiseHolds("the dead tab's warning is present", refWarnings(parsed.warnings).length >= 1);
    expect(parsedOutputHoldsRefLiteral(parsed)).toBe(false);
  });
});
