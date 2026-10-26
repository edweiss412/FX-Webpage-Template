/**
 * tests/e2e/hotel-stay-stub.layout.spec.ts — real-browser reflow gate for the
 * review modal's hotel date stub (HotelCard in step3ReviewSections.tsx). Runs
 * under tests/e2e/standalone.config.ts: compiles real Tailwind from
 * app/globals.css and serves the harness over node:http, with no Next route.
 *
 * WHY A REAL BROWSER: the defect is geometric. At a 320px phone row, or at
 * 125% text, the night-count label used to paint over both dates and the
 * check-out end spilled past the sunken plate. Class-presence tests cannot see
 * that; only a layout engine computes it.
 *
 * ANTI-TAUTOLOGY: every assertion measures the stub against ITS OWN ends and
 * label, never a hardcoded pixel. The overlap check alone would pass a fix that
 * always stacked the label under the dates, so the desktop case also asserts the
 * approved design still holds there: the label sits on the same row as the
 * dates. The case widths come back from the harness JSON, not a second copy.
 */
import { test, expect } from "./helpers/fontFidelityFixture";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";

const REPO_ROOT = join(__dirname, "..", "..");
const TEXT_SCALES = ["100%", "125%"] as const;
let server: Server;
let baseUrl: string;
let widths: number[] = [];

function pageHtml(cssHref: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/${cssHref}"></head><body>${body}</body></html>`;
}

test.beforeAll(async () => {
  const workDir = mkdtempSync(join(tmpdir(), "hotel-stub-dim-"));
  const outJson = join(workDir, "pages.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_hotelStayStubHarness.tsx"), outJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const parsed = JSON.parse(readFileSync(outJson, "utf8")) as { body: string; widths: number[] };
  widths = parsed.widths;
  writeFileSync(join(workDir, "harness.html"), pageHtml("out.css", parsed.body));

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);
  compileEntryCss({ entryCss: entryCss, outFile: join(workDir, "out.css") });

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

type Rect = { left: number; right: number; top: number; bottom: number };
type StubGeometry = {
  stub: Rect & { scrollWidth: number; clientWidth: number };
  checkIn: Rect;
  checkOut: Rect;
  nights: Rect | null;
};

async function measureStubs(page: Page, width: number): Promise<StubGeometry[]> {
  return page.evaluate((w) => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const cards = document.querySelectorAll(`#case-${w} [data-testid="wizard-step3-hotel-card"]`);
    return [...cards].map((card) => {
      const checkIn = card.querySelector('[data-testid="hotel-stay-check-in"]')!;
      const checkOut = card.querySelector('[data-testid="hotel-stay-check-out"]')!;
      const nights = card.querySelector('[data-testid="hotel-stay-nights"]');
      const stub = checkIn.parentElement!;
      return {
        stub: { ...rect(stub), scrollWidth: stub.scrollWidth, clientWidth: stub.clientWidth },
        checkIn: rect(checkIn),
        checkOut: rect(checkOut),
        nights: nights ? rect(nights) : null,
      };
    });
  }, width);
}

function overlapArea(a: Rect, b: Rect): number {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > 0 && y > 0 ? x * y : 0;
}

async function load(page: Page, scale: string): Promise<void> {
  await page.goto(baseUrl);
  await page.evaluate((s) => {
    document.documentElement.style.fontSize = s;
  }, scale);
  await page.evaluate(() => document.fonts.ready);
}

for (const scale of TEXT_SCALES) {
  test(`stub never overlaps or overflows at any card width, text ${scale}`, async ({ page }) => {
    await load(page, scale);
    expect(widths.length, "harness reported its case widths").toBeGreaterThan(0);
    for (const w of widths) {
      const stubs = await measureStubs(page, w);
      expect(stubs.length, `case ${w}: both reservations rendered`).toBe(2);
      for (const [i, g] of stubs.entries()) {
        const where = `case ${w}, card ${i}, text ${scale}`;
        expect(g.nights, `${where}: fixture has a night count`).not.toBeNull();
        expect(overlapArea(g.nights!, g.checkIn), `${where}: label vs check-in`).toBe(0);
        expect(overlapArea(g.nights!, g.checkOut), `${where}: label vs check-out`).toBe(0);
        expect(g.stub.scrollWidth, `${where}: stub scrolls sideways`).toBeLessThanOrEqual(
          g.stub.clientWidth,
        );
        for (const [name, end] of [
          ["check-in", g.checkIn],
          ["check-out", g.checkOut],
        ] as const) {
          expect(end.left, `${where}: ${name} left edge`).toBeGreaterThanOrEqual(g.stub.left - 0.5);
          expect(end.right, `${where}: ${name} right edge`).toBeLessThanOrEqual(g.stub.right + 0.5);
        }
      }
    }
  });
}

test("desktop modal keeps the approved one-row stub: label between the dates", async ({ page }) => {
  await load(page, "100%");
  const widest = Math.max(...widths);
  for (const g of await measureStubs(page, widest)) {
    const n = g.nights!;
    expect(n.left, "label starts right of check-in").toBeGreaterThanOrEqual(g.checkIn.right);
    expect(n.right, "label ends left of check-out").toBeLessThanOrEqual(g.checkOut.left);
    expect(n.top, "label within the dates' row (top)").toBeGreaterThanOrEqual(g.checkIn.top);
    expect(n.bottom, "label within the dates' row (bottom)").toBeLessThanOrEqual(g.checkIn.bottom);
  }
});
