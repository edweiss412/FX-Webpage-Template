# BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y — new-tab announcement family sweep · Handoff / close-out

**PR:** #592 · **Branch:** `fix/newtab-announcement-family` · **Spec:** `docs/superpowers/specs/2026-07-25-newtab-announcement-family.md` · **Date:** 2026-07-25

PR2 of the 6-PR `BL-NULLCODE-STAMP-BATCH-2 residuals` sequence (PR1 = #587). Closes the announcement half of `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y`; the tap-target half shipped earlier.

## What shipped

Every external link in `components/` and `app/` now tells screen-reader users it opens a new tab. The `↗` glyphs and external-link icons that told sighted users are all `aria-hidden`, so 21 of 23 anchors announced nothing.

- `components/shared/NewTabHint.tsx` — one visually-hidden `(opens in a new tab)` span, so the copy exists once across 15 call sites.
- 11 Group A anchors: sibling space + the hint. 6 Group B anchors: phrase appended to an existing `aria-label`. 4 Group C anchors: hint gated on `action.external` (they are same-app links when false).
- 3 WCAG 2.5.3 (Level A) label-in-name failures fixed: `step3ReviewSections.tsx` and the crew-facing `SourceLink.tsx` read "In sheet" while their labels never contained it; `VenueMapTile.tsx` reads "Directions" while its label never contained that.
- 2 bare `→` glyphs wrapped `aria-hidden` in `Step2Verify.tsx`; `rel` normalized on 3 anchors.
- `tests/styles/_metaNewTabAnnouncement.test.ts` + `tests/styles/_newTabScan.ts` — per-anchor TSX AST guard, 53 tests.

## §12 — UI close-out (impeccable v3 dual-gate)

**Invariant 8 applies by path:** the diff touches `components/**` and `app/admin/show/[slug]/CrewPageLink.tsx`. Both gates were **run** via independent subagents (per the standing owner request that this gate always uses subagents), each performing the canonical setup: `context.mjs` context load (PRODUCT.md + DESIGN.md) then the `product.md` register reference.

Both returned **NEEDS-WORK**. Findings and dispositions:

| # | Gate | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | audit | **P0** | `tests/components/a11y/newTabAnnouncementBehavior.test.tsx` fixture used `occurrences` (real field `occurrenceCount`, `lib/admin/attentionItems.ts:62`) and omitted `params`/`raisedAt`/`autoClearNote`/`errorCode`; `tsc` exit 1, would have failed `quality.yml` | **FIXED** — I had linted the new file but never typechecked it |
| 2 | audit | P1 | `format:check` red on the same file | **FIXED** |
| 3 | critique | P1 | Separator invariant unenforced — deleting the space before a hint left the whole suite green, silently producing `"Open in Sheet(opens in a new tab)"` (mutation-proven) | **FIXED** — AST rule requiring a real sibling space, covering all 15 sites; same mutation now fails with a precise message |
| 4 | critique | P2 | **Visible regression**: wrapping `Step2Verify`'s arrows cost 4.05px of word-space (134.08→130.03px, Chromium@16px), arrow touching the preceding letter — both anchors are gap-less `inline-flex`, so the wrapped glyph became its own flex item and the prior text run's trailing space was trimmed. jsdom cannot see it | **FIXED** — `&nbsp;` inside the aria-hidden span; spec §5.1's "dimensionally inert" claim corrected (true for the absolute hint span, false for a wrapped inline glyph in a flex parent) |
| 5 | critique | P2 | Label copy: new sheet labels dropped the destination app that the spec's own cited precedent uses (`Step3SheetCard.tsx:152` says "in Google Sheets"), and "In sheet, open the source sheet" repeated "sheet" three times | **FIXED** — all four sheet labels name Google Sheets; `VenueMapTile` became "Directions to the venue in Google Maps", avoiding a comma splice |
| 6 | audit | P3 | Ternary fallbacks guarded falsy, not blank: `title=" "` yielded `for   (opens...` | **FIXED** — `.trim()` guards |
| 7 | audit | P3 | `step3ReviewSections.tsx` DiagramTile still bare `rel="noreferrer"` | **FIXED** — normalized |
| 8 | critique | P3 | Diagram link exposes its name via both the anchor `aria-label` and the inner `img alt` | **DEFERRED** — `DEFERRED.md` › `NEWTAB-A11Y-RESIDUE-1(a)`. Fixing it reverses a previously accepted audit fix that a test explicitly pins; that is a separate reviewed decision, not a mid-sweep edit |
| 9 | audit | P3 | `BellPanel.tsx` "View in telemetry ↗" is internal, now the only `↗` that does not mean new tab | **DEFERRED** — `NEWTAB-A11Y-RESIDUE-1(b)`; out of family (no `target`, so the guard does not see it) |
| 10 | audit | — | 8 `broken-image` detector hits (`VenueMapTile`, `step3ReviewSections`) | **NOT A FINDING** — pre-existing `<img onError>` guards on map tiles/thumbnails, untouched by this diff; independently confirmed by a peer scan |

Audit verification worth recording: `.sr-only` compiles to `position:absolute; 1×1px; clip-path:inset(50%); visibility:visible` — clip-based, **not** `display:none`, so the hint genuinely contributes to the accessible name. Chromium CDP `Accessibility.getFullAXTree` over 7 real anchor shapes returned exactly `"<label> (opens in a new tab)"` each time, single space, no empties. At 320px and 390px the anchors' `getBoundingClientRect` was identical to 3dp with and without the hint, including inside `gap-*` and `truncate` parents.

## Cross-model review (whole diff)

Codex, fresh-eyes, on the full implementation: **BLOCKING** — 3 BLOCKING + 4 HIGH + 1 MEDIUM + 1 LOW, all execution-verified by transpiling the scanner in memory. Every finding was real and is fixed in `fe8890697` and the commits after it:

- **The guard failed OPEN on seven shapes.** Unresolvable spreads (`<a {...externalLinkProps}>`) returned zero anchors instead of failing closed; `some`-based gating let `external && ready` satisfy `external`; a single overwritten `conditions` value let an unconditional hint hide behind a gated one; `!e` did not match `!(e)`; only the FIRST phrase was stripped, so `"(opens…) (opens…)"` passed; any substitution counted as a destination, so `` `${""} (opens…)` `` passed; and the valid `external ? "Go (opens…)" : "Go"` was wrongly rejected.
- Hidden-attribute classification was presence-based, so `hidden={false}` was rejected while Tailwind `invisible` and anchor-level `hidden` were missed.
- Exemptions were an unparsed substring window, so `data-note="no-newtab-announcement:"` suppressed a finding and a reasonless marker was accepted.
- The §6.8 copy census was specified but never implemented.
- This handoff did not exist (invariant 8 requires the §12 record) and `BACKLOG.md` was not closed.

Each is now pinned by a named regression self-test. The scanner was extracted to `tests/styles/_newTabScan.ts` so probes and the guard share one implementation — the reviewer had to transpile a test file to exercise it, which was a design smell.

## Cross-model review — three rounds, and a design change in the third

**R1: BLOCKING.** 3 BLOCKING + 4 HIGH + 1 MEDIUM + 1 LOW, all real, all fixed. The guard was
failing OPEN on seven shapes, including `<a {...externalLinkProps}>` returning zero anchors.

**R2: initially lost to an upstream outage, then obtained.** The first dispatch died with all
three attempts exiting 1 against `503 ... biscuit_baker_service_me_circuit_open`
(`failureShape: nonzero_exit`, no signal — so neither the reaper silent-death class nor the
brief-size cliff). While the circuit was open I ran 20 self-certify probes on the briefed
surfaces and promoted the useful ones to permanent tests; that pass found nothing, which is
precisely why I re-dispatched rather than treating it as a substitute. On retry R2 returned
**BLOCKING**: 3 BLOCKING + 3 HIGH + 2 MEDIUM + 1 LOW, all real, all fixed.

**R3: BLOCKING** — 3 BLOCKING + 3 HIGH + 1 MEDIUM + 1 LOW. Every round confirmed the shipped
anchors themselves are correct ("no currently shipped anchor with a demonstrably wrong
announcement"); every finding across all three rounds was a guard or test defect.

### The third round forced a design change, not another patch

R1, R2 and R3 each found a NEW fail-open AST shape: nested spreads, computed keys, shadowed
identifiers and parameters, spread-supplied `aria-label`, spread-supplied `hidden`,
partially-exhaustive ternaries. That is not a run of bugs — it is the wrong default.
`docs/agents/spec-self-review.md:22` caps prose/patch iteration on a surviving vector at three
rounds, and this vector had survived three.

So the scanner was **inverted to a shape allowlist**. Rather than trying to prove an anchor is
broken (unsound: a static scanner cannot resolve imported props objects, parameters, or
shadowing), an external link must match one of a small set of approved shapes and anything
else is reported with instructions. The entire codebase uses exactly two shapes — 19 literal
`target="_blank"` and 4 conditional spreads — so the allowlist costs nothing today and closes
the whole class by construction.

Accepted tradeoffs, deliberately:

- A correct-but-unusual shape (an announcing `aria-label` arriving via spread) is reported. The
  author moves to an approved shape or adds an exemption with a reason. A false positive costs
  one comment; a false negative ships a silent link.
- An unconditionally external anchor must render its hint **unconditionally**. R2 asked for
  exhaustive ternaries to be accepted; R3 then defeated the both-branches heuristic with
  `e ? ready && <Hint/> : <Hint/>`. Proving an arbitrary conditional chain exhaustive is
  undecidable, so the approved shape is the simple one.
- Anything between the anchor and its hint whose attributes cannot be proven non-hiding (a
  spread, or a non-literal `className`/`style`) is reported.

### Two of my own test defects, found by reviewers rather than by me

- R3 called the empty-interpolation block **vacuous** and was right: it asserted properties of
  hand-authored constants, rendered nothing, and its "anti-tautology" source read would have
  survived changing `title.trim() ?` to `true ?`. It now renders and reads the computed
  accessible name, plus a probe-parity guard that is mutation-verified to fail on exactly that
  edit.
- Earlier, my first `HealthAlertsPanel` test guarded its assertions behind `if (link && …)` and
  passed while the action never resolved. Asserting existence exposed that `SHEET_UNAVAILABLE`
  needs `context.drive_file_id`, not the `sheet_url` I had invented.

## The pattern worth carrying forward

**Every defect in the guard was found by executing it, none by reading it.** Five adversarial spec rounds (35 findings) reviewed the design and missed all seven bypasses; the spike, the implementation, the impeccable gates, a peer scan, and the whole-diff review each found more. `docs/agents/spec-self-review.md:22` caps prose iteration on a surviving design vector at three rounds and requires a probe instead — that rule paid for itself here, and the guard's own history is the evidence.

The guard has also already proven itself on live upstream code: rebasing onto 82 sibling-session commits, it caught a brand-new unannounced anchor (`AttentionBanner`'s "Google Sheets ↗" destination chip) with no prompting, and flagged that `AttentionMenu` had left the family entirely.

## Verification

- 53 guard tests (synthetic self-tests driving each accept/reject branch, plus named regression pins for every R1 and R2 bypass); the reviewers' exact probe cases behave correctly (R1: 7 rejected / 3 valid accepted; R2: 16/16).
- `tsc` clean; `prettier` clean; `eslint` 0 errors and 0 warnings from new files (re-verified after the R2 fixes, which had left three dead-code warnings behind).
- Real CI green on #592 before the guard hardening (38 pass / 0 fail); re-run after.
- `spec:lint` 0 hard on the spec.
