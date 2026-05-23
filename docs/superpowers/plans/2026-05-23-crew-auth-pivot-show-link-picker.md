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
    const supabase = createSupabaseServiceRoleClient();
    const { data: before } = await supabase
      .from('shows').select('picker_epoch').eq('id', showId).single();
    expect(before?.picker_epoch).toBe(1);

    // Cookie-bound client would carry admin JWT; service-role
    // is_admin() returns true for the bypass-by-default path
    // (the meta-test in tests/auth/* enforces non-admin rejection).
    const { data: newEpoch, error } = await supabase
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

  it('raises on missing show', async () => {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase
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
    const supabase = createSupabaseServiceRoleClient();
    const { data: before } = await supabase
      .from('show_share_tokens').select('share_token').eq('show_id', showId).single();
    const { data: epochBefore } = await supabase
      .from('shows').select('picker_epoch').eq('id', showId).single();

    const { data: result, error } = await supabase
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
    await supabase.rpc('reset_picker_epoch_atomic', { p_show_id: show!.id });
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
  const env = decodePickerCookie(cookie, pickerCookieSigningKey());
  if (!env) return { kind: 'no_selection' };
  const entry = env.selections[showId];
  if (!entry) return { kind: 'no_selection' };

  const supabase = createSupabaseServiceRoleClient();
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

### Task B3: `selectIdentity` Server Action (R37 share-token validation)

**Files:**
- Create: `lib/auth/picker/selectIdentity.ts`
- Test: `tests/auth/picker/selectIdentity.test.ts`

- [ ] **Step 1-5: TDD cycle**

Test cases (full list — write each as a `describe`/`it` block):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { selectIdentity } from '@/lib/auth/picker/selectIdentity';

describe('selectIdentity Server Action', () => {
  it('R37: rejects without share-token (legacy { showId, crewMemberId } shape)', async () => {
    const result = await selectIdentity({ showId: 'x', crewMemberId: 'y' } as any);
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
```

Implementation file:

```ts
// lib/auth/picker/selectIdentity.ts
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

export async function selectIdentity(input: SelectIdentityInput): Promise<SelectIdentityResult> {
  if (!input || typeof input !== 'object') return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (typeof input.slug !== 'string' || !SLUG_RE.test(input.slug)) return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (typeof input.shareToken !== 'string' || !TOKEN_RE.test(input.shareToken)) return { ok: false, code: 'PICKER_INVALID_INPUT' };
  if (typeof input.crewMemberId !== 'string' || !UUID_RE.test(input.crewMemberId)) return { ok: false, code: 'PICKER_INVALID_INPUT' };

  const supabase = createSupabaseServiceRoleClient();

  // R37: share-token check FIRST.
  const { data: showId, error: resolveErr } = await supabase.rpc(
    'resolve_show_by_slug_and_token',
    { p_slug: input.slug, p_share_token: input.shareToken },
  );
  if (resolveErr) return { ok: false, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  if (!showId) return { ok: false, code: 'PICKER_INVALID_SHARE_TOKEN' };

  // Roster membership.
  const { data: crew, error: crewErr } = await supabase
    .from('crew_members')
    .select('id, show_id')
    .eq('id', input.crewMemberId)
    .maybeSingle();
  if (crewErr) return { ok: false, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  if (!crew) return { ok: false, code: 'PICKER_CREW_MEMBER_NOT_FOUND' };
  if (crew.show_id !== showId) return { ok: false, code: 'PICKER_CREW_MEMBER_WRONG_SHOW' };

  // Availability + epoch.
  const { data: show, error: showErr } = await supabase
    .from('shows')
    .select('picker_epoch, published, archived')
    .eq('id', showId)
    .single();
  if (showErr || !show) return { ok: false, code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
  if (show.archived || !show.published) return { ok: false, code: 'PICKER_SHOW_UNAVAILABLE' };

  // Merge into existing envelope.
  const key = pickerCookieSigningKey();
  const cookieStore = await cookies();
  const existing = decodePickerCookie(cookieStore.get(COOKIE_NAME)?.value, key);
  const env = existing ?? { v: 1 as const, selections: {} };
  env.selections[showId as string] = {
    id: input.crewMemberId,
    e: show.picker_epoch,
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
'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { encodePickerCookie, decodePickerCookie, COOKIE_NAME } from '@/lib/auth/picker/cookieEnvelope';
import { pickerCookieSigningKey } from '@/lib/env/pickerCookieSigningKey';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

export async function clearIdentity(input: { slug: string; shareToken: string; showId: string }) {
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
'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { encodePickerCookie, decodePickerCookie, COOKIE_NAME } from '@/lib/auth/picker/cookieEnvelope';
import { pickerCookieSigningKey } from '@/lib/env/pickerCookieSigningKey';

export async function cleanupStaleEntry(input: {
  slug: string;
  shareToken: string;
  showId: string;
  expectedEpoch: number;
  expectedCrewMemberId: string;
}) {
  // [...validate UUIDs/slug/token per B4 contract...]

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

- [ ] **Both actions follow R18 cookie-bound client + requireAdmin() pattern:**

```ts
// lib/auth/picker/resetPickerEpoch.ts
'use server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function resetPickerEpoch(input: { showId: string }) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient(); // cookie-bound!
  const { data: newEpoch, error } = await supabase
    .rpc('reset_picker_epoch_atomic', { p_show_id: input.showId });
  if (error) throw error;
  return { ok: true, new_epoch: newEpoch as number };
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
  const { data, error } = await supabase
    .rpc('rotate_show_share_token', { p_show_id: input.showId })
    .single();
  if (error) throw error;
  return { ok: true, new_share_token: data!.new_share_token as string, new_epoch: data!.new_epoch as number };
}
```

Tests assert: (a) non-admin caller throws via `requireAdmin()`; (b) admin caller succeeds; (c) **R30: no `__Host-fxav_picker` Set-Cookie header is emitted**; (d) for rotate, the returned new_share_token matches `/^[0-9a-f]{64}$/` and is different from the pre-rotation value.

```bash
git commit -am "feat(auth): resetPickerEpoch + rotateShareToken admin Server Actions (B6)"
```

---

## Phase C: Route restructure + picker UI

### Task C1: Move crew route to `app/show/[slug]/[shareToken]/`

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

export default async function ShowPage({
  params,
}: {
  params: Promise<{ slug: string; shareToken: string }>;
}) {
  const { slug, shareToken } = await params;

  // R34/R35: resolve via private RPC; mismatch → 404.
  const supabase = createSupabaseServiceRoleClient();
  const { data: showId } = await supabase.rpc('resolve_show_by_slug_and_token', {
    p_slug: slug, p_share_token: shareToken,
  });
  if (!showId) notFound();

  const { data: show } = await supabase
    .from('shows')
    .select('id, published, archived')
    .eq('id', showId)
    .single();
  if (!show) notFound();

  // R27: archived 404s for ALL viewers including admin (crew route is crew-only).
  if (show.archived) notFound();

  const req = new Request('https://placeholder', { headers: await headers() });
  const admin = await isAdminSession(req as any);
  if (admin.ok) {
    // Admin precedence — render as admin without going through picker.
    const data = await getShowForViewer(showId as string, { kind: 'admin' });
    return <ShowBody data={data} identityChip={null} />;
  }

  if (!show.published) notFound();

  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME)?.value;
  const resolved = await resolvePickerSelection({ showId: showId as string, cookie });

  switch (resolved.kind) {
    case 'resolved': {
      const data = await getShowForViewer(showId as string, {
        kind: 'crew',
        crewMemberId: resolved.crewMemberId,
      });
      const crew = data.crew.find((c) => c.id === resolved.crewMemberId);
      return (
        <ShowBody
          data={data}
          identityChip={crew ? { name: crew.name, role: crew.role } : null}
          slug={slug}
          shareToken={shareToken}
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
      const { data: roster } = await supabase
        .from('crew_members')
        .select('id, name, role, role_flags')
        .eq('show_id', showId)
        .order('name', { ascending: true });
      return (
        <PickerInterstitial
          slug={slug}
          shareToken={shareToken}
          showId={showId as string}
          roster={roster ?? []}
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

- [ ] **Step 3: Delete the old slug-only file**

```bash
rm app/show/[slug]/page.tsx
# Move _ShowBody.tsx into the new directory:
git mv app/show/[slug]/_ShowBody.tsx app/show/[slug]/[shareToken]/_ShowBody.tsx
```

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

```sql
-- supabase/migrations/20260523000099_cutover_drop_m9_5.sql
-- THE CUTOVER MIGRATION. References to crew_member_auth /
-- link_sessions / bootstrap_nonces / revoked_links / current_token_version
-- / etc. are EXPECTED in this file and are exempted from the
-- no-jwt-surface meta-test (per R13 CUTOVER_MIGRATION_TIMESTAMP).

drop function if exists public.mint_link_session_if_active_kid_matches(uuid, text, int, text, timestamptz);
drop function if exists public.revoke_leaked_link_atomic(uuid, text, int);
-- ... (full list per spec §4.10 + signed_link_admin_rpcs.sql)

drop table if exists public.link_sessions cascade;
drop table if exists public.bootstrap_nonces cascade;
drop table if exists public.revoked_links cascade;
drop table if exists public.crew_member_auth cascade;
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
