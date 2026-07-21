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
