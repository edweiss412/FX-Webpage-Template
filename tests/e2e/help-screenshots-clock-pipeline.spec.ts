import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { MANIFEST } from "@/scripts/help-screenshots.manifest";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

const BASE_URL = "http://localhost:3004";
const BROWSER_CLOCK = "2026-03-23T12:00:00.000Z";
const PRE_SHOW_INSTANT = "2026-03-22T15:00:00.000Z";
const MID_SHOW_INSTANT = "2026-03-24T15:00:00.000Z";
const OUT_DIR = join(process.cwd(), "tmp", "screenshots-clock-pipeline");

const previewEntry = MANIFEST.find((entry) => entry.key === "preview-as-crew-banner");
if (!previewEntry) {
  throw new Error("preview-as-crew-banner manifest entry is required for F.9");
}
const previewUrl = new URL(previewEntry.route, BASE_URL).toString();

async function cookieHeaderFor(page: Page): Promise<string> {
  const cookies = await page.context().cookies(BASE_URL);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function extractTodayDataDay(html: string, instant: string): string {
  // The crew ScheduleSection (which replaced the old ScheduleTile <li> list)
  // marks the frozen-clock "today" card on a <div> wrapper carrying
  // data-testid="schedule-day-today" + data-day="<iso>" + data-today="true".
  // Scan every schedule-day* wrapper tag, pick the one flagged today, read its date.
  const tagRe = /<[a-zA-Z][^>]*\bdata-testid=["']schedule-day[^"']*["'][^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    const tag = match[0];
    if (!/\bdata-today=["']true["']/.test(tag)) continue;
    const dayMatch = tag.match(/\bdata-day=["']([^"']+)["']/);
    if (dayMatch?.[1]) return dayMatch[1];
  }

  throw new Error(
    `no schedule-day wrapper with data-today="true" data-day="..." found in initial HTML for ${instant}`,
  );
}

async function serverRenderedTodayAt(
  page: Page,
  cookieHeader: string,
  instant: string,
): Promise<string> {
  const res = await page.request.get(previewUrl, {
    headers: {
      "X-Screenshot-Frozen-Now": instant,
      Authorization: `Bearer ${process.env.TEST_AUTH_SECRET}`,
      Cookie: cookieHeader,
    },
  });
  const body = await res.text();
  expect(
    res.ok(),
    `${instant}: expected raw server response 2xx, got ${res.status()} ${res.statusText()} body: ${body.slice(0, 500)}`,
  ).toBe(true);

  return extractTodayDataDay(body, instant);
}

async function disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
}

async function captureWebpAt(page: Page, instant: string, name: string): Promise<Buffer> {
  await page.setExtraHTTPHeaders({
    "X-Screenshot-Frozen-Now": instant,
    Authorization: `Bearer ${process.env.TEST_AUTH_SECRET}`,
  });
  await page.goto(previewUrl, { waitUntil: "domcontentloaded" });
  await disableAnimations(page);
  await page.locator('[data-testid="schedule-day-today"][data-today="true"]').first().waitFor();
  await page.waitForLoadState("networkidle");

  const png = await page.screenshot({ type: "png", fullPage: true });
  const webp = await sharp(png)
    .webp({
      quality: 90,
      effort: 4,
      smartSubsample: true,
      nearLossless: false,
    })
    .toBuffer();

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, `${name}.webp`), webp);
  return webp;
}

test("X-Screenshot-Frozen-Now reaches server render and changes full capture output", async ({
  page,
}) => {
  await page.context().clock.install({ time: new Date(BROWSER_CLOCK) });
  await signInAs(page, ADMIN_FIXTURE, { baseUrl: BASE_URL });
  const cookieHeader = await cookieHeaderFor(page);
  expect(cookieHeader, "signInAs must leave cookies for the raw HTML request").not.toBe("");

  const preShowToday = await serverRenderedTodayAt(page, cookieHeader, PRE_SHOW_INSTANT);
  const midShowToday = await serverRenderedTodayAt(page, cookieHeader, MID_SHOW_INSTANT);

  expect(preShowToday).toBe("2026-03-22");
  expect(midShowToday).toBe("2026-03-24");
  expect(preShowToday).not.toBe(midShowToday);

  const preShowWebp = await captureWebpAt(page, PRE_SHOW_INSTANT, "pre-show");
  const midShowWebp = await captureWebpAt(page, MID_SHOW_INSTANT, "mid-show");

  expect(preShowWebp.equals(midShowWebp)).toBe(false);
});
