# Close-out — share-hub popover placement migration + Archive row copy

**Branch:** `feat/sharehub-archive-copy-reveal`
**Spec:** `docs/superpowers/specs/2026-07-24-sharehub-viewport-popover-and-archive-copy.md`
**Plan:** `docs/superpowers/plans/2026-07-24-sharehub-viewport-popover-and-archive-copy.md`

---

## §12 UI quality gate (invariant 8)

⚠️ **DEGRADED: single-context (sub-agent dispatch declined by standing session instruction)**

The critique command mandates Assessment A and Assessment B as two isolated sub-agents. This session runs under a standing instruction not to spawn agents unless explicitly requested, which is the reference's "declined" path. Both assessments were therefore run inline by one context, and this banner is required rather than optional — a silent degraded critique is a failed critique. The practical cost: A and B were not blind to each other, so the detector output could have anchored the design judgement. It did not have much to anchor (detector returned clean), but the weakening is real and is recorded rather than papered over.

### Setup gates

- The skill's context script loaded (PRODUCT.md; the project has no DESIGN.md hit for this target path).
- Register: **product** (the skill's product register reference) — this is admin tooling, design serves the product.
- Existing system read: `ShareHub.tsx`, `HoverHelp.tsx`, `lib/popover/position.ts`, `ReviewModalShell.tsx`, `DESIGN.md` token table.

### Assessment B — detector + mechanical invariants

| check | result |
| --- | --- |
| detector run over `components/admin/showpage/ShareHub.tsx` | `[]` — clean, exit 0 |
| Em-dash in user-visible copy | none (the only `—` occurrences are in comments; the sole quoted match is a JS selector string) |
| Apostrophe literals in copy | none introduced |
| 44px tap floor | unchanged; 5 `min-h-tap-min` / `size-tap-min` sites intact |
| Canonical type/token classes | `text-text-subtle` ×11, `text-xs/relaxed` ×1 — no ad-hoc values |
| New color tokens | none. The diff adds only existing tokens (`bg-surface`, `border-border`, `text-text-strong`, …) and border-side utilities for the caret flip. No contrast pin needed, since no new or repurposed color was introduced |
| Reduced motion | no new animation introduced; the re-place is deliberately instant (spec §4) |

### Assessment A — design review

**AI-slop verdict: negative.** No slop families are touched. No side-stripe, no gradient text, no glass, no eyebrow scaffolding, no card grid. The change is positioning logic plus two strings.

**Strengths**

1. **The headline outcome is an operability fix, not a polish item.** A destructive control could be armed and then neither confirmed nor cancelled on every phone height measured. That is a WCAG-operability failure on the most consequential control in the hub, and it is now reachable at 844/740/667/620/560.
2. **It reuses the shipped positioning system instead of growing a second one.** `lib/popover/position.ts` states that all placement math lives there and must not drift per call site; this adopts it rather than adding a parallel helper, so the hub inherits future fixes to it for free.
3. **The copy now answers "why would I tap this?"** PRODUCT.md principle 5 is plain language and principle 2 is glanceability. "Ends crew access and clears it off the dashboard" leads with the purpose and states the cost; the old constant did neither, and was false in one of its two states.

**Findings and dispositions**

| # | sev | finding | disposition |
| - | --- | ------- | ----------- |
| 1 | P2 | **On short viewports the popover now opens UPWARD, covering the show title and status band.** The operator loses sight of which show they are acting on at exactly the moment they are arming a destructive action. | **Accepted, not fixed.** Opening upward is what makes the control reachable at all; the prior behaviour was a popover clipped off-screen, which is strictly worse than an obscured title. The armed confirm carries its own label and consequence sentence. Recording it because the right long-term answer may be to name the show inside the confirm rather than to change placement. Filed as `BL-SHAREHUB-CONFIRM-NAMES-SHOW`. |
| 2 | P3 | **The Archive row is now taller than its Rotate/Reset siblings** — the published-arm description wraps to two lines where the others take one, breaking the menu list's vertical rhythm. | **Accepted.** The alternative is the shortest-honest wording, which drops either the access loss or the purpose; both matter, and the truthfulness fix is the point of the change. PRODUCT.md asks for "comfortable, not cramped", and an uneven row is the cheaper cost. |
| 3 | P3 | **"wrapped show" is domain vocabulary** in the held-state string. | **No action.** Doug is an AV project manager and "wrapped" is native to that world, not jargon imported from software. The shipped help page already uses the same term ("the point of archiving a wrapped show"), so this is consistent rather than novel. |
| 4 | — | **Not a finding, recorded to prevent re-derivation:** the backdrop covers the hub's own triggers. | Pre-existing, verified against `origin/main`; `BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS`. |

**Accessibility (audit dimension)**

- `role="dialog"` + `aria-label` + `aria-expanded`/`aria-controls`/`aria-haspopup` on both triggers: unchanged and still wired across the portal boundary (IDREF works irrespective of DOM position).
- Portal target is the ReviewModalShell panel, NOT `document.body`, which keeps the dialog inside the shell's focus trap, `aria-modal` subtree and `inert` handling.
- Focus enters the dialog on open and returns to the opening trigger on Escape — pinned on both placements by T-FOCUS.
- The caret is `aria-hidden` and `pointer-events-none`; `aria-hidden` does not disable hit-testing, so the second half is load-bearing.
- Reachability of Confirm **and** Cancel asserted by `elementFromPoint`, not rect maths, because a clipped popover reports an unclipped box.

**Responsive**

Swept at 390×{844, 740, 667, 620, 560} with containment, side selection, width, caret, focus and armed-confirm reachability asserted at every height. The armed-resize case flips 844→560 across the placement boundary and asserts the armed confirm is neither dropped nor remounted.

**P0/P1: none.** Findings 1–3 are P2/P3, accepted with reasons above; one new backlog entry filed.

---

## Verification

| gate | result |
| --- | --- |
| `pnpm test` | 17,036 passed / 56 skipped |
| `pnpm exec tsc --noEmit` | clean |
| `pnpm lint` | 0 errors (41 pre-existing warnings) |
| `pnpm format:check` | clean |
| `pnpm build` | compiles |
| `admin-lifecycle-layout.spec.ts` (mobile-safari) | all cases pass, incl. the 5-height sweep |
| `T-HUB-ZORDER` (desktop-chromium) | passes after the `z-30` removal |
| `_metaDeferralLedgerGraduation` | passes, with this branch's two graduations registered |

## Ledger outcomes

- `SHAREHUB-ARM-VIEWPORT-REVEAL-1` — RESOLVED; entry rewritten in `BACKLOG.md` because the original recorded a mitigation that could never have worked, and understated both severity and scope.
- `SHAREHUB-ARCHIVE-GRAVITY-CUE-1` — REFUTED and archived with reasoning.
- Filed: `BL-ATTENTION-MENU-PANEL-CLIP`, `BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS`, `BL-PUBLISHED-TOGGLE-OVERLAY-CLIP`, `BL-SHAREHUB-CONFIRM-NAMES-SHOW`.
