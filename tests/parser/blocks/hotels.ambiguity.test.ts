import { describe, it, expect, vi } from "vitest";
import { parseHotels, parseGuestCell } from "@/lib/parser/blocks/hotels";
import { newAggregator } from "@/lib/parser/warnings";
import { summarizeDataGaps } from "@/lib/parser/dataGaps";
import { applyUseRawDecisions } from "@/lib/sync/useRawOverlay";
import { buildParseResult } from "../../components/admin/wizard/_step3ReviewFixture";

// Silence the log-only telemetry warn() so the cardinality test doesn't spam.
vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Structured-table fixtures (parseGuestCell's only in-scope call sites) ─────
const singleCell = (namesCell: string, hotelName = "Grand Plaza Hotel") =>
  [
    "| HOTEL | RESERVATION \\#1 |  |  |",
    "| :---: | :---: | :---: | :---: |",
    "|  | Hotel Name / Address |  |  |",
    `|  | ${hotelName} |  |  |`,
    "|  | Names on Reservation |  |  |",
    `|  | ${namesCell} |  |  |`,
    "|  | Check In Date | Check Out Date |  |",
    "|  | 1/1/26 | 1/2/26 |  |",
  ].join("\n");

const guestWarnings = (md: string) => {
  const agg = newAggregator();
  parseHotels(md, "v4", agg);
  return agg.warnings.filter((w) => w.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS");
};

// ── PURE LAYER: parseGuestCell returns { ..., ambiguity?: { reasons } } ───────
describe("parseGuestCell — pure ambiguity metadata (no emission)", () => {
  it("glued 4-token fallback cell flags the fallback-4-tokens predicate", () => {
    const r = parseGuestCell("John Smith Jane Doe");
    expect(r.ambiguity?.reasons).toContain("fallback-4-tokens");
  });

  it("'Mary St. Claire' (3 name-like tokens) → no ambiguity", () => {
    expect(parseGuestCell("Mary St. Claire").ambiguity).toBeUndefined();
  });

  it("'José Núñez-Marín' (2 name-like tokens) → no ambiguity", () => {
    expect(parseGuestCell("José Núñez-Marín").ambiguity).toBeUndefined();
  });

  it("interior digit-run fires the FALLBACK branch via the digit-run predicate, NOT the tail branch", () => {
    // "Bob Smith 103317 Jones" has no dash → tokenRe never matches → fallback branch.
    // 3 name-like tokens (<4) but an interior \d{4,} run (neither at index 0 nor end).
    const r = parseGuestCell("Bob Smith 103317 Jones");
    expect(r.ambiguity?.reasons).toContain("interior-digit-run");
    expect(r.ambiguity?.reasons).not.toContain("tail-guest-appended");
    expect(r.ambiguity?.reasons).not.toContain("fallback-4-tokens");
  });

  it("boundary digit run at index 0 → no ambiguity ('103317 Bob Smith')", () => {
    expect(parseGuestCell("103317 Bob Smith").ambiguity).toBeUndefined();
  });

  it("boundary digit run at segment end → no ambiguity ('Bob Smith 103317')", () => {
    expect(parseGuestCell("Bob Smith 103317").ambiguity).toBeUndefined();
  });

  it("tail-only isolation: an un-numbered tail appended flags ONLY the tail branch", () => {
    const r = parseGuestCell("Doug - #103317 Extra Person");
    expect(r.ambiguity?.reasons).toContain("tail-guest-appended");
    expect(r.ambiguity?.reasons).not.toContain("interior-digit-run");
    expect(r.ambiguity?.reasons).not.toContain("fallback-4-tokens");
  });
});

// ── CALLER LAYER: one warning per triggering CELL ────────────────────────────
describe("parseHotels — HOTEL_GUEST_SPLIT_AMBIGUOUS emission (structured path)", () => {
  it("glued 4-token cell → exactly 1 warning", () => {
    expect(guestWarnings(singleCell("John Smith Jane Doe"))).toHaveLength(1);
  });

  it("interior digit-run cell → exactly 1 warning", () => {
    expect(guestWarnings(singleCell("Bob Smith 103317 Jones"))).toHaveLength(1);
  });

  it("tail-only cell → exactly 1 warning", () => {
    expect(guestWarnings(singleCell("Doug - #103317 Extra Person"))).toHaveLength(1);
  });

  it("well-formed guest cell → no warning", () => {
    expect(guestWarnings(singleCell("Alice - #51111"))).toHaveLength(0);
  });

  it("tokenized cell whose NAME is itself glued (4 tokens before the conf#) → 1 warning", () => {
    // The conf# token matches and consumes "John Smith Jane Doe" as ONE name; the glued
    // multi-guest name must still be flagged (Codex R4 HIGH — matched path bypassed it).
    expect(guestWarnings(singleCell("John Smith Jane Doe - #1234"))).toHaveLength(1);
  });

  it("tokenized cell with a clean 2-token name + conf# → no warning (control)", () => {
    expect(guestWarnings(singleCell("Douglas Larson - #2069854"))).toHaveLength(0);
  });

  it("multi-segment cell (fallback + tail branches) → exactly 1 warning per cell", () => {
    expect(
      guestWarnings(singleCell("John Smith Jane Doe / Doug - #103317 Extra Person")),
    ).toHaveLength(1);
  });

  it("two ambiguous cells → exactly 2 warnings", () => {
    const md = [
      "| HOTEL | RESERVATION \\#1 |  | RESERVATION \\#2 |",
      "| :---: | :---: | :---: | :---: |",
      "|  | Hotel Name / Address |  | Hotel Name / Address |",
      "|  | Grand Plaza Hotel |  | Seaside Inn Resort |",
      "|  | Names on Reservation |  | Names on Reservation |",
      "|  | John Smith Jane Doe |  | Alice Brown Carol White |",
      "|  | Check In Date | Check Out Date | Check In Date |",
      "|  | 1/1/26 | 1/5/26 | 1/2/26 |",
    ].join("\n");
    expect(guestWarnings(md)).toHaveLength(2);
  });

  it("anchors: blockRef {kind:'hotels', name:<resolved>, field:'guests'} + rawSnippet = whole cell", () => {
    const w = guestWarnings(singleCell("John Smith Jane Doe", "Grand Plaza Hotel"));
    expect(w).toHaveLength(1);
    expect(w[0]!.severity).toBe("warn");
    expect(w[0]!.blockRef).toMatchObject({
      kind: "hotels",
      name: "Grand Plaza Hotel",
      field: "guests",
    });
    expect(w[0]!.rawSnippet).toBe("John Smith Jane Doe");
  });

  it("NO warning for a discarded (dash-only / unresolved) hotel slot", () => {
    // Dash-only "Hotel Name / Address" leaves hotel_name unset, so the slot is dropped at
    // the survival loop. Emitting a judgment warning for a hotel that ships no kept value
    // would violate the ambiguity contract + single-commit discipline (Codex R3 HIGH), so
    // the guest-split emit is gated on slot survival and nothing fires here.
    const w = guestWarnings(singleCell("John Smith Jane Doe", "-"));
    expect(w).toHaveLength(0);
  });
});

// ── HOTEL_CARDINALITY_EXCEEDED promoted to a ParseWarning (§4.2b) ─────────────
describe("parseHotels — HOTEL_CARDINALITY_EXCEEDED aggregator warning", () => {
  const md =
    "| Hotel Reservations | Grand Hotel Doug Larson - 1001 Check In: 3/1 Check Out: 3/2 " +
    "Eric Weiss - 1002 Check In: 3/1 Check Out: 3/2 " +
    "John Carleo - 1003 Check In: 3/1 Check Out: 3/2 " +
    "Jane Doe - 1004 Check In: 3/1 Check Out: 3/2 " +
    "Bob Smith - 1005 Check In: 3/1 Check Out: 3/2 |";

  it("lands in agg.warnings with severity 'warn', blockRef {kind:'hotels'}, NO field", () => {
    const agg = newAggregator();
    const hotels = parseHotels(md, "v2", agg);
    expect(hotels).toHaveLength(4); // truncated to cap
    const w = agg.warnings.filter((x) => x.code === "HOTEL_CARDINALITY_EXCEEDED");
    expect(w).toHaveLength(1);
    expect(w[0]!.severity).toBe("warn");
    expect(w[0]!.blockRef).toEqual({ kind: "hotels" });
    expect(w[0]!.blockRef && "field" in w[0]!.blockRef).toBe(false);
  });

  it("is counted by summarizeDataGaps (GAP_CLASSES routing)", () => {
    const agg = newAggregator();
    parseHotels(md, "v2", agg);
    expect(summarizeDataGaps(agg.warnings).classes.HOTEL_CARDINALITY_EXCEEDED).toBe(1);
  });

  // Off-by-one boundary: the guard is `> cap`, so EXACTLY cap (4) hotels must NOT
  // warn (the 5-entry `md` above is the +1 case; this is the at-cap case).
  it("does NOT warn at exactly the cap (4 hotels — boundary is strictly greater-than)", () => {
    const atCap =
      "| Hotel Reservations | Grand Hotel Doug Larson - 1001 Check In: 3/1 Check Out: 3/2 " +
      "Eric Weiss - 1002 Check In: 3/1 Check Out: 3/2 " +
      "John Carleo - 1003 Check In: 3/1 Check Out: 3/2 " +
      "Jane Doe - 1004 Check In: 3/1 Check Out: 3/2 |";
    const agg = newAggregator();
    const hotels = parseHotels(atCap, "v2", agg);
    expect(hotels).toHaveLength(4); // all kept, none dropped
    expect(agg.warnings.filter((x) => x.code === "HOTEL_CARDINALITY_EXCEEDED")).toHaveLength(0);
  });
});

// ── Structured-table overflow: RESERVATION #5+ must reach the cardinality cap AND
//    an over-cap ambiguous guest cell must stay silent (kept-hotels-only) — Codex R5 ──
describe("parseHotels — structured table overflow (>4 reservations)", () => {
  // Five RESERVATION slots across three row-groups. The 5th guest cell is glued
  // (4 tokens) — it must NOT warn because slot #5 is truncated by the cap.
  const fiveResTable = [
    "| HOTEL | RESERVATION \\#1 |  | RESERVATION \\#2 |",
    "| :---: | :---: | :---: | :---: |",
    "|  | Hotel Name / Address |  | Hotel Name / Address |",
    "|  | Hotel One |  | Hotel Two |",
    "|  | Names on Reservation |  | Names on Reservation |",
    "|  | Alice Brown |  | Bob Carter |",
    "|  | RESERVATION \\#3 |  | RESERVATION \\#4 |",
    "|  | Hotel Name / Address |  | Hotel Name / Address |",
    "|  | Hotel Three |  | Hotel Four |",
    "|  | Names on Reservation |  | Names on Reservation |",
    "|  | Carol Diaz |  | Dave Evans |",
    "|  | RESERVATION \\#5 |  |  |",
    "|  | Hotel Name / Address |  |  |",
    "|  | Hotel Five |  |  |",
    "|  | Names on Reservation |  |  |",
    "|  | John Smith Jane Doe |  |  |",
  ].join("\n");

  it("emits HOTEL_CARDINALITY_EXCEEDED and truncates to 4 (structured RESERVATION #5)", () => {
    const agg = newAggregator();
    const hotels = parseHotels(fiveResTable, "v4", agg);
    expect(hotels).toHaveLength(4);
    expect(agg.warnings.filter((x) => x.code === "HOTEL_CARDINALITY_EXCEEDED")).toHaveLength(1);
  });

  it("does NOT emit HOTEL_GUEST_SPLIT_AMBIGUOUS for the truncated over-cap hotel", () => {
    // Only hotel #5's guest cell is ambiguous, and #5 is dropped by the cap — so no
    // guest-split warning fires (a warning for a hotel that is not shown would violate
    // the ambiguity contract + kept-hotels-only single-commit discipline).
    const agg = newAggregator();
    parseHotels(fiveResTable, "v4", agg);
    expect(agg.warnings.filter((x) => x.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS")).toHaveLength(0);
  });
});

// ── T2 characterization guards for the commitHotels refactor ─────────────────
//
// These pin behavior that the single-commit-point refactor must PRESERVE, so
// they are written before it and must stay green through it (a refactor has no
// red step of its own; its safety net is what it must not break).
//
// Both properties were found under-discriminated by spec review R8/R9: the
// single-ambiguity cardinality test caught only "cardinality first", and the
// index test used a single-row array where "no other row" was vacuous.
describe("parseHotels — commitHotels invariants (T2)", () => {
  // Slots 1 and 2 both carry a glued guest cell; slot 5 forces the cap.
  const twoAmbiguousOverCap = [
    "| HOTEL | RESERVATION \\#1 |  | RESERVATION \\#2 |",
    "| :---: | :---: | :---: | :---: |",
    "|  | Hotel Name / Address |  | Hotel Name / Address |",
    "|  | Hotel One |  | Hotel Two |",
    "|  | Names on Reservation |  | Names on Reservation |",
    "|  | John Smith Jane Doe |  | Mary Jones Paul Reed |",
    "|  | RESERVATION \\#3 |  | RESERVATION \\#4 |",
    "|  | Hotel Name / Address |  | Hotel Name / Address |",
    "|  | Hotel Three |  | Hotel Four |",
    "|  | Names on Reservation |  | Names on Reservation |",
    "|  | Carol Diaz |  | Dave Evans |",
    "|  | RESERVATION \\#5 |  |  |",
    "|  | Hotel Name / Address |  |  |",
    "|  | Hotel Five |  |  |",
    "|  | Names on Reservation |  |  |",
    "|  | Alice Brown |  |  |",
  ].join("\n");

  it("emits ALL surviving ambiguities before the cardinality warning", () => {
    const agg = newAggregator();
    parseHotels(twoAmbiguousOverCap, "v4", agg);
    const seq = agg.warnings
      .filter(
        (w) => w.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS" || w.code === "HOTEL_CARDINALITY_EXCEEDED",
      )
      .map((w) => w.code);
    // Asserted by POSITION, not by code filter: an implementation emitting
    // ambiguity #1, cardinality, ambiguity #2 passes a code-filtered check.
    expect(seq).toEqual([
      "HOTEL_GUEST_SPLIT_AMBIGUOUS",
      "HOTEL_GUEST_SPLIT_AMBIGUOUS",
      "HOTEL_CARDINALITY_EXCEEDED",
    ]);
  });

  it("anchors blockRef.index to the FINAL array position, not the ordinal", () => {
    // Slot 1 is dash-only and is discarded, so the surviving reservations are
    // Hotel Two (index 0) and Hotel Three (index 1). Only Hotel Three is
    // ambiguous, so its warning must carry index 1 — an ordinal-based
    // implementation would emit 2, and a pre-filter-position one would emit 2.
    const skippedFirst = [
      "| HOTEL | RESERVATION \\#1 |  | RESERVATION \\#2 |",
      "| :---: | :---: | :---: | :---: |",
      "|  | Hotel Name / Address |  | Hotel Name / Address |",
      "|  | - |  | Hotel Two |",
      "|  | Names on Reservation |  | Names on Reservation |",
      "|  | - |  | Bob Carter |",
      "|  | RESERVATION \\#3 |  |  |",
      "|  | Hotel Name / Address |  |  |",
      "|  | Hotel Three |  |  |",
      "|  | Names on Reservation |  |  |",
      "|  | Doug Larson - \\#1001 Eric Weiss Jane Doe Bob Roe |  |  |",
    ].join("\n");
    const agg = newAggregator();
    const hotels = parseHotels(skippedFirst, "v4", agg);
    expect(hotels.map((h) => h.hotel_name)).toEqual(["Hotel Two", "Hotel Three"]);
    const w = agg.warnings.filter((x) => x.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS");
    expect(w).toHaveLength(1);
    const warning = w[0]!;
    expect(w[0]!.blockRef?.index).toBe(1);
    expect(w[0]!.blockRef).toMatchObject({ kind: "hotels", name: "Hotel Three" });

    // Asserting the emitted index alone is not enough (plan review R2 finding 8):
    // an overlay branch that always rewrites reservation 0 passes it. Drive the
    // decision through applyUseRawDecisions and prove reservation 1 alone moved.
    const res = warning.resolution;
    expect(res?.resolvable).toBe(true);
    const applied = applyUseRawDecisions(
      buildParseResult({ hotelReservations: hotels, warnings: agg.warnings }),
      [
        {
          code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
          contentHash: (res as Extract<typeof res, { resolvable: true }>).contentHash,
          target: { kind: "hotels", index: 1 },
          preference: "raw",
          applied: false,
          decidedAt: "2026-07-25T00:00:00.000Z",
          decidedBy: "test",
        },
      ],
    );
    expect(applied.result.hotelReservations[0]).toEqual(hotels[0]);
    expect(applied.result.hotelReservations[1]!.names).not.toEqual(hotels[1]!.names);
  });
});
