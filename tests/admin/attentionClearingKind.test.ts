// Unit coverage for clearingKind bucketing + driveFileId threading
// (spec 2026-07-21-attention-needs-attention-split §3.1).
import { describe, expect, it } from "vitest";
import { deriveAttentionItems, type AttentionAlertInput } from "@/lib/admin/attentionItems";

const alert = (over: Partial<AttentionAlertInput>): AttentionAlertInput => ({
  id: "a1",
  code: "SYNC_STALLED",
  context: null,
  raised_at: "2026-07-21T10:00:00Z",
  occurrence_count: 1,
  identityText: null,
  messageParams: {},
  crewName: null,
  ...over,
});

describe("clearingKind bucketing", () => {
  it("tags self_heal for SYNC_STALLED and needs_look for SHEET_UNAVAILABLE", () => {
    const items = deriveAttentionItems({
      alerts: [
        alert({ id: "s", code: "SYNC_STALLED" }),
        alert({ id: "n", code: "SHEET_UNAVAILABLE" }),
      ],
      feed: null,
      slug: "demo",
      driveFileId: "FILE123",
    });
    const byCode = new Map(
      items
        .filter((i): i is Extract<typeof i, { kind: "alert" }> => i.kind === "alert")
        .map((i) => [i.alert.code, i]),
    );
    expect(byCode.get("SYNC_STALLED")?.clearingKind).toBe("self_heal");
    expect(byCode.get("SHEET_UNAVAILABLE")?.clearingKind).toBe("needs_look");
  });

  it("threads driveFileId end-to-end: the derived item's action href carries it (integration)", () => {
    // Pins the full chain deriveAttentionItems → toAlertItem →
    // resolveAlertAction — the resolver unit tests alone stay green if any
    // link regresses (whole-diff review 2026-07-22 P2).
    const [item] = deriveAttentionItems({
      alerts: [alert({ id: "n9", code: "SHEET_UNAVAILABLE" })],
      feed: null,
      slug: "demo",
      driveFileId: "FILE123",
    });
    if (item?.kind !== "alert") throw new Error("expected an alert item");
    expect(item.alert.action).toEqual({
      label: "Open in Sheet",
      href: "https://docs.google.com/spreadsheets/d/FILE123/edit#gid=0",
      external: true,
    });
  });

  it("gallery path (driveFileId omitted, empty context): fail-visible needs_look row with NO action", () => {
    const [item] = deriveAttentionItems({
      alerts: [alert({ id: "n10", code: "SHEET_UNAVAILABLE" })],
      feed: null,
      slug: "demo",
      driveFileId: null,
    });
    if (item?.kind !== "alert") throw new Error("expected an alert item");
    expect(item.clearingKind).toBe("needs_look");
    expect(item.alert.action).toBeNull();
  });

  it("does not set clearingKind on an actionable alert", () => {
    const [it0] = deriveAttentionItems({
      alerts: [alert({ id: "a3", code: "AMBIGUOUS_EMAIL_BINDING", identityText: "Crew" })],
      feed: null,
      slug: "demo",
      driveFileId: null,
    });
    expect(it0?.actionable).toBe(true);
    expect(it0 && "clearingKind" in it0 ? it0.clearingKind : undefined).toBeUndefined();
  });

  it("orders needs_look before self_heal within the clearing tail", () => {
    const items = deriveAttentionItems({
      alerts: [
        alert({ id: "s1", code: "SYNC_STALLED" }),
        alert({ id: "n1", code: "SHEET_UNAVAILABLE" }),
      ],
      feed: null,
      slug: "demo",
      driveFileId: "F",
    });
    const codes = items
      .filter((i): i is Extract<typeof i, { kind: "alert" }> => i.kind === "alert")
      .map((i) => i.alert.code);
    expect(codes.indexOf("SHEET_UNAVAILABLE")).toBeLessThan(codes.indexOf("SYNC_STALLED"));
  });
});
