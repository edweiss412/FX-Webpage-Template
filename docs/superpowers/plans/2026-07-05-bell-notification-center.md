# Bell Notification Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the admin `NotifBell` into a tier-scoped notification center with per-admin read/unread state, resolved-history feed, realtime ping-driven badge, dev-tunable window/cap, and BRANCH_PROTECTION_* auto-resolution — retiring the dashboard AlertBanner.

**Architecture:** Three migrations (state tables + write RPCs, entry-grain read RPC, realtime trigger/policy) feed a server-side `lib/admin/bellFeed.ts` pipeline consumed by five admin API routes plus a realtime-token mint; the UI is a client `NotifBell` owning an `AppHealthPopover`-pattern panel, mounted in both admin chromes. Spec: `docs/superpowers/specs/2026-07-05-bell-notification-center-design.md` (Codex-APPROVED R10; section references below are to that file).

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres SECURITY DEFINER RPCs, Realtime private broadcast, PostgREST lockdown), Vitest, Playwright, Tailwind v4.

## Global Constraints

- Every task: failing test → minimal implementation → passing test → commit (invariant 1). Conventional commits (invariant 6), `--no-verify` allowed but run `pnpm format:check` + `pnpm lint` + `pnpm typecheck` before any push.
- No advisory-lock surfaces are touched (bell tables are not in the invariant-2 mutate set). Do NOT add `pg_advisory*` anywhere.
- Emails: only ever pass `requireAdminIdentity().email` (already canonical) into DB writes; schema CHECKs are the safety net (invariant 3).
- No raw codes in UI (invariant 5): all copy via `lib/messages/lookup.ts` / `ErrorExplainer`.
- Supabase calls destructure `{ data, error }`; register in the relevant `_metaInfraContract` or carry `// not-subject-to-meta: <reason>` (invariant 9).
- Admin mutating routes: `AUDITABLE_MUTATIONS` row + `recordAdminOutcomeBehavior` proof (invariant 10). `tests/log/_metaMutationSurfaceObservability.test.ts` discovers new routes automatically — missing rows FAIL CI.
- Migrations: apply locally, `pnpm gen:schema-manifest` (commit manifest), surgical apply to validation from the MAIN checkout (`psql "$TEST_DATABASE_URL" -f ...` — creds live in the main checkout's `.env.local`, NOT this worktree), `notify pgrst, 'reload schema';` (Task 15).
- UI work is Opus-owned; invariant-8 impeccable dual-gate runs in Task 14 before adversarial review.
- Config bounds single source of truth: `BELL_LIMITS` in `lib/admin/bellConfig.ts` (Task 4). SQL CHECK ranges must equal it: historyDays 1–365 default 30; feedCap 10–200 default 50 (spec §3.4).
- Bell audience sets (spec §6.3): non-developer excludes `HEALTH_CODES ∪ INBOX_ROUTED_CODES`; developer excludes `INBOX_ROUTED_CODES`. Never hardcode code lists in tests — derive from `lib/adminAlerts/audience.ts` / `lib/messages/adminSurface.ts` exports.
- Run the FULL suite (`pnpm test`) before push, not just touched dirs (shared-chokepoint regressions; catalog-count fixtures).

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260705100000_bell_state_tables.sql` | `admin_alert_reads`, `admin_bell_state`, full REVOKE, `app_settings` bell columns + CHECKs, `bell_mark_opened`/`bell_mark_read` write RPCs |
| `supabase/migrations/20260705100001_get_bell_feed_rows.sql` | entry-grain read RPC (meta row + entries) |
| `supabase/migrations/20260705100002_bell_realtime.sql` | statement triggers → `realtime.send` ping; `realtime.messages` SELECT policy |
| `lib/admin/bellConfig.ts` | `BELL_LIMITS` shared bounds |
| `lib/admin/bellFeed.ts` | `loadBellFeed` / `loadBellUnseenCount` pipeline: RPC call, viewer read-state, `shapeBellEntries`, identity resolution |
| `lib/admin/bellAudience.ts` | `bellExcludedCodes(viewerIsDeveloper)` derived sets |
| `app/api/admin/alerts/bell/{feed,count,open,read,config,token}/route.ts` | the six routes (spec §4, §5.3) |
| `components/admin/nav/NotifBell.tsx` | rewrite: client trigger + badge + owns panel open state |
| `components/admin/nav/useBellBadge.ts` | initial-prop / pathname-refetch / realtime-ping badge hook |
| `components/admin/BellPanel.tsx` | popover/sheet panel: sections, rows, actions, dev footer |
| `lib/realtime/subscribeToBell.ts` | private `admin:alerts` channel subscribe helper (DI, mirrors `subscribeToShow`) |
| `scripts/verify-branch-protection.ts` | + healthy-path resolver |
| `lib/messages/catalog.ts` + master spec §12.4 | BRANCH_PROTECTION_* flips (catalog-only); new `ALERT_BELL_FEED_FAILED` (full lockstep) |
| Deleted: `components/admin/AlertBanner.tsx`, `AlertBannerRouteBoundary`, `lib/admin/alertCount.ts` (if orphaned) | banner retirement |

**Interfaces produced (cross-task contract):**

```ts
// lib/admin/bellConfig.ts
export const BELL_LIMITS = {
  historyDays: { min: 1, max: 365, default: 30 },
  feedCap: { min: 10, max: 200, default: 50 },
} as const;

// lib/admin/bellAudience.ts
export function bellExcludedCodes(viewerIsDeveloper: boolean): string[];

// lib/admin/bellFeed.ts
export type BellEntry = {
  alertId: string; code: string; showId: string | null; slug: string | null;
  state: "active" | "history"; activityAt: string; resolvedAt: string | null;
  occurrences: number; unread: boolean;
  identity: SerializedAlertIdentity | null;
  isAutoResolving: boolean; autoResolveNote: string | null;
  action: { href: string; label: string; external: boolean } | null;
  isHealth: boolean;
};
export type BellFeedResult =
  | { kind: "ok"; entries: BellEntry[]; unseenCount: number; truncated: boolean;
      historyDays: number; feedCap: number; seenThrough: string }
  | { kind: "infra_error" };
export function loadBellFeed(viewerEmail: string, viewerIsDeveloper: boolean): Promise<BellFeedResult>;
export type BellCountResult = { kind: "ok"; count: number } | { kind: "infra_error" };
export function loadBellUnseenCount(viewerEmail: string, viewerIsDeveloper: boolean): Promise<BellCountResult>;

// components/admin/nav/NotifBell.tsx
export function NotifBell(props: { initialCount: BellCountResult; viewerIsDeveloper: boolean }): JSX.Element;
```

Forensic outcome codes (invariant 10, scanner-exempt adminOutcome namespace): `BELL_OPENED`, `BELL_READ_MARKED`, `BELL_CONFIG_UPDATED`.

---

### Task 1: Migration — bell state tables, lockdown, config columns, write RPCs

**Files:**
- Create: `supabase/migrations/20260705100000_bell_state_tables.sql`
- Modify: `tests/db/postgrest-dml-lockdown.test.ts` (add 2 registry rows)
- Test: `tests/db/postgrest-dml-lockdown.test.ts` (Layer 4 lockstep) — plus local psql apply

**Interfaces:**
- Consumes: `public.admin_alerts(id)`, `public.app_settings` singleton (`supabase/migrations/20260501001000_internal_and_admin.sql:232-247`).
- Produces: tables `admin_alert_reads(alert_id, admin_email, read_at)`, `admin_bell_state(admin_email, opened_at)`; RPCs `bell_mark_opened(p_admin_email text, p_seen_through timestamptz)`, `bell_mark_read(p_alert_id uuid, p_admin_email text, p_seen_activity_at timestamptz)`; `app_settings.bell_history_days`, `app_settings.bell_feed_cap`.

- [ ] **Step 1: Write the failing lockdown-registry test rows.** In `tests/db/postgrest-dml-lockdown.test.ts`, append to `RPC_GATED_TABLES` (match the existing `RpcGatedTable` shape at `:138`):

```ts
{
  table: "admin_alert_reads",
  closed_at: "supabase/migrations/20260705100000_bell_state_tables.sql:34",
  selectAnon: false,
  selectAuthenticated: false,
  postBody: { alert_id: "00000000-0000-0000-0000-000000000000", admin_email: "lockdown-test@example.com" },
  rowFilter: "?admin_email=eq.no-such-row%40example.com",
},
{
  table: "admin_bell_state",
  closed_at: "supabase/migrations/20260705100000_bell_state_tables.sql:35",
  selectAnon: false,
  selectAuthenticated: false,
  postBody: { admin_email: "lockdown-test@example.com" },
  rowFilter: "?admin_email=eq.no-such-row%40example.com",
},
```

(Adjust the two `closed_at` line numbers to the REVOKE lines of the final migration file.)

- [ ] **Step 2: Run to verify it fails** — `pnpm test tests/db/postgrest-dml-lockdown.test.ts`. Expected: FAIL (tables don't exist yet / Layer-4 lockstep missing migration citation).

- [ ] **Step 3: Write the migration** `supabase/migrations/20260705100000_bell_state_tables.sql`:

```sql
-- Bell notification center state (spec 2026-07-05-bell-notification-center §3).
-- Per-admin read marks + badge watermark. FULL PostgREST lockdown (SELECT
-- included, spec §3.3): rows expose per-admin behavior; all access flows
-- through service-role server routes. Write path is greatest-wins monotonic
-- RPCs (spec §3.1/§3.2) because PostgREST upsert cannot express greatest().

create table if not exists public.admin_alert_reads (
  alert_id uuid not null references public.admin_alerts(id) on delete cascade,
  admin_email text not null,
  read_at timestamptz not null default now(),
  primary key (alert_id, admin_email),
  constraint admin_alert_reads_email_canonical
    check (admin_email = lower(btrim(admin_email)))
);

create table if not exists public.admin_bell_state (
  admin_email text primary key,
  opened_at timestamptz not null default now(),
  constraint admin_bell_state_email_canonical
    check (admin_email = lower(btrim(admin_email)))
);

alter table public.admin_alert_reads enable row level security;
alter table public.admin_bell_state enable row level security;
-- No client policies on purpose: service-role only (spec §3.3).
revoke all on table public.admin_alert_reads from anon, authenticated;
revoke all on table public.admin_bell_state from anon, authenticated;

-- Dev-tunable feed window/cap (spec §3.4). Column creation and named-CHECK
-- recreation are SEPARATE statements so reapply against existing columns
-- still recreates constraints (apply-twice idempotent).
alter table public.app_settings
  add column if not exists bell_history_days integer not null default 30,
  add column if not exists bell_feed_cap integer not null default 50;
alter table public.app_settings
  drop constraint if exists app_settings_bell_history_days_range,
  add constraint app_settings_bell_history_days_range
    check (bell_history_days between 1 and 365),
  drop constraint if exists app_settings_bell_feed_cap_range,
  add constraint app_settings_bell_feed_cap_range
    check (bell_feed_cap between 10 and 200);

-- Monotonic write RPCs (greatest-wins; never regress a newer stamp).
create or replace function public.bell_mark_opened(
  p_admin_email text,
  p_seen_through timestamptz
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_bell_state (admin_email, opened_at)
  values (p_admin_email, p_seen_through)
  on conflict (admin_email) do update
    set opened_at = greatest(public.admin_bell_state.opened_at, excluded.opened_at);
$$;

create or replace function public.bell_mark_read(
  p_alert_id uuid,
  p_admin_email text,
  p_seen_activity_at timestamptz
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_alert_reads (alert_id, admin_email, read_at)
  values (p_alert_id, p_admin_email, p_seen_activity_at)
  on conflict (alert_id, admin_email) do update
    set read_at = greatest(public.admin_alert_reads.read_at, excluded.read_at);
$$;

revoke all on function public.bell_mark_opened(text, timestamptz) from public, anon, authenticated;
grant execute on function public.bell_mark_opened(text, timestamptz) to service_role;
revoke all on function public.bell_mark_read(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.bell_mark_read(uuid, text, timestamptz) to service_role;
```

Then fix the two `closed_at` line numbers in the Step-1 registry rows to point at the actual `revoke all on table ...` lines.

- [ ] **Step 4: Apply locally + verify.** Run `supabase db reset` (or the project's local apply flow if reset is too slow: `psql "$LOCAL_DATABASE_URL" -f supabase/migrations/20260705100000_bell_state_tables.sql` twice — the second apply proves idempotency, expect zero errors). Then `pnpm test tests/db/postgrest-dml-lockdown.test.ts`. Expected: PASS.

- [ ] **Step 5: Regenerate schema manifest** — `pnpm gen:schema-manifest`; confirm `supabase/generated/schema-manifest.json` diff includes both tables + both `app_settings` columns.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260705100000_bell_state_tables.sql tests/db/postgrest-dml-lockdown.test.ts supabase/generated/schema-manifest.json
git commit --no-verify -m "feat(db): bell state tables + monotonic write RPCs + full PostgREST lockdown"
```

---

### Task 2: Migration — `get_bell_feed_rows` entry-grain read RPC

**Files:**
- Create: `supabase/migrations/20260705100001_get_bell_feed_rows.sql`
- Test: `tests/db/bellFeedRpc.test.ts` (new — live local-DB SQL behavior; reuse the DB connection pattern from `tests/db/validation-schema-parity.test.ts` Layer 2 / `tests/db/postgrest-dml-lockdown.test.ts` — inspect those files first and copy their client setup verbatim)

**Interfaces:**
- Consumes: `public.admin_alerts`, `public.shows(slug)`.
- Produces: `get_bell_feed_rows(p_history_days int, p_cap int, p_excluded_codes text[])` returning `(is_meta boolean, seen_through timestamptz, active_hit_cap boolean, history_hit_cap boolean, id uuid, code text, show_id uuid, slug text, context jsonb, occurrence_count integer, raised_at timestamptz, last_seen_at timestamptz, resolved_at timestamptz, resolved_occurrence_sum bigint, is_active boolean)` — exactly one `is_meta=true` row always; entry rows unordered (TS sorts).

- [ ] **Step 1: Write failing SQL behavior tests** `tests/db/bellFeedRpc.test.ts`. Seed via SQL in the test (insert admin_alerts rows with explicit timestamps; clean up after). Cases — derive every expectation from the seeded fixture, never hardcode counts:

```ts
// 1. meta row: exactly one is_meta=true row even with ZERO alerts; seen_through parses as ISO.
// 2. entry grain: seed 5 resolved rows for ONE (show,code) key + 3 distinct resolved keys
//    → history entries = 4 (1 collapsed + 3), resolved_occurrence_sum of the flappy key
//    = sum of its 5 occurrence_counts (starvation regression, spec §6.1/R5).
// 3. active-arm exclusion: a key with an unresolved row does NOT also appear as history;
//    its resolved_occurrence_sum covers its windowed resolved predecessors.
// 4. pre-cap exclusion: seed p_cap+5 rows of an excluded code + 1 included row,
//    p_excluded_codes=[excluded] → the included row IS returned (spec §6.1/R7).
// 5. caps: seed p_cap+1 distinct active keys → active rows = p_cap, meta.active_hit_cap=true.
// 6. window: resolved_at older than p_history_days days → absent from history AND sums.
// 7. NULL p_excluded_codes → the call rejects (function raises).
// 8. empty-array p_excluded_codes → nothing excluded.
```

Each case is a real `await sql\`select * from get_bell_feed_rows(...)\`` assertion, not a mock (AGENTS.md: mocked-only tests invite tautological APPROVE).

- [ ] **Step 2: Run to verify failure** — `pnpm test tests/db/bellFeedRpc.test.ts`. Expected: FAIL "function get_bell_feed_rows does not exist".

- [ ] **Step 3: Write the migration** `supabase/migrations/20260705100001_get_bell_feed_rows.sql`:

```sql
-- Entry-grain bell feed read (spec §6.1, adversarial R5/R6/R9/R10 shape).
-- One meta row (is_meta=true: seen_through = this snapshot's now(), cap flags)
-- + zero-or-more entry rows, one per (coalesce(show_id::text,''), code) key.
-- Tier exclusion applies INSIDE both arms BEFORE each cap.
create or replace function public.get_bell_feed_rows(
  p_history_days int,
  p_cap int,
  p_excluded_codes text[]
)
returns table (
  is_meta boolean,
  seen_through timestamptz,
  active_hit_cap boolean,
  history_hit_cap boolean,
  id uuid,
  code text,
  show_id uuid,
  slug text,
  context jsonb,
  occurrence_count integer,
  raised_at timestamptz,
  last_seen_at timestamptz,
  resolved_at timestamptz,
  resolved_occurrence_sum bigint,
  is_active boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_excluded_codes is null then
    raise exception 'get_bell_feed_rows: p_excluded_codes must not be null';
  end if;
  if p_history_days is null or p_history_days < 1 or p_history_days > 365 then
    raise exception 'get_bell_feed_rows: p_history_days out of range';
  end if;
  if p_cap is null or p_cap < 10 or p_cap > 200 then
    raise exception 'get_bell_feed_rows: p_cap out of range';
  end if;

  return query
  with resolved_sums as (
    select coalesce(a.show_id::text, '') as key_show,
           a.code as key_code,
           sum(a.occurrence_count)::bigint as resolved_sum
    from public.admin_alerts a
    where a.resolved_at is not null
      and a.resolved_at >= now() - make_interval(days => p_history_days)
      and a.code <> all(p_excluded_codes)
    group by 1, 2
  ),
  active as (
    select a.*
    from public.admin_alerts a
    where a.resolved_at is null
      and a.code <> all(p_excluded_codes)
    order by greatest(a.raised_at, a.last_seen_at) desc
    limit p_cap
  ),
  history as (
    select distinct on (coalesce(a.show_id::text, ''), a.code) a.*
    from public.admin_alerts a
    where a.resolved_at is not null
      and a.resolved_at >= now() - make_interval(days => p_history_days)
      and a.code <> all(p_excluded_codes)
      -- a key with ANY open row is "active"; its history folds into the
      -- active entry's occurrence sum (spec §6.1, uncapped on purpose so a
      -- cap-evicted active key doesn't ghost back in as history)
      and not exists (
        select 1 from public.admin_alerts o
        where o.resolved_at is null
          and coalesce(o.show_id::text, '') = coalesce(a.show_id::text, '')
          and o.code = a.code
      )
    order by coalesce(a.show_id::text, ''), a.code, a.resolved_at desc
  ),
  history_capped as (
    select h.* from history h
    order by h.resolved_at desc
    limit p_cap
  )
  select true, now(),
         (select count(*) from active) = p_cap,
         (select count(*) from history_capped) = p_cap,
         null::uuid, null::text, null::uuid, null::text, null::jsonb,
         null::integer, null::timestamptz, null::timestamptz, null::timestamptz,
         null::bigint, null::boolean
  union all
  select false, null, null, null,
         a.id, a.code, a.show_id, s.slug, a.context,
         a.occurrence_count, a.raised_at, a.last_seen_at, a.resolved_at,
         coalesce(rs.resolved_sum, 0), true
  from active a
  left join public.shows s on s.id = a.show_id
  left join resolved_sums rs
    on rs.key_show = coalesce(a.show_id::text, '') and rs.key_code = a.code
  union all
  select false, null, null, null,
         h.id, h.code, h.show_id, s.slug, h.context,
         h.occurrence_count, h.raised_at, h.last_seen_at, h.resolved_at,
         coalesce(rs.resolved_sum, h.occurrence_count::bigint), false
  from history_capped h
  left join public.shows s on s.id = h.show_id
  left join resolved_sums rs
    on rs.key_show = coalesce(h.show_id::text, '') and rs.key_code = h.code;
end;
$$;

revoke all on function public.get_bell_feed_rows(int, int, text[]) from public, anon, authenticated;
grant execute on function public.get_bell_feed_rows(int, int, text[]) to service_role;
```

- [ ] **Step 4: Apply locally (twice — idempotency), run tests** — `pnpm test tests/db/bellFeedRpc.test.ts`. Expected: PASS (all 8 cases).

- [ ] **Step 5: Regenerate manifest** — `pnpm gen:schema-manifest`; commit the diff.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260705100001_get_bell_feed_rows.sql tests/db/bellFeedRpc.test.ts supabase/generated/schema-manifest.json
git commit --no-verify -m "feat(db): get_bell_feed_rows entry-grain feed RPC (meta row + starvation-proof caps)"
```

---

### Task 3: Migration — realtime ping trigger + `admin:alerts` policy

**Files:**
- Create: `supabase/migrations/20260705100002_bell_realtime.sql`
- Test: `tests/db/bellRealtimePing.test.ts` (new — asserts trigger/function/policy exist and fire; same DB harness as Task 2)

**Interfaces:**
- Consumes: `realtime.send(payload jsonb, event text, topic text, private boolean)` (pattern: `supabase/migrations/20260504000000_realtime_private_channel_authorization.sql:50-77`); `realtime.messages` RLS.
- Produces: statement triggers `admin_alerts_bell_ping_ins`/`_upd` on `admin_alerts`; SELECT policy `fxav_admin_bell_subscriber_select` (topic `admin:alerts`, `viewer_kind='admin'`).

- [ ] **Step 1: Write failing structural test** `tests/db/bellRealtimePing.test.ts`:

```ts
// 1. pg_trigger has admin_alerts_bell_ping_ins + admin_alerts_bell_ping_upd on public.admin_alerts.
// 2. pg_policies has fxav_admin_bell_subscriber_select on realtime.messages whose qual
//    contains 'admin:alerts' and 'viewer_kind'.
// 3. Behavioral smoke: insert an admin_alerts row (via upsert_admin_alert rpc), then
//    select count(*) from realtime.messages where topic = 'admin:alerts' — count increased.
//    (realtime.send writes into realtime.messages; if the local stack prunes instantly,
//    fall back to asserting the trigger function body via pg_get_functiondef contains
//    "realtime.send" and topic literal — note which branch ran in the test output.)
// 4. Function publish_admin_alerts_bell_ping has no EXECUTE for anon/authenticated
//    (has_function_privilege = false).
```

- [ ] **Step 2: Run to verify failure** — `pnpm test tests/db/bellRealtimePing.test.ts`. Expected: FAIL (missing trigger).

- [ ] **Step 3: Write the migration** `supabase/migrations/20260705100002_bell_realtime.sql`:

```sql
-- Bell realtime ping (spec §5). CONTENTLESS payload by design: the identity
-- sanitizer chokepoint (lib/adminAlerts) stays the sole owner of what
-- reaches a browser; realtime is an invalidation signal, never a data carrier.
create or replace function public.publish_admin_alerts_bell_ping()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'admin:alerts', true);
  return null;
end;
$$;
revoke all on function public.publish_admin_alerts_bell_ping() from public, anon, authenticated;

drop trigger if exists admin_alerts_bell_ping_ins on public.admin_alerts;
create trigger admin_alerts_bell_ping_ins
  after insert on public.admin_alerts
  for each statement execute function public.publish_admin_alerts_bell_ping();

drop trigger if exists admin_alerts_bell_ping_upd on public.admin_alerts;
create trigger admin_alerts_bell_ping_upd
  after update on public.admin_alerts
  for each statement execute function public.publish_admin_alerts_bell_ping();

-- Realtime Authorization: private-channel SELECT for admin JWTs only
-- (mint: /api/admin/alerts/bell/token — viewer_kind claim; spec §5.2/§5.3).
-- Sibling of fxav_show_invalidation_subscriber_select (20260504000000).
drop policy if exists fxav_admin_bell_subscriber_select on realtime.messages;
create policy fxav_admin_bell_subscriber_select
  on realtime.messages
  for select
  to authenticated
  using (
    topic = 'admin:alerts'
    and (current_setting('request.jwt.claims', true)::jsonb ->> 'viewer_kind') = 'admin'
  );
```

- [ ] **Step 4: Apply locally (twice), run tests** — `pnpm test tests/db/bellRealtimePing.test.ts`. Expected: PASS.

- [ ] **Step 5: Regenerate manifest + commit**

```bash
pnpm gen:schema-manifest
git add supabase/migrations/20260705100002_bell_realtime.sql tests/db/bellRealtimePing.test.ts supabase/generated/schema-manifest.json
git commit --no-verify -m "feat(db): admin:alerts realtime ping trigger + private-channel policy"
```

---

### Task 4: `BELL_LIMITS` + `bellExcludedCodes`

**Files:**
- Create: `lib/admin/bellConfig.ts`, `lib/admin/bellAudience.ts`
- Test: `tests/admin/bellAudience.test.ts`

**Interfaces:**
- Consumes: `HEALTH_CODES` (`lib/adminAlerts/audience.ts:14-16`), `INBOX_ROUTED_CODES` (`lib/messages/adminSurface.ts:22-24`).
- Produces: `BELL_LIMITS` (shape in File Structure block); `bellExcludedCodes(viewerIsDeveloper: boolean): string[]`.

- [ ] **Step 1: Write failing test** `tests/admin/bellAudience.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { bellExcludedCodes } from "@/lib/admin/bellAudience";
import { BELL_LIMITS } from "@/lib/admin/bellConfig";
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { INBOX_ROUTED_CODES } from "@/lib/messages/adminSurface";

describe("bellExcludedCodes (spec §6.3)", () => {
  test("non-developer excludes HEALTH_CODES ∪ INBOX_ROUTED_CODES, de-duped", () => {
    const got = bellExcludedCodes(false);
    expect(new Set(got)).toEqual(new Set([...HEALTH_CODES, ...INBOX_ROUTED_CODES]));
    expect(got.length).toBe(new Set(got).size);
  });
  test("developer excludes exactly INBOX_ROUTED_CODES (health included; inbox never)", () => {
    const got = bellExcludedCodes(true);
    expect(new Set(got)).toEqual(new Set(INBOX_ROUTED_CODES));
    for (const code of INBOX_ROUTED_CODES) expect(got).toContain(code);
  });
  test("neither set is empty (catalog sanity — a refactor emptying these silently un-scopes the bell)", () => {
    expect(HEALTH_CODES.length).toBeGreaterThan(0);
    expect(INBOX_ROUTED_CODES.length).toBeGreaterThan(0);
  });
});

describe("BELL_LIMITS (spec §3.4 — must equal the SQL CHECK ranges)", () => {
  test("bounds", () => {
    expect(BELL_LIMITS.historyDays).toEqual({ min: 1, max: 365, default: 30 });
    expect(BELL_LIMITS.feedCap).toEqual({ min: 10, max: 200, default: 50 });
  });
});
```

Failure mode caught: a tier-set regression (e.g. dev set accidentally `[]` — the R7 leak) or drift between TS bounds and SQL CHECKs.

- [ ] **Step 2: Run to verify failure** — `pnpm test tests/admin/bellAudience.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** `lib/admin/bellConfig.ts`:

```ts
// Single source of truth for bell feed bounds (spec §3.4). The SQL CHECKs in
// supabase/migrations/20260705100000_bell_state_tables.sql and the
// get_bell_feed_rows param guards must stay equal to these values.
export const BELL_LIMITS = {
  historyDays: { min: 1, max: 365, default: 30 },
  feedCap: { min: 10, max: 200, default: 50 },
} as const;
```

`lib/admin/bellAudience.ts`:

```ts
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { INBOX_ROUTED_CODES } from "@/lib/messages/adminSurface";

// Bell tier exclusion sets (spec §6.3). Passed INTO get_bell_feed_rows as
// p_excluded_codes so exclusion happens BEFORE the SQL caps (spec §6.1) —
// no SQL copy of the code lists to drift. Inbox-routed codes stay out of
// EVERY tier's bell (the needs-attention inbox owns them).
export function bellExcludedCodes(viewerIsDeveloper: boolean): string[] {
  return viewerIsDeveloper
    ? [...INBOX_ROUTED_CODES]
    : [...new Set([...HEALTH_CODES, ...INBOX_ROUTED_CODES])];
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm test tests/admin/bellAudience.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/bellConfig.ts lib/admin/bellAudience.ts tests/admin/bellAudience.test.ts
git commit --no-verify -m "feat(admin): bell audience exclusion sets + BELL_LIMITS bounds"
```

---

### Task 5: Catalog — BRANCH_PROTECTION_* → `resolution: "auto"` + notes

**Files:**
- Modify: `lib/messages/catalog.ts:1882-1917` (two entries), `lib/adminAlerts/audience.ts:69` (AUTO_RESOLVE_NOTES)
- Test: `tests/adminAlerts/audience.test.ts` (or wherever `isAutoResolving` is covered — locate with `rg -l "AUTO_RESOLVING_CODES|isAutoResolving" tests/`)

**Interfaces:**
- Produces: `isAutoResolving("BRANCH_PROTECTION_DRIFT") === true` (and MONITOR_AUTH_FAILED) — flips the 409 door on both resolve routes and suppresses manual buttons on every surface with zero per-surface code (spec §9.3).
- NOTE (verified in plan prep): x1-catalog-parity (`tests/cross-cutting/codes.test.ts:75-87`) compares only dougFacing/crewFacing/followUp/helpfulContext — `resolution` is catalog-metadata-only; **no §12.4 prose edit, no gen:spec-codes run needed for this task.**

- [ ] **Step 1: Write failing test.** In the located audience test file add:

```ts
test("BRANCH_PROTECTION_* are auto-resolving with specific notes (spec §9 / ARTRUTH-1)", () => {
  expect(isAutoResolving("BRANCH_PROTECTION_DRIFT")).toBe(true);
  expect(isAutoResolving("BRANCH_PROTECTION_MONITOR_AUTH_FAILED")).toBe(true);
  expect(autoResolveNote("BRANCH_PROTECTION_DRIFT")).toMatch(/monitor/i);
  expect(autoResolveNote("BRANCH_PROTECTION_MONITOR_AUTH_FAILED")).toMatch(/authenticat/i);
});
```

- [ ] **Step 2: Run to verify failure** — expected: FAIL (`isAutoResolving` returns false).

- [ ] **Step 3: Implement.** In `lib/messages/catalog.ts` change `resolution: "manual"` → `resolution: "auto"` on BOTH `BRANCH_PROTECTION_DRIFT` (`:1884`) and `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` (`:1902`). In `lib/adminAlerts/audience.ts` add to `AUTO_RESOLVE_NOTES`:

```ts
  BRANCH_PROTECTION_DRIFT:
    "Clears automatically the next time the branch-protection monitor verifies the settings match the contract.",
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED:
    "Clears automatically the next time the branch-protection monitor authenticates successfully.",
```

- [ ] **Step 4: Run FULL messages + adminAlerts test dirs** — `pnpm test tests/messages tests/adminAlerts tests/cross-cutting`. Expected: PASS, EXCEPT any fixture asserting auto/manual code COUNTS — fix those by deriving from the catalog (PR #315 lesson: ground-truth merged catalog counts, never hardcode).

- [ ] **Step 5: Commit**

```bash
git add lib/messages/catalog.ts lib/adminAlerts/audience.ts tests/
git commit --no-verify -m "feat(admin): convert BRANCH_PROTECTION_* to auto-resolution (bucket-C trap, spec §9)"
```

---

### Task 6: Re-detect resolver in `scripts/verify-branch-protection.ts`

**Files:**
- Modify: `scripts/verify-branch-protection.ts` (add resolver + call sites in `verifyBranchProtection`)
- Test: locate the existing test with `rg -l "verifyBranchProtection" tests/` and extend it

**Interfaces:**
- Consumes: existing `VerifyOptions.adminAlertClient` DI seam (`scripts/verify-branch-protection.ts:15-21`), `emitAlert` tolerance pattern (`ADMIN_ALERT_SKIP_PREFIX`, `localSupabaseReason`).
- Produces: `VerifyOptions.alertResolver?: (codes: readonly string[]) => Promise<void>` DI seam; healthy paths resolve open alerts.

- [ ] **Step 1: Write failing tests** (in the located test file, following its existing fake-client style):

```ts
// 1. ok:true → resolver called with BOTH codes (AUTH_FAILED + DRIFT).
// 2. auth ok but drift found → resolver called with ONLY
//    ["BRANCH_PROTECTION_MONITOR_AUTH_FAILED"]; DRIFT is (re)raised via rpc.
// 3. auth failed → resolver NOT called at all.
// 4. resolver throws → verifyBranchProtection still returns its normal result
//    and logs the ADMIN_ALERT_SKIP_PREFIX console line (degrades to no-op).
```

Each test injects `alertResolver: vi.fn()` and asserts call args; case 4 injects a rejecting fn and spies `console.error`.

- [ ] **Step 2: Run to verify failure** — expected: FAIL (option not accepted / resolver never called).

- [ ] **Step 3: Implement.** Add to `scripts/verify-branch-protection.ts`:

```ts
// Spec §9.3 (bucket-C conversion): the monitor is the re-detector, so healthy
// runs must clear the alerts it raised. Direct service-role UPDATE (mirrors
// lib/reports/botLoginAlert.ts resolveBotLoginAlertRow); tolerant like
// emitAlert — a failed resolve degrades to a logged no-op; the JSON report
// + exit code stay authoritative.
async function defaultResolveAlerts(codes: readonly string[]): Promise<void> {
  const unavailableReason = localSupabaseReason(process.env.SUPABASE_URL);
  if (unavailableReason) throw new Error(unavailableReason);
  const supabase = createSupabaseServiceRoleClient();
  let error: { message?: string } | null;
  try {
    // not-subject-to-meta: one-shot privileged CI script; failure surface is the X.6 workflow exit code and JSON report.
    ({ error } = await supabase
      .from("admin_alerts")
      .update({ resolved_at: new Date().toISOString() })
      .in("code", codes as string[])
      .is("show_id", null)
      .is("resolved_at", null)
      .select("id"));
  } catch (thrown) {
    throw new Error(`resolve threw: ${errorReason(thrown)}`);
  }
  if (error) throw new Error(`resolve returned error: ${error.message ?? String(error)}`);
}

async function resolveAlerts(
  resolver: ((codes: readonly string[]) => Promise<void>) | undefined,
  codes: readonly string[],
): Promise<void> {
  try {
    await (resolver ?? defaultResolveAlerts)(codes);
  } catch (error) {
    console.error(
      `${ADMIN_ALERT_SKIP_PREFIX} resolve skipped (${errorReason(error)}); JSON report + exit code remain authoritative`,
    );
  }
}
```

Add `alertResolver?: (codes: readonly string[]) => Promise<void>` to `VerifyOptions`. Call sites inside `verifyBranchProtection`, mirroring the raise sites:
- Immediately after the last auth gate passes (before failure evaluation): `await resolveAlerts(options.alertResolver, ["BRANCH_PROTECTION_MONITOR_AUTH_FAILED"]);`
- In the `failures.length === 0` branch (ok path), additionally: `await resolveAlerts(options.alertResolver, ["BRANCH_PROTECTION_DRIFT"]);`

- [ ] **Step 4: Run tests** — expected: PASS (all 4 cases + existing suite for the file).

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-branch-protection.ts tests/
git commit --no-verify -m "feat(infra): branch-protection monitor auto-resolves its alerts on healthy runs"
```

---

### Task 7: New §12.4 code `ALERT_BELL_FEED_FAILED` (full lockstep)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 — NEVER run prettier on this file), `lib/messages/catalog.ts`, `lib/messages/__generated__/spec-codes.ts` (via `pnpm gen:spec-codes`), internal-code enums (via `pnpm gen:internal-code-enums`), help families / TRUST_DOMAINS registries as the meta-tests demand
- Test: `tests/cross-cutting/codes.test.ts` (x1 parity), `tests/messages/`, help `_families` test (locate: `rg -l "_families|TRUST_DOMAINS" tests/`)

**Interfaces:**
- Produces: `ALERT_BELL_FEED_FAILED` renderable via `ErrorExplainer`/`getRequiredDougFacing` for the panel error state (Task 13). Not an `upsertAdminAlert` producer — no `_metaAdminAlertCatalog` row (spec §16, declared N/A with this reason).

- [ ] **Step 1: Insert the §12.4 row** in the master spec's catalog table, alphabetical/section-consistent placement, fields mirroring neighbors:
  - code `ALERT_BELL_FEED_FAILED`; dougFacing: "We couldn't load your notifications just now. Refresh in a moment or use Retry — nothing has been lost."; crewFacing: null; followUp: "none — transient read failure"; helpfulContext: "The bell notification panel failed to fetch its feed (server or database hiccup). Alerts are stored server-side, so nothing is lost; the panel retries on demand."
- [ ] **Step 2: Regenerate + add catalog entry.** Run `pnpm gen:spec-codes`. Add the `lib/messages/catalog.ts` entry with the same four §12.4 fields plus `severity: "info"` is WRONG here — use the severity the banner-error class uses; check a sibling transient-read code (e.g. ADMIN_ALERT_COUNT_FAILED) and mirror its metadata exactly (severity, no audience, no resolution). `title: "Notifications didn't load"`, `helpHref: "/help/errors#ALERT_BELL_FEED_FAILED"`, `longExplanation` = helpfulContext wording.
- [ ] **Step 3: Run the gates and follow every failure** — `pnpm gen:internal-code-enums && pnpm test tests/cross-cutting/codes.test.ts tests/messages tests/help 2>/dev/null || pnpm test tests/cross-cutting tests/messages`. Fix each registry the meta-tests name (help `_families`, TRUST_DOMAINS if the helpHref route demands it) until green. All three §12.4-lockstep artifacts land in THIS commit.
- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/ tests/
git commit --no-verify -m "feat(admin): ALERT_BELL_FEED_FAILED catalog code for bell panel error state"
```

---

### Task 8: `lib/admin/bellFeed.ts` — pipeline + shaping

**Files:**
- Create: `lib/admin/bellFeed.ts`
- Test: `tests/admin/bellFeed.test.ts`

**Interfaces:**
- Consumes: `get_bell_feed_rows` RPC (Task 2), `bellExcludedCodes`/`BELL_LIMITS` (Task 4), `createSupabaseServiceRoleClient` (`lib/supabase/server`), identity chain exactly as `lib/admin/healthAlerts.ts:113-160` uses it (mirror that block verbatim — read it first), `isAutoResolving`/`autoResolveNote` (`lib/adminAlerts/audience.ts`), `resolveAlertAction` (`lib/adminAlerts/alertActions.ts:119`), `HEALTH_CODES`.
- Produces: `loadBellFeed`, `loadBellUnseenCount`, `BellEntry`, `BellFeedResult`, `BellCountResult` (exact shapes in File Structure block). Pure helper `shapeBellEntries(rows, reads, openedAt)` exported for unit tests.

- [ ] **Step 1: Write failing unit tests** `tests/admin/bellFeed.test.ts` for `shapeBellEntries` (pure — feed it hand-built RPC-row fixtures) and `loadBellFeed` (mock the supabase client chain like `tests/app/api/needsAttentionCountRoute.test.ts` mocks its loader). Cases, each with its concrete failure mode:

```ts
// shapeBellEntries:
// 1. meta-row split: missing is_meta row → throws BellFeedShapeError (fail-closed, spec §6.1/R10.1).
// 2. unread absence: no read row → unread true.
// 3. unread stale: read_at < last_seen_at → unread true (re-bump re-unreads, spec §3.1).
// 4. unread fresh: read_at >= last_seen_at → unread false.
// 5. READ RACE (R4.1): read stamped at seenActivityAt, row later re-bumped → unread true.
// 6. occurrences: active entry = occurrence_count + resolved_occurrence_sum;
//    history entry = resolved_occurrence_sum (derive from fixture numbers).
// 7. ordering: active first (activityAt desc), then history (resolvedAt desc).
// 8. truncation: entries sliced to feedCap total, active first; truncated flag =
//    meta.active_hit_cap || meta.history_hit_cap || TS slice happened.
// 9. unseenCount: activityAt > openedAt entries only; openedAt null → all count
//    (WATERMARK: derive interleavings from fixture timestamps, no sleeps).
// 9b. CAP BOUNDARY (spec §6.4/R4.2): with feedCap+1 unseen active fixtures, the
//     oldest is neither in entries nor counted; give it a NEWER last_seen_at
//     fixture (re-bump) and re-shape → it enters the sliced set with unread true.
// 10. isAutoResolving/autoResolveNote/action/isHealth populated from catalog-derived
//     helpers for a known auto code and a known action code (pick from
//     AUTO_RESOLVING_CODES[0] / ALERT_ACTION_CODES[0] — never hardcode literals).
```

- [ ] **Step 2: Run to verify failure** — `pnpm test tests/admin/bellFeed.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/admin/bellFeed.ts`.** Structure (invariant 9 — each supabase await in its own try with adjacent catch, mirroring `lib/admin/healthAlerts.ts`):

```ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { bellExcludedCodes } from "@/lib/admin/bellAudience";
import { BELL_LIMITS } from "@/lib/admin/bellConfig";
import { isAutoResolving, autoResolveNote, HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { resolveAlertAction } from "@/lib/adminAlerts/alertActions";
// identity imports: EXACTLY the ones lib/admin/healthAlerts.ts uses for its
// resolve step — copy that import block when mirroring the code.

// BellEntry / BellFeedResult / BellCountResult: copy the exact definitions from
// this plan's "Interfaces produced (cross-task contract)" block verbatim.

export class BellFeedShapeError extends Error {}

type RpcRow = {
  is_meta: boolean; seen_through: string | null; active_hit_cap: boolean | null;
  history_hit_cap: boolean | null; id: string | null; code: string | null;
  show_id: string | null; slug: string | null; context: Record<string, unknown> | null;
  occurrence_count: number | null; raised_at: string | null; last_seen_at: string | null;
  resolved_at: string | null; resolved_occurrence_sum: number | null; is_active: boolean | null;
};

export function shapeBellEntries(
  rows: RpcRow[],
  reads: Map<string, string>,          // alert_id -> read_at
  openedAt: string | null,
  feedCap: number,
): { entries: Omit<BellEntry, "identity">[]; unseenCount: number; truncated: boolean; seenThrough: string } {
  const meta = rows.find((r) => r.is_meta);
  if (!meta || !meta.seen_through) throw new BellFeedShapeError("missing meta row");
  const entryRows = rows.filter((r) => !r.is_meta);
  const shaped = entryRows.map((r) => {
    const activityAt = r.raised_at! > r.last_seen_at! ? r.raised_at! : r.last_seen_at!;
    const readAt = reads.get(r.id!) ?? null;
    return {
      alertId: r.id!, code: r.code!, showId: r.show_id, slug: r.slug,
      state: (r.is_active ? "active" : "history") as "active" | "history",
      activityAt, resolvedAt: r.resolved_at,
      occurrences: r.is_active
        ? (r.occurrence_count ?? 0) + Number(r.resolved_occurrence_sum ?? 0)
        : Number(r.resolved_occurrence_sum ?? 0),
      unread: r.is_active ? (readAt === null || readAt < r.last_seen_at!) : false,
      isAutoResolving: isAutoResolving(r.code!),
      autoResolveNote: isAutoResolving(r.code!) ? autoResolveNote(r.code!) : null,
      action: resolveAlertAction(r.code!, r.context, { slug: r.slug }),
      isHealth: HEALTH_CODES.includes(r.code!),
    };
  });
  shaped.sort((a, b) =>
    a.state !== b.state ? (a.state === "active" ? -1 : 1)
    : a.state === "active" ? b.activityAt.localeCompare(a.activityAt)
    : (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
  const sliced = shaped.slice(0, feedCap);
  const unseenCount = sliced.filter((e) => openedAt === null || e.activityAt > openedAt).length;
  return {
    entries: sliced, unseenCount,
    truncated: Boolean(meta.active_hit_cap) || Boolean(meta.history_hit_cap) || sliced.length < shaped.length,
    seenThrough: meta.seen_through,
  };
}
```

Note the spec decision encoded here: **history rows are never "unread"** (dots are an active-entry affordance; §7.3 renders dots only in the active section) and unseenCount is computed over the same capped snapshot (§6.4). `loadBellFeed` then: (1) read `app_settings` bell columns (`.select("bell_history_days, bell_feed_cap").eq("id", "default").limit(1)` — own try/catch → infra_error; fall back to `BELL_LIMITS` defaults if columns null); (2) `.rpc("get_bell_feed_rows", { p_history_days, p_cap, p_excluded_codes: bellExcludedCodes(viewerIsDeveloper) })`; (3) `.from("admin_alert_reads").select("alert_id, read_at").eq("admin_email", viewerEmail).in("alert_id", entryIds)` (bounded by entryIds; add `// not-subject-to-meta` only if the admin meta-test flags it — it scans `admin_alerts` reads, not these tables); (4) `.from("admin_bell_state").select("opened_at").eq("admin_email", viewerEmail).limit(1)`; (5) `shapeBellEntries`; (6) identity resolution over the sliced entries — mirror `lib/admin/healthAlerts.ts:113-160` verbatim (includePii: true; identity is additive, never gating; on fault log degraded + keep rows). `loadBellUnseenCount` runs steps 1-5 and returns only the count (identical pipeline — badge and panel can never disagree, spec §6.4).

- [ ] **Step 4: Run tests** — `pnpm test tests/admin/bellFeed.test.ts`. Expected: PASS. Also run `pnpm test tests/admin` (meta contracts: `_metaInfraContract` catch-window, `_metaBoundedReads` — fix registrations/comments it demands).

- [ ] **Step 5: Commit**

```bash
git add lib/admin/bellFeed.ts tests/admin/bellFeed.test.ts
git commit --no-verify -m "feat(admin): bell feed pipeline — shaping, read-state, unseen count"
```

---

### Task 9: Routes — `GET /api/admin/alerts/bell/feed` + `GET .../count`

**Files:**
- Create: `app/api/admin/alerts/bell/feed/route.ts`, `app/api/admin/alerts/bell/count/route.ts`
- Test: `tests/app/api/bellFeedRoute.test.ts`, `tests/app/api/bellCountRoute.test.ts`

**Interfaces:**
- Consumes: `requireAdminIdentity`/`AdminInfraError` (`lib/auth/requireAdmin.ts:279`), `isCurrentUserDeveloper` (`lib/auth/requireDeveloper.ts`), `loadBellFeed`/`loadBellUnseenCount` (Task 8).
- Produces: `GET feed → 200 { entries, unseenCount, truncated, historyDays, feedCap, seenThrough }` · `GET count → 200 { count }` · both `503 { error: "unavailable" }` on infra fault, `Cache-Control: no-store`, `dynamic = "force-dynamic"` (contract: `app/api/admin/needs-attention-count/route.ts:8-22`).

- [ ] **Step 1: Write failing route tests** — clone the harness of `tests/app/api/needsAttentionCountRoute.test.ts:7-33` (vi.mock the auth guard + loader, import GET directly). Cases per route:

```ts
// 1. happy path: 200, body passes loader result through verbatim, no-store header.
// 2. loader infra_error → 503 {error:"unavailable"}; body contains NO raw §12.4 code.
// 3. AdminInfraError from requireAdminIdentity → 503.
// 4. feed route passes (email, isDev) from requireAdminIdentity + isCurrentUserDeveloper
//    into loadBellFeed — assert mock call args (catches tier-scope wiring bugs).
```

- [ ] **Step 2: Run to verify failure** — expected: FAIL (route module not found).

- [ ] **Step 3: Implement.** `app/api/admin/alerts/bell/feed/route.ts`:

```ts
import { NextResponse } from "next/server";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { isCurrentUserDeveloper } from "@/lib/auth/requireDeveloper";
import { loadBellFeed } from "@/lib/admin/bellFeed";

export const dynamic = "force-dynamic";

export async function GET() {
  let email: string;
  try {
    ({ email } = await requireAdminIdentity());
  } catch (err) {
    if (err instanceof AdminInfraError) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    throw err; // forbidden()/notFound() control flow propagates to Next
  }
  const viewerIsDeveloper = await isCurrentUserDeveloper();
  const result = await loadBellFeed(email, viewerIsDeveloper);
  if (result.kind === "infra_error") {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const { kind: _kind, ...body } = result;
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
```

`count/route.ts` identical but `loadBellUnseenCount` → `{ count: result.count }`.

- [ ] **Step 4: Run tests + meta discovery** — `pnpm test tests/app/api/bellFeedRoute.test.ts tests/app/api/bellCountRoute.test.ts tests/log/_metaMutationSurfaceObservability.test.ts`. GET routes are not mutation surfaces — discovery must stay green with no new rows. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/alerts/bell/feed app/api/admin/alerts/bell/count tests/app/api/bellFeedRoute.test.ts tests/app/api/bellCountRoute.test.ts
git commit --no-verify -m "feat(admin): bell feed + count API routes"
```

---

### Task 10: Routes — `POST .../open` + `POST .../read` (invariant-10 surfaces)

**Files:**
- Create: `app/api/admin/alerts/bell/open/route.ts`, `app/api/admin/alerts/bell/read/route.ts`
- Modify: `tests/log/_auditableMutations.ts` (2 rows), `tests/log/adminOutcomeBehavior.test.ts` (2 proofs)
- Test: `tests/app/api/bellOpenRoute.test.ts`, `tests/app/api/bellReadRoute.test.ts`

**Interfaces:**
- Consumes: `bell_mark_opened`/`bell_mark_read` RPCs (Task 1), `bellExcludedCodes` (Task 4), `logAdminOutcome` (`lib/log/logAdminOutcome.ts:8-51` — import from `@/lib/log/logAdminOutcome`), `createSupabaseServiceRoleClient`.
- Produces: `POST open { seenThrough } → 200 { ok: true }` · `POST read { alertId, seenActivityAt } → 200 { ok: true }` · 400 on missing/non-ISO/future(>60s skew) timestamps · read: 404 on unknown/UUID-invalid/tier-invisible alertId, never a write (spec §4, §12).

- [ ] **Step 1: Write failing route tests.** Shared validation helper cases (each route):

```ts
// 1. missing/empty/non-ISO timestamp → 400, RPC mock NOT called.
// 2. timestamp > now()+60s → 400. (Inject clock via vi.useFakeTimers or compare arg.)
// 3. valid → 200 {ok:true}; assert supabase.rpc called with the exact
//    (p_admin_email = canonical email from the auth mock, p_seen_* = body value).
// 4. rpc returns {error} → 503, and logAdminOutcome NOT called with the success code.
// read-only extras:
// 5. alertId not a UUID → 404, no rpc call.
// 6. alert row lookup returns code ∈ bellExcludedCodes(viewer's tier) → 404, no rpc call
//    (FAIL-CLOSED: non-dev cannot probe health ids — derive the probe code from
//    HEALTH_CODES[0], not a literal).
// 7. alert row not found → 404.
```

Behavior proofs in `tests/log/adminOutcomeBehavior.test.ts` (pattern `tests/log/adminOutcomeBehavior.test.ts` — `observeSuccessCodes` + `recordAdminOutcomeBehavior`):

```ts
// open: success branch emits BELL_OPENED (observeSuccessCodes contains it);
//        rpc-error branch does NOT (observeCodes lacks it).
// read: same for BELL_READ_MARKED.
// each followed by recordAdminOutcomeBehavior({ file: "app/api/admin/alerts/bell/open/route.ts", fn: "POST", code: "BELL_OPENED" }) etc.
```

Registry rows in `tests/log/_auditableMutations.ts`:

```ts
{ file: "app/api/admin/alerts/bell/open/route.ts", fn: "POST", code: "BELL_OPENED" },
{ file: "app/api/admin/alerts/bell/read/route.ts", fn: "POST", code: "BELL_READ_MARKED" },
```

- [ ] **Step 2: Run to verify failure** — expected: FAIL (routes missing; discovery meta-test also fails on unregistered surfaces once files exist but rows don't — keep rows in this commit).

- [ ] **Step 3: Implement.** Shared timestamp guard (put in `lib/admin/bellFeed.ts` or a small `lib/admin/bellValidation.ts`):

```ts
const SKEW_MS = 60_000;
export function parseBellTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  if (ms > Date.now() + SKEW_MS) return null;
  return new Date(ms).toISOString();
}
```

`open/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { parseBellTimestamp } from "@/lib/admin/bellValidation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let email: string;
  try {
    ({ email } = await requireAdminIdentity());
  } catch (err) {
    if (err instanceof AdminInfraError) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    throw err;
  }
  const body = await request.json().catch(() => null);
  const seenThrough = parseBellTimestamp(body?.seenThrough);
  if (!seenThrough) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.rpc("bell_mark_opened", {
    p_admin_email: email,
    p_seen_through: seenThrough,
  });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  await logAdminOutcome({
    code: "BELL_OPENED",
    source: "api.admin.alerts.bell.open",
    actorEmail: email,
  });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
```

`read/route.ts` — same skeleton, plus before the write (fail-closed visibility, spec §10):

```ts
  const alertId = typeof body?.alertId === "string" ? body.alertId : "";
  const seenActivityAt = parseBellTimestamp(body?.seenActivityAt);
  if (!UUID_RE.test(alertId) || !seenActivityAt) {
    return NextResponse.json({ error: "invalid" }, { status: alertId && !UUID_RE.test(alertId) ? 404 : 400 });
  }
  const viewerIsDeveloper = await isCurrentUserDeveloper();
  const { data: rows, error: lookupError } = await supabase
    .from("admin_alerts")
    .select("id, code")
    .eq("id", alertId)
    .limit(1);
  if (lookupError) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const row = rows?.[0];
  if (!row || bellExcludedCodes(viewerIsDeveloper).includes(row.code)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { error } = await supabase.rpc("bell_mark_read", {
    p_alert_id: alertId, p_admin_email: email, p_seen_activity_at: seenActivityAt,
  });
  // ... 503 on error; logAdminOutcome BELL_READ_MARKED; 200 {ok:true}
```

(`UUID_RE` — reuse the exported one if `rg "UUID_RE" lib/ app/` finds a shared source, else the same regex `app/admin/actions.ts` uses.) The `admin_alerts` read is `.limit(1)`-bounded — register it or satisfy `tests/admin/_metaBoundedReads.test.ts` as the meta-test demands.

- [ ] **Step 4: Run everything this task touches** — `pnpm test tests/app/api/bellOpenRoute.test.ts tests/app/api/bellReadRoute.test.ts tests/log tests/admin/_metaBoundedReads.test.ts`. Expected: PASS (registry + behavior + discovery all green).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/alerts/bell/open app/api/admin/alerts/bell/read lib/admin/bellValidation.ts tests/
git commit --no-verify -m "feat(admin): bell open/read routes — snapshot-stamped monotonic marks, invariant-10 registered"
```

---

### Task 11: Route — `POST .../config` (developer-gated)

**Files:**
- Create: `app/api/admin/alerts/bell/config/route.ts`
- Modify: `tests/log/_auditableMutations.ts` (+1 row `BELL_CONFIG_UPDATED`), `tests/log/adminOutcomeBehavior.test.ts` (+1 proof)
- Test: `tests/app/api/bellConfigRoute.test.ts`

**Interfaces:**
- Consumes: `requireDeveloperIdentity` (`lib/auth/requireDeveloper.ts` — returns `{ email }`, forbidden() for non-devs), `BELL_LIMITS` (Task 4).
- Produces: `POST { historyDays, feedCap } → 200 { ok: true, historyDays, feedCap }`; out-of-range/non-integer → `400 { error: "invalid", limits: BELL_LIMITS }` (no silent clamp — spec §12; response mirrors bounds so the dev footer renders them).

- [ ] **Step 1: Write failing tests:**

```ts
// 1. non-dev (requireDeveloperIdentity mock throws forbidden) → propagates (Next 403).
// 2. historyDays below/above BELL_LIMITS.historyDays bounds → 400 incl. limits; NO update call.
// 3. non-integer / missing / NaN → 400.
// 4. valid → 200 echoing values; supabase update called with .eq("id","default")
//    and EXACTLY { bell_history_days, bell_feed_cap }.
// 5. update returns {error} → 503; no BELL_CONFIG_UPDATED emit.
// Derive the boundary probe values FROM BELL_LIMITS (min-1, max+1), never literals —
// keeps the test true if bounds ever change (and they must match SQL CHECKs, Task 4 test).
```

Plus the `adminOutcomeBehavior` proof + `AUDITABLE_MUTATIONS` row (`fn: "POST"`, code `BELL_CONFIG_UPDATED`).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — same route skeleton as Task 10; validation:

```ts
function parseBellConfigField(value: unknown, bounds: { min: number; max: number }): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < bounds.min || value > bounds.max) return null;
  return value;
}
```

Update via service client: `.from("app_settings").update({ bell_history_days: historyDays, bell_feed_cap: feedCap }).eq("id", "default").select("id")` — destructure `{ data, error }`, success requires ≥1 returned row (mirrors the `resolveAdminAlertFormAction` post-commit-emit rule), then `logAdminOutcome({ code: "BELL_CONFIG_UPDATED", source: "api.admin.alerts.bell.config", actorEmail: email, extra: { historyDays, feedCap } })`.

- [ ] **Step 4: Run** — `pnpm test tests/app/api/bellConfigRoute.test.ts tests/log`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/alerts/bell/config tests/
git commit --no-verify -m "feat(admin): developer-gated bell config route (history window + feed cap)"
```

---

### Task 12: Realtime client — token mint route + `subscribeToBell` + `useBellBadge`

**Files:**
- Create: `app/api/admin/alerts/bell/token/route.ts`, `lib/realtime/subscribeToBell.ts`, `components/admin/nav/useBellBadge.ts`
- Modify: `tests/log/mutationSurface/exemptions.ts` (+1 read-only row for the token POST)
- Test: `tests/app/api/bellTokenRoute.test.ts`, `tests/realtime/subscribeToBell.test.ts`, `tests/components/useBellBadge.test.tsx`

**Interfaces:**
- Consumes: JWT mint contract of `app/api/realtime/subscriber-token/route.ts:34-56` (SignJWT HS256, `SUPABASE_JWT_SECRET` ≥32 bytes, `iss = SUPABASE_REALTIME_ISS`, TTL 5 min); `subscribeToShow` DI shape (`lib/realtime/subscribeToShow.ts:144`); `getSupabaseBrowserClient` (`lib/supabase/browser.ts:32`); `useNeedsAttentionBadge` race pattern (`components/admin/nav/useNeedsAttentionBadge.ts`).
- Produces:

```ts
// lib/realtime/subscribeToBell.ts — NOT a client component (node-testable, DI like subscribeToShow)
export function subscribeToBell(
  supabase: SupabaseClient, jwt: string,
  onChanged: () => void, onStatus?: (status: string) => void,
): { channel: RealtimeChannel; subscribed: Promise<void> };

// components/admin/nav/useBellBadge.ts ("use client")
export function useBellBadge(initial: BellCountResult): { count: number | null; degraded: boolean; refetch: () => void };
```

- [ ] **Step 1: Write failing tests.**
  - Token route (clone `tests/app/api/needsAttentionCountRoute.test.ts` harness + the assertions style of any existing subscriber-token test — locate with `rg -l "subscriber-token" tests/`): 503 when `SUPABASE_JWT_SECRET`/`SUPABASE_REALTIME_ISS` unset or secret <32 bytes (500 per mint contract — mirror the existing route's status), 200 mints a JWT whose decoded payload has `viewer_kind: "admin"`, `role: "authenticated"`, `exp - iat = 300`, **no `show_id` claim** (spec §5.3); non-admin → propagated control flow.
  - `subscribeToBell` (clone `tests/realtime/subscribeToShow.test.ts` fake-client): calls `supabase.realtime.setAuth(jwt)`; opens channel `admin:alerts` with `config: { private: true, broadcast: { self: false } }`; `onChanged` fires on `changed` broadcast; `subscribed` resolves on `SUBSCRIBED`, rejects on `CHANNEL_ERROR`.
  - `useBellBadge` (jsdom + `@testing-library/react`, mirror `useNeedsAttentionBadge` tests if present — locate with `rg -l useNeedsAttentionBadge tests/`): initial `{kind:"ok",count:3}` → 3; `{kind:"infra_error"}` → degraded true; pathname change triggers `/api/admin/alerts/bell/count` fetch (mock fetch), stale response discarded via token race (fire two, resolve out of order); fetch fault → keeps last-known (spec §5.4 — bell keeps, not hides).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**
  - Token route: copy the mint core of `app/api/realtime/subscriber-token/route.ts` (SignJWT block, secret-length check, env guards) minus show resolution; auth via `requireAdminIdentity` (email → `sub: email`); claims `{ sub, exp, iss, role: "authenticated", viewer_kind: "admin" }`. Add exemption row: `{ file: "app/api/admin/alerts/bell/token/route.ts", fn: "POST", kind: "read-only" }` (mints a JWT, writes no state — spec §4).
  - `subscribeToBell`: mirror `subscribeToShow` §structure with topic `admin:alerts`, event `changed`, no payload guard needed (contentless ping — any `changed` event triggers `onChanged()`).
  - `useBellBadge`: clone `useNeedsAttentionBadge`'s three-source race-safe core (prop sync + pathname refetch + monotonic token + abort), CHANGES: fault → keep last-known count and set `degraded` only when initial was infra_error; add a fourth source — on mount, POST `token` then `subscribeToBell(getSupabaseBrowserClient(), jwt, () => refetch())`; on channel error or token failure, tear down once and re-mint once, then degrade silently to pathname mode (spec §5.4); cleanup on unmount removes the channel.

- [ ] **Step 4: Run** — `pnpm test tests/app/api/bellTokenRoute.test.ts tests/realtime/subscribeToBell.test.ts tests/components/useBellBadge.test.tsx tests/log`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/alerts/bell/token lib/realtime/subscribeToBell.ts components/admin/nav/useBellBadge.ts tests/
git commit --no-verify -m "feat(admin): bell realtime — admin token mint, private-channel subscribe, badge hook"
```

---

### Task 13: UI — `NotifBell` rewrite + `BellPanel` (shell, sections, states)

**UI task — Opus-owned (AGENTS.md routing rule).**

**Files:**
- Modify: `components/admin/nav/NotifBell.tsx` (rewrite), `components/admin/nav/AdminNav.tsx` (prop change)
- Create: `components/admin/BellPanel.tsx`
- Test: `tests/components/notifBell.test.tsx`, `tests/components/bellPanel.test.tsx`

**Interfaces:**
- Consumes: `useBellBadge` (Task 12), `AppHealthPopover` shell pattern (`components/admin/AppHealthPopover.tsx:35` — CONTROLLED component, caller owns open state; `useDialogFocus(containerRef, closeRef)` from `lib/a11y/dialogFocus.ts:41`; scrim `bg-text-strong/40`; panel `w-full max-w-[420px] rounded-t-md sm:rounded-md bg-surface shadow-tile motion-safe:animate-[sheet-rise_var(--duration-normal)_var(--ease-out-quart)] motion-reduce:animate-none`), trigger-owns-state pattern (`components/admin/nav/AppHealthIndicator.tsx:76`), `getRequiredDougFacing`/`isMessageCode`/`messageFor` (`lib/messages/lookup.ts`), `ErrorExplainer` (`components/messages/ErrorExplainer.tsx:73`), feed route (Task 9), open route (Task 10).
- Produces: `NotifBell({ initialCount: BellCountResult; viewerIsDeveloper: boolean })` — badge/testids/a11y contract preserved: `data-testid` `admin-notif-bell` / `admin-notif-badge` / `admin-notif-bell-degraded`, `9+` cap, badge hidden at 0, degraded `!` chip with `getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED")` label (all from the current `components/admin/nav/NotifBell.tsx`). New: `<button aria-haspopup="dialog" aria-expanded={open}>`; `BellPanel({ viewerIsDeveloper, onClose, onOpened })` testids: `bell-panel`, `bell-panel-close`, `bell-section-active`, `bell-section-history`, `bell-entry-<alertId>`, `bell-unread-dot-<alertId>`, `bell-empty`, `bell-error`, `bell-truncation-row`.

- [ ] **Step 1: Write failing component tests** (jsdom + RTL; **anti-tautology:** every "panel shows X" assertion queries WITHIN `screen.getByTestId("bell-panel")` after removing sibling surfaces — render NotifBell alone, never inside AdminNav):

```tsx
// NotifBell:
// 1. count>0 → badge shows count; >9 → "9+"; 0 → no badge node (guard row, spec §12).
// 2. initial infra_error → degraded testid + "!" chip + aria-label from
//    getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED") — assert label equals the
//    catalog-derived string, not a hardcoded literal.
// 3. click → aria-expanded true + bell-panel mounts; Esc → closes, focus returns
//    to the trigger (useDialogFocus restore).
// BellPanel (mock global.fetch per-test):
// 4. feed 200 with entries → active section renders entries with unread dots only
//    where entry.unread; history section renders dimmed rows, NO unread dots, NO
//    resolve buttons (mode boundary, spec §7.3).
// 5. after feed render, POST /bell/open fired EXACTLY once with body
//    { seenThrough: <the feed's seenThrough> } — order: feed resolved BEFORE open
//    (spec §7.2 snapshot-safety; assert fetch call order + body).
// 6. feed 503 → bell-error renders dougFacing copy for ALERT_BELL_FEED_FAILED
//    (via catalog lookup, not literal) + Retry button; Retry refires feed fetch.
// 7. entries [] → bell-empty ("You're all caught up." + window subline incl.
//    historyDays from the response).
// 8. truncated:true → bell-truncation-row present, includes feedCap from response
//    (R2.2: derive expectation from the MOCKED response value, e.g. 37, not 50).
// 9. occurrences>1 → ×N chip; ===1 → no chip.
// 10. uncataloged code in an entry → row renders generic fallback, no throw
//     (isMessageCode guard, spec §6.2).
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**
  - `NotifBell.tsx` (`"use client"`): keep the two visual branches from the current file byte-for-byte where possible (badge markup, classes, aria-labels); replace `<Link href="/admin#alerts">` with `<button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>`; `const { count, degraded, refetch } = useBellBadge(initialCount)`; `{open ? <BellPanel viewerIsDeveloper={viewerIsDeveloper} onClose={() => setOpen(false)} onOpened={refetch} /> : null}`.
  - `BellPanel.tsx` (`"use client"`): clone the `AppHealthPopover` dialog skeleton (scrim button testid `bell-panel-backdrop`, `useDialogFocus`, Esc handler, drag handle, header "Notifications" + close button `bell-panel-close`); body `max-h-[70vh] overflow-y-auto sm:max-h-[480px]` `bg-surface`; on mount `fetch("/api/admin/alerts/bell/feed")` → local state `{ status: "loading" | "error" | "ready", feed? }`; on ready, `fetch("/api/admin/alerts/bell/open", { method: "POST", body: JSON.stringify({ seenThrough: feed.seenThrough }) })` fail-quiet, then `onOpened()` (badge refetch — zeroes via server truth, spec §7.2). Sections:
    - Active rows: fixed `size-2` dot slot (`<span data-testid={...} className="inline-flex size-2 shrink-0">` with the dot as `motion-safe:transition-opacity duration-fast` — visible when unread, transparent when read; slot always occupies space, §14 invariant); catalog `title` via `messageFor`, dougFacing line, identity segments line (reuse the exact renderer AlertBanner uses for `SerializedAlertIdentity` — copy it in, do not import from the soon-deleted banner), `×N` chip (`rounded-sm bg-surface-sunken px-1 text-xs tabular-nums`), relative time from `activityAt`.
    - History rows: `text-text-subtle`, "Resolved <relative time>", subheader `History (last {historyDays} days)`.
    - Empty: `bg-surface-sunken` block, "You're all caught up." + "History window: {historyDays} days".
    - Error: `ALERT_BELL_FEED_FAILED` dougFacing via `getRequiredDougFacing` + Retry.
    - Truncation row: developer → "Showing the first {feedCap} — older items are in telemetry"; non-dev → "Showing the first {feedCap} — older items age out of this list."
  - `AdminNav.tsx`: change `<NotifBell alertCount={alertCount} />` to `<NotifBell initialCount={alertCount} viewerIsDeveloper={viewerIsDeveloper} />` (the layout prop rename lands in Task 15; keep `AlertCountResult`-compatible `BellCountResult` shape so this is type-only).

- [ ] **Step 4: Run** — `pnpm test tests/components/notifBell.test.tsx tests/components/bellPanel.test.tsx && pnpm typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/nav/NotifBell.tsx components/admin/BellPanel.tsx components/admin/nav/AdminNav.tsx tests/components/
git commit --no-verify -m "feat(admin): bell notification panel — sections, states, snapshot-safe open"
```

---

### Task 14: UI — row actions (resolve, retry carry-over, read marks, dev footer)

**UI task — Opus-owned.**

**Files:**
- Modify: `components/admin/BellPanel.tsx`
- Test: `tests/components/bellPanelActions.test.tsx`

**Interfaces:**
- Consumes: existing resolve routes (`app/api/admin/admin-alerts/[id]/resolve/route.ts` global; `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` show-scoped — door order 403 HEALTH → 409 auto → 400 scope → 200 preserved, DO NOT build a new resolve path), `retryWatchSubscriptionFormAction` (`components/admin/AlertBanner.tsx:34` import — move the import to BellPanel), read route (Task 10), config route (Task 11).
- Produces: complete BellPanel per spec §7.3/§7.4.

- [ ] **Step 1: Write failing tests** (same anti-tautology scoping):

```tsx
// 1. manual non-health active entry → Resolve button; click →
//    POST /api/admin/admin-alerts/<id>/resolve when showId null,
//    POST /api/admin/show/<slug>/alerts/<id>/resolve when slug present
//    (assert exact URL per case); then feed refetches.
// 2. auto entry (derive code from AUTO_RESOLVING_CODES) → NO resolve button;
//    autoResolveNote text present (assert equals autoResolveNote(code)).
// 3. health entry (dev view; derive from HEALTH_CODES ∩ feed fixture) → NO resolve
//    button; "View in telemetry" link href="/admin/dev/telemetry#health".
// 4. WATCH_CHANNEL_ORPHANED entry → Retry affordance present (form/action wired to
//    retryWatchSubscriptionFormAction — assert the form/button exists; the banner
//    is being deleted, this is the carry-over, spec §7.3/§8).
// 5. action link chip renders when entry.action non-null (href/label/external from
//    the entry), absent when null.
// 6. expanding a row (click) → helpfulContext disclosure opens AND
//    POST /bell/read fired with { alertId, seenActivityAt: entry.activityAt };
//    dot clears optimistically (opacity class flips) with NO layout shift
//    (slot still present); read POST failure → dot stays cleared this session,
//    no error UI (fail-quiet, spec §4).
// 7. dev footer: viewerIsDeveloper=false → data-testid bell-dev-footer ABSENT;
//    true → shows "Window: {historyDays}d · Cap: {feedCap}", edit+Save POSTs
//    /bell/config with typed ints; 400 response → bounds message rendered from
//    response.limits (derive from mocked response).
// 8. COMPOUND (transition inventory): resolve clicked while a read POST in flight →
//    both fire, UI lands on refetched feed state (no crash, no double-resolve).
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** per spec §7.3: row expand state (`useState<Set<string>>`), resolve via `fetch(url, { method: "POST" })` + refetch on 200/409/404 (409 = auto-converted code raced — refetch shows the note), read POST on first expand only, optimistic dot clear, dev footer with two `<input type="number" inputMode="numeric">` + Save. All copy through catalog lookups (invariant 5).

- [ ] **Step 4: Run** — `pnpm test tests/components/ && pnpm typecheck && pnpm lint`. Expected: PASS (lint: canonical Tailwind classes — `wrap-break-word` not `break-words`).

- [ ] **Step 5: Commit**

```bash
git add components/admin/BellPanel.tsx tests/components/bellPanelActions.test.tsx
git commit --no-verify -m "feat(admin): bell panel row actions — resolve wiring, retry carry-over, read marks, dev footer"
```

---

### Task 15: Mount in both chromes, retire AlertBanner, layout wiring

**UI task — Opus-owned.**

**Files:**
- Modify: `app/admin/layout.tsx` (~:138-186), `components/admin/nav/OnboardingTopBar.tsx`, `components/admin/nav/AdminNav.tsx` (prop types), `app/admin/page.tsx` (:43, :113), `app/admin/needs-attention/page.tsx` (:19, :57), `lib/messages/adminSurface.ts` (doc comment :4-9)
- Delete: `components/admin/AlertBanner.tsx`, `components/admin/AlertBannerRouteBoundary.tsx`, their tests, `lib/admin/alertCount.ts` + its tests (if orphaned — verify Step 3)
- Test: `tests/components/onboardingTopBar.test.tsx` (or extend existing), existing layout/page tests

**Interfaces:**
- Consumes: `loadBellUnseenCount` (Task 8), `NotifBell` (Task 13), OnboardingTopBar props (`components/admin/nav/OnboardingTopBar.tsx:22` — `{ email, healthRollup?, isDeveloper? }`).
- Produces: bell live in BOTH chromes with server-computed initial count; AlertBanner gone.

- [ ] **Step 1: Write failing tests:**

```tsx
// 1. OnboardingTopBar renders NotifBell (getByTestId admin-notif-bell) beside
//    AppHealthIndicator when passed bellCount prop (spec §7.1/R8 — onboarding
//    chrome keeps a non-health alert surface after banner retirement).
// 2. (existing page tests) app/admin/page.tsx renders WITHOUT AlertBanner —
//    update snapshots/assertions that referenced it; the #alerts anchor div is
//    also removed.
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**
  - `app/admin/layout.tsx`: replace `fetchUnresolvedAlertCount()` in the `Promise.all` with `loadBellUnseenCount(adminEmail, viewerIsDeveloper)`; rename `AdminNav`'s prop `alertCount: AlertCountResult` → `bellCount: BellCountResult` end-to-end (layout call site, `AdminNav.tsx` props type, and the internal `<NotifBell initialCount={bellCount} ...>` pass-through from Task 13); onboarding branch: `<OnboardingTopBar email={adminEmail} healthRollup={healthRollup} isDeveloper={viewerIsDeveloper} bellCount={bellCount} />`.
  - `OnboardingTopBar.tsx`: add optional `bellCount?: BellCountResult`; render `<NotifBell initialCount={bellCount} viewerIsDeveloper={Boolean(isDeveloper)} />` beside `AppHealthIndicator` when provided.
  - Remove both `<AlertBanner />` mounts + imports + the `id="alerts"` anchor div; delete the component files and their tests.
  - Orphan check: `rg -n "fetchUnresolvedAlertCount|AlertCountResult" app/ components/ lib/ tests/ --glob '!lib/admin/alertCount.ts'` — if only NotifBell's old import remains (now rewritten), delete `lib/admin/alertCount.ts` + tests and remove its `_metaBoundedReads` registration; if other consumers exist, keep it and note why in the commit body.
  - Class-sweep (spec §8): `rg -n "AlertBanner|#alerts|BANNER_EXCLUDED_CODES" app/ components/ lib/ tests/ docs/DESIGN.md` — fix every live-code hit (docs/plans mentions stay); update the consumer list in `lib/messages/adminSurface.ts:4-9` doc comment (banner → bell panel/feed routes).
  - Check `tests/admin/_metaManualResolveRegistry.test.ts`: BellPanel posts to the EXISTING routes and never calls `resolveAdminAlert(s)` directly, so its `callers[]` walk should not require changes — run it; if it fails, add the row it demands.

- [ ] **Step 4: Run the FULL suite** — `pnpm test`. Banner-referencing tests must be updated/deleted; catalog/meta tests must stay green. `pnpm typecheck && pnpm lint && pnpm format:check`. Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit --no-verify -m "feat(admin): mount bell in both chromes; retire AlertBanner (spec §7.1/§8)"
```

---

### Task 16: Real-browser layout assertions + transition audit

**Files:**
- Create: `tests/e2e/bell-panel-layout.spec.ts`
- Test: run via `pnpm test:e2e tests/e2e/bell-panel-layout.spec.ts`

**Interfaces:**
- Consumes: Playwright harness pattern (`tests/e2e/admin-nav-layout-dimensions.spec.ts:52-93` — `signInAs(ADMIN_FIXTURE)`, `admin` service-role seeding with pre-clean/cleanup, `rect(page, testid)` via `getBoundingClientRect`, TOL 0.5, width sweep).

**Dimensional invariants under test (spec §14 — the complete list; jsdom is NOT sufficient):**
1. The unread-dot slot occupies a fixed `size-2` box whether the dot is visible or not: `rect` of `bell-unread-dot-<id>` has `width===8 && height===8` (±0.5) before AND after clicking the row (U→R no-layout-shift: the row's own rect top/height unchanged after read).
2. Panel width: `bell-panel` inner container `width <= 420` on desktop widths (1024/1280) and `width === viewport width` (±0.5) on mobile (600) — sheet mode.

- [ ] **Step 1: Write the spec file** with both assertions + the badge behaviors that need a real browser: seed one unresolved global alert (service-role insert via `admin`), sign in, assert `admin-notif-badge` count; open panel; run invariant asserts; click row; re-assert.

- [ ] **Step 2: Run** — `pnpm test:e2e tests/e2e/bell-panel-layout.spec.ts` against the local stack. Expected: PASS.

- [ ] **Step 3: Transition audit (spec §13 — full inventory in the spec; audit these in code + tests):** list every conditional render in NotifBell/BellPanel (`{open ? ... : null}`, badge mount, dot opacity, section swaps, L→ready/E/Z, disclosure expand) and confirm each matches its declared treatment (sheet-rise on C→O via the cloned classes; instant badge swaps; dot `transition-opacity duration-fast`; NO animation on feed refetch reflow; disclosure height expand like the banner's ErrorExplainer). Compound cases covered by unit tests (Task 14 case 8) + this e2e (ping-while-open is exercised by inserting a second alert mid-open via service-role and asserting the refetched panel + badge). Write the audit result as a comment block at the top of `tests/e2e/bell-panel-layout.spec.ts` enumerating each transition → treatment → where tested.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/bell-panel-layout.spec.ts
git commit --no-verify -m "test(admin): bell panel real-browser layout invariants + transition audit"
```

---

### Task 17: Impeccable dual-gate (invariant 8)

- [ ] **Step 1:** Run `/impeccable critique` on the UI diff (NotifBell, BellPanel, AdminNav, OnboardingTopBar, deleted banner) with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal).
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix every HIGH/CRITICAL finding or defer explicitly via a `DEFERRED.md` entry (deferral discipline; prettier-after-conflict-resolution note applies to DEFERRED.md edits).
- [ ] **Step 4: Commit** fixes (`fix(admin): impeccable findings — <summary>`) and record findings + dispositions for the ship summary.

---

### Task 18: Validation apply + close-out + ship

- [ ] **Step 1: Validation project migrations** (from the MAIN checkout, `.env.local` there): for EACH of the three migration files, `psql "$TEST_DATABASE_URL" -f supabase/migrations/<file>.sql`, then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`. Then `pnpm test:audit:validation-schema-parity` (Layer 1 + Layer 2 green).
- [ ] **Step 2: Full local gates** — `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`. Triage any failure: env/psql vs real (memory: worktree test fails can be branch-vs-shared-DB skew — re-run DB suites after confirming local stack has all migrations).
- [ ] **Step 3: Stale-base guard** — `git fetch origin && git rebase origin/main`; re-run structural completeness meta-tests + `pnpm test tests/messages tests/log tests/db` after any rebase (rebase lesson: catalog counts / registries drift under sibling PRs). Re-diff `git diff origin/main..HEAD --stat` and confirm only this feature's files.
- [ ] **Step 4: Whole-diff cross-model review** — Codex adversarial review of the full branch diff (fresh-eyes posture; do-not-relitigate list from spec §18 + ratified R3 dispositions). Iterate to APPROVE.
- [ ] **Step 5: Push + PR + real CI** — push branch; `gh pr create` (body per repo convention + Claude attribution footer); watch checks via `gh pr checks <PR#> --watch` (PR number, NOT SHA); confirm `mergeStateStatus == CLEAN`.
- [ ] **Step 6: Merge + sync** — `gh pr merge <PR#> --merge`; fast-forward local main in the MAIN checkout; verify `git rev-list --left-right --count main...origin/main` → `0	0`. Remove the worktree.

---

## Plan checklist (writing-plans process)

- [x] Pre-draft code-verification pass (spec citation pass + plan-shape recon: logAdminOutcome, exemptions, behavior-proof, lockdown registry, popover pattern, layout branches, x1 parity fields — all verified against the live worktree)
- [ ] Self-review (spec coverage / placeholder scan / type consistency)
- [ ] Adversarial review (cross-model) of this plan — to APPROVE, no round budget
- [ ] Execution handoff (subagent-driven; user gates waived per autonomous-ship approval)
