"use client";

/**
 * components/admin/dev/GalleryCard.tsx
 *
 * Renders the REAL `AttentionBanner` for the gallery. It exists purely to own
 * the `onResolved` callback: `AttentionBanner` requires a function prop, and a
 * function cannot cross the RSC boundary, so the gallery page (a Server
 * Component) cannot pass one. Creating it here, inside the client boundary,
 * keeps the page a server component while still rendering the production card.
 *
 * The callback is a deliberate no-op. `ScenarioBlock` already intercepts every
 * form submit, so no resolve ever reaches the server, and a card that visually
 * confirmed without a write would be a lie about state.
 */
import { AttentionBanner } from "@/components/admin/review/AttentionBanner";
import type { AttentionItem } from "@/lib/admin/attentionItems";

export function GalleryCard({ item, slug, now }: { item: AttentionItem; slug: string; now: Date }) {
  return (
    <AttentionBanner item={item} slug={slug} now={now} highlighted={false} onResolved={() => {}} />
  );
}
