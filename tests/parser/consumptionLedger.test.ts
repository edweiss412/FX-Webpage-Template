// Spec §3.3 (resolution-site): curated RESOLUTIONS mark rows consumed - including
// resolved rows whose value is empty/filtered; fallback self-slug storage does NOT.
// Failure modes caught: fallback rows wrongly ledgered (would silence Stage/Storage, the
// corpus's most-confirmed true positives); curated rows not ledgered (Room Diagram would
// self-report as a near-miss); write-site marking regression (empty-value Room Diagram
// unledgered would resurrect the r4 self-near-miss false-positive class).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { newAggregator } from "@/lib/parser/warnings";
import { parseSheet } from "@/lib/parser";
import { parseEventDetails, SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/event";
import { parseVenue } from "@/lib/parser/blocks/venue";
import { parseOps } from "@/lib/parser/blocks/ops";
import { parseTransportation, TRANSPORT_SCHEDULE_VOCAB } from "@/lib/parser/blocks/transport";
import { premiseHolds } from "@/tests/_shared/premise";

const hasEntry = (keys: string[], opener: string, c0: string) =>
  keys.some((k) => k.startsWith(`${opener}\u0000${c0}\u0000`));

describe("consumption ledger (spec §3.3)", () => {
  const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");

  it("curated event resolution marks consumed; fallback self-slug does not", () => {
    premiseHolds("fixture has a DETAILS section with Stage row", /\|\s*Stage\s*\|/.test(md));
    const agg = newAggregator();
    parseEventDetails(md, "v4", agg);
    const consumedKeys = [...agg.consumed.keys()];
    // "Stage"/"Storage" take event.ts's unknown-label fallback (self-slug storage), NOT consumed
    // (label position 2 of the opener\u0000label\u0000value triple - no key carries them)
    expect(consumedKeys.some((k) => k.split("\u0000")[1] === "Stage")).toBe(false);
    expect(consumedKeys.some((k) => k.split("\u0000")[1] === "Storage")).toBe(false);
    // At least one curated CANONICAL_KEY_MAP row from the fixture IS consumed
    expect(agg.consumed.size).toBeGreaterThan(0);
    // Resolution-site: the fixture's EMPTY-value "Room Diagram" row (DETAILS block) is
    // consumed even though presence() suppresses its write - the r4 semantics distinction.
    // Keyed under the DETAILS opener; an identical Timestamp-block row stays unledgered
    // (plan-r1 finding 1 occurrence identity).
    expect(hasEntry(consumedKeys, "DETAILS", "Room Diagram")).toBe(true);
  });

  it("form-layout harvest resolution marks consumed; HARVEST_EXCLUDED_CANON does not", () => {
    // Spec §3.3 names the harvest's `resolveKnownCanon` (event.ts:292-298 drafting-time
    // locator) as a consuming path alongside the classic branch. The consultants fixture is
    // one of the five raw shows whose classic DETAILS block is label-only, so
    // `parseEventDetails` falls through to `harvestFormLayout` and the form tables are the
    // only source of fields (measured in-task; the premise below re-proves it executably).
    // Failure modes caught: the harvest path left unmarked (its resolved rows would warn as
    // near-misses of correctly named fields — the r4 class, in a second parser branch); and a
    // form-layout `Room Diagram` WRONGLY marked, which would silence a Timestamp-block row the
    // baseline requires to fire (spec §3.2, plan-r1 finding 1 occurrence identity).
    const fmd = readFileSync("fixtures/shows/raw/2025-10-consultants-roundtable.md", "utf8");
    const formStart = /^\|\s*Timestamp\s*\|/m.exec(fmd);
    premiseHolds("fixture has a form-layout table opened by a Timestamp row", formStart !== null);
    const classicOnly = fmd.slice(0, formStart!.index);
    // The harvest runs ONLY when the classic pass wrote nothing (event.ts:263). Parsing the
    // document with the form table removed exercises exactly that pass, so an empty payload
    // here proves the full-document parse below reached the harvest — without it, every
    // assertion in this case could be satisfied by the classic branch instead.
    premiseHolds(
      "the classic DETAILS block yields zero fields on this fixture, so the harvest path runs",
      Object.keys(parseEventDetails(classicOnly, "v4")).length === 0,
    );
    const formRegion = fmd.slice(formStart!.index);
    premiseHolds(
      "the form table carries both a Virtual Audience row and a Room Diagram row",
      /^\|\s*Virtual Audience\s*\|/m.test(formRegion) &&
        /^\|\s*Room Diagram\s*\|/m.test(formRegion),
    );

    const agg = newAggregator();
    parseEventDetails(fmd, "v4", agg);
    const keys = [...agg.consumed.keys()];
    // `Timestamp` is not a DETAILS-family header token, so a mark under that opener can only
    // have come from the harvest.
    expect(SECTION_HEADER_TOKENS.some((t) => t.toUpperCase() === "TIMESTAMP")).toBe(false);
    expect(hasEntry(keys, "Timestamp", "Virtual Audience")).toBe(true);
    // Resolution-site inside the harvest branch: the DETAIL CHECKLIST run's rows all carry the
    // checklist boolean FALSE, which `harvestFormLayout` filters out before writing anything —
    // yet the label resolved, so the row is consumed. Without this the case could not
    // distinguish resolution-site from write-site marking on the harvest path (the Timestamp
    // row above carries a real value and survives either rule).
    premiseHolds(
      "the DETAIL CHECKLIST run's Polling row carries the filtered checklist boolean",
      /^\|\s*Polling\s*\|\s*FALSE\s*\|/m.test(formRegion),
    );
    expect(hasEntry(keys, "DETAIL CHECKLIST", "Polling")).toBe(true);
    // HARVEST_EXCLUDED_CANON (`floor_plan`, `room_diagram`) resolves to null in the harvest —
    // in a form block these read as prose questions — so the row stays a near-miss candidate.
    expect(hasEntry(keys, "Timestamp", "Room Diagram")).toBe(false);
    // ...while the SAME label in the same document IS consumed under the classic DETAILS
    // opener. One label, two openers, opposite outcomes: the negative above is a real
    // discrimination, not an absence of any Room Diagram mark at all.
    expect(hasEntry(keys, "DETAILS", "Room Diagram")).toBe(true);
  });

  it("transport driver-regex resolution marks consumed (plan-r2 finding 1)", () => {
    // fintech's Load In: row resolves via the v4 driver regex (transport.ts:217), the
    // path Part C proved consumes it (CONSUMED_OTHER_KEY, changed=[transportation.driver_name]).
    // Failure mode caught: a transport file left unmarked lets Load In: warn -> baseline 66.
    const tmd = readFileSync("fixtures/shows/exporter-xlsx/fintech.md", "utf8");
    premiseHolds(
      "fixture has the Load In: driver row",
      /\|\s*Load In:\s*\|\s*Carlos Pineda\s*\|/.test(tmd),
    );
    const agg = newAggregator();
    parseTransportation(tmd, "v4", undefined, agg); // agg is the 4th param (transport.ts:134-140)
    const keys = [...agg.consumed.keys()];
    expect(hasEntry(keys, "TRANSPORTATION", "Load In:")).toBe(true);
  });

  it("V2 schedule-label membership marks consumed (plan-r3 finding 1)", () => {
    // The fintech v4 fixture resolves its stage rows via seenDateHeader, so membership
    // needs its own witness: a constructed v2 doc where V2_SCHEDULE_LABELS.has(label)
    // is the resolving condition (transport.ts:306 OR-branch and :400 both mark).
    // Failure mode caught: driver-regex mark alone turns the suite green with the
    // membership mark absent (plan-r3 finding).
    premiseHolds(
      "schedule vocabulary contains RENTAL PICKUP",
      TRANSPORT_SCHEDULE_VOCAB.includes("RENTAL PICKUP"),
    );
    // Header MUST match the live v2 matcher /^\|\s*TRANSPORTATION\s*\|\s*(?:NAME|TRANSPORTATION)\s*\|\s*PHONE\s*\|/im
    // (transport.ts:352 - a two-column header returns null before any membership branch; plan-r4 finding).
    const v2md = [
      "| TRANSPORTATION | TRANSPORTATION | PHONE |",
      "| Rental Pickup | 5/12 @ 8:00 AM |  |",
    ].join("\n");
    const agg = newAggregator();
    parseTransportation(v2md, "v2", undefined, agg);
    expect(hasEntry([...agg.consumed.keys()], "TRANSPORTATION", "Rental Pickup")).toBe(true);
  });
});

describe("the ledger COUNTS occurrences, and the reader draws them down (whole-diff r2 F1)", () => {
  // The writers count: `markConsumed` does `set(key, (get(key) ?? 0) + 1)`
  // (`lib/parser/warnings.ts:75`). The reader originally asked `.has(key)`, which is a SET
  // test, so a document holding the same (opener, label, value) triple TWICE had both rows
  // silenced by ONE resolution. That is a near-miss of a field the sheet shows going silent
  // with no signal at all — the one outcome the spec §1.1 item 8 consequence bound forbids —
  // and it is reachable by a single ordinary copy/paste edit inside the committed corpus.
  const FIXTURE = "fixtures/shows/exporter-xlsx/fintech.md";
  const md = readFileSync(FIXTURE, "utf8");
  const ROW = "| Load In: | Carlos Pineda |  |  |  |";

  // The emitted label is read from `rawSnippet`'s "<label> | <value>" head, which is the
  // field the emitter actually writes. An earlier draft of this case read a `key` property
  // that `ParseWarning` does not carry: every extraction came back "", both assertions
  // compared empty arrays, and the case failed even against the repaired parser. Scoped to
  // this one label so an unrelated corpus emission cannot satisfy it.
  const loadInWarnings = (doc: string): string[] =>
    (parseSheet(doc, "fintech.md").warnings ?? [])
      .filter((w) => w.code === "UNKNOWN_FIELD")
      .map(
        (w) =>
          String((w as { rawSnippet?: unknown }).rawSnippet ?? "")
            .split(" | ")[0]
            ?.trim() ?? "",
      )
      .filter((label) => label === "Load In:");

  it("the fixture really holds that row exactly once, and it is silent as shipped", () => {
    // Premise, executable: if the row moved or the label changed, the duplication below
    // would exercise nothing and the count assertion would pass vacuously.
    const occurrences = md.split("\n").filter((l) => l.trim() === ROW.trim()).length;
    premiseHolds(
      `${FIXTURE} holds "${ROW.trim()}" exactly once (found ${occurrences})`,
      occurrences === 1,
    );
    // And it is consumed today: `Load In:` is a near-miss of the vocabulary entry
    // "Load In at Venue", so if it were NOT ledgered it would already be warning.
    expect(loadInWarnings(md)).toEqual([]);
  });

  it("duplicating it warns exactly once — the second occurrence is not covered by the first", () => {
    const lines = md.split("\n");
    const at = lines.findIndex((l) => l.trim() === ROW.trim());
    const dup = [...lines.slice(0, at + 1), lines[at]!, ...lines.slice(at + 1)].join("\n");
    // Exactly one: the block parser resolves one occurrence, so one unit of the ledger's
    // count is drawn down and the remaining occurrence is an unresolved near-miss. Asserting
    // `toHaveLength(1)` fails in BOTH directions — 0 is the set-test bug it was written for,
    // and 2 would mean the draw-down stopped covering the resolved row at all.
    expect(loadInWarnings(dup)).toHaveLength(1);
  });
});

describe("a FUZZY resolution ledgers like an exact one (whole-diff r3 F1)", () => {
  // Spec §3.3 says a row is consumed when a block parser RESOLVES its label. The scoped
  // fuzzy fallbacks resolve — they populate the field and emit FIELD_LABEL_AUTOCORRECTED —
  // but they were not marking, so the near-miss detector then called the same row
  // unrecognized. The row was parsed AND reported unparsed, on an ordinary punctuation edit
  // of a field the sheet shows.
  //
  // Asserted through the BLOCK PARSERS rather than end-to-end: the ledger is what the
  // detector reads, so a mark landing in `agg.consumed` under the row's own
  // (opener, label, value) key is the property that fixes it, and payload population is
  // asserted alongside so the case cannot pass on a parser that resolved nothing.
  const consumedTriples = (agg: { consumed: Map<string, number> }): string[][] =>
    [...agg.consumed.keys()].map((k) => k.split("\u0000"));

  it("venue's scoped fuzzy fallback marks the row it corrected", () => {
    const doc = ["| VENUE NAME | Grand Hall |", "| Venue-Address | 1 Main St |"].join("\n");
    const agg = newAggregator();
    const venue = parseVenue(doc, "v4", agg) as { address?: string | null } | null;
    // Premise: the fuzzy branch actually ran. If `Venue-Address` stopped resolving, the
    // ledger assertion below would pass vacuously on an empty map.
    premiseHolds(
      "the fuzzy fallback resolved Venue-Address to venue.address",
      venue?.address === "1 Main St",
    );
    expect(consumedTriples(agg)).toContainEqual(["VENUE NAME", "Venue-Address", "1 Main St"]);
  });

  it("ops' scoped fuzzy fallback marks the row that won the candidate slot", () => {
    const doc = ["| OPS | |", "| Invoice-Notes | pay net 30 |"].join("\n");
    const agg = newAggregator();
    const ops = parseOps(doc, "v4", agg) as { invoice_notes?: string | null };
    premiseHolds(
      "the fuzzy fallback resolved Invoice-Notes to invoice_notes",
      ops.invoice_notes === "pay net 30",
    );
    expect(consumedTriples(agg)).toContainEqual(["OPS", "Invoice-Notes", "pay net 30"]);
  });

  // The third site, transport's `gatedVocabCorrect` v2 schedule recovery, carries the same
  // mark for the same reason but has NO case here, deliberately: hyphenating `Rental Pickup`
  // drops the leg on all seven corpus fixtures that carry it, so the branch is unreachable
  // from the committed corpus with that input and any test would be asserting a constructed
  // shape no sheet produces. Recorded rather than faked.
});
