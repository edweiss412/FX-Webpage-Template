# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-24 — swept every merged PR body (#445–#570) for deferrals that never reached a ledger; strip-mobile entries graduated the same day. SETTINGS-DEVROW-GALLERY-RESIDUE-1 graduated 2026-07-24 (all four findings closed). Graduation provenance lives in [DEFERRED-archive.md](./DEFERRED-archive.md) (grep by id).

---

### VOICEOVER-ANNOUNCER-SPOTCHECK — owner action (2026-07-22)

The warning-announcer-copy bundle's manual assistive-technology half (spec §8
F10 mitigation): owner runs VoiceOver over ignore / bulk-ignore / pointer
reveal on the published Sheet-warnings panel (titled "Parse warnings" until
`feat/warning-trim-undefer`) and confirms one polite utterance
per action, silence on background refreshes, and the reveal focus move. The
automated halves (impeccable audit a11y dimension; role/mutation structural
tests) shipped pre-merge. Un-defer trigger: owner performs and records the
pass.

### ATTENTION-INDEX-JUMP-FOCUS-1 — [P1] pressing an index row drops focus to `<body>`

From the impeccable audit of `feat/attention-index` (2026-07-25). A row's `onClick` runs `onClose()` then `onNavigate(item)`; the row unmounts with the menu, the jump handler in `ShowReviewSurface` only scrolls and flashes, and the rescue effect in `PublishedReviewModal` returns early on a user-initiated close. So after pill → Enter → Tab → Enter, the viewport lands on the card but `activeElement` is `<body>`, outside `[role="dialog"]` — the next Tab restarts at the document top, escaping the modal trap, and screen-reader users get no arrival announcement because the flash is visual-only.

**Accepted, not fixed, in the index consolidation.** Verified pre-existing on `origin/main`: actionable rows there carry a byte-identical `onClick` with no focus restoration (`git show origin/main:components/admin/showpage/AttentionMenu.tsx`, the actionable row block), and holds plus the three actionable alert codes are the dominant row class. This diff widens the same behavior to former needs-look rows, which previously moved focus only as a side effect of their inner `<a href>`'s native navigation — an affordance the spec deletes deliberately, since an `<a>` cannot nest inside the `<button>` that makes the whole row pressable.

Fixing it properly means focusing the landed card (`[data-attention-anchor]` with `tabindex="-1"`) from the SHARED jump handler, which is outside this spec's three files and is pinned by a large focus contract (`pillFocusReconcile.test.tsx`, and 26 real-browser tests in `attention-pill-focus.spec.ts`). That is a focus-orchestration change of different character from a grouping/copy consolidation, and it should carry its own spec and its own re-validation of that contract rather than riding along here.

**Un-defer trigger:** any keyboard or screen-reader report of losing place after a jump, or the next change that touches the jump handler for another reason.

### ATTENTION-INDEX-ROW-DESTINATION-NAME-1 — [P2] index rows no longer name where they go

From the same audit. A needs-you row's accessible name is now `"needs review — <title><hint>"`. Deleting the inner action link removed the only words that named the destination ("Open in Sheet", "Go to Overview"), and the trailing `→` is `aria-hidden`. A sighted user infers "pressable, goes somewhere" from the chevron and hover; a screen-reader user gets a button whose name describes the problem but not the movement.

**Accepted, not fixed.** The spec makes rows deliberately jump-only and moves destination naming onto the card's chip (§2.2/§2.3), so adding a destination phrase back into the row name is an amendment to that ratified division, not a defect against it. It also reads awkwardly against the existing sr-only tone prefix (`"needs review — Go to Sheet unavailable"`).

**Un-defer trigger:** owner review of the row's accessible name, or the first screen-reader pass on the merged panel.

### DESTRUCT-FOCUSRING-1 — [P1] the light-mode focus ring measures 1.60:1

From the impeccable audit of `fix/destruct-thumb-order-drift-guard` (2026-07-25). `--color-focus-ring` composites over white to ≈`#FFC075`, **1.60:1** against adjacent colors, where WCAG 1.4.11 non-text contrast expects 3:1. Dark mode passes at 4.40:1.

**Accepted, not fixed.** This is a token, not a surface: every `focus-visible:ring-focus-ring` control in the app inherits it, so changing it inside a two-button branch would ship an app-wide visual change under a diff about button order. `DESIGN.md`'s contrast table has no focus-ring row, which is why it was never pinned. Tracked by the pre-existing `BL-FOCUS-RING-CONTRAST`, which already owns the token decision and the ~90 bare `ring-offset-2` sweep; this run contributed the measured ratios.

**Un-defer trigger:** the next DESIGN.md token pass, or any a11y sweep that touches focus appearance.

### DESTRUCT-DURATION-TOKENS-1 — [P1] `duration-fast` / `duration-normal` emit no CSS

From the same audit. Tailwind v4's `duration-*` utility resolves `--transition-duration-*`; this repo defines `--duration-fast` / `--duration-normal`. Verified by compiling the token CSS: **no rule is emitted**. All **276 + 42 usages across 89 files** silently fall back to Tailwind's 150ms default, **and the `@media (prefers-reduced-motion: reduce)` block that zeroes those variables therefore never applies to any Tailwind transition.**

**Accepted, not fixed.** The rename is one line, but its blast radius is every transition in the app, and the thing that actually needs re-verifying afterwards is the reduced-motion path — an a11y contract with no current test. That belongs in a motion/token pass with its own verification, not inside this diff. Locally the impact here is nil: `transition-opacity` only animates opacity, which does not change idle↔armed.

**Un-defer trigger:** the next motion or token pass. Treat as an accessibility fix, not a cosmetic one.

### DESTRUCT-ARM-ANNOUNCE-1 — [P2] the armed window opens and closes silently

From the same audit. At 4s the live region empties and the button's accessible name reverts, but a focused button's name change is not spoken — the user believes they are still armed. Separately, 4s is tight against ~3s of polite speech for the arm message.

**Accepted, not fixed.** Both fixes mean revisiting `ARM_REVERT_MS` for assistive-tech users specifically, which is a decision across all 11 surfaces sharing the constant, not one component. Tracked as `BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`.

**Un-defer trigger:** an a11y pass on the destructive-confirm family, or any change to `ARM_REVERT_MS`.
