/**
 * lib/ui/historyState.ts: the state a page's own `pushState` / `replaceState`
 * hands Next's patched history (crew page redesign spec §5.2; Codex review of
 * the origin/main merge, M1-1).
 *
 * Next's patched history methods skip any state that carries one of its own
 * keys: they neither copy their router state in nor move the router's URL with
 * the write (node_modules/next/dist/client/components/app-router.js, the `__NA`
 * bypass). So a write hands over the entry's OWN keys and leaves Next's out:
 * Next copies its keys back and its router follows the URL, and the entry keeps
 * every key the page put there (the section sheet's `crewSheet` marker). A
 * `null` state keeps Next's keys but drops the page's, which is how the saved
 * copy's URL correction erased the sheet's marker.
 */

/** Next's own history keys: its patched history methods skip any state that carries one. */
export const NEXT_HISTORY_KEYS = ["__NA", "_N", "__PRIVATE_NEXTJS_INTERNALS_TREE"] as const;

/** The entry's own keys, Next's left out; `null` (or a non-object) stays `null`. */
export function forHistory(state: unknown): Record<string, unknown> | null {
  if (typeof state !== "object" || state === null) return null;
  const rest: Record<string, unknown> = { ...(state as Record<string, unknown>) };
  for (const key of NEXT_HISTORY_KEYS) delete rest[key];
  return rest;
}
