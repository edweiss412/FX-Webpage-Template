import { describe, it, expect } from "vitest";
import { computeRoomHeaderModel, findBoBlockVenueHeaders } from "../../../lib/parser/blocks/rooms";

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
