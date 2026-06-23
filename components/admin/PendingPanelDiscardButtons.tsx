"use client";

/**
 * components/admin/PendingPanelDiscardButtons.tsx
 * (M10 §B Task 10.6 / Phase 2)
 *
 * Live pending-ingestion discard actions per spec §9.1 panel 2. POSTs
 * to /api/admin/pending-ingestions/[id]/discard with kind set to
 * 'defer_until_modified' or 'permanent_ignore' (Pin-2
 * LivePendingIngestionDiscardResponse). On success refreshes; on 409
 * errors renders Doug-facing copy via messageFor.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { HelpAffordance } from "@/components/admin/HelpAffordance";

type DiscardKind = "defer_until_modified" | "permanent_ignore";
type Props = { pendingIngestionId: string };

type State =
  | { kind: "idle" }
  | { kind: "running"; pendingKind: DiscardKind }
  | { kind: "error"; copy: string; code: string | null };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when catalog lookup returns null; all real error copy routes through messageFor(code).dougFacing first.
const GENERIC_ERROR = "We could not discard that sheet just now. Refresh and try again.";

export function PendingPanelDiscardButtons({ pendingIngestionId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleClick(kind: DiscardKind) {
    if (state.kind === "running") return;
    setState({ kind: "running", pendingKind: kind });
    try {
      const response = await fetch(
        `/api/admin/pending-ingestions/${encodeURIComponent(pendingIngestionId)}/discard`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        },
      );
      const body = (await response.json()) as { status: string } | { ok: false; code: string };
      if ("ok" in body && body.ok === false) {
        setState({
          kind: "error",
          copy: lookupDougFacing(body.code) ?? GENERIC_ERROR,
          code: body.code,
        });
        return;
      }
      setState({ kind: "idle" });
      router.refresh();
    } catch {
      setState({ kind: "error", copy: GENERIC_ERROR, code: null });
    }
  }

  const isRunning = state.kind === "running";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid={`admin-pending-defer-${pendingIngestionId}`}
          onClick={() => handleClick("defer_until_modified")}
          disabled={isRunning}
          className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {state.kind === "running" && state.pendingKind === "defer_until_modified"
            ? "Deferring…"
            : "Defer until modified"}
        </button>
        <button
          type="button"
          data-testid={`admin-pending-ignore-${pendingIngestionId}`}
          onClick={() => handleClick("permanent_ignore")}
          disabled={isRunning}
          className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {state.kind === "running" && state.pendingKind === "permanent_ignore"
            ? "Ignoring…"
            : "Permanently ignore"}
        </button>
      </div>
      {state.kind === "error" ? (
        <div
          role="alert"
          data-testid={`admin-pending-discard-error-${pendingIngestionId}`}
          className="flex flex-col gap-1 text-sm text-warning-text"
        >
          <p>{state.copy}</p>
          <HelpAffordance code={state.code} />
        </div>
      ) : null}
    </div>
  );
}
