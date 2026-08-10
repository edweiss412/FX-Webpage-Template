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
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import ts from "typescript";
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

/**
 * DI-2's ONE exemption, and it is stated as a premise rather than a subtraction.
 *
 * DI-2 exists to stop a repaired `<summary>` becoming a full-width invisible
 * band that swallows pointer events aimed at NEIGHBOURING content — that is the
 * harm, and `w-fit` is the guard against it. The revoked-admins disclosure has
 * no neighbour: its `<summary>` is a bordered card's own header, alone on its
 * row. Applying `w-fit` there bought nothing and cost roughly 200px of hit
 * area, leaving a row that still read as a full-width affordance while only its
 * text toggled — a SMALLER target than before the repair.
 *
 * So this site is deliberately full-width, and the assertion below flips for it
 * rather than skipping it: a skip would go quiet if the site ever regained a
 * neighbour, while an inverted assertion keeps measuring something. Spec §6
 * already exempts HelpTooltip from DI-2 by construction; this is the same shape
 * with a different reason, and both are named rather than implied.
 */
const DI2_FULL_WIDTH_BY_DESIGN = new Set<string>(["administrators"]);

/**
 * All SEVEN repaired disclosures — DI-1's full scope (spec §6). HelpTooltip is
 * the seventh; it is a <summary> that is also a 28x28 pill, so both recipes
 * name it and Class B wins (spec §2.2 precedence): Class A's
 * `inline-flex w-fit min-h-tap-min items-center` would leave it 44 tall and
 * still 28 wide.
 */
const ALL_SUMMARY_MOUNTS = [...CLASS_A_MOUNTS, "help-tooltip"] as const;

/** Every mounted <summary>, Class A plus the Class B tooltip trigger. */
const SUMMARY_MOUNT_COUNT = ALL_SUMMARY_MOUNTS.length;

/** The HelpSheet close button's painted box — `size-9`, NOT 28 (spec R6). */
const VISUAL_CLOSE = 36;

/** `--radius-sm: 6px` (app/globals.css:233), the close button's token. */
const RADIUS_SM = 6;

/**
 * R6 preserves each control's EXISTING corner radius, and spec §6 DI-14 states
 * the shape per control: the pill radius — "half the box or greater" — for the
 * pills, trigger and tooltip, and `rounded-sm` for the close button.
 *
 * Pinning the VALUE, not just "non-zero and equal to the visual", is what makes
 * this discriminating. Swapping `rounded-pill` for `rounded-sm` on both the
 * target and its visual leaves them equal and non-zero at 6px, so every other
 * radius assertion here still passes while the circular pills silently become
 * rounded squares.
 */
function expectPreservedRadius(
  label: string,
  measured: string,
  shape: "pill" | "sm",
  boxPx: number,
): void {
  const px = parseFloat(measured);
  if (shape === "sm") {
    expect(px, `${label} radius is no longer the rounded-sm token`).toBeCloseTo(RADIUS_SM, 1);
    return;
  }
  expect(
    px,
    `${label} is no longer pill-shaped: radius ${measured} on a ${boxPx}px box`,
  ).toBeGreaterThanOrEqual(boxPx / 2 - EPS);
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async ({ browser }) => {
  workDir = mkdtempSync(join(tmpdir(), "tap-target-floor-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  // A SIBLING of `_step3ReviewModalBundle.mjs`, differing in exactly one thing:
  // `node:async_hooks` resolves to a functional AsyncLocalStorage rather than an
  // empty object. Spec §8 names the shared bundler and calls it UNMODIFIED, and
  // it IS unmodified — that fence exists because it backs other standalone
  // specs, and a sibling leaves them untouched byte for byte. The fence's
  // premise is what changed: R10 held that extracting `/me`'s render half
  // removed the last path into `lib/log`, and measurement showed AdminNav (21
  // refs) and OperatorErrorBlock (22) are two more that no `"use server"`
  // prologue elides. See that file's header for the full measurement.
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_tapTargetFloorBundle.mjs"),
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

  // Prove the harness mounts ONCE, here, rather than 35 times in 35 tests.
  // If the bundle builds but the page throws, every test would otherwise spend
  // its own readiness timeout re-discovering the same fact — and on CI that
  // pushed the job past its 20-minute cap, so it was CANCELLED before Playwright
  // printed a single error body. Two runs were spent learning nothing because of
  // it. A beforeAll failure reports once, with the diagnostics boot() collects,
  // and skips the file instead of burning the budget.
  const probe = await browser.newPage();
  try {
    await boot(probe, 390);
  } finally {
    await probe.close();
  }
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
  // Collected so a boot failure REPORTS instead of hanging. An unbounded
  // waitForSelector on a page whose React threw burns the whole 120s test
  // timeout and prints "Test timeout exceeded" — which names the symptom and
  // hides every cause. CI proved this is not hypothetical: six cases each spent
  // 2.0m timing out and the job was cancelled before Playwright printed a
  // single reason. This harness bundles a real component graph out-of-process,
  // so "it mounted here and not there" is a live failure mode and the message
  // has to carry the page's own errors across that boundary.
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  const requestFailures: string[] = [];
  page.on("requestfailed", (r) => requestFailures.push(`${r.url()} ${r.failure()?.errorText}`));

  await page.setViewportSize({ width, height: 900 });
  await page.goto(baseUrl);
  try {
    await page.waitForSelector('body[data-harness-ready="true"]', { timeout: 15_000 });
  } catch {
    const diag = await page
      .evaluate(() => ({
        rootChildren: document.getElementById("root")?.childElementCount ?? -1,
        readyAttr: document.body.getAttribute("data-harness-ready"),
        bodyHtmlHead: document.body.innerHTML.slice(0, 400),
      }))
      .catch((e: unknown) => ({ evaluateFailed: String(e) }));
    throw new Error(
      `harness never reached data-harness-ready at ${width}px.\n` +
        `pageerrors: ${JSON.stringify(pageErrors)}\n` +
        `console errors: ${JSON.stringify(consoleErrors)}\n` +
        `failed requests: ${JSON.stringify(requestFailures)}\n` +
        `dom: ${JSON.stringify(diag)}`,
    );
  }
  // Bounded in-page, because a never-settling font promise would otherwise be
  // indistinguishable from a slow one and would also burn the full timeout.
  const fontsSettled = await page.evaluate(() =>
    Promise.race([
      document.fonts.ready.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 15_000)),
    ]),
  );
  premiseHolds(
    `document.fonts.ready settled before measurement at ${width}px ` +
      `(failed requests: ${JSON.stringify(requestFailures)})`,
    fontsSettled,
  );
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

/**
 * DI-11/DI-12 add the two `AdminNav` wordmark breakpoints to the standard four:
 * "FXAV" appears at `min-[360px]:inline` and the "Admin" pill at
 * `min-[440px]:inline-block` (components/admin/nav/AdminNav.tsx:88-114).
 */
const BRAND_VIEWPORTS = [320, 360, 390, 440, 768, 1280] as const;

/** `-mx-2` / `px-2` resolve to 8px on the 4px spacing scale. */
const BRAND_INSET = 8;

test.describe("DI-11/DI-12 — the AdminNav brand link clears the floor and spends no width", () => {
  for (const width of BRAND_VIEWPORTS) {
    test(`@${width}px: link clears ${TAP_MIN}px and its padding is cancelled by its margin`, async ({
      page,
    }) => {
      await boot(page, width);

      const brand = '[data-mount="admin-nav"] [data-testid="admin-nav-brand"]';
      const measured = await page.locator(brand).evaluate((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const wordmark = Array.from(el.querySelectorAll("span")).find(
          (s) => s.textContent?.trim() === "FXAV",
        );
        return {
          w: r.width,
          h: r.height,
          marginLeft: parseFloat(cs.marginLeft),
          marginRight: parseFloat(cs.marginRight),
          paddingLeft: parseFloat(cs.paddingLeft),
          paddingRight: parseFloat(cs.paddingRight),
          wordmarkFound: wordmark !== undefined,
          wordmarkShown: wordmark ? getComputedStyle(wordmark).display !== "none" : null,
        };
      });

      // Premise: the breakpoint state under test actually applied. Without it,
      // a stylesheet that dropped `min-[360px]:inline` would silently collapse
      // all six cases onto the icon-only geometry and every one would pass.
      premiseHolds("the brand link renders its FXAV wordmark span", measured.wordmarkFound);
      premiseHolds(
        `at ${width}px the wordmark is ${width >= 360 ? "shown" : "hidden"} (measured ${measured.wordmarkShown})`,
        measured.wordmarkShown === width >= 360,
      );

      // DI-11. The vertical axis fails at every width today; the horizontal
      // axis fails only in the icon-only state below 360px, where the link is
      // 28px wide and 28 + 8 + 8 = 44.
      expect(measured.h, "brand link height").toBeGreaterThanOrEqual(TAP_MIN - EPS);
      expect(measured.w, "brand link width").toBeGreaterThanOrEqual(TAP_MIN - EPS);

      // DI-12 — the cancellation formula, computed from the repaired element
      // alone. No baseline: production exposes only the repaired component, and
      // a hand-written "before" variant is exactly the transcribed markup this
      // spec disqualifies (spec §8). The topbar's 320px width budget is already
      // documented as tight — four irreducible 44px controls in the action
      // cluster (AdminNav.tsx:95-109) — so the link's footprint must not grow.
      expect(measured.marginLeft, "brand link left margin").toBeCloseTo(-BRAND_INSET, 1);
      expect(measured.marginRight, "brand link right margin").toBeCloseTo(-BRAND_INSET, 1);
      expect(measured.paddingLeft, "brand link left padding").toBeCloseTo(BRAND_INSET, 1);
      expect(measured.paddingRight, "brand link right padding").toBeCloseTo(BRAND_INSET, 1);

      // AC-2 names the brand link as one of the SEVEN targets whose four edge
      // midpoints must hit it — the same claim DI-6/DI-8/DI-10/DI-15 make for
      // the others. It is the one target whose grown box reaches INTO a live
      // row rather than into empty chrome: `-mx-2` pulls its layout footprint
      // back, so the extra 8px per side overhangs the `gap-3` (12px) toward the
      // action cluster, which holds four irreducible 44px controls
      // (components/admin/nav/AdminNav.tsx:95-109). If that overhang ever
      // exceeded the gap, the brand link would start eating taps aimed at the
      // first action control, and nothing else in this file would notice.
      const hits = await page.locator(brand).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const points: Array<[string, number, number]> = [
          ["left", r.left + 1, cy],
          ["right", r.right - 1, cy],
          ["top", cx, r.top + 1],
          ["bottom", cx, r.bottom - 1],
        ];
        // Every OTHER interactive element in the topbar, so the overlap check
        // is against what actually sits beside it rather than a hardcoded gap.
        const others = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-mount="admin-nav"] a, [data-mount="admin-nav"] button',
          ),
        ).filter((n) => n !== el && !el.contains(n) && !n.contains(el));
        const overlaps = others
          .map((n) => n.getBoundingClientRect())
          .filter((o) => o.width > 0 && o.height > 0)
          .filter((o) => o.left < r.right - 0.5 && o.right > r.left + 0.5)
          .filter((o) => o.top < r.bottom - 0.5 && o.bottom > r.top + 0.5).length;
        return {
          edges: points.map(([edge, x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return { edge, ownsHit: hit !== null && (hit === el || el.contains(hit)) };
          }),
          overlaps,
          siblingCount: others.length,
        };
      });
      // A 44px target nobody can name is not an accessibility win. Below 360px
      // the link's only rendered child is the decorative icon and both text
      // spans are `display: none`, so its accessible name came out EMPTY —
      // asserted at every breakpoint, because that is the axis the bug lived on.
      //
      // Non-empty is NOT sufficient, and the weaker form is a real trap:
      // relabelling it "Dashboard" satisfies /\S/ at all six widths while the
      // spoken name contradicts the visible "FXAV" wordmark, which is its own
      // failure (WCAG 2.5.3, label in name) and breaks voice control. The
      // expected substring is DERIVED from the wordmark span's own text rather
      // than hardcoded, so it tracks a rebrand instead of rotting into a
      // second, stale copy of the brand string.
      const wordmark = await page.locator(brand).evaluate(
        (el) =>
          Array.from(el.querySelectorAll("span"))
            .find((s) => (s.textContent ?? "").trim())
            ?.textContent?.trim() ?? "",
      );
      premiseHolds(
        `the brand link renders wordmark text to match its name against (got "${wordmark}")`,
        wordmark.length > 0,
      );
      await expect(
        page.locator(brand),
        `brand link name is empty or contradicts its visible "${wordmark}" wordmark at ${width}px`,
      ).toHaveAccessibleName(new RegExp(wordmark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

      premise("other interactive topbar elements exist to overlap", hits.siblingCount, 0);
      expect(hits.edges, "brand link edge hit map").toHaveLength(4);
      for (const { edge, ownsHit } of hits.edges) {
        expect(ownsHit, `brand link ${edge} midpoint resolved outside the target`).toBe(true);
      }
      expect(hits.overlaps, "brand link box overlaps another interactive control").toBe(0);
    });
  }
});

/**
 * The Class-B icon targets that are NOT step pills. Each names the target's
 * testid, its inner visual's testid, the visual's preserved size, and every
 * computed property its hover state changes.
 *
 * The property list is enumerated PER SITE rather than left to this file
 * (spec §6): the HelpSheet trigger, its close button and HelpTooltip all change
 * BOTH foreground and background on hover, so a test sampling only `color`
 * would pass on a build where `group-hover:bg-*` was dropped and
 * `group-hover:text-*` kept.
 */
const CLASS_B_TARGETS = [
  {
    id: "DI-8",
    label: "HelpSheet trigger",
    mount: "help-sheet",
    target: "help-sheet-trigger",
    visual: "help-sheet-trigger-visual",
    visualSize: VISUAL_PILL,
    radius: "pill",
    cursor: "pointer",
    // No margin before the repair, so `-m-2` on a 44px target cancels back to
    // the painted 28px exactly.
    marginBox: VISUAL_PILL,
    hoverProps: ["color", "backgroundColor"],
    openSheetFirst: false,
  },
  {
    id: "DI-10",
    label: "HelpTooltip trigger",
    mount: "help-tooltip",
    target: "help-tooltip-trigger",
    visual: "help-tooltip-trigger-visual",
    visualSize: VISUAL_PILL,
    radius: "pill",
    cursor: "pointer",
    marginBox: VISUAL_PILL,
    hoverProps: ["color", "backgroundColor"],
    openSheetFirst: false,
  },
  {
    id: "DI-15",
    label: "HelpSheet close button",
    mount: null,
    target: "help-sheet-close",
    visual: "help-sheet-close-visual",
    visualSize: VISUAL_CLOSE,
    radius: "sm",
    // Never carried one; §2.2's table dispositions classes that are PRESENT
    // rather than licensing new ones, so this stays the default cursor.
    cursor: "preserved-default",
    // 28, NOT 36 — and unchanged by the repair. This button already carried
    // `-m-1`, so its margin box was 36 - 4 - 4 = 28 before; the repair drops
    // `-m-1` and adds `-m-2` to a 44px target, giving 44 - 8 - 8 = 28. Spec
    // §2.2 calls that swap "the target's own -m-2 replaces its layout role",
    // and this is the number that shows it actually did.
    marginBox: 28,
    hoverProps: ["color", "backgroundColor"],
    openSheetFirst: true,
  },
] as const;

function scoped(mount: string | null, testId: string): string {
  const self = `[data-testid="${testId}"]`;
  return mount === null ? self : `[data-mount="${mount}"] ${self}`;
}

/**
 * Open the HelpSheet by a REAL click and wait for its portal dialog.
 *
 * The close button lives in a portal on <body>, mounted only while open, so
 * DI-15 has to open the sheet before it can measure anything. Every handle is
 * re-queried AFTER the click rather than held across it (detach-safety): the
 * pre-click DOM does not contain this element at all.
 */
async function openHelpSheet(page: Page): Promise<void> {
  await page.locator('[data-mount="help-sheet"] [data-testid="help-sheet-trigger"]').click();
  await page.waitForSelector('[data-testid="help-sheet-body"]');
  // The sheet RISES into place (`animate-[sheet-rise_220ms_...]`,
  // components/admin/HelpSheet.tsx:133) and the scrim fades. Measuring on the
  // frame the dialog first exists reads a mid-flight transform: at 390x900 that
  // put the close button's left edge at y=916, sixteen pixels BELOW the fold,
  // where elementFromPoint returns null. Waiting on the element's own
  // animations is exact and self-derived — no sleep to retune when the 220ms is
  // retuned, and it resolves immediately under prefers-reduced-motion, where
  // `motion-reduce:animate-none` means there is nothing to await.
  await page
    .locator('[data-testid="help-sheet-overlay"]')
    .evaluate(async (el) =>
      Promise.all(
        el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)),
      ).then(() => undefined),
    );
}

/**
 * Focus `selector` in a way that actually matches `:focus-visible`.
 *
 * Chromium gates `:focus-visible` on input modality: after a real mouse click —
 * which DI-15 requires, since the sheet has to be opened by one — a subsequent
 * programmatic `.focus()` is treated as mouse focus and paints NO ring. A test
 * that measured that would report "the focus ring is missing" on a build whose
 * ring is perfect. Shift+Tab then Tab re-enters the same element under keyboard
 * modality; inside the sheet, focus is trapped, so the round trip stays put.
 */
async function focusWithKeyboard(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate((el) => (el as HTMLElement).focus());
  if (await page.locator(selector).evaluate((el) => el.matches(":focus-visible"))) return;
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
}

/** The computed values of several properties at once. */
async function computedProps(
  page: Page,
  selector: string,
  props: readonly string[],
): Promise<Record<string, string>> {
  return page.locator(selector).evaluate((el, names) => {
    const cs = getComputedStyle(el);
    const out: Record<string, string> = {};
    for (const name of names) out[name] = cs[name as keyof CSSStyleDeclaration] as string;
    return out;
  }, props);
}

/** Wait out the element's own colour transition, then read the properties. */
async function settledProps(
  page: Page,
  selector: string,
  props: readonly string[],
): Promise<Record<string, string>> {
  const durationMs = await page.locator(selector).evaluate((el) => {
    const first = getComputedStyle(el).transitionDuration.split(",")[0]?.trim() ?? "0s";
    return first.endsWith("ms") ? parseFloat(first) : parseFloat(first) * 1000;
  });
  await page.waitForTimeout((Number.isFinite(durationMs) ? durationMs : 0) + 60);
  return computedProps(page, selector, props);
}

for (const spec of CLASS_B_TARGETS) {
  test.describe(`${spec.id} — ${spec.label}`, () => {
    for (const width of VIEWPORTS) {
      test(`@${width}px: target clears ${TAP_MIN}px, visual stays ${spec.visualSize}px, every edge hits`, async ({
        page,
      }) => {
        await boot(page, width);
        if (spec.openSheetFirst) await openHelpSheet(page);

        const targetSel = scoped(spec.mount, spec.target);
        const visualSel = scoped(spec.mount, spec.visual);

        const target = await rectOf(page, targetSel);
        expect(target.w, `${spec.label} target width`).toBeGreaterThanOrEqual(TAP_MIN - EPS);
        expect(target.h, `${spec.label} target height`).toBeGreaterThanOrEqual(TAP_MIN - EPS);

        // R7: the repair consumes NO layout. The negative margin has to cancel
        // the growth exactly, so the margin box still measures the painted box.
        // Size alone cannot see this — changing `-m-2` to `-m-1` keeps the
        // target 44x44 and the visual 28x28 while the margin box silently grows
        // to 36px and pushes its row apart.
        const margins = await page.locator(targetSel).evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            left: parseFloat(cs.marginLeft),
            right: parseFloat(cs.marginRight),
            top: parseFloat(cs.marginTop),
            bottom: parseFloat(cs.marginBottom),
            cursor: cs.cursor,
          };
        });
        expect(
          target.w + margins.left + margins.right,
          `${spec.label} horizontal margin box changed — does the negative margin still cancel?`,
        ).toBeCloseTo(spec.marginBox, 1);
        expect(
          target.h + margins.top + margins.bottom,
          `${spec.label} vertical margin box changed — does the negative margin still cancel?`,
        ).toBeCloseTo(spec.marginBox, 1);

        // Asserted on a DIFFERENT element from the target, or the pair is
        // self-satisfying (spec §8). R6: the painted box is preserved at its
        // OWN existing size — 28 for the trigger and tooltip, 36 here for the
        // close button, which is why this is a per-target field.
        const visual = await rectOf(page, visualSel);
        expect(visual.w, `${spec.label} visual width`).toBeCloseTo(spec.visualSize, 1);
        expect(visual.h, `${spec.label} visual height`).toBeCloseTo(spec.visualSize, 1);

        // §2.2's ownership table puts `items-center` and `justify-center` on
        // BOTH elements precisely so the glyph does not sit off-centre. Sizes
        // cannot see that either: dropping `items-center` from the target
        // top-aligns a correctly-sized visual inside a correctly-sized box and
        // moves the painted control 8px up, which R6 forbids.
        expect(
          visual.x + visual.w / 2 - (target.x + target.w / 2),
          `${spec.label} visual is not horizontally centred in its target`,
        ).toBeCloseTo(0, 1);
        expect(
          visual.y + visual.h / 2 - (target.y + target.h / 2),
          `${spec.label} visual is not vertically centred in its target`,
        ).toBeCloseTo(0, 1);

        // ...and one level DOWN. `justify-center`/`items-center` sit on BOTH
        // elements, so the pair above only covers half the claim: dropping them
        // from the VISUAL leaves it correctly sized and correctly placed while
        // its glyph slides to the edge. Measured against the glyph's own box.
        const glyph = await page
          .locator(`${visualSel} > *`)
          .first()
          .evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          })
          .catch(() => null);
        premiseHolds(`${spec.label} visual renders a glyph element to centre`, glyph !== null);
        expect(
          glyph!.x + glyph!.w / 2 - (visual.x + visual.w / 2),
          `${spec.label} glyph is not horizontally centred in its visual`,
        ).toBeCloseTo(0, 1);
        expect(
          glyph!.y + glyph!.h / 2 - (visual.y + visual.h / 2),
          `${spec.label} glyph is not vertically centred in its visual`,
        ).toBeCloseTo(0, 1);

        // §2.2: `cursor-pointer` belongs on the TARGET, so the cursor changes
        // across the whole 44px band. Moving it to the inner span leaves the
        // painted centre correct and reverts the 8px expansion band to the
        // default cursor — invisible to every other assertion here. Stated per
        // control, because the close button never carried one and the ownership
        // table dispositions the classes that are PRESENT.
        if (spec.cursor === "pointer") {
          expect(
            margins.cursor,
            `${spec.label} target lost its pointer cursor — was it moved to the visual span?`,
          ).toBe("pointer");
        }

        // Corners excluded deliberately (spec §6, probe P4). Edge midpoints of
        // the element's OWN rect are meaningful here only because the previous
        // two assertions have already pinned that rect at the 44px floor.
        const hits = await page.locator(targetSel).evaluate((el) => {
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const points: Array<[string, number, number]> = [
            ["left", r.left + 1, cy],
            ["right", r.right - 1, cy],
            ["top", cx, r.top + 1],
            ["bottom", cx, r.bottom - 1],
          ];
          return points.map(([edge, x, y]) => {
            const hit = document.elementFromPoint(x, y);
            const describe = (node: Element | null) =>
              node === null
                ? "nothing"
                : `${node.tagName.toLowerCase()}${node.getAttribute("data-testid") ? `[${node.getAttribute("data-testid")}]` : ""}.${node.className?.toString().slice(0, 60)}`;
            return {
              edge,
              ownsHit: hit !== null && (hit === el || el.contains(hit)),
              // Named, not just booleaned: "the right edge hit the <nav>" is
              // the finding probe P4 turned on, and a bare false hides it.
              // The point and the viewport ride along because a null hit means
              // "outside the viewport", which is a harness fault rather than a
              // component one and reads identically otherwise.
              hitDescription: `${describe(hit)} at (${Math.round(x)},${Math.round(y)}) in ${window.innerWidth}x${window.innerHeight}`,
            };
          });
        });
        expect(hits, `${spec.label} edge hit map`).toHaveLength(4);
        for (const { edge, ownsHit, hitDescription } of hits) {
          expect(
            ownsHit,
            `${spec.label} ${edge} midpoint resolved to ${hitDescription}, not the target`,
          ).toBe(true);
        }
      });
    }

    test(`hover over the expansion band matches hover over the painted box`, async ({ page }) => {
      await boot(page, 390);
      if (spec.openSheetFirst) await openHelpSheet(page);

      const targetSel = scoped(spec.mount, spec.target);
      const visualSel = scoped(spec.mount, spec.visual);

      const resting = await settledProps(page, visualSel, spec.hoverProps);
      await page.locator(visualSel).hover();
      const centre = await settledProps(page, visualSel, spec.hoverProps);

      // Per-property premise. Without it, a property this control does NOT
      // change on hover would compare two identical values and pass whether or
      // not the rewiring landed.
      for (const prop of spec.hoverProps) {
        premiseHolds(
          `${spec.label} changes ${prop} on hover (resting ${resting[prop]}, hovered ${centre[prop]})`,
          resting[prop] !== centre[prop],
        );
      }

      const targetRect = await rectOf(page, targetSel);
      const visualRect = await rectOf(page, visualSel);
      premise(
        `${spec.label} expansion band is wide enough to sample`,
        visualRect.x - targetRect.x,
        1,
      );
      const bandX = (targetRect.x + visualRect.x) / 2;
      const bandY = targetRect.y + targetRect.h / 2;

      // Leave the control entirely first, so the band read cannot inherit the
      // centre hover it is being compared against.
      await page.mouse.move(0, 0);
      await settledProps(page, visualSel, spec.hoverProps);
      await page.mouse.move(bandX, bandY);
      const band = await settledProps(page, visualSel, spec.hoverProps);

      for (const prop of spec.hoverProps) {
        expect(band[prop], `${spec.label}: band hover produced no ${prop} change`).toBe(
          centre[prop],
        );
      }
      await expect(page.locator(targetSel)).toHaveClass(/(^|\s)group(\s|$)/);

      // §6.1: no transition is added, REMOVED, or RETIMED. The end colours
      // above cannot see either failure — moving `transition-colors
      // duration-fast` from the visual span back onto the target leaves every
      // final value correct while the change snaps instantly, and `settledProps`
      // reads the duration only to size its own wait, so it would adjust to the
      // regression rather than catch it. Both halves are pinned on the element
      // that actually paints the colour.
      const timing = await page.locator(visualSel).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { property: cs.transitionProperty, duration: cs.transitionDuration };
      });
      // Split into TOKENS. A substring test accepts a suffix — "background-color"
      // contains "color", so `transition-[background-color]` would satisfy a
      // check for `color` while the text colour snaps.
      const animated = new Set(timing.property.split(",").map((t) => t.trim()));
      for (const prop of spec.hoverProps) {
        const cssName = prop === "backgroundColor" ? "background-color" : prop;
        expect(
          animated.has(cssName),
          `${spec.label}: the visual span no longer transitions ${cssName} (got "${timing.property}")`,
        ).toBe(true);
      }
      // `duration-fast` is 120ms (app/globals.css:240). Read as a SET, because
      // `transition-colors` expands to one duration per animated property.
      const durations = new Set(timing.duration.split(",").map((d) => d.trim()));
      expect(
        [...durations],
        `${spec.label}: colour transition was retimed (got "${timing.duration}")`,
      ).toEqual(["0.12s"]);
    });

    test(`focus rings the target, and the radius is non-zero and shared`, async ({ page }) => {
      await boot(page, 390);
      if (spec.openSheetFirst) await openHelpSheet(page);

      const targetSel = scoped(spec.mount, spec.target);

      // DI-14 is read UNFOCUSED for the reason recorded on the step pills:
      // app/globals.css:762-766 is an UNLAYERED
      // `:focus-visible { border-radius: var(--radius-sm) }`, which beats every
      // utility layer, so a focused element computes 6px whether or not it
      // carries its radius class. Unfocused is where the class governs.
      const radii = await page.locator(targetSel).evaluate((el, visualId) => {
        const span = el.querySelector<HTMLElement>(`[data-testid="${visualId}"]`);
        return {
          target: getComputedStyle(el).borderTopLeftRadius,
          visual: span ? getComputedStyle(span).borderTopLeftRadius : null,
        };
      }, spec.visual);
      premiseHolds(`${spec.label} rendered its inner visual span`, radii.visual !== null);
      expect(parseFloat(radii.target), `${spec.label} target radius`).toBeGreaterThan(0);
      expect(radii.target, `${spec.label} radius diverged from its visual`).toBe(radii.visual);
      // Each box is judged against ITS OWN size. Measuring the 44px target
      // against the 28px visual's half-width accepts `rounded-[14px]`, which
      // leaves the visual circular and the focus ring a rounded square.
      const targetBox = await rectOf(page, targetSel);
      // Non-zero AND equal is not enough: swapping `rounded-pill` for
      // `rounded-sm` on BOTH elements keeps them equal and non-zero at 6px
      // while turning a circle into a rounded square — R6 says the existing
      // corner radius is preserved, so the VALUE has to be pinned, not just its
      // consistency. Spec §6 DI-14 states the shape per control: the pill
      // radius ("half the box or greater") for the trigger and tooltip, the
      // `rounded-sm` token for the close button.
      expectPreservedRadius(`${spec.label} target`, radii.target, spec.radius, targetBox.h);
      expectPreservedRadius(`${spec.label} visual`, radii.visual!, spec.radius, spec.visualSize);

      await focusWithKeyboard(page, targetSel);
      const state = await page.locator(targetSel).evaluate((el, visualId) => {
        const span = el.querySelector<HTMLElement>(`[data-testid="${visualId}"]`);
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          isActive: document.activeElement === el,
          isFocusVisible: el.matches(":focus-visible"),
          targetRing: cs.outlineStyle !== "none" || cs.boxShadow !== "none",
          spanRing: span
            ? getComputedStyle(span).outlineStyle !== "none" ||
              getComputedStyle(span).boxShadow !== "none"
            : null,
          w: r.width,
          h: r.height,
        };
      }, spec.visual);

      premiseHolds(`${spec.label} is document.activeElement`, state.isActive);
      // The ring is `focus-visible:`-gated, so keyboard modality is part of the
      // environment the assertion needs, not part of the claim.
      premiseHolds(`${spec.label} matches :focus-visible`, state.isFocusVisible);
      expect(state.targetRing, `${spec.label} focus ring is not on the target`).toBe(true);
      expect(state.spanRing, `${spec.label} inner visual grew a ring of its own`).toBe(false);
      expect(state.w, `${spec.label} ringed rect width`).toBeGreaterThanOrEqual(TAP_MIN - EPS);
      expect(state.h, `${spec.label} ringed rect height`).toBeGreaterThanOrEqual(TAP_MIN - EPS);
    });
  });
}

/**
 * The two Class-A sites whose <summary> carried a VISIBLE NATIVE MARKER before
 * the repair. `inline-flex` overrides `display: list-item`, which removes it —
 * so these two need a replacement or they silently lose their open/closed cue.
 * The other four suppressed the marker deliberately long before this branch
 * (`list-none` + `[&::-webkit-details-marker]:hidden`), so they are correctly
 * absent from this list rather than missing from it.
 */
const CARET_MOUNTS = ["operator-error", "administrators"] as const;

test.describe("§1.1 R6 — the two disclosures that HAD a native marker keep a visible cue", () => {
  for (const mount of CARET_MOUNTS) {
    test(`${mount}: the caret exists and rotates when the disclosure opens`, async ({ page }) => {
      await boot(page, 390);

      const summary = summaryIn(page, mount);
      const caret = page.locator(`[data-mount="${mount}"] summary [aria-hidden="true"]`);

      // Premise: the native marker really is gone, so a replacement is required.
      // If a future change restored `display: list-item`, this guard would be a
      // belt over working braces and should be revisited rather than trusted.
      // The premise is that the NATIVE marker is gone, which is true of any
      // non-`list-item` display — the recipe uses `inline-flex` at five sites
      // and `flex` at the full-width one, and pinning one spelling would fail
      // the site that is deliberately the other.
      const display = await summary.evaluate((el) => getComputedStyle(el).display);
      premiseHolds(
        `${mount} summary is not display:list-item, so the native marker is gone (got "${display}")`,
        display !== "list-item",
      );
      expect(await caret.count(), `${mount} lost its disclosure caret`).toBeGreaterThan(0);

      // A rotating EMPTY node is not a cue. Emptying the caret while keeping it
      // and its classes leaves the node count positive and the computed rotation
      // still changing, so a count-plus-rotation guard passes on a disclosure
      // that once again shows nothing. What has to hold is that something is
      // actually PAINTED, and the caret is a lucide <svg> rather than a text
      // glyph — so "non-blank" means an svg with drawable content OR non-blank
      // text, not text alone. A text-only check would fail the icon it is
      // meant to protect, which is how a guard ends up loosened for the wrong
      // reason.
      const painted = await caret.first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const isSvg = el.tagName.toLowerCase() === "svg";
        return {
          text: (el.textContent ?? "").trim(),
          drawable: isSvg ? el.querySelectorAll("path, line, polyline, circle, rect").length : 0,
          isSvg,
          w: r.width,
          h: r.height,
          visibility: cs.visibility,
          display: cs.display,
          opacity: cs.opacity,
          color: cs.color,
        };
      });
      expect(
        painted.isSvg ? painted.drawable > 0 : painted.text !== "",
        `${mount} caret renders nothing (svg=${painted.isSvg}, drawable=${painted.drawable}, text=${JSON.stringify(painted.text)})`,
      ).toBe(true);
      expect(painted.w * painted.h, `${mount} caret has no painted area`).toBeGreaterThan(0);
      expect(painted.visibility, `${mount} caret is not visible`).not.toBe("hidden");
      expect(painted.display, `${mount} caret is display:none`).not.toBe("none");
      expect(parseFloat(painted.opacity), `${mount} caret is transparent`).toBeGreaterThan(0);
      // Ink, not just geometry: `text-transparent` leaves the text, the box, the
      // display, the visibility, the opacity AND the rotation all intact while
      // painting nothing. The alpha channel is the last way to hide a glyph that
      // every other check here reports as present.
      //
      // Parsed by COMPONENT COUNT, not by "the last number before the paren":
      // that shortcut reads the BLUE channel of an opaque `rgb(92, 63, 0)` as an
      // alpha of 0 and fails a perfectly visible caret. Caught by running it.
      const parts = painted.color
        .replace(/^rgba?\(|\)$/g, "")
        .split(/[,\s/]+/)
        .filter(Boolean);
      const alpha = parts.length >= 4 ? parseFloat(parts[3]!) : 1;
      expect(
        alpha,
        `${mount} caret text is fully transparent (color ${painted.color})`,
      ).toBeGreaterThan(0);

      // Tailwind v4 emits `rotate-90` as the standalone `rotate` property, NOT
      // as `transform` — a `transform`-only read returns "none" in both states
      // and passes whether or not the rotation is wired. Both are captured so
      // the guard survives either representation.
      const read = () =>
        caret.first().evaluate((el) => {
          const cs = getComputedStyle(el);
          return `${cs.rotate}|${cs.transform}`;
        });

      const closed = await read();
      await summary.click();
      // The rotation is a real transition (`duration-normal`), so read it after
      // the element's own declared duration rather than on the next frame.
      const durationMs = await caret.first().evaluate((el) => {
        const d = getComputedStyle(el).transitionDuration.split(",")[0]?.trim() ?? "0s";
        return d.endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000;
      });
      await page.waitForTimeout((Number.isFinite(durationMs) ? durationMs : 0) + 60);
      const open = await read();

      expect(
        open,
        `${mount} caret did not rotate on open — is \`group\` missing from the <details>?`,
      ).not.toBe(closed);
    });
  }
});

test.describe("§2.2 — HelpTooltip's `group` is on the <summary>, not the <details>", () => {
  test("hovering the DISCLOSED BODY does not light up the trigger", async ({ page }) => {
    await boot(page, 390);

    const summarySel = '[data-mount="help-tooltip"] [data-testid="help-tooltip-trigger"]';
    const visualSel = '[data-mount="help-tooltip"] [data-testid="help-tooltip-trigger-visual"]';
    const bodySel = '[data-mount="help-tooltip"] [data-testid="help-tooltip-body"]';
    const props = ["color", "backgroundColor"] as const;

    const resting = await settledProps(page, visualSel, props);

    // Premise: the trigger DOES change on hover, or "the body hover changed
    // nothing" is true for a control that never changes at all.
    await page.locator(visualSel).hover();
    const hovered = await settledProps(page, visualSel, props);
    for (const prop of props) {
      premiseHolds(
        `HelpTooltip changes ${prop} on hover (resting ${resting[prop]}, hovered ${hovered[prop]})`,
        resting[prop] !== hovered[prop],
      );
    }

    await page.mouse.move(0, 0);
    await page.locator(summarySel).click();
    await page.waitForSelector(bodySel, { state: "visible" });

    const triggerRect = await rectOf(page, summarySel);
    const bodyRect = await rectOf(page, bodySel);
    premise("the disclosed body has area to hover", bodyRect.w * bodyRect.h, 0);
    const sampleX = bodyRect.x + bodyRect.w / 2;
    const sampleY = bodyRect.y + bodyRect.h / 2;
    // The POINT is what has to be outside, not the body's top edge: the
    // trigger's `-m-2` makes its border box 8px taller than its margin box, so
    // the body's `mt-2` puts its top edge exactly ON the trigger's bottom edge.
    // Requiring the whole body to clear the box fails by 0px and would report a
    // wrong environment for a correct one.
    premiseHolds(
      `the sampled body point (${Math.round(sampleX)},${Math.round(sampleY)}) lies outside the trigger's 44px box`,
      sampleY > triggerRect.y + triggerRect.h ||
        sampleY < triggerRect.y ||
        sampleX > triggerRect.x + triggerRect.w ||
        sampleX < triggerRect.x,
    );

    await page.mouse.move(sampleX, sampleY);
    const whileBodyHovered = await settledProps(page, visualSel, props);

    // spec §2.2: `group` belongs on the <summary>. The outer <details> is an
    // ancestor too, so `group-hover:*` WOULD match from there — and hovering the
    // disclosed content would then light the trigger. The exact edit this
    // catches: add `group` to the <details> at components/admin/HelpTooltip.tsx.
    for (const prop of props) {
      expect(
        whileBodyHovered[prop],
        `hovering the disclosed body leaked ${prop} onto the trigger — is \`group\` on the <details>?`,
      ).toBe(resting[prop]);
    }
  });
});

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
            y: r.y,
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

        // Dropping `items-center` from the anchor top-aligns a correctly-sized
        // visual inside a correctly-sized target and moves the painted pill 8px
        // up, which sizes alone cannot see (§2.2's ownership table puts
        // `items-center`/`justify-center` on BOTH for exactly this reason).
        const visualBox = await pillVisual(page, n).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        });
        expect(
          visualBox.x + visualBox.w / 2 - (measured.x + measured.w / 2),
          `pill ${n} visual is not horizontally centred in its target`,
        ).toBeCloseTo(0, 1);
        expect(
          visualBox.y + visualBox.h / 2 - (measured.y + measured.h / 2),
          `pill ${n} visual is not vertically centred in its target`,
        ).toBeCloseTo(0, 1);

        // DI-5 (PRESERVATION, spec §8 — passes before AND after by design; do
        // not "strengthen" it into discriminating form). The margin box is what
        // the stepper's layout actually spends.
        //
        // The ORIGINAL reason this held was that the connectors were 0px wide at
        // 320px (probe P3), so the row had no slack at all. That is no longer
        // true: the connectors are a fixed 60px (`w-confirm-box`). The
        // assertion is unaffected, for a different and stronger reason — the
        // pill carries `shrink-0` (components/admin/OnboardingWizard.tsx
        // `base`), so it is excluded from flex distribution entirely and no
        // connector width can move its box.
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
    // Exact TOKEN, for the same reason the Class-B block splits: `.toContain("color")`
    // is satisfied by `background-color`, so `transition-[background-color]`
    // would pass while the pill's text colour snaps. This site kept the
    // substring form when round 5 repaired the other one — a class sweep of my
    // own repair would have caught it, which is the whole point of the rule.
    const transition = await visual.evaluate((el) => getComputedStyle(el).transitionProperty);
    const pillAnimated = new Set(transition.split(",").map((t) => t.trim()));
    // NO `all` escape hatch. `all` is what CSS computes when there is NO
    // transition utility at all, so accepting it made this assertion unable to
    // fail for the very regression it names: delete `transition-colors
    // duration-fast` and the property reads `all`, the duration reads `0s`,
    // `settledColor` shrinks its own wait to match, hover still reaches the
    // right colour instantly, and every check passed while the 120ms crossfade
    // was gone. `transition-colors` never computes to `all`.
    expect(
      pillAnimated.has("color"),
      `the visual span lost its colour transition (got "${transition}")`,
    ).toBe(true);
    const pillDuration = await visual.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(
      [...new Set(pillDuration.split(",").map((d) => d.trim()))],
      `the pill's colour transition was removed or retimed (got "${pillDuration}")`,
    ).toEqual(["0.12s"]);

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
      expectPreservedRadius(`pill ${n} target`, resting.targetRadius, "pill", TAP_MIN);
      expectPreservedRadius(`pill ${n} visual`, resting.spanRadius!, "pill", VISUAL_PILL);

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
      for (const mount of ALL_SUMMARY_MOUNTS) {
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

test.describe("DI-2 — five Class-A summaries stay narrower than their container; one spans it by design", () => {
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
            const card = summary?.closest("details");
            return {
              summary: summary ? summary.getBoundingClientRect().width : null,
              container: container.getBoundingClientRect().width,
              // The exempt site's claim is "spans its own card", so it is
              // measured against the <details> content box. Measuring it
              // against the whole mount would compare the header to a column
              // that also holds the heading row and the active-admins card,
              // and fail by their difference rather than by anything real.
              card: card
                ? card.getBoundingClientRect().width -
                  parseFloat(getComputedStyle(card).borderLeftWidth) -
                  parseFloat(getComputedStyle(card).borderRightWidth)
                : null,
            };
          });
        premiseHolds(`${mount} rendered a <summary>`, measured.summary !== null);
        premise(`${mount} container has width`, measured.container, 0);
        if (DI2_FULL_WIDTH_BY_DESIGN.has(mount)) {
          // Inverted, not skipped. This site must SPAN its container, because a
          // narrow target under a full-width-looking header is the defect. If
          // someone reapplies `w-fit` here, this fails.
          premiseHolds(`${mount} rendered a <details> card to span`, measured.card !== null);
          expect(
            measured.summary!,
            `${mount} is full-width BY DESIGN and lost it — was w-fit reapplied?`,
          ).toBeGreaterThanOrEqual(measured.card! - EPS);
        } else {
          expect(measured.summary!, `${mount} summary width vs container`).toBeLessThan(
            measured.container - EPS,
          );
        }

        // MEASURED, and it corrects this invariant's own stated cause. Spec
        // §2.1 attributes the narrow box to `w-fit` — "without it the <summary>
        // stays block-level and becomes a 288px-wide invisible band". That is
        // true of `w-fit` alone, but NOT of the recipe as shipped: the recipe
        // also sets `inline-flex`, and an inline-level flex container is
        // shrink-to-fit by definition. Probed by stripping `w-fit` from all six
        // summaries — every DI-2 case still passed at all four widths. So the
        // width comparison above proves the CONSEQUENCE and cannot attribute it
        // to `w-fit`, and saying otherwise would be a false attribution in a
        // guard whose whole job is to be exact.
        //
        // The token is still REQUIRED by the spec, so it is pinned as
        // conformance rather than as cause — belt over braces, labelled as
        // belt. It also stops mattering the moment someone changes the display
        // utility, which is precisely when a redundant guard earns its keep.
        if (!DI2_FULL_WIDTH_BY_DESIGN.has(mount)) {
          await expect(
            page.locator(`[data-mount="${mount}"] summary`),
            `${mount} summary dropped the spec-required w-fit token`,
          ).toHaveClass(/(^|\s)w-fit(\s|$)/);
        }
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

  test("<details> still toggles when its <summary> is a flex container", async ({ page }) => {
    await boot(page, 390);

    for (const mount of CLASS_A_MOUNTS) {
      const summary = summaryIn(page, mount);
      const display = await summary.evaluate((el) => getComputedStyle(el).display);
      // Changing a <summary>'s display was the standing risk of the Class-A
      // recipe (spec §2.1, probe P2), and the risk is the CHANGE, not one
      // spelling of it: five sites are `inline-flex` and the full-width one is
      // `flex`. The premise is that the recipe landed at all — without it the
      // toggle assertion below is just re-testing native <details>.
      premiseHolds(
        `${mount} summary is a flex container, so the display change under test applied (got "${display}")`,
        display === "inline-flex" || display === "flex",
      );

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

/* ────────────────────────────────────────────────────────────────────────────
 * BL-TAP-TARGET-NEIGHBOUR-OVERLAP-COVERAGE — the expansion band clears its
 * neighbour
 *
 * Spec: docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md §2.7
 * Plan: docs/superpowers/plans/2026-08-09-quick-wins-2/plan.md, Task A6
 *
 * WHAT WAS UNASSERTED. Every repaired control grows 8px per side beyond its
 * painted box (`-m-2`), and the growth is layout-neutral: the MARGIN box stays
 * the painted size, so the only thing keeping the grown target off an
 * interactive neighbour is the container's own `gap`. Three targets had no
 * assertion at all on that gap — mutant #14 from the tap-target arc (collapse a
 * container to `gap-0` so a grown target overlaps its neighbour) passes the
 * committed suite for all three.
 *
 * THE APPROACH IS RATIFIED AND NOT RE-OPENED HERE (spec §1.1 item 2): the
 * arithmetic gap assertion derived from each container's own gap token, NOT a
 * harness redesign that mounts production containers. So the FORM is fixed per
 * container by what the live entry actually mounts, measured 2026-08-09:
 *
 *   HelpSheet close  — the sheet IS mounted, so the gap is MEASURED in the
 *                      real engine, on the real computed style.
 *   Step3Review      — not in any mounted subtree: STATIC PIN.
 *   StagedReviewCard — not in any mounted subtree: STATIC PIN.
 *
 * CONSEQUENCE BOUND. This asserts gap ARITHMETIC, not production adjacency —
 * the production neighbour inventory stays hand-traced and a page-level harness
 * is out of scope (spec §4 limit 5). What the pins guarantee is that a
 * container whose gap collapses below the band fails loudly, rather than
 * shipping an overlap nobody measured.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The per-side growth a repaired target takes beyond its painted box.
 *
 * DERIVED from the two sizes this file already pins rather than written as `8`:
 * the target is `size-tap-min` (44) around a `size-7` visual (28), so each side
 * grows (44 − 28) / 2. A literal would go stale silently the day either token
 * moves; this cannot.
 */
const EXPANSION_BAND_PER_SIDE = (TAP_MIN - VISUAL_PILL) / 2;

/**
 * The LITERAL className of the IMMEDIATE PARENT of the element carrying
 * `testId`, read out of the source with the TypeScript parser.
 *
 * IMMEDIATE, not "nearest ancestor that happens to declare a gap": the walk used
 * to climb, and deleting the inner `gap-2` made it accept an outer `flex-col`
 * row's VERTICAL gap while reporting PASS (review R1).
 *
 * IT RETURNS THE WHOLE CLASS STRING AND PARSES NOTHING ELSE, and that is the
 * repair for a recognizer that could not stop growing. Three consecutive review
 * rounds landed on the same shape — the gap extractor did not model
 * `gap-x-0` beside `gap-2`, or stacked variants (`md:hover:gap-0`), or
 * semantic-valued ones (`min-[1240px]:gap-x-tile-gap`), or a per-viewport
 * collapse restored at the far endpoint. Each round widened it and the next
 * round found the spelling it still missed, because "which Tailwind utilities
 * win at this width" is an open question about a compiler, and a regex is the
 * wrong instrument for it.
 *
 * So the regex is GONE. The caller hands the entire class string to the real
 * engine and measures what it computes, at every viewport the suite declares.
 * The AST's job is now only to answer "which element, and what does its
 * className literally say" — a closed question about one node.
 *
 * `null` — no parent, or a non-literal className — is a PREMISE failure at the
 * call site, never a pass. A className built from a template or a variable is
 * unreadable from source, so this refuses to vouch for it.
 */
/**
 * The tokens in `className` that AFFECT A GAP but are conditioned on something
 * this suite's viewport sweep cannot settle.
 *
 * Two inversions live here, and they are different from each other.
 *
 * WHICH VARIANTS ARE OK is an ACCEPT-SET (review R7). The first version listed
 * pseudo-state prefixes to refuse; `has-[:hover]:gap-0` walked straight through
 * it, because arbitrary variants are an open set. The sweep only resizes the
 * viewport, so only width variants can be settled — every other variant is
 * refused, INCLUDING spellings nobody has written yet, since they are not on
 * the accept-list either.
 *
 * WHICH TOKENS ARE GAPS is decided BY THE COMPILED STYLESHEET (review R9). That
 * accept-set was still guarded by a regex recognizing named `gap-*` utilities,
 * so `has-[:hover]:[gap:0px]` was never even offered to it — along with
 * `[column-gap:…]`, `[row-gap:…]` and the legacy `grid-*` aliases. Recognizing
 * Tailwind spellings is the exact defect this file already deleted twice. So
 * nothing here recognizes anything: it finds the rule the engine EMITTED for
 * each class and reads the property names off the declaration. A token is a gap
 * token iff the browser says its rule sets a gap property, whatever it is spelt
 * like, and a token the compiler never emitted sets nothing and is correctly
 * ignored.
 *
 * Variant splitting is bracket-aware for the same reason: `has-[:hover]:[gap:0px]`
 * splits on the TWO structural colons, not on the four a naive `split(":")` sees.
 */
async function gapTokensNotSettledByWidth(page: Page, className: string): Promise<string[]> {
  return page.evaluate((cls) => {
    const VIEWPORT_VARIANT =
      /^(?:sm|md|lg|xl|2xl|min-\[[^\]]+\]|max-\[[^\]]+\]|max-(?:sm|md|lg|xl|2xl))$/;

    const variantsOf = (token: string): string[] => {
      const parts: string[] = [];
      let depth = 0;
      let current = "";
      for (const ch of token) {
        if (ch === "[" || ch === "(") depth += 1;
        else if (ch === "]" || ch === ")") depth -= 1;
        if (ch === ":" && depth === 0) {
          parts.push(current);
          current = "";
          continue;
        }
        current += ch;
      }
      parts.push(current);
      return parts.slice(0, -1);
    };

    // The class's own emitted rule, matched on the escaped selector with a
    // right boundary so `.gap-2` never claims `.gap-24`'s declarations.
    //
    // The declarations are read from the matched rule AND ITS WHOLE SUBTREE,
    // because Tailwind v4 emits variants as native CSS nesting: `hover:gap-0`
    // compiles to `.hover\:gap-0 { &:hover { gap: … } }`, whose OUTER rule
    // carries zero declarations. A first version read only the outer rule's
    // `style`, found nothing, and reported every state-conditioned gap as "not
    // a gap class" — the precise silence it exists to break. Its own probe
    // caught it: `has-[:hover]:[gap:0px]` and `hover:gap-0` were both waved
    // through. The nested rules are where the declaration actually lives.
    const gapInSubtree = (rule: CSSRule): boolean => {
      const style = (rule as CSSStyleRule).style;
      if (style) {
        for (let i = 0; i < style.length; i += 1) {
          if (/gap/.test(style.item(i))) return true;
        }
      }
      const kids = (rule as CSSGroupingRule).cssRules;
      if (kids) {
        for (const kid of Array.from(kids)) {
          if (gapInSubtree(kid)) return true;
        }
      }
      return false;
    };

    const declaresGap = (token: string): boolean => {
      const escaped = CSS.escape(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const needle = new RegExp(`\\.${escaped}(?![A-Za-z0-9_-])`);
      const visit = (rules: CSSRuleList): boolean => {
        for (const rule of Array.from(rules)) {
          const selector = (rule as CSSStyleRule).selectorText;
          if (typeof selector === "string" && needle.test(selector) && gapInSubtree(rule)) {
            return true;
          }
          // Descend regardless: the matching rule can sit inside an `@media`,
          // `@layer` or `@supports` wrapper.
          const kids = (rule as CSSGroupingRule).cssRules;
          if (kids && visit(kids)) return true;
        }
        return false;
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          if (visit(sheet.cssRules)) return true;
        } catch {
          // Cross-origin sheet: unreadable, and never one of ours.
        }
      }
      return false;
    };

    return cls
      .split(/\s+/)
      .filter((token) => token.length > 0)
      .filter(declaresGap)
      .filter((token) => variantsOf(token).some((v) => !VIEWPORT_VARIANT.test(v)));
  }, className);
}

function immediateParentClassOf(relPath: string, testId: string): string | null {
  const source = readFileSync(join(REPO_ROOT, relPath), "utf8");
  const sourceFile = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );

  const literalClassOf = (opening: ts.JsxOpeningLikeElement): string | null => {
    for (const attr of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attr) || attr.name.getText(sourceFile) !== "className") continue;
      const init = attr.initializer;
      if (init !== undefined && ts.isStringLiteral(init)) return init.text;
      return null;
    }
    return null;
  };

  const carriesTestId = (opening: ts.JsxOpeningLikeElement): boolean =>
    opening.attributes.properties.some(
      (attr) =>
        ts.isJsxAttribute(attr) &&
        attr.name.getText(sourceFile) === "data-testid" &&
        attr.initializer !== undefined &&
        ts.isStringLiteral(attr.initializer) &&
        attr.initializer.text === testId,
    );

  // EVERY match, not the first. Taking the first answers "which element?"
  // silently: a duplicate testid earlier in AST order binds the wrong element and
  // the pin then measures a container it was never about (review R4). A closed
  // question with two answers is not closed, so ambiguity is REFUSED.
  const anchors: ts.Node[] = [];
  const findAnchors = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && carriesTestId(node)) {
      anchors.push(ts.isJsxOpeningElement(node) ? node.parent : node);
    }
    ts.forEachChild(node, findAnchors);
  };
  findAnchors(sourceFile);
  if (anchors.length !== 1) return null;
  const anchor = anchors[0] as ts.Node;

  let parent: ts.Node | undefined = anchor.parent;
  while (
    parent !== undefined &&
    (ts.isJsxExpression(parent) || ts.isParenthesizedExpression(parent))
  ) {
    parent = parent.parent;
  }
  if (parent === undefined || !ts.isJsxElement(parent)) return null;
  return literalClassOf(parent.openingElement);
}

/**
 * The two containers that are NOT in any mounted subtree, anchored by a testid
 * inside them rather than by a line number (the entry's own citations had
 * already rotted a directory prefix by the time this arc read them).
 */
const STATIC_GAP_PINS = [
  {
    label: "HelpSheet trigger container (Step3Review header row)",
    file: "components/admin/wizard/Step3Review.tsx",
    anchorTestId: "wizard-step3-heading",
  },
  {
    label: "HelpTooltip container (StagedReviewCard summary row)",
    file: "components/admin/StagedReviewCard.tsx",
    anchorTestId: "staged-parse-summary",
  },
] as const;

test.describe("§2.7 — the 8px expansion band cannot reach an interactive neighbour", () => {
  test("premise: the band is a real, positive distance derived from this file's own sizes", () => {
    premise(
      "expansion band per side, derived from (TAP_MIN - VISUAL_PILL) / 2",
      EXPANSION_BAND_PER_SIDE,
      0,
    );
  });

  for (const pin of STATIC_GAP_PINS) {
    test(`static pin: ${pin.label} keeps a gap that clears the band at every viewport`, async ({
      page,
    }) => {
      const classText = immediateParentClassOf(pin.file, pin.anchorTestId);
      // PREMISE, not the assertion. "No literal className on the immediate
      // parent" must fail HERE — otherwise it is indistinguishable from "the
      // container is fine", which is how a pin goes quietly vacuous. It covers
      // three shapes at once: the anchor moved, the container lost its class,
      // or the className became non-literal and unreadable from source.
      premiseHolds(
        `${pin.label}: [data-testid="${pin.anchorTestId}"]'s IMMEDIATE parent in ${pin.file} ` +
          `carries a literal className`,
        classText !== null,
      );
      const className = classText as string;

      await boot(page, VIEWPORTS[0]);

      // WHICH GAP VARIANTS THIS PROBE CAN ACTUALLY SETTLE. Both halves — which
      // tokens are gaps, and which variants are exercisable — are decided by the
      // engine and an accept-set rather than by recognizing spellings; see
      // `gapTokensNotSettledByWidth`. Runs after `boot` because it reads the
      // COMPILED stylesheet, which is the whole point.
      const unexercisable = await gapTokensNotSettledByWidth(page, className);
      premiseHolds(
        `${pin.label}: every gap-setting class on this container is one the viewport sweep can ` +
          `settle (unexercisable: ${unexercisable.join(", ") || "none"}). A gap conditioned on ` +
          `anything but width — hover, focus, group/peer state, an arbitrary \`has-[…]\` variant — ` +
          `cannot be settled by a hidden probe, so it is refused rather than measured at its ` +
          `resting value.`,
        unexercisable.length === 0,
      );

      // EVERY declared viewport, because a gap that collapses in the MIDDLE of
      // the range is invisible to endpoint sampling: `gap-2 min-[720px]:gap-0
      // min-[1280px]:gap-2` measures 8 at both ends and 0 at 768 (review R3).
      const measured: { width: number; column: number; row: number }[] = [];
      for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: 900 });
        const gaps = await page.evaluate((cls) => {
          const probe = document.createElement("div");
          // The container's WHOLE class string, resolved by the real engine.
          // Nothing here parses Tailwind: `gap-x-0` beside `gap-2`, a stacked
          // `md:hover:gap-0`, a semantic `min-[1240px]:gap-x-tile-gap` — the
          // compiler settles all of them, and a recognizer never would.
          probe.className = cls;
          probe.style.position = "absolute";
          probe.style.visibility = "hidden";
          probe.appendChild(document.createElement("span"));
          probe.appendChild(document.createElement("span"));
          document.body.appendChild(probe);
          const cs = getComputedStyle(probe);
          const out = { column: parseFloat(cs.columnGap), row: parseFloat(cs.rowGap) };
          probe.remove();
          return out;
        }, className);
        measured.push({ width, ...gaps });
      }

      // A class string the compiled stylesheet never emitted computes to 0 and
      // would "fail" for the wrong reason. Said as a premise so the two are
      // never confused — and asserted on the WIDEST measurement, so a genuine
      // collapse at one width still reaches the assertion below.
      premiseHolds(
        `${pin.label}: the compiled stylesheet resolves this container's classes (measured ` +
          `${measured.map((m) => `${m.width}:${m.column}`).join(", ")}); an unemitted class would ` +
          `read 0 everywhere and be indistinguishable from a collapsed gap`,
        measured.some((m) => Number.isFinite(m.column) && m.column > 0),
      );

      // BOTH AXES. The probe measured `row` all along and the assertion threw it
      // away, which is not a recognizer gap — the engine and the probe agree —
      // it is an assertion ignoring a number it already had. `gap-x-2 gap-y-0`
      // measures 8/0 and passed (review R5). It matters for a real container:
      // StagedReviewCard's row is `flex-wrap`, so when it wraps, the ROW gap is
      // what separates the wrapped lines from each other.
      const below = measured.filter(
        (m) => !(m.column >= EXPANSION_BAND_PER_SIDE) || !(m.row >= EXPANSION_BAND_PER_SIDE),
      );
      expect(
        below.map((m) => `${m.width}px: column=${m.column}px row=${m.row}px`),
        `${pin.label} — its immediate container ("${className}") stops keeping the ` +
          `${EXPANSION_BAND_PER_SIDE}px expansion band off its neighbour at these widths. This is ` +
          `mutant #14 from the tap-target arc: a grown target overlaps the control beside it, and ` +
          `every other assertion in this file still passes because the PAINTED boxes never moved.`,
      ).toEqual([]);
    });
  }

  // EVERY declared viewport, for the same reason the static pins now sweep them:
  // endpoint-only sampling misses a collapse in the middle of the range
  // (`gap-2 min-[720px]:gap-0 min-[1280px]:gap-2` reads 8, 8 at the ends and 0
  // at 768). This case measures the REAL mounted header, so it needs no probe.
  for (const width of VIEWPORTS) {
    test(`measured @${width}px: the HelpSheet header row's computed gap clears the band on both axes`, async ({
      page,
    }) => {
      await boot(page, width);
      await openHelpSheet(page);

      // The MEASURED path needs the same refusal as the static pins, and did not
      // have it (review R9): this case reads the header at its RESTING state, so
      // an ordinary `hover:gap-0` on the real element measures the base gap and
      // passes while the live container collapses under the pointer. Same
      // decision procedure, applied to the class string the mounted element
      // actually carries.
      const headerClassName = await page
        .locator('[data-testid="help-sheet-body"] > header')
        .evaluate((el) => el.className);
      const unexercisable = await gapTokensNotSettledByWidth(page, headerClassName);
      premiseHolds(
        `the mounted HelpSheet header's gap classes are all settled by width (unexercisable: ` +
          `${unexercisable.join(", ") || "none"}). A gap conditioned on hover, focus, group/peer ` +
          `state or an arbitrary \`has-[…]\` variant is not measurable at rest, so it is refused ` +
          `rather than read at its resting value.`,
        unexercisable.length === 0,
      );

      // Re-queried AFTER the open (detach-safety): the header does not exist in
      // the pre-click DOM at all.
      const gaps = await page.locator('[data-testid="help-sheet-body"] > header').evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          column: parseFloat(cs.columnGap),
          row: parseFloat(cs.rowGap),
          display: cs.display,
        };
      });

      // The gap only separates anything if the row is a flex/grid container —
      // `column-gap` on a block element computes to a number and means nothing.
      premiseHolds(
        `the HelpSheet header is a flex row (computed display ${gaps.display})`,
        gaps.display.includes("flex") || gaps.display.includes("grid"),
      );

      for (const axis of ["column", "row"] as const) {
        expect(
          gaps[axis],
          `HelpSheet close button @${width}px — the header's computed ${axis}-gap no longer clears ` +
            `the ${EXPANSION_BAND_PER_SIDE}px expansion band, so the grown close target can reach ` +
            `the heading beside it (mutant #14).`,
        ).toBeGreaterThanOrEqual(EXPANSION_BAND_PER_SIDE);
      }
    });
  }
});
