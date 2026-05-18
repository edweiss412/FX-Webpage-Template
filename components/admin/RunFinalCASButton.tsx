"use client";

/**
 * components/admin/RunFinalCASButton.tsx (M10 §B Task 10.1 §B / Phase 2)
 *
 * Phase D "Publish all" trigger. POSTs to
 * /api/admin/onboarding/finalize-cas (no body). On
 * status='finalize_complete' calls router.refresh; the next page-load
 * sees pending_wizard_session_id IS NULL AND watched_folder_id IS NOT
 * NULL and falls through to the Dashboard. On 409 errors renders
 * Doug-facing copy via messageFor.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";

type FinalizeCasResponse =
  | {
      status: "finalize_complete";
      wizard_session_id: string;
      watched_folder_id: string;
    }
  | { ok: false; code: string };

type Props = { sessionId: string };

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; copy: string }
  | { kind: "complete" };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

const GENERIC_ERROR =
  "We could not publish your shows. Refresh and try again, or contact the developer if this keeps happening.";

export function RunFinalCASButton({ sessionId: _sessionId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleClick() {
    if (state.kind === "running") return;
    setState({ kind: "running" });
    try {
      const response = await fetch("/api/admin/onboarding/finalize-cas", {
        method: "POST",
      });
      const body = (await response.json()) as FinalizeCasResponse;
      if ("ok" in body && body.ok === false) {
        setState({
          kind: "error",
          copy: lookupDougFacing(body.code) ?? GENERIC_ERROR,
        });
        return;
      }
      setState({ kind: "complete" });
      router.refresh();
    } catch {
      setState({ kind: "error", copy: GENERIC_ERROR });
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="run-final-cas">
      <button
        type="button"
        data-testid="run-final-cas-button"
        onClick={handleClick}
        disabled={state.kind === "running"}
        className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {state.kind === "running" ? "Publishing…" : "Publish all"}
      </button>

      {state.kind === "error" ? (
        <p
          role="alert"
          data-testid="run-final-cas-error"
          className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
        >
          {state.copy}
        </p>
      ) : null}
    </div>
  );
}
