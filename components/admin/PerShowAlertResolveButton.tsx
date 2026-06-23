"use client";

/**
 * components/admin/PerShowAlertResolveButton.tsx
 * (M10 §B Task 10.7 / Phase 2)
 *
 * Resolves a per-show admin_alerts row. POSTs to the SHOW-SCOPED
 * resolve route /api/admin/show/[slug]/alerts/[id]/resolve per Pin-2
 * AdminAlertResolveResponse. Cross-show forgery hardening: this
 * component is ONLY mounted from <PerShowAlertSection /> which has the
 * slug + alert id from the same `shows` row + `admin_alerts.show_id`
 * server-side join, so the route's server-side show_id check is a
 * defensive backstop rather than the only guard. On success refreshes
 * the page so the alert disappears from the list.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { HelpAffordance } from "@/components/admin/HelpAffordance";

type Props = { alertId: string; slug: string };

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; copy: string; code: string | null };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when catalog lookup returns null; all real error copy routes through messageFor(code).dougFacing first.
const GENERIC_ERROR = "We could not mark this alert resolved. Refresh and try again.";

export function PerShowAlertResolveButton({ alertId, slug }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleClick() {
    if (state.kind === "running") return;
    setState({ kind: "running" });
    try {
      const response = await fetch(
        `/api/admin/show/${encodeURIComponent(slug)}/alerts/${encodeURIComponent(alertId)}/resolve`,
        { method: "POST" },
      );
      const body = (await response.json()) as
        | { status: "resolved"; id: string; resolved_at: string }
        | { ok: false; code: string };
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

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        data-testid={`per-show-alert-resolve-${alertId}`}
        onClick={handleClick}
        disabled={state.kind === "running"}
        className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {state.kind === "running" ? "Resolving…" : "Mark resolved"}
      </button>
      {state.kind === "error" ? (
        <div
          role="alert"
          data-testid={`per-show-alert-resolve-error-${alertId}`}
          className="flex flex-col gap-1 text-sm text-warning-text"
        >
          <p>{state.copy}</p>
          <HelpAffordance code={state.code} />
        </div>
      ) : null}
    </div>
  );
}
