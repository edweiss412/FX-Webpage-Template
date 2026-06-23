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
- Any UI change (that is Phase 2: `CrewSubNav`/`DashboardFooter` `<Link>`, `loading.tsx`, layout badge streaming). **N.B. on the "no UI" boundary:** Phase 1 *does* edit Server-Component page files (`app/admin/page.tsx`, `app/admin/settings/page.tsx`, `app/admin/show/[slug]/page.tsx`), but only their **server data-fetch code** (the `await`/`Promise.all` plumbing and which loaders are called) — never rendered markup/JSX/styling. No `components/**`, no `app/globals.css`/`@theme` tokens, no `tailwind.config.*`, no `DESIGN.md`. Invariant 8 (impeccable UI gate) therefore does **not** apply (no visual surface changes). Stated explicitly so the reviewer does not relitigate it.
- Removing `force-dynamic`, introducing ISR / `revalidate` / page caching. (Tag-based caching tied to sync → BACKLOG, filed separately.)
- The Supabase Realtime bridge.
- Schema changes: **Phase 1 introduces NO migrations** (A5 uses `Promise.all`, not a new set-returning RPC).

---

## 2. Plan-wide invariants in play

- **Invariant 9 (Supabase call-boundary discipline) — PRIMARY.** Every parallelized read keeps its `{ data, error }` destructure + infra-error discrimination. The safe transform is: `Promise.all` the **query promises** (supabase-js queries *resolve* with `{data,error}`, they do not reject), then destructure + discriminate each result exactly as today. **Do NOT switch to `Promise.allSettled`** — that would change the contract. Client *construction* (which can throw) stays inside its existing `try/catch`. Meta-test impact enumerated in §6.
- **Invariant 5 (no raw error codes in UI):** unaffected — no UI; error copy paths untouched.
- **Invariant 8 (impeccable UI gate):** **N/A** — no visual surface changes (see §1).
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
- **A5 (folded in):** replace the serial `for (const showId of inFlightIds) { await supabase.rpc("readfinalizeowned_b2", ...) }` (L287-298) with `Promise.all(inFlightIds.map(id => supabase.rpc("readfinalizeowned_b2", { p_show_id: id })))`, then fold the results into `finalizeOwnedIds` preserving the existing `!q.error && q.data === true` discrimination and the `catch → fail toward Held` posture (use per-call `.then/.catch` or wrap each in a try so one failure does not reject the whole wave — equivalent to today's per-iter `try/catch`). **No new RPC, no migration.**
- **Gate `purgeAndRotateIfStale` off the hot path:** in `app/admin/page.tsx`, the function is a pure no-op when `pending_wizard_session_at IS NULL` (its rotation UPDATE WHERE requires `pending_wizard_session_at is not null` L277; the suppression check requires it L310). Resolution: introduce a **named, typed pre-read helper** `readAppSettingsRow()` (new file `lib/appSettings/readAppSettingsRow.ts`) that does a single supabase-js select of the full `app_settings WHERE id='default'` row via `createSupabaseServiceRoleClient()`, returning a discriminated `{ kind: 'value'; settings: AppSettingsRow } | { kind: 'infra_error' }` — destructuring `{ data, error }`, distinguishing thrown (client construction / query throw, wrapped in `try/catch`) from returned (`error`) faults, never collapsing to a benign value. The page then:
  - `kind === 'value'` and `settings.pending_wizard_session_at === null` → use this `settings` row directly and **skip** `purgeAndRotateIfStale()` (no postgres.js tx). The function would no-op anyway, so behavior is identical.
  - `kind === 'value'` and `pending_wizard_session_at !== null` → call `purgeAndRotateIfStale()` exactly as today and use its returned `settings` (rotation/suppression path unchanged).
  - `kind === 'infra_error'` → **fall back to calling `purgeAndRotateIfStale()`** (today's path), so an infra fault on the pre-read NEVER becomes a false settled-dashboard render — it degrades to current behavior. (Codex spec R1 MEDIUM.)
  This is a **new Supabase call site** → registered under invariant 9 in §6 with its own behavioral tests in §7. **Advisory-lock note:** `purgeAndRotateIfStale` holds no `pg_advisory*` lock (it uses `app_settings` row-level conditional UPDATE inside a postgres.js tx, per `defaultWithTx`); the pre-read is a plain supabase-js select holding no lock. Gating changes *when* the tx opens, not lock topology; no nested SECURITY DEFINER advisory lock is bypassed (confirm in impl). **Expected ~300-900ms (incl. eliminating the postgres.js connect+tx on the common settled-dashboard path).**

**A3 · `app/admin/settings/page.tsx`.** Add one combined reader (e.g. `lib/appSettings/getSettingsPageFlags.ts`) that does a single `app_settings` multi-column select (`auto_publish_clean_first_seen, alert_on_sync_problems, daily_review_digest, alert_on_auto_publish`) via `createSupabaseServiceRoleClient()`, returning a typed `{ kind: 'value', ... } | { kind: 'infra_error' }`. The settings page calls it once and maps to the four existing initial shapes. Keep the four existing single-column getters untouched (other callers, incl. sync, depend on them). `Promise.all` the three independent top-level loads on the page (combined flags reader, `fetchDriveConnectionHealth`, `fetchEmbeddedAdminEmails`). **The combined reader is a NEW Supabase call site → add an invariant-9 registry row (admin meta-test) — see §6. Expected ~60-200ms.**

**A4 · `app/admin/show/[slug]/page.tsx` + `lib/sync/feed/readShowChangeFeed.ts`.** Once `show.id` is known, `Promise.all` the three independent loads `readShowChangeFeed` + `crew_members` + `loadShowShareToken`; resolve `nowDate()` once. Inside `readShowChangeFeed`, `Promise.all` the three service-role reads (log rows, count, sync_holds) — each keeps its `runFeedRead`/typed-`SyncInfraError` handling. **Expected ~120-360ms.**

### Workstream B — admin auth gate (`lib/auth/requireAdmin.ts`)

**B1 · `getUser()` → `getClaims()`.** Replace the `supabase.auth.getUser()` call (L165) with `supabase.auth.getClaims()` (local ES256 verification against the cached JWKS; self-falls-back to a network check if it cannot verify locally). Map the result to preserve the **exact three-way control flow**:
- `error` (verification/infra failure) → `AdminInfraError` (preserves the auth meta-test contract that `requireAdmin` throws `AdminInfraError`, never `forbidden()`, on infra fault).
- no claims / null session (the `getClaims` "no session" outcome — confirm the precise shape during impl: `{ data: null, error: null }`) → `redirectToSignIn()` (preserves today's `isAuthSessionMissingError` → redirect branch).
- claims present → `email = canonicalize(claims.email)`; falsy → `redirectToSignIn()` (today's L188 branch).

**B2 · keep `is_admin()` RPC.** After a valid email is derived, still call `supabase.rpc("is_admin")` for the authorization decision (`data !== true` → `forbidden()`). `is_admin` is the DB-backed source of truth (`admin_emails`, runtime-mutable); claims alone cannot determine membership. Unchanged from today.

**B3 · `React.cache()` the resolution.** Extract the expensive, layer-independent resolution into a **no-arg** cached core: `const resolveAdminIdentity = cache(async (): Promise<AdminIdentity> => { create client → getClaims → email → is_admin → return {email} })`. `requireAdminIdentity(opts)` runs the layer-specific `maybeForceTestInfraFail(forceHeaders, layer)` hook **outside** the cache (it must fire per-layer), then `return resolveAdminIdentity()`. `requireAdmin(opts)` keeps its current shape (own hooks + delegate to `requireAdminIdentity()` with no opts, preserving the latent-but-pinned L238 behavior). Because the core is no-arg, the layout gate (`{layer:"layout"}`) and the page gate (`{layer:"page"}`) share one resolution per request → one `getClaims` (local, free) + one `is_admin` RPC instead of two of each.

**Net per nav:** cross-segment entry into `/admin` `2 network + 2 RPC` → `0 network + 1 RPC`; intra-`/admin` page nav `1 network + 1 RPC` → `1 RPC` (`getClaims` local).

**B-SEC · Security posture — auth freshness (EXPLICITLY ACCEPTED + BOUNDED).** Replacing the `getUser()` Auth-server call with locally-verified `getClaims()` changes auth *freshness*, so this is **not** freshness-preserving and is called out here explicitly (Codex spec R1 HIGH). Precise delta analysis:
- **Authorization is unchanged and remains LIVE.** `is_admin()` (B2, kept) reads `auth.jwt()` + the runtime-mutable `admin_emails` table on **every** gate. The app's actual admin-revocation path is removing/`revoked_at`-ing the row in `admin_emails` — that takes effect on the **next** `is_admin()` call, immediately, identically under `getUser` or `getClaims`. So revoking an admin's privileges is **not** affected by this change.
- **Role-claim staleness is PRE-EXISTING, not introduced here.** `is_admin()`'s `app_metadata.role = 'admin'` branch reads `auth.jwt()` (the token), not live user metadata — so a stale `role` claim already passes until token refresh **today**, with `getUser`. This change does not alter that.
- **The ONLY new delta:** a Supabase *authentication*-level revocation that `getUser` would catch by calling the Auth server — a **deleted auth user** or a **globally-signed-out/revoked session** — is, under `getClaims`, only caught at the next access-token refresh, i.e. bounded by the access-token TTL (Supabase default ~1 hour). And only matters for a principal who is *also* still an admin (in `admin_emails` or `jwt.role`).
- **Why this bound is accepted for this app:** the admin set is two trusted owners managed via `admin_emails` (immediate revocation path, checked live by `is_admin`); there is no operational flow that deletes an owner's auth user or globally revokes their session as a security action while leaving them admin-eligible. `getClaims()` is Supabase's **recommended** server-side/SSR auth method precisely because it avoids the per-request Auth-server round-trip; it self-falls-back to a network check when it cannot verify locally. The residual ≤TTL window for the exotic deleted-user/revoked-session case is an accepted trade for removing the every-nav Auth-server hop.
- **If this bound is ever unacceptable** (e.g. a future multi-admin/external-admin model), the documented escalation is to add a session-freshness check after `getClaims()` (validate `claims.session_id` against `auth.sessions` via a SECURITY DEFINER RPC) — filed to BACKLOG, NOT implemented this phase.
- **Tests pin the live-authorization guarantee** (§7): a principal with valid admin-shaped claims but **not** in `admin_emails` (and no `role:'admin'` claim) → `is_admin=false` → `forbidden()` (proves authorization is live, not claim-cached); `getClaims` error → `AdminInfraError`; absent/empty claims → `redirectToSignIn()`. The accepted ≤TTL deleted-user window is documented, not asserted (it is the explicitly-accepted bound).

---

## 5. Guard conditions / edge cases (every changed path)

- **`getClaims` no-session vs error:** the redirect-vs-throw distinction is load-bearing (unauthed users must reach sign-in, infra faults must surface as 500-class). Tests pin all three outcomes. If `getClaims`'s no-session shape is ambiguous, treat "no error AND no usable claims/email" as unauthed→redirect, and only a non-null `error` as infra→`AdminInfraError`.
- **`Promise.all` partial failure:** because supabase queries resolve (not reject), one failing read yields `{data:null, error}` in its slot and is discriminated per-read — the wave does not abort the others. For the A5 RPC wave and any genuinely-throwing call, wrap each in its own `try`/`.catch` so a throw maps to the same per-call fallback as today (never a whole-wave rejection). **Never `Promise.allSettled`.**
- **`getShowForViewer` financials gating:** when `!isLead`, the financials promise must be omitted from the wave (not awaited-then-discarded) so non-LEAD viewers issue zero financials reads — preserving current behavior and access posture.
- **`purgeAndRotateIfStale` gate:** when `pending_wizard_session_at !== null` the call runs exactly as today (rotation/suppression logic untouched). The only change is skipping a guaranteed no-op tx when it is `null`. A concurrent mint between the settings read and the (skipped) call is acceptable: the next request observes the non-null value and runs the rotation — identical to today's behavior where the function itself re-reads under its tx.
- **Empty inputs:** `activeShowIds.length === 0` short-circuits (existing guards retained); `inFlightIds` empty → `Promise.all([])` → empty set (no-op), matching today.

---

## 6. Meta-test inventory (invariant 9) — mandatory declaration

- **`tests/auth/_metaInfraContract.test.ts`** — `requireAdmin` already registered (must still throw `AdminInfraError` on construction/getClaims/RPC fault). The grep-shape assertions (`const { data, error }` destructure; constructor-in-`try`) must continue to match after the `getUser→getClaims` swap and the `cache()` extraction. **Action:** keep the `{ data, error }` destructure on `getClaims`, keep `createSupabaseServerClient()` inside its `try`. Add/adjust behavioral rows for the three `getClaims` outcomes.
- **`tests/admin/_metaInfraContract.test.ts`** — `fetchDashboardData` (L175), `fetchUnresolvedAlertCount` (L222), `loadNeedsAttentionCount` (L216) registered. Parallelizing `fetchDashboardData` must keep every supabase await inside `try/catch` (grep-shape L303-412) and the typed `infra_error` behavior. **Action:** add registry rows for **two** new service-role call sites: (1) the A3 combined settings reader (`lib/appSettings/getSettingsPageFlags.ts`), and (2) the A2 pre-read helper (`lib/appSettings/readAppSettingsRow.ts`). Both return discriminated `{ kind: 'value' | 'infra_error' }`; register each (registry row preferred over an inline `// not-subject-to-meta:` waiver).
- **`tests/sync/_metaInfraContract.test.ts`** — `readShowChangeFeed` (L339), `getAutoPublishCleanFirstSeen` (L84) registered. Parallelizing `readShowChangeFeed`'s three reads must preserve the typed `SyncInfraError` mapping; the dedicated `readShowChangeFeed.infra.test.ts` must still pass. **Action:** no registry change (signatures unchanged); re-run the infra test.
- **`tests/admin/no-inline-email-normalization.test.ts`** — covers `lib/auth/requireAdmin.ts`. **Action:** keep `canonicalize()` the only normalization; no inline `.toLowerCase()/.trim()`.
- **No new RPC-gated table** → PostgREST DML lockdown N/A. **No migration** → validation-schema-parity N/A.

---

## 7. Testing strategy (TDD per task)

Each task: failing test → minimal impl → green → commit (conventional commits, `perf(...)`/`refactor(...)`/`test(...)`).

- **Parallelization (A1-A5):** assert concurrency, not just "function called." Use a mock supabase client whose reads resolve on a controllable deferred; assert that the second/third reads are *initiated* before the first resolves (i.e., the loader issued them concurrently) — a serial implementation fails this. Derive expected read-counts from the fixture, and assert error discrimination is preserved (inject `{data:null,error}` into one slot → that tile's `tileErrors`/typed-error set, others unaffected). Concrete failure mode each test catches: re-serialization regression, and dropped per-read error discrimination.
- **A2 gate + `readAppSettingsRow`:** with `pending_wizard_session_at = null`, assert `purgeAndRotateIfStale` is **not invoked** (spy) and the page renders with the pre-read settings; with non-null, assert it **is** invoked and behavior is unchanged; with the pre-read returning `{kind:'infra_error'}` (inject returned `error` AND a thrown query/client error — two cases), assert it **falls back** to calling `purgeAndRotateIfStale` (no false settled render). Also the invariant-9 behavioral rows for `readAppSettingsRow`: returned Supabase error → `infra_error`; thrown `.from()`/client-construction → `infra_error`; missing default row → typed result (not a crash).
- **B1/B2/B3:** (1) `getClaims` used, `getUser` not on the gate path; (2) outcomes — valid admin claims + `is_admin=true` → `{email}`; no/empty claims → `redirectToSignIn`; `getClaims` error → `AdminInfraError`; `is_admin=false` → `forbidden`; (3) `React.cache` dedup: render a tree that calls the gate twice (layout-layer + page-layer) in one request and assert exactly one `getClaims` and one `is_admin` RPC fire (spy counts) — a non-cached impl fires two of each; (4) **live-authorization (B-SEC):** a principal with valid, well-formed admin-shaped claims (valid `getClaims`, has `email`) but whose email is **not** in `admin_emails` and has no `role:'admin'` claim → `is_admin` returns `false` → `forbidden()` — proving authorization is decided live by `is_admin`, never cached from claims.
- **Anti-tautology:** auth tests assert against the spy/observable Supabase calls, not against a wrapper that would pass trivially; dashboard concurrency asserted via the deferred-resolution harness, not via a container that renders regardless.

---

## 8. Risks / watchpoints (pre-load the adversarial reviewer)

- **DO NOT relitigate Invariant 8:** Phase 1 touches Server-Component *data-fetch code* in `app/admin/*` pages but **no rendered markup/CSS/components** — no visual surface, so the impeccable dual-gate does not apply. (Citation: §1 scope; the edits are to `await`/data plumbing, not JSX.)
- **Auth-freshness bound is EXPLICITLY ACCEPTED (§B-SEC), not an oversight.** `getClaims` is freshness-bounded by access-token TTL only for the deleted-user / revoked-session case; admin *authorization* stays live via `is_admin()`+`admin_emails` on every gate, and role-claim staleness is pre-existing (is_admin reads `auth.jwt()` under `getUser` too). Resolved in Codex spec R1 — do not re-raise as a blocker; the session-freshness RPC escalation is filed to BACKLOG for any future external-admin model.
- **DO NOT switch to `Promise.allSettled`** — supabase queries resolve, so `Promise.all` + per-result `{data,error}` discrimination preserves invariant 9; `allSettled` would erase the typed-error contract.
- **getClaims is real** — verified at runtime + in `@supabase/auth-js@2.105.1` types (`GoTrueClient.getClaims`); asymmetric ES256 keys confirmed on the linked project's JWKS. Not a hypothetical.
- **Latent `requireAdmin` L238 layer-drop is intentional-to-preserve** — not in scope to fix; the `cache()` refactor must not change observable layer behavior.
- **Grep-shape meta-tests** — the `getUser→getClaims` swap and `cache()` extraction must keep `const { data, error }` destructuring and the construction-in-`try` shape so the structural assertions keep matching.
- **`getShowForViewer` is not invariant-9-registered** — its soft `tileErrors` contract and fail-closed crew/show guards are the binding invariants; parallelization preserves both.

---

## 9. Deferred / follow-up (filed)

- **BACKLOG:** tag-based caching tied to sync (`use cache` + `cacheTag('show:<id>')` + `revalidateTag` from the sync write path) — the "real" caching answer; needs a Supabase→Next invalidation bridge.
- **BACKLOG:** admin-gate session-freshness check (validate `getClaims().claims.session_id` against `auth.sessions` via a SECURITY DEFINER RPC) — only needed if the admin model grows beyond the two trusted owners (see §B-SEC accepted bound).
- **DEFERRED (Phase 2 / later):** `CrewSubNav` prefetch re-enable pending the projection-side-effect refactor; verify a separate production project's JWKS before relying on local `getClaims` there.

---

## 10. Expected outcome

Migration-free, UI-free server-latency reduction: crew-page and admin navigations issue 1-2 parallel read waves instead of ~8-13 serial round-trips, and the admin auth gate drops from up to 2 network hops + 2 RPCs to 0 network hops + 1 RPC per request. Always-fresh semantics unchanged.
