/**
 * tests/e2e/dataQualityBadge.layout.spec.ts — real-browser dimensional gate for
 * the DataQualityBadge chips (spec §5.4). Runs under tests/e2e/standalone.config.ts
 * (self-contained: compiles real Tailwind from app/globals.css via the pinned CLI
 * and serves the harness over node:http; NO Next route → no dev-route registries).
 *
 * WHY A REAL BROWSER (jsdom is insufficient): this project's Tailwind v4 does NOT
 * default `.flex` to `align-items: stretch`, and the invariant is about CSS line
 * boxes — `text-xs` is `0.75rem × 1.4 = 16.8px`, taller than the 16px `size-4`
 * glyph (FLOW4-2/3-POLISH; was 14px `size-3.5`). `leading-none` on the count
 * collapses that line box so the glyph stays
 * the tallest child and the badge height == glyph height. Only a layout engine
 * computes this.
 *
 * HARNESS: tests/e2e/_dataQualityBadgeHarness.tsx is run via `tsx` (a main-guard
 * JSON writer) and is NOT imported here — Playwright's transform rewrites JSX into
 * non-renderable payloads (same boundary as step3-review-modal.layout.spec.ts).
 *
 * ANTI-TAUTOLOGY: each badge is measured against ITS OWN glyph (both present in
 * every state); no hardcoded pixel value. The no-wrap check compares the two-chip
 * badge to the single-chip badge height.
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = join(__dirname, "..", "..");
let server: Server;
let baseUrl: string;

function pageHtml(cssHref: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/${cssHref}"></head><body>${body}</body></html>`;
}

test.beforeAll(async () => {
  const workDir = mkdtempSync(join(tmpdir(), "dq-badge-dim-"));
  const outJson = join(workDir, "pages.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_dataQualityBadgeHarness.tsx"), outJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const { body } = JSON.parse(readFileSync(outJson, "utf8")) as { body: string };
  writeFileSync(join(workDir, "harness.html"), pageHtml("out.css", body));

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
      const buf = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(buf);
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

async function boxHeight(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `bounding box for ${selector}`).not.toBeNull();
  return box!.height;
}

test("badge height equals its glyph height (leading-none holds the count line box)", async ({
  page,
}) => {
  await page.goto(baseUrl);
  for (const id of ["badge-gap", "badge-roster", "badge-both"]) {
    const badge = await boxHeight(page, `#${id} [role="img"]`);
    const glyph = await boxHeight(page, `#${id} [role="img"] svg`);
    expect(Math.abs(badge - glyph), `${id}: badge vs glyph height`).toBeLessThanOrEqual(0.5);
  }
});

test("adding the second chip does not wrap (both ≈ single-chip height)", async ({ page }) => {
  await page.goto(baseUrl);
  const roster = await boxHeight(page, `#badge-roster [role="img"]`);
  const both = await boxHeight(page, `#badge-both [role="img"]`);
  expect(Math.abs(both - roster), "both vs roster-only height").toBeLessThanOrEqual(0.5);
});
