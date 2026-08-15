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
 *     gives no latest-write guarantee. So each island registers itself in a
 *     LAYOUT effect — synchronous with commit, so a resolution landing at any
 *     later moment observes live islands rather than dead ones (a passive
 *     effect leaves a commit-to-setup window; the spec-time spike at
 *     docs/superpowers/specs/probes/2026-08-10-wifi-ownership-spike.test.tsx
 *     drives exactly that trace) — plus a per-row write COUNTER, so two
 *     resolutions for one row can be ordered.
 *
 * WHAT THE REGISTRATION IS KEYED ON is the question this file spent seven
 * review rounds on, and the spec's §4.1 amendment records the outcome: NOT a
 * name. An affirmative follows a successor chain proven inside the commit that
 * performs a swap (see below); a retraction broadcasts by VALUE to every
 * mounted island, because the clipboard is one resource and only the
 * confirmation is per island (`publishClipboardWrite`).
 *
 * RESOLUTION TRUTH IS VALUE-ONLY (§4.2, the one normative rule). A resolution
 * whose value equals the island's CURRENT value appends a keyed "Copied." entry
 * and sets copied, whatever its sequence age. A resolution whose value differs
 * sets no copied state, clears any standing copied state, and appends the
 * corrective entry — because the clipboard may now hold the stale value while
 * an earlier "Copied." still stands in an append-only log. Sequence never
 * decides truth; it only routes the reset timer, so an older resolution landing
 * mid-window cannot extend past the clock a newer resolution already armed.
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
  /** False once this island's cleanup has run. */
  mounted: boolean;
  /**
   * The island that REPLACED this one in the same commit, or null. Set only on
   * a proven swap (see `vacating`), so following it can never wander onto a
   * different row.
   */
  successor: Owner | null;
  /**
   * The write sequence that armed the window this island is currently showing,
   * or 0 for an island that has never armed one. PER ISLAND, deliberately: the
   * counter is keyed by identity and two islands may share one, so a
   * module-wide "is this the newest write" test coupled confirmations that are
   * otherwise routed by instance and entirely independent (round 16).
   */
  windowSeq: number;
  currentValue: () => string;
  /** Enters the copied state. Never clears it — the render-phase retraction is
   *  the only exit, because an exit must also kill the window's timer, and a
   *  timer left running with nothing standing behind it is an ORPHAN CLOCK: the
   *  next success sees a non-null timer, declines to arm, and inherits whatever
   *  is left of it, so a confirmation promised for the full window can vanish
   *  in a fraction of it (whole-diff review round 3). */
  setCopied: () => void;
  announce: (message: string) => void;
  /** Told that the clipboard now holds `written`, so this island can retract a
   *  claim that string just falsified, or keep one the string confirms. The
   *  island decides in its RENDER phase, where `copied` and the standing entry
   *  are both accurate — see `publishClipboardWrite`. */
  clipboardMoved: (seq: number, written: string) => void;
  armReset: () => void;
  /** Arms the window ONLY if none is running, so an older success never extends
   *  the window a newer resolution already armed. */
  ensureResetArmed: () => void;
};

/**
 * WHO RECEIVES A LATE RESOLUTION, and why this is a chain rather than a lookup.
 *
 * The registration exists for ONE case: an island unmounted while its clipboard
 * write was still in flight, and the row it belonged to is now rendered by a
 * replacement island that should show the confirmation. Every earlier version of
 * this file answered "who is the replacement?" with a name — first a single
 * global, then a map keyed by the row's identity — and a name cannot answer it.
 * Identity is caller-supplied and only as unique as the caller makes it, so a
 * name lookup also matches a DIFFERENT row that happens to share the identity,
 * or a later row that reuses it. Whole-diff review rounds 7 through 11 each
 * found another ordering that delivered a confirmation to a row nobody tapped.
 *
 * So a replacement is recognized only where it is PROVABLE, and the proof has
 * three parts, each of which was a defect before it was a rule:
 *
 *   1. WITHIN THE COMMIT. React runs an outgoing island's cleanup and the
 *      incoming island's setup inside the same commit, so a vacancy is offered
 *      for that window and cleared on the next microtask.
 *   2. PER IDENTITY, not one slot. React batches cleanups AHEAD of setups when
 *      several islands remount together — `cleanup A, cleanup B, setup A, setup
 *      B` — so a single slot holds B by the time A's setup runs. With distinct
 *      identities a slot merely LOSES A's link; with a shared one it hands A
 *      the wrong predecessor (round 11).
 *   3. CONSUMED ONCE, and never when ambiguous. Two islands vacating under the
 *      same identity in one window cannot be told apart, so neither is offered
 *      at all, and a vacancy already claimed is not offered twice.
 *
 * Anything unlinked has NO successor, so a late resolution's AFFIRMATIVE lands
 * nowhere: the value is on screen, the clipboard already holds it, and nothing
 * is claimed. Its RETRACTION is a different question with a different answer —
 * see `publishClipboardWrite`, which is not routed by this chain at all, since
 * what it retracts is a claim about the clipboard rather than about a row.
 *
 * NOT A DEFECT, and worth writing down because it looks like one: a different
 * row that takes over an identity IN THE SAME COMMIT receives the confirmation
 * when its value matches. Two ratified rules meet there. Identity is the
 * CALLER'S declaration that this is the same row, so reusing it in the swap is
 * the caller saying so; and resolution truth is VALUE-ONLY (spec §4.2), so what
 * the entry claims — the clipboard holds the string this row is showing — is
 * true of the row that now displays it. A row that takes the identity with a
 * DIFFERENT value gets the corrective, which is the same rule from the other
 * side. (Raised as round 12's finding, refuted on those two grounds.)
 *
 * DOCUMENTED LIMIT, since the guard should not claim more than it proves: a
 * different row that reuses a just-vacated identity in a LATER commit inside
 * the same synchronous task — before the clearing microtask — is
 * indistinguishable from the replacement and would receive the confirmation. That needs an
 * identity to be duplicated AND reused within one task, which is the compound
 * authoring mistake the spec's one-opted-in-row precondition fences; the
 * ordinary cases above are what the mechanism is for.
 */
const AMBIGUOUS = Symbol("ambiguous vacancy");
const vacancies = new Map<string, Owner | typeof AMBIGUOUS>();
let vacancySweepScheduled = false;

function offerVacancy(identity: string, owner: Owner): void {
  vacancies.set(identity, vacancies.has(identity) ? AMBIGUOUS : owner);
  if (vacancySweepScheduled) return;
  vacancySweepScheduled = true;
  queueMicrotask(() => {
    vacancies.clear();
    vacancySweepScheduled = false;
  });
}

/**
 * Claims the vacancy for `identity` if there is exactly one, and CONSUMES IT BY
 * DELETION so a second setup in the same window cannot claim it too.
 *
 * Deleting rather than marking ambiguous, because those are two different facts
 * that happen to have the same effect on a claim. Marking left the slot
 * occupied, and `offerVacancy` reads an occupied slot as "a second island is
 * vacating" — so the very next offer in the same window was refused. That offer
 * is an ordinary event: an island that just claimed a vacancy can be replaced
 * again before the sweep runs (a layout effect commits synchronously, ahead of
 * any microtask). The chain then ended at a dead island, a late resolution
 * landed nowhere, and the standing "Copied." it should have retracted stayed
 * the log's last word with the clipboard already stale (round 16). Deleting
 * keeps the claim-once rule — a second setup finds nothing — without spending
 * the window's ambiguity on a vacancy that is already spoken for.
 */
function claimVacancy(identity: string, successor: Owner): void {
  const vacated = vacancies.get(identity);
  if (vacated === undefined || vacated === AMBIGUOUS) return;
  vacated.successor = successor;
  vacancies.delete(identity);
}

/**
 * Dispatched writes PER IDENTITY, counted so two resolutions for one row can be
 * ordered. It never decides truth (§4.2) — it decides only which of them owns
 * the reset window, and it is keyed by the ROW rather than the island because a
 * write dispatched by an island that has since been replaced must still be
 * comparable with the writes its replacement dispatches.
 */
const writeSeqs = new Map<string, number>();

function recordWrite(identity: string): number {
  const next = (writeSeqs.get(identity) ?? 0) + 1;
  writeSeqs.set(identity, next);
  return next;
}

/** Every island currently mounted. Not a routing table — see
 *  `publishClipboardWrite` for the one thing it is allowed to answer. */
const liveOwners = new Set<Owner>();
let clipboardWriteSeq = 0;

/**
 * A RESOLUTION IS A FACT ABOUT THE CLIPBOARD, and the clipboard is one resource
 * shared by every row on the page; only the CONFIRMATION is per island. Routing
 * the affirmative by proven chain is what keeps a "Copied." off a row that
 * never asked for it — but applying that same routing to the RETRACTION made a
 * write with no live chain say nothing at all, and a write for one row say
 * nothing to another. Both leave an affirmative standing that the string just
 * written falsified: an island unmounted and restored across two refreshes is
 * unlinked by construction, and a second opted-in row needs no unmount at all
 * (round 17).
 *
 * So every island is TOLD what the clipboard now holds, and each decides for
 * itself. No name lookup is involved and no false positive is available: an
 * island whose current value differs from what the clipboard holds is making a
 * claim that is false, whichever row it belongs to; matching values are left
 * alone, because the claim is about the string and two rows showing it can both
 * hold it truthfully (§4.2).
 *
 * EVERY island, including the one this write was delivered to. Excluding it
 * looked like an optimisation — it already knows — and was a defect: with two
 * rows resolving in ONE batch, the last writer then saw only the PREVIOUS
 * writer's message, retracted a claim that was true, and both rows ended
 * corrected (round 19). Told about its own write too, each island's decision is
 * a pure function of the clipboard's FINAL content and its own value, so the
 * order the messages arrive in stops mattering — which is the property that
 * defect was missing, not a case it had not covered.
 *
 * The island decides in its own RENDER phase rather than here, both to reuse
 * the corrective machinery whole (including the generation-guarded cancel) and
 * because "is a claim standing" is only accurate there: read from a ref written
 * in a layout effect it lags inside a batch, which is round 1's defect exactly.
 */
function publishClipboardWrite(written: string): void {
  clipboardWriteSeq += 1;
  for (const owner of liveOwners) owner.clipboardMoved(clipboardWriteSeq, written);
}

function deliverWrite(dispatcher: Owner, seq: number, value: string): void {
  // First, and whether or not this write still has an owner: the clipboard
  // moved, and every island re-decides its own claim against what it now holds.
  publishClipboardWrite(value);

  let owner: Owner | null = dispatcher;
  while (owner !== null && !owner.mounted) owner = owner.successor;
  if (owner === null) return;
  // Only the AFFIRMATIVE is delivered here. A resolution that no longer matches
  // this island's value retracts nothing by itself — the broadcast above
  // already told every island, this one included, what the clipboard holds, and
  // one retraction path means the log can never end on two.
  if (value !== owner.currentValue()) return;

  owner.announce(COPIED_MESSAGE);
  owner.setCopied();
  // WHICH RESOLUTION OWNS THE WINDOW is decided against the write that armed
  // the window now running — not against the newest write DISPATCHED. Only a
  // resolution has a confirmation to protect: a newer write that is still in
  // flight may reject or resolve to a different value, and until it lands the
  // confirmation on screen is this one, entitled to a full window. Measuring
  // against the dispatched maximum shortened a success to the remains of an
  // older clock whenever any newer write was outstanding, needed a `failed`
  // set to un-count the ones that rejected (round 14), and — since the
  // counter is per identity while confirmations are per island — let a write
  // dispatched by a DIFFERENT row sharing the identity expire this row's
  // confirmation (round 16). Comparing per island against the arming seq
  // retires all three: the bookkeeping existed only to patch the comparison.
  if (seq >= owner.windowSeq) {
    owner.windowSeq = seq;
    owner.armReset();
    return;
  }
  // An OLDER resolution landing mid-window must not stretch the confirmation
  // past the clock the newer one armed. But every success still needs SOME
  // window: one landing after that window already expired re-lights the
  // glyph, and with nothing armed it stays lit for as long as the page is
  // open. `ensure` arms only when no window is running, so both hold at once.
  owner.ensureResetArmed();
}

export function CopyFactValue({
  value,
  label,
  identity,
}: {
  value: string;
  label: string;
  /** Stable across this row's remounts and distinct between rows — `FactRows`
   *  passes the row's `testId`, falling back to its label. It keys the VACANCY
   *  offered when this island unmounts, so it decides which incoming island may
   *  be proven its replacement. It is not a routing table: no resolution is
   *  ever delivered by looking this string up. */
  identity: string;
}) {
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
  /** This island's own registration, so a write it dispatches can be delivered
   *  back to it by instance rather than by name. */
  const ownerRef = useRef<Owner | null>(null);
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
  // The clipboard's side of the same predicate, pushed in by `publishClipboardWrite`.
  // Only the LATEST write is tracked, because an island needs one fact — what
  // the clipboard holds now — and a later write supersedes an earlier one for
  // that purpose.
  const [clipboardWrite, setClipboardWrite] = useState({ seq: 0, written: "" });
  const [seenClipboardWrite, setSeenClipboardWrite] = useState(0);
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
  /** Retract a standing claim, from either side of the same predicate: THIS
   *  ROW'S VALUE moved out from under the clipboard, or the CLIPBOARD moved out
   *  from under the row. */
  const retractStandingClaim = () => {
    if (!copied && !affirmativeStanding) return;
    if (copied) setCopied(false);
    // `gen` names the window that was live at THIS moment — the only one this
    // corrective is entitled to cancel.
    setCorrective((c) => ({ seq: c.seq + 1, gen: armGenRef.current }));
  };
  if (seenValue !== value) {
    setSeenValue(value);
    retractStandingClaim();
  }
  if (seenClipboardWrite !== clipboardWrite.seq) {
    setSeenClipboardWrite(clipboardWrite.seq);
    if (clipboardWrite.written !== value) retractStandingClaim();
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
    // The same is true of round 13's ordering — an older success that KEEPS a
    // running window, so nothing re-arms, with a corrective already queued
    // against that generation. Entering `copied` now advances the generation
    // for exactly that reason, and the ordering shares the limit below.
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
      mounted: true,
      successor: null,
      windowSeq: 0,
      currentValue: () => valueRef.current,
      setCopied: () => {
        // ENTERING copied advances the generation, not merely arming a timer.
        // A non-latest success can keep the window already running — no new arm
        // — and a corrective queued before it would then still match the old
        // generation and cancel the window now backing a NEW confirmation,
        // leaving the glyph lit with nothing counting down (round 13). The
        // generation names the confirmation, so it moves whenever one begins.
        armGenRef.current += 1;
        setCopied(true);
      },
      announce: (message) => announceRef.current(message),
      clipboardMoved: (seq, written) => setClipboardWrite({ seq, written }),
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
    claimVacancy(identity, owner);
    liveOwners.add(owner);
    ownerRef.current = owner;
    return () => {
      owner.mounted = false;
      liveOwners.delete(owner);
      offerVacancy(identity, owner);
      clearReset();
    };
  }, [clearReset, identity]);

  const onClick = async () => {
    // Capture what THIS request is for; the value can move before it resolves.
    const requested = value;
    const dispatcher = ownerRef.current;
    if (dispatcher === null) return; // not registered yet: nothing can land anywhere
    const seq = recordWrite(identity);
    try {
      await navigator.clipboard.writeText(requested);
    } catch {
      // Clipboard unavailable (no HTTPS in dev, locked-down browser). The
      // password is still on screen in `.code-value` type for manual
      // transcription, which is the documented fallback (spec §7). Silent by
      // spec §4.2, and nothing to hand back: a success ALWAYS arms a window
      // (see deliverWrite), and window ownership is decided against the write
      // that ARMED the running window, so a write that never resolved — this
      // one included — has no bearing on the confirmations around it.
      return;
    }
    deliverWrite(dispatcher, seq, requested);
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
