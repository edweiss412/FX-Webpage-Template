import { describe, expect, test } from "vitest";
import {
  renderAutoPublishUndo,
  type AutoPublishUndoInput,
} from "@/lib/notify/templates/autoPublishUndo";
import {
  bindingMatchesActiveAdmin,
  mintIdFor,
  recipientBindingFor,
} from "@/lib/sync/unpublishBinding";

const ORIGIN = "https://crew.fxav.app";
const SHOW_ID = "00000000-0000-4000-8000-000000000031";
const TOKEN = "11111111-2222-4333-8444-555555555555";
const MINT_ID = mintIdFor(TOKEN);
const NOW = new Date("2026-06-12T16:00:00.000Z");
// Fixture dimension drives the "about N hours" expectation (anti-tautology:
// derived, not hardcoded independently of the fixture).
const HOURS_AHEAD = 26;
const EXPIRES = new Date(NOW.getTime() + HOURS_AHEAD * 3_600_000);

function input(overrides: Partial<AutoPublishUndoInput> = {}): AutoPublishUndoInput {
  return {
    origin: ORIGIN,
    slug: "spring-tour",
    showTitle: "Spring Tour",
    showId: SHOW_ID,
    token: TOKEN,
    mintId: MINT_ID,
    expiresAt: EXPIRES,
    recipient: "doug@fxav.net",
    now: NOW,
    ...overrides,
  };
}

describe("renderAutoPublishUndo (spec §4.3)", () => {
  test("subject is exactly `FXAV: <title> published itself`", () => {
    const out = renderAutoPublishUndo(input());
    expect(out.subject).toBe("FXAV: Spring Tour published itself");
  });

  test("ONE primary link with the recipient-bound r, in BOTH html and text parts", () => {
    const out = renderAutoPublishUndo(input());
    // Assert against the DATA SOURCE (the binding helper), never a hardcoded r.
    const r = recipientBindingFor("doug@fxav.net", SHOW_ID, MINT_ID);
    const href = `${ORIGIN}/show/spring-tour/unpublish?token=${TOKEN}&r=${r}`;
    expect(out.text).toContain(href);
    // The html attribute value is escapeHtml(href): `&` → `&amp;`.
    expect(out.html).toContain(`href="${href.replaceAll("&", "&amp;")}"`);
    // Exactly one anchor in html, exactly one unpublish URL in text.
    expect(out.html.match(/<a /g)).toHaveLength(1);
    expect(out.text.match(/\/unpublish\?/g)).toHaveLength(1);
  });

  test("body says when the window closes: absolute ET time AND `about N hours` derived from the fixture gap", () => {
    const out = renderAutoPublishUndo(input());
    // 2026-06-12T16:00Z + 26h = 2026-06-13T18:00:00Z = 2:00 PM EDT, Jun 13.
    expect(out.text).toContain("Jun 13, 2026");
    expect(out.text).toMatch(/2:00\s?PM/);
    expect(out.text).toContain("EDT");
    expect(out.text).toContain(`about ${HOURS_AHEAD} hours`);
    expect(out.html).toContain(`about ${HOURS_AHEAD} hours`);
  });

  test("singular `about 1 hour` when under 90 minutes remain (never `1 hours`, never `0 hours`)", () => {
    const out = renderAutoPublishUndo(input({ expiresAt: new Date(NOW.getTime() + 50 * 60_000) }));
    expect(out.text).toContain("about 1 hour");
    expect(out.text).not.toContain("1 hours");
    expect(out.text).not.toContain("0 hour");
  });

  test("one sentence on what undo does + one sentence that ignoring keeps the show live", () => {
    const out = renderAutoPublishUndo(input());
    for (const part of [out.text, out.html]) {
      expect(part).toMatch(/takes the show offline/i);
      expect(part).toMatch(/crew links switch off until/i);
      expect(part).toMatch(/ignore this email and the show stays live/i);
    }
  });

  test("escapeHtml on interpolations: a markup-bearing title cannot inject into the html part", () => {
    const out = renderAutoPublishUndo(input({ showTitle: '<script>x & "y"' }));
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;x &amp; &quot;y&quot;");
    // Plain-text part carries the raw title (no HTML entities leak into text).
    expect(out.text).toContain('<script>x & "y"');
  });

  test("r derives from the CANONICAL recipient (case/whitespace-insensitive)", () => {
    const out = renderAutoPublishUndo(input({ recipient: "  Doug@FXAV.NET " }));
    const r = recipientBindingFor("doug@fxav.net", SHOW_ID, MINT_ID);
    expect(out.text).toContain(`&r=${r}`);
  });

  test("per-recipient distinctness: two recipients render two DISTINCT URLs, each r validating only via its own recipient row", () => {
    const a = renderAutoPublishUndo(input({ recipient: "doug@fxav.net" }));
    const b = renderAutoPublishUndo(input({ recipient: "amy@fxav.net" }));
    const rOf = (text: string) => /[?&]r=([0-9a-f]{16})/.exec(text)?.[1] ?? "";
    const rA = rOf(a.text);
    const rB = rOf(b.text);
    expect(rA).toMatch(/^[0-9a-f]{16}$/);
    expect(rA).not.toBe(rB);
    expect(bindingMatchesActiveAdmin([{ email: "doug@fxav.net" }], rA, SHOW_ID, MINT_ID)).toBe(
      true,
    );
    expect(bindingMatchesActiveAdmin([{ email: "doug@fxav.net" }], rB, SHOW_ID, MINT_ID)).toBe(
      false,
    );
  });
});
