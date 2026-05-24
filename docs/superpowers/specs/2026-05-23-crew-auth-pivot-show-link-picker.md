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
- **Per-device sticky identity.** Selection persists in a host-wide cookie (`__Host-fxav_picker`) carrying a combined JSON map keyed by `show_id`. 90-day `Max-Age` refreshed by the FIVE R41-R41 cookie-mutator surfaces (three crew-side Server Actions + `/api/auth/picker-bootstrap` Route Handler + `/auth/sign-out` Route Handler which uniquely writes `Max-Age=0` to clear the credential) only — middleware refresh removed in R16 (lost-update race); `/auth/callback` is DB-stamp-only per R41-R6. Picker is a one-time gate per device per show until the cookie expires or sign-out clears it.
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
4. **Cookie shape: `__Host-fxav_picker` carrying an HMAC-signed versioned JSON envelope (R36 amendment; R41-R22 millisecond precision).** Inner wire form: `{ "v": 1, "selections": { "<show_id_uuid>": { "id": "<crew_member_id_uuid>", "e": <picker_epoch_int>, "t": <unix_millis_bigint> } } }`. **R41-R22 precision change**: `t` is unix MILLISECONDS (NOT seconds). Earlier drafts used seconds, but the resolver's claimed-after-pick comparison (cookie.t vs claim_epoch) at second-resolution allowed a same-second bypass-then-claim sequence to collapse the comparison and let an impersonation cookie pass. Millisecond precision combined with the R41-R22 strict-greater bootstrap-mint contract (below) makes the comparison fail-closed. The cookie's actual value is `<base64url(payload)>.<base64url(hmac_sha256(payload, secret))>`. **R41-R20 + R41-R22 mint-path contract** — two surfaces mint a valid cookie:

   - **`selectIdentity` Server Action** (bypass-pick path): uses `select_identity_atomic.observed_at_millis` (DB-side; sourced from `clock_timestamp()` evaluated INSIDE the per-show advisory lock — R41-R18 base, R41-R23 clock-source fix). The bypass cookie's `t` reflects the wall-clock moment IS-NULL was observed AFTER the lock was held. R41-R23 corrects an earlier `now()`-based draft that used transaction-start time (which could predate the lock acquisition under lock contention, allowing impersonation).
   - **`/api/auth/picker-bootstrap` Route Handler** (lazy-mint path for Google-signed-in users): uses `claim_oauth_identity.mint_safe_t_millis` returned by the RPC. The RPC computes `mint_safe_t_millis = greatest(clock_timestamp_millis, max(claimed_via_oauth_at_millis)) + 1` (R41-R23 — uses `clock_timestamp()` evaluated AFTER all the user's show locks are acquired; strictly greater than any extant `claimed_via_oauth_at`). Bootstrap stamps cookie.t = mint_safe_t_millis directly (NOT JS Date.now()).

   Both surfaces use the same envelope signer and the same 90-day Max-Age. The `t` field is the unix-millisecond timestamp of the entry's last touch. It is the LRU sort key when the byte-budget cap (Resolved Decision 6) is hit. URL-encoded into the cookie value. Single host-wide cookie (no per-show cookie names).
5. **TTL: 90 days; FIVE cookie-mutator surfaces (R41-R41 expanded for sign-out credential-clear).** `Max-Age=7776000` re-emitted by (a) the three crew-side Server Actions — `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`; (b) one R41-R6 Route Handler — `/api/auth/picker-bootstrap` (R41-R20 amendment); (c) **`/auth/sign-out` Route Handler** (R41-R41 amendment) which emits `Max-Age=0` to CLEAR the picker cookie at sign-out time. Sign-out is the only mutator that writes `Max-Age=0` (every other mutator extends the TTL). **NOT** re-emitted by middleware (R16), NOT by `resetPickerEpoch` (R30), NOT by `/auth/callback` (R41-R6 — callback is DB-stamp-only; cookies mint lazily on first show visit via picker-bootstrap). The §10.1 picker-cookie-contract meta-test asserts all FIVE surfaces use the same envelope signer; sign-out is the only one writing `Max-Age=0`.
6. **Cap: byte-budget LRU eviction (target ≤ 3800 bytes encoded), not a fixed entry count.** On every write that would grow the cookie, the encoder iteratively evicts the entry with the lowest `t` (last-touch unix-milliseconds — R41-R22 precision per §6.0) until the final URL-encoded `Set-Cookie` value (including the cookie name `__Host-fxav_picker=` prefix) is at or below 3800 bytes. The 3800-byte target sits comfortably below the 4096-byte (4 KB) browser per-cookie cap with ~300 bytes of safety margin for the `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Max-Age=7776000` attribute suffix. **An earlier draft of this spec stated a fixed 50-entry cap based on a back-of-envelope ~80-byte-per-entry estimate; that estimate undercounted by ~25%.** Real per-entry size (UUID show key + UUID crew id + `e` + `t`, URL-encoded) is ~106 bytes encoded; 50 entries would be ~5.3 KB raw / ~7.2 KB after `encodeURIComponent` overhead, exceeding the browser cap. The byte-budget approach is robust to JSON-encoding overhead changes and works regardless of the actual entry count (which will land near 35 at the cap given current entry sizing). The encoder helper exposes a `MAX_COOKIE_VALUE_BYTES = 3800` constant; a structural meta-test asserts the constant is never raised beyond 3900 without a paired comment explaining the browser-cap implication.
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
14. **Server Action drives selection (R41-R33 + R41-R34 locked-RPC contract; R41-R35 ambiguous-email check removed).** `selectIdentity({ slug, shareToken, crewMemberId })` (Next 16 App Router idiom). **R37 base, R41-R33 redesign**: the action's body is a SINGLE locked RPC call — `select_identity_atomic(p_slug, p_share_token, p_crew_member_id)` — which does ALL validation INSIDE the per-show advisory lock (share-token re-resolve, crew_member roster check, claimed_via_oauth_at IS NULL check, show published + not-archived check, picker_epoch read, observed_at_millis capture via clock_timestamp). **R41-R35**: the prior same-show-email-count check is removed because the schema's partial UNIQUE index on (show_id, email) makes duplicates impossible. NO pre-RPC JS-side call to `resolve_show_by_slug_and_token` (that would re-open the R41-R33 rotation race: an admin Rotate can commit between the JS pre-resolve and the locked RPC, letting a cookie be minted from an already-invalid old share-token). NO post-RPC SELECT picker_epoch outside the lock. The RPC's return value is authoritative. The picker form embeds `slug` and `shareToken` as hidden inputs sourced from the route params. The §10.1 picker-cookie meta-test grep-asserts `selectIdentity.ts` does NOT import or call `resolve_show_by_slug_and_token` AND does NOT call `.from('shows').select('picker_epoch')` post-RPC — both patterns are forbidden because they would observe state outside the locked window.

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
│        succeeded), AND cookie.t > floor(extract(epoch from   │
│        claimed_via_oauth_at) * 1000)::bigint (R41-R22 strict │
│        + R41-R30 floor() — bare ::bigint rounds, breaking    │
│        the strict-greater guarantee at fractional millis)    │
│        greater + millisecond precision — cookie was minted   │
│        STRICTLY AFTER the claim, indicating it came from     │
│        picker-bootstrap's mint_safe_t_millis path) → fall    │
│        through to step 6 (cookie path; typical post-         │
│        bootstrap flow). The strict-greater check + millis    │
│        precision fail-closes the same-millisecond bypass-tie │
│        case identified in R41-R22 review.                    │
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
│               NOT (cookie.t > claim_epoch_millis) — i.e.     │
│               cookie.t <= claim_epoch_millis, covering both  │
│               strictly-less (R41-R11 same-user pre-claim)    │
│               AND equality at the millisecond boundary       │
│               (R41-R25 tie-routing fix — ties must route to  │
│               bootstrap, not fall through to step 9          │
│               invalidation which would strand the legitimate │
│               user on the CLAIMED_AFTER_PICK banner), OR     │
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
│     d. (vacated — R41-R35; the ambiguous_email arm was      │
│        defending a state the schema constraint                │
│        crew_members_show_email_unique makes impossible.       │
│        validateGoogleSession at the row level resolves to     │
│        EXACTLY ONE matching crew_members row by construction.)│
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
│         returns one of SEVEN discriminant kinds, SEVEN     │
│         wire outcomes (R41-R35 simplified —                 │
│         identity_invalidated.reason is single value         │
│         'claimed_after_pick'):                              │
│           - { kind: 'resolved', crewMemberId }               │
│           - { kind: 'no_selection' }                         │
│           - { kind: 'epoch_stale' }                          │
│           - { kind: 'removed_from_roster' }                  │
│           - { kind: 'identity_invalidated', reason:          │
│               'claimed_after_pick' }                         │
│             (R41-R8 base; R41-R35 simplified — single reason │
│             remains; see §6.1 case 9)                        │
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
│         (R41-R35: email_ambiguous reason removed)            │
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
│ lib/auth/picker/selectIdentity.ts (new — R41-R33 locked-RPC) │
│                                                              │
│  0. Syntactic validation ONLY (no DB calls): slug matches    │
│     ^[a-z0-9-]+$; shareToken matches ^[0-9a-f]{64}$;         │
│     crewMemberId is a UUID. Malformed → reject with          │
│     PICKER_INVALID_INPUT.                                    │
│                                                              │
│  1. Single locked RPC call (the ONE DB round-trip — R41-R33):│
│     result = select_identity_atomic(                         │
│       p_slug = slug,                                         │
│       p_share_token = shareToken,                            │
│       p_crew_member_id = crewMemberId                        │
│     )                                                        │
│     The RPC body (per §6.2 + §6.0): acquires the per-show    │
│     advisory lock via the slug→drive_file_id two-step        │
│     lookup; re-validates the share-token INSIDE the lock;    │
│     checks crewMemberId in roster + show_id match +          │
│     claimed_via_oauth_at IS NULL                             │
│     + shows.published + NOT shows.archived; reads            │
│     shows.picker_epoch; captures observed_at_millis via      │
│     clock_timestamp() AFTER the lock; returns { ok: true,    │
│     show_id, crew_member_id, picker_epoch,                   │
│     observed_at_millis }. On any rejection: returns the      │
│     cataloged error code (PICKER_INVALID_SHARE_TOKEN /       │
│     PICKER_CREW_MEMBER_NOT_FOUND / WRONG_SHOW /              │
│     IDENTITY_CLAIMED / SHOW_UNAVAILABLE)                     │
│     and NO cookie is emitted. NO pre-RPC JS-side call to     │
│     resolve_show_by_slug_and_token (that would re-open the   │
│     R41-R33 rotation race). NO post-RPC SELECT picker_epoch  │
│     (that would observe stale-or-newer state outside the     │
│     lock; the RPC return value is authoritative).            │
│                                                              │
│  2. Read existing HMAC-signed cookie envelope (verify        │
│     signature; null → start with empty envelope). Merge new  │
│     entry { result.show_id: { id: result.crew_member_id,     │
│     e: result.picker_epoch,                                  │
│     t: result.observed_at_millis } } using the RPC's         │
│     DB-side values verbatim (per §6.0 — NOT JS Date.now()).  │
│     Apply byte-budget LRU eviction if encoded > 3800 bytes.  │
│                                                              │
│  3. Re-sign the envelope and emit Set-Cookie with            │
│     __Host-fxav_picker, 90-day Max-Age, Path=/, HttpOnly,    │
│     Secure, SameSite=Lax.                                    │
│                                                              │
│  4. revalidatePath(`/show/${slug}/${shareToken}`)            │
│  5. Server Component re-renders into _ShowBody               │
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
- `app/api/auth/picker-bootstrap/route.ts` (new, R41-R2 amendment; R41-R3 atomic claim-and-mint; R41-R5 intent-token CSRF; R41-R6 one-show write only; **R41-R7 fail-closed on RPC failure**). Route Handler that legally mints `__Host-fxav_picker` for a Google-signed-in user. **Flow:** (1) read `next` AND `t` (intent token); validate `next` against the `validateNextParam.ts` allowlist; **(1.5) verify the intent token** — `t = base64url(payload) + '.' + base64url(HMAC-SHA256(payload, PICKER_COOKIE_SIGNING_KEY))` where `payload = JSON({slug, shareToken, exp})`. Decoder rejects: missing `t`, malformed format, expired (`exp < now`), HMAC mismatch, OR `{slug, shareToken}` not matching the `next` URL's parsed slug+token. **A failed intent check returns 403** (NOT 302). The token's 60s expiry bounds replay; (2) `validateGoogleSession(req)` — no session → 302 to `next` with NO cookie set; (3) invoke `claim_oauth_identity(p_email = auth.users.email)`. **(3a) RPC infra failure — R41-R7 fail-closed contract**: if the RPC returns an error or throws, the handler MUST NOT 302 back to `next` (that would re-trigger the same step-4 detection → infinite loop). Instead, the handler returns an HTTP 502 with the cataloged terminal-failure UI rendered as HTML (same template as the page-route `infra_error` branch). The user sees a "Couldn't sign you in — please try again in a moment." page with a manual retry link. No cookie set. Structured log carries `PICKER_BOOTSTRAP_RPC_FAILED` operator code. Bounded recovery: user reload retries. The redirect-chain depth is structurally capped at 1 hop (page → bootstrap → 502 terminal page); (3b) on success, the RPC returns `{ claimed_count, shows, mint_safe_t_millis }` (R41-R22/R41-R23: the `mint_safe_t_millis` field is the DB-side `clock_timestamp()`-derived value strictly greater than every `claimed_via_oauth_at` on the user's rows); (4) **one-show write contract (R41-R6 lost-update repair; R41-R24 timestamp source pinned)**: parse `next` to extract the target `slug`/`shareToken` → resolve via `resolve_show_by_slug_and_token` → obtain `target_show_id`. Find the entry for `target_show_id` in `result.shows`. If present, read the request's picker envelope, modify ONLY that show's entry to `{ id: crew_member_id, e: picker_epoch, t: result.mint_safe_t_millis }` (NOT `Date.now()` or any JS clock — R41-R24 pin: the bootstrap MUST use the DB-side value from the RPC's response; app-server/DB-server clock skew or same-millisecond races would otherwise produce a cookie.t that fails the resolver's `cookie.t > claim_epoch_millis` check, causing the legitimate OAuth user to be wrongly rejected as claimed_after_pick). Leave every other entry untouched, write via `cookies().set('__Host-fxav_picker', signEnvelope(envelope), PICKER_COOKIE_OPTIONS)`. If `target_show_id` is NOT in `result.shows` (user not on this show's roster), write NO cookie. **Structural defense (R41-R24)**: the §10.1 picker-cookie meta-test grep-asserts the bootstrap route handler does NOT call `Date.now()`, `new Date()`, `performance.now()`, or any other JS clock source as the cookie's `t` value; the only legal source is `result.mint_safe_t_millis` returned by the RPC. The handler never touches entries for shows other than `target_show_id`; (5) 302 to `next`. **No redirect loop is possible across ALL paths**: (a) RPC success + target in shows → mint + 302 → page step 6 catches; (b) (R41-R35 removed — ambiguous branch no longer exists); (c) RPC success + non-matching → bootstrap doesn't mint + 302 → page step 4(e) falls through to step 5; (d) RPC failure → 502 terminal page, NO 302 (R41-R7 fail-closed); (e) no Google session → 302 with no mint → page step 4(a) falls through to step 5 (gate or picker, no re-redirect); (f) invalid intent token → 403, no redirect. **This Route Handler IS in the cookie-mutator allowlist** alongside `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`; `/auth/callback/route.ts` is NOT in the allowlist (R41-R6 — callback does not write picker cookies). **Anti-overwrite contract**: handler MUST NOT modify entries for shows other than `target_show_id`. The §10.2 regression test asserts a pre-existing entry for Show-Y persists byte-identical across a picker-bootstrap call for Show-X.
- `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` (new, Server Component) — renders the picker. Reads the show's roster from `crew_members` via service-role client. Renders the `<form action={selectIdentity}>` markup. No client-side JavaScript needed for the picker itself. When the resolver returns **any of `epoch_stale` | `removed_from_roster` | `identity_invalidated`** (R41-R15 base; R41-R35 simplified — `identity_invalidated` has only the `'claimed_after_pick'` reason now), also mounts `<StaleCleanupAutoSubmit>` (below) once with the resolver's `expectedEpoch` and `expectedCrewMemberId`. The compare-and-delete contract is identical across all THREE stale-state kinds; the banner copy differs per the §4.1 step-8 routing table.
- `app/show/[slug]/[shareToken]/_StaleCleanupAutoSubmit.tsx` (new, **client component** — the ONLY `'use client'` component in the picker tree) — renders an invisible `<form action={cleanupStaleEntry}>` with hidden inputs for `showId`, `expectedEpoch`, `expectedCrewMemberId`, and auto-submits on mount via `useEffect`. R25 amendment: this surface exists because cleanup form auto-submit requires client JS, which Server Components cannot provide.
- `app/show/[slug]/[shareToken]/_ShowBody.tsx` (existing `_ShowBody.tsx` MOVED into the tokenized route directory) — unchanged in role-derived rendering. **Modified** to accept a new prop `identityChip: { name, role }` which it renders into the existing sub-header strip (the same slot that holds the show title today).
- All `revalidatePath` calls in Server Actions use the tokenized form `/show/${slug}/${shareToken}` (not the slug-only form). The Server Actions accept both `showId` (cookie-relevant) and an optional path-string `pathToRevalidate` derived from the rendering page so the action can call `revalidatePath(pathToRevalidate)` correctly.
- `components/auth/IdentityChip.tsx` (new) — renders the `<Name> · <Role>` display + "Not you?" `<form action={clearIdentity}>`. Server Component (no client JS).
- `lib/auth/picker/cookieEnvelope.ts` (new) — `encodePickerCookie`, `decodePickerCookie` helpers. Mirrors the discipline of `lib/auth/cookies.ts:27-34` (versioned envelope, strict-shape decoder, null on parse failure / wrong `v` / wrong field types).
- ~~`lib/cache/showSlugMap.ts`~~ — **REMOVED in R16**. The helper existed to support middleware-refresh's slug→id lookup; with middleware refresh dropped (lost-update race), no consumer remains. Slug→id resolution where needed uses the existing `resolveShowFromSlug` pattern in `app/show/[slug]/page.tsx:119+`.
- `lib/auth/picker/resolvePickerSelection.ts` (new) — **the COOKIE-ONLY cookie-read + DB-validation helper.** Returns a discriminated union of **SEVEN discriminant `kind` values** (R41-R35 simplified — 7 WIRE outcomes; the prior 8-outcome count counted `identity_invalidated`'s two reasons separately, but R41-R35 narrowed reason to the single value `'claimed_after_pick'`): `resolved | no_selection | epoch_stale | removed_from_roster | identity_invalidated | show_unavailable | infra_error`. The `identity_invalidated` arm carries `{ expectedEpoch, expectedCrewMemberId, reason: 'claimed_after_pick' }` per §6.1; consumers' switch statements MUST exhaustively handle the 7 kinds (the `assertNever` exhaustiveness check). Imported by BOTH the page route AND every API consumer. **Does NOT import `validateGoogleSession`**. The structural allowlist in §10.1 enforces this split. **The 7-kind / 7-outcome union is the canonical contract**; the §6.1 ordered chain is the implementation algorithm. The §10.2 stale-credential matrix test pins all 7 outcomes × all 6 API consumers.
- `lib/auth/picker/resolveShowPageAccess.ts` (new, R41 Fix-3; R41-R3 pure-resolver; R41-R7: union enumerated; **R41-R12: unpublished-precedence corrected; R41-R13: identity_invalidated arm added; R41-R14: kind/outcome wording harmonized**). **Page-route-only auth chain helper.** Called exclusively by `app/show/[slug]/[shareToken]/page.tsx`. Encapsulates the resolver chain **in this exact order**: archived → admin precedence → **unpublished (R41-R10 step 3.5 — MUST come before any Google-session branch to prevent the bootstrap-loop class)** → Google-session-matching-crew-row → existing picker cookie. The helper is defense-in-depth alongside the page-route's own ordered chain; the page can also pre-check published before calling the helper, but the helper MUST also enforce the ordering internally. Imports `validateGoogleSession`. **The helper is PURE — it never encodes cookies and never calls `cookies().set()`.** Returns a discriminated union of **EXACTLY ELEVEN discriminant `kind` values** (R41-R35 corrected count — `ambiguous_email` arm removed because the schema makes it impossible; `identity_invalidated.reason` is now a single value, so 11 kinds = 11 wire outcomes; caller exhaustiveness checks fail if any kind is missing). The eleven kinds (the `ambiguous_email` slot at position 4 is vacated and the numbering preserved to avoid renumbering downstream citations):

  1. `{ kind: 'archived' }` — show is archived; page renders 404.
  2. `{ kind: 'admin' }` — admin precedence; page renders admin mode.
  3. `{ kind: 'needs_picker_bootstrap', intentToken }` — Google session matches EXACTLY ONE crew row on this show + no cookie entry yet OR cookie mismatches per §4.1 branch (b'); page redirects to `/api/auth/picker-bootstrap?next=<URL>&t=<intentToken>`.
  4. (vacated — R41-R35; ambiguous_email arm removed because the schema's partial UNIQUE index makes the state impossible. Discriminant kind count: 11.)
  5. `{ kind: 'resolved', crewMemberId, source: 'cookie' | 'admin' }` — cookie-based identity OR admin; page renders `_ShowBody`.
  6. `{ kind: 'unpublished' }` — show is not yet published and viewer is non-admin; page renders 404.
  7. `{ kind: 'no_auth' }` — no admin, no Google, no cookie; page renders gate (no `?gate=skip`) or picker (with `?gate=skip`).
  8. `{ kind: 'epoch_stale', expectedEpoch, expectedCrewMemberId }` — cookie's `e` < shows.picker_epoch; page renders picker with epoch-stale banner + cleanupStaleEntry form.
  9. `{ kind: 'removed_from_roster', expectedEpoch, expectedCrewMemberId }` — cookie's crew_member_id no longer in roster; page renders picker with removed-from-roster banner.
  10. `{ kind: 'identity_invalidated', expectedEpoch, expectedCrewMemberId, reason: 'claimed_after_pick' }` **(R41-R13; R41-R35 simplified)** — cookie's identity is now OAuth-claimed; page renders picker with `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` + cleanupStaleEntry form. Surfaced by §6.1 resolver chain step 9.
  11. `{ kind: 'show_unavailable' }` — show became archived or unpublished after cookie was minted; page renders terminal failure or 404 depending on context.
  12. `{ kind: 'infra_error', code }` — DB read failed; page renders terminal-failure UI with the cataloged code.

  The R41-R2 `justMinted` arm and the cookie-encoder import are DELETED. **A static guard** asserts `resolveShowPageAccess.ts` does NOT import the picker cookie encoder NOR `cookies` from `next/headers`. **API consumers MUST NOT import this helper** — the no-jwt-surface meta-test asserts the only consumer is the show-page route handler. **Exhaustiveness check**: a TypeScript `assertNever(kind)` at the bottom of the page-route switch fails compilation if any kind is missed. `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts` exercises each of the **11 distinct wire outcomes** (R41-R35 corrected — `ambiguous_email` arm removed; `identity_invalidated` has a single reason; 11 kinds = 11 wire outcomes) with fixture inputs and asserts the page-route handler produces the documented response (404 / redirect / render with banner / render `_ShowBody`).
- `lib/auth/picker/selectIdentity.ts` (new) — the Server Action.
- `lib/auth/picker/clearIdentity.ts` (new) — the Server Action.
- `lib/auth/picker/resetPickerEpoch.ts` (new) — admin-only Server Action.
- `components/admin/PerShowCrewSection.tsx` (existing, 173 lines) — **simplified**. Per-row Issue/Revoke controls and the "Revoke all links" button are removed. Two new section-level admin buttons are added: **"Reset picker selections"** (calls `resetPickerEpoch`; bumps `shows.picker_epoch`; every device re-prompts) AND **"Rotate share-token"** (calls `rotateShareToken`; per R40, atomically rotates the share_token AND bumps picker_epoch; old URL stops resolving; old cookies go stale; Doug re-shares the new URL). Preview-as-crew links per row are preserved.
- `lib/auth/picker/rotateShareToken.ts` (new) — admin-only Server Action; wraps the `rotate_show_share_token(uuid)` SECURITY DEFINER RPC. Same cookie-bound `createSupabaseServerClient()` + `requireAdmin()` pattern as `resetPickerEpoch`. **R41-R28 critical defense-in-depth**: the RPC body MUST include an in-function `if not public.is_admin() then raise exception ... using errcode = '42501'` gate, mirroring `reset_picker_epoch_atomic`. Without the in-function gate, the JS `requireAdmin()` is the only barrier and an authenticated (non-admin) user could call the RPC directly via PostgREST `from('rpc').rpc('rotate_show_share_token', ...)` to rotate any show's share-token (and bump its picker_epoch). The grant is `REVOKE ALL ... FROM public; GRANT EXECUTE TO authenticated` (matching reset's grant pattern so cookie-bound clients can invoke it), and the in-function `is_admin()` check is the actual access gate. A live PostgREST regression test (§10.2) invokes `rotate_show_share_token` directly as an authenticated non-admin user and asserts: (a) the RPC raises an error / returns 42501 (NOT silently succeeds); (b) **`show_share_tokens.share_token`** for the target `show_id` is unchanged (R41-R29 schema correction — the bearer token lives in the private `show_share_tokens` table per R35, NOT on `public.shows`); (c) `shows.picker_epoch` is unchanged; (d) the non-admin caller's PostgREST `from('show_share_tokens').select(...)` ALSO returns no rows (the table is REVOKEd from authenticated per §5.1 — defense-in-depth that the bearer token cannot be read directly). Returns `{ ok: true, new_share_token: <string>, new_epoch: <int> }` on admin success — the admin UI displays the new URL `https://crew.fxav.show/show/<slug>/<new_share_token>` for Doug to copy + share.

### 4.9 Cookie-write boundaries (Next 16 constraint) — R16 simplification

**Server Components cannot mutate cookies.** Per Next 16, calling `cookies().set()` from a Server Component throws. Cookie writes are only legal from Server Actions, Route Handlers, or Middleware.

**R16 amendment — middleware refresh is REMOVED from this spec.** Earlier drafts (R3–R15) specified a middleware-based sliding-TTL refresh that bumped the cookie's `t` and re-emitted `Max-Age=7776000` on every authenticated request. R16 surfaced an unfixable lost-update race: middleware decodes the request's cookie (which may be stale by the time the response is written), bumps one entry, and re-emits the WHOLE envelope. If a Server Action (`selectIdentity`, `clearIdentity`, `cleanupStaleEntry`) commits a newer envelope BETWEEN the in-flight request's cookie capture and the middleware's Set-Cookie response, the middleware response overwrites the Server Action's newer state. Because the browser stores a single `__Host-fxav_picker` cookie and the LAST `Set-Cookie` wins, this is unfixable without inventing a server-side authoritative store the pivot model deliberately does not have.

**Single-mechanism contract (v1) — R41-R41 final mutator list:** the cookie is mutated **only** by FIVE legal surfaces: (a) three crew-side Server Actions — `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`; (b) TWO Route Handlers — `app/api/auth/picker-bootstrap/route.ts` (mints with `Max-Age=7776000`) and `app/auth/sign-out/route.ts` (clears with `Max-Age=0`). Each surface reads the request's current cookie, mutates the envelope in memory, and writes a fresh Set-Cookie. **`/auth/callback/route.ts` is NOT a cookie mutator** (R41-R6 structural choice — callback is DB-stamp-only; cookies mint lazily on first show visit via picker-bootstrap). The §10.1 picker-cookie-contract meta-test asserts callback does NOT call `cookies().set('__Host-fxav_picker', ...)`. **Server Components CANNOT mutate cookies** — this is a Next App Router invariant; the page route MUST redirect to the Route Handler for any cookie mint that originates from a Server Component context. **`resetPickerEpoch` does NOT touch the cookie (R30 amendment)**. Middleware does NOT touch the cookie.

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

// R41 P-R9 amendment (Fix-1 + Fix-3): the entire claim block runs under a
// try/catch with explicit { data, error } destructuring per AGENTS.md
// invariant 9 (Supabase call-boundary discipline). Returned-error and
// thrown-error paths are BOTH handled; neither aborts the OAuth callback.
// Per-row OAUTH_IDENTITY_CLAIMED emission (one alert per claimed row,
// scoped to show_id, with hashed email) replaces the prior aggregate
// shape.
try {
  const { data: userResult, error: getUserError } = await supabase.auth.getUser();
  if (getUserError) {
    logger.error('callback.getUser returned error', { error: getUserError });
  } else if (userResult.user?.email) {
    const canonicalEmail = canonicalize(userResult.user.email);
    const { data: result, error: rpcError } = await serviceRole.rpc('claim_oauth_identity', { p_email: canonicalEmail });
    if (rpcError) {
      // Infra fault — log and continue. Next show-page visit's picker-bootstrap
      // will retry claim_oauth_identity, so the stamp is eventually consistent.
      // Email is HASHED in logs (P-R9 Fix-2: never raw PII).
      logger.error('claim_oauth_identity returned error', { emailHash: hashForLog(canonicalEmail), error: rpcError });
    } else if ((result?.claimed_count ?? 0) > 0) {
      // R41 P-R8 Fix-3: per-row emission with hashed email. The aggregate
      // { user_email, claimed_count } shape collapsed all identity-claim
      // events into one alert, hiding which show/crew rows were claimed.
      const claimedRows: Array<{ crew_member_id: string; show_id: string; claimed_at_millis: number }>
        = result.claimed_rows ?? [];
      for (const row of claimedRows) {
        await emitAdminAlert('OAUTH_IDENTITY_CLAIMED', {
          show_id: row.show_id,
          context: {
            crew_member_id: row.crew_member_id,
            show_id: row.show_id,
            claimed_at_millis: row.claimed_at_millis,
            user_email_hash: hashForLog(canonicalEmail),
          },
        });
      }
    }
  }
} catch (err) {
  // R41 P-R9 Fix-1: thrown-error path. Log + swallow so sign-in still
  // succeeds; picker-bootstrap retries the claim on next show visit.
  logger.error('callback claim-stamp threw', {
    error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
  });
  try {
    await emitAdminAlert('CALLBACK_CLAIM_THREW', {
      show_id: null,
      context: { error_name: err instanceof Error ? err.name : 'Unknown' },
    });
  } catch { /* alert emission can also fail; sign-in still proceeds */ }
}
// NO cookies().set() here. The next show-page visit handles cookie minting.
```

**Why the RPC returns BOTH `claimed_rows` and `shows`:** `claimed_rows` is the per-row claim-event payload (callback's alert producer reads it; R41 P-R8 Fix-3). `shows` is the one-show cookie mint input (picker-bootstrap's mint step reads it). The callback ignores `result.shows` — it only consumes `claimed_count` + `claimed_rows`. picker-bootstrap consumes `shows` + `mint_safe_t_millis` and ignores `claimed_rows`. This is intentional: the RPC has two consumers with disjoint return-shape needs; the union return matches both.

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
  v_claimed_count integer := 0;
  v_shows jsonb;
  v_claim_at timestamptz;  -- R41-R23: clock_timestamp() AFTER all locks acquired
  r record;  -- R41-R10: loop variable for explicit ordered lock acquisition
  -- R41-R35: v_ambiguous_show_ids removed (schema constraint prevents the state)
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

  -- R41-R23 CRITICAL fix: capture a POST-LOCK clock timestamp.
  -- The earlier draft used now() which returns transaction_start (NOT
  -- the time locks were acquired). Scenario: claim_oauth_identity's
  -- transaction begins at T=0 (for Show-A which it locks immediately),
  -- but waits for Show-X's lock until T=15 (Mallory's select held it
  -- until T=15). Stamping claimed_via_oauth_at = now() = T=0 means
  -- Mallory's cookie (observed_at_millis=5, captured during Mallory's
  -- transaction) would PASS the resolver's `cookie.t <= claim_epoch`
  -- check (5 > 0 → not invalidated). Mallory continues as Alice.
  -- clock_timestamp() returns CURRENT wall-clock at evaluation; called
  -- AFTER all locks are acquired, it's strictly later than any prior
  -- lock-released transaction's observed_at_millis on these shows.
  v_claim_at := clock_timestamp();

  -- UPDATE restricted to the materialized locked set. A row INSERTed for
  -- this email on an UNLOCKED show after lock-acquisition cannot be
  -- stamped this round because its show_id is not in v_locked_show_ids.
  with updated as (
    update public.crew_members cm
       set claimed_via_oauth_at = v_claim_at
     where cm.email = v_email
       and cm.show_id = any(v_locked_show_ids)
       and cm.claimed_via_oauth_at is null
   returning cm.id, cm.show_id
  )
  select count(*) into v_claimed_count from updated;

  -- R41-R35: ambiguous-email detection REMOVED. The live schema's partial
  -- UNIQUE index `crew_members_show_email_unique ON (show_id, email) WHERE
  -- email IS NOT NULL` at supabase/migrations/20260501000000_initial_public_schema.sql:49-51
  -- guarantees at most one crew_members row per (show_id, email). The
  -- R41-R3/R41-R4 ambiguous-handling SQL was dead code defending an
  -- impossible state; the constraint is the canonical defense. A sync
  -- attempt to insert a duplicate-email row fails at constraint time and
  -- surfaces via the existing pre-R41 sync-error pathway.

  -- Build the shows result set: published + non-archived crew rows for
  -- this email, restricted to v_locked_show_ids. No GROUP BY needed —
  -- the UNIQUE constraint guarantees a single row per (show_id, email).
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

  -- R41-R22 + R41-R23: compute mint_safe_t_millis for picker-bootstrap's
  -- cookie.t. Uses clock_timestamp() (NOT now()/transaction_timestamp())
  -- so the value reflects current wall-clock at this evaluation point —
  -- which is AFTER all the user's show locks were acquired AND after the
  -- UPDATE statement ran. Strictly greater than v_claim_at (the value
  -- stamped into claimed_via_oauth_at) and strictly greater than any
  -- previously-claimed claimed_via_oauth_at on the user's rows.
  return jsonb_build_object(
    'claimed_count', v_claimed_count,
    'shows', v_shows,
    'mint_safe_t_millis',
      greatest(
        floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        coalesce(
          (select floor(extract(epoch from max(claimed_via_oauth_at)) * 1000)::bigint
             from public.crew_members
            where email = v_email
              and claimed_via_oauth_at is not null),
          0
        )
      ) + 1
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

- **NEW (R41 / revised R41-R6 / R41-R15 / P-R8 Fix-3): `public.claim_oauth_identity(p_email text) returns jsonb`** — SECURITY DEFINER helper called from the auth-callback handler (§4.8) AND from the picker-bootstrap Route Handler (§4.7). `REVOKE ALL FROM public; GRANT EXECUTE TO service_role`. Acquires per-show advisory locks for every show the user has a `crew_members` row on (sorted by `drive_file_id`), stamps `claimed_via_oauth_at` on every NULL-stamped row in the locked set, returns `{ claimed_count: int, claimed_rows: [{ crew_member_id, show_id, claimed_at_millis }], shows: [{ show_id, crew_member_id, picker_epoch }], mint_safe_t_millis: bigint }`. Idempotent (UPDATE filters `claimed_via_oauth_at IS NULL`; re-invocations preserve first-stamp date and return `claimed_rows: []`). **Caller responsibilities (R41-R6 + R41-R15 + P-R8 Fix-3 strict contract):** (a) `/auth/callback` consumes `claimed_count` for the alert-emission gate AND iterates `claimed_rows` to emit one OAUTH_IDENTITY_CLAIMED admin_alert per row (scoped to row.show_id, context = `{ crew_member_id, show_id, claimed_at_millis, user_email_hash }`); callback MUST NOT iterate `result.shows` to mint cookies (callback is NOT a picker-cookie mutator per R41-R6). (b) `/api/auth/picker-bootstrap` uses `result.shows` ONLY to find the entry whose `show_id === target_show_id` (the show derived from the `next` URL); it MUST NOT loop over `result.shows` to mint multiple entries (the one-show-write contract per R41-R6 is the structural defense against cross-show lost-update). **Static guards**: the meta-test grep-asserts that (i) no caller of `claim_oauth_identity` in `app/**` or `lib/**` performs a `for (... of result.shows)` or `result.shows.map(...).forEach(set-cookie)` pattern; (ii) no `OAUTH_IDENTITY_CLAIMED` emission site contains a `user_email` (raw) or `claimed_count` field in `context` — aggregate-shape regressions are CI-blocked. The RPC's `shows` field is shaped for single-row lookup by target_show_id, not bulk iteration. The earlier R41-R2 wording that said "for the caller to mint picker cookies for all the user's shows in one envelope write" is OBSOLETE — R41-R6 removed that pattern.

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

**R41-R29 corrected writer inventory**: `shows.picker_epoch` and `shows.picker_epoch_bumped_at` are written by EXACTLY TWO SECURITY DEFINER RPCs: (1) `public.reset_picker_epoch_atomic(uuid)` (admin Reset action — bumps both columns under the per-show advisory lock + invalidation publish), AND (2) `public.rotate_show_share_token(uuid)` (admin Rotate action — bumps both columns atomically with the share-token rotation under the same advisory lock + invalidation publish, per R40 amendment). Both RPCs include the in-function `public.is_admin()` gate (R41-R28 — bypassable JS-only requireAdmin defense was unsafe). No other code path mutates them. The structural meta-test at §10.1 grep-asserts these are the ONLY two writers.

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
5. The writers of `picker_epoch` and `picker_epoch_bumped_at` in `supabase/migrations/<post-cutover>/**` are EXACTLY TWO: `public.reset_picker_epoch_atomic` AND `public.rotate_show_share_token` (R41-R29 — R40 amendment added rotation as a second writer; the structural meta-test asserts this two-RPC set exactly). Migrations that DROP these columns or the RPCs are exempt (they're cleanup, not new writers).

**RPC caller/grant contract (R18 correction).** The RPC is GRANTed EXECUTE to `authenticated` AND `service_role` — REVOKEd from `anon, public`. The Server Action `resetPickerEpoch` uses the **cookie-bound server client** (`createSupabaseServerClient()` per `lib/supabase/server.ts`), NOT the service-role client. Reason: the RPC body calls `public.is_admin()` (per the §4.5 DDL), which reads from the request's Supabase Auth JWT. The service-role client doesn't carry a user JWT, so an RPC called with the service-role client would see `is_admin() = false` and raise — making the Reset button always fail for real admins. The cookie-bound client carries Doug/Eric's admin JWT, which `is_admin()` resolves correctly. This pattern matches the existing admin-RPC wrappers at `app/admin/show/[slug]/actions.ts`. The `requireAdmin()` JS-side gate is still required at the Server Action boundary as defense-in-depth (catches non-admin sessions before the RPC trip).

**R7 + R10 + R18 amendments combined**: the atomic transaction requirement (lock + UPDATE + publish_show_invalidation) requires a single SQL function (R7); the columns being written ALSO need table-level REVOKE because column-level REVOKE doesn't subtract from table-level grants (R10); the RPC caller MUST be the cookie-bound client (R18) so the in-DB admin gate sees the admin JWT.

**Advisory-lock acquisition (per AGENTS.md invariant 2 — non-negotiable; R41-R31 corrected for selectIdentity).** Because the Reset path mutates `public.shows`, the per-show advisory lock MUST be acquired inside the same transaction as the UPDATE. The mechanics are in §4.5; the call-boundary contract is: the structural meta-test at `tests/auth/_metaInfraContract.test.ts` registers `resetPickerEpoch`, AND the advisory-lock topology meta-test at `tests/auth/advisoryLockRpcDeadlock.test.ts` asserts (a) the SECURITY DEFINER RPC bodies acquire the lock at exactly one layer, (b) NO JS-side wrapper around the RPC call acquires the same lock, (c) NO other DB function reacquires the same hashkey while the RPC body holds it, and (d) the documented writer set is complete (per R41-R29: reset_picker_epoch_atomic + rotate_show_share_token are the two writers of `picker_epoch`).

**R41-R31 selectIdentity correction (R41-R35 simplified)**: `selectIdentity` MUST also acquire the per-show advisory lock via the `select_identity_atomic` SECURITY DEFINER RPC (per §6.2 + §6.0). The lock is required because the action READS race-sensitive fields (`claimed_via_oauth_at`, `picker_epoch`, `observed_at_millis`) that can be mutated by concurrent `claim_oauth_identity` / `rotate_show_share_token` / `reset_picker_epoch_atomic` invocations — without the lock, the read-then-cookie-mint window allows the impersonation class R41-R18+R41-R23 closed. The advisory-lock topology meta-test asserts `select_identity_atomic` acquires the lock at exactly one layer inside the SECURITY DEFINER body. The JS Server Action wrapper does NOT call `pg_advisory_xact_lock` directly (single-holder rule).

The `clearIdentity` and `cleanupStaleEntry` Server Actions perform NO DB reads of race-sensitive fields and NO server-side state mutations — they only mutate the client cookie. They do NOT require the advisory lock.

---

## 6. URL + routing contract

| Route | Auth requirement | Behaviour |
| ----- | ---------------- | --------- |
| `/` | none | Marketing/landing. Unchanged. |
| `/auth/sign-in` | none | Google OAuth entrypoint. **R41 amendment: M11 behavior preserved.** `/me` stays in the allowed `next` allowlist. The already-signed-in short-circuit redirects admins to `/admin` and non-admins to `/me` (per M11). |
| `/auth/callback` | none (sets session) | OAuth code exchange. **R41 amendment: M11 behavior preserved AND the new claim-stamp hook (§4.8) runs after `exchangeCodeForSession()` succeeds — calls `claim_oauth_identity(user.email)` via the service-role client to stamp `crew_members.claimed_via_oauth_at` for every matching row.** Post-stamp, redirects to the validated `next` (admins → `/admin` if no explicit next; non-admins → `/me` if no explicit next). `/me` is back in the allowlist. |
| `/api/auth/google/start` | none | OAuth flow start. **R41 amendment: M11 behavior preserved.** `/me` is back in the `redirectTo` allowlist. |
| `/auth/clear-session` | none | Cookie-clear hop. **R41 amendment: M11 behavior preserved.** `/me` is back in the allowed-targets allowlist. |
| `/auth/sign-out` | POST, signed-in | Atomic clear of session AND picker credential. **R41-R41 corrected (CRITICAL)**: sign-out clears BOTH the Supabase Auth session cookies AND `__Host-fxav_picker` (emits `Set-Cookie: __Host-fxav_picker=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`). The earlier R41 draft excluded picker from sign-out reasoning "sign-out is an admin concept" — that was correct PRE-R41 when the picker cookie was strictly a bypass-pick credential separate from any signed-in identity. R41 restored OAuth as an optional crew identity AND has `/api/auth/picker-bootstrap` mint the picker cookie from the signed-in user's email. A picker cookie minted via the OAuth path IS a derived credential of the signed-in user; it MUST be cleared at sign-out, otherwise the next user on a shared browser inherits the signed-out user's show identity (the picker cookie survives sign-out and continues to render/API-authenticate as the previous user). This is the R41-R41 credential-lifetime fix. |
| `/me` | signed-in | **R41 amendment: PRESERVED.** Lists shows where signed-in user's email matches a `crew_members` row on a published+not-archived show. R41 difference vs M11: the listing now emits **tokenized URLs** `/show/<slug>/<share-token>` via the new SECURITY DEFINER RPC `my_share_tokens_for_email()` (per §5.3 R41). Crew never NEED to use `/me` — Doug's per-show links work without sign-in — but `/me` is the optional cross-show discovery surface for crew who do sign in. **R41-R19 canonical-email pin**: the RPC uses **`public.auth_email_canonical()`** internally (NOT raw `auth.email()`) so mixed-case Google accounts find their canonical-stored crew rows; a signed-in user can only enumerate THEIR OWN show tokens. |
| `/show/<slug>/<share-token>` | none (the share-token IS the implicit credential — R34) OR Google session matching a crew row | **Pivoted.** Both URL segments must match the same `shows` row (slug AND share_token). Mismatch → 404. Auth chain per §4.1: (1) admin precedence; (2) **R41 step-4 (R41-R6 corrected): Google session matching `crew_members.email` for THIS show + no cookie entry yet → resolveShowPageAccess returns `needs_picker_bootstrap`; page route redirects to `/api/auth/picker-bootstrap?next=<URL>&t=<intent-token>`** which is the legal cookie mutator (Server Components CANNOT emit Set-Cookie per Next App Router contract; the page route itself NEVER calls `cookies().set()`); bootstrap mints the cookie and 302s back, the next request takes the cookie path; (3) picker cookie → render show body; (4) else → render `<SignInOrSkipGate>` (first contact) OR `<PickerInterstitial>` (if URL carries `?gate=skip` OR resolver returned a stale-credential kind). The admin route `/admin/show/<slug>` is unchanged. |
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
| `/auth/sign-out` | POST, signed-in | **Modified.** Currently calls `deleteSession` from `lib/auth/validateLinkSession.ts` (line 9) to delete the `link_sessions` row. With `link_sessions` retired, the `deleteSession` call is removed entirely. **R41-R41 sign-out clears BOTH** the Supabase Auth session cookies AND the `__Host-fxav_picker` cookie (`Max-Age=0`) — see the earlier sign-out routing-table row for the R41-R41 credential-lifetime rationale. The handler is added to the §10.1 picker-cookie-contract meta-test's expanded cookie-mutator allowlist alongside selectIdentity / clearIdentity / cleanupStaleEntry / picker-bootstrap. |
| `/admin`, `/admin/show/<slug>`, `/admin/show/<slug>/preview/<crewId>`, etc. | admin | **Unchanged**, except the per-show panel UI per §8. |

**`?t=` is no longer a JWT compromise event.** The leaked-link compromise-event handler is deleted along with the JWT model. If a stray legacy URL appears with a `?t=` query, Next.js's normal routing ignores the unknown query param.

**R39 amendment — the share-token is in the URL path, which IS logged.** Unlike the M9.5 fragment-JWT design (per parent spec `2026-04-30-fxav-crew-pages-design.md:1932` — fragments are never sent in HTTP requests), the pivot's `<share-token>` segment is part of the request path and therefore reaches: Vercel access logs, any upstream CDN logs, browser history, Referer headers on external-asset fetches (mitigated by `Referrer-Policy: no-referrer` on the page response per parent spec §7.2 line 1945), and any URL-bar screenshare. This is an intentional trade-off the owner accepted on 2026-05-23 (workflow simplicity over revocation discipline), but the spec MUST acknowledge the leak class explicitly:

- **Operational mitigation:** the pivot's plan adds a `Referrer-Policy: no-referrer` response header on `/show/<slug>/<share-token>` route renders (preserves the parent spec's existing posture). It does NOT attempt to redact the path from Vercel logs — Vercel does not currently offer path-fragment redaction as a feature, and rolling our own log-redaction proxy is out of scope.
- **Compromise response:** the Rotate share-token admin button (per §5.1 R39 amendment) is the recovery path. Doug bumps the token; the old URL stops resolving; Doug re-shares the new URL with the group thread. The Reset picker selections button is the paired recovery for "this device-set was compromised but the URL itself is fine."
- **Threat model boundary**: anyone with Vercel log access is already an FXAV operator (Doug + Eric); browser-history exposure is limited to the device's owner (already trusted). The remaining leak vector is screenshares of the URL bar to non-crew viewers — Doug accepts this risk per the owner determination.

**`/show/<slug>/<share-token>` is the canonical bookmark target.** Bookmarking after picker resolution preserves the cookie; bookmarking before resolution still bookmarks the same URL — opening the bookmark re-runs the resolver and shows the picker if needed. The slug-only URL `/show/<slug>` does NOT route to any crew surface in production code.

### 6.0 Timestamp Defense Contract (R41-R25 consolidated normative section)

This section is the single source of truth for every timestamp comparator, source, precision rule, and edge-case behavior in the cookie-vs-claim defense. Any prose elsewhere in the spec that contradicts this section is incorrect and must be corrected to match.

#### 6.0.1 Wire format

- `cookie.t` is unix MILLISECONDS, stored as `bigint`. NEVER seconds.
- `claimed_via_oauth_at` is PostgreSQL `TIMESTAMPTZ`. Compared via **`floor(extract(epoch from claimed_via_oauth_at) * 1000)::bigint`** to obtain millis on the read path. **R41-R30 critical fix**: the cast MUST use `floor()`, NOT a bare `::bigint`. PostgreSQL's `::bigint` cast on a fractional `double precision` value uses **banker's rounding (round-half-to-even)**, NOT truncation. A claim at 200.6ms would yield `(200.6)::bigint = 201`. The mint path uses `floor(... * 1000)::bigint + 1 = 200 + 1 = 201`. A bootstrap-minted cookie with `t = 201` would then fail the strict-greater check (`201 > 201` is false) → legitimate user wrongly invalidated. The `floor()` on both sides guarantees deterministic truncation: claim at 200.6ms → resolver sees 200, mint sees floor(200.6) + 1 = 201, comparison 201 > 200 → resolved. Every resolver query, mint path, test fixture, and prose comparison in this spec MUST use `floor(... * 1000)::bigint` for consistency.

#### 6.0.2 Clock sources (DB-side only)

Every `cookie.t` value MUST originate from a DB-side `clock_timestamp()` call captured AFTER `pg_advisory_xact_lock` has returned. Forbidden sources: `now()` / `transaction_timestamp()` (returns transaction BEGIN time, predates lock acquisition under contention — R41-R23 bug class). Forbidden sources from app-server: `Date.now()`, `new Date()`, `performance.now()`, `process.hrtime()` (clock skew between app-server and DB-server; same-millisecond race; R41-R24 bug class).

| Surface | Source for cookie.t | DB function returning the value |
|---|---|---|
| `selectIdentity` Server Action | `observed_at_millis` | `select_identity_atomic` returns `floor(extract(epoch from clock_timestamp()) * 1000)::bigint` after acquiring per-show lock, after IS-NULL check passes |
| `/api/auth/picker-bootstrap` Route Handler | `result.mint_safe_t_millis` | `claim_oauth_identity` returns `greatest(clock_timestamp_millis, max(claimed_via_oauth_at_millis)) + 1` after acquiring all the user's show locks |
| `cleanupStaleEntry` Server Action | N/A (removes entry; no `t` set) | — |
| `clearIdentity` Server Action | N/A (removes entry) | — |

`/auth/callback` route handler MUST NOT set cookie.t (it never writes the picker cookie). The FIVE mutator surfaces above are the only writers (R41-R41 final: three Server Actions + picker-bootstrap + sign-out).

#### 6.0.3 Comparator decisions

| Comparison | Operator | Outcome |
|---|---|---|
| Step 4(b) cookie-path acceptance | `cookie.t > claim_epoch_millis` (STRICT) | Resolved → render show body via cookie path |
| Step 4(b')(iii) bootstrap-routing | `cookie.t <= claim_epoch_millis` (INCLUSIVE — R41-R25 fix) | Route to picker-bootstrap to mint fresh cookie |
| §6.1 resolver step 9 invalidation | `cookie.t <= claim_epoch_millis` (INCLUSIVE) | `identity_invalidated, claimed_after_pick` |
| `claim_oauth_identity.mint_safe_t_millis` formula | `greatest(...) + 1` (STRICT-GREATER guarantee) | Bootstrap-minted cookie always satisfies step-4(b) acceptance |

**Tie behavior (cookie.t == claim_epoch_millis):**
- Step 4(b) REJECTS (`>` is strict). Cookie does NOT take the cookie path.
- Step 4(b')(iii) ACCEPTS the tie via `<=` and routes to bootstrap.
- Step 9 (cookie path) ALSO invalidates ties via `<=`.
- This guarantees ties are NEVER incorrectly resolved AND legitimate users at tie boundaries self-heal via bootstrap (which mints a fresh cookie with t = claim_epoch_millis + 1, breaking the tie on the next visit).

**Why the asymmetry between step 4(b) STRICT and step 4(b')(iii) INCLUSIVE:** the cookie path must fail closed on ties (bypass impersonation prevention); the bootstrap-routing must catch ties (legitimate self-heal). The `> X` for acceptance + `<= X` for routing is the only consistent pair of operators that satisfies both constraints with no gap and no overlap.

#### 6.0.4 Why ties happen and how they self-heal

- **Bypass-then-claim within the same millisecond** (Mallory picks Alice's row; Alice signs in within the same DB millisecond): `observed_at_millis (T) == claim_epoch_millis (T)` is possible at millisecond resolution under burst load. Step 9 invalidates via `<=`. Mallory's cookie rejected.
- **Same-user upgrade within the same millisecond** (Bob picks himself; Bob's own OAuth callback fires within the same millisecond): cookie.t (Bob's pick) `==` claim_epoch_millis (Bob's claim). Step 4(b) rejects (`>` strict). Step 4(b')(iii) routes to bootstrap via `<=`. Bootstrap mints fresh cookie at `mint_safe_t_millis = claim_epoch_millis + 1`. Bob's next visit: cookie.t = claim_epoch_millis + 1 > claim_epoch_millis → step 4(b) accepts. Self-heal.

#### 6.0.5 Test contract

Tests asserting cookie.t values MUST:
- Use fixture millisecond values (e.g., `1737028800123`), NOT second values.
- For bootstrap test cases, stub `claim_oauth_identity` to return a known `mint_safe_t_millis` and assert the response cookie's `t` field EQUALS that fixture value exactly (NOT approximately, NOT `<= Date.now()`).
- For selectIdentity test cases, stub `select_identity_atomic` to return a known `observed_at_millis` and assert the response cookie's `t` field equals that value exactly.
- Include at least one "same-millisecond tie" regression test exercising both bypass-then-claim and same-user-upgrade tie scenarios; assert step 9 invalidates the former and step 4(b')(iii) routes the latter to bootstrap.

#### 6.0.6 Static guards

- §10.1 `_metaPickerCookieContract.test.ts` grep-asserts the bootstrap route handler (`app/api/auth/picker-bootstrap/route.ts`) does NOT import `Date.now`, `new Date`, `performance.now`, or `process.hrtime` AS a source for `t`. The only legal source is `result.mint_safe_t_millis` from `claim_oauth_identity`.
- §10.1 `_metaPickerCookieContract.test.ts` ALSO grep-asserts the selectIdentity Server Action (`lib/auth/picker/selectIdentity.ts`) does NOT use `Date.now`, `new Date`, `performance.now`, or `process.hrtime` as a source for cookie `t`. The only legal source is `result.observed_at_millis` from `select_identity_atomic`. (R41-R27 expansion — the original guard was bootstrap-only; selectIdentity's JS-clock leak path is the same R41-R23 bug class on a different surface.)
- §10.1 grep-asserts no SQL file under `supabase/migrations/**` uses `now()` or `transaction_timestamp()` as the source for `claimed_via_oauth_at` UPDATE OR `observed_at_millis` RETURN — only `clock_timestamp()` is permitted on these specific surfaces.
- **R41-R28 numeric guard**: a structural meta-test (or CI grep) flags any `"t":\s*\d{10}\b` pattern in the spec markdown or test fixtures (10-digit numbers = seconds-scale, FORBIDDEN per §6.0.1). Only 13-digit millisecond values (`"t":\s*\d{13}\b`) are permitted. This catches reviewer drift where someone copy-pastes an old seconds-scale example.

### 6.1 Picker entry guards

`resolvePickerSelection` operates in this order. The return type is a discriminated union of **SEVEN discriminant `kind` values, SEVEN wire outcomes** (R41-R35 simplified — `identity_invalidated.reason` is a single value `'claimed_after_pick'` now that the schema constraint makes the email-ambiguous state impossible); per AGENTS.md invariant 9 (Supabase call-boundary discipline), DB faults must be discriminable from auth/identity outcomes:

```ts
type ResolvePickerSelectionResult =
  | { kind: 'resolved'; crewMemberId: string }
  | { kind: 'no_selection' }
  | { kind: 'epoch_stale'; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: 'removed_from_roster'; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: 'identity_invalidated';
      expectedEpoch: number;
      expectedCrewMemberId: string;
      reason: 'claimed_after_pick' }  // R41-R8 added; R41-R35 simplified
        // — R41-R35 removed 'email_ambiguous' reason (schema prevents the
        // ambiguous state); identity_invalidated now has a single reason
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
8. **Entry present, epoch matches; row lookup returns 0 rows** → `{ kind: 'removed_from_roster' }`. The membership query is `SELECT id, show_id, claimed_via_oauth_at FROM crew_members WHERE id = $1 AND show_id = $2` (R41-R35 simplified — the `same_show_email_count` derived field was removed because the schema's partial UNIQUE index on `(show_id, email)` makes duplicates impossible). If 0 rows → `removed_from_roster`.
9. **Entry present, epoch matches, row exists, BUT `claimed_via_oauth_at IS NOT NULL` AND `cookie.t <= floor(extract(epoch from claimed_via_oauth_at) * 1000)::bigint`** (R41-R8 base; R41-R22 millisecond precision + R41-R30 floor() cast for deterministic truncation) → `{ kind: 'identity_invalidated', reason: 'claimed_after_pick' }`. The cookie predates the OAuth identity claim. **R41-R22 critical**: comparison uses unix-MILLISECONDS (not seconds — second resolution allowed bypass-then-claim within the same second to tie and incorrectly resolve) AND `cookie.t <= claim_epoch_millis` (NOT `<`) — the `<=` fails closed on ties. legitimate bootstrap mints carry `cookie.t = mint_safe_t_millis = max(now, max(claimed_via_oauth_at) millis) + 1`, which is STRICTLY GREATER than the claim's millis, so legitimate cookies cleanly satisfy `cookie.t > claim_epoch_millis`. Bypass cookies carry `cookie.t = observed_at_millis` from inside the lock, which is `<` claim_epoch_millis by transaction monotonicity (could equal at millisecond resolution under extreme conditions; the `<=` invalidation catches that tie). The cookie's `t` is the load-bearing distinguishing field; if it `<= claim_epoch_millis`, the cookie is from a pre-claim bypass pick and MUST be rejected.
10. (vacated — R41-R35 removed the ambiguous-email arm. The live schema's partial UNIQUE index on `crew_members(show_id, email) WHERE email IS NOT NULL` makes `same_show_email_count > 1` impossible at the row level. The case number is preserved to avoid renumbering downstream citations.)
11. **All checks pass** → `{ kind: 'resolved', crewMemberId }`.

Mapping of resolver `kind` outcomes to UI behaviour (referenced by `kind`, not case number, to avoid renumbering drift):

- `kind: 'no_selection'` (cases 1, 2, 3) — page renders the picker in **initial** mode (no banner). First-time-on-device UX.
- `kind: 'epoch_stale'` (case 6) — page renders the picker in **epoch-stale banner** mode: "Doug reset access for this show — pick yourself again."
- `kind: 'removed_from_roster'` (case 8) — page renders the picker in **removed-from-roster banner** mode.
- `kind: 'identity_invalidated'` with `reason: 'claimed_after_pick'` (case 9, R41-R8) — page renders the picker in **identity-claimed banner** mode: "This identity is now claimed by a signed-in user. Pick yourself from the current roster or sign in to use the same identity." The picker's roster will show the claimed crew_member as deactivated (per §7.2 R41-R6 expanded predicate); the user must pick a different row OR sign in. API consumers return **401** (same as `epoch_stale`/`removed_from_roster` — the cookie is no longer a valid credential). The cataloged copy code is `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER`. The `cleanupStaleEntry` Server Action's compare-and-delete contract covers this case (the entry's `expectedEpoch` + `expectedCrewMemberId` route into the same form).
- (vacated — R41-R35 removed the `email_ambiguous` reason; only `claimed_after_pick` remains for `identity_invalidated`.)
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

`selectIdentity({ slug, shareToken, crewMemberId })` (R37 — must include the share-token to re-validate before cookie mint; R41-R33 — share-token re-validated INSIDE the locked RPC, not just before):

- `crewMemberId` must be a UUID; `slug` matches the slug-pattern; `shareToken` matches `^[0-9a-f]{64}$`. Pre-RPC JS-side validation rejects malformed input with `PICKER_INVALID_INPUT` (avoids round-tripping malformed strings to the DB).
- `select_identity_atomic(p_slug text, p_share_token text, p_crew_member_id uuid)` SECURITY DEFINER RPC — R41-R33 redesigned signature. Takes slug+shareToken directly (NOT a pre-resolved showId), and re-validates the share-token INSIDE the advisory lock. **R41-R33 CRITICAL: this closes a real race**: in the prior contract, JS code first called `resolve_show_by_slug_and_token` to get showId, then passed showId into `select_identity_atomic`. Between those two calls, an admin's `rotate_show_share_token` could acquire the lock, rotate the token (old token now invalid), bump picker_epoch (N → N+1), and release. The subsequent `select_identity_atomic` would acquire the lock, see picker_epoch = N+1, return success → JS mints a cookie with `e=N+1` AND `t=<post-rotation millis>` — a valid cookie minted from an already-invalid OLD share-token. Rotation contract broken. The fix: the RPC body now performs `resolve_show_by_slug_and_token(p_slug, p_share_token)` INSIDE its transaction (after acquiring the show's advisory lock based on `drive_file_id` looked up from the slug — see two-step lookup below), so a concurrent rotation that commits between JS submit and lock acquisition is observed at lock-entry and the RPC rejects.

  **Two-step lock acquisition** (since the RPC takes slug not showId): (1) `SELECT id, drive_file_id FROM public.shows WHERE slug = p_slug` (BEFORE any lock) → obtains drive_file_id for the lock-key derivation; (2) `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`; (3) AFTER the lock is held: `resolve_show_by_slug_and_token(p_slug, p_share_token)` → must return the same showId as step 1 AND must be NOT NULL. If NULL or different (rotation happened between step 1 and step 3), reject with `PICKER_INVALID_SHARE_TOKEN`. The slug→drive_file_id mapping is stable (slugs are deterministic from sheet title per `lib/parser/slug.ts` and don't rotate; only the share_token rotates).

  After the locked share-token re-validation, the RPC body performs ALL of: (a) `SELECT id, show_id, claimed_via_oauth_at FROM crew_members WHERE id = p_crew_member_id`: 0 rows → reject with `PICKER_CREW_MEMBER_NOT_FOUND`; show_id mismatch → reject with `PICKER_CREW_MEMBER_WRONG_SHOW`; **`claimed_via_oauth_at IS NOT NULL` → reject with `PICKER_IDENTITY_CLAIMED` (R41 Fix-2)**; (b) on success, returns `{ ok: true, show_id, crew_member_id, picker_epoch, observed_at_millis: floor(extract(epoch from clock_timestamp()) * 1000)::bigint }`. **R41-R35 amendment — the `same-show-email-count > 1` check is REMOVED**: an earlier R41-R6 draft added this check to defend against duplicate emails on the same show, but the live schema has a partial UNIQUE index `crew_members_show_email_unique ON (show_id, email) WHERE email IS NOT NULL` at `supabase/migrations/20260501000000_initial_public_schema.sql:49-51`. Duplicate same-show emails are IMPOSSIBLE at the schema level — a sync attempt to insert one fails at constraint-check time and surfaces via the existing pre-R41 sync-error pathway, never reaching the picker. The R41-R6 branches were dead defenses that the R41-R35 cleanup removes (see also: PICKER_IDENTITY_AMBIGUOUS code removed from §8.4; AMBIGUOUS_EMAIL_BINDING admin alert in claim_oauth_identity removed; identity_invalidated 'email_ambiguous' reason removed from resolver union and resolveShowPageAccess discriminator). **R41-R18 + R41-R22 + R41-R23 CRITICAL combined contract — the `observed_at_millis` field uses `clock_timestamp()` (NOT `now()` / `transaction_timestamp()`) so it reflects current wall-clock at the moment the IS-NULL check passed AFTER the advisory lock was acquired**, NOT the time the transaction began. The Server Action stamps cookie.t from this value. **R41-R23 critical**: without `clock_timestamp()`, a select_identity_atomic transaction that BEGAN before its lock was actually acquired (because a prior holder owned the lock) could return a too-early `observed_at_millis` predating the prior transaction's wall-clock work — but `clock_timestamp()` evaluated AFTER `pg_advisory_xact_lock` returns is strictly later than any wall-clock-captured value from a prior lock-released transaction's claim. The same fix applies to claim_oauth_identity's `claimed_via_oauth_at` stamp (uses `v_claim_at := clock_timestamp()` captured after all locks acquired, then UPDATE SET claimed_via_oauth_at = v_claim_at). All three layers (UI deactivation, server-side check, locked-clock-millisecond-timestamp) remain in place.
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
   - **Optional banner row** (R41-R17 base; R41-R35 simplified — present when resolver returns ANY of `epoch_stale`, `removed_from_roster`, OR `identity_invalidated` (single reason `claimed_after_pick`) from §6.1) — one-line copy in a 12px medium-weight inline note, FXAV-orange-tinted background (`bg-orange-100` / `bg-orange-900/30` in dark mode). 8px above the list. Banner copy selected per the §7.4 mode table: epoch-stale, removed-from-roster, or identity-claimed-after-pick (three modes).
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

**Deactivated-row contract (R41 amendment; R41-R35 simplified).** A row renders as **deactivated** when ONE predicate holds (R41-R35 removed the R41-R6 ambiguous-email predicate because the live schema's partial UNIQUE index `crew_members_show_email_unique ON (show_id, email)` makes the duplicate-email-on-same-show state impossible at the schema level — duplicate inserts fail at sync time):

1. **OAuth-claimed:** the underlying `crew_members.claimed_via_oauth_at` is non-null.
2. (vacated — R41-R35 removed the R41-R6 ambiguous-email predicate. Schema's partial UNIQUE index makes duplicate-email-on-same-show impossible.)

**Visual treatment is identical across both cases** (row background `var(--muted)` instead of `var(--card)`; name + chip text `color: var(--muted-foreground)`; lock icon 16px `color: var(--muted-foreground)` to the LEFT of the role chip), **but behavior diverges by reason (R41-R18 corrected)**:

1. **OAuth-claimed only** (`claimed_via_oauth_at IS NOT NULL` AND row is unique by email on this show): lock icon `aria-label="Sign in to use this identity"`. The `<button>` is tappable; form `action` is `/auth/sign-in?next=<tokenized URL>`. Tap completes the user's intent via OAuth flow. `data-claimed="true"`.
2. (vacated — R41-R35; the ambiguous-email row state is impossible per the schema constraint.)

**Picker render query (R41-R6)** must surface BOTH signals. The data fetcher joins:
- `crew_members.claimed_via_oauth_at` (per-row, direct column read).
(R41-R35: the `same_show_email_count` derived field is removed. The schema's UNIQUE index makes the count always 1 on populated rows; the SQL is redundant.)

A row renders as deactivated when `claimed_via_oauth_at IS NOT NULL`.

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

The picker has exactly **four** render modes (R41-R17 added identity-claimed-after-pick; R41-R35 removed identity-ambiguous):

| Mode | When | Visual delta |
| ---- | ---- | ------------ |
| **Initial** | `kind: 'no_selection'` (resolver cases 1, 2, 3) | No banner row. Standard heading + sub-instruction. |
| **Epoch-stale banner** | `kind: 'epoch_stale'` (resolver case 6) | Banner row present, copy: "Doug reset access for this show — pick yourself again." (`PICKER_EPOCH_STALE_BANNER`) |
| **Removed-from-roster banner** | `kind: 'removed_from_roster'` (resolver case 8) | Banner row present, copy: "Your previous selection was removed by Doug — pick yourself from the current roster." (`PICKER_REMOVED_FROM_ROSTER_BANNER`) |
| **Identity-claimed-after-pick banner (R41-R17)** | `kind: 'identity_invalidated', reason: 'claimed_after_pick'` (resolver case 9) | Banner row present, copy: "This identity is now claimed by a signed-in user. Pick yourself from the current roster or sign in to use the same identity." (`PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER`). The previously-picked crew row renders as deactivated (R41-R6 expanded predicate); user must pick a different row OR sign in. |
| (vacated — R41-R35) | (vacated — `identity_invalidated/email_ambiguous` reason removed; schema makes the state impossible.) | — |

The brand strip, show identifier strip, picker block (heading, sub-instruction, list), and footer are **identical across all four modes**. Only the banner row varies. All three banner modes (epoch-stale, removed-from-roster, identity-claimed-after-pick) also mount `<StaleCleanupAutoSubmit>` per §4.9 R41-R15 trigger-set expansion.

### 7.5 Cap / truncation behaviour

- **Roster cap**: no software cap. The `<unique (show_id, name)>` constraint at `20260501000000_initial_public_schema.sql:43` is the only natural limit (no duplicate names per show). At >50 entries the page scrolls naturally; the spec does not introduce virtualization. If Doug's shows ever exceed 100 crew, follow-up work adds search + virtualization.
- **Cookie cap (per Resolved Decision 6)**: byte-budget at 3800 bytes encoded. On every `selectIdentity` write, the encoder evicts the entry with the lowest `t` (last-touch unix-milliseconds per §6.0) until the encoded value fits the budget. **Cookie wire shape with timestamps**:
  ```json
  {
    "v": 1,
    "selections": {
      "<uuid>": { "id": "<uuid>", "e": 1, "t": 1779514142000 }
    }
  }
  ```
  `t` is a unix-MILLISECOND timestamp (13-digit; example value `1779514142000` represents 2026-05-23 — note the 13 digits, NOT 10; seconds-scale example values are FORBIDDEN per §6.0). **R41-R44: `t` stamping vs cookie mutation are separate concerns.** TWO surfaces stamp a `t` value (mint or refresh an entry): `selectIdentity` stamps from `select_identity_atomic.observed_at_millis`; `/api/auth/picker-bootstrap` stamps from `claim_oauth_identity.mint_safe_t_millis`. THREE surfaces mutate the cookie without stamping `t` (they remove entries or clear the whole cookie): `clearIdentity` removes one entry; `cleanupStaleEntry` removes one entry; `/auth/sign-out` clears the entire cookie with `Max-Age=0` (R41-R41 credential-lifetime fix). Total: FIVE cookie-mutator surfaces (per §6.0 and R41-R41 final list); TWO of them stamp `t`. Both stamping surfaces use DB-side `clock_timestamp()` (NOT `now()`) per the R41-R23 finding. Reads never emit `Set-Cookie`; `resetPickerEpoch`/`/auth/callback` never touch the cookie. See §6.0 for the canonical timestamp-defense contract.
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
- (R41-R35 removed `PICKER_IDENTITY_AMBIGUOUS_BANNER` — the `email_ambiguous` reason no longer exists in the resolver union; schema constraint makes the state impossible.)
- `PICKER_EMPTY_ROSTER`: the empty-state copy when the show's roster has no rows yet. Default copy: "Doug hasn't added crew yet — check back soon." Used by §7.3 guard condition.
- `PICKER_SHOW_UNAVAILABLE`: rejection copy when `selectIdentity` runs against an unpublished or archived show. Default copy: "This show isn't available right now. Ask Doug for an updated link if you think this is a mistake." Used by §6.2 rejection paths.

**New rejection codes for `selectIdentity` (R33 amendment — all carry both `dougFacing` operator copy AND `crewFacing` user copy, because these paths fire from user-triggered form submits and must never surface as raw codes per AGENTS.md invariant 5):**

- `PICKER_INVALID_INPUT`: `showId` or `crewMemberId` failed UUID validation in the Server Action. Crew-facing copy: "Something went wrong with that selection. Please try picking your name again." Operator-facing: full details (which field, what value). On render: the picker re-displays with the cataloged crew-facing copy as an error banner above the list.
- `PICKER_CREW_MEMBER_NOT_FOUND`: row not present at the moment of selection (sync ran between picker render and submit, OR Doug removed the crew member in the same window). Crew-facing copy: "That crew member was just removed from this show. Pick yourself from the current roster." Operator-facing: `{ show_id, attempted_crew_member_id, observed_at }`. On render: the picker re-displays with the cataloged crew-facing banner.
- `PICKER_CREW_MEMBER_WRONG_SHOW`: form-tamper defense (the submitted `crewMemberId` belongs to a different show's roster). Crew-facing copy: "Something went wrong with that selection. Please try picking your name again." (Deliberately matches `PICKER_INVALID_INPUT` to avoid signaling form-tamper specifics to a probing client.) Operator-facing: full details flagged as a possible tamper signal.
- **`PICKER_IDENTITY_CLAIMED` (R41 Fix-2):** the submitted `crewMemberId` row has `claimed_via_oauth_at IS NOT NULL`. Crew-facing copy: "This name is claimed by a signed-in user. Sign in with their Google account to use it." Operator-facing: `{ show_id, attempted_crew_member_id, observed_claimed_at }`. On render: the Server Action returns a redirect to `/auth/sign-in?next=<encoded tokenized URL>` (the same destination the UI's deactivated-row form-action targets) rather than re-displaying the picker with an error banner — this matches the UX contract from §7.2 (tapping a deactivated row leads to sign-in). Cataloged in `lib/messages/catalog.ts`. Carries the `tamper` log-flag (a form-tampered submission of a claimed crew row IS suspicious).
- (R41-R35 removed `PICKER_IDENTITY_AMBIGUOUS` — the rejection-code class is no longer reachable. Schema constraint `crew_members_show_email_unique` makes the duplicate-email-on-same-show state impossible; the prior R41-R6 / R41-R18 same-show-email-count check is no longer needed.)
- **`PICKER_BOOTSTRAP_RPC_FAILED` (R41-R7 Fix-2):** emitted from `/api/auth/picker-bootstrap` when `claim_oauth_identity` returns an error or throws. Crew-facing copy: "Couldn't sign you in. Please try again in a moment." Operator-facing: `{ user_email, rpc_error_code, rpc_error_message }`. On render: the handler returns 502 with the cataloged terminal-failure UI (HTML response, NOT a redirect — R41-R7 fail-closed contract prevents the infinite redirect loop the reviewer flagged). Cataloged in `lib/messages/catalog.ts`. ALSO emitted to `admin_alerts` with the same code so operators can investigate persistent failures.
- `PICKER_RESOLVER_LOOKUP_FAILED`: `resolvePickerSelection`'s DB read failed (returned error or thrown infra fault). Crew page renders the existing cataloged terminal-failure UI; API routes return 500. Catalog entry includes both `dougFacing` operator copy (for admin logs / `admin_alerts`) and `crewFacing` copy (for the page render via `messageFor(...)`). The `tests/messages/_metaAdminAlertCatalog.test.ts` registry is extended to assert this code is cataloged before any consumer uses it.

**R41 amendment — sign-in / claim codes:**

- `SIGN_IN_OR_SKIP_PROMPT`: crew-facing copy on the `<SignInOrSkipGate>` interstitial (§7.1a). Default copy: "Sign in to use the same identity on every show, or skip to pick from this show's roster." Operator copy unused (informational; never logged to `admin_alerts`).
- `IDENTITY_DEACTIVATED_LOCK_HINT`: crew-facing copy on the deactivated picker row's lock icon `aria-label`. Default copy: "Sign in to use this identity." (§7.2 R41).
- `OAUTH_IDENTITY_CLAIMED`: emitted to `admin_alerts` when `claim_oauth_identity()` updates 1+ crew rows (§4.8). **R41 P-R9 Fix-3**: emitted PER-ROW (one alert per claimed row, scoped to that row's `show_id` — NOT one aggregate alert with `show_id=NULL`). Context: `{ crew_member_id: uuid, show_id: uuid, claimed_at_millis: bigint, user_email_hash: text }`. **NEVER raw `user_email`** — the `attempted_email_hash`/`user_email_hash` form is mandatory across all admin_alerts producers (P-R9 Fix-2 / Fix-3 reconciliation). The `_metaAdminAlertCatalog` registry asserts this code is cataloged AND that no `user_email` (raw) or `claimed_count` field appears in any OAUTH_IDENTITY_CLAIMED emission site (these would be aggregate-shape regressions). Informational.
- `PICKER_BOOTSTRAP_RPC_FAILED`: emitted to `admin_alerts` when `claim_oauth_identity` returns error OR throws inside picker-bootstrap (§4.7 R41-R7 fail-closed). Context: `{ attempted_email_hash: text, rpc_error_code: text, rpc_error_message: text, route: text }`. NEVER raw email.
- `CALLBACK_CLAIM_THREW`: emitted to `admin_alerts` when the callback claim-stamp block (§4.8) throws an exception (network fault, schema drift, undeclared SDK exception). show_id is NULL. Context: `{ error_name: text }` only — operator-triage signal, no PII.
- `OAUTH_CLAIM_NO_ROWS`: NOT cataloged — silent success when `claim_oauth_identity()` matches 0 crew rows. The function returns affected-row count to the caller; no alert is emitted (otherwise every admin-user sign-in would spam alerts).
- (R41-R35: the `AMBIGUOUS_EMAIL_BINDING` emission from `claim_oauth_identity` is REMOVED — the SQL no longer detects ambiguous rows because the schema's partial UNIQUE index makes the state impossible. The pre-pivot `AMBIGUOUS_EMAIL_BINDING` code in `validateGoogleSession.ts` MAY remain as a defensive surface for a hypothetical schema-corruption scenario, but R41 introduces no new emission paths.)

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
| `tests/admin/no-inline-email-normalization.test.ts` (existing) | **EXTEND (R41-R16/R41-R17 invariant-3 enforcement; R41-R35 scope reduced)** | Picker proper doesn't touch emails, but R41 OAuth integration does. EXTEND the meta-test to scan: (a) `app/auth/callback/route.ts` for `canonicalize(user.email)` usage and forbid inline `.toLowerCase()` / `.trim()` on email strings; (b) `app/api/auth/picker-bootstrap/route.ts` for the same; (c) `supabase/migrations/**` SQL files defining `claim_oauth_identity` AND `select_identity_atomic` for inline `lower(trim(...))` on `email` columns or parameters — forbid; (d) `resolvePickerSelection.ts` for any `lower(trim(email))` patterns — forbid (the resolver compares already-canonical column values via `=`). The R41-R17 scan items (e) and (f) covering the ambiguous-email subquery + picker-render PARTITION BY window are REMOVED in R41-R35 along with the underlying SQL surfaces; the four-surface scan above is sufficient. All four extensions enforce AGENTS.md invariant 3 (one canonicalization boundary). |
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
- **Picker-bootstrap Route Handler (R41-R2 new, `/api/auth/picker-bootstrap`; R41-R5 + R41-R6 hardened; R41-R25 exact-timestamp assertion)** — request to `/api/auth/picker-bootstrap?next=/show/<slug>/<share-token>&t=<intent-token>` with Google session. **All success-path tests MUST include a valid `t` parameter**. Tests assert: (a) `next` validated against `validateNextParam.ts` allowlist (regex matches `^/show/[a-z0-9-]+/[0-9a-f]{64}$`); (b) intent token verified (HMAC valid + not expired + embedded slug/shareToken matches `next`) — failure → 403 not 302; (c) `resolve_show_by_slug_and_token` re-validates the slug+token pair, NULL → 302 to `/` with no cookie set; (d) `validateGoogleSession` → no session → 302 to `next` with no cookie set; (e) `validateGoogleSession` resolves + email matches exactly one crew_members row for THIS show (the target derived from `next`) → cookie's entry for THIS show_id ONLY updated with `{ id: <crewMemberId>, e: <picker_epoch>, t: <result.mint_safe_t_millis> }`. **R41-R25 exact-value assertion**: the test stubs `claim_oauth_identity` to return a fixture `mint_safe_t_millis` (e.g., `1737028800123`) AND asserts the Set-Cookie payload's `t` field equals that value EXACTLY, NOT approximately and NOT `<= Date.now()`. An implementation that uses `Date.now()` as the source instead of `result.mint_safe_t_millis` would produce a different (and likely earlier or later) value and FAIL this assertion, catching the R41-R24 clock-source regression at test time. Entries for other shows in the envelope are byte-identical pre/post + 302 to `next`; (f) `validateGoogleSession` resolves but email NOT in this show's crew_members → 302 to `next` with NO cookie set; (g) the cookie set carries `Max-Age=7776000`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, name `__Host-fxav_picker`; (h) the handler is in the cookie-mutator allowlist; (i) **one-show-only assertion** (R41-R6): when `claim_oauth_identity` returns `{ shows: [A, B, C] }` and `target_show_id` is A, the response envelope contains an entry for A but NOT for B or C.
- **Deactivated row tap-redirect (R41 amendment, §7.2; R41-R35 simplified — ambiguous states removed)** — picker rendered with a roster containing crew members in two states:
  - **State A (OAuth-claimed)**: `claimed_via_oauth_at IS NOT NULL`. Row deactivated; `data-claimed="true"`.
  - **State B (clean unclaimed)**: `claimed_via_oauth_at IS NULL`. Row active, selectable.
  (The R41-R6 ambiguous-NULL and ambiguous-stamped states are REMOVED in R41-R35 — schema's partial UNIQUE index `crew_members_show_email_unique` makes duplicate-email-on-same-show impossible at the row level; the `data-ambiguous` attribute is also removed.)
  Tests assert: (a) State A row: `aria-label="Sign in to use this identity"`, form `action="/auth/sign-in?next=..."`, tap triggers OAuth redirect; (b) State B row: fully active with selectIdentity action; (c) `data-claimed="true"` emitted on State A only; (d) deactivated form does NOT mint a picker cookie (Set-Cookie absent on tap). **R41-R6 + R41-R18 server-side enforcement test**: hand-craft a Server Action POST for a State A row's `crewMemberId`. Assert: the Server Action returns `PICKER_IDENTITY_CLAIMED` cataloged response which redirects to `/auth/sign-in?next=...`; NO `Set-Cookie` for `__Host-fxav_picker`; structured log carries `tamper` flag.
  Anti-tautology: deactivation state is derived from the fixture's `claimed_via_oauth_at` field, not from a position index.
- **Cross-show claim consistency (R41 amendment)** — fixture: two published shows (Show-A, Show-B), one crew member with the same email on both, currently claimed on neither. Test: invoke `claim_oauth_identity(<email>)`. Asserts: (a) BOTH rows now carry `claimed_via_oauth_at` (the function operates by email, not by show); (b) opening Show-A's picker shows the row as deactivated; (c) opening Show-B's picker also shows the row as deactivated. Regression against partial-claim drift (the function MUST stamp all matching rows in a single statement).
- **`PICKER_IDENTITY_CLAIMED` server-side enforcement (R41 Fix-2 regression)** — negative test against hand-crafted Server Action POST. Fixture: a crew member with `claimed_via_oauth_at = '2026-05-23T...'`. Bypassing the deactivated-row UI, invoke `selectIdentity({ slug, shareToken, crewMemberId: <claimed-id> })` directly via a fetch with the form-encoded body. Assert: (a) the action returns a redirect to `/auth/sign-in?next=...` (the cataloged response for `PICKER_IDENTITY_CLAIMED`); (b) NO `Set-Cookie` header for `__Host-fxav_picker` is emitted; (c) the `select_identity_atomic` RPC's SQL inside the DB log shows the `claimed_via_oauth_at IS NULL` predicate (DB-level assertion via test instrumentation); (d) the structured log carries a `tamper` flag with `{ show_id, attempted_crew_member_id, observed_claimed_at }`. **Concurrency variant**: invoke `selectIdentity` and `claim_oauth_identity` concurrently for the same crew member; assert exactly one outcome (either the select wins and the claim stamps a new row leaving the cookie minted, OR the claim wins first and select rejects with `PICKER_IDENTITY_CLAIMED`) — never both. The per-show advisory lock guarantees this serialization; the test verifies the contract.
- **`select_identity_atomic` old-token-rotation race (R41-R33 HIGH regression — NEW)** — fixture: Show-X has share_token = `OLD_TOKEN`, picker_epoch = N. T0: Mallory's browser submits selectIdentity with `{ slug, shareToken: OLD_TOKEN, crewMemberId }`. T1: BEFORE Mallory's `select_identity_atomic` acquires the Show-X lock, admin clicks Rotate: `rotate_show_share_token` acquires lock, sets share_token = `NEW_TOKEN`, bumps picker_epoch = N+1, releases lock. T2: Mallory's `select_identity_atomic` finally acquires the Show-X lock. **Without R41-R33**: the prior contract had JS resolve slug+token first (at T0, returning showId) and pass only showId into the RPC; the RPC then read picker_epoch = N+1 inside the lock and returned success. Mallory's cookie was minted with `e = N+1` (post-rotation valid epoch) AND `t = T2_millis` — a fully valid cookie sourced from an already-invalid OLD share-token. Rotation contract broken. **With R41-R33**: the RPC receives `(p_slug, p_share_token, p_crew_member_id)` directly and re-validates `resolve_show_by_slug_and_token(p_slug, p_share_token)` INSIDE the lock. At T2, the lookup with `OLD_TOKEN` returns NULL (rotation already happened at T1). RPC rejects with `PICKER_INVALID_SHARE_TOKEN`. Mallory's Server Action returns the cataloged rejection; NO cookie minted. Tests assert: (a) the RPC's response is `PICKER_INVALID_SHARE_TOKEN`; (b) no `Set-Cookie` header for `__Host-fxav_picker` is emitted; (c) `shows.picker_epoch` is unchanged by Mallory's RPC call; (d) Mallory's old-URL re-navigation returns 404 (the route handler's `resolve_show_by_slug_and_token` also returns NULL). The DB-level concurrency test uses parallel transactions with explicit `BEGIN; pg_sleep(0.05); ...` to orchestrate the T0-T1-T2 ordering deterministically.
- **`select_identity_atomic` locked-timestamp regression (R41-R18 CRITICAL; R41-R22 millisecond precision; R41-R23 clock_timestamp() lock-contention defense)** — fixture: Mallory attempts a bypass pick for Alice's crew row; Alice's `claimed_via_oauth_at` is currently NULL. Three transaction interleave scenarios:
  - **Scenario A: lock-serial, no contention** — T0 Mallory's select_identity_atomic acquires Show-X lock; T1 captures `observed_at_millis = clock_timestamp_millis = T1`; T2 commits, releases; T3 Alice's claim_oauth_identity acquires Show-X lock, captures `v_claim_at = clock_timestamp() = T3` (> T2 > T1), updates `claimed_via_oauth_at = T3`. Mallory's cookie.t=T1, claim_epoch=T3, T1 <= T3 → invalidated. ✓
  - **Scenario B: R41-R23 CRITICAL — claim begins first but blocks on Mallory's lock** — T0 Alice's claim_oauth_identity BEGIN (transaction_timestamp = 0); acquires Show-A's lock at T0; tries Show-X's lock — BLOCKS. T5 Mallory's select_identity_atomic BEGIN (transaction_timestamp = 5); acquires Show-X (Alice doesn't yet hold it); captures `observed_at_millis = clock_timestamp_millis = T5_or_later`; T10 commits. T10 Alice acquires Show-X lock; captures `v_claim_at = clock_timestamp() = T10_or_later`; UPDATE SET claimed_via_oauth_at = T10. Mallory's cookie.t = T5_or_later, claim_epoch = T10_or_later. With `clock_timestamp()` (R41-R23): claim_epoch >= cookie.t + lock-acquisition-wait > cookie.t. Mallory invalidated. ✓ **Without R41-R23 (the buggy `now()` path)**: Alice's UPDATE would stamp `claimed_via_oauth_at = transaction_timestamp = T0 < T5 = Mallory's observed_at_millis`. Mallory's cookie.t (T5) > claim_epoch (T0) → resolver INCORRECTLY resolves; Mallory continues as Alice indefinitely. The test pins the `clock_timestamp()` choice by orchestrating this exact contention (acquire Show-A first, BEGIN claim, then race Mallory's lock-grab) and asserting Mallory's invalidation.
  - **Scenario C: R41-R22 same-millisecond tie** — Mallory's observed_at_millis and Alice's v_claim_at land in the same millisecond (rapid burst on a fast local DB). The `<=` invalidation rule (NOT `<`) catches the tie: cookie.t (T_ms) <= claim_epoch (T_ms) true → invalidated. ✓

  All three scenarios assert Mallory's cookie is rejected (API → 401; page re-prompts with CLAIMED_AFTER_PICK banner). Without R41-R23, Scenario B fails (Mallory continues impersonating). The clock_timestamp() + `<=` combination is the structural defense; the test pins both.
- **`claim_oauth_identity` advisory-lock topology (R41 Fix-1 regression; R41-R10 explicit-loop pin)** — DB-level test against the SECURITY DEFINER body. Fixture: 3 published shows sharing one crew email. Concurrent test (two parallel transactions): T1 invokes `claim_oauth_identity` for the email; T2 invokes `reset_picker_epoch_atomic` for Show-1. Assert: T1 and T2 complete without deadlock. **R41-R10 lock-order pin**: a new DB concurrency test exercises two `claim_oauth_identity` calls in flight for two DIFFERENT emails whose show sets overlap in opposite natural scan orders. Fixture: emailA's shows = {S1, S3}; emailB's shows = {S3, S1} (same shows, different table-scan order possible if planner reorders). Concurrent T1 = `claim_oauth_identity(emailA)`, T2 = `claim_oauth_identity(emailB)`. Assert: NO deadlock under repeated runs (statistical: at least 100 invocations). The PL/pgSQL FOR loop with `ORDER BY drive_file_id` MUST acquire S1's lock before S3's lock in both transactions; if either acquires in reverse order, the test deadlocks (caught by a 5-second statement timeout). This pins R41-R10's explicit-loop requirement — a regression to set-based PERFORM ... ORDER BY would fail this test. Lock-holder assertion: extend `tests/auth/advisoryLockRpcDeadlock.test.ts` to enumerate every `pg_proc.proname` in `public` that touches `crew_members`; static-analysis grep of the RPC body asserts `for ... in ... order by ... loop ... perform pg_advisory_xact_lock(...) ... end loop` pattern is present (any regression to the set-based form fails CI before runtime). **Single-holder pin**: the JS-side caller of `claim_oauth_identity` in `app/auth/callback/route.ts` MUST NOT wrap the RPC call in `lockedShowTx`/equivalent.
- **`claim_oauth_identity` UPDATE-set materialization (R41-R2 race-fix regression)** — DB-level concurrent test against the new CTE-restricted UPDATE. Fixture: user has crew_members rows on Show-A and Show-B; a third Show-C exists but the user is NOT yet on its roster. Concurrent (two parallel transactions): T1 invokes `claim_oauth_identity(email)`; T2 INSERTs a crew_members row for the email on Show-C IMMEDIATELY after T1 has acquired its Show-A + Show-B locks but BEFORE its UPDATE statement runs. Assert: T1's UPDATE does NOT stamp the Show-C row (it's not in the locked set materialized at lock-acquisition time); the Show-C row remains `claimed_via_oauth_at IS NULL`. T2's INSERT commits without holding any advisory lock on Show-C (regression note: sync_apply DOES acquire the lock; this test fixture mimics the raw INSERT pattern only to verify T1's filter). On the NEXT callback invocation (or `claim_oauth_identity` re-call), Show-C is in the new locked set and gets stamped. This pins the R41-R2 R2 HIGH fix.
- **Cookie-mutator allowlist (R41-R41 final §10.1)** — extend `tests/auth/_metaPickerCookieContract.test.ts` to add BOTH `app/api/auth/picker-bootstrap/route.ts` (mints with `Max-Age=7776000`) AND `app/auth/sign-out/route.ts` (clears with `Max-Age=0`) to the allowed cookie-mutator file list (alongside `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`). **`app/auth/callback/route.ts` is explicitly BANNED from picker-cookie mutation** — the meta-test asserts the callback route does NOT call `cookies().set('__Host-fxav_picker', ...)` (it CAN read the cookie via `cookies().get()` for diagnostic logging, but never writes). Any other file calling `cookies().set('__Host-fxav_picker', ...)` fails the audit. The middleware file remains explicitly banned per R16 contract.
- **Sign-out clears picker cookie (R41-R41 HIGH regression — NEW vector)** — fixture: user signs in via Google; OAuth callback stamps `claimed_via_oauth_at`; user visits a show URL; page route redirects to `/api/auth/picker-bootstrap`; bootstrap mints a picker cookie with `{id: <crewId>, e: 1, t: <millis>}`. Then user POSTs `/auth/sign-out`. Tests assert: (a) sign-out response includes BOTH `Set-Cookie: <supabase-auth-cookie>=; Max-Age=0` for the Supabase Auth session cookies AND `Set-Cookie: __Host-fxav_picker=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` (picker-cookie clear); (b) browser-side cookie store post-sign-out has neither cookie; (c) **shared-device regression**: simulate a follow-up request from the same browser to `/show/<slug>/<token>` immediately after sign-out (no cookies attached). Assert: the page renders the SignInOrSkipGate (NOT `_ShowBody`); API consumers return 401. **Without R41-R41 fix**: the picker cookie would survive sign-out and the follow-up request would render as the signed-out user's identity, leaking show access to the next user on the shared device.
- **No picker-bootstrap redirect loop (R41-R3 CRITICAL regression; R41-R7 RPC-failure path repaired)** — fixture: user has a `crew_members` row on Show-X with `claimed_via_oauth_at IS NULL` (Doug added them post-sign-in; the OAuth callback never ran for this row). Request flow: (1) GET `/show/<slug-X>/<token-X>` with Google session + NO picker cookie entry for Show-X; (2) page route detects Google session + matching row + no cookie → returns 302 to `/api/auth/picker-bootstrap?next=/show/<slug-X>/<token-X>&t=<token>` (the redirect URL is asserted byte-for-byte to contain `&t=`); (3) follow the redirect; (4) picker-bootstrap verifies intent token (passes), invokes `claim_oauth_identity(email)` which stamps Show-X and returns `{ claimed_count: 1, shows: [{...}] }`; (5) handler mints cookie entry for Show-X + 302 to next; (6) follow the redirect; (7) page route step 6 reads the cookie, returns `{ kind: 'resolved' }`, renders `_ShowBody`. **Assert no third redirect**. **R41-R7 RPC-failure variant** — same fixture but `claim_oauth_identity` simulated to throw infra fault on first call: handler returns 502 + cataloged `PICKER_BOOTSTRAP_RPC_FAILED` terminal-failure HTML page; NO 302; structured log carries the operator code AND `admin_alerts` row is inserted. Test asserts: (a) HTTP status is 502; (b) response body contains the cataloged crew-facing copy; (c) NO `Location` header; (d) NO `Set-Cookie` for `__Host-fxav_picker`; (e) redirect-chain depth is 1 (the initial page → bootstrap; bootstrap stops there, no 502→bootstrap loop). **Without R41-R7 fail-closed**: the buggy alternative would 302 back to next; the page would re-detect Google-session + matching row + still-no-cookie → re-redirect → INFINITE LOOP. The test pins the fail-closed contract.
- **`claim_oauth_identity` locked-set integrity (R41-R3 CRITICAL regression)** — DB-level concurrent test against the array-materialization fix. Fixture: user has crew rows on Show-A and Show-B (locked set initially = {A, B}); Show-C exists with no rows for this user. Concurrent (two parallel transactions): T1 invokes `claim_oauth_identity(email)`; T2 INSERTs a `crew_members` row for the email on Show-C IMMEDIATELY after T1's lock-acquisition pass but BEFORE T1's UPDATE. Assert: (a) T1's `v_locked_show_ids` array does NOT contain Show-C (the array was materialized BEFORE T2's INSERT in T1's snapshot); (b) T1's UPDATE does NOT stamp the Show-C row (the WHERE clause filters `show_id = any(v_locked_show_ids)`); (c) T1's returned `shows` array does NOT contain Show-C — even though a SELECT under READ COMMITTED would find the new row; (d) T2's INSERT commits without affecting T1's result. Next callback for this email DOES stamp Show-C (in the next round's locked set). This pins the R41-R3 R2 CRITICAL fix.
- **Ambiguous-email handling — REMOVED (R41-R35)**. The R41-R3/R41-R4/R41-R19 test was a DB-level regression against the `claim_oauth_identity` SQL's GROUP BY HAVING COUNT(*) > 1 ambiguous-detection logic. Per R41-R35 that SQL block is removed because the schema's partial UNIQUE index `crew_members_show_email_unique` makes the test fixture unsatisfiable: any attempt to seed two crew_members rows with the same `(show_id, email)` would fail at INSERT time with a unique-constraint violation. The constraint itself IS the canonical defense; a separate constraint-level test (verifying that the seed `INSERT INTO crew_members (show_id, email) VALUES (X, 'e@x.com'), (X, 'e@x.com')` returns SQLSTATE 23505) is sufficient and lives in the existing schema-introspection test suite, not in R41's specific test inventory.
- **`resolveShowPageAccess` is a pure resolver (R41-R3 HIGH regression)** — static analysis test. Assert: `lib/auth/picker/resolveShowPageAccess.ts` does NOT import (a) `signEnvelope` / `encodeEnvelope` / any other export from `lib/auth/picker/cookieEnvelope.ts`; (b) `cookies` from `next/headers`; (c) the picker-bootstrap route handler or its helpers. The helper's only side effects are SELECTs against the DB; it returns a pure discriminated union. The companion runtime test: invoke `resolveShowPageAccess` with each of the 11 documented chain outcomes (R41-R35: `ambiguous_email` arm removed) and assert the response object matches the expected `kind` discriminator with no `Set-Cookie` header in the calling context.
- **Ambiguous-email avoids redirect loop — REMOVED (R41-R35)**. The fixture is unsatisfiable per the schema constraint (see above). The `resolveShowPageAccess` `ambiguous_email` arm is also removed.
- **Picker-bootstrap CSRF intent-token defense (R41-R4 HIGH regression)** — eight test cases against `/api/auth/picker-bootstrap`: (1) missing `t` param → 403 (NOT 302; CSRF defense MUST fail-closed); (2) `t` malformed (wrong format) → 403; (3) `t` HMAC invalid (key mismatch / tampered) → 403; (4) `t` expired (`exp < now`) → 403; (5) `t` valid but its embedded `{slug, shareToken}` doesn't match the `next` URL's parsed slug+token → 403; (6) all valid, no Google session → 302 to `next` with no cookie set (graceful, NOT 403 — the CSRF check passed; the auth check is a separate concern); (7) all valid, Google session matching crew → cookie minted + 302; (8) **CSRF simulation test**: forge an HTML page on a different origin that includes `<img src="https://app/api/auth/picker-bootstrap?next=/show/<slug>/<token>">`; an authenticated user clicking the page → the image fails to load (403 from server, no cookie mint, no DB write to `claim_oauth_identity`); the test asserts `claim_oauth_identity` was NOT called (DB query log) AND no `Set-Cookie` header was sent. The intent-token defense pins the R41-R4 R2 HIGH fix. **Intent token format spec**: `base64url(JSON({slug, shareToken, exp})) + '.' + base64url(HMAC-SHA256(payload, pickerCookieSigningKey))`. Reuses the same env-var signing key as the cookie envelope (single secret, dual-purpose; the §10.1 picker-cookie meta-test asserts both consumers reference the same constant `PICKER_COOKIE_SIGNING_KEY`).
- **Cookie-write concurrency contract (R41-R6 honest-accounting tests)** — replaces the prior fill-in-the-blanks tests (which over-promised cross-handler merge). Three scenarios using FIXED `Cookie:` request headers (modeling browser snapshot at request-send time, NOT live merge):
  - **Callback writes NO cookies, EVER**: fixture: user has crew rows on Show-A, Show-B. T0: user picks `{Show-A: C-A}` via selectIdentity. T0': in parallel, `/auth/callback` fires after a separate OAuth sign-in tab. Test asserts: (a) the callback response has NO `Set-Cookie` header for `__Host-fxav_picker` — regardless of what the request cookie contained; (b) `claim_oauth_identity` IS called (DB-side stamp); (c) post-callback cookie is unchanged byte-for-byte (it remains `{Show-A: C-A}` from selectIdentity's write). This pins R41-R6's lazy-mint contract: callback NEVER writes picker cookies; the bulk-write race surface is structurally eliminated.
  - **Picker-bootstrap writes ONE SHOW's entry**: fixture: user picks `{Show-A: C-1}` via selectIdentity at T0. Then visits Show-B (a different show) with Google session + email matches Show-B's crew row C-2. Page → bootstrap. Test asserts: (a) bootstrap response sets cookie containing BOTH `{Show-A: C-1, Show-B: C-2}` (Show-A's entry preserved byte-identical because it was in the request cookie); (b) bootstrap does NOT add an entry for any other show even if `claim_oauth_identity` returned `{shows: [A, B, C]}` — the lazy-mint one-show contract is structurally enforced. Cross-show interference is impossible because bootstrap only writes target_show_id.
  - **Picker-bootstrap for Show-X racing selectIdentity for Show-Y (the residual accepted race)**: both writes reset the whole envelope. T0: bootstrap request sent with cookie `{}`. T0': selectIdentity request sent with cookie `{}`. T100: selectIdentity response writes `{Show-Y: pick}`. T200: bootstrap response writes `{Show-X: oauth}` (bootstrap's request cookie was `{}`, so its written envelope has only Show-X). Browser applies last-Set-Cookie-wins: final cookie is `{Show-X: oauth}` — Show-Y's selectIdentity write is LOST. Test asserts: this lost-update IS observable on the wire (no false-merge promise); user-recovery path: re-pick Show-Y from picker. This pins the documented residual race per §4.10 (5) — the test exists to assert the spec's documented behavior, not to claim the race is fixed.
  - **Same-show race, picker-bootstrap vs selectIdentity for Show-A**: T0: bootstrap and selectIdentity both started for Show-A with cookie `{}`. Bootstrap resolves to C-2 (OAuth match); selectIdentity attempted to pick C-1. Whichever response writes last wins on the browser. Test asserts: post-race cookie is either `{Show-A: C-1}` (selectIdentity wins) OR `{Show-A: C-2}` (bootstrap wins) — both are valid outcomes. The deactivation contract on subsequent renders fires regardless because `claimed_via_oauth_at` is stamped server-side.
- **Stale-credential mapping across all API consumers (R41-R8 base; R41-R35 simplified)** — for every route in §6 that calls `resolvePickerSelection` (subscriber-token, version, asset/{diagram,reel,agenda}, report), the test matrix asserts: (a) `kind: 'epoch_stale'` → 401 with no resource body; (b) `kind: 'removed_from_roster'` → 401 with no resource body; (c) `kind: 'identity_invalidated', reason: 'claimed_after_pick'` → 401; (d) `kind: 'show_unavailable'` → 410; (e) `kind: 'infra_error'` → 500; (f) `kind: 'no_selection'` → 401 (no credential at all). Six distinguishable wire outcomes. Each status is distinguishable on the wire so `ShowRealtimeBridge` can treat 401 as `forceRefresh` and 410 as "this show is gone."
- **Pre-claim picker cookie is invalidated after OAuth claim (R41-R8 HIGH regression)** — three sub-scenarios:
  - **Sub-A: a user picked bypass identity, then a different user signs in via OAuth for that identity**. Fixture: T0: Mallory picks Alice's crew row via selectIdentity; Alice's `claimed_via_oauth_at` is NULL, so the pick succeeds; Mallory's cookie has `{Show-X: {id: Alice's crew id, e: 1, t: 100}}`. T1 (later): Alice signs in via Google OAuth; callback fires `claim_oauth_identity`; Alice's row's `claimed_via_oauth_at = 200` (later than 100). T2: Mallory's browser makes a request to `/show/<slug-X>/<token-X>` or any API consumer for Show-X with her T0 cookie. Tests assert: (a) `resolvePickerSelection` returns `{ kind: 'identity_invalidated', reason: 'claimed_after_pick' }` — derived from `cookie.t (100) < extract(epoch from claimed_via_oauth_at) (200)`; (b) page route renders the picker with the `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` banner; (c) Mallory's row for Alice (deactivated per §7.2 R41-R6 because `claimed_via_oauth_at IS NOT NULL`) cannot be re-picked; (d) any API consumer returns 401; (e) the `cleanupStaleEntry` Server Action receives the right `expectedEpoch + expectedCrewMemberId` and compare-and-deletes Mallory's stale entry on auto-submit.
  - (Sub-B REMOVED — R41-R35; fixture relied on a duplicated-email roster the schema prevents.)
  - **Sub-C: the OAuth user's OWN cookie is preserved (negative regression)**. Fixture: Alice signs in via OAuth; `claimed_via_oauth_at = 200000ms`; picker-bootstrap mints her cookie at `t = mint_safe_t_millis = 200001` (strictly greater than the claim by +1ms per §6.0 mint_safe_t_millis formula). Alice visits Show-X. Tests assert: (a) `resolvePickerSelection` returns `{ kind: 'resolved' }` (NOT `identity_invalidated`) because `cookie.t (200001) > claim_epoch_millis (200000)` per the §6.0 strict-greater step-9 boundary; (b) page renders `_ShowBody`; (c) API consumers return 200. Additional millisecond-boundary fixture: `cookie.t = 200000` (equal to claim_epoch_millis) → `resolvePickerSelection` returns `identity_invalidated/claimed_after_pick` per §6.0 step-9 `<=` invalidation rule. Equality MUST NOT resolve.
  - **R41-R30 fractional-millisecond regression (NEW)**: DB-level test with `claimed_via_oauth_at = '2026-05-23T12:34:56.0006Z'::TIMESTAMPTZ` (i.e., 1748003696000.6 ms after epoch, a fractional millisecond above the rounding boundary). Assert: (a) `floor(extract(epoch from claimed_via_oauth_at) * 1000)::bigint` returns exactly `1748003696000` (truncated); (b) `(extract(epoch from claimed_via_oauth_at) * 1000)::bigint` WITHOUT the `floor()` would return `1748003696001` (rounded — banker's rounding rounds 0.6 up; verify PostgreSQL behavior). The test exists to pin the `floor()` requirement; if a future implementer drops `floor()`, the test fails. Companion: bootstrap mints `mint_safe_t_millis = floor(1748003696000.6) + 1 = 1748003696001`. Resolver computes `floor(...) = 1748003696000`. Cookie.t (1748003696001) > 1748003696000 → resolved. ✓. WITHOUT R41-R30 floor() on the resolver side, the comparison would be `1748003696001 > 1748003696001` → false → cookie incorrectly invalidated. The floor() everywhere is the load-bearing fix.
- **Shared-device shadow scenario (R41-R9 HIGH regression)** — fixture: Alice has a valid picker cookie on this device for Show-X with `{id: AliceCrewId, e: 1, t: 100}` (selected via the bypass picker; Alice's row is NOT OAuth-claimed). Now Bob signs in via Google OAuth on the same device. Bob's email matches a DIFFERENT crew row `BobCrewId` on Show-X. Bob visits `/show/<slug-X>/<token-X>`. Tests assert: (a) `resolveShowPageAccess` does NOT return `{ kind: 'resolved' }` despite the cookie being present (R41-R9 branch b' — cookie's `id != matched crew_member_id`); (b) the helper returns `{ kind: 'needs_picker_bootstrap' }` instead; (c) page redirects to `/api/auth/picker-bootstrap?next=...&t=...`; (d) bootstrap mints Bob's cookie entry for Show-X (overwrites Alice's entry — same target_show_id); (e) Bob lands on the show body rendered as Bob, not Alice; (f) Alice's other cookie entries for other shows (if any) are preserved byte-identical (the one-show-write contract holds).
- **Same-user OAuth upgrade scenario (R41-R11 HIGH regression; R41-R25 millis precision)** — fixture: Bob picks himself via the bypass picker at `t = 100000ms`; Bob's `claimed_via_oauth_at` is NULL at this point. Bob signs in via Google; OAuth callback fires `claim_oauth_identity` which stamps Bob's row's `claimed_via_oauth_at = 200000ms`. Per R41-R6, callback does NOT mint a new cookie — Bob's cookie still has `t=100000`, predating the claim. Bob visits Show-X. **Without R41-R11**: step 4(b) would let the cookie path resolve (id matches), but resolver step 9 would reject with `identity_invalidated, claimed_after_pick` because `cookie.t (100000) <= claim_epoch_millis (200000)`; Bob would see the claimed-identity banner and his OWN row deactivated, blocking his legitimate upgrade. **With R41-R11 + R41-R25**: step 4(b) requires id-equality AND `cookie.t > claim_epoch_millis` (strict per §6.0). 100000 is NOT > 200000, so branch b'(iii) fires (`cookie.t <= claim_epoch_millis`) → `needs_picker_bootstrap`. Bootstrap mints Bob's fresh cookie at `mint_safe_t_millis = 200001` (claim_epoch + 1ms per §6.0 formula). Bob lands on Show-X rendered as Bob. **Same-millisecond equality variant (R41-R25)**: fixture with `cookie.t = 200000` AND `claim_epoch_millis = 200000` (Bob's pick and Bob's own claim land in the same millisecond — possible under rapid sign-in burst). Tests assert: (a) step 4(b) REJECTS (200000 is NOT > 200000); (b) step 4(b')(iii) ACCEPTS (200000 <= 200000) → `needs_picker_bootstrap`; (c) bootstrap mints fresh cookie at t = 200001. Equality MUST route to bootstrap, NOT fall through to the cookie path.
- **Callback RPC failure retry via bootstrap (R41-R12 HIGH regression)** — fixture: Bob picks himself at `t=100000ms`; Bob's row's `claimed_via_oauth_at` is NULL. Bob signs in via Google; callback fires `claim_oauth_identity` BUT the RPC throws an infra fault — Bob's row remains `claimed_via_oauth_at = NULL`. Bob is left signed-in but his identity is NOT yet claimed. Bob visits Show-X. **Without R41-R12**: step 4(b) accepts the cookie (id matches; the prior `>=` comparator with NULL-coerced-zero was true); resolvePickerSelection returns `resolved`; bootstrap NEVER invoked. **With R41-R12**: step 4(b) requires `claimed_via_oauth_at IS NOT NULL`. Bob's row is NULL → branch b'(ii) fires → `needs_picker_bootstrap` → bootstrap invokes `claim_oauth_identity` (idempotent retry) → on success, stamps Bob's row + mints fresh cookie at `mint_safe_t_millis` → page renders. Tests assert: (a) step 4 returns `needs_picker_bootstrap` even when cookie's id matches the Google session; (b) bootstrap calls `claim_oauth_identity`; (c) after retry succeeds, row's `claimed_via_oauth_at` is non-null; (d) bootstrap mints fresh cookie + 302s back; (e) follow-up page request resolves to `_ShowBody`. **Persistent RPC failure variant**: R41-R7 fail-closed → 502 with `PICKER_BOOTSTRAP_RPC_FAILED`.
- **Concordant cookie no-op (R41-R9 negative regression; R41-R25 strict-greater)** — fixture: Alice signs in via Google AFTER her cookie was already minted via picker-bootstrap. Cookie `t = 210000`; her `claim_epoch_millis = 200000`. Alice visits Show-X. Tests assert: (a) step 4(b) takes the cookie path because `cookie.t (210000) > claim_epoch_millis (200000)` per §6.0 strict-greater; (b) no redirect to bootstrap; (c) page renders directly. This guards against unnecessary redirects when the cookie is comfortably post-claim. Companion edge-case fixture: cookie `t = 200000` (equal to claim_epoch) — assert step 4(b) REJECTS (per §6.0 strict-greater) and step 4(b')(iii) routes to bootstrap. Equality never resolves via cookie path.
- **No middleware cookie writes** (R16 contract; R41-R41 five-mutator scope) — middleware.ts MUST NOT emit a `Set-Cookie` header for `__Host-fxav_picker` on any route. Test: for every route in the §6 routing table (page route, asset routes, version, subscriber-token, report), simulate a request carrying a valid picker cookie; assert the response Set-Cookie header for `__Host-fxav_picker` is absent UNLESS the route handler is one of the FIVE legal mutators: `selectIdentity`, `clearIdentity`, `cleanupStaleEntry` Server Actions, OR `/api/auth/picker-bootstrap` Route Handler (writes Max-Age=7776000), OR `/auth/sign-out` Route Handler (uniquely writes Max-Age=0). Additionally assert `/auth/callback` emits no picker Set-Cookie (R41-R6 callback-is-DB-only contract). The meta-test grep-asserts that no other file calls `cookies().set('__Host-fxav_picker', ...)`. This pins the "five-surface cookie mutator" invariant. **R41-R42 + R41-R44 numeric guard**: a structural grep-test fails on stale wording matching the regex `(FOUR|four|4)[\s-]*(cookie-mutator|legal mutators|mutator-surfaces|surfaces?)\b` in the spec or planned-code comments — covers `four-mutator`, `four legal mutators`, `four-surface`, AND uppercase variants like `FOUR cookie-mutator surfaces` (R41-R44 widened scope after a §7.5 instance escaped the original R41-R42 grep). The canonical wording is FIVE cookie-mutator surfaces.
- **`resetPickerEpoch` emits no picker Set-Cookie** (R30 contract) — invoke the admin Reset action; assert the response has NO `Set-Cookie` header for `__Host-fxav_picker`. Regression against the lost-update race that would result if the admin Reset path were a cookie mutator.
- **Cross-origin Server Action attempts are rejected** (R32 contract) — for each of `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`, POST a forged request with an `Origin` header outside `serverActions.allowedOrigins`. Assert: (a) Next.js's same-origin guard returns the standard rejection (typically 400 or 403); (b) no `Set-Cookie` for `__Host-fxav_picker` is emitted; (c) the cookie's pre-attempt value is unchanged on subsequent reads.
- **Server Action cookie refresh on selection (R41-R27 exact-value pin)** — `selectIdentity` writes Set-Cookie with `Max-Age=7776000` AND the entry's `t` field set to `result.observed_at_millis` returned by `select_identity_atomic`. **R41-R27 strict assertion**: stub `select_identity_atomic` to return a fixture `observed_at_millis` (e.g., `1737028800123`) and assert the emitted Set-Cookie's `t` field equals that fixture value EXACTLY (NOT "newer than previous", NOT `Date.now()`, NOT a wall-clock approximation). The Max-Age value is asserted as the exact constant `7776000`. An implementation that uses `Date.now()` or `Math.floor(Date.now() / 1000)` as the source for `t` would produce a different value and FAIL this assertion, catching the R41-R23 clock-source regression at test time. The §6.0 static guard banning `Date.now()`/`new Date()`/`performance.now()` from selectIdentity is the complementary structural defense.
- **`cleanupStaleEntry` Server Action (compare-and-delete; §4.9 R22 contract; R41-R15 trigger-set expanded)** — accepts `{ showId, expectedEpoch, expectedCrewMemberId }`. When the current cookie's entry for `showId` matches BOTH `expectedEpoch` AND `expectedCrewMemberId`, the entry is removed. When the envelope becomes empty, the cookie is fully cleared (`Max-Age=0`). When called for an entry that has different values (newer `e` or `id` than expected — i.e., `selectIdentity` won the race), the action is a no-op (idempotent). Race test: render picker (stale entry `{e:1, id:A}`); concurrently invoke `selectIdentity({showId, crewMemberId: B})` (writes `{e:2, id:B}`); delayed auto-submit cleanup with `{expectedEpoch:1, expectedCrewMemberId:A}` arrives; asserts the cookie still carries `{e:2, id:B}` (the fresh selection is preserved). **R41-R15 trigger-set expansion test (R41-R35 simplified)**: the auto-submit-on-mount fires for THREE stale-state kinds rendered by the picker (`epoch_stale`, `removed_from_roster`, `identity_invalidated/claimed_after_pick`). The fourth state from earlier drafts (`identity_invalidated/email_ambiguous`) is removed because the schema makes the ambiguous case impossible. Test fixture renders the picker in each of the three states and asserts: (a) `<StaleCleanupAutoSubmit>` is mounted in the DOM with the correct `expectedEpoch` + `expectedCrewMemberId` props; (b) the auto-submit POST fires; (c) the cookie entry is deleted; (d) on subsequent page reload, the cookie's entry for this show is gone and the resolver returns `no_selection`.
- **Reset action advisory-lock holder topology** — extension to `tests/auth/advisoryLockRpcDeadlock.test.ts` asserts the lock is acquired inside the SECURITY DEFINER RPC `public.reset_picker_epoch_atomic` body at exactly one layer; the JS-side Server Action wrapper makes NO advisory-lock call and uses NO `lockedShowTx`/equivalent wrapper around the `.rpc()` invocation; `public.reset_picker_epoch_atomic` AND `public.rotate_show_share_token` are the only writers of `shows.picker_epoch` and `shows.picker_epoch_bumped_at` in the repo (R40 — rotate also bumps the epoch).
- **Rotate share-token action (R39/R40 amendment; R41-R28 admin-gate defense-in-depth; R41-R29 schema correction)** — `tests/auth/_metaInfraContract.test.ts` registers `rotateShareToken`; `tests/auth/advisoryLockRpcDeadlock.test.ts` asserts `rotate_show_share_token` acquires the lock at exactly one layer inside its SECURITY DEFINER body. Functional tests: (a) admin clicks Rotate → response carries new `share_token` matching `^[0-9a-f]{64}$` AND new `picker_epoch` integer; (b) the OLD URL `/show/<slug>/<old-token>` now returns 404; (c) the NEW URL succeeds; (d) **a picker cookie minted BEFORE rotation is rejected on every API consumer post-rotation** — the cookie's `e` ≠ new `picker_epoch` → 401 (R40 critical fix); (e) non-admin caller via the Server Action → 401/403 (JS-side requireAdmin gate); (f) **R41-R28 direct-RPC regression (NEW vector; R41-R29 schema-corrected assertions)**: invoke `rotate_show_share_token` directly via PostgREST as an authenticated non-admin user (bypassing the JS Server Action wrapper). Assert: (i) the RPC raises an error with SQLSTATE 42501 (insufficient_privilege); (ii) **`show_share_tokens.share_token` for the target show_id is UNCHANGED** (byte-identical pre/post; R41-R29 — bearer token lives in private `show_share_tokens` table per R35, NOT on `public.shows`); (iii) `shows.picker_epoch` is UNCHANGED; (iv) no `publish_show_invalidation` was triggered; (v) the non-admin caller's PostgREST `from('show_share_tokens').select(...)` returns no rows (defense-in-depth — the table is REVOKEd from authenticated, so direct token reads are also blocked). The structural meta-test grep-asserts EVERY SECURITY DEFINER RPC that mutates `shows.picker_epoch`/`picker_epoch_bumped_at` OR `show_share_tokens.share_token` includes the `public.is_admin()` gate (the two-RPC set: `rotate_show_share_token`, `reset_picker_epoch_atomic`).

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
| `shows.picker_epoch` | column (new) | TWO SECURITY DEFINER RPCs (R41-R29 final inventory): `reset_picker_epoch_atomic` (admin Reset) AND `rotate_show_share_token` (admin Rotate — R40 amendment: rotation bumps the epoch to invalidate pre-rotation cookies) | `resolvePickerSelection`, `selectIdentity`, `resolveShowPageAccess` | Mismatch with cookie's `e` triggers `epoch_stale` re-prompt; epoch bump on Rotate also invalidates all pre-rotation cookies |
| `crew_members.role_flags[]` | column | sync engine | `getShowForViewer` (re-derived every request) | Drives LEAD detection for chip styling AND financials inclusion |
| `__Host-fxav_picker` cookie | client | 3 Server Actions (`selectIdentity`, `clearIdentity`, `cleanupStaleEntry`) AND 2 Route Handlers (`/api/auth/picker-bootstrap` mints; `/auth/sign-out` clears with `Max-Age=0`) — R41-R41 final list. `/auth/callback` is NOT a mutator. | `resolvePickerSelection`, `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`, `resolveShowPageAccess` | Carries per-show selection state. Server Components are NOT in the mutator list (Next App Router contract). Sign-out clears the cookie because R41 OAuth path makes the picker cookie a derived credential of the signed-in user. |
| `crew_members.claimed_via_oauth_at` (R41) | column (new, TIMESTAMPTZ NULL) | `claim_oauth_identity()` SECURITY DEFINER RPC, invoked from `/auth/callback` post-success AND from `/api/auth/picker-bootstrap` as the lazy-mint retry (R41-R12 — bootstrap re-invokes claim_oauth_identity to handle callback-RPC-failure recovery; idempotent re-invocations preserve first-stamp date) | `resolveShowPageAccess` (step 4 — checks IS NOT NULL to gate cookie acceptance), `select_identity_atomic` (rejects PICKER_IDENTITY_CLAIMED if non-null), `resolvePickerSelection` (step 9 — invalidates pre-claim cookies), picker render (`PickerInterstitial` reads it to render row as deactivated) — all v1 readers, no future-only readers | Non-null → picker row renders as deactivated AND existing cookies with cookie.t ≤ claim_epoch_millis are invalidated; null → row is fully selectable and selectIdentity succeeds |
| `?gate=skip` URL query param (R41) | URL (not persisted) | Crew clicks "Skip" on `<SignInOrSkipGate>` | Route handler at `/show/[slug]/[shareToken]/page.tsx` | Presence with no auth → render picker; absence with no auth → render gate |

No zombie flags introduced. No flag is written but never read. The R41 column `claimed_via_oauth_at` is written by `claim_oauth_identity()` (one path) and read by both the picker render and (future) cross-show auto-resolve helpers — both consumers active in v1.
