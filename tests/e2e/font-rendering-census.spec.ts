// The runtime half: every surface in the driven set renders the family the
// MANIFEST expects for it.
//
// SCOPE IS RATIFIED AND DELIBERATE (spec §4.0 SCOPE DECISION, user-ratified
// 2026-08-04). The static guard and the harness guard are exhaustive over their
// surface and validated by mutation; the waits are mechanical and complete.
// Together those close the reported defect. THIS spec ships as a defined SAMPLE
// over an enumerated driven set, not as a completeness pursuit -- the Kind B
// frontier (a route-local override, a runtime-registered face, a state no
// navigation reaches) does not terminate by enumeration, and rounds 15 through
// 29 established that each new axis costs a review round while the actual
// reported problem stays solved by the static half.
//
// WHAT THAT MEANS CONCRETELY: everything on the driven set below is measured,
// and every reachable surface left off it is a NAMED documented limit rather
// than an unexamined gap.
//
// THE EXPECTED FAMILY COMES FROM A COMMITTED MANIFEST, never from the
// rendering. Classifying each element by the family its cascade selects is
// circular -- the oracle would derive its expectation from the thing it
// validates -- and both directions escape: delete `font-mono` from a
// deliberately monospace heading and it is classified sans and passes the Inter
// check; add `font-mono` to a deliberately sans heading and it receives no
// Inter check at all. Membership is the expectation; the rendering is the thing
// under test.
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { collectFontFindings } from "./helpers/censusWalk";
import { expect, test } from "./helpers/fontFidelityFixture";
import { CANNOT_HOST_PROBE, CHECKED_PSEUDOS } from "./helpers/fontOracle";
import { entriesForRoute, isExpectedMono } from "./helpers/monoSurfaces";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

/**
 * NAVIGATE RELATIVELY, through the project's own `baseURL`.
 *
 * An earlier version built an absolute `http://127.0.0.1:${E2E_PORT}` and passed
 * it to `signInAs` as `baseUrl`. That looked like an improvement -- it followed
 * the config's sibling-worktree escape hatch instead of hardcoding 3000 -- and
 * it broke authentication on CI in a way no local run could show: the project's
 * `baseURL` is `http://localhost:${E2E_PORT}` (`playwright.config.ts:44`), so
 * the session cookie was set on `127.0.0.1` and every navigation went to
 * `localhost`. Different host, no cookie, every admin and help route redirected
 * to /auth/sign-in. 27 routes x 2 viewports failed for one wrong hostname.
 *
 * `tests/e2e/font-binding.spec.ts:355` is the pattern that works in this same
 * job: `signInAs(page, ADMIN_FIXTURE)` with no baseUrl, then relative
 * `page.goto("/admin")`. Playwright resolves both against the project baseURL,
 * so the escape hatch still applies and the hosts cannot diverge.
 */
const APP_DIR = resolve(__dirname, "..", "..", "app");

/**
 * Page surfaces, DERIVED FROM THE FRAMEWORK'S OWN CONFIG.
 *
 * `next.config.ts` registers `pageExtensions: ["ts", "tsx", "mdx"]` — THREE, not
 * two — so the census is every page under `app/` across all of them. Deriving
 * it from that array rather than a literal extension list is what makes a
 * future `page.ts` join automatically. An earlier formulation said "every
 * page.tsx" and thereby gained 15 non-help pages while silently dropping the 13
 * `page.mdx` help routes a previous census had covered: a regression introduced
 * BY a repair, which is why this reads the config.
 */
function routeCensus(): string[] {
  const extensions = ["ts", "tsx", "mdx"];
  const routes: string[] = [];
  const walk = (dir: string, url: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // Route groups `(name)` and private folders `_name` do not segment the URL.
        if (entry.startsWith("_")) continue;
        const segment = entry.startsWith("(") ? "" : `/${entry}`;
        walk(full, `${url}${segment}`);
      } else if (extensions.some((ext) => entry === `page.${ext}`)) {
        routes.push(url === "" ? "/" : url);
      }
    }
  };
  walk(APP_DIR, "");
  return routes.sort();
}

/**
 * Routes needing params or seeded fixtures.
 *
 * Listed with a reason rather than silently skipped, so the exclusion is
 * visible: an unreachable surface is a documentation fact, an unexamined one is
 * a defect.
 */
const PARAMETERISED = new Map<string, string>([
  ["/admin/show/[slug]", "needs a seeded show slug"],
  ["/admin/show/[slug]/preview/[crewId]", "needs a seeded show and crew member"],
  ["/admin/show/staged/[stagedId]", "needs a staged ingestion"],
  [
    "/admin/wizard/preview/[stagedId]",
    "needs a staged ingestion whose parse_result carries a roster",
  ],
  ["/show/[slug]/[shareToken]", "needs a published show and its share token"],
  ["/show/[slug]/unpublish", "needs a published show"],
]);

/**
 * Reachable in production, NOT reachable in this job. Named with a reason each,
 * so the exclusion is visible rather than silent -- an unreachable surface is a
 * documentation fact, an unexamined one is a defect.
 */
const UNREACHABLE_HERE = new Map<string, string>([
  [
    "/auth/sign-in",
    "the census signs in as an admin before measuring, and an authenticated " +
      "visit to the sign-in page redirects away by design. font-binding.spec.ts " +
      "covers this surface from a SIGNED-OUT context, which is the only state " +
      "where it renders at all.",
  ],
  [
    "/admin/dev",
    "gated on the ADMIN_DEV_PANEL_ENABLED build flag; this job builds without " +
      "it, so the route 404s. The dedicated dev-build / prod-build projects in " +
      "playwright.config.ts exist to exercise exactly that gate.",
  ],
]);

/** `/admin/dev/*` inherits the same build gate as its parent. */
const isBuildGated = (route: string): boolean =>
  route === "/admin/dev" || route.startsWith("/admin/dev/");

/** Both viewports. The product is mobile-first; a desktop-only font guard has the guarantee backwards. */
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

const STATIC_ROUTES = routeCensus().filter(
  (r) => !PARAMETERISED.has(r) && !UNREACHABLE_HERE.has(r) && !isBuildGated(r),
);

test.describe("font rendering census", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("the census is derived, not hand-written", () => {
    // Non-vacuity: a census that resolved to nothing would pass every walk below
    // while proving nothing.
    //
    // 32 page surfaces today (19 page.tsx + 13 page.mdx), 21 of them measured
    // here -- five need params or fixtures and six are excluded with a written
    // reason. Floors rather than equalities, so adding a page does not fail the
    // guard. The 21 was WRONG as >= 25 for one CI run: the exclusions landed
    // without the floor being re-derived, which is the same
    // count-and-its-consumer-drift this plan warns about elsewhere.
    expect(routeCensus().length).toBeGreaterThanOrEqual(30);
    expect(STATIC_ROUTES.length).toBeGreaterThanOrEqual(20);
  });

  for (const viewport of VIEWPORTS) {
    for (const route of STATIC_ROUTES) {
      test(`${route} @ ${viewport.name} renders the expected families`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const response = await page.goto(route);

        // REACHABILITY IS ASSERTED, NOT ASSUMED, and the assertion is about AUTH
        // rather than about the URL. `app/help/layout.tsx:19` calls
        // requireAdmin(), so an unauthenticated visit to /help/** lands on
        // /auth/sign-in -- a correctly-fonted page whose measurement would turn
        // every help case green without executing a single help component.
        //
        // What is NOT asserted is that the final pathname equals the requested
        // route: the app legitimately redirects in places, and pinning the URL
        // would make this a routing test that fails on ordinary product
        // decisions. Landing on the sign-in page is the one redirect that
        // invalidates the measurement, so that is the one this checks.
        expect(response?.status(), `${route} did not return 200`).toBe(200);
        expect(
          new URL(page.url()).pathname,
          `${route} landed on the sign-in page -- the session did not apply, so ` +
            `whatever renders here is not the surface under test`,
        ).not.toBe("/auth/sign-in");

        // A URL and a 200 prove SERVER RENDERING, never hydration. Poll for
        // React having attached props, which appears once and only once the tree
        // has hydrated -- never networkidle, which hangs the full timeout on a
        // prod-build server whose background polling keeps the network busy, and
        // proves nothing about hydration regardless.
        await page.waitForFunction(() => {
          const root = document.body.firstElementChild;
          if (!root) return false;
          return Object.keys(root).some((k) => k.startsWith("__reactProps$"));
        });
        await page.evaluate(() => document.fonts.ready);

        // Open every native disclosure. The browser opens these with no
        // component state to enumerate, so a source-trigger derivation keyed on
        // React state finds nothing for them -- the same lesson as the hover
        // states, one mechanism further out.
        await page.evaluate(() => {
          for (const d of document.querySelectorAll("details")) d.open = true;
        });
        await page.evaluate(() => document.fonts.ready);

        // EXPECTATIONS KEY ON THE LANDED ROUTE, NOT THE REQUESTED ONE.
        // `/admin/onboarding/page.tsx` is a bare `redirect()`, so the document
        // measured here belongs to a different path than the one navigated to.
        // Keyed on the request, every mono entry for the destination silently
        // failed to apply and CI reported the destination's deliberate mono
        // heading as a defect. Any redirecting route has this shape.
        const landed = new URL(page.url()).pathname;
        const where = landed === route ? route : `${route} -> ${landed}`;

        const findings = await page.evaluate(collectFontFindings, {
          cannotHost: CANNOT_HOST_PROBE,
          pseudos: [...CHECKED_PSEUDOS],
          // Structural selectors are evaluated IN THE PAGE, because
          // `Element.matches` exists only there. Without this the manifest's
          // documented "role/name pair rendered as a selector" was
          // unimplemented and every entry fell back to testid-or-tag equality.
          selectors: entriesForRoute(landed).map((e) => e.selector),
        });

        expect(findings.length, `${where} rendered no text-bearing elements`).toBeGreaterThan(0);

        const wrong: string[] = [];
        for (const f of findings) {
          const expectMono = isExpectedMono(
            landed,
            (sel) => f.matched.includes(sel) || f.testid === sel || f.tag === sel.toUpperCase(),
            f.tag,
          );
          const rendersMono = /mono|Courier|Menlo|Consolas/i.test(f.family);
          if (expectMono && !rendersMono) {
            wrong.push(
              `${f.tag}${f.testid ? `[${f.testid}]` : ""} expected mono, rendered ${f.family}`,
            );
          }
          if (!expectMono && !/Inter/i.test(f.family)) {
            wrong.push(
              `${f.tag}${f.testid ? `[${f.testid}]` : ""} expected Inter, rendered ${f.family}`,
            );
          }
        }
        expect(wrong, `${where} @ ${viewport.name}:\n  ${wrong.join("\n  ")}`).toEqual([]);

        // THE REGISTERED FACE SET. This is what closes a runtime-registered
        // impostor at `weight: "1000"` paired with a matching rule on visible
        // text: the probe normalises to 400 and would select the genuine face
        // while the text selects the impostor. Normalising further cannot fix
        // that, because the normalisation IS the hole -- so the check moves to
        // the face set, on every selection axis at once.
        const faces = await page.evaluate(() =>
          [...document.fonts].map((f) => `${f.family}|${f.weight}|${f.style}|${f.stretch}`),
        );
        const interFaces = faces.filter((f) => f.startsWith("Inter|"));
        expect(interFaces, `${route} registered an unexpected Inter face`).toEqual([
          "Inter|100 900|normal|normal",
        ]);
      });
    }
  }

  test("every mono manifest entry still matches something on its route", async ({ page }) => {
    // FRESHNESS, and it runs HERE rather than in the shared fixture. "Every
    // entry matches at least one element on its route" is a claim about real
    // routes; evaluated against a harness document -- which has no route at all,
    // since setContent leaves the URL at about:blank -- it would mark every
    // entry stale and fail all 32 callers.
    //
    // It keeps the manifest honest in the other direction: an entry left behind
    // by a deleted component fails rather than silently widening the mono
    // exemption.
    // Keyed on the LANDED path, same as the census rows above: an entry whose
    // route redirects would otherwise be checked against a document it does not
    // describe and reported stale, which is the inverse of this row's purpose.
    // Not live today -- no entry sits on a redirecting route -- but it is the
    // same defect that cost a round in the census, so it is closed in the same
    // pass rather than left for the first entry that moves.
    const stale: string[] = [];
    for (const route of STATIC_ROUTES) {
      await page.goto(route);
      const landed = new URL(page.url()).pathname;
      const entries = entriesForRoute(landed);
      if (entries.length === 0) continue;
      for (const entry of entries) {
        const count = await page.locator(entry.selector).count();
        if (count === 0) stale.push(`${entry.route} ${entry.selector} matches nothing`);
      }
    }
    expect(stale, `stale mono manifest entries:\n  ${stale.join("\n  ")}`).toEqual([]);
  });
});
