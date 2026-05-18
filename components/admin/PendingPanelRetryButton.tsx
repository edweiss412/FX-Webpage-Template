"use client";

/**
 * components/admin/PendingPanelRetryButton.tsx (M10 §B Task 10.6 / Phase 2)
 *
 * Live pending-ingestion retry. POSTs to /api/admin/pending-ingestions/[id]/retry
 * (Pin-2 LivePendingIngestionRetryResponse). On success refreshes the page;
 * on 409 errors renders Doug-facing copy via messageFor.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";

type Props = { pendingIngestionId: string };

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; copy: string };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

const GENERIC_ERROR =
  "We could not retry that sheet just now. Refresh and try again.";

export function PendingPanelRetryButton({ pendingIngestionId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleClick() {
    if (state.kind === "running") return;
    setState({ kind: "running" });
    try {
      const response = await fetch(
        `/api/admin/pending-ingestions/${encodeURIComponent(pendingIngestionId)}/retry`,
        { method: "POST" },
      );
      const body = (await response.json()) as
        | { status: string }
        | { ok: false; code: string };
      if ("ok" in body && body.ok === false) {
        setState({
          kind: "error",
          copy: lookupDougFacing(body.code) ?? GENERIC_ERROR,
        });
        return;
      }
      setState({ kind: "idle" });
      router.refresh();
    } catch {
      setState({ kind: "error", copy: GENERIC_ERROR });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid={`admin-pending-retry-${pendingIngestionId}`}
        onClick={handleClick}
        disabled={state.kind === "running"}
        className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-accent px-4 text-sm font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {state.kind === "running" ? "Retrying…" : "Retry now"}
      </button>
      {state.kind === "error" ? (
        <p
          role="alert"
          data-testid={`admin-pending-retry-error-${pendingIngestionId}`}
          className="text-sm text-warning-text"
        >
          {state.copy}
        </p>
      ) : null}
    </div>
  );
}
