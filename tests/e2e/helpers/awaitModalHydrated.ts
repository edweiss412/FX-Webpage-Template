import { expect, type Page } from "@playwright/test";

/**
 * Effect-flush hydration gate for the published-show review modal
 * (published-review-modal.interactions:104-120 pattern): a synthetic click that
 * lands before React attaches the modal's handlers is silently lost, so wait
 * until the shell's initial-focus effect has run.
 *
 * Promoted out of dev-capture.spec.ts (batch-2 R7): warning-panel-polish needs
 * the same gate, and two copies of a readiness contract drift.
 */
export async function awaitModalHydrated(page: Page): Promise<void> {
  // Loaded frame, not the streaming skeleton twin (both carry the panel data
  // attribute — crew-actions.spec.ts:18-22 pattern): anchor on the title.
  const loaded = `[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])`;
  await expect(page.locator(loaded)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`[data-testid="published-show-review-modal"]`)).toHaveCount(1);
  await expect
    .poll(
      () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
      { message: "modal effect flush (initial focus applied)" },
    )
    .toBe("published-show-review-close");
}
