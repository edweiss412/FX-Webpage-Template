export const PAGE_SIZE = 100;

export type AppEventLevel = "info" | "warn" | "error";
export type AppEventRow = {
  id: string;
  occurredAt: string;
  level: AppEventLevel;
  source: string;
  message: string;
  code: string | null;
  requestId: string | null;
  showId: string | null;
  driveFileId: string | null;
  actorHash: string | null;
  context: Record<string, unknown>;
  showTitle: string | null;
  showSlug: string | null;
};
export type AppEventCursor = { occurredAt: string; id: string };
export type AppEventFilters = {
  levels?: AppEventLevel[];
  source?: string;
  code?: string;
  showId?: string;
  requestId?: string;
  sinceHours?: 1 | 24 | 168 | null;
  q?: string;
  cursor?: AppEventCursor | null;
};
export type LoadAppEventsResult =
  | { kind: "ok"; events: AppEventRow[]; hasMore: boolean; nextCursor: AppEventCursor | null }
  | { kind: "infra_error"; message: string };

export type CronRunOutcomeRead = "ok" | "partial" | "infra" | "threw";
export type CronHealthRow = {
  jobName: string;
  label: string;
  cadence: string;
  staleAfterMs: number;
  lastRunAt: string | null;
  outcome: CronRunOutcomeRead | null;
  level: AppEventLevel | null;
  counts: Record<string, number> | null;
};
export type LoadCronHealthResult =
  | { kind: "ok"; jobs: CronHealthRow[] }
  | { kind: "infra_error"; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ISO-8601 timestamp shape — rejects Date.parse-able junk ("2026", "now", "June 29 2026")
// while accepting BOTH canonical JS (…Z) and PostgREST (…+00:00, microseconds) forms,
// so we must NOT use a strict toISOString() round-trip (it would reject the DB's own format).
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const LEVELS: AppEventLevel[] = ["info", "warn", "error"];

export function escapeIlike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => "\\" + c);
}

type SP = URLSearchParams | Record<string, string | string[] | undefined>;
function get(sp: SP, key: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(key) ?? undefined;
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}
function capped(v: string | undefined): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  return t.length === 0 || t.length > 200 ? undefined : t;
}

export function parseAppEventFilters(sp: SP): AppEventFilters {
  const f: AppEventFilters = {};

  const level = get(sp, "level");
  if (level) {
    const kept = level
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is AppEventLevel => (LEVELS as string[]).includes(s));
    if (kept.length) f.levels = kept;
  }
  const source = capped(get(sp, "source"));
  if (source) f.source = source;
  const code = capped(get(sp, "code"));
  if (code) f.code = code;
  const requestId = capped(get(sp, "requestId"));
  if (requestId) f.requestId = requestId;
  const showId = get(sp, "showId");
  if (showId && UUID_RE.test(showId)) f.showId = showId;
  const q = capped(get(sp, "q"));
  if (q) f.q = q;

  const since = get(sp, "since");
  f.sinceHours =
    since === "1h" ? 1 : since === "7d" ? 168 : since === "all" ? null : since === "24h" ? 24 : 24;

  const cAt = get(sp, "cursorAt");
  const cId = get(sp, "cursorId");
  if (cAt && cId && UUID_RE.test(cId) && ISO_TS_RE.test(cAt) && !Number.isNaN(Date.parse(cAt))) {
    f.cursor = { occurredAt: cAt, id: cId };
  }
  return f;
}
