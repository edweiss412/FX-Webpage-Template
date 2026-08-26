/**
 * tests/e2e/control-outline-contrast.live.spec.ts
 *
 * Spec: docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md
 * §14 and the done-condition's contrast half, AC-13.
 *
 * The three §14 pairs that render only inside the step-3 wizard review surface,
 * measured in a REAL browser rather than pinned from source. An earlier draft
 * of this arc claimed that route was closed because `CrewRowActions`
 * transitively imports `lib/auth/requireAdmin.ts`; that was wrong, and the
 * refutation is in this same directory. `_step3ReviewModalBundle.mjs` replaces
 * any `"use server"` module with a throwing stub and empties node builtins by
 * CLASS, which is exactly that edge, and `_step3ReviewModalLiveEntry.tsx`
 * mounts the real tree with react-dom/client. This spec reuses both.
 *
 * WHAT IT ASSERTS, and it is contrast rather than only geometry: the swept
 * outline is read off the COMPUTED style in both themes and its ratio against
 * the surface behind it must clear the 3:1 non-text floor (SC 1.4.11), which is
 * the done-condition this whole arc exists to move. Width parity is proved
 * elsewhere (`scripts/ac15-width-parity.mts`, 767 elements, 0 differences) and
 * cannot stand in for contrast.
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";

const REPO_ROOT = resolve(__dirname, "..", "..");
const MOBILE = { width: 390, height: 900 } as const;
const FLOOR = 3.0;

let server: Server | undefined;
let workDir: string;
let baseUrl = "";

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "control-outline-contrast-live-"));

  // NOTE on why this spec does not run the static tsx harness its two siblings
  // do. Running that harness BARE (`pnpm exec tsx …`) dies in
  // `lib/auth/requireDeveloper.ts`, but the cause is a missing e2e env
  // (`HASH_FOR_LOG_PEPPER`), NOT the module graph: with `.env.local` loaded it
  // renders 526KB fine. An earlier revision of this note called it broken on
  // main; it is not, and the correction is left visible rather than deleted.
  //
  // Those siblings use it only as a tailwind @source. So does this spec's need,
  // and the BUNDLE is a better source anyway: it is the same tree, it carries
  // every literal class string the live render can produce, and it is built by
  // the helper that already models Next's "use server" elision. One fewer
  // moving part, and not one that is currently red.
  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_controlOutlineContrastLiveEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "bundle.js")}";\n${globals}`);
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
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const addr = server!.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
});

async function open(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(MOBILE);
  await page.goto(baseUrl);
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.evaluate(() => document.fonts.ready);
  // The modal portals OUT of #root, so a childElementCount wait on #root never
  // resolves even though the tree mounted. Wait for a testid the tree renders.
  await page.waitForSelector('[data-testid$="-review-main"]', { state: "attached" });
}

/**
 * The computed outline colour of a testid, its parent chain's first opaque
 * background, and the WCAG ratio between them.
 *
 * The background is walked rather than assumed: the element's own fill is the
 * inner edge, and where it has none the ground behind it is what the outline is
 * read against, which is exactly how DESIGN.md §1.2 states each pinned row.
 */
async function outlineContrast(page: Page, testId: string) {
  return page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`);
    if (!el) return null;
    const parse = (c: string): [number, number, number] | null => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      if (m[4] !== undefined && Number(m[4]) === 0) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };
    const lum = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const border = parse(getComputedStyle(el).borderTopColor);
    let node: Element | null = el;
    let bg: [number, number, number] | null = null;
    while (node && !bg) {
      bg = parse(getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    if (!border || !bg) return { border: null, bg: null, ratio: null };
    const [hi, lo] = [lum(border), lum(bg)].sort((a, b) => b - a) as [number, number];
    return {
      border: getComputedStyle(el).borderTopColor,
      bg: bg.join(","),
      ratio: (hi + 0.05) / (lo + 0.05),
    };
  }, testId);
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: the venue Directions visual clears the 3:1 non-text floor`, async ({ page }) => {
    await open(page, theme);
    const region = page.locator('[data-testid="venue-map-region"]');
    await expect(region, "the fixture supplies a venue, so the tile mounts").toHaveCount(1);
    const visual = page.locator('[data-testid="venue-directions"]');
    await expect(visual, "the tile renders its Directions visual").toHaveCount(1);

    const measured = await outlineContrast(page, "venue-directions");
    expect(measured, "the visual is in the DOM").not.toBeNull();
    expect(
      measured!.ratio,
      `${theme}: ${measured!.border} on ${measured!.bg} is measurable`,
    ).not.toBeNull();
    expect(
      measured!.ratio!,
      `${theme}: ${measured!.border} on ${measured!.bg}`,
    ).toBeGreaterThanOrEqual(FLOOR);
  });

  test(`${theme}: the crew contact icon visuals clear the 3:1 non-text floor`, async ({ page }) => {
    await open(page, theme);
    // The crew rows' tel/mailto anchors, each wrapping the painted 32px visual
    // this arc swapped. Counted first so the loop below cannot pass vacuously.
    const anchors = page.locator('a[href^="tel:"], a[href^="mailto:"]');
    const count = await anchors.count();
    expect(count, "the fixture's crew carry phone and email, so both icons mount").toBeGreaterThan(
      0,
    );

    const ratios = await page.evaluate(() => {
      const parse = (c: string): [number, number, number] | null => {
        const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (!m) return null;
        if (m[4] !== undefined && Number(m[4]) === 0) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      };
      const lum = ([r, g, b]: [number, number, number]) => {
        const f = (v: number) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const out: { border: string; bg: string; ratio: number | null }[] = [];
      for (const a of document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]')) {
        const span = a.querySelector("span");
        if (!span) continue;
        const border = parse(getComputedStyle(span).borderTopColor);
        let node: Element | null = span;
        let bg: [number, number, number] | null = null;
        while (node && !bg) {
          bg = parse(getComputedStyle(node).backgroundColor);
          node = node.parentElement;
        }
        out.push({
          border: getComputedStyle(span).borderTopColor,
          bg: bg ? bg.join(",") : "none",
          ratio:
            border && bg
              ? (() => {
                  const [hi, lo] = [lum(border), lum(bg)].sort((x, y) => y - x) as [number, number];
                  return (hi + 0.05) / (lo + 0.05);
                })()
              : null,
        });
      }
      return out;
    });

    expect(ratios.length, "every anchor exposes its painted visual").toBe(count);
    for (const r of ratios) {
      expect(r.ratio, `${theme}: ${r.border} on ${r.bg} is measurable`).not.toBeNull();
      expect(r.ratio!, `${theme}: ${r.border} on ${r.bg}`).toBeGreaterThanOrEqual(FLOOR);
    }
  });
}
