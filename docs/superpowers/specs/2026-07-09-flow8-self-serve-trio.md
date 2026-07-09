# Flow 8 — Crew self-serve hardening trio (8.1 / 8.2 / 8.4)

**Date:** 2026-07-09
**Slug:** `flow8-self-serve-trio`
**Source:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §6 "Flow 8 — Crew self-serve (B+ → A−)", items 8.1, 8.2, 8.4.
**Scope owner:** Opus / Claude Code (8.1 is UI → Opus-only per AGENTS.md routing).
**Out of scope:** 8.3 (venue timezone at enrich) — separate later spec, different domain (sync/geocode/migration). Item 8.4's id-resolution + enrich-time no-match admin warning are **deferred into that 8.3 spec**, not this one (see §4.3).

---

## 1. Problem statement

The audit's "Done-when" for Flow 8: _every "can't find myself / can't see my stuff" path lands on a guided affordance, and no fail-open remains._ Three gaps stand between today's crew self-serve surface and that bar:

- **8.2 (fail-open — security):** `resolveViewerContext` (`lib/data/viewerContext.ts:112-151`) returns `{ kind: "none" }` restrictions when a `crew` / `admin_preview` viewer's id matches **no row** in a **well-formed** `crewMembers` array. `{ kind: "none" }` = whole-show visibility (every day, every phase). The intended semantics for an unmatched crew viewer is fail-**closed**, not whole-show. This mirrors the already-shipped `MalformedProjectionError` fail-closed limb (`viewerContext.ts:114-124`) which fails closed when `crewMembers` is not an array; the unmatched-row-in-a-well-formed-array case was left falling open.
- **8.1 (picker hardening — UI):** `_PickerInterstitial.tsx` renders every roster row verbatim. A row whose `name` is a generic sentinel (`""`, `"TBD"`, `"N/A"`, `"TBA"`, `"-"`, `"—"`) renders an un-identifiable identity button; two rows carrying the **same crew_member id** (accidental double-entry) render twice; and a crew member who does not see their name has no guided next step.
- **8.4 (transport visibility — regression harden):** `transportTileVisible` (`lib/visibility/scopeTiles.ts:177-202`) already matches by **fuzzy name** (`namesRefer`, `lib/data/nameMatch.ts`) — tolerant of nickname / legal-name / case / trim / prefix variance. This shipped 2026-06-26 (`c0165ad05`), **before** the audit was written (2026-07-07). The residual risk the audit names ("a name mis-parse can't hide a driver's own itinerary") is only partially closable by fuzzy matching, and the robust fix (id-based matching) requires new enrich-domain data plumbing that belongs with 8.3. This spec's 8.4 scope is therefore **regression-test hardening only** — pin the fuzzy tolerance so a future parser or predicate change cannot silently regress it.

---

## 2. Resolved decisions (single source of truth)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **8.2 fixed in two layers.** (a) PRIMARY guided path in `app/show/[slug]/[shareToken]/page.tsx` `resolved` case; (b) BACKSTOP structural throw in `resolveViewerContext`. | Guided re-pick is the UX; the throw removes the fail-open limb structurally so no future caller reintroduces it. |
| D2 | **8.2 introduces NO new message code.** Primary re-pick reuses `PICKER_REMOVED_FROM_ROSTER_BANNER`; backstop reuses `PICKER_RESOLVER_LOOKUP_FAILED`. | The unmatched-id state is semantically "your selection is no longer on the roster" (re-pick) and, at the backstop, "resolver lookup failed" — both already cataloged. |
| D3 | **8.1 dedup is by crew_member `id` only, never by `name`.** | Two different crew can share a display name; collapsing by name would hide a real second person who then cannot pick themselves. Rows carry unique ids; only exact-id duplicates are accidental double-entry. |
| D4 | **8.1 sentinel-guard uses the existing `shouldHideGenericOptional` predicate** (`lib/visibility/emptyState.ts:79`, set `GENERIC_OPTIONAL_HIDE` at `:56`). | One sentinel authority repo-wide; no new sentinel list. |
| D5 | **8.1 "contact" affordance is cataloged copy with NO PII and NO config** — new §12.4 code `PICKER_NAME_NOT_LISTED`, crew-facing copy routes crew back to whoever shared the link. | No crew-facing admin email/phone exists in the app; the picker footer already credits "Doug Larson" as issuer. Invariant 5 (no raw codes; catalog-driven copy). |
| D6 | **8.1 roster sanitization is a pure helper** `sanitizePickerRoster` (new, `lib/auth/picker/sanitizePickerRoster.ts`), applied where the roster is built. The picker component stays presentational. | Testable without a render harness; single transform, single call site (`loadRoster` in `page.tsx`). |
| D7 | **8.1 affordance is persistent** — rendered below the roster on **every non-empty** picker render, independent of banner/stale state. | The audit calls for a "persistent" affordance. Empty-roster already has its own `PICKER_EMPTY_ROSTER` copy; the affordance is for the non-empty "my name isn't here" case. |
| D8 | **8.4 is regression-test-only and does NOT close its audited failure mode** (tracked as `BL-TRANSPORT-ID-RESOLUTION`, dependent on 8.3). No production code change to `transportTileVisible`. No per-tile "don't see your ride?" affordance. | The predicate already fuzzy-matches; a per-tile affordance can't distinguish "assigned but mis-parsed" from "genuinely not assigned," so it would leak transport-exists and spam non-drivers. Hard mis-parse closure needs enrich-time id resolution = 8.3 domain (user Opt-1 decision). Tests pin current tolerance + document the residual; the milestone ships 8.1+8.2 as the audit closures, 8.4 as defensive-only. |
| D9 | **No DB migration, no advisory-lock surface, no new admin_alert code, no new telemetry surface.** | None of the three items mutate a locked table, add an RPC-gated table, or add a mutation surface. `sanitizePickerRoster` is pure; `resolveViewerContext` is pure; 8.4 is tests. |

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

  **Fix:** make **only** the `:301` crew-row-miss throw a distinct typed error `CrewMemberNotInShowError extends Error` whose `.message` stays the literal `"PICKER_CREW_MEMBER_WRONG_SHOW"` (back-compat, see below). But the crew-row miss is **not uniquely** "crew removed, show alive": `crew_members.show_id` is `ON DELETE CASCADE` (`supabase/migrations/20260501000000_initial_public_schema.sql:33`), so a **show deleted** mid-request cascades the crew row away, and because the crew lookup runs before the show read, the FIRST observed failure of a deleted show is this same `:301` miss. Rerouting every `:301` to the picker would show a re-pick (with an empty roster) for a show that should be **unavailable**. So `page.tsx`'s `CrewMemberNotInShowError` catch **re-validates show availability before rerouting**:
    - Read `shows(published, archived)` for `result.showId` via a small `loadShowAvailability(showId)` helper (Supabase `{ data, error }` discipline; **infra/read error → `<TerminalFailure … retryHref />`**, fail-closed).
    - Show **missing OR archived OR not published** → `notFound()` — identical to the resolver's `show_unavailable` arm (`page.tsx:102-106`). The show-deleted cascade lands on the unavailable/terminal path, NOT the picker.
    - Show **present + published** → `return renderPickerRepick(...)` (crew genuinely removed, show alive — the guided re-pick).
  - **Else** (any other `getShowForViewer` error — infra, `:317`, `:321`) → `<TerminalFailure … />` unchanged.

  (Point B below does NOT need this re-validation: if `getShowForViewer` *returned* a projection, it already passed its own show read at `:312-321`, so the show is available; only the pre-show-read throw at Point A carries the cascade ambiguity.)
- **Point B — post-projection guard.** If the id survives `:301` but is absent from the full-roster projection built at `getShowForViewer.ts:395-401` (a race between those two reads), `getShowForViewer` returns a well-formed `crewMembers` array missing the id. The page already computes `const crew = data.crewMembers?.find((c) => c.id === result.crewMemberId)` for the identity chip (`page.tsx:177`). New guard: `Array.isArray(data.crewMembers) && crew === undefined` → `return renderPickerRepick(...)` (not `CrewShell`). Non-array (malformed) falls through to `CrewShell`'s `MalformedProjectionError` arm, unchanged.
- **Point C — render-layer backstop.** `resolveViewerContext` throws `UnmatchedViewerError` for the same unmatched-in-well-formed-array state; `_CrewShell.tsx:211-219` catches it → `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />` (no retryHref, per above). For the **crew** route it is unreachable in the happy path (Points A+B route to re-pick before `CrewShell` renders) — it exists purely so no future caller of the pure helper can reintroduce the fail-open. For the **admin-preview** route it IS reachable (that route has no Point A/B guard): the `:301` throw is already handled by admin-preview's own `notFound()` (`preview/[crewId]/page.tsx:203-206`), and the post-projection race (Point B-equivalent) surfaces here as a terminal failure — the correct outcome for admin preview, where a crew re-pick is meaningless. No admin-preview Point B guard is added (out of scope; a raced deleted crew member terminally failing an internal preview is acceptable and not a security/UX gap). The no-retryHref arm keeps that terminal page href-safe for the shareToken-less admin-preview caller.

**Cache interaction (`unstable_cache`) — round-7 (why no per-render fresh crew read is added).** `getShowForViewer` serves its data fan-out from `unstable_cache` keyed by `showId` + viewer identity, tag `show-${showId}`, `revalidate: 300` TTL backstop (`getShowForViewer.ts:791-807`). On a cache hit the crew lookup + roster projection are not re-run, so a warmed viewer could momentarily receive a projection still containing a just-removed crew row. Three facts bound this to the pre-existing, accepted nav-perf staleness residual rather than a new 8.2 gap:

1. **The security fix (Point C) is cache-independent.** The audit's fail-open is "unmatched id → `{ kind: "none" }` = whole-show." A stale cache renders the id **present** (matched) → the viewer sees their **own** correct restricted view, never `{ none }`. Stale cache therefore cannot reintroduce the whole-show fail-open; Point C only fires when the id is genuinely absent from the array.
2. **Roster mutations bust the tag immediately, post-commit.** Crew rows are mutated ONLY through the sync apply paths (`lib/sync/applyStaged.ts:1967`, `discardStaged.ts:548`, `phase1/phase2`, cron `runScheduledCronSync.ts`), each of which calls `revalidateShow` / `revalidateShowFromResult` POST-COMMIT with `{ expire: 0 }` immediate expiry (`lib/data/showCacheTag.ts`). There is no ad-hoc single-crew delete surface. So the next `getShowForViewer` after any legit roster change is a fresh miss and Points A/B fire. The sub-request window between commit and the following read is the SAME residual `getShowForViewer.ts:820-826` already documents and `tests/data/getShowForViewer.cache.test.ts` already covers — and it converges on the next request via the LIVE resolver (`resolvePickerSelection` reads `crew_members` un-cached, `:91-107` → `removed_from_roster` + cookie cleanup).
3. **The show-cascade path never reaches a stale projection.** `resolvePickerSelection` reads `shows` LIVE (`:74-80`); a deleted/unpublished show returns `show_unavailable` (→ `notFound()`) **before** the `resolved` case calls `getShowForViewer`, so a cascaded (show-deleted) warm cache cannot render stale `CrewShell`.

Consequently 8.2 does NOT add a per-render fresh crew-membership read — that would regress the nav-perf tag-caching architecture (which deliberately removed per-render live crew reads). Freshness comes from the LIVE resolver + the post-commit tag bust. A test warms `getShowForViewer` for a crew viewer, then asserts that after a `revalidateShow` bust the resolver + Points A/B produce the re-pick (documenting the convergence path), and that a stale hit still renders the viewer's own restricted view (not whole-show), i.e. Point C's security property is cache-independent.

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

Rendered in `_PickerInterstitial.tsx` as a new element **below** the roster `<ul>` and **only when `roster.length > 0`** (empty-roster already shows `PICKER_EMPTY_ROSTER`). Placement: between the roster list and the `staleCleanupHint` mount. Exact markup:

```tsx
{roster.length > 0 && (
  <p
    data-testid="picker-name-not-listed"
    className="text-center text-xs text-text-subtle"
  >
    {messageFor("PICKER_NAME_NOT_LISTED").crewFacing}
  </p>
)}
```

Uses existing design tokens (`text-text-subtle`, `text-xs`, `text-center`) already used by the sub-instruction (`_PickerInterstitial.tsx:111-113`) and footer — no new tokens, no new `@theme` block.

**Guard conditions (8.1):**
- `sanitizePickerRoster([])` → `[]` (empty in, empty out; picker renders `PICKER_EMPTY_ROSTER`).
- All-sentinel roster → `[]` after sanitize → picker renders `PICKER_EMPTY_ROSTER` (not the affordance, since `length === 0`). Acceptable: a roster of only un-nameable rows is functionally empty.
- `row.name` a sentinel in **any case** (`"tbd"`, `"N/a"`) → dropped. `shouldHideGenericOptional` normalizes via `value.trim().toUpperCase()` (`emptyState.ts:81`) before the set check, so case and surrounding whitespace do not matter.
- Whitespace-only name (`"   "`) → `.trim()` → `""` ∈ `GENERIC_OPTIONAL_HIDE` → dropped. Confirmed by the predicate's trim, not assumed.
- Two rows, same id → one kept. Two rows, same name, different id → both kept.

**Mode boundaries (8.1):** the picker has two roster modes already — empty (`PICKER_EMPTY_ROSTER` centered block) and non-empty (roster list). The affordance belongs to the **non-empty** mode only. Claimed vs active rows (`_PickerInterstitial.tsx:153-215`) are unchanged; sanitize runs before that split and preserves `claimed_via_oauth_at`.

### 4.3 — 8.4 Transport visibility (regression harden only — audited failure mode NOT closed here)

**Scope-honesty statement (Round-5 finding).** This milestone does **NOT** close 8.4's audited failure mode ("a name mis-parse can hide a driver's own itinerary"). Fuzzy `namesRefer` matching — which already shipped `c0165ad05` — closes the *common* variance (nickname / legal-name / case / trim / prefix); a hard mis-parse **outside** that tolerance (garbled/merged-cell names that share no surname token) can still hide a driver's transport, with no transport-specific affordance and no operator warning. The robust closure (enrich-time id resolution + no-match admin warning) is **deferred to the 8.3 spec** by the user's explicit scope decision (Opt-1 over full-id-resolution), because it shares the enrich/geocode domain and admin-warning machinery with 8.3. It is tracked, not dropped: a `BACKLOG.md` entry `BL-TRANSPORT-ID-RESOLUTION` records the residual and its dependency on 8.3. **8.4's deliverable in THIS milestone is purely defensive:** pin the *current* fuzzy tolerance so a future parser/predicate change cannot silently regress the coverage that already exists. Do not read the 8.4 tests as "closing" the audit item — the audit's Flow-8 "Done-when" is met for 8.1 (picker affordance) and 8.2 (fail-closed + guided re-pick); 8.4's audited transport path remains **open pending 8.3** and is labeled so in the handoff.

New/extended test file pins `transportTileVisible` fuzzy tolerance against name-parse-variance fixtures:
- Driver assigned as `"Doug"`, viewer `"Doug Larson"` → visible (first-name/prefix).
- Driver `"Douglas Larson"`, viewer `"Doug Larson"` → visible (surname-compatible, non-prefix first name).
- Assigned-names leg `["Bill Werner"]`, viewer `"William Werner"` → visible (surname match).
- Case/trim variance (`"  doug larson "`) → visible.
- **Negative controls:** unrelated name `"Jane Smith"` → not visible; empty `viewerName` → not visible; `null` transportation → not visible; admin → visible when transportation exists.
- **Known-gap fixture (documents the residual, does not assert closure):** a hard mis-parse with no shared surname token (e.g. driver stored as `"DougLarsonHotelBallroom"` from a merged cell, viewer `"Doug Larson"`) → **not visible** under current `namesRefer`. This fixture is asserted as the *current* behavior and annotated as the `BL-TRANSPORT-ID-RESOLUTION` residual, so the test file itself records what 8.3 must fix rather than pretending the case is handled.

**Explicitly deferred to the 8.3 spec** (recorded here so a reviewer does not relitigate it as missing scope): enrich-time resolution of free-text `driver_name` / `assigned_names` → `crew_member` ids, persisting an id set on transportation legs, matching by id, and emitting an admin-visible "assigned name resolves to no roster member" warning.

---

## 5. Testing strategy (anti-tautology)

- **8.2 backstop (Point C):** unit test `resolveViewerContext` throws `UnmatchedViewerError` (not returns `{ none }`) for a `crew` viewer whose id is absent from a well-formed `crewMembers` array; assert the thrown type, and separately assert an `admin` viewer with the same (empty) array still returns `{ none }` + all-flags. Failure mode caught: silent fail-open reintroduced by a future edit. Assert against the returned/thrown value, not a rendered container.
- **8.2 Point A (pre-projection race — the Codex-flagged gap):** DB-integration test in the `getShowForViewer` suite — seed a show + crew row, then simulate the race by calling with a valid-shape crew id that is not in the show, and assert `getShowForViewer` rejects with `instanceof CrewMemberNotInShowError` AND `err.message === "PICKER_CREW_MEMBER_WRONG_SHOW"` (both properties — the class for the new reroute, the message for back-compat). Separately assert the existing `:317`/`:321` throws remain plain `Error` with that message (NOT `CrewMemberNotInShowError`), so `page.tsx` does not reroute a show-deleted / unpublished race to the picker. Failure mode caught: a legit raced crew member dead-ending on `TerminalFailure`, and (negative) a show-unavailable race wrongly bounced to a picker.
- **8.2 Point A/B routing — executable ShowPage-level proof (Round-4 MEDIUM):** the primary proof is a route-level render test that mirrors the existing `tests/show/resolvedArmCrewMembersGuard.test.tsx` harness (mocks `buildShowPageChainRequest`, `resolveShowPageAccess`, `getShowForViewer`, `next/navigation`, then renders the real `ShowPage`). Cases: (a) **Point A** — `resolveShowPageAccess` → `resolved`, `getShowForViewer` **rejects** with `CrewMemberNotInShowError`, roster load mocked → assert the render is `PickerInterstitial` (`data-testid="picker-interstitial-root"`) with `PICKER_REMOVED_FROM_ROSTER_BANNER`, NOT `TerminalFailure`; (b) **Point B** — `getShowForViewer` **resolves** a well-formed projection whose `crewMembers` omits the resolved id → same `PickerInterstitial` assertion; (c) **negative** — `getShowForViewer` rejects with a generic `Error` (and separately, an `Error` whose message is `"PICKER_CREW_MEMBER_WRONG_SHOW"` but is NOT a `CrewMemberNotInShowError`, i.e. the `:317`/`:321` shape) → assert `TerminalFailure`, NOT a re-pick. This proves the Server Component actually catches, awaits the helper with the right args, and returns the picker — a wiring mistake that a classifier-only test would miss fails here. A pure classifier unit test MAY additionally back this, but the route-level render test is the load-bearing proof, not a source-grep.
- **8.2 warm-cache staleness bound (Round-7 HIGH):** (a) warm `getShowForViewer` for a crew viewer, then assert a stale cache hit (crew id still present) renders the viewer's OWN restricted view — NOT `{ none }`/whole-show — proving Point C's security property is cache-independent; (b) assert that after `revalidateShow(showId)` busts the tag, the LIVE resolver returns `removed_from_roster` (re-pick + cleanup), documenting the convergence path. Failure mode caught: a claim that the stale-cache path reopens the whole-show fail-open (it does not) and confirmation that removal converges rather than sticking. No per-render fresh crew read is asserted (that would regress nav-perf caching).
- **8.2 show-cascade disambiguation (Round-6 HIGH):** route-level test — `resolveShowPageAccess` → `resolved`, `getShowForViewer` **rejects** `CrewMemberNotInShowError`, and the `loadShowAvailability` read returns (a) **unavailable/missing** (simulating the `ON DELETE CASCADE` show-deletion) → assert `notFound()` was called, NOT `PickerInterstitial`; (b) **available** → assert `PickerInterstitial` (crew removed, show alive); (c) **infra read error** → assert `TerminalFailure`. Failure mode caught: a deleted show routed into an empty-roster picker instead of the unavailable path.
- **8.2 re-pick helper fail-closed (roster-load failure):** test `renderPickerRepick` directly for BOTH outcomes — (a) `loadRoster` succeeds → returns `PickerInterstitial` with a **sanitized** roster and `PICKER_REMOVED_FROM_ROSTER_BANNER`; (b) `loadRoster` throws (infra) → returns `TerminalFailure` (code `PICKER_RESOLVER_LOOKUP_FAILED`) and does NOT re-throw. Failure mode caught: the new race path escaping to Next's generic error boundary, or rendering an unsanitized roster. This is the concrete gap the routing classifier alone does not cover.
- **8.2 back-compat regression:** assert admin preview's `notFound()` path still fires for a cross-show crew id (message-match unaffected by the subclass), and that `tests/data/getShowForViewer.test.ts:243`/`:260` (`.rejects.toThrow("PICKER_CREW_MEMBER_WRONG_SHOW")`) and `show-page-role-spoof.test.ts:48` (source-grep) still pass — the `:301` throw statement keeps the literal `"PICKER_CREW_MEMBER_WRONG_SHOW"` in source.
- **8.2 stale-cleanup non-regression (Round-3 HIGH):** after refactoring the existing stale arms onto `renderPickerRepick`, assert the `removed_from_roster` render STILL mounts `StaleCleanupAutoSubmit` (i.e. the helper received a non-null `staleCleanupHint` for that arm), and that the new Point A/B re-pick renders it with `staleCleanupHint={null}`. Failure mode caught: a helper extraction silently dropping the stale-cookie cleanup so reloads never converge.
- **8.2 admin-preview backstop href-safety (Round-3 MEDIUM):** assert the `UnmatchedViewerError` catch in `_CrewShell` renders `TerminalFailure` with NO `retryHref` (so the admin-preview caller, which passes no `shareToken`, never produces `/show/${slug}/undefined`). Failure mode caught: a broken retry URL on the shareToken-less admin-preview render.
- **8.1 sanitize:** table-driven unit test over `sanitizePickerRoster` — sentinel drop (each token in `GENERIC_OPTIONAL_HIDE`), id-dedup (first-wins, order preserved), same-name-different-id both-kept, empty→empty, all-sentinel→empty. Derive expected from the input fixtures; do not hardcode a length the fixture can't produce.
- **8.1 affordance render:** render `PickerInterstitial` with a non-empty roster → assert `data-testid="picker-name-not-listed"` present and text equals `messageFor("PICKER_NAME_NOT_LISTED").crewFacing` (assert against the catalog source, not a literal string, so copy edits don't desync the test). Render with empty roster → assert the affordance is **absent** and `PICKER_EMPTY_ROSTER` copy present.
- **8.1 catalog lockstep:** extend `tests/messages/picker-codes.test.ts` `PICKER_MESSAGE_CODES` with `PICKER_NAME_NOT_LISTED`; the x1-catalog-parity gate asserts §12.4 prose ↔ generated spec-codes ↔ catalog agreement.
- **8.4:** the fixtures above; each assertion states the mis-parse shape it catches.

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
| 9 Supabase call-boundary | yes | new `loadShowAvailability(showId)` read destructures `{ data, error }`; returned-error / thrown-error distinguished; infra fault → `TerminalFailure` (fail-closed), never a silent fallthrough. `loadRoster` unchanged except its return is wrapped in `sanitizePickerRoster`. Both are `page.tsx`-local reads (not auth-helper surfaces); carry an inline `// not-subject-to-meta` note or a registry row per the plan's meta-test inventory. |
| 10 mutation-surface telemetry | **N/A** | no new mutation surface; `sanitizePickerRoster` and `resolveViewerContext` are pure |

**Meta-test inventory:** EXTENDS `tests/messages/picker-codes.test.ts` (add `PICKER_NAME_NOT_LISTED`). CREATES none. No advisory-lock topology (invariant 2 N/A). No `_metaInfraContract` row (no new Supabase call boundary). No sentinel-hiding walker entry — `sanitizePickerRoster` is roster-name hiding, distinct from the tile optional-text sentinel contract; the plan states this explicitly rather than forcing a mismatched registry row.

**§12.4 new-code touchpoints (from prior-milestone lesson):** `PICKER_NAME_NOT_LISTED` is a plain **crew-facing** catalog row (like `PICKER_EMPTY_ROSTER`) — NOT an admin_alert code, NOT an internal/forensic `code:`, NOT a help-page family. So: (a) §12.4 master-spec table row, (b) `pnpm gen:spec-codes` regen, (c) `catalog.ts` row, (d) `picker-codes.test.ts` list — four lockstep edits in one commit. It does **not** trigger `gen:internal-code-enums`, a `/help/errors` family, or a `TRUST_DOMAINS` entry (those are for internal/admin/route codes). Run the full `tests/messages/` + `tests/cross-cutting/codes.test.ts` before push.

---

## 7. Watchpoints (disagreement-loop preempt for the reviewer)

- **8.2 fail-open reachability:** three race-window detection points (A pre-projection `:301`, B post-projection `:395`, C render backstop) route unmatched crew to the guided re-pick; `:317`/`:321` (show-row failure) deliberately stay on `TerminalFailure`. Do not relitigate "is this reachable" — fail-closed + guided-repick is correct posture either way.
- **8.2 `unstable_cache` staleness:** the warm-cache path does NOT reopen the fail-open — a stale hit has the id present (matched → restricted view, not `{none}`); Point C is cache-independent. Roster mutations (sync-only) bust the tag `{expire:0}` post-commit, so Points A/B fire on the next read; the sub-request window is the pre-existing nav-perf residual (`getShowForViewer.ts:820-826`, `getShowForViewer.cache.test.ts`) that converges via the live resolver. Do NOT recommend a per-render fresh crew read — it regresses nav-perf tag-caching; freshness is the live resolver + post-commit bust.
- **8.2 show-cascade (`ON DELETE CASCADE`):** Point A re-validates show availability (`loadShowAvailability`) before rerouting, because a deleted show cascades the crew row and surfaces first as the `:301` crew miss (crew-lookup is sequenced before the show read, a ratified guard that MUST NOT be reordered — `nav-perf…:50`). Deleted/unpublished show → `notFound()` (show-unavailable semantics), not the picker. Do not flag "reordering getShowForViewer would be simpler" — that violates the crew-first fail-closed sequence; the disambiguation is deliberately in `page.tsx` (this milestone's surface), keeping the shared helper's guard untouched.
- **`PICKER_CREW_MEMBER_WRONG_SHOW` is a shared tamper defense (§4.1):** the Point-A reroute is `instanceof CrewMemberNotInShowError`-scoped and only on the crew `resolved` route, where `resolvePickerSelection.ts:91-107` already filters tamper upstream. The subclass **preserves the message**, so admin-preview `notFound()` (`preview/[crewId]/page.tsx:204`) and the two throw-assert tests are unchanged. Do not flag "this weakens the cross-show defense" — it does not; other callers keep the message-based behavior.
- **8.4 already-fuzzy + NOT closed here:** `namesRefer` shipped `c0165ad05` (2026-06-26). 8.4 here is **tests only** by decision D8; the audited mis-parse failure mode is **NOT closed** by this milestone (§4.3 scope-honesty statement) — it is tracked as `BL-TRANSPORT-ID-RESOLUTION` and depends on the 8.3 enrich work. The tests pin the *current* fuzzy tolerance (regression guard) and include a known-gap fixture documenting the residual. Do not flag "8.4 does nothing" (it pins a regression surface) NOR "8.4 leaves the failure mode open without acknowledgement" (the spec explicitly labels it open pending 8.3 and files the backlog entry).
- **Dedup by id not name (D3):** collapsing same-name/different-id would hide a real person; this is deliberate, not an oversight.
- **Affordance has no live admin contact (D5):** intentional — no crew-facing admin email exists; copy routes crew to the link sender. Not a placeholder.
- **`admin` viewer still returns `{ none }` (§4.1):** intentional and unchanged; the 8.2 throw is crew/admin_preview-only.
