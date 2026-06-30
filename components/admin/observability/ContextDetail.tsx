// components/admin/observability/ContextDetail.tsx
import { KeyValue } from "@/components/atoms/KeyValue";
import type { AppEventRow } from "@/lib/admin/observabilityTypes";

export function ContextDetail({ event }: { event: AppEventRow }) {
  const ctx = event.context ?? {};
  const hasContext = Object.keys(ctx).length > 0;
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2 text-sm">
      <div data-testid="event-full-message" className="whitespace-pre-wrap wrap-break-word text-text">
        {event.message}
      </div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <KeyValue label="Occurred at" value={event.occurredAt} tabular />
        <KeyValue label="Request" value={event.requestId} />
        <KeyValue label="Drive file" value={event.driveFileId} />
        <KeyValue label="Actor" value={event.actorHash} />
      </dl>
      <pre className="overflow-x-auto rounded bg-surface-sunken p-2 text-xs text-text-subtle">
        {hasContext ? JSON.stringify(ctx, null, 2) : "no additional context"}
      </pre>
    </div>
  );
}
