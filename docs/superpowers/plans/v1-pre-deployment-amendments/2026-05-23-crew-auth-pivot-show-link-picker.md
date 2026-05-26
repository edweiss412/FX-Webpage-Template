# Crew Auth Pivot — Show-Link + Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md` (~1300 lines; 45 rounds of cross-model adversarial review — initial 40 plus R41-R1 through R41-R45). Read it end-to-end before starting. **§6.0 is the canonical Timestamp Defense Contract**; cite it from every timestamp-related task.

**Goal:** Replace the M9.5 per-crew-member signed-link auth model with one-show-link + "who are you?" identity picker, per the 2026-05-23 owner determination in `PRODUCT.md:69-83`.

**Architecture:** Crew URL becomes `/show/<slug>/<share-token>` where `<share-token>` is a 256-bit hex bearer credential stored in a new private `show_share_tokens` table. The picker is a Server-Component interstitial; selection persists in a single HMAC-signed `__Host-fxav_picker` host-wide cookie keyed by `show_id`. R41 restores Google sign-in as an OPTIONAL crew identity (Decisions 15-17): callback stamps `claimed_via_oauth_at`; `/api/auth/picker-bootstrap` Route Handler lazy-mints picker cookies for signed-in users; signed-in user's `/me` lists tokenized URLs for cross-show discovery. **FIVE cookie-mutator surfaces** (3 Server Actions + picker-bootstrap + sign-out which uniquely writes Max-Age=0). Admin per-show panel adds Reset (bumps `shows.picker_epoch`) and Rotate (rotates token + bumps epoch atomically; in-DB `is_admin()` gate). All M9.5 surfaces deleted in the same execution.

---

## R41 AMENDMENTS APPLIED (45 rounds of adversarial review)

This plan was last revised before the R41 wave. The spec is authoritative for any detail not yet propagated here; implementers MUST cross-reference both. The R41 amendments propagated below:

- **R41-R6, R41-R7, R41-R10, R41-R11, R41-R12** — auth chain: `resolveShowPageAccess` page-route-only helper with archived → admin → unpublished → Google-session-resolve → cookie chain (12 kinds → 11 per R41-R35); picker-bootstrap fail-closed 502 on RPC failure; same-user OAuth upgrade routing; callback-RPC-failure retry via bootstrap.
- **R41-R16, R41-R17** — email canonicalization at caller boundary; `auth_email_canonical()` instead of raw `auth.email()`; viewer_version_token includes `picker_epoch` suffix.
- **R41-R18, R41-R22, R41-R23, R41-R30, R41-R31** — §6.0 Timestamp Defense Contract: cookie.t in milliseconds (`bigint`); `clock_timestamp()` AFTER advisory-lock acquisition (NOT `now()` which returns transaction-start time); `floor(epoch * 1000)::bigint` cast (NOT `::bigint` which uses banker's rounding); strict-greater `>` for cookie-path acceptance; inclusive `<=` for bootstrap-routing and resolver invalidation (catches ties); selectIdentity goes through `select_identity_atomic` RPC under the per-show advisory lock.
- **R41-R19** — `claim_oauth_identity` uses `upsert_admin_alert(show_id, code, context)` helper (NOT raw INSERT) for any admin alerts.
- **R41-R20, R41-R21, R41-R41, R41-R42, R41-R44** — FIVE cookie-mutator surfaces: `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`, `/api/auth/picker-bootstrap` (mints `Max-Age=7776000`), `/auth/sign-out` (clears `Max-Age=0`; R41-R41 credential-lifetime fix). `/auth/callback` is NOT a cookie mutator (DB-stamp only; lazy-mint via bootstrap on first show visit).
- **R41-R28, R41-R29** — every SECURITY DEFINER RPC that mutates `shows.picker_epoch` OR `show_share_tokens.share_token` includes the in-function `public.is_admin()` gate. Two writers of picker_epoch: `reset_picker_epoch_atomic` AND `rotate_show_share_token`.
- **R41-R33, R41-R34** — `select_identity_atomic(p_slug, p_share_token, p_crew_member_id)` re-validates share-token INSIDE the per-show advisory lock via two-step lookup (drive_file_id from slug → lock → resolve_show_by_slug_and_token). Closes a real race where rotation between JS pre-resolve and RPC lock could mint a cookie from an already-invalid token.
- **R41-R35** — ambiguous-email defenses REMOVED. The live schema's partial UNIQUE index `crew_members_show_email_unique ON (show_id, email) WHERE email IS NOT NULL` (at `supabase/migrations/20260501000000_initial_public_schema.sql:49-51`) makes the duplicate-email-on-same-show state impossible. The constraint is the canonical defense; no in-RPC GROUP BY HAVING checks, no `data-ambiguous` UI states, no `PICKER_IDENTITY_AMBIGUOUS` rejection code, no `email_ambiguous` resolver arm. The pre-pivot `AMBIGUOUS_EMAIL_BINDING` code may remain as defensive surface for schema corruption, but R41 introduces no new emission paths.

**New surfaces / tasks added below (not in original plan):**

- Task A7: `crew_members.claimed_via_oauth_at` column.
- Task A8: `claim_oauth_identity` SECURITY DEFINER RPC.
- Task A9: `my_share_tokens_for_email` SECURITY DEFINER RPC.
- Task B7: `resolveShowPageAccess` page-route-only helper (11-arm union).
- Task C5: `<SignInOrSkipGate>` first-contact component.
- Task C6: `/api/auth/picker-bootstrap` Route Handler.
- Task C7: `/auth/callback` claim-stamp hook (DB-only).
- Task G0e2: `/auth/sign-out` clears `__Host-fxav_picker` with `Max-Age=0`.

**Existing tasks updated for R41 amendments:**

- Task B2 `resolvePickerSelection`: discriminated union expanded with `identity_invalidated` arm (two reasons: `'claimed_after_pick'` from R41-R8/R41-R35 + `'session_mismatch'` from P-R29/P-R30 Fix-1 shared-device API defense); SQL uses `floor()` for epoch cast; resolver invalidates with `cookie.t <= floor(extract(epoch from claimed_via_oauth_at) * 1000)::bigint`.
- Task B3-pre `select_identity_atomic`: signature `(p_slug, p_share_token, p_crew_member_id)`; in-lock share-token re-validation; `observed_at_millis` from `clock_timestamp()` after lock; `floor()` cast.
- Task B3 `selectIdentity`: cookie.t sourced from `result.observed_at_millis` (NOT `Date.now()`).
- Task B6 `rotateShareToken`: in-DB `is_admin()` gate verified (existing); direct-PostgREST regression test pinning the 42501 error.
- Task A6 `viewer_version_token`: existing task already includes `picker_epoch` suffix per R17-F2 / R41-R17.

---

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase (Postgres + Auth + Realtime), TypeScript, Vitest (unit), Playwright (browser-rendered assertions per AGENTS.md mandate for dimensional invariants).

**Routing:** UI work is Opus per ROUTING.md hard rule. Backend (migrations, RPCs, Server Actions, API routes) can be either CLI; the spec's adversarial review was Codex-side, so the implementer should be Codex for backend and Opus for UI per the project pattern.

---

## Phase A: Database migrations + RPCs (foundation)

### Task A1: Add `shows.picker_epoch` + `shows.picker_epoch_bumped_at` columns

**Files:**
- Create: `supabase/migrations/20260523000001_picker_epoch_columns.sql`
- Test: `tests/db/picker_epoch_columns.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

describe('picker_epoch columns migration', () => {
  it('shows.picker_epoch exists with default 1', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('shows')
      .select('picker_epoch, picker_epoch_bumped_at')
      .limit(1);
    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it('a new show row gets picker_epoch=1 by default', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data: inserted } = await supabase
      .from('shows')
      .insert({
        drive_file_id: `test-${Date.now()}`,
        slug: `test-${Date.now()}`,
        title: 'Test',
        client_label: 'Test',
        template_version: 'v4',
      })
      .select('picker_epoch')
      .single();
    expect(inserted?.picker_epoch).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/db/picker_epoch_columns.test.ts`
Expected: FAIL with "column picker_epoch does not exist"

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260523000001_picker_epoch_columns.sql
-- R39/R40: picker_epoch invalidates all device cookies in one
-- operation. Bumped by reset_picker_epoch_atomic AND
-- rotate_show_share_token. Both run under the per-show advisory
-- lock per AGENTS.md invariant 2.

alter table public.shows
  add column picker_epoch int not null default 1,
  add column picker_epoch_bumped_at timestamptz not null default now();

-- R10/R11: revoke direct DML on shows from non-service callers.
-- All shows mutations post-pivot go through SECURITY DEFINER RPCs
-- or service-role server-side helpers. Column-level REVOKE on
-- new picker columns is NOT sufficient (column-level REVOKE does
-- not subtract from a previously granted table-level UPDATE per
-- Postgres semantics), so we revoke at the table level. Repo grep
-- confirmed zero direct .from('shows').update/insert/delete
-- callers in app/**, lib/**, components/**.
revoke update, insert, delete on table public.shows from anon, authenticated;
-- service_role retains its grant-all line from
-- 20260501002000_rls_policies.sql:228.
```

- [ ] **Step 4: Apply the migration**

Run: `pnpm supabase migration up` (or the project's apply-migration command).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/db/picker_epoch_columns.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260523000001_picker_epoch_columns.sql tests/db/picker_epoch_columns.test.ts
git commit -m "feat(db): add shows.picker_epoch + revoke direct DML (pivot A1)"
```

---

### Task A2: Create `show_share_tokens` private table with backfill + trigger

**Files:**
- Create: `supabase/migrations/20260523000002_show_share_tokens.sql`
- Test: `tests/db/show_share_tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

describe('show_share_tokens table', () => {
  it('exists and is REVOKE-locked from anon/authenticated', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase.rpc('exec_sql', {
      sql: `select has_table_privilege('authenticated', 'public.show_share_tokens', 'SELECT') as can_select`,
    });
    // anon/authenticated have NO access; only service_role does.
    expect(data?.[0]?.can_select).toBe(false);
  });

  it('every show row has a paired share_token (post-backfill)', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase.rpc('exec_sql', {
      sql: `
        select count(*) filter (where t.share_token is null) as missing_tokens
        from public.shows s
        left join public.show_share_tokens t on t.show_id = s.id
      `,
    });
    expect(data?.[0]?.missing_tokens).toBe(0);
  });

  it('new show insert auto-creates a 64-char hex token', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data: show } = await supabase
      .from('shows')
      .insert({
        drive_file_id: `test-${Date.now()}`,
        slug: `test-${Date.now()}`,
        title: 'Test',
        client_label: 'Test',
        template_version: 'v4',
      })
      .select('id')
      .single();
    const { data: token } = await supabase
      .from('show_share_tokens')
      .select('share_token')
      .eq('show_id', show!.id)
      .single();
    expect(token?.share_token).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/db/show_share_tokens.test.ts`
Expected: FAIL with "relation show_share_tokens does not exist"

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260523000002_show_share_tokens.sql
-- R34/R35/R36: the share-token is the bearer credential in the
-- crew URL /show/<slug>/<share-token>. Storing it in a separate
-- private table (not on public.shows) avoids leaking it through
-- can_read_show RLS. Hex encoding (URL-safe by definition).

create table public.show_share_tokens (
  show_id uuid primary key references public.shows(id) on delete cascade,
  share_token text not null unique
    check (share_token ~ '^[0-9a-f]{64}$')
    default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

-- PostgREST lockdown: only service_role accesses.
revoke all on table public.show_share_tokens from public, anon, authenticated;
grant all on table public.show_share_tokens to service_role;

-- Backfill (R36): existing dev shows get a token.
insert into public.show_share_tokens (show_id)
  select id from public.shows
  on conflict (show_id) do nothing;

-- Future shows: trigger inserts a paired token row.
create or replace function public.create_share_token_for_show()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  insert into public.show_share_tokens (show_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.create_share_token_for_show() from public;

create trigger shows_create_share_token_after_insert
  after insert on public.shows
  for each row
  execute function public.create_share_token_for_show();
```

- [ ] **Step 4: Apply and run test**

Run: `pnpm supabase migration up && pnpm vitest run tests/db/show_share_tokens.test.ts`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260523000002_show_share_tokens.sql tests/db/show_share_tokens.test.ts
git commit -m "feat(db): show_share_tokens private table + trigger + backfill (A2)"
```

---

### Task A3: Create `reset_picker_epoch_atomic` RPC

**Files:**
- Create: `supabase/migrations/20260523000003_reset_picker_epoch_atomic.sql`
- Test: `tests/db/reset_picker_epoch_atomic.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

describe('reset_picker_epoch_atomic RPC', () => {
  let showId: string;

  beforeAll(async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase
      .from('shows')
      .insert({
        drive_file_id: `t-${Date.now()}`,
        slug: `reset-test-${Date.now()}`,
        title: 'Reset Test',
        client_label: 'X',
        template_version: 'v4',
      })
      .select('id')
      .single();
    showId = data!.id;
  });

  it('bumps picker_epoch under the advisory lock and returns the new value', async () => {
    // R4-F3: service_role is NOT automatically admin per is_admin()'s
    // app_metadata check. Use a cookie-bound admin fixture so the
    // in-DB is_admin() resolves true for Doug/Eric's JWT.
    const supabase = createSupabaseServiceRoleClient();
    const { data: before } = await supabase
      .from('shows').select('picker_epoch').eq('id', showId).single();
    expect(before?.picker_epoch).toBe(1);

    const adminClient = await createTestAdminCookieBoundClient(); // helper
    const { data: newEpoch, error } = await adminClient
      .rpc('reset_picker_epoch_atomic', { p_show_id: showId });
    expect(error).toBeNull();
    expect(newEpoch).toBe(2);

    const { data: after } = await supabase
      .from('shows').select('picker_epoch, picker_epoch_bumped_at').eq('id', showId).single();
    expect(after?.picker_epoch).toBe(2);
    expect(after?.picker_epoch_bumped_at).toBeTruthy();
  });

  it('rejects non-admin callers via is_admin()', async () => {
    // Construct a non-admin cookie-bound client (test fixture).
    const nonAdminClient = await createTestNonAdminClient();
    const { error } = await nonAdminClient
      .rpc('reset_picker_epoch_atomic', { p_show_id: showId });
    expect(error?.code).toBe('42501');
  });

  it('raises P0002 on missing show (cookie-bound admin path; R10-F3)', async () => {
    // Service-role isn't is_admin() → would 42501. Use admin fixture
    // so the function passes the admin gate, then hits the missing-show
    // branch and raises P0002.
    const adminClient = await createTestAdminCookieBoundClient();
    const { error } = await adminClient
      .rpc('reset_picker_epoch_atomic', { p_show_id: '00000000-0000-0000-0000-000000000000' });
    expect(error?.code).toBe('P0002');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/db/reset_picker_epoch_atomic.test.ts`
Expected: FAIL with "function reset_picker_epoch_atomic does not exist"

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260523000003_reset_picker_epoch_atomic.sql
-- R7/R17/R18/R30/R31/R36/R40: atomic transaction (advisory lock +
-- UPDATE + publish_show_invalidation) requires a single SQL
-- function body. Server Action wraps via cookie-bound client so
-- in-function is_admin() resolves correctly.

create or replace function public.reset_picker_epoch_atomic(p_show_id uuid)
  returns int
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
  v_new_epoch int;
begin
  if not public.is_admin() then
    raise exception 'admin role required'
      using errcode = '42501',
            hint = 'reset_picker_epoch_atomic is admin-only';
  end if;

  select drive_file_id into v_drive_file_id
    from public.shows where id = p_show_id;
  if v_drive_file_id is null then
    raise exception 'show not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  update public.shows
     set picker_epoch = picker_epoch + 1,
         picker_epoch_bumped_at = now()
   where id = p_show_id
   returning picker_epoch into v_new_epoch;

  perform public.publish_show_invalidation(p_show_id);

  return v_new_epoch;
end;
$$;

revoke all on function public.reset_picker_epoch_atomic(uuid) from public;
grant execute on function public.reset_picker_epoch_atomic(uuid)
  to authenticated, service_role;
```

- [ ] **Step 4: Apply + test**

Run: `pnpm supabase migration up && pnpm vitest run tests/db/reset_picker_epoch_atomic.test.ts`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260523000003_reset_picker_epoch_atomic.sql tests/db/reset_picker_epoch_atomic.test.ts
git commit -m "feat(db): reset_picker_epoch_atomic RPC (advisory lock + publish; A3)"
```

---

### Task A4: Create `rotate_show_share_token` RPC

**Files:**
- Create: `supabase/migrations/20260523000004_rotate_show_share_token.sql`
- Test: `tests/db/rotate_show_share_token.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

describe('rotate_show_share_token RPC', () => {
  let showId: string;

  beforeEach(async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase
      .from('shows').insert({
        drive_file_id: `t-${Date.now()}`,
        slug: `rotate-${Date.now()}`,
        title: 'Rotate Test',
        client_label: 'X',
        template_version: 'v4',
      }).select('id').single();
    showId = data!.id;
  });

  it('atomically rotates share_token AND bumps picker_epoch (R40)', async () => {
    // R4-F3: cookie-bound admin client for is_admin() to resolve true.
    const supabase = createSupabaseServiceRoleClient();
    const { data: before } = await supabase
      .from('show_share_tokens').select('share_token').eq('show_id', showId).single();
    const { data: epochBefore } = await supabase
      .from('shows').select('picker_epoch').eq('id', showId).single();

    const adminClient = await createTestAdminCookieBoundClient();
    const { data: result, error } = await adminClient
      .rpc('rotate_show_share_token', { p_show_id: showId });
    expect(error).toBeNull();
    expect(result?.new_share_token).toMatch(/^[0-9a-f]{64}$/);
    expect(result?.new_share_token).not.toBe(before!.share_token);
    expect(result?.new_epoch).toBe(epochBefore!.picker_epoch + 1);
  });

  it('rejects non-admin via is_admin()', async () => {
    const nonAdminClient = await createTestNonAdminClient();
    const { error } = await nonAdminClient
      .rpc('rotate_show_share_token', { p_show_id: showId });
    expect(error?.code).toBe('42501');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL with "function rotate_show_share_token does not exist".

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260523000004_rotate_show_share_token.sql
-- R39/R40: rotation rotates the URL token AND bumps the picker
-- epoch atomically. Without the epoch bump, cookies minted from
-- the leaked URL before rotation would survive (they re-auth
-- by cookie, not by share-token).

create or replace function public.rotate_show_share_token(p_show_id uuid)
  returns table (new_share_token text, new_epoch int)
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
begin
  if not public.is_admin() then
    raise exception 'admin role required'
      using errcode = '42501';
  end if;

  select drive_file_id into v_drive_file_id
    from public.shows where id = p_show_id;
  if v_drive_file_id is null then
    raise exception 'show not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  update public.show_share_tokens
     set share_token = encode(gen_random_bytes(32), 'hex'),
         rotated_at = now()
   where show_id = p_show_id
   returning share_token into new_share_token;

  update public.shows
     set picker_epoch = picker_epoch + 1,
         picker_epoch_bumped_at = now()
   where id = p_show_id
   returning picker_epoch into new_epoch;

  perform public.publish_show_invalidation(p_show_id);

  return next;
end;
$$;

revoke all on function public.rotate_show_share_token(uuid) from public;
grant execute on function public.rotate_show_share_token(uuid)
  to authenticated, service_role;
```

- [ ] **Step 4: Apply + test + commit**

```bash
pnpm supabase migration up
pnpm vitest run tests/db/rotate_show_share_token.test.ts
git add supabase/migrations/20260523000004_rotate_show_share_token.sql tests/db/rotate_show_share_token.test.ts
git commit -m "feat(db): rotate_show_share_token RPC (atomic token+epoch; A4)"
```

---

### Task A5: Create `resolve_show_by_slug_and_token` RPC

**Files:**
- Create: `supabase/migrations/20260523000005_resolve_show_by_slug_and_token.sql`
- Test: `tests/db/resolve_show_by_slug_and_token.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

describe('resolve_show_by_slug_and_token RPC', () => {
  let showId: string, slug: string, token: string;

  beforeEach(async () => {
    const supabase = createSupabaseServiceRoleClient();
    slug = `resolve-${Date.now()}`;
    const { data: s } = await supabase.from('shows').insert({
      drive_file_id: `t-${Date.now()}`, slug, title: 'X',
      client_label: 'X', template_version: 'v4',
    }).select('id').single();
    showId = s!.id;
    const { data: t } = await supabase
      .from('show_share_tokens').select('share_token').eq('show_id', showId).single();
    token = t!.share_token;
  });

  it('returns show_id on slug + token match', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase.rpc('resolve_show_by_slug_and_token', {
      p_slug: slug, p_share_token: token,
    });
    expect(data).toBe(showId);
  });

  it('returns null on wrong token', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase.rpc('resolve_show_by_slug_and_token', {
      p_slug: slug, p_share_token: 'a'.repeat(64),
    });
    expect(data).toBeNull();
  });

  it('returns null on wrong slug', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase.rpc('resolve_show_by_slug_and_token', {
      p_slug: 'no-such-slug', p_share_token: token,
    });
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL with "function resolve_show_by_slug_and_token does not exist".

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260523000005_resolve_show_by_slug_and_token.sql
-- R35: the route handler reads show_share_tokens via this RPC.
-- show_share_tokens has REVOKE ALL from anon/authenticated, so
-- the only way to read it is via SECURITY DEFINER functions.

create or replace function public.resolve_show_by_slug_and_token(
  p_slug text, p_share_token text
)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select s.id
    from public.shows s
    join public.show_share_tokens t on t.show_id = s.id
   where s.slug = p_slug
     and t.share_token = p_share_token
   limit 1
$$;

revoke all on function public.resolve_show_by_slug_and_token(text, text) from public;
grant execute on function public.resolve_show_by_slug_and_token(text, text)
  to authenticated, service_role;
```

- [ ] **Step 4: Apply + test + commit**

```bash
pnpm supabase migration up
pnpm vitest run tests/db/resolve_show_by_slug_and_token.test.ts
git add supabase/migrations/20260523000005_resolve_show_by_slug_and_token.sql tests/db/resolve_show_by_slug_and_token.test.ts
git commit -m "feat(db): resolve_show_by_slug_and_token RPC (private token gate; A5)"
```

---

### Task A6: Rewrite `viewer_version_token` (drop `crew_member_auth` term)

**Files:**
- Create: `supabase/migrations/20260523000006_viewer_version_token_rewrite.sql`
- Test: `tests/db/viewer_version_token.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

describe('viewer_version_token (rewritten)', () => {
  it('advances when picker_epoch_bumped_at advances (pivot)', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data: show } = await supabase.from('shows').insert({
      drive_file_id: `t-${Date.now()}`, slug: `vvt-${Date.now()}`,
      title: 'VVT', client_label: 'X', template_version: 'v4',
    }).select('id').single();

    const { data: v1 } = await supabase.rpc('viewer_version_token', { p_show_id: show!.id });
    // R6-F3: reset_picker_epoch_atomic requires admin; use cookie-bound
    // admin fixture, not service-role.
    const adminClient = await createTestAdminCookieBoundClient();
    await adminClient.rpc('reset_picker_epoch_atomic', { p_show_id: show!.id });
    const { data: v2 } = await supabase.rpc('viewer_version_token', { p_show_id: show!.id });

    expect(v2).not.toBe(v1);
  });
});
```

- [ ] **Step 2-4: Write migration, apply, test**

```sql
-- supabase/migrations/20260523000006_viewer_version_token_rewrite.sql
-- R5/R7: replace crew_member_auth term (table deleted in Phase G)
-- with picker_epoch_bumped_at. R17-F2: also append the monotonic
-- picker_epoch counter to the returned token so two rapid bumps in
-- the same millisecond produce distinct version tokens. Same
-- string-returning signature.

create or replace function public.viewer_version_token(p_show_id uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select to_char(greatest(
    coalesce((select extract(epoch from last_synced_at) * 1000
              from public.shows where id = p_show_id), 0),
    coalesce((select extract(epoch from max(last_changed_at)) * 1000
              from public.crew_members where show_id = p_show_id), 0),
    coalesce((select extract(epoch from picker_epoch_bumped_at) * 1000
              from public.shows where id = p_show_id), 0)
  ), 'FM999999999999999')
  -- R17-F2: append picker_epoch counter (monotonic, increments by 1
  -- per reset/rotate). Two bumps within the same millisecond still
  -- produce distinct tokens because the counter advances.
  || '-' || coalesce((select picker_epoch::text from public.shows where id = p_show_id), '0');
$$;
```

Regression test in A6: spawn two reset_picker_epoch_atomic calls back-to-back; assert viewer_version_token returns a DIFFERENT value after each one, even if their picker_epoch_bumped_at timestamps fall within the same millisecond.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260523000006_viewer_version_token_rewrite.sql tests/db/viewer_version_token.test.ts
git commit -m "feat(db): rewrite viewer_version_token (picker_epoch term; A6)"
```

---

### Task A6.5: `lib/email/hashForLog.ts` — deterministic email hash for admin_alerts/logs (R41 P-R10 Fix-3)

**Files:**
- Create: `lib/email/hashForLog.ts`
- Test: `tests/email/hashForLog.test.ts`

**Purpose (P-R10 Fix-3; P-R26 scope-correction):** the THREE email-bearing R41 admin_alerts producers (`OAUTH_IDENTITY_CLAIMED.user_email_hash`, `PICKER_BOOTSTRAP_RPC_FAILED.attempted_email_hash`, `PICKER_EPOCH_RESET.admin_email_hash`) AND every R41 structured-log line referencing a user email MUST store/log a deterministic HASH of the canonical email, NOT the raw email. The other THREE R41 producers (PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED, CALLBACK_CLAIM_THREW, PICKER_SELECTION_RACE) are structurally email-less per the P-R26 email-posture matrix (§8.4); H7 grep-asserts each email field's ABSENCE there. The repo's email-canonicalization audit (`lib/audit/emailCanonicalization.ts`) + AGENTS.md PII discipline + the spec §8.4 catalog contract all require this. The `hashForLog` helper is the single source of truth; spec/plan references to `hashForLog(canonicalEmail)` resolve to this import.

**Contract:**

```ts
// lib/email/hashForLog.ts
import { createHash } from 'node:crypto';

/**
 * Deterministic email hash for admin_alerts.context and structured logs.
 *
 * Properties:
 * - DETERMINISTIC: same canonical email → same hash bytes across processes
 *   and time. Operators correlate hashes across alerts; this fails if the
 *   hash is salted or randomized.
 * - NOT REVERSIBLE: hex-encoded SHA-256 with a server-side pepper from
 *   `HASH_FOR_LOG_PEPPER` env var. Without the pepper, an attacker who
 *   exfiltrates admin_alerts cannot rainbow-table common emails back to
 *   plaintext; with the pepper, the hash is a stable identifier for
 *   operator triage.
 * - PRE-CANONICALIZED INPUT: this helper assumes `email` was already
 *   passed through `canonicalize()` per AGENTS.md invariant 3. It does
 *   NOT re-canonicalize; passing a raw uncanonicalized email yields a
 *   hash that won't match the canonical hash. Callers MUST canonicalize
 *   first.
 * - FAIL-LOUD on missing pepper: if `HASH_FOR_LOG_PEPPER` is unset or
 *   shorter than 32 chars, throws at module load (NOT lazily). The
 *   env-var probe runs once per process. Build-time gate ensures
 *   production deployment cannot ship with a missing pepper.
 * - RETURNS hex string with fixed length 64 (sha256). Suitable for direct
 *   JSONB insertion via the supabase client.
 */

const PEPPER = process.env.HASH_FOR_LOG_PEPPER ?? '';
if (PEPPER.length < 32) {
  throw new Error(
    'HASH_FOR_LOG_PEPPER env var must be set to a 32+ character value. ' +
    'This is required for R41 admin_alerts PII-hash contract. See ' +
    'lib/email/hashForLog.ts and AGENTS.md invariant 9 + spec §8.4.'
  );
}

export function hashForLog(canonicalEmail: string): string {
  return createHash('sha256').update(PEPPER).update(canonicalEmail).digest('hex');
}
```

**Tests** (`tests/email/hashForLog.test.ts`):
- (a) Determinism: `hashForLog('alice@example.com') === hashForLog('alice@example.com')` across two invocations.
- (b) Distinct inputs → distinct outputs: `hashForLog('alice@example.com') !== hashForLog('bob@example.com')`.
- (c) Length: every output is exactly 64 hex characters.
- (d) Module-load gate: with `HASH_FOR_LOG_PEPPER` unset, importing the module throws with the documented error message.
- (e) Module-load gate: with `HASH_FOR_LOG_PEPPER` set to a 31-char string, throws.
- (f) Pre-canonicalization expectation: `hashForLog('alice@example.com') !== hashForLog('Alice@Example.com')` — the helper does NOT normalize case; callers MUST canonicalize first. This pins the contract that the helper is downstream of `canonicalize()`.
- (g) **R41 P-R10 Fix-3 anchor**: importing `hashForLog` from `lib/email/hashForLog.ts` resolves (no phantom dependency); the spec §8.4 + plan B3/C6/C7 references to `hashForLog(canonicalEmail)` all import this exact path.

**R41 P-R11 Fix-2 — test + build provisioning (mandatory; without this the import-time gate breaks unrelated tests).**

The module-load gate at `lib/email/hashForLog.ts` throws if `HASH_FOR_LOG_PEPPER` is unset or shorter than 32 chars. C7 callback, C6 picker-bootstrap, AND B3 selectIdentity (the tamper-log path) all import `hashForLog`. Without env-var provisioning, importing any of those modules in a test or build with no pepper set causes import-time crashes — `vitest.config.ts` loads the empty `tests/setup.ts`, so test runs hit the throw immediately.

Provisioning steps (ALL part of this task; verified against the real repo paths):

1. **`tests/setup.ts` (replace the empty `export {};`)** — seed a deterministic 32+ char test pepper BEFORE any test module imports `lib/email/hashForLog.ts`. Use a fixed string so determinism tests pass across machines:

   ```ts
   // tests/setup.ts
   // R41 P-R11 Fix-2: seed HASH_FOR_LOG_PEPPER for tests that import
   // lib/email/hashForLog.ts. Module-load gate throws without this.
   // Fixed deterministic value — same hash bytes across machines.
   process.env.HASH_FOR_LOG_PEPPER ??=
     'fxav-r41-test-pepper-32-chars-min-deterministic';

   export {};
   ```

2. **`.env.local.example` (NOT `.env.example` — that path doesn't exist in this repo)** — append:

   ```dotenv
   # R41 P-R11: 32+ char random pepper for lib/email/hashForLog.ts email
   # hashing in admin_alerts.context + structured logs. REQUIRED at build
   # AND runtime — module-load gate throws if unset/short. Generate via
   # `openssl rand -hex 32` for production; tests use a fixed value
   # seeded by tests/setup.ts.
   HASH_FOR_LOG_PEPPER=
   ```

   Verify append correctness with `git diff .env.local.example` — the project's echo-append discipline (see AGENTS.md "echo >> discipline") means use `printf '\n%s\n'` not `echo "X" >>` if appending via shell. The plan-time canonical approach is to Edit the file directly.

3. **CI/build env provisioning** — Vercel deploy needs the env var. Add a note in the task commit message: "HASH_FOR_LOG_PEPPER must be set in Vercel project env vars before deploy; the module-load gate fails-loud at build time if missing." If the repo has a `scripts/env-check.ts` or `lib/audit/envVars.ts`-style env audit, register `HASH_FOR_LOG_PEPPER` there; grep the repo for `env-check`/`audit/env` to find the actual path before writing this step (do not invent a file).

4. **Module-load-gate tests must reset module cache** — vitest caches the module after the first import. To test the unset/short-pepper throw path, the test MUST call `vi.resetModules()` BEFORE deleting `process.env.HASH_FOR_LOG_PEPPER` and re-importing. Example:

   ```ts
   import { describe, it, expect, vi, beforeEach } from 'vitest';

   describe('hashForLog module-load gate', () => {
     beforeEach(() => { vi.resetModules(); });
     it('throws when HASH_FOR_LOG_PEPPER is unset', async () => {
       const prior = process.env.HASH_FOR_LOG_PEPPER;
       delete process.env.HASH_FOR_LOG_PEPPER;
       await expect(import('@/lib/email/hashForLog')).rejects.toThrow(/HASH_FOR_LOG_PEPPER/);
       process.env.HASH_FOR_LOG_PEPPER = prior;
     });
     it('throws when HASH_FOR_LOG_PEPPER is <32 chars', async () => {
       const prior = process.env.HASH_FOR_LOG_PEPPER;
       process.env.HASH_FOR_LOG_PEPPER = 'short';
       await expect(import('@/lib/email/hashForLog')).rejects.toThrow(/32/);
       process.env.HASH_FOR_LOG_PEPPER = prior;
     });
     // Determinism + length tests can use a top-level static import
     // because tests/setup.ts seeded the pepper before vitest started.
   });
   ```

```bash
git add lib/email/hashForLog.ts tests/email/hashForLog.test.ts tests/setup.ts .env.local.example
git commit -m "feat(email): hashForLog helper for R41 admin_alerts PII hashing (A6.5)"
```

---

### Task A7: Add `crew_members.claimed_via_oauth_at` column (R41 OAuth identity claim)

**Files:**
- Create: `supabase/migrations/20260524000001_crew_members_claimed_via_oauth_at.sql`
- Test: `tests/db/crew_members_claimed_via_oauth_at.test.ts`

Per R41 Resolved Decision 15 + §5.1: `claimed_via_oauth_at TIMESTAMPTZ NULL` column on `public.crew_members`. Non-null means the user with that crew row's email has signed in via Google OAuth and the identity is claimed (permanently per R41 owner determination). Backfill: existing rows are naturally NULL.

```sql
alter table public.crew_members
  add column claimed_via_oauth_at timestamptz null;

comment on column public.crew_members.claimed_via_oauth_at is
  'R41: stamped by claim_oauth_identity SECURITY DEFINER RPC on successful OAuth callback whose auth.users.email matches this row. Non-null = identity claimed; picker renders row as deactivated (§7.2). Permanent claim per Decision 15.';
```

Tests: (a) column exists; (b) NULL by default; (c) accepts TIMESTAMPTZ values; (d) the existing `crew_members_email_canonical` partial UNIQUE index at `20260501000000_initial_public_schema.sql:49-51` is untouched (R41-R35 verified: this constraint stays in place; ambiguous-email defenses are dead code BECAUSE this constraint exists).

```bash
git commit -m "feat(db): add crew_members.claimed_via_oauth_at column (A7)"
```

### Task A8: `claim_oauth_identity` SECURITY DEFINER RPC (R41 §5.3)

**Files:**
- Create: `supabase/migrations/20260524000002_claim_oauth_identity.sql`
- Test: `tests/db/claim_oauth_identity.test.ts`

Called from `/auth/callback` (DB-stamp only per R41-R6) AND from `/api/auth/picker-bootstrap` (lazy-mint retry per R41-R12). Per-show advisory locks per AGENTS.md invariant 2; clock_timestamp() AFTER all locks per R41-R23; mint_safe_t_millis return per R41-R22; UPDATE restricted to materialized locked-set per R41-R3; ambiguous-email handling REMOVED per R41-R35; canonical email at caller boundary per R41-R16 (RPC assumes input is already canonicalized).

```sql
create or replace function public.claim_oauth_identity(p_email text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_email text := p_email;  -- R41-R16: caller canonicalizes; no inline lower(trim())
  v_locked_show_ids uuid[];
  v_claimed_count integer := 0;
  v_shows jsonb;
  v_claim_at timestamptz;  -- R41-R23: clock_timestamp() AFTER locks
  v_claimed_rows jsonb := '[]'::jsonb;  -- R41 P-R8 Fix-3: per-row claim details
  r record;
begin
  -- R41-R3 + R41-R23: materialize the locked show ids BEFORE acquiring locks;
  -- ordered by drive_file_id to prevent cross-transaction deadlock.
  with show_set as (
    select distinct s.id as show_id, s.drive_file_id
      from public.crew_members cm
      join public.shows s on s.id = cm.show_id
     where cm.email = v_email
     order by s.drive_file_id
  )
  select array_agg(show_id) into v_locked_show_ids from show_set;

  if v_locked_show_ids is null or array_length(v_locked_show_ids, 1) is null then
    return jsonb_build_object('claimed_count', 0,
                              'claimed_rows', '[]'::jsonb,  -- P-R8 Fix-3
                              'shows', '[]'::jsonb,
                              'mint_safe_t_millis',
                                floor(extract(epoch from clock_timestamp()) * 1000)::bigint + 1);
  end if;

  -- Acquire all locks in deterministic order (R41-R10 explicit loop, NOT
  -- set-based PERFORM which doesn't guarantee execution order).
  for r in
    select s.drive_file_id
      from public.shows s
     where s.id = any(v_locked_show_ids)
     order by s.drive_file_id
  loop
    perform pg_advisory_xact_lock(hashtext('show:' || r.drive_file_id));
  end loop;

  -- R41-R23: clock_timestamp() AFTER all locks acquired. now() returns
  -- transaction-start time and would predate lock acquisition under
  -- contention, allowing impersonation (see spec §6.0).
  v_claim_at := clock_timestamp();

  -- R41 P-R8 Fix-3 (Finding 3): capture per-row claim details so the C7
  -- callback can emit OAUTH_IDENTITY_CLAIMED per show with the contract
  -- context shape H7 mandates: { crew_member_id, show_id, claimed_at_millis }.
  -- The previous aggregate-only return shape ({ claimed_count }) made it
  -- impossible for operators to tell which show/crew rows were claimed
  -- AND made it impossible for the producer to satisfy the H7 context
  -- contract.
  with updated as (
    update public.crew_members cm
       set claimed_via_oauth_at = v_claim_at
     where cm.email = v_email
       and cm.show_id = any(v_locked_show_ids)
       and cm.claimed_via_oauth_at is null
   returning cm.id as crew_member_id, cm.show_id
  )
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
           'crew_member_id', crew_member_id,
           'show_id', show_id,
           -- R41-R30: floor(...)::bigint avoids banker's-rounding; matches
           -- the cookie.t and mint_safe_t_millis derivation.
           'claimed_at_millis', floor(extract(epoch from v_claim_at) * 1000)::bigint
         )), '[]'::jsonb)
    into v_claimed_count, v_claimed_rows
    from updated;

  -- R41-R35: build shows result directly (no GROUP BY HAVING; ambiguous-
  -- email defense removed because the partial UNIQUE index on (show_id,
  -- email) makes duplicates impossible).
  select coalesce(jsonb_agg(jsonb_build_object(
           'show_id', s.id,
           'crew_member_id', cm.id,
           'picker_epoch', s.picker_epoch
         )), '[]'::jsonb)
    into v_shows
    from public.crew_members cm
    join public.shows s on s.id = cm.show_id
   where cm.email = v_email
     and cm.show_id = any(v_locked_show_ids)
     and s.published = true
     and s.archived = false;

  return jsonb_build_object(
    'claimed_count', v_claimed_count,
    -- R41 P-R8 Fix-3: per-row claim details for OAUTH_IDENTITY_CLAIMED
    -- producer (H7 context contract). Empty array when claimed_count = 0
    -- (idempotent re-invocation; no spam).
    'claimed_rows', v_claimed_rows,
    'shows', v_shows,
    -- R41-R22 + R41-R30: mint_safe_t_millis strictly greater than any
    -- claim_epoch_millis; uses clock_timestamp() (R41-R23) and floor()
    -- (R41-R30 avoids banker's rounding).
    'mint_safe_t_millis',
      greatest(
        floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        coalesce(
          (select floor(extract(epoch from max(claimed_via_oauth_at)) * 1000)::bigint
             from public.crew_members
            where email = v_email and claimed_via_oauth_at is not null),
          0
        )
      ) + 1
  );
end;
$$;

revoke all on function public.claim_oauth_identity(text) from public;
grant execute on function public.claim_oauth_identity(text) to service_role;
```

Tests (per spec §10.2): (a) basic happy path; (b) idempotent re-invocation (claimed_count = 0 AND claimed_rows = [] for already-claimed rows); (c) R41-R3 locked-set integrity (concurrent INSERT on unlocked show NOT stamped); (d) R41-R10 lock ordering (two concurrent claims on overlapping show sets do NOT deadlock under repeated invocations); (e) R41-R23 lock-contention (Mallory's select_identity_atomic vs Alice's claim_oauth_identity — clock_timestamp() ordering correct; bypass cookie invalidated by resolver); (f) R41-R22 same-millisecond ties → resolver `<=` invalidation catches; (g) R41-R30 floor() vs banker's-rounding regression with fractional millisecond `claimed_via_oauth_at` values; (h) **R41 P-R8 Fix-3 per-row return contract**: seed Alice with crew_member rows in shows S1, S2, S3 (S2 already claimed). Assert `claimed_count = 2` AND `claimed_rows` is a 2-element array, each row matching shape `{ crew_member_id: uuid, show_id: uuid, claimed_at_millis: bigint }`, with show_ids ∈ {S1, S3}, NOT containing S2, AND every `claimed_at_millis` equals `floor(extract(epoch from v_claim_at) * 1000)::bigint` (same value across rows since v_claim_at is captured once); (i) **R41 P-R8 Fix-3 empty-set return**: when Alice has no matching crew_members, return shape includes `claimed_rows: []` (not absent, not null).

```bash
git commit -m "feat(db): add claim_oauth_identity SECURITY DEFINER RPC (A8)"
```

### Task A9: `my_share_tokens_for_email` SECURITY DEFINER RPC (R41 §5.3)

**Files:**
- Create: `supabase/migrations/20260524000003_my_share_tokens_for_email.sql`
- Test: `tests/db/my_share_tokens_for_email.test.ts`

Reads `public.auth_email_canonical()` internally (R41-R19; supabase/migrations/20260501002000_rls_policies.sql:11). Returns `(slug, share_token)` pairs for shows on the user's canonical email. Callers cannot pass an email — the function uses only auth_email_canonical, enforcing self-scope.

```sql
create or replace function public.my_share_tokens_for_email()
  returns table(slug text, share_token text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select s.slug, sst.share_token
    from public.crew_members cm
    join public.shows s on s.id = cm.show_id
    join public.show_share_tokens sst on sst.show_id = s.id
   where cm.email = public.auth_email_canonical()  -- R41-R19: canonical NOT raw
     and s.published = true
     and s.archived = false
   order by s.slug;
$$;

revoke all on function public.my_share_tokens_for_email() from public;
grant execute on function public.my_share_tokens_for_email() to authenticated;
```

Tests: (a) unauthenticated caller gets empty set; (b) mixed-case Google account `Alice@Example.Com` returns rows for canonical-stored `alice@example.com`; (c) cross-user enumeration negative test (signed in as user X, function returns X's rows only); (d) only published+not-archived shows; (e) only the canonical email is used (R41-R19 invariant — no `auth.email()` raw direct usage).

```bash
git commit -m "feat(db): add my_share_tokens_for_email RPC (A9; canonical-email pin)"
```

## Phase B: Auth helpers (lib/auth/picker/*)

### Task B1: Picker cookie envelope (HMAC-signed, R36)

**Files:**
- Create: `lib/auth/picker/cookieEnvelope.ts`
- Create: `lib/env/pickerCookieSigningKey.ts` (env-var loader with fail-on-boot semantics)
- Test: `tests/auth/picker/cookieEnvelope.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { encodePickerCookie, decodePickerCookie, MAX_COOKIE_VALUE_BYTES } from '@/lib/auth/picker/cookieEnvelope';

const TEST_KEY = '0'.repeat(64); // 32 bytes hex
const SHOW_A = '11111111-1111-1111-1111-111111111111';
const CREW_A = '22222222-2222-2222-2222-222222222222';

describe('cookieEnvelope', () => {
  it('round-trips a single entry through HMAC sign + verify', () => {
    const env = { v: 1 as const, selections: { [SHOW_A]: { id: CREW_A, e: 1, t: 1_000_000 } } };
    const encoded = encodePickerCookie(env, TEST_KEY);
    const decoded = decodePickerCookie(encoded, TEST_KEY);
    expect(decoded).toEqual(env);
  });

  it('returns null on signature mismatch (forged cookie)', () => {
    const env = { v: 1 as const, selections: { [SHOW_A]: { id: CREW_A, e: 1, t: 0 } } };
    const encoded = encodePickerCookie(env, TEST_KEY);
    // Flip a byte in the payload section.
    const tampered = encoded.replace(/^./, 'Z');
    expect(decodePickerCookie(tampered, TEST_KEY)).toBeNull();
  });

  it('returns null on non-UUID show_id key (R26)', () => {
    const raw = `{"v":1,"selections":{"not-a-uuid":{"id":"${CREW_A}","e":1,"t":0}}}`;
    const enc = encodeURIComponent(raw);
    // Sign the malformed payload to isolate the UUID-validation gate from HMAC gate.
    const signed = signTestEnvelope(raw, TEST_KEY);
    expect(decodePickerCookie(signed, TEST_KEY)).toBeNull();
  });

  it('returns null on non-UUID crew id', () => {
    const raw = `{"v":1,"selections":{"${SHOW_A}":{"id":"not-uuid","e":1,"t":0}}}`;
    const signed = signTestEnvelope(raw, TEST_KEY);
    expect(decodePickerCookie(signed, TEST_KEY)).toBeNull();
  });

  it('returns null on negative e', () => {
    const raw = `{"v":1,"selections":{"${SHOW_A}":{"id":"${CREW_A}","e":-1,"t":0}}}`;
    const signed = signTestEnvelope(raw, TEST_KEY);
    expect(decodePickerCookie(signed, TEST_KEY)).toBeNull();
  });

  it('returns null on wrong v', () => {
    const raw = `{"v":2,"selections":{}}`;
    const signed = signTestEnvelope(raw, TEST_KEY);
    expect(decodePickerCookie(signed, TEST_KEY)).toBeNull();
  });

  it('MAX_COOKIE_VALUE_BYTES === 3800', () => {
    expect(MAX_COOKIE_VALUE_BYTES).toBe(3800);
  });

  it('LRU-evicts the lowest-t entry when over budget', () => {
    const selections: Record<string, { id: string; e: number; t: number }> = {};
    for (let i = 0; i < 40; i++) {
      const showId = `${i.toString(16).padStart(8, '0')}-1111-1111-1111-111111111111`;
      selections[showId] = { id: CREW_A, e: 1, t: 1_000_000 + i };
    }
    const env = { v: 1 as const, selections };
    const encoded = encodePickerCookie(env, TEST_KEY);
    expect(`__Host-fxav_picker=${encoded}`.length).toBeLessThanOrEqual(MAX_COOKIE_VALUE_BYTES);
    // The lowest-t entry (i=0) was evicted.
    const decoded = decodePickerCookie(encoded, TEST_KEY);
    const evictedKey = `00000000-1111-1111-1111-111111111111`;
    expect(decoded?.selections[evictedKey]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL with "Cannot find module '@/lib/auth/picker/cookieEnvelope'".

- [ ] **Step 3: Implement the module**

```ts
// lib/auth/picker/cookieEnvelope.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export const MAX_COOKIE_VALUE_BYTES = 3800;
export const COOKIE_NAME = '__Host-fxav_picker';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// R41 P-R15 Fix-1 (CRITICAL): cookie.t is Unix MILLISECONDS per §6.0
// Timestamp Defense Contract (R41-R18/R22/R23/R30). Current ms timestamps are
// ~1.7e12; the pre-R41 cap of 2_000_000_000 (unix-seconds) would reject every
// legitimate millisecond timestamp the bootstrap/select_identity_atomic mints,
// making the cookie undecodable and forcing the user back through the picker
// indefinitely. Cap at MAX_SAFE_INTEGER — every millisecond timestamp Number
// can represent decodes successfully; the precision boundary (year ~287396)
// is far beyond any realistic deployment lifetime. The lower-bound check
// (`< 0`) is unchanged; the upper bound is now `> Number.MAX_SAFE_INTEGER`.
//
// **R41-R30 / R41 P-R15 Fix-1 contract**: the helper validates that `t` is
// a finite non-negative safe-integer millisecond value. Bigint-precision
// claim_epoch_millis values from the DB are read via the supabase client as
// JS numbers (PostgreSQL bigint → JS number is safe up to 2^53-1 — far
// beyond year 2033); the cookie.t field is the same JS-number millisecond
// shape so equality / `>` / `<=` comparisons are exact.
const MAX_SAFE_T_MILLIS = Number.MAX_SAFE_INTEGER;

export type PickerEntry = { id: string; e: number; t: number };
export type PickerEnvelope = { v: 1; selections: Record<string, PickerEntry> };

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad), 'base64');
}

function hmac(payload: string, key: string): string {
  return base64url(createHmac('sha256', Buffer.from(key, 'hex')).update(payload).digest());
}

function isValidEntry(e: unknown): e is PickerEntry {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !UUID_RE.test(obj.id)) return false;
  if (!Number.isInteger(obj.e) || (obj.e as number) < 0) return false;
  if (!Number.isInteger(obj.t) || (obj.t as number) < 0 || (obj.t as number) > MAX_SAFE_T_MILLIS) return false;
  return true;
}

function isValidEnvelope(env: unknown): env is PickerEnvelope {
  if (typeof env !== 'object' || env === null) return false;
  const obj = env as Record<string, unknown>;
  if (obj.v !== 1) return false;
  if (typeof obj.selections !== 'object' || obj.selections === null) return false;
  for (const [k, v] of Object.entries(obj.selections as Record<string, unknown>)) {
    if (!UUID_RE.test(k)) return false;
    if (!isValidEntry(v)) return false;
  }
  return true;
}

export function encodePickerCookie(env: PickerEnvelope, signingKey: string): string {
  // LRU eviction loop
  let payload = JSON.stringify(env);
  while (`${COOKIE_NAME}=${base64url(Buffer.from(payload))}.${hmac(payload, signingKey)}`.length > MAX_COOKIE_VALUE_BYTES) {
    const entries = Object.entries(env.selections).sort(([, a], [, b]) => a.t - b.t);
    if (entries.length === 0) break;
    const [evictKey] = entries[0];
    delete env.selections[evictKey];
    payload = JSON.stringify(env);
  }
  return `${base64url(Buffer.from(payload))}.${hmac(payload, signingKey)}`;
}

export function decodePickerCookie(raw: string | undefined, signingKey: string): PickerEnvelope | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  let payload: string;
  try {
    payload = fromBase64url(parts[0]).toString('utf8');
  } catch {
    return null;
  }
  const expectedSig = hmac(payload, signingKey);
  const provided = parts[1];
  if (expectedSig.length !== provided.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(provided))) return null;
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!isValidEnvelope(parsed)) return null;
  return parsed;
}
```

```ts
// lib/env/pickerCookieSigningKey.ts
const KEY_RE = /^[0-9a-f]{64}$/;

let cached: string | null = null;

export function pickerCookieSigningKey(): string {
  if (cached) return cached;
  const raw = process.env.PICKER_COOKIE_SIGNING_KEY;
  if (!raw) {
    throw new Error('PICKER_COOKIE_SIGNING_KEY is unset; server cannot mint picker cookies');
  }
  if (!KEY_RE.test(raw)) {
    throw new Error('PICKER_COOKIE_SIGNING_KEY must be 64 hex chars (32 bytes)');
  }
  cached = raw;
  return raw;
}
```

```ts
// tests/auth/picker/cookieEnvelope.test.ts helper
function signTestEnvelope(payload: string, key: string): string {
  const h = require('node:crypto').createHmac('sha256', Buffer.from(key, 'hex')).update(payload).digest();
  const b64 = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64(Buffer.from(payload))}.${b64(h)}`;
}
```

**R41 P-R15 Fix-1 (CRITICAL) regression tests** — pin the millisecond-cap fix:

```ts
import { describe, it, expect } from 'vitest';
import { encodePickerCookie, decodePickerCookie } from '@/lib/auth/picker/cookieEnvelope';

describe('decodePickerCookie millisecond-timestamp acceptance (P-R15 Fix-1)', () => {
  // The pre-R41 cap of 2_000_000_000 (unix-seconds, year 2033) would reject
  // every legitimate Unix-ms cookie.t. Without this fix, every freshly-minted
  // picker cookie from select_identity_atomic or picker-bootstrap decodes as
  // null and users loop back through the picker. The test pins the contract.
  const key = 'a'.repeat(64);

  it('decodes a realistic 2026-era Unix-ms timestamp (1737028800123)', () => {
    const env = { v: 1 as const, selections: { '11111111-1111-1111-1111-111111111111':
      { id: '11111111-2222-3333-4444-555555555555', e: 1, t: 1737028800123 } } };
    const encoded = encodePickerCookie(env, key);
    const decoded = decodePickerCookie(encoded, key);
    expect(decoded).not.toBeNull();
    expect(decoded?.selections['11111111-1111-1111-1111-111111111111']?.t).toBe(1737028800123);
  });

  it('decodes Number.MAX_SAFE_INTEGER as the upper bound', () => {
    const env = { v: 1 as const, selections: { '11111111-1111-1111-1111-111111111111':
      { id: '11111111-2222-3333-4444-555555555555', e: 1, t: Number.MAX_SAFE_INTEGER } } };
    const encoded = encodePickerCookie(env, key);
    const decoded = decodePickerCookie(encoded, key);
    expect(decoded).not.toBeNull();
  });

  it('REJECTS t > MAX_SAFE_INTEGER (overflow guard)', () => {
    // Hand-craft an envelope with t = MAX_SAFE_INTEGER + 1 to ensure the
    // cap still catches overflow attempts. JSON.parse round-trips this as
    // a number; the integer-ness check + cap should reject.
    const payload = JSON.stringify({ v: 1, selections: {
      '11111111-1111-1111-1111-111111111111': {
        id: '11111111-2222-3333-4444-555555555555', e: 1,
        t: Number.MAX_SAFE_INTEGER + 1,
      }
    }});
    const encoded = signTestEnvelope(payload, key);
    expect(decodePickerCookie(encoded, key)).toBeNull();
  });

  it('REJECTS negative t', () => {
    const payload = JSON.stringify({ v: 1, selections: {
      '11111111-1111-1111-1111-111111111111': {
        id: '11111111-2222-3333-4444-555555555555', e: 1, t: -1,
      }
    }});
    const encoded = signTestEnvelope(payload, key);
    expect(decodePickerCookie(encoded, key)).toBeNull();
  });

  it('REJECTS fractional t (non-integer)', () => {
    const payload = JSON.stringify({ v: 1, selections: {
      '11111111-1111-1111-1111-111111111111': {
        id: '11111111-2222-3333-4444-555555555555', e: 1, t: 1737028800123.5,
      }
    }});
    const encoded = signTestEnvelope(payload, key);
    expect(decodePickerCookie(encoded, key)).toBeNull();
  });
});
```

The exact-value assertion (`t === 1737028800123`) is the CRITICAL contract — pre-fix, the same envelope decoded as null. If a future refactor reintroduces a unix-seconds cap, this test fails immediately.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/auth/picker/cookieEnvelope.test.ts`
Expected: PASS (all eight original tests + the five P-R15 Fix-1 millisecond regression tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/picker/cookieEnvelope.ts lib/env/pickerCookieSigningKey.ts tests/auth/picker/cookieEnvelope.test.ts
git commit -m "feat(auth): HMAC-signed picker cookie envelope (B1)"
```

---

### Task B2: `resolvePickerSelection` resolver (7-arm discriminated union)

**R16-F1 race posture (explicit accept; documented in §10 tests):** `resolvePickerSelection` reads `shows.picker_epoch` and `crew_members` in separate non-locked queries. A concurrent `rotate_show_share_token` / `reset_picker_epoch_atomic` (under the advisory lock) could commit BETWEEN the resolver's two reads, allowing a stale cookie to authorize ONE more request after rotation/reset commits. The race window is bounded:
- After the rotate/reset commits, the NEXT picker-cookie-bearing request acquires the post-commit `picker_epoch`; cookie's `e` mismatches; resolver returns `epoch_stale` → 401.
- The realtime broadcast fires on rotate/reset commit; open tabs receive it and `router.refresh()` triggers a fresh resolve that observes the new epoch.

**Why not atomic-RPC for resolution**: the resolver runs on EVERY authenticated request (page renders, asset fetches, version probes, subscriber-token mints). Wrapping each in `pg_advisory_xact_lock` would serialize all reads through the per-show lock, destroying read concurrency. The race window is brief (~one request), the consequence is one additional asset/page response after rotation, and the realtime broadcast force-refreshes open tabs immediately. The pivot's threat model accepts this trade-off.

Regression test in §10: spawn concurrent `rotate_show_share_token` and a resolver call with the OLD cookie. Assert (a) at most one resolver call wins post-rotation; (b) the subsequent resolver call returns `epoch_stale`. Documents the bounded race rather than eliminating it.

**Files:**
- Create: `lib/auth/picker/resolvePickerSelection.ts`
- Test: `tests/auth/picker/resolvePickerSelection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resolvePickerSelection } from '@/lib/auth/picker/resolvePickerSelection';
import { encodePickerCookie } from '@/lib/auth/picker/cookieEnvelope';

const TEST_KEY = '0'.repeat(64);
process.env.PICKER_COOKIE_SIGNING_KEY = TEST_KEY;

describe('resolvePickerSelection', () => {
  let showId: string, crewId: string, slug: string, token: string;

  beforeEach(async () => {
    // Insert show + crew + read token via test helper.
    ({ showId, crewId, slug, token } = await createTestShowWithCrew());
  });

  it("kind: 'no_selection' when no cookie", async () => {
    const result = await resolvePickerSelection({ showId, cookie: undefined });
    expect(result.kind).toBe('no_selection');
  });

  it("kind: 'no_selection' on decode failure", async () => {
    const result = await resolvePickerSelection({ showId, cookie: 'not.a.valid.cookie' });
    expect(result.kind).toBe('no_selection');
  });

  it("kind: 'no_selection' when cookie has no entry for showId", async () => {
    const cookie = encodePickerCookie(
      { v: 1, selections: { 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa': { id: crewId, e: 1, t: 0 } } },
      TEST_KEY,
    );
    const result = await resolvePickerSelection({ showId, cookie });
    expect(result.kind).toBe('no_selection');
  });

  it("kind: 'show_unavailable' when show is archived", async () => {
    await archiveShow(showId);
    const cookie = encodePickerCookie(
      { v: 1, selections: { [showId]: { id: crewId, e: 1, t: 0 } } },
      TEST_KEY,
    );
    const result = await resolvePickerSelection({ showId, cookie });
    expect(result.kind).toBe('show_unavailable');
  });

  it("kind: 'show_unavailable' when show is unpublished", async () => {
    await unpublishShow(showId);
    const cookie = encodePickerCookie(
      { v: 1, selections: { [showId]: { id: crewId, e: 1, t: 0 } } },
      TEST_KEY,
    );
    const result = await resolvePickerSelection({ showId, cookie });
    expect(result.kind).toBe('show_unavailable');
  });

  it("kind: 'epoch_stale' when cookie's e is behind", async () => {
    const cookie = encodePickerCookie(
      { v: 1, selections: { [showId]: { id: crewId, e: 1, t: 0 } } },
      TEST_KEY,
    );
    await bumpPickerEpoch(showId); // shows.picker_epoch -> 2
    const result = await resolvePickerSelection({ showId, cookie });
    expect(result.kind).toBe('epoch_stale');
    if (result.kind === 'epoch_stale') {
      expect(result.expectedEpoch).toBe(1);
      expect(result.expectedCrewMemberId).toBe(crewId);
    }
  });

  it("kind: 'removed_from_roster' when crew was deleted", async () => {
    const cookie = encodePickerCookie(
      { v: 1, selections: { [showId]: { id: crewId, e: 1, t: 0 } } },
      TEST_KEY,
    );
    await deleteCrewMember(crewId);
    const result = await resolvePickerSelection({ showId, cookie });
    expect(result.kind).toBe('removed_from_roster');
  });

  it("kind: 'resolved' on happy path", async () => {
    const cookie = encodePickerCookie(
      { v: 1, selections: { [showId]: { id: crewId, e: 1, t: 0 } } },
      TEST_KEY,
    );
    const result = await resolvePickerSelection({ showId, cookie });
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') expect(result.crewMemberId).toBe(crewId);
  });

  it("kind: 'infra_error' when DB lookup fails", async () => {
    // Mock the supabase client to throw.
    const result = await resolvePickerSelectionWithMock({ throwOnQuery: 'shows' });
    expect(result.kind).toBe('infra_error');
    if (result.kind === 'infra_error') expect(result.code).toBe('PICKER_RESOLVER_LOOKUP_FAILED');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the resolver**

```ts
// lib/auth/picker/resolvePickerSelection.ts
import { decodePickerCookie } from '@/lib/auth/picker/cookieEnvelope';
import { pickerCookieSigningKey } from '@/lib/env/pickerCookieSigningKey';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export type ResolvePickerSelectionResult =
  | { kind: 'resolved'; crewMemberId: string }
  | { kind: 'no_selection' }
  | { kind: 'epoch_stale'; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: 'removed_from_roster'; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: 'identity_invalidated';  // R41-R8 added; R41-R35 single-reason; P-R29 Fix-1 added 'session_mismatch'
      expectedEpoch: number;
      expectedCrewMemberId: string;
      reason: 'claimed_after_pick' | 'session_mismatch' }
  | { kind: 'show_unavailable' }
  | { kind: 'infra_error'; code: 'PICKER_RESOLVER_LOOKUP_FAILED' };

// R41-R8/R22/R30: the resolver fires `identity_invalidated` when the
// cookie's crew_member is now OAuth-claimed AND the cookie predates
// the claim. Comparison: cookie.t <= floor(extract(epoch from
// claimed_via_oauth_at) * 1000)::bigint per spec §6.0 / §6.1 step 9.
// Fail-closed on millisecond ties (<= not <); the claim_oauth_identity
// RPC returns mint_safe_t_millis = claim_epoch + 1 for legitimate
// post-claim cookies to strictly exceed the boundary.

export async function resolvePickerSelection({
  showId,
  cookie,
}: {
  showId: string;
  cookie: string | undefined;
}): Promise<ResolvePickerSelectionResult> {
  // R8-F1: pickerCookieSigningKey() throws on unset/malformed env.
  // R11-F2: createSupabaseServiceRoleClient() also throws on missing
  // env. BOTH must be caught here so a misconfigured deploy returns
  // the typed infra_error contract instead of a framework 500.
  let key: string;
  try {
    key = pickerCookieSigningKey();
  } catch {
    return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
  const env = decodePickerCookie(cookie, key);
  if (!env) return { kind: 'no_selection' };
  const entry = env.selections[showId];
  if (!entry) return { kind: 'no_selection' };

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch {
    return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
  let showRow: { picker_epoch: number; published: boolean; archived: boolean } | null = null;
  try {
    const { data, error } = await supabase
      .from('shows')
      .select('picker_epoch, published, archived')
      .eq('id', showId)
      .maybeSingle();
    if (error) return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
    showRow = data;
  } catch {
    return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
  if (!showRow) return { kind: 'no_selection' };
  if (showRow.archived || !showRow.published) return { kind: 'show_unavailable' };
  if (entry.e !== showRow.picker_epoch) {
    return { kind: 'epoch_stale', expectedEpoch: entry.e, expectedCrewMemberId: entry.id };
  }
  // R41-R8/R22/R30: select claimed_via_oauth_at for the
  // identity_invalidated comparison. floor() per R41-R30 (avoids
  // banker's rounding); cookie.t <= claim_epoch_millis invalidates
  // (R41-R22 fail-closed-on-ties).
  let crewRow: { id: string; claimed_via_oauth_at: string | null } | null = null;
  try {
    const { data, error } = await supabase
      .from('crew_members')
      .select('id, claimed_via_oauth_at')
      .eq('id', entry.id)
      .eq('show_id', showId)
      .maybeSingle();
    if (error) return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
    crewRow = data;
  } catch {
    return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
  if (!crewRow) {
    return { kind: 'removed_from_roster', expectedEpoch: entry.e, expectedCrewMemberId: entry.id };
  }
  // R41-R8/R22/R30 identity_invalidated check: if the crew row is now
  // OAuth-claimed AND the cookie predates the claim (cookie.t <=
  // floor(extract(epoch from claimed_via_oauth_at) * 1000)::bigint),
  // reject as claimed_after_pick. Legitimate post-claim cookies (minted
  // via /api/auth/picker-bootstrap with t = mint_safe_t_millis = claim
  // + 1) satisfy cookie.t > claim_epoch_millis and continue resolving.
  if (crewRow.claimed_via_oauth_at !== null) {
    const claimEpochMillis = Math.floor(new Date(crewRow.claimed_via_oauth_at).getTime());
    // Note: getTime() returns UTC milliseconds; PostgreSQL TIMESTAMPTZ
    // round-trips correctly through JSON via PostgREST. floor() is
    // belt-and-suspenders against fractional-millisecond JSON encoding
    // (R41-R30 paranoia; PostgreSQL stores microsecond precision).
    if (entry.t <= claimEpochMillis) {
      return {
        kind: 'identity_invalidated',
        expectedEpoch: entry.e,
        expectedCrewMemberId: entry.id,
        reason: 'claimed_after_pick',
      };
    }
  }
  return { kind: 'resolved', crewMemberId: entry.id };
}
```

- [ ] **Step 4: Run tests + commit**

```bash
pnpm vitest run tests/auth/picker/resolvePickerSelection.test.ts
git add lib/auth/picker/resolvePickerSelection.ts tests/auth/picker/resolvePickerSelection.test.ts
git commit -m "feat(auth): resolvePickerSelection 7-arm resolver (B2)"
```

---

### Task B3-pre: New SECURITY DEFINER RPC `select_identity_atomic` (R3-F1)

**Files:**
- Create: `supabase/migrations/20260523000007_select_identity_atomic.sql`
- Test: `tests/db/select_identity_atomic.test.ts`

**Rationale (R3-F1 race):** A multi-step selectIdentity (resolve token → roster check → epoch read → cookie write) has a race window where `rotate_show_share_token` can commit between the token resolve and the epoch read, allowing the old URL to mint a cookie at the new epoch. The fix is a single SECURITY DEFINER RPC that performs ALL the DB work under the per-show advisory lock — the same lock that rotation holds — so the two operations serialize.

```sql
-- supabase/migrations/20260523000007_select_identity_atomic.sql
-- R9-F2: output parameters renamed (out_show_id / out_picker_epoch /
-- out_rejection_code) so they cannot ambiguously match against
-- column names like `show_id` referenced in queries. Every
-- table-column read inside the function is also qualified with an
-- alias (e.g., s.id, t.share_token, cm.show_id).
create or replace function public.select_identity_atomic(
  p_slug text,
  p_share_token text,
  p_crew_member_id uuid
)
  returns table (
    out_show_id uuid,
    out_picker_epoch int,
    out_observed_at_millis bigint,  -- R41-R18/R22/R23 DB-side timestamp
    out_rejection_code text
  )
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_show_id uuid;
  v_drive_file_id text;
  v_published boolean;
  v_archived boolean;
  v_crew_show uuid;
  v_claimed_via_oauth_at timestamptz;  -- R41-R8 + R41-R35
begin
  -- Step 1: resolve the (slug, token) pair into show_id + drive_file_id
  -- for the lock key. Availability is NOT trusted from this read; it's
  -- re-read under the lock in step 4 (R4-F1).
  select s.id, s.drive_file_id
    into v_show_id, v_drive_file_id
    from public.shows s
    join public.show_share_tokens t on t.show_id = s.id
   where s.slug = p_slug
     and t.share_token = p_share_token
   limit 1;
  if v_show_id is null then
    out_show_id := null; out_picker_epoch := null; out_rejection_code := 'PICKER_INVALID_SHARE_TOKEN';
    return next; return;
  end if;

  -- Step 2: acquire the per-show lock. After this, rotate_show_share_token
  -- and reset_picker_epoch_atomic for this show are blocked until we COMMIT.
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  -- Step 3: re-verify the (slug, token) pair UNDER the lock. If rotation
  -- committed before we got the lock, the token now mismatches.
  if not exists (
    select 1 from public.show_share_tokens
     where show_id = v_show_id and share_token = p_share_token
  ) then
    out_show_id := null; out_picker_epoch := null; out_rejection_code := 'PICKER_INVALID_SHARE_TOKEN';
    return next; return;
  end if;

  -- Step 4: re-read published/archived UNDER the lock (R4-F1). The pre-lock
  -- read in step 1 could have been pre-empted by a concurrent archive/
  -- unpublish before we acquired the lock; using the pre-lock values
  -- would let an archived show mint a cookie.
  select published, archived
    into v_published, v_archived
    from public.shows
   where id = v_show_id;
  if v_archived or not v_published then
    out_show_id := null; out_picker_epoch := null; out_rejection_code := 'PICKER_SHOW_UNAVAILABLE';
    return next; return;
  end if;

  -- Step 5: roster membership + R41-R8 claimed-identity check.
  -- R5-F3: distinguish WRONG_SHOW from NOT_FOUND so form-tamper
  -- attempts (a real crew_member_id from a different show) emit
  -- the tamper-specific signal. R41 Fix-2: also reject claimed
  -- rows so a hand-crafted POST can't bypass the deactivated-row UI.
  select show_id, claimed_via_oauth_at
    into v_crew_show, v_claimed_via_oauth_at
    from public.crew_members
   where id = p_crew_member_id;
  if v_crew_show is null then
    out_show_id := null; out_picker_epoch := null; out_observed_at_millis := null;
    out_rejection_code := 'PICKER_CREW_MEMBER_NOT_FOUND';
    return next; return;
  end if;
  if v_crew_show <> v_show_id then
    out_show_id := null; out_picker_epoch := null; out_observed_at_millis := null;
    out_rejection_code := 'PICKER_CREW_MEMBER_WRONG_SHOW';
    return next; return;
  end if;
  -- R41-R8/R22/R30: reject if the row is OAuth-claimed. The bypass
  -- picker is for unclaimed identities only; signed-in users go via
  -- /api/auth/picker-bootstrap which uses the same claim_oauth_identity
  -- and stamps mint_safe_t_millis > claim_epoch_millis.
  if v_claimed_via_oauth_at is not null then
    out_show_id := null; out_picker_epoch := null; out_observed_at_millis := null;
    out_rejection_code := 'PICKER_IDENTITY_CLAIMED';
    return next; return;
  end if;

  -- (R41-R35: ambiguous-email check REMOVED — schema's partial UNIQUE
  -- index on (show_id, email) makes duplicate-email-on-same-show
  -- impossible. The constraint is the canonical defense.)

  -- Step 6: read picker_epoch under the lock. Reset/Rotate cannot
  -- bump it during this transaction; the value we return is
  -- guaranteed to match what a concurrent rotation would observe.
  select s.picker_epoch into out_picker_epoch
    from public.shows s where s.id = v_show_id;

  -- Step 7: capture observed_at_millis from clock_timestamp() AFTER
  -- the advisory lock is held (R41-R18 + R41-R22 + R41-R23 + R41-R30).
  -- clock_timestamp() returns current wall-clock at evaluation time;
  -- now()/transaction_timestamp() returns transaction-start time
  -- which could predate the lock acquisition under contention.
  -- floor() avoids banker's rounding on ::bigint cast.
  out_observed_at_millis := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

  out_show_id := v_show_id;
  out_rejection_code := null;
  return next;
end;
$$;

revoke all on function public.select_identity_atomic(text, text, uuid) from public;
grant execute on function public.select_identity_atomic(text, text, uuid)
  to authenticated, service_role;
```

Test cases:
- Happy path: returns `{ show_id, picker_epoch, rejection_code: null }`.
- Wrong token: returns `{ rejection_code: 'PICKER_INVALID_SHARE_TOKEN' }`.
- Wrong crew row: returns `PICKER_CREW_MEMBER_NOT_FOUND`.
- Archived show: returns `PICKER_SHOW_UNAVAILABLE`.
- **Concurrent rotation race regression**: spawn two transactions in parallel — one calls `rotate_show_share_token`, the other calls `select_identity_atomic` with the OLD token. Whichever acquires the lock first wins; the other observes the post-state under the same lock. Asserts: rotation-wins → select returns `PICKER_INVALID_SHARE_TOKEN` even though it presented the old token; select-wins → cookie minted at the OLD epoch (which is then bumped by the subsequent rotation). No window where the old token can mint a cookie at the new epoch.
- **Concurrent archive race regression (R4-F1 + R9-F1)**: spawn two transactions — one calls `select_identity_atomic` with a valid token; the other archives the same show via the LIVE archive writer (`unpublishShow.ts` or whichever helper Doug's archive action actually invokes, which MUST itself acquire `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` per AGENTS.md invariant 2). A direct `UPDATE shows SET archived = true` would NOT acquire the lock and would race — that's a violation of the project invariant, not a valid test scenario. Asserts: archive-wins → select observes `archived = true` under the lock and returns `PICKER_SHOW_UNAVAILABLE`. Plus a class-sweep meta-test (extend `tests/auth/advisoryLockRpcDeadlock.test.ts`) asserts every `shows.archived` / `shows.published` writer in the repo acquires the per-show advisory lock per the existing grep-derived shows-writer inventory (§5.6 R23/R24).

```bash
git commit -am "feat(db): select_identity_atomic RPC (token+epoch under advisory lock; B3-pre)"
```

---

### Task B3: `selectIdentity` Server Action (R37 share-token validation, R3-F1 atomic)

**Files:**
- Create: `lib/auth/picker/selectIdentity.ts`
- Test: `tests/auth/picker/selectIdentity.test.ts`

- [ ] **Step 1-5: TDD cycle**

Test cases (R3-F3 — unit tests target `selectIdentityCore` with object args; the FormData entry `selectIdentity` has its own real-form-submission test that constructs FormData):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { selectIdentity, selectIdentityCore } from '@/lib/auth/picker/selectIdentity';

describe('selectIdentityCore (object-shaped — direct invocation)', () => {
  it('R37: rejects without share-token (legacy { showId, crewMemberId } shape)', async () => {
    const result = await selectIdentityCore({ showId: 'x', crewMemberId: 'y' } as any);
    expect(result.code).toBe('PICKER_INVALID_INPUT');
  });
  it("R37: rejects with wrong share-token (code 'PICKER_INVALID_SHARE_TOKEN')", async () => { /* ... */ });
  it('rejects non-UUID crewMemberId', async () => { /* PICKER_INVALID_INPUT */ });
  it('rejects when crew member is in a different show', async () => { /* PICKER_CREW_MEMBER_WRONG_SHOW */ });
  it('rejects when crew member was deleted between picker and submit', async () => { /* PICKER_CREW_MEMBER_NOT_FOUND */ });
  it('rejects unpublished show', async () => { /* PICKER_SHOW_UNAVAILABLE */ });
  it('rejects archived show', async () => { /* PICKER_SHOW_UNAVAILABLE */ });
  it('happy path: mints HMAC-signed cookie + revalidates tokenized path', async () => { /* assert Set-Cookie present + revalidatePath called with /show/${slug}/${token} */ });
  it('merges new entry into existing envelope without disturbing other shows', async () => { /* ... */ });
  it('LRU-evicts oldest entry when over byte budget', async () => { /* ... */ });
});

describe('selectIdentity FormData entry (real form submission shape)', () => {
  it('parses FormData and delegates to selectIdentityCore', async () => {
    const fd = new FormData();
    fd.set('slug', 'real-slug');
    fd.set('shareToken', 'a'.repeat(64));
    fd.set('crewMemberId', '11111111-1111-1111-1111-111111111111');
    const result = await selectIdentity(fd);
    expect(result.ok).toBe(false);
    // PICKER_INVALID_SHARE_TOKEN (no real show seeded for this slug).
    expect((result as any).code).toBe('PICKER_INVALID_SHARE_TOKEN');
  });

  it('rejects FormData with missing fields → PICKER_INVALID_INPUT', async () => {
    const fd = new FormData();
    fd.set('slug', 'real-slug');
    // shareToken + crewMemberId missing
    const result = await selectIdentity(fd);
    expect((result as any).code).toBe('PICKER_INVALID_INPUT');
  });

  it('R41 P-R7 Fix-2: PICKER_IDENTITY_CLAIMED rejection throws NEXT_REDIRECT to /auth/sign-in?next=<tokenized URL>', async () => {
    // Seed: a published show with a roster row whose claimed_via_oauth_at IS NOT NULL.
    // Hand-crafted POST submits the claimed crew_member_id to the Server Action entry point.
    const fd = new FormData();
    fd.set('slug', 'claimed-show-slug');
    fd.set('shareToken', 'b'.repeat(64));
    fd.set('crewMemberId', '22222222-2222-2222-2222-222222222222');  // claimed roster row

    // R41 P-R8 Fix-2 (Finding 2): assert tamper:true structured log is emitted
    // BEFORE the redirect throws. The §8.4 contract requires the audit record
    // to survive the redirect path; an implementation that calls redirect()
    // without the prior console.warn loses the tamper signal entirely.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let thrown: any = null;
    try {
      await selectIdentity(fd);
    } catch (e: any) {
      thrown = e;
    }

    // Tamper log: pin event name, tamper:true flag, slug + crewMemberId, NO shareToken.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(logged.event).toBe('picker.identity_claimed');
    expect(logged.tamper).toBe(true);
    expect(logged.slug).toBe('claimed-show-slug');
    expect(logged.crewMemberId).toBe('22222222-2222-2222-2222-222222222222');
    expect(logged).not.toHaveProperty('shareToken');  // sensitive bearer; MUST NOT appear in logs.
    warnSpy.mockRestore();

    // Redirect: Next.js redirect() throws a NEXT_REDIRECT error with a digest containing the location.
    expect(thrown).not.toBeNull();
    expect(thrown.digest).toMatch(/^NEXT_REDIRECT/);
    expect(thrown.digest).toContain('/auth/sign-in?next=');
    expect(thrown.digest).toContain(encodeURIComponent('/show/claimed-show-slug/' + 'b'.repeat(64)));
  });

  it('R41 P-R8 Fix-2: regression — tamper log is emitted EVEN IF redirect() throws synchronously', async () => {
    // Negative regression: stash the production `redirect` call and have the
    // test substitute a throwing stub that runs SYNCHRONOUSLY (no microtask
    // gap). The console.warn MUST still have been called — proves the log
    // call ordering is correct, not just "called before the next tick."
    // If a future refactor moves console.warn after redirect(), this fails.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fd = new FormData();
    fd.set('slug', 'claimed-show-slug');
    fd.set('shareToken', 'c'.repeat(64));
    fd.set('crewMemberId', '33333333-3333-3333-3333-333333333333');  // also claimed
    try { await selectIdentity(fd); } catch { /* swallow */ }
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('R41 P-R7 Fix-2: core impl still returns typed PICKER_IDENTITY_CLAIMED — only the FormData entry redirects', async () => {
    // Unit-test the object-shaped core directly. The redirect is ONLY in the exported
    // Server Action entry point, NOT the core. This separation lets typed assertions
    // pin the rejection code shape without coupling to Next.js redirect machinery.
    const result = await selectIdentityCore({
      slug: 'claimed-show-slug',
      shareToken: 'b'.repeat(64),
      crewMemberId: '22222222-2222-2222-2222-222222222222',
    });
    expect(result.ok).toBe(false);
    expect((result as any).code).toBe('PICKER_IDENTITY_CLAIMED');
  });
});
```

Implementation file:

```ts
// lib/auth/picker/selectIdentity.ts
// R1-F1: Server Actions invoked as <form action={}> receive a
// FormData argument, NOT a plain object. The exported action
// parses FormData; a separate object-shaped core function is
// unit-testable directly. Both paths share the same validation.
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { encodePickerCookie, decodePickerCookie, COOKIE_NAME } from '@/lib/auth/picker/cookieEnvelope';
import { pickerCookieSigningKey } from '@/lib/env/pickerCookieSigningKey';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const MAX_AGE_SEC = 7_776_000;

export type SelectIdentityInput = { slug: string; shareToken: string; crewMemberId: string };
export type SelectIdentityResult = { ok: true } | { ok: false; code: string };

// FormData entry point — what Next invokes when <form action={selectIdentity}> submits.
export async function selectIdentity(formData: FormData): Promise<SelectIdentityResult | never> {
  const slug = formData.get('slug');
  const shareToken = formData.get('shareToken');
  const crewMemberId = formData.get('crewMemberId');
  if (typeof slug !== 'string' || typeof shareToken !== 'string' || typeof crewMemberId !== 'string') {
    return { ok: false, code: 'PICKER_INVALID_INPUT' };
  }
  const result = await selectIdentityCore({ slug, shareToken, crewMemberId });

  // R41 §8.4 PICKER_IDENTITY_CLAIMED contract: hand-crafted POSTs that
  // bypass the deactivated-row UI (which already routes to /auth/sign-in)
  // and hit selectIdentity directly with a claimed crewMemberId get the
  // SAME OAuth-recovery flow. The spec's "Rejection codes" section for
  // PICKER_IDENTITY_CLAIMED mandates a redirect to /auth/sign-in?next=
  // <tokenized URL>, NOT a returned { ok: false, code } that would
  // strand the user.
  if (!result.ok && result.code === 'PICKER_IDENTITY_CLAIMED') {
    // R41 P-R8 Fix-2 (Finding 2): EMIT the tamper signal BEFORE redirect()
    // throws — otherwise the audit record is lost. The §8.4 contract says
    // PICKER_IDENTITY_CLAIMED carries tamper:true in structured logs; the
    // redirect-throw must NOT swallow that. Structured-log shape pinned by
    // the FormData-entry redirect test below.
    //
    // Logging convention: console.warn(JSON.stringify(...)) is the
    // platform-neutral pattern in this repo's Server Actions — Next.js
    // captures stdout/stderr in Vercel logs without a centralized logger
    // dependency. The `event` field is greppable from log aggregation.
    // Do NOT include the shareToken (sensitive bearer credential); do
    // include slug + crewMemberId so operators can correlate against the
    // admin/per-show audit page.
    // R41 P-R12 Fix-2: NO `new Date()`/`Date.now()`/`performance.now()` in
    // this log. The §10.1 grep guard bans JS clock sources in this file
    // (the file already pins cookie.t to the DB-side observed_at_millis;
    // adding a JS clock anywhere else in the file would trip the guard).
    // Log aggregation (Vercel/CloudWatch) appends its own ingestion
    // timestamp; the structured-log line itself omits the wall-clock
    // field. Slug + crewMemberId + tamper flag are sufficient for
    // operator triage; correlation across alerts uses the aggregation
    // timestamp, not the application timestamp.
    console.warn(JSON.stringify({
      event: 'picker.identity_claimed',
      tamper: true,
      slug,
      crewMemberId,
      // R41 §8.4: tamper:true distinguishes hand-crafted POST from the
      // deactivated-row UI flow (which never hits selectIdentity at all —
      // claimed rows render with action="/auth/sign-in?next=...").
      // Reaching this branch means a client crafted a POST that bypassed
      // the form's deactivated state — that IS the tamper signal.
      reason: 'hand_crafted_post_bypassed_deactivated_row',
    }));
    const tokenizedUrl = `/show/${slug}/${shareToken}`;
    // redirect() throws a Next.js NEXT_REDIRECT — the Server Action client
    // handler follows it. The console.warn above already emitted the
    // tamper signal; the redirect is the user-facing recovery path.
    redirect(`/auth/sign-in?next=${encodeURIComponent(tokenizedUrl)}`);
  }
  return result;
}

// Object-shaped core — unit-testable; never invoked directly by <form>.
// R3-F1: uses select_identity_atomic RPC so the token check, roster
// check, availability check, AND epoch read all run under the per-show
// advisory lock. Rotation cannot interleave.
// R12-F3: every infra surface — pickerCookieSigningKey, service-role
// client construction, cookies().get/set, decodePickerCookie,
// encodePickerCookie — can throw. Wrap the entire body in try/catch
// so any thrown fault maps to the typed PICKER_RESOLVER_LOOKUP_FAILED
// result instead of bubbling up as a framework error.
export async function selectIdentityCore(input: SelectIdentityInput): Promise<SelectIdentityResult> {
  try {
    return await selectIdentityCoreImpl(input);
  } catch {
    return { ok: false, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
}

async function selectIdentityCoreImpl(input: SelectIdentityInput): Promise<SelectIdentityResult> {
  if (!input || typeof input !== 'object') return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (typeof input.slug !== 'string' || !SLUG_RE.test(input.slug)) return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (typeof input.shareToken !== 'string' || !TOKEN_RE.test(input.shareToken)) return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (typeof input.crewMemberId !== 'string' || !UUID_RE.test(input.crewMemberId)) return { ok: false, code: 'PICKER_INVALID_INPUT' };

  const supabase = createSupabaseServiceRoleClient();

  // R3-F1: single RPC under advisory lock; rotation cannot interleave.
  // R4-F2: wrap in try/catch — .rpc() can THROW on network/runtime faults
  // (not just return error), and the throw bypasses the typed
  // PICKER_RESOLVER_LOOKUP_FAILED contract per AGENTS.md invariant 9.
  // R9-F2: RPC output params are renamed out_* to avoid PL/pgSQL
  // column-name ambiguity. JS destructures the renamed fields.
  let data: {
    out_show_id: string | null;
    out_picker_epoch: number | null;
    out_observed_at_millis: number | null;  // R41-R18 DB-side bigint (JS number is safe to ~2^53)
    out_rejection_code: string | null;
  } | null = null;
  let error: unknown = null;
  try {
    const resp = await supabase
      .rpc('select_identity_atomic', {
        p_slug: input.slug,
        p_share_token: input.shareToken,
        p_crew_member_id: input.crewMemberId,
      })
      .single();
    data = resp.data as any;
    error = resp.error;
  } catch (e) {
    error = e;
  }
  if (error) return { ok: false, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  if (!data) return { ok: false, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  if (data.out_rejection_code) return { ok: false, code: data.out_rejection_code };
  if (!data.out_show_id || !Number.isInteger(data.out_picker_epoch) || typeof data.out_observed_at_millis !== 'number') {
    return { ok: false, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
  const showId = data.out_show_id as string;
  const lockedEpoch = data.out_picker_epoch as number;
  const observedAtMillis = data.out_observed_at_millis as number;  // R41-R18 DB-side

  // Merge into existing envelope.
  const key = pickerCookieSigningKey();
  const cookieStore = await cookies();
  const existing = decodePickerCookie(cookieStore.get(COOKIE_NAME)?.value, key);
  const env = existing ?? { v: 1 as const, selections: {} };
  env.selections[showId] = {
    id: input.crewMemberId,
    e: lockedEpoch,
    // R41-R18/R22/R23/R30 + spec §6.0: cookie.t MUST be the DB-side
    // millisecond timestamp captured INSIDE the advisory lock via
    // clock_timestamp(). NEVER Math.floor(Date.now() / 1000) — that's
    // app-server seconds and (a) wrong precision and (b) susceptible to
    // app-server vs DB-server clock skew. The §10.1 meta-test grep-
    // bans Date.now / new Date / performance.now / process.hrtime as
    // cookie.t sources in this file.
    t: observedAtMillis,
  };
  const encoded = encodePickerCookie(env, key);
  cookieStore.set(COOKIE_NAME, encoded, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_SEC,
  });
  revalidatePath(`/show/${input.slug}/${input.shareToken}`);
  return { ok: true };
}
```

- [ ] **Commit**

```bash
git add lib/auth/picker/selectIdentity.ts tests/auth/picker/selectIdentity.test.ts
git commit -m "feat(auth): selectIdentity Server Action (R37 token validation; B3)"
```

---

### Task B4: `clearIdentity` Server Action + `clearIdentityAndSkip` (R39 + R41 P-R29 Fix-3)

**Form/FormData pattern (R1-F1):** like `selectIdentity`, the exported `clearIdentity` accepts `FormData` (called from `<form action={clearIdentity}>` in `IdentityChip`), parses string fields, and delegates to an object-shaped `clearIdentityCore({ slug, shareToken, showId })` that unit tests exercise directly. Same pattern for `cleanupStaleEntry` (B5).

**R41 P-R29 Fix-3 — `clearIdentityAndSkip` companion action.** The base `clearIdentity` calls `revalidatePath()` and returns; it does NOT navigate. The shared-device Mode-B gate (Task C5) needs an ATOMIC clear-and-skip operation — clear the stale entry AND redirect to `/show/<slug>/<shareToken>?gate=skip` in one Server Action so the user lands on the picker with the stale entry already gone. Export a parallel `clearIdentityAndSkip(formData: FormData)` from this same file: parses the same FormData shape as `clearIdentity`, calls `clearIdentityCore` internally, then `redirect('/show/${slug}/${shareToken}?gate=skip')` from `next/navigation` (throws NEXT_REDIRECT — caller receives the redirect response). The clearIdentity → revalidatePath behavior is unchanged for non-skip callers (the existing `<IdentityChip>` "Not you?" affordance). The new action is the gate's "Continue as guest" CTA target.

**Files:**
- Create: `lib/auth/picker/clearIdentity.ts` (exports BOTH `clearIdentity` and `clearIdentityAndSkip`)
- Test: `tests/auth/picker/clearIdentity.test.ts` (covers both exports)

- [ ] **Test cases:**

```ts
describe('clearIdentity', () => {
  it('removes the showId entry from the cookie envelope', async () => { /* ... */ });
  it('clears the cookie entirely when envelope becomes empty', async () => { /* Max-Age=0 */ });
  it('preserves other shows entries', async () => { /* ... */ });
  it('rejects invalid slug/shareToken/showId inputs (PICKER_INVALID_INPUT)', async () => { /* ... */ });
  it('revalidates the tokenized path', async () => { /* assert revalidatePath called */ });
});
```

- [ ] **Implementation:**

```ts
// lib/auth/picker/clearIdentity.ts
// R1-F1 + R2-F2: FormData entry-point + object-shaped *Core.
'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { encodePickerCookie, decodePickerCookie, COOKIE_NAME } from '@/lib/auth/picker/cookieEnvelope';
import { pickerCookieSigningKey } from '@/lib/env/pickerCookieSigningKey';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

export async function clearIdentity(formData: FormData) {
  const slug = formData.get('slug');
  const shareToken = formData.get('shareToken');
  const showId = formData.get('showId');
  if (typeof slug !== 'string' || typeof shareToken !== 'string' || typeof showId !== 'string') {
    return { ok: false, code: 'PICKER_INVALID_INPUT' };
  }
  return clearIdentityCore({ slug, shareToken, showId });
}

export async function clearIdentityCore(input: { slug: string; shareToken: string; showId: string }) {
  try {
    return await clearIdentityCoreImpl(input);
  } catch {
    return { ok: false, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
}

async function clearIdentityCoreImpl(input: { slug: string; shareToken: string; showId: string }) {
  if (!UUID_RE.test(input.showId)) return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (!SLUG_RE.test(input.slug)) return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (!TOKEN_RE.test(input.shareToken)) return { ok: false, code: 'PICKER_INVALID_INPUT' };

  const key = pickerCookieSigningKey();
  const cookieStore = await cookies();
  const env = decodePickerCookie(cookieStore.get(COOKIE_NAME)?.value, key);
  if (!env) {
    revalidatePath(`/show/${input.slug}/${input.shareToken}`);
    return { ok: true };
  }
  delete env.selections[input.showId];
  if (Object.keys(env.selections).length === 0) {
    cookieStore.set(COOKIE_NAME, '', { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 0 });
  } else {
    cookieStore.set(COOKIE_NAME, encodePickerCookie(env, key), {
      path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7_776_000,
    });
  }
  revalidatePath(`/show/${input.slug}/${input.shareToken}`);
  return { ok: true };
}
```

- [ ] **Commit**

```bash
git commit -am "feat(auth): clearIdentity Server Action (B4)"
```

---

### Task B5: `cleanupStaleEntry` Server Action (R22 compare-and-delete)

**Files:**
- Create: `lib/auth/picker/cleanupStaleEntry.ts`
- Test: `tests/auth/picker/cleanupStaleEntry.test.ts`

Same TDD shape as B4 but with the compare-and-delete contract:

```ts
// lib/auth/picker/cleanupStaleEntry.ts
// R1-F1 + R2-F2: FormData entry-point + object-shaped *Core.
// Note: expectedEpoch arrives as a string in FormData; must parseInt.
'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { encodePickerCookie, decodePickerCookie, COOKIE_NAME } from '@/lib/auth/picker/cookieEnvelope';
import { pickerCookieSigningKey } from '@/lib/env/pickerCookieSigningKey';

export async function cleanupStaleEntry(formData: FormData) {
  const slug = formData.get('slug');
  const shareToken = formData.get('shareToken');
  const showId = formData.get('showId');
  const expectedEpochRaw = formData.get('expectedEpoch');
  const expectedCrewMemberId = formData.get('expectedCrewMemberId');
  if (
    typeof slug !== 'string' ||
    typeof shareToken !== 'string' ||
    typeof showId !== 'string' ||
    typeof expectedEpochRaw !== 'string' ||
    typeof expectedCrewMemberId !== 'string'
  ) {
    return { ok: false, code: 'PICKER_INVALID_INPUT' };
  }
  const expectedEpoch = Number.parseInt(expectedEpochRaw, 10);
  if (!Number.isInteger(expectedEpoch) || expectedEpoch < 0) {
    return { ok: false, code: 'PICKER_INVALID_INPUT' };
  }
  return cleanupStaleEntryCore({ slug, shareToken, showId, expectedEpoch, expectedCrewMemberId });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

export async function cleanupStaleEntryCore(input: {
  slug: string;
  shareToken: string;
  showId: string;
  expectedEpoch: number;
  expectedCrewMemberId: string;
}) {
  try {
    return await cleanupStaleEntryCoreImpl(input);
  } catch {
    return { ok: false, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
}

async function cleanupStaleEntryCoreImpl(input: {
  slug: string;
  shareToken: string;
  showId: string;
  expectedEpoch: number;
  expectedCrewMemberId: string;
}) {
  // R10-F2: inline validation (do NOT defer to a comment placeholder).
  if (!SLUG_RE.test(input.slug)) return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (!TOKEN_RE.test(input.shareToken)) return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (!UUID_RE.test(input.showId)) return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (!UUID_RE.test(input.expectedCrewMemberId)) return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (!Number.isInteger(input.expectedEpoch) || input.expectedEpoch < 0) {
    return { ok: false, code: 'PICKER_INVALID_INPUT' };
  }

  const key = pickerCookieSigningKey();
  const cookieStore = await cookies();
  const env = decodePickerCookie(cookieStore.get(COOKIE_NAME)?.value, key);
  if (!env) return { ok: true, action: 'noop' };
  const entry = env.selections[input.showId];
  if (!entry) return { ok: true, action: 'noop' };
  // R22: compare-and-delete — only remove if entry STILL matches the stale observation.
  if (entry.e !== input.expectedEpoch || entry.id !== input.expectedCrewMemberId) {
    return { ok: true, action: 'noop' }; // selectIdentity won the race; preserve newer state.
  }
  delete env.selections[input.showId];
  if (Object.keys(env.selections).length === 0) {
    cookieStore.set(COOKIE_NAME, '', { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 0 });
  } else {
    cookieStore.set(COOKIE_NAME, encodePickerCookie(env, key), {
      path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7_776_000,
    });
  }
  revalidatePath(`/show/${input.slug}/${input.shareToken}`);

  // R41 P-R18 Fix-1 (Finding 1): emit PICKER_SELECTION_RACE admin_alert
  // per §8.4 catalog row contract. Cataloged code with
  // admitsAdminAlertRow:true MUST have a producer per H7. The "cleaned"
  // path is the only place a stale-epoch race actually MATERIALIZED
  // (the no-op path was a race that resolved itself; no signal needed).
  // Operators want to know that a stale cookie was detected and reaped
  // so they can correlate against the recent Reset/Rotate event that
  // bumped the epoch.
  //
  // Best-effort: alert failure does NOT roll back the cleanup (the
  // delete is the user's intent; alert is observational). Nested
  // try/catch.
  try {
    const { upsertAdminAlert } = await import('@/lib/adminAlerts/upsertAdminAlert');
    await upsertAdminAlert({
      showId: input.showId,
      code: 'PICKER_SELECTION_RACE',
      context: {
        show_id: input.showId,
        stale_epoch: input.expectedEpoch,
        stale_crew_member_id: input.expectedCrewMemberId,
      },
    });
  } catch { /* alert emission failure does not roll back cleanup */ }

  return { ok: true, action: 'cleaned' };
}
```

Critical test: race-safety — when `selectIdentity` writes a fresh entry between picker render and cleanup form auto-submit, cleanup is a no-op AND **no PICKER_SELECTION_RACE alert is emitted** (the race resolved itself; signal is only for materialized stale-cookie deletions). R41 P-R18 Fix-1: in the "cleaned" path, assert exactly one upsertAdminAlert call with code='PICKER_SELECTION_RACE', context={show_id, stale_epoch, stale_crew_member_id}; in the "noop" path, assert ZERO upsertAdminAlert calls. Alert-failure regression: mock upsertAdminAlert to throw; assert cleanupStaleEntry STILL returns `{ ok: true, action: 'cleaned' }` and the cookie IS cleaned in the cookie store.

```bash
git commit -am "feat(auth): cleanupStaleEntry compare-and-delete (R22; B5)"
```

---

### Task B7: `resolveShowPageAccess` page-route-only helper (R41 §4.7)

**Files:**
- Create: `lib/auth/picker/resolveShowPageAccess.ts`
- Test: `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts`

11-arm discriminated union per spec §4.7 (R41-R35 corrected count). Called ONLY by `app/show/[slug]/[shareToken]/page.tsx`. Imports `validateGoogleSession` from the `no-jwt-surface.test.ts` structural allowlist. **MUST NOT** import the picker cookie encoder OR `cookies` from `next/headers` (static guard in `_metaPickerCookieContract.test.ts`).

Chain order: archived → admin precedence → unpublished (R41-R10 step 3.5 — before any Google-session branch to prevent bootstrap-loop) → Google-session-matching-crew-row → existing picker cookie.

Return type. **Every page-rendering arm (admin, resolved, no_auth, epoch_stale, removed_from_roster, identity_invalidated) carries `showId`** so the page route can pass it to `PickerInterstitial` / `ShowBody` / `SignInOrSkipGate` without re-resolving slug-to-id (re-resolving outside the helper's lock window would race rotation/archive). The terminal arms (archived, unpublished, needs_picker_bootstrap, show_unavailable, infra_error) do NOT carry `showId` (page emits 404 or redirect; no downstream consumer needs it).

```ts
export type ResolveShowPageAccessResult =
  | { kind: 'archived' }
  | { kind: 'admin'; showId: string }
  | { kind: 'needs_picker_bootstrap'; intentToken: string }
  | { kind: 'resolved'; showId: string; crewMemberId: string; source: 'cookie' | 'admin' }
  | { kind: 'unpublished' }
  | { kind: 'no_auth'; showId: string; reason: 'first_contact' | 'google_mismatch' }  // P-R28 Fix-2 + P-R35 amendment: reason needed by SignInOrSkipGate to wire the correct Continue-as-guest action (clearIdentityAndSkip for google_mismatch per P-R29 Fix-3 atomic clear+redirect; same-page ?gate=skip for first_contact)
  | { kind: 'epoch_stale'; showId: string; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: 'removed_from_roster'; showId: string; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: 'identity_invalidated';  // R41-R13 + R41-R35; P-R29 Fix-1 added 'session_mismatch'
      showId: string;
      expectedEpoch: number;
      expectedCrewMemberId: string;
      reason: 'claimed_after_pick' | 'session_mismatch' }
  | { kind: 'show_unavailable' }
  | { kind: 'infra_error'; code: string };
```

Type-level test: assert via `Pick`/`Extract` that every page-rendering kind has a `showId: string` member; assert the terminal arms do NOT have `showId`. The Task C1 page route relies on this typing for the PickerInterstitial / SignInOrSkipGate / ShowBody props.

For `needs_picker_bootstrap`, the helper generates the intent token in-place:

```ts
const intentTokenPayload = { slug, shareToken, exp: Math.floor(Date.now() / 1000) + 60 };
const intentToken = signIntentToken(intentTokenPayload, pickerCookieSigningKey());
```

Step 4 branch logic per spec §4.1 (R41-R11/R41-R12/R41-R33/P-R27):
- 4(a): no Google session → fall to step 5 (existing picker cookie). If step 5 finds no cookie entry either, the final terminal is `{ kind: 'no_auth', showId, reason: 'first_contact' }` (the user has never picked an identity; no Google session; classic gate scenario).
- 4(b): id-match + row claimed + `cookie.t > floor(extract(epoch from claim_at) * 1000)::bigint` → cookie path (resolved).
- 4(b'): id-mismatch OR row not yet claimed OR `cookie.t <= claim_epoch_millis` OR no cookie entry → `needs_picker_bootstrap`.
- (no 4(d) — R41-R35 removed ambiguous_email arm.)
- **4(e) — R41 P-R27 Fix-1 CRITICAL (shared-device identity leak)**: Google session exists AND email matches NO `crew_members` row on this show → return `{ kind: 'no_auth', showId, reason: 'google_mismatch' }` (the page route renders `<SignInOrSkipGate>` showing "signed in as someone else / sign out to continue" with the Continue-as-guest CTA wired to **`clearIdentityAndSkip`** per P-R29 Fix-3 (the atomic clear+redirect action — NOT the base `clearIdentity` which only revalidates) — see C5 task body for the gate's branching). **DO NOT fall through to step 5 (existing picker cookie)**. Pre-P-R27 phrasing said "fall to step 5", which on a shared device opens an identity leak: Alice signs in to her Google account on shared phone → picks herself on Show X (cookie stamped) → signs out of Google → Bob signs in via Google on same phone → Bob visits Show X. Bob has no crew row on Show X. Pre-P-R27: step 4(e) falls through to step 5, which reads Alice's still-valid picker cookie entry, and Bob's session "resolves as Alice" — full identity leak. Post-P-R27: step 4(e) is TERMINAL — returns `no_auth`; the SignInOrSkipGate detects the mismatch between the active Google session and the would-be picker entry and shows an explicit "Sign out to continue as guest, or sign in with the account for this show" UI. The stale picker cookie is NOT cleared automatically (clearing requires a Server Action mutation; the page route's helper cannot mutate cookies per spec §4.7 component-tree contract) — instead, the SignInOrSkipGate's "Continue as guest" button POSTs to a Server Action that clears the stale entry for this show before rendering the picker.

Exhaustiveness test exercises each of the 11 arms with fixture inputs.

```bash
git commit -m "feat(auth): resolveShowPageAccess page-route helper (B7; R41 §4.7)"
```

### Task B6: `resetPickerEpoch` + `rotateShareToken` admin Server Actions

**Files:**
- Create: `lib/auth/picker/resetPickerEpoch.ts`
- Create: `lib/auth/picker/rotateShareToken.ts`
- Test: `tests/auth/picker/resetPickerEpoch.test.ts`
- Test: `tests/auth/picker/rotateShareToken.test.ts`

- [ ] **Both actions follow R18 cookie-bound client + requireAdmin() pattern + R4-F2 try/catch on the .rpc() call:**

```ts
// lib/auth/picker/resetPickerEpoch.ts
'use server';

// R41 P-R19 Fix-2 (Finding 2): requireAdmin() returns Promise<void> per
// lib/auth/requireAdmin.ts:125 — it does NOT expose the admin's email.
// For the PICKER_EPOCH_RESET admin_alert audit context, use
// requireAdminIdentity() which returns AdminIdentity = { email: string }
// (lib/auth/requireAdmin.ts:51,53). Both helpers gate on the same
// is_admin() RPC; the identity variant additionally returns the
// canonical email for downstream auditing.
import { requireAdminIdentity } from '@/lib/auth/requireAdmin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { upsertAdminAlert } from '@/lib/adminAlerts/upsertAdminAlert';
import { hashForLog } from '@/lib/email/hashForLog';

export async function resetPickerEpoch(input: { showId: string }) {
  const adminCtx = await requireAdminIdentity();  // { email: string } — typed identity
  const supabase = await createSupabaseServerClient(); // cookie-bound!
  // R4-F2: try/catch wraps the .rpc call so thrown faults map to a
  // typed result instead of bubbling up as an uncataloged framework
  // error.
  try {
    const { data: newEpoch, error } = await supabase
      .rpc('reset_picker_epoch_atomic', { p_show_id: input.showId });
    if (error) return { ok: false as const, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };

    // R41 P-R18 Fix-1 (Finding 1): emit PICKER_EPOCH_RESET admin_alert per
    // §8.4 catalog row contract. Cataloged code with admitsAdminAlertRow:true
    // MUST have a producer call site per H7 producer-registry meta-test;
    // without this emission the catalog gates fail CI OR (if catalog is
    // weakened) operators lose the audit signal for who-reset-which-show.
    // Best-effort: alert failure does NOT roll back the reset (the
    // epoch bump is the user's intent; alert is observational).
    try {
      await upsertAdminAlert({
        showId: input.showId,
        code: 'PICKER_EPOCH_RESET',
        context: {
          show_id: input.showId,
          new_epoch: newEpoch as number,
          admin_email_hash: hashForLog(adminCtx.email),
        },
      });
    } catch {
      // Alert emission failed; the reset itself succeeded. Operators
      // can correlate via the page-route revalidation log if needed.
    }

    return { ok: true as const, new_epoch: newEpoch as number };
  } catch {
    return { ok: false as const, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
}
```

```ts
// lib/auth/picker/rotateShareToken.ts
'use server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function rotateShareToken(input: { showId: string }) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  try {
    const { data, error } = await supabase
      .rpc('rotate_show_share_token', { p_show_id: input.showId })
      .single();
    if (error || !data) return { ok: false as const, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
    return {
      ok: true as const,
      new_share_token: data.new_share_token as string,
      new_epoch: data.new_epoch as number,
    };
  } catch {
    return { ok: false as const, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
}
```

Tests assert: (a) non-admin caller throws via `requireAdmin()`; (b) admin caller succeeds; (c) **R30: no `__Host-fxav_picker` Set-Cookie header is emitted**; (d) for rotate, the returned new_share_token matches `/^[0-9a-f]{64}$/` and is different from the pre-rotation value; (e) **R41 P-R18 Fix-1 PICKER_EPOCH_RESET admin_alert emission**: on successful reset, upsertAdminAlert is called exactly once with `{ showId: input.showId, code: 'PICKER_EPOCH_RESET', context: { show_id, new_epoch, admin_email_hash } }`; assert context.admin_email_hash is NOT the raw email (PII guard); idempotent re-reset on the same show increments occurrence_count via the upsert helper; (f) **R41 P-R18 Fix-1 alert-failure does NOT roll back**: mock upsertAdminAlert to throw; assert resetPickerEpoch STILL returns `{ ok: true, new_epoch: ... }` and the DB epoch IS bumped — alert is observational, not blocking.

```bash
git commit -am "feat(auth): resetPickerEpoch + rotateShareToken admin Server Actions (B6)"
```

---

## Phase C: Route restructure + picker UI

### Task C0-pre: Add picker message codes to catalog (R11-F3)

**Files:**
- Modify: `lib/messages/catalog.ts` (add the new PICKER_* entries from §8.4)
- Modify (regenerate): `lib/messages/__generated__/spec-codes.ts` (the MessageCode union must include the new codes BEFORE TerminalFailure compiles)
- **R41 P-R13 Fix-2 + P-R24 Fix-1** — Modify: `lib/adminAlerts/upsertAdminAlert.ts` (extend `AdminAlertCode` union to include the new R41 admin-alert codes: `OAUTH_IDENTITY_CLAIMED`, `PICKER_BOOTSTRAP_RPC_FAILED`, **`PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED`** (P-R24 — pre-session resolve-show RPC failure with email-less context), `CALLBACK_CLAIM_THREW`, `PICKER_SELECTION_RACE`, `PICKER_EPOCH_RESET`). Without this, C7 / C6 / B5 `upsertAdminAlert({ code: '<NEW_CODE>', ... })` call sites fail TypeScript compilation at the `code: AdminAlertCode` arg position. The `AdminAlertCode` union is the strict type guard at the call boundary; the `lib/messages/catalog.ts` registration is the runtime catalog. Both MUST land together in C0-pre — neither is sufficient alone.
- Test: `tests/messages/picker-codes.test.ts`

The plan previously deferred catalog updates to Task H7, but `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />` in Task C0 and the picker UI in Task C2 pass code strings to `messageFor()` whose live signature accepts `MessageCode`. Without the codes registered first, every commit from C0 onward fails to typecheck.

The codes to register (per §8.4 of the spec, full list — R41 codes included):
- `PICKER_EPOCH_RESET` (admin-alert)
- `PICKER_SELECTION_RACE` (admin-alert)
- `PICKER_EPOCH_STALE_BANNER`, `PICKER_REMOVED_FROM_ROSTER_BANNER`, `PICKER_EMPTY_ROSTER`, `PICKER_SHOW_UNAVAILABLE` (crew-facing)
- `PICKER_INVALID_INPUT`, `PICKER_CREW_MEMBER_NOT_FOUND`, `PICKER_CREW_MEMBER_WRONG_SHOW`, `PICKER_INVALID_SHARE_TOKEN`, `PICKER_RESOLVER_LOOKUP_FAILED` (rejection — all carry both `dougFacing` + `crewFacing` per R33)
- **R41 codes (per spec §8.4 R41 amendments):**
  - `PICKER_IDENTITY_CLAIMED` (rejection — R41 Fix-2; redirects to /auth/sign-in)
  - `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` (crew-facing banner — R41-R8; resolver `identity_invalidated/claimed_after_pick`)
  - `PICKER_BOOTSTRAP_RPC_FAILED` (operator + crew-facing — R41-R7 fail-closed contract; emitted to admin_alerts AND rendered as 502 terminal page)
  - **R41 P-R24 Fix-1 — `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED`** (operator-only; crew-facing copy is SHARED with PICKER_BOOTSTRAP_RPC_FAILED — same "Couldn't sign you in. Please try again in a moment." 502 terminal HTML). Emitted from C6 picker-bootstrap step 3 when `resolve_show_by_slug_and_token` RPC throws OR returns an error (NOT when it returns `data: null` with no error — that's the 403 user/token-mismatch path with no alert). Context shape (email-less because session validation hasn't run yet): `{ stage: 'resolve_show', slug, rpc_error_code, rpc_error_message, route }`. H7 grep-asserts NO `user_email` / `attempted_email_hash` / `share_token` field in any PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED emission site.
  - `OAUTH_IDENTITY_CLAIMED` (admin-alert — R41-R12; emitted PER ROW with show_id-scoped context per P-R8 Fix-3)
  - **R41 P-R11 Fix-3 — `CALLBACK_CLAIM_THREW`** (admin-alert — P-R9 Fix-1 thrown-error path; emitted from C7 callback claim-stamp block when the OAuth claim throws an exception). MUST be registered HERE in C0-pre, NOT deferred to H7, because C7's `upsertAdminAlert('CALLBACK_CLAIM_THREW', ...)` call site fails typecheck against the `AdminAlertCode` union and violates the admin-alert catalog completeness invariant until the code is registered. The pattern is identical to PICKER_BOOTSTRAP_RPC_FAILED: register the code (with both `dougFacing` and any `crewFacing` copy) in `lib/messages/catalog.ts`, regenerate `lib/messages/__generated__/spec-codes.ts`, AND make sure the AdminAlertCode union (if separate from MessageCode) includes it. The H7 meta-test still ENFORCES the producer/catalog match — but the catalog row exists from C0-pre forward, not after C7.
  - `SIGN_IN_OR_SKIP_PROMPT` (crew-facing — R41-R5 SignInOrSkipGate Mode A first-contact copy)
  - **R41 P-R28 Fix-2 — `SIGN_IN_OR_SKIP_PROMPT_MISMATCH`** (crew-facing — SignInOrSkipGate Mode B "signed in as someone else" shared-device copy; new in P-R28). Default copy: "You're signed in with a Google account that isn't on this show's roster. Sign in with the account for this show, or continue as guest to pick from the roster." Never admin-alert; informational only (crew sees the copy via `messageFor`).
  - `IDENTITY_DEACTIVATED_LOCK_HINT` (crew-facing — R41 deactivated-row lock icon aria-label)
  (R41-R35 REMOVED — do NOT register: `PICKER_IDENTITY_AMBIGUOUS`, `PICKER_IDENTITY_AMBIGUOUS_BANNER`. The pre-pivot `AMBIGUOUS_EMAIL_BINDING` may remain as defensive surface but R41 introduces no new emission paths.)

```bash
git commit -am "feat(messages): register PICKER_* catalog codes (C0-pre)"
```

### Task C0: Create `<TerminalFailure>` cataloged-message component

**Files:**
- Create: `components/auth/TerminalFailure.tsx`
- Test: `tests/components/TerminalFailure.test.tsx`

Mirrors the parent spec's terminal-failure render pattern (per `app/show/[slug]/page.tsx:109-123` `R21 F2`). Reads a `code` prop and renders cataloged `crewFacing` copy via `messageFor()` — never the raw code per AGENTS.md invariant 5.

```tsx
// components/auth/TerminalFailure.tsx
// R11-F3: typed via MessageCode union so codes pass the
// catalog's strict-type check at compile time. C0-pre registers
// the PICKER_* codes first.
import { messageFor, type MessageCode } from '@/lib/messages/lookup';

export function TerminalFailure({ code }: { code: MessageCode }) {
  const entry = messageFor(code);
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground mt-2 max-w-120t-center">
        {entry.crewFacing ?? entry.dougFacing ?? 'Please try again.'}
      </p>
    </main>
  );
}
```

Test: passing `PICKER_RESOLVER_LOOKUP_FAILED` renders the cataloged copy; raw code substring is NOT in the rendered DOM (anti-tautology regression).

```bash
git commit -am "feat(ui): TerminalFailure cataloged-message component (C0)"
```

---

### Task C1: Move crew route to `app/show/[slug]/[shareToken]/`

**Task ordering (R3-F2 + R8-F3):** C1 depends on C0 (TerminalFailure), C2 (PickerInterstitial — C1 imports `./_PickerInterstitial`), C3 (StaleCleanupAutoSubmit — referenced from C2), and C4 (IdentityChip + ShowBody prop addition). Implementation order MUST be: **C0 → C2 → C3 → C4-step-1 (extend ShowBody props with optional `identityChip` to keep existing callers building) → C1 (route move; can now import all required components) → C4-step-2 (mount IdentityChip from ShowBody, remove the now-unused legacy slug-only path)**. Each commit must build and test green. C2 and C3 can ship as no-op (Server Component renders nothing visible) until C1 wires them up — write them as fully-functional but unused so the commits are green.

**Files:**
- Move: `app/show/[slug]/page.tsx` → `app/show/[slug]/[shareToken]/page.tsx`
- Move: `app/show/[slug]/_ShowBody.tsx` → `app/show/[slug]/[shareToken]/_ShowBody.tsx`
- Delete: `app/show/[slug]/page.tsx` (after move + rewrite)
- Test: `tests/e2e/show-route-shape.spec.ts`

- [ ] **Step 1: Write the failing test (Playwright)**

```ts
// tests/e2e/show-route-shape.spec.ts
import { test, expect } from '@playwright/test';

test('slug-only URL returns 404 (R35)', async ({ page }) => {
  const res = await page.goto('http://localhost:3000/show/some-slug');
  expect(res?.status()).toBe(404);
});

test('tokenized URL with wrong token returns 404', async ({ page }) => {
  const res = await page.goto('http://localhost:3000/show/real-slug/wrong-token');
  expect(res?.status()).toBe(404);
});

test('tokenized URL with right pair renders the picker', async ({ page }) => {
  const { slug, token } = await seedTestShow();
  await page.goto(`http://localhost:3000/show/${slug}/${token}`);
  await expect(page.getByTestId('picker-question-heading')).toBeVisible();
});
```

- [ ] **Step 2: Rewrite the route file (R41-R7 — use resolveShowPageAccess helper)**

The page route MUST import `resolveShowPageAccess` (Task B7) and switch over the 11 discriminant kinds. The page does NOT call `resolvePickerSelection` directly (the helper does internally for the cookie path), does NOT call `validateGoogleSession` directly (the helper does for the Google-session arm), and does NOT call `cookies().set()` (Server Components cannot mutate cookies per Next App Router contract — for the `needs_picker_bootstrap` arm the page emits `redirect()` to the picker-bootstrap Route Handler which is the legal mutator).

```tsx
// app/show/[slug]/[shareToken]/page.tsx
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { resolveShowPageAccess } from '@/lib/auth/picker/resolveShowPageAccess';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { PickerInterstitial } from './_PickerInterstitial';
import { SignInOrSkipGate } from './_SignInOrSkipGate';
import { ShowBody } from './_ShowBody';
import { getShowForViewer } from '@/lib/data/getShowForViewer';
import { TerminalFailure } from '@/components/auth/TerminalFailure';

// Structural-test note (asserted in tests/cross-cutting/picker-resolver-callsite-contract.test.ts):
// - This file imports resolveShowPageAccess.
// - This file does NOT import resolvePickerSelection directly (helper uses it internally).
// - This file does NOT import validateGoogleSession (helper uses it internally).
// - This file does NOT import cookies from next/headers as a SET source (it may read cookies
//   inside the helper invocation, but never calls cookies().set() — Server Components
//   cannot mutate cookies; the picker-bootstrap Route Handler is the legal mutator).

export default async function ShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; shareToken: string }>;
  searchParams: Promise<{ gate?: string }>;
}) {
  const { slug, shareToken } = await params;
  const { gate } = await searchParams;
  const gateSkip = gate === 'skip';  // R41 SignInOrSkipGate dismissal flag.

  const reqHeaders = await headers();
  const req = new Request('https://placeholder', { headers: reqHeaders });

  // R41 — the helper encapsulates archived → admin → unpublished →
  // Google-session → cookie chain and returns the 11-arm union.
  const result = await resolveShowPageAccess({ slug, shareToken, req });

  switch (result.kind) {
    case 'archived':
      // R27: archived 404s for ALL viewers including admin.
      notFound();
    case 'unpublished':
      notFound();
    case 'infra_error':
      return <TerminalFailure code={result.code} />;
    case 'admin': {
      const viewer = { kind: 'admin' as const };
      let data;
      try {
        data = await getShowForViewer(result.showId, viewer);
      } catch {
        return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
      }
      return <ShowBody slug={slug} showId={result.showId} viewer={viewer} data={data} identityChip={null} />;
    }
    case 'needs_picker_bootstrap': {
      // R41-R6 CRITICAL: Server Components cannot mint cookies; redirect
      // to the Route Handler which is the legal cookie mutator. Intent
      // token (R41-R5 CSRF defense) is generated by the helper.
      const nextUrl = `/show/${slug}/${shareToken}`;
      redirect(`/api/auth/picker-bootstrap?next=${encodeURIComponent(nextUrl)}&t=${encodeURIComponent(result.intentToken)}`);
    }
    case 'resolved': {
      const viewer = { kind: 'crew' as const, crewMemberId: result.crewMemberId };
      let data;
      try {
        data = await getShowForViewer(result.showId, viewer);
      } catch {
        return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
      }
      const crew = data.crewMembers.find((c) => c.id === result.crewMemberId);
      return (
        <ShowBody
          slug={slug}
          showId={result.showId}
          viewer={viewer}
          data={data}
          identityChip={crew ? { name: crew.name, role: crew.role, shareToken } : null}
        />
      );
    }
    case 'no_auth': {
      // R41-R5: SignInOrSkipGate is the first-contact surface. If
      // ?gate=skip is present (user dismissed the gate), render the
      // picker directly instead.
      //
      // P-R29 Fix-3 atomicity guard: only honor ?gate=skip when
      // reason === 'first_contact'. For 'google_mismatch' the user
      // MUST go through clearIdentityAndSkip (which clears the stale
      // entry before redirecting with ?gate=skip from the action itself).
      // A hand-crafted ?gate=skip on a google_mismatch URL is REJECTED
      // and the gate re-renders — closes the bypass where an attacker
      // could strip the Mode-B "signed in as someone else" gate by
      // appending the query param.
      const allowGateSkip = gateSkip && result.reason === 'first_contact';
      if (!allowGateSkip) {
        // P-R28 Fix-2: pass showId + reason so the gate can branch
        // its Continue-as-guest CTA (clearIdentityAndSkip for
        // google_mismatch; simple ?gate=skip navigation for first_contact).
        return <SignInOrSkipGate slug={slug} shareToken={shareToken} showId={result.showId} reason={result.reason} />;
      }
      let roster;
      try {
        roster = await loadRoster(result.showId);
      } catch {
        return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
      }
      return (
        <PickerInterstitial
          slug={slug} shareToken={shareToken}
          showId={result.showId}
          roster={roster}
          banner={null}
          staleCleanupHint={null}
        />
      );
    }
    case 'epoch_stale':
    case 'removed_from_roster':
    case 'identity_invalidated': {
      // R41-R15: all three stale-credential kinds mount StaleCleanupAutoSubmit
      // with the expectedEpoch + expectedCrewMemberId from the resolver.
      // R41-R35 + P-R29/P-R30: identity_invalidated has TWO reasons —
      // 'claimed_after_pick' (R41-R8 base) and 'session_mismatch' (P-R29
      // Fix-1 shared-device defense — fires when a Supabase session is
      // active AND its canonical email doesn't match the cookie's resolved
      // crew_members.email). The ambiguous_email reason was removed in
      // R41-R35 because the schema constraint makes that state impossible.
      // BOTH reasons share the same cleanup flow + banner (the recovery
      // action is identical: re-pick or sign in/out).
      let roster;
      try {
        roster = await loadRoster(result.showId);
      } catch {
        return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
      }
      const banner =
        result.kind === 'epoch_stale' ? 'PICKER_EPOCH_STALE_BANNER'
        : result.kind === 'removed_from_roster' ? 'PICKER_REMOVED_FROM_ROSTER_BANNER'
        : 'PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER';  // identity_invalidated/claimed_after_pick (R41-R35)
      return (
        <PickerInterstitial
          slug={slug} shareToken={shareToken}
          showId={result.showId}
          roster={roster}
          banner={banner}
          staleCleanupHint={{
            expectedEpoch: result.expectedEpoch,
            expectedCrewMemberId: result.expectedCrewMemberId,
          }}
        />
      );
    }
    case 'show_unavailable':
      notFound();
    default: {
      // assertNever exhaustiveness — TypeScript compile-error if any kind missed.
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}
```

**Roster loader** (referenced as `loadRoster(showId)` in the switch above):

```ts
async function loadRoster(showId: string): Promise<RosterRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  // R41-R6 PickerInterstitial deactivated-row contract requires
  // claimed_via_oauth_at to be in the selected fields. showId is
  // passed in by the route — it comes from result.showId returned
  // by resolveShowPageAccess, captured under the helper's lock
  // window. Re-resolving slug→id here would race rotation/archive.
  const { data, error } = await supabase
    .from('crew_members')
    .select('id, name, role, role_flags, claimed_via_oauth_at')
    .eq('show_id', showId)
    .order('name', { ascending: true });
  if (error) throw new Error('roster lookup failed');
  return data ?? [];
}
```

**Exhaustiveness tests** (per spec §10.2 R41-R7 + Task B7): exercise each of the 11 arms with fixture inputs; assert response shape per arm (404 for archived/unpublished/show_unavailable; redirect to picker-bootstrap for needs_picker_bootstrap; SignInOrSkipGate for no_auth without `?gate=skip`; PickerInterstitial banner for stale kinds; ShowBody render for resolved/admin; TerminalFailure for infra_error). Structural test: file imports `resolveShowPageAccess` and does NOT import `resolvePickerSelection`, `validateGoogleSession`, or `cookies` (for SET). **Deactivated-row regression** (per spec §7.2 + §10.2): fixture seeds a roster with one `claimed_via_oauth_at IS NOT NULL` row + several NULL rows; assert: (a) claimed row's `<button>` has `data-claimed="true"`, lock icon, and form `action="/auth/sign-in?next=..."`; (b) NULL rows render with the normal selectIdentity form action; (c) hand-crafted POST submitting claimed crewMemberId to selectIdentity **throws a Next.js NEXT_REDIRECT to `/auth/sign-in?next=<encoded /show/<slug>/<shareToken>>`** — NOT a returned `{ ok: false, code: 'PICKER_IDENTITY_CLAIMED' }`. The exported Server Action special-cases this rejection code so server-side tamper attempts resolve into the same OAuth recovery flow as the deactivated-row UI (R41 P-R7 Fix-2 — spec §8.4 PICKER_IDENTITY_CLAIMED rejection contract mandates redirect to `/auth/sign-in?next=<tokenized URL>`). The underlying core impl still returns the typed `{ ok: false, code: 'PICKER_IDENTITY_CLAIMED' }` result, and unit tests against `selectIdentityCore` (NOT the exported Server Action) MUST continue asserting that shape — only the FormData entry point converts the rejection into a redirect. (d) Structured log MUST emit `picker.identity_claimed` with `tamper:true` even on the redirect path so the audit record survives.

- [ ] **Step 3: Delete the old slug-only file + update consumers**

```bash
rm app/show/[slug]/page.tsx
# Move _ShowBody.tsx into the new directory:
git mv app/show/[slug]/_ShowBody.tsx app/show/[slug]/[shareToken]/_ShowBody.tsx
```

**R9-F3 consumer update**: the admin preview page imports `ShowBody` from the old path. Update its import to the new module path (or, if there are more consumers, ship a compatibility re-export `app/show/[slug]/_ShowBody.ts` that just `export { ShowBody } from './[shareToken]/_ShowBody'` until all callers migrate). Verify with:

```bash
rg -n "from .*app/show/\[slug\]/_ShowBody|from .*show/\[slug\]/_ShowBody" app components lib tests
# Each match → update to the new path. No matches should remain after this step.
```

The admin preview at `app/admin/show/[slug]/preview/[crewId]/page.tsx:39` (current import line per repo grep) MUST be updated in the same commit as the route move. Add a build-verification step:

```bash
pnpm tsc --noEmit && pnpm eslint app components lib
```

The build MUST succeed before the commit.

- [ ] **Step 4-5: Run tests + commit**

```bash
pnpm playwright test tests/e2e/show-route-shape.spec.ts
git add app/show/ tests/e2e/show-route-shape.spec.ts
git commit -m "feat(routing): move crew route to /show/[slug]/[shareToken] (R35; C1)"
```

---

### Task C2: `<PickerInterstitial>` Server Component

**Files:**
- Create: `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`
- Test: `tests/components/PickerInterstitial.test.tsx` (RTL)
- Test: `tests/e2e/picker-dimensional-invariants.spec.ts` (Playwright per AGENTS.md)

Render contract per §7.1–§7.7 — flat alphabetical, role chip right-aligned, LEAD chip in FXAV orange, banner row when stale, empty-state when roster is empty.

```tsx
// app/show/[slug]/[shareToken]/_PickerInterstitial.tsx
import { selectIdentity } from '@/lib/auth/picker/selectIdentity';
import { messageFor } from '@/lib/messages/lookup';
import { StaleCleanupAutoSubmit } from './_StaleCleanupAutoSubmit';

// R41 PickerInterstitial RosterRow includes claimed_via_oauth_at per §7.2
// deactivated-row contract. The page-route loader (Task C1) MUST select
// this field so claimed rows can render as visually disabled.
type RosterRow = {
  id: string;
  name: string;
  role: string;
  role_flags: string[];
  claimed_via_oauth_at: string | null;  // R41 §7.2 deactivated-row predicate
};

export function PickerInterstitial({
  slug, shareToken, showId, roster, banner, staleCleanupHint,
}: {
  slug: string;
  shareToken: string;
  showId: string;
  roster: RosterRow[];
  banner: 'PICKER_EPOCH_STALE_BANNER' | 'PICKER_REMOVED_FROM_ROSTER_BANNER' | 'PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER' | null;
  staleCleanupHint: { expectedEpoch: number; expectedCrewMemberId: string } | null;
}) {
  return (
    <main data-testid="picker-interstitial-root" className="min-h-screen flex flex-col items-center justify-start md:justify-center px-4">
      <div data-testid="picker-brand-strip" className="pt-6 pb-4 text-center">
        <span className="text-[14px] font-bold text-(--accent)">FXAV</span>
      </div>
      <h1 data-testid="picker-question-heading" className="text-xl font-bold">Who are you?</h1>
      <p data-testid="picker-sub-instruction" className="text-xs text-muted-foreground mt-1">
        Tap your name to open the show page.
      </p>
      {banner && (
        <div
          data-testid="picker-banner"
          className="mt-2 mb-2 px-3 py-2 bg-orange-100 dark:bg-orange-900/30 text-xs rounded-md max-w-90"
        >
          {messageFor(banner).crewFacing}
        </div>
      )}
      {roster.length === 0 ? (
        <div data-testid="picker-roster-empty" className="py-16 text-center text-xs text-muted-foreground">
          {messageFor('PICKER_EMPTY_ROSTER').crewFacing}
        </div>
      ) : (
        <ul data-testid="picker-roster-list" className="w-full max-w-90 md:max-w-120 mt-3 space-y-1.25">
          {roster.map((c) => {
            // R41 §7.2 deactivated-row contract: rows whose underlying crew
            // member is OAuth-claimed render as visually disabled. The form
            // action submits to /auth/sign-in (NOT selectIdentity) so the
            // user completes their intent via OAuth. R41-R35: ambiguous-
            // email predicate REMOVED (schema prevents the state).
            const isClaimed = c.claimed_via_oauth_at !== null;
            const tokenizedUrl = `/show/${slug}/${shareToken}`;
            return (
              <li key={c.id}>
                <form
                  action={isClaimed ? `/auth/sign-in?next=${encodeURIComponent(tokenizedUrl)}` : selectIdentity}
                  method={isClaimed ? 'GET' : undefined}
                >
                  {!isClaimed && (
                    <>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="shareToken" value={shareToken} />
                      <input type="hidden" name="crewMemberId" value={c.id} />
                    </>
                  )}
                  <button
                    type="submit"
                    data-testid="picker-roster-row"
                    data-crew-member-id={c.id}
                    data-claimed={isClaimed ? 'true' : 'false'}
                    className={[
                      'w-full min-h-11 px-3 flex items-center justify-between border border-border rounded-[9px] transition-colors',
                      isClaimed
                        ? 'bg-muted text-muted-foreground cursor-pointer'
                        : 'bg-card hover:bg-accent focus:bg-accent',
                    ].join(' ')}
                  >
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      {isClaimed && (
                        <span
                          aria-label={messageFor('IDENTITY_DEACTIVATED_LOCK_HINT').crewFacing}
                          className="text-muted-foreground"
                        >
                          {/* 16px lock icon — R41 §7.2 */}
                          🔒
                        </span>
                      )}
                      {c.name}
                    </span>
                    {c.role && (
                      <span
                        className={[
                          'text-[8px] font-semibold rounded-full px-1.75 py-0.5',
                          isClaimed
                            ? 'bg-muted text-muted-foreground'
                            : c.role_flags.includes('LEAD')
                              ? 'bg-(--accent) text-(--accent-foreground)'
                              : 'bg-muted text-muted-foreground',
                        ].join(' ')}
                      >
                        {c.role}
                      </span>
                    )}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
      {staleCleanupHint && (
        <StaleCleanupAutoSubmit
          slug={slug}
          shareToken={shareToken}
          showId={showId}
          expectedEpoch={staleCleanupHint.expectedEpoch}
          expectedCrewMemberId={staleCleanupHint.expectedCrewMemberId}
        />
      )}
      <footer data-testid="picker-footer" className="mt-6 mb-4 text-[10px] text-muted-foreground">
        Shared by Doug Larson · FXAV
      </footer>
    </main>
  );
}
```

- [ ] **Dimensional invariants Playwright test (per AGENTS.md):**

```ts
// tests/e2e/picker-dimensional-invariants.spec.ts
import { test, expect } from '@playwright/test';

test('roster row meets WCAG 44x44 floor + role chip vertically centered', async ({ page }) => {
  const { slug, token } = await seedTestShowWith8Crew();
  await page.goto(`http://localhost:3000/show/${slug}/${token}`);

  const rows = page.getByTestId('picker-roster-row');
  await expect(rows).toHaveCount(8);

  for (let i = 0; i < 8; i++) {
    const row = rows.nth(i);
    const box = await row.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    // chip vertical center within 1px of row vertical center
    const chip = row.locator('[class*="rounded-full"]');
    if ((await chip.count()) > 0) {
      const chipBox = await chip.boundingBox();
      if (chipBox && box) {
        const rowCenter = box.y + box.height / 2;
        const chipCenter = chipBox.y + chipBox.height / 2;
        expect(Math.abs(rowCenter - chipCenter)).toBeLessThan(1);
      }
    }
  }
});

test('viewport 390px: picker block max-width is 360px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(/* seeded URL */);
  const list = page.getByTestId('picker-roster-list');
  const box = await list.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(360);
});
```

```bash
git commit -am "feat(ui): PickerInterstitial + dimensional-invariants Playwright (C2)"
```

---

### Task C3: `<StaleCleanupAutoSubmit>` client component (R25)

**Files:**
- Create: `app/show/[slug]/[shareToken]/_StaleCleanupAutoSubmit.tsx`
- Test: `tests/components/StaleCleanupAutoSubmit.test.tsx`

```tsx
// app/show/[slug]/[shareToken]/_StaleCleanupAutoSubmit.tsx
'use client';

import { useEffect, useRef } from 'react';
import { cleanupStaleEntry } from '@/lib/auth/picker/cleanupStaleEntry';

export function StaleCleanupAutoSubmit({
  slug, shareToken, showId, expectedEpoch, expectedCrewMemberId,
}: {
  slug: string;
  shareToken: string;
  showId: string;
  expectedEpoch: number;
  expectedCrewMemberId: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.requestSubmit();
  }, []);
  return (
    <form ref={ref} action={cleanupStaleEntry} className="sr-only">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="shareToken" value={shareToken} />
      <input type="hidden" name="showId" value={showId} />
      <input type="hidden" name="expectedEpoch" value={expectedEpoch} />
      <input type="hidden" name="expectedCrewMemberId" value={expectedCrewMemberId} />
    </form>
  );
}
```

Tests: (a) component mounts + auto-submits via useEffect; (b) form carries all 5 hidden inputs; (c) is the ONLY 'use client' component in the picker tree (static-grep test).

```bash
git commit -am "feat(ui): StaleCleanupAutoSubmit client component (R25; C3)"
```

---

### Task C4: Modify `_ShowBody.tsx` to render `<IdentityChip>` + "Not you?"

**Files:**
- Modify: `app/show/[slug]/[shareToken]/_ShowBody.tsx` (accept new prop)
- Create: `components/auth/IdentityChip.tsx`
- Test: `tests/components/IdentityChip.test.tsx`

```tsx
// components/auth/IdentityChip.tsx (Server Component)
import { clearIdentity } from '@/lib/auth/picker/clearIdentity';

export function IdentityChip({
  name, role, slug, shareToken, showId,
}: {
  name: string;
  role: string;
  slug: string;
  shareToken: string;
  showId: string;
}) {
  return (
    <div data-testid="identity-chip" className="flex flex-col items-end">
      <span className="text-[10px] font-semibold">{name} · {role}</span>
      <form action={clearIdentity}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="shareToken" value={shareToken} />
        <input type="hidden" name="showId" value={showId} />
        <button type="submit" className="text-[9px] text-(--accent) underline">Not you?</button>
      </form>
    </div>
  );
}
```

Test: tapping "Not you?" calls `clearIdentity` with the correct showId; assert no confirm dialog appears (R-no-confirm contract).

```bash
git commit -am "feat(ui): IdentityChip + ShowBody integration (C4)"
```

---

### Task C5: `<SignInOrSkipGate>` first-contact component (R41 §7.1a)

**Files:**
- Create: `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx`
- Test: `tests/components/sign-in-or-skip-gate.test.tsx` + Playwright at `tests/e2e/sign-in-or-skip-gate.spec.ts`

Pure Server Component rendered when `resolveShowPageAccess` returns `{ kind: 'no_auth', showId, reason }` AND the URL does NOT carry `?gate=skip`. **P-R28 Fix-2 (Finding 2): the gate has TWO modes** distinguished by the `reason` field (P-R27/P-R28 addition):

**Mode A — `reason: 'first_contact'`** (no Google session, no picker cookie entry). Classic first-visit gate. Layout per spec §7.1a:
- Brand strip + show identifier strip (same as picker chrome).
- **Primary CTA "Skip and pick your name"** — same-page navigation to current URL with `?gate=skip` appended (re-runs auth chain; falls through to picker render).
- **Secondary CTA "Sign in with Google"** — initiates OAuth flow with current tokenized URL as post-callback `next` destination.

**Mode B — `reason: 'google_mismatch'`** (P-R27 Fix-1 shared-device defense). Google session exists but email matches no crew row on this show. Layout:
- Brand strip + "Signed in as someone else" header strip.
- Crew-facing copy: "You're signed in with a Google account that isn't on this show's roster. Sign in with the account for this show, or continue as guest to pick from the roster." (catalog code `SIGN_IN_OR_SKIP_PROMPT_MISMATCH` — register in C0-pre).
- **Primary CTA "Sign in with a different account"** — **R41 P-R29 Fix-2**: link directly to `/api/auth/google/start?next=<encoded tokenized URL>` (NOT `/auth/sign-in?next=...`). The `/auth/sign-in` page short-circuits if the user is already signed in (which is EXACTLY the Mode-B state — they have a stale Google session that doesn't match the show roster), so pointing the CTA there would loop them back to the same gate. Going directly to the OAuth start route bypasses the sign-in page entirely. `/api/auth/google/start` already passes `queryParams: { prompt: 'select_account' }` (verified at `app/api/auth/google/start/route.ts:59`), so Google forces the account picker every time — the user can choose a different Google account. After OAuth callback, the new session lands back on the tokenized URL via the validated `next` parameter.
- **Secondary CTA "Continue as guest"** — **R41 P-R29 Fix-3**: POSTs to a NEW dedicated Server Action `clearIdentityAndSkip({ slug, shareToken, showId })` (extends Task B4 with a parallel exported function). The dedicated action clears the stale picker entry for THIS show AND issues a `redirect()` to `/show/<slug>/<shareToken>?gate=skip` from within the action itself (atomic clear-and-skip; no client-side navigation race). The plain `clearIdentity` exported in Task B4 stays unchanged — it only calls `revalidatePath()` and returns; it does NOT navigate. The new `clearIdentityAndSkip` re-uses `clearIdentityCore` under the hood for the cookie mutation, then appends a redirect throw. WITHOUT this dedicated action, the gate's POST flow either renders successfully (Mode B re-fires because no navigation) OR depends on client-side navigation that races with the cookie write — both unacceptable. **Additionally (P-R29 Fix-3 atomicity guard)**: in Task C1, the `gateSkip` early-render path MUST be gated on `result.reason !== 'google_mismatch'` — a hand-crafted `?gate=skip` query param on a `google_mismatch` no_auth response is REJECTED (gate re-renders); only the proper `clearIdentityAndSkip` POST can set the legitimate ?gate=skip continuation. This prevents bypass: an attacker who knows the URL pattern can't strip the Mode-B gate by appending `?gate=skip` manually — they'd see the gate re-render until they click Continue-as-guest, which runs through the cookie-clear action.

Props contract:
```ts
type Props = {
  slug: string;
  shareToken: string;
  showId: string;           // P-R28: required for clearIdentity wiring in Mode B
  reason: 'first_contact' | 'google_mismatch';
};
```

Tests assert: (a) Mode A — gate renders Skip + Sign-in CTAs; tap-Skip navigates with `?gate=skip`; tap-Sign-in initiates OAuth via `/auth/sign-in?next=<encoded URL>`; (b) Mode A — picker NOT pre-rendered behind gate; (c) **Mode B — P-R28 Fix-2 + P-R29 Fix-3 + P-R34 amendment**: gate renders "Signed in as someone else" header + the two Mode-B CTAs (NOT the Mode-A CTAs); the "Continue as guest" CTA has `<form action={clearIdentityAndSkip}>` (NOT `clearIdentity` — the atomic clear-and-skip Server Action per P-R29 Fix-3) with hidden inputs for `slug`, `shareToken`, `showId` matching the seeded test fixture; assert the response to the POST is an HTTP 30x with `Location: /show/<slug>/<shareToken>?gate=skip` (the action throws `redirect()` from `next/navigation` after running `clearIdentityCore`); the resulting cookie no longer contains the seeded stale entry; (c.1) **P-R34 atomicity-guard regression**: hand-craft a request to `/show/<slug>/<shareToken>?gate=skip` (with the same seeded stale cookie) WITHOUT POSTing through clearIdentityAndSkip first; assert the page route returns the Mode-B gate again (C1's `allowGateSkip` predicate rejects `?gate=skip` when `result.reason === 'google_mismatch'` per P-R29 Fix-3); the stale cookie is STILL present (no cleanup happened); (c.2) **P-R34 Mode-A test of base clearIdentity is unaffected**: `<IdentityChip>`'s "Not you?" form still uses `<form action={clearIdentity}>` (the base action that revalidates without redirecting) — separate Task B4 unit test covers that path. (d) **Mode B regression**: seed a picker cookie with Alice's entry for Show-X; render gate with `reason='google_mismatch'`; assert the rendered HTML does NOT contain Alice's name (gate is opaque to the cookie state — it doesn't read Alice's row data — so the only path to her identity was through step 4(e) fall-through, which P-R27 closed); (e) `SIGN_IN_OR_SKIP_PROMPT_MISMATCH` catalog code exists and is registered in `_metaAdminAlertCatalog.test.ts` (or the message-catalog equivalent for crew-facing copy).

```bash
git commit -m "feat(picker): SignInOrSkipGate first-contact component (C5; R41 §7.1a)"
```

### Task C5.5: Update `lib/auth/validateNextParam.ts` allowlist for tokenized show URLs (R41 P-R12 Fix-1)

**Files:**
- Modify: `lib/auth/validateNextParam.ts`
- Modify: `tests/auth/validateNextParam.test.ts` (extend)

**Why this task exists (P-R12 Fix-1):** The pre-pivot `ALLOWED_NEXT_RE = /^\/(show\/[a-z0-9-]+|admin(\/.*)?|me(\/.*)?)$/` at `lib/auth/validateNextParam.ts:16` accepts only the legacy slug-only `/show/<slug>` form. R41 makes every crew URL `/show/<slug>/<64hex-share-token>`; sign-in callback redirects, picker-bootstrap `next` validation, and `/me`-link clicks ALL pass tokenized URLs through `validateNextParamDetailed()`. WITHOUT this update, the helper rejects every R41 tokenized URL with code `OAUTH_REDIRECT_INVALID` and falls back to `DEFAULT_AUTH_NEXT_PATH` (`/admin`) — breaking the core R41 OAuth-recovery flow before any of B3/C6/C7 even run.

**Allowlist change:**

```ts
// lib/auth/validateNextParam.ts (post-pivot; P-R12 Fix-1)
// R41 P-R12 Fix-1: accept tokenized show URLs `/show/<slug>/<64hex>` for
// the share-token bearer-URL contract. Legacy slug-only `/show/<slug>`
// is REMOVED — pre-pivot signed-link M9.5 surfaces (e.g., `/show/<slug>/p`
// bootstrap surface) are dropped in Phase G; the only `/show/<slug>/...`
// shape callers should hit is `/show/<slug>/<64hex>`.
const ALLOWED_NEXT_RE = /^\/(show\/[a-z0-9-]+\/[0-9a-f]{64}|admin(\/.*)?|me(\/.*)?)$/;

// R41 P-R12 Fix-1: explicitly reject the legacy M9.5 bootstrap surface
// `/show/<slug>/p`. This regex was pre-pivot defensive; post-pivot the
// surface is deleted so a stale link rendering this URL is OBSOLETE.
// Keep the rejection for one more milestone in case a cached email
// link is still floating around. (Promote to deletion in M-cleanup.)
const BOOTSTRAP_SURFACE_RE = /^\/show\/[a-z0-9-]+\/p$/;
```

**Decision (P-R12 Fix-1):** the slug-only `/show/<slug>` form is REMOVED from the allowlist. R41's contract is that crew URLs ALWAYS carry the share-token; a slug-only URL hitting `validateNextParam` means either (a) a stale pre-pivot link (handled in Phase G cleanup) or (b) a hand-crafted URL bypassing the share-token contract. Either way, fall through to default → `/admin`.

**Tests** (extend `tests/auth/validateNextParam.test.ts`):
- (a) **R41 P-R12 Fix-1 happy path**: `validateNextParamDetailed('/show/sample-show/a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345')` → `{ ok: true, path: '/show/sample-show/...' }`. Hex must be exactly 64 chars (256-bit).
- (b) **R41 P-R12 Fix-1 reject too-short token**: `/show/sample-show/abc123` (6 hex chars) → `{ ok: false, code: 'OAUTH_REDIRECT_INVALID' }`.
- (c) **R41 P-R12 Fix-1 reject non-hex token**: `/show/sample-show/g1g2g3...` (g is not hex) → reject.
- (d) **R41 P-R12 Fix-1 reject uppercase hex**: `/show/sample-show/ABCDEF...` → reject (regex is `[0-9a-f]` only; share tokens are lowercase per A2 task contract).
- (e) **R41 P-R12 Fix-1 reject slug-only form**: `/show/sample-show` (no token) → reject. Pre-pivot this was accepted; assert it now rejects.
- (f) **R41 P-R12 Fix-1 reject legacy `/p` surface**: `/show/sample-show/p` → reject (the BOOTSTRAP_SURFACE_RE regex retained as defensive guard).
- (g) `/me` and `/admin` paths still accepted (regression assertion that R41 doesn't break the other allowed shapes).
- (h) **Cross-task coverage**: C5/C6/C7 tests that exercise OAuth sign-in callback + picker-bootstrap MUST construct `next` values that pass this helper. The C5/C6/C7 test fixtures use real tokenized URLs (not slug-only) so they exercise the new regex path end-to-end.

```bash
git add lib/auth/validateNextParam.ts tests/auth/validateNextParam.test.ts
git commit -m "feat(auth): validateNextParam accepts tokenized show URLs (C5.5; R41 P-R12 Fix-1)"
```

---

### Task C6: `/api/auth/picker-bootstrap` Route Handler (R41 §4.7)

**Files:**
- Create: `app/api/auth/picker-bootstrap/route.ts`
- Create: `lib/auth/picker/intentToken.ts` (HMAC sign/verify helpers)
- Test: `tests/auth/picker-bootstrap.test.ts`

Per spec §4.7 (R41-R6 / R41-R7 / R41-R24 / R41-R41). Flow:

1. Read `next` AND `t` (intent token) query params. Validate `next` against `validateNextParam.ts` allowlist regex `^/show/[a-z0-9-]+/[0-9a-f]{64}$`.
2. **Verify intent token** — format: `base64url(JSON({slug, shareToken, exp})) + '.' + base64url(HMAC-SHA256(payload, PICKER_COOKIE_SIGNING_KEY))`. Reject (403, NOT 302) on: missing `t`, malformed format, expired (`exp < now`), HMAC mismatch, OR embedded `{slug, shareToken}` not matching `next` URL's parsed values.
3. **R41 P-R22 Fix-1 — resolve `target_show_id` FIRST** (moved from step 5 ordering): the live `validateGoogleSession(req, { showId })` helper at `lib/auth/validateGoogleSession.ts:48` REQUIRES a `showId` context — its return-shape `GoogleSessionValidationResult` resolves to `{ kind: 'success', viewer: { email, showId, crewMemberId } }` only when the user has a crew_members row on the GIVEN show. Pre-P-R22 spec said `validateGoogleSession(req)` with no second arg; that would not typecheck against the live signature. Resolve target_show_id NOW via `serviceRole.rpc('resolve_show_by_slug_and_token', { p_slug, p_share_token })`. **R41 P-R23 Fix-2 + R41 P-R24 Fix-1 — three-way failure-path classification with PRE-SESSION alert code** (AGENTS.md invariant 9 destructure + try/catch):
   - **Thrown error** (network fault, schema drift, undeclared SDK exception) — caught by outer try/catch around the `.rpc(...)` call → fail-closed 502 with cataloged `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED` terminal HTML (uses the SAME crew-facing copy as PICKER_BOOTSTRAP_RPC_FAILED — "Couldn't sign you in. Please try again in a moment." — but a DIFFERENT operator code for triage) AND best-effort admin_alert emission. **R41 P-R24 Fix-1**: at this point there is NO `viewer.email` — `validateGoogleSession` hasn't run. The PICKER_BOOTSTRAP_RPC_FAILED context contract REQUIRES `attempted_email_hash` (H7 enforced); we cannot satisfy that here. So this branch uses a SEPARATE catalog code `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED` whose context shape is email-less: `{ stage: 'resolve_show', slug, rpc_error_code, rpc_error_message, route: '/api/auth/picker-bootstrap' }`. Note: NO `share_token` (sensitive bearer credential — never write to admin_alerts.context or logs); NO `share_token_hash` either (the share token is already a hex digest, and hashing again provides no security benefit while adding a duplicate identifier — the slug + alert occurrence_count is sufficient operator-triage context). Inner try/catch around the alert emission preserves the 502 if the alert itself fails.
   - **Returned error** (`{ data, error }` destructure surfaces `error !== null`) — same fail-closed 502 + `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED` alert as the thrown case. RPC returned-error is an infra signal, NOT a user/token signal.
   - **Returned `data: null` with no error** — the slug+shareToken pair does not match any live show (schema integrity bug post-intent-token, or concurrent rotation between intent-token mint at the page route and bootstrap arrival here). Return 403 with cataloged terminal HTML; do NOT emit ANY admin_alert (this is a user/token mismatch, not an infra failure — different operator-triage class). User retries by re-loading the page, which re-mints a fresh intent token.
4. `validateGoogleSession(req, { showId: target_show_id })` — the helper's three-arm result:
   - `terminal_failure` → render the cataloged terminal HTML with the carried code (no 302).
   - `continue` (no session) → 302 to `next` with NO cookie set. The user proceeds to the page; the resolver detects no Google session and renders either the picker (if they already have a picker selection cookie) OR the SignInOrSkipGate Mode A (first_contact).
   - `continue` (`GOOGLE_NO_CREW_MATCH`) → 302 to `next` with NO cookie set. **R41 P-R35 amendment**: the page route MUST return TERMINAL `no_auth` with `reason: 'google_mismatch'` per B7 step 4(e) — DOES NOT consume an existing picker cookie, DOES NOT render the picker. Rendering SignInOrSkipGate Mode B is the only acceptable response. This closes the shared-device identity-leak vector P-R27 patched: Bob's Google session + Alice's stale picker cookie MUST NOT resolve as Alice. The bootstrap's 302 here is just the "no mint" signal; the page route's step 4(e) catches the mismatch via re-running `validateGoogleSession` and returns the terminal arm.
   - `success` with `viewer: { email, showId, crewMemberId }` → continue to step 5. The email is canonicalized by the helper; use `viewer.email` directly (do NOT re-canonicalize).
5. Invoke `claim_oauth_identity(viewer.email)` via service-role client.
   - **RPC infra failure (R41-R7 fail-closed)**: return HTTP 502 with cataloged `PICKER_BOOTSTRAP_RPC_FAILED` terminal-failure HTML. NO 302 (would loop back). **ALSO emit `upsert_admin_alert(NULL show_id, 'PICKER_BOOTSTRAP_RPC_FAILED', jsonb_build_object('attempted_email_hash', hashForLog(canonicalEmail), 'rpc_error_code', error.code, 'rpc_error_message', error.message))` via the service-role client** — **R41 P-R9 Fix-2 (Finding 2)**: NEVER write the raw `canonicalEmail` to `admin_alerts.context` or structured logs. The repo's email-canonicalization audit (`lib/audit/emailCanonicalization.ts`) + cross-cutting PII guards forbid raw email in durable JSONB context. The `attempted_email_hash` field uses the same `hashForLog()` helper as C7 (R41-R19 ratified hashing); operators correlate hashes across alerts. Also emit a structured log line with the SAME hashed payload (no raw email anywhere). **R41 P-R21 Fix-1 (Finding 1) — alert emission MUST be inner-try-catch best-effort.** If the alert emission itself throws (rate limit, transient PostgREST 5xx, RLS misconfiguration during a degraded-dependencies window) the handler MUST STILL render the cataloged 502 terminal HTML — never bubble a framework 500. Without the inner guard, the original RPC failure is masked by the alert-emission failure and the user sees an uncataloged error instead of the fail-closed recovery page. Pattern matches B5/B6/C7 alert producers (P-R18 + P-R20 inner-catch contract). Implementation shape:

```ts
// Inside the R41-R7 fail-closed branch of app/api/auth/picker-bootstrap/route.ts:
try {
  await upsertAdminAlert({
    showId: null,
    code: 'PICKER_BOOTSTRAP_RPC_FAILED',
    context: {
      attempted_email_hash: hashForLog(canonicalEmail),
      rpc_error_code: error?.code ?? 'unknown',
      rpc_error_message: error?.message ?? 'unknown',
      route: '/api/auth/picker-bootstrap',
    },
  });
} catch (alertErr) {
  // Alert emission failed during a degraded-dependency event. Log
  // structured signal (hashed email only — no PII) and continue to
  // render the cataloged 502. The user MUST see the recovery page;
  // the alert miss is a degraded-observability tradeoff, not a
  // user-visible failure.
  logger.error('PICKER_BOOTSTRAP_RPC_FAILED alert emission failed', {
    emailHash: hashForLog(canonicalEmail),
    rpcErrorCode: error?.code ?? 'unknown',
    alertError: alertErr instanceof Error ? { name: alertErr.name, message: alertErr.message } : String(alertErr),
  });
}
return renderTerminalFailure502('PICKER_BOOTSTRAP_RPC_FAILED');
```

Tests assert: (a) HTTP 502 response; (b) `admin_alerts` row created with code `PICKER_BOOTSTRAP_RPC_FAILED`; (c) structured log emitted; (d) repeat invocations on the same canonical email produce the same `attempted_email_hash` AND increment `occurrence_count` (upsert helper handles unique-index conflict per R41-R19) — assert hash equality across two repeat invocations as the upsert-key proof; (e) **R41 P-R9 Fix-2 PII guard**: assert NO field in `admin_alerts.context` or the structured log line equals the raw canonical email (regex against the row + log payload); (f) **R41 P-R21 Fix-1 alert-emission failure regression**: mock `upsertAdminAlert` to throw `new Error('admin_alerts rate limited')`. Assert: response IS still HTTP 502 with the cataloged PICKER_BOOTSTRAP_RPC_FAILED terminal HTML body; NO `Set-Cookie: __Host-fxav_picker`; NO `Location` header (no 302); structured log captures the alert-emission failure with hashed email. The handler MUST NOT bubble a framework 500.
6. **One-show write contract (R41-R6)**: `target_show_id` was resolved in step 3; reuse that value. Find `result.shows` entry for `target_show_id` in the `claim_oauth_identity` return. If present: read request envelope; modify ONLY this show's entry to `{ id: crew_member_id, e: picker_epoch, t: result.mint_safe_t_millis }`; write via `cookies().set('__Host-fxav_picker', signEnvelope(envelope), PICKER_COOKIE_OPTIONS)`. If absent: write NO cookie.
7. 302 to `next`.

**CRITICAL DB-side timestamp source (R41-R24)**: cookie.t uses `result.mint_safe_t_millis` from the RPC return — NOT `Date.now()`, NOT `new Date()`, NOT `performance.now()`. The §10.1 meta-test grep-asserts no such JS-clock calls in this file.

Tests per spec §10.2: 8 CSRF cases (missing/malformed/HMAC-tampered/expired/slug-mismatch token → 403; no session → 302 no-cookie; valid → 302+cookie; CSRF simulation with `<img src=...>` → 403 + no claim_oauth_identity call); R41-R7 fail-closed test (RPC throws → 502 not 302); R41-R6 one-show-write test (entries for other shows byte-identical pre/post); R41-R25 exact-value assertion (stub returns `mint_safe_t_millis = 1737028800123`; assert cookie.t equals that exactly); **R41 P-R23 + P-R24 resolve_show_by_slug_and_token failure-classification tests**: (g) mock `serviceRole.rpc('resolve_show_by_slug_and_token', ...)` to THROW → response is 502 cataloged terminal HTML, **`PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED`** admin_alert emitted (P-R24 amendment: this is the PRE-SESSION code, distinct from PICKER_BOOTSTRAP_RPC_FAILED which is the POST-SESSION code carrying `attempted_email_hash`) with context `{ stage: 'resolve_show', slug, rpc_error_code, rpc_error_message, route }` — assert NO `user_email`/`attempted_email_hash`/`share_token` field present (email-less context contract); best-effort inner try/catch around the alert; NO Location header; NO Set-Cookie; (h) mock the RPC to return `{ data: null, error: { code: '500', message: '...' } }` → same 502 + PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED alert as (g) — returned-error is treated as infra fault; (i) mock the RPC to return `{ data: null, error: null }` → response is 403 cataloged terminal HTML, NO admin_alert emitted (this is a user/token mismatch, NOT infra fault — different operator-triage class), NO Set-Cookie; (j) **alert-emission failure during resolve_show RPC failure**: mock the RPC to throw AND mock upsertAdminAlert to throw → response IS still 502 (inner try/catch around alert emission preserves the recovery page).

```bash
git commit -m "feat(auth): picker-bootstrap Route Handler (C6; R41 §4.7 lazy-mint)"
```

### Task C7: `/auth/callback` claim-stamp hook (R41 §4.8)

**Files:**
- Modify: `app/auth/callback/route.ts`
- Test: `tests/auth/callback-claim-stamp.test.ts`

Per spec §4.8 (R41-R6 DB-only contract). AFTER `supabase.auth.exchangeCodeForSession()` succeeds:

```ts
import { canonicalize } from '@/lib/email/canonicalize';

// R41 P-R9 Fix-1 (Finding 1) + AGENTS.md invariant 9 (Supabase call-boundary
// discipline): wrap the entire claim-stamp block in try/catch AND destructure
// { data, error } for every Supabase call. Distinguish returned-error from
// thrown-error paths so transient network/runtime faults still let sign-in
// continue (bootstrap retries on next show visit per R41-R12). Without this,
// a Supabase client throw bubbles out as a framework 500 and the user is
// stranded mid-OAuth-callback.
try {
  const { data: userResult, error: getUserError } = await supabase.auth.getUser();
  if (getUserError) {
    logger.error('callback.getUser returned error', { error: getUserError });
    // Sign-in still proceeds; bootstrap retries on next visit.
  } else if (userResult.user?.email) {
    const canonicalEmail = canonicalize(userResult.user.email);  // R41-R16: canonicalize at boundary
    const { data: result, error: rpcError } = await serviceRole.rpc('claim_oauth_identity', { p_email: canonicalEmail });
    if (rpcError) {
      logger.error('claim_oauth_identity returned error', { emailHash: hashForLog(canonicalEmail), error: rpcError });
      // R41-R12: bootstrap will retry on next show visit; sign-in still proceeds.
    } else if ((result?.claimed_count ?? 0) > 0) {
      // R41 P-R8 Fix-3 (Finding 3): emit ONE admin_alert per claimed row with the
      // H7 context contract { crew_member_id, show_id, claimed_at_millis,
      // user_email_hash }, scoped to the show_id (not NULL). The aggregate-only
      // emission collapsed all identity-claim events into one alert, hiding
      // which show/crew rows were claimed and making operator triage
      // impossible. The upsert helper's (show_id, code) unique index means
      // re-claims on the same show increment occurrence_count rather than
      // spamming new rows.
      //
      // R41-R12 + R41-R19: claimed_rows is guaranteed-non-null by A8 (`'[]'::jsonb`
      // default) and the array contract is enforced by the A8 test matrix.
      const claimedRows: Array<{ crew_member_id: string; show_id: string; claimed_at_millis: number }>
        = result.claimed_rows ?? [];
      for (const row of claimedRows) {
        // R41 P-R13 Fix-2 — canonical helper signature: upsertAdminAlert
        // takes a single object { showId, code, context } per
        // lib/adminAlerts/upsertAdminAlert.ts.
        //
        // R41 P-R20 Fix-2 (Finding 2): wrap EACH per-row alert in its own
        // try/catch. Without this, if alert N throws (alert-infra failure,
        // PostgREST rate-limit, transient DB error), the loop aborts at N,
        // control jumps to the OUTER catch which emits
        // CALLBACK_CLAIM_THREW — misclassifying the failure (the claim
        // ITSELF succeeded; only the audit-emission failed) AND losing
        // every per-row alert for rows N+1..end. The audit trail becomes
        // partial exactly when an alert-infra failure is most worth
        // recording. Inner try/catch isolates each row's emission so
        // one failure doesn't poison the rest of the loop; the outer
        // catch is reserved for genuine claim-block failures.
        try {
          await upsertAdminAlert({
            showId: row.show_id,  // per-show alert (NOT NULL)
            code: 'OAUTH_IDENTITY_CLAIMED',
            context: {
              crew_member_id: row.crew_member_id,
              show_id: row.show_id,
              claimed_at_millis: row.claimed_at_millis,
              user_email_hash: hashForLog(canonicalEmail),  // avoid PII in alerts
            },
          });
        } catch (alertErr) {
          // Per-row alert emission failed. Log structured signal so
          // operators can correlate; continue to next row. We do NOT
          // re-classify as CALLBACK_CLAIM_THREW (the claim succeeded).
          // Log shape mirrors the outer catch — hashed email, error
          // name+message only, NO PII.
          logger.error('OAUTH_IDENTITY_CLAIMED per-row alert emission failed', {
            emailHash: hashForLog(canonicalEmail),
            showId: row.show_id,
            crewMemberId: row.crew_member_id,
            error: alertErr instanceof Error ? { name: alertErr.name, message: alertErr.message } : String(alertErr),
          });
        }
      }
    }
  }
} catch (err) {
  // R41 P-R9 Fix-1: thrown-error path (network fault, schema drift, undeclared
  // SDK exception). Log + swallow so the OAuth callback still redirects to
  // `next` and the user is signed in; picker-bootstrap retries the claim on
  // the next show visit per R41-R12. NEVER let an exception here strand the
  // user mid-callback. The structured log line is the operator's only
  // signal — make sure the error is captured (not just `.toString()`).
  logger.error('callback claim-stamp threw', {
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
  });
  // Optional admin_alert: emit CALLBACK_CLAIM_THREW with show_id=NULL,
  // context: { error_name } so persistent throws (not just returned errors)
  // are visible to operators. Cataloged via H7. Empty try-block fallback if
  // upsertAdminAlert itself throws: nested try/catch is acceptable here since
  // we're already in the catch arm of the outer claim block.
  try {
    await upsertAdminAlert({
      showId: null,
      code: 'CALLBACK_CLAIM_THREW',
      context: { error_name: err instanceof Error ? err.name : 'Unknown' },
    });
  } catch { /* alert emission can also fail; sign-in still proceeds */ }
}
// R41-R6: NO cookies().set('__Host-fxav_picker', ...) — callback is DB-stamp-only.
// The §10.1 meta-test grep-asserts this file does NOT contain that call.
```

Tests: (a) exchangeCodeForSession called first; (b) claim_oauth_identity called with canonicalized email; (c) NO Set-Cookie for `__Host-fxav_picker` in response (R41-R6); (d) **R41 P-R8 Fix-3**: when `claimed_rows.length = N > 0`, upsertAdminAlert called EXACTLY N times, once per row, with `show_id` set to the row's show_id (NOT NULL aggregate) and `context: { crew_member_id, show_id, claimed_at_millis, user_email_hash }` — assert the full context shape on each call; (e) idempotent re-invocation: re-sign-in returns `claimed_count=0` + `claimed_rows=[]`, ZERO upsertAdminAlert calls (no spam); (f) RPC failure path logs error and continues (sign-in still succeeds; bootstrap retries on next visit); (g) **R41 P-R8 Fix-3 cross-show**: seed Alice with crew_members in shows S1 and S2; assert ONE alert with `show_id=S1` and ONE alert with `show_id=S2`, NOT one aggregate alert with `show_id=NULL`; (h) **R41 P-R8 Fix-3 PII**: assert no alert context contains the raw email (only the hashed form); (i) **R41 P-R9 Fix-1 returned-error vs thrown-error matrix**: (i.1) `supabase.auth.getUser()` returns `{ data: { user: null }, error: { name: 'AuthError', ... } }` → callback redirects to `next`, no Set-Cookie, no claim_oauth_identity call, no upsertAdminAlert, structured log captured; (i.2) `supabase.auth.getUser()` THROWS (mock the client to throw 'fetch failed') → callback redirects to `next`, no claim_oauth_identity call, CALLBACK_CLAIM_THREW admin_alert emitted with show_id=null, structured log captured with error.name + error.message; (i.3) `serviceRole.rpc('claim_oauth_identity', ...)` returns `{ data: null, error: {...} }` → callback redirects, no upsertAdminAlert for OAUTH_IDENTITY_CLAIMED (existing test (f) covers this) but structured log emitted; (i.4) `serviceRole.rpc('claim_oauth_identity', ...)` THROWS → callback redirects, CALLBACK_CLAIM_THREW admin_alert emitted, structured log captured; (i.5) `upsertAdminAlert` inside the catch block itself throws → callback STILL redirects (nested catch swallows); (i.6) **H3 meta-contract**: register this file's getUser + rpc + upsertAdminAlert calls in `tests/auth/_metaInfraContract.test.ts` so the structural meta-test enforces the destructure pattern (cannot regress by removing the try/catch); (i.7) **R41 P-R20 Fix-2 partial-per-row-alert-failure isolation**: mock claim_oauth_identity to return claimed_rows with 3 entries. Mock upsertAdminAlert such that the SECOND call throws (`new Error('rate limited')`). Assert: alerts 1 and 3 ARE emitted (the loop continues past the row-2 failure); alert 2 is missed; CALLBACK_CLAIM_THREW is NOT emitted (the claim itself succeeded); the structured log records the per-row alert failure with hashed email + show_id + crew_member_id + error name/message; the callback STILL redirects to `next`.

```bash
git commit -m "feat(auth): callback claim-stamp hook (C7; R41 §4.8 DB-only)"
```

## Phase D: API route auth swaps

### D-pre: Show-id derivation contract for slug-based API routes (R12-F2)

**Files:** documentation-only — applies to D1, D2, D3, D4 implementations.

`resolvePickerSelection` takes `{ showId, cookie }`. The slug-based routes (`/api/show/[slug]/version`, `/api/realtime/subscriber-token` whose request body carries the show_id, `/api/report` similar) need a derivation step that maps the URL/body identifier to a `show_id` UUID BEFORE calling the resolver. The contract:

- **`/api/show/[slug]/version`**: `params.slug` arrives in the URL. The route does `SELECT id FROM shows WHERE slug = $1 LIMIT 1` to derive show_id. **R17-F1: unknown-slug returns 401, NOT 404**, so unauthenticated callers cannot distinguish "real private show slug" from "non-existent slug" without possessing the share-token (which they don't present to this endpoint). The route's response matrix collapses unknown-slug + invalid-cookie + no-cookie all into 401. Only authenticated callers (valid picker cookie OR admin session) get to the 200/410/500 paths. DB infra fault → 500. (The page route at `/show/<slug>/<shareToken>` still uses 404 for unknown-slug because the share-token is required to reach it; the leak only applies to slug-only API routes.)
- **`/api/realtime/subscriber-token`**: same posture per R13-F2 — body carries `{ slug }`; route does SELECT id FROM shows WHERE slug to derive show_id. **R17-F1: unknown-slug → 401**, same rationale.
- **`/api/realtime/subscriber-token`** (duplicate kept-in-sync section, see above): body `{ slug }` → SELECT id; **R17-F1: missing slug → 401** (not 404). Do NOT change body shape.
- **`/api/asset/{diagram,reel,agenda}/[show]/...`**: `params.show` is the show UUID per R34. No derivation needed.
- **`/api/report`**: request body carries `show_id`.

Per route, the show_id derivation step + its error handling (**401 for unknown slug** per R17-F1 — slug-only API routes MUST NOT leak slug existence to unauthenticated callers; 500 for infra fault) is the first thing the route does, BEFORE calling `resolvePickerSelection`. Each route's test matrix asserts: (a) the derivation step's outcome maps cleanly to the cataloged response codes; (b) **a slug not in `shows` returns 401 from the derivation step** (collapsed with invalid-cookie + no-cookie into one 401 response so existence cannot be distinguished). The earlier "404 from the derivation step" wording was a self-contradiction with the R17-F1 bullets above and is replaced by this 401 rule. The page route at `/show/<slug>/<shareToken>` still uses 404 for unknown-slug (the share-token is the credential gate there, so 404 is not a slug-existence oracle).

### Task D1: Subscriber-token route — swap to picker cookie

**Files:**
- Modify: `app/api/realtime/subscriber-token/route.ts`
- Test: `tests/api/subscriber-token.auth.test.ts`

**Test matrix per §10.2 stale-credential mapping:**

```ts
describe('/api/realtime/subscriber-token', () => {
  it('valid picker cookie → 200 with { jwt, exp }', async () => { /* assert response.jwt; role: "authenticated"; viewer_kind: "crew" */ });
  it('valid admin Google session → 200 with viewer_kind: "admin"', async () => { /* ... */ });
  it('no cookie → 401', async () => { /* ... */ });
  it('forged unsigned cookie → 401 (R36)', async () => { /* ... */ });
  it('epoch_stale cookie → 401 (R12)', async () => { /* ... */ });
  it('removed_from_roster cookie → 401', async () => { /* ... */ });
  it('show_unavailable (archived) → 410 with PICKER_SHOW_UNAVAILABLE', async () => { /* ... */ });
  it('infra_error → 500', async () => { /* ... */ });
  it('NO crew_link / crew_google substring in the minted JWT (regression)', async () => { /* ... */ });
});
```

Modify the route to call `resolvePickerSelection` for the crew arm + `isAdminSession` for admin. Drop the existing `validateLinkSession` call.

```bash
git commit -am "feat(api): subscriber-token auth swap to picker cookie (D1)"
```

---

### Task D2: Version route — swap + 401-before-RPC contract (R4)

**Files:**
- Modify: `app/api/show/[slug]/version/route.ts`
- Test: `tests/api/version.auth.test.ts`

Same matrix as D1 but the auth check MUST run BEFORE `viewer_version_token` RPC invocation (R4 contract).

```bash
git commit -am "feat(api): version route auth swap + 401-before-RPC (D2)"
```

---

### Task D3: Asset routes — diagram, reel, agenda

**Files:**
- Modify: `app/api/asset/diagram/[show]/[rev]/[key]/route.ts`
- Modify: `app/api/asset/reel/[show]/route.ts`
- Modify: `app/api/asset/agenda/[show]/[id]/route.ts`
- Test: `tests/api/asset.*.auth.test.ts` (one file per route)

For each route, replace `validateCrewAssetSession` with `resolvePickerSelection`. Show UUID is in the URL `[show]` param. Same 401/410/500 matrix.

```bash
git commit -am "feat(api): asset routes auth swap to picker cookie (D3)"
```

---

### Task D3.5: Update `ShowRealtimeBridge` to handle 410 as terminal auth loss (R11-F1)

**Files:**
- Modify: `components/realtime/ShowRealtimeBridge.tsx`
- Test: `tests/components/ShowRealtimeBridge.test.tsx` (extend)

The pre-pivot bridge treats 401/403 as `forceRefresh` and other non-OK responses as transient. The pivot introduces 410 (show_unavailable) on subscriber-token + version + asset routes. An open tab whose show gets archived would get 410 on the next renewal/version probe; without an explicit 410 handler, the tab keeps rendering stale state.

```ts
// In ShowRealtimeBridge's response-status handler:
if (res.status === 401 || res.status === 403 || res.status === 410) {
  // R11-F1: 410 = show_unavailable (archived). Same recovery as
  // auth-denied — router.refresh() drives the Server Component
  // through the resolver, which renders notFound() for archived.
  router.refresh();
  return;
}
```

Tests: (a) 401 from version → forceRefresh (existing); (b) 410 from version → forceRefresh (new regression); (c) 410 from subscriber-token → forceRefresh + bridge does not retry-loop on 410.

```bash
git commit -am "feat(realtime): bridge handles 410 as terminal auth loss (R11-F1; D3.5)"
```

### Task D4: Report route — remove `validateGoogleSession` + `validateLinkSession` arms

**Files:**
- Modify: `app/api/report/route.ts`
- Test: `tests/api/report.auth.test.ts`

Route accepts: (a) picker cookie + matching show_id in body, OR (b) `isAdminSession`. Non-admin Google session → 401 (R14 regression test).

```bash
git commit -am "feat(api): report route auth swap (drop link/google crew arms; D4)"
```

---

### Task D4.5: API picker-cookie identity-consistency check (R41 P-R29 Fix-1 CRITICAL — shared-device API defense)

**Files:**
- Modify: `lib/auth/picker/resolvePickerSelection.ts` (extend the resolver to perform the consistency check)
- Modify: `tests/auth/picker/resolvePickerSelection.test.ts` (cover the new arm)
- Modify: `tests/cross-cutting/picker-resolver-callsite-contract.test.ts` (allowlist `auth_email_canonical` import in resolvePickerSelection ONLY; ban it everywhere else in `app/api/**`)

**The vulnerability (P-R29 Fix-1)**: P-R27 closed the shared-device identity leak on the PAGE route by making step 4(e) terminal `no_auth`. But the API routes (D1/D2/D3/D4) use cookie-only `resolvePickerSelection` and have NO awareness of the active Google session. A direct API request with `__Host-fxav_picker` (carrying Alice's signed entry) AND a Supabase session for Bob still authorizes as Alice — Bob can fetch Alice's subscriber-token, show version, asset URLs, etc. The page-route fix alone is insufficient.

**The fix — P-R30 Fix-1 (CRITICAL repair of P-R29 design flaw): resolver receives TWO clients.** The pre-P-R29 resolvePickerSelection used `createSupabaseServiceRoleClient()` (line 65 of this file) — service-role clients have NO JWT, so `auth.jwt()` returns NULL inside the DB, so `auth_email_canonical()` ALWAYS returns NULL, so the consistency check ALWAYS skips → defeats the entire CRITICAL fix. The P-R30 amendment changes the resolver contract:

```ts
// lib/auth/picker/resolvePickerSelection.ts (post-D4.5 + P-R30 Fix-1)
import {
  createSupabaseServerClient,         // cookie-bound (carries the request's JWT)
  createSupabaseServiceRoleClient,    // service-role (carries no JWT; needed for the cookie-path DB reads that bypass RLS)
} from '@/lib/supabase/server';

export async function resolvePickerSelection(input: ResolvePickerInput): Promise<ResolvePickerResult> {
  // Service-role client for the cookie-path DB reads (existing contract).
  const serviceRole = createSupabaseServiceRoleClient();

  // P-R30 Fix-1 + P-R31 Fix-1 (FAIL-CLOSED): ALSO construct the cookie-bound
  // client. AGENTS.md invariant 9 requires explicit { data, error }
  // destructure AND try/catch around every Supabase call boundary. If ANY
  // boundary fails — auth client construction throws, auth_email_canonical
  // returns an error, the crew_members lookup returns/throws an error —
  // return `infra_error` (NOT `resolved`). Failing open here would defeat
  // the CRITICAL shared-device fix.
  let sessionEmail: string | null = null;
  try {
    const authClient = await createSupabaseServerClient();
    const { data, error } = await authClient.rpc('auth_email_canonical');
    if (error) {
      return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
    }
    sessionEmail = typeof data === 'string' ? data : null;
  } catch {
    return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }

  // ... existing cookie-path resolution against serviceRole ...

  if (sessionEmail) {
    // A Supabase session IS active. The cookie's crew_members row email MUST
    // match the session's canonical email — otherwise this is a shared-device
    // identity-mismatch attack (Bob's session + Alice's cookie).
    let rowEmail: string | null = null;
    try {
      const { data, error } = await serviceRole
        .from('crew_members')
        .select('email')
        .eq('id', cookieEntry.id)
        .single();
      if (error) {
        return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
      }
      rowEmail = typeof data?.email === 'string' ? data.email : null;
    } catch {
      return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
    }
    if (rowEmail !== sessionEmail) {
      // Includes the null case (rowEmail null but sessionEmail present):
      // the cookie's crew row has no email (data integrity issue) but the
      // session does — STILL a mismatch; fail closed.
      return {
        kind: 'identity_invalidated',
        expectedEpoch: cookieEntry.e,
        expectedCrewMemberId: cookieEntry.id,
        reason: 'session_mismatch',
      };
    }
  }
  // (When sessionEmail is null — anonymous request — the cookie path
  // proceeds normally; the cookie is the sole credential.)
}
```

**Why this doesn't violate the §10.1 no-jwt-surface ban on API routes**: the API consumers still don't import `validateGoogleSession`. Only the cookie resolver itself constructs the cookie-bound client to read `auth_email_canonical()` (a CHEAP `auth.jwt() ->> 'email'` canonicalization with no crew_members table read of its own). The §10.1 guard's existing exemption pattern already permits resolvePickerSelection to perform the email-consistency check internally; D4.5 + P-R30 Fix-1 make that contract explicit.

**Test (a) is now an INTEGRATION test (P-R30 Fix-1 addition)**: use a real request-bound test harness (Playwright or supertest with Supabase auth-cookie injection) where Bob's session is set in the cookie store BEFORE the API consumer call. Mock the resolvePickerSelection-internal `createSupabaseServerClient` to verify it's called (not service-role) for the auth.rpc call. Assert `auth_email_canonical()` returns Bob's canonical email (NOT null) inside the resolver and the consistency check fires. Without this integration test, a unit test with a mocked service-role client could pass while the production resolver is still inert.

**Tests**:
- (a) **R41 P-R29 Fix-1 + P-R31 Fix-2 CRITICAL shared-device API regression**: seed picker cookie with Alice's entry for Show-X (Alice has real crew_members row, cookie is signed correctly). Construct request with Supabase session for Bob (canonical email differs from Alice's). For EACH of the 6 API consumers: assert response is **HTTP 410** (NOT 401, NOT 200 — per spec §6.1 API-consumer behavior on session_mismatch: 410 maps to stale-but-knowable, distinct from 401 auth-missing). Assert NO Alice data in response body. Without the fix, all 6 consumers return 200 with Alice's data. Use a real request-bound integration harness (Playwright or supertest with Supabase auth-cookie injection) so the cookie-bound `createSupabaseServerClient()` inside the resolver receives Bob's actual JWT — NOT a mocked `null` session.
- (b) **Anonymous request happy path**: same Alice cookie, NO Supabase session. All 6 consumers return 200 with Alice's data (cookie is sole credential; the mismatch check is skipped when `auth_email_canonical()` returns null).
- (c) **Session-matches-cookie happy path**: Alice's cookie + Alice's Supabase session. All 6 consumers return 200 (consistency check passes — `rowEmail === sessionEmail`).
- (d) Resolver-level unit test: assert the new `kind: 'identity_invalidated', reason: 'session_mismatch'` arm is returned when cookie+session mismatch.
- (e) Structural test: assert `auth_email_canonical` IS imported in `lib/auth/picker/resolvePickerSelection.ts` AND is NOT imported anywhere else in `app/api/**` or `app/**` (allowlist of exactly one importer).
- (f) **R41 P-R31 Fix-1 fail-closed regressions** (AGENTS.md invariant 9): for each Supabase boundary in the consistency check, simulate both returned-error AND thrown-error paths:
  - (f.1) `createSupabaseServerClient()` THROWS → resolver returns `infra_error/PICKER_RESOLVER_LOOKUP_FAILED`; all 6 API consumers return 500. NO 200 (fail closed).
  - (f.2) `authClient.rpc('auth_email_canonical')` returns `{ data: null, error: {...} }` → resolver returns `infra_error`; all 6 consumers return 500. NO 200.
  - (f.3) `authClient.rpc(...)` THROWS → resolver returns `infra_error`; all 6 consumers return 500. NO 200.
  - (f.4) `serviceRole.from('crew_members').select('email').single()` returns `{ data: null, error: {...} }` → resolver returns `infra_error`; all 6 consumers return 500. NO 200.
  - (f.5) The same row-email lookup THROWS → resolver returns `infra_error`; all 6 consumers return 500. NO 200.
  - **The CRITICAL contract this set pins**: a degraded-dependencies window MUST NOT silently fall through to "cookie path resolves as Alice." Every Supabase error path returns `infra_error`, NEVER `resolved`. Without test (f), a hand-written impl could destructure `{ data }` without `error` and silently fail-open.
- (g) **R41 P-R31 Fix-1 rowEmail-null defense**: seed a cookie referencing a `crew_members.id` whose `email` IS NULL (legitimate data state — pre-pivot rows from an early sync). Construct a request with a Supabase session. Assert resolver returns `identity_invalidated/session_mismatch` (NOT `resolved`) — the `rowEmail !== sessionEmail` check catches `null !== 'someone@example.com'` as a mismatch, which is correct fail-closed behavior (session present but cookie's identity has no email to verify against).

```bash
git commit -am "feat(auth): API shared-device identity-consistency check (D4.5; P-R29 Fix-1 CRITICAL)"
```

---

### Task D5: Cross-cutting API Google-session-without-cookie rejection matrix (R41-R1 Fix-3 regression)

**Files:**
- Create: `tests/api/_apiGoogleSessionRejectsWithoutCookie.test.ts`
- Modify: `tests/cross-cutting/picker-resolver-callsite-contract.test.ts` (extension)

Per spec §10.2 R41-R1 Fix-3: every API consumer in §6 (`/api/realtime/subscriber-token`, `/api/asset/diagram`, `/api/asset/reel`, `/api/asset/agenda`, `/api/show/[slug]/version`, `/api/report`) MUST return 401 when given a valid Google session whose email matches a `crew_members` row on the target show but NO `__Host-fxav_picker` cookie. The Google-session-auto-resolve path is RESTRICTED to `resolveShowPageAccess` (page-route helper); API consumers use cookie-only `resolvePickerSelection`.

Tests:
- For EACH of the 6 API consumers: construct request with valid Google session + matching crew row + no picker cookie. Assert status === 401. If any flips to 200, an unintended Google-session arm has been reintroduced.
- Structural guard (extend the existing picker-resolver-callsite-contract test): grep the SIX §6 API consumer source files (`/api/realtime/subscriber-token`, `/api/asset/diagram`, `/api/asset/reel`, `/api/asset/agenda`, `/api/show/[slug]/version`, `/api/report`). Assert `validateGoogleSession` is NOT imported in those six. **Important allowlist note**: `app/api/auth/picker-bootstrap/route.ts` IS allowed to import `validateGoogleSession` per the spec §10.1 no-jwt-surface structural allowlist (the bootstrap handler legitimately needs the Google session to lazy-mint the picker cookie). The guard targets DATA APIs only, not the auth bootstrap handler. Also assert `resolveShowPageAccess` is NOT imported anywhere in `app/api/**` (it's page-route-only per R41-R1 Fix-3 allowlist — the only legal importer is `app/show/[slug]/[shareToken]/page.tsx`).

```bash
git commit -am "test(api): Google-session-without-cookie rejection matrix (D5; R41-R1)"
```

---

## Phase E: Auth chain modifications

### Task E1: Update `lib/auth/resolveShowViewer.ts` — drop `crew_link` + `crew_google` arms

**Files:**
- Modify: `lib/auth/resolveShowViewer.ts`
- Test: `tests/auth/resolveShowViewer.test.ts`

Per Resolved Decision 15: the `ShowViewer` union arms `crew_link` and `crew_google` are removed; the chain becomes `isAdminSession` then... actually with `/show/<slug>/<shareToken>/page.tsx` calling `resolvePickerSelection` directly, `resolveShowViewer` is largely dead for the crew page. Keep it ONLY for `/api/show/[slug]/version` and similar — wait, those now call `resolvePickerSelection` directly per D1/D2. So `resolveShowViewer` may itself be removable.

Decision: **delete `lib/auth/resolveShowViewer.ts` entirely** if no remaining callers exist post-D1–D4. Verify via repo-grep.

```bash
git commit -am "refactor(auth): drop resolveShowViewer.ts (no callers post-pivot; E1)"
```

---

### Task E2: ~~Scrub `/me` from auth chain redirects~~ — **OBSOLETE PER R41**

**Status: REVERSED.** This task was authored when `/me` was being deleted (pre-R41). R41 Resolved Decisions 15-17 RESTORE `/me` as the OAuth cross-show discovery surface for signed-in crew. `/me` STAYS in `validateNextParam.ts` allowlist, in sign-in already-signed-in short-circuit, in callback redirect, in `google/start` redirectTo, and in `/auth/clear-session` allowed targets. `lib/messages/catalog.ts` retains `/me` references.

**Instead of E2, the implementer's job is to PRESERVE the existing `/me` paths AND rewrite `app/me/page.tsx` + `lib/data/listShowsForCrew.ts` to emit tokenized URLs via the new `my_share_tokens_for_email()` RPC (Task A9).** See spec §6 routing table + §10.2 `/me preserved with tokenized URLs` test bullet for the canonical contract.

**Files (rewrite, not delete):**
- Modify: `app/me/page.tsx` — replace existing listShowsForCrew SQL with a call to `my_share_tokens_for_email()` via the **request-bound `createSupabaseServerClient()` (cookie-bound auth client)**, NOT the service-role client. The RPC is `SECURITY DEFINER` with `GRANT EXECUTE TO authenticated` and reads `public.auth_email_canonical()` internally — service-role calls have NO `auth.email()` context, so the function would return an empty set (or permission-denied) when called via service-role. Cookie-bound client carries the signed-in user's JWT so `auth_email_canonical()` resolves correctly. Render entries as `/show/<slug>/<share-token>` tokenized URLs.
- Modify: `lib/data/listShowsForCrew.ts` — rewrite to accept a Supabase client argument (typed as the cookie-bound variant) and call `.rpc('my_share_tokens_for_email')`. Caller (`app/me/page.tsx`) constructs the cookie-bound client and passes it in. **Negative test**: invoke `listShowsForCrew(serviceRoleClient)` and assert it FAILS or returns empty — the function MUST not silently succeed against service-role.
- Test: `tests/app/me.test.ts` — assert tokenized URL output; mixed-case email regression (R41-R19); cross-user enumeration negative test.
- Verify: `lib/auth/validateNextParam.ts` allowlist regex STILL accepts `/me` (R41 — do NOT remove).

**Preservation allowlist (no `/me` scrub; pre-R41 grep-and-rewrite step removed):**
- `/me` route exists at `app/me/page.tsx` (rewritten per R41-R19).
- `/me` allowed in `validateNextParam.ts` allowlist.
- `/me` allowed in sign-in already-signed-in short-circuit destination, callback redirect, google/start redirectTo, clear-session allowed targets.
- `/me` allowed in `lib/messages/catalog.ts` OAuth-error user-facing copy.

H2 no-jwt-surface meta-test does NOT ban `/me` URL literals (per R41 — see H2 task). It bans M9.5 JWT/link surfaces only.

```bash
git commit -am "feat(me): rewrite app/me to render tokenized URLs (R41 preservation; E2)"
```

---

## Phase F: Admin UI

### Task F1: Simplify `PerShowCrewSection.tsx` (drop M9.5 buttons)

**Files:**
- Modify: `components/admin/PerShowCrewSection.tsx`
- Test: `tests/components/PerShowCrewSection.test.tsx` (existing — update)

Remove `<IssueLinkButton>` + `<RevokeAllLinksButton>` per-row controls + section-level Revoke-all. Keep Preview-as-crew links.

```bash
git commit -am "refactor(admin): simplify PerShowCrewSection (drop M9.5 controls; F1)"
```

---

### Task F2: Add `<ResetPickerEpochButton>` admin component

**Files:**
- Create: `app/admin/show/[slug]/ResetPickerEpochButton.tsx`
- Test: `tests/components/ResetPickerEpochButton.test.tsx`

Button + confirm dialog with count-free copy (R27). Wraps `resetPickerEpoch` Server Action. On success: toast "Picker selections reset."

```bash
git commit -am "feat(admin): Reset Picker Epoch button (F2)"
```

---

### Task F2.5: Add `<CurrentShareLinkPanel>` admin component (R13-F1)

**Files:**
- Create: `app/admin/show/[slug]/CurrentShareLinkPanel.tsx`
- Create: `lib/data/loadShowShareToken.ts` (admin-only read path; SECURITY DEFINER RPC `admin_read_share_token(p_show_id uuid) returns text` + JS helper)
- Create: `supabase/migrations/20260523000010_admin_read_share_token.sql` (the read RPC)
- Test: `tests/components/CurrentShareLinkPanel.test.tsx`

The pivot makes `show_share_tokens` private (REVOKE ALL from anon/authenticated) so it's not directly SELECTable. Admin UI needs a read path to display the current share URL so Doug can copy and share. Without this, after migration the share URL exists in the DB but nowhere in the UI — Doug has no way to obtain it short of querying the DB directly.

**R41 P-R17 Fix-2 — cookie-bound caller contract (Finding 2).** `public.is_admin()` reads `auth.jwt()->>'app_metadata'->>'role'` from the session JWT. **Service-role clients have no JWT** (service-role keys bypass RLS but `auth.jwt()` returns NULL), so `public.is_admin()` evaluates `false` for service-role callers. If `loadShowShareToken` constructs a service-role client (the common admin-data-loader anti-pattern in this codebase), the RPC silently returns NULL and Doug's `<CurrentShareLinkPanel>` renders empty — he can't obtain the share URL. This is the same trust-boundary lesson the plan already documents for `/me` (Task E2 uses `createSupabaseServerClient()` not `serviceRole`).

**Required call-site shape:**

```ts
// lib/data/loadShowShareToken.ts (admin-only read path)
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';

export async function loadShowShareToken(showId: string): Promise<string | null> {
  // Gate: admin-only surface (also enforced by admin_read_share_token's
  // in-RPC is_admin() check, but redundancy here gives a clean typed
  // error before the round-trip).
  await requireAdmin();

  // R41 P-R17 Fix-2: cookie-bound client carries the admin's JWT so
  // `public.is_admin()` resolves true inside the SECURITY DEFINER RPC.
  // Service-role would bypass RLS but evaluate `auth.jwt()` as NULL,
  // making is_admin() return false → RPC returns NULL → component
  // renders empty share URL. The cookie-bound client is the ONLY
  // legal caller of this RPC.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_read_share_token', { p_show_id: showId });
  if (error) {
    // AGENTS.md invariant 9: distinguish returned-error from thrown-error.
    // Caller (the panel) renders a terminal-failure HTML hint.
    throw new Error(`admin_read_share_token failed: ${error.message ?? String(error)}`);
  }
  return typeof data === 'string' ? data : null;
}
```

**SQL:**
```sql
-- supabase/migrations/20260523000010_admin_read_share_token.sql
create or replace function public.admin_read_share_token(p_show_id uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case when public.is_admin() then t.share_token else null end
    from public.show_share_tokens t
   where t.show_id = p_show_id
   limit 1
$$;
revoke all on function public.admin_read_share_token(uuid) from public;
-- R41 P-R17 Fix-2: GRANT to `authenticated` ONLY (NOT service_role). The
-- service_role bypasses RLS but `auth.jwt()` returns NULL under it, so
-- `public.is_admin()` evaluates false and the RPC returns NULL anyway.
-- Removing the service_role grant prevents a future caller from mistakenly
-- using serviceRole.rpc() and silently getting NULL; the grant is the
-- structural defense against the anti-pattern.
grant execute on function public.admin_read_share_token(uuid) to authenticated;
```

**Component:** displays the canonical share URL `https://crew.fxav.show/show/<slug>/<token>` (or the env-configured origin) with a Copy button. Updates after Rotate (via revalidate). Tests: (a) loads token + renders URL; (b) non-admin → no token (RPC returns null → component renders an error state); (c) post-rotate URL reflects the new token; (d) **R41 P-R17 Fix-2 service-role regression**: invoke `loadShowShareToken` with a service-role-constructed client (test stash). Assert it fails — either at the helper boundary (cookie-bound client construction) OR at the RPC (service_role no longer in the grant list → permission-denied). EITHER failure mode is acceptable; the contract is "service-role MUST NOT succeed." (e) **R41 P-R17 Fix-2 cookie-bound happy path**: invoke with the canonical cookie-bound admin client; assert returns the live share token.

```bash
git commit -am "feat(admin): CurrentShareLinkPanel + admin_read_share_token RPC (R13-F1; F2.5)"
```

### Task F3: Add `<RotateShareTokenButton>` admin component (R39)

**Files:**
- Create: `app/admin/show/[slug]/RotateShareTokenButton.tsx`
- Test: `tests/components/RotateShareTokenButton.test.tsx`

Button + confirm dialog (warns the URL will change). On success: display the new URL `https://crew.fxav.show/show/<slug>/<new-token>` with a copy affordance.

```bash
git commit -am "feat(admin): Rotate Share Token button (R39; F3)"
```

---

### Task F4: Mount the two new buttons on `app/admin/show/[slug]/page.tsx`

```bash
git commit -am "feat(admin): mount Reset + Rotate buttons on per-show panel (F4)"
```

---

## Phase G: Cleanup (delete M9.5 surfaces)

> **R6-F1 ordering constraint (CRITICAL):** the cutover migration in Task G2 drops `crew_member_auth` and `link_sessions`. Existing source paths still write to / read from those tables. Dropping them while the source still depends on them would break sync, apply, unpublish, and the admin per-show panel on first use post-migration. Phase G0 lands the source refactors BEFORE Phase G1/G2 drops the files and tables. Each G0 task is independently committable and individually verifiable; Phase G2 (table DROPs) cannot start until ALL G0 tasks are merged.

### Task G0a: Refactor `lib/sync/runScheduledCronSync.ts` — remove `crew_member_auth` writes

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (delete the `from('crew_member_auth')` insert/upsert paths added in M5/M9.5)
- Test: existing `tests/sync/*.test.ts` (update fixtures + assertions)

The sync engine previously provisioned per-crew-member `crew_member_auth` rows on every Phase-2 commit (initial `current_token_version = 1` insert). Post-pivot, no such row exists — picker identity is cookie-only; the table is dropped. Remove the insert + any subsequent UPDATE the sync engine performs on this table. Verify no other sync helpers reference the table.

```bash
git commit -am "refactor(sync): remove crew_member_auth provisioning (G0a)"
```

### Task G0b: Refactor `lib/sync/applyStaged.ts` — remove `crew_member_auth` updates

Same pattern. Apply-staged commits previously updated `crew_member_auth.last_changed_at` on `role_flags` mutations; that contribution to `viewer_version_token` is replaced by the existing `crew_members.last_changed_at` term per A6.

```bash
git commit -am "refactor(sync): remove crew_member_auth updates from applyStaged (G0b)"
```

### Task G0c: Refactor `lib/sync/unpublishShow.ts` — remove `crew_member_auth` + `link_sessions` cleanup

Per spec §4.10, `unpublishShow` previously deleted `link_sessions` rows on unpublish (to revoke active sessions for that show). With both tables dropped, the cleanup is moot.

```bash
git commit -am "refactor(sync): remove link_sessions/crew_member_auth cleanup from unpublishShow (G0c)"
```

### Task G0d: Delete or refactor `lib/data/loadShowCrewWithAuth.ts` + its consumers

`loadShowCrewWithAuth.ts` joins `crew_members` with `crew_member_auth` to surface JWT-version state in the admin per-show panel. Post-pivot the panel's per-row "Issue/Revoke" affordances are deleted (Phase F1), so the helper has no remaining purpose. Options:
- (a) Delete the file. Admin per-show data loader becomes a simple `crew_members` SELECT.
- (b) Rename to `loadShowCrew.ts`, drop the auth join.

The implementer picks (a) if the helper has no other call sites; (b) if some non-pivot caller still uses the role-flag join logic. Verify via `rg -n loadShowCrewWithAuth` first.

```bash
git commit -am "refactor(data): drop loadShowCrewWithAuth (or rename to loadShowCrew); G0d"
```

### Task G0e0: Refactor `app/auth/sign-out/route.ts` — drop validateLinkSession import (R15-F1)

**Files:**
- Modify: `app/auth/sign-out/route.ts`
- Test: `tests/api/sign-out.test.ts` (extend)

Pre-pivot, sign-out imports `deleteSession` from `lib/auth/validateLinkSession.ts` (line 9) and calls it (line 127) to remove the `link_sessions` row. Post-pivot:
- `link_sessions` table is dropped (G2).
- `__Host-fxav_session` cookie is also gone (replaced by `__Host-fxav_picker`).
- Sign-out's job is now to clear BOTH (a) the Supabase Auth session via `supabase.auth.signOut()` AND (b) **the `__Host-fxav_picker` cookie with `Max-Age=0` (R41-R41 credential-lifetime fix).** R41 made the picker cookie a derived credential of the signed-in user (`/api/auth/picker-bootstrap` mints it from the OAuth-matched crew row), so leaving it alive after sign-out leaks identity to the next user on a shared device.

**R41 P-R10 Fix-2 (Finding 2) — preservation contract.** The pre-pivot `app/auth/sign-out/route.ts` is hardened in three ways that MUST be preserved across the R41 rewrite, NOT dropped:

1. **Same-origin gate** (R22 F2 / R15 #1; pre-pivot at `app/auth/sign-out/route.ts:79-89`): `isSameOriginRequest(request)` checks `Sec-Fetch-Site` header (accepts `same-origin` or `none`); falls back to `Origin` header equality with the request's URL origin. Cross-site form POSTs are refused with 403 BEFORE any state mutation. WITHOUT this gate, R41 makes the regression worse: a malicious `<form action="https://fxav-prod/auth/sign-out" method="POST">` on an attacker page can log the user out AND clear their picker credential, then trigger a re-bootstrap that locks them out of their session — or worse, force a state where the next visitor on a shared device inherits the prior user's identity if the picker clear races the redirect.
2. **Try/catch around `supabase.auth.signOut()`** (pre-pivot at `:142-160`) — distinguishes returned-error (`{ error }`) from thrown-error (network fault) per AGENTS.md invariant 9 (Supabase call-boundary discipline). On either failure path, the route returns the `teardownFailureHtml()` page (a server-rendered no-raw-error-codes HTML with a retry button posting back to `/auth/sign-out`), NOT a JSON document — preserves the no-raw-error-codes UI invariant (5).
3. **Teardown-failure HTML response** (pre-pivot at `:24-65`) — preserves cookies on partial failure so the user can retry from the same auth context. R10 #2 fail-loud contract: the user sees the catalog-message copy via `messageFor()`, not a raw error code.

```ts
// app/auth/sign-out/route.ts (post-pivot; R41-R41 picker cookie clear; P-R10
// Fix-2 preservation contract — same-origin gate + try/catch + teardown HTML
// all KEPT from the pre-pivot route. The R41 rewrite ONLY (a) removes the
// M9.5 deleteSession() import + call (link_sessions table is dropped in this
// pivot per Phase G), (b) adds the __Host-fxav_picker Max-Age=0 clear at the
// success path. Same-origin gate, try/catch, teardownFailureHtml all stay.)

import { NextRequest, NextResponse } from 'next/server';
import { clearBootstrapCookie, clearSessionCookie, SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { messageFor } from '@/lib/messages/lookup';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// teardownFailureHtml() — UNCHANGED from pre-pivot (lines 24-65). Renders
// the no-raw-error-codes failure HTML with a retry button. Body omitted
// here for brevity; the post-pivot route preserves it verbatim.
function teardownFailureHtml(): string { /* unchanged */ return ''; }

// isSameOriginRequest() — UNCHANGED from pre-pivot (lines 79-89). Sec-Fetch-Site
// preferred; falls back to Origin header equality. Returns false for cross-site
// form POSTs.
function isSameOriginRequest(request: NextRequest): boolean { /* unchanged */ return false; }

export async function POST(request: NextRequest): Promise<Response> {
  // R22 F2 / R15 #1 PRESERVED: same-origin gate before any mutation. A
  // cross-site POST returns 403 without touching cookies or Supabase.
  // P-R10 Fix-2 RATIONALE: R41 makes the picker cookie a derived OAuth
  // credential — a CSRF sign-out without this gate clears it cross-site
  // and creates a re-bootstrap window that can leak identity on shared
  // devices.
  if (!isSameOriginRequest(request)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const supabase = await createSupabaseServerClient();

  // AGENTS.md invariant 9 PRESERVED: explicit { error } destructure AND
  // outer try/catch for thrown faults. signOut can BOTH return an error
  // (returned-error path) AND throw (network fault / runtime exception).
  // Both paths route to teardownFailureHtml() — picker cookie is NOT
  // cleared on failure (cookies preserved per R10 #2 fail-loud contract;
  // user can retry from the same auth context).
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('signOut: Supabase signOut returned error', error);
      return new NextResponse(teardownFailureHtml(), {
        status: 500,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
  } catch (err) {
    console.error('signOut: Supabase signOut threw', err);
    return new NextResponse(teardownFailureHtml(), {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // Success path: redirect to / AND clear (a) the legacy session cookie,
  // (b) the bootstrap cookie, (c) the R41-R41 __Host-fxav_picker cookie.
  //
  // R41-R41 CRITICAL: clear __Host-fxav_picker with Max-Age=0. The picker
  // cookie is a derived credential of the signed-in user (minted via
  // /api/auth/picker-bootstrap from the OAuth-matched crew row) — leaving
  // it alive after sign-out leaks show identity to the next user on a
  // shared browser. R41-R41 added /auth/sign-out as the FIFTH legal
  // picker-cookie mutator surface (uniquely writes Max-Age=0; every
  // other mutator extends the TTL).
  //
  // R41 P-R11 Fix-1: build the redirect URL from `request.url` (the same
  // origin that just passed the same-origin gate), NOT from
  // `process.env.NEXT_PUBLIC_SITE_ORIGIN`. If that env var is unset or
  // malformed, `new URL('/', undefined)` throws AFTER supabase.auth.signOut()
  // has already succeeded but BEFORE the cookie clears — exactly the
  // partial-teardown state this section says it preserves against. The
  // request.url form mirrors the pre-pivot route's redirect construction
  // and is guaranteed-valid because the request already parsed it.
  const response = NextResponse.redirect(
    new URL('/', request.url),
    { status: 302 }
  );
  clearSessionCookie(response.cookies);  // legacy SESSION_COOKIE
  clearBootstrapCookie(response.cookies);  // legacy bootstrap cookie
  response.cookies.set('__Host-fxav_picker', '', {
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });

  // R41 P-R10 Fix-2: NOTE the M9.5 `deleteSession(envelope.token)` call is
  // REMOVED in this rewrite — link_sessions table is dropped in Phase G.
  // The pre-pivot route had a parallel try/catch around deleteSession;
  // removing it is the only Supabase-call-boundary REMOVAL in this rewrite.
  // All other boundaries (signOut returned/thrown) are preserved.
  return response;
}

export function GET() {
  return new NextResponse(null, { status: 405 });
}
```

Tests (per spec §10.2 R41-R41 regression + P-R10 Fix-2 preservation):
- (a) POST clears Supabase Auth session AND emits `Set-Cookie: __Host-fxav_picker=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`.
- (b) GET returns 405.
- (c) Post-rewrite, `validateLinkSession` is no longer imported anywhere in `app/**`.
- (d) **R41-R41 shared-device regression**: fixture: user signs in → bootstrap mints picker cookie → user POSTs sign-out → simulated follow-up GET to `/show/<slug>/<token>` with NO cookies attached. Assert: the page renders `<SignInOrSkipGate>` (NOT `_ShowBody`); API consumers return 401. **Without R41-R41 fix**: the picker cookie survives sign-out and the follow-up renders as the previous user — leak.
- (e) §10.1 `_metaPickerCookieContract.test.ts` lists `app/auth/sign-out/route.ts` in the cookie-mutator allowlist (as the fifth surface, alongside 3 Server Actions + picker-bootstrap).
- (f) **R41 P-R10 Fix-2 PRESERVATION — same-origin gate (R22 F2)**: cross-site POST (Sec-Fetch-Site: cross-site, Origin: https://attacker.example) returns 403 with NO Supabase signOut call, NO cookie clearing, NO mutation. Stash both Sec-Fetch-Site AND Origin variants of the cross-site form POST to assert the gate accepts the falling-back-to-Origin path. Without this gate, an attacker form can force sign-out + picker-cookie clear cross-site.
- (g) **R41 P-R10 Fix-2 PRESERVATION — signOut returned-error**: mock `supabase.auth.signOut()` to return `{ error: { message: 'rate limited' } }`. Assert: HTTP 500, `content-type: text/html`, body contains the messageFor('ADMIN_SESSION_LOOKUP_FAILED') copy AND a retry form `<form method="POST" action="/auth/sign-out">`. NO picker cookie clearing (cookies preserved for retry per R10 #2). NO 302 redirect (the failure HTML is the response).
- (h) **R41 P-R10 Fix-2 PRESERVATION — signOut thrown-error**: mock `supabase.auth.signOut()` to throw `new TypeError('fetch failed')`. Same assertions as (g) — HTTP 500 HTML, no cookie clearing, no redirect.
- (i) **R41 P-R10 Fix-2 PRESERVATION — H3 meta-registry**: register the new file's signOut + cookie calls in `tests/auth/_metaInfraContract.test.ts` so the same-origin gate, try/catch, and { error } destructure CANNOT regress.
- (j) **R41 P-R11 Fix-1 — partial-teardown regression**: run the sign-out POST with `process.env.NEXT_PUBLIC_SITE_ORIGIN` UNSET. Assert: HTTP 302 with `Location` derived from `request.url`'s origin (not undefined/malformed), Supabase signOut WAS called, and `__Host-fxav_picker` IS cleared (Max-Age=0 header present). The pre-Fix-1 code threw on `new URL('/', undefined)` AFTER signOut succeeded but BEFORE the cookie clear — leaving Supabase auth gone but picker cookie alive, the exact leak R41-R41 prevents. Also run with NEXT_PUBLIC_SITE_ORIGIN set to a malformed value (`'not-a-url'`) — assert the redirect is still well-formed from request.url, no throw.

```bash
git commit -am "refactor(auth): sign-out no longer imports validateLinkSession (R15-F1; G0e0)"
```

### Task G0e1: Refactor audit/lib references (R8-F2)

**Files:**
- Modify or delete: `lib/audit/trustDomains.ts` (references the old auth-domain model — `link_sessions`, `crew_member_auth`)
- Modify: `lib/audit/authChain.ts` (still encodes the M9.5 chain ordering)
- Modify: `lib/audit/authPrimitives.ts` (lists `link_sessions`, `__Host-fxav_session` as registered subjects)
- Regenerate: `lib/audit/email-boundaries.generated.ts` (referenced banned identifiers via emitted output)

**R41 P-R13 Fix-1 (Finding 1): `lib/me/partitionMeShows.ts` is PRESERVED.** This file was scheduled for deletion in the pre-pivot G0e1 because the original plan deleted `/me`. R41 Resolved Decisions 15–17 RESTORE `/me` as the OAuth cross-show discovery surface; `app/me/page.tsx` imports `partitionMeShows`, `PartitionedMeShows`, and `PartitionedMeShow` from this helper (see `app/me/page.tsx:50-53`). The helper is pure-logic display partition; nothing inside it touches the M9.5 auth surfaces banned by the H2 meta-test (no `link_sessions`, no `crew_member_auth`, no `validateLinkSession`). It STAYS.

The helper's only R41-aware concern is that its `CrewShowSummary` import (`import type { CrewShowSummary } from "@/lib/data/listShowsForCrew"`) follows whatever shape Task E2 + Task A9 settle on. Task E2 rewrites `listShowsForCrew` to call `my_share_tokens_for_email()`, which returns `(slug: text, share_token: text)` rows. The `CrewShowSummary` type MUST be extended (in `lib/data/listShowsForCrew.ts`) to carry `share_token: string` so `app/me/page.tsx` can build the tokenized `/show/<slug>/<share_token>` URL each row renders. `partitionMeShows.ts` itself is opaque to that field — it just passes the row through.

**Per-task verification (G0e1):** before committing this task, `pnpm tsc --noEmit` MUST succeed with `app/me/page.tsx` still importing `partitionMeShows`. If the H2 grep below surfaces ANY match inside `lib/me/partitionMeShows.ts`, REPORT it as a class-sweep finding rather than silently rewriting the file — there should be zero matches, the file is pure partition logic.

Per the pre-cutover dry-run gate (G0e), the H2 no-jwt-surface meta-test MUST pass with zero banned-identifier matches across these audit/lib files. The implementer's grep before this task (note `lib/me` is INCLUDED to verify zero matches in partitionMeShows.ts, not to mark it for deletion):

```bash
rg -n "(crew_member_auth|link_sessions|bootstrap_nonces|revoked_links|validateLinkSession|validateCrewAssetSession|crew_link|crew_google|__Host-fxav_session)" lib/audit lib/me
```

(Note `listShowsForCrew` is REMOVED from this grep pattern — it's the legitimately-allowed helper symbol per H2 allowlist. The pre-pivot pattern incorrectly banned it.)

Each match → either delete the surrounding scaffolding or rewrite it to reference the new picker surfaces (e.g., `__Host-fxav_picker`, `show_share_tokens`, `select_identity_atomic`).

```bash
git commit -am "refactor(audit): purge M9.5 references from audit + me helpers (G0e1)"
```

### Task G0e: Verification — pre-cutover no-jwt-surface dry-run

> **R15-F2 ordering correction**: Task H2 (`tests/cross-cutting/no-jwt-surface.test.ts`) is the gate test referenced here. H2 was originally scheduled in Phase H (after Phase G), which would prevent this dry-run from working. **Move H2 to land BEFORE G0e** — the test file is created early (right after Phase B, before Phase G work starts) so the dry-run gate exists when G0e runs. The H2 test passes once all G0a–G0e1 refactors land. Re-sequenced phase order: A → B → H2 (only; other H tasks stay in Phase H) → C → D → E → F → G0a–G0e1 → G0e (dry-run) → G1 → G2 → G3 → remaining H tasks → I.

Before applying the G2 migration, run the H2 meta-test (no-jwt-surface) against the working tree EXCLUDING migrations. It MUST pass: zero references to `crew_member_auth`, `link_sessions`, `bootstrap_nonces`, `revoked_links`, `validateLinkSession`, etc. in `app/**`, `lib/**`, `components/**`, `middleware.ts`. If anything still references those identifiers, add a G0f/G0g/... task to fix it BEFORE the cutover.

```bash
# Verification command (implementer runs this before G2):
pnpm vitest run tests/cross-cutting/no-jwt-surface.test.ts
# Expected: PASS. If FAIL, do NOT proceed to G2 — add G0 tasks for each match.
```

### Task G1: Delete JWT/redeem-link/bootstrap surface files

**Files (deletions):**
- `app/api/auth/redeem-link/` (entire directory)
- `app/show/[slug]/p/` (entire directory — fragment-bootstrap)
- `app/admin/show/[slug]/IssueLinkButton.tsx`
- `app/admin/show/[slug]/RevokeAllLinksButton.tsx`
- `lib/auth/validateLinkSession.ts`
- ~~`lib/auth/validateGoogleSession.ts`~~ — **R41 amendment: PRESERVED.** Used by `resolveShowPageAccess`, `/auth/callback` claim-stamp hook, `/api/auth/picker-bootstrap`, `/me`. Allowlisted in §10.1 no-jwt-surface meta-test.
- `lib/auth/validateCrewAssetSession.ts`
- `lib/auth/jwt.ts`
- `lib/auth/bootstrapCookie.ts`
- ~~`lib/data/listShowsForCrew.ts`~~ — **R41 amendment: PRESERVED + REWRITTEN.** Per Task E2 / Task A9: rewrite to wrap `my_share_tokens_for_email()` RPC and emit tokenized URLs.
- ~~`app/me/` (entire directory)~~ — **R41 amendment: PRESERVED + REWRITTEN.** `/me` is the cross-show discovery surface for signed-in crew (Decision 15). Page rewritten to render tokenized URLs.
- `app/api/me/` (if exists)
- The leaked-link compromise-event handler in `middleware.ts` (file becomes no-op or is deleted)

```bash
git rm -r app/api/auth/redeem-link/ app/show/[slug]/p/ \
  app/admin/show/[slug]/IssueLinkButton.tsx \
  app/admin/show/[slug]/RevokeAllLinksButton.tsx \
  lib/auth/validateLinkSession.ts \
  lib/auth/validateCrewAssetSession.ts \
  lib/auth/jwt.ts \
  lib/auth/bootstrapCookie.ts
# NOTE (R41): validateGoogleSession.ts, listShowsForCrew.ts, app/me/ are
# all PRESERVED and rewritten per the R41 amendments. Do NOT git-rm them.
# middleware.ts: edit to no-op or delete
git commit -m "refactor: delete M9.5 JWT/link surfaces; preserve R41 OAuth+/me (G1)"
```

---

### Task G2: Cutover migration — DROP M9.5 tables + RPCs

**Files:**
- Create: `supabase/migrations/20260523000099_cutover_drop_m9_5.sql` (the cutover migration, timestamp greater than all phase-A migrations)
- Modify: `lib/messages/catalog.ts` (delete all M9.5-era code entries)
- Modify: `lib/messages/__generated__/spec-codes.ts` (regenerate from catalog)

**Implementer-action requirement (R1-F3 + R5-F1):** before writing this migration, the implementer MUST run a grep-derived inventory of every M9.5 function/trigger/policy/grant the migration needs to drop. Use BOTH a broad name-match grep AND a body-content grep so renamed-but-related helpers aren't missed:

```bash
# Implementer pre-check (do NOT skip — R5-F1 broadened):
# 1. Functions whose NAME references M9.5 tables/concepts:
rg -n "create (or replace )?function public\.[a-z_]*(link_session|leaked_link|issue_new_link|revoke_all_link|recheck_link_session|bootstrap_nonce|crew_member_auth)" supabase/migrations

# 2. Functions whose BODY references any of the dropped tables (catches helpers
#    with neutral names that operate on the dropped tables):
rg -nU "create (or replace )?function[\s\S]{0,8000}?(crew_member_auth|link_sessions|bootstrap_nonces|revoked_links)" supabase/migrations

# 3. Triggers, policies, grants:
rg -n "create policy.*on public\.(crew_member_auth|link_sessions|bootstrap_nonces|revoked_links)" supabase/migrations
rg -n "create trigger.*on public\.(crew_member_auth|link_sessions|bootstrap_nonces|revoked_links)" supabase/migrations
rg -n "grant .*on (function|table) public\.[a-z_]*(link_session|leaked_link|issue_new_link|revoke_all|recheck_link_session|bootstrap_nonce|crew_member_auth|link_sessions|revoked_links)" supabase/migrations
```

Each matched item gets a paired `DROP FUNCTION/TRIGGER/POLICY IF EXISTS` line (with EXACT current signature — pre-check signatures with `\df+ public.<fn>` in psql before writing the DROP). The migration also asserts post-application no legacy entry points remain via the test in Task G3 below (broadened in R5-F1 to scan function bodies for any of the dropped table identifiers).

**Current known M9.5 RPC inventory (NON-EXHAUSTIVE — grep is canonical):**
- `mint_link_session_if_active_kid_matches` (signature per `supabase/migrations/20260505000001_redeem_link_locked_rpcs.sql` — verify before drop)
- `revoke_leaked_link_atomic(uuid, text, int, text)` and the `_advisory_lock` variant
- `revoke_all_links_rpc(uuid, text)`
- `issue_new_link_rpc(uuid, text)`
- `recheck_link_session_mint_auth_state(uuid, text, int)`
- `consume_bootstrap_nonce_atomic`, `mint_bootstrap_nonce_atomic`, `cleanup_bootstrap_nonces` (any name matching `bootstrap_nonce*`)

The implementer's grep-derived list MUST cover at least these eight categories; gaps are caught by Task G3.

**R7-F2 + R10-F1 STRICT REQUIREMENT**: the scaffold below is illustrative ONLY. Function signatures shown are likely WRONG against the live schema. Before writing the migration, the implementer MUST query `pg_proc` directly and generate the exact DROP list. **A pre-apply test gate (added below) FAILS if the migration contains any `drop table public.<jwt-era-table>` line without a paired non-commented `drop function` block for every M9.5 RPC the migration is supposed to drop.** This makes the table drop structurally dependent on the function drops:

```sql
-- Run this against the dev DB FIRST. Copy the output verbatim into the migration:
select
  'drop function if exists ' ||
  n.nspname || '.' || p.proname || '(' ||
  pg_get_function_identity_arguments(p.oid) ||
  ');' as drop_stmt
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ~ '(link_session|leaked_link|issue_new_link|revoke_all_link|recheck_link_session|bootstrap_nonce)'
    or pg_get_functiondef(p.oid) ~ '(crew_member_auth|link_sessions|bootstrap_nonces|revoked_links)'
  );
```

The output paste replaces the illustrative drops below. The illustrative drops are intentionally LEFT INCORRECT so the implementer cannot copy them verbatim — they MUST regenerate from live schema.

```sql
-- supabase/migrations/20260523000099_cutover_drop_m9_5.sql
-- THE CUTOVER MIGRATION. References to crew_member_auth /
-- link_sessions / bootstrap_nonces / revoked_links / current_token_version
-- / etc. are EXPECTED in this file and are exempted from the
-- no-jwt-surface meta-test (per R13 CUTOVER_MIGRATION_TIMESTAMP).

-- ⚠ ILLUSTRATIVE — signatures below DO NOT match live schema. Run the
-- pg_proc query above and REPLACE this block with the verbatim output
-- BEFORE applying. The G3 verification test will catch a mismatch
-- post-application.

-- Functions (illustrative; regenerate from pg_proc):
-- drop function if exists public.mint_link_session_if_active_kid_matches(<actual sig>);
-- drop function if exists public.revoke_leaked_link_atomic(<actual sig>);
-- drop function if exists public.revoke_leaked_link_atomic_advisory_lock(<actual sig>);
-- drop function if exists public.revoke_all_links_rpc(<actual sig>);
-- drop function if exists public.issue_new_link_rpc(<actual sig>);
-- drop function if exists public.recheck_link_session_mint_auth_state(<actual sig>);
-- drop function if exists public.consume_bootstrap_nonce_atomic(<actual sig>);
-- drop function if exists public.mint_bootstrap_nonce_atomic(<actual sig>);
-- drop function if exists public.cleanup_bootstrap_nonces(<actual sig>);

-- Triggers (also regenerate via pg_trigger query for completeness):
drop trigger if exists crew_member_auth_publish_invalidation on public.crew_member_auth;
drop trigger if exists crew_member_auth_publish_invalidation_insert on public.crew_member_auth;
drop trigger if exists crew_member_auth_bump_last_changed_at on public.crew_member_auth;

-- Tables (CASCADE drops dependent indexes/policies/grants):
drop table if exists public.link_sessions cascade;
drop table if exists public.bootstrap_nonces cascade;
drop table if exists public.revoked_links cascade;
drop table if exists public.crew_member_auth cascade;
```

> **R12-F1 task ordering**: G2-pre's gate test reads the cutover migration file; G3's post-cutover schema test asserts the post-application state. Each commit must be green on a clean checkout, so the order is: **G2-write-migration (commits the migration file with the pre-apply gate test in the SAME commit; gate test passes against the committed migration; migration is NOT yet applied)** → **G2-apply (applies the migration; G3 schema test passes)** → **G3-verify (commits the post-apply verification suite that asserts cleanly applied state)**. The G2-pre task description below documents the gate-test contract; the actual commit happens in G2-write-migration alongside the migration file.

### Task G2-pre: Pre-apply cutover-migration gate test (R10-F1)

**Files:**
- Create: `tests/db/cutover-migration-gate.test.ts`

This test runs BEFORE the cutover migration applies (in the same CI/test command). It reads the cutover migration file and asserts:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('cutover migration gate (R10-F1)', () => {
  const path = 'supabase/migrations/20260523000099_cutover_drop_m9_5.sql';
  const sql = fs.readFileSync(path, 'utf8');

  it('drops the M9.5 tables', () => {
    expect(sql).toMatch(/drop table if exists public\.link_sessions/);
    expect(sql).toMatch(/drop table if exists public\.bootstrap_nonces/);
    expect(sql).toMatch(/drop table if exists public\.revoked_links/);
    expect(sql).toMatch(/drop table if exists public\.crew_member_auth/);
  });

  it('drops every required M9.5 RPC family BEFORE the table drops', () => {
    // Required RPC name patterns (broadened beyond R7-F2 scaffold).
    const required = [
      /drop function if exists public\.mint_link_session/i,
      /drop function if exists public\.revoke_leaked_link/i,
      /drop function if exists public\.revoke_all_link/i,
      /drop function if exists public\.issue_new_link/i,
      /drop function if exists public\.recheck_link_session/i,
      /drop function if exists public\.consume_bootstrap_nonce/i,
      /drop function if exists public\.mint_bootstrap_nonce/i,
      /drop function if exists public\.cleanup_bootstrap_nonces/i,
    ];
    for (const re of required) {
      expect(sql, `Missing required DROP for ${re}`).toMatch(re);
    }
  });

  it('every required DROP FUNCTION is NOT in a comment line', () => {
    const required = [
      'mint_link_session', 'revoke_leaked_link', 'revoke_all_link',
      'issue_new_link', 'recheck_link_session',
      'consume_bootstrap_nonce', 'mint_bootstrap_nonce', 'cleanup_bootstrap_nonces',
    ];
    const lines = sql.split('\n');
    for (const name of required) {
      const live = lines.find((l) => /^\s*drop function/i.test(l) && l.includes(name));
      expect(live, `${name} DROP FUNCTION must NOT be commented out`).toBeDefined();
    }
  });
});
```

The CI command order MUST be: this gate test → apply migration → G3 post-application verification. If the gate fails, the migration does NOT apply.

**R14-F1 commit-ordering correction**: do NOT commit the gate test standalone (it would FAIL because the migration file doesn't exist yet on a clean checkout). The gate test commits in the SAME commit as the migration file at G2 below. The G2-pre task description here documents the gate-test CONTRACT; the actual commit is part of G2.

### Task G3: Post-cutover schema verification test

**Files:**
- Create: `tests/db/cutover-schema-clean.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

describe('post-cutover schema is clean of M9.5 surface (R1-F3)', () => {
  it('no link_sessions / bootstrap_nonces / revoked_links / crew_member_auth tables remain', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase.rpc('exec_sql', {
      sql: `select table_name from information_schema.tables
              where table_schema = 'public'
                and table_name in ('link_sessions','bootstrap_nonces','revoked_links','crew_member_auth')`,
    });
    expect(data ?? []).toHaveLength(0);
  });

  it('no M9.5 RPC functions remain (broadened R5-F1: name + body scan)', async () => {
    const supabase = createSupabaseServiceRoleClient();
    // Name-pattern check: catches all M9.5 RPC name conventions including bootstrap helpers.
    const { data: byName } = await supabase.rpc('exec_sql', {
      sql: `select proname from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and proname ~ '(link_session|leaked_link|revoke_all_link|issue_new_link|recheck_link_session|bootstrap_nonce|crew_member_auth)'`,
    });
    expect(byName ?? []).toHaveLength(0);

    // Body-content check: catches helpers with neutral names that still
    // reference the dropped tables. pg_get_functiondef returns the
    // complete source.
    const { data: byBody } = await supabase.rpc('exec_sql', {
      sql: `select p.proname
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and pg_get_functiondef(p.oid) ~ '(crew_member_auth|link_sessions|bootstrap_nonces|revoked_links)'`,
    });
    expect(byBody ?? []).toHaveLength(0);
  });

  it('no executable grants remain on M9.5 functions for non-service roles', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase.rpc('exec_sql', {
      sql: `select routine_name from information_schema.routine_privileges
              where routine_schema = 'public'
                and grantee in ('anon','authenticated')
                and routine_name ~ '(link_session|leaked_link|issue_new_link|revoke_all_links)'`,
    });
    expect(data ?? []).toHaveLength(0);
  });
});
```

**R14-F1 commit-ordering correction**: G3's verification test cannot pass on a clean checkout BEFORE the cutover migration applies. The test commits as part of the SAME G2-apply commit where the migration applies. The G3 task here documents the test CONTRACT; the actual commit is part of G2-apply.

```bash
git add supabase/migrations/20260523000099_cutover_drop_m9_5.sql lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts
git commit -m "feat(db): cutover migration — drop M9.5 tables/RPCs (G2)"
```

---

## Phase H: Meta-tests + cross-cutting

### Task H1: `tests/auth/_metaPickerCookieContract.test.ts`

Asserts: name = `__Host-fxav_picker`; v=1 strict; HMAC required; decoder null on shape failures; encoder/decoder are the only producers; `MAX_COOKIE_VALUE_BYTES === 3800`; constant cannot exceed 3900 without `// browser-cap-implication-acknowledged` paired comment.

```bash
git commit -am "test(meta): picker cookie contract meta-test (H1)"
```

---

### Task H2: `tests/cross-cutting/no-jwt-surface.test.ts`

Banned-identifier audit per §10.1. Reads `CUTOVER_MIGRATION_TIMESTAMP` constant; allows the banned identifiers ONLY inside the cutover migration file in DROP/REVOKE contexts; bans them in `app/**`, `lib/**`, `components/**`, `middleware.ts`, and post-cutover migrations.

**R41-R19 STRUCTURAL ALLOWLIST (NOT broad ban):**
- `validateGoogleSession` imports ALLOWED in: `lib/auth/validateGoogleSession.ts` (module), `lib/auth/picker/resolveShowPageAccess.ts`, `app/auth/callback/route.ts`, `app/api/auth/picker-bootstrap/route.ts`, `app/me/page.tsx`, AND test directory. Imports in any OTHER production file fail the audit.
- `listShowsForCrew` substring ALLOWED in: `lib/data/listShowsForCrew.ts` (module) and `app/me/page.tsx` only.
- `/me` URL-literals ALLOWED in production (the route is preserved per R41); do NOT ban.

R41 reverses the R14/R15 wholesale ban; the structural allowlist preserves the no-extra-credentials invariant while permitting the targeted crew-identity-as-OAuth path.

```bash
git commit -am "test(meta): no-jwt-surface structural allowlist (H2; R41-R19)"
```

---

### Task H3: Extend `tests/auth/_metaInfraContract.test.ts`

Register the picker helpers AND every new R41 auth/RPC surface (per AGENTS.md invariant 9 / R41-R3-onward Supabase call-boundary discipline):

- `resolvePickerSelection` (Task B2)
- `selectIdentity` (Task B3)
- `clearIdentity` (Task B4)
- `cleanupStaleEntry` (Task B5)
- `resetPickerEpoch` (Task B6)
- `rotateShareToken` (Task B6)
- **R41 additions:**
  - `resolveShowPageAccess` (Task B7) — performs SELECTs against `shows`, `crew_members`, `show_share_tokens`; multiple Supabase call sites; must destructure `{data, error}` and surface infra faults as `{ kind: 'infra_error', code }` per its 11-arm union (NOT as silent fall-through).
  - `app/api/auth/picker-bootstrap/route.ts` (Task C6) — has TWO distinct Supabase RPC boundaries that BOTH must be registered per AGENTS.md invariant 9:
    - **Step 3 — `resolve_show_by_slug_and_token` (pre-session)**: must destructure `{data, error}` + outer try/catch around the `.rpc(...)` call; thrown OR returned-error → 502 cataloged terminal HTML + best-effort `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED` admin_alert with email-less context `{ stage: 'resolve_show', slug, rpc_error_code, rpc_error_message, route }`; `data: null` with no error → 403 cataloged terminal HTML, NO admin_alert (user/token mismatch class, not infra fault).
    - **Step 4 — `claim_oauth_identity` (post-session)**: must destructure `{data, error}` + outer try/catch; thrown OR returned-error → 502 + best-effort `PICKER_BOOTSTRAP_RPC_FAILED` admin_alert with `attempted_email_hash` (R41-R7 fail-closed).
    - H3 meta-test asserts BOTH boundaries by name; a future regression that adds a third RPC without registry coverage fails CI. Inner-try-catch around each upsertAdminAlert call (P-R21 + P-R24 best-effort contract).
  - `app/auth/callback/route.ts` (Task C7) — calls `claim_oauth_identity` RPC; must destructure `{data, error}` and log + skip cookie mint on failure (R41-R6 callback-fail recovery via picker-bootstrap retry).
  - `lib/data/listShowsForCrew.ts` rewrite (Task E2) — calls `my_share_tokens_for_email` RPC via cookie-bound client; must destructure `{data, error}` and surface infra fault to the page-route render path.

Each registry entry asserts the call site destructures `{data, error}` (not bare `data`), distinguishes returned-error from thrown-error paths, and infra faults surface as discriminable typed results. New call sites EITHER add a registry row OR carry an inline `// not-subject-to-meta: <reason>` comment per AGENTS.md invariant 9.

```bash
git commit -am "test(meta): extend infra contract for picker + R41 auth surfaces (H3)"
```

---

### Task H4: Extend `tests/auth/advisoryLockRpcDeadlock.test.ts`

Assert: `reset_picker_epoch_atomic` AND `rotate_show_share_token` are the ONLY writers of `shows.picker_epoch` + `shows.picker_epoch_bumped_at`; both acquire the lock at exactly one layer inside their SECURITY DEFINER bodies; their JS-side Server Action wrappers make NO advisory-lock call.

**R41 P-R17 Fix-1 — extend the lock-holder inventory with `claim_oauth_identity` (Task A8).** A8 is a multi-show lock-taking SECURITY DEFINER RPC: it materializes `v_locked_show_ids` from `crew_members` for the user's email then acquires `pg_advisory_xact_lock` on EACH show (ordered by `drive_file_id` to prevent cross-transaction deadlock per R41-R10). H4 MUST register it alongside `reset_picker_epoch_atomic` and `rotate_show_share_token`:

- **Single-holder pinning**: assert `claim_oauth_identity` is the SOLE acquirer of `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` for the shows it touches when called from C6 (picker-bootstrap) and C7 (callback claim-stamp hook). The JS-side call sites at `app/api/auth/picker-bootstrap/route.ts` and `app/auth/callback/route.ts` make **NO** `pg_advisory_xact_lock` / `pg_try_advisory_xact_lock` call — wrapping the RPC in a JS-side lock would deadlock against the in-RPC loop (the M5 R20 deadlock class). H4 grep-asserts neither file contains `advisory_xact_lock` or `advisory_lock` strings.
- **Crew-members write inventory extension**: A8 mutates `crew_members.claimed_via_oauth_at`. Extend the H4 writer-inventory grep to cover `crew_members` UPDATE statements: `(update\s+public\.crew_members)|(\.from\(['"]crew_members['"]\)\.(update|insert|delete|upsert))`. Every match must be either (i) sync-time pre-pivot code paths (allowlisted), or (ii) `claim_oauth_identity`'s body (which holds the per-show lock for every affected row). NO other R41-era code path writes `crew_members.claimed_via_oauth_at`.
- **Lock-ordering meta-test**: A8 acquires locks in deterministic `drive_file_id` order. H4 asserts the function body contains `order by s.drive_file_id` in the lock-acquisition loop AND the `for r in select ... loop perform pg_advisory_xact_lock(...) end loop` pattern (per R41-R10 explicit ordering — set-based `PERFORM` does not guarantee execution order).
- **Cross-call-site sweep**: H4 grep-asserts no caller in `app/**` or `lib/**` performs `pg_try_advisory_xact_lock(... 'show:' ...)` wrapping a `.rpc('claim_oauth_identity', ...)` call. If such a wrapper appears, it's a CRITICAL deadlock vector identical to M5 R20 — fail CI immediately.

Plus the grep-derived `shows` writer inventory per R23/R24: scan `(\.from\(['"]shows['"]\)\.(update|insert|delete|upsert))|(update\s+public\.shows)|(insert\s+into\s+public\.shows)|(delete\s+from\s+public\.shows)` and assert each match has advisory-lock topology coverage.

```bash
git commit -am "test(meta): advisory-lock topology + shows writer inventory (H4)"
```

---

### Task H5: `tests/cross-cutting/picker-resolver-callsite-contract.test.ts`

Static-analysis walker per §10.1 R38 — every needs-crew-identity route imports `resolvePickerSelection` from the canonical helper path AND distinguishes `infra_error` from auth-denied. Regression assertion that the OLD `app/show/[slug]/page.tsx` is gone.

```bash
git commit -am "test(meta): picker-resolver call-site contract (R38; H5)"
```

---

### Task H6: `tests/components/_metaPickerRoleChipContract.test.ts`

Pins the LEAD-chip uses FXAV-orange contract via computed-style assertion (not class name) per AGENTS.md anti-tautology rule.

```bash
git commit -am "test(meta): LEAD role chip color contract (H6)"
```

---

### Task H7: `tests/messages/_metaAdminAlertCatalog.test.ts` updates

Remove all M9.5 catalog codes; assert new codes are present:
- `PICKER_EPOCH_RESET`, `PICKER_SELECTION_RACE` (admin-alert)
- `PICKER_EPOCH_STALE_BANNER`, `PICKER_REMOVED_FROM_ROSTER_BANNER`, `PICKER_EMPTY_ROSTER`, `PICKER_SHOW_UNAVAILABLE` (crew-facing)
- `PICKER_INVALID_INPUT`, `PICKER_CREW_MEMBER_NOT_FOUND`, `PICKER_CREW_MEMBER_WRONG_SHOW`, `PICKER_INVALID_SHARE_TOKEN`, `PICKER_RESOLVER_LOOKUP_FAILED` (rejection codes; all have both `dougFacing` and `crewFacing` copy per R33)
- **R41 P-R7 Fix-3 — R41 admin-alert producers added by this pivot (MUST be in the catalog AND have registered producer write-sites):**
  - `PICKER_BOOTSTRAP_RPC_FAILED` — emitted by `app/api/auth/picker-bootstrap/route.ts` (Task C6) when `claim_oauth_identity` returns an error OR throws (fail-closed 502 per spec §4.7 R41-R7). The H7 test MUST register this code and its production write-site grep pattern (the canonical object-form pattern `upsertAdminAlert\s*\(\s*\{[\s\S]*?code:\s*['"]PICKER_BOOTSTRAP_RPC_FAILED['"]` (see Producer registry pattern below for the AST/regex contract)) in `app/api/auth/picker-bootstrap/route.ts`. **Context (P-R9 Fix-2)**: `{ attempted_email_hash: text, rpc_error_code: text, rpc_error_message: text, route: text }` — NEVER raw email. H7 grep-asserts no `user_email` (raw) field appears in any `PICKER_BOOTSTRAP_RPC_FAILED` emission site; only `attempted_email_hash` is allowed.
  - **R41 P-R24 Fix-1 — `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED`** — emitted by `app/api/auth/picker-bootstrap/route.ts` (Task C6) step 3 when `resolve_show_by_slug_and_token` returns an error OR throws (BEFORE `validateGoogleSession` runs; therefore email-less context). Producer grep: `upsertAdminAlert\s*\(\s*\{[\s\S]*?code:\s*['"]PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED['"]` in the same file. **Context shape**: `{ stage: 'resolve_show', slug: text, rpc_error_code: text, rpc_error_message: text, route: text }`. **H7 grep guards (P-R24 Fix-1 pre-session PII contract)**: NO `attempted_email_hash` / `user_email` / `user_email_hash` / `share_token` / `share_token_hash` field appears in any `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED` emission site. The slug is visible (it's already in the URL); the share token is the sensitive bearer credential and MUST NOT appear in admin_alerts.context or logs. This is the structural defense — operator triage uses occurrence_count + slug + rpc_error_code as the correlation tuple.
  - `CALLBACK_CLAIM_THREW` — emitted by C7 callback claim-stamp hook when the claim block throws an exception (network fault, schema drift, undeclared SDK exception). Producer pattern: the canonical object-form pattern `upsertAdminAlert\s*\(\s*\{[\s\S]*?code:\s*['"]CALLBACK_CLAIM_THREW['"]` in `app/auth/callback/route.ts`. Context: `{ error_name: text }` only (no email/PII; the error name is sufficient for operator triage). show_id is NULL (no per-show scoping at callback time).
  - `OAUTH_IDENTITY_CLAIMED` — emitted by the callback claim-stamp hook (Task C7) when `claim_oauth_identity` SUCCEEDS in stamping `claimed_via_oauth_at` for ≥1 rows. The H7 test MUST register this code and its production write-site grep pattern (the canonical object-form pattern `upsertAdminAlert\s*\(\s*\{[\s\S]*?code:\s*['"]OAUTH_IDENTITY_CLAIMED['"]`) in `app/auth/callback/route.ts` (or the dedicated claim-stamp helper if extracted). **Per-row emission (P-R8 Fix-3)**: C7 emits ONE alert per row in `claim_oauth_identity` result's `claimed_rows` array; each alert is scoped to `show_id` (NOT NULL aggregate). Context shape: `{ crew_member_id: uuid, show_id: uuid, claimed_at_millis: bigint, user_email_hash: text }`. H7 asserts both (i) catalog row context-shape pinning matches this exact shape (4 named fields), AND (ii) producer-call shape pinning: `tests/auth/callback-claim-hook.test.ts` mocks `claim_oauth_identity` to return a 2-row `claimed_rows` and asserts upsertAdminAlert is called exactly twice with show_id per row. The aggregate-only `{ user_email, claimed_count }` shape is FORBIDDEN; H7 grep-asserts no `claimed_count` field appears in any OAUTH_IDENTITY_CLAIMED emission site.
  - **R41 P-R18 Fix-1 — `PICKER_EPOCH_RESET`** — emitted by `lib/auth/picker/resetPickerEpoch.ts` (Task B6) when `reset_picker_epoch_atomic` RPC succeeds. Producer pattern: `upsertAdminAlert\s*\(\s*\{[\s\S]*?code:\s*['"]PICKER_EPOCH_RESET['"]` in that file. Context: `{ show_id: uuid, new_epoch: int, admin_email_hash: text }`. H7 asserts NO raw email/`user_email` field; only `admin_email_hash`. show_id is the affected show (NOT NULL). Alert emission is BEST-EFFORT — wrapped in inner try/catch so failure doesn't roll back the reset; the H7 producer-registry assertion is structural (call site exists), not behavioral (test the emission itself in Task B6's test list).
  - **R41 P-R18 Fix-1 — `PICKER_SELECTION_RACE`** — emitted by `lib/auth/picker/cleanupStaleEntry.ts` (Task B5) on the "cleaned" code path ONLY (not the "noop" race-resolved-itself path). Producer pattern: `upsertAdminAlert\s*\(\s*\{[\s\S]*?code:\s*['"]PICKER_SELECTION_RACE['"]` in that file. Context: `{ show_id: uuid, stale_epoch: int, stale_crew_member_id: uuid }`. show_id is the affected show. H7 asserts NO raw email field — this is a cleanup-side race signal, not an identity event; PII has no place. Alert emission is BEST-EFFORT — wrapped in inner try/catch so failure doesn't roll back the cookie cleanup.
- **R41 P-R7 Fix-2 — `PICKER_IDENTITY_CLAIMED` and `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` catalog entries** (rejection + banner; both have `crewFacing` copy; `PICKER_IDENTITY_CLAIMED` carries `tamper:true` in structured logs per spec §8.4 even on the redirect path).

**Producer registry pattern (H7 enforcement; R41 P-R14 Fix-2):** The canonical helper is `upsertAdminAlert(input: { showId, code, context })` at `lib/adminAlerts/upsertAdminAlert.ts:33`. Call sites pass a SINGLE OBJECT argument with `code` on its own line (multi-line object literal). The H7 test cannot rely on a positional-arg grep like `upsertAdminAlert(.*'CODE'` — that pattern misses the canonical shape entirely.

**Recommended implementation: TypeScript AST parsing (NOT regex).** Use `ts-morph` or the TypeScript compiler API to:
1. Walk every `.ts`/`.tsx` file under `app/`, `lib/`, excluding test files.
2. Find every `CallExpression` whose callee is `upsertAdminAlert` (or `.rpc('upsert_admin_alert', ...)` for direct DB calls bypassing the helper).
3. Extract the `code:` property value from the object-literal first argument (or the `p_code:` value for the `.rpc()` direct form).
4. Build a Set of `{ code, file, line }` triples — the **producer registry**.
5. Walk the catalog (`lib/messages/catalog.ts`) and for every entry with `admitsAdminAlertRow: true`, assert at least one producer-registry entry exists with matching `code`. **Fail CLOSED** if any catalog code has no producer.
6. Walk the producer registry and assert every emitted `code` is registered in the catalog. **Fail CLOSED** if any producer emits an un-cataloged code (orphan producer).

**Fallback if AST parsing is not feasible: an object-form regex pattern.** If the implementer chooses regex over AST, the pattern MUST be:

```regex
upsertAdminAlert\s*\(\s*\{[\s\S]*?code:\s*['"]<CODE>['"]
```

The `[\s\S]*?` lazy multiline span handles the `showId: ...,\n          code: '<CODE>',` shape. A reverse sweep regex finding any `upsertAdminAlert\s*\(\s*\{[\s\S]*?code:\s*['"]([A-Z_]+)['"]` capture group is the producer-side enumeration. Both directions MUST use the same shape.

The M5 R3–R22 lesson distilled per AGENTS.md invariant 9: catalog row without a producer is a missing-write-site silent regression; producer call site for an un-cataloged code is an orphan-alert silent regression. Both are CI-blocking. The producer registry test is the structural defense.

```bash
git commit -am "test(meta): adminAlertCatalog updated for picker codes + R41 producers (H7)"
```

---

### Task H8: `tests/cross-cutting/identity-invalidated-two-reasons-doc-guard.test.ts` (R41 P-R33 structural defense)

**Files:**
- Create: `tests/cross-cutting/identity-invalidated-two-reasons-doc-guard.test.ts`

**Why this task exists (P-R33 structural-defense calibration)**: P-R29/P-R30 expanded `identity_invalidated.reason` from single value `'claimed_after_pick'` to the union `'claimed_after_pick' | 'session_mismatch'`. Multiple subsequent adversarial-review rounds (P-R30, P-R31, P-R32, P-R33) surfaced stale "single reason claimed_after_pick" residue in different sections of plan + spec — even after a comprehensive grep sweep in P-R32. Per AGENTS.md "structural-defense calibration" rule: when same-vector findings persist after comprehensive re-analysis, ship a structural defense (meta-test / CI grep guard) in the next repair commit rather than waiting for another adversarial round.

**The guard** — a vitest file that grep-walks `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md` and `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md` for FORBIDDEN phrasings:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FORBIDDEN_PATTERNS = [
  // Sentences that say identity_invalidated has a single reason — TRUE pre-P-R29; OBSOLETE post-P-R30.
  /identity_invalidated[^\n.]{0,80}single reason/i,
  /single reason[^\n.]{0,80}claimed_after_pick/i,
  // The reason union must include 'session_mismatch' or use the dual form. A type literal of ONLY 'claimed_after_pick' (with no follow-up `|`) in this kind's context is a regression.
  /reason:\s*'claimed_after_pick'\s*\}[^|]/,  // catches { ... reason: 'claimed_after_pick' } when not followed by | (i.e., not a union)
  // Wire-status-401 for identity_invalidated — was correct pre-P-R29; now MUST be 410 per spec §10.2 amendment.
  /identity_invalidated[^\n.]{0,80}→\s*401/i,
  // R41 P-R34 amendment — bootstrap no-redirect-loop analysis MUST NOT say page step 4(e) falls through to step 5 (closes the shared-device identity-leak vector P-R27 patched).
  /step 4\(e\)[^\n.]{0,40}falls through to step 5/i,
  /4\(e\)[^\n.]{0,40}fall.*step 5/i,
  // R41 P-R34 amendment — Mode B gate CTA action MUST be clearIdentityAndSkip, not the base clearIdentity. Catches plain `<form action={clearIdentity}>` in Mode B test contracts.
  // Allow `<form action={clearIdentity}>` to appear in Mode-A / IdentityChip contexts; only flag when paired with Mode-B / google_mismatch wording.
  /google_mismatch[\s\S]{0,400}form action=\{clearIdentity\}[^A]/i,  // negative-lookahead via `[^A]` so `clearIdentityAndSkip` (the `A` after `{clearIdentity`) is allowed
  // R41 P-R35 amendment — broader prose pair: "google_mismatch" + "clearIdentity" without "And" within a 240-char span. Catches non-form-snippet prose like "Continue-as-guest CTA wired to clearIdentity" that the narrower form-snippet pattern misses.
  /google_mismatch[\s\S]{0,240}\bclearIdentity\b(?!AndSkip)/i,
  // R41 P-R35 amendment — bootstrap continue arm wording that lumps GOOGLE_NO_CREW_MATCH with no-session into a picker-fallthrough outcome. Catches "no session OR GOOGLE_NO_CREW_MATCH ... renders either the picker ... OR the SignInOrSkipGate" — wrong for the GOOGLE_NO_CREW_MATCH path (must be Mode B gate ONLY, no picker option).
  /GOOGLE_NO_CREW_MATCH[\s\S]{0,400}renders (?:either )?the picker/i,
];

const TARGETS = [
  'docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md',
  'docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md',
];

describe('R41 P-R33 doc-guard: identity_invalidated two-reason contract', () => {
  for (const target of TARGETS) {
    it(`${target} contains no stale single-reason / 401-status wording`, () => {
      const body = readFileSync(resolve(target), 'utf8');
      const matches: Array<{ pattern: RegExp; lineNum: number; snippet: string }> = [];
      for (const pattern of FORBIDDEN_PATTERNS) {
        const lines = body.split('\n');
        for (let i = 0; i < lines.length; i++) {
          // Skip historical narrative — lines explicitly tagged with P-R29/P-R30/P-R31/P-R32/P-R33 OR R41-R35 in their text are allowed to mention the old wording as part of explaining the amendment.
          if (/\(P-R3[0-9]|R41-R35 simplified|R41-R35 amendment|P-R32 sweep|P-R33 doc-guard|pre-P-R29|P-R29\/P-R30 amendment/.test(lines[i])) continue;
          if (pattern.test(lines[i])) {
            matches.push({ pattern, lineNum: i + 1, snippet: lines[i].slice(0, 200) });
          }
        }
      }
      expect(matches).toEqual([]);
    });
  }
});
```

**What it catches**: any new prose/code in plan or spec that says (a) `identity_invalidated` has a single reason, (b) only mentions `'claimed_after_pick'` without the union form, or (c) maps `identity_invalidated` to 401 (post-P-R30 it's 410). The historical-narrative exception lets amendments cite the pre-amendment wording in P-R-tagged sentences so the guard doesn't false-positive on its own change history.

**Companion narrow guards (extend the existing H5 picker-resolver-callsite-contract test)**: when a `.rpc('auth_email_canonical')` or `createSupabaseServerClient` call appears in a file under `app/api/**`, fail unless that file is `lib/auth/picker/resolvePickerSelection.ts` (the single allowlisted importer per P-R30 Fix-1).

```bash
git commit -am "test(cross-cutting): identity_invalidated two-reasons + 410 doc-guard (H8; P-R33 structural defense)"
```

---

## Phase I: Impeccable v3 gate + adversarial review + close-out

### Task I0: Impeccable v3 critique + audit (R15-F3 — AGENTS.md invariant 8 mandate)

**MANDATORY before any adversarial review or execution handoff.** AGENTS.md invariant 8: "Every UI surface ships only after `/impeccable critique` AND `/impeccable audit` pass on the affected diff, with HIGH and CRITICAL findings either fixed or explicitly deferred via a `DEFERRED.md` entry." The pivot ships multiple UI surfaces:
- `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` (C2)
- `app/show/[slug]/[shareToken]/_StaleCleanupAutoSubmit.tsx` (C3)
- `components/auth/IdentityChip.tsx` (C4)
- `components/auth/TerminalFailure.tsx` (C0)
- `components/admin/PerShowCrewSection.tsx` (F1)
- `app/admin/show/[slug]/ResetPickerEpochButton.tsx` (F2)
- `app/admin/show/[slug]/CurrentShareLinkPanel.tsx` (F2.5)
- `app/admin/show/[slug]/RotateShareTokenButton.tsx` (F3)
- `components/realtime/ShowRealtimeBridge.tsx` (D3.5 modification)

Run BOTH commands externally (per `feedback_impeccable_external_attestation_required` memory: self-attestation by the Opus session that wrote the UI fails the v3 §1.8 gate):

```bash
# In a fresh subagent OR user-invoked session:
/impeccable critique
/impeccable audit
```

Record findings + dispositions in the milestone's handoff doc §12 (or DEFERRED.md if applicable). HIGH and CRITICAL findings either fixed in-place or explicitly deferred via DEFERRED.md entry. Re-run the gates after any UI fix per `feedback_impeccable_external_attestation_required` ("fires on every UI mutation including post-review fix commits").

**Do not proceed to I1/I2/I3 until impeccable gates pass.**

### Task I1: Plan self-review

- [ ] Walk this plan top to bottom checking each spec section has a paired task. Fix gaps inline.
- [ ] Grep for `TODO`/`TBD`/`fill in details` and remove. Replace with concrete content.
- [ ] Verify type/method-signature consistency: `selectIdentity({slug, shareToken, crewMemberId})` is used consistently in B3, C2, C3; `cleanupStaleEntry({slug, shareToken, showId, expectedEpoch, expectedCrewMemberId})` in B5, C3; etc.

### Task I2: Adversarial review (cross-model via codex-companion)

Per AGENTS.md mandate + the user's authorization of up to 40 additional rounds. Invoke `adversarial-review` skill on this plan. Iterate to APPROVE.

Standing do-not-relitigate list (current R41 contracts as of P-R12; supersedes earlier list):

**Out-of-scope (filed in BACKLOG.md):**
- `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:297-302` transitionManifestRow / pending_wizard_session_id CAS race — `BL-WIZARD-SESSION-CAS-TURNOVER-RACE` (M-series onboarding scope, not R41).

**Ratified R41 contracts:**
- **FIVE cookie-mutator surfaces** (not 3): `selectIdentity` Server Action (B3), `clearIdentity` Server Action (B4), `cleanupStaleEntry` Server Action (B5), `/api/auth/picker-bootstrap` Route Handler (C6 — mints `Max-Age=7776000`), `/auth/sign-out` Route (G0e0 — clears `Max-Age=0`).
- **`/me` is RESTORED** (not deleted) as the OAuth cross-show discovery surface (R41 Resolved Decisions 15–17). Uses cookie-bound authenticated Supabase client (not service-role) to call `my_share_tokens_for_email()` RPC.
- **`validateGoogleSession.ts` is PRESERVED.** Legitimate importers per the H2 allowlist + spec §10.1 no-jwt-surface structural meta-test:
  - `app/api/auth/picker-bootstrap/route.ts` (Task C6) — uses it to detect Google-signed-in user for lazy-mint.
  - `lib/auth/picker/resolveShowPageAccess.ts` (Task B7 helper) — uses it for the Google-session-matching-crew-row arm.
  - `app/auth/callback/route.ts` (Task C7) — uses it for claim-stamp hook context.
  - `app/me/page.tsx` (Task E2 cookie-bound rewrite) — uses it for OAuth cross-show discovery.

  The BAN surface is the SIX §6 data API consumers — `/api/realtime/subscriber-token`, `/api/asset/diagram`, `/api/asset/reel`, `/api/asset/agenda`, `/api/show/[slug]/version`, `/api/report`. Those MUST NOT import `validateGoogleSession`; they reject Google-session-without-picker-cookie with 401. The §10.1 meta-test enforces the ban against those six file paths only — NOT against the allowed surfaces above. (P-R12 phrasing "picker-bootstrap ONLY" was too tight and contradicted the H2 allowlist; P-R21 Fix-2 restores the correct allowlist.)
- **identity_invalidated resolver arm** is a single union arm with TWO reasons: `'claimed_after_pick'` (R41-R8/R41-R35 — fires when cookie pre-dates an OAuth claim on the same crew row) AND `'session_mismatch'` (P-R29/P-R30 Fix-1 — fires when Supabase session is active and its canonical email doesn't match the cookie's crew_members.email; closes the shared-device API leak). R41-R35 dead-code purge removed `email_ambiguous`. All 6 §6 API consumers return HTTP 410 on either reason (per spec §6.1 stale-but-knowable contract). Page route renders PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER for both reasons (banner copy semantically covers "your saved identity isn't valid; re-pick or sign in/out").
- **Schema partial UNIQUE index** `crew_members_show_email_unique ON (show_id, email) WHERE email IS NOT NULL` prevents ambiguous-email; all defenses against that state were removed in R35.
- **§6.0 Timestamp Defense Contract** — cookie.t comes from `out_observed_at_millis` returned by `select_identity_atomic` (DB-side `clock_timestamp()` inside the advisory lock). `Date.now()`/`new Date()`/`performance.now()` are grep-banned by §10.1 meta-test in `selectIdentity.ts` AND `app/api/auth/picker-bootstrap/route.ts`.
- **Per-row OAUTH_IDENTITY_CLAIMED emission** (P-R8 Fix-3) — one alert per claimed row with `show_id` scoped to that row. Context = `{ crew_member_id, show_id, claimed_at_millis, user_email_hash }`. The aggregate `{ user_email, claimed_count }` shape is FORBIDDEN; H7 structural test grep-bans `claimed_count` and `user_email` (raw) in OAUTH_IDENTITY_CLAIMED emission sites.
- **R41 admin_alerts producer count = SIX** (post-P-R24): `OAUTH_IDENTITY_CLAIMED` (per-row, C7), `PICKER_BOOTSTRAP_RPC_FAILED` (post-session C6 step 4), `PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED` (pre-session C6 step 3 — NEW in P-R24), `CALLBACK_CLAIM_THREW` (C7 outer catch), `PICKER_EPOCH_RESET` (B6), `PICKER_SELECTION_RACE` (B5 cleaned path). All six have producer + catalog + AdminAlertCode-union + H7-registry parity.
- **Hashed-email contract scopes to the THREE email-bearing producers only** (P-R9/P-R10/P-R26): `OAUTH_IDENTITY_CLAIMED.user_email_hash`, `PICKER_BOOTSTRAP_RPC_FAILED.attempted_email_hash`, `PICKER_EPOCH_RESET.admin_email_hash` — all derive from `hashForLog(canonicalEmail)` (lib/email/hashForLog.ts, Task A6.5). NEVER raw email in those contexts or structured logs. The other THREE producers (PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED pre-session, CALLBACK_CLAIM_THREW outer-catch, PICKER_SELECTION_RACE cleanup) are structurally email-less; H7 grep-asserts each email field's ABSENCE in those emission sites.
- **Sign-out preservation contract** (P-R10 Fix-2) — same-origin gate (R22 F2) + try/catch around `supabase.auth.signOut()` + teardownFailureHtml() response are ALL preserved in G0e0; only M9.5 `deleteSession()` is removed.
- **Tokenized URL allowlist** (P-R12 Fix-1) — `validateNextParam.ts` accepts `/show/<slug>/<64hex>` (NOT slug-only `/show/<slug>`); legacy `/show/<slug>/p` rejected.
- **Reset RPC topology** (SECURITY DEFINER + in-DB `is_admin()` + cookie-bound caller + returns int).
- **API consumer 401/410/500 matrix** — every §6 API route distinguishes infra fault (500) from stale-but-knowable (410) from auth-missing (401); slug-only data API routes return 401 (NOT 404) for unknown slug per R17-F1.
- **Shows DML lockdown** — `crew_members`, `crew_member_auth`, `shows`, `pending_syncs` REVOKE INSERT/UPDATE/DELETE from `authenticated`; all mutations flow through SECURITY DEFINER RPCs.
- **decodePickerCookie** validates UUID format + integer ranges + HMAC signature before returning a decoded envelope.
- **Archived shows return 404 for ALL viewers** (including admins) via the page route arms; the API consumer matrix mirrors.
- **subscriber-token shape** `{ jwt, exp }` with `role: 'authenticated'`.

### Task I3: Execution handoff

After APPROVE: pick execution path (subagent-driven recommended).

---

## Self-review notes

**Spec coverage check:**
- §1 Goal & scope → Phase A-G implement
- §2 Out of scope → no tasks (deferrals are documentation)
- §3 Resolved decisions → distributed across all phases
- §4 Architecture → Phase A (DB) + Phase B (auth helpers) + Phase C (routes/UI) + Phase D (API)
- §5 Data model → Phase A
- §6 URL+routing → Phase C1 + Phase D
- §7 Picker UX → Phase C2-C3
- §8 Admin surface → Phase F
- §9 Backwards-compatibility → Phase G (clean cutover; no compat window)
- §10 Tests + structural defenses → Phase H
- §11 Open questions → no tasks (deferrals)

**Placeholder scan:** none.

**Type consistency:** Server Action signatures verified across phases. `resolvePickerSelection` result-union arms used identically in B2 and route consumers.
