"use client";
import { type ReactNode } from "react";

/**
 * components/admin/CollapsePanel.tsx
 *
 * Shared height-morph disclosure body for the in-flow admin disclosure family
 * (RecentAutoAppliedStrip groups, IgnoredSheetsDisclosure, AddAdminDisclosure).
 * The outer grid is the morph TRACK — its single row track transitions
 * grid-template-rows 0fr -> 1fr over --duration-normal; the inner overflow-hidden
 * element is the labeled region by default (always mounted, so aria-controls
 * always resolves; callers rendering many panels pass `region={false}` to drop
 * the landmark — see the `region` prop). It is `inert` when closed so its
 * subtree leaves BOTH the tab order and the AT tree (React 19 boolean `inert`),
 * matching the WAI accordion `hidden` behavior while still permitting the height
 * morph.
 *
 * Reduced motion: --duration-normal collapses to 0ms under
 * prefers-reduced-motion (app/globals.css), and motion-reduce:transition-none
 * removes the grid-template-rows transition entirely, so the toggle is instant.
 *
 * Usage contract: because the outer track is ALWAYS rendered (0-height when
 * closed), do NOT rely on a parent flex/grid `gap` to space this panel from its
 * siblings — that gap persists when collapsed. Put open-state separation INSIDE
 * `children` (a `pt-*` wrapper, clipped by overflow-hidden when closed).
 */
export function CollapsePanel({
  open,
  id,
  label,
  region = true,
  children,
}: {
  open: boolean;
  /** Stable id on the region grid-item (the aria-controls target + testid). */
  id: string;
  /** Accessible name for the disclosed region (only used when `region`). */
  label: string;
  /**
   * When true (default), the disclosed body is a `role="region"` landmark named
   * by `label`. Set false for callers that render many panels (e.g. the
   * per-show RecentAutoAppliedStrip groups) to avoid proliferating region
   * landmarks — WAI-APG cautions against more than a handful. Opting out drops
   * `role` + `aria-label` (a bare `aria-label` is not surfaced on a generic
   * element); the id/testid, overflow-hidden clip, and inert-when-closed
   * behavior are unchanged, so the toggle's `aria-controls` still resolves and
   * the visible trigger remains the disclosure's accessible name.
   */
  region?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-normal ease-out motion-reduce:transition-none ${
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div
        id={id}
        data-testid={id}
        role={region ? "region" : undefined}
        aria-label={region ? label : undefined}
        className="overflow-hidden"
        inert={open ? undefined : true}
      >
        {children}
      </div>
    </div>
  );
}
