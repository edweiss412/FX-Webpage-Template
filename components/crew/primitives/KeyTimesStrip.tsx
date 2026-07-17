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
 * expands the hidden days INLINE on tap (D2) — a `<summary>` is natively a
 * button with `aria-expanded`, so keyboard + SR work with zero client JS and
 * the component stays a Server Component.
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
   *     1fr "Crew Schedule" card) and at <720px everywhere. The e2e
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
   * `[data-anchor]` element whose FIRST `<span>` (inside `<dt>`) is the label and
   * LAST `<span>` (inside `<dd>`) is the value (inv6 reads `span.first()` /
   * `span.last()`).
   */
  layout?: "stack" | "row";
};

/**
 * Show rows are capped at 8 (§6). When `shows.length > SHOWS_CAP`, the first 7
 * show rows render and the remainder collapse into a single overflow disclosure.
 */
const SHOWS_CAP = 8;
/** Rows shown before the overflow disclosure when the cap is exceeded. */
const VISIBLE_BEFORE_OVERFLOW = SHOWS_CAP - 1;

/**
 * One rendered row. `anchor` is `undefined` for a disclosed overflow row so it
 * carries no `data-anchor` (and is therefore not counted by the
 * `[data-anchor="show"]` selector); `date` stamps `data-anchor-date` and wraps
 * the label in `<time>` on a per-day show row so a specific day can be targeted
 * and the date is machine-readable.
 */
type Row = {
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
function AnchorRow({ row, anchorClass }: { row: Row; anchorClass: string }) {
  const labelNode = row.date != null ? <time dateTime={row.date}>{row.label}</time> : row.label;
  return (
    <div
      {...(row.anchor != null ? { "data-anchor": row.anchor } : {})}
      {...(row.date != null ? { "data-anchor-date": row.date } : {})}
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

export function KeyTimesStrip({ anchors, layout = "stack" }: KeyTimesStripProps) {
  const showAnchors = anchors.shows ?? [];
  const overflow =
    showAnchors.length > SHOWS_CAP ? showAnchors.length - VISIBLE_BEFORE_OVERFLOW : 0;
  const visibleShows = overflow > 0 ? showAnchors.slice(0, VISIBLE_BEFORE_OVERFLOW) : showAnchors;
  const hiddenShows = overflow > 0 ? showAnchors.slice(VISIBLE_BEFORE_OVERFLOW) : [];

  const hasAny =
    anchors.set != null || visibleShows.length > 0 || overflow > 0 || anchors.strike != null;
  // Everything absent → render nothing so no empty strip reflows in.
  if (!hasAny) return null;

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
    <dl data-testid="key-times-strip" data-layout={layout} className={containerClass}>
      {anchors.set != null ? (
        <AnchorRow
          row={{ rowKey: "set", anchor: "set", label: "Set", value: anchors.set }}
          anchorClass={anchorClass}
        />
      ) : null}

      {visibleShows.map((s) => (
        <AnchorRow
          key={`show-${s.date}`}
          row={{
            rowKey: `show-${s.date}`,
            anchor: "show",
            label: s.label,
            value: s.time,
            date: s.date,
          }}
          anchorClass={anchorClass}
        />
      ))}

      {overflow > 0 ? (
        // The overflow is a real <dt>/<dd> group so the outer <dl> content model
        // stays valid — a <dl> permits only <dt>/<dd> or <div> groups, never a
        // bare <details>. The <dd> legally holds the disclosure, and the hidden
        // days nest under the "More show days" term as their definition, so a SR
        // reads them as a continuation of the key-times list, not a stray list.
        <div className="min-w-0">
          <dt className="sr-only">More show days</dt>
          <dd className="min-w-0">
            <details
              data-testid="key-times-shows-overflow"
              // Recessive disclosure. The chevron rotates and the summary label
              // swaps via the native `[open]` attribute (no client JS).
              // `motion-safe:` gates the rotation for reduced-motion users.
              className="group [&[open]_.kt-more]:hidden [&[open]_.kt-fewer]:inline [&[open]_.kt-chev]:rotate-90"
            >
              <summary className="flex min-h-tap-min cursor-pointer list-none items-center gap-1.5 border-t border-border pt-2 text-xs font-medium tabular-nums text-text-subtle transition-colors duration-fast marker:content-none hover:text-accent-on-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface [&::-webkit-details-marker]:hidden">
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
                {hiddenShows.map((s) => (
                  // No `anchor` → no `data-anchor`, so these are not counted among
                  // the visible show rows; they still keep <dt>/<dd> + <time> for
                  // association + machine-readable dates.
                  <AnchorRow
                    key={`show-${s.date}`}
                    row={{ rowKey: `show-${s.date}`, label: s.label, value: s.time, date: s.date }}
                    anchorClass={anchorClass}
                  />
                ))}
              </dl>
            </details>
          </dd>
        </div>
      ) : null}

      {anchors.strike != null ? (
        <AnchorRow
          row={{ rowKey: "strike", anchor: "strike", label: "Strike", value: anchors.strike }}
          anchorClass={anchorClass}
        />
      ) : null}
    </dl>
  );
}
