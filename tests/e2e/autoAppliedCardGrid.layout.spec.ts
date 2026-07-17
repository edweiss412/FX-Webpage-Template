/**
 * tests/e2e/autoAppliedCardGrid.layout.spec.ts — real-browser width-distribution
 * gate for the RecentAutoAppliedStrip change-card button grid (AUTOAPPLIED-REDESIGN-1,
 * spec §6). Runs under tests/e2e/standalone.config.ts (self-contained: compiles real
 * Tailwind from app/globals.css via the pinned CLI and serves the harness over
 * node:http; NO Next route → no dev-route registries).
 *
 * WHY A REAL BROWSER (jsdom is insufficient): jsdom does not compute CSS grid track
 * sizes, so `grid-cols-2`'s two `1fr` columns and the `w-full` buttons resolve to
 * zero-width boxes there — the strip's jsdom test can only assert the class strings
 * are present, not that the pixels actually split 50/50. Only a layout engine proves
 * each button occupies half the card (undoable rows) or the full card (single-action
 * rows), and that the two halves plus the gap reconstruct the full width.
 *
 * HARNESS: tests/e2e/_autoAppliedCardGridHarness.tsx is run via `tsx` (a main-guard
 * JSON writer) and is NOT imported here — Playwright's transform rewrites JSX into
 * non-renderable payloads (same boundary as dataQualityBadge.layout.spec.ts). It
 * renders the REAL RecentAutoAppliedStrip, so this gate breaks if the card grid is
 * moved off `grid-cols-2 / grid-cols-1 + w-full`.
 *
 * ANTI-TAUTOLOGY: every expected value is DERIVED from measured button boxes — the
 * gap is read from the undoable row and reused for the single-row reconstruction; no
 * pixel width is hardcoded, and no grid-class selector is used. The single-action
 * width is checked against (accept + undo + gap) of an undoable row in the same card,
 * not against a constant.
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
  const workDir = mkdtempSync(join(tmpdir(), "auto-applied-grid-"));
  const outJson = join(workDir, "pages.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_autoAppliedCardGridHarness.tsx"), outJson],
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

type Box = { x: number; width: number; right: number };

async function box(page: Page, selector: string): Promise<Box> {
  const bb = await page.locator(selector).first().boundingBox();
  expect(bb, `bounding box for ${selector}`).not.toBeNull();
  return { x: bb!.x, width: bb!.width, right: bb!.x + bb!.width };
}

function rowSel(id: string, testid: string): string {
  return `[data-testid="auto-applied-row-${id}"] [data-testid="${testid}"]`;
}

test("undoable rows split the card 1fr/1fr — Accept and Undo are equal halves", async ({
  page,
}) => {
  await page.goto(baseUrl);
  for (const rowId of ["u1", "u2"]) {
    const accept = await box(page, rowSel(rowId, "change-feed-accept"));
    const undo = await box(page, rowSel(rowId, "change-feed-undo"));
    expect(
      Math.abs(accept.width - undo.width),
      `${rowId}: Accept vs Undo width (equal 1fr columns)`,
    ).toBeLessThanOrEqual(0.5);
    // The two cells are side-by-side (Undo to the right of Accept), not stacked.
    expect(undo.x, `${rowId}: Undo sits right of Accept`).toBeGreaterThan(accept.right);
  }
});

test("single-action row is full width — Accept == undoable(Accept + gap + Undo)", async ({
  page,
}) => {
  await page.goto(baseUrl);
  // Reference undoable row: derive the inter-cell gap from its measured boxes
  // (no hardcoded pixel — gap-1.5 could change; we read what the browser laid out).
  const uAccept = await box(page, rowSel("u1", "change-feed-accept"));
  const uUndo = await box(page, rowSel("u1", "change-feed-undo"));
  const gap = uUndo.x - uAccept.right;
  expect(gap, "measured inter-cell gap is a small positive value").toBeGreaterThan(0);

  // The single-action row has NO Undo control (grid-cols-1).
  await expect(page.locator(rowSel("s1", "change-feed-undo"))).toHaveCount(0);

  // Full-width invariant: the lone Accept spans the whole card, i.e. it equals the
  // two undoable halves plus the gap between them — reconstructed from measurement.
  const sAccept = await box(page, rowSel("s1", "change-feed-accept"));
  const reconstructedFull = uAccept.width + gap + uUndo.width;
  expect(
    Math.abs(sAccept.width - reconstructedFull),
    "single Accept width == undoable(Accept + gap + Undo)",
  ).toBeLessThanOrEqual(0.5);

  // Sanity: both rows sit in the same card, so their left edges align (same track).
  expect(Math.abs(sAccept.x - uAccept.x), "rows share the same left edge").toBeLessThanOrEqual(0.5);
});
