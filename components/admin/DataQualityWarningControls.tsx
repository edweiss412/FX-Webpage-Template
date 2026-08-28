"use client";
import { useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";
import { ReportButton } from "@/components/shared/ReportButton";
import { setStagedWarningIgnore } from "@/app/admin/onboarding/_actions/stagedWarningIgnore";
import { hasIgnorableSnippet } from "@/lib/dataQuality/ignorableSnippet";
import type { ParseWarning } from "@/lib/parser/types";
import { cn } from "@/lib/ui/cn";

/**
 * Which backend owns this warning's ignore state (spec §2.3 / §1.1.9).
 *
 * A published or LINKED row writes the durable show-keyed table through the existing
 * slug routes. A FIRST-SEEN wizard row has no `shows` record at all — finalize creates
 * it — so there is no slug to route to, and its decision goes to the staged column
 * through the §2.6 server action. One component, two backends, discriminated so neither
 * arm can be reached with the other's identity.
 */
export type WizardDqTarget =
  | { kind: "show"; slug: string; showId: string }
  | { kind: "staged"; wizardSessionId: string; driveFileId: string };

type Props = {
  target: WizardDqTarget;
  warning: ParseWarning;
  driveFileId: string | null;
  mode: "active" | "ignored";
  reportSurfaceId: string;
  /** The background this cluster is painted on, for the focus-ring offset and the
   *  outline token. Defaults to the PUBLISHED card grounds the two modes have always
   *  implied, so every existing mount renders byte-identically. */
  ground?: DqControlGround;
  /** Called on the success branch, after the announce and BEFORE `router.refresh()`.
   *
   *  A successful ignore MOVES this row to the other list, which unmounts this
   *  component — the button holding focus disappears and focus falls to `<body>`.
   *  On the published page that is merely rude. Inside the wizard's review modal it
   *  escapes the Tab trap: `useDialogFocus` binds its keydown handler to the panel
   *  container (`lib/a11y/dialogFocus.ts:137`), so an event fired on `<body>` never
   *  reaches it, and its recovery effect runs only on mount. Tab then walks the
   *  background behind the dialog (WCAG 2.4.3 / 2.1.2). The mount that can be
   *  unmounted by its own success is the one that has to hand focus somewhere first. */
  onBeforeRefresh?: () => void;
};
type State = { kind: "idle" } | { kind: "running" } | { kind: "error"; copy: string };

// No border COLOR here: it is per-plate, and lives in PLATE below beside the
// ring offset it has to agree with. `cn` deliberately does not merge Tailwind
// conflicts (lib/ui/cn.ts, ratified), so a second border-color appended at the
// call site would have no defined winner — the colour has to be absent here for
// the per-plate one to be the only one.
const NEUTRAL_BTN = cn(
  "inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
);
// Both halves of "what card is this button standing on", in one place because
// they answer the same question and drift apart when they do not.
//
// Ring-offset color must match the CARD background the button sits on: warning-bg for
// active cards, surface-sunken for the muted Ignored (N) cards (impeccable audit P2).
// The outline follows the same split: an active card is a TINTED plate, where
// --color-text-faint measures 3.04 light / 2.79 dark and misses the 3:1
// non-text floor in dark; the Ignored card is surface-sunken, a neutral ground
// where text-faint already clears (3.02 / 4.11). DESIGN §1.2a, design doc
// 2026-08-25-ui-polish-class-sweep-design.md D2.
//
// Impeccable critique P1 (2026-08-28): the two published grounds are NOT the only
// ones any more. The wizard panel mounts these controls directly on the section
// card, which is `bg-surface` — untinted, and neither `warning-bg` nor
// `surface-sunken`. Keying the plate on `mode` was a proxy for the ground that held
// only while every mount was a published card, so it now names the ground itself
// and the call site says which one it is. On an untinted ground the outline is the
// neutral `border-text-faint`, by the same contrast argument recorded above: the
// tinted token exists for tinted plates.
export type DqControlGround = "warning-bg" | "surface-sunken" | "surface";

const PLATE: Record<DqControlGround, string> = {
  "warning-bg": cn("focus-visible:ring-offset-warning-bg border-control-outline-tinted"),
  "surface-sunken": cn("focus-visible:ring-offset-surface-sunken border-text-faint"),
  surface: cn("focus-visible:ring-offset-surface border-text-faint"),
};

export function DataQualityWarningControls({
  target,
  warning,
  driveFileId,
  mode,
  reportSurfaceId,
  ground,
  onBeforeRefresh,
}: Props) {
  const plate: DqControlGround = ground ?? (mode === "active" ? "warning-bg" : "surface-sunken");
  const router = useRouter();
  const { announce } = useContext(WarningAnnounceContext);
  const [state, setState] = useState<State>({ kind: "idle" });
  const ignorable = hasIgnorableSnippet(warning);
  const action = mode === "active" ? "ignore" : "unignore";
  const failCopy =
    action === "ignore"
      ? "Couldn't ignore that warning. Refresh and try again."
      : "Couldn't un-ignore that warning. Refresh and try again.";

  /** The published route arm — byte-identical to what this component has always sent. */
  async function runShowArm(slug: string): Promise<"ignored" | "unignored" | null> {
    const res = await fetch(`/api/admin/show/${encodeURIComponent(slug)}/data-quality/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: warning.code, rawSnippet: warning.rawSnippet ?? "" }),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: string };
    if (res.ok && (json.status === "ignored" || json.status === "unignored")) return json.status;
    return null;
  }

  /** The staged arm — the §2.6 server action. Every `ok:false` code maps to the SAME
   *  operator copy as a failed fetch: the codes are internal (invariant 5). */
  async function runStagedArm(
    t: Extract<WizardDqTarget, { kind: "staged" }>,
  ): Promise<"ignored" | "unignored" | null> {
    const result = await setStagedWarningIgnore({
      wizardSessionId: t.wizardSessionId,
      driveFileId: t.driveFileId,
      action,
      code: warning.code,
      rawSnippet: warning.rawSnippet ?? "",
    });
    return result.ok ? result.state : null;
  }

  async function run() {
    setState({ kind: "running" });
    try {
      const status =
        target.kind === "show" ? await runShowArm(target.slug) : await runStagedArm(target);
      if (status !== null) {
        // Announcer spec 2026-07-22 §2.3: completion clause BEFORE the refresh
        // (ordering pinned by the producer tests); failures never announce.
        announce(status === "ignored" ? "Warning ignored." : "Warning restored.");
        // Hand focus somewhere that survives this refresh, BEFORE the refresh: this
        // component is about to be unmounted by its own success.
        onBeforeRefresh?.();
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
          showId={target.kind === "show" ? target.showId : null}
          surfaceId={reportSurfaceId}
          ringOffset={plate}
          messageOptional
          autocapture={{
            parseWarnings: [warning],
            fieldRef: {
              surface: "data-quality",
              code: warning.code,
              sourceCell: warning.sourceCell ?? null,
              blockRef: warning.blockRef ?? null,
              // §2.3: the submit path resolves a show-less report's sheet identity from
              // exactly this field (`driveFileIdFromFieldRef`, lib/reports/submit.ts:299).
              // Without it a FIRST-SEEN report reads only "staged wizard sheet (no show
              // record)". Additive on the published arm, which simply carries one more
              // identity field.
              driveFileId,
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
            className={`${NEUTRAL_BTN} ${PLATE[plate]}`}
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
