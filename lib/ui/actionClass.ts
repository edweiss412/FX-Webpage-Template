/**
 * lib/ui/actionClass.ts
 *
 * The ONE secondary-action treatment. Every non-primary action button shares it
 * verbatim, so a row that offers "View" and a row that offers "Permanently
 * ignore" offer them in the same voice.
 *
 * Why a constant rather than a convention: STEP3-GALLERY-TAP-TARGETS-1 item (d)
 * found FIVE treatments inside one Step-3 row slot — a bare-text "View", an
 * outlined "Review", and three near-identical outlines that disagreed on
 * padding, weight, fill and focus offset. Each was locally reasonable and the
 * set was not, which is the failure a convention cannot catch and a shared
 * string cannot express. `tests/components/admin/wizard/step3RowSlot.test.tsx`
 * pins the count at one.
 *
 * The value is the outline the recovery actions already carried (Re-scan /
 * Retry now / Defer / Permanently ignore) — the majority treatment, and the one
 * DESIGN.md permits: `--color-text-subtle` is documented "never the resting
 * color of an action target, except the three carve-out families in §1.1a"
 * (amended 2026-08-14; before that amendment it read "Never used for action
 * targets"), and a ghost "View" in that token is neither the majority treatment
 * nor a carve-out.
 *
 * THE OUTLINE TOKEN IS `--color-text-faint`, NOT `--color-border-strong`
 * (2026-08-14, DESIGN.md §1.2a control-outline rule). A border token is tuned
 * as a tile edge BESIDE a fill; this outline stands alone on a near-ground
 * `bg-bg` button, so it takes the sanctioned text ramp instead. Measured:
 * `border-strong` drew the boundary at 1.59:1 light / 1.60:1 dark; `text-faint`
 * draws it at 3.35:1 / 3.76:1 on `bg-surface` and 3.02:1 / 4.11:1 on the
 * `bg-surface-sunken` attention plate. This is a deliberate design upgrade of a
 * legitimate 1.4.11 posture, NOT a compliance repair — the old boundary was not
 * a WCAG failure (spec §1.1 R5). `tests/styles/secondary-action-contrast.test.ts`
 * pins both the token and the ratios.
 *
 * No `focus-visible:ring-offset-*`: one constant cannot carry a correct offset
 * COLOR across the surfaces it lands on (`bg-surface` cards, the
 * `bg-surface-sunken` attention plate), and an offset painted in the wrong
 * colour is a visible halo. The ring sits flush on the control's own edge and
 * reads in both themes.
 *
 * Placement is the caller's (`self-start`, `w-full`, `shrink-0`) — compose with
 * `cn()`. The treatment is not.
 */
export const SECONDARY_ACTION_CLASS =
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-text-faint bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
