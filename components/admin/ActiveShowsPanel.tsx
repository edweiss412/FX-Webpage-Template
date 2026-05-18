/**
 * components/admin/ActiveShowsPanel.tsx (M10 §B Task 10.6 / Phase 2)
 *
 * Panel 1 of the post-onboarding /admin Dashboard per spec §9.1.
 * Renders a list of `shows` rows with title, dates, crew count, and
 * last-sync status. Server Component — receives pre-fetched rows from
 * <Dashboard />.
 */
import Link from "next/link";

export type ActiveShowRow = {
  id: string;
  slug: string;
  title: string | null;
  showDateStart: string | null;
  showDateEnd: string | null;
  crewCount: number | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  published: boolean;
};

type ActiveShowsPanelProps = {
  rows: ActiveShowRow[];
};

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const toShort = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
  };
  if (start && end) return `${toShort(start)} → ${toShort(end)}`;
  return toShort((start ?? end)!);
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusGlyph(status: string | null, published: boolean): {
  label: string;
  tone: "ok" | "warn" | "err" | "publishing";
} {
  if (!published) return { label: "Publishing…", tone: "publishing" };
  switch (status) {
    case "ok":
    case "synced":
      return { label: "✓", tone: "ok" };
    case "pending_review":
      return { label: "⚠ Review staged changes", tone: "warn" };
    case "parse_error":
    case "sheet_unavailable":
      return { label: "✗ Needs attention", tone: "err" };
    default:
      return { label: "—", tone: "ok" };
  }
}

function toneClass(tone: "ok" | "warn" | "err" | "publishing"): string {
  switch (tone) {
    case "ok":
      return "text-text-subtle";
    case "warn":
      return "text-warning-text";
    case "err":
      return "text-warning-text";
    case "publishing":
      return "text-accent-on-bg";
  }
}

export function ActiveShowsPanel({ rows }: ActiveShowsPanelProps) {
  return (
    <section
      data-testid="admin-active-shows-panel"
      aria-labelledby="active-shows-heading"
      className="flex flex-col gap-3"
    >
      <h3
        id="active-shows-heading"
        className="text-lg font-semibold text-text-strong"
      >
        Active shows
      </h3>
      {rows.length === 0 ? (
        <div
          data-testid="admin-active-shows-empty"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
        >
          <p className="font-semibold text-text-strong">
            You do not have any shows yet.
          </p>
          <p>
            Share a sheet into your watched Drive folder and the sync will
            pick it up.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const glyph = statusGlyph(row.lastSyncStatus, row.published);
            const dates = formatDateRange(row.showDateStart, row.showDateEnd);
            return (
              <li
                key={row.id}
                data-testid={`admin-active-show-row-${row.slug}`}
                className="flex flex-col gap-1 rounded-md border border-border bg-surface p-tile-pad sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex flex-col gap-0.5 sm:flex-1">
                  <Link
                    href={`/admin/show/${encodeURIComponent(row.slug)}`}
                    className="text-base font-semibold text-text-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  >
                    {row.title ?? row.slug}
                  </Link>
                  {dates ? (
                    <p className="text-sm text-text-subtle tabular-nums">{dates}</p>
                  ) : null}
                </div>
                <p className="text-sm text-text-subtle tabular-nums sm:min-w-[7rem]">
                  {row.crewCount ?? 0} crew
                </p>
                <p
                  className={`text-sm tabular-nums ${toneClass(glyph.tone)} sm:min-w-[10rem]`}
                >
                  {formatRelative(row.lastSyncedAt)} · {glyph.label}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
