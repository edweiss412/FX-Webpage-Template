# Crew Auth Pivot — Show-Link + Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-23-crew-auth-pivot-show-link-picker.md` (1046 lines; 40 rounds of cross-model adversarial review). Read it end-to-end before starting.

**Goal:** Replace the M9.5 per-crew-member signed-link auth model with one-show-link + "who are you?" identity picker, per the 2026-05-23 owner determination in `PRODUCT.md:69-83`.

**Architecture:** Crew URL becomes `/show/<slug>/<share-token>` where `<share-token>` is a 256-bit hex bearer credential stored in a new private `show_share_tokens` table. The picker is a Server-Component interstitial; selection persists in a single HMAC-signed `__Host-fxav_picker` host-wide cookie keyed by `show_id`. Three crew-side Server Actions (`selectIdentity`, `clearIdentity`, `cleanupStaleEntry`) are the only cookie mutators. Admin per-show panel adds Reset (bumps `shows.picker_epoch`) and Rotate (rotates token + bumps epoch + invalidates cookies, atomically). All M9.5 surfaces (JWT, redeem-link, fragment-bootstrap, leaked-link middleware, per-row Issue/Revoke, `/me`, `validateGoogleSession.ts`, `crew_member_auth`/`link_sessions`/`bootstrap_nonces`/`revoked_links` tables) are deleted in the same execution — app has not shipped, no compat window.

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
-- with picker_epoch_bumped_at. Same string-returning signature.

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
  ), 'FM999999999999999');
$$;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260523000006_viewer_version_token_rewrite.sql tests/db/viewer_version_token.test.ts
git commit -m "feat(db): rewrite viewer_version_token (picker_epoch term; A6)"
```

---

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
const MAX_SAFE_T = 2_000_000_000; // year 2033 — covers any reasonable unix-seconds

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
  if (!Number.isInteger(obj.t) || (obj.t as number) < 0 || (obj.t as number) > MAX_SAFE_T) return false;
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/auth/picker/cookieEnvelope.test.ts`
Expected: PASS (all eight tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/picker/cookieEnvelope.ts lib/env/pickerCookieSigningKey.ts tests/auth/picker/cookieEnvelope.test.ts
git commit -m "feat(auth): HMAC-signed picker cookie envelope (B1)"
```

---

### Task B2: `resolvePickerSelection` resolver (7-arm discriminated union)

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
  | { kind: 'show_unavailable' }
  | { kind: 'infra_error'; code: 'PICKER_RESOLVER_LOOKUP_FAILED' };

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
  let crewExists = false;
  try {
    const { data, error } = await supabase
      .from('crew_members')
      .select('id')
      .eq('id', entry.id)
      .eq('show_id', showId)
      .maybeSingle();
    if (error) return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
    crewExists = !!data;
  } catch {
    return { kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
  if (!crewExists) {
    return { kind: 'removed_from_roster', expectedEpoch: entry.e, expectedCrewMemberId: entry.id };
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

  -- Step 5: roster membership. R5-F3: distinguish WRONG_SHOW from
  -- NOT_FOUND so form-tamper attempts (a real crew_member_id from
  -- a different show) emit the tamper-specific signal rather than
  -- looking identical to "row deleted." R7-F1: v_crew_show is
  -- declared at the function-top declare block so subsequent
  -- branch reads stay in scope.
  select show_id into v_crew_show
    from public.crew_members
   where id = p_crew_member_id;
  if v_crew_show is null then
    out_show_id := null; out_picker_epoch := null; out_rejection_code := 'PICKER_CREW_MEMBER_NOT_FOUND';
    return next; return;
  end if;
  if v_crew_show <> v_show_id then
    out_show_id := null; out_picker_epoch := null; out_rejection_code := 'PICKER_CREW_MEMBER_WRONG_SHOW';
    return next; return;
  end if;

  -- Step 6: read picker_epoch under the lock. Reset/Rotate cannot
  -- bump it during this transaction; the value we return is
  -- guaranteed to match what a concurrent rotation would observe.
  select s.picker_epoch into out_picker_epoch
    from public.shows s where s.id = v_show_id;

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
import { describe, it, expect, beforeEach } from 'vitest';
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
export async function selectIdentity(formData: FormData): Promise<SelectIdentityResult> {
  const slug = formData.get('slug');
  const shareToken = formData.get('shareToken');
  const crewMemberId = formData.get('crewMemberId');
  if (typeof slug !== 'string' || typeof shareToken !== 'string' || typeof crewMemberId !== 'string') {
    return { ok: false, code: 'PICKER_INVALID_INPUT' };
  }
  return selectIdentityCore({ slug, shareToken, crewMemberId });
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
  let data: { out_show_id: string | null; out_picker_epoch: number | null; out_rejection_code: string | null } | null = null;
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
  if (!data.out_show_id || !Number.isInteger(data.out_picker_epoch)) {
    return { ok: false, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  }
  const showId = data.out_show_id as string;
  const lockedEpoch = data.out_picker_epoch as number;

  // Merge into existing envelope.
  const key = pickerCookieSigningKey();
  const cookieStore = await cookies();
  const existing = decodePickerCookie(cookieStore.get(COOKIE_NAME)?.value, key);
  const env = existing ?? { v: 1 as const, selections: {} };
  env.selections[showId] = {
    id: input.crewMemberId,
    e: lockedEpoch,
    t: Math.floor(Date.now() / 1000),
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

### Task B4: `clearIdentity` Server Action (R39 — needs slug+shareToken for revalidate)

**Form/FormData pattern (R1-F1):** like `selectIdentity`, the exported `clearIdentity` accepts `FormData` (called from `<form action={clearIdentity}>` in `IdentityChip`), parses string fields, and delegates to an object-shaped `clearIdentityCore({ slug, shareToken, showId })` that unit tests exercise directly. Same pattern for `cleanupStaleEntry` (B5).

**Files:**
- Create: `lib/auth/picker/clearIdentity.ts`
- Test: `tests/auth/picker/clearIdentity.test.ts`

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
  return { ok: true, action: 'cleaned' };
}
```

Critical test: race-safety — when `selectIdentity` writes a fresh entry between picker render and cleanup form auto-submit, cleanup is a no-op.

```bash
git commit -am "feat(auth): cleanupStaleEntry compare-and-delete (R22; B5)"
```

---

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

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function resetPickerEpoch(input: { showId: string }) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient(); // cookie-bound!
  // R4-F2: try/catch wraps the .rpc call so thrown faults map to a
  // typed result instead of bubbling up as an uncataloged framework
  // error.
  try {
    const { data: newEpoch, error } = await supabase
      .rpc('reset_picker_epoch_atomic', { p_show_id: input.showId });
    if (error) return { ok: false as const, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
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

Tests assert: (a) non-admin caller throws via `requireAdmin()`; (b) admin caller succeeds; (c) **R30: no `__Host-fxav_picker` Set-Cookie header is emitted**; (d) for rotate, the returned new_share_token matches `/^[0-9a-f]{64}$/` and is different from the pre-rotation value.

```bash
git commit -am "feat(auth): resetPickerEpoch + rotateShareToken admin Server Actions (B6)"
```

---

## Phase C: Route restructure + picker UI

### Task C0-pre: Add picker message codes to catalog (R11-F3)

**Files:**
- Modify: `lib/messages/catalog.ts` (add the new PICKER_* entries from §8.4)
- Modify (regenerate): `lib/messages/__generated__/spec-codes.ts` (the MessageCode union must include the new codes BEFORE TerminalFailure compiles)
- Test: `tests/messages/picker-codes.test.ts`

The plan previously deferred catalog updates to Task H7, but `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />` in Task C0 and the picker UI in Task C2 pass code strings to `messageFor()` whose live signature accepts `MessageCode`. Without the codes registered first, every commit from C0 onward fails to typecheck.

The codes to register (per §8.4 of the spec, full list):
- `PICKER_EPOCH_RESET` (admin-alert)
- `PICKER_SELECTION_RACE` (admin-alert)
- `PICKER_EPOCH_STALE_BANNER`, `PICKER_REMOVED_FROM_ROSTER_BANNER`, `PICKER_EMPTY_ROSTER`, `PICKER_SHOW_UNAVAILABLE` (crew-facing)
- `PICKER_INVALID_INPUT`, `PICKER_CREW_MEMBER_NOT_FOUND`, `PICKER_CREW_MEMBER_WRONG_SHOW`, `PICKER_INVALID_SHARE_TOKEN`, `PICKER_RESOLVER_LOOKUP_FAILED` (rejection — all carry both `dougFacing` + `crewFacing` per R33)

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
      <p className="text-sm text-muted-foreground mt-2 max-w-[480px] text-center">
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

- [ ] **Step 2: Rewrite the route file**

```tsx
// app/show/[slug]/[shareToken]/page.tsx
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isAdminSession } from '@/lib/auth/isAdminSession';
import { resolvePickerSelection } from '@/lib/auth/picker/resolvePickerSelection';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { COOKIE_NAME } from '@/lib/auth/picker/cookieEnvelope';
import { PickerInterstitial } from './_PickerInterstitial';
import { ShowBody } from './_ShowBody';
import { getShowForViewer } from '@/lib/data/getShowForViewer';
import { TerminalFailure } from '@/components/auth/TerminalFailure';

export default async function ShowPage({
  params,
}: {
  params: Promise<{ slug: string; shareToken: string }>;
}) {
  const { slug, shareToken } = await params;

  // R34/R35 + R1-F2 + R5-F2: resolve via private RPC; destructure error
  // AND wrap in try/catch since Supabase calls can THROW on network/
  // runtime faults. Infra-error MUST be discriminable from "wrong
  // token" (404), per AGENTS.md call-boundary discipline.
  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch {
    return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
  }
  let resolveResp;
  try {
    resolveResp = await supabase.rpc('resolve_show_by_slug_and_token', {
      p_slug: slug, p_share_token: shareToken,
    });
  } catch {
    return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
  }
  if (resolveResp.error) {
    // Infra fault — render terminal-failure UI (cataloged code).
    return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
  }
  const showId = resolveResp.data;
  if (!showId) notFound(); // confirmed token/slug mismatch.

  let showResp;
  try {
    showResp = await supabase
      .from('shows')
      .select('id, published, archived')
      .eq('id', showId)
      .maybeSingle();
  } catch {
    return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
  }
  if (showResp.error) return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
  if (!showResp.data) notFound(); // race: show deleted between RPC and SELECT.
  const show = showResp.data;

  // R27: archived 404s for ALL viewers including admin (crew route is crew-only).
  if (show.archived) notFound();

  const req = new Request('https://placeholder', { headers: await headers() });
  let admin;
  try {
    admin = await isAdminSession(req as any);
  } catch {
    return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
  }
  // R7-F3: isAdminSession returns { ok: false, reason: 'infra_error' }
  // on Supabase outages. We MUST surface that as terminal-failure
  // rather than silently falling through to the crew picker (which
  // would render the wrong viewer mode for a real admin).
  if (!admin.ok && admin.reason === 'infra_error') {
    return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
  }
  if (admin.ok) {
    // Admin precedence — render as admin without going through picker.
    // R13-F3: wrap getShowForViewer in try/catch (same posture as the
    // crew branch); admin outages get the cataloged terminal-failure
    // UI, not an uncataloged framework error.
    const viewer = { kind: 'admin' as const };
    let data;
    try {
      data = await getShowForViewer(showId as string, viewer);
    } catch {
      return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
    }
    return (
      <ShowBody
        slug={slug}
        showId={showId as string}
        viewer={viewer}
        data={data}
        identityChip={null}
      />
    );
  }

  if (!show.published) notFound();

  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME)?.value;
  const resolved = await resolvePickerSelection({ showId: showId as string, cookie });

  switch (resolved.kind) {
    case 'resolved': {
      const viewer = { kind: 'crew' as const, crewMemberId: resolved.crewMemberId };
      let data;
      try {
        data = await getShowForViewer(showId as string, viewer);
      } catch {
        return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
      }
      // R2-F1: live ShowForViewer uses crewMembers (not crew); preserve
      // existing ShowBodyProps { slug, showId, viewer, data }.
      const crew = data.crewMembers.find((c) => c.id === resolved.crewMemberId);
      return (
        <ShowBody
          slug={slug}
          showId={showId as string}
          viewer={viewer}
          data={data}
          identityChip={crew ? { name: crew.name, role: crew.role, shareToken } : null}
        />
      );
    }
    case 'show_unavailable':
      notFound();
    case 'infra_error':
      return <TerminalFailure code={resolved.code} />;
    case 'no_selection':
    case 'epoch_stale':
    case 'removed_from_roster': {
      // R2-F3 + R6-F2: destructure { data, error } AND wrap in try/catch
      // for thrown faults. Infra → TerminalFailure, NOT empty-roster.
      let rosterResp;
      try {
        rosterResp = await supabase
          .from('crew_members')
          .select('id, name, role, role_flags')
          .eq('show_id', showId)
          .order('name', { ascending: true });
      } catch {
        return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
      }
      if (rosterResp.error) return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
      const roster = rosterResp.data ?? [];
      return (
        <PickerInterstitial
          slug={slug}
          shareToken={shareToken}
          showId={showId as string}
          roster={roster}
          banner={
            resolved.kind === 'epoch_stale' ? 'PICKER_EPOCH_STALE_BANNER'
            : resolved.kind === 'removed_from_roster' ? 'PICKER_REMOVED_FROM_ROSTER_BANNER'
            : null
          }
          staleCleanupHint={
            resolved.kind === 'epoch_stale' || resolved.kind === 'removed_from_roster'
              ? { expectedEpoch: resolved.expectedEpoch, expectedCrewMemberId: resolved.expectedCrewMemberId }
              : null
          }
        />
      );
    }
  }
}
```

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

type RosterRow = { id: string; name: string; role: string; role_flags: string[] };

export function PickerInterstitial({
  slug, shareToken, showId, roster, banner, staleCleanupHint,
}: {
  slug: string;
  shareToken: string;
  showId: string;
  roster: RosterRow[];
  banner: 'PICKER_EPOCH_STALE_BANNER' | 'PICKER_REMOVED_FROM_ROSTER_BANNER' | null;
  staleCleanupHint: { expectedEpoch: number; expectedCrewMemberId: string } | null;
}) {
  return (
    <main data-testid="picker-interstitial-root" className="min-h-screen flex flex-col items-center justify-start md:justify-center px-4">
      <div data-testid="picker-brand-strip" className="pt-6 pb-4 text-center">
        <span className="text-[14px] font-bold text-[var(--accent)]">FXAV</span>
      </div>
      <h1 data-testid="picker-question-heading" className="text-xl font-bold">Who are you?</h1>
      <p data-testid="picker-sub-instruction" className="text-xs text-muted-foreground mt-1">
        Tap your name to open the show page.
      </p>
      {banner && (
        <div data-testid="picker-banner" className="mt-2 mb-2 px-3 py-2 bg-orange-100 dark:bg-orange-900/30 text-xs rounded-md max-w-[360px]">
          {messageFor(banner).crewFacing}
        </div>
      )}
      {roster.length === 0 ? (
        <div data-testid="picker-roster-empty" className="py-16 text-center text-xs text-muted-foreground">
          {messageFor('PICKER_EMPTY_ROSTER').crewFacing}
        </div>
      ) : (
        <ul data-testid="picker-roster-list" className="w-full max-w-[360px] md:max-w-[480px] mt-3 space-y-[5px]">
          {roster.map((c) => (
            <li key={c.id}>
              <form action={selectIdentity}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="shareToken" value={shareToken} />
                <input type="hidden" name="crewMemberId" value={c.id} />
                <button
                  type="submit"
                  data-testid="picker-roster-row"
                  data-crew-member-id={c.id}
                  className="w-full min-h-11 px-3 flex items-center justify-between bg-card border border-border rounded-[9px] hover:bg-accent focus:bg-accent transition-colors"
                >
                  <span className="text-xs font-semibold">{c.name}</span>
                  {c.role && (
                    <span
                      className={[
                        'text-[8px] font-semibold rounded-full px-[7px] py-[2px]',
                        c.role_flags.includes('LEAD')
                          ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                          : 'bg-muted text-muted-foreground',
                      ].join(' ')}
                    >
                      {c.role}
                    </span>
                  )}
                </button>
              </form>
            </li>
          ))}
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
        <button type="submit" className="text-[9px] text-[var(--accent)] underline">Not you?</button>
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

## Phase D: API route auth swaps

### D-pre: Show-id derivation contract for slug-based API routes (R12-F2)

**Files:** documentation-only — applies to D1, D2, D3, D4 implementations.

`resolvePickerSelection` takes `{ showId, cookie }`. The slug-based routes (`/api/show/[slug]/version`, `/api/realtime/subscriber-token` whose request body carries the show_id, `/api/report` similar) need a derivation step that maps the URL/body identifier to a `show_id` UUID BEFORE calling the resolver. The contract:

- **`/api/show/[slug]/version`**: `params.slug` arrives in the URL. The route MUST call `resolve_show_by_slug_and_token`-OR-`SELECT id FROM shows WHERE slug = $1 LIMIT 1` (no share-token in this URL — admin-and-cookie auth go through different code paths, but the version endpoint doesn't carry the share-token). Wait — per the spec, the version endpoint requires a picker cookie OR admin session; the picker cookie alone proves possession of the show-link. The route does NOT re-validate the share-token because the cookie's HMAC signature + `e === shows.picker_epoch` already proves the cookie came from a valid selection. So the route does `SELECT id FROM shows WHERE slug = $1` (slug-only lookup), gets the show_id, then calls `resolvePickerSelection({ showId, cookie })`. Missing-slug → 404 (matches the page route's contract for unknown slugs). DB infra fault → 500 + cataloged code.
- **`/api/realtime/subscriber-token`**: per the LIVE route contract (verified via grep), the request body carries `{ slug }`, not `show_id`. R13-F2 amendment: the route MUST do `SELECT id FROM shows WHERE slug = $1 LIMIT 1` to derive show_id, then call `resolvePickerSelection({ showId, cookie })`. Do NOT change the request body shape — `ShowRealtimeBridge` posts `{ slug }` and changing it would require a coordinated client update. Missing slug → 404. DB infra fault → 500 with cataloged code.
- **`/api/asset/{diagram,reel,agenda}/[show]/...`**: `params.show` is the show UUID per R34. No derivation needed.
- **`/api/report`**: request body carries `show_id`.

Per route, the show_id derivation step + its error handling (404 for unknown slug, 500 for infra) is the first thing the route does, BEFORE calling `resolvePickerSelection`. Each route's test matrix asserts: (a) the derivation step's outcome maps cleanly to the cataloged response codes; (b) a slug not in `shows` returns 404 from the derivation step, NOT from the resolver.

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

### Task E2: Scrub `/me` from auth chain redirects (R22)

**Files:**
- Modify: `lib/auth/validateNextParam.ts` (remove `/me(\/.*)?$` from allowlist regex)
- Modify: `app/auth/sign-in/page.tsx` (redirect already-signed-in non-admins to `/`, not `/me`)
- Modify: `app/auth/callback/route.ts` (same)
- Modify: `app/api/auth/google/start/route.ts` (same)
- Test: `tests/auth/me-scrub-static.test.ts`
- Test: `tests/auth/validateNextParam.test.ts`

Static test grep for `/me` URL literals across `app/**`, `lib/**`, `components/**`, `middleware.ts` — fail if any production reference survives outside test fixtures.

```bash
git commit -am "fix(auth): scrub /me from redirect chain + allowlist (R22; E2)"
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
grant execute on function public.admin_read_share_token(uuid) to authenticated, service_role;
```

**Component:** displays the canonical share URL `https://crew.fxav.show/show/<slug>/<token>` (or the env-configured origin) with a Copy button. Updates after Rotate (via revalidate). Tests: (a) loads token + renders URL; (b) non-admin → no token (RPC returns null → component renders an error state); (c) post-rotate URL reflects the new token.

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

### Task G0e1: Refactor audit/lib references (R8-F2)

**Files:**
- Modify or delete: `lib/audit/trustDomains.ts` (references the old auth-domain model — `link_sessions`, `crew_member_auth`)
- Modify: `lib/audit/authChain.ts` (still encodes the M9.5 chain ordering)
- Modify: `lib/audit/authPrimitives.ts` (lists `link_sessions`, `__Host-fxav_session` as registered subjects)
- Regenerate: `lib/audit/email-boundaries.generated.ts` (referenced banned identifiers via emitted output)
- Modify or delete: `lib/me/partitionMeShows.ts` (helper referenced by /me — delete with /me)

Per the pre-cutover dry-run gate (G0e), the H2 no-jwt-surface meta-test MUST pass with zero banned-identifier matches across these audit/lib files. The implementer's grep before this task:

```bash
rg -n "(crew_member_auth|link_sessions|bootstrap_nonces|revoked_links|validateLinkSession|validateCrewAssetSession|listShowsForCrew|crew_link|crew_google|__Host-fxav_session)" lib/audit lib/me
```

Each match → either delete the surrounding scaffolding or rewrite it to reference the new picker surfaces (e.g., `__Host-fxav_picker`, `show_share_tokens`, `select_identity_atomic`).

```bash
git commit -am "refactor(audit): purge M9.5 references from audit + me helpers (G0e1)"
```

### Task G0e: Verification — pre-cutover no-jwt-surface dry-run

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
- `lib/auth/validateGoogleSession.ts` (R15 — no callers post-pivot)
- `lib/auth/validateCrewAssetSession.ts`
- `lib/auth/jwt.ts`
- `lib/auth/bootstrapCookie.ts`
- `lib/data/listShowsForCrew.ts`
- `app/me/` (entire directory; R14)
- `app/api/me/` (if exists)
- The leaked-link compromise-event handler in `middleware.ts` (file becomes no-op or is deleted)

```bash
git rm -r app/api/auth/redeem-link/ app/show/[slug]/p/ app/me/ \
  app/admin/show/[slug]/IssueLinkButton.tsx \
  app/admin/show/[slug]/RevokeAllLinksButton.tsx \
  lib/auth/validateLinkSession.ts \
  lib/auth/validateGoogleSession.ts \
  lib/auth/validateCrewAssetSession.ts \
  lib/auth/jwt.ts \
  lib/auth/bootstrapCookie.ts \
  lib/data/listShowsForCrew.ts
# middleware.ts: edit to no-op or delete
git commit -m "refactor: delete M9.5 JWT/link/me surfaces (G1)"
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

```bash
git add tests/db/cutover-migration-gate.test.ts
git commit -m "test(db): pre-apply cutover-migration gate (R10-F1; G2-pre)"
```

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

```bash
git add tests/db/cutover-schema-clean.test.ts
git commit -m "test(db): post-cutover schema clean (R1-F3; G3)"
```

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

Also bans `validateGoogleSession` imports outside test directory; bans `listShowsForCrew` substring; bans `/me` URL-literal strings.

```bash
git commit -am "test(meta): no-jwt-surface ban + /me grep (H2)"
```

---

### Task H3: Extend `tests/auth/_metaInfraContract.test.ts`

Register: `resolvePickerSelection`, `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`, `resetPickerEpoch`, `rotateShareToken`. Each must follow the Supabase call-boundary discipline (destructure `{data, error}`; infra faults discriminable from auth-denied).

```bash
git commit -am "test(meta): extend infra contract for picker helpers (H3)"
```

---

### Task H4: Extend `tests/auth/advisoryLockRpcDeadlock.test.ts`

Assert: `reset_picker_epoch_atomic` AND `rotate_show_share_token` are the ONLY writers of `shows.picker_epoch` + `shows.picker_epoch_bumped_at`; both acquire the lock at exactly one layer inside their SECURITY DEFINER bodies; their JS-side Server Action wrappers make NO advisory-lock call.

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

```bash
git commit -am "test(meta): adminAlertCatalog updated for picker codes (H7)"
```

---

## Phase I: Adversarial review + close-out

### Task I1: Plan self-review

- [ ] Walk this plan top to bottom checking each spec section has a paired task. Fix gaps inline.
- [ ] Grep for `TODO`/`TBD`/`fill in details` and remove. Replace with concrete content.
- [ ] Verify type/method-signature consistency: `selectIdentity({slug, shareToken, crewMemberId})` is used consistently in B3, C2, C3; `cleanupStaleEntry({slug, shareToken, showId, expectedEpoch, expectedCrewMemberId})` in B5, C3; etc.

### Task I2: Adversarial review (cross-model via codex-companion)

Per AGENTS.md mandate + the user's authorization of up to 40 additional rounds. Invoke `adversarial-review` skill on this plan. Iterate to APPROVE.

Standing do-not-relitigate list (carried from spec adversarial review):
- Reset RPC topology (SECURITY DEFINER + in-DB is_admin + cookie-bound caller + returns int)
- Cookie mutators are only the 3 crew-side Server Actions
- 401/410/500 API consumer matrix
- Shows DML lockdown (grep-derived inventory)
- /me deletion, validateGoogleSession.ts deletion, /show/[slug]/[shareToken] route only
- decodePickerCookie validates UUID format + integer ranges + HMAC signature
- Archived 404s for ALL viewers
- subscriber-token { jwt, exp } with role: 'authenticated'

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
