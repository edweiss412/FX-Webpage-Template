# Brainstorm + shape brief — Admin allow-list runtime-mutable (Cluster C9)

**Date:** 2026-05-14
**Cluster:** C9
**Items:** M2-D1 (admin allow-list runtime-mutable: §14.3 spec amendment + `admin_emails` table + replacement `is_admin()` + `/admin/settings/admins` UI)
**Implementer:** Opus / Claude Code
**Status:** Awaiting confirmation

---

## 1. Feature Summary

Retire the migration-hardcoded `array['dlarson@fxav.net', 'edweiss412@gmail.com']` literal inside `public.is_admin()` and replace with a runtime-mutable `admin_emails` table + Server-Action-driven CRUD UI at `/admin/settings/admins`. Doug can add/revoke administrators without a code deploy, with soft-delete audit trail and a last-admin-lockout refusal contract that prevents the deployment from going admin-less by accident.

## 2. Primary User Action

Doug adds a new administrator's email in <30 seconds (paste email → Add → confirm), or revokes a no-longer-needed admin with a two-tap confirmation. The page always shows him exactly who can see admin surfaces right now, with revocation history one click away.

## 3. Design Direction

- **Color strategy:** Restrained. Orange used only on the primary "Add admin" CTA and on Confirm-state revoke buttons (echoing C4 AlertBanner two-tap pattern).
- **Theme scene sentence:** Doug, between cues at his desk, opens `/admin/settings/admins` once a quarter to add a producer who's been onboarded; ALSO Doug, mid-show on his phone, urgently revokes a contractor whose engagement ended. Both scenes drive the same answer: read-current-state in 5 seconds, change-state in 30.
- **Anchor references:**
  - GitHub repo settings → "Manage access" (compact row list, role badge, revoke button).
  - 1Password admin panel → "Team members" (email-centric, recovery flow visible).
  - Linear's admin settings (informal density, named-state language).
- **Anti-references:** AWS IAM policy editor (too power-user). Google Workspace admin (too enterprise-checkbox-heavy). Generic Bootstrap admin (no opinionated state language).

## 4. Scope

- **Fidelity:** Production-ready.
- **Breadth:**
  - **DB layer:** new migration `supabase/migrations/<ts>_admin_emails.sql` — creates `admin_emails` table + replacement `is_admin()` + seed.
  - **Spec amendment:** `docs/superpowers/specs/amendments/2026-05-14-admin-allowlist-runtime-mutable.md` — §14.3 mechanism change.
  - **Data layer:** `lib/data/adminEmails.ts` — typed helpers (list, add, revoke).
  - **Server Actions:** `app/admin/settings/admins/actions.ts` — Add + Revoke + Re-add Server Actions.
  - **UI:** `app/admin/settings/admins/page.tsx` + child components.
  - **Meta-test extensions:** `tests/admin/no-inline-email-normalization.test.ts` (add adminEmails surfaces); `tests/auth/_metaInfraContract.test.ts` (register adminEmails helpers); `tests/db/admin-rls-runtime.test.ts` (pre-existing C9.0.5 probe).
  - **Catalog:** new MessageCode `LAST_ADMIN_LOCKOUT_REFUSED` in §12.4.
- **Interactivity:** Add form, Revoke two-tap confirm, Re-add flow.
- **Time intent:** Polish-until-it-ships. C9 is security-surface; misfires here are operationally severe.

## 5. §14.3 spec amendment summary

The amendment file ratifies the following:

### 5.1 New `admin_emails` table

```sql
create table public.admin_emails (
  email       text primary key,           -- canonical, lib/email/canonicalize.ts at every boundary
  added_by    uuid references auth.users(id) on delete set null,  -- nullable for seed rows
  added_at    timestamptz not null default now(),
  revoked_by  uuid references auth.users(id) on delete set null,  -- nullable
  revoked_at  timestamptz null,
  note        text null,                  -- optional context Doug enters at add time
  constraint admin_emails_canonical_email check (email = lower(trim(email))),
  constraint admin_emails_revoke_atomicity check (
    (revoked_at is null and revoked_by is null) or
    (revoked_at is not null)
  )
);

create index admin_emails_active_idx on public.admin_emails (email) where revoked_at is null;
```

**Seed:**
```sql
insert into public.admin_emails (email, added_by, added_at)
values
  ('dlarson@fxav.net', null, now()),
  ('edweiss412@gmail.com', null, now())
on conflict (email) do nothing;
```

### 5.2 Replacement `public.is_admin()`

```sql
create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
      or exists (
           select 1
             from public.admin_emails ae
            where ae.email = public.auth_email_canonical()
              and ae.revoked_at is null
         );
$$;
```

The JWT-role arm is preserved verbatim from the existing function (per R3 finding 1 — that arm is the Supabase Auth claim path; retiring it would break the JWT-role override).

### 5.3 RLS on `admin_emails` itself

The table is admin-readable AND admin-mutable:
```sql
alter table public.admin_emails enable row level security;

create policy admin_only on public.admin_emails
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

Note the recursion: `is_admin()` reads `admin_emails`, which RLS-gates reads via `is_admin()`. The `security definer` modifier on `is_admin()` breaks the cycle — the function runs with the function-owner's permissions (postgres / service_role), bypassing RLS on `admin_emails` for the policy check. This is the same pattern existing `can_read_show` uses.

### 5.4 Re-add semantics

Re-add of a previously-revoked email **UPDATEs the existing row**:
- `revoked_at` → NULL
- `revoked_by` → NULL
- `added_at` → now()
- `added_by` → current actor's auth.uid
- `note` → optional new note (replaces any prior note)

Implementation: `INSERT … ON CONFLICT (email) DO UPDATE SET revoked_at = NULL, revoked_by = NULL, added_at = excluded.added_at, added_by = excluded.added_by, note = excluded.note WHERE admin_emails.revoked_at IS NOT NULL`. The WHERE clause refuses re-add of an already-active row (idempotent for re-clicks; clear error for double-add).

UI surfaces re-add as `Re-added <date> (previously revoked <date>)` in the row's expanded detail. The audit history shows both the latest re-add AND any future revoke — full lifetime captured in the single row's columns.

### 5.5 Last-admin-lockout refusal contract

`canRevokeAdmin(email)` returns false when:
- The email's active row is the only `revoked_at IS NULL` row, AND
- The actor is revoking themselves (matches their auth_email_canonical()).

Server Action throws `LastAdminLockoutError`; UI catches and renders `messageFor('LAST_ADMIN_LOCKOUT_REFUSED')`.

If actor is NOT revoking themselves, they CAN revoke the last admin (e.g., a rogue admin can revoke the seed admins down to themselves) — the protection is specifically against self-revoke-induced lockout, not against intentional-malice revocation. This is by design; defense-in-depth against malice is out of scope for v1 and would require an entirely different policy (multi-admin quorum, etc.).

### 5.6 Cascade — best-effort, session expires naturally

Revoke does NOT invalidate active Supabase Auth sessions. Effect:
- The revoked admin's next RLS-gated SELECT/UPDATE/INSERT/DELETE on admin-only tables fails immediately (within ms — the new RLS check fires on every statement).
- Their currently-loaded admin pages show no new data on next fetch.
- They get the existing AlertBanner/page-level unauthorized-state on next navigation.
- Their auth session itself remains valid until natural expiry; they retain non-admin-gated access (e.g., they can still sign in and view their own /me page if they're a crew member).

This is intentional: simpler implementation, matches Supabase Auth's stable model, and the security claim is "no new admin actions after revoke," which is exactly what RLS enforces.

### 5.7 Bootstrap (initial-seed) protocol

- The seed migration inserts the two literal seed admins.
- `ADMIN_EMAILS` env var is RETIRED from `.env.local.example` and the §14.3 table (current handoff §A C9.0 already specifies this).
- For deployments that need different initial admins:
  1. Apply migrations including the seed.
  2. Sign in as a seed admin (or use Supabase Studio's JWT-role override).
  3. Add the deployment's actual admins via `/admin/settings/admins`.
  4. Revoke the literal seed admins (subject to last-admin-lockout protection).

OR: hand-edit the migration's seed `INSERT` in a one-shot patch before first apply. Authorized.

### 5.8 Catalog row

Add to `lib/messages/catalog.ts`:
```ts
LAST_ADMIN_LOCKOUT_REFUSED: {
  dougFacing: "You can't revoke the last administrator. Add another admin first, then revoke this one.",
  crewFacing: null,
  helpfulContext: null,
},
```

§12.4 amendment adds the row with rationale.

## 6. UI shape: `/admin/settings/admins`

### 6.1 Page anatomy

```
┌──────────────────────────────────────────────────┐
│ ADMINISTRATORS                                   │ ← page title (text-xl)
│ People who can view and edit show data.          │ ← subhead (text-sm subtle)
└──────────────────────────────────────────────────┘

  ACTIVE  (3)                                       ← eyebrow + count
  ┌──────────────────────────────────────────────┐
  │ dlarson@fxav.net                             │
  │ You · Seed admin · Added at deploy           │
  │                                  [ Revoke ]  │
  └──────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────┐
  │ producer@partner.com                         │
  │ Added by you · 3 days ago · "Q2 onboarding"  │
  │                                  [ Revoke ]  │
  └──────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────┐
  │ edweiss412@gmail.com                         │
  │ Seed admin · Added at deploy                 │
  │                                  [ Revoke ]  │
  └──────────────────────────────────────────────┘

  ADD ADMIN                                          ← eyebrow
  ┌──────────────────────────────────────────────┐
  │ Email   [_____________________________]      │
  │ Note    [_____________________________]      │
  │                                  [ Add ]     │
  └──────────────────────────────────────────────┘
  Inline error region                              ← uses ErrorExplainer surface="admin"

  REVOKED  (2) ▸                                    ← eyebrow + count, collapsed
    ┌─ contractor@oldgig.com ...─┐
```

### 6.2 Active row layout

- Email: `text-base font-medium text-text-strong`
- Metadata row: `text-xs text-text-subtle` — composition:
  - "You" prefix if email === current actor's canonical email
  - "Seed admin" if `added_by IS NULL` (the migration seed)
  - "Added by <added_by name or email>" if `added_by IS NOT NULL`
  - "Added at deploy" if seed; "<N days ago>" otherwise (uses C0 `lib/time/relative.ts`)
  - "<note>" in quotes if `note IS NOT NULL`
  - Pieces separated by `·` separator (matches Header.tsx pattern)
- Revoke button: right-aligned, accent CTA, two-tap confirm per C4 pattern (`Revoke` → `Confirm revoke` orange + `Cancel` link, 3s auto-revert).

### 6.3 Add admin form

- Email input: `<input type="email" required autocomplete="off">` — Server Action canonicalizes on receipt; the client may show a hint if user types uppercase but doesn't reject input.
- Note input: optional, max 200 chars, plain text.
- Add button: orange primary CTA, `disabled` while form is empty.
- Client-side validation: email format only (HTML5 + minimum check). All authoritative validation server-side.
- Inline error region: renders `<ErrorExplainer surface="admin" code={result.code} />` when Server Action returns an error. Codes: `ADMIN_EMAIL_INVALID`, `ADMIN_EMAIL_ALREADY_ACTIVE`, `ADMIN_EMAIL_RE_ADD_PROMPT` (when matching a revoked row — see §6.4).

### 6.4 Re-add flow

When `email` matches a revoked row:
1. Server Action returns `ADMIN_EMAIL_RE_ADD_PROMPT` with the previously-revoked metadata.
2. UI replaces the inline error with a "Re-add" prompt:
   > "**producer@partner.com** was revoked 17 days ago (by you). Re-add this email?"
   > [ Re-add ]  Cancel
3. Re-add confirm submits the same form with a hidden `confirm_re_add=true` field. Server Action UPDATEs the row per §5.4.
4. Cancel clears the inline prompt; form returns to idle.

### 6.5 Revoke flow

Two-tap inline (echoes C4 AlertBanner):
- Click `Revoke` → button morphs to `Confirm revoke` (orange) + `Cancel` link.
- 3s of inaction → auto-revert to `Revoke`.
- Click `Confirm revoke` → submits Server Action.
- Server Action checks last-admin-lockout per §5.5; on refusal returns `LAST_ADMIN_LOCKOUT_REFUSED`.
- UI catches and renders `messageFor` inline below the row.
- On success: row moves to REVOKED section; toast not needed (state change is self-evident).

### 6.6 Revoked section

- Collapsed by default via `<details><summary>`.
- Each revoked row shows:
  - Email (muted, `text-text-subtle`)
  - "Revoked by <name> · <relative time>"
  - "Originally added <relative time>"
  - No Revoke button (already revoked).
  - Re-add affordance lives on the Add form, NOT here (single canonical add path).

### 6.7 Edge / boundary states

| State | Render |
|---|---|
| 0 active admins (impossible after seed but defensive) | Active section reads "No active administrators." Add form remains. |
| 1 active admin (only the actor) | Active list shows the single row. Revoke button is `disabled` with `title="You can't revoke yourself when you're the last administrator."` Reduces clicks to refusal-path. Server-side check is still the authority. |
| 0 revoked rows | REVOKED section omits entirely (no eyebrow, no disclosure). |
| Network error on action | Inline error in form region with `ErrorExplainer surface="admin"`. |
| Unauthorized (not-an-admin landed here) | Existing admin-gate redirects to `/auth/sign-in?next=/admin/settings/admins` before render. |

## 7. Interaction Model

- **Add:** type email + optional note → click Add → optimistic-free Server Action submits → page revalidates → new row appears in ACTIVE.
- **Revoke:** click Revoke → button morphs → click Confirm revoke → form submits → row moves to REVOKED on revalidation.
- **Re-add:** Add an email that's in REVOKED → inline prompt with prior context → click Re-add → row moves back to ACTIVE with new `added_at` / `added_by`.
- **Self-revoke last admin:** disabled button on client; rejected on server with `LAST_ADMIN_LOCKOUT_REFUSED` if attempted via crafted submit.
- **Other-revoke last admin:** allowed by design (rogue admin can revoke seeds down to themselves). Documented behavior, not a bug.

## 8. Content Requirements

| Surface | Literal copy |
|---|---|
| Page title | `Administrators` |
| Page subhead | `People who can view and edit show data.` |
| ACTIVE eyebrow | `ACTIVE  (N)` |
| ADD ADMIN eyebrow | `ADD ADMIN` |
| Email input label | `Email` |
| Note input label | `Note (optional)` |
| Add button | `Add` |
| Revoke button | `Revoke` |
| Confirm revoke | `Confirm revoke` |
| Cancel | `Cancel` |
| Re-add prompt | `<email> was revoked <relative time> (by <name>). Re-add this email?` |
| Re-add button | `Re-add` |
| REVOKED eyebrow | `REVOKED  (N) ▸` |
| Last-admin lockout | `You can't revoke the last administrator. Add another admin first, then revoke this one.` (from catalog) |
| Email-invalid error | `Enter a valid email address.` |
| Email-already-active | `<email> is already an administrator.` |
| Empty active state (defensive) | `No active administrators.` |

## 9. Recommended References

- AGENTS.md invariant 1 (TDD) — every Server Action gets a test before implementation.
- AGENTS.md invariant 3 (email canonicalization at every boundary).
- AGENTS.md invariant 9 (Supabase call-boundary discipline).
- Spec §4.6 — `admin_alerts` (pattern reference for admin-tables RLS).
- Spec §12.4 — catalog row for `LAST_ADMIN_LOCKOUT_REFUSED`.
- M9 handoff §13 — meta-test inventory.
- Memory `feedback_iterate_until_convergence.md` (C9 is biggest cluster; expect 3-5 review rounds).

## 10. Open Questions

1. **Display name resolution for `added_by` / `revoked_by`** — auth.users carries email; how do we get a display name? Use `users_metadata.full_name` if set, fallback to email. If neither, render the auth.uid (UUID) — that's degraded but never blanks. Implementation will discover the canonical join.
2. **Audit log query frequency** — REVOKED section materializes from the same `admin_emails` table; no separate query needed. Verified at brief time.
3. **Migration file numbering** — pick the next available migration timestamp; M2 RLS migration is `20260501002000_rls_policies.sql` so this will be `20260514XXXXXX_admin_emails.sql`.
4. **Existing-code citations** (per AGENTS.md spec self-review rule) — implementation will cite live file:line for every existing function the migration depends on, especially `auth_email_canonical()` (`supabase/migrations/20260501002000_rls_policies.sql:13-21`) and the existing `is_admin()` (line 23-37) at amendment-write time.

## 11. Anti-goals

- **No bulk import.** "Import from CSV" is YAGNI for a 2-10 person team.
- **No role hierarchy.** Admin is admin. No "super-admin" / "read-only admin" tier.
- **No multi-factor on revoke.** Two-tap inline is the right ceiling.
- **No session-cascade revocation.** Best-effort per §5.6.
- **No "rotate" UI action.** Add + Revoke primitives only.
- **No public sign-up.** Admin add is admin-only.
- **No defense against admin malice.** A rogue active admin can revoke peers; we accept this and rely on the audit columns to surface what happened.

## 12. Definition of done

- Spec amendment ratified and inserted into `docs/superpowers/specs/amendments/2026-05-14-admin-allowlist-runtime-mutable.md`; §00-overview Ratified Amendments updated.
- Migration `<ts>_admin_emails.sql` creates table + replacement `is_admin()` + seed.
- Pre-migration baseline `tests/db/admin-rls-runtime.baseline.json` captured.
- Post-migration regression test passes (no drift in RLS behavioral parity).
- `lib/data/adminEmails.ts` implements `listAdminEmails`, `addAdminEmail`, `revokeAdminEmail`, `reAddAdminEmail` with `{ data, error }` destructuring and typed infra-error returns.
- Server Actions in `app/admin/settings/admins/actions.ts` invoke the data helpers, canonicalize email, enforce last-admin-lockout.
- UI page `app/admin/settings/admins/page.tsx` + child components render per §6.
- Catalog row `LAST_ADMIN_LOCKOUT_REFUSED` added.
- Meta-tests extended: `_metaInfraContract.test.ts`, `no-inline-email-normalization.test.ts`.
- All affected unit + e2e tests pass.
- `pnpm typecheck` + `pnpm lint` clean.
- `/impeccable critique` + `/impeccable audit` dual gate pass on the C9 diff.
- Codex adversarial review converges to APPROVE.
