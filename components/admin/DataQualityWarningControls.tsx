"use client";
import { useContext, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";
import { ReportButton } from "@/components/shared/ReportButton";
import { setStagedWarningIgnore } from "@/app/admin/onboarding/_actions/stagedWarningIgnore";
import { hasIgnorableSnippet } from "@/lib/dataQuality/ignorableSnippet";
import { isJudgmentCall } from "@/lib/admin/warningReadingDisplay";
import { useUseRawDraft } from "@/components/admin/useRawDraft";
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
  /** A SECOND store holding the same dismissal, cleared in the same interaction.
   *  Set only when the model reports `ignoreOrigin: "both"`; clearing one store while
   *  the other still hides the row is the false success this exists to prevent. */
  alsoClear?: WizardDqTarget;
  /**
   * The show this warning belongs to, for the REPORT — independent of `target`.
   *
   * Whole-diff R2 P1. `target` answers "which store does an Ignore write to", and the
   * Ignored disclosure legitimately reroutes it to the staged backend when that is
   * where the dismissal lives. Report was deriving its `showId` from that same value,
   * so rerouting the ignore silently detached the report: a LINKED row filed with
   * `show_id: null`, labeled a staged sheet with no show record, and nothing said.
   *
   * Two decisions, two inputs. Omitted falls back to the target-derived value, which
   * is correct wherever the two genuinely coincide (every published mount, and a
   * first-seen wizard row that really has no show).
   */
  reportShowId?: string | null;
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
} & DqLockProps;
/** The archived-tab row lock (warning-card-fixes §7.3, §14.1). Both optional: absent,
 *  every existing mount is unchanged. `blocked` disables the main button only (Report is
 *  exempt: it writes nothing the lock protects); `onRunningChange` reports this control's
 *  own request, `true` at its start and `false` at its end, success or failure. */
export type DqLockProps = { blocked?: boolean; onRunningChange?: (running: boolean) => void };
/** `saving` marks a running sequence started from Save (warning-card-fixes §6.3), whose
 *  label is `Saving…`; a sequence started from the clean button keeps its own word. */
type State =
  | { kind: "idle" }
  | { kind: "running"; saving: boolean }
  | { kind: "error"; copy: string };

/** warning-card-fixes §6.3 / §11: the deferred reading choice's action-bar copy. */
const SAVE_WORDS = {
  idle: "Save",
  running: "Saving…",
  cancel: "Cancel",
  hint: "Not saved yet",
  savedAndAccepted: "Reading saved. Judgment call accepted.",
  saved: "Reading saved.",
  partial:
    "Your reading is saved, but we couldn't accept the judgment call. Refresh and try again.",
} as const;

/** Every string this control says, by row kind and action (warning-card-fixes §6.2). */
const WORDS = {
  needsLook: {
    ignore: {
      idle: "Ignore",
      running: "Ignoring…",
      done: "Warning ignored.",
      fail: "Couldn't ignore that warning. Refresh and try again.",
    },
    unignore: {
      idle: "Un-ignore",
      running: "Un-ignoring…",
      done: "Warning restored.",
      fail: "Couldn't un-ignore that warning. Refresh and try again.",
    },
  },
  judgment: {
    ignore: {
      idle: "Accept",
      running: "Accepting…",
      done: "Judgment call accepted.",
      fail: "Couldn't accept that judgment call. Refresh and try again.",
    },
    unignore: {
      idle: "Undo accept",
      running: "Undoing…",
      done: "Judgment call restored.",
      fail: "Couldn't undo that. Refresh and try again.",
    },
  },
} as const;

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

// warning-card-fixes §6.3: the deferred reading choice's Cancel, a ghost button (the
// archived-tab ghost idiom on this component's `px-3`). Its ring offset follows the same
// ground as PLATE; it has no outline to colour.
const CANCEL_BTN = cn(
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-transparent px-3 text-sm font-medium text-text transition-colors duration-fast hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
);
const CANCEL_RING_OFFSET: Record<DqControlGround, string> = {
  "warning-bg": "focus-visible:ring-offset-warning-bg",
  "surface-sunken": "focus-visible:ring-offset-surface-sunken",
  surface: "focus-visible:ring-offset-surface",
};

export function DataQualityWarningControls({
  target,
  alsoClear,
  reportShowId,
  warning,
  driveFileId,
  mode,
  reportSurfaceId,
  ground,
  onBeforeRefresh,
  blocked,
  onRunningChange,
}: Props) {
  const plate: DqControlGround = ground ?? (mode === "active" ? "warning-bg" : "surface-sunken");
  const router = useRouter();
  const { announce } = useContext(WarningAnnounceContext);
  const [state, setState] = useState<State>({ kind: "idle" });
  // warning-card-fixes §6.3: inside a UseRawDraftProvider this bar also saves the row's
  // reading. Null everywhere else, where it renders exactly as before.
  const draft = useUseRawDraft();
  const hintId = useId();
  const mainRef = useRef<HTMLButtonElement | null>(null);
  const ignorable = hasIgnorableSnippet(warning);
  const action = mode === "active" ? "ignore" : "unignore";
  // warning-card-fixes §6.2: a judgment call is ACCEPTED, not ignored. Same mechanism,
  // endpoints and testids; only the words change.
  const wordsKind = isJudgmentCall(warning) ? "judgment" : "needsLook";
  const words = WORDS[wordsKind][action];
  const failCopy = words.fail;

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

  /** The running signal, to the row lock (Task 13) and to the reading draft's busy. */
  function reportRunning(running: boolean) {
    onRunningChange?.(running);
    draft?.setBusy(running);
  }

  /** Inside a provider the provider holds the error, so it survives the label morph
   *  and clears on the next select, Save, Accept or Cancel (spec §6.3). */
  function fail(copy: string) {
    if (draft) {
      draft.setError(copy);
      setState({ kind: "idle" });
    } else {
      setState({ kind: "error", copy });
    }
  }

  async function run() {
    if (blocked === true) return;
    draft?.setError(null);
    setState({ kind: "running", saving: false });
    reportRunning(true);
    try {
      const status =
        target.kind === "show" ? await runShowArm(target.slug) : await runStagedArm(target);
      // Whole-diff R1 P0: a dismissal held in BOTH stores needs BOTH cleared.
      //
      // Clearing one and announcing success is a lie the next read exposes: the
      // enrichment unions the untouched store straight back in and the warning is still
      // hidden. So the second arm runs before anything is announced, and its failure is
      // the whole call's failure — a half-cleared dismissal reports an error, never
      // "Warning restored". The reverse order would be no better; what matters is that
      // no success is claimed until both stores have answered.
      //
      // Only ever set for `mode="ignored"`: there is no "ignore into both stores" —
      // an Ignore writes exactly one, whichever surface the operator is on.
      if (status !== null && alsoClear !== undefined) {
        const second =
          alsoClear.kind === "show"
            ? await runShowArm(alsoClear.slug)
            : await runStagedArm(alsoClear);
        if (second === null) {
          fail(failCopy);
          return;
        }
      }
      if (status !== null) {
        // Announcer spec 2026-07-22 §2.3: completion clause BEFORE the refresh
        // (ordering pinned by the producer tests); failures never announce.
        announce(
          status === "ignored" ? WORDS[wordsKind].ignore.done : WORDS[wordsKind].unignore.done,
        );
        // Hand focus somewhere that survives this refresh, BEFORE the refresh: this
        // component is about to be unmounted by its own success.
        onBeforeRefresh?.();
        router.refresh();
        // Impeccable audit P1 (2026-08-28): do NOT rely on being unmounted to clear
        // this. A LINKED row whose loader read faults resolves fail-OPEN to an empty
        // ignore set (`lib/admin/enrichStep3WarningModels.ts`), so the row comes back
        // ACTIVE, React keeps this instance alive on its content-derived key, and the
        // button would sit disabled at "Ignoring…" forever — after a SUCCESS, with no
        // error and no way to retry.
        setState({ kind: "idle" });
        return;
      }
      fail(failCopy);
    } catch {
      fail(failCopy);
    } finally {
      reportRunning(false);
    }
  }

  /** spec §6.3 rules 2-4: send the draft; on success accept an active ignorable row, else
   *  announce the saved reading. Either way the persisted reading must re-read. */
  async function saveReading() {
    if (!draft || blocked === true) return;
    setState({ kind: "running", saving: true });
    reportRunning(true);
    try {
      if ((await draft.save()) === "failed") return; // rule 3: the provider shows its copy
      if (mode === "active" && ignorable) {
        let status: "ignored" | "unignored" | null = null;
        try {
          status =
            target.kind === "show" ? await runShowArm(target.slug) : await runStagedArm(target);
        } catch {
          status = null;
        }
        if (status !== null) {
          announce(SAVE_WORDS.savedAndAccepted);
          onBeforeRefresh?.();
          router.refresh();
          return;
        }
        // The reading is saved, the card is not accepted: re-read the reading and say so.
        // The main button then reads Accept, which retries the accept only.
        router.refresh();
        draft.setError(SAVE_WORDS.partial);
        return;
      }
      announce(SAVE_WORDS.saved);
      router.refresh();
    } finally {
      setState({ kind: "idle" });
      reportRunning(false);
    }
  }

  const showIgnoreBtn = (mode === "active" && ignorable) || mode === "ignored";
  const running = state.kind === "running";
  const saving = state.kind === "running" && state.saving;
  const dirty = draft?.dirty === true;
  // spec §6.3 action bar: one main button whose label morphs (focus survives every
  // change). Save renders for a dirty draft even on a row with no accept.
  const showMain = showIgnoreBtn || dirty || saving;
  const showCancel = draft !== null && (dirty || saving);
  const showHint = dirty && !running;
  const errorCopy = draft ? draft.error : state.kind === "error" ? state.copy : null;
  return (
    <div className="mt-1 flex flex-col gap-1" data-testid="dq-controls">
      <div className={draft ? "flex flex-wrap items-center gap-3" : "flex items-center gap-3"}>
        <ReportButton
          surface="admin"
          variant="text"
          label="Report"
          /* R2 P1: the ROW's show, never the ignore backend's. `target` can be
             rerouted to staging for a linked row, and deriving report identity from
             it filed the report against nothing. */
          showId={
            reportShowId !== undefined
              ? reportShowId
              : target.kind === "show"
                ? target.showId
                : null
          }
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
        {showMain ? (
          <button
            ref={mainRef}
            type="button"
            data-testid={`dq-${action}-${reportSurfaceId}`}
            onClick={dirty ? saveReading : run}
            disabled={running || blocked === true}
            aria-busy={running}
            aria-describedby={showHint ? hintId : undefined}
            className={`${NEUTRAL_BTN} ${PLATE[plate]}`}
          >
            {saving
              ? SAVE_WORDS.running
              : running
                ? words.running
                : dirty
                  ? SAVE_WORDS.idle
                  : words.idle}
          </button>
        ) : null}
        {showCancel ? (
          <button
            type="button"
            data-testid={`dq-cancel-${reportSurfaceId}`}
            onClick={() => {
              draft?.cancel();
              // Cancel unmounts with the draft; the main button stays (rule 6).
              mainRef.current?.focus();
            }}
            disabled={running}
            className={cn(CANCEL_BTN, CANCEL_RING_OFFSET[plate])}
          >
            {SAVE_WORDS.cancel}
          </button>
        ) : null}
        {showHint ? (
          <span id={hintId} className="text-xs text-text-subtle">
            {SAVE_WORDS.hint}
          </span>
        ) : null}
      </div>
      {errorCopy !== null ? (
        <p
          role="alert"
          data-testid={`dq-error-${reportSurfaceId}`}
          className="rounded-sm border border-border-strong bg-warning-bg p-2 text-xs text-warning-text"
        >
          {errorCopy}
        </p>
      ) : null}
    </div>
  );
}
