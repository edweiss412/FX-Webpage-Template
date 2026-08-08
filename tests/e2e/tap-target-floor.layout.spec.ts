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

/**
 * The painted pill, unchanged by this repair (`size-7`). Spec §1.1 R6: every
 * repaired control keeps its EXISTING box — "28px everywhere" would be wrong,
 * since the HelpSheet close button is `size-9`.
 */
const VISUAL_PILL = 28;

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

/** The three step-pill targets, in document order. */
const PILL_NUMBERS = [1, 2, 3] as const;

/**
 * The step-pill fixture is `step=2, maxReachedStep=3`, so pill 3 is a
 * FORWARD-VISITED <Link> — the only state that carries a hover colour
 * (`group-hover:text-text-strong`, components/admin/OnboardingWizard.tsx:157).
 * Active and done pills have none, so on the ordinary Step-3 state band-hover
 * and centre-hover are trivially equal even with the rewiring entirely absent
 * (spec §6.1). DI-9 samples this pill and nothing else.
 */
const FORWARD_VISITED_PILL = 3;

function pillTarget(page: Page, n: number) {
  return page.locator(`[data-mount="step-indicator"] [data-testid="wizard-step-indicator-${n}"]`);
}

function pillVisual(page: Page, n: number) {
  return page.locator(
    `[data-mount="step-indicator"] [data-testid="wizard-step-indicator-${n}-visual"]`,
  );
}

/** Every pill target is present. With fewer than two, "no two overlap" is free. */
async function premiseThreePills(page: Page): Promise<void> {
  const count = await page
    .locator(
      '[data-mount="step-indicator"] [data-testid^="wizard-step-indicator-"]:not([data-testid$="-visual"])',
    )
    .count();
  premiseHolds(
    `exactly ${PILL_NUMBERS.length} pill targets rendered (got ${count})`,
    count === PILL_NUMBERS.length,
  );
}

type Rect = { x: number; y: number; w: number; h: number };

async function rectOf(page: Page, selector: string): Promise<Rect> {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
}

/**
 * The element's `color` AFTER its own colour transition has run to completion.
 *
 * Reading getComputedStyle the instant a hover lands returns the transition's
 * START value, so a naive read reports "hover changed nothing" on a build where
 * hover works perfectly — a false failure that a magic sleep would paper over
 * unreliably. The wait is DERIVED from the element's own declared
 * `transition-duration` (these pills carry `duration-fast`, 120ms,
 * app/globals.css:240), so it stays correct if that token is retimed and it
 * collapses to a single frame under prefers-reduced-motion, which zeroes it.
 */
async function settledColor(page: Page, selector: string): Promise<string> {
  const durationMs = await page.locator(selector).evaluate((el) => {
    const first = getComputedStyle(el).transitionDuration.split(",")[0]?.trim() ?? "0s";
    return first.endsWith("ms") ? parseFloat(first) : parseFloat(first) * 1000;
  });
  await page.waitForTimeout((Number.isFinite(durationMs) ? durationMs : 0) + 60);
  return page.locator(selector).evaluate((el) => getComputedStyle(el).color);
}

test.describe("DI-3/DI-4/DI-5 — the step pills grow their target without moving their layout", () => {
  for (const width of VIEWPORTS) {
    test(`@${width}px: target is 44x44, visual stays 28x28, margin box stays 28x28`, async ({
      page,
    }) => {
      await boot(page, width);
      await premiseThreePills(page);

      let previousRight: number | null = null;
      for (const n of PILL_NUMBERS) {
        const measured = await pillTarget(page, n).evaluate((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            x: r.x,
            w: r.width,
            h: r.height,
            marginLeft: parseFloat(cs.marginLeft),
            marginRight: parseFloat(cs.marginRight),
            marginTop: parseFloat(cs.marginTop),
            marginBottom: parseFloat(cs.marginBottom),
          };
        });

        // DI-3: exactly 44x44, not merely "at least".
        expect(measured.w, `pill ${n} target width`).toBeCloseTo(TAP_MIN, 1);
        expect(measured.h, `pill ${n} target height`).toBeCloseTo(TAP_MIN, 1);

        // DI-4: the painted pill is untouched (R6 — this is an a11y repair, not
        // a redesign). Asserted on a DIFFERENT element from DI-3, or the pair is
        // self-satisfying (spec §8).
        const visual = await pillVisual(page, n).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height };
        });
        expect(visual.w, `pill ${n} visual width`).toBeCloseTo(VISUAL_PILL, 1);
        expect(visual.h, `pill ${n} visual height`).toBeCloseTo(VISUAL_PILL, 1);

        // DI-5 (PRESERVATION, spec §8 — passes before AND after by design; do
        // not "strengthen" it into discriminating form). The margin box is what
        // the stepper's layout actually spends, and at 320px the connectors are
        // 0px wide (probe P3) so there is no slack to absorb a change.
        expect(
          measured.w + measured.marginLeft + measured.marginRight,
          `pill ${n} horizontal margin box`,
        ).toBeCloseTo(VISUAL_PILL, 1);
        expect(
          measured.h + measured.marginTop + measured.marginBottom,
          `pill ${n} vertical margin box`,
        ).toBeCloseTo(VISUAL_PILL, 1);

        // DI-3, second half: adjacent 44px boxes touch at 320/390 (gap 0.0,
        // probe P6) and must never overlap — at gap 0 every pixel has exactly
        // one owner, so no pill can steal a neighbour's tap.
        if (previousRight !== null) {
          expect(measured.x, `pill ${n} overlaps its left neighbour`).toBeGreaterThanOrEqual(
            previousRight - EPS,
          );
        }
        previousRight = measured.x + measured.w;
      }
    });
  }
});

test.describe("DI-6 — every pill edge midpoint hits that pill, not a sibling", () => {
  for (const width of VIEWPORTS) {
    test(`@${width}px: four edge midpoints per pill resolve to their own target`, async ({
      page,
    }) => {
      await boot(page, width);
      await premiseThreePills(page);

      for (const n of PILL_NUMBERS) {
        const selector = `[data-mount="step-indicator"] [data-testid="wizard-step-indicator-${n}"]`;
        // Corners are deliberately excluded (spec §6): probe P4 measured them
        // unreliable across recipes, so asserting them buys flake, not power.
        //
        // The sampled box is the 44px FLOOR box centred on the pill, DERIVED
        // from the pill's own centre — deliberately not the element's own rect.
        // Sampling the element's rect would be vacuous on an unrepaired build:
        // a 28px box's own edges trivially hit the 28px element, so the test
        // would pass green against the very defect it exists to catch. This is
        // also the exact geometry probe P4 used to REFUTE `before:-inset-2`,
        // whose 44px box took the pointer on only two of four edges.
        const hits = await page.locator(selector).evaluate((el, floor) => {
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const half = floor / 2;
          const points: Array<[string, number, number]> = [
            ["left", cx - half + 1, cy],
            ["right", cx + half - 1, cy],
            ["top", cx, cy - half + 1],
            ["bottom", cx, cy + half - 1],
          ];
          return points.map(([edge, x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return { edge, ownsHit: hit !== null && (hit === el || el.contains(hit)) };
          });
        }, TAP_MIN);
        expect(hits, `pill ${n} edge hit map`).toHaveLength(4);
        for (const { edge, ownsHit } of hits) {
          expect(ownsHit, `pill ${n} ${edge} midpoint resolved outside the target`).toBe(true);
        }
      }
    });
  }
});

test.describe("DI-9 — hover feedback covers the whole target, not just the painted pill", () => {
  test("band-hover matches centre-hover on the forward-visited pill", async ({ page }) => {
    await boot(page, 390);
    await premiseThreePills(page);

    const target = pillTarget(page, FORWARD_VISITED_PILL);
    const visual = pillVisual(page, FORWARD_VISITED_PILL);
    const visualSelector = `[data-mount="step-indicator"] [data-testid="wizard-step-indicator-${FORWARD_VISITED_PILL}-visual"]`;

    const resting = await settledColor(page, visualSelector);

    // Hover the painted pill's centre.
    await visual.hover();
    const centre = await settledColor(page, visualSelector);

    // The premise DI-9 cannot do without: this pill must actually CHANGE colour
    // on hover. Comparing band-hover to resting instead would pass on a build
    // where hover is broken everywhere, and comparing band to centre on a pill
    // with no hover colour compares two identical values (spec §6.1).
    premiseHolds(
      `the sampled pill changes colour on hover (resting ${resting}, hovered ${centre})`,
      centre !== resting,
    );

    // A point provably inside the 44px target and outside the 28px visual —
    // DERIVED from the measured rects, never a hardcoded offset (spec §8).
    const targetRect = await rectOf(
      page,
      `[data-mount="step-indicator"] [data-testid="wizard-step-indicator-${FORWARD_VISITED_PILL}"]`,
    );
    const visualRect = await rectOf(
      page,
      `[data-mount="step-indicator"] [data-testid="wizard-step-indicator-${FORWARD_VISITED_PILL}-visual"]`,
    );
    const bandX = (targetRect.x + visualRect.x) / 2;
    const bandY = targetRect.y + targetRect.h / 2;
    premise("the expansion band is wide enough to sample", visualRect.x - targetRect.x, 1);

    // Leave the element entirely first, so the band read cannot inherit the
    // centre hover it is being compared against.
    await page.mouse.move(0, 0);
    await settledColor(page, visualSelector);
    await page.mouse.move(bandX, bandY);
    const band = await settledColor(page, visualSelector);

    expect(band, "hovering the expansion band produced no hover colour").toBe(centre);

    // §4.1: the crossfade wiring survived the class move. With the pointer
    // parked in the band, the property that transitions must still be on the
    // element that now paints it.
    const transition = await visual.evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(transition, "the visual span lost its colour transition").toContain("color");

    // The target itself must be the `group` ancestor the rewritten utilities
    // resolve against; without it `group-hover:*` never matches and hover
    // feedback disappears rather than degrading.
    await expect(target).toHaveClass(/(^|\s)group(\s|$)/);
  });
});

test.describe("DI-13/DI-14 — focus outlines the target, at the target's own radius", () => {
  for (const n of PILL_NUMBERS) {
    test(`pill ${n}: the ring is on the 44px target and the radius is non-zero and shared`, async ({
      page,
    }) => {
      await boot(page, 390);
      await premiseThreePills(page);

      const selector = `[data-mount="step-indicator"] [data-testid="wizard-step-indicator-${n}"]`;

      // DI-14 is read UNFOCUSED, and that is a strengthening rather than a
      // relaxation. MEASURED on this build: app/globals.css:762-766 declares an
      // UNLAYERED `:focus-visible { border-radius: var(--radius-sm) }`, and
      // unlayered CSS beats every Tailwind utility layer — so a focused pill
      // computes 6px whether or not it carries `rounded-pill`. A focused-state
      // radius comparison is therefore BLIND to the class it claims to pin: it
      // reads 6px on the repaired build and 6px on a build that dropped the
      // radius from the target entirely. The unfocused read is where
      // `rounded-pill` actually governs, so it is where the claim can fail.
      const resting = await page.locator(selector).evaluate((el) => {
        const span = el.querySelector<HTMLElement>('[data-testid$="-visual"]');
        return {
          targetRadius: getComputedStyle(el).borderTopLeftRadius,
          spanRadius: span ? getComputedStyle(span).borderTopLeftRadius : null,
        };
      });
      premiseHolds(`pill ${n} rendered its inner visual span`, resting.spanRadius !== null);

      // BOTH halves are required: equality alone is satisfied by 0px === 0px,
      // which is exactly the regression of dropping the radius from both.
      expect(parseFloat(resting.targetRadius), `pill ${n} target radius`).toBeGreaterThan(0);
      expect(resting.targetRadius, `pill ${n} radius diverged from its visual`).toBe(
        resting.spanRadius,
      );

      // DI-13 — the ring, which only exists in the focused state.
      await page.locator(selector).evaluate((el) => (el as HTMLElement).focus());
      const state = await page.locator(selector).evaluate((el) => {
        const span = el.querySelector<HTMLElement>('[data-testid$="-visual"]');
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          isActive: document.activeElement === el,
          // A ring is `outline` or `box-shadow`; neither affects the border
          // box, so geometry alone cannot see it (spec §6, DI-13). Asserting
          // only the rect would pass with no ring at all.
          targetRing: cs.outlineStyle !== "none" || cs.boxShadow !== "none",
          spanRing: span
            ? getComputedStyle(span).outlineStyle !== "none" ||
              getComputedStyle(span).boxShadow !== "none"
            : null,
          w: r.width,
          h: r.height,
        };
      });

      // Premise: an unfocused element has no ring, so every claim below would
      // be about the wrong state.
      premiseHolds(`pill ${n} is document.activeElement`, state.isActive);

      expect(state.targetRing, `pill ${n} focus ring is not on the target`).toBe(true);
      expect(state.spanRing, `pill ${n} inner visual grew a ring of its own`).toBe(false);
      expect(state.w, `pill ${n} ringed rect width`).toBeCloseTo(TAP_MIN, 1);
      expect(state.h, `pill ${n} ringed rect height`).toBeCloseTo(TAP_MIN, 1);
    });
  }
});

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
