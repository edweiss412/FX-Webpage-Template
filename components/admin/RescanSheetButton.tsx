"use client";

/**
 * components/admin/RescanSheetButton.tsx (per-sheet Re-scan — spec §9)
 *
 * A quiet secondary CTA mounted on the wizard Step-3 review card (both render
 * paths) and inside the final-publish blocker lists (only for the
 * STAGED_PARSE_OUTDATED_AT_PHASE_D rows that a re-scan can heal). It re-fetches
 * ONE Drive file, re-parses, and re-stages it:
 *
 *   POST /api/admin/onboarding/rescan-sheet  { driveFileId, wizardSessionId }
 *
 * The route always returns HTTP 200 with a typed RescanResult-shaped JSON body
 * (the button reads `{ ok }` + the inline copy). On a successful mutation
 * (`ok === true`) it router.refresh()es so the Step-3 cards / blocker lists
 * re-read the freshly-staged rows on the next server render.
 *
 * No raw §12.4 code is rendered (invariant 5): the `needs_attention` / `busy`
 * branches resolve their cataloged dougFacing via messageFor + render a
 * <HelpAffordance> (mirroring ReSyncButton's error block); every other branch is
 * a short plain-English line. Copy carries NO em dashes (DESIGN.md UI-copy rule).
 *
 * Double-click is guarded by the loading state (disabled while in flight) — NOT a
 * self-disabling form action (see feedback_react_form_action_synchronous_disable).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { HelpAffordance } from "@/components/admin/HelpAffordance";

export type RescanSheetButtonProps = {
  driveFileId: string;
  wizardSessionId: string;
};

// The route's RescanResult → JSON mapping (app/api/admin/onboarding/rescan-sheet/route.ts).
type RescanResponse =
  | { ok: true; status: "updated"; needsReview: boolean; changed: boolean }
  | { ok: false; status: "needs_attention" | "busy"; code: string }
  | { ok: false; status: "superseded" | "no_active_session" | "not_found" | "not_a_sheet" };

// The rendered result line: `info` (a clean / informational outcome) or `coded` (a
// cataloged code that adds dougFacing + a HelpAffordance disclosure).
type ResultState = { kind: "info"; copy: string } | { kind: "coded"; copy: string; code: string };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when the catalog lookup returns null; every
// real coded branch routes through messageFor(code).dougFacing first.
const CODED_FALLBACK =
  "This sheet could not be re-scanned right now. Refresh and try again, or contact the developer if this keeps happening.";

// Short plain-English lines for the typed, code-less guard outcomes (no em dashes).
const PLAIN_COPY: Record<"superseded" | "no_active_session" | "not_found" | "not_a_sheet", string> =
  {
    superseded: "This setup was replaced by a newer run. Refresh and try again.",
    no_active_session: "Setup isn't running right now. Refresh the page and try again.",
    not_found: "This sheet is no longer part of this setup.",
    not_a_sheet: "This file isn't a Google Sheet, so there's nothing to re-scan.",
  };

function resultFor(body: RescanResponse): ResultState {
  if (body.ok) {
    if (body.needsReview) {
      return {
        kind: "info",
        copy: "Updated. This sheet changed and needs your review before publishing.",
      };
    }
    return {
      kind: "info",
      copy: body.changed ? "Updated. Still ready to publish." : "No changes found.",
    };
  }
  if (body.status === "needs_attention" || body.status === "busy") {
    return { kind: "coded", copy: lookupDougFacing(body.code) ?? CODED_FALLBACK, code: body.code };
  }
  return { kind: "info", copy: PLAIN_COPY[body.status] };
}

export function RescanSheetButton({ driveFileId, wizardSessionId }: RescanSheetButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);

  async function handleClick() {
    if (pending) return;
    setResult(null);
    setPending(true);
    try {
      const response = await fetch("/api/admin/onboarding/rescan-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId, wizardSessionId }),
      });
      const body = (await response.json()) as RescanResponse;
      setResult(resultFor(body));
      if (body.ok) router.refresh();
    } catch {
      setResult({
        kind: "info",
        copy: "Something went wrong starting the re-scan. Refresh and try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid={`rescan-sheet-button-${driveFileId}`}
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        {pending ? "Re-scanning…" : "Re-scan this sheet"}
      </button>

      {result ? (
        <div
          role="status"
          aria-live="polite"
          data-testid={`rescan-sheet-result-${driveFileId}`}
          className={
            result.kind === "coded"
              ? "flex flex-col gap-1 rounded-sm border border-border-strong bg-warning-bg p-3 text-sm text-warning-text"
              : "rounded-sm border border-border bg-info-bg px-3 py-2 text-sm text-text-strong"
          }
        >
          <p>{result.copy}</p>
          {result.kind === "coded" ? <HelpAffordance code={result.code} /> : null}
        </div>
      ) : null}
    </div>
  );
}
