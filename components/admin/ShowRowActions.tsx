"use client";
/**
 * components/admin/ShowRowActions.tsx — admin-dashboard-row-actions.
 *
 * The dashboard's per-row kebab (⋮) menu: Open · Preview as… · Re-sync ·
 * Archive (master spec §9.1, design spec §3.1). One trigger, not four inline
 * buttons: the row is dense and mobile-first, and four 44px targets per row do
 * not fit a 390px viewport.
 *
 * Pattern precedent is `components/admin/wizard/CrewRowActions.tsx` — the
 * tree's real kebab menu — for the ARIA menu contract (role="menu" /
 * role="menuitem", focus into the menu on open, ArrowUp/ArrowDown wrap,
 * Home/End, Escape closes and restores trigger focus, Tab closes) and for the
 * backdrop-simple outside-click close. It is NOT `AppHealthPopover`, which is
 * an `aria-modal` dialog.
 *
 * The menu renders through `AnchoredPortal` because the dashboard's rows
 * wrapper is `overflow-hidden`: an in-row panel is clipped away on exactly the
 * bottom rows where it is needed (spec §3.1 positioning contract).
 *
 * HIDE RULE (spec §1.3, AC-2): an unpublished row — Held or Publishing…, both
 * `finalizeOwned` values — exposes Open only. The server already refuses the
 * rest (the sync route with HTTP 409, the archive action with a typed
 * `FINALIZE_OWNED_SHOW`); the UI hides rather than disables, and the existing
 * row pill is the state badge, so no second badge is added here.
 */
import Link from "next/link";
import { Archive, ChevronRight, EllipsisVertical, Eye, RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { AnchoredPortal } from "@/components/admin/AnchoredPortal";
import { useShowModalNav } from "@/components/admin/useShowModalNav";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";

/**
 * The shipped kebab-menu item recipe, mirroring the module-private
 * `menuItemClass` in components/admin/wizard/CrewRowActions.tsx (:235). Copied
 * rather than hoisted so this arc does not edit a component whose observable
 * contract §1.5 freezes; the two menus must look identical, so any change to
 * one belongs in both.
 */
const MENU_ITEM_CLASS =
  "flex min-h-tap-min w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-[13px] font-medium text-text hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none";

const ICON_CLASS = "size-4 shrink-0 text-text-subtle";

export function ShowRowActions({ row }: { row: ActiveShowRow }) {
  const { openHref } = useShowModalNav();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();

  // Guard condition (spec §3.1): a row with no title is named by its slug, so
  // the trigger never announces "Actions for null".
  const label = row.title ?? row.slug;
  const slug = row.slug;
  // §1.3: the four-item menu is a PUBLISHED-row surface.
  const showMutatingActions = row.published;

  const closeMenu = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  // APG: opening a menu button moves focus to the first item.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      // stopPropagation mirrors CrewRowActions: the review modal shell listens
      // for Escape at document level and ignores defaultPrevented, so an
      // un-stopped Escape would close the whole modal along with this menu.
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    } else if (e.key === "Tab") {
      // APG menu-button: Tab closes. Focusing the trigger BEFORE the default
      // Tab action lets focus continue in document order from the trigger.
      triggerRef.current?.focus();
      closeMenu(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1 + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      // Space does not natively activate an <a>, so both keys route through
      // click and every item behaves identically regardless of its element.
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.click();
    }
  };

  return (
    <span className="relative flex shrink-0 items-center">
      {open ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          data-testid={`row-actions-backdrop-${slug}`}
          onClick={() => closeMenu(false)}
          className="fixed inset-0 z-20 cursor-default"
        />
      ) : null}

      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}`}
        data-testid={`row-actions-trigger-${slug}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <span
          className={
            open
              ? "grid size-8 place-items-center rounded-sm border border-border-strong bg-surface-sunken text-text-strong transition-colors duration-fast"
              : "grid size-8 place-items-center rounded-sm border border-border text-text-subtle transition-colors duration-fast"
          }
        >
          <EllipsisVertical aria-hidden="true" className="size-4" />
        </span>
      </button>

      <AnchoredPortal
        open={open}
        anchorRef={triggerRef}
        testId={`row-actions-portal-${slug}`}
        align="right"
        preferredSide="bottom"
      >
        <div
          ref={menuRef}
          role="menu"
          aria-labelledby={triggerId}
          data-testid={`row-actions-menu-${slug}`}
          onKeyDown={onMenuKeyDown}
          className="min-w-56 rounded-md border border-border bg-surface-raised p-1.5 shadow-lg"
        >
          <Link
            role="menuitem"
            tabIndex={-1}
            data-testid={`row-action-open-${slug}`}
            // The SAME param-preserving modal href the row link itself uses —
            // `/admin/show/[slug]` is only a legacy redirect (spec §3.1).
            href={openHref(slug)}
            scroll={false}
            onClick={() => closeMenu(false)}
            className={MENU_ITEM_CLASS}
          >
            <ChevronRight aria-hidden="true" className={ICON_CLASS} />
            Open
          </Link>

          {showMutatingActions ? (
            <>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-testid={`row-action-preview-${slug}`}
                className={MENU_ITEM_CLASS}
              >
                <Eye aria-hidden="true" className={ICON_CLASS} />
                Preview as…
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-testid={`row-action-resync-${slug}`}
                className={MENU_ITEM_CLASS}
              >
                <RefreshCw aria-hidden="true" className={ICON_CLASS} />
                Re-sync
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-testid={`row-action-archive-${slug}`}
                className={MENU_ITEM_CLASS}
              >
                <Archive aria-hidden="true" className={ICON_CLASS} />
                Archive
              </button>
            </>
          ) : null}
        </div>
      </AnchoredPortal>
    </span>
  );
}
