/**
 * components/show-panels/FieldRowList.tsx
 *
 * The label:value field list the section bodies share (moved here from
 * components/admin/wizard/step3ReviewSections.tsx, crew page redesign PR B plan
 * Task 4; the admin file re-exports it under the same name). Restyled to the
 * mock's `fieldlist` grammar (spec §8): each row a `7.5rem + minmax(0,1fr)`
 * grid, eyebrow key, hairline row separators. The trailing colon on the key is
 * PRESERVED copy ("Venue:", "COI:"): existing suites pin the `Label:` text.
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

export type FieldRow = {
  label: string;
  value: string;
  /** The row's search target id (lib/search/entryId.ts); absent renders no marker. */
  searchTarget?: string;
};

export function FieldRowList({ rows }: { rows: readonly FieldRow[] }) {
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
            {r.searchTarget === undefined ? ":" : <span data-search-skip="">:</span>}
          </span>
          <span className="wrap-break-word text-sm text-text">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
