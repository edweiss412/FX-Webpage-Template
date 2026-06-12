import { expect, test } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

test.describe("/help mobile layout (test #6)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("sidebar collapses, content fits viewport, and visible tap targets meet the 44px floor", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/help/admin/dashboard", { waitUntil: "networkidle" });

    const nav = page.getByRole("navigation", { name: "Help navigation" });
    const disclosure = nav.getByRole("button", { name: /browse help pages/i });
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    const firstNavLink = nav.getByRole("link", { name: "First-time setup" });
    await expect(firstNavLink).toBeHidden();

    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await expect(firstNavLink).toBeVisible();

    const mainBox = await page.locator("main").boundingBox();
    expect(mainBox, "main element should be measurable").not.toBeNull();
    expect(mainBox!.width).toBeLessThanOrEqual(390 - 2 * 16);

    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth);

    const tooSmall = await page.evaluate(() => {
      const interactive = Array.from(document.querySelectorAll("a, button, [role='button']"));
      return interactive
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => {
          // sr-only-until-focused chrome (the M11-A-D2 skip-link,
          // app/help/layout.tsx) is clipped to 1x1 while unfocused — it is
          // not a pointer target, so the WCAG 2.5.x floor doesn't apply in
          // that state. Exempt the clipped state here; the focused-size
          // assertion after this sweep pins its real tap size. This repo's
          // Tailwind v4 sr-only clips via `clip-path: inset(50%)` (computed
          // `clip` is "auto" — verified live 2026-06-11); the legacy
          // `clip: rect(0 0 0 0)` form is kept for robustness.
          const cs = getComputedStyle(el);
          const srOnlyClipped =
            cs.clipPath === "inset(50%)" || cs.clip === "rect(0px, 0px, 0px, 0px)";
          return !(cs.position === "absolute" && srOnlyClipped);
        })
        .filter((el) => {
          // WCAG 2.5.5 inline exception: links rendered inline within prose
          // body text (e.g., MDX content <a> inside <main> paragraphs/list
          // items) are exempt from the 44x44 floor. Per PRODUCT.md:59.
          if (el.tagName !== "A") return true;
          const isInline = getComputedStyle(el).display === "inline";
          const inProse = el.closest("main p, main li, main dd, main td") !== null;
          return !(isInline && inProse);
        })
        .filter((el) => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .map((el) => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          return {
            tag: el.tagName,
            text: el.textContent?.trim().replace(/\s+/g, " ").slice(0, 60),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        });
    });
    expect(
      tooSmall,
      `Found ${tooSmall.length} sub-44x44 interactive elements:\n${JSON.stringify(
        tooSmall,
        null,
        2,
      )}`,
    ).toEqual([]);

    // The skip-link exempted from the sweep above must still meet the 44px
    // floor in its FOCUSED (visible) state — focus:not-sr-only +
    // min-h-tap-min (app/help/layout.tsx). Failure mode caught: someone
    // drops the focus:* sizing classes and the link becomes an invisible or
    // sub-44px focused target.
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await skipLink.focus();
    await expect(skipLink).toBeVisible();
    const focusedBox = await skipLink.boundingBox();
    expect(focusedBox, "focused skip-link should be measurable").not.toBeNull();
    expect(focusedBox!.height).toBeGreaterThanOrEqual(44);
  });
});
