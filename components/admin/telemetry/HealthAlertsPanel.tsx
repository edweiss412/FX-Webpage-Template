/**
 * components/admin/telemetry/HealthAlertsPanel.tsx
 * (alert-audience-split Task 8/9, spec §6.6)
 *
 * The developer-only detail list of unresolved health-audience `admin_alerts`,
 * rendered ABOVE the cron-health/event-timeline content on the already-
 * `requireDeveloper`-gated /admin/dev/telemetry page. Health-audience alerts no
 * longer surface on Doug's amber banner/bell/per-show; the developer deep-link
 * lands HERE so "nothing goes dark" holds for the person who can act.
 *
 * Ordering: health weight lives in the CATALOG, not a DB column, so degraded
 * rows are ALWAYS shown before notice rows via TWO partitioned queries
 * (loadHealthAlerts per weight). Each partition paginates independently via SSR
 * `?dpage`/`?npage` search params + a per-partition "Load more" Link — the page
 * size is NOT a hard ceiling, so every row (every degraded row especially) is
 * reachable and (Task 9) resolvable.
 *
 * Invariant 5: per-row copy via lib/messages/lookup (never a raw code string;
 * unknown-code guard like AlertBanner). Invariant 9: loadHealthAlerts returns a
 * typed infra_error → this renders a cataloged degraded panel, never a silent
 * empty. Async Server Component (tokens only).
 */
import Link from "next/link";
import { loadHealthAlerts, type HealthAlertRow } from "@/lib/admin/healthAlerts";
import { resolveAlertAction } from "@/lib/adminAlerts/alertActions";
import { messageFor, type MessageParams } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { renderCatalogEmphasis } from "@/components/messages/renderEmphasis";
import { formatRelative } from "@/lib/time/relative";
import { nowDate } from "@/lib/time/now";
import { HealthAlertResolveButton } from "@/components/admin/telemetry/HealthAlertResolveButton";

type SearchParams = Record<string, string | string[] | undefined>;

// Non-numeric / negative page params clamp to 0 (crafted ?dpage=foo / -1).
function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function loadMoreHref(
  searchParams: SearchParams,
  param: "dpage" | "npage",
  nextPage: number,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v == null) continue;
    qs.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
  }
  qs.set(param, String(nextPage));
  return `/admin/dev/telemetry?${qs.toString()}#health`;
}

const PANEL_CLASS = "flex flex-col gap-section-gap";

function HealthAlertRowItem({
  row,
  weight,
  now,
}: {
  row: HealthAlertRow;
  weight: "degraded" | "notice";
  now: Date;
}) {
  const cataloged = row.code in MESSAGE_CATALOG;
  // RAW catalog templates (uninterpolated) — rendered via renderCatalogEmphasis so
  // catalog Markdown markers (`*em*`) become styled <em>/<strong> and context params
  // insert as opaque text, never leaking literal markers or the raw code (invariant 5).
  const raw = cataloged ? messageFor(row.code as MessageCode) : null;
  const params = (row.context as MessageParams | null) ?? undefined;
  // title is pinned marker-free; dougFacing carries the developer detail.
  const headingTemplate = raw?.title ?? raw?.dougFacing ?? null;
  const detailTemplate = raw?.title ? raw.dougFacing : null;
  const followUpTemplate = raw?.followUp ?? null;
  const action = resolveAlertAction(row.code, row.context, { slug: row.slug });

  return (
    <li
      data-testid={`health-alert-row-${row.id}`}
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-tile-pad text-text"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-text-strong">
          {headingTemplate
            ? renderCatalogEmphasis(headingTemplate, params)
            : "A system-health item needs attention."}
        </p>
        <span
          data-testid={`health-alert-weight-${row.id}`}
          className={`shrink-0 rounded-pill px-2 py-0.5 text-xs font-medium ${
            weight === "degraded"
              ? "bg-status-degraded text-status-degraded-text"
              : "bg-surface-sunken text-text-subtle"
          }`}
        >
          {weight === "degraded" ? "Degraded" : "Notice"}
        </span>
      </div>
      {detailTemplate ? (
        <p className="max-w-prose text-sm text-text-subtle">
          {renderCatalogEmphasis(detailTemplate, params)}
        </p>
      ) : null}
      {followUpTemplate ? (
        <p className="text-xs text-text-subtle">
          {renderCatalogEmphasis(followUpTemplate, params)}
        </p>
      ) : null}
      {row.identityText ? (
        <p
          data-testid={`health-alert-identity-${row.id}`}
          className="wrap-break-word text-sm text-text-subtle"
        >
          {row.identityText}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-xs text-text-subtle">
        <span className="tabular-nums">
          Raised{" "}
          <time dateTime={row.raised_at} title={row.raised_at} suppressHydrationWarning>
            {formatRelative(row.raised_at, now)}
          </time>
        </span>
        <span className="tabular-nums">
          {row.occurrence_count} occurrence{row.occurrence_count === 1 ? "" : "s"}
        </span>
        {row.show_id && row.slug ? (
          <Link
            data-testid={`health-alert-show-link-${row.id}`}
            href={`/admin/show/${encodeURIComponent(row.slug)}`}
            className="inline-flex min-h-tap-min items-center underline"
          >
            View show
          </Link>
        ) : null}
        {action ? (
          <a
            href={action.href}
            data-testid={`health-alert-action-${row.id}`}
            {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="inline-flex min-h-tap-min items-center font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            {action.label}
            {action.external ? <span aria-hidden="true"> ↗</span> : null}
          </a>
        ) : null}
      </div>
      <HealthAlertResolveButton alertId={row.id} />
    </li>
  );
}

function Section({
  weight,
  rows,
  hasMore,
  href,
  now,
}: {
  weight: "degraded" | "notice";
  rows: HealthAlertRow[];
  hasMore: boolean;
  href: string;
  now: Date;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-text-strong">
        {weight === "degraded" ? "Degraded" : "Notices"}
      </h3>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <HealthAlertRowItem key={row.id} row={row} weight={weight} now={now} />
        ))}
      </ul>
      {hasMore ? (
        <Link
          data-testid={`health-load-more-${weight}`}
          href={href}
          className="inline-flex min-h-tap-min items-center self-start rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Load more
        </Link>
      ) : null}
    </div>
  );
}

export async function HealthAlertsPanel({ searchParams }: { searchParams: SearchParams }) {
  const dpage = parsePage(searchParams.dpage);
  const npage = parsePage(searchParams.npage);
  const [degraded, notice, now] = await Promise.all([
    loadHealthAlerts({ weight: "degraded", page: dpage }),
    loadHealthAlerts({ weight: "notice", page: npage }),
    nowDate(),
  ]);

  // Invariant 9: a returned/thrown error → a cataloged degraded panel, never a
  // silent empty. The anchor id stays so the deep-link still scrolls here.
  if (degraded.kind === "infra_error" || notice.kind === "infra_error") {
    return (
      <section
        id="health"
        data-testid="health-alerts-panel-degraded"
        aria-labelledby="health-alerts-heading"
        className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
      >
        <h2 id="health-alerts-heading" className="text-base font-semibold">
          System health
        </h2>
        <p>Couldn’t load system-health alerts right now. Refresh in a moment.</p>
      </section>
    );
  }

  const isEmpty = degraded.rows.length === 0 && notice.rows.length === 0;

  return (
    <section
      id="health"
      data-testid="health-alerts-panel"
      aria-labelledby="health-alerts-heading"
      className={PANEL_CLASS}
    >
      <h2 id="health-alerts-heading" className="text-base font-semibold text-text-strong">
        System health
      </h2>
      {isEmpty ? (
        <p className="text-sm text-text-subtle">No open system-health alerts.</p>
      ) : (
        <>
          <Section
            weight="degraded"
            rows={degraded.rows}
            hasMore={degraded.hasMore}
            href={loadMoreHref(searchParams, "dpage", dpage + 1)}
            now={now}
          />
          <Section
            weight="notice"
            rows={notice.rows}
            hasMore={notice.hasMore}
            href={loadMoreHref(searchParams, "npage", npage + 1)}
            now={now}
          />
        </>
      )}
    </section>
  );
}
