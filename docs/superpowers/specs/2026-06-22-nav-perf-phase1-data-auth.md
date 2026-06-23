# Spec — Navigation performance, Phase 1: server data-fetch parallelization + admin auth gate

**Date:** 2026-06-22
**Slug:** nav-perf-phase1-data-auth
**Status:** Draft → (self-review) → (Codex adversarial review) → execution
**Milestone:** Navigation performance (Phase 1 of 2). Phase 2 (UI: `<Link>`, `loading.tsx`, layout badge streaming) is a separate spec.
**Implementer/Reviewer:** Opus (Claude Code) implements; Codex adversarial-reviews.

---

## 1. Problem & goal

Client navigation feels slow because every route is `force-dynamic` (a cold server render per nav, never served from the Router Cache), and on top of that cold render each page fetches its data as a **long sequential chain of `await`s** with no parallelism, plus the admin auth gate makes **two serial network hops** (`supabase.auth.getUser()` → Supabase Auth server, then a `is_admin` RPC) on every gated render.

**Goal:** Cut the per-navigation server latency by (A) fanning out independent reads with `Promise.all`, and (B) removing the auth-server network hop and deduplicating the auth gate — **without** changing the always-fresh data model.

**Non-goals / out of scope (this phase):**
- Any *rendered* UI change (that is Phase 2: `CrewSubNav`/`DashboardFooter` `<Link>`, `loading.tsx`, layout badge streaming). **N.B. on the scope boundary:** Phase 1 edits only **server data-fetch code** (the `await`/`Promise.all` plumbing and which loaders are called), never rendered markup/JSX/styling/CSS/tokens/`DESIGN.md`. **However**, some of that data-fetch code lives inside files that AGENTS.md defines as UI surfaces *by path* — `app/admin/page.tsx`, `app/admin/settings/page.tsx`, `app/admin/show/[slug]/page.tsx` (under `app/`, not `app/api/**`) and `components/admin/Dashboard.tsx` (under `components/`). Per the path-based rule, **Invariant 8 (impeccable UI quality gate) APPLIES** and this work is Opus territory. See §2 + §7-closeout: the impeccable critique+audit pair runs on the app/components diff at close-out. (No rendered-output change is expected, so a clean pass is expected — but the gate is non-negotiable and path-triggered, so it runs regardless.)
- Removing `force-dynamic`, introducing ISR / `revalidate` / page caching. (Tag-based caching tied to sync → BACKLOG, filed separately.)
- The Supabase Realtime bridge.
- Schema changes: **Phase 1 introduces ONE migration** — `20260622000004_is_session_live_rpc.sql` (the `is_session_live()` SECURITY DEFINER RPC, B1.5). A5 uses bounded `Promise.all` (no RPC). The migration follows the migration→validation-parity discipline (§6): apply locally + test, `pnpm gen:schema-manifest` + commit, apply surgically to the validation project.

---

## 2. Plan-wide invariants in play

- **Invariant 9 (Supabase call-boundary discipline) — PRIMARY.** Every parallelized read keeps its `{ data, error }` destructure + infra-error discrimination. The safe transform is: `Promise.all` the **query promises** (supabase-js queries *resolve* with `{data,error}`, they do not reject), then destructure + discriminate each result exactly as today. **Do NOT switch to `Promise.allSettled`** — that would change the contract. Client *construction* (which can throw) stays inside its existing `try/catch`. Meta-test impact enumerated in §6.
- **Invariant 5 (no raw error codes in UI):** unaffected — no UI; error copy paths untouched.
- **Invariant 8 (impeccable UI quality gate) — APPLIES (path-based).** The diff touches `app/` (non-`api`) pages and `components/admin/Dashboard.tsx`, which AGENTS.md defines as UI surfaces by path. Therefore `/impeccable critique` AND `/impeccable audit` run on the affected app/components diff at close-out (external attestation — fresh subagent/user, not self-attested), with HIGH/CRITICAL findings fixed or `DEFERRED.md`-deferred BEFORE the cross-model whole-diff review. Because Phase 1 changes no rendered output, a clean pass is expected; any HIGH/CRITICAL would flag an unintended UI regression. This is Opus-owned work (it is — Opus implements). See §7-closeout.
- **Invariant 2 (advisory lock single-holder):** the A2 `purgeAndRotateIfStale` gating must not change lock topology — see §4 A2. No `pg_advisory*` calls are added or moved.
- **Invariant 3 (email canonicalization):** B1 keeps `canonicalize()` as the only normalization surface (`getClaims().data.claims.email` → `canonicalize(...)`, same as today's `canonicalize(userData.user?.email)`). The `tests/admin/no-inline-email-normalization.test.ts` audit (which covers `lib/auth/requireAdmin.ts:78`) must still pass — no inline `.toLowerCase()/.trim()` introduced.

---

## 3. Verified factual basis (live-code citation pass, 2026-06-22, against `origin/main` @ `51e43c14`)

All line numbers verified in the Phase-1 worktree. Each `§4` change cites these.

**Auth (`lib/auth/requireAdmin.ts`):**
- `requireAdminIdentity(opts?: RequireAdminOpts): Promise<AdminIdentity>` at L129; `RequireAdminOpts = { layer?: "layout" | "page" }` at L97; default `layer = "page"` at L130.
- Control flow: test-infra-fail hook `maybeForceTestInfraFail(forceHeaders, layer)` L137 → `createSupabaseServerClient()` L144 (throw→`AdminInfraError` L152) → `supabase.auth.getUser()` L165 (throw→`AdminInfraError` L169-171; returned `userError`: `isAuthSessionMissingError`→`redirectToSignIn()` L179, else→`AdminInfraError` L181) → `canonicalize(userData.user?.email)` L183 (falsy→`redirectToSignIn()` L188) → `supabase.rpc("is_admin")` L196 (throw→`AdminInfraError` L200; returned error→`AdminInfraError` L205; `data !== true`→`forbidden()` L209) → `return { email }` L212.
- `requireAdmin(opts?): Promise<void>` at L215 runs its own `maybeForceTestInfraFail` (L225) + a legacy `x-help-force-infra-fail` hook (L227-236) then `await requireAdminIdentity()` at **L238 — note: does NOT forward `opts`** (latent: `requireAdmin({layer:"layout"})` runs the identity resolution at `layer:"page"`). Preserve as-is.
- No `import { cache } from "react"` and no `cache()` wrapper present today.
- Callers (React.cache dedup scope): `app/admin/layout.tsx:54` (`requireAdminIdentity({layer:"layout"})`), `app/admin/page.tsx:113` (`requireAdmin()`), `app/admin/settings/page.tsx:69`, `app/admin/needs-attention/page.tsx:30`, `app/admin/show/[slug]/page.tsx:132`, `app/admin/dev/page.tsx:60`, `app/help/layout.tsx:19`, `app/admin/dev/actions.ts:122,256`, `app/api/report/route.ts:107,153` (via injected `deps.requireAdminIdentity`).
- `getClaims` confirmed present: `@supabase/auth-js@2.105.1`, `GoTrueClient.getClaims(jwt?, options?)`; `JwtPayload` exposes `email?`, `role`, `app_metadata?`; runtime probe `typeof c.auth.getClaims === "function"` → true. Asymmetric ES256 signing keys confirmed live on the linked project (`vzakgrxqwcalbmagufjh` JWKS → `alg:ES256, kty:EC, use:sig`).
- `is_admin()` is DB-backed: `supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql` — `(jwt.app_metadata.role = 'admin') OR EXISTS(admin_emails WHERE email = auth_email_canonical() AND revoked_at IS NULL)`. **Keep the RPC** (B2).

**Crew page (`lib/data/getShowForViewer.ts`):**
- `getShowForViewer(showId, viewer): Promise<ShowForViewer>` L244. Ordered reads: crew identity L262-267 (drives `isLead` L280, `viewerName` L275); shows L283 (depends only on `showId`); crew roster L346; hotel_reservations L390; rooms L424; transportation L455; contacts L503; `shows_internal` run_of_show L530; `shows_internal` financials L603 (**gated on `isLead`** L601); `viewer_version_token` RPC L637.
- Hard fail-closed guards (must remain sequenced first): crew lookup L268-272 (`PICKER_CREW_MEMBER_WRONG_SHOW`), show validation L284-292 (error / `!data` / unpublished-and-not-admin). No mid-sequence early-return after the show is validated.
- Soft per-tile errors: `tileErrors[<id>]` pattern, fixed strings for run_of_show; **not** invariant-9-registered (viewer surface).

**Dashboard (`components/admin/Dashboard.tsx`, `app/admin/page.tsx`):**
- `fetchDashboardData`: `nowDate()` L114; `shows` list L137-158; `activeCount` L166-184; `archivedCount` L188-204 (these three independent); `activeShowIds = showsRows.map(...)` L213; `crewTotal` L220-237 and crew paginate loop L244-270 (both depend on `activeShowIds`); N+1 `readfinalizeowned_b2` loop L287-298 (`inFlightIds` = unpublished `showsRows` L287; per-id `await supabase.rpc(...)` L290); `loadNeedsAttention({cap, supabase})` L329.
- `nowDate()` awaited again at `Dashboard` L349 and at `app/admin/page.tsx:146` (checkpoint path).
- `app/admin/page.tsx`: `requireAdmin()` L113; `purgeAndRotateIfStale()` L115; `result.settings` L116.
- `purgeAndRotateIfStale` (`lib/onboarding/sessionLifecycle.ts:264`): opens a postgres.js tx via `defaultWithTx` (L112-119, `postgres(databaseUrl(), {max:1,...})` + `sql.begin`). It is a **no-op** when `app_settings.pending_wizard_session_at IS NULL` (the rotation UPDATE WHERE requires `pending_wizard_session_at is not null` L277; the suppression check requires it L310) — returns `{settings, rotated:false}`. **Registered in admin meta-test (fetchDashboardData L175).**

**Settings (`app/admin/settings/page.tsx`) + appSettings getters:**
- Four single-column reads of `app_settings WHERE id='default'` via `createSupabaseServiceRoleClient()`, all returning `{kind:'value'|'infra_error'}`: `getAutoPublishCleanFirstSeen()` L80 (col `auto_publish_clean_first_seen`), `getAlertOnSyncProblems()` L88 (`alert_on_sync_problems`), `getDailyReviewDigest()` L89 (`daily_review_digest`), `getAlertOnAutoPublish()` L90 (`alert_on_auto_publish`). Same row → collapsible.
- Independent top-level loaders: `fetchDriveConnectionHealth()` L106, `fetchEmbeddedAdminEmails()` L109 (no data dependency on the settings reads or each other).
- `getAutoPublishCleanFirstSeen` is **also used by the sync pipeline** and is registered in the **sync meta-test** (L84) — do not change its signature.

**Per-show admin (`app/admin/show/[slug]/page.tsx`) + feed:**
- After show lookup (L149-155, `show.id` known): `readShowChangeFeed(show.id)` L184, `crew_members` L204-209, `loadShowShareToken(show.id)` L228 — mutually independent; `nowDate()` L233; conditional `readfinalizeowned_b2` L259-268.
- `readShowChangeFeed` (`lib/sync/feed/readShowChangeFeed.ts`): three service-role reads, mutually independent — `show_change_log` rows L206-215, count L219-226, `sync_holds` L231-237. **Registered in sync meta-test (L339)** with a dedicated infra test.

---

## 4. Design — changes

### Workstream A — parallelize independent server reads

**A1 · `lib/data/getShowForViewer.ts`.** Keep the crew-identity lookup (L262) and the `shows` validation (L283) sequenced first (they gate role + `showId` and carry the fail-closed throws). After the show row is validated and `isLead` derived, run the independent reads concurrently with one `Promise.all` wave: crew roster, hotel_reservations, rooms, transportation, contacts, run_of_show, `viewer_version_token` RPC, and — only when `isLead` — financials (build the array conditionally, or `Promise.all` an array that omits the financials promise when `!isLead`). Each promise keeps its existing `try/catch` + `tileErrors[id]` (soft) or throw (hard, for the RPC) handling — the parallel wave wraps the same per-read handlers. Post-fetch in-memory filtering (hotel by `viewerName`, run_of_show by date restriction) is unchanged. **Expected ~200-500ms.**

**A2 · `components/admin/Dashboard.tsx` + `app/admin/page.tsx`.**
- In `fetchDashboardData`: resolve `nowDate()` once and thread the `Date` to the consumers (remove the second await at `Dashboard` L349 and the duplicate path); `Promise.all` the three independent reads `shows` list + `activeCount` + `archivedCount` (wave 1). After `activeShowIds` is derived, `Promise.all` the `crewTotal` head-count with the start of the crew work and `loadNeedsAttention` (wave 2 — all keyed off `activeShowIds`/`supabase`, mutually independent). The crew paginate-until-complete loop stays internally sequential (each page depends on the prior offset) but runs concurrently with `crewTotal` + `loadNeedsAttention`.
- **A5 (folded in):** replace the serial `for (const showId of inFlightIds) { await supabase.rpc("readfinalizeowned_b2", ...) }` (L287-298) with a **bounded-concurrency** fan-out, NOT an unbounded `Promise.all` over all ids. `inFlightIds` can be up to `ACTIVE_SHOWS_CAP` (500) when many active shows are unpublished, so an unbounded `Promise.all` would burst up to 500 concurrent SECURITY DEFINER RPCs and remove the serial loop's backpressure (Codex plan R1 MEDIUM). Process in sequential chunks of `FINALIZE_OWNED_CONCURRENCY = 8`: for each chunk, `Promise.all` the chunk's `readfinalizeowned_b2` calls, each with per-call `.then(q => !q.error && q.data===true ? id : null).catch(() => null)` (preserving the `!q.error && q.data===true` discrimination and the `catch → fail toward Held` posture), then add non-null ids to `finalizeOwnedIds`. This caps concurrent RPC pressure at 8 while collapsing the common small-in-flight case (usually 0) to a single chunk. **No new RPC, no migration.**
- **Gate `purgeAndRotateIfStale` off the hot path:** in `app/admin/page.tsx`, the function is a pure no-op when `pending_wizard_session_at IS NULL` (its rotation UPDATE WHERE requires `pending_wizard_session_at is not null` L277; the suppression check requires it L310). Resolution: introduce a **named, typed pre-read helper** `readAppSettingsRow()` (new file `lib/appSettings/readAppSettingsRow.ts`) that does a single supabase-js select of the full `app_settings WHERE id='default'` row via `createSupabaseServiceRoleClient()`, returning a discriminated `{ kind: 'value'; settings: AppSettingsRow } | { kind: 'infra_error' }` — destructuring `{ data, error }`, distinguishing thrown (client construction / query throw, wrapped in `try/catch`) from returned (`error`) faults, never collapsing to a benign value. The page then:
  - `kind === 'value'` and `settings.pending_wizard_session_at === null` → use this `settings` row directly and **skip** `purgeAndRotateIfStale()` (no postgres.js tx). The function would no-op anyway, so behavior is identical.
  - `kind === 'value'` and `pending_wizard_session_at !== null` → call `purgeAndRotateIfStale()` exactly as today and use its returned `settings` (rotation/suppression path unchanged).
  - `kind === 'infra_error'` → **fall back to calling `purgeAndRotateIfStale()`** (today's path), so an infra fault on the pre-read NEVER becomes a false settled-dashboard render — it degrades to current behavior. (Codex spec R1 MEDIUM.)
  This is a **new Supabase call site** → registered under invariant 9 in §6 with its own behavioral tests in §7. **Advisory-lock note:** `purgeAndRotateIfStale` holds no `pg_advisory*` lock (it uses `app_settings` row-level conditional UPDATE inside a postgres.js tx, per `defaultWithTx`); the pre-read is a plain supabase-js select holding no lock. Gating changes *when* the tx opens, not lock topology; no nested SECURITY DEFINER advisory lock is bypassed (confirm in impl). **Expected ~300-900ms (incl. eliminating the postgres.js connect+tx on the common settled-dashboard path).**

**A3 · `app/admin/settings/page.tsx`.** Add one combined reader (e.g. `lib/appSettings/getSettingsPageFlags.ts`) that does a single `app_settings` multi-column select (`auto_publish_clean_first_seen, alert_on_sync_problems, daily_review_digest, alert_on_auto_publish`) via `createSupabaseServiceRoleClient()`, returning a typed `{ kind: 'value', ... } | { kind: 'infra_error' }`. The settings page calls it once and maps to the four existing initial shapes. Keep the four existing single-column getters untouched (other callers, incl. sync, depend on them). `Promise.all` the three independent top-level loads on the page (combined flags reader, `fetchDriveConnectionHealth`, `fetchEmbeddedAdminEmails`). **The combined reader is a NEW Supabase call site → add an invariant-9 registry row (admin meta-test) — see §6. Expected ~60-200ms.**

**A4 · `app/admin/show/[slug]/page.tsx` + `lib/sync/feed/readShowChangeFeed.ts`.** Once `show.id` is known, `Promise.all` the three independent loads `readShowChangeFeed` + `crew_members` + `loadShowShareToken`; resolve `nowDate()` once. Inside `readShowChangeFeed`, `Promise.all` the three service-role reads (log rows, count, sync_holds) — each keeps its `runFeedRead`/typed-`SyncInfraError` handling. **Expected ~120-360ms.**

### Workstream B — admin auth gate (`lib/auth/requireAdmin.ts`)

**B1 · `getUser()` → `getClaims()`.** Replace the `supabase.auth.getUser()` call (L165) with `supabase.auth.getClaims()` (local ES256 verification against the cached JWKS; self-falls-back to a network check if it cannot verify locally). `getClaims()` returns `{ data, error }` and — like `getUser()` — can surface an `AuthSessionMissingError` (auth-js 2.105.1 returns `{ data: null, error }` when its internal session load/refresh fails for an expired/invalid/revoked/missing session). Map the result to preserve the **exact unauthed-vs-infra contract today's `getUser` path implements** (L173-181), using the SAME `isAuthSessionMissingError` helper (`lib/auth/supabaseAuthError`, already imported at requireAdmin.ts):
- `error` AND `isAuthSessionMissingError(error)` → `redirectToSignIn()` — an expired/invalid/revoked/missing session is **unauthenticated**, exactly as today's L174 branch. **It must NOT become `AdminInfraError`** (Codex spec R3 HIGH: don't regress expired sessions from sign-in redirect to a 500).
- `error` AND NOT session-missing (genuine verification / JWKS-fetch / network / decode infra failure) → `AdminInfraError` (preserves the auth meta-test contract that `requireAdmin` throws `AdminInfraError` on infra fault).
- no `error` and no usable claims (null `data`/claims) → `redirectToSignIn()` (treat as unauthenticated, mirroring the session-missing path).
- claims present → `email = canonicalize(data.claims.email)`; falsy → `redirectToSignIn()` (today's L188 branch).
The `getClaims()` call stays inside its own `try/catch`; a thrown (not returned) error → `AdminInfraError` (matches today's L168-171). Net: the redirect-vs-infra-vs-ok partition is identical to today's `getUser` semantics; only the verification mechanism (local vs Auth-server) changes.

**B1.5 · Session-freshness RPC `is_session_live()` (NEW — enforces immediate revocation; user decision 2026-06-22).** Local `getClaims()` verification alone cannot detect a globally-signed-out / revoked / deleted session within the token's TTL. To preserve `getUser`'s immediate-revocation property on the admin gate, add a `SECURITY DEFINER` RPC `public.is_session_live()` (migration `supabase/migrations/20260622000004_is_session_live_rpc.sql`) that confirms the JWT's `session_id` claim still has a live row in `auth.sessions` (GoTrue deletes the session row on sign-out / revocation):

```sql
create or replace function public.is_session_live()
  returns boolean language sql stable security definer
  set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from auth.sessions s
     where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
  );
$$;
revoke all on function public.is_session_live() from public;
grant execute on function public.is_session_live() to authenticated;
```

Verified facts: `session_id` is a required JWT claim (auth-js `RequiredClaims`, types.d.ts:1632); `auth.sessions.id uuid` is the session-id column (introspected). **Empirically verified against local Supabase 2026-06-22 (revocation probe):** a signed-in access token carries `session_id`; `auth.sessions` has 1 row before; user `signOut()` → **0 rows**; `admin.deleteUser` → **0 rows**. So real GoTrue sign-out/revocation/delete DELETES the session row — the `EXISTS` check returns `false` immediately on revocation (NOT a tautological assumption; the plan's red test exercises this real path, not a manual row delete). Absent/empty `session_id` → `nullif(...)::uuid` → NULL → no row → `false` → treated as unauthenticated (redirect), fail-closed. Idempotent (`create or replace` + `revoke`/`grant`), apply-twice safe.

In `requireAdmin`, after a valid email is derived, call `is_session_live()` and `is_admin()` **in parallel** (`Promise.all` — both are independent JWT-only reads), preserving precedence: returned `error` on either → `AdminInfraError`; `is_session_live` data `!== true` → `redirectToSignIn()` (revoked/expired session = unauthenticated, **checked before** the admin verdict); `is_admin` data `!== true` → `forbidden()`. A thrown error from the `Promise.all` → `AdminInfraError`.

**B2 · keep `is_admin()` RPC.** After a valid email is derived, still call `supabase.rpc("is_admin")` for the authorization decision (`data !== true` → `forbidden()`). `is_admin` is the DB-backed source of truth (`admin_emails`, runtime-mutable); claims alone cannot determine membership. Unchanged from today.

**B3 · `React.cache()` the resolution.** Extract the expensive, layer-independent resolution into a **no-arg** cached core: `const resolveAdminIdentity = cache(async (): Promise<AdminIdentity> => { create client → getClaims → email → Promise.all([is_session_live, is_admin]) → return {email} })`. `requireAdminIdentity(opts)` runs the layer-specific `maybeForceTestInfraFail(forceHeaders, layer)` hook **outside** the cache (it must fire per-layer), then `return resolveAdminIdentity()`. `requireAdmin(opts)` keeps its current shape (own hooks + delegate to `requireAdminIdentity()` with no opts, preserving the latent-but-pinned L238 behavior). Because the core is no-arg, the layout gate (`{layer:"layout"}`) and the page gate (`{layer:"page"}`) share one resolution per request → one `getClaims` (local) + one parallel `is_session_live`+`is_admin` RPC pair instead of two of each.

**Net per nav:** cross-segment entry into `/admin` `2 network + 2 RPC (serial)` → `0 network + 1 RPC-wall-time (2 parallel RPCs, deduped)`; intra-`/admin` page nav `1 network + 1 RPC (serial)` → `0 network + 1 RPC-wall-time (2 parallel RPCs)`. Faster than today (no Auth-server hop, RPCs parallel) AND immediate-revocation preserved.

**B-SEC · Security posture — auth freshness (ENFORCED via `is_session_live`).** Replacing `getUser()` with `getClaims()` would, on its own, lose `getUser`'s immediate-revocation property — so B1.5 adds the `is_session_live()` RPC to restore it. With B1.5, immediate session revocation is ENFORCED, not merely bounded (user decision 2026-06-22, after Codex spec R1 + plan R2 HIGH). Analysis:
- **Authorization is unchanged and remains LIVE.** `is_admin()` (B2, kept) reads `auth.jwt()` + the runtime-mutable `admin_emails` table on **every** gate. The app's actual admin-revocation path is removing/`revoked_at`-ing the row in `admin_emails` — that takes effect on the **next** `is_admin()` call, immediately, identically under `getUser` or `getClaims`. So revoking an admin's privileges is **not** affected by this change.
- **Role-claim staleness is PRE-EXISTING, not introduced here.** `is_admin()`'s `app_metadata.role = 'admin'` branch reads `auth.jwt()` (the token), not live user metadata — so a stale `role` claim already passes until token refresh **today**, with `getUser`. This change does not alter that.
- **Session/auth-level revocation is now caught immediately** by `is_session_live()`: a globally-signed-out / revoked session's row is deleted from `auth.sessions`, so the RPC returns `false` → `redirectToSignIn()` on the very next gate, exactly like `getUser`'s Auth-server check. A **deleted auth user**'s sessions are also removed → same immediate cut-off. No ≤TTL window remains for the admin gate.
- **Why this is better than today:** we remove the per-gate Auth-server network hop AND keep immediate revocation, because `is_session_live` + `is_admin` run as one parallel RPC wall-time (vs today's serial network `getUser` + `is_admin`). Strictly faster and no weaker.
- **Tests pin both live guarantees** (§7): live-authorization (valid claims but not in `admin_emails` and no `role:'admin'` → `is_admin=false` → `forbidden()`); and **live session revocation** (`is_session_live=false` for a valid-but-revoked session → `redirectToSignIn()`, NOT authorized — proving immediate cut-off). Plus `getClaims` session-missing → redirect, non-session error → `AdminInfraError`.

---

## 5. Guard conditions / edge cases (every changed path)

- **`getClaims` session-missing vs infra vs no-claims (load-bearing):** the redirect-vs-throw partition must match today's `getUser` semantics. A returned `error` that `isAuthSessionMissingError(error)` is true for (expired/invalid/revoked/missing session) → `redirectToSignIn()`, **never** `AdminInfraError`. A returned non-session `error` (JWKS/network/decode) → `AdminInfraError`. No error + no usable claims/email → `redirectToSignIn()`. A *thrown* error → `AdminInfraError`. (Codex spec R3 HIGH — do not collapse expired sessions into 500s.)
- **`Promise.all` partial failure:** because supabase queries resolve (not reject), one failing read yields `{data:null, error}` in its slot and is discriminated per-read — the wave does not abort the others. For the A5 RPC wave and any genuinely-throwing call, wrap each in its own `try`/`.catch` so a throw maps to the same per-call fallback as today (never a whole-wave rejection). **Never `Promise.allSettled`.**
- **`getShowForViewer` financials gating:** when `!isLead`, the financials promise must be omitted from the wave (not awaited-then-discarded) so non-LEAD viewers issue zero financials reads — preserving current behavior and access posture.
- **`purgeAndRotateIfStale` gate:** when `pending_wizard_session_at !== null` the call runs exactly as today (rotation/suppression logic untouched). The only change is skipping a guaranteed no-op tx when it is `null`. A concurrent mint between the settings read and the (skipped) call is acceptable: the next request observes the non-null value and runs the rotation — identical to today's behavior where the function itself re-reads under its tx.
- **Empty inputs:** `activeShowIds.length === 0` short-circuits (existing guards retained); `inFlightIds` empty → zero chunks → empty set (no-op), matching today.
- **Bounded fan-out (A5):** the `readfinalizeowned_b2` fan-out is capped at `FINALIZE_OWNED_CONCURRENCY = 8` concurrent RPCs via sequential chunking; it must NEVER launch all `inFlightIds` at once. A regression test derives `inFlightIds` from a fixture LARGER than the cap (e.g. 20) and asserts max simultaneous in-flight RPCs ≤ 8.

---

## 6. Meta-test inventory (invariant 9) — mandatory declaration

- **`tests/auth/_metaInfraContract.test.ts`** — `requireAdmin` already registered (must still throw `AdminInfraError` on construction/getClaims/RPC fault). The grep-shape assertions (`const { data, error }` destructure; constructor-in-`try`) must continue to match after the `getUser→getClaims` swap and the `cache()` extraction. **Action:** keep the `{ data, error }` destructure on `getClaims`, keep `createSupabaseServerClient()` inside its `try`. Add/adjust behavioral rows for the three `getClaims` outcomes.
- **`tests/admin/_metaInfraContract.test.ts`** — `fetchDashboardData` (L175), `fetchUnresolvedAlertCount` (L222), `loadNeedsAttentionCount` (L216) registered. Parallelizing `fetchDashboardData` must keep every supabase await inside `try/catch` (grep-shape L303-412) and the typed `infra_error` behavior. **Action:** add registry rows for **two** new service-role call sites: (1) the A3 combined settings reader (`lib/appSettings/getSettingsPageFlags.ts`), and (2) the A2 pre-read helper (`lib/appSettings/readAppSettingsRow.ts`). Both return discriminated `{ kind: 'value' | 'infra_error' }`; register each (registry row preferred over an inline `// not-subject-to-meta:` waiver).
- **`tests/sync/_metaInfraContract.test.ts`** — `readShowChangeFeed` (L339), `getAutoPublishCleanFirstSeen` (L84) registered. Parallelizing `readShowChangeFeed`'s three reads must preserve the typed `SyncInfraError` mapping; the dedicated `readShowChangeFeed.infra.test.ts` must still pass. **Action:** no registry change (signatures unchanged); re-run the infra test.
- **`tests/admin/no-inline-email-normalization.test.ts`** — covers `lib/auth/requireAdmin.ts`. **Action:** keep `canonicalize()` the only normalization; no inline `.toLowerCase()/.trim()`.
- **No new RPC-gated table** → PostgREST DML lockdown N/A. **One new migration** (`is_session_live()` function) → must reach the validation project: apply locally + test, `pnpm gen:schema-manifest` + commit the regenerated manifest, apply surgically to validation (`supabase db query --linked` / `psql "$TEST_DATABASE_URL"`). The `validation-schema-parity` CI gate enforces this. `is_session_live` is read-only (SECURITY DEFINER, `stable`); `grant execute to authenticated` only. The `supabase.rpc("is_session_live")` call site lives inside `requireAdmin` (already invariant-9-registered in `tests/auth/_metaInfraContract.test.ts`) — its returned-error/thrown handling is covered by that registration + the new B-tests.

---

## 7. Testing strategy (TDD per task)

Each task: failing test → minimal impl → green → commit (conventional commits, `perf(...)`/`refactor(...)`/`test(...)`).

- **Parallelization (A1-A5):** assert concurrency, not just "function called." Use a mock supabase client whose reads resolve on a controllable deferred; assert that the second/third reads are *initiated* before the first resolves (i.e., the loader issued them concurrently) — a serial implementation fails this. Derive expected read-counts from the fixture, and assert error discrimination is preserved (inject `{data:null,error}` into one slot → that tile's `tileErrors`/typed-error set, others unaffected). Concrete failure mode each test catches: re-serialization regression, and dropped per-read error discrimination.
- **A2 gate + `readAppSettingsRow`:** with `pending_wizard_session_at = null`, assert `purgeAndRotateIfStale` is **not invoked** (spy) and the page renders with the pre-read settings; with non-null, assert it **is** invoked and behavior is unchanged; with the pre-read returning `{kind:'infra_error'}` (inject returned `error` AND a thrown query/client error — two cases), assert it **falls back** to calling `purgeAndRotateIfStale` (no false settled render). Also the invariant-9 behavioral rows for `readAppSettingsRow`: returned Supabase error → `infra_error`; thrown `.from()`/client-construction → `infra_error`; missing default row → typed result (not a crash).
- **B1/B1.5/B2/B3:** default success mock stubs `getClaims`→valid email, `is_session_live`→`true`, `is_admin`→`true`. (1) `getClaims` used, `getUser` not on the gate path; (2) outcomes — valid claims + `is_session_live=true` + `is_admin=true` → `{email}`; no/empty claims (null data, no error) → `redirectToSignIn`; **`getClaims` `AuthSessionMissingError`-equivalent → `redirectToSignIn` (NOT `AdminInfraError`)** (Codex R3 HIGH guard); `getClaims` **non-session** error → `AdminInfraError`; `getClaims` **throws** → `AdminInfraError`; **`is_session_live=false` (revoked/expired session) → `redirectToSignIn` (immediate revocation, checked BEFORE the admin verdict)**; `is_session_live` returned error / throw → `AdminInfraError`; valid+live but `is_admin=false` → `forbidden`; `is_admin` error/throw → `AdminInfraError`; (3) `React.cache` dedup: gate called twice (layout + page) in one request → exactly one `getClaims`, one `is_session_live`, one `is_admin` (spy counts) — non-cached fires two of each; (4) **live-authorization (B-SEC):** valid+live claims but email **not** in `admin_emails` and no `role:'admin'` → `is_admin=false` → `forbidden()` (authorization decided live); **live-revocation (B-SEC):** valid claims but `is_session_live=false` → `redirectToSignIn` (session cut off immediately, not authorized).
- **Anti-tautology:** auth tests assert against the spy/observable Supabase calls, not against a wrapper that would pass trivially; dashboard concurrency asserted via the deferred-resolution harness, not via a container that renders regardless.

### §7-closeout — Invariant 8 impeccable gate (mandatory, path-triggered)

Because the diff edits UI-surface paths (`app/admin/*` pages, `components/admin/Dashboard.tsx`), the milestone close-out runs the impeccable v3 dual-gate **before** the cross-model whole-diff review:
- `/impeccable critique` AND `/impeccable audit` on the affected app/components diff, with the canonical v3 preflight gates (PRODUCT.md / DESIGN.md / register / preflight signal).
- **External attestation** — run by a fresh subagent (or the user), not self-attested.
- HIGH/CRITICAL findings are fixed, or deferred via a `DEFERRED.md` entry, before proceeding.
- Findings + dispositions recorded in the PR / handoff notes.
- Expectation: clean pass (no rendered-output change). A HIGH/CRITICAL would indicate an unintended UI regression introduced by the data-fetch refactor (e.g., a changed render branch) and must be resolved.

---

## 8. Risks / watchpoints (pre-load the adversarial reviewer)

- **Invariant 8 APPLIES (path-based) and is honored** — the impeccable critique+audit pair runs on the app/components diff at close-out (§2, §7-closeout). It is NOT waived. (Corrected after Codex spec R2 CRITICAL: the invariant is path-based, not content-based; data-fetch-only edits to `app/`/`components/` files still trigger it.)
- **Auth freshness is ENFORCED (§B1.5/§B-SEC), not bounded.** Immediate session revocation is preserved via the `is_session_live()` RPC (validates the JWT `session_id` against `auth.sessions`), called in parallel with `is_admin()`. A revoked/signed-out/deleted-user session → RPC `false` → `redirectToSignIn()` on the next gate, same immediacy as `getUser`. The net gate is strictly faster than today (no Auth-server hop, RPCs parallel) and no weaker. Resolved per user decision after Codex spec R1 + plan R2 — do not re-raise as a security regression.
- **DO NOT switch to `Promise.allSettled`** — supabase queries resolve, so `Promise.all` + per-result `{data,error}` discrimination preserves invariant 9; `allSettled` would erase the typed-error contract.
- **getClaims is real** — verified at runtime + in `@supabase/auth-js@2.105.1` types (`GoTrueClient.getClaims`); asymmetric ES256 keys confirmed on the linked project's JWKS. Not a hypothetical.
- **Latent `requireAdmin` L238 layer-drop is intentional-to-preserve** — not in scope to fix; the `cache()` refactor must not change observable layer behavior.
- **Grep-shape meta-tests** — the `getUser→getClaims` swap and `cache()` extraction must keep `const { data, error }` destructuring and the construction-in-`try` shape so the structural assertions keep matching.
- **`getShowForViewer` is not invariant-9-registered** — its soft `tileErrors` contract and fail-closed crew/show guards are the binding invariants; parallelization preserves both.

---

## 9. Deferred / follow-up (filed)

- **BACKLOG:** tag-based caching tied to sync (`use cache` + `cacheTag('show:<id>')` + `revalidateTag` from the sync write path) — the "real" caching answer; needs a Supabase→Next invalidation bridge.
- ~~BACKLOG: admin-gate session-freshness check~~ — **implemented this phase** as B1.5 (`is_session_live()`) per the 2026-06-22 user decision.
- **DEFERRED (Phase 2 / later):** `CrewSubNav` prefetch re-enable pending the projection-side-effect refactor; verify a separate production project's JWKS before relying on local `getClaims` there.

---

## 10. Expected outcome

UI-free server-latency reduction with one small migration (`is_session_live()` RPC): crew-page and admin navigations issue 1-2 parallel read waves instead of ~8-13 serial round-trips, and the admin auth gate drops from a serial Auth-server hop + RPC to 0 network hops + one parallel RPC-pair (`is_session_live`+`is_admin`) per request — strictly faster than today AND preserving immediate session revocation. Always-fresh data semantics unchanged.
