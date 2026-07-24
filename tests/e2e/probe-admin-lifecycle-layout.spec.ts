/**
 * THROWAWAY PROBE — archive-row-menu-idiom spec R8 empirical spike.
 * Measures the ShareHub popover's idle/armed geometry at 390x700 for the held
 * (unpublished) seeded show, and records Element.prototype.scrollIntoView
 * calls. NOT a regression test; deleted after the numbers land in the spec.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { seedHeldShow, readShow, sqlClient, type SeededShow } from "../db/_b2Helpers";

const LOADED_REVIEW_MODAL =
  '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])';

let held: (SeededShow & { slug: string }) | undefined;

test.describe("PROBE archive scrollport geometry @390x700", () => {
  test.beforeAll(async () => {
    const h = await seedHeldShow();
    const row = await readShow(h.showId);
    held = { ...h, slug: row.slug as string };
  });

  test.afterAll(async () => {
    if (held) await sqlClient`delete from public.shows where id = ${held.showId}::uuid`;
  });

  test("measure idle + armed popover geometry", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __siv: Array<{ testid: string | null; opts: unknown }> };
      w.__siv = [];
      const orig = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element, opts?: unknown) {
        w.__siv.push({ testid: this.getAttribute("data-testid"), opts });
        return orig.call(this, opts as ScrollIntoViewOptions);
      };
    });
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto(`/admin?show=${held!.slug}`);
    const modal = page.locator(LOADED_REVIEW_MODAL);
    await expect(modal).toBeVisible({ timeout: 30_000 });

    // Pre-hydration clicks are swallowed on a cold dev-server compile; retry
    // the toggle until the popover mounts (probe-only pragmatism).
    const popover = modal.getByTestId("share-hub-popover");
    await expect(async () => {
      await modal.getByTestId("share-hub-kebab").click();
      await expect(popover).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });

    const metric = () =>
      popover.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        clientWidth: el.clientWidth,
        scrollTop: el.scrollTop,
        rect: el.getBoundingClientRect().toJSON(),
      }));

    const idle = await metric();
    const idleRow = await popover
      .getByTestId("archive-show-button")
      .evaluate((el: HTMLElement) => ({
        rect: el.getBoundingClientRect().toJSON(),
        offsetTop: el.offsetTop,
        offsetHeight: el.offsetHeight,
      }));

    await popover.getByTestId("archive-show-button").evaluate((el: HTMLElement) => el.click());
    const confirm = popover.getByTestId("archive-show-confirm-button");
    await expect(confirm).toBeVisible();
    await page.waitForTimeout(250); // let the rAF scroll settle

    const armed = await metric();
    const armedConfirm = await confirm.evaluate((el: HTMLElement) => ({
      rect: el.getBoundingClientRect().toJSON(),
      offsetTop: el.offsetTop,
      offsetHeight: el.offsetHeight,
      offsetParentTestid: (el.offsetParent as HTMLElement | null)?.getAttribute("data-testid"),
    }));
    const sivCalls = await page.evaluate(
      () => (window as unknown as { __siv: unknown }).__siv,
    );

    console.log("PROBE_RESULT " + JSON.stringify({ idle, idleRow, armed, armedConfirm, sivCalls }));
  });
});
