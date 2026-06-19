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
 *   (i)  CrewSubNav activates a section through `router.push` (an imperative
 *        client navigation on click), NOT through a prefetching `<Link>`. There
 *        is therefore no `<Link>` whose href is a `?s=` section URL that Next
 *        could prefetch on hover. (If a future refactor introduced a `<Link>`
 *        to a section URL, it would have to carry `prefetch={false}` to remain
 *        compliant — also asserted.)
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
const CREW_ROUTE = "app/show/[slug]/[shareToken]/page.tsx";
const CREW_ROUTE_REQUEST = "lib/auth/picker/showPageChainRequest.ts";
const PREVIEW_ROUTE = "app/admin/show/[slug]/preview/[crewId]/page.tsx";

describe("test 36b — no phantom prefetch alert (structural)", () => {
  // ── (i) CrewSubNav activates via router.push, never a prefetching <Link> ──
  it("(i) CrewSubNav drives section activation through router.push (imperative nav), not a prefetching <Link>", () => {
    const code = src(SUB_NAV);

    // Section activation is an imperative client navigation: the nav obtains a
    // router and calls router.push to set the `?s=` URL on click.
    expect(code, "CrewSubNav must obtain the App Router").toMatch(/useRouter\s*\(/);
    expect(
      code,
      "CrewSubNav must activate a section via router.push (imperative, click-driven — NOT a prefetchable <Link>)",
    ).toMatch(/router\.push\s*\(/);

    // The push target is the `?s=` section URL (so we know router.push — not a
    // <Link> — is the thing that carries the section param).
    expect(
      code,
      'the pushed URL must set the section param ("s")',
    ).toMatch(/\.set\(\s*["']s["']/);
  });

  it('(i) CrewSubNav imports no next/link <Link>, so there is no auto-prefetching anchor to a ?s= section URL', () => {
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
    expect(route, "admin preview-as route renders CrewShell (the alert owner)").toMatch(/CrewShell/);
  });
});
