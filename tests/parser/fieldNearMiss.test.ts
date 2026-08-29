// tests/parser/fieldNearMiss.test.ts — the content-keyed field near-miss detector.
//
// Spec: docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md
// (§3.1 normative rule, §3.2 measured corpus outcome, §3.3 consumption-ledger semantics).
// Expected values below are derived from the MEASURED artifact — the followup probe's
// `firingsV3` computation (docs/superpowers/specs/parser/probes/2026-08-15-near-miss-followup-probe.ts)
// — not from this module's own output.
//
// Corpus-wide emission identity (the 65-row baseline, AC-N1) is Task 4's pin, and the
// single-call-site structural assertion belongs there too, after the legacy block-parser
// emitters are removed. This suite is the per-class contract.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { CORPUS_TEMP_PREFIX } from "@/tests/helpers/corpusTemp";

import {
  DISTINCTIVENESS_MAX,
  MATRIX_MIN_VALUE_CELLS,
  MIN_LEN,
  type ScannedRow,
  anchorNamespace,
  buildVocabulary,
  detectFieldNearMisses,
  fusedForm,
  isCandidateHome,
  matchVocabulary,
  normalizeV3,
  scanRowsWithOpener,
  tokenDocFrequency,
} from "@/lib/parser/fieldNearMiss";
import { SECTION_HEADER_TOKEN_SETS } from "@/lib/parser/sectionHeaderTokens";
import { LABEL_TO_KIND_KEYS, canonicalSectionKind } from "@/lib/parser/sectionKind";
import { FIELD_ALIASES } from "@/lib/parser/aliases";
import { clean, parseTableRows, splitRow } from "@/lib/parser/blocks/_helpers";
import { parseEventDetails } from "@/lib/parser/blocks/event";
import { parseContacts } from "@/lib/parser/blocks/contacts";
import { parseTransportation } from "@/lib/parser/blocks/transport";
import { emitUnknownField, markConsumed, newAggregator } from "@/lib/parser/warnings";
import type { ParseWarning } from "@/lib/parser/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { GUARD_SURFACES, validateSurface } from "@/tests/mutation/source/registry";
import { FIXTURES, readFixture } from "@/tests/parser/mutation/fixtures";

const CONSULTANTS_RAW = "fixtures/shows/raw/2025-10-consultants-roundtable.md";
const CONSULTANTS_XLSX = "fixtures/shows/exporter-xlsx/consultants.md";
const EAST_COAST_RAW = "fixtures/shows/raw/2024-05-east-coast-family-office.md";
const EAST_COAST_XLSX = "fixtures/shows/exporter-xlsx/east-coast.md";
const RIA_RAW = "fixtures/shows/raw/2025-06-ria-investment-forum.md";
const RPAS_RAW = "fixtures/shows/raw/2025-03-dci-rpas-central.md";

/**
 * The physical pipe table (an unbroken run of `|`-leading lines) holding the first row
 * whose col0 is `col0Label`, taken VERBATIM from a committed fixture. Test inputs are
 * real sheet rows in their real block, never hand-written strings — a hand-written row
 * can be tuned until it passes, and a hand-written BLOCK OPENER would let the
 * anchor-namespace mapping be asserted against text no sheet contains.
 */
function fixtureTable(path: string, col0Label: string): string {
  const tables: string[][] = [];
  let current: string[] | null = null;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().startsWith("|")) {
      if (!current) {
        current = [];
        tables.push(current);
      }
      current.push(line);
    } else {
      current = null;
    }
  }
  const hit = tables.find((t) => t.some((l) => splitRow(l.trim())[0]?.trim() === col0Label));
  if (!hit) throw new Error(`no table in ${path} has a row whose col0 is "${col0Label}"`);
  return hit.join("\n");
}

/**
 * Run the detector the way production will: the three block parsers that write the
 * consumption ledger run FIRST (they are the only `markConsumed` callers), then the
 * detector reads it. Their OWN warnings are dropped before the detector runs — the
 * legacy `parseVenue`/`parseEventDetails` UNKNOWN_FIELD emitters are still in the tree
 * until Task 4 removes them, and this suite is about the detector's emissions only.
 */
function emissionsFor(markdown: string): ParseWarning[] {
  const agg = newAggregator();
  parseContacts(markdown, "v4", agg);
  parseTransportation(markdown, "v4", [], agg);
  parseEventDetails(markdown, "v4", agg);
  agg.warnings.length = 0;
  agg.rawUnrecognized.length = 0;
  detectFieldNearMisses(markdown, agg);
  return agg.warnings;
}

/** The single emission whose row label is `key`, or a loud failure naming what did fire. */
function emissionFor(markdown: string, key: string): ParseWarning {
  const hits = emissionsFor(markdown).filter((w) => w.blockRef?.name === key);
  if (hits.length !== 1) {
    const all = emissionsFor(markdown)
      .map((w) => `${w.blockRef?.name ?? "?"}@${w.blockRef?.kind ?? "?"}`)
      .join(", ");
    throw new Error(
      `expected exactly 1 emission for "${key}", got ${hits.length}. Fired: [${all}]`,
    );
  }
  return hits[0]!;
}

/** Row labels the detector emitted for `markdown`, in document order. */
const firedLabels = (markdown: string): string[] =>
  emissionsFor(markdown).map((w) => String(w.blockRef?.name ?? ""));

/**
 * `noise` contributes ZERO emissions — asserted DIFFERENTIALLY against a control block
 * measured to fire, so "nothing fired" can never mean "the detector never ran". The
 * expected set is derived from the control's own run, never hardcoded.
 */
function expectContributesNothing(noise: string): void {
  const control = fixtureTable(EAST_COAST_XLSX, "Stage");
  const controlLabels = firedLabels(control);
  premise(
    "the control block fires, so the detector is demonstrably alive",
    controlLabels.length,
    0,
  );
  expect(firedLabels(`${noise}\n\n${control}`)).toEqual(controlLabels);
}

const vocab = buildVocabulary();

// ── Vocabulary derivation (spec §2.2 sources, §3.1 tie-break) ────────────────────────

describe("vocabulary derivation", () => {
  it("derives from all three live sources, so a later alias addition is covered", () => {
    premise("FIELD_ALIASES carries real alias spellings", Object.keys(FIELD_ALIASES).length, 10);
    // Every alias spelling in the live map reaches the vocabulary under its v3 form.
    const missingAliases = Object.values(FIELD_ALIASES)
      .flat()
      .filter((a) => normalizeV3(a).length > 0 && !vocab.has(normalizeV3(a)));
    expect(missingAliases).toEqual([]);
    const missingHeaders = SECTION_HEADER_TOKEN_SETS.flat().filter(
      (t) => !vocab.has(normalizeV3(t)),
    );
    expect(missingHeaders).toEqual([]);
    const missingKinds = LABEL_TO_KIND_KEYS.filter((k) => !vocab.has(normalizeV3(k)));
    expect(missingKinds).toEqual([]);
  });

  it("keeps the FIRST raw spelling for a normalized entry, never a later duplicate", () => {
    // `venue.address` declares VENUE ADDRESS before Venue Address; both normalize to
    // "venue address", so the stored raw discriminates first-wins from last-wins.
    const addressAliases = FIELD_ALIASES["venue.address"] ?? [];
    premiseHolds(
      "venue.address still declares two spellings that collide after normalization",
      addressAliases.length >= 2 &&
        normalizeV3(addressAliases[0]!) === normalizeV3(addressAliases[1]!),
    );
    expect(vocab.get("venue address")?.raw).toBe(addressAliases[0]);
  });

  it("stores the raw spelling verbatim, not a normalized or casefolded form", () => {
    premiseHolds(
      "the alias table still carries the DIagrams capitalization",
      vocab.has("diagrams"),
    );
    expect(vocab.get("diagrams")?.raw).toBe("DIagrams");
  });

  it("carries every block parser's SECTION_HEADER_TOKENS (walked from disk)", async () => {
    // Derived cover, not an enumeration: a new block file that exports tokens fails here
    // rather than silently sitting outside the vocabulary. A filename grep is NOT the
    // cover — `ops.ts` matches the string in a comment while exporting no tokens, so the
    // membership test is the live export, and the directory is read, never listed.
    // no-premise: the dynamic specifier IS the derived cover — the premise scanner cannot
    // resolve `import(`../../lib/parser/blocks/${stem}.ts`)` to a module, and resolving it
    // would mean naming the files, which is the enumeration this case exists to avoid. The
    // two `premise(...)` calls below are the executable guards the scanner would otherwise
    // be standing in for: the walk found files, and some of them exported tokens.
    const files = readdirSync("lib/parser/blocks").filter((f) => f.endsWith(".ts"));
    premise("the blocks directory was actually walked", files.length, 5);
    const exported: string[][] = [];
    for (const file of files) {
      const stem = file.replace(/\.ts$/, "");
      const mod = (await import(`../../lib/parser/blocks/${stem}.ts`)) as Record<string, unknown>;
      const t = mod["SECTION_HEADER_TOKENS"];
      if (Array.isArray(t)) exported.push(t as string[]);
    }
    premise("some block modules export SECTION_HEADER_TOKENS", exported.length, 1);
    expect(SECTION_HEADER_TOKEN_SETS.length).toBe(exported.length);
    const barrelled = new Set(SECTION_HEADER_TOKEN_SETS.flat());
    expect(exported.flat().filter((t) => !barrelled.has(t))).toEqual([]);
  });

  it("reads LABEL_TO_KIND keys live, so none can go stale", () => {
    premise("the exact table is non-trivial", LABEL_TO_KIND_KEYS.length, 10);
    expect(LABEL_TO_KIND_KEYS.filter((k) => canonicalSectionKind(k) === null)).toEqual([]);
  });
});

// ── Normalization (spec §3.1) ────────────────────────────────────────────────────────

describe("v3 normalization", () => {
  it("collapses every run of non-alphanumerics to one space", () => {
    expect(normalizeV3("Client:/Contact:")).toBe("client contact");
    expect(normalizeV3("DETAILS/Room Diagram")).toBe("details room diagram");
  });

  it("decodes the exporter's whitespace entities before collapsing", () => {
    expect(normalizeV3("ADDITIONAL ROOM&#10;Dimensions")).toBe("additional room dimensions");
  });

  it("fuses ONLY hyphens sitting between two alphanumerics", () => {
    expect(fusedForm("E-mail:")).toBe("email");
    // A free-standing hyphen reads as a real word boundary and must survive, or the
    // fused form would widen the match surface for agenda/time rows.
    expect(fusedForm("9:00PM - LOAD IN")).toBe(normalizeV3("9:00PM - LOAD IN"));
  });
});

// ── Row scan (block-opener derivation) ───────────────────────────────────────────────

describe("row scan", () => {
  it("yields exactly parseTableRows' rows, each tagged with its physical block opener", () => {
    const md = readFileSync(CONSULTANTS_RAW, "utf8");
    const expected = parseTableRows(md);
    premise("the fixture is a full sheet, not a stub", expected.length, 100);
    const scanned = scanRowsWithOpener(md);
    expect(scanned.map((r) => r.cells)).toEqual(expected);
  });

  it("resets the opener at every non-pipe line, matching the ledger writers' rule", () => {
    const md = `| DETAILS |  |\n| Stage | 8' |\n\n| Timestamp |  |\n| Stage | 8' |`;
    expect(scanRowsWithOpener(md).map((r) => r.opener)).toEqual([
      "DETAILS",
      "DETAILS",
      "Timestamp",
      "Timestamp",
    ]);
  });
});

// ── True positives (spec §3.2's seven audited rows) ──────────────────────────────────

describe("audited true positives fire", () => {
  it("Stage names Stage Size and Storage names Equipment Storage, anchored to details", () => {
    premiseHolds("vocabulary contains the target alias", vocab.has("stage size"));
    premiseHolds("vocabulary contains the target alias", vocab.has("equipment storage"));
    const md = fixtureTable(EAST_COAST_XLSX, "Stage");

    const stage = emissionFor(md, "Stage");
    expect(stage.code).toBe("UNKNOWN_FIELD");
    expect(stage.candidate).toBe("Stage Size");
    expect(stage.blockRef?.kind).toBe("details");
    expect(stage.message).toContain("Stage Size");

    expect(emissionFor(md, "Storage").candidate).toBe("Equipment Storage");
  });

  it("the colon-suffixed client-contact rows name their venue/client aliases", () => {
    premiseHolds("vocabulary contains the target alias", vocab.has("venue address"));
    premiseHolds("vocabulary contains the target alias", vocab.has("client phone"));
    const md = fixtureTable(CONSULTANTS_RAW, "Address:");

    expect(emissionFor(md, "Address:").candidate).toBe("VENUE ADDRESS");
    expect(emissionFor(md, "Phone:").candidate).toBe("Client Phone");
  });

  it("Client:/Contact: matches as an equality once punctuation collapses", () => {
    premiseHolds("vocabulary contains the target alias", vocab.has("client contact"));
    const md = fixtureTable(CONSULTANTS_RAW, "Client:/Contact:");
    premiseHolds(
      "the collapse is what produces the hit — this is a type (a) equality",
      matchVocabulary("Client:/Contact:", vocab)?.type === "a",
    );
    expect(emissionFor(md, "Client:/Contact:").candidate).toBe("Client Contact");
  });

  it("E-mail: matches only through the fused form", () => {
    premiseHolds("vocabulary contains the target alias", vocab.has("client email"));
    premiseHolds(
      "the plain form does not reach the alias — the fused form is load-bearing",
      matchVocabulary("E-mail:", vocab)?.via === "fused",
    );
    const md = fixtureTable(CONSULTANTS_RAW, "E-mail:");
    expect(emissionFor(md, "E-mail:").candidate).toBe("Client Email");
  });
});

// ── Anchor-namespace mapping (spec §2.2, three arms) ─────────────────────────────────

describe("block/kind anchor namespace", () => {
  it("maps a DETAILS-family block to 'details' on BOTH block and kind", () => {
    const w = emissionFor(fixtureTable(EAST_COAST_XLSX, "Stage"), "Stage");
    expect(w.blockRef?.kind).toBe("details");
    expect(w.message).toContain("Unrecognized details row label");
  });

  it("maps a VENUE block to 'venue'", () => {
    // Every corpus venue block is CLEAN (394-emission audit: 0 of 394 sit in one), so
    // this arm is unreachable from the corpus and needs a constructed witness. The rows
    // are real: the VENUE opener and the `Address` label both occur verbatim in sheets.
    const md = `| VENUE | ADDRESS | LOADING DOCK |\n| Address | 120 E Delaware Pl |`;
    const w = emissionFor(md, "Address");
    expect(w.blockRef?.kind).toBe("venue");
    expect(w.candidate).toBe("VENUE ADDRESS");
  });

  it("falls back to the normalized block-opener label for any other block", () => {
    const md = fixtureTable(CONSULTANTS_RAW, "Client:/Contact:");
    expect(emissionFor(md, "Address:").blockRef?.kind).toBe("client contact");
    expect(emissionFor(fixtureTable(EAST_COAST_RAW, "Diagrams?"), "Diagrams?").blockRef?.kind).toBe(
      "joann",
    );
  });
});

// ── Guard-suppressed classes (spec §3.1 guards; §3.2 composition) ────────────────────
//
// Every case below is silent for a reason it states EXECUTABLY on its own input, and
// every document also carries a row that DOES fire, so "silent" can never be the
// detector failing to run.

describe("guard-suppressed and unmatched classes stay silent", () => {
  it("a crew-roster name row matches no vocabulary entry", () => {
    const md = fixtureTable(EAST_COAST_RAW, "Doug Larson - Load In/Set/Strike/Load Out - Lead");
    const label = "Doug Larson - Load In/Set/Strike/Load Out - Lead";
    premiseHolds(
      "the row reached the detector's scan",
      scanRowsWithOpener(md).some((r) => r.cells[0]?.trim() === label),
    );
    premiseHolds("silence is the MATCH rule, not a guard", matchVocabulary(label, vocab) === null);
    expectContributesNothing(md);
  });

  it("an agenda time row matches no vocabulary entry", () => {
    const md = fixtureTable(RPAS_RAW, "8:00 AM");
    premiseHolds(
      "the row reached the detector's scan",
      scanRowsWithOpener(md).some((r) => r.cells[0]?.trim() === "8:00 AM"),
    );
    premiseHolds(
      "silence is the MATCH rule, not a guard",
      matchVocabulary("8:00 AM", vocab) === null,
    );
    expectContributesNothing(md);
  });

  it("a gear pull-sheet item row matches no vocabulary entry", () => {
    const item = "DIGITAL AUDIO CONSOLE- QU32 CONSOLE";
    const md = fixtureTable(CONSULTANTS_RAW, item);
    premiseHolds(
      "the row reached the detector's scan",
      scanRowsWithOpener(md).some((r) => r.cells[0]?.trim() === item),
    );
    premiseHolds("silence is the MATCH rule, not a guard", matchVocabulary(item, vocab) === null);
    expectContributesNothing(md);
  });

  it("an xlsx NO_HEADER artifact row matches no vocabulary entry", () => {
    const md = fixtureTable(CONSULTANTS_RAW, "NO_HEADER");
    premiseHolds(
      "the row reached the detector's scan",
      scanRowsWithOpener(md).some((r) => r.cells[0]?.trim() === "NO_HEADER"),
    );
    premiseHolds(
      "silence is the MATCH rule, not a guard",
      matchVocabulary("NO_HEADER", vocab) === null,
    );
    expectContributesNothing(md);
  });

  it("a #REF! residue row matches no vocabulary entry", () => {
    const label = "\\#REF\\!/NAME";
    const md = fixtureTable(CONSULTANTS_RAW, label);
    premiseHolds(
      "the row reached the detector's scan",
      scanRowsWithOpener(md).some((r) => r.cells[0]?.trim() === label),
    );
    premiseHolds("silence is the MATCH rule, not a guard", matchVocabulary(label, vocab) === null);
    expectContributesNothing(md);
  });

  it("ALL-CAPS single-token ADDRESS is suppressed ONLY by the all-caps guard", () => {
    // The witness is ADDRESS, not INTERNAL: INTERNAL matches nothing and never reaches
    // a guard at all, so its silence would prove nothing about this guard.
    premiseHolds(
      "ADDRESS matches the VENUE ADDRESS family absent every guard",
      matchVocabulary("ADDRESS", vocab)?.entry.raw === "VENUE ADDRESS",
    );
    const m = matchVocabulary("ADDRESS", vocab)!;
    premiseHolds("and it clears the OTHER two guards", m.norm.length >= MIN_LEN);
    premiseHolds(
      "and it clears the distinctiveness guard",
      (tokenDocFrequency(vocab).get("address") ?? Infinity) <= DISTINCTIVENESS_MAX,
    );
    // Same normalized label, differing only in the property the guard keys on.
    const md = `| DETAILS |  |\n| ADDRESS | 120 E Delaware Pl |\n| Address | 120 E Delaware Pl |`;
    expect(firedLabels(md)).toEqual(["Address"]);
  });

  it("a below-minimum-length label is suppressed by the length guard", () => {
    premiseHolds(
      "NAME matches the VENUE NAME family absent every guard",
      matchVocabulary("NAME", vocab)?.entry.raw === "VENUE NAME",
    );
    premiseHolds("and it is shorter than the floor", normalizeV3("NAME").length < MIN_LEN);
    // `NAME` alone cannot ISOLATE this guard — it is also ALL-CAPS single-token, so the
    // all-caps guard would suppress it too. `Name` normalizes identically and is the
    // witness that only the length guard can explain.
    premiseHolds("Name normalizes to the same form", normalizeV3("Name") === normalizeV3("NAME"));
    premiseHolds(
      "Name is not all-caps, so only the length guard is left",
      matchVocabulary("Name", vocab)?.entry.raw === "VENUE NAME",
    );
    const md = `| DETAILS |  |\n| NAME | Four Seasons |\n| Name | Four Seasons |\n| Stage | 8' |`;
    expect(firedLabels(md)).toEqual(["Stage"]);
  });

  it("guards apply to a type (a) EQUALITY match, not only to token subsets", () => {
    // `Details?` collapses to exactly the vocabulary entry "DETAILS" — a type (a) hit.
    // Guarding only type (b) would let it through and inflate the baseline by one.
    const m = matchVocabulary("Details?", vocab);
    premiseHolds("Details? is a type (a) equality match", m?.type === "a");
    premiseHolds(
      "and it is suppressed by distinctiveness, not by length or caps",
      (tokenDocFrequency(vocab).get("details") ?? 0) > DISTINCTIVENESS_MAX,
    );
    const md = fixtureTable(EAST_COAST_RAW, "Details?");
    premiseHolds(
      "the row reached the detector's scan",
      scanRowsWithOpener(md).some((r) => r.cells[0]?.trim() === "Details?"),
    );
    expect(firedLabels(md)).not.toContain("Details?");
    // Same block, same scan — `Diagrams?` fires, so silence is not the detector idling.
    expect(firedLabels(md)).toContain("Diagrams?");
  });
});

// ── Block candidacy (spec 2026-08-28-nearmiss-candidacy-field-lists §3.1) ────────────
//
// A separate describe from the suppression one above, and the distinction is load-bearing
// rather than cosmetic: those cases assert a label matches NO vocabulary entry or dies to
// a LABEL-level guard, whereas these assert a label that matches and clears every label
// guard is suppressed by its BLOCK.

/** One physical pipe-run block of the corpus, with the production statistics it carries. */
type CorpusBlock = {
  id: string;
  ns: string;
  opener: string;
  min: number;
  rowCount: number;
  head: ScannedRow;
  lines: string[];
};

/**
 * Every physical pipe-run block in the corpus, grouped by the same rule
 * `scanRowsWithOpener` uses. The regrouping is needed only because the shipped scanner
 * flattens its output; `opener` and `min` are read off the production rows rather than
 * recomputed here, so the walk cannot disagree with what the detector sees.
 */
function corpusBlocks(): CorpusBlock[] {
  const out: CorpusBlock[] = [];
  for (const f of FIXTURES) {
    let run: string[] = [];
    let ordinal = 0;
    const flush = () => {
      if (run.length === 0) return;
      const lines = run;
      run = [];
      const rows = scanRowsWithOpener(lines.join("\n"));
      const head = rows[0];
      if (head === undefined) return;
      ordinal += 1;
      out.push({
        id: `${f.path}#${ordinal}`,
        ns: anchorNamespace(head.opener),
        opener: head.opener,
        min: head.blockMinValueCells,
        rowCount: rows.length,
        head,
        lines,
      });
    };
    for (const line of readFixture(f).split("\n")) {
      if (!line.trim().startsWith("|")) flush();
      else run.push(line);
    }
    flush();
  }
  return out;
}

type BlockCensus = {
  totalBlocks: number;
  excludedCount: number;
  keptCount: number;
  familyCounts: Record<string, number>;
  excluded: { id: string; arm: string; ns: string; opener: string; minValueCells: number }[];
};

/**
 * The committed per-block census. Generated by
 * `docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-block-census.ts`, which writes
 * the §3.1 rule out longhand rather than calling `isCandidateHome` — so this artifact is an
 * EXTERNAL authority the suite is measured against, not a recording of what the shipped
 * predicate happens to do.
 */
const loadCensus = (): BlockCensus =>
  JSON.parse(
    readFileSync("tests/parser/__fixtures__/nearMissBlockCensus.json", "utf8"),
  ) as BlockCensus;

describe("block candidacy", () => {
  it("a Timestamp-opener block is excluded, and it is one that fires today (AC-5)", () => {
    // Selected by its OPENER, not by a row label: `fixtureTable(RIA_RAW, "Room Diagram")`
    // returns the DETAILS block, because the label occurs in both and the helper takes
    // the first. That block is ADMITTED by the rule, so a case built on it would assert
    // the opposite of what it means to.
    const md = fixtureTable(CONSULTANTS_RAW, "Timestamp");
    const head = scanRowsWithOpener(md)[0];
    premiseHolds("the block was scanned", head !== undefined);
    premiseHolds("and it IS the Timestamp block", anchorNamespace(head!.opener) === "timestamp");
    // The premise that makes the exclusion meaningful: this block WOULD have fired.
    premiseHolds(
      "its Room Diagram row matches the vocabulary",
      matchVocabulary("Room Diagram", vocab)?.entry.raw === "DETAILS/ROOM DIAGRAM",
    );
    premiseHolds(
      "and the row reached the detector's scan",
      scanRowsWithOpener(md).some((r) => clean(r.cells[0] ?? "") === "Room Diagram"),
    );
    // It is excluded by the FORM-DUMP arm, not the matrix arm: single-column, so its
    // minimum is nowhere near the matrix threshold.
    premiseHolds("and the matrix arm does not reach it", head!.blockMinValueCells < 6);

    expect(isCandidateHome(head!)).toBe(false);
    expectContributesNothing(md);
  });

  it("a Console block is excluded by the MATRIX arm, and its Speaker row did match (AC-6)", () => {
    const md = fixtureTable(RIA_RAW, "Speaker");
    const head = scanRowsWithOpener(md)[0];
    premiseHolds("the block was scanned", head !== undefined);
    premiseHolds("and it IS the Console block", anchorNamespace(head!.opener) === "console");
    // The premise that separates "excluded by the new rule" from "never matched anyway".
    premiseHolds("vocabulary contains the target alias", vocab.has("virtual speaker"));
    const m = matchVocabulary("Speaker", vocab);
    premiseHolds("Speaker matches Virtual Speaker", m?.entry.raw === "Virtual Speaker");
    premiseHolds("and it clears the length guard", (m?.norm.length ?? 0) >= MIN_LEN);
    premiseHolds(
      "and it clears the distinctiveness guard",
      (tokenDocFrequency(vocab).get("speaker") ?? Infinity) <= DISTINCTIVENESS_MAX,
    );
    // And it is the MATRIX arm that excludes it, not the form-dump arm.
    premiseHolds(
      "the opener does not normalize to timestamp",
      normalizeV3(head!.opener) !== "timestamp",
    );
    premiseHolds(
      "and every row of it carries at least the matrix threshold",
      head!.blockMinValueCells >= MATRIX_MIN_VALUE_CELLS,
    );

    expect(isCandidateHome(head!)).toBe(false);
    expectContributesNothing(md);
  });

  it("a narrow-minimum block stays a candidate even where the FIRING row is wide (AC-4)", () => {
    // §2.2's refutation, executable. The matrix arm is a MINIMUM over the block, never a
    // test on the firing row, and the sharpest witness is a block whose firing row is
    // itself wide: a per-row reimplementation suppresses the exact row this asserts.
    const md = fixtureTable(CONSULTANTS_RAW, "Client:/Contact:");
    const rows = scanRowsWithOpener(md);
    const head = rows[0];
    premiseHolds("the block was scanned", head !== undefined);
    const firing = rows.find((r) => clean(r.cells[0] ?? "") === "Client:/Contact:");
    premiseHolds("the firing row is in it", firing !== undefined);
    const firingValueCells = firing!.cells.slice(1).filter((c) => clean(c) !== "").length;
    premiseHolds(
      "and that row is WIDER than the matrix threshold, so a per-row rule would suppress it",
      firingValueCells >= MATRIX_MIN_VALUE_CELLS,
    );
    premiseHolds("while the block MINIMUM is far below it", head!.blockMinValueCells <= 2);

    expect(isCandidateHome(head!)).toBe(true);
    // And it really does still fire, so the admission is observable rather than nominal.
    expect(firedLabels(md)).toContain("Client:/Contact:");
  });

  it("the per-block census matches the committed artifact, in BOTH directions (AC-9)", () => {
    // Asserted at CANDIDACY level, not through emissions: a block wrongly excluded that
    // hosts no emission today moves no row, so no row-count table can see it. That is not
    // hypothetical — a threshold of 3 would withdraw candidacy from four `venue` blocks
    // while every outcome table in the spec read green.
    const census = loadCensus();
    const blocks = corpusBlocks();

    // Premise: the walk actually saw the families the artifact claims to cover, so a
    // scoping bug that selects nothing cannot pass this vacuously.
    premise("the walk saw the whole corpus", blocks.length, census.totalBlocks - 1);
    for (const [ns, n] of Object.entries(census.familyCounts)) {
      premise(`the walk saw the ${ns} family`, blocks.filter((b) => b.ns === ns).length, n - 1);
    }

    const refused = blocks.filter((b) => !isCandidateHome(b.head));
    expect(
      refused.map((b) => ({
        id: b.id,
        ns: b.ns,
        opener: b.opener,
        minValueCells: b.min,
      })),
    ).toEqual(
      census.excluded.map((e) => ({
        id: e.id,
        ns: e.ns,
        opener: e.opener,
        minValueCells: e.minValueCells,
      })),
    );
    // BOTH directions. A pin asserting only the refusals passes against a predicate that
    // refuses everything; a pin asserting only admissions passes against the pre-change
    // detector, which admits everything.
    expect(blocks.filter((b) => isCandidateHome(b.head)).length).toBe(census.keptCount);
    for (const family of ["venue", "details", "client", "client contact"]) {
      const wrong = blocks.filter((b) => b.ns === family && !isCandidateHome(b.head));
      expect(
        wrong.map((b) => b.id),
        `every ${family} block stays a candidate`,
      ).toEqual([]);
    }
    const consoleBlocks = blocks.filter((b) => b.ns === "console");
    expect(
      consoleBlocks.filter((b) => isCandidateHome(b.head)).map((b) => b.id),
      "every console block is refused",
    ).toEqual([]);
  });

  it("the detector emits IF AND ONLY IF the predicate admits the block (AC-10)", () => {
    // The census proves a PREDICATE classifies blocks. It does not prove the detector
    // gates its emissions through that predicate: an implementation could expose a
    // correct predicate, leave it disconnected, and hardcode suppression of the three
    // known keys, satisfying the baseline, both shape cases and the census at once.
    //
    // Run on an EMPTY ledger deliberately. `parseEventDetails` consumes an
    // `Equipment Storage:` row in a DETAILS-family block, so under the production-faithful
    // `emissionsFor` harness the injected row would go silent in exactly the blocks whose
    // parser recognizes it, for a reason unrelated to candidacy.
    const blocks = corpusBlocks();
    const injected = "Equipment Storage:";
    premiseHolds("the walk saw the corpus", blocks.length > 500);

    // Control 2 — ambiguity: no corpus block already carries the label, so an emission
    // can only be attributed to the injected row.
    const preexisting = blocks.filter((b) =>
      scanRowsWithOpener(b.lines.join("\n")).some((r) => clean(r.cells[0] ?? "") === injected),
    );
    expect(
      preexisting.map((b) => b.id),
      "the injected label appears nowhere already",
    ).toEqual([]);

    const emitted = new Set<string>();
    const shapeMoved: string[] = [];
    for (const b of blocks) {
      // Padded to the block's OWN minimum, which preserves it exactly. A one-value-cell
      // append drops an inventory matrix's minimum to 1, so by §3.1 the mutated block is
      // no longer a matrix and a correct detector must ADMIT it — the probe would then be
      // measuring a block the rule classifies differently from the one it computed its
      // expectation from.
      const pad = Array.from({ length: b.min }, (_, i) => `v${i}`).join(" | ");
      const md = `${b.lines.join("\n")}\n| ${injected} |${pad.length > 0 ? ` ${pad} |` : " |"}`;
      const rescanned = scanRowsWithOpener(md);
      const head = rescanned[0]!;
      // Control 3 — shape invariance, asserted per block rather than assumed.
      if (head.opener !== b.opener || head.blockMinValueCells !== b.min) shapeMoved.push(b.id);
      const agg = newAggregator();
      detectFieldNearMisses(md, agg);
      if (agg.warnings.some((w) => w.blockRef?.name === injected)) emitted.add(b.id);
    }
    expect(shapeMoved, "the injection changed no block's (opener, minValueCells)").toEqual([]);

    // Control 1 — positive: the injected label emits SOMEWHERE, so an emission check that
    // matches nothing cannot read as "excluded everywhere".
    expect(emitted.size, "the injected label fires somewhere").toBeGreaterThan(0);

    // Measured against the COMMITTED CENSUS, never against `isCandidateHome`. Comparing the
    // detector to the predicate it calls is an identity: a skeleton predicate admitting
    // everything agrees with a detector gating on it, and the case passes while nothing is
    // implemented. Against the census the criterion is red at the merge base with exactly
    // the 33 blocks the rule excludes, and a three-key hardcode leaves all 33 standing.
    const excludedIds = new Set(loadCensus().excluded.map((e) => e.id));
    const disagreements = blocks
      .filter((b) => emitted.has(b.id) === excludedIds.has(b.id))
      .map(
        (b) =>
          `${b.id} ns=${b.ns} excludedByRule=${excludedIds.has(b.id)} emitted=${emitted.has(b.id)}`,
      );
    expect(disagreements).toEqual([]);
  });

  it("the form-dump arm compares NORMALIZED openers, not raw strings (AC-11)", () => {
    // Every corpus form dump spells its opener exactly `Timestamp`, so
    // `opener === "Timestamp"` satisfies AC-5, AC-9 and AC-10 while violating §3.1, and no
    // corpus input distinguishes the two. This case rebuilds a real form-dump block one
    // opener spelling at a time.
    const source = corpusBlocks().find((b) => normalizeV3(b.opener) === "timestamp");
    premiseHolds("the corpus has a form-dump block", source !== undefined);
    premiseHolds(
      "and its source opener is the exact-string spelling",
      source!.opener === "Timestamp",
    );

    const rebuild = (spelling: string): ScannedRow => {
      const [firstLine, ...rest] = source!.lines;
      const segs = firstLine!.split("|");
      // splitRow drops the leading and trailing fragments, so cell 0 is segment index 1.
      segs[1] = ` ${spelling} `;
      const rows = scanRowsWithOpener([segs.join("|"), ...rest].join("\n"));
      const head = rows[0]!;
      // Premise on the rebuild's own inputs: the row count and the minimum did not move,
      // so the case cannot pass by having perturbed something other than the opener.
      premiseHolds(
        `the ${spelling} rebuild changed only the opener`,
        rows.length === source!.rowCount && head.blockMinValueCells === source!.min,
      );
      return head;
    };

    for (const spelling of ["TIMESTAMP", "timestamp", "Timestamp:"]) {
      const head = rebuild(spelling);
      // What makes a rebuild a rebuild: the reparsed opener DIFFERS from the source.
      premiseHolds(
        `the ${spelling} rebuild reparsed to a different opener`,
        head.opener !== source!.opener,
      );
      expect(isCandidateHome(head), `${spelling} must be excluded`).toBe(false);
    }

    // Whitespace padding is deliberately NOT in the discriminating set: the scanner cleans
    // the opener, so ` Timestamp ` reparses as `Timestamp` and separates nothing. Asserted
    // rather than left to a comment, so a change to `clean` surfaces here.
    const padded = rebuild("  Timestamp  ");
    expect(padded.opener).toBe(source!.opener);
  });

  it("the matching rule and the consumption draw-down are unchanged (AC-7)", () => {
    // Structural, so a future edit that moves matching behaviour under cover of this
    // narrowing fails. The digest is over the NAMED bodies only, so unrelated edits
    // elsewhere in the module do not trip it.
    const src = readFileSync("lib/parser/fieldNearMiss.ts", "utf8");
    // Extracted through the TypeScript parser, not by a brace scan. `normalizeV3` and
    // `fusedForm` are arrow consts terminated by a semicolon, so a scan for a
    // line-leading `}` runs past them and swallows every declaration in between — a
    // digest that then covers code the criterion never named.
    const sf = ts.createSourceFile("fieldNearMiss.ts", src, ts.ScriptTarget.Latest, true);
    const body = (name: string): string => {
      let found: string | null = null;
      sf.forEachChild((n) => {
        if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n.getText(sf);
        if (ts.isVariableStatement(n)) {
          for (const d of n.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.name.text === name) found = n.getText(sf);
          }
        }
      });
      expect(found, `${name} is declared`).not.toBeNull();
      return found!;
    };
    const drawDown = src.slice(
      src.indexOf("const left = remaining.get(key) ?? 0;"),
      src.indexOf("const block = anchorNamespace(row.opener);"),
    );
    expect(drawDown, "the draw-down is present").toContain("remaining.set(key, left - 1)");
    const digest = createHash("sha256")
      .update(
        [
          body("normalizeV3"),
          body("fusedForm"),
          body("matchVocabulary"),
          body("passesGuards"),
          drawDown,
        ].join("\n@@\n"),
      )
      .digest("hex");
    expect(digest).toBe("f92efc0bb281ed0d6ffb559d0193c4d7dcc0852fa89ab25934ec27a917616816");
  });
});

// ── Consumption ledger (spec §3.3, resolution-site semantics) ────────────────────────

describe("consumption-ledgered rows stay silent, both value states", () => {
  it("a curated row with a WRITTEN value is silent", () => {
    const md = fixtureTable(CONSULTANTS_XLSX, "Notes");
    const agg = newAggregator();
    parseEventDetails(md, "v4", agg);
    premiseHolds(
      "the Notes row IS ledgered by the parse (resolution-site mark)",
      [...agg.consumed.keys()].some((k) => k.split("\u0000")[1] === "Notes"),
    );
    premiseHolds(
      "and it would match vocabulary absent the ledger",
      matchVocabulary("Notes", vocab)?.entry.raw === "VENUE NOTES",
    );
    expect(firedLabels(md)).not.toContain("Notes");
  });

  it("a curated row with an EMPTY value is silent, while fallback rows in the same block fire", () => {
    // The r4 false-positive class: write-site marking left resolved-but-empty rows
    // unledgered and the detector called a correctly named field a near-miss of itself.
    const md = fixtureTable(EAST_COAST_XLSX, "Room Diagram");
    const agg = newAggregator();
    parseEventDetails(md, "v4", agg);
    premiseHolds(
      "the Room Diagram row carries an EMPTY value in this block",
      scanRowsWithOpener(md).some(
        (r) => r.cells[0]?.trim() === "Room Diagram" && (r.cells[1] ?? "").trim() === "",
      ),
    );
    premiseHolds(
      "and the parse still ledgered it (resolution, not write)",
      [...agg.consumed.keys()].some((k) => k.split("\u0000")[1] === "Room Diagram"),
    );
    premiseHolds(
      "and it would match vocabulary absent the ledger",
      matchVocabulary("Room Diagram", vocab) !== null,
    );
    const fired = firedLabels(md);
    expect(fired).not.toContain("Room Diagram");
    // Self-slug fallback storage is NOT resolution, so these stay candidates.
    expect(fired).toContain("Stage");
    expect(fired).toContain("Storage");
  });

  it("keys consumption by block OPENER, so a byte-identical row elsewhere still fires", () => {
    // A byte-identical empty-value `Room Diagram` in TWO blocks, consumed in one. A
    // label+value key suppresses both, or assigns consumption by document order — which is
    // position-keyed, the defect class this detector exists to remove.
    //
    // The second block used to be a `Timestamp` block, taken from three fixtures that
    // carry exactly this pair. Form dumps are no longer candidate homes (spec
    // docs/superpowers/specs/parser/2026-08-28-nearmiss-candidacy-field-lists-design.md),
    // so that pairing would now be silent for a reason that has nothing to do with the
    // ledger. Re-pointed to a second ADMITTED block, which sharpens the case rather than
    // preserving it: BOTH blocks are candidate homes now, so the single emission can only
    // be the consumption key doing its job.
    const details = fixtureTable(EAST_COAST_XLSX, "Room Diagram");
    const detailsHead = scanRowsWithOpener(details)[0];
    premiseHolds("the consumed block is itself a candidate home", isCandidateHome(detailsHead!));
    const md = `${details}\n\n| Intake Log | 1/7/2025 0:00 |\n| Room Diagram |  |`;
    const second = scanRowsWithOpener(`| Intake Log | 1/7/2025 0:00 |\n| Room Diagram |  |`)[0];
    premiseHolds("and so is the second one", isCandidateHome(second!));
    const emissions = emissionsFor(md).filter((w) => w.blockRef?.name === "Room Diagram");
    expect(emissions.length).toBe(1);
    expect(emissions[0]!.blockRef?.kind).toBe("intake log");
  });

  it("spends the ledger ONE mark per occurrence, so N rows with M<N marks fire exactly N-M times", () => {
    // The §3.3 arithmetic itself, which no other case in this suite reaches. Every
    // block parser marks EVERY row it resolves, so a document parsed end-to-end always
    // has marks == occurrences and the count is never actually spent down — the
    // decrement and its step size are both unobservable from a whole-document parse.
    // That is the r2 count-vs-set defect's own shape (a count read as a set silenced
    // two rows on one resolution), so the contract is pinned here directly against the
    // production writer instead: seed the ledger with `markConsumed`, exactly as a
    // resolving parser would, and give the detector one more occurrence than there are
    // marks.
    const base = fixtureTable(EAST_COAST_XLSX, "Room Diagram");
    const scanned = scanRowsWithOpener(base);
    const target = scanned.find((r) => (r.cells[0] ?? "").trim() === "Room Diagram");
    premiseHolds("the fixture block carries a Room Diagram row", target !== undefined);
    const rowLine = base.split("\n").find((l) => splitRow(l.trim())[0]?.trim() === "Room Diagram");
    premiseHolds("and its verbatim source line is recoverable", rowLine !== undefined);

    // Three occurrences of the fixture's own row, in its own block, under its own opener.
    const md = `${base}\n${rowLine}\n${rowLine}`;
    const occurrences = scanRowsWithOpener(md).filter(
      (r) => (r.cells[0] ?? "").trim() === "Room Diagram",
    );
    premiseHolds("three occurrences share one consumption key", occurrences.length === 3);

    // TWO marks for THREE occurrences. Both derived from the fixture row, never typed:
    // an opener or value typed here could disagree with the key the detector probes and
    // the case would pass for the wrong reason.
    const agg = newAggregator();
    const opener = target!.opener;
    const value = clean(target!.cells[1] ?? "");
    markConsumed(agg, opener, "Room Diagram", value);
    markConsumed(agg, opener, "Room Diagram", value);
    premiseHolds(
      "the ledger holds exactly two marks for that key",
      agg.consumed.size === 1 && [...agg.consumed.values()][0] === 2,
    );

    detectFieldNearMisses(md, agg);
    const fired = agg.warnings.filter((w) => w.blockRef?.name === "Room Diagram");
    // Exactly one: two occurrences spend the two marks, the third is unledgered.
    // A ledger read as a set silences all three; a decrement that never happens
    // silences all three; a decrement of two spends both marks on the first row and
    // fires twice. Each of those is a distinct wrong answer this count separates.
    expect(fired.length).toBe(1);
  });
});

// ── Pinned residual classes (spec §3.2 is the authority; §9 documents them) ──────────

describe("calibrated residual classes fire exactly as baselined", () => {
  it("the Timestamp-block Google-Forms echo is RETIRED, not merely quiet", () => {
    // INVERTED. This class fired 30 rows of the 65-row baseline and is now zero, because a
    // form dump is not a field list (spec
    // docs/superpowers/specs/parser/2026-08-28-nearmiss-candidacy-field-lists-design.md).
    // Kept in the residual-class register rather than deleted: the register is what a
    // reader consults to learn what this detector deliberately does and does not report,
    // and a class that silently disappears from it reads as an oversight.
    //
    // Differential, via a control measured to fire, so "no echo" can never mean "the
    // detector never ran". The label still MATCHES — that is the whole point of the
    // premise below; only its home is disqualified.
    const md = fixtureTable(CONSULTANTS_RAW, "Timestamp");
    premiseHolds(
      "the echo row still matches its vocabulary entry",
      matchVocabulary("Room Diagram", vocab)?.entry.raw === "DETAILS/ROOM DIAGRAM",
    );
    expectContributesNothing(md);
  });

  it("Speaker against Virtual Speaker is RETIRED: its only home was an inventory matrix", () => {
    // INVERTED for the same reason, by the other arm. `Speaker` matched `Virtual Speaker`
    // and cleared every label guard; it fired only inside `Console` blocks, every one of
    // which carries at least 6 value cells on every row.
    premiseHolds("vocabulary contains the target alias", vocab.has("virtual speaker"));
    premiseHolds(
      "and Speaker still matches it",
      matchVocabulary("Speaker", vocab)?.entry.raw === "Virtual Speaker",
    );
    expectContributesNothing(fixtureTable(RIA_RAW, "Speaker"));
  });

  it("Diagrams? fires and reports the alias table's raw spelling", () => {
    expect(emissionFor(fixtureTable(EAST_COAST_RAW, "Diagrams?"), "Diagrams?").candidate).toBe(
      "DIagrams",
    );
  });
});

// ── Emission topology (spec §2.1: the detector is the SOLE emitter) ──────────────────

/**
 * Every `emitUnknownField` INVOCATION in `src`, as 1-based line numbers.
 *
 * Counting mentions instead of call sites makes this pin wrong-but-green: `rawSnippet.ts`
 * names the emitter in a header comment, and every caller names it again on an import
 * line. `rg -c emitUnknownField lib/parser --glob '!warnings.ts'` sums to 8 lines before
 * the removals and 4 after, and neither number is the thing being pinned.
 *
 * So this reads the PARSE, not the text: a call site is a `CallExpression` whose callee
 * resolves to the emitter — as a bare identifier, as a property access
 * (`warnings.emitUnknownField(...)`), as an indexed access with a literal name, or through a
 * local alias declared by this file's own `import { emitUnknownField as X }`. Comments are not in the AST and an import specifier is not a call, so
 * both are excluded by construction rather than by a stripping pass that could be fooled.
 * (Hand-rolled comment handling in a guard is also forbidden — single source is
 * `tests/_shared/stripComments`, enforced by
 * `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts`.)
 */
function emitCallSiteLines(src: string): number[] {
  const sf = ts.createSourceFile("__scan.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: number[] = [];

  // THREE call shapes reach the emitter, and an earlier version of this scan recognized only
  // the first (whole-diff r3 P2, demonstrated with an AST probe using its own predicate):
  //   emitUnknownField(...)            bare identifier
  //   warnings.emitUnknownField(...)   namespace or property access
  //   emitUF(...)                      local alias from `import { emitUnknownField as emitUF }`
  // The third is why aliases are collected from the file's own import declarations rather
  // than guessed: a renaming import is ordinary TypeScript, not obfuscation, and the threat
  // model is an authoring mistake by a contributor who did not know this pin existed.
  const aliases = new Set<string>(["emitUnknownField"]);
  const namesFor = (name: ts.BindingName): string[] => (ts.isIdentifier(name) ? [name.text] : []);
  const collectAliases = (n: ts.Node): void => {
    // Import alias: `import { emitUnknownField as emitUF } from ...`
    if (ts.isImportDeclaration(n)) {
      const named = n.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          if ((el.propertyName ?? el.name).text === "emitUnknownField") aliases.add(el.name.text);
        }
      }
    }
    // Local alias: `const emitUF = emitUnknownField;` / `= warnings.emitUnknownField;`
    // and renamed destructuring: `const { emitUnknownField: emitUF } = warnings;`
    // All three are ordinary TypeScript a contributor could write without knowing this pin
    // exists, which is the threat model — an AST probe showed the import case counted and
    // both of these missed (whole-diff r6 P2).
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const init = n.initializer;
      const initNamesEmitter =
        (ts.isIdentifier(init) && aliases.has(init.text)) ||
        (ts.isPropertyAccessExpression(init) && init.name.text === "emitUnknownField");
      if (initNamesEmitter) for (const nm of namesFor(n.name)) aliases.add(nm);
      if (ts.isObjectBindingPattern(n.name)) {
        for (const el of n.name.elements) {
          const source = (el.propertyName ?? el.name) as ts.Node;
          const sourceText = ts.isIdentifier(source) ? source.text : null;
          if (sourceText === "emitUnknownField")
            for (const nm of namesFor(el.name)) aliases.add(nm);
        }
      }
    }
    ts.forEachChild(n, collectAliases);
  };
  // Two passes: an alias may be declared after the alias it is built from, and the walk is
  // over a single file's AST, so a second pass is cheap and removes the ordering dependency.
  collectAliases(sf);
  collectAliases(sf);

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const hit =
        (ts.isIdentifier(callee) && aliases.has(callee.text)) ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === "emitUnknownField") ||
        (ts.isElementAccessExpression(callee) &&
          ts.isStringLiteralLike(callee.argumentExpression) &&
          callee.argumentExpression.text === "emitUnknownField");
      if (hit) out.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * Trees the walk does NOT descend into, each with the one clause that justifies it.
 *
 * This is a DENY-list on purpose. An allow-list of source roots re-opens the moment someone
 * adds a top-level directory, and that is not hypothetical: a four-root allow-list
 * (`app`/`components`/`lib`/`scripts`) shipped in this file's first version and already
 * missed `supabase/seed.ts`, an authored non-test file that imports `lib/parser` and sat
 * outside every listed root. Walking from the repo root and subtracting a justified set
 * makes a new directory covered by DEFAULT, which is what the class-sweep rule means by a
 * derived cover rather than an enumeration.
 */
const EXCLUDED_DIRS = new Map<string, string>([
  ["node_modules", "vendored dependencies: no authored call sites, and descending costs seconds"],
  [
    "tests",
    "a test may legitimately call the emitter directly — tests/parser/warnings.test.ts does, to pin the emitter's own contract",
  ],
  [
    "docs",
    "probe and evidence scripts; they DO import lib/parser, but they are review artifacts, not shipped call sites",
  ],
  ["test-results", "Playwright run output (gitignored)"],
  ["coverage", "coverage report output (gitignored when present)"],
]);

/**
 * Every source file under `dir`, recursively, as repo-relative paths.
 *
 * The extension set is every one this repo can COMPILE AND RUN, not just the two most source
 * files happen to use: `tsconfig.json` sets `allowJs`, explicitly includes an `.mts` glob, and
 * Next builds `.mjs` config and script files. A `.ts`/`.tsx`-only walk therefore let a second
 * emitter land in a `.mts` or `.js` production file without failing a guard whose entire
 * claim is whole-repository sole-emitter coverage (whole-diff r5 P2). The parse is TS-mode
 * for every extension, which reads plain JS correctly.
 *
 * Dot-prefixed entries are skipped wholesale: VCS (`.git`), CI config (`.github`), agent and
 * editor state (`.claude`, `.serena`, `.superpowers`, `.impeccable`), and build output
 * (`.next`) all live there and none holds an authored call site.
 */
const SOURCE_EXT = /\.(?:tsx?|mts|cts|jsx?|mjs|cjs)$/;

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir === "" ? "." : dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name.startsWith(CORPUS_TEMP_PREFIX)) continue;
    const p = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(p)) continue;
      out.push(...walkTs(p));
    } else if (SOURCE_EXT.test(entry.name)) out.push(p);
  }
  return out;
}

/** The four roots the superseded allow-list named — kept ONLY to prove the walk exceeds them. */
const SUPERSEDED_ALLOW_LIST = ["app/", "components/", "lib/", "scripts/"];

describe("emitUnknownField call-site topology", () => {
  it("has exactly one call site in the whole repository, and it is the detector", () => {
    // Repo-root walk minus a justified deny-list, so a NEW top-level directory is covered by
    // default and a would-be gap fails here instead of sitting silently outside the set.
    const files = walkTs("").filter((f) => f !== "lib/parser/warnings.ts");
    premise("the repository was actually walked", files.length, 500);
    premiseHolds(
      "the definition file is excluded, so its own declaration cannot be miscounted",
      !files.includes("lib/parser/warnings.ts"),
    );

    // Non-vacuity for the deny-list itself: `supabase/seed.ts` is the live file the old
    // allow-list missed — an authored, non-test module that imports `lib/parser`. Both halves
    // are asserted, so the witness cannot rot into one the old list would have covered anyway.
    expect(files, "supabase/seed.ts must be in the walk").toContain("supabase/seed.ts");
    expect(
      SUPERSEDED_ALLOW_LIST.some((r) => "supabase/seed.ts".startsWith(r)),
      "the witness must sit OUTSIDE the superseded allow-list, or it proves nothing",
    ).toBe(false);

    const sites = files.flatMap((f) =>
      emitCallSiteLines(readFileSync(f, "utf8")).map((line) => `${f}:${line}`),
    );
    expect(sites.map((s) => s.split(":")[0])).toEqual(["lib/parser/fieldNearMiss.ts"]);
  });

  it("counts invocations, not mentions — comments and imports never register", () => {
    // The discriminating cases, stated on inputs of this test's own making: the shapes
    // that actually occur in the tree (a header-comment mention, an import naming the
    // symbol) must not count, while a real call must.
    expect(emitCallSiteLines(`// emitUnknownField(agg, opts) writes rawSnippet\n`)).toEqual([]);
    expect(emitCallSiteLines(`import { emitUnknownField } from "./warnings";\n`)).toEqual([]);
    expect(emitCallSiteLines(`import {\n  emitUnknownField,\n} from "./warnings";\n`)).toEqual([]);
    expect(emitCallSiteLines(`/**\n * emitUnknownField(agg, o);\n */\n`)).toEqual([]);
    expect(emitCallSiteLines(`const s = "emitUnknownField(agg, o)";\n`)).toEqual([]);
    expect(emitCallSiteLines(`x();\nemitUnknownField(agg, o);\n`)).toEqual([2]);
    // Two calls in ONE file are two sites, so the topology assertion above cannot be
    // satisfied by a file that emits twice.
    expect(emitCallSiteLines(`emitUnknownField(a, b);\nemitUnknownField(c, d);\n`)).toEqual([1, 2]);
  });
});

// ── Emission carrier (spec §5, decided r4 finding 1) ─────────────────────────────────

describe("emitUnknownField candidate carrier", () => {
  it("carries the candidate as a structured field AND names it in the message", () => {
    const agg = newAggregator();
    emitUnknownField(agg, {
      block: "details",
      kind: "details",
      key: " Stage ",
      value: "8' x 24' x 2'",
      candidate: "Stage Size",
    });
    const w = agg.warnings[0]!;
    expect(w.candidate).toBe("Stage Size");
    expect(w.message).toContain("'Stage'");
    expect(w.message).toContain("Stage Size");
    expect(agg.rawUnrecognized).toEqual([
      { block: "details", key: "Stage", value: "8' x 24' x 2'" },
    ]);
  });

  it("omits the KEY entirely when no candidate is supplied (absence discriminates)", () => {
    const agg = newAggregator();
    emitUnknownField(agg, { block: "event_details", kind: "details", key: "Rigging", value: "2" });
    expect(Object.hasOwn(agg.warnings[0]!, "candidate")).toBe(false);
    expect(agg.warnings[0]!.message).toBe("Unrecognized event_details row label: 'Rigging'");
  });
});

// ── Source-mutation enrollment (AC-N7) ───────────────────────────────────────────────

describe("the detector is enrolled in the source-mutation guard registry (AC-N7)", () => {
  const surfaceById = new Map(GUARD_SURFACES.map((s) => [s.id, s]));

  it("enrolls lib/parser/fieldNearMiss.ts with THIS suite deciding its verdicts", () => {
    const surface = surfaceById.get("fieldNearMiss");
    expect(surface, "no GUARD_SURFACES row with id 'fieldNearMiss'").toBeDefined();
    expect(surface!.sourcePath).toBe("lib/parser/fieldNearMiss.ts");
    // A surface whose suites never import the module scores nothing: every mutant runs
    // in code the suite cannot reach. Naming THIS file is what makes the row live.
    expect(surface!.suitePaths).toContain("tests/parser/fieldNearMiss.test.ts");
  });

  it("puts the OPENER derivation under mutation too, wherever it lives", () => {
    // The block opener is what makes an occurrence identity: it is the only reason the
    // consumption key distinguishes a byte-identical row in two different blocks
    // ("keys consumption by block OPENER" above). It lives outside fieldNearMiss.ts —
    // blocks/venue.ts reads openers too, and importing the detector from a block file
    // would close a module cycle — so enrolling only fieldNearMiss.ts would leave the
    // load-bearing half unmutated. Derived, not named: the assertion finds the enrolled
    // surface whose source DECLARES the function, so moving the function back out of an
    // enrolled file reds this rather than silently passing.
    const owners = GUARD_SURFACES.filter((s) =>
      /^export function scanRowsWithOpener\b/m.test(readFileSync(s.sourcePath, "utf8")),
    );
    expect(
      owners.map((s) => s.id),
      "no enrolled guard surface declares scanRowsWithOpener — the opener derivation is outside the mutation surface",
    ).toHaveLength(1);
    expect(owners[0]!.suitePaths).toContain("tests/parser/fieldNearMiss.test.ts");
  });

  it("the call-site scan sees all three shapes an ordinary contributor would write", () => {
    // The version this replaces matched only a bare identifier callee, so a second emitter
    // written as `warnings.emitUnknownField(...)` or through a renaming import evaded a pin
    // whose whole claim is filesystem-wide sole-emitter coverage. Each source below is a
    // separate call shape; each must be counted, and the negative controls must not be.
    const positives: [string, string][] = [
      ["bare identifier", "emitUnknownField(agg, o);"],
      ["property access", "warnings.emitUnknownField(agg, o);"],
      ["indexed access", 'warnings["emitUnknownField"](agg, o);'],
      [
        "renaming import",
        'import { emitUnknownField as emitUF } from "@/lib/parser/warnings";\nemitUF(agg, o);',
      ],
      [
        "local alias",
        'import { emitUnknownField } from "@/lib/parser/warnings";\nconst emitUF = emitUnknownField;\nemitUF(agg, o);',
      ],
      [
        "local alias of a property access",
        'import * as warnings from "@/lib/parser/warnings";\nconst emitUF = warnings.emitUnknownField;\nemitUF(agg, o);',
      ],
      [
        "renamed destructuring",
        'import * as warnings from "@/lib/parser/warnings";\nconst { emitUnknownField: emitUF } = warnings;\nemitUF(agg, o);',
      ],
    ];
    for (const [shape, src] of positives) {
      expect(emitCallSiteLines(src), `${shape} must be counted`).toHaveLength(1);
    }
    const negatives: [string, string][] = [
      ["import specifier alone", 'import { emitUnknownField } from "@/lib/parser/warnings";'],
      ["comment", "// emitUnknownField(agg, o);"],
      ["string literal", 'const s = "emitUnknownField(agg, o)";'],
      ["unrelated alias target", 'import { other as emitUF } from "x";\nemitUF(agg, o);'],
      ["unrelated local alias", "const emitUF = somethingElse;\nemitUF(agg, o);"],
      ["unrelated destructuring", "const { other: emitUF } = warnings;\nemitUF(agg, o);"],
    ];
    for (const [shape, src] of negatives) {
      expect(emitCallSiteLines(src), `${shape} must NOT be counted`).toEqual([]);
    }
  });

  it("both rows are structurally valid, so neither gate runs vacuously", () => {
    // validateSurface is where a control anchor that no longer occurs verbatim is caught.
    // A control that mutates nothing leaves the liveness proof asserting a no-op, and the
    // whole run could then be scoring mutants against clean source.
    const rows = [
      surfaceById.get("fieldNearMiss")!,
      ...GUARD_SURFACES.filter((s) =>
        /^export function scanRowsWithOpener\b/m.test(readFileSync(s.sourcePath, "utf8")),
      ),
    ];
    for (const row of rows) {
      expect(validateSurface(row), `${row.id}: ${validateSurface(row).join("; ")}`).toEqual([]);
      expect(row.operators.length).toBeGreaterThan(0);
    }
  });
});
