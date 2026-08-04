// components/admin/AdminAnnounceProvider.tsx
//
// Owns one undo-announcement channel and renders its live region as the
// ALWAYS-FIRST child (spec 2026-08-03-undo-success-announcement §3.5).
//
// Why the owner is not a surface component: six review rounds established that
// any owner below a data-dependent branch has its region node replaced on the
// very success it announces — the button unmounts (canUndo flips), the strip's
// group empties, the strip itself returns null, Dashboard returns a different
// tree, ChangesSection swaps the feed out. DESIGN.md:479 already stated the
// governing rule: the region node must be branch-stable, rendered as a
// key-stable sibling by a single-return component.
//
// So the region sits at a sibling index that never changes, in a component
// mounted above every such branch. TWO instances exist by design:
//   * app/admin/layout.tsx wraps each of its returns (testId admin-undo-status)
//   * ReviewModalShell wraps its panel interior, because content outside an
//     aria-modal dialog is excluded from the accessibility tree
//     (ReviewModalShell.tsx:584) and the admin shell is additionally inerted
//     while a modal is open (:180-189).
// Nested React context resolves to the nearest provider, so no prop, flag or
// branch decides which channel a button announces into.
//
// testId and label are PROPS, never hard-coded: ReviewModalShell has three
// render sites and derives every testid from testIdBase, so a fixed identifier
// would put one id (and one aria-label) on three simultaneously-attached
// regions — ambiguous to a Playwright locator and, worse, to a screen-reader
// user navigating by region.
"use client";
import { useMemo, type ReactNode } from "react";
import { AnnounceLogRegion, useAnnounceLog } from "@/components/admin/announceLog";
import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";

export function AdminAnnounceProvider({
  children,
  testId,
  label,
}: {
  children: ReactNode;
  testId: string;
  label: string;
}) {
  const { announce, entries } = useAnnounceLog();
  const ctx = useMemo(() => ({ announce }), [announce]);
  return (
    <UndoAnnounceContext.Provider value={ctx}>
      <AnnounceLogRegion entries={entries} label={label} testId={testId} />
      {children}
    </UndoAnnounceContext.Provider>
  );
}
