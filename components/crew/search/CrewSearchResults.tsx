"use client";

/**
 * components/crew/search/CrewSearchResults.tsx — grouped search results (crew
 * show search spec §6.3 to §6.8).
 *
 * Renders inside `CrewSections`' search panel, below the Hint line, and shows
 * content only in the Results and No match states:
 *
 * - Chips (`nav`, "Filter results by section"): All first, then one per section
 *   with hits in result order, each with its count. A changed query resets the
 *   chip to All; a refresh that leaves the chosen section without hits falls
 *   back to All.
 * - All view: up to 5 rows per section, then "Show all n in Section", which
 *   selects that chip. Section view: up to 50 rows, then a narrowing note.
 * - A row is one button that opens its line through `openSectionAndReveal` and
 *   ends search keeping the query; a copyable value gets a sibling 44px copy
 *   button and a "copied" toast (local to this island, not a global system).
 * - The report row ("Not what you need?") is always the last block, unless the
 *   page has reporting off.
 * - A polite status region announces the result count 300 ms after the last
 *   change.
 *
 * Dimensional invariants (spec §6.9): the row button is `flex-1 min-w-0`; the
 * copy button is `size-tap-min`, `self-center`, `shrink-0`.
 */

import { CheckIcon, ChevronRightIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { SECTION_ICON, SECTION_LABELS } from "@/components/crew/CrewSubNav";
import { useSectionController } from "@/components/crew/sectionController";
import { useCrewSearch } from "@/components/crew/search/CrewSearchProvider";
import { ReportModal, type ReportAutocapture } from "@/components/shared/ReportModal";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { SEARCH_COPY } from "@/lib/search/copy";
import { snippet } from "@/lib/search/snippet";
import type { Range, SearchCopy, SearchEntry, SearchHit } from "@/lib/search/types";
import { cn } from "@/lib/ui/cn";
import { COPY_FEEDBACK_RESET_MS } from "@/lib/ui/copyFeedback";

/** Rows per section in the All view. */
const ALL_VIEW_ROWS = 5;
/** Rows in a single section's view. */
const SECTION_VIEW_ROWS = 50;
/** Values this short read as a fact (semibold); longer ones read as body text. */
const SHORT_VALUE_CHARS = 40;
/** Delay before the result count is announced, so it speaks once typing stops. */
const RESULT_COUNT_ANNOUNCE_MS = 300;
/**
 * How long the copy-failure toast stays. It is an 11-word instruction, not a
 * confirmation, so it outlasts the 2 s `COPY_FEEDBACK_RESET_MS` a "copied" toast
 * gets (impeccable critique A6, audit U4).
 */
const COPY_FAILED_TOAST_MS = 6000;

type Chip = SectionId | "all";
type Toast = { id: number; text: string; copied: boolean };

/**
 * `text` as nodes, with each range wrapped in `<mark>`. A plain function rather
 * than a component, so the row button holds only DOM elements.
 */
function highlighted(text: string, ranges: readonly Range[], keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const { start, end } of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark
        key={`${keyPrefix}-${start}`}
        className="rounded-sm bg-warning-bg px-0.5 text-warning-text"
      >
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/**
 * Copy kinds whose value someone types back character by character. Their rows
 * on the page carry `.code-value` (slashed zero, tabular figures: the Wi-Fi
 * password in `venueRows.ts`, both confirmations in Travel), so their result
 * rows do too. The network name is picked from a list and takes neither.
 */
const CODE_KINDS: ReadonlySet<SearchCopy["kind"]> = new Set([
  "password",
  "hotelConfirmation",
  "flightConfirmation",
]);

/** The copy button's name, one per copy kind (spec §10). */
function copyButtonLabel(copy: SearchCopy): string {
  return SEARCH_COPY.copyButton[copy.kind];
}

function ResultRow({
  hit,
  onOpen,
  onCopy,
}: {
  hit: SearchHit;
  onOpen: (entry: SearchEntry) => void;
  onCopy: (copy: SearchCopy) => void;
}) {
  const { entry, ranges, aliasNote } = hit;
  const meta: { key: string; text: string; ranges: Range[] }[] = [];
  if (entry.group !== "") meta.push({ key: "group", text: entry.group, ranges: ranges.group });
  if (entry.label !== null && entry.label !== "") {
    meta.push({ key: "label", text: entry.label, ranges: ranges.label });
  }
  const value = snippet(entry.value, ranges.value);
  const short = entry.value.length <= SHORT_VALUE_CHARS;
  const copy = entry.copy;
  const code = copy !== null && CODE_KINDS.has(copy.kind);

  return (
    <li
      data-testid="crew-search-row"
      data-entry-id={entry.id}
      className="flex items-center border-t border-border first:border-t-0"
    >
      <button
        type="button"
        data-testid="crew-search-row-open"
        onClick={() => onOpen(entry)}
        className="flex min-h-tap-min min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-3 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          {meta.length > 0 ? (
            <span data-testid="crew-search-row-meta" className="text-sm text-text-subtle">
              {meta.flatMap((part, i) => [
                ...(i > 0 ? [" · "] : []),
                ...highlighted(part.text, part.ranges, part.key),
              ])}
            </span>
          ) : null}
          <span
            data-testid="crew-search-row-value"
            className={cn(
              short
                ? "text-base font-semibold text-text-strong wrap-anywhere"
                : "text-base text-text wrap-anywhere",
              code && "code-value",
            )}
          >
            {highlighted(value.text, value.ranges, "value")}
          </span>
          {aliasNote !== null ? (
            <span className="mt-1 inline-flex items-center rounded-pill bg-info-bg px-2 py-0.5 text-xs text-text-subtle">
              {SEARCH_COPY.aliasNote(aliasNote)}
            </span>
          ) : null}
        </span>
        {copy === null ? (
          <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-text-faint" />
        ) : null}
      </button>
      {copy !== null ? (
        <button
          type="button"
          data-testid="crew-search-copy"
          aria-label={copyButtonLabel(copy)}
          onClick={() => onCopy(copy)}
          className="mr-1.5 inline-flex size-tap-min shrink-0 items-center justify-center self-center rounded-sm text-text transition-colors duration-fast hover:bg-surface-sunken hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <CopyIcon aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </li>
  );
}

function ChipButton({
  chip,
  label,
  count,
  pressed,
  onSelect,
}: {
  chip: Chip;
  label: string;
  count: number;
  pressed: boolean;
  onSelect: (chip: Chip) => void;
}) {
  return (
    <button
      type="button"
      data-section={chip}
      aria-pressed={pressed}
      onClick={() => onSelect(chip)}
      className={
        "inline-flex min-h-tap-min shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3.5 text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
        // The selected chip is also semibold, so the state survives forced colors
        // as weight as well as the stylesheet's aria-pressed Highlight fill.
        (pressed
          ? "border-text bg-text font-semibold text-bg"
          : "border-text-faint bg-surface font-medium text-text hover:border-text-subtle")
      }
    >
      <span data-chip-label="">{label}</span> <span className="tabular-nums">{count}</span>
    </button>
  );
}

export function CrewSearchResults() {
  const { query, result, phase, endSearch, showId, cardReport } = useCrewSearch();
  const { openSectionAndReveal } = useSectionController();

  // Chip selection. A changed query resets it to All (spec §6.3); a refresh
  // that leaves the chosen section without hits falls back to All (§6.10).
  const [chip, setChip] = useState<Chip>("all");
  const [chipQuery, setChipQuery] = useState(query);
  if (query !== chipQuery) {
    setChipQuery(query);
    setChip("all");
  } else if (chip !== "all" && !result.sections.some((s) => s.section === chip)) {
    setChip("all");
  }

  // The copy toast: a second copy replaces the first and restarts the window,
  // which is the replacing toast's own (short for "copied", long for failure).
  const [toast, setToast] = useState<Toast | null>(null);
  const toastSeq = useRef(0);
  useEffect(() => {
    if (toast === null) return;
    const dismiss = () => setToast(null);
    // Two calls, each with a named delay, so the timing inventory scanner
    // resolves both (DESIGN.md §5.5); a computed delay would report unclassified.
    const timer = toast.copied
      ? window.setTimeout(dismiss, COPY_FEEDBACK_RESET_MS)
      : window.setTimeout(dismiss, COPY_FAILED_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = (text: string, copied: boolean) => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text, copied });
  };

  const onCopy = (copy: SearchCopy) => {
    const failed = () => showToast(SEARCH_COPY.copyFailed, false);
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) {
      failed();
      return;
    }
    clipboard
      .writeText(copy.text)
      .then(() => showToast(SEARCH_COPY.copied[copy.kind], true), failed);
  };

  const onOpen = (entry: SearchEntry) => {
    endSearch({ keepQuery: true });
    openSectionAndReveal(entry.section, entry.id);
  };

  // The result count, spoken once typing stops.
  const countMessage =
    phase === "results" || phase === "nomatch" ? SEARCH_COPY.resultCount(result.total) : "";
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnounced(countMessage), RESULT_COUNT_ANNOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [countMessage, query]);

  const [reportOpen, setReportOpen] = useState(false);
  const reporting = cardReport !== null && showId !== "";

  const showing = phase === "results" || phase === "nomatch";
  const visible =
    chip === "all" ? result.sections : result.sections.filter((s) => s.section === chip);

  const reportAutocapture: ReportAutocapture | null = reporting
    ? {
        ...cardReport.extraContext,
        viewerVisibleSection: "search",
        rawSnippet: SEARCH_COPY.searchedFor(query.trim()),
      }
    : null;

  return (
    <div data-testid="crew-search-results" className="flex flex-col gap-6">
      {phase === "results" ? (
        <nav aria-label={SEARCH_COPY.chipsNav} className="flex gap-2 overflow-x-auto py-1">
          <ChipButton
            chip="all"
            label={SEARCH_COPY.allChip}
            count={result.total}
            pressed={chip === "all"}
            onSelect={setChip}
          />
          {result.sections.map(({ section, rows }) => (
            <ChipButton
              key={section}
              chip={section}
              label={SECTION_LABELS[section]}
              count={rows.length}
              pressed={chip === section}
              onSelect={setChip}
            />
          ))}
        </nav>
      ) : null}

      {phase === "results"
        ? visible.map(({ section, rows }) => {
            const cap = chip === "all" ? ALL_VIEW_ROWS : SECTION_VIEW_ROWS;
            const Icon = SECTION_ICON[section];
            const headingId = `crew-search-group-${section}`;
            return (
              <section
                key={section}
                data-testid="crew-search-group"
                data-section={section}
                aria-labelledby={headingId}
                className="flex flex-col gap-2"
              >
                <h2
                  id={headingId}
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-eyebrow text-text-strong"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-6 items-center justify-center rounded-sm bg-surface-sunken text-text-subtle"
                  >
                    <Icon className="size-3.5" />
                  </span>
                  {SECTION_LABELS[section]}
                </h2>
                <ul className="overflow-hidden rounded-md border border-border bg-surface shadow-tile">
                  {rows.slice(0, cap).map((hit) => (
                    <ResultRow key={hit.entry.id} hit={hit} onOpen={onOpen} onCopy={onCopy} />
                  ))}
                </ul>
                {chip === "all" && rows.length > ALL_VIEW_ROWS ? (
                  <button
                    type="button"
                    onClick={() => setChip(section)}
                    className="inline-flex min-h-tap-min items-center self-start rounded-sm px-1 text-sm font-semibold text-text underline underline-offset-4 hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    {SEARCH_COPY.showAll(rows.length, SECTION_LABELS[section])}
                  </button>
                ) : null}
                {chip !== "all" && rows.length > SECTION_VIEW_ROWS ? (
                  <p className="text-sm text-text-subtle">{SEARCH_COPY.sectionCapNote}</p>
                ) : null}
              </section>
            );
          })
        : null}

      {phase === "nomatch" ? <p className="text-base text-text">{SEARCH_COPY.noMatch}</p> : null}

      {showing && reporting ? (
        <div
          data-testid="crew-search-report"
          className="flex items-center gap-3 rounded-md border border-dashed border-border-strong p-4"
        >
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-text-strong">{SEARCH_COPY.reportTitle}</p>
            <p className="text-sm text-text-subtle">{SEARCH_COPY.reportBody}</p>
          </div>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex min-h-tap-min shrink-0 items-center rounded-pill border border-text-faint bg-surface px-4 text-sm font-semibold text-text transition-colors duration-fast hover:border-text-subtle hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {SEARCH_COPY.reportButton}
          </button>
        </div>
      ) : null}

      {reportOpen && reportAutocapture !== null && cardReport !== null ? (
        <ReportModal
          open={reportOpen}
          onOpenChange={setReportOpen}
          surface={cardReport.surface}
          surfaceId={`${cardReport.surfaceIdScope}-search-${showId}`}
          showId={showId}
          autocapture={reportAutocapture}
        />
      ) : null}

      <p data-testid="crew-search-count" role="status" className="sr-only">
        {announced}
      </p>
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 top-4 z-banner flex justify-center px-4"
      >
        {toast !== null ? (
          <p
            key={toast.id}
            data-testid="crew-search-toast"
            className="flex min-h-10 items-center gap-2 rounded-pill bg-text px-4 py-2 text-sm font-semibold text-bg shadow-popover"
          >
            {toast.copied ? <CheckIcon aria-hidden="true" className="size-4 shrink-0" /> : null}
            {toast.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
