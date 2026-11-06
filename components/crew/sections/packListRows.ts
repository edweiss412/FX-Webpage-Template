/**
 * components/crew/sections/packListRows.ts — the Pack list section's model, read by
 * `PackListSection` and the search builder (lib/search/sections/packlist.ts), so the
 * page and the index cannot disagree about which lines exist, in what order, or under
 * which id (spec §2.4, INV-1).
 *
 * One model: the cases the shared body renders, a search target per line, and the
 * entries in render order. The lines live in the card's region under the registry
 * label. Cases past `CASE_CAP` are not rendered, so they carry no lines.
 *
 * No gate here: `packlist` is an entitlement (PR C plan decision 1), so the shell
 * builds the section only for a viewer `isPackListVisibleToday` lets through, and the
 * builder asks the same predicate. No `"use client"`: the builder runs on the server.
 */
import { searchLine, type Seen } from "@/components/crew/sections/sectionLines";
import { arr, hasContent } from "@/components/show-panels/fieldRows";
import { packItemLabel } from "@/components/show-panels/packItemLabel";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { PullSheetCase } from "@/lib/parser/types";
import type { SearchEntry } from "@/lib/search/types";
import type { CardId } from "@/lib/sheet-links/buildSheetDeepLink";
import { showSection } from "@/lib/showSections/registry";

/**
 * Pack-list cases rendered inline; cases past it are not in the DOM (a "+N more"
 * stub renders instead). Exported so the cap-boundary test reads the live value.
 */
export const CASE_CAP = 12;

/** The panel card's id, and the search region of its lines. */
export const PACK_LIST_CARD_ID = "gear-pack-list" satisfies CardId;

/** One case's search targets, the shape `PackListBody` takes. */
type PackCaseLines = { line?: string; items: (string | undefined)[] };

export type PackListModel = {
  /** Every case on the sheet. A partial projection's non-list reads as none. */
  cases: readonly PullSheetCase[];
  /** Per case the cap keeps, its search targets. */
  targets: PackCaseLines[];
  /** Every line, in render order. */
  entries: SearchEntry[];
  /** The cases the cap cut. */
  overflowCount: number;
};

export function packList(data: Pick<ShowForViewer, "pullSheet">): PackListModel {
  const cases = arr(data.pullSheet);
  const group = showSection("packlist").label;
  const seen: Seen = new Map();
  const entries: SearchEntry[] = [];
  const line = (value: string, context: readonly (string | undefined)[]) => {
    const entry = searchLine("packlist", PACK_LIST_CARD_ID, group, null, value, context, seen);
    if (entry !== null) entries.push(entry);
    return entry;
  };

  const targets = cases.slice(0, CASE_CAP).map((c): PackCaseLines => {
    const items = arr(c.items);
    const count = `${items.length} ${items.length === 1 ? "item" : "items"}`;
    // The summary's line. An invented "Case N" label is not sheet data, so it has none.
    const summary = c.caseLabel ? line(c.caseLabel, [count]) : null;
    return {
      ...(summary === null ? {} : { line: summary.id }),
      // An item is one line: its label, with the raw sheet snippet beside it.
      items: items.map((item) => {
        const snippets = hasContent(item.rawSnippet) ? [item.rawSnippet] : [];
        return line(packItemLabel(item), [...snippets, summary?.value])?.id;
      }),
    };
  });

  return { cases, targets, entries, overflowCount: Math.max(0, cases.length - CASE_CAP) };
}
