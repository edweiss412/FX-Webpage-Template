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
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { CardReportContext } from "@/lib/crew/cardReportContext";
import { isSearchableQuery, prepareIndex, searchIndex } from "@/lib/search/match";
import type { SearchIndex, SearchResult } from "@/lib/search/types";

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
   * Ends search. Cancel and Escape clear the query; a result tap keeps it, so
   * focusing the field again shows the same results (spec §6.2).
   */
  endSearch: (options: { keepQuery: boolean }) => void;
};

const CrewSearchContext = createContext<CrewSearchState | null>(null);

export interface CrewSearchProviderProps {
  index: SearchIndex;
  missLogging: boolean;
  showId: string;
  cardReport: CardReportContext | null;
  children: ReactNode;
}

export function CrewSearchProvider({
  index,
  missLogging,
  showId,
  cardReport,
  children,
}: CrewSearchProviderProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(false);

  const prepared = useMemo(() => prepareIndex(index), [index]);
  const result = useMemo(() => searchIndex(prepared, query), [prepared, query]);

  let phase: SearchPhase = "idle";
  if (active) {
    if (!isSearchableQuery(query)) phase = "hint";
    else phase = result.total > 0 ? "results" : "nomatch";
  }

  const endSearch = useCallback(({ keepQuery }: { keepQuery: boolean }) => {
    setActive(false);
    if (!keepQuery) setQuery("");
  }, []);

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
