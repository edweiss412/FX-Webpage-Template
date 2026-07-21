import { describe, expect, test } from "vitest";
import { shapeHoldEntry, type HoldRow } from "@/lib/sync/feed/shapeHoldEntry";
import { sortKeyFromRaw, toIso } from "@/lib/sync/feed/sortKey";

/**
 * The hold-to-FeedEntry shaping step, extracted from readShowChangeFeed so the
 * dev scenario gallery and the production feed produce identical entries
 * (spec §3.3). `summary` is generated here from the disposition, never authored,
 * which is why the gallery cannot be allowed to invent its own.
 */
function hold(over: Partial<HoldRow> = {}): HoldRow {
  return {
    id: "hold-1",
    entity_key: "Dana Reed",
    held_value: { email: "old@example.test", name: "Dana Reed" },
    proposed_value: { disposition: "email_change", name: "Dana Reed", email: "new@example.test" },
    base_modified_time: "2026-07-01T00:00:00.123456Z",
    created_at: "2026-07-01T00:00:00.123456Z",
    ...over,
  };
}

describe("shapeHoldEntry", () => {
  test("an open mi11 hold becomes a pending approve_reject entry carrying its gate", () => {
    const entry = shapeHoldEntry(hold());
    expect(entry.status).toBe("pending");
    expect(entry.action).toBe("approve_reject");
    expect(entry.gate?.holdId).toBe("hold-1");
    expect(entry.entityRef).toBe("Dana Reed");
    // toHoldItem (lib/admin/attentionItems.ts:284-286) returns null unless all
    // three of status/action/gate hold, so a drop here silently removes the hold
    // from the entire attention surface.
  });

  test("gate.baseModifiedTime is the RAW timestamptz, not the Date-normalized form", () => {
    const raw = "2026-07-01T00:00:00.123456Z";
    const entry = shapeHoldEntry(hold({ base_modified_time: raw }));
    expect(entry.gate?.baseModifiedTime).toBe(raw);
    // The MI-11 RPCs compare this token EXACTLY. toIso() drops postgres
    // microseconds (.123456Z -> .123Z), which would falsely trip
    // MI11_TARGET_MOVED on a hold that never retargeted (P5-F4 / PF40).
    expect(entry.gate?.baseModifiedTime).not.toBe(toIso(raw));
  });

  test("occurredAt IS Date-normalized, unlike the gate token", () => {
    const raw = "2026-07-01T00:00:00.123456Z";
    expect(shapeHoldEntry(hold({ created_at: raw })).occurredAt).toBe(toIso(raw));
  });

  test("sortKey keeps full microsecond precision so same-ms rows still order", () => {
    const a = shapeHoldEntry(hold({ created_at: "2026-07-01T00:00:00.123400Z" }));
    const b = shapeHoldEntry(hold({ created_at: "2026-07-01T00:00:00.123900Z" }));
    expect(a.sortKey).not.toBe(b.sortKey);
    expect(a.sortKey < b.sortKey).toBe(true);
    expect(a.sortKey).toBe(sortKeyFromRaw("2026-07-01T00:00:00.123400Z"));
  });

  test("a null base_modified_time is carried through as null", () => {
    expect(shapeHoldEntry(hold({ base_modified_time: null })).gate?.baseModifiedTime).toBeNull();
  });

  test("summary is generated from the disposition and is never empty", () => {
    const entry = shapeHoldEntry(hold());
    expect(entry.summary.length).toBeGreaterThan(0);
    // Invariant 5: operator-visible copy, so it must not leak the raw code.
    expect(entry.summary).not.toContain("mi11_pending");
  });

  test("hold entries never carry the disposition axis", () => {
    const entry = shapeHoldEntry(hold());
    expect(entry.acceptable).toBe(false);
    expect(entry.acknowledgedAt).toBeNull();
  });
});
