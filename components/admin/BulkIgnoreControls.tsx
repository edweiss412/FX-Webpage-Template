"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BulkIgnoreGroup } from "@/lib/dataQuality/bulkIgnoreGroups";

export type BulkIgnoreGroupWithLabel = BulkIgnoreGroup & {
  /** Plain-language type label (catalog title / data-gap label), or null. Never the raw code. */
  label: string | null;
};

type Props = { slug: string; groups: BulkIgnoreGroupWithLabel[] };
type State = { kind: "idle" } | { kind: "running"; code: string } | { kind: "error"; copy: string };

// Same neutral button skin as the per-warning Ignore control. Unlike that control
// (which sits INSIDE an amber warning-bg card), this bulk bar renders directly in the
// panel section on the page `bg`, so the focus ring-offset is `bg` — matching the
// surface behind it (impeccable critique P2: the 2px offset gap must be the real bg).
// max-w-full + whitespace-normal + text-left let a long "· <type label>" wrap instead of
// forcing horizontal overflow on a ~390px phone (impeccable audit P3).
const BTN =
  "inline-flex min-h-tap-min max-w-full items-center justify-start self-start whitespace-normal rounded-sm border border-border-strong bg-bg px-3 py-1 text-left text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

// G4 armed branch (spec 2026-07-16-destructive-confirm-pass §4): the destructive
// recipe fill (C1), same shape/wrap behavior as the idle skin.
const ARMED_BTN =
  "inline-flex min-h-tap-min max-w-full items-center justify-start self-start whitespace-normal rounded-sm bg-warning-text px-3 py-1 text-left text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

/**
 * DQIGNORE-2 — a per-code "Ignore all N" affordance shown ABOVE the active
 * data-quality card list when a code has >=2 distinct-content ignorable warnings.
 * Each click fans out ONE `/data-quality/ignore` POST per distinct item (precise
 * per-fingerprint inserts, reusing the idempotent single-ignore route), then
 * refreshes so the ignored warnings drop into the "Ignored (N)" subsection.
 * Renders nothing when there are no bulk-eligible groups.
 */
export function BulkIgnoreControls({ slug, groups }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  // G4 two-tap armed-state guard (spec 2026-07-16-destructive-confirm-pass §4):
  // SEPARATE from the state machine above. Exactly one group armed at a time
  // (single shared timer); first tap arms, tapping a different group re-arms it,
  // second tap on the armed group runs the EXISTING ignoreGroup(group) unchanged.
  const [armedCode, setArmedCode] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearArmTimer() {
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }
  useEffect(() => clearArmTimer, []);
  function onGuardedClick(group: BulkIgnoreGroupWithLabel) {
    if (armedCode !== group.code) {
      // Arm (or re-arm from another group): timer restarted either way.
      setArmedCode(group.code);
      clearArmTimer();
      armTimerRef.current = setTimeout(() => {
        armTimerRef.current = null; // callback clears its own ref — no stale identity survives
        setArmedCode(null);
      }, 4_000);
      return;
    }
    clearArmTimer();
    setArmedCode(null);
    void ignoreGroup(group);
  }
  if (groups.length === 0) return null;

  async function ignoreGroup(group: BulkIgnoreGroupWithLabel) {
    // Entering `running` clears the armed state + timer (spec §4 G4 state model).
    clearArmTimer();
    setArmedCode(null);
    setState({ kind: "running", code: group.code });
    const failCopy = "Couldn't ignore those warnings. Refresh and try again.";
    try {
      const results = await Promise.all(
        group.items.map((it) =>
          fetch(`/api/admin/show/${encodeURIComponent(slug)}/data-quality/ignore`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code: it.code, rawSnippet: it.rawSnippet }),
          })
            .then((r) => r.ok)
            .catch(() => false),
        ),
      );
      const ok = results.filter(Boolean).length;
      if (ok === results.length) {
        // Reset to idle BEFORE refreshing: router.refresh() is a SOFT refresh that preserves
        // this component's client state, and the component stays mounted whenever another code
        // still has a bulk group. Leaving state "running" would wedge every sibling
        // "Ignore all N" button permanently disabled until a full page reload (impeccable audit
        // P1). Idle re-enables them; the ignored group drops out of the refreshed server props.
        setState({ kind: "idle" });
        router.refresh();
        return;
      }
      // Partial success: the succeeded ignores ARE committed (idempotent inserts), so
      // report honestly rather than implying none landed. We do NOT auto-refresh — that
      // would drop this notice; the operator refreshes to see the ones that moved and can
      // retry the rest per-card.
      setArmedCode(null); // entering `error` clears armed (spec §4 G4 state model)
      setState({
        kind: "error",
        copy: ok > 0 ? `Ignored ${ok} of ${results.length}. Refresh to see the rest.` : failCopy,
      });
    } catch {
      setArmedCode(null); // entering `error` clears armed (spec §4 G4 state model)
      setState({ kind: "error", copy: failCopy });
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="dq-bulk-ignore">
      {groups.map((group) => {
        const running = state.kind === "running" && state.code === group.code;
        const armed = armedCode === group.code;
        return (
          <button
            key={group.code}
            type="button"
            data-testid={`dq-bulk-ignore-${group.code}`}
            onClick={() => onGuardedClick(group)}
            disabled={state.kind === "running"}
            aria-busy={running}
            className={armed ? ARMED_BTN : BTN}
          >
            {running
              ? "Ignoring…"
              : armed
                ? `Confirm — ignore all ${group.items.length}`
                : `Ignore all ${group.items.length}`}
            {group.label ? (
              // While armed the span stays (it identifies WHICH group is armed) but
              // drops text-text-subtle so it inherits the recipe's text-warning-bg.
              <span className={armed ? "ml-1 font-normal" : "ml-1 font-normal text-text-subtle"}>
                · {group.label}
              </span>
            ) : null}
          </button>
        );
      })}
      {state.kind === "error" ? (
        <p
          role="alert"
          data-testid="dq-bulk-ignore-error"
          className="rounded-sm border border-border-strong bg-warning-bg p-2 text-xs text-warning-text"
        >
          {state.copy}
        </p>
      ) : null}
    </div>
  );
}
