/**
 * components/crew/primitives/KeyValueRows.tsx — crew-redesign §4.6 primitive.
 *
 * A description-list of key/value rows. A row is OMITTED entirely when its
 * value is empty or a generic sentinel — visibility routes through the single
 * `shouldHideGenericOptional` predicate (lib/visibility/emptyState.ts), never
 * an inline string-list. Present rows render an eyebrow `k` label, the `v`
 * value, and an optional `sub` secondary line. An optional per-row `icon`
 * renders inline before the value.
 *
 * Props (binding contract): {rows: {k, v, sub?, icon?}[]}.
 *
 * Mirrors the <dt>/<dd> idiom of components/atoms/KeyValue.tsx so screen
 * readers announce label-before-value. Server Component (no `'use client'`).
 */
import type { ReactNode } from "react";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

export type KeyValueRow = {
  /** Eyebrow label rendered as the <dt>. */
  k: string;
  /** Value rendered as the <dd>. A sentinel/empty value omits the whole row. */
  v: string;
  /** Optional secondary line under the value. */
  sub?: string;
  /** Optional leading glyph rendered inline before the value. */
  icon?: ReactNode;
  /**
   * Grid-span hint, honored ONLY when the list is in 2-column mode
   * (`columns={2}`). `2` makes this row occupy the full card width (both
   * columns) at ≥720px — for a headline field (hotel/venue name, address) that
   * reads better full-bleed above the short paired fields (check-in/out). No
   * effect in the default single-column mode. Defaults to a 1-column cell.
   */
  span?: 1 | 2;
};

type KeyValueRowsProps = {
  rows: KeyValueRow[];
  /**
   * Column count (default `1`):
   *
   *   - `1` — the original single vertical column (every existing consumer).
   *   - `2` — at ≥720px the present rows flow into a 2-up grid so short fields
   *     (dates, codes) sit side-by-side and a card fills its width instead of
   *     leaving a tall empty right side. Below 720px it stays a single stacked
   *     column. Individual rows opt into full width via `span: 2`.
   *
   * Additive: the DOM shape (`<dl>` → per-row `<div>` → `<dt>`/`<dd>`) and the
   * sentinel-hiding contract are unchanged, so the `data-testid` / `dt`-count
   * contracts every consumer and test depends on still hold.
   */
  columns?: 1 | 2;
};

export function KeyValueRows({ rows, columns = 1 }: KeyValueRowsProps) {
  // Sentinel-hiding is the single source of truth for "is this value worth a
  // row?" — `''`, `TBD`, `N/A`, `TBA` (case-insensitive) all reflow out.
  const present = rows.filter((row) => !shouldHideGenericOptional(row.v));

  const grid = columns === 2;

  return (
    <dl
      data-testid="key-value-rows"
      data-columns={columns}
      // `grid` mode collapses to a single column below 720px (the safe mobile
      // stack); the 2-up grid only engages at the crew ≥720px split-wide
      // breakpoint. `gap-x-6` widens the inter-column gutter; the row gap stays
      // `gap-3`. Default (`columns={1}`) keeps the original flex stack byte-for-byte.
      className={
        grid
          ? "grid grid-cols-1 gap-3 min-[720px]:grid-cols-2 min-[720px]:gap-x-6"
          : "flex flex-col gap-3"
      }
    >
      {present.map((row, i) => (
        // `min-w-0` lets this row collapse below its content width inside a narrow
        // flex slot (the §4.9 quick-cards row at 390px ≈ 110px per card); without
        // it a long unbroken `v` (hotel/venue name) would force the card wider than
        // its slot and overflow off the right viewport edge. In 2-up mode a
        // `span: 2` row spans both columns at ≥720px (headline fields).
        <div
          key={`${row.k}-${i}`}
          className={
            grid && row.span === 2
              ? "flex min-w-0 flex-col gap-1 min-[720px]:col-span-2"
              : "flex min-w-0 flex-col gap-1"
          }
        >
          <dt className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
            {row.k}
          </dt>
          <dd className="flex min-w-0 flex-col gap-0.5 text-sm/snug">
            <span className="flex min-w-0 items-center gap-1.5 text-text">
              {row.icon !== undefined ? (
                <span aria-hidden="true" className="flex shrink-0 items-center text-text-subtle">
                  {row.icon}
                </span>
              ) : null}
              {/* `min-w-0 wrap-break-word` so a long unbroken value wraps inside
                  the slot instead of forcing horizontal overflow at 390px.
                  `tabular-nums` per DESIGN.md §2.4: values here include dates +
                  confirmation codes (hotel check-in/out, conf #s) whose digits
                  should align and not shift width. tnum is a no-op on the
                  alphabetic-only values, so applying it to the shared value span
                  is safe across every consumer. */}
              <span className="min-w-0 wrap-break-word tabular-nums">{row.v}</span>
            </span>
            {row.sub !== undefined ? (
              <span className="text-xs text-text-subtle">{row.sub}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
