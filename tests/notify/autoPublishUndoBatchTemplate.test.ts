import { describe, expect, test } from "vitest";
import {
  renderAutoPublishUndo,
  renderAutoPublishUndoBatch,
  type AutoPublishUndoBatchShow,
} from "@/lib/notify/templates/autoPublishUndo";
import { recipientBindingFor } from "@/lib/sync/unpublishBinding";

const NOW = new Date("2026-07-16T05:20:00.000Z");
const RECIPIENT = "doug@fxav.net";

function show(
  i: number,
  overrides: Partial<AutoPublishUndoBatchShow> = {},
): AutoPublishUndoBatchShow {
  return {
    slug: `show-${i}`,
    showTitle: `Show ${i}`,
    showId: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`,
    token: `token-${i}`,
    mintId: `mint${i}`,
    expiresAt: new Date("2026-07-17T06:15:00.000Z"),
    ...overrides,
  };
}

describe("renderAutoPublishUndoBatch (batching spec §2.4)", () => {
  test("N=1 is byte-identical to the single template", () => {
    const s = show(1);
    const single = renderAutoPublishUndo({
      origin: "https://fxav.example",
      slug: s.slug,
      showTitle: s.showTitle,
      showId: s.showId,
      token: s.token,
      mintId: s.mintId,
      expiresAt: s.expiresAt,
      recipient: RECIPIENT,
      now: NOW,
    });
    const batch = renderAutoPublishUndoBatch({
      origin: "https://fxav.example",
      shows: [s],
      recipient: RECIPIENT,
      now: NOW,
    });
    expect(batch).toEqual(single);
  });

  test("N=2: pluralized subject, one block per show, each with its OWN recipient-bound r", () => {
    const shows = [show(1), show(2)];
    const batch = renderAutoPublishUndoBatch({
      origin: "https://fxav.example",
      shows,
      recipient: RECIPIENT,
      now: NOW,
    });
    expect(batch.subject).toBe("FXAV: 2 shows published themselves");
    for (const s of shows) {
      const r = recipientBindingFor(RECIPIENT, s.showId, s.mintId);
      const href = `https://fxav.example/show/${s.slug}/unpublish?token=${s.token}&r=${r}`;
      expect(batch.text).toContain(href);
      // hrefs render through escapeHtml, matching the single template's behavior
      expect(batch.html).toContain(`href="${href.replace(/&/g, "&amp;")}"`);
    }
    const r1 = recipientBindingFor(RECIPIENT, shows[0]!.showId, shows[0]!.mintId);
    const r2 = recipientBindingFor(RECIPIENT, shows[1]!.showId, shows[1]!.mintId);
    expect(r1).not.toBe(r2); // capability must not leak across shows
    // shared explainer appears exactly once
    expect(batch.text.match(/Undoing takes the show offline/g)).toHaveLength(1);
  });

  test("N=21: 20 rendered + overflow line naming the correct remainder", () => {
    const shows = Array.from({ length: 21 }, (_, i) => show(i + 1));
    const batch = renderAutoPublishUndoBatch({
      origin: "https://fxav.example",
      shows,
      recipient: RECIPIENT,
      now: NOW,
    });
    expect(batch.subject).toBe("FXAV: 21 shows published themselves");
    expect(batch.text).toContain(`token=${shows[19]!.token}`);
    expect(batch.text).not.toContain(`token=${shows[20]!.token}`);
    expect(batch.text).toContain(
      "and 1 more — manage shows from the dashboard: https://fxav.example/admin",
    );
  });

  test("HTML-escapes titles; raw title never appears unescaped in html", () => {
    const s = show(1, { showTitle: "Danger <x> & Co" });
    const batch = renderAutoPublishUndoBatch({
      origin: "https://fxav.example",
      shows: [s, show(2)],
      recipient: RECIPIENT,
      now: NOW,
    });
    expect(batch.html).toContain("Danger &lt;x&gt; &amp; Co");
    expect(batch.html).not.toContain("Danger <x>");
  });

  test.each([2, 21])("text mirrors html paragraph-for-paragraph at N=%i (spec §2.4)", (n) => {
    const shows = Array.from({ length: n }, (_, i) => show(i + 1));
    const batch = renderAutoPublishUndoBatch({
      origin: "https://fxav.example",
      shows,
      recipient: RECIPIENT,
      now: NOW,
    });
    const htmlParagraphs = (batch.html.match(/<p>/g) ?? []).length;
    expect(batch.text.split("\n\n")).toHaveLength(htmlParagraphs);
    if (n === 21) {
      const overflowLine =
        "…and 1 more — manage shows from the dashboard: https://fxav.example/admin";
      expect(batch.text).toContain(overflowLine);
      expect(batch.html).toContain("and 1 more");
    }
  });
});
