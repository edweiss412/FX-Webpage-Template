/**
 * app/me/page.tsx (M5 §B Task 5.10 — Opus's portion)
 *
 * Server Component. The cross-show signed-in landing surface for crew
 * members. Three responsibilities:
 *
 *   1. Identity gate. Calls the deliberately non-DRY identity helper.
 *      Unlike the show-bound Google validator (which resolves a
 *      crew_members.id under a specific show), validateGoogleIdentity
 *      returns ONLY cross-show identity ({ email, authUserId } where
 *      authUserId is the Supabase Auth user.id, not a per-show row).
 *      On `kind: 'continue'` (no session), redirect to
 *      /auth/sign-in?next=/me.
 *
 *   2. Per-viewer show enumeration. listShowsForCrew(viewer) joins
 *      crew_members → shows by canonical email and returns one
 *      CrewShowSummary per show, sorted by dates.set DESC. Empty
 *      array means the viewer's email isn't on any crew sheet — the
 *      empty-state branch handles this without crashing.
 *
 *   3. Render the show list as cards + a sign-out form. Each card
 *      links to /show/<slug>. Sign-out is a plain HTML form posting
 *      to /auth/sign-out (no client island needed).
 *
 * Per AGENTS.md invariant 5: every line of human-visible copy is
 * page chrome, written verbatim below. No raw §12.4 catalog codes
 * are surfaced — the /me page never depends on lib/messages/lookup.
 *
 * Date formatting: shares the same Date.UTC + en-US "Month D, YYYY"
 * shape as components/layout/Header.tsx (formatHeaderDate). The
 * helper is duplicated here intentionally — Header consumes the
 * typed ShowRow["dates"] union, while listShowsForCrew returns
 * `dates: unknown` (the value flows through JSONB). Centralising
 * would require widening Header's type signature, which the
 * milestone is explicitly scoped against (Header is M4 surface).
 *
 * CF2 carry-forward: validateGoogleIdentity currently `void req;` and
 * reads cookies/headers via createSupabaseServerClient directly. The
 * synthetic Request below is forward-compat — when CF2 is fixed, this
 * page keeps working without churn.
 */
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { validateGoogleIdentity } from "@/lib/auth/validateGoogleIdentity";
import { listShowsForCrew, type CrewShowSummary } from "@/lib/data/listShowsForCrew";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TerminalFailure } from "@/components/auth/TerminalFailure";
import {
  partitionMeShows,
  resolveDisplayDate,
  type PartitionedMeShow,
} from "@/lib/me/partitionMeShows";
import { nowDate } from "@/lib/time/now";
import { relativeDayChip } from "@/lib/time/relative";

// R14 (codex finding): the local pickShowDate helper accepted any
// non-empty string and rendered normalized bogus dates that Doug
// never typed (split-brain: partition used the valid fallback,
// render used the invalid earlier field). Replaced with
// `resolveDisplayDate` from lib/me/partitionMeShows.ts which gates
// every candidate through isIsoDate's strict YYYY-MM-DD round-trip
// check. Single source of truth for both partition + render.

/** Render an ISO date as "Month D, YYYY" — same shape as Header.tsx. */
function formatShowDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function MePage() {
  // Build a synthetic Request for forward-compat with the future CF2
  // fix. validateGoogleIdentity currently ignores `req` and reads
  // cookies/headers via createSupabaseServerClient directly — but a
  // future patch may consume it (e.g., to read x-pathname for
  // origin-derived redirect targets). Constructing it here means the
  // page keeps working under both behaviours.
  const h = await headers();
  const c = await cookies();
  const cookieHeader = c
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const req = new Request(`http://internal${h.get("x-pathname") ?? "/me"}`, {
    headers: { cookie: cookieHeader },
  });

  const result = await validateGoogleIdentity(req);
  if (result.kind === "continue") {
    redirect("/auth/sign-in?next=/me");
  }
  // R16 #4 + R21 F1 (round-21 §B MEDIUM): cataloged terminal-failure
  // render. R16 #4 first added it for the chain's terminal_failure arm
  // (replacing notFound() which browsers showed as 404 — indistinguishable
  // from "page doesn't exist"). R21 F1 also routes thrown infra failures
  // from listShowsForCrew through the same render so the data-load
  // throw doesn't escape to Next's generic error boundary.
  //
  // M11.5-IMP-3 (Block-2.1 2026-05-27): replaced inline <main>/<h1>/<p>/<Link>
  // block with the shared <TerminalFailure> component from
  // components/auth/TerminalFailure.tsx (landed in M11.5 §B C0 + extended
  // with optional `title` + `retryHref` props in c1936f2). The component
  // owns the dedupe of cataloged terminal-failure visual chrome across
  // show-page, picker-bootstrap, /me, and any other auth-chain terminal
  // surface. /me passes its own `title` because the default phrasing is
  // show-context-specific; /me's voice is "your shows" not "this show".

  if (result.kind === "terminal_failure") {
    return (
      <TerminalFailure
        code={result.code as never}
        title="We’re having trouble loading your shows"
        retryHref="/me"
      />
    );
  }

  const viewer = result.viewer;
  // M11.5 §B Task E2: the cookie-bound Supabase server client carries
  // the signed-in user's JWT so the RPC `my_share_tokens_for_email`
  // can read `auth.email()` canonically inside the SECURITY DEFINER
  // body. Service-role clients have NO JWT and would silently return
  // an empty set; lib/data/listShowsForCrew documents that contract.
  let shows;
  try {
    const supabase = await createSupabaseServerClient();
    shows = await listShowsForCrew(supabase);
  } catch {
    return (
      <TerminalFailure
        code="ADMIN_SESSION_LOOKUP_FAILED"
        title="We’re having trouble loading your shows"
        retryHref="/me"
      />
    );
  }

  // R2 finding (M11 Phase C): resolve `now` once via the request-scoped
  // time utility and prop-thread it through MeShowSections so partition
  // + chip math share a single deterministic reference. Replaces the
  // previous render-side `const now = new Date()` inside MeShowSections,
  // which the C.4 grep guard had not yet covered (app/me was missing
  // from the fallback scan roots).
  const now = await nowDate();

  return (
    <main data-testid="me-page" className="mx-auto max-w-2xl px-4 py-section-gap text-text sm:px-8">
      <header data-testid="me-page-header" className="mb-section-gap">
        <h1 className="text-3xl font-bold text-text-strong">My shows</h1>
        <p data-testid="me-signed-in-as" className="mt-2 text-base text-text-subtle">
          Signed in as <span className="font-medium text-text">{viewer.email}</span>
        </p>
        <form data-testid="me-sign-out-form" action="/auth/sign-out" method="POST" className="mt-3">
          <button
            data-testid="me-sign-out-button"
            type="submit"
            className="inline-flex min-h-tap-min items-center px-2 text-sm text-text-subtle underline underline-offset-2 hover:text-text"
          >
            Sign out
          </button>
        </form>
      </header>

      {shows.length === 0 ? (
        <div data-testid="me-empty-state" className="py-12 text-center text-base text-text-subtle">
          <p>You&rsquo;re not on any shows under this Google account.</p>
          <p className="mt-2">
            If you signed in with the wrong account, sign out and try again with the address Doug
            used for your crew sheet. Otherwise, ask Doug to add you.
          </p>
        </div>
      ) : (
        <MeShowSections shows={shows} now={now} />
      )}
    </main>
  );
}

/**
 * Render the partitioned NEXT UP / UPCOMING / PAST sections per shape brief
 * §5.1. Pure render function over the partition output; no I/O. Today is
 * resolved once here so all three sections share the same reference (chip
 * labels and partition use identical comparisons).
 */
function MeShowSections({ shows, now }: { shows: readonly CrewShowSummary[]; now: Date }) {
  const { featured, upcoming, past, undated } = partitionMeShows(shows, now);

  // R11 (codex finding): the only true empty state is shows.length === 0,
  // handled in the parent. If we're here AND featured is null AND undated
  // is empty, something dropped a show without surfacing it — render a
  // diagnostic placeholder so the user isn't stranded.
  if (!featured && undated.length === 0) {
    return (
      <div data-testid="me-no-dated-shows" className="py-12 text-center text-base text-text-subtle">
        <p>Your shows are missing dates. Doug will fill them in.</p>
      </div>
    );
  }

  return (
    <div data-testid="me-show-sections" className="flex flex-col gap-section-gap">
      {featured && (
        <section data-testid="me-next-up" aria-labelledby="me-next-up-heading">
          <h2
            id="me-next-up-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
          >
            Next up
          </h2>
          <NextUpCard entry={featured} now={now} />
        </section>
      )}

      {upcoming.length > 0 && (
        <section data-testid="me-upcoming" aria-labelledby="me-upcoming-heading">
          <h2
            id="me-upcoming-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
          >
            Upcoming
          </h2>
          <ul className="flex flex-col gap-2">
            {upcoming.map((entry) => (
              <ShowListRow key={entry.show.id} entry={entry} now={now} />
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <details data-testid="me-past" className="group">
          <summary
            data-testid="me-past-summary"
            className="cursor-pointer list-none text-xs font-semibold uppercase tracking-eyebrow text-text-subtle hover:text-text"
          >
            Past ({past.length}){" "}
            <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-90">
              ▸
            </span>
          </summary>
          <ul data-testid="me-past-list" className="mt-3 flex flex-col gap-2">
            {past.map((entry) => (
              <ShowListRow key={entry.show.id} entry={entry} now={now} />
            ))}
          </ul>
        </details>
      )}

      {/*
        R11 (codex finding): undated shows render in their own section
        so the user retains the link to the show even when Doug hasn't
        filled in dates yet. No chip (no chip-meaningful date), but
        same row chrome as Upcoming/Past — title + link target.
      */}
      {undated.length > 0 && (
        <section data-testid="me-undated" aria-labelledby="me-undated-heading">
          <h2
            id="me-undated-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
          >
            Date pending
          </h2>
          <ul data-testid="me-undated-list" className="flex flex-col gap-2">
            {undated.map((show) => (
              <UndatedShowRow key={show.id} show={show} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * R11: undated show row. Same compact chrome as ShowListRow but no
 * chip (no date to anchor) and no date label. Title + venue (when
 * present) + link to the show.
 */
function UndatedShowRow({ show }: { show: CrewShowSummary }) {
  const venueLabel = pickVenueLabel(show);
  return (
    <li>
      <Link
        data-testid={`me-show-card-${show.slug}`}
        href={`/show/${show.slug}/${show.shareToken}`}
        className="flex min-h-tap-min items-center gap-3 rounded-md border border-border bg-surface px-tile-pad py-3 transition-colors hover:border-border-strong"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-medium text-text-strong">{show.title}</div>
          {venueLabel && (
            <div className="mt-0.5 truncate text-xs text-text-subtle">{venueLabel}</div>
          )}
        </div>
      </Link>
    </li>
  );
}

/**
 * Featured card — emphasized vertical padding, larger title, accent chip
 * for relative-time. Brief §5.1: "Tomorrow" / "Today" use orange chip;
 * "In N days" uses neutral info chip; past uses no chip background.
 *
 * R2 F1 (codex finding): chip uses `entry.chipAnchor` (status-aware)
 * not the display date — for an active multi-day show with set=yesterday
 * + showDays=[today], chipAnchor = today → "Today", whereas display
 * date = yesterday would render "Ended" while crew are on-site.
 *
 * R2 F2 (codex finding): venue is now part of the brief's "Where am I
 * going next?" answer (Venue · Date). Surfaces show.venue.name when
 * present; gracefully omits when absent.
 */
function NextUpCard({ entry, now }: { entry: PartitionedMeShow; now: Date }) {
  const { show, chipAnchor } = entry;
  const isoDate = resolveDisplayDate(show.dates);
  const dateLabel = isoDate ? formatShowDate(isoDate) : null;
  const chip = relativeDayChip(chipAnchor, now);
  const chipTone = chipToneClass(chip);
  const venueLabel = pickVenueLabel(show);

  return (
    <Link
      data-testid={`me-show-card-${show.slug}`}
      href={`/show/${show.slug}/${show.shareToken}`}
      className="block rounded-md border border-border bg-surface p-tile-pad py-6 shadow-tile transition-colors hover:border-border-strong sm:py-8"
    >
      {chip && (
        <span
          data-testid="me-next-up-chip"
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${chipTone}`}
        >
          {chip}
        </span>
      )}
      <h3 className="mt-2 text-lg font-semibold text-text-strong sm:text-xl">{show.title}</h3>
      {(dateLabel || venueLabel) && (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-text-subtle">
          {venueLabel && <span>{venueLabel}</span>}
          {venueLabel && dateLabel && (
            <span aria-hidden="true" className="text-text-faint">
              ·
            </span>
          )}
          {dateLabel && isoDate && (
            <time dateTime={isoDate}>{dateLabel}</time>
          )}
        </p>
      )}
    </Link>
  );
}

/**
 * UPCOMING / PAST list row — compact 56px tap-target row with chip on the
 * right. Per brief §5.1: "regular list row, 56px tap target". R2 F1: chip
 * uses the partition's chipAnchor, not the display date — same fix as
 * NextUpCard.
 */
function ShowListRow({ entry, now }: { entry: PartitionedMeShow; now: Date }) {
  const { show, chipAnchor } = entry;
  const isoDate = resolveDisplayDate(show.dates);
  const dateLabel = isoDate ? formatShowDate(isoDate) : null;
  const chip = relativeDayChip(chipAnchor, now);
  const chipTone = chipToneClass(chip);
  const venueLabel = pickVenueLabel(show);

  return (
    <li>
      <Link
        data-testid={`me-show-card-${show.slug}`}
        href={`/show/${show.slug}/${show.shareToken}`}
        className="flex min-h-tap-min items-center justify-between gap-3 rounded-md border border-border bg-surface px-tile-pad py-3 transition-colors hover:border-border-strong"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-medium text-text-strong">{show.title}</div>
          {(venueLabel || dateLabel) && (
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-text-subtle">
              {venueLabel && <span className="truncate">{venueLabel}</span>}
              {venueLabel && dateLabel && (
                <span aria-hidden="true" className="text-text-faint">
                  ·
                </span>
              )}
              {dateLabel && isoDate && (
                <time dateTime={isoDate}>{dateLabel}</time>
              )}
            </div>
          )}
        </div>
        {chip && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${chipTone}`}
          >
            {chip}
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * Map a chip label to its chrome class per brief §5.1:
 *   "Today" / "Tomorrow"     → accent (the singular brand moment on /me)
 *   "In N days" / "In N weeks" → info-bg (neutral)
 *   "Ended …"                  → text-subtle, no background
 */
function chipToneClass(chip: string): string {
  if (chip === "Today" || chip === "Tomorrow") {
    return "bg-accent text-accent-text";
  }
  if (chip.startsWith("In ")) {
    return "bg-info-bg text-text";
  }
  // Ended / Ended N days ago / Ended N weeks ago
  return "text-text-subtle";
}

/**
 * R2 F2 (codex finding): the brief's /me card answers
 * "Where am I going next?" with `Venue · Date`. listShowsForCrew now
 * projects `shows.venue` so this surfaces the venue.name. Returns null
 * defensively when the venue is missing or doesn't carry a name —
 * the row gracefully collapses to title + date only.
 */
function pickVenueLabel(show: CrewShowSummary): string | null {
  return show.venue?.name ?? null;
}
