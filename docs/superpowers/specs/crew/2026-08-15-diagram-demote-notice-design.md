# Diagram demote notice — the sighted half of the fallback signal

**Date:** 2026-08-15 · **Authoring branch:** `docs/diagram-demote-notice-spec` · **Implementation branch:** `feat/diagram-demote-notice` · **Status:** DRAFT
**Entry:** `BL-DIAGRAM-DEMOTE-SIGHTED-PARITY` (BACKLOG.md, filed 2026-08-11) · **Effort:** S · **Parent contract:** `docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md` §4.1 · **Plan:** authored beside this spec in the plan directory docs/superpowers/plans/2026-08-15-diagram-demote-notice/ (same PR)

## §0 Why

The zoom gate loads a diagram's original only on zoom intent; when that fetch fails, the slide demotes back to the clamped tier and never re-pins (`components/diagrams/GalleryLightbox.tsx`, the `demotedRef` handler in the slide error path, which adds the id at line 872 and emits the announce entry). The demote announces ONCE, through the dialog's `role="log"` channel (`AnnounceLogRegion` at `components/diagrams/GalleryLightbox.tsx:588`; region semantics in `components/admin/announceLog.tsx:120`). A screen-reader user is told; a sighted crew member pinched a stage plot, the image stayed soft, and no pixel says why or that pinching again will not help — the parity gap backwards from the usual one. Exercised today by `tests/components/diagrams/galleryLightbox.zoomGate.test.tsx:503` ("a zoom-triggered original failure keeps the image and falls back to the clamped tier"), where the log entry is the only emitted signal.

## §1.1 Resolved scope — do not relitigate

1. **Ratified decision (Eric, 2026-08-15, orchestrator session; captured in the orchestrator's G3 scope brief, smalls-g3-signal-arcs.md in the session briefs directory, outside the repo).** A transient inline chip on the affected slide, copy direction "Full detail unavailable", mirroring what the sr-only `role="log"` region already announces. Ratified as a FAILURE NOTICE, explicitly OUTSIDE the parent spec's no-new-chrome decline: that decline covered a progress affordance during the sharpen (`docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md` §1.1); Eric settled the progress-affordance vs failure-notice boundary 2026-08-15. Chip lifetime, styling, and reduced-motion treatment are THIS SPEC's decisions, not user stops.
2. **Do not fold into `DIAGRAM-FAILURE-RECOVERY-1`.** Separate row, separate decision (the entry's own fold suggestion is superseded by the ratification above).
3. **Out of scope, named so reviewers do not fold them in:** `BL-DIAGRAMS-ANNOUNCE-CHANNEL-TTL` (announce-channel pruning) and `BL-LIGHTBOX-INACTIVE-SLIDES-IN-A11Y-TREE` (aria-hidden on inactive slides, current-slide marker) — separate rows, separate decisions. Also out of scope: any change to the demote MECHANISM itself (the `demotedRef` never-re-pin contract, the two load-bearing conjuncts, the buffered exit-window announce — all parent-spec territory), the announce copy, and the gallery grid's thumbnail failure handling.
4. **UI surface: the invariant-8 impeccable dual gate applies to the IMPLEMENTATION** (critique + audit on the unit diff; the plan carries it). No raw error codes in UI (invariant 5): the chip is plain copy, no code, no §12.4 row (component copy, not a machine-emitted error).
5. **Timing literals.** Any new timing value is a numeric literal in a named binding the interaction-timing scanner classifies, with its DESIGN.md §5.5 row landing in the same commit — the §5.5 population is derived by `scripts/scan-interaction-timings.ts` and pinned bidirectionally by `tests/docs/_metaInteractionTimingInventory.test.ts`; a sibling arc is making non-literal timing properties report `unclassified`, so no computed or imported-expression timing values.
6. **Autonomy: both user review gates WAIVED** (Eric's 2026-08-15 batch grant, kickoff brief). Stop only for a genuinely new question.

## §2 Design

### §2.1 State and trigger

The demote handler (the slide error path that adds to `demotedRef` and calls `onAnnounce`) additionally records the demote for rendering: a `demotedNoticeId: string | null` state (the affected item id), set at demote time, cleared by a timer. `demotedRef` stays a ref and keeps its identity-stability contract (`components/diagrams/GalleryLightbox.tsx:281` comment) — the chip does not read it; the chip has its own state because a ref cannot schedule a render and the chip must appear without waiting for an unrelated one.

- **Set:** in the same branch that calls `onAnnounce` (one demote = one chip = one announcement — the two channels stay in lockstep by construction).
- **Clear:** `setTimeout` of `DEMOTE_CHIP_VISIBLE_MS = 6000` (module-level `const`, numeric literal per §1.1 item 5; the name's `MS` suffix is what the scanner's named-binding form keys on). The effect owning the timer clears it on unmount and on re-fire (a second demote on another slide replaces the first chip and restarts the timer — last demote wins; two simultaneous chips would double-signal one event class).
- 6000ms rationale: longer than the interaction that triggered it (the user is mid-gesture), long enough to read eleven characters twice, short enough that the chip is gone before it reads as permanent chrome. A demote can fire at most once per slide per dialog session (`demotedRef` never re-pins), so the chip cannot loop.

### §2.2 Rendered chip (rendered element, not a description)

**Copy:** `Full detail unavailable` — the ratified direction verbatim; plain language (PRODUCT.md Design Principles item 5, PRODUCT.md:68), no period (chip label, not a sentence), no em dash (DESIGN.md §9), no technical vocabulary.

**Placement:** inside the affected SLIDE's relative container (each slide's figure wrapper), absolutely positioned `inset-x-0 bottom-2`, centered, `pointer-events-none` — so it floats over the image without reflowing the figure (the exact reasoning that placed the Reset chip absolutely, `components/diagrams/GalleryLightbox.tsx:604` comment block: a figure reflow mid-pinch slides the pinched detail out from under the user's fingers) and travels with the slide if the user swipes. Bottom edge, not top: the Reset chip owns the `top-2` slot (`components/diagrams/GalleryLightbox.tsx:618`) and both can be visible at once (the demote leaves the gesture and scale alone, so scale > 1 keeps Reset mounted).

**Styling:** the Reset chip's visual family minus interactivity: `rounded-pill border border-border-strong bg-surface-raised px-4 py-1.5 text-sm font-medium text-text-strong shadow-tile` (token-for-token from `components/diagrams/GalleryLightbox.tsx:634`, minus the tap-target and hover/focus classes — this chip is not interactive, receives no focus, and is NOT a button). No new tokens, no new colors, so no new contrast pin (DESIGN.md §1 tokens already carry the pinned ratios for `text-text-strong` on `bg-surface-raised`).

**A11y:** `aria-hidden="true"` on the chip. The `role="log"` region already carries this exact event to assistive technology (with the richer named copy — the buffered exit-window delivery contract at the announce call site); a visible unlabeled twin would double-announce one event. The chip is the SIGHTED channel; parity means each channel says it once. Not focusable, `pointer-events-none`, so the focus trap and the keyboard map are untouched. `data-testid="lightbox-demote-chip"`.

### §2.3 Transition Inventory

Chip states: absent / visible. All pairs plus compounds:

| Transition | Treatment |
|---|---|
| absent to visible (demote fires) | fade-in via CSS `opacity` transition consuming `duration-fast` + `ease-out-quart` tokens (DESIGN.md §5.1/§5.2); under `prefers-reduced-motion` the token collapses to 0ms for free (§5.3 — tokens, never hardcoded ms, are the whole mechanism) |
| visible to absent (timer expires) | instant unmount — no exit animation, declared deliberately: an exit fade needs exit-presence machinery for a one-line chip, and a quiet disappearance is the point (nothing new demands attention) |
| visible while user swipes to another slide (compound) | chip is inside the affected slide's container and scrolls WITH it; no per-slide state change. Returning within the lifetime shows the remainder of its window |
| visible while dialog closes (compound) | unmounts with the dialog; the timer's effect cleanup clears it. The parent spec's buffered exit-window announce still delivers the sr message; the chip may never paint in that window — accepted (§4 limit 2) |
| second demote on another slide while visible (compound) | last demote wins: state replaces id, timer restarts (§2.1) |
| Reset chip visible simultaneously (compound) | disjoint slots (top-2 vs bottom-2); no interaction |

### §2.4 Dimensional Invariants

None introduced. The chip is absolutely positioned inside the slide's existing relative container, out of flow: it can neither stretch a parent nor be stretched, and no fixed-dimension parent/flex-child relationship is created. The existing real-browser geometry gate over the gallery (`tests/e2e/crew-layout-dimensions.spec.ts`, per the parent spec's "None new" §Dimensional note) is unaffected; the writing-plans layout-dimensions task is N/A (declared here so the plan states it rather than silently skipping it).

### §2.5 What does NOT change

The demote mechanism (conjuncts, `demotedRef`, never-re-pin), the announce copy and its buffered delivery, the `role="log"` channels and their (absent) TTLs, slide mounting/aria exposure, the Reset chip, the zoom keymap, the loader, and every server component. No new dependency.

## §3 Acceptance criteria

- **AC-1 (chip on demote).** Driving the zoomGate demote path (the existing `galleryLightbox.zoomGate.test.tsx:503` scenario) renders the chip on the affected slide with the exact copy, `aria-hidden="true"`, and `pointer-events-none`; the announce entry still fires (both channels, one event).
- **AC-2 (transient).** After `DEMOTE_CHIP_VISIBLE_MS` (fake timers), the chip is gone. Expected value derived from the exported constant, not a re-typed literal (anti-tautology).
- **AC-3 (no chip without demote).** A slide that loads its original, and a slide whose CLAMPED tier fails (the placeholder path, not the demote path), render no chip.
- **AC-4 (a11y untouched).** The chip is absent from the accessibility tree (aria-hidden); the dialog's focus order and the `role="log"` region's entries are unchanged by its presence (assert the region's entry count and the focus sequence around the chip's window).
- **AC-5 (timing inventory).** The new constant appears in the regenerated DESIGN.md §5.5 table in the same commit; `tests/docs/_metaInteractionTimingInventory.test.ts` green both directions.
- **AC-6 (reduced motion).** The fade-in consumes duration tokens only — assert the chip's class list names the token utility and carries no literal ms value (the §5.3 collapse then covers it by construction; jsdom cannot compute the media query, so the assertion pins the mechanism, not the computed value).
- **AC-7 (impeccable dual gate).** `/impeccable critique` + `/impeccable audit` on the implementation diff; P0/P1 fixed or DEFERRED-entried; the plan's closeout carries the `impeccable-gate:` marker line.
- **AC-8 (ledger).** `BL-DIAGRAM-DEMOTE-SIGHTED-PARITY` archives on the implementation PR's merge; markers strip per invariant 12.

## §4 Documented limits

1. **The chip names no diagram and explains nothing further.** Eleven characters on the affected slide, `aria-hidden`; the richer named copy lives in the sr channel. A sighted user who wants detail has the visibly-soft image itself as context. Deliberate: the ratified direction is a chip, not a banner.
2. **A demote inside the dialog's exit window may show no chip** (the dialog is unmounting; the sr announce is buffered and delivered to the gallery channel per the parent contract). Conservative: the user who closed the dialog is not looking at the slide.
3. **The chip does not persist across dialog sessions.** Re-opening the lightbox on a demoted slide shows the clamped tier with no chip; the demote already happened and announcing it again on every open would make a one-time failure read as a permanent banner. The never-re-pin contract means no fresh demote can fire for that slide, so the signal is genuinely once-per-failure.
4. **Simultaneous demotes collapse to the latest** (§2.1 last-wins). Two originals failing in one 6-second window is a network-outage shape; the second chip carries the same message the first did.

## §5 Test surface (plan owns the details)

Extend `tests/components/diagrams/galleryLightbox.zoomGate.test.tsx` (the demote path is already driven there — RED validity: AC-1..AC-4 assertions fail on the live tree because no chip markup exists; the production line whose absence makes them fail is the chip render branch in the slide body). Fake timers for AC-2; the timing-inventory meta-suite for AC-5. The impeccable dual gate is the visual check; no screenshot baseline captures a demoted lightbox slide (verify against the capture manifest at plan time — no regen expected).

## §6 Sequencing

Authoring PR (spec + plan + HANDOFF, docs-only, preflight skip declared) merges first; implementation branch `feat/diagram-demote-notice` is created by the authoring session with the claim handed off before the authoring PR releases it (invariant 12, no undeclared instant). A fresh Opus pane implements from `HANDOFF.md` (UI work is Opus-owned per the AGENTS.md hard rule). The implementation plan carries the invariant-8 dual gate; its closeout marker line is `impeccable-gate:` with both halves recorded.
