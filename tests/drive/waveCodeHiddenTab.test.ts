import { describe, expect, it } from "vitest";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import {
  extractWaveCodeSites,
  hiddenTabRefSuppressions,
  type WaveCodeSite,
} from "@/lib/drive/waveCodeAnchors";
import { parseSheet } from "@/lib/parser";
import { GENERIC_SECTION_KIND } from "@/lib/parser/sectionKind";
import type { ParseWarning } from "@/lib/parser/types";
import { premiseHolds } from "@/tests/_shared/premise";
import { buildXlsx } from "../helpers/buildXlsx";

/**
 * A `#REF!` on a HIDDEN tab in a GENERIC section is a lookup-table artifact nobody can see
 * or fix from the deep link (Google refuses to open a hidden gid, measured 2026-09-03 on
 * "II - FinTech Forum CTO Summit 2026": five such warnings, every link landing on DIAGRAMS).
 * The suppression is deliberately NARROW: a `#REF!` inside a recognised section keeps its
 * warning even on a hidden tab, because hidden tabs are still parsed (AGENDA is hidden on
 * that same show) and a recognised-section literal renders on the crew page.
 */

/** `#REF!` where a crew NAME belongs: a recognised section, kind "crew". */
const CREW_WITH_REF: string[][] = [
  ["CREW", "NAME", "ROLE", "PHONE"],
  ["", "#REF!", "- A1", "555"],
];
/** The live shape: a lookup tab whose IMPORTRANGE failed, one `#REF!` cell, no label. */
const LOOKUP_REF: string[][] = [["#REF!"]];

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

describe("extractWaveCodeSites carries the owning tab's hidden state", () => {
  it("a site on a hidden tab reads hiddenTab true, a visible tab's false", () => {
    const { sites } = scenario([
      { name: "INFO", grid: CREW_WITH_REF },
      { name: "VENUE", grid: LOOKUP_REF, hidden: true },
    ]);
    expect(refSites(sites).map((s) => [s.anchor?.title, s.hiddenTab])).toEqual([
      ["INFO", false],
      ["VENUE", true],
    ]);
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
    premiseHolds("the replay saw it on the hidden tab", refSites(sites)[0]?.hiddenTab === true);
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
    premiseHolds("the replay saw it on a visible tab", refSites(sites)[0]?.hiddenTab === false);
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
