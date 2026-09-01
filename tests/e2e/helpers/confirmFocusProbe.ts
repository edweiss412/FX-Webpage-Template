/**
 * Shared measurement for BL-CONFIRM-FOCUS-RESTORE-DESTRUCTIVE-CONTROLS.
 *
 * The defect under measurement is a focus reading, not a layout one: after a
 * two-tap destructive control is CONFIRMED, where does `document.activeElement`
 * end up? The rotate control was measured on `fix/sharelink-cue-focus` and lands
 * on `<body>` (`docs/superpowers/specs/ci/probes/2026-08-31-sharelink-cue-focus-probe.md`);
 * the other four controls in the class were derived from the flag's writers and
 * never observed, which is what this helper exists to fix.
 *
 * THREE THINGS THIS DOES DELIBERATELY, each of which a naive probe gets wrong:
 *
 *  1. `focus()` BEFORE `click()`, both inside one `evaluate`. A bare
 *     programmatic click moves no focus in either engine, so a probe that only
 *     clicks would read `<body>` for a reason that says nothing about
 *     production. Focusing first is what makes the reading faithful to the
 *     claim, which is about the control the operator just activated.
 *
 *  2. Never Playwright's own `.click()`. Its actionability step scrolls the
 *     element into view, which moves the very scroller some of these controls
 *     live inside, and the movement would then be indistinguishable from
 *     anything the component did itself.
 *
 *  3. A Cancel-path CONTROL beside every Confirm-path subject. `restoreFocusRef`
 *     is written only on the Cancel path, so Cancel restoring focus while
 *     Confirm drops it is the comparison that makes a reading a finding rather
 *     than an observation. A probe that measured Confirm alone could not tell a
 *     broken restore from a component that never restores focus at all.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** One control's testids. `root` scopes every lookup to its own surface. */
export type ConfirmControl = {
  /** Human name for the report; appears in the emitted JSON. */
  readonly name: string;
  /** The scroller or panel the control lives in — the frame rects are read against. */
  readonly root: Locator;
  /**
   * CSS selector for that same root, used for the READING only.
   *
   * Not redundant with `root`. A confirm can destroy the surface it lives in —
   * archiving a show unmounts the share-hub popover outright — and a reading
   * taken through a Locator on a detached node hangs to the test timeout
   * instead of answering. Measured: the archive case burned 180s that way. The
   * reading therefore runs on the PAGE and re-queries this selector each time,
   * so a vanished root is a fact the probe can report rather than a hang.
   */
  readonly rootSelector: string;
  /** Opens the two-tap confirm. */
  readonly trigger: string;
  /** Commits the destructive action. */
  readonly confirm: string;
  /** Abandons it; drives the control arm of the measurement. */
  readonly cancel: string;
};

export type FocusReading = {
  readonly at: string;
  readonly tag: string | null;
  readonly testid: string | null;
  readonly insideRoot: boolean;
  /** false when the confirm destroyed the root — a result, not an error. */
  readonly rootPresent: boolean;
  /** Intersection of the focused rect with the root's client rect, in CSS px. */
  readonly visibleHeight: number | null;
  readonly height: number | null;
  readonly rootScrollTop: number;
};

/** Reads `document.activeElement` against the root, from the PAGE so a detached root cannot hang. */
export async function readFocus(
  page: Page,
  rootSelector: string,
  at: string,
): Promise<FocusReading> {
  return page.evaluate(
    ({ sel, label }) => {
      const el = document.querySelector(sel);
      const active = document.activeElement as HTMLElement | null;
      const rect = active ? active.getBoundingClientRect() : null;
      const rootRect = el ? el.getBoundingClientRect() : null;
      return {
        at: label,
        tag: active ? active.tagName : null,
        testid: active ? active.getAttribute("data-testid") : null,
        insideRoot: el !== null && active !== null ? el.contains(active) : false,
        rootPresent: el !== null,
        visibleHeight:
          rect === null || rootRect === null
            ? null
            : Math.max(
                0,
                Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top),
              ),
        height: rect === null ? null : rect.height,
        rootScrollTop: el instanceof HTMLElement ? el.scrollTop : 0,
      };
    },
    { sel: rootSelector, label: at },
  );
}

/** Focus, then activate, in one evaluate — see note 1 above. */
async function focusAndClick(target: Locator): Promise<void> {
  await target.evaluate((el: HTMLElement) => {
    el.focus();
    el.click();
  });
}

/**
 * Drives one control to CONFIRM and reads focus at each step.
 *
 * `settleMs` is a plain wait rather than a poll on purpose: there is no DOM
 * predicate for "focus has finished moving", and polling `activeElement` until
 * it changes would bias the reading toward whichever value appeared first.
 */
export async function measureConfirmPath(
  page: Page,
  control: ConfirmControl,
  settleMs = 3000,
): Promise<FocusReading[]> {
  const out: FocusReading[] = [];
  out.push(await readFocus(page, control.rootSelector, `${control.name}:before-arm`));

  await focusAndClick(control.root.getByTestId(control.trigger));
  const confirm = control.root.getByTestId(control.confirm);
  await expect(confirm).toBeVisible();
  out.push(await readFocus(page, control.rootSelector, `${control.name}:armed`));

  await focusAndClick(confirm);
  out.push(await readFocus(page, control.rootSelector, `${control.name}:just-after-confirm`));

  await page.waitForTimeout(settleMs);
  out.push(await readFocus(page, control.rootSelector, `${control.name}:settled`));
  return out;
}

/**
 * The CONTROL arm — the same journey ending in Cancel, which the component's
 * close-focus effect DOES cover. A run where this also fails to restore focus
 * is measuring a broken harness, not a broken component.
 */
export async function measureCancelPath(
  page: Page,
  control: ConfirmControl,
  settleMs = 500,
): Promise<FocusReading> {
  await focusAndClick(control.root.getByTestId(control.trigger));
  const cancel = control.root.getByTestId(control.cancel);
  await expect(cancel).toBeVisible();
  await focusAndClick(cancel);
  await page.waitForTimeout(settleMs);
  return readFocus(page, control.rootSelector, `${control.name}:control-after-cancel`);
}
