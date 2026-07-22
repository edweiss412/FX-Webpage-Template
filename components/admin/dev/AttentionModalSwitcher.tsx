"use client";

/**
 * components/admin/dev/AttentionModalSwitcher.tsx
 * (spec 2026-07-21-attention-modal-switcher-gallery §3.3)
 *
 * The client half of the gallery: one real `PublishedReviewModal` whose data is
 * swapped as the operator steps through every rendered scenario. The switcher
 * owns the three things the server cannot hand across the Flight boundary:
 *
 *   1. The action closures. The modal's eight action props are functions, so the
 *      server passes only `GalleryModalData`; the switcher supplies no-op closures
 *      (`NOOP_ACTIONS`) that resolve to each action's contracted result WITHOUT
 *      writing. `satisfies Pick<…, ActionKeys>` makes a wrong shape a compile error.
 *   2. The close API. `ReviewModalCloseContext` is provided as `galleryClose`, so
 *      the modal's own X unmounts the modal here instead of navigating.
 *   3. Keyboard stepping. `←`/`→` advance the index (functional wrap). Escape is
 *      swallowed ONLY while the modal is open — closed mode has no shell listener
 *      to race, so Escape is left alone (plan-R2 §11).
 *
 * The control bar is portaled to `document.body` so it escapes the admin
 * `[data-inert-root]` the open modal inerts (spec §3.4) and stays operable.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PublishedReviewModal,
  type PublishedReviewModalProps,
} from "@/components/admin/showpage/PublishedReviewModal";
import { ReviewModalCloseContext } from "@/components/admin/review/ReviewModalShell";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { EmptyState } from "@/components/atoms/EmptyState";
import { useHasMounted } from "@/lib/a11y/useHasMounted";
import { SwitcherControls } from "@/components/admin/dev/SwitcherControls";
import type {
  ActionKeys,
  ExcludedScenario,
  GallerySwitcherScenario,
} from "@/lib/dev/galleryModalTypes";

/** Starting index from a deep-link id; unknown/null → 0 (the switcher's origin). */
export function indexOfId(
  scenarios: readonly GallerySwitcherScenario[],
  initialId: string | null,
): number {
  if (!initialId) return 0;
  const i = scenarios.findIndex((s) => s.id === initialId);
  return i >= 0 ? i : 0;
}

/**
 * Eight no-op action closures. Each resolves to its action's contracted result
 * so the modal's `useActionState` reducers stay consistent, and NONE writes.
 * `satisfies` pins every shape to the real prop types (a drift is a compile
 * error) while keeping the concrete literal types for callers.
 */
const NOOP_ACTIONS = {
  setPublished: async () => ({ ok: true }) as const,
  archiveAction: async () => ({ ok: true }) as const,
  unarchiveAction: async () => {},
  undoAction: async () => ({ ok: true }) as const,
  acceptAction: async () => ({ ok: true, count: 0 }) as const,
  acceptAllAction: async () => ({ ok: true, count: 0 }) as const,
  approveAction: async () => ({ ok: true }) as const,
  rejectAction: async () => ({ ok: true }) as const,
} satisfies Pick<PublishedReviewModalProps, ActionKeys>;

type Props = {
  scenarios: GallerySwitcherScenario[];
  excluded: ExcludedScenario[];
  initialId: string | null;
};

export function AttentionModalSwitcher({ scenarios, excluded, initialId }: Props) {
  const [index, setIndex] = useState(() => indexOfId(scenarios, initialId));
  const [closed, setClosed] = useState(false);
  // Synchronous close latch: set BEFORE the re-render so an arrow keypress fired
  // in the same tick as a close cannot step a modal that is unmounting.
  const closingRef = useRef(false);
  const mounted = useHasMounted();

  const galleryClose = useCallback(() => {
    closingRef.current = true;
    setClosed(true);
  }, []);

  const reopen = useCallback(() => {
    closingRef.current = false;
    setClosed(false);
  }, []);

  const total = scenarios.length;

  useEffect(() => {
    if (total === 0) return;
    function onKeyDown(e: KeyboardEvent) {
      // Arrows never step a closing/closed modal.
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (closingRef.current || closed) return;
        e.preventDefault();
        const delta = e.key === "ArrowRight" ? 1 : -1;
        setIndex((i) => (i + delta + total) % total);
        return;
      }
      // Escape is swallowed ONLY while the modal is open — otherwise the modal's
      // own shell listener owns it, and while closed there is no listener to
      // race, so we must leave Escape alone (plan-R2 §11).
      if (e.key === "Escape" && !closed) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [total, closed]);

  if (total === 0) {
    return <EmptyState label="No scenarios to show." />;
  }

  const current = scenarios[index]!;
  const controls = mounted
    ? createPortal(
        <SwitcherControls
          index={index}
          total={total}
          label={current.label}
          tier={current.tier}
          codes={current.codes}
          excluded={excluded}
          closed={closed}
          onPrev={() => setIndex((i) => (i - 1 + total) % total)}
          onNext={() => setIndex((i) => (i + 1) % total)}
          onReopen={reopen}
        />,
        document.body,
      )
    : null;

  return (
    <>
      {!closed && (
        <ReviewModalCloseContext.Provider value={galleryClose}>
          <ShareTokenProvider initialToken={null} initialEpoch={0}>
            {/* key={current.id}: a fresh modal per scenario, so no client state
                (open holds, expanded sections) bleeds across a scenario switch. */}
            <PublishedReviewModal key={current.id} {...current.data} {...NOOP_ACTIONS} />
          </ShareTokenProvider>
        </ReviewModalCloseContext.Provider>
      )}
      {controls}
    </>
  );
}
