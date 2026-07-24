"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { BulkIgnoreGroup } from "@/lib/dataQuality/bulkIgnoreGroups";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";

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
  cards: ReactNode;
};

type Props = { slug: string; groups: ActiveWarningGroup[] };
type State =
  | { kind: "idle" }
  | { kind: "running"; code: string }
  | { kind: "error"; code: string; copy: string };

// Neutral chip skin (idle). Renders on the panel `bg`, so the focus ring-offset is `bg`.
const BTN =
  "inline-flex min-h-tap-min max-w-full items-center justify-start self-start whitespace-normal rounded-sm border border-border-strong bg-bg px-3 py-1 text-left text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

// G4 armed branch (spec 2026-07-16-destructive-confirm-pass §4): destructive recipe fill (C1),
// same shape/wrap as idle; border-transparent compensates the idle border (no layout shift).
const ARMED_BTN =
  "inline-flex min-h-tap-min max-w-full items-center justify-start self-start whitespace-normal rounded-sm border border-transparent bg-warning-text px-3 py-1 text-left text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

const ARM_REVERT_MS = 4_000;

/**
 * DQIGNORE-6 — the ACTIVE data-quality list, grouped by code. Each group renders an
 * eyebrow (plain-language type label + hairline rule) and, when bulk-eligible, an inline
 * "Ignore all N" chip on that eyebrow row; the group's cards render below, and a
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
      }, ARM_REVERT_MS);
      return;
    }
    clearArmTimer();
    setArmedCode(null);
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
        // Single source for the chip's VISIBLE text; the accessible name (below) mirrors it
        // and appends the type context. Because it tracks state, the accessible name stays in
        // sync with the visible label in every state — armed reads "Confirm ignore all N ·
        // <type>" (WCAG 2.5.3 Label-in-Name holds across the morph, not just idle). The type
        // moved off the chip into the eyebrow for sighted users; the aria-label restores it
        // for screen-reader / voice-control.
        const chipText = running
          ? "Ignoring…"
          : armed
            ? `Confirm ignore all ${bulk?.items.length ?? 0}`
            : `Ignore all ${bulk?.items.length ?? 0}`;
        return (
          <div
            key={group.code}
            className="flex flex-col gap-2"
            data-testid={`dq-active-group-${group.code}`}
          >
            <div className="flex items-center gap-2">
              {group.label ? (
                <span
                  data-testid={`dq-group-label-${group.code}`}
                  className="min-w-0 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
                >
                  {group.label}
                </span>
              ) : null}
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              {bulk ? (
                <>
                  <button
                    type="button"
                    data-testid={`dq-bulk-ignore-${group.code}`}
                    onClick={() => onGuardedClick(bulk)}
                    disabled={state.kind === "running"}
                    aria-busy={running}
                    aria-label={group.label ? `${chipText} · ${group.label}` : undefined}
                    className={armed ? ARMED_BTN : BTN}
                  >
                    {chipText}
                  </button>
                  {/* Persistent sr-only live region (always mounted — conditional mounting
                      drops the announcement). Kept as the chip's nextElementSibling. */}
                  <span role="status" className="sr-only">
                    {armed ? "Tap again to confirm." : ""}
                  </span>
                </>
              ) : null}
            </div>
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
