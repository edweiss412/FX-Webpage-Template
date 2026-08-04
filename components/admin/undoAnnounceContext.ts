// components/admin/undoAnnounceContext.ts
//
// The undo channel's announce context (spec 2026-08-03-undo-success-announcement
// §3.2), modelled on components/admin/review/warningAnnounceContext.ts.
//
// The default is a no-op so a control mounted outside any provider announces
// nothing and never throws. That is deliberate, and it is also the reason
// tests/styles/_metaUndoAnnounceProvider.test.ts exists: the failure mode a no-op
// default creates is SILENCE, which is exactly the defect this feature fixes, so
// it needs a structural tripwire rather than trust.
"use client";
import { createContext } from "react";

export type UndoAnnounce = { announce: (message: string) => void };

export const NOOP_UNDO_ANNOUNCE: UndoAnnounce = { announce: () => {} };

export const UndoAnnounceContext = createContext<UndoAnnounce>(NOOP_UNDO_ANNOUNCE);

/** The one place undo success copy is spelled, so both feed surfaces are provably
 *  the same string (announce-a11y spec §2, multi-surface copy rule).
 *
 *  **Why the summary is quoted and followed by "no longer applies".** The naive
 *  form, `Change undone: <summary>.`, ends on the state the undo just REVERSED:
 *  a listener hears "...Crew member Alice Chen removed" at the exact moment Alice
 *  came back, and must mentally invert it. Rename is worse — the sentence ends on
 *  a name that no longer exists. A sighted user never hits this because the row
 *  carries the direction visually; the screen-reader user gets one sentence.
 *  So the outcome leads, and the summary is quoted as the thing that stopped
 *  being true (impeccable critique P1).
 *
 *  The terminal period is supplied HERE, not expected from the caller: every
 *  summary generator emits an unterminated fragment (`Crew member <name> removed`
 *  at lib/sync/changeLog/writeAutoApplyChanges.ts:112, and its renamed/added
 *  siblings), and screen readers use sentence-final punctuation for prosody.
 *
 *  A blank or missing label yields the bare sentence rather than a dangling
 *  quote. No em dash (DESIGN.md:381). */
export function undoneAnnouncement(label?: string): string {
  const trimmed = label?.trim() ?? "";
  return trimmed === "" ? "Change undone." : `Undone. "${trimmed}" no longer applies.`;
}
