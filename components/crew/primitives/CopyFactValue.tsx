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

import {
  ANNOUNCE_LOG_TTL_MS,
  AnnounceLogRegion,
  useAnnounceLog,
} from "@/components/admin/announceLog";
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
  /** Enters the copied state. Never clears it — `clearCopied` is the only exit,
   *  because an exit must also kill the window's timer. */
  setCopied: () => void;
  /** Leaves the copied state AND kills its timer together. A timer left running
   *  with nothing standing behind it is an ORPHAN CLOCK: the next success sees
   *  a non-null timer, declines to arm, and inherits whatever is left of it —
   *  so a confirmation promised for the full window can vanish in a fraction of
   *  it (whole-diff review round 3). */
  clearCopied: () => void;
  announce: (message: string) => void;
  armReset: () => void;
  /** Arms the window ONLY if none is running, so a non-latest success never
   *  extends the window the newest write owns. */
  ensureResetArmed: () => void;
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
    owner.setCopied();
    // Only the newest write OWNS the window — an older resolution arriving
    // mid-window must not stretch the confirmation past the newest write's
    // clock. But every success still needs SOME window: an older one landing
    // after the newest window already expired re-lights the glyph, and with
    // nothing armed it stays lit for as long as the page is open. `ensure`
    // arms only when no window is running, so both halves hold at once.
    if (seq === writeLedger.seq) owner.armReset();
    else owner.ensureResetArmed();
    return;
  }

  // UNCONDITIONAL, never guarded on "is it currently copied". The guard used to
  // read a ref written in a layout effect, and within a SINGLE React batch that
  // ref still holds the value from before the current-value resolution set
  // copied — so two resolutions batched together announced the corrective and
  // left the check glyph lit. A redundant `setCopied(false)` costs nothing; a
  // skipped one leaves the log and the painted state disagreeing.
  owner.clearCopied();
  owner.announce(CORRECTIVE_MESSAGE);
}

export function CopyFactValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  // TTL-pruned, not cap-only. The distinction the shared channel documents is
  // whether a channel outlives its announcements: the warnings channel unmounts
  // with its panel, so it never accumulates; the admin layout channel lives a
  // whole session, and unpruned it made a top-down screen-reader read recite
  // every undo before reaching the nav (impeccable audit P2, 12 undos = 12
  // sibling nodes / 686 chars). A crew page is the second shape — it is opened
  // once and left open for the show, so every "Copied." from every tap would
  // still be sitting in the accessibility tree hours later. 30s is far past any
  // plausible delivery-queue residence, so nothing unspoken is stranded.
  const { announce, entries } = useAnnounceLog({ ttlMs: ANNOUNCE_LOG_TTL_MS });

  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Counts arms, so a deferred cancel can name WHICH window it meant. Without
  // it the corrective effect below cancels "the" timer, and a success landing
  // between the render that queued the corrective and the effect that delivers
  // it loses the window it just armed — copied with nothing counting down.
  const armGenRef = useRef(0);
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
  const announceRef = useRef(announce);
  useLayoutEffect(() => {
    valueRef.current = value;
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
  const [corrective, setCorrective] = useState({ seq: 0, gen: 0 });
  // The corrective is owed for as long as an affirmative entry is STILL IN THE
  // LOG, not merely while `copied` is set. The natural timeout retires the
  // glyph silently and correctly — nothing is being claimed on screen any more
  // — but the announcement outlives it, and a screen-reader user's last word on
  // this row would otherwise stay "Copied." while the value beneath it moved
  // and the clipboard went stale. Bounded by the channel's own TTL rather than
  // forever: once the entry is pruned the log ends on nothing, so there is no
  // claim left to retract and a value change announces nothing at all. (Found
  // by whole-diff review round 6, against the consequence bound this arc's own
  // review brief declared: an affirmative "Copied." must never be left standing
  // as the log's last word once it stopped being true.)
  const affirmativeStanding = entries.some((e) => e.text === COPIED_MESSAGE);
  if (seenValue !== value) {
    setSeenValue(value);
    if (copied || affirmativeStanding) {
      if (copied) setCopied(false);
      // `gen` names the window that was live at THIS moment — the only one this
      // corrective is entitled to cancel.
      setCorrective((c) => ({ seq: c.seq + 1, gen: armGenRef.current }));
    }
  }
  useEffect(() => {
    if (corrective.seq === 0) return; // nothing has exited yet (mount)
    // The timer dies with the confirmation it was counting down — leaving it
    // running would orphan the clock and shorten the NEXT confirmation to
    // whatever remained of this one. Clearing a timeout is a side effect, so it
    // belongs in the effect rather than the render phase that cleared the
    // state; the GENERATION CHECK is what makes that safe. A resolution can land
    // between the render that queued this corrective and the effect that
    // delivers it — React's own passive-effect window — and if it did, it has
    // already armed a NEWER window. Cancelling that one leaves the control
    // copied with nothing counting down at all.
    //
    // NOT COVERED BY A JSDOM TEST, stated rather than implied. The interleaving
    // needs the value change COMMITTED while its passive effect is still
    // pending, and `act` flushes passive effects at the end of its scope, which
    // closes exactly that gap; three constructions were measured (both inside
    // one act, act-free with an explicit flush, and delivery queued before the
    // act) and none reproduced the order — each either delivered before the
    // commit or ran the effect before the delivery. The defect was demonstrated
    // by the round-4 reviewer's own component probe, and this guard is the
    // repair; a test that passes with and without it would be worse than none.
    if (armGenRef.current === corrective.gen) clearReset();
    announce(CORRECTIVE_MESSAGE);
  }, [corrective, announce, clearReset]);

  // Ownership registration. Empty deps so exactly one owner object exists per
  // island instance; the closures read the refs above, which every render
  // refreshes.
  useLayoutEffect(() => {
    const arm = () => {
      armGenRef.current += 1;
      // NULLS ITS OWN HANDLE. A fired timer left in the ref reads as "a window
      // is running" forever, which made `ensureResetArmed` refuse to arm and
      // stranded a confirmation re-lit after the first window expired.
      resetRef.current = setTimeout(() => {
        resetRef.current = null;
        setCopied(false);
      }, COPY_FEEDBACK_RESET_MS);
    };
    const owner: Owner = {
      currentValue: () => valueRef.current,
      setCopied: () => setCopied(true),
      clearCopied: () => {
        clearReset();
        setCopied(false);
      },
      announce: (message) => announceRef.current(message),
      armReset: () => {
        clearReset();
        arm();
      },
      ensureResetArmed: () => {
        // No clearReset: a window already counting down keeps ITS clock. This
        // rescues a confirmation that has no timer at all, and must never
        // extend one that does.
        if (resetRef.current === null) arm();
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
      // transcription, which is the documented fallback (spec §7). Silent by
      // spec §4.2. Nothing to hand back either: a success ALWAYS arms a
      // window now (see deliverWrite), so no confirmation is ever left
      // depending on a write that failed.
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
          "group -my-2 -ml-2 inline-flex size-tap-min shrink-0 items-center justify-center rounded-md",
          // The row sits on SectionCard's `bg-surface`, and DESIGN.md:40 makes
          // the ring offset match the backdrop — `ring-offset-bg` is wrong here.
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        )}
      >
        {/* The FactRows icon tile, adapted: same 28px sunken square, but the
            glyph is sized here rather than by a child selector, and it carries
            `text-text` because this is an action target (DESIGN.md:27 forbids
            `text-text-subtle` there).

            The hover step is the glyph COLOR, not the tile fill, and that is a
            constraint rather than a preference: the tile is already
            `bg-surface-sunken`, and its 28px box is what makes this row exactly
            as tall as an icon-bearing one (the DI-1 oracle), so a fill or size
            change on hover would move a measured invariant. Darkening to
            `text-text-strong` is the same half the sibling copy control uses
            (app/admin/show/[slug]/ShareLinkCopyButton.tsx:151), so one product
            has one copy affordance. */}
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-sunken text-text transition-colors duration-fast group-hover:text-text-strong"
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
