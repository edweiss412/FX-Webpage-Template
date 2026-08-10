# Quick wins 2 — closeout

Per-branch invariant-8 dual-gate findings and dispositions, the observed-RED transcripts index, and the census/sweep dispositions. Each block lands ON ITS OWN BRANCH before that branch's final review and merge, so every closeout edit is part of a reviewed, merged diff.

> Branch A's block lands on `fix/quick-wins-2-mech` and branch C's on `feat/wizard-step-connector`; whichever merges second resolves the overlap. Same file, disjoint sections, by design.

Plan: `docs/superpowers/plans/2026-08-09-quick-wins-2/plan.md` · Specs: `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md`, `docs/superpowers/specs/2026-08-09-crew-chrome-wizard-connector.md`

## Branch B — feat/crew-chrome-footer-avatar

### §12.1 Design gate

Both halves ran on the branch diff (`git diff origin/main...HEAD` restricted to `app/**/*.tsx`, `components/**/*.tsx`, `app/globals.css`) with the canonical v3 setup: `context.mjs` context load, then the product-register read. Critique and audit ran as isolated passes.

**Critique 28/40 (Good) · Audit 17/20 (Good) · P0: 0 · P1: 2** (one per half, and they agree on the surrounding P2s). Both independently verified the parts that could have gone wrong quietly: the `avatarColor` palette is AA against white initials (`#9A4A00` 6.26:1, `#515763` 7.26:1), the form boundary keeps `slug`/`shareToken`/`showId` with the typed wrapper, all four partial-identity labels are non-empty, `menuitemcheckbox` + `aria-checked` (never `aria-pressed`), Escape restores focus, Tab closes without trapping, the open-focus effect is post-commit and sound, 44px holds on the trigger, both rows and the report button, every `ring-offset-2` is container-matched, the pointerdown listener is removed, `z-20` clears the bar's `z-10` with no intervening stacking context, and no em dashes reached user-visible copy. `noBareRingOffset` + `_metaEmDashCopy`: 32/32.

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| B-1 | P1 | **The theme row contradicted itself.** It rendered a Sun beside the label "Dark mode" while `aria-checked` was true, and gave sighted users no visible checked state at all. The Sun/Moon swap is correct for the STANDALONE toggle — an action button whose affordance is "this is what you'll get if you tap" — and wrong for a `menuitemcheckbox`, which shows whether it IS on. | **FIXED** — glyph pinned to Moon, state carried by a trailing check. |
| B-2 | P1 | **Faint copy fell below AA on the re-grounded band.** Moving the footer from `bg-bg` to `bg-surface-raised` dropped `text-text-faint` to 3.35:1 light / 3.53:1 dark, under the 4.5:1 floor — and it is the ONLY copy in the `syncing…` state. `text-text-faint` has no DESIGN §1.2 row, which is why nothing caught it. | **FIXED** — `text-text-subtle` (5.97:1 dark) for the two copy spans; the `aria-hidden` separator dots stay faint, being decoration. |
| B-3 | P2 | **The popover was unbounded.** `w-max` is `width: max-content`, which the containing block does not clamp, so a long name plus a long role (roles like "A1 / V1 / BO / GAV" are real) runs off the left edge at 390px with no scroll recovery. | **FIXED** — `max-w-[calc(100vw-2rem)]`. |
| B-4 | P2 | **The icon button's hover was a no-op, then an inversion.** Its recipe was copied from a `bg-bg` container: on the band, light `surface` and `surface-raised` are both `#ffffff` (no visible change) and dark hover matched the band exactly, flattening the button into it. | **FIXED** — `hover:bg-surface-sunken` for the icon variant. |
| B-5 | P2 | **`role="menu"` owned a generic child.** The identity header was correctly hoisted out, but the person row's `<form>` (no accessible name → `generic`) sat directly inside. axe walks through null-role wrappers, so the suite's own containment assertions could not see it. | **FIXED** — `role="none"` on the form; the submit remains the menu item and the server-action boundary is untouched. |
| B-6 | P3 | Escape stopped closing the menu after a click on the identity header — focus fell to `<body>`, outside the popover's `onKeyDown`. | **FIXED** — `tabIndex={-1}` on the header, script-focusable only, never in the tab order. |
| B-7 | P3 | `aria-label="FXAV"` on a `<p>` is prohibited on `role=paragraph` and redundant with its own text. | **FIXED**; the Header suite's locator moved to the testid, since its subject is the color token. |
| B-8 | P3 | No exit transition — the popover unmounts hard while spec §2.3's inventory says "same, reversed". | **ACCEPTED.** The jsdom suite pins the unmount deliberately, so a future refactor that hides instead of unmounting fails and owes a real exit entry. Adding an exit animation means keeping the node mounted through it, which is the branch-stability hazard DESIGN §15 warns about for announced regions. Not worth that trade for a 120ms fade. |
| B-9 | P2 | The band's surface reads differently per theme: in light, `surface-raised` equals `surface` (an invisible lift with no shadow); in dark it is lighter than both the cards and the fixed bar. | **DEFERRED** — a DESIGN.md token question (whether `--color-surface-raised` earns a shadow in light, and whether the band should sit below the bar in dark), not a code fix, and §1.2 is missing `text-subtle`/`text-faint`-on-`surface-raised` rows entirely. Filed rather than guessed at inside a UI branch. |

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

### §12.2 Observed-RED transcripts

| Task | RED observed | Restored |
| --- | --- | --- |
| B1 | `footer.bottom=843.91` vs `barTop=790.70` (the box ends 53px UNDER the bar); short page `footer.bottom=212.86` vs `viewport.bottom=900` (687px of dead space, unanchored) | both green after the flex chain + clearance |
| B3 | the four identity-chip suites failed against the new component — 10 cases pinning the text-chip rendering | all four retargeted in the same commit; 21-case menu suite added |
