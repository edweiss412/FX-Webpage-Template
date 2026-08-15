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
 * DESIGN.md permits: `--color-text-subtle` is documented "Never used for action
 * targets", which is what the old ghost "View" wore.
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
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
