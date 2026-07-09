import { describe, expect, test } from "vitest";
import { renderDigest } from "@/lib/notify/templates/digest";
import type { MonitorDigestModel } from "@/lib/notify/monitorDigest";

const origin = "https://x.test";
const monitor: MonitorDigestModel = {
  windowStart: "2026-07-08T00:00:00Z",
  autoApplied: [{ showTitle: "East Coast", slug: "east", items: ["Added Jane Doe"] }],
  autofix: {
    total: 2,
    classes: {
      STAGE_WORD_AUTOCORRECTED: 2,
      ROLE_TOKEN_AUTOCORRECTED: 0,
      COLUMN_HEADER_AUTOCORRECTED: 0,
      SECTION_HEADER_AUTOCORRECTED: 0,
      FIELD_LABEL_AUTOCORRECTED: 0,
    },
  },
  drift: [
    {
      showTitle: "West",
      slug: "west",
      classes: [{ label: "unreadable field", prior: 10, curr: 11 }],
    },
  ],
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
    expect(r.html).toContain("corrected stage word"); // AUTO_FIX_CLASSES label
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
      autofix: { ...monitor.autofix, total: 0 },
      drift: [],
    };
    const r = renderDigest({ origin, shows: [], monitor: many });
    expect(r.html).toContain("+1 more on this show"); // 6 rows → +1
    expect(r.html).toContain("+1 more shows"); // 13 shows → +1
  });
});
