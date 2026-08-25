/**
 * components/admin/StagedPreviewBanner.tsx
 *
 * Sticky banner above the staged crew preview
 * (`/admin/wizard/preview/[stagedId]`). Spec:
 * docs/superpowers/specs/step3-onboarding/2026-08-15-step3-crew-preview-and-opslog-disposition-design.md §2.5.
 *
 * Visual recipe is `PreviewBanner`'s verbatim (components/admin/PreviewBanner.tsx:60-71):
 * `role="status"`, `aria-live="polite"`, sticky top, `z-sticky-banner`,
 * `bg-warning-bg text-warning-text`, `shadow-tile`, `border-b border-border-strong`.
 *
 * The copy is parenthesized rather than dash-separated because DESIGN.md §9 bans
 * the em dash in user-visible copy.
 *
 * Static by contract: no client state, no animation, no `transition-` class —
 * the chrome has exactly ONE state and changes only by full navigation (spec
 * Transition Inventory). `tests/components/admin/stagedPreviewBanner.test.tsx`
 * pins that.
 *
 * Server Component (no "use client").
 */
import Link from "next/link";

import type { StagedPreviewRosterEntry } from "@/lib/data/stagedShowForViewer";

/** Roster size at or below which every entry renders inline (spec §2.3). */
export const STAGED_PICKER_INLINE_CAP = 12;
/** Entries kept inline once the roster exceeds the cap; the rest go in the disclosure. */
export const STAGED_PICKER_INLINE_HEAD = 11;

export type StagedPreviewBannerProps = {
  /** `pending_syncs.staged_id` — the preview route's path parameter. */
  stagedId: string;
  /** The adapter's roster, in surrogate-id order. */
  roster: StagedPreviewRosterEntry[];
  /** The adapter's resolved selection (never an unknown id). */
  selectedId: string;
  /**
   * The entry-time `?s=` deep link. Accepted so the banner's own links can stay
   * deliberately section-less (§2.3): in-page section state is a client-only
   * `pushState` a Server Component cannot observe, so carrying `s` would
   * routinely point at the WRONG section after an in-page toggle.
   */
  rawSection?: string | undefined;
};

/** `min-h-tap-min` on every interactive target (AGENTS.md mechanical UI gate). */
const TARGET_BASE =
  "inline-flex min-h-tap-min items-center rounded-sm px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg";

function PickerEntry({
  entry,
  stagedId,
  isCurrent,
}: {
  entry: StagedPreviewRosterEntry;
  stagedId: string;
  isCurrent: boolean;
}) {
  if (isCurrent) {
    return (
      <span
        data-testid="staged-preview-picker-current"
        aria-current="true"
        /* Takes the picker LINK's outline weight, per §1.2a's pairing clause
           (D3): the two render side by side in one row off the same
           TARGET_BASE, and the current entry reading lighter than the entries
           you can switch to inverts the hierarchy. The token is the tinted-plate
           one because that is what its twin wears — the row stands on the
           banner's bg-warning-bg plate. Still non-interactive chrome: this is
           hierarchy, not SC 1.4.11. */
        className={`${TARGET_BASE} border border-control-outline-tinted bg-surface text-text-strong`}
      >
        {entry.name}
      </span>
    );
  }
  return (
    <Link
      data-testid="staged-preview-picker-link"
      href={`/admin/wizard/preview/${stagedId}?as=${encodeURIComponent(entry.id)}`}
      className={`${TARGET_BASE} border border-control-outline-tinted text-warning-text hover:bg-surface`}
    >
      {entry.name}
    </Link>
  );
}

export function StagedPreviewBanner({ stagedId, roster, selectedId }: StagedPreviewBannerProps) {
  if (roster.length === 0) return null;

  const selected = roster.find((entry) => entry.id === selectedId) ?? roster[0]!;
  const overflows = roster.length > STAGED_PICKER_INLINE_CAP;
  const inlineEntries = overflows ? roster.slice(0, STAGED_PICKER_INLINE_HEAD) : roster;
  const disclosedEntries = overflows ? roster.slice(STAGED_PICKER_INLINE_HEAD) : [];

  return (
    <aside
      data-testid="staged-preview-banner"
      role="status"
      aria-live="polite"
      aria-label="Staged crew preview banner"
      style={{ position: "sticky", top: 0 }}
      className="z-sticky-banner border-b border-border-strong bg-warning-bg text-warning-text shadow-tile"
    >
      <div className="mx-auto flex w-full max-w-300 flex-col gap-3 px-4 py-3 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex flex-1 flex-wrap items-center gap-2 text-sm sm:text-base">
            <span data-testid="staged-preview-banner-title" className="font-semibold">
              Previewing from the sheet (not published yet)
            </span>
          </p>
          {/* Deliberately NOT the inverted-amber `bg-warning-text text-warning-bg`
              pair: DESIGN.md §14 reserves that as the confirm-go recipe for
              DESTRUCTIVE mutations, and this is a plain navigation. It also renders
              as the same underlined "Back to setup" affordance the §2.7 failure
              surfaces use, so the exit reads identically everywhere in this arc.
              `text-text-strong` on `warning-bg` is 17.4:1 light / 12.0:1 dark
              (DESIGN.md §1.2), comfortably AAA. */}
          <Link
            data-testid="staged-preview-banner-exit"
            href="/admin"
            className={`${TARGET_BASE} text-text-strong underline underline-offset-2`}
          >
            Back to setup
          </Link>
        </div>

        <p data-testid="staged-preview-banner-identity" className="text-sm">
          {selected.role.trim().length > 0
            ? `Viewing as ${selected.name} (${selected.role})`
            : `Viewing as ${selected.name}`}
        </p>

        {/* A labelled navigation landmark: without it the picker reads as a bare
            run of person names with no stated purpose (impeccable audit, a11y). */}
        <nav aria-label="Preview as another crew member" className="flex flex-col gap-2">
          <div
            data-testid="staged-preview-picker-inline"
            className="flex flex-wrap items-center gap-2"
          >
            {inlineEntries.map((entry) => (
              <PickerEntry
                key={entry.id}
                entry={entry}
                stagedId={stagedId}
                isCurrent={entry.id === selected.id}
              />
            ))}
          </div>

          {/* INSIDE the landmark (diff review round 1): overflow entries in a
              sibling of the nav would reach assistive tech as bare person-name
              links with none of the picker's stated purpose. */}
          {disclosedEntries.length > 0 ? (
            <details data-testid="staged-preview-picker-more">
              <summary className="inline-flex min-h-tap-min cursor-pointer items-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
                {`Show ${disclosedEntries.length} more crew`}
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {disclosedEntries.map((entry) => (
                  <PickerEntry
                    key={entry.id}
                    entry={entry}
                    stagedId={stagedId}
                    isCurrent={entry.id === selected.id}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </nav>
      </div>
    </aside>
  );
}
