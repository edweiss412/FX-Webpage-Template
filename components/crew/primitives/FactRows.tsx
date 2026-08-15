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
 * Props (binding contract): {rows: {k, v, sub?, icon?, testId?, code?, copyLabel?}[]}.
 *
 * Uses the <dl>/<dt>/<dd> idiom (label-before-value for screen readers).
 * Pure synchronous Server Component (no `'use client'`) — the copy control a
 * `copyLabel` row opts into is a client island rendered as a child, which a
 * Server Component may do without becoming one.
 */
import type { ReactNode } from "react";
import { CopyFactValue } from "@/components/crew/primitives/CopyFactValue";
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
  /**
   * Optional `data-testid` for the ROW element. Callers pass data, not JSX, so
   * this is the only place a per-row hook can be declared; a sentinel/empty `v`
   * still omits the row, testid and all.
   */
  testId?: string;
  /**
   * Render the value in `.code-value` — the product's transcription-
   * disambiguation treatment (slashed zero + tabular figures, app/globals.css).
   * Mirrors the per-row flag <KeyValueRows> already ships. Opt-in per row: a
   * value read at a glance (an SSID picked from a phone's network list) gains
   * nothing from it, while a value typed character by character does.
   */
  code?: boolean;
  /**
   * When present and non-empty, the row renders a copy control after the value
   * and this string is its accessible name. Absent/empty leaves the row's
   * markup exactly as it was, which is what keeps every other consumer
   * byte-identical.
   */
  copyLabel?: string;
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
      {present.map((row, i) => {
        const valueClass = `min-w-0 wrap-break-word text-sm font-semibold text-text${
          row.code === true ? " code-value" : ""
        }`;
        // Belt: a row whose value is empty never reaches here (the sentinel
        // filter above drops it), and the one call site only sets `copyLabel`
        // alongside a parsed value — but a control with nothing to copy would
        // be a dead target, so the condition states both halves.
        const copyLabel = row.copyLabel?.trim() ?? "";
        const showCopy = copyLabel.length > 0 && row.v.length > 0;
        return (
          // Mock `.kvrow`: flex row, label left / value right, hairline divider.
          // First row drops top padding (`pt-0`); last row drops the border +
          // bottom padding so the list sits flush in its card.
          //
          // Keyed by `testId` when the caller gave one. The label+index fallback
          // is what shipped, and it is fine for a static list — but optional rows
          // above the Wi-Fi block appear and disappear on a realtime refresh, and
          // an index-derived key remounts every row below the one that moved.
          // For a row carrying a client island that means an in-flight clipboard
          // write loses its owner mid-flight.
          <div
            key={row.testId !== undefined ? row.testId : `${row.k}-${i}`}
            data-testid={row.testId}
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
                  className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-sunken text-text-subtle [&_svg]:size-3.75"
                >
                  {row.icon}
                </span>
              ) : null}
              <span className="whitespace-nowrap">{row.k}</span>
            </dt>

            {/* `.v` — strong value, right-aligned, with an optional muted sub. */}
            <dd className="flex min-w-0 flex-col items-end text-right">
              {/* The dd is a flex COLUMN, so a control cannot be a bare sibling of
                the value span. An opted-in row gets an inline row wrapper; every
                other row renders exactly the children it always did. `gap-3.5`
                (14px) clears the control's 8px leftward reach plus the 4px its
                focus ring paints beyond the border box. */}
              {showCopy ? (
                <div className="flex min-w-0 items-center justify-end gap-3.5">
                  <span className={valueClass}>{row.v}</span>
                  <CopyFactValue
                    value={row.v}
                    label={copyLabel}
                    // Same key the row itself uses: stable across the sibling
                    // churn that would otherwise remount the island, and
                    // distinct between rows, so a vacancy one row offers on
                    // unmount cannot be claimed by another row's island.
                    identity={row.testId !== undefined ? row.testId : `${row.k}-${i}`}
                  />
                </div>
              ) : (
                <span className={valueClass}>{row.v}</span>
              )}
              {row.sub !== undefined ? (
                <span
                  data-slot="fact-row-sub"
                  className="block min-w-0 wrap-break-word text-xs text-text-faint"
                >
                  {row.sub}
                </span>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
