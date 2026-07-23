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
  T2_MONITORING_ONLY,
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

  test("T2_MONITORING_ONLY derives a pure monitoring state (monitoring-badge-expand §5.8)", () => {
    const s = byId(T2_MONITORING_ONLY);
    const derived = deriveScenarioAttention(s);
    expect(derived.length).toBeGreaterThan(0);
    // PURE monitoring: EVERY derived item is a non-actionable self_heal — no
    // actionable, no needs_look, and no other clearingKind slipping in (R3 f7)
    expect(
      derived.every((i) => !i.actionable && i.clearingKind === "self_heal"),
      JSON.stringify(derived.map((i) => ({ a: i.actionable, k: i.clearingKind }))),
    ).toBe(true);
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
    expect(byId(T2_MANY).alerts).toHaveLength(MENU_CAP - 1);
    expect(byId(T2_MANY).holds).toHaveLength(1);
    expect(itemsFor(byId(T2_MANY))).toHaveLength(MENU_CAP);
  });

  test("t2-many is 12 real items: 11 distinct alerts + 1 hold, sections and classes mixed", () => {
    const s = byId(T2_MANY);
    expect(new Set(s.alerts.map((a) => a.code)).size).toBe(MENU_CAP - 1);
    expect(s.alerts.some((a) => a.code.startsWith("GALLERY_FILLER_"))).toBe(false);
    const items = deriveScenarioAttention(s);
    expect(items).toHaveLength(MENU_CAP);
    const sections = new Set(items.map((i) => i.sectionId));
    for (const sec of ["rooms", "event", "crew", "changes"] as const) {
      expect(sections.has(sec), sec).toBe(true);
    }
    expect(items.some((i) => i.actionable)).toBe(true);
    expect(items.some((i) => i.clearingKind === "needs_look")).toBe(true);
    expect(items.some((i) => i.clearingKind === "self_heal")).toBe(true);
    expect(s.alerts.filter((a) => a.occurrence_count === 7)).toHaveLength(1);
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

// ── Modal-state-coverage roster (plan Task 6; spec §3.6) ─────────────────────
import { validateScenario as mscValidate } from "@/lib/dev/attentionScenarios/validate";
import { buildScenarioModalData as mscBuild } from "@/lib/dev/buildScenarioModalData";
import { buildScenarioFeed as mscFeed } from "@/lib/dev/deriveScenarioAttention";
import { deriveScenarioAttention as mscDerive } from "@/lib/dev/deriveScenarioAttention";

const MSC_IDS = [
  "t2-changelog-history",
  "t2-hold-dispositions",
  "t2-feed-infra-error",
  "t2-archived",
  "t2-unpublished",
  "t2-finalizing",
  "t2-publishing",
  "t2-live-now",
  "t2-share-link",
  "t2-share-single",
  "t2-share-batches",
  "t2-sync-drive-error",
  "t2-sync-sheet-unavailable",
  "t2-sync-parse-error",
  "t2-sync-shrink-held",
  "t2-sync-pending-review",
  "t2-sync-pending",
  "t2-sync-not-yet",
  "t2-sync-unknown",
  "t2-never-synced",
  "t2-sync-no-check",
  "t2-minimal-header",
  "t2-nothing-parsed",
  "t2-overflow-volumes",
  "t2-roster-over-cap",
  "t2-solo-hotel",
  "t2-hotel-guest-stack",
  "t2-packlist-overflow",
  "t2-agenda-overflow",
  "t2-multi-agenda",
  "t2-warning-spread",
  "t2-alert-deep-link",
  "t2-diagram-images",
  "t2-attention-extras",
  "t2-ignored-warnings",
  "t2-all-ignored",
] as const;

function mscById(id: string) {
  const s = tier2Scenarios().find((x) => x.id === id);
  if (s === undefined) throw new Error(`missing roster scenario ${id}`);
  return s;
}

describe("modal-state roster (spec §3.6)", () => {
  test("all 36 scenarios exist and validate clean", () => {
    for (const id of MSC_IDS) {
      expect(mscValidate(mscById(id)), id).toEqual([]);
    }
  });

  test("t2-changelog-history: 12 feed entries with the exact matrix multiset", () => {
    const s = mscById("t2-changelog-history");
    const feed = mscFeed(s);
    expect(feed).not.toBeNull();
    const entries = feed!.entries;
    expect(entries).toHaveLength(12);
    const byStatus = (st: string) => entries.filter((e) => e.status === st).length;
    expect(byStatus("applied")).toBe(6);
    expect(byStatus("rejected")).toBe(1);
    expect(byStatus("undone")).toBe(2);
    expect(byStatus("superseded")).toBe(2);
    expect(byStatus("pending")).toBe(1);
    expect(entries.filter((e) => e.acceptable).length).toBe(3);
    expect(entries.filter((e) => e.action === "undo").length).toBe(2);
    expect(entries.filter((e) => e.acknowledgedAt !== null).length).toBe(3);
    expect(entries.some((e) => e.acceptable && e.action === "undo")).toBe(true);
    // The hold is the only attention item (log rows never become items).
    expect(mscDerive(s)).toHaveLength(1);
  });

  test("t2-changelog-history: PER-ROW composition, localized to each matrix row (review B R2)", () => {
    // Aggregate multisets cannot catch an acknowledgement migrating between
    // rows or Accept/Undo splitting across rows while totals hold. Pin each
    // §3.6 matrix row by its stable feed-entry id (`<scenario>-log-<index>`).
    const feed = mscFeed(mscById("t2-changelog-history"));
    const byId = new Map(feed!.entries.map((e) => [e.id, e]));
    const rows: Array<[number, string, boolean, string, boolean]> = [
      // [index, status, acceptable, action, acknowledged]
      [0, "applied", false, "undo", false], // (1) undo-only mi11_approve rename
      [1, "applied", true, "none", false], // (2) accept
      [2, "applied", true, "none", false], // (3) accept
      [3, "applied", true, "undo", false], // (4) accept AND undo co-rendered
      [4, "applied", false, "none", true], // (5) acknowledged -> Accepted tag
      [5, "rejected", false, "none", false], // (6) rejected badge
      [6, "undone", false, "none", false], // (7) undone, never acknowledged
      [7, "undone", false, "none", true], // (8) undone + Accepted together
      [8, "superseded", false, "none", false], // (9) superseded
      [9, "applied", false, "none", false], // (10) PLAIN applied: no action, no tag
      [10, "superseded", false, "none", true], // (11) superseded + Accepted together
    ];
    for (const [i, status, acceptable, action, acked] of rows) {
      const e = byId.get(`t2-changelog-history-log-${i}`);
      expect(e, `log-${i} present`).toBeDefined();
      expect(e?.status, `log-${i} status`).toBe(status);
      expect(e?.acceptable, `log-${i} acceptable`).toBe(acceptable);
      expect(e?.action, `log-${i} action`).toBe(action);
      expect(e?.acknowledgedAt !== null, `log-${i} acknowledged`).toBe(acked);
    }
    expect(byId.has("t2-changelog-history-hold-0")).toBe(true);
  });

  test("t2-hold-dispositions: all four hold renderings, folded rename distinct from plain", () => {
    const feed = mscFeed(mscById("t2-hold-dispositions"));
    expect(feed).not.toBeNull();
    expect(feed!.entries).toHaveLength(4);
    const summaries = feed!.entries.map((e) => e.summary);
    expect(new Set(summaries).size).toBe(4);
    const dispositions = feed!.entries
      .map((e) => (e.gate?.disposition as { disposition?: string } | undefined)?.disposition)
      .sort();
    expect(dispositions).toEqual(["email_change", "removal", "rename", "rename"]);
  });

  test("t2-roster-over-cap: 501 crew rows with blanked previewRoster and crewEmails", () => {
    const data = mscBuild(mscById("t2-roster-over-cap"));
    expect(data.data.crewMembers).toHaveLength(501);
    expect(data.data.previewRoster).toEqual([]);
    expect(data.crewEmails).toEqual([]);
  });

  test("t2-attention-extras: 2 crew-scoped warnings index under the member and 1 crew alert names them", () => {
    const s = mscById("t2-attention-extras");
    const data = mscBuild(s);
    const crewModel = data.bySection.crew;
    expect(crewModel).toBeDefined();
    const keys = Object.keys(crewModel!.warningsByCrewKey);
    expect(keys).toHaveLength(1);
    expect(crewModel!.warningsByCrewKey[keys[0]!]).toHaveLength(2);
    const crewItems = data.attentionItems.filter(
      (i) => i.kind === "alert" && i.sectionId === "crew",
    );
    expect(crewItems).toHaveLength(1);
  });

  test("t2-multi-agenda: six visible grammar-labeled links, all badged", () => {
    const data = mscBuild(mscById("t2-multi-agenda"));
    expect(data.data.agendaBaseline).toHaveLength(6);
    expect(data.data.agendaBaseline.every((i) => i.badge !== null)).toBe(true);
  });

  test("t2-alert-deep-link: alertId targets the surviving derived alert", () => {
    const s = mscById("t2-alert-deep-link");
    const data = mscBuild(s);
    const item = data.attentionItems.find((i) => i.kind === "alert");
    expect(item).toBeDefined();
    expect(data.alertId).not.toBeNull();
    expect(`alert:${data.alertId}`).toBe(item!.id);
  });

  test("t2-ignored-warnings: two active (bulk pair) + two ignored in one section", () => {
    const data = mscBuild(mscById("t2-ignored-warnings"));
    const models = Object.values(data.bySection);
    expect(models.reduce((n, m) => n + m.active.length, 0)).toBe(2);
    expect(models.reduce((n, m) => n + m.ignored.length, 0)).toBe(2);
    const withBulk = models.find((m) => m.bulkGroups.length > 0);
    expect(withBulk).toBeDefined();
  });

  test("t2-all-ignored: zero active, two ignored", () => {
    const data = mscBuild(mscById("t2-all-ignored"));
    const models = Object.values(data.bySection);
    expect(models.reduce((n, m) => n + m.active.length, 0)).toBe(0);
    expect(models.reduce((n, m) => n + m.ignored.length, 0)).toBe(2);
  });

  test("t2-feed-infra-error renders the null feed; t2-nothing-parsed empties every section", () => {
    expect(mscBuild(mscById("t2-feed-infra-error")).feed).toBeNull();
    const data = mscBuild(mscById("t2-nothing-parsed")).data;
    expect(data.crewMembers).toHaveLength(0);
    expect(data.rooms).toHaveLength(0);
    expect(data.hotels).toHaveLength(0);
    expect(data.venue).toBeNull();
  });
});
