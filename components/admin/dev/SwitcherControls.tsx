"use client";

/**
 * components/admin/dev/SwitcherControls.tsx
 * (spec 2026-07-21-attention-modal-switcher-gallery §3.4)
 *
 * The switcher's control bar. Rendered into a body-level portal by
 * AttentionModalSwitcher so it escapes the admin `[data-inert-root]` and sits
 * above the modal overlay (z-60 > z-50). It is deliberately OUTSIDE the modal's
 * aria-modal tree (the ratified dev-instrument a11y carve-out, spec §1.1);
 * keyboard navigation is handled by the switcher's document listener, and this
 * bar carries aria-labels + an aria-live count for the pointer user.
 */
import type { ExcludedScenario } from "@/lib/dev/galleryModalTypes";

type Props = {
  index: number;
  total: number;
  label: string;
  tier: 1 | 2;
  codes: string[];
  excluded: ExcludedScenario[];
  onPrev: () => void;
  onNext: () => void;
};

const STEP_BTN =
  "min-h-tap-min min-w-tap-min inline-flex items-center justify-center rounded-md border border-border bg-surface px-3 text-text-strong hover:border-accent focus-visible:outline-2 focus-visible:outline-accent";

export function SwitcherControls({
  index,
  total,
  label,
  tier,
  codes,
  excluded,
  onPrev,
  onNext,
}: Props) {
  const structural = excluded.filter((e) => e.reason === "structural");
  const cut = excluded.filter((e) => e.reason === "cut");

  return (
    <div
      data-testid="attention-switcher-controls"
      role="group"
      aria-label="Scenario switcher"
      className="fixed inset-x-0 top-0 z-60 mx-auto flex max-w-3xl flex-col gap-1 rounded-b-xl border border-t-0 border-border bg-surface/95 px-4 py-2 shadow-lg backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <button type="button" className={STEP_BTN} onClick={onPrev} aria-label="Previous scenario">
          Prev
        </button>
        <button type="button" className={STEP_BTN} onClick={onNext} aria-label="Next scenario">
          Next
        </button>
        <span aria-live="polite" className="text-xs tabular-nums text-text-subtle">
          {index + 1} / {total}
        </span>
        <span className="text-sm font-medium text-text-strong">{label}</span>
        <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-text-subtle">
          tier {tier}
        </span>
        {codes.length > 0 && (
          <span className="truncate font-mono text-xs text-text-subtle" title={codes.join(", ")}>
            {codes.join(", ")}
          </span>
        )}
      </div>
      {structural.length > 0 && (
        <p className="text-xs text-text-subtle">
          Not shown (card-only structural probes): {structural.map((e) => e.label).join(", ")}
        </p>
      )}
      {cut.length > 0 && (
        <p className="text-xs text-text-subtle">
          {cut.length} cut from the published attention surface (telemetry codes, not shown in this
          modal).
        </p>
      )}
    </div>
  );
}
