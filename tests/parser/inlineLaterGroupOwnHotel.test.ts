import { describe, expect, it } from "vitest";
import { parseHotels, normalizeLaterSegmentText } from "@/lib/parser/blocks/hotels";
import { newAggregator } from "@/lib/parser/warnings";

/**
 * Integration oracles for inline later-group own-hotel detection.
 *
 * Spec: docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md
 * Every input is a §8.1 row's cell, materialized year-suffixed per the row's date
 * convention. KEEP expectations derive from the CELL TEXT (never from parser output).
 * DEMOTE and PARITY expectations are byte-parity literals captured from a fresh probe
 * of the year-suffixed cell on the PRE-CHANGE tree, exactly as §8.1's "Row 0 untouched"
 * row prescribes — a demote must leave today's parse untouched.
 */

const HEAD = "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 ";
const cell = (later: string) => `| Hotel Stays | ${HEAD}${later} |`;
const wholeCell = (text: string) => `| Hotel Stays | ${text} |`;
const parse = (cellText: string) => {
  const agg = newAggregator();
  const rows = parseHotels(cellText, "v1", agg);
  return { rows, warnings: agg.warnings };
};
const rowsOf = (cellText: string) => parse(cellText).rows;

type RowShape = {
  hotel_name: string | null;
  hotel_address: string | null;
  names: string[];
  check_in: string | null;
  check_out: string | null;
};
const shapeOf = (cellText: string): RowShape[] =>
  rowsOf(cellText).map((r) => ({
    hotel_name: r.hotel_name,
    hotel_address: r.hotel_address,
    names: r.names,
    check_in: r.check_in,
    check_out: r.check_out,
  }));

const OWN = "HOTEL_INLINE_GROUP_OWN_HOTEL";
const SUSPECTED = "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED";

/** Row 0 is never perturbed by the detector (S5). */
const ROW0 = {
  hotel_name: "Hyatt Regency 100",
  hotel_address: null,
  names: ["Main St John Smith"],
  check_in: "2026-03-01",
  check_out: "2026-03-02",
};

type Keep = {
  name: string;
  later: string;
  hotel: string;
  address: string | null;
  names: string[];
  checkIn: string | null;
  checkOut: string | null;
  index: number;
};

const KEEPS: readonly Keep[] = [
  {
    name: "Backlog clobber fixed (postal form)",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Two-guest own-hotel KEEPS (hyphen)",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Doug Larson - 2035940 Adam Larson - 2035939 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Doug Larson", "Adam Larson"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Two-guest own-hotel KEEPS (glued em dash)",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Doug Larson—2035940 Adam Larson—2035939 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Doug Larson", "Adam Larson"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Zero-marker tail with own hotel KEEPS",
    later:
      "Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26 Hilton Midtown 300 Pine St, Seattle, WA 98101 Bob Roe - 1003",
    hotel: "Hilton Midtown",
    address: "300 Pine St, Seattle, WA 98101",
    names: ["Bob Roe"],
    checkIn: null,
    checkOut: null,
    index: 2,
  },
  {
    name: "Address tail, comma city+state+ZIP",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Address tail, comma-less city (comma before state)",
    later:
      "Marriott Downtown 200 Oak Ave Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Address tail, fully comma-less US",
    later:
      "Marriott Downtown 200 Oak Ave Chicago IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Chicago IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Address tail, fully comma-less Canadian",
    later:
      "Marriott Downtown 200 Oak Ave Toronto ON M5V 2T6 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Toronto ON M5V 2T6",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-3 cap boundary, exactly 3 city words KEEPS",
    later:
      "Marriott Downtown 200 Oak Ave Salt Lake City UT 84101 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Salt Lake City UT 84101",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "ZIP+4 comma-less survives",
    later:
      "Marriott Downtown 200 Oak Ave Chicago IL 60601-1234 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Chicago IL 60601-1234",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "ZIP+4 comma-led survives",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601-1234 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601-1234",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Unit tail inside a postal address",
    later:
      "Marriott Downtown 200 Oak Ave Suite 400, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Suite 400, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Floor alias keeps",
    later:
      "Marriott Downtown 200 Oak Ave Floor 4, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Floor 4, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Zero-city postal tail KEEPS, arm 1 then arm 2",
    later:
      "Marriott Downtown 200 Oak Ave Suite 400, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Suite 400, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Zero-city postal tail KEEPS, arm 3",
    later:
      "Marriott Downtown 200 Oak Ave IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Florida postal beats the Fl alias, direct arm 3",
    later:
      "Marriott Downtown 200 Oak Ave FL 33101 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave FL 33101",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Florida postal beats the Fl alias, arm 1 then arm 2",
    later:
      "Marriott Downtown 200 Oak Ave Suite 400, FL 33101 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Suite 400, FL 33101",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Exact-three-word interior keeps, arm-2 city",
    later:
      "Marriott Downtown 200 Oak Ave, Salt Lake City, UT 84101 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Salt Lake City, UT 84101",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Exact-three-word interior keeps, street arm",
    later:
      "Marriott Downtown 200 Martin Luther King Blvd, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Martin Luther King Blvd, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Overlap-form conf tokens count ONCE, dash+hash",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - #1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Overlap-form conf tokens count ONCE, triple overlap",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - #2035940 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "a0 token boundary: Florence Roe KEEPS",
    later: "Hotel 71 Chicago, IL 60601 Florence Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Hotel 71 Chicago, IL 60601",
    address: null,
    names: ["Florence Roe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Three-word name region still KEEPS",
    later:
      "The Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "The Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "FOUR-word corpus brand KEEPS",
    later:
      "Four Seasons Hotel Chicago 909 Michigan Ave, Chicago, IL 60611 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Four Seasons Hotel Chicago",
    address: "909 Michigan Ave, Chicago, IL 60611",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Quoted corpus address form KEEPS",
    later:
      'Park Hyatt Chicago "800 N Michigan Ave Chicago, IL 60611" Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26',
    hotel: "Park Hyatt Chicago",
    address: "800 N Michigan Ave Chicago, IL 60611",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Smart-quote form KEEPS",
    later:
      "Park Hyatt Chicago “800 N Michigan Ave Chicago, IL 60611” Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Park Hyatt Chicago",
    address: "800 N Michigan Ave Chicago, IL 60611",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "ZIP-arm interior boundary: FOUR keeps",
    later:
      "Park Hyatt Chicago 800 N Michigan Ave Chicago, IL 60611 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Park Hyatt Chicago",
    address: "800 N Michigan Ave Chicago, IL 60611",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Below-threshold unconfirmed guest KEEPS",
    later:
      "Marriott Jane Doe 200 Oak Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Jane Doe",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Bob Roe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Lowercase Canadian POSTAL keeps",
    later:
      "Marriott Downtown 200 Oak Ave Toronto ON m5v 2t6 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Toronto ON m5v 2t6",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Divider strip, ASCII dash run",
    later:
      "--- Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Divider strip, en dash",
    later:
      "– Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Divider strip, em dash",
    later:
      "— Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Tier-1 path ZIP+4 post-marker still KEEPS",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note 99999-1234 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "ZIP+4 then suffix word still KEEPS",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note 99999-1234 Way Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "ZIP+4 rejection boundaries, FIFTH materialization KEEPS",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note 99999-1234A Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Dash-before-letters note KEEPS",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note 2026-Drive kickoff Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Position-0 all-address hotel keeps",
    later: "200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "200 Oak Ave, Chicago, IL 60601",
    address: null,
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "ZIP arm, numeric brand unsplit",
    later: "Hotel 71 Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Hotel 71 Chicago, IL 60601",
    address: null,
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Entity-split FINAL checkout stays in scope, tier-1 keep",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check&#10;Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Lowercase-state glued booking KEEPS",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown 71 chicago, il 60601 Bob Roe Check Out: 3/6/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-06",
    index: 1,
  },
  {
    name: "Bare-name POST-MARKER glue still KEEPS",
    later:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown Bob Roe Check Out: 3/6/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-06",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (Ste. 400)",
    later:
      "Marriott Downtown 200 Oak Ave Ste. 400, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Ste. 400, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (Ste 400)",
    later:
      "Marriott Downtown 200 Oak Ave Ste 400, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Ste 400, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (Unit 12)",
    later:
      "Marriott Downtown 200 Oak Ave Unit 12, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Unit 12, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (Apt. 3B)",
    later:
      "Marriott Downtown 200 Oak Ave Apt. 3B, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Apt. 3B, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (Apt 3B)",
    later:
      "Marriott Downtown 200 Oak Ave Apt 3B, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Apt 3B, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (Rm 7)",
    later:
      "Marriott Downtown 200 Oak Ave Rm 7, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Rm 7, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (Fl 2)",
    later:
      "Marriott Downtown 200 Oak Ave Fl 2, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Fl 2, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (Room 9)",
    later:
      "Marriott Downtown 200 Oak Ave Room 9, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Room 9, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (Suite #400)",
    later:
      "Marriott Downtown 200 Oak Ave Suite #400, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Suite #400, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (Suite#400)",
    later:
      "Marriott Downtown 200 Oak Ave Suite#400, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave Suite#400, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (suite 400)",
    later:
      "Marriott Downtown 200 Oak Ave suite 400, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave suite 400, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
  {
    name: "Arm-1 syntax matrix keeps (present-comma branch)",
    later:
      "Marriott Downtown 200 Oak Ave, Suite 400, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    hotel: "Marriott Downtown",
    address: "200 Oak Ave, Suite 400, Chicago, IL 60601",
    names: ["Jane Doe"],
    checkIn: "2026-03-03",
    checkOut: "2026-03-04",
    index: 1,
  },
];

type Parity = {
  name: string;
  input: string;
  whole: boolean;
  today: RowShape[];
  forbidden: string[];
};

const DEMOTES: readonly Parity[] = [
  {
    name: "suffix-only address demotes",
    input: "Marriott Downtown 200 Oak Ave Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Oak Ave Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "one-word guest, city collision",
    input: "Marriott Downtown 200 Oak Ave Chicago Doug - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Oak Ave Chicago Doug"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "unconsumed postal evidence downgrades",
    input:
      "Marriott Downtown 200 Oak Ave One Two Three Four IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "ZIP-less comma-less city downgrades",
    input:
      "Marriott Downtown 200 Oak Ave Chicago Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Oak Ave Chicago Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "ZIP-less city tail downgrades",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Chicago Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ['200 Oak Ave"'],
  },
  {
    name: "guard (c) post-terminator note text",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Eric Weiss Late Arrival - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Eric Weiss Late Arrival"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "guard-(c) conservatism pinned",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Mary Ann Smith - 1001 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Mary Ann Smith"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "counterfeit-postal unit value demotes (Suite 12345)",
    input:
      "Marriott Downtown 200 Oak Ave Suite 12345 Chicago Doug - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Chicago Doug"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Suite 12345"],
  },
  {
    name: "counterfeit-postal unit value demotes (Suite 12345-6789)",
    input:
      "Marriott Downtown 200 Oak Ave Suite 12345-6789 Chicago Doug - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Chicago Doug"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Suite 12345-6789"],
  },
  {
    name: "counterfeit-postal unit value demotes (Unit M5V2T6)",
    input:
      "Marriott Downtown 200 Oak Ave Unit M5V2T6 Chicago Doug - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Chicago Doug"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Unit M5V2T6"],
  },
  {
    name: "postal-then-trailing-unit demotes",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Suite 400 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "bare unit-terminal demotes",
    input:
      "Marriott Downtown 200 Oak Ave Suite 400 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "post-postal unit designation (Suite Deluxe)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Suite Deluxe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Suite Deluxe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "post-postal unit designation (Ste Grand)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Ste Grand - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Ste Grand"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "post-postal unit designation (Apt Deluxe)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Apt Deluxe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Apt Deluxe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "post-postal unit designation (Rm Deluxe)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Rm Deluxe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Rm Deluxe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "post-postal unit designation (Floor Deluxe)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Floor Deluxe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Floor Deluxe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "post-postal unit designation (Fl Deluxe)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Fl Deluxe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Fl Deluxe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "post-postal unit designation (Room Deluxe, direct ZIP arm)",
    input: "Hotel 71 Chicago, IL 60601 Room Deluxe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Room Deluxe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "post-postal unit designation (Unit Deluxe, arm 3)",
    input:
      "Marriott Downtown 200 Oak Ave Chicago IL 60601 Unit Deluxe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Unit Deluxe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "dotted Ste. Grand c0 pin",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Ste. Grand - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    forbidden: [],
  },
  {
    name: "alias-prefix word is NOT a unit",
    input:
      "Marriott Downtown 200 Oak Ave Steve Salt Lake City UT 84101 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Steve"],
  },
  {
    name: "hash counterfeit (spaced)",
    input:
      "Jane - # 1515 Madison Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Madison"],
  },
  {
    name: "hash counterfeit (glued)",
    input:
      "Jane Doe -# 1515 Madison Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Madison"],
  },
  {
    name: "hash counterfeit (hash-only)",
    input:
      "Jane Doe # 1515 Madison Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Madison"],
  },
  {
    name: "trailing-letter dash-run (upper)",
    input:
      "Jane Doe 99999-1234A 1515 Madison Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["99999"],
  },
  {
    name: "trailing-letter dash-run (lower)",
    input:
      "Jane Doe 99999-1234a 1515 Madison Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["99999"],
  },
  {
    name: "bare-conf counterfeit (street arm)",
    input:
      "Jane Doe 100200 1515 Madison Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Madison"],
  },
  {
    name: "bare-conf counterfeit (ZIP arm)",
    input: "Jane Doe 100200 71 Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["71 Chicago"],
  },
  {
    name: "dash-street later hotel (suffixed arm)",
    input:
      "Marriott Downtown - 1515 Madison Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Marriott Downtown", "Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Madison"],
  },
  {
    name: "dash-street later hotel (ZIP-tail arm)",
    input:
      "Marriott Downtown - 1515 Broadway New York, NY 10036 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Marriott Downtown", "Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Broadway"],
  },
  {
    name: "guest before dash-street (suffixed)",
    input:
      "Jane Doe - 1515 Madison Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Madison"],
  },
  {
    name: "guest before dash-street (ZIP tail)",
    input:
      "Jane Doe - 1515 Broadway New York, NY 10036 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Broadway"],
  },
  {
    name: "guest before dash-street (en dash)",
    input:
      "Jane Doe – 1515 Madison Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Madison"],
  },
  {
    name: "guests inside the address match (arm-2 city)",
    input:
      "Marriott Downtown 200 Oak Ave, Jane Doe Alice Brown, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Jane", "Alice"],
  },
  {
    name: "guests inside the address match (ZIP interior)",
    input:
      "Hotel 71 Jane Doe Alice Brown Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Jane", "Alice"],
  },
  {
    name: "guests inside the address match (street interior)",
    input:
      "Hotel 71 Jane Doe Alice Brown St, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Jane", "Alice"],
  },
  {
    name: "four-interior-word street demotes",
    input:
      "Marriott Downtown 200 Martin Luther King Jr Blvd, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "unconfirmed guest before the address (tail arm 2)",
    input:
      "Marriott Downtown Hotel Jane Doe 200 Oak Ave, Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Jane"],
  },
  {
    name: "unconfirmed guest before the address (tail arm 3)",
    input:
      "Marriott Downtown Hotel Jane Doe 200 Oak Ave Chicago IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Jane"],
  },
  {
    name: "unconfirmed guest before the address (direct ZIP arm)",
    input:
      "Marriott Downtown Hotel Jane Doe Hotel 71 Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Jane"],
  },
  {
    name: "second postal tail never reopens (arm 2)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe NY 10001 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Jane", "NY 10001"],
  },
  {
    name: "second postal tail never reopens (ZIP arm)",
    input:
      "Hotel 71 Chicago, IL 60601 Jane Doe NY 10001 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Jane", "NY 10001"],
  },
  {
    name: "one-word guest coverage demotes (c1)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Doug - 1003 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "suffixed street inside lowercase-state text",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown 1515 Madison Ave, chicago, il 60601 Bob Roe Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "lowercase-state own hotel demotes",
    input:
      "Marriott Downtown 200 Oak Ave, chicago, il 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "lowercase PROVINCE demotes",
    input:
      "Marriott Downtown 200 Oak Ave Toronto on M5V 2T6 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "glued booking missing its Check In demotes",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown 300 Pine St, Seattle, WA 98101 Bob Roe - 1003 Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "degraded LATER segment never auto-corrects",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown 300 Pine St, Seattle, WA 98101 Bob Roe - 1003 Check In: 3/5/26 Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "tab-entity-split marker degrades the segment",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown Bob Roe Check&#9;In: 3/5/26 Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "conf-delimiter glue demotes (hyphen)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown Bob Roe - 1003 Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Hilton Midtown Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "conf-delimiter glue demotes (en dash)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown Bob Roe – 1003 Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Hilton Midtown Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "conf-delimiter glue demotes (glued em dash)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown Bob Roe—1003 Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Hilton Midtown Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "hash-conf glue demotes",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown Bob Roe #1003 Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "bare-conf glue demotes",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown Bob Roe 100300 Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "D4 smaller-index precedence",
    input: "200 Oak Ave 71 Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "post-prefix street-only positive",
    input: "Jane Doe - 1002 Marriott Downtown 200 Oak Ave Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "post-prefix postal-only positive",
    input: "Jane Doe - 1002 Marriott Downtown Chicago, IL 60601 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "post-guest own hotel warns",
    input:
      "Jane Doe - 1002 Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "dash-glued street post-marker (hyphen)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown -1515 Madison Ave Bob Roe Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Hilton Midtown"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "dash-glued street post-marker (en dash)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown –1515 Madison Ave Bob Roe Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Hilton Midtown"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "dash-glued street post-marker (em dash)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton Midtown —1515 Madison Ave Bob Roe Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Hilton Midtown"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "word-glued street post-marker (hyphen)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton-1515 Madison Ave Bob Roe Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "word-glued street post-marker (en dash)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton–1515 Madison Ave Bob Roe Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "word-glued street post-marker (em dash)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Hilton—1515 Madison Ave Bob Roe Check Out: 3/6/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-06",
      },
    ],
    forbidden: [],
  },
  {
    name: "suffix-surname second guest (spaced)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Adam Lane - 1003 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Adam Lane"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Adam Lane"],
  },
  {
    name: "suffix-surname second guest (glued em)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe—1002 Adam Lane - 1003 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe", "Adam Lane"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["Adam Lane"],
  },
  {
    name: "digit-run prose (punctuation-led)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note: -2026 Drive kickoff Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "digit-run prose (word-char-led)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note FY-2026 Drive kickoff Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "unit tail then comma-less city lead-in",
    input:
      "Marriott Downtown 200 Oak Ave Suite 400 Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "optional-comma guest-eating rejected",
    input:
      "Marriott Downtown 200 Oak Ave Suite 400 John Smith Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: ["John Smith Chicago"],
  },
  {
    name: "ZIP+4 rejection, tier-1 path (99999-12345)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note 99999-12345 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "ZIP+4 rejection, tier-1 path (en dash)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note 99999–1234 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "ZIP+4 rejection, tier-1 path (spaced separator)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note 99999 - 1234 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "ZIP+4 rejection, tier-1 path (six-digit run)",
    input:
      "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Note 123456-1234 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "ZIP-arm interior boundary, FIVE demotes",
    input:
      "Hotel 71 Jane Doe Alice Brown Chicago, IL 60601 Bob Roe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "zero-marker multi-delimiter tail demotes (c2)",
    input:
      "Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26 Hilton Midtown 300 Pine St, Seattle, WA 98101 Alice Smith - 1003 Doug - 1004",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: "300 Pine St, Seattle, WA 98101 Alice",
        names: ["Smith", "Doug"],
        check_in: null,
        check_out: null,
      },
    ],
    forbidden: [],
  },
  {
    name: "tier-2 word arm",
    input: "Marriott Downtown Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Marriott Downtown Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
];

const PARITY_NEGATIVES: readonly Parity[] = [
  {
    name: "bare-name post-guest hotel stays silent",
    input: "Jane Doe - 1002 Marriott Downtown Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "lowercase-state post-guest hotel stays silent",
    input: "Jane Doe - 1002 Hilton Midtown 71 chicago, il 60601 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "no-tier-1 parity, below-threshold 2-group",
    input: "Marriott Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: false,
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Marriott Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
  {
    name: "entity-split second marker routes single-group",
    input:
      "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check&#10;In: 3/3/26 Check Out: 3/4/26",
    whole: true,
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith", "Jane Doe"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
    ],
    forbidden: [],
  },
  {
    name: "quote-split second marker (straight)",
    input:
      'Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check"In: 3/3/26 Check Out: 3/4/26',
    whole: true,
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith", "Jane Doe"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
    ],
    forbidden: [],
  },
  {
    name: "quote-split second marker (left smart)",
    input:
      "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check“In: 3/3/26 Check Out: 3/4/26",
    whole: true,
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith", "Jane Doe"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
    ],
    forbidden: [],
  },
  {
    name: "quote-split second marker (right smart)",
    input:
      "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check”In: 3/3/26 Check Out: 3/4/26",
    whole: true,
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith", "Jane Doe"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
    ],
    forbidden: [],
  },
  {
    name: "entity-split second marker, TAB form",
    input:
      "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check&#9;In: 3/3/26 Check Out: 3/4/26",
    whole: true,
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith", "Jane Doe"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
    ],
    forbidden: [],
  },
  {
    name: "single-group cell",
    input: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26",
    whole: true,
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
    ],
    forbidden: [],
  },
  {
    name: "position-0 address in group 0",
    input:
      "200 Oak Ave, Chicago, IL 60601 John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    whole: true,
    today: [
      {
        hotel_name: "200 Oak Ave, Chicago, IL 60601",
        hotel_address: null,
        names: ["John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "200 Oak Ave, Chicago, IL 60601",
        hotel_address: null,
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ],
    forbidden: [],
  },
];

const cellFor = (e: Parity) => (e.whole ? wholeCell(e.input) : cell(e.input));

describe("inline later-group own-hotel — keeps (tier 1)", () => {
  for (const k of KEEPS) {
    it(k.name, () => {
      const rows = rowsOf(cell(k.later));
      const row = rows[k.index];
      expect(row).toBeDefined();
      expect(row!.hotel_name).toBe(k.hotel);
      expect(row!.hotel_address).toBe(k.address);
      expect(row!.names).toEqual(k.names);
      expect(row!.check_in).toBe(k.checkIn);
      expect(row!.check_out).toBe(k.checkOut);
      // Row 0 is never perturbed by a later group's keep.
      expect({
        hotel_name: rows[0]!.hotel_name,
        hotel_address: rows[0]!.hotel_address,
        names: rows[0]!.names,
        check_in: rows[0]!.check_in,
        check_out: rows[0]!.check_out,
      }).toEqual(ROW0);
    });
  }
});

describe("inline later-group own-hotel — demotes (tier 2, rows byte-equal to today)", () => {
  for (const d of DEMOTES) {
    it(d.name, () => {
      const shape = shapeOf(cellFor(d));
      expect(shape).toEqual(d.today);
      for (const token of d.forbidden) {
        for (const r of shape) {
          expect(r.hotel_name ?? "").not.toContain(token);
          expect(r.hotel_address ?? "").not.toContain(token);
        }
      }
    });
  }
});

describe("inline later-group own-hotel — parity negatives (byte-identical to today)", () => {
  for (const p of PARITY_NEGATIVES) {
    it(p.name, () => {
      expect(shapeOf(cellFor(p))).toEqual(p.today);
    });
  }
});

describe("7b guest warning on a kept row (existing code, active now)", () => {
  it("Backlog clobber fixed (postal form) emits HOTEL_GUEST_SPLIT_AMBIGUOUS on rows 0 and 1", () => {
    const { warnings } = parse(
      cell(
        "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
      ),
    );
    const guest = warnings.filter((w) => w.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS");
    expect(guest.length).toBe(2);
    expect(guest.map((w) => w.blockRef?.index).sort()).toEqual([0, 1]);
  });
});

describe("Advertised remediation clears the warning", () => {
  // The C-SUS instruction's advertised edit, verbatim: the structured HOTEL table.
  // Separate inline `Hotel Reservations` rows are unreadable (first-row-wins), so the
  // table IS the fix. This proves the single advertised remediation clears the exact
  // 3-word-guest shape the guard-(c) conservatism row demotes.
  const TABLE = [
    "| HOTEL | RESERVATION \\#1 |  | RESERVATION \\#2 |  |",
    "| :---: | :---: | :---: | :---: | :---: |",
    "|  | Hotel Name / Address |  | Hotel Name / Address |  |",
    "|  | Hyatt Regency 100 Main St Chicago, IL 60601 |  | Marriott Downtown 200 Oak Ave, Chicago, IL 60601 |  |",
    "|  | Names on Reservation |  | Names on Reservation |  |",
    "|  | John Smith |  | Mary Ann Smith |  |",
    "|  | Check In Date | Check Out Date | Check In Date | Check Out Date |",
    "|  | 3/1/26 | 3/2/26 | 3/3/26 | 3/4/26 |",
  ].join("\n");

  it("the structured HOTEL table parses to two clean reservations", () => {
    expect(shapeOf(TABLE)).toEqual([
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St Chicago, IL 60601",
        names: ["John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Marriott Downtown",
        hotel_address: "200 Oak Ave, Chicago, IL 60601",
        names: ["Mary Ann Smith"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
    ]);
  });

  it("and emits ZERO new-code warnings", () => {
    const { warnings } = parse(TABLE);
    expect(warnings.filter((w) => w.code === OWN || w.code === SUSPECTED).length).toBe(0);
  });
});

// Spec §4: a tier-2/3 row inherits from the NEAREST PRECEDING row that carries its own
// hotel — group 0, or the closest earlier tier-1 group (S7).
describe("inheritance after a tier-1 group", () => {
  const WORKED_EXAMPLE =
    "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26 " +
    "Bob Roe - 1003 Check In: 3/5/26 Check Out: 3/6/26";
  const TWO_PREDECESSORS =
    "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26 " +
    "Hilton Midtown 300 Pine St, Seattle, WA 98101 Carol Fox - 1003 Check In: 3/5/26 Check Out: 3/6/26 " +
    "Bob Roe - 1004 Check In: 3/7/26 Check Out: 3/8/26";
  const NULL_BASENAME =
    "John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 " +
    "Marriott Downtown Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26";

  it("Nearest-preceding inheritance (§4 worked example)", () => {
    // Kills unconditional group-0 inheritance: row 2 would read "Hyatt Regency 100".
    const rows = rowsOf(cell(WORKED_EXAMPLE));
    expect(rows.length).toBe(3);
    expect(rows[2]!.hotel_name).toBe("Marriott Downtown");
    expect(rows[2]!.hotel_address).toBe("200 Oak Ave, Chicago, IL 60601");
    expect(rows[2]!.names).toEqual(["Bob Roe"]);
    expect(rows[2]!.check_in).toBe("2026-03-05");
    expect(rows[2]!.check_out).toBe("2026-03-06");
  });

  it("Nearest-preceding with TWO tier-1 predecessors", () => {
    // Kills a first-tier-1-hit latch: row 3 would read "Marriott Downtown".
    const rows = rowsOf(cell(TWO_PREDECESSORS));
    expect(rows.length).toBe(4);
    expect(rows[1]!.hotel_name).toBe("Marriott Downtown");
    expect(rows[1]!.hotel_address).toBe("200 Oak Ave, Chicago, IL 60601");
    expect(rows[2]!.hotel_name).toBe("Hilton Midtown");
    expect(rows[2]!.hotel_address).toBe("300 Pine St, Seattle, WA 98101");
    expect(rows[2]!.names).toEqual(["Carol Fox"]);
    expect(rows[3]!.hotel_name).toBe("Hilton Midtown");
    expect(rows[3]!.hotel_address).toBe("300 Pine St, Seattle, WA 98101");
    expect(rows[3]!.names).toEqual(["Bob Roe"]);
    expect(rows[3]!.check_in).toBe("2026-03-07");
    expect(rows[3]!.check_out).toBe("2026-03-08");
  });

  it("Null group-0 baseName inheritance shape", () => {
    // Regression pin: with no preceding tier-1 row, a null baseName is inherited as
    // null today and must stay null — kills a null-deref on the inheritance source.
    const rows = rowsOf(wholeCell(NULL_BASENAME));
    expect(rows.length).toBe(2);
    expect(rows[0]!.hotel_name).toBeNull();
    expect(rows[1]!.hotel_name).toBeNull();
    expect(rows[1]!.names).toEqual(["Marriott Downtown Jane Doe"]);
  });
});

describe("warning cardinality", () => {
  for (const k of KEEPS) {
    it(`${k.name} — exactly one OWN at index ${k.index}, zero SUSPECTED`, () => {
      const { warnings } = parse(cell(k.later));
      const own = warnings.filter((w) => w.code === OWN);
      expect(own.length).toBe(1);
      expect(own[0]!.blockRef?.index).toBe(k.index);
      expect(warnings.filter((w) => w.code === SUSPECTED).length).toBe(0);
    });
  }

  // Rows whose cell collapses to ONE fallback reservation: their SUSPECTED is stashed
  // by the scope-B attribution scan (spec §3 scope B), which lands in Task 5. The row
  // byte-parity assertion for each is active in the DEMOTES block above.
  const SCOPE_B_PENDING: ReadonlySet<string> = new Set(["dotted Ste. Grand c0 pin"]);

  for (const d of DEMOTES) {
    const run = SCOPE_B_PENDING.has(d.name) ? it.skip : it;
    run(`${d.name} — exactly one SUSPECTED, zero OWN`, () => {
      const { warnings } = parse(cellFor(d));
      expect(warnings.filter((w) => w.code === SUSPECTED).length).toBe(1);
      expect(warnings.filter((w) => w.code === OWN).length).toBe(0);
    });
  }

  for (const p of PARITY_NEGATIVES) {
    it(`${p.name} — zero new-code warnings`, () => {
      const { warnings } = parse(cellFor(p));
      expect(warnings.filter((w) => w.code === OWN || w.code === SUSPECTED).length).toBe(0);
    });
  }

  // §4: every row whose inherited source is a tier-1 group ALSO stashes SUSPECTED,
  // even when its own tier would stay silent.
  it("Nearest-preceding inheritance — OWN@1, SUSPECTED@2, nothing on row 0", () => {
    const { warnings } = parse(
      cell(
        "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26 " +
          "Bob Roe - 1003 Check In: 3/5/26 Check Out: 3/6/26",
      ),
    );
    const own = warnings.filter((w) => w.code === OWN);
    const suspected = warnings.filter((w) => w.code === SUSPECTED);
    expect(own.length).toBe(1);
    expect(own[0]!.blockRef?.index).toBe(1);
    expect(suspected.length).toBe(1);
    expect(suspected[0]!.blockRef?.index).toBe(2);
    expect(suspected[0]!.rawSnippet).toBe("Bob Roe - 1003 Check In: 3/5/26 Check Out: 3/6/26");
  });

  it("Nearest-preceding with TWO tier-1 predecessors — OWN@1, OWN@2, SUSPECTED@3", () => {
    const { warnings } = parse(
      cell(
        "Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26 " +
          "Hilton Midtown 300 Pine St, Seattle, WA 98101 Carol Fox - 1003 Check In: 3/5/26 Check Out: 3/6/26 " +
          "Bob Roe - 1004 Check In: 3/7/26 Check Out: 3/8/26",
      ),
    );
    expect(warnings.filter((w) => w.code === OWN).map((w) => w.blockRef?.index)).toEqual([1, 2]);
    const suspected = warnings.filter((w) => w.code === SUSPECTED);
    expect(suspected.length).toBe(1);
    expect(suspected[0]!.blockRef?.index).toBe(3);
  });
});

// Spec §3 scopes A and B: a segment the detector cannot classify (>= 2 `Check In`
// markers) still gets an EVIDENCE SCAN over the region after its first marker, and a
// cell the all-names guard collapses attributes one SUSPECTED to the survivor. Rows
// stay byte-equal to today throughout — the scans' only delta is the warning.
type ScopeCase = {
  name: string;
  cell: string;
  today: RowShape[];
  suspected: number;
  own: number;
  index: number | null;
  rawSnippet: "cell" | "seg0" | null;
};

const SCOPE_CASES: readonly ScopeCase[] = [
  {
    name: "scopeA conf-carrying glued guest WARNS",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith", "Jane Doe"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: "cell",
  },
  {
    name: "scopeA conf-less glued guest silent",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Jane Doe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 0,
    own: 0,
    index: null,
    rawSnippet: null,
  },
  {
    name: "scopeA partial degradation, multi-row survival",
    cell: "Hyatt&#10;Regency  100 Main St John Smith - 1001 Check In: 3/1/26 Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26 Bob Roe - 1003 Check In: 3/5/26 Check Out: 3/6/26",
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith", "Jane Doe"],
        check_in: "2026-03-01",
        check_out: "2026-03-04",
      },
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Bob Roe"],
        check_in: "2026-03-05",
        check_out: "2026-03-06",
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: "seg0",
  },
  {
    name: "scopeA street-only positive",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Marriott Downtown 200 Oak Ave Jane Doe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA postal-only positive",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Marriott Downtown Chicago, IL 60601 Jane Doe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA hash-conf glued guest WARNS",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Jane Doe #1002 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA bare-digit glued guest WARNS",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Jane Doe 100200 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA ZIP+4 post-marker silent",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Jane Doe 99999-1234 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 0,
    own: 0,
    index: null,
    rawSnippet: null,
  },
  {
    name: "scopeA ZIP+4 rejection (99999-12345)",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Jane Doe 99999-12345 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA ZIP+4 rejection (en dash)",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Jane Doe 99999–1234 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA ZIP+4 rejection (spaced separator)",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Jane Doe 99999 - 1234 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA ZIP+4 rejection (six-digit run)",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Jane Doe 123456-1234 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA ZIP+4 rejection (trailing word char)",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Jane Doe 99999-1234A Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 0,
    own: 0,
    index: null,
    rawSnippet: null,
  },
  {
    name: "scopeA entity-split evidence WARNS",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Marriott Downtown 200&#10;Oak Ave Jane Doe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: "cell",
  },
  {
    name: "scopeA tab-split evidence WARNS",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Marriott Downtown 200&#9;Oak Ave Jane Doe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: "cell",
  },
  {
    name: "scopeA quoted evidence WARNS",
    cell: 'Hyatt Regency John Smith - 1001 Check In: 3/1/26 Marriott Downtown "200 Oak Ave" Jane Doe Check In: 3/3/26 Check Out: 3/4/26',
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: "cell",
  },
  {
    name: "scopeA digit-run prose WARNS",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Note FY-2026 Drive kickoff Jane Doe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA dash-glued street (hyphen)",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Hilton Midtown -1515 Madison Ave Bob Roe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith", "Hilton Midtown"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA dash-glued street (en dash)",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Hilton Midtown –1515 Madison Ave Bob Roe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith", "Hilton Midtown"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA dash-glued street (em dash)",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Hilton Midtown —1515 Madison Ave Bob Roe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith", "Hilton Midtown"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA word-glued street (hyphen)",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Hilton-1515 Madison Ave Bob Roe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA word-glued street (en dash)",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Hilton–1515 Madison Ave Bob Roe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA word-glued street (em dash)",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Hilton—1515 Madison Ave Bob Roe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeA lowercase-state stays silent",
    cell: "Hyatt Regency John Smith - 1001 Check In: 3/1/26 Hilton Midtown 71 chicago, il 60601 Bob Roe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency John Smith",
        hotel_address: null,
        names: ["Hyatt Regency John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 0,
    own: 0,
    index: null,
    rawSnippet: null,
  },
  {
    name: "scopeA entity-split FIRST checkout WARNS",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check&#10;Out: 3/2/26 Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith", "Jane Doe"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: "cell",
  },
  {
    name: "scopeB Jose non-ASCII fallback",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott&#10;Downtown  200 Oak Ave, Chicago, IL 60601 José Núñez - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: "cell",
  },
  {
    name: "scopeB Jose fallback plus third group",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott&#10;Downtown  200 Oak Ave, Chicago, IL 60601 José Núñez - 1002 Check In: 3/3/26 Check Out: 3/4/26 Hilton Midtown Bob Roe - 1003 Check In: 3/5/26 Check Out: 3/6/26",
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith", "Hilton Midtown Bob Roe"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeB fallback suffix-only evidence",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott Downtown 200 Oak Ave Jane Doe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeB fallback no address evidence",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Jane Doe Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 0,
    own: 0,
    index: null,
    rawSnippet: null,
  },
  {
    name: "scopeB fallback survivor conf positive (hyphen)",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott Plaza Jane D - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeB fallback survivor conf positive (en dash)",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott Plaza Jane D – 1002 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeB fallback survivor conf positive (glued em dash)",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott Plaza Jane D—1002 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "scopeB missing group-0 checkout, later postal hotel",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hyatt Regency",
        hotel_address: "100 Main St John Smith",
        names: ["Main St John Smith", "Jane Doe"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
  {
    name: "maxOne pair a: word arm plus tier-1 inheritance",
    cell: "Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1/26 Check Out: 3/2/26 Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26 Hilton Midtown Bob Roe - 1003 Check In: 3/5/26 Check Out: 3/6/26",
    today: [
      {
        hotel_name: "Hyatt Regency 100",
        hotel_address: null,
        names: ["Main St John Smith"],
        check_in: "2026-03-01",
        check_out: "2026-03-02",
      },
      {
        hotel_name: "Marriott Downtown",
        hotel_address: "200 Oak Ave, Chicago, IL 60601",
        names: ["Jane Doe"],
        check_in: "2026-03-03",
        check_out: "2026-03-04",
      },
      {
        hotel_name: "Marriott Downtown",
        hotel_address: "200 Oak Ave, Chicago, IL 60601",
        names: ["Hilton Midtown Bob Roe"],
        check_in: "2026-03-05",
        check_out: "2026-03-06",
      },
    ],
    suspected: 1,
    own: 1,
    index: 2,
    rawSnippet: null,
  },
  {
    name: "stash order SUSPECTED slot",
    cell: "Hotel 71 Chicago, IL 60601 John Smith - 1001 Check In: 3/1/26 Marriott Downtown 200 Oak Ave, Chicago, IL 60601 Jane Doe - 1002 Check In: 3/3/26 Check Out: 3/4/26",
    today: [
      {
        hotel_name: "Hotel 71 Chicago, IL 60601 John Smith",
        hotel_address: null,
        names: ["John Smith", "Jane Doe"],
        check_in: null,
        check_out: null,
      },
    ],
    suspected: 1,
    own: 0,
    index: 0,
    rawSnippet: null,
  },
];

/** Segment 0 as `splitInlineReservationGroups` cuts it: through its own "Check Out". */
const segmentZero = (cellText: string): string => {
  const m = /check\s+out\s*[:\s]+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/i.exec(cellText);
  return m ? cellText.slice(0, m.index + m[0].length).trim() : cellText.trim();
};

describe("scope A / scope B degraded-segment evidence scans", () => {
  for (const c of SCOPE_CASES) {
    it(c.name, () => {
      const { warnings } = parse(wholeCell(c.cell));
      const shape = shapeOf(wholeCell(c.cell));
      // The scans never move a row: today's parse is preserved byte-for-byte.
      expect(shape).toEqual(c.today);
      const suspected = warnings.filter((w) => w.code === SUSPECTED);
      expect(suspected.length).toBe(c.suspected);
      expect(warnings.filter((w) => w.code === OWN).length).toBe(c.own);
      if (c.index !== null && c.suspected > 0) {
        expect(suspected[0]!.blockRef?.index).toBe(c.index);
      }
      if (c.rawSnippet !== null) {
        const expected = c.rawSnippet === "cell" ? c.cell : segmentZero(c.cell);
        expect(suspected[0]!.rawSnippet).toBe(expected);
        // The scan reads D1-NORMALIZED text but persists the RAW bytes.
        expect(suspected[0]!.rawSnippet).not.toBe(normalizeLaterSegmentText(expected));
      }
    });
  }

  it("stash order, SUSPECTED slot: guest, SUSPECTED, address all at index 0", () => {
    const c = SCOPE_CASES.find((x) => x.name === "stash order SUSPECTED slot")!;
    const { warnings } = parse(wholeCell(c.cell));
    expect(warnings.map((w) => w.code)).toEqual([
      "HOTEL_GUEST_SPLIT_AMBIGUOUS",
      SUSPECTED,
      "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
    ]);
    for (const w of warnings) expect(w.blockRef?.index).toBe(0);
  });

  it("max-one pair (a): a word-arm row that ALSO inherits a tier-1 hotel warns once", () => {
    const c = SCOPE_CASES.find(
      (x) => x.name === "maxOne pair a: word arm plus tier-1 inheritance",
    )!;
    const { warnings } = parse(wholeCell(c.cell));
    const own = warnings.filter((w) => w.code === OWN);
    expect(own.length).toBe(1);
    expect(own[0]!.blockRef?.index).toBe(1);
    const suspected = warnings.filter((w) => w.code === SUSPECTED);
    expect(suspected.length).toBe(1);
    expect(suspected[0]!.blockRef?.index).toBe(2);
  });
});
