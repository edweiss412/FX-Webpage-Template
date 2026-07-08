import { describe, expect, test } from "vitest";
import { buildMonitorDigestModel, groupAutoApplied } from "@/lib/notify/monitorDigest";

function recordingSql(rowsByCall: unknown[][]) {
  const calls: { text: string; params: unknown[] }[] = [];
  let i = 0;
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ text: strings.join("?"), params });
    return rowsByCall[i++] ?? [];
  }) as never;
  return { fn, calls };
}

describe("groupAutoApplied (pure helper)", () => {
  test("groups by show_id, preserves row order within a show", () => {
    const groups = groupAutoApplied([
      { show_id: "s1", slug: "east", title: "East", summary: "Added Jane", occurred_at: "t2" },
      { show_id: "s1", slug: "east", title: "East", summary: "Renamed Bob", occurred_at: "t1" },
      { show_id: "s2", slug: "west", title: "West", summary: "Removed Al", occurred_at: "t3" },
    ]);
    expect(groups).toEqual([
      { showTitle: "East", slug: "east", items: ["Added Jane", "Renamed Bob"] },
      { showTitle: "West", slug: "west", items: ["Removed Al"] },
    ]);
  });
});

describe("buildMonitorDigestModel — auto-applied query shape (spec §3)", () => {
  const now = new Date("2026-07-08T12:00:00Z");
  const wm = async () => ({ kind: "value" as const, watermark: new Date("2026-07-08T00:00:00Z") });

  // NOTE: this is a query-SHAPE test — the fake sql bypasses filtering, so it proves
  // the query text carries every predicate + the windowStart bind, and that returned
  // rows group correctly. Row-level exclusion is proven only by the .db.test.ts.
  test("query carries the Flow-4 security predicates + windowStart; rows group by show", async () => {
    const rows = [
      { show_id: "s1", slug: "east", title: "East Coast", summary: "Added Jane Doe", occurred_at: "2026-07-08T10:00:00Z" },
      { show_id: "s1", slug: "east", title: "East Coast", summary: "Renamed Bob", occurred_at: "2026-07-08T09:00:00Z" },
    ];
    const { fn, calls } = recordingSql([rows, [], []]);
    const r = await buildMonitorDigestModel(now, { sql: fn, getWatermark: wm });
    const q = calls[0].text.toLowerCase();
    expect(q).toContain("show_change_log");
    expect(q).toContain("source");
    expect(q).toContain("auto_apply");
    expect(q).toContain("acknowledged_at is null");
    expect(q).toContain("status");
    expect(q).toContain("change_kind");
    expect(q).toContain("occurred_at >");
    expect(calls[0].params).toContain(new Date("2026-07-08T00:00:00Z").toISOString());
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.model.autoApplied).toEqual([
      { showTitle: "East Coast", slug: "east", items: ["Added Jane Doe", "Renamed Bob"] },
    ]);
  });
});
