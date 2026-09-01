/**
 * Forced-colors acceptance. Spec
 * `docs/superpowers/specs/2026-09-01-forced-colors-pass.md`, plan Task 3 onward.
 *
 * WHY A BROWSER AND NOT A SCANNER. The two scanner arms answer "which affordances
 * state themselves only in properties forced colors flattens", which is a question
 * about the source and is correctly answered from it. Whether a REPAIR works is a
 * question about rendered output, and only a browser answers that. Plan review R1
 * found the earlier design gating the repairs on the scanner, which cannot see
 * them: a repair adds unlayered selectors to `app/globals.css` and changes no
 * element's class list, so the scanner's answer is identical before and after.
 *
 * WHAT IS AND IS NOT SYNTHETIC HERE. The cues are pure CSS keyed on a data
 * attribute, so the page below carries the SHIPPED attribute against the LIVE
 * compiled stylesheet — the selector under test is the one that ships, which is
 * the probe-domain rule this arc applies to its own probes. The element wearing
 * the attribute contributes nothing to the cue. A separate case pins that the
 * component still emits that attribute, so the two cannot drift apart.
 *
 * READINESS AND SAMPLING. The cues are timer-gated and one of them remounts, so an
 * assertion sampling at the wrong moment is flaky in both directions. Every case
 * below reads computed style through `expect.poll` rather than a single frame, and
 * resolves its handle after any attribute change rather than holding one across it.
 */
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "./helpers/fontFidelityFixture";
import { compileEntryCss } from "./helpers/liveEntryToolchain";

const REPO_ROOT = join(__dirname, "..", "..");

/**
 * The shipped attributes, spelled here so a rename in the component or the
 * stylesheet fails this spec rather than silently passing against a stale name.
 */
const SHARE_LINK_FLASH_ATTR = "data-share-link-flash";
const STEP3_FLASH_ATTR = "data-step3-warning-flash";
const FRESHNESS_FLASH_ATTR = "data-section-freshness-flash";

let workDir: string;
let server: Server;
let origin: string;

function harnessHtml(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="/out.css"></head>
<body>
  <div id="share-idle" data-testid="fc-share-idle">share, idle</div>
  <div id="share-flash" ${SHARE_LINK_FLASH_ATTR} data-testid="fc-share-flash">share, flashing</div>
  <div id="step3-idle" data-testid="fc-step3-idle">step3, idle</div>
  <div id="step3-flash" ${STEP3_FLASH_ATTR} data-testid="fc-step3-flash">step3, flashing</div>
  <div id="fresh-idle" data-testid="fc-fresh-idle">freshness, idle</div>
  <div id="fresh-flash" ${FRESHNESS_FLASH_ATTR}="1" data-testid="fc-fresh-flash">freshness, flashing</div>
</body></html>`;
}

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "forced-colors-"));
  writeFileSync(join(workDir, "harness.html"), harnessHtml());

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);
  compileEntryCss({ entryCss, outFile: join(workDir, "out.css") });

  const html = readFileSync(join(workDir, "harness.html"), "utf8");
  const css = readFileSync(join(workDir, "out.css"), "utf8");
  server = createServer((req, res) => {
    if (req.url === "/out.css") {
      res.writeHead(200, { "content-type": "text/css" });
      res.end(css);
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no server address");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** The visual carriers forced colors leaves under author control. */
async function paint(page: import("@playwright/test").Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      // Style, not the shorthand: `outline-width` computes to the UA's 3px even
      // when the style is `none`, so a width comparison reports a cue that is not
      // painted. Caught by this spec's own idle assertion on its first green run.
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor,
      boxShadow: s.boxShadow,
      background: s.backgroundColor,
    };
  });
}

test.describe("forced colors", () => {
  test("AC-1: the share-link cue is visible while flashing and leaves no residue idle", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(origin);

    // The cue's whole job. Before the repair this reads `none` for both legs: the
    // ring is a box-shadow, which a UA drops, and both background endpoints force
    // to one value.
    await expect
      .poll(async () => (await paint(page, "fc-share-flash")).outlineStyle)
      .not.toBe("none");

    // And the idle half, which is the one an earlier draft of the spec got exactly
    // backwards for a different cue: a repair that leaves a permanent outline is
    // the defect this pass exists to remove, not a fix for it.
    const idle = await paint(page, "fc-share-idle");
    expect(idle.outlineStyle, "an idle row must carry no cue").toBe("none");
  });

  test("AC-2: the step-3 warning cue is visible, animated and reduced-motion alike", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(origin);
    await expect
      .poll(async () => (await paint(page, "fc-step3-flash")).outlineStyle)
      .not.toBe("none");
    expect((await paint(page, "fc-step3-idle")).outlineStyle).toBe("none");

    // The reduced-motion half is not a duplicate. This cue marks a jump target the
    // user must LOCATE, so unlike the share-link cue its reduced-motion fallback is
    // a steady tint rather than nothing (app/globals.css:1121-1128). That tint is a
    // background, so it flattens too, and the fallback needs its own carrier.
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.reload();
    await expect
      .poll(async () => (await paint(page, "fc-step3-flash")).outlineStyle)
      .not.toBe("none");
  });

  test("the component still emits the attribute the stylesheet keys on", () => {
    // The page above is synthetic in exactly one respect: it wears the attribute
    // rather than rendering ShareHub. This is what stops that becoming a fixture
    // testing itself — a rename in either place fails here.
    const shareHub = readFileSync(
      join(REPO_ROOT, "components", "admin", "showpage", "ShareHub.tsx"),
      "utf8",
    );
    expect(shareHub).toContain(`"${SHARE_LINK_FLASH_ATTR}"`);
    const css = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
    expect(css).toContain(`[${SHARE_LINK_FLASH_ATTR}]`);
  });
});
