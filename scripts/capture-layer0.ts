import type { Page } from "@playwright/test";
import { DEFAULT_EXPECT_STABLE_MS, waitForPaintQuiescence } from "./capture-core";
import { detectRenderFaults } from "./capture-render-fault";

/** The `refusedReason` a layer-0 refusal records. */
export const SELECTOR_ABSENT = "selector-absent";

/**
 * A refusal attributed to the capture selector never resolving.
 *
 * Carries what a bare Playwright timeout does not: the missing selector, and
 * every marker found by scanning the DOCUMENT — the subtree that would
 * ordinarily be scanned is the thing that is absent.
 */
export class SelectorAbsentError extends Error {
  readonly refusedReason = SELECTOR_ABSENT;
  readonly selector: string;
  readonly markers: string[];

  constructor(selector: string, markers: string[]) {
    const found = markers.length > 0 ? markers.join(", ") : "none";
    super(`capture selector ${selector} never resolved; document markers: ${found}`);
    this.name = "SelectorAbsentError";
    this.selector = selector;
    this.markers = markers;
  }
}

async function refuse(page: Page, selector: string): Promise<never> {
  throw new SelectorAbsentError(selector, await detectRenderFaults(page));
}

/**
 * Quiesce the page, refusing with an ATTRIBUTED record when the capture
 * selector never resolves.
 *
 * Layer 0 has TWO triggers, and the second is not a variant of the first.
 *
 * 1. The selector wait times out. The catch is narrowed to that one await
 *    rather than wrapped around the whole quiescence sequence: networkidle,
 *    the fonts/rAF evaluate, and the stable wait can each fail on their own,
 *    and an implementation catching the whole rejection would attribute a
 *    network fault to a missing selector.
 *
 * 2. The wait SUCCEEDS while the capture selector is still absent. Quiescence
 *    resolves `entry.waitFor ?? entry.captureSelector ?? "body"`, so one
 *    ordinary manifest edit — `waitFor: "body"` on an entry whose
 *    `captureSelector` is a page-specific testid — makes the wait succeed under
 *    the very replacement fault this exists for. The timeout never fires, and a
 *    catch around the wait writes nothing.
 */
export async function quiesceWithLayer0(
  page: Page,
  opts: {
    waitForSelector: string;
    captureSelector?: string;
    selectorTimeoutMs?: number;
    stableMs?: number;
  },
): Promise<void> {
  const attributedSelector = opts.captureSelector ?? opts.waitForSelector;

  try {
    await page
      .locator(opts.waitForSelector)
      .first()
      .waitFor({
        state: "visible",
        ...(opts.selectorTimeoutMs !== undefined ? { timeout: opts.selectorTimeoutMs } : {}),
      });
  } catch (error) {
    // Trigger 1, narrowed on BOTH axes. The scope narrowing (only this await is
    // covered) was always here; the TYPE narrowing was not, and without it every
    // rejection from the wait became `selector-absent`. A malformed selector, a
    // present-but-hidden element, a crashed page and a genuine absence all
    // rejected here, and all four were attributed to absence -- a confidently
    // wrong reason is worse than an unhandled one, because it sends the operator
    // looking for a missing element that is present.
    //
    // Only a TimeoutError means "waited the full budget and it never became
    // visible", which is the claim `selector-absent` makes. Anything else keeps
    // its own name and propagates, and the capture still writes no bytes.
    if (!(error instanceof Error) || error.name !== "TimeoutError") throw error;
    return await refuse(page, attributedSelector);
  }

  await waitForPaintQuiescence(page, opts.stableMs ?? DEFAULT_EXPECT_STABLE_MS);

  // Trigger 2. The wait resolved, so nothing above can fire.
  if (opts.captureSelector !== undefined) {
    if ((await page.locator(opts.captureSelector).count()) === 0) {
      return await refuse(page, opts.captureSelector);
    }
  }
}
