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

- **One link per show.** `https://crew.fxav.show/show/<slug>/<share-token>` is the only URL Doug shares. He sends it once per show through his existing channel. **R34 amendment**: the slug alone is NOT the credential — slug derivation is deterministic from sheet title + month (per `lib/parser/slug.ts:4-10`), so a slug-only URL would be guessable by anyone who knows the client name and approximate event date. The `<share-token>` segment carries high entropy (256 bits via `crypto.randomUUID()`, base32-encoded, ~52 chars) and is the actual bearer credential. Both segments are validated by the route handler; either alone (or a mismatched pair) returns 404.
- **"Who are you?" picker.** First visit on a device renders an interstitial listing the show's current crew roster (`crew_members` rows where `show_id` matches). Crew member taps their own name.
- **Per-device sticky identity.** Selection persists in a host-wide cookie (`__Host-fxav_picker`) carrying a combined JSON map keyed by `show_id`. 90-day `Max-Age` refreshed by Server Actions only (per §4.9 R16 contract — middleware refresh is structurally unsafe). Picker is a one-time gate per device per show until the cookie expires.
- **Role filtering preserved.** The role-derivation contract in `lib/data/getShowForViewer.ts:218-230` is untouched: role flags are read fresh from `crew_members.role_flags` on every request, joined to `shows_internal` only for LEAD/admin viewers (parent spec §7.4). Picker identity is the input to that fetcher; role is derived from the input, not stored in the cookie.
- **Identity escape hatch.** A pinned "Not you?" link in the page chrome clears the cookie key for that show and re-prompts. No per-person revocation (the model doesn't support it).
- **Admin path unchanged.** `isAdminSession` precedence in `lib/auth/resolveShowViewer.ts:123-126` continues to short-circuit the crew auth chain for Doug + Eric. Admin previews via `/admin/show/<slug>/preview/<crewId>` remain Doug's spot-check tool.

**v1 in-scope outcomes:**

- The crew page (`app/show/[slug]/page.tsx`) renders the picker interstitial when no valid selection exists for the show in the cookie; otherwise renders the existing `_ShowBody.tsx` with the picked identity supplied to `getShowForViewer`.
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
- **SSO / OAuth crew identity.** The whole pivot exists to avoid this path. The existing Google-OAuth admin login stays for Doug and Eric only (`isAdminSession` allowlist + Postgres `is_admin()` RPC); crew members never authenticate.
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
4. **Cookie shape: `__Host-fxav_picker` carrying an HMAC-signed versioned JSON envelope (R36 amendment).** Inner wire form: `{ "v": 1, "selections": { "<show_id_uuid>": { "id": "<crew_member_id_uuid>", "e": <picker_epoch_int>, "t": <unix_seconds_int> } } }`. The cookie's actual value is `<base64url(payload)>.<base64url(hmac_sha256(payload, secret))>` — a signed envelope using `PICKER_COOKIE_SIGNING_KEY` (a new server-side secret, 32 random bytes, stored in env). On decode, the verifier (a) splits payload + signature, (b) recomputes the HMAC, (c) timing-safe compares; any mismatch yields `null` (treated as `no_selection`). **Why signed**: without an HMAC, the cookie is a plain client-controlled bearer credential — a forged `Cookie` header with valid show/crew UUIDs would bypass the share-token gate for API routes that authenticate by cookie alone (subscriber-token, asset/diagram/reel/agenda, version, report). R36 critical finding. The signed envelope makes the picker cookie tamper-evident: only a server that knows the secret can mint a valid cookie, and the only path that mints one is `selectIdentity` (which itself runs only after the tokenized URL route confirmed the share-token). The `t` field is the unix-second epoch of the entry's last touch — stamped on selection by `selectIdentity` and updated by other Server Actions that mutate the entry. It is the LRU sort key when the byte-budget cap (Resolved Decision 6) is hit. URL-encoded into the cookie value. Single host-wide cookie (no per-show cookie names) — the per-show-name pattern is forbidden by the parent spec §7.2 cookie-header-growth reasoning (`2026-04-30-fxav-crew-pages-design.md:1949`).
5. **TTL: 90 days, advanced on crew-side Server Action invocation only.** `Max-Age=7776000` re-emitted by the three crew-side Server Actions (`selectIdentity`, `clearIdentity`, `cleanupStaleEntry`) — NOT by middleware (the middleware refresh path was removed in R16 due to an unfixable lost-update race; see §4.9), and NOT by `resetPickerEpoch` (admin-side; emits no Set-Cookie per R30 amendment — would recreate the lost-update race). A crew member who picks once and never re-picks will see the cookie expire 90 days after the last selection and the picker re-prompts; re-selection refreshes the cookie and continues normally. The picker is cheap to traverse. There is no separate absolute cap.
6. **Cap: byte-budget LRU eviction (target ≤ 3800 bytes encoded), not a fixed entry count.** On every write that would grow the cookie, the encoder iteratively evicts the entry with the lowest `t` (last-touch unix-seconds) until the final URL-encoded `Set-Cookie` value (including the cookie name `__Host-fxav_picker=` prefix) is at or below 3800 bytes. The 3800-byte target sits comfortably below the 4096-byte (4 KB) browser per-cookie cap with ~300 bytes of safety margin for the `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Max-Age=7776000` attribute suffix. **An earlier draft of this spec stated a fixed 50-entry cap based on a back-of-envelope ~80-byte-per-entry estimate; that estimate undercounted by ~25%.** Real per-entry size (UUID show key + UUID crew id + `e` + `t`, URL-encoded) is ~106 bytes encoded; 50 entries would be ~5.3 KB raw / ~7.2 KB after `encodeURIComponent` overhead, exceeding the browser cap. The byte-budget approach is robust to JSON-encoding overhead changes and works regardless of the actual entry count (which will land near 35 at the cap given current entry sizing). The encoder helper exposes a `MAX_COOKIE_VALUE_BYTES = 3800` constant; a structural meta-test asserts the constant is never raised beyond 3900 without a paired comment explaining the browser-cap implication.
7. **Removed-id behaviour: silent re-prompt with empty-state banner.** When the cookie's `crew_member_id` no longer matches an active row in `crew_members` for `show_id` (Doug removed them between sessions), the resolver returns `kind: 'removed_from_roster'`, the picker re-renders with a banner: "Your previous selection was removed by Doug." **R32 amendment**: the cookie is NOT cleared during the Server Component render (Server Components cannot mutate cookies in Next 16); cleanup is deferred to the `cleanupStaleEntry` Server Action via the auto-submitting `<StaleCleanupAutoSubmit>` client component per §4.9. The compare-and-delete contract ensures the cleanup is race-safe with concurrent `selectIdentity` writes.
8. **Show-link lifetime: as long as the show row exists.** `shows.archived = true` (per `lib/sync/unpublishShow.ts` and the existing `shows` table per migration `20260501000000_initial_public_schema.sql:3-29`) is the kill switch. No date-based expiry. No admin "expire link" button. Doug archives a show when he wants its link to stop working.
9. **Escape-hatch placement: pinned header chip.** Sub-header strip on every crew page render shows `"<Name> · <Role>"` with a "Not you?" link below. Tap navigates to `/show/<slug>/<share-token>` (the same tokenized URL the page was loaded from) with that show's cookie key cleared; server re-renders the picker. Same URL, no query param, browser history unchanged.
10. **Admin panel: per-row Issue/Revoke controls deleted. "Reset picker selections on this show" button added. Preview-as-crew unchanged.** The new button bumps `shows.picker_epoch` by 1. Every device's stored `e` for that show goes stale on next visit; picker re-prompts. The button is idempotent and requires no per-device state on the server.
11. **No `crew_member_auth` table in v1.** The table (per migration `20260501001000_internal_and_admin.sql:8-16`) exists solely to track per-crew-member JWT versioning. With JWTs retired, the table is dropped. Its `last_changed_at` contribution to `viewer_version_token` (per migration `20260501001000_internal_and_admin.sql:18-30`) is removed in the same migration; the composite becomes `GREATEST(shows.last_synced_at, MAX(crew_members.last_changed_at))`.
12. **No `link_sessions`, `bootstrap_nonces`, `revoked_links` tables in v1.** All three exist to support the JWT path (per migration `20260501001000_internal_and_admin.sql:107-136`). All three drop in the same migration as `crew_member_auth`.
13. **Admin path is untouched.** `isAdminSession` precedence in `resolveShowViewer.ts:123-126` continues to short-circuit the crew chain. Admins do not see the picker. The picker cookie is irrelevant to admin requests.
15. **`validateGoogleSession`'s crew-email path is removed entirely; crew Google sign-in is dead.** The pre-pivot chain (`lib/auth/resolveShowViewer.ts:65-193`) ran `validateLinkSession` then `validateGoogleSession`. Post-pivot, the chain is `isAdminSession` then `resolvePickerSelection` — there is no Google session arm for crew, and no path anywhere in the app derives a crew identity from a Google session. Rationale: the owner determination says "crew never sign in" (`PRODUCT.md:73`) and the brief's out-of-scope list explicitly retires "SSO / OAuth crew identity." Two structural consequences this spec adds:
    - **`/me` is removed.** The page (`app/me/page.tsx`) and the route handler at `app/api/me/**` (if any) drop in the same plan execution. The page existed to list "shows where the signed-in user's email matches `crew_members.email`" (`lib/data/listShowsForCrew.ts:77-83`), which is precisely the crew-Google-discovery affordance the determination retires. Admins use `/admin`. Non-admins have no destination at `/me`.
    - **`/me` MUST be scrubbed from every redirect/allowlist literal in the auth chain (R22 amendment).** Deleting the page is not sufficient — the parent spec's auth chain at `app/auth/sign-in/page.tsx`, `app/auth/callback/route.ts`, `app/api/auth/google/start/route.ts`, and the `validateNextParam` allowlist at `lib/auth/validateNextParam.ts` all currently treat `/me` as a legal redirect target for already-signed-in or callback flows. With `/me` deleted, those redirects would land at a 404. The pivot plan MUST:
      - Remove `/me(\/.*)?` from `validateNextParam`'s allowlist regex.
      - Rewrite `app/auth/sign-in/page.tsx`'s "already signed in" short-circuit to redirect admins to `/admin` and non-admins to `/` (or a new "no destination" cataloged page) — NEVER to `/me`.
      - Same for `app/auth/callback/route.ts` and any `app/api/auth/google/**` start/callback handlers.
      - The `no-jwt-surface` meta-test extends to grep for the literal `/me` (in URL-string contexts) across `app/**`, `lib/**`, `components/**`, `middleware.ts` — fail if found outside test fixtures.
    - **`/api/report`'s `validateGoogleSession` arm is replaced with `isAdminSession`.** The report route currently uses `validateGoogleSession` as a "match the signed-in user's email against a crew row" path; that's the same crew-Google-identity surface this decision retires. Post-pivot, `/api/report` accepts: (a) picker cookie + matching `show_id` in the body, OR (b) `isAdminSession` (Doug/Eric only). No third path.
    - **`validateGoogleSession.ts` is deleted entirely.** R15 confirmed that `/auth/sign-out`'s import is from `validateLinkSession` (line 9), NOT `validateGoogleSession`. The R14 draft of this paragraph wrongly claimed sign-out kept it alive; in fact, no production caller remains post-pivot. The module DELETES with the M9.5 surface. The `no-jwt-surface` meta-test in §10.1 enforces this by banning `validateGoogleSession` imports anywhere outside the test directory. The `kind: 'crew_google'` arm of the `ShowViewer` discriminated union (`resolveShowViewer.ts:48-52`) is removed in the same edit.
14. **Server Action drives selection.** `selectIdentity({ showId, crewMemberId })` (Next 16 App Router idiom). Validates the `crewMemberId` is in the current roster for `showId`, validates the show is published, reads current `shows.picker_epoch`, mutates the cookie via `Set-Cookie` header in the response, calls `revalidatePath`.

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
│ app/show/[slug]/page.tsx (Server Component, no auth)        │
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
│  3. if isAdminSession(req) → render as admin (admin sees     │
│     unpublished — but archived is already a 404 from step 2) │
│                                                              │
│  4. else if !published:                                      │
│     notFound() — non-admin viewers cannot distinguish        │
│     "unpublished slug" from "unknown slug." This gate runs   │
│     BEFORE any picker render so the picker never exposes a   │
│     roster for an unpublished show (existence-oracle defense)│
│                                                              │
│  5. else: read cookie __Host-fxav_picker                     │
│       → resolvePickerSelection({ showId, cookie })           │
│         returns one of:                                      │
│           - { kind: 'resolved', crewMemberId }               │
│           - { kind: 'no_selection' }                         │
│           - { kind: 'epoch_stale' }                          │
│           - { kind: 'removed_from_roster' }                  │
│                                                              │
│  6. if no_selection | epoch_stale | removed_from_roster:     │
│       render <PickerInterstitial roster banner? />           │
│       (cookie cleanup deferred to a Server Action — Server   │
│       Components cannot mutate cookies; see §4.9)            │
│                                                              │
│  7. else (resolved):                                         │
│       getShowForViewer(showId, { kind: 'crew',               │
│                                  crewMemberId })             │
│       render <_ShowBody data={...} identityChip={...} />     │
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
  <input type="hidden" name="showId" value={...} />
  <input type="hidden" name="crewMemberId" value={...} />
  <button type="submit">…</button>
</form>
        │
        ▼
Server Action: selectIdentity({ showId, crewMemberId })
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ lib/auth/picker/selectIdentity.ts (new)                     │
│                                                              │
│  1. Validate crewMemberId ∈ current roster for showId        │
│     (SELECT id FROM crew_members WHERE id = $1 AND show_id   │
│      = $2; if 0 rows → reject with PICKER_INVALID_SELECTION) │
│                                                              │
│  2. Read shows.picker_epoch and shows.published for showId   │
│     If unpublished → reject (no picker on unpublished shows) │
│                                                              │
│  3. Read existing cookie envelope; merge new entry           │
│     { showId: { id: crewMemberId, e: picker_epoch } }        │
│     Apply byte-budget LRU eviction if encoded > 3800 bytes   │
│                                                              │
│  4. Emit Set-Cookie with __Host-fxav_picker, 90-day Max-Age, │
│     Path=/, HttpOnly, Secure, SameSite=Lax                   │
│                                                              │
│  5. revalidatePath(`/show/${slug}/${shareToken}`)                          │
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
Server Action: clearIdentity({ showId })
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
     select to_char(greatest(
       coalesce((select extract(epoch from last_synced_at) * 1000 from public.shows where id = p_show_id), 0),
       coalesce((select extract(epoch from max(last_changed_at)) * 1000 from public.crew_members where show_id = p_show_id), 0),
       coalesce((select extract(epoch from picker_epoch_bumped_at) * 1000 from public.shows where id = p_show_id), 0)
     ), 'FM999999999999999');
   $$;
   ```

   A new column `shows.picker_epoch_bumped_at TIMESTAMPTZ NOT NULL DEFAULT now()` is added alongside `shows.picker_epoch`; the Reset action UPDATEs both atomically. This ensures bumping the epoch triggers a Realtime invalidation so other open tabs on other devices see the picker re-prompt without waiting for a navigation. **Why a separate `picker_epoch_bumped_at` instead of relying on `shows.last_synced_at`:** sync runs constantly; picker-epoch bumps are rare admin actions. Mixing them in the same column would make every sync look like a picker reset; mixing them in the broadcast payload would force every Realtime tab to re-validate the cookie unnecessarily.

### 4.7 Component tree (post-pivot)

- **Next route file structure (R35 amendment):** the crew route moves from `app/show/[slug]/page.tsx` to **`app/show/[slug]/[shareToken]/page.tsx`** — a nested dynamic segment. The slug-only `app/show/[slug]/page.tsx` is DELETED (no fallback render); a slug-only URL hits Next's 404. This makes the tokenized path the only possible crew route at the file-system level. The route component reads `params.slug` and `params.shareToken`, calls `resolveShowFromSlugAndToken(slug, shareToken)`, and proceeds with the existing auth chain.
- `app/show/[slug]/[shareToken]/page.tsx` (new, replaces `app/show/[slug]/page.tsx`) — auth resolution + delegation. The cookie-bound chain is **rewritten** to call `resolvePickerSelection` instead of `validateLinkSession`. The admin precedence + `requireAdmin()` defense-in-depth at the top of the chain (per the old file's docstring at lines 27-35) is preserved verbatim.
- `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` (new, Server Component) — renders the picker. Reads the show's roster from `crew_members` via service-role client. Renders the `<form action={selectIdentity}>` markup. No client-side JavaScript needed for the picker itself. When the resolver returns `epoch_stale` or `removed_from_roster`, also mounts `<StaleCleanupAutoSubmit>` (below) once with the resolver's `expectedEpoch` and `expectedCrewMemberId`.
- `app/show/[slug]/[shareToken]/_StaleCleanupAutoSubmit.tsx` (new, **client component** — the ONLY `'use client'` component in the picker tree) — renders an invisible `<form action={cleanupStaleEntry}>` with hidden inputs for `showId`, `expectedEpoch`, `expectedCrewMemberId`, and auto-submits on mount via `useEffect`. R25 amendment: this surface exists because cleanup form auto-submit requires client JS, which Server Components cannot provide.
- `app/show/[slug]/[shareToken]/_ShowBody.tsx` (existing `_ShowBody.tsx` MOVED into the tokenized route directory) — unchanged in role-derived rendering. **Modified** to accept a new prop `identityChip: { name, role }` which it renders into the existing sub-header strip (the same slot that holds the show title today).
- All `revalidatePath` calls in Server Actions use the tokenized form `/show/${slug}/${shareToken}` (not the slug-only form). The Server Actions accept both `showId` (cookie-relevant) and an optional path-string `pathToRevalidate` derived from the rendering page so the action can call `revalidatePath(pathToRevalidate)` correctly.
- `components/auth/IdentityChip.tsx` (new) — renders the `<Name> · <Role>` display + "Not you?" `<form action={clearIdentity}>`. Server Component (no client JS).
- `lib/auth/picker/cookieEnvelope.ts` (new) — `encodePickerCookie`, `decodePickerCookie` helpers. Mirrors the discipline of `lib/auth/cookies.ts:27-34` (versioned envelope, strict-shape decoder, null on parse failure / wrong `v` / wrong field types).
- ~~`lib/cache/showSlugMap.ts`~~ — **REMOVED in R16**. The helper existed to support middleware-refresh's slug→id lookup; with middleware refresh dropped (lost-update race), no consumer remains. Slug→id resolution where needed uses the existing `resolveShowFromSlug` pattern in `app/show/[slug]/page.tsx:119+`.
- `lib/auth/picker/resolvePickerSelection.ts` (new) — the cookie-read + DB-validation helper. Returns a discriminated union (`resolved | no_selection | epoch_stale | removed_from_roster`).
- `lib/auth/picker/selectIdentity.ts` (new) — the Server Action.
- `lib/auth/picker/clearIdentity.ts` (new) — the Server Action.
- `lib/auth/picker/resetPickerEpoch.ts` (new) — admin-only Server Action.
- `components/admin/PerShowCrewSection.tsx` (existing, 173 lines) — **simplified**. Per-row Issue/Revoke controls and the "Revoke all links" button are removed. The "Reset picker selections" button is added. Preview-as-crew links per row are preserved.

### 4.9 Cookie-write boundaries (Next 16 constraint) — R16 simplification

**Server Components cannot mutate cookies.** Per Next 16, calling `cookies().set()` from a Server Component throws. Cookie writes are only legal from Server Actions, Route Handlers, or Middleware.

**R16 amendment — middleware refresh is REMOVED from this spec.** Earlier drafts (R3–R15) specified a middleware-based sliding-TTL refresh that bumped the cookie's `t` and re-emitted `Max-Age=7776000` on every authenticated request. R16 surfaced an unfixable lost-update race: middleware decodes the request's cookie (which may be stale by the time the response is written), bumps one entry, and re-emits the WHOLE envelope. If a Server Action (`selectIdentity`, `clearIdentity`, `cleanupStaleEntry`) commits a newer envelope BETWEEN the in-flight request's cookie capture and the middleware's Set-Cookie response, the middleware response overwrites the Server Action's newer state. Because the browser stores a single `__Host-fxav_picker` cookie and the LAST `Set-Cookie` wins, this is unfixable without inventing a server-side authoritative store the pivot model deliberately does not have.

**Single-mechanism contract (v1):** the cookie is mutated **only** by the three crew-side Server Actions — `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`. Each reads the current cookie, mutates the envelope in memory, and writes a fresh Set-Cookie with `Max-Age=7776000`. **`resetPickerEpoch` does NOT touch the cookie (R30 amendment)** — the admin Reset action mutates `shows.picker_epoch` server-side; existing cookies become stale-on-next-read via the `e` mismatch detected by `resolvePickerSelection`. Adding `resetPickerEpoch` to the cookie-mutator list would recreate the R16 lost-update race: an admin-side reset response could clobber a concurrent crew-side `selectIdentity` if the admin happened to share a browser profile with the crew member. Middleware does NOT touch the cookie. The middleware file `middleware.ts` is deleted entirely after the M9.5 compromise-event handler removal — or it remains as a no-op `export function middleware() { return NextResponse.next() }` if Next 16 requires a stub, with no cookie reads or writes.

**Same-origin / CSRF contract for picker Server Actions (R32/R33 amendment).** All three cookie-mutating Server Actions — `selectIdentity`, `clearIdentity`, `cleanupStaleEntry` — are unauthenticated state-changing endpoints (anyone with the show-link can invoke them, by design, to set their own picker selection). To prevent cross-site forged invocation, each action MUST validate that the request is same-origin. **Mechanism**: Next 16 Server Actions enforce same-origin by default — the framework compares the request's `Origin` header (or `Host` for non-CORS posts) against the canonical site origin and rejects mismatches BEFORE invoking the action body. **No `experimental.serverActions.allowedOrigins` config is added** (R33 amendment — an earlier draft incorrectly proposed adding `localhost:3000` to that list, which is an EXCEPTION list that BYPASSES the host-mismatch check; including dev origins in a production-shipped config would authorize forged posts from those origins). The pivot relies on the default same-origin enforcement that Next 16 already applies; the dev environment works because dev requests are themselves same-origin against `localhost:3000`. **Tests**: each cookie-mutator gets a negative-regression test that POSTs with an `Origin: https://attacker.example` header (simulated) and asserts (a) no Set-Cookie is emitted, (b) the response is Next.js's standard cross-origin rejection (typically 403), (c) the cookie's prior value is preserved. A production-config test asserts that `next.config.ts` does NOT contain `experimental.serverActions.allowedOrigins` keys for non-production origins.

**Consequence for sliding TTL.** The cookie's `Max-Age` advances only on Server Action invocation. A crew member who picks once and then only views the page (without ever tapping "Not you?" or re-selecting) will see the cookie expire 90 days after the last selection. The picker re-prompts; the user picks themselves again (cookie refreshes); they continue. This is acceptable per the owner determination: a re-prompt every 90 days is the longest gap an active crew member could experience, and the picker is cheap to traverse (single tap). The brainstorm note that "an active crew member never gets re-prompted" reads as a non-binding intent — Codex R16 demonstrated the structural impossibility of safe visit-based refresh, and the user's stated 90-day TTL still meets the "default remember-me window" intent.

**Mechanism — Server Actions for invalid-entry cleanup (compare-and-delete; R22/R25 amendment).** When the Server Component's resolver detects `epoch_stale` or `removed_from_roster`, the picker renders normally AND a **tiny client component** `<StaleCleanupAutoSubmit>` (new — see §4.7) is mounted inside the picker render with `expectedEpoch` and `expectedCrewMemberId` props. The client component renders a `<form action={cleanupStaleEntry}>` with hidden inputs for `showId`, `expectedEpoch`, `expectedCrewMemberId`, and uses a `useEffect(() => formRef.current?.requestSubmit(), [])` to auto-submit on mount. The Server Action reads the CURRENT cookie envelope, looks up the entry for `showId`, and **only deletes the entry if `entry.e === expectedEpoch AND entry.id === expectedCrewMemberId`** — i.e., the entry that's still stale by the same observation that triggered the form render. If the current cookie's entry has different values (either the user re-selected via `selectIdentity` between picker render and form submit, or the epoch was bumped again to a new value), the action is a no-op. This compare-and-delete protocol prevents the race where a delayed auto-submit clobbers a fresh selection. The form is a progressive-enhancement nicety; the picker still works without JS (the user picks a name, the `selectIdentity` Server Action overwrites the stale entry naturally with `expectedCrewMemberId` and `expectedEpoch` checked at write time the same way).

**R25 amendment**: an earlier draft said the form auto-submits without specifying a client component, contradicting §7.6's "PickerInterstitial is a pure Server Component, no client JS." `<StaleCleanupAutoSubmit>` is the ONLY `'use client'` component in the picker tree; the picker interstitial proper stays server-only. The transition-audit task in §10.4 is updated to allow this single client component.

Alternative considered: redirect through a `/auth/picker/cleanup?next=...` route handler when stale-entry is detected. Rejected because (a) it adds a navigation hop visible in the URL bar, (b) progressive-enhancement Server Action cleanup is consistent across all stale states.

**`Max-Age` arithmetic.** `Max-Age=7776000` = 90 days × 86400 s/day. Set by every Server Action that writes the cookie. There is no separate absolute cap — Resolved Decision 5.

**`lib/cache/showSlugMap.ts` is REMOVED from this spec** (R16 simplification). The slug→id helper was needed only for middleware refresh on slug routes; with middleware refresh gone, no consumer needs the helper. Slug→id resolution where needed (e.g., `resolveShowFromSlug` in `app/show/[slug]/page.tsx`) uses the existing pattern at lines 119+.

### 4.10 Files deleted by the implementation plan

These are M9.5 / parent-spec §7.2 surfaces that have no role in the pivot. The plan deletes them in the same milestone:

- `app/api/auth/redeem-link/route.ts` (394 lines)
- `app/show/[slug]/p/page.tsx` and the entire `app/show/[slug]/p/` directory (fragment-bootstrap surface)
- `app/admin/show/[slug]/IssueLinkButton.tsx` (92 lines)
- `app/admin/show/[slug]/RevokeAllLinksButton.tsx` (196 lines)
- The leaked-link compromise-event handler in `middleware.ts` (the entire 228-line file's primary purpose — the file likely shrinks to a no-op middleware or is removed entirely; the implementation plan picks whichever is cleaner)
- `lib/auth/validateLinkSession.ts` (the JWT cookie-session validator)
- `lib/auth/validateGoogleSession.ts` (no remaining production caller post-pivot per R15 audit; `/auth/sign-out` does NOT import it)
- `lib/auth/validateCrewAssetSession.ts` (the JWT-era asset-route auth helper; agenda + diagram + reel routes are switched to `resolvePickerSelection`)
- `lib/auth/jwt.ts` (signing/verifying helpers used only by the JWT path)
- `lib/auth/bootstrapCookie.ts` (the fragment-bootstrap one-shot cookie)
- `app/me/page.tsx` and `app/me/**` (the crew-Google-discovery affordance retired by Resolved Decision 15)
- `lib/data/listShowsForCrew.ts` (the helper that drove `/me`)
- The `validateGoogleSession` import + call in `app/api/report/route.ts` (along with the MODULE itself per the line above — R15 confirmed no live consumer post-pivot; the M9.5 sign-out comment in earlier drafts was incorrect and is corrected here)
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
| `shows.picker_epoch` | `INT NOT NULL DEFAULT 1` | Monotonic integer. Bumped by `resetPickerEpoch` Server Action. Stored on the existing `shows` row (no new table). |
| `shows.picker_epoch_bumped_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Bumped to `now()` in the same UPDATE that bumps `picker_epoch`. Feeds the composite `viewer_version_token` so the Realtime broadcast fires on reset. |
| ~~`shows.share_token`~~ | **R35 amendment: NOT on `public.shows`** | The R34 design proposed storing the token directly on `shows`. R35 surfaced two problems: (a) `public.shows` has SELECT granted to anon/authenticated via the `can_read_show` RLS policy, so the bearer token would be readable via PostgREST; (b) base64 encoding produces `/` `+` `=` which break path-segment routing. The token moves to a **separate private table** with stricter grants and a URL-safe encoding (see next row). |
| `show_share_tokens.show_id` / `show_share_tokens.share_token` (new table) | `show_id uuid PRIMARY KEY references shows(id) on delete cascade`; `share_token TEXT NOT NULL UNIQUE CHECK (share_token ~ '^[0-9a-f]{64}$') DEFAULT encode(gen_random_bytes(32), 'hex')` | Hex encoding (256 bits → 64 chars, all `[0-9a-f]` — URL-safe by definition, no need for base64url translation). Generated server-side on `shows` insert via a trigger that inserts a paired row into `show_share_tokens`. **PostgREST lockdown**: `REVOKE ALL ON show_share_tokens FROM anon, authenticated`; only `service_role` has any access. The crew route handler reads the token via a SECURITY DEFINER RPC `public.resolve_show_by_slug_and_token(p_slug text, p_share_token text) returns uuid` that does the join internally and returns the show UUID on match, NULL on miss. Timing-safe equality is delegated to PostgreSQL's text equality operator (constant-time on equal-length strings, which the CHECK regex enforces). Token rotation is NOT in scope for v1 — Doug archives + creates a new show to rotate. |

Both columns are added in a single migration. Backfill is trivial (default values match the post-pivot semantics: every existing show starts at epoch 1).

### 5.2 Tables dropped

| Table | Reason |
| ----- | ------ |
| `crew_member_auth` | Stored per-crew-member JWT versioning. JWTs retired. |
| `link_sessions` | Stored server-side session-token → identity mapping. Cookies no longer hold session tokens. |
| `bootstrap_nonces` | Stored one-time bootstrap nonces for the fragment-redemption path. Bootstrap is gone. |
| `revoked_links` | Stored surgical per-version revocation. No per-link revocation in v1. |

Drop order respects FKs (`link_sessions.show_id` references `shows.id`, etc., so `shows` survives). The migration includes `DROP TABLE IF EXISTS ... CASCADE` for each, plus `DROP FUNCTION IF EXISTS` for the SECURITY DEFINER RPCs that mutate them.

### 5.3 Functions modified

- `public.viewer_version_token(p_show_id uuid)` (per migration `20260501001000_internal_and_admin.sql:18-30`) is rewritten: the middle `crew_member_auth` term is replaced by the `picker_epoch_bumped_at` term. Function signature, return type, RLS grants, and SECURITY DEFINER posture all unchanged.

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
| `/auth/sign-in` | none | Google OAuth entrypoint via Supabase Auth. **Modified (R30): `/me` removed from the already-signed-in short-circuit.** The pre-pivot page at `app/auth/sign-in/page.tsx:118-140` redirects already-signed-in non-admins to `/me`; post-pivot, the page redirects already-signed-in users to `/admin` (if admin) or `/` (otherwise — no `/me` destination). Allowlist regex in `validateNextParam.ts` MUST not include `/me`. |
| `/auth/callback` | none (sets session) | OAuth code exchange. **Modified (R30): `/me` removed from the post-callback redirect path.** The pre-pivot route at `app/auth/callback/route.ts:112-132` redirects to `/me` on success for non-admins; post-pivot, redirects to `/admin` (if admin) or `/` (otherwise). |
| `/api/auth/google/start` | none | OAuth flow start. **Modified (R30): `/me` removed from `redirectTo` URL construction.** |
| `/auth/clear-session` | none | Cookie-clear hop. **Modified (R30): `/me` removed from allowed redirect targets.** |
| `/auth/sign-out` | POST, signed-in | Atomic clear of admin session. **Modified**: the `__Host-fxav_session` half (parent spec §7.2 line `2026-04-30-fxav-crew-pages-design.md:2295`) disappears; sign-out clears the Supabase Auth session cookies only. The `__Host-fxav_picker` cookie is NOT cleared on sign-out — sign-out is an admin concept; the picker cookie is a separate identity contract for the device. |
| `/me` | — | **DELETED.** The page existed only to list shows where a signed-in user's email matches a `crew_members` row — a crew-Google-discovery affordance that contradicts "crew never sign in." Per Resolved Decision 15, the page and its data loader (`lib/data/listShowsForCrew.ts`) are removed. Any `/me` link in copy or chrome elsewhere in the app also goes; the no-jwt-surface meta-test bans the substring `listShowsForCrew`. |
| `/show/<slug>/<share-token>` | none (the share-token IS the implicit credential — R34) | **Pivoted.** Both URL segments must match the same `shows` row (slug AND share_token). Mismatch → 404. First valid visit (no picker cookie entry, OR `e` ≠ `shows.picker_epoch`, OR cookie's `crewMemberId` no longer in roster) → renders `<PickerInterstitial />`. Subsequent valid visit (valid entry) → renders `<_ShowBody />` with picked identity. Admin precedence still short-circuits the chain. The admin route `/admin/show/<slug>` is unchanged (admins authenticate via Google session; they do not need the share-token). |
| `/show/<slug>/p` | — | **DELETED.** No fragment bootstrap. |
| `/show/<slug>/p#t=<jwt>` | — | **DELETED.** |
| `/api/auth/redeem-link` | — | **DELETED.** |
| `/api/realtime/subscriber-token` | picker cookie OR admin Google session | **Auth source modified.** Response shape `{ jwt, exp }`. Reads `__Host-fxav_picker` (via `resolvePickerSelection`) for crew; reads Supabase Auth session via `isAdminSession` for admin. The non-admin `validateGoogleSession` arm is removed — same rationale as Resolved Decision 15. Mints the Realtime JWT with claims `{ iss, sub: crewMemberId, show_id, role: "authenticated", viewer_kind: 'crew' \| 'admin', exp }`. **`role` stays the constant `"authenticated"`** (Supabase Realtime requirement; the RLS policy is created `to authenticated`). The `viewer_kind` value changes from pre-pivot `crew_link`/`crew_google` to post-pivot `crew`. |
| `/api/asset/diagram/<show-id>/<rev>/<assetKey>` | picker cookie OR admin | **Auth source modified** (same as subscriber-token). **`<show-id>` is the show UUID** matching the route param `[show]` in `app/api/asset/diagram/[show]/[rev]/[key]/route.ts`; the route handler queries `shows.id` directly with no slug resolution. The picker auth swap reads `resolvePickerSelection` with the in-URL UUID, no slug→id translation needed. Cache headers, revision-pinning, and 410 contract unchanged. |
| `/api/asset/reel/<show-id>` | picker cookie OR admin | **Auth source modified.** `<show-id>` is the show UUID per `app/api/asset/reel/[show]/route.ts`. Streaming, drift gate, buffer-then-verify all unchanged. |
| `/api/asset/agenda/<show-id>/<id>` | picker cookie OR admin | **Auth source modified.** `<show-id>` is the show UUID per `app/api/asset/agenda/[show]/[id]/route.ts`. Currently calls `isAdminSession` (line 215) then `validateCrewAssetSession` (line 240) per the M11 chain. Pivot replaces `validateCrewAssetSession` with `resolvePickerSelection`. Admin precedence path unchanged. Streaming + PDF contract unchanged. |
| `/api/show/<slug>/version` | picker cookie OR admin | **Auth source modified.** Currently calls `resolveShowViewer` (line 42). With `resolveShowViewer`'s `crew_link` and `crew_google` arms removed, this route swaps to a direct `isAdminSession` then `resolvePickerSelection` chain mirroring the page-route flow. Response body (`{ version_token }`) unchanged. The `ShowRealtimeBridge` cold-start version fence at `components/realtime/ShowRealtimeBridge.tsx` continues to work without bridge-side changes. |
| `/api/report` | picker cookie OR admin allowlist (`isAdminSession`) | **Auth source modified.** Currently imports `validateLinkSession` (line 5), `validateGoogleSession` (line 4), `requireAdminIdentity` (line 3). Pivot removes the `validateLinkSession` arm AND the `validateGoogleSession` arm (the latter was a crew-Google-identity path that contradicts Resolved Decision 15); the route accepts EITHER a picker cookie with matching `show_id` in the body, OR an admin session via `isAdminSession`. Body, idempotency, lease_holder contract unchanged. |
| `/auth/sign-out` | POST, signed-in | **Modified.** Currently calls `deleteSession` from `lib/auth/validateLinkSession.ts` (line 9) to delete the `link_sessions` row. With `link_sessions` retired, the `deleteSession` call is removed entirely; sign-out clears only the Supabase Auth session cookies. The `__Host-fxav_picker` cookie is NOT cleared on sign-out per §6 ("sign-out is an admin concept; the picker cookie is a separate identity contract"). |
| `/admin`, `/admin/show/<slug>`, `/admin/show/<slug>/preview/<crewId>`, etc. | admin | **Unchanged**, except the per-show panel UI per §8. |

**`?t=` is no longer a compromise event.** The leaked-link compromise-event handler is deleted along with the JWT model. Vercel request logs no longer carry sensitive tokens because no tokens exist. If a stray legacy URL somehow appears with a `?t=` query, Next.js's normal routing just ignores the unknown query param.

**`/show/<slug>/<share-token>` is the canonical bookmark target.** Bookmarking after picker resolution preserves the cookie; bookmarking before resolution still bookmarks the same URL — opening the bookmark re-runs the resolver and shows the picker if needed. The slug-only URL `/show/<slug>` does NOT route to any crew surface in production code (the Next route file is at `app/show/[slug]/[shareToken]/page.tsx`; the file-system layout enforces that slug-only requests hit Next's 404).

### 6.1 Picker entry guards

`resolvePickerSelection` operates in this order. The return type is a discriminated union of SEVEN variants; per AGENTS.md invariant 9 (Supabase call-boundary discipline), DB faults must be discriminable from auth/identity outcomes:

```ts
type ResolvePickerSelectionResult =
  | { kind: 'resolved'; crewMemberId: string }
  | { kind: 'no_selection' }
  | { kind: 'epoch_stale'; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: 'removed_from_roster'; expectedEpoch: number; expectedCrewMemberId: string }
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
8. **Entry present, epoch matches; `SELECT id FROM crew_members WHERE id = $1 AND show_id = $2` returns 0 rows** → `{ kind: 'removed_from_roster' }`.
9. **Entry present, epoch matches, row exists, show available** → `{ kind: 'resolved', crewMemberId }`.

Mapping of resolver `kind` outcomes to UI behaviour (referenced by `kind`, not case number, to avoid renumbering drift):

- `kind: 'no_selection'` (cases 1, 2, 3) — page renders the picker in **initial** mode (no banner). First-time-on-device UX.
- `kind: 'epoch_stale'` (case 6) — page renders the picker in **epoch-stale banner** mode: "Doug reset access for this show — pick yourself again."
- `kind: 'removed_from_roster'` (case 8) — page renders the picker in **removed-from-roster banner** mode: "Your previous selection was removed by Doug — pick yourself from the current roster."
- `kind: 'show_unavailable'` (case 5) — page renders `notFound()`; API consumers return 410 Gone with `PICKER_SHOW_UNAVAILABLE` (see "Show-unavailable handling at each consumer" below). The picker is NEVER rendered in this case — the show is gone.
- `kind: 'infra_error'` (cases 4, 7) — page renders the cataloged terminal-failure UI; API consumers return 500 with `PICKER_RESOLVER_LOOKUP_FAILED` (see "Infra-error handling at each consumer" below). Picker is NEVER rendered.
- `kind: 'resolved'` (case 9) — page renders `<_ShowBody />` with the resolved identity. API consumers proceed with the cached `crewMemberId`.

**Infra-error handling at each consumer (`kind: 'infra_error'`):**

- `app/show/[slug]/page.tsx` — renders the existing cataloged terminal-failure UI (the same shape used for `ADMIN_SESSION_LOOKUP_FAILED` per the parent spec's `R21 F2` discipline at `app/show/[slug]/page.tsx:109-123`). No cookie cleanup. No partial render.
- `/api/realtime/subscriber-token` — returns `500` with the cataloged operator code. The `ShowRealtimeBridge` already treats subscriber-token failures via its bounded-backoff renewal path; no client behavior change.
- `/api/asset/diagram/...`, `/api/asset/reel/...`, `/api/asset/agenda/...` — return `500` with the cataloged operator code; the client renders the existing placeholder for the missing asset. No 403/410 false-positives that would cause incorrect revocation appearances.
- `/api/show/[slug]/version` — returns `500`; the bridge's catch-up logic preserves its last-known-good `data-render-version`.
- The Server Actions `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`, `resetPickerEpoch` are exempt from this contract because they each have their own DB-error handling — they do not call `resolvePickerSelection` directly.

**Stale-credential handling at each consumer (`kind: 'epoch_stale'` OR `kind: 'removed_from_roster'`):**

The picker cookie is the credential under the pivot model. A stale cookie (epoch behind the current `shows.picker_epoch`, OR a `crewMemberId` no longer in the roster) is an invalid credential and consumers MUST treat it as auth-denied. Per the parent spec's existing posture for unauthenticated crew API requests (asset/version/realtime routes return 401), the consumer mapping is:

- `app/show/[slug]/page.tsx` — renders the picker interstitial in the appropriate banner mode (epoch-stale or removed-from-roster banner per §7.4). The cookie cleanup happens via the `cleanupStaleEntry` Server Action embedded in the picker render (§4.9 Mechanism B).
- `/api/realtime/subscriber-token` — returns `401 Unauthorized`. The existing `ShowRealtimeBridge` already treats 401 from this endpoint as a "force refresh" signal (`components/realtime/ShowRealtimeBridge.tsx` documented auth-denied path); on refresh, the page route's picker re-renders. No client-side change needed.
- `/api/show/[slug]/version` — returns `401 Unauthorized`. **This is the bridge's primary stale-detection path** — `ShowRealtimeBridge` treats 401 from the version endpoint as `forceRefresh` (per existing `components/realtime/ShowRealtimeBridge.tsx:280-310` posture). After `router.refresh()`, the page route's resolver sees the stale state and renders the picker. Without this 401, the bridge would treat the response as a transient failure and the open tab would never re-prompt.
- `/api/asset/{diagram,reel,agenda}/...` — returns `401 Unauthorized`. The crew page's image / PDF / video components show the existing placeholder on auth-denied asset responses. The next page navigation invokes the picker.
- `/api/report` — returns `401 Unauthorized`. The bug-reporter UI surfaces the existing cataloged auth-denied message via `messageFor()`. The next navigation re-prompts.

**Why 401 not 403/410:** 401 matches the parent spec's existing auth-denied semantics for the same routes (e.g., `validateLinkSession` returning `terminal_failure` mapped to 401). 403 would suggest "we know who you are but you're not allowed" — wrong, the resolver doesn't know who you are once the credential is stale. 410 is reserved for `show_unavailable` (the resource is gone). The three states are distinguishable on the wire: 401 → re-prompt; 410 → show is gone; 500 → infra fault.

**Show-unavailable handling at each consumer (`kind: 'show_unavailable'`):**

- `app/show/[slug]/page.tsx` — calls `notFound()` (same as the existing M11 contract for unpublished shows; non-admin viewers cannot distinguish "unpublished slug" from "unknown slug"). The page's own explicit `!published OR archived` short-circuit (§4.1 step 3) STILL runs first and catches the no-cookie / no-picker-entry case; the resolver's `show_unavailable` arm covers the with-cookie case for completeness.
- `/api/realtime/subscriber-token`, `/api/asset/{diagram,reel,agenda}/...`, `/api/show/[slug]/version`, `/api/report` — return `410 Gone` with the cataloged crew-facing message `PICKER_SHOW_UNAVAILABLE`. 410 is correct (not 404) because the show DID exist and the cookie's selection was valid before archival; a transient 410 invites the caller to drop cached state. Asset routes already use 410 for the analogous unpublished/drift contract per parent spec §7.3, so this is consistent.
- The Server Actions `selectIdentity` and `cleanupStaleEntry` already validate availability inside their own bodies (§6.2 rejection codes); they do not need to consult `resolvePickerSelection`'s availability arm. `clearIdentity` and `resetPickerEpoch` are admin-only or cookie-only operations and don't gate on availability.

### 6.2 Server Action input validation

`selectIdentity({ showId, crewMemberId })`:

- `showId` must be a UUID; otherwise reject with `PICKER_INVALID_INPUT`.
- `crewMemberId` must be a UUID; otherwise reject with `PICKER_INVALID_INPUT`.
- `SELECT id, show_id FROM crew_members WHERE id = $1`: 0 rows → reject with `PICKER_CREW_MEMBER_NOT_FOUND`; show_id mismatch → reject with `PICKER_CREW_MEMBER_WRONG_SHOW` (defense-in-depth against form-tampering).
- `SELECT published, archived, picker_epoch FROM shows WHERE id = $1`: not found or `archived=true` or `published=false` → reject with `PICKER_SHOW_UNAVAILABLE`.
- All rejection codes are added to `lib/messages/catalog.ts` with crew-facing copy that doesn't expose the structured code (per AGENTS.md invariant 5).

`clearIdentity({ showId })`: `showId` must be a UUID. No DB read — pure cookie mutation.

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
   - **Optional banner row** (only present when resolver returns `kind: 'epoch_stale'` or `kind: 'removed_from_roster'` from §6.1) — one-line copy in a 12px medium-weight inline note, FXAV-orange-tinted background (`bg-orange-100` / `bg-orange-900/30` in dark mode). 8px above the list.
   - **Roster list** — flat alphabetical by `crew_members.name`. Each row is a `<form>` element with a single `<button type="submit">` filling the row.
4. **Footer** — single line of copy, 10px, `color: var(--muted-foreground)`: `Shared by Doug Larson · FXAV`. 24px below the list.

### 7.2 Roster row internals

Each row is a 44px minimum-height target (per parent spec `PRODUCT.md:59` WCAG 2.5.5 floor). The `<button>` element is the entire row; `<button>`'s computed `display` is `flex` with `justify-content: space-between` and `align-items: center`. 12px horizontal padding inside the button; 11px vertical to reach 44px total. Between rows: 5px vertical gap. Border: 1px solid `var(--border)`. Border-radius: 9px. Default background: `var(--card)`. Hover/focus background: `var(--accent)` (no orange — orange is reserved for the LEAD chip).

Inside the row:

- **Left content (flex: 1)**: `<span>` with `crew_members.name` (12px, `font-weight: 600`, no truncation — names should fit; if a name overflows on a 390px viewport, the row wraps to 2 lines and the row's min-height grows naturally).
- **Right content (flex: 0)**: a role chip. Chip text is `crew_members.role` (the human-readable string, e.g., "A1", "LEAD"). Chip styling:
  - Default chip: 8px font-size, `font-weight: 600`, `color: var(--muted-foreground)`, `background: var(--muted)`, padding: 2px 7px, border-radius: 999px.
  - LEAD chip (any row where `role_flags` array contains `'LEAD'`, OR where `role === 'LEAD'`): same dimensions, `color: var(--accent-foreground)`, `background: var(--accent)` (FXAV orange `#F79338` / `oklch(...)` per `DESIGN.md`).

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

The picker has exactly three render modes:

| Mode | When | Visual delta |
| ---- | ---- | ------------ |
| **Initial** | `kind: 'no_selection'` (resolver cases 1, 2, 3) | No banner row. Standard heading + sub-instruction. |
| **Epoch-stale banner** | `kind: 'epoch_stale'` (resolver case 6) | Banner row present, copy: "Doug reset access for this show — pick yourself again." |
| **Removed-from-roster banner** | `kind: 'removed_from_roster'` (resolver case 8) | Banner row present, copy: "Your previous selection was removed by Doug — pick yourself from the current roster." |

The brand strip, show identifier strip, picker block (heading, sub-instruction, list), and footer are **identical across all three modes**. Only the banner row varies.

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
  `t` is a unix-second epoch of last touch. **`t` is updated ONLY by the three crew-side Server Actions** (`selectIdentity`, `clearIdentity`, `cleanupStaleEntry`) — reads never emit `Set-Cookie` per the R16 contract (§4.9), and `resetPickerEpoch` never touches the cookie per the R30 contract (admin-side reset would recreate the lost-update race if it wrote the envelope). On write of an entry that pushes the encoded cookie past the byte-budget cap, the minimum-`t` entry is evicted first. (Earlier drafts incorrectly listed `t` as updating on read AND included `resetPickerEpoch` in the writer list; both recreated the lost-update race R16/R30 eliminated.)
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
- `PICKER_EMPTY_ROSTER`: the empty-state copy when the show's roster has no rows yet. Default copy: "Doug hasn't added crew yet — check back soon." Used by §7.3 guard condition.
- `PICKER_SHOW_UNAVAILABLE`: rejection copy when `selectIdentity` runs against an unpublished or archived show. Default copy: "This show isn't available right now. Ask Doug for an updated link if you think this is a mistake." Used by §6.2 rejection paths.

**New rejection codes for `selectIdentity` (R33 amendment — all carry both `dougFacing` operator copy AND `crewFacing` user copy, because these paths fire from user-triggered form submits and must never surface as raw codes per AGENTS.md invariant 5):**

- `PICKER_INVALID_INPUT`: `showId` or `crewMemberId` failed UUID validation in the Server Action. Crew-facing copy: "Something went wrong with that selection. Please try picking your name again." Operator-facing: full details (which field, what value). On render: the picker re-displays with the cataloged crew-facing copy as an error banner above the list.
- `PICKER_CREW_MEMBER_NOT_FOUND`: row not present at the moment of selection (sync ran between picker render and submit, OR Doug removed the crew member in the same window). Crew-facing copy: "That crew member was just removed from this show. Pick yourself from the current roster." Operator-facing: `{ show_id, attempted_crew_member_id, observed_at }`. On render: the picker re-displays with the cataloged crew-facing banner.
- `PICKER_CREW_MEMBER_WRONG_SHOW`: form-tamper defense (the submitted `crewMemberId` belongs to a different show's roster). Crew-facing copy: "Something went wrong with that selection. Please try picking your name again." (Deliberately matches `PICKER_INVALID_INPUT` to avoid signaling form-tamper specifics to a probing client.) Operator-facing: full details flagged as a possible tamper signal.
- `PICKER_RESOLVER_LOOKUP_FAILED`: `resolvePickerSelection`'s DB read failed (returned error or thrown infra fault). Crew page renders the existing cataloged terminal-failure UI; API routes return 500. Catalog entry includes both `dougFacing` operator copy (for admin logs / `admin_alerts`) and `crewFacing` copy (for the page render via `messageFor(...)`). The `tests/messages/_metaAdminAlertCatalog.test.ts` registry is extended to assert this code is cataloged before any consumer uses it.

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
| `tests/admin/no-inline-email-normalization.test.ts` (existing) | NO CHANGE | Picker doesn't touch emails. |
| `tests/messages/_metaAdminAlertCatalog.test.ts` (existing) | EXTEND | Remove all M9.5-era codes; add `PICKER_EPOCH_RESET`, `PICKER_SELECTION_RACE`, and the new picker-rejection codes (`PICKER_INVALID_INPUT`, `PICKER_CREW_MEMBER_NOT_FOUND`, etc.). |
| `tests/auth/_metaPickerCookieContract.test.ts` (new) | CREATE | Pins the cookie envelope shape: name = `__Host-fxav_picker`, `v=1` strict, decoder returns null on shape failures, encoder/decoder are the only producers in the repo. Banned-identifier audit: the literal substring `__Host-fxav_picker` outside `lib/auth/picker/cookieEnvelope.ts`, the middleware, and the test fixtures fails. Asserts `MAX_COOKIE_VALUE_BYTES === 3800` and that the constant cannot be raised beyond 3900 without a paired `// browser-cap-implication-acknowledged` comment in the same hunk. |
| `tests/components/_metaPickerRoleChipContract.test.ts` (new) | CREATE | Pins the LEAD-chip-uses-FXAV-orange contract: any roster row where the underlying crew member has `LEAD` in `role_flags` renders with the accent chip; any other row renders the neutral chip. Test runs against a fixture roster with mixed `role_flags`. |
| `tests/cross-cutting/no-jwt-surface.test.ts` (new) | CREATE | Banned-identifier audit. The literal substrings `__Host-fxav_session`, `redeemLink`, `signLinkJwt`, `verifyLinkJwt`, `current_token_version`, `revoked_below_version`, `max_issued_version`, `bootstrap_nonces`, `link_sessions`, `revoked_links`, `crew_member_auth`, `LEAKED_LINK_DETECTED`, `CSRF_DENIED`, `validateCrewAssetSession`, `validateLinkSession`, `crew_link` (as a `ShowViewer` chain-level `kind` discriminator in `lib/auth/resolveShowViewer.ts` — NOT to be confused with the `Viewer` data-fetcher union at `lib/data/getShowForViewer.ts:79-82` whose `'crew'` arm is preserved), `crew_google` (as a `ShowViewer` chain-level discriminator) MUST not appear anywhere in `app/**`, `lib/**`, `components/**`, `middleware.ts`. **Migration scope is explicitly carved out**: the same identifiers ARE permitted to appear in `supabase/migrations/<cutover-migration>.sql` itself (the file that DROPs the M9.5 surface), but MUST NOT appear in any migration with a timestamp AFTER the cutover migration. The meta-test reads the cutover migration's filename from a single `CUTOVER_MIGRATION_TIMESTAMP` constant exported by the audit helper, and (a) allows ALL of the banned identifiers inside that specific migration file in `DROP TABLE` / `DROP FUNCTION` / `REVOKE` contexts; (b) bans them in app/lib/components/middleware unconditionally; (c) bans them in every migration with a timestamp strictly greater than `CUTOVER_MIGRATION_TIMESTAMP`. Old migrations (timestamp < CUTOVER) retain their history per migration-immutability rules and are out of scope of the test entirely. Additionally, `validateGoogleSession` imports MUST NOT appear anywhere in `app/**`, `lib/**`, `components/**`, `middleware.ts` (production code) — only in the test directory. R15 confirmed `/auth/sign-out` does not import it; the module is deleted in the cutover migration. The substring `listShowsForCrew` is also banned outside the test directory (the helper is removed with `/me`). |
| `tests/cross-cutting/picker-resolver-callsite-contract.test.ts` (new) | CREATE | Asserts every route handler that needs crew identity (`/show/[slug]/page.tsx`, `/api/realtime/subscriber-token`, `/api/asset/diagram/[show]/[rev]/[key]`, `/api/asset/reel/[show]`, `/api/asset/agenda/[show]/[id]`, `/api/show/[slug]/version`, `/api/report`) imports `resolvePickerSelection` from the canonical helper path AND distinguishes its `infra_error` arm from auth-denied. Static-analysis walker over the file list — does NOT depend on running the routes. |

### 10.2 Functional test coverage

The plan's TDD checklist includes:

- **Picker-renders cases (5 code-path variants → 3 visual modes)** — one test per resolver outcome that renders the picker: `kind: 'no_selection'` exercised via the three code-path entry points (no cookie / decode failure / no entry for show_id — all render the "initial" visual mode from §7.4 but via different code paths and must each be exercised); `kind: 'epoch_stale'` (renders epoch-stale banner mode); `kind: 'removed_from_roster'` (renders removed-from-roster banner mode). Each test fires a request with a constructed cookie state and asserts the rendered DOM (heading present, list count matches roster, banner code matches expected `messageFor()` lookup or absent). The other resolver outcomes (`kind: 'show_unavailable'`, `kind: 'infra_error'`, `kind: 'resolved'`) are tested in their own dedicated tasks (notFound / terminal-failure UI / `_ShowBody` render respectively) and are NOT picker-renders.
- **`selectIdentity` happy path** — Server Action sets cookie, route revalidates, next request resolves `kind: 'resolved'`.
- **`selectIdentity` rejection paths** — invalid UUID, crew_member_id not in roster, wrong show_id, archived show, unpublished show. Each asserts the specific rejection code AND that no cookie was written.
- **`clearIdentity`** — happy path (cookie key removed), all-shows-cleared path (cookie deleted entirely).
- **`resetPickerEpoch`** — happy path; non-admin rejection.
- **Cookie envelope** — round-trip encode/decode; reject `v != 1`; reject missing fields; reject wrong types; reject malformed JSON.
- **LRU eviction at cap** — write 51 entries; assert oldest by `t` was dropped.
- **Composite `viewer_version_token`** — DB-level test that the function returns a value advancing on `picker_epoch_bumped_at` updates.
- **Realtime bridge auth swap** — `/api/realtime/subscriber-token` reads picker cookie correctly; admin path via Google session still works.
- **Admin precedence preserved** — admin with a stale picker cookie still sees admin mode, not picker.
- **Unpublished/archived show guard — page route** — non-admin viewer on an unpublished or archived show gets `notFound()` BEFORE any picker render. Test asserts: (a) no `roster-list` DOM element is emitted; (b) no DB query for `crew_members` was issued; (c) the response status is 404, not 200. Same test repeated for an archived (published=true, archived=true) show.
- **Share-token validation — page route (R34)** — request to `/show/<slug>/<wrong-token>` returns 404 indistinguishable from "unknown slug." Request to `/show/<wrong-slug>/<right-token>` also returns 404. Request to `/show/<slug>/<right-token>` for the same row proceeds to the picker / show body. Token comparison MUST be timing-safe (use `crypto.timingSafeEqual` or equivalent at the DB layer via a parameterized SELECT). No structured-log entry on token mismatch (avoid enumeration oracle); a single `404` and silence.
- **Share-token entropy meta-test (R34/R35/R36)** — DB-level test asserts every row in `public.shows` has a paired row in `public.show_share_tokens` with `share_token` matching `^[0-9a-f]{64}$` (64-char hex floor). New-show insert test asserts the trigger-driven default expression populates `show_share_tokens` without explicit assignment. Backfill test: pre-migration dev DB with N `shows` rows and 0 `show_share_tokens` rows; run the migration; assert N paired tokens exist post-migration.
- **Migration backfill contract (R36 amendment)**: the cutover migration creates `show_share_tokens`, then runs `INSERT INTO public.show_share_tokens (show_id) SELECT id FROM public.shows ON CONFLICT (show_id) DO NOTHING;` (the table's default expression generates the token; the `ON CONFLICT` clause is defensive against double-application). The same migration installs an `AFTER INSERT ON public.shows` trigger that inserts a paired `show_share_tokens` row for every future show.
- **Picker cookie HMAC integrity (R36 amendment)** — negative-regression test: construct a hand-forged cookie with `{ v:1, selections: { "<real-show-uuid>": { id: "<real-crew-uuid>", e: 1, t: <now> }}}` URL-encoded WITHOUT a valid HMAC signature; assert every API route (subscriber-token, asset/{diagram,reel,agenda}, version, report) returns 401 (the resolver treats the unsigned/invalid cookie as `no_selection`). Positive test: a properly signed cookie from `selectIdentity` succeeds on those routes. Asserts the signing-key env var is documented in `lib/env/*` schema with a fallback failure mode (server fails to boot if the key is unset; never falls back to an empty key).
- **Unpublished/archived show guard — API routes** — every API route in §6 that calls `resolvePickerSelection` (subscriber-token, asset/diagram, asset/reel, asset/agenda, version, report) MUST return `410 Gone` with `PICKER_SHOW_UNAVAILABLE` copy when called with a valid picker cookie for an archived OR unpublished show. Each route gets its own test asserting: (a) the resolver returns `kind: 'show_unavailable'`; (b) the response status is 410; (c) no asset bytes / no realtime token / no version_token / no report row is created; (d) admin path via `isAdminSession` is unaffected (admins can still hit these routes for unpublished shows during preview/QA per parent spec).
- **Asset route auth swap — diagram** — `/api/asset/diagram/<show>/<rev>/<assetKey>` accepts picker cookie for the matching show; rejects no-cookie (401); rejects wrong-show cookie (401 — the picker model treats wrong-show as stale-credential, NOT as forbidden; no server state to clean up); rejects stale-epoch cookie (401); rejects removed-from-roster cookie (401); rejects show-unavailable (410); admin path via `isAdminSession` still works. The 410 (revision-mismatch) contract is unchanged from M11 (distinct from the picker's 410 for `show_unavailable`; both are 410 but the response body's cataloged code distinguishes them: `PICKER_SHOW_UNAVAILABLE` vs the existing revision-mismatch code). Status mapping for all stale-credential outcomes is the single source of truth in the "Stale-credential handling at each consumer" matrix in §6.1; this bullet defers to that matrix.
- **Asset route auth swap — reel** — `/api/asset/reel/<show>` same matrix as diagram. The buffer-then-verify md5 contract from the parent spec §7.3 is unchanged; only the auth source swaps.
- **Asset route auth swap — agenda** — `/api/asset/agenda/<show>/<id>` same matrix as diagram. Currently uses `validateCrewAssetSession`; pivot swaps to `resolvePickerSelection`. PDF streaming + content-disposition contract unchanged.
- **Version endpoint auth swap** — `/api/show/<slug>/version` accepts picker cookie for the matching show (200 with `{ version_token: <string> }`); rejects no-cookie / invalid-cookie / wrong-show cookie with **401 BEFORE invoking `viewer_version_token`** (preserves the M11 auth-denied contract — the endpoint is NOT a public freshness/existence probe); admin via `isAdminSession` returns 200. Asserts the no-cookie path emits NO body except the standard 401 envelope, and that the `viewer_version_token` RPC is never reached without auth. Plus an `infra_error` test: when `viewer_version_token` RPC fails AFTER auth succeeded, the route returns 500, NOT 200-with-stale.
- **Report endpoint auth swap** — `/api/report` accepts picker cookie for the matching show OR admin via `isAdminSession`/`requireAdminIdentity`. **`validateGoogleSession` arm explicitly removed**: a signed-in non-admin user (crew Google sign-in) gets 401. Body's `show_id` field's cross-cookie match is validated. Tests assert: (a) picker cookie + matching `show_id` → 200; (b) picker cookie + mismatched `show_id` body → 401; (c) admin session → 200; (d) Google session matching a crew email → 401 (regression test against the removed arm); (e) no session at all → 401.
- **`/me` deletion** — request to `/me` (any path under `/me/**`) returns 404 (or whatever Next's natural response is for a deleted route). Tests assert: (a) signed-in non-admin user gets 404, NOT a list of their crew shows; (b) signed-in admin user gets 404 (no admin-only fallback — `/admin` is the admin destination); (c) no references to `/me` survive in the app's chrome / nav / sign-in CTA copy. **Static-analysis assertion (R23 expanded scope)**: `grep -r '/me'` URL-literal search runs across `app/**` (INCLUDING `app/api/**`), `lib/**` (INCLUDING `lib/auth/validateNextParam.ts`), `components/**`, AND `middleware.ts` — fails if any production reference survives. Tests directory is exempt for fixture compatibility. Additionally, dedicated functional tests assert the sign-in page's already-signed-in short-circuit, the OAuth callback redirect, and `app/api/auth/google/start/route.ts` never emit a redirect to `/me`. The `validateNextParam` allowlist regex MUST not contain `/me` post-pivot — a static unit test on the exported regex.
- **Stale-credential mapping across all API consumers** — for every route in §6 that calls `resolvePickerSelection` (subscriber-token, version, asset/{diagram,reel,agenda}, report), the test matrix asserts: (a) `kind: 'epoch_stale'` → 401 with no resource body; (b) `kind: 'removed_from_roster'` → 401 with no resource body; (c) `kind: 'show_unavailable'` → 410; (d) `kind: 'infra_error'` → 500; (e) `kind: 'no_selection'` → 401 (no credential at all). Each status is distinguishable on the wire so `ShowRealtimeBridge` can treat 401 as `forceRefresh` (its existing auth-denied path) and 410 as "this show is gone." The asset components' placeholder rendering on 401 is unchanged from M11.
- **No middleware cookie writes** (R16 contract) — middleware.ts MUST NOT emit a `Set-Cookie` header for `__Host-fxav_picker` on any route. Test: for every route in the §6 routing table (page route, asset routes, version, subscriber-token, report), simulate a request carrying a valid picker cookie; assert the response Set-Cookie header for `__Host-fxav_picker` is absent UNLESS the route handler is a crew-side Server Action invocation (`selectIdentity`, `clearIdentity`, `cleanupStaleEntry`). This pins the "crew-side-Server-Actions-only cookie mutator" invariant.
- **`resetPickerEpoch` emits no picker Set-Cookie** (R30 contract) — invoke the admin Reset action; assert the response has NO `Set-Cookie` header for `__Host-fxav_picker`. Regression against the lost-update race that would result if the admin Reset path were a cookie mutator.
- **Cross-origin Server Action attempts are rejected** (R32 contract) — for each of `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`, POST a forged request with an `Origin` header outside `serverActions.allowedOrigins`. Assert: (a) Next.js's same-origin guard returns the standard rejection (typically 400 or 403); (b) no `Set-Cookie` for `__Host-fxav_picker` is emitted; (c) the cookie's pre-attempt value is unchanged on subsequent reads.
- **Server Action cookie refresh on selection** — `selectIdentity` writes Set-Cookie with `Max-Age=7776000` AND the entry's `t` advanced to current unix-seconds. Test: invoke `selectIdentity`, assert the emitted Set-Cookie header carries the fresh Max-Age value and the entry's `t` field is newer than its pre-action value.
- **`cleanupStaleEntry` Server Action (compare-and-delete; §4.9 R22 contract)** — accepts `{ showId, expectedEpoch, expectedCrewMemberId }`. When the current cookie's entry for `showId` matches BOTH `expectedEpoch` AND `expectedCrewMemberId`, the entry is removed. When the envelope becomes empty, the cookie is fully cleared (`Max-Age=0`). When called for an entry that has different values (newer `e` or `id` than expected — i.e., `selectIdentity` won the race), the action is a no-op (idempotent). Race test: render picker (stale entry `{e:1, id:A}`); concurrently invoke `selectIdentity({showId, crewMemberId: B})` (writes `{e:2, id:B}`); delayed auto-submit cleanup with `{expectedEpoch:1, expectedCrewMemberId:A}` arrives; asserts the cookie still carries `{e:2, id:B}` (the fresh selection is preserved).
- **Reset action advisory-lock holder topology** — extension to `tests/auth/advisoryLockRpcDeadlock.test.ts` asserts the lock is acquired inside the SECURITY DEFINER RPC `public.reset_picker_epoch_atomic` body at exactly one layer; the JS-side Server Action wrapper makes NO advisory-lock call and uses NO `lockedShowTx`/equivalent wrapper around the `.rpc()` invocation; `public.reset_picker_epoch_atomic` is the only writer of `shows.picker_epoch` and `shows.picker_epoch_bumped_at` in the repo.

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

---

## Appendix D — Flag lifecycle table (per AGENTS.md)

For every boolean / config field this spec touches or introduces:

| Flag | Storage | Write path | Read path | Effect on output |
| ---- | ------- | ---------- | --------- | ---------------- |
| `shows.published` | column | sync engine; admin actions | `resolvePickerSelection`, `selectIdentity` | If `false`, picker selection is rejected; route 404s for non-admin viewers |
| `shows.archived` | column | admin action | route handler at `app/show/[slug]/page.tsx` | If `true`, route 404s for all viewers including admin (existing behaviour) |
| `shows.picker_epoch` | column (new) | `resetPickerEpoch` Server Action | `resolvePickerSelection`, `selectIdentity` | Mismatch with cookie's `e` triggers `epoch_stale` re-prompt |
| `crew_members.role_flags[]` | column | sync engine | `getShowForViewer` (re-derived every request) | Drives LEAD detection for chip styling AND financials inclusion |
| `__Host-fxav_picker` cookie | client | Server Actions only | `resolvePickerSelection`, `selectIdentity`, `clearIdentity` | Carries per-show selection state |

No zombie flags introduced. No flag is written but never read.
