"use client";

/**
 * components/crew/search/CrewSearchProvider.tsx — shared state for crew show
 * search (spec §9.2).
 *
 * Wraps `Header` and `CrewSections` in `_CrewShell`, above both, so the field in
 * the header and the results in the section area read one state. It holds the
 * server-built index, the query, whether search is active, and `missLogging`.
 *
 * FRESHNESS: the index arrives as a prop on every server render, including every
 * `ShowRealtimeBridge → router.refresh()`. Nothing here fetches, caches or
 * derives section data; a new index simply re-runs the current query.
 *
 * Phase (spec §6.2): Idle (not active), Hint (active, query under 2 normalized
 * characters), Results (at least one hit), No match (searched, zero hits).
 *
 * Missed searches (spec §7.1): with `missLogging` on, a No match query is sent
 * to `/api/show/<slug>/search-miss` once typing has rested for MISS_DEBOUNCE_MS,
 * or at once when search ends on it. Each normalized query goes at most once per
 * page load (this provider lives as long as the page). The send is
 * fire-and-forget: a failure is ignored, with no UI and no retry.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import type { CardReportContext } from "@/lib/crew/cardReportContext";
import { isSearchableQuery, prepareIndex, searchIndex } from "@/lib/search/match";
import { normalize } from "@/lib/search/normalize";
import type { SearchIndex, SearchResult } from "@/lib/search/types";

/** How long typing rests on a zero-hit query before it counts as a miss. */
const MISS_DEBOUNCE_MS = 2000;

export type SearchPhase = "idle" | "hint" | "results" | "nomatch";

export type CrewSearchState = {
  index: SearchIndex;
  query: string;
  setQuery: (query: string) => void;
  active: boolean;
  setActive: (active: boolean) => void;
  missLogging: boolean;
  /** The page's show id, for the report row. */
  showId: string;
  /**
   * The page's card report bundle (`_CrewShell`'s `cardReport`), or null when
   * reporting is off for the page (`staticPreview`): then no report row renders.
   */
  cardReport: CardReportContext | null;
  /** The current query run against the current index. */
  result: SearchResult;
  phase: SearchPhase;
  /**
   * Ends search. Cancel and Escape clear the query; a result tap keeps it, and
   * the next edit or Enter in the field shows its results again. Focus alone
   * never does (spec §6.2).
   */
  endSearch: (options: { keepQuery: boolean }) => void;
  /**
   * The search input, attached by `CrewSearchField`. The results move focus to
   * it when a refresh leaves no hits, so the chip row holding focus unmounts
   * with no All chip left to take it (spec §6.8).
   */
  fieldRef: RefObject<HTMLInputElement | null>;
};

const CrewSearchContext = createContext<CrewSearchState | null>(null);

export interface CrewSearchProviderProps {
  index: SearchIndex;
  missLogging: boolean;
  /** The show's slug, for the missed-search route. */
  slug: string;
  showId: string;
  cardReport: CardReportContext | null;
  children: ReactNode;
}

export function CrewSearchProvider({
  index,
  missLogging,
  slug,
  showId,
  cardReport,
  children,
}: CrewSearchProviderProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);

  const prepared = useMemo(() => prepareIndex(index), [index]);
  const result = useMemo(() => searchIndex(prepared, query), [prepared, query]);

  let phase: SearchPhase = "idle";
  if (active) {
    if (!isSearchableQuery(query)) phase = "hint";
    else phase = result.total > 0 ? "results" : "nomatch";
  }

  // Missed searches (spec §7.1).
  const sentMisses = useRef(new Set<string>());
  const isMiss = phase === "nomatch";
  const sendMiss = useCallback(
    (missed: string) => {
      if (!missLogging) return;
      const key = normalize(missed)
        .map((token) => token.text)
        .join(" ");
      if (sentMisses.current.has(key)) return;
      sentMisses.current.add(key);
      try {
        fetch(`/api/show/${encodeURIComponent(slug)}/search-miss`, {
          method: "POST",
          keepalive: true,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: missed.trim() }),
        }).catch(() => {});
      } catch {
        // Telemetry only: a send that cannot even start is dropped.
      }
    },
    [missLogging, slug],
  );

  useEffect(() => {
    if (!isMiss) return;
    const timer = window.setTimeout(() => sendMiss(query), MISS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isMiss, query, sendMiss]);

  const endSearch = useCallback(
    ({ keepQuery }: { keepQuery: boolean }) => {
      if (isMiss) sendMiss(query);
      setActive(false);
      if (!keepQuery) setQuery("");
    },
    [isMiss, query, sendMiss],
  );

  const value = useMemo<CrewSearchState>(
    () => ({
      index,
      query,
      setQuery,
      active,
      setActive,
      missLogging,
      showId,
      cardReport,
      result,
      phase,
      endSearch,
      fieldRef,
    }),
    [index, query, active, missLogging, showId, cardReport, result, phase, endSearch],
  );

  return <CrewSearchContext.Provider value={value}>{children}</CrewSearchContext.Provider>;
}

/** The search state. Throws outside a `CrewSearchProvider`. */
export function useCrewSearch(): CrewSearchState {
  const state = useContext(CrewSearchContext);
  if (state === null) throw new Error("useCrewSearch must be used inside CrewSearchProvider");
  return state;
}

/**
 * The search state, or null when no provider is mounted. For components that
 * also render without search (the section controller under its own tests).
 */
export function useOptionalCrewSearch(): CrewSearchState | null {
  return useContext(CrewSearchContext);
}
