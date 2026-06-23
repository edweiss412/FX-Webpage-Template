import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { MANIFEST } from "@/scripts/help-screenshots.manifest";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

const BASE_URL = "http://localhost:3004";
const BROWSER_CLOCK = "2026-03-23T12:00:00.000Z";
// A known-valid instant (the manifest's preview capture instant) used ONLY to
// read which schedule days the preview crew member can see. The two assertion
// instants are DERIVED from those visible days, so the test can't drift when the
// seed's show dates or the crew member's date restriction change (the old
// hardcoded 2026-03-22 predated the show's first day once the seed shifted).
const DERIVE_INSTANT = "2026-03-24T15:00:00.000Z";
const OUT_DIR = join(process.cwd(), "tmp", "screenshots-clock-pipeline");

const previewEntry = MANIFEST.find((entry) => entry.key === "preview-as-crew-banner");
if (!previewEntry) {
  throw new Error("preview-as-crew-banner manifest entry is required for F.9");
}
const previewUrl = new URL(previewEntry.route, BASE_URL).toString();
// The crew redesign replaced the flat tile scroll with a 6-section sub-nav, so
// the schedule day cards (whose today-marking proves the frozen clock reached
// the server render) only render under ?s=schedule, not on the default Today
// section. All requests here target the schedule section explicitly.
const scheduleUrl = `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}s=schedule`;

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

// Every schedule-day wrapper carries data-day="<iso>" regardless of today-marking.
// Returns the distinct visible days in render order (the preview crew member's
// date restriction may narrow the show's full span to a subset).
function extractVisibleDays(html: string): string[] {
  const tagRe = /<[a-zA-Z][^>]*\bdata-testid=["']schedule-day[^"']*["'][^>]*>/g;
  const days: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    const dayMatch = match[0].match(/\bdata-day=["']([^"']+)["']/);
    if (dayMatch?.[1] && !days.includes(dayMatch[1])) days.push(dayMatch[1]);
  }
  return days;
}

async function serverHtmlAt(page: Page, cookieHeader: string, instant: string): Promise<string> {
  const res = await page.request.get(scheduleUrl, {
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
  return body;
}

async function serverRenderedTodayAt(
  page: Page,
  cookieHeader: string,
  instant: string,
): Promise<string> {
  return extractTodayDataDay(await serverHtmlAt(page, cookieHeader, instant), instant);
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
  await page.goto(scheduleUrl, { waitUntil: "domcontentloaded" });
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

  // Derive two real visible schedule days, then prove the frozen clock moves the
  // today-marking to each (a card is only marked today when its date is BOTH
  // visible to this crew member AND equal to the frozen "now").
  const visibleDays = extractVisibleDays(await serverHtmlAt(page, cookieHeader, DERIVE_INSTANT));
  expect(
    visibleDays.length,
    `expected >=2 visible schedule days to compare; got [${visibleDays.join(", ")}]`,
  ).toBeGreaterThanOrEqual(2);
  const firstDay = visibleDays[0]!;
  const lastDay = visibleDays[visibleDays.length - 1]!;
  expect(firstDay).not.toBe(lastDay);

  const firstInstant = `${firstDay}T15:00:00.000Z`;
  const lastInstant = `${lastDay}T15:00:00.000Z`;

  const firstToday = await serverRenderedTodayAt(page, cookieHeader, firstInstant);
  const lastToday = await serverRenderedTodayAt(page, cookieHeader, lastInstant);

  expect(firstToday).toBe(firstDay);
  expect(lastToday).toBe(lastDay);
  expect(firstToday).not.toBe(lastToday);

  const firstWebp = await captureWebpAt(page, firstInstant, "first-day");
  const lastWebp = await captureWebpAt(page, lastInstant, "last-day");

  expect(firstWebp.equals(lastWebp)).toBe(false);
});
