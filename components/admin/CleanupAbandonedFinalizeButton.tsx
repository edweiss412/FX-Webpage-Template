"use client";

/**
 * components/admin/CleanupAbandonedFinalizeButton.tsx
 * (M10 §B Task 10.1 §B / Phase 2)
 *
 * Destructive abandon-and-restart action. Confirmation modal before
 * POSTing to /api/admin/onboarding/cleanup-abandoned-finalize/[sessionId].
 * The helper-side guards (session-staleness CAS + checkpoint-recency
 * check per Task 10.1 finding 1) are the AUTHORITATIVE staleness gate;
 * a 409 CLEANUP_REQUIRES_STALE_SESSION response means the helper's
 * DB-clock check disagreed with the render-time staleness check
 * (app-vs-DB clock skew). On success router.refresh; on 409 toast +
 * router.refresh so the next page-load re-reads the checkpoint.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { HelpAffordance } from "@/components/admin/HelpAffordance";

type CleanupResponse =
  | { status: "cleaned" | "already_cleaned" }
  | { ok: false; code: string; reason?: string };

type Props = { sessionId: string };

type State =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "running" }
  | { kind: "error"; copy: string; code: string | null };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when catalog lookup returns null; all real error copy routes through messageFor(code).dougFacing first.
const GENERIC_ERROR =
  "We could not discard this setup. Refresh and try again, or contact the developer if this keeps happening.";

export function CleanupAbandonedFinalizeButton({ sessionId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function confirmAndRun() {
    setState({ kind: "running" });
    try {
      const response = await fetch(
        `/api/admin/onboarding/cleanup-abandoned-finalize/${encodeURIComponent(sessionId)}`,
        { method: "POST" },
      );
      const body = (await response.json()) as CleanupResponse;
      if ("ok" in body && body.ok === false) {
        setState({
          kind: "error",
          copy: lookupDougFacing(body.code) ?? GENERIC_ERROR,
          code: body.code,
        });
        router.refresh();
        return;
      }
      setState({ kind: "idle" });
      router.refresh();
    } catch {
      setState({ kind: "error", copy: GENERIC_ERROR, code: null });
    }
  }

  return (
    <div className="relative flex flex-col gap-3" data-testid="cleanup-abandoned-finalize">
      {/* The trigger stays MOUNTED while confirming so the popover has a stable
          anchor and the footer doesn't jump when the confirm opens. */}
      <button
        type="button"
        data-testid="cleanup-abandoned-finalize-button"
        onClick={() => setState({ kind: "confirming" })}
        disabled={state.kind === "running"}
        aria-haspopup="dialog"
        aria-expanded={state.kind === "confirming"}
        className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {state.kind === "running" ? "Discarding…" : "Discard this setup and start over"}
      </button>

      {state.kind === "confirming" ? (
        // Anchored popover FLOATING above the trigger (absolute + bottom-full) so
        // it overlays page content instead of growing the sticky footer — the
        // layout shift Doug flagged (owner decision 2026-07-06). Left-aligned to
        // the trigger (this control sits on the footer's left/center).
        <div className="absolute bottom-full left-0 z-10 mb-3">
          <DiscardConfirmPopover
            onConfirm={confirmAndRun}
            onCancel={() => setState({ kind: "idle" })}
          />
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div
          role="alert"
          data-testid="cleanup-abandoned-finalize-error"
          className="flex flex-col gap-1 rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
        >
          <p>{state.copy}</p>
          <HelpAffordance code={state.code} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The destructive discard confirm, as a floating dialog: labelled heading,
 * autofocus onto the destructive primary, Escape-to-cancel, and a two-stop focus
 * trap (Discard ↔ Cancel) so the decision is keyboard-complete. Copy + testids
 * are unchanged from the prior inline confirm (pinned by
 * CleanupAbandonedFinalizeButton.test.tsx). A surface-raised card + `shadow-popover`
 * so it reads as detached; the destructive action keeps the warning tone.
 */
function DiscardConfirmPopover({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === "Tab") {
      const confirm = confirmRef.current;
      const cancel = cancelRef.current;
      if (!confirm || !cancel) return;
      const active = document.activeElement;
      if (event.shiftKey && active === confirm) {
        event.preventDefault();
        cancel.focus();
      } else if (!event.shiftKey && active === cancel) {
        event.preventDefault();
        confirm.focus();
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cleanup-abandoned-finalize-confirm-heading"
      data-testid="cleanup-abandoned-finalize-confirm"
      onKeyDown={onKeyDown}
      className="flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 rounded-lg border border-border-strong bg-surface-raised p-tile-pad text-text shadow-popover"
    >
      <p
        id="cleanup-abandoned-finalize-confirm-heading"
        className="text-base font-semibold text-text-strong"
      >
        Discard this setup?
      </p>
      <p className="text-sm text-text-subtle">
        This clears the unfinished part of this setup so you can start over. Shows you already
        published in this run stay live, and your other live shows are never touched.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          ref={confirmRef}
          type="button"
          data-testid="cleanup-abandoned-finalize-confirm-yes"
          onClick={onConfirm}
          className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-warning-text px-4 text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Yes, discard
        </button>
        <button
          ref={cancelRef}
          type="button"
          data-testid="cleanup-abandoned-finalize-confirm-cancel"
          onClick={onCancel}
          className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
