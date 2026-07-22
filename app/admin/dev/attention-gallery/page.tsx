/**
 * app/admin/dev/attention-gallery/page.tsx — the attention modal switcher gallery
 * (spec docs/superpowers/specs/2026-07-21-attention-modal-switcher-gallery-design.md).
 *
 * Every alert, warning, and structural permutation the published show modal can
 * present, shown INSIDE the real modal — one modal, its data swapped as the
 * operator steps through scenarios, so each attention state appears exactly where
 * it would in production instead of as a gallery-shaped approximation.
 *
 * ── Server / client split (§2.1) ────────────────────────────────────────────
 * The modal's eight action props are functions and cannot cross the React Flight
 * boundary, so this Server Component passes only the SERIALIZABLE half: the
 * `rendered` scenarios (each `{ id, tier, label, codes, data }`, data-only) and
 * the `excluded` list. The client `AttentionModalSwitcher` owns the modal, the
 * no-op action closures, and keyboard stepping.
 *
 * ── Not a live surface (§4.4, KEPT) ─────────────────────────────────────────
 * `GalleryWriteGuard` patches `window.fetch` to refuse every mutating request,
 * so the modal's real resolve control (a direct `fetch`, not a form submit) does
 * nothing against a show id that does not exist. The no-op action closures cover
 * the form-action controls; the guard covers the imperative fetch.
 *
 * ── Build-time gating (mirrors /admin/dev) ──────────────────────────────────
 * This route lives under `app/admin/dev/` and is gated build-time by
 * `scripts/with-admin-dev-flag.mjs` (its FILES array lists this file): when
 * ADMIN_DEV_PANEL_ENABLED is not 'true' at build time the wrapper renames these
 * files aside before `next build`, so the production artifact omits the route.
 * `requireDeveloper()` runs as the FIRST line, the same chokepoint /admin/dev
 * uses, so the trust-domain auth-chain audit classifies it identically.
 */
import { requireDeveloper } from "@/lib/auth/requireDeveloper";
import { GalleryWriteGuard } from "@/components/admin/dev/GalleryWriteGuard";
import { AttentionModalSwitcher } from "@/components/admin/dev/AttentionModalSwitcher";
import { partitionScenarios, resolveInitialScenario } from "./buildSwitcherScenarios";

export const dynamic = "force-dynamic";

export default async function AttentionGalleryPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // FIRST LINE — developer-only gate (redirect if unauthed, 403 if not a developer).
  await requireDeveloper();

  const searchParams = await props.searchParams;
  const { rendered, excluded } = partitionScenarios();
  const initialId = resolveInitialScenario(searchParams?.scenario, rendered);

  return (
    <>
      {/* Total containment for imperative writes; see the component header. */}
      <GalleryWriteGuard />
      {/* Background chrome, mostly behind the fixed modal. The modal is always
          mounted (its native close navigates to /admin), so this is the route's
          heading landmark rather than a fallback surface. */}
      <main className="mx-auto flex min-h-dvh max-w-prose flex-col justify-center px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-text-strong">Attention modal gallery</h1>
        <p className="mt-2 text-xs/relaxed text-text-subtle">
          Every alert, warning, and structural state the published show modal can present, shown in
          the real modal. Step with the arrow keys or the control bar; deep-link a state with{" "}
          <code>?scenario=&lt;id&gt;</code>.
        </p>
      </main>
      <AttentionModalSwitcher scenarios={rendered} excluded={excluded} initialId={initialId} />
    </>
  );
}
