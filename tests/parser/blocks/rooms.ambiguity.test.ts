import { describe, it, expect } from "vitest";
import { parseRooms, splitRoomHeader } from "@/lib/parser/blocks/rooms";
import { newAggregator } from "@/lib/parser/warnings";

// ROOM_HEADER_SPLIT_AMBIGUOUS (spec §4.1). Two-layer testability:
//   1. PURE layer — splitRoomHeader(raw, kind).ambiguity metadata per branch (no emission).
//   2. AGGREGATOR layer — parseRooms(md, version, agg) emits EXACTLY ONE warning per KEPT
//      room whose split was ambiguous, through the single commit-point loop at the end of
//      parseRooms (after merge/reconcile/placeholder gating). Dropped/rejected rooms emit
//      nothing; no caller double-emits.
//
// Seven splitRoomHeader call sites (rooms.ts) — enumerated so a NEW site forces a table
// update. `splitRoomHeader` itself NEVER emits; each site only feeds a room object that may
// or may not reach the single commit point in parseRooms:
//   :752  parseV4RoomBlock       — v4 GS/BO/ADDITIONAL block header      → PERSISTS (gs ungated; bo/add content-gated)
//   :957  parseGsRoom (labeled)  — v2/v1 "GENERAL SESSION <name>" header → PERSISTS (kept when name truthy)
//   :968  parseGsRoom (venue)    — v2/v1 venue-headed GS fallback        → PERSISTS (kept when split.name truthy)
//   :1140 parseBoRooms (BREAKOUT)— v2 "BREAKOUT N&#10;…" block header    → PERSISTS (content/prefix gated) / REJECTS a prefixed-no-BO-field candidate
//   :1187 parseBoRooms (LUNCH)   — "LUNCH ROOM …" header                 → PERSISTS
//   :1247 parseBoRooms (Pass 5)  — dims-only BO-venue header             → PERSISTS (roomHasContent gated)
//   :1404 parseAdditionalRoom    — v2 "ADDITIONAL ROOM …" fallback       → PERSISTS (placeholder gated)

const RSA = (agg: ReturnType<typeof newAggregator>) =>
  agg.warnings.filter((w) => w.code === "ROOM_HEADER_SPLIT_AMBIGUOUS");

// ── Fixture builders (each isolates ONE call site) ──────────────────────────
// v4 GS block: first row is a BARE v4 label so hasBareV4DataRow → true (routes :752).
const v4GsSite752 = (header: string) => `| GENERAL SESSION ${header} | |\n| Setup | 100 chairs |\n`;
// v2 GS: "GS Setup"-prefixed rows keep it off the v4 path; labeled header routes :957.
const v2GsSite957 = (header: string) =>
  `| GENERAL SESSION ${header} | |\n| GS Setup | 100 chairs |\n`;
// v2 GS venue-headed fallback: no "GENERAL SESSION" label, column-duplicated venue header
// carrying dims directly above the first "GS Set Time" row → routes :968.
const v2GsSite968 = (header: string) => `| ${header} | ${header} |\n| GS Set Time | 4/20 8am |\n`;
// v2 numbered BREAKOUT block header (multi-line &#10; cell) → routes :1140.
const v2BoSite1140 = (header: string) =>
  `| BREAKOUT 1&#10;${header} | |\n| BO Setup | 100 chairs |\n`;
// LUNCH ROOM header → routes :1187.
const lunchSite1187 = (header: string) => `| LUNCH ROOM ${header} | |\n| BO Setup | buffet |\n`;
// Pass-5 dims-only BO-venue header (column-duplicated, no banner token) above a BO field
// block → routes :1247.
const boVenueSite1247 = (header: string) =>
  `| ${header} | ${header} |\n| BO Setup | 100 chairs |\n`;
// v2 ADDITIONAL ROOM fallback (BO-field row keeps it off the bare-label v4 path) → routes :1404.
const addlSite1404 = (header: string) =>
  `| ADDITIONAL ROOM ${header} | |\n| BO Setup | staging |\n`;

// One ambiguous header per site (two complete dims groups → field "dims", name "LASALLE").
const AMB = "LASALLE 50' x 40' 30' x 20'";

type Row = { site: string; fixture: string; expected: number };
const CALLER_TABLE: Row[] = [
  { site: ":752 parseV4RoomBlock", fixture: v4GsSite752(AMB), expected: 1 },
  { site: ":957 parseGsRoom(labeled)", fixture: v2GsSite957(AMB), expected: 1 },
  { site: ":968 parseGsRoom(venue)", fixture: v2GsSite968(AMB), expected: 1 },
  { site: ":1140 parseBoRooms(BREAKOUT)", fixture: v2BoSite1140(AMB), expected: 1 },
  { site: ":1187 parseBoRooms(LUNCH)", fixture: lunchSite1187(AMB), expected: 1 },
  { site: ":1247 parseBoRooms(Pass5)", fixture: boVenueSite1247(AMB), expected: 1 },
  { site: ":1404 parseAdditionalRoom", fixture: addlSite1404(AMB), expected: 1 },
];

describe("splitRoomHeader — pure ambiguity metadata (spec §4.1)", () => {
  it("double-dims group → field 'dims', name preserved", () => {
    expect(splitRoomHeader("LASALLE 50' x 40' 30' x 20'", "breakout").ambiguity).toMatchObject({
      field: "dims",
    });
    expect(splitRoomHeader("LASALLE 50' x 40' 30' x 20'", "breakout").name).toBe("LASALLE");
  });
  it("dims-leading header (residual name empty) → field 'name'", () => {
    expect(splitRoomHeader("50' x 40' LASALLE", "breakout").ambiguity).toMatchObject({
      field: "name",
    });
  });
  it("strip leaves empty residual → field 'name'", () => {
    expect(splitRoomHeader("BREAKOUT 1 50' x 40'", "breakout").ambiguity).toMatchObject({
      field: "name",
    });
  });
  it("punctuation-only residual → field 'name'", () => {
    expect(splitRoomHeader("- 50' x 40'", "breakout").ambiguity).toMatchObject({ field: "name" });
  });
  it("single-char residual → field 'name'", () => {
    expect(splitRoomHeader("X 50' x 40'", "breakout").ambiguity).toMatchObject({ field: "name" });
  });
  it("plain 3-operand dims + real name → no ambiguity", () => {
    expect(splitRoomHeader("LASALLE 75' x 37' x 16'", "breakout").ambiguity).toBeUndefined();
  });
  it("short real name, no dims → no ambiguity (residual not consumed by a strip)", () => {
    expect(splitRoomHeader("A", "gs").ambiguity).toBeUndefined();
  });
});

describe("parseRooms — ROOM_HEADER_SPLIT_AMBIGUOUS emission (single commit point)", () => {
  it("warns once on a double-dims v4 GS header: field=dims, name preserved, rawSnippet=raw", () => {
    const agg = newAggregator();
    parseRooms(v4GsSite752(AMB), "v4", agg);
    const w = RSA(agg);
    expect(w).toHaveLength(1);
    expect(w[0]!.severity).toBe("warn");
    expect(w[0]!.blockRef).toMatchObject({ kind: "rooms", field: "dims", name: "LASALLE" });
    expect(w[0]!.rawSnippet).toContain("50' x 40' 30' x 20'");
  });

  it("no warn on a plain 3-operand dims header", () => {
    const agg = newAggregator();
    parseRooms(v4GsSite752("LASALLE 75' x 37' x 16'"), "v4", agg);
    expect(RSA(agg)).toHaveLength(0);
  });

  it("warns on a dims-leading v4 header with field=name", () => {
    const agg = newAggregator();
    parseRooms(v4GsSite752("50' x 40' LASALLE"), "v4", agg);
    const w = RSA(agg);
    expect(w).toHaveLength(1);
    expect(w[0]!.blockRef).toMatchObject({ kind: "rooms", field: "name" });
  });

  it("blockRef.kind is ALWAYS the literal 'rooms' (never a RoomKind)", () => {
    const agg = newAggregator();
    parseRooms(v2BoSite1140(AMB), "v1", agg);
    expect(RSA(agg)[0]!.blockRef!.kind).toBe("rooms");
  });

  it("dropped placeholder / rejected candidate emits NOTHING (spec §11.7)", () => {
    // A show-prefixed BREAKOUT header with dims but NO BO field value is rejected
    // (roomHasBoFieldValue gate, rooms.ts:1169) → never reaches the commit point.
    const agg = newAggregator();
    parseRooms(`| RPAS BREAKOUT 1&#10;${AMB} | |\n`, "v1", agg);
    expect(RSA(agg)).toHaveLength(0);
  });

  it("no aggregator → no throw, no emission (agg is optional)", () => {
    expect(() => parseRooms(v4GsSite752(AMB), "v4")).not.toThrow();
  });

  // Table-driven per-call-site coverage — row count pinned to 7 (a new splitRoomHeader
  // call site must add a row here).
  it("CALLER_TABLE covers exactly the 7 enumerated call sites", () => {
    expect(CALLER_TABLE).toHaveLength(7);
  });

  it.each(CALLER_TABLE)("$site → $expected warning(s)", ({ fixture, expected }) => {
    const agg = newAggregator();
    parseRooms(fixture, "v1", agg);
    expect(RSA(agg)).toHaveLength(expected);
  });
});
