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
        <div key={`${row.k}-${i}`} className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-eyebrow text-text-faint">
            {row.k}
          </dt>
          <dd className="flex flex-col gap-0.5 text-sm/snug">
            <span className="flex items-center gap-1.5 text-text">
              {row.icon !== undefined ? (
                <span aria-hidden="true" className="flex shrink-0 items-center text-text-faint">
                  {row.icon}
                </span>
              ) : null}
              <span>{row.v}</span>
            </span>
            {row.sub !== undefined ? <span className="text-xs text-text-subtle">{row.sub}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
