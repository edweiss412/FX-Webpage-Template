import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { MANIFEST, type ManifestEntry, type ScreenshotTheme } from "./help-screenshots.manifest";
import { parseFixtureDateRangeFromPath } from "./help-screenshots-fixture-range";
import { ADMIN_FIXTURE } from "@/tests/e2e/helpers/fixtures";
import { signInAs } from "@/tests/e2e/helpers/signInAs";

const DEFAULT_BASE_URL = "http://localhost:3004";
const DEFAULT_EXPECT_STABLE_MS = 500;
const OUTPUT_DIR = join(process.cwd(), "public/help/screenshots");
const REQUIRED_TEST_AUTH = "true";
type CaptureTheme = Exclude<ScreenshotTheme, "both">;

function requireCaptureEnv(): { baseUrl: string; testAuthSecret: string } {
  if (process.env.ENABLE_TEST_AUTH !== REQUIRED_TEST_AUTH) {
    throw new Error("ENABLE_TEST_AUTH=true is required before screenshot capture");
  }

  const testAuthSecret = process.env.TEST_AUTH_SECRET;
  if (!testAuthSecret) {
    throw new Error("TEST_AUTH_SECRET is required before screenshot capture");
  }

  return {
    baseUrl: process.env.SCREENSHOT_BASE_URL ?? DEFAULT_BASE_URL,
    testAuthSecret,
  };
}

function fixturePathFor(entry: ManifestEntry): string {
  const rawPath = join(process.cwd(), "fixtures/shows/raw", `${entry.fixture}.md`);
  if (existsSync(rawPath)) return rawPath;

  const pdfOnlyPath = join(process.cwd(), "fixtures/shows/pdf-only", `${entry.fixture}__INFO.md`);
  if (existsSync(pdfOnlyPath)) return pdfOnlyPath;

  throw new Error(
    `Fixture "${entry.fixture}" for screenshot "${entry.key}" was not found in raw/ or pdf-only/`,
  );
}

function validateFrozenClockInstant(entry: ManifestEntry): void {
  const frozen = new Date(entry.frozenClockInstant);
  if (Number.isNaN(frozen.getTime())) {
    throw new Error(`Invalid frozenClockInstant for ${entry.key}: ${entry.frozenClockInstant}`);
  }

  const range = parseFixtureDateRangeFromPath(fixturePathFor(entry));
  const latestExclusive = new Date(range.latest);
  latestExclusive.setUTCDate(latestExclusive.getUTCDate() + 1);
  if (frozen < range.earliest || frozen >= latestExclusive) {
    throw new Error(
      [
        `frozenClockInstant for ${entry.key} is outside fixture range`,
        `fixture=${entry.fixture}`,
        `instant=${entry.frozenClockInstant}`,
        `range=${range.earliest.toISOString()}..${range.latest.toISOString()}`,
      ].join(" "),
    );
  }
}

function themesFor(entry: ManifestEntry): CaptureTheme[] {
  if (entry.theme === "light" || entry.theme === "dark") return [entry.theme];
  return ["light", "dark"];
}

async function installDeterminism(page: Page, theme: CaptureTheme): Promise<void> {
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
async function disableAnimations(page: Page): Promise<void> {
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

async function waitForQuiescence(page: Page, entry: ManifestEntry): Promise<void> {
  const waitFor = entry.waitFor ?? entry.captureSelector ?? "body";
  await page.locator(waitFor).first().waitFor({ state: "visible" });
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
  await page.waitForTimeout(entry.expectStableMs ?? DEFAULT_EXPECT_STABLE_MS);
}

async function screenshotPng(page: Page, entry: ManifestEntry): Promise<Buffer> {
  if (entry.captureSelector) {
    return await page.locator(entry.captureSelector).first().screenshot({ type: "png" });
  }
  return await page.screenshot({ type: "png", fullPage: true });
}

async function encodeWebp(pngBuffer: Buffer): Promise<Buffer> {
  return await sharp(pngBuffer)
    .webp({
      quality: 90,
      effort: 4,
      smartSubsample: true,
      nearLossless: false,
    })
    .toBuffer();
}

async function captureEntryTheme(
  context: BrowserContext,
  entry: ManifestEntry,
  theme: CaptureTheme,
  baseUrl: string,
  testAuthSecret: string,
): Promise<void> {
  await context.clock.install({ time: new Date(entry.frozenClockInstant) });

  const page = await context.newPage();
  try {
    await installDeterminism(page, theme);
    await disableAnimations(page);
    await signInAs(page, ADMIN_FIXTURE, { baseUrl });
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": entry.frozenClockInstant,
      Authorization: `Bearer ${testAuthSecret}`,
    });
    await page.goto(new URL(entry.route, baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await waitForQuiescence(page, entry);

    const pngBuffer = await screenshotPng(page, entry);
    const webpBuffer = await encodeWebp(pngBuffer);
    const outPath = join(OUTPUT_DIR, `${entry.key}-${theme}.webp`);
    mkdirSync(dirname(outPath), { recursive: true });
    await writeFile(outPath, webpBuffer);
  } finally {
    await page.close();
  }
}

export async function captureAll(): Promise<void> {
  const { baseUrl, testAuthSecret } = requireCaptureEnv();
  for (const entry of MANIFEST) {
    validateFrozenClockInstant(entry);
  }

  const browser = await chromium.launch({
    args: ["--font-render-hinting=none", "--disable-skia-runtime-opts"],
  });

  try {
    for (const entry of MANIFEST) {
      for (const theme of themesFor(entry)) {
        const context = await browser.newContext({
          baseURL: baseUrl,
          colorScheme: theme,
          locale: "en-US",
          reducedMotion: "reduce",
          timezoneId: "America/New_York",
          viewport: entry.viewport,
        });
        try {
          await captureEntryTheme(context, entry, theme, baseUrl, testAuthSecret);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  await captureAll();
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.endsWith("scripts/help-screenshots.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
