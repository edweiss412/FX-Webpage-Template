"use client";

/**
 * components/admin/dev/AttentionModalSwitcher.tsx
 * (spec 2026-07-21-attention-modal-switcher-gallery §3.3)
 *
 * The client half of the gallery: one real `PublishedReviewModal` whose data is
 * swapped as the operator steps through every rendered scenario. The switcher
 * owns the two things the server cannot hand across the Flight boundary:
 *
 *   1. The action closures. The modal's eight action props are functions, so the
 *      server passes only `GalleryModalData`; the switcher supplies no-op closures
 *      (`NOOP_ACTIONS`) that resolve to each action's contracted result WITHOUT
 *      writing. `satisfies Pick<…, ActionKeys>` makes a wrong shape a compile error.
 *   2. Keyboard stepping. `←`/`→` advance the index (functional wrap).
 *
 * ── Close semantics (empirical, discovered at implementation) ────────────────
 * The real modal's every close affordance (X, scrim, Escape, drag) funnels
 * through `PublishedReviewModal`'s `handleClose`, which calls
 * `useShowModalNav().close` → `router.push('/admin', …)`. It is hardwired to the
 * dashboard and does NOT consult `ReviewModalCloseContext`, so a gallery-local
 * "close then reopen" is not reproducible without editing the shared modal.
 * Rather than fight it, the gallery leaves the modal's native close intact (the X
 * exits to `/admin`, the modal's real behavior) and SWALLOWS Escape so an
 * operator mid-sweep does not accidentally navigate away — Escape stays on the
 * current scenario instead of dumping to the dashboard.
 *
 * The control bar is portaled to `document.body` so it escapes the admin
 * `[data-inert-root]` the open modal inerts (spec §3.4) and stays operable.
 */
import { NOOP_ACTIONS, buildFetchScripts } from "@/lib/dev/galleryActionScripts";
import { GalleryWriteGuard } from "@/components/admin/dev/GalleryWriteGuard";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PublishedReviewModal } from "@/components/admin/showpage/PublishedReviewModal";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { EmptyState } from "@/components/atoms/EmptyState";
import { useHasMounted } from "@/lib/a11y/useHasMounted";
import { SwitcherControls, type SwitcherGroupEntry } from "@/components/admin/dev/SwitcherControls";
import { GROUP_LABELS } from "@/lib/dev/galleryModalTypes";
import type { ExcludedScenario, GallerySwitcherScenario } from "@/lib/dev/galleryModalTypes";

/** Starting index from a deep-link id; unknown/null → 0 (the switcher's origin). */
export function indexOfId(
  scenarios: readonly GallerySwitcherScenario[],
  initialId: string | null,
): number {
  if (!initialId) return 0;
  const i = scenarios.findIndex((s) => s.id === initialId);
  return i >= 0 ? i : 0;
}


type Props = {
  scenarios: GallerySwitcherScenario[];
  excluded: ExcludedScenario[];
  initialId: string | null;
};

export function AttentionModalSwitcher({ scenarios, excluded, initialId }: Props) {
  const [index, setIndex] = useState(() => indexOfId(scenarios, initialId));
  const mounted = useHasMounted();
  const total = scenarios.length;

  useEffect(() => {
    if (total === 0) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        // Don't hijack modified arrows (Alt+Arrow browser nav, AT/OS combos) or
        // arrows aimed at an editable/where-arrows-mean-something control inside
        // the modal — only bare arrows step scenarios (Codex R1 P2).
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          t?.isContentEditable === true
        ) {
          return;
        }
        e.preventDefault();
        const delta = e.key === "ArrowRight" ? 1 : -1;
        setIndex((i) => (i + delta + total) % total);
        return;
      }
      // Swallow Escape so it does not reach the modal's shell listener, whose
      // close navigates to /admin and would drop the operator off the gallery
      // mid-sweep (see the close-semantics note in the file header).
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [total]);

  const groups = useMemo<SwitcherGroupEntry[]>(() => {
    const out: SwitcherGroupEntry[] = [];
    scenarios.forEach((s, i) => {
      const last = out[out.length - 1];
      if (last && last.id === s.group) last.count += 1;
      else out.push({ id: s.group, label: GROUP_LABELS[s.group], count: 1, firstIndex: i });
    });
    return out;
  }, [scenarios]);

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
          group={current.group}
          groups={groups}
          onJumpTo={setIndex}
          onPrev={() => setIndex((i) => (i - 1 + total) % total)}
          onNext={() => setIndex((i) => (i + 1) % total)}
        />,
        document.body,
      )
    : null;

  return (
    <>
      {/* Guard owned by the switcher so scenario scripts reach it; keyed per
          scenario so bulk-ignore call counters reset (spec 2026-07-23 §3.2). */}
      <GalleryWriteGuard key={`guard-${current.id}`} scripts={buildFetchScripts(current.actionOutcomes)} />
      {/* key on the PROVIDER, not just the modal: it preserves its current token
          across same-epoch initialToken changes (ShareTokenContext.tsx:44-69),
          so an un-keyed provider would leak scenario A's token into scenario B
          and keep an active token on null-token scenarios. */}
      <ShareTokenProvider
        key={current.id}
        initialToken={current.shareToken ?? null}
        initialEpoch={0}
      >
        {/* key={current.id}: a fresh modal per scenario, so no client state
            (open holds, expanded sections) bleeds across a scenario switch. */}
        <PublishedReviewModal key={current.id} {...current.data} {...NOOP_ACTIONS} />
      </ShareTokenProvider>
      {controls}
    </>
  );
}
