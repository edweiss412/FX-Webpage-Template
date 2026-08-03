/**
 * Font binding — does the app actually RENDER the family it commits to?
 *
 * `DESIGN.md:133` commits the product to Inter, "single contemporary sans for
 * all UI", loaded via `next/font/google` in `app/layout.tsx`. `app/globals.css`
 * applies `font-family: var(--font-sans)` at `html`, and `--font-sans` names the
 * LITERAL family `"Inter"` first. Nothing in that chain proves a face called
 * Inter is actually available — a missing loader degrades silently to the next
 * entry in the stack, which is what `BL-HEADER-FONT-FALLBACK-WRAP` measured.
 *
 * THE ORACLE IS WIDTH, NOT `document.fonts.check()`. Measured 2026-08-03 on the
 * admin tree, where no Inter face is registered at all, `check('16px "Inter"')`
 * returned `true` — it answers "can this be handled", not "is this face here".
 * A test built on it passes on a tree with no font loaded, which is precisely
 * the state this file exists to catch. Comparing the width of text rendered
 * under the page's own cascade against the same text forced onto `"Inter"` and
 * onto `sans-serif` cannot be fooled that way: if the cascade resolves to a
 * system face, its metric differs from Inter's and the comparison fails.
 *
 * Spec: docs/superpowers/specs/2026-08-03-app-wide-font-binding.md
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";
import { signInAs } from "./helpers/signInAs";

/** The label `BL-HEADER-FONT-FALLBACK-WRAP` measured wrapping under a wide
 *  fallback. Reused here so the probe measures the product's own worst string,
 *  not a synthetic one. */
const PROBE_TEXT = "Wardrobe & key moments";

type FontReport = {
  inherited: number;
  forcedInter: number;
  forcedSansSerif: number;
  faces: { family: string; status: string }[];
  htmlFontFamily: string;
  fontInterToken: string;
};

/**
 * Build three probe spans, measure, remove — all inside ONE `page.evaluate`, so
 * nothing is left mounted for a later call to auto-wait on (detach safety).
 * The spans differ ONLY in `font-family`; every other property that can move a
 * text advance (size, weight, letter-spacing, wrapping) is pinned identically,
 * so a width difference can come from nothing but the resolved face.
 */
async function measureFonts(page: Page): Promise<FontReport> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((text: string) => {
    const measure = (fontFamily: string | null): number => {
      const el = document.createElement("span");
      el.textContent = text;
      el.style.cssText =
        "position:absolute;left:-9999px;top:0;white-space:nowrap;" +
        "font-size:16px;font-weight:400;letter-spacing:normal;";
      if (fontFamily !== null) el.style.fontFamily = fontFamily;
      document.body.appendChild(el);
      const width = el.getBoundingClientRect().width;
      el.remove();
      return Math.round(width * 100) / 100;
    };
    return {
      // `null` = inherit the page's real cascade. This is the value under test.
      inherited: measure(null),
      forcedInter: measure('"Inter"'),
      forcedSansSerif: measure("sans-serif"),
      faces: Array.from(document.fonts).map((f) => ({ family: f.family, status: f.status })),
      htmlFontFamily: getComputedStyle(document.documentElement).fontFamily,
      // The `--font-inter` token the loader is asked to expose. Read at
      // `<html>`, which is where the generated `.variable` class is applied.
      fontInterToken: getComputedStyle(document.documentElement)
        .getPropertyValue("--font-inter")
        .trim(),
    };
  }, PROBE_TEXT);
}

function assertRendersInter(report: FontReport, surface: string): void {
  // (0) NON-VACUITY, asserted BEFORE anything reads as a pass. If the host
  //     resolved `"Inter"` and `sans-serif` to the same face, every comparison
  //     below is satisfiable by a tree with no font loaded at all. Fail loudly
  //     rather than green-wash.
  expect(
    Math.abs(report.forcedInter - report.forcedSansSerif),
    `${surface}: the probe can tell Inter from the generic sans (forcedInter=` +
      `${report.forcedInter}, forcedSansSerif=${report.forcedSansSerif}) — ` +
      `equal widths mean the measurement proves nothing`,
  ).toBeGreaterThan(1);

  // (1) THE RED ASSERTION. The cascade resolves to the same face as an explicit
  //     `"Inter"`. Fails today on the admin tree (measured: inherited 185.53 vs
  //     forcedInter 167.14, an 18.39px gap, because no Inter face exists there
  //     and the forced value falls back to the default serif metric).
  expect(
    Math.abs(report.inherited - report.forcedInter),
    `${surface}: rendered text matches Inter's metric (inherited=${report.inherited}, ` +
      `forcedInter=${report.forcedInter}, html font-family=${report.htmlFontFamily})`,
  ).toBeLessThan(0.5);

  // (2) And is NOT the generic fallback. Assertion (1) alone would also pass on
  //     a host that happens to ship Inter as a SYSTEM font while the app loads
  //     nothing — a green read that would not reproduce for any other user.
  expect(
    Math.abs(report.inherited - report.forcedSansSerif),
    `${surface}: rendered text is NOT the generic sans fallback ` +
      `(inherited=${report.inherited}, forcedSansSerif=${report.forcedSansSerif})`,
  ).toBeGreaterThan(1);

  // (3) The face is actually LOADED by the document, not merely resolvable from
  //     the host. This is what catches a future Next release reverting to
  //     hashed `@font-face` family names: the width checks would still pass on a
  //     developer machine with Inter installed, this one would not.
  const loadedInter = report.faces.filter((f) => f.family === "Inter" && f.status === "loaded");
  expect(
    loadedInter.length,
    `${surface}: the document loaded an Inter face (registered families: ` +
      `${report.faces.map((f) => `${f.family}:${f.status}`).join(", ") || "none"})`,
  ).toBeGreaterThanOrEqual(1);
}

/**
 * `--font-inter` is the token `app/layout.tsx` asks the loader to expose. It is
 * NOT what binds the font — the loaded stylesheet registers the literal family
 * `Inter`, and `app/globals.css:103-104` names that literal in `--font-sans`,
 * so binding happens with or without this token. Asserted separately for that
 * reason: without it, a loader that silently stopped emitting `variable:` would
 * still pass every width check while the documented token vanished.
 */
function assertExposesFontInterToken(report: FontReport, surface: string): void {
  expect(
    report.fontInterToken,
    `${surface}: <html> exposes --font-inter (the loader's \`variable\` option)`,
  ).toContain("Inter");
}

test.describe("font binding", () => {
  // Every route below is asserted to return 200 AND to be the page it claims.
  // A route that quietly 404s still renders the ROOT layout, so a font probe on
  // the not-found shell reads as a plausible pass for a surface that was never
  // visited — measured 2026-08-03, when `/sign-in` (which does not exist; the
  // real route is `/auth/sign-in`) returned a 404 shell to exactly this test.

  test("the admin tree renders Inter", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const res = await page.goto("/admin", { waitUntil: "load" });
    expect(res?.status(), "/admin renders for an admin").toBe(200);
    // Page identity by a testid OWNED BY the layout under test, not a generic
    // element. `admin-layout` is rendered by `app/admin/layout.tsx:157`/`:179`,
    // so this cannot be satisfied by a 200 from some other shell — which is the
    // exact class that made an earlier draft measure a 404 page.
    await expect(page.getByTestId("admin-layout")).toBeVisible();
    // And NOT the layout's infra-error branch (`app/admin/layout.tsx:92`),
    // which renders admin chrome without the page it claims to be measuring.
    await expect(page.getByTestId("admin-layout-infra-error")).toHaveCount(0);
    const report = await measureFonts(page);
    assertRendersInter(report, "admin (/admin)");
    assertExposesFontInterToken(report, "admin (/admin)");
  });

  test("the public auth tree renders Inter", async ({ page }) => {
    const res = await page.goto("/auth/sign-in", { waitUntil: "load" });
    expect(res?.status(), "/auth/sign-in renders").toBe(200);
    // Identity by a testid owned by this page (`tests/e2e/sign-in-page.spec.ts:74`
    // pins the same one), so a 200 from a different shell cannot satisfy it.
    await expect(page.getByTestId("sign-in-page")).toBeVisible();
    const report = await measureFonts(page);
    assertRendersInter(report, "auth (/auth/sign-in)");
    assertExposesFontInterToken(report, "auth (/auth/sign-in)");
  });

  test("the crew tree renders Inter", async ({ page }) => {
    const seeded = await seedShowWithCrew();
    try {
      const res = await page.goto(`/show/${seeded.slug}/${seeded.shareToken}`, {
        waitUntil: "load",
      });
      expect(res?.status(), "crew route renders").toBe(200);
      await expect(page.getByTestId("page-shell")).toBeVisible();
      const report = await measureFonts(page);
      assertRendersInter(report, "crew (/show/[slug]/[shareToken])");
      assertExposesFontInterToken(report, "crew (/show/[slug]/[shareToken])");
    } finally {
      // Teardown: the seeded show carries a random drive_file_id, so without
      // this every run leaves a row behind.
      await deleteSeededShow(seeded.driveFileId);
    }
  });
});
