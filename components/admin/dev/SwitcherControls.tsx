"use client";

/**
 * components/admin/dev/SwitcherControls.tsx
 * (spec 2026-07-21-attention-modal-switcher-gallery §3.4, amended by
 *  spec 2026-07-21-gallery-switcher-slim-bar: slim single-row bar, footnotes
 *  behind a collapsed-by-default disclosure so the collapsed bar clears the
 *  modal panel — ATTN-GALLERY-CONTROLBAR-OVERLAP-1)
 *
 * The switcher's control bar. Rendered into a body-level portal by
 * AttentionModalSwitcher so it escapes the admin `[data-inert-root]` and sits
 * above the modal overlay (z-60 > z-50). It is deliberately OUTSIDE the modal's
 * aria-modal tree (the ratified dev-instrument a11y carve-out, spec §1.1);
 * keyboard navigation is handled by the switcher's document listener, and this
 * bar carries aria-labels + an aria-live region (position + human label) for the
 * pointer and screen-reader user.
 *
 * Raw catalog codes are NOT rendered as visible copy (invariant 5: user-visible
 * UI reads codes through the catalog, not verbatim). The scenario's human
 * `label` is the visible identity; the codes ride a non-visible `data-codes`
 * attribute for devtools/e2e inspection.
 */
import { useState } from "react";
import { GROUP_LABELS } from "@/lib/dev/galleryModalTypes";
import type { ExcludedScenario, ScenarioGroupId } from "@/lib/dev/galleryModalTypes";

const STEP_BTN =
  "min-h-tap-min min-w-tap-min inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-surface px-3 text-text-strong hover:border-accent active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-accent";

const EXCLUDED_PANEL_ID = "switcher-excluded-panel";

export type SwitcherGroupEntry = {
  id: ScenarioGroupId;
  label: string;
  count: number;
  firstIndex: number;
};

type Props = {
  index: number;
  total: number;
  label: string;
  tier: 1 | 2 | 3;
  codes: string[];
  excluded: ExcludedScenario[];
  group: ScenarioGroupId;
  groups: ReadonlyArray<SwitcherGroupEntry>;
  onJumpTo: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
};

export function SwitcherControls({
  index,
  total,
  label,
  tier,
  codes,
  excluded,
  group,
  groups,
  onJumpTo,
  onPrev,
  onNext,
}: Props) {
  const [showExcluded, setShowExcluded] = useState(false);
  const structural = excluded.filter((e) => e.reason === "structural");
  const cut = excluded.filter((e) => e.reason === "cut");
  const panelOpen = showExcluded && excluded.length > 0;

  return (
    <div
      data-testid="attention-switcher-controls"
      data-codes={codes.join(",")}
      role="group"
      aria-label="Scenario switcher"
      className="fixed inset-x-0 top-0 z-60 mx-auto flex max-w-3xl flex-col gap-1 rounded-b-xl border border-t-0 border-border bg-surface/95 px-4 pb-2 pt-[calc(--spacing(2)+env(safe-area-inset-top,0))] shadow-lg backdrop-blur"
    >
      <div className="flex flex-nowrap items-center gap-x-2">
        <button type="button" className={STEP_BTN} onClick={onPrev} aria-label="Previous scenario">
          Prev
        </button>
        <button type="button" className={STEP_BTN} onClick={onNext} aria-label="Next scenario">
          Next
        </button>
        {/* Position + label share one live region so a screen reader announces
            WHICH scenario became active, not just the number (Codex R1 P2). */}
        <div aria-live="polite" className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-xs tabular-nums text-text-subtle">
            {index + 1} / {total}
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-text-strong">{label}</span>
        </div>
        {/* Section jump (spec 2026-07-22 gap-fill §3.5): the select doubles as the
            current-group chip — its value tracks the active scenario's group. */}
        <select
          data-testid="attention-switcher-group-select"
          aria-label="Jump to section"
          className="min-h-tap-min min-w-0 max-w-36 shrink rounded-md border border-border bg-surface px-2 text-xs text-text-subtle hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          value={group}
          onChange={(e) => {
            const g = groups.find((x) => x.id === e.target.value);
            if (g) onJumpTo(g.firstIndex);
          }}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {GROUP_LABELS[g.id]} ({g.count})
            </option>
          ))}
        </select>
        <span className="shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-text-subtle">
          tier {tier}
        </span>
        {excluded.length > 0 && (
          <button
            type="button"
            data-testid="attention-switcher-excluded-toggle"
            className="min-h-tap-min min-w-tap-min inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-surface px-2 text-xs text-text-subtle hover:border-accent active:bg-surface-sunken aria-expanded:border-accent aria-expanded:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-accent"
            aria-expanded={panelOpen}
            {...(panelOpen ? { "aria-controls": EXCLUDED_PANEL_ID } : {})}
            onClick={() => setShowExcluded((v) => !v)}
          >
            {excluded.length} excluded
          </button>
        )}
      </div>
      {panelOpen && (
        <div
          id={EXCLUDED_PANEL_ID}
          data-testid="attention-switcher-excluded-panel"
          className="max-h-[40vh] overflow-y-auto border-t border-border pt-1"
        >
          {structural.length > 0 && (
            <p className="text-xs text-text-subtle">
              Not shown (card-only structural probes): {structural.map((e) => e.label).join(", ")}
            </p>
          )}
          {cut.length > 0 && (
            <p className="text-xs text-text-subtle">
              {cut.length} cut from the published attention surface (telemetry codes, not shown in
              this modal).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
