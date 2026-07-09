# Flow 8 — Crew self-serve hardening: closes 8.1 + 8.2 (8.4 audit item deferred to 8.3)

**Date:** 2026-07-09
**Slug:** `flow8-self-serve-trio`
**Source:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §6 "Flow 8 — Crew self-serve (B+ → A−)".
**Scope owner:** Opus / Claude Code (8.1 is UI → Opus-only per AGENTS.md routing).

**What this milestone CLOSES (audit done-when met):**
- **8.1** — picker hardening + persistent "can't find your name" affordance.
- **8.2** — fail-closed viewer resolution + guided re-pick for the unmatched-crew race.

**What this milestone does NOT close (explicit, to remove any "Flow 8 done" contradiction):**
- **8.4 (transport visibility)** — **entirely deferred to the 8.3 spec; this milestone ships NOTHING for 8.4** (not even a regression pin). The audited failure mode "a hard name mis-parse hides a driver's own itinerary" is **NOT closed here**. Both its real fix (enrich-time crew-id resolution for transport assignments + id-based visibility + no-match admin warning) AND the defensive regression pins over the already-shipped `namesRefer` fuzzy matcher are deferred wholesale to the 8.3 spec (same enrich/geocode domain), tracked as `BACKLOG.md` → `BL-TRANSPORT-ID-RESOLUTION` — the pins land THERE, red-first alongside the real fix. (Rationale: a green-only characterization-pin task in *this* milestone conflicts with plan-wide invariant 1's non-negotiable red-first-per-task rule and cannot be waived by a plan; folding the pins into 8.3 lets them sit red-first against the real change.) A crew member CAN still miss their own ride on a hard mis-parse until 8.3 lands; the picker affordance (8.1) is the only crew-facing recourse in the interim.
- **8.3** (venue timezone at enrich) — separate later spec, different domain (sync/geocode/migration).

The PR title + handoff MUST read "closes Flow 8 items 8.1 + 8.2; 8.4 + 8.3 deferred" — never "closes Flow 8."

---

## 1. Problem statement

The audit's "Done-when" for Flow 8: _every "can't find myself / can't see my stuff" path lands on a guided affordance, and no fail-open remains._ Three gaps stand between today's crew self-serve surface and that bar:

- **8.2 (fail-open — security):** `resolveViewerContext` (`lib/data/viewerContext.ts:112-151`) returns `{ kind: "none" }` restrictions when a `crew` / `admin_preview` viewer's id matches **no row** in a **well-formed** `crewMembers` array. `{ kind: "none" }` = whole-show visibility (every day, every phase). The intended semantics for an unmatched crew viewer is fail-**closed**, not whole-show. This mirrors the already-shipped `MalformedProjectionError` fail-closed limb (`viewerContext.ts:114-124`) which fails closed when `crewMembers` is not an array; the unmatched-row-in-a-well-formed-array case was left falling open.
- **8.1 (picker hardening — UI):** `_PickerInterstitial.tsx` renders every roster row verbatim. A row whose `name` is a generic sentinel (`""`, `"TBD"`, `"N/A"`, `"TBA"`, `"-"`, `"—"`) renders an un-identifiable identity button; two rows carrying the **same crew_member id** (accidental double-entry) render twice; and a crew member who does not see their name has no guided next step.
- **Transport visibility (8.4) — entirely out of scope for this milestone; deferred to 8.3.** `transportTileVisible` (`lib/visibility/scopeTiles.ts:177-202`) already matches by **fuzzy name** (`namesRefer`, `lib/data/nameMatch.ts`) — tolerant of nickname / legal-name / case / trim / prefix variance (shipped `c0165ad05`, 2026-06-26, before the audit). The audited failure mode (a **hard** mis-parse hiding a driver's itinerary) needs id-based enrich-domain plumbing, deferred wholesale to 8.3 (`BL-TRANSPORT-ID-RESOLUTION`) — and the defensive regression pins over the existing fuzzy tolerance go with it (they land red-first in 8.3, not as a green-only task here). No 8.4 file, test, or production change ships in this milestone.

---

## 2. Resolved decisions (single source of truth)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **8.2 fixed in two layers.** (a) PRIMARY guided path in `app/show/[slug]/[shareToken]/page.tsx` `resolved` case; (b) BACKSTOP structural throw in `resolveViewerContext`. | Guided re-pick is the UX; the throw removes the fail-open limb structurally so no future caller reintroduces it. |
| D2 | **8.2 introduces NO new message code.** Primary re-pick reuses `PICKER_REMOVED_FROM_ROSTER_BANNER`; backstop reuses `PICKER_RESOLVER_LOOKUP_FAILED`. | The unmatched-id state is semantically "your selection is no longer on the roster" (re-pick) and, at the backstop, "resolver lookup failed" — both already cataloged. |
| D3 | **8.1 dedup is by crew_member `id` only, never by `name`.** | Two different crew can share a display name; collapsing by name would hide a real second person who then cannot pick themselves. Rows carry unique ids; only exact-id duplicates are accidental double-entry. |
| D4 | **8.1 sentinel-guard uses the existing `shouldHideGenericOptional` predicate** (`lib/visibility/emptyState.ts:79`, set `GENERIC_OPTIONAL_HIDE` at `:56`). | One sentinel authority repo-wide; no new sentinel list. |
| D5 | **8.1 "contact" affordance is cataloged copy with NO PII and NO config** — new §12.4 code `PICKER_NAME_NOT_LISTED`, crew-facing copy routes crew back to whoever shared the link. | No crew-facing admin email/phone exists in the app; the picker footer already credits "Doug Larson" as issuer. Invariant 5 (no raw codes; catalog-driven copy). |
| D6 | **8.1 roster sanitization is a pure helper** `sanitizePickerRoster` (new, `lib/auth/picker/sanitizePickerRoster.ts`), applied inside `loadRoster` (`page.tsx`) — the SINGLE sanitize chokepoint. The picker component stays presentational. | Testable without a render harness. **Every** picker render path (`no_auth`/gate-skip, all four stale arms, `renderPickerRepick`) reads its roster through `loadRoster`, so wrapping it there sanitizes all of them with one change — proven by a `loadRoster` boundary test (§5), not only the helper unit test. |
| D7 | **8.1 affordance is persistent** — rendered on **every** picker render, in BOTH the empty and non-empty roster modes, independent of banner/stale state. | The audit calls for a "persistent" affordance covering every "can't find myself" path. A sanitized-to-empty roster (raw rows all sentinel/dropped) is itself such a path, so the affordance must show in the empty mode too, complementing `PICKER_EMPTY_ROSTER` (Round-9). |
| D8 | **8.4 is ENTIRELY deferred to 8.3 — no 8.4 file, test, or production change ships here** (tracked as `BL-TRANSPORT-ID-RESOLUTION`, dependent on 8.3). No change to `transportTileVisible`. No per-tile "don't see your ride?" affordance. The defensive regression pins over the existing fuzzy tolerance move to 8.3 (red-first with the real fix). | The predicate already fuzzy-matches; a per-tile affordance can't distinguish "assigned but mis-parsed" from "genuinely not assigned," so it would leak transport-exists and spam non-drivers. Hard mis-parse closure needs enrich-time id resolution = 8.3 domain (user Opt-1 decision). A green-only regression-pin task *in this milestone* conflicts with plan-wide invariant 1 (non-negotiable red-first per task) and cannot be waived by a plan (user decision after plan-review round 11) — so the pins land in 8.3 instead, red-first. The milestone ships 8.1+8.2 as the audit closures. |
| D9 | **No DB migration, no advisory-lock surface, no new admin_alert code, no new telemetry surface.** | None of the two in-scope items mutate a locked table, add an RPC-gated table, or add a mutation surface. `sanitizePickerRoster` is pure; `resolveViewerContext` is pure; 8.4 ships nothing. |

---

## 3. Live-code citations (verified 2026-07-09 against `origin/main` @ `efa81c956`)

| Claim | Cite |
|-------|------|
| `resolveViewerContext` returns `{ kind: "none" }` for unmatched crew in a well-formed array | `lib/data/viewerContext.ts:125-141` |
| `MalformedProjectionError` fail-closed limb (throws when `crewMembers` not an array) | `lib/data/viewerContext.ts:67-74`, `:114-124` |
| `resolveViewerContext` callers (all render-tree) | `_CrewShell.tsx`, plus sections `Today/Travel/Schedule/Crew/Gear/Venue/Budget` |
| `_CrewShell` try/catch that renders infra arm on `MalformedProjectionError` | `app/show/[slug]/[shareToken]/_CrewShell.tsx:211-219` |
| `page.tsx` `resolved` case (renders `CrewShell`) | `app/show/[slug]/[shareToken]/page.tsx:152-189` |
| `page.tsx` `removed_from_roster` case (renders picker + banner) | `app/show/[slug]/[shareToken]/page.tsx:234-263` |
| `loadRoster` (roster read, `RosterRow[]`) | `app/show/[slug]/[shareToken]/page.tsx:59-68` |
| `RosterRow` shape (`id/name/role/role_flags/claimed_via_oauth_at`) | `app/show/[slug]/[shareToken]/page.tsx:51-57` |
| `PickerInterstitial` roster type + `roster.map` render | `_PickerInterstitial.tsx:39-45`, `:134-217` |
| `PICKER_EMPTY_ROSTER` render precedent (`messageFor(...).crewFacing`) | `_PickerInterstitial.tsx:126-132` |
| `shouldHideGenericOptional` + `GENERIC_OPTIONAL_HIDE` set | `lib/visibility/emptyState.ts:79`, `:56` |
| `transportTileVisible` fuzzy match via `namesRefer` | `lib/visibility/scopeTiles.ts:177-202` |
| `namesRefer` token/surname logic | `lib/data/nameMatch.ts:22-53` |
| `getShowForViewer` crew id+show lookup, throws crew-miss (Point A) | `lib/data/getShowForViewer.ts:287-301` |
| `getShowForViewer` reuses same message for show-deleted / unpublished (NOT rerouted) | `lib/data/getShowForViewer.ts:317`, `:321` |
| `getShowForViewer` full roster projection (Point B race window) | `lib/data/getShowForViewer.ts:395-401` |
| `page.tsx` `resolved`-case catch of all `getShowForViewer` errors (today → TerminalFailure) | `app/show/[slug]/[shareToken]/page.tsx:157-167` |
| `page.tsx` `show_unavailable` arm → `notFound()` (reuse for cascade) | `app/show/[slug]/[shareToken]/page.tsx:102-106` |
| `crew_members.show_id` is `ON DELETE CASCADE` (show delete cascades crew rows) | `supabase/migrations/20260501000000_initial_public_schema.sql:33` |
| crew-lookup-first is a ratified fail-closed sequencing guard (do NOT reorder) | `docs/superpowers/specs/nav-perf/2026-06-22-nav-perf-phase1-data-auth.md:50` |
| `getShowForViewer` show-row read + published check (after crew lookup) | `lib/data/getShowForViewer.ts:312-321` |
| `getShowForViewer` `unstable_cache` wrapper (per-viewer key, tag, TTL) + documented staleness residual | `lib/data/getShowForViewer.ts:791-807`, `:820-826` |
| `revalidateShow` / `{ expire: 0 }` immediate post-commit tag bust | `lib/data/showCacheTag.ts` |
| crew-mutating sync paths that revalidate post-commit | `lib/sync/applyStaged.ts:1967`, `discardStaged.ts:548`, `runScheduledCronSync.ts:3625` |
| existing cache-staleness coverage | `tests/data/getShowForViewer.cache.test.ts` |
| `resolvePickerSelection` filters foreign/removed id upstream (tamper pre-filter) | `lib/auth/picker/resolvePickerSelection.ts:91-107` |
| admin preview keys on `err.message === "PICKER_CREW_MEMBER_WRONG_SHOW"` → `notFound()` | `app/admin/show/[slug]/preview/[crewId]/page.tsx:203-206` |
| existing tests asserting the WRONG_SHOW throw (message-substring + source-grep) | `tests/data/getShowForViewer.test.ts:243`, `:260`; `tests/data/show-page-role-spoof.test.ts:48` |
| §12.4 catalog rows for picker codes (master spec prose) | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3049-3050` |
| `MessageCode = keyof typeof MESSAGE_CATALOG` | `lib/messages/catalog.ts:3398` |
| `MessageCatalogEntry` shape | `lib/messages/catalog.ts:1-…` |
| picker-codes list meta-test | `tests/messages/picker-codes.test.ts:6-27` |
| 3-way §12.4 lockstep gate (x1-catalog-parity) | `package.json:31`, `tests/cross-cutting/codes.test.ts` |

---

## 4. Design

### 4.1 — 8.2 Fail-closed viewer resolution

**Backstop (structural).** Add a typed error sibling to `MalformedProjectionError`:

```ts
export class UnmatchedViewerError extends Error {
  constructor(viewerKind: string, crewMemberId: string) { … }
  name = "UnmatchedViewerError";
}
```

In `resolveViewerContext`, the current unmatched-crew branch that yields `viewerCrew = null` → `{ kind: "none" }` restrictions is replaced: for a `crew` / `admin_preview` viewer, a **well-formed** `crewMembers` array that contains **no** row with `c.id === viewer.crewMemberId` **throws** `UnmatchedViewerError`. The `admin` viewer keeps its `{ kind: "none" }` + `SCOPE_TILE_UNLOCKING_FLAGS` limb unchanged (admin legitimately sees the whole show; it never reads `crewMembers` for a match). This deletes the crew fail-open limb entirely — `viewerCrew` is now either a real matched row or the code has thrown.

`_CrewShell.tsx:211-219` extends its existing catch: `UnmatchedViewerError` renders the **exact same** route-level infra arm the `MalformedProjectionError` case already uses — `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />` with **NO `retryHref`** (`_CrewShell.tsx:216`, §4.14). No retryHref is deliberate and route-agnostic: `CrewShell` is rendered by BOTH the crew route (`page.tsx`, has `shareToken`) AND the admin-preview route (`app/admin/show/[slug]/preview/[crewId]/page.tsx`, which passes `slug` but NO `shareToken`). A `retryHref={/show/${slug}/${shareToken}}` would render `/show/${slug}/undefined` for the admin-preview caller — a broken URL. Omitting retryHref (mirroring the malformed arm) is correct for both callers.

**Primary (guided path) — THREE detection points, one destination, one render helper.** A resolved crew viewer's id can fail to match at three progressively-later moments inside the `resolved` case; all three route to the **same** guided re-pick.

Because the re-pick render itself performs a **second async load** (`loadRoster`, which can fail on infra), the re-pick path is extracted into **one shared helper** that encapsulates the exact fail-closed contract the existing stale arms already use (`page.tsx:237-262`):

```ts
renderPickerRepick({ showId, slug, shareToken, s, banner, staleCleanupHint })
// try { roster = await loadRoster(showId) }
// catch { return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" retryHref={/show/${slug}/${shareToken}} /> }
// return <PickerInterstitial roster={roster} banner={banner} staleCleanupHint={staleCleanupHint} s={s} … />
```

(`loadRoster` already applies `sanitizePickerRoster` per D6, so the helper does not re-sanitize.) The helper NEVER re-throws: roster-load failure is contained to `TerminalFailure`, never Next's generic boundary (invariant per `page.tsx:31` "every external data load …").

**`banner` and `staleCleanupHint` are parameters, not hardcoded** — this preserves the existing stale arms' cookie-cleanup behavior:
- The existing `case "epoch_stale" | "removed_from_roster" | "selection_reset" | "identity_invalidated"` block (`page.tsx:233-263`) is refactored to call the helper, passing its current `banner = staleBannerFor(result.kind)` AND its current `staleCleanupHint = { expectedEpoch: result.expectedEpoch, expectedCrewMemberId: result.expectedCrewMemberId }`. `_StaleCleanupAutoSubmit` (compare-and-delete of the stale picker cookie) MUST still mount for those arms — dropping the hint would leave a removed-roster cookie alive so reloads re-enter the stale branch instead of converging. A regression test pins that the `removed_from_roster` render still mounts `StaleCleanupAutoSubmit`.
- The **new Point A / Point B** calls pass `banner = "PICKER_REMOVED_FROM_ROSTER_BANNER"` and `staleCleanupHint = null`. Null is correct here (NOT a regression): these paths fire from the `resolved` case, where the cookie's epoch still matches (`resolvePickerSelection.ts:87` passed) and only the crew row vanished mid-request. On the next reload, `resolvePickerSelection` re-queries `crew_members` (`:93-107`) and — finding the row gone — itself returns `removed_from_roster`, which carries the hint and performs the cleanup. So the race converges via the resolver on reload; render-mounted cleanup is not needed at Point A/B (and the `resolved` result carries no `expectedEpoch` to supply one).

- **Point A — pre-projection throw (the race Codex round-1 flagged), WITH show-cascade disambiguation (round-6).** `getShowForViewer` performs its crew id+show lookup FIRST (`getShowForViewer.ts:287-301`, before the show-row read at `:312` and the roster projection at `:395`; this crew-first sequencing is a ratified fail-closed guard per `docs/superpowers/specs/nav-perf/2026-06-22-nav-perf-phase1-data-auth.md:50` and MUST NOT be reordered). If the crew row vanished between `resolveShowPageAccess` returning `resolved` and this lookup, `:301` throws. Today `page.tsx:158-167` catches **all** `getShowForViewer` errors as `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />` — so a legit-but-raced crew member dead-ends instead of the audit's guided re-pick.

  **Fix:** make **only** the `:301` crew-row-miss throw a distinct typed error `CrewMemberNotInShowError extends Error` whose `.message` stays the literal `"PICKER_CREW_MEMBER_WRONG_SHOW"` (back-compat, see below). But the crew-row miss is **not uniquely** "crew removed, show alive": `crew_members.show_id` is `ON DELETE CASCADE` (`supabase/migrations/20260501000000_initial_public_schema.sql:33`), so a **show deleted** mid-request cascades the crew row away. Point A catches this via the shared `renderRacedCrewMiss` decision (below), then falls to `<TerminalFailure … />` for any other `getShowForViewer` error (infra, `:317`, `:321`).

- **Point B — post-projection guard.** If the id survives `:301` but is absent from the full-roster projection built at `getShowForViewer.ts:395-401`, `getShowForViewer` returns a well-formed `crewMembers` array missing the id. The page already computes `const crew = data.crewMembers?.find((c) => c.id === result.crewMemberId)` for the identity chip (`page.tsx:177`). New guard: `Array.isArray(data.crewMembers) && crew === undefined` → the shared `renderRacedCrewMiss` decision (not `CrewShell`). Non-array (malformed) falls through to `CrewShell`'s `MalformedProjectionError` arm, unchanged.

- **Shared `renderRacedCrewMiss` decision — Point A AND Point B route through it (round-12).** BOTH points must disambiguate crew-removed from show-deleted, because the CASCADE window spans the whole of `getShowForViewer`: the show row is read at `:312` but the roster projection at `:393-401`, so a show deleted **between** those two reads yields a well-formed projection **missing the viewer id** (Point B) — NOT only the pre-show-read throw (Point A). Both therefore call one shared decision before rendering the picker:
    - Read `shows(published, archived)` for `result.showId` via a small `loadShowAvailability(showId)` helper (Supabase `{ data, error }` discipline; **infra/read error → `<TerminalFailure … retryHref />`**, fail-closed).
    - Show **missing OR archived OR not published** → `notFound()` — identical to the resolver's `show_unavailable` arm (`page.tsx:102-106`). The show-deleted cascade lands on the unavailable/terminal path from BOTH points, NOT the picker.
    - Show **present + published** → `return renderPickerRepick(...)` (crew genuinely removed, show alive — the guided re-pick).
  (The stale arms — `epoch_stale` / `removed_from_roster` / `selection_reset` / `identity_invalidated` — call `renderPickerRepick` directly WITHOUT this recheck: the resolver already validated show availability LIVE for those kinds (`resolvePickerSelection.ts:74-86` → `show_unavailable`). Only the two `resolved`-case race points, which bypass that live check, need `renderRacedCrewMiss`.)
- **Point C — render-layer backstop.** `resolveViewerContext` throws `UnmatchedViewerError` for the same unmatched-in-well-formed-array state; `_CrewShell.tsx:211-219` catches it → `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />` (no retryHref, per above). For the **crew** route it is unreachable in the happy path (Points A+B route to re-pick before `CrewShell` renders) — it exists purely so no future caller of the pure helper can reintroduce the fail-open. For the **admin-preview** route it IS reachable (that route has no Point A/B guard): the `:301` throw is already handled by admin-preview's own `notFound()` (`preview/[crewId]/page.tsx:203-206`), and the post-projection race (Point B-equivalent) surfaces here as a terminal failure — the correct outcome for admin preview, where a crew re-pick is meaningless. No admin-preview Point B guard is added (out of scope; a raced deleted crew member terminally failing an internal preview is acceptable and not a security/UX gap). The no-retryHref arm keeps that terminal page href-safe for the shareToken-less admin-preview caller.

**Cache interaction (`unstable_cache`) — round-7 (why no per-render fresh crew read is added).** `getShowForViewer` serves its data fan-out from `unstable_cache` keyed by `showId` + viewer identity, tag `show-${showId}`, `revalidate: 300` TTL backstop (`getShowForViewer.ts:791-807`). On a cache hit the crew lookup + roster projection are not re-run, so a warmed viewer could momentarily receive a projection still containing a just-removed crew row. Three facts bound this to the pre-existing, accepted nav-perf staleness residual rather than a new 8.2 gap:

1. **8.2's SPECIFIC fix (the unmatched-id → whole-show fail-open) cannot recur via stale cache.** The audit item is narrow: `resolveViewerContext` returning `{ kind: "none" }` = **whole-show** (every day, every phase, financials) for an id that is **absent** from the array. A stale cache hit has the id **present**, so `resolveViewerContext` matches that (stale) row and applies **its** restrictions/flags — never the `{ none }` whole-show limb. So the *specific* fail-open this milestone closes (Point C) is not reachable through the cache: Point C fires only when the id is genuinely absent. **This is NOT a claim that a stale hit is always "correct"** — see the scope boundary in point 4.
2. **Roster mutations bust the tag immediately, post-commit.** Crew rows (and their `role_flags` / restrictions) are mutated ONLY through the sync apply paths (`lib/sync/applyStaged.ts:1967`, `discardStaged.ts:548`, `phase1/phase2`, cron `runScheduledCronSync.ts`), each of which calls `revalidateShow` / `revalidateShowFromResult` POST-COMMIT with `{ expire: 0 }` immediate expiry (`lib/data/showCacheTag.ts`). There is no ad-hoc single-crew delete/demote surface. So the next `getShowForViewer` after any legit roster/role change is a fresh miss and Points A/B (removal) fire. The sub-request window between commit and the following read is the SAME residual `getShowForViewer.ts:820-826` documents and `tests/data/getShowForViewer.cache.test.ts` covers — converging on the next request via the LIVE resolver (`resolvePickerSelection` reads `crew_members` un-cached, `:91-107` → `removed_from_roster` + cookie cleanup).
3. **The show-cascade path never reaches a stale projection.** `resolvePickerSelection` reads `shows` LIVE (`:74-80`); a deleted/unpublished show returns `show_unavailable` (→ `notFound()`) **before** the `resolved` case calls `getShowForViewer`, so a cascaded (show-deleted) warm cache cannot render stale `CrewShell`.
4. **Scope boundary — stale *entitlements* (e.g. demoted LEAD) are a PRE-EXISTING nav-perf property, explicitly OUT of 8.2 scope (round-13).** Because `getShowForViewer` caches the viewer's `role_flags` / restrictions / optional financials, a crew member **demoted** (LEAD→non-LEAD) or restriction-narrowed after the resolver validates them but before the tag is busted can, for the sub-request propagation window, receive their **previously-entitled** (e.g. LEAD-gated) cached view. This is a property of the nav-perf tag-caching architecture that existed before this milestone — 8.2 neither introduces nor widens it — and it is bounded the same way as point 2 (entitlement changes flow through the sync apply paths that `revalidateShow` post-commit `{expire:0}`, plus the LIVE `viewer_version_token` + realtime bridge that fires `router.refresh()` on version change). 8.2 does **not** attempt to close stale-entitlement caching, and this spec does **not** claim a stale hit is always a "correct" view — only that the *specific unmatched-id whole-show fail-open* (Point C) is cache-independent. Hardening stale entitlements would require a per-render live entitlement read, which is a nav-perf/caching concern (deliberately out of scope here); if prioritized it is its own effort, not 8.2.

Consequently 8.2 does NOT add a per-render fresh crew-membership/entitlement read — that would regress the nav-perf tag-caching architecture. Freshness comes from the LIVE resolver + the post-commit tag bust. Tests: (a) warm `getShowForViewer` for a crew viewer, then assert that after a `revalidateShow` bust the resolver + Points A/B produce the re-pick (convergence path); (b) assert a stale hit with the id **present** renders that row's restrictions (matched, NOT `{ none }`/whole-show) — i.e. Point C's *unmatched-id* security property is cache-independent — while explicitly NOT asserting the stale entitlement is otherwise "current" (that is the documented out-of-scope residual, point 4).

**Sites `:317` and `:321` are NOT rerouted.** `getShowForViewer` reuses the same `"PICKER_CREW_MEMBER_WRONG_SHOW"` message at `:317` (show row deleted) and `:321` (show unpublished for non-admin) — **different** semantics from the crew-row miss, and their correct destination is `TerminalFailure`, not a re-pick. Because Point A keys on `instanceof CrewMemberNotInShowError` (a class), not the message string, `:317`/`:321` (which stay plain `new Error("PICKER_CREW_MEMBER_WRONG_SHOW")`) correctly fall through to `TerminalFailure`. This is why the reroute uses a distinct **class** rather than matching the message.

**Security: rerouting Point A is not a tamper-defense regression.** `"PICKER_CREW_MEMBER_WRONG_SHOW"` is a cross-show form-tamper defense (master spec §12.4, `2026-04-30-…:3056`). But by the time control reaches `getShowForViewer` inside the crew page's `resolved` case, `resolvePickerSelection` has **already** validated the cookie's id against `crew_members` for this show (`resolvePickerSelection.ts:91-107` → a foreign / removed id returns `removed_from_roster`, which itself routes to the picker). So a genuine tamper id never reaches Point A on this route — it is filtered upstream — and a `:301` throw here means the id was valid ~ms earlier and vanished (a race). The tamper defense at `:301` remains fully intact for **other** `getShowForViewer` callers that do not pre-filter (admin preview → `notFound()` at `preview/[crewId]/page.tsx:204`; api routes). Those callers key on `err.message === "PICKER_CREW_MEMBER_WRONG_SHOW"`, which `CrewMemberNotInShowError` preserves — so their behavior is **unchanged**.

**Backstop (structural, resolveViewerContext).** Add a typed error sibling to `MalformedProjectionError`:

```ts
export class UnmatchedViewerError extends Error {
  constructor(viewerKind: string, crewMemberId: string) { … }
  name = "UnmatchedViewerError";
}
```

The current unmatched-crew branch that yields `viewerCrew = null` → `{ kind: "none" }` is replaced: for a `crew` / `admin_preview` viewer, a **well-formed** `crewMembers` array with **no** matching row **throws** `UnmatchedViewerError`. The `admin` viewer keeps its `{ kind: "none" }` + `SCOPE_TILE_UNLOCKING_FLAGS` limb unchanged.

**Guard conditions (8.2):**
- `viewer.kind === "admin"` → unchanged `{ none }` + all-flags. Never throws.
- `viewer.kind === "crew" | "admin_preview"`, `crewMembers` not an array → `MalformedProjectionError` (unchanged).
- `crew | admin_preview`, well-formed array, **id matched** → matched row's restrictions/flags/name (unchanged).
- `crew | admin_preview`, well-formed array, **id not matched** → **throws `UnmatchedViewerError`** (was `{ none }`).
- `page.tsx` Point A catch fires only for `err instanceof CrewMemberNotInShowError`; every other `getShowForViewer` error (infra, `:317`, `:321`) → `TerminalFailure`.
- `page.tsx` Point B guard fires only when `Array.isArray(data.crewMembers)` AND `find === undefined`; the non-array case falls through to `CrewShell`.

### 4.2 — 8.1 Picker hardening

**Pure helper.** `lib/auth/picker/sanitizePickerRoster.ts`:

```ts
export function sanitizePickerRoster(roster: RosterRow[]): RosterRow[]
```

Two transforms, order-stable:
1. **Sentinel-guard:** drop any row where `shouldHideGenericOptional(row.name)` is true. (An un-nameable identity button is not selectable in any meaningful way; the affordance covers the dropped person.)
2. **Dedup by id:** keep the first occurrence of each `row.id`; drop later exact-id duplicates. Preserves input order (which `loadRoster` already sorts by name ascending). Same-name / different-id rows are **both kept**.

Applied in `page.tsx` `loadRoster` return: `return sanitizePickerRoster((data ?? []) as RosterRow[])`. Every picker render path (`no_auth`/gate-skip, `epoch_stale`, `removed_from_roster`, `selection_reset`, `identity_invalidated`) reads through `loadRoster`, so all get sanitized rosters with one change.

**Persistent affordance (rendered element).** New §12.4 code `PICKER_NAME_NOT_LISTED`:
- crewFacing: `"Don't see your name? Ask the person who shared this link to add you."`
- dougFacing `null`, followUp `"Crew → ask the link sender"`, all other fields `null` — exact mirror of `PICKER_EMPTY_ROSTER`'s shape.

Rendered in `_PickerInterstitial.tsx` **unconditionally** — on EVERY picker render, in BOTH the empty and non-empty roster modes (Round-9 finding: a sanitized-to-empty roster is itself a "can't find myself" case and must still get the guided next step). Placement: after the roster region (the `<ul>` in non-empty mode / the `PICKER_EMPTY_ROSTER` block in empty mode) and before the `staleCleanupHint` mount. In empty mode it complements `PICKER_EMPTY_ROSTER` ("nobody added yet" + "ask the link sender"); in sanitized-empty mode (raw rows all dropped) it is the crew member's only recourse; in non-empty mode it sits below the list. Exact markup:

```tsx
<p
  data-testid="picker-name-not-listed"
  className="text-center text-xs text-text-subtle"
>
  {messageFor("PICKER_NAME_NOT_LISTED").crewFacing}
</p>
```

Uses existing design tokens (`text-text-subtle`, `text-xs`, `text-center`) already used by the sub-instruction (`_PickerInterstitial.tsx:111-113`) and footer — no new tokens, no new `@theme` block.

**Guard conditions (8.1):**
- `sanitizePickerRoster([])` → `[]` (empty in, empty out; picker renders `PICKER_EMPTY_ROSTER` block **plus** the always-on `PICKER_NAME_NOT_LISTED` affordance).
- All-sentinel / sanitized-to-empty roster (raw non-empty, every row dropped) → `[]` after sanitize → picker renders the `PICKER_EMPTY_ROSTER` block **plus** the affordance. The crew member whose only row was a sentinel still gets "ask the link sender" — the done-when is met, not suppressed.
- `row.name` a sentinel in **any case** (`"tbd"`, `"N/a"`) → dropped. `shouldHideGenericOptional` normalizes via `value.trim().toUpperCase()` (`emptyState.ts:81`) before the set check, so case and surrounding whitespace do not matter.
- Whitespace-only name (`"   "`) → `.trim()` → `""` ∈ `GENERIC_OPTIONAL_HIDE` → dropped. Confirmed by the predicate's trim, not assumed.
- Two rows, same id → one kept. Two rows, same name, different id → both kept.

**Mode boundaries (8.1):** the picker has two roster modes — empty (`PICKER_EMPTY_ROSTER` centered block) and non-empty (roster list). The `PICKER_NAME_NOT_LISTED` affordance is a **shared element rendered in BOTH modes** (see the render contract above). Claimed vs active rows (`_PickerInterstitial.tsx:153-215`) are unchanged; sanitize runs before that split and preserves `claimed_via_oauth_at`.

### 4.3 — Transport visibility (8.4): entirely deferred to 8.3 — nothing ships here

**Scope-honesty statement (Round-5 finding; scope narrowed at plan-review Round-11).** This milestone does **NOT** close 8.4's audited failure mode ("a name mis-parse can hide a driver's own itinerary"), **and it ships no 8.4 artifact at all — no production change, no test, no file.** Fuzzy `namesRefer` matching — which already shipped `c0165ad05` — closes the *common* variance (nickname / legal-name / case / trim / prefix); a hard mis-parse **outside** that tolerance (garbled/merged-cell names that share no surname token) can still hide a driver's transport, with no transport-specific affordance and no operator warning. The robust closure (enrich-time id resolution + no-match admin warning) is **deferred to the 8.3 spec** by the user's explicit scope decision (Opt-1 over full-id-resolution), because it shares the enrich/geocode domain and admin-warning machinery with 8.3.

An earlier draft of this milestone included a **defensive regression pin** over the existing fuzzy tolerance. That pin was **removed** (plan-review Round-11): a green-only characterization/regression-pin task passes immediately and therefore has no red phase, which conflicts with plan-wide **invariant 1** (failing test → impl → passing → commit, *non-negotiable per task*); a plan cannot self-declare an exemption to a non-negotiable invariant. **The pins move to the 8.3 spec**, where they land red-first alongside the real id-resolution change (the natural place — 8.3 touches this exact predicate). This is tracked, not dropped: `BACKLOG.md` → `BL-TRANSPORT-ID-RESOLUTION` records both the residual failure mode AND the deferred regression pins, with the known-gap fixture (`"Doug Larson Loadout"` vs `"Doug Larson"` → not visible, verified live at `nameMatch.ts:50-53`) preserved there for 8.3 to implement.

The audit's Flow-8 "Done-when" is met for 8.1 (picker affordance) and 8.2 (fail-closed + guided re-pick); 8.4's audited transport path remains **open pending 8.3** and is labeled so in the handoff. The picker affordance (8.1) is the only crew-facing recourse for a hidden ride in the interim.

**Explicitly deferred to the 8.3 spec** (recorded here so a reviewer does not relitigate it as missing scope): (a) the defensive regression pins over `transportTileVisible`'s current fuzzy tolerance (name-parse-variance fixtures + the `"Doug Larson Loadout"` known-gap fixture), landing red-first; and (b) enrich-time resolution of free-text `driver_name` / `assigned_names` → `crew_member` ids, persisting an id set on transportation legs, matching by id, and emitting an admin-visible "assigned name resolves to no roster member" warning.

**Durable tracking (Round-10/Round-13) — DONE in this branch.** The residual is tracked by the `BACKLOG.md` entry `BL-TRANSPORT-ID-RESOLUTION` (describing "a hard driver-name mis-parse hides the driver's own itinerary" + its dependency on the 8.3 enrich spec + the known-gap fixture reference), which is **added in this same branch** (committed alongside this spec — `rg BL-TRANSPORT-ID-RESOLUTION BACKLOG.md` now returns the row). The deferral is therefore durably tracked outside this spec's prose, not merely asserted.

---

## 5. Testing strategy (anti-tautology)

- **8.2 backstop (Point C):** unit test `resolveViewerContext` throws `UnmatchedViewerError` (not returns `{ none }`) for a `crew` viewer whose id is absent from a well-formed `crewMembers` array; assert the thrown type, and separately assert an `admin` viewer with the same (empty) array still returns `{ none }` + all-flags. Failure mode caught: silent fail-open reintroduced by a future edit. Assert against the returned/thrown value, not a rendered container.
- **8.2 Point A (pre-projection race — the Codex-flagged gap):** DB-integration test in the `getShowForViewer` suite — seed a show + crew row, then simulate the race by calling with a valid-shape crew id that is not in the show, and assert `getShowForViewer` rejects with `instanceof CrewMemberNotInShowError` AND `err.message === "PICKER_CREW_MEMBER_WRONG_SHOW"` (both properties — the class for the new reroute, the message for back-compat). Separately assert the existing `:317`/`:321` throws remain plain `Error` with that message (NOT `CrewMemberNotInShowError`), so `page.tsx` does not reroute a show-deleted / unpublished race to the picker. Failure mode caught: a legit raced crew member dead-ending on `TerminalFailure`, and (negative) a show-unavailable race wrongly bounced to a picker.
- **8.2 Point A/B routing — executable ShowPage-level proof (Round-4 MEDIUM):** the primary proof is a route-level render test that mirrors the existing `tests/show/resolvedArmCrewMembersGuard.test.tsx` harness (mocks `buildShowPageChainRequest`, `resolveShowPageAccess`, `getShowForViewer`, `next/navigation`, then renders the real `ShowPage`). Cases (all with `loadShowAvailability` mocked **available** — the show-deleted case is the separate cascade test below): (a) **Point A** — `resolveShowPageAccess` → `resolved`, `getShowForViewer` **rejects** with `CrewMemberNotInShowError`, roster load mocked → assert the render is `PickerInterstitial` (`data-testid="picker-interstitial-root"`) with `PICKER_REMOVED_FROM_ROSTER_BANNER`, NOT `TerminalFailure`; (b) **Point B** — `getShowForViewer` **resolves** a well-formed projection whose `crewMembers` omits the resolved id → same `PickerInterstitial` assertion; (c) **negative** — `getShowForViewer` rejects with a generic `Error` (and separately, an `Error` whose message is `"PICKER_CREW_MEMBER_WRONG_SHOW"` but is NOT a `CrewMemberNotInShowError`, i.e. the `:317`/`:321` shape) → assert `TerminalFailure`, NOT a re-pick. This proves the Server Component actually catches, awaits the helper with the right args, and returns the picker — a wiring mistake that a classifier-only test would miss fails here. A pure classifier unit test MAY additionally back this, but the route-level render test is the load-bearing proof, not a source-grep.
- **8.2 warm-cache staleness bound (Round-7 + Round-13):** (a) warm `getShowForViewer` for a crew viewer, then assert a stale cache hit with the crew id **present** renders **that matched row's restrictions** — NOT the `{ none }`/whole-show limb — proving Point C's *unmatched-id* security property is cache-independent. Do NOT assert the stale hit's entitlements are otherwise "current" (a demoted-LEAD stale view is the documented pre-existing nav-perf residual, §4.1 point 4, `BL`-untracked-here-by-design/out-of-8.2-scope). (b) assert that after `revalidateShow(showId)` busts the tag, the LIVE resolver returns `removed_from_roster` (re-pick + cleanup), documenting the convergence path. Failure mode caught: a claim that the stale-cache path reopens the *whole-show unmatched-id* fail-open (it does not). No per-render fresh crew/entitlement read is asserted (that would regress nav-perf caching).
- **8.2 show-cascade disambiguation, BOTH points (Round-6 + Round-12 HIGH):** route-level tests that the shared `renderRacedCrewMiss` decision fires for **both** race points. For **Point A** — `getShowForViewer` **rejects** `CrewMemberNotInShowError`; for **Point B** — `getShowForViewer` **resolves** a well-formed projection whose `crewMembers` omits the resolved id (simulating a show deleted between the `:312` show read and the `:393` roster read). In each, drive `loadShowAvailability` to return (a) **unavailable/missing** → assert `notFound()`, NOT `PickerInterstitial`; (b) **available** → assert `PickerInterstitial` (crew removed, show alive); (c) **infra read error** → assert `TerminalFailure`. Failure mode caught: a deleted show routed into an empty-roster picker from either race point instead of the unavailable path.
- **8.2 re-pick helper fail-closed (roster-load failure):** test `renderPickerRepick` directly for BOTH outcomes — (a) `loadRoster` succeeds → returns `PickerInterstitial` with a **sanitized** roster and `PICKER_REMOVED_FROM_ROSTER_BANNER`; (b) `loadRoster` throws (infra) → returns `TerminalFailure` (code `PICKER_RESOLVER_LOOKUP_FAILED`) and does NOT re-throw. Failure mode caught: the new race path escaping to Next's generic error boundary, or rendering an unsanitized roster. This is the concrete gap the routing classifier alone does not cover.
- **8.2 back-compat regression:** assert admin preview's `notFound()` path still fires for a cross-show crew id (message-match unaffected by the subclass), and that `tests/data/getShowForViewer.test.ts:243`/`:260` (`.rejects.toThrow("PICKER_CREW_MEMBER_WRONG_SHOW")`) and `show-page-role-spoof.test.ts:48` (source-grep) still pass — the `:301` throw statement keeps the literal `"PICKER_CREW_MEMBER_WRONG_SHOW"` in source.
- **8.2 stale-cleanup non-regression (Round-3 HIGH):** after refactoring the existing stale arms onto `renderPickerRepick`, assert the `removed_from_roster` render STILL mounts `StaleCleanupAutoSubmit` (i.e. the helper received a non-null `staleCleanupHint` for that arm), and that the new Point A/B re-pick renders it with `staleCleanupHint={null}`. Failure mode caught: a helper extraction silently dropping the stale-cookie cleanup so reloads never converge.
- **8.2 admin-preview backstop href-safety (Round-3 MEDIUM):** assert the `UnmatchedViewerError` catch in `_CrewShell` renders `TerminalFailure` with NO `retryHref` (so the admin-preview caller, which passes no `shareToken`, never produces `/show/${slug}/undefined`). Failure mode caught: a broken retry URL on the shareToken-less admin-preview render.
- **8.1 sanitize:** table-driven unit test over `sanitizePickerRoster` — sentinel drop (each token in `GENERIC_OPTIONAL_HIDE`), id-dedup (first-wins, order preserved), same-name-different-id both-kept, empty→empty, all-sentinel→empty. Derive expected from the input fixtures; do not hardcode a length the fixture can't produce.
- **8.1 affordance render (both modes — Round-9), tested at the correct boundary (Round-10):** the component is presentational (sanitation lives in `loadRoster` per D6), so the render test passes **already-sanitized** roster values to `PickerInterstitial`, never raw rows: (a) a non-empty sanitized roster, (b) `[]` → in **both** assert `data-testid="picker-name-not-listed"` present with text equal to `messageFor("PICKER_NAME_NOT_LISTED").crewFacing` (assert against the catalog source, not a literal string); for (b) additionally assert `PICKER_EMPTY_ROSTER` copy present alongside the affordance. The **"raw all-sentinel → `[]`"** behavior is proven separately at the boundary where sanitation actually runs — the `sanitizePickerRoster` helper unit test (below). Composed, they prove: raw all-sentinel rows sanitize to `[]` (helper test) AND an empty roster still shows the guided affordance (component test). Failure mode caught: a `roster.length > 0` gate suppressing the guided next step, without pushing sanitation into the component.
- **8.1 sanitize-at-the-boundary (Round-11):** the pure-helper + component tests do NOT prove the picker actually *receives* sanitized rows on the common `no_auth` / gate-skip first-contact path (which renders directly from `loadRoster`, `page.tsx:220-230`, NOT through `renderPickerRepick`). So add a boundary proof: (a) a `loadRoster` unit test with a mocked Supabase service-role client returning raw rows that include a sentinel name (`"TBD"`) and a duplicate id → assert the returned array is sanitized (sentinel dropped, dup collapsed); AND (b) a route-level render test of the `no_auth` gate-skip arm (mirroring the existing show-page harness) with the same raw roster mock → assert the rendered picker shows only the sanitized rows plus the `picker-name-not-listed` affordance. Failure mode caught: an implementation that sanitizes only the new `renderPickerRepick` path (or forgets to wrap `loadRoster`), letting raw `TBD`/duplicate rows ship on first-contact picker renders while the helper/component tests still pass. This makes `loadRoster` the single, proven sanitize chokepoint for every picker path (`no_auth`, all stale arms, `renderPickerRepick`).
- **8.1 catalog lockstep:** extend `tests/messages/picker-codes.test.ts` `PICKER_MESSAGE_CODES` with `PICKER_NAME_NOT_LISTED`; the x1-catalog-parity gate asserts §12.4 prose ↔ generated spec-codes ↔ catalog agreement.
- **8.4:** no tests in this milestone — the transport regression fixtures are deferred to 8.3 (§4.3) and preserved in `BL-TRANSPORT-ID-RESOLUTION`.

---

## 6. Invariants & meta-tests

| Invariant | Applies? | How honored |
|-----------|----------|-------------|
| 1 TDD per task | yes | every task: failing test first |
| 2 advisory lock | **N/A** | no locked-table mutation |
| 3 email canonicalization | **N/A** | no raw email touched |
| 4 no global sync cursor | **N/A** | — |
| 5 no raw error codes in UI | yes | affordance + re-pick banner + backstop all route through `lib/messages/lookup.ts` |
| 6 commit per task | yes | one task ↔ one commit |
| 7 spec canonical | yes | new §12.4 row added to master spec in the same commit as catalog.ts + spec-codes regen |
| 8 impeccable dual-gate | yes (8.1 touches `_PickerInterstitial.tsx`) | `/impeccable critique` + `/impeccable audit` on the picker diff before close-out; HIGH/CRITICAL fixed or `DEFERRED.md` |
| 9 Supabase call-boundary | yes | new `loadShowAvailability(showId)` read destructures `{ data, error }`; returned-error / thrown-error distinguished; infra fault → `TerminalFailure` (fail-closed), never a silent fallthrough. Enforcement: an inline `// not-subject-to-meta: page.tsx-local read; {data,error} + fail-closed; covered by route tests` comment (mirrors the existing `loadRoster` precedent) PLUS the executable route test asserting the infra-error → `TerminalFailure` branch. It is NOT added to `tests/auth/_metaInfraContract.test.ts` because that registry governs `lib/auth/**` helpers, and this is a `page.tsx`-local read (same rationale as `loadRoster`, which is likewise not a member). `loadRoster` unchanged except its return is wrapped in `sanitizePickerRoster`. |
| 10 mutation-surface telemetry | **N/A** | no new mutation surface; `sanitizePickerRoster` and `resolveViewerContext` are pure |

**Meta-test inventory:** EXTENDS `tests/messages/picker-codes.test.ts` (add `PICKER_NAME_NOT_LISTED`). CREATES none. No advisory-lock topology (invariant 2 N/A). **`loadShowAvailability` is a NEW Supabase call boundary but is NOT a `_metaInfraContract` member** — that registry scans `lib/auth/**` helpers, and this is a `page.tsx`-local read (same class as the existing `loadRoster`, which is also not a registry member). Its call-boundary discipline is enforced by the inline `// not-subject-to-meta:` reason comment + the executable route test that proves the infra-error → `TerminalFailure` branch (see invariant-9 row above). No sentinel-hiding walker entry — `sanitizePickerRoster` is roster-name hiding, distinct from the tile optional-text sentinel contract; the plan states this explicitly rather than forcing a mismatched registry row.

**§12.4 new-code touchpoints (from prior-milestone lesson):** `PICKER_NAME_NOT_LISTED` is a plain **crew-facing** catalog row (like `PICKER_EMPTY_ROSTER`) — NOT an admin_alert code, NOT an internal/forensic `code:`, NOT a help-page family. So: (a) §12.4 master-spec table row, (b) `pnpm gen:spec-codes` regen, (c) `catalog.ts` row, (d) `picker-codes.test.ts` list — four lockstep edits in one commit. It does **not** trigger `gen:internal-code-enums`, a `/help/errors` family, or a `TRUST_DOMAINS` entry (those are for internal/admin/route codes). Run the full `tests/messages/` + `tests/cross-cutting/codes.test.ts` before push.

---

## 7. Watchpoints (disagreement-loop preempt for the reviewer)

- **8.2 fail-open reachability:** three race-window detection points (A pre-projection `:301`, B post-projection `:395`, C render backstop) route unmatched crew to the guided re-pick; `:317`/`:321` (show-row failure) deliberately stay on `TerminalFailure`. Do not relitigate "is this reachable" — fail-closed + guided-repick is correct posture either way.
- **8.2 `unstable_cache` staleness:** the warm-cache path does NOT reopen the fail-open — a stale hit has the id present (matched → restricted view, not `{none}`); Point C is cache-independent. Roster mutations (sync-only) bust the tag `{expire:0}` post-commit, so Points A/B fire on the next read; the sub-request window is the pre-existing nav-perf residual (`getShowForViewer.ts:820-826`, `getShowForViewer.cache.test.ts`) that converges via the live resolver. Do NOT recommend a per-render fresh crew read — it regresses nav-perf tag-caching; freshness is the live resolver + post-commit bust.
- **8.2 show-cascade (`ON DELETE CASCADE`):** BOTH resolved-race points (A pre-projection throw, B post-projection missing-id) re-validate show availability via the shared `renderRacedCrewMiss` (`loadShowAvailability`) before rerouting — the cascade window spans `getShowForViewer`'s show read (`:312`) to its roster read (`:393`), so a deleted show can surface at either point. Deleted/unpublished → `notFound()` (show-unavailable semantics), not the picker. The stale arms bypass the recheck (resolver already live-validated the show). Do not flag "reordering getShowForViewer would be simpler" — that violates the ratified crew-first fail-closed sequence (`nav-perf…:50`); the disambiguation is deliberately in `page.tsx` (this milestone's surface), keeping the shared helper's guard untouched.
- **`PICKER_CREW_MEMBER_WRONG_SHOW` is a shared tamper defense (§4.1):** the Point-A reroute is `instanceof CrewMemberNotInShowError`-scoped and only on the crew `resolved` route, where `resolvePickerSelection.ts:91-107` already filters tamper upstream. The subclass **preserves the message**, so admin-preview `notFound()` (`preview/[crewId]/page.tsx:204`) and the two throw-assert tests are unchanged. Do not flag "this weakens the cross-show defense" — it does not; other callers keep the message-based behavior.
- **8.4 fully deferred to 8.3 — NOTHING ships here:** `namesRefer` shipped `c0165ad05` (2026-06-26). By decision D8, 8.4 ships **no file, no test, no production change** in this milestone; both the real id-resolution fix AND the defensive regression pins are deferred to 8.3 (§4.3), tracked as `BL-TRANSPORT-ID-RESOLUTION`. The pins were removed here (plan-review Round-11) because a green-only regression-pin task conflicts with invariant 1's non-negotiable red-first rule; they land red-first in 8.3. Do not flag "8.4 is missing scope" (it is explicitly deferred, tracked, and labeled open pending 8.3) NOR relitigate the removed pin as an omission (its removal was a deliberate invariant-1 decision).
- **Dedup by id not name (D3):** collapsing same-name/different-id would hide a real person; this is deliberate, not an oversight.
- **Affordance has no live admin contact (D5):** intentional — no crew-facing admin email exists; copy routes crew to the link sender. Not a placeholder.
- **`admin` viewer still returns `{ none }` (§4.1):** intentional and unchanged; the 8.2 throw is crew/admin_preview-only.
