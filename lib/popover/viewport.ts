/**
 * lib/popover/viewport.ts - the rectangle a popover may occupy, expressed in
 * the SAME coordinate space as getBoundingClientRect()
 * (spec docs/superpowers/specs/2026-07-24-hoverhelp-visual-viewport.md §4.1).
 *
 * Separate from lib/popover/position.ts on purpose: that module's contract is
 * pure placement algebra with no environment reads. This one reads the window,
 * so it takes the window as a parameter and tests inject a plain stub.
 */
import type { Rect } from "@/lib/popover/position";

const finiteOr0 = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * `CSS` is a global var in lib.dom, NOT a property of the `Window` interface
 * (tsc: "Property 'CSS' does not exist on type 'Window'"), so it is read
 * structurally off the injected window. An engine without `CSS.supports` takes
 * the non-WebKit branch, which is correct for every such engine.
 */
type CssCarrier = { CSS?: { supports?: (property: string, value: string) => boolean } };

const isWebKit = (win: Window): boolean => {
  const css = (win as Window & CssCarrier).CSS;
  return typeof css?.supports === "function" && css.supports("-webkit-backdrop-filter", "none");
};

function layoutRect(win: Window): Rect {
  const width = win.innerWidth;
  const height = win.innerHeight;
  return { left: 0, top: 0, width, height, right: width, bottom: height };
}

/**
 * ENGINE question, answered once per effect run: may we subscribe at all?
 * Says NOTHING about current dimensions (spec R13) - a viewport reporting zero
 * size at open must still be subscribed to, or the `resize` that would restore
 * tracking can never arrive.
 */
export function isVisualViewportEngine(win: Window): boolean {
  return !isWebKit(win) && !!win.visualViewport;
}

/** Today's rect: the LAYOUT viewport at the client origin. */
export function layoutViewportRect(win: Window): Rect {
  return layoutRect(win);
}

/**
 * The visible slice in getBoundingClientRect space, or null when this engine or
 * this instant has no usable one (WebKit exclusion R5, degenerate dimensions).
 * Callers treat null as "use the layout viewport".
 */
export function visualViewportRect(win: Window): Rect | null {
  if (!isVisualViewportEngine(win)) return null;
  const vv = win.visualViewport;
  if (!vv) return null;
  const { width, height } = vv;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const left = finiteOr0(vv.offsetLeft);
  const top = finiteOr0(vv.offsetTop);
  return { left, top, width, height, right: left + width, bottom: top + height };
}
