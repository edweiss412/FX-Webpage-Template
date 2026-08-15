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
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DISTINCTIVENESS_MAX,
  MIN_LEN,
  buildVocabulary,
  detectFieldNearMisses,
  fusedForm,
  matchVocabulary,
  normalizeV3,
  scanRowsWithOpener,
  tokenDocFrequency,
} from "@/lib/parser/fieldNearMiss";
import { SECTION_HEADER_TOKEN_SETS } from "@/lib/parser/sectionHeaderTokens";
import { LABEL_TO_KIND_KEYS, canonicalSectionKind } from "@/lib/parser/sectionKind";
import { FIELD_ALIASES } from "@/lib/parser/aliases";
import { parseTableRows, splitRow } from "@/lib/parser/blocks/_helpers";
import { parseEventDetails } from "@/lib/parser/blocks/event";
import { parseContacts } from "@/lib/parser/blocks/contacts";
import { parseTransportation } from "@/lib/parser/blocks/transport";
import { emitUnknownField, newAggregator } from "@/lib/parser/warnings";
import type { ParseWarning } from "@/lib/parser/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";

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
    // Three fixtures carry an empty-value `Room Diagram` in BOTH a DETAILS-family block
    // (consumed) and the Timestamp block (must warn). A label+value key suppresses both,
    // or assigns consumption by document order — which is position-keyed, the defect
    // class this detector exists to remove.
    const details = fixtureTable(EAST_COAST_XLSX, "Room Diagram");
    const md = `${details}\n\n| Timestamp | 1/7/2025 0:00 |\n| Room Diagram |  |`;
    const emissions = emissionsFor(md).filter((w) => w.blockRef?.name === "Room Diagram");
    expect(emissions.length).toBe(1);
    expect(emissions[0]!.blockRef?.kind).toBe("timestamp");
  });
});

// ── Pinned residual classes (spec §3.2 is the authority; §9 documents them) ──────────

describe("calibrated residual classes fire exactly as baselined", () => {
  it("the Timestamp-block Google-Forms echo fires", () => {
    const md = fixtureTable(CONSULTANTS_RAW, "Timestamp");
    const w = emissionFor(md, "Room Diagram");
    expect(w.blockRef?.kind).toBe("timestamp");
    expect(w.candidate).toBe("DETAILS/ROOM DIAGRAM");
  });

  it("Speaker fires against Virtual Speaker", () => {
    premiseHolds("vocabulary contains the target alias", vocab.has("virtual speaker"));
    expect(emissionFor(fixtureTable(RIA_RAW, "Speaker"), "Speaker").candidate).toBe(
      "Virtual Speaker",
    );
  });

  it("Diagrams? fires and reports the alias table's raw spelling", () => {
    expect(emissionFor(fixtureTable(EAST_COAST_RAW, "Diagrams?"), "Diagrams?").candidate).toBe(
      "DIagrams",
    );
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
