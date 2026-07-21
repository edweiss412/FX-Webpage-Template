/**
 * components/admin/CorrectionLoopCallout.tsx — Flow 3 (audit 3.1).
 *
 * A one-line "how to fix a flagged value" instruction co-located with the
 * flagged-warnings area. `mode` picks the verb ("re-sync" for the live per-show
 * loop / "re-scan" for the pre-publish wizard loop); `children` is the affordance
 * slot (per-show mounts <ReSyncButton>; the wizard mounts nothing because it
 * already carries <RescanSheetButton>). Copy is hard-coded UI guidance, never a
 * message-catalog code (invariant 5).
 *
 * No 'use client' and no server-only imports (no next/headers, no DB, no server
 * action) — so it is safe to render in BOTH a Server Component tree (the per-show
 * page) AND a "use client" tree (the wizard's step3ReviewSections). A plain
 * component imported into a client module simply renders on the client; this is
 * not an RSC boundary violation.
 *
 * Single-source copy (spec §5): one template string parameterized by a verb map,
 * NOT two independently-authored literals. Rendered via {expression} so the
 * apostrophe in "We'll" does not trip react/no-unescaped-entities.
 */
import type { ReactNode } from "react";

const CORRECTION_LOOP_VERB = { resync: "re-sync", rescan: "re-scan" } as const;

/** The shared prefix/suffix live here once; only the verb varies by mode.
 *
 *  EXPORTED for warning-surface-trim §4.2: the published surface renders this
 *  same sentence inside each warning card's help popover instead of as a
 *  panel-level callout. It is exported rather than re-authored because this
 *  module's contract is one template string parameterized by a verb map, NOT
 *  two independently-authored literals that can drift. */
export function correctionLoopCopy(mode: "resync" | "rescan"): string {
  return `Fixed it in the sheet? Edit the cell, save, then ${CORRECTION_LOOP_VERB[mode]}. We'll re-read the sheet and clear this.`;
}

export function CorrectionLoopCallout({
  mode,
  children,
}: {
  mode: "resync" | "rescan";
  children?: ReactNode;
}): ReactNode {
  return (
    <div
      data-testid="correction-loop-callout"
      className="flex flex-col gap-2 rounded-sm border border-border bg-surface-sunken p-3 text-sm text-text-subtle sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="min-w-0">{correctionLoopCopy(mode)}</p>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
