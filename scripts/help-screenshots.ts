import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { CAPTURE_LAUNCH_ARGS } from "./capture-launch-args";
import {
  type CaptureTheme,
  disableAnimations,
  encodeWebp,
  installDeterminism,
  waitForQuiescence,
} from "./capture-core";
import { MANIFEST, type ManifestEntry } from "./help-screenshots.manifest";
import { parseFixtureDateRangeFromPath } from "./help-screenshots-fixture-range";
import { ADMIN_FIXTURE } from "@/tests/e2e/helpers/fixtures";
import { signInAs } from "@/tests/e2e/helpers/signInAs";

const DEFAULT_BASE_URL = "http://localhost:3004";
const OUTPUT_DIR = join(process.cwd(), "public/help/screenshots");
const REQUIRED_TEST_AUTH = "true";

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

async function screenshotPng(page: Page, entry: ManifestEntry): Promise<Buffer> {
  if (entry.captureSelector) {
    return await page.locator(entry.captureSelector).first().screenshot({ type: "png" });
  }
  return await page.screenshot({ type: "png", fullPage: true });
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
    await waitForQuiescence(page, {
      waitForSelector: entry.waitFor ?? entry.captureSelector ?? "body",
      ...(entry.expectStableMs !== undefined ? { stableMs: entry.expectStableMs } : {}),
    });

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

  // This launch produces the drift-gated WebPs — Playwright config
  // launchOptions do NOT reach it, so the determinism args must be consumed
  // here directly (shared constant; Codex R2 finding on PR #22).
  const browser = await chromium.launch({
    args: CAPTURE_LAUNCH_ARGS,
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
