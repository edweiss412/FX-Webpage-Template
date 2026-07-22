import { describe, expect, test } from "vitest";
import { bucketAttention } from "@/lib/admin/sectionAttention";
import { deriveAttentionItems, ATTENTION_FALLBACK_TITLE } from "@/lib/admin/attentionItems";
import { isInboxRouted } from "@/lib/messages/adminSurface";
import { isAutoResolving } from "@/lib/adminAlerts/audience";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import { tier1AlertScenarios } from "@/lib/dev/attentionScenarios/tier1";
import {
  MENU_CAP,
  tier2Scenarios,
  T2_REQUIRED_IDS,
  T2_SECTION_ABSENT,
  T2_OVERVIEW_ABSENT,
  T2_ANCHOR_ABSENT,
  T2_CREW_ROW_ABSENT,
  T2_HOLD_ONLY,
  T2_INBOX_ROUTED,
  T2_AUTO_RESOLVING,
  T2_ACTIONABLE,
  T2_OCCURRENCE_MANY,
  T2_IDENTITY_ABSENT,
  T2_UNCATALOGED,
  T2_EMPTY,
  T2_SINGLE,
  T2_MANY,
  T2_DEGRADED,
  T2_CLASS_MIX,
  T2_DEGRADED_WITH_HOLDS,
  T2_MULTI_HOLD,
  T2_FEED_TRUNCATED,
} from "@/lib/dev/attentionScenarios/tier2";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";

function byId(id: string): AttentionScenario {
  const s = tier2Scenarios().find((x) => x.id === id);
  if (!s) throw new Error(`missing tier-2 scenario ${id}`);
  return s;
}

function toInput(r: AttentionScenario["alerts"][number], i: number) {
  return {
    id: `t2-${i}-${r.code}`,
    code: r.code,
    context: r.context,
    raised_at: r.raised_at,
    occurrence_count: r.occurrence_count,
    identityText: null,
    messageParams: {},
    crewName: r.code === "ROLE_FLAGS_NOTICE" ? "Dana Reed" : null,
  };
}

function holdEntriesFor(s: AttentionScenario) {
  return s.holds.map((h, i) => ({
    id: `hold-${i}`,
    occurredAt: h.base_modified_time,
    status: "pending" as const,
    summary: `Hold on ${h.entity_key}`,
    action: "approve_reject" as const,
    entityRef: h.entity_key,
    acceptable: false,
    acknowledgedAt: null,
    gate: {
      holdId: `hold-${i}`,
      disposition: h.proposed_value,
      baseModifiedTime: h.base_modified_time,
    },
  }));
}

function itemsFor(s: AttentionScenario) {
  return deriveAttentionItems({
    alerts: s.alerts.map(toInput),
    feed: s.holds.length === 0 ? null : { entries: holdEntriesFor(s) },
    slug: "demo",
  });
}

/**
 * Per-PLACEMENT-KIND counts. Deliberately NOT summed: collapsing sectionTop with
 * byAnchor and byCrewKey would let a card that never left the anchor or crew-row
 * bucket pass a "falls back to the section top" assertion.
 */
function placements(s: AttentionScenario) {
  const map = bucketAttention(itemsFor(s), {
    renderCard: () => "card",
    sectionAvailable: s.bucket?.sectionAvailable ?? (() => true),
    anchorAvailable: s.bucket?.anchorAvailable ?? (() => true),
    ...(s.bucket?.crewKeyRendered ? { crewKeyRendered: s.bucket.crewKeyRendered } : {}),
  });
  const out = new Map<string, { sectionTop: number; anchor: number; crewRow: number }>();
  for (const [sectionId, b] of map) {
    out.set(sectionId, {
      sectionTop: b.sectionTop.length,
      anchor: [...(b.byAnchor?.values() ?? [])].reduce((a, v) => a + v.length, 0),
      crewRow: [...(b.byCrewKey?.values() ?? [])].reduce((a, v) => a + v.length, 0),
    });
  }
  return out;
}

function totalPlaced(s: AttentionScenario): number {
  let n = 0;
  for (const v of placements(s).values()) n += v.sectionTop + v.anchor + v.crewRow;
  return n;
}

describe("tier 2 structural matrix", () => {
  test("every required axis exists exactly once, and each is a valid tier-2 scenario", () => {
    const all = tier2Scenarios();
    // Set-equality against the declared list: a MISSING or DUPLICATED axis fails,
    // which a length check alone could not distinguish.
    expect([...all.map((s) => s.id)].sort()).toEqual([...T2_REQUIRED_IDS].sort());
    for (const s of all) {
      expect(validateScenario(s), `${s.id}: ${validateScenario(s).join("; ")}`).toEqual([]);
      expect(s.tier, s.id).toBe(2);
    }
  });

  test("an unavailable routed section falls back to Overview's section top", () => {
    const p = placements(byId(T2_SECTION_ABSENT));
    expect(p.get("overview")?.sectionTop ?? 0).toBeGreaterThan(0);
    expect(p.get("crew")?.sectionTop ?? 0).toBe(0);
  });

  test("a card is NEVER dropped, even when every section reports unavailable", () => {
    // bucketAttention resolves an unavailable section to "overview"
    // UNCONDITIONALLY - it never consults sectionAvailable("overview") for the
    // fallback target (lib/admin/sectionAttention.ts:114-116). That is the
    // structural no-drop guarantee, and this axis pins it.
    const s = byId(T2_OVERVIEW_ABSENT);
    expect(totalPlaced(s)).toBe(1);
    expect(placements(s).get("overview")?.sectionTop ?? 0).toBe(1);
  });

  test("an anchored card that misses its anchor redirects to OVERVIEW, not a rooms section top", () => {
    // rooms and event have NO section-top consumer - they host cards only at
    // their content anchor - so a card that resolved there without landing at
    // the anchor is redirected to Overview rather than pushed to a section top
    // that renders nothing (lib/admin/sectionAttention.ts:127-134).
    const p = placements(byId(T2_ANCHOR_ABSENT));
    expect(p.get("rooms")?.anchor ?? 0).toBe(0);
    expect(p.get("rooms")?.sectionTop ?? 0).toBe(0);
    expect(p.get("overview")?.sectionTop ?? 0).toBe(1);
  });

  test("an unrendered crew key falls to the CREW SECTION TOP, not the crew-row bucket", () => {
    const crew = placements(byId(T2_CREW_ROW_ABSENT)).get("crew");
    expect(crew?.sectionTop ?? 0).toBeGreaterThan(0);
    expect(crew?.crewRow ?? 0).toBe(0);
  });

  test("the hold-only axis derives a hold item and buckets NO card", () => {
    const s = byId(T2_HOLD_ONLY);
    expect(s.alerts).toHaveLength(0);
    expect(itemsFor(s).filter((i) => i.kind === "hold").length).toBeGreaterThan(0);
    // bucketAttention excludes holds by design; they render in the Changes feed.
    expect(totalPlaced(s)).toBe(0);
  });

  test("the three actionability axes are classified by the REAL predicates", () => {
    const inbox = byId(T2_INBOX_ROUTED).alerts[0]!.code;
    expect(isInboxRouted(inbox)).toBe(true);

    const auto = byId(T2_AUTO_RESOLVING).alerts[0]!.code;
    expect(isAutoResolving(auto)).toBe(true);
    expect(isInboxRouted(auto)).toBe(false);

    const actionable = byId(T2_ACTIONABLE).alerts[0]!.code;
    expect(isInboxRouted(actionable)).toBe(false);
    expect(isAutoResolving(actionable)).toBe(false);
  });

  test("actionability reaches the DERIVED item, not just the fixture", () => {
    const inboxItem = itemsFor(byId(T2_INBOX_ROUTED))[0]!;
    expect(inboxItem.actionable).toBe(false);
    if (inboxItem.kind === "alert") expect(inboxItem.alert.autoClearNote).not.toBeNull();

    const autoItem = itemsFor(byId(T2_AUTO_RESOLVING))[0]!;
    expect(autoItem.actionable).toBe(false);

    const actionableItem = itemsFor(byId(T2_ACTIONABLE))[0]!;
    expect(actionableItem.actionable).toBe(true);
    if (actionableItem.kind === "alert") expect(actionableItem.alert.autoClearNote).toBeNull();
  });

  test("the occurrence axis survives derivation", () => {
    expect(byId(T2_OCCURRENCE_MANY).alerts[0]!.occurrence_count).toBe(7);
    const item = itemsFor(byId(T2_OCCURRENCE_MANY))[0]!;
    if (item.kind === "alert") expect(item.alert.occurrenceCount).toBe(7);
  });

  test("the identity-absent axis declares no gallery identity", () => {
    expect(byId(T2_IDENTITY_ABSENT).alerts[0]!.galleryIdentity ?? null).toBeNull();
  });

  test("an uncataloged code falls back in title AND routes to Overview", () => {
    const s = byId(T2_UNCATALOGED);
    expect(itemsFor(s)[0]!.menuTitle).toBe(ATTENTION_FALLBACK_TITLE);
    expect(placements(s).get("overview")?.sectionTop ?? 0).toBeGreaterThan(0);
  });

  test("the count axes are empty, one, and exactly MENU_CAP", () => {
    expect(byId(T2_EMPTY).alerts).toHaveLength(0);
    expect(byId(T2_EMPTY).holds).toHaveLength(0);
    expect(byId(T2_SINGLE).alerts).toHaveLength(1);
    expect(byId(T2_MANY).alerts).toHaveLength(MENU_CAP);
    expect(itemsFor(byId(T2_MANY))).toHaveLength(MENU_CAP);
  });

  test("degraded is set on exactly two tier-2 scenarios and on no tier-1 scenario", () => {
    expect(
      tier2Scenarios()
        .filter((s) => s.degraded === true)
        .map((s) => s.id)
        .sort(),
    ).toEqual([T2_DEGRADED, T2_DEGRADED_WITH_HOLDS].sort());
    for (const s of tier1AlertScenarios()) expect(s.degraded ?? false, s.id).toBe(false);
  });

  test("bucket appears only on the four fallback axes and on no tier-1 scenario", () => {
    expect(
      tier2Scenarios()
        .filter((s) => s.bucket !== undefined)
        .map((s) => s.id)
        .sort(),
    ).toEqual([T2_SECTION_ABSENT, T2_OVERVIEW_ABSENT, T2_ANCHOR_ABSENT, T2_CREW_ROW_ABSENT].sort());
    for (const s of tier1AlertScenarios()) expect(s.bucket, s.id).toBeUndefined();
  });

  test("t2-class-mix derives all three pill classes", () => {
    const items = deriveScenarioAttention(byId(T2_CLASS_MIX));
    expect(items.some((i) => i.actionable)).toBe(true);
    expect(items.some((i) => !i.actionable && i.clearingKind === "needs_look")).toBe(true);
    expect(items.some((i) => !i.actionable && i.clearingKind === "self_heal")).toBe(true);
  });

  test("t2-degraded-with-holds pairs the degraded flag with a flowing hold item", () => {
    const s = byId(T2_DEGRADED_WITH_HOLDS);
    expect(s.degraded).toBe(true);
    expect(s.alerts).toEqual([]);
    const items = deriveScenarioAttention(s);
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("hold");
  });

  test("t2-multi-hold derives three distinct hold items", () => {
    const items = deriveScenarioAttention(byId(T2_MULTI_HOLD));
    expect(items.filter((i) => i.kind === "hold")).toHaveLength(3);
  });

  test("t2-feed-truncated flags the feed and carries a hold", () => {
    const s = byId(T2_FEED_TRUNCATED);
    expect(s.feedTruncated).toBe(true);
    expect(s.holds.length).toBeGreaterThan(0);
  });

  test("feedTruncated appears on exactly one tier-2 scenario", () => {
    expect(
      tier2Scenarios()
        .filter((s) => s.feedTruncated === true)
        .map((s) => s.id),
    ).toEqual([T2_FEED_TRUNCATED]);
  });
});
