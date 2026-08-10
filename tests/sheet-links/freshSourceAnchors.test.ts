// Function spec for the shared source-anchor freshness gate (spec
// 2026-08-09-m-wave-2-design §2.3). Failure mode caught: a deep link built from
// anchors computed against an OLDER workbook revision than the show's data —
// wrong tab/range that still looks like a working link.
import { describe, expect, it } from "vitest";

import { freshSourceAnchors } from "@/lib/sheet-links/freshSourceAnchors";

const ANCHORS = { crew: { title: "INFO", gid: 7 } };
const R1 = "2026-08-01T00:00:00.000Z";
const R2 = "2026-08-02T00:00:00.000Z";

describe("freshSourceAnchors", () => {
  it("returns the map when the stamps match", () => {
    expect(freshSourceAnchors(ANCHORS, R1, R1)).toBe(ANCHORS);
  });

  it("returns an empty map on mismatch (anchors older than the data)", () => {
    expect(freshSourceAnchors(ANCHORS, R1, R2)).toEqual({});
  });

  it("NULL anchor stamp = provenance unknown = mismatch", () => {
    expect(freshSourceAnchors(ANCHORS, null, R1)).toEqual({});
    expect(freshSourceAnchors(ANCHORS, undefined, R1)).toEqual({});
  });

  it("NULL last-seen = nothing to prove freshness against = mismatch", () => {
    expect(freshSourceAnchors(ANCHORS, R1, null)).toEqual({});
  });

  it("null/undefined/empty maps pass through as empty", () => {
    expect(freshSourceAnchors(null, R1, R1)).toEqual({});
    expect(freshSourceAnchors(undefined, R1, R1)).toEqual({});
    expect(freshSourceAnchors({}, R1, R1)).toEqual({});
  });
});
