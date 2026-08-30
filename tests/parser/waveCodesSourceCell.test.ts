// Spec docs/superpowers/specs/2026-08-29-ref-error-cell-anchors-design.md §5 T5, AC-4.
//
// The positive successor to tests/parser/waveCodesNoSourceCell.test.ts, which pinned the
// ABSENCE of a per-code dispatch and named this arc as the change that would replace it
// (spec parser/2026-08-07-parser-mutation-wave-design §11.9 offered per-code anchor dispatch
// as a future enhancement; this is it). Three things are pinned here:
//
//   1. the per-code branch attaches a PAIRED cell, in warning order, for a kind no fallback
//      would reach;
//   2. the fallthrough ORDER is unchanged -- no wave family, or a paired null, still lands on
//      the ratified code-agnostic KIND_TO_REGION fallback for agenda / pull_sheet;
//   3. assignment never DEMOTES a cell anchor to a range, over every member of
//      CELL_ANCHORED_CODES rather than a hand-listed subset. That is a class repair: the
//      cron's second, region-only `attachSourceCellAnchors` pass (applyParseResult) used to
//      replace a FIELD_UNREADABLE per-row crew cell with the crew region range, and its own
//      comment already promised it "never clobbers an already-set anchor".
import { describe, expect, it } from "vitest";

import { normalizeCrewNameKey } from "@/lib/drive/crewRoleAnchors";
import {
  attachSourceCellAnchors,
  CELL_ANCHORED_CODES,
  type WarningAnchorSources,
} from "@/lib/drive/showDayTimeAnchors";
import { normalizeCellKey } from "@/lib/drive/unknownFieldAnchors";
import { WAVE_CODES } from "@/lib/drive/waveCodeAnchors";
import { OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const cell = (a1: string): SourceAnchor => ({ title: "VENUE", gid: 5, a1, scope: "cell" });

const warn = (code: string, kind: string): ParseWarning =>
  ({
    severity: "warn",
    code,
    message: "m",
    // Carries the fields every existing dispatch branch reads, so an absence below cannot
    // be explained away as "the warning had nothing to match on".
    blockRef: { kind, name: "Alice", iso: "2026-06-24" },
    rawSnippet: "| Alice | A1 | 08:00 |",
  }) as ParseWarning;

/**
 * Anchor sources rich enough that a dispatch branch WOULD find something. This is the
 * premise, and it is the whole difference between this file and a tautology: handed empty
 * sources every code resolves to null and every assertion below passes for every possible
 * implementation. `region.schedule` / `region.gear_packlist` are the RegionIds
 * `KIND_TO_REGION` maps `agenda` / `pull_sheet` TO -- the lookup key is the mapped RegionId,
 * not the kind string.
 */
const sources: WarningAnchorSources = {
  showDay: [{ iso: "2026-06-24", anchor: cell("B7") }],
  // The resolver compares against the NORMALIZED key, so the fixture normalizes too rather
  // than hardcoding a guess at what normalization does.
  crewRole: [{ name: normalizeCrewNameKey("Alice"), anchor: cell("C12") }],
  unknownField: [{ kind: "crew", label: "L", value: "V", anchor: cell("D3") }],
  region: { crew: cell("A10"), schedule: cell("E5"), gear_packlist: cell("F6") },
};

/** Mirrors `showDayTimeAnchors.ts`'s KIND_TO_REGION: kind -> the RegionId `sources.region`
 *  is actually keyed by. Kept local (not imported) so this file independently pins the
 *  mapping it depends on, rather than trusting the module under test to describe itself. */
const KIND_TO_REGION_UNDER_TEST = { agenda: "schedule", pull_sheet: "gear_packlist" } as const;

describe("wave codes resolve a paired cell, and the ratified region fallback still runs behind it (spec §2.1)", () => {
  it("premise: the sources DO anchor a code that has a dispatch branch", () => {
    // Fails loudly if the fixture shape drifts away from what the resolvers read, which
    // would otherwise silently turn every arm below into "nothing anchors anything".
    const control: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "m",
        blockRef: { kind: "crew", name: "Alice" },
      } as ParseWarning,
    ];
    attachSourceCellAnchors(control, sources);
    expect(control[0]!.sourceCell, "control code must anchor").toBeTruthy();
  });

  for (const code of WAVE_CODES) {
    it(`${code}: a paired cell is attached, in warning order, for a non-region kind`, () => {
      expect(OPERATOR_ACTIONABLE_ANCHORED.has(code), `${code} in the anchored set`).toBe(true);
      const warnings = [warn(code, "crew"), warn(code, "crew")];
      attachSourceCellAnchors(warnings, { ...sources, wave: { [code]: [cell("A1"), cell("B7")] } });
      expect(warnings.map((w) => w.sourceCell)).toEqual([cell("A1"), cell("B7")]);
    });

    it(`${code}: with no wave family, a crew-kind warning stays undefined (the replaced file's first arm)`, () => {
      const warnings = [warn(code, "crew")];
      attachSourceCellAnchors(warnings, sources);
      expect(warnings[0]!.sourceCell, `${code} must stay link-less`).toBeUndefined();
    });

    it(`${code}: with no wave family, agenda and pull_sheet get the region (the ratified fallback, the replaced file's second arm)`, () => {
      for (const kind of ["agenda", "pull_sheet"] as const) {
        const warnings = [warn(code, kind)];
        attachSourceCellAnchors(warnings, sources);
        expect(warnings[0]!.sourceCell, `${code}/${kind}`).toEqual(
          sources.region[KIND_TO_REGION_UNDER_TEST[kind]],
        );
      }
    });

    it(`${code}: a paired null falls through to the region fallback for kind agenda`, () => {
      const warnings = [warn(code, "agenda")];
      attachSourceCellAnchors(warnings, { ...sources, wave: { [code]: [null] } });
      expect(warnings[0]!.sourceCell).toEqual(sources.region.schedule);
    });

    it(`${code}: a wave array shorter than the warnings never throws and leaves the tail unanchored`, () => {
      // `pairWaveCodeSites` never produces one, but the router must not trust that.
      const warnings = [warn(code, "crew"), warn(code, "crew")];
      attachSourceCellAnchors(warnings, { ...sources, wave: { [code]: [cell("A1")] } });
      expect(warnings.map((w) => w.sourceCell)).toEqual([cell("A1"), undefined]);
    });
  }
});

describe("assignment never demotes a cell anchor to a range (spec §2.1)", () => {
  const range = (a1: string): SourceAnchor => ({ title: "INFO", gid: 0, a1 });
  const isCell = (a: SourceAnchor | null | undefined): boolean =>
    !!a && typeof a.a1 === "string" && a.a1.length > 0 && !a.a1.includes(":");

  /** The `applyParseResult` shape: empty per-row families, region map only. */
  const regionOnly: WarningAnchorSources = {
    showDay: [],
    crewRole: [],
    unknownField: [],
    region: {
      crew: range("A2:D5"),
      schedule: range("A1:F40"),
      gear_packlist: range("A1:C9"),
      hotels: range("A10:D12"),
      rooms: range("A1:B4"),
      transportation: range("A20:D25"),
      details: range("A1:B9"),
    },
  };

  /** One kind per code that reaches that code's branch of the chain. */
  const kindFor = (code: string): string =>
    code.startsWith("HOTEL_")
      ? "hotels"
      : code === "FIELD_UNREADABLE" ||
          code === "COLUMN_HEADER_AUTOCORRECTED" ||
          code === "ORPHANED_CREW_ROWS"
        ? "crew"
        : code === "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE"
          ? "rooms"
          : code === "SECTION_HEADER_AUTOCORRECTED"
            ? "transportation"
            : code === "FIELD_LABEL_AUTOCORRECTED"
              ? "details"
              : code.startsWith("PULL_SHEET_")
                ? "pull_sheet"
                : "agenda";

  const warnFor = (code: string): ParseWarning =>
    code === "UNKNOWN_FIELD"
      ? // emitUnknownField's shape: `${label} | ${value}` (lib/parser/rawSnippet.ts).
        ({
          ...warn(code, "crew"),
          blockRef: { kind: "crew", name: "L" },
          rawSnippet: "L | V",
        } as ParseWarning)
      : warn(code, kindFor(code));

  // The pass that yields a CELL for a code, one entry per cell-yielding branch of the chain:
  // showDay, crewRole (the five crew codes and FIELD_UNREADABLE), unknownField, and this
  // arc's wave family. Every other member of CELL_ANCHORED_CODES resolves to a region range
  // by design and has no cell source, so the halves below run over two DERIVED sets whose
  // union is the whole set: a new member is asserted in one half or the other, never skipped.
  const CELL_PASS: Record<string, WarningAnchorSources> = {
    SCHEDULE_TIME_UNPARSED: { ...regionOnly, showDay: [{ iso: "2026-06-24", anchor: cell("B7") }] },
    UNKNOWN_FIELD: {
      ...regionOnly,
      unknownField: [
        {
          kind: "crew",
          label: normalizeCellKey("L"),
          value: normalizeCellKey("V"),
          anchor: cell("D3"),
        },
      ],
    },
  };
  for (const c of [
    "UNKNOWN_ROLE_TOKEN",
    "UNKNOWN_DAY_RESTRICTION",
    "UNKNOWN_STAGE_RESTRICTION",
    "STAGE_WORD_AUTOCORRECTED",
    "ROLE_TOKEN_AUTOCORRECTED",
    "FIELD_UNREADABLE",
  ]) {
    CELL_PASS[c] = {
      ...regionOnly,
      crewRole: [{ name: normalizeCrewNameKey("Alice"), anchor: cell("C12") }],
    };
  }
  for (const c of WAVE_CODES) CELL_PASS[c] = { ...regionOnly, wave: { [c]: [cell("C3")] } };

  const CELL_CAPABLE = [...CELL_ANCHORED_CODES].filter((c) => c in CELL_PASS);
  const REGION_ONLY = [...CELL_ANCHORED_CODES].filter((c) => !(c in CELL_PASS));

  it("premise: the two derived sets partition CELL_ANCHORED_CODES and neither is empty", () => {
    premise("cell-capable members", CELL_CAPABLE.length, 0);
    premise("region-only members", REGION_ONLY.length, 0);
    expect(Object.keys(CELL_PASS).filter((c) => !CELL_ANCHORED_CODES.has(c))).toEqual([]);
    expect(CELL_CAPABLE.length + REGION_ONLY.length).toBe(CELL_ANCHORED_CODES.size);
  });

  const contested: string[] = [];
  for (const code of CELL_ANCHORED_CODES) {
    it(`${code}: a cell survives a region-only pass`, () => {
      const probe = [warnFor(code)];
      attachSourceCellAnchors(probe, regionOnly);
      // This code's region-only pass yields a range, so the survival below is contested
      // rather than vacuous.
      if (probe[0]!.sourceCell) contested.push(code);
      const kept = [{ ...warnFor(code), sourceCell: cell("C3") }];
      attachSourceCellAnchors(kept, regionOnly);
      expect(kept[0]!.sourceCell).toEqual(cell("C3"));
    });
  }

  it("premise: the region-only pass contested FIELD_UNREADABLE and every wave code (kind agenda)", () => {
    premiseHolds("FIELD_UNREADABLE contested", contested.includes("FIELD_UNREADABLE"));
    premiseHolds(
      "every wave code contested",
      WAVE_CODES.every((c) => contested.includes(c)),
    );
  });

  for (const code of CELL_CAPABLE) {
    it(`${code}: a range is upgraded by its cell-yielding pass`, () => {
      const probe = [warnFor(code)];
      attachSourceCellAnchors(probe, CELL_PASS[code]!);
      premiseHolds(
        `${code}: the cell pass resolves a cell from an unanchored warning`,
        isCell(probe[0]!.sourceCell),
      );
      const up = [{ ...warnFor(code), sourceCell: range("A1:F40") }];
      attachSourceCellAnchors(up, CELL_PASS[code]!);
      expect(up[0]!.sourceCell).toEqual(probe[0]!.sourceCell);
    });
  }

  for (const code of REGION_ONLY) {
    it(`${code}: has no cell-yielding branch; a range is overwritten by the same-grain region (spec §2.1 idempotency)`, () => {
      const w = [{ ...warnFor(code), sourceCell: range("Z1:Z2") }];
      attachSourceCellAnchors(w, regionOnly);
      expect(isCell(w[0]!.sourceCell)).toBe(false);
      expect(w[0]!.sourceCell).not.toEqual(range("Z1:Z2"));
    });
  }
});
