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
 * bottom rows where it is needed (spec §3.1 positioning contract). The
 * Preview-as submenu portals for the same reason, anchored to its own item.
 *
 * HIDE RULE (spec §1.3, AC-2): an unpublished row — Held or Publishing…, both
 * `finalizeOwned` values — exposes Open only. The server already refuses the
 * rest (the sync route with HTTP 409, the archive action with a typed
 * `FINALIZE_OWNED_SHOW`); the UI hides rather than disables, and the existing
 * row pill is the state badge, so no second badge is added here.
 *
 * No mutation surface is added: Re-sync POSTs the registered
 * `/api/admin/sync/[slug]` route and Archive calls the registered
 * `archiveShowAction`. This component is a CALLER of both (spec §1.1).
 */
import Link from "next/link";
import { Archive, ChevronRight, EllipsisVertical, Eye, RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { useRouter } from "next/navigation";

import { AnchoredPortal } from "@/components/admin/AnchoredPortal";
import { useShowModalNav } from "@/components/admin/useShowModalNav";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { requestShowSync } from "@/lib/admin/syncRequest";
import {
  ARCHIVE_GENERIC_ERROR_COPY,
  ARCHIVE_NOT_FOUND_COPY,
  archiveConsequenceProse,
  classifyArchiveFailure,
} from "@/lib/admin/archiveCopy";
import { archiveShowAction } from "@/app/admin/show/[slug]/_actions/archive";
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

/**
 * Cap + overflow (spec §3.2): a 40-person crew must not render a 40-item
 * submenu. Past the cap the list ends with one item that opens the show, where
 * the full roster lives.
 */
export const CREW_SUBMENU_CAP = 12;

const RESYNC_IDLE_LABEL = "Re-sync";
const RESYNC_PENDING_LABEL = "Syncing…";
/** The established unnamed-crew fallback (wizard roster, step3ReviewSections.tsx:1688). */
const UNNAMED_CREW = "Unnamed";

type HeldShrink = { detail: string; heldModifiedTime: string };

export function ShowRowActions({ row }: { row: ActiveShowRow }) {
  const router = useRouter();
  const { openHref } = useShowModalNav();
  const [open, setOpen] = useState(false);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [heldShrink, setHeldShrink] = useState<HeldShrink | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  // The archive refusal, already classified: `null` is "no refusal", never
  // "some refusal with nothing to say" — an empty error region is a bug by
  // specification (spec §3.4).
  const [archiveFailure, setArchiveFailure] = useState<ReturnType<
    typeof classifyArchiveFailure
  > | null>(null);
  // Persistent live region (BL-ANNOUNCE-REGION-UNMOUNT-CLASS): success CLOSES
  // the menu, so an announcement living inside it would unmount before it could
  // be read. This node outlives every menu state.
  const [announcement, setAnnouncement] = useState("");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const previewItemRef = useRef<HTMLButtonElement>(null);
  const resyncItemRef = useRef<HTMLButtonElement>(null);
  const keepCurrentRef = useRef<HTMLButtonElement>(null);
  const archiveItemRef = useRef<HTMLButtonElement>(null);
  const archiveCancelRef = useRef<HTMLButtonElement>(null);
  const restoreArchiveFocusRef = useRef(false);
  const triggerId = useId();
  const errorMsgId = useId();
  const emptyCrewHintId = useId();
  const archiveWarnId = useId();

  // Guard condition (spec §3.1): a row with no title is named by its slug, so
  // the trigger never announces "Actions for null".
  const label = row.title ?? row.slug;
  const slug = row.slug;
  // §1.3: the four-item menu is a PUBLISHED-row surface.
  const showMutatingActions = row.published;

  const crew = row.crew ?? [];
  const shownCrew = crew.slice(0, CREW_SUBMENU_CAP);
  const overflowCrewCount = crew.length - shownCrew.length;
  const hasCrew = crew.length > 0;

  // ONE in-flight action per row (spec §3.1 guard conditions). A pending
  // request and an undecided shrink hold both mean "this row is mid-action".
  const busy = pending || heldShrink !== null;

  const closeMenu = (restoreFocus: boolean) => {
    setOpen(false);
    setSubmenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const closeSubmenu = () => {
    setSubmenuOpen(false);
    previewItemRef.current?.focus();
  };

  // APG: opening a menu button moves focus to the first item.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!submenuOpen) return;
    submenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [submenuOpen]);

  // Accidental-accept safety (WCAG 2.4.3 + §3.8): when the hold prompt appears,
  // focus lands on the SAFE control, never on the destructive accept, so a
  // stray Enter keeps last-good rather than clobbering it.
  useEffect(() => {
    if (heldShrink && !errorCode) keepCurrentRef.current?.focus();
  }, [heldShrink, errorCode]);

  // A closed menu forgets its transient result state; the next open starts
  // clean. The announcement is deliberately NOT cleared — it must survive the
  // close that a success triggers.
  useEffect(() => {
    if (open) return;
    setSubmenuOpen(false);
    setErrorCode(null);
    setHeldShrink(null);
    setConfirmingArchive(false);
    setArchiveFailure(null);
  }, [open]);

  // C3 (DESIGN.md destructive contract): the confirm mounts with the SAFE
  // control focused. Without it, swapping the row unmounts the focused item,
  // focus falls to <body>, and the next Enter can land on Confirm — the
  // stray-second-Enter vector on a destructive control.
  useEffect(() => {
    if (confirmingArchive) archiveCancelRef.current?.focus();
  }, [confirmingArchive]);

  // C5 (close focus): only a CANCEL restores, and it must run AFTER the item
  // it returns to has re-mounted.
  useEffect(() => {
    if (confirmingArchive || !restoreArchiveFocusRef.current) return;
    restoreArchiveFocusRef.current = false;
    archiveItemRef.current?.focus();
  }, [confirmingArchive]);

  const runSync = async (accept?: { expectedModifiedTime: string }) => {
    if (pending) return;
    setErrorCode(null);
    setPending(true);
    try {
      const outcome = await requestShowSync(slug, accept);
      if (outcome.kind === "held") {
        // NOT a success: the reduced version was withheld and last-good is
        // still live. Closing here would silently discard the decision.
        setHeldShrink({ detail: outcome.detail, heldModifiedTime: outcome.heldModifiedTime });
        setAnnouncement(`Sync paused for a decision. ${outcome.detail}`);
      } else if (outcome.kind === "success") {
        setHeldShrink(null);
        setAnnouncement(outcome.summary);
        // Ordering (§3.5): refresh FIRST, then close — the row's own sync cell
        // has to be re-rendering by the time the menu goes away.
        router.refresh();
        closeMenu(false);
      } else {
        setHeldShrink(null);
        setErrorCode(outcome.code);
      }
    } finally {
      setPending(false);
    }
  };

  const runArchive = async () => {
    if (pending) return;
    setArchiveFailure(null);
    setPending(true);
    try {
      // The SHIPPED action takes a SLUG and resolves the show itself; passing
      // row.id would return show_not_found without archiving anything.
      const result = await archiveShowAction(slug);
      if (result.ok) {
        setConfirmingArchive(false);
        setAnnouncement(`Archived ${label}. Crew links for this show are now dead.`);
        // Ordering (§3.5): refresh FIRST — the row has to be relocating into
        // the Archived bucket by the time the menu goes away.
        router.refresh();
        closeMenu(false);
      } else {
        setArchiveFailure(classifyArchiveFailure(result.code));
      }
    } finally {
      setPending(false);
    }
  };

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
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (document.activeElement === previewItemRef.current && hasCrew && !busy) {
        setSubmenuOpen(true);
      }
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

  const onSubmenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      submenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape" || e.key === "ArrowLeft") {
      // Back to the parent ITEM, not out of the menu: a submenu Escape closes
      // one level (APG menu), so the admin keeps their place.
      e.preventDefault();
      e.stopPropagation();
      closeSubmenu();
    } else if (e.key === "Tab") {
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
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.click();
    }
  };

  const itemDisabledProps = busy ? ({ "aria-disabled": true } as const) : {};

  return (
    <span className="relative flex shrink-0 items-center">
      {/* Persistent announcement channel. Always mounted, so the success path —
          which closes the menu — is still heard. */}
      <span
        role="status"
        aria-live="polite"
        className="sr-only"
        data-testid={`row-actions-announce-${slug}`}
      >
        {announcement}
      </span>

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
          className="min-w-56 max-w-80 rounded-md border border-border bg-surface-raised p-1.5 shadow-lg"
        >
          <Link
            role="menuitem"
            tabIndex={-1}
            data-testid={`row-action-open-${slug}`}
            // The SAME param-preserving modal href the row link itself uses —
            // `/admin/show/[slug]` is only a legacy redirect (spec §3.1).
            href={openHref(slug)}
            scroll={false}
            {...itemDisabledProps}
            onClick={(e) => {
              if (busy) {
                e.preventDefault();
                return;
              }
              closeMenu(false);
            }}
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
                ref={previewItemRef}
                data-testid={`row-action-preview-${slug}`}
                {...(hasCrew
                  ? { "aria-haspopup": "menu" as const, "aria-expanded": submenuOpen }
                  : { "aria-disabled": true, "aria-describedby": emptyCrewHintId })}
                {...itemDisabledProps}
                onClick={() => {
                  if (busy || !hasCrew) return;
                  setSubmenuOpen((v) => !v);
                }}
                className={MENU_ITEM_CLASS}
              >
                <Eye aria-hidden="true" className={ICON_CLASS} />
                Preview as…
              </button>
              {hasCrew ? null : (
                // Guard condition (spec §3.1): the item says WHY it is inert,
                // outside its own accessible name so the name stays "Preview as…".
                <p
                  id={emptyCrewHintId}
                  data-testid={`row-action-preview-empty-hint-${slug}`}
                  className="px-2.5 pb-1 text-xs/relaxed text-text-faint"
                >
                  No crew on this show yet.
                </p>
              )}

              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                ref={resyncItemRef}
                data-testid={`row-action-resync-${slug}`}
                aria-busy={pending}
                {...itemDisabledProps}
                onClick={() => {
                  if (busy) return;
                  void runSync();
                }}
                className={MENU_ITEM_CLASS}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`${ICON_CLASS} ${pending ? "animate-spin motion-reduce:animate-none" : ""}`}
                />
                {pending ? RESYNC_PENDING_LABEL : RESYNC_IDLE_LABEL}
              </button>

              {confirmingArchive ? (
                // In-place swap of the Archive ROW (§3.5): the item is replaced,
                // never duplicated, so there is exactly one archive affordance.
                <div
                  role="group"
                  aria-label={`Confirm archiving ${label}`}
                  data-testid={`row-actions-archive-confirm-${slug}`}
                  className="flex flex-col gap-2 rounded-sm bg-surface-sunken p-2.5"
                >
                  {/* Wraps, never truncates: a pathological title must not
                      elide the very context a destructive confirm depends on. */}
                  <p
                    id={archiveWarnId}
                    data-testid={`row-actions-archive-consequence-${slug}`}
                    className="text-xs/relaxed wrap-break-word text-text-subtle"
                  >
                    {archiveConsequenceProse(row.title)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      ref={archiveCancelRef}
                      data-testid={`row-actions-archive-cancel-${slug}`}
                      disabled={pending}
                      onClick={() => {
                        restoreArchiveFocusRef.current = true;
                        setConfirmingArchive(false);
                      }}
                      className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border bg-surface px-3.5 text-[13px] font-medium text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    {/* Tier-2 destructive confirm-go (§3.8): archiving rotates
                        the crew link dead immediately. Registered in
                        tests/styles/_metaDestructiveConfirm (occurrence 1). */}
                    <button
                      type="button"
                      data-testid={`row-actions-archive-go-${slug}`}
                      aria-describedby={archiveWarnId}
                      disabled={pending}
                      aria-busy={pending}
                      onClick={() => void runArchive()}
                      className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-3.5 py-2 text-[13px] font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pending ? "Archiving…" : "Confirm archive"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  ref={archiveItemRef}
                  data-testid={`row-action-archive-${slug}`}
                  {...itemDisabledProps}
                  onClick={() => {
                    if (busy) return;
                    setArchiveFailure(null);
                    setConfirmingArchive(true);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <Archive aria-hidden="true" className={ICON_CLASS} />
                  Archive
                </button>
              )}

              {archiveFailure ? (
                // Every reachable failure says SOMETHING: the two lowercase
                // sentinels get generic prose (they are NOT §12.4 codes and
                // must never reach messageFor), catalog codes get catalog copy.
                <div
                  role="alert"
                  data-testid={`row-actions-archive-error-${slug}`}
                  className="mt-1 rounded-sm border border-border-strong bg-warning-bg p-2.5 text-xs/relaxed text-warning-text"
                >
                  {archiveFailure.kind === "catalog" ? (
                    <ErrorExplainer code={archiveFailure.code} surface="admin" />
                  ) : archiveFailure.kind === "not_found" ? (
                    ARCHIVE_NOT_FOUND_COPY
                  ) : (
                    ARCHIVE_GENERIC_ERROR_COPY
                  )}
                </div>
              ) : null}
            </>
          ) : null}

          {errorCode ? (
            // Same split as the shipped ReSyncButton reference (:280-287): the
            // live region is the MESSAGE node, and the named group wraps it, so
            // no focusable control is announced as part of the alert.
            <div
              role="group"
              aria-labelledby={errorMsgId}
              data-testid={`row-actions-error-${slug}`}
              className="mt-1 rounded-sm border border-border-strong bg-warning-bg p-2.5 text-warning-text"
            >
              <div id={errorMsgId} role="alert" className="min-w-0 text-xs/relaxed">
                <ErrorExplainer code={errorCode} surface="admin" />
              </div>
            </div>
          ) : null}

          {heldShrink && !errorCode ? (
            // NOT a live region, deliberately: it holds this decision's own
            // controls and takes focus, so a reader would otherwise hear the
            // buttons as part of the announcement. The arrival is announced on
            // the persistent channel above instead.
            <div
              data-testid={`row-actions-shrink-confirm-${slug}`}
              className="mt-1 flex flex-col gap-2 rounded-sm border border-border-strong bg-warning-bg p-2.5 text-warning-text"
            >
              <p className="text-xs/relaxed">
                This re-sync would reduce {label}: {heldShrink.detail}. The last confirmed version
                is still live. Apply the reduced version anyway?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  ref={keepCurrentRef}
                  data-testid={`row-actions-keep-current-${slug}`}
                  disabled={pending}
                  onClick={() => {
                    // Focus the still-mounted item BEFORE unmounting the panel
                    // that holds the focused safe control (the C5 idiom).
                    resyncItemRef.current?.focus();
                    setHeldShrink(null);
                  }}
                  className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3.5 text-[13px] font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Keep current version
                </button>
                {/* Tier-2 destructive confirm-go (§3.8): accepting a
                    show-shrinking sync over last-good takes the inverted-amber
                    C1 recipe. Registered in tests/styles/_metaDestructiveConfirm. */}
                <button
                  type="button"
                  data-testid={`row-actions-accept-shrink-${slug}`}
                  disabled={pending}
                  aria-busy={pending}
                  onClick={() =>
                    void runSync({ expectedModifiedTime: heldShrink.heldModifiedTime })
                  }
                  className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-3.5 py-2 text-[13px] font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Applying…" : "Apply reduced version"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </AnchoredPortal>

      <AnchoredPortal
        open={open && submenuOpen && hasCrew}
        anchorRef={previewItemRef}
        testId={`row-action-preview-portal-${slug}`}
        align="right"
        preferredSide="bottom"
      >
        <div
          ref={submenuRef}
          role="menu"
          aria-labelledby={`${triggerId}-preview`}
          data-testid={`row-action-preview-menu-${slug}`}
          onKeyDown={onSubmenuKeyDown}
          className="min-w-56 rounded-md border border-border bg-surface-raised p-1.5 shadow-lg"
        >
          <span id={`${triggerId}-preview`} className="sr-only">
            {`Preview ${label} as`}
          </span>
          {shownCrew.map((member) => (
            <Link
              key={member.id}
              role="menuitem"
              tabIndex={-1}
              data-testid={`row-action-preview-crew-${member.id}`}
              href={`/admin/show/${encodeURIComponent(slug)}/preview/${encodeURIComponent(member.id)}`}
              onClick={() => closeMenu(false)}
              className={MENU_ITEM_CLASS}
            >
              {member.name === null || member.name === "" ? UNNAMED_CREW : member.name}
            </Link>
          ))}
          {overflowCrewCount > 0 ? (
            <Link
              role="menuitem"
              tabIndex={-1}
              data-testid={`row-action-preview-more-${slug}`}
              href={openHref(slug)}
              scroll={false}
              onClick={() => closeMenu(false)}
              className={`${MENU_ITEM_CLASS} text-text-subtle`}
            >
              {`… and ${overflowCrewCount} more (open the show)`}
            </Link>
          ) : null}
        </div>
      </AnchoredPortal>
    </span>
  );
}
