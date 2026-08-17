// tests/parser/fieldNearMissBaseline.test.ts — the corpus-wide pin for the content-keyed
// near-miss detector, wired at the `parseSheet` document seam.
//
// Spec: docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md
// AC-N1 (65-row baseline, FULL emission identity per row), AC-N8 (TYPO_NORMALIZED census
// + the re-keyed venue-block-membership gate), AC-N9 (Stage/Storage rows stay anchored).
//
// The expected emission set is the MEASURED artifact — the followup probe's Part D
// (docs/superpowers/specs/parser/probes/2026-08-15-near-miss-followup-probe.ts, which
// prints `SUMMARY-D ... new_total=65`) — never this module's own output. The baseline is
// an EXPLICIT committed JSON with an env-var regen path, never `toMatchSnapshot()`: a
// missing snapshot (or any `-u` run) silently re-pins, which is the exact failure this
// gate exists to catch. Regenerate deliberately:
//   UPDATE_NEAR_MISS_BASELINE=1 pnpm exec vitest run tests/parser/fieldNearMissBaseline.test.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseSheet } from "@/lib/parser";
import { parseVenue } from "@/lib/parser/blocks/venue";
import { splitRow } from "@/lib/parser/blocks/_helpers";
import { resolveAliasFull } from "@/lib/parser/aliases";
import { valueFromRawSnippet } from "@/lib/parser/rawSnippet";
import { newAggregator } from "@/lib/parser/warnings";
import {
  extractUnknownFieldAnchors,
  normalizeCellKey,
  resolveUnknownFieldCell,
} from "@/lib/drive/unknownFieldAnchors";
import { FIXTURES } from "@/tests/parser/mutation/fixtures";
import { premise, premiseHolds } from "@/tests/_shared/premise";

/** One emission's FULL identity (AC-N1) — a drifted block/kind mapping or a drifted
 *  matched candidate fails the pin, which a bare key multiset could not. */
type BaselineRow = { fixture: string; key: string; block: string; kind: string; candidate: string };

const BASELINE = "tests/parser/__fixtures__/fieldNearMiss.baseline.json";

/** Spec §3.2: the measured corpus outcome after the r4 resolution-site recalibration. */
const EXPECTED_TOTAL = 65;

/**
 * Committed INTO the baseline file (JSON carries no comments) so the two facts a reader
 * of that file most needs travel with it. Regenerated verbatim from here, and asserted
 * present below, so a regen cannot quietly drop it.
 */
const BASELINE_NOTE: readonly string[] = [
  "Generated: UPDATE_NEAR_MISS_BASELINE=1 pnpm exec vitest run tests/parser/fieldNearMissBaseline.test.ts",
  "Spec: docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md (AC-N1, 3.2).",
  "",
  "TIE-BREAK, and what actually pins it. Spec 3.1 makes vocabulary insertion order normative:",
  "it decides which raw spelling a near-miss reports, and the `candidate` column below is where",
  "that shows. Measured at authoring time, the order has two halves and only one is witnessed:",
  "  * FIRST-WINS WITHIN A SOURCE is pinned here. Flipping buildVocabulary's `!vocab.has(n)` to",
  "    last-wins reds this file (VENUE ADDRESS -> Venue Address, Backdrop / Scenic ->",
  "    Backdrop/Scenic) and reds tests/parser/fieldNearMiss.test.ts too.",
  "  * The ORDER OF THE SOURCES, and of the nine sets inside SECTION_HEADER_TOKEN_SETS, is",
  "    currently UNWITNESSED. Permuting the nine sets, or deriving the barrels before",
  "    FIELD_ALIASES, leaves this baseline and the per-class suite fully green. The reason is",
  "    measurable, not luck: the nine sets have ZERO cross-set normalized-form collisions, and",
  "    nine of the ten distinct candidates below come from FIELD_ALIASES with no barrel",
  "    counterpart while the tenth (DETAILS/ROOM DIAGRAM) is unique to the event barrel. With no",
  "    key produced by two sources, relative order cannot change an outcome. Adding an alias or",
  "    header token that collides across sources would make the order live, and nothing today",
  "    would catch a reordering — regenerate and re-measure if you add one.",
  "Either way, treat a candidate diff here as a tie-break change, not as noise.",
  "",
  "The `kind`/`block` namespace falls back to the literal 'section' when a table's opener",
  "normalizes to nothing. That includes a table whose first pipe line is an alignment row",
  "(`| :--- | :--- |`), since the opener is taken before the alignment-row skip. Chosen to",
  "match what every canonicalSectionKind caller substitutes for an unrecognized label. No",
  "corpus fixture reaches it, so no row below carries it.",
];

/**
 * Every `UNKNOWN_FIELD` a full parse emits, paired with its `raw_unrecognized` row.
 *
 * `emitUnknownField` (lib/parser/warnings.ts) is the ONLY writer of `raw_unrecognized`
 * and pushes the warning and the entry together, so the two arrays are index-aligned by
 * construction — and the alignment is asserted below rather than assumed, since a second
 * writer appearing later would silently shift every `block` value in this baseline.
 */
function emissionsOf(fixture: string): { rows: BaselineRow[]; ufCount: number; ruCount: number } {
  const parsed = parseSheet(readFileSync(fixture, "utf8"), fixture);
  const uf = parsed.warnings.filter((w) => w.code === "UNKNOWN_FIELD");
  const rows = uf.map((w, i) => ({
    fixture,
    key: String(w.blockRef?.name ?? ""),
    block: parsed.raw_unrecognized[i]?.block ?? "",
    kind: String(w.blockRef?.kind ?? ""),
    candidate: w.candidate ?? "",
  }));
  return { rows, ufCount: uf.length, ruCount: parsed.raw_unrecognized.length };
}

const perFixture = FIXTURES.map((f) => ({ path: f.path, ...emissionsOf(f.path) }));
const actual: BaselineRow[] = perFixture.flatMap((f) => f.rows);

if (process.env["UPDATE_NEAR_MISS_BASELINE"]) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, `${JSON.stringify({ note: BASELINE_NOTE, rows: actual }, null, 2)}\n`);
}

const readBaseline = (): { note?: string[]; rows?: BaselineRow[] } =>
  JSON.parse(readFileSync(BASELINE, "utf8")) as { note?: string[]; rows?: BaselineRow[] };

const countBy = (rows: BaselineRow[], pick: (r: BaselineRow) => string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(pick(r), (m.get(pick(r)) ?? 0) + 1);
  return m;
};

// ── AC-N1: the committed baseline ────────────────────────────────────────────────────

describe("field near-miss corpus baseline (AC-N1)", () => {
  it("covers the whole harness corpus", () => {
    // Every assertion in this block reads rows the harness produced by READING
    // FIXTURE FILES. If discovery finds nothing — a renamed corpus directory,
    // a moved path constant — the row set is empty and the filter-shaped
    // assertions below pass over nothing.
    premise("harness fixtures discovered on disk", FIXTURES.length, 0);
    expect(FIXTURES.length).toBe(17);
    expect(perFixture.map((f) => f.path).sort()).toEqual(FIXTURES.map((f) => f.path).sort());
  });

  it("pairs every UNKNOWN_FIELD with exactly one raw_unrecognized entry", () => {
    // The pairing is what makes the `block` column of this baseline trustworthy.
    // The loop is a no-op over fixtures that emitted nothing, so the premise is
    // that at least one did.
    premise(
      "fixtures that emitted at least one near-miss row",
      perFixture.filter((f) => f.rows.length > 0).length,
      0,
    );
    for (const f of perFixture) {
      expect(f.ruCount, `${f.path}: raw_unrecognized count`).toBe(f.ufCount);
      expect(
        f.rows.every((r) => r.block !== ""),
        `${f.path}: every row carries a block`,
      ).toBe(true);
    }
  });

  it("emits exactly the committed baseline, row for row", () => {
    // Two empty sides are equal. The committed baseline carrying rows is what
    // makes this comparison discriminating.
    premise("rows in the committed baseline", (readBaseline().rows ?? []).length, 0);
    expect(
      existsSync(BASELINE),
      `${BASELINE} is missing — regenerate with UPDATE_NEAR_MISS_BASELINE=1`,
    ).toBe(true);
    expect(actual).toEqual(readBaseline().rows);
  });

  it("keeps the committed note, which JSON cannot carry as a comment", () => {
    expect(readBaseline().note).toEqual([...BASELINE_NOTE]);
  });

  it("emits exactly 65 rows (spec §3.2, followup probe Part D)", () => {
    premise("rows produced from the corpus", actual.length, 0);
    expect(actual.length).toBe(EXPECTED_TOTAL);
  });

  it("composition partitions into the §3.2 groups with nothing left over", () => {
    // A partition of nothing partitions perfectly.
    premise("rows produced from the corpus", actual.length, 0);
    const byKey = countBy(actual, (r) => r.key);
    const n = (k: string): number => byKey.get(k) ?? 0;

    // 7 audited true positives (Stage x2, Storage x2, Address:, Phone:, Client:/Contact:)
    // plus the 25 same-shape colon-suffixed contact rows in the additional fixtures.
    const auditedAndSameShape =
      n("Stage") +
      n("Storage") +
      n("Address:") +
      n("Phone:") +
      n("E-mail:") +
      n("Client:/Contact:");
    expect(auditedAndSameShape).toBe(7 + 25);
    expect(n("Backdrop")).toBe(15);
    expect(n("Room Diagram")).toBe(15);
    expect(n("Speaker")).toBe(2);
    expect(n("Diagrams?")).toBe(1);

    // The groups PARTITION the baseline: a new key anywhere in the corpus lands outside
    // every group and reds here, so this is a cover rather than a spot check.
    const grouped =
      auditedAndSameShape + n("Backdrop") + n("Room Diagram") + n("Speaker") + n("Diagrams?");
    expect(grouped).toBe(actual.length);

    // §3.2: these three forms are guard-suppressed and must NOT be in the baseline.
    for (const suppressed of ["Details?", "Contact", "Contact:"]) {
      expect(byKey.has(suppressed), `${suppressed} must stay suppressed`).toBe(false);
    }
  });

  it("every Room Diagram row sits in a Timestamp block, per §3.2", () => {
    // §3.2's load-bearing claim: every DETAILS-family `Room Diagram` is consumption-excluded,
    // so the 15 that survive are the Google-Forms echo rows only. A ledger regression would
    // re-admit a DETAILS one and this fails while the raw count could still read 15.
    // With no Room Diagram rows there is no claim to make about their blocks.
    premise(
      "Room Diagram rows in the baseline",
      actual.filter((r) => r.key === "Room Diagram").length,
      0,
    );
    const kinds = new Set(actual.filter((r) => r.key === "Room Diagram").map((r) => r.kind));
    expect([...kinds]).toEqual(["timestamp"]);
  });

  it("carries block === kind on every row (§2.2 uses one namespace for both)", () => {
    // An empty row set has no row that violates the rule.
    premise("rows produced from the corpus", actual.length, 0);
    expect(actual.filter((r) => r.block !== r.kind)).toEqual([]);
  });

  it("names a non-empty candidate on every row — the detector never emits an unsourced near-miss", () => {
    premise("rows produced from the corpus", actual.length, 0);
    expect(actual.filter((r) => r.candidate === "")).toEqual([]);
  });
});

// ── AC-N8: TYPO_NORMALIZED census + the re-keyed venue-block-membership gate ──────────

const typoCensus = (md: string, name: string): number =>
  parseSheet(md, name).warnings.filter((w) => w.code === "TYPO_NORMALIZED").length;

/** Blocks as the swap harness splits them (blank-line separated). */
const blocksOf = (md: string): string[] => md.split(/\n\s*\n/);

describe("TYPO_NORMALIZED after the venue-block-membership re-gate (AC-N8)", () => {
  it("the corpus really carries typo-alias rows, so a 0 census is not vacuous", () => {
    let typoRows = 0;
    for (const f of FIXTURES) {
      for (const line of readFileSync(f.path, "utf8").split("\n")) {
        if (!line.trim().startsWith("|")) continue;
        const col0 = splitRow(line.trim())[0] ?? "";
        if (resolveAliasFull(col0)?.isTypo) typoRows += 1;
      }
    }
    premise("corpus rows whose col0 resolves through a TYPO alias", typoRows, 5);
  });

  it("census is 0 across the unreordered corpus", () => {
    // A census over no fixtures is 0 for the wrong reason.
    premise("corpus fixtures read for the census", FIXTURES.length, 0);
    for (const f of FIXTURES) {
      expect(typoCensus(readFileSync(f.path, "utf8"), f.path), f.path).toBe(0);
    }
  });

  it("census stays 0 when the typo row's block is swapped with its neighbour", () => {
    // The swap index is DERIVED from the block that actually holds the typo row, so this
    // cannot drift into swapping two blocks that never carried one.
    let swapped = 0;
    for (const f of FIXTURES) {
      const blocks = blocksOf(readFileSync(f.path, "utf8"));
      const i = blocks.findIndex((b) => b.split("\n").some((l) => holdsTypoRow(l)));
      if (i === -1 || i + 1 >= blocks.length) continue;
      swapped += 1;
      const md = [...blocks.slice(0, i), blocks[i + 1]!, blocks[i]!, ...blocks.slice(i + 2)].join(
        "\n\n",
      );
      expect(typoCensus(md, f.path), `${f.path} B${i}<->B${i + 1}`).toBe(0);
    }
    premise("fixtures whose typo row's block was actually swapped", swapped, 5);
  });

  it("FIRES for a typo-alias row inside a VENUE-opened block", () => {
    // Every corpus venue block is clean (394-emission audit: 0 of 394 sit in one), so the
    // positive direction needs a constructed witness. Both rows are real sheet text: the
    // three-column `VENUE` opener is the v2 shape, and `Hotal Contact Info` is the corpus's
    // own misspelling.
    const md = ["| VENUE | ADDRESS | LOADING DOCK |", "| Hotal Contact Info | Ashley M |"].join(
      "\n",
    );
    premiseHolds(
      "the label really resolves through a TYPO alias",
      holdsTypoRow(md.split("\n")[1]!),
    );
    const agg = newAggregator();
    parseVenue(md, "v4", agg);
    const typo = agg.warnings.filter((w) => w.code === "TYPO_NORMALIZED");
    expect(typo).toHaveLength(1);
    expect(typo[0]!.severity).toBe("info");
    expect(typo[0]!.blockRef?.kind).toBe("venue");
    expect(typo[0]!.rawSnippet).toBe("Hotal Contact Info");
  });

  it("stays SILENT for the byte-identical row in a non-venue block", () => {
    // Same row, same parser, same document position — only the block opener differs, so
    // silence can only be the membership gate.
    const md = ["| HOTEL | ADDRESS | LOADING DOCK |", "| Hotal Contact Info | Ashley M |"].join(
      "\n",
    );
    premiseHolds(
      "the label really resolves through a TYPO alias",
      holdsTypoRow(md.split("\n")[1]!),
    );
    const agg = newAggregator();
    parseVenue(md, "v4", agg);
    expect(agg.warnings.filter((w) => w.code === "TYPO_NORMALIZED")).toHaveLength(0);
  });
});

function holdsTypoRow(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  return resolveAliasFull(splitRow(t)[0] ?? "")?.isTypo === true;
}

// ── AC-N9: the Stage/Storage rows stay anchored ──────────────────────────────────────
//
// Verified BY RESOLUTION, never by reading `kind` off the warning: `kind` equality is the
// anchor scanner's join key, so only a real `resolveUnknownFieldCell` call proves the
// mapping still lands on a cell. The detector's DETAILS family is the FIVE spellings in
// `EVENT_SECTION_HEADER_TOKENS`; the anchor scanner's own header regex
// (lib/drive/unknownFieldAnchors.ts) is three EXACT ones. Spec §2.2's parenthetical
// called those the same family, which is false on the live tree — the spec text is
// corrected in this commit, and the consequence is pinned executably below.

const EAST_COAST_XLSX = "fixtures/shows/exporter-xlsx/east-coast.md";
const EAST_COAST_RAW = "fixtures/shows/raw/2024-05-east-coast-family-office.md";

/** The physical pipe table holding the first row whose col0 is `col0Label`, verbatim. */
function fixtureTable(path: string, col0Label: string): string[][] {
  const tables: string[][][] = [];
  let current: string[][] | null = null;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().startsWith("|")) {
      if (!current) {
        current = [];
        tables.push(current);
      }
      current.push(splitRow(line.trim()));
    } else {
      current = null;
    }
  }
  const hit = tables.find((t) => t.some((cells) => cells[0]?.trim() === col0Label));
  if (!hit) throw new Error(`no table in ${path} has a row whose col0 is "${col0Label}"`);
  return hit;
}

/**
 * A synthetic INFO workbook reproducing the east-coast show's DETAILS block, built from
 * the committed fixture's own rows (label + value), at the shape the real exporter
 * produces. The raw and xlsx fixtures are two transcriptions of the SAME show, so one
 * anchor set legitimately covers both fixtures' Stage/Storage rows.
 */
function eastCoastAnchors(): ReturnType<typeof extractUnknownFieldAnchors> {
  const rows = fixtureTable(EAST_COAST_XLSX, "Stage").filter(
    (cells) => (cells[0] ?? "").trim() !== "" && !/^:?-+:?$/.test((cells[0] ?? "").trim()),
  );
  const aoa: string[][] = rows.map((cells) => [cells[0] ?? "", cells[1] ?? ""]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "INFO");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return extractUnknownFieldAnchors(buffer, new Map([["INFO", 0]]));
}

describe("Stage/Storage rows stay anchored (AC-N9)", () => {
  const anchors = eastCoastAnchors();

  it("resolves a source cell for all four Stage/Storage baseline rows", () => {
    premise(
      "the anchor scan found details anchors",
      anchors.filter((a) => a.kind === "details").length,
      5,
    );
    const targets = [EAST_COAST_XLSX, EAST_COAST_RAW];
    let checked = 0;
    for (const fixture of targets) {
      const parsed = parseSheet(readFileSync(fixture, "utf8"), fixture);
      const uf = parsed.warnings.filter(
        (w) => w.code === "UNKNOWN_FIELD" && ["Stage", "Storage"].includes(w.blockRef?.name ?? ""),
      );
      expect(uf.map((w) => w.blockRef?.name).sort(), fixture).toEqual(["Stage", "Storage"]);
      for (const w of uf) {
        checked += 1;
        const cell = resolveUnknownFieldCell(
          anchors,
          w.blockRef?.kind,
          w.blockRef?.name,
          valueFromRawSnippet(w.rawSnippet),
        );
        expect(cell?.a1, `${fixture} ${w.blockRef?.name} (kind=${w.blockRef?.kind})`).toBeTruthy();
      }
    }
    expect(checked).toBe(4);
  });

  it("the NARROWED kind loses the anchor — which is why the wider family is kept", () => {
    // Narrowing the detector's DETAILS family to the scanner's three exact spellings would
    // map the raw fixture's `DETAILS/Room Diagram` block to this normalized opener instead.
    const parsed = parseSheet(readFileSync(EAST_COAST_RAW, "utf8"), EAST_COAST_RAW);
    const stage = parsed.warnings.find(
      (w) => w.code === "UNKNOWN_FIELD" && w.blockRef?.name === "Stage",
    );
    premiseHolds("the Stage row is emitted at all", stage !== undefined);
    expect(
      resolveUnknownFieldCell(
        anchors,
        "details room diagram",
        stage!.blockRef?.name,
        valueFromRawSnippet(stage!.rawSnippet),
      ),
    ).toBeNull();
  });

  it("a non-anchor-block baseline row resolves null (documented-safe)", () => {
    const row = actual.find((r) => r.kind === "timestamp");
    premiseHolds("the baseline carries a Timestamp-block row", row !== undefined);
    const parsed = parseSheet(readFileSync(row!.fixture, "utf8"), row!.fixture);
    const w = parsed.warnings.find(
      (x) => x.code === "UNKNOWN_FIELD" && x.blockRef?.kind === "timestamp",
    );
    premiseHolds("and the parse re-emits it", w !== undefined);
    expect(
      resolveUnknownFieldCell(
        anchors,
        w!.blockRef?.kind,
        w!.blockRef?.name,
        valueFromRawSnippet(w!.rawSnippet),
      ),
    ).toBeNull();
  });

  it("the anchor scanner's header set is narrower than the detector's DETAILS family", () => {
    // The executable statement of the spec §2.2 correction landed in this commit: the
    // scanner recognizes `DETAILS`, and does NOT recognize `DETAILS/Room Diagram`, so a
    // row keyed on the wider spelling would resolve null. Asserted through the public
    // surface (an anchor set built from each header) rather than by reading the regex.
    const withHeader = (header: string): number => {
      const ws = XLSX.utils.aoa_to_sheet([
        [header, ""],
        ["Stage", "8' x 24' x 2'"],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "INFO");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      return extractUnknownFieldAnchors(buf, new Map([["INFO", 0]])).filter(
        (a) => a.kind === "details",
      ).length;
    };
    expect(withHeader("DETAILS")).toBe(1);
    expect(withHeader("DETAILS/Room Diagram")).toBe(0);
    expect(withHeader("GS DETAILS (FOR BOTH)")).toBe(0);
  });

  it("the two east-coast transcriptions agree on the Stage/Storage label+value pairs", () => {
    // The premise that lets ONE anchor set cover both fixtures' rows. If a fixture edit
    // breaks it, this says "premise not met" instead of the resolution test drifting.
    const pairs = (path: string): string[] =>
      fixtureTable(path, "Stage")
        .filter((cells) => ["Stage", "Storage"].includes((cells[0] ?? "").trim()))
        .map((cells) => `${normalizeCellKey(cells[0] ?? "")}=${normalizeCellKey(cells[1] ?? "")}`)
        .sort();
    premiseHolds("both fixtures still carry both rows", pairs(EAST_COAST_XLSX).length === 2);
    expect(pairs(EAST_COAST_RAW)).toEqual(pairs(EAST_COAST_XLSX));
  });
});
