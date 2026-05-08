/**
 * app/show/[slug]/p/page.tsx (M5 §B Task 5.5 — Opus's portion)
 *
 * The bootstrap shell that exists ONLY to mint the FXAV session cookie
 * from a `#t=<jwt>` URL fragment. This route is the public entry
 * point for the signed-link onboarding flow described in spec §7.2:
 *
 *   1. Doug shares a link of the form `https://crew.fxav.show/show/<slug>/p#t=<jwt>`.
 *   2. The browser navigates to the URL; the fragment is NEVER sent to
 *      the server (browser convention — fragments are purely client-side),
 *      so this Server Component renders without ever seeing the JWT.
 *   3. The Server Component renders `<Bootstrap />` (a client island) and
 *      sets up the per-show showId via a server-rendered prop. NO PII
 *      and NO role-gated data is read on the render path — this surface
 *      is intentionally `public-bootstrap` per the auth-validator audit
 *      (plan §142).
 *   4. The client island reads `location.hash` to extract the JWT,
 *      invokes the `bootstrapMint` Server Action to atomically create
 *      a `bootstrap_nonces` row + `__Host-fxav_bootstrap_v` cookie
 *      entry, then POSTs `{ token, nonce, show_id }` to
 *      `/api/auth/redeem-link`. The redeem-link route mints the session
 *      cookie, the client strips the fragment via `history.replaceState`,
 *      and `router.replace('/show/<slug>')` lands the user on the
 *      auth-gated crew page with the new cookie active.
 *
 * Why this is a Server Component (not a route handler):
 *   - Renders trivial JSX (a single client island + a "Connecting…"
 *     loading message) — well within the SSR surface.
 *   - The actual cookie + DB mutation happens via a Server Action invoked
 *     from the client island on mount, NOT from the page render path.
 *     Next 16 forbids cookie mutation from a Server Component render
 *     (`cookies().set()` throws with "Cookies can only be modified in a
 *     Server Action or Route Handler"); the Server Action context
 *     resolves this constraint cleanly.
 *
 * Showid resolution (mirrors `app/show/[slug]/page.tsx`):
 *   - Single bound SELECT on `shows.slug = $1` → `shows.id`.
 *   - When the slug doesn't resolve, `notFound()` (404) — same UX as the
 *     parent show page. Doug should never share a link pointing at a
 *     non-existent show, but the 404 fallback is the safe default.
 *
 * No PII / role-gated reads (auth-validator audit invariant):
 *   The page DOES NOT call `getShowForViewer`, `validateLinkSession`,
 *   `validateGoogleSession`, or any other identity-binding helper. The
 *   only DB read is the slug → id mapping, which is public information
 *   (slugs are part of the URL path). The plan §142 explicitly classifies
 *   this surface as `public-bootstrap` for the validator-coverage audit;
 *   adding any role-gated read here would break that classification.
 *
 * Server Component. No `'use client'`.
 */
import { notFound } from "next/navigation";

import { messageFor } from "@/lib/messages/lookup";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { Bootstrap } from "./Bootstrap";

/**
 * Resolve a slug → {id, published} via a single bound SELECT. Mirrors the
 * helper in `app/show/[slug]/page.tsx`. The slug is part of the public
 * URL path; this lookup carries no identity-binding semantics. Throws on
 * DB-level failure so Next's error boundary surfaces the infrastructure
 * fault rather than silently 404'ing.
 *
 * R11 #2 (round-10 §B HIGH): published is fetched alongside id so the
 * bootstrap shell can notFound() unpublished slugs the same way the
 * parent show page does. Without the gate, the shell rendered for any
 * existing slug while unknown slugs hit notFound() — recreating the
 * unpublished-show existence oracle the round-9/round-10 published gate
 * was meant to close. The redeem-link route (R9 #1) gates published as
 * its first DB step too, so a session can never be minted for an
 * unpublished show; this gate stops the page-render existence leak +
 * the unnecessary bootstrap_nonces inserts.
 */
type SlugResolution =
  | { kind: "found"; id: string; published: boolean }
  | { kind: "not_found" }
  | { kind: "infra_error"; code: "ADMIN_SESSION_LOOKUP_FAILED" };

/**
 * R21 F1 (round-21 §B MEDIUM): sibling of the show-page resolver — same
 * infra-as-framework-error class. Pre-fix this threw on res.error AND
 * on createSupabaseServiceRoleClient() / .from(...).maybeSingle()
 * throws, escaping into Next's generic error surface. Now: discriminated
 * union; the bootstrap shell renders a cataloged terminal-failure block
 * on the infra arm. notFound() is preserved for the not-found and
 * unpublished cases (anti-oracle existence leak still applies).
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

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BootstrapShellPage({ params }: PageProps) {
  const { slug } = await params;

  const showInfo = await resolveShowFromSlug(slug);
  if (showInfo.kind === "infra_error") {
    // R21 F1 (round-21 §B MEDIUM): pre-chain slug-lookup infra failure
    // — render the cataloged terminal-failure block. The bootstrap
    // shell has no chain to fall through to, so this is the user's
    // only recoverable signal that the server is having trouble.
    const entry = messageFor(showInfo.code as never);
    return (
      <main
        data-testid="bootstrap-shell-terminal-failure"
        className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-12 text-center"
      >
        <h1 className="text-2xl font-bold text-text-strong">
          We&rsquo;re having trouble loading this show
        </h1>
        <p className="mt-4 text-base text-text-subtle">
          {entry.crewFacing ?? entry.dougFacing ?? "Please try again in a moment."}
        </p>
        <a
          href={`/show/${slug}/p`}
          className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
        >
          Try again
        </a>
      </main>
    );
  }
  // notFound() for both unknown slug AND unpublished slug — anti-oracle.
  // The bootstrap shell is unauthenticated, so there's no admin bypass
  // here; signed-link onboarding for an unpublished show would be
  // rejected at /api/auth/redeem-link anyway (R9 #1's published gate
  // is the first DB step there), but the page-level gate stops the
  // existence leak before the client even mints a nonce.
  if (showInfo.kind === "not_found" || !showInfo.published) {
    notFound();
  }
  const showId = showInfo.id;

  return (
    <main
      data-testid="bootstrap-shell"
      className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      <Bootstrap showId={showId} slug={slug} />
    </main>
  );
}
