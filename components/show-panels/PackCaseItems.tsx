"use client";

/**
 * components/show-panels/PackCaseItems.tsx
 *
 * The first interactive leaf (spec §6.1 line 288): a case's item rows under an
 * items cap, with the Show all / Show fewer toggle, so the full parsed list is one
 * click away without letting a fat case dominate the column. The rows come from
 * `PackListBody`, which owns the list element and its markup; this file holds only
 * the toggle's state, and renders the tail of that same list.
 *
 * Only the admin passes an items cap, so the crew page never mounts this.
 */
import { useState, type ReactNode } from "react";

export function PackCaseItems({ rows, cap }: { rows: readonly ReactNode[]; cap: number }) {
  const [showAll, setShowAll] = useState(false);
  const overflow = rows.length - cap;
  return (
    <>
      {showAll ? rows : rows.slice(0, cap)}
      {overflow > 0 ? (
        <li>
          {/* Instant — deliberate (in-place list length change, no animation). */}
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            // Class A tap-floor recipe (spec 2026-08-10-tap-target-inline-controls §2, site 4),
            // applied verbatim. Growth is in flow: the tail row gets taller, nothing overlaps.
            // `w-fit` is belt-and-braces HERE specifically — this control is inline-level inside a
            // plain <li>, so it already shrink-wraps. It carries load at the recipe's other sites,
            // where the control is a direct flex child and CSS blockifies it to full width.
            //
            // The underline is AT REST, not `hover:` (spec 2026-08-15-step3-tap-cluster §2.4).
            // Hover-only left 44px of text looking exactly like the static items above it, on a
            // surface read at venues where nothing can hover. This is the codebase's at-rest
            // underline idiom, already worn by every sibling text toggle in the review sections.
            className="inline-flex w-fit min-h-tap-min items-center rounded-sm font-medium text-text underline underline-offset-2 hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {showAll ? "Show fewer items" : `Show all ${rows.length} items`}
          </button>
        </li>
      ) : null}
    </>
  );
}
