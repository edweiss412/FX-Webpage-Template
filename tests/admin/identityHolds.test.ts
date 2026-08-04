import { describe, expect, it } from "vitest";
import {
  groupHoldRows,
  HOLD_SUMMARIES_RENDER_CAP,
  HOLDS_ROW_CAP,
  type IdentityHoldRow,
} from "@/lib/admin/identityHolds";
import { shapeHoldEntry } from "@/lib/sync/feed/shapeHoldEntry";

// Rows arrive newest-first (reader orders created_at desc, id asc). Fixture
// timestamps drive every expectation; nothing hardcoded independently.
function row(over: Partial<IdentityHoldRow> & { id: string; show_id: string }): IdentityHoldRow {
  return {
    slug: `slug-${over.show_id}`,
    title: `Title ${over.show_id}`,
    entity_key: "Jane Doe",
    held_value: { email: "jane@old.com" },
    proposed_value: { disposition: "email_change", email: "jane@new.com" },
    base_modified_time: "2026-08-01T00:00:00+00:00",
    created_at: "2026-08-02T10:00:00+00:00",
    ...over,
  } as IdentityHoldRow;
}

describe("groupHoldRows", () => {
  it("groups by show preserving newest-first order; summaries via shapeHoldEntry", () => {
    const rows = [
      row({ id: "h3", show_id: "sB", created_at: "2026-08-03T12:00:00+00:00" }),
      row({
        id: "h2",
        show_id: "sA",
        created_at: "2026-08-03T11:00:00+00:00",
        entity_key: "Bob Roe",
        proposed_value: { disposition: "removal" },
      }),
      row({
        id: "h1",
        show_id: "sB",
        created_at: "2026-08-03T10:00:00+00:00",
        entity_key: "Ann Poe",
        proposed_value: { disposition: "removal" },
      }),
    ];
    const groups = groupHoldRows(rows);
    expect(groups.map((g) => g.showId)).toEqual(["sB", "sA"]); // first-seen order = newest-first
    const b = groups[0];
    if (!b) throw new Error("missing group");
    expect(b.newestCreatedAt).toBe("2026-08-03T12:00:00+00:00"); // first row of group
    expect(b.summaries).toHaveLength(2);
    // R8 pin (plan-R2 P7): summaries EQUAL the shared generator's output for the
    // same row (hand-authored copy cannot match shapeHoldEntry byte-for-byte),
    // and the email_change copy carries the old AND new addresses.
    const firstRow = rows[0];
    if (!firstRow) throw new Error("fixture");
    expect(b.summaries[0]).toBe(shapeHoldEntry(firstRow).summary);
    expect(b.summaries[0]).toContain("jane@old.com");
    expect(b.summaries[0]).toContain("jane@new.com");
    expect(b.summaries[1]).toContain("Ann Poe");
  });

  it("single-row group; empty input; caps exported here (server-safe module)", () => {
    expect(groupHoldRows([])).toEqual([]);
    const g = groupHoldRows([row({ id: "h9", show_id: "sC" })]);
    expect(g).toHaveLength(1);
    expect(g[0]?.summaries).toHaveLength(1);
    expect(HOLDS_ROW_CAP).toBe(200);
    expect(HOLD_SUMMARIES_RENDER_CAP).toBe(10);
  });
});
