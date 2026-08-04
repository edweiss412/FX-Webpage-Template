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

/** Cap 50 (announcer spec §2.2): appending the 51st drops the oldest. An entry is
 *  removed only once it is 50 announcements old, far beyond any plausible
 *  assistive-technology delivery-queue residence. Removals are silent under
 *  role="log" (aria-relevant defaults to "additions text"), so the drop is safe. */
export const ANNOUNCE_LOG_CAP = 50;

export type AnnounceLogEntry = { id: number; text: string };

/** How long a spoken entry stays in the DOM before it is pruned.
 *
 *  The cap alone bounds MEMORY, not accessibility-tree noise. The layout channel
 *  lives for the whole admin session, and its region is the first content in the
 *  admin subtree, so without pruning a virtual-cursor user reading the dashboard
 *  top-down hears every stale announcement of the session before reaching the nav
 *  (impeccable audit P2: 12 undos measured 12 sibling nodes / 686 chars).
 *
 *  30 seconds, not the 5 the audit suggested: removing a node that assistive
 *  technology has not spoken yet can strand it unsaid, which is the hazard the
 *  cap-only design was avoiding. 30s is far past any plausible delivery-queue
 *  residence and still keeps the region effectively empty at rest. */
export const ANNOUNCE_LOG_TTL_MS = 30_000;

export function useAnnounceLog(): {
  announce: (message: string) => void;
  entries: ReadonlyArray<AnnounceLogEntry>;
} {
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

  const announce = useCallback((message: string) => {
    if (message.trim() === "") return; // empty/whitespace is a no-op, never a blank entry
    const id = idRef.current++;
    setEntries((log) => {
      const next = [...log, { id, text: message }];
      return next.length > ANNOUNCE_LOG_CAP ? next.slice(next.length - ANNOUNCE_LOG_CAP) : next;
    });
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      // Removals are silent under role="log" (aria-relevant defaults to
      // "additions text"), so pruning never re-announces or interrupts.
      setEntries((log) => log.filter((e) => e.id !== id));
    }, ANNOUNCE_LOG_TTL_MS);
    timersRef.current.add(timer);
  }, []);

  return { announce, entries };
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
