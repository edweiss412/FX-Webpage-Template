/**
 * app/me/page.tsx (M5 §B Task 5.10 — Opus's portion)
 *
 * Server Component. The cross-show signed-in landing surface for crew
 * members. Three responsibilities:
 *
 *   1. Identity gate. Calls the deliberately-non-DRY-with-
 *      validateGoogleSession helper validateGoogleIdentity. Unlike
 *      validateGoogleSession (which is show-bound and resolves a
 *      crew_members.id under a specific show), validateGoogleIdentity
 *      returns ONLY cross-show identity ({ email, crewMemberId } where
 *      crewMemberId is the Supabase Auth user.id, not a per-show row).
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
import { notFound, redirect } from "next/navigation";

import { validateGoogleIdentity } from "@/lib/auth/validateGoogleIdentity";
import { listShowsForCrew, type CrewShowSummary } from "@/lib/data/listShowsForCrew";
import { messageFor } from "@/lib/messages/lookup";

/** Pluck the most useful "when" string from the JSONB dates blob. */
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
  if (result.kind === "terminal_failure") {
    // R15 #4: validator infra fault. Pre-fix every getUser/server-
    // client failure was downgraded to "continue" → redirect to
    // sign-in, masquerading as "you're not signed in." Now we
    // surface a server-error response so the user sees a real
    // failure state and operators get a 500-class signal.
    void messageFor(result.code as never);
    notFound();
  }

  const viewer = result.viewer;
  const shows = await listShowsForCrew(viewer);

  return (
    <main
      data-testid="me-page"
      className="mx-auto max-w-2xl px-4 py-section-gap text-text sm:px-8"
    >
      <header data-testid="me-page-header" className="mb-section-gap">
        <h1 className="text-3xl font-bold text-text-strong">My shows</h1>
        <p
          data-testid="me-signed-in-as"
          className="mt-2 text-base text-text-subtle"
        >
          Signed in as <span className="font-medium text-text">{viewer.email}</span>
        </p>
        <form
          data-testid="me-sign-out-form"
          action="/auth/sign-out"
          method="POST"
          className="mt-3"
        >
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
        <div
          data-testid="me-empty-state"
          className="py-12 text-center text-base text-text-subtle"
        >
          <p>You&rsquo;re not on any shows under this Google account.</p>
          <p className="mt-2">
            If you signed in with the wrong account, sign out and try again
            with the address Doug used for your crew sheet. Otherwise, ask
            Doug to add you.
          </p>
        </div>
      ) : (
        <ul
          data-testid="me-card-grid"
          className="grid gap-tile-gap sm:grid-cols-2 lg:grid-cols-3"
        >
          {shows.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </ul>
      )}
    </main>
  );
}

function ShowCard({ show }: { show: CrewShowSummary }) {
  const isoDate = pickShowDate(show.dates);
  const dateLabel = isoDate ? formatShowDate(isoDate) : null;

  return (
    <li
      data-testid={`me-show-card-${show.slug}`}
      className="rounded-md border border-border bg-surface p-tile-pad shadow-tile"
    >
      <Link href={`/show/${show.slug}`} className="block">
        <h2 className="text-lg font-semibold text-text-strong">{show.title}</h2>
        {dateLabel && isoDate ? (
          <time
            dateTime={isoDate}
            className="mt-1 block text-sm text-text-subtle"
          >
            {dateLabel}
          </time>
        ) : null}
      </Link>
    </li>
  );
}
