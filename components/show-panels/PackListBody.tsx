/**
 * components/show-panels/PackListBody.tsx
 *
 * The Pack list section body both surfaces render (crew page redesign spec §6.2,
 * `packlist` row): the case list of the admin's `PackListBreakdown`. Each case is
 * a native <details>: the collapsed summary is the case label (or "Case N") and its
 * item count, and expanding reveals the parsed items (qty × item (cat / subCat)). A
 * case with zero items renders as a plain non-expandable line.
 *
 * - Admin: its two caps, its overflow note, and the toggle under `itemsCap`. The
 *   archived-tab affordances stay in `PackListBreakdown`, as siblings after this
 *   body (PR C plan decision 10).
 * - Crew (PR C plan Task 6): no items cap, the raw snippets, numbered cases, items
 *   as body text, its overflow stub, and search targets. The caller builds this only
 *   for a viewer `isPackListVisibleToday` lets through.
 *
 * Plain props, hook-free, no context: the crew page calls it as a function inside
 * `WrappedSection`'s render callback (spec §6.1, error containment), and it calls
 * its own pieces the same way, so every line it runs is inside that catch.
 * `PackCaseItems` is the one client leaf, and with `itemsCap` null it never mounts.
 */
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { PackCaseItems } from "@/components/show-panels/PackCaseItems";
import { arr, hasContent } from "@/components/show-panels/fieldRows";
import { packItemLabel } from "@/components/show-panels/packItemLabel";
import type { PullSheetCase, PullSheetItem } from "@/lib/parser/types";

export { packItemLabel };

/** One case's search targets (lib/search/entryId.ts): its line, and each item's by place. */
export type PackCaseTargets = {
  line?: string;
  items?: readonly (string | undefined)[];
};

export type PackListBodyProps = {
  cases: readonly PullSheetCase[];
  /** Cases shown (the admin's `PACK_LIST_CASES_CAP`, the crew's `CASE_CAP`). */
  cap: number;
  /** What follows a list the cap cut short. Absent, or a list it did not cut: nothing. */
  overflow?: ReactNode;
  /** Items shown before the leaf's toggle; null lists every item with no client code. */
  itemsCap: number | null;
  /** false (the default, admin): an item's label alone. true: its raw row below it. */
  showRawSnippet?: boolean;
  /** false (the default, admin): a `<ul>`. true: an `<ol>`, each case with its index. */
  numbered?: boolean;
  /** "muted" (the default, admin): items as captions. "body": as text, the snippet a caption. */
  itemTone?: "muted" | "body";
  /** Each case's `${testIdPrefix}-pack-case-${index}`, and the raw snippet's id. */
  testIdPrefix: string;
  /**
   * Per case, by its place in `cases`. Given, the body also marks what is not a line:
   * a line with no target and the index are skipped, so no text is left uncovered.
   */
  targets?: readonly PackCaseTargets[];
};

/**
 * An item line's tone. "body" is the crew's: on a Set day these lines are the answer,
 * read on a dock in sunlight, so they hold PRODUCT.md's 7:1 floor, where `text-subtle`
 * measures 6.76:1, and the raw snippet is the step below them.
 */
const ITEM_TONE = {
  muted: { gap: "gap-0.5", text: "text-xs text-text-subtle", snippet: "block italic" },
  body: {
    gap: "gap-1.5",
    text: "text-sm text-text",
    snippet: "block text-xs italic text-text-subtle",
  },
} as const;

type SearchMarker = { "data-search-target"?: string; "data-search-skip"?: "" };

const SKIP: SearchMarker = { "data-search-skip": "" };

/** Under `targets`, a line carries its target, or is skipped. Without them, nothing. */
function lineMarker(lines: PackCaseTargets | undefined, id: string | undefined): SearchMarker {
  if (lines === undefined) return {};
  return id === undefined ? SKIP : { "data-search-target": id };
}

/**
 * The §8 pack-case count pill ("N items", singular-aware — copy preserved). The one
 * piece rendered as an element: the outline census follows a tag inside a `<summary>`,
 * never a call, and a number given to it leaves nothing that could throw.
 */
function PackCountPill({ count }: { count: number }) {
  return (
    <span className="shrink-0 rounded-pill border border-border bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-subtle">
      <span className="tabular-nums">{count}</span> {count === 1 ? "item" : "items"}
    </span>
  );
}

/**
 * The case's place in the list. The reset strips the `<ol>`'s own marker, so this is
 * it. A fixed slot, right-aligned as an `<ol>`'s marker is, so "9." and "10." leave the
 * labels in one column; it holds the two digits the crew's 12-case cap can reach.
 */
function CaseIndex({ index, lines }: { index: number; lines: PackCaseTargets | undefined }) {
  return (
    <span
      aria-hidden="true"
      {...(lines === undefined ? {} : SKIP)}
      className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-text-subtle"
    >
      {index + 1}.
    </span>
  );
}

function ItemRow({
  item,
  j,
  lines,
  showRawSnippet,
  itemTone,
  testIdPrefix,
}: {
  item: PullSheetItem;
  j: number;
  lines: PackCaseTargets | undefined;
  showRawSnippet: boolean;
  itemTone: "muted" | "body";
  testIdPrefix: string;
}) {
  return (
    <li
      key={`${item.item}-${j}`}
      {...lineMarker(lines, lines?.items?.[j])}
      className="wrap-break-word"
    >
      {packItemLabel(item)}
      {showRawSnippet && hasContent(item.rawSnippet) ? (
        <span
          data-testid={`${testIdPrefix}-pack-item-raw-snippet`}
          className={ITEM_TONE[itemTone].snippet}
        >
          {item.rawSnippet}
        </span>
      ) : null}
    </li>
  );
}

function CaseRow({
  c,
  i,
  lines,
  itemsCap,
  showRawSnippet,
  numbered,
  itemTone,
  testIdPrefix,
}: {
  c: PullSheetCase;
  i: number;
  lines: PackCaseTargets | undefined;
  itemsCap: number | null;
  showRawSnippet: boolean;
  numbered: boolean;
  itemTone: "muted" | "body";
  testIdPrefix: string;
}) {
  const items = arr(c.items);
  const label = c.caseLabel || `Case ${i + 1}`;
  const index = numbered ? CaseIndex({ index: i, lines }) : null;
  // No items → nothing to expand; render a plain line (the count still tells the
  // reader the case parsed but is empty).
  if (items.length === 0) {
    return (
      <li
        key={`${label}-${i}`}
        {...lineMarker(lines, lines?.line)}
        className="flex min-h-tap-min items-center gap-2 border-b border-border text-sm text-text last:border-0"
      >
        <span aria-hidden="true" className="size-4 shrink-0" />
        {index}
        <span className="wrap-break-word flex-1 font-medium text-text-strong">{label}</span>
        <PackCountPill count={items.length} />
      </li>
    );
  }
  const rows = items.map((item, j) =>
    ItemRow({ item, j, lines, showRawSnippet, itemTone, testIdPrefix }),
  );
  const tone = ITEM_TONE[itemTone];
  const marker = lineMarker(lines, lines?.line);
  return (
    <li key={`${label}-${i}`} className="border-b border-border text-sm text-text last:border-0">
      <details className="group" data-testid={`${testIdPrefix}-pack-case-${i}`}>
        {/* §8 summary row: ≥44px tap target, chevron rotate on open (transform only),
            count pill. Native marker hidden — the chevron IS the disclosure affordance. */}
        <summary
          data-search-target={marker["data-search-target"]}
          data-search-skip={marker["data-search-skip"]}
          className="flex min-h-tap-min cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"
        >
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-text-subtle transition-transform duration-fast group-open:rotate-90"
          />
          {index}
          <span className="wrap-break-word flex-1 font-medium text-text-strong">{label}</span>
          <PackCountPill count={items.length} />
        </summary>
        {/* The items start under the label: past the chevron, and past the index when
            there is one (16px + 8 gap, then its 20px slot + 8 gap). */}
        <ul
          className={`mb-2 flex flex-col ${tone.gap} ${numbered ? "pl-13" : "pl-6"} ${tone.text}`}
        >
          {itemsCap === null ? rows : <PackCaseItems rows={rows} cap={itemsCap} />}
        </ul>
      </details>
    </li>
  );
}

export function PackListBody({
  cases,
  cap,
  overflow,
  itemsCap,
  showRawSnippet = false,
  numbered = false,
  itemTone = "muted",
  testIdPrefix,
  targets,
}: PackListBodyProps) {
  const List = numbered ? "ol" : "ul";
  return (
    <>
      <List className="flex flex-col">
        {cases.slice(0, cap).map((c, i) =>
          CaseRow({
            c,
            i,
            lines: targets === undefined ? undefined : (targets[i] ?? {}),
            itemsCap,
            showRawSnippet,
            numbered,
            itemTone,
            testIdPrefix,
          }),
        )}
      </List>
      {cases.length > cap ? overflow : null}
    </>
  );
}
