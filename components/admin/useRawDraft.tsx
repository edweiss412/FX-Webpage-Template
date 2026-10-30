"use client";

/**
 * components/admin/useRawDraft.tsx (warning-card-fixes spec §6.3)
 *
 * The deferred reading choice: a reading picked on the use-raw choice control is a
 * local DRAFT until the row's action bar presses Save. One provider per row holds the
 * reading model and shares it between the two siblings that need it, the choice control
 * (`UseRawControl`) and the action bar (`DataQualityWarningControls`).
 *
 * The model is spec §6.3 "The reading model (exact)":
 *   - `persistedRaw` is derived from props; `draft` (unsaved) and `submitted` (sent, not
 *     yet reconciled) are local. The displayed reading is `submitted ?? draft ??
 *     persistedRaw`; dirty is `submitted === null && draft !== null`.
 *   - Rule 1 select, rule 2 Save, rule 3 Save fails, rule 4 Save succeeds (`submitted`
 *     stays), rule 5 reconciliation on ANY change of `persistedRaw`, rule 6 Cancel.
 *   - Reconciliation uses the store-the-previous-prop pattern DURING RENDER (React's
 *     "adjusting state when a prop changes"), never an effect, so no frame paints the
 *     stale combination. It keys on nothing but a change of `persistedRaw`:
 *     `router.refresh()` has no completion signal, so nothing here waits on one.
 *   - Busy is the action bar's running flag, reported in through `setBusy`.
 *
 * Writes go through `callUseRawAction`, the one argument assembly for both surfaces'
 * existing server actions (no new mutation surface, spec §10). `UseRawControlBoundary`
 * (the provider-less fallback) calls it too.
 */

import {
  createContext,
  useEffect,
  useContext,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import { deriveUseRawControlState } from "@/components/admin/UseRawControl";
import { setUseRawDecisionAction } from "@/app/admin/show/[slug]/_actions/useRaw";
import { setStagedUseRawDecisionAction } from "@/app/admin/onboarding/_actions/useRawStaged";
import {
  useReadingChoiceLock,
  useRegisterUnsavedReading,
} from "@/components/admin/review/unsavedReadings";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";

export type UseRawSurface =
  | { surface: "show"; showId: string }
  // `driveFileId` is the exact staged-sheet row locator: two sheets in one wizard session
  // can share a warning's (code, blockRef, contentHash), so the action needs the sheet id,
  // not just the warningRef, to write the decision to the right pending_syncs row (F3).
  | { surface: "wizard"; wizardSessionId: string; driveFileId: string };

/** Calls the surface's use-raw server action. `"failed"` for an unresolvable warning, a
 *  typed failure or a thrown call; the code is never surfaced (invariant 5). */
export async function callUseRawAction(
  surface: UseRawSurface,
  warning: ParseWarning,
  useRaw: boolean,
): Promise<"ok" | "failed"> {
  // The choice only mounts in resolvable states; guard anyway.
  const resolution = warning.resolution;
  if (!resolution || resolution.resolvable !== true) return "failed";
  const warningRef = {
    code: warning.code,
    // In-scope resolvable warnings always carry a blockRef; fall back defensively.
    blockRef: warning.blockRef ?? { kind: "" },
    observedContentHash: resolution.contentHash,
  };
  try {
    const result =
      surface.surface === "show"
        ? await setUseRawDecisionAction(surface.showId, warningRef, useRaw)
        : await setStagedUseRawDecisionAction(
            surface.wizardSessionId,
            surface.driveFileId,
            warningRef,
            useRaw,
          );
    return result.ok ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

/** The dirty hint (spec §6.3 action bar) and its announcement (§15): one string, one
 *  source, read by the action bar's hint and by `select` below. */
export const NOT_SAVED_YET = "Not saved yet";

/** Rule 3's copy: the control's existing sentence (spec §6.3 "Error copy"). */
const SAVE_FAILED = "That didn’t save. The cell may have changed.";

export type UseRawDraftValue = {
  persistedRaw: boolean;
  /** `submitted ?? draft ?? persistedRaw`. */
  displayedRaw: boolean;
  /** `submitted === null && draft !== null`. */
  dirty: boolean;
  submitted: boolean | null;
  busy: boolean;
  /** §6.5: a guarded action (Publish, Re-scan, …) is pending on this surface, so no
   *  reading may be picked until it settles. */
  locked: boolean;
  error: string | null;
  /** Rule 1. */
  select: (useRaw: boolean) => void;
  /** Rule 6. */
  cancel: () => void;
  /** Rules 2-3: sends the draft; on success `submitted` stays (rule 4). */
  save: () => Promise<"ok" | "failed">;
  setBusy: (busy: boolean) => void;
  setError: (copy: string | null) => void;
};

const UseRawDraftContext = createContext<UseRawDraftValue | null>(null);

/** The four states in which the choice control renders its radio pair. */
const RADIO_STATES = new Set(["transform-active", "apply-pending", "raw-active", "clear-pending"]);

/** True iff the choice control would render its radio pair for this warning (spec §6.3
 *  "Where it applies"), so the row needs a provider. */
export function offersReadingChoice(
  warning: ParseWarning,
  decision: UseRawDecision | undefined,
): boolean {
  const state = deriveUseRawControlState(warning, decision, false);
  return state !== null && RADIO_STATES.has(state);
}

export function UseRawDraftProvider(
  props: {
    warning: ParseWarning;
    decision: UseRawDecision | undefined;
    children: ReactNode;
  } & UseRawSurface,
): ReactElement {
  const { warning, decision, children } = props;
  const surface: UseRawSurface =
    props.surface === "show"
      ? { surface: "show", showId: props.showId }
      : {
          surface: "wizard",
          wizardSessionId: props.wizardSessionId,
          driveFileId: props.driveFileId,
        };
  const state = deriveUseRawControlState(warning, decision, false);
  const persistedRaw = state === "raw-active" || state === "apply-pending";

  const [draft, setDraft] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The surface's polite channel, the one Accept and undo announce through (no-op
  // outside a review surface).
  const { announce } = useContext(WarningAnnounceContext);

  // Rule 5, during render. A boolean `persistedRaw` that changed now differs from any
  // live draft's opposite, so the equality test below clears every live draft; it is
  // written as the rule states it.
  const [prevPersisted, setPrevPersisted] = useState(persistedRaw);
  if (prevPersisted !== persistedRaw) {
    setPrevPersisted(persistedRaw);
    if (draft !== null && draft === persistedRaw) setDraft(null);
    if (submitted !== null) setSubmitted(null);
  }
  // The latest persisted value, read by a Save that fails after a reconciliation landed
  // while it was in flight. Synced after commit; the reconciliation itself stays in render.
  const persistedRef = useRef(persistedRaw);
  useEffect(() => {
    persistedRef.current = persistedRaw;
  }, [persistedRaw]);

  // §6.5: this row counts as an unsaved reading on its review surface while it is dirty
  // AND while its reading request is in flight: a Save that fails restores its draft
  // (rule 3), so until the reading lands it is not safe to close or replace the review
  // (review R1 E1). "Discard and continue" clears the draft with rule 6's `draft = null`
  // (no focus move) and NEUTRALIZES an in-flight Save: its later failure restores
  // nothing into a surface that is closing or being replaced.
  const [readingInFlight, setReadingInFlight] = useState(false);
  const discardEpochRef = useRef(0);
  useRegisterUnsavedReading((submitted === null && draft !== null) || readingInFlight, () => {
    discardEpochRef.current += 1;
    setReadingInFlight(false);
    setDraft(null);
    setError(null);
  });
  const lock = useReadingChoiceLock();

  const value: UseRawDraftValue = {
    persistedRaw,
    displayedRaw: submitted ?? draft ?? persistedRaw,
    dirty: submitted === null && draft !== null,
    submitted,
    busy,
    locked: lock.locked,
    error,
    select: (useRaw) => {
      // Rows are soft-disabled while busy, awaiting reconciliation, or while a guarded
      // action is pending (§6.5); guard here too, reading the lock synchronously.
      if (busy || submitted !== null || lock.isLocked()) return;
      const next = useRaw === persistedRaw ? null : useRaw;
      setDraft(next);
      setError(null);
      // UI gate P2 (§15): the hint is only Save's description, so a pick that leaves the
      // row clean -> dirty also says so once. Only here: a failed Save restoring the
      // draft is not a pick, and a repeat pick of the draft is no transition.
      if (draft === null && next !== null) announce(NOT_SAVED_YET);
    },
    cancel: () => {
      setDraft(null);
      setError(null);
    },
    save: async () => {
      if (submitted !== null || draft === null) return "failed";
      const sent = draft;
      const epoch = discardEpochRef.current;
      setSubmitted(sent);
      setDraft(null);
      setError(null);
      setReadingInFlight(true);
      const result = await callUseRawAction(surface, warning, sent);
      if (discardEpochRef.current !== epoch) {
        // §6.5: the operator pressed Discard while this was in flight. A failure must
        // not resurrect the draft; the row goes clean either way.
        if (result === "failed") setSubmitted(null);
        return result;
      }
      setReadingInFlight(false);
      if (result === "failed") {
        // Rule 3; a non-null draft never equals the persisted reading.
        setDraft(sent === persistedRef.current ? null : sent);
        setSubmitted(null);
        setError(SAVE_FAILED);
      }
      return result;
    },
    setBusy,
    setError,
  };
  return <UseRawDraftContext.Provider value={value}>{children}</UseRawDraftContext.Provider>;
}

/** The row's reading model, or null outside a provider (the immediate-save fallback). */
export function useUseRawDraft(): UseRawDraftValue | null {
  return useContext(UseRawDraftContext);
}
