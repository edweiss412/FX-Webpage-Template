// scripts/observe/collect.ts
import type { AppEventFilters, AppEventCursor, AppEventRow } from "@/lib/admin/observabilityTypes";
import type { QueryEventsResult } from "@/lib/observe/query";

function sameCursor(a: AppEventCursor, b: AppEventCursor): boolean {
  return a.occurredAt === b.occurredAt && a.id === b.id;
}
function cursorOf(rows: AppEventRow[]): AppEventCursor | null {
  const last = rows[rows.length - 1];
  return last ? { occurredAt: last.occurredAt, id: last.id } : null;
}

export async function collectEvents(
  queryFn: (f: AppEventFilters) => Promise<QueryEventsResult>,
  base: AppEventFilters,
  limit: number,
): Promise<QueryEventsResult> {
  const acc: AppEventRow[] = [];
  let cursor: AppEventCursor | null = base.cursor ?? null;
  let pages = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    pages += 1;
    const r = await queryFn({ ...base, ...(cursor ? { cursor } : {}) });
    if (r.kind !== "ok") return r; // (fault) surface it
    acc.push(...r.events);
    if (acc.length >= limit) {
      const trimmed = acc.slice(0, limit); // (a) reached limit
      // nextCursor must point after the LAST RETURNED row, not r.nextCursor
      // (r.nextCursor points past rows we dropped → would skip data on resume).
      return { kind: "ok", events: trimmed, hasMore: true, nextCursor: cursorOf(trimmed) };
    }
    if (!r.hasMore) return { kind: "ok", events: acc, hasMore: false, nextCursor: null }; // (b)
    if (r.nextCursor == null) return { kind: "ok", events: acc, hasMore: false, nextCursor: null }; // (c)
    if (r.events.length === 0) return { kind: "ok", events: acc, hasMore: false, nextCursor: null }; // (e)
    if (cursor != null && sameCursor(r.nextCursor, cursor))
      return { kind: "ok", events: acc, hasMore: false, nextCursor: null }; // (d) non-advancing
    if (pages >= 6) return { kind: "ok", events: acc, hasMore: true, nextCursor: r.nextCursor }; // (f) page cap
    cursor = r.nextCursor;
  }
}
