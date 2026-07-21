// @vitest-environment node
// attention-alert-routing §3.2/§3.3: the six asset/reel codes carry a content
// anchor, and bucketAttention resolves them section-first, then anchor — with the
// no-drop guarantee that an item whose anchor content is absent falls back to
// Overview (the modal derives BOTH sectionAvailable and anchorAvailable from the
// SAME anchorsForData map, so an anchorless section never becomes a dead sectionTop).
import { describe, expect, it } from "vitest";
import { ATTENTION_ROUTES, type AttentionItem } from "@/lib/admin/attentionItems";
import { bucketAttention, resolveEffectiveSection } from "@/lib/admin/sectionAttention";
import { anchorsForData } from "@/lib/admin/attentionAnchorAvailability";
import type { SectionData } from "@/components/admin/review/sectionData";

const DIAGRAM_ROUTES = [
  "ASSET_RECOVERY_BYTES_EXCEEDED",
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  "EMBEDDED_ASSET_DRIFTED",
] as const;
const REEL_ROUTES = [
  "OPENING_REEL_PERMISSION_DENIED",
  "OPENING_REEL_NOT_VIDEO",
  "REEL_DRIFTED",
] as const;

describe("asset/reel routes carry content anchors (§3.3)", () => {
  it.each(DIAGRAM_ROUTES)("%s → rooms @ diagrams", (code) => {
    expect(ATTENTION_ROUTES[code]).toEqual({ sectionId: "rooms", anchor: "diagrams" });
  });
  it.each(REEL_ROUTES)("%s → event @ opening_reel", (code) => {
    expect(ATTENTION_ROUTES[code]).toEqual({ sectionId: "event", anchor: "opening_reel" });
  });
});

// ── bucketing through the modal's anchorsForData-derived availability ──────────
const item = (code: string, sectionId: AttentionItem["sectionId"]): AttentionItem =>
  ({
    id: `alert:${code}`,
    kind: "alert",
    tone: "notice",
    sectionId,
    crewKey: null,
    actionable: false,
    menuTitle: "x",
    menuSubtitle: null,
    alert: {
      alertId: code,
      code,
      template: null,
      params: {},
      action: null,
      helpHref: null,
      raisedAt: "2026-07-20T00:00:00Z",
      occurrenceCount: 1,
      autoClearNote: null,
      failedKeys: null,
      dataGaps: null,
      errorCode: null,
    },
  }) as AttentionItem;

const published = (over: {
  diagrams?: unknown;
  eventDetails?: Record<string, unknown> | null;
}): SectionData =>
  ({
    mode: "published",
    diagrams: over.diagrams ?? null,
    eventDetails: over.eventDetails ?? null,
  }) as unknown as SectionData;

const DIAGRAM_SIGNAL = {
  snapshot_revision_id: "rev-1",
  linkedFolder: { id: "folder-1" },
  embeddedImages: [],
  linkedFolderItems: [],
};

// The exact wiring PublishedReviewModal applies (§3.2): both predicates read the
// SAME anchorsForData map so a section with no available anchor is not "available".
function optsFor(data: SectionData) {
  const anchors = anchorsForData(data);
  const CARD = new Set(["crew", "overview"]);
  return {
    renderCard: (i: AttentionItem) => `CARD:${i.alert!.code}`,
    sectionAvailable: (id: string) =>
      id === "warnings" || CARD.has(id) || (anchors.get(id as "rooms" | "event")?.size ?? 0) > 0,
    anchorAvailable: (id: string, anchor: string) =>
      anchors.get(id as "rooms" | "event")?.has(anchor as never) ?? false,
  };
}

describe("bucketAttention resolves anchors with no-drop fallback", () => {
  it("anchor available → byAnchor at the content", () => {
    const data = published({ diagrams: DIAGRAM_SIGNAL, eventDetails: { opening_reel: "reel" } });
    const m = bucketAttention(
      [item("EMBEDDED_ASSET_DRIFTED", "rooms"), item("REEL_DRIFTED", "event")],
      optsFor(data),
    );
    expect(m.get("rooms")!.byAnchor!.get("diagrams")).toEqual(["CARD:EMBEDDED_ASSET_DRIFTED"]);
    expect(m.get("event")!.byAnchor!.get("opening_reel")).toEqual(["CARD:REEL_DRIFTED"]);
    // Nothing leaked to Overview.
    expect(m.get("overview")?.sectionTop ?? []).toEqual([]);
  });

  it("anchor content absent → Overview card (no drop, no dead rooms/event sectionTop)", () => {
    const data = published({ diagrams: null, eventDetails: null });
    const m = bucketAttention(
      [item("EMBEDDED_ASSET_DRIFTED", "rooms"), item("REEL_DRIFTED", "event")],
      optsFor(data),
    );
    expect(m.get("overview")!.sectionTop.sort()).toEqual([
      "CARD:EMBEDDED_ASSET_DRIFTED",
      "CARD:REEL_DRIFTED",
    ]);
    expect(m.get("rooms")).toBeUndefined();
    expect(m.get("event")).toBeUndefined();
  });

  it("STRUCTURAL no-drop: a rooms/event card not placed at its anchor is redirected to Overview, never a dead section-top (Codex R2)", () => {
    // Inconsistent predicates (section available but anchor not) — the exact case
    // the modal's single-map wiring prevents, tested here to pin bucketAttention's
    // own guarantee: the card lands in Overview, and rooms/event get NO section-top.
    const m = bucketAttention(
      [item("EMBEDDED_ASSET_DRIFTED", "rooms"), item("REEL_DRIFTED", "event")],
      {
        renderCard: (i: AttentionItem) => `CARD:${i.alert!.code}`,
        sectionAvailable: () => true, // rooms/event "available"...
        anchorAvailable: () => false, // ...but the anchor is not.
      },
    );
    expect(m.get("overview")!.sectionTop.sort()).toEqual([
      "CARD:EMBEDDED_ASSET_DRIFTED",
      "CARD:REEL_DRIFTED",
    ]);
    expect(m.get("rooms")?.sectionTop ?? []).toEqual([]);
    expect(m.get("event")?.sectionTop ?? []).toEqual([]);
  });
});

// ── resolveEffectiveSection: nav dot + deep-link/menu jump agree with placement ─
// (Codex PR3 review P1) A fallen-back asset/reel item's banner renders in Overview,
// so its effective section (used for the amber dot + the jump's setActive/#hash)
// must be Overview, not its declared route — else the rail highlights an empty
// section. Only rooms/event are fallback-eligible; every other section is a consumer.
describe("resolveEffectiveSection", () => {
  const avail = (present: string[]) => (id: string) =>
    id === "rooms" || id === "event" ? present.includes(id) : true;

  it("asset item, diagram signal present → rooms (renders in the sub-block)", () =>
    expect(resolveEffectiveSection(item("EMBEDDED_ASSET_DRIFTED", "rooms"), avail(["rooms"]))).toBe(
      "rooms",
    ));
  it("asset item, diagram ABSENT → overview (matches the fallback card)", () =>
    expect(resolveEffectiveSection(item("EMBEDDED_ASSET_DRIFTED", "rooms"), avail([]))).toBe(
      "overview",
    ));
  it("reel item, reel present → event; reel ABSENT → overview", () => {
    expect(resolveEffectiveSection(item("REEL_DRIFTED", "event"), avail(["event"]))).toBe("event");
    expect(resolveEffectiveSection(item("REEL_DRIFTED", "event"), avail([]))).toBe("overview");
  });
  it("non-fallback sections are NEVER remapped, even with no anchors", () => {
    // crew/overview/warnings/changes always have a consumer — a hold on `changes`
    // (the regression that inflated the Overview badge) stays on changes.
    expect(resolveEffectiveSection(item("ROLE_FLAGS_NOTICE", "crew"), avail([]))).toBe("crew");
    expect(resolveEffectiveSection(item("DRIVE_FETCH_FAILED", "overview"), avail([]))).toBe(
      "overview",
    );
    expect(resolveEffectiveSection(item("PARSE_ERROR_LAST_GOOD", "warnings"), avail([]))).toBe(
      "warnings",
    );
    expect(resolveEffectiveSection(item("SOME_HOLD", "changes"), avail([]))).toBe("changes");
  });
});
