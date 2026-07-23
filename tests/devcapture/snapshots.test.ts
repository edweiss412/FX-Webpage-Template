/**
 * tests/devcapture/snapshots.test.ts — spec §4.3 allowlists (plan Task 7):
 * exclusions (crewEmails/pickerCrew/functions/now), caps 50 + sibling
 * truncation markers, staged resolution optional omission + exact 4-field
 * projection.
 */
import { describe, expect, it } from "vitest";
import { buildPublishedSnapshot, buildStagedSnapshot } from "@/components/admin/dev/snapshots";

function publishedFixture(overrides: Record<string, unknown> = {}) {
  return {
    slug: "test-show",
    showId: "11111111-2222-4333-8444-555555555555",
    title: "SNAPSHOT-CANARY",
    archived: false,
    published: true,
    finalizeOwned: false,
    isLive: true,
    lastSyncedAt: "2026-07-22T00:00:00Z",
    lastCheckedAt: null,
    lastSyncStatus: "ok",
    alertsDegraded: false,
    alertId: null,
    openSheetHref: "https://docs.google.com/x",
    attentionItems: Array.from({ length: 3 }, (_, i) => ({ id: `att${i}` })),
    feed: Array.from({ length: 3 }, (_, i) => ({ id: `feed${i}` })),
    bySection: { hotels: { level: "warn" } },
    data: { deep: { note: "content" } },
    // Must never serialize:
    crewEmails: ["crew@example.com"],
    pickerCrew: [{ name: "A Crew", email: "a@example.com" }],
    now: new Date(),
    setPublished: () => Promise.resolve(),
    ...overrides,
  };
}

describe("buildPublishedSnapshot", () => {
  it("projects the allowlist and excludes crewEmails/pickerCrew/functions/now", () => {
    const snap = buildPublishedSnapshot(publishedFixture()) as Record<string, unknown>;
    expect(snap["title"]).toBe("SNAPSHOT-CANARY");
    expect(snap["slug"]).toBe("test-show");
    expect(snap["bySection"]).toEqual({ hotels: { level: "warn" } });
    const json = JSON.stringify(snap);
    expect(json).not.toContain("crew@example.com");
    expect(json).not.toContain("pickerCrew");
    expect(json).not.toContain("crewEmails");
    expect(Object.keys(snap)).not.toContain("now");
    expect(Object.keys(snap)).not.toContain("setPublished");
  });

  it("caps attentionItems and feed at 50 with sibling markers only when the cap bites", () => {
    const over = buildPublishedSnapshot(
      publishedFixture({
        attentionItems: Array.from({ length: 51 }, (_, i) => ({ id: i })),
        feed: Array.from({ length: 51 }, (_, i) => ({ id: i })),
      }),
    ) as Record<string, unknown>;
    expect(over["attentionItems"]).toHaveLength(50);
    expect(over["attentionItemsTruncated"]).toBe(true);
    expect(over["feed"]).toHaveLength(50);
    expect(over["feedTruncated"]).toBe(true);

    const exact = buildPublishedSnapshot(
      publishedFixture({
        attentionItems: Array.from({ length: 50 }, (_, i) => ({ id: i })),
        feed: Array.from({ length: 50 }, (_, i) => ({ id: i })),
      }),
    ) as Record<string, unknown>;
    expect(exact["attentionItems"]).toHaveLength(50);
    expect(Object.keys(exact)).not.toContain("attentionItemsTruncated");
    expect(Object.keys(exact)).not.toContain("feedTruncated");
  });
});

describe("buildStagedSnapshot", () => {
  const data = { dfid: "drive-1", wizardSessionId: "w1", deep: { note: "STAGED-CANARY" } };

  it("omits resolution entirely when absent", () => {
    const snap = buildStagedSnapshot({
      data,
      checked: true,
      isDirtyRescan: false,
      isPublishRunActive: false,
    }) as Record<string, unknown>;
    expect(Object.keys(snap)).not.toContain("resolution");
    expect(snap["checked"]).toBe(true);
    expect((snap["data"] as { deep: { note: string } }).deep.note).toBe("STAGED-CANARY");
  });

  it("projects resolution to exactly the four scalar fields", () => {
    const snap = buildStagedSnapshot({
      data,
      checked: false,
      isDirtyRescan: true,
      isPublishRunActive: true,
      resolution: {
        stagedId: "staged-9",
        reviewItemsCorrupt: false,
        isPublishRunActive: true,
        triggeredReviewItems: [{ id: 1 }, { id: 2 }],
        onApplyResolve: () => Promise.resolve(true),
        onRescan: () => undefined,
        onIgnore: () => Promise.resolve(true),
      },
    }) as { resolution: Record<string, unknown> };
    expect(snap.resolution).toEqual({
      stagedId: "staged-9",
      reviewItemsCorrupt: false,
      isPublishRunActive: true,
      triggeredReviewItemCount: 2,
    });
  });
});
