/**
 * components/crew/SectionTileError.tsx — the §4.13 active-section visual
 * fallback (mechanism #3 of three).
 *
 * THE THREE §4.13 ERROR MECHANISMS (kept distinct):
 *
 *   1. Section-independent PROJECTION ALERT (`TILE_PROJECTION_FETCH_FAILED`) —
 *      lives in `_CrewShell` (Phase 2). Admin-observability upsert, fires once
 *      per render. NOT this component.
 *   2. Per-block RENDER-THROW boundary (`WrappedSection` → `TILE_SERVER_RENDER_
 *      FAILED`) — catches a render/transform THROW (Task 9). NOT this component.
 *   3. THIS component — the active-section VISUAL fallback for a FETCH error
 *      flagged in `data.tileErrors[key]`. When a rendered section's block
 *      depends on an errored projection field AND the block's visibility gate is
 *      satisfied → the ADMIN sees this inline degraded block; CREW sees omission
 *      (the section passes `null` instead of this component). It emits NO
 *      `upsertAdminAlert` — the `_CrewShell` projection alert is the sole
 *      producer; a second upsert here would double-fire the same fetch failure.
 *
 * INVARIANT 5 / §4.18 — NEVER a raw error string and NEVER a raw error code.
 * The copy is a fixed, human-readable per-domain string ("Couldn't load rooms
 * for this show."). The errored `tileErrors[key]` message (e.g. a Postgres
 * error) is NOT threaded in — it never reaches the DOM. No em-dash in the copy.
 *
 * Distinguishability (§4.13): an admin viewing the open section can tell a
 * FETCH FAILURE (this degraded block, surface-warn plate) from genuine ABSENCE
 * (silent omission — nothing renders) at a glance.
 *
 * Server Component (no `'use client'`).
 */
import type { JSX } from "react";

/**
 * Per-domain human-readable degraded copy. Keyed by the `tileErrors` key the
 * projection populates (getShowForViewer.ts: hotel / rooms / transportation /
 * contacts / financials). NEVER a raw error code or message; never an em-dash.
 * A domain with no specific entry falls back to a generic load-failure line so
 * the block is never blank or code-leaking.
 */
const DEGRADED_COPY: Record<string, string> = {
  hotel: "Couldn't load hotel details for this show.",
  rooms: "Couldn't load room and scope details for this show.",
  transportation: "Couldn't load transportation details for this show.",
  contacts: "Couldn't load contacts for this show.",
  financials: "Couldn't load budget details for this show.",
};

const GENERIC_COPY = "Couldn't load this part of the show.";

export function SectionTileError({ domain }: { domain: string }): JSX.Element {
  const copy = DEGRADED_COPY[domain] ?? GENERIC_COPY;
  return (
    <div
      data-testid={`section-tile-error-${domain}`}
      data-variant="degraded"
      className="rounded-sm border border-border-strong bg-warning-bg px-3 py-2 text-sm text-warning-text"
    >
      <p>{copy}</p>
      <p className="mt-1 text-xs text-warning-text/80">
        It&apos;s still on the source sheet. Try again in a moment.
      </p>
    </div>
  );
}
