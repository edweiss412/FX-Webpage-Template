/**
 * BL-HEADER-REACT-RECONCILE-HARNESS — the section header, measured ACROSS a real
 * React reconciliation.
 *
 * WHAT THIS CATCHES THAT NOTHING ELSE DOES. A JS-driven height animation on the
 * section header: a `requestAnimationFrame` loop writing `style.height`, with no
 * CSS transition attached and no remount. Every existing guard is blind to it —
 * the static harness (tests/e2e/_sectionHeaderCellHarness.tsx) serves
 * server-rendered markup and runs no React at all, so a reconcile never happens
 * there (limit recorded at section-header-layout.layout.spec.ts:1176-1185); the
 * Part 1 computed-style scan looks for a `transition` property, and a JS tween
 * attaches none; and an endpoint-only measurement passes because the tween lands
 * exactly on the correct height.
 *
 * THE ORACLE IS SETTLE-REJECTING, NOT ENDPOINT-ONLY, and that distinction is the
 * entire value of the file. It arms a page-side recorder BEFORE the flip and
 * samples the header's height on every animation frame, then asserts that every
 * sample it saw is one of the two ENDPOINTS. A tween's intermediate values fail
 * that by construction; an instant swap cannot.
 *
 * THE MUTANT SHIPS WITH THE HARNESS. `?mutant=js-height` turns the defect on, and
 * every assertion below runs against BOTH modes: red under the mutant, green
 * without it. A guard whose failure mode is never executed is a guard nobody has
 * checked.
 */
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "./helpers/fontFidelityFixture";
import { bundleLiveEntry, compileEntryCss } from "./helpers/liveEntryToolchain";

const REPO_ROOT = join(__dirname, "..", "..");

let server: Server | undefined;
let baseUrl = "";
let workDir = "";

/** Sampling window. Comfortably longer than the mutant's ~150ms tween, so a
 *  tween that survives the window would be a LONGER animation, not a hidden one. */
const SAMPLE_MS = 300;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "section-header-reconcile-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  bundleLiveEntry({
    entry: join(REPO_ROOT, "tests", "e2e", "_sectionHeaderReconcileHarness.tsx"),
    outFile: join(workDir, "bundle.js"),
    aliases: {
      "node:crypto": join(REPO_ROOT, "tests", "e2e", "_nodeCryptoStub.ts"),
      "next/navigation": join(REPO_ROOT, "tests", "e2e", "_nextNavigationStub.ts"),
    },
  });

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "step3ReviewSections.tsx")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_sectionHeaderReconcileHarness.tsx")}";`,
      globals,
    ].join("\n"),
  );
  compileEntryCss({ entryCss, outFile: join(workDir, "out.css") });

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "live.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader(
        "content-type",
        file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html",
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server?.listen(0, "127.0.0.1", r));
  const addr = server?.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server?.close(() => r()));
});

/**
 * Load a mode and wait for HYDRATION, never for `networkidle`.
 *
 * `networkidle` says the network went quiet, which on a two-asset page is true
 * long before React has mounted. The harness sets `data-harness-hydrated` in a
 * post-mount effect; that attribute is the only signal that the component under
 * proof actually exists in the DOM.
 */
async function load(page: import("@playwright/test").Page, mutant: boolean): Promise<void> {
  await page.goto(mutant ? `${baseUrl}?mutant=js-height` : baseUrl);
  await page.waitForSelector("html[data-harness-hydrated='true']");
  await expect(page.getByTestId("reconcile-section")).toBeVisible();
}

/**
 * Flip the prop and return every height sampled during the reconcile.
 *
 * THE RECORDER IS ARMED BEFORE THE CLICK. Sampling that starts after the event
 * has already been dispatched can miss the first frames — exactly the frames a
 * short tween lives in — and would make the oracle pass for the wrong reason.
 *
 * Detach-safe: each frame re-reads the node from the DOM and stops if it is
 * gone, so a reconcile that DOES replace the node ends the recording instead of
 * hanging on a stale reference.
 */
/**
 * The oracle's arithmetic, as a pure function so its own failure modes are
 * testable without a browser.
 *
 * TWO DEFECTS THE FIRST VERSION HAD, both found by cross-model review (R2 HIGH)
 * and both reproduced as rows below:
 *
 *   counting from the first DETECTED change, not from the flip, let a delayed
 *   snap through — samples [100,100,100,100,120,120,120] measured 0 frames of
 *   travel because the count started at the change itself.
 *
 *   bucketing samples to 0.5px let a real multi-frame tween through whenever
 *   its TOTAL travel was under that bucket — [100,100.1,100.2,100.3,100.4]
 *   read as "never changed", and "never changed" was treated as a pass.
 *
 * So: frames are counted from the FLIP INDEX, distinct values are compared at
 * full sample precision, and a flip that produced no change at all is a FAILED
 * PREMISE rather than a quiet success.
 */
export function analyzeSamples(
  samples: readonly number[],
  flipIndex: number,
): { distinct: number[]; framesToTarget: number; changed: boolean } {
  const after = samples.slice(flipIndex);
  const final = after[after.length - 1] ?? Number.NaN;
  const start = after[0] ?? Number.NaN;
  // Full precision, not 0.5px buckets: a tween's intermediate values differ from
  // both endpoints by however little it moves per frame, and rounding them into
  // an endpoint's bucket is exactly how a small tween hid.
  const distinct = [...new Set(after.map((h) => Number(h.toFixed(2))))];
  const changed = Number(start.toFixed(2)) !== Number(final.toFixed(2));
  // Frames from the FLIP to the first sample that reads final.
  const settledAt = after.findIndex((h) => Number(h.toFixed(2)) === Number(final.toFixed(2)));
  return { distinct, framesToTarget: settledAt === -1 ? after.length : settledAt, changed };
}

async function sampleAcrossFlip(
  page: import("@playwright/test").Page,
): Promise<{ distinct: number[]; framesToTarget: number; changed: boolean; samples: number[] }> {
  await page.evaluate((ms) => {
    const w = window as unknown as { __heights?: number[]; __done?: boolean; __flipAt?: number };
    w.__heights = [];
    w.__done = false;
    delete w.__flipAt;
    const started = performance.now();
    const tick = () => {
      const node = document.querySelector("[data-testid='reconcile-box']");
      if (!node) {
        w.__done = true;
        return;
      }
      w.__heights?.push((node as HTMLElement).getBoundingClientRect().height);
      if (performance.now() - started < ms) requestAnimationFrame(tick);
      else w.__done = true;
    };
    requestAnimationFrame(tick);
  }, SAMPLE_MS);

  await page.getByTestId("reconcile-flip").click();
  // STAMP THE FLIP. Counting from the first observed change measures the
  // animation's own duration and calls a delayed start "immediate"; counting
  // from here measures what the assertion actually claims.
  await page.evaluate(() => {
    const w = window as unknown as { __heights: number[]; __flipAt?: number };
    w.__flipAt = Math.max(0, w.__heights.length - 1);
  });
  await page.waitForFunction(() => (window as unknown as { __done?: boolean }).__done === true);

  const { samples, flipAt } = await page.evaluate(() => ({
    samples: (window as unknown as { __heights: number[] }).__heights,
    flipAt: (window as unknown as { __flipAt?: number }).__flipAt ?? 0,
  }));
  return { samples, ...analyzeSamples(samples, flipAt) };
}

test.describe("section header — measured across a React reconciliation", () => {
  test("the flip changes the header height at all (premise)", async ({ page }) => {
    // PREMISE, executable. Every assertion below discriminates only if the prop
    // flip actually moves the header's height. If the two states ever render to
    // the same height, the settle oracle would pass on a document where nothing
    // happened — vacuously — and this row is what makes that failure loud
    // instead of silent (tests/_shared/premise.ts shape, applied to a browser).
    await load(page, false);
    const before = await page
      .getByTestId("reconcile-box")
      .evaluate((n) => n.getBoundingClientRect().height);
    await page.getByTestId("reconcile-flip").click();
    await expect
      .poll(async () =>
        page.getByTestId("reconcile-box").evaluate((n) => n.getBoundingClientRect().height),
      )
      .not.toBe(before);
  });

  test("no intermediate height is observable across the reconcile", async ({ page }) => {
    await load(page, false);
    const { samples, distinct, changed } = await sampleAcrossFlip(page);
    expect(samples.length, "the recorder must have sampled frames").toBeGreaterThan(5);
    expect(changed, "the flip must move the height, or this row proves nothing").toBe(true);
    expect(
      distinct.length,
      `every sampled height must be one of the two endpoints; saw ${distinct.length} distinct ` +
        `values: ${distinct.join(", ")}. A value between them means the height was ANIMATED — ` +
        `a JS tween attaches no CSS transition and settles on the correct number, so this is the ` +
        `only assertion that can see it.`,
    ).toBeLessThanOrEqual(2);
  });

  test("the target height is reached within 2 frames of the flip", async ({ page }) => {
    await load(page, false);
    const { framesToTarget, changed } = await sampleAcrossFlip(page);
    expect(changed, "a flip that changed nothing cannot demonstrate an immediate snap").toBe(true);
    expect(
      framesToTarget,
      "counted from the FLIP, not from the first observed change — an instant swap lands on its " +
        "final height immediately, and starting the count at the change would score a delayed " +
        "snap as immediate",
    ).toBeLessThanOrEqual(2);
  });

  test("PEER SHAPES — the arithmetic rejects a delayed snap and a sub-pixel tween", () => {
    // Codex R2 HIGH, both probes verbatim. Neither needs a browser: they are
    // defects in the ORACLE's arithmetic, and the pure function is where they
    // live. The shipped smooth-tween mutant discriminated both before and after,
    // which is exactly why these had to be tested directly — a passing mutant
    // row is not evidence about the shapes it does not exercise.
    const delayedSnap = analyzeSamples([100, 100, 100, 100, 120, 120, 120], 0);
    expect(delayedSnap.changed).toBe(true);
    expect(
      delayedSnap.framesToTarget,
      "four frames of nothing then a snap is not an immediate swap; counting from the first " +
        "CHANGE scored this 0",
    ).toBeGreaterThan(2);

    const tinyTween = analyzeSamples([100, 100.1, 100.2, 100.3, 100.4], 0);
    expect(
      tinyTween.distinct.length,
      "a real multi-frame tween whose total travel is under half a pixel is still an animation; " +
        "0.5px bucketing collapsed all five samples into one endpoint",
    ).toBeGreaterThan(2);
    expect(
      tinyTween.changed,
      "and it did change — treating sub-bucket travel as 'never changed' turned a live animation " +
        "into a silent pass",
    ).toBe(true);
  });

  test("MUTANT — the same oracle rejects a JS height tween", async ({ page }) => {
    // The executable proof that the two assertions above are not vacuous. Under
    // ?mutant=js-height the component animates its height from JS with no CSS
    // transition; if this row ever passes, the oracle has stopped discriminating.
    await load(page, true);
    const { distinct, framesToTarget } = await sampleAcrossFlip(page);
    expect(
      distinct.length > 2 || framesToTarget > 2,
      `the mutant tween must be visible to the oracle, but it saw ${distinct.length} distinct ` +
        `heights settling in ${framesToTarget} frames`,
    ).toBe(true);
  });

  test("one mounted node owns both heights — the reconcile does not remount", async ({ page }) => {
    // Node IDENTITY across the flip. A harness that quietly REMOUNTS would make
    // every assertion above true for the wrong reason: a replaced node cannot
    // show an intermediate height because it never had the old one.
    await load(page, false);
    // MARK THE COMPONENT'S OWN NODES, never the harness wrapper. `reconcile-box`
    // is a div THIS harness owns, outside `BreakdownSection`; it survives a prop
    // flip whether or not the real header remounts underneath it, so marking it
    // would let a remounting header pass a test whose whole claim is that one
    // node owns both heights. Codex R1 HIGH — the wrapper marker was exactly
    // that false negative.
    const section = page.getByTestId("reconcile-section");
    const heading = page.locator('[data-testid="reconcile-box"] :is(h3, h4)').first();
    await expect(heading).toBeVisible();
    await section.evaluate((n) => n.setAttribute("data-identity", "section-pre-flip"));
    await heading.evaluate((n) => n.setAttribute("data-identity", "heading-pre-flip"));

    await page.getByTestId("reconcile-flip").click();
    await expect(section).toBeVisible();

    await expect(
      section,
      "the component's own root must survive the prop change; if React replaced it, the stable " +
        "key is not doing what this harness claims and every settle assertion above is true for " +
        "the wrong reason",
    ).toHaveAttribute("data-identity", "section-pre-flip");
    await expect(
      heading,
      "the heading element whose height the pill changes must be the SAME node across the " +
        "reconcile — this is the node the oracle measures through",
    ).toHaveAttribute("data-identity", "heading-pre-flip");
  });

  test("header height is driven by pill presence, not a fixed min-height", async ({ page }) => {
    // Part 2's mechanism, carried onto the hydrated harness. If the header
    // carried a fixed min-height tall enough for the pill, the flip would not
    // move the box at all and the section's geometry would be a constant rather
    // than a function of its content.
    await load(page, false);
    const box = page.getByTestId("reconcile-box");
    const before = await box.evaluate((n) => n.getBoundingClientRect().height);
    await page.getByTestId("reconcile-flip").click();
    await expect(page.getByTestId("reconcile-section")).toBeVisible();
    const after = await box.evaluate((n) => n.getBoundingClientRect().height);
    expect(after, "the pill must change the measured height").not.toBeCloseTo(before, 1);

    const minHeights = await box.evaluate((root) =>
      Array.from(root.querySelectorAll("*"))
        .map((el) => getComputedStyle(el).minHeight)
        .filter((v) => v !== "0px" && v !== "auto"),
    );
    // A tap-target floor is legitimate; a min-height that could absorb the pill
    // is not. Anything at or above the post-flip height would hide the change.
    for (const mh of minHeights) {
      const px = Number.parseFloat(mh);
      if (Number.isFinite(px)) expect(px).toBeLessThan(after);
    }
  });

  test("nothing in the hydrated header subtree transitions geometry", async ({ page }) => {
    // Part 1's computed-style scan, re-run on the HYDRATED tree. The static
    // harness proves this for server markup; a transition added by a client-only
    // code path would be invisible there.
    await load(page, false);
    const offenders = await page.getByTestId("reconcile-box").evaluate((root) => {
      const GEOMETRIC =
        /width|height|margin|padding|top|left|right|bottom|transform|inset|flex|gap/;
      const out: string[] = [];
      const check = (el: Element, pseudo: string | undefined) => {
        const s = getComputedStyle(el, pseudo);
        const props = s.transitionProperty;
        if (!props || props === "none" || s.transitionDuration === "0s") return;
        for (const p of props.split(",").map((v) => v.trim())) {
          if (p === "all" || GEOMETRIC.test(p)) {
            out.push(`${el.tagName.toLowerCase()}${pseudo ?? ""}: ${p}`);
          }
        }
      };
      for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
        check(el, undefined);
        check(el, "::before");
        check(el, "::after");
      }
      return out;
    });
    expect(offenders, "a geometric transition here would animate every state pair at once").toEqual(
      [],
    );
  });
});
