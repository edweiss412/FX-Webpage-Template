/**
 * app/show/[slug]/p/page.tsx (M5 §B Task 5.5 — Opus's portion)
 *
 * The bootstrap shell that exists ONLY to mint a `__Host-fxav_session`
 * cookie from a `#t=<jwt>` URL fragment. This route is the public entry
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

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { Bootstrap } from "./Bootstrap";

/**
 * Resolve a slug → show_id via a single bound SELECT. Mirrors the helper
 * in `app/show/[slug]/page.tsx:112-123` — the slug is part of the public
 * URL path; this lookup carries no identity-binding semantics. Throws on
 * DB-level failure so Next's error boundary surfaces the infrastructure
 * fault rather than silently 404'ing.
 */
async function resolveShowIdFromSlug(slug: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const res = await supabase
    .from("shows")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (res.error) {
    throw new Error(
      `/show/[slug]/p: slug lookup failed: ${res.error.message}`,
    );
  }
  return (res.data?.id as string | undefined) ?? null;
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BootstrapShellPage({ params }: PageProps) {
  const { slug } = await params;

  const showId = await resolveShowIdFromSlug(slug);
  if (!showId) {
    notFound();
  }

  return (
    <main
      data-testid="bootstrap-shell"
      className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      <Bootstrap showId={showId} slug={slug} />
    </main>
  );
}
