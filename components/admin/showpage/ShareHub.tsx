"use client";

/**
 * components/admin/showpage/ShareHub.tsx
 *
 * The published review modal's share hub: one popover holding the crew URL,
 * Copy, the batched Email-crew rows, the two destructive share controls (rotate
 * share link / reset everyone's pick), and — in its own "Show" section — the
 * archive lifecycle control. Opened by either the primary "Share link" button
 * or the kebab; both drive the same popover.
 *
 * Two arms, selected by `archived`:
 *   - Not archived → primary + kebab; crew-link section, Careful section, and
 *     (unless finalize-owned) a Show section holding Archive.
 *   - Archived     → KEBAB ONLY, and the popover holds nothing but the Show
 *     section's Unarchive. The share half is read-only-suppressed wholesale.
 *     The hub itself must stay mounted here: it is Unarchive's only home, so
 *     the strip's group is unconditional (StatusStrip.tsx).
 *
 * The lifecycle control is a busy-reporting child exactly like rotate and
 * reset — it reports through `onBusyChange`, so an in-flight archive gates
 * every dismissal path (§6) instead of unmounting its own outcome banner.
 *
 * Spec: docs/superpowers/specs/2026-07-20-share-hub-design.md
 *   §4 lifecycle close (deferred while busy) · §6 dismissal + busy contract ·
 *   §9 R1-R4 composition rules (executable in shareHub.test.tsx, not narrated).
 *
 * Geometry (added in T4, alongside the Playwright assertions that verify it —
 * jsdom computes no layout, so none of this is provable in a unit test):
 * the popover is `absolute top-full right-0 w-[308px]`, positioned against this
 * component's own `relative` root rather than the strip row. The row deliberately has
 * NO `relative` (StatusStrip.tsx: the band owns the positioned ancestor, and
 * re-anchoring it would break the Re-sync overlay's `inset-x-0` full-band
 * width). The wrapper's right edge is the band's content edge via `ml-auto` on
 * the strip's hub group, so `right-0` aligns the panel to that same edge.
 * `max-w-[calc(100vw-2rem)]` keeps it inside the modal at 390px.
 *
 * Close semantics mirror the shipped CrewRowActions popover (#499): a backdrop
 * button that closes without focus restore, and Escape that closes WITH focus
 * restore and calls stopPropagation — ReviewModalShell.tsx:238-245 listens for
 * Escape at the document level and closes the whole modal on any Escape
 * without inspecting defaultPrevented, so stopping propagation is what keeps
 * the review modal open.
 */

import { Link2, Mail, MoreVertical } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { ArchiveShowButton } from "@/components/admin/ArchiveShowButton";
import { UnarchiveShowButton } from "@/components/admin/UnarchiveShowButton";
import { buildCrewLinkMailtos } from "@/app/admin/show/[slug]/crewLinkMailto";
import { PickerResetControl } from "@/app/admin/show/[slug]/PickerResetControl";
import { resolveOrigin } from "@/app/admin/show/[slug]/resolveOrigin";
import { RotateShareTokenButton } from "@/app/admin/show/[slug]/RotateShareTokenButton";
import { ShareLinkCopyButton } from "@/app/admin/show/[slug]/ShareLinkCopyButton";
import { useShareToken } from "@/app/admin/show/[slug]/ShareTokenContext";
import type { PickerResetCrewRow } from "@/app/admin/show/[slug]/PickerResetControl";

/** How long dismissal stays gated on an in-flight action before the operator
 *  gets control back (see the `busyStuck` rationale below). Deliberately longer
 *  than any healthy round-trip on this surface. */
const BUSY_GATE_MAX_MS = 15_000;

type LifecycleResult = { ok: true } | { ok: false; code: string };

export type ShareHubProps = {
  slug: string;
  showId: string;
  /** Drives the paused presentation and the crew-link arm; NOT a security gate. */
  published: boolean;
  /** Read-only lifecycle: the whole share half is suppressed and the Show
   *  section offers Unarchive instead of Archive. */
  archived: boolean;
  /** Finalize-owned ("Publishing…") window: the show is immutable, so the Show
   *  section is omitted entirely rather than rendering a disabled Archive. */
  finalizeOwned: boolean;
  crewEmails: readonly string[];
  showTitle: string;
  pickerCrew: PickerResetCrewRow[];
  /** Pre-bound (to this show's slug) Archive server action. */
  archiveAction: () => Promise<LifecycleResult>;
  /** Show-scoped Unarchive server action (called with `showId`). */
  unarchiveAction: (showId: string) => Promise<void>;
};

export function ShareHub({
  slug,
  showId,
  published,
  archived,
  finalizeOwned,
  crewEmails,
  showTitle,
  pickerCrew,
  archiveAction,
  unarchiveAction,
}: ShareHubProps) {
  const { token, applyRotated } = useShareToken();
  const [open, setOpen] = useState(false);
  const popoverId = useId();

  // One flag per child rather than a shared counter: the children report a
  // LEVEL (spec §6), so a repeated value is harmless and no missed edge can
  // drift a count into a permanently-inert popover.
  const [rotateBusy, setRotateBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  // A server action that never settles (network hang, a proxy that drops the
  // response after the mutation commits) would otherwise leave `busy` true
  // forever: all four dismissal paths inert AND Escape swallowed, so the
  // operator could not close the popover at all. Being unable to dismiss is a
  // worse failure than losing an outcome banner, so the gate is time-bounded —
  // past this window the operator gets control back even though the action is
  // still notionally in flight.
  const [busyStuck, setBusyStuck] = useState(false);
  const inFlight = rotateBusy || resetBusy || lifecycleBusy;
  const busy = inFlight && !busyStuck;

  useEffect(() => {
    if (!inFlight) return;
    const t = setTimeout(() => setBusyStuck(true), BUSY_GATE_MAX_MS);
    // Cleanup runs when the action settles (or the hub unmounts), which is
    // exactly when the bound should be re-armed for the next action.
    return () => {
      clearTimeout(t);
      setBusyStuck(false);
    };
  }, [inFlight]);

  const primaryRef = useRef<HTMLButtonElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Which trigger opened it — Escape restores focus there specifically. */
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const onRotateBusy = useCallback((b: boolean) => setRotateBusy(b), []);
  const onResetBusy = useCallback((b: boolean) => setResetBusy(b), []);
  const onLifecycleBusy = useCallback((b: boolean) => setLifecycleBusy(b), []);

  const url = token != null ? `${resolveOrigin()}/show/${slug}/${token}` : null;
  // The crew link is live only for a published show; an unpublished one keeps
  // its token but must not surface a copyable URL (spec §4).
  // `!archived` is defensive-in-depth: the archived arm renders no share half at
  // all, but a future edit that reintroduces one must not surface a live crew URL
  // for a read-only show.
  const linkActive = published && !archived && url != null;
  // Gated on `open`: the strip re-renders on every loader pass (relative-time
  // props churn), and batching the roster into mailto hrefs is real work that
  // nothing can observe while the popover is closed.
  const mailtos = useMemo(
    () => (open && linkActive ? buildCrewLinkMailtos({ emails: crewEmails, url, showTitle }) : []),
    [open, linkActive, crewEmails, url, showTitle],
  );

  const toggle = (which: "primary" | "kebab") => {
    // §6: every dismissal path is inert while a child is mid-flight. Closing
    // here would unmount the child — the mutation still lands (rotate would
    // kill the crew's current link) but its outcome banner would never render.
    if (open && busy) return;
    if (open) {
      setOpen(false);
      return;
    }
    openerRef.current = which === "primary" ? primaryRef.current : kebabRef.current;
    setOpen(true);
  };

  const closeWithFocus = () => {
    setOpen(false);
    openerRef.current?.focus();
  };

  // §4: a lifecycle change closes the hub — EXCEPT while a child is mid-flight,
  // where the close is DEFERRED until the action settles. Unmounting mid-flight
  // still completes the mutation but loses its outcome banner, so the operator
  // would rotate a share link (killing the crew's current URL) with no
  // confirmation it happened.
  //
  // "Lifecycle" is BOTH axes, not just publish: the hub now hosts the archive
  // control, so a successful Archive swaps the popover's entire contents
  // (share half gone, Archive → Unarchive). Keyed on `published` alone, the
  // popover would survive that swap and the operator's next tap would land on
  // a different control than the one they aimed at.
  const prevLifecycleRef = useRef({ published, archived });
  const deferredCloseRef = useRef(false);

  useEffect(() => {
    const prev = prevLifecycleRef.current;
    if (prev.published === published && prev.archived === archived) return;
    prevLifecycleRef.current = { published, archived };
    if (!open) return;
    if (busy) {
      deferredCloseRef.current = true;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [published, archived, open, busy]);

  // When the action settles, the deferred close is CANCELLED, not applied.
  //
  // Applying it here was self-defeating: `busy` clearing is the SAME transition
  // that mounts the outcome banner, so closing on it unmounted the banner after
  // roughly one paint and could swallow its live-region announcement — exactly
  // the harm the deferral exists to prevent. A completed destructive action
  // (a rotated link is already dead for the whole crew) outranks the
  // convenience of auto-closing on a lifecycle change, so the popover stays
  // open with its outcome visible and the operator dismisses it.
  useEffect(() => {
    if (busy) return;
    deferredCloseRef.current = false;
  }, [busy]);

  // Escape safety net. The panel's own onKeyDown only fires while focus is
  // INSIDE it, and this popover deliberately has no focus trap — so after
  // tabbing past the last control, Escape would reach the shell's document
  // listener (ReviewModalShell.tsx:238-245), which closes the ENTIRE review
  // modal on any Escape without checking defaultPrevented. Capture phase is
  // what makes the hub win: it runs before the shell's bubble-phase handler.
  useEffect(() => {
    if (!open) return;
    const onDocKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      setOpen(false);
      openerRef.current?.focus();
    };
    document.addEventListener("keydown", onDocKeyDown, true);
    return () => document.removeEventListener("keydown", onDocKeyDown, true);
  }, [open, busy]);

  // A role="dialog" must RECEIVE focus when it opens; without this, Tab from
  // the primary trigger reaches the kebab before the panel's own controls, and
  // screen-reader users are never moved into the dialog they just opened.
  // The panel itself takes focus (tabIndex={-1}) rather than the first control,
  // so the label is announced before the first action.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const onPopoverKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    // stopPropagation is the load-bearing call: the shell's document listener
    // closes the whole modal on ANY Escape and never checks defaultPrevented.
    // Swallowed even while busy — closing the review modal instead of the
    // popover is strictly worse.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    closeWithFocus();
  };

  return (
    <div className="relative z-30 flex items-center gap-2">
      {open && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          data-testid="share-hub-backdrop"
          onClick={() => {
            if (!busy) setOpen(false);
          }}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}

      {/* Archived is read-only for SHARING, so the crew-link primary is gone —
          but the hub survives as the single home for the lifecycle control, and
          the kebab below is what opens it. */}
      {!archived ? (
        <button
          type="button"
          ref={primaryRef}
          data-testid="share-hub-primary"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={popoverId}
          onClick={() => toggle("primary")}
          // NOT bg-accent, deliberately. DESIGN.md reserves the FXAV orange for
          // "this matters now" — and the band's accent set is contractually
          // EXACTLY {published-toggle, status-dot-live} (T-NO-ORANGE in
          // published-review-modal.layout.spec.ts). Share link is a routine,
          // always-available action, not a live-state signal, so an accent fill
          // here would both break that pin and dilute the one cue that means the
          // show is on air. The mock drew it orange; the project invariant wins.
          // The two arms differentiate by LABEL and weight instead.
          className={
            published
              ? "inline-flex min-h-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              : "inline-flex min-h-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-subtle transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          }
        >
          <Link2 aria-hidden="true" size={15} />
          {published ? "Share link" : "Share link · paused"}
        </button>
      ) : null}

      <button
        type="button"
        ref={kebabRef}
        data-testid="share-hub-kebab"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        // Not "More SHARE actions" any more: the popover also owns the archive
        // lifecycle control, and on an archived show that is ALL it owns.
        aria-label="More show actions"
        onClick={() => toggle("kebab")}
        className={`inline-flex size-tap-min items-center justify-center rounded-sm text-text-strong transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
          open ? "bg-surface-sunken" : "bg-transparent"
        }`}
      >
        <MoreVertical aria-hidden="true" size={18} />
      </button>

      {open && (
        <div
          id={popoverId}
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label={archived ? "Show actions" : "Share crew link and show actions"}
          data-testid="share-hub-popover"
          onKeyDown={onPopoverKeyDown}
          // max-h + overflow: the email rows are batched per 1900-char mailto
          // cap with no row limit, so a large roster could otherwise push the
          // destructive controls below the fold on a 390px phone.
          className="absolute right-0 top-full z-40 mt-1.5 flex max-h-[min(70vh,32rem)] w-[308px] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto rounded-md border border-border bg-surface p-2.5 shadow-popover focus-visible:outline-none"
        >
          {/* Share half — suppressed wholesale while archived (read-only): no
              URL, no Copy, no email rows, no rotate, no reset. What remains is
              the Show section below. */}
          {!archived ? (
            <>
              <h3 className="px-0.5 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
                Crew link
              </h3>

              {linkActive ? (
                <>
                  <div className="flex items-start gap-1.5">
                    <code
                      data-testid="admin-current-share-link-url"
                      className="min-w-0 flex-1 break-all rounded-sm bg-surface-sunken px-2 py-1 text-xs text-text-strong"
                    >
                      {url}
                    </code>
                    <ShareLinkCopyButton url={url} variant="accent" />
                  </div>
                  {mailtos.length > 1 && (
                    <p
                      data-testid="admin-current-share-link-email-note"
                      className="text-xs text-text-subtle"
                    >
                      Your crew list needs {mailtos.length} separate emails. Send each one;
                      addresses go in Bcc.
                    </p>
                  )}
                  {mailtos.map((m) => (
                    <a
                      key={m.batch}
                      href={m.href}
                      data-testid="admin-current-share-link-email-button"
                      className="flex min-h-tap-min w-full items-center gap-2 rounded-sm px-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      <Mail aria-hidden="true" size={16} className="shrink-0 text-text-subtle" />
                      {m.batchCount === 1
                        ? "Email this link to crew"
                        : `Email this link to crew (${m.batch} of ${m.batchCount})`}
                    </a>
                  ))}
                </>
              ) : published ? (
                <p
                  data-testid="admin-current-share-link-unavailable"
                  role="status"
                  className="rounded-sm bg-surface-sunken px-2 py-1 text-sm text-text-subtle"
                >
                  The share-link is unavailable right now. Refresh the page; if the problem repeats,
                  rotate to mint a new link.
                </p>
              ) : (
                <p
                  data-testid="share-hub-paused-note"
                  className="rounded-sm bg-surface-sunken px-2 py-1.5 text-xs/relaxed text-text-subtle"
                >
                  The crew link is paused while this show is unpublished. Publish to share it — you
                  can still rotate or reset below.
                </p>
              )}

              <div className="h-px bg-border" />
              <h3 className="px-0.5 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
                Careful
              </h3>

              <RotateShareTokenButton
                showId={showId}
                slug={slug}
                isCrewLinkActive={linkActive}
                onRotated={applyRotated}
                onBusyChange={onRotateBusy}
                compact
                rowLabel="Rotate share link"
                rowDescription="Old link stops working immediately"
              />
              <PickerResetControl showId={showId} crew={pickerCrew} onBusyChange={onResetBusy} />
            </>
          ) : null}

          {/* Show — the lifecycle control's single home, in BOTH directions.
              Deliberately its own section rather than folded into Careful:
              Careful is share-scoped (rotate the link, reset the picks), while
              this changes what the show IS.

              Omitted entirely during the finalize-owned "Publishing…" window
              (consolidated-admin-show-page §6): the show is immutable there, so
              rendering the heading with nothing under it would state a section
              that offers nothing. `archived` wins over `finalizeOwned` — an
              archived show is never finalize-owned (the loader forces it false),
              and Unarchive must stay reachable regardless. */}
          {archived || !finalizeOwned ? (
            <>
              {!archived ? <div className="h-px bg-border" /> : null}
              <h3 className="px-0.5 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
                Show
              </h3>
              <div data-testid="share-hub-show-section" className="px-0.5">
                {archived ? (
                  <UnarchiveShowButton
                    showId={showId}
                    unarchiveAction={unarchiveAction}
                    onBusyChange={onLifecycleBusy}
                  />
                ) : (
                  <ArchiveShowButton
                    archiveAction={archiveAction}
                    compact
                    onBusyChange={onLifecycleBusy}
                  />
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
