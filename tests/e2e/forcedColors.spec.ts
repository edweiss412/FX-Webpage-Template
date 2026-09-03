/**
 * Forced-colors acceptance. Spec
 * `docs/superpowers/specs/2026-09-01-forced-colors-pass.md`, plan Task 3 onward.
 *
 * WHY A BROWSER AND NOT A SCANNER. The two scanner arms answer "which affordances
 * state themselves only in properties forced colors flattens", which is a question
 * about the source and is correctly answered from it. Whether a REPAIR works is a
 * question about rendered output, and only a browser answers that. Plan review R1
 * found the earlier design gating the repairs on the scanner, which cannot see
 * them: a repair adds unlayered selectors to `app/globals.css` and changes no
 * element's class list, so the scanner's answer is identical before and after.
 *
 * WHAT IS AND IS NOT SYNTHETIC HERE. The cues are pure CSS keyed on a data
 * attribute, so the page below carries the SHIPPED attribute against the LIVE
 * compiled stylesheet — the selector under test is the one that ships, which is
 * the probe-domain rule this arc applies to its own probes. The element wearing
 * the attribute contributes nothing to the cue. A separate case pins that the
 * component still emits that attribute, so the two cannot drift apart.
 *
 * READINESS AND SAMPLING. The cues are timer-gated and one of them remounts, so an
 * assertion sampling at the wrong moment is flaky in both directions. Every case
 * below reads computed style through `expect.poll` rather than a single frame, and
 * resolves its handle after any attribute change rather than holding one across it.
 */
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "./helpers/fontFidelityFixture";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import { compileEntryCss } from "./helpers/liveEntryToolchain";
import type { RepairPair } from "./_forcedColorsPairsHarness";
import { COLLAPSE_CENSUS } from "../styles/forcedColorsCensus";

const REPO_ROOT = join(__dirname, "..", "..");

/**
 * The shipped attributes, spelled here so a rename in the component or the
 * stylesheet fails this spec rather than silently passing against a stale name.
 */
const SHARE_LINK_FLASH_ATTR = "data-share-link-flash";
const STEP3_FLASH_ATTR = "data-step3-warning-flash";
const FRESHNESS_FLASH_ATTR = "data-section-freshness-flash";

let workDir: string;
let server: Server;
// Named `baseUrl` rather than `origin`, which is what it was called first. The
// modal-wait census recognises a standalone harness navigation by the identifier
// it navigates to (`tests/ci/modalWaitHelper/disposition.ts:304`), and this file
// is exactly the class that rule already describes: a mkdtemp workdir served over
// node:http, never the /admin loader. Adopting the house name puts these
// navigations in the existing exclusion instead of teaching the recogniser a
// ninth spelling of the same idea.
let baseUrl: string;

let repairPairs: RepairPair[] = [];

/**
 * One row per repaired site: the two colliding class strings, the first carrying
 * the state markers the repair keys on and the second carrying none. If the block
 * paints the selected state, the two differ in a surviving property; if it does
 * not, they are identical, which is the collapse.
 */
function pairsMarkup(): string {
  // The "on" element carries ONLY the marker its component actually sets, derived
  // by the harness from the source. A first version stamped aria-current and
  // aria-pressed on every one, which made this case pass for the six sites whose
  // components set no marker at all: the fixture was testing the fixture.
  return repairPairs
    .map((pair, i) => {
      // The element's own tag, because the selected-state rule is scoped to
      // interactive elements. A page of <div>s matches none of it, and AC-4 then
      // fails for a reason unrelated to the repair. A capitalised tag is a
      // component the scanner could not resolve to an intrinsic; those render as
      // <span>, which is what a painted child usually is.
      // `Link` is Next's router component and renders an <a>; mapping it to a
      // <span> would put it outside the interactive scope the repair requires,
      // which is the same mistake as rendering everything as a <div>.
      const tag = pair.tag === "Link" ? "a" : /^[a-z]+$/.test(pair.tag) ? pair.tag : "span";
      return `
  <${tag} id="pair-${i}-on" data-testid="fc-pair-${i}-on" ${pair.stateAttribute ?? ""} class="${pair.a}">on</${tag}>
  <${tag} id="pair-${i}-off" data-testid="fc-pair-${i}-off" class="${pair.b}">off</${tag}>`;
    })
    .join("");
}

function harnessHtml(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="/out.css"></head>
<body>
  <div id="share-idle" data-testid="fc-share-idle">share, idle</div>
  <div id="share-flash" ${SHARE_LINK_FLASH_ATTR} data-testid="fc-share-flash">share, flashing</div>
  <div id="step3-idle" data-testid="fc-step3-idle">step3, idle</div>
  <div id="step3-flash" ${STEP3_FLASH_ATTR} data-testid="fc-step3-flash">step3, flashing</div>
  <div id="fresh-idle" data-testid="fc-fresh-idle">freshness, idle</div>
  <div id="fresh-flash" ${FRESHNESS_FLASH_ATTR}="1" data-testid="fc-fresh-flash">freshness, flashing</div>
  <button data-testid="fc-focus-idiom" class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface">focus me</button>
  <progress data-testid="wizard-step2-progressbar" style="width:200px;height:16px;display:block"></progress>
  ${pairsMarkup()}
</body></html>`;
}

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "forced-colors-"));

  // Arm 1 runs OUTSIDE the Playwright worker: it parses the TSX corpus with the
  // TypeScript compiler and loads Tailwind's design system, and the step-3 layout
  // spec uses the same subprocess shape for the same reason.
  const pairsJson = join(workDir, "pairs.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_forcedColorsPairsHarness.ts"), pairsJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 300_000 },
  );
  repairPairs = (JSON.parse(readFileSync(pairsJson, "utf8")) as { pairs: RepairPair[] }).pairs;

  writeFileSync(join(workDir, "harness.html"), harnessHtml());

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);
  compileEntryCss({ entryCss, outFile: join(workDir, "out.css") });

  const html = readFileSync(join(workDir, "harness.html"), "utf8");
  const css = readFileSync(join(workDir, "out.css"), "utf8");
  server = createServer((req, res) => {
    if (req.url === "/out.css") {
      res.writeHead(200, { "content-type": "text/css" });
      res.end(css);
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no server address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** The visual carriers forced colors leaves under author control. */
async function paint(page: import("@playwright/test").Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      // Style, not the shorthand: `outline-width` computes to the UA's 3px even
      // when the style is `none`, so a width comparison reports a cue that is not
      // painted. Caught by this spec's own idle assertion on its first green run.
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor,
      // Borders too. A first version of AC-4 compared outline properties only,
      // and the undo button's repair is a BORDER colour, so a correct repair read
      // as no repair at all. The comparison must range over every property forced
      // colors leaves author-visible, not over the one the first repair happened
      // to use.
      borderTopColor: s.borderTopColor,
      borderTopStyle: s.borderTopStyle,
      borderTopWidth: s.borderTopWidth,
      borderBottomColor: s.borderBottomColor,
      borderBottomStyle: s.borderBottomStyle,
      borderBottomWidth: s.borderBottomWidth,
      boxShadow: s.boxShadow,
      background: s.backgroundColor,
      // The selected repair sets `color: HighlightText` alongside the fill, and it
      // went unread until the compiler pointed out that the comparison listed a
      // property the reader never returned. Half the pair was unmeasured.
      color: s.color,
    };
  });
}

/**
 * A data-driven case over an empty set passes while asserting nothing, so the row
 * count is a premise rather than an incidental.
 *
 * DERIVED from the census, not a literal. A first version required more than ten
 * pairs, which was the repair count at the moment it was written; re-dispositioning
 * four rows during this task took the set to exactly ten and the premise failed for
 * a reason that had nothing to do with the guard's subject. The census is the
 * authority on how many repairs there are, so it is the authority here too.
 */
function premiseRows(count: number): void {
  const expected = COLLAPSE_CENSUS.filter((row) => row.disposition === "repaired").length;
  expect(expected, "the census records no repairs at all").toBeGreaterThan(0);
  expect(count, "the harness emitted a pair for fewer sites than the census calls repaired").toBe(
    expected,
  );
}

test.describe("forced colors", () => {
  // Every case in this file measures what forced colors DOES to a render, so
  // every one of them is meaningless in an engine that does not implement the
  // feature. WebKit is that engine (spec §8 limit 11), which is why `testMatch`
  // collects this file under desktop-chromium ONLY (spec §5.8). The gate below is
  // a backstop for a future WebKit or a project added without reading that section,
  // not the mechanism.
  //
  // Whole-diff R2's board caught the consequence on AC-6, which asserts the
  // focus ring is DROPPED: WebKit keeps painting it, so the assertion failed
  // there and nowhere else. The narrow read is that AC-6 is engine-specific.
  // The real defect is one altitude up and quieter: the other nine cases
  // compare a selected render against an unselected one, and those differ in
  // NORMAL mode too, by design. They were passing on mobile-safari for a
  // reason that has nothing to do with what they claim to measure — green,
  // and proving nothing.
  //
  // Detected rather than listed by browser name: the question is whether the
  // emulation took effect, and asking the engine is the answer that stays
  // correct when WebKit ships the feature.
  test.beforeEach(async ({ page }) => {
    // Asks the engine what it DOES, not what it SAYS. The first version of this
    // gate read `matchMedia("(forced-colors: active)").matches`, and WebKit answers
    // true: the emulation sets the media query and then does not perform the
    // forced-colors adjustment. AC-6 went on failing there, which is how the wrong
    // predicate announced itself. Dropping `box-shadow` is the adjustment every
    // case in this file depends on, so that is the thing to measure.
    await page.emulateMedia({ forcedColors: "active" });
    const adjusts = await page.evaluate(() => {
      const el = document.createElement("div");
      el.style.boxShadow = "0 0 0 2px rgb(255, 0, 0)";
      document.body.appendChild(el);
      const dropped = getComputedStyle(el).boxShadow === "none";
      el.remove();
      return dropped;
    });

    // Hand the state back exactly as it was found. A gate that leaves forced colors
    // ON is not a gate, it is a fixture, and it broke AC-5 the moment it landed:
    // that case screenshots a NORMAL baseline before emulating, so both of its
    // shots came back forced, compared equal, and it failed on both projects while
    // asserting something that was still perfectly true. Every case below sets its
    // own media state, and it should be the only thing that does.
    await page.emulateMedia({ forcedColors: "none" });
    test.skip(
      !adjusts,
      "this engine reports the forced-colors media query but does not perform the adjustment, so every assertion here would pass or fail for an unrelated reason (spec §8 limit 11)",
    );
  });

  test("AC-1: the share-link cue is visible while flashing and leaves no residue idle", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(baseUrl);

    // The cue's whole job. Before the repair this reads `none` for both legs: the
    // ring is a box-shadow, which a UA drops, and both background endpoints force
    // to one value.
    await expect
      .poll(async () => (await paint(page, "fc-share-flash")).outlineStyle)
      .not.toBe("none");

    // And the idle half, which is the one an earlier draft of the spec got exactly
    // backwards for a different cue: a repair that leaves a permanent outline is
    // the defect this pass exists to remove, not a fix for it.
    const idle = await paint(page, "fc-share-idle");
    expect(idle.outlineStyle, "an idle row must carry no cue").toBe("none");
  });

  test("AC-2: the step-3 warning cue is visible, animated and reduced-motion alike", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(baseUrl);
    await expect
      .poll(async () => (await paint(page, "fc-step3-flash")).outlineStyle)
      .not.toBe("none");
    expect((await paint(page, "fc-step3-idle")).outlineStyle).toBe("none");

    // The reduced-motion half is not a duplicate. This cue marks a jump target the
    // user must LOCATE, so unlike the share-link cue its reduced-motion fallback is
    // a steady tint rather than nothing (app/globals.css:1121-1128). That tint is a
    // background, so it flattens too, and the fallback needs its own carrier.
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.reload();
    await expect
      .poll(async () => (await paint(page, "fc-step3-flash")).outlineStyle)
      .not.toBe("none");
  });

  test("AC-3: a freshness card shows a cue only while its gating attribute is present", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(baseUrl);

    // BOTH halves, because the spec's first draft got the idle one exactly
    // backwards: it claimed a permanent phantom outline on every freshness-capable
    // card and specified a repair that would have suppressed the working cue. The
    // attribute is spread conditionally by both emitters, so with no attribute
    // there is no rule and nothing to be permanent.
    expect(
      (await paint(page, "fc-fresh-idle")).outlineStyle,
      "an idle card must carry no outline; the first spec draft asserted the opposite",
    ).toBe("none");
    await expect
      .poll(async () => (await paint(page, "fc-fresh-flash")).outlineStyle)
      .not.toBe("none");
  });

  test("AC-4d: forced colors AND reduced motion, where the two cues differ", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.goto(baseUrl);

    // Asserted separately, because the transition table's first draft said both
    // cues show nothing here and that is true of only one of them.
    //
    // share-link: NO cue. Its reduced-motion arm sets `animation: none` because a
    // one-shot signal has no correct steady state, and the block must name that off
    // state — otherwise the base outline forces opaque and a reduced-motion user
    // gets a PERMANENT ring, which is the phantom this pass exists to remove,
    // reintroduced by the pass.
    expect(
      (await paint(page, "fc-share-flash")).outlineStyle,
      "a reduced-motion user must not get a permanent ring from the forced-colors base",
    ).toBe("none");

    // freshness: a cue DOES appear, and that is documented rather than repaired.
    // Its reduced-motion arm sets `outline-color: transparent`, which forces
    // opaque. Suppressing it for reduced-motion alone would be the inconsistent
    // branch once the fade is gone for every user (spec §8 limit 8).
    await expect
      .poll(async () => (await paint(page, "fc-fresh-flash")).outlineStyle)
      .not.toBe("none");
  });

  test("AC-4: every repaired state is distinguishable from its unselected twin", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(baseUrl);

    // Data-driven over the census's repair rows rather than over the spec's five
    // worked examples, which left twenty unasserted in an earlier draft. The class
    // strings are DERIVED by Arm 1 from the live components, so a component edit
    // moves them and the census assertion in the scanner suite moves with it.
    premiseRows(repairPairs.length);

    const identical: string[] = [];
    for (const [i, pair] of repairPairs.entries()) {
      const on = await paint(page, `fc-pair-${i}-on`);
      const off = await paint(page, `fc-pair-${i}-off`);
      // Every property the M-table says forced colors leaves under author control.
      // `background` and `boxShadow` are deliberately NOT here: both are forced or
      // dropped, so a difference in them is not a difference the user sees.
      const surviving = [
        "outlineStyle",
        "outlineWidth",
        "outlineColor",
        "borderTopColor",
        "borderTopStyle",
        "borderTopWidth",
        "borderBottomColor",
        "borderBottomStyle",
        "borderBottomWidth",
        // The selected repair is a FILL, so background and colour belong here even
        // though the M-table calls them forced. Forced is not the same as
        // author-invisible: an authored brand colour is replaced, but `Highlight`
        // and `HighlightText` are palette slots the author CHOSE, and choosing one
        // is what makes the two states differ.
        "background",
        "color",
      ] as const;
      const differs = surviving.some((key) => on[key] !== off[key]);
      if (!differs) identical.push(pair.site);
    }
    expect(
      identical,
      "a repaired state that still renders identically to its unselected twin",
    ).toEqual([]);
  });

  test("AC-5 (Blink half): the indeterminate bar is not invisible under forced colors", async ({
    page,
  }) => {
    const bar = page.getByTestId("wizard-step2-progressbar");

    // Stated rather than inherited. This is the one case whose baseline is the
    // UNFORCED render, so it says so: relying on the surrounding state to be off
    // is what let the engine gate silently turn both of its screenshots into the
    // same picture.
    await page.emulateMedia({ forcedColors: "none" });
    await page.goto(baseUrl);
    await expect(bar).toBeVisible();
    const normal = await bar.screenshot();

    await page.emulateMedia({ forcedColors: "active" });
    const forced = await bar.screenshot();

    // What this asserts, and what it deliberately does NOT.
    //
    // MEASURED, and it changed this case: under forced colors Chromium paints
    // <progress> entirely from the UA and ignores author pseudo-element styling
    // altogether. Deleting the -webkit-progress-bar background, the
    // -webkit-progress-value background, or both, leaves the render byte-identical
    // at 370 bytes. So the fill-only negative control the plan specified cannot
    // discriminate here — not because the control is weak, but because there is
    // nothing author-side to delete that Blink was using.
    //
    // The user-facing property still holds and is what this asserts: the bar
    // renders, and it renders DIFFERENTLY under forced colors, which is the UA
    // repainting it in the palette rather than leaving an empty track. The author
    // repair is asserted where it actually takes effect, in the mechanism probe's
    // Gecko arm.
    expect(
      Buffer.compare(normal, forced),
      "the bar renders identically in both modes, so nothing repainted it",
    ).not.toBe(0);
  });

  test("AC-6: keyboard focus survives forced colors, and would not if it were layered", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(baseUrl);
    const button = page.getByTestId("fc-focus-idiom");
    await button.focus();

    // A pin, not a repair. app/globals.css:899 already works, and the point is that
    // it keeps working: this pass nearly opened with a headline that ~253 focus
    // indicators die here, which the compiled CSS supports (Tailwind v4's
    // .outline-none emits outline-style:none, .ring-2 is pure box-shadow) and the
    // browser refutes. That rule is unlayered, so outline-none cannot suppress it,
    // and it paints an OUTLINE, which forced colors keeps.
    const focused = await paint(page, "fc-focus-idiom");
    expect(focused.outlineStyle, "the focus indicator vanished under forced colors").not.toBe(
      "none",
    );
    // The ring is genuinely dropped, which is the half that IS true and the reason
    // the outline is doing the work.
    expect(focused.boxShadow, "box-shadow survived, so this measures the wrong thing").toBe("none");
  });

  test("layout neutrality: no repair changes the size of what it repairs", async ({ page }) => {
    await page.goto(baseUrl);
    const ids = [
      "fc-share-flash",
      "fc-step3-flash",
      "fc-fresh-flash",
      "fc-focus-idiom",
      ...repairPairs.map((_, i) => `fc-pair-${i}-on`),
    ];
    const before = await Promise.all(ids.map((id) => page.getByTestId(id).boundingBox()));

    await page.emulateMedia({ forcedColors: "active" });
    const after = await Promise.all(ids.map((id) => page.getByTestId(id).boundingBox()));

    // Spec §5.7. Of the properties this pass adds, only `border-style` can change
    // layout: switching a side from none to solid adds its width to the border box.
    // Everything else is outline, which draws OUTSIDE the box and takes no space,
    // or a colour. The repair that would break this is the natural one — reaching
    // for `border` instead of `outline`, because border is the more familiar
    // property — which is why this is asserted rather than assumed.
    const moved: string[] = [];
    ids.forEach((id, i) => {
      // `noUncheckedIndexedAccess`: an index into a parallel array is not proven
      // in range, and a missing box is a real outcome (a detached element) rather
      // than an impossible one, so it is reported rather than asserted away.
      const a = before[i];
      const b = after[i];
      if (a === null || a === undefined || b === null || b === undefined) {
        moved.push(`${id} has no box`);
        return;
      }
      if (Math.abs(a.width - b.width) > 0.5 || Math.abs(a.height - b.height) > 0.5) {
        moved.push(`${id} ${a.width}x${a.height} -> ${b.width}x${b.height}`);
      }
    });
    expect(moved, "a forced-colors repair resized the element it repairs").toEqual([]);
  });

  test("the component still emits the attribute the stylesheet keys on", () => {
    // The page above is synthetic in exactly one respect: it wears the attribute
    // rather than rendering ShareHub. This is what stops that becoming a fixture
    // testing itself — a rename in either place fails here.
    const shareHub = readFileSync(
      join(REPO_ROOT, "components", "admin", "showpage", "ShareHub.tsx"),
      "utf8",
    );
    expect(shareHub).toContain(`"${SHARE_LINK_FLASH_ATTR}"`);
    const css = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
    expect(css).toContain(`[${SHARE_LINK_FLASH_ATTR}]`);
  });

  // The one case in this file that navigates to a real route. Every other case
  // renders a derived class string against the live compiled stylesheet, which
  // pins the RULE and says nothing about whether any component reaches it. Whole-
  // diff R2 was right that this is the gap, and right that the blocker the spec
  // claimed for it did not exist: `/admin` already answers 200 in this suite
  // (`admin-phase2-surfaces.spec.ts:122`), under the same baseURL and the same two
  // projects this file runs in.
  //
  // `/admin` is behind auth, and a first attempt at this case learned that the
  // hard way: `page.goto("/admin")` answers 200 at the SIGN-IN page, so a naive
  // version would have measured a page with no nav on it. `signInAs` is the same
  // step every admin spec here takes (`admin-phase2-surfaces.spec.ts:83`).
  //
  // It binds ONE row, not one per project. AdminNav renders a different control
  // per viewport — the top row at `AdminNav.tsx:236` is `hidden min-[840px]:flex`,
  // the bottom tabs at `AdminNav.tsx:301` are its counterpart below 840px — and
  // this file is collected under desktop-chromium only, so the top row is the one
  // that renders here and the only one this case can bind. Both set
  // `aria-current="page"`, which is what the selected-state rule selects on; the
  // mobile row stays `bound: false` for want of an engine, not for want of a case.
  //
  // What makes it discriminating rather than a smoke test: forced colors is what
  // COLLAPSES these two elements together. The UA forces both backgrounds onto one
  // system value, so without the repair the active and inactive tabs paint
  // identically and a sighted high-contrast user loses which page they are on.
  // Comparing active against a real inactive sibling fails on the unrepaired
  // stylesheet and passes only because the block names a surviving carrier.
  test("AC-4e: a live admin nav keeps its selected state under forced colors", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin");
    expect(response?.status(), "/admin did not render, so this case pins nothing").toBe(200);

    const active = page.locator('nav a[aria-current="page"]:visible').first();
    await expect(
      active,
      "no visible nav link is aria-current, so this is not an authenticated admin page",
    ).toBeVisible();

    const inactive = page.locator('nav a[href]:not([aria-current="page"]):visible').first();
    await expect(
      inactive,
      "no inactive sibling is visible, so nothing discriminates the selected one",
    ).toBeVisible();

    const paintOf = (l: typeof active) =>
      l.evaluate((el) => {
        const c = getComputedStyle(el);
        return { bg: c.backgroundColor, fg: c.color };
      });
    const on = await paintOf(active);
    const off = await paintOf(inactive);

    // The collapse this pass exists to repair, stated as the assertion: equal here
    // means the selected tab is indistinguishable from an unselected one.
    expect(
      on.bg,
      "the selected nav item paints the same background as an unselected one, which is the collapse",
    ).not.toBe(off.bg);
    expect(on.bg, "the selected background is transparent, so nothing carries the state").not.toBe(
      "rgba(0, 0, 0, 0)",
    );
  });
});
