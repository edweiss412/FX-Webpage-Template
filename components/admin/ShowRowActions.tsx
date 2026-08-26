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
import { createPortal } from "react-dom";

import { useRouter } from "next/navigation";

import { AnchoredPortal } from "@/components/admin/AnchoredPortal";
import { useShowModalNav } from "@/components/admin/useShowModalNav";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import {
  hasSyncFailureCopy,
  requestShowSync,
  SYNC_GENERIC_ERROR_COPY,
} from "@/lib/admin/syncRequest";
import { STALE_ROW_COPY } from "@/lib/admin/rowActionCopy";
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
  "flex min-h-tap-min w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-[13px] font-medium text-text hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-transparent";

const ICON_CLASS = "size-4 shrink-0 text-text-subtle";

/**
 * Move focus to a menu item and REVEAL it inside its own scroll container.
 *
 * Every focus move in this component passes `preventScroll: true`, which is
 * correct — a menu must not drag the page around under the admin. But a capped
 * panel scrolls, and the capped case is reachable: the crew submenu holds up to
 * 12 members plus an overflow item, thirteen rows at the 44px floor, 572px of
 * content that a short viewport caps and scrolls. Without this, arrowing past
 * the fold moves focus to an item nobody can see.
 *
 * Only the container's own `scrollTop` is touched, computed from rects, so the
 * page never moves.
 */
function focusMenuItem(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  const box = el.closest<HTMLElement>("[data-portal-scroll]");
  if (!box) return;
  const boxRect = box.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  if (rect.top < boxRect.top) box.scrollTop -= boxRect.top - rect.top;
  else if (rect.bottom > boxRect.bottom) box.scrollTop += rect.bottom - boxRect.bottom;
}

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
  /**
   * WHICH action is in flight, not merely whether one is. A shared boolean made
   * the Re-sync item announce `aria-busy` and swap to "Syncing…" while the
   * ARCHIVE confirm said "Archiving…" beside it — the surface reporting a
   * request it never fired. `pending` stays derived so every gate that only
   * cares "is the row busy" reads the same way it did.
   */
  const [pendingAction, setPendingAction] = useState<"sync" | "archive" | null>(null);
  const pending = pendingAction !== null;
  /**
   * A request that resolves AFTER the row lost its mutating actions. Its real
   * outcome region is eligibility-gated (it is actionable), so without this the
   * answer would be written into a region that can no longer render and the
   * admin would be told nothing at all — the exact silent-outcome class the
   * consequence bound forbids. Read-only, so it renders UNGATED.
   */
  const [staleOutcome, setStaleOutcome] = useState<string | null>(null);
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
  // `{ text, seq }`, not a bare string: a live region whose text does not CHANGE
  // is not re-announced, so a second identical outcome (two "Nothing new from
  // Drive." in a row) would be silent. The seq alternates one trailing no-break
  // space, which changes the node's text without changing what is read aloud.
  // Portals need a DOM; the first client render is the earliest safe moment.
  const [mounted, setMounted] = useState(false);
  const [announcement, setAnnouncement] = useState<{ text: string; seq: number }>({
    text: "",
    seq: 0,
  });
  const announce = (text: string) => setAnnouncement((prev) => ({ text, seq: prev.seq + 1 }));

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previewItemRef = useRef<HTMLButtonElement>(null);
  const resyncItemRef = useRef<HTMLButtonElement>(null);
  const keepCurrentRef = useRef<HTMLButtonElement>(null);
  const acceptShrinkRef = useRef<HTMLButtonElement>(null);
  const archiveGoRef = useRef<HTMLButtonElement>(null);
  const archiveItemRef = useRef<HTMLButtonElement>(null);
  const archiveCancelRef = useRef<HTMLButtonElement>(null);
  const restoreArchiveFocusRef = useRef(false);
  const restoreResyncFocusRef = useRef(false);
  const triggerId = useId();
  const errorMsgId = useId();
  const emptyCrewHintId = useId();
  const archiveWarnId = useId();

  // Guard condition (spec §3.1): a row with no title is named by its slug, so
  // the trigger never announces "Actions for null".
  // `?? ` catches null but not `""`, and an EMPTY title is a reachable value
  // (pinned at tests/components/admin/showpage/publishedReviewModal.test.tsx).
  // Unhandled it produced `aria-label="Actions for "`, `This re-sync would
  // reduce :` and `Archived .` — and an archive confirm that cannot say WHICH
  // show is the one thing AC-5 forbids. Blank and whitespace-only titles are
  // treated exactly like null, once, at the shared derivation.
  const label = row.title?.trim() ? row.title : row.slug;
  const slug = row.slug;
  // §1.3: the four-item menu is a PUBLISHED-row surface.
  const showMutatingActions = row.published;
  // Mirrored into a ref because an in-flight request captured the value that
  // was true when it STARTED; the answer has to be judged against the row as
  // it is when the answer arrives.
  const eligibleRef = useRef(showMutatingActions);
  // Written during RENDER, not in an effect. A passive effect runs after the
  // commit, and an awaited request can resolve in that window — it would then
  // read the pre-commit value, store a decision the row no longer accepts, and
  // the gate would hide it forever. This ref is never read while rendering, so
  // the "latest value" pattern is safe here and closes the window entirely.
  // eslint-disable-next-line react-hooks/refs -- deliberate "latest value" ref: the effect form loses the commit-to-effect race an awaited request can land in, and this ref is never read during rendering.
  eligibleRef.current = showMutatingActions;

  const crew = row.crew ?? [];
  const shownCrew = crew.slice(0, CREW_SUBMENU_CAP);
  const overflowCrewCount = crew.length - shownCrew.length;
  const hasCrew = crew.length > 0;
  // Membership, not count: swapping one member for another leaves the length
  // unchanged and still unmounts whatever the admin had focused.
  // …and the OVERFLOW item is part of that identity. 13 crew to 12 leaves the
  // first twelve ids untouched while the overflow link disappears, so a key
  // built from the shown members alone reports "no change" and the effect does
  // not re-run — stranding focus on a link that just unmounted (whole-diff R11,
  // probed: `effectDepsEqual: true` while overflow went 1 → 0).
  const crewIdentity = `${shownCrew.map((m) => m.id).join(",")}|overflow:${overflowCrewCount}`;

  // ONE in-flight action per row (spec §3.1 guard conditions). A pending
  // request and an undecided shrink hold both mean "this row is mid-action".
  // `confirmingArchive` belongs here: a confirm step that takes focus and claims
  // the surface for keyboard users, while a pointer user can still fire Re-sync
  // beside it, is only half a confirm — and a Re-sync that then returns
  // `shrink_held` would render two decision panels at once.
  const busy = pending || heldShrink !== null || confirmingArchive;

  /** Unconditional close. Only the flows that OWN the outcome call this. */
  const closeMenu = (restoreFocus: boolean) => {
    setOpen(false);
    setSubmenuOpen(false);
    // preventScroll on EVERY focus move in this component: the menu is a
    // portaled panel, and a focus() that scrolls drags the page out from under
    // the admin at the exact moment they opened a menu. Measured on the real
    // dashboard: without it, opening a menu on a scrolled row jumped the page
    // to the top before the panel had been placed.
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  /**
   * User-initiated dismissal — Escape, Tab, the backdrop, a page scroll, a link
   * click. Refused while a request is in flight, because a request OWNS this
   * surface until it resolves: closing mid-flight sets the outcome on an
   * unmounted menu, so a failure reaches the admin as nothing at all, and a
   * late success steals focus back after they have moved on. One gate here
   * covers every path, which is the point of routing them all through one
   * function.
   */
  const dismissMenu = (restoreFocus: boolean) => {
    if (pending) return;
    closeMenu(restoreFocus);
  };

  const closeSubmenu = () => {
    setSubmenuOpen(false);
    previewItemRef.current?.focus({ preventScroll: true });
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load-bearing second render: the backdrop portal cannot exist during the server render or the hydrating one, so the flip to `mounted` IS the mechanism (the HoverHelp / AnchoredPortal precedent carries the same waiver).
  useEffect(() => setMounted(true), []);

  /**
   * A row can lose its mutating actions UNDER AN OPEN MENU. The spec's §3.5
   * compound row assumed a background `router.refresh()` remounts the row and
   * takes the menu with it; it does not. `router.refresh()` merges the RSC
   * payload WITHOUT losing React state (Next 16, `useRouter` docs), and
   * `ShowsTable` keys each row by `row.id`, which does not change when the
   * show is unpublished. So the same component instance survives with
   * `row.published` flipped to false, and without this the Archive confirm and
   * the held Re-sync decision — which render outside the eligibility gate, as
   * the ARIA menu content model requires — would stay actionable on a row that
   * AC-2 says may offer Open only.
   */
  useEffect(() => {
    if (showMutatingActions) return;
    // The flip unmounts whatever the admin was standing on — a submenu item, a
    // confirm button, the held decision — while the MENU stays open, so the
    // open-focus effect (keyed on `open`) never re-runs. Move focus back to the
    // menu before the nodes go, or it lands on <body> mid-task.
    // By the time this runs React has already removed the node the admin was
    // standing on, so focus is ALREADY on <body> — asking where it used to be
    // answers nothing. The question is where it is now: if the menu is open and
    // focus is not inside it, put it back on the first remaining item.
    if (open) {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !menuRef.current?.contains(active)) {
        focusMenuItem(menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]'));
      }
    }
    // ACTIONABLE surfaces close. The read-only outcome banners (`errorCode`,
    // `archiveFailure`) are deliberately NOT cleared and NOT gated: they only
    // report what already happened, and clearing them here is precisely how an
    // answer the admin is owed goes silent — the defect this whole vector kept
    // producing. `tests/.../_metaOutcomeVisibility.test.tsx` pins the rule for
    // every region, so a new one has to answer the question explicitly.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a RESET on an eligibility change, not a derivation: it runs only on the published→unpublished edge, sets constants, and cannot cascade.
    setSubmenuOpen(false);
    setConfirmingArchive(false);
    setHeldShrink(null);
  }, [showMutatingActions, open]);

  // APG: opening a menu button moves focus to the first item.
  useEffect(() => {
    if (!open) return;
    focusMenuItem(menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]'));
  }, [open]);

  /**
   * Open-focus AND roster reconciliation, in one effect because they answer the
   * same question: is focus on a live item?
   *
   * A background refresh can change the ROSTER, not just publication state. If
   * the crew empties, the submenu's items unmount while `submenuOpen` stays
   * true — focus lands on `<body>`, and crew returning later would reopen a
   * menu the admin never asked for. If a single member is removed (or the
   * overflow item disappears when the count falls back to the cap), the submenu
   * stays up but the focused node is gone.
   *
   * Keyed on the crew IDENTITY list, not just its length: swapping one member
   * for another leaves the count unchanged and still unmounts the focused node.
   */
  useEffect(() => {
    if (!submenuOpen) return;
    if (!hasCrew) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a RESET on a roster change: it runs only on the has-crew→empty edge and cannot cascade.
      setSubmenuOpen(false);
      previewItemRef.current?.focus({ preventScroll: true });
      return;
    }
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !submenuRef.current?.contains(active)) {
      focusMenuItem(submenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]'));
    }
  }, [submenuOpen, hasCrew, crewIdentity]);

  // Accidental-accept safety (WCAG 2.4.3 + §3.8): when the hold prompt appears,
  // focus lands on the SAFE control, never on the destructive accept, so a
  // stray Enter keeps last-good rather than clobbering it.
  // `pending` is in the deps because the safe control is `disabled` while a
  // request is in flight, and a disabled element CANNOT take focus: without
  // this the safe-control-focus contract silently no-ops on any commit where
  // the prompt appears before pending clears, leaving focus back on the first
  // menu item. Retry the moment it becomes focusable.
  useEffect(() => {
    if (heldShrink && !errorCode && !pending)
      keepCurrentRef.current?.focus({ preventScroll: true });
  }, [heldShrink, errorCode, pending]);

  // A closed menu forgets its transient result state; the next open starts
  // clean. The announcement is deliberately NOT cleared — it must survive the
  // close that a success triggers.
  useEffect(() => {
    if (open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a close RESETS transient result state so the next open starts clean; it runs once per close, sets constants (never values derived from other state), and cannot cascade.
    setSubmenuOpen(false);
    setErrorCode(null);
    setHeldShrink(null);
    setConfirmingArchive(false);
    setArchiveFailure(null);
    setStaleOutcome(null);
  }, [open]);

  // C3 (DESIGN.md destructive contract): the confirm mounts with the SAFE
  // control focused. Without it, swapping the row unmounts the focused item,
  // focus falls to <body>, and the next Enter can land on Confirm — the
  // stray-second-Enter vector on a destructive control.
  useEffect(() => {
    // Same disabled-cannot-focus reason as the held prompt above.
    if (confirmingArchive && !pending) archiveCancelRef.current?.focus({ preventScroll: true });
  }, [confirmingArchive, pending]);

  /**
   * C5 (close focus) for the held prompt. Focusing the Re-sync item IMPERATIVELY
   * before `setHeldShrink(null)` looked equivalent and was measurably flaky: the
   * node focused pre-render is not always the node React keeps, and when it is
   * replaced the focus goes with it and lands on `<body>`. Requesting
   * restoration and performing it after the state settles always targets the
   * live node — the same idiom the archive cancel below uses.
   */
  useEffect(() => {
    if (heldShrink !== null || !restoreResyncFocusRef.current) return;
    restoreResyncFocusRef.current = false;
    resyncItemRef.current?.focus({ preventScroll: true });
  }, [heldShrink]);

  // C5 (close focus): only a CANCEL restores, and it must run AFTER the item
  // it returns to has re-mounted.
  useEffect(() => {
    if (confirmingArchive || !restoreArchiveFocusRef.current) return;
    restoreArchiveFocusRef.current = false;
    archiveItemRef.current?.focus({ preventScroll: true });
  }, [confirmingArchive]);

  const runSync = async (accept?: { expectedModifiedTime: string }) => {
    if (pending) return;
    // The submenu is ACTIONABLE — its links navigate — and `busy` only disables
    // the PARENT items, so a submenu flipped above its parent stays clickable
    // beside a running request. Navigating away unmounts the surface the answer
    // is about to land in, which is the silent-outcome defect again.
    setSubmenuOpen(false);
    setErrorCode(null);
    setPendingAction("sync");
    try {
      const outcome = await requestShowSync(slug, accept);
      if (!eligibleRef.current) {
        // The row stopped accepting these actions while this request was in
        // flight. Say so; do not write into a gated region.
        setStaleOutcome(STALE_ROW_COPY);
        announce(STALE_ROW_COPY);
        return;
      }
      if (outcome.kind === "held") {
        // NOT a success: the reduced version was withheld and last-good is
        // still live. Closing here would silently discard the decision.
        setHeldShrink({ detail: outcome.detail, heldModifiedTime: outcome.heldModifiedTime });
        announce(`Sync paused for a decision. ${outcome.detail}`);
      } else if (outcome.kind === "success") {
        setHeldShrink(null);
        announce(outcome.summary);
        // Ordering (§3.5): refresh FIRST, then close — the row's own sync cell
        // has to be re-rendering by the time the menu goes away.
        router.refresh();
        // closeMenu(TRUE): the focused menuitem is about to unmount, and a
        // close that leaves focus on <body> strands a keyboard user at the top
        // of the document (WCAG 2.4.3).
        closeMenu(true);
      } else {
        // The held prompt unmounts with this, taking the focused control with
        // it; ask for restoration and let the effect below perform it once the
        // state has settled.
        if (heldShrink !== null) restoreResyncFocusRef.current = true;
        setHeldShrink(null);
        setErrorCode(outcome.code);
      }
    } finally {
      setPendingAction(null);
    }
  };

  const runArchive = async () => {
    if (pending) return;
    setSubmenuOpen(false);
    setArchiveFailure(null);
    setPendingAction("archive");
    try {
      // The SHIPPED action takes a SLUG and resolves the show itself; passing
      // row.id would return show_not_found without archiving anything.
      const result = await archiveShowAction(slug);
      if (!eligibleRef.current && !result.ok) {
        setStaleOutcome(STALE_ROW_COPY);
        announce(STALE_ROW_COPY);
        return;
      }
      if (result.ok) {
        setConfirmingArchive(false);
        announce(`Archived ${label}. Crew links for this show stop working now.`);
        // Ordering (§3.5): refresh FIRST — the row has to be relocating into
        // the Archived bucket by the time the menu goes away.
        router.refresh();
        // closeMenu(true) aims focus at the trigger, which SURVIVES a sync but
        // not an archive: the refresh moves this row out of the active bucket
        // and the trigger unmounts with it, so focus lands on <body>. That is a
        // documented limit (spec §6) rather than something this component can
        // fix alone — the anchor it would need belongs to ShowsTable, and the
        // announcement channel it would need outlives no row. The call stays
        // because it is correct whenever the row DOES survive.
        closeMenu(true);
      } else {
        setArchiveFailure(classifyArchiveFailure(result.code));
      }
    } catch {
      if (!eligibleRef.current) {
        setStaleOutcome(STALE_ROW_COPY);
        announce(STALE_ROW_COPY);
        return;
      }
      // A server action can REJECT — transport, auth, or a post-commit fault in
      // the action itself (its telemetry write is awaited). Without this the
      // rejection is an unhandled promise and the row shows a confirm step for
      // a show that may already be archived.
      setArchiveFailure({ kind: "generic" });
    } finally {
      setPendingAction(null);
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // A confirm step is NOT a menu. Its Cancel/Confirm pair are plain buttons,
    // not `role="menuitem"`, so the menu grammar below would strand a keyboard
    // user on the safe control: Arrow keys jump back to the menu items and Tab
    // closes the whole surface, leaving Confirm archive / Apply reduced version
    // unreachable (WCAG 2.1.1). While a sub-panel owns the surface, native Tab
    // moves between its two controls and Escape cancels ONE level, back to the
    // menu it came from.
    if (confirmingArchive || heldShrink !== null) {
      if (e.key === "Tab") {
        // Two stops, cycled: the menu is still open behind the prompt, so
        // tabbing out to the page underneath it would leave a decision pending
        // over content the backdrop is meant to hold off.
        e.preventDefault();
        const stops = (
          confirmingArchive
            ? [archiveCancelRef.current, archiveGoRef.current]
            : [keepCurrentRef.current, acceptShrinkRef.current]
        ).filter((el): el is HTMLButtonElement => el !== null);
        if (stops.length === 0) return;
        const at = stops.indexOf(document.activeElement as HTMLButtonElement);
        const next = (at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length;
        stops[next]?.focus({ preventScroll: true });
        return;
      }
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      // A request in flight owns the sub-panel too: cancelling here would
      // unmount the region its outcome is about to land in.
      if (pending) return;
      if (confirmingArchive) {
        restoreArchiveFocusRef.current = true;
        setConfirmingArchive(false);
      } else {
        restoreResyncFocusRef.current = true;
        setHeldShrink(null);
      }
      return;
    }
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
      dismissMenu(true);
    } else if (e.key === "Tab") {
      // APG menu-button: Tab closes. Focusing the trigger BEFORE the default
      // Tab action lets focus continue in document order from the trigger.
      // While a request is in flight the close is refused, and the NATIVE Tab
      // has to be refused with it — otherwise focus walks out of a menu that
      // deliberately stayed open, and the outcome lands somewhere the admin is
      // no longer looking.
      if (pending) {
        e.preventDefault();
        return;
      }
      triggerRef.current?.focus({ preventScroll: true });
      dismissMenu(false);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (document.activeElement === previewItemRef.current && hasCrew && !busy) {
        setSubmenuOpen(true);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusMenuItem(items[(idx + 1 + items.length) % items.length]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusMenuItem(items[(idx - 1 + items.length) % items.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusMenuItem(items[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      focusMenuItem(items[items.length - 1]);
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
      triggerRef.current?.focus({ preventScroll: true });
      dismissMenu(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusMenuItem(items[(idx + 1 + items.length) % items.length]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusMenuItem(items[(idx - 1 + items.length) % items.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusMenuItem(items[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      focusMenuItem(items[items.length - 1]);
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
        {announcement.seq % 2 === 0 ? announcement.text : `${announcement.text}\u00A0`}
      </span>

      {open && mounted
        ? createPortal(
            // PORTALED, not rendered in place: the row's menu seat is a
            // positioned `z-raised` span, so a backdrop inside it is trapped in
            // that stacking context and paints BELOW the mobile bottom tab bar
            // (`z-nav`) — the admin could navigate away mid-request, unmounting
            // the row before its outcome was ever shown. As a body child it
            // sits above the nav and below the menu panel (`z-overlay`).
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              data-testid={`row-actions-backdrop-${slug}`}
              onClick={() => dismissMenu(false)}
              className="fixed inset-0 z-banner cursor-default"
            />,
            document.body,
          )
        : null}

      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}`}
        data-testid={`row-actions-trigger-${slug}`}
        onClick={() => {
          // Toggling CLOSED is a dismissal, and dismissal is refused while a
          // request is in flight; toggling open is always allowed.
          if (open) dismissMenu(false);
          else setOpen(true);
        }}
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
        // Page scroll dismisses (spec §3.1): a menu that chases its trigger down
        // the page can end up somewhere the admin never pointed. Focus returns
        // to the trigger so it is never stranded on a removed node — with
        // preventScroll, so the dismissal does not fight the scroll that caused it.
        onDismiss={() => dismissMenu(true)}
      >
        {/* The panel owns the chrome AND the key handling; the `role="menu"`
            element inside it holds ONLY menuitems and separators. The ARIA menu
            content model has no room for an error region, a decision prompt or
            a confirm step, and a keydown handler on the wrapper still sees keys
            from every one of them. */}
        <div
          ref={panelRef}
          data-testid={`row-actions-panel-${slug}`}
          onKeyDown={onMenuKeyDown}
          className="min-w-52 max-w-80 rounded-md border border-border bg-surface-raised p-1.5 shadow-popover"
        >
          <div
            ref={menuRef}
            role="menu"
            aria-labelledby={triggerId}
            data-testid={`row-actions-menu-${slug}`}
            className="flex flex-col"
          >
            <Link
              role="menuitem"
              tabIndex={-1}
              data-testid={`row-action-open-${slug}`}
              // The SAME param-preserving modal href the row link itself uses —
              // `/admin/show/[slug]` is only a legacy redirect (spec §3.1).
              href={openHref(slug)}
              scroll={false}
              // Explicit, not the shared `{...itemDisabledProps}` spread: an
              // identifier-backed spread on an ANCHOR is unresolvable to the
              // new-tab announcement scanner (tests/styles/_metaNewTabAnnouncement),
              // which then cannot prove this link opens in the same tab.
              aria-disabled={busy || undefined}
              onClick={(e) => {
                if (busy) {
                  e.preventDefault();
                  return;
                }
                dismissMenu(false);
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
                    // role="none": a <p> is not part of the ARIA menu content model, and
                    // this one is referenced by aria-describedby rather than read in place.
                    role="none"
                    className="px-2.5 pb-1 text-xs/relaxed text-text-subtle"
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
                  aria-busy={pendingAction === "sync"}
                  {...itemDisabledProps}
                  onClick={() => {
                    if (busy) return;
                    void runSync();
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={`${ICON_CLASS} ${pendingAction === "sync" ? "animate-spin motion-reduce:animate-none" : ""}`}
                  />
                  {pendingAction === "sync" ? RESYNC_PENDING_LABEL : RESYNC_IDLE_LABEL}
                </button>

                {/* Archive is destructive and sits one arrow-key from Re-sync;
                    the shipped CrewRowActions precedent separates it the same
                    way. §12 recorded this fixed once and the ARIA restructure
                    then removed it — the shell test now REQUIRES a separator
                    before the destructive item rather than merely permitting
                    one, so it cannot be lost silently again. */}
                {confirmingArchive ? null : (
                  <div role="separator" className="mx-1.5 my-1 h-px bg-border" />
                )}
                {confirmingArchive ? null : (
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
              </>
            ) : null}
          </div>
          {showMutatingActions && confirmingArchive ? (
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
                {archiveConsequenceProse(label)}
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
                  className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-text-faint bg-surface px-3.5 text-[13px] font-medium text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                {/* Tier-2 destructive confirm-go (§3.8): archiving rotates
                      the crew link dead immediately. Registered in
                      tests/styles/_metaDestructiveConfirm (occurrence 1). */}
                <button
                  type="button"
                  ref={archiveGoRef}
                  data-testid={`row-actions-archive-go-${slug}`}
                  aria-describedby={archiveWarnId}
                  disabled={pending}
                  aria-busy={pendingAction === "archive"}
                  onClick={() => void runArchive()}
                  className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-3.5 py-2 text-[13px] font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pendingAction === "archive" ? "Archiving…" : "Confirm archive"}
                </button>
              </div>
            </div>
          ) : null}
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

          {staleOutcome ? (
            // UNGATED on purpose: this is read-only copy about a row that has
            // already stopped accepting actions, and gating it would recreate
            // the silence it exists to prevent.
            <div
              role="alert"
              data-testid={`row-actions-stale-${slug}`}
              className="mt-1 rounded-sm border border-border-strong bg-warning-bg p-2.5 text-xs/relaxed text-warning-text"
            >
              {staleOutcome}
            </div>
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
                {/* `ErrorExplainer` renders NOTHING for a code with no catalog
                    row or a null `dougFacing` — several the sync route can
                    return are exactly that — so trusting it alone paints an
                    empty alert. The fallback speaks plain language and never
                    contains the code (invariant 5). */}
                {hasSyncFailureCopy(errorCode) ? (
                  <ErrorExplainer code={errorCode} surface="admin" />
                ) : (
                  SYNC_GENERIC_ERROR_COPY
                )}
              </div>
            </div>
          ) : null}

          {showMutatingActions && heldShrink && !errorCode ? (
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
                    restoreResyncFocusRef.current = true;
                    setHeldShrink(null);
                  }}
                  className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-control-outline-tinted bg-bg px-3.5 text-[13px] font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Keep current version
                </button>
                {/* Tier-2 destructive confirm-go (§3.8): accepting a
                    show-shrinking sync over last-good takes the inverted-amber
                    C1 recipe. Registered in tests/styles/_metaDestructiveConfirm. */}
                <button
                  type="button"
                  ref={acceptShrinkRef}
                  data-testid={`row-actions-accept-shrink-${slug}`}
                  disabled={pending}
                  aria-busy={pendingAction === "sync"}
                  onClick={() =>
                    void runSync({ expectedModifiedTime: heldShrink.heldModifiedTime })
                  }
                  className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-3.5 py-2 text-[13px] font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pendingAction === "sync" ? "Applying…" : "Apply reduced version"}
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
        onDismiss={() => dismissMenu(true)}
      >
        <div
          ref={submenuRef}
          role="menu"
          aria-label={`Preview ${label} as`}
          data-testid={`row-action-preview-menu-${slug}`}
          onKeyDown={onSubmenuKeyDown}
          className="min-w-52 rounded-md border border-border bg-surface-raised p-1.5 shadow-popover"
        >
          {shownCrew.map((member) => (
            <Link
              key={member.id}
              role="menuitem"
              tabIndex={-1}
              data-testid={`row-action-preview-crew-${member.id}`}
              href={`/admin/show/${encodeURIComponent(slug)}/preview/${encodeURIComponent(member.id)}`}
              // Explicit, not the shared spread: an identifier-backed spread on
              // an ANCHOR is unresolvable to the new-tab announcement scanner
              // (tests/styles/_metaNewTabAnnouncement), which then cannot prove
              // this link opens in the same tab. Same reason as the Open item.
              aria-disabled={busy || undefined}
              onClick={(e) => {
                if (busy) {
                  e.preventDefault();
                  return;
                }
                dismissMenu(false);
              }}
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
              aria-disabled={busy || undefined}
              onClick={(e) => {
                if (busy) {
                  e.preventDefault();
                  return;
                }
                dismissMenu(false);
              }}
              // No colour override: this row used to rest at `text-text-subtle` so it
              // read as an overflow note rather than an action. The subtle-on-interactive
              // policy (DESIGN §1.1a) retired that — it IS an action, and MENU_ITEM_CLASS
              // already sets `text-text`. The distinction it carried in colour is carried
              // by its copy.
              className={MENU_ITEM_CLASS}
            >
              {`… and ${overflowCrewCount} more (open the show)`}
            </Link>
          ) : null}
        </div>
      </AnchoredPortal>
    </span>
  );
}
