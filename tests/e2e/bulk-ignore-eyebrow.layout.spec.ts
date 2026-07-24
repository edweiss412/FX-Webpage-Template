/**
 * tests/e2e/bulk-ignore-eyebrow.layout.spec.ts (crewwarn-instance-discriminator
 * Task 5 — DEFERRED CREWWARN-INCARD-MOBILE-EYEBROW-1)
 *
 * Real-browser 390px geometry for the data-quality group eyebrow row in
 * <BulkIgnoreControls>: the eyebrow label must WRAP (never ellipsize), the row
 * must not overflow horizontally, and the eyebrow and chip bounding boxes must
 * stay disjoint — in BOTH chip states, because the armed morph ("Ignore all 2"
 * -> "Confirm ignore all 2") lengthens the chip and re-allocates row width
 * (spec §2.6 geometric interaction). jsdom computes none of this.
 *
 * HARNESS (standalone, no app boot — pattern:
 * blocked-row-resolver-transitions.spec.ts):
 *   1. bundles tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx (createRoot + the real
 *      component + AppRouterContext stub) with version-pinned
 *      `pnpm dlx esbuild@0.28.0` — the entry is never imported here.
 *   2. compiles REAL production Tailwind (tailwind CLI over a copy of
 *      app/globals.css with an explicit `@source` on BulkIgnoreControls.tsx) so
 *      truncate/min-w-0/flex utilities actually apply — a bundle without the
 *      compiled CSS would make the pre-fix RED run vacuous.
 *   3. serves live.html (#root + bundle.js + out.css) over node:http.
 *
 * Runs standalone via tests/e2e/standalone.config.ts (allow-listed there):
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/bulk-ignore-eyebrow.layout.spec.ts
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

// CommonJS package — Playwright's CJS loader provides __dirname.
const REPO_ROOT = resolve(__dirname, "..", "..");

// Independent byte pin of MESSAGE_CATALOG.FIELD_UNREADABLE.title: the harness
// label imports the LIVE catalog value, so catalog drift fails assertion (d)
// here instead of moving both sides together.
const EXPECTED_TITLE = "Phone or email we couldn't use";

const EYEBROW = '[data-testid="dq-group-label-FIELD_UNREADABLE"]';
const CHIP = '[data-testid="dq-bulk-ignore-FIELD_UNREADABLE"]';

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "bulk-ignore-eyebrow-live-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  execFileSync(
    "pnpm",
    [
      "dlx",
      "esbuild@0.28.0",
      join(REPO_ROOT, "tests", "e2e", "_bulkIgnoreEyebrowLiveEntry.tsx"),
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      "--loader:.tsx=tsx",
      '--define:process.env.NODE_ENV="production"',
      "--external:node:fs",
      `--tsconfig=${join(REPO_ROOT, "tsconfig.json")}`,
      '--banner:js=window.process=window.process||{env:{NODE_ENV:"production"}};',
      `--outfile=${join(workDir, "bundle.js")}`,
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    `@source "${join(REPO_ROOT, "components", "admin", "BulkIgnoreControls.tsx")}";\n${globals}`,
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
      res.end("not found");
    }
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no server address");
  baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
});

for (const state of ["idle", "armed"] as const) {
  test(`390px eyebrow row, ${state}: wrapped, no overflow, disjoint from chip, full title`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl);
    await page.waitForSelector(CHIP);
    if (state === "armed") {
      await page.click(CHIP); // single real click arms the chip
      await page.waitForFunction(
        (sel) => document.querySelector(sel)!.textContent!.startsWith("Confirm"),
        CHIP,
      );
    }
    const m = await page.evaluate(
      ([eyebrowSel, chipSel]) => {
        const eyebrow = document.querySelector(eyebrowSel!)!;
        const chip = document.querySelector(chipSel!)!;
        const row = eyebrow.parentElement!;
        const e = eyebrow.getBoundingClientRect();
        const c = chip.getBoundingClientRect();
        const ix = Math.min(e.right, c.right) - Math.max(e.left, c.left);
        const iy = Math.min(e.bottom, c.bottom) - Math.max(e.top, c.top);
        return {
          eyebrowClipped: eyebrow.scrollWidth > eyebrow.clientWidth,
          rowOverflow: row.scrollWidth > row.clientWidth,
          overlap: ix > 0.5 && iy > 0.5,
          text: eyebrow.textContent,
        };
      },
      [EYEBROW, CHIP],
    );
    expect(m.eyebrowClipped).toBe(false); // (a) not ellipsized: THE red assertion pre-fix
    expect(m.rowOverflow).toBe(false); // (b) no horizontal overflow
    expect(m.overlap).toBe(false); // (c) eyebrow x chip bboxes disjoint
    expect(m.text).toBe(EXPECTED_TITLE); // (d) catalog-drift pin (not red evidence: ellipsis clips paint, not textContent)
  });
}
