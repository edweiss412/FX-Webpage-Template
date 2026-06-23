/**
 * tests/e2e/help-typography.spec.ts
 *
 * Real-browser regression for the /help prose typography layer.
 *
 * Why this exists: the /help MDX pipeline is "vanilla" (no
 * @tailwindcss/typography plugin, no base-element CSS). Before the typography
 * layer, Tailwind v4 preflight left markdown headings/lists/links unstyled —
 * h1/h2 rendered at body size (16px/400), <ul> had no bullets or indent,
 * inline links had no underline/color, paragraphs had no spacing, and the
 * desktop reading column ran ~113ch. jsdom can't catch this (no layout/cascade),
 * so the contract is pinned here against a real browser at both viewports.
 *
 * Runs in the CI-gated help-docs projects (help-affordances.yml): help-docs
 * (webkit, 390) and help-docs-desktop (chromium, 1280) against the :3004 server
 * with admin auth. The heading / list / link / code / paragraph-rhythm
 * assertions hold at both viewports; the measure assertion binds meaningfully at
 * desktop (where the column was ~856px) and is trivially satisfied at mobile.
 * Relative URLs + signInAs(no baseUrl) inherit the project baseURL, matching
 * help-mobile.spec.ts (the sibling spec in the same project family).
 *
 * Anti-tautology: every numeric assertion compares a heading/measure against
 * the live paragraph metrics on the SAME page (h2 > p, not a hardcoded px), so
 * the test can't pass by accident if the base font size changes.
 */
import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers/signInAs";
import { ADMIN_FIXTURE } from "./helpers/fixtures";

test.describe("/help prose typography layer", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("headings, lists, code, paragraph rhythm and reading measure are styled", async ({
    page,
  }) => {
    await page.goto("/help/admin/onboarding-wizard", {
      waitUntil: "networkidle",
    });

    const m = await page.evaluate(() => {
      const num = (v: string) => parseFloat(v);
      const h1 = document.querySelector("main .help-prose h1")!;
      const h2 = document.querySelector("main .help-prose h2")!;
      const p = document.querySelector("main .help-prose p")!;
      const ul = document.querySelector("main .help-prose ul")!;
      const code = document.querySelector("main .help-prose code")!;
      const [p0, p1] = Array.from(document.querySelectorAll("main .help-prose p")) as HTMLElement[];
      const paragraphGap =
        p0 && p1 ? p1.getBoundingClientRect().top - p0.getBoundingClientRect().bottom : -1;

      // Reading measure of the prose column in CSS `ch` units (the `ch` unit is
      // the advance of the "0" glyph — the same unit `max-width: 70ch` uses).
      const prose = document.querySelector("main .help-prose") as HTMLElement | null;
      const pcs = getComputedStyle(p);
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = `${pcs.fontWeight} ${pcs.fontSize} ${pcs.fontFamily}`;
      const chWidth = ctx.measureText("0".repeat(50)).width / 50;
      const measureCh = prose ? prose.getBoundingClientRect().width / chWidth : -1;

      return {
        hasProseWrapper: !!prose,
        viewport: window.innerWidth,
        h1Size: num(getComputedStyle(h1).fontSize),
        h2Size: num(getComputedStyle(h2).fontSize),
        h2Weight: Number(getComputedStyle(h2).fontWeight),
        pSize: num(pcs.fontSize),
        ulListStyle: getComputedStyle(ul).listStyleType,
        ulPadStart: num(getComputedStyle(ul).paddingInlineStart),
        codeBg: getComputedStyle(code).backgroundColor,
        paragraphGap,
        measureCh,
      };
    });

    // The wrapper that scopes the prose layer must be present.
    expect(m.hasProseWrapper, "main should contain a .help-prose wrapper").toBe(true);

    // Heading hierarchy — headings must read larger and heavier than body.
    expect(m.h1Size, "h1 must be larger than body").toBeGreaterThan(m.pSize);
    expect(m.h2Size, "h2 must be larger than body").toBeGreaterThan(m.pSize);
    expect(m.h2Weight, "h2 must be semibold+").toBeGreaterThanOrEqual(600);

    // Lists — preflight stripped markers + indent; both must be restored.
    expect(m.ulListStyle, "ul must show a marker").not.toBe("none");
    expect(m.ulPadStart, "ul must be indented").toBeGreaterThan(0);

    // Paragraph rhythm — consecutive paragraphs must have a visible gap.
    expect(m.paragraphGap, "consecutive paragraphs need a gap").toBeGreaterThan(4);

    // Code — must carry a visible background tint (not transparent).
    expect(m.codeBg, "inline code needs a background tint").not.toBe("rgba(0, 0, 0, 0)");

    // Reading measure — capped at ~70ch (DESIGN.md §2.5: 65–75ch); the desktop
    // column was the full ~856px (~85ch) before the layer. 76 = 70ch cap + a
    // little headroom for cross-engine glyph-metric variance.
    expect(
      m.measureCh,
      `reading measure too wide (${Math.round(m.measureCh)}ch)`,
    ).toBeLessThanOrEqual(76);
  });

  test("inline prose links are visibly styled (underline + accent color)", async ({ page }) => {
    await page.goto("/help/admin/per-show-panel", { waitUntil: "networkidle" });

    const link = await page.evaluate(() => {
      const a = document.querySelector("main .help-prose :is(p, li) a");
      if (!a) return null;
      const cs = getComputedStyle(a);
      return {
        decoration: cs.textDecorationLine,
        color: cs.color,
        bodyColor: getComputedStyle(document.body).color,
      };
    });

    expect(link, "per-show-panel should contain an inline prose link").not.toBeNull();
    expect(link!.decoration, "inline link must be underlined").toContain("underline");
    expect(link!.color, "inline link must not match body text color").not.toBe(link!.bodyColor);
  });

  test("errors page inherits the prose layer (no inert typography-plugin classes)", async ({
    page,
  }) => {
    await page.goto("/help/errors", { waitUntil: "networkidle" });

    const m = await page.evaluate(() => {
      const h1 = document.querySelector("main .help-prose h1");
      const p = document.querySelector("main .help-prose p");
      return {
        hasProseWrapper: !!document.querySelector("main .help-prose"),
        h1Size: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
        pSize: p ? parseFloat(getComputedStyle(p).fontSize) : 0,
      };
    });

    expect(m.hasProseWrapper, "errors page must be inside .help-prose").toBe(true);
    expect(m.h1Size, "errors h1 must be styled larger than body").toBeGreaterThan(m.pSize);
  });
});
