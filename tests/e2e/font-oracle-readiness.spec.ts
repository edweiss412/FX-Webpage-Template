/**
 * tests/e2e/font-oracle-readiness.spec.ts — deterministic reproduction + pins
 * for BL-FONT-CENSUS-ORACLE-FLAKE (M-wave 2 W-E2E Task E2, spec §2.4).
 *
 * DIAGNOSIS (the entry's own first step, answered): the oracle's element walk
 * and registered-face query used to run as TWO sequential `frame.evaluate`
 * calls. A frame that navigated or was removed BETWEEN them produced
 * walk-ok/faces-dead, which `observe()` recorded as `facesUnreadable` and
 * `enforce()` rightly refused with "the registered-face query failed on a
 * document the element walk could read". The document was never unreadable —
 * it was mid-navigation, and the two-phase sample split across two documents.
 * Row 1 reproduces that mechanism deterministically. The repair makes the
 * sample ATOMIC (one evaluate carrying both halves; helpers/
 * fontFidelityFixture.ts SAMPLE_SRC), and rows 2-4 pin the repaired contract
 * through the fixture's own exported seam (`sampleFrame` + `judgeSample` — the
 * same functions the vantages call, not copies).
 *
 * Fail-loud is NOT weakened: a LIVE document whose `document.fonts` API
 * genuinely fails still lands on the in-page sentinel, is still judged
 * `facesUnreadable`, and still fails the run (row 4).
 */
import { test, expect } from "@playwright/test";
import { judgeSample, sampleFrame } from "./helpers/fontFidelityFixture";

const FRAME_HTML = "<body><p style='font-family: serif'>oracle probe text</p></body>";

async function withTextIframe(
  page: import("@playwright/test").Page,
): Promise<import("@playwright/test").Frame> {
  await page.setContent(`<iframe srcdoc="${FRAME_HTML}"></iframe>`);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  if (!frame) throw new Error("iframe frame did not attach");
  await frame.waitForSelector("p");
  return frame;
}

test.describe("font oracle sampling (BL-FONT-CENSUS-ORACLE-FLAKE)", () => {
  test("row 1 — mechanism reproduction: a two-phase sample splits across a dying document", async ({
    page,
  }) => {
    // The OLD sequence, replayed literally: phase 1 (walk-shaped read) on a live
    // document, the document dies, phase 2 (face-shaped read) hits a destroyed
    // context. This is the flake's exact shape, forced deterministically — the
    // reason the sample must be atomic.
    const frame = await withTextIframe(page);
    const phase1 = await frame.evaluate(() => document.body.innerText).catch(() => null);
    expect(phase1, "phase 1 read a live document").toContain("oracle probe text");
    await page.evaluate(() => document.querySelector("iframe")?.remove());
    const phase2 = await frame
      .evaluate(() => [...document.fonts].length)
      .then(() => "readable" as const)
      .catch(() => "dead" as const);
    // Walk-ok + faces-dead: the un-repaired oracle recorded exactly this split
    // as facesUnreadable and failed the whole run on a healthy route.
    expect(phase2).toBe("dead");
  });

  test("row 2 — the atomic sample returns BOTH halves from one live document", async ({ page }) => {
    const frame = await withTextIframe(page);
    const sample = await sampleFrame(frame);
    expect(sample, "a live document yields a sample").not.toBeNull();
    expect(sample!.families, "the walk half saw the rendered text").toBeTruthy();
    expect(Array.isArray(sample!.faces), "the face half read the registry").toBe(true);
    const observation = judgeSample(sample, "e2-spec");
    expect(observation?.facesUnreadable, "a live readable document is never flagged").toBe(
      undefined,
    );
  });

  test("row 3 — a document that died under the sample is NOT recorded as unreadable", async ({
    page,
  }) => {
    const frame = await withTextIframe(page);
    await page.evaluate(() => document.querySelector("iframe")?.remove());
    const sample = await sampleFrame(frame);
    // The whole atomic sample fails together → null → judgeSample records
    // nothing. Under the old two-phase sequence this scenario could land as
    // walk-ok/faces-dead (row 1) and fail the run.
    expect(sample).toBeNull();
    expect(judgeSample(sample, "e2-spec")).toBeNull();
  });

  test("row 4 — fail-loud preserved: a LIVE document with a broken fonts API is still flagged", async ({
    page,
  }) => {
    await page.setContent(FRAME_HTML.replace(/&quot;/g, '"'));
    await page.waitForSelector("p");
    // Sabotage AFTER content, in the same context the sample will read (probed:
    // addInitScript does not fire on a setContent document in this build, and
    // the FontFaceSet GLOBAL is absent while document.fonts exists — so the
    // reachable, persistent seam is the live instance's prototype method the
    // sample's face read actually calls).
    await page.evaluate(() => {
      Object.getPrototypeOf(document.fonts).forEach = () => {
        throw new Error("sabotaged for the E2 fail-loud pin");
      };
    });
    const sample = await sampleFrame(page);
    expect(sample, "the atomic sample still resolves on a live document").not.toBeNull();
    expect(sample!.faces, "the in-page sentinel marks the API failure").toBe("FACES_UNREADABLE");
    const observation = judgeSample(sample, "e2-spec");
    expect(
      observation?.facesUnreadable,
      "a live document whose face query fails is STILL flagged — enforce() will throw",
    ).toBe(true);
  });

  test("row 5 — a live TEXTLESS document with a broken fonts API is still flagged", async ({
    page,
  }) => {
    // Review r3 F1: the flag was gated on `families` being truthy, so a live
    // document with NO rendered text whose face query failed was recorded as a
    // benign empty observation. An atomic sample that RESOLVED proves the
    // document was live; the sentinel alone proves the oracle broke on it.
    await page.setContent("<body></body>");
    await page.evaluate(() => {
      Object.getPrototypeOf(document.fonts).forEach = () => {
        throw new Error("sabotaged for the E2 fail-loud pin");
      };
    });
    const sample = await sampleFrame(page);
    expect(sample, "the atomic sample resolves on a live empty document").not.toBeNull();
    expect(sample!.faces).toBe("FACES_UNREADABLE");
    const observation = judgeSample(sample, "e2-spec");
    expect(
      observation?.facesUnreadable,
      "textless is not a licence to swallow a broken face query",
    ).toBe(true);
  });
});
