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
import { useCallback, useRef, useState } from "react";

/** Cap 50 (announcer spec §2.2): appending the 51st drops the oldest. An entry is
 *  removed only once it is 50 announcements old, far beyond any plausible
 *  assistive-technology delivery-queue residence. Removals are silent under
 *  role="log" (aria-relevant defaults to "additions text"), so the drop is safe. */
export const ANNOUNCE_LOG_CAP = 50;

export type AnnounceLogEntry = { id: number; text: string };

export function useAnnounceLog(): {
  announce: (message: string) => void;
  entries: ReadonlyArray<AnnounceLogEntry>;
} {
  // Ids come from a per-mount monotonic ref, NEVER a timestamp or the log length:
  // two announces batched into one commit must not collide, or React drops a node
  // on the duplicate key.
  const idRef = useRef(0);
  const [entries, setEntries] = useState<ReadonlyArray<AnnounceLogEntry>>([]);

  const announce = useCallback((message: string) => {
    if (message.trim() === "") return; // empty/whitespace is a no-op, never a blank entry
    const id = idRef.current++;
    setEntries((log) => {
      const next = [...log, { id, text: message }];
      return next.length > ANNOUNCE_LOG_CAP ? next.slice(next.length - ANNOUNCE_LOG_CAP) : next;
    });
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
