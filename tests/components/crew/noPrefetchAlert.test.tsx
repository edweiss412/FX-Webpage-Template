/**
 * tests/components/crew/noPrefetchAlert.test.tsx — crew-redesign Phase 4 Task 3
 * ("test 36b", structural).
 *
 * WHY THIS TEST EXISTS — the "phantom prefetch alert" hazard.
 *
 * CrewShell (app/show/[slug]/[shareToken]/_CrewShell.tsx) owns a section-
 * INDEPENDENT producer side-effect: on every render where the projection
 * carries one or more `tileErrors`, it fires ONE best-effort
 * `upsertAdminAlert({ code: "TILE_PROJECTION_FETCH_FAILED" })`. That write
 * happens at module-render time, before the section model is even resolved.
 *
 * Next.js App Router prefetches route segments aggressively. If a sub-nav tab
 * were an `<Link prefetch>` pointing at a `?s=<section>` URL, hovering/scrolling
 * the nav would cause Next to RENDER the destination route segment ahead of any
 * click — and because the crew page render runs CrewShell, that prefetch would
 * fire the projection-fetch admin_alerts write WITHOUT a real human visit. A
 * burst of prefetches across six tabs would spray phantom alert rows. The
 * §12.4 alert catalog is supposed to mean "a real load actually failed for a
 * real viewer," not "Next speculatively rendered a segment."
 *
 * Two structural guarantees keep that from happening; this file pins both:
 *
 *   (i)  Section nav is a PURE CLIENT TOGGLE (client-section-toggle). CrewSubNav
 *        is a controlled, presentational component: a tab is a <button> that
 *        calls `onSelect(id)` — it owns NO navigation, imports no `useRouter`/
 *        `router.push`, and renders no `<Link>`. The CrewSections controller
 *        applies the section change as client state plus a SHALLOW URL update
 *        (`window.history.pushState`, NOT `router.push`) — so the dynamic crew
 *        route never re-renders per tab and there is NO `?s=` section URL anchor
 *        for Next to prefetch. With no `<Link>`/`router.push` to a `?s=` URL at
 *        all, the phantom-prefetch hazard is moot for section nav.
 *
 *   (ii) The crew route (and the admin preview-as route) is DYNAMIC: it reads a
 *        request-scoped input (cookies()/headers() via
 *        buildShowPageChainRequest, OR `export const dynamic = "force-dynamic"`).
 *        A dynamic route is NOT statically prefetchable — on prefetch Next emits
 *        only the static `loading.tsx` boundary and does NOT execute the dynamic
 *        page render, so `_CrewShell` (and its upsertAdminAlert side-effect)
 *        never runs until a real navigation commits. This is the load-bearing
 *        half: even an accidental prefetch can't reach the alert.
 *
 * This is a SOURCE-STRUCTURE test (readFileSync), not a render test: the
 * contract is a property of how the nav and routes are written, and a render
 * test could not prove "Next never prefetch-renders this segment."
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const SUB_NAV = "components/crew/CrewSubNav.tsx";
const SECTIONS = "components/crew/CrewSections.tsx";
const SECTION_HREF = "lib/crew/sectionHref.ts";
const SECTION_CHIP_LINK = "components/crew/SectionChipLink.tsx";
const CREW_ROUTE = "app/show/[slug]/[shareToken]/page.tsx";
const CREW_ROUTE_REQUEST = "lib/auth/picker/showPageChainRequest.ts";
const PREVIEW_ROUTE = "app/admin/show/[slug]/preview/[crewId]/page.tsx";

describe("test 36b — no phantom prefetch alert (structural)", () => {
  // ── (i) Section nav is a pure client toggle: CrewSubNav is controlled
  // (onSelect, no router.push, no <Link>); the controller updates the URL via a
  // SHALLOW history.pushState, never router.push. No `?s=` anchor for Next to
  // prefetch, and no per-tap server render. ──
  it("(i) CrewSubNav is controlled (onSelect) — no router.push, no next/link, tabs are <button>", () => {
    const code = src(SUB_NAV);

    // The nav owns NO navigation: it calls the parent-supplied onSelect.
    expect(code, "CrewSubNav must be controlled — call the parent onSelect(id) on tap").toMatch(
      /onSelect\s*\(/,
    );
    // It must NOT obtain the App Router or call router.push (no per-tab server nav).
    expect(code, "CrewSubNav must not obtain the App Router").not.toMatch(/useRouter\s*\(/);
    expect(code, "CrewSubNav must not call router.push (no per-tab server nav)").not.toMatch(
      /router\.push\s*\(/,
    );
    // And it must not import a prefetching next/link <Link>.
    expect(code, "CrewSubNav must not import next/link").not.toMatch(/from\s+["']next\/link["']/);
    // Tabs are real <button>s, not anchors.
    expect(code, "CrewSubNav tabs are <button> elements").toMatch(/<button\b/);
  });

  it("(i) CrewSections updates the URL via shallow history.pushState — NOT router.push (no per-tap server render)", () => {
    const code = src(SECTIONS);

    // The controller applies the `?s=` change as a SHALLOW URL update so the
    // dynamic crew route does NOT re-run getShowForViewer per tap.
    expect(code, "CrewSections must update ?s= via window.history.pushState (shallow URL)").toMatch(
      /history\.pushState\s*\(/,
    );
    // It must build that URL via the SHARED buildSectionHref helper.
    expect(
      code,
      "CrewSections must build the shallow URL via the shared buildSectionHref(...)",
    ).toMatch(/buildSectionHref\s*\(/);
    // The HARD guarantee: section nav does NO server navigation — no router.push.
    expect(code, "CrewSections must NOT call router.push for section nav").not.toMatch(
      /router\.push\s*\(/,
    );

    // And the shared builder is the thing that sets the section param ("s").
    const href = src(SECTION_HREF);
    expect(href, 'buildSectionHref must set the section param ("s")').toMatch(
      /\.set\(\s*["']s["']/,
    );
  });

  // ── (i-bis) The in-body SectionChipLink IS a next/link <Link> to a ?s=
  // section URL (the Today "Run of show" → full-agenda chip). That is exactly
  // the phantom-prefetch shape, so it MUST opt out of prefetch — a section-URL
  // anchor that auto-prefetched would speculatively render the dynamic crew
  // route's CrewShell and could fire the projection-fetch admin alert. ──
  it("(i) SectionChipLink — the in-body section <Link> — opts out of prefetch (prefetch={false})", () => {
    const code = src(SECTION_CHIP_LINK);

    // It is a next/link <Link> navigating via the SAME shared section-URL builder.
    expect(code, "SectionChipLink uses next/link").toMatch(/from\s+["']next\/link["']/);
    expect(code, "SectionChipLink navigates via the shared buildSectionHref(...) builder").toMatch(
      /buildSectionHref\s*\(/,
    );

    // Every <Link> it renders MUST carry prefetch={false}. Require whitespace
    // after `<Link` so a `<Link>` mentioned in prose/comments isn't matched —
    // only real JSX opening tags (which always have an attribute after a space).
    const linkUsages = code.match(/<Link\s[^>]*>/g) ?? [];
    expect(linkUsages.length, "SectionChipLink must render at least one <Link>").toBeGreaterThan(0);
    for (const usage of linkUsages) {
      expect(
        usage,
        `every <Link> in SectionChipLink must carry prefetch={false} (no auto-prefetch to a section URL): ${usage}`,
      ).toMatch(/prefetch=\{false\}/);
    }
  });

  it("(i) CrewSubNav imports no next/link <Link>, so there is no auto-prefetching anchor to a ?s= section URL", () => {
    const code = src(SUB_NAV);

    // The compliant implementation uses buttons + router.push, never <Link>.
    // If a future refactor DID add a next/link import, the guard below forces it
    // to be an explicitly non-prefetching link (prefetch={false}) — never a bare
    // default-prefetch <Link href="...?s=...">.
    const importsNextLink = /from\s+["']next\/link["']/.test(code);
    if (importsNextLink) {
      // Any <Link …> rendered in the nav must opt out of prefetch. (Next's
      // <Link> prefetches by default; a section-URL <Link> without
      // prefetch={false} is exactly the phantom-prefetch hazard.)
      const linkUsages = code.match(/<Link\b[^>]*>/g) ?? [];
      expect(
        linkUsages.length,
        "CrewSubNav imported next/link but rendered no <Link> — drop the unused import",
      ).toBeGreaterThan(0);
      for (const usage of linkUsages) {
        expect(
          usage,
          `every <Link> in CrewSubNav must carry prefetch={false} (no auto-prefetch to a section URL): ${usage}`,
        ).toMatch(/prefetch=\{false\}/);
      }
    } else {
      // The expected state: nav is button + router.push, no <Link> at all.
      expect(
        importsNextLink,
        "CrewSubNav should not import next/link — section activation is router.push, so there is no prefetchable section anchor",
      ).toBe(false);
      // And the tabs are real <button>s, not anchors.
      expect(code, "CrewSubNav tabs are <button> elements").toMatch(/<button\b/);
    }
  });

  // ── (ii) Both crew-render routes are DYNAMIC → not statically prefetchable ──
  // A dynamic route means Next renders only the static loading.tsx boundary on
  // prefetch and NEVER runs the page render (hence never _CrewShell, hence never
  // the upsertAdminAlert side-effect) until a real navigation commits.
  it("(ii) the crew route is dynamic: it reads a request-scoped input (cookies()/headers()), so prefetch never runs _CrewShell", () => {
    const route = src(CREW_ROUTE);
    const requestBuilder = src(CREW_ROUTE_REQUEST);

    // The crew page builds its auth-chain request from Next's request-scoped
    // cookies()/headers() store. Reading either is a Dynamic API in the App
    // Router — it opts the segment OUT of static generation/prefetch rendering.
    expect(
      route,
      "crew route must consume the request-scoped auth-chain request builder (forces dynamic render)",
    ).toMatch(/buildShowPageChainRequest\s*\(/);
    expect(
      requestBuilder,
      "the auth-chain request builder must read request-scoped cookies()/headers() (the dynamic input)",
    ).toMatch(/cookies\s*\(\s*\)/);
    expect(
      requestBuilder,
      "the auth-chain request builder must read request-scoped headers() (the dynamic input)",
    ).toMatch(/headers\s*\(\s*\)/);
    expect(requestBuilder, "cookies/headers come from next/headers").toMatch(
      /from\s+["']next\/headers["']/,
    );

    // The route render path leads into CrewShell (the alert-owning component);
    // because the segment is dynamic, that path is gated behind a real nav, not
    // a prefetch.
    expect(route, "crew route renders CrewShell (the alert owner)").toMatch(/CrewShell/);
  });

  it('(ii) the admin preview-as route is dynamic via `export const dynamic = "force-dynamic"`, so prefetch never runs _CrewShell', () => {
    const route = src(PREVIEW_ROUTE);
    expect(
      route,
      'admin preview-as route must force a dynamic render (export const dynamic = "force-dynamic") so a prefetch cannot execute its CrewShell render',
    ).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
    expect(route, "admin preview-as route renders CrewShell (the alert owner)").toMatch(
      /CrewShell/,
    );
  });
});
