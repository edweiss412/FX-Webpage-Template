/**
 * app/show/[slug]/[shareToken]/page.tsx (M11.5 §B Task C1)
 *
 * The crew page route. Replaces the legacy slug-only `app/show/[slug]/page.tsx`.
 *
 * R35 amendment: the share-token is a required path segment, not a query
 * parameter — a slug-only URL hits Next's 404 at the file-system level
 * (no fallback render). The route owns auth resolution via
 * `resolveShowPageAccess` (lib/auth/picker/resolveShowPageAccess.ts) and
 * dispatches on the 11-arm discriminated union the helper returns.
 *
 * Surfaces consumed (Pin-2 contracts, all owned by §A / Codex):
 *   - resolveShowPageAccess — archived/admin/unpublished/Google-session/
 *     cookie chain
 *   - getShowForViewer       — render data for the admin/crew viewer
 *   - createSupabaseServiceRoleClient — roster read for picker render
 *
 * Components consumed (M11.5 §B):
 *   - TerminalFailure        — infra_error / data-load failures
 *   - SignInOrSkipGate       — no_auth first-contact + google_mismatch
 *   - PickerInterstitial     — picker render + stale-credential banners
 *   - ShowBody / IdentityChip — resolved + admin viewers
 *
 * Atomicity guard (P-R29 Fix-3):
 *   gateSkip (?gate=skip) is honored ONLY when reason === 'first_contact'.
 *   A hand-crafted `?gate=skip` on a `google_mismatch` URL re-renders
 *   the Mode-B gate; the only legal path to ?gate=skip on mismatch is
 *   the clearIdentityAndSkip Server Action that pairs cookie-clear with
 *   the redirect.
 *
 * P-R5 Fix-1: every external data load (`getShowForViewer`, `loadRoster`)
 * is wrapped in try/catch and routed to <TerminalFailure> on failure;
 * the page never throws an uncaught error into Next's generic boundary.
 */
import { notFound, redirect } from "next/navigation";

import { TerminalFailure } from "@/components/auth/TerminalFailure";
import { buildShowPageChainRequest } from "@/lib/auth/picker/showPageChainRequest";
import { resolveShowPageAccess } from "@/lib/auth/picker/resolveShowPageAccess";
import { ShowUnavailable } from "./ShowUnavailable";
import { getShowForViewer, CrewMemberNotInShowError, type Viewer } from "@/lib/data/getShowForViewer";
import { buildShowReturnUrl } from "@/lib/crew/buildShowReturnUrl";
import { BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sanitizePickerRoster } from "@/lib/auth/picker/sanitizePickerRoster";

import { CrewShell } from "./_CrewShell";
import { PickerInterstitial, type PickerInterstitialBannerCode } from "./_PickerInterstitial";
import { SignInOrSkipGate } from "./_SignInOrSkipGate";
import { staleBannerFor } from "./staleBanner";

type RosterRow = {
  id: string;
  name: string;
  role: string;
  role_flags: string[];
  claimed_via_oauth_at: string | null;
};

async function loadRoster(showId: string): Promise<RosterRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("crew_members")
    .select("id, name, role, role_flags, claimed_via_oauth_at")
    .eq("show_id", showId)
    .order("name", { ascending: true });
  if (error) throw new Error("roster lookup failed");
  return sanitizePickerRoster((data ?? []) as RosterRow[]);
}

async function loadShowAvailability(showId: string): Promise<"available" | "missing" | "archived" | "unpublished"> {
  const supabase = createSupabaseServiceRoleClient();
  // not-subject-to-meta: page.tsx-local read; {data,error} + fail-closed; covered by route tests (mirrors loadRoster)
  const { data, error } = await supabase
    .from("shows")
    .select("published, archived")
    .eq("id", showId)
    .maybeSingle();
  if (error) throw new Error("show availability lookup failed");
  // DISCRIMINATED — mirrors the existing published-toggle contract (page.tsx switch):
  // archived/missing 404; unpublished renders the paused-link page (HTTP 200), NOT a 404.
  if (!data) return "missing";
  if (data.archived === true) return "archived";
  if (data.published !== true) return "unpublished";
  return "available";
}

async function renderPickerRepick(args: {
  showId: string;
  slug: string;
  shareToken: string;
  s: string | undefined;
  banner: PickerInterstitialBannerCode | null;
  staleCleanupHint: { expectedEpoch: number; expectedCrewMemberId: string } | null;
  // Optional preloaded roster: renderRacedCrewMiss reads the roster ITSELF (to sequence it before the
  // final availability gate) and passes it here so the picker JSX stays single-sourced. undefined → read now.
  preloadedRoster?: RosterRow[];
}): Promise<React.ReactElement> {
  let roster = args.preloadedRoster;
  if (roster === undefined) {
    try {
      roster = await loadRoster(args.showId);
    } catch {
      return (
        <TerminalFailure
          code="PICKER_RESOLVER_LOOKUP_FAILED"
          retryHref={`/show/${args.slug}/${args.shareToken}`}
        />
      );
    }
  }
  return (
    <PickerInterstitial
      slug={args.slug}
      shareToken={args.shareToken}
      showId={args.showId}
      roster={roster}
      banner={args.banner}
      staleCleanupHint={args.staleCleanupHint}
      s={args.s}
    />
  );
}

// CRITICAL ORDERING (TOCTOU fix): read the roster FIRST, then re-check availability LAST — the final
// await before render. A show-delete cascade (crew_members.show_id ON DELETE CASCADE) that empties the
// roster between the two reads is then caught by the availability gate (→ notFound), never rendering an
// EMPTY picker for a deleted show.
// CRITICAL: notFound() throws a Next navigation sentinel (NEXT_NOT_FOUND) — it MUST NOT sit inside a
// try/catch that would convert it to a TerminalFailure. Each read's try/catch is scoped to the READ ONLY;
// notFound() / <ShowUnavailable /> / renderPickerRepick run OUTSIDE any catch, and callers invoke this
// helper with NO surrounding catch.
async function renderRacedCrewMiss(args: {
  showId: string;
  slug: string;
  shareToken: string;
  s: string | undefined;
}): Promise<React.ReactElement> {
  let roster: RosterRow[];
  try {
    roster = await loadRoster(args.showId); // FIRST — a cascade may have already emptied this to []
  } catch {
    return (
      <TerminalFailure
        code="PICKER_RESOLVER_LOOKUP_FAILED"
        retryHref={`/show/${args.slug}/${args.shareToken}`}
      />
    );
  }
  let availability: "available" | "missing" | "archived" | "unpublished";
  try {
    availability = await loadShowAvailability(args.showId); // LAST — final gate; reflects post-cascade state
  } catch {
    return (
      <TerminalFailure
        code="PICKER_RESOLVER_LOOKUP_FAILED"
        retryHref={`/show/${args.slug}/${args.shareToken}`}
      />
    );
  }
  // Mirror the published-toggle contract EXACTLY — outside every catch so notFound()'s sentinel propagates:
  //   missing (deleted/cascade) OR archived → notFound() (404)
  //   unpublished (paused link)             → <ShowUnavailable /> (HTTP 200, republish restores)
  //   available                             → guided re-pick
  if (availability === "missing" || availability === "archived") notFound();
  if (availability === "unpublished") return <ShowUnavailable />;
  return renderPickerRepick({
    ...args,
    banner: "PICKER_REMOVED_FROM_ROSTER_BANNER",
    staleCleanupHint: null,
    preloadedRoster: roster,
  });
}

export default async function ShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; shareToken: string }>;
  searchParams: Promise<{ gate?: string; s?: string }>;
}) {
  const { slug, shareToken } = await params;
  const { gate, s } = await searchParams;
  const gateSkip = gate === "skip";

  // Task 12 (R4-HIGH-1): the active-section deep-link, validated against the
  // allow-list ONLY for the redirect builders below (CrewShell receives the
  // RAW `s` as `rawSection` and resolves activeSection + Budget gate itself).
  const allowlistedS = [...BASE_SECTION_IDS, "budget"].includes(s ?? "") ? s : undefined;

  const req = await buildShowPageChainRequest();
  const result = await resolveShowPageAccess({ slug, shareToken, req });

  switch (result.kind) {
    case "archived":
      // R27: archived 404s for ALL viewers including admin — admins
      // debug archived shows via /admin/show/<slug>.
      notFound();
    // falls through (notFound() throws)

    case "unpublished":
      // Published-toggle D5/§3.5: a valid share-token URL whose show is toggled
      // off renders the zero-data paused page under HTTP 200 (the same link
      // works again on republish). Archived/unresolved arms keep notFound().
      return <ShowUnavailable />;

    case "show_unavailable":
      // Show was archived/unpublished after the cookie was minted, OR
      // the slug+token pair never resolved to a row. Either way the
      // crew route 404s — admins use the admin route.
      notFound();
    // falls through

    case "infra_error":
      return (
        <TerminalFailure code={result.code as never} retryHref={`/show/${slug}/${shareToken}`} />
      );

    case "needs_picker_bootstrap": {
      // Server Components cannot mint cookies; redirect to the Route
      // Handler that legally mutates `__Host-fxav_picker`. The intent
      // token (R41-R5 CSRF defense) is generated by the helper.
      const nextUrl = buildShowReturnUrl(slug, shareToken, { s: allowlistedS, gate });
      redirect(
        `/api/auth/picker-bootstrap?next=${encodeURIComponent(
          nextUrl,
        )}&t=${encodeURIComponent(result.intentToken)}`,
      );
    }

    case "admin": {
      const viewer: Viewer = { kind: "admin" };
      let data;
      try {
        data = await getShowForViewer(result.showId, viewer);
      } catch {
        return (
          <TerminalFailure
            code="PICKER_RESOLVER_LOOKUP_FAILED"
            retryHref={`/show/${slug}/${shareToken}`}
          />
        );
      }
      return (
        <CrewShell
          data={data}
          viewer={viewer}
          showId={result.showId}
          rawSection={s}
          slug={slug}
          shareToken={shareToken}
          identityChip={null}
        />
      );
    }

    case "resolved": {
      const viewer: Viewer = {
        kind: "crew",
        crewMemberId: result.crewMemberId,
      };
      let data;
      try {
        data = await getShowForViewer(result.showId, viewer);
      } catch (err) {
        // Point A (8.2 §4.1): a crew-row miss (raced removal OR show-delete
        // cascade) is a typed CrewMemberNotInShowError → guided re-pick after
        // re-validating show availability (renderRacedCrewMiss owns its own infra
        // catch + notFound()/ShowUnavailable). NO try/catch wraps that call — its
        // notFound() sentinel must escape. Any other error (infra, :317/:321 plain
        // Error) → TerminalFailure.
        if (err instanceof CrewMemberNotInShowError) {
          return renderRacedCrewMiss({ showId: result.showId, slug, shareToken, s: allowlistedS });
        }
        return (
          <TerminalFailure
            code="PICKER_RESOLVER_LOOKUP_FAILED"
            retryHref={`/show/${slug}/${shareToken}`}
          />
        );
      }
      // Point B: compute `crew` ONLY for a well-formed ARRAY projection.
      // `Array.isArray` — never optional chaining — is the guard: a degraded
      // TRUTHY non-array would throw "find is not a function" HERE (in the page
      // function, BEFORE React renders CrewShell) and bypass the real fail-closed
      // gate. Instead:
      //   - well-formed array + id present → CrewShell with the identity chip
      //   - well-formed array + id MISSING → guided re-pick (renderRacedCrewMiss)
      //   - non-array / malformed          → crew stays null; fall through to
      //     CrewShell, whose resolveViewerContext throws MalformedProjectionError
      //     → _CrewShell catch → cataloged TerminalFailure (existing contract).
      let crew: (typeof data.crewMembers)[number] | null = null;
      if (Array.isArray(data.crewMembers)) {
        crew = data.crewMembers.find((c) => c.id === result.crewMemberId) ?? null;
        if (!crew) {
          return renderRacedCrewMiss({ showId: result.showId, slug, shareToken, s: allowlistedS });
        }
      }
      return (
        <CrewShell
          data={data}
          viewer={viewer}
          showId={result.showId}
          rawSection={s}
          slug={slug}
          shareToken={shareToken}
          identityChip={crew ? { name: crew.name, role: crew.role, shareToken } : null}
        />
      );
    }

    case "no_auth": {
      // P-R29 Fix-3 atomicity guard: ?gate=skip is legal ONLY for
      // reason: 'first_contact'. For 'google_mismatch' the gate must
      // re-render — the user reaches ?gate=skip only via the
      // clearIdentityAndSkip Server Action, which clears the stale
      // entry in the same response.
      const allowGateSkip = gateSkip && result.reason === "first_contact";
      if (!allowGateSkip) {
        return (
          <SignInOrSkipGate
            slug={slug}
            shareToken={shareToken}
            showId={result.showId}
            reason={result.reason}
            s={allowlistedS}
          />
        );
      }
      let roster;
      try {
        roster = await loadRoster(result.showId);
      } catch {
        return (
          <TerminalFailure
            code="PICKER_RESOLVER_LOOKUP_FAILED"
            retryHref={`/show/${slug}/${shareToken}`}
          />
        );
      }
      return (
        <PickerInterstitial
          slug={slug}
          shareToken={shareToken}
          showId={result.showId}
          roster={roster}
          banner={null}
          staleCleanupHint={null}
          s={allowlistedS}
        />
      );
    }

    case "epoch_stale":
    case "removed_from_roster":
    case "selection_reset":
    case "identity_invalidated":
      // Shared picker-repick render. The resolver already live-validated show
      // availability for these kinds (resolvePickerSelection), so no availability
      // recheck here — that is exclusive to the resolved-case race (renderRacedCrewMiss).
      return renderPickerRepick({
        showId: result.showId,
        slug,
        shareToken,
        s: allowlistedS,
        banner: staleBannerFor(result.kind),
        staleCleanupHint: {
          expectedEpoch: result.expectedEpoch,
          expectedCrewMemberId: result.expectedCrewMemberId,
        },
      });

    default: {
      // assertNever exhaustiveness — typeScript errors at compile time
      // if any new kind is added to ResolveShowPageAccessResult and
      // this switch doesn't handle it.
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}
