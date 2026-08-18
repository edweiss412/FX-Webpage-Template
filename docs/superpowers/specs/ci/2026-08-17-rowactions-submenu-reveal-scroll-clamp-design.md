# Capped-submenu reveal scroll clamp — root cause and repair design

**Date:** 2026-08-17 · **Branch:** `fix/rowactions-submenu-reveal-flake` · **Ledger:** `BL-ROWACTIONS-SUBMENU-REVEAL-E2E-FLAKE` + `BL-ADVISORY-E2E-JOBS-FLAKE-ACROSS-IDENTICAL-CODE` (both marked IN PROGRESS on this branch)

## 1. Resolved scope — do not relitigate

- **This spec does not contradict PR #822's probe; it completes the falsification that probe called for.** The `BL-ADVISORY-E2E-JOBS-FLAKE-ACROSS-IDENTICAL-CODE` entry's revised first step says the repair direction "should assume [the transient-502 boundary-recovery class] and then falsify, not re-derive from scratch" (BACKLOG.md, that entry's "What the split means for scope" / "First scheduled step, revised" sections). §2's probes ran that falsification: the failing behavior reproduces 5/5 locally against a healthy dev server with zero gateway 502s in the log, and is deterministic at the product layer. The 502s in failing CI runs are a load correlate that shifts a test-side sampling race (§3), not the mechanism. The boundary-recovery posture rows (`BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION`, `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE`, `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`) are untouched by this spec and remain correct for their own surfaces.
- **The screenshots-drift half of the advisory entry is fenced OUT of this spec.** Its own nine-run fixed-sha probe did not reproduce (0/9, recorded in the entry by PR #822). No repair is designed on that evidence; disposition is a narrow successor row (§7), per the entry's own instruction to capture runner identity on recurrence before anything else.
- **Filtering panel-origin scroll events out of `AnchoredPortal`'s re-place path was considered and rejected.** It would close only one trigger of the defect (the reveal's own scroll event) while every other re-measure path — the per-render `useLayoutEffect` at `components/admin/AnchoredPortal.tsx:247-250`, resize, ResizeObserver, visualViewport — would still destroy scroll state. The class fix is scroll-neutral measurement (§4); after it lands, a re-measure triggered by the panel's own scroll is harmless, so the filter buys nothing and adds a second surface to review.
- **The shipped test's premise guards stay.** `tests/e2e/rowactions-geometry.spec.ts:346-354` already proves the panel is capped and scrolling before the assertion; this spec strengthens the *sampling moment* only (§5.1).
- **`CREW_SUBMENU_CAP`, the menu grammar, and `focusMenuItem`'s reveal math are correct and unchanged.** The reveal computes the right `scrollTop` (`components/admin/ShowRowActions.tsx:82-91`); the defect is that a later measurement destroys it.

## 2. Probes (all run 2026-08-17 on this branch at `d2d602588`, the `origin/main` base)

### 2.1 CI history (prior art, from the ledger — not re-run here)

- Eight runs of workflow `316007124` at byte-identical `app/**`/`components/**`: 5 green / 3 red on `rowactions-geometry.spec.ts:327` ("keyboard focus in a CAPPED submenu is revealed, never left off-screen"), failing at the line-368 assertion (`tests/e2e/rowactions-geometry.spec.ts:368`) with `Expected: <= 509.96875, Received: 587` (`BL-ROWACTIONS-SUBMENU-REVEAL-E2E-FLAKE`).
- Nine fixed-sha dispatches of `admin-layout-e2e` (distinct-ref method): 4/9 failed, every failure the same line-368 assertion (`BL-ADVISORY-E2E-JOBS-FLAKE-ACROSS-IDENTICAL-CODE`, PR #822).

### 2.2 P1 — browser primitive (deterministic, standalone page)

A `max-height: 200px; overflow-y: auto` div scrolled to `scrollTop = 150`, then put through the exact `measureAndApply` sequence (clear inline `maxHeight` → forced `getBoundingClientRect()` → restore):

```
afterSet:      scrollTop 150
duringClear:   height 600 (uncapped), scrollTop 0   ← layout with no cap clamps the offset
afterRestore:  height 200,            scrollTop 0   ← restore does NOT restore scroll
```

Second arm: a programmatic `scrollTop` write fires an async `scroll` event whose target is the box, and a `window` **capture-phase** listener observes it — the same listener shape as `AnchoredPortal.tsx:204-215`.

### 2.3 P2 — in-app timeline (5/5 deterministic)

An uncommitted probe spec (tests/e2e/probe-rowactions-geometry.spec.ts, this branch's working tree only — deleted before the implementation PR) reproduced the shipped test's setup, instrumented the submenu panel with a scroll-event recorder and a style-attribute MutationObserver **before** pressing `End`, then sampled 400ms later. Five repetitions, identical shape:

```
scrolls: [{t≈973, top:154}, {t≈982, top:0}]     ← reveal, then reset ~8ms later (next rAF)
styleMut: maxHeight writes bracketing both       ← measureAndApply's clear/restore
finalScrollTop: 0
activeBottom: 587, boxBottom: 433.375, revealed: false   ← every rep
```

The reveal ALWAYS reverts within one frame. This is a product bug for every keyboard user of a capped submenu, on every machine, 100% of the time — not an intermittent race.

### 2.4 P3 — shipped test, local (10/10 green on the same defective tree)

`playwright test --project=desktop-chromium tests/e2e/rowactions-geometry.spec.ts -g "CAPPED submenu" --repeat-each=10` (under `pnpm heavy`, dev server, port 3107): **10/10 passed**, ~1.2s each. The shipped test samples via two CDP `evaluate` round-trips immediately after the keypress; on a fast local machine the sample lands inside the ~8ms window before the reset, so the test goes green against a tree where the user-visible behavior is broken. CI's 2-core runner under prod-build load samples late more often — the measured 4/9. The "flake" is entirely the sampling race; the product defect underneath is deterministic.

## 3. Root cause

Chain, every link probed:

1. `End`/`ArrowDown` → `focusMenuItem` focuses with `preventScroll: true` and reveals by writing the panel's own `scrollTop` (`components/admin/ShowRowActions.tsx:82-91`; wired at `ShowRowActions.tsx:553` and `ShowRowActions.tsx:587`).
2. The write fires an async `scroll` event targeting the panel. `AnchoredPortal`'s window capture-phase listener sees it; the target is not the document, so it takes the re-place path and schedules `measureAndApply` on the next animation frame (`components/admin/AnchoredPortal.tsx:204-215`; `lib/popover/rafCoalescer.ts` schedules on `requestAnimationFrame`, never synchronously).
3. `measureAndApply` measures natural size by clearing the inline caps — `panel.style.maxWidth = ""` / `panel.style.maxHeight = ""` (`AnchoredPortal.tsx:136-139`) — then forcing layout. With no cap the panel has no scrollable overflow, so the browser clamps `scrollTop` to 0 (P1). Restoring the caps (`AnchoredPortal.tsx:155-156`) restores the box, not the offset.
4. Net: one frame after every reveal, the panel is back at `scrollTop 0` and the focused item sits below the fold (P2). The e2e assertion at `tests/e2e/rowactions-geometry.spec.ts:368` reads `active.bottom − box.bottom` ≈ `scrollHeight − clientHeight` past the fold — the CI failure's 77px.

The same clear-measure-restore shape exists at three more sites (class sweep, §4.3): `components/admin/HoverHelp.tsx:220-236`, `components/admin/showpage/ShareHub.tsx:287-309`, and `components/admin/useFitWithinClip.ts:83`. Those three are partially masked — their targets carry class-level caps (`max-h-[min(60vh,24rem)]` at `HoverHelp.tsx:578`, `max-h-[min(70vh,30rem)]` at `ShareHub.tsx:893`, the overlay's own cap read at `useFitWithinClip.ts:87`) so clearing the *inline* cap usually leaves the box capped — but whenever the applied inline cap is tighter than the class cap (short viewport), clearing it grows the box and partially clamps a scrolled offset the same way. Same defect shape, lower severity.

## 4. Design

### 4.1 The invariant

**Measuring a panel's natural size must not mutate its scroll state.** A measurement is a read; a read that writes is the defect class.

### 4.2 `withNaturalSize` helper — lib/popover/naturalSize.ts (new)

```ts
export type NaturalSizeProbe = {
  /** Height the element takes when constrained to `width` (border-box, class caps active). */
  heightAtWidth: (width: number) => number;
};

export function withNaturalSize<T>(el: HTMLElement, measure: (probe: NaturalSizeProbe) => T): T {
  const heldScrollTop = el.scrollTop;
  const heldScrollLeft = el.scrollLeft;
  const heldMaxWidth = el.style.maxWidth;
  const heldMaxHeight = el.style.maxHeight;
  el.style.maxWidth = "";
  el.style.maxHeight = "";
  try {
    return measure({
      heightAtWidth: (width) => {
        el.style.maxWidth = `${width}px`;
        const h = el.getBoundingClientRect().height;
        el.style.maxWidth = "";
        return h;
      },
    });
  } finally {
    el.style.maxWidth = heldMaxWidth;
    el.style.maxHeight = heldMaxHeight;
    if (el.scrollTop !== heldScrollTop) el.scrollTop = heldScrollTop;
    if (el.scrollLeft !== heldScrollLeft) el.scrollLeft = heldScrollLeft;
  }
}
```

Design points:

- The helper OWNS the clearing. Call sites contain no bare cap-clearing writes, which is what makes the meta-test in §4.4 a derived cover rather than an enumerated list.
- Scroll restore happens **after** cap restore (the range must exist again before the offset can be written back) and is conditional, so a measurement that never clamped writes nothing and fires no scroll event.
- Convergence: if the restore write does fire a scroll event, the next scheduled `measureAndApply` preserves the offset and writes nothing, so the cycle terminates after one extra measure. There is no oscillation because a write only happens when the browser clamped, and post-fix the browser's clamp is always undone to the same held value.
- If the panel legitimately shrank between measurements (viewport resize), the restore write is clamped by the browser to the new valid range — correct behavior, not a defect.
- `heightAtWidth` reproduces the three existing `wrappedHeightAt` bodies byte-for-semantics (`AnchoredPortal.tsx:146-151`, `HoverHelp.tsx:233-237`, `ShareHub.tsx:306-310`).

### 4.3 Call sites (class sweep — all four repaired in this PR)

| Site | Change |
| --- | --- |
| `components/admin/AnchoredPortal.tsx` `measureAndApply` (`AnchoredPortal.tsx:127-187`) | Clear/measure/restore block (`AnchoredPortal.tsx:136-156`) becomes a `withNaturalSize(panel, (probe) => …)` call; `wrappedHeightAt: probe.heightAtWidth`. The held-style locals go away. |
| `components/admin/HoverHelp.tsx` `measureAndApply` (`HoverHelp.tsx:214`) | Same mechanical rewrite of `HoverHelp.tsx:220-236`. |
| `components/admin/showpage/ShareHub.tsx` measurement (`ShareHub.tsx:287-309`) | Same mechanical rewrite. The post-placement cap SETS at `ShareHub.tsx:352-353` stay outside the helper — they are writes of a new cap, not measurement clears. |
| `components/admin/useFitWithinClip.ts` `apply` (`useFitWithinClip.ts:78-95`) | The clear at `useFitWithinClip.ts:83` and the reads through the computed-cap derivation move inside `withNaturalSize`; the final fitted `maxHeight` SET stays outside, after the helper returns. Scroll offset is preserved across the clear; the subsequent fitted SET can only clamp to a still-valid range. |

No site is deferred: the repair is the same one-shape mechanical rewrite at every peer, so no class-sweep exception applies.

### 4.4 Structural defense — derived cover, not a list

New meta-test tests/components/_metaScrollNeutralMeasurement.test.ts (new): filesystem-walk every `.ts`/`.tsx` under `components/` and `lib/` (excluding the naturalSize helper module itself and test files) and fail on any match of a cap-clearing assignment (`.style.maxHeight = ""` / `.style.maxWidth = ""`, string or template-literal empty). A NEW measurement site that bypasses the helper fails by default. The scanner walks the tree from disk — no enumerated file list to rot.

**Threat-model fence:** the scanner defends against accidental reintroduction by an ordinary contributor using the repo's established idiom (direct `style.maxHeight = ""` assignment — the only cap-clearing form that has ever appeared in this codebase; the class sweep in §3 found all four instances in exactly that spelling). Alternative spellings (`setProperty("max-height", "")`, an aliased style object) are adversarial-obfuscation shapes outside the fence and file to §8's documented limits, not to review rounds. **Consequence bound:** a site the scanner misses degrades to the pre-fix behavior on that one surface — a visible snap-to-top, recoverable by re-scrolling, never data loss or silent corruption. **Probe domain:** the live `components/` + `lib/` tree; an admissible false-negative probe is a cap-clearing write in that tree the scanner passes, one ordinary edit from the current idiom.

## 5. Test design

### 5.1 Strengthened e2e case (the RED)

The shipped case at `tests/e2e/rowactions-geometry.spec.ts:327-369` keeps its setup and premise guards and gains a settle before sampling:

```ts
await page.keyboard.press("End");
// Settle: the defect class this pins reverts the reveal on the NEXT animation
// frame (measureAndApply's clamp). Two rAFs put the sample on the far side of
// any scheduled re-measure, so the assertion reads the DURABLE state (the one
// the keyboard user is left looking at) instead of racing the revert.
await page.evaluate(
  () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
);
const revealed = await page.evaluate(() => { /* unchanged sampling body */ });
```

- **Concrete failure mode caught (anti-tautology statement):** a reveal that runs and is then reverted by a later re-measure. The pre-fix tree fails this deterministically (P2: revert lands ~8ms after the reveal, well inside two frames; 5/5 observed) where the shipped form passes by sampling early (P3: 10/10 green on the same defective tree). Post-fix it passes deterministically.
- The existing premise guards (`rowactions-geometry.spec.ts:346-354`: panel overflows its cap; fixture fills the cap) already make the case non-vacuous and are unchanged.
- RED validity: the failure derives from the production lines at `AnchoredPortal.tsx:136-139` (the clamp-inducing clears), not from any test-local fixture. `red-state=live` — the strengthened command fails on the current tree before any production edit.

### 5.2 Helper unit tests (jsdom)

tests/components/naturalSize.test.ts (new): restore-on-return and restore-on-throw (the `finally`), conditional scroll write (no write when unchanged — asserted with a spy on the setter via `Object.defineProperty`), `heightAtWidth` sets-then-clears `maxWidth`. jsdom computes no layout, so the *clamp* behavior is real-browser-only and is covered by §5.1; these tests pin the helper's contract, not the browser's.

### 5.3 What is NOT directly asserted

HoverHelp / ShareHub / useFitWithinClip scroll preservation gets no dedicated real-browser case. Coverage is: the shared helper's contract (§5.2) + the derived cover proving every site routes through it (§4.4) + the one real-browser integration proof on the acutest path (§5.1). Documented as a limit in §8.

## 6. Acceptance criteria

- **AC-1 (mechanism closed):** with the fix applied, the P2 probe timeline shows the reveal's `scrollTop` stable across ≥2 rAF + 400ms — no reset event. (Verified during implementation with the probe spec before it is deleted; the durable form of this check is AC-2.)
- **AC-2 (red→green):** the strengthened §5.1 case fails on the pre-fix tree and passes post-fix, `--repeat-each=10` locally, 10/10 both ways (10/10 red pre-fix, 10/10 green post-fix).
- **AC-3 (no regression):** the full `rowactions-geometry.spec.ts` file and the other three `admin-layout-e2e` spec files pass locally under the same invocation shape as CI (`--project=desktop-chromium`).
- **AC-4 (class closed):** `_metaScrollNeutralMeasurement` passes, and a deliberate reintroduction of a bare cap-clear (temporary mutant, not committed) fails it.
- **AC-5 (CI acceptance instrument, from the ledger entry):** nine fixed-sha dispatches of `admin-layout-e2e` on the implementation branch using PR #822's distinct-ref method (one dispatch per sibling ref; `cancelled` runs are not samples): 0/9 failures of the capped-submenu case, against the 4/9 baseline.
- **AC-6 (ledger):** dispositions of §7 land in the implementation PR.

## 7. Ledger dispositions

- **`BL-ROWACTIONS-SUBMENU-REVEAL-E2E-FLAKE`** — graduates to `BACKLOG-archive.md` with the fix. The archive entry records the correction of the filed hypothesis: the reveal was not "racing a settle and losing occasionally"; it ran correctly and was deterministically reverted one frame later by the placement re-measure. "A red on this leg alone is a re-run rather than a regression" stops being policy once AC-5 holds.
- **`BL-ADVISORY-E2E-JOBS-FLAKE-ACROSS-IDENTICAL-CODE`** — graduates with the fix (its reproducing half is this case). Its screenshots-drift half moves to a narrow successor row filed in the same PR:
  - **`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED`** — LOW, CI-INFRA. One observed `dashboard-overview-light.webp` byte drift (Bin 77670 → 82600) at `b5aa6ef7`; 0/9 reproduction at a fixed sha. Leading reading: a rare runner-population effect (bimodal capture environment), which a 0/9 sample cannot rule out. `**Reachability:** INFERRED, NOT PROBED` — the probe that settles it is capturing runner identity (`Runner.Name`, CPU model) on both outcomes at the next recurrence; that capture, not a repair, is the first scheduled step. No repair opens on the current evidence.

### 7.1 Dimensional Invariants

N/A — no fixed-dimension parent/child relationship is added or changed. The change is measurement plumbing: every class, token, markup structure, and applied placement value is byte-identical before and after. The existing dimensional behavior (panel capped by `applied.maxHeight`, `overflow-y-auto` scrolling) is pinned by the existing e2e geometry suite and unchanged.

### 7.2 Transition Inventory

N/A — no visual state is added, removed, or retimed. The only behavioral delta is that a scrolled panel's `scrollTop` survives a re-measure instead of being clamped; there is no animation on either side of that fix (the clamp itself was an instant, unintended jump).

## 8. Documented limits

- **Peer sites have no direct real-browser assertion** (§5.3). Worst case if the helper regresses at a peer: a scrolled tooltip/popover body snaps to top on a re-measure — visible, recoverable by re-scrolling, and the regression requires editing the helper or bypassing it, which the meta-test flags. Conservative posture + surfaced signal → documented limit, not a test gap to close now.
- **The low-rate screenshots-drift population effect is out of scope** by probe verdict (§1, §7).
- **`AnchoredPortal` still re-measures on panel-origin scroll events.** Post-fix this is a wasted-but-harmless measurement per user scroll frame inside a capped panel (the coalescer already bounds it to one per frame). Accepted; see the rejected alternative in §1.
- **The §4.4 scanner recognizes the direct-assignment idiom only.** A cap-clear written as `setProperty("max-height", "")` or through an aliased style reference passes the scanner (fence in §4.4). Worst case is the consequence bound: one surface regresses to a visible, recoverable snap-to-top. Accepted as a documented limit; widening the recognizer per obfuscation shape is the round-multiplier pattern AGENTS.md's repair-direction rule forbids.
- **CI's 2-core timing cannot be reproduced exactly locally.** AC-2's determinism claim rests on P2's mechanism timing (revert at next rAF, inside any two-frame settle), not on matching CI's scheduler; AC-5 is the CI-side proof.

## 9. Invariants checklist

- **Invariant 8 (UI gate):** `components/admin/*.tsx` are UI surfaces. The change is visually inert (measurement plumbing; zero class/markup/token edits), but the dual `/impeccable critique` + `/impeccable audit` gate runs on the affected diff at implementation, and the plan carries the `impeccable-gate:` closeout marker line.
- **Routing:** UI files → Opus + Claude Code implementer (AGENTS.md hard rule). This spec+plan session does not implement.
- **Arc F fence:** arc F will touch `components/admin/ShowRowActions.tsx`. This design touches `ShowRowActions.tsx` **not at all** (the fix lands in `AnchoredPortal.tsx`, peers, and `lib/popover/`); the e2e spec edit is in `tests/`. Implementation still serializes before arc F per the orchestrator brief.
- **Invariants 2/3/9/10 (locks, email, Supabase boundary, mutation telemetry):** no DB, no Supabase call, no mutation surface, no lock path touched. N/A.
- **Meta-test inventory (writing-plans rule):** CREATES tests/components/_metaScrollNeutralMeasurement.test.ts (§4.4) and tests/components/naturalSize.test.ts (§5.2), both new files. No existing registry extends.
