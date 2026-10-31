import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RenderFaultError, captureOrRefuse } from "@/scripts/capture-refusal";
import { rejectionFrom } from "./_expectRejection";

let browser: Browser;
let out: string;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), "capture-refusal-"));
});

afterEach(() => {
  rmSync(out, { recursive: true, force: true });
});

async function pageWith(html: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent(html);
  return page;
}

const ENTRY = {
  key: "dashboard-overview",
  captureSelector: '[data-testid="root"]',
  // Every manifest entry carries one, and the evidence entry records it per
  // spec section 5, so the fixture has to supply it too.
  frozenClockInstant: "2026-03-24T15:00:00.000Z",
};

describe("a marked fault refuses BEFORE anything is written", () => {
  // The failure this catches: placing the check after encodeWebp/writeFile
  // still overwrites the baseline before failing. Asserting only that the
  // function throws passes against that ordering.
  it("writes no file", async () => {
    const page = await pageWith(
      `<main data-testid="root"><div data-render-fault="dashboard-load"></div></main>`,
    );
    await expect(captureOrRefuse(page, ENTRY, "light", out)).rejects.toThrow(RenderFaultError);

    expect(readdirSync(out)).toEqual([]);
    await page.close();
  });

  it("does not overwrite a file that is already there", async () => {
    const existing = join(out, "dashboard-overview-light.webp");
    writeFileSync(existing, "committed-baseline-bytes");
    const page = await pageWith(
      `<main data-testid="root"><div data-render-fault="dashboard-load"></div></main>`,
    );

    await expect(captureOrRefuse(page, ENTRY, "light", out)).rejects.toThrow(RenderFaultError);

    // The realistic shape: the capture overwrites in place, so "no new file"
    // is not the assertion -- unchanged BYTES are. A check-after-write
    // implementation leaves the file present and DIFFERENT, which a
    // directory listing cannot see.
    expect(readFileSync(existing, "utf8")).toBe("committed-baseline-bytes");
    await page.close();
  });

  it("names the entry key, the theme and every reason", async () => {
    const page = await pageWith(
      `<main data-testid="root">
        <div data-render-fault="dashboard-load"></div>
        <div data-render-fault="ignored-sheets-read"></div>
      </main>`,
    );
    const error = await rejectionFrom<RenderFaultError>(
      captureOrRefuse(page, ENTRY, "dark", out),
      "captureOrRefuse on a marked fault",
    );

    expect(error.message).toContain("dashboard-overview");
    expect(error.message).toContain("dark");
    expect(error.reasons.sort()).toEqual(["dashboard-load", "ignored-sheets-read"]);
    await page.close();
  });
});

describe("a clean capture still writes", () => {
  it("produces the file", async () => {
    const page = await pageWith(`<main data-testid="root"><p>healthy</p></main>`);
    await captureOrRefuse(page, ENTRY, "light", out);

    expect(existsSync(join(out, "dashboard-overview-light.webp"))).toBe(true);
    await page.close();
  });

  // AC-7: data-degraded is a live product state on the crew hero, and a
  // presence selector on the wrong attribute would refuse a healthy
  // crew-preview-today-mobile capture on every run.
  it("does not refuse a surface rendering data-degraded", async () => {
    // The degraded marker sits on an element with real content: an empty div
    // gives the capture root zero height, and Playwright's element screenshot
    // then waits for an actionability it never reaches. That stall is a
    // fixture artifact, not the behavior under test.
    const page = await pageWith(
      `<main data-testid="root"><div data-degraded="false"><p>healthy product state</p></div></main>`,
    );
    await captureOrRefuse(page, ENTRY, "light", out);

    expect(existsSync(join(out, "dashboard-overview-light.webp"))).toBe(true);
    await page.close();
  });
});

// Screenshots-drift on PR #984: crew-preview-gear-mobile-dark captured the open
// section sheet at two heights on the same commit. The element screenshot scrolls
// its target into view, the sheet's height cap follows the preview banner's bottom
// edge, and a scroll listener republishes that edge a frame later, so the bytes
// depended on which side of that frame the shot landed. The capture must settle
// after its own scroll. The fixture reacts 100ms after a scroll, so a shot taken
// right after the scroll reliably lands before it.
describe("the capture settles after scrolling its target into view", () => {
  it("captures the page's settled reaction to that scroll", async () => {
    const page = await pageWith(`
      <body style="margin:0">
        <header style="height:200px;background:#888"></header>
        <main data-testid="root" style="height:2000px;background:rgb(255,255,255)"></main>
        <script>
          let reacted = false;
          addEventListener("scroll", () => {
            if (reacted) return;
            reacted = true;
            setTimeout(() => {
              document.querySelector("main").style.background = "rgb(0,0,0)";
            }, 100);
          }, { passive: true });
        </script>
      </body>`);
    await captureOrRefuse(page, ENTRY, "light", out);

    const { data } = await sharp(readFileSync(join(out, "dashboard-overview-light.webp")))
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Premise: the page did scroll, so the fixture exercised the reaction at all.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // The first pixel is the capture root's own background: black once settled.
    expect([data[0], data[1], data[2]]).toEqual([0, 0, 0]);
    await page.close();
  });
});
