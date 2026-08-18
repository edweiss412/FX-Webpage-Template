# Capped-submenu reveal scroll clamp — root cause and repair design

**Date:** 2026-08-17 · **Branch:** `fix/rowactions-submenu-reveal-flake` · **Ledger:** `BL-ROWACTIONS-SUBMENU-REVEAL-E2E-FLAKE` + `BL-ADVISORY-E2E-JOBS-FLAKE-ACROSS-IDENTICAL-CODE` (both marked IN PROGRESS on this branch)

## 1. Resolved scope — do not relitigate

- **This spec does not contradict PR #822's probe; it completes the falsification that probe called for.** The `BL-ADVISORY-E2E-JOBS-FLAKE-ACROSS-IDENTICAL-CODE` entry's revised first step says the repair direction "should assume [the transient-502 boundary-recovery class] and then falsify, not re-derive from scratch" (BACKLOG.md, that entry's "What the split means for scope" / "First scheduled step, revised" sections). §2's probes ran that falsification: the failing behavior reproduces 5/5 locally against a healthy dev server with zero gateway 502s in the log, and is deterministic at the product layer. The 502s in failing CI runs are a load correlate that shifts a test-side sampling race (§3), not the mechanism. The boundary-recovery posture rows (`BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION`, `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE`, `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`) are untouched by this spec and remain correct for their own surfaces.
- **The screenshots-drift half of the advisory entry is fenced OUT of this spec.** Its own nine-run fixed-sha probe did not reproduce (0/9, recorded in the entry by PR #822). No repair is designed on that evidence; disposition is a narrow successor row (§7), per the entry's own instruction to capture runner identity on recurrence before anything else.
- **The self-origin scroll filter was first rejected, then REQUIRED by a round-5 probe — the decision is fenced in BOTH directions so neither side relitigates it.** The draft rejected filtering panel-origin scroll events as buying nothing once measurement is scroll-neutral. R5's probe-backed finding reversed that: the helper's clamp-and-restore emits at least one panel-origin scroll event per measurement, and a capture listener that re-places on every non-document scroll turns those events into a self-sustaining rAF re-measure loop on any scrolled capped panel (§4.5). So BOTH halves ship and NEITHER substitutes for the other: scroll-neutral measurement (without it, the reveal still resets via the per-render `useLayoutEffect` at `components/admin/AnchoredPortal.tsx:247-250`, resize, ResizeObserver and visualViewport paths, which no scroll filter sees) AND the self-origin filter at the two scroll-listening surfaces (without it, the restore's own events loop). Do not re-raise either half alone as sufficient.
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
styleMut: two style-attribute mutation batches,  ← measureAndApply ran at both moments
  timestamps adjacent to the two scroll events     (values are callback-time reads; the
                                                    clear/restore itself is proven by P1)
finalScrollTop: 0
activeBottom: 587, boxBottom: 433.375, revealed: false   ← every rep
```

The reveal ALWAYS reverts within one frame. This is a product bug for every keyboard user of a capped submenu, on every machine, 100% of the time — not an intermittent race.

### 2.4 P3 — shipped test, local (10/10 green on the same defective tree)

`playwright test --project=desktop-chromium tests/e2e/rowactions-geometry.spec.ts -g "CAPPED submenu" --repeat-each=10` (under `pnpm heavy`, dev server, port 3107): **10/10 passed**, ~1.2s each. The shipped test's post-keypress sample is a single CDP `evaluate` round-trip (`tests/e2e/rowactions-geometry.spec.ts:358`; the metrics `evaluate` at line 346 runs before the keypress); on a fast local machine that sample lands inside the ~8ms window before the reset, so the test goes green against a tree where the user-visible behavior is broken. CI's 2-core runner under prod-build load samples late more often — the measured 4/9. The "flake" is entirely the sampling race; the product defect underneath is deterministic.

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

/** Rejects promise-returning callbacks at the type level: the caps are restored
 * synchronously in `finally`, so an async measurement would silently run
 * against restored caps after its first await. */
type SyncOnly<T> = T extends Promise<unknown> ? never : unknown;

export function withNaturalSize<T>(
  el: HTMLElement,
  measure: (probe: NaturalSizeProbe) => T & SyncOnly<T>,
): T {
  const heldScrollTop = el.scrollTop;
  const heldScrollLeft = el.scrollLeft;
  const heldMaxWidth = el.style.maxWidth;
  const heldMaxHeight = el.style.maxHeight;
  el.style.maxWidth = "";
  el.style.maxHeight = "";
  let live = true;
  try {
    const out = measure({
      heightAtWidth: (width) => {
        if (!live) throw new Error("heightAtWidth escaped its withNaturalSize call");
        el.style.maxWidth = `${width}px`;
        try {
          return el.getBoundingClientRect().height;
        } finally {
          el.style.maxWidth = "";
        }
      },
    });
    // SyncOnly is best-effort (a union or `any` return distributes past the
    // conditional, R2 F1), so the sync contract is ALSO enforced at runtime:
    // a thenable return means the measurement continues after the caps are
    // restored, which is a silently wrong measurement, the exact defect class.
    if (
      out !== null &&
      (typeof out === "object" || typeof out === "function") &&
      "then" in (out as object)
    ) {
      throw new Error("withNaturalSize measure callback must be synchronous");
    }
    return out;
  } finally {
    live = false;
    el.style.maxWidth = heldMaxWidth;
    el.style.maxHeight = heldMaxHeight;
    if (el.scrollTop !== heldScrollTop) el.scrollTop = heldScrollTop;
    if (el.scrollLeft !== heldScrollLeft) el.scrollLeft = heldScrollLeft;
  }
}
```

Design points:

Design points:

- The helper OWNS the clearing. Call sites contain no bare cap-clearing writes, which is what makes the meta-test in §4.4 a derived cover rather than an enumerated list.
- Scroll restore happens **after** cap restore (the range must exist again before the offset can be written back) and is conditional, so a measurement on an unscrolled panel writes nothing and fires no scroll event.
- **Termination is NOT a property of the helper alone (R5 F1).** On a SCROLLED capped panel every measurement clamps and restores, emitting at least one panel-origin scroll event per pass — so any surface that re-places on non-document scroll events would loop at one forced measurement per frame, visually stable but never idle. Termination comes from the §4.5 self-origin filter at the two listening surfaces, and from the absence of any scroll listener at the other two sites (ShareHub re-places from visualViewport only, `ShareHub.tsx:409`; useFitWithinClip has no scroll listener).
- If the panel legitimately shrank between measurements (viewport resize), the restore write is clamped by the browser to the new valid range — correct behavior, not a defect.
- `heightAtWidth` reproduces the three existing `wrappedHeightAt` bodies byte-for-semantics (`AnchoredPortal.tsx:146-151`, `HoverHelp.tsx:233-237`, `ShareHub.tsx:306-310`), with its own `finally` so a throwing measurement cannot leave the probe width applied.
- **Lifetime is bounded (R1 F2, tightened R2 F1):** the callback is synchronous by type (`SyncOnly` rejects a direct async callback at compile time) AND by runtime check — `SyncOnly` distributes over unions, so `number | Promise<number>`, `unknown` and `any` returns pass the type gate, and the thenable check above closes them at runtime before the caller can await a measurement that would run against restored caps. The probe is inert after return — `heightAtWidth` throws once the `finally` has run, so an escaped probe cannot mutate restored caps later.
- **The helper restores the PRIOR inline caps; sites that end in a different cap state apply it explicitly after the helper returns (R1 F1).** Three of the four sites do not want the prior caps back: HoverHelp/ShareHub end with the PLACEMENT's caps (absent when the placement returns null), and useFitWithinClip's no-clipping-ancestor branch ends uncapped. Those sites follow the helper with a both-branch application — `style.maxHeight = `${v}px`` when the new cap exists, `style.removeProperty("max-height")` when it does not (same for max-width) — which reproduces today's observable end states exactly (today's clear leaves the property absent and the conditional set only writes non-null values). `removeProperty` in a null branch is placement APPLICATION, not measurement, and today's corresponding state is reachable only when the placement decided no cap is needed, i.e. the content fits and there is no scroll state to lose. AnchoredPortal needs no such application: React owns its style prop and writes/removes `maxHeight` per render from `applied`.

### 4.3 Call sites (class sweep — all four repaired in this PR)

| Site | Change |
| --- | --- |
| `components/admin/AnchoredPortal.tsx` `measureAndApply` (`AnchoredPortal.tsx:127-187`) | Clear/measure/restore block (`AnchoredPortal.tsx:136-156`) becomes a `withNaturalSize(panel, (probe) => …)` call; `wrappedHeightAt: probe.heightAtWidth`. The held-style locals go away. |
| `components/admin/HoverHelp.tsx` `measureAndApply` (`HoverHelp.tsx:214`) | Measurement (`HoverHelp.tsx:220-236`) moves inside `withNaturalSize(body, (probe) => …)`. The conditional cap SETS at `HoverHelp.tsx:290-291` become both-branch applications (px value or `removeProperty`) so a capped→uncapped placement still ends uncapped (R1 F1). |
| `components/admin/showpage/ShareHub.tsx` measurement (`ShareHub.tsx:287-309`) | Same rewrite as HoverHelp; the post-placement cap SETS at `ShareHub.tsx:352-353` become the same both-branch application, outside the helper. |
| `components/admin/useFitWithinClip.ts` `apply` (`useFitWithinClip.ts:78-95`) | The clear at `useFitWithinClip.ts:83` and the reads through the computed-cap derivation move inside `withNaturalSize`; the final fitted `maxHeight` SET stays outside, after the helper returns. Scroll offset is preserved across the clear; the subsequent fitted SET can only clamp to a still-valid range. |

No site is deferred: the repair is the same one-shape mechanical rewrite at every peer, so no class-sweep exception applies.

### 4.4 Structural defense — derived cover, not a list

New meta-test tests/components/_metaScrollNeutralMeasurement.test.ts (new): filesystem-walk every `.ts`/`.tsx` under `components/` and `lib/` (excluding the naturalSize helper module itself and test files) and fail on any match of a cap-clearing assignment (`.style.maxHeight = ""` / `.style.maxWidth = ""`, string or template-literal empty). A NEW measurement site that bypasses the helper fails by default. The scanner walks the tree from disk — no enumerated file list to rot. Negative self-tests pin what it deliberately does NOT flag: cap SETS (`= `${w}px``), `removeProperty` placement applications (§4.2), and the `= "none"` clone-capture spelling (§8).

**What the cover proves, stated precisely (R2 F2):** the scanner proves the ABSENCE of unsafe clears; it structurally cannot prove the PRESENCE of correct measurement, because an absent line matches nothing — deleting the natural-measure clear inside a helper callback (e.g. the `useFitWithinClip` derivation reading a stale fitted cap through `getComputedStyle`) produces zero scanner hits and SILENT wrong placement, outside the visible-snap consequence the fence names. Presence is therefore pinned behaviorally, per site, by the §5.4 transition pins — the scanner and the pins are two halves of one cover and neither substitutes for the other.

**Threat-model fence:** the scanner defends against accidental reintroduction by an ordinary contributor using the repo's established idiom (direct `style.maxHeight = ""` assignment — the only cap-clearing form on live MEASUREMENT paths; the class sweep in §3 found all four measurement sites in exactly that spelling. The `= "none"` spelling does exist in-tree, at `lib/devcapture/captureElement.ts:35` and `lib/devcapture/captureElement.ts:55`, but on DETACHED clones a capture utility styles and never measures for scroll — outside the invariant's reach, recorded in §8). Alternative spellings (`setProperty("max-height", "")`, an aliased style object) are adversarial-obfuscation shapes outside the fence and file to §8's documented limits, not to review rounds. **Consequence bound (present-clear shape):** an unsafe CLEAR the scanner misses degrades to the pre-fix behavior on that one surface — a visible snap-to-top, recoverable by re-scrolling, never data loss or silent corruption. (An ABSENT measurement step is a different shape with a silent consequence; it is closed by the §5.4 behavioral pins, not by this scanner — see the precise-scope statement below.) **Probe domain:** the live `components/` + `lib/` tree; an admissible false-negative probe is a cap-clearing write in that tree the scanner passes, one ordinary edit from the current idiom.

### 4.5 Self-origin scroll filter at the listening surfaces (R5 F1)

`AnchoredPortal`'s capture-phase scroll listener (`AnchoredPortal.tsx:204-215`) and HoverHelp's (`HoverHelp.tsx:328`) currently schedule a re-place for every non-document scroll target. Both gain a self-origin guard before the re-place branch: an event whose target is the measured panel/body **or a descendant of it** (`panel.contains(event.target)`) returns without scheduling. Rationale: a surface's own internal scroll cannot move its anchor, so re-placing on it was always semantically void — and after §4.2 it is the fuel of a perpetual measure loop. Document-scroll dismissal (AnchoredPortal) and ancestor-scroll re-placement (both) are unchanged.

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

tests/components/naturalSize.test.ts (new): restore-on-return and restore-on-throw (the `finally`), conditional scroll write (no write when unchanged — asserted with a spy on the setter via `Object.defineProperty`), `heightAtWidth` sets-then-clears `maxWidth` including on throw, the escaped-probe guard (`heightAtWidth` throws after return), the RUNTIME thenable rejection (a thenable-returning callback throws `must be synchronous` synchronously, caps restored — the R2 F1 union/`any` escape), and a `@ts-expect-error` case pinning the compile-time rejection of a direct async callback. jsdom computes no layout, so the *clamp* behavior is real-browser-only and is covered by §5.1; these tests pin the helper's contract, not the browser's.

### 5.3 What is NOT directly asserted

HoverHelp / ShareHub / useFitWithinClip scroll preservation gets no dedicated real-browser case. Coverage is: the shared helper's contract (§5.2) + the derived cover proving every site routes through it (§4.4) + the one real-browser integration proof on the acutest path (§5.1). Documented as a limit in §8.

### 5.4 Site-transition regression pins (R2 F2, discriminating shapes R3 F1)

The pins converge against a CLOSED three-family mutant set — the mutation-family-closure form. A reviewer-proposed FOURTH family is admissible only with a live escaping mutant against the shipped pins.

**Family A — dropped cap-application branch** (the R1 F1 restore-leak: a migrated site omits the null/`removeProperty` branch and a stale cap survives). Pinned by cap-STATE assertions:

- **HoverHelp:** the shipped standalone e2e case "maxWidth engages inside a NARROW pane host and is CLEARED when the host widens" (`tests/e2e/hoverhelp-geometry.spec.ts:409`), merge-gating via `standalone-e2e.yml`.
- **ShareHub:** extend `tests/components/admin/showpage/shareHubVisualViewport.test.tsx` with an uncapped-placement case — placement returns null caps, assert both inline properties ABSENT after apply.
- **useFitWithinClip:** extend `tests/components/admin/useFitWithinClip.test.tsx` with a fitted→unclipped transition — the stale fitted cap is removed, not retained.
- **AnchoredPortal:** N/A for family A — React owns the style prop and removes a null cap itself (§4.2); there is no hand-written application branch to drop.

**Family B — non-natural measurement** (a migrated site measures while a stale inline cap is still applied — the withNaturalSize call skipped or misplaced — so the placement core receives the CAPPED size and computes wrong placement). Cap-state assertions are blind to this family: an adversarial-review live-core probe showed both stale and natural measurements yielding null caps while placing at DIFFERENT coordinates (HoverHelp shape: stale y=194 vs natural y=244; ShareHub 308px right-aligned shape: stale-width x=166 vs natural x=142). Pinned by COORDINATE/SIZE assertions under style-sensitive rect stubs — the jsdom stub returns the element's capped dimensions while an inline cap is applied and its natural dimensions when cleared, so a measurement taken with the cap still on yields a visibly different applied placement:

- **AnchoredPortal:** extend `tests/components/admin/rowActions/anchoredPortal.test.tsx` (its selector-keyed prototype stub and explicit frame flushing already support per-case dynamic rects): place once so a cap is written, grow the available room via a position-only anchor move, flush frames, and assert the re-applied cap/position derives from the NATURAL height (strictly beyond the stale cap, with a premise pinning natural > stale so the assertion cannot pass vacuously).
- **HoverHelp + ShareHub:** one analogous case each in their jsdom suites (`tests/components/admin/hoverHelpBlurClose.test.tsx` or a sibling placement case; `shareHubVisualViewport.test.tsx`, whose `stubRect` becomes style-sensitive for the body), asserting the applied left/top derives from the natural size — the exact discriminator the review probe demonstrated.
- **useFitWithinClip:** a clipped→clipped EXPANSION case (R4 F1 — the fitted→unclipped transition cannot discriminate this family, because the live hook returns before the computed-cap read when no clipping ancestor exists, `useFitWithinClip.ts:85`): apply under a clipping ancestor (cap written, e.g. 322px in the review's live-formula probe), grow the clip's room, re-apply, and assert the cap equals the NEW larger fitted value (372px in that probe) — a capped measurement retains the stale fit and fails. The fitted→unclipped case remains the site's family-A pin only.

**Family C — dropped self-origin filter** (a migrated listening surface re-places on its own panel's scroll events; consequence: a perpetual one-measurement-per-frame loop on any scrolled capped panel — visually stable, never idle). Applies to the two scroll-listening surfaces only (AnchoredPortal, HoverHelp; §4.5). Pinned by loop-absence assertions:

- **AnchoredPortal, real browser:** the strengthened §5.1 case gains a second phase — after the settle and the reveal assertion, install a style-attribute MutationObserver on the panel, wait a further six animation frames, and assert ZERO additional `maxHeight` writes (the re-measure cadence is bounded, not per-frame). A dropped filter turns the restore's own scroll events into continuous measuring and fails it.
- **AnchoredPortal, jsdom:** one case in `anchoredPortal.test.tsx` dispatching a bubbling-free capture-phase scroll event targeted at the panel, flushing frames, and asserting no re-placement was scheduled — while a sibling assertion in the same case confirms an ANCESTOR-targeted scroll still re-places and a document-targeted scroll still dismisses (the filter must not widen).
- **HoverHelp, jsdom:** the analogous body-targeted-scroll case in its suite.

**Mutant validation at implementation (AC-7):** per site, every applicable deliberate temporary mutant — (A) drop the null-branch application (where one exists), (B) re-order/skip the natural-measure so measurement runs capped, (C) drop the self-origin filter (listening surfaces only) — each observed red against the site's pins, then reverted; all observations recorded in the task's commit message. The pins are regression pins, not REDs — the pre-migration tree passes them by design (current behavior is correct); their red condition is a defective migration.

## 6. Acceptance criteria

- **AC-1 (mechanism closed):** with the fix applied, the P2 probe timeline shows the reveal's `scrollTop` stable across ≥2 rAF + 400ms — no reset event. (Verified during implementation with the probe spec before it is deleted; the durable form of this check is AC-2.) The full naturalSize helper contract suite (§5.2) — including the runtime thenable-rejection case — is green and is a named part of this criterion.
- **AC-2 (red→green):** the strengthened §5.1 case fails on the pre-fix tree and passes post-fix, `--repeat-each=10` locally, 10/10 both ways (10/10 red pre-fix, 10/10 green post-fix).
- **AC-3 (no regression):** the full `rowactions-geometry.spec.ts` file and the other four `admin-layout-e2e` spec files (bell-panel-layout, admin-nav-layout-dimensions, nojs-loading-notice, needs-attention-holds; `.github/workflows/admin-layout-e2e.yml:175`) pass locally under the same invocation shape as CI (`--project=desktop-chromium`); `tests/e2e/hoverhelp-geometry.spec.ts` passes locally under its standalone config; the extended ShareHub and useFitWithinClip unit suites pass.
- **AC-4 (class closed):** `_metaScrollNeutralMeasurement` passes, and a deliberate reintroduction of a bare cap-clear (temporary mutant, not committed) fails it.
- **AC-5 (CI acceptance instrument, from the ledger entry):** nine fixed-sha dispatches of `admin-layout-e2e` on the implementation branch using PR #822's distinct-ref method (one dispatch per sibling ref; `cancelled` runs are not samples): 0/9 failures of the capped-submenu case, against the 4/9 baseline.
- **AC-6 (ledger):** dispositions of §7 land in the implementation PR.
- **AC-7 (transition pins, R2 F2 / R3 F1 / R5 F1):** the §5.4 pins exist per the family matrix (family A at its three sites; family B at all four; family C at the two listening surfaces), and each site's pins have been shown red against EVERY deliberate migration mutant that applies to it (drop-branch; capped measurement; dropped filter), recorded in the implementing commit.

## 7. Ledger dispositions

- **`BL-ROWACTIONS-SUBMENU-REVEAL-E2E-FLAKE`** — graduates to `BACKLOG-archive.md` with the fix. The archive entry records the correction of the filed hypothesis: the reveal was not "racing a settle and losing occasionally"; it ran correctly and was deterministically reverted one frame later by the placement re-measure. "A red on this leg alone is a re-run rather than a regression" stops being policy once AC-5 holds.
- **`BL-ADVISORY-E2E-JOBS-FLAKE-ACROSS-IDENTICAL-CODE`** — graduates with the fix (its reproducing half is this case). Its screenshots-drift half moves to a narrow successor row filed in the same PR:
  - **`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED`** — LOW, CI-INFRA. One observed `dashboard-overview-light.webp` byte drift (Bin 77670 → 82600) at `b5aa6ef7`; 0/9 reproduction at a fixed sha. Leading reading: a rare runner-population effect (bimodal capture environment), which a 0/9 sample cannot rule out. `**Reachability:** INFERRED, NOT PROBED` — the probe that settles it is capturing runner identity (`Runner.Name`, CPU model) on both outcomes at the next recurrence; that capture, not a repair, is the first scheduled step. No repair opens on the current evidence.

### 7.1 Dimensional Invariants

N/A — no fixed-dimension parent/child relationship is added or changed. The change is measurement plumbing: every class, token, markup structure, and applied placement value is byte-identical before and after. The existing dimensional behavior (panel capped by `applied.maxHeight`, `overflow-y-auto` scrolling) is pinned by the existing e2e geometry suite and unchanged.

### 7.2 Transition Inventory

N/A — no visual state is added, removed, or retimed. The only behavioral delta is that a scrolled panel's `scrollTop` survives a re-measure instead of being clamped; there is no animation on either side of that fix (the clamp itself was an instant, unintended jump).

## 8. Documented limits

- **Peer sites have no direct real-browser SCROLL-preservation assertion** (§5.3). Their cap-APPLICATION behavior is pinned by §5.4; what stays unasserted in a real browser is only the scroll-offset restore at HoverHelp/ShareHub bodies. Worst case if the helper regresses there: a scrolled tooltip/popover body snaps to top on a re-measure — visible, recoverable by re-scrolling, and the regression requires editing the shared helper, which the naturalSize unit suite pins. Conservative posture + surfaced signal → documented limit, not a test gap to close now.
- **The low-rate screenshots-drift population effect is out of scope** by probe verdict (§1, §7).
- **The `= "none"` cap-clearing spelling is not scanned for.** It is live in-tree only in the clone-capture utility (`lib/devcapture/captureElement.ts:35`, `lib/devcapture/captureElement.ts:55`), which styles detached clones it never scroll-measures. A contributor copying that spelling into a live measurement path would evade the scanner (one-ordinary-edit probe, in-domain); the consequence bound holds — a visible, recoverable snap-to-top on that one surface — so this files here rather than widening the recognizer.
- **A REMOVED measurement step is invisible to the scanner and its consequence is silent, not visible (R2 F2).** The scanner sees only present unsafe clears; §5.4's per-site transition pins (all three families) are the closing half for the absent-or-misplaced-measurement shape at the four shipped sites; the residual limit is a NEW measurement site authored later without a transition pin — bounded by review of any new measurement surface, and its worst case is stale-cap or stale-position placement on that one new surface.
- **The §4.4 scanner recognizes the direct-assignment idiom only.** A cap-clear written as `setProperty("max-height", "")` or through an aliased style reference passes the scanner (fence in §4.4). Worst case is the consequence bound: one surface regresses to a visible, recoverable snap-to-top. Accepted as a documented limit; widening the recognizer per obfuscation shape is the round-multiplier pattern AGENTS.md's repair-direction rule forbids.
- **The self-origin filter is scoped to the two live scroll-listening surfaces.** A FUTURE surface that both measures through the helper and subscribes to capture-phase scroll without the §4.5 guard reintroduces the loop; the §5.4 family-C pins cover the shipped surfaces, and a new listening surface is bounded by review plus the visible symptom (a busy main thread, not corruption).
- **CI's 2-core timing cannot be reproduced exactly locally.** AC-2's determinism claim rests on P2's mechanism timing (revert at next rAF, inside any two-frame settle), not on matching CI's scheduler; AC-5 is the CI-side proof.

## 9. Invariants checklist

- **Invariant 8 (UI gate):** `components/admin/*.tsx` are UI surfaces. The change is visually inert (measurement plumbing; zero class/markup/token edits), but the dual `/impeccable critique` + `/impeccable audit` gate runs on the affected diff at implementation, and the plan carries the `impeccable-gate:` closeout marker line.
- **Routing:** UI files → Opus + Claude Code implementer (AGENTS.md hard rule). This spec+plan session does not implement.
- **Arc F fence:** arc F will touch `components/admin/ShowRowActions.tsx`. This design touches `ShowRowActions.tsx` **not at all** (the fix lands in `AnchoredPortal.tsx`, peers, and `lib/popover/`); the e2e spec edit is in `tests/`. Implementation still serializes before arc F per the orchestrator brief.
- **Invariants 2/3/9/10 (locks, email, Supabase boundary, mutation telemetry):** no DB, no Supabase call, no mutation surface, no lock path touched. N/A.
- **Meta-test inventory (writing-plans rule):** CREATES tests/components/_metaScrollNeutralMeasurement.test.ts (§4.4) and tests/components/naturalSize.test.ts (§5.2), both new files. No existing registry extends.
