// The shared append-shaped announce channel (spec 2026-08-03-undo-success-announcement §3.1).
//
// Extracted VERBATIM IN BEHAVIOR from ShowReviewSurface, which shipped this
// mechanism first (state + announce at :382-392, region JSX at :1160-1171). The
// warnings panel now consumes this module; its MutationObserver suite
// (tests/components/admin/review/warningsPanelStatusMount.test.tsx) is the proof
// the extraction changed nothing observable.
//
// Why APPEND and not a text swap: an identical text change may not re-announce,
// while an identical ADDITION always does (announcer spec 2026-07-22 §2.6). That
// case is reachable here, not theoretical — two shows dropping a crew member of
// the same name produce byte-identical announcements (design spec §1.2).
//
// DESIGN.md:479 is the governing rule: the region node must be branch-stable,
// rendered as a key-stable sibling by a single-return component. Callers own that
// placement; this module only guarantees the node itself is never re-created by
// an announcement.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Cap 50 (announcer spec §2.2): appending the 51st drops the oldest. Under the
 *  default (no TTL) an entry is removed only once it is 50 announcements old,
 *  far beyond any plausible assistive-technology delivery-queue residence.
 *  Removals are silent under role="log" (aria-relevant defaults to "additions
 *  text"), so the drop is safe. */
export const ANNOUNCE_LOG_CAP = 50;

export type AnnounceLogEntry = { id: number; text: string };

/** Optional per-entry pruning delay, used ONLY by channels that outlive their
 *  announcements. OFF by default, and that default is load-bearing.
 *
 *  Why it exists: the cap bounds MEMORY, not accessibility-tree noise. The admin
 *  layout channel lives for a whole session and its region is the first content
 *  in the admin subtree, so unpruned it makes a top-down screen-reader read
 *  recite every undo of the session before reaching the nav (impeccable audit
 *  P2: 12 undos measured 12 sibling nodes / 686 chars).
 *
 *  Why it is NOT the default: `docs/superpowers/specs/2026-07-22-warning-announcer-copy-design.md`
 *  §2.2 ratifies the opposite for the warnings channel — "a freshly trimmed node
 *  could still be queued, unspoken … removal can strand it (R3 finding 2)", and
 *  "No timers, no requestAnimationFrame". That channel unmounts with its panel,
 *  so it never accumulates across a session and the audit finding does not apply
 *  to it. Turning pruning on there would silently supersede a ratified contract
 *  in another spec (AGENTS.md invariant 7), so the retrofit passes no TTL and
 *  keeps its cap-only behavior exactly.
 *
 *  30 seconds rather than a few: removing a node assistive technology has not
 *  spoken yet is the strand hazard above, so the window is far past any
 *  plausible delivery-queue residence while still leaving the region empty at
 *  rest. */
export const ANNOUNCE_LOG_TTL_MS = 30_000;

export function useAnnounceLog(options?: { ttlMs?: number }): {
  announce: (message: string) => void;
  entries: ReadonlyArray<AnnounceLogEntry>;
  /** Empty the channel. Additive and opt-in: no existing consumer calls it.
   *
   *  For a channel whose REGION outlives its subject — the diagrams lightbox
   *  owns a dialog-local region whose state is held by the gallery, so it
   *  survives the dialog — an unpruned log means the next session mounts a
   *  region pre-loaded with the last one's failures: dead text between the
   *  dialog header and the image on a top-down read, and a replay for any
   *  assistive technology that reads an inserted live region. That is the same
   *  accumulation the TTL above exists for, but bounded by a real lifecycle
   *  event rather than a timer, so nothing is removed while it might still be
   *  queued unspoken (the strand hazard the TTL doc weighs). */
  reset: () => void;
} {
  const ttlMs = options?.ttlMs;
  // Ids come from a per-mount monotonic ref, NEVER a timestamp or the log length:
  // two announces batched into one commit must not collide, or React drops a node
  // on the duplicate key.
  const idRef = useRef(0);
  const [entries, setEntries] = useState<ReadonlyArray<AnnounceLogEntry>>([]);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Clear pending timers on unmount so a pruning callback never fires against an
  // unmounted channel.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const announce = useCallback(
    (message: string) => {
      if (message.trim() === "") return; // empty/whitespace is a no-op, never a blank entry
      const id = idRef.current++;
      setEntries((log) => {
        const next = [...log, { id, text: message }];
        return next.length > ANNOUNCE_LOG_CAP ? next.slice(next.length - ANNOUNCE_LOG_CAP) : next;
      });
      if (ttlMs === undefined) return; // cap-only channel: never prune (see above)
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        // Removals are silent under role="log" (aria-relevant defaults to
        // "additions text"), so pruning never re-announces or interrupts.
        setEntries((log) => log.filter((e) => e.id !== id));
      }, ttlMs);
      timersRef.current.add(timer);
    },
    [ttlMs],
  );

  const reset = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current.clear();
    setEntries((log) => (log.length === 0 ? log : []));
  }, []);

  return { announce, entries, reset };
}

/** The live region. One element, no wrapper — the shape is pinned by consumers'
 *  same-node assertions, so an added wrapper is a breaking change.
 *
 *  role="log" carries implicit polite + aria-atomic="false" + aria-relevant=
 *  "additions text": only the ADDED node is presented, and removals are silent.
 *  Those implicits are the contract, so no explicit aria-live / aria-atomic /
 *  aria-relevant attribute is written here. */
export function AnnounceLogRegion({
  entries,
  label,
  testId,
}: {
  entries: ReadonlyArray<AnnounceLogEntry>;
  label: string;
  testId: string;
}) {
  return (
    <span role="log" aria-label={label} className="sr-only" data-testid={testId}>
      {entries.map((e) => (
        <span key={e.id} data-announce-id={e.id}>
          {e.text}
        </span>
      ))}
    </span>
  );
}
