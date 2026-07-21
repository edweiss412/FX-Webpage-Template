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
import { AttentionBanner } from "@/components/admin/review/AttentionBanner";
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
  const shown = requested
    ? [requested]
    : ALL_SCENARIOS.filter((s) => tier === null || s.tier === tier);

  // `onResolved` is a no-op: the submit guard already stops the action, and a
  // card that visually confirmed without a write would be a lie about state.
  const renderCard = (item: AttentionItem) => (
    <AttentionBanner
      key={item.id}
      item={item}
      slug={GALLERY_SLUG}
      now={GALLERY_NOW}
      highlighted={false}
      onResolved={() => {}}
    />
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-bold text-text-strong">Attention scenario gallery</h1>
      <p className="mt-2 max-w-prose text-xs/relaxed text-text-subtle">
        Synthetic scenarios rendered through the real derivation, routing, and card components.
        Nothing here writes: every control is live to look at and inert to click. Filter with{" "}
        <code>?tier=1|2|3</code> or <code>?scenario=&lt;id&gt;</code>, and set a render width with{" "}
        <code>?w=390</code> (320 to 1280).
      </p>
      <p className="mt-2 text-xs/relaxed text-text-subtle">
        Showing {shown.length} of {ALL_SCENARIOS.length} scenarios
        {tier === null ? "" : ` (tier ${tier})`}.
      </p>

      {unknownScenario ? (
        <p className="mt-4 text-xs/relaxed text-text-strong">
          No scenario with id <code>{scenarioId}</code>. Valid ids:{" "}
          {ALL_SCENARIOS.map((s) => s.id).join(", ")}
        </p>
      ) : null}

      <div className="mt-8">
        {shown.map((s) => (
          <ScenarioBlock key={s.id} {...buildBlockProps(s, maxWidthPx, renderCard)} />
        ))}
      </div>
    </main>
  );
}
