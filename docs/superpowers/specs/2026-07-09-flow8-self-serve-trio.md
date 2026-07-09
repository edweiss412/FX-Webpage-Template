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
| D8 | **8.4 is regression-test-only.** No production code change to `transportTileVisible`. No per-tile "don't see your ride?" affordance. | The predicate already fuzzy-matches. A per-tile affordance can't distinguish "assigned but mis-parsed" from "genuinely not assigned," so it would leak transport-exists and spam non-drivers. The global "can't find my stuff" path is the 8.1 picker affordance. |
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
| `getShowForViewer` cross-show single lookup (`:292`) + full roster projection (`:395`) | `lib/data/getShowForViewer.ts:292-295`, `:395-401` |
| `resolvePickerSelection` already returns `removed_from_roster` at cookie-check | `lib/auth/picker/resolvePickerSelection.ts:105-107` |
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

`_CrewShell.tsx:211-219` extends its existing catch: `UnmatchedViewerError` renders the same route-level infra arm the malformed case uses — `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" retryHref={/show/${slug}/${shareToken}} />`. A retry re-hits `page.tsx`, whose primary guard (below) routes to the picker re-pick.

**Primary (guided path).** In `page.tsx` `resolved` case, after `getShowForViewer` succeeds, the page already computes `const crew = data.crewMembers?.find((c) => c.id === result.crewMemberId)` for the identity chip (`page.tsx:177`). New guard: when `data.crewMembers` **is an array** and that `find` is `undefined`, do NOT render `CrewShell` — instead render the picker re-pick path exactly as the `removed_from_roster` case does (`loadRoster` + `<PickerInterstitial banner="PICKER_REMOVED_FROM_ROSTER_BANNER" …/>`). This is the guided affordance; the crew member re-picks rather than seeing a broken or over-permissive page. (If `crewMembers` is not an array — malformed — the page leaves that to `CrewShell`'s `MalformedProjectionError` arm, unchanged.)

**Why both layers (reachability, honest framing).** The fail-open is a **narrow, defense-in-depth** gap, not a wide hole: `getShowForViewer` validates the viewer's id against the show at `:292-295` (throws `PICKER_CREW_MEMBER_WRONG_SHOW` on miss) and builds the full roster at `:395-401`, so in a consistent read the id **is** present. The unmatched-in-well-formed-array state is only reachable via a race (the row deleted between the two reads) or a future projection change. Closing it fail-closed is the right posture regardless of current reachability; the two layers ensure both the render path (backstop) and the routing path (primary) are safe.

**Guard conditions (8.2):**
- `viewer.kind === "admin"` → unchanged `{ none }` + all-flags. Never throws.
- `viewer.kind === "crew" | "admin_preview"`, `crewMembers` not an array → `MalformedProjectionError` (unchanged).
- `crew | admin_preview`, well-formed array, **id matched** → matched row's restrictions/flags/name (unchanged).
- `crew | admin_preview`, well-formed array, **id not matched** → **throws `UnmatchedViewerError`** (was `{ none }`).
- `page.tsx` guard fires only when `Array.isArray(data.crewMembers)` AND `find === undefined`; the non-array case falls through to `CrewShell`.

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

### 4.3 — 8.4 Transport visibility (regression harden only)

No production change. New/extended test file pins `transportTileVisible` fuzzy tolerance against name-parse-variance fixtures:
- Driver assigned as `"Doug"`, viewer `"Doug Larson"` → visible (first-name/prefix).
- Driver `"Douglas Larson"`, viewer `"Doug Larson"` → visible (surname-compatible, non-prefix first name).
- Assigned-names leg `["Bill Werner"]`, viewer `"William Werner"` → visible (surname match).
- Case/trim variance (`"  doug larson "`) → visible.
- **Negative controls:** unrelated name `"Jane Smith"` → not visible; empty `viewerName` → not visible; `null` transportation → not visible; admin → visible when transportation exists.

**Explicitly deferred to the 8.3 spec** (recorded here so a reviewer does not relitigate it as missing scope): enrich-time resolution of free-text `driver_name` / `assigned_names` → `crew_member` ids, persisting an id set on transportation legs, matching by id, and emitting an admin-visible "assigned name resolves to no roster member" warning. That work shares the enrich/geocode domain and the admin-warning machinery with 8.3.

---

## 5. Testing strategy (anti-tautology)

- **8.2 backstop:** unit test `resolveViewerContext` throws `UnmatchedViewerError` (not returns `{ none }`) for a `crew` viewer whose id is absent from a well-formed `crewMembers` array; assert the thrown type, and separately assert an `admin` viewer with the same (empty) array still returns `{ none }` + all-flags. Failure mode caught: silent fail-open reintroduced by a future edit. Assert against the returned/thrown value, not a rendered container.
- **8.2 primary:** unit/integration test that `page.tsx`'s guard routes an unmatched resolved id to the picker (`PickerInterstitial` with the removed banner), not `CrewShell`. Since `page.tsx` is a Server Component, the test exercises the branch via the extracted guard predicate (the plan extracts the "unmatched → repick" decision into a pure, testable function if `page.tsx` cannot be unit-mounted cleanly).
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
| 9 Supabase call-boundary | **N/A** | no new Supabase call site (`loadRoster` unchanged except wrapping its return in a pure fn) |
| 10 mutation-surface telemetry | **N/A** | no new mutation surface; `sanitizePickerRoster` and `resolveViewerContext` are pure |

**Meta-test inventory:** EXTENDS `tests/messages/picker-codes.test.ts` (add `PICKER_NAME_NOT_LISTED`). CREATES none. No advisory-lock topology (invariant 2 N/A). No `_metaInfraContract` row (no new Supabase call boundary). No sentinel-hiding walker entry — `sanitizePickerRoster` is roster-name hiding, distinct from the tile optional-text sentinel contract; the plan states this explicitly rather than forcing a mismatched registry row.

**§12.4 new-code touchpoints (from prior-milestone lesson):** `PICKER_NAME_NOT_LISTED` is a plain **crew-facing** catalog row (like `PICKER_EMPTY_ROSTER`) — NOT an admin_alert code, NOT an internal/forensic `code:`, NOT a help-page family. So: (a) §12.4 master-spec table row, (b) `pnpm gen:spec-codes` regen, (c) `catalog.ts` row, (d) `picker-codes.test.ts` list — four lockstep edits in one commit. It does **not** trigger `gen:internal-code-enums`, a `/help/errors` family, or a `TRUST_DOMAINS` entry (those are for internal/admin/route codes). Run the full `tests/messages/` + `tests/cross-cutting/codes.test.ts` before push.

---

## 7. Watchpoints (disagreement-loop preempt for the reviewer)

- **8.2 fail-open reachability:** framed as narrow defense-in-depth (§4.1), not a wide hole — cite `getShowForViewer.ts:292-295` + `:395-401`. Do not relitigate "is this even reachable"; fail-closed is correct posture either way.
- **8.4 already-fuzzy:** `namesRefer` shipped `c0165ad05` (2026-06-26). 8.4 here is **tests only** by decision D8; id-resolution is **deferred to 8.3** by decision (§4.3), not omitted. Do not flag "8.4 does nothing" — it pins a regression surface.
- **Dedup by id not name (D3):** collapsing same-name/different-id would hide a real person; this is deliberate, not an oversight.
- **Affordance has no live admin contact (D5):** intentional — no crew-facing admin email exists; copy routes crew to the link sender. Not a placeholder.
- **`admin` viewer still returns `{ none }` (§4.1):** intentional and unchanged; the 8.2 throw is crew/admin_preview-only.
