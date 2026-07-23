/**
 * lib/devcapture/captureElement.ts — §3.1 capture contract. Library and the
 * exact clone-override list per the Task 1 spike (SPIKE.md): html2canvas won
 * the sentinel scan; both foreignObject engines rendered blank on this app's
 * CSS. Client-only; html2canvas loads via dynamic import so the 360 kB dep
 * never enters the admin bundle until a developer actually captures.
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
  const { default: html2canvas } = await import("html2canvas");
  const clone = el.cloneNode(true) as HTMLElement;
  const width = el.getBoundingClientRect().width;
  clone.style.maxHeight = "none";
  clone.style.height = "auto";
  // The panel ships overflow-clip; without lifting it, spilled inner-pane
  // content clips at the panel box (SPIKE.md operational finding).
  clone.style.overflow = "visible";
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
