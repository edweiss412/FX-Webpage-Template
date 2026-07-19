"use client";

/**
 * components/admin/wizard/CrewRowActions.tsx (crew-row-controls 2026-07-19)
 *
 * Per-row action cluster for the published review modal's Crew section: a
 * three-dot trigger anchoring a menu popover (Preview as / Reset name picker)
 * and a destructive confirm popover. Spec:
 * docs/superpowers/specs/2026-07-19-crew-row-controls.md (§4, §6, §6b).
 *
 * Ownership split: the PARENT (CrewBreakdown) owns single-open state and the
 * panel-top outcome banners; this component owns mode (menu/confirm/resolving),
 * timers, and focus. Mounted ONLY for eligible rows (published && !archived
 * with a persisted crew id) — the parent gates, this component assumes
 * eligibility (spec §7).
 *
 * Close semantics are backdrop-simple (UserMenu idiom, spec §10.7): while open,
 * a fixed z-20 backdrop covers everything including triggers; any outside
 * click closes only. Esc restores trigger focus; backdrop click does not.
 */

import Link from "next/link";
import { EllipsisVertical, Eye, RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { resetCrewMemberSelection } from "@/lib/auth/picker/resetCrewMemberSelection";

// Armed-state auto-revert — harmonized 4s across destructive surfaces
// (DESTRUCT-2; mirrors app/admin/show/[slug]/PickerResetControl.tsx:29).
const ARM_REVERT_MS = 4_000;

export type CrewRowOutcome = { kind: "ok" | "error"; message: string };

export function CrewRowActions({
  crewId,
  name,
  showId,
  slug,
  open,
  onOpenChange,
  onOutcome,
}: {
  crewId: string;
  name: string;
  showId: string;
  slug: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** null clears a prior outcome (fires when a new confirm arms — spec §4.5). */
  onOutcome: (o: CrewRowOutcome | null) => void;
}) {
  const [mode, setMode] = useState<"menu" | "confirm" | "resolving">("menu");
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmGoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const autoRevertRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningId = useId();
  const resolving = mode === "resolving" || isPending;

  const clearAutoRevert = () => {
    if (autoRevertRef.current !== null) {
      clearTimeout(autoRevertRef.current);
      autoRevertRef.current = null;
    }
  };
  useEffect(() => () => clearAutoRevert(), []);

  // Parent-driven close (or settle): reset to menu so the next open starts clean.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("menu");
      clearAutoRevert();
    }
  }, [open]);

  // Open focus: menu → first menuitem (APG); confirm → Cancel (C3);
  // resolving → the popover container itself: disabling both buttons would
  // otherwise drop focus to <body>, and Escape/Tab would bypass
  // onConfirmKeyDown and reach the shell's document listener mid-reset.
  useEffect(() => {
    if (!open) return;
    if (mode === "menu") {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    } else if (mode === "confirm") {
      cancelRef.current?.focus();
    } else {
      confirmRef.current?.focus();
    }
  }, [open, mode]);

  // Scroll-edge visibility (spec §4.2): popovers near the modal scroller's
  // bottom edge open off-screen; nearest-scroll them into view on mount.
  useEffect(() => {
    if (!open) return;
    const el = mode === "menu" ? menuRef.current : confirmRef.current;
    // Guarded: jsdom does not implement scrollIntoView (unit tests would throw).
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [open, mode]);

  const closeFully = (restoreFocus: boolean) => {
    clearAutoRevert();
    onOpenChange(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      // stopPropagation: the modal shell listens for Escape at document level
      // and ignores defaultPrevented (ReviewModalShell.tsx:238-243) — without
      // this the whole review modal would close along with the popover.
      e.preventDefault();
      e.stopPropagation();
      closeFully(true);
    } else if (e.key === "Tab") {
      // APG menu-button: Tab closes; focusing the trigger BEFORE the default
      // Tab action lets focus proceed in document order from the trigger.
      triggerRef.current?.focus();
      closeFully(false);
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
      // Space does not natively activate an <a>; route both through click so
      // Preview-as (Link) and Reset (button) behave identically (spec §4.2).
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.click();
    }
  };

  const onConfirmKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (resolving) {
      // Close paths + focus escape are inert while resolving (spec §6). Escape
      // must ALSO not bubble to the shell's document listener — a resolving
      // popover must not take the whole modal down.
      if (e.key === "Escape" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (e.key === "Escape") {
      // stopPropagation: keep the shell's document-level Escape from closing
      // the whole modal (ReviewModalShell.tsx:238-243).
      e.preventDefault();
      e.stopPropagation();
      closeFully(true);
    } else if (e.key === "Tab") {
      // 2-stop trap: focus can never land behind the backdrop (spec §4.3).
      e.preventDefault();
      (document.activeElement === cancelRef.current
        ? confirmGoRef.current
        : cancelRef.current
      )?.focus();
    }
  };

  const enterConfirm = () => {
    clearAutoRevert();
    onOutcome(null); // arming a new confirm clears any prior banner (spec §4.5)
    setMode("confirm");
    // Timer is cleared by Cancel/Esc/Confirm/parent-close, so firing here can
    // only mean the confirm is still armed — full close, restore focus (C5).
    autoRevertRef.current = setTimeout(() => closeFully(true), ARM_REVERT_MS);
  };

  const onConfirm = () => {
    clearAutoRevert();
    setMode("resolving");
    // not-subject:M5-D8 — outcome copy (success AND error) is admin-authored inline BY DESIGN;
    // the picker message catalog is crew-oriented and would misattribute an admin reset. No raw
    // error CODE is ever rendered (codes map to these sentences here). Mirrors
    // app/admin/show/[slug]/PickerResetControl.tsx:161-166; no new §12.4 codes.
    startTransition(async () => {
      try {
        const r = await resetCrewMemberSelection({ showId, crewMemberId: crewId });
        if (r.ok) {
          onOutcome({ kind: "ok", message: `Reset ${name}. They'll pick again next visit.` });
        } else if (r.code === "PICKER_CREW_MEMBER_NOT_FOUND") {
          onOutcome({
            kind: "error",
            message:
              "That crew member is no longer on the roster, so there's nothing to reset. Refresh to see the current roster.",
          });
        } else {
          onOutcome({ kind: "error", message: "Couldn't reset the picker. Please try again." });
        }
      } catch {
        // A thrown action (network death, server error boundary) must not
        // strand the popover in resolving — settle through the generic banner.
        onOutcome({ kind: "error", message: "Couldn't reset the picker. Please try again." });
      }
      onOpenChange(false);
    });
  };

  const menuItemClass =
    "flex min-h-tap-min w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-[13px] font-medium text-text hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none";

  return (
    <span className="relative flex shrink-0 items-center">
      {open && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          data-testid={`crew-row-backdrop-${crewId}`}
          onClick={() => {
            if (!resolving) closeFully(false);
          }}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}

      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${name}`}
        data-testid={`crew-row-menu-button-${crewId}`}
        onClick={() => onOpenChange(true)}
        className="inline-flex size-tap-min items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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

      {open && mode === "menu" && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${name}`}
          data-testid={`crew-row-menu-${crewId}`}
          onKeyDown={onMenuKeyDown}
          className="route-enter absolute top-[calc(100%+6px)] right-0 z-30 min-w-52 rounded-md border border-border bg-surface-raised p-1.5 shadow-lg"
        >
          <Link
            role="menuitem"
            tabIndex={-1}
            data-testid={`admin-show-preview-as-link-${crewId}`}
            href={`/admin/show/${encodeURIComponent(slug)}/preview/${encodeURIComponent(crewId)}`}
            onClick={() => closeFully(false)}
            className={menuItemClass}
          >
            <Eye aria-hidden="true" className="size-4 shrink-0 text-text-subtle" />
            <span>
              Preview as<span className="sr-only"> {name}</span>
            </span>
          </Link>
          <div role="separator" className="mx-1.5 my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            data-testid={`crew-row-reset-item-${crewId}`}
            onClick={enterConfirm}
            className={menuItemClass}
          >
            <RefreshCw aria-hidden="true" className="size-4 shrink-0 text-text-subtle" />
            Reset name picker
          </button>
        </div>
      )}

      {open && (mode === "confirm" || mode === "resolving") && (
        <div
          ref={confirmRef}
          role="group"
          tabIndex={-1}
          aria-label="Confirm resetting this crew member's picker selection"
          data-testid={`crew-row-reset-confirm-${crewId}`}
          onKeyDown={onConfirmKeyDown}
          className="route-enter absolute top-[calc(100%+6px)] right-0 z-30 w-[268px] rounded-md border border-border bg-surface-raised p-3.5 shadow-lg"
        >
          <p className="text-[13px] font-semibold wrap-break-word text-text-strong">
            Reset name picker
          </p>
          {/* not-subject:M5-D8 — admin-authored inline warning copy (see onConfirm rationale). */}
          <p
            id={warningId}
            className="mt-0.5 mb-3 text-xs/relaxed wrap-break-word text-text-subtle"
          >
            {name} will choose their name again on their next visit.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              ref={cancelRef}
              disabled={resolving}
              data-testid="crew-row-reset-cancel"
              onClick={() => closeFully(true)}
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface px-3.5 text-[13px] text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              ref={confirmGoRef}
              disabled={resolving}
              aria-busy={resolving}
              aria-describedby={warningId}
              data-testid="crew-row-reset-confirm-go"
              onClick={onConfirm}
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-3.5 text-[13px] font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resolving ? "Resetting…" : "Confirm reset"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
