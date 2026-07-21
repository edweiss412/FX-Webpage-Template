/**
 * app/admin/dev/attention-gallery/page.tsx — the attention scenario gallery
 * (spec docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md).
 *
 * Every alert, warning, and structural permutation the show modal can present,
 * rendered on one page from synthetic scenarios — so an operator can evaluate
 * the surface without waiting for a real sheet to misbehave into the state.
 *
 * Fidelity is the whole point (§3.3): the cards here are the REAL
 * `AttentionBanner`, placed by the REAL `bucketAttention`, from items built by
 * the REAL `deriveAttentionItems`. The only thing the gallery supplies is the
 * stored-row input. A gallery that rendered its own approximation of a card
 * would be worse than no gallery, because it would look authoritative.
 *
 * ── Not a live surface (§4.4) ────────────────────────────────────────────────
 * The cards carry working resolve/ignore controls whose server actions would hit
 * a real database against a show id that does not exist. `ScenarioBlock` blocks
 * every one of them with a single capture-phase `preventDefault` on its root, so
 * the controls stay visible, focusable, and inspectable while doing nothing.
 *
 * ── Build-time gating (mirrors /admin/dev) ───────────────────────────────────
 * This route lives under `app/admin/dev/` and is gated build-time by
 * `scripts/with-admin-dev-flag.mjs`: when ADMIN_DEV_PANEL_ENABLED is not 'true'
 * at build time the wrapper renames these files aside
 * (`.disabled-by-build-gate`) BEFORE `next build`, so the production artifact
 * does not contain the route at all. Registered in that script's FILES array
 * alongside the other dev routes. `requireDeveloper()` runs as the first line
 * here, at the same chokepoint /admin/dev uses, so the trust-domain auth-chain
 * audit classifies it identically.
 *
 * Server Component (no 'use client'): it calls `bucketAttention`, which returns
 * pre-rendered nodes; `ScenarioBlock` is the client leaf that lays them out and
 * owns the menu's open state.
 */
import { requireDeveloper } from "@/lib/auth/requireDeveloper";
import { ALL_SCENARIOS, scenarioById } from "@/lib/dev/attentionScenarios/index";
import { ScenarioBlock } from "@/components/admin/dev/ScenarioBlock";
import { GalleryCard } from "@/components/admin/dev/GalleryCard";
import { GalleryWriteGuard } from "@/components/admin/dev/GalleryWriteGuard";
import { buildBlockProps, GALLERY_NOW, GALLERY_SLUG } from "./buildBlockProps";
import { parseGalleryParams } from "./params";
import type { AttentionItem } from "@/lib/admin/attentionItems";

export const dynamic = "force-dynamic";

export default async function AttentionGalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // FIRST LINE — developer-only gate (redirect if unauthed, 403 if not a developer).
  await requireDeveloper();

  const { tier, scenarioId, maxWidthPx } = parseGalleryParams(await searchParams);

  // `scenario` wins over `tier`: naming one is the more specific request, and
  // silently intersecting the two would show an empty page for a valid id.
  const requested = scenarioId === null ? null : scenarioById(scenarioId);
  const unknownScenario = scenarioId !== null && requested === undefined;
  // Tier 3 is MATERIALIZE-ONLY (spec §4.3, §5.0). Rendering a composite here
  // would show it through a gallery-shaped surface rather than the real modal,
  // which is the one thing the tier exists to avoid. It is listed by name below
  // with a pointer at the dev panel instead.
  const galleryScenarios = ALL_SCENARIOS.filter((s) => s.tier !== 3);
  const requestedIsTier3 = requested?.tier === 3;
  const shown =
    requested && !requestedIsTier3
      ? [requested]
      : requested
        ? []
        : galleryScenarios.filter((s) => tier === null || s.tier === tier);
  const materializeOnly = ALL_SCENARIOS.filter((s) => s.tier === 3);

  // Rendered through GalleryCard rather than AttentionBanner directly:
  // AttentionBanner requires an `onResolved` FUNCTION prop, and a function
  // cannot cross the RSC boundary from this server component. GalleryCard owns
  // that callback inside the client boundary.
  const renderCard = (item: AttentionItem) => (
    <GalleryCard key={item.id} item={item} slug={GALLERY_SLUG} now={GALLERY_NOW} />
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Total containment for imperative writes; see the component header. The
          submit-capture guard in ScenarioBlock covers form-posted actions, and
          neither alone is sufficient. */}
      <GalleryWriteGuard />
      {/* text-2xl over the blocks' text-lg h2 is a 1.33x step, clearing
          DESIGN.md's 1.25x floor; text-xl was 1.11x and read as a flat scale. */}
      <h1 className="text-2xl font-bold text-text-strong">Attention scenario gallery</h1>
      <p className="mt-2 max-w-prose text-xs/relaxed text-text-subtle">
        Synthetic scenarios rendered through the real derivation, routing, and card components.
        Action controls are display-only here: every submit is intercepted, so nothing writes. To
        put one of these states in front of the real modal, use the materialize card on{" "}
        <a className="underline" href="/admin/dev">
          the dev panel
        </a>
        . Filter with <code>?tier=1|2|3</code> or <code>?scenario=&lt;id&gt;</code>, and set a
        render width with <code>?w=390</code> (320 to 1280).
      </p>
      <p className="mt-2 text-xs/relaxed text-text-subtle">
        Showing {shown.length} of {ALL_SCENARIOS.length} scenarios
        {tier === null ? "" : ` (tier ${tier})`}.
      </p>

      {requestedIsTier3 ? (
        <p className="mt-4 max-w-prose text-xs/relaxed text-text-strong">
          <code>{scenarioId}</code> is a composite, which is materialize-only. Use the materialize
          card on{" "}
          <a className="underline" href="/admin/dev">
            the dev panel
          </a>
          , then review it in the real show modal.
        </p>
      ) : null}

      {unknownScenario ? (
        <p className="mt-4 text-xs/relaxed text-text-strong">
          No scenario with id <code>{scenarioId}</code>. Valid ids:{" "}
          {ALL_SCENARIOS.map((s) => s.id).join(", ")}
        </p>
      ) : null}

      {shown.length < 2 ? null : (
        <nav aria-label="Scenarios on this page" className="mt-6">
          {/* Every block already carries an `id`; without this nothing links to
              them, so a 40-scenario sweep is one long scroll with no way back. */}
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {shown.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex min-h-tap-min items-center text-xs/relaxed text-text-subtle underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {tier !== null && tier !== 3 ? null : (
        <section className="mt-6 rounded-md border border-border p-3">
          <h2 className="text-xs font-semibold text-text-strong">
            Composites (materialize-only, not rendered here)
          </h2>
          <p className="mt-1 max-w-prose text-xs/relaxed text-text-subtle">
            These carry whole realistic show states. They are written onto a real show with the
            materialize card on{" "}
            <a className="underline" href="/admin/dev">
              the dev panel
            </a>{" "}
            and then reviewed in the real show modal, because a composite rendered here would be a
            gallery-shaped approximation of the surface it exists to exercise.
          </p>
          <ul className="mt-2">
            {materializeOnly.map((s) => (
              <li key={s.id} className="text-xs/relaxed text-text-subtle">
                <span className="font-mono">{s.id}</span> — {s.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8">
        {shown.map((s) => (
          <ScenarioBlock key={s.id} {...buildBlockProps(s, maxWidthPx, renderCard)} />
        ))}
      </div>
    </main>
  );
}
