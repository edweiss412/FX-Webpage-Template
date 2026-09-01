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
  /**
   * CSS selector for the root: the ONE declaration of it.
   *
   * There is deliberately no Locator field beside this. A confirm can destroy
   * the surface it lives in —
   * archiving a show unmounts the share-hub popover outright — and a reading
   * taken through a Locator on a detached node hangs to the test timeout
   * instead of answering. Measured: the archive case burned 180s that way. The
   * reading therefore runs on the PAGE and re-queries this selector each time,
   * so a vanished root is a fact the probe can report rather than a hang.
   */
  readonly rootSelector: string;
  /**
   * CSS selector for the element focus is REQUIRED to end on after the confirm.
   *
   * Its identity is captured from the DOM BEFORE the action and compared after,
   * rather than written as a literal beside the assertion. Two earlier versions
   * of the deciding assertion were self-referential and passed for every input;
   * an expectation captured from a different moment, off a different read,
   * cannot degenerate that way, and it also proves the target EXISTED before
   * the action rather than only that something was focused after it.
   */
  readonly restoreTargetSelector: string;
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
  /**
   * The focused element's `id`.
   *
   * Carried because a ratified focus target may have no testid: the admins
   * section heading `#admin-settings-admins-heading` is identified by id alone,
   * and a reading that recorded only `testid` could never observe whether the
   * repair hit it. Round 2 caught exactly that.
   */
  readonly id: string | null;
  /**
   * `data-row-email` of the nearest ancestor row, when there is one.
   *
   * Every revoke trigger carries the SAME testid and no id, so testid+id cannot
   * tell one row's trigger from another's and the cancel assertion would pass
   * with focus on the WRONG row. The row identity is what makes the oracle
   * exact on a repeated control.
   */
  readonly row: string | null;
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
        id: active && active.id !== "" ? active.id : null,
        row:
          active === null
            ? null
            : (active.closest("[data-row-email]")?.getAttribute("data-row-email") ?? null),
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
/**
 * The root Locator, DERIVED from the one declared selector.
 *
 * `ConfirmControl` used to carry a `root` Locator beside `rootSelector`, and the
 * revoke control shipped with the two naming different elements: the Locator on
 * the active list, the selector on the section heading. Element lookups went
 * through one and every reading through the other, so `insideRoot` was false for
 * every control and the case could not reach its own settled assertion.
 *
 * A guard comparing the two would have to be called at every site that builds a
 * control. Deriving one from the other removes the second field, so there is
 * nothing left to disagree.
 */
export function rootLocator(page: Page, control: ConfirmControl): Locator {
  return page.locator(control.rootSelector);
}

export type CapturedTarget = {
  readonly testid: string | null;
  readonly id: string | null;
  readonly row: string | null;
};

/** Identity of ANY element, read from the page by selector. One implementation,
 *  so a second copy at a call site cannot drift from CapturedTarget's shape. */
export async function captureBySelector(page: Page, selector: string): Promise<CapturedTarget> {
  const got = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return null;
    return {
      testid: el.getAttribute("data-testid"),
      id: el.id === "" ? null : el.id,
      row: el.closest("[data-row-email]")?.getAttribute("data-row-email") ?? null,
    };
  }, selector);
  return got ?? { testid: null, id: null, row: null };
}

/** Identity of the required restore target, read BEFORE the action runs. */
export async function captureRestoreTarget(
  page: Page,
  control: ConfirmControl,
): Promise<CapturedTarget> {
  const got = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return null;
    return {
      testid: el.getAttribute("data-testid"),
      id: el.id === "" ? null : el.id,
      row: el.closest("[data-row-email]")?.getAttribute("data-row-email") ?? null,
    };
  }, control.restoreTargetSelector);
  expect(
    got,
    `${control.name}: the required restore target ${control.restoreTargetSelector} must exist BEFORE the confirm, or the assertion after it proves nothing`,
  ).not.toBeNull();
  return got!;
}

export async function measureConfirmPath(
  page: Page,
  control: ConfirmControl,
  settleMs = 3000,
): Promise<FocusReading[]> {
  const out: FocusReading[] = [];
  out.push(await readFocus(page, control.rootSelector, `${control.name}:before-arm`));

  await focusAndClick(rootLocator(page, control).getByTestId(control.trigger));
  const confirm = rootLocator(page, control).getByTestId(control.confirm);
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
  await focusAndClick(rootLocator(page, control).getByTestId(control.trigger));
  const cancel = rootLocator(page, control).getByTestId(control.cancel);
  await expect(cancel).toBeVisible();
  await focusAndClick(cancel);
  await page.waitForTimeout(settleMs);
  return readFocus(page, control.rootSelector, `${control.name}:control-after-cancel`);
}

/**
 * The assertions the round-1 review found MISSING, and it was right.
 *
 * The first version of this file asserted `readings.length` and that an
 * `armed` sample existed. Both are true of a run in which focus never moves at
 * all, so the case would have passed against every defect this arc exists to
 * repair — a probe that cannot fail is not evidence. What follows asserts the
 * FOCUSED ELEMENT at each step, which is the only thing under measurement.
 *
 * These are deliberately assertions about the CURRENT, DEFECTIVE behaviour, so
 * this file records the defect executably before the repair lands and flips
 * them. Each expectation carries the control name so a failure says which one.
 */
/**
 * `expected` carries TWO targets because the arms do not share one.
 *
 * Cancel restores to the TRIGGER; the settled focus goes to whatever the spec
 * names for that control, and for archive those are different elements
 * (`archive-show-button` versus `share-hub-kebab`). A single expected value
 * passes both arms only when a fixture happens to make them equal, which is a
 * fixture that cannot express the difference it is supposed to check.
 */
export function assertFocusReadings(
  readings: FocusReading[],
  expected: { readonly cancel: CapturedTarget; readonly settled: CapturedTarget },
): void {
  expect(readings.length, "every step must produce a reading").toBe(5);

  const at = (suffix: string): FocusReading => {
    const hit = readings.find((r) => r.at.endsWith(suffix));
    expect(hit, `no reading captured for step ${suffix}`).toBeDefined();
    return hit!;
  };

  // The CONTROL arm. Cancel restores focus to the trigger, and it is what makes
  // a confirm-path reading a finding rather than an observation: without it, a
  // component that never restores focus at all is indistinguishable from one
  // whose restore is broken only on confirm.
  const cancel = at(":control-after-cancel");
  expect(cancel.insideRoot, `${cancel.at}: cancel must restore focus inside the surface`).toBe(
    true,
  );
  expect(cancel.tag, `${cancel.at}: cancel must not strand focus on the document`).not.toBe("BODY");
  // R4 claims the cancel path is UNCHANGED, and "unchanged" means the trigger,
  // not merely something inside the surface. Compared against the target
  // captured before the action, for the same reason the settled assertion is:
  // an expectation taken from the readings could not discriminate.
  expect(
    { testid: cancel.testid, id: cancel.id, row: cancel.row },
    `${cancel.at}: cancel must restore focus to the trigger itself, not to another control in the surface`,
  ).toEqual(expected.cancel);

  // Arming focuses the SAFE control, not the destructive one.
  const armed = at(":armed");
  expect(armed.insideRoot, `${armed.at}: arming must focus inside the surface`).toBe(true);
  expect(armed.testid, `${armed.at}: arming must focus a real control`).not.toBeNull();

  // THE SUBJECT, asserted against a value supplied by the CALLER.
  //
  // Two earlier versions of this block proved nothing and both looked fine.
  // The first asserted a reading count and the presence of an `armed` sample —
  // true of a run where focus never moves. The second compared `settled.at` to
  // itself through `toMatchObject`, which passes for every possible input.
  // A self-referential expectation is the failure mode to watch for here: the
  // expected value must come from OUTSIDE the received object, which is why it
  // is a parameter rather than anything derived from `readings`.
  const settled = at(":settled");
  expect(settled.tag, `${settled.at}: focus must not be stranded on the document`).not.toBe("BODY");
  expect(
    { testid: settled.testid, id: settled.id, row: settled.row },
    `${settled.at}: settled focus must land on the target captured BEFORE the action`,
  ).toEqual(expected.settled);
}
