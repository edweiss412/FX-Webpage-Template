/**
 * tests/e2e/attention-gallery-layout.spec.ts
 * (spec 2026-07-20-attention-scenario-gallery §8, §9)
 *
 * jsdom computes no layout and loads no CSS, so neither assertion here can be
 * made in Vitest: the reserved space below an open menu is a real-geometry
 * question, and the scroll threshold depends on a `max-h-96` that only a real
 * stylesheet applies.
 *
 * Runs on the `dev-build` project (port 3001), a built artifact with
 * ADMIN_DEV_PANEL_ENABLED=true. Deliberately NOT port 3000: a sibling
 * worktree's dev server there would serve another branch's code.
 *
 * Every locator is re-queried immediately before each evaluate. Playwright's
 * auto-wait hangs on a node that unmounted between the query and the call.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

/** The real testid AttentionMenu renders (components/admin/showpage/AttentionMenu.tsx:97). */
const MENU = '[data-testid="published-show-review-attention-menu"]';
const BLOCK = '[data-testid="block-root"]';

async function ready(page: Page, url: string): Promise<void> {
  await signInAs(page, ADMIN_FIXTURE);
  await page.goto(url);
  await page.locator(BLOCK).first().waitFor({ state: "attached" });
  // Scoped INSIDE the block: the admin nav topbar renders its own
  // aria-expanded controls (the notifications bell), and an unscoped selector
  // matches the bell first. Clicking that opens the bell panel, whose backdrop
  // then intercepts every subsequent click.
  await expect(page.locator(BLOCK).first().locator("[aria-expanded]").first()).toBeAttached();
  await expect(page.locator(MENU).first()).toBeVisible();
}

for (const [name, width] of [
  ["narrow", "320"],
  ["wide", "1280"],
] as const) {
  test(`adjacent open menus do not overlap the next scenario (${name})`, async ({ page }) => {
    await ready(page, `/admin/dev/attention-gallery?tier=2&w=${width}`);

    const menus = page.locator(MENU);
    const count = await menus.count();
    // Guards the vacuous pass: one menu can never overlap another.
    expect(count).toBeGreaterThan(1);

    for (let i = 0; i + 1 < count; i++) {
      const a = await page.locator(MENU).nth(i).boundingBox();
      const b = await page
        .locator(MENU)
        .nth(i + 1)
        .boundingBox();
      expect(a, `menu ${i} has no box`).toBeTruthy();
      expect(b, `menu ${i + 1} has no box`).toBeTruthy();
      if (a && b) {
        expect(
          a.y + a.height,
          `menu ${i} bottom (${a.y + a.height}) overlaps menu ${i + 1} top (${b.y})`,
        ).toBeLessThanOrEqual(b.y + 0.5);
      }
    }
  });
}

for (const [name, width] of [
  ["narrow", "320"],
  ["wide", "1280"],
] as const) {
  test(`an open menu does not cover its OWN block's cards (${name})`, async ({ page }) => {
    // The impeccable audit's P2. `pb-104` only protected the NEXT block, so the
    // menu sat on top of the very cards a reviewer opened the gallery to read
    // - worst at 320px, where the menu is nearly full width.
    await ready(page, `/admin/dev/attention-gallery?scenario=t2-single&w=${width}`);

    const menu = await page.locator(MENU).first().boundingBox();
    const group = await page.locator('[data-testid^="group-"]').first().boundingBox();
    expect(menu, "menu has no box").toBeTruthy();
    expect(group, "no bucketed group rendered, so this assertion would be vacuous").toBeTruthy();
    if (menu && group) {
      expect(
        menu.y + menu.height,
        `menu bottom (${menu.y + menu.height}) overlaps its own first card (top ${group.y})`,
      ).toBeLessThanOrEqual(group.y + 0.5);
    }
  });
}

test("a MENU_CAP-item menu actually crosses its scroll threshold", async ({ page }) => {
  // This is why MENU_CAP is 12 rather than an assumed-sufficient number: the
  // count has to actually reach the overflow state it claims to demonstrate.
  await ready(page, "/admin/dev/attention-gallery?scenario=t2-many");

  const list = page.locator(`${MENU} .overflow-y-auto`).first();
  await list.waitFor({ state: "attached" });
  const { scrollHeight, clientHeight } = await page
    .locator(`${MENU} .overflow-y-auto`)
    .first()
    .evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));

  expect(scrollHeight).toBeGreaterThan(clientHeight);
});

test("the menu carries its entry transition, and the block reserves space below it", async ({
  page,
}) => {
  await ready(page, "/admin/dev/attention-gallery?scenario=t2-single");

  // §9 row 1: the menu inherits AttentionMenu's own transition unchanged. The
  // gallery must not have stripped or overridden it.
  const cls = await page.locator(MENU).first().getAttribute("class");
  expect(cls ?? "").toContain("transition-[opacity,transform]");
  expect(cls ?? "").toContain("motion-reduce:transition-none");

  // The open menu must sit inside its block's reserved padding, or it would
  // spill past the block boundary and collide with whatever follows.
  const menuBox = await page.locator(MENU).first().boundingBox();
  const blockBox = await page.locator(BLOCK).first().boundingBox();
  expect(menuBox && blockBox).toBeTruthy();
  if (menuBox && blockBox) {
    expect(
      menuBox.y + menuBox.height,
      "the open menu extends past the bottom of its own block",
    ).toBeLessThanOrEqual(blockBox.y + blockBox.height + 0.5);
  }
});

test("toggling a sibling warning while the menu is mid-transition is instant, not queued", async ({
  page,
}) => {
  // §9 compound rows: a warning card is a SIBLING of the menu, so toggling one
  // during the menu's animation must not queue behind it or restart it.
  // FIELD_UNREADABLE deliberately: it is a WARNING_CARD_COPY_CODES member
  // (tests/messages/warningCardCopyRegistry.ts), so its card actually renders a
  // `?` popover trigger. The composites' codes carry no triggerContext, so
  // pointing this test at one of those would render no trigger and the
  // compound-transition assertion would pass without ever exercising it.
  await ready(page, "/admin/dev/attention-gallery?scenario=warn-field-unreadable");

  const help = page.locator('[data-testid^="per-show-actionable-help-"]').first();
  // Asserted, never guarded by an if: a missing trigger must FAIL this test
  // rather than silently skip the behavior it exists to prove.
  await expect(help).toBeVisible();

  // Scoped to the block for the same reason as in ready(): unscoped, this is
  // the admin nav's notifications bell.
  const pill = page.locator(BLOCK).first().locator("[aria-expanded]").first();
  await pill.click(); // begin the menu's close transition
  await help.click(); // toggle a SIBLING mid-transition

  // The popover is a descendant of the warning card, not of the menu, so it
  // resolves immediately regardless of the menu's animation state...
  await expect(page.locator('[data-testid^="per-show-actionable-help-"]').first()).toBeVisible();
  // ...and the menu still finished closing rather than being held open by it.
  await expect(page.locator(MENU)).toHaveCount(0);
});
