/**
 * components/crew/primitives/FactRows.tsx — crew-mock-fidelity Task 6 primitive.
 *
 * The HORIZONTAL fact list — the mock's `.kvrow` (crew/styles.css). Distinct
 * from the VERTICAL <KeyValueRows> (the `.kv` grid of stacked label/value
 * pairs): here each row lays `k` out on the LEFT (an optional 28px sunken
 * mini-icon square + a subtle label) and `v` on the RIGHT (a strong value
 * with an optional muted `sub` line below). Rows are separated by a hairline
 * bottom border; the first row drops its top padding and the last drops its
 * bottom border + padding so the list sits flush inside a SectionCard.
 *
 * A row is OMITTED entirely when its value is empty or a generic sentinel —
 * visibility routes through the single `shouldHideGenericOptional` predicate
 * (lib/visibility/emptyState.ts), never an inline string-list. This is the
 * same §8.3 sentinel-hiding contract <KeyValueRows> honors, so the structural
 * meta-test (tests/components/tiles/_metaSentinelHidingContract.test.ts) that
 * walks components/crew/primitives/ stays green: FactRows reads `row.v` and
 * routes it through `shouldHideGenericOptional` at the read site.
 *
 * Props (binding contract): {rows: {k, v, sub?, icon?}[]}.
 *
 * Uses the <dl>/<dt>/<dd> idiom (label-before-value for screen readers).
 * Pure synchronous Server Component (no `'use client'`).
 */
import type { ReactNode } from "react";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

export type FactRow = {
  /** Left-side label rendered as the <dt>. */
  k: string;
  /** Right-side value rendered as the <dd>. A sentinel/empty value omits the whole row. */
  v: string;
  /** Optional muted secondary line under the value. */
  sub?: string;
  /** Optional glyph rendered inside the 28px sunken mini-icon square left of `k`. */
  icon?: ReactNode;
};

type FactRowsProps = {
  rows: FactRow[];
};

export function FactRows({ rows }: FactRowsProps) {
  // Sentinel-hiding is the single source of truth for "is this value worth a
  // row?" — `''`, `TBD`, `N/A`, `TBA` (case-insensitive) all reflow out.
  const present = rows.filter((row) => !shouldHideGenericOptional(row.v));

  return (
    <dl data-testid="fact-rows" className="flex flex-col">
      {present.map((row, i) => (
        // Mock `.kvrow`: flex row, label left / value right, hairline divider.
        // First row drops top padding (`pt-0`); last row drops the border +
        // bottom padding so the list sits flush in its card.
        <div
          key={`${row.k}-${i}`}
          className="flex items-center justify-between gap-3.5 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0"
        >
          {/* `.k` — mini-icon square (optional) + subtle label, on the left.
              `shrink-0` keeps the label column at its intrinsic width so a long
              unbroken `.v` value (e.g. a multi-address Parking blob) can't squeeze
              the label below its content box and force the short label ("Parking")
              to wrap one-character-per-line. The label text itself is
              `whitespace-nowrap`; only the VALUE column wraps. */}
          <dt className="flex shrink-0 items-center gap-2.5 text-sm text-text-subtle">
            {row.icon !== undefined ? (
              <span
                data-slot="fact-row-icon"
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-sunken text-text-subtle [&_svg]:size-[15px]"
              >
                {row.icon}
              </span>
            ) : null}
            <span className="whitespace-nowrap">{row.k}</span>
          </dt>

          {/* `.v` — strong value, right-aligned, with an optional muted sub. */}
          <dd className="flex min-w-0 flex-col items-end text-right">
            <span className="min-w-0 break-words text-sm font-semibold text-text">{row.v}</span>
            {row.sub !== undefined ? (
              <span
                data-slot="fact-row-sub"
                className="block min-w-0 break-words text-xs text-text-faint"
              >
                {row.sub}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
