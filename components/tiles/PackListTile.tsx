/**
 * components/tiles/PackListTile.tsx — pack-list tile (M4 Task 4.9; spec
 * §8.1, §6.10, AC-4.7..4.12).
 *
 * Renders the per-show pull-sheet content for crew on Set / Strike /
 * Load Out days. Visibility is decided by the canonical predicate in
 * `lib/visibility/packList.ts:isPackListVisibleToday` — every gate
 * (today's phase set, PACK_LIST_VISIBLE_PHASES, stage_restriction) lives
 * there, NOT here, so the tile body stays small and the predicate is
 * unit-testable in vitest without spinning a full page.
 *
 * Whole-tile-missing (§8.3, returns null):
 *   1. `pullSheet === null`        → AC-4.9 (sheets without PULL SHEET).
 *   2. `isPackListVisibleToday()`  → AC-4.8 / AC-4.10 (today is a show
 *                                    day, OR stage-restriction excludes
 *                                    today's phases, OR today is not in
 *                                    schedule_phases at all).
 *   3. `pullSheet.length === 0`    → degenerate empty-array; same reflow.
 *
 * Cardinality cap (dispatch instructions):
 *   - Up to 12 cases render inline as <details> blocks.
 *   - When pullSheet.length > 12, the first 12 render and a "+N more
 *     cases" stub (`data-testid="pack-list-overflow-stub"`) renders below
 *     them. M4 ships a static stub (no client-island toggle) — the user
 *     can still scroll the tile body (§8.4 invariant 4: >240px content
 *     enters internal scroll). M9 polish may add the client-side expand.
 *   - Items per case have NO cap — long cases simply scroll inside the
 *     <details> body.
 *
 * AC-4.11 (partial-parse `rawSnippet`):
 *   - `PullSheetItem.rawSnippet` is an optional field at
 *     lib/parser/types.ts:185; when present on an item, render the
 *     snippet inline next to the item label, italicized + text-text-
 *     subtle, and stamp `data-testid="pack-list-item-raw-snippet"` so
 *     the e2e test can locate it. The current M1 parser does NOT emit
 *     rawSnippet on any live fixture row (verified at the parse boundary)
 *     — partial-parse paths set it. The e2e spec injects a synthetic
 *     pullSheet with rawSnippet to drive this branch.
 *
 * AC-4.12 (MI-8c review-pending preservation):
 *   - The contract for M4 is simple: `props.pullSheet` is the source of
 *     truth for what renders. Whatever the upstream staged-snapshot
 *     logic (M6) returns is what the tile shows. There is no internal
 *     "fall back to last good" path here; the projection layer is
 *     responsible for surfacing the appropriate snapshot. The e2e spec
 *     asserts this contract via a comment-only marker test — when the
 *     projection hands a cases array, the tile renders that array
 *     verbatim.
 *
 * data-testid markers:
 *   - `pack-list-tile`            — outer wrapper.
 *   - `pack-list-case`            — one per rendered case (so e2e tests
 *                                    can `.toHaveCount(N)`).
 *   - `pack-list-overflow-stub`   — disclosure stub when N > 12.
 *   - `pack-list-item-raw-snippet`— per-row partial-parse snippet.
 *
 * Server Component (no `'use client'`). Uses the native <details>/<summary>
 * primitive for tap-to-expand, so no client island is needed; the
 * keyboard/screen-reader behavior is built into the browser.
 */
import type { PullSheetCase, PullSheetItem, ShowRow, StageRestriction } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { isPackListVisibleToday } from "@/lib/visibility/packList";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/** Cardinality cap per dispatch instructions — 12 cases inline; rest deferred. */
const CASE_CAP = 12;

type PackListTileProps = {
  /**
   * Pull-sheet cases as projected by `getShowForViewer`. `null` when the
   * source sheet had no PULL SHEET tab (AC-4.9 — whole-tile-missing).
   */
  pullSheet: PullSheetCase[] | null;
  /**
   * Show row, narrowed to the fields the visibility predicate reads.
   * `schedule_phases` and `venue.timezone` are the load-bearing fields;
   * the projection in lib/data/getShowForViewer.ts ensures
   * schedule_phases is always populated (deriving from `dates` when the
   * persisted column is missing).
   */
  show: Pick<ShowRow, "schedule_phases" | "venue">;
  /**
   * Viewer's stage restriction — sourced freshly from
   * `crew_members.stage_restriction` by the page handler. Origin-of-
   * trust contract is identical to scopeTiles' `flags` parameter;
   * caller-supplied stage_restriction is NOT permitted.
   */
  stageRestriction: StageRestriction;
  /**
   * "Today" — supplied as a prop so the tile is a pure function of its
   * inputs (callers wiring `new Date()` into the page handler are
   * responsible for picking the boundary; vitest unit tests on the
   * predicate cover every relevant slice). The e2e spec controls
   * "today" via direct DB schedule_phases mutation rather than time
   * mocks, so the tile picks up `new Date()` via the page.tsx wiring.
   */
  today: Date;
};

/**
 * Compose the human-readable label for a single pull-sheet item:
 *   "8 × FOH Rack (FOH/Mixers)"
 * Defensive on null fields — qty NULL, cat NULL, subCat NULL all collapse
 * to a sensible string with no orphan punctuation.
 *
 * §8.3 generic-optional sentinel-hiding (Codex round-17): cat and
 * subCat are nullable text fields that originate from free-text
 * pull-sheet cells. The parser only trims blank cells; sentinel
 * values like 'TBD' / 'N/A' / 'TBA' survive projection and would
 * otherwise render as `(N/A / TBD)` taxonomy. Routes through the
 * central predicate per lib/visibility/emptyState.ts:27-29.
 */
function formatItemLabel(item: PullSheetItem): string {
  const qtyPart = item.qty !== null ? `${item.qty} × ` : "";
  const main = item.item;
  const cat = shouldHideGenericOptional(item.cat) ? null : item.cat;
  const subCat = shouldHideGenericOptional(item.subCat) ? null : item.subCat;
  const taxonomy = [cat, subCat].filter(Boolean).join(" / ");
  const taxonomyPart = taxonomy ? ` (${taxonomy})` : "";
  return `${qtyPart}${main}${taxonomyPart}`;
}

export function PackListTile({ pullSheet, show, stageRestriction, today }: PackListTileProps) {
  // §8.3 whole-tile-missing — AC-4.9 (no PULL SHEET tab on the source sheet).
  if (pullSheet === null) return null;

  // §8.3 whole-tile-missing — AC-4.8 / AC-4.10 (today not Set/Strike/Load
  // Out, OR stage_restriction excludes today's phases, OR today not in
  // schedule_phases at all).
  if (!isPackListVisibleToday({ show, restriction: stageRestriction, today })) {
    return null;
  }

  // Degenerate empty pull_sheet array (parser found PULL SHEET header
  // but produced zero cases). Treated identically to the null-projection
  // case — the tile reflows out.
  if (pullSheet.length === 0) return null;

  const visibleCases = pullSheet.slice(0, CASE_CAP);
  const overflowCount = Math.max(0, pullSheet.length - CASE_CAP);

  return (
    <Section
      testId="pack-list-tile"
      heading="Pack list"
      headingTone="eyebrow"
      variant="primary"
      ariaLabel="Pack list"
      bodyAs="div"
    >
      <ol className="flex flex-1 flex-col gap-2">
        {visibleCases.map((c, idx) => (
          <li
            key={`${c.caseLabel}-${idx}`}
            data-testid="pack-list-case"
            className="rounded-sm border border-border bg-surface"
          >
            {/*
              <details>/<summary> — native progressive disclosure. The
              summary is the tap target; we declare the §3 44px tap-min
              floor explicitly so a small caseLabel doesn't collapse the
              hit area on mobile. Cursor + outline on focus give the
              keyboard-native affordance.

              Leading numeric prefix (Task 4.13.distill `primary`-variant
              differentiation): a tabular-nums case index sits to the
              left of the case label so the tile reads as a numbered
              list, NOT a stack of identical disclosures. The number
              uses the text-faint color so it's quiet weight; the case
              label remains the primary text.
            */}
            <details className="group">
              <summary
                className={[
                  "flex min-h-tap-min cursor-pointer list-none",
                  "items-center justify-between gap-3",
                  "px-3 py-2 text-sm font-semibold text-text-strong",
                  "rounded-sm",
                  // Hide the default disclosure triangle on Safari/iOS
                  // where the marker styles inconsistently; we render
                  // our own caret below.
                  "[&::-webkit-details-marker]:hidden",
                ].join(" ")}
              >
                <span className="flex flex-1 items-baseline gap-2 truncate">
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-xs font-medium tabular-nums text-text-faint"
                  >
                    {idx + 1}.
                  </span>
                  <span className="truncate">{c.caseLabel || `Case ${idx + 1}`}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-[0.12em] text-text-faint tabular-nums">
                    {c.items.length} {c.items.length === 1 ? "item" : "items"}
                  </span>
                  {/*
                    Custom caret — rotates 90° when the parent <details>
                    is open. Pure CSS via the open: variant on the
                    group; no client island needed.
                  */}
                  <span
                    aria-hidden="true"
                    className={[
                      "inline-block size-3 shrink-0",
                      "transition-transform duration-fast",
                      "group-open:rotate-90",
                    ].join(" ")}
                  >
                    <svg
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-text-faint"
                    >
                      <polyline points="4 3 8 6 4 9" />
                    </svg>
                  </span>
                </span>
              </summary>
              <ul
                className={[
                  "flex flex-col gap-1.5",
                  "border-t border-border",
                  "px-3 py-3 text-sm text-text",
                ].join(" ")}
              >
                {c.items.map((item, itemIdx) => (
                  <li
                    key={`${item.item}-${itemIdx}`}
                    className="flex flex-wrap items-baseline gap-x-2"
                  >
                    <span>{formatItemLabel(item)}</span>
                    {item.rawSnippet ? (
                      <span
                        data-testid="pack-list-item-raw-snippet"
                        className="text-xs italic text-text-subtle"
                      >
                        {item.rawSnippet}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>

      {/*
        Cardinality-cap disclosure stub. Static for M4 — see
        component file-header doc. The text reads "+N more cases" with
        a hint that the source sheet has more. M9 polish may upgrade
        this to a client-side expand toggle.
      */}
      {overflowCount > 0 ? (
        <div
          data-testid="pack-list-overflow-stub"
          data-tile-show-more="true"
          className={["rounded-sm bg-surface-sunken px-3 py-2", "text-sm text-text-subtle"].join(
            " ",
          )}
        >
          <span className="tabular-nums">+{overflowCount}</span>{" "}
          {overflowCount === 1 ? "more case" : "more cases"} on the source pull sheet
        </div>
      ) : null}
    </Section>
  );
}
