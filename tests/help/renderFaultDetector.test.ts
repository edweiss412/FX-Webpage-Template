import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectRenderFaults } from "@/scripts/capture-render-fault";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function load(html: string): Promise<void> {
  await page.setContent(html);
}

describe("detectRenderFaults finds marked faults inside the captured subtree", () => {
  it("returns no hits on a clean subtree", async () => {
    await load(`<main data-testid="root"><p>All good</p></main>`);
    expect(await detectRenderFaults(page, '[data-testid="root"]')).toEqual([]);
  });

  it("reports the attribute value as the reason", async () => {
    await load(
      `<main data-testid="root"><div data-render-fault="recent-auto-applied-infra">Unavailable</div></main>`,
    );
    expect(await detectRenderFaults(page, '[data-testid="root"]')).toEqual([
      "recent-auto-applied-infra",
    ]);
  });

  it("reports every hit, not just the first", async () => {
    await load(`<main data-testid="root">
      <div data-render-fault="a"></div>
      <div data-render-fault="b"></div>
    </main>`);
    expect((await detectRenderFaults(page, '[data-testid="root"]')).sort()).toEqual(["a", "b"]);
  });

  // Spec section 4.5: an empty attribute value is a hit, not a miss. An
  // implementation filtering on truthiness drops it silently.
  it("treats an empty attribute value as a hit reading (unspecified)", async () => {
    await load(`<main data-testid="root"><div data-render-fault=""></div></main>`);
    expect(await detectRenderFaults(page, '[data-testid="root"]')).toEqual(["(unspecified)"]);
  });
});

describe("the scope is the captured subtree, in both directions", () => {
  // Too wide fires on chrome the gate never captures; too narrow misses the
  // card. Both directions are asserted because each passes the other's test.
  it("ignores a marked element OUTSIDE the captured subtree", async () => {
    await load(`<header data-render-fault="outside-chrome"></header>
      <main data-testid="root"><p>Clean</p></main>`);
    expect(await detectRenderFaults(page, '[data-testid="root"]')).toEqual([]);
  });

  it("finds a marked element nested deep INSIDE the captured subtree", async () => {
    await load(`<main data-testid="root"><section><div><span>
      <em data-render-fault="deep"></em></span></div></section></main>`);
    expect(await detectRenderFaults(page, '[data-testid="root"]')).toEqual(["deep"]);
  });

  it("finds the fault when the ROOT ITSELF carries the attribute", async () => {
    await load(`<main data-testid="root" data-render-fault="root-replaced"></main>`);
    expect(await detectRenderFaults(page, '[data-testid="root"]')).toEqual(["root-replaced"]);
  });
});

describe("an undefined root means the document, and is its own case", () => {
  // captureSelector is optional and the capture falls back to the full page.
  // Treating undefined as "empty root" finds nothing and silently passes every
  // other case here; throwing fails every one. Both are pinned out.
  it("scans the whole document when no root selector is given", async () => {
    await load(`<header data-render-fault="chrome"></header><main><p>x</p></main>`);
    expect(await detectRenderFaults(page)).toEqual(["chrome"]);
  });

  it("returns no hits on a clean document when no root selector is given", async () => {
    await load(`<header></header><main><p>x</p></main>`);
    expect(await detectRenderFaults(page)).toEqual([]);
  });
});

describe("a root that is PRESENT but matches nothing is not a clean root", () => {
  // "No root" and "clean root" must never be one answer -- that collapse is
  // exactly the replacement-class fault layer 0 exists for.
  it("throws rather than returning no hits", async () => {
    await load(`<main data-testid="root"><p>x</p></main>`);
    await expect(detectRenderFaults(page, '[data-testid="absent"]')).rejects.toThrow(
      /\[data-testid="absent"\]/,
    );
  });
});

describe("data-degraded is a different attribute and a legitimate product state", () => {
  // AC-7. A presence selector on the wrong attribute refuses a healthy
  // crew-preview-today-mobile capture on every run.
  it("does not fire on data-degraded='false'", async () => {
    await load(`<main data-testid="root"><div data-degraded="false"></div></main>`);
    expect(await detectRenderFaults(page, '[data-testid="root"]')).toEqual([]);
  });

  it("does not fire on data-degraded with a truthy product value", async () => {
    await load(`<main data-testid="root"><div data-degraded="viewer_unconfirmed"></div></main>`);
    expect(await detectRenderFaults(page, '[data-testid="root"]')).toEqual([]);
  });
});
