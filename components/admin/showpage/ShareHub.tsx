"use client";

/**
 * components/admin/showpage/ShareHub.tsx
 *
 * The published review modal's share hub: one popover holding the crew URL,
 * Copy, the batched Email-crew rows, and the two destructive controls (rotate
 * share link / reset everyone's pick). Opened by either the primary "Share
 * link" button or the kebab; both drive the same popover.
 *
 * Spec: docs/superpowers/specs/2026-07-20-share-hub-design.md
 *   §4 lifecycle close (deferred while busy) · §6 dismissal + busy contract ·
 *   §9 R1-R4 composition rules (executable in shareHub.test.tsx, not narrated).
 *
 * GEOMETRY IS NOT AUTHORED HERE (plan T3/T4 boundary). Width, absolute
 * placement, the mobile clamp and tap-min sizing land in T4 alongside the
 * Playwright assertions that verify them — jsdom computes no layout, so
 * anything committed here would be unproven until a later commit.
 *
 * Close semantics mirror the shipped CrewRowActions popover (#499): a backdrop
 * button that closes without focus restore, and Escape that closes WITH focus
 * restore and calls stopPropagation — ReviewModalShell.tsx:238-245 listens for
 * Escape at the document level and closes the whole modal on any Escape
 * without inspecting defaultPrevented, so stopping propagation is what keeps
 * the review modal open.
 */

import { Link2, Mail, MoreVertical } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { buildCrewLinkMailtos } from "@/app/admin/show/[slug]/crewLinkMailto";
import { PickerResetControl } from "@/app/admin/show/[slug]/PickerResetControl";
import { resolveOrigin } from "@/app/admin/show/[slug]/resolveOrigin";
import { RotateShareTokenButton } from "@/app/admin/show/[slug]/RotateShareTokenButton";
import { ShareLinkCopyButton } from "@/app/admin/show/[slug]/ShareLinkCopyButton";
import { useShareToken } from "@/app/admin/show/[slug]/ShareTokenContext";
import type { PickerResetCrewRow } from "@/app/admin/show/[slug]/PickerResetControl";

export type ShareHubProps = {
  slug: string;
  showId: string;
  /** Drives the paused presentation and the crew-link arm; NOT a security gate. */
  published: boolean;
  crewEmails: readonly string[];
  showTitle: string;
  pickerCrew: PickerResetCrewRow[];
};

export function ShareHub({
  slug,
  showId,
  published,
  crewEmails,
  showTitle,
  pickerCrew,
}: ShareHubProps) {
  const { token, applyRotated } = useShareToken();
  const [open, setOpen] = useState(false);
  const popoverId = useId();

  // One flag per child rather than a shared counter: the children report a
  // LEVEL (spec §6), so a repeated value is harmless and no missed edge can
  // drift a count into a permanently-inert popover.
  const [rotateBusy, setRotateBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const busy = rotateBusy || resetBusy;

  const primaryRef = useRef<HTMLButtonElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  /** Which trigger opened it — Escape restores focus there specifically. */
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const onRotateBusy = useCallback((b: boolean) => setRotateBusy(b), []);
  const onResetBusy = useCallback((b: boolean) => setResetBusy(b), []);

  const url = token != null ? `${resolveOrigin()}/show/${slug}/${token}` : null;
  // The crew link is live only for a published show; an unpublished one keeps
  // its token but must not surface a copyable URL (spec §4).
  const linkActive = published && url != null;
  const mailtos = linkActive ? buildCrewLinkMailtos({ emails: crewEmails, url, showTitle }) : [];

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
  const prevPublishedRef = useRef(published);
  const deferredCloseRef = useRef(false);

  useEffect(() => {
    if (prevPublishedRef.current === published) return;
    prevPublishedRef.current = published;
    if (!open) return;
    if (busy) {
      deferredCloseRef.current = true;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [published, open, busy]);

  // The deferred close lands the moment the last in-flight action settles.
  useEffect(() => {
    if (busy || !deferredCloseRef.current) return;
    deferredCloseRef.current = false;
    setOpen(false);
  }, [busy]);

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
    <div className="flex items-center gap-2">
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

      <button
        type="button"
        ref={primaryRef}
        data-testid="share-hub-primary"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => toggle("primary")}
        className={
          published
            ? "inline-flex items-center justify-center gap-1.5 rounded-sm bg-accent px-3 text-sm font-semibold text-accent-contrast transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            : "inline-flex items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-subtle transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        }
      >
        <Link2 aria-hidden="true" size={15} />
        {published ? "Share link" : "Share link · paused"}
      </button>

      <button
        type="button"
        ref={kebabRef}
        data-testid="share-hub-kebab"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label="More share actions"
        onClick={() => toggle("kebab")}
        className={`inline-flex items-center justify-center rounded-sm text-text-strong transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
          open ? "bg-surface-sunken" : "bg-transparent"
        }`}
      >
        <MoreVertical aria-hidden="true" size={18} />
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Share crew link"
          data-testid="share-hub-popover"
          onKeyDown={onPopoverKeyDown}
          className="z-30 flex flex-col gap-2 rounded-md border border-border bg-surface p-2.5 shadow-lg"
        >
          <p className="px-0.5 text-xs font-semibold uppercase tracking-wide text-text-subtle">
            Crew link
          </p>

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
                  Your crew list needs {mailtos.length} separate emails. Send each one; addresses go
                  in Bcc.
                </p>
              )}
              {mailtos.map((m) => (
                <a
                  key={m.batch}
                  href={m.href}
                  data-testid="admin-current-share-link-email-button"
                  className="inline-flex min-h-tap-min items-center gap-2 rounded-sm px-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
              className="rounded-sm bg-surface-sunken px-2 py-1.5 text-xs/relaxed  text-text-subtle"
            >
              The crew link is paused while this show is unpublished. Publish to share it — you can
              still rotate or reset below.
            </p>
          )}

          <div className="h-px bg-border" />
          <p className="px-0.5 text-xs font-semibold uppercase tracking-wide text-text-subtle">
            Careful
          </p>

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
        </div>
      )}
    </div>
  );
}
