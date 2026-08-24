import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SELECTOR_ABSENT, SelectorAbsentError, quiesceWithLayer0 } from "@/scripts/capture-layer0";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function pageWith(html: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent(html);
  return page;
}

const FAST = { selectorTimeoutMs: 700, stableMs: 1 };

/**
 * Await a call expected to REFUSE, and return the refusal.
 *
 * `.catch(e => e as SelectorAbsentError)` types as `void | SelectorAbsentError`
 * — and worse, a call that wrongly RESOLVED would flow through it as
 * `undefined` and fail later on a property read rather than on the thing that
 * went wrong. This fails on the resolve itself.
 */
async function refusalFrom(call: Promise<void>): Promise<SelectorAbsentError> {
  try {
    await call;
  } catch (error: unknown) {
    return error as SelectorAbsentError;
  }
  throw new Error("expected a refusal, but the call resolved");
}

describe("trigger 1 — the capture selector never appears, so quiescence times out", () => {
  it("throws SelectorAbsentError naming the missing selector", async () => {
    const page = await pageWith(`<main><p>replaced</p></main>`);
    await expect(
      quiesceWithLayer0(page, { waitForSelector: "#never", captureSelector: "#never", ...FAST }),
    ).rejects.toThrow(SelectorAbsentError);
    await page.close();
  });

  // The failure this catches: Playwright times out first and names no entry
  // key, no theme and no reason -- the one outcome most in need of evidence
  // leaves none.
  it("carries refusedReason selector-absent and the selector", async () => {
    const page = await pageWith(`<main><p>replaced</p></main>`);
    const error = await refusalFrom(
      quiesceWithLayer0(page, {
        waitForSelector: "#never",
        captureSelector: "#never",
        ...FAST,
      }),
    );

    expect(error).toBeInstanceOf(SelectorAbsentError);
    expect(error.refusedReason).toBe(SELECTOR_ABSENT);
    expect(error.selector).toBe("#never");
    await page.close();
  });

  it("scans the DOCUMENT for markers, since the subtree it would scan is absent", async () => {
    const page = await pageWith(
      `<main><div data-render-fault="admin-preview-infra-error">Unavailable</div></main>`,
    );
    const error = await refusalFrom(
      quiesceWithLayer0(page, {
        waitForSelector: "#never",
        captureSelector: "#never",
        ...FAST,
      }),
    );

    expect(error.markers).toEqual(["admin-preview-infra-error"]);
    await page.close();
  });

  it("still attributes an UNMARKED replacement as selector-absent", async () => {
    const page = await pageWith(`<main><p>an unmarked replacement</p></main>`);
    const error = await refusalFrom(
      quiesceWithLayer0(page, {
        waitForSelector: "#never",
        captureSelector: "#never",
        ...FAST,
      }),
    );

    expect(error.refusedReason).toBe(SELECTOR_ABSENT);
    expect(error.markers).toEqual([]);
    await page.close();
  });
});

describe("trigger 2 — waitFor succeeds while the capture selector is still absent", () => {
  // waitFor takes precedence in quiescence resolution, so ONE ordinary manifest
  // edit -- waitFor: "body" on an entry whose captureSelector is a page-specific
  // testid -- makes the wait SUCCEED under the very replacement fault layer 0
  // exists for. The timeout never fires, so a catch around the wait writes
  // nothing. Every other test in this file passes without this trigger.
  it("throws SelectorAbsentError even though quiescence succeeded", async () => {
    const page = await pageWith(`<body><main><p>replaced</p></main></body>`);
    const error = await refusalFrom(
      quiesceWithLayer0(page, {
        waitForSelector: "body",
        captureSelector: '[data-testid="admin-preview-banner"]',
        ...FAST,
      }),
    );

    expect(error).toBeInstanceOf(SelectorAbsentError);
    expect(error.refusedReason).toBe(SELECTOR_ABSENT);
    expect(error.selector).toBe('[data-testid="admin-preview-banner"]');
    await page.close();
  });

  it("reports document markers through trigger 2 as well", async () => {
    const page = await pageWith(
      `<body><main><div data-render-fault="admin-layout-blank"></div></main></body>`,
    );
    const error = await refusalFrom(
      quiesceWithLayer0(page, {
        waitForSelector: "body",
        captureSelector: "#gone",
        ...FAST,
      }),
    );

    expect(error.markers).toEqual(["admin-layout-blank"]);
    await page.close();
  });

  it("resolves normally when both the wait and the capture selector are present", async () => {
    const page = await pageWith(`<body><main data-testid="ok"><p>fine</p></main></body>`);
    await expect(
      quiesceWithLayer0(page, {
        waitForSelector: "body",
        captureSelector: '[data-testid="ok"]',
        ...FAST,
      }),
    ).resolves.toBeUndefined();
    await page.close();
  });

  it("resolves normally when the entry has no capture selector at all", async () => {
    const page = await pageWith(`<body><main><p>fine</p></main></body>`);
    await expect(
      quiesceWithLayer0(page, { waitForSelector: "body", ...FAST }),
    ).resolves.toBeUndefined();
    await page.close();
  });
});

describe("the catch is NARROWED to the selector wait, not wrapped around the function", () => {
  // waitForQuiescence can also fail at networkidle, at the page.evaluate step
  // and at the stable wait. An implementation catching the whole rejection and
  // always recording selector-absent passes every assertion above while
  // mislabelling every later failure -- attributing a network fault to a
  // missing selector.
  it("does not label a failure AFTER the selector resolved as selector-absent", async () => {
    const page = await pageWith(`<body><main data-testid="ok"><p>fine</p></main></body>`);
    // The selector resolves, then the page is torn out from under the later
    // stages, so the rejection originates past the selector wait.
    const pending = quiesceWithLayer0(page, {
      waitForSelector: "body",
      captureSelector: '[data-testid="ok"]',
      selectorTimeoutMs: 700,
      stableMs: 4_000,
    });
    await page.close();

    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SelectorAbsentError);
    expect((error as { refusedReason?: string }).refusedReason).toBeUndefined();
  });
});
