"use client";
import { useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";
import { ReportButton } from "@/components/shared/ReportButton";
import { hasIgnorableSnippet } from "@/lib/dataQuality/ignorableSnippet";
import type { ParseWarning } from "@/lib/parser/types";

type Props = {
  slug: string;
  showId: string;
  warning: ParseWarning;
  driveFileId: string | null;
  mode: "active" | "ignored";
  reportSurfaceId: string;
};
type State = { kind: "idle" } | { kind: "running" } | { kind: "error"; copy: string };

const NEUTRAL_BTN =
  "inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
// Ring-offset color must match the CARD background the button sits on: warning-bg for
// active cards, surface-sunken for the muted Ignored (N) cards (impeccable audit P2).
const RING_OFFSET: Record<"active" | "ignored", string> = {
  active: "focus-visible:ring-offset-warning-bg",
  ignored: "focus-visible:ring-offset-surface-sunken",
};

export function DataQualityWarningControls({
  slug,
  showId,
  warning,
  mode,
  reportSurfaceId,
}: Props) {
  const router = useRouter();
  const { announce } = useContext(WarningAnnounceContext);
  const [state, setState] = useState<State>({ kind: "idle" });
  const ignorable = hasIgnorableSnippet(warning);
  const action = mode === "active" ? "ignore" : "unignore";
  const failCopy =
    action === "ignore"
      ? "Couldn't ignore that warning. Refresh and try again."
      : "Couldn't un-ignore that warning. Refresh and try again.";

  async function run() {
    setState({ kind: "running" });
    try {
      const res = await fetch(
        `/api/admin/show/${encodeURIComponent(slug)}/data-quality/${action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: warning.code, rawSnippet: warning.rawSnippet ?? "" }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { status?: string };
      if (res.ok && (json.status === "ignored" || json.status === "unignored")) {
        // Announcer spec 2026-07-22 §2.3: completion clause BEFORE the refresh
        // (ordering pinned by the producer tests); failures never announce.
        announce(json.status === "ignored" ? "Warning ignored." : "Warning restored.");
        router.refresh();
        return;
      }
      setState({ kind: "error", copy: failCopy });
    } catch {
      setState({ kind: "error", copy: failCopy });
    }
  }

  const showIgnoreBtn = (mode === "active" && ignorable) || mode === "ignored";
  return (
    <div className="mt-1 flex flex-col gap-1" data-testid="dq-controls">
      <div className="flex items-center gap-3">
        <ReportButton
          surface="admin"
          variant="text"
          label="Report"
          showId={showId}
          surfaceId={reportSurfaceId}
          ringOffset={mode === "active" ? "warning-bg" : "surface-sunken"}
          messageOptional
          autocapture={{
            parseWarnings: [warning],
            fieldRef: {
              surface: "data-quality",
              code: warning.code,
              sourceCell: warning.sourceCell ?? null,
              blockRef: warning.blockRef ?? null,
            },
            ...(warning.rawSnippet ? { rawSnippet: warning.rawSnippet } : {}),
            viewerVisibleSection: "data-quality",
          }}
        />
        {showIgnoreBtn ? (
          <button
            type="button"
            data-testid={`dq-${action}-${reportSurfaceId}`}
            onClick={run}
            disabled={state.kind === "running"}
            aria-busy={state.kind === "running"}
            className={`${NEUTRAL_BTN} ${RING_OFFSET[mode]}`}
          >
            {mode === "active"
              ? state.kind === "running"
                ? "Ignoring…"
                : "Ignore"
              : state.kind === "running"
                ? "Un-ignoring…"
                : "Un-ignore"}
          </button>
        ) : null}
      </div>
      {state.kind === "error" ? (
        <p
          role="alert"
          data-testid={`dq-error-${reportSurfaceId}`}
          className="rounded-sm border border-border-strong bg-warning-bg p-2 text-xs text-warning-text"
        >
          {state.copy}
        </p>
      ) : null}
    </div>
  );
}
