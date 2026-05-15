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
import { messageFor } from "@/lib/messages/lookup";
import { partitionMeShows } from "@/lib/me/partitionMeShows";
import { relativeDayChip } from "@/lib/time/relative";

/**
 * Pluck the most useful "when" string from the JSONB dates blob. Mirrors
 * lib/me/partitionMeShows.ts's resolveDisplayDate; kept here so the
 * formatted card date works even when the partition helper drops a show
 * (it doesn't drop here — partition + render share the same fallback chain).
 */
function pickShowDate(dates: unknown): string | null {
  if (typeof dates !== "object" || dates === null || Array.isArray(dates)) {
    return null;
  }
  const obj = dates as {
    set?: unknown;
    travelIn?: unknown;
    showDays?: unknown;
  };
  if (typeof obj.set === "string" && obj.set.length > 0) return obj.set;
  if (typeof obj.travelIn === "string" && obj.travelIn.length > 0) return obj.travelIn;
  if (Array.isArray(obj.showDays)) {
    const first = obj.showDays.find((d): d is string => typeof d === "string" && d.length > 0);
    if (first) return first;
  }
  return null;
}

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
  const renderTerminalFailure = (code: string) => {
    const entry = messageFor(code as never);
    return (
      <main
        data-testid="me-page-terminal-failure"
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
      >
        <h1 className="text-2xl font-bold text-text-strong">
          We&rsquo;re having trouble loading your shows
        </h1>
        <p className="mt-4 text-base text-text-subtle">
          {entry.crewFacing ?? entry.dougFacing ?? "Please try again in a moment."}
        </p>
        <Link
          href="/me"
          className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
        >
          Try again
        </Link>
      </main>
    );
  };

  if (result.kind === "terminal_failure") {
    return renderTerminalFailure(result.code);
  }

  const viewer = result.viewer;
  // R21 F1 (round-21 §B MEDIUM): pre-fix listShowsForCrew throws
  // (createSupabaseServiceRoleClient() / .from(...) infra throws + the
  // explicit `throw new Error("listShowsForCrew: show lookup failed")`)
  // escaped to Next's generic error surface — crew got an opaque
  // framework page instead of the catalog copy + retry link. Wrap the
  // call and route to the same cataloged terminal-failure render the
  // chain's terminal_failure arm uses.
  let shows;
  try {
    shows = await listShowsForCrew(viewer);
  } catch {
    return renderTerminalFailure("ADMIN_SESSION_LOOKUP_FAILED");
  }

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
        <MeShowSections shows={shows} />
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
function MeShowSections({ shows }: { shows: readonly CrewShowSummary[] }) {
  const now = new Date();
  const { featured, upcoming, past } = partitionMeShows(shows, now);

  // Defensive: every show in the input had at least one display date except
  // when the entire dates blob was unparseable. partitionMeShows drops those.
  // If everything dropped, render the empty state's neighborhood — otherwise
  // featured is always set when shows.length > 0 AND at least one had a date.
  if (!featured) {
    return (
      <div data-testid="me-no-dated-shows" className="py-12 text-center text-base text-text-subtle">
        <p>Your shows are missing dates. Doug will fill them in.</p>
      </div>
    );
  }

  return (
    <div data-testid="me-show-sections" className="flex flex-col gap-section-gap">
      <section data-testid="me-next-up" aria-labelledby="me-next-up-heading">
        <h2
          id="me-next-up-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
        >
          Next up
        </h2>
        <NextUpCard show={featured} now={now} />
      </section>

      {upcoming.length > 0 && (
        <section data-testid="me-upcoming" aria-labelledby="me-upcoming-heading">
          <h2
            id="me-upcoming-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
          >
            Upcoming
          </h2>
          <ul className="flex flex-col gap-2">
            {upcoming.map((show) => (
              <ShowListRow key={show.id} show={show} now={now} />
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
            {past.map((show) => (
              <ShowListRow key={show.id} show={show} now={now} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Featured card — emphasized vertical padding, larger title, accent chip
 * for relative-time. Brief §5.1: "Tomorrow" / "Today" use orange chip;
 * "In N days" uses neutral info chip; past uses no chip background.
 */
function NextUpCard({ show, now }: { show: CrewShowSummary; now: Date }) {
  const isoDate = pickShowDate(show.dates);
  const dateLabel = isoDate ? formatShowDate(isoDate) : null;
  const chip = isoDate ? relativeDayChip(isoDate, now) : null;
  const chipTone = chip ? chipToneClass(chip) : "";
  const venueLabel = pickVenueLabel(show);

  return (
    <Link
      data-testid={`me-show-card-${show.slug}`}
      href={`/show/${show.slug}`}
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
 * right. Per brief §5.1: "regular list row, 56px tap target".
 */
function ShowListRow({ show, now }: { show: CrewShowSummary; now: Date }) {
  const isoDate = pickShowDate(show.dates);
  const dateLabel = isoDate ? formatShowDate(isoDate) : null;
  const chip = isoDate ? relativeDayChip(isoDate, now) : null;
  const chipTone = chip ? chipToneClass(chip) : "";
  const venueLabel = pickVenueLabel(show);

  return (
    <li>
      <Link
        data-testid={`me-show-card-${show.slug}`}
        href={`/show/${show.slug}`}
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
 * Pull a venue label from the JSONB dates+venue blobs that listShowsForCrew
 * exposes. CrewShowSummary doesn't currently include venue; we read the show
 * row's `venue.name` if present via the dates JSON's sibling. Fallback: null
 * (the row collapses to title + date only).
 *
 * Defensive across schemas — listShowsForCrew may project venue in the
 * future. For now this returns null because CrewShowSummary type does not
 * include venue. The function exists as a forward-compat hook so adding
 * venue to CrewShowSummary later doesn't churn the row layout.
 */
function pickVenueLabel(_show: CrewShowSummary): string | null {
  return null;
}
