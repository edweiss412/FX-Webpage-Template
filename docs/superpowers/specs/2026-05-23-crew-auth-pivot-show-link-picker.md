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

- **One link per show.** `https://crew.fxav.show/show/<slug>` is the only URL Doug shares. He sends it once per show through his existing channel.
- **"Who are you?" picker.** First visit on a device renders an interstitial listing the show's current crew roster (`crew_members` rows where `show_id` matches). Crew member taps their own name.
- **Per-device sticky identity.** Selection persists in a host-wide cookie (`__Host-fxav_picker`) carrying a combined JSON map keyed by `show_id`. 90-day sliding TTL. Picker is a one-time gate per device per show.
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

The `BL-COPY-SHARE-LINK` backlog item (per-person URL copy affordance) is **implicitly retired** by the pivot. There is no per-person URL to copy; the share affordance is "send `/show/<slug>` to the group thread." This spec does not need to take action on the backlog row beyond noting the dependency.

---

## 3. Resolved decisions (numbered)

Each decision is owner-determined; cite by number from this list in the implementation plan and in any later round of review. None of these are open for re-debate.

1. **One link per show; URL is `/show/<slug>`.** No fragment, no per-person URL, no JWT. The link is the credential.
2. **Picker container is an interstitial route.** `/show/<slug>` renders ONLY the picker (FXAV mark + show title + roster list) as the entire viewport when no valid selection exists. After selection, the same URL renders the existing `_ShowBody.tsx`. No skeleton, no modal, no behind-the-picker chrome.
3. **Picker list shape: flat alphabetical, role chip right-aligned.** One scrollable list, sorted by `crew_members.name` ascending. Each row shows `<name>` (primary) and a role chip drawn from `crew_members.role` (the human-readable string, e.g., "A1", "LEAD"). LEAD chip uses FXAV orange (`#F79338`) per the parent `PRODUCT.md:42-47` accent contract; all other chips use the neutral surface from `DESIGN.md`.
4. **Cookie shape: `__Host-fxav_picker` carrying a versioned JSON envelope.** Wire form: `{ "v": 1, "selections": { "<show_id_uuid>": { "id": "<crew_member_id_uuid>", "e": <picker_epoch_int>, "t": <unix_seconds_int> } } }`. The `t` field is the unix-second epoch of the entry's last touch — stamped on selection and refreshed on every authenticated visit (this is the sliding-TTL mechanism). It is also the LRU sort key when the byte-budget cap (Resolved Decision 6) is hit. URL-encoded into the cookie value. Single host-wide cookie (no per-show cookie names) — the per-show-name pattern is forbidden by the parent spec §7.2 cookie-header-growth reasoning (`2026-04-30-fxav-crew-pages-design.md:1949`).
5. **TTL: 90 days, sliding.** Refreshed on every authenticated visit via `Set-Cookie` re-emission with `Max-Age=7776000`. There is no separate absolute cap — abandoned devices fall out after 90 days of silence; active devices never re-prompt on schedule. (An earlier draft proposed a 365-day hard cap; the owner answer was sliding-only with no absolute cap, so this spec carries only the sliding form.)
6. **Cap: byte-budget LRU eviction (target ≤ 3800 bytes encoded), not a fixed entry count.** On every write that would grow the cookie, the encoder iteratively evicts the entry with the lowest `t` (last-touch unix-seconds) until the final URL-encoded `Set-Cookie` value (including the cookie name `__Host-fxav_picker=` prefix) is at or below 3800 bytes. The 3800-byte target sits comfortably below the 4096-byte (4 KB) browser per-cookie cap with ~300 bytes of safety margin for the `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Max-Age=7776000` attribute suffix. **An earlier draft of this spec stated a fixed 50-entry cap based on a back-of-envelope ~80-byte-per-entry estimate; that estimate undercounted by ~25%.** Real per-entry size (UUID show key + UUID crew id + `e` + `t`, URL-encoded) is ~106 bytes encoded; 50 entries would be ~5.3 KB raw / ~7.2 KB after `encodeURIComponent` overhead, exceeding the browser cap. The byte-budget approach is robust to JSON-encoding overhead changes and works regardless of the actual entry count (which will land near 35 at the cap given current entry sizing). The encoder helper exposes a `MAX_COOKIE_VALUE_BYTES = 3800` constant; a structural meta-test asserts the constant is never raised beyond 3900 without a paired comment explaining the browser-cap implication.
7. **Removed-id behaviour: silent re-prompt with empty-state banner.** When the cookie's `crew_member_id` no longer matches an active row in `crew_members` for `show_id` (Doug removed them between sessions), the picker re-renders with a banner: "Your previous selection was removed by Doug." Cookie key for that show is cleared on the same render.
8. **Show-link lifetime: as long as the show row exists.** `shows.archived = true` (per `lib/sync/unpublishShow.ts` and the existing `shows` table per migration `20260501000000_initial_public_schema.sql:3-29`) is the kill switch. No date-based expiry. No admin "expire link" button. Doug archives a show when he wants its link to stop working.
9. **Escape-hatch placement: pinned header chip.** Sub-header strip on every crew page render shows `"<Name> · <Role>"` with a "Not you?" link below. Tap navigates to `/show/<slug>` with that show's cookie key cleared; server re-renders the picker. Same URL, no query param, browser history unchanged.
10. **Admin panel: per-row Issue/Revoke controls deleted. "Reset picker selections on this show" button added. Preview-as-crew unchanged.** The new button bumps `shows.picker_epoch` by 1. Every device's stored `e` for that show goes stale on next visit; picker re-prompts. The button is idempotent and requires no per-device state on the server.
11. **No `crew_member_auth` table in v1.** The table (per migration `20260501001000_internal_and_admin.sql:8-16`) exists solely to track per-crew-member JWT versioning. With JWTs retired, the table is dropped. Its `last_changed_at` contribution to `viewer_version_token` (per migration `20260501001000_internal_and_admin.sql:18-30`) is removed in the same migration; the composite becomes `GREATEST(shows.last_synced_at, MAX(crew_members.last_changed_at))`.
12. **No `link_sessions`, `bootstrap_nonces`, `revoked_links` tables in v1.** All three exist to support the JWT path (per migration `20260501001000_internal_and_admin.sql:107-136`). All three drop in the same migration as `crew_member_auth`.
13. **Admin path is untouched.** `isAdminSession` precedence in `resolveShowViewer.ts:123-126` continues to short-circuit the crew chain. Admins do not see the picker. The picker cookie is irrelevant to admin requests.
15. **`validateGoogleSession` is removed from the `/show/<slug>` chain.** The pre-pivot chain (`lib/auth/resolveShowViewer.ts:65-193`) ran `validateLinkSession` then `validateGoogleSession`. Post-pivot, the chain is `isAdminSession` then `resolvePickerSelection` — there is no Google session arm for crew. Rationale: the owner determination says "crew never sign in." Admins (Doug, Eric) match via the `isAdminSession` allowlist; any other Google-signed-in user is treated identically to a no-session user and goes through the picker. `validateGoogleSession` is preserved as a module because `/me` and `/auth/sign-out` continue to use it; only its caller list shrinks. The `kind: 'crew_google'` arm of the `ShowViewer` discriminated union (`resolveShowViewer.ts:48-52`) is removed in the same edit.
14. **Server Action drives selection.** `selectIdentity({ showId, crewMemberId })` (Next 16 App Router idiom). Validates the `crewMemberId` is in the current roster for `showId`, validates the show is published, reads current `shows.picker_epoch`, mutates the cookie via `Set-Cookie` header in the response, calls `revalidatePath`.

---

## 4. Architecture

### 4.1 Request flow (crew member, first visit)

```
Crew taps `/show/<slug>` in group thread
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ middleware.ts (cookie-refresh; see §4.9)                    │
│   - For path /show/<slug>, if __Host-fxav_picker has an     │
│     entry for show_id (decoded via shared helper), refresh  │
│     `t` and re-emit Set-Cookie with Max-Age=7776000.        │
│   - Pure refresh; no validation, no DB read. Stale/invalid  │
│     entries are detected and cleared by the Server Component│
│     chain below + by the route handlers' own resolver call. │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ app/show/[slug]/page.tsx (Server Component, no auth)        │
│                                                              │
│  1. resolveShowFromSlug(slug)                                │
│       → { id, published, archived }                          │
│       | not_found | infra_error                              │
│                                                              │
│  2. if isAdminSession(req) → render as admin (unchanged)     │
│     [admin precedence; admin sees unpublished + archived     │
│      for editing — preserves M11 admin debug workflow]       │
│                                                              │
│  3. else if !published OR archived:                          │
│     notFound() — non-admin viewers cannot distinguish        │
│     "unpublished slug" from "unknown slug." This gate runs   │
│     BEFORE any picker render so the picker never exposes a   │
│     roster for an unpublished show (existence-oracle defense)│
│                                                              │
│  4. else: read cookie __Host-fxav_picker                     │
│       → resolvePickerSelection({ showId, cookie })           │
│         returns one of:                                      │
│           - { kind: 'resolved', crewMemberId }               │
│           - { kind: 'no_selection' }                         │
│           - { kind: 'epoch_stale' }                          │
│           - { kind: 'removed_from_roster' }                  │
│                                                              │
│  5. if no_selection | epoch_stale | removed_from_roster:     │
│       render <PickerInterstitial roster banner? />           │
│       (cookie cleanup deferred to a Server Action — Server   │
│       Components cannot mutate cookies; see §4.9)            │
│                                                              │
│  6. else (resolved):                                         │
│       getShowForViewer(showId, { kind: 'crew_link',          │
│                                  showId, crewMemberId })     │
│       render <_ShowBody data={...} identityChip={...} />     │
└─────────────────────────────────────────────────────────────┘
```

The `getShowForViewer` call shape is intentionally the same one the M9.5 path used (`lib/data/getShowForViewer.ts:198` accepts a `Viewer` discriminated union; the `kind: 'crew_link'` arm at `lib/data/getShowForViewer.ts:79-92` matches). The data fetcher does not know or care that the identity came from a picker cookie instead of a redeemed JWT — it gets a `(showId, crewMemberId)` pair and re-derives role flags from the live row. **This is the structural reason the pivot is cheap to ship: every layer below the auth resolver is unchanged.**

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
│  5. revalidatePath(`/show/${slug}`)                          │
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
│  4. revalidatePath(`/show/${slug}`)                          │
│  5. Server Component re-renders into <PickerInterstitial />  │
└─────────────────────────────────────────────────────────────┘
```

No URL change. No query parameter. Browser history is untouched (the form POST is intercepted by the App Router; the response is a 303-equivalent to the same URL, replacing the picker render). Bookmark of `/show/<slug>` is preserved.

### 4.5 Admin "Reset picker selections" flow

```
Admin clicks "Reset picker selections on this show" on /admin/show/<slug>
        │
        ▼
Server Action: resetPickerEpoch({ showId })  [admin-only; requireAdmin()]
        │
        ▼
BEGIN TRANSACTION;
  SELECT drive_file_id FROM shows WHERE id = $1;  -- need drive_file_id for the lock key
  pg_advisory_xact_lock(hashtext('show:' || drive_file_id));
  UPDATE shows
     SET picker_epoch = picker_epoch + 1,
         picker_epoch_bumped_at = now()
   WHERE id = $1;
COMMIT;
        │
        ▼
publishShowInvalidation(supabase, showId)   -- explicit, post-commit
        │
        ▼
Every existing cookie entry for this show now has `e` ≠ shows.picker_epoch.
Next visit on each device triggers epoch_stale → picker re-prompts.
Realtime broadcast fires on `show:<showId>:invalidation` for any
already-open tabs (composite viewer_version_token has advanced via
the new picker_epoch_bumped_at term in §4.6).
```

**Advisory-lock topology (per AGENTS.md invariant 2 — non-negotiable).** `resetPickerEpoch` mutates `public.shows`, so it MUST run inside the per-show advisory lock. Lock key is `hashtext('show:' || drive_file_id)` — the canonical project key per `AGENTS.md` invariant 2. Holder topology: the lock is acquired at the **Server Action layer** (the only entry point that mutates `shows.picker_epoch`); no nested RPC, no JS-side wrapper above the action, no other layer touches the column. This single-holder design is documented here and pinned by an extension to `tests/auth/advisoryLockRpcDeadlock.test.ts` (per §10.1 meta-test inventory). The action uses the blocking form (`pg_advisory_xact_lock`, not `pg_try_advisory_xact_lock`) because it is an admin-initiated request, not a cron path — the spec's invariant 2 directs admin/blocking paths to the blocking variant. If the lock is contended by a concurrent sync run for the same show, the admin's Reset request waits until the sync transaction commits, then proceeds. This is acceptable: Reset is a rare manual click, not a hot path.

**Why the lock matters.** Without it, a concurrent sync writing `shows.last_synced_at` (per `lib/sync/phase2.ts` etc.) could interleave with the Reset write in a way that loses one of the two updates depending on transaction isolation. The advisory lock serializes all `shows`-mutating paths so Reset and sync see each other's changes in a well-defined order.

The button is idempotent at the action level (clicking twice in succession bumps the epoch twice; the second bump is harmless — already-stale cookies remain stale). No server-side state is created per device; the epoch is the entire mechanism.

### 4.6 Composite `viewer_version_token` & Realtime bridge

The parent spec's Realtime contract (broadcast topic `show:<showId>:invalidation`, viewer-opaque payload, JWT-gated subscription via `/api/realtime/subscriber-token`) is **kept**. Only two things change:

1. **Auth source for the subscriber-token endpoint.** Pre-pivot, `app/api/realtime/subscriber-token/route.ts` reads the `__Host-fxav_session` cookie via `validateLinkSession`. Post-pivot, it reads `__Host-fxav_picker` via the new `resolvePickerSelection` helper. The route's response shape (`{ token: <Realtime JWT> }`) is unchanged; the JWT claims (`show_id`, `sub`) are unchanged. The admin path (Google session) is unchanged.
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

- `app/show/[slug]/page.tsx` (existing) — auth resolution + delegation; the cookie-bound chain at lines 73-89 is **rewritten** to call `resolvePickerSelection` instead of `validateLinkSession`. The admin precedence + `requireAdmin()` defense-in-depth at the top of the chain (per the file's docstring at lines 27-35) is preserved verbatim.
- `app/show/[slug]/_PickerInterstitial.tsx` (new, Server Component) — renders the picker. Reads the show's roster from `crew_members` via service-role client. Renders the `<form action={selectIdentity}>` markup. No client-side JavaScript needed.
- `app/show/[slug]/_ShowBody.tsx` (existing) — unchanged in role-derived rendering. **Modified** to accept a new prop `identityChip: { name, role }` which it renders into the existing sub-header strip (the same slot that holds the show title today).
- `components/auth/IdentityChip.tsx` (new) — renders the `<Name> · <Role>` display + "Not you?" `<form action={clearIdentity}>`. Server Component (no client JS).
- `lib/auth/picker/cookieEnvelope.ts` (new) — `encodePickerCookie`, `decodePickerCookie` helpers. Mirrors the discipline of `lib/auth/cookies.ts:27-34` (versioned envelope, strict-shape decoder, null on parse failure / wrong `v` / wrong field types).
- `lib/auth/picker/resolvePickerSelection.ts` (new) — the cookie-read + DB-validation helper. Returns a discriminated union (`resolved | no_selection | epoch_stale | removed_from_roster`).
- `lib/auth/picker/selectIdentity.ts` (new) — the Server Action.
- `lib/auth/picker/clearIdentity.ts` (new) — the Server Action.
- `lib/auth/picker/resetPickerEpoch.ts` (new) — admin-only Server Action.
- `components/admin/PerShowCrewSection.tsx` (existing, 173 lines) — **simplified**. Per-row Issue/Revoke controls and the "Revoke all links" button are removed. The "Reset picker selections" button is added. Preview-as-crew links per row are preserved.

### 4.9 Cookie-write boundaries (Next 16 constraint)

**Server Components cannot mutate cookies.** Per Next 16, calling `cookies().set()` from a Server Component throws. Cookie writes are only legal from Server Actions, Route Handlers, or Middleware. The pivot's cookie-touching paths therefore split across two mechanisms:

**Mechanism A — middleware refresh (sliding TTL).** A thin middleware in `middleware.ts` (replacing the deleted M9.5 leaked-link compromise handler) runs on every request whose path matches any of: `^/show/[^/]+$`, `^/api/asset/(diagram|reel|agenda)/`, `^/api/realtime/subscriber-token$`, `^/api/show/[^/]+/version$`, `^/api/report$`. The middleware:

1. Decodes the `__Host-fxav_picker` cookie via the shared helper (`lib/auth/picker/cookieEnvelope.ts`).
2. If decode succeeds AND the cookie contains an entry for the path's `show_id` (derived from the slug via a cached slug→id lookup, or directly from the route param), bump that entry's `t` to the current unix-seconds and re-emit the cookie with `Max-Age=7776000`.
3. Decode failures, missing-entry, and stale-epoch all pass through untouched — the middleware does NOT validate against the DB; that's the resolver's job in the Server Component. The middleware is a pure refresh, not an enforcement layer.

**Why middleware, not a beacon.** A client-side beacon (POST on mount) would require client JS, would not run for crew on the picker interstitial (which has no client JS), and would race with the page render. Middleware runs at the edge per-request, has access to cookies in both directions, and composes cleanly with the Server Component's render flow.

**Mechanism B — Server Actions for invalid-entry cleanup.** When the Server Component's resolver detects `epoch_stale` or `removed_from_roster`, it renders the picker AND embeds a one-shot `<form>` that the client auto-submits on mount, calling a `cleanupStaleEntry({ showId })` Server Action that removes the stale entry from the cookie. The picker render does NOT block on this submission — the picker still works without JS (the user picks a name, the `selectIdentity` Server Action will overwrite the stale entry naturally). The auto-submitting form is a progressive-enhancement nicety that keeps the cookie clean for users with JS enabled.

Alternative considered: redirect through a `/auth/picker/cleanup?next=...` route handler when stale-entry is detected. Rejected because (a) it adds a navigation hop visible in the URL bar, (b) it requires a JS-free fallback anyway (route handlers can't redirect AND clean the cookie atomically in a way the user sees), and (c) middleware-based eager cleanup of decode-failure cookies is impossible without the DB, so progressive-enhancement Server Action cleanup is consistent across all stale states.

**`Max-Age` arithmetic for middleware refresh.** `Max-Age=7776000` = 90 days × 86400 s/day. Re-emitted on every authenticated visit. There is no separate absolute cap — Resolved Decision 5.

### 4.10 Files deleted by the implementation plan

These are M9.5 / parent-spec §7.2 surfaces that have no role in the pivot. The plan deletes them in the same milestone:

- `app/api/auth/redeem-link/route.ts` (394 lines)
- `app/show/[slug]/p/page.tsx` and the entire `app/show/[slug]/p/` directory (fragment-bootstrap surface)
- `app/admin/show/[slug]/IssueLinkButton.tsx` (92 lines)
- `app/admin/show/[slug]/RevokeAllLinksButton.tsx` (196 lines)
- The leaked-link compromise-event handler in `middleware.ts` (the entire 228-line file's primary purpose — the file likely shrinks to a no-op middleware or is removed entirely; the implementation plan picks whichever is cleaner)
- `lib/auth/validateLinkSession.ts` (the JWT cookie-session validator)
- `lib/auth/validateCrewAssetSession.ts` (the JWT-era asset-route auth helper; agenda + diagram + reel routes are switched to `resolvePickerSelection`)
- `lib/auth/jwt.ts` (signing/verifying helpers used only by the JWT path)
- `lib/auth/bootstrapCookie.ts` (the fragment-bootstrap one-shot cookie)
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
- Instead, the `resetPickerEpoch` Server Action **calls the project's existing helper `publishShowInvalidation(supabase, showId)`** (the same one Phase 2 sync writes use, per parent spec §8 publish-side contract) explicitly after the locked UPDATE commits. This keeps the trigger surface unchanged AND avoids over-broadcasting on every `shows` UPDATE (which would cause every sync write to spam the `show:<id>:invalidation` channel even when nothing viewer-visible changed).

### 5.5 RLS

- `public.shows` already has admin-write / public-read RLS (per migration `20260501000000_initial_public_schema.sql`). The two new columns inherit the existing policy. No new RLS surface.
- The Server Actions all use the service-role client (no end-user Supabase JWT), so RLS is not the access control mechanism for the new columns; the action body's `requireAdmin()` (for reset) or roster-membership check (for select) is.

### 5.6 PostgREST DML lockdown + advisory-lock invariants (per AGENTS.md cross-cutting discipline)

`shows.picker_epoch` and `shows.picker_epoch_bumped_at` are written ONLY by the `resetPickerEpoch` Server Action (which uses the service-role client). No other code path mutates them. PostgREST DML on `public.shows` is already REVOKEd from `authenticated`/`anon` (the existing admin-tables lockdown); the new columns inherit that posture. **No new RPC; no new entry-point surface.** The pivot deliberately does not introduce an RPC for the epoch bump because the existing admin-action pattern (service-role UPDATE inside a Server Action behind `requireAdmin()`) is the canonical shape.

**Advisory-lock acquisition (per AGENTS.md invariant 2 — non-negotiable).** Because `resetPickerEpoch` mutates `public.shows`, it MUST acquire `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` inside the same transaction as the UPDATE. The mechanics are in §4.5; the call-boundary contract here is: the structural meta-test at `tests/auth/_metaInfraContract.test.ts` is extended to register `resetPickerEpoch`, AND the advisory-lock topology meta-test at `tests/auth/advisoryLockRpcDeadlock.test.ts` is extended to assert (a) the Server Action body acquires the lock at exactly one layer, (b) no nested SECURITY DEFINER RPC reacquires the same key, and (c) `resetPickerEpoch` is the only writer of `shows.picker_epoch` in the repo. The `selectIdentity`, `clearIdentity`, and `cleanupStaleEntry` Server Actions perform only READS against `shows`/`crew_members` and cookie writes against the client; they do not require the advisory lock.

---

## 6. URL + routing contract

| Route | Auth requirement | Behaviour |
| ----- | ---------------- | --------- |
| `/` | none | Marketing/landing. Unchanged. |
| `/auth/sign-in` | none | Google OAuth entrypoint via Supabase Auth. **Unchanged.** Only Doug + Eric ever land here. |
| `/auth/callback` | none (sets session) | OAuth code exchange. **Unchanged.** |
| `/auth/sign-out` | POST, signed-in | Atomic clear of admin session. **Modified**: the `__Host-fxav_session` half (parent spec §7.2 line `2026-04-30-fxav-crew-pages-design.md:2295`) disappears; sign-out clears the Supabase Auth session cookies only. The `__Host-fxav_picker` cookie is NOT cleared on sign-out — sign-out is an admin concept; the picker cookie is a separate identity contract for the device. |
| `/me` | signed-in | Lists shows where signed-in user's email matches a `crew_members` row. **Unchanged.** |
| `/show/<slug>` | none | **Pivoted.** First visit (no picker cookie entry, OR `e` ≠ `shows.picker_epoch`, OR cookie's `crewMemberId` no longer in roster) → renders `<PickerInterstitial />`. Subsequent visit (valid entry) → renders `<_ShowBody />` with picked identity. Admin precedence still short-circuits the chain. |
| `/show/<slug>/p` | — | **DELETED.** No fragment bootstrap. |
| `/show/<slug>/p#t=<jwt>` | — | **DELETED.** |
| `/api/auth/redeem-link` | — | **DELETED.** |
| `/api/realtime/subscriber-token` | picker cookie OR admin Google session | **Auth source modified.** Body unchanged. Reads `__Host-fxav_picker` (via `resolvePickerSelection`) for crew; reads Supabase Auth session via `isAdminSession` for admin. The non-admin `validateGoogleSession` arm is removed — same rationale as Resolved Decision 15. Mints the existing Realtime JWT with `show_id` + `sub` claims. |
| `/api/asset/diagram/<show-slug>/<rev>/<assetKey>` | picker cookie OR admin | **Auth source modified** (same as subscriber-token). Cache headers, revision-pinning, and 410 contract unchanged. |
| `/api/asset/reel/<show-slug>` | picker cookie OR admin | **Auth source modified.** Streaming, drift gate, buffer-then-verify all unchanged. |
| `/api/asset/agenda/<show-slug>/<id>` | picker cookie OR admin | **Auth source modified.** Currently calls `isAdminSession` (line 215) then `validateCrewAssetSession` (line 240) per the M11 chain. Pivot replaces `validateCrewAssetSession` with `resolvePickerSelection`. Admin precedence path unchanged. Streaming + PDF contract unchanged. |
| `/api/show/<slug>/version` | picker cookie OR admin | **Auth source modified.** Currently calls `resolveShowViewer` (line 42). With `resolveShowViewer`'s `crew_link` and `crew_google` arms removed, this route swaps to a direct `isAdminSession` then `resolvePickerSelection` chain mirroring the page-route flow. Response body (`{ version_token }`) unchanged. The `ShowRealtimeBridge` cold-start version fence at `components/realtime/ShowRealtimeBridge.tsx` continues to work without bridge-side changes. |
| `/api/report` | picker cookie OR admin Google session OR admin allowlist | **Auth source modified.** Currently imports `validateLinkSession` (line 5), `validateGoogleSession` (line 4), `requireAdminIdentity` (line 3). Pivot removes the `validateLinkSession` arm and replaces it with `resolvePickerSelection`. The admin arms (`requireAdminIdentity` AND `validateGoogleSession`-for-admin) are preserved because `/api/report` is the bug-reporter and admins legitimately submit reports without going through the picker. Body, idempotency, lease_holder contract unchanged. |
| `/auth/sign-out` | POST, signed-in | **Modified.** Currently calls `deleteSession` from `lib/auth/validateLinkSession.ts` (line 9) to delete the `link_sessions` row. With `link_sessions` retired, the `deleteSession` call is removed entirely; sign-out clears only the Supabase Auth session cookies. The `__Host-fxav_picker` cookie is NOT cleared on sign-out per §6 ("sign-out is an admin concept; the picker cookie is a separate identity contract"). |
| `/admin`, `/admin/show/<slug>`, `/admin/show/<slug>/preview/<crewId>`, etc. | admin | **Unchanged**, except the per-show panel UI per §8. |

**`?t=` is no longer a compromise event.** The leaked-link compromise-event handler is deleted along with the JWT model. Vercel request logs no longer carry sensitive tokens because no tokens exist. If a stray legacy URL somehow appears with a `?t=` query, Next.js's normal routing just ignores the unknown query param.

**`/show/<slug>` is the canonical bookmark target.** Bookmarking after picker resolution preserves the cookie; bookmarking before resolution still bookmarks the same URL — opening the bookmark re-runs the resolver and shows the picker if needed.

### 6.1 Picker entry guards

`resolvePickerSelection` operates in this order. The return type is a discriminated union of SIX variants; per AGENTS.md invariant 9 (Supabase call-boundary discipline), DB faults must be discriminable from auth/identity outcomes:

```ts
type ResolvePickerSelectionResult =
  | { kind: 'resolved'; crewMemberId: string }
  | { kind: 'no_selection' }
  | { kind: 'epoch_stale' }
  | { kind: 'removed_from_roster' }
  | { kind: 'infra_error'; code: 'PICKER_RESOLVER_LOOKUP_FAILED' };
```

1. **No cookie at all** → `{ kind: 'no_selection' }`.
2. **Cookie present but decode failure** (parse error, wrong `v`, missing fields, wrong types) → `{ kind: 'no_selection' }`. Decoder returns `null` per the strict-shape contract; resolver treats this as a fresh-device scenario, NOT as a tamper signal (the parent spec's strict-shape decoder discipline at `lib/auth/cookies.ts:34` is the precedent).
3. **Cookie decoded; no entry for this `show_id`** → `{ kind: 'no_selection' }`.
4. **DB read failure on `shows.picker_epoch` lookup** (returned error OR thrown infra fault from `createSupabaseServiceRoleClient` / `.maybeSingle()`) → `{ kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' }`. NO cookie is touched on this branch; NO `epoch_stale`/`removed_from_roster` is falsely emitted on a transient outage.
5. **Entry present; entry `e` ≠ `shows.picker_epoch`** → `{ kind: 'epoch_stale' }`.
6. **DB read failure on `crew_members` membership lookup** → `{ kind: 'infra_error', code: 'PICKER_RESOLVER_LOOKUP_FAILED' }`. Same posture as 4.
7. **Entry present, epoch matches; `SELECT id FROM crew_members WHERE id = $1 AND show_id = $2` returns 0 rows** → `{ kind: 'removed_from_roster' }`.
8. **Entry present, epoch matches, row exists** → `{ kind: 'resolved', crewMemberId }`.

Cases 1, 2, 3 render the picker without an explanatory banner (first-time-on-device UX). Case 5 renders a banner "Doug reset access for this show — pick yourself again." Case 7 renders a banner "Your previous selection was removed by Doug — pick yourself from the current roster." Case 8 renders the crew page.

**Infra-error handling at each consumer (cases 4 + 6):**

- `app/show/[slug]/page.tsx` — renders the existing cataloged terminal-failure UI (the same shape used for `ADMIN_SESSION_LOOKUP_FAILED` per the parent spec's `R21 F2` discipline at `app/show/[slug]/page.tsx:109-123`). No cookie cleanup. No partial render.
- `/api/realtime/subscriber-token` — returns `500` with the cataloged operator code. The `ShowRealtimeBridge` already treats subscriber-token failures via its bounded-backoff renewal path; no client behavior change.
- `/api/asset/diagram/...`, `/api/asset/reel/...`, `/api/asset/agenda/...` — return `500` with the cataloged operator code; the client renders the existing placeholder for the missing asset. No 403/410 false-positives that would cause incorrect revocation appearances.
- `/api/show/[slug]/version` — returns `500`; the bridge's catch-up logic preserves its last-known-good `data-render-version`.
- The Server Actions `selectIdentity`, `clearIdentity`, `cleanupStaleEntry`, `resetPickerEpoch` are exempt from this contract because they each have their own DB-error handling — they do not call `resolvePickerSelection` directly.

### 6.2 Server Action input validation

`selectIdentity({ showId, crewMemberId })`:

- `showId` must be a UUID; otherwise reject with `PICKER_INVALID_INPUT`.
- `crewMemberId` must be a UUID; otherwise reject with `PICKER_INVALID_INPUT`.
- `SELECT id, show_id FROM crew_members WHERE id = $1`: 0 rows → reject with `PICKER_CREW_MEMBER_NOT_FOUND`; show_id mismatch → reject with `PICKER_CREW_MEMBER_WRONG_SHOW` (defense-in-depth against form-tampering).
- `SELECT published, archived, picker_epoch FROM shows WHERE id = $1`: not found or `archived=true` or `published=false` → reject with `PICKER_SHOW_UNAVAILABLE`.
- All rejection codes are added to `lib/messages/catalog.ts` with crew-facing copy that doesn't expose the structured code (per AGENTS.md invariant 5).

`clearIdentity({ showId })`: `showId` must be a UUID. No DB read — pure cookie mutation.

`resetPickerEpoch({ showId })`: `requireAdmin()` first (matches admin-action pattern; `lib/auth/requireAdmin.ts`). `showId` must be a UUID; show must exist. Returns `{ ok: true, new_epoch: <int> }` for the admin UI to display.

---

## 7. Picker UX

### 7.1 Section inventory (interstitial page)

When `/show/<slug>` resolves to the picker, the rendered viewport contains:

1. **Top brand strip** — FXAV mark (orange wordmark), centered, 14px font-size, `font-weight: 700`. 16px vertical padding above and below.
2. **Show identifier strip** — `<show.title>` on line 1 (16px, `font-weight: 700`); `<show.dates>` + venue short-form on line 2 (10px, `color: var(--muted-foreground)`). Centered. 8px from the brand strip; 24px from the picker block below.
3. **Picker block** — left/right padded 16px on a 390px viewport.
   - **Question heading** `Who are you?` (20px, `font-weight: 700`, `color: var(--foreground)`).
   - **Sub-instruction** `Tap your name to open the show page.` (12px, `color: var(--muted-foreground)`). 4px below the heading.
   - **Optional banner row** (only present in cases 4, 5 from §6.1) — one-line copy in a 12px medium-weight inline note, FXAV-orange-tinted background (`bg-orange-100` / `bg-orange-900/30` in dark mode). 8px above the list.
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
| `bannerMessage` (cases 4, 5) | `null` | Banner row omitted; picker spacing flows as if it weren't there. |

### 7.4 Mode boundaries

The picker has exactly three render modes:

| Mode | When | Visual delta |
| ---- | ---- | ------------ |
| **Initial** | Cases 1, 2, 3 from §6.1 | No banner row. Standard heading + sub-instruction. |
| **Epoch-stale banner** | Case 4 | Banner row present, copy: "Doug reset access for this show — pick yourself again." |
| **Removed-from-roster banner** | Case 5 | Banner row present, copy: "Your previous selection was removed by Doug — pick yourself from the current roster." |

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
  `t` is a unix-second epoch of last touch. On read, `t` is updated and the cookie is re-emitted (this is the sliding-TTL mechanism). On write of a 51st entry, the minimum-`t` entry is dropped first.
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
- "Issue new link" button (mints a fresh JWT, displays a copy-link affordance)
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
- Confirm step: a `<Dialog>` opens with copy `Are you sure? <N> selections will be reset.` where `<N>` is a server-rendered count of unique `(show_id)` keys in the picker (this is a UX nicety — see §8.2 for why `<N>` is not strictly available, but we can show "selections may exist on any number of devices; this resets them all").
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

**New crew-facing copy codes** (rendered via `messageFor(...)` per AGENTS.md invariant 5; never displayed as raw codes):

- `PICKER_EPOCH_STALE_BANNER`: the banner copy on the picker when the cookie's epoch is behind the row's epoch. Default copy: "Doug reset access for this show — pick yourself again." Used by §6.1 case 4.
- `PICKER_REMOVED_FROM_ROSTER_BANNER`: the banner copy when the picked crew member is no longer in the roster. Default copy: "Your previous selection was removed by Doug — pick yourself from the current roster." Used by §6.1 case 5.
- `PICKER_EMPTY_ROSTER`: the empty-state copy when the show's roster has no rows yet. Default copy: "Doug hasn't added crew yet — check back soon." Used by §7.3 guard condition.
- `PICKER_SHOW_UNAVAILABLE`: rejection copy when `selectIdentity` runs against an unpublished or archived show. Default copy: "This show isn't available right now. Ask Doug for an updated link if you think this is a mistake." Used by §6.2 rejection paths.

**New operator-only rejection codes** (logged to structured log, never rendered):

- `PICKER_INVALID_INPUT`: `showId` or `crewMemberId` failed UUID validation in the Server Action.
- `PICKER_CREW_MEMBER_NOT_FOUND`: row not present at the moment of selection (sync ran between picker render and submit).
- `PICKER_CREW_MEMBER_WRONG_SHOW`: form-tamper defense (cross-show submission). Operator-only.

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
| `tests/auth/advisoryLockRpcDeadlock.test.ts` (existing) | EXTEND | The Reset action mutates `shows.picker_epoch` and therefore MUST hold the per-show advisory lock per AGENTS.md invariant 2 (see §4.5). The pin asserts: `resetPickerEpoch` acquires `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` at exactly the Server Action layer; no nested holder; no other writer of `picker_epoch` or `picker_epoch_bumped_at` exists. |
| `tests/admin/no-inline-email-normalization.test.ts` (existing) | NO CHANGE | Picker doesn't touch emails. |
| `tests/messages/_metaAdminAlertCatalog.test.ts` (existing) | EXTEND | Remove all M9.5-era codes; add `PICKER_EPOCH_RESET`, `PICKER_SELECTION_RACE`, and the new picker-rejection codes (`PICKER_INVALID_INPUT`, `PICKER_CREW_MEMBER_NOT_FOUND`, etc.). |
| `tests/auth/_metaPickerCookieContract.test.ts` (new) | CREATE | Pins the cookie envelope shape: name = `__Host-fxav_picker`, `v=1` strict, decoder returns null on shape failures, encoder/decoder are the only producers in the repo. Banned-identifier audit: the literal substring `__Host-fxav_picker` outside `lib/auth/picker/cookieEnvelope.ts`, the middleware, and the test fixtures fails. Asserts `MAX_COOKIE_VALUE_BYTES === 3800` and that the constant cannot be raised beyond 3900 without a paired `// browser-cap-implication-acknowledged` comment in the same hunk. |
| `tests/components/_metaPickerRoleChipContract.test.ts` (new) | CREATE | Pins the LEAD-chip-uses-FXAV-orange contract: any roster row where the underlying crew member has `LEAD` in `role_flags` renders with the accent chip; any other row renders the neutral chip. Test runs against a fixture roster with mixed `role_flags`. |
| `tests/cross-cutting/no-jwt-surface.test.ts` (new) | CREATE | Banned-identifier audit: the literal substrings `__Host-fxav_session`, `redeemLink`, `signLinkJwt`, `verifyLinkJwt`, `current_token_version`, `revoked_below_version`, `max_issued_version`, `bootstrap_nonces`, `link_sessions`, `revoked_links`, `crew_member_auth`, `LEAKED_LINK_DETECTED`, `CSRF_DENIED`, `validateCrewAssetSession`, `validateLinkSession`, `crew_link` (as a `kind` discriminator) MUST not appear anywhere in `app/**`, `lib/**`, `components/**`, `middleware.ts`, `supabase/migrations/<post-cutover>/**`. (Old migrations retain their history per migration-immutability rules.) |
| `tests/cross-cutting/picker-resolver-callsite-contract.test.ts` (new) | CREATE | Asserts every route handler that needs crew identity (`/show/[slug]/page.tsx`, `/api/realtime/subscriber-token`, `/api/asset/diagram/[show]/[rev]/[key]`, `/api/asset/reel/[show]`, `/api/asset/agenda/[show]/[id]`, `/api/show/[slug]/version`, `/api/report`) imports `resolvePickerSelection` from the canonical helper path AND distinguishes its `infra_error` arm from auth-denied. Static-analysis walker over the file list — does NOT depend on running the routes. |

### 10.2 Functional test coverage

The plan's TDD checklist includes:

- **Picker-renders cases (5 code-path variants → 3 visual modes)** — one test per case in §6.1 cases 1–5 (cases 1, 2, 3 all render the "initial" visual mode from §7.4 but via different code paths and must each be exercised; cases 4 and 5 render the two banner modes). Each test fires a request with a constructed cookie state and asserts the rendered DOM (heading present, list count matches roster, banner code matches expected `messageFor()` lookup or absent).
- **`selectIdentity` happy path** — Server Action sets cookie, route revalidates, next request resolves `kind: 'resolved'`.
- **`selectIdentity` rejection paths** — invalid UUID, crew_member_id not in roster, wrong show_id, archived show, unpublished show. Each asserts the specific rejection code AND that no cookie was written.
- **`clearIdentity`** — happy path (cookie key removed), all-shows-cleared path (cookie deleted entirely).
- **`resetPickerEpoch`** — happy path; non-admin rejection.
- **Cookie envelope** — round-trip encode/decode; reject `v != 1`; reject missing fields; reject wrong types; reject malformed JSON.
- **LRU eviction at cap** — write 51 entries; assert oldest by `t` was dropped.
- **Composite `viewer_version_token`** — DB-level test that the function returns a value advancing on `picker_epoch_bumped_at` updates.
- **Realtime bridge auth swap** — `/api/realtime/subscriber-token` reads picker cookie correctly; admin path via Google session still works.
- **Admin precedence preserved** — admin with a stale picker cookie still sees admin mode, not picker.
- **Unpublished/archived show guard** — non-admin viewer on an unpublished or archived show gets `notFound()` BEFORE any picker render. Test asserts: (a) no `roster-list` DOM element is emitted; (b) no DB query for `crew_members` was issued; (c) the response status is 404, not 200. Same test repeated for an archived (published=true, archived=true) show.
- **Asset route auth swap — diagram** — `/api/asset/diagram/<show>/<rev>/<assetKey>` accepts picker cookie for the matching show; rejects no-cookie (401); rejects wrong-show cookie (403, WITHOUT touching `link_sessions`-style server state — the picker model has no such state to clean up); rejects stale-epoch cookie (403); rejects removed-from-roster cookie (403); admin path via `isAdminSession` still works. The 410 (revision-mismatch) contract is unchanged from M11.
- **Asset route auth swap — reel** — `/api/asset/reel/<show>` same matrix as diagram. The buffer-then-verify md5 contract from the parent spec §7.3 is unchanged; only the auth source swaps.
- **Asset route auth swap — agenda** — `/api/asset/agenda/<show>/<id>` same matrix as diagram. Currently uses `validateCrewAssetSession`; pivot swaps to `resolvePickerSelection`. PDF streaming + content-disposition contract unchanged.
- **Version endpoint auth swap** — `/api/show/<slug>/version` accepts picker cookie for the matching show; rejects no-cookie (200 with `{ version_token: <current> }` is OK — version endpoint is intentionally open to crew on this show); admin still works. Asserts the response body is `{ version_token: <string> }` not leaking any auth-state diagnostic. Plus an `infra_error` test: when `viewer_version_token` RPC fails, the route returns 500, NOT 200-with-stale.
- **Report endpoint auth swap** — `/api/report` accepts picker cookie for the matching show; admin via `requireAdminIdentity` AND `validateGoogleSession` paths preserved. The body's `show_id` field's cross-cookie match is validated.
- **Middleware refresh** — request to `/show/<slug>` with a cookie entry for that show emits a Set-Cookie response header with the same value but bumped `t` and refreshed `Max-Age=7776000`. Request to `/show/<other-slug>` does NOT touch the cookie's entry for this slug. Request without a cookie produces no Set-Cookie header.
- **`cleanupStaleEntry` Server Action** — when called with a `showId` whose entry's `e` is stale, the entry is removed from the cookie envelope; when the envelope becomes empty, the cookie is fully cleared (`Max-Age=0`); when called for an entry that's already valid, no-op (idempotent).
- **Reset action advisory-lock holder topology** — extension to `tests/auth/advisoryLockRpcDeadlock.test.ts` asserts `resetPickerEpoch` acquires the lock at exactly one layer (the Server Action body) and is the only writer of `shows.picker_epoch`.

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

1. `<PickerInterstitial>` is a pure server render — no `'use client'`.
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
