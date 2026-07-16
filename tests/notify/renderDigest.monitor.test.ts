import { describe, expect, test } from "vitest";
import { renderDigest } from "@/lib/notify/templates/digest";
import type { MonitorDigestModel } from "@/lib/notify/monitorDigest";

const origin = "https://x.test";
const monitor: MonitorDigestModel = {
  windowStart: "2026-07-08T00:00:00Z",
  autoApplied: [{ showTitle: "East Coast", slug: "east", items: ["Added Jane Doe"] }],
  autofix: {
    total: 2,
    shows: [
      {
        showTitle: "East Coast",
        slug: "east",
        items: [
          "Read likely-misspelled stage word(s) 'Sage' as 'Stage' in role cell: 'A1 Sage'",
          "Read likely-misspelled role 'A2 Teck' as 'A2 Tech' in role cell: 'A2 Teck'",
        ],
      },
    ],
  },
  drift: [
    {
      showTitle: "West",
      slug: "west",
      classes: [{ label: "unreadable field", prior: 10, curr: 11 }],
    },
  ],
  newShowGaps: [],
};

describe("renderDigest — monitor section (spec §8, §13.6)", () => {
  test("absent monitor → no section, subject unchanged", () => {
    const r = renderDigest({
      origin,
      shows: [{ showTitle: "S", slug: "s", items: ["needs review"] }],
    });
    expect(r.html).not.toContain("Applied automatically");
    expect(r.subject).toContain("show needs attention"); // 1 show → singular, unchanged behavior
  });

  test("monitor present, needs-attention empty → section + monitor subject", () => {
    const r = renderDigest({ origin, shows: [], monitor });
    expect(r.html).toContain("Applied automatically since your last digest");
    expect(r.text).toContain("Applied automatically since your last digest");
    expect(r.subject).toContain("automatic changes to review");
    expect(r.html).toContain("Added Jane Doe");
    expect(r.html).toContain("Autocorrects applied");
    expect(r.html).toContain("We applied automatic corrections to 1 show:");
    expect(r.html).toContain("&#39;Sage&#39; as &#39;Stage&#39;"); // escapeHtml escapes apostrophes
    expect(r.text).toContain("'Sage' as 'Stage'"); // plain text carries the raw notice
    expect(r.html).toContain("unreadable field"); // GAP_CLASSES label
  });

  test("no raw code token appears (invariant 5)", () => {
    const r = renderDigest({ origin, shows: [], monitor });
    expect(r.html).not.toMatch(/AUTOCORRECTED|FIELD_UNREADABLE/);
  });

  test("escapes HTML in show titles", () => {
    const evil: MonitorDigestModel = {
      ...monitor,
      autoApplied: [{ showTitle: "<script>x</script>", slug: "s", items: ["a"] }],
    };
    const r = renderDigest({ origin, shows: [], monitor: evil });
    expect(r.html).not.toContain("<script>x</script>");
  });

  test("caps auto-applied at 12 shows / 5 rows with overflow notes", () => {
    const many: MonitorDigestModel = {
      ...monitor,
      autoApplied: Array.from({ length: 13 }, (_, i) => ({
        showTitle: `Show ${i}`,
        slug: `s${i}`,
        items: i === 0 ? Array.from({ length: 6 }, (_, j) => `row ${j}`) : ["one"],
      })),
      autofix: { total: 0, shows: [] },
      drift: [],
    };
    const r = renderDigest({ origin, shows: [], monitor: many });
    expect(r.html).toContain("+1 more on this show"); // 6 rows → +1
    expect(r.html).toContain("+1 more shows"); // 13 shows → +1
  });

  test("autofix sub-block: intro renders ONLY the show count number (no per-correction count)", () => {
    const r = renderDigest({ origin, shows: [], monitor });
    const intro = r.text.split("\n").find((l) => l.includes("We applied automatic corrections"));
    expect(intro).toBe("We applied automatic corrections to 1 show:");
    expect(intro!.match(/\d+/g)).toEqual(["1"]); // negative: no other number in the intro
  });

  test("autofix sub-block: plural show count", () => {
    const two: MonitorDigestModel = {
      ...monitor,
      autofix: {
        total: 2,
        shows: [
          { showTitle: "A", slug: "a", items: ["corrected 'x' as 'y'"] },
          { showTitle: "B", slug: "b", items: ["corrected 'p' as 'q'"] },
        ],
      },
    };
    const r = renderDigest({ origin, shows: [], monitor: two });
    expect(r.text).toContain("We applied automatic corrections to 2 shows:");
  });

  test("autofix sub-block: per-show link href from slug; /admin fallback when slug null", () => {
    const m: MonitorDigestModel = {
      ...monitor,
      autofix: {
        total: 2,
        shows: [
          { showTitle: "East Coast", slug: "east", items: ["corrected 'a' as 'b'"] },
          { showTitle: null, slug: null, items: ["corrected 'c' as 'd'"] },
        ],
      },
    };
    const r = renderDigest({ origin, shows: [], monitor: m });
    expect(r.html).toContain(`<h4><a href="${origin}/admin/show/east">East Coast</a></h4>`);
    expect(r.html).toContain(`<h4><a href="${origin}/admin">Untitled show</a></h4>`);
  });

  test("autofix sub-block: items HTML-escaped", () => {
    const m: MonitorDigestModel = {
      ...monitor,
      autofix: {
        total: 1,
        shows: [{ showTitle: "E", slug: "e", items: ["corrected '<b>' as '&'"] }],
      },
    };
    const r = renderDigest({ origin, shows: [], monitor: m });
    expect(r.html).not.toContain("corrected '<b>'");
    expect(r.html).toContain("corrected &#39;&lt;b&gt;&#39; as &#39;&amp;&#39;");
  });

  test("autofix sub-block: caps 12 shows / 5 items with SOURCE-derived overflow", () => {
    const shows = Array.from({ length: 13 }, (_, i) => ({
      showTitle: `Show ${i}`,
      slug: `s${i}`,
      items:
        i === 0
          ? Array.from({ length: 7 }, (_, j) => `corrected 'a' as 'b' #${j}`)
          : ["corrected 'x' as 'y'"],
    }));
    const m: MonitorDigestModel = {
      ...monitor,
      autoApplied: [],
      drift: [],
      autofix: { total: 19, shows },
    };
    const r = renderDigest({ origin, shows: [], monitor: m });
    expect(r.html).toContain("We applied automatic corrections to 13 shows:");
    expect(r.html).toContain("+2 more on this show"); // 7 items → +2
    expect(r.html).toContain("+1 more shows"); // 13 shows → +1
  });

  test("autofix sub-block absent when total 0", () => {
    const m: MonitorDigestModel = { ...monitor, autofix: { total: 0, shows: [] } };
    const r = renderDigest({ origin, shows: [], monitor: m });
    expect(r.html).not.toContain("Autocorrects applied");
    expect(r.html).not.toContain("We applied automatic corrections");
  });
});
