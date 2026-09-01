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
let origin: string;

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
    .map(
      (pair, i) => `
  <div id="pair-${i}-on" data-testid="fc-pair-${i}-on" ${pair.stateAttribute ?? ""} class="${pair.a}">on</div>
  <div id="pair-${i}-off" data-testid="fc-pair-${i}-off" class="${pair.b}">off</div>`,
    )
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
  origin = `http://127.0.0.1:${address.port}`;
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
  test("AC-1: the share-link cue is visible while flashing and leaves no residue idle", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(origin);

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
    await page.goto(origin);
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
    await page.goto(origin);

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
    await page.goto(origin);

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
    await page.goto(origin);

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
      ] as const;
      const differs = surviving.some((key) => on[key] !== off[key]);
      if (!differs) identical.push(pair.site);
    }
    expect(
      identical,
      "a repaired state that still renders identically to its unselected twin",
    ).toEqual([]);
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
});
