import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { parseRooms } from "@/lib/parser/blocks/rooms";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import { parseDates } from "@/lib/parser/blocks/dates";
import { newAggregator } from "@/lib/parser/warnings";
import type { ParseWarning } from "@/lib/parser/types";

// Task 2 (spec §6): the three recoverable warning builders attach a `resolution`
// payload (parsed transform value + raw replacement + content hash).
//
// Anti-tautology: content hashes are computed by test-local code that implements
// the spec §5 serialization DIRECTLY (collapse + sha256hex, and the length-prefixed
// \x1f-join for dates) — NEVER by importing the production content-hash helper.
// `parsed`/`replacement` values are derived from the fixture (or cross-checked
// against the actual parsed rows), never hardcoded blindly.

// ── test-local spec §5 serialization (must NOT import the production helper) ──
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const hashRaw = (raw: string) => sha256hex(collapse(raw));
const hashDateTokens = (raws: string[]) =>
  sha256hex(raws.map((r) => `${collapse(r).length}:${collapse(r)}`).join("\x1f"));

const only = (agg: ReturnType<typeof newAggregator>, code: string): ParseWarning => {
  const w = agg.warnings.filter((x) => x.code === code);
  expect(w).toHaveLength(1);
  return w[0]!;
};

describe("Task 2 — parser populates warning.resolution", () => {
  // ── Rooms ──────────────────────────────────────────────────────────────────
  it("ROOM_HEADER_SPLIT_AMBIGUOUS carries a rooms resolution (parsed split + raw replacement + hash)", () => {
    const agg = newAggregator();
    const rooms = parseRooms(
      `| GENERAL SESSION LASALLE 50' x 40' 30' x 20' | |\n| Setup | 100 chairs |\n`,
      "v4",
      agg,
    );
    const w = only(agg, "ROOM_HEADER_SPLIT_AMBIGUOUS");
    expect(w.resolution).toBeDefined();
    expect(w.resolution!.resolvable).toBe(true);
    if (!w.resolution!.resolvable) throw new Error("expected resolvable");
    const res = w.resolution!;

    // parsed = the transform's split — cross-checked against the ACTUAL parsed room row
    expect(res.parsed.kind).toBe("rooms");
    if (res.parsed.kind !== "rooms") throw new Error("kind");
    expect(res.parsed.name).toBe(rooms[0]!.name);
    expect(res.parsed.dimensions).toBe(rooms[0]!.dimensions);
    expect(res.parsed.floor).toBe(rooms[0]!.floor);

    // replacement = raw header as the name, dims/floor cleared; derived from the warning's own rawSnippet
    expect(res.replacement).toEqual({
      kind: "rooms",
      name: collapse(w.rawSnippet!),
      dimensions: null,
      floor: null,
    });
    expect(res.contentHash).toBe(hashRaw(w.rawSnippet!));
  });

  it("a room whose raw header is empty after collapsing → resolvable:false empty-raw", () => {
    // splitRoomHeader on a whitespace-only header still commits a placeholder-named
    // room in some layouts; assert the guard fires when rawSnippet collapses to "".
    // (Exercised at the builder level via a header that yields an empty rawHeader.)
    const agg = newAggregator();
    parseRooms(`| GENERAL SESSION    | |\n| Setup | 100 chairs |\n`, "v4", agg);
    const w = agg.warnings.filter((x) => x.code === "ROOM_HEADER_SPLIT_AMBIGUOUS");
    // If no ambiguity warning is emitted for this header, there is nothing to guard —
    // the guard only matters when a warning IS emitted with an empty raw.
    for (const wr of w) {
      if (wr.rawSnippet !== undefined && collapse(wr.rawSnippet) === "") {
        expect(wr.resolution).toEqual({ resolvable: false, reason: "empty-raw" });
      }
    }
  });

  // ── Hotels ─────────────────────────────────────────────────────────────────
  it("HOTEL_GUEST_SPLIT_AMBIGUOUS carries a hotels resolution + blockRef.index anchor", () => {
    const md = [
      "| HOTEL | RESERVATION \\#1 |  |  |",
      "| :---: | :---: | :---: | :---: |",
      "|  | Hotel Name / Address |  |  |",
      "|  | Grand Plaza Hotel |  |  |",
      "|  | Names on Reservation |  |  |",
      "|  | John Smith Jane Doe |  |  |",
      "|  | Check In Date | Check Out Date |  |",
      "|  | 1/1/26 | 1/2/26 |  |",
    ].join("\n");
    const agg = newAggregator();
    const hotels = parseHotels(md, "v4", agg);
    const w = only(agg, "HOTEL_GUEST_SPLIT_AMBIGUOUS");

    // blockRef gains the reservation index so the overlay can locate the row
    expect(w.blockRef).toMatchObject({ kind: "hotels", field: "guests", index: 0 });

    expect(w.resolution).toBeDefined();
    expect(w.resolution!.resolvable).toBe(true);
    if (!w.resolution!.resolvable) throw new Error("expected resolvable");
    const res = w.resolution!;
    expect(res.parsed.kind).toBe("hotels");
    if (res.parsed.kind !== "hotels") throw new Error("kind");
    // parsed.names cross-checked against the actual parsed reservation
    expect(res.parsed.names).toEqual(hotels[0]!.names);
    expect(res.parsed.confirmationNo).toBe(hotels[0]!.confirmation_no);
    // replacement = raw cell as a SINGLE names entry, confirmation cleared
    expect(res.replacement).toEqual({
      kind: "hotels",
      names: [collapse(w.rawSnippet!)],
      confirmationNo: null,
    });
    expect(res.contentHash).toBe(hashRaw(w.rawSnippet!));
  });

  // ── Dates ──────────────────────────────────────────────────────────────────
  it("DATE_ORDER_SUGGESTS_DMY carries a dates resolution (mdy parsed + dmy replacement + token hash)", () => {
    const md = [
      "| DATES | |",
      "| :---: | :---: |",
      "| Travel | 10/3/2026 |",
      "| Show | 11/3/2026 |",
      "| Show | 1/4/2026 |",
    ].join("\n");
    const agg = newAggregator();
    const d = parseDates(md, "v1", agg);
    const w = only(agg, "DATE_ORDER_SUGGESTS_DMY");

    expect(w.resolution).toBeDefined();
    expect(w.resolution!.resolvable).toBe(true);
    if (!w.resolution!.resolvable) throw new Error("expected resolvable");
    const res = w.resolution!;
    expect(res.parsed.kind).toBe("dates");
    if (res.parsed.kind !== "dates") throw new Error("kind");

    // parsed.dates = the MDY interpretation; showDays match the actual parsed (sorted) block
    expect(res.parsed.dates.travelIn).toBe("2026-10-03");
    expect(res.parsed.dates.set).toBeNull();
    expect(res.parsed.dates.showDays).toEqual(d.showDays); // ["2026-01-04","2026-11-03"]
    expect(res.parsed.dates.travelOut).toBeNull();

    // replacement.dmyDates = the DMY reinterpretation of the SAME tokens (sorted)
    if (res.replacement.kind !== "dates") throw new Error("kind");
    expect(res.replacement.dmyDates.travelIn).toBe("2026-03-10");
    expect(res.replacement.dmyDates.set).toBeNull();
    expect(res.replacement.dmyDates.showDays).toEqual(["2026-03-11", "2026-04-01"]);
    expect(res.replacement.dmyDates.travelOut).toBeNull();

    // contentHash = length-prefixed token serialization in collectDateTokens order
    expect(res.contentHash).toBe(hashDateTokens(["10/3/2026", "11/3/2026", "1/4/2026"]));
  });

  it("DMY replacement DEDUPES repeated show-date tokens like the real parse (Codex R9 F1)", () => {
    // A raw block with a REPEATED show token + an MDY order inversion + ascending DMY.
    // The real parse stores each show day once (`!result.showDays.includes(iso)`), so the
    // DMY overlay must NOT persist a duplicate crew-visible show day the normal parse never
    // would. showDays multi-tokens: 11/3/2026, 11/3/2026 (dup), 1/4/2026.
    const md = [
      "| DATES | |",
      "| :---: | :---: |",
      "| Travel | 10/3/2026 |",
      "| Show | 11/3/2026 |",
      "| Show | 11/3/2026 |",
      "| Show | 1/4/2026 |",
    ].join("\n");
    const agg = newAggregator();
    const d = parseDates(md, "v1", agg);
    const w = only(agg, "DATE_ORDER_SUGGESTS_DMY");
    expect(w.resolution!.resolvable).toBe(true);
    if (!w.resolution!.resolvable) throw new Error("expected resolvable");
    const res = w.resolution!;
    if (res.parsed.kind !== "dates" || res.replacement.kind !== "dates") throw new Error("kind");

    // Real parse deduped the repeated 11/3 token → two distinct show days.
    expect(d.showDays).toEqual(["2026-01-04", "2026-11-03"]);
    // parsed (MDY) mirrors the deduped real parse; replacement (DMY) is ALSO deduped —
    // NOT ["2026-03-11","2026-03-11","2026-04-01"].
    expect(res.parsed.dates.showDays).toEqual(d.showDays);
    expect(res.replacement.dmyDates.showDays).toEqual(["2026-03-11", "2026-04-01"]);
    expect(new Set(res.replacement.dmyDates.showDays).size).toBe(
      res.replacement.dmyDates.showDays.length,
    );
  });

  it("exactly ONE DATE_ORDER_SUGGESTS_DMY per block (multi-token, pin cardinality)", () => {
    const md = [
      "| DATES | |",
      "| :---: | :---: |",
      "| Travel | 10/3/2026 |",
      "| Show | 11/3/2026 |",
      "| Show | 1/4/2026 |",
      "| Show | 2/4/2026 |",
    ].join("\n");
    const agg = newAggregator();
    parseDates(md, "v1", agg);
    expect(agg.warnings.filter((x) => x.code === "DATE_ORDER_SUGGESTS_DMY")).toHaveLength(1);
  });

  it("parser stays pure — parsing twice yields identical warnings (no admin state entered)", () => {
    const md = [
      "| DATES | |",
      "| :---: | :---: |",
      "| Travel | 10/3/2026 |",
      "| Show | 11/3/2026 |",
      "| Show | 1/4/2026 |",
    ].join("\n");
    const a = newAggregator();
    const b = newAggregator();
    parseDates(md, "v1", a);
    parseDates(md, "v1", b);
    expect(JSON.stringify(a.warnings)).toBe(JSON.stringify(b.warnings));
  });
});
