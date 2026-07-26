/**
 * Childless-`flex-1` pusher rows — real browser, no dev server, no database.
 *
 * Runs under tests/e2e/standalone.config.ts, whose `testMatch` is an explicit
 * allow-list: this file's name must appear there or it runs nowhere and silently
 * proves nothing.
 *
 * TWO ORACLES, and neither substitutes for the other (spec §9.3):
 *
 *   (a) REINTRODUCTION — the row contains no childless growable child. Red today
 *       (each row holds its `flex-1` span), green once deleted, red again if one
 *       comes back.
 *   (b) TRAILING ALIGNMENT — the trailing cluster sits flush with the parent's
 *       content-box right edge. This is what catches a repair that deletes the
 *       spacer and forgets `ml-auto`, which (a) cannot see.
 *
 * A repair that deletes the spacer but forgets `ml-auto` passes (a) and fails (b);
 * one that adds `ml-auto` while leaving the spacer passes (b) and fails (a).
 *
 * PER SITE, NEVER AGGREGATED: an aggregate assertion can go red on the nav rows
 * while never exercising BellPanel at all.
 *
 * NOTE ON (a)'s FORM: spec §9.3 originally required a crowded fixture driven until
 * the spacer measured zero. That was AMENDED on measurement — neither nav spacer
 * ever reaches 0 across 320-1280 (minimums 59.91px and 134px, both at 360px),
 * because their children collapse responsively faster than the row narrows. So (a)
 * is structural for all three rows, with nothing to calibrate.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const REPO_ROOT = join(__dirname, "..", "..");

const HARNESS_ENV = {
  ...process.env,
  HASH_FOR_LOG_PEPPER: "fxav-section-header-harness-pepper-32-chars-min",
  JWT_SIGNING_SECRET: "fxav-section-header-harness-jwt-secret-32-min",
};

/** Each fixture, its page name, and the row the assertions target. */
const ROWS = [
  { key: "bellAuto", page: "bell-auto.html", row: '[data-testid="bell-action-cell-auto-1"]' },
  { key: "bellManual", page: "bell-manual.html", row: '[data-testid="bell-action-cell-manual-1"]' },
  { key: "adminNav", page: "admin-nav.html", row: "nav.mb-4" },
  {
    key: "onboardingTopBar",
    page: "onboarding-top-bar.html",
    row: '[data-testid="onboarding-top-bar"]',
  },
] as const;

/** Growable tokens a childless element could carry. The computed `flex-grow` check
 *  in the assertion covers the style-prop form a className scan misses. */
const GROWABLE_SOURCE =
  "(^|\\s)(flex-1|grow|flex-auto|basis-full)(\\s|$)|(^|\\s)(flex|grow|basis)-\\[";

let server: Server;
let baseUrl = "";
let workDir = "";

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "pusher-alignment-"));

  const rowsJson = join(workDir, "rows.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_pusherRowsHarness.tsx"), rowsJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000, env: HARNESS_ENV },
  );
  const rows = JSON.parse(readFileSync(rowsJson, "utf8")) as Record<string, string>;

  const sources: string[] = [];
  for (const { key, page } of ROWS) {
    const markup = rows[key];
    expect(markup, `harness emitted ${key}`).toBeTruthy();
    const file = join(workDir, page);
    writeFileSync(
      file,
      `<!doctype html><html data-theme="light"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<link rel="stylesheet" href="out.css"></head><body class="bg-bg">${markup}</body></html>`,
    );
    sources.push(`@source "${file}";`);
  }

  const entryCss = join(workDir, "entry.css");
  writeFileSync(
    entryCss,
    `${sources.join("\n")}\n${readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8")}`,
  );
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "bell-auto.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(body);
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

async function open(page: Page, file: string, width: number) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: 700 });
  await page.goto(`${baseUrl}${file}`, { waitUntil: "load" });
}

for (const { key, page: pageFile, row } of ROWS) {
  for (const width of [1280, 375, 320] as const) {
    test(`pusher absence: ${key} @ ${width}`, async ({ page }) => {
      await open(page, pageFile, width);

      const found = await page.evaluate(
        ({ rowSel, growableSource }) => {
          const growable = new RegExp(growableSource);
          const rowEl = document.querySelector(rowSel);
          if (!(rowEl instanceof HTMLElement)) return { error: `row not found: ${rowSel}` };
          // PAINTS NOTHING — and asked of the BROWSER, not of a property checklist.
          //
          // This started as `childNodes.length === 0` (round 1: missed a whitespace
          // text node), became a background/border/replaced-element heuristic (round 2:
          // missed `opacity-0`, `visibility:hidden`, a transparent border colour, and
          // clipping). That is a checklist that cannot be completed — every round adds
          // a way to paint nothing while satisfying it. Inverted to ask the browser
          // directly: `checkVisibility` with the content-visibility and opacity checks
          // enabled is the platform's own answer to "does this render anything", and it
          // subsumes every case the heuristic enumerated.
          const paintsNothing = (el: Element): boolean => {
            // TEXT DOES NOT SHORT-CIRCUIT. Returning early on any non-whitespace text
            // let an `opacity-0` / `visibility:hidden` / clipped text-bearing grower
            // through (review round 3). Text now only counts when the node carrying it
            // is itself visible, which the walk below decides.
            const visible = (d: Element): boolean => {
              const anyEl = d as Element & {
                checkVisibility?: (o?: Record<string, boolean>) => boolean;
              };
              if (typeof anyEl.checkVisibility === "function") {
                if (
                  !anyEl.checkVisibility({
                    contentVisibilityAuto: true,
                    opacityProperty: true,
                    visibilityProperty: true,
                  })
                ) {
                  return false;
                }
              }
              const cs = getComputedStyle(d);
              const r = d.getBoundingClientRect();
              if (r.width <= 0 || r.height <= 0) return false;
              // A box only paints if something in it is actually opaque. A transparent
              // border colour or a fully transparent background paints nothing even
              // though the width is non-zero.
              const opaque = (c: string) =>
                c !== "transparent" && c !== "rgba(0, 0, 0, 0)" && !/,\s*0\s*\)$/.test(c);
              const borders = (
                [
                  "borderTopColor",
                  "borderRightColor",
                  "borderBottomColor",
                  "borderLeftColor",
                ] as const
              ).some(
                (k, i) =>
                  opaque(cs[k]) &&
                  parseFloat(
                    [
                      cs.borderTopWidth,
                      cs.borderRightWidth,
                      cs.borderBottomWidth,
                      cs.borderLeftWidth,
                    ][i] || "0",
                  ) > 0,
              );
              // CLIPPED, MASKED or FILTERED TO NOTHING still paints nothing, and
              // `checkVisibility()` reports it visible (review round 3). These are the
              // mechanisms that remove pixels without touching visibility or opacity.
              if (
                cs.clipPath !== "none" &&
                /inset\(\s*(?:5[0-9]|[6-9][0-9]|100)%/.test(cs.clipPath)
              ) {
                return false;
              }
              if (cs.maskImage !== "none" && cs.maskImage.includes("transparent")) return false;
              if (/opacity\(\s*0\s*\)/.test(cs.filter)) return false;
              // A replaced element only paints if it HAS content: an empty <svg>, an
              // untouched <canvas> and a transparent image were all assumed painted.
              const replaced =
                (d.tagName === "IMG" && (d as HTMLImageElement).naturalWidth > 0) ||
                (d.tagName.toLowerCase() === "svg" && d.children.length > 0) ||
                ["CANVAS", "VIDEO"].includes(d.tagName);
              const bgImage =
                cs.backgroundImage !== "none" && !/transparent/.test(cs.backgroundImage);
              // Text counts only on a node that got this far, i.e. one that is itself
              // visible — replacing the early return that short-circuited on any text.
              const hasText = Array.from(d.childNodes).some(
                (n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "",
              );
              return opaque(cs.backgroundColor) || borders || replaced || bgImage || hasText;
            };
            for (const d of [el, ...Array.from(el.querySelectorAll("*"))]) {
              if (visible(d)) return false;
            }
            return true;
          };
          const offenders = Array.from(rowEl.children)
            .filter((c) => paintsNothing(c))
            .filter((c) => {
              const flexGrow = parseFloat(getComputedStyle(c).flexGrow);
              return growable.test(c.className) || (Number.isFinite(flexGrow) && flexGrow > 0);
            })
            .map((c) => `<${c.tagName.toLowerCase()} class="${c.className}">`);
          return { error: null, offenders };
        },
        { rowSel: row, growableSource: GROWABLE_SOURCE },
      );

      expect(found.error, "fixture shape").toBeNull();
      if (found.error !== null) return;
      expect(
        found.offenders,
        `${key} @ ${width}: a childless growable child charges its parent's gap on both` +
          " sides while painting nothing",
      ).toEqual([]);
    });
  }

  for (const width of [1280, 320] as const) {
    test(`pusher alignment: ${key} @ ${width}`, async ({ page }) => {
      await open(page, pageFile, width);

      const measured = await page.evaluate(
        ({ rowSel }) => {
          const rowEl = document.querySelector(rowSel);
          if (!(rowEl instanceof HTMLElement)) return { error: `row not found: ${rowSel}` };
          const kids = Array.from(rowEl.children).filter(
            (c): c is HTMLElement => c instanceof HTMLElement,
          );
          const last = kids[kids.length - 1];
          if (!last) return { error: "row has no element children" };
          const cs = getComputedStyle(rowEl);
          const rowRect = rowEl.getBoundingClientRect();
          // Content-box right edge: padding must not read as slack.
          const contentRight = rowRect.right - parseFloat(cs.paddingRight || "0");
          return {
            error: null,
            gapToRight: Math.round((contentRight - last.getBoundingClientRect().right) * 100) / 100,
            overflow: rowEl.scrollWidth > rowEl.clientWidth + 1,
          };
        },
        { rowSel: row },
      );

      expect(measured.error, "fixture shape").toBeNull();
      if (measured.error !== null) return;

      if (width === 1280) {
        // Wide: free space exists, so a missing `ml-auto` shows up here as slack.
        // ABSOLUTE value. Review round 1: a regression translating the cluster
        // 16px PAST the right edge yields gapToRight = -16, which satisfied a
        // bare `< 0.5` — overflow to the right read as perfect flushness.
        expect(
          Math.abs(measured.gapToRight),
          `${key}: trailing cluster is flush with the content-box right edge` +
            ` (signed offset ${measured.gapToRight}; negative means it overhangs)`,
        ).toBeLessThan(0.5);
      } else {
        // Narrow: the contract is that nothing overflows. Flushness is not asserted,
        // because a wrapped row legitimately ends its last line early.
        expect(measured.overflow, `${key}: row does not overflow at ${width}px`).toBe(false);
      }
    });
  }
}
