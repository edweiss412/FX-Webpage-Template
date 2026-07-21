// tests/admin/attentionItems.test.ts
//
// Unit coverage for the attention-item derivation (spec
// docs/superpowers/specs/2026-07-19-published-show-alerts.md §3-§4).
// Expectations derive from fixture composition, never mirrored constants
// (anti-tautology rule).
import { describe, expect, it } from "vitest";
import {
  ATTENTION_FALLBACK_TITLE,
  ATTENTION_ROUTES,
  canonicalCrewKey,
  deriveAttentionItems,
  type AttentionAlertInput,
} from "@/lib/admin/attentionItems";
import type { FeedEntry } from "@/lib/sync/holds/types";

const SLUG = "test-show";

/**
 * The default fixture code is AMBIGUOUS_EMAIL_BINDING: crew-routed, manual
 * resolution, and RETAINED by the attention surface.
 *
 * It was ROLE_FLAGS_NOTICE until warning-surface-trim §5 wired
 * DOUG_EXCLUDED_CODES into `deriveAttentionItems`, which correctly drops that
 * code from the modal. These cases are about mapping, ordering, crewKey, and
 * payload population, not about the exclusion, so they need a code the
 * derivation keeps; the exclusion itself is pinned by
 * tests/admin/attentionExclusionSet.test.ts and the behavioral assertion in
 * tests/admin/roleFlagsNoticeReclassify.test.ts.
 */
function alert(over: Partial<AttentionAlertInput> = {}): AttentionAlertInput {
  return {
    id: "a1",
    code: "AMBIGUOUS_EMAIL_BINDING",
    context: null,
    raised_at: "2026-07-19T10:00:00Z",
    occurrence_count: 1,
    identityText: "Crew · John Redcorn",
    messageParams: {},
    crewName: null,
    ...over,
  };
}

function holdEntry(over: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id: "h1",
    occurredAt: "2026-07-19T09:00:00Z",
    status: "pending",
    summary: "Priya Shah's row changed while a rename was pending.",
    action: "approve_reject",
    entityRef: null,
    acceptable: false,
    acknowledgedAt: null,
    gate: {
      holdId: "hold-1",
      disposition: { disposition: "rename", name: "Priya Shah" } as never,
      baseModifiedTime: "2026-07-19T08:00:00Z",
    },
    ...over,
  };
}

describe("deriveAttentionItems", () => {
  it("maps an actionable alert: notice tone, alert payload, catalog title", () => {
    const items = deriveAttentionItems({ alerts: [alert()], feed: null, slug: SLUG });
    expect(items).toHaveLength(1);
    const it0 = items[0]!;
    expect(it0.id).toBe("alert:a1");
    expect(it0.kind).toBe("alert");
    expect(it0.tone).toBe("notice");
    expect(it0.actionable).toBe(true);
    expect(it0.sectionId).toBe("crew");
    expect(it0.alert?.alertId).toBe("a1");
    expect(it0.alert?.autoClearNote).toBeNull();
    // menuTitle comes from the catalog, never the raw code (invariant 5)
    expect(it0.menuTitle).not.toContain("AMBIGUOUS_EMAIL_BINDING");
    expect(it0.menuTitle.length).toBeGreaterThan(0);
  });

  it("positive interpolation (ported from the retired section suite): a real code with resolving params carries its raw template; unresolved placeholders → null template", () => {
    // RESYNC_SHRINK_HELD's dougFacing names <sheet-name>; supplying it resolves
    // the template (the raw template string is kept — emphasis renders later).
    const [resolved] = deriveAttentionItems({
      alerts: [
        alert({
          id: "i1",
          code: "RESYNC_SHRINK_HELD",
          messageParams: { "sheet-name": "II - Demo Show" },
        }),
      ],
      feed: null,
      slug: SLUG,
    });
    expect(resolved!.alert?.template).toBeTruthy();
    // Missing params → unresolved <placeholder> → null (invariant-5 guard).
    const [unresolved] = deriveAttentionItems({
      alerts: [alert({ id: "i2", code: "RESYNC_SHRINK_HELD", messageParams: {} })],
      feed: null,
      slug: SLUG,
    });
    expect(unresolved!.alert?.template).toBeNull();
  });

  it("auto-resolving (resolution:'auto') codes get autoResolveNote copy, not the inbox line", () => {
    const items = deriveAttentionItems({
      alerts: [alert({ id: "ar1", code: "RESYNC_SHRINK_HELD", messageParams: {} })],
      feed: null,
      slug: SLUG,
    });
    expect(items[0]!.actionable).toBe(false);
    // autoResolveNote's copy (per-code or its default) — presence is the
    // contract; the exact string is catalog-owned.
    expect(items[0]!.alert?.autoClearNote).toBeTruthy();
  });

  it("classifies inbox-routed codes as non-actionable with an auto-clear note", () => {
    const items = deriveAttentionItems({
      alerts: [alert({ id: "a2", code: "SHEET_UNAVAILABLE", identityText: null })],
      feed: null,
      slug: SLUG,
    });
    expect(items[0]!.actionable).toBe(false);
    expect(items[0]!.alert?.autoClearNote).toBeTruthy();
  });

  it("maps a pending hold: critical tone, changes section, feed summary as title", () => {
    const items = deriveAttentionItems({
      alerts: [],
      feed: { entries: [holdEntry()] },
      slug: SLUG,
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("hold:hold-1");
    expect(items[0]!.tone).toBe("critical");
    expect(items[0]!.sectionId).toBe("changes");
    expect(items[0]!.crewKey).toBeNull();
    expect(items[0]!.actionable).toBe(true);
    expect(items[0]!.menuTitle).toBe("Priya Shah's row changed while a rename was pending.");
    expect(items[0]!.alert).toBeUndefined();
  });

  it("ignores non-pending / non-gate feed entries and null feed", () => {
    const applied = holdEntry({ id: "h2", status: "applied", action: "undo" });
    delete (applied as { gate?: unknown }).gate;
    expect(
      deriveAttentionItems({ alerts: [], feed: { entries: [applied] }, slug: SLUG }),
    ).toHaveLength(0);
    expect(deriveAttentionItems({ alerts: [], feed: null, slug: SLUG })).toHaveLength(0);
  });

  it("orders: actionable holds (critical) before actionable alerts (notice), auto-clearing last", () => {
    const items = deriveAttentionItems({
      alerts: [
        alert({ id: "auto", code: "SHEET_UNAVAILABLE" }),
        alert({ id: "act", code: "AMBIGUOUS_EMAIL_BINDING" }),
      ],
      feed: { entries: [holdEntry()] },
      slug: SLUG,
    });
    expect(items.map((i) => i.id)).toEqual(["hold:hold-1", "alert:act", "alert:auto"]);
  });

  it("crewKey: canonicalized crewName; null crewName → null crewKey", () => {
    const [withName, without] = deriveAttentionItems({
      alerts: [
        alert({ id: "n1", crewName: "  John Redcorn " }),
        alert({ id: "n2", crewName: null }),
      ],
      feed: null,
      slug: SLUG,
    });
    expect(withName!.crewKey).toBe("john redcorn");
    expect(without!.crewKey).toBeNull();
    expect(canonicalCrewKey("  MiXeD Case ")).toBe("mixed case");
  });

  it("crewName on a non-crew-routed code never yields a crewKey", () => {
    const items = deriveAttentionItems({
      alerts: [alert({ id: "o1", code: "RESYNC_SHRINK_HELD", crewName: "John Redcorn" })],
      feed: null,
      slug: SLUG,
    });
    expect(items[0]!.sectionId).toBe("overview");
    expect(items[0]!.crewKey).toBeNull();
  });

  it("unknown code falls back to overview and the generic fallback title", () => {
    const items = deriveAttentionItems({
      alerts: [alert({ id: "u1", code: "FUTURE_UNREGISTERED_CODE" })],
      feed: null,
      slug: SLUG,
    });
    expect(items[0]!.sectionId).toBe("overview");
    expect(items[0]!.menuTitle).toBe(ATTENTION_FALLBACK_TITLE);
  });

  it("action link precomputed with slug (RESYNC_SHRINK_HELD → #overview link)", () => {
    const items = deriveAttentionItems({
      alerts: [alert({ id: "r1", code: "RESYNC_SHRINK_HELD" })],
      feed: null,
      slug: SLUG,
    });
    expect(items[0]!.alert?.action).toEqual({
      label: "Review & re-sync",
      href: `/admin?show=${SLUG}#overview`,
      external: false,
    });
  });

  it("failedKeys / dataGaps populated only for their codes", () => {
    // SHOW_FIRST_PUBLISHED is the sole carrier of the data-gaps digest, and
    // warning-surface-trim §5 excludes it from the MODAL (the bell still renders
    // it, digest and all). The mapping in `toAlertItem` is therefore live code
    // that this surface no longer reaches, so it is exercised through the
    // documented test seam rather than deleted or faked: passing an empty
    // exclusion set turns the filter off without changing what is mapped.
    const items = deriveAttentionItems({
      alerts: [
        alert({
          id: "t1",
          code: "TILE_PROJECTION_FETCH_FAILED",
          context: { failedKeys: ["hotel", "rooms", 3] },
        }),
        alert({
          id: "s1",
          code: "SHOW_FIRST_PUBLISHED",
          context: { data_gaps: { total: 2, classes: { unknown_section: 2 } } },
        }),
        alert({ id: "p1", code: "AMBIGUOUS_EMAIL_BINDING" }),
      ],
      feed: null,
      slug: SLUG,
      excludedCodes: [],
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("alert:t1")!.alert?.failedKeys).toEqual(["hotel", "rooms"]);
    expect(byId.get("alert:s1")!.alert?.dataGaps?.total).toBe(2);
    expect(byId.get("alert:p1")!.alert?.failedKeys).toBeNull();
    expect(byId.get("alert:p1")!.alert?.dataGaps).toBeNull();
  });
});

describe("ATTENTION_ROUTES shape", () => {
  it("routes only to the sections the surface can host", () => {
    // attention-alert-routing §3.2 widened the union past crew|overview: the two
    // parse codes route to warnings, and PR3 adds rooms/event anchors. The full
    // per-code disposition is pinned by attentionRoutingFrozen.test.ts.
    const HOSTS = ["crew", "overview", "warnings", "rooms", "event"];
    for (const [code, route] of Object.entries(ATTENTION_ROUTES)) {
      expect(HOSTS, `route for ${code}`).toContain(route.sectionId);
    }
  });
});
