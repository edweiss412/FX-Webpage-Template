/**
 * scripts/capture-core.ts — shared browser-side determinism + encoding helpers
 * for screenshot capture scripts (help-screenshots.ts, gallery-screenshots.ts).
 *
 * Extracted verbatim from help-screenshots.ts (spec
 * docs/superpowers/specs/2026-07-26-gallery-screenshot-capture-design.md §3 item 1);
 * tests/help/capture-script.test.ts source-scans THIS file for the sharp encoder
 * settings, the disableAnimations body, and the waitForQuiescence recipe. Behavior
 * changes here move committed help-baseline bytes — the screenshots-drift workflow
 * path filter lists this file for that reason.
 */
import type { Page } from "@playwright/test";
import sharp from "sharp";

export type CaptureTheme = "light" | "dark";

export const DEFAULT_EXPECT_STABLE_MS = 500;

export async function installDeterminism(page: Page, theme: CaptureTheme): Promise<void> {
  await page.addInitScript((selectedTheme) => {
    document.documentElement.setAttribute("data-theme", selectedTheme);
  }, theme);

  await page.addInitScript(() => {
    class NoopWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      binaryType = "blob";
      bufferedAmount = 0;
      extensions = "";
      onclose: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: Event) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;
      protocol = "";
      readyState = NoopWebSocket.CLOSED;
      url = "";

      addEventListener(): void {}
      close(): void {}
      dispatchEvent(): boolean {
        return true;
      }
      removeEventListener(): void {}
      send(): void {}
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: NoopWebSocket,
    });
  });
}

// M11-F-D1: registered PRE-navigation via addInitScript (not a post-navigation
// style-tag injection) so a captured surface with an entrance animation (framer-motion
// initial/animate, CSS @keyframes, spinner) can never start animating during
// the goto→inject gap and hand the drift gate a mid-animation frame. The init
// script attaches the <style> the moment documentElement exists — before any
// element renders — falling back to a MutationObserver for documents where
// the root hasn't been created yet at init-script time.
export async function disableAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const css = `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `;
    const attach = () => {
      const style = document.createElement("style");
      style.setAttribute("data-screenshot-animation-suppression", "");
      style.textContent = css;
      (document.head ?? document.documentElement).appendChild(style);
    };
    if (document.documentElement) {
      attach();
    } else {
      new MutationObserver((_mutations, observer) => {
        if (document.documentElement) {
          attach();
          observer.disconnect();
        }
      }).observe(document, { childList: true });
    }
  });
}

export async function waitForQuiescence(
  page: Page,
  opts: { waitForSelector: string; stableMs?: number },
): Promise<void> {
  await page.locator(opts.waitForSelector).first().waitFor({ state: "visible" });
  await waitForPaintQuiescence(page, opts.stableMs ?? DEFAULT_EXPECT_STABLE_MS);
}

/**
 * Everything quiescence does AFTER the selector resolves.
 *
 * Split out so a caller can narrow a catch to the selector wait alone. Each
 * step here fails for its own reasons, and attributing one of them to a
 * missing selector is a mislabelled refusal.
 */
export async function waitForPaintQuiescence(page: Page, stableMs: number): Promise<void> {
  await page.waitForLoadState("networkidle");
  // M11-A-D5 recipe: networkidle does not guarantee fonts are rasterized or
  // the last layout/paint has flushed — on loaded CI runners the same content
  // captured different bytes run-to-run (needs-attention-mobile-dark, PR #22).
  // fonts.ready + a double-rAF flush pins the paint before the stable wait.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.waitForTimeout(stableMs);
}

export async function encodeWebp(pngBuffer: Buffer): Promise<Buffer> {
  return await sharp(pngBuffer)
    .webp({
      quality: 90,
      effort: 4,
      smartSubsample: true,
      nearLossless: false,
    })
    .toBuffer();
}
