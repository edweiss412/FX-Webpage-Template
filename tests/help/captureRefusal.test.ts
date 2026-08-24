import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RenderFaultError, captureOrRefuse } from "@/scripts/capture-refusal";

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

const ENTRY = { key: "dashboard-overview", captureSelector: '[data-testid="root"]' };

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
    const error = await captureOrRefuse(page, ENTRY, "dark", out).catch(
      (e: unknown) => e as RenderFaultError,
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
