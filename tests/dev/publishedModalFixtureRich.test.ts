/**
 * tests/dev/publishedModalFixtureRich.test.ts
 * (spec 2026-07-22-attention-gallery-gap-fill §3.4)
 *
 * The rich base gallery snapshot: every fixture row must SURVIVE the real
 * adapter's narrowing at the pinned counts. A malformed row that the adapter
 * drops would silently thin the backdrop — that is a failure, not a default.
 */
import { describe, expect, it } from "vitest";
import { buildGallerySnapshot } from "@/lib/dev/publishedModalFixture";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";

describe("rich gallery snapshot", () => {
  const data = buildPublishedSectionData(buildGallerySnapshot([]), { slug: "gallery" });

  it("every row survives adapter narrowing at the pinned counts", () => {
    expect(data.crewMembers).toHaveLength(6);
    expect(data.rooms).toHaveLength(3);
    expect(data.hotels).toHaveLength(2);
    expect(data.transportation).not.toBeNull();
    expect(data.contacts).toHaveLength(2);
    expect(data.agendaBaseline.length).toBeGreaterThanOrEqual(1);
  });

  it("transportation picks the lowest-id row deterministically", () => {
    expect(data.transportation?.driver_name).toBe("Morgan Lee");
  });
});
