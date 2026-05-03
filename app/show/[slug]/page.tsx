/**
 * app/show/[slug]/page.tsx — per-show crew page (Task 4.2 layout shell,
 * plan lines 188-194).
 *
 * Identity-only mock contract (plan preamble line 179, AGENTS.md §1.7):
 * the page reads ONLY `?crew` and `?as` from searchParams. `?role` is
 * IGNORED even if present — a static-analysis vitest test
 * (tests/data/show-page-role-spoof.test.ts) greps this file for any form
 * of role-bearing searchParams access and fails the build if one appears.
 * Permitted reads: `?crew`, `?as`. Banned read: a role-bearing key. M5
 * replaces this mock with the real cookie-bound auth chain; the
 * getShowForViewer contract stays identity-only either way.
 *
 * Slug → showId resolution: a single SELECT against `public.shows.slug`
 * via the service-role client. The route uses service-role at this
 * milestone (matches Task 4.3's getShowForViewer choice; M5 widens to
 * a cookie-bound client once redeemed-link sessions exist). 404 via
 * Next.js notFound() if the slug doesn't resolve.
 *
 * Error handling: getShowForViewer throws "LINK_NO_CREW_MATCH" on
 * cross-show mismatch (a ?crew=<id> from a different show). At this
 * milestone we catch the error and return notFound() — the human "this
 * link doesn't look right" message will route through lib/messages/
 * lookup.ts in a future task (Task 4.14). UI never shows raw error
 * codes per AGENTS.md §1.5.
 *
 * Server Component. No `'use client'`. Tile components, the actual
 * RightNowCard logic, the realtime bridge, and the empty-state predicates
 * are all out of scope for Task 4.2 — placeholders here keep the layout
 * structure visible and let the e2e test exercise the page-shell /
 * tile-grid / footer chain end-to-end.
 */
import { notFound } from "next/navigation";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { ContactsTile } from "@/components/tiles/ContactsTile";
import { CrewTile } from "@/components/tiles/CrewTile";
import { LodgingTile } from "@/components/tiles/LodgingTile";
import { ScheduleTile } from "@/components/tiles/ScheduleTile";
import { VenueTile } from "@/components/tiles/VenueTile";
import {
  getShowForViewer,
  type Viewer,
  type ShowForViewer,
} from "@/lib/data/getShowForViewer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

// Identity-only searchParams shape. NOTE: `role` is intentionally absent
// from this type. If you find yourself adding it, stop — the static-
// analysis test will fail, and the §7.4 contract will break. The mock
// supplies IDENTITY only; role is freshly derived inside getShowForViewer
// from crew_members.role_flags on every call.
type SearchParams = { crew?: string; as?: string };

/**
 * Map identity-only searchParams to a Viewer.
 *
 * Precedence: `?as=admin` wins over `?crew` (admins MAY also pass a
 * `?crew=<id>` to preview a specific viewer's perspective; that's
 * Task 10.8's `admin_preview` viewer, out of scope here — at this
 * milestone, `?as=admin` always resolves to the bare admin viewer).
 *
 * No identity = unauthenticated (returns null). The page renders
 * notFound() in that branch — production will redirect to the §7.2
 * sign-in flow once M5 wires real auth.
 */
function deriveViewer(searchParams: SearchParams): Viewer | null {
  if (searchParams.as === "admin") return { kind: "admin" };
  if (searchParams.crew) {
    return { kind: "crew", crewMemberId: searchParams.crew };
  }
  return null;
}

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

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
};

export default async function ShowPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const viewer = deriveViewer(sp);
  if (!viewer) {
    // No identity supplied. Production will redirect to /signin via M5;
    // at this milestone we 404 so the unauthenticated probe doesn't leak
    // a render path. The Playwright spec passes ?crew=… so this branch
    // is not exercised by the test.
    notFound();
  }

  const showId = await resolveShowIdFromSlug(slug);
  if (!showId) {
    notFound();
  }

  let data: ShowForViewer;
  try {
    data = await getShowForViewer(showId, viewer);
  } catch (err) {
    // LINK_NO_CREW_MATCH (cross-show fail-closed §7.2.2 step 5) and any
    // other lookup error route through notFound() at this milestone. The
    // human-copy lookup (lib/messages/lookup.ts) is Task 4.14's surface;
    // for the layout shell, notFound is the safe default. UI never shows
    // raw error codes per AGENTS.md §1.5.
    // TODO(Task 4.14): replace with a human-copy error page once
    // lib/messages/lookup.ts exists.
    void err;
    notFound();
  }

  return (
    <>
      <Header show={data.show} />
      <main
        data-testid="page-container"
        className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-(--spacing-section-gap) px-4 py-6 sm:px-8 sm:py-8"
      >
        {/*
          RightNowCard slot — placeholder for Task 4.11. The real component
          will render the live state ("Today: Show day 2 of 3") with a
          crossfade between work-phase modes (DESIGN.md §5.1 --duration-slow,
          spec §8.2). At this milestone the slot exists so AC-4.4 (Task 4.13)
          can assert the card width === page-container width to within 0.5px,
          and so the mobile layout has its primary moment occupy real
          vertical space rather than collapsing.

          Layout note: padded one step above tile padding (§3.1 cascade —
          24px > 20px tile pad > 16px tile gap) so it reads as the page's
          primary moment, not just another tile.
        */}
        <section
          data-testid="right-now-card"
          aria-label="Right now"
          className="rounded-md border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(20,18,12,0.04)]"
        >
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent-on-bg">
            <span
              aria-hidden="true"
              className="mr-2 inline-block size-1.5 -translate-y-[1px] rounded-pill bg-accent align-middle"
            />
            Right now
          </p>
          <p className="mt-3 text-xl font-semibold text-text-strong sm:text-2xl">
            {data.show.title}
          </p>
          <p className="mt-1 text-sm text-text-subtle">
            Live tile loads in Task 4.11. Layout shell is in place.
          </p>
        </section>

        {/*
          Tile grid — responsive columns per §8.4 grid contract:
            <640px (mobile)  : 2 cols
            640-1024 (tablet): 3 cols
            >=1024 (desktop) : 4 cols

          IMPORTANT — Tailwind v4 stretch gotcha (DESIGN.md §7,
          memory/feedback_tailwind_v4_flex_items_stretch.md):
          Tailwind v4 does NOT default `.flex` to `align-items: stretch`,
          and the same caveat applies on grid containers when child
          wrappers don't explicitly fill the cell. `items-stretch` here
          tells the grid to stretch row tracks; child tile wrappers in
          subsequent tasks (4.4+) MUST also declare `h-full` to actually
          consume the stretched cell. The Task 4.13 layout-dimensions
          Playwright assertion verifies this end-to-end.
        */}
        <section
          data-testid="tile-grid"
          aria-label="Show tiles"
          className="grid grid-cols-2 items-stretch gap-(--spacing-tile-gap) sm:grid-cols-3 lg:grid-cols-4"
        >
          {/*
            Tile mounts. Real tiles per Task 4.4 (Lodging) land progressively;
            remaining placeholders cover the §8.4 row-stretch invariant
            until Tasks 4.4+ ship the rest. LodgingTile may return null
            (whole-tile-missing reflow per §8.3) — that's intentional and
            verified by the e2e suite.
          */}
          <LodgingTile hotelReservations={data.hotelReservations} />
          <VenueTile venue={data.show.venue} />
          <CrewTile crewMembers={data.crewMembers} />
          <ContactsTile contacts={data.contacts} />
          {/*
            ScheduleTile (Task 4.5) — viewer's per-day schedule. Reads
            the viewer's own dateRestriction off their crew row. For the
            admin viewer (no specific crew row) we treat the restriction
            as `kind: 'none'` so admins see every show day.
          */}
          {(() => {
            const viewerCrew =
              viewer.kind === "crew" || viewer.kind === "admin_preview"
                ? data.crewMembers.find((c) => c.id === viewer.crewMemberId)
                : null;
            const dateRestriction = viewerCrew
              ? viewerCrew.dateRestriction
              : { kind: "none" as const };
            return (
              <ScheduleTile
                show={data.show}
                dateRestriction={dateRestriction}
              />
            );
          })()}
        </section>
      </main>
      <Footer asOf={null} />
    </>
  );
}
