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
};

type KeyValueRowsProps = {
  rows: KeyValueRow[];
};

export function KeyValueRows({ rows }: KeyValueRowsProps) {
  // Sentinel-hiding is the single source of truth for "is this value worth a
  // row?" — `''`, `TBD`, `N/A`, `TBA` (case-insensitive) all reflow out.
  const present = rows.filter((row) => !shouldHideGenericOptional(row.v));

  return (
    <dl data-testid="key-value-rows" className="flex flex-col gap-3">
      {present.map((row, i) => (
        // `min-w-0` lets this row collapse below its content width inside a narrow
        // flex slot (the §4.9 quick-cards row at 390px ≈ 110px per card); without
        // it a long unbroken `v` (hotel/venue name) would force the card wider than
        // its slot and overflow off the right viewport edge.
        <div key={`${row.k}-${i}`} className="flex min-w-0 flex-col gap-1">
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
              {/* `min-w-0 break-words` so a long unbroken value wraps inside the
                  slot instead of forcing horizontal overflow at 390px.
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
