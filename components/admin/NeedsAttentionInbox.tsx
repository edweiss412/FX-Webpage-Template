// M12.2 Phase A Task 6 — NeedsAttentionInbox (spec §5.3). Consumes the pre-built
// items + exact counts from buildNeedsAttention (Task 3). Per-variant tone pill
// + action:
//   - pending_ingestion → retry/discard buttons (PendingPanelRetryButton /
//     PendingPanelDiscardButtons client islands)
//   - first_seen        → onboarding staged review link (/admin/show/staged/{id})
//   - existing_staged   → per-show review link (/admin/show/{slug}, archived-safe)
// "+N more" is driven by the REAL overflowCount (totalCount − renderedCount),
// never the capped items.length. Copy is the catalog-safe string already
// resolved in the item; this component never renders a raw code/message.
import Link from "next/link";
import type { NeedsAttentionItem } from "@/lib/admin/needsAttention";
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import { formatRelative } from "@/lib/admin/showDisplay";
import { PendingPanelRetryButton } from "@/components/admin/PendingPanelRetryButton";
import { PendingPanelDiscardButtons } from "@/components/admin/PendingPanelDiscardButtons";

type NeedsAttentionInboxProps = {
  items: NeedsAttentionItem[];
  totalCount: number;
  renderedCount: number;
  overflowCount: number;
  // Deterministic "now" for the per-card relative timestamp (mirrors ShowsTable).
  now: Date;
};

const reviewLinkClass =
  "inline-flex min-h-tap-min items-center rounded-md border border-border px-3 text-sm font-semibold text-accent-on-bg underline-offset-2 hover:border-border-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

// Top row of every card: the status eyebrow on the left, a relative activity
// timestamp ("1h ago") pinned right. The <time> is OMITTED entirely when the
// item has no activity time (never renders the bare "never" placeholder).
function CardHeader({
  item,
  now,
  status,
  label,
}: {
  item: NeedsAttentionItem;
  now: Date;
  status: "warn" | "review";
  label: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <StatusIndicator status={status} label={label} />
      {item.activityAt ? (
        <time
          data-testid={`needs-attention-time-${item.key}`}
          dateTime={item.activityAt}
          className="shrink-0 whitespace-nowrap text-xs tabular-nums text-text-faint"
        >
          {formatRelative(item.activityAt, now)}
        </time>
      ) : null}
    </div>
  );
}

function ItemCard({ item, now }: { item: NeedsAttentionItem; now: Date }) {
  if (item.variant === "pending_ingestion") {
    return (
      <li
        data-testid={`needs-attention-item-pending-${item.id}`}
        className="flex flex-col gap-2 rounded-md border border-border bg-surface p-tile-pad shadow-tile"
      >
        <CardHeader item={item} now={now} status="warn" label="Couldn't process a sheet" />
        <p className="text-sm font-semibold text-text-strong">
          {item.driveFileName ?? item.driveFileId}
        </p>
        <p className="text-sm text-text-subtle">{item.copy}</p>
        <div className="flex flex-wrap items-center gap-2">
          <PendingPanelRetryButton pendingIngestionId={item.id} />
          <PendingPanelDiscardButtons pendingIngestionId={item.id} />
        </div>
      </li>
    );
  }

  if (item.variant === "first_seen") {
    return (
      <li
        data-testid={`needs-attention-item-first-seen-${item.stagedId}`}
        className="flex flex-col gap-2 rounded-md border border-border bg-surface p-tile-pad shadow-tile"
      >
        <CardHeader item={item} now={now} status="review" label="New sheet to review" />
        <p className="text-sm font-semibold text-text-strong">
          {item.candidateTitle ?? item.driveFileId}
        </p>
        <Link
          data-testid={`needs-attention-link-first-seen-${item.stagedId}`}
          href={`/admin/show/staged/${encodeURIComponent(item.stagedId)}`}
          className={reviewLinkClass}
        >
          Review →
        </Link>
      </li>
    );
  }

  // existing_staged
  return (
    <li
      data-testid={`needs-attention-item-existing-${item.stagedId}`}
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-tile-pad shadow-tile"
    >
      <CardHeader item={item} now={now} status="review" label="Changes to review" />
      <p className="text-sm font-semibold text-text-strong">{item.title ?? item.slug}</p>
      <Link
        data-testid={`needs-attention-link-${item.slug}`}
        href={`/admin/show/${encodeURIComponent(item.slug)}`}
        className={reviewLinkClass}
      >
        Open show →
      </Link>
    </li>
  );
}

export function NeedsAttentionInbox({
  items,
  overflowCount,
  now,
}: NeedsAttentionInboxProps) {
  if (items.length === 0) {
    return (
      <div
        data-testid="admin-needs-attention-empty"
        className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
      >
        <p className="font-semibold text-text-strong">Nothing waiting on you.</p>
        <p>New sheets and changes to review will show up here.</p>
      </div>
    );
  }

  return (
    <div data-testid="needs-attention-inbox" className="flex h-full flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <ItemCard key={item.key} item={item} now={now} />
        ))}
      </ul>
      {overflowCount > 0 ? (
        <p data-testid="needs-attention-more" className="text-sm text-text-subtle">
          +{overflowCount} more waiting. Clear some above to see the rest.
        </p>
      ) : null}
    </div>
  );
}
