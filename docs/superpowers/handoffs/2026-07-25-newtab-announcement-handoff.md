# BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y — new-tab announcement family sweep · Handoff / close-out

**PR:** #592 · **Branch:** `fix/newtab-announcement-family` · **Spec:** `docs/superpowers/specs/2026-07-25-newtab-announcement-family.md` · **Date:** 2026-07-25

PR2 of the 6-PR `BL-NULLCODE-STAMP-BATCH-2 residuals` sequence (PR1 = #587). Closes the announcement half of `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y`; the tap-target half shipped earlier.

## What shipped

Every external link in `components/` and `app/` now tells screen-reader users it opens a new tab. The `↗` glyphs and external-link icons that told sighted users are all `aria-hidden`, so 21 of 23 anchors announced nothing.

- `components/shared/NewTabHint.tsx` — one visually-hidden `(opens in a new tab)` span, so the copy exists once across 15 call sites.
- 11 Group A anchors: sibling space + the hint. 6 Group B anchors: phrase appended to an existing `aria-label`. 4 Group C anchors: hint gated on `action.external` (they are same-app links when false).
- 3 WCAG 2.5.3 (Level A) label-in-name failures fixed: `step3ReviewSections.tsx` and the crew-facing `SourceLink.tsx` read "In sheet" while their labels never contained it; `VenueMapTile.tsx` reads "Directions" while its label never contained that.
- 2 bare `→` glyphs wrapped `aria-hidden` in `Step2Verify.tsx`; `rel` normalized on 3 anchors.
- `tests/styles/_metaNewTabAnnouncement.test.ts` + `tests/styles/_newTabScan.ts` — per-anchor TSX AST guard, 39 tests.

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

## Cross-model review R2 — NOT OBTAINED (upstream outage)

**R2 has no verdict, and this is an infrastructure fault, not a clean review.** All three
`codex-guard` attempts exited 1 against `503 Service Unavailable ... auth error code:
biscuit_baker_service_me_circuit_open` on both the WebSocket and HTTPS transports, after
attempt 1 burned 51k tokens. `failureShape: "nonzero_exit"` on every attempt, no `signal`, no
`killedReason` — so this is NOT the reaper-hook silent-death class documented in
`docs/agents/codex-silent-death-2026-07-24.md`, and not the brief-size cliff either (the brief
was 6.1KB). AGENTS.md is explicit that `no_verdict` must not be read as "the reviewer found
nothing".

**Substitute: a self-certify pass, recorded as such.** I wrote 20 adversarial probes against
exactly the five surfaces the R2 brief asked the reviewer to attack, and all 20 behave
correctly:

| Surface | Attack | Result |
| --- | --- | --- |
| `normPredicate` paren peeling | can peeling equate two genuinely different predicates (`a` vs `(b)`)? can it swallow a negation mismatch? | rejected correctly; `((e))` ≡ `e` still accepted |
| `conditional-ok` label verdict | a label announcing in exactly the INTERNAL branch (announces when the tab does NOT open) — both polarities | rejected correctly |
| walk-up separator | fake a separator via a wrapper with none up the chain; an element sibling instead of a space | rejected correctly; space-before-wrapper still accepted |
| comment-trivia exemption | marker inside a string literal; a real comment 9 lines away | rejected correctly; adjacent comment with a reason accepted |
| fail-closed completeness | `target={p.target}`, `target={pick()}`, `{...build()}` | all rejected as unresolvable |

The highest-value probes are now permanent tests in the guard (the `SC ` cases), so the pass
is repeatable rather than a one-off claim. Guard total: 44 tests.

**What this does NOT cover.** A self-certify pass cannot replace fresh adversarial eyes — R1
proved that decisively by finding seven fail-open shapes I had read past repeatedly. The
specific open question I put to R2 is unanswered: whether structural AST coverage plus two
behavioral anchors is sufficient, or whether particular untested anchors among the 14 carry
risk the AST rule cannot see. **Re-dispatch R2 when the Codex circuit closes**, before or
immediately after merge, and treat any finding as live.

## The pattern worth carrying forward

**Every defect in the guard was found by executing it, none by reading it.** Five adversarial spec rounds (35 findings) reviewed the design and missed all seven bypasses; the spike, the implementation, the impeccable gates, a peer scan, and the whole-diff review each found more. `docs/agents/spec-self-review.md:22` caps prose iteration on a surviving design vector at three rounds and requires a probe instead — that rule paid for itself here, and the guard's own history is the evidence.

The guard has also already proven itself on live upstream code: rebasing onto 82 sibling-session commits, it caught a brand-new unannounced anchor (`AttentionBanner`'s "Google Sheets ↗" destination chip) with no prompting, and flagged that `AttentionMenu` had left the family entirely.

## Verification

- 39/39 guard tests (24+ synthetic self-tests driving each accept/reject branch); the reviewer's 10 exact probe cases behave correctly (7 rejected, 3 valid accepted).
- `tsc` clean; `prettier` clean; `eslint` 0 errors, 0 warnings from new files.
- Real CI green on #592 before the guard hardening (38 pass / 0 fail); re-run after.
- `spec:lint` 0 hard on the spec.
