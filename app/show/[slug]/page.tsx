/**
 * app/show/[slug]/page.tsx — per-show crew page.
 *
 * M5 §B Task 5.7 (spec §7.4) replaces the M4 identity-only mock with the
 * cookie-bound auth chain. Identity is the only thing the page passes to
 * `getShowForViewer` (the role-spoof regression contract is preserved —
 * see `tests/data/show-page-role-spoof.test.ts` and the bans enforced
 * therein); what changes is HOW the page resolves identity. The chain
 * runs the four-step ladder per spec §7.3 + plan 05-auth.md:275-281:
 *
 *     1. isAdminSession(req)         — admin precedence, runs FIRST
 *     2. validateLinkSession(req)    — __Host-fxav_session cookie path
 *     3. validateGoogleSession(req)  — Supabase OAuth path
 *     4. requireAdmin()              — final fallback (non-OAuth admin shapes)
 *
 * Each validator returns a tri-state outcome:
 *   - { kind: 'success', viewer } — authenticated; chain stops, render proceeds.
 *   - { kind: 'continue', clearCookie? } — this branch doesn't apply; OR the
 *     cookie is stale/wrong-show/revoked/malformed and MUST be cleared. The
 *     chain falls through; the `clearCookie` flag is OR-aggregated across all
 *     validators.
 *   - { kind: 'terminal_failure', status, code } — server-side infrastructure
 *     fault (DB outage, signing-key fetch failure). Chain stops; the page
 *     renders the catalog message via lib/messages/lookup.ts (no raw error
 *     codes per AGENTS.md §1.5).
 *
 * Admin precedence + requireAdmin() defense-in-depth (plan 05-auth.md:276):
 *   When `isAdminSession` returns true, we IMMEDIATELY call `requireAdmin()`
 *   to confirm via the canonical chokepoint (build-time gate + Postgres
 *   is_admin() RPC). If the two predicates disagree (drift), we fall
 *   through to the next chain step rather than render as admin. The
 *   `requireAdmin()` call is wrapped in try/catch because it raises via
 *   `notFound()` / `forbidden()` (Next.js navigation control flow); we
 *   catch the navigation throw and continue the chain.
 *
 * Chain-adapter clearCookie plumbing (Q1 of the implementer-prompt answers):
 *   Next 16 forbids cookie mutation from a Server Component. When the chain
 *   needs to clear the offending cookie, the page redirects through the
 *   §B-allowed route handler `app/auth/clear-session/route.ts`, which
 *   appends the canonical `clearSessionCookie()` Set-Cookie header to its
 *   303 response. Two scenarios:
 *
 *     - clearCookie && viewer resolved (e.g., wrong-show cookie + admin):
 *       redirect to /auth/clear-session?next=<same-url>. After clear, the
 *       re-render runs the chain again without the stale cookie and admin
 *       still resolves.
 *     - clearCookie && !viewer (e.g., revoked cookie + no Google + no admin):
 *       redirect to /auth/clear-session?next=/auth/sign-in?next=/show/<slug>.
 *       After clear, the user lands on the sign-in flow.
 *
 * Wrong-show cookie detection (Q6): decoded at the top of the chain (cheap,
 * no DB hit). When `envelope.show_id !== showId`, the validator's continue+
 * clearCookie path will already fire as part of `validateLinkSession`'s
 * own cross-show check; we OR-aggregate the same flag here so the chain
 * adapter consistently emits the clear-cookie marker even when admin
 * precedence wins before validateLinkSession runs.
 *
 * Admin-precedence skip-link-validator: per plan §276, when admin
 * precedence wins we DO NOT run validateLinkSession. The link cookie is
 * left in place (still valid for crew-mode use later); any DB-side cleanup
 * for stale-but-wrong-show cookies happens naturally on the next request
 * that runs the link branch (e.g., admin role removal).
 *
 * Identity-only contract: the `searchParams` object is intentionally NOT
 * read for any auth decision. The static-analysis test
 * `tests/data/show-page-role-spoof.test.ts` enforces that the role
 * search-param (and bracket-form equivalents) are never referenced; the
 * page no longer accepts a `searchParams` prop at all (M5 §B retires the
 * M4 identity-only mock — see `app/api/test-auth/set-session` for the
 * test-only auth path that replaces it).
 *
 * Server Component. No `'use client'`.
 */
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { ShowRealtimeBridge } from "@/components/realtime/ShowRealtimeBridge";
import { RightNowCard } from "@/components/right-now/RightNowCard";
import { buildRightNowContext } from "@/components/right-now/buildRightNowContext";
import { AudioScopeTile } from "@/components/tiles/AudioScopeTile";
import { ContactsTile } from "@/components/tiles/ContactsTile";
import { CrewTile } from "@/components/tiles/CrewTile";
import { FinancialsTile } from "@/components/tiles/FinancialsTile";
import { LightingScopeTile } from "@/components/tiles/LightingScopeTile";
import { LodgingTile } from "@/components/tiles/LodgingTile";
import { NotesTile } from "@/components/tiles/NotesTile";
import { PackListTile } from "@/components/tiles/PackListTile";
import { ScheduleTile } from "@/components/tiles/ScheduleTile";
import { ShowStatusTile } from "@/components/tiles/ShowStatusTile";
import { TransportTile } from "@/components/tiles/TransportTile";
import { VenueTile } from "@/components/tiles/VenueTile";
import { VideoScopeTile } from "@/components/tiles/VideoScopeTile";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { decodeSessionCookieValue } from "@/lib/auth/cookies";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";
import {
  getShowForViewer,
  type Viewer,
  type ShowForViewer,
} from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { messageFor } from "@/lib/messages/lookup";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Resolve a slug to a show id via a single bound SELECT. */
async function resolveShowIdFromSlug(slug: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const res = await supabase
    .from("shows")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (res.error) {
    throw new Error(`/show/[slug]: slug lookup failed: ${res.error.message}`);
  }
  return (res.data?.id as string | undefined) ?? null;
}

/**
 * Build a synthetic Request whose `headers.cookie` carries the live cookie
 * store. The §A validators (`validateLinkSession`, `validateGoogleSession`,
 * `isAdminSession`) accept `req: Request` and only inspect
 * `req.headers.get('cookie')`; building a synthetic Request lets the chain
 * adapter consume their existing tri-state contract unchanged from the RSC
 * boundary.
 */
async function buildRequestForChain(): Promise<Request> {
  const h = await headers();
  const c = await cookies();
  const cookieHeader = c
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  // Synthetic origin — validators only read req.headers.get('cookie'); the
  // URL doesn't influence resolution. Pass the originating pathname for
  // diagnostic-only use.
  const path = h.get("x-pathname") ?? "/";
  return new Request(`http://internal${path}`, {
    headers: {
      cookie: cookieHeader,
    },
  });
}

type ChainResolution = {
  viewer: Viewer | null;
  clearCookie: boolean;
  terminalFailure: { status: 401 | 403 | 500; code: string } | null;
};

/**
 * Try the canonical admin chokepoint after `isAdminSession` returns true.
 * `requireAdmin()` raises via `notFound()` / `forbidden()` (Next.js
 * navigation control flow), so success is "no throw"; any throw means
 * the dual gate disagreed and we fall through to the next chain step.
 *
 * Per plan §276: "If `isAdminSession` returns true, **run `requireAdmin`
 * immediately** and resolve to `{ kind: 'admin' }`." This double-gate
 * catches drift between the predicate (cookie-bound + RPC) and the
 * canonical chokepoint (build-time + RPC). When drift happens, the
 * conservative path is to NOT render as admin and fall through; the
 * chain's later steps will either resolve a crew viewer or redirect to
 * sign-in.
 */
async function tryRequireAdmin(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch {
    // Build-time gate (404) or auth-gate (403) raised. Drift between
    // isAdminSession (predicate) and requireAdmin (chokepoint) — fall
    // through. Intentionally swallow — the chain's later steps handle
    // the not-admin outcome.
    return false;
  }
}

/**
 * Run the four-step auth chain. See file-header comment for ordering and
 * tri-state contract. Returns the resolved viewer plus the OR-aggregated
 * clearCookie flag and any terminal_failure outcome.
 */
async function resolveViewer(
  req: Request,
  showId: string,
): Promise<ChainResolution> {
  let clearCookie = false;
  let viewer: Viewer | null = null;

  // Wrong-show cookie pre-check — Q6. Cheap (no DB), runs before any
  // validator. If the cookie envelope's show_id doesn't match this URL's
  // show_id, we know we'll need to clear regardless of which validator
  // resolves. validateLinkSession does its own cross-show DELETE on the
  // server side; this flag just ensures the response gets the clear-cookie
  // marker even when admin precedence wins before validateLinkSession
  // runs.
  const cookieHeader = req.headers.get("cookie") ?? "";
  const sessionCookieRaw = (() => {
    for (const part of cookieHeader.split(";")) {
      const [rawName, ...rawVal] = part.trim().split("=");
      if (rawName === SESSION_COOKIE_NAME) {
        return rawVal.join("=");
      }
    }
    return undefined;
  })();
  const cookieEnvelope = decodeSessionCookieValue(sessionCookieRaw);
  const cookieIsForWrongShow =
    cookieEnvelope !== null && cookieEnvelope.show_id !== showId;
  // A cookie that's present but FAILED to decode is also "needs clearing"
  // (parse/format fault) — set clearCookie now so the chain emits the marker
  // even if admin precedence resolves first.
  const cookiePresentButMalformed =
    sessionCookieRaw !== undefined && cookieEnvelope === null;
  if (cookieIsForWrongShow || cookiePresentButMalformed) {
    clearCookie = true;
  }

  // (1) Admin precedence — runs FIRST per plan 05-auth.md:276. A pure
  // predicate; no DB writes, no cookie side effects. When it returns
  // true we IMMEDIATELY call `requireAdmin()` (the canonical chokepoint
  // — build-time gate + Postgres is_admin() RPC). Both must agree before
  // we resolve to admin. The link branch is intentionally NOT run on this
  // path (per plan §276); link cookies are left in place for crew-mode
  // use later, with DB-side cleanup deferred to whichever future request
  // exercises the link branch.
  const admin = await isAdminSession(req);
  if (admin.ok) {
    const adminConfirmed = await tryRequireAdmin();
    if (adminConfirmed) {
      viewer = { kind: "admin" };
    }
    // Drift between isAdminSession and requireAdmin → fall through to the
    // next chain step. Don't return early.
  }

  // (2) validateLinkSession — runs only if admin didn't resolve. Its own
  // continue+clearCookie outcomes get OR'd into our clearCookie flag.
  if (!viewer) {
    const link = await validateLinkSession(req, { showId });
    if (link.kind === "success") {
      viewer = { kind: "crew", crewMemberId: link.viewer.crewMemberId };
    } else if (link.kind === "continue") {
      if (link.clearCookie) clearCookie = true;
    } else if (link.kind === "terminal_failure") {
      if (link.clearCookie) clearCookie = true;
      return {
        viewer: null,
        clearCookie,
        terminalFailure: { status: link.status, code: link.code },
      };
    }
  }

  // (3) validateGoogleSession — runs only if neither admin nor link
  // resolved.
  if (!viewer) {
    const google = await validateGoogleSession(req, { showId });
    if (google.kind === "success") {
      viewer = {
        kind: "crew",
        crewMemberId: google.viewer.crewMemberId,
      };
    } else if (google.kind === "terminal_failure") {
      return {
        viewer: null,
        clearCookie,
        terminalFailure: { status: google.status, code: google.code },
      };
    }
    // continue: nothing to OR (validateGoogleSession's continue arm has
    // no clearCookie flag).
  }

  // (4) requireAdmin fallback — preserved per spec for non-OAuth admin
  // auth shapes. We can only reach this when isAdminSession returned
  // false at step 1; requireAdmin is more conservative (uses the
  // cookie-bound Supabase client + is_admin RPC) so the dual gate
  // catches any drift in the OTHER direction (admin via build-time
  // chokepoint that isAdminSession's predicate missed).
  if (!viewer) {
    const adminFallback = await tryRequireAdmin();
    if (adminFallback) {
      viewer = { kind: "admin" };
    }
  }

  return { viewer, clearCookie, terminalFailure: null };
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ShowPage({ params }: PageProps) {
  const { slug } = await params;

  const showId = await resolveShowIdFromSlug(slug);
  if (!showId) {
    notFound();
  }

  const req = await buildRequestForChain();
  const result = await resolveViewer(req, showId);

  if (result.terminalFailure) {
    // Server-side infrastructure fault — render via catalog message (no raw
    // error codes per AGENTS.md §1.5). M5 §B Task 5.9's ErrorExplainer is
    // the eventual surface; for now we 404 with a TODO. notFound() is the
    // safer-by-default choice than leaking the raw 500 to the client.
    // Reading the message catalog ensures the code is registered (defense
    // in depth: a deleted catalog entry would throw here, surfacing the
    // bug at request time rather than silently rendering nothing).
    void messageFor(result.terminalFailure.code as never);
    // TODO(Task 5.9): replace with the §B ErrorExplainer surface once
    // components/messages/ErrorExplainer.tsx ships.
    notFound();
  }

  // Chain-adapter clearCookie plumbing. Two cases:
  //   - clearCookie && viewer resolved: redirect to clear-session with
  //     next=<same-url>. After clear, re-render the page; the chain
  //     re-runs without the stale cookie and the same viewer resolves.
  //   - clearCookie && !viewer: redirect to clear-session with
  //     next=/auth/sign-in?next=/show/<slug>. After clear, the user lands
  //     on the sign-in flow.
  const selfPath = `/show/${slug}`;
  if (result.clearCookie) {
    const target = result.viewer
      ? selfPath
      : `/auth/sign-in?next=${encodeURIComponent(selfPath)}`;
    redirect(`/auth/clear-session?next=${encodeURIComponent(target)}`);
  }

  if (!result.viewer) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(selfPath)}`);
  }

  const viewer: Viewer = result.viewer;

  let data: ShowForViewer;
  try {
    data = await getShowForViewer(showId, viewer);
  } catch (err) {
    // LINK_NO_CREW_MATCH (cross-show fail-closed §7.2.2 step 5) and any
    // other lookup error route through notFound() at this milestone. The
    // human-copy lookup (lib/messages/lookup.ts) is wired for the catalog
    // surface but the per-route ErrorExplainer is Task 5.9 §B. UI never
    // shows raw error codes per AGENTS.md §1.5.
    // TODO(Task 5.9): replace with the §B ErrorExplainer surface.
    void err;
    notFound();
  }

  // Per-viewer context computed once and threaded into the hero card and
  // the tile grid below.
  const ctx = resolveViewerContext(viewer, data);
  const rightNowCtx = buildRightNowContext({
    show: data.show,
    dateRestriction: ctx.dateRestriction,
    hotelReservations: data.hotelReservations,
    contacts: data.contacts,
  });

  return (
    <>
      <Header show={data.show} />
      {/*
        ShowRealtimeBridge — mounts a Supabase Realtime Broadcast subscription
        to `show:<id>:invalidation`; on each invalidate event the bridge
        calls router.refresh() (debounced 100ms) so this Server Component
        re-executes and re-fetches getShowForViewer.
      */}
      <ShowRealtimeBridge
        showId={showId}
        slug={slug}
        renderVersion={data.viewerVersionToken}
      />
      <main
        data-testid="page-container"
        className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-section-gap px-4 py-6 sm:p-8"
      >
        {/*
          RightNowCard — hero element. Time-aware AND viewer-aware. State
          machine in lib/time/rightNow.ts resolves one of 12 §8.2 states
          from (today, show.dates, viewerCrew.dateRestriction).
        */}
        <RightNowCard context={rightNowCtx} />

        {/*
          Tile grid — responsive columns per §8.4 grid contract:
            <640px (mobile)  : 2 cols
            640-1024 (tablet): 3 cols
            >=1024 (desktop) : 4 cols

          Tailwind v4 stretch gotcha (DESIGN.md §7,
          memory/feedback_tailwind_v4_flex_items_stretch.md): Tailwind v4
          does NOT default `.flex` to `align-items: stretch`. `items-stretch`
          here tells the grid to stretch row tracks; child tile wrappers
          MUST also declare `h-full`.
        */}
        <section
          data-testid="tile-grid"
          aria-label="Show tiles"
          className="grid grid-cols-2 items-stretch gap-tile-gap sm:grid-cols-3 lg:grid-cols-4"
        >
          {/*
            Tile mounts. LodgingTile may return null (whole-tile-missing
            reflow per §8.3) — that's intentional and verified by the e2e
            suite.
          */}
          <LodgingTile hotelReservations={data.hotelReservations} />
          <VenueTile venue={data.show.venue} />
          <CrewTile crewMembers={data.crewMembers} />
          <ContactsTile contacts={data.contacts} />
          {(() => {
            const today = new Date();
            const transportVisible = transportTileVisible({
              transportation: data.transportation,
              viewerName: data.viewerName,
              isAdmin: ctx.isAdmin,
            });
            return (
              <>
                <ScheduleTile
                  show={data.show}
                  dateRestriction={ctx.dateRestriction}
                  today={today}
                />
                <AudioScopeTile
                  rooms={data.rooms}
                  viewerFlags={ctx.viewerFlags}
                />
                <VideoScopeTile
                  rooms={data.rooms}
                  viewerFlags={ctx.viewerFlags}
                />
                <LightingScopeTile
                  rooms={data.rooms}
                  viewerFlags={ctx.viewerFlags}
                />
                <TransportTile
                  transportation={data.transportation}
                  visible={transportVisible}
                />
                {/*
                  ShowStatusTile (Task 4.8 / AC-4.1) — public, every-crew
                  surface. Renders coi_status + dress code + venue notes.
                */}
                <ShowStatusTile show={data.show} />
                {/*
                  FinancialsTile (Task 4.8 / AC-4.2) — LEAD/admin only.
                  Defense in depth: the projection already gates by
                  isLead, AND the tile re-checks the canonical
                  financialsVisible predicate.
                */}
                <FinancialsTile
                  financials={data.financials}
                  viewerFlags={ctx.viewerFlags}
                  isAdmin={ctx.isAdmin}
                />
                {/*
                  PackListTile — visibility decided by
                  lib/visibility/packList.ts predicate.
                */}
                <PackListTile
                  pullSheet={data.pullSheet}
                  show={data.show}
                  stageRestriction={ctx.stageRestriction}
                  today={today}
                />
                {/*
                  NotesTile — aggregates every block-level `notes` field
                  into a single "Things to know" tile.
                */}
                <NotesTile
                  show={data.show}
                  hotelReservations={data.hotelReservations}
                  rooms={data.rooms}
                  transportation={data.transportation}
                  contacts={data.contacts}
                />
              </>
            );
          })()}
        </section>
      </main>
      <Footer asOf={null} />
    </>
  );
}
