/**
 * tests/e2e/pendingDiscardReal.layout.spec.ts
 * Real-TREE layout proof for the pending-discard fork
 * (spec 2026-07-25-destruct-thumb-order-drift-guard §6.3.a).
 *
 * The sibling `pendingDiscardReflow.layout.spec.ts` transcribes classes into
 * local constants. Adversarial rounds 2 and 3 both landed on the same defect in
 * that approach: a transcription can satisfy every assertion while the SHIPPED
 * component differs. The concrete case is `w-full` on the `@container` root —
 * load-bearing, because `container-type: inline-size` collapses a shrink-to-fit
 * flex item to 0px — which a transcribed panel supplies from the harness rather
 * than from the component.
 *
 * So every POSITIVE claim about the shipped component lives here, measured
 * against markup rendered by the real component tree
 * (`tests/e2e/_pendingDiscardHarness.tsx` renders the real NeedsAttentionInbox,
 * hence the real PendingPanelDiscardButtons inside real card padding, the real
 * action row and the real `Retry now` sibling). The transcribed spec keeps only
 * negative controls — markup the product no longer contains.
 *
 * SCOPE: `renderToStaticMarkup` emits markup, not behaviour. Classes and layout
 * are provable here; client effects (useEffect, timers, ResizeObserver) are not,
 * and stay in the jsdom suite.
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const TAP_MIN = 44;
const INGESTION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** Live geometries. 320 = dashboard rail (`min-[1240px]:w-80`); 390 = the mobile
 *  Needs-attention page; 900 = a full-width card. Single source for the widths so
 *  a threshold change cannot leave a panel testing the old boundary. */
const STATES = { rail320: 320, page390: 390, wide900: 900 } as const;
type StateName = keyof typeof STATES;

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "pending-discard-real-"));
  const jsonPath = join(workDir, "states.json");

  // The harness's JSX + the real component tree break react-dom/server under
  // Playwright's transform, so it runs OUT of process (same as the modal-header
  // family harnesses).
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_pendingDiscardHarness.tsx"), jsonPath],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const states = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, string>;

  const body = Object.entries(states)
    .map(([name, html]) => `<section data-state="${name}">${html}</section>`)
    .join("\n");
  const harnessHtml = `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="out.css"></head>
<body class="bg-bg" style="margin:0;padding:16px;">${body}</body></html>`;
  writeFileSync(join(workDir, "harness.html"), harnessHtml);

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "harness.html" : url.replace(/^\//, "");
    try {
      const payload = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(payload);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

type Box = { x: number; y: number; w: number; h: number; bottom: number; right: number };
type Probe = {
  railW: number;
  rootW: number;
  rootHasWFull: boolean;
  rootHasContainer: boolean;
  stackedDisplay: string;
  inlineDisplay: string;
  defer: Box;
  ignore: Box;
};

async function probe(page: import("@playwright/test").Page, state: StateName): Promise<Probe> {
  return page.evaluate(
    ({ state, id }) => {
      const root = document.querySelector(`[data-state="${state}"]`)!;
      const rail = root.querySelector('[data-testid="rail"]')!;
      const defer = root.querySelector(`[data-testid="admin-pending-defer-${id}"]`)!;
      const ignore = root.querySelector(`[data-testid="admin-pending-ignore-${id}"]`)!;
      // The component's own outermost element — the one that must carry
      // `w-full @container`. Found from a button upward, so this reads the SHIPPED
      // tree rather than a selector the harness chose.
      const container = defer.closest(".\\@container") as HTMLElement | null;
      const b = (el: Element): Box => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
      };
      const stacked = root.querySelector('[data-testid^="admin-pending-defer"]')!.parentElement!;
      const siblings = container ? Array.from(container.querySelectorAll(":scope > div > div")) : [];
      const displays = siblings.map((s) => getComputedStyle(s).display);
      return {
        railW: rail.getBoundingClientRect().width,
        rootW: container ? container.getBoundingClientRect().width : -1,
        rootHasWFull: container ? container.classList.contains("w-full") : false,
        rootHasContainer: container !== null,
        stackedDisplay: displays[0] ?? "missing",
        inlineDisplay: displays[1] ?? "missing",
        defer: b(defer),
        ignore: b(ignore),
        _unused: stacked.tagName,
      } as unknown as Probe;
    },
    { state, id: INGESTION_ID },
  );
}

for (const [state, width] of Object.entries(STATES) as [StateName, number][]) {
  test(`${state}: the shipped root carries w-full + @container and does NOT collapse`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(baseUrl);
    const p = await probe(page, state);

    // Read off RENDERED markup, not the source file: this is the assertion round 3
    // showed was missing everywhere, and it is why this spec exists.
    expect(p.rootHasContainer, "shipped root must establish a container context").toBe(true);
    expect(p.rootHasWFull, "shipped root must carry w-full").toBe(true);

    // The direct 0px-collapse test. `container-type: inline-size` severs inline size
    // from contents, so a shrink-to-fit root measures 0 and the buttons shrink to
    // ~26px. This assertion cannot pass if w-full is dropped.
    expect(p.rootW, "container root collapsed — w-full missing?").toBeGreaterThan(width * 0.5);
    expect(Math.abs(p.rootW - p.railW)).toBeLessThanOrEqual(TOL + 42); // rail minus card padding/borders
  });

  test(`${state}: exactly one branch copy is displayed`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(baseUrl);
    const p = await probe(page, state);
    const hiddenCount = [p.stackedDisplay, p.inlineDisplay].filter((d) => d === "none").length;
    expect(hiddenCount, `displays: ${p.stackedDisplay} / ${p.inlineDisplay}`).toBe(1);
  });

  test(`${state}: tap targets clear ${TAP_MIN}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(baseUrl);
    const p = await probe(page, state);
    expect(p.defer.h).toBeGreaterThanOrEqual(TAP_MIN - TOL);
    expect(p.ignore.h).toBeGreaterThanOrEqual(TAP_MIN - TOL);
  });
}

test("rail320 + page390: the safe action is NOT above the destructive one", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  for (const state of ["rail320", "page390"] as StateName[]) {
    const p = await probe(page, state);
    const stacked = p.ignore.y >= p.defer.bottom - TOL || p.defer.y >= p.ignore.bottom - TOL;
    if (stacked) {
      // D5: when they stack, Ignore must be ABOVE Defer.
      expect(p.ignore.bottom, `${state}: Ignore must sit above Defer when stacked`).toBeLessThanOrEqual(
        p.defer.y + TOL,
      );
    } else {
      // D3: when they share a row, Defer must be on the LEFT.
      expect(p.defer.x, `${state}: Defer must be left of Ignore when inline`).toBeLessThan(p.ignore.x);
    }
  }
});

test("wide900: they share one row with Defer on the left", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  const p = await probe(page, "wide900");
  expect(Math.abs(p.ignore.y - p.defer.y)).toBeLessThanOrEqual(TOL);
  expect(p.defer.x).toBeLessThan(p.ignore.x);
});
