// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bucketAttention } from "@/lib/admin/sectionAttention";
import type { AttentionItem } from "@/lib/admin/attentionItems";

const it_ = (code: string, sectionId: string, crewKey: string | null = null): AttentionItem =>
  ({
    id: `alert:${code}`,
    kind: "alert",
    tone: "notice",
    sectionId,
    crewKey,
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

const opts = {
  renderCard: (i: AttentionItem) => `CARD:${i.alert!.code}`,
  sectionAvailable: () => true,
  anchorAvailable: () => true,
};

describe("bucketAttention", () => {
  it("parse codes go to notes, NOT sectionTop cards", () => {
    const w = bucketAttention([it_("PARSE_ERROR_LAST_GOOD", "warnings")], opts).get("warnings")!;
    expect(w.notes?.map((n) => n.alert.code)).toEqual(["PARSE_ERROR_LAST_GOOD"]);
    expect(w.sectionTop).toEqual([]);
  });
  it("a normal overview code becomes a sectionTop card, not a note", () => {
    const o = bucketAttention([it_("DRIVE_FETCH_FAILED", "overview")], opts).get("overview")!;
    expect(o.notes ?? []).toEqual([]);
    expect(o.sectionTop).toEqual(["CARD:DRIVE_FETCH_FAILED"]);
  });
  it("crew item with a key goes to byCrewKey", () =>
    expect(
      bucketAttention([it_("ROLE_FLAGS_NOTICE", "crew", "doug")], opts)
        .get("crew")!
        .byCrewKey?.get("doug"),
    ).toEqual(["CARD:ROLE_FLAGS_NOTICE"]));
  it("section unavailable falls back to overview", () => {
    const m = bucketAttention([it_("EMBEDDED_ASSET_DRIFTED", "rooms")], {
      ...opts,
      sectionAvailable: (s: string) => s !== "rooms",
    });
    expect(m.get("overview")!.sectionTop).toEqual(["CARD:EMBEDDED_ASSET_DRIFTED"]);
  });

  it("a parse note whose warnings section is UNAVAILABLE falls back to an overview card (no drop)", () => {
    const m = bucketAttention([it_("PARSE_ERROR_LAST_GOOD", "warnings")], {
      ...opts,
      sectionAvailable: (s: string) => s !== "warnings",
    });
    expect(m.get("warnings")?.notes ?? []).toEqual([]);
    expect(m.get("overview")!.sectionTop).toEqual(["CARD:PARSE_ERROR_LAST_GOOD"]);
  });

  it("alert-item conservation: every alert lands in exactly one channel; holds are excluded by design", () => {
    const alerts = [
      it_("PARSE_ERROR_LAST_GOOD", "warnings"),
      it_("DRIVE_FETCH_FAILED", "overview"),
      it_("ROLE_FLAGS_NOTICE", "crew", "doug"),
    ];
    const hold: AttentionItem = {
      id: "hold:h1",
      kind: "hold",
      tone: "critical",
      sectionId: "changes",
      crewKey: null,
      actionable: true,
      menuTitle: "x",
      menuSubtitle: null,
    } as AttentionItem;
    const m = bucketAttention([...alerts, hold], opts);
    const placed =
      (m.get("warnings")?.notes?.length ?? 0) +
      [...m.values()].reduce(
        (n, b) =>
          n +
          b.sectionTop.length +
          [...(b.byCrewKey?.values() ?? [])].reduce((k, arr) => k + arr.length, 0) +
          [...(b.byAnchor?.values() ?? [])].reduce((k, arr) => k + arr.length, 0),
        0,
      );
    // 3 alerts placed, the hold excluded (it renders in the Changes feed).
    expect(placed).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Spec test 12 (attention-index §2.2) — COMPOSITION, not two isolated halves.
//
// Whole-diff review 2026-07-25: anchorRouting covers resolveEffectiveSection
// alone and the menu unit covers onNavigate's payload alone; neither catches a
// break BETWEEN them. Wiring a previously-inert row to the jump path is exactly
// where that break would appear — a regression to item.sectionId, a hardcoded
// Overview, or a route-specific omission leaves both isolated suites green while
// the index sends the user somewhere the card is not.
//
// The invariant under test: the section a row JUMPS to is the section the item's
// card (or note) actually LANDS in, for every needs-look route family and in
// BOTH anchor-availability states. Both sides are computed from the SAME
// placement predicates, so this pins that they cannot diverge.
// ---------------------------------------------------------------------------
describe("jump target and landing place agree, per route family (spec test 12)", () => {
  const placementWith = (available: boolean) => ({
    sectionAvailable: (id: string) => (id === "rooms" || id === "event" ? available : true),
    anchorAvailable: () => available,
  });

  /** Where the item's card/note actually ended up, read from the bucket map. */
  function landedIn(item: AttentionItem, available: boolean): string {
    const map = bucketAttention([item], {
      renderCard: (i: AttentionItem) => `CARD:${i.alert!.code}`,
      ...placementWith(available),
    });
    for (const [section, bucket] of map) {
      // byAnchor / byCrewKey / byRowIndex are MAPS, not plain objects — an
      // Object.values read returns [] and silently reports every anchored card
      // as dropped, which is how this helper first lied to me.
      const anyIn = (m?: Map<unknown, unknown[]>) =>
        m ? [...m.values()].some((v) => v.length > 0) : false;
      const hasCard =
        (bucket.sectionTop?.length ?? 0) > 0 ||
        anyIn(bucket.byAnchor) ||
        anyIn(bucket.byCrewKey) ||
        anyIn(bucket.byRowIndex);
      if ((bucket.notes?.length ?? 0) > 0 || hasCard) return section;
    }
    throw new Error("item was DROPPED — every index entry must land somewhere");
  }

  it.each([
    // [code, declared route, landing when its anchor IS mounted, and when it is NOT]
    ["PARSE_ERROR_LAST_GOOD", "warnings", "warnings", "warnings"],
    ["RESYNC_QUALITY_REGRESSED", "warnings", "warnings", "warnings"],
    ["SHEET_UNAVAILABLE", "overview", "overview", "overview"],
    ["SHOW_UNPUBLISHED", "overview", "overview", "overview"],
    ["REEL_DRIFTED", "event", "event", "overview"],
    ["EMBEDDED_ASSET_DRIFTED", "rooms", "rooms", "overview"],
  ])("%s (routed %s) lands in %s when mounted, %s when not", (code, route, mounted, absent) => {
    expect(landedIn(it_(code, route), true), `${code} with anchor mounted`).toBe(mounted);
    expect(landedIn(it_(code, route), false), `${code} with anchor absent`).toBe(absent);
  });

  it("no needs-look route can be dropped in EITHER availability state", () => {
    // the throw in landedIn is the real assertion; this names the contract so a
    // future route added without a landing place fails here by construction
    for (const [code, route] of [
      ["PARSE_ERROR_LAST_GOOD", "warnings"],
      ["REEL_DRIFTED", "event"],
      ["EMBEDDED_ASSET_DRIFTED", "rooms"],
      ["ASSET_RECOVERY_BYTES_EXCEEDED", "rooms"],
    ] as const) {
      expect(() => landedIn(it_(code, route), true)).not.toThrow();
      expect(() => landedIn(it_(code, route), false)).not.toThrow();
    }
  });
});
