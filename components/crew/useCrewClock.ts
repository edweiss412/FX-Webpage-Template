"use client";
/**
 * components/crew/useCrewClock.ts: one client clock for the crew home.
 *
 * The day row, the pass and the run-of-show card's "Next" marker all answer
 * "what time is it now" (crew page redesign spec §4.2 to §4.4). Each keeping its
 * own `useState(new Date())` plus interval means clocks that drift apart
 * whenever one of them remounts, so around midnight or a show start the day row
 * and the pass could disagree for up to a minute. This is one module-level
 * store: one 60-second interval and one `visibilitychange` listener, attached
 * while any component is subscribed and detached when the last one leaves, read
 * through `useSyncExternalStore` (the shared theme store's pattern,
 * components/layout/useAppliedTheme.ts).
 *
 * Carried from `RightNowHero`'s private clock: the tick re-reads `new Date()`,
 * so a day rollover needs no special case, and the visibility bump recovers
 * from background-tab interval throttling.
 *
 * HYDRATION. The server render and the hydrating client render must agree on
 * `now`, or React reports a hydration mismatch and rebuilds the page. A bare
 * `new Date()` on the server also ignores the request-scoped clock (`nowDate()`,
 * lib/time/now.ts, which honors the screenshot harness's frozen instant). So
 * `CrewClockProvider` carries the server's request time (`initialNow`, epoch
 * ms, from the shell's `await nowDate()`), and that seed is the server snapshot:
 * the server renders it and hydration reads it back. Once mounted, React's own
 * store-consistency check reads the live client clock and re-renders if it
 * differs, and the ticks run from there. Client renders that are not hydration
 * read the live clock directly.
 *
 * The server never caches a reading: module state there is shared by every
 * request. Without a provider (a component rendered on its own) the server reads
 * a fresh `new Date()` per render.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export const CREW_CLOCK_TICK_MS = 60_000;

const listeners = new Set<() => void>();
let current: Date | null = null;
let detach: (() => void) | null = null;

function refresh(): void {
  current = new Date();
  for (const listener of listeners) listener();
}

function attach(): () => void {
  const tick = setInterval(refresh, CREW_CLOCK_TICK_MS);
  const onVisibility = (): void => {
    if (!document.hidden) refresh();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(tick);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (listeners.size === 1) detach = attach();
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && detach !== null) {
      detach();
      detach = null;
      // The next subscriber starts from a fresh reading, not a stale one.
      current = null;
    }
  };
}

function read(): Date {
  if (typeof window === "undefined") return new Date();
  if (current === null) current = new Date();
  return current;
}

/** The server's request time, the snapshot both the server and hydration render. */
const CrewClockSeedContext = createContext<Date | null>(null);

/**
 * Seeds the crew clock with the server's request time (epoch ms), so the server
 * render and the hydrating client render produce the same markup. Null seeds
 * nothing (the unseeded reads above).
 */
export function CrewClockProvider({
  initialNow,
  children,
}: {
  initialNow: number | null;
  children: ReactNode;
}) {
  const seed = useMemo(() => (initialNow === null ? null : new Date(initialNow)), [initialNow]);
  return createElement(CrewClockSeedContext.Provider, { value: seed }, children);
}

/** The shared client `now`. Every subscriber in one page reads the same instant. */
export function useCrewClock(): Date {
  const seed = useContext(CrewClockSeedContext);
  const serverSnapshot = useCallback(() => seed ?? read(), [seed]);
  return useSyncExternalStore(subscribe, read, serverSnapshot);
}
