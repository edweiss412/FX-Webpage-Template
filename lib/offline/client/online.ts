"use client";

import { useSyncExternalStore } from "react";

/**
 * lib/offline/client/online.ts
 *
 * `navigator.onLine`, kept current by the `online` and `offline` events (spec
 * 4.7.2). Shared by the saved-copy bar and the avatar menu's switch row.
 *
 * Hydration-safe by construction: the server cannot know the phone's
 * connection, so the server snapshot is `true` (online), and React uses that
 * same snapshot for the hydrating render. The real value arrives on the first
 * commit after hydration, so a component that reads this hook never mismatches
 * its server HTML. Same shape as lib/a11y/useHasMounted.ts and
 * lib/a11y/usePrefersReducedMotion.ts.
 */
function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
