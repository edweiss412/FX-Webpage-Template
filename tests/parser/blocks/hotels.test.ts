import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import { detectVersion } from "@/lib/parser/schema";

const logMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: logMock }));

// ── Fixture paths ─────────────────────────────────────────────────────────────
const ALL_FIXTURES = [
  "fixtures/shows/raw/2024-05-east-coast-family-office.md",
  "fixtures/shows/raw/2025-03-dci-rpas-central.md",
  "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md",
  "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
  "fixtures/shows/raw/2025-06-ria-investment-forum.md",
  "fixtures/shows/raw/2025-10-consultants-roundtable.md",
  "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md",
  "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md",
  "fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md",
  "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md",
] as const;

// ── Fixture-grounded tests ────────────────────────────────────────────────────

describe("parseHotels — v4 single hotel (2026-04-asset-mgmt-cfo-coo-waldorf)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", "utf8");
  const hotels = parseHotels(md, "v4");

  it("returns exactly 1 hotel", () => {
    expect(hotels).toHaveLength(1);
  });

  it("hotel_name is the venue only; the street address splits into hotel_address (#3)", () => {
    expect(hotels[0]!.hotel_name).toBe("Waldorf Astoria Chicago");
    expect(hotels[0]!.hotel_address).toBe("11 E Walton St Chicago, IL 60611");
  });

  it("ordinal is 1", () => {
    expect(hotels[0]!.ordinal).toBe(1);
  });

  it("check_in is 2026-04-19", () => {
    expect(hotels[0]!.check_in).toBe("2026-04-19");
  });

  it("check_out is 2026-04-23", () => {
    expect(hotels[0]!.check_out).toBe("2026-04-23");
  });

  it("names array contains both guest entries", () => {
    const names = hotels[0]!.names;
    expect(names.length).toBeGreaterThan(0);
    const joined = names.join(" ");
    expect(joined).toContain("John Carleo");
    expect(joined).toContain("Eric Weiss");
  });
});

describe("parseHotels — v4 two hotels (2026-05-fintech-forum-cto-summit)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md", "utf8");
  const hotels = parseHotels(md, "v4");

  it("returns 2 hotels", () => {
    expect(hotels).toHaveLength(2);
  });

  it("first hotel has ordinal 1", () => {
    expect(hotels[0]!.ordinal).toBe(1);
  });

  it("second hotel has ordinal 2", () => {
    expect(hotels[1]!.ordinal).toBe(2);
  });

  it("both hotels are Kimpton Gray", () => {
    expect(hotels[0]!.hotel_name).toContain("Kimpton Gray");
    expect(hotels[1]!.hotel_name).toContain("Kimpton Gray");
  });

  it("reservation 1 check_in is 2026-05-02", () => {
    expect(hotels[0]!.check_in).toBe("2026-05-02");
  });

  it("reservation 2 check_in is 2026-05-03", () => {
    expect(hotels[1]!.check_in).toBe("2026-05-03");
  });

  it("reservation 1 names contains John Carleo", () => {
    expect(hotels[0]!.names.join(" ")).toContain("John Carleo");
  });

  it("reservation 2 names contains Eric Weiss", () => {
    expect(hotels[1]!.names.join(" ")).toContain("Eric Weiss");
  });
});

describe("parseHotels — v4 four hotels (2026-03-rpas-central-four-seasons)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
  const hotels = parseHotels(md, "v4");

  it("returns 4 hotels (RESERVATION #1-4)", () => {
    expect(hotels).toHaveLength(4);
  });

  it("ordinals are 1..4", () => {
    expect(hotels.map((h) => h.ordinal)).toEqual([1, 2, 3, 4]);
  });

  it("hotel 1 is Four Seasons Hotel Chicago", () => {
    expect(hotels[0]!.hotel_name).toContain("Four Seasons Hotel Chicago");
  });

  it("hotel 3 is Holiday Inn Express", () => {
    expect(hotels[2]!.hotel_name).toContain("Holiday Inn Express");
  });

  it("hotel 1 check_in is 2026-03-22", () => {
    expect(hotels[0]!.check_in).toBe("2026-03-22");
  });

  it("hotel 1 check_out is 2026-03-26", () => {
    expect(hotels[0]!.check_out).toBe("2026-03-26");
  });
});

describe("parseHotels — v2 HOTEL table (2025-10-fixed-income-trading-summit)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");
  const hotels = parseHotels(md, "v2");

  it("returns 1 hotel", () => {
    expect(hotels).toHaveLength(1);
  });

  it("hotel_name contains Park Hyatt Chicago", () => {
    expect(hotels[0]!.hotel_name).toContain("Park Hyatt Chicago");
  });

  it("check_in is 2025-10-18", () => {
    expect(hotels[0]!.check_in).toBe("2025-10-18");
  });

  it("check_out is 2025-10-22", () => {
    expect(hotels[0]!.check_out).toBe("2025-10-22");
  });

  it("names contains David Johnson and Jeffrey Justice", () => {
    const joined = hotels[0]!.names.join(" ");
    expect(joined).toContain("David Johnson");
    expect(joined).toContain("Jeffrey Justice");
  });
});

describe("parseHotels — v2 Hotel Reservations inline cell (2025-03-dci-rpas-central)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-03-dci-rpas-central.md", "utf8");
  const hotels = parseHotels(md, "v2");

  it("returns 1 hotel", () => {
    expect(hotels).toHaveLength(1);
  });

  it("hotel_name contains Westin Michigan Ave", () => {
    expect(hotels[0]!.hotel_name).toContain("Westin");
  });
});

describe("parseHotels — v1 Hotel Stays row (2024-05-east-coast-family-office)", () => {
  const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
  const hotels = parseHotels(md, "v1");

  it("returns 1 hotel", () => {
    expect(hotels).toHaveLength(1);
  });

  it("hotel_name contains Four Seasons Fort Lauderdale", () => {
    expect(hotels[0]!.hotel_name).toContain("Four Seasons");
  });
});

describe("parseHotels — v1 Hotel Reservations inline cell (2025-06-ria-investment-forum)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-06-ria-investment-forum.md", "utf8");
  const hotels = parseHotels(md, "v2");

  it("returns 1 hotel", () => {
    expect(hotels).toHaveLength(1);
  });

  it("hotel_name contains Park Hyatt Chicago", () => {
    expect(hotels[0]!.hotel_name).toContain("Park Hyatt");
  });

  it("names contains Doug and Eric", () => {
    const joined = hotels[0]!.names.join(" ");
    expect(joined).toContain("Doug");
    expect(joined).toContain("Eric");
  });
});

// ── Cardinality cap test ──────────────────────────────────────────────────────
describe("parseHotels — cardinality cap (synthetic)", () => {
  const syntheticMd = `| HOTEL | RESERVATION \\#1 |  | RESERVATION \\#2 |
| :---: | :---: | :---: | :---: |
|  | Hotel Name / Address |  | Hotel Name / Address |
|  | Hotel Alpha 1 Main St |  | Hotel Beta 2 Main St |
|  | Names on Reservation |  | Names on Reservation |
|  | Alice |  | Bob |
|  | Check In Date | Check Out Date | Check In Date |
|  | 1/1/26 | 1/5/26 | 1/2/26 |
|  | RESERVATION \\#3 |  | RESERVATION \\#4 |
|  | Hotel Name / Address |  | Hotel Name / Address |
|  | Hotel Gamma 3 Main St |  | Hotel Delta 4 Main St |
|  | Names on Reservation |  | Names on Reservation |
|  | Carol |  | Dave |
|  | Check In Date | Check Out Date | Check In Date |
|  | 1/1/26 | 1/5/26 | 1/2/26 |`;

  const hotels = parseHotels(syntheticMd, "v4");
  it("returns exactly 4 hotels", () => {
    expect(hotels).toHaveLength(4);
  });
  it("ordinals are 1..4", () => {
    expect(hotels.map((h) => h.ordinal)).toEqual([1, 2, 3, 4]);
  });
});

// ── Forensic code on the cardinality warn (HOTELS_PARSE_WARNING) ──────────────
describe("parseHotels — HOTELS_PARSE_WARNING forensic code", () => {
  it("cardinality-exceeded warn carries source + code", () => {
    logMock.warn.mockClear();
    // 5 inline reservation groups (each with a delimited guest) → buildInlineReservations
    // returns 5 rows → cap() exceeds MAX_HOTELS (4) → the local warn(msg) fires once.
    const md =
      "| Hotel Reservations | Grand Hotel Doug Larson - 1001 Check In: 3/1 Check Out: 3/2 " +
      "Eric Weiss - 1002 Check In: 3/1 Check Out: 3/2 " +
      "John Carleo - 1003 Check In: 3/1 Check Out: 3/2 " +
      "Jane Doe - 1004 Check In: 3/1 Check Out: 3/2 " +
      "Bob Smith - 1005 Check In: 3/1 Check Out: 3/2 |";
    const hotels = parseHotels(md, "v2");
    // truncated to the cardinality cap
    expect(hotels).toHaveLength(4);
    // failure mode: a code-less warn is un-triageable in the durable log stream
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("HOTEL_CARDINALITY_EXCEEDED"),
      expect.objectContaining({ source: "parser.hotels", code: "HOTELS_PARSE_WARNING" }),
    );
  });
});

// ── Slash-separated guests (BL-HOTEL-VIEWER-NAME-MATCH) ───────────────────────
describe("parseHotels — split slash-separated guests in a Names cell", () => {
  const md = (namesCell: string) =>
    [
      "| HOTEL | RESERVATION \\#1 |  |  |",
      "| :---: | :---: | :---: | :---: |",
      "|  | Hotel Name / Address |  |  |",
      "|  | Park Hyatt 800 N Michigan Ave |  |  |",
      "|  | Names on Reservation |  |  |",
      `|  | ${namesCell} |  |  |`,
      "|  | Check In Date | Check Out Date |  |",
      "|  | 1/1/26 | 1/2/26 |  |",
    ].join("\n");

  it("splits 'David Johnson / Jeffrey Justice' into two guest names", () => {
    // failure mode: the slash-merge persists as one entry → per-viewer hotel filter
    // can't cleanly match either guest at the source.
    const h = parseHotels(md("David Johnson / Jeffrey Justice"), "v4");
    expect(h[0]!.names).toEqual(["David Johnson", "Jeffrey Justice"]);
  });

  it("strips the conf# per segment ('Alice - #51111 / Bob - #52222' → ['Alice','Bob'])", () => {
    const h = parseHotels(md("Alice - \\#51111 / Bob - \\#52222"), "v4");
    expect(h[0]!.names).toEqual(["Alice", "Bob"]);
    // privacy: no conf# digit run survives in any split name
    expect(h[0]!.names.join(" ")).not.toMatch(/\d{4,}/);
  });
});

// ── Corpus-coverage test ──────────────────────────────────────────────────────
describe("parseHotels — corpus coverage (every fixture returns array)", () => {
  for (const path of ALL_FIXTURES) {
    it(`${path} yields array (possibly empty)`, () => {
      const md = readFileSync(path, "utf8");
      const version = detectVersion(md);
      const hotels = parseHotels(md, version ?? "v2");
      expect(Array.isArray(hotels)).toBe(true);
      // every returned hotel must have ordinal 1..4
      for (const h of hotels) {
        expect(h.ordinal).toBeGreaterThanOrEqual(1);
        expect(h.ordinal).toBeLessThanOrEqual(4);
      }
    });
  }
});
