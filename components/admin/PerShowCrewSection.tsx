/**
 * components/admin/PerShowCrewSection.tsx
 *
 * M11.5 §B Task F1: per-show admin crew section, simplified for the
 * picker pivot. The M9.5 per-row Issue/Revoke affordances and the
 * section-level Revoke-all are GONE — the share-link model is one
 * link per show, mutated only by the section-level Reset + Rotate
 * buttons mounted on the admin page (Tasks F2 + F3 + F4).
 *
 * What this component still owns:
 *   - the "Crew" section heading + roster row list
 *   - the crewLookupFailed warning branch (so a Supabase outage
 *     doesn't collapse into the empty-state)
 *   - empty-state when the roster is empty
 *
 * Server Component. No client islands remain.
 *
 */

export type PerShowCrewRow = {
  id: string;
  name: string;
  role: string | null;
};

export function PerShowCrewSection({
  crew,
  crewLookupFailed = false,
}: {
  showId?: string;
  crew: PerShowCrewRow[];
  crewLookupFailed?: boolean;
}) {
  if (crewLookupFailed) {
    return (
      <section data-testid="per-show-crew-section" className="space-y-3">
        <h2 className="text-lg font-semibold text-text-strong">Crew</h2>
        <p
          data-testid="per-show-crew-lookup-failed"
          role="alert"
          className="rounded-md border border-warning-text/40 bg-warning-bg p-tile-pad text-sm text-warning-text"
        >
          Crew list temporarily unavailable. Refresh to retry. If this
          persists, check Supabase health or page on-call.
        </p>
      </section>
    );
  }

  if (crew.length === 0) {
    return (
      <section data-testid="per-show-crew-section" className="space-y-3">
        <h2 className="text-lg font-semibold text-text-strong">Crew</h2>
        <p
          data-testid="per-show-crew-empty"
          className="rounded-md border border-border bg-surface p-tile-pad text-sm text-text-subtle"
        >
          No crew members on this show yet.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="per-show-crew-section" className="space-y-3">
      <h2 className="text-lg font-semibold text-text-strong">Crew</h2>
      <ul className="flex flex-col gap-2">
        {crew.map((row) => (
          <li
            key={row.id}
            data-testid="per-show-crew-row"
            data-crew-name={row.name}
            className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-surface p-tile-pad"
          >
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-text-strong wrap-break-word">
                {row.name}
              </p>
              {row.role !== null && (
                <p className="mt-1 text-xs text-text-faint">{row.role}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
