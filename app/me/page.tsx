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
 * The render half — MeShowSections and its private collaborators,
 * including the date formatter — now lives in app/me/meShowSections.tsx.
 * It was relocated verbatim by the 2026-08-07 Step-3 a11y cluster
 * (spec §8, R10) so a browser bundle can mount it without dragging
 * this file's server graph, which constructs an AsyncLocalStorage at
 * module scope. Zero behavior change; see that file's header.
 *
 * CF2 carry-forward: validateGoogleIdentity currently `void req;` and
 * reads cookies/headers via createSupabaseServerClient directly. The
 * synthetic Request below is forward-compat — when CF2 is fixed, this
 * page keeps working without churn.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { MeShowSections } from "@/app/me/meShowSections";
import { validateGoogleIdentity } from "@/lib/auth/validateGoogleIdentity";
import { listShowsForCrew } from "@/lib/data/listShowsForCrew";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TerminalFailure } from "@/components/auth/TerminalFailure";
import { nowDate } from "@/lib/time/now";

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
            className="inline-flex min-h-tap-min items-center px-2 text-sm text-text underline underline-offset-2 hover:text-text-strong"
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
