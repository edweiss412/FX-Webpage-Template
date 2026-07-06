import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { computeRoomHeaderModel, findBoBlockVenueHeaders } from "../../../lib/parser/blocks/rooms";
import { parseSheet } from "../../../lib/parser";

/**
 * Unit tests for the exported `findBoBlockVenueHeaders` resolver (spec §3.1).
 *
 * The resolver walks UP from each `BO Setup/Set Time/Show Time/Strike Time` anchor
 * to the header cell above its field block and returns one record per resolved
 * header `{ header, headerLine, admit }`. `admit` is TRUE only for a dims-only
 * block-header-shaped venue cell that is not a banner, not a DAY-range header, and
 * carries dims/newline evidence. Rejected headers are STILL recorded (admit=false)
 * so the fifth pass can use them as extraction terminators.
 */

function find(md: string) {
  return findBoBlockVenueHeaders(md, computeRoomHeaderModel(md));
}

describe("findBoBlockVenueHeaders", () => {
  it("admits a dims-only col-duplicated venue header above a BO block", () => {
    // Failure mode: the resolver misses the header (walks past it) or mis-classifies
    // a legitimate dims-only venue as a non-room.
    const md = [
      "| SALON ABCD&#10;60' x 45' | SALON ABCD&#10;60' x 45' |",
      "| :---: | :---: |",
      "| BO Setup | A |",
      "| BO Audio | 2 mics |",
    ].join("\n");
    const rec = find(md);
    expect(rec).toHaveLength(1);
    expect(rec[0]!.admit).toBe(true);
    expect(rec[0]!.header).toContain("SALON ABCD");
  });

  it("rejects a label|value asset row directly above a BO block", () => {
    // Failure mode: a `| PROJECTION SCREEN | 5' x 9' |` asset (distinct c1) is admitted
    // as a phantom room. Shape gate (c1===c0 || c1==="") must reject it.
    const md = ["| PROJECTION SCREEN | 5' x 9' |", "| BO Setup | screen-only |"].join("\n");
    const rec = find(md);
    expect(rec).toHaveLength(1);
    expect(rec[0]!.admit).toBe(false);
  });

  it("rejects a show-prefixed BREAKOUT banner via the SUBSTRING gate", () => {
    // Failure mode: `RPAS BREAKOUT 2` slips past a `^BREAKOUT`-anchored banner test.
    // The banner exclusion is a SUBSTRING match, so `\bBREAKOUT\b` anywhere rejects.
    const md = [
      "| RPAS BREAKOUT 2&#10;LASALLE B&#10;30' x 25' | RPAS BREAKOUT 2&#10;LASALLE B&#10;30' x 25' |",
      "| :---: | :---: |",
      "| BO Setup | rounds |",
    ].join("\n");
    const rec = find(md);
    expect(rec).toHaveLength(1);
    expect(rec[0]!.admit).toBe(false);
  });

  it("rejects a DAY-range header (owned by the v1 loop)", () => {
    // Failure mode: a real DAY-range breakout header is double-claimed by this pass.
    const md = [
      "| SALON A&#10;DAY 1 & 2 | SALON A&#10;DAY 1 & 2 |",
      "| :---: | :---: |",
      "| BO Setup | rounds |",
    ].join("\n");
    const rec = find(md);
    expect(rec).toHaveLength(1);
    expect(rec[0]!.admit).toBe(false);
  });

  it("admits a venue whose name begins with a non-field word after BO (BO BALLROOM)", () => {
    // Failure mode: the walk-up skip for `^BO <field-label>` over-matches and swallows
    // a real `BO BALLROOM` venue header (BALLROOM is not a ROOM_FIELD_LABEL).
    const md = [
      "| BO BALLROOM&#10;40' x 30' | BO BALLROOM&#10;40' x 30' |",
      "| :---: | :---: |",
      "| BO Setup | rounds |",
    ].join("\n");
    const rec = find(md);
    expect(rec).toHaveLength(1);
    expect(rec[0]!.admit).toBe(true);
    expect(rec[0]!.header).toContain("BO BALLROOM");
  });

  it("collapses two anchors under one header to a single record", () => {
    // Failure mode: BO Setup AND BO Set Time each emit a record for the same header.
    // Walk-up skips intervening BO field-label rows; dedup by headerLine yields one.
    const md = [
      "| MERIDIAN&#10;40' x 30' | MERIDIAN&#10;40' x 30' |",
      "| :---: | :---: |",
      "| BO Setup | m-setup |",
      "| BO Set Time | 8 AM |",
    ].join("\n");
    const rec = find(md);
    expect(rec).toHaveLength(1);
    expect(rec[0]!.admit).toBe(true);
    expect(rec[0]!.header).toContain("MERIDIAN");
  });

  it("skips an empty-col-0 continuation row during walk-up (still one record)", () => {
    // Failure mode: a `|  | continuation |` wrap row (empty col0) stops the walk-up
    // short, so the second anchor fails to resolve back to the SALON header.
    const md = [
      "| SALON&#10;60' x 45' | SALON&#10;60' x 45' |",
      "| :---: | :---: |",
      "| BO Setup | A |",
      "|  | continuation-detail |",
      "| BO Set Time | B |",
    ].join("\n");
    const rec = find(md);
    expect(rec).toHaveLength(1);
    expect(rec[0]!.admit).toBe(true);
    expect(rec[0]!.header).toContain("SALON");
  });

  it("returns only the intended rooms in the admit filter", () => {
    const md = [
      "| SALON ABCD&#10;60' x 45' | SALON ABCD&#10;60' x 45' |",
      "| :---: | :---: |",
      "| BO Setup | A |",
      "| PROJECTION SCREEN | 5' x 9' |",
      "| BO Setup | screen-only |",
    ].join("\n");
    const admitted = find(md)
      .filter((h) => h.admit)
      .map((h) => h.header.replace(/&#10;.*/s, "").trim());
    expect(admitted).toEqual(["SALON ABCD"]);
  });
});

describe("BO-venue-header fifth pass (e2e via parseSheet)", () => {
  const md = readFileSync("fixtures/shows/synthetic/2026-07-bo-venue-header.md", "utf8");
  const rooms = parseSheet(md).rooms;
  const byName = (n: string) => rooms.filter((r) => (r.name ?? "").toUpperCase() === n);

  it("admits SALON ABCD once with its own dims + BO fields", () => {
    const salon = byName("SALON ABCD");
    expect(salon).toHaveLength(1);
    expect(salon[0]!.kind).toBe("breakout");
    expect(salon[0]!.dimensions).toBe("60' x 45'");
    expect(salon[0]!.setup).toBe("A");
    expect(salon[0]!.audio).toBe("2 mics");
    expect(salon[0]!.video).toBe("screen");
  });

  it("admits MERIDIAN once with its OWN fields (no field theft from SALON, adjacency)", () => {
    // Case 5: MERIDIAN sits immediately below SALON's block with no blank separator.
    // If SALON's extraction over-ran into MERIDIAN's rows, MERIDIAN would be empty or
    // SALON would carry m-setup. Both must own their own fields.
    const meridian = byName("MERIDIAN");
    expect(meridian).toHaveLength(1);
    expect(meridian[0]!.setup).toBe("m-setup");
    expect(meridian[0]!.audio).toBe("m-audio");
  });

  it("admits ORCHID once and terminates its block at the REJECTED PROJECTOR CART header", () => {
    // Case 6: the rejected `PROJECTOR CART` asset header (admit=false) must be in
    // extraTerm so ORCHID's extraction stops before `cart-setup`. A `filter(h=>h.admit)`
    // extraTerm would leak cart-setup into ORCHID.
    const orchid = byName("ORCHID");
    expect(orchid).toHaveLength(1);
    expect(orchid[0]!.setup).toBe("orchid-setup");
    expect(orchid[0]!.setup).not.toBe("cart-setup");
  });

  it("does NOT fabricate rooms from label|value asset rows", () => {
    for (const asset of ["PROJECTION SCREEN", "RISER", "PROJECTOR CART"]) {
      expect(rooms.some((r) => (r.name ?? "").toUpperCase().includes(asset))).toBe(false);
    }
  });

  it("emits the GRAND HALL DAY-range breakout exactly once (owned by the v1 loop)", () => {
    const grand = byName("GRAND HALL");
    expect(grand).toHaveLength(1);
    expect(grand[0]!.kind).toBe("breakout");
  });
});

// Enumerate every committed non-synthetic show fixture (raw / exporter-xlsx /
// email-embedded / pdf-only / parser-units). The synthetic capability fixture is the
// ONE place a dims-only BO-venue header is expected to admit — excluded here.
function nonSyntheticFixtures(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "synthetic") out.push(...nonSyntheticFixtures(p));
    } else if (e.endsWith(".md") && e !== "README.md" && !e.startsWith("_")) {
      out.push(p);
    }
  }
  return out;
}

describe("BO-venue-header anchor — corpus no-op (spec §5 / §7 test 3)", () => {
  const files = nonSyntheticFixtures("fixtures/shows");

  it("enumerates the real corpus (non-empty)", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files)("%s admits zero BO-venue headers", (path) => {
    // Asserts on the resolver's data source, NOT the rendered room container
    // (anti-tautology): a fabricated OR mis-classified header shows up here as an admit.
    const md = readFileSync(path, "utf8");
    const admits = findBoBlockVenueHeaders(md, computeRoomHeaderModel(md)).filter((h) => h.admit);
    expect(admits.map((h) => h.header)).toEqual([]);
  });
});

describe("BO-venue-header anchor — asset non-fabrication under mutation (spec §7 test 4)", () => {
  // Fixture case 2: a `label|value` asset directly above a BO block. The shape gate
  // (c1===c0 || c1==="") must reject it under column/blank-row perturbation — a mutation
  // must never flip a distinct-c1 asset into an admitted room. Complements
  // feat/mutation-harness (no dependency).
  const variants: Record<string, string> = {
    baseline: ["| PROJECTION SCREEN | 5' x 9' |", "| BO Setup | screen-only |"].join("\n"),
    "blank-row-injected": [
      "| PROJECTION SCREEN | 5' x 9' |",
      "",
      "| BO Setup | screen-only |",
    ].join("\n"),
    "leading-empty-column": [
      "|  | PROJECTION SCREEN | 5' x 9' |",
      "| BO Setup | screen-only |",
    ].join("\n"),
    "trailing-empty-column": [
      "| PROJECTION SCREEN | 5' x 9' |  |",
      "| BO Setup | screen-only |",
    ].join("\n"),
  };

  it.each(Object.keys(variants))("no PROJECTION SCREEN room under %s", (k) => {
    const rooms = parseSheet(variants[k]!).rooms;
    expect(rooms.some((r) => (r.name ?? "").toUpperCase().includes("PROJECTION SCREEN"))).toBe(
      false,
    );
  });
});

describe("BO-venue-header anchor — GS/BO reconciliation (spec §7 test 5)", () => {
  const GS = ["| GENERAL SESSION HELICON | |", "| GS Setup | theatre |", "| GS Audio | 2 mics |"];
  const venue = (audio: string) =>
    [
      "| HELICON&#10;60' x 45' | HELICON&#10;60' x 45' |",
      "| :---: | :---: |",
      "| BO Setup | theatre |",
      `| BO Audio | ${audio} |`,
    ].join("\n");

  it("(a) absorbs a lossless-subset breakout into the GS room, filling dims", () => {
    // Every populated breakout field equals GS (setup/audio), dims absent in GS → copied.
    // Lossless subset → absorbed at rooms.ts:424; exactly one GS HELICON with dims.
    const rooms = parseSheet([...GS, venue("2 mics")].join("\n")).rooms;
    const helicon = rooms.filter((r) => (r.name ?? "").toUpperCase() === "HELICON");
    expect(helicon).toHaveLength(1);
    expect(helicon[0]!.kind).toBe("gs");
    expect(helicon[0]!.dimensions).toBe("60' x 45'");
  });

  it("(b) keeps BOTH rooms when a field conflicts (audio 6 mics ≠ 2 mics)", () => {
    // Conflict → not a subset → both kept at rooms.ts:430 (east-coast MABEL 1 behavior).
    // Proves the new pass routed through reconciliation and did NOT delete the breakout.
    const rooms = parseSheet([...GS, venue("6 mics")].join("\n")).rooms;
    const helicon = rooms.filter((r) => (r.name ?? "").toUpperCase() === "HELICON");
    expect(helicon).toHaveLength(2);
    expect(helicon.map((r) => r.kind).sort()).toEqual(["breakout", "gs"]);
    expect(helicon.find((r) => r.kind === "breakout")!.audio).toBe("6 mics");
  });
});
