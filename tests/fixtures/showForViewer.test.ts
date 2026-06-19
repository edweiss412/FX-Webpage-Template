import { describe, expect, test } from "vitest";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";

describe("makeShowForViewer", () => {
  test("deep-merges overrides into a complete ShowForViewer default", () => {
    const d: ShowForViewer = makeShowForViewer({
      show: { venue: { name: "V", address: "A" } },
      rooms: [{ id: "r1", kind: "gs", name: "GS" }],
    });
    expect(d.show.venue?.name).toBe("V"); // deep-merge into show (other show fields keep defaults)
    expect(d.show.title).toBeDefined(); // show kept its other defaults
    expect(d.rooms[0]?.id).toBe("r1");
    expect(d.rooms[0]?.kind).toBe("gs");
    expect(d.tileErrors).toEqual({}); // default
    expect(d.viewerName).toBeDefined();
    expect(d.financials).toBeUndefined(); // financials OMITTED by default (exactOptionalPropertyTypes)
  });
  test("a financials override is applied (Budget test path)", () => {
    const d = makeShowForViewer({ financials: { po: "PO-1", proposal: "P", invoice: "I", invoice_notes: "N" } });
    expect(d.financials?.po).toBe("PO-1");
  });
});
