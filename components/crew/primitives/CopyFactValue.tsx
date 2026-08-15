"use client";

/**
 * components/crew/primitives/CopyFactValue.tsx
 *
 * Spec: docs/superpowers/specs/2026-08-10-wifi-password-legibility.md §4.0-§4.2
 *
 * The copy control for a `FactRows` value. It is a dedicated client island for
 * the same reason `ShareLinkCopyButton` is one (that file's header states it):
 * `FactRows` and `VenueSection` are synchronous Server Components and stay that
 * way, so the smallest possible island keeps their whole subtree server
 * rendered. `FactRows` renders this only for a row that opted in with a
 * `copyLabel`; no other consumer hydrates anything.
 *
 * WHY THE MODULE HOLDS STATE (§4.1). A crew page takes realtime updates through
 * `router.refresh()`, and optional rows (loading dock, parking, room) sit ABOVE
 * the Wi-Fi rows, so both the row's neighbours and its own value can move under
 * a live island. Two consequences, and one mechanism each:
 *
 *   - Sibling churn used to change this row's React key, remounting the island
 *     and orphaning an in-flight clipboard write. `FactRows` now keys a row by
 *     its `testId`, which is stable across churn.
 *   - A REAL remount is still reachable, and `navigator.clipboard.writeText`
 *     gives no latest-write guarantee. So the module keeps an ACTIVE-OWNER
 *     registration written in a LAYOUT effect — synchronous with commit, so a
 *     resolution landing at any later moment observes the live island rather
 *     than a dead one (a passive effect leaves a commit-to-setup window; the
 *     spec-time spike at docs/superpowers/specs/probes/2026-08-10-wifi-ownership-spike.test.tsx
 *     drives exactly that trace) — plus a write LEDGER of the latest sequence
 *     and value.
 *
 * RESOLUTION TRUTH IS VALUE-ONLY (§4.2, the one normative rule). A resolution
 * whose value equals the island's CURRENT value appends a keyed "Copied." entry
 * and sets copied, whatever its sequence age. A resolution whose value differs
 * sets no copied state, clears any standing copied state, and appends the
 * corrective entry — because the clipboard may now hold the stale value while
 * an earlier "Copied." still stands in an append-only log. Sequence never
 * decides truth; it only routes the reset timer, so an older resolution landing
 * mid-window cannot extend the newest write's confirmation past its clock.
 *
 * Any exit from `copied` other than the natural timeout appends the corrective
 * entry — one rule, so the log never ends on a claim this component cannot
 * vouch for.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { AnnounceLogRegion, useAnnounceLog } from "@/components/admin/announceLog";
import { cn } from "@/lib/ui/cn";
import { COPY_FEEDBACK_RESET_MS } from "@/lib/ui/copyFeedback";

/**
 * Both strings below are ANNOUNCEMENTS of a local interaction outcome, not
 * error UI. The §12.4 catalog (AGENTS.md invariant 5) is the single source of
 * truth for copy that names an ERROR CODE the system can produce and a user may
 * report; neither string has a code, a surface variant, or a second reuse site,
 * and a catalog lookup has nothing to return for "the clipboard write you just
 * asked for succeeded". Hence the per-callsite exemptions.
 *
 * (The lookup is deliberately named in prose rather than written as a call:
 * tests/messages/_metaEmphasisRenderContract.test.ts scans file TEXT for
 * catalog accessors, so spelling one here would enroll this file as a catalog
 * renderer it is not, and the honest fix is not to claim the accessor.)
 */
// not-subject:M5-D8 — success announcement, not catalog error copy.
const COPIED_MESSAGE = "Copied.";
// not-subject:M5-D8 — correction of a prior announcement, not catalog error copy.
/** Truthful ending for an append-only log whose last affirmative entry is no
 *  longer vouchable. Plain hyphen, never an em dash (user-visible copy rule). */
const CORRECTIVE_MESSAGE = "Copy again - the clipboard may be out of date.";

type Owner = {
  currentValue: () => string;
  isCopied: () => boolean;
  setCopied: (next: boolean) => void;
  announce: (message: string) => void;
  armReset: () => void;
};

/** The island registered at the latest commit. Null between an unmount and the
 *  next mount, in which case a late resolution simply has nowhere to land. */
let activeOwner: Owner | null = null;

/** Latest dispatched write. `value` is recorded for diagnosis; `seq` routes the
 *  reset arming (never truth — see the header). */
const writeLedger: { seq: number; value: string } = { seq: 0, value: "" };

function recordWrite(value: string): number {
  writeLedger.seq += 1;
  writeLedger.value = value;
  return writeLedger.seq;
}

function deliverWrite(seq: number, value: string): void {
  const owner = activeOwner;
  if (owner === null) return;

  if (value === owner.currentValue()) {
    owner.announce(COPIED_MESSAGE);
    owner.setCopied(true);
    // Only the newest write owns the window. An older resolution arriving
    // mid-window still tells the truth about itself, but re-arming here would
    // stretch the confirmation past the newest write's clock.
    if (seq === writeLedger.seq) owner.armReset();
    return;
  }

  if (owner.isCopied()) owner.setCopied(false);
  owner.announce(CORRECTIVE_MESSAGE);
}

export function CopyFactValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  // The announce channel is cap-only (no TTL): this island unmounts with its
  // page rather than accumulating across an admin session, which is the case
  // the TTL exists for (components/admin/announceLog.tsx).
  const { announce, entries } = useAnnounceLog();

  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReset = useCallback(() => {
    if (resetRef.current !== null) {
      clearTimeout(resetRef.current);
      resetRef.current = null;
    }
  }, []);

  // Read by resolutions that may land after this render; written in a LAYOUT
  // effect for the same reason ShareLinkCopyButton does it (a passive effect
  // runs after paint, and a promise resolving in that window compares against
  // a stale value). Refs cannot be written during render.
  const valueRef = useRef(value);
  const copiedRef = useRef(copied);
  const announceRef = useRef(announce);
  useLayoutEffect(() => {
    valueRef.current = value;
    copiedRef.current = copied;
    announceRef.current = announce;
  });

  // A value change while copied is an exit from a claim this component can no
  // longer vouch for: reset in the render phase (an effect would paint one
  // frame of the stale confirmation first), then append the corrective from an
  // effect, because `announce` mutates a ref and render must stay pure.
  const [seenValue, setSeenValue] = useState(value);
  // A COUNTER, not a boolean flag: the effect below has to fire once per exit,
  // and a flag would need the effect to clear it — a setState inside an effect,
  // which cascades a render and is what the React compiler rejects. A counter
  // changes exactly once per exit, so the dependency array alone gates it.
  const [correctiveSeq, setCorrectiveSeq] = useState(0);
  if (seenValue !== value) {
    setSeenValue(value);
    if (copied) {
      setCopied(false);
      setCorrectiveSeq((n) => n + 1);
    }
  }
  useEffect(() => {
    if (correctiveSeq === 0) return; // nothing has exited yet (mount)
    announce(CORRECTIVE_MESSAGE);
  }, [correctiveSeq, announce]);

  // Ownership registration. Empty deps so exactly one owner object exists per
  // island instance; the closures read the refs above, which every render
  // refreshes.
  useLayoutEffect(() => {
    const owner: Owner = {
      currentValue: () => valueRef.current,
      isCopied: () => copiedRef.current,
      setCopied: (next) => setCopied(next),
      announce: (message) => announceRef.current(message),
      armReset: () => {
        clearReset();
        resetRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_RESET_MS);
      },
    };
    activeOwner = owner;
    return () => {
      // Guard the swap: on a keyed remount React runs this cleanup before the
      // next island's setup, but an out-of-order cleanup must never clear a
      // registration it does not own.
      if (activeOwner === owner) activeOwner = null;
      clearReset();
    };
  }, [clearReset]);

  const onClick = async () => {
    // Capture what THIS request is for; the value can move before it resolves.
    const requested = value;
    const seq = recordWrite(requested);
    try {
      await navigator.clipboard.writeText(requested);
    } catch {
      // Clipboard unavailable (no HTTPS in dev, locked-down browser). The
      // password is still on screen in `.code-value` type for manual
      // transcription, which is the documented fallback (spec §7).
      return;
    }
    deliverWrite(seq, requested);
  };

  const glyphClass = "size-3.5 shrink-0";

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        aria-label={label}
        className={cn(
          // Class B recipe adapted (step3-a11y §"Recipe, empirically selected"):
          // the precedent's `-m-2` becomes `-my-2 -ml-2`. Margin-right stays at
          // 0 so the 44px target's right edge is pinned to the row edge; the
          // leftward reach lands inside the wrapper's `gap-3.5`.
          "-my-2 -ml-2 inline-flex size-tap-min shrink-0 items-center justify-center rounded-md",
          // The row sits on SectionCard's `bg-surface`, and DESIGN.md:40 makes
          // the ring offset match the backdrop — `ring-offset-bg` is wrong here.
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        )}
      >
        {/* The FactRows icon tile, adapted: same 28px sunken square, but the
            glyph is sized here rather than by a child selector, and it carries
            `text-text` because this is an action target (DESIGN.md:27 forbids
            `text-text-subtle` there). */}
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-sunken text-text"
        >
          {copied ? (
            <svg
              data-slot="check-glyph"
              viewBox="0 0 24 24"
              className={glyphClass}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg
              data-slot="copy-glyph"
              viewBox="0 0 24 24"
              className={glyphClass}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </span>
      </button>
      {/* role="log" and not a status swap: identical "Copied." text recurs on a
          repeat tap, and an append always re-announces where a swap may not.
          The testid is the crew Wi-Fi row's because that is the single opted-in
          call site today (spec §4.2/§4.3); a second consumer takes its own. */}
      <AnnounceLogRegion
        entries={entries}
        label="Copy confirmations"
        testId="venue-wifi-copy-log"
      />
    </>
  );
}
