"use client";
/**
 * components/crew/daySelection.tsx: the crew home's selected day (crew page
 * redesign spec §4.2, §10 "Selected day").
 *
 * The selection is `live` (the default on every load) or `day(iso)`. It is
 * client state only: never written to the URL or to storage, so a reload
 * returns to `live` (documented limit L5). The section controller
 * (`CrewSections`) provides it around the whole page; the day row writes it,
 * and the pass and the run-of-show card read it. The controller also holds the
 * API through `apiRef`, so a search reveal of a run-of-show line can select the
 * day the line was indexed for before it looks for the line.
 *
 * API: `useDaySelection()` returns `{ selection, selectDay(iso), selectLive() }`.
 * Outside a provider it reads `live` and its writers do nothing, so a component
 * rendered on its own (a test, a preview) shows the live state.
 *
 * The provider holds the day set's ISO dates so a selection never outlives its
 * day: a server refresh that removes the selected day from the set returns the
 * selection to `live` (spec §7 compound row). Which day is today, and that
 * tapping today's button means `live`, is the day row's knowledge (it reads the
 * shared clock); this store holds only what was chosen.
 */
import {
  createContext,
  useContext,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
  type Ref,
} from "react";

export type DaySelection = { kind: "live" } | { kind: "day"; iso: string };

export type DaySelectionApi = {
  selection: DaySelection;
  /** Select one day of the set (`day(iso)`); an ISO outside the set is ignored. */
  selectDay: (iso: string) => void;
  /** Return to the live state. */
  selectLive: () => void;
};

const LIVE: DaySelection = { kind: "live" };

const DaySelectionContext = createContext<DaySelectionApi>({
  selection: LIVE,
  selectDay: () => {},
  selectLive: () => {},
});

export function DaySelectionProvider({
  days,
  apiRef,
  children,
}: {
  /** The day set's ISO dates, as the server built them for the day row. */
  days: readonly string[];
  /** Receives the same API `useDaySelection()` returns, for a caller above the provider. */
  apiRef?: Ref<DaySelectionApi>;
  children: ReactNode;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const inSet = chosen !== null && days.includes(chosen);
  // A refresh removed the chosen day: drop it, so it cannot come back selected
  // if a later refresh restores the day.
  if (chosen !== null && !inSet) setChosen(null);
  const iso = inSet ? chosen : null;
  const daysKey = days.join(",");

  const value = useMemo<DaySelectionApi>(() => {
    const set = new Set(daysKey.split(","));
    return {
      selection: iso === null ? LIVE : { kind: "day", iso },
      selectDay: (next) => {
        if (set.has(next)) setChosen(next);
      },
      selectLive: () => setChosen(null),
    };
  }, [iso, daysKey]);
  useImperativeHandle(apiRef, () => value, [value]);

  return <DaySelectionContext.Provider value={value}>{children}</DaySelectionContext.Provider>;
}

export function useDaySelection(): DaySelectionApi {
  return useContext(DaySelectionContext);
}
