/**
 * tests/e2e/helpers/crewSplitContainer.ts: the crew section grids' container
 * rule, for real-browser layout specs.
 *
 * A crew section body's one-to-two-column switches read the width of the
 * element that bounds the body (`@container`: the sheet body and each wide
 * stacked section; the Today block is not one), never the viewport (DESIGN.md
 * §6). The rule a spec asserts is therefore "two columns exactly when that
 * container's content box is at least the threshold", and both sides of it are
 * measured here: the threshold from its one definition in app/globals.css, the
 * width from the live container.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator } from "@playwright/test";

/** `--container-crew-split` from app/globals.css, in px. */
export const CREW_SPLIT_PX: number = (() => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const m = /--container-crew-split:\s*(\d+(?:\.\d+)?)px\s*;/.exec(css);
  if (!m) throw new Error("app/globals.css declares no `--container-crew-split: <n>px`");
  return Number(m[1]);
})();

export type SplitContainer = {
  /** The container's content-box width (padding and scrollbar excluded), px. */
  width: number;
  /** Its `data-testid`, so a spec can pin WHICH element answered the query. */
  testid: string | null;
  /** `width >= CREW_SPLIT_PX`: whether the grids inside lay out split. */
  split: boolean;
};

/**
 * The size container that `carrier` (the element whose classes carry
 * `@min-crew-split:`) resolves its queries against: its nearest ANCESTOR with a
 * non-`normal` computed `container-type`. A container never queries itself, so
 * the walk starts at the parent. Throws when there is none: a grid with no
 * container never splits, and that has to read as a failure, not as "narrow".
 */
export async function splitContainerOf(carrier: Locator): Promise<SplitContainer> {
  const found = await carrier.evaluate((el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.containerType && cs.containerType !== "normal") {
        return {
          width:
            n.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0),
          testid: n.getAttribute("data-testid"),
        };
      }
    }
    return null;
  });
  if (found === null) {
    throw new Error("no size container above the grid: `@min-crew-split:` can never apply");
  }
  return { ...found, split: found.width >= CREW_SPLIT_PX };
}

type Box = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

async function boxOf(locator: Locator): Promise<Box> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  });
}

/**
 * The two-column rule on one pair of grid children, `first` and `second` (DOM
 * order, both direct children of the grid). Their grid's container decides the
 * branch, and the pair must match it: split means side by side with non-zero
 * widths, not split means stacked on one shared left edge. `expected` is what
 * the caller's leg is FOR (the wide column, the sheet): a container on the
 * other side of the threshold fails the leg, because the branch asserted would
 * not be the one the leg exists to cover.
 */
export async function expectColumnsFollowSplit(
  first: Locator,
  second: Locator,
  expected: { split: boolean; container: string; label: string; tolPx: number },
): Promise<{ container: SplitContainer; a: Box; b: Box }> {
  const container = await splitContainerOf(first.locator(".."));
  const { label, tolPx } = expected;
  expect(container.testid, `${label}: the grid's size container`).toBe(expected.container);
  expect(
    container.split,
    `${label}: container ${expected.container} is ${container.width}px against the ` +
      `${CREW_SPLIT_PX}px split threshold, so split=${container.split}; this leg covers split=${expected.split}`,
  ).toBe(expected.split);
  const a = await boxOf(first);
  const b = await boxOf(second);
  if (container.split) {
    expect(b.left, `${label}: split columns sit side by side`).toBeGreaterThan(a.left + 1);
    expect(a.width, `${label}: left column width`).toBeGreaterThan(1);
    expect(b.width, `${label}: right column width`).toBeGreaterThan(1);
  } else {
    expect(
      b.top,
      `${label}: unsplit columns stack (col2.top ${b.top} >= col1.bottom ${a.bottom})`,
    ).toBeGreaterThanOrEqual(a.bottom - tolPx);
    expect(
      Math.abs(a.left - b.left),
      `${label}: unsplit columns share a left edge (${a.left} vs ${b.left})`,
    ).toBeLessThanOrEqual(tolPx);
    expect(
      Math.abs(a.width - b.width),
      `${label}: unsplit columns are one track wide (${a.width} vs ${b.width})`,
    ).toBeLessThanOrEqual(tolPx);
  }
  return { container, a, b };
}
