# Arc A closeout — a11y/privacy cluster

**Branch:** `feat/a11y-privacy-cluster` · **Date:** 2026-08-07 · **Spec:** `docs/superpowers/specs/2026-08-06-arc-a-a11y-privacy.md` · **Plan:** `plan.md` in this directory

All four claimed entries are archived. Three to `BACKLOG-archive.md`
(`BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK`, `BL-LIVE-REGION-AST-WALK-RESIDUE`,
`BL-CHANNEL-ANNOUNCER-RESIDUAL-ROLE-STATUS`), one to `DEFERRED-archive.md`
(`SHARELINK-CUE-VISIBILITY-1`).

---

## 12. Impeccable dual gate — findings and dispositions

Setup gates ran BEFORE the first component edit (invariant 8): `context.mjs`
context load (PRODUCT.md + DESIGN.md) → `reference/product.md` register read.
Both halves ran as isolated parallel sub-agents, so neither anchored the other.

### 12.1 Critique (Assessment A design review + Assessment B detector evidence)

**AI-slop verdict: not slop.** No decorative additions, no invented copy, no
generic scaffolding. Assessment B: detector exit 2 with **one** finding, and it
is a **false positive on a five-week-old docblock** —
`step3ReviewSections.tsx:3673` matched the literal `<img>` inside
`/** One thumbnail tile — raw <img> + onError placeholder …` (provenance
`b0d347e7a`, 2026-07-04; absent from this diff). The file's real `<img>` carries
a populated `src`, `alt`, `loading`, `decoding`, and an `onError` placeholder,
and was correctly not flagged. The same rule fired twice on
`step3ReviewSections.test.tsx` during editing, also false positives — there the
match was the string `"img"` inside `querySelector("img")` assertions.

**Net: zero detector findings attributable to this branch.**

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | Travel section-level empty state asserts a falsehood: "No travel details on file yet." became reachable for a viewer who HAS travel data | P1 | **FIXED** (`2cdcdb469`) |
| 2 | Withheld dates carry no in-section explanation in the PARTIAL case | P1 | **DEFERRED** — `TRAVEL-SUPPRESSION-PARTIAL-EXPLANATION-1` |
| 3 | Names-only ground leg renders a blank primary line | P2 | **FIXED** (`2cdcdb469`) |
| 4 | Publish-error now leads the footer, adjacent to "All clear to publish" | P2 | **FIXED** (`2cdcdb469`) |
| 5 | Undated flight segments lose their only delimiter and all emphasis | P2 | **DEFERRED** — `TRAVEL-FLIGHT-SUPPRESSED-LEGIBILITY-1` |
| 6 | ShareHub cue fires on REMOTE rotations too, moving the popover under an operator who did nothing | P3 | **REJECTED, recorded** (below) |
| 7 | `testId="admin-undo-status"` now disagrees with its own "Status updates" label | P3 | **NOT FIXED, recorded** (below) |

**Finding 1 is the one that mattered, and it is a defect this arc introduced.**
Before the change a dates-only reservation still rendered its dates, so
`hasHotels` was true and the section-level empty state could not appear for a
viewer with travel data. Suppression made it reachable, and the shipped copy
would have told a crew member their travel is unbooked when it is booked and
merely withheld — they would chase the admin for data that already exists. The
copy now branches on whether suppression caused the emptiness, derived from the
UNFILTERED inputs because that is the only place the difference survives.

**Finding 6, rejected with reasons, so it is not re-raised.** The scroll follows
`flash`, and the flash cue's ratified contract ALREADY fires on remote
rotations — that is what `share-hub-remote-rotate-announce` exists for. A remote
rotation is exactly when an operator most needs to know the link they are looking
at is dead, so following it with the scroll is consistent rather than surprising.
`block: "nearest"` also means no movement at all when the row is already visible.

**Finding 7, not fixed:** the testid is referenced across unit pins, e2e
locators, and two DEFERRED entries; renaming it is churn with no user-visible
effect. The label is what a screen-reader user hears and it is now accurate.

### 12.2 Audit (technical quality)

**19/20 — Excellent.** Accessibility 3, Performance 4, Theming 4, Responsive 4,
Anti-Patterns 4. **P0: 0 · P1: 0 · P2: 3 · P3: 5** (2 of the P3s pre-existing).

Premises the audit verified rather than assumed, recorded because each was a
real risk in this diff:

- **`sr-only` does not use `display:none`.** Tailwind v4 emits
  `position:absolute; width/height:1px; clip-path:inset(50%); overflow:hidden`,
  so every hoisted region stays announceable while hidden — and being absolute,
  none of the four hoists adds a stray flex gap.
- **`display:contents` on the step3 `<form>` is safe.** The form has no
  accessible name, so HTML-AAM maps it to `generic`, not `role=form`; there is
  nothing to drop from the AX tree. Submission is DOM-owner-based and
  unaffected, and `aria-controls={formId}` now resolves to an element that
  exists, which is a fix rather than a cost.
- **All five stripped `role="status"` attributes have a live replacement**, and
  the sixth strip (the undo-all confirm prompt) is correctly unwired because
  focus is moved into it (`keepChangesRef.current?.focus()`).
- **Heading and landmark structure unchanged**; no new interactive elements, so
  the 44px tap-target rule has no new surface.

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | `suppressionEmptiedSection` true whenever a reservation existed, so a contentless DATELESS reservation would claim dates were hidden | P2 | **FIXED** (`900c49a94`) |
| 2 | Scroll cue may push the focused rotate control out of the popover band (WCAG 2.2 SC 2.4.11) | P2 | **DEFERRED** — `SHARELINK-CUE-FOCUS-OBSCURED-1` |
| 3 | Document-wide `querySelector` for the popover where `panelRef` exists | P3 | **FIXED** (`900c49a94`) |
| 4 | Collapsed report status sits in browse-mode reading order with no context | P3 | **NOT FIXED, recorded** (below) |
| 5 | MaterializeCard's region now atomically announces the raw `font-mono` reason/message | P3 | **NOT FIXED, recorded** (below) |
| 6 | Straight apostrophe in `"Couldn't update the publish selection."` | P3 | **PRE-EXISTING**, relocated only |
| 7 | Em dash in `"Sent — thanks. The developer will take a look."` | P3 | **PRE-EXISTING**, re-indented only |

**Audit finding 1 was a defect in the critique fix from the previous commit,**
pointed the other way: blaming suppression for an emptiness it did not cause is
the same falsehood mirrored. It now keys on whether a DATE actually existed.

**Audit finding 2 is filed with `**Reachability:** INFERRED, NOT PROBED`** and
names the probe that would settle it, per the ledger filing bar. The obvious
repair fights the feature — the cue exists to move the view OFF the rotate
control — and whether the residual case is a real 2.4.11 failure turns on a
reading the arc did not settle (2.4.11 is written about content covering the
focused element, not author-initiated scrolling).

**Audit finding 4, not fixed:** clearing the status on collapse would delete the
outcome a returning operator needs, which is the behaviour three existing pins
protect (`T-D3a`, `T-D3b`). The better repair is a copy prefix, which is a
clarify pass rather than an a11y-mounting fix.

**Audit finding 5, not fixed:** MaterializeCard is a developer-panel surface
where invariant 5's no-raw-codes rule explicitly does not bind (the raw reason is
the instrument's whole point). The region's widened announce is the intended
consequence of making it announce at all.

**Findings 6 and 7 are pre-existing** and belong to the in-flight em-dash arc
(`feat/l-wave-emdash`, PR #722) rather than a duplicate filing here. Neither was
introduced by this diff; finding 7's line appears in the diff only because a
wrapper change re-indented it.

### 12.3 Mechanical pre-code UI checklist

Run per component edit and re-verified over the whole diff:

- **Em dash in NEW user-visible copy: 0.** 31 added lines contain `—`; all are
  code comments or comment continuations, verified individually.
- **New tap targets: none.** No `<button>`, `<a>`, `role="button"`, or `onClick`
  in added lines, so no new 44px surface.
- **Arbitrary Tailwind values: 0.** No `bg-[`, `text-[#`, `shadow-[`, `z-[`.
- **Canonical classes only**; `flight-next-chip` keeps `text-accent-on-bg`
  (5.34:1) rather than raw `text-accent` (2.23:1) per DESIGN.md §1.1.
- **ESLint:** 0 errors, 6 warnings, all pre-existing and none in changed lines.

### 12.4 Browser visualization

**Skipped, with the fallback signal stated.** The target is a source diff across
11 files with no single viewable URL that exercises them together, and a local
server here would contend with a sibling worktree on the documented `:3000`
cross-worktree pollution failure mode. Rendered-layout evidence for the one
surface that needed it came instead from the real-browser e2e case added in T4.

---

## 13. Transition audit (spec §2.4 Transition Inventory)

The spec's inventory is 3 state pairs in both directions plus 4 compound rows.
Every row maps to a RED case or an explicit instant/unreachable declaration.
The compounds were written BEFORE the implementation, not after it, because the
rAF bookkeeping they pin is implementation the GREEN had to carry.

| Inventory row | Where it is discharged |
|---|---|
| idle → flash-active (rotation confirmed) | RED: "fires on the null → non-null flash edge, targeting the URL ROW" |
| flash-active → mid-scroll (rAF fires) | RED: the same case plus the reduced-motion pair pinning `behavior` |
| mid-scroll → flash-active (glide completes) | **Declared: native completion.** No code, no listener — nothing observes scroll end, which is itself the assertion (no cancellation path exists to test) |
| flash-active → idle (timer / close / deactivate) | RED: "the flash timer expiring neither cancels a delivered scroll nor re-fires one" |
| idle ↔ mid-scroll (direct) | **Declared unreachable by construction.** Mid-scroll is entered only from flash-active; a clear mid-glide is the compound row below, not a direct pair |
| Compound: timer expires mid-glide | RED: the flash-clear case above (one scroll delivered, none re-fired) |
| Compound: re-rotation mid-flash or mid-glide | RED: "fires AGAIN on n → n+1" and "a double bump before the frame fires yields exactly ONE scroll" |
| Compound: popover closes mid-scroll | RED: "closing the popover before the frame fires yields NO scroll and no throw" |
| Compound: rotation while scrolled anywhere | e2e: the geometry premise scrolls the popover to its end before rotating, then asserts `scrollTop` decreased |

**Structural half:** the effect adds NO conditional render, so the
`pageTransitions` instant-pin registry is untouched and its suite green is the
proof. The two new conditional sites in `step3ReviewSections.tsx` carry their
`§D2 instant — deliberate` markers, which the source-marker audit requires.

**Dimensional invariants:** none new, as the spec predicted. The arc introduces
no fixed-dimension parent with flex/grid children; scrolling mutates `scrollTop`,
not layout.

---

## 14. Acceptance criteria

- **AC-A1 (travel leak):** met. Three sites gated; five flight paths covered
  (structured date, `dateRaw` fallback, Today/Next chip, next-row highlight,
  raw-fallback rows withheld). Post-suppression visibility re-derives at every
  site. Four non-suppression twins pin the other viewer arms. Entry archived with
  all four sites dispositioned — three fixed, the roster label ruled Option A.
- **AC-A2 (live regions):** met. All four PENDING rows resolved by repair; map
  empty again; walk-blindness limit re-homed to the guard-file docblock.
  `Step3ReviewModal` deliberately does not go clean (its dev-capture region
  remains), so its row came off by hand with `REGISTERED_SITES` 2 → 1 pinning the
  residue.
- **AC-A3 (channel announcer):** met. Three uncovered outcomes wired,
  RoleRecognize variant-correct across all three saved states, five attributes
  stripped, confirm-prompt no-wire reason recorded, announce log renamed at all
  four production sites with every pin updated. `CHANNEL_ANNOUNCE_CALLS`
  RoleRecognize 1 → **3** (measured; the plan forecast 2 assuming one shared
  call — stale and conflict each announce on their own branch).
- **AC-A4 (share-link cue):** met. Scroll on every flash edge, smooth by default
  and instant under reduced motion, e2e green on the 390x560 harness with its
  geometry premise asserted first, jsdom edge/non-edge/compound cases green,
  transition inventory discharged above, entry graduated.
- **AC-A5 (process):** claim handoff with no undeclared instant; TDD per task;
  conventional commits; dual gate run with P0/P1 fixed or DEFERRED-entried;
  marker line below; cross-model diff review and CI green tracked in the PR.

Both halves ran 2026-08-07 on the arc A implementation diff (11 UI-surface
files), each as an isolated sub-agent.

`p0`/`p1` are the counts RAISED at the gate, not the counts remaining — the
grammar's own cross-check makes that explicit, since it requires
`dispositions=none` exactly when the two are zero. Zero P0s; two P1s, both from
the critique, both dispositioned: the Travel empty-state falsehood was FIXED
in-branch (`2cdcdb469`) and the partial-suppression explanation was DEFERRED with
a ledger entry naming why the closing diff cannot settle it. Nothing P0 or P1
ships unhandled.

Across both halves: five findings fixed in-branch, three deferred with entries
(`TRAVEL-SUPPRESSION-PARTIAL-EXPLANATION-1`,
`TRAVEL-FLIGHT-SUPPRESSED-LEGIBILITY-1`, `SHARELINK-CUE-FOCUS-OBSCURED-1`), and
four recorded above as rejected-with-reasons or pre-existing.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded
