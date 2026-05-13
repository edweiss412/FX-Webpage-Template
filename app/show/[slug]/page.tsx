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
 *     2. validateLinkSession(req)    — FXAV session cookie path
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
 * no DB hit). When `envelope.show_id !== showId`, we OR-aggregate the
 * clear-cookie flag before admin precedence can short-circuit the link
 * validator. Non-admin paths still let `validateLinkSession` perform the
 * server-side cleanup before the clear-session hop.
 *
 * Admin-precedence skip-link-validator: per plan §276, when admin
 * precedence wins we DO NOT run validateLinkSession. A valid same-show link
 * cookie is left in place (still valid for crew-mode use later). Malformed
 * or wrong-show cookies are cleared client-side through the clear-session
 * route, but the admin path intentionally avoids destructive DB cleanup.
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
import { AudioScopeTileView, loadAudioScopeTileData } from "@/components/tiles/AudioScopeTile";
import { ContactsTileView, loadContactsTileData } from "@/components/tiles/ContactsTile";
import { CrewTileView, loadCrewTileData } from "@/components/tiles/CrewTile";
import { DiagramsTileView, loadDiagramsTileData } from "@/components/tiles/DiagramsTile";
import { FinancialsTileView, loadFinancialsTileData } from "@/components/tiles/FinancialsTile";
import {
  LightingScopeTileView,
  loadLightingScopeTileData,
} from "@/components/tiles/LightingScopeTile";
import { LodgingTileView, loadLodgingTileData } from "@/components/tiles/LodgingTile";
import { NotesTileView, loadNotesTileData } from "@/components/tiles/NotesTile";
import { OpeningReelTileView, loadOpeningReelTileData } from "@/components/tiles/OpeningReelTile";
import { PackListTileView, loadPackListTileData } from "@/components/tiles/PackListTile";
import { ScheduleTileView, loadScheduleTileData } from "@/components/tiles/ScheduleTile";
import { ShowStatusTileView, loadShowStatusTileData } from "@/components/tiles/ShowStatusTile";
import { TransportTileView, loadTransportTileData } from "@/components/tiles/TransportTile";
import { VenueTileView, loadVenueTileData } from "@/components/tiles/VenueTile";
import { VideoScopeTileView, loadVideoScopeTileData } from "@/components/tiles/VideoScopeTile";
import { WrappedTile } from "@/components/shared/WrappedTile";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { decodeSessionCookieValue } from "@/lib/auth/cookies";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { AdminInfraError, requireAdmin } from "@/lib/auth/requireAdmin";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";
import { getShowForViewer, type Viewer, type ShowForViewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { messageFor } from "@/lib/messages/lookup";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Resolve a slug to {id, published} via a single bound SELECT.
 *
 * R10 #1 (round-9 §A+§B HIGH): the page used to fetch only `id` and ran
 * the auth chain (incl. validateLinkSession's `last_active_at` UPDATE
 * side effect) before the only non-admin published-show check inside
 * `getShowForViewer`. Two problems: (a) response shape distinguished
 * 'unpublished but exists' from 'unknown slug' for non-admin viewers,
 * leaking unpublished-show existence; (b) stale link sessions for
 * later-unpublished shows still got their last_active_at refreshed.
 * Returning published alongside id lets resolveViewer short-circuit
 * non-admin requests on unpublished shows BEFORE link/google validators
 * run, with notFound() as the indistinguishable response.
 */
type SlugResolution =
  | { kind: "found"; id: string; published: boolean }
  | { kind: "not_found" }
  | { kind: "infra_error"; code: "ADMIN_SESSION_LOOKUP_FAILED" };

/**
 * R21 F2 (round-21 §B MEDIUM): pre-fix this threw on res.error AND on
 * thrown infra faults from createSupabaseServiceRoleClient() / the
 * awaited .from(...).maybeSingle() — both bypassed the cataloged
 * terminal-failure render path used elsewhere in the show page chain
 * and escaped to Next's generic error surface. Same infra-as-framework-
 * error class the milestone closed in the auth helpers, on a pre-chain
 * data loader. Now: discriminated union; call site renders the existing
 * cataloged ADMIN_SESSION_LOOKUP_FAILED block on the infra arm.
 */
async function resolveShowFromSlug(slug: string): Promise<SlugResolution> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const res = await supabase.from("shows").select("id,published").eq("slug", slug).maybeSingle();
    if (res.error) {
      return { kind: "infra_error", code: "ADMIN_SESSION_LOOKUP_FAILED" };
    }
    if (!res.data) return { kind: "not_found" };
    const id = res.data.id as string | undefined;
    if (!id) return { kind: "not_found" };
    return { kind: "found", id, published: Boolean(res.data.published) };
  } catch {
    return { kind: "infra_error", code: "ADMIN_SESSION_LOOKUP_FAILED" };
  }
}

/**
 * Build a synthetic Request whose `headers.cookie` carries the live cookie
 * store. The synthetic Request is currently consumed only by
 * `validateLinkSession`; `validateGoogleSession` and `isAdminSession`
 * ignore their `req` parameter (`void req;` at the top of each) and read
 * from `cookies()` / `headers()` from `next/headers` directly via their
 * Supabase server-client helpers. The synthetic Request is still wired
 * through every validator for forward-compatibility — if §A migrates
 * those two validators to honor `req.headers.get('cookie')`, no chain
 * adapter changes are needed. Tracked as carry-forward CF2.
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
  /**
   * Round-10 §A HIGH: signed-in Google users with no crew row on this
   * show would loop between /show/<slug> and /auth/sign-in?next=
   * /show/<slug>. The §A workaround treats GOOGLE_NO_CREW_MATCH (403)
   * as "continue" so requireAdmin gets a final chance, but if no
   * viewer ultimately resolves the bare no-viewer redirect to
   * sign-in collides with sign-in's already-authenticated guard.
   * Track the GOOGLE_NO_CREW_MATCH outcome distinctly so the page can
   * route those users to /me (which lists shows they actually have
   * access to) instead of the looping sign-in path.
   */
  googleNoCrewMatch: boolean;
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
type RequireAdminOutcome =
  | { kind: "confirmed" }
  | { kind: "drift" }
  | { kind: "infra"; code: string };

async function tryRequireAdmin(): Promise<RequireAdminOutcome> {
  try {
    await requireAdmin();
    return { kind: "confirmed" };
  } catch (e) {
    // R19 F2 (round-19 §A+§B HIGH): pre-fix tryRequireAdmin only
    // swallowed Next navigation-control digests (notFound/forbidden)
    // and rethrew everything else. R17 #1 introduced AdminInfraError
    // for infra failures, so a transient getUser/RPC failure inside
    // requireAdmin escaped both step-1 admin-precedence and step-4
    // fallback into Next's generic error boundary instead of becoming
    // a cataloged terminalFailure 500 with ADMIN_SESSION_LOOKUP_FAILED
    // copy via the show-page chain. Catch the infra error here and
    // surface as the infra arm; the chain converts it to terminalFailure.
    if (e instanceof AdminInfraError) {
      return { kind: "infra", code: e.code };
    }
    // requireAdmin raises via `notFound()` / `forbidden()`. Both produce
    // an Error whose `digest` is `NEXT_HTTP_ERROR_FALLBACK;<status>` per
    // node_modules/next/dist/client/components/http-access-fallback/
    // http-access-fallback.js. Only swallow those navigation-control
    // throws — they signal EXPECTED drift between `isAdminSession`
    // (predicate) and `requireAdmin` (chokepoint).
    const digest = (e as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;")) {
      return { kind: "drift" };
    }
    throw e;
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
  published: boolean,
): Promise<ChainResolution> {
  let clearCookie = false;
  let viewer: Viewer | null = null;
  let googleNoCrewMatch = false;

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
  const cookieIsForWrongShow = cookieEnvelope !== null && cookieEnvelope.show_id !== showId;
  // A cookie that's present but FAILED to decode is also "needs clearing"
  // (parse/format fault) — set clearCookie now so the chain emits the marker
  // even if admin precedence resolves first.
  const cookiePresentButMalformed = sessionCookieRaw !== undefined && cookieEnvelope === null;
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
    const adminOutcome = await tryRequireAdmin();
    if (adminOutcome.kind === "confirmed") {
      viewer = { kind: "admin" };
    } else if (adminOutcome.kind === "infra") {
      // R19 F2: requireAdmin's AdminInfraError surfaces here as a
      // structured infra outcome — convert to the chain's terminalFailure
      // arm so the page renders the cataloged 500 path instead of letting
      // the throw escape into Next's generic error boundary.
      return {
        viewer: null,
        clearCookie,
        terminalFailure: { status: 500, code: adminOutcome.code },
        googleNoCrewMatch: false,
      };
    }
    // kind === "drift": isAdminSession and requireAdmin disagreed —
    // fall through to the next chain step.
  } else if (admin.reason === "infra_error") {
    // R16 #3 (round-15 §B HIGH): isAdminSession's R15 #3 infra_error
    // arm was added but this show-page chain only checked admin.ok and
    // fell through. A Supabase Auth or is_admin RPC outage was
    // therefore silently treated as "ordinary not-admin" — the chain
    // ran link/google validators on the failing infra and ultimately
    // redirected to sign-in or /me, masking the server-side fault.
    // Now we surface the infra fault distinctly via terminalFailure
    // so the page renders the catalog-error path instead.
    return {
      viewer: null,
      clearCookie,
      terminalFailure: { status: 500, code: "ADMIN_SESSION_LOOKUP_FAILED" },
      googleNoCrewMatch: false,
    };
  }

  // R10 #1 (round-9 §A+§B HIGH): non-admin viewers must NOT trigger the
  // link/google validators against an unpublished show. The validators
  // have side effects (validateLinkSession refreshes last_active_at on
  // matching link_sessions rows) and their differing failure responses
  // leak unpublished-show existence. Short-circuit to notFound() —
  // indistinguishable from unknown slug — before any chain side effect
  // can fire. Admin viewers (resolved at step 1 above) bypass this gate
  // and continue to render drafts.
  if (!viewer && !published) {
    notFound();
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
        googleNoCrewMatch: false,
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
    } else if (google.kind === "continue") {
      if (google.code === "GOOGLE_NO_CREW_MATCH") {
        googleNoCrewMatch = true;
      }
    } else if (google.kind === "terminal_failure") {
      return {
        viewer: null,
        clearCookie,
        terminalFailure: { status: google.status, code: google.code },
        googleNoCrewMatch: false,
      };
    }
    // continue: record GOOGLE_NO_CREW_MATCH, otherwise nothing to OR
    // (validateGoogleSession's continue arm has no clearCookie flag).
  }

  // (4) requireAdmin fallback — preserved per spec for non-OAuth admin
  // auth shapes. We can only reach this when isAdminSession returned
  // false at step 1; requireAdmin is more conservative (uses the
  // cookie-bound Supabase client + is_admin RPC) so the dual gate
  // catches any drift in the OTHER direction (admin via build-time
  // chokepoint that isAdminSession's predicate missed).
  if (!viewer) {
    const adminFallback = await tryRequireAdmin();
    if (adminFallback.kind === "confirmed") {
      viewer = { kind: "admin" };
    } else if (adminFallback.kind === "infra") {
      // R19 F2: same conversion at the step-4 fallback site.
      return {
        viewer: null,
        clearCookie,
        terminalFailure: { status: 500, code: adminFallback.code },
        googleNoCrewMatch: false,
      };
    } else {
      if (googleNoCrewMatch) {
        // A real Google session exists, but not for this show. Redirect
        // to /me so the user can pick an accessible show or sign out.
        return {
          viewer: null,
          clearCookie,
          terminalFailure: null,
          googleNoCrewMatch: true,
        };
      }
    }
  }

  return { viewer, clearCookie, terminalFailure: null, googleNoCrewMatch };
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ShowPage({ params }: PageProps) {
  const { slug } = await params;

  const showInfo = await resolveShowFromSlug(slug);
  if (showInfo.kind === "infra_error") {
    // R21 F1 (round-21 §B MEDIUM): pre-chain slug-lookup infra failure
    // — render the same cataloged terminal-failure block the chain
    // emits for ADMIN_SESSION_LOOKUP_FAILED downstream. Pre-fix the
    // throw escaped to Next's generic error surface; the user saw an
    // opaque framework error instead of the catalog copy + retry link.
    const entry = messageFor(showInfo.code as never);
    return (
      <main
        data-testid="show-page-terminal-failure"
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
      >
        <h1 className="text-2xl font-bold text-text-strong">
          We&rsquo;re having trouble loading this show
        </h1>
        <p className="mt-4 text-base text-text-subtle">
          {entry.crewFacing ?? entry.dougFacing ?? "Please try again in a moment."}
        </p>
        <a
          href={`/show/${slug}`}
          className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
        >
          Try again
        </a>
      </main>
    );
  }
  if (showInfo.kind === "not_found") {
    notFound();
  }
  const { id: showId, published } = showInfo;

  const req = await buildRequestForChain();
  const result = await resolveViewer(req, showId, published);

  // Round-10 §A HIGH: signed-in Google user with no crew row on this
  // show resolves with no viewer. Redirecting to
  // /auth/sign-in?next=/show/<slug> would collide with sign-in's
  // already-authenticated guard and loop the browser. Send to /me
  // instead — it lists shows the user actually has access to and the
  // empty-state path renders cleanly when none match.
  if (!result.viewer && result.googleNoCrewMatch) {
    // R14 #3 (round-13 §B MEDIUM): if a stale/revoked/wrong-show
    // link cookie set clearCookie before the chain reached the
    // Google validator, the cleanup must still happen on this
    // response. Pre-R14 the bare redirect to /me bypassed the
    // /auth/clear-session hop, leaving the stale cookie in place
    // and requiring an extra round-trip to recover. Route through
    // clear-session?next=/me so the Set-Cookie clear lands on the
    // same response cycle.
    if (result.clearCookie) {
      redirect(`/auth/clear-session?next=${encodeURIComponent("/me")}`);
    }
    redirect("/me");
  }

  if (result.terminalFailure) {
    // AC-5.6a: a terminal_failure that ALSO carries `clearCookie: true`
    // (e.g. LINK_SESSION_KEY_ROTATED) must clear the stale cookie on the
    // FIRST response — not leave it in place until the user retries.
    // Redirect through /auth/clear-session before the catalog/error
    // path so the Set-Cookie clear lands on the same response cycle.
    if (result.clearCookie) {
      const target = `/show/${slug}`;
      redirect(`/auth/clear-session?next=${encodeURIComponent(target)}`);
    }
    // R17 #5 (round-16 §B HIGH): pre-fix every terminal_failure
    // rendered as notFound() — browsers showed 404, indistinguishable
    // from "page doesn't exist." Crew got no signal that the server
    // was having trouble; operators got the 404 in access logs instead
    // of a real 500-class signal. Render a cataloged error block
    // matching /me's R16 #4 shape so the user sees real failure state
    // with retry guidance.
    const entry = messageFor(result.terminalFailure.code as never);
    return (
      <main
        data-testid="show-page-terminal-failure"
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
      >
        <h1 className="text-2xl font-bold text-text-strong">
          We&rsquo;re having trouble loading this show
        </h1>
        <p className="mt-4 text-base text-text-subtle">
          {entry.crewFacing ?? entry.dougFacing ?? "Please try again in a moment."}
        </p>
        <a
          href={`/show/${slug}`}
          className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
        >
          Try again
        </a>
      </main>
    );
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
    const target = result.viewer ? selfPath : `/auth/sign-in?next=${encodeURIComponent(selfPath)}`;
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
    // R18 #4 (round-17 §B HIGH): pre-fix every getShowForViewer throw
    // mapped to notFound(). getShowForViewer throws TWO classes:
    //   - LINK_NO_CREW_MATCH (cross-show fail-closed §7.2.2 step 5) —
    //     genuine auth-deny: this user shouldn't see this show.
    //   - "getShowForViewer: <table> fetch failed: ..." — infra fault
    //     (DB/PostgREST outage on crew/show/hotel/room reads).
    // Conflating them rendered DB outages as 404 indistinguishable
    // from "wrong show," so operators saw 404s in access logs instead
    // of real 500-class signals and crew got no recovery cue. Classify
    // by error.message.
    const message = err instanceof Error ? err.message : String(err);
    if (message === "LINK_NO_CREW_MATCH") {
      notFound();
    }
    const entry = messageFor("ADMIN_SESSION_LOOKUP_FAILED" as never);
    return (
      <main
        data-testid="show-page-data-failure"
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
      >
        <h1 className="text-2xl font-bold text-text-strong">
          We&rsquo;re having trouble loading this show
        </h1>
        <p className="mt-4 text-base text-text-subtle">
          {entry.crewFacing ?? entry.dougFacing ?? "Please try again in a moment."}
        </p>
        <a
          href={`/show/${slug}`}
          className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
        >
          Try again
        </a>
      </main>
    );
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
      <ShowRealtimeBridge showId={showId} slug={slug} renderVersion={data.viewerVersionToken} />
      <main
        data-testid="page-container"
        className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-section-gap px-4 py-6 sm:p-8"
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
          <WrappedTile
            tileId="lodging-tile"
            showId={showId}
            load={() => loadLodgingTileData({ hotelReservations: data.hotelReservations })}
            View={LodgingTileView}
          />
          <WrappedTile
            tileId="venue-tile"
            showId={showId}
            load={() => loadVenueTileData({ venue: data.show.venue })}
            View={VenueTileView}
          />
          <WrappedTile
            tileId="crew-tile"
            showId={showId}
            load={() => loadCrewTileData({ crewMembers: data.crewMembers })}
            View={CrewTileView}
          />
          <WrappedTile
            tileId="contacts-tile"
            showId={showId}
            load={() => loadContactsTileData({ contacts: data.contacts })}
            View={ContactsTileView}
          />
          {(() => {
            const today = new Date();
            const transportVisible = transportTileVisible({
              transportation: data.transportation,
              viewerName: data.viewerName,
              isAdmin: ctx.isAdmin,
            });
            return (
              <>
                <WrappedTile
                  tileId="schedule-tile"
                  showId={showId}
                  load={() =>
                    loadScheduleTileData({
                      show: data.show,
                      dateRestriction: ctx.dateRestriction,
                      today,
                    })
                  }
                  View={ScheduleTileView}
                />
                <WrappedTile
                  tileId="audio-scope-tile"
                  showId={showId}
                  load={() =>
                    loadAudioScopeTileData({ rooms: data.rooms, viewerFlags: ctx.viewerFlags })
                  }
                  View={AudioScopeTileView}
                />
                <WrappedTile
                  tileId="video-scope-tile"
                  showId={showId}
                  load={() =>
                    loadVideoScopeTileData({ rooms: data.rooms, viewerFlags: ctx.viewerFlags })
                  }
                  View={VideoScopeTileView}
                />
                <WrappedTile
                  tileId="lighting-scope-tile"
                  showId={showId}
                  load={() =>
                    loadLightingScopeTileData({ rooms: data.rooms, viewerFlags: ctx.viewerFlags })
                  }
                  View={LightingScopeTileView}
                />
                <WrappedTile
                  tileId="transport-tile"
                  showId={showId}
                  load={() =>
                    loadTransportTileData({
                      transportation: data.transportation,
                      visible: transportVisible,
                    })
                  }
                  View={TransportTileView}
                />
                {/* ShowStatusTile (Task 4.8 / AC-4.1) — public, every-crew surface. */}
                <WrappedTile
                  tileId="show-status-tile"
                  showId={showId}
                  load={() => loadShowStatusTileData({ show: data.show })}
                  View={ShowStatusTileView}
                />
                {/* OpeningReelTile (M7 Task 7.9 / AC-7.3 / AC-7.25). */}
                <WrappedTile
                  tileId="opening-reel-tile"
                  showId={showId}
                  load={() =>
                    loadOpeningReelTileData({
                      showId,
                      eventDetails: data.show.event_details,
                      hasVideo: data.openingReelHasVideo,
                    })
                  }
                  View={OpeningReelTileView}
                />
                {/* DiagramsTile (M7 Task 7.9 / §10 / AC-7.1 / AC-7.2 / AC-7.2b / AC-7.4 / AC-7.7). */}
                <WrappedTile
                  tileId="diagrams-tile"
                  showId={showId}
                  load={() =>
                    loadDiagramsTileData({
                      showId,
                      diagrams: data.diagrams,
                      agendaLinks: data.show.agenda_links,
                    })
                  }
                  View={DiagramsTileView}
                />
                {/* FinancialsTile (Task 4.8 / AC-4.2) — LEAD/admin only. */}
                <WrappedTile
                  tileId="financials-tile"
                  showId={showId}
                  load={() =>
                    loadFinancialsTileData({
                      financials: data.financials,
                      viewerFlags: ctx.viewerFlags,
                      isAdmin: ctx.isAdmin,
                    })
                  }
                  View={FinancialsTileView}
                />
                {/* PackListTile — visibility decided by lib/visibility/packList.ts predicate. */}
                <WrappedTile
                  tileId="pack-list-tile"
                  showId={showId}
                  load={() =>
                    loadPackListTileData({
                      pullSheet: data.pullSheet,
                      show: data.show,
                      stageRestriction: ctx.stageRestriction,
                      today,
                    })
                  }
                  View={PackListTileView}
                />
                {/*
                  NotesTile — aggregates every block-level `notes` field.
                  Codex round-21 MEDIUM: gate `transportation` on
                  `transportVisible` to keep the privacy boundary local.
                */}
                <WrappedTile
                  tileId="notes-tile"
                  showId={showId}
                  load={() =>
                    loadNotesTileData({
                      show: data.show,
                      hotelReservations: data.hotelReservations,
                      rooms: data.rooms,
                      transportation: transportVisible ? data.transportation : null,
                      contacts: data.contacts,
                    })
                  }
                  View={NotesTileView}
                />
              </>
            );
          })()}
        </section>
      </main>
      <Footer
        asOf={null}
        showId={showId}
        showSlug={slug}
        reportAutocapture={{ rightNowState: rightNowCtx }}
        lastSyncedAt={data.lastSyncedAt}
        lastSyncStatus={data.lastSyncStatus}
      />
    </>
  );
}
