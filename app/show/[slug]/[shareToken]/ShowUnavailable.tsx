/**
 * app/show/[slug]/[shareToken]/ShowUnavailable.tsx
 *
 * The crew-facing "paused" surface (published-toggle spec §3.5, user decision D5):
 * rendered by the crew route's `unpublished` arm — a valid share-token URL whose show
 * is currently toggled off. Served under HTTP 200 (the link IS real and will work
 * again; only currently-valid token holders can reach this arm — resolution already
 * succeeded), unlike archived/unresolved links, which keep the 404 not-found boundary.
 *
 * Deliberately takes NO props: zero show data (no title, no dates) can render here,
 * so a paused show leaks nothing beyond "this link exists". Copy routes through
 * messageFor (AGENTS.md invariant 5).
 *
 * Server Component — no client boundary needed. Renders OUTSIDE _CrewShell, so the
 * realtime bridge is not mounted; recovery after republish is a manual reload (the
 * copy says "check back soon" — accepted in D5).
 */
import { messageFor } from "@/lib/messages/lookup";

export function ShowUnavailable() {
  const body = messageFor("CREW_SHOW_PAUSED").crewFacing;
  return (
    <main
      data-testid="crew-show-paused-root"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
    >
      <span
        data-testid="crew-show-paused-brand-strip"
        className="text-xs font-bold uppercase tracking-eyebrow-strong text-accent-on-bg"
      >
        FXAV
      </span>
      <h1 className="mt-2 text-2xl font-bold text-text-strong">
        This show isn&rsquo;t available right now
      </h1>
      <p data-testid="crew-show-paused-body" className="mt-4 text-base text-text-subtle">
        {body}
      </p>
    </main>
  );
}
