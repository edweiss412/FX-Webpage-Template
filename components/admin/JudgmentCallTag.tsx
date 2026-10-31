/**
 * components/admin/JudgmentCallTag.tsx
 * (warning-card-fixes spec §3.3)
 *
 * The "Judgment call" tag on a warning card: the judgment ring from the review
 * pill's mark vocabulary (PILLMARK-1, built by attentionMarkClass so the parity
 * walk needs no exemption) on its own sunken fill, beside the card title.
 *
 * The fill mirrors the quiet judgment-only pill (`border border-text-faint
 * bg-surface-sunken text-text`), so the ring always paints on `surface-sunken`,
 * a plate tests/components/admin/attentionMarkParity.test.ts already pins.
 * `plate` is the background the TAG sits on, which decides only its border, the
 * same split DataQualityWarningControls makes for its outlines: the neutral
 * `border-text-faint` on untinted and sunken plates, the tinted outline token on
 * the amber card. Full literals per key, so the Tailwind JIT sees each one.
 *
 * Not interactive and no tab stop: it describes the warning, it is not a control.
 */
import type { ReactElement } from "react";
import { attentionMarkClass } from "@/components/admin/review/attentionMark";

type JudgmentCallTagPlate = "surface" | "surface-sunken" | "warning-bg";

const TAG_BORDER = {
  surface: "border-text-faint",
  "surface-sunken": "border-text-faint",
  "warning-bg": "border-control-outline-tinted",
} satisfies Record<JudgmentCallTagPlate, string>;

export function JudgmentCallTag({
  plate,
  testId,
}: {
  plate: JudgmentCallTagPlate;
  testId: string;
}): ReactElement {
  return (
    <span
      data-testid={testId}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border bg-surface-sunken px-1.5 py-px text-xs font-medium text-text ${TAG_BORDER[plate]}`}
    >
      <span aria-hidden="true" className={attentionMarkClass("judgment", "sunken")} />
      Judgment call
    </span>
  );
}
