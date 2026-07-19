/**
 * tests/e2e/skeletonBandParity.spec.ts (modal-header-reconciliation §6.1.1 — Task 9)
 *
 * T-SKELETON-BANDS. `ReviewModalShell` has THREE consumers, not two, and the
 * third — `ShowReviewModalSkeleton` — renders through the SAME shell with the
 * SAME identifiers as the loaded published modal. If it keeps the OLD nested
 * two-band header, a slow `/admin?show=<slug>` load shows the before-state
 * header and then SNAPS to the after-state the instant content streams in:
 * exactly the layout this change removes, at exactly the moment the user is
 * watching the header. The skeleton is the only thing on screen during that
 * window, so the regression is maximally visible.
 *
 * WHAT THIS SPEC DELIBERATELY DOES NOT ASSERT — exact height parity. The
 * skeleton's rows are fixed placeholder BARS; the loaded rows are type-set
 * TEXT whose box is a resolved line-height. A 24px bar and a text-lg line box
 * differ by construction and no fixture makes them equal. Demanding equality
 * would buy a CI flake, or a "fix" that distorts one side to chase pixels.
 * The assertions are scoped to the invariant that actually causes the visible
 * snap — where the header->subheader seam sits — plus the structural facts
 * that ARE exactly assertable:
 *
 *   A  exactly 3 bands (header, subheader, body), same count as loaded — EXACT
 *   B  the subheader's seam/surface/padding classes match — EXACT (both come
 *      from the shell, so this is really "did it go through the slot")
 *   C  the same number of header text rows (title + subline = 2) — EXACT COUNT
 *   D  the header->subheader seam offset differs by <= 8px — one `--spacing`
 *      step, smaller than one text row (~20-28px), so it cannot mask a missing
 *      row (C catches that exactly) while absorbing bar-vs-line-box variance
 *   E  subheader band height differs by <= 4px — but only at >=sm, where the
 *      strip is `sm:flex-nowrap` and the plan's premise ("both are a single
 *      control row") actually holds. At 390px `flex-wrap` is live and the
 *      loaded strip wraps to THREE rows, so the sheet-mode case asserts the
 *      honest weaker clause instead. See the test body — this is a REPORTED
 *      finding (00-overview.md M5), not a widened tolerance.
 *
 * If D cannot hold at 8px on a correct implementation, that is a FINDING to
 * report, not a tolerance to widen — the skeleton's bar heights are the lever.
 * D holds at ~1px at both viewports; it was E whose premise did not survive.
 *
 * STANDALONE static harness (no app boot / no Supabase / no seed), following
 * the in-repo pattern of tests/e2e/statusStripToggleLayout.spec.ts:
 *   1. `tsx` runs _skeletonParityHarness.tsx OUT of process -> one HTML string
 *      carrying BOTH states. HASH_FOR_LOG_PEPPER is set for the subprocess only
 *      to satisfy a module-load guard on a transitively-imported auth helper;
 *      no email is ever hashed here.
 *   2. compile the real token CSS from app/globals.css via the Tailwind CLI
 *      with `@source` globbing that page, so BOTH states' classes generate from
 *      ONE stylesheet — the two states differ only in markup, which is the point.
 *   3. serve over node:http; measure `getBoundingClientRect()`.
 *
 * Both states share `testIdBase="published-show-review"`, so every locator is
 * scoped through `[data-parity="skeleton"|"loaded"]`. An unscoped locator would
 * silently measure whichever state came first in the DOM.
 *
 * SETTLING: `document.fonts.ready` plus an rAF tick before any rect is read —
 * font swap after first paint is the single likeliest source of a flaky height
 * delta. The harness inlines its CSS and references no remote font, image or
 * script, so NO network settling is required. Do not add speculative waits.
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer/Supabase):
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/skeletonBandParity.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");

/** Duplicated here + cross-checked against the harness JSON so the two can
 *  never drift silently. */
const HARNESS_DFID = "drive-skeleton-parity-1";
const HARNESS_TITLE = "Acme Gala";

const BASE = "published-show-review";

/** Plan 04-verification.md's tolerances — D and E are deliberately different. */
const SEAM_TOL = 8;
const BAND_TOL = 4;

/** Sheet mode (<sm, adds the grab strip) and popup mode (>=sm). */
const VIEWPORTS = [
  { mode: "sheet", width: 390, height: 844 },
  { mode: "popup", width: 1280, height: 900 },
] as const;

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "skeleton-band-parity-"));

  const jsonPath = join(workDir, "page.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_skeletonParityHarness.tsx"), jsonPath],
    {
      cwd: REPO_ROOT,
      stdio: "pipe",
      timeout: 120_000,
      env: { ...process.env, HASH_FOR_LOG_PEPPER: "test-harness-pepper-000000000000000000" },
    },
  );
  const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as {
    dfid: string;
    title: string;
    page: string;
  };
  expect(parsed.dfid, "spec-local dfid matches the harness fixture").toBe(HARNESS_DFID);
  expect(parsed.title, "spec-local title matches the harness fixture").toBe(HARNESS_TITLE);

  writeFileSync(
    join(workDir, "parity.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg">${parsed.page}</body></html>`,
  );

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "parity.html")}";\n${globals}`);
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "parity.html" : url.replace(/^\//, "");
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

async function open(page: Page, viewport: { width: number; height: number }): Promise<void> {
  // Reduced motion collapses the panel entrance animation (app/globals.css), so
  // geometry is final on load — same flake-avoidance choice as the sibling
  // published-review-modal.layout.spec.ts.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto(baseUrl);
  await expect(page.locator(`[data-parity="skeleton"] ${sel("header")}`)).toBeVisible();
  await expect(page.locator(`[data-parity="loaded"] ${sel("header")}`)).toBeVisible();
  // Font swap after first paint is the one real reflow risk; settle it exactly
  // rather than sleeping on a guess. The rAF tick lets the post-swap layout
  // commit before any rect is read.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

function sel(name: string): string {
  return `[data-testid="${BASE}-${name}"]`;
}

/** Scoped to ONE state — both states carry identical testids. */
function inState(page: Page, state: "skeleton" | "loaded", name: string): Locator {
  return page.locator(`[data-parity="${state}"] ${sel(name)}`);
}

function panel(page: Page, state: "skeleton" | "loaded"): Locator {
  return page.locator(`[data-parity="${state}"] [data-review-modal-panel]`);
}

async function rect(loc: Locator): Promise<DOMRect> {
  return loc.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
}

for (const { mode, width, height } of VIEWPORTS) {
  test.describe(`ShowReviewModalSkeleton band parity — ${mode} @ ${width}x${height}`, () => {
    // A — structural, no measurement. RED pre-change: the skeleton renders no
    // `-subheader` element at all, so the count cannot even resolve.
    test("A: the skeleton renders the same three bands as the loaded modal", async ({ page }) => {
      await open(page, { width, height });
      for (const state of ["skeleton", "loaded"] as const) {
        await expect(inState(page, state, "header"), `${state} header`).toHaveCount(1);
        await expect(inState(page, state, "subheader"), `${state} subheader`).toHaveCount(1);
      }
      // The body is the third band. Each state names its own body node, so this
      // asserts presence per state rather than a shared testid.
      await expect(
        page.locator(`[data-parity="skeleton"] ${sel("loading")}`),
        "skeleton body band",
      ).toHaveCount(1);
      await expect(
        page.locator(
          `[data-parity="loaded"] [data-testid="wizard-step3-card-${HARNESS_DFID}-review-main"]`,
        ),
        "loaded body band",
      ).toHaveCount(1);
    });

    // B — both bands are emitted by ReviewModalShell, so any difference means
    // the skeleton hand-rolled a band instead of going through the slot.
    test("B: the skeleton's subheader carries the shell's exact band classes", async ({ page }) => {
      await open(page, { width, height });
      // Fail FAST rather than burning the 120s test timeout inside evaluate()
      // when the band is simply absent (which is the pre-change state).
      await expect(inState(page, "skeleton", "subheader")).toHaveCount(1, { timeout: 5_000 });
      const classOf = (state: "skeleton" | "loaded") =>
        inState(page, state, "subheader").evaluate((el) => el.className);
      const skeletonClass = await classOf("skeleton");
      const loadedClass = await classOf("loaded");
      expect(skeletonClass).toBe(loadedClass);
      // Non-vacuity: an empty className on BOTH sides would satisfy the equality
      // above while proving nothing. Pin the seam, surface and padding the band
      // actually owns.
      for (const cls of ["border-b", "border-border", "bg-surface", "px-tile-pad", "py-2"]) {
        expect(skeletonClass, `band retains ${cls}`).toContain(cls);
      }
    });

    // C — the REAL content of §6.1.1's second requirement, and the exact
    // (non-pixel) catch for the missing subline row. RED pre-change: the
    // skeleton header had a title row and a STRIP row, and no subline row.
    test("C: both headers contain the same number of text rows (title + subline)", async ({
      page,
    }) => {
      await open(page, { width, height });
      // Counted STRUCTURALLY, not via a marker attribute: adding a
      // `data-parity-row` hook to PublishedReviewModal would put test-only
      // markup in a production header that Task 9 has no business editing, and
      // a header could then satisfy the count while rendering nothing.
      //
      // Both headers open with the same shell-mandated shape — a `min-w-0
      // flex-1` text block followed by a shrink-0 action group — so the text
      // rows are the text block's own element children. `sr-only` nodes are
      // excluded: the skeleton's accessible-name <h2> is a naming device, not a
      // rendered row, and counting it would let a subline-less header pass.
      const rowCount = (state: "skeleton" | "loaded") =>
        inState(page, state, "header").evaluate((el) => {
          const textBlock = el.firstElementChild;
          if (!textBlock) return -1;
          return Array.from(textBlock.children).filter(
            (c) => !c.classList.contains("sr-only") && c.getBoundingClientRect().height > 0,
          ).length;
        });
      const skeletonRows = await rowCount("skeleton");
      const loadedRows = await rowCount("loaded");
      expect(loadedRows, "loaded header rows (title + subline)").toBe(2);
      expect(skeletonRows, "skeleton header rows (title + subline)").toBe(loadedRows);
    });

    // D — the headline invariant: WHERE THE SEAM SITS. Measured from the
    // panel's content-box top so the grab strip (sheet mode only) and any
    // panel border are absorbed identically on both sides.
    test(`D: the header->subheader seam offset matches within ${SEAM_TOL}px`, async ({ page }) => {
      await open(page, { width, height });
      const seam = async (state: "skeleton" | "loaded") => {
        const p = await rect(panel(page, state));
        const h = await rect(inState(page, state, "header"));
        return h.bottom - p.top;
      };
      const skeletonSeam = await seam("skeleton");
      const loadedSeam = await seam("loaded");
      expect(
        Math.abs(skeletonSeam - loadedSeam),
        `skeleton seam ${skeletonSeam} vs loaded seam ${loadedSeam}`,
      ).toBeLessThanOrEqual(SEAM_TOL);
    });

    // E — SCOPED TO >=sm, and that scoping is a REPORTED FINDING, not a dodge.
    //
    // The plan's stated rationale for E's tight 4px bound is, verbatim, that
    // "both are a single control row whose height is driven by the band's own
    // py-2 plus a ~24px child". That premise is TRUE at >=sm, where the strip
    // is `sm:flex-nowrap`. It is FALSE at 390px: `flex-wrap` is live there, and
    // measured inside the panel the loaded strip wraps to THREE rows —
    // [toggle, live] / [status, Re-sync] / [copy] — for a 149px band against
    // the skeleton's 73px.
    //
    // The gap is NOT closable by tuning bar heights (the lever the plan
    // nominates for D). The wrap point is a function of the RENDERED DATA: the
    // status line's width depends on its relative-time strings, so "Synced 1
    // hour ago" and "Synced 3 days ago" wrap differently. Sizing the
    // placeholders to reproduce THIS fixture's 3-row wrap would overfit to one
    // timestamp and assert nothing about any real show, while looking green.
    //
    // So the tight bound is asserted where its premise holds, and 390px gets
    // the honest weaker clause below. The underlying cause — a control strip
    // that wraps to three rows at phone width — is a DESIGN finding recorded as
    // M4/M5 in 00-overview.md for the close-out impeccable gate. It is not a
    // defect in the skeleton, and it is not something a test tolerance should
    // paper over.
    const bandHeights = async (page: Page) => {
      await open(page, { width, height });
      await expect(inState(page, "skeleton", "subheader")).toHaveCount(1, { timeout: 5_000 });
      return {
        skeleton: (await rect(inState(page, "skeleton", "subheader"))).height,
        loaded: (await rect(inState(page, "loaded", "subheader"))).height,
      };
    };

    if (mode === "popup") {
      test(`E: the subheader band heights match within ${BAND_TOL}px`, async ({ page }) => {
        const { skeleton, loaded } = await bandHeights(page);
        expect(skeleton, "skeleton band is non-vacuous").toBeGreaterThan(0);
        expect(
          Math.abs(skeleton - loaded),
          `skeleton band ${skeleton} vs loaded band ${loaded}`,
        ).toBeLessThanOrEqual(BAND_TOL);
      });
    } else {
      test("E (sheet): the skeleton band is a real control row, never a collapsed sliver", async ({
        page,
      }) => {
        const { skeleton, loaded } = await bandHeights(page);
        // What IS assertable at 390px without overfitting: the skeleton band
        // reserves at least one full tap row plus the band's own py-2, so it
        // reads as a control strip rather than a hairline that pops open. This
        // catches the regression that actually matters here — a skeleton whose
        // band collapsed because its placeholder row lost `min-h-tap-min`.
        const TAP_ROW_PLUS_PADDING = 44 + 16;
        expect(
          skeleton,
          `skeleton band ${skeleton} reserves a full tap row (loaded band is ${loaded}, wrapped)`,
        ).toBeGreaterThanOrEqual(TAP_ROW_PLUS_PADDING);
        // Non-vacuity in the other direction: the skeleton must never claim
        // MORE room than the loaded band, which would snap upward.
        expect(skeleton, "skeleton band never exceeds the loaded band").toBeLessThanOrEqual(loaded);
      });
    }
  });
}
