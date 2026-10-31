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
 * Next.js App Router prefetches route segments aggressively. If a section link
 * (an "All sections" row, a nav item) were a `<Link prefetch>` to a `?s=` URL,
 * scrolling it into view would cause Next to RENDER the destination route segment
 * ahead of any click — and because the crew page render runs CrewShell, that
 * prefetch would fire the projection-fetch admin_alerts write WITHOUT a real human
 * visit. A burst of prefetches across the section links would spray phantom rows.
 * §12.4 alert catalog is supposed to mean "a real load actually failed for a
 * real viewer," not "Next speculatively rendered a segment."
 *
 * Two structural guarantees keep that from happening; this file pins both:
 *
 *   (i)  Opening a section is a CLIENT HISTORY CALL (crew page redesign spec
 *        §5.2). The "All sections" rows and the wide nav items are plain
 *        `<a href>` anchors, never `next/link`: Next prefetches only its own
 *        `<Link>`, so a plain anchor to a `?s=` URL is never speculatively
 *        rendered. Neither component imports `useRouter`/`router.push`. The
 *        CrewSections controller intercepts the click and applies the change as
 *        client state plus a SHALLOW URL update (`window.history.pushState`,
 *        NOT `router.push`), so the dynamic crew route never re-renders per
 *        open. The sheet itself navigates nowhere.
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

/** Every crew surface that renders a link or control opening a section. */
const SECTION_OPENERS = [
  "components/crew/CrewAllSections.tsx",
  "components/crew/CrewWideNav.tsx",
  "components/crew/CrewSectionSheet.tsx",
] as const;
const SECTIONS = "components/crew/CrewSections.tsx";
const SECTION_HREF = "lib/crew/sectionHref.ts";
const SECTION_CHIP_LINK = "components/crew/SectionChipLink.tsx";
const CREW_ROUTE = "app/show/[slug]/[shareToken]/page.tsx";
const CREW_ROUTE_REQUEST = "lib/auth/picker/showPageChainRequest.ts";
const PREVIEW_ROUTE = "app/admin/show/[slug]/preview/[crewId]/page.tsx";

describe("test 36b — no phantom prefetch alert (structural)", () => {
  // ── (i) Opening a section is a client history call: the openers render plain
  // anchors (no next/link, no router), and the controller updates the URL via a
  // SHALLOW history.pushState, never router.push. No prefetchable `?s=` <Link>,
  // and no per-open server render. ──
  it("(i) the section openers (list rows, wide nav, sheet) own no navigation: no router, no next/link", () => {
    for (const file of SECTION_OPENERS) {
      const code = src(file);
      expect(code, `${file} must not obtain the App Router`).not.toMatch(/useRouter\s*\(/);
      expect(code, `${file} must not call router.push`).not.toMatch(/router\.push\s*\(/);
      expect(code, `${file} must not import next/link`).not.toMatch(/from\s+["']next\/link["']/);
    }
    // The rows and nav items are real anchors (a pre-hydration tap and "open in
    // new tab" still land on the server-rendered sheet), not <Link>s.
    for (const file of ["components/crew/CrewAllSections.tsx", "components/crew/CrewWideNav.tsx"]) {
      expect(src(file), `${file} renders plain <a href> anchors`).toMatch(/<a\b[\s\S]*?href=/);
    }
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
