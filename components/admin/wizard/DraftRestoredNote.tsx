"use client";

import { useContext, useEffect, useState } from "react";

import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";
import { readStoredDraft, reportDraftStorageKey } from "@/lib/admin/reportDraftStore";

/** 5s, matching the in-file transient precedent at
 *  components/admin/wizard/step3ReviewSections.tsx:1683-1687 (the CrewBreakdown
 *  outcome banner). Not a new number. */
export const DRAFT_RESTORED_NOTE_MS = 5_000;

/** Long enough that the announcement does not collide with the dialog-open
 *  announcement, short enough to stay well inside the note's own lifetime. */
export const ANNOUNCE_DELAY_MS = 400;

/** Past tense deliberately (spec 2026-08-30 §3.4). The operator can reach the
 *  report section and clear or submit the draft inside the window; a
 *  present-tense claim would then be false on screen with nothing to correct
 *  it. "Restored" is a fact about what happened at open and cannot be
 *  falsified by anything the operator does next. "Report an issue" is the
 *  section label verbatim (components/admin/wizard/step3ReviewSections.tsx:5154).
 *  No em dash and no apostrophe, per the mechanical UI checklist. */
export const DRAFT_RESTORED_NOTE =
  "Report draft restored. Find it in the last section, Report an issue.";

/**
 * Tells the operator, without scrolling, that a half-typed report draft
 * survived the modal close (DEFERRED WIZARD-REPORT-DRAFT-RESTORE-UNDISCOVERABLE-1).
 *
 * A COMPONENT, not state inside Step3ReviewModal, and that is load-bearing:
 * the modal RENDERS ReviewModalShell, and AdminAnnounceProvider lives inside
 * that shell (components/admin/review/ReviewModalShell.tsx:647-655). React
 * context does not flow from a child provider up to its parent, so a
 * useContext call in the modal's own body would read the admin-layout channel
 * outside the dialog rather than the dialog-local one spec §3.3 requires. This
 * mounts inside the shell's children slot, where the provider is an ancestor.
 *
 * It announces through that provider and mounts NO live region of its own: it
 * is conditionally mounted, and tests/components/_metaLiveRegionMounting.test.ts
 * forbids a live region whose mount is gated, because a region inserted
 * together with its text is never announced.
 */
export function DraftRestoredNote({
  dfid,
  wizardSessionId,
}: {
  dfid: string;
  wizardSessionId: string;
}) {
  // Mirrors how the draft ITSELF is restored (step3ReviewSections.tsx:4683): a
  // lazy initializer, because restoration happens on the first frame and
  // leaves no event to hook. Read ONCE and never re-read, which is what makes
  // "the note never appears after mount" structural rather than asserted.
  const [restored, setRestored] = useState(() => {
    if (!dfid || !wizardSessionId) return false;
    return readStoredDraft(reportDraftStorageKey(wizardSessionId, dfid)).trim() !== "";
  });
  const { announce } = useContext(UndoAnnounceContext);

  useEffect(() => {
    if (!restored) return;
    // Held back so it does not land while the screen reader is still speaking
    // the dialog-open announcement, where a polite message is routinely
    // dropped (impeccable critique P2, 2026-08-30).
    const spoken = setTimeout(() => announce(DRAFT_RESTORED_NOTE), ANNOUNCE_DELAY_MS);
    const timer = setTimeout(() => setRestored(false), DRAFT_RESTORED_NOTE_MS);
    return () => {
      clearTimeout(spoken);
      clearTimeout(timer);
    };
    // Deliberately mount-scoped, and the deps are deliberately empty:
    // `restored` only ever goes true -> false, so this cannot re-announce, and
    // the cleanup covers a modal closed inside the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!restored) return null;
  return (
    <p
      data-testid={`wizard-step3-card-${dfid}-draft-restored-note`}
      aria-hidden="true"
      // Ground-matched, not token-matched, and the distinction is the whole
      // point. This first shipped `bg-surface-raised`, copied from the
      // crew-row banner at `step3ReviewSections.tsx:1714-1725` -- but that
      // banner sits inside a crew ROW, where raised lifts. Here the note sits
      // directly in the content pane on `bg-bg`, where raised measures
      // 1.044:1 light / 1.131:1 dark: no plate at all. Same mistake shape as
      // the wizard mark's ring earlier in this branch, a token borrowed from a
      // precedent without checking the ground it lands on.
      // The nearest sibling in THIS slot is the resolve section
      // (`Step3ReviewModal.tsx`, "Resolve before publishing"), which carries
      // `rounded-md border border-border bg-surface-sunken p-tile-pad`. Its
      // BORDER is what gives it an edge -- no fill in this system separates
      // from the ground on its own -- so matching it is what makes the note
      // read as a plate and share the pane's rhythm.
      className="w-full rounded-md border border-border bg-surface-sunken p-tile-pad text-sm/relaxed text-text-strong"
    >
      {DRAFT_RESTORED_NOTE}
    </p>
  );
}
