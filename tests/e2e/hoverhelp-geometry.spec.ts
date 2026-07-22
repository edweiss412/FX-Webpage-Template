/**
 * tests/e2e/hoverhelp-geometry.spec.ts
 * (spec 2026-07-22-hoverhelp-smart-position §6 T3/T5/T6/T7/T8 body-host)
 *
 * Real-engine geometry for the smart-positioned HoverHelp popover:
 * 1. bundles tests/e2e/_hoverHelpGeometryLiveEntry.tsx out-of-process with the
 *    version-pinned esbuild (Playwright's babel transform rewrites
 *    spec-imported .tsx, so the bundle must be built out of process);
 * 2. compiles real token CSS with the Tailwind CLI over app/globals.css with
 *    explicit @source entries so the exact class strings are emitted;
 * 3. serves live.html over node:http on an ephemeral port.
 *
 * Runs standalone via tests/e2e/standalone.config.ts:
 *   pnpm exec playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/hoverhelp-geometry.spec.ts
 *
 * Every expected value derives from live trigger/bounds rects plus the
 * exported GAP / VIEWPORT_INSET constants (numeric-pinned in
 * tests/lib/popover/position.test.ts). getBoundingClientRect is BANNED as a
 * clipping/visibility proof (BACKLOG.md documents it lying about clipping);
 * true visibility uses document.elementFromPoint.
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import {
  CARET_EDGE_INSET,
  CARET_HEIGHT,
  CARET_INNER_OFFSET,
  CARET_WIDTH,
  GAP,
  VIEWPORT_INSET,
} from "../../lib/popover/position";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "hoverhelp-geometry-"));
  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  execFileSync(
    "pnpm",
    [
      "dlx",
      "esbuild@0.28.0",
      join(REPO_ROOT, "tests", "e2e", "_hoverHelpGeometryLiveEntry.tsx"),
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      "--loader:.tsx=tsx",
      '--define:process.env.NODE_ENV="production"',
      "--external:node:fs",
      `--alias:node:crypto=${join(REPO_ROOT, "tests", "e2e", "_nodeCryptoStub.ts")}`,
      `--tsconfig=${join(REPO_ROOT, "tsconfig.json")}`,
      '--banner:js=window.process=window.process||{env:{NODE_ENV:"production"}};',
      `--alias:next/navigation=${join(REPO_ROOT, "tests", "e2e", "_nextNavigationStub.ts")}`,
      `--outfile=${join(workDir, "bundle.js")}`,
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin", "HoverHelp.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "CompactAlertCard.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "compactAlertHelp.tsx")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_hoverHelpGeometryLiveEntry.tsx")}";`,
      globals,
    ].join("\n"),
  );
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

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
      res.end("nope");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no addr");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  // Codex R2 F10: don't leak a hoverhelp-geometry-* tmp dir per run.
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

async function open(page: Page, kase: string, triggerId: string): Promise<void> {
  await page.goto(`${baseUrl}/live.html?case=${kase}`);
  await page.getByTestId("harness-ready").waitFor({ state: "attached" });
  await clickOpen(page, triggerId);
}

/**
 * Playwright's click moves the pointer onto the trigger first, so HoverHelp's
 * mouse-only pointerenter hover-opens BEFORE the click toggle — net closed
 * (same race the deep-link-walker documents). The pointer is inside after the
 * first click, so a second click toggles open without a new pointerenter.
 */
async function clickOpen(page: Page, triggerId: string): Promise<void> {
  const trigger = page.getByTestId(`${triggerId}-trigger`);
  // Converge-by-loop (mirrors the modal suite's clickOpenTrigger): the
  // hover-open/click-toggle parity is not stable under CPU contention, so
  // each attempt just toggles again until the open state sticks.
  for (let attempt = 0; attempt < 5; attempt++) {
    await trigger.click();
    try {
      await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
      return;
    } catch {
      // toggled closed again — loop
    }
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

async function box(page: Page, testid: string): Promise<Box> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) throw new Error(`no element ${id}`);
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  }, testid);
}

test.describe("T3 geometry", () => {
  test("T3a fits-below: body top = trigger bottom + GAP, side=bottom", async ({ page }) => {
    await open(page, "top", "top-help");
    const t = await box(page, "top-help-trigger");
    const b = await box(page, "top-help-body");
    expect(Math.abs(b.top - (t.bottom + GAP))).toBeLessThanOrEqual(TOL);
    await expect(page.getByTestId("top-help-body")).toHaveAttribute("data-popover-side", "bottom");
  });

  test("T3b flip-up + bounds: body bottom = trigger top − GAP; body within inset viewport", async ({
    page,
  }) => {
    await open(page, "bottom", "bottom-help");
    const t = await box(page, "bottom-help-trigger");
    const b = await box(page, "bottom-help-body");
    expect(Math.abs(b.bottom - (t.top - GAP))).toBeLessThanOrEqual(TOL);
    const vp = page.viewportSize();
    if (!vp) throw new Error("no viewport");
    expect(b.top).toBeGreaterThanOrEqual(VIEWPORT_INSET - TOL);
    expect(b.left).toBeGreaterThanOrEqual(VIEWPORT_INSET - TOL);
    expect(b.right).toBeLessThanOrEqual(vp.width - VIEWPORT_INSET + TOL);
    expect(b.bottom).toBeLessThanOrEqual(vp.height - VIEWPORT_INSET + TOL);
  });

  test("T3c neither-side shrink: maxHeight === larger space; overflow engaged", async ({
    page,
  }) => {
    await open(page, "center-tall", "tall-help");
    const t = await box(page, "tall-help-trigger");
    const b = await box(page, "tall-help-body");
    const vp = page.viewportSize();
    if (!vp) throw new Error("no viewport");
    const spaceBelow = vp.height - VIEWPORT_INSET - t.bottom - GAP;
    const spaceAbove = t.top - VIEWPORT_INSET - GAP;
    const larger = Math.max(spaceBelow, spaceAbove);
    expect(Math.abs(b.height - larger)).toBeLessThanOrEqual(TOL);
    expect(b.top).toBeGreaterThanOrEqual(VIEWPORT_INSET - TOL);
    expect(b.bottom).toBeLessThanOrEqual(vp.height - VIEWPORT_INSET + TOL);
    const scrolls = await page
      .getByTestId("tall-help-body")
      .evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);
  });

  test("T3d caps engaged — 1280×800: width === 18rem, height === 24rem", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "overflow", "overflow-help");
    const b = await box(page, "overflow-help-body");
    expect(Math.abs(b.width - 288)).toBeLessThanOrEqual(TOL); // w-72 engaged (lower bound too)
    expect(Math.abs(b.height - 384)).toBeLessThanOrEqual(TOL); // 24rem arm (60vh=480 > 384)
  });

  test("T3d caps engaged — 320×844: width === 80vw", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await open(page, "overflow", "overflow-help");
    const b = await box(page, "overflow-help-body");
    expect(Math.abs(b.width - 0.8 * 320)).toBeLessThanOrEqual(TOL); // 256 < 288 → 80vw arm
  });

  test("T3d caps engaged — 1280×500: height === 60vh", async ({ page }) => {
    // The 60vh CLASS arm is observable only where the popover FITS (a
    // centered trigger at 500h leaves <300px per side and the shrink path
    // would win instead): capped-fit pins its trigger near the top, so
    // spaceBelow ≈ 394 ≥ 300 and the class cap is the binding constraint.
    await page.setViewportSize({ width: 1280, height: 500 });
    await open(page, "capped-fit", "capped-help");
    const b = await box(page, "capped-help-body");
    expect(Math.abs(b.height - 0.6 * 500)).toBeLessThanOrEqual(TOL); // 300 < 384 → 60vh arm
  });

  test("T3e anchor-gone: scrolled out of the pane host hides; back restores, open preserved", async ({
    page,
  }) => {
    await open(page, "pane", "pane-help");
    const body = page.getByTestId("pane-help-body");
    await expect(body).toHaveAttribute("data-popover-side", "bottom");
    await page.getByTestId("pane").evaluate((el) => {
      el.scrollTop = 600; // trigger leaves the pane's visible box
      el.dispatchEvent(new Event("scroll", { bubbles: false }));
    });
    await expect(body).toHaveAttribute("data-popover-hidden", "true");
    await expect(body).toHaveCSS("visibility", "hidden");
    await page.getByTestId("pane").evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll", { bubbles: false }));
    });
    await expect(body).not.toHaveAttribute("data-popover-hidden", "true");
    await expect(page.getByTestId("pane-help-trigger")).toHaveAttribute("aria-expanded", "true");
  });

  test("T3f placement=top honored mid-page; flips down when pinned to the top edge", async ({
    page,
  }) => {
    await open(page, "preferred-top", "pref-mid");
    const tMid = await box(page, "pref-mid-trigger");
    const bMid = await box(page, "pref-mid-body");
    expect(Math.abs(bMid.bottom - (tMid.top - GAP))).toBeLessThanOrEqual(TOL);
    // second instance: pinned near the top — preferred side cannot fit
    await clickOpen(page, "pref-pinned");
    const tPin = await box(page, "pref-pinned-trigger");
    const bPin = await box(page, "pref-pinned-body");
    expect(Math.abs(bPin.top - (tPin.bottom + GAP))).toBeLessThanOrEqual(TOL);
  });

  test("T3g align branches clamped at both edges (SATURATED, not merely inside)", async ({
    page,
  }) => {
    // Discriminative form (codex R2 F5): the fixtures are pinned close enough
    // to each edge that the requested alignment CANNOT fit, so the clamp must
    // land EXACTLY on the inset boundary. An implementation that centered the
    // body (or ignored the align prop) would sit strictly inside the bound
    // and fail the equality.
    await open(page, "edges", "edge-right-align");
    const t1 = await box(page, "edge-right-align-trigger");
    const b1 = await box(page, "edge-right-align-body");
    expect(t1.right - b1.width).toBeLessThan(VIEWPORT_INSET); // precondition: align=right cannot fit
    expect(Math.abs(b1.left - VIEWPORT_INSET)).toBeLessThanOrEqual(TOL); // saturated at left inset
    await clickOpen(page, "edge-left-align");
    const vp = page.viewportSize();
    if (!vp) throw new Error("no viewport");
    const t2 = await box(page, "edge-left-align-trigger");
    const b2 = await box(page, "edge-left-align-body");
    expect(t2.left + b2.width).toBeGreaterThan(vp.width - VIEWPORT_INSET); // precondition: align=left cannot fit
    expect(Math.abs(b2.right - (vp.width - VIEWPORT_INSET))).toBeLessThanOrEqual(TOL); // saturated at right inset
  });

  test("T3h discriminative metric: capped border-box fits below although scrollHeight would not", async ({
    page,
  }) => {
    await open(page, "capped-fit", "capped-help");
    const t = await box(page, "capped-help-trigger");
    const vp = page.viewportSize();
    if (!vp) throw new Error("no viewport");
    const spaceBelow = vp.height - VIEWPORT_INSET - t.bottom - GAP;
    const m = await page.getByTestId("capped-help-body").evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      borderBox: el.getBoundingClientRect().height,
      inlineMaxHeight: (el as HTMLElement).style.maxHeight,
    }));
    // preconditions (fixture invalid if violated)
    expect(m.scrollHeight).toBeGreaterThan(spaceBelow);
    expect(m.borderBox).toBeLessThanOrEqual(spaceBelow + TOL);
    // the verdict: correct metric keeps the preferred side, no shrink
    await expect(page.getByTestId("capped-help-body")).toHaveAttribute(
      "data-popover-side",
      "bottom",
    );
    expect(m.inlineMaxHeight).toBe("");
  });
});

test("T5 overlap kill-shot: popover never intersects the guidance band it contextualizes", async ({
  page,
}) => {
  await open(page, "overlap", "overlap-help");
  // Non-vacuity: the popover must be genuinely PLACED and visible — a hidden
  // or unpositioned body trivially "doesn't intersect" anything.
  await expect(page.getByTestId("overlap-help-body")).toHaveAttribute(
    "data-popover-side",
    /top|bottom/,
  );
  await expect(page.getByTestId("overlap-help-body")).not.toHaveAttribute(
    "data-popover-hidden",
    "true",
  );
  const band = await box(page, "guidance-band");
  const b = await box(page, "overlap-help-body");
  const intersects =
    b.left < band.right && b.right > band.left && b.top < band.bottom && b.bottom > band.top;
  expect(intersects).toBe(false);
});

test.describe("T6 document integrity + coordinates", () => {
  test("no horizontal document scroll at 390 with a popover open", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "top", "top-help");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("body-host coordinates hold under nonzero window scroll (T3a equation end-to-end)", async ({
    page,
  }) => {
    const INITIAL_SCROLL_Y = 1200; // matches the existing scrolly-case scroll depth
    const SCROLL_DELTA = 60;
    await page.goto(`${baseUrl}/live.html?case=scrolly`);
    await page.getByTestId("harness-ready").waitFor({ state: "attached" });
    await page.evaluate((y) => window.scrollTo(0, y), INITIAL_SCROLL_Y);
    await clickOpen(page, "scrolly-help");
    const t = await box(page, "scrolly-help-trigger");
    const b = await box(page, "scrolly-help-body");
    // viewport-relative rects: a broken scrollY term shifts the body by 1200px
    expect(Math.abs(b.top - (t.bottom + GAP))).toBeLessThanOrEqual(TOL);
  });
});

test.describe("T7 reposition lifecycle (e2e arm)", () => {
  test("pane scroll preserves the trigger offset within 1px on the next frame", async ({
    page,
  }) => {
    await open(page, "pane", "pane-help");
    const t1 = await box(page, "pane-help-trigger");
    const b1 = await box(page, "pane-help-body");
    const offset1 = b1.top - t1.bottom;
    await page.getByTestId("pane").evaluate((el) => {
      el.scrollTop = 40;
      el.dispatchEvent(new Event("scroll", { bubbles: false }));
    });
    // Poll to convergence (codex R2 F4): a loaded runner can take more than
    // one frame to run the coalesced rAF reposition.
    await expect
      .poll(
        async () => {
          const t2 = await box(page, "pane-help-trigger");
          const b2 = await box(page, "pane-help-body");
          return Math.abs(b2.top - t2.bottom - offset1);
        },
        { timeout: 3_000 },
      )
      .toBeLessThanOrEqual(1);
  });

  test("content growth repositions via ResizeObserver and stays in bounds; popover stays open", async ({
    page,
  }) => {
    await open(page, "grow", "grow-help");
    const before = await box(page, "grow-help-body");
    await page.evaluate(() => window.__growPopoverContent());
    const vp = page.viewportSize();
    if (!vp) throw new Error("no viewport");
    // Poll the REPOSITIONED invariant, not just the (synchronous) layout
    // growth: height alone can be observed before the ResizeObserver/rAF
    // reposition runs (codex R3). Converged means BOTH grown and back in
    // bounds at its new position.
    await expect
      .poll(
        async () => {
          const b = await box(page, "grow-help-body");
          return b.height > before.height + 100 && b.bottom <= vp.height - VIEWPORT_INSET + TOL;
        },
        { timeout: 3_000 },
      )
      .toBe(true);
    await page.waitForTimeout(300); // past CLOSE_DELAY — the hook must not close it
    await expect(page.getByTestId("grow-help-trigger")).toHaveAttribute("aria-expanded", "true");
  });

  test("maxWidth engages inside a NARROW pane host and is CLEARED when the host widens", async ({
    page,
  }) => {
    // Body hosts can never need inline maxWidth (80vw class cap ≤ viewport
    // bounds for any viewport ≥ 80px wide); the narrow-HOST branch is the
    // pane case (spec §4.2 step 2 / §4.8 "panel narrower than body").
    await open(page, "narrowpane", "np-help");
    const narrow = await page
      .getByTestId("np-help-body")
      .evaluate((el) => (el as HTMLElement).style.maxWidth);
    expect(narrow).not.toBe(""); // pane bounds 160-16=144 < 288 natural
    await page.evaluate(() => window.__widenPane());
    await expect
      .poll(
        () => page.getByTestId("np-help-body").evaluate((el) => (el as HTMLElement).style.maxWidth),
        { timeout: 3_000 },
      )
      .toBe("");
  });

  test("maxHeight engages on a short viewport and is CLEARED after restore", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 }); // both spaces < 384 cap → shrink engages
    await open(page, "center-tall", "tall-help");
    const short = await page
      .getByTestId("tall-help-body")
      .evaluate((el) => (el as HTMLElement).style.maxHeight);
    expect(short).not.toBe("");
    // taller than the content ever needs: no side is too small any more
    await page.setViewportSize({ width: 1280, height: 3000 });
    await expect
      .poll(
        () =>
          page.getByTestId("tall-help-body").evaluate((el) => (el as HTMLElement).style.maxHeight),
        { timeout: 3_000 },
      )
      .toBe("");
  });
});

test.describe("T8 keyboard (body host)", () => {
  test("Tab bridges trigger→link with a staged pending close; link survives past CLOSE_DELAY", async ({
    page,
  }) => {
    // Deterministic timer staging: freeze the page clock so the 120ms close
    // timer cannot fire between the pointer leave and the Tab press.
    await page.clock.install();
    await page.goto(`${baseUrl}/live.html?case=learnmore`);
    await page.getByTestId("harness-ready").waitFor({ state: "attached" });
    const trigger = page.getByTestId("lm-help-trigger");
    await trigger.hover(); // hover-open
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.mouse.move(5, 5); // leave: schedules the 120ms close timer (frozen)
    await trigger.focus();
    await page.keyboard.press("Tab"); // bridge fires, MUST clear the pending timer
    const focusedHref = await page.evaluate(
      () => (document.activeElement as HTMLAnchorElement)?.href ?? "",
    );
    expect(focusedHref).toContain("/help/admin");
    await page.clock.runFor(500); // well past CLOSE_DELAY_MS — cleared timer never fires
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  test("forward Tab from link closes and returns focus to trigger; Shift+Tab keeps it open", async ({
    page,
  }) => {
    await page.goto(`${baseUrl}/live.html?case=learnmore`);
    await page.getByTestId("harness-ready").waitFor({ state: "attached" });
    await clickOpen(page, "lm-help");
    const trigger = page.getByTestId("lm-help-trigger");
    await trigger.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab"); // back to trigger, still open
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Tab"); // to link again
    await page.keyboard.press("Tab"); // forward from link: closes + returns
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });
});

/** §3.3 clamp formula re-applied to LIVE rects - shared by all caret cases. */
function caretExpectedLeft(t: Box, b: Box): number {
  const center0 = (t.left + t.right) / 2;
  const center = Math.min(Math.max(center0, b.left + CARET_EDGE_INSET), b.right - CARET_EDGE_INSET);
  return center - CARET_WIDTH / 2;
}

async function styleOf(
  page: Page,
  testId: string,
  inner: boolean,
  props: string[],
): Promise<Record<string, string>> {
  return page.evaluate(
    ({ testId, inner, props }) => {
      let el = document.querySelector(`[data-testid="${testId}"]`);
      if (inner) el = el?.firstElementChild ?? null;
      if (!el) throw new Error(`missing ${testId}${inner ? " inner" : ""}`);
      const cs = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
    },
    { testId, inner, props },
  );
}

test.describe("caret geometry (spec 2026-07-22-hoverhelp-caret-blur-close §8)", () => {
  test("T-E1: tracking caret centers on a wide trigger and fills the gap", async ({ page }) => {
    await open(page, "caret", "caret-track");
    const t = await box(page, "caret-track-trigger");
    const b = await box(page, "caret-track-body");
    const c = await box(page, "caret-track-caret");
    const center0 = (t.left + t.right) / 2;
    // fixture precondition: tracking branch
    expect(center0).toBeGreaterThanOrEqual(b.left + CARET_EDGE_INSET);
    expect(center0).toBeLessThanOrEqual(b.right - CARET_EDGE_INSET);
    expect(Math.abs(c.left - caretExpectedLeft(t, b))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(c.bottom - b.top)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(c.top - t.bottom)).toBeLessThanOrEqual(TOL);
  });

  test("T-E2: deep clamp pins the caret inside the body span", async ({ page }) => {
    await open(page, "caret", "caret-clamp");
    const t = await box(page, "caret-clamp-trigger");
    const b = await box(page, "caret-clamp-body");
    const c = await box(page, "caret-clamp-caret");
    const center0 = (t.left + t.right) / 2;
    // fixture precondition: deep-pin branch
    expect(center0).toBeGreaterThan(b.right - CARET_EDGE_INSET);
    expect(Math.abs(c.left - caretExpectedLeft(t, b))).toBeLessThanOrEqual(TOL);
    const caretCenter = (c.left + c.right) / 2;
    expect(caretCenter).toBeGreaterThanOrEqual(b.left + CARET_EDGE_INSET - TOL);
    expect(caretCenter).toBeLessThanOrEqual(b.right - CARET_EDGE_INSET + TOL);
  });

  test("T-E3: side-top caret sits under the body, apex down", async ({ page }) => {
    await open(page, "caret", "caret-top");
    const b = await box(page, "caret-top-body");
    const c = await box(page, "caret-top-caret");
    expect(Math.abs(c.top - b.bottom)).toBeLessThanOrEqual(TOL);
    await expect(page.getByTestId("caret-top-caret")).toHaveAttribute("data-popover-side", "top");
    const s = await styleOf(page, "caret-top-caret", false, [
      "border-top-width",
      "border-bottom-width",
    ]);
    expect(s["border-top-width"]).toBe(`${CARET_HEIGHT}px`);
    expect(s["border-bottom-width"]).toBe("0px");
  });

  test("T-E5: scroll reflow - caret reposition keeps document coords stable and abuts the trigger", async ({
    page,
  }) => {
    // Reuses the tall `scrolly` fixture (3000px page, trigger at y=1500).
    // Live-rect relations alone cannot catch a scroll-term bug applied
    // consistently to body AND caret (document siblings shift together), so
    // this asserts DOCUMENT-COORD STABILITY of the rewritten style.top:
    // reposition writes viewportY + scrollY; the terms cancel across a
    // scroll, so a missing or doubled scrollY term shifts the value by the
    // scroll delta and fails.
    const INITIAL_SCROLL_Y = 1200; // matches the existing scrolly-case scroll depth
    const SCROLL_DELTA = 60;
    await page.goto(`${baseUrl}/live.html?case=scrolly`);
    await page.getByTestId("harness-ready").waitFor({ state: "attached" });
    await page.evaluate((y) => window.scrollTo(0, y), INITIAL_SCROLL_Y);
    await clickOpen(page, "scrolly-help");
    const styleTop = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="scrolly-help-caret"]');
        if (!(el instanceof HTMLElement)) throw new Error("caret missing");
        return parseFloat(el.style.top);
      });
    const before = await styleTop();
    await page.evaluate((dy) => window.scrollBy(0, dy), SCROLL_DELTA);
    // precondition: the scroll actually happened (converge - scroll delivery is async)
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(INITIAL_SCROLL_Y + SCROLL_DELTA);
    // converge on the coalesced reposition instead of counting frames
    await expect
      .poll(async () => Math.abs((await styleTop()) - before), { timeout: 5_000 })
      .toBeLessThanOrEqual(TOL);
    // and the caret still abuts the LIVE trigger + formula after the reflow
    const t = await box(page, "scrolly-help-trigger");
    const b = await box(page, "scrolly-help-body");
    const c = await box(page, "scrolly-help-caret");
    expect(Math.abs(c.top - t.bottom)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(c.left - caretExpectedLeft(t, b))).toBeLessThanOrEqual(TOL);
  });

  test("T-E6: visual contract - triangles, tokens, seam, stacking (both orientations)", async ({
    page,
  }) => {
    for (const [kase, id, apexUp] of [
      ["caret", "caret-track", true],
      ["caret", "caret-top", false],
    ] as const) {
      await open(page, kase, id);
      const bodyS = await styleOf(page, `${id}-body`, false, [
        "border-top-color",
        "background-color",
        "z-index",
      ]);
      const outerS = await styleOf(page, `${id}-caret`, false, [
        "border-left-width",
        "border-right-width",
        "border-left-color",
        "border-right-color",
        "border-top-width",
        "border-bottom-width",
        "border-top-color",
        "border-bottom-color",
        "z-index",
      ]);
      const innerS = await styleOf(page, `${id}-caret`, true, [
        "border-left-width",
        "border-right-width",
        "border-left-color",
        "border-right-color",
        "border-top-width",
        "border-bottom-width",
        "border-top-color",
        "border-bottom-color",
      ]);
      const TRANSPARENT = "rgba(0, 0, 0, 0)";
      for (const s of [outerS, innerS]) {
        expect(s["border-left-width"]).toBe(`${CARET_WIDTH / 2}px`);
        expect(s["border-right-width"]).toBe(`${CARET_WIDTH / 2}px`);
        expect(s["border-left-color"]).toBe(TRANSPARENT);
        expect(s["border-right-color"]).toBe(TRANSPARENT);
      }
      const apex = apexUp ? "bottom" : "top";
      const off = apexUp ? "top" : "bottom";
      expect(outerS[`border-${apex}-width`]).toBe(`${CARET_HEIGHT}px`);
      expect(outerS[`border-${off}-width`]).toBe("0px");
      expect(innerS[`border-${apex}-width`]).toBe(`${CARET_HEIGHT}px`);
      expect(innerS[`border-${off}-width`]).toBe("0px");
      // outer apex color = the body's border color; inner apex = body fill
      expect(outerS[`border-${apex}-color`]).toBe(bodyS["border-top-color"]);
      expect(innerS[`border-${apex}-color`]).toBe(bodyS["background-color"]);
      expect(outerS["z-index"]).toBe(bodyS["z-index"]);
      // rect deltas: inner alignment + seam overhang (position math, not clipping proof)
      const b = await box(page, `${id}-body`);
      const outer = await box(page, `${id}-caret`);
      const inner = await page.evaluate((tid) => {
        const el = document.querySelector(`[data-testid="${tid}"]`)?.firstElementChild;
        if (!el) throw new Error("inner missing");
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }, `${id}-caret`);
      expect(Math.abs(inner.left - outer.left)).toBeLessThanOrEqual(TOL);
      if (apexUp) {
        expect(Math.abs(inner.top - outer.top - CARET_INNER_OFFSET)).toBeLessThanOrEqual(TOL);
        expect(Math.abs(inner.bottom - b.top - CARET_INNER_OFFSET)).toBeLessThanOrEqual(TOL);
      } else {
        expect(Math.abs(outer.top - inner.top - CARET_INNER_OFFSET)).toBeLessThanOrEqual(TOL);
        expect(Math.abs(b.bottom - inner.top - CARET_INNER_OFFSET)).toBeLessThanOrEqual(TOL);
      }
    }
  });

  test("T-E4: real Tab-away closes a plain popover; focus lands on the destination", async ({
    page,
  }) => {
    await page.goto(`${baseUrl}/live.html?case=caret`);
    await page.getByTestId("harness-ready").waitFor({ state: "attached" });
    const trigger = page.getByTestId("caret-blur-trigger");
    await trigger.focus();
    await page.keyboard.press("Enter"); // native button: Enter fires click -> toggles open
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    const active = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") ?? null,
    );
    expect(active).toBe("after-btn"); // blur-close never moves focus
  });

  test("T-E4b: real blur from the PORTALED link to an outside control closes", async ({ page }) => {
    await open(page, "caret", "caret-lm"); // body-host learnMore: blur-close ACTIVE
    const trigger = page.getByTestId("caret-lm-trigger");
    await trigger.focus();
    await page.keyboard.press("Tab"); // body-host bridge sends focus into the link
    const onLink = await page.evaluate(
      () => document.activeElement?.getAttribute("href") === "/help/admin",
    );
    expect(onLink).toBe(true);
    await page.getByTestId("after-btn").click(); // focuses the button -> link focusout
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
