"use client";

/**
 * components/admin/dev/ScenarioBlock.tsx
 * (spec 2026-07-20-attention-scenario-gallery §4.0, §4.1, §4.4)
 *
 * One scenario's rendering in the gallery: the attention pill and its live
 * menu, the bucketed cards grouped by where bucketAttention placed them, the
 * hold items that deliberately never bucket, both warning-card skins, and a
 * readout of the derived fields so a reviewer can see WHY a card landed where
 * it did without opening devtools.
 *
 * The cards themselves arrive as already-rendered ReactNodes: bucketAttention
 * returns pre-rendered nodes, not items, so the page (a server component) calls
 * it and this client component only lays the results out.
 *
 * §4.4 — this is an eyeball instrument, not a live surface. Every server action
 * reachable from a real card posts through a form submit, so ONE capture-phase
 * preventDefault on the root neutralizes all of them, including any added
 * later, with no change to the production components. `inert` would have worked
 * too but would also kill the menu, the toggle, and every focus ring, which are
 * exactly the things a reviewer is here to look at.
 */
import { useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AttentionMenu } from "@/components/admin/showpage/AttentionMenu";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import type { ParseWarning } from "@/lib/parser/types";

export type ReadoutRow = { label: string; value: string };

export type ScenarioGroup = {
  sectionId: string;
  placement: "sectionTop" | "crewRow" | "anchor";
  anchorOrCrewKey: string | null;
  nodes: ReactNode[];
};

export type ScenarioBlockProps = {
  scenarioId: string;
  label: string;
  items: AttentionItem[];
  groups: ScenarioGroup[];
  holdItems: AttentionItem[];
  readout: ReadoutRow[];
  /** Tri-state (§3.4): `null` = this scenario does not control warnings, so no
   *  warning surface renders at all. `[]` = it controls them and there are none,
   *  which renders both skins empty — a visibly different statement. */
  warnings: ParseWarning[] | null;
  degraded: boolean;
  maxWidthPx: number | null;
};

const GALLERY_DRIVE_FILE_ID = "gallery-fixture";

export function ScenarioBlock(props: ScenarioBlockProps) {
  // Spec §4.4's known fidelity caveat, made explicit rather than silent:
  // AttentionBanner reads usePathname() for its route-gated Learn-more link
  // (components/admin/review/AttentionBanner.tsx:101). Under the gallery that
  // value is the gallery path, so the gate evaluates differently than it does in
  // production. Printing it means a reviewer sees WHY a link differs here
  // instead of trusting a card that is quietly wrong about one prop.
  const route = usePathname() ?? "/";
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(true);
  const [navigated, setNavigated] = useState<string | null>(null);

  // Positive finite only: never emit "NaNpx" or "-1px". The page normalizes this
  // value, so the guard is belt-and-braces rather than a second parser.
  const maxWidth =
    props.maxWidthPx !== null && Number.isFinite(props.maxWidthPx) && props.maxWidthPx > 0
      ? `${props.maxWidthPx}px`
      : undefined;

  return (
    <section
      data-testid="block-root"
      data-scenario-id={props.scenarioId}
      // pb-104 (26rem) reserves room for the absolutely-positioned menu so an
      // open menu never overlaps the next scenario. The plan wrote this as the
      // arbitrary value pb-[26rem]; the canonical-classes lint rewrote it, and
      // the two are the same length. Task 16 measures whether it is sufficient
      // at both widths.
      className="relative mb-16 pb-104"
      style={maxWidth === undefined ? undefined : { maxWidth }}
      onSubmitCapture={(e) => e.preventDefault()}
    >
      <h2 id={props.scenarioId} className="mb-2 text-lg font-bold text-text-strong">
        {props.label}
      </h2>

      <dl data-testid="readout" className="mb-3 text-xs/relaxed">
        {[...props.readout, { label: "route (usePathname)", value: route }].map((r) => (
          <div key={`${r.label}:${r.value}`}>
            <dt className="inline font-semibold text-text-strong">{r.label}</dt>
            <dd className="ml-2 inline font-mono text-text-subtle">{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className="relative inline-block">
        <button
          ref={pillRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-h-tap-min rounded-pill border border-border px-3 text-xs font-medium text-text-strong focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none"
        >
          {props.degraded ? "Attention (degraded)" : `Attention (${props.items.length})`}
        </button>
        <AttentionMenu
          items={props.items}
          open={open}
          onClose={() => setOpen(false)}
          onNavigate={(item) => setNavigated(item.id)}
          pillRef={pillRef}
        />
      </div>

      {navigated === null ? null : (
        <p data-testid="navigated" className="mt-2 font-mono text-xs text-text-subtle">
          navigate: {navigated}
        </p>
      )}

      {props.groups.map((g) => (
        <div
          key={`${g.sectionId}-${g.placement}-${g.anchorOrCrewKey ?? ""}`}
          // The key is disambiguated by anchor/crew key, so the testid must be
          // too: two groups in one section and placement (a section top plus the
          // composed notes group, or two anchors in rooms) would otherwise emit
          // duplicate testids and make getByTestId throw.
          data-testid={
            g.anchorOrCrewKey === null
              ? `group-${g.sectionId}-${g.placement}`
              : `group-${g.sectionId}-${g.placement}-${g.anchorOrCrewKey}`
          }
        >
          <h3 className="mt-4 text-xs font-semibold text-text-subtle">
            {g.sectionId}
            {g.anchorOrCrewKey === null ? "" : ` / ${g.anchorOrCrewKey}`}
          </h3>
          {g.nodes}
        </div>
      ))}

      {props.holdItems.length === 0 ? null : (
        <div data-testid="hold-group">
          <h3 className="mt-4 text-xs font-semibold text-text-subtle">
            Holds (Changes feed, never bucketed)
          </h3>
          <ul>
            {props.holdItems.map((h) => (
              <li key={h.id} className="text-xs/relaxed text-text">
                {h.menuTitle}
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.warnings === null ? null : (
        <>
          <div data-testid="warnings-warning" className="mt-4">
            <PerShowActionableWarnings
              items={props.warnings}
              driveFileId={GALLERY_DRIVE_FILE_ID}
              tone="warning"
            />
          </div>
          <div data-testid="warnings-muted" className="mt-4">
            <PerShowActionableWarnings
              items={props.warnings}
              driveFileId={GALLERY_DRIVE_FILE_ID}
              tone="muted"
            />
          </div>
        </>
      )}
    </section>
  );
}
