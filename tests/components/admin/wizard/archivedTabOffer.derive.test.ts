import { describe, expect, it } from "vitest";

import { deriveArchivedOffers } from "@/components/admin/wizard/archivedTabOffer";
import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";

const tab = (over: Partial<ArchivedPullSheetTab> = {}): ArchivedPullSheetTab => ({
  tabName: "OLD gear",
  headerPreviews: ["CASE A"],
  fingerprint: "fp1",
  included: false,
  contentChangedSinceAccept: false,
  ...over,
});

describe("deriveArchivedOffers", () => {
  it("offers every non-included tab when staged, no override, no divergence", () => {
    const t1 = tab({ tabName: "OLD gear" });
    const t2 = tab({ tabName: "OLD gear 2", fingerprint: "fp2" });
    const r = deriveArchivedOffers([t1, t2], true, null);
    expect(r.overrideActive).toBe(false);
    expect(r.divergent).toBe(false);
    expect(r.includedTab).toBeNull();
    expect(r.offers).toEqual([t1, t2]);
  });

  it("suppresses offers when a durable override matches the included-tab preview (S3)", () => {
    const inc = tab({ tabName: "OLD gear", included: true });
    const pend = tab({ tabName: "OLD gear 2", fingerprint: "fp2" });
    const r = deriveArchivedOffers([inc, pend], true, {
      tabName: "OLD gear",
      fingerprint: "fp1",
    });
    expect(r.overrideActive).toBe(true);
    expect(r.divergent).toBe(false);
    expect(r.includedTab).toBe(inc);
    expect(r.offers).toEqual([]);
  });

  it("flags S5 divergence (offers empty) when preview shows an included tab but no durable override", () => {
    const inc = tab({ tabName: "OLD gear", included: true });
    const r = deriveArchivedOffers([inc], true, null);
    expect(r.divergent).toBe(true);
    expect(r.offers).toEqual([]);
  });

  it("flags S5 divergence when a durable override is set but the preview has no included tab", () => {
    const pend = tab({ tabName: "OLD gear", included: false });
    const r = deriveArchivedOffers([pend], true, { tabName: "OLD gear", fingerprint: "fp1" });
    expect(r.overrideActive).toBe(true);
    expect(r.divergent).toBe(true);
    expect(r.offers).toEqual([]);
  });

  it("returns no offers and no includedTab when not staged", () => {
    const r = deriveArchivedOffers([tab({ included: true }), tab()], false, null);
    expect(r.includedTab).toBeNull();
    expect(r.divergent).toBe(false);
    expect(r.offers).toEqual([]);
  });

  it("empty tabs, no override → empty offers, no divergence", () => {
    const r = deriveArchivedOffers([], true, null);
    expect(r.offers).toEqual([]);
    expect(r.divergent).toBe(false);
  });
});
