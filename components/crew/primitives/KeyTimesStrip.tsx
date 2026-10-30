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
 * Semantics (D1): the strip is a description list — a `<dl>` container whose
 * rows are `<div data-anchor>` groups of `<dt>` (label) + `<dd>` (value), the
 * SAME structure the two sibling primitives use (`KeyValueRows.tsx`,
 * `RightNowHero.tsx`). This gives SRs an explicit label↔value association
 * (WCAG 1.3.1). The label/value spans are kept as the first/last span inside
 * `<dt>`/`<dd>` so the crew-page inv6 alignment contract (`span.first()` /
 * `span.last()`) is unchanged. Per-day date labels are wrapped in
 * `<time dateTime={row.date}>` (D5) so the ISO date is machine-readable.
 *
 * Show-row cap (§6): the realistic max is ~3 show days but the type is
 * unbounded, so the Show rows are capped at 8 — when `shows.length > 8` the
 * first 7 render and the remainder collapse into a native `<details>` overflow
 * disclosure (`data-testid="key-times-shows-overflow"`, no `data-anchor` so its
 * rows are not counted as show rows). The disclosure is recessive at rest and
 * expands the hidden days INLINE on tap (D2) — a native `<summary>` toggles the
 * `<details>` and assistive tech announces the expanded/collapsed state (via the
 * details/summary a11y mapping, not a hand-written attribute), so keyboard + SR
 * work with zero client JS and the component stays a Server Component.
 *
 * Props (binding contract): {anchors: KeyTimeAnchors} from
 * lib/crew/resolveKeyTimes ({ set?, shows?: ShowAnchor[], strike? }). Per-show
 * labels are the resolver's already-composed copy ("Day 1 · Wed 10/8" /
 * "Show") — this component never recomputes label copy.
 *
 * Server Component (no `'use client'`) — props in, markup out.
 */
import type { KeyTimeAnchors } from "@/lib/crew/resolveKeyTimes";
import { cn } from "@/lib/ui/cn";

type KeyTimesStripProps = {
  anchors: KeyTimeAnchors;
  /**
   * Layout posture (default `"stack"`):
   *
   *   - `"stack"` — the vertical list: one row per anchor, label-left /
   *     value-right (`justify-between`). Used in NARROW columns (ScheduleSection's
   *     1fr "Crew Schedule" card) and in every narrow body container. The e2e
   *     label-left / value-right column-alignment contract (crew-page inv6, which
   *     runs mobile-only) pins this shape.
   *   - `"row"` — split (`@min-crew-split`), the anchors lay out as an equal-width
   *     HORIZONTAL strip (eyebrow label stacked over value, hairline-divided), so
   *     a WIDE column (the Today "Key times" card in the 1.6fr column, and the
   *     Mode A bare banner) fills its width instead of leaving a large empty
   *     right side. Narrower, `"row"` is identical to `"stack"` — the
   *     horizontal classes are all `@min-crew-split:`-gated, so mobile and inv6 are
   *     untouched.
   *
   * Per-row markup is invariant across both: each present anchor is a
   * `[data-anchor]` element whose FIRST `<span>` (inside `<dt>`) is the label and
   * LAST `<span>` (inside `<dd>`) is the value (inv6 reads `span.first()` /
   * `span.last()`).
   */
  layout?: "stack" | "row";
  /**
   * Search target ids keyed by row key (`keyTimeRows(anchors)`: `set`,
   * `show-<date>`, `strike`). Absent renders no search markers.
   */
  searchTargets?: Readonly<Record<string, string>>;
};

/**
 * Show rows are capped at 8 (§6). When `shows.length > SHOWS_CAP`, the first 7
 * show rows render and the remainder collapse into a single overflow disclosure.
 */
export const SHOWS_CAP = 8;
/** Rows shown before the overflow disclosure when the cap is exceeded. */
const VISIBLE_BEFORE_OVERFLOW = SHOWS_CAP - 1;

/**
 * One rendered row. `anchor` is `undefined` for a disclosed overflow row so it
 * carries no `data-anchor` (and is therefore not counted by the
 * `[data-anchor="show"]` selector); `date` stamps `data-anchor-date` and wraps
 * the label in `<time>` on a per-day show row so a specific day can be targeted
 * and the date is machine-readable.
 */
export type KeyTimeRow = {
  /** Stable React key (anchor key or a synthetic overflow key). */
  rowKey: string;
  anchor?: "set" | "show" | "strike";
  label: string;
  value: string;
  date?: string;
};

/**
 * A single label/value group: `<div data-anchor>` wrapping `<dt><span>label` +
 * `<dd><span>value`. Show-day rows wrap the label in `<time>` (D5). Passing
 * `anchor: undefined` (disclosed overflow rows) omits `data-anchor` so the row
 * is not counted among the visible show rows.
 */
function AnchorRow({
  row,
  anchorClass,
  searchTarget,
}: {
  row: KeyTimeRow;
  anchorClass: string;
  searchTarget: string | undefined;
}) {
  const labelNode = row.date != null ? <time dateTime={row.date}>{row.label}</time> : row.label;
  return (
    <div
      {...(row.anchor != null ? { "data-anchor": row.anchor } : {})}
      {...(row.date != null ? { "data-anchor-date": row.date } : {})}
      data-search-target={searchTarget}
      className={anchorClass}
    >
      <dt className="min-w-0">
        <span className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
          {labelNode}
        </span>
      </dt>
      <dd className="min-w-0">
        <span className="text-sm font-semibold tabular-nums text-text-strong">{row.value}</span>
      </dd>
    </div>
  );
}

export function KeyTimesStrip({ anchors, layout = "stack", searchTargets }: KeyTimesStripProps) {
  const { set, visibleShows, hiddenShows, overflow, strike } = keyTimeRows(anchors);

  const hasAny = set != null || visibleShows.length > 0 || overflow > 0 || strike != null;
  // Everything absent → render nothing so no empty strip reflows in.
  if (!hasAny) return null;
  // Disclosure chrome ("More show days", "+N more days") is not sheet data.
  const skip = searchTargets !== undefined ? "" : undefined;

  const isRow = layout === "row";

  // Mobile (and the whole `"stack"` posture) is the original vertical list. The
  // `"row"` additions are all `@min-crew-split:`-gated so they only engage on the
  // split-wide container width. `divide-border` draws the hairline column rules;
  // `first:pl-0`/`last:pr-0` keep the band flush to the card's content edges.
  const containerClass = isRow
    ? "flex flex-col gap-2 @min-crew-split:flex-row @min-crew-split:flex-wrap @min-crew-split:gap-0 @min-crew-split:divide-x @min-crew-split:divide-border"
    : "flex flex-col gap-2";
  const anchorClass = isRow
    ? "flex min-w-0 items-baseline justify-between gap-3 @min-crew-split:flex-1 @min-crew-split:flex-col @min-crew-split:items-start @min-crew-split:justify-start @min-crew-split:gap-0.5 @min-crew-split:px-4 @min-crew-split:first:pl-0 @min-crew-split:last:pr-0"
    : "flex items-baseline justify-between gap-3";
  // The overflow disclosure is a vertical list regardless of the outer posture,
  // so its disclosed rows always use the STACK row shape (never the row-layout
  // `@min-crew-split:flex-col` column form, which is meant for the equal-width strip).
  const stackAnchorClass = cn("flex items-baseline justify-between gap-3");

  return (
    <dl data-testid="key-times-strip" data-layout={layout} className={containerClass}>
      {set != null ? (
        <AnchorRow row={set} anchorClass={anchorClass} searchTarget={searchTargets?.[set.rowKey]} />
      ) : null}

      {visibleShows.map((row) => (
        <AnchorRow
          key={row.rowKey}
          row={row}
          anchorClass={anchorClass}
          searchTarget={searchTargets?.[row.rowKey]}
        />
      ))}

      {overflow > 0 ? (
        // The overflow is a real <dt>/<dd> group so the outer <dl> content model
        // stays valid — a <dl> permits only <dt>/<dd> or <div> groups, never a
        // bare <details>. The <dd> legally holds the disclosure, and the hidden
        // days nest under the "More show days" term as their definition, so a SR
        // reads them as a continuation of the key-times list, not a stray list.
        // In `layout="row"` (the split-wide equal-width strip) the disclosure is not
        // an equal column — it wraps to its OWN full-width line below the columns
        // (`@min-crew-split:basis-full`, paired with the container's `flex-wrap`), so
        // a >8-show-day show never overflows the strip horizontally. Verified in a
        // real browser at 390px (stack) and 1000px (row) — D4.
        <div className="min-w-0 @min-crew-split:basis-full @min-crew-split:border-l-0">
          <dt className="sr-only" data-search-skip={skip}>
            More show days
          </dt>
          <dd className="min-w-0">
            <details
              data-testid="key-times-shows-overflow"
              // Recessive disclosure. The chevron rotates and the summary label
              // swaps via the native `[open]` attribute (no client JS).
              // `motion-safe:` gates the rotation for reduced-motion users.
              className="group [&[open]_.kt-more]:hidden [&[open]_.kt-fewer]:inline [&[open]_.kt-chev]:rotate-90"
            >
              <summary
                data-search-skip={skip}
                className="flex min-h-tap-min cursor-pointer list-none items-center gap-1.5 border-t border-border pt-2 text-xs font-medium tabular-nums text-text-subtle transition-colors duration-fast marker:content-none hover:text-accent-on-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface [&::-webkit-details-marker]:hidden"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="kt-chev size-3 shrink-0 motion-safe:transition-transform motion-safe:duration-fast"
                >
                  <path
                    d="M6 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="kt-more">+{overflow} more days</span>
                <span className="kt-fewer hidden">Show fewer days</span>
              </summary>
              <dl className="flex flex-col gap-2 pt-2">
                {hiddenShows.map((row) => (
                  // No `anchor` → no `data-anchor`, so these are not counted among
                  // the visible show rows; they still keep <dt>/<dd> + <time> for
                  // association + machine-readable dates.
                  <AnchorRow
                    key={row.rowKey}
                    row={row}
                    anchorClass={stackAnchorClass}
                    searchTarget={searchTargets?.[row.rowKey]}
                  />
                ))}
              </dl>
            </details>
          </dd>
        </div>
      ) : null}

      {strike != null ? (
        <AnchorRow
          row={strike}
          anchorClass={anchorClass}
          searchTarget={searchTargets?.[strike.rowKey]}
        />
      ) : null}
    </dl>
  );
}

/**
 * The rows the strip renders, in render order: Set, the visible show days, the
 * show days folded past `SHOWS_CAP` (still in the DOM, inside the closed
 * `<details>`), Strike. Shared with the search builders so an entry's label and
 * value are the row's own strings.
 */
export function keyTimeRows(anchors: KeyTimeAnchors): {
  set: KeyTimeRow | null;
  visibleShows: KeyTimeRow[];
  hiddenShows: KeyTimeRow[];
  overflow: number;
  strike: KeyTimeRow | null;
  /** Every rendered row, in render order. */
  all: KeyTimeRow[];
} {
  const showAnchors = anchors.shows ?? [];
  const overflow =
    showAnchors.length > SHOWS_CAP ? showAnchors.length - VISIBLE_BEFORE_OVERFLOW : 0;
  const visible = overflow > 0 ? showAnchors.slice(0, VISIBLE_BEFORE_OVERFLOW) : showAnchors;
  const hidden = overflow > 0 ? showAnchors.slice(VISIBLE_BEFORE_OVERFLOW) : [];
  const set: KeyTimeRow | null =
    anchors.set != null ? { rowKey: "set", anchor: "set", label: "Set", value: anchors.set } : null;
  const visibleShows = visible.map(
    (s): KeyTimeRow => ({
      rowKey: `show-${s.date}`,
      anchor: "show",
      label: s.label,
      value: s.time,
      date: s.date,
    }),
  );
  const hiddenShows = hidden.map(
    (s): KeyTimeRow => ({ rowKey: `show-${s.date}`, label: s.label, value: s.time, date: s.date }),
  );
  const strike: KeyTimeRow | null =
    anchors.strike != null
      ? { rowKey: "strike", anchor: "strike", label: "Strike", value: anchors.strike }
      : null;
  const all = [
    ...(set != null ? [set] : []),
    ...visibleShows,
    ...hiddenShows,
    ...(strike != null ? [strike] : []),
  ];
  return { set, visibleShows, hiddenShows, overflow, strike, all };
}
