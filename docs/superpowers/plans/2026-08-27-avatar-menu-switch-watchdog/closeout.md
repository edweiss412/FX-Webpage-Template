# Close-out — a hung switch-person clear re-enables the menu row after a watchdog

**Row:** `BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG` · **Branch:** `fix/avatar-menu-switch-pending-watchdog` · **PR:** #915

## 12. Invariant-8 UI quality gate

impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=1 dispositions=recorded

**Why DEGRADED, stated rather than hidden.** Both halves ran with the canonical v3 setup gates: `context.mjs` over `PRODUCT.md` and `DESIGN.md`, then the register reference (`product.md` — this is an authenticated crew surface, design serves the task). The critique's dual-agent invariant was honoured at dispatch: Assessment A (design review) and Assessment B (detector plus evidence) were spawned as two isolated sub-agents and both ran to completion. Neither report reached the parent context. Two explicit requests for their output returned only idle notifications. The evidence was therefore re-gathered inline: the detector run directly, contrast computed from `DESIGN.md` §1.1 hexes, the source read. The banner is the skill's required disclosure for a single-context synthesis, and a silent degraded critique is a failed critique.

### Findings and dispositions

| # | Half | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | critique | **P1** | The timeout was announced to assistive tech ONLY. A sighted crew member taps, waits eight seconds, and watches the row silently un-dim with nothing saying the switch is still running or that tapping again is now sensible. For a glancing, one-handed reader on a venue floor that is close to no state change at all. | **FIXED in-branch** (`a29e15ab3`). The timed-out phase renders the same sentence visibly as a sibling of `role="menu"`, `aria-hidden` so the always-mounted status region stays the single AT channel. Pinned by AC-17; the branch is declared in the transition audit, which caught it on its first run by NAME. The row id is deliberately not quoted here: ids renumber as rows are added, and diff round 3 caught this line still pointing at C24 after later rounds moved the timeout branch to C27. The audit names the branch itself, which does not renumber. |
| 2 | critique | P2 | Pending vocabulary drifts from the same-route sibling: `_ClaimedRowButton` pends with a spinner and a "Signing in…" chip, this row pends with `opacity-60` alone. The product register bans inconsistent component vocabulary across surfaces. | **DEFERRED, no ledger row** (process mint freeze). Reconciling the two rows is a design decision spanning a surface this arc does not otherwise touch — class-sweep exception (c). Recorded in the PR body under unfixed peers. |
| 3 | critique | P2 | "Still switching. Try again." mildly argues with itself: it reports work in progress and then asks for a retry. The clearer shape is "This is taking a while. You can tap again." | **SETTLED AS ADEQUATE.** The arc brief made the critique the settler of this copy. It is honest, plain-language, actionable, carries no error code, and no em dash. Judged adequate rather than ideal, and recorded here so the judgement is visible rather than implied. |
| 4 | audit | P3 | The pre-existing dimmed-row pairing (`opacity-60` on `text-text` over `surface-raised`) computes 4.53:1 in light mode, clearing AA body by 0.03. Any future darkening of `--color-surface-raised` or nudge to the opacity drops it under. | **NOTED, not changed.** Not introduced by this diff, and widening it mid-arc would be an unreviewed token change. |

### Scores

- **Critique:** 31/40. Visibility of system status scored 2 before finding 1 was fixed; consistency and standards scored 2 for finding 2, which is deferred.
- **Audit:** 20/20. Accessibility 4, performance 4, responsive 4, theming 4, anti-patterns 4.
- **Detector:** `exit 0`, zero findings across `components/auth/AvatarMenu.tsx` and `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx`.

### Contrast, computed rather than assumed

| Pairing | Light | Dark |
|---|---|---|
| Timeout note, `text-text-subtle` on `surface-raised` (NEW) | 6.76:1 | 5.97:1 |
| Dimmed pending row, `text-text` at `opacity-60` on `surface-raised` | 4.53:1 | 5.67:1 |
| Failure alert, `warning-text` on `warning-bg` (unchanged) | 8.79:1 | 9.64:1 |

Every pairing clears WCAG AA for body text in both modes. The note sits at AA rather than the AAA `PRODUCT.md` asks of light-mode BODY text, which is the deliberate step down of a secondary status line.

### Pre-code mechanical checklist

No em dash and no straight apostrophe in any rendered string; every em-dash hit in the changed files is inside a comment block. Tap floor holds (`min-h-tap-min` on `itemClass`, `min-h-tap-min min-w-tap-min` on the trigger). Canonical type and token classes only (`text-xs/relaxed`, `text-text-subtle`); no new colour token, no inline `shadow-[…]`, no bare `ring-offset-2`. The watchdog adds no animation: the row returning to its resting appearance is instant by design, and the only motion on this surface remains the popover enter, which already carries `motion-reduce:animate-none`.
