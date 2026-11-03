/**
 * components/show-panels/FieldRowList.tsx
 *
 * The label:value field list the section bodies share (moved here from
 * components/admin/wizard/step3ReviewSections.tsx, crew page redesign PR B plan
 * Task 4; the admin file re-exports it under the same name). Restyled to the
 * mock's `fieldlist` grammar (spec §8): each row a `7.5rem + minmax(0,1fr)`
 * grid, eyebrow key, hairline row separators. The trailing colon on the key is
 * PRESERVED copy ("Venue:", "COI:"): existing suites pin the `Label:` text. The
 * crew drops it (`keyColon: false`), as its other field lists do.
 *
 * Search markers come only from the rows (shared body contract, "Search markers
 * are props"): a row with a `searchTarget` carries `data-search-target`, and its
 * key's colon sits in a `data-search-skip` span so the line's searchable text is
 * its label and value alone. A row without one renders exactly the markup this
 * list rendered before it moved, so the admin popup, which passes none, is
 * unchanged.
 *
 * Server-safe and hook-free (the show-panels boundary,
 * tests/components/show-panels/_metaShowPanelsBoundary.test.ts).
 */
import { cn } from "@/lib/ui/cn";

/** The shared eyebrow-key style (spec §8 field-list grammar). */
export const EYEBROW_CLASS = cn("text-xs font-semibold uppercase text-text-subtle");
export const EYEBROW_STYLE = { letterSpacing: "var(--tracking-eyebrow)" } as const;

/**
 * The smaller eyebrow over a body's cells and bands (the Venue body's "Venue"
 * and "Loading dock"; the admin's transport, hotel and route cells). Moved here
 * from step3ReviewSections.tsx with the Venue body (PR B plan Task 5).
 */
export const CELL_EYEBROW_CLASS = cn(
  "text-[10px] font-semibold uppercase tracking-eyebrow text-text-subtle",
);

export type FieldRow = {
  label: string;
  value: string;
  /** The row's search target id (lib/search/entryId.ts); absent renders no marker. */
  searchTarget?: string;
};

// `contentRows` lives in fieldRows.ts, markup-free, so the contacts derivation can
// read it without this module (PR B invariant-8 gate, row 9); re-exported here.
export { contentRows } from "@/components/show-panels/fieldRows";

export function FieldRowList({
  rows,
  keyColon = true,
}: {
  rows: readonly FieldRow[];
  /**
   * true (the default, admin): each key ends in its colon, "Proposal:". false
   * (crew, PR B invariant-8 gate row 15): the eyebrow key alone, as every other
   * crew field list writes it.
   */
  keyColon?: boolean;
}) {
  return (
    <ul className="flex flex-col">
      {rows.map((r) => (
        <li
          key={r.label}
          data-search-target={r.searchTarget}
          className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-b border-border py-2 last:border-0"
        >
          <span className={EYEBROW_CLASS} style={EYEBROW_STYLE}>
            {r.label}
            {!keyColon ? null : r.searchTarget === undefined ? (
              ":"
            ) : (
              <span data-search-skip="">:</span>
            )}
          </span>
          <span className="wrap-break-word text-sm text-text">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
