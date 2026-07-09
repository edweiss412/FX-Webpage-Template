import { describe, expect, test } from "vitest";
import { renderDigest } from "@/lib/notify/templates/digest";
import type { MonitorDigestModel } from "@/lib/notify/monitorDigest";

const origin = "https://x.test";
function monitor(over: Partial<MonitorDigestModel> = {}): MonitorDigestModel {
  return {
    windowStart: "2026-07-09T00:00:00Z",
    autoApplied: [],
    autofix: {
      total: 0,
      classes: {
        STAGE_WORD_AUTOCORRECTED: 0,
        ROLE_TOKEN_AUTOCORRECTED: 0,
        COLUMN_HEADER_AUTOCORRECTED: 0,
        SECTION_HEADER_AUTOCORRECTED: 0,
        FIELD_LABEL_AUTOCORRECTED: 0,
      },
    },
    drift: [],
    newShowGaps: [
      { showTitle: "RPAS", slug: "rpas", items: ["possibly merged hotel guests", "dates may be day-first"] },
    ],
    ...over,
  };
}

describe("renderDigest — new-show-gaps sub-block (spec §3.5)", () => {
  test("renders heading + 'Title: label, label' line", () => {
    const r = renderDigest({ origin, shows: [], monitor: monitor() });
    expect(r.html).toContain("New shows this period");
    expect(r.text).toContain("New shows this period");
    expect(r.html).toContain("possibly merged hotel guests");
    expect(r.html).toContain("dates may be day-first");
  });

  test("absent when empty", () => {
    const r = renderDigest({ origin, shows: [], monitor: monitor({ newShowGaps: [] }) });
    expect(r.html).not.toContain("New shows this period");
  });

  test("no raw code token appears (invariant 5)", () => {
    const r = renderDigest({ origin, shows: [], monitor: monitor() });
    expect(r.html).not.toMatch(/AMBIGUOUS|UNREADABLE|SUGGESTS_DMY|CARDINALITY/);
  });

  test("escapes HTML in show titles", () => {
    const r = renderDigest({
      origin,
      shows: [],
      monitor: monitor({
        newShowGaps: [{ showTitle: "<script>x</script>", slug: "s", items: ["too many hotels"] }],
      }),
    });
    expect(r.html).not.toContain("<script>x</script>");
  });

  test("caps at 12 shows / 5 items with overflow notes", () => {
    const r = renderDigest({
      origin,
      shows: [],
      monitor: monitor({
        newShowGaps: Array.from({ length: 13 }, (_, i) => ({
          showTitle: `Show ${i}`,
          slug: `s${i}`,
          items: i === 0 ? Array.from({ length: 6 }, (_, j) => `gap ${j}`) : ["one"],
        })),
      }),
    });
    // Item-overflow note (distinct from show-overflow): show 0 renders "gap 0..gap 4, +1 more".
    expect(r.html).toContain("gap 4, +1 more"); // 6 items → per-show +1 more
    expect(r.html).toContain("+1 more shows"); // 13 shows → +1 more shows
  });
});
