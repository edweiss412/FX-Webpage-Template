# Handoff — M5: Auth (signed-link cookie + Google OAuth + admin precedence)

**Handed off:** 2026-05-03 by Eric Weiss
**Implementer:** **split-mode (manual / Level 1)** — backend = **GPT-5.5 / Codex CLI**, UI = **Opus 4.7 / Claude Code**, two concurrent terminals coordinating through this doc. Per `ROUTING.md` M5 row + UI hard rule. Backend goes first because its cookie/JWT/validator contracts are what the UI consumes.
**Adversarial reviewer:** Opus 4.7 / Claude Code (per ROUTING.md M5 row — "the cross-model adversarial review still pairs across milestones, not across split-tasks: M5's reviewer is the opposing harness for whichever side ran more of the milestone's task count" → backend is the larger surface, so the cross-model partner is Opus).
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/05-auth.md` (Tasks 5.1–5.11; lines 1–411).

---

## 0. Implementer split (manual / Level 1)

This is the first split-mode milestone the project has run. The two task lists below are **disjoint by file path**; neither implementer commits files outside their list without an explicit handoff note in this doc. Coordination protocol:

- **Backend session ships first.** All §A files land before §B starts. The UI session imports concrete signatures, not stubs. Without this ordering Opus would be writing against placeholder validator contracts and burning rework when Codex finalizes the tri-state outcome shape.
- **Both sessions commit per task** per AGENTS.md §1.6 (one task per commit, conventional-commits format `<type>(<scope>): <summary>`).
- **Both sessions append to this handoff's Convergence log** during adversarial review. Don't rebase or squash each other's commits.
- **§B is allowed to land helpers under `lib/` only when the helper is a UI-side concern** (e.g., a small `lib/messages/lookup.ts` rendering helper). All auth-shaped `lib/auth/**` modules are §A territory.
- **Task 5.7's `app/show/[slug]/page.tsx` modification is `§B`** — it's a `.tsx` file under `app/` (not `app/api/`). The validator wiring it imports comes from §A.
- **Task 5.9's UI banner is §B**; the `lib/messages/catalog.ts` + `lib/messages/lookup.ts` modules it consumes are §A.
- **Task 5.10's `app/me/page.tsx` is §B**; the `lib/auth/validateGoogleIdentity.ts` + `lib/data/listShowsForCrew.ts` it consumes are §A.

### §A — Codex / backend tasks (ship first; UI consumes these contracts)

Files Codex creates / modifies (all under `lib/`, `app/api/`, `middleware.ts`, or `supabase/migrations/`):

- **Task 5.1** — `lib/auth/jwt.ts` + `tests/auth/jwt.test.ts` (`signLinkJwt`, `verifyLinkJwt`, key-id capture for §7.2.3 global rotation).
- **Task 5.2** — `lib/auth/validateLinkSession.ts`, `lib/auth/constants.ts`, `lib/auth/cookies.ts` (the shared `__Host-fxav_session` helper module: `setSessionCookie` / `clearSessionCookie` / `encodeSessionCookieValue` / `decodeSessionCookieValue`) + `tests/auth/validateLinkSession.test.ts` (twelve §7.2.2 steps + parse/format-fault enumeration + step 3a kid-rotation + step 5 reachability via `ON DELETE SET NULL`).
- **Task 5.3** — `lib/auth/validateGoogleSession.ts` + `tests/auth/validateGoogleSession.test.ts` (`AMBIGUOUS_EMAIL_BINDING` + cross-show binding + admin_alerts UPSERT).
- **Task 5.4** — `app/api/auth/redeem-link/route.ts` + `tests/e2e/redeem-link.spec.ts` (login-CSRF defense, bootstrap-nonce composite-key consume, `LINK_REDEEM_KEY_ROTATED` gate, `verifiedKid`-pinned `link_sessions.signing_key_id` write). **Schema migration**: this task introduces `bootstrap_nonces (nonce_hash, show_id, issued_at, consumed_at, signing_key_id)` with composite PK `(nonce_hash, show_id)` — ship as `supabase/migrations/2026050400000<n>_bootstrap_nonces.sql` AND add to AC-2.1's REQUIRED FK introspection list AND to the §4.3 admin-only RLS table list. Also add `link_sessions.signing_key_id` column if it isn't already present from M2.
- **Task 5.6** — `middleware.ts` at repo root + `tests/e2e/leaked-link.spec.ts` (`?t=` compromise handler scans every `^/show/[^/]+` request, three branches: `=` / `<` / `>` of `current_token_version` with idempotent `revoked_links` INSERT).
- **Task 5.7 §A portion** — `lib/auth/isAdminSession.ts` + `tests/auth/isAdminSession.test.ts`. The shared admin-detection predicate. The `app/show/[slug]/page.tsx` chain wiring is §B.
- **Task 5.8 §A portion** — `app/auth/callback/route.ts`, `app/auth/sign-out/route.ts`, `lib/auth/validateNextParam.ts` + `tests/auth/oauth-flow.test.ts` (validator + callback + sign-out routes). The `app/auth/sign-in/page.tsx` Server Component is §B.
- **Task 5.9 §A portion** — `lib/messages/catalog.ts`, `lib/messages/lookup.ts` (M5-needed §12.4 entries: `LINK_*`, `SESSION_*`, `LINK_SESSION_KEY_ROTATED`, `LINK_REDEEM_KEY_ROTATED`, `AMBIGUOUS_EMAIL_BINDING`, `LEAKED_LINK_DETECTED`, `CSRF_DENIED`, `CSRF_NONCE_EXPIRED`, `CSRF_KEY_ROTATED`, `OAUTH_STATE_INVALID`, `OAUTH_REDIRECT_INVALID`, plus the §4.6 alert codes the banner renders). The banner UI itself is §B.
- **Task 5.10 §A portion** — `lib/auth/validateGoogleIdentity.ts`, `lib/data/listShowsForCrew.ts` + `tests/auth/validateGoogleIdentity.test.ts` (deliberately non-DRY-with-`validateGoogleSession`; no `crew_members` query; no show binding).
- **`lib/auth/requireAdmin.ts`** — UPDATE the M3 stub body with the production implementation. The interface stays stable (per M3 handoff §4 note); body now reads Supabase Auth session via `@supabase/ssr` + canonical email allowlist via the `is_admin()` SQL helper. Delete M3's `tests/e2e/helpers/signInAs.ts` minimal-stub `ADMIN_FIXTURE` / `NON_ADMIN_CREW_FIXTURE` only AFTER §B has migrated its tests onto the real OAuth flow.
- **DEFERRED M2-D6** — `lib/db/advisoryLock.ts` (the per-show advisory-lock helper). Codex authors this in M5 because the auth-side mutation paths (Task 5.4 `link_sessions` INSERT, Task 5.6 `revoked_links` + `crew_member_auth` UPDATEs) are the first code paths that need it. Spec invariant §1.2 mandates `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` on every code path that mutates `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`. The helper exposes a `withShowAdvisoryLock(showId, mode, fn)` shape; tests assert the lock is held during the callback. Mark M2-D6 "in progress" → Codex closes it in this milestone.

### §B — Opus / UI tasks (after §A lands; consumes finalized contracts)

Files Opus creates / modifies (UI surface only — `app/` outside `app/api/**`, `components/`, design tokens):

- **Task 5.5** — `app/show/[slug]/p/page.tsx` + `app/show/[slug]/p/Bootstrap.tsx` + `tests/e2e/bootstrap.spec.ts` (server-rendered shell that mints the bootstrap-nonce row + cookie via §A's `bootstrap_nonces` migration; client-side script reads `location.hash`, POSTs to `/api/auth/redeem-link`, then `history.replaceState`s the fragment away). **Coordination:** the Bootstrap.tsx HTML must embed `<meta name="bootstrap-nonce" content="...">` + `<meta name="bootstrap-show" content="<show-uuid>">` for the client script to echo back. Server-side mint logic is §B's responsibility because the page is a Server Component, but the SQL it issues uses Codex's `bootstrap_nonces` migration + `withShowAdvisoryLock`. Confirm both shipped before starting.
- **Task 5.7 §B portion** — modify `app/show/[slug]/page.tsx` to wire the four-step auth chain: `isAdminSession` → `validateLinkSession` → `validateGoogleSession` → `requireAdmin`. Imports from §A. Page passes only `{ kind, crewMemberId?, showId }` identity to `getShowForViewer` (no `viewerRole` per Task 4.3 contract). Includes the chain-adapter `clearCookie` plumbing — when ANY validator returns `{ kind: 'continue', clearCookie: true }`, response calls `clearSessionCookie` from §A's `lib/auth/cookies.ts`.
- **Task 5.8 §B portion** — `app/auth/sign-in/page.tsx` (Server Component; reads active session + redirect-loop guard; renders `<ErrorExplainer code={searchParams.code} />` with allowlist regex `^[A-Z_]{1,64}$` + `{ OAUTH_STATE_INVALID, OAUTH_REDIRECT_INVALID }`). Imports `validateNextParam` from §A.
- **Task 5.9 §B portion** — `components/admin/AlertBanner.tsx` + modify `app/admin/layout.tsx` to mount it. Banner reads `WHERE resolved_at IS NULL ORDER BY raised_at DESC` and renders the topmost via §A's `messageFor(alert.code).dougFacing`. **`<ErrorExplainer>` component** (referenced by Task 5.8 §B) ALSO lives here under `components/messages/ErrorExplainer.tsx` — shared between sign-in page and admin banner where any user-visible §12.4 code is rendered.
- **Task 5.10 §B portion** — `app/me/page.tsx` (Server Component; calls §A's `validateGoogleIdentity` then §A's `listShowsForCrew`; renders the show list as cards). On `continue` outcome 302-redirects to `/auth/sign-in?next=/me`.
- **Playwright e2e suite** — extend `tests/e2e/helpers/signInAs.ts` to wire the real OAuth flow (replace M3's minimal `ADMIN_FIXTURE` / `NON_ADMIN_CREW_FIXTURE` stubs); add `tests/e2e/auth-chain.spec.ts` covering admin-precedence, A→B→A burn pattern, malformed-cookie + valid-Google fallthrough, sign-out cookie-family teardown.
- **Task 5.11 demo verification** — Opus drives this end-to-end in dev (`/auth/sign-in` → OAuth → `/me` → `/show/<slug>` → demote LEAD → refresh → Financials disappears → leak `?t=` URL → 410 → `/auth/sign-out` → cookie family cleared).

### What is NOT in either list

- **DESIGN.md edits.** M4 closed DESIGN.md as canon. M5 introduces no new tokens; if a new sign-in-page / `/me` color or spacing surface is needed and isn't already in DESIGN.md, raise it as a question before adding — don't silently extend the design system mid-milestone.
- **`/admin/dev` panel.** Pre-policy operator surface (M3). M5 does not touch it.
- **Realtime invalidation channel.** M4 closed it; M5 only uses it (the cookie state-change trigger from `validateLinkSession` step 3a's row DELETE will fire the existing `crew_member_auth.last_changed_at` trigger Task 4.16 introduced).

---

## 1. Spec sections in scope

Plan §M5 cites `Spec context: §7 entire section, §17.1 milestone 5.` In practice every M5 task brushes one or more of:

- **§7.2** — Signed-link redemption flow + `?t=` compromise handler + bootstrap-nonce contract + JWT signing-key rotation.
- **§7.2.1** — `link_sessions` schema (FK `ON DELETE SET NULL` on `crew_member_id`; `signing_key_id` column; composite uniqueness).
- **§7.2.2** — 12-step `validateLinkSession` validator (steps 1–9 failure paths + step 3a kid-rotation + step 5 reachability via FK semantics + step 10 idle-window advance).
- **§7.2.3** — Global signing-key rotation workflow (`app_settings.active_signing_key_id`).
- **§7.3** — Authorization gate ("Google session OR redeemed-link cookie OR admin"); `/me` cross-show signed-in surface; `/auth/sign-in` / `/auth/callback` / `/auth/sign-out` route contracts.
- **§7.4** — `getShowForViewer` shape + role re-derivation (validator returns identity ONLY; role re-derives in `getShowForViewer` from `crew_members.role_flags` per call).
- **§4.3** — Admin-only RLS table list (add `bootstrap_nonces` to the matrix).
- **§4.6** — `admin_alerts` UPSERT + banner contract (`AMBIGUOUS_EMAIL_BINDING` UPSERT semantics; coalescing; resolved_at clears banner).
- **§4.1** — `bootstrap_nonces` table schema (composite PK + `signing_key_id`).
- **§12.4** — Error-code catalog (the M5-required entries Codex pulls forward into `lib/messages/catalog.ts`; X.1 verifies parity).
- **§17.1** — Per-milestone acceptance criteria: AC-5.1..AC-5.14 at spec lines `:3381-3400`.

## 2. Acceptance criteria

Verbatim from spec §17.1 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:3381-3400`). Every AC ID has at least one §A-side or §B-side test.

- **AC-5.1** — cookie missing OR `link_sessions.token` not found → 401 (no row to delete). [§A · Task 5.2]
- **AC-5.2** — `expires_at <= now()` (12h absolute) → 401 (`SESSION_ABSOLUTE_TIMEOUT`); DELETE row. [§A · Task 5.2]
- **AC-5.3** — single host-wide cookie + show-id-bound JSON payload; cross-show A→B→A burn pattern (cookie cleared on cross-show navigation, `link_sessions` row DELETEd, no per-show cookie naming). [§A · Task 5.2 + §B · Task 5.7 chain regression test]
- **AC-5.3a** — §7.2.2 step 5 reachability: ON DELETE SET NULL preserves the `link_sessions` row with `crew_member_id IS NULL`; validator then returns `{ kind: 'continue', clearCookie: true, priorFailure: { status: 410, code: 'LINK_NO_CREW_MATCH' } }` AND DELETEs the row. [§A · Task 5.2]
- **AC-5.4** — `link_sessions.jwt_token_version !== crew_member_auth.current_token_version` → 410 (`LINK_VERSION_MISMATCH`); DELETE row. [§A · Task 5.2]
- **AC-5.5** — `jwt_token_version <= revoked_below_version` → 410 (`LINK_REVOKED_FLOOR`); matching `revoked_links` row → 410 (`LINK_REVOKED_SURGICAL`); DELETE row. [§A · Task 5.2]
- **AC-5.6** — `last_active_at < now() - interval '15 minutes'` → 401 (`SESSION_IDLE_TIMEOUT`); DELETE row. Pass advances `last_active_at`. [§A · Task 5.2]
- **AC-5.6a** — `JWT_SIGNING_SECRET` rotation (`active_signing_key_id` flip k1 → k2) atomically invalidates all live redeemed-link sessions: validator returns `terminal_failure` 401 `LINK_SESSION_KEY_ROTATED`, DELETEs row, response Set-Cookie clears `__Host-fxav_session`. Cross-route: same cookie now 401s against `/api/realtime/subscriber-token` AND `/api/show/[slug]/version`. [§A · Tasks 5.1 + 5.2; cross-route verification with M4 routes]
- **AC-5.7** — `validateGoogleSession` rejects a Supabase Auth user whose email doesn't match any crew row in the show → 403 `GOOGLE_NO_CREW_MATCH`. [§A · Task 5.3]
- **AC-5.8** — `validateGoogleSession` multi-match within same show → 500 `AMBIGUOUS_EMAIL_BINDING`. [§A · Task 5.3]
- **AC-5.9** — LEAD viewer's `getShowForViewer` payload includes `shows_internal.financials`; non-LEAD omits. Both include `shows.coi_status`. [§B · Task 5.7]
- **AC-5.10** — Demote LEAD → A1 in DB simulating sync; refresh; Financials tile disappears within one render cycle without token rotation. ShowStatus tile (incl. COI) unchanged. [§B · Task 5.7]
- **AC-5.11** — `?t=` URL compromise handler covers all three branches per §7.2 (`=` / `<` / `>` of `current_token_version`). [§A · Task 5.6]
- **AC-5.12** — Synthesized duplicate-email runtime condition writes an `admin_alerts` row visible in dashboard banner; resolving removes banner. [§A · Task 5.3 (DB write) + §B · Task 5.9 (banner render)]
- **AC-5.13** — `/api/auth/redeem-link` login-CSRF defense (Origin/Sec-Fetch + bootstrap-nonce composite-key consume); `CSRF_DENIED` vs `CSRF_NONCE_EXPIRED` producer matrix; multi-instance + show-swap regression coverage. [§A · Task 5.4 (route + nonce minting) + §B · Task 5.5 (bootstrap shell rendering the nonce)]
- **AC-5.14** — Google OAuth sign-in / callback / sign-out flow (canonical `?code=` URL handoff carrying `OAUTH_STATE_INVALID` / `OAUTH_REDIRECT_INVALID`; redirect-loop guard; PKCE verifier cleanup on success AND failure; sign-out atomically clears Supabase Auth + `__Host-fxav_session`). [§A · Task 5.8 routes + §B · Task 5.8 sign-in page]

## 3. Spec amendments in scope

- [ ] Amendment 1 — listForRepo recovery contract — **N/A — only M8.**
- [ ] Amendment 2 — created_at horizon + lease-expired reaper predicate — **N/A — only M8.**
- [ ] Amendment 3 — `lease_holder` ownership protocol — **N/A — only M8.**

M5 does not touch the report pipeline. The M2 `reports.lease_holder` column was provisioned inline; M5 leaves it alone.

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0, M1, M2, M3, M4 closed. Current `git log` head at handoff authoring is `29f7106 docs(handoff): record M4 adversarial review convergence (8 rounds, approved)`. Working tree clean.
- [x] **Pre-flight tests passing in isolation** (do NOT parallelize with Playwright — see M4 handoff §4 note about Layer 2 HTTP test un-skipping):
  - `pnpm lint` exits 0.
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0 with **1208 vitest tests + 5 skipped** standalone (M4 close-out state).
  - `pnpm test:e2e --project=mobile-safari` exits 0 with **115 + 35 skipped** Playwright tests.
- [x] **Specific files present**:
  - [x] All M0–M4 deliverables (DESIGN.md, parser modules, schema migrations, dev panel, all tile components, `getShowForViewer`, `lib/visibility/*`, `lib/realtime/*`, `lib/auth/resolveShowViewer.ts`, `lib/messages/lookup.ts` minimal version from M4).
  - [x] `lib/auth/requireAdmin.ts` — M3 stub. M5 §A replaces the body.
  - [x] `tests/e2e/helpers/signInAs.ts`, `ADMIN_FIXTURE`, `NON_ADMIN_CREW_FIXTURE` — M3 minimal stubs. §B replaces with real OAuth flow.
  - [x] `link_sessions` table — created in M2; M5 §A adds `signing_key_id` column if not already present.
  - [x] `crew_member_auth.current_token_version` / `max_issued_version` / `revoked_below_version` — created in M2.
  - [x] `revoked_links` table — created in M2.
  - [x] `app_settings.active_signing_key_id` — created in M2 with seed value `'k1'`.
  - [x] `admin_alerts` table — created in M2 with §4.6 partial unique index `(show_id, code) WHERE resolved_at IS NULL`.
  - [ ] **`lib/auth/jwt.ts` does NOT exist.** Task 5.1.
  - [ ] **`lib/auth/validateLinkSession.ts`, `lib/auth/validateGoogleSession.ts`, `lib/auth/validateGoogleIdentity.ts`, `lib/auth/isAdminSession.ts`, `lib/auth/cookies.ts`, `lib/auth/constants.ts`, `lib/auth/validateNextParam.ts` do NOT exist.** Tasks 5.2 / 5.3 / 5.7 / 5.8 / 5.10.
  - [ ] **`app/api/auth/redeem-link/route.ts` does NOT exist.** Task 5.4.
  - [ ] **`middleware.ts` at repo root does NOT exist.** Task 5.6.
  - [ ] **`app/auth/sign-in/page.tsx`, `app/auth/callback/route.ts`, `app/auth/sign-out/route.ts` do NOT exist.** Task 5.8.
  - [ ] **`app/show/[slug]/p/page.tsx`, `app/show/[slug]/p/Bootstrap.tsx` do NOT exist.** Task 5.5.
  - [ ] **`app/me/page.tsx`, `lib/data/listShowsForCrew.ts` do NOT exist.** Task 5.10.
  - [ ] **`components/admin/AlertBanner.tsx`, `components/messages/ErrorExplainer.tsx`, `lib/messages/catalog.ts` do NOT exist.** Task 5.9. (Note: `lib/messages/lookup.ts` minimal version DOES exist from M4 — Task 5.9 §A EXTENDS the catalog, doesn't recreate the file.)
  - [ ] **`bootstrap_nonces` table does NOT exist.** Task 5.4 ships the migration.
  - [ ] **`lib/db/advisoryLock.ts` does NOT exist.** DEFERRED M2-D6 — §A ships in this milestone.
- [x] **Specific env vars set in `.env.local`**:
  - [x] M0–M4 vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_DEV_PANEL_ENABLED`, `TEST_AUTH_SECRET`, `ENABLE_TEST_AUTH`, `SUPABASE_JWT_SECRET`, `SUPABASE_REALTIME_ISS`).
  - [ ] **M5 introduces** `JWT_SIGNING_SECRET` (HS256 signing key for `lib/auth/jwt.ts`; distinct from `SUPABASE_JWT_SECRET` which is the Realtime issuer key — do not reuse), `NEXT_PUBLIC_SITE_ORIGIN` (e.g., `https://crew.fxav.show`; consumed by `validateNextParam` + redeem-link Origin gate + bootstrap-shell render), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (for `@supabase/ssr` client-side init), and the Google OAuth client credentials Supabase Auth needs (`SUPABASE_AUTH_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_GOOGLE_CLIENT_SECRET` if not already configured at the Supabase project level — most installs configure these in the Supabase dashboard, not `.env.local`). Document the additions in `.env.local.example` when each task lands.
- [x] **Database migrations applied**: all M0–M4 migrations applied to local Supabase. Task 5.4 introduces a new migration adding `bootstrap_nonces (nonce_hash text, show_id uuid REFERENCES shows(id) ON DELETE CASCADE, issued_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz, signing_key_id text NOT NULL DEFAULT 'k1', PRIMARY KEY (nonce_hash, show_id))` plus an admin-only RLS policy matching §4.3 plus a periodic-cleanup cron entry deleting rows older than 5 minutes. If `link_sessions.signing_key_id` is not already present from M2 (verify before starting Task 5.2), add it as part of the same migration. Apply via `pnpm dlx supabase db reset && pnpm db:seed`.

If any required pre-flight command fails, do NOT start the next M5 task. Stop and report.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** (always applies). Every task: failing test → minimal implementation → passing test → commit. Self-review runs after.
- [x] **Per-show advisory lock** — **fully active for §A**. Tasks 5.4 (`/api/auth/redeem-link` mutates `link_sessions` + `bootstrap_nonces`), 5.6 (`middleware.ts` mutates `revoked_links` + `crew_member_auth`), and any future code path that mutates `crew_member_auth` (e.g., admin "Issue New Link" — out of M5 scope but in M9/M10) MUST run inside `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`. The helper `lib/db/advisoryLock.ts` (DEFERRED M2-D6) ships in this milestone; tests assert the lock is held during the callback. Verification command: `pnpm test tests/db/advisory-lock.test.ts` and `pnpm test tests/auth/validateLinkSession.test.ts -t "advisory lock"`.
- [x] **Email canonicalization at boundary** — **fully active**. Task 5.3 (`validateGoogleSession`) reads `supabase.user.email` and MUST route through `lib/email/canonicalize.ts` BEFORE any DB query. Task 5.10 (`validateGoogleIdentity` / `listShowsForCrew`) same. M5 must NOT introduce any new inline `.toLowerCase()` / `.trim()` on email strings. Static guard already exists at `tests/admin/no-inline-email-normalization.test.ts` (M3); extend its glob to cover `lib/auth/**` and `lib/data/**`.
- [x] **No global cursor** — applies. Verification: `! rg "lastPollAt" lib app supabase tests` returns zero matches at M5 close (M3+M4 already pass this).
- [x] **No raw error codes in user-visible UI** — **fully active**. Tasks 5.7 (`app/show/[slug]/page.tsx` chain failure renders), 5.8 (sign-in `<ErrorExplainer>`), 5.9 (admin alert banner), 5.10 (`/me` empty-state) all route through `lib/messages/lookup.ts` `messageFor(code, params?)`. Codex extends the catalog in Task 5.9 §A; Opus consumes via `<ErrorExplainer>`. Test command: a regression spec that scans every M5-introduced page DOM for raw `LINK_*`/`SESSION_*`/`OAUTH_*`/`AMBIGUOUS_*`/`CSRF_*`/`LEAKED_*` literal strings (excluding `data-testid` + HTML comments) and fails if any are found.
- [x] **Commit per task** — applies. AGENTS.md §1.6: `<type>(<scope>): <summary>` (e.g., `feat(auth): jwt helpers (§7.2) + signing-key-id capture for global rotation`, `feat(auth): validateLinkSession 12-step validator (§7.2.2)`, `feat(auth): /api/auth/redeem-link with opaque-token cookie + login-CSRF defense (§7.2)`, `feat(auth): ?t= compromise handler scans every /show/** request (§7.2)`, `feat(auth): role-based hiding wired with admin path (§7.4)`, `feat(auth): Google OAuth sign-in / callback / sign-out (§7.3, AC-5.14)`, `feat(admin): alert banner + minimal §12.4 catalog (§4.6, §12.4)`, `feat(crew-page): /me signed-in show list with validateGoogleIdentity`, `feat(db): advisory-lock helper for per-show auth-side mutations (closes M2-D6)`, `chore: M5 demo verified`). Don't batch tasks. Both implementers commit per task.

## 6. Watchpoints from prior adversarial review

M5 has not yet been implemented; no prior M5 convergence log exists. Watchpoints below are derived from M0–M4 convergence logs + the global CLAUDE.md / AGENTS.md additions, filtered for M5-applicable failure modes, plus the three DEFERRED items the user explicitly called out.

### M5-relevant DEFERRED items (user-flagged 2026-05-03)

1. **DEFERRED M2-D6 — App-side advisory-lock helper authored in this milestone.** §A creates `lib/db/advisoryLock.ts` exposing `withShowAdvisoryLock(showId, mode, fn)` where `mode` is `'try'` (cron / non-blocking; uses `pg_try_advisory_xact_lock` and short-circuits on contention) or `'block'` (admin / synchronous; uses `pg_advisory_xact_lock` and waits). Lock key derives from `hashtext('show:' || shows.drive_file_id)` (per spec §1.2 — `drive_file_id`, NOT `show_id` or `slug` — to keep cron and admin paths on the same key when sync milestones land). Tests assert the lock is held during the callback by spawning a competing transaction that attempts `pg_try_advisory_xact_lock` against the same key inside the callback and expects it to fail. Mark M2-D6 status from "deferred" to "in progress" in DEFERRED.md when §A starts; mark to "Resolved at <SHA>" when committed. M6 (sync) consumes the same helper later — keep the API stable.

2. **DEFERRED M2-D4 — Introspection pin for `crew_members_show_id_name_key`.** If any §A code path references this constraint by name (e.g., `ON CONFLICT ON CONSTRAINT crew_members_show_id_name_key DO ...` in `validateLinkSession` step 5 / step 6 / Task 5.6 revocation INSERT, or in Task 5.10 `listShowsForCrew` cross-show JOIN logic), the same commit MUST add the introspection assertion to `tests/db/schema-introspection.test.ts`. Specifically: assert the constraint exists at `pg_constraint` with the exact name `crew_members_show_id_name_key`, the exact column set `(show_id, name)`, and the exact `contype = 'u'`. If no §A code path references the constraint by name, leave M2-D4 deferred. Don't fold it in opportunistically without a real consumer — it's listed as cosmetic-when-unreferenced.

3. **DEFERRED M4-D1 — Parser canonical-key probe (`event_details` access).** Not directly an M5 deliverable, but if any M5 UI surface (most likely Task 5.10's `/me` show-list cards if they show a "dress code" field as part of show metadata, or Task 5.9's banner if it interpolates an `event_details` value) reads `event_details` from a show row, route through the canonical key only — do NOT replicate `ShowStatusTile`'s `["dress_code", "dress code", "dress", "attire"]` variant probe. M4-D1 stays deferred (M1 follow-up territory); M5 just adheres to the discipline of reading the canonical key and surfaces a question if a fixture forces variant fallback. **Realistic expectation:** `/me` and the banner are unlikely to read `event_details` — most likely no M5 code path triggers this watchpoint, but flag it now so neither implementer accidentally re-introduces the probe pattern.

### Auth-shape watchpoints (cross-cutting)

4. **Tri-state validator outcome contract is the integration spine.** The three validators (`validateLinkSession`, `validateGoogleSession`, `requireAdmin`) plus `isAdminSession` MUST share the EXACT same `ValidatorOutcome` shape (spec at Task 5.2 step 2): `success` | `continue (with priorFailure?, clearCookie)` | `terminal_failure (server-side faults ONLY)`. Client-side cookie corruption (parse/format faults, wrong `iss`/`aud`, decode failure, missing claims, base64/JSON parse) MUST return `continue + clearCookie:true`, NOT `terminal_failure` — reserving terminal_failure for client-driven faults is a login-CSRF-style availability bug. Codex must keep the outcome shape consistent across all four files; Opus's chain adapter in Task 5.7 consumes the union and renders accordingly. Any drift between the validators reopens the chain-fallthrough hole.

5. **Single host-wide cookie design (per-show NAMING is retired).** There is exactly ONE `__Host-fxav_session` cookie on the host at any time. Its value is the URL-encoded JSON envelope `{ v: 1, token, show_id }`. Show-binding lives in the value, not in the cookie name. Per-show cookie naming (`__Host-fxav_session_${showSlug}`) was rejected during plan-phase adversarial review because browsers send all matching `(domain, path)` cookies regardless of name — the per-show approach delivered zero isolation and grew the Cookie header linearly. The A→B→A burn pattern is the cost; multi-show navigation is rare for v1. The literal substring `__Host-fxav_session` outside `lib/auth/cookies.ts` and `lib/auth/constants.ts` MUST fail X.3's banned-identifier substring scan. **For Opus:** every cookie clear/set in the chain adapter routes through `clearSessionCookie` / `setSessionCookie` from `lib/auth/cookies.ts` — never a hand-rolled `Set-Cookie` string. A bare `__Host-fxav_session=; Max-Age=0` is silently ignored by browsers because the `__Host-` prefix mandates the FULL attribute set on the deletion response.

6. **Envelope-version gate (`v === 1` strict equality).** The cookie envelope's `v` field is the dual-read seam for any future v=2 multi-show envelope. v1 decoder REJECTS unknown `v` values. The redeem-link route's `Set-Cookie` MUST emit `v: 1` literally; without it, the next request's `validateLinkSession` decode fails the v-gate, returns `continue + clearCookie:true`, and locks the user out of every show even though the cookie was just minted. The end-to-end mint→decode round-trip test (Task 5.4 step 1) couples writer ↔ decoder so this regression is impossible.

7. **`verifiedKid` pin on `link_sessions.signing_key_id`, NOT a fresh app_settings read.** Task 5.4's `link_sessions` INSERT writes `signing_key_id = verifiedKid` (the kid the JWT was actually verified under, returned by `verifyLinkJwt`), NOT `signing_key_id = (SELECT active_signing_key_id FROM app_settings)`. A read-with-INSERT pattern that pulls from app_settings reopens the rotation race documented in spec §7.2.3 / Task 5.4 step 2. The kid-rotation gate (`if verifiedKid !== active_signing_key_id then 403 LINK_REDEEM_KEY_ROTATED`) closes the same race at redeem time. AC-5.6a's regression test explicitly proves this: rotate `app_settings.active_signing_key_id` between verify and INSERT; assert the route 403s and writes nothing.

8. **Bootstrap-nonce composite-key consume + signed-cookie envelope.** The `bootstrap_nonces` PK is `(nonce_hash, show_id)` composite — single-PK on `nonce_hash` alone forces one live nonce per browser regardless of show, breaking multi-tab/multi-show bootstrap flows. The `__Host-fxav_bootstrap_v` cookie is a JSON ARRAY of recent `{ nonce_hash, show_id, issued_at, signing_key_id }` entries (cap 5, evict oldest). The redeem-link route's row-vs-cookie-vs-active kid comparison discriminates three branches per AC-5.13:
   - cookie kid ≠ row kid → `CSRF_DENIED` (forgery — kid mismatch means the cookie envelope was not minted by this server's bootstrap shell);
   - cookie kid = row kid AND cookie kid = active kid → proceed;
   - cookie kid = row kid AND cookie kid ≠ active kid → `CSRF_KEY_ROTATED` (benign rotation race; same UX as `CSRF_NONCE_EXPIRED`).

   `CSRF_DENIED` vs `CSRF_NONCE_EXPIRED` are NOT interchangeable — conflation buries benign UX under malicious-attacker code. Each test row in the producer matrix MUST land its own assertion.

9. **Admin precedence over crew-on-self.** Task 5.7's chain order is `isAdminSession → validateLinkSession → validateGoogleSession → requireAdmin` — admin runs FIRST as a pure predicate. The earlier link-first ordering silently downgraded admins whenever a valid redeemed-link cookie matched the same show. The `admin-also-on-crew.fixture` regression test asserts admin-precedence wins over a fully-valid redeemed-link cookie. **For Opus:** the `app/show/[slug]/page.tsx` chain MUST follow this exact order; do not reorder for "performance" or "simplicity" — the ordering is the contract. The `lib/auth/isAdminSession.ts` helper is the SAME function X.3's audit uses for its admin-detection check — runtime decision and static audit cannot diverge.

10. **`validateGoogleIdentity` is deliberately NON-DRY with `validateGoogleSession`.** Task 5.10 introduces a separate validator for `/me` because `/me` has no show context. The temptation to share an implementation is exactly what reopens the show-binding hole. Required X.3 audit fixture pair: `bad-me-route-uses-validateGoogleSession.tsx` MUST FAIL the audit; `good-me-route-uses-validateGoogleIdentity.tsx` MUST PASS. **For Codex:** keep the two implementations syntactically distinct so a future "DRY refactor" doesn't merge them. Add a comment at the top of `validateGoogleIdentity.ts` explaining the deliberate divergence.

11. **`?t=` compromise handler scope is `^/show/[^/]+`, NOT `/show/[slug]/p` only.** Task 5.6's `middleware.ts` MUST scan EVERY request whose pathname matches `^/show/[^/]+` for a `?t=` query param — root crew page, bootstrap route, future subroutes, anything. Vercel logs the full URL of every request the platform receives, so a `?t=` exposure on `/show/<slug>` (root) leaks the JWT to platform logs even though the route handler that actually serves the page is `/show/[slug]/page.tsx`. Narrowing to `/p` only would let any non-`/p` shape bypass revocation. Required regression fixtures: `/show/<slug>?t=`, `/show/<slug>/p?t=`, `/show/<slug>/p/anything?t=`, `/show/<slug>/<future-subroute>?t=`.

12. **Branch-routing for `?t=` revocation: lift the floor on `>` branch in ONE step.** Task 5.6's branch C: when `jwt.tokenVersion > current_token_version` (future-version anomaly), set ALL THREE fields (`current`, `max_issued`, `revoked_below`) aligned to `jwt.tokenVersion` in one transactional UPDATE. The earlier `revoked_below_version = max(current, jwt)` only approach left `current` < `revoked_below`, requiring multiple "Issue New Link" clicks to clear the floor — a real auth-lockout bug. The single-Issue-New-Link recovery test (Branch C) is the regression that pins this. **Do NOT invent a `SUSPICIOUS_FUTURE_VERSION` user-facing code** — it isn't in §12.4. Operator-only metadata about the future-version anomaly belongs in the structured log payload, not in a user-visible message.

13. **`lib/messages/catalog.ts` parity vs §12.4.** §A pulls a minimum subset forward for M5's user-facing surfaces; X.1's three-way parity audit (§12.4 ↔ catalog ↔ producer/renderer) verifies. Task 9.4 EXPANDS later — do not delete or drift the M5 entries. **For Codex:** every code emitted by §A's auth chain (`LINK_*`, `SESSION_*`, `LINK_SESSION_KEY_ROTATED`, `LINK_REDEEM_KEY_ROTATED`, `AMBIGUOUS_EMAIL_BINDING`, `LEAKED_LINK_DETECTED`, `CSRF_*`, `OAUTH_*`, plus the §4.6 admin-alert codes the banner renders: `WATCH_CHANNEL_ORPHANED`, `WEBHOOK_TOKEN_INVALID`, `REPORT_ORPHANED_LOST_LEASE`, `GITHUB_BOT_LOGIN_MISSING`, `REPORT_LEASE_THRASHING`, `TILE_SERVER_RENDER_FAILED`) MUST exist in the catalog with verbatim §12.4 copy. Cross-check by grepping `lib/messages/catalog.ts` against `git grep "code: '[A-Z_]\\+'" lib/auth lib/data app middleware.ts` and asserting every producer code lives in the catalog.

14. **`validateNextParam` canonicalization (FIVE pre-allowlist guards).** Task 5.8's helper rejects: non-string/empty; backslash / `%2e%2e` / control chars; `new URL` parse errors (try/catch); origin mismatch (catches absolute + protocol-relative); `^/show/<slug>/p$` bootstrap-surface match (fragments don't survive OAuth — landing post-OAuth on `/p` is never useful). THEN matches the canonicalized allowlist `^\/(show\/[a-z0-9-]+|admin(\/.*)?|me(\/.*)?)$`. The earlier single-regex form `^\/(show|admin|me)(\/[^?#]*)?$` is retired — it admitted `/show/<slug>/p` and could not canonicalize `..` segments. The X.3 banned-identifier audit pins both regexes to `lib/auth/validateNextParam.ts` only.

15. **Sign-out atomic cookie-family teardown (single `__Host-fxav_session`).** Task 5.8's `/auth/sign-out` POST MUST clear Supabase Auth + the SINGLE `__Host-fxav_session` cookie + `__Host-fxav_bootstrap_v` in one response. **The earlier "iterate per-show cookie names" contract is retired** because per-show NAMING did not deliver isolation. There is exactly one `__Host-fxav_session` cookie on the host at any time; clearing it once is sufficient. Do NOT iterate `^__Host-fxav_session_[a-z0-9-]+$` — the cookie name is the literal `__Host-fxav_session`. GET `/auth/sign-out` → 405 (CSRF defense).

16. **Anti-tautology rule for tests.** When asserting that a validator returns a specific status code, do NOT assert against a constant the production code also reads from (e.g., `expect(outcome.code).toBe(LINK_VERSION_MISMATCH)` where `LINK_VERSION_MISMATCH` is imported from the same `lib/auth/constants.ts` the validator imports). Assert against the verbatim string literal `'LINK_VERSION_MISMATCH'`. When asserting that a `link_sessions` row was deleted, re-query `link_sessions WHERE token = $cookie` and assert zero rows — do NOT assume the validator's "DELETE" branch ran just because the response status is correct. The negative-regression rule (CLAUDE.md feedback memory) applies: stash the production DELETE statement and confirm the test fails before shipping.

17. **Pre-draft code-verification pass.** Before §A or §B writes any test that names a specific table column, RPC argument, RLS policy, or constraint, grep against the live codebase. M2 schema already defines column names; M4 already defines `getShowForViewer` shape. Don't invent. Specifically: confirm `link_sessions.signing_key_id`, `app_settings.active_signing_key_id`, `crew_member_auth.current_token_version` / `max_issued_version` / `revoked_below_version`, `revoked_links` PK shape, `admin_alerts` partial unique index name — all exist before referencing.

18. **Self-consistency sweep.** At M5 close: `! rg "lastPollAt" lib app supabase tests` returns zero. `! rg "validateGoogleSession" app/me lib/data/listShowsForCrew.ts` returns zero (the `/me` surface uses `validateGoogleIdentity` only). `! rg "__Host-fxav_session" --files-without-match lib/auth/cookies.ts lib/auth/constants.ts | rg -v node_modules | rg "lib/|app/|tests/" | rg "."` returns zero (the literal cookie name lives in the helper module only). `! rg "viewerRole" lib app components` returns zero (canonical predicates only — preserved from M4). `! rg "JWT" lib/auth/validateLinkSession.ts` should match only comments/docstrings — the validator does NOT verify JWT signatures (the cookie value is the URL-encoded JSON envelope, not a JWT).

## 7. Test commands

- **Pre-flight and final gate**: `pnpm test && pnpm lint && pnpm typecheck`. Do NOT parallelize `pnpm test` with Playwright — see M4 handoff §4.
- **Vitest unit / data tests**: `pnpm test tests/auth/jwt.test.ts`, `pnpm test tests/auth/validateLinkSession.test.ts`, `pnpm test tests/auth/validateGoogleSession.test.ts`, `pnpm test tests/auth/validateGoogleIdentity.test.ts`, `pnpm test tests/auth/isAdminSession.test.ts`, `pnpm test tests/auth/oauth-flow.test.ts`, `pnpm test tests/db/advisory-lock.test.ts`.
- **Playwright e2e (mobile-safari, primary)**: `pnpm test:e2e --project=mobile-safari`.
- **Playwright e2e (auth-specific)**: `pnpm test:e2e tests/e2e/redeem-link.spec.ts`, `pnpm test:e2e tests/e2e/bootstrap.spec.ts`, `pnpm test:e2e tests/e2e/leaked-link.spec.ts`, `pnpm test:e2e tests/e2e/auth-chain.spec.ts`.
- **Layout-dimensions test**: `pnpm test:e2e tests/e2e/layout-dimensions.spec.ts --project=mobile-safari` AND `--project=desktop-chromium` — confirm M4's layout invariants still pass after Task 5.7's chain wiring touches `app/show/[slug]/page.tsx` (modifying the page must not regress M4's dimensional contracts).
- **Transition-audit test**: `pnpm test:e2e tests/e2e/right-now-transitions.spec.ts` — confirm M4 RightNowCard transitions still pass (Task 5.7's chain failure paths render `<ErrorExplainer>` instead of the page; verify the RightNowCard mount path still fires on the success path).
- **Role-spoof regression**: `pnpm test:e2e tests/e2e/role-spoof.spec.ts` — preserved from M4. M5 must NOT loosen the `?role=` ignore.
- **Realtime live-sync**: `pnpm test:e2e tests/e2e/apply-driven-refresh.spec.ts` — preserved from M4. AC-5.10 (LEAD → A1 demote) layers on top of M4's broadcast invalidation.
- **DB schema introspection regression** (M2 baseline + M5 additions): `pnpm test tests/db/`. After Task 5.4's migration lands, verify `bootstrap_nonces` is on the admin-only RLS list AND has the FK introspection assertion AND the composite PK assertion.
- **Supabase reset + seed** (full reset including new M5 migrations): `pnpm dlx supabase db reset && pnpm db:seed`.

## 8. Exit criteria

- [ ] Tasks 5.1–5.11 in `05-auth.md` (lines 1–411) all checked off.
- [ ] All AC-5.1..AC-5.14 (incl. AC-5.3a, AC-5.6a, AC-5.13) each have at least one passing assertion.
- [ ] `lib/auth/jwt.ts`, `validateLinkSession.ts`, `validateGoogleSession.ts`, `validateGoogleIdentity.ts`, `isAdminSession.ts`, `cookies.ts`, `constants.ts`, `validateNextParam.ts` all exist with the documented contracts.
- [ ] `lib/auth/requireAdmin.ts` body replaced (interface stable per M3 contract).
- [ ] `app/api/auth/redeem-link/route.ts`, `app/auth/sign-in/page.tsx`, `app/auth/callback/route.ts`, `app/auth/sign-out/route.ts`, `app/show/[slug]/p/page.tsx`, `app/show/[slug]/p/Bootstrap.tsx`, `app/me/page.tsx` all exist.
- [ ] `middleware.ts` exists at repo root with `?t=` scan covering `^/show/[^/]+`.
- [ ] `lib/db/advisoryLock.ts` exists; M2-D6 marked Resolved in DEFERRED.md with the SHA.
- [ ] `lib/messages/catalog.ts` exists with all M5-required §12.4 entries (verbatim copy); `lib/messages/lookup.ts` extended.
- [ ] `components/admin/AlertBanner.tsx` and `components/messages/ErrorExplainer.tsx` exist; `app/admin/layout.tsx` mounts the banner.
- [ ] New migration shipping `bootstrap_nonces` table + admin-only RLS policy + `link_sessions.signing_key_id` (if not already from M2) + introspection assertions in `tests/db/schema-introspection.test.ts`.
- [ ] X.3 semantic AST/control-flow audit ran against every M5 protected route (`/show/[slug]/page.tsx`, `/show/[slug]/p/page.tsx`, `/api/auth/redeem-link/route.ts`, `/auth/sign-in/page.tsx`, `/auth/callback/route.ts`, `/auth/sign-out/route.ts`, `/me/page.tsx`) and passed dominator analysis. (The actual X.3 implementation may need to be pulled forward into M5 if not yet shipped — see Task 5.2 step 3 + Task 5.7 step 3 + Task 5.8 step 3 + Task 5.10 X.3 fixture pair.)
- [ ] `pnpm test && pnpm lint && pnpm typecheck` exits 0 (vitest standalone, not parallel with Playwright).
- [ ] `pnpm test:e2e --project=mobile-safari` exits 0.
- [ ] `pnpm test:e2e --project=desktop-chromium` exits 0 for layout-dimensions (preserve M4 invariants).
- [ ] `! rg "lastPollAt" lib app supabase tests` returns zero matches.
- [ ] `! rg "drive\.google\.com|docs\.google\.com" components app/show` returns zero matches (M4 invariant preserved).
- [ ] `! rg "validateGoogleSession" app/me lib/data/listShowsForCrew.ts` returns zero matches.
- [ ] `! rg "viewerRole" lib app components` returns zero matches (M4 invariant preserved).
- [ ] `__Host-fxav_session` literal substring outside `lib/auth/cookies.ts` and `lib/auth/constants.ts` returns zero matches (X.3 banned-identifier scan).
- [ ] All commits follow `<type>(<scope>): <summary>` format. One commit per task. Both implementers.
- [ ] §B's Playwright suite migrated off M3's `signInAs.ts` minimal stubs onto the real Google OAuth flow (or a deterministic test-auth shim that mirrors the real flow shape).
- [ ] Working tree is clean except for intentionally uncommitted handoff convergence-log updates left for the adversarial reviewer.
- [ ] **Impeccable evaluation §12 closed** for the §B UI surface (`/impeccable critique` AND `/impeccable audit` ran with the canonical v3 preflight; HIGH/P0/P1 findings either fixed or DEFERRED with target milestone).
- [ ] Adversarial review (per `superpowers:adversarial-review` with Opus 4.7 / Claude Code per ROUTING.md) ran to convergence — recorded below.

## 9. Sandbox / git protocol

This is a split-mode milestone, so BOTH rows below apply (each implementer follows their row).

- [ ] **Claude Code (§B / Opus side):** commits run in-session, no sandbox issue. Use `git add <specific files>` (NOT `git add -A`), then `git commit -m "feat(...): <summary>"` per AGENTS.md §1.6.
- [ ] **Codex CLI (§A side):** verify before starting whether the sandbox is relaxed for this repo. Run `git status` first; if it errors with permission-denied, use the patch-then-commit-outside protocol per HANDOFF-TEMPLATE.md §9 bullet 2 (Codex prints per-task commit messages; the orchestrator does `git add` + `git commit` outside the sandbox after each task). If `--full-auto` or equivalent is set for this repo, commits run in-session per AGENTS.md "Codex-specific notes" sandbox row.

**Cross-implementer git hygiene:** both implementers pull before committing (rebase, do NOT merge — preserve linear history). Don't squash or rebase across the implementer boundary; keep authorship clean for the convergence log.

## 10. Adversarial review handoff

After §A and §B both complete:

1. Each implementer summarizes what was built and confirms each per-task checklist is `- [x]`. The orchestrator (Claude Code) reconciles into a single milestone summary.
2. The adversarial reviewer (Opus 4.7 / Claude Code per ROUTING.md M5 row) is invoked via `superpowers:adversarial-review`. Inputs: §7 + §17.1 of the spec, the M5 plan (`05-auth.md` lines 1–411), this handoff, and the diff `git diff <M5-base-SHA>..HEAD -- 'app/auth/**' 'app/api/auth/**' 'app/show/[slug]/p/**' 'app/show/[slug]/page.tsx' 'app/me/**' 'app/admin/layout.tsx' 'middleware.ts' 'components/admin/AlertBanner.tsx' 'components/messages/**' 'lib/auth/**' 'lib/db/advisoryLock.ts' 'lib/data/listShowsForCrew.ts' 'lib/messages/**' 'tests/auth/**' 'tests/e2e/redeem-link.spec.ts' 'tests/e2e/bootstrap.spec.ts' 'tests/e2e/leaked-link.spec.ts' 'tests/e2e/auth-chain.spec.ts' 'tests/db/advisory-lock.test.ts' 'tests/db/schema-introspection.test.ts' 'supabase/migrations/2026050400*'`.
3. Reviewer iterates with implementers until convergence (no new issues raised in a round) or until ambiguity requires a human decision. Round cap: 3 (per skill); user-authorized overtime if findings are concrete-fixable rather than substantive disagreements (M3 = 8, M4 = 8 — the realtime + auth surfaces are the deepest race-condition territory in the project, so 5–10 rounds is realistic).
4. Each round's findings are routed to the responsible implementer (§A vs §B based on file path). Cross-implementer findings (e.g., a backend contract that requires a UI change) get coordinated through this doc's convergence log.
5. Convergence is logged at the bottom of this file.
6. **Canonical invocation discipline.** Per `feedback_adversarial_review_canonical_invocation.md` memory and M4 round 1 provenance note: cross-CLI Codex reviews go through the `/codex:adversarial-review` slash command with proper `CLAUDE_PLUGIN_DATA` per-session scoping + dynamic `CLAUDE_PLUGIN_ROOT` resolution. Do NOT raw-shell `node codex-companion.mjs adversarial-review --wait` with hardcoded paths.

## 11. Cross-milestone dependencies

**(a) `bootstrap_nonces` migration ↔ `tests/db/schema-introspection.test.ts` (M2 / AC-2.1).** Task 5.4's migration adds the new table; AC-2.1's introspection test is the canonical "what tables exist with what FKs / RLS" gate. Task 5.4 commit MUST extend the introspection test in the same commit so the schema baseline stays in sync. Otherwise CI splits responsibility across two commits and the M2 test goes red between them.

> **Recommended disposition:** Codex ships the table DDL + the matching introspection assertion in a single commit. Verify by running `pnpm test tests/db/schema-introspection.test.ts` after the commit lands.

**(b) `validateLinkSession` step 3a + cross-route propagation to M4 routes.** AC-5.6a asserts that rotating `app_settings.active_signing_key_id` 401s the same cookie against `/api/realtime/subscriber-token` AND `/api/show/[slug]/version` (both M4 routes). Task 5.2 ships the validator; the M4 routes already gate via `validateLinkSession` per Task 4.16, so the cross-route 401 should "just work" — but the regression test must explicitly hit both M4 routes with the rotated cookie to prove the gate fires.

> **Recommended disposition:** Add the cross-route assertions to `tests/auth/validateLinkSession.test.ts` step 3a (mock the M4 routes' validator gate; assert both 401). No M4 code changes needed.

**(c) Realtime broadcast invalidation ↔ AC-5.10 LEAD demote.** AC-5.10's "Financials tile disappears within one render cycle without token rotation" depends on the M4 Realtime broadcast firing when `crew_members.role_flags` mutates. M4 Task 4.16's UPDATE trigger on `crew_members` already fires `pg_notify` on every row mutation; the demote test re-uses that path.

> **Recommended disposition:** No new code — just verify in `tests/e2e/auth-chain.spec.ts` that the demote synthesizes via the same `applyStaged` seed harness M4 used (Task 4.16 step 1) and that the existing broadcast channel delivers the invalidation.

**(d) `/admin/dev` panel ↔ admin alert banner.** Task 5.9's banner mounts in `app/admin/layout.tsx`. The M3 dev panel at `/admin/dev` is its own page under `/admin/`, so it inherits the layout — the banner will render on the dev panel too. This is fine (Doug is the operator on both surfaces) but should be visually verified.

> **Recommended disposition:** Opus visually confirms the banner renders correctly on `/admin/dev` during Task 5.9 §B; if the dev panel's `font-mono text-sm` register clashes with the banner copy, document a minor M9 polish item rather than fixing in M5.

**(e) X.3 semantic AST/control-flow audit pull-forward.** Tasks 5.2 / 5.7 / 5.8 / 5.10 all reference X.3's audit. X.3 is owned by the cross-cutting milestone (`11-cross-cutting.md`), routed to Codex. If X.3 is not yet shipped at M5 start, Codex must pull it forward as part of M5 (or stub it with a TODO that lands in X.6 with concrete test fixtures pinned now so the tests fail until X.3 lands).

> **Recommended disposition:** Codex checks the X.3 status at M5 start. If unshipped, opens a question to the orchestrator: "pull X.3 forward into M5, OR stub the X.3 audit calls with TODO + pin the fixture-pair tests as `.skip` until X.3 lands." User decides; do not silently skip the audit. Without X.3, M5's protected-route dominator-analysis claim is unverified.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

UI surface §B ships in this milestone:
- `app/auth/sign-in/page.tsx`
- `app/show/[slug]/p/page.tsx` + `app/show/[slug]/p/Bootstrap.tsx`
- `app/me/page.tsx`
- `components/admin/AlertBanner.tsx` + `components/messages/ErrorExplainer.tsx`
- modifications to `app/show/[slug]/page.tsx` (chain wiring) and `app/admin/layout.tsx` (banner mount)

Backend §A ships no UI surface; the §12 gate runs ONLY on §B's surface area per HANDOFF-TEMPLATE.md.

The dual run happens AFTER per-task implementation closes and BEFORE adversarial review. Both commands run with the canonical v3 preflight gates (`load-context.mjs` → product gate → command-reference gate → register identification → preflight signal).

- [ ] `/impeccable critique <surface>` — UX heuristic scoring, persona walkthroughs, AI-slop test, absolute-ban scan.
  - Score sheet attached: visual hierarchy, IA, cognitive load, emotional resonance, a11y floor, persona-specific scan-speed rule.
  - HIGH findings fixed OR logged in `DEFERRED.md` with a target milestone.
  - MEDIUM findings triaged: fix-now / defer to in-milestone polish / defer to a future polish milestone.

- [ ] `/impeccable audit <surface>` — Technical quality checks (a11y, performance, responsive, theming, anti-patterns). Scored P0–P3.
  - P0/P1 findings fixed before adversarial review.
  - P2/P3 findings triaged.

- [ ] DEFERRED.md updated with any retrospective deferrals.
- [ ] Dispositions inline below or referenced by SHA.

```
critique findings: <Finding ID> — <severity> — <one-line> — disposition: <fixed at <SHA> | deferred to <milestone> via <DEFERRED.md ID>>
audit findings: <P0-P3> — <one-line> — disposition: <fixed at <SHA> | deferred to <milestone> via <DEFERRED.md ID>>
```

The convergence log proper (below) appends ONLY after impeccable evaluation closes AND adversarial review begins. The milestone is marked "completed" only when BOTH impeccable §12 has zero unresolved HIGH/P0/P1 findings AND adversarial review has converged.

---

## Convergence log

_(empty — populated during adversarial review)_
