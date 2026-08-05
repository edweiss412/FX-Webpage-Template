// Regression guard for the census DOM walk crossing a SHADOW ROOT.
//
// WHY THIS EXISTS. The walk shipped a defect no local run could reach: it read
// `createTreeWalker`'s starting node as an Element, which is true for
// `document.body` and false for a shadow root (a DocumentFragment, with no
// `getAttribute`). CI failed every admin route under mobile-safari with
// `el.getAttribute is not a function` while chromium stayed green, because only
// WebKit built a shadow host on those pages.
//
// So the trigger is now MANUFACTURED rather than waited for: this fixture
// attaches its own open shadow root, and the walk runs against it in whatever
// browser the project uses. It calls the SHIPPED function from
// `helpers/censusWalk.ts` — a copy of the walk here would pass while the real
// one stayed broken, which is the tautology this repo's test rules reject.
import { expect, test } from "@playwright/test";

import { collectFontFindings } from "./helpers/censusWalk";

const FIXTURE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: "Test Sans", sans-serif; }
  #plain::before { content: "eyebrow"; }
</style></head>
<body>
  <p data-testid="plain-text" id="plain">visible text in the light DOM</p>
  <div data-testid="shadow-host" id="host"></div>
  <script>
    const shadow = document.getElementById("host").attachShadow({ mode: "open" });
    shadow.innerHTML = '<span data-testid="inside-shadow">text inside the shadow root</span>';
  </script>
</body></html>`;

test.describe("census walk", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/census-walk-fixture", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: FIXTURE }),
    );
    await page.goto("http://localhost/census-walk-fixture");
    await page.evaluate(() => document.fonts.ready);
  });

  test("crosses an open shadow root without throwing on the fragment", async ({ page }) => {
    // The assertion IS the absence of the TypeError: before the fix this call
    // rejected with `el.getAttribute is not a function` the moment the walk
    // recursed into the shadow root.
    const findings = await page.evaluate(collectFontFindings, {
      cannotHost: "input, textarea, select, img, svg, canvas",
      pseudos: ["::before"],
    });

    expect(
      findings.map((f) => f.testid),
      "the light-DOM element must be found",
    ).toContain("plain-text");
    expect(
      findings.map((f) => f.testid),
      "the walk must reach INSIDE the open shadow root, not merely survive it",
    ).toContain("inside-shadow");
  });

  test("reports a content-bearing pseudo-element", async ({ page }) => {
    // Pins the other branch that reads the walked node, so a regression that
    // skipped elements entirely could not pass on the shadow assertion alone.
    const findings = await page.evaluate(collectFontFindings, {
      cannotHost: "input, textarea, select, img, svg, canvas",
      pseudos: ["::before"],
    });
    expect(findings.some((f) => f.kind === "pseudo" && f.tag.endsWith("::before"))).toBe(true);
  });
});
