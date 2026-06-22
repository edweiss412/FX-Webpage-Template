/**
 * components/crew/primitives/KeyTimesStrip.tsx — crew-redesign §4.6 primitive.
 *
 * Renders the Set anchor, then ONE row per visible show day (`shows[]`), then
 * the Strike anchor, as a compact strip. Each present row carries
 * `data-anchor="set|show|strike"` and renders its value with `tabular-nums`
 * (DESIGN.md §2.4 — times use tabular figures so the columns don't shift). An
 * ABSENT Set/Strike is simply not a key on `KeyTimeAnchors` (resolveKeyTimes
 * strips it) and an absent show day is simply not in `shows`; the strip renders
 * only the present rows. When EVERYTHING is absent ({}) the strip renders
 * nothing (null) so no empty band reflows in.
 *
 * Show-row cap (§6): the realistic max is ~3 show days but the type is
 * unbounded, so the Show rows are capped at 5 — when `shows.length > 5` the
 * first 4 render and the remainder collapse into a single "+N more" overflow
 * row (`data-testid="key-times-shows-overflow"`, no `data-anchor` so it is not
 * counted as a show row).
 *
 * Props (binding contract): {anchors: KeyTimeAnchors} from
 * lib/crew/resolveKeyTimes ({ set?, shows?: ShowAnchor[], strike? }). Per-show
 * labels are the resolver's already-composed copy ("Day 1 · Wed 10/8" /
 * "Show") — this component never recomputes label copy.
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

/**
 * Show rows are capped at 5 (§6). When `shows.length > SHOWS_CAP`, the first 4
 * show rows render and the remainder collapse into a single overflow row.
 */
const SHOWS_CAP = 5;

/**
 * One rendered row. `anchor` is `undefined` for the overflow summary row so it
 * carries no `data-anchor` (and is therefore not counted by the
 * `[data-anchor="show"]` selector); `date` only stamps `data-anchor-date` on a
 * per-day show row so a specific day can be targeted.
 */
type Row = {
  /** Stable React key (anchor key or a synthetic overflow key). */
  rowKey: string;
  anchor?: "set" | "show" | "strike";
  label: string;
  value: string;
  date?: string;
  /** Only the overflow summary row sets this `data-testid`. */
  testid?: string;
};

export function KeyTimesStrip({ anchors, layout = "stack" }: KeyTimesStripProps) {
  const showAnchors = anchors.shows ?? [];
  const overflow = showAnchors.length > SHOWS_CAP ? showAnchors.length - 4 : 0;
  const cappedShows = overflow > 0 ? showAnchors.slice(0, 4) : showAnchors;

  // Build the row list in render order: Set → show days (capped) → overflow
  // summary (if any) → Strike. An absent Set/Strike is simply not a key.
  const rows: Row[] = [];
  if (anchors.set != null)
    rows.push({ rowKey: "set", anchor: "set", label: "Set", value: anchors.set });
  for (const s of cappedShows) {
    rows.push({
      rowKey: `show-${s.date}`,
      anchor: "show",
      label: s.label,
      value: s.time,
      date: s.date,
    });
  }
  if (overflow > 0) {
    rows.push({
      rowKey: "shows-overflow",
      label: "More days",
      value: `+${overflow} more`,
      testid: "key-times-shows-overflow",
    });
  }
  if (anchors.strike != null) {
    rows.push({ rowKey: "strike", anchor: "strike", label: "Strike", value: anchors.strike });
  }

  // Everything absent → render nothing so no empty strip reflows in.
  if (rows.length === 0) return null;

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
      {rows.map((row) => (
        <div
          key={row.rowKey}
          {...(row.anchor != null ? { "data-anchor": row.anchor } : {})}
          {...(row.date != null ? { "data-anchor-date": row.date } : {})}
          {...(row.testid != null ? { "data-testid": row.testid } : {})}
          className={anchorClass}
        >
          <span className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
            {row.label}
          </span>
          <span className="min-w-0 text-sm font-semibold tabular-nums text-text-strong">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
