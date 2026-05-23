# Crew Auth Pivot — Show-Link + "Who Are You?" Picker — Design Spec

**Status:** drafted 2026-05-23 (pending self-review + cross-model adversarial review). Implementation plan to follow in a separate session via the writing-plans skill.
**Author:** Eric Weiss
**Companion docs:** [`PRODUCT.md`](../../../PRODUCT.md) → "Crew auth & sharing model (2026-05-23 owner determination)"; the parent spec [`2026-04-30-fxav-crew-pages-design.md`](./2026-04-30-fxav-crew-pages-design.md) (this spec supersedes its §5.2 / §7.2 / §7.2.1 / §7.2.2 / §7.2.3 / §9.2 in full; the parent spec's pre-amendment block stays readable as historical context).
**Routing note:** UI work in the implementation plan is Opus + impeccable v3 per [ROUTING.md hard rule](../plans/2026-04-30-fxav-crew-pages-design/ROUTING.md). The plan itself can be authored by either CLI.

> **Why this spec exists.** The 2026-05-23 owner determination retired the per-crew-member signed-link auth model that was specced and shipped through M9.5. The determination is recorded in `PRODUCT.md:69` ("Crew auth & sharing model — 2026-05-23 owner determination") and the amendment block-quote at the top of the parent spec (`2026-04-30-fxav-crew-pages-design.md:7-10`). Doug shares **one link per show**, not one link per crew member. Crew tap the link, see a "who are you?" picker listing the show's roster, tap their own name, and the page renders for them. The selection persists in a per-device cookie. Role-based filtering remains a UX feature for crew focus — not a security gate against people Doug has already chosen to share the show with.

> **What this spec replaces.** Anywhere this spec contradicts the parent, this spec is canonical for v1. The parent spec's §7.2 (signed-link format), §7.2.1 (per-link revocation), §7.2.2 (cookie-session validation), §7.2.3 (revocation summary), §5.2 token-version mechanism, and §9.2 per-show sharing controls describe an obsolete model. This spec also introduces the affirmative successor — a new auth chain, new cookie shape, new admin surface, and the cleanup contract for the M9.5 surfaces that go dormant when this spec's plan executes.

> **Pre-shipping discovery — no compat window.** The app has not shipped to production. There are no live `#t=<jwt>` signed links in crew threads. The implementation plan can perform a clean cutover (delete the JWT/redemption/bootstrap surfaces, drop the M9.5 tables) without a transitional window. This eliminates the dual-path complexity that an "in flight at cutover" model would have required.

---

## 1. Goal & scope

Doug Larson PMs Institutional Investor shows for FXAV. The parent spec replaced his dense Google Sheet with a per-crew-member mobile web page. The original auth model (per-person JWT-signed link, in-fragment token, redemption to a server-side `link_sessions` cookie, per-row Issue / Revoke controls) optimized for a threat model — "individual crew members can be selectively revoked when a link leaks" — that Doug does not actually operate. Doug shares URLs through the same group thread he already uses for the sheet. Role filtering is a UX focus tool, not a security gate against the people in that thread.

The owner-determined v1 model:

- **One link per show.** `https://crew.fxav.show/show/<slug>/<share-token>` is the only URL Doug shares. He sends it once per show through his existing channel. **R34/R38 amendment**: the slug alone is NOT the credential — slug derivation is deterministic from sheet title + month (per `lib/parser/slug.ts:4-10`), so a slug-only URL would be guessable by anyone who knows the client name and approximate event date. The `<share-token>` segment carries high entropy: **32 random bytes hex-encoded via `encode(gen_random_bytes(32), 'hex')` → 64 lowercase hex characters matching `^[0-9a-f]{64}$`**. This is the canonical encoding across the URL, the DB column, the resolver RPC, and the entropy meta-test. Both URL segments are validated by the route handler; either alone (or a mismatched pair) returns 404.
- **"Who are you?" picker.** First visit on a device renders an interstitial listing the show's current crew roster (`crew_members` rows where `show_id` matches). Crew member taps their own name.
- **Per-device sticky identity.** Selection persists in a host-wide cookie (`__Host-fxav_picker`) carrying a combined JSON map keyed by `show_id`. 90-day `Max-Age` refreshed by the four R41-R20 cookie-mutator surfaces (three crew-side Server Actions + `/api/auth/picker-bootstrap` Route Handler) only — middleware refresh removed in R16 (lost-update race); `/auth/callback` is DB-stamp-only per R41-R6. Picker is a one-time gate per device per show until the cookie expires.
- **Role filtering preserved.** The role-derivation contract in `lib/data/getShowForViewer.ts:218-230` is untouched: role flags are read fresh from `crew_members.role_flags` on every request, joined to `shows_internal` only for LEAD/admin viewers (parent spec §7.4). Picker identity is the input to that fetcher; role is derived from the input, not stored in the cookie.
- **Identity escape hatch.** A pinned "Not you?" link in the page chrome clears the cookie key for that show and re-prompts. No per-person revocation (the model doesn't support it).
- **Admin path unchanged.** `isAdminSession` precedence in `lib/auth/resolveShowViewer.ts:123-126` continues to short-circuit the crew auth chain for Doug + Eric. Admin previews via `/admin/show/<slug>/preview/<crewId>` remain Doug's spot-check tool.

**v1 in-scope outcomes:**

- The crew page (`app/show/[slug]/[shareToken]/page.tsx` per R35) renders the picker interstitial when no valid selection exists for the show in the cookie; otherwise renders the existing `_ShowBody.tsx` with the picked identity supplied to `getShowForViewer`.
- A new Server Action sets the cookie key and revalidates.
- An admin button on `/admin/show/<slug>` ("Reset picker selections on this show") bumps a `shows.picker_epoch` integer that invalidates every device's selection for that show in one operation.
- The M9.5 signed-link surfaces (JWT, redeem-link, fragment-bootstrap, leaked-link middleware, per-row Issue/Revoke controls, `crew_member_auth` / `link_sessions` / `bootstrap_nonces` / `revoked_links` tables) are deleted in the same plan execution.
- `viewer_version_token` (composite Realtime invalidation token from parent spec §8 "Realtime subscription contract") continues to work; its `crew_member_auth.last_changed_at` term is removed in the same migration that drops the table — the term was only carrying JWT-version mutations.

**Success looks like:** Eric (operating in dev mode against existing fixtures) can open `/show/<fixture-slug>`, see the picker, tap a name, and have the crew page render exactly as it did under M9.5's signed-link path — with the same role-filtered tile inventory, same Realtime updates, same admin precedence — but the URL was one Doug could have shared with the whole crew at once. No fragment, no redemption, no per-person revoke surface.

---

## 2. Out of scope (explicit deferrals)

The 2026-05-23 owner determination relaxed the threat model. The following are deliberately and explicitly OUT for v1; each is paired with the reasoning so a future reviewer doesn't re-litigate it.

- **Per-person revocation.** The model cannot support it. Anyone with the show-link can pick any name on that show's roster. To revoke "one person," Doug removes them from the sheet; the next sync drops them from `crew_members`; the next page load shows them an empty-state "you're no longer on this show's crew" inside a re-prompted picker. Per-person locking would require a credential the picker model doesn't have.
- **Audit log of picker selections.** The threat model does not call for it. If Doug ever asks "who picked which identity on which device," that's a v2 candidate. v1 stores no server-side selection log; the cookie is client-only state.
- **SSO / OAuth as a REQUIRED crew credential.** Crew never NEED to sign in — the share-link + picker is the primary access path; the OAuth restoration per R41 Resolved Decisions 15-17 is an OPTIONAL identity layer, not a credential gate. Show access works for anonymous (cookie-less) users with a valid `/show/<slug>/<share-token>` URL. What R41 restores: (a) Google sign-in as a path that auto-resolves to the user's matching crew row (login skips the picker via picker-bootstrap), (b) `/me` as a cross-show discovery surface for signed-in users, (c) `validateGoogleSession` callers in the allowlist (§10.1). The admin OAuth login (Doug, Eric) is unchanged — `isAdminSession` allowlist + Postgres `is_admin()` RPC. **What stays OUT**: per-crew-row OAuth-credential REQUIREMENT, password auth, magic links, social logins other than Google.
- **Search / typeahead on the picker.** Doug's shows top out around 15 crew (M11 retro data, fixture corpus inspection). A flat alphabetical list scrolls cleanly at that size on a 390px viewport. Search adds chrome that wouldn't earn its keep. If rosters grow past ~25 in future, search can be layered on the flat list additively — not a redesign.
- **Per-device naming or "manage my devices" affordance.** The cookie is the device. There is no UI for naming, listing, or revoking individual devices. New device = no cookie = picker prompts again.
- **Compact / chrome-less picker variant on re-prompts.** Re-prompts (after "Not you?" or after cookie expiry) use the same picker UI as first-time. A separate compact variant would be a second design surface to maintain with no behavioural gain — crew still need to find their name in a list.
- **Confirm dialog on identity switch.** Tapping "Not you?" returns to the picker immediately. The picker is cheap to re-traverse; re-selecting the same name puts the cookie back instantly. A confirm dialog would add a modal layer to the most reversible UX action on the surface.
- **Backwards-compatibility for `#t=<jwt>` URLs.** The app has not shipped. There are no live signed-link URLs in crew threads. The plan executes a hard cutover: the JWT/redeem-link/bootstrap surfaces are deleted, not bridged.
- **Cross-device sync of selection.** Cookies are inherently per-browser. A crew member who taps the link on phone, then later on tablet, picks themselves on each. This is the desired behaviour — the cookie is a device preference, not a profile.

The `BL-COPY-SHARE-LINK` backlog item (per-person URL copy affordance) is **implicitly retired** by the pivot. There is no per-person URL to copy; the share affordance is "send `/show/<slug>/<share-token>` to the group thread." This spec does not need to take action on the backlog row beyond noting the dependency.

---

## 3. Resolved decisions (numbered)

Each decision is owner-determined; cite by number from this list in the implementation plan and in any later round of review. None of these are open for re-debate.

1. **One link per show; URL is `/show/<slug>/<share-token>`.** No fragment, no per-person URL, no JWT. The link is the credential. **R34 amendment**: the URL carries a high-entropy `<share-token>` segment alongside the human-readable slug; the slug alone is NOT a credential (it's deterministic from sheet title + month per `lib/parser/slug.ts:4-10` and therefore guessable). Route handler requires BOTH segments to match for the same show row; mismatch returns 404 (indistinguishable from "unknown show").
2. **Picker container is an interstitial route.** `/show/<slug>/<share-token>` renders ONLY the picker (FXAV mark + show title + roster list) as the entire viewport when no valid selection exists. After selection, the same URL renders the existing `_ShowBody.tsx`. No skeleton, no modal, no behind-the-picker chrome. **Bookmark target: the tokenized URL** — crew bookmark the full `/show/<slug>/<share-token>` URL. A slug-only URL never resolves to a crew page in production code; the Next route file structure (per §4.7 R35 amendment) makes the tokenized path the only crew entry point.
3. **Picker list shape: flat alphabetical, role chip right-aligned.** One scrollable list, sorted by `crew_members.name` ascending. Each row shows `<name>` (primary) and a role chip drawn from `crew_members.role` (the human-readable string, e.g., "A1", "LEAD"). LEAD chip uses FXAV orange (`#F79338`) per the parent `PRODUCT.md:42-47` accent contract; all other chips use the neutral surface from `DESIGN.md`.
4. **Cookie shape: `__Host-fxav_picker` carrying an HMAC-signed versioned JSON envelope (R36 amendment).** Inner wire form: `{ "v": 1, "selections": { "<show_id_uuid>": { "id": "<crew_member_id_uuid>", "e": <picker_epoch_int>, "t": <unix_seconds_int> } } }`. The cookie's actual value is `<base64url(payload)>.<base64url(hmac_sha256(payload, secret))>` — a signed envelope using `PICKER_COOKIE_SIGNING_KEY` (a new server-side secret, 32 random bytes, stored in env). On decode, the verifier (a) splits payload + signature, (b) recomputes the HMAC, (c) timing-safe compares; any mismatch yields `null` (treated as `no_selection`). **Why signed**: without an HMAC, the cookie is a plain client-controlled bearer credential — a forged `Cookie` header with valid show/crew UUIDs would bypass the share-token gate for API routes that authenticate by cookie alone. R36 critical finding. The signed envelope makes the picker cookie tamper-evident: only a server that knows the secret can mint a valid cookie. **R41-R20 corrected mint-path list**: two surfaces mint a valid cookie — (a) `selectIdentity` Server Action (bypass-pick path; runs only after the tokenized URL route confirmed the share-token; uses DB-side observed_at_seconds from select_identity_atomic as `t` per R41-R18); (b) `/api/auth/picker-bootstrap` Route Handler (lazy-mint path for Google-signed-in users; runs after `claim_oauth_identity` stamps; uses `extract(epoch from now())::bigint` at write time as `t` because the row is already claimed and no race is possible from inside the per-show lock). Both surfaces use the same envelope signer and the same 90-day Max-Age. The `t` field is the unix-second epoch of the entry's last touch. It is the LRU sort key when the byte-budget cap (Resolved Decision 6) is hit. URL-encoded into the cookie value. Single host-wide cookie (no per-show cookie names).
5. **TTL: 90 days, advanced on FOUR cookie-mutator surfaces.** `Max-Age=7776000` re-emitted by (a) the three crew-side Server Actions — `selectIdentity`, `clearIdentity`, `cleanupStaleEntry` — and (b) the R41-R6 Route Handler — `/api/auth/picker-bootstrap` (R41-R20 amendment). **NOT** re-emitted by middleware (the middleware refresh path was removed in R16 due to an unfixable lost-update race; see §4.9), NOT by `resetPickerEpoch` (admin-side; emits no Set-Cookie per R30 amendment), and NOT by `/auth/callback` (R41-R6: callback is DB-stamp-only). A crew member who picks once and never re-picks will see the cookie expire 90 days after the last selection and the picker re-prompts; re-selection (via selectIdentity OR picker-bootstrap, depending on auth path) refreshes the cookie. The §10.1 picker-cookie-contract meta-test asserts all four (not three) surfaces use the same envelope signer and the same Max-Age constant.
6. **Cap: byte-budget LRU eviction (target ≤ 3800 bytes encoded), not a fixed entry count.** On every write that would grow the cookie, the encoder iteratively evicts the entry with the lowest `t` (last-touch unix-seconds) until the final URL-encoded `Set-Cookie` value (including the cookie name `__Host-fxav_picker=` prefix) is at or below 3800 bytes. The 3800-byte target sits comfortably below the 4096-byte (4 KB) browser per-cookie cap with ~300 bytes of safety margin for the `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Max-Age=7776000` attribute suffix. **An earlier draft of this spec stated a fixed 50-entry cap based on a back-of-envelope ~80-byte-per-entry estimate; that estimate undercounted by ~25%.** Real per-entry size (UUID show key + UUID crew id + `e` + `t`, URL-encoded) is ~106 bytes encoded; 50 entries would be ~5.3 KB raw / ~7.2 KB after `encodeURIComponent` overhead, exceeding the browser cap. The byte-budget approach is robust to JSON-encoding overhead changes and works regardless of the actual entry count (which will land near 35 at the cap given current entry sizing). The encoder helper exposes a `MAX_COOKIE_VALUE_BYTES = 3800` constant; a structural meta-test asserts the constant is never raised beyond 3900 without a paired comment explaining the browser-cap implication.
7. **Removed-id behaviour: silent re-prompt with empty-state banner.** When the cookie's `crew_member_id` no longer matches an active row in `crew_members` for `show_id` (Doug removed them between sessions), the resolver returns `kind: 'removed_from_roster'`, the picker re-renders with a banner: "Your previous selection was removed by Doug." **R32 amendment**: the cookie is NOT cleared during the Server Component render (Server Components cannot mutate cookies in Next 16); cleanup is deferred to the `cleanupStaleEntry` Server Action via the auto-submitting `<StaleCleanupAutoSubmit>` client component per §4.9. The compare-and-delete contract ensures the cleanup is race-safe with concurrent `selectIdentity` writes.
8. **Show-link lifetime: as long as the show row exists.** `shows.archived = true` (per `lib/sync/unpublishShow.ts` and the existing `shows` table per migration `20260501000000_initial_public_schema.sql:3-29`) is the kill switch. No date-based expiry. No admin "expire link" button. Doug archives a show when he wants its link to stop working.
9. **Escape-hatch placement: pinned header chip.** Sub-header strip on every crew page render shows `"<Name> · <Role>"` with a "Not you?" link below. Tap navigates to `/show/<slug>/<share-token>` (the same tokenized URL the page was loaded from) with that show's cookie key cleared; server re-renders the picker. Same URL, no query param, browser history unchanged.
10. **Admin panel: per-row Issue/Revoke controls deleted. "Reset picker selections on this show" button added. Preview-as-crew unchanged.** The new button bumps `shows.picker_epoch` by 1. Every device's stored `e` for that show goes stale on next visit; picker re-prompts. The button is idempotent and requires no per-device state on the server.
11. **No `crew_member_auth` table in v1.** The table (per migration `20260501001000_internal_and_admin.sql:8-16`) exists solely to track per-crew-member JWT versioning. With JWTs retired, the table is dropped. Its `last_changed_at` contribution to `viewer_version_token` (per migration `20260501001000_internal_and_admin.sql:18-30`) is removed in the same migration; the composite becomes `GREATEST(shows.last_synced_at, MAX(crew_members.last_changed_at))`.
12. **No `link_sessions`, `bootstrap_nonces`, `revoked_links` tables in v1.** All three exist to support the JWT path (per migration `20260501001000_internal_and_admin.sql:107-136`). All three drop in the same migration as `crew_member_auth`.
13. **Admin path is untouched.** `isAdminSession` precedence in `resolveShowViewer.ts:123-126` continues to short-circuit the crew chain. Admins do not see the picker. The picker cookie is irrelevant to admin requests.
15. **Google sign-in is restored as an OPTIONAL crew identity layer (R41 — reverses R14/R15's deletion of `/me` + `validateGoogleSession`).** The owner re-decided on 2026-05-23 after the share-token-credential design hardened: the strict reading of "crew never sign in" was over-applied by Codex's R14 finding. The corrected reading is: **show ACCESS doesn't require sign-in — anyone with `/show/<slug>/<share-token>` reaches the picker without auth — but sign-in remains available as an opt-in upgrade that adds (a) identity exclusivity in the picker and (b) cross-show discovery via `/me`.** Net consequences this spec carries:
    - **`/me` is preserved.** The page and `lib/data/listShowsForCrew.ts` survive. The listing now renders tokenized URLs (`/show/<slug>/<share-token>`) — the new SECURITY DEFINER RPC `my_share_tokens_for_email()` (per §5.3 below) returns `{ slug, share_token }[]` for shows whose `crew_members.email` matches **`public.auth_email_canonical()`** (R41-R19 — canonical form; NOT raw `auth.email()`) server-side. Crew who never sign in never use `/me`; crew who do sign in get one place that lists every show they're on. Doug's share-link workflow is unchanged — `/me` is a fallback discovery tool, not a replacement.
    - **`validateGoogleSession.ts` is preserved.** Production callers post-pivot (full structural allowlist enforced by `no-jwt-surface` meta-test §10.1 — this is the single source of truth, any prose drift in narrative bullets is wrong): `lib/auth/picker/resolveShowPageAccess.ts` (the PAGE-ROUTE-ONLY resolver helper), `app/me/page.tsx` (cross-show discovery), `app/auth/callback/route.ts` (claim-stamp hook), `app/api/auth/picker-bootstrap/route.ts` (R41-R2 cookie-bootstrap), and the test directory. **`resolvePickerSelection.ts` does NOT import `validateGoogleSession`** — it is the cookie-only helper called from both the page route AND every API consumer (`/api/asset/{diagram,reel,agenda}`, `/api/realtime/subscriber-token`, `/api/show/[slug]/version`, `/api/report`); putting Google auto-resolve inside it would silently authenticate API calls without a picker cookie. **`/api/report` does NOT keep its M11 Google-session arm**: a Google-signed-in crew user visits the show page first (the page route's redirect-to-bootstrap path mints a picker cookie automatically via the Route Handler), then any subsequent API call carries the cookie. The §10.2 negative regression test pins this: a Google session + matching crew row + no picker cookie → /api/report returns 401, never 200.
    - **The auth chain at `/show/<slug>/<share-token>` adds a Google-session arm AHEAD of the picker (R41-R16 corrected flow).** New ordering: archived → 404, then admin → render-as-admin, then unpublished → 404 (R41-R10 moved this guard ahead of the Google-session resolve to prevent bootstrap-loop), then **`validateGoogleSession` matching `crew_members.email` for THIS show → REDIRECT to `/api/auth/picker-bootstrap` (the legal cookie mutator; Server Components cannot emit `Set-Cookie` per Next App Router contract — R41-R6); bootstrap mints the picker cookie and 302s back; the follow-up page request takes the cookie path → renders show body**. Login skips the picker via this two-hop server-side redirect chain (user sees one URL transition). Then the cookie path → render show body. Then no-auth-resolved → "Sign in or skip" interstitial gate. The picker interstitial is reached only via the "Skip" path (or after a stale-cookie cleanup). Detailed flow in §4.1.
    - **Identity exclusivity: signed-in names are deactivated in the bypass picker.** New `crew_members.claimed_via_oauth_at TIMESTAMPTZ NULL` column (§5.1). Stamped on every successful OAuth callback whose `auth.users.email` matches any `crew_members` row (per §4.8 R41 amendment — global across all shows for that email; one sign-in claims identity everywhere). Picker rendering joins this column and marks rows with non-null `claimed_via_oauth_at` as visually disabled. Tapping a disabled row redirects to `/auth/sign-in?next=<tokenized URL>` rather than minting the cookie. The picker bypass is now: "pick a name that hasn't claimed identity via OAuth." See §7 for the visual contract.
    - **Permanent claim, not sliding.** Once a crew member signs in via OAuth, their name is locked in the bypass picker on every device, every show, forever (until Doug removes + re-adds the row in the sheet, which generates a fresh `crew_members.id` with null `claimed_via_oauth_at`). v2 candidate: an admin-side "release identity claim" affordance for the rare case where a crew member loses Google access.
    - **`/api/report`'s Google-session arm stays deleted** (see allowlist bullet above). The R14 deletion of the API arm holds; what R41 restores is the page-route auto-resolve (which mints a picker cookie) and `/me` (which lists tokenized URLs). The route accepts (a) picker cookie + matching `show_id` in the body, OR (b) `isAdminSession`. Google-signed-in crew get a picker cookie automatically via page-route step-4 before they ever hit `/api/report`.
    - **The `kind: 'crew_google'` arm of the `ShowViewer` discriminated union stays banned** (it was the M9.5 chain-level discriminator that hard-coupled OAuth to the M9.5 link-session chain). The new auth chain at `/show/<slug>/<share-token>` does NOT use `resolveShowViewer`; it inlines the chain directly per §4.1. The `no-jwt-surface` meta-test still bans the `crew_google` literal; `validateGoogleSession` imports are allowlisted to the production callers enumerated above.

16. **Sign-in-or-skip interstitial gate (R41 amendment).** When `/show/<slug>/<share-token>` resolves but none of {admin, Google session matching a crew row for this show, valid picker cookie} succeeds, the route renders a new gate component `<SignInOrSkipGate>`. Layout: brand strip + show identifier + two clear actions — **primary: "Skip and pick your name"** (server-driven navigation that re-enters the route with a `?gate=skip` flag the route handler reads as permission to render the picker interstitial); **secondary: "Sign in with Google"** (initiates the OAuth flow with the current tokenized URL as the post-callback destination). The skip-CTA is primary because the workflow's default audience (most crew most of the time) just wants to see their call time; sign-in is the opt-in upgrade. Anti-pattern: making sign-in feel mandatory or making skip hard to find — the gate is not a wall. Detailed UX in §7.

17. **Login skips the picker entirely (R41-R6 revised — lazy-mint flow).** When a user signs in via Google OAuth, the auth callback handler stamps `claimed_via_oauth_at` on every matching `crew_members` row via `claim_oauth_identity` (under per-show advisory locks) and redirects to the validated `next` URL. **The callback does NOT mint picker cookies** (R41-R6 simplification — removes the high-frequency race surface of callback-write vs selectIdentity). Cookies are minted lazily, one show at a time, on the user's first visit to each show: `resolveShowPageAccess` detects Google-session + email-match + no-cookie → 302 to `/api/auth/picker-bootstrap` → bootstrap mints the entry → 302 back → page renders show body. The user-perceived flow is "signed in → skipped the picker" because the redirect-bootstrap-redirect chain executes server-side; the user sees one URL transition (sign-in → show page) with no intermediate picker render. The cookie's HMAC signature is the same as a `selectIdentity`-mint cookie; downstream API routes can't tell the two paths apart, which is intentional. **Edge cases — all handled by the same lazy-mint flow**: (a) Doug adds user to a new show post-sign-in → first visit triggers bootstrap (b) callback's RPC fails with infra error → bootstrap retries the RPC (idempotent) (c) cookies expire / cleared → next show visit re-triggers bootstrap (d) user signs in on a new device → bootstrap fires on first show visit on the new device. One audit-layer property: `claimed_via_oauth_at` is stamped at callback time, so every picker render after sign-in (on any device) deactivates this crew member's row in the bypass picker.
14. **Server Action drives selection.** `selectIdentity({ slug, shareToken, crewMemberId })` (Next 16 App Router idiom). **R37 amendment**: the action MUST receive AND re-validate the share-token before minting a cookie — calling the action with `{ showId, crewMemberId }` alone would let anyone with show/crew UUIDs forge a signed picker cookie, bypassing the share-token gate the page route enforces. The action invokes `resolve_show_by_slug_and_token(slug, shareToken)` server-side and gets back the `show_id` (or NULL → reject). Then validates the `crewMemberId` is in the current roster for that `show_id`, validates the show is published + not archived, reads current `shows.picker_epoch`, mutates the cookie via `Set-Cookie` header in the response (HMAC-signed envelope per Decision 4), calls `revalidatePath`. The picker form embeds `slug` and `shareToken` as hidden inputs sourced from the route params (which the page-route resolver already validated).

---

## 4. Architecture

### 4.1 Request flow (crew member, first visit)

```
Crew taps `/show/<slug>/<share-token>` in group thread
        │
        ▼
(middleware.ts is a no-op stub — R16 removed cookie refresh; see §4.9)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ app/show/[slug]/[shareToken]/page.tsx (Server Component)    │
│                                                              │
│  1. resolveShowFromSlugAndToken(slug, shareToken)            │
│       → { id, published, archived }                          │
│       | not_found | infra_error                              │
│       Bound SELECT requires BOTH slug AND share_token to     │
│       match the SAME row (R34): a mismatched pair returns    │
│       not_found, indistinguishable from "unknown show."      │
│                                                              │
│  2. if archived === true:                                    │
│     notFound() — EVEN FOR ADMINS. The `/show/<slug>` route   │
│     is a crew surface; admins debug archived shows via the   │
│     admin route at `/admin/show/<slug>` instead. R27         │
│     amendment: this gate runs BEFORE admin precedence to     │
│     align with Appendix D's archived = kill-switch contract  │
│     for all viewers.                                         │
│                                                              │
│  3. if isAdminSession(req) → requireAdmin() confirmation;    │
│     render as admin. (Admins see unpublished — but archived  │
│     is already a 404 from step 2. R16 double-gate preserved  │
│     against predicate/chokepoint drift.)                     │
│                                                              │
│  3.5 R41-R10 amendment: if NOT published → notFound().       │
│     Moved AHEAD of step 4 (the Google-session resolve path)  │
│     so an unpublished show with a Google-signed-in user      │
│     whose email matches a crew row cannot enter the          │
│     picker-bootstrap chain. Without this gate, the bootstrap │
│     handler's claim_oauth_identity filters published-only,   │
│     so the unpublished show is omitted from result.shows;    │
│     bootstrap 302s back without minting; step 4 re-fires →   │
│     infinite loop. Admin precedence (step 3) preserves the   │
│     admin-sees-unpublished behavior.                         │
│                                                              │
│  4. else: resolveShowPageAccess(req, showId) — R41 amendment │
│     (page-route-only helper; NOT used by API routes per      │
│     R41-R1 Fix-3 structural split).                          │
│     Internally calls validateGoogleSession(req). Branches:   │
│     a. No Google session → fall through to step 5.           │
│     b. Session exists, email matches EXACTLY ONE crew row    │
│        for this show, cookie has an entry whose `id` EQUALS  │
│        that matched crew_member_id, AND the matched row's    │
│        claimed_via_oauth_at IS NOT NULL (the OAuth claim     │
│        succeeded), AND cookie.t >= extract(epoch from        │
│        claimed_via_oauth_at)::int (cookie was minted AT      │
│        OR AFTER the claim, indicating it came from           │
│        picker-bootstrap post-claim) → fall through to step   │
│        6 (cookie path; typical post-bootstrap flow).         │
│        R41-R12 amendment: the IS-NOT-NULL check is required  │
│        because callback's claim_oauth_identity can fail with │
│        infra error — leaving the row's claim NULL. Without   │
│        this check, branch b would accept the cookie (same    │
│        id) and skip bootstrap, never retrying the claim;     │
│        the identity-exclusivity contract would silently      │
│        fail. The bootstrap retry is the recovery path.       │
│     b'. Session exists, email matches EXACTLY ONE crew row,  │
│         AND ANY of the following hold:                       │
│         (i) cookie has an entry whose `id` does NOT equal    │
│             that crew_member_id (shared-device shadow), OR   │
│         (ii) cookie's `id` matches BUT the matched row's     │
│              claimed_via_oauth_at IS NULL (callback's claim  │
│              RPC failed; need to retry — R41-R12), OR        │
│         (iii) cookie's `id` matches AND row is claimed BUT   │
│               cookie.t < claim_epoch (same-user pre-claim    │
│               upgrade — R41-R11), OR                         │
│         (iv) NO cookie entry for this show exists at all     │
│              (the original needs_picker_bootstrap case)      │
│         → return needs_picker_bootstrap. Picker-bootstrap    │
│         invokes claim_oauth_identity (idempotent retry),     │
│         then mints a fresh post-claim cookie. All four       │
│         scenarios converge on the same legal redirect path.  │
│     c. (subsumed by branch b'(iv) — R41-R12 consolidation.   │
│        The "no cookie entry" case was previously a separate  │
│        branch; it now collapses into b'(iv) since the        │
│        decision and downstream behavior are identical.       │
│        Documentation preserved here for back-references      │
│        across the spec; branch letter retained to avoid      │
│        renumbering drift across other §-numbered citations.) │
│        Page route emits the redirect via:                    │
│          redirect('/api/auth/picker-bootstrap?next=' + next  │
│            + '&t=' + intentToken)                            │
│        from next/navigation. Server Components CANNOT mint   │
│        cookies; the Route Handler is the legal mutator.      │
│        Intent token canonical format per §4.7 producer/      │
│        consumer harmonization (R41-R10): base64url(JSON({    │
│        slug, shareToken, exp: 60s})) + '.' + base64url(      │
│        HMAC(payload, PICKER_COOKIE_SIGNING_KEY)).             │
│     d. Session exists, email matches MULTIPLE crew rows for  │
│        this show (R41-R4 ambiguous-email defense — would     │
│        otherwise redirect-loop because picker-bootstrap      │
│        omits ambiguous shows from result.shows) →            │
│        return { kind: 'ambiguous_email' }; page falls        │
│        through to step 5/9 (gate or picker depending on      │
│        ?gate=skip) WITHOUT redirecting to bootstrap. The     │
│        AMBIGUOUS_EMAIL_BINDING admin alert is emitted from   │
│        validateGoogleSession's pre-existing detection path.  │
│        The user lands on the gate; tapping Skip lands on     │
│        the picker; both ambiguous crew rows render as        │
│        deactivated (after some other OAuth-sign-in stamped   │
│        them, or naturally NULL-stamped if no one has signed  │
│        in yet — see deactivated-row contract §7.2).          │
│        Resolution requires admin roster deduplication.       │
│     e. Session exists, email matches NO row for this show    │
│        → fall through to step 5 (the user is signed in but   │
│        not on this show's roster; SignInOrSkipGate naturally │
│        renders).                                             │
│                                                              │
│  5. (vacated — R41-R10 moved the unpublished guard to       │
│      step 3.5, ahead of the Google-session resolve. The      │
│      step number is preserved to avoid renumbering drift     │
│      across the spec; consumers reference these by name      │
│      not number.)                                            │
│                                                              │
│  6. else: read cookie __Host-fxav_picker                     │
│       → resolvePickerSelection({ showId, cookie })           │
│       (the COOKIE-ONLY helper; this is the SAME helper       │
│       imported by every API route — R41-R1 Fix-3)            │
│         returns one of SEVEN discriminant kinds (8 outcomes │
│         when identity_invalidated.reason is expanded —      │
│         R41-R14 wording sync):                              │
│           - { kind: 'resolved', crewMemberId }               │
│           - { kind: 'no_selection' }                         │
│           - { kind: 'epoch_stale' }                          │
│           - { kind: 'removed_from_roster' }                  │
│           - { kind: 'identity_invalidated', reason:          │
│               'claimed_after_pick' | 'email_ambiguous' }     │
│             (R41-R8 — covers stale-by-claim AND late-detected│
│             ambiguous-email cookies; see §6.1 cases 9 + 10)  │
│           - { kind: 'show_unavailable' }                     │
│           - { kind: 'infra_error', code }                    │
│                                                              │
│  7. if resolved → render show body:                          │
│       getShowForViewer(showId, { kind: 'crew',               │
│                                  crewMemberId })             │
│       render <_ShowBody data={...} identityChip={...} />     │
│                                                              │
│  8. else if request URL carries `?gate=skip` OR cookie state │
│     is one of {epoch_stale, removed_from_roster,             │
│     identity_invalidated} (returning user with stale state — │
│     R41-R13 sync added identity_invalidated to this list):   │
│       render <PickerInterstitial roster banner? />           │
│       Banner content is selected by the resolver kind:       │
│         - epoch_stale → PICKER_EPOCH_STALE_BANNER            │
│         - removed_from_roster →                              │
│             PICKER_REMOVED_FROM_ROSTER_BANNER                │
│         - identity_invalidated, claimed_after_pick →         │
│             PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER        │
│         - identity_invalidated, email_ambiguous →            │
│             PICKER_IDENTITY_AMBIGUOUS_BANNER                 │
│       (deactivated rows per §7 R41 amendment; cookie         │
│       cleanup via cleanupStaleEntry Server Action; see §4.9) │
│                                                              │
│  9. else (no auth resolved, no cookie at all, no gate=skip): │
│       render <SignInOrSkipGate slug shareToken /> — the new  │
│       R41 first-contact surface. Primary CTA "Skip and pick  │
│       your name" navigates to the same URL with ?gate=skip;  │
│       secondary CTA "Sign in with Google" initiates OAuth    │
│       with the tokenized URL as post-callback destination.   │
└─────────────────────────────────────────────────────────────┘
```

The `getShowForViewer` call shape uses the existing `Viewer` discriminated union at `lib/data/getShowForViewer.ts:79-82`, which has three arms: `{ kind: 'crew', crewMemberId }`, `{ kind: 'admin' }`, `{ kind: 'admin_preview', crewMemberId }`. The pivot's picker chain emits `{ kind: 'crew', crewMemberId }` — the same arm M9.5's `validateLinkSession`-derived path emitted (the older `crew_link` shape from `resolveShowViewer.ts:46` was a CHAIN-level discriminator, not a Viewer-level one; the data fetcher always saw `'crew'`). The data fetcher does not know or care that the identity came from a picker cookie instead of a redeemed JWT — it gets a `(showId, crewMemberId)` pair and re-derives role flags from the live row. **This is the structural reason the pivot is cheap to ship: every layer below the auth resolver is unchanged.**

### 4.2 Request flow (crew member, returning visit)

Identical to §4.1 except step 3 returns `{ kind: 'resolved', crewMemberId }` immediately. The picker never renders. The cookie's `e` (epoch) is compared to `shows.picker_epoch` inside `resolvePickerSelection`; on mismatch the validator returns `{ kind: 'epoch_stale' }` and the picker re-renders.

### 4.3 Request flow (selection submit)

```
Crew taps a name in the picker
        │
        ▼
<form action={selectIdentity}>
  <input type="hidden" name="slug"         value={params.slug} />
  <input type="hidden" name="shareToken"   value={params.shareToken} />
  <input type="hidden" name="crewMemberId" value={crew.id} />
  <button type="submit">…</button>
</form>
        │
        ▼
Server Action: selectIdentity({ slug, shareToken, crewMemberId })
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ lib/auth/picker/selectIdentity.ts (new)                     │
│                                                              │
│  0. (R37 — must run BEFORE any other validation):            │
│     showId ← resolve_show_by_slug_and_token(slug, shareToken)│
│     If NULL → reject PICKER_INVALID_SHARE_TOKEN.             │
│     NO cookie is emitted. NO further steps run.              │
│                                                              │
│  1. Validate crewMemberId ∈ current roster for showId        │
│     (SELECT id FROM crew_members WHERE id = $1 AND show_id   │
│      = $2; if 0 rows → reject with                           │
│      PICKER_CREW_MEMBER_NOT_FOUND / WRONG_SHOW).             │
│                                                              │
│  2. Read shows.picker_epoch, shows.published, shows.archived │
│     for showId. If !published OR archived → reject           │
│     PICKER_SHOW_UNAVAILABLE.                                 │
│                                                              │
│  3. Read existing HMAC-signed cookie envelope (verify        │
│     signature; null → start with empty envelope). Merge new  │
│     entry { showId: { id: crewMemberId, e: picker_epoch,     │
│     t: nowSeconds } }. Apply byte-budget LRU eviction if     │
│     encoded > 3800 bytes.                                    │
│                                                              │
│  4. Re-sign the envelope (HMAC-SHA256, PICKER_COOKIE_        │
│     SIGNING_KEY) and emit Set-Cookie with __Host-fxav_picker,│
│     90-day Max-Age, Path=/, HttpOnly, Secure, SameSite=Lax.  │
│                                                              │
│  5. revalidatePath(`/show/${slug}/${shareToken}`)            │
│  6. Server Component re-renders into _ShowBody               │
└─────────────────────────────────────────────────────────────┘
```

**Why a Server Action and not an API route.** The selection is a Next 16 App Router-native interaction; a `<form action={serverAction}>` works without JavaScript (degrades gracefully if the page was opened in a non-JS context). It also keeps the cookie write atomic with the route invalidation — no risk of "cookie set but page not refreshed" race.

### 4.4 Request flow ("Not you?" / clear selection)

```
Crew taps "Not you?" in the page chrome
        │
        ▼
<form action={clearIdentity}>
  <input type="hidden" name="showId" value={...} />
  <button type="submit">Not you?</button>
</form>
        │
        ▼
Server Action: clearIdentity({ slug, shareToken, showId }) (R39: slug+shareToken needed for revalidatePath)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ lib/auth/picker/clearIdentity.ts (new)                      │
│                                                              │
│  1. Read existing cookie envelope                            │
│  2. Delete the `selections[showId]` key                      │
│  3. If envelope.selections is now {}, clear the cookie       │
│     entirely (Set-Cookie with Max-Age=0); else re-emit       │
│  4. revalidatePath(`/show/${slug}/${shareToken}`)                          │
│  5. Server Component re-renders into <PickerInterstitial />  │
└─────────────────────────────────────────────────────────────┘
```

No URL change. No query parameter. Browser history is untouched (the form POST is intercepted by the App Router; the response is a 303-equivalent to the same URL, replacing the picker render). Bookmark of `/show/<slug>/<share-token>` (the tokenized URL) is preserved.

### 4.5 Admin "Reset picker selections" flow

```
Admin clicks "Reset picker selections on this show" on /admin/show/<slug>
        │
        ▼
Server Action: resetPickerEpoch({ showId })  [admin-only; requireAdmin()]
        │
        ▼
// Server Action invokes the RPC via the COOKIE-BOUND server client
// (NOT service-role) so the admin JWT propagates to the in-DB
// is_admin() gate. The existing admin-RPC pattern in the repo at
// app/admin/show/[slug]/actions.ts uses createSupabaseServerClient()
// (cookie-bound) precisely so the SQL gate sees the admin identity.
const supabase = await createSupabaseServerClient(); // cookie-bound
await requireAdmin();                                 // JS-side gate
supabase.rpc('reset_picker_epoch_atomic', { p_show_id: showId })
        │
        ▼ (server-side, single SECURITY DEFINER function — atomic)
        │
-- Full DDL (mirrors the existing admin-RPC pattern at
-- supabase/migrations/20260520000000_signed_link_admin_rpcs.sql):
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
  -- IN-FUNCTION ADMIN GATE (R17 — required, do NOT rely on JS-side
  -- requireAdmin() alone; an authenticated PostgREST caller could
  -- otherwise invoke this RPC directly via supabase.rpc()):
  if not public.is_admin() then
    raise exception 'admin role required'
      using errcode = '42501', hint = 'reset_picker_epoch_atomic is admin-only';
  end if;

  select drive_file_id into v_drive_file_id from public.shows where id = p_show_id;
  if v_drive_file_id is null then
    raise exception 'show not found'
      using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  -- RETURNING captures the post-UPDATE epoch under the held lock —
  -- this is the only source of truth for the new_epoch value used
  -- by the Server Action's return shape AND the PICKER_EPOCH_RESET
  -- admin-alert payload. Doing a separate post-RPC SELECT would be
  -- outside the lock and could observe a later epoch under a
  -- concurrent reset (R21 finding).
  update public.shows
     set picker_epoch = picker_epoch + 1,
         picker_epoch_bumped_at = now()
   where id = p_show_id
   returning picker_epoch into v_new_epoch;

  -- In-function call to the existing publish helper; pg_notify is
  -- transaction-scoped, so the notification fires atomically on COMMIT.
  perform public.publish_show_invalidation(p_show_id);

  return v_new_epoch;
end;
$$;

-- Privilege grants (matches AGENTS.md PostgREST DML lockdown discipline):
revoke all on function public.reset_picker_epoch_atomic(uuid) from public;
grant execute on function public.reset_picker_epoch_atomic(uuid) to authenticated, service_role;
-- Note: anon is intentionally NOT granted. Even if granted, the
-- in-function is_admin() check would reject.
        │
        ▼ COMMIT (implicit transaction wrapping the RPC call)
        │
        ▼
Every existing cookie entry for this show now has `e` ≠ shows.picker_epoch.
Next visit on each device triggers epoch_stale → picker re-prompts.
Realtime broadcast fired atomically with COMMIT on `show:<showId>:
invalidation` for any already-open tabs (composite viewer_version_token
has advanced via the new picker_epoch_bumped_at term in §4.6).
```

**Advisory-lock topology (per AGENTS.md invariant 2 — non-negotiable).** `resetPickerEpoch` mutates `public.shows`, so it MUST run inside the per-show advisory lock. Lock key is `hashtext('show:' || drive_file_id)` — the canonical project key per `AGENTS.md` invariant 2. **Holder topology: the lock is acquired INSIDE the SECURITY DEFINER RPC `public.reset_picker_epoch_atomic`, which is the ONLY entry point that mutates `shows.picker_epoch`.** The Server Action `resetPickerEpoch` is a thin wrapper that validates admin identity via `requireAdmin()` then calls `.rpc('reset_picker_epoch_atomic', ...)`; the Server Action layer itself does NOT call `pg_advisory_xact_lock`. This is a single-holder design — no nested holder, no JS-side wrapper above the RPC, no other DB function or trigger touches the column. The single-holder invariant is pinned by an extension to `tests/auth/advisoryLockRpcDeadlock.test.ts` (per §10.1 meta-test inventory). The RPC uses the blocking form (`pg_advisory_xact_lock`, not `pg_try_advisory_xact_lock`) because Reset is admin-initiated, not a cron path — invariant 2 directs admin/blocking paths to the blocking variant. If the lock is contended by a concurrent sync run for the same show, the RPC waits until the sync transaction commits, then proceeds. This is acceptable: Reset is a rare manual click, not a hot path.

**Why a SECURITY DEFINER RPC rather than an in-Server-Action transaction (R7 finding).** The Supabase JS client (`tx.rpc(...)`) cannot share a raw Postgres transaction with subsequent client calls — each `.rpc()` invocation runs in its own implicit transaction. Holding the lock, doing the UPDATE, and calling `publish_show_invalidation` from THREE separate `tx.rpc(...)` calls would split them across three transactions, defeating the atomicity AGENTS.md invariant 2 requires. The only way to have lock + UPDATE + publish atomic is to put them all inside one SQL function body. `public.reset_picker_epoch_atomic(p_show_id uuid)` is that function. Per parent spec §8 the existing `publish_show_invalidation(uuid)` SQL helper exists at `supabase/migrations/20260503000000_publish_show_invalidation_helper.sql` and is callable from inside another SECURITY DEFINER function via `PERFORM public.publish_show_invalidation(p_show_id)`.

**Why the lock matters.** Without it, a concurrent sync writing `shows.last_synced_at` (per `lib/sync/phase2.ts` etc.) could interleave with the Reset write in a way that loses one of the two updates depending on transaction isolation. The advisory lock serializes all `shows`-mutating paths so Reset and sync see each other's changes in a well-defined order.

The button is idempotent at the action level (clicking twice in succession bumps the epoch twice; the second bump is harmless — already-stale cookies remain stale). No server-side state is created per device; the epoch is the entire mechanism.

### 4.6 Composite `viewer_version_token` & Realtime bridge

The parent spec's Realtime contract (broadcast topic `show:<showId>:invalidation`, viewer-opaque payload, JWT-gated subscription via `/api/realtime/subscriber-token`) is **kept**. Only two things change:

1. **Auth source for the subscriber-token endpoint.** Pre-pivot, `app/api/realtime/subscriber-token/route.ts` reads the `__Host-fxav_session` cookie via `validateLinkSession`. Post-pivot, it reads `__Host-fxav_picker` via the new `resolvePickerSelection` helper. **R28 correction**: an earlier draft claimed the response shape was `{ token: <Realtime JWT> }`. The live route's actual response shape is `{ jwt, exp }` (verified at `app/api/realtime/subscriber-token/route.ts`; `ShowRealtimeBridge` reads `body.jwt`). The pivot preserves the existing `{ jwt, exp }` response shape. **JWT claims**: `iss`, `sub` (the resolved `crewMemberId`), `show_id`, `role` (preserved verbatim as `"authenticated"` — this is a Supabase Realtime requirement; the Realtime RLS policy in `supabase/migrations/20260504000000_realtime_private_channel_authorization.sql` is created `to authenticated`, and the live route comment at `app/api/realtime/subscriber-token/route.ts:15-24` explicitly notes the constant is mandatory; changing it would break private-channel auth — R29 amendment), `viewer_kind`, `exp`. The `viewer_kind` value changes: pre-pivot it was `crew_link` (signed-link path) or `crew_google` (Google session path); **post-pivot the new crew value is `crew`** (matching the data-fetcher `Viewer` arm at `lib/data/getShowForViewer.ts:79-82`). Admin path's `viewer_kind` continues to be `admin`. **Role flags are NOT carried in the JWT.** They're re-derived fresh from `crew_members.role_flags` on every render via `getShowForViewer` per the parent spec's §7.4 contract; the JWT only carries identity (`sub`, `show_id`, `viewer_kind`). The Realtime topic ACL policy (per parent spec §8) checks the JWT's `show_id` claim against the topic regex; it doesn't care about `viewer_kind`. **Tests**: `role === "authenticated"` for ALL tokens (picker + admin); `viewer_kind === 'crew'` for picker-cookie-authenticated tokens; `viewer_kind === 'admin'` for admin tokens; no token ever carries `crew_link` or `crew_google` (regression against the no-jwt-surface meta-test).
2. **`viewer_version_token` SQL function.** Per migration `20260501001000_internal_and_admin.sql:18-30`, the function currently computes `to_char(greatest(...), 'FM999999999999999')` over three sources: `shows.last_synced_at`, `MAX(crew_member_auth.last_changed_at)`, `MAX(crew_members.last_changed_at)`. The middle term goes away with `crew_member_auth`. The new composite preserves the existing `to_char(greatest(...))` wrapping and the existing function signature, return type, RLS grants, and SECURITY DEFINER posture:

   ```sql
   create or replace function public.viewer_version_token(p_show_id uuid)
     returns text
     language sql
     stable
     security definer
     set search_path = public, pg_temp
   as $$
     -- R41-R17 invariant fix: the token is a COMPOUND string of
     -- (greatest-millis):(picker_epoch) so two rapid epoch resets in the
     -- same millisecond produce distinct tokens. Without picker_epoch in
     -- the suffix, a reset/rotate pair landing inside one millisecond
     -- would leave open Realtime clients with an unchanged version token
     -- and no forced refresh despite cookies being invalidated.
     select
       to_char(greatest(
         coalesce((select extract(epoch from last_synced_at) * 1000 from public.shows where id = p_show_id), 0),
         coalesce((select extract(epoch from max(last_changed_at)) * 1000 from public.crew_members where show_id = p_show_id), 0),
         coalesce((select extract(epoch from picker_epoch_bumped_at) * 1000 from public.shows where id = p_show_id), 0)
       ), 'FM999999999999999')
       || ':'
       || coalesce((select picker_epoch::text from public.shows where id = p_show_id), '0');
   $$;
   ```

   A new column `shows.picker_epoch_bumped_at TIMESTAMPTZ NOT NULL DEFAULT now()` is added alongside `shows.picker_epoch`; the Reset action UPDATEs both atomically. This ensures bumping the epoch triggers a Realtime invalidation so other open tabs on other devices see the picker re-prompt without waiting for a navigation. **Why a separate `picker_epoch_bumped_at` instead of relying on `shows.last_synced_at`:** sync runs constantly; picker-epoch bumps are rare admin actions. Mixing them in the same column would make every sync look like a picker reset; mixing them in the broadcast payload would force every Realtime tab to re-validate the cookie unnecessarily.

### 4.7 Component tree (post-pivot)

- **Next route file structure (R35 amendment):** the crew route moves from `app/show/[slug]/page.tsx` to **`app/show/[slug]/[shareToken]/page.tsx`** — a nested dynamic segment. The slug-only `app/show/[slug]/page.tsx` is DELETED (no fallback render); a slug-only URL hits Next's 404. This makes the tokenized path the only possible crew route at the file-system level. The route component reads `params.slug` and `params.shareToken`, calls `resolveShowFromSlugAndToken(slug, shareToken)`, and proceeds with the existing auth chain.
- `app/show/[slug]/[shareToken]/page.tsx` (new, replaces `app/show/[slug]/page.tsx`) — auth resolution + delegation. **R41-R2 amendment (CRITICAL repair); R41-R6 intent-token contract; R41-R10 token format harmonized.** Imports `resolveShowPageAccess`. When the helper returns `{ kind: 'needs_picker_bootstrap', intentToken }`, the page calls `redirect('/api/auth/picker-bootstrap?next=' + encodeURIComponent(currentURL) + '&t=' + encodeURIComponent(intentToken))` from `next/navigation`. **The `&t=<intentToken>` parameter is REQUIRED** — picker-bootstrap returns 403 without it (R41-R5 CSRF defense). **Token format (canonical, used by BOTH producer and consumer — R41-R10 harmonization):** `intentToken = base64url(JSON({slug, shareToken, exp: now+60s})) + '.' + base64url(HMAC-SHA256(payload, PICKER_COOKIE_SIGNING_KEY))`. The producer (resolveShowPageAccess) and consumer (picker-bootstrap) MUST reference this canonical wire format; the §10.2 intent-token test asserts a producer-generated token round-trips through the consumer's decoder. Server Components cannot emit `Set-Cookie`; the Route Handler at the redirect target is the legal cookie mutator. Admin precedence + `requireAdmin()` defense-in-depth at the top of the chain (per the old file's docstring at lines 27-35) is preserved verbatim.
- `app/api/auth/picker-bootstrap/route.ts` (new, R41-R2 amendment; R41-R3 atomic claim-and-mint; R41-R5 intent-token CSRF; R41-R6 one-show write only; **R41-R7 fail-closed on RPC failure**). Route Handler that legally mints `__Host-fxav_picker` for a Google-signed-in user. **Flow:** (1) read `next` AND `t` (intent token); validate `next` against the `validateNextParam.ts` allowlist; **(1.5) verify the intent token** — `t = base64url(payload) + '.' + base64url(HMAC-SHA256(payload, PICKER_COOKIE_SIGNING_KEY))` where `payload = JSON({slug, shareToken, exp})`. Decoder rejects: missing `t`, malformed format, expired (`exp < now`), HMAC mismatch, OR `{slug, shareToken}` not matching the `next` URL's parsed slug+token. **A failed intent check returns 403** (NOT 302). The token's 60s expiry bounds replay; (2) `validateGoogleSession(req)` — no session → 302 to `next` with NO cookie set; (3) invoke `claim_oauth_identity(p_email = auth.users.email)`. **(3a) RPC infra failure — R41-R7 fail-closed contract**: if the RPC returns an error or throws, the handler MUST NOT 302 back to `next` (that would re-trigger the same step-4 detection → infinite loop). Instead, the handler returns an HTTP 502 with the cataloged terminal-failure UI rendered as HTML (same template as the page-route `infra_error` branch). The user sees a "Couldn't sign you in — please try again in a moment." page with a manual retry link. No cookie set. Structured log carries `PICKER_BOOTSTRAP_RPC_FAILED` operator code. Bounded recovery: user reload retries. The redirect-chain depth is structurally capped at 1 hop (page → bootstrap → 502 terminal page); (3b) on success, the RPC returns `{ claimed_count, shows }`; (4) **one-show write contract (R41-R6 lost-update repair)**: parse `next` to extract the target `slug`/`shareToken` → resolve via `resolve_show_by_slug_and_token` → obtain `target_show_id`. Find the entry for `target_show_id` in `result.shows`. If present, read the request's picker envelope, modify ONLY that show's entry to `{ id: crew_member_id, e: picker_epoch, t: now }`, leave every other entry untouched, write via `cookies().set('__Host-fxav_picker', signEnvelope(envelope), PICKER_COOKIE_OPTIONS)`. If `target_show_id` is NOT in `result.shows` (user not on this show's roster OR omitted as ambiguous), write NO cookie. The handler never touches entries for shows other than `target_show_id`; (5) 302 to `next`. **No redirect loop is possible across ALL paths**: (a) RPC success + target in shows + non-ambiguous → mint + 302 → page step 6 catches; (b) RPC success + ambiguous → `resolveShowPageAccess` returns `ambiguous_email` and the page never redirects in the first place; (c) RPC success + non-matching → bootstrap doesn't mint + 302 → page step 4(e) falls through to step 5; (d) RPC failure → 502 terminal page, NO 302 (R41-R7 fail-closed); (e) no Google session → 302 with no mint → page step 4(a) falls through to step 5 (gate or picker, no re-redirect); (f) invalid intent token → 403, no redirect. **This Route Handler IS in the cookie-mutator allowlist** alongside `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`; `/auth/callback/route.ts` is NOT in the allowlist (R41-R6 — callback does not write picker cookies). **Anti-overwrite contract**: handler MUST NOT modify entries for shows other than `target_show_id`. The §10.2 regression test asserts a pre-existing entry for Show-Y persists byte-identical across a picker-bootstrap call for Show-X.
- `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` (new, Server Component) — renders the picker. Reads the show's roster from `crew_members` via service-role client. Renders the `<form action={selectIdentity}>` markup. No client-side JavaScript needed for the picker itself. When the resolver returns **any of `epoch_stale` | `removed_from_roster` | `identity_invalidated`** (R41-R15 expanded — claimed-after-pick AND email-ambiguous reasons both trigger cleanup), also mounts `<StaleCleanupAutoSubmit>` (below) once with the resolver's `expectedEpoch` and `expectedCrewMemberId`. The compare-and-delete contract is identical across all four stale-state kinds; the banner copy differs per the §4.1 step-8 routing table.
- `app/show/[slug]/[shareToken]/_StaleCleanupAutoSubmit.tsx` (new, **client component** — the ONLY `'use client'` component in the picker tree) — renders an invisible `<form action={cleanupStaleEntry}>` with hidden inputs for `showId`, `expectedEpoch`, `expectedCrewMemberId`, and auto-submits on mount via `useEffect`. R25 amendment: this surface exists because cleanup form auto-submit requires client JS, which Server Components cannot provide.
- `app/show/[slug]/[shareToken]/_ShowBody.tsx` (existing `_ShowBody.tsx` MOVED into the tokenized route directory) — unchanged in role-derived rendering. **Modified** to accept a new prop `identityChip: { name, role }` which it renders into the existing sub-header strip (the same slot that holds the show title today).
- All `revalidatePath` calls in Server Actions use the tokenized form `/show/${slug}/${shareToken}` (not the slug-only form). The Server Actions accept both `showId` (cookie-relevant) and an optional path-string `pathToRevalidate` derived from the rendering page so the action can call `revalidatePath(pathToRevalidate)` correctly.
- `components/auth/IdentityChip.tsx` (new) — renders the `<Name> · <Role>` display + "Not you?" `<form action={clearIdentity}>`. Server Component (no client JS).
- `lib/auth/picker/cookieEnvelope.ts` (new) — `encodePickerCookie`, `decodePickerCookie` helpers. Mirrors the discipline of `lib/auth/cookies.ts:27-34` (versioned envelope, strict-shape decoder, null on parse failure / wrong `v` / wrong field types).
- ~~`lib/cache/showSlugMap.ts`~~ — **REMOVED in R16**. The helper existed to support middleware-refresh's slug→id lookup; with middleware refresh dropped (lost-update race), no consumer remains. Slug→id resolution where needed uses the existing `resolveShowFromSlug` pattern in `app/show/[slug]/page.tsx:119+`.
- `lib/auth/picker/resolvePickerSelection.ts` (new) — **the COOKIE-ONLY cookie-read + DB-validation helper.** Returns a discriminated union of **SEVEN discriminant `kind` values** (R41-R14 canonical wording — eight WIRE outcomes when `identity_invalidated.reason` is expanded): `resolved | no_selection | epoch_stale | removed_from_roster | identity_invalidated | show_unavailable | infra_error`. The `identity_invalidated` arm carries `{ expectedEpoch, expectedCrewMemberId, reason: 'claimed_after_pick' | 'email_ambiguous' }` per §6.1; consumers' switch statements MUST exhaustively handle BOTH the 7 kinds AND the 2 reasons inside `identity_invalidated` (the `assertNever` exhaustiveness check fires on either dimension). Imported by BOTH the page route AND every API consumer. **Does NOT import `validateGoogleSession`**. The structural allowlist in §10.1 enforces this split. **The 7-kind / 8-outcome union is the canonical contract**; the §6.1 ordered chain is the implementation algorithm — both descriptions must match. The §10.2 stale-credential matrix test pins all 8 outcomes × all 6 API consumers (kind=identity_invalidated tested with both reasons).
- `lib/auth/picker/resolveShowPageAccess.ts` (new, R41 Fix-3; R41-R3 pure-resolver; R41-R7: union enumerated; **R41-R12: unpublished-precedence corrected; R41-R13: identity_invalidated arm added; R41-R14: kind/outcome wording harmonized**). **Page-route-only auth chain helper.** Called exclusively by `app/show/[slug]/[shareToken]/page.tsx`. Encapsulates the resolver chain **in this exact order**: archived → admin precedence → **unpublished (R41-R10 step 3.5 — MUST come before any Google-session branch to prevent the bootstrap-loop class)** → Google-session-matching-crew-row → existing picker cookie. The helper is defense-in-depth alongside the page-route's own ordered chain; the page can also pre-check published before calling the helper, but the helper MUST also enforce the ordering internally. Imports `validateGoogleSession`. **The helper is PURE — it never encodes cookies and never calls `cookies().set()`.** Returns a discriminated union of **EXACTLY ELEVEN discriminant `kind` values** (R41-R14 canonical wording — twelve WIRE outcomes when `identity_invalidated.reason` is expanded; caller exhaustiveness checks fail if any kind OR reason is missing):

  1. `{ kind: 'archived' }` — show is archived; page renders 404.
  2. `{ kind: 'admin' }` — admin precedence; page renders admin mode.
  3. `{ kind: 'needs_picker_bootstrap', intentToken }` — Google session matches EXACTLY ONE crew row on this show + no cookie entry yet OR cookie mismatches per §4.1 branch (b'); page redirects to `/api/auth/picker-bootstrap?next=<URL>&t=<intentToken>`.
  4. `{ kind: 'ambiguous_email' }` — Google session matches MULTIPLE crew rows on this show (R41-R4 anti-loop arm); page does NOT redirect to bootstrap; renders gate (no `?gate=skip`) OR picker (with `?gate=skip`). Both ambiguous rows render as deactivated per the §7.2 R41-R6 expanded predicate.
  5. `{ kind: 'resolved', crewMemberId, source: 'cookie' | 'admin' }` — cookie-based identity OR admin; page renders `_ShowBody`.
  6. `{ kind: 'unpublished' }` — show is not yet published and viewer is non-admin; page renders 404.
  7. `{ kind: 'no_auth' }` — no admin, no Google, no cookie; page renders gate (no `?gate=skip`) or picker (with `?gate=skip`).
  8. `{ kind: 'epoch_stale', expectedEpoch, expectedCrewMemberId }` — cookie's `e` < shows.picker_epoch; page renders picker with epoch-stale banner + cleanupStaleEntry form.
  9. `{ kind: 'removed_from_roster', expectedEpoch, expectedCrewMemberId }` — cookie's crew_member_id no longer in roster; page renders picker with removed-from-roster banner.
  10. `{ kind: 'identity_invalidated', expectedEpoch, expectedCrewMemberId, reason: 'claimed_after_pick' | 'email_ambiguous' }` **(R41-R13)** — cookie's identity is now OAuth-claimed by a different user OR the underlying email became ambiguous; page renders picker with the appropriate banner (`PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` or `PICKER_IDENTITY_AMBIGUOUS_BANNER`) + cleanupStaleEntry form. Surfaced by §6.1 resolver chain steps 9 and 10.
  11. `{ kind: 'show_unavailable' }` — show became archived or unpublished after cookie was minted; page renders terminal failure or 404 depending on context.
  12. `{ kind: 'infra_error', code }` — DB read failed; page renders terminal-failure UI with the cataloged code.

  The R41-R2 `justMinted` arm and the cookie-encoder import are DELETED. **A static guard** asserts `resolveShowPageAccess.ts` does NOT import the picker cookie encoder NOR `cookies` from `next/headers`. **API consumers MUST NOT import this helper** — the no-jwt-surface meta-test asserts the only consumer is the show-page route handler. **Exhaustiveness check**: a TypeScript `assertNever(kind)` at the bottom of the page-route switch fails compilation if any kind is missed; inside the `identity_invalidated` arm, a nested `assertNever(reason)` fails on missing reason. `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts` exercises each of the **12 distinct outcomes** (11 kinds × 1 outcome each + identity_invalidated's 2 reasons = 12 total wire-distinct cases — R41-R14 wording sync) with fixture inputs and asserts the page-route handler produces the documented response (404 / redirect / render with banner / render `_ShowBody`).
- `lib/auth/picker/selectIdentity.ts` (new) — the Server Action.
- `lib/auth/picker/clearIdentity.ts` (new) — the Server Action.
- `lib/auth/picker/resetPickerEpoch.ts` (new) — admin-only Server Action.
- `components/admin/PerShowCrewSection.tsx` (existing, 173 lines) — **simplified**. Per-row Issue/Revoke controls and the "Revoke all links" button are removed. Two new section-level admin buttons are added: **"Reset picker selections"** (calls `resetPickerEpoch`; bumps `shows.picker_epoch`; every device re-prompts) AND **"Rotate share-token"** (calls `rotateShareToken`; per R40, atomically rotates the share_token AND bumps picker_epoch; old URL stops resolving; old cookies go stale; Doug re-shares the new URL). Preview-as-crew links per row are preserved.
- `lib/auth/picker/rotateShareToken.ts` (new) — admin-only Server Action; wraps the `rotate_show_share_token(uuid)` SECURITY DEFINER RPC. Same cookie-bound `createSupabaseServerClient()` + `requireAdmin()` pattern as `resetPickerEpoch`. Returns `{ ok: true, new_share_token: <string>, new_epoch: <int> }` — the admin UI displays the new URL `https://crew.fxav.show/show/<slug>/<new_share_token>` for Doug to copy + share.

### 4.9 Cookie-write boundaries (Next 16 constraint) — R16 simplification

**Server Components cannot mutate cookies.** Per Next 16, calling `cookies().set()` from a Server Component throws. Cookie writes are only legal from Server Actions, Route Handlers, or Middleware.

**R16 amendment — middleware refresh is REMOVED from this spec.** Earlier drafts (R3–R15) specified a middleware-based sliding-TTL refresh that bumped the cookie's `t` and re-emitted `Max-Age=7776000` on every authenticated request. R16 surfaced an unfixable lost-update race: middleware decodes the request's cookie (which may be stale by the time the response is written), bumps one entry, and re-emits the WHOLE envelope. If a Server Action (`selectIdentity`, `clearIdentity`, `cleanupStaleEntry`) commits a newer envelope BETWEEN the in-flight request's cookie capture and the middleware's Set-Cookie response, the middleware response overwrites the Server Action's newer state. Because the browser stores a single `__Host-fxav_picker` cookie and the LAST `Set-Cookie` wins, this is unfixable without inventing a server-side authoritative store the pivot model deliberately does not have.

**Single-mechanism contract (v1) — R41-R6 final mutator list:** the cookie is mutated **only** by FOUR legal surfaces: (a) three crew-side Server Actions — `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`; (b) ONE Route Handler — `app/api/auth/picker-bootstrap/route.ts`. Each surface reads the request's current cookie, mutates the envelope in memory, and writes a fresh Set-Cookie with `Max-Age=7776000`. **`/auth/callback/route.ts` is NOT a cookie mutator** (R41-R6 structural choice — callback is DB-stamp-only; cookies mint lazily on first show visit via picker-bootstrap). The §10.1 picker-cookie-contract meta-test asserts callback does NOT call `cookies().set('__Host-fxav_picker', ...)`. **Server Components CANNOT mutate cookies** — this is a Next App Router invariant; the page route MUST redirect to the Route Handler for any cookie mint that originates from a Server Component context. **`resetPickerEpoch` does NOT touch the cookie (R30 amendment)**. Middleware does NOT touch the cookie.

**R41-R6 — concurrency posture (revised honest accounting, replacing the R41-R4 'fill-in-the-blanks' marketing):** the cookie-based picker envelope has a FUNDAMENTAL read-modify-write race that no client-side cookie design can eliminate. Next.js `cookies().get()` reads from the request cookie header (fixed at request send time); `cookies().set()` writes to the response. Two concurrent handlers cannot observe each other's writes mid-request. Mitigation in v1 narrows the race surface to the minimum:

1. **`/auth/callback` does NOT write `__Host-fxav_picker`.** R41-R6 CRITICAL change. The callback STAMPS `claimed_via_oauth_at` via `claim_oauth_identity` (DB-only, lock-safe) and redirects to `next`. The cookie-mint happens lazily on the next show-page visit via picker-bootstrap. This removes the bulk-cookie-write surface from the OAuth callback — the surface the R41-R5 reviewer flagged as the highest-frequency race vector with selectIdentity.

2. **`/api/auth/picker-bootstrap` writes ONE SHOW's entry per invocation.** R41-R6 simplification. The handler reads the request cookie, modifies (or adds) the entry for the one `show_id` named in `next`, and writes the merged envelope. It does NOT write entries for other shows — even if `claim_oauth_identity`'s `shows` result set contains more. Other shows get their entries lazily when the user visits them.

3. **Residual race surface** (documented and accepted for v1): `picker-bootstrap` for Show-X concurrently with `selectIdentity` for Show-Y (different shows). Both reset the whole envelope. Whichever's response arrives last wins; the OTHER's write is lost. The user can recover by re-picking (selectIdentity) or re-visiting the show (picker-bootstrap re-runs). **Frequency**: requires the user to have two browser tabs open AND be performing identity mutations on both simultaneously. The user-behavior model (mobile-first crew flipping between Doug's link and one show at a time) makes this vanishingly rare.

4. **Same-show race** (picker-bootstrap for Show-X concurrently with selectIdentity for Show-X): the user is mid-OAuth-bootstrap on tab 1 and picking via the bypass picker on tab 2. Whichever response writes last wins. If selectIdentity wins, the user's explicit pick stands (cookie says crew_member A); the deactivation contract still works because `claimed_via_oauth_at` is stamped on the OAuth-matched crew_member B (different row). If picker-bootstrap wins, the OAuth-matched crew_member B is the picked identity; the user's explicit A pick is lost; they can re-pick from the picker on next visit (where A's row is selectable since it's not OAuth-claimed). Either outcome is correct relative to the contracts: cookie always reflects one user's chosen identity; OAuth-stamped rows are always deactivated in subsequent picker renders.

5. **No false advertising in concurrency tests.** The §10.2 concurrency tests use FIXED `Cookie:` request headers (modeling the browser snapshot at request send time) and assert the WIN/LOSS outcomes — the tests no longer claim fill-in-the-blanks "preserves" concurrent writes (it doesn't, on a per-show basis). The tests assert the LIMITED guarantee: callback writes NO cookies (so callback can't lose-update at all); picker-bootstrap writes ONE show's entry (so it can only lose-update that one show); cross-show interference is structurally impossible because picker-bootstrap never touches another show's entry.

**Per-show cookies considered and rejected for v1:** named `__Host-fxav_picker_<show_id>` would eliminate cross-show interference entirely. Rejected because (a) browser per-domain cookie cap (180 Chrome, 150 Firefox) is reachable at scale; (b) doesn't eliminate same-show race; (c) the narrowed surface in (1)–(4) is acceptable for v1. Tracked in BACKLOG for v2 if production telemetry surfaces the class.

**Same-origin / CSRF contract for picker Server Actions (R32/R33 amendment).** All three cookie-mutating Server Actions — `selectIdentity`, `clearIdentity`, `cleanupStaleEntry` — are unauthenticated state-changing endpoints (anyone with the show-link can invoke them, by design, to set their own picker selection). To prevent cross-site forged invocation, each action MUST validate that the request is same-origin. **Mechanism**: Next 16 Server Actions enforce same-origin by default — the framework compares the request's `Origin` header (or `Host` for non-CORS posts) against the canonical site origin and rejects mismatches BEFORE invoking the action body. **No `experimental.serverActions.allowedOrigins` config is added** (R33 amendment — an earlier draft incorrectly proposed adding `localhost:3000` to that list, which is an EXCEPTION list that BYPASSES the host-mismatch check; including dev origins in a production-shipped config would authorize forged posts from those origins). The pivot relies on the default same-origin enforcement that Next 16 already applies; the dev environment works because dev requests are themselves same-origin against `localhost:3000`. **Tests**: each cookie-mutator gets a negative-regression test that POSTs with an `Origin: https://attacker.example` header (simulated) and asserts (a) no Set-Cookie is emitted, (b) the response is Next.js's standard cross-origin rejection (typically 403), (c) the cookie's prior value is preserved. A production-config test asserts that `next.config.ts` does NOT contain `experimental.serverActions.allowedOrigins` keys for non-production origins.

**Consequence for sliding TTL.** The cookie's `Max-Age` advances only on Server Action invocation. A crew member who picks once and then only views the page (without ever tapping "Not you?" or re-selecting) will see the cookie expire 90 days after the last selection. The picker re-prompts; the user picks themselves again (cookie refreshes); they continue. This is acceptable per the owner determination: a re-prompt every 90 days is the longest gap an active crew member could experience, and the picker is cheap to traverse (single tap). The brainstorm note that "an active crew member never gets re-prompted" reads as a non-binding intent — Codex R16 demonstrated the structural impossibility of safe visit-based refresh, and the user's stated 90-day TTL still meets the "default remember-me window" intent.

**Mechanism — Server Actions for invalid-entry cleanup (compare-and-delete; R22/R25; R41-R15 expanded).** When the Server Component's resolver detects **any of `epoch_stale`, `removed_from_roster`, OR `identity_invalidated`** (any reason — R41-R15 added the two `identity_invalidated` reasons to the cleanup-trigger set), the picker renders normally AND a **tiny client component** `<StaleCleanupAutoSubmit>` (new — see §4.7) is mounted inside the picker render with `expectedEpoch` and `expectedCrewMemberId` props. The client component renders a `<form action={cleanupStaleEntry}>` with hidden inputs for `showId`, `expectedEpoch`, `expectedCrewMemberId`, and uses a `useEffect(() => formRef.current?.requestSubmit(), [])` to auto-submit on mount. The Server Action reads the CURRENT cookie envelope, looks up the entry for `showId`, and **only deletes the entry if `entry.e === expectedEpoch AND entry.id === expectedCrewMemberId`** — i.e., the entry that's still stale by the same observation that triggered the form render. If the current cookie's entry has different values (either the user re-selected via `selectIdentity` between picker render and form submit, or the epoch was bumped again to a new value), the action is a no-op. This compare-and-delete protocol prevents the race where a delayed auto-submit clobbers a fresh selection. The form is a progressive-enhancement nicety; the picker still works without JS (the user picks a name, the `selectIdentity` Server Action overwrites the stale entry naturally with `expectedCrewMemberId` and `expectedEpoch` checked at write time the same way).

**R25 amendment**: an earlier draft said the form auto-submits without specifying a client component, contradicting §7.6's "PickerInterstitial is a pure Server Component, no client JS." `<StaleCleanupAutoSubmit>` is the ONLY `'use client'` component in the picker tree; the picker interstitial proper stays server-only. The transition-audit task in §10.4 is updated to allow this single client component.

Alternative considered: redirect through a `/auth/picker/cleanup?next=...` route handler when stale-entry is detected. Rejected because (a) it adds a navigation hop visible in the URL bar, (b) progressive-enhancement Server Action cleanup is consistent across all stale states.

**`Max-Age` arithmetic.** `Max-Age=7776000` = 90 days × 86400 s/day. Set by every Server Action that writes the cookie. There is no separate absolute cap — Resolved Decision 5.

**`lib/cache/showSlugMap.ts` is REMOVED from this spec** (R16 simplification). The slug→id helper was needed only for middleware refresh on slug routes; with middleware refresh gone, no consumer needs the helper. Slug→id resolution where needed (e.g., `resolveShowFromSlug` in `app/show/[slug]/page.tsx`) uses the existing pattern at lines 119+.

### 4.8 OAuth-callback claim-stamp hook (R41 amendment)

When a user signs in via Google (Supabase Auth OAuth callback at `app/auth/callback/route.ts`), the callback handler MUST stamp `crew_members.claimed_via_oauth_at` for every row whose `email` matches the signed-in user's `auth.users.email`. This is the mechanism that enables the picker's "deactivate signed-in names" contract (Decision 15) — the picker query joins `claimed_via_oauth_at`, and a non-null value means "this identity is claimed via OAuth; the bypass picker cannot select it."

**Implementation contract:**

```ts
// In app/auth/callback/route.ts, AFTER supabase.auth.exchangeCodeForSession() succeeds:
// R41-R6 simplification: callback DOES NOT WRITE picker cookies. It stamps
// claimed_via_oauth_at in the DB; cookies are minted lazily on next show-page
// visit via /api/auth/picker-bootstrap. R41-R16 invariant-3: canonicalize the
// raw email AT THE CALL BOUNDARY (lib/email/canonicalize.ts is the only
// normalization helper per AGENTS.md invariant 3). The RPC body assumes its
// input is already canonical.
import { canonicalize } from '@/lib/email/canonicalize';

const { data: { user } } = await supabase.auth.getUser();
if (user?.email) {
  const canonicalEmail = canonicalize(user.email);
  const { data: result, error } = await serviceRole.rpc('claim_oauth_identity', { p_email: canonicalEmail });
  if (error) {
    // Infra fault — log and continue. Next show-page visit's picker-bootstrap
    // will retry claim_oauth_identity, so the stamp is eventually consistent.
    logger.error('claim_oauth_identity failed', { email: user.email, error });
  } else if ((result?.claimed_count ?? 0) > 0) {
    await emitAdminAlert('OAUTH_IDENTITY_CLAIMED', { user_email: user.email, claimed_count: result.claimed_count });
  }
  // NO cookies().set() here. The next show-page visit handles cookie minting.
}
```

**Why the RPC still returns the `shows` set:** picker-bootstrap reuses the same RPC and needs the `shows` field for its one-show cookie mint. The callback ignores `result.shows` — it only consumes `claimed_count` for the alert decision. This is intentional: the RPC has one consumer-of-record (picker-bootstrap) that uses both fields; the callback uses only the alert-deciding field.

**Lazy-mint flow trace** (callback → first show visit):
1. User signs in via Google. Callback fires `claim_oauth_identity`; stamps `claimed_via_oauth_at` on every matching crew row under per-show locks; redirects to `next` (e.g., `/me` or `/admin` or a show URL).
2. User lands on `/show/<slug>/<token>` (either via `next` or by tapping a `/me` link).
3. `resolveShowPageAccess` step 4: Google session + email matches exactly one crew row on this show + no picker cookie entry yet → returns `needs_picker_bootstrap` with the signed intent token.
4. Page route 302s to `/api/auth/picker-bootstrap?next=<URL>&t=<token>`.
5. Picker-bootstrap verifies token + session + RE-RUNS `claim_oauth_identity` (idempotent; preserves first-stamp date via `IS NULL` filter), then writes a cookie entry for THIS ONE show. 302s back to `next`.
6. The follow-up request reads the cookie + renders the show body.

This trace is one extra HTTP hop per show on first OAuth visit (acceptable per Doug's "low-friction" workflow).

**SQL helper** (in the same migration as the new column):

```sql
create or replace function public.claim_oauth_identity(p_email text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  -- R41-R16 invariant 3 fix: this RPC assumes p_email is ALREADY canonicalized
  -- by `lib/email/canonicalize.ts` at the caller boundary. We do NOT re-normalize
  -- here — AGENTS.md invariant 3 forbids inline email normalization outside the
  -- canonical helper. Callers (/auth/callback and /api/auth/picker-bootstrap)
  -- MUST call `canonicalize(auth.users.email)` before passing to this RPC.
  -- The DB-level CHECK constraint `crew_members_email_canonical` ensures stored
  -- rows already match the canonical form, so equality comparison is direct.
  v_email text := p_email;
  v_locked_show_ids uuid[];
  v_ambiguous_show_ids uuid[];
  v_claimed_count integer := 0;
  v_shows jsonb;
  r record;  -- R41-R10: loop variable for explicit ordered lock acquisition
begin
  -- R41-R3 fix: materialize the locked show ids into a PL/pgSQL array DURING
  -- the lock loop, then reuse that exact array as the filter for both the
  -- UPDATE and the returned shows-set query. NEVER re-query crew_members
  -- between lock acquisition and downstream filter — a concurrent INSERT
  -- under READ COMMITTED can appear in a subsequent SELECT but cannot
  -- appear in the materialized array, which is the integrity guarantee.
  --
  -- AGENTS.md invariant 2: per-show advisory lock acquired in deterministic
  -- drive_file_id order to prevent cross-transaction deadlock with other
  -- multi-show writers (e.g., a second claim_oauth_identity for a different
  -- email running concurrently).
  with show_set as (
    select distinct s.id as show_id, s.drive_file_id
      from public.crew_members cm
      join public.shows s on s.id = cm.show_id
     where cm.email = v_email
     order by s.drive_file_id
  )
  select array_agg(show_id) into v_locked_show_ids
    from show_set;

  if v_locked_show_ids is null or array_length(v_locked_show_ids, 1) is null then
    return jsonb_build_object('claimed_count', 0, 'shows', '[]'::jsonb);
  end if;

  -- Lock-acquisition pass (deterministic drive_file_id order).
  -- R41-R10 fix: use an explicit PL/pgSQL FOR loop so the lock-acquisition
  -- order is structurally guaranteed. The earlier draft used a set-based
  -- `PERFORM ... FROM ... ORDER BY` form, which does NOT guarantee
  -- per-row execution order (the planner may evaluate volatile lock calls
  -- in plan order, not ORDER BY order). Two overlapping multi-show
  -- claims could then acquire locks in different sequences and deadlock.
  -- The FOR ... IN SELECT ... ORDER BY ... LOOP form is the canonical
  -- PostgreSQL pattern for ordered side-effects.
  for r in
    select s.drive_file_id
      from public.shows s
     where s.id = any(v_locked_show_ids)
     order by s.drive_file_id
  loop
    perform pg_advisory_xact_lock(hashtext('show:' || r.drive_file_id));
  end loop;

  -- UPDATE restricted to the materialized locked set. A row INSERTed for
  -- this email on an UNLOCKED show after lock-acquisition cannot be
  -- stamped this round because its show_id is not in v_locked_show_ids.
  with updated as (
    update public.crew_members cm
       set claimed_via_oauth_at = now()
     where cm.email = v_email
       and cm.show_id = any(v_locked_show_ids)
       and cm.claimed_via_oauth_at is null
   returning cm.id, cm.show_id
  )
  select count(*) into v_claimed_count from updated;

  -- R41-R3 fix (ambiguous-email handling): GROUP BY show_id and HAVING
  -- COUNT(*) = 1. Shows with 2+ crew rows sharing this email are OMITTED
  -- from the returned set; one AMBIGUOUS_EMAIL_BINDING admin alert is
  -- emitted per ambiguous show. Caller (callback handler or picker-bootstrap
  -- handler) does NOT mint cookies for ambiguous shows — the user must
  -- pick via the picker interstitial on those shows (where the deactivated
  -- rows render as expected).
  -- R41-R4 SQL fix: aggregate AFTER identifying ambiguous groups. The earlier
  -- draft put GROUP BY + HAVING directly in the SELECT INTO statement, which
  -- returns one one-element array per ambiguous group (and SELECT INTO would
  -- bind only the first row in PL/pgSQL). The correct shape is a subquery
  -- that yields one row per ambiguous show, with an outer array_agg over
  -- those rows.
  select coalesce(array_agg(show_id), array[]::uuid[])
    into v_ambiguous_show_ids
    from (
      select cm.show_id
        from public.crew_members cm
       where cm.email = v_email
         and cm.show_id = any(v_locked_show_ids)
       group by cm.show_id
      having count(*) > 1
    ) ambiguous;

  if array_length(v_ambiguous_show_ids, 1) is not null then
    -- R41-R19 fix: use the existing upsert_admin_alert helper
    -- (supabase/migrations/20260505000000_upsert_admin_alert.sql) instead of
    -- a raw INSERT. The live admin_alerts schema is (show_id, code, context)
    -- with a unique index on (coalesce(show_id::text, ''), code) where
    -- resolved_at IS NULL — raw INSERT would violate the unique index on
    -- repeated ambiguous sign-ins. The helper handles the conflict via
    -- ON CONFLICT DO UPDATE SET occurrence_count = occurrence_count + 1.
    perform public.upsert_admin_alert(
      t.show_id,
      'AMBIGUOUS_EMAIL_BINDING',
      jsonb_build_object('email', v_email)
    )
    from unnest(v_ambiguous_show_ids) as t(show_id);
  end if;

  -- Build the shows result set: published + non-archived + UNIQUE email
  -- match for this show. Restricted to v_locked_show_ids; excludes ambiguous.
  select coalesce(jsonb_agg(jsonb_build_object(
           'show_id', sub.show_id,
           'crew_member_id', sub.crew_member_id,
           'picker_epoch', sub.picker_epoch
         )), '[]'::jsonb)
    into v_shows
    from (
      select s.id as show_id,
             min(cm.id) as crew_member_id,  -- safe — HAVING COUNT(*) = 1 below
             s.picker_epoch
        from public.crew_members cm
        join public.shows s on s.id = cm.show_id
       where cm.email = v_email
         and cm.show_id = any(v_locked_show_ids)
         and s.published = true
         and s.archived = false
       group by s.id, s.picker_epoch
      having count(*) = 1
    ) sub;

  return jsonb_build_object(
    'claimed_count', v_claimed_count,
    'shows', v_shows
  );
end;
$$;
revoke all on function public.claim_oauth_identity(text) from public;
grant execute on function public.claim_oauth_identity(text) to service_role;
```

**Lock acquisition order:** distinct `drive_file_id` sorted ascending. Combined with the project's other multi-show writers (`reset_picker_epoch_atomic`, `rotate_show_share_token`) which acquire a single show's lock, this prevents deadlock — a multi-show acquirer that touches the same set as a single-show acquirer cannot circular-wait if both order their acquisitions by `drive_file_id`. Single-show acquirers have no ordering to violate. The advisory-lock topology meta-test (`tests/auth/advisoryLockRpcDeadlock.test.ts`) is extended to pin `claim_oauth_identity` as a holder layer for every distinct `drive_file_id` it touches at exactly one layer (the RPC body), and to assert the JS-side Server Action call site has NO `lockedShowTx`/equivalent wrapper.

**Why filter `claimed_via_oauth_at IS NULL` (not COALESCE on UPDATE):** preserves the FIRST stamp date across multiple sign-ins (the row only updates if currently null). Useful for audit ("when did Alice first claim her identity?"). Also reduces lock acquisition: shows where every matching row is already claimed are skipped (no lock acquired, no UPDATE issued) — repeated callback invocations on already-claimed identities are zero-cost. The function returns the count of rows newly stamped so the caller can decide whether to emit `OAUTH_IDENTITY_CLAIMED` to `admin_alerts` (count > 0) or stay silent (count == 0, `OAUTH_CLAIM_NO_ROWS`).

**Why callers canonicalize at the boundary (R41-R17 invariant-3 enforcement):** the RPC compares emails by direct `=` against the canonical-stored column. Callers MUST call `canonicalize()` from `lib/email/canonicalize.ts` on raw `auth.users.email` BEFORE passing to this RPC. AGENTS.md invariant 3 forbids a second normalization boundary; the no-inline-email-normalization meta-test enforces this for the callback, picker-bootstrap, the SQL migration, and resolvePickerSelection. The stored crew_members.email column matches the canonical form via the `crew_members_email_canonical` CHECK constraint, so column-to-column comparisons inside the RPC body are also direct (no transformation needed on either side).

**Cross-show scope:** every `crew_members` row matching the email stamps. One sign-in claims identity globally across every show the email is on. Consistent with Decision 15's "permanent global claim."

**Race posture:** the per-show advisory lock serializes `claim_oauth_identity` against every other mutator of those shows (`reset_picker_epoch_atomic`, `rotate_show_share_token`, `select_identity_atomic`, the sync engine's roster INSERT/UPDATE/DELETE). A `select_identity_atomic` call competing for the same show's lock either runs before (selects, but the cookie is rejected on the next picker render because `claimed_via_oauth_at` is now non-null when the picker re-reads — see Fix-2 below where the SELECT path also re-checks) or after (the row is already claimed; the action rejects with the new `PICKER_IDENTITY_CLAIMED` code). Either way, no double-pick on a claimed identity.

### 4.10 Files deleted by the implementation plan

These are M9.5 / parent-spec §7.2 surfaces that have no role in the pivot. The plan deletes them in the same milestone:

- `app/api/auth/redeem-link/route.ts` (394 lines)
- `app/show/[slug]/p/page.tsx` and the entire `app/show/[slug]/p/` directory (fragment-bootstrap surface)
- `app/admin/show/[slug]/IssueLinkButton.tsx` (92 lines)
- `app/admin/show/[slug]/RevokeAllLinksButton.tsx` (196 lines)
- The leaked-link compromise-event handler in `middleware.ts` (the entire 228-line file's primary purpose — the file likely shrinks to a no-op middleware or is removed entirely; the implementation plan picks whichever is cleaner)
- `lib/auth/validateLinkSession.ts` (the JWT cookie-session validator)
- ~~`lib/auth/validateGoogleSession.ts`~~ **R41 amendment: PRESERVED with structural allowlist (single source of truth in §10.1).** Allowed importers (R41-R3 corrected): the module itself, `lib/auth/picker/resolveShowPageAccess.ts`, `app/auth/callback/route.ts`, `app/api/auth/picker-bootstrap/route.ts`, `app/me/page.tsx`, and the test directory. **Explicitly NOT allowed**: `lib/auth/picker/resolvePickerSelection.ts` (the cookie-only resolver shared with API routes — R41-R1 Fix-3), `app/api/report/route.ts` (the R14 deletion stays — see §6 routing table and the §10.2 regression test), `/auth/sign-out` (existing M11 code does not import it; an earlier R41 draft incorrectly listed it as a caller — corrected R41-R3). The R14/R15 deletion is reverted ONLY for the targeted allowlisted callers; the broader sweep stays out.
- `lib/auth/validateCrewAssetSession.ts` (the JWT-era asset-route auth helper; agenda + diagram + reel routes are switched to `resolvePickerSelection`)
- `lib/auth/jwt.ts` (signing/verifying helpers used only by the JWT path)
- `lib/auth/bootstrapCookie.ts` (the fragment-bootstrap one-shot cookie)
- ~~`app/me/page.tsx`~~ **R41 amendment: PRESERVED.** `/me` survives as the optional cross-show discovery surface for signed-in crew. Listing rewritten to render tokenized URLs via `my_share_tokens_for_email()` RPC (§5.3 R41).
- ~~`lib/data/listShowsForCrew.ts`~~ **R41 amendment: PRESERVED.** Rewritten to call `my_share_tokens_for_email()` server-side and emit `/show/<slug>/<share-token>` URLs.
- The `validateGoogleSession` import + call in `app/api/report/route.ts` (R14 deletion KEPT per R41 minimum-surface-area decision — the page route's step-4 auto-resolve mints a picker cookie for Google-signed-in crew, so `/api/report` only needs picker-cookie OR admin).
- The `crew_link` and `crew_google` arms of `ShowViewer` in `lib/auth/resolveShowViewer.ts:44-53` (the file may be retained as a thin admin-only resolver wrapper OR deleted entirely depending on whether callers consolidate around `isAdminSession` + `resolvePickerSelection`)
- `lib/sync/unpublishShow.ts` line 154 onward (the `link_sessions` cleanup; the rest of `unpublishShow` stays)
- `supabase/migrations/<new-migration>.sql` — DROP statements for `crew_member_auth`, `link_sessions`, `bootstrap_nonces`, `revoked_links`, and the SECURITY DEFINER RPCs that mutate them (`mint_link_session_if_active_kid_matches`, `revoke_leaked_link_atomic`, the Issue/Revoke RPCs in `20260520000000_signed_link_admin_rpcs.sql`).
- All `lib/messages/catalog.ts` entries scoped to the obsolete codes (`LEAKED_LINK_DETECTED`, `CSRF_DENIED`, `CSRF_NONCE_EXPIRED`, `CSRF_KEY_ROTATED`, `LINK_REVOKED_*`, the Issue/Revoke admin-alert codes).

**Total deletion budget: ~1,658 lines of source + the associated test suites.** This is favourable — the pivot lands as a net code reduction.

---

## 5. Data model changes

### 5.1 Tables added

| Column | Type | Notes |
| ------ | ---- | ----- |
| `crew_members.claimed_via_oauth_at` (R41 amendment) | `TIMESTAMPTZ NULL` | Stamped by the auth-callback claim-stamp hook (§4.8) whenever `auth.users.email` matches the row's `email`. Non-null = identity is claimed via OAuth; the bypass picker (§7) renders this row as visually disabled. The picker server-side SELECT joins this column on every render. NULL by default; backfill for existing rows is the natural NULL (they haven't signed in yet). Permanent claim contract per Decision 15. |
| `shows.picker_epoch` | `INT NOT NULL DEFAULT 1` | Monotonic integer. Bumped by `resetPickerEpoch` Server Action. Stored on the existing `shows` row (no new table). |
| `shows.picker_epoch_bumped_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Bumped to `now()` in the same UPDATE that bumps `picker_epoch`. Feeds the composite `viewer_version_token` so the Realtime broadcast fires on reset. |
| ~~`shows.share_token`~~ | **R35 amendment: NOT on `public.shows`** | The R34 design proposed storing the token directly on `shows`. R35 surfaced two problems: (a) `public.shows` has SELECT granted to anon/authenticated via the `can_read_show` RLS policy, so the bearer token would be readable via PostgREST; (b) base64 encoding produces `/` `+` `=` which break path-segment routing. The token moves to a **separate private table** with stricter grants and a URL-safe encoding (see next row). |
| `show_share_tokens.show_id` / `show_share_tokens.share_token` (new table) | `show_id uuid PRIMARY KEY references shows(id) on delete cascade`; `share_token TEXT NOT NULL UNIQUE CHECK (share_token ~ '^[0-9a-f]{64}$') DEFAULT encode(gen_random_bytes(32), 'hex')` | Hex encoding (256 bits → 64 chars, all `[0-9a-f]` — URL-safe by definition, no need for base64url translation). Generated server-side on `shows` insert via a trigger that inserts a paired row into `show_share_tokens`. **PostgREST lockdown**: `REVOKE ALL ON show_share_tokens FROM anon, authenticated`; only `service_role` has any access. The crew route handler reads the token via a SECURITY DEFINER RPC `public.resolve_show_by_slug_and_token(p_slug text, p_share_token text) returns uuid` that does the join internally and returns the show UUID on match, NULL on miss. Timing-safe equality is delegated to PostgreSQL's text equality operator (constant-time on equal-length strings, which the CHECK regex enforces). **Token rotation IS in scope (R39 amendment, refined R40)** — admin per-show panel includes a "Rotate share-token" button alongside Reset. The action calls SECURITY DEFINER RPC `rotate_show_share_token(p_show_id uuid)` which under the show's advisory lock: (a) UPDATEs `show_share_tokens.share_token` to a new hex value, (b) **also bumps `shows.picker_epoch` and `shows.picker_epoch_bumped_at`** so every device's previously-minted picker cookie goes stale on next resolve (R40 critical amendment — without the epoch bump, a leaked URL used once before rotation could mint a 90-day picker cookie that survives rotation; bumping the epoch invalidates all existing selections in one transaction), (c) calls `publish_show_invalidation` so open tabs see the broadcast and the picker re-prompts. Old token immediately stops resolving AND existing picker cookies for the show become stale. Doug re-shares the new URL. Required because the share-token IS in the URL path (logged by proxies/browser history per R39), so a rotation capability is necessary to recover from a leak. |

Both columns are added in a single migration. Backfill is trivial (default values match the post-pivot semantics: every existing show starts at epoch 1).

### 5.2 Tables dropped

| Table | Reason |
| ----- | ------ |
| `crew_member_auth` | Stored per-crew-member JWT versioning. JWTs retired. |
| `link_sessions` | Stored server-side session-token → identity mapping. Cookies no longer hold session tokens. |
| `bootstrap_nonces` | Stored one-time bootstrap nonces for the fragment-redemption path. Bootstrap is gone. |
| `revoked_links` | Stored surgical per-version revocation. No per-link revocation in v1. |

Drop order respects FKs (`link_sessions.show_id` references `shows.id`, etc., so `shows` survives). The migration includes `DROP TABLE IF EXISTS ... CASCADE` for each, plus `DROP FUNCTION IF EXISTS` for the SECURITY DEFINER RPCs that mutate them.

### 5.3 Functions modified / added

- `public.viewer_version_token(p_show_id uuid)` (per migration `20260501001000_internal_and_admin.sql:18-30`) is rewritten: the middle `crew_member_auth` term is replaced by the `picker_epoch_bumped_at` term. Function signature, return type, RLS grants, and SECURITY DEFINER posture all unchanged. R17-F2 amendment: also appends the monotonic `picker_epoch` counter so two rapid resets in the same millisecond produce distinct tokens.

- **NEW (R41; R41-R19 canonical-email pin): `public.my_share_tokens_for_email() returns table(slug text, share_token text)`** — SECURITY DEFINER function that reads **`public.auth_email_canonical()`** internally (the canonicalized form of the signed-in user's email — defined at `supabase/migrations/20260501002000_rls_policies.sql:11`; uses the same canonicalization as `crew_members.email` storage). Looks up every `crew_members` row whose `email = public.auth_email_canonical()` on a published+not-archived show, joins `show_share_tokens` for those shows, and returns the paired `(slug, share_token)` set. **R41-R19 critical**: the RPC MUST use `auth_email_canonical()`, NOT `auth.email()` directly. `auth.users.email` can return mixed-case strings (depending on the OAuth provider's normalization); comparing the raw value to canonical-stored `crew_members.email` would silently return an empty `/me` list for users whose Google account is mixed-case even when callback claiming (which canonicalizes via `lib/email/canonicalize.ts`) successfully stamps their rows. Callers cannot pass an email argument — the function uses only `auth_email_canonical()` — so a signed-in user can only enumerate THEIR OWN show tokens. `REVOKE ALL FROM public; GRANT EXECUTE TO authenticated`. Returns an empty set if the caller is unauthenticated or their canonical email matches no crew rows. This is the only path that exposes share-tokens to authenticated (non-service) callers. **Regression test**: `/me` with a Google account whose raw email is `Alice@Example.Com` (mixed case) finds the matching `crew_members` row stored with email `alice@example.com` (canonical form) and returns the tokenized URLs.

- **NEW (R41 / revised R41-R6 / R41-R15): `public.claim_oauth_identity(p_email text) returns jsonb`** — SECURITY DEFINER helper called from the auth-callback handler (§4.8) AND from the picker-bootstrap Route Handler (§4.7). `REVOKE ALL FROM public; GRANT EXECUTE TO service_role`. Acquires per-show advisory locks for every show the user has a `crew_members` row on (sorted by `drive_file_id`), stamps `claimed_via_oauth_at` on every NULL-stamped row in the locked set, returns `{ claimed_count: int, shows: [{ show_id, crew_member_id, picker_epoch }] }`. Idempotent (UPDATE filters `claimed_via_oauth_at IS NULL`; re-invocations preserve first-stamp date). **Caller responsibilities (R41-R6 + R41-R15 strict contract):** (a) `/auth/callback` consumes ONLY `claimed_count` for the OAUTH_IDENTITY_CLAIMED admin-alert decision; it MUST NOT iterate `result.shows` to mint cookies (callback is NOT a picker-cookie mutator per R41-R6). (b) `/api/auth/picker-bootstrap` uses `result.shows` ONLY to find the entry whose `show_id === target_show_id` (the show derived from the `next` URL); it MUST NOT loop over `result.shows` to mint multiple entries (the one-show-write contract per R41-R6 is the structural defense against cross-show lost-update). **Static guard**: the meta-test grep-asserts that no caller of `claim_oauth_identity` in `app/**` or `lib/**` performs a `for (... of result.shows)` or `result.shows.map(...).forEach(set-cookie)` pattern. The RPC's `shows` field is shaped for single-row lookup by target_show_id, not bulk iteration. The earlier R41-R2 wording that said "for the caller to mint picker cookies for all the user's shows in one envelope write" is OBSOLETE — R41-R6 removed that pattern.

### 5.4 Triggers modified

- The two triggers `crew_member_auth_publish_invalidation` and `crew_member_auth_publish_invalidation_insert` (per migration `20260501001000_internal_and_admin.sql:83-93`) drop with the table.
- **No new trigger on `public.shows`.** The existing helper `publish_show_invalidation_after_statement()` (at `20260501001000_internal_and_admin.sql:59-81`) iterates `select distinct show_id from new_rows`. That column name comes from the trigger's transition table, which for child tables (`crew_members`, `crew_member_auth`) carries an explicit `show_id` FK column. For `public.shows` itself, the transition table column is `id` (the show's own PK), NOT `show_id` — reusing the helper would emit a missing-column error and abort the Reset transaction.
- Instead, the **new SECURITY DEFINER RPC `public.reset_picker_epoch_atomic(p_show_id uuid)`** wraps lock acquisition + UPDATE + `PERFORM public.publish_show_invalidation(p_show_id)` into a single SQL function body. The Supabase JS Server Action calls it via `.rpc('reset_picker_epoch_atomic', { p_show_id: showId })`. Because everything happens inside one SQL function, `pg_notify` (inside `publish_show_invalidation`) is queued in the function's implicit transaction and fires atomically when the RPC's transaction commits. If COMMIT fails (lock contention, constraint violation), neither the UPDATE nor the notification take effect. This keeps the trigger surface unchanged AND avoids over-broadcasting on every `shows` UPDATE (which would cause every sync write to spam the `show:<id>:invalidation` channel even when nothing viewer-visible changed).

### 5.5 RLS

- `public.shows` already has admin-write / public-read RLS (per migration `20260501000000_initial_public_schema.sql`). The two new columns inherit the existing policy. No new RLS surface.
- **Per-action Supabase client matrix** (R20 correction — the blanket "all Server Actions use service-role" claim was wrong):
  - `selectIdentity` — service-role client (read-only `crew_members` + `shows.published/archived` lookups; no JWT-dependent SQL needed).
  - `clearIdentity` — no DB access at all; cookie mutation only.
  - `cleanupStaleEntry` — no DB access; cookie mutation only.
  - `resetPickerEpoch` — **cookie-bound `createSupabaseServerClient()`** (NOT service-role). The RPC `reset_picker_epoch_atomic` body calls `public.is_admin()` which reads from the request JWT; the cookie-bound client carries Doug/Eric's admin JWT so the SQL gate resolves correctly. See §5.6 R18 correction.
  RLS is not the access control mechanism for the new columns; the per-action `requireAdmin()` (reset) and roster-membership check (select) plus the in-DB `is_admin()` gate (reset RPC) are.

### 5.6 PostgREST DML lockdown + advisory-lock invariants (per AGENTS.md cross-cutting discipline)

`shows.picker_epoch` and `shows.picker_epoch_bumped_at` are written ONLY by the new SECURITY DEFINER RPC `public.reset_picker_epoch_atomic(uuid)`. No other code path mutates them.

**R10 correction**: an earlier draft of this paragraph claimed "PostgREST DML on `public.shows` is already REVOKEd from `authenticated`/`anon` (the existing admin-tables lockdown)." That claim was wrong — the live migration at `supabase/migrations/20260501002000_rls_policies.sql:227-239` grants `select, insert, update, delete` on `public.shows` to `anon, authenticated`, gated only by the `admin_update` RLS policy. An authenticated admin session could therefore call `supabase.from('shows').update({ picker_epoch: 99 }).eq('id', ...)` directly via PostgREST, bypassing the advisory lock, the publish helper, AND the RPC entry point.

**Required lockdown migration (new):** column-level REVOKE alone is NOT sufficient — Postgres's column-level REVOKE does NOT subtract from a previously-granted table-level UPDATE. The migration MUST revoke the table-level grant entirely:

```sql
revoke update, insert, delete on table public.shows from anon, authenticated;
-- service_role retains its existing grant_all_privileges line; no change.
-- The pre-existing RLS policies (admin_insert, admin_update, admin_delete)
-- remain in place as defense-in-depth but are now unreachable because
-- the underlying privilege is gone for anon/authenticated.
```

This is safe because **the app already mutates `public.shows` exclusively via SECURITY DEFINER RPCs and the service-role client**. A repo-wide grep for `from('shows').update(`, `from('shows').insert(`, `from('shows').delete(` returns ZERO results in `app/**`, `lib/**`, `components/**` (only `.select()` reads exist). The pivot's `reset_picker_epoch_atomic` adds another RPC; no new direct-DML caller is introduced. After this migration, the only paths that can write to `public.shows` are:

1. SECURITY DEFINER RPCs that the codebase calls via `.rpc(...)` — these execute as the function's owner (typically `postgres` / `service_role`), bypassing the revoked grant.
2. Server-side code paths that explicitly use the service-role client (`createSupabaseServiceRoleClient()` per `lib/supabase/server.ts`) — service-role retains the full grant.

Both categories already follow the AGENTS.md call-boundary discipline (typed infra-error handling, advisory-lock acquisition where required). The PostgREST surface stops being a write path for `shows` entirely.

**Structural meta-test (extends `tests/auth/_metaInfraContract.test.ts`).** Asserts:

1. The migration revokes table-level UPDATE / INSERT / DELETE on `public.shows` from `anon, authenticated`.
2. A live DB probe (run against the post-migration schema in CI): `select has_table_privilege('authenticated', 'public.shows', 'UPDATE')` returns `false`. Equivalent assertion for `INSERT` and `DELETE`. AND a column-specific live probe: `select has_column_privilege('authenticated', 'public.shows', 'picker_epoch', 'UPDATE')` returns `false` (defense against a future migration that re-grants table-level UPDATE without removing the picker columns).
3. **No NEW `from('shows').update(...)`, `.insert(...)`, `.delete(...)`, or `.upsert(...)` call appears anywhere in `app/**`, `lib/**`, `components/**` — no service-role exception for new code.** Post-pivot, every NEW `public.shows` mutation MUST go through a SECURITY DEFINER RPC invoked via `.rpc(...)`. The R10/R11 audit confirmed zero current Supabase-builder direct-DML callers on `shows`. **R23/R24 amendment**: the lockdown applies to NEW writes only — the existing raw SQL writers across `lib/sync/*` and the admin onboarding pipeline already mutate `public.shows` via service-role + raw SQL fragments under per-show advisory locks per the parent spec §5 sync contract. **Inventory is grep-derived, not hand-listed** — the meta-test runs a repo-wide pattern scan for every line matching `(\.from\(['"]shows['"]\)\s*\.\s*(update|insert|delete|upsert))|(update\s+public\.shows)|(insert\s+into\s+public\.shows)|(delete\s+from\s+public\.shows)` across `app/**`, `lib/**`, `components/**`, AND `supabase/migrations/<post-cutover>/**`. Every match is the writer set. For each writer, the meta-test asserts that the same source file (or a clearly-named caller of it) is referenced by an advisory-lock topology assertion in `tests/auth/advisoryLockRpcDeadlock.test.ts`. The known current writer footprint per a freshly-run grep includes (non-exhaustive — the test itself is the canonical list at any moment): `lib/sync/perFileProcessor.ts`, `lib/sync/runPushSyncForShow.ts`, `lib/sync/runScheduledCronSync.ts`, `lib/sync/applyStaged.ts`, `lib/sync/discardStaged.ts`, `lib/sync/promoteSnapshot.ts`, `lib/sync/assetRecovery.ts`, `lib/sync/unpublishShow.ts`, `app/api/admin/onboarding/finalize-cas/route.ts`, `lib/onboarding/sessionLifecycle.ts`, and the new `reset_picker_epoch_atomic` RPC. The R23 hand-listed inventory was incomplete; the R24 amendment switches to a grep-derived contract so the meta-test stays accurate as the codebase evolves. Future writes are rejected unless the writer's advisory-lock coverage is added to the topology test in the same commit that adds the writer; the meta-test fails CI on any uncovered match.
4. The static grep bans **WRITES** to `picker_epoch` and `picker_epoch_bumped_at` from app/lib/components. Allowed contexts: (a) inside `.rpc('reset_picker_epoch_atomic', ...)` call sites; (b) inside `.select('picker_epoch')`, `.select('picker_epoch_bumped_at')`, or `.select(...)` calls that name these columns for READ purposes (the resolver, `selectIdentity`, and the version endpoint all need to read `picker_epoch` to compare against cookie `e`); (c) inside type definitions / interfaces / generated DB types; (d) inside test fixtures and tests; (e) inside docs. **Banned contexts:** any `.update({...picker_epoch...})`, `.insert({...picker_epoch...})`, `.upsert({...picker_epoch...})` payload literal — i.e., the columns must never appear in the value-set of a write builder. The regex pattern targets the write-builder shape `\.(update|insert|upsert)\([^)]*picker_epoch` and similar. Catches the scenario where someone writes a future helper that touches these columns without proper advisory-lock coverage.
5. The only writer of `picker_epoch` and `picker_epoch_bumped_at` in `supabase/migrations/<post-cutover>/**` is `public.reset_picker_epoch_atomic`. Migrations that DROP these columns or the RPC are exempt (they're cleanup, not new writers).

**RPC caller/grant contract (R18 correction).** The RPC is GRANTed EXECUTE to `authenticated` AND `service_role` — REVOKEd from `anon, public`. The Server Action `resetPickerEpoch` uses the **cookie-bound server client** (`createSupabaseServerClient()` per `lib/supabase/server.ts`), NOT the service-role client. Reason: the RPC body calls `public.is_admin()` (per the §4.5 DDL), which reads from the request's Supabase Auth JWT. The service-role client doesn't carry a user JWT, so an RPC called with the service-role client would see `is_admin() = false` and raise — making the Reset button always fail for real admins. The cookie-bound client carries Doug/Eric's admin JWT, which `is_admin()` resolves correctly. This pattern matches the existing admin-RPC wrappers at `app/admin/show/[slug]/actions.ts`. The `requireAdmin()` JS-side gate is still required at the Server Action boundary as defense-in-depth (catches non-admin sessions before the RPC trip).

**R7 + R10 + R18 amendments combined**: the atomic transaction requirement (lock + UPDATE + publish_show_invalidation) requires a single SQL function (R7); the columns being written ALSO need table-level REVOKE because column-level REVOKE doesn't subtract from table-level grants (R10); the RPC caller MUST be the cookie-bound client (R18) so the in-DB admin gate sees the admin JWT.

**Advisory-lock acquisition (per AGENTS.md invariant 2 — non-negotiable).** Because the Reset path mutates `public.shows`, the per-show advisory lock MUST be acquired inside the same transaction as the UPDATE. The mechanics are in §4.5; the call-boundary contract here is: the structural meta-test at `tests/auth/_metaInfraContract.test.ts` is extended to register `resetPickerEpoch`, AND the advisory-lock topology meta-test at `tests/auth/advisoryLockRpcDeadlock.test.ts` is extended to assert (a) the SECURITY DEFINER RPC body `public.reset_picker_epoch_atomic` acquires the lock at exactly one layer, (b) NO JS-side wrapper around the RPC call acquires the same lock (no nested holder), (c) NO other DB function reacquires `hashtext('show:' || drive_file_id)` while the RPC body holds it, and (d) `public.reset_picker_epoch_atomic` is the only writer of `shows.picker_epoch` and `shows.picker_epoch_bumped_at` in the repo. The `selectIdentity`, `clearIdentity`, and `cleanupStaleEntry` Server Actions perform only READS against `shows`/`crew_members` and cookie writes against the client; they do not require the advisory lock.

---

## 6. URL + routing contract

| Route | Auth requirement | Behaviour |
| ----- | ---------------- | --------- |
| `/` | none | Marketing/landing. Unchanged. |
| `/auth/sign-in` | none | Google OAuth entrypoint. **R41 amendment: M11 behavior preserved.** `/me` stays in the allowed `next` allowlist. The already-signed-in short-circuit redirects admins to `/admin` and non-admins to `/me` (per M11). |
| `/auth/callback` | none (sets session) | OAuth code exchange. **R41 amendment: M11 behavior preserved AND the new claim-stamp hook (§4.8) runs after `exchangeCodeForSession()` succeeds — calls `claim_oauth_identity(user.email)` via the service-role client to stamp `crew_members.claimed_via_oauth_at` for every matching row.** Post-stamp, redirects to the validated `next` (admins → `/admin` if no explicit next; non-admins → `/me` if no explicit next). `/me` is back in the allowlist. |
| `/api/auth/google/start` | none | OAuth flow start. **R41 amendment: M11 behavior preserved.** `/me` is back in the `redirectTo` allowlist. |
| `/auth/clear-session` | none | Cookie-clear hop. **R41 amendment: M11 behavior preserved.** `/me` is back in the allowed-targets allowlist. |
| `/auth/sign-out` | POST, signed-in | Atomic clear of admin session. **Modified**: the `__Host-fxav_session` half (parent spec §7.2 line `2026-04-30-fxav-crew-pages-design.md:2295`) disappears; sign-out clears the Supabase Auth session cookies only. The `__Host-fxav_picker` cookie is NOT cleared on sign-out — sign-out is an admin concept; the picker cookie is a separate identity contract for the device. |
| `/me` | signed-in | **R41 amendment: PRESERVED.** Lists shows where signed-in user's email matches a `crew_members` row on a published+not-archived show. R41 difference vs M11: the listing now emits **tokenized URLs** `/show/<slug>/<share-token>` via the new SECURITY DEFINER RPC `my_share_tokens_for_email()` (per §5.3 R41). Crew never NEED to use `/me` — Doug's per-show links work without sign-in — but `/me` is the optional cross-show discovery surface for crew who do sign in. **R41-R19 canonical-email pin**: the RPC uses **`public.auth_email_canonical()`** internally (NOT raw `auth.email()`) so mixed-case Google accounts find their canonical-stored crew rows; a signed-in user can only enumerate THEIR OWN show tokens. |
| `/show/<slug>/<share-token>` | none (the share-token IS the implicit credential — R34) OR Google session matching a crew row | **Pivoted.** Both URL segments must match the same `shows` row (slug AND share_token). Mismatch → 404. Auth chain per §4.1: (1) admin precedence; (2) **R41 step-4: Google session matching `crew_members.email` for THIS show → mint picker cookie + render show body, skip the picker entirely**; (3) picker cookie → render show body; (4) else → render `<SignInOrSkipGate>` (first contact) OR `<PickerInterstitial>` (if URL carries `?gate=skip` OR resolver returned epoch_stale/removed_from_roster). The admin route `/admin/show/<slug>` is unchanged (admins authenticate via Google session). |
| `/show/<slug>/<share-token>?gate=skip` | none | **R41 amendment: same route as above with a declarative flag.** The `?gate=skip` flag means "user dismissed the SignInOrSkipGate by tapping Skip." Route handler reads the flag as permission to render `<PickerInterstitial>` instead of the gate when no auth resolved. The flag carries NO auth weight — auth chain still re-runs; a stale flag (bookmarked URL) never auto-authenticates. |
| `/show/<slug>/p` | — | **DELETED.** No fragment bootstrap. |
| `/show/<slug>/p#t=<jwt>` | — | **DELETED.** |
| `/api/auth/redeem-link` | — | **DELETED.** |
| `/api/realtime/subscriber-token` | picker cookie OR admin Google session | **Auth source modified.** Response shape `{ jwt, exp }`. Reads `__Host-fxav_picker` (via `resolvePickerSelection`) for crew; reads Supabase Auth session via `isAdminSession` for admin. The non-admin `validateGoogleSession` arm is removed (R41 minimum-surface-area — page-route step-4 mints picker cookie for Google-signed-in crew). Mints the Realtime JWT with claims `{ iss, sub: crewMemberId, show_id, role: "authenticated", viewer_kind: 'crew' \| 'admin', exp }`. **`role` stays the constant `"authenticated"`** (Supabase Realtime requirement; the RLS policy is created `to authenticated`). The `viewer_kind` value changes from pre-pivot `crew_link`/`crew_google` to post-pivot `crew`. |
| `/api/asset/diagram/<show-id>/<rev>/<assetKey>` | picker cookie OR admin | **Auth source modified** (same as subscriber-token). **`<show-id>` is the show UUID** matching the route param `[show]` in `app/api/asset/diagram/[show]/[rev]/[key]/route.ts`; the route handler queries `shows.id` directly with no slug resolution. The picker auth swap reads `resolvePickerSelection` with the in-URL UUID, no slug→id translation needed. Cache headers, revision-pinning, and 410 contract unchanged. |
| `/api/asset/reel/<show-id>` | picker cookie OR admin | **Auth source modified.** `<show-id>` is the show UUID per `app/api/asset/reel/[show]/route.ts`. Streaming, drift gate, buffer-then-verify all unchanged. |
| `/api/asset/agenda/<show-id>/<id>` | picker cookie OR admin | **Auth source modified.** `<show-id>` is the show UUID per `app/api/asset/agenda/[show]/[id]/route.ts`. Currently calls `isAdminSession` (line 215) then `validateCrewAssetSession` (line 240) per the M11 chain. Pivot replaces `validateCrewAssetSession` with `resolvePickerSelection`. Admin precedence path unchanged. Streaming + PDF contract unchanged. |
| `/api/show/<slug>/version` | picker cookie OR admin | **Auth source modified.** Currently calls `resolveShowViewer` (line 42). With `resolveShowViewer`'s `crew_link` and `crew_google` arms removed, this route swaps to a direct `isAdminSession` then `resolvePickerSelection` chain mirroring the page-route flow. Response body (`{ version_token }`) unchanged. The `ShowRealtimeBridge` cold-start version fence at `components/realtime/ShowRealtimeBridge.tsx` continues to work without bridge-side changes. |
| `/api/report` | picker cookie OR admin allowlist (`isAdminSession`) | **Auth source modified.** Currently imports `validateLinkSession` (line 5), `validateGoogleSession` (line 4), `requireAdminIdentity` (line 3). Pivot removes the `validateLinkSession` arm AND the `validateGoogleSession` arm (R41 minimum-surface-area: Google-signed-in crew get a picker cookie from the page route's step-4 auto-resolve before any API call); the route accepts EITHER a picker cookie with matching `show_id` in the body, OR an admin session via `isAdminSession`. Body, idempotency, lease_holder contract unchanged. |
| `/auth/sign-out` | POST, signed-in | **Modified.** Currently calls `deleteSession` from `lib/auth/validateLinkSession.ts` (line 9) to delete the `link_sessions` row. With `link_sessions` retired, the `deleteSession` call is removed entirely; sign-out clears only the Supabase Auth session cookies. The `__Host-fxav_picker` cookie is NOT cleared on sign-out per §6 ("sign-out is an admin concept; the picker cookie is a separate identity contract"). |
| `/admin`, `/admin/show/<slug>`, `/admin/show/<slug>/preview/<crewId>`, etc. | admin | **Unchanged**, except the per-show panel UI per §8. |

**`?t=` is no longer a JWT compromise event.** The leaked-link compromise-event handler is deleted along with the JWT model. If a stray legacy URL appears with a `?t=` query, Next.js's normal routing ignores the unknown query param.

**R39 amendment — the share-token is in the URL path, which IS logged.** Unlike the M9.5 fragment-JWT design (per parent spec `2026-04-30-fxav-crew-pages-design.md:1932` — fragments are never sent in HTTP requests), the pivot's `<share-token>` segment is part of the request path and therefore reaches: Vercel access logs, any upstream CDN logs, browser history, Referer headers on external-asset fetches (mitigated by `Referrer-Policy: no-referrer` on the page response per parent spec §7.2 line 1945), and any URL-bar screenshare. This is an intentional trade-off the owner accepted on 2026-05-23 (workflow simplicity over revocation discipline), but the spec MUST acknowledge the leak class explicitly:

- **Operational mitigation:** the pivot's plan adds a `Referrer-Policy: no-referrer` response header on `/show/<slug>/<share-token>` route renders (preserves the parent spec's existing posture). It does NOT attempt to redact the path from Vercel logs — Vercel does not currently offer path-fragment redaction as a feature, and rolling our own log-redaction proxy is out of scope.
- **Compromise response:** the Rotate share-token admin button (per §5.1 R39 amendment) is the recovery path. Doug bumps the token; the old URL stops resolving; Doug re-shares the new URL with the group thread. The Reset picker selections button is the paired recovery for "this device-set was compromised but the URL itself is fine."
- **Threat model boundary**: anyone with Vercel log access is already an FXAV operator (Doug + Eric); browser-history exposure is limited to the device's owner (already trusted). The remaining leak vector is screenshares of the URL bar to non-crew viewers — Doug accepts this risk per the owner determination.

**`/show/<slug>/<share-token>` is the canonical bookmark target.** Bookmarking after picker resolution preserves the cookie; bookmarking before resolution still bookmarks the same URL — opening the bookmark re-runs the resolver and shows the picker if needed. The slug-only URL `/show/<slug>` does NOT route to any crew surface in production code (the Next route file is at `app/show/[slug]/[shareToken]/page.tsx`; the file-system layout enforces that slug-only requests hit Next's 404).

### 6.1 Picker entry guards

`resolvePickerSelection` operates in this order. The return type is a discriminated union of **SEVEN discriminant `kind` values, eight WIRE outcomes** when `identity_invalidated.reason` is expanded (R41-R14 canonical wording; matches §4.7 contract; R41-R8 added `identity_invalidated` for post-claim and ambiguity-detected stale-credential outcomes); per AGENTS.md invariant 9 (Supabase call-boundary discipline), DB faults must be discriminable from auth/identity outcomes:

```ts
type ResolvePickerSelectionResult =
  | { kind: 'resolved'; crewMemberId: string }
  | { kind: 'no_selection' }
  | { kind: 'epoch_stale'; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: 'removed_from_roster'; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: 'identity_invalidated';
      expectedEpoch: number;
      expectedCrewMemberId: string;
      reason: 'claimed_after_pick' | 'email_ambiguous' }  // R41-R8 new arm
  | { kind: 'show_unavailable' }
  | { kind: 'infra_error'; code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
```

The `expectedEpoch` and `expectedCrewMemberId` fields on the two stale variants carry the EXACT entry values the resolver observed as stale. They are the only legitimate source for the `cleanupStaleEntry` form's hidden inputs — page renderers MUST NOT decode the cookie a second time to derive these values (that would split the observation across two reads with a potential race between them). The resolver provides them once; the page renders them verbatim into the auto-submit form; the action's compare-and-delete uses them to refuse stale-clobbering writes.

The `shows.archived` / `shows.published` gate is part of the resolver — every consumer (page, asset routes, realtime token, version, report) gets the same availability check without re-implementing it.

1. **No cookie at all** → `{ kind: 'no_selection' }`.
2. **Cookie present but decode failure** (parse error, wrong `v`, missing fields, wrong types, **invalid UUID format on any selection-map key or `id` value, or non-integer/negative `e` or `t`** — R26 amendment) → `{ kind: 'no_selection' }`. Decoder returns `null` per the strict-shape contract; resolver treats this as a fresh-device scenario, NOT as a tamper signal (the parent spec's strict-shape decoder discipline at `lib/auth/cookies.ts:34` is the precedent). **The decoder MUST validate UUID format on every map key and every entry's `id` value via a strict regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) BEFORE the entry reaches the DB query path.** Without this validation, a malformed-UUID cookie entry would pass the shape check, reach `SELECT ... FROM crew_members WHERE id = $1`, and trigger PostgreSQL error code `22P02` (invalid_text_representation), which would surface as `kind: 'infra_error'` and render a terminal-failure UI. Since `infra_error` does not clean the cookie (intentional — to avoid clobbering on transient outages), the user would be stuck in a repeating 500. UUID-format validation in the decoder folds this case into `no_selection`, the picker renders, and the next `selectIdentity` overwrites the invalid entry. Add tests for: (a) map key that's not a UUID; (b) entry `id` that's not a UUID; (c) entry `e` that's a string instead of an integer; (d) entry `e` that's negative; (e) entry `t` that's a float instead of a safe integer.
3. **Cookie decoded; no entry for this `show_id`** → `{ kind: 'no_selection' }`.
4. **DB read failure on `shows.{picker_epoch, archived, published}` lookup** (returned error OR thrown infra fault from `createSupabaseServiceRoleClient` / `.maybeSingle()`) → `{ kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' }`. NO cookie is touched on this branch; NO `epoch_stale`/`removed_from_roster`/`show_unavailable` is falsely emitted on a transient outage.
5. **Show is unavailable** (`archived = true` OR `published = false`) → `{ kind: 'show_unavailable' }`. Cookie's entry for this show is NOT cleared (a republished show should resolve to its previous selection without re-prompting). Consumers MUST treat this as a hard-deny: page route renders `notFound()`, API routes return 410 Gone (matching the parent spec's existing show-unavailable contract).
6. **Entry present; entry `e` ≠ `shows.picker_epoch`** → `{ kind: 'epoch_stale' }`.
7. **DB read failure on `crew_members` membership lookup** → `{ kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' }`. Same posture as 4.
8. **Entry present, epoch matches; row lookup returns 0 rows** → `{ kind: 'removed_from_roster' }`. The membership query is `SELECT id, show_id, claimed_via_oauth_at, email, (SELECT COUNT(*) FROM crew_members cm2 WHERE cm2.show_id = cm.show_id AND cm2.email = cm.email) AS same_show_email_count FROM crew_members cm WHERE cm.id = $1 AND cm.show_id = $2`. **R41-R16 invariant-3 fix**: direct `email = email` comparison — both sides already canonical via the `crew_members_email_canonical` CHECK constraint. No inline `lower(trim(...))`; the canonical helper at `lib/email/canonicalize.ts` is the only normalization boundary. If 0 rows → `removed_from_roster`.
9. **Entry present, epoch matches, row exists, BUT `claimed_via_oauth_at IS NOT NULL` AND `cookie.t < extract(epoch from claimed_via_oauth_at)::int`** (R41-R8) → `{ kind: 'identity_invalidated', reason: 'claimed_after_pick' }`. The cookie predates the OAuth identity claim — the user who picked this identity is NOT the user who later claimed it via OAuth. This is the structural defense against "anyone who picked Alice as bypass before Alice signed in continues acting as Alice." Comparison rule: cookie's `t` is unix-seconds; `claimed_via_oauth_at` is TIMESTAMPTZ; we compare cookie.t as int against `extract(epoch from claimed_via_oauth_at)::int`. If `cookie.t >= claim_epoch_seconds`, the cookie was minted AT or AFTER the claim — this can only happen via picker-bootstrap (because selectIdentity rejects already-claimed rows per R41 Fix-2). picker-bootstrap mints cookies only for the email-matching crew row, which IS the OAuth user's own identity — so accept those. The cookie's `t` is the load-bearing distinguishing field; if it ever drops below the claim timestamp, the cookie is from a pre-claim bypass pick and MUST be rejected.
10. **Entry present, epoch matches, row exists, NOT claimed-after-pick, BUT `same_show_email_count > 1`** (R41-R8) → `{ kind: 'identity_invalidated', reason: 'email_ambiguous' }`. The row's email is duplicated on this show — the picker should have deactivated this row at render time (R41-R6 expanded deactivation predicate), but a hand-crafted cookie OR a cookie minted before the duplicate was added bypasses the UI. Rejecting at the resolver level closes the gap.
11. **All checks pass** → `{ kind: 'resolved', crewMemberId }`.

Mapping of resolver `kind` outcomes to UI behaviour (referenced by `kind`, not case number, to avoid renumbering drift):

- `kind: 'no_selection'` (cases 1, 2, 3) — page renders the picker in **initial** mode (no banner). First-time-on-device UX.
- `kind: 'epoch_stale'` (case 6) — page renders the picker in **epoch-stale banner** mode: "Doug reset access for this show — pick yourself again."
- `kind: 'removed_from_roster'` (case 8) — page renders the picker in **removed-from-roster banner** mode.
- `kind: 'identity_invalidated'` with `reason: 'claimed_after_pick'` (case 9, R41-R8) — page renders the picker in **identity-claimed banner** mode: "This identity is now claimed by a signed-in user. Pick yourself from the current roster or sign in to use the same identity." The picker's roster will show the claimed crew_member as deactivated (per §7.2 R41-R6 expanded predicate); the user must pick a different row OR sign in. API consumers return **401** (same as `epoch_stale`/`removed_from_roster` — the cookie is no longer a valid credential). The cataloged copy code is `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER`. The `cleanupStaleEntry` Server Action's compare-and-delete contract covers this case (the entry's `expectedEpoch` + `expectedCrewMemberId` route into the same form).
- `kind: 'identity_invalidated'` with `reason: 'email_ambiguous'` (case 10, R41-R8) — page renders the picker in **identity-ambiguous banner** mode: "This name needs roster cleanup — ask Doug to remove the duplicate." API consumers return 401. The cataloged copy code is `PICKER_IDENTITY_AMBIGUOUS_BANNER`. Same `cleanupStaleEntry` flow as `claimed_after_pick`.
- `kind: 'show_unavailable'` (case 5) — page renders `notFound()`; API consumers return 410 Gone with `PICKER_SHOW_UNAVAILABLE`. The picker is NEVER rendered.
- `kind: 'infra_error'` (cases 4, 7) — page renders the cataloged terminal-failure UI; API consumers return 500 with `PICKER_RESOLVER_LOOKUP_FAILED`. Picker is NEVER rendered.
- `kind: 'resolved'` (case 11) — page renders `<_ShowBody />` with the resolved identity. API consumers proceed with the cached `crewMemberId`.

**Infra-error handling at each consumer (`kind: 'infra_error'`):**

- `app/show/[slug]/[shareToken]/page.tsx` — renders the existing cataloged terminal-failure UI (the same shape used for `ADMIN_SESSION_LOOKUP_FAILED` per the parent spec's `R21 F2` discipline at `app/show/[slug]/page.tsx:109-123`). No cookie cleanup. No partial render.
- `/api/realtime/subscriber-token` — returns `500` with the cataloged operator code. The `ShowRealtimeBridge` already treats subscriber-token failures via its bounded-backoff renewal path; no client behavior change.
- `/api/asset/diagram/...`, `/api/asset/reel/...`, `/api/asset/agenda/...` — return `500` with the cataloged operator code; the client renders the existing placeholder for the missing asset. No 403/410 false-positives that would cause incorrect revocation appearances.
- `/api/show/[slug]/version` — returns `500`; the bridge's catch-up logic preserves its last-known-good `data-render-version`.
- The Server Actions `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`, `resetPickerEpoch` are exempt from this contract because they each have their own DB-error handling — they do not call `resolvePickerSelection` directly.

**Stale-credential handling at each consumer (`kind: 'epoch_stale'` OR `kind: 'removed_from_roster'`):**

The picker cookie is the credential under the pivot model. A stale cookie (epoch behind the current `shows.picker_epoch`, OR a `crewMemberId` no longer in the roster) is an invalid credential and consumers MUST treat it as auth-denied. Per the parent spec's existing posture for unauthenticated crew API requests (asset/version/realtime routes return 401), the consumer mapping is:

- `app/show/[slug]/[shareToken]/page.tsx` — renders the picker interstitial in the appropriate banner mode (epoch-stale or removed-from-roster banner per §7.4). The cookie cleanup happens via the `cleanupStaleEntry` Server Action embedded in the picker render (§4.9 Mechanism B).
- `/api/realtime/subscriber-token` — returns `401 Unauthorized`. The existing `ShowRealtimeBridge` already treats 401 from this endpoint as a "force refresh" signal (`components/realtime/ShowRealtimeBridge.tsx` documented auth-denied path); on refresh, the page route's picker re-renders. No client-side change needed.
- `/api/show/[slug]/version` — returns `401 Unauthorized`. **This is the bridge's primary stale-detection path** — `ShowRealtimeBridge` treats 401 from the version endpoint as `forceRefresh` (per existing `components/realtime/ShowRealtimeBridge.tsx:280-310` posture). After `router.refresh()`, the page route's resolver sees the stale state and renders the picker. Without this 401, the bridge would treat the response as a transient failure and the open tab would never re-prompt.
- `/api/asset/{diagram,reel,agenda}/...` — returns `401 Unauthorized`. The crew page's image / PDF / video components show the existing placeholder on auth-denied asset responses. The next page navigation invokes the picker.
- `/api/report` — returns `401 Unauthorized`. The bug-reporter UI surfaces the existing cataloged auth-denied message via `messageFor()`. The next navigation re-prompts.

**Why 401 not 403/410:** 401 matches the parent spec's existing auth-denied semantics for the same routes (e.g., `validateLinkSession` returning `terminal_failure` mapped to 401). 403 would suggest "we know who you are but you're not allowed" — wrong, the resolver doesn't know who you are once the credential is stale. 410 is reserved for `show_unavailable` (the resource is gone). The three states are distinguishable on the wire: 401 → re-prompt; 410 → show is gone; 500 → infra fault.

**Show-unavailable handling at each consumer (`kind: 'show_unavailable'`):**

- `app/show/[slug]/[shareToken]/page.tsx` — calls `notFound()` (same as the existing M11 contract for unpublished shows; non-admin viewers cannot distinguish "unpublished slug" from "unknown slug"). The page's own explicit `!published OR archived` short-circuit (§4.1 step 3) STILL runs first and catches the no-cookie / no-picker-entry case; the resolver's `show_unavailable` arm covers the with-cookie case for completeness.
- `/api/realtime/subscriber-token`, `/api/asset/{diagram,reel,agenda}/...`, `/api/show/[slug]/version`, `/api/report` — return `410 Gone` with the cataloged crew-facing message `PICKER_SHOW_UNAVAILABLE`. 410 is correct (not 404) because the show DID exist and the cookie's selection was valid before archival; a transient 410 invites the caller to drop cached state. Asset routes already use 410 for the analogous unpublished/drift contract per parent spec §7.3, so this is consistent.
- The Server Actions `selectIdentity` and `cleanupStaleEntry` already validate availability inside their own bodies (§6.2 rejection codes); they do not need to consult `resolvePickerSelection`'s availability arm. `clearIdentity` and `resetPickerEpoch` are admin-only or cookie-only operations and don't gate on availability.

### 6.2 Server Action input validation

`selectIdentity({ slug, shareToken, crewMemberId })` (R37 — must include the share-token to re-validate before cookie mint):

- First, `resolve_show_by_slug_and_token(slug, shareToken)` — NULL return → reject with `PICKER_INVALID_SHARE_TOKEN`. NO cookie is emitted. Defense against a caller invoking the action directly with stolen show/crew UUIDs but no share-token.
- All remaining validations operate on the `show_id` returned by the resolve RPC:

- `showId` must be a UUID; otherwise reject with `PICKER_INVALID_INPUT`.
- `crewMemberId` must be a UUID; otherwise reject with `PICKER_INVALID_INPUT`.
- `select_identity_atomic(p_show_id uuid, p_crew_member_id uuid)` SECURITY DEFINER RPC under the per-show advisory lock performs ALL of: (a) `SELECT id, show_id, claimed_via_oauth_at, email FROM crew_members WHERE id = p_crew_member_id`: 0 rows → reject with `PICKER_CREW_MEMBER_NOT_FOUND`; show_id mismatch → reject with `PICKER_CREW_MEMBER_WRONG_SHOW`; **`claimed_via_oauth_at IS NOT NULL` → reject with `PICKER_IDENTITY_CLAIMED` (R41 Fix-2)**; **`(SELECT COUNT(*) FROM crew_members WHERE show_id = p_show_id AND email = (SELECT email FROM crew_members WHERE id = p_crew_member_id)) > 1` → reject with `PICKER_IDENTITY_AMBIGUOUS` (R41-R6 Fix-3; R41-R17 invariant-3)**; (b) on success, returns `{ ok: true, crew_member_id, picker_epoch, observed_at_seconds: extract(epoch from now())::bigint }`. **R41-R18 CRITICAL fix — the observed_at_seconds field is the DB-side transaction timestamp captured INSIDE the advisory lock. The Server Action MUST use this value as the cookie entry's `t` field**, NOT JavaScript's `Date.now() / 1000`. Without R41-R18: an attacker submits a bypass pick at T=10 (read inside lock: claimed_via_oauth_at IS NULL → passes); the lock releases; claim_oauth_identity acquires lock at T=15, stamps at T=15, releases; the Server Action's JavaScript writes the cookie with `t = JS-wall-clock-now` at T=20; `cookie.t (20) >= claim_epoch (15)` → resolver ACCEPTS the cookie as legitimate post-claim, breaking exclusivity. With R41-R18: select_identity_atomic returns `observed_at_seconds = 10` (the timestamp inside the lock when the IS NULL check passed); the Server Action stamps the cookie with `t = 10`; resolver sees `cookie.t (10) < claim_epoch (15)` → `identity_invalidated/claimed_after_pick` → cookie rejected. The DB-side timestamp is the load-bearing distinguisher because it's captured BEFORE the lock releases, so any subsequent claim_oauth_identity by definition stamps with a later timestamp. **Why both UI deactivation AND server check + locked-timestamp**: the picker's deactivated-row UI prevents legitimate users from accidentally selecting; the server check is the structural defense against form-tamper; the locked-timestamp defense closes the read-write timing window. All three layers are intentionally redundant.
- `SELECT published, archived, picker_epoch FROM shows WHERE id = $1`: not found or `archived=true` or `published=false` → reject with `PICKER_SHOW_UNAVAILABLE`.
- All rejection codes are added to `lib/messages/catalog.ts` with crew-facing copy that doesn't expose the structured code (per AGENTS.md invariant 5).

`clearIdentity({ slug, shareToken, showId })` (R39 amendment): `showId` must be a UUID; `slug` matches the slug-pattern (lowercase kebab); `shareToken` matches `^[0-9a-f]{64}$`. The action does NOT re-validate the share-token via the resolve RPC (it's not minting a credential, just clearing one) — but it MUST receive the slug+shareToken to call `revalidatePath('/show/' + slug + '/' + shareToken)` after clearing the cookie. Without them, the action cleared the cookie but couldn't revalidate the actual route, leaving the stale crew page rendered until manual refresh. The page-route resolver re-derives the page state on revalidation. Pure cookie mutation otherwise — no DB read.

`resetPickerEpoch({ showId })`: `requireAdmin()` first (matches admin-action pattern; `lib/auth/requireAdmin.ts`). `showId` must be a UUID; show must exist. Returns `{ ok: true, new_epoch: <int> }` for the admin UI to display, where `new_epoch` is the value returned by the SECURITY DEFINER RPC `reset_picker_epoch_atomic` — sourced from `RETURNING picker_epoch` inside the locked transaction. **The Server Action MUST use the RPC return value verbatim; it MUST NOT do a separate `SELECT picker_epoch FROM shows WHERE id = ...` after the RPC**, because a post-RPC read happens outside the advisory lock and could observe a later epoch under a concurrent reset (causing the `PICKER_EPOCH_RESET` admin-alert payload to misreport the epoch this action committed).

---

## 7. Picker UX

### 7.1 Section inventory (interstitial page)

When `/show/<slug>` resolves to the picker, the rendered viewport contains:

1. **Top brand strip** — FXAV mark (orange wordmark), centered, 14px font-size, `font-weight: 700`. 16px vertical padding above and below.
2. **Show identifier strip** — `<show.title>` on line 1 (16px, `font-weight: 700`); `<show.dates>` + venue short-form on line 2 (10px, `color: var(--muted-foreground)`). Centered. 8px from the brand strip; 24px from the picker block below.
3. **Picker block** — left/right padded 16px on a 390px viewport.
   - **Question heading** `Who are you?` (20px, `font-weight: 700`, `color: var(--foreground)`).
   - **Sub-instruction** `Tap your name to open the show page.` (12px, `color: var(--muted-foreground)`). 4px below the heading.
   - **Optional banner row** (R41-R17 expanded — present when resolver returns ANY of `epoch_stale`, `removed_from_roster`, OR `identity_invalidated` (either reason) from §6.1) — one-line copy in a 12px medium-weight inline note, FXAV-orange-tinted background (`bg-orange-100` / `bg-orange-900/30` in dark mode). 8px above the list. Banner copy selected per the §7.4 mode table: epoch-stale, removed-from-roster, identity-claimed-after-pick, or identity-ambiguous.
   - **Roster list** — flat alphabetical by `crew_members.name`. Each row is a `<form>` element with a single `<button type="submit">` filling the row.
4. **Footer** — single line of copy, 10px, `color: var(--muted-foreground)`: `Shared by Doug Larson · FXAV`. 24px below the list.

### 7.1a SignInOrSkipGate (R41 — the new first-contact surface)

When the route resolves to "no auth established and no `?gate=skip` flag," the page renders `<SignInOrSkipGate>` instead of the picker. Layout (Server Component):

1. **Top brand strip** — identical to picker (FXAV mark).
2. **Show identifier strip** — identical to picker (title + dates + venue).
3. **Heading**: `Welcome` (24px, `font-weight: 700`).
4. **Subhead**: `Sign in to lock your identity across all your FXAV shows — or skip and pick your name on this show.` (12px, muted-foreground; max-width 360px; centered).
5. **Primary CTA (large button, FXAV orange)**: `Skip and pick your name` — server-driven `<form action={...}>` POST that navigates the browser to `/show/<slug>/<share-token>?gate=skip`. The `?gate=skip` flag is read by the route handler (per §4.1 step 8) and renders the picker instead of the gate. The flag has no auth weight — it's purely a "user dismissed the gate" signal; routing through the same tokenized URL preserves the bookmark.
6. **Secondary CTA (text link, smaller)**: `Sign in with Google` — initiates Supabase Auth OAuth flow with `?next=<tokenized URL>` so the callback returns to this show post-sign-in. Sign-in mints the picker cookie via the route's R41 step-4 auto-resolution path (per §4.1) and renders the show body directly.
7. **Footer line (10px, muted)**: `Crew don't have to sign in — skip works for everyone.` Defuses any "is this required?" anxiety.

**Why primary is "Skip" and secondary is "Sign in":** the default audience is crew who tap Doug's link wanting to see their call time. Skip-as-primary is one-tap, label-clear, no decision pressure. Sign-in is the opt-in upgrade for crew who want identity exclusivity + cross-show discovery via `/me`. R41 intent is "login is optional, never a wall."

**`?gate=skip` flag semantics:**
- Set by tapping "Skip" — purely declarative, the user dismissed the gate.
- Has no auth weight. The route handler reading the flag still re-evaluates the auth chain on every request; a stale flag in the URL bar (e.g., bookmarked) re-renders the picker, never auto-authenticates.
- Persists in the URL for the picker render and bookmark; cleared by the next navigation (selectIdentity revalidates to `/show/<slug>/<share-token>` without the flag).
- If a user with `?gate=skip` ALREADY has a valid picker cookie or admin/Google session, the route's auth chain (steps 1–4) resolves first and renders the show body — `?gate=skip` is moot.

### 7.2 Roster row internals

Each row is a 44px minimum-height target (per parent spec `PRODUCT.md:59` WCAG 2.5.5 floor). The `<button>` element is the entire row; `<button>`'s computed `display` is `flex` with `justify-content: space-between` and `align-items: center`. 12px horizontal padding inside the button; 11px vertical to reach 44px total. Between rows: 5px vertical gap. Border: 1px solid `var(--border)`. Border-radius: 9px. Default background: `var(--card)`. Hover/focus background: `var(--accent)` (no orange — orange is reserved for the LEAD chip).

Inside the row:

- **Left content (flex: 1)**: `<span>` with `crew_members.name` (12px, `font-weight: 600`, no truncation — names should fit; if a name overflows on a 390px viewport, the row wraps to 2 lines and the row's min-height grows naturally).
- **Right content (flex: 0)**: a role chip. Chip text is `crew_members.role` (the human-readable string, e.g., "A1", "LEAD"). Chip styling:
  - Default chip: 8px font-size, `font-weight: 600`, `color: var(--muted-foreground)`, `background: var(--muted)`, padding: 2px 7px, border-radius: 999px.
  - LEAD chip (any row where `role_flags` array contains `'LEAD'`, OR where `role === 'LEAD'`): same dimensions, `color: var(--accent-foreground)`, `background: var(--accent)` (FXAV orange `#F79338` / `oklch(...)` per `DESIGN.md`).

**Deactivated-row contract (R41 amendment; R41-R6 expanded predicate).** A row renders as **deactivated** when EITHER predicate holds:

1. **OAuth-claimed:** the underlying `crew_members.claimed_via_oauth_at` is non-null.
2. **Ambiguous-email (R41-R6):** this row's `email` appears on MORE THAN ONE `crew_members` row for THIS show (i.e., a duplicate email in Doug's roster for this show). This deactivation fires REGARDLESS of `claimed_via_oauth_at` state — a NULL-stamped ambiguous row is also deactivated. Without this, a Google-signed-in user whose email matches multiple rows on a show could land in a state where `claim_oauth_identity` failed (infra fault or legacy pre-R41 session) AND the picker still shows the ambiguous rows as selectable. The expanded predicate closes that gap.

**Visual treatment is identical across both cases** (row background `var(--muted)` instead of `var(--card)`; name + chip text `color: var(--muted-foreground)`; lock icon 16px `color: var(--muted-foreground)` to the LEFT of the role chip), **but behavior diverges by reason (R41-R18 corrected)**:

1. **OAuth-claimed only** (`claimed_via_oauth_at IS NOT NULL` AND row is unique by email on this show): lock icon `aria-label="Sign in to use this identity"`. The `<button>` is tappable; form `action` is `/auth/sign-in?next=<tokenized URL>`. Tap completes the user's intent via OAuth flow. `data-claimed="true"`.
2. **Ambiguous-email** (`same_show_email_count > 1`, regardless of claimed status — R41-R6 expanded predicate): lock icon `aria-label="Roster cleanup needed — ask Doug to remove the duplicate"`. The `<button>` is rendered but its form `action` is a no-op (e.g., `action="javascript:void(0)"` or omitted entirely so the form has no submission target; the tap is a visual click with no effect). Tap does NOT redirect to OAuth — `claim_oauth_identity` cannot resolve ambiguity (omits ambiguous shows from `result.shows` per R41-R3 SQL), so redirecting would loop the user back to the same picker. `data-ambiguous="true"` (and additionally `data-claimed="true"` if the row IS also OAuth-claimed). User recovery requires Doug to deduplicate the roster (admin scope; out-of-pivot for v1).

**Picker render query (R41-R6)** must surface BOTH signals. The data fetcher joins:
- `crew_members.claimed_via_oauth_at` (per-row, direct column read).
- A `same_show_email_count` derived field — `COUNT(*) OVER (PARTITION BY show_id, email)` (R41-R17 invariant-3: direct column partition; the stored `email` column is already canonical via the `crew_members_email_canonical` CHECK constraint) — counting how many crew rows on this show share this row's email. A value > 1 means ambiguous.

A row renders as deactivated when `claimed_via_oauth_at IS NOT NULL OR same_show_email_count > 1`.

### 7.3 Guard conditions (per AGENTS.md spec self-review additions)

For each prop / data input to the picker, what renders:

| Input | When `null`/empty/zero/NaN | Behaviour |
| ----- | -------------------------- | --------- |
| `show.title` | empty string | Render the show identifier strip with only the dates line; title line is omitted. Title is a `NOT NULL` column per `20260501000000_initial_public_schema.sql:7` so this should not occur — defensive only. |
| `show.dates` (JSONB) | `null` or `[]` | Date line is omitted; title line stands alone. Spec §6.7 of parent allows JSONB to be null on pre-parse states. |
| `roster` (crew_members rows) | empty array | Picker renders heading + sub-instruction + a centered empty-state in place of the list: "Doug hasn't added crew yet — check back soon." (12px, `color: var(--muted-foreground)`, 64px vertical padding). |
| `roster` (size 1) | one row | List renders one row; same layout; no special "only one option" treatment. |
| `roster` (size > 50) | large list | Roster list scrolls within the viewport's main scrolling container; no virtualization for v1 (50+ crew is rare and the DOM cost is acceptable; if it ever exceeds ~100, address in a follow-up). |
| `crew_members.role` | empty string | Role chip omitted (no chip space reserved). Row is name-only. |
| `crew_members.name` | empty string | This should not occur (`NOT NULL` per `20260501000000_initial_public_schema.sql:34`). Defensive: render the row with a placeholder `(Unnamed)` in italics, suppressed from the alphabetical sort by being placed last. |
| `bannerMessage` (kind: 'epoch_stale' / 'removed_from_roster') | `null` | Banner row omitted; picker spacing flows as if it weren't there. |

### 7.4 Mode boundaries

The picker has exactly **five** render modes (R41-R17 expanded — added two `identity_invalidated` modes to match the §6.1 resolver):

| Mode | When | Visual delta |
| ---- | ---- | ------------ |
| **Initial** | `kind: 'no_selection'` (resolver cases 1, 2, 3) | No banner row. Standard heading + sub-instruction. |
| **Epoch-stale banner** | `kind: 'epoch_stale'` (resolver case 6) | Banner row present, copy: "Doug reset access for this show — pick yourself again." (`PICKER_EPOCH_STALE_BANNER`) |
| **Removed-from-roster banner** | `kind: 'removed_from_roster'` (resolver case 8) | Banner row present, copy: "Your previous selection was removed by Doug — pick yourself from the current roster." (`PICKER_REMOVED_FROM_ROSTER_BANNER`) |
| **Identity-claimed-after-pick banner (R41-R17)** | `kind: 'identity_invalidated', reason: 'claimed_after_pick'` (resolver case 9) | Banner row present, copy: "This identity is now claimed by a signed-in user. Pick yourself from the current roster or sign in to use the same identity." (`PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER`). The previously-picked crew row renders as deactivated (R41-R6 expanded predicate); user must pick a different row OR sign in. |
| **Identity-ambiguous banner (R41-R17)** | `kind: 'identity_invalidated', reason: 'email_ambiguous'` (resolver case 10) | Banner row present, copy: "This name needs roster cleanup — ask Doug to remove the duplicate." (`PICKER_IDENTITY_AMBIGUOUS_BANNER`). Both ambiguous rows render as deactivated; user cannot recover without admin roster cleanup (out-of-pivot-scope). |

The brand strip, show identifier strip, picker block (heading, sub-instruction, list), and footer are **identical across all five modes**. Only the banner row varies. All four banner modes (epoch-stale, removed-from-roster, identity-claimed-after-pick, identity-ambiguous) also mount `<StaleCleanupAutoSubmit>` per §4.9 R41-R15 trigger-set expansion.

### 7.5 Cap / truncation behaviour

- **Roster cap**: no software cap. The `<unique (show_id, name)>` constraint at `20260501000000_initial_public_schema.sql:43` is the only natural limit (no duplicate names per show). At >50 entries the page scrolls naturally; the spec does not introduce virtualization. If Doug's shows ever exceed 100 crew, follow-up work adds search + virtualization.
- **Cookie cap (per Resolved Decision 6)**: byte-budget at 3800 bytes encoded. On every `selectIdentity` write, the encoder evicts the entry with the lowest `t` (last-touch unix-seconds) until the encoded value fits the budget. **Cookie wire shape with timestamps**:
  ```json
  {
    "v": 1,
    "selections": {
      "<uuid>": { "id": "<uuid>", "e": 1, "t": 1779514142 }
    }
  }
  ```
  `t` is a unix-second epoch of last touch. **`t` is updated ONLY by the FOUR cookie-mutator surfaces (R41-R20 corrected)**: the three crew-side Server Actions (`selectIdentity`, `clearIdentity`, `cleanupStaleEntry`) AND the `/api/auth/picker-bootstrap` Route Handler. `selectIdentity` stamps `t` from `select_identity_atomic.observed_at_seconds` (DB-side, inside the per-show advisory lock per R41-R18). `picker-bootstrap` stamps `t` from `extract(epoch from now())::bigint` at write time (no race possible — the row is already claimed and the bootstrap RPC holds the lock). The other two Server Actions update `t` to current unix-seconds. Reads never emit `Set-Cookie` per the R16 contract; `resetPickerEpoch` never touches the cookie per the R30 contract; `/auth/callback` never touches the cookie per R41-R6 (callback is DB-stamp-only). On write of an entry that pushes the encoded cookie past the byte-budget cap, the minimum-`t` entry is evicted first.
- **Name truncation**: none. Long names wrap; the row height grows.

### 7.6 Rendered vs conceptual

Every UI element listed in §7.1 is a **rendered React element with explicit Tailwind classes** and a stable `data-testid`. The picker is a Server Component (no `'use client'`); no client-side state. The `<form action={serverAction}>` submission is the entire interaction.

`data-testid` inventory:
- `picker-interstitial-root` — the outer wrapper
- `picker-brand-strip`, `picker-show-strip`, `picker-question-heading`, `picker-sub-instruction`
- `picker-banner` (present only in epoch-stale / removed modes)
- `picker-roster-list` — the `<ul>` or `<ol>` wrapping the rows
- `picker-roster-row` — every row gets this testid plus `data-crew-member-id="<uuid>"`
- `picker-roster-empty` — present only when the roster is empty
- `picker-footer`

### 7.7 Dimensional invariants

The interstitial route uses a single full-viewport flex column. The picker is centered-vertically on a tall viewport (justify-content: center on the outer flex container, max-height: 100vh, overflow-y: auto so a tall roster still scrolls).

- **Outer wrapper (`picker-interstitial-root`)**: `min-height: 100vh`, `display: flex`, `flex-direction: column`, `align-items: center`, `justify-content: flex-start` on viewports < 568px (mobile-primary), `justify-content: center` on viewports ≥ 568px (desktop). The breakpoint is set on `DESIGN.md`'s `--breakpoint-md` token.
- **Picker block max-width**: 360px on mobile (16px padding × 2 = 32px gutter at 390px viewport), 480px on tablet+.
- **Roster row min-height**: explicit `44px` via Tailwind `min-h-11` (44/4 = 11) — meets WCAG 2.5.5. Verified by Playwright assertion (per AGENTS.md writing-plans addition).
- **Role chip vertical centering**: chip and name share the row's `align-items: center`. Chip's intrinsic height (~16px) is less than the row's 44px, so the row's `align-items` is what guarantees centering — not chip-internal padding.
- **Banner row's effect on list start position**: banner is conditional. When present, list starts 8px below the banner. When absent, list starts 12px below the sub-instruction. **Mode boundaries explicit**: the dimensions in this section apply to all three modes from §7.4 except for this one variable.

**Tailwind v4 caveat (per AGENTS.md global feedback memory `feedback_tailwind_v4_flex_items_stretch`)**: this project's Tailwind v4 does not default `.flex` to `align-items: stretch`. Every relationship above is stated with the explicit class. The plan adds a real-browser Playwright assertion that calls `getBoundingClientRect()` on every `data-testid` row to confirm `child.height === parent.height` within 0.5px tolerance (parent = the row; child = the name span and chip wrapper).

### 7.8 Transition inventory

The picker has very few transitions because it's a Server Component (no client state) and the dominant "transitions" are page navigations. The full enumeration:

| From → To | Trigger | Treatment |
| --------- | ------- | --------- |
| Picker (initial) → Crew page (`_ShowBody`) | User taps a name; Server Action returns; route revalidates | **Instant — no client animation.** The new render arrives via Next 16 App Router's natural revalidation. No `AnimatePresence`, no exit animation. The user perceives this as a normal page navigation (~150-300ms typical). |
| Picker (initial) → Picker (epoch-stale banner mode) | Server Action `resetPickerEpoch` runs in a different session; this device's next visit | **Instant.** The user wasn't on the picker — they were on the crew page. They navigate away, navigate back, the cookie's `e` is now stale, the picker renders WITH the banner. No animation. |
| Picker (initial) → Picker (removed-from-roster mode) | Doug removed the crew member between visits | **Instant.** Same shape as the row above — the picker just re-renders with the banner. |
| Crew page → Picker | "Not you?" tap; `clearIdentity` runs | **Instant.** The route revalidates; the same URL renders the picker. No animation. |
| Picker (any mode) → 404 | Show was archived between visits | **Instant.** The route's `resolveShowFromSlug` returns `not_found`; `notFound()` throws; Next renders the 404 page. |

**Compound transitions** (per AGENTS.md mandate to enumerate compound cases):

- **Selection mid-flight while admin bumps the epoch.** Crew member taps "Alice Lee" at T0; Server Action validates roster membership at T1; admin clicks Reset Picker Epoch at T1.5 in another session; UPDATE on `shows.picker_epoch` commits at T2; cookie write at T3 carries an `e` value that is ALREADY stale. Next request reads the cookie, sees `e=1` against `picker_epoch=2`, renders the picker with the epoch-stale banner. **This is acceptable.** The race is intentionally lossy on the picker side — the admin's intent ("force re-prompt") wins; the crew member taps a name again. No data corruption. No partial state.

- **"Not you?" tapped while a `<form action={selectIdentity}>` submit was in-flight from a different tab on the same device.** Server-side ordering wins. Whichever Server Action commits last is the cookie's final state. If `clearIdentity` commits last, the next page load shows the picker. If `selectIdentity` commits last, the picked identity wins. Both outcomes are "the user got what they last asked for, which is what they want."

- **Sync deletes the picked crew member while their tab is open.** The open tab keeps rendering with the cached identity until the user navigates or the Realtime broadcast fires (the `crew_members.last_changed_at` term in `viewer_version_token` advances). On `router.refresh()`, the resolver runs `removed_from_roster` path and the picker re-prompts.

---

## 8. Admin surface changes

### 8.1 `/admin/show/<slug>` — per-show panel

The per-show panel today (per `components/admin/PerShowCrewSection.tsx`, 173 lines, plus `app/admin/show/[slug]/IssueLinkButton.tsx` and `RevokeAllLinksButton.tsx`) renders a per-crew-member table with these affordances per row:

- Crew name + role chip
- "Preview as <name>" link (to `/admin/show/<slug>/preview/<crewId>`)
- "Issue new link" button (mints a fresh JWT by advancing `current_token_version`/`max_issued_version` via `issueNewLinkAction`; renders cataloged status text only — does NOT display a copy-link affordance per the R17 forbidden-prose contract; the missing affordance was tracked as `BL-COPY-SHARE-LINK` in the backlog, which the pivot implicitly retires)
- "Revoke all links" button (advances `revoked_below_version`)
- Status text: live link / no live link / leaked link auto-revoked / etc.

Plus a section-level "Revoke all links across all crew on this show" button.

**Post-pivot, the per-row affordances become:**

- Crew name + role chip (unchanged)
- "Preview as <name>" link (unchanged)

That's it for per-row. Both M9.5 buttons and all status text scoped to JWT versioning go away.

**New section-level affordance** above the table: **"Reset picker selections on this show"** button.

- Copy: `Reset picker selections`
- Subcopy: `Every device that has picked an identity on this show will be re-prompted on their next visit.`
- Confirm step: a `<Dialog>` opens with count-free copy: `Are you sure? Every device that has picked an identity for this show will be re-prompted on its next visit. This action is immediate and cannot be undone (but resetting again has the same effect).` **R27 amendment**: the spec previously suggested `<N> selections will be reset` with `<N>` as a "server-rendered count" — but §8.2 explicitly establishes that the server has no per-device selection log, so `<N>` would be either fabricated or invented by adding a server-side store (which is out of scope per §11). The count-free copy keeps the dialog honest about what the server can know.
- On confirm: Server Action `resetPickerEpoch({ showId })`. On success: a toast "Picker selections reset. Each device will see the picker on next visit."

### 8.2 What the admin cannot see

Because the picker model stores no server-side selection state, the admin panel has no view of:

- Which devices have a selection for this show
- Which crew member each device picked
- When each device last visited

The admin's only lever is the Reset button (whole-show), the existing `crew_members` editing (remove someone from the sheet), and the Preview tool (spot-check a role's view).

The "Are you sure? N selections will be reset" copy in §8.1 is therefore vague intentionally — the server doesn't know N. The copy says "every device that has picked an identity for this show" instead.

### 8.3 Per-show panel layout deltas

The DOM tree of `PerShowCrewSection.tsx` shrinks:

- Removed: the `<IssueLinkButton>` and `<RevokeAllLinksButton>` imports and their per-row + section-level mounts.
- Removed: per-row status badges that read from `crew_member_auth` (the table is gone).
- Added: a `<ResetPickerEpochButton />` mounted above the crew table.
- Added: `<form action={resetPickerEpoch}>` wrapping the new button with confirm dialog.

The Preview-as-crew column shifts from being one of several per-row affordances to being the only per-row affordance. The table can be simpler — possibly just two columns: `Name (with role chip)` and `Preview`.

### 8.4 Message catalog deltas

The `lib/messages/catalog.ts` entries scoped to JWT-version mutations (every code referencing `current_token_version`, `revoked_below_version`, `LEAKED_LINK_DETECTED`, `CSRF_*`, `LINK_REVOKED_*`) all drop. The `admin_alerts.upsert` catalog meta-test (`tests/messages/_metaAdminAlertCatalog.test.ts`, per AGENTS.md cross-cutting discipline) is updated to remove these codes and assert no orphan entries.

**New admin-alert codes** (operator-facing, logged to `admin_alerts`):

- `PICKER_EPOCH_RESET`: emitted when an admin clicks Reset. Carries `{ show_id, show_slug, admin_email, new_epoch }`. Informational.
- `PICKER_SELECTION_RACE`: emitted when a `selectIdentity` action commits a cookie write under a stale epoch (the race in §7.8 compound transitions). Carries `{ show_id, show_slug, attempted_crew_member_id, observed_epoch, expected_epoch }`. Informational. The Server Action does not block the write — the cookie is set with the stale `e`; the next page load shows the picker. The alert is the operator's window into how often this happens in practice. If it's frequent, follow-up work tightens the race (e.g., re-read the epoch before write inside the action).

**Catalog entries deleted (M9.5/M11 surface):** in addition to the JWT-version codes already listed above, the pivot deletes the `LEAKED_LINK_DETECTED` catalog entry and its `dougFacing` "Issue new link for that crew member to send them a fresh one" copy. That copy is in the same phantom-URL-distribution class the M11 R17 repair (`tests/help/forbidden-prose-registry.test.ts`) was closing for help docs — the live admin UI under M9.5 advanced token state but had no in-app sendable URL surface (per §8.1). The pivot retires the leaked-link middleware handler AND its catalog entry together, structurally eliminating the phantom-link class for crew-facing copy. The `no-jwt-surface` meta-test (§10.1) already bans the literal substring `LEAKED_LINK_DETECTED` post-cutover; the catalog's misleading copy is removed by the same deletion.

**New crew-facing copy codes** (rendered via `messageFor(...)` per AGENTS.md invariant 5; never displayed as raw codes):

- `PICKER_EPOCH_STALE_BANNER`: the banner copy on the picker when the cookie's epoch is behind the row's epoch. Default copy: "Doug reset access for this show — pick yourself again." Used by §6.1 `kind: 'epoch_stale'`.
- `PICKER_REMOVED_FROM_ROSTER_BANNER`: the banner copy when the picked crew member is no longer in the roster. Default copy: "Your previous selection was removed by Doug — pick yourself from the current roster." Used by §6.1 `kind: 'removed_from_roster'`.
- `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` (R41-R8): banner copy when the cookie's picked identity has since been OAuth-claimed. Default copy: "This identity is now claimed by a signed-in user. Pick yourself from the current roster or sign in to use the same identity." Used by §6.1 `kind: 'identity_invalidated', reason: 'claimed_after_pick'`.
- `PICKER_IDENTITY_AMBIGUOUS_BANNER` (R41-R8): banner copy when the cookie's picked identity has become ambiguous (duplicate email on the show). Default copy: "This name needs roster cleanup — ask Doug to remove the duplicate." Used by §6.1 `kind: 'identity_invalidated', reason: 'email_ambiguous'`.
- `PICKER_EMPTY_ROSTER`: the empty-state copy when the show's roster has no rows yet. Default copy: "Doug hasn't added crew yet — check back soon." Used by §7.3 guard condition.
- `PICKER_SHOW_UNAVAILABLE`: rejection copy when `selectIdentity` runs against an unpublished or archived show. Default copy: "This show isn't available right now. Ask Doug for an updated link if you think this is a mistake." Used by §6.2 rejection paths.

**New rejection codes for `selectIdentity` (R33 amendment — all carry both `dougFacing` operator copy AND `crewFacing` user copy, because these paths fire from user-triggered form submits and must never surface as raw codes per AGENTS.md invariant 5):**

- `PICKER_INVALID_INPUT`: `showId` or `crewMemberId` failed UUID validation in the Server Action. Crew-facing copy: "Something went wrong with that selection. Please try picking your name again." Operator-facing: full details (which field, what value). On render: the picker re-displays with the cataloged crew-facing copy as an error banner above the list.
- `PICKER_CREW_MEMBER_NOT_FOUND`: row not present at the moment of selection (sync ran between picker render and submit, OR Doug removed the crew member in the same window). Crew-facing copy: "That crew member was just removed from this show. Pick yourself from the current roster." Operator-facing: `{ show_id, attempted_crew_member_id, observed_at }`. On render: the picker re-displays with the cataloged crew-facing banner.
- `PICKER_CREW_MEMBER_WRONG_SHOW`: form-tamper defense (the submitted `crewMemberId` belongs to a different show's roster). Crew-facing copy: "Something went wrong with that selection. Please try picking your name again." (Deliberately matches `PICKER_INVALID_INPUT` to avoid signaling form-tamper specifics to a probing client.) Operator-facing: full details flagged as a possible tamper signal.
- **`PICKER_IDENTITY_CLAIMED` (R41 Fix-2):** the submitted `crewMemberId` row has `claimed_via_oauth_at IS NOT NULL`. Crew-facing copy: "This name is claimed by a signed-in user. Sign in with their Google account to use it." Operator-facing: `{ show_id, attempted_crew_member_id, observed_claimed_at }`. On render: the Server Action returns a redirect to `/auth/sign-in?next=<encoded tokenized URL>` (the same destination the UI's deactivated-row form-action targets) rather than re-displaying the picker with an error banner — this matches the UX contract from §7.2 (tapping a deactivated row leads to sign-in). Cataloged in `lib/messages/catalog.ts`. Carries the `tamper` log-flag (a form-tampered submission of a claimed crew row IS suspicious).
- **`PICKER_IDENTITY_AMBIGUOUS` (R41-R6 Fix-3; R41-R18 UX corrected):** the submitted `crewMemberId` row's email appears on 2+ `crew_members` rows on this show. Crew-facing copy: "This name needs roster cleanup. Ask Doug to remove the duplicate from this show's sheet." Operator-facing: `{ show_id, attempted_crew_member_id, observed_email, dup_count }`. **R41-R18 correction**: the Server Action does NOT redirect to `/auth/sign-in` (that path can't resolve ambiguity — `claim_oauth_identity` omits ambiguous shows from `result.shows` per R41-R3 GROUP BY HAVING COUNT(*) = 1, so picker-bootstrap can't mint a cookie for an ambiguous show; the user would loop back to the same ambiguous picker). Instead, the action returns a non-redirect terminal-state response: the route re-renders the picker in the AMBIGUOUS_BANNER mode (per §7.4 R41-R17), the ambiguous rows are deactivated per §7.2 R41-R6, and the deactivated-row form `action` attribute is set to a no-op (`onClick={(e) => e.preventDefault()}` plus a small inline message; the lock icon's `aria-label` reads "Roster cleanup needed — ask Doug to remove the duplicate"). The user has NO recoverable user-side action on this state — recovery requires Doug to deduplicate the roster (admin scope). This explicitly differs from `PICKER_IDENTITY_CLAIMED` (which DOES productively redirect to sign-in because the legitimate identity owner can authenticate). Cataloged in `lib/messages/catalog.ts`. Carries the `tamper` log-flag.
- **`PICKER_BOOTSTRAP_RPC_FAILED` (R41-R7 Fix-2):** emitted from `/api/auth/picker-bootstrap` when `claim_oauth_identity` returns an error or throws. Crew-facing copy: "Couldn't sign you in. Please try again in a moment." Operator-facing: `{ user_email, rpc_error_code, rpc_error_message }`. On render: the handler returns 502 with the cataloged terminal-failure UI (HTML response, NOT a redirect — R41-R7 fail-closed contract prevents the infinite redirect loop the reviewer flagged). Cataloged in `lib/messages/catalog.ts`. ALSO emitted to `admin_alerts` with the same code so operators can investigate persistent failures.
- `PICKER_RESOLVER_LOOKUP_FAILED`: `resolvePickerSelection`'s DB read failed (returned error or thrown infra fault). Crew page renders the existing cataloged terminal-failure UI; API routes return 500. Catalog entry includes both `dougFacing` operator copy (for admin logs / `admin_alerts`) and `crewFacing` copy (for the page render via `messageFor(...)`). The `tests/messages/_metaAdminAlertCatalog.test.ts` registry is extended to assert this code is cataloged before any consumer uses it.

**R41 amendment — sign-in / claim codes:**

- `SIGN_IN_OR_SKIP_PROMPT`: crew-facing copy on the `<SignInOrSkipGate>` interstitial (§7.1a). Default copy: "Sign in to use the same identity on every show, or skip to pick from this show's roster." Operator copy unused (informational; never logged to `admin_alerts`).
- `IDENTITY_DEACTIVATED_LOCK_HINT`: crew-facing copy on the deactivated picker row's lock icon `aria-label`. Default copy: "Sign in to use this identity." (§7.2 R41).
- `OAUTH_IDENTITY_CLAIMED`: emitted to `admin_alerts` when `claim_oauth_identity()` updates 1+ crew rows (§4.8). Carries `{ user_email, claimed_show_ids: uuid[], claimed_count: int }`. Informational. The `_metaAdminAlertCatalog` registry asserts this code is cataloged.
- `OAUTH_CLAIM_NO_ROWS`: NOT cataloged — silent success when `claim_oauth_identity()` matches 0 crew rows. The function returns affected-row count to the caller; no alert is emitted (otherwise every admin-user sign-in would spam alerts).
- `AMBIGUOUS_EMAIL_BINDING` (R41-R3 amendment): emitted to `admin_alerts` from `claim_oauth_identity()` body for each show where 2+ `crew_members` rows share the same email. Carries `{ email, show_id }`. Operator-facing copy: "Two or more crew rows on this show share the same email. The OAuth-claim cookie cannot resolve to a single identity; the user will see both rows as deactivated in the picker. Deduplicate the roster in Doug's sheet." Already exists as a code in `validateGoogleSession.ts` pre-pivot for the page-route detection path; the RPC version writes to the same code so the `_metaAdminAlertCatalog` registry only sees one canonical entry. The alert is emitted ONCE per ambiguous show per RPC invocation (not per row) so repeat sign-ins for the same ambiguous email don't spam.

**No-raw-code regression test**: §10.2 adds an explicit test that exercises each of the four codes above via a real form submission and asserts (a) the response DOM contains the cataloged crew-facing copy via `messageFor()`; (b) the response DOM does NOT contain the literal code string (e.g., no `PICKER_INVALID_INPUT` substring); (c) the structured log carries the operator-facing payload.

---

## 9. Backwards-compatibility + migration window

### 9.1 Pre-shipping clean cutover

The app has not shipped to production. Per the owner determination on 2026-05-23, no live links are in crew threads. Therefore:

- **No compat window.** The implementation plan deletes the M9.5 JWT/redeem-link/bootstrap surfaces in a single migration. No dual-path code. No sunset task. No grace period.
- **No legacy URL handling.** `/show/<slug>/p` returns 404 (the route directory is deleted). `?t=<...>` query params are silently ignored by Next.js routing (the leaked-link middleware handler is deleted; the request just resolves at `/show/<slug>` like any other).
- **No data migration for live JWTs.** The `link_sessions`, `bootstrap_nonces`, `crew_member_auth`, `revoked_links` tables drop with no row-level migration. Whatever rows exist in dev are wiped.

### 9.2 Dev-data implications

Eric's dev database almost certainly has rows in the dropped tables from M5–M11 testing. The migration is destructive: `DROP TABLE IF EXISTS ... CASCADE`. The dev clone schema at `supabase/migrations/20260502000000_dev_schema_clone.sql:187-204` also defines parallel tables in the `dev` schema; both are dropped in the same migration.

### 9.3 Test-fixture implications

Every test fixture that references `crew_member_auth`, `link_sessions`, JWT tokens, signing keys, etc. is purged. The plan enumerates the fixture-by-fixture edits required (this is in scope of the plan, not the spec).

### 9.4 Rollback posture

If the pivot needs to be rolled back, restoration is non-trivial — the dropped tables and their RPCs would need re-creation from migration history. Per AGENTS.md guidance, rollback is **not designed for**; the forward direction is the only supported transition. If we discover a critical bug post-deploy, the recovery path is "fix forward, not roll back."

---

## 10. Tests + structural defenses

### 10.1 Meta-test inventory (per AGENTS.md writing-plans addition)

The plan CREATES or EXTENDS the following structural meta-tests:

| Meta-test | Action | Why |
| --------- | ------ | --- |
| `tests/auth/_metaInfraContract.test.ts` (existing) | EXTEND | Register `resolvePickerSelection`, `selectIdentity`, `clearIdentity`, `resetPickerEpoch` as Supabase-call-boundary subjects. Each must destructure `{ data, error }` and surface infra faults as discriminable typed results per AGENTS.md invariant 9. |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` (existing) | EXTEND | The Reset RPC mutates `shows.picker_epoch` and therefore MUST hold the per-show advisory lock per AGENTS.md invariant 2 (see §4.5). The pin asserts: (a) the SECURITY DEFINER RPC `public.reset_picker_epoch_atomic` body acquires `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` at exactly one layer; (b) the JS-side `resetPickerEpoch` Server Action has NO advisory-lock call AND NO `lockedShowTx`/equivalent wrapper around the `.rpc()` invocation (no nested holder); (c) no other DB function reacquires the same key while the RPC body holds it; (d) no other writer of `picker_epoch` or `picker_epoch_bumped_at` exists in the repo. |
| `tests/admin/no-inline-email-normalization.test.ts` (existing) | **EXTEND (R41-R16/R41-R17 invariant-3 enforcement — six scan surfaces)** | Picker proper doesn't touch emails, but R41 OAuth integration does. EXTEND the meta-test to scan: (a) `app/auth/callback/route.ts` for `canonicalize(user.email)` usage and forbid inline `.toLowerCase()` / `.trim()` on email strings; (b) `app/api/auth/picker-bootstrap/route.ts` for the same; (c) `supabase/migrations/**` SQL files defining `claim_oauth_identity`, `select_identity_atomic`, AND the picker-render data fetcher's query for inline `lower(trim(...))` on `email` columns or parameters — forbid; (d) `resolvePickerSelection.ts` for any `lower(trim(email))` patterns — forbid (the resolver compares already-canonical column values via `=`); (e) **the `select_identity_atomic` RPC body for inline `lower(trim(email))` in the ambiguous-email subquery — R41-R17 expanded coverage; uses direct `email = email` comparison via the canonical CHECK constraint**; (f) **the picker-render data fetcher's `COUNT(*) OVER (PARTITION BY show_id, email)` window for inline normalization in the PARTITION BY — R41-R17 expanded coverage**. All six extensions enforce AGENTS.md invariant 3 (one canonicalization boundary). |
| `tests/messages/_metaAdminAlertCatalog.test.ts` (existing) | EXTEND | Remove all M9.5-era codes; add `PICKER_EPOCH_RESET`, `PICKER_SELECTION_RACE`, and the new picker-rejection codes (`PICKER_INVALID_INPUT`, `PICKER_CREW_MEMBER_NOT_FOUND`, etc.). |
| `tests/auth/_metaPickerCookieContract.test.ts` (new) | CREATE | Pins the cookie envelope shape: name = `__Host-fxav_picker`, `v=1` strict, decoder returns null on shape failures, encoder/decoder are the only producers in the repo. Banned-identifier audit: the literal substring `__Host-fxav_picker` outside `lib/auth/picker/cookieEnvelope.ts`, the middleware, and the test fixtures fails. Asserts `MAX_COOKIE_VALUE_BYTES === 3800` and that the constant cannot be raised beyond 3900 without a paired `// browser-cap-implication-acknowledged` comment in the same hunk. |
| `tests/components/_metaPickerRoleChipContract.test.ts` (new) | CREATE | Pins the LEAD-chip-uses-FXAV-orange contract: any roster row where the underlying crew member has `LEAD` in `role_flags` renders with the accent chip; any other row renders the neutral chip. Test runs against a fixture roster with mixed `role_flags`. |
| `tests/cross-cutting/no-jwt-surface.test.ts` (new) | CREATE | Banned-identifier audit. The literal substrings `__Host-fxav_session`, `redeemLink`, `signLinkJwt`, `verifyLinkJwt`, `current_token_version`, `revoked_below_version`, `max_issued_version`, `bootstrap_nonces`, `link_sessions`, `revoked_links`, `crew_member_auth`, `LEAKED_LINK_DETECTED`, `CSRF_DENIED`, `validateCrewAssetSession`, `validateLinkSession`, `crew_link` (as a `ShowViewer` chain-level `kind` discriminator in `lib/auth/resolveShowViewer.ts` — NOT to be confused with the `Viewer` data-fetcher union at `lib/data/getShowForViewer.ts:79-82` whose `'crew'` arm is preserved), `crew_google` (as a `ShowViewer` chain-level discriminator) MUST not appear anywhere in `app/**`, `lib/**`, `components/**`, `middleware.ts`. **Migration scope is explicitly carved out**: the same identifiers ARE permitted to appear in `supabase/migrations/<cutover-migration>.sql` itself (the file that DROPs the M9.5 surface), but MUST NOT appear in any migration with a timestamp AFTER the cutover migration. The meta-test reads the cutover migration's filename from a single `CUTOVER_MIGRATION_TIMESTAMP` constant exported by the audit helper, and (a) allows ALL of the banned identifiers inside that specific migration file in `DROP TABLE` / `DROP FUNCTION` / `REVOKE` contexts; (b) bans them in app/lib/components/middleware unconditionally; (c) bans them in every migration with a timestamp strictly greater than `CUTOVER_MIGRATION_TIMESTAMP`. Old migrations (timestamp < CUTOVER) retain their history per migration-immutability rules and are out of scope of the test entirely. **R41 amendment (revised R41-R3)**: `validateGoogleSession` is RESTORED to production code with a STRUCTURAL ALLOWLIST. The meta-test allows `validateGoogleSession` imports ONLY in: `lib/auth/validateGoogleSession.ts` (the module itself), `lib/auth/picker/resolveShowPageAccess.ts` (page-route resolver helper — pure, NEVER mutates cookies), `app/auth/callback/route.ts` (post-callback claim-stamp + cookie-bootstrap), `app/api/auth/picker-bootstrap/route.ts` (per-show cookie-bootstrap for Google-signed-in users on shows added post-sign-in), `app/me/page.tsx` (signed-in cross-show discovery surface), AND test directory. **Critically NOT in the allowlist**: `lib/auth/picker/resolvePickerSelection.ts`, `app/api/report/route.ts`, `/api/asset/{diagram,reel,agenda}`, `/api/realtime/subscriber-token`, `/api/show/[slug]/version`, `/auth/sign-out` (the M11 sign-out does not import it and must not import it post-pivot). **`resolveShowPageAccess.ts` is itself further constrained** (R41-R3 reviewer finding): the meta-test asserts the helper does NOT import the picker cookie encoder (`signEnvelope`/`encodeEnvelope` from `lib/auth/picker/cookieEnvelope.ts`) NOR `cookies` from `next/headers` — preventing future re-introduction of the illegal Server-Component cookie-mint path R41-R2 repaired. **`resolveShowPageAccess` importer scope**: the meta-test asserts the ONLY importer is `app/show/[slug]/[shareToken]/page.tsx` — API routes never import it. The picker-resolver-callsite contract test additionally asserts every API consumer imports `resolvePickerSelection` AND NOT `resolveShowPageAccess` AND NOT `validateGoogleSession`. `listShowsForCrew` is similarly allowlisted to `lib/data/listShowsForCrew.ts` (module) and `app/me/page.tsx` (sole caller) only. R41 reverses R14/R15 ONLY for the allowlisted callers; this allowlist is the single source of truth — any prose drift naming additional callers in other sections is incorrect and must be corrected to this list. |
| `tests/cross-cutting/picker-resolver-callsite-contract.test.ts` (new) | CREATE | Asserts every API route that needs crew identity (`/api/realtime/subscriber-token`, `/api/asset/diagram/[show]/[rev]/[key]`, `/api/asset/reel/[show]`, `/api/asset/agenda/[show]/[id]`, `/api/show/[slug]/version`, `/api/report`) imports the COOKIE-ONLY `resolvePickerSelection` from the canonical helper path AND **does NOT import `resolveShowPageAccess` AND does NOT import `validateGoogleSession`** (R41-R1 Fix-3 structural defense — API routes accepting Google sessions without a picker cookie was the R41-R1 R1 HIGH finding). The page route `app/show/[slug]/[shareToken]/page.tsx` imports `resolveShowPageAccess` (NOT `resolvePickerSelection` directly). Both helpers distinguish their `infra_error` arm from auth-denied. Static-analysis walker over the file list — does NOT depend on running the routes. R38 amendment: the OLD `app/show/[slug]/page.tsx` is explicitly excluded (deleted per §4.7); a regression assertion fails if that file exists OR re-imports either helper. |

### 10.2 Functional test coverage

The plan's TDD checklist includes:

- **Picker-renders cases (5 code-path variants → 3 visual modes)** — one test per resolver outcome that renders the picker: `kind: 'no_selection'` exercised via the three code-path entry points (no cookie / decode failure / no entry for show_id — all render the "initial" visual mode from §7.4 but via different code paths and must each be exercised); `kind: 'epoch_stale'` (renders epoch-stale banner mode); `kind: 'removed_from_roster'` (renders removed-from-roster banner mode). Each test fires a request with a constructed cookie state and asserts the rendered DOM (heading present, list count matches roster, banner code matches expected `messageFor()` lookup or absent). The other resolver outcomes (`kind: 'show_unavailable'`, `kind: 'infra_error'`, `kind: 'resolved'`) are tested in their own dedicated tasks (notFound / terminal-failure UI / `_ShowBody` render respectively) and are NOT picker-renders.
- **`selectIdentity` happy path** — Server Action sets cookie, route revalidates, next request resolves `kind: 'resolved'`.
- **`selectIdentity` rejection paths** — invalid UUID, crew_member_id not in roster, wrong show_id, archived show, unpublished show. Each asserts the specific rejection code AND that no cookie was written.
- **`clearIdentity`** — happy path (cookie key removed), all-shows-cleared path (cookie deleted entirely).
- **`resetPickerEpoch`** — happy path; non-admin rejection.
- **Cookie envelope** — round-trip encode/decode; reject `v != 1`; reject missing fields; reject wrong types; reject malformed JSON.
- **LRU eviction at cap** — write 51 entries; assert oldest by `t` was dropped.
- **Composite `viewer_version_token` (R41-R17 expanded)** — DB-level test that the function returns a value advancing on `picker_epoch_bumped_at` updates. **R41-R17 same-millisecond regression**: fixture executes two rapid `picker_epoch` bumps via `reset_picker_epoch_atomic` inside the SAME millisecond (use a transaction with `pg_sleep(0.0001)` or batched calls). Assert: the returned `viewer_version_token` strings are DISTINCT across the two reads (their `:epoch` suffixes differ even when the timestamp portion is identical). Without R41-R17's `:picker_epoch` suffix, the test would fail because both reads would produce identical millisecond-prefix strings. The Realtime broadcast layer uses the token as a freshness key; distinct tokens ensure open tabs force-refresh on every reset.
- **Realtime bridge auth swap** — `/api/realtime/subscriber-token` reads picker cookie correctly; admin path via Google session still works.
- **Admin precedence preserved** — admin with a stale picker cookie still sees admin mode, not picker.
- **Unpublished/archived show guard — page route (R41-R10 expanded for Google-session ordering)** — non-admin viewer on an unpublished or archived show gets `notFound()` BEFORE any picker render OR Google-session resolve. Test asserts: (a) no `roster-list` DOM element is emitted; (b) no DB query for `crew_members` was issued; (c) the response status is 404, not 200. Same test repeated for an archived (published=true, archived=true) show. **R41-R10 redirect-loop regression**: fixture is an UNPUBLISHED show with a Google session whose email matches exactly one `crew_members` row on that unpublished show. Without R41-R10, the chain step 4(b'/c) would return `needs_picker_bootstrap` → bootstrap → `claim_oauth_identity` filters published-only → empty `result.shows` for this slug → no cookie minted → 302 back → step 4 re-fires → INFINITE LOOP. With R41-R10's step-3.5 (unpublished guard ahead of Google-session resolve), the test asserts: (a) page returns 404 immediately, no 302 to `/api/auth/picker-bootstrap`; (b) `claim_oauth_identity` was NEVER called; (c) redirect-chain depth is 0 (404 is the direct response).
- **Share-token validation — page route (R34)** — request to `/show/<slug>/<wrong-token>` returns 404 indistinguishable from "unknown slug." Request to `/show/<wrong-slug>/<right-token>` also returns 404. Request to `/show/<slug>/<right-token>` for the same row proceeds to the picker / show body. Token comparison MUST be timing-safe (use `crypto.timingSafeEqual` or equivalent at the DB layer via a parameterized SELECT). No structured-log entry on token mismatch (avoid enumeration oracle); a single `404` and silence.
- **Share-token entropy meta-test (R34/R35/R36)** — DB-level test asserts every row in `public.shows` has a paired row in `public.show_share_tokens` with `share_token` matching `^[0-9a-f]{64}$` (64-char hex floor). New-show insert test asserts the trigger-driven default expression populates `show_share_tokens` without explicit assignment. Backfill test: pre-migration dev DB with N `shows` rows and 0 `show_share_tokens` rows; run the migration; assert N paired tokens exist post-migration.
- **Migration backfill contract (R36 amendment)**: the cutover migration creates `show_share_tokens`, then runs `INSERT INTO public.show_share_tokens (show_id) SELECT id FROM public.shows ON CONFLICT (show_id) DO NOTHING;` (the table's default expression generates the token; the `ON CONFLICT` clause is defensive against double-application). The same migration installs an `AFTER INSERT ON public.shows` trigger that inserts a paired `show_share_tokens` row for every future show.
- **Picker cookie HMAC integrity (R36 amendment)** — negative-regression test: construct a hand-forged cookie with `{ v:1, selections: { "<real-show-uuid>": { id: "<real-crew-uuid>", e: 1, t: <now> }}}` URL-encoded WITHOUT a valid HMAC signature; assert every API route (subscriber-token, asset/{diagram,reel,agenda}, version, report) returns 401 (the resolver treats the unsigned/invalid cookie as `no_selection`). Positive test: a properly signed cookie from `selectIdentity` succeeds on those routes. Asserts the signing-key env var is documented in `lib/env/*` schema with a fallback failure mode (server fails to boot if the key is unset; never falls back to an empty key).
- **`selectIdentity` share-token re-validation (R37 amendment)** — negative-regression test: invoke `selectIdentity` directly with `{ slug: <real>, shareToken: <wrong>, crewMemberId: <real> }`; assert (a) `resolve_show_by_slug_and_token` returns NULL; (b) the action returns `PICKER_INVALID_SHARE_TOKEN`; (c) NO `Set-Cookie` for `__Host-fxav_picker` is emitted; (d) no cookie state changes. Positive test: action with the correct shareToken mints the signed cookie. Plus a defense-in-depth test that invoking the action with `{ showId, crewMemberId }` (the legacy R0 shape, no shareToken) is treated as a validation failure (PICKER_INVALID_INPUT).
- **Unpublished/archived show guard — API routes** — every API route in §6 that calls `resolvePickerSelection` (subscriber-token, asset/diagram, asset/reel, asset/agenda, version, report) MUST return `410 Gone` with `PICKER_SHOW_UNAVAILABLE` copy when called with a valid picker cookie for an archived OR unpublished show. Each route gets its own test asserting: (a) the resolver returns `kind: 'show_unavailable'`; (b) the response status is 410; (c) no asset bytes / no realtime token / no version_token / no report row is created; (d) admin path via `isAdminSession` is unaffected (admins can still hit these routes for unpublished shows during preview/QA per parent spec).
- **Asset route auth swap — diagram** — `/api/asset/diagram/<show>/<rev>/<assetKey>` accepts picker cookie for the matching show; rejects no-cookie (401); rejects wrong-show cookie (401 — the picker model treats wrong-show as stale-credential, NOT as forbidden; no server state to clean up); rejects stale-epoch cookie (401); rejects removed-from-roster cookie (401); rejects show-unavailable (410); admin path via `isAdminSession` still works. The 410 (revision-mismatch) contract is unchanged from M11 (distinct from the picker's 410 for `show_unavailable`; both are 410 but the response body's cataloged code distinguishes them: `PICKER_SHOW_UNAVAILABLE` vs the existing revision-mismatch code). Status mapping for all stale-credential outcomes is the single source of truth in the "Stale-credential handling at each consumer" matrix in §6.1; this bullet defers to that matrix.
- **Asset route auth swap — reel** — `/api/asset/reel/<show>` same matrix as diagram. The buffer-then-verify md5 contract from the parent spec §7.3 is unchanged; only the auth source swaps.
- **Asset route auth swap — agenda** — `/api/asset/agenda/<show>/<id>` same matrix as diagram. Currently uses `validateCrewAssetSession`; pivot swaps to `resolvePickerSelection`. PDF streaming + content-disposition contract unchanged.
- **Version endpoint auth swap** — `/api/show/<slug>/version` accepts picker cookie for the matching show (200 with `{ version_token: <string> }`); rejects no-cookie / invalid-cookie / wrong-show cookie with **401 BEFORE invoking `viewer_version_token`** (preserves the M11 auth-denied contract — the endpoint is NOT a public freshness/existence probe); admin via `isAdminSession` returns 200. Asserts the no-cookie path emits NO body except the standard 401 envelope, and that the `viewer_version_token` RPC is never reached without auth. Plus an `infra_error` test: when `viewer_version_token` RPC fails AFTER auth succeeded, the route returns 500, NOT 200-with-stale.
- **Report endpoint auth swap** — `/api/report` accepts picker cookie for the matching show OR admin via `isAdminSession`/`requireAdminIdentity`. The `validateGoogleSession` arm is removed (per R41 minimum-surface-area: Google-signed-in crew get a picker cookie via the page route's step-4 auto-resolve before any API call). Tests assert: (a) picker cookie + matching `show_id` → 200; (b) picker cookie + mismatched `show_id` body → 401; (c) admin session → 200; (d) **Google session matching a crew email WITHOUT a picker cookie → 401** (regression against the M11 arm; if this returns 200 the redundant arm has been re-introduced); (e) no session at all → 401.
- **`/me` preserved with tokenized URLs (R41 amendment; R41-R19 canonical-email pin)** — request to `/me` while signed in renders the list of shows where the user's email matches a `crew_members` row on a published+not-archived show. Tests assert: (a) signed-in user with matching crew rows gets a list whose entries are `/show/<slug>/<share-token>` URLs (full tokenized form, NOT bare `/show/<slug>`); (b) the rendered URLs come from `my_share_tokens_for_email()` RPC, not from a JOIN against `show_share_tokens` directly (the RPC enforces **`public.auth_email_canonical()`** self-scope — R41-R19); (c) signed-in user with no matching crew rows gets an empty-state surface; (d) admin user gets `/me` with their crew memberships listed (admins who are also crew see both surfaces); (e) anonymous user redirects to `/auth/sign-in?next=/me`; (f) **cross-user enumeration negative test**: invoke `my_share_tokens_for_email()` while signed in as user X and confirm it returns ONLY rows for X's email — no row for user Y leaks even when Y's email is passed as a parameter (the RPC ignores the parameter and reads `public.auth_email_canonical()`); (g) **R41-R19 mixed-case regression**: signed in with Google account `Alice@Example.Com` (mixed case) → assert the RPC returns the matching `crew_members` row stored with `email = 'alice@example.com'` (canonical). Without `auth_email_canonical()`, this test would fail because raw `auth.email()` returns mixed-case and `email = 'Alice@Example.Com'` would not match `'alice@example.com'`. Static-analysis assertion: `listShowsForCrew` import survives only in `lib/data/listShowsForCrew.ts` and `app/me/page.tsx`.
- **SignInOrSkipGate first-contact (R41 amendment, §7.1a)** — request to `/show/<slug>/<share-token>` with NO picker cookie, NO admin session, NO Google session, AND no `?gate=skip` query param renders the SignInOrSkipGate. Tests assert: (a) `[data-testid="sign-in-or-skip-gate"]` is in the DOM; (b) the page does NOT include `[data-testid="picker-roster-row"]` (the picker is NOT pre-rendered behind the gate); (c) the Sign-in link href is `/auth/sign-in?next=<encoded current URL>`; (d) the Skip button is a same-page navigation to `<current URL>?gate=skip`. Compound test: same request with `?gate=skip` renders the picker, NOT the gate.
- **Google-session auto-resolution (R41-R2 revised — redirect-bootstrap flow)** — two sub-cases:
  - **Sub-case A: cookie already present** (normal flow — user signed in earlier via OAuth callback which minted cookies for all their shows). Request to `/show/<slug>/<share-token>` with Google session + valid picker cookie entry for this show. Tests assert: (a) page renders `<_ShowBody />` directly via §4.1 step 6 (cookie path); (b) NO redirect; (c) NO new Set-Cookie (cookie is already correct).
  - **Sub-case B: cookie missing** (edge: Doug added user to show after sign-in, or user navigates to a new show from `/me`). Request to `/show/<slug>/<share-token>` with Google session but NO cookie entry for this show. Tests assert: (a) page route returns redirect to `/api/auth/picker-bootstrap?next=<encoded current URL>&t=<intent token>` (BOTH `next` AND `t` are required — R41-R5 CSRF defense); (b) the `t` parameter decodes to a payload whose embedded `{slug, shareToken}` matches the URL; (c) following the redirect, picker-bootstrap verifies the token (rejects expired/tampered with 403), then validates the session, mints the picker cookie entry for this show, and 302s back; (d) the follow-up request renders `<_ShowBody />` via §4.1 step 6; (e) the `validateGoogleSession` call inside `resolveShowPageAccess` (NOT `resolvePickerSelection` — see R41-R1 Fix-3 split) is the entry point that triggers the redirect; (f) the picker-bootstrap handler is the legal cookie mutator per R41-R2 CRITICAL repair.
  - **Negative test**: Google session whose email does NOT match any crew row for this show renders the SignInOrSkipGate (NOT the picker — the user is signed in but not associated with this show). The redirect-bootstrap is NOT triggered (step 4 falls through to step 5 then step 9).
- **API routes reject Google session without picker cookie (R41-R1 Fix-3 regression)** — for EACH API consumer in §6 (`/api/realtime/subscriber-token`, `/api/asset/diagram`, `/api/asset/reel`, `/api/asset/agenda`, `/api/show/[slug]/version`, `/api/report`), construct a request with a valid Google session whose email matches a `crew_members` row on the target show, but with NO `__Host-fxav_picker` cookie. Assert: response status is 401 (NOT 200). This is the contract-level test that R41-R1 R1 HIGH demanded — if `resolvePickerSelection` ever picked up a Google-session auto-resolve, every one of these tests would flip to 200 and CI would fail. Companion structural test: grep each API-route source file for `validateGoogleSession` import → MUST be absent.
- **OAuth-callback claim-stamp hook (R41-R6 revised, §4.8 — NO cookie writes)** — request to `/auth/callback?code=<valid-code>` after Google OAuth. Tests assert: (a) `exchangeCodeForSession()` is called first; (b) on success, `claim_oauth_identity(<user-email>)` is invoked via the service-role client; (c) every `crew_members` row whose `email = <user-email>` AND `claimed_via_oauth_at IS NULL` is updated to set `claimed_via_oauth_at = NOW()`; (d) rows already stamped are NOT re-stamped (idempotent); (e) **the response has NO `Set-Cookie: __Host-fxav_picker` header** (R41-R6 structural choice — callback is DB-stamp-only; cookies mint lazily on first show visit via picker-bootstrap); (f) the post-stamp redirect honors the `next` param; (g) **negative-regression**: a callback for a user with NO matching crew row succeeds with no UPDATE; no Set-Cookie either way; (h) **second sign-in idempotence**: re-signing-in stamps no rows (`claimed_count = 0`); no Set-Cookie emitted. The OAUTH_IDENTITY_CLAIMED admin alert is emitted ONLY when `claimed_count > 0`. **Negative regression — picker-cookie write attempt**: the `_metaPickerCookieContract` test grep-asserts the callback file does NOT contain `cookies().set('__Host-fxav_picker'` (or equivalent). If a future implementer adds bulk-mint back, CI fails immediately.
- **Picker-bootstrap Route Handler (R41-R2 new, `/api/auth/picker-bootstrap`; R41-R5 + R41-R6 hardened)** — request to `/api/auth/picker-bootstrap?next=/show/<slug>/<share-token>&t=<intent-token>` with Google session. **All success-path tests MUST include a valid `t` parameter** (the CSRF defense bullet below covers the negative cases). Tests assert: (a) `next` validated against `validateNextParam.ts` allowlist (regex matches `^/show/[a-z0-9-]+/[0-9a-f]{64}$`); (b) intent token verified (HMAC valid + not expired + embedded slug/shareToken matches `next`) — failure → 403 not 302; (c) `resolve_show_by_slug_and_token` re-validates the slug+token pair, NULL → 302 to `/` with no cookie set; (d) `validateGoogleSession` → no session → 302 to `next` with no cookie set; (e) `validateGoogleSession` resolves + email matches exactly one crew_members row for THIS show (the target derived from `next`) → cookie's entry for THIS show_id ONLY updated with `{ id: <crewMemberId>, e: <picker_epoch>, t: <now> }`; entries for other shows in the envelope are byte-identical pre/post + 302 to `next`; (f) `validateGoogleSession` resolves but email NOT in this show's crew_members → 302 to `next` with NO cookie set (the show page renders the SignInOrSkipGate naturally); (g) the cookie set carries `Max-Age=7776000`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, name `__Host-fxav_picker`; (h) the handler is in the cookie-mutator allowlist of the picker-cookie-contract meta-test; (i) **one-show-only assertion** (R41-R6): when `claim_oauth_identity` returns `{ shows: [A, B, C] }` and `target_show_id` is A, the response envelope contains an entry for A but NOT for B or C (lazy-mint contract).
- **Deactivated row tap-redirect (R41 amendment, §7.2; R41-R6 expanded for ambiguity)** — picker rendered with a roster containing crew members in three states:
  - **State A (OAuth-claimed)**: `claimed_via_oauth_at IS NOT NULL`. Row deactivated; `data-claimed="true"`.
  - **State B (ambiguous-NULL)**: two crew rows share the same email on this show, both have `claimed_via_oauth_at IS NULL`. Both rows deactivated; both carry `data-ambiguous="true"`.
  - **State C (ambiguous-stamped)**: two crew rows share the same email on this show, both have `claimed_via_oauth_at IS NOT NULL`. Both rows deactivated; both carry BOTH `data-claimed="true"` AND `data-ambiguous="true"`.
  - **State D (clean unclaimed)**: only one crew row with this email, `claimed_via_oauth_at IS NULL`. Row active, selectable.
  Tests assert per the R41-R18 corrected divergence: (a) State A (OAuth-claimed only — NOT ambiguous): `aria-label="Sign in to use this identity"`, form `action="/auth/sign-in?next=..."`, tap triggers OAuth redirect; (b) States B and C (ambiguous — regardless of claimed): `aria-label="Roster cleanup needed — ask Doug to remove the duplicate"`, form `action` is a no-op (`javascript:void(0)` or absent), tap does NOT redirect; (c) State D rows are fully active with selectIdentity action; (d) `data-claimed` / `data-ambiguous` attributes emitted per the row's reason; (e) NO state mints a picker cookie via the deactivated form (Set-Cookie absent on tap for all deactivated rows). **R41-R6 + R41-R18 server-side enforcement test**: hand-craft a Server Action POST for a State B or C row's `crewMemberId`. Assert: the Server Action returns `PICKER_IDENTITY_AMBIGUOUS` cataloged response which renders the picker in AMBIGUOUS_BANNER mode (NO redirect to `/auth/sign-in` — R41-R18 correction); NO `Set-Cookie` for `__Host-fxav_picker`; structured log carries `tamper` flag. **R41-R18 no-OAuth-loop regression**: explicit assertion that the response Location header is absent (no 302); the page re-renders directly with the banner; tapping a deactivated ambiguous row does not navigate.
  Anti-tautology: deactivation states derived from the fixture's `claimed_via_oauth_at` field AND from the same-show same-email count, not from position indices — works across roster permutations.
- **Cross-show claim consistency (R41 amendment)** — fixture: two published shows (Show-A, Show-B), one crew member with the same email on both, currently claimed on neither. Test: invoke `claim_oauth_identity(<email>)`. Asserts: (a) BOTH rows now carry `claimed_via_oauth_at` (the function operates by email, not by show); (b) opening Show-A's picker shows the row as deactivated; (c) opening Show-B's picker also shows the row as deactivated. Regression against partial-claim drift (the function MUST stamp all matching rows in a single statement).
- **`PICKER_IDENTITY_CLAIMED` server-side enforcement (R41 Fix-2 regression)** — negative test against hand-crafted Server Action POST. Fixture: a crew member with `claimed_via_oauth_at = '2026-05-23T...'`. Bypassing the deactivated-row UI, invoke `selectIdentity({ slug, shareToken, crewMemberId: <claimed-id> })` directly via a fetch with the form-encoded body. Assert: (a) the action returns a redirect to `/auth/sign-in?next=...` (the cataloged response for `PICKER_IDENTITY_CLAIMED`); (b) NO `Set-Cookie` header for `__Host-fxav_picker` is emitted; (c) the `select_identity_atomic` RPC's SQL inside the DB log shows the `claimed_via_oauth_at IS NULL` predicate (DB-level assertion via test instrumentation); (d) the structured log carries a `tamper` flag with `{ show_id, attempted_crew_member_id, observed_claimed_at }`. **Concurrency variant**: invoke `selectIdentity` and `claim_oauth_identity` concurrently for the same crew member; assert exactly one outcome (either the select wins and the claim stamps a new row leaving the cookie minted, OR the claim wins first and select rejects with `PICKER_IDENTITY_CLAIMED`) — never both. The per-show advisory lock guarantees this serialization; the test verifies the contract.
- **`select_identity_atomic` locked-timestamp regression (R41-R18 CRITICAL)** — fixture: Mallory attempts a bypass pick for Alice's crew row; Alice's `claimed_via_oauth_at` is currently NULL. Concurrent transaction interleave: T0 — Mallory's `select_identity_atomic` acquires Show-X advisory lock; T1 — Mallory's RPC reads Alice's row, sees IS NULL, captures `observed_at_seconds = extract(epoch from now())::bigint = T1_seconds`, returns success; T2 — Mallory's RPC commits, lock releases; T3 — Alice signs in via Google; `claim_oauth_identity` acquires Show-X lock, stamps Alice's row's `claimed_via_oauth_at = T3` (where T3 > T2 > T1), releases; T4 — Mallory's Server Action's JavaScript receives the RPC result and writes the cookie with `t = result.observed_at_seconds = T1_seconds` (NOT `Date.now() / 1000`). Tests assert: (a) Mallory's cookie's `t` field equals T1_seconds (DB-side timestamp from inside the lock), NOT T4_seconds (JS wall-clock at write time); (b) `T1 < T3` (the lock-captured timestamp predates the claim by definition); (c) when Mallory's browser later requests the show, `resolvePickerSelection` reads cookie.t=T1, queries Alice's row, observes `claimed_via_oauth_at = T3`, computes `cookie.t (T1) < extract(epoch from claimed_via_oauth_at) (T3)` → returns `identity_invalidated/claimed_after_pick`; (d) Mallory's cookie is rejected (resolver → 401 for API; picker re-prompts on page with CLAIMED_AFTER_PICK banner). **Without R41-R18 fix (regression)**: if Mallory's cookie carries `t = T4_seconds` (JS wall-clock), `cookie.t (T4) >= claim_epoch (T3)` → resolver ACCEPTS → Mallory continues as Alice indefinitely. The locked-timestamp contract is the structural defense against this entire impersonation class.
- **`claim_oauth_identity` advisory-lock topology (R41 Fix-1 regression; R41-R10 explicit-loop pin)** — DB-level test against the SECURITY DEFINER body. Fixture: 3 published shows sharing one crew email. Concurrent test (two parallel transactions): T1 invokes `claim_oauth_identity` for the email; T2 invokes `reset_picker_epoch_atomic` for Show-1. Assert: T1 and T2 complete without deadlock. **R41-R10 lock-order pin**: a new DB concurrency test exercises two `claim_oauth_identity` calls in flight for two DIFFERENT emails whose show sets overlap in opposite natural scan orders. Fixture: emailA's shows = {S1, S3}; emailB's shows = {S3, S1} (same shows, different table-scan order possible if planner reorders). Concurrent T1 = `claim_oauth_identity(emailA)`, T2 = `claim_oauth_identity(emailB)`. Assert: NO deadlock under repeated runs (statistical: at least 100 invocations). The PL/pgSQL FOR loop with `ORDER BY drive_file_id` MUST acquire S1's lock before S3's lock in both transactions; if either acquires in reverse order, the test deadlocks (caught by a 5-second statement timeout). This pins R41-R10's explicit-loop requirement — a regression to set-based PERFORM ... ORDER BY would fail this test. Lock-holder assertion: extend `tests/auth/advisoryLockRpcDeadlock.test.ts` to enumerate every `pg_proc.proname` in `public` that touches `crew_members`; static-analysis grep of the RPC body asserts `for ... in ... order by ... loop ... perform pg_advisory_xact_lock(...) ... end loop` pattern is present (any regression to the set-based form fails CI before runtime). **Single-holder pin**: the JS-side caller of `claim_oauth_identity` in `app/auth/callback/route.ts` MUST NOT wrap the RPC call in `lockedShowTx`/equivalent.
- **`claim_oauth_identity` UPDATE-set materialization (R41-R2 race-fix regression)** — DB-level concurrent test against the new CTE-restricted UPDATE. Fixture: user has crew_members rows on Show-A and Show-B; a third Show-C exists but the user is NOT yet on its roster. Concurrent (two parallel transactions): T1 invokes `claim_oauth_identity(email)`; T2 INSERTs a crew_members row for the email on Show-C IMMEDIATELY after T1 has acquired its Show-A + Show-B locks but BEFORE its UPDATE statement runs. Assert: T1's UPDATE does NOT stamp the Show-C row (it's not in the locked set materialized at lock-acquisition time); the Show-C row remains `claimed_via_oauth_at IS NULL`. T2's INSERT commits without holding any advisory lock on Show-C (regression note: sync_apply DOES acquire the lock; this test fixture mimics the raw INSERT pattern only to verify T1's filter). On the NEXT callback invocation (or `claim_oauth_identity` re-call), Show-C is in the new locked set and gets stamped. This pins the R41-R2 R2 HIGH fix.
- **Cookie-mutator allowlist (R41-R6 final §10.1)** — extend `tests/auth/_metaPickerCookieContract.test.ts` to add `app/api/auth/picker-bootstrap/route.ts` to the allowed cookie-mutator file list (alongside `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`). **`app/auth/callback/route.ts` is explicitly BANNED from picker-cookie mutation** — the meta-test asserts the callback route does NOT call `cookies().set('__Host-fxav_picker', ...)` (it CAN read the cookie via `cookies().get()` for diagnostic logging, but never writes). Any other file calling `cookies().set('__Host-fxav_picker', ...)` fails the audit. The middleware file remains explicitly banned per R16 contract.
- **No picker-bootstrap redirect loop (R41-R3 CRITICAL regression; R41-R7 RPC-failure path repaired)** — fixture: user has a `crew_members` row on Show-X with `claimed_via_oauth_at IS NULL` (Doug added them post-sign-in; the OAuth callback never ran for this row). Request flow: (1) GET `/show/<slug-X>/<token-X>` with Google session + NO picker cookie entry for Show-X; (2) page route detects Google session + matching row + no cookie → returns 302 to `/api/auth/picker-bootstrap?next=/show/<slug-X>/<token-X>&t=<token>` (the redirect URL is asserted byte-for-byte to contain `&t=`); (3) follow the redirect; (4) picker-bootstrap verifies intent token (passes), invokes `claim_oauth_identity(email)` which stamps Show-X and returns `{ claimed_count: 1, shows: [{...}] }`; (5) handler mints cookie entry for Show-X + 302 to next; (6) follow the redirect; (7) page route step 6 reads the cookie, returns `{ kind: 'resolved' }`, renders `_ShowBody`. **Assert no third redirect**. **R41-R7 RPC-failure variant** — same fixture but `claim_oauth_identity` simulated to throw infra fault on first call: handler returns 502 + cataloged `PICKER_BOOTSTRAP_RPC_FAILED` terminal-failure HTML page; NO 302; structured log carries the operator code AND `admin_alerts` row is inserted. Test asserts: (a) HTTP status is 502; (b) response body contains the cataloged crew-facing copy; (c) NO `Location` header; (d) NO `Set-Cookie` for `__Host-fxav_picker`; (e) redirect-chain depth is 1 (the initial page → bootstrap; bootstrap stops there, no 502→bootstrap loop). **Without R41-R7 fail-closed**: the buggy alternative would 302 back to next; the page would re-detect Google-session + matching row + still-no-cookie → re-redirect → INFINITE LOOP. The test pins the fail-closed contract.
- **`claim_oauth_identity` locked-set integrity (R41-R3 CRITICAL regression)** — DB-level concurrent test against the array-materialization fix. Fixture: user has crew rows on Show-A and Show-B (locked set initially = {A, B}); Show-C exists with no rows for this user. Concurrent (two parallel transactions): T1 invokes `claim_oauth_identity(email)`; T2 INSERTs a `crew_members` row for the email on Show-C IMMEDIATELY after T1's lock-acquisition pass but BEFORE T1's UPDATE. Assert: (a) T1's `v_locked_show_ids` array does NOT contain Show-C (the array was materialized BEFORE T2's INSERT in T1's snapshot); (b) T1's UPDATE does NOT stamp the Show-C row (the WHERE clause filters `show_id = any(v_locked_show_ids)`); (c) T1's returned `shows` array does NOT contain Show-C — even though a SELECT under READ COMMITTED would find the new row; (d) T2's INSERT commits without affecting T1's result. Next callback for this email DOES stamp Show-C (in the next round's locked set). This pins the R41-R3 R2 CRITICAL fix.
- **Ambiguous-email handling (R41-R3 HIGH regression, R41-R4 expanded for SQL bug, R41-R19 ambiguous-tap-UX corrected, R41-R19 upsert-helper schema fix)** — DB-level test with TWO ambiguous shows in the SAME `claim_oauth_identity` invocation. Fixture: Show-X has 2 `crew_members` rows with email `e@x.com`; Show-Y also has 2 `crew_members` rows with the same email `e@x.com`; Show-Z has 1 row (clean). Test invokes `claim_oauth_identity('e@x.com')`. Assert: (a) the UPDATE stamps ALL FIVE rows; (b) the returned `shows` array contains Show-Z ONLY; (c) **TWO `admin_alerts` rows exist** with `code = 'AMBIGUOUS_EMAIL_BINDING'`, one with `show_id = Show-X`, one with `show_id = Show-Y`, each with `context = jsonb_build_object('email', 'e@x.com')` and `occurrence_count = 1`; **R41-R19 repeated-sign-in regression**: re-invoke `claim_oauth_identity('e@x.com')` a second time → assert each alert row's `occurrence_count` is incremented to 2 (NOT a unique-index violation from raw INSERT — the upsert_admin_alert helper handles the conflict); (d) the next picker-bootstrap-eligible callback mints a picker cookie entry for Show-Z ONLY (callback itself never writes per R41-R6); (e) **R41-R19 correction**: a Google-signed-in user visiting `/show/<slug-X>/<token-X>` sees the SignInOrSkipGate → picker → both ambiguous rows render as deactivated → **tapping either row does NOT navigate (no Location header, no /auth/sign-in redirect)** — the form action is a no-op per the §7.2 R41-R18 deactivated-row contract for ambiguous reason; the aria-label reads "Roster cleanup needed — ask Doug to remove the duplicate"; user recovery requires admin roster cleanup (out-of-pivot scope). Single-ambiguous-show variant: only Show-X ambiguous — asserts exactly one alert + Show-Y/Z minted normally. Zero-ambiguous variant: all shows clean — asserts no alerts emitted.
- **`resolveShowPageAccess` is a pure resolver (R41-R3 HIGH regression)** — static analysis test. Assert: `lib/auth/picker/resolveShowPageAccess.ts` does NOT import (a) `signEnvelope` / `encodeEnvelope` / any other export from `lib/auth/picker/cookieEnvelope.ts`; (b) `cookies` from `next/headers`; (c) the picker-bootstrap route handler or its helpers. The helper's only side effects are SELECTs against the DB; it returns a pure discriminated union. The companion runtime test: invoke `resolveShowPageAccess` with each of the 12 documented chain outcomes and assert the response object matches the expected `kind` discriminator with no `Set-Cookie` header in the calling context.
- **Ambiguous-email avoids redirect loop (R41-R4 HIGH regression, R41-R19 ambiguous-tap-UX corrected)** — fixture: Show-X has 2 `crew_members` rows with the same email `e@x.com`; Google session is signed in as `e@x.com`. Request to `/show/<slug-X>/<token-X>` with NO picker cookie. Tests assert: (a) `resolveShowPageAccess` returns `{ kind: 'ambiguous_email' }` (NOT `needs_picker_bootstrap`); (b) page route does NOT emit a 302 to `/api/auth/picker-bootstrap`; (c) page route renders the SignInOrSkipGate (no `?gate=skip`) OR the picker (with `?gate=skip`); (d) the picker, when rendered, shows BOTH ambiguous rows as deactivated (after `claimed_via_oauth_at` is non-null OR NULL — the deactivation triggers on the same-show-email-count predicate per R41-R6); (e) `validateGoogleSession`'s pre-existing `AMBIGUOUS_EMAIL_BINDING` emission fires (rate-limited downstream is out of pivot scope); (f) **R41-R19 correction**: tapping either deactivated row is a no-op (the form action is `javascript:void(0)` or has no submission target; the browser does NOT navigate to `/auth/sign-in` because that path can't resolve ambiguity — `claim_oauth_identity` omits ambiguous shows from `result.shows`). Recovery requires admin roster cleanup. **Redirect-chain depth assertion**: the response chain from the initial GET is at most 1 hop, AND a subsequent tap on an ambiguous row produces 0 hops (no navigation).
- **Picker-bootstrap CSRF intent-token defense (R41-R4 HIGH regression)** — eight test cases against `/api/auth/picker-bootstrap`: (1) missing `t` param → 403 (NOT 302; CSRF defense MUST fail-closed); (2) `t` malformed (wrong format) → 403; (3) `t` HMAC invalid (key mismatch / tampered) → 403; (4) `t` expired (`exp < now`) → 403; (5) `t` valid but its embedded `{slug, shareToken}` doesn't match the `next` URL's parsed slug+token → 403; (6) all valid, no Google session → 302 to `next` with no cookie set (graceful, NOT 403 — the CSRF check passed; the auth check is a separate concern); (7) all valid, Google session matching crew → cookie minted + 302; (8) **CSRF simulation test**: forge an HTML page on a different origin that includes `<img src="https://app/api/auth/picker-bootstrap?next=/show/<slug>/<token>">`; an authenticated user clicking the page → the image fails to load (403 from server, no cookie mint, no DB write to `claim_oauth_identity`); the test asserts `claim_oauth_identity` was NOT called (DB query log) AND no `Set-Cookie` header was sent. The intent-token defense pins the R41-R4 R2 HIGH fix. **Intent token format spec**: `base64url(JSON({slug, shareToken, exp})) + '.' + base64url(HMAC-SHA256(payload, pickerCookieSigningKey))`. Reuses the same env-var signing key as the cookie envelope (single secret, dual-purpose; the §10.1 picker-cookie meta-test asserts both consumers reference the same constant `PICKER_COOKIE_SIGNING_KEY`).
- **Cookie-write concurrency contract (R41-R6 honest-accounting tests)** — replaces the prior fill-in-the-blanks tests (which over-promised cross-handler merge). Three scenarios using FIXED `Cookie:` request headers (modeling browser snapshot at request-send time, NOT live merge):
  - **Callback writes NO cookies, EVER**: fixture: user has crew rows on Show-A, Show-B. T0: user picks `{Show-A: C-A}` via selectIdentity. T0': in parallel, `/auth/callback` fires after a separate OAuth sign-in tab. Test asserts: (a) the callback response has NO `Set-Cookie` header for `__Host-fxav_picker` — regardless of what the request cookie contained; (b) `claim_oauth_identity` IS called (DB-side stamp); (c) post-callback cookie is unchanged byte-for-byte (it remains `{Show-A: C-A}` from selectIdentity's write). This pins R41-R6's lazy-mint contract: callback NEVER writes picker cookies; the bulk-write race surface is structurally eliminated.
  - **Picker-bootstrap writes ONE SHOW's entry**: fixture: user picks `{Show-A: C-1}` via selectIdentity at T0. Then visits Show-B (a different show) with Google session + email matches Show-B's crew row C-2. Page → bootstrap. Test asserts: (a) bootstrap response sets cookie containing BOTH `{Show-A: C-1, Show-B: C-2}` (Show-A's entry preserved byte-identical because it was in the request cookie); (b) bootstrap does NOT add an entry for any other show even if `claim_oauth_identity` returned `{shows: [A, B, C]}` — the lazy-mint one-show contract is structurally enforced. Cross-show interference is impossible because bootstrap only writes target_show_id.
  - **Picker-bootstrap for Show-X racing selectIdentity for Show-Y (the residual accepted race)**: both writes reset the whole envelope. T0: bootstrap request sent with cookie `{}`. T0': selectIdentity request sent with cookie `{}`. T100: selectIdentity response writes `{Show-Y: pick}`. T200: bootstrap response writes `{Show-X: oauth}` (bootstrap's request cookie was `{}`, so its written envelope has only Show-X). Browser applies last-Set-Cookie-wins: final cookie is `{Show-X: oauth}` — Show-Y's selectIdentity write is LOST. Test asserts: this lost-update IS observable on the wire (no false-merge promise); user-recovery path: re-pick Show-Y from picker. This pins the documented residual race per §4.10 (5) — the test exists to assert the spec's documented behavior, not to claim the race is fixed.
  - **Same-show race, picker-bootstrap vs selectIdentity for Show-A**: T0: bootstrap and selectIdentity both started for Show-A with cookie `{}`. Bootstrap resolves to C-2 (OAuth match); selectIdentity attempted to pick C-1. Whichever response writes last wins on the browser. Test asserts: post-race cookie is either `{Show-A: C-1}` (selectIdentity wins) OR `{Show-A: C-2}` (bootstrap wins) — both are valid outcomes. The deactivation contract on subsequent renders fires regardless because `claimed_via_oauth_at` is stamped server-side.
- **Stale-credential mapping across all API consumers (R41-R8 expanded)** — for every route in §6 that calls `resolvePickerSelection` (subscriber-token, version, asset/{diagram,reel,agenda}, report), the test matrix asserts: (a) `kind: 'epoch_stale'` → 401 with no resource body; (b) `kind: 'removed_from_roster'` → 401 with no resource body; (c) `kind: 'identity_invalidated', reason: 'claimed_after_pick'` → 401; (d) `kind: 'identity_invalidated', reason: 'email_ambiguous'` → 401; (e) `kind: 'show_unavailable'` → 410; (f) `kind: 'infra_error'` → 500; (g) `kind: 'no_selection'` → 401 (no credential at all). Each status is distinguishable on the wire so `ShowRealtimeBridge` can treat 401 as `forceRefresh` and 410 as "this show is gone."
- **Pre-claim picker cookie is invalidated after OAuth claim (R41-R8 HIGH regression)** — three sub-scenarios:
  - **Sub-A: a user picked bypass identity, then a different user signs in via OAuth for that identity**. Fixture: T0: Mallory picks Alice's crew row via selectIdentity; Alice's `claimed_via_oauth_at` is NULL, so the pick succeeds; Mallory's cookie has `{Show-X: {id: Alice's crew id, e: 1, t: 100}}`. T1 (later): Alice signs in via Google OAuth; callback fires `claim_oauth_identity`; Alice's row's `claimed_via_oauth_at = 200` (later than 100). T2: Mallory's browser makes a request to `/show/<slug-X>/<token-X>` or any API consumer for Show-X with her T0 cookie. Tests assert: (a) `resolvePickerSelection` returns `{ kind: 'identity_invalidated', reason: 'claimed_after_pick' }` — derived from `cookie.t (100) < extract(epoch from claimed_via_oauth_at) (200)`; (b) page route renders the picker with the `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` banner; (c) Mallory's row for Alice (deactivated per §7.2 R41-R6 because `claimed_via_oauth_at IS NOT NULL`) cannot be re-picked; (d) any API consumer returns 401; (e) the `cleanupStaleEntry` Server Action receives the right `expectedEpoch + expectedCrewMemberId` and compare-and-deletes Mallory's stale entry on auto-submit.
  - **Sub-B: a user picks bypass identity that is on a duplicated-email roster**. Fixture: Show-Y has duplicate `crew_members` rows for email `e@y.com` (rows B1 and B2). User picks B1 via selectIdentity at T0 BEFORE the spec's R41-R6 ambiguity check was active (hypothetical legacy cookie — the new selectIdentity check WOULD reject this, but pre-existing cookies might predate the check deploy). At T1, a request arrives with the legacy cookie. Tests assert: (a) `resolvePickerSelection` returns `{ kind: 'identity_invalidated', reason: 'email_ambiguous' }`; (b) page renders `PICKER_IDENTITY_AMBIGUOUS_BANNER`; (c) API consumers return 401; (d) both B1 and B2 render as deactivated in the re-rendered picker.
  - **Sub-C: the OAuth user's OWN cookie is preserved (negative regression)**. Fixture: Alice signs in via OAuth at T1 (`claimed_via_oauth_at = 200`); callback stamps her row; picker-bootstrap mints her cookie at T2=210 (after the claim). Alice visits Show-X. Tests assert: (a) `resolvePickerSelection` returns `{ kind: 'resolved' }` (NOT `identity_invalidated`) because `cookie.t (210) >= claim_epoch (200)`; (b) page renders `_ShowBody`; (c) API consumers return 200. This is the critical exclusion that makes the post-claim invalidation safe for the legitimate identity holder.
- **Shared-device shadow scenario (R41-R9 HIGH regression)** — fixture: Alice has a valid picker cookie on this device for Show-X with `{id: AliceCrewId, e: 1, t: 100}` (selected via the bypass picker; Alice's row is NOT OAuth-claimed). Now Bob signs in via Google OAuth on the same device. Bob's email matches a DIFFERENT crew row `BobCrewId` on Show-X. Bob visits `/show/<slug-X>/<token-X>`. Tests assert: (a) `resolveShowPageAccess` does NOT return `{ kind: 'resolved' }` despite the cookie being present (R41-R9 branch b' — cookie's `id != matched crew_member_id`); (b) the helper returns `{ kind: 'needs_picker_bootstrap' }` instead; (c) page redirects to `/api/auth/picker-bootstrap?next=...&t=...`; (d) bootstrap mints Bob's cookie entry for Show-X (overwrites Alice's entry — same target_show_id); (e) Bob lands on the show body rendered as Bob, not Alice; (f) Alice's other cookie entries for other shows (if any) are preserved byte-identical (the one-show-write contract holds).
- **Same-user OAuth upgrade scenario (R41-R11 HIGH regression)** — fixture: Bob picks himself via the bypass picker at T0=100 — cookie has `{Show-X: {id: BobCrewId, e: 1, t: 100}}`; Bob's `claimed_via_oauth_at` is NULL at this point. At T1=200 Bob signs in via Google on the same device; OAuth callback fires `claim_oauth_identity` which stamps Bob's row's `claimed_via_oauth_at = 200`. Per R41-R6, callback does NOT mint a new cookie — Bob's cookie still has t=100, predating the claim at 200. Bob visits Show-X. **Without R41-R11**: step 4(b) would let the cookie path resolve (id matches), but `resolvePickerSelection` would reject with `identity_invalidated, claimed_after_pick` because cookie.t=100 < claim_epoch=200; Bob would see the claimed-identity banner and his OWN row deactivated, blocking his legitimate upgrade. **With R41-R11**: step 4(b) checks BOTH id-equality AND cookie.t >= claim_epoch. Cookie.t=100 < 200, so branch b' fires → `needs_picker_bootstrap`. Bootstrap mints Bob's fresh cookie at T2=210 (t > claim_epoch). Bob lands on Show-X rendered as Bob. Tests assert: (a) step 4 returns `needs_picker_bootstrap` (NOT cookie path); (b) bootstrap response sets `__Host-fxav_picker` with `{id: BobCrewId, e: 1, t: ~210}`; (c) follow-up page request to Show-X resolves to `{ kind: 'resolved', crewMemberId: BobCrewId }`; (d) the deactivation contract on the picker no longer applies because the show body renders directly (no picker render path).
- **Callback RPC failure retry via bootstrap (R41-R12 HIGH regression)** — fixture: Bob picks himself at T0=100 (cookie has `{id: BobCrewId, t: 100}`; Bob's row's `claimed_via_oauth_at` is NULL). At T1, Bob signs in via Google; callback fires `claim_oauth_identity` BUT the RPC throws an infra fault — Bob's row remains `claimed_via_oauth_at = NULL`. Bob is left signed-in but his identity is NOT yet claimed. Bob visits Show-X. **Without R41-R12**: step 4(b) accepts the cookie (id matches; cookie.t >= NULL-coerced-zero is true; "row is not claimed yet" was accepted by the prior contract); resolvePickerSelection returns `resolved`; page renders; bootstrap is NEVER invoked; the claim never retries; Bob's identity is never locked from other devices. **With R41-R12**: step 4(b) requires `claimed_via_oauth_at IS NOT NULL`. Bob's row is NULL → branch b'(ii) fires → `needs_picker_bootstrap` → bootstrap invokes `claim_oauth_identity` (idempotent retry) → on success, stamps Bob's row + mints fresh cookie → page renders with claimed identity. Tests assert: (a) step 4 returns `needs_picker_bootstrap` even when cookie's id matches the Google session (because the row is NULL-claimed); (b) bootstrap calls `claim_oauth_identity` (DB query log assertion); (c) after the retry succeeds, the row's `claimed_via_oauth_at` is non-null; (d) bootstrap mints a fresh cookie + 302s back; (e) follow-up page request resolves to `_ShowBody`. **Persistent RPC failure variant**: if bootstrap's retry of `claim_oauth_identity` also fails → R41-R7 fail-closed contract: bootstrap returns 502 with cataloged `PICKER_BOOTSTRAP_RPC_FAILED` page (not a redirect — no loop). User retries on next visit.
- **Concordant cookie no-op (R41-R9 negative regression)** — fixture: Alice signs in via Google AFTER her cookie was already minted via picker-bootstrap (T1 cookie t=210; her claim_epoch is 200; t > 200 so cookie is post-claim). Alice visits Show-X. Tests assert: (a) step 4(b) takes the cookie path (id matches AND cookie.t >= claim_epoch); (b) no redirect to bootstrap; (c) page renders directly. This guards against unnecessary redirects when the cookie is already correct.
- **No middleware cookie writes** (R16 contract; R41-R20 four-mutator scope) — middleware.ts MUST NOT emit a `Set-Cookie` header for `__Host-fxav_picker` on any route. Test: for every route in the §6 routing table (page route, asset routes, version, subscriber-token, report), simulate a request carrying a valid picker cookie; assert the response Set-Cookie header for `__Host-fxav_picker` is absent UNLESS the route handler is one of the four legal mutators: `selectIdentity`, `clearIdentity`, `cleanupStaleEntry` Server Actions, OR `/api/auth/picker-bootstrap` Route Handler. Additionally assert `/auth/callback` emits no picker Set-Cookie (R41-R6 callback-is-DB-only contract). This pins the "four-surface cookie mutator" invariant.
- **`resetPickerEpoch` emits no picker Set-Cookie** (R30 contract) — invoke the admin Reset action; assert the response has NO `Set-Cookie` header for `__Host-fxav_picker`. Regression against the lost-update race that would result if the admin Reset path were a cookie mutator.
- **Cross-origin Server Action attempts are rejected** (R32 contract) — for each of `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`, POST a forged request with an `Origin` header outside `serverActions.allowedOrigins`. Assert: (a) Next.js's same-origin guard returns the standard rejection (typically 400 or 403); (b) no `Set-Cookie` for `__Host-fxav_picker` is emitted; (c) the cookie's pre-attempt value is unchanged on subsequent reads.
- **Server Action cookie refresh on selection** — `selectIdentity` writes Set-Cookie with `Max-Age=7776000` AND the entry's `t` advanced to current unix-seconds. Test: invoke `selectIdentity`, assert the emitted Set-Cookie header carries the fresh Max-Age value and the entry's `t` field is newer than its pre-action value.
- **`cleanupStaleEntry` Server Action (compare-and-delete; §4.9 R22 contract; R41-R15 trigger-set expanded)** — accepts `{ showId, expectedEpoch, expectedCrewMemberId }`. When the current cookie's entry for `showId` matches BOTH `expectedEpoch` AND `expectedCrewMemberId`, the entry is removed. When the envelope becomes empty, the cookie is fully cleared (`Max-Age=0`). When called for an entry that has different values (newer `e` or `id` than expected — i.e., `selectIdentity` won the race), the action is a no-op (idempotent). Race test: render picker (stale entry `{e:1, id:A}`); concurrently invoke `selectIdentity({showId, crewMemberId: B})` (writes `{e:2, id:B}`); delayed auto-submit cleanup with `{expectedEpoch:1, expectedCrewMemberId:A}` arrives; asserts the cookie still carries `{e:2, id:B}` (the fresh selection is preserved). **R41-R15 trigger-set expansion test**: the auto-submit-on-mount fires for ALL FOUR stale-state kinds rendered by the picker (`epoch_stale`, `removed_from_roster`, `identity_invalidated/claimed_after_pick`, `identity_invalidated/email_ambiguous`). Test fixture renders the picker in each of the four states (one render per state) and asserts: (a) `<StaleCleanupAutoSubmit>` is mounted in the DOM with the correct `expectedEpoch` + `expectedCrewMemberId` props; (b) the auto-submit POST fires; (c) the cookie entry is deleted; (d) on subsequent page reload, the cookie's entry for this show is gone and the resolver returns `no_selection` (the picker re-renders in initial mode, not a stale-banner mode). Without R41-R15 trigger-set expansion, `identity_invalidated` states would render the banner but never clear the cookie, leading to a sticky bad-state UX.
- **Reset action advisory-lock holder topology** — extension to `tests/auth/advisoryLockRpcDeadlock.test.ts` asserts the lock is acquired inside the SECURITY DEFINER RPC `public.reset_picker_epoch_atomic` body at exactly one layer; the JS-side Server Action wrapper makes NO advisory-lock call and uses NO `lockedShowTx`/equivalent wrapper around the `.rpc()` invocation; `public.reset_picker_epoch_atomic` AND `public.rotate_show_share_token` are the only writers of `shows.picker_epoch` and `shows.picker_epoch_bumped_at` in the repo (R40 — rotate also bumps the epoch).
- **Rotate share-token action (R39/R40 amendment)** — `tests/auth/_metaInfraContract.test.ts` registers `rotateShareToken`; `tests/auth/advisoryLockRpcDeadlock.test.ts` asserts `rotate_show_share_token` acquires the lock at exactly one layer inside its SECURITY DEFINER body. Functional tests: (a) admin clicks Rotate → response carries new `share_token` matching `^[0-9a-f]{64}$` AND new `picker_epoch` integer; (b) the OLD URL `/show/<slug>/<old-token>` now returns 404 (`resolve_show_by_slug_and_token` returns NULL); (c) the NEW URL succeeds; (d) **a picker cookie minted BEFORE rotation is rejected on every API consumer post-rotation** (subscriber-token, asset/{diagram,reel,agenda}, version, report) — the cookie's `e` ≠ new `picker_epoch` → 401 (regression test for the R40 critical fix); (e) non-admin caller → 401/403.

### 10.3 Layout-dimensions task (mandatory per AGENTS.md)

A dedicated TDD task adds a Playwright test that:

1. Boots the picker route with a fixture show + 8-row roster.
2. Calls `getBoundingClientRect()` on `picker-roster-row`, the row's inner name span, and the row's role chip.
3. Asserts:
   - Row height ≥ 44px (parent-set min-height).
   - Inner spans vertically centered within the row (`top + height/2` within 0.5px of row's center).
   - Chip's right edge is within 12px of the row's right edge (the row's right padding).
   - Banner row, when rendered, is full-width to the picker block (no horizontal overflow).
4. Repeats the assertions on a 390px viewport AND on a 768px viewport — picker block max-width changes between the two; row dimensions stay constant.

Jest+jsdom alone is not sufficient (per AGENTS.md). The Playwright assertion is mandatory.

### 10.4 Transition-audit task (mandatory per AGENTS.md)

A dedicated TDD task enumerates every conditional render and `AnimatePresence` in the picker component tree and asserts:

1. `<PickerInterstitial>` is a pure server render — no `'use client'`. **Exception**: `<StaleCleanupAutoSubmit>` (the cleanup-form auto-submit client component per §4.9 R25 amendment) is the only `'use client'` component in the picker tree; the transition-audit task allowlists this single client component.
2. The banner row's conditional render `{bannerMessage && <Banner ...>}` has no exit animation (it's instant on render — there's no "banner mounting after the picker mounted" case in v1).
3. The `<form action={serverAction}>` submission triggers a route revalidation, not a client animation.
4. The `<IdentityChip>` "Not you?" form similarly has no animation.

Compound transitions enumerated in §7.8 each get a regression test in this task.

### 10.5 Anti-tautology rule for tests

Per AGENTS.md writing-plans addition:

- The LEAD-chip-color test asserts the chip's computed `background-color` against an FXAV-orange OKLCH value (the canonical token from `DESIGN.md`), NOT against a literal `bg-orange-500` class name. (Otherwise the test passes when someone wires a literal `bg-orange-500` even though the design token has been retuned.)
- The picker-roster-row count test derives expected count from `fixture.crew_members.length`, NOT from a hardcoded number — works across all parameterizations of the fixture.
- The "removed from roster" banner test removes a crew member from the fixture AND asserts the banner copy comes from `messageFor(...)` rather than checking a hardcoded string in the test, so a copy update in the catalog flows through.
- The `viewer_version_token` test derives expected ordering from the timestamps it stamps in, not from a literal numeric value.

### 10.6 Build-vs-runtime gate explicitness (per AGENTS.md)

The picker has no build-time gates. All behaviour is runtime. The only env-gated affordance is `requireAdmin()`'s build-time email allowlist, which is unchanged from M5–M11.

---

## 11. Open questions

At convergence of the spec self-review + adversarial review, this section should be near-empty. Items here are decisions the owner explicitly tabled for a later milestone:

1. **Search/typeahead on the picker** — deferred to v2 if rosters grow past ~25. Tracked in `BACKLOG.md` after spec ratification.
2. **Audit log of picker selections** — deferred to v2 if Doug ever asks for "who picked what on which device." Tracked in `BACKLOG.md`.
3. **Per-device naming or "manage my devices"** — deferred indefinitely. No expected use case.

---

## Appendix A — Live-code citation index

Every external reference the body of the spec depends on, gathered for self-review:

| Citation | File:line | Used in |
| -------- | --------- | ------- |
| Owner determination text | `PRODUCT.md:69-83` | Intro, §1, §3 |
| Parent spec amendment block-quote | `2026-04-30-fxav-crew-pages-design.md:7-10` | Intro |
| Parent spec §7.2 signed-link format (obsolete) | `2026-04-30-fxav-crew-pages-design.md:1926` | §6 |
| Parent spec §7.4 role-derivation contract (kept) | `2026-04-30-fxav-crew-pages-design.md:2307-2316` | §1, §4.1 |
| Parent spec §7.3 routing table | `2026-04-30-fxav-crew-pages-design.md:2288-2306` | §6 |
| Parent spec §8 Realtime contract | `2026-04-30-fxav-crew-pages-design.md:2328-2345` | §4.6 |
| Parent spec cookie-name growth reasoning | `2026-04-30-fxav-crew-pages-design.md:1949` | Resolved Decision 4 |
| `shows` table DDL | `supabase/migrations/20260501000000_initial_public_schema.sql:3-29` | §5.1, Resolved Decision 8 |
| `crew_members` table DDL | `supabase/migrations/20260501000000_initial_public_schema.sql:31-47` | §6.1, §7.5 |
| `crew_member_auth` table DDL | `supabase/migrations/20260501001000_internal_and_admin.sql:8-16` | §5.2, Resolved Decision 11 |
| `link_sessions` / `bootstrap_nonces` / `revoked_links` DDL | `supabase/migrations/20260501001000_internal_and_admin.sql:107-136` | §5.2, Resolved Decision 12 |
| `viewer_version_token` function | `supabase/migrations/20260501001000_internal_and_admin.sql:18-30` | §4.6, §5.3 |
| `publish_show_invalidation_after_statement` | `supabase/migrations/20260501001000_internal_and_admin.sql:59-81` | §5.4 |
| `crew_member_auth_publish_invalidation` triggers | `supabase/migrations/20260501001000_internal_and_admin.sql:83-93` | §5.4 |
| `SESSION_COOKIE_NAME` constant (retired) | `lib/auth/constants.ts:1` | §4.10 |
| `setSessionCookie`/`clearSessionCookie` helpers (retired) | `lib/auth/cookies.ts:15-22` | §4.10 |
| `decodeSessionCookieValue` strict-shape decoder pattern | `lib/auth/cookies.ts:27-34` | §4.7 (mirrored), §6.1 |
| `resolveShowViewer` chain | `lib/auth/resolveShowViewer.ts:65-193` | §4.1 |
| `isAdminSession` precedence at top of chain | `lib/auth/resolveShowViewer.ts:123-126` | §4.1, §6 |
| `validateLinkSession` (retired) | `lib/auth/validateLinkSession.ts` (entire file) | §4.10 |
| `getShowForViewer` `Viewer` discriminated union | `lib/data/getShowForViewer.ts:79-92` | §4.1 |
| `getShowForViewer` role-derivation read | `lib/data/getShowForViewer.ts:218-230` | §1, §4.1 |
| `app/show/[slug]/page.tsx` chain (modified) | `app/show/[slug]/page.tsx:73-89` | §4.1 |
| `PerShowCrewSection.tsx` (simplified) | `components/admin/PerShowCrewSection.tsx` (173 lines) | §8.1, §8.3 |
| `IssueLinkButton.tsx` (deleted) | `app/admin/show/[slug]/IssueLinkButton.tsx` (92 lines) | §4.10 |
| `RevokeAllLinksButton.tsx` (deleted) | `app/admin/show/[slug]/RevokeAllLinksButton.tsx` (196 lines) | §4.10 |
| `middleware.ts` leaked-link handler (deleted) | `middleware.ts` (228 lines) | §4.10 |
| `/api/auth/redeem-link/route.ts` (deleted) | `app/api/auth/redeem-link/route.ts` (394 lines) | §4.10 |
| `ShowRealtimeBridge` (auth-source swap only) | `components/realtime/ShowRealtimeBridge.tsx:179` | §4.6 |
| `/api/realtime/subscriber-token` (auth-source swap only) | `app/api/realtime/subscriber-token/route.ts:47` | §4.6 |
| `requireAdmin` | `lib/auth/requireAdmin.ts` | §4.5, §6.2 |
| WCAG 2.5.5 inline exception | `PRODUCT.md:59` | §7.2 |
| `DESIGN.md` `--accent` token (FXAV orange) | `PRODUCT.md:42-47` | Resolved Decision 3, §7.2 |
| AGENTS.md invariants 5, 8, 9 | `AGENTS.md` | §10, §6.2 |
| AGENTS.md cross-cutting "PostgREST DML lockdown" | `AGENTS.md` (cross-cutting discipline section) | §5.6 |
| AGENTS.md cross-cutting "Same-vector recurrence" | `AGENTS.md` (writing-plans additions section) | §10 (informs structural defense ladder) |

---

## Appendix B — Numeric sweep (per AGENTS.md spec self-review addition)

Every literal number in this spec, anchored to its single source:

| Number | Where | Source |
| ------ | ----- | ------ |
| 90 days | Cookie sliding TTL (Max-Age=7776000) | Resolved Decision 5 |
| 3800 bytes | Cookie byte-budget cap (encoded value, including name prefix) | Resolved Decision 6 |
| 3900 bytes | Hard ceiling for the budget constant (meta-test guards against raising past this without comment) | Resolved Decision 6 |
| 4096 bytes | Browser per-cookie cap | Resolved Decision 6 |
| 7776000 seconds | `Max-Age` value (90 days × 86400) | Resolved Decision 5, §4.9 |
| 44px | Row min-height (WCAG 2.5.5) | §7.7 |
| 0.5px | Playwright tolerance | §10.3 |
| 4 KB | Browser cookie limit (~80 bytes × 50) | Resolved Decision 6 |
| 16px | Picker block horizontal padding | §7.1 |
| 360px | Picker block max-width (mobile) | §7.7 |
| 480px | Picker block max-width (tablet+) | §7.7 |
| 568px | Mobile/tablet breakpoint | §7.7 |
| 12px | Picker row horizontal padding inside button | §7.2 |
| 11px | Picker row vertical padding | §7.2 |
| 5px | Inter-row vertical gap | §7.2 |
| 9px | Row border-radius | §7.2 |
| 8px / 7px / 2px | Chip padding | §7.2 |
| 1px | Row border | §7.2 |
| 999px | Chip border-radius (pill) | §7.2 |
| 60 days post-showclose | (NOT USED — see Resolved Decision 8: link is live for the show row's lifetime) | — |
| Roster cap | NONE (`<unique (show_id, name)>` constraint is the only natural limit) | §7.5 |
| File sizes for deletion budget | 92 + 196 + 228 + 394 + 173 (modified) + ~575 (modified) ≈ 1,658 lines | §4.10 |

The 60-day-post-showclose number from an earlier draft of Resolved Decision 8 was retired in the brainstorm — Decision 8 is "live forever as long as the show row exists." This appendix entry is the canonical "removed" marker to prevent the number from being reintroduced silently.

---

## Appendix C — Disagreement-loop preempts (per AGENTS.md spec self-review)

Contracts a reviewer is likely to relitigate, paired with the precedent citation:

- **"Why no per-person revocation?"** Owner determination at `PRODUCT.md:73`. Threat model relaxation is explicit. Do not re-argue.
- **"Why a Server Action instead of a `/api/picker/select` route?"** Next 16 App Router idiom; degrades gracefully without JS; keeps cookie write atomic with route invalidation. Documented in §4.3. Do not re-argue.
- **"Why drop `crew_member_auth` instead of repurposing it for the epoch?"** The table existed solely for JWT versioning. The new column `shows.picker_epoch` is per-show, not per-crew-member; it belongs on `shows`. Documented in Resolved Decision 11 and §5.1.
- **"Why is the show-link permanent rather than time-limited?"** Owner answer in the brainstorm (Decision 8): "live forever as long as show row exists." Doug controls the kill switch via `shows.archived`.
- **"Why is the picker an interstitial route rather than a modal?"** Brainstorm Resolved Decision 2 + §4.1 (admin precedence + `_ShowBody` reuses identity without learning about cookies). Do not re-argue.
- **"Why aren't we shipping a compat window for legacy `#t=` URLs?"** Owner confirmed the app has not shipped; there are no legacy URLs in the wild. §9.1.
- **"Why a Reset button instead of per-device management?"** No server-side selection log exists (§8.2). The epoch is the simplest possible whole-show invalidator. Do not re-argue per-device management; it requires server-side per-device state that v1 doesn't carry.
- **"Why doesn't this spec fix the `SHOW_FIRST_PUBLISHED` catalog entry's phantom 'click Unpublish in this email within 24 hours' wording?"** Out of pivot scope. The phantom-email-action class is a known M11 close-out concern tracked separately by the ongoing `tests/help/forbidden-prose-registry.test.ts` work the user is iterating on. The pivot deletes only catalog entries scoped to JWT/redeem-link/leaked-link surfaces (per §4.10 + §8.4); `SHOW_FIRST_PUBLISHED` is a sync/onboarding code outside that surface and stays in the catalog post-pivot with its M11 repair tracked in its own thread. R6 review surfaced this as a class-sweep adjacency, not a pivot deliverable.
- **"Why doesn't this spec pre-emptively extend the forbidden-prose registry to ban the current `LEAKED_LINK_DETECTED` 'Issue new link / send a fresh one' copy?"** Same disposition. `LEAKED_LINK_DETECTED` is in the pivot's deletion list (§4.10 + §8.4) — the catalog entry disappears entirely when the implementation plan executes. Extending the registry to fail on M11-shipped copy NOW would break M11 close-out without buying anything; the plan deletes both the code path and the catalog entry in the same commit, and the new `tests/cross-cutting/no-jwt-surface.test.ts` meta-test bans `LEAKED_LINK_DETECTED` as a literal substring post-cutover. R12 review surfaced this as a class-sweep adjacency.
- **"Why doesn't this spec broaden the forbidden-prose registry's regex to catch 'click ‘Unpublish’ in this email within 24 hours' in any word order?"** Same disposition as the two above. The registry guard's false-negative for that specific phrasing is M11 in-flight work (the user's M11 catalog repair is ongoing in parallel with this pivot); the pivot's own no-jwt-surface meta-test does NOT depend on the registry catching that phrase, because the pivot deletes the JWT-era catalog entries it covers via direct substring bans on the code names (`LEAKED_LINK_DETECTED`, etc.). The R18 surfacing of this is acknowledged as a class-sweep adjacency; the registry tightening properly lands in the M11 close-out thread, not here.
- **"Why doesn't this spec extend the forbidden-prose registry's URL-distribution regex to catch 'send fresh URL' / 'send URL to crew member' variants?"** Same disposition class. The R25 finding identifies a false-negative in the M11 `share-the-url-channel` regex (which matches "share the ... URL" but not "send fresh URL"). The pivot's protection against the SPECIFIC phantom-URL phrasing in `LEAKED_LINK_DETECTED` is the no-jwt-surface meta-test's substring ban on the catalog code itself (post-cutover); the broader regex tightening that would catch future re-introductions in OTHER codes is M11 close-out scope. R25 review noted this is class-sweep adjacency, not a pivot-blocking defect.
- **"Why is OAuth Google sign-in restored as an optional crew identity after R14/R15 deleted it?"** R41 owner determination on 2026-05-23: the workflow tradeoff between Doug's one-link-per-show ergonomics and crew's cross-show discovery via `/me` is resolved by treating Google sign-in as an OPTIONAL identity layer, not a required credential. The show-link + picker path remains the primary auth surface (R34/R35 contracts unchanged); Google sign-in is one additional door that, when used, claims the user's identity permanently and offers cross-show enumeration. The structural allowlist in `tests/cross-cutting/no-jwt-surface.test.ts` (R41 amendment, §10.1) pins the SET of files allowed to import `validateGoogleSession` and `listShowsForCrew`; new callers fail CI. Do not re-argue R41 — it reverses R14/R15 by explicit owner consent on the workflow constraint that R14/R15 never had visibility into.
- **"Why is the picker still the primary path if Google sign-in resolves identity for free?"** Per §4.1 step ordering: a Google session matching a crew row auto-resolves (step 4) — but most crew never sign in, because Doug's show-link is the only credential they need. The SignInOrSkipGate (§7.1a) presents both options at first contact and lets the user choose; the workflow does not REQUIRE sign-in. The picker is the path for users who skip the sign-in (most v1 users); auto-resolution is the path for users who chose to sign in (cross-show power users). Both are first-class; neither is fallback.
- **"Why is `claimed_via_oauth_at` permanent rather than time-limited?"** Owner determination on R41 confirmation: "Permanent. It's not likely that users will lose access to their Google account and if they do we should introduce some easy UX to address it." Account-loss recovery is future-milestone scope (not pivot scope); the v1 contract is permanent claim. Do not re-argue.

---

## Appendix D — Flag lifecycle table (per AGENTS.md)

For every boolean / config field this spec touches or introduces:

| Flag | Storage | Write path | Read path | Effect on output |
| ---- | ------- | ---------- | --------- | ---------------- |
| `shows.published` | column | sync engine; admin actions | `resolvePickerSelection`, `selectIdentity` | If `false`, picker selection is rejected; route 404s for non-admin viewers |
| `shows.archived` | column | admin action | route handler at `app/show/[slug]/page.tsx` | If `true`, route 404s for all viewers including admin (existing behaviour) |
| `shows.picker_epoch` | column (new) | `resetPickerEpoch` Server Action | `resolvePickerSelection`, `selectIdentity` | Mismatch with cookie's `e` triggers `epoch_stale` re-prompt |
| `crew_members.role_flags[]` | column | sync engine | `getShowForViewer` (re-derived every request) | Drives LEAD detection for chip styling AND financials inclusion |
| `__Host-fxav_picker` cookie | client | 3 Server Actions (`selectIdentity`, `clearIdentity`, `cleanupStaleEntry`) AND 1 Route Handler (`/api/auth/picker-bootstrap`) — R41-R6 final list. `/auth/callback` is NOT a mutator. | `resolvePickerSelection`, `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`, `resolveShowPageAccess` | Carries per-show selection state. Server Components are NOT in the mutator list (Next App Router contract). |
| `crew_members.claimed_via_oauth_at` (R41) | column (new, TIMESTAMPTZ NULL) | `claim_oauth_identity()` SECURITY DEFINER RPC, invoked from `/auth/callback` post-success | Picker render (`PickerInterstitial` reads it to render row as deactivated); future cross-show auto-resolve | Non-null → picker row renders as deactivated (`var(--muted-foreground)`, lock icon, form action → `/auth/sign-in`); null → row is fully selectable |
| `?gate=skip` URL query param (R41) | URL (not persisted) | Crew clicks "Skip" on `<SignInOrSkipGate>` | Route handler at `/show/[slug]/[shareToken]/page.tsx` | Presence with no auth → render picker; absence with no auth → render gate |

No zombie flags introduced. No flag is written but never read. The R41 column `claimed_via_oauth_at` is written by `claim_oauth_identity()` (one path) and read by both the picker render and (future) cross-show auto-resolve helpers — both consumers active in v1.
