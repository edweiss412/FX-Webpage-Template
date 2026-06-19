/**
 * components/crew/primitives/KeyTimesStrip.tsx — crew-redesign §4.6 primitive.
 *
 * Renders the Set / Show / Strike key-time anchors as a compact strip. Each
 * present anchor row carries `data-anchor="set|show|strike"` and renders its
 * value with `tabular-nums` (DESIGN.md §2.4 — times use tabular figures so
 * the columns don't shift). An ABSENT anchor is simply not a key on
 * `KeyTimeAnchors` (resolveKeyTimes strips it), so the strip renders only the
 * present rows; when ALL three are absent the strip renders nothing (null) so
 * no empty band reflows in.
 *
 * Props (binding contract): {anchors: KeyTimeAnchors} from
 * lib/crew/resolveKeyTimes ({ set?, show?, strike? }).
 *
 * Server Component (no `'use client'`) — props in, markup out.
 */
import type { KeyTimeAnchors } from "@/lib/crew/resolveKeyTimes";

type KeyTimesStripProps = {
  anchors: KeyTimeAnchors;
};

/** Anchor render order + label. Order is fixed (Set → Show → Strike). */
const ANCHOR_ORDER: ReadonlyArray<{ key: keyof KeyTimeAnchors; label: string }> = [
  { key: "set", label: "Set" },
  { key: "show", label: "Show" },
  { key: "strike", label: "Strike" },
];

export function KeyTimesStrip({ anchors }: KeyTimesStripProps) {
  // Present anchors only — an absent key is simply not on the object.
  const present = ANCHOR_ORDER.filter(({ key }) => anchors[key] != null);

  // All three absent → render nothing so no empty strip reflows in.
  if (present.length === 0) return null;

  return (
    <div data-testid="key-times-strip" className="flex flex-col gap-2">
      {present.map(({ key, label }) => (
        <div key={key} data-anchor={key} className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
            {label}
          </span>
          <span className="text-sm font-semibold tabular-nums text-text-strong">
            {anchors[key]}
          </span>
        </div>
      ))}
    </div>
  );
}
