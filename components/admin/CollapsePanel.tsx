"use client";
import { type ReactNode } from "react";

/**
 * components/admin/CollapsePanel.tsx
 *
 * Shared height-morph disclosure body for the in-flow admin disclosure family
 * (RecentAutoAppliedStrip groups, IgnoredSheetsDisclosure, AddAdminDisclosure).
 * The outer grid is the morph TRACK — its single row track transitions
 * grid-template-rows 0fr -> 1fr over --duration-normal; the inner overflow-hidden
 * element IS the labeled region (always mounted, so aria-controls always
 * resolves), `inert` when closed so its subtree leaves BOTH the tab order and
 * the AT tree (React 19 boolean `inert`), matching the WAI accordion `hidden`
 * behavior while still permitting the height morph.
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
  children,
}: {
  open: boolean;
  /** Stable id on the region grid-item (the aria-controls target + testid). */
  id: string;
  /** Accessible name for the disclosed region. */
  label: string;
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
        role="region"
        aria-label={label}
        className="overflow-hidden"
        inert={open ? undefined : true}
      >
        {children}
      </div>
    </div>
  );
}
