import { describe, expect, it } from "vitest";
import { classifyLaterSegment, type LaterSegmentOutcome } from "@/lib/parser/blocks/hotels";

/**
 * Unit oracles for the exported inline later-group detector.
 *
 * Spec: docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md
 * Every input literal and assertion below is copied from its named §8.1 row; the row
 * name appears in the `it()` title. Per §8.1's date convention every input is
 * materialized year-suffixed (`3/3` authored as `3/3/26`) EXCEPT the two authored
 * exceptions that exercise the `contextYear` path.
 *
 * At the unit level a tier-1 outcome carries the WHOLE D6 `hotelText` in
 * `build.row.hotel_name` with `build.row.hotel_address === null` (§3 D6) — the
 * name/address split is the caller's later `stripHotelNameConf` pass, not the
 * detector's.
 */

/** Asserts tier 1 and narrows, so every caller can byte-assert the kept text. */
function expectKeep(
  segment: string,
  ordinal = 1,
  contextYear: string | null = "2026",
): Extract<LaterSegmentOutcome, { tier: 1 }> {
  const outcome = classifyLaterSegment(segment, ordinal, contextYear);
  expect(outcome.tier).toBe(1);
  if (outcome.tier !== 1) throw new Error("unreachable: tier assertion failed");
  return outcome;
}

/** Asserts a tier-2 SUSPECTED demote. */
function expectDemote(segment: string, ordinal = 1, contextYear: string | null = "2026"): void {
  expect(classifyLaterSegment(segment, ordinal, contextYear).tier).toBe(2);
}

const B1Z_ADDRESS = "200 Oak Ave, Chicago, IL 60601";
const B1Z_HOTEL_TEXT = `Marriott Downtown ${B1Z_ADDRESS}`;

describe("classifyLaterSegment unit oracles (spec 2026-07-27 §8.1)", () => {
  it("Tier 2, D6 names-empty abort", () => {
    // the explicit annotation is the compile-time oracle for the exported
    // LaterSegmentOutcome type (plan R10 f2)
    const outcome: LaterSegmentOutcome = classifyLaterSegment(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe Check In: 3/3/26 Check Out: 3/4/26",
      1,
      "2026",
    );
    expect(outcome.tier).toBe(2);
  });

  it("Detector guard branches: divider-only and empty segments are tier 3", () => {
    expect(classifyLaterSegment("---", 1, "2026")).toEqual({ tier: 3 });
    expect(classifyLaterSegment("", 1, "2026")).toEqual({ tier: 3 });
  });

  it("contextYear + ordinal forwarding (yearless segment)", () => {
    const outcome = classifyLaterSegment(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3 Check Out: 3/4",
      2,
      "2026",
    );
    expect(outcome.tier).toBe(1);
    if (outcome.tier !== 1) return;
    expect(outcome.build.row.ordinal).toBe(2);
    expect(outcome.build.row.check_in).toBe("2026-03-03");
    expect(outcome.build.row.check_out).toBe("2026-03-04");
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("Detector guard branches (ii): contextYear-null postal segment", () => {
    const outcome = classifyLaterSegment(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3 Check Out: 3/4",
      1,
      null,
    );
    expect(outcome.tier).toBe(1);
    if (outcome.tier !== 1) return;
    expect(outcome.build.row.check_in).toBeNull();
    expect(outcome.build.row.check_out).toBeNull();
  });

  it("Trailing-initial UNIT oracle", () => {
    // `Marriott Plaza Jane D` is 4 whitespace words but 3 BASE words. A whitespace
    // word-count implementation reaches the word arm and returns { tier: 2 }.
    expect(
      classifyLaterSegment(
        "Marriott Plaza Jane D - 1002 Check In: 3/3/26 Check Out: 3/4/26",
        1,
        "2026",
      ),
    ).toEqual({ tier: 3 });
  });

  it("Zero-width strip UNIT oracle", () => {
    // U+200B between the street number's first and second digits — the ONLY route on
    // which a zero-width byte reaches D1 (clean() strips it at pipeline entry). Never
    // U+FEFF: the BOM IS JavaScript \s and would not discriminate the strip.
    const outcome = expectKeep(
      "Marriott Downtown 2​00 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(B1Z_HOTEL_TEXT);
    expect(outcome.build.row.hotel_address).toBeNull();
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("D4 smaller-index precedence", () => {
    // The padded street match sits at the smaller (position-0) index; a ZIP-shaped
    // match starts later at `71 Chicago, IL 60601`, which no D4b arm can span, so
    // guard (b) sees the unconsumed postal evidence.
    expectDemote(
      "200 Oak Ave 71 Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });
});

describe("classifyLaterSegment branch matrix — D1 normalization", () => {
  it("D1 entity member: &#10; envelope keep normalizes into the kept text", () => {
    const outcome = expectKeep(
      "Marriott&#10;Downtown  200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    // tier alone is insufficient — a no-op D1 can still reach tier 1 with corrupted text
    expect(outcome.build.row.hotel_name).toBe(B1Z_HOTEL_TEXT);
    expect(outcome.build.row.hotel_address).toBeNull();
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("D1 tab member: a Check&#9;In second marker degrades the segment", () => {
    // A D1 that normalizes only &#10; counts ONE marker and keeps through the glue.
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown Bob Roe Check&#9;In: 3/5/26 Check Out: 3/6/26",
    );
  });

  it("D1 quote member: straight-quoted corpus address keeps", () => {
    const outcome = expectKeep(
      'Park Hyatt Chicago "800 N Michigan Ave Chicago, IL 60611" Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26',
    );
    expect(outcome.build.row.hotel_name).toBe(
      "Park Hyatt Chicago 800 N Michigan Ave Chicago, IL 60611",
    );
    expect(outcome.build.row.hotel_address).toBeNull();
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("D1 quote member: smart-quoted corpus address keeps", () => {
    const outcome = expectKeep(
      "Park Hyatt Chicago “800 N Michigan Ave Chicago, IL 60611” Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(
      "Park Hyatt Chicago 800 N Michigan Ave Chicago, IL 60611",
    );
    expect(outcome.build.row.hotel_address).toBeNull();
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });
});

describe("classifyLaterSegment branch matrix — D2 divider strip", () => {
  const dividers: ReadonlyArray<readonly [string, string]> = [
    ["ASCII dash run", "---"],
    ["en dash", "–"],
    ["em dash", "—"],
  ];

  for (const [label, divider] of dividers) {
    it(`D2 divider strip (${label}) keeps a dash-free hotel name`, () => {
      // A D2-less implementation still reaches tier 1 (3 tokens under guard (d)) but
      // persists the dash-polluted name — the NAME assertion is the discriminator.
      const outcome = expectKeep(
        `${divider} Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26`,
      );
      expect(outcome.build.row.hotel_name).toBe(B1Z_HOTEL_TEXT);
      expect(outcome.build.row.hotel_address).toBeNull();
      expect(outcome.build.row.names).toEqual(["Jane Doe"]);
    });
  }
});

describe("classifyLaterSegment branch matrix — D3 prefix cut (five-way minimum)", () => {
  it("Two-guest own-hotel keeps (dash-run cut)", () => {
    const outcome = expectKeep(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Doug Larson - 2035940 Adam Larson - 2035939 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(B1Z_HOTEL_TEXT);
    expect(outcome.build.row.hotel_address).toBeNull();
    expect(outcome.build.row.names).toEqual(["Doug Larson", "Adam Larson"]);
  });

  it("Hash-marked counterfeit street demotes", () => {
    expectDemote(
      "Jane - # 1515 Madison Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("Bare-conf counterfeit street demotes", () => {
    expectDemote(
      "Jane Doe 100200 1515 Madison Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("Zero-marker tail with own hotel keeps", () => {
    const outcome = expectKeep("Hilton Midtown 300 Pine St, Seattle, WA 98101 Bob Roe - 1003");
    expect(outcome.build.row.hotel_name).toBe("Hilton Midtown 300 Pine St, Seattle, WA 98101");
    expect(outcome.build.row.hotel_address).toBeNull();
    expect(outcome.build.row.names).toEqual(["Bob Roe"]);
    expect(outcome.build.row.check_in).toBeNull();
    expect(outcome.build.row.check_out).toBeNull();
  });

  it("Position-0 all-address hotel keeps", () => {
    const outcome = expectKeep(
      "200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(B1Z_ADDRESS);
    expect(outcome.build.row.hotel_address).toBeNull();
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });
});

describe("classifyLaterSegment branch matrix — isZip4 five-clause boundary", () => {
  const zip4Segment = (token: string): string =>
    `Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note ${token} Check Out: 3/4/26`;

  it("True ZIP+4 post-marker still keeps", () => {
    const outcome = expectKeep(zip4Segment("99999-1234"));
    expect(outcome.build.row.hotel_name).toBe(B1Z_HOTEL_TEXT);
    expect(outcome.build.row.hotel_address).toBeNull();
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  const rejections: ReadonlyArray<readonly [string, string]> = [
    ["five trailing digits fails exactly-4", "99999-12345"],
    ["an en dash is never a ZIP+4 hyphen", "99999–1234"],
    ["a non-empty separator disqualifies", "99999 - 1234"],
    ["no word-boundary five-digit run precedes", "123456-1234"],
  ];

  for (const [why, token] of rejections) {
    it(`ZIP+4 rejection boundary demotes (${why})`, () => {
      expectDemote(zip4Segment(token));
    });
  }

  it("Trailing word character defeats the dash family's \\b and still keeps", () => {
    const outcome = expectKeep(zip4Segment("99999-1234A"));
    expect(outcome.build.row.hotel_name).toBe(B1Z_HOTEL_TEXT);
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });
});

describe("classifyLaterSegment branch matrix — D4 anchor and D4b tail arms", () => {
  it("Comma-less city (comma before state) keeps via the longer-match tie-break", () => {
    const outcome = expectKeep(
      "Marriott Downtown 200 Oak Ave Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe("Marriott Downtown 200 Oak Ave Chicago, IL 60601");
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("Fully comma-less US address keeps via arm 3", () => {
    const outcome = expectKeep(
      "Marriott Downtown 200 Oak Ave Chicago IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe("Marriott Downtown 200 Oak Ave Chicago IL 60601");
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("Fully comma-less Canadian address keeps via arm 3's postal alternation", () => {
    const outcome = expectKeep(
      "Marriott Downtown 200 Oak Ave Toronto ON M5V 2T6 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe("Marriott Downtown 200 Oak Ave Toronto ON M5V 2T6");
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("Arm-3 cap boundary: exactly 3 city words keeps", () => {
    const outcome = expectKeep(
      "Marriott Downtown 200 Oak Ave Salt Lake City UT 84101 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(
      "Marriott Downtown 200 Oak Ave Salt Lake City UT 84101",
    );
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("ZIP-arm interior boundary: FOUR interior words keeps", () => {
    const outcome = expectKeep(
      "Park Hyatt Chicago 800 N Michigan Ave Chicago, IL 60611 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(
      "Park Hyatt Chicago 800 N Michigan Ave Chicago, IL 60611",
    );
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("ZIP-arm interior boundary: FIVE interior words demotes", () => {
    expectDemote(
      "Hotel 71 Jane Doe Alice Brown Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("Unit tail inside a postal address keeps (arm 1 then arm 2)", () => {
    const outcome = expectKeep(
      "Marriott Downtown 200 Oak Ave Suite 400, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(
      "Marriott Downtown 200 Oak Ave Suite 400, Chicago, IL 60601",
    );
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("Floor alias keeps", () => {
    const outcome = expectKeep(
      "Marriott Downtown 200 Oak Ave Floor 4, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(
      "Marriott Downtown 200 Oak Ave Floor 4, Chicago, IL 60601",
    );
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("Arm-1 separator matrix: the glued `#` branch keeps", () => {
    const outcome = expectKeep(
      "Marriott Downtown 200 Oak Ave Suite#400, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(
      "Marriott Downtown 200 Oak Ave Suite#400, Chicago, IL 60601",
    );
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("Alias-prefix word is NOT a unit (separator requirement)", () => {
    // A separator-less arm 1 eats `Steve` (`Ste`+`ve`) and keeps with the guest buried
    // inside hotel_address.
    expectDemote(
      "Marriott Downtown 200 Oak Ave Steve Salt Lake City UT 84101 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("Postal-stop: a trailing unit after the postal anchor demotes", () => {
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Suite 400 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("Florida postal beats the Fl alias (postal-first arm order)", () => {
    const outcome = expectKeep(
      "Marriott Downtown 200 Oak Ave FL 33101 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe("Marriott Downtown 200 Oak Ave FL 33101");
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("Exact-three-word arm-2 city keeps", () => {
    const outcome = expectKeep(
      "Marriott Downtown 200 Oak Ave, Salt Lake City, UT 84101 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(
      "Marriott Downtown 200 Oak Ave, Salt Lake City, UT 84101",
    );
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("Exact-three-word street-arm interior keeps", () => {
    const outcome = expectKeep(
      "Marriott Downtown 200 Martin Luther King Blvd, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(
      "Marriott Downtown 200 Martin Luther King Blvd, Chicago, IL 60601",
    );
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });
});

describe("classifyLaterSegment branch matrix — residual-tail guards", () => {
  it("(a0) bare unit alias in the residual demotes", () => {
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Suite Deluxe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("(a0) token boundary: `Florence` is not an alias and still keeps", () => {
    // Kills any prefix-matching a0 — it would demote Florence.
    const outcome = expectKeep(
      "Hotel 71 Chicago, IL 60601 Florence Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe("Hotel 71 Chicago, IL 60601");
    expect(outcome.build.row.names).toEqual(["Florence Roe"]);
  });

  it("(a) ZIP-less city comma residual demotes", () => {
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("(b) unconsumed postal evidence after a unit tail demotes", () => {
    expectDemote(
      "Marriott Downtown 200 Oak Ave Suite 400 Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("(c) post-terminator note text demotes", () => {
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Eric Weiss Late Arrival - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("(d) FOUR-word corpus brand name region keeps", () => {
    const outcome = expectKeep(
      "Four Seasons Hotel Chicago 909 Michigan Ave, Chicago, IL 60611 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(
      "Four Seasons Hotel Chicago 909 Michigan Ave, Chicago, IL 60611",
    );
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("(d) THREE-word name region keeps", () => {
    const outcome = expectKeep(
      "The Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(
      "The Marriott Downtown 200 Oak Ave, Chicago, IL 60601",
    );
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("(d) FIVE-word name region demotes", () => {
    expectDemote(
      "Marriott Downtown Hotel Jane Doe 200 Oak Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });
});

describe("classifyLaterSegment branch matrix — D5 word arm and post-prefix scan", () => {
  it("Word arm: a no-address later hotel demotes", () => {
    expectDemote("Marriott Downtown Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26");
  });

  it("Arm (i) raw read: post-prefix street-only evidence demotes", () => {
    expectDemote(
      "Jane Doe - 1002 Marriott Downtown 200 Oak Ave Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("Arm (i) neutralized read: a dash-glued street demotes", () => {
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown -1515 Madison Ave Bob Roe Check Out: 3/6/26",
    );
  });

  it("Arm (i) neutralized read: a word-glued street demotes", () => {
    // Kills a no-word-char-before neutralizer (the R53 clause, reversed R55).
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton-1515 Madison Ave Bob Roe Check Out: 3/6/26",
    );
  });

  it("Arm (i) neutralized read: dash-glued digit-run prose demotes (documented limit)", () => {
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note: -2026 Drive kickoff Check Out: 3/4/26",
    );
  });

  it("Arm (i) neutralized read: a dash before LETTERS keeps", () => {
    // Kills a neutralizer without the digit-after clause — ` 2026 Drive kickoff`
    // fabricates a street match and demotes this valid keep.
    const outcome = expectKeep(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note 2026-Drive kickoff Check Out: 3/4/26",
    );
    expect(outcome.build.row.hotel_name).toBe(B1Z_HOTEL_TEXT);
    expect(outcome.build.row.names).toEqual(["Jane Doe"]);
  });

  it("Arm (ii) dash family: a post-marker conf delimiter demotes", () => {
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown Bob Roe - 1003 Check Out: 3/6/26",
    );
  });

  it("Arm (ii) hash family: a post-marker hash conf demotes", () => {
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown Bob Roe #1003 Check Out: 3/6/26",
    );
  });

  it("Arm (ii) bare family: a post-marker six-digit run demotes", () => {
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown Bob Roe 100300 Check Out: 3/6/26",
    );
  });
});

describe("classifyLaterSegment branch matrix — D6 rebuild clauses", () => {
  it("(c0) a period-led residual is Pattern-1 unliftable and demotes", () => {
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Ste. Grand - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("(c1) one name against two pre-marker delimiters demotes", () => {
    // `Doug` is dropped by live Pattern 1 — a names-nonempty-only D6 keeps with a
    // crew-visible guest lost.
    expectDemote(
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Doug - 1003 Check In: 3/3/26 Check Out: 3/4/26",
    );
  });

  it("(c2) a zero-marker tail with two delimiters demotes", () => {
    // The no-Check-In learn-K path eats Alice's lead name into the address.
    expectDemote("Hilton Midtown 300 Pine St, Seattle, WA 98101 Alice Smith - 1003 Doug - 1004");
  });
});
