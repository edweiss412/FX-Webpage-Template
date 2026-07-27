/**
 * tests/e2e/agendaScheduleLayout.spec.ts (Task 16 — spec §6 dimensional invariants)
 *
 * Real-browser layout-dimensions assertions for the agenda area in the Schedule
 * section: the AgendaEmbed affordance row + the AgendaScheduleBlock session
 * rows. jsdom (the unit suites) computes NO layout, and this project's Tailwind
 * v4 does NOT default `.flex` to `align-items: stretch` — so the §6
 * no-horizontal-overflow + long-title-wraps invariants must be verified
 * end-to-end in a browser.
 *
 * HARNESS (standalone, no app boot): the agenda area is rendered inside the
 * Schedule section only when a show has high-confidence extracted agenda data,
 * which no route renders standalone with a seeded extraction. So per the
 * project's documented standalone real-browser layout harness
 * (memory/reference_standalone_realbrowser_layout_harness, mirrors
 * tests/e2e/step3-card-dimensions.spec.ts) this spec:
 *   1. compiles the REAL token CSS from app/globals.css via the Tailwind CLI
 *      (so `min-w-0`, `grid-cols-[auto_minmax(0,1fr)]`, `wrap-break-word`,
 *      `flex-wrap`, etc. resolve exactly as the build emits them);
 *   2. writes a static harness.html with the EXACT class structure transcribed
 *      from components/crew/AgendaScheduleBlock.tsx + components/agenda/
 *      AgendaEmbed.tsx, inside a fixed-width Schedule column, including a
 *      worst-case 90-char UNBREAKABLE-token session title;
 *   3. serves it over HTTP (file:// is blocked in Chromium automation) and
 *      measures getBoundingClientRect() at 320 / 390 / 720px.
 *
 * §6 invariants asserted:
 *   - the affordance row + every `[data-testid="agenda-session"]` stay within
 *     the column width (no horizontal overflow) at 320 / 390 / 720px;
 *   - a 90-char unbreakable title WRAPS (its row grows taller than a normal
 *     single-line session) instead of overflowing the column;
 *   - zero horizontal document overflow.
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";
import { OPEN_ROW_SESSIONS, TOTAL_DAYS, TOTAL_SESSIONS } from "./_agendaFixture";

// CommonJS package — Playwright's CJS loader provides __dirname (do NOT use
// import.meta.url; it flips the module to ESM). Mirrors step3-card-dimensions.
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const VIEWPORTS = [320, 390, 720] as const;
const BODY_PAD = 16; // mirrors the crew page's `px-4` content gutter

// Affordance row + schedule block, transcribed VERBATIM from the components so
// the measured geometry exercises the real Tailwind classes (not a paraphrase).
function agendaHtml(): string {
  return `
<div data-testid="agenda-col" class="flex min-w-0 flex-col gap-3">
  <div data-testid="agenda-embed" class="flex flex-wrap gap-2">
    <button type="button" class="inline-flex min-h-tap-min items-center gap-2 self-start rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-strong shadow-(--shadow-tile)">
      <span aria-hidden="true" class="size-4"></span>View agenda<span class="text-text-subtle">· RFI</span>
    </button>
    <button type="button" class="inline-flex min-h-tap-min items-center gap-2 self-start rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-strong shadow-(--shadow-tile)">
      <span aria-hidden="true" class="size-4"></span>View agenda<span class="text-text-subtle">· PCF</span>
    </button>
  </div>
  ${agendaScheduleHtml()}
</div>`;
}

/**
 * The REAL component's markup, rendered OUT OF PROCESS.
 *
 * Not inline: Playwright compiles the files it loads with its own JSX factory, so importing the
 * component here yields Playwright JSX objects and `renderToStaticMarkup` rejects them with
 * "Objects are not valid as a React child". Measured — that is exactly what the inline version
 * produced. So this shells out to `_renderAgendaScheduleHtml.ts`, the same way the CSS step
 * already shells out to the Tailwind CLI, and gets HTML from React's own transform.
 *
 * The previous version of this harness hand-transcribed the day markup, and by the time the fold
 * shipped that copy still described the PRE-FOLD structure — plain divs with an h3, no <details>
 * at all — while every dimension assertion passed against it. That drift is why the copy is gone.
 */
function agendaScheduleHtml(): string {
  return execFileSync(
    "pnpm",
    ["exec", "tsx", join(REPO_ROOT, "tests/e2e/_renderAgendaScheduleHtml.ts")],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 120_000,
    },
  );
}

function harnessHtml(cssHref: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg" style="margin:0; padding-left:${BODY_PAD}px; padding-right:${BODY_PAD}px;">
  ${agendaHtml()}
</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "agenda-schedule-dim-"));

  // Write the harness FIRST so the Tailwind CLI scans it and emits every
  // utility it uses (Tailwind v4 only generates classes it finds in @source).
  writeFileSync(join(workDir, "harness.html"), harnessHtml("out.css"));

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);

  compileEntryCss({ entryCss: entryCss, outFile: join(workDir, "out.css") });

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "harness.html" : url.replace(/^\//, "");
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

type Rect = {
  left: number;
  right: number;
  width: number;
  top: number;
  bottom: number;
  height: number;
};

async function rectOf(locator: import("@playwright/test").Locator): Promise<Rect> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      width: r.width,
      top: r.top,
      bottom: r.bottom,
      height: r.height,
    };
  });
}

for (const vw of VIEWPORTS) {
  test(`agenda area: no child overflows the column @ ${vw}px (§6)`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: 1200 });
    await page.goto(baseUrl);

    const col = await rectOf(page.getByTestId("agenda-col"));

    // The affordance row stays within the column.
    const embed = await rectOf(page.getByTestId("agenda-embed"));
    expect(embed.right, `affordance row right within column @ ${vw}`).toBeLessThanOrEqual(
      col.right + TOL,
    );
    expect(embed.left, `affordance row left within column @ ${vw}`).toBeGreaterThanOrEqual(
      col.left - TOL,
    );

    // Every VISIBLE session row stays within the column (no horizontal overflow).
    //
    // Scoped to visible ones because the fold hides non-viewer days inside a closed
    // <details>, and a hidden element legitimately reports an all-zero rect — which this
    // assertion previously read as "left edge at 0, outside the column". The failure was the
    // test's assumption that every session is painted, not a layout defect.
    //
    // The count assertion below is load-bearing and must stay: a bare `filter(visible)` would
    // also pass if NOTHING were visible, which is precisely the silent-fold failure this file
    // exists to catch. The fixture renders one open day with one session, so exactly 1 is
    // expected, and the folded days' sessions must be absent from the measured set.
    const allSessions = page.getByTestId("agenda-session");
    const total = await allSessions.count();
    expect(total, `the fixture's sessions all exist in the DOM @ ${vw}`).toBe(TOTAL_SESSIONS);
    const visible: number[] = [];
    for (let i = 0; i < total; i += 1) {
      if (await allSessions.nth(i).isVisible()) visible.push(i);
    }
    expect(
      visible.length,
      `exactly the open day's sessions are painted @ ${vw} (folded days contribute none)`,
    ).toBe(OPEN_ROW_SESSIONS);
    for (const i of visible) {
      const s = await rectOf(allSessions.nth(i));
      expect(s.width, `session ${i} width <= column @ ${vw}`).toBeLessThanOrEqual(col.width + TOL);
      expect(s.right, `session ${i} right within column @ ${vw}`).toBeLessThanOrEqual(
        col.right + TOL,
      );
      expect(s.left, `session ${i} left within column @ ${vw}`).toBeGreaterThanOrEqual(
        col.left - TOL,
      );
    }

    // The 90-char unbreakable title WRAPS rather than overflowing: its row is
    // taller than a normal single-line session, and it never exceeds the column.
    // Selected by ORDER within the open day, not by a `data-session-kind` attribute: that
    // attribute existed only in the hand-transcribed markup this harness used to serve. The
    // real component never emitted it, which is one more way the copy had drifted from the
    // thing it claimed to describe.
    const openDaySessions = page.locator(
      '[data-testid="agenda-day-0"] [data-testid="agenda-session"]',
    );
    const normal = await rectOf(openDaySessions.nth(0));
    const long = await rectOf(openDaySessions.nth(1));
    expect(long.width, `long-title session width <= column @ ${vw}`).toBeLessThanOrEqual(
      col.width + TOL,
    );
    expect(
      long.height,
      `long unbreakable title wrapped (long ${long.height} > normal ${normal.height}) @ ${vw}`,
    ).toBeGreaterThan(normal.height + 5);

    // Zero horizontal document overflow.
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(
      overflow.scrollW,
      `no horizontal document overflow @ ${vw} (scrollW ${overflow.scrollW} vs clientW ${overflow.clientW})`,
    ).toBeLessThanOrEqual(overflow.clientW + TOL);
  });
}

// ── The fold's own invariants (spec §5.1). These measure the REAL component, which is why
// the transcription had to go: every assertion below would have passed against a copy that
// no longer resembled the component.
for (const vw of VIEWPORTS) {
  test(`fold: rows fill the column and stay inside it @ ${vw}px (§5.1)`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: 900 });
    await page.goto(baseUrl);
    await page.waitForSelector('[data-testid="agenda-schedule"]');

    const parent = await page.locator('[data-testid="agenda-schedule"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      // CONTENT box: getBoundingClientRect alone is blind to padding.
      return (
        el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      );
    });

    const rows = page.locator("details[data-testid^='agenda-day-']");
    const n = await rows.count();
    expect(n, "every extraction day renders a row").toBe(TOTAL_DAYS);

    for (let i = 0; i < n; i += 1) {
      const w = await rows.nth(i).evaluate((el) => el.getBoundingClientRect().width);
      // `w-full` supplies this; `min-w-0` alone would let the flex item shrink to its summary.
      expect(w, `row ${i} fills the column content width @ ${vw}`).toBeGreaterThanOrEqual(
        parent - TOL,
      );
      expect(w, `row ${i} does not exceed the column @ ${vw}`).toBeLessThanOrEqual(parent + TOL);
    }
  });

  test(`fold: summary is a 44px tap target in BOTH states @ ${vw}px`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: 900 });
    await page.goto(baseUrl);
    await page.waitForSelector('[data-testid="agenda-schedule"]');

    // Row 0 is open (the viewer's), rows 1-2 are folded — so both states are measured. A
    // summary measured only while open misses where the width pressure actually is.
    for (const i of [0, 1]) {
      const h = await page
        .locator(`[data-testid="agenda-day-summary-${i}"]`)
        .evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `summary ${i} clears the 44px floor @ ${vw}`).toBeGreaterThanOrEqual(44 - TOL);
    }
  });

  test(`fold: the marker is VISIBLE, not merely present @ ${vw}px`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: 900 });
    await page.goto(baseUrl);
    await page.waitForSelector('[data-testid="agenda-schedule"]');

    // This is the assertion the jsdom suite cannot make: there, `hidden` on the marker leaves
    // every test green because no CSS is computed. A zero-width box fails here.
    const box = await page.locator('[data-testid="agenda-day-marker-0"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, display: getComputedStyle(el).display };
    });
    expect(box.display, `marker is not display:none @ ${vw}`).not.toBe("none");
    expect(box.w, `marker has a non-zero width @ ${vw}`).toBeGreaterThan(0);
    expect(box.h, `marker has a non-zero height @ ${vw}`).toBeGreaterThan(0);

    // And it is the one thing that must not be squeezed out: the LABEL absorbs the shortfall.
    const marked = await page
      .locator('[data-testid="agenda-day-summary-0"]')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(box.w, `marker fits inside its summary @ ${vw}`).toBeLessThan(marked);

    // COLLAPSED + MARKED is the higher-pressure state and was previously unmeasured (review R7,
    // LOW). Spec §587 requires the marker in BOTH states, and this is the harder one: the count
    // reappears when the row closes, so the summary carries day label + marker + count + chevron
    // on one line at 320px. Measuring only the open row let the tighter layout go unchecked.
    await page.locator('[data-testid="agenda-day-summary-0"]').click();
    await expect(page.locator('[data-testid="agenda-day-0"]')).not.toHaveAttribute("open", "");

    const collapsed = await page.locator('[data-testid="agenda-day-marker-0"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, right: r.right, display: getComputedStyle(el).display };
    });
    expect(collapsed.display, `marker survives collapse @ ${vw}`).not.toBe("none");
    expect(collapsed.w, `marker keeps a box when collapsed @ ${vw}`).toBeGreaterThan(0);
    expect(collapsed.h, `marker keeps height when collapsed @ ${vw}`).toBeGreaterThan(0);

    // The count is only present in this state, so containment must be re-checked with it there.
    const sumBox = await page
      .locator('[data-testid="agenda-day-summary-0"]')
      .evaluate((el) => el.getBoundingClientRect());
    expect(
      collapsed.right,
      `collapsed marker stays inside its summary @ ${vw} (marker ${collapsed.right} vs summary ${sumBox.right})`,
    ).toBeLessThanOrEqual(sumBox.right + 0.5);
    await expect(page.locator('[data-testid="agenda-day-count-0"]')).toBeVisible();
  });

  test(`fold: the native disclosure triangle is suppressed @ ${vw}px`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: 900 });
    await page.goto(baseUrl);
    await page.waitForSelector('[data-testid="agenda-schedule"]');

    // Its own assertion, not a rider on another behaviour: without the marker-hiding classes
    // the row ships two glyphs (the UA triangle plus the chevron) and no dimension assertion
    // would notice.
    const listStyle = await page
      .locator('[data-testid="agenda-day-summary-1"]')
      .evaluate((el) => getComputedStyle(el).listStyleType);
    expect(listStyle, `summary suppresses the UA marker @ ${vw}`).toBe("none");
  });
}

// ── T4: the chevron's rotation actually animates.
//
// Its own test rather than a rider on a dimension assertion, because a class that compiles to
// NOTHING looks identical to a deliberately-instant transition. That is not hypothetical here:
// a Tailwind `duration-fast` class emits no duration at all in this repo, since Tailwind v4
// resolves `duration-<name>` from `--transition-duration-<name>` and this project defines only
// `--duration-*`. The rule therefore has to be hand-written CSS consuming `var(--duration-fast)`.
test("chevron: rotation has a real transition-duration (§5.2)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(baseUrl);
  await page.waitForSelector('[data-testid="agenda-schedule"]');

  const chevron = page.locator("[data-agenda-day-chevron]").first();
  const style = await chevron.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { duration: cs.transitionDuration, property: cs.transitionProperty };
  });

  // Fails before the rule lands: with no transition the computed duration is "0s".
  expect(style.duration, "chevron has a non-zero transition-duration").not.toBe("0s");
  expect(style.property, "the transition targets transform").toMatch(/transform|all/);
});

test("chevron: reduced motion collapses a duration that is otherwise NON-zero (§5.2)", async ({
  browser,
}) => {
  // Both halves in one test on purpose. Asserting only "reduced motion gives 0s" passes
  // vacuously while no transition exists at all -- the expected value equals the default state,
  // so the assertion cannot fail for the reason it claims. Measured: that is exactly what the
  // first version of this test did before the CSS landed. The precondition below is what makes
  // the second assertion mean anything.
  const normal = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const normalPage = await normal.newPage();
  await normalPage.goto(baseUrl);
  await normalPage.waitForSelector('[data-testid="agenda-schedule"]');
  const moving = await normalPage
    .locator("[data-agenda-day-chevron]")
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(moving, "precondition: the chevron animates without the preference").not.toBe("0s");
  await normal.close();

  const reduced = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 900 },
  });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(baseUrl);
  await reducedPage.waitForSelector('[data-testid="agenda-schedule"]');
  const still = await reducedPage
    .locator("[data-agenda-day-chevron]")
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  // Free via the token rewrite at app/globals.css:419, but ONLY because the rule consumes
  // var(--duration-fast). A hardcoded duration would ignore the preference entirely.
  expect(still, "reduced motion zeroes the chevron duration").toBe("0s");
  await reduced.close();
});

test("fold: the session count is hidden on an OPEN row and survives toggling (§5.2)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(baseUrl);
  await page.waitForSelector('[data-testid="agenda-schedule"]');

  // Row 0 is the viewer's (open), row 1 is folded.
  await expect(page.locator('[data-testid="agenda-day-count-0"]')).toBeHidden();
  await expect(page.locator('[data-testid="agenda-day-count-1"]')).toBeVisible();

  // The live-state half, which is the actual defect: <details> toggles with no re-render, so a
  // prop-conditioned count would keep showing above sessions the crew member just opened.
  await page.locator('[data-testid="agenda-day-summary-1"]').click();
  await expect(page.locator('[data-testid="agenda-day-count-1"]')).toBeHidden();

  await page.locator('[data-testid="agenda-day-summary-0"]').click();
  await expect(page.locator('[data-testid="agenda-day-count-0"]')).toBeVisible();
});

test("chevron: the rotation actually changes between states (§5.2)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(baseUrl);
  await page.waitForSelector('[data-testid="agenda-schedule"]');

  // Whole-diff review, LOW: asserting a non-zero duration proves a transition EXISTS, not that
  // anything moves. Deleting the details[open] rotation selector left the suite green while the
  // chevron pointed the same way in both states.
  const chevronOf = (i: number) =>
    page
      .locator(`[data-testid="agenda-day-summary-${i}"] [data-agenda-day-chevron]`)
      .evaluate((el) => getComputedStyle(el).transform);

  const openRow = await chevronOf(0);
  const closedRow = await chevronOf(1);
  expect(closedRow, "a folded row's chevron is unrotated").toMatch(/none|matrix\(1, 0, 0, 1/);
  expect(openRow, "an open row's chevron is rotated").not.toBe(closedRow);
});

test("a11y: the disclosure keeps BOTH its expandable state and its heading", async ({ page }) => {
  // The real-browser accessibility proof spec §7 asked for and this suite did not have. Review
  // R4 (MEDIUM) was right that it was missing: the other assertions here measure geometry and
  // computed styles, and the jsdom test can only see that a `summary h3` node exists.
  //
  // Why it needs a browser. HTML's content model for <summary> is phrasing content OR a single
  // heading -- and this summary carries an <h3> alongside sibling spans and an SVG, which is
  // outside the model the spec assumed. Whether a browser still exposes the heading AND the
  // disclosure is therefore empirical. The impeccable audit's P1 was this exact class: the fold
  // silently dropped every day from the document outline while roles and geometry stayed green.
  // ENGINE COVERAGE: this runs Chromium only (standalone.config.ts defines one project), and
  // Safari is a crew target. Measured by hand during review R5 with a temporary Desktop Safari
  // project: green in 5.0s, config then reverted. A hand-run measurement is not coverage --
  // filed as BL-AGENDA-A11Y-WEBKIT-COVERAGE.
  await page.goto(baseUrl);

  // 0. The DISCLOSURE ROLE is exposed. Review R8 (MEDIUM) was right that this file asserted
  //    headings and then read `HTMLDetailsElement.open`, which is a DOM property, not the
  //    accessibility tree. Measured while fixing it, and recorded so nobody re-derives it:
  //      - native <details> maps to role=group (3 exposed here, one per day);
  //      - it sets NO `aria-expanded` attribute -- the attribute reads null;
  //      - Playwright REFUSES `getByRole("group", { expanded })`: "expanded is only supported
  //        for roles application, button, checkbox, columnheader, combobox, ...", and group is
  //        not among them.
  //    So the role is assertable here and the expanded STATE is not, which is why `.open`
  //    remains the state probe below. It is the observable the platform actually offers.
  await expect(page.getByRole("group")).toHaveCount(TOTAL_DAYS);

  // 1. The heading survives into the accessibility tree, at the right level, named by its day.
  const headings = page.getByRole("heading", { level: 3 });
  await expect(headings).toHaveCount(TOTAL_DAYS);
  await expect(headings.first()).toHaveAccessibleName("Tuesday, May 14, 2026");

  // 2. Disclosure state is REAL, not a static attribute: read the open state, toggle, re-read.
  //    A bare role assertion would pass on a summary that no longer toggles anything.
  const openState = () =>
    page.locator("details").evaluateAll((els) => els.map((e) => (e as HTMLDetailsElement).open));
  expect(await openState(), "only the viewer's row starts open").toEqual([true, false, false]);

  await page.getByTestId("agenda-day-summary-1").click();
  expect(await openState(), "clicking a folded summary expands exactly that row").toEqual([
    true,
    true,
    false,
  ]);

  // 3. The heading is still exposed after toggling -- catches a structure where the browser's
  //    own disclosure handling drops the nested heading once the row's state changes.
  await expect(page.getByRole("heading", { level: 3 }), "headings survive a toggle").toHaveCount(
    TOTAL_DAYS,
  );

  // 4. NO element in this summary can truncate, and that is asserted rather than assumed.
  //    Review R8 listed "marker clientWidth === scrollWidth" as a missing acceptance case. Two
  //    attempts at it were vacuous before the markup was read properly: the marker has no width
  //    clamp, and neither does the count, so a scrollWidth/clientWidth comparison on either can
  //    never fail. The ONLY clamped element (`max-w-[12ch] truncate`) is the date chip at
  //    AgendaScheduleBlock.tsx:122, and it renders behind `{day.date ? ... : null}` -- where
  //    `day.date` is ALWAYS null in production, the ratified fact this whole feature rests on
  //    (`lib/agenda/extractAgendaSchedule.ts` is its sole constructor and hardcodes null).
  //    So the acceptance case has no applicable element. Pinned by asserting the chip's absence,
  //    which fails if that branch ever becomes reachable and the case becomes real.
  await expect(page.locator(".truncate")).toHaveCount(0);

  // 5. The summary shows OUR focus ring on keyboard focus. Asserted on box-shadow specifically,
  //    not outline: `focus-visible:ring-2` renders as a box-shadow, while Chromium draws its own
  //    default outline on any focused element. An outline-based check therefore passes even with
  //    our ring deleted -- measured, not assumed; that is exactly what the first version did.
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el.tagName.toLowerCase() !== "summary")
      return { tag: el?.tagName ?? "none", shadow: "" };
    return { tag: "summary", shadow: getComputedStyle(el).boxShadow };
  });
  expect(ring.tag, "the first Tab lands on a summary").toBe("summary");
  expect(ring.shadow, `focused summary paints a ring box-shadow (got ${ring.shadow})`).not.toBe(
    "none",
  );

  // 6. The chevron is decorative and must not be announced. Note for anyone mutating this:
  //    deleting our explicit aria-hidden prop does NOT red this, because lucide sets
  //    aria-hidden="true" on its icons by default -- the mutation is behaviourally equivalent,
  //    not an uncovered assertion. What this DOES protect is the rendered outcome, so swapping
  //    in an icon that is not hidden by default fails here.
  await expect(page.locator("[data-agenda-day-chevron]").first()).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});
