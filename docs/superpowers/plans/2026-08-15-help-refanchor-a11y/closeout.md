# Closeout — RefAnchor a11y arc

**Branch:** `fix/help-refanchor-a11y` · **Entry:** `BL-HELP-REFANCHOR-A11Y-PASS` · **Spec:** `docs/superpowers/specs/2026-08-15-help-refanchor-a11y.md` · **Plan:** `docs/superpowers/plans/2026-08-15-help-refanchor-a11y/plan.md` · **Date:** 2026-08-15

## 1. What shipped

The three ledger findings, each repaired once:

1. **Per-code accessible names.** `RefAnchor`'s `aria-label` composes from the entry's catalog code, so the 219 copy-links on `/help/errors` expose 219 distinct names instead of one shared string. `id` is the composition source because it IS the catalog code by the `VALID_ID` contract and is a string by type; `children` is a `ReactNode` with no reliable text form.
2. **Perceivable copy confirmation.** An unconditionally mounted sr-only `role="status" aria-live="polite"` region follows the heading and announces `Link copied`. The announcement is settlement-gated: only a RESOLVED clipboard write announces, and the 2000 ms clear window is armed at settlement rather than at click. A rejected or absent clipboard announces nothing and leaves any running timer untouched. No branch calls `preventDefault`, so fragment navigation and middle-click open-in-new-tab survive.
3. **Skip path past the catalog.** A skip link ("Skip to the report button", `href="#report"`) is the first focusable element the page fragment contributes, and the trailing report Callout is wrapped in `<div id="report" tabIndex={-1}>`. Copy-links stay in the tab order, per the ratified scope.

## 2. Acceptance criteria

| AC | Status | Evidence |
| --- | --- | --- |
| AC-1 distinct per-code names | met | distinct-names case in `tests/help/ref-anchor.test.tsx`; browser probe read 219 copy-links, first `aria-label` = `Copy link to CLEANUP_REQUIRES_STALE_SESSION`; `rg -in "copy link to this section" app components tests` returns zero hits |
| AC-2 announcement contract | met | 13 cases in `tests/help/ref-anchor.test.tsx`; `_metaLiveRegionMounting` green with NO new exemption row; browser probe: 219 regions, all empty before copy, `aria-live=polite`, none inside a heading, exactly one announces `Link copied`, zero non-empty after the clear window |
| AC-3 skip path | met | 7 cases in `tests/help/page-errors.test.tsx`; real-browser scenario in §3 below |
| AC-4 red-then-green + suites green | met | Task 1 observed 14 red → 20 green; Task 2 observed 5 red → 13 green; `pnpm exec vitest run tests/help` 61 files / 686 tests green |
| AC-5 process | met | worktree-only; conventional commits; invariant-12 marker riding the branch and coming off inside the archive move; the marker line below |

## 3. Impeccable dual gate (invariant 8, spec §7)

Both halves ran on the arc diff (`app/help/_components/RefAnchor.tsx`, `app/help/errors/page.tsx`), with the canonical v3 setup gates: the skill's own context-load step (PRODUCT.md + DESIGN.md) then the PRODUCT register reference read — `/help/errors` is admin help UI, where design SERVES the product.

### Critique half — RAN-DEGRADED

**Provenance, stated rather than implied.** Two isolated sub-agents were dispatched for Assessment A (design review) and Assessment B (detector + browser evidence), which is the reference's mandatory shape. Neither returned within ~25 minutes across three prompts each. The detector was therefore run directly in this context, and the design review was formed in this context afterwards — so the design judgment was anchored by detector output that had already arrived, which is exactly the contamination the two-agent rule exists to prevent. The half is recorded as **RAN-DEGRADED (single-context: both assessment sub-agents unresponsive)** rather than claimed as dual-agent.

**Anti-patterns verdict: pass.** The product-register test is whether someone fluent in the category's best tools would trust the surface. Nothing decorative was added; both new elements are imperceptible until needed. The skip link reuses the layout's shipped recipe verbatim instead of inventing a variant, the live region reuses `FinalizeAnnouncer`'s shape, and the fragment target reuses the `<main id="main" tabIndex={-1}>` caveat — three shipped patterns reused, none invented. Deterministic detector (`detect.mjs --json` on both files): exit 0, `[]`, zero findings.

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 3 | The copy now confirms itself, but only to screen readers; a sighted user still gets nothing but a URL-bar fragment change (ratified §1.1 item 4) |
| 2 | Match system / real world | 4 | "Skip to the report button" matches the intro prose's own "report button"; "Link copied" is plain language, no codes |
| 3 | User control and freedom | 4 | The skip link is optional and escapable; copy-links keep middle-click, open-in-tab, and fragment navigation |
| 4 | Consistency and standards | 4 | Three shipped patterns reused verbatim rather than re-invented |
| 5 | Error prevention | 3 | Settlement gating removes the false-success class outright; not 4 because a blocked clipboard is indistinguishable from success without checking |
| 6 | Recognition rather than recall | 4 | The accessible name names the code, so a screen-reader user need not track which entry they are on |
| 7 | Flexibility and efficiency | 3 | A real accelerator, but the page's only one, and six layout-chrome stops precede it |
| 8 | Aesthetic and minimalist design | 4 | Nothing visible added; no new state, no new chrome |
| 9 | Error recovery | 2 | A failed copy offers no path — no message, no retry, no "select this instead"; the fragment-navigation fallback is real but undiscoverable (ratified §4 limit 1) |
| 10 | Help and documentation | 4 | This is the help surface, and the change makes its own CTA reachable |
| **Total** | | **35/40** | Good |

Rows 1 and 9 score below 4 on ratified scope decisions carrying documented limits, not on defects. They are scored honestly rather than excused, so a future arc that revisits visible confirmation can see what it would buy.

**Strengths.** (a) Settlement gating — the obvious implementation announces on click; this one observes the promise, so it cannot claim a copy that did not happen. (b) Pattern reuse over invention, which is the product register's actual bar. (c) The region is per-instance and born empty, so the `BL-ANNOUNCE-REGION-UNMOUNT-CLASS` defect is structurally unreachable here rather than merely absent.

**Persona red flags.** Doug (admin, PRODUCT.md) mid-show on a phone: below the `md` breakpoint the copy affordance has no `opacity-0`, so it is always visible to him — good — but he gets no visible confirmation and will verify by pasting. That is his most likely friction and it is ratified. Screen-reader user: the primary beneficiary, and a clean win on both findings. Keyboard-only sighted user: a visible 196×44 focused target at 19:1 contrast, also a clean win.

### Audit half — RAN

Measured in a real authenticated browser against a dev server (`/help/errors` is admin-gated, so sessions were minted through the repo's own `tests/e2e/helpers/signInAs` test-auth path), across light and dark × 390 px and 1280 px:

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 4 | Focused skip link 196×44 (tap floor met); contrast 19.17:1 light and 15.16:1 dark, both past the AAA 7:1 target; 227 headings with zero level skips; 219 status regions, none inside a heading |
| 2 | Performance | 4 | No new client island; one `useState` and at most one live `setTimeout` per instance, cleared on unmount; no console errors on load |
| 3 | Responsive design | 4 | No horizontal overflow at 390 px or 1280 px; 0 of 219 copy-links under 44×44 |
| 4 | Theming | 4 | No hard-coded colors; the skip link reuses the layout token recipe, so both themes come from the shipped token set |
| 5 | Anti-patterns | 4 | Detector clean; nothing decorative added; no new visible state by ratified design |
| **Total** | | **20/20** | Excellent |

**Real-browser scenario (spec §3 assigns this to the audit half by name).** jsdom cannot prove fragment-focus behavior, so this ran in Chromium:

- The skip link's box goes 1×1 at rest → 196×44 focused, `position: absolute`, `z-index: 50`, at (16, 16).
- Activating it sets the URL to `/help/errors#report` and moves `document.activeElement` to `DIV#report` (`tabindex=-1`).
- The NEXT Tab lands on `BUTTON "Report a recurring error"`.
- Full tab order from page load: 1 layout "Skip to content", 2 "FXAV Help", 3 theme toggle, 4 "Back to admin", 5 "Browse help pages", 6 "Help" breadcrumb, **7 "Skip to the report button"**, 8-15 the eight family jump links, then the catalog. The new link is the page fragment's first contribution — ahead of all eight jump links and all 219 copy-links — and stops 1-6 are layout chrome the page does not own.

### Findings and dispositions

**No P0 or P1 findings.** The two heuristics scoring below 4 are ratified scope decisions with documented limits (spec §1.1 item 4, §4 limit 1), not defects, so neither is a finding and neither needs a `DEFERRED.md` entry.

Minor observations, recorded rather than filed — none meets the ledger filing bar, since each is either a ratified decision or a characteristic with no reachable failure:

- **P3.** `CLEAR_AFTER_MS = 2000` sits alongside the shipped `WIZARD_COPY_FEEDBACK_RESET_MS = 2200`, the analogous copy-feedback reset in `components/admin/wizard/Step1Share.tsx`. Two near-identical timings for one interaction concept. Defensible — one is sr-only, the other visible — and DESIGN.md §5.5 now lists both, so the difference is legible to anyone reading the inventory rather than buried.
- **P3.** 219 simultaneous `aria-live="polite"` regions on one page. Ratified in spec §2.2 with rationale: each is born empty and only the one whose control was activated ever mutates. Recorded so that a future surface pushing this count substantially higher re-opens the question deliberately.
- **P2.** The skip link is the page's first contribution but tab stop 7 overall. The layout owns stops 1-6 and its own skip-to-content link is stop 1, so this is not this diff's defect — but it bounds the size of the win and is worth knowing.

## 4. Documented limits carried forward

Unchanged from spec §4: copy failure is not announced (conservative silence plus the surviving fragment-navigation fallback); no visible confirmation ships; repeat-copy of the same link inside the clear window may not re-announce; the `#report` fragment reaches report context as `helpCode: "report"`, one more member of the already-shipped non-code-fragment class; and the `as="h2"` chapter mode gains the same region per instance, with the per-page skip-path question re-opening only if a future chapter page reaches this control density.

## 5. Deviations from the plan, and why

**The clear-timer oracle.** The plan specified a bare `vi.getTimerCount()` returning 0 pre-settlement and 1 after. Probed on this tree: under jsdom with React's act environment the click itself arms a `setTimeout(…, 0)`, so the absolute count reads 1 while the write is pending and 2 once it resolves. An absolute-zero assertion is unreachable, and an absolute count is a claim about the environment rather than about this component. The suite instead tracks the component's OWN clear timers by delay — the same baseline/count oracle the plan cites, scoped so that it discriminates. Seven mutants confirm it does, including "optimistic announce at click", "unmount cleanup removed", and "click clears the running timer".

**A substring class assertion, caught by its own mutant and swept.** The tap-floor assertion was first written as `className.toContain("sr-only")`; the sr-only-dropped mutant SURVIVED it, because `sr-only` is a proper substring of `focus:not-sr-only` on the same element. Both this arc's assertion and the one live peer with the identical defect (`tests/help/skip-link.test.tsx`, pinning the layout skip link) now assert through `classList.contains`. Re-probed after the repair: the mutant is killed on the errors page AND on the layout, where it had been passing vacuously since that test was written. Repaired in-branch rather than filed, per the class-sweep disposition default.

**Commit ORDER of the claim removal, fenced in both directions so neither side relitigates it.** Diff review R2 raised one BLOCKING finding: the graduation commit strips the in-flight claim, and two further commits (a `spec:lint` reword and a tap-census line-number fix) landed after it, so claim removal was not the PR's final commit. Two rules in this repo bear on that and they pull opposite ways — invariant 12's Stage 4.4 says the marker comes off "in the PR's last commit", while its graduation clause says a graduating entry's marker comes off "in the same commit that archives it", and this arc's `HANDOFF.md` line 29 pre-ratified the second reading in as many words: "review/CI repairs after that commit are fine". `tests/docs/_metaLedgerInProgress.test.ts` — the actual enforcement — passed throughout, and the reviewer's stated consequence (the branch stops appearing in `pnpm ledger:claims`) is inherent to archiving ANY entry, not something this diff introduced.

The finding was nonetheless honored rather than argued, because satisfying the literal rule is cheap and leaves nothing ambiguous: the branch was reordered so the graduation IS the final commit. The reordered commits touch disjoint file sets, so the final tree is byte-identical to the tree R1 and R2 reviewed (verified by `git diff` between the pre- and post-reorder heads: empty). **Both readings now hold at once.** A future graduating arc may rely on either; if it relies on the graduation clause, it should say so in its review brief's do-not-relitigate list, which this arc's brief did not do — that omission, not the commit order, is what actually cost a round.

**One registry fan-out the plan did not enumerate.** `CLEAR_AFTER_MS` is a new interaction timing, and `tests/docs/_metaInteractionTimingInventory.test.ts` derives its population from source rather than a hand-list — so it failed until DESIGN.md §5.5 gained the row. Regenerated with `pnpm exec tsx scripts/scan-interaction-timings.cli.ts` rather than hand-inserted. `pnpm vitest run tests/docs` is green at 22 files / 515 tests.

impeccable-gate: critique=RAN-DEGRADED audit=RAN p0=0 p1=0 dispositions=none
