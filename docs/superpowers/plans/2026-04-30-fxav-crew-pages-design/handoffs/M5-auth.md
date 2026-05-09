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

- **Task 5.1** — `lib/auth/jwt.ts` + `tests/auth/jwt.test.ts` (`signLinkJwt`, `verifyLinkJwt`, key-id capture for §7.2.3 global rotation). **`[PIN-STOP 1 — cleared at a7dff4e]`** Codex paused here on 2026-05-03 and reported. Orchestrator extended the pin sequence (Pin 1 alone is insufficient to unblock §B). Codex now continues toward Pin-stop 2.
- **Task 5.2** — `lib/auth/validateLinkSession.ts`, `lib/auth/constants.ts`, `lib/auth/cookies.ts` (the shared `__Host-fxav_session` helper module: `setSessionCookie` / `clearSessionCookie` / `encodeSessionCookieValue` / `decodeSessionCookieValue`) + `tests/auth/validateLinkSession.test.ts` (twelve §7.2.2 steps + parse/format-fault enumeration + step 3a kid-rotation + step 5 reachability via `ON DELETE SET NULL`).
- **Task 5.3** — `lib/auth/validateGoogleSession.ts` + `tests/auth/validateGoogleSession.test.ts` (`AMBIGUOUS_EMAIL_BINDING` + cross-show binding + admin_alerts UPSERT).
- **Task 5.4** — `app/api/auth/redeem-link/route.ts` + `tests/e2e/redeem-link.spec.ts` (login-CSRF defense, bootstrap-nonce composite-key consume, `LINK_REDEEM_KEY_ROTATED` gate, `verifiedKid`-pinned `link_sessions.signing_key_id` write). **Schema migration**: this task introduces `bootstrap_nonces (nonce_hash, show_id, issued_at, consumed_at, signing_key_id)` with composite PK `(nonce_hash, show_id)` — ship as `supabase/migrations/2026050400000<n>_bootstrap_nonces.sql` AND add to AC-2.1's REQUIRED FK introspection list AND to the §4.3 admin-only RLS table list. Also add `link_sessions.signing_key_id` column if it isn't already present from M2.
- **Task 5.6** — `middleware.ts` at repo root + `tests/e2e/leaked-link.spec.ts` (`?t=` compromise handler scans every `^/show/[^/]+` request, three branches: `=` / `<` / `>` of `current_token_version` with idempotent `revoked_links` INSERT). **`[POST-PIN-STOP 2 ONLY]`** This is the only §A task that runs AFTER Pin-stop 2. It imports `lib/messages/lookup.ts` (Pin-2 surface) and `validateLinkSession` (Pin-2 surface), so it cannot ship before Pin-2 closes. After Pin-2 clears, this runs in parallel with §B's UI work.
- **Task 5.7 §A portion** — `lib/auth/isAdminSession.ts` + `tests/auth/isAdminSession.test.ts`. The shared admin-detection predicate. The `app/show/[slug]/page.tsx` chain wiring is §B.
- **Task 5.8 §A portion** — `app/auth/callback/route.ts`, `app/auth/sign-out/route.ts`, `lib/auth/validateNextParam.ts` + `tests/auth/oauth-flow.test.ts` (validator + callback + sign-out routes). The `app/auth/sign-in/page.tsx` Server Component is §B.
- **Task 5.9 §A portion** — `lib/messages/catalog.ts`, `lib/messages/lookup.ts` (M5-needed §12.4 entries: `LINK_*`, `SESSION_*`, `LINK_SESSION_KEY_ROTATED`, `LINK_REDEEM_KEY_ROTATED`, `AMBIGUOUS_EMAIL_BINDING`, `LEAKED_LINK_DETECTED`, `CSRF_DENIED`, `CSRF_NONCE_EXPIRED`, `CSRF_KEY_ROTATED`, `OAUTH_STATE_INVALID`, `OAUTH_REDIRECT_INVALID`, plus the §4.6 alert codes the banner renders). The banner UI itself is §B.
- **Task 5.10 §A portion** — `lib/auth/validateGoogleIdentity.ts`, `lib/data/listShowsForCrew.ts` + `tests/auth/validateGoogleIdentity.test.ts` (deliberately non-DRY-with-`validateGoogleSession`; no `crew_members` query; no show binding).
- **`lib/auth/requireAdmin.ts`** — UPDATE the M3 stub body with the production implementation. The interface stays stable (per M3 handoff §4 note); body now reads Supabase Auth session via `@supabase/ssr` + canonical email allowlist via the `is_admin()` SQL helper. Delete M3's `tests/e2e/helpers/signInAs.ts` minimal-stub `ADMIN_FIXTURE` / `NON_ADMIN_CREW_FIXTURE` only AFTER §B has migrated its tests onto the real OAuth flow.
- **DEFERRED M2-D6** — `lib/db/advisoryLock.ts` (the per-show advisory-lock helper). Codex authors this in M5 because the auth-side mutation paths (Task 5.4 `link_sessions` INSERT, Task 5.6 `revoked_links` + `crew_member_auth` UPDATEs) are the first code paths that need it. Spec invariant §1.2 mandates `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` on every code path that mutates `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`. The helper exposes a `withShowAdvisoryLock(showId, mode, fn)` shape; tests assert the lock is held during the callback. Mark M2-D6 "in progress" → Codex closes it in this milestone.

> **`[PIN-STOP 2 — Codex stops here and reports]`** After all the §A bullets above (Tasks 5.2, 5.3, 5.4, 5.7 §A, 5.8 §A, 5.9 §A, 5.10 §A, requireAdmin body, advisoryLock helper) ship and `pnpm test && pnpm lint && pnpm typecheck` exits 0, Codex pauses. Reports per the §0 Pin-stop sequence subsection: new SHA, `.d.ts`-style export block, spec deviations, verification gate result. Orchestrator confirms; §B begins in parallel; Codex resumes §A with Task 5.6 (middleware) only.

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

### Pin-stop sequence (§A → §B handshake gates)

Split-mode milestones use **pin-stops** — checkpoints where the backend implementer (Codex) pauses, reports the pinned contract surface, and waits for orchestrator + UI-side confirmation before resuming. M5 has two pin-stops. Future split milestones may have one, two, or three depending on their contract topology.

**Pin-stop 1** (cleared 2026-05-03 at SHA `a7dff4e63461529475fedeb8b1b6a2d80e963c86`): low-level signing primitives — `signLinkJwt(input): Promise<{ token, signingKeyId }>` and `verifyLinkJwt(token): Promise<{ payload: LinkJwtPayload, verifiedKid }>`. These are the building blocks every higher-level auth helper consumes, but they are not directly UI-consumable. Pin 1 unblocks no §B work; its purpose is to verify the harness, sandbox/git protocol, TDD discipline, and commit format are working before Codex commits to the larger contract surface. Codex initially halted here; orchestrator deemed the pin too narrow and extended toward Pin-stop 2.

**Pin-stop 2** (target — Codex stops here and reports): full UI-consumable contract surface. Includes:

- `lib/auth/cookies.ts` + `lib/auth/constants.ts` — `__Host-fxav_session` envelope shape, `setSessionCookie` / `clearSessionCookie` / `encodeSessionCookieValue` / `decodeSessionCookieValue` signatures
- `lib/auth/validateLinkSession.ts` — `ValidatorOutcome` discriminated union (the tri-state spine)
- `lib/auth/validateGoogleSession.ts` — same outcome shape, show-bound
- `lib/auth/validateGoogleIdentity.ts` — same outcome shape, identity-only (deliberately non-DRY with validateGoogleSession)
- `lib/auth/isAdminSession.ts` — admin predicate
- `lib/auth/validateNextParam.ts` — five-guard helper
- `app/api/auth/redeem-link/route.ts` + `bootstrap_nonces` migration — request/response contract for Bootstrap.tsx's client-side POST
- `app/auth/callback/route.ts` + `app/auth/sign-out/route.ts` — OAuth round-trip endpoints sign-in page redirects to
- `lib/messages/catalog.ts` + `lib/messages/lookup.ts` extensions — every `LINK_*` / `SESSION_*` / `OAUTH_*` / `CSRF_*` / `LEAKED_*` / `AMBIGUOUS_*` code AlertBanner and ErrorExplainer consume
- `lib/data/listShowsForCrew.ts` — `/me` page's data fetcher
- `lib/auth/requireAdmin.ts` body — interface unchanged from M3 stub; body now production
- `lib/db/advisoryLock.ts` (DEFERRED M2-D6) — `withShowAdvisoryLock(showId, mode, fn)` signature; Bootstrap.tsx's server-side nonce mint consumes this

After Pin-stop 2, §B starts in parallel. The only §A work remaining post-Pin-2 is `middleware.ts` (the `?t=` compromise handler — internal, no UI contract surface), which Codex finishes alongside §B's UI work.

**Codex's report at Pin-stop 2 must include:**

1. The new contract-pin SHA (orchestrator passes this to §B as the rebase base).
2. The exported type names + signatures the UI consumes — pasted as a `.d.ts`-style block in this handoff under a new `### Pinned contract @ <SHA>` subsection appended at the bottom of §0.
3. Any deviations from the spec (§7.2, §7.2.2, §7.3, §7.4) — flagged explicitly so §B doesn't inherit a silent contract drift.
4. Verification gate: `pnpm test && pnpm lint && pnpm typecheck` exits 0 at the pin-stop SHA.

**If Pin-stop 2 reveals a missing surface §B needs:** treat it as a Pin-stop-2-extension, NOT a new Pin-stop 3. Update this section's bullet list inline, have Codex extend the contract, and re-pin at a new SHA. Pin numbering stays at 2 because the contract surface is conceptually one gate; only fundamentally new surfaces (e.g., a future M6 "watch channel renewal hook" that didn't exist at M5 design time) earn a new pin number.

**Anti-pattern:** Codex resuming §A's middleware.ts work _between_ Pin-stops 1 and 2. The pin sequence is strictly ordered — middleware can ship only after Pin-stop 2 because it imports validators and `lib/messages/lookup.ts` from the Pin-2 surface. If Codex finds itself wanting to ship middleware before Pin 2, that's a sign the dependency analysis was wrong; surface it.

### Pinned contract @ a7dff4e (Pin-stop 1 — 2026-05-03)

```ts
// lib/auth/jwt.ts
export function signLinkJwt(input): Promise<{ token: string; signingKeyId: string }>;
export function verifyLinkJwt(token): Promise<{ payload: LinkJwtPayload; verifiedKid: string }>;
```

Verification: `pnpm test tests/auth/jwt.test.ts` passed (4 tests); `pnpm typecheck` passed; `pnpm lint` clean.

### Pinned contract @ 8d2fdc6 (Pin-stop 2 base — 2026-05-04)

```ts
// lib/auth/constants.ts
export const SESSION_COOKIE_NAME: "__Host-fxav_session";
export const BOOTSTRAP_COOKIE_NAME: "__Host-fxav_bootstrap_v";
export const SESSION_COOKIE_MAX_AGE_SEC: number; // 43200
export const SESSION_IDLE_TIMEOUT_SEC: number; // 900

export type AuthFailureCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_ABSOLUTE_TIMEOUT"
  | "SESSION_IDLE_TIMEOUT"
  | "LINK_SESSION_KEY_ROTATED"
  | "LINK_NO_CREW_MATCH"
  | "LINK_VERSION_MISMATCH"
  | "LINK_REVOKED_FLOOR"
  | "LINK_REVOKED_SURGICAL"
  | "GOOGLE_NO_CREW_MATCH"
  | "AMBIGUOUS_EMAIL_BINDING"
  | "ADMIN_SESSION_LOOKUP_FAILED";

export type AuthFailure = {
  status: 401 | 403 | 410 | 500;
  code: AuthFailureCode;
};

// lib/auth/cookies.ts
export type SessionCookieEnvelope = { token: string; show_id: string };

export function setSessionCookie(value: string, opts: { maxAgeSec: number }): string;
export function clearSessionCookie(): string;
export function encodeSessionCookieValue(input: SessionCookieEnvelope): string;
export function decodeSessionCookieValue(raw: string | undefined): SessionCookieEnvelope | null;

// lib/auth/validateLinkSession.ts
export type LinkSessionViewer = { kind: "crew"; showId: string; crewMemberId: string };
export type LinkSessionValidationContext = { showId: string };
export type LinkSessionValidationResult =
  | { kind: "success"; viewer: LinkSessionViewer }
  | { kind: "continue"; clearCookie?: true; priorFailure?: AuthFailure }
  | { kind: "terminal_failure"; status: 401 | 500; code: AuthFailureCode; clearCookie?: true };

export function validateLinkSession(
  req: Request,
  context: LinkSessionValidationContext,
): Promise<LinkSessionValidationResult>;

// lib/auth/validateGoogleSession.ts
export type GoogleSessionViewer = {
  kind: "crew";
  email: string;
  showId: string;
  crewMemberId: string;
};
export type GoogleSessionValidationContext = { showId: string };
export type GoogleSessionValidationResult =
  | { kind: "success"; viewer: GoogleSessionViewer }
  | { kind: "continue" }
  | { kind: "terminal_failure"; status: 403 | 500; code: AuthFailureCode };

export function validateGoogleSession(
  req: Request,
  context: GoogleSessionValidationContext,
): Promise<GoogleSessionValidationResult>;

// lib/auth/isAdminSession.ts
export type AdminSessionResult = { ok: true; email: string } | { ok: false };
export function isAdminSession(req: Request): Promise<AdminSessionResult>;
```

Codex deviations (Pin-2 base):

1. `LINK_SESSION_KEY_ROTATED` returns terminal_failure rather than continue+clearCookie. **Spec-aligned per AC-5.6a** (server-side rotation is server-side fault classification).
2. Steps 11-12 not rendered inside the validator; identity only. **Spec-aligned per §7.4 + watchpoint #4** (role re-derivation lives in `getShowForViewer`).

Verification: `pnpm test` on cookies + 4 validator suites + resolveShowViewer = 30 tests passing; `pnpm typecheck` passed; `pnpm lint` clean.

### Pinned contract @ df647b7 (Pin-stop 2 extension — 2026-05-04)

```ts
// lib/auth/validateGoogleIdentity.ts
export type GoogleIdentityViewer = { kind: "crew"; email: string; crewMemberId: string };
export type GoogleIdentityValidationResult =
  | { kind: "success"; viewer: GoogleIdentityViewer }
  | { kind: "continue" };

export function validateGoogleIdentity(req: Request): Promise<GoogleIdentityValidationResult>;

// lib/data/listShowsForCrew.ts
export type CrewShowSummary = {
  id: string;
  slug: string;
  title: string;
  dates: unknown;
  crewMemberId: string;
};

export function listShowsForCrew(viewer: GoogleIdentityViewer): Promise<CrewShowSummary[]>;
```

Codex deviations (extension):

1. **`GoogleIdentityViewer.crewMemberId` is the Supabase Auth `user.id`, NOT a show-bound `crew_members.id`.** Codex chose this because `/me` is cross-show and a single `crew_members.id` doesn't exist for a cross-show identity. **`CrewShowSummary.crewMemberId` IS the per-show `crew_members.id`.** This means the same field name `crewMemberId` carries different referents across the two types — a contract trap. **Surfaced explicitly to the adversarial reviewer (M5 round 1):** decide whether to (a) accept and document the dual semantics, (b) rename `GoogleIdentityViewer.crewMemberId` → `userId` / `authUserId`, or (c) drop the field from `GoogleIdentityViewer` entirely (email is the canonical lookup key for `/me`; YAGNI says drop). My read: option (c) is cleanest. Not blocking §B start because §B's `/me` page consumes `email` for the `listShowsForCrew` call and ignores `viewer.crewMemberId` — but the rename should land before adversarial review concludes.
2. `listShowsForCrew` accepts the full `GoogleIdentityViewer` and uses its canonical email for the membership query. Spec-aligned with §7.3 email-based `/me` semantics.

Verification: `pnpm test` on cookies + 5 validator suites + listShowsForCrew = 35 tests passing; `pnpm typecheck` passed; `pnpm lint` clean.

### Pinned contract @ 766ed20 (Pin-stop 2 extension #2 — 2026-05-04)

```ts
// app/api/auth/redeem-link/route.ts
export function POST(request: NextRequest): Promise<Response>;

// lib/db/advisoryLock.ts
export type ShowAdvisoryLockMode = "try" | "block";
export class ShowAdvisoryLockUnavailableError extends Error {
  readonly code: "SHOW_ADVISORY_LOCK_UNAVAILABLE";
}
export class ShowAdvisoryLockShowNotFoundError extends Error {
  readonly code: "SHOW_ADVISORY_LOCK_SHOW_NOT_FOUND";
}
export function withShowAdvisoryLock<T>(
  showId: string,
  mode: ShowAdvisoryLockMode,
  fn: () => T | Promise<T>,
): Promise<T>;

// lib/auth/requireAdmin.ts
export function requireAdmin(): Promise<void>; // interface unchanged from M3 stub; body now production (Supabase Auth via @supabase/ssr + is_admin() SQL helper)

// lib/auth/validateNextParam.ts
export const DEFAULT_AUTH_NEXT_PATH: "/admin";
export type ValidateNextParamOutcome =
  | { ok: true; path: string }
  | { ok: false; path: "/admin"; code: "OAUTH_REDIRECT_INVALID" };
export function validateNextParamDetailed(raw: unknown): ValidateNextParamOutcome;
export function validateNextParam(raw: unknown): string;

// app/auth/callback/route.ts
export function GET(request: NextRequest): Promise<Response>;

// app/auth/sign-out/route.ts
export function POST(request: NextRequest): Promise<Response>;
export function GET(): Promise<Response>; // 405

// lib/messages/lookup.ts
export type MessageParams = Record<string, string | number | boolean | null | undefined>;
export function messageFor(code: MessageCode, params?: MessageParams): MessageCatalogEntry;

export type MessageCode =
  | "LINK_EXPIRED"
  | "LINK_REVOKED_FLOOR"
  | "LINK_REVOKED_SURGICAL"
  | "LINK_VERSION_MISMATCH"
  | "LINK_NO_CREW_MATCH"
  | "LEAKED_LINK_DETECTED"
  | "CSRF_DENIED"
  | "CSRF_NONCE_EXPIRED"
  | "CSRF_KEY_ROTATED"
  | "GOOGLE_NO_CREW_MATCH"
  | "AMBIGUOUS_EMAIL_BINDING"
  | "SESSION_NOT_FOUND"
  | "SESSION_IDLE_TIMEOUT"
  | "SESSION_ABSOLUTE_TIMEOUT"
  | "LINK_SESSION_KEY_ROTATED"
  | "LINK_REDEEM_KEY_ROTATED"
  | "OAUTH_STATE_INVALID"
  | "OAUTH_REDIRECT_INVALID"
  | "ADMIN_SESSION_LOOKUP_FAILED"
  | "WATCH_CHANNEL_ORPHANED"
  | "WEBHOOK_TOKEN_INVALID"
  | "REPORT_ORPHANED_LOST_LEASE"
  | "GITHUB_BOT_LOGIN_MISSING"
  | "REPORT_LEASE_THRASHING"
  | "TILE_SERVER_RENDER_FAILED"
  | "INVALID_JSON"
  | "SLUG_REQUIRED"
  | "SHOW_REALTIME_BROADCAST_AUTH_FAILED"
  | "SHOW_REALTIME_CROSS_SHOW_FORBIDDEN"
  | "SHOW_REALTIME_TOKEN_MISCONFIGURED"
  | "SHOW_VERSION_AUTH_FAILED"
  | "SHOW_VERSION_CROSS_SHOW_FORBIDDEN"
  | "SHOW_VERSION_TOKEN_RPC_FAILED";
```

Codex deviations (extension #2):

1. **DEFERRED.md SHA self-reference impossibility.** Codex correctly noted that a commit cannot literally contain its own SHA. M2-D6 was marked Resolved in commit `dc68471` (the advisory-lock commit), and orchestrator backfills the SHA into DEFERRED.md in a follow-up commit. Not a contract issue, just a process note.
2. **Operator-log writes for some auth error branches not wired** because no shared operator logging sink exists yet. Codes are cataloged and tested but not actually emitted to a sink. M6 / M8 will introduce the sink; M5 surfaces the codes correctly. **Adversarial-reviewer pin item:** confirm the deferral is acceptable and doesn't violate any spec §12.4 producer requirement.
3. **`DEFAULT_AUTH_NEXT_PATH: "/admin"` as the failsafe fallback.** Crew users do not have access to `/admin` (RLS denies). If crew OAuth completes with an invalid `next`, validateNextParamDetailed returns `path: "/admin"`, and the callback redirects there, crew hits an authorization failure and bounces somewhere — potential redirect dead-end. **Adversarial-reviewer pin item:** the callback route's user-type-aware fallback (admin → /admin, crew → /me) should run AFTER validateNextParam returns its failsafe, so the failsafe never actually lands a crew user on /admin. Confirm this composition by reading `app/auth/callback/route.ts`.

Verification: `pnpm test` = 1273 tests passing across 74 files; `pnpm lint` clean; `pnpm typecheck` passed; `pnpm test:e2e tests/e2e/redeem-link.spec.ts` = 6 tests passing; `pnpm test tests/db/schema-introspection.test.ts` = 103 tests passing.

**Adversarial-review carry-forward (cumulative across all three pin-stops + §B implementation + Task 5.6 close-out):**

From contract pin-stops:

- **CF-PIN-1** (extension #1) `GoogleIdentityViewer.crewMemberId` is Supabase Auth `user.id`; `CrewShowSummary.crewMemberId` is `crew_members.id`. Same field name, different referents. Recommend rename `GoogleIdentityViewer.crewMemberId` → `userId` or drop the field entirely.
- **CF-PIN-2** (extension #2) `DEFAULT_AUTH_NEXT_PATH: "/admin"` failsafe risks crew redirect dead-end — needs callback-side disambiguation.
- **CF-PIN-3** (extension #2) Operator-log writes deferred to M6/M8 sink — confirm acceptable.

From §B implementation (reported at f027da7):

- **CF-IMPL-1 (CRITICAL)** — `lib/auth/requireAdmin.ts:32` still has the M3 `ADMIN_DEV_PANEL_ENABLED` build-time gate. In production (flag unset) every admin request 404s. Pin-2 ext#2 contract said "body now production" — not honored in code. Workaround: `ADMIN_DEV_PANEL_ENABLED=true` set on test server. **§A must replace before M5 ships to production.** Reviewer should verify this is the first thing fixed in round 1.
- **CF-IMPL-2** — `lib/auth/validateGoogleSession.ts:55` and `lib/auth/isAdminSession.ts:9` both `void req;` — the `req: Request` parameter is decorative. Synthetic Request from `/show/[slug]/page.tsx` and `/me/page.tsx` is forward-compat only. Either remove the parameter (interface break) or wire it to actually read cookies (current implementation reads via `next/headers` cookies()).
- **CF-IMPL-3** — 14 M4 e2e specs `.skip`'d pending `?crew=` mock migration onto `signInAs(NON_ADMIN_CREW_FIXTURE)` per-show seeding. Tracked as deferred follow-up; ~150 tests await migration. Suggested home: M5 follow-up touch OR M9 polish.
- **CF-IMPL-4** — `validateGoogleSession` returns `terminal_failure` 403 for `GOOGLE_NO_CREW_MATCH`. Should be `continue` (no infrastructure fault). §B chain adapter has a workaround treating step-3 status-403 as continue. **§A should fix the validator** so the workaround can be removed; otherwise the watchpoint #4 invariant ("terminal_failure reserved for server-side faults; client-driven faults return continue") drifts silently.

**Pre-existing build failure noted by Codex at Task 5.6 (cefa902):** `pnpm build` fails on a `.next/dev/types` reference to disabled `/admin/dev/page.js` during the build wrapper. Not introduced by M5; pre-existing. Reviewer should confirm this is genuinely pre-existing (not a regression from M5's `app/admin/layout.tsx` AlertBanner mount) and route to the right milestone.

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

- [x] `/impeccable critique <surface>` — UX heuristic scoring, persona walkthroughs, AI-slop test, absolute-ban scan.
  - Score sheet attached: visual hierarchy, IA, cognitive load, emotional resonance, a11y floor, persona-specific scan-speed rule.
  - HIGH findings fixed OR logged in `DEFERRED.md` with a target milestone.
  - MEDIUM findings triaged: fix-now / defer to in-milestone polish / defer to a future polish milestone.

- [x] `/impeccable audit <surface>` — Technical quality checks (a11y, performance, responsive, theming, anti-patterns). Scored P0–P3.
  - P0/P1 findings fixed before adversarial review.
  - P2/P3 findings triaged.

- [x] DEFERRED.md updated with any retrospective deferrals.
- [x] Dispositions inline below or referenced by SHA.

```
critique findings:
- C1 (P0) /me identical card grid, no "what's next" anchor — disposition: deferred to M9 polish via M5-D1
- C2 (P0) Bootstrap no liveness/timeout — disposition: deferred to M9 polish via M5-D2
- C3 (P1) AlertBanner single-alert / no queue depth / no Resolve confirm — disposition: deferred to M9 polish via M5-D3
- C4 (P1) Sign-in no FXAV brand mark / no Google G icon — disposition: deferred to M9 polish via M5-D4
- C5 (P2) "Ask Doug" copy / no self-serve fallbacks — disposition: deferred to M9 polish via M5-D5

audit findings:
- A-P1 #1 /me sign-out below 44px tap min — disposition: fixed at 1678000
- A-P1 #2 AlertBanner Resolve missing focus-ring offset + transition — disposition: fixed at 1678000
- A-P2 #4 admin layout p-6 raw vs token — disposition: fixed at 1678000
- A-P2 #6 /me ShowCard hover-shadow no-op — disposition: fixed at 1678000
- A-P3 #1 /me <time> redundant tabular-nums className — disposition: fixed at 1678000
- A-P2/P3 batch (5 minor a11y/markup) — disposition: deferred to M9 polish via M5-D6
- Systemic #1 accent button drift — disposition: deferred via M5-D7 (atom extraction at M6 or first 4th-variant trigger)
- Systemic #2 inline error copy duplication — disposition: deferred via M5-D8 (§A coordination)
```

The convergence log proper (below) appends ONLY after impeccable evaluation closes AND adversarial review begins. The milestone is marked "completed" only when BOTH impeccable §12 has zero unresolved HIGH/P0/P1 findings AND adversarial review has converged.

---

## Convergence log

### Cross-CLI adversarial rounds (R3–R22, this Claude Code session via `/codex:adversarial-review`)

After the §A/§B implementation closed at the four pinned contracts (Pin-1 `a7dff4e`, Pin-2 base `8d2fdc6`, Pin-2 ext#1 `df647b7`, Pin-2 ext#2 `766ed20`, §A close-out `cefa902`, §B finish `f027da7`), we ran cross-CLI adversarial review through Codex via `/codex:adversarial-review --base 29f7106 --scope branch`. Each round anchored to the milestone base (per memory `feedback_adversarial_review_full_milestone_scope`), iterating until convergence per the project's "iterate until APPROVE" rule (memory `feedback_iterate_until_convergence`). Codex reviewed both §A (auth backend) and §B (UI) as a single milestone diff each round; finding repair followed the routing rule (`§A→Codex via /codex:rescue --resume-last`, `§B/UI→Opus inline`).

Two recurring bug classes drove most of the early rounds: (a) **Supabase data destructure without error check** (rounds 3, 5, 9, 14) and (b) **catch-all wrappers that masked infrastructure faults as benign auth signals** (rounds 14, 15, 16, 17, 18). These were eventually closed by structural meta-discipline (R18 + R21) — see "Meta-discipline" note below.

| Round | §A / §B summary | Key commits |
| ----- | --------------- | ----------- |
| R3 | 4 §A findings: `validateLinkSession.last_active_at` UPDATE error swallowed; sign-in page crew→/admin dead-end; redeem-link Supabase read errors → terminal_failure; delay nonce consume until after read-only validation | (commits in implementer phase prior to `8140121`) |
| R4 | 3 §A findings: nonce consume oracle leak (move after local checks); harden `validateLinkSession.deleteSession` error path; sign-out atomic teardown (delete `link_sessions` row) | (implementer phase) |
| R5 | Verification round only — fixes from R3+R4 confirmed | — |
| R6 | §A 1 CRITICAL → R7 (§B never ran due to Codex usage cap): leaked-link revocation atomicity; isolate alert-sink failure from revocation-success path | `b11de6d` |
| R7 | §A 1 HIGH (cleanup-bootstrap-nonces RPC EXECUTE grants); §B 1 HIGH + 2 MEDIUM (CSRF_DENIED on unknown `show_id`, /me + /show published-status gating) | `4ba1bd6`, `66aeddc`, `dc82f25` |
| R8 | §A 1 HIGH + §B 2 HIGH (Codex F1+F3+F4 via `/codex:rescue`; Opus inline F2): production `requireAdmin` no longer build-flag gated; `revoke_leaked_link_atomic` + `cleanup_bootstrap_nonces` + `mint_link_session_*` EXECUTE locked to `service_role`; published-gate on auth resolver + redeem-link mint | `6d26e76`, `8d01b52`, `2372743`, `8136172` |
| R9 | §A 3 findings + §B 2 findings → R10: revert `bootstrapMint` to try-mode (block-mode held DB connection per waiter — exhaustion under burst); early published-gate + fresh active-key re-read in redeem-link | `53b8d23`, `bf68714` |
| R10 | §A 1 HIGH + §B 2 findings: non-admin published-show gate before any chain side-effect (no last_active_at refresh on unpublished); reverse sign-out failure path (cataloged error + preserve cookies); atomic conditional INSERT for `link_sessions` via SECURITY DEFINER RPC; jittered exponential backoff for `bootstrapMint` retries; break Google-no-crew redirect loop by routing to `/me` | `9701c40`, `b472431`, `3614ede`, `6a378fc`, `45f7ff1` |
| R11 | Bootstrap shell published-gate before render; strip consumed bootstrap nonce entry on redeem success | `fc6cd9f`, `d7733f1` |
| R12 | Sign-out teardown failure renders catalog HTML (was raw JSON); defense-in-depth published-show gate inside `bootstrapMint` Server Action | `bfbab74`, `41672c4` |
| R13 | Leaked-link middleware HTML response + JWT-verifier infra distinction; fail-stop sign-out after first teardown failure; strip consumed bootstrap entry on every post-consume return path | `ab88750`, `b13d6d6`, `86c6ade` |
| R14 | Preserve `max_issued_version` monotonicity in leaked-link Branch C (lift floor in one transactional UPDATE); preserve validator infra failures through `resolveShowViewer`; route Google-no-crew through `/auth/clear-session` when `clearCookie:true` | `3082f53`, `41c3a4d`, `42bf9ae` |
| R15 | `clear-session` same-origin guard (logout-CSRF defense, GET-side effect); preserve infra failures through `resolveShowViewer` + `isAdminSession`; `isAdminSession` discriminated `{ ok: false; reason: 'not_admin' \| 'infra_error' }` | `d744a3f`, `5b38f54` |
| R16 | `validateGoogleSession` `getUser` returned-error → `terminal_failure` 500 (was `continue` masking infra as benign); redeem-link distinguishes JWT verifier infra errors from validation failures via shared `isJwtInfraError`; preserve Google identity infra faults on `/me` (switch-account empty state) | `7e4addc`, `7a64d29`, `aeb34ff` |
| R17 | `requireAdmin` distinguishes infra fault from auth denial via typed `AdminInfraError`; OAuth callback + sign-in surface `isAdminSession.reason === 'infra_error'` (later refined in SR-9 to no longer use the public `?code=` channel); wrap validator client construction + render show-page errors cataloged | `2c275aa`, `5d881ed`, `f9a16f0` |
| R18 | `validateLinkSession` body wrapped in top-level try/catch (thrown infra faults → `terminal_failure`); admin layout catches `AdminInfraError` and renders cataloged copy; OAuth callback distinguishes `exchangeCodeForSession` infra throws vs invalid OAuth state; show-page classifies `getShowForViewer` throws (auth-deny vs infra) | `c0cf079`, `1a777ea`, `2b03c4e`, `4b174b4` |
| R18 + meta-discipline | After 6 consecutive rounds in the same bug class ("auth helper masks infra fault as benign auth signal"), introduced `tests/auth/_metaInfraContract.test.ts` — a structural guard that enumerates every helper subject to the contract and asserts each surfaces infra throws as discriminable infra-failure (not benign continue). The meta-test immediately caught two real gaps in `validateGoogleSession` and `requireAdmin` that 18 rounds of class-sweeps had missed; both fixed in the same commit. Memory rule recorded at `feedback_meta_contract_test_for_recurring_bug_class.md`. | `5b4e11e` |
| R19 | 3 HIGH + 2 MEDIUM. F1 (HIGH §A SQL, dispatched to Codex via `/codex:rescue`): advisory lock moved INTO `revoke_leaked_link_atomic` SECURITY DEFINER (was JS-side wrapper only — note this introduced the deadlock that R20 then fixed). F2 (HIGH §B): show-page rethrew `AdminInfraError` instead of converting to `terminalFailure`. F3 (HIGH §A): `resolveShowViewer` slug-lookup bypass; meta-discipline contract docstring claimed coverage but no test row existed. F4 (MEDIUM §B): sign-in page direct Supabase calls without infra handling. F5 (MEDIUM §B): sign-out partial teardown atomicity — clear cookies for completed teardown steps. | `c28b52f`, `5559532`, `64b210b`, `ea8da20`, `00321d5` |
| R20 | **1 CRITICAL** (§A): R19 F1 introduced a deadlock — the JS-side `withShowAdvisoryLock` wrapper held the per-show advisory lock on connection A while the now-locking `revoke_leaked_link_atomic` RPC ran on connection B and waited for the same key. Every `?t=` leaked-link revocation hung until the RPC timed out, defeating watchpoints #11/#12 entirely. Fix: removed the JS-side wrapper from the leaked-link path; in-RPC lock is the single per-show serialization point. Structural guard test added that scans `middleware.ts` for the wrapper and fails if it returns. Negative-regression verified (stash → 3 tests fail; restore → 11 pass). | `619d2ed` |
| R21 | 2 MEDIUM. F1 (§B): pre-chain data loaders (`resolveShowFromSlug` + `listShowsForCrew`) threw on infra faults — escaped the cataloged terminal-failure render path used elsewhere in the chain. Now: discriminated union `{ kind: 'found' \| 'not_found' \| 'infra_error' }`; call sites route to existing `messageFor("ADMIN_SESSION_LOOKUP_FAILED")` block. F2 (§B): leaked-link revocation alert was upserted with code `ADMIN_SESSION_LOOKUP_FAILED` whose `dougFacing` was `null` — `AlertBanner` rendered an empty alert shell with just a Resolve button. Added dedicated `LEAKED_LINK_REVOCATION_FAILED` catalog entry + meta-catalog test pinning the contract that every `admin_alerts` upsert code MUST have non-null `dougFacing`. | `fdafdd7`, `98aeb37` |
| R22 | 2 HIGH + 1 MEDIUM. F1 (HIGH §A): `admin_alerts.upsert(...)` returned-error was never inspected — Supabase returned-error vs throw silently dropped the operator alert. Now throws on returned `{ error }`; outer try/catch logs and surfaces the cataloged 503. F2 (HIGH §A): sign-out POST accepted cross-site forms (logout-CSRF) — added `Sec-Fetch-Site` / `Origin` same-origin guard before any teardown work. F3 (MEDIUM §A): redeem-link route used `withShowAdvisoryLock(showId, "block")` wrapping multi-step Supabase ops — under venue-scale bursts the connection pool could exhaust. Switched to `try` mode + 503 `SHOW_BUSY_RETRY` signal; client retries with jittered exponential backoff (mirrors `bootstrapMint` R8 §B pattern). | `de8cfa7`, `dd8ae2b`, `5cc7cdf` |
| R23 | Codex `adversarial-review` subcommand hung at the same setup step on 5 consecutive attempts (broker confirmed healthy via trivial `task` smoke), spanning two account/cap reset windows. Diagnosed as a Codex backend / subcommand-specific issue, not a finding. Cancelled, paused the cross-CLI loop, and transitioned to the Codex self-review series (SR-1 below). No commits at this round. | — |

**State at end of cross-CLI phase:** all 13 numbered findings (R3–R22) closed; 1605 vitest passing; typecheck + lint clean; meta-discipline tests at `tests/auth/_metaInfraContract.test.ts` and `tests/messages/_metaAdminAlertCatalog.test.ts` pinning the recurring contracts.

### Codex self-review series (no cross-model invocation; user-directed posture)

After the cross-CLI phase converged (R3–R22 above; R23 blocked on a Codex backend hang), the user directed a follow-on **local** adversarial code review — Codex reviewing the M5 plan + spec + handoff + implementation directly, with cross-CLI invocation explicitly ruled out. Each finding was verified with a failing test before patching; each round's commit set was scoped per AGENTS.md §1.6. The repo's "UI is Opus territory" routing rule was relaxed for two rounds where the user granted a one-shot exception (SR-3 alert banner UI; SR-5 sign-in / show-page UI).

**Final M5 verdict:** APPROVED. Cross-CLI phase R3–R22 (13 findings closed) + Codex self-review series SR-1…SR-9 (28 commits). Full Vitest + Playwright (mobile-safari) + typecheck + lint green at HEAD `7d44842`.

| Round  | Theme                                                                     | Commits                                                              |
| ------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| SR-1   | Env aliases / production DB URL guard / CSRF nonce classification + consume; replace X.3 placeholder skip with smoke audit | `c7f535c`, `68be0cc`, `6411e36`                                      |
| SR-2   | `AuthSessionMissingError` is unauthenticated (not infra); production service-role secret guard; `mint_link_session_*` RPC takes its own per-show advisory lock; **X.3 smoke audit replaced by AST-based audit** at `lib/audit/authChain.ts` with negative-regression fixtures | `7e7b45f`, `703e1b4`, `db4b3b6`, `c6ab3e3`                           |
| SR-3   | Nested advisory-lock RPC deadlock guard (in-RPC lock removed from mint when JS-side wrapper still held); admin alert recurrence coalesced via SECURITY DEFINER `upsert_admin_alert(...)` (migration `20260505000000_*`) — both producers (`validateGoogleSession`, `middleware.ts` leaked-link) routed through `lib/adminAlerts/upsertAdminAlert.ts` shared helper; per-show alert resolution scoped (`show_id IS NULL` predicate + banner click-through to `/admin/show/<slug>?alert_id=…`) — *user granted UI-edit exception for `b32a8f3`* | `fcb3362`, `35dddcf`, `b32a8f3`                                      |
| SR-4   | OAuth callback exchanges `code` before applying `OAUTH_REDIRECT_INVALID` (a fix-introduced regression vs spec); CSRF_NONCE_EXPIRED only emitted when full cookie array's entry timestamps look newer than the nonce row (forged full-cookie stays CSRF_DENIED); leaked-link Playwright e2e updated to expect HTML body, not the JSON shape that pre-dated `ab88750` | `dbc2a47`, `112f80a`, `57b80df`                                      |
| SR-5   | Server-side Google OAuth start route (`app/api/auth/google/start/route.ts`) so PKCE verifier cookies carry HttpOnly via Supabase SSR cookie hardening (Task 5.8 spec contract); `validateGoogleSession` GOOGLE_NO_CREW_MATCH now `continue` (tri-state contract per watchpoint #4 — eliminates the show-page workaround); show-page redirects no-crew authenticated users to `/me`, breaking the sign-in loop. *User granted UI-edit exception for both commits.* | `0482424`, `f943019`                                                 |
| SR-6   | Static auth-chain audit broadened from 3 paths to redeem-link / sign-in / callback / sign-out; redeem-link mutations moved into lock-taking SECURITY DEFINER RPCs (`consume_bootstrap_nonce_atomic` + `mint_link_session_if_active_kid_matches` — migration `20260505000001_*`); JS-side `withShowAdvisoryLock` removed from redeem path; `LEAKED_LINK_DETECTED` admin alert emitted on successful compromise revocation (was alert-on-failure-only); `no-inline-email-normalization` static guard extended to `lib/auth/**` + `lib/data/**` | `aa8dcab`                                                            |
| SR-7   | Server-authoritative auth-state check inside the locked mint RPC (`20260505000003_recheck_link_session_mint_auth_state.sql`) — token version race after route pre-checks now returns `LINK_VERSION_MISMATCH` / `LINK_NO_CREW_MATCH` / `LINK_REVOKED_FLOOR` / `LINK_REVOKED_SURGICAL` / `LINK_REDEEM_KEY_ROTATED` without minting; bootstrap-nonce mint moved into a single lock-taking RPC (`20260505000002_mint_bootstrap_nonce_atomic.sql`); chunked PKCE verifier cookie cleanup (`sb-*-auth-token-code-verifier.<n>`) on OAuth callback | `e82be3d`                                                            |
| SR-8   | Bootstrap-nonce cookie envelope is now HMAC-signed (`lib/auth/bootstrapCookie.ts`) — unsigned JSON cookies are rejected as CSRF_DENIED even when nonce hash matches (closes implicit-trust gap in cookie array); `assertBootstrapCookieSigningConfigured()` preflight in `bootstrapMint` so a missing `JWT_SIGNING_SECRET` fails before the DB nonce row is written; e2e cookie shim is now browser-aware (Chromium host-only `__Host-` Secure planting; WebKit local-HTTP planting) and stubs redeem-link in mint-only assertions to avoid measuring redeem cleanup | `9fc7a75`, `77ee918`, `3b52bd9`                                      |
| SR-9   | Drift cleanup. Public `?code=` allowlist no longer includes `ADMIN_SESSION_LOOKUP_FAILED` (drift introduced by `5d881ed`); infra-failing OAuth start + callback now render cataloged HTML directly (`status: 503`, `Content-Type: text/html`) instead of widening the URL contract; literal close-out greps satisfied by removing comment-only hits of `validateGoogleSession`, `__Host-fxav_session`, `viewerRole`, and raw `drive.google.com` / `docs.google.com` hostnames; new `tests/cross-cutting/noRawDriveHostsInCrewSurface.test.ts` pins the source-hygiene gate | `bb2f7a5`, `8339a11`, `e1a1fa5`, `7d44842`                           |

### Verification at convergence (HEAD `7d44842`)

- `pnpm test` — 102 files / 1 skipped; 1745 tests passed
- `pnpm typecheck` — clean
- `pnpm lint` — 0 errors (existing 49 warnings unrelated to M5)
- `pnpm test:e2e --project=mobile-safari tests/e2e/{redeem-link,bootstrap,leaked-link,auth-chain,sign-in-page,me-page,admin-banner}.spec.ts` — 56 passed, 2 skipped (documented X.3 fixture-plumbing gaps in `auth-chain.spec.ts`)
- `pnpm dlx supabase db reset && pnpm db:seed` — migrations apply cleanly; 10 fixture shows seeded
- Literal §6.18 self-consistency greps — all five gates return zero matches (`lastPollAt`, `validateGoogleSession` in `app/me` + `lib/data/listShowsForCrew.ts`, `__Host-fxav_session` outside the cookie/constants helpers, `viewerRole`, `JWT` outside comments in `validateLinkSession.ts`)
- `git diff --check` — clean working tree

### M5-D / CF status delta across both phases

- **DEFERRED M2-D6** — advisory-lock helper API stable across both phases. Initial in-RPC lock moved in R19 F1 (`c28b52f`); deadlock from JS-side wrapper + in-RPC lock fixed in R20 (`619d2ed` removed the wrapper from leaked-link); SR-2 added the equivalent in-RPC lock to `mint_link_session_*` (`db4b3b6`); SR-6 moved redeem-link mutations entirely into lock-taking SECURITY DEFINER RPCs (`aa8dcab`); SR-7 added bootstrap-nonce mint to the same pattern (`e82be3d`). Nested-lock deadlock class is now statically guarded by `tests/auth/advisoryLockRpcDeadlock.test.ts`. **Resolved.**
- **DEFERRED M5-D2** — operator-log producers for redeem-link remain deferred to M6/M8 sink per the original `8140121` deferral (out of M5 scope). `LEAKED_LINK_DETECTED` admin alert now emitted on **successful** compromise revocation (was failure-only) per spec §11 (`aa8dcab`); `LEAKED_LINK_REVOCATION_FAILED` is the dedicated failure-side catalog code with non-null `dougFacing` (R21 `98aeb37`).
- **CF-PIN-1** — `GoogleIdentityViewer.authUserId` vs `CrewShowSummary.crewMemberId` naming distinction preserved through this work; `lib/auth/validateGoogleIdentity.ts` returns identity-only `{ email, authUserId }` (R-era rescue + SR-9 comment cleanup at `7d44842`).
- **CF-PIN-2** — `/admin` failsafe redirect verified through cross-CLI rounds (no crew dead-end); confirmed admin precedence intact through R18 + SR-2 broadened auth-chain audit.
- **CF-IMPL-1** — production `requireAdmin` build-flag gate fully retired in R8 fix series; SR-2 + SR-6 broadened auth-chain audit (`c6ab3e3`, `aa8dcab`) confirms no leak via the AST-level dominator check.
- **CF-IMPL-2** — `req` parameters on `validateGoogleSession` / `isAdminSession` documented as intentional cross-helper signature uniformity.
- **CF-IMPL-3** — 14 M4 e2e specs `.skip`'d for `signInAs` blocker remain skipped (out of M5 scope; M3 follow-up territory).
- **CF-IMPL-4** — `GOOGLE_NO_CREW_MATCH` chain-adapter workaround in show-page retired in SR-5 (`f943019`); `validateGoogleSession` returns `{ kind: 'continue', code: 'GOOGLE_NO_CREW_MATCH' }` per watchpoint #4. Show-page redirects no-crew authenticated users to `/me` rather than looping through sign-in.

### Recurring bug-class meta-discipline

Two recurring classes drove almost all of the early findings; both were closed structurally rather than per-instance:

1. **"Auth helper masks infra fault as benign auth signal"** (rounds 14, 15, 16, 17, 18). Closed by `tests/auth/_metaInfraContract.test.ts` (R18 `5b4e11e`) — enumerates every helper subject to the contract (`isAdminSession`, `validateGoogleIdentity`, `validateGoogleSession`, `validateLinkSession`, `requireAdmin`, `resolveShowViewer`) and mocks Supabase to throw at construction / `getUser` / `rpc` / `from`, asserting each surfaces a discriminable infra-failure result. The meta-test caught two real gaps on first run that 18 rounds of class-sweeps had missed.
2. **"`admin_alerts.upsert` with a code that has `null` dougFacing"** (R21 F2). Closed by `tests/messages/_metaAdminAlertCatalog.test.ts` (R21 `98aeb37`) — registers every catalog code currently used in production `admin_alerts.upsert` calls and asserts non-null dougFacing.

Memory rule for both patterns recorded at `feedback_meta_contract_test_for_recurring_bug_class.md`: when a bug class recurs in 3+ consecutive review rounds, write a structural meta-test rather than another patch dispatch.

### Notes

- The X.3 audit was reshaped: the original `tests/auth/x3-m5-smoke.test.ts` (string-order) was deleted in `c6ab3e3` and replaced by `lib/audit/authChain.ts` (TypeScript AST) plus `tests/cross-cutting/auth.test.ts` covering crew page / `/me` / bootstrap shell / redeem-link / OAuth callback / sign-in / sign-out, with negative-regression fixtures for each. This satisfies the plan's "path-sensitive" intent for M5 scope; full cross-codebase semantic dominator analysis remains a Task 11.x consumer (out of M5).
- Two UI-edit exceptions to the AGENTS.md "UI is always Opus" rule were granted in this loop (SR-3 alert banner; SR-5 sign-in / show-page) and are recorded above. Future UI work continues to default to Opus.
