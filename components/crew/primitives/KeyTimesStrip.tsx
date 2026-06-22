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
  /**
   * Layout posture (default `"stack"`):
   *
   *   - `"stack"` — the vertical list: one row per anchor, label-left /
   *     value-right (`justify-between`). Used in NARROW columns (ScheduleSection's
   *     1fr "Daily call times" card) and at <720px everywhere. The e2e
   *     label-left / value-right column-alignment contract (crew-page inv6, which
   *     runs mobile-only) pins this shape.
   *   - `"row"` — at ≥720px the present anchors lay out as an equal-width
   *     HORIZONTAL strip (eyebrow label stacked over value, hairline-divided), so
   *     a WIDE column (the Today "Key times" card in the 1.6fr column, and the
   *     Mode A bare banner) fills its width instead of leaving a large empty
   *     right side. Below 720px `"row"` is identical to `"stack"` — the
   *     horizontal classes are all `min-[720px]:`-gated, so mobile and inv6 are
   *     untouched.
   *
   * Per-row markup is invariant across both: each present anchor is a
   * `[data-anchor]` element whose FIRST `<span>` is the label and LAST `<span>`
   * is the value (inv6 reads `span.first()` / `span.last()`).
   */
  layout?: "stack" | "row";
};

/** Anchor render order + label. Order is fixed (Set → Show → Strike). */
const ANCHOR_ORDER: ReadonlyArray<{ key: keyof KeyTimeAnchors; label: string }> = [
  { key: "set", label: "Set" },
  { key: "show", label: "Show" },
  { key: "strike", label: "Strike" },
];

export function KeyTimesStrip({ anchors, layout = "stack" }: KeyTimesStripProps) {
  // Present anchors only — an absent key is simply not on the object.
  const present = ANCHOR_ORDER.filter(({ key }) => anchors[key] != null);

  // All three absent → render nothing so no empty strip reflows in.
  if (present.length === 0) return null;

  const isRow = layout === "row";

  // Mobile (and the whole `"stack"` posture) is the original vertical list. The
  // `"row"` additions are all `min-[720px]:`-gated so they only engage on the
  // desktop split-wide layout. `divide-border` draws the hairline column rules;
  // `first:pl-0`/`last:pr-0` keep the band flush to the card's content edges.
  const containerClass = isRow
    ? "flex flex-col gap-2 min-[720px]:flex-row min-[720px]:gap-0 min-[720px]:divide-x min-[720px]:divide-border"
    : "flex flex-col gap-2";
  const anchorClass = isRow
    ? "flex min-w-0 items-baseline justify-between gap-3 min-[720px]:flex-1 min-[720px]:flex-col min-[720px]:items-start min-[720px]:justify-start min-[720px]:gap-0.5 min-[720px]:px-4 min-[720px]:first:pl-0 min-[720px]:last:pr-0"
    : "flex items-baseline justify-between gap-3";

  return (
    <div data-testid="key-times-strip" data-layout={layout} className={containerClass}>
      {present.map(({ key, label }) => (
        <div key={key} data-anchor={key} className={anchorClass}>
          <span className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
            {label}
          </span>
          <span className="min-w-0 text-sm font-semibold tabular-nums text-text-strong">
            {anchors[key]}
          </span>
        </div>
      ))}
    </div>
  );
}
