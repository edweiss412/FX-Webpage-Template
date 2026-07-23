/**
 * lib/devcapture/captureElement.ts — §3.1 capture contract. Library and the
 * exact clone-override list per the Task 1 spike (SPIKE.md): html2canvas won
 * the sentinel scan; both foreignObject engines rendered blank on this app's
 * CSS. Shipped as html2canvas-pro (same engine, maintained fork) because
 * upstream 1.4.1 threw `unsupported color function "oklab"` on the
 * oklab-serialized color-mix() values Tailwind v4 opacity modifiers produce
 * (validation capture failure, 2026-07-23). Client-only; the library loads via
 * dynamic import so the ~360 kB dep never enters the admin bundle until a
 * developer actually captures.
 *
 * Clone-based: the live DOM's geometry, scroll positions, and styles are
 * never mutated. The offscreen clone lifts the panel's height cap AND its
 * overflow-clip AND both inner scroll panes' constraints so scroll-clipped
 * content appears fully (proof: sentinel e2e, tests/e2e/dev-capture.spec.ts).
 */

/** §3.1: DPR cap 2; non-finite DPR reaches the raster library as 1, never NaN
 * (meta-level 0-normalization protects only the metadata; this protects the
 * capture path). Exported for unit tests. */
export function capturePixelRatio(dpr: number): number {
  return Math.min(Number.isFinite(dpr) ? dpr : 1, 2);
}

const PANE_SELECTORS = [
  '[data-testid$="-review-rail"]',
  '[data-testid$="-review-content"]',
  '[data-testid$="-review-main"]',
];

export async function captureElementPng(el: HTMLElement): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const clone = el.cloneNode(true) as HTMLElement;
  const width = el.getBoundingClientRect().width;
  clone.style.maxHeight = "none";
  clone.style.height = "auto";
  // The panel ships overflow-clip; without lifting it, spilled inner-pane
  // content clips at the panel box (SPIKE.md operational finding).
  clone.style.overflow = "visible";
  // Entrance suppression: the clone keeps the panel's data attribute, so the
  // globals.css entrance keyframes (step3-details-pop-in starts at opacity 0)
  // replay on the fresh node — and replay AGAIN inside the raster library's
  // internal document copy, where computed opacity reads 0 at parse time and
  // the whole subtree rasterizes blank. Inline style outranks every entrance
  // rule (staged panels never stamp data-*-entrance="none"; published ones do).
  clone.style.animation = "none";
  clone.style.width = `${width}px`;
  clone.style.position = "fixed";
  clone.style.left = "-100000px";
  clone.style.top = "0";
  for (const sel of PANE_SELECTORS) {
    const pane = clone.querySelector(sel);
    if (pane instanceof HTMLElement) {
      pane.style.overflow = "visible";
      pane.style.maxHeight = "none";
      pane.style.height = "auto";
    }
  }
  document.body.appendChild(clone);
  try {
    const canvas = await html2canvas(clone, {
      scale: capturePixelRatio(window.devicePixelRatio),
    });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (blob === null) throw new Error("canvas.toBlob returned null (tainted or zero-size canvas)");
    return blob;
  } finally {
    clone.remove();
  }
}
