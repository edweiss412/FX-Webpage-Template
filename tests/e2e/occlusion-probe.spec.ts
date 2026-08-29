/**
 * tests/e2e/occlusion-probe.spec.ts
 * (spec 2026-08-29-attention-auto-open-phone-suppression §9.1)
 *
 * Self-test for the shared occlusion helper. Both real probes depend on it, so
 * an undiscriminating helper would make BOTH of them green and say nothing —
 * which is this arc's own recurring class (LIM-NONDISCRIMINATING-FIXTURE).
 *
 * A REAL BROWSER, not vitest. The helper's whole body is
 * `getBoundingClientRect` and `document.elementFromPoint` inside
 * `page.evaluate`. Neither environment the unit suite offers can run it
 * usefully: node has no DOM, and jsdom computes no layout, so every rect is
 * zero, every control is dropped by the zero-area filter, and the helper throws
 * "control set is empty" — a test asserting that throw passes while proving
 * nothing about occlusion.
 *
 * The fixture is a STATIC page with absolutely positioned boxes, so the
 * geometry is exact and nothing hydrates. Four cases, chosen so that each of
 * the helper's claims has a case that fails without it.
 *
 * Run:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/occlusion-probe.spec.ts
 */
import { test, expect } from "./helpers/fontFidelityFixture";
import { createServer, type Server } from "node:http";
import { probeOcclusion } from "./helpers/occlusionProbe";

const CLIP = "[data-clip]";
const PANEL = "[data-panel]";
const TRIGGER = '[data-testid="trigger"]';

/**
 * Four cases on one page:
 *   covered-by-panel  — a control under a node INSIDE the panel  (insidePanel true)
 *   covered-by-other  — a control under an unrelated node        (insidePanel false)
 *   clean             — nothing over it                          (no interception)
 *   quadrant          — covered over its TOP-LEFT quadrant only  (tl hit, centre clean)
 *
 * The quadrant case is what makes the five sample points earn their place: with
 * centre-only sampling it reports clean.
 */
const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; font: 14px system-ui; }
  [data-clip] { position: relative; width: 375px; height: 600px; overflow: hidden; }
  .ctl { position: absolute; width: 120px; height: 40px; }
  .cover { position: absolute; background: rgba(0,0,0,.2); }
  [data-panel] { position: absolute; left: 8px; top: 8px; width: 200px; height: 120px; z-index: 10; }
  /* z-index is load-bearing: without it the later-declared control paints ABOVE
     the panel, elementFromPoint returns the control, and the positive case
     reports clean. A real anchored panel stacks over what it covers. */
</style></head><body>
  <div data-clip>
    <button data-testid="trigger" class="ctl" style="left:240px; top:8px;">trigger</button>

    <div data-panel>
      <button data-testid="panel-row" class="cover" style="left:0; top:0; width:200px; height:120px;">row</button>
    </div>

    <button data-testid="covered-by-panel" class="ctl" style="left:20px; top:40px;">a</button>

    <button data-testid="covered-by-other" class="ctl" style="left:20px; top:300px;">b</button>
    <div data-testid="unrelated-cover" class="cover" style="left:20px; top:300px; width:120px; height:40px; z-index:10;"></div>

    <button data-testid="clean" class="ctl" style="left:20px; top:400px;">c</button>

    <button data-testid="quadrant" class="ctl" style="left:20px; top:500px;">d</button>
    <div data-testid="quadrant-cover" class="cover" style="left:20px; top:500px; width:60px; height:20px; z-index:10;"></div>
  </div>
</body></html>`;

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(PAGE);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(baseUrl);
  await page.evaluate(() => document.fonts.ready);
});

test("AC-OCCLUSION-DISCRIMINATES: reports a covering node, and reports none when absent", async ({
  page,
}) => {
  const r = await probeOcclusion(page, CLIP, PANEL, TRIGGER);

  // POSITIVE by oracle: this control is covered by a node inside the panel.
  const covered = r.interceptions.filter((i) => i.control === "covered-by-panel");
  expect(covered.length, "covered-by-panel was reported clean").toBeGreaterThan(0);
  expect(covered.every((i) => i.interceptedBy === "panel-row")).toBe(true);
  expect(covered.every((i) => i.insidePanel)).toBe(true);

  // NEGATIVE by oracle: nothing is over this one.
  expect(r.interceptions.filter((i) => i.control === "clean")).toEqual([]);

  // The panel's OWN rows are never controls, or every result is positive by
  // construction — the defect that killed the first probe design.
  expect(r.controls).not.toContain("panel-row");
  // Nor is the trigger, since a panel overlapping the control that owns it is
  // not an occlusion.
  expect(r.controls).not.toContain("trigger");
});

test("AC-OCCLUSION-DISCRIMINATES: insidePanel separates this arc's defect from pre-existing overlap", async ({
  page,
}) => {
  const r = await probeOcclusion(page, CLIP, PANEL, TRIGGER);
  const other = r.interceptions.filter((i) => i.control === "covered-by-other");
  expect(other.length, "covered-by-other was reported clean").toBeGreaterThan(0);
  expect(other.every((i) => i.interceptedBy === "unrelated-cover")).toBe(true);
  // The whole point: same shape, different verdict, because the interceptor is
  // not in the panel. Without this flag both cases look identical to a caller.
  expect(other.every((i) => i.insidePanel === false)).toBe(true);
});

test("AC-OCCLUSION-PARTIAL: a top-left-quadrant cover is caught at tl and clean at centre", async ({
  page,
}) => {
  const r = await probeOcclusion(page, CLIP, PANEL, TRIGGER);
  const q = r.interceptions.filter((i) => i.control === "quadrant");
  const points = q.map((i) => i.at);
  expect(points, "quadrant cover was not detected at all").toContain("tl");
  // Centre-only sampling reports this control clean. That is the failure this
  // case exists to make impossible.
  expect(points).not.toContain("centre");
});

test("AC-OCCLUSION-NONVACUOUS: throws on an empty control set", async ({ page }) => {
  // An empty clip yields no controls, so any verdict would be vacuous.
  await page.evaluate(() => {
    document.querySelector("[data-clip]")!.innerHTML = "";
  });
  await expect(probeOcclusion(page, CLIP, PANEL, TRIGGER)).rejects.toThrow(/control set is empty/);
});

test("AC-OCCLUSION-NONVACUOUS: throws when a named control is missing from the set", async ({
  page,
}) => {
  await expect(
    probeOcclusion(page, CLIP, PANEL, TRIGGER, ["published-show-toggle"]),
  ).rejects.toThrow(/published-show-toggle/);
});
