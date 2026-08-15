"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { BulkIgnoreGroup } from "@/lib/dataQuality/bulkIgnoreGroups";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";
import { ARM_EXPIRED_ANNOUNCEMENT, ARM_REVERT_MS } from "@/lib/admin/destructiveConfirm";
import { cn } from "@/lib/ui/cn";

export type BulkIgnoreGroupWithLabel = BulkIgnoreGroup & {
  /** Plain-language type label (catalog title / data-gap label), or null. Never the raw code. */
  label: string | null;
};

/**
 * One per-code group of the ACTIVE data-quality list. The page pre-renders `cards`
 * (a `<PerShowActionableWarnings>` server node) and passes it through as a slot prop —
 * the supported RSC pattern (server nodes as props of a client component). `bulk` is
 * present iff the code is bulk-eligible (>=2 distinct-content active ignorable warnings).
 */
export type ActiveWarningGroup = {
  code: string;
  label: string | null;
  bulk: BulkIgnoreGroupWithLabel | null;
  /** Number of warning cards in the `cards` slot (post crew-filter). The eyebrow
   *  row is suppressed for a lone chip-less card — its title already carries the
   *  type (spec 2026-07-24-dq-singleton-eyebrow-suppress §2.1). */
  itemCount: number;
  cards: ReactNode;
};

type Props = { slug: string; groups: ActiveWarningGroup[] };
type State =
  | { kind: "idle" }
  | { kind: "running"; code: string }
  | { kind: "error"; code: string; copy: string };

// Neutral chip skin (idle). Renders on the panel `bg`, so the focus ring-offset is `bg`.
const BTN = cn(
  "inline-flex min-h-tap-min max-w-full items-center justify-start self-start whitespace-normal rounded-sm border border-text-faint bg-bg px-3 py-1 text-left text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
);

// G4 armed/running branch (spec 2026-07-16-destructive-confirm-pass §4): destructive recipe
// fill (C1); border-transparent compensates the idle border (no layout shift). Below 480px it
// takes the full row width, which wraps it onto its own flex line — the confirm tap is the
// destructive one and the 375px row has no room for it inline (spec 2026-07-24-dq-eyebrow-
// divider §3.1). At >=480px it reverts to an inline chip: `w-full` there would paint a
// panel-wide bar. ONE class literal on purpose — tests/styles/_metaDestructiveConfirm.test.ts
// registers this file's recipe hits by occurrence index, and splitting it adds an
// unregistered one.
const ARMED_BTN = cn(
  "inline-flex min-h-tap-min w-full max-w-full items-center justify-center self-start whitespace-normal rounded-sm border border-transparent bg-warning-text px-3 py-1 text-left text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg min-[480px]:w-auto min-[480px]:justify-start",
);

/**
 * DQIGNORE-6 — the ACTIVE data-quality list, grouped by code. Each group renders an
 * eyebrow (plain-language type label + a hairline rule drawn only at >=480px) UNLESS it
 * is a lone chip-less card (itemCount 1, no bulk), whose header adds nothing over the
 * card itself and is
 * suppressed (spec 2026-07-24-dq-singleton-eyebrow-suppress §2.1: for cataloged codes
 * it verbatim-duplicates the card title; data-gap-labeled singletons are suppressed
 * too, nothing is grouped and nothing rides the row). Bulk-eligible groups render an
 * inline "Ignore" chip on that eyebrow row; the group's cards render below, and a
 * partial-failure notice (if any) renders below the acting group's cards. The chip's
 * two-tap arm→confirm guard, single-armed-panel-wide invariant (one shared armedCode +
 * timer), and per-fingerprint fan-out are unchanged from DQIGNORE-2/§4 G4. Renders null
 * when there are no active groups.
 */
export function BulkIgnoreControls({ slug, groups }: Props) {
  const router = useRouter();
  const { announce } = useContext(WarningAnnounceContext);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [armedCode, setArmedCode] = useState<string | null>(null);
  // Spec 2026-08-01-announce-a11y-pass §3.3: set ONLY in the arm timer's
  // callback (keyed to the expired group); cleared at arm and at dispatch entry.
  const [expiredCode, setExpiredCode] = useState<string | null>(null);
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
      setExpiredCode(null);
      clearArmTimer();
      armTimerRef.current = setTimeout(() => {
        armTimerRef.current = null; // callback clears its own ref — no stale identity survives
        setArmedCode(null);
        setExpiredCode(group.code);
      }, ARM_REVERT_MS);
      return;
    }
    clearArmTimer();
    setArmedCode(null);
    setExpiredCode(null);
    void ignoreGroup(group);
  }

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
        // this component's client state; the component stays mounted whenever another code
        // still has a bulk group. Leaving state "running" would wedge every sibling chip
        // permanently disabled until a full reload (DQIGNORE audit P1). Idle re-enables them;
        // the ignored group drops out of the refreshed server props.
        setState({ kind: "idle" });
        // Announcer spec 2026-07-22 §2.3: all-ok completion clause, announced
        // BEFORE the refresh (a refresh-first ordering can lose the message
        // to a surface replacement). Partial and total failures never
        // announce — they surface via the role="alert" notice below.
        announce(results.length === 1 ? "1 ignored." : `${results.length} ignored.`);
        router.refresh();
        return;
      }
      // Partial success: the succeeded ignores ARE committed (idempotent inserts), so report
      // honestly rather than implying none landed. We do NOT auto-refresh — that would drop
      // this notice; the operator refreshes to see the ones that moved and retries the rest.
      setArmedCode(null); // entering `error` clears armed (spec §4 G4 state model)
      setState({
        kind: "error",
        code: group.code,
        copy: ok > 0 ? `Ignored ${ok} of ${results.length}. Refresh to see the rest.` : failCopy,
      });
    } catch {
      setArmedCode(null); // entering `error` clears armed (spec §4 G4 state model)
      setState({ kind: "error", code: group.code, copy: failCopy });
    }
  }

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="dq-active-groups">
      {groups.map((group) => {
        const running = state.kind === "running" && state.code === group.code;
        const armed = armedCode === group.code;
        const errored = state.kind === "error" && state.code === group.code;
        const bulk = group.bulk;
        // The chip's VISIBLE text is short enough to sit on one line in a crowded
        // 375px row (spec 2026-07-24-dq-eyebrow-divider §3.2); the count and the type
        // both live in the accessible name below. `chipName` LEADS with the visible
        // string in every state, so WCAG 2.5.3 Label-in-Name holds across the morph,
        // not just at idle — and the label-less branch is named too, or the count
        // would reach nobody there.
        // The row wraps ONLY while the chip is full-width. An always-wrapping row would
        // drop the idle chip to its own line too, costing ~18px per group at rest.
        const rowClass = armed || running ? " flex-wrap" : "";
        const count = bulk?.items.length ?? 0;
        const chipText = running ? "Ignoring…" : armed ? "Are you sure?" : "Ignore";
        const chipName = running
          ? "Ignoring…"
          : armed
            ? `Are you sure? Ignore ${count}`
            : `Ignore ${count}`;
        // spec 2026-07-24 §2.1: a lone chip-less card duplicates its own title in
        // the eyebrow — suppress the whole header row. Any group with a bulk chip
        // keeps the row (the chip rides it), as does any plural LABELED group.
        // A plural group with neither label nor chip would carry only the decorative
        // rule, which is display:none below 480px — an empty flex item still charging
        // the parent's gap-2 (DESIGN.md §7a). Suppress that row too.
        const showEyebrowRow = bulk !== null || (group.label !== null && group.itemCount !== 1);
        return (
          <div
            key={group.code}
            className="flex flex-col gap-2"
            data-testid={`dq-active-group-${group.code}`}
          >
            {showEyebrowRow ? (
              <div className={`flex items-center gap-2${rowClass}`}>
                {group.label ? (
                  <span
                    data-testid={`dq-group-label-${group.code}`}
                    className="min-w-0 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
                  >
                    {group.label}
                  </span>
                ) : null}
                {/* Decorative rule. Hidden below 480px: in a crowded row `flex-1` resolves
                    to 0 width there (measured 0px at every width 320-430) and the row would
                    still charge `gap-2` on BOTH sides of an element nobody can see. `hidden`
                    takes it out of flow, so neither gap is spent; `min-w-6` keeps the
                    zero-width state unreachable wherever it IS drawn. Spec
                    2026-07-24-dq-eyebrow-divider-and-confirm-bar §3.1; DESIGN.md §7a. */}
                <span
                  aria-hidden="true"
                  className="hidden h-px min-w-6 flex-1 bg-border min-[480px]:block"
                />
                {bulk ? (
                  <>
                    <button
                      type="button"
                      data-testid={`dq-bulk-ignore-${group.code}`}
                      onClick={() => onGuardedClick(bulk)}
                      disabled={state.kind === "running"}
                      aria-busy={running}
                      aria-label={group.label ? `${chipName} · ${group.label}` : chipName}
                      className={armed || running ? ARMED_BTN : BTN}
                    >
                      {chipText}
                    </button>
                    {/* Persistent sr-only live region (always mounted — conditional mounting
                        drops the announcement). Kept as the chip's nextElementSibling. */}
                    <span role="status" className="sr-only">
                      {armed
                        ? "Tap again to confirm."
                        : expiredCode === group.code
                          ? ARM_EXPIRED_ANNOUNCEMENT
                          : ""}
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
            {group.cards}
            {errored ? (
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
      })}
    </div>
  );
}
