// Spec §3.3 (resolution-site): curated RESOLUTIONS mark rows consumed - including
// resolved rows whose value is empty/filtered; fallback self-slug storage does NOT.
// Failure modes caught: fallback rows wrongly ledgered (would silence Stage/Storage, the
// corpus's most-confirmed true positives); curated rows not ledgered (Room Diagram would
// self-report as a near-miss); write-site marking regression (empty-value Room Diagram
// unledgered would resurrect the r4 self-near-miss false-positive class).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { newAggregator } from "@/lib/parser/warnings";
import { parseEventDetails, SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/event";
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
