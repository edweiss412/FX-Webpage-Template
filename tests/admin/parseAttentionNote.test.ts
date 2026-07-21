// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toNoteItem, orderNotes, composeParseNote } from "@/lib/admin/parseAttentionNote";
import type { AttentionItem } from "@/lib/admin/attentionItems";

const item = (code: string, errorCode: string | null = null): AttentionItem =>
  ({
    id: `alert:${code}`,
    kind: "alert",
    tone: "notice",
    sectionId: "warnings",
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
      errorCode,
    },
  }) as AttentionItem;

describe("toNoteItem guard", () => {
  it("accepts the two note codes", () => {
    expect(toNoteItem(item("PARSE_ERROR_LAST_GOOD"))).not.toBeNull();
    expect(toNoteItem(item("RESYNC_QUALITY_REGRESSED"))).not.toBeNull();
  });
  it("rejects any other code and hold items", () => {
    expect(toNoteItem(item("SHEET_UNAVAILABLE"))).toBeNull();
    expect(
      toNoteItem({
        id: "h",
        kind: "hold",
        tone: "critical",
        sectionId: "changes",
        crewKey: null,
        actionable: true,
        menuTitle: "x",
        menuSubtitle: null,
      } as AttentionItem),
    ).toBeNull();
  });
});

describe("orderNotes", () => {
  it("PARSE first even when reversed", () => {
    const got = orderNotes([
      toNoteItem(item("RESYNC_QUALITY_REGRESSED"))!,
      toNoteItem(item("PARSE_ERROR_LAST_GOOD"))!,
    ]);
    expect(got.map((n) => n.alert.code)).toEqual([
      "PARSE_ERROR_LAST_GOOD",
      "RESYNC_QUALITY_REGRESSED",
    ]);
  });
});

describe("composeParseNote is total", () => {
  it("non-empty lead+rest for both codes", () => {
    for (const c of ["PARSE_ERROR_LAST_GOOD", "RESYNC_QUALITY_REGRESSED"]) {
      const r = composeParseNote(toNoteItem(item(c))!, 1);
      expect(r.lead.length).toBeGreaterThan(0);
      expect(r.rest.length).toBeGreaterThan(0);
    }
  });
});
