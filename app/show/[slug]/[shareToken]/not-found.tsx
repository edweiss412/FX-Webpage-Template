/**
 * app/show/[slug]/[shareToken]/not-found.tsx
 *
 * The not-found boundary for the crew show route. Rendered whenever the page
 * calls `notFound()` — archived / unpublished / `show_unavailable` (rotated or
 * reset share-token, or a slug+token that never resolved). Next serves this
 * boundary under HTTP 404, so the status is preserved: a revoked-link holder
 * cannot confirm the show exists (the security premise of M11.5 link rotation).
 *
 * A single generic surface cannot — and must not — distinguish "your link was
 * reset" from "wrong URL", so the cataloged CREW_LINK_UNAVAILABLE copy is
 * written to work for both without disclosing which one applies, and without
 * leaking the show title. Copy routes through messageFor() per AGENTS.md
 * invariant 5 (never render the raw code).
 *
 * Its saved-copy marker is `check`, naming no show, since the token resolved to
 * none (spec 4.3): the worker runs the status check for a copy saved at this URL.
 *
 * Server Component; its one client boundary is the marker.
 */
import { SavedCopyMarker } from "@/components/offline/SavedCopyMarker";
import { messageFor } from "@/lib/messages/lookup";

export default function CrewLinkNotFound() {
  const body = messageFor("CREW_LINK_UNAVAILABLE").crewFacing;
  return (
    <main
      data-testid="crew-not-found-root"
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
    >
      {/* An inert <template>: it renders nothing and takes no place in the column. */}
      <SavedCopyMarker marker={{ disposition: "check", showId: null }} />
      <span
        data-testid="crew-not-found-brand-strip"
        className="text-xs font-bold uppercase tracking-eyebrow-strong text-accent-on-bg"
      >
        FXAV
      </span>
      <h1 className="mt-2 text-2xl font-bold text-text-strong">We couldn’t open this link</h1>
      <p data-testid="crew-not-found-body" className="mt-4 text-base text-text-subtle">
        {body}
      </p>
    </main>
  );
}
