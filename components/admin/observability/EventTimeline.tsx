import { EmptyState } from "@/components/atoms/EmptyState";
import type { LoadAppEventsResult } from "@/lib/admin/observabilityTypes";
import { EventRow } from "./EventRow";

export function EventTimeline({
  result,
  now,
  currentQuery = "",
}: {
  result: LoadAppEventsResult;
  now: Date;
  currentQuery?: string;
}) {
  if (result.kind === "infra_error") {
    return (
      <div
        data-testid="event-timeline-degraded"
        className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm"
      >
        Couldn’t load activity right now.
      </div>
    );
  }
  if (result.events.length === 0) {
    return <EmptyState label="No events match these filters." />;
  }
  const olderHref = (() => {
    if (!result.hasMore || !result.nextCursor) return null;
    const sp = new URLSearchParams(currentQuery);
    sp.set("cursorAt", result.nextCursor.occurredAt);
    sp.set("cursorId", result.nextCursor.id);
    return `/admin/observability?${sp.toString()}`;
  })();
  return (
    <div className="flex flex-col gap-3" style={{ overflowAnchor: "auto" }}>
      <ul className="flex flex-col gap-2">
        {result.events.map((e) => (
          <EventRow key={e.id} event={e} now={now} />
        ))}
      </ul>
      {result.hasMore && (
        <p className="text-xs text-text-subtle">
          Showing the {result.events.length} most recent matching events. Refine filters or load
          older.
        </p>
      )}
      {olderHref && (
        <a
          data-testid="event-timeline-load-older"
          href={olderHref}
          className="inline-flex min-h-tap-min items-center text-sm underline"
        >
          Load older
        </a>
      )}
    </div>
  );
}
