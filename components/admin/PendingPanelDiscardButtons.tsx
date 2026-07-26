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
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { ARM_REVERT_MS } from "@/lib/admin/destructiveConfirm";

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

// Armed-state auto-revert window (spec §4: 4s) — harmonized naming across every
// destructive surface (DESTRUCT-2): ARM_REVERT_MS.

/* The two Ignore skins and their labels, exported so tests/e2e/_pendingDiscardHarness.tsx
 * can render an ARMED panel from the component's own strings rather than transcribing
 * them. `renderToStaticMarkup` cannot click, so the harness substitutes these into the
 * Ignore button. NOTE the armed state is NOT only this class + label: it also fills the
 * live region and mounts the consequence paragraph below the row. The harness therefore
 * proves the armed ROW's geometry, which those two cannot affect — not the whole tree. */
export const IGNORE_IDLE_CLASS =
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
export const IGNORE_ARMED_CLASS =
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-transparent bg-warning-text px-3 text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
export const IGNORE_IDLE_LABEL = "Permanently ignore";
/* Shortened from "Confirm stop tracking this sheet permanently" (328.51px), which is
 * what let the armed row stop wrapping at the 348px Needs-attention page.
 *
 * "Confirm ignore" (125.64px) not "Tap again to confirm": impeccable critique P1 found
 * the latter was VERBATIM the live region's text, so the pair conveyed strictly less
 * than before and the consequence was stated nowhere. This matches the family idiom
 * (ArchiveShowButton "Confirm archive", ResolveAlertButton "Confirm dismiss") and the
 * consequence moves into the live region below, which is where a screen-reader user
 * gets it. "Confirm ignore forever" was measured too (176.8px) and rejected: its armed
 * row clears the 348px page by 8.46px, the same thin cross-platform margin rejected
 * elsewhere in this spec. */
export const IGNORE_ARMED_LABEL = "Confirm ignore";

export function PendingPanelDiscardButtons({ pendingIngestionId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  // G1 two-tap guard (spec 2026-07-16-destructive-confirm-pass §4): the
  // "Permanently ignore" button arms on first tap (recipe fill + confirm label,
  // 4s auto-revert) and fires the EXISTING handleClick("permanent_ignore") on
  // the second. The sibling "Defer until modified" stays one-tap (§7).
  const [armed, setArmed] = useState(false);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Chrome activates a <button> on Enter KEYDOWN, which auto-repeats, so holding
   * Enter fires arm then confirm and the two-tap guard buys nothing. Space is
   * immune (it fires on keyup), so the guard otherwise protects one activation
   * key and not the other.
   *
   * A time threshold does NOT fix this — whole-diff review R1 F3: auto-repeat
   * keeps firing past any dwell, and the first repeat after the window is
   * indistinguishable from a deliberate second press. The browser already tells
   * us: a held key sets `event.repeat`. Reject those and require a real
   * release-and-repress, which is the actual contract we want. */
  const repeatKeyRef = useRef(false);
  function clearArmTimer() {
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }
  useEffect(() => clearArmTimer, []);
  function onGuardedIgnoreClick() {
    if (!armed) {
      setArmed(true);
      clearArmTimer();
      armTimerRef.current = setTimeout(() => {
        armTimerRef.current = null; // callback clears its own ref — no stale identity survives
        setArmed(false);
      }, ARM_REVERT_MS);
      return;
    }
    // A synthetic activation from a HELD key is not a decision. `onKeyDown` below
    // sets this for `event.repeat`; it clears on keyup, so the next press counts.
    if (repeatKeyRef.current) return;
    clearArmTimer();
    setArmed(false);
    void handleClick("permanent_ignore");
  }

  async function handleClick(kind: DiscardKind) {
    if (state.kind === "running") return;
    // Any discard starting (including the one-tap "Defer until modified" sibling)
    // disarms a pending permanent-ignore confirm — an armed state must never
    // survive into or past another mutation (whole-diff review R2).
    clearArmTimer();
    setArmed(false);
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
        {/* Ignore is FIRST so a wrap puts the irreversible action on the upper line
            and the safe one below it, nearest the thumb. Being the first flex item
            also means arming extends rightward and pushes Defer, never moving
            Ignore's own box — the DESTRUCT-1 guarantee, now structural rather than
            bought with `basis-full`. */}
        <button
          type="button"
          data-testid={`admin-pending-ignore-${pendingIngestionId}`}
          onClick={onGuardedIgnoreClick}
          onKeyDown={(e) => {
            // A fresh press ALWAYS clears; only a held key sets. Setting on repeat
            // without clearing on a fresh press can strand the flag true — hold
            // Enter, then alt-tab away while holding, and the keyup lands in another
            // window, leaving this button unable to confirm ever again. Keying both
            // edges off `e.repeat` makes the stuck state unreachable.
            repeatKeyRef.current = e.repeat;
          }}
          onKeyUp={() => {
            repeatKeyRef.current = false;
          }}
          onBlur={() => {
            // Belt and braces for the same class: focus can leave mid-hold.
            repeatKeyRef.current = false;
          }}
          disabled={isRunning}
          aria-busy={isRunning || undefined}
          className={armed ? IGNORE_ARMED_CLASS : IGNORE_IDLE_CLASS}
        >
          {armed
            ? IGNORE_ARMED_LABEL
            : state.kind === "running" && state.pendingKind === "permanent_ignore"
              ? "Ignoring…"
              : IGNORE_IDLE_LABEL}
        </button>
        <button
          type="button"
          data-testid={`admin-pending-defer-${pendingIngestionId}`}
          onClick={() => handleClick("defer_until_modified")}
          disabled={isRunning}
          aria-busy={isRunning || undefined}
          className={IGNORE_IDLE_CLASS}
        >
          {state.kind === "running" && state.pendingKind === "defer_until_modified"
            ? "Deferring…"
            : "Defer until modified"}
        </button>
        {/* Persistent sr-only live region: announces the silent label morph to
            screen readers (impeccable P2). Always mounted — conditional
            mounting drops the announcement (project a11y rule). */}
        <span role="status" className="sr-only">
          {armed
            ? "Tap again to stop tracking this sheet permanently."
            : state.kind === "running"
              ? "Working…"
              : ""}
        </span>
      </div>
      {armed ? (
        <p
          data-testid={`admin-pending-ignore-consequence-${pendingIngestionId}`}
          className="text-xs/relaxed text-subtle"
        >
          This stops tracking the sheet permanently.
        </p>
      ) : null}
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
