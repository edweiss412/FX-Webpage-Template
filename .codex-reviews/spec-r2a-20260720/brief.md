# Adversarial spec review R2a - CATALOG + GALLERY (sections 1-4)

## Your role: REVIEWER ONLY

Do not fix issues, do not propose patches, do not imply changes you will make. Surface findings only. Do NOT run shell commands or tools; the artifact is inlined. Do NOT invoke any nested review.

## Posture

Fresh eyes on a spec for a DEV-ONLY instrument in a Next.js 16 + Supabase admin app. It renders every alert/warning state of an admin "show modal" without waiting for live data to raise the row. Two consumers of one catalog: a build-gated gallery route (renders states, no DB) and a "materialize" dev-panel card (writes tagged rows to a local or validation Supabase so the real modal shows the state for real).

Round 1 already ran and returned 29 findings; all P0/P1 were repaired. This is round 2 on the revision.

## Binding project invariants (abbreviated)

- Inv 2: mutations of shows/crew_members/crew_member_auth/pending_syncs/pending_ingestions run inside a per-show advisory lock held at EXACTLY ONE layer.
- Inv 5: no raw error codes in user-visible UI; copy resolves via lib/messages/lookup.ts. (The spec ratifies a scoped dev-instrument exception in 1.1 - verify the scope is coherent, do not re-argue that it exists.)
- Inv 9: every Supabase call destructures { data, error }; infra faults surface as typed discriminable results.
- Inv 10: every mutating server action needs an AUDITABLE_MUTATIONS registry row plus executable success-branch behavioral proof; emits post-commit, outside any lock.
- Dev routes under app/admin/dev/ are gated BUILD-TIME by a script that renames registered files aside before `next build`.
- Tailwind v4 here does NOT default .flex to align-items:stretch; fixed-dimension parents with flex/grid children need explicit dimensional invariants verified in a real browser.
- Every prop/input needs stated behavior for null, empty, zero, malformed.

## Output format

Per finding: `SEVERITY (P0/P1/P2/P3) - <claim> - <section> - <why it fails, concretely>`.
Enumerate ALL instances of each defect class you identify in THIS round; dripping one instance per round is a review defect.

End with a final line exactly: `VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`

## SCOPE OF THIS REVIEW

You are reviewing sections 1 through 4 ONLY: the scenario catalog, its type shapes, alert/warning totality, the fidelity contract between the two consumers, and the gallery route including its client boundary and query-param guards. Sections 5-13 (materialize, invariants, build gate, tests) are reviewed separately - do not report findings about them beyond noting a contradiction with what you see here.

## ARTIFACT (sections 1-4 of the spec)

# Attention scenario gallery + materialize — design

**Date:** 2026-07-20
**Branch:** `feat/attention-scenario-gallery`
**Status:** draft, revision 2 (post Codex R1)

---

## 1. Problem

The admin show modal's attention surface — alert pills, section banners, compact alert cards, parse-warning cards — is only observable when live sheet data or an operator action happens to raise the underlying row. Most alert codes and parse-warning codes never fire against the test shows, so their copy, routing, tone, and layout are unverified by eye. The existing unit and meta tests pin _structure_ (routing totality, no-drop, copy parity) but nothing renders the surface for a human.

Two distinct gaps:

1. **No sweep.** There is no way to see every state at once and judge copy/layout/routing.
2. **No drive.** There is no way to put a chosen state in front of the real modal, at the real URL, with working buttons.

This design closes both from one catalog.

## 1.1 Resolved scope — do not relitigate

Decided during brainstorming, or ratified in R1 triage. Cite the ratification before re-opening.

| Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Ratification              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Gallery renders **T1 + T2 only**; T3 composites are materialize-only. Mounting the whole surface against a synthetic snapshot fixture was considered and rejected as a drift liability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | §4.3, §5.0                |
| **No CI gate.** No screenshot byte-comparison, no catalog-completeness meta-test. Totality on the alert axis is achieved structurally instead (§3.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | §3.1, §12                 |
| **No migration.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | §5.4                      |
| **No new advisory-lock holder.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | §7.2                      |
| Gallery server actions are inert by design (synthetic ids).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | §4.4                      |
| The gallery route is dev-only and absent from the production artifact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | §6                        |
| **Invariant 5 carries a scoped exception for this instrument, ratified here.** The gallery and the materialize card display raw `code` strings, scenario ids, and result codes. Invariant 5 protects _operators_ from raw codes in the product UI; these two surfaces are developer instruments behind `requireDeveloper`, renamed out of the production artifact at build time (§6), whose entire subject matter **is** the code catalog. A gallery that hid codes could not perform its function. Scope of the exception is exactly: the routing readout (§4.1), scenario ids, the `PICKER_EPOCH_RESET` non-render row, the unknown-scenario id list, the materialize selector, and the §5.3 result codes. Everywhere else — including all rendered card copy — codes resolve through `lib/messages/lookup.ts` as normal. (Codex R1 #1: correct that R1 asserted an exception §1.1 had not ratified. Ratified now rather than argued.) | this row                  |
| **Validation targeting stays**, but Clear on validation does **not** re-sync (§5.5). The user chose local + validation; R1 #5 showed the re-sync step cannot be made env-correct cheaply, so that one step is dropped on validation rather than the whole capability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | §5.5                      |
| `attention-gallery-full.png` (an earlier ad-hoc screenshot at the repo root) is discarded, not folded in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | user decision, 2026-07-20 |

## 2. Canonical numbers

Every count in this document resolves here. Later sections reference this table; they do not restate values.

| Name                 | Value | Source (verified 2026-07-20)                                                                                      |
| -------------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `N_ALERT_CODES`      | 45    | `lib/admin/attentionItems.ts:95-143` — `ATTENTION_ROUTES` entries                                                 |
| `N_ALERT_RENDERABLE` | 44    | `N_ALERT_CODES` minus `PICKER_EPOCH_RESET`, cut in `deriveAttentionItems` (`lib/admin/attentionItems.ts:315-317`) |
| `N_ROUTES_OVERVIEW`  | 34    | `ATTENTION_ROUTES` `sectionId: "overview"`                                                                        |
| `N_ROUTES_CREW`      | 3     | `ATTENTION_ROUTES` `sectionId: "crew"`                                                                            |
| `N_ROUTES_EVENT`     | 3     | `ATTENTION_ROUTES` `sectionId: "event"` (all anchored `opening_reel`)                                             |
| `N_ROUTES_ROOMS`     | 3     | `ATTENTION_ROUTES` `sectionId: "rooms"` (all anchored `diagrams`)                                                 |
| `N_ROUTES_WARNINGS`  | 2     | `ATTENTION_ROUTES` `sectionId: "warnings"`                                                                        |
| `N_ANCHORED`         | 6     | `N_ROUTES_EVENT` + `N_ROUTES_ROOMS`                                                                               |
| `N_WARN_ENUM`        | 39    | `lib/messages/__generated__/internal-code-enums.ts` entries with `source: "parse_warnings.code"`                  |
| `N_WARN_GAP`         | 4     | §3.2 — parse-warning codes the generator's scan heuristic misses                                                  |
| `N_WARN_CODES`       | 43    | `N_WARN_ENUM` + `N_WARN_GAP`                                                                                      |
| `MENU_CAP`           | 12    | §4.2 — item count for the "many" scenario                                                                         |

`N_ROUTES_OVERVIEW + N_ROUTES_CREW + N_ROUTES_EVENT + N_ROUTES_ROOMS + N_ROUTES_WARNINGS = N_ALERT_CODES` (34+3+3+3+2 = 45).

Cross-check: `ADMIN_ALERTS_CODES` (`tests/messages/adminAlertsRegistry.ts:9`) also has 45 entries and is pinned set-equal to `ATTENTION_ROUTES` by `tests/admin/_metaAttentionRoutes.test.ts`.

## 3. Catalog

**Module (new file):** `lib/dev/attentionScenarios.ts (new)`

A scenario declares **storable inputs** — shapes that exist in the database — never pre-built `AttentionItem`s and never derived read-model shapes (§3.3).

```ts
export type AttentionScenario = {
  id: string; // ^[a-z0-9][a-z0-9-]{2,47}$ - DOM anchor and DB tag
  tier: 1 | 2 | 3;
  label: string; // non-empty
  alerts: ScenarioAlertRow[];
  holds: ScenarioHoldRow[];
  warnings?: ParseWarning[]; // TRI-STATE, see 3.4
  bucket?: Partial<BucketOpts>; // T2 only
  degraded?: boolean; // T2 only
};
```

### 3.0 Alert and hold row shapes

The catalog is authored in the DB's own column names, so the mapping to an insert is identity plus three injected fields. This removes the camel/snake conversion boundary R1 #8 found undefined.

```ts
export type ScenarioAlertRow = {
  code: string;
  context: Record<string, unknown>; // NOT NULL in DDL - {} never null
  raised_at: string; // ISO 8601
  occurrence_count: number; // integer >= 1
  galleryIdentity?: AlertIdentity | null; // GALLERY-ONLY, never inserted (3.3)
};

export type ScenarioHoldRow = {
  drive_file_id: string;
  domain: "crew_email" | "crew_identity";
  entity_key: string;
  held_value: Record<string, unknown>; // NOT NULL
  proposed_value: Disposition; // NOT NULL for mi11_pending
  base_modified_time: string; // NOT NULL for mi11_pending
  kind: "mi11_pending"; // see 3.0a
  reservation_collisions?: Array<{ name: string; email: string | null }>;
};
```

**Injected at materialize time, never authored:** `id` (DB default `gen_random_uuid()`), `show_id` (the target show), the `__devScenario` tag (§5.1b). **`id` is likewise injected in the gallery** — a deterministic synthetic `gallery:<scenario id>:<index>` — which is what §4.4's "synthetic ids" refers to. (R1 #8.)

#### 3.0a Every scenario hold must satisfy the `sync_holds` CHECK constraints

`supabase/migrations/20260608000000_sync_holds.sql:29-37` constrains `mi11_pending` rows: `proposed_value` NOT NULL, `base_modified_time` NOT NULL, and `proposed_value->>'disposition' in ('email_change','rename','removal')`. `domain` is constrained to `crew_email | crew_identity` (line 21-23).

`kind` is fixed to `"mi11_pending"` in the type because it is the only kind that becomes an attention item: `toHoldItem` (`lib/admin/attentionItems.ts:284-286`) returns null unless `status === "pending"` and `action === "approve_reject"`, which only an open `mi11_pending` hold produces. An `undo_override` row is expressible in the DB but is dead weight here, so the type forbids it.

**`unique (show_id, domain, entity_key)`** (line 39-41) is the hold analogue of the alert unique index. It is handled identically to §5.1a: a scenario may not carry two holds sharing `(domain, entity_key)`, and a collision with a pre-existing real hold causes a skip-and-report, never an overwrite. (R1 #11 correctly noted this constraint analysis was missing.)

### 3.1 Alert totality is structural, not listed

T1 alert scenarios are **derived at runtime** from `Object.keys(ATTENTION_ROUTES)`, not hand-listed. A new alert code appears in the gallery the moment its `ATTENTION_ROUTES` row lands — no catalog edit, no drift, no completeness meta-test.

Realistic content comes from an override map keyed by code. **Overrides set storable fields only** — in practice `context`, since that is what the derivation reads:

```ts
const ALERT_ROW_OVERRIDES: Partial<Record<string, Partial<ScenarioAlertRow>>> = { ... };
```

Default row: `context: {}`, `occurrence_count: 1`, `galleryIdentity: null`, fixed `raised_at`. `context` is `{}` and never `null` because `admin_alerts.context` is `jsonb not null`; a null default would be gallery-legal but un-insertable, diverging exactly where §3.3 forbids.

Codes whose rendered content depends on context need an override. **Each row below names the storable context key, not the derived field** (R1 #9 — the previous revision listed `crewName`/`messageParams`/`identityText`, which are derived and unauthorable):

| Code                                                                     | Storable input required                                                                                                     | Derived consequence                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TILE_PROJECTION_FETCH_FAILED`                                           | `context.failedKeys: string[]`                                                                                              | `readFailedKeys` (`lib/admin/attentionItems.ts:233-236`) returns null for any other code or a non-array                                                                                              |
| `SHOW_FIRST_PUBLISHED`                                                   | `context` shaped for `readDataGapsDigest`                                                                                   | gated on that exact code (`lib/admin/attentionItems.ts:279`)                                                                                                                                         |
| `PARSE_ERROR_LAST_GOOD`                                                  | `context.error_code` ∈ `PARSE_FAILURE_ALLOWLIST`                                                                            | `readErrorCode` (`lib/admin/attentionItems.ts:242-246`) drops anything else                                                                                                                          |
| `AMBIGUOUS_EMAIL_BINDING`, `OAUTH_IDENTITY_CLAIMED`, `ROLE_FLAGS_NOTICE` | `galleryIdentity` carrying a crew name, **and** the matching identity context keys that `projectIdentityContext` allowlists | `crewNameFor` (`lib/adminAlerts/fetchPerShowAlerts.ts:58`) reads the projected context and the resolved identity; `crewKey` binds only when it yields a name (`lib/admin/attentionItems.ts:255-256`) |

Any code whose catalog `dougFacing` template carries `<placeholder>` tokens needs context that fully interpolates, or `safeDougFacingTemplate` returns null and the card falls back — itself a state worth seeing, so T2 keeps one deliberate non-interpolating scenario.

**`PICKER_EPOCH_RESET`** has an `ATTENTION_ROUTES` row for registry totality but is filtered out in derive. The gallery renders it as an explicit "cut in derive, renders nothing" row so the absence is legible rather than looking like a bug. It is **not materializable** (§5.0).

### 3.2 Warning totality and its known gap

No single runtime module enumerates the parse-warning universe:

- `INTERNAL_CODE_ENUMS` (`lib/messages/__generated__/internal-code-enums.ts`) is generated, runtime-importable from `lib/`, and yields `N_WARN_ENUM` codes with `source: "parse_warnings.code"`. Its generator (`scripts/extract-internal-code-enums.ts:71-72`) only scans files matching `/\bParseWarning\b|\bwarnings\b|hardErrors/`, so emitters elsewhere are missed.
- `WARNING_CARD_COPY_CODES` (`tests/messages/warningCardCopyRegistry.ts:4`) has 40 codes but lives under `tests/` — `lib/` must not import it — and is not a superset either.
- `MESSAGE_CATALOG` contains all of them but carries no severity or source field to partition on (e.g. the all-null `TYPO_NORMALIZED` row at `lib/messages/catalog.ts:1709-1718`).

Measured difference:

| In copy registry, absent from generated enum (`N_WARN_GAP` = 4)          | In generated enum, absent from copy registry (3)                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `AGENDA_SCHEDULE_LOW_CONFIDENCE` (`lib/agenda/extractAgendaSchedule.ts`) | `BLOCK_DISAPPEARED` (`lib/parser/warnings.ts`)                      |
| `AGENDA_SCHEDULE_TIME_ADJUSTED` (`lib/sync/enrichAgenda.ts`)             | `DAY_RESTRICTION_DOUBLE_LOCATION` (`lib/parser/personalization.ts`) |
| `PULL_SHEET_ON_ARCHIVED_TAB` (`lib/sync/pullSheetOverride.ts`)           | `TYPO_NORMALIZED` (`lib/parser/blocks/venue.ts`)                    |
| `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (`lib/sync/pullSheetOverride.ts`)  |                                                                     |

**Decision:** the warning universe is `INTERNAL_CODE_ENUMS` filtered to `parse_warnings.code`, **plus** `EXTRA_WARNING_CODES` holding the `N_WARN_GAP` codes above with `file:line` justification each. The union is de-duplicated, so a later generator fix that absorbs one of the four silently reduces `EXTRA_WARNING_CODES` to a no-op rather than double-rendering it (R1 #18).

**Backlog:** widen the generator's scan heuristic so `EXTRA_WARNING_CODES` can be deleted. `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`.

#### 3.2a Warning construction contract

Enumerating codes does not produce renderable warnings (R1 #18). Every generated `ParseWarning` is built by one function with this contract:

| Field                                                      | Value                                                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`                                                     | the enumerated code                                                                                                                                             |
| `severity`                                                 | `"warn"` — the card surface is the warn-severity surface; `info` rows render elsewhere and are out of scope                                                     |
| `message`                                                  | fixed synthetic prose naming the code, so a card whose copy comes from `message` is visibly distinguishable from one whose copy comes from the catalog          |
| `blockRef`, `rawSnippet`, `roleToken`, resolution payloads | **absent by default.** Optional fields are set only by the per-code override table below, keeping `exactOptionalPropertyTypes` satisfied and absence meaningful |

Per-code overrides are required where absence changes the rendered card: `UNKNOWN_ROLE_TOKEN` always carries `roleToken` (`lib/parser/types.ts` documents absence as discriminating), and the three recoverable structural-transform codes (`ROOM_HEADER_SPLIT_AMBIGUOUS`, `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `DATE_ORDER_SUGGESTS_DMY`) always carry their use-raw resolution payload. T2 additionally carries one deliberately malformed warning (unknown code, empty message) to exercise the fallback path.

### 3.3 Fidelity contract between the two consumers

The instrument's value rests on one property: **what the gallery shows for a scenario is what materialize produces for it.** A field the gallery honors but materialize cannot reproduce is worse than no tool, because it teaches a state that does not exist.

The database stores less than the modal renders. `fetchPerShowAlerts` selects only `id, code, context, raised_at, occurrence_count` (`lib/adminAlerts/fetchPerShowAlerts.ts:100`) and **derives** `identityText`, `messageParams`, `crewName` (`lib/adminAlerts/fetchPerShowAlerts.ts:169-172`) from `context` plus a resolved `AlertIdentity`. `FeedEntry` (`lib/sync/holds/types.ts:60-77`) is likewise derived by `readShowChangeFeed` from `sync_holds` rows; its `summary` is generated from the disposition, not authored.

| Field                                              | Stored?                      | Gallery                                  | Materialize                                  | Divergence                 |
| -------------------------------------------------- | ---------------------------- | ---------------------------------------- | -------------------------------------------- | -------------------------- |
| `code`, `context`, `raised_at`, `occurrence_count` | yes                          | verbatim                                 | inserted verbatim                            | none                       |
| `identityText`, `messageParams`, `crewName`        | derived                      | shared function, given `galleryIdentity` | shared function, given the resolved identity | none by construction       |
| `AlertIdentity`                                    | resolved from real crew rows | **declared**                             | **resolved**                                 | inherent, labelled (below) |
| hold `summary`, `action`, `status`                 | derived                      | shared shaping                           | shared shaping                               | none by construction       |
| `ParseWarning[]`                                   | yes, jsonb                   | verbatim                                 | written verbatim                             | none                       |

**Required refactor — unconditional, not discovered at implementation time** (R1 #10):

1. Extract the identity-derivation tail of `fetchPerShowAlerts` (`lib/adminAlerts/fetchPerShowAlerts.ts:169-172`) into an exported pure function `deriveAlertRowFields(row, identity) -> { identityText, messageParams, crewName }`, moving the module-local `crewNameFor` (`lib/adminAlerts/fetchPerShowAlerts.ts:58`) with it. `fetchPerShowAlerts` then calls it; so does the gallery. Verified precondition: `describeAlert`, `deriveAlertMessageParams`, and `projectIdentityContext` are already separate exported modules, so only `crewNameFor` moves.
2. Extract the hold→`FeedEntry` shaping step of `readShowChangeFeed` (`lib/sync/feed/readShowChangeFeed.ts:286-318`) into an exported pure function `shapeHoldEntry(holdRow) -> FeedEntry`. `readShowChangeFeed` calls it; so does the gallery.

Both are behavior-preserving extractions on production read paths (see §13 — this design **does** touch production code, contrary to the previous revision's claim).

**The one inherent divergence:** identity _resolution_ needs real crew rows, which synthetic alerts lack. The gallery takes a declared `galleryIdentity` where materialize resolves the real thing. Stated, not hidden: the routing readout labels it `identity: declared (gallery)`.

### 3.4 `warnings` is tri-state

R1 #3: a required `warnings: []` on an alert-only scenario silently erased authentic warnings, because §5.1 overwrote the column unconditionally. The field is now optional and carries three distinct meanings:

| Value                | Gallery                          | Materialize                                                                |
| -------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `undefined` (absent) | renders no warning cards         | **does not touch** `shows_internal.parse_warnings`                         |
| `[]`                 | renders the empty-warnings state | overwrites the column with `[]` — deliberate "this show has zero warnings" |
| non-empty            | renders the cards                | overwrites the column with the array                                       |

Every T1 alert scenario and every alert-only or hold-only T3 composite omits the field. Only a scenario that deliberately controls warnings sets it.

## 4. Gallery

**Route:** `app/admin/dev/attention-gallery/page.tsx (new)` — Server Component, `export const dynamic = "force-dynamic"`, `requireDeveloper()` at the top, matching `app/admin/dev/source-link-dim/page.tsx` and `app/admin/dev/telemetry-dim/page.tsx`.

### 4.0 The client boundary

R1 #6 is correct: `AttentionMenu` requires `pillRef: RefObject<HTMLButtonElement | null>`, `onClose: () => void`, and `onNavigate: (item) => void` (`components/admin/showpage/AttentionMenu.tsx:30-34`). None can be created in or passed from a Server Component.

Resolution: the page (server) computes derived items and renders **one client component per scenario**, `ScenarioBlock` (`components/admin/dev/ScenarioBlock.tsx (new)`, `"use client"`). It receives only serializable props — the derived `AttentionItem[]`, the routing readout rows, warnings — and owns:

- the pill `<button>` and its ref (the ref target R1 #6 said was unidentified),
- `open` as real `useState`, defaulting to **true** so the menu is visible without a click, with a working `onClose` and a re-open control. This makes §4.4's "menu open/close is genuinely live" true rather than contradicted by a no-op,
- `onNavigate` as a no-op that records the item id into visible on-page text, so navigation intent is observable without a router.

`AttentionMenu` renders in normal flow inside the block (no portal), so simultaneously-open menus stack vertically rather than overlapping (R1 #6, #28). If a menu turns out to be portal- or fixed-positioned in production, the block renders it inside a `relative` containing block and the plan's layout task measures overlap — the one place where a real-browser check is warranted (§8).

`degraded: true` renders the same degraded pill and Overview notice the loader produces (`app/admin/_showReviewModal.tsx:304-310`); the block takes a `degraded` prop and reproduces that branch from the same components the modal uses, not a lookalike (R1 #17).

### 4.1 What a scenario block renders

Actual DOM, in order:

1. **Heading** — `<h2 id="<scenario id>">` with the label.
2. **Routing readout** — a `<dl>` per derived item: `code`, `kind`, `tone`, `sectionId`, `anchor` (or `—`), `actionable`, `autoClearNote` (or `—`), `template` resolved-vs-fallback, `identity: declared (gallery)`, and the `usePathname()` value passed to the card (§4.4). Wrong routing is legible as text, not merely a card in the wrong place.
3. **Pill + `AttentionMenu`** — per §4.0.
4. **Bucketed banners** — `bucketAttention(items, opts)` with `renderCard` = `AttentionBanner`, one labelled group per section.
5. **Hold rows** — rendered separately and labelled, because `bucketAttention` deliberately excludes `kind: "hold"` (`lib/admin/sectionAttention.ts:93-97`); holds belong to the Changes feed via `Mi11GateActions`. Omitting them would misread as a drop.
6. **`PerShowActionableWarnings`** — only when the scenario declares `warnings` (§3.4), rendered twice: `tone="warning"` and `tone="muted"` (the collapsed "Ignored (N)" skin, which has its own contrast posture). The double render is driven by the presence of the field, which is the declaration R1 #17 found missing.

### 4.2 T2 structural axes

`BucketOpts` (`lib/admin/sectionAttention.ts:30-39`) exposes the fallback predicates as injectable functions, so T2 drives them with no fake show. Each row states the exact predicate and the expected outcome (R1 #17):

| Axis                           | Exact mechanism                                                                                           | Expected outcome                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routed section absent          | `sectionAvailable: (s) => s === "overview"` — Overview stays available, so the fallback has a destination | banner falls back to Overview                                                                                                                                         |
| Overview also absent           | `sectionAvailable: () => false`                                                                           | the no-destination case; the block asserts what actually renders and the readout names it                                                                             |
| Anchor slot absent             | `anchorAvailable: () => false`, `sectionAvailable: () => true`                                            | anchored card falls back to its section top                                                                                                                           |
| Crew key unrendered            | `crewKeyRendered: () => false`                                                                            | crew banner goes to the crew section top                                                                                                                              |
| Alert vs hold                  | scenario carries only `alerts` / only `holds`                                                             | hold appears in the hold group, never a banner                                                                                                                        |
| Auto-clearing, inbox-routed    | one code with `isInboxRouted` true                                                                        | resolve control absent; `autoClearNote` = the inbox line (`lib/admin/attentionItems.ts:86`)                                                                           |
| Auto-clearing, auto-resolving  | one code with `isAutoResolving` true                                                                      | resolve control absent; `autoClearNote` = `autoResolveNote(code)`                                                                                                     |
| Actionable                     | one code that is neither                                                                                  | resolve control present                                                                                                                                               |
| Occurrence 1 vs N              | `occurrence_count: 1` / `7`                                                                               | repeat-count affordance                                                                                                                                               |
| Identity present/absent        | `galleryIdentity` set / null                                                                              | `menuSubtitle` present / absent                                                                                                                                       |
| Uncataloged code               | a code absent from both `MESSAGE_CATALOG` and `ATTENTION_ROUTES`                                          | `ATTENTION_FALLBACK_TITLE` (`lib/admin/attentionItems.ts:84`); routes to Overview via the `?? { sectionId: "overview" }` fallback (`lib/admin/attentionItems.ts:254`) |
| Unresolved placeholder         | context leaving a `<token>` uninterpolated                                                                | `template` null, card falls back                                                                                                                                      |
| Alert count 0 / 1 / `MENU_CAP` | the **alert** list length; holds and warnings are separately axed                                         | empty state, single, and a menu long enough to cross its scroll threshold                                                                                             |
| Degraded alert read            | `degraded: true`                                                                                          | §4.0                                                                                                                                                                  |

`MENU_CAP` is a named constant (§2), not a bare literal. Whether it actually crosses the production scroll threshold at every `w` is asserted by the layout task (§8), not assumed (R1 #28).

### 4.3 Tier boundaries

- **T1** — one scenario per alert code (`N_ALERT_CODES`, of which `N_ALERT_RENDERABLE` render) and one per warning code (`N_WARN_CODES`).
- **T2** — the §4.2 matrix.
- **T3** — composites, **rendered by materialize only**. The gallery lists them by id and label with a pointer to the dev panel.

### 4.4 Interactivity boundary

Live for real: menu open/close (§4.0), `?` help popovers, expand/collapse, hover, focus. **Not** live: server actions, whose alert ids are the synthetic `gallery:<id>:<n>` of §3.0. A standing note at the top of the page says so and points at the dev panel.

**Known fidelity caveat:** `AttentionBanner` reads `usePathname()` (`components/admin/review/AttentionBanner.tsx:101`) for a route-gated Learn-more link. Under the gallery that value is the gallery path, so the gate evaluates differently than in production. The readout prints the value (§4.1 item 2), making the difference explicit rather than silently misleading.

### 4.5 Controls

Query params only.

| Param      | Accepted                 | Effect                                                 | Default       |
| ---------- | ------------------------ | ------------------------------------------------------ | ------------- |
| `tier`     | `1`, `2`, `3`            | restrict to that tier; `3` renders the T3 list of §4.3 | all           |
| `scenario` | a scenario id            | restrict to that one scenario                          | all           |
| `w`        | integer in `[320, 1280]` | sets `max-width` on each block wrapper                 | unconstrained |

**Guards** (R1 #24):

- `scenario` **wins over** `tier` when both are present, including when the named scenario is not in the named tier. Precedence is stated because it is otherwise undefined.
- Repeated params: the **first** value is used (`URLSearchParams.get` semantics), never a concatenation.
- `w`: parsed with `Number.parseInt` on a `^\d+$` match. Anything failing that — empty, whitespace, signed, decimal, exponent, `NaN`, `Infinity` — falls back to unconstrained. In-range integers apply; **out-of-range integers clamp** to the nearest bound. (The previous revision said clamp _and_ fall back, which contradicted itself.)
- `tier` outside `{1,2,3}`, empty, or whitespace → all tiers.
- Unknown `scenario` → an explicit "no such scenario" line listing valid ids, never a blank page.

`w` sets `max-width`, not a fixed width: it narrows the column the way a narrower viewport would, but it is **not** a viewport emulator (media queries still see the real viewport). §8 depends on this being `max-width`; §4.5 and §8 previously disagreed (R1 #21).
