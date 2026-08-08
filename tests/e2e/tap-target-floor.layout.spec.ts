/**
 * tests/e2e/tap-target-floor.layout.spec.ts
 * (spec 2026-08-07-step3-a11y-cluster §6 dimensional invariants, §8 test plan)
 *
 * Real-browser assertions for the 44×44 tap-target floor repairs. jsdom
 * computes no layout, so every claim in spec §6 requires a real engine.
 *
 * LIVE ENTRY, NOT TRANSCRIBED MARKUP (spec §8, AC-3b). The subject of this
 * spec is whether particular class strings sit on particular elements, so a
 * harness carrying its own copy of those strings would pass with the corrected
 * copy while production stayed unrepaired. tests/e2e/_tapTargetFloorLiveEntry.tsx
 * imports the REAL components; this file bundles it out-of-process through the
 * UNMODIFIED tests/e2e/_step3ReviewModalBundle.mjs.
 *
 * `test` is bound from ./helpers/fontFidelityFixture, never @playwright/test:
 * tests/e2e/_metaFontFidelityWiring.test.ts:27 walks every spec containing
 * `compileEntryCss` and fails-by-default on the wrong binding, and this file's
 * stem is enrolled in the CALLERS registry at
 * tests/e2e/_metaFontWaitCoverage.test.ts:30.
 *
 * Run:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tap-target-floor
 */
import { test, expect } from "./helpers/fontFidelityFixture";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";
import { premise, premiseHolds } from "../_shared/premise";

const REPO_ROOT = resolve(__dirname, "..", "..");

/** The project floor: DESIGN.md:216 `--spacing-tap-min: 44px`. */
const TAP_MIN = 44;

/** Sub-pixel tolerance for every geometry comparison in this file. */
const EPS = 0.5;

/** spec §8: DI-1…DI-15 are asserted across these four widths. */
const VIEWPORTS = [320, 390, 768, 1280] as const;

/**
 * The SIX Class-A disclosures (spec §2.1). HelpTooltip is the seventh
 * <summary> but takes the Class B recipe instead (spec §2.2 precedence), so it
 * is scoped out of DI-2 by construction — DI-10 pins its width at exactly 44,
 * a stronger claim than narrower-than-container.
 */
const CLASS_A_MOUNTS = [
  "help-affordance",
  "operator-error",
  "error-explainer",
  "administrators",
  "me-show-sections",
  "run-of-show",
] as const;

/** Every mounted <summary>, Class A plus the Class B tooltip trigger. */
const SUMMARY_MOUNT_COUNT = CLASS_A_MOUNTS.length + 1;

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "tap-target-floor-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  // The entry's import graph reaches "use server" action modules and node
  // builtins that Next elides from client bundles; this bundler replicates
  // that elision. It is used UNMODIFIED (spec §8, ratified) — teaching the
  // shared `_bundleLiveEntryChild.mjs` the same trick would redesign a surface
  // this branch does not otherwise touch.
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_tapTargetFloorLiveEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  // EVERY directory the entry's import graph paints from needs an @source line.
  // A missing one silently drops the repaired utilities from the stylesheet and
  // every invariant fails with a misleading rect rather than a missing class.
  // `components/layout` is not decorative: AdminNav always renders ThemeToggle
  // from there (components/admin/nav/AdminNav.tsx:38).
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin")}";`,
      `@source "${join(REPO_ROOT, "components", "messages")}";`,
      `@source "${join(REPO_ROOT, "components", "crew", "primitives")}";`,
      `@source "${join(REPO_ROOT, "components", "layout")}";`,
      `@source "${join(REPO_ROOT, "app", "me")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_tapTargetFloorLiveEntry.tsx")}";`,
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
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

/**
 * Navigate, wait for the React commit, then settle fonts BEFORE the first
 * measurement. Never networkidle: the harness serves three static files, so
 * networkidle says nothing about whether React has rendered.
 */
async function boot(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(baseUrl);
  await page.waitForSelector('body[data-harness-ready="true"]');
  await page.evaluate(() => document.fonts.ready);
}

/** The <summary> owned by one mounted surface. */
function summaryIn(page: Page, mount: string) {
  return page.locator(`[data-mount="${mount}"] summary`);
}

/**
 * The premise every DI-1/DI-2 case shares: all seven repaired disclosures
 * actually mounted. Five of the seven are conditional on fixture state (spec
 * §3), and a dropped condition renders no <summary> at all — under which
 * "every summary clears the floor" is trivially true. Stated as an exact count,
 * not "> 0": one rendered fixture satisfies "> 0" while six stay dark.
 */
async function premiseSevenSummaries(page: Page): Promise<void> {
  const count = await page.locator("summary").count();
  premiseHolds(
    `all ${SUMMARY_MOUNT_COUNT} repaired disclosures mounted (got ${count})`,
    count === SUMMARY_MOUNT_COUNT,
  );
}

test.describe("DI-1 — every repaired <summary> clears the 44px floor on both axes", () => {
  for (const width of VIEWPORTS) {
    test(`@${width}px: each Class-A summary measures at least ${TAP_MIN}x${TAP_MIN}`, async ({
      page,
    }) => {
      await boot(page, width);
      await premiseSevenSummaries(page);

      // Iterate and assert EACH element's own rect. "No element is under 44px"
      // is forbidden by spec §8: it passes on an empty set, and it lets one
      // compliant sibling mask a failing one.
      for (const mount of CLASS_A_MOUNTS) {
        const box = await summaryIn(page, mount).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height };
        });
        expect(box.h, `${mount} summary height`).toBeGreaterThanOrEqual(TAP_MIN - EPS);
        expect(box.w, `${mount} summary width`).toBeGreaterThanOrEqual(TAP_MIN - EPS);
      }
    });
  }
});

test.describe("DI-2 — the six Class-A summaries stay narrower than their container", () => {
  for (const width of VIEWPORTS) {
    test(`@${width}px: no Class-A summary becomes a full-width band`, async ({ page }) => {
      await boot(page, width);
      await premiseSevenSummaries(page);

      for (const mount of CLASS_A_MOUNTS) {
        // The container is the mount's own block box — the width a full-width
        // invisible band WOULD occupy. Deliberately not the <summary>'s
        // <details> parent: RunOfShowList's <details> is itself a
        // shrink-to-fit flex item, so it tracks the summary's width on an
        // unrepaired build too and the comparison would prove nothing there.
        const measured = await page
          .locator(`[data-mount="${mount}"]`)
          .evaluate((container: HTMLElement) => {
            const summary = container.querySelector("summary");
            return {
              summary: summary ? summary.getBoundingClientRect().width : null,
              container: container.getBoundingClientRect().width,
            };
          });
        premiseHolds(`${mount} rendered a <summary>`, measured.summary !== null);
        premise(`${mount} container has width`, measured.container, 0);
        expect(measured.summary!, `${mount} summary width vs container`).toBeLessThan(
          measured.container - EPS,
        );
      }
    });
  }
});

/**
 * Spec §6.1 behaviour-unchanged assertions. These are NOT additions to
 * AC-3b's exemption list — that list scopes the DI set only (DI-5, DI-7,
 * complete). §6.1's charter ("no transition is added, removed, or retimed") is
 * what these pin, in the task that creates their subject.
 */
test.describe("§6.1 disclosure behaviour survives the Class-A repair", () => {
  test("a <summary> toggled while hovered keeps its hover underline and is not remounted", async ({
    page,
  }) => {
    await boot(page, 390);
    const summary = summaryIn(page, "help-affordance");
    const details = page.locator('[data-mount="help-affordance"] details');

    await summary.hover();
    const hoveredDecoration = await summary.evaluate(
      (el) => getComputedStyle(el).textDecorationLine,
    );
    // The premise is the hover state itself: this component's `hover:underline`
    // must actually be applied, or "the underline persisted" is vacuous.
    premiseHolds(
      `hover applies an underline before the toggle (got "${hoveredDecoration}")`,
      hoveredDecoration.includes("underline"),
    );
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);

    // Stamp the live node. If the toggle remounted the <summary>, the stamp is
    // gone — which is the failure mode a key change or an element swap would
    // introduce, and the reason "the underline is still there" alone is not
    // enough.
    await summary.evaluate((el) => {
      (el as HTMLElement & { __stamp?: string }).__stamp = "pre-toggle";
    });

    await summary.click();

    const after = await summary.evaluate((el) => ({
      decoration: getComputedStyle(el).textDecorationLine,
      stamp: (el as HTMLElement & { __stamp?: string }).__stamp ?? null,
    }));
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
    expect(after.stamp, "the summary was remounted by the toggle").toBe("pre-toggle");
    expect(after.decoration, "the hover underline flickered off across the toggle").toContain(
      "underline",
    );
  });

  test("<details> still toggles when its <summary> is display: inline-flex", async ({ page }) => {
    await boot(page, 390);

    for (const mount of CLASS_A_MOUNTS) {
      const summary = summaryIn(page, mount);
      const display = await summary.evaluate((el) => getComputedStyle(el).display);
      // Changing a <summary>'s display was the standing risk of the Class-A
      // recipe (spec §2.1, probe P2). The premise is that the recipe actually
      // landed on this element; without it the toggle assertion below is just
      // re-testing native <details> on an unrepaired build.
      premiseHolds(`${mount} summary is inline-flex (got "${display}")`, display === "inline-flex");

      const details = summary.locator("xpath=..");
      expect(
        await details.evaluate((el) => (el as HTMLDetailsElement).open),
        `${mount} started open`,
      ).toBe(false);
      await summary.click();
      expect(
        await details.evaluate((el) => (el as HTMLDetailsElement).open),
        `${mount} did not toggle open under inline-flex`,
      ).toBe(true);
    }
  });
});
