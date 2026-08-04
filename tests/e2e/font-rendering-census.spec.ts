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

import { expect, test } from "./helpers/fontFidelityFixture";
import { CANNOT_HOST_PROBE, CHECKED_PSEUDOS } from "./helpers/fontOracle";
import { entriesForRoute, isExpectedMono } from "./helpers/monoSurfaces";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

/**
 * Follows the config's own port policy rather than hardcoding 3000.
 *
 * `playwright.config.ts:8` reads `E2E_PORT` as a local sibling-worktree escape
 * hatch: a live sibling session's dev server on :3000 would otherwise be
 * silently reused and serve the WRONG code. A spec that hardcodes the port opts
 * out of that protection and measures whatever the sibling is running.
 *
 * 127.0.0.1 rather than localhost, matching the explicit `-H 127.0.0.1`
 * binding, so a dual-stack ::1 vs 127.0.0.1 mismatch cannot split them.
 */
const TEST_BASE_URL = `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
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
  ["/show/[slug]/[shareToken]", "needs a published show and its share token"],
  ["/show/[slug]/unpublish", "needs a published show"],
]);

/** Both viewports. The product is mobile-first; a desktop-only font guard has the guarantee backwards. */
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

const STATIC_ROUTES = routeCensus().filter((r) => !PARAMETERISED.has(r));

test.describe("font rendering census", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: TEST_BASE_URL });
  });

  test("the census is derived, not hand-written", () => {
    // Non-vacuity: a census that resolved to nothing would pass every walk below
    // while proving nothing. 19 page.tsx + 13 page.mdx = 32 at the time of
    // writing; asserted as a floor so adding a page does not fail the guard.
    expect(routeCensus().length).toBeGreaterThanOrEqual(30);
    expect(STATIC_ROUTES.length).toBeGreaterThanOrEqual(25);
  });

  for (const viewport of VIEWPORTS) {
    for (const route of STATIC_ROUTES) {
      test(`${route} @ ${viewport.name} renders the expected families`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const response = await page.goto(`${TEST_BASE_URL}${route}`);

        // REACHABILITY IS ASSERTED, NOT ASSUMED. `app/help/layout.tsx:19` calls
        // requireAdmin(), so a fresh context visiting /help/** lands on
        // /auth/sign-in -- a correctly-fonted page. Measuring that would turn
        // every help case green without executing a single help component.
        expect(response?.status(), `${route} did not return 200`).toBe(200);
        expect(new URL(page.url()).pathname, `${route} redirected away`).toBe(route);

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

        const findings = await page.evaluate(
          ({ cannotHost, pseudos }) => {
            const out: { tag: string; family: string; kind: string; testid: string }[] = [];
            const walkRoot = (root: Node): void => {
              const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
              for (let n = w.currentNode as Element | null; n; n = w.nextNode() as Element | null) {
                const el = n as HTMLElement;
                if (el.offsetParent === null && el.tagName !== "BODY") continue;
                const hasText = Array.from(el.childNodes).some(
                  (c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== "",
                );
                const testid = el.getAttribute("data-testid") ?? "";
                if (hasText) {
                  out.push({
                    tag: el.tagName,
                    family: getComputedStyle(el).fontFamily,
                    kind: el.matches(cannotHost) ? "computed-only" : "probe-hostable",
                    testid,
                  });
                }
                // Pseudo-elements cannot host a child probe at all; the
                // demonstrated escape is ::placeholder { font-family: Arial },
                // which no child probe anywhere in the document can see.
                for (const pseudo of pseudos) {
                  const cs = getComputedStyle(el, pseudo);
                  if (cs.content && cs.content !== "none" && cs.content !== "normal") {
                    out.push({
                      tag: `${el.tagName}${pseudo}`,
                      family: cs.fontFamily,
                      kind: "pseudo",
                      testid,
                    });
                  }
                }
                if (el.shadowRoot) walkRoot(el.shadowRoot);
              }
            };
            walkRoot(document.body);
            return out;
          },
          { cannotHost: CANNOT_HOST_PROBE, pseudos: [...CHECKED_PSEUDOS] },
        );

        expect(findings.length, `${route} rendered no text-bearing elements`).toBeGreaterThan(0);

        const wrong: string[] = [];
        for (const f of findings) {
          const expectMono = isExpectedMono(
            route,
            (sel) => f.testid === sel || f.tag === sel.toUpperCase(),
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
        expect(wrong, `${route} @ ${viewport.name}:\n  ${wrong.join("\n  ")}`).toEqual([]);

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
    const stale: string[] = [];
    for (const route of STATIC_ROUTES) {
      const entries = entriesForRoute(route);
      if (entries.length === 0) continue;
      await page.goto(`${TEST_BASE_URL}${route}`);
      for (const entry of entries) {
        const count = await page.locator(entry.selector).count();
        if (count === 0) stale.push(`${entry.route} ${entry.selector} matches nothing`);
      }
    }
    expect(stale, `stale mono manifest entries:\n  ${stale.join("\n  ")}`).toEqual([]);
  });
});
