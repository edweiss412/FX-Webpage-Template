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
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
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
import { matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";
import { SECTION_HEADER_TOKENS as VENUE_SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/venue";

/** One emission's FULL identity (AC-N1) — a drifted block/kind mapping or a drifted
 *  matched candidate fails the pin, which a bare key multiset could not. */
type BaselineRow = { fixture: string; key: string; block: string; kind: string; candidate: string };

const BASELINE = "tests/parser/__fixtures__/fieldNearMiss.baseline.json";

/**
 * Spec §3.2: the measured corpus outcome.
 *
 * 65 -> 33 with the block-candidacy narrowing (spec
 * `docs/superpowers/specs/parser/2026-08-28-nearmiss-candidacy-field-lists-design.md`
 * §3.2/§3.3). The 32 removed rows are every `timestamp`-namespace row (30) and every
 * `console`-namespace row (2): both block families are now non-candidate homes, so a
 * near-miss card can no longer fire inside a form dump or an inventory matrix. No true
 * positive was lost.
 */
const EXPECTED_TOTAL = 33;

/**
 * Committed INTO the baseline file (JSON carries no comments) so the two facts a reader
 * of that file most needs travel with it. Regenerated verbatim from here, and asserted
 * present below, so a regen cannot quietly drop it.
 */
const BASELINE_NOTE: readonly string[] = [
  "Generated: UPDATE_NEAR_MISS_BASELINE=1 pnpm exec vitest run tests/parser/fieldNearMissBaseline.test.ts",
  "Spec: docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md (AC-N1, 3.2).",
  "Narrowed 65 -> 33 by the block-candidacy rule:",
  "  docs/superpowers/specs/parser/2026-08-28-nearmiss-candidacy-field-lists-design.md (3.1, 3.2, 3.3).",
  "  A near-miss card advises renaming a row, so it fires only in blocks shaped like FIELD",
  "  LISTS. Form dumps (opener normalizing to `timestamp`) and inventory matrices (every row",
  "  at 6 or more value cells) are not candidate homes, and the 32 rows that lived in them",
  "  are gone. No true positive was lost; see that spec's 3.3 for the removed set.",
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
    // no-premise: `toBe(17)` already reds on a renamed corpus directory or a
    // moved path constant, so a premise stating that discovery found something
    // is DOMINATED by it — on the empty-corpus degeneration both are false
    // together and only one of them is doing any work (whole-diff R1 #8). The
    // assertion IS the reachability proof here; a premise would be ritual.
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

  it("emits exactly 33 rows (spec §3.2, followup probe Part D)", () => {
    // no-premise: the assertion IS a nonzero count, so it dominates any premise
    // that rows were produced at all — an empty corpus reds on `toBe(65)`
    // itself (whole-diff R1 #8).
    expect(actual.length).toBe(EXPECTED_TOTAL);
  });

  it("composition partitions into the §3.2 groups with nothing left over", () => {
    // no-premise: a partition of nothing does partition perfectly, but the five
    // fixed group counts below are each nonzero, so an empty corpus reds on
    // them before the partition identity is reached. A premise saying rows
    // exist is dominated by every one of them (whole-diff R1 #8).
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
    // Zero, asserted EXPLICITLY rather than deleted. Each of these three keys fired only
    // inside a form dump or an inventory matrix, so the block-candidacy narrowing removed
    // every one of them; keeping the keys in the partition means a regression that
    // re-admits a non-candidate home reds here instead of passing unnoticed.
    expect(n("Backdrop")).toBe(0);
    expect(n("Room Diagram")).toBe(0);
    expect(n("Speaker")).toBe(0);
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

  it("no Room Diagram row survives, because its only home was the Timestamp block", () => {
    // INVERTED by the block-candidacy narrowing, and the inversion is the point rather
    // than bookkeeping. The old claim was "every surviving Room Diagram row sits in a
    // Timestamp block", which rested on every DETAILS-family one being consumption-
    // excluded. Timestamp blocks are no longer candidate homes, so the subject of that
    // claim is empty and the case would pass vacuously if left as written.
    //
    // Stated as a set rather than a count, and PAIRED with a control, so "no Room Diagram
    // rows" can never mean "no rows at all": the corpus still emits 33.
    premise("the baseline is non-empty, so this is not a vacuous silence", actual.length, 0);
    expect(actual.filter((r) => r.key === "Room Diagram")).toEqual([]);
    // And nothing at all survives in either retired namespace, whatever its label.
    expect(actual.filter((r) => r.kind === "timestamp" || r.kind === "console")).toEqual([]);
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
    // own misspelling. The v4 twin below covers the other corpus shape; both go through the
    // one shared predicate (2026-08-27-venue-block-predicate-design.md §2).
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

  // ── the v4 shape, which was silent before the shared predicate ──────────────────────
  //
  // v4 is the CURRENT template: 2026-03, 2026-04 and 2026-05 all carry it and none carries
  // a standalone `VENUE` cell at all. Before this arc a registered typo alias inside one of
  // these tables emitted NOTHING — not TYPO_NORMALIZED (the gate was whole-cell equality
  // against `VENUE`), not FIELD_LABEL_AUTOCORRECTED (the alias resolves exactly), not
  // UNKNOWN_FIELD (it resolved). Spec: 2026-08-27-venue-block-predicate-design.md.

  it("FIRES for a typo-alias row inside a v4 VENUE NAME-opened block", () => {
    // Both rows are real sheet text: the opener is the shape at
    // fixtures/shows/raw/2026-03-rpas-central-four-seasons.md:40, and `Hotal Contact Info`
    // is the corpus's own misspelling.
    const md = [
      "| VENUE NAME | Four Seasons Hotel Chicago |",
      "| Hotal Contact Info | Ashley M |",
    ].join("\n");
    premiseHolds(
      "the label really resolves through a TYPO alias",
      holdsTypoRow(md.split("\n")[1]!),
    );
    // THE discriminating premise: the opener is outside the OLD token set, so a green here
    // can only come from the new predicate and never from the gate this arc replaced.
    premiseHolds(
      "the opener is the v4 spelling, outside the v2 token set",
      !matchesSectionHeader("VENUE NAME", VENUE_SECTION_HEADER_TOKENS),
    );
    const agg = newAggregator();
    parseVenue(md, "v4", agg);
    const typo = agg.warnings.filter((w) => w.code === "TYPO_NORMALIZED");
    expect(typo).toHaveLength(1);
    expect(typo[0]!.severity).toBe("info");
    expect(typo[0]!.blockRef?.kind).toBe("venue");
    expect(typo[0]!.rawSnippet).toBe("Hotal Contact Info");
  });

  // ONE binding, read by BOTH the .each and its non-vacuity guard. An inline array in the
  // .each with a separate list in the guard is the "premise validates something ADJACENT"
  // defect: the real list could empty out while the duplicate stayed non-empty, and the
  // guard would keep passing over zero executed cases.
  //
  // The non-breaking space is written as an ESCAPE. A literal is invisible in the source and
  // an editor or formatter silently normalises it to a plain space, at which point the case
  // still passes and proves nothing.
  const OPENER_VARIANTS: ReadonlyArray<readonly [string, string]> = [
    ["double space", "VENUE  NAME"],
    ["tab", "VENUE\tNAME"],
    ["non-breaking space", "VENUE\u00a0NAME"],
  ];

  it("the whitespace-variant openers really differ from the canonical spelling", () => {
    // Non-vacuity for the .each below. It lives in a plain `it` because a premise inside an
    // .each callback is unreachable when the case list is empty — the documented fifth shape
    // — and it reads the SAME binding the .each consumes, never a second list.
    premise("opener variants under test", OPENER_VARIANTS.length, 0);
    for (const [label, opener] of OPENER_VARIANTS) {
      expect(opener, `${label} collapsed to the canonical spelling`).not.toBe("VENUE NAME");
    }
  });

  it.each(OPENER_VARIANTS)(
    "FIRES for a typo-alias row under an ordinary %s variant of the v4 opener",
    (_label, opener) => {
      // Both arms of the predicate normalize through the same function, so ordinary sheet
      // whitespace cannot put a table outside the venue block. An unwrapped resolveAlias
      // rejects all three of these and leaves the typo row silent — this arc's own defect
      // class, one layer down.
      const md = [
        `| ${opener} | Four Seasons Hotel Chicago |`,
        "| Hotal Contact Info | Ashley M |",
      ].join("\n");
      const agg = newAggregator();
      parseVenue(md, "v4", agg);
      const typo = agg.warnings.filter((w) => w.code === "TYPO_NORMALIZED");
      expect(typo).toHaveLength(1);
      expect(typo[0]!.blockRef?.kind).toBe("venue");
    },
  );
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

  // RETIRED by the block-candidacy narrowing (spec
  // docs/superpowers/specs/parser/2026-08-28-nearmiss-candidacy-field-lists-design.md).
  //
  // The case was `it("a Timestamp-block row resolves null against an anchor set that has
  // no Timestamp block")`. Its whole premise was that the baseline still carries a
  // `timestamp`-namespace row to resolve; no such row exists now, so the case could only
  // be kept by weakening the premise into something that passes on nothing.
  //
  // What this deletion does and does not cost, stated accurately because a
  // documented-safe note that is wrong is worse than no note. Anchor RESOLUTION is
  // unchanged and still exercised in `tests/drive/unknownFieldAnchors.test.ts`, whose
  // carriers this arc re-pointed to admitted blocks. Timestamp-row anchoring
  // specifically is exercised NOWHERE after this arc — including there — and that is the
  // intended consequence rather than lost coverage: a `timestamp` block emits no rows, so
  // no Timestamp row exists to anchor. Recorded here so a later reader does not read the
  // absence as an oversight, nor trust a claim of coverage that moved.

  it("every DETAILS-family spelling anchors the Stage row: one kind function on both sides (spec 2026-08-27 §2.2)", () => {
    // The retired asymmetry, stated in its new direction. The scanner used to recognize
    // `DETAILS` and NOT `DETAILS/Room Diagram` or `GS DETAILS (FOR BOTH)`, so a row keyed
    // on a wider spelling resolved null. It now keys on `anchorNamespace` itself, so
    // there is ONE family because there is one function. Asserted through resolution, not
    // through a count: the opener row now yields an anchor too, so the old count of 1 was
    // wrong for the first case as well.
    for (const header of ["DETAILS", "DETAILS/Room Diagram", "GS DETAILS (FOR BOTH)"]) {
      const ws = XLSX.utils.aoa_to_sheet([
        [header, ""],
        ["Stage", "8' x 24' x 2'"], // the AC-N9 row itself: probed 2026-08-27, flagged under all three headers
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "INFO");
      const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const buf =
        out instanceof Uint8Array
          ? (out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer)
          : (out as ArrayBuffer);
      const md = synthesizeMarkdownFromXlsx(buf).markdown;
      const w = parseSheet(md, "probe.md").warnings.find(
        (x) => x.code === "UNKNOWN_FIELD" && x.blockRef?.name === "Stage",
      );
      premiseHolds(`${header}: the near-miss row is emitted`, w !== undefined);
      const cell = resolveUnknownFieldCell(
        extractUnknownFieldAnchors(buf, new Map([["INFO", 0]])),
        w!.blockRef?.kind,
        w!.blockRef?.name,
        valueFromRawSnippet(w!.rawSnippet),
      );
      expect(cell, header).toEqual({ title: "INFO", gid: 0, a1: "A2", scope: "cell" });
    }
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
