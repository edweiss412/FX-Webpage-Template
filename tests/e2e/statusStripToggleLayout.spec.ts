/**
 * tests/e2e/statusStripToggleLayout.spec.ts (CASP-2 — spec §8.10)
 *
 * Real-browser geometry for the compact inline PublishedToggle in the sticky
 * StatusStrip at a 390px phone. jsdom computes NO layout, so the strip-height +
 * popover-containment invariants MUST be measured end-to-end. STANDALONE static
 * harness (no app boot / Supabase), modelled on showPageLayout.spec.ts:
 *   1. `tsx` runs _statusStripToggleHarness.tsx OUT of process → JSON of the
 *      rendered states. HASH_FOR_LOG_PEPPER is set for the subprocess only to
 *      satisfy a module-load guard reached via a transitively-imported helper.
 *   2. compile the token CSS from app/globals.css via the Tailwind CLI with
 *      @source globbing every state's html so all classes generate.
 *   3. serve over node:http; measure getBoundingClientRect() at 390px.
 *
 * Invariants (spec §8.10):
 *   (a) height-invariance: strip height(idle) === height(finalize) ±0.5px — the
 *       popover is position:absolute, so it adds zero flow height.
 *   (b) compaction: inline idle strip height < card-variant strip height by
 *       > 20px (one text-line) — proves real compaction, baseline from the card
 *       render in the same harness (never a hardcoded pixel).
 *   (c) containment: the finalize popover stays within [0, 390] with no document
 *       horizontal scroll, at BOTH the short and long title (different wrap x).
 *   (d) error-content probe: the REAL ErrorExplainer+HelpAffordance content in a
 *       max-w-60 break-words box measures ≤240px wide and in-viewport — the error
 *       popover's content (unlike the short finalize hint) can't overflow.
 *
 * Runs via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const MOBILE = { width: 390, height: 800 };

// Duplicated here + cross-checked against the harness JSON so the two never drift.
const SLUG = "casp2-toggle-show";

type HarnessJson = {
  slug: string;
  idleShort: string;
  idleLong: string;
  finalizeShort: string;
  finalizeLong: string;
  cardShort: string;
  errorProbe: string;
};

function pageHtml(cssHref: string, body: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">${body}</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "casp2-toggle-layout-"));

  const jsonPath = join(workDir, "states.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_statusStripToggleHarness.tsx"), jsonPath],
    {
      cwd: REPO_ROOT,
      stdio: "pipe",
      timeout: 120_000,
      env: { ...process.env, HASH_FOR_LOG_PEPPER: "test-harness-pepper-000000000000000000" },
    },
  );
  const states = JSON.parse(readFileSync(jsonPath, "utf8")) as HarnessJson;
  expect(states.slug, "spec-local slug matches the harness fixture").toBe(SLUG);

  // Each state → its own served html (all reference out.css — identical class
  // strings, only markup differs).
  const keys: (keyof HarnessJson)[] = [
    "idleShort",
    "idleLong",
    "finalizeShort",
    "finalizeLong",
    "cardShort",
    "errorProbe",
  ];
  for (const k of keys) writeFileSync(join(workDir, `${k}.html`), pageHtml("out.css", states[k]));

  // Compile the token CSS once, globbing every state html so all classes generate.
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "*.html")}";\n${globals}`);
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "idleShort.html" : url.replace(/^\//, "");
    try {
      const bodyBuf = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(bodyBuf);
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

async function rectOf(
  page: import("@playwright/test").Page,
  stateKey: string,
  testid: string,
): Promise<{ left: number; right: number; width: number; height: number }> {
  await page.setViewportSize(MOBILE);
  await page.goto(`${baseUrl}${stateKey}.html`);
  const el = page.getByTestId(testid);
  await expect(el).toBeVisible();
  return el.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, height: r.height };
  });
}

async function noHorizontalOverflow(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

test.describe("CASP-2 inline toggle strip — 390px geometry (spec §8.10)", () => {
  test("(a) the absolute popover adds zero strip-flow height (idle === finalize)", async ({
    page,
  }) => {
    const idle = await rectOf(page, "idleShort", "show-status-strip");
    const finalize = await rectOf(page, "finalizeShort", "show-status-strip");
    expect(Math.abs(idle.height - finalize.height)).toBeLessThanOrEqual(0.5);
  });

  test("(b) the inline strip is materially shorter than the pre-CASP-2 card strip", async ({
    page,
  }) => {
    const inline = await rectOf(page, "idleShort", "show-status-strip");
    const card = await rectOf(page, "cardShort", "show-status-strip");
    // Baseline derived from the card render — not a hardcoded pixel count.
    expect(card.height - inline.height).toBeGreaterThan(20);
  });

  test("(c) the finalize popover stays in the viewport with no horizontal page scroll", async ({
    page,
  }) => {
    for (const key of ["finalizeShort", "finalizeLong"]) {
      const pop = await rectOf(page, key, "published-toggle-popover");
      expect(pop.left, `${key}: popover left edge`).toBeGreaterThanOrEqual(0);
      expect(pop.right, `${key}: popover right edge`).toBeLessThanOrEqual(390);
      expect(await noHorizontalOverflow(page), `${key}: no document h-scroll`).toBe(true);
    }
  });

  test("(d) the real error-popover content respects the 240px cap and stays in viewport", async ({
    page,
  }) => {
    const probe = await rectOf(page, "errorProbe", "error-content-probe-box");
    expect(probe.width, "error content wraps within max-w-60 (240px)").toBeLessThanOrEqual(240.5);
    expect(probe.left).toBeGreaterThanOrEqual(0);
    expect(probe.right).toBeLessThanOrEqual(390);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});
