# Attention scenario gallery + materialize — design

**Date:** 2026-07-20
**Branch:** `feat/attention-scenario-gallery`
**Status:** draft, revision 2 (post Codex R1)

---

## 1. Problem

The admin show modal's attention surface — alert pills, section banners, compact alert cards, parse-warning cards — is only observable when live sheet data or an operator action happens to raise the underlying row. Most alert codes and parse-warning codes never fire against the test shows, so their copy, routing, tone, and layout are unverified by eye. The existing unit and meta tests pin *structure* (routing totality, no-drop, copy parity) but nothing renders the surface for a human.

Two distinct gaps:

1. **No sweep.** There is no way to see every state at once and judge copy/layout/routing.
2. **No drive.** There is no way to put a chosen state in front of the real modal, at the real URL, with working buttons.

This design closes both from one catalog.

## 1.1 Resolved scope — do not relitigate

Decided during brainstorming, or ratified in R1 triage. Cite the ratification before re-opening.

| Decision | Ratification |
| --- | --- |
| Gallery renders **T1 + T2 only**; T3 composites are materialize-only. Mounting the whole surface against a synthetic snapshot fixture was considered and rejected as a drift liability. | §4.3, §5.0 |
| **No completeness gate.** Specifically: no screenshot byte-comparison, and no meta-test asserting the catalog *covers* every code. Totality on the alert axis is achieved structurally instead (§3.1). This is **not** a ban on all new tests: §3.6's validator (catalog *validity*) and §6a's `FILES`-membership test (production safety) both run in CI and are in scope. The declined thing is coverage-gating the catalog, not testing the code. | §3.1, §3.6, §6a, §12 |
| **No migration.** | §5.4 |
| **No new advisory-lock holder.** | §7.2 |
| Gallery action controls render but cannot fire: they are neutralized by **capture-phase submit interception** (NOT `inert`, and not by carrying synthetic ids). | §4.4 |
| The gallery route is dev-only and absent from the production artifact. | §6 |
| **Invariant 5 carries a scoped exception for this instrument, ratified here.** The gallery and the materialize card display raw `code` strings, scenario ids, and result codes. Invariant 5 protects *operators* from raw codes in the product UI; these two surfaces are developer instruments behind `requireDeveloper`, renamed out of the production artifact at build time (§6), whose entire subject matter **is** the code catalog. A gallery that hid codes could not perform its function. Scope of the exception is exactly: the routing readout (§4.1), scenario ids, the `PICKER_EPOCH_RESET` non-render row, the unknown-scenario id list, the materialize selector, and the §5.3 result codes. Everywhere else — including all rendered card copy — codes resolve through `lib/messages/lookup.ts` as normal. (Codex R1 #1: correct that R1 asserted an exception §1.1 had not ratified. Ratified now rather than argued.) | this row |
| **Validation targeting stays**, but Clear on validation does **not** re-sync (§5.5). The user chose local + validation; R1 #5 showed the re-sync step cannot be made env-correct cheaply, so that one step is dropped on validation rather than the whole capability. | §5.5 |
| `attention-gallery-full.png` (an earlier ad-hoc screenshot at the repo root) is discarded, not folded in. | user decision, 2026-07-20 |

## 2. Canonical numbers

Every count in this document resolves here. Later sections reference this table; they do not restate values.

| Name | Value | Source (verified 2026-07-20) |
| --- | --- | --- |
| `N_ALERT_CODES` | 45 | `lib/admin/attentionItems.ts:95-143` — `ATTENTION_ROUTES` entries |
| `N_ALERT_RENDERABLE` | 44 | `N_ALERT_CODES` minus `PICKER_EPOCH_RESET`, cut in `deriveAttentionItems` (`lib/admin/attentionItems.ts:315-317`) |
| `N_ROUTES_OVERVIEW` | 34 | `ATTENTION_ROUTES` `sectionId: "overview"` |
| `N_ROUTES_CREW` | 3 | `ATTENTION_ROUTES` `sectionId: "crew"` |
| `N_ROUTES_EVENT` | 3 | `ATTENTION_ROUTES` `sectionId: "event"` (all anchored `opening_reel`) |
| `N_ROUTES_ROOMS` | 3 | `ATTENTION_ROUTES` `sectionId: "rooms"` (all anchored `diagrams`) |
| `N_ROUTES_WARNINGS` | 2 | `ATTENTION_ROUTES` `sectionId: "warnings"` |
| `N_ANCHORED` | 6 | `N_ROUTES_EVENT` + `N_ROUTES_ROOMS` |
| `N_WARN_ENUM` | 39 | `lib/messages/__generated__/internal-code-enums.ts` entries with `source: "parse_warnings.code"` |
| `N_WARN_GAP` | 4 | §3.2 — parse-warning codes the generator's scan heuristic misses |
| `N_WARN_CODES` | 43 | `N_WARN_ENUM` + `N_WARN_GAP` |
| `MENU_CAP` | 12 | §4.2 — item count for the "many" scenario |

`N_ROUTES_OVERVIEW + N_ROUTES_CREW + N_ROUTES_EVENT + N_ROUTES_ROOMS + N_ROUTES_WARNINGS = N_ALERT_CODES` (34+3+3+3+2 = 45).

Cross-check: `ADMIN_ALERTS_CODES` (`tests/messages/adminAlertsRegistry.ts:9`) also has 45 entries and is pinned set-equal to `ATTENTION_ROUTES` by `tests/admin/_metaAttentionRoutes.test.ts`.

## 3. Catalog

**Module (new):** `lib/dev/attentionScenarios/ (new directory)` — split by responsibility at plan time into `types`, `validate`, `tier1`, `tier2`, `tier3`, and an `index` that assembles them. The spec treats it as one catalog; the decomposition is the plan's.

A scenario declares **storable inputs** — shapes that exist in the database — never pre-built `AttentionItem`s and never derived read-model shapes (§3.3).

```ts
export type AttentionScenario = {
  id: string;                      // ^[a-z0-9][a-z0-9-]{2,47}$ - DOM anchor and DB tag
  tier: 1 | 2 | 3;
  label: string;                   // non-empty
  alerts: ScenarioAlertRow[];
  holds: ScenarioHoldRow[];
  warnings?: ParseWarning[];       // TRI-STATE, see 3.4
  bucket?: Partial<BucketOpts>;    // T2 only
  degraded?: boolean;              // T2 only
};
```

### 3.0 Alert and hold row shapes

The catalog is authored in the DB's own column names, so the mapping to an insert is identity plus three injected fields. This removes the camel/snake conversion boundary R1 #8 found undefined.

```ts
export type ScenarioAlertRow = {
  code: string;
  context: Record<string, unknown>; // NOT NULL in DDL - {} never null
  raised_at: string;                // ISO 8601
  occurrence_count: number;         // integer >= 1
  galleryIdentity?: AlertIdentity | null; // GALLERY-ONLY, never inserted (3.3)
};

export type ScenarioHoldRow = {
  drive_file_id: string;
  domain: "crew_email" | "crew_identity";
  entity_key: string;
  held_value: Record<string, unknown>;         // NOT NULL
  proposed_value: Disposition;                  // NOT NULL for mi11_pending
  base_modified_time: string;                   // NOT NULL for mi11_pending
  kind: "mi11_pending";                         // see 3.0a
  reservation_collisions?: Array<{ name: string; email: string | null }>;
};
```

**The insert mapping is authored-columns plus three transforms, not identity:** inject `id` (DB default `gen_random_uuid()`) and `show_id` (the target show), add the `__devScenario` key to `context` (§5.1b), and **strip `galleryIdentity`**, which is gallery-only and has no column. **`id` is likewise injected in the gallery** — a deterministic synthetic `gallery:<scenario id>:<index>` — which is what §4.4's "synthetic ids" refers to. (R1 #8.)

#### 3.0a Every scenario hold must satisfy the `sync_holds` CHECK constraints

`supabase/migrations/20260608000000_sync_holds.sql:29-37` constrains `mi11_pending` rows: `proposed_value` NOT NULL, `base_modified_time` NOT NULL, and `proposed_value->>'disposition' in ('email_change','rename','removal')`. `domain` is constrained to `crew_email | crew_identity` (line 21-23).

`kind` is fixed to `"mi11_pending"` in the type because it is the only kind that becomes an attention item: `toHoldItem` (`lib/admin/attentionItems.ts:284-286`) returns null unless `status === "pending"` and `action === "approve_reject"`, which only an open `mi11_pending` hold produces. An `undo_override` row is expressible in the DB but is dead weight here, so the type forbids it.

**`unique (show_id, domain, entity_key)`** (line 39-41) is the hold analogue of the alert unique index. It is handled identically to §5.1a: a scenario may not carry two holds sharing `(domain, entity_key)`, and a collision with a pre-existing real hold causes a skip-and-report, never an overwrite. (R1 #11 correctly noted this constraint analysis was missing.)

### 3.1 Alert totality is structural, not listed

T1 alert scenarios are **derived at runtime** from `Object.keys(ATTENTION_ROUTES)`, not hand-listed. A new alert code appears in the gallery the moment its `ATTENTION_ROUTES` row lands — no catalog edit, no drift, no completeness meta-test.

Realistic content comes from an override map keyed by code. **Overrides set storable fields only** — in practice `context`, since that is what the derivation reads:

```ts
// `code` is NOT overridable: the key IS the code. Allowing an override to emit a
// different code would let a row keyed by one route emit another, breaking the
// structural totality of 3.1 (R2a).
const ALERT_ROW_OVERRIDES: Partial<Record<string, Partial<Omit<ScenarioAlertRow, "code">>>> = {
  ...
};
```

`galleryIdentity` **is** overridable and appears in this type deliberately, even though it is not storable. It is the one gallery-only field (§3.0), and the identity-dependent codes below require it. The "storable fields only" rule governs what materialize *inserts*, not what the catalog may declare.

Default row: `context: {}`, `occurrence_count: 1`, `galleryIdentity: null`, fixed `raised_at`. `context` is `{}` and never `null` because `admin_alerts.context` is `jsonb not null`; a null default would be gallery-legal but un-insertable, diverging exactly where §3.3 forbids.

Codes whose rendered content depends on context need an override. **Each row below names the storable context key, not the derived field** (R1 #9 — the previous revision listed `crewName`/`messageParams`/`identityText`, which are derived and unauthorable):

| Code | Storable input required | Derived consequence |
| --- | --- | --- |
| `TILE_PROJECTION_FETCH_FAILED` | `context.failedKeys: string[]` | `readFailedKeys` (`lib/admin/attentionItems.ts:233-236`) returns null for any other code or a non-array |
| `SHOW_FIRST_PUBLISHED` | `context.data_gaps = { total: <number greater than 0>, classes: Record<GapCode, number> }`, keys from `GAP_CLASSES` (`lib/parser/dataGaps.ts:30`) | `readDataGapsDigest` (`lib/admin/attentionItems.ts:191-207`) returns null unless `data_gaps` is an object, `total` is a number greater than zero, and `classes` is an object; missing per-class counts coerce to 0 |
| `PARSE_ERROR_LAST_GOOD` | `context.error_code` ∈ `PARSE_FAILURE_ALLOWLIST` | `readErrorCode` (`lib/admin/attentionItems.ts:242-246`) drops anything else |
| `ROLE_FLAGS_NOTICE` | `context.role_change_crew_names: [string]` (exactly one element, non-blank after trim) **and** `context.role_change_count: 1` | `crewNameFor` (`lib/adminAlerts/fetchPerShowAlerts.ts:63-68`) returns the single name from the **projected context alone**. No identity is consulted, so this code is fully reproducible in both consumers |
| `AMBIGUOUS_EMAIL_BINDING`, `OAUTH_IDENTITY_CLAIMED` | `context.crew_member_id` matching `UUID_RE` (`lib/adminAlerts/projectIdentityContext.ts:16`) so the resolver has a target, **plus** `galleryIdentity` carrying exactly one `segments` entry labelled `"Crew"` | `crewNameFor` (`lib/adminAlerts/fetchPerShowAlerts.ts:69-72`) reads the **resolved identity's** single `"Crew"` segment; `crewKey` binds only when it yields a name (`lib/admin/attentionItems.ts:255-256`). These two are the identity-dependent codes of §3.3 |

Any code whose catalog `dougFacing` template carries `<placeholder>` tokens needs context that fully interpolates, or `safeDougFacingTemplate` returns null and the card falls back — itself a state worth seeing, so T2 keeps one deliberate non-interpolating scenario.

**`PICKER_EPOCH_RESET`** has an `ATTENTION_ROUTES` row for registry totality but is filtered out in derive. The gallery renders it as an explicit "cut in derive, renders nothing" row so the absence is legible rather than looking like a bug. It is **not materializable** (§5.0).

### 3.2 Warning totality and its known gap

No single runtime module enumerates the parse-warning universe:

- `INTERNAL_CODE_ENUMS` (`lib/messages/__generated__/internal-code-enums.ts`) is generated, runtime-importable from `lib/`, and yields `N_WARN_ENUM` codes with `source: "parse_warnings.code"`. Its generator (`scripts/extract-internal-code-enums.ts:71-72`) only scans files matching `/\bParseWarning\b|\bwarnings\b|hardErrors/`, so emitters elsewhere are missed.
- `WARNING_CARD_COPY_CODES` (`tests/messages/warningCardCopyRegistry.ts:4`) has 40 codes but lives under `tests/` — `lib/` must not import it — and is not a superset either.
- `MESSAGE_CATALOG` contains all of them but carries no severity or source field to partition on (e.g. the all-null `TYPO_NORMALIZED` row at `lib/messages/catalog.ts:1709-1718`).

Measured difference:

| In copy registry, absent from generated enum (`N_WARN_GAP` = 4) | In generated enum, absent from copy registry (3) |
| --- | --- |
| `AGENDA_SCHEDULE_LOW_CONFIDENCE` (`lib/agenda/extractAgendaSchedule.ts`) | `BLOCK_DISAPPEARED` (`lib/parser/warnings.ts`) |
| `AGENDA_SCHEDULE_TIME_ADJUSTED` (`lib/sync/enrichAgenda.ts`) | `DAY_RESTRICTION_DOUBLE_LOCATION` (`lib/parser/personalization.ts`) |
| `PULL_SHEET_ON_ARCHIVED_TAB` (`lib/sync/pullSheetOverride.ts`) | `TYPO_NORMALIZED` (`lib/parser/blocks/venue.ts`) |
| `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (`lib/sync/pullSheetOverride.ts`) | |

**Decision:** the warning universe is `INTERNAL_CODE_ENUMS` filtered to `parse_warnings.code`, **plus** `EXTRA_WARNING_CODES` holding the `N_WARN_GAP` codes above with `file:line` justification each. The union is de-duplicated, so a later generator fix that absorbs one of the four silently reduces `EXTRA_WARNING_CODES` to a no-op rather than double-rendering it (R1 #18).

**Backlog:** widen the generator's scan heuristic so `EXTRA_WARNING_CODES` can be deleted. `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`.

#### 3.2a Warning construction contract

Enumerating codes does not produce renderable warnings (R1 #18). Every generated `ParseWarning` is built by one function with this contract:

| Field | Value |
| --- | --- |
| `code` | the enumerated code |
| `severity` | `"warn"` — the card surface is the warn-severity surface; `info` rows render elsewhere and are out of scope |
| `message` | fixed synthetic prose that does **not** contain the raw code — e.g. `"Synthetic warning for gallery review."`. The raw code must not appear here: `message` is rendered card copy, which §1.1's exception explicitly excludes, and warnings are materialized **verbatim**, so a code embedded here would leak into the real modal too (R2a). Distinguishing synthetic from authentic is the readout's job (§4.1), not the card's |
| `blockRef`, `rawSnippet`, `roleToken`, resolution payloads | **absent by default.** Optional fields are set only by the per-code override table below, keeping `exactOptionalPropertyTypes` satisfied and absence meaningful |

Per-code overrides, where absence changes the rendered card (R2a: the previous revision promised this table and omitted it):

| Code | Required field | Shape |
| --- | --- | --- |
| `UNKNOWN_ROLE_TOKEN` | `roleToken` | the canonical role token that failed lookup; absence discriminates on every other code (`lib/parser/types.ts`) |
| `ROOM_HEADER_SPLIT_AMBIGUOUS` | use-raw resolution payload | `{ resolvable: true, replacement: { kind: "rooms", name, dimensions: null, floor: null } }` (`lib/parser/types.ts:41`) |
| `HOTEL_GUEST_SPLIT_AMBIGUOUS` | use-raw resolution payload | `{ resolvable: true, replacement: { kind: "hotels", names: [string], confirmationNo: null } }` (`lib/parser/types.ts:42`) |
| `DATE_ORDER_SUGGESTS_DMY` | use-raw resolution payload | `{ resolvable: true, replacement: { kind: "dates", dmyDates } }` (`lib/parser/types.ts:43`) |

T2 additionally carries one deliberately unresolvable warning (`{ resolvable: false, reason: "empty-raw" }`, `lib/parser/types.ts:46`) and one with an uncataloged code, to exercise both fallback paths.

### 3.2b Scenario id generation

T1 scenarios are generated from codes, so their ids must be derived, not authored (R2a). The algorithm:

```
id = <namespace> + "-" + lowercase(code).replaceAll("_", "-")
namespace = "alert" | "warn"
```

`ALERT_ROW_OVERRIDES` keys are `ATTENTION_ROUTES` keys, and warning codes come from §3.2, so both source sets are already `^[A-Z][A-Z0-9_]*$`. The transform is therefore total, injective within a namespace, and the namespace prefix prevents an alert and a warning of the same code colliding. T2 and T3 ids are authored literals.

Every id — generated or authored — must match `^[a-z0-9][a-z0-9-]{2,47}$` (§3). The longest current code yields an id well inside 48 characters, but the validator (§3.6) enforces the bound rather than assuming it, and rejects duplicates across the whole catalog. The same string is the DOM anchor (§4.1), the `scenario` query value (§4.5), the synthetic row id prefix (§3.0), and the DB tag (§5.1b), so one rule governs all four.

### 3.3 Fidelity contract between the two consumers

The instrument's value rests on one property: **what the gallery shows for a scenario is what materialize produces for it.** A field the gallery honors but materialize cannot reproduce is worse than no tool, because it teaches a state that does not exist.

The database stores less than the modal renders. `fetchPerShowAlerts` selects only `id, code, context, raised_at, occurrence_count` (`lib/adminAlerts/fetchPerShowAlerts.ts:100`) and **derives** `identityText`, `messageParams`, `crewName` (now extracted to `lib/adminAlerts/deriveAlertRowFields.ts`, Task 1) from `context` plus a resolved `AlertIdentity`. `FeedEntry` (`lib/sync/holds/types.ts:60-77`) is likewise derived by `readShowChangeFeed` from `sync_holds` rows; its `summary` is generated from the disposition, not authored.

| Field | Stored? | Gallery | Materialize | Divergence |
| --- | --- | --- | --- | --- |
| `code`, `raised_at`, `occurrence_count` | yes | verbatim | inserted verbatim | none |
| `context` | yes | the authored object, verbatim | the authored object **plus the injected `__devScenario` key** (§5.1b) | **not literally identical** (R5c). The added key is not read by any derivation — `projectIdentityContext` allowlists specific keys and ignores unknown ones — so nothing rendered differs. But the mapping is authored-context-plus-tag, not identity, and `galleryIdentity` is stripped before insert. Stated because "verbatim" was literally false |
| `identityText`, `messageParams`, `crewName` — **context-only codes** (incl. `ROLE_FLAGS_NOTICE`) | derived | shared function | shared function | none by construction |
| `identityText`, `messageParams`, `crewName` — **identity-dependent codes** (`AMBIGUOUS_EMAIL_BINDING`, `OAUTH_IDENTITY_CLAIMED`) | derived | shared function, given the **declared** `galleryIdentity` | shared function, given the **resolved** identity | **inherits the identity row's divergence** — if the target show has no matching crew row, materialize yields no `"Crew"` segment, so `crewName` is null, `crewKey` does not bind, and the card routes to the crew section top rather than a crew row. The gallery shows the bound state. (R2a: the previous revision claimed "none by construction" for all three fields, which was false for these two codes.) |
| `AlertIdentity` | resolved from real crew rows | **declared** | **resolved** | inherent, labelled (below) |
| hold `summary`, `action`, `status` | derived | shared shaping | shared shaping | none by construction |
| `ParseWarning[]` | yes, jsonb | verbatim | written verbatim | none |

**Required refactor — unconditional, not discovered at implementation time** (R1 #10):

1. Extract the identity-derivation tail of `fetchPerShowAlerts` (**done in Task 1**: `lib/adminAlerts/deriveAlertRowFields.ts`) into an exported pure function `deriveAlertRowFields(row, identity) -> { identityText, messageParams, crewName }`, moving the module-local `crewNameFor` with it. `fetchPerShowAlerts` then calls it; so does the gallery. Verified precondition: `describeAlert`, `deriveAlertMessageParams`, and `projectIdentityContext` are already separate exported modules, so only `crewNameFor` moves.
2. Extract the hold-to-`FeedEntry` shaping step of `readShowChangeFeed` (**done in Task 2**: `lib/sync/feed/shapeHoldEntry.ts`) into an exported pure function `shapeHoldEntry(holdRow) -> FeedEntry`. `readShowChangeFeed` calls it; so does the gallery.

Both are behavior-preserving extractions on production read paths (see §13 — this design **does** touch production code, contrary to the previous revision's claim).

**The one inherent divergence:** identity *resolution* needs real crew rows, which synthetic alerts lack. The gallery takes a declared `galleryIdentity` where materialize resolves the real thing. Stated, not hidden: the routing readout labels it `identity: declared (gallery)`.

### 3.4 `warnings` is tri-state

R1 #3: a required `warnings: []` on an alert-only scenario silently erased authentic warnings, because §5.1 overwrote the column unconditionally. The field is now optional and carries three distinct meanings:

| Value | Gallery | Materialize |
| --- | --- | --- |
| `undefined` (absent) | renders no warning cards | **does not touch** `shows_internal.parse_warnings` |
| `[]` | renders the empty-warnings state | overwrites the column with `[]` — deliberate "this show has zero warnings" |
| non-empty | renders the cards | overwrites the column with the array |

Every T1 alert scenario and every alert-only or hold-only T3 composite omits the field. Only a scenario that deliberately controls warnings sets it.

### 3.6 Catalog validation is executable, not prose

Both R1 (#25) and R2a (#12) reported the same class: catalog and input guards enumerated incompletely. A third prose enumeration would fail the same way, so the guard contract is **code**: `validateScenario(s): ValidationError[]`, run over the whole catalog by a test (§12) and at module load in development.

| Field | Rule | On violation |
| --- | --- | --- |
| `id` | matches `^[a-z0-9][a-z0-9-]{2,47}$`; unique across the catalog | reject |
| `label` | non-empty after trim | reject |
| `tier` | `1 \| 2 \| 3` | reject |
| `bucket`, `degraded` | present only when `tier === 2` | reject |
| `alerts`, `holds` | arrays, possibly empty; a scenario with no alerts, no holds, and no `warnings` is rejected for materialize (§5.3) but **legal** in the gallery as the empty-state scenario | reject only the non-array case |
| `alerts[].code` | non-empty; matches `^[A-Z][A-Z0-9_]*$`; no duplicate code within a scenario (§5.1a) | reject |
| `alerts[].context` | a plain object, never null or an array; must not contain the reserved `__devScenario` key (§5.1b) | reject |
| `alerts[].raised_at` | parses to a finite `Date` | reject |
| `alerts[].occurrence_count` | integer, finite, `>= 1` — excludes 0, negative, fractional, `NaN`, `Infinity` | reject |
| `alerts[].galleryIdentity` | absent, `null`, or an object whose `segments` is an array of `{ label: string, value: string }` with non-blank `label` (`lib/adminAlerts/identityTypes.ts:49` and `lib/adminAlerts/identityTypes.ts:60`) | reject |
| `alerts[].context` — **per-code requirements of §3.1** | `TILE_PROJECTION_FETCH_FAILED` has `context.failedKeys` as a string array; `SHOW_FIRST_PUBLISHED` has `context.data_gaps.total > 0` and an object `classes`; `PARSE_ERROR_LAST_GOOD` has `context.error_code` in `PARSE_FAILURE_ALLOWLIST`; `ROLE_FLAGS_NOTICE` has `role_change_count === 1` and exactly one non-blank `role_change_crew_names` entry; `AMBIGUOUS_EMAIL_BINDING` and `OAUTH_IDENTITY_CLAIMED` have a `UUID_RE`-shaped `context.crew_member_id` **and** a `galleryIdentity` carrying exactly one `"Crew"` segment | reject. Without this, a code listed in §3.1 as requiring context could ship with `{}` and silently render its degenerate form while the spec promises the bound state (R5c) |
| `holds[]` | `domain` and `kind` in their CHECK sets; `entity_key` and `drive_file_id` non-empty after trim; `base_modified_time` parses; **`held_value` is a plain object** (NOT NULL in the DDL); **`proposed_value` matches a full `Disposition` variant** — `email_change` and `rename` require a non-blank `name` and a `string \| null` `email`, `removal` takes no other field (`lib/sync/holds/types.ts:7-10`); **`reservation_collisions`, when present, is an array of `{ name: string, email: string \| null }`**; no duplicate `(domain, entity_key)` within a scenario (§3.0a) | reject |
| `warnings[]` | every element has a non-empty `code`, `severity === "warn"`, and a **non-empty `message` that does NOT contain its own `code`** — enforced, not merely requested in §3.2a, because warnings materialize **verbatim** into the real modal, so a code embedded in a message escapes §1.1's exception scope and reaches an operator surface (R5c). Where §3.2a requires a per-code payload — `roleToken`, or a use-raw resolution object — the payload is present and shaped | reject |
| `bucket` | when present, every key is one of `sectionAvailable`, `anchorAvailable`, `crewKeyRendered`, and every value is a function | reject |
| `degraded` | when present, a boolean | reject |

"Reject" means the catalog is invalid and the test fails — a malformed scenario never reaches either consumer. The gallery therefore renders only valid scenarios, which is why §4 specifies rendering behavior rather than per-field malformed-input behavior: the malformed cases are unreachable by construction.

**`ScenarioBlock`'s props are a separate boundary** and are not covered by this validator, because they are produced by the page from already-valid scenarios rather than authored. Its contract is the prop list in §4.0; each optional prop states its absent behavior there.

## 4. Gallery

**Route:** `app/admin/dev/attention-gallery/page.tsx (new)` — Server Component, `export const dynamic = "force-dynamic"`, `requireDeveloper()` at the top, matching `app/admin/dev/source-link-dim/page.tsx` and `app/admin/dev/telemetry-dim/page.tsx`.

### 4.0 The client boundary

R1 #6 is correct: `AttentionMenu` requires `pillRef: RefObject<HTMLButtonElement | null>`, `onClose: () => void`, and `onNavigate: (item) => void` (`components/admin/showpage/AttentionMenu.tsx:30-34`). None can be created in or passed from a Server Component.

**Bucketing runs on the server** (R2a): `BucketOpts` holds predicate *functions*, which cannot cross the RSC boundary. The page calls `bucketAttention(items, opts)` itself — it has the scenario's `bucket` predicates in scope — and passes the result down. `ScenarioBlock` never receives `BucketOpts` and never calls `bucketAttention`.

**What bucketing actually returns** (verified at plan time): `SectionAttention` is `Map<RoutedSectionId, SectionAttentionBucket>`, and a bucket holds **pre-rendered `ReactNode[]`** — `sectionTop`, optional `byCrewKey` and `byAnchor` maps, and a `notes: NoteItem[]` of domain objects (`lib/admin/sectionAttention.ts:17-28`). It does **not** return `AttentionItem[]` per section. The cards are rendered by the `renderCard` callback during bucketing, on the server.

This is fine across the RSC boundary — a Server Component passing rendered JSX into a Client Component is the ordinary pattern, and `AttentionBanner` is itself a client component, so what crosses is a client-component reference plus serializable props. It does change the prop shape below: `ScenarioBlock` receives **rendered nodes**, not items to render.

Resolution: the page (server) computes derived items, buckets them, and renders **one client component per scenario**, `ScenarioBlock` (`components/admin/dev/ScenarioBlock.tsx (new)`, `"use client"`). Its complete prop surface:

```ts
type ScenarioBlockProps = {
  scenarioId: string;              // DOM anchor
  label: string;
  items: AttentionItem[];          // derived, serializable
  // Server-bucketed, flattened for rendering. `nodes` are already-rendered cards
  // (lib/admin/sectionAttention.ts:17-19), NOT items awaiting render.
  groups: Array<{
    sectionId: RoutedSectionId;
    placement: "sectionTop" | "crewRow" | "anchor";
    anchorOrCrewKey: string | null; // set for crewRow and anchor placements
    nodes: ReactNode[];
  }>;
  holdItems: AttentionItem[];      // kind: "hold", excluded from groups by bucketAttention
  readout: ReadoutRow[];           // plain strings, section 4.1 step 2
  warnings: ParseWarning[] | null; // null = scenario does not declare warnings (3.4)
  degraded: boolean;
  maxWidthPx: number | null;       // null = unconstrained
};
```

Every field is serializable or is rendered JSX. `AttentionItem` is a plain discriminated union of scalars, arrays, and objects (`lib/admin/attentionItems.ts:79-81`) with no functions; `groups[].nodes` are server-rendered elements, which cross the boundary by the standard RSC mechanism. The page **flattens** the `SectionAttention` map into the `groups` array above, so `ScenarioBlock` never touches a `Map` (maps do serialize, but a flat array keeps the client component's contract obvious and its render a single pass). Absent behavior: `warnings: null` renders no warning cards and no muted duplicate; `maxWidthPx: null` applies no wrapper constraint; empty `items`, `groups`, and `holdItems` render their respective empty states.

**Malformed props are unreachable, and that is the contract** (R5d). These props are not authored — the page derives every one of them from a scenario that already passed `validateScenario` (§3.6), through `deriveAttentionItems` and `bucketAttention`, both of which are typed. So an empty `scenarioId`, a blank `label`, a malformed `readout` row, a non-boolean `degraded`, or an out-of-range `maxWidthPx` cannot occur: the first two are rejected by the validator, the middle ones are constructed by typed code, and `maxWidthPx` is normalized by §4.5's parse rule before it reaches the component. `ScenarioBlock` therefore performs **no defensive validation of its own** — deliberately, since a guard for an unreachable state is untestable and would rot. The guard contract lives at the catalog boundary where the values actually enter the system.

`ScenarioBlock` owns:

- the pill `<button>` and its ref (the ref target R1 #6 said was unidentified),
- `open` as real `useState`, defaulting to **true** so the menu is visible without a click, with a working `onClose` and a re-open control. This makes §4.4's "menu open/close is genuinely live" true rather than contradicted by a no-op,
- `onNavigate` as a no-op that records the item id into visible on-page text, so navigation intent is observable without a router.

**Menu positioning — measured, not hedged** (R2a correctly attacked the previous "if it turns out to be" wording). `AttentionMenu`'s root is `absolute top-[calc(100%+8px)] right-0 z-20 w-[min(400px,calc(100vw-32px))]` with an inner `max-h-96 overflow-y-auto` list (`components/admin/showpage/AttentionMenu.tsx:99` and `components/admin/showpage/AttentionMenu.tsx:108`). No portal, no `position: fixed`. Three consequences the previous revision got wrong:

1. It is **absolutely positioned, therefore out of flow** — it does not "stack vertically," it **overlays whatever follows**. Each block wraps the pill in a `relative` element (establishing the containing block) and, while its menu is open, reserves bottom space of at least the menu's maximum height (`24rem` list + header/footer + the `8px` offset). Adjacent open menus then cannot intersect, which §8 asserts in a real browser rather than assuming.
2. Its width is `min(400px, 100vw - 32px)` — sized off the **viewport**, not the container. The `w` control (§4.5) therefore does **not** narrow the menu. `w` narrows the cards and the block; menu width is a viewport property and cannot be simulated by a wrapper.
3. The scroll threshold is the list's `max-h-96` (384px). `MENU_CAP` = 12 rows, each `min-h-tap-min` (44px) plus padding, clears it comfortably — but §8 measures it rather than relying on this arithmetic.

**Transition inventory:** `ScenarioBlock` is a multi-state client component, and its full state-pair table — menu open/closed, navigation readout, and every compound case with help popovers and warning expansion — lives in §9 alongside the materialize card's. It is stated there rather than here so the two inventories sit together.

`degraded: true` renders the same degraded pill and Overview notice the loader produces (`app/admin/_showReviewModal.tsx:304-310`), from the same components the modal uses, not a lookalike (R1 #17).

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

| Axis | Exact mechanism | Expected outcome |
| --- | --- | --- |
| Routed section absent | `sectionAvailable: (s) => s === "overview"` — Overview stays available, so the fallback has a destination | banner falls back to Overview |
| Overview also absent | `sectionAvailable: () => false` | **the card still lands in Overview's section top — a card is NEVER dropped.** Corrected against the implementation: `bucketAttention` resolves an unavailable section to `"overview"` unconditionally and never consults `sectionAvailable("overview")` for the fallback target (`lib/admin/sectionAttention.ts:114-116`). This axis therefore pins the **structural no-drop guarantee** rather than a drop. The earlier revisions of this table asserted a drop; implementing it proved that wrong |
| Anchor slot absent | `anchorAvailable: () => false`, `sectionAvailable: () => true` | **redirects to Overview's section top, NOT the rooms section top.** `rooms` and `event` have no section-top consumer — they host cards only at their content anchor — so a card that resolved there without landing at the anchor is redirected to Overview rather than pushed to a section top that renders nothing (`lib/admin/sectionAttention.ts:127-134`). Also corrected against the implementation |
| Crew key unrendered | `crewKeyRendered: () => false` | crew banner goes to the crew section top |
| Alert vs hold | scenario carries only `alerts` / only `holds` | hold appears in the hold group, never a banner |
| Auto-clearing, inbox-routed | one code with `isInboxRouted` true | resolve control absent; `autoClearNote` = the inbox line (`lib/admin/attentionItems.ts:86`) |
| Auto-clearing, auto-resolving | one code with `isAutoResolving` true | resolve control absent; `autoClearNote` = `autoResolveNote(code)` |
| Actionable | one code that is neither | resolve control present |
| Occurrence 1 vs N | `occurrence_count: 1` / `7` | repeat-count affordance |
| Identity present/absent | `galleryIdentity` set / null | `menuSubtitle` present / absent |
| Uncataloged code | a code absent from both `MESSAGE_CATALOG` and `ATTENTION_ROUTES` | `ATTENTION_FALLBACK_TITLE` (`lib/admin/attentionItems.ts:84`); routes to Overview via the `?? { sectionId: "overview" }` fallback (`lib/admin/attentionItems.ts:254`) |
| Unresolved placeholder | context leaving a `<token>` uninterpolated | `template` null, card falls back |
| Alert count 0 / 1 / `MENU_CAP` | the **alert** list length; holds and warnings are separately axed | empty state, single, and a menu long enough to cross its scroll threshold |
| Degraded alert read | `degraded: true` | §4.0 |

`MENU_CAP` is a named constant (§2), not a bare literal. Whether it actually crosses the production scroll threshold at every `w` is asserted by the layout task (§8), not assumed (R1 #28).

### 4.3 Tier boundaries

- **T1** — one scenario per alert code (`N_ALERT_CODES`, of which `N_ALERT_RENDERABLE` render) and one per warning code (`N_WARN_CODES`).
- **T2** — the §4.2 matrix.
- **T3** — composites, **rendered by materialize only**. The gallery lists them by id and label with a pointer to the dev panel.

### 4.4 Interactivity boundary

Live for real: menu open/close (§4.0), `?` help popovers, expand/collapse, hover, focus.

**Server actions are neutralized structurally, not by having fake ids** (R2a — the previous revision claimed synthetic ids made the actions inert, which was false: the resolve control still rendered and still submitted, so a click would run authorization, parsing, the Supabase call, the error path, and telemetry, and a non-UUID id against a `uuid` column throws before it can be a harmless no-match).

**The mechanism is submit interception, not `inert`** (R5d correctly showed `inert` cannot work here: `ScenarioBlock` renders whole `AttentionBanner`s and has no injection point to reach the nested control, and applying `inert` to the banner would also kill the help popover and hover states §4.4 promises stay live).

The resolve control is a `<form action={resolveAdminAlertFormAction}>` wrapping a `useFormStatus` button (`components/admin/ResolveAlertButton.tsx:42-47`). So `ScenarioBlock` attaches a **capture-phase `submit` listener on its root element** that calls `preventDefault()` unconditionally. Every server action in the subtree posts through a form submit, so one listener neutralizes all of them — including any added later — without touching a production component or a single prop.

Everything else stays genuinely live: the resolve button's own two-step confirm (`components/admin/ResolveAlertButton.tsx:13` — click arms a confirm state, a second click submits) still runs and is **worth seeing**, since the armed state is itself a state the sweep should show. Only the terminal submit is stopped. `useFormStatus` never reports pending because no submission starts, so the button rests visibly idle rather than spinning forever.

A standing note at the top of the page states that action controls are display-only here and points at the dev panel. The `gallery:<id>:<n>` ids of §3.0 remain useful as stable React keys and readout identifiers — they are simply no longer load-bearing for safety.

**Known fidelity caveat:** `AttentionBanner` reads `usePathname()` (`components/admin/review/AttentionBanner.tsx:101`) for a route-gated Learn-more link. Under the gallery that value is the gallery path, so the gate evaluates differently than in production. The readout prints the value (§4.1 item 2), making the difference explicit rather than silently misleading.

### 4.5 Controls

Query params only.

| Param | Accepted | Effect | Default |
| --- | --- | --- | --- |
| `tier` | `1`, `2`, `3` | restrict to that tier; `3` renders the T3 list of §4.3 | all |
| `scenario` | a scenario id | restrict to that one scenario | all |
| `w` | integer in `[320, 1280]` | sets `max-width` on each block wrapper | unconstrained |

**Guards** (R1 #24):

- `scenario` **wins over** `tier` when both are present, including when the named scenario is not in the named tier. Precedence is stated because it is otherwise undefined.
- **`searchParams` shape.** A Next.js 16 App Router page receives an awaited `searchParams` whose values are `string | string[] | undefined` — not a `URLSearchParams` instance (R2a: the previous revision cited `.get()` semantics, which do not apply). Normalization is explicit: `undefined` means absent; an **array** takes its first element; an empty array is treated as absent.
- **`w` parsing, single rule, no overlap.** Trim, then require a full match of `^\d+$` (digits only — this already excludes empty, whitespace, signed, decimal, exponent, `NaN`, and `Infinity`, so those never reach the numeric stage). Parse with `Number.parseInt`. Then: if the result is not a finite integer — the digits-only-but-astronomically-long case R2a identified — treat as **absent**. Otherwise **clamp** into `[320, 1280]`. A negative value cannot reach the clamp because `-` fails the regex, which removes the previous revision's contradiction between "signed falls back" and "out-of-range clamps".
- `tier` outside `{1,2,3}`, empty, or whitespace → all tiers.
- Unknown `scenario` → an explicit "no such scenario" line listing valid ids, never a blank page.

`w` sets `max-width`, not a fixed width: it narrows the column the way a narrower viewport would, but it is **not** a viewport emulator (media queries still see the real viewport). §8 depends on this being `max-width`; §4.5 and §8 previously disagreed (R1 #21).

## 5. Materialize

**Where:** a card on the existing `/admin/dev` panel (`app/admin/dev/page.tsx`), already `requireDeveloper`-gated and build-gated. Controls: scenario select, target show slug, target environment, Apply, Clear.

### 5.0 Only T3 scenarios are materializable

R1 #15 found §5 and §5.1a contradicting each other. Resolved: **the selector lists T3 scenarios only.** T1 and T2 are gallery-only, because their distinguishing inputs cannot exist as database state — `bucket` predicates are functions, `degraded` is a loader fault, and `PICKER_EPOCH_RESET` is cut in derive so a materialized row would render nothing and read as a bug. A T1/T2 id submitted directly is refused (§5.3).

### 5.1 Apply

Apply makes the target show's synthetic state **equal to** the selected scenario — a replacement, not an accumulation (R1 #2, which correctly showed the previous asymmetry made sequential applies a union/first-wins/last-wins mixture):

1. Delete **every** `__devScenario`-tagged `admin_alerts` row for the show — any scenario, not only the selected one.
2. Delete every `__devScenario`-tagged `sync_holds` row for the show, same scope.
3. Insert `scenario.alerts` (skipping collisions, §5.1a) and `scenario.holds` (skipping `(domain, entity_key)` collisions, §3.0a).
4. If and only if `scenario.warnings` is present **and the target is local**, overwrite `shows_internal.parse_warnings` (§3.4). **On validation, warnings are never written**, and Apply reports `warnings_skipped_validation`.

   The asymmetry is deliberate (R3b): `parse_warnings` is untagged, and validation Clear does not regenerate (§5.5), so a validation warning write would have **no cleanup path at all** and would accumulate permanently. Refusing the write is the only way to keep Clear's guarantee honest on validation. Alerts and holds are unaffected — they are tag-scoped and fully cleanable in both environments.

**Scope of the replacement guarantee** (R3a: the unqualified claim was false when `warnings` is omitted):

- **Alerts and holds — replacing, up to collisions.** They are tag-scoped, so steps 1 and 2 remove every synthetic row regardless of which scenario wrote it. Applying A then B leaves B's alerts and holds **except** any that were skipped for colliding with an authentic row (§5.1a, §3.0a). A skipped code or `(domain, entity_key)` leaves the **authentic** row in place, whose context and other columns may differ from B's authored row. So the guarantee is "no residue from A, plus B minus its skips" — not literally "exactly B" (R4a). The skips are named in the result, so the difference is always visible rather than silent.
- **Warnings — declared-only, NOT reconciling.** `parse_warnings` is an untagged jsonb column (§3.4), so Apply cannot tell a synthetic warning from an authentic one and does not try. If B omits `warnings`, **A's warnings remain**. This is stated rather than silently true.

Operator remedy, and the reason this is acceptable: run Clear (local) before applying a scenario that does not declare warnings. The card's copy says so at the point of use. A scenario that *does* declare `warnings` overwrites unconditionally, so the mixed state only arises on the declared→omitted transition.

#### 5.1a The one-unresolved-alert-per-code constraint

`admin_alerts` carries a partial unique index (`supabase/migrations/20260501001000_internal_and_admin.sql`):

```sql
create unique index admin_alerts_one_unresolved_idx
  on public.admin_alerts (coalesce(show_id::text, ''), code) where resolved_at is null;
```

At most one unresolved row per (show, code). Therefore:

1. A scenario may not carry two alert rows of the same code — rejected before any write, asserted across the whole catalog by a test (§12).
2. A code with a pre-existing **real** unresolved row is **skipped** and named in the result: `skipped: [{ code, reason: "unresolved_row_present" }]`. Apply never resolves, deletes, or overwrites an untagged row — the promise is kept by declining, not clobbering.

#### 5.1b The tag, and why it cannot hit real data

| Table | Tag |
| --- | --- |
| `admin_alerts` | `context.__devScenario = "<scenario id>"` |
| `sync_holds` | `created_by = "__devScenario:<scenario id>"` — `created_by text not null` (`supabase/migrations/20260608000000_sync_holds.sql:18`) is a real column, so no jsonb-path or unknown-key-preservation question arises (R1 #11) |

Deletion uses the **presence** predicate on both tables, not a current-catalog-id match (R3a: matching only ids still in the catalog stranded rows written by a since-renamed or since-deleted scenario, and the two tables used inconsistent predicates — alerts narrow, holds a `LIKE` prefix):

| Table | Delete predicate |
| --- | --- |
| `admin_alerts` | `context ? '__devScenario'` — the jsonb key exists, whatever its value |
| `sync_holds` | `created_by LIKE '\_\_devScenario:%' ESCAPE '\'` — **the underscores must be escaped** |

Both are presence-shaped and neither depends on the catalog's current contents, so a renamed or removed scenario cannot strand rows.

**The escape is load-bearing, not cosmetic** (R4a P1). In SQL `LIKE`, `_` is a single-character wildcard, so the unescaped `'__devScenario:%'` also matches `xxdevScenario:anything` — meaning both Apply and Clear could delete **authentic** hold rows whose `created_by` merely happened to fit that shape. The pattern must escape both underscores so they are literal. §12 carries a regression test asserting a row with `created_by = 'xxdevScenario:real'` survives both verbs; without it this defect is invisible in every test that only uses correctly-tagged fixtures.

**Reservation, and its honest limit** (R3a): `__devScenario` is a reserved key. A test asserts no catalog scenario's authored `context` contains it, and that the **only** source emitter is the materialize action itself — walking `lib/` and `app/` with `app/admin/dev/actions.ts` as the single declared exception. (R4a: stated without that exception, the assertion would reject the very code that must write the tag, or silently enforce something weaker than the prose claimed.) That check cannot cover database-side writers, other source trees, rows already stored before this feature existed, or a value propagated at runtime into a context this instrument never authored. **The immunity of authentic rows is therefore enforced by convention plus a source-level check, not proven.** Accepted because the blast radius is bounded to a developer instrument that (a) cannot target production at all (§5.5), and (b) writes only on a loopback or validation database. A production-reachable version of this feature would need a provably-reserved column instead, and that is why §5.5's gate is the load-bearing control rather than this one.

### 5.2 Clear

1. Delete every tagged `admin_alerts` row for the show (any scenario).
2. Delete every tagged `sync_holds` row for the show.
3. **Local target only:** call `runManualSyncForShow(driveFileId, "manual")` (`lib/sync/runManualSyncForShow.ts:297`) to re-parse from source and regenerate authentic `parse_warnings`. **Validation target: skipped**, reported as `warnings_regeneration_skipped` — a policy outcome, distinct from the `warnings_regeneration_failed` infra fault a local re-sync can return (§5.3).

Clear reports per-step outcomes. Its destructive scope is **all synthetic rows for the show**, not only the selected scenario; the card's confirmation copy says exactly that, since the selector sits beside it (R1 #27).

### 5.3 Guards

**Cleanup is never blocked.** Every guard below is marked Apply-only or both. Clear carries the minimum set that can refuse it, because a guard that prevents cleanup can strand synthetic state permanently (R3a: the previous revision applied one shared table to both verbs, so a show materialized and then archived could never be cleaned).

Clear is scenario-independent (§5.2 deletes every tagged row), so **no scenario-related guard applies to it**: an unknown, malformed, T1/T2, or since-deleted scenario id does not prevent a Clear. Clear needs only a resolvable show and a permitted environment.

#### Input normalization, applied before any guard

Form values arrive as `string | string[] | undefined`. Normalization is uniform: `undefined` and the empty array are absent; an array takes its first element; every value is trimmed. A value that is absent, empty after trim, or non-string where a string is required is a refusal, never a silent default. This covers the null, non-string, repeated, and zero-valued forms uniformly rather than enumerating them per field (R3a).

| Condition | Applies to | Behavior |
| --- | --- | --- |
| Slug absent, empty after trim, or unresolvable | both | refuse, no writes |
| Show archived | **Apply only** | refuse. Clear proceeds on archived shows — cleanup must always be available |
| Show archived between precheck and write | Apply | the write stands. Archival does not corrupt synthetic state, and Clear remains available afterward because it does not check archival |
| Scenario id absent, empty, unknown, or naming a T1/T2 scenario | **Apply only** | refuse (§5.0) |
| Scenario carries duplicate alert codes or duplicate hold `(domain, entity_key)` | Apply | refuse before any write, naming the duplicate (§3.6 rejects this at catalog level; this is the runtime backstop) |
| Scenario has no alerts and no holds, and either declares no `warnings` **or** the target is validation (where warnings are never written, §5.1 step 4) | Apply | refuse — nothing would be materialized. The guard is **environment-aware** (R4a): a warnings-only scenario is materializable on local but is a no-op on validation, and without this it would pass, delete prior tagged state, write nothing, and report only a skipped warning |
| Show already has real unresolved alerts | Apply | non-colliding codes inserted; colliding codes skipped and named (§5.1a). Real rows untouched |
| Target environment absent or not `local` \| `validation` | both | refuse |
| `local` selected but the client URL host is not loopback | both | refuse (§5.5) |
| `validation` selected without confirmation, or the confirmation value is empty, false, or not the expected token | both | refuse |
| Validation triple incomplete, its URL's derived ref ≠ `VALIDATION_PROJECT_REF`, or `VALIDATION_SUPABASE_PROJECT_REF` disagrees with the derived ref | both | refuse (§5.5) |
| Validation URL syntactically complete but unparseable by `projectRefFromUrl` | both | refuse — a null derived ref never equals the constant, so this falls out of the §5.5 rule rather than needing its own branch |
| Validation secret present but rejected by the server | both | `{ kind: "infra_error" }`, not a refusal — the distinction matters at the Supabase boundary (invariant 9) |
| Partial failure mid-Apply | Apply | completed writes stand; the result names which steps committed and the outcome is `partial` (§7.1). The next Apply or Clear fully repairs alerts and holds. **Warnings are not tag-scoped**, so an interrupted Apply that already overwrote them is repaired only by a successful local Clear |
| Zero tagged rows at Clear | Clear | succeed, report "nothing to clear", still attempt step 3 on local |
| Local re-sync unreachable | Clear | `warnings_regeneration_failed` — an infra fault (§5.2) |
| Validation target | Clear | `warnings_regeneration_skipped` — a policy decision, deliberately a **different** outcome from the fault above (R3a: conflating an intentional skip with an infrastructure failure destroys the discriminable-fault semantics invariant 9 requires) |

#### Concurrency

The single-operator posture is stated, not defended, and the enumeration is now complete for the executable pairs (R3a — the previous revision described only Apply-vs-Apply):

| Pair | Outcome |
| --- | --- |
| Apply vs Apply | delete/insert is not atomic; a concurrent pair can interleave, and the partial unique index can fail one insert outright rather than "last writer wins" |
| Apply vs Clear | Clear's deletes can land before Apply's inserts, leaving tagged rows after Clear reported success. A second Clear resolves it |
| Clear vs Clear | benign; both issue the same presence-scoped deletes and the second finds nothing. The re-sync step is idempotent |
| Apply vs cron or manual sync | **local only**: both write `parse_warnings` and either may win. **On validation this pair cannot occur** — Apply never writes warnings there (§5.1 step 4), so only the cron writes the column |
| Clear vs cron or manual sync | **local**: benign, both converge on authentic warnings. **Validation**: Clear does not touch or regenerate warnings at all, so there is no interaction — the cron is the only writer, which is why validation warning state is the cron's responsibility (§5.5) |

The card disables its submit while a request is in flight, which removes double-submit only. It does **not** serialize separate tabs, two operators, a direct server-action invocation, or background sync, and is not claimed to.

### 5.4 Why `parse_warnings` is overwritten rather than backed up

A backup needs durable storage — a new column or table, i.e. a migration plus the `validation-schema-parity` checklist. Re-sync already regenerates the column authentically. The cost is the unreachable-Drive and validation edges above, accepted explicitly.

### 5.5 Environment targeting

**Both branches are gated on the URL the client will actually use** (R3a P0: the previous revision gated `local` on nothing at all, and gated `validation` on a *separate* `VALIDATION_SUPABASE_PROJECT_REF` string — so a production URL and production secret paired with the expected ref value passed the gate).

The rule, mirroring `destructiveResetAllowed`'s documented precedent that the guard must read the same variable the client reads (`lib/admin/validationDeployment.ts:19-26`):

| Target | Gate — evaluated on the exact URL passed to the client |
| --- | --- |
| `local` | the URL's host must be loopback (`127.0.0.1`, `localhost`, or `[::1]`). Any other host, including a `*.supabase.co` host, is **refused**. "Local" is verified, never assumed from the absence of a selection. |
| `validation` | `projectRefFromUrl(VALIDATION_SUPABASE_URL) === VALIDATION_PROJECT_REF` (`lib/admin/validationDeployment.ts:7`, against the constant at `lib/admin/validationDeployment.ts:1`). The ref is **derived from the URL**, never read from `VALIDATION_SUPABASE_PROJECT_REF`. That variable must still be present and must *agree* with the derived value — a disagreement is a refusal, since it signals a misconfigured environment — but it is a cross-check, not the authority. |

`projectRefFromUrl` uses a strict host-boundary regex (`lib/admin/validationDeployment.ts:5`) that rejects branch-preview hosts, suffixed hosts, and trailing garbage, so a lookalike host cannot satisfy it.

Validation additionally requires an explicit confirmation and a complete `VALIDATION_SUPABASE_URL` + `VALIDATION_SUPABASE_SECRET_KEY` + `VALIDATION_SUPABASE_PROJECT_REF` triple, resolved exclusively from that triple with no fallback to ambient `SUPABASE_URL` / `SUPABASE_SECRET_KEY`.

**Production is therefore unreachable by construction:** there is no code path that hands the action a client whose URL is neither loopback nor the validation ref.

**The re-sync is a direct function call, not an HTTP request.** `POST /api/admin/sync/[slug]` is a thin wrapper: it authenticates, resolves the slug to a `drive_file_id`, and calls `runManualSyncForShow(resolved.driveFileId, "manual", ...)` (`app/api/admin/sync/[slug]/route.ts:94`). Clear calls that same function directly. A server action fetching its own route would need an absolute origin and forwarded session cookies — the auth-and-cookie-propagation design R1 #5 correctly flagged as unspecified — and all of it is avoidable, since the callable unit is already exported.

This preserves §7.2: `runManualSyncForShow` acquires the per-show advisory lock itself, and its `_unlocked` variant asserts the lock is held (`lib/sync/runManualSyncForShow.ts:286`), so the holder remains exactly one layer deep and a nested acquisition would fail loudly rather than deadlock.

**Clear still does not re-sync on validation** (R1 #5). The reason is no longer the HTTP boundary but the pipeline's inputs: `runManualSyncForShow` reads Drive through ambient credentials and writes through the ambient client, so pointing it at a validation database would mean threading an environment through the whole sync pipeline. Validation Clear performs steps 1–2 and reports `warnings_regeneration_skipped`. Regenerating validation warnings is the validation cron's job or a reseed.

## 6. Build-vs-runtime gate

Build-time, not runtime. `scripts/with-admin-dev-flag.mjs` renames the files in its `FILES` array (`scripts/with-admin-dev-flag.mjs:43-55`) to `.disabled-by-build-gate` before `next build` whenever `ADMIN_DEV_PANEL_ENABLED` is not the literal `"true"`, so the artifact does not contain the route. `requireDeveloper()` remains runtime defense in depth.

**Added to `FILES`:** `app/admin/dev/attention-gallery/page.tsx (new)`. The materialize card lives inside the already-registered `app/admin/dev/page.tsx` and `actions.ts`.

#### 6a What actually protects production, measured

The previous revision cited a `FILES`-membership assertion in `tests/admin/withAdminDevFlagDevPanelPresent.test.ts`. **No such assertion exists** — that file tests only `writeDevPanelPresent` (33 lines, two cases). And the real artifact test, `tests/admin/build-artifact-gate.test.ts`, is gated on `RUN_BUILD_ARTIFACT_GATE_TEST === "1"` (`tests/admin/build-artifact-gate.test.ts:33`), a variable that appears **nowhere** in `.github/workflows/` or `package.json`. It runs a full `pnpm build`, so it is deliberately opt-in and **does not run in CI**.

Net: today, **nothing in CI catches a new `app/admin/dev/**` route that was never added to the `FILES` array.** The rename gate protects only files it knows about, and membership is unchecked. This affects the load-bearing production-safety claim in §1.1 and §5.5, so it is stated rather than assumed.

**Structural defense, created by this change** (cheap, CI-runnable, fails by default): a filesystem-walking meta-test asserting that **every route-defining or server-action file** under `app/admin/dev/**` appears in `scripts/with-admin-dev-flag.mjs`'s `FILES` array. The walked set is `page.tsx`, `route.ts`, `actions.ts`, `layout.tsx`, `default.tsx (route-tree files)`, and any `*.ts` **or `*.tsx`** containing a `"use server"` directive (R4b: scanning only `*.ts` would let a `.tsx` server-action module evade registration) — not just `page.tsx` and `actions.ts` (R3b: an unregistered `route.ts` API handler would otherwise evade the check and ship in the production artifact, which is exactly the fail-by-default protection this test exists to provide). The deliberately prod-available `telemetry` route is the single declared exception, matching the artifact test's own carve-out. It reads the filesystem and the script, needs no build, and runs in milliseconds. A future dev route added without registration fails immediately instead of silently shipping to production.

**Artifact-level proof at both flag states** (R1 #20) remains the `RUN_BUILD_ARTIFACT_GATE_TEST=1` path, extended with the enabled-flag case:

| Flag | Assertion | Why this claim |
| --- | --- | --- |
| unset | the built `app-paths-manifest` and `routes-manifest` files contain no non-telemetry `/admin/dev` entry | **route-manifest absence** — a source grep is weaker, a 404 probe tests routing rather than the artifact. The existing assertion already filters generically on "non-telemetry `/admin/dev`" (`tests/admin/build-artifact-gate.test.ts:135-152`), so the new route is covered **with no edit** |
| `"true"` | the manifests **do** contain `/admin/dev/attention-gallery` | new; proves the gate is a gate rather than a permanent deletion |

This is a **manual close-out check, not a CI gate** — consistent with §1.1's no-CI-gate decision, and now stated honestly instead of implied to be automatic.

## 7. Invariant compliance

### 7.1 Invariant 10 — mutation surface observability

Four exported mutation surfaces, each needing executable success-branch proof (R1 #7 — the previous revision registered four but promised proof for two):

| Surface | Code | Proof |
| --- | --- | --- |
| `applyAttentionScenario` | `DEV_SCENARIO_APPLIED` | registry row + behavioral proof |
| `clearAttentionScenario` | `DEV_SCENARIO_CLEARED` | registry row + behavioral proof |
| `applyAttentionScenarioFormAction` | `DEV_SCENARIO_APPLIED` | registry row + behavioral proof (transitive, driving the wrapper — the `parseAndStageFormAction` pattern at `tests/log/adminOutcomeBehavior.test.ts:1157-1171`) |
| `clearAttentionScenarioFormAction` | `DEV_SCENARIO_CLEARED` | registry row + behavioral proof, same pattern |

No wrapper exemptions are claimed.

**Partial-success emission** (R1 #7): Apply has no transaction, so "post-commit" needs defining. The emitted `result` is `applied` when every intended write succeeded, `partial` when at least one succeeded and at least one failed, and **nothing is emitted** when the first write failed and no state changed. The emit carries the per-step counts, so a `partial` is diagnosable from telemetry alone. It fires after the last write attempt, outside any lock.

**These codes do not take the §12.4 lockstep.** `logAdminOutcome`'s `code` is a free SHOUTY_SNAKE_CASE string (`lib/log/logAdminOutcome.ts:9`), not a `MessageCode`. `DEV_PARSE_STAGED` and `DEV_SCHEMA_RESET` appear only in `app/admin/dev/actions.ts` and the two test registries — no master-spec §12.4 row, no `lib/messages/catalog.ts` entry. Adding one would put a non-message code in the message catalog and risk `x1-catalog-parity` rather than satisfy it.

### 7.2 Invariant 2 — advisory locks

Materialize writes `admin_alerts`, `sync_holds`, and `shows_internal.parse_warnings`. None is in the guarded set (`shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`).

The local Clear's re-sync acquires the per-show lock **inside existing code**: `runManualSyncForShow` (`lib/sync/runManualSyncForShow.ts:297`) is the sole acquirer. Materialize adds **no acquisition of its own at any layer** — it calls the locked entry point and lets it own the lock, which is the single-holder rule.

**Correction (R3b):** an earlier revision claimed `assertShowLockHeld` (`lib/sync/runManualSyncForShow.ts:286`) would make a second acquisition fail loudly. That is false — it asserts the lock **is** held, which a nested acquirer would also satisfy. It documents a precondition; it does not detect double-acquisition. The actual protection is the enumerated topology below, not a runtime assertion.

Enumerated holders for the `show:<drive_file_id>` hashkey touched by this design: (1) `runManualSyncForShow`, JS-side, pre-existing, unchanged. That is the complete list.

### 7.3 Invariant 5

Scoped exception ratified in §1.1, enumerated there. All rendered card copy still resolves through the catalog. The materialize card's own outcomes are `lib/messages/lookup.ts`-resolved for operator-facing text; the raw result codes of §5.3 appear only in the developer readout.

### 7.4 Invariant 8 — UI quality gate

Gallery route, `ScenarioBlock`, and the dev-panel card all live under `app/` or `components/`, so the dual gate runs on the diff — this is **not** an exemption request. What needs stating is **scope**, because the surfaces are not alike:

| Surface | Treatment |
| --- | --- |
| Materialize dev-panel card | **Full gate.** It has operator-facing copy — confirmation text naming a destructive scope, refusal messages, skip and partial-outcome reporting. The pre-code mechanical checklist applies in full: em-dash ban, apostrophe literals, `min-h-tap-min` on every control, canonical type and token classes. |
| Gallery route and `ScenarioBlock` chrome | **Gate runs, findings triaged against intent.** The readout is instrument chrome, and the established precedent for this tree is deliberate minimalism: `app/admin/dev/source-link-dim/page.tsx` states its UI is "intentionally minimal/unstyled chrome," and `app/admin/dev/page.tsx` uses raw utilities (`font-bold text-red-700`, `text-lg mb-2`) rather than design tokens. A finding that the readout should adopt product typography is answered with that precedent, not silently ignored. |
| Production components rendered **inside** the gallery | **Out of scope for findings.** `AttentionMenu`, `AttentionBanner`, `CompactAlertCard`, and `PerShowActionableWarnings` are pre-existing and already gated by their own milestones. The gallery renders them unmodified; a finding about their appearance is a finding about production, not about this diff, and belongs in its own change. |

P0/P1 fixed or deferred via `DEFERRED.md`, per the invariant.

### 7.5 Invariant 9 — Supabase call boundary

Every materialize call destructures `{ data, error }`, distinguishes returned from thrown errors, and returns a typed discriminated result:

```ts
type MaterializeResult =
  | { kind: "ok"; alerts: number; holds: number; warnings: "written" | "untouched"; skipped: Skip[] }
  | { kind: "partial"; committed: StepCounts; failedStep: Step; message: string }
  | { kind: "refused"; reason: RefusalCode }
  | { kind: "infra_error"; message: string };
```

**Registry treatment, decided here** (R1 #19 asked for a decision; the first answer was wrong and is corrected):

There is **no invariant-9 registry whose scope covers this file.** The only such registry walks `AUTH_DOMAIN_ROOTS = ["lib/auth", "app/auth", "app/api/auth", "app/api/show"]` (`tests/auth/_metaInfraContract.test.ts:336`); `tests/reports/_metaInfraContract.test.ts` is scoped to the M8 report surfaces. `app/admin/dev/actions.ts` is covered instead by a **file-level annotation** at `app/admin/dev/actions.ts:3-11`.

That annotation's stated rationale is that every helper in the file throws on both the returned-`.error` and thrown-await paths, and that **"None of these helpers return a typed `{ kind: 'infra_error' }` union, so no §1.9 caller contract exists to silently violate."**

The two new actions **break that premise deliberately**: they return `MaterializeResult` above, because the card must render skip lists, partial outcomes, and refusals as ordinary UI. Throwing would surface a recoverable, expected condition — a collision skip, an unconfirmed environment — through the dev error boundary, which is the wrong behavior.

**Structural registration is still required** (R3b: complying with the contract does not waive the requirement to be *registered or annotated* — those are separate obligations). Since no registry's scope covers this tree, the mechanism is the inline form — and the invariant is written at **call-site** granularity, not per exported function (R4b). So **every** Supabase call site inside both actions carries its own annotation:

```
// not-subject-to-meta: honors the boundary contract inline (typed MaterializeResult);
// no invariant-9 registry covers app/admin/dev. See spec §7.5.
```

One comment per action would leave its other call sites structurally uncovered. The behavioral tests in §12 verify the error handling; the annotations satisfy the separate registration-or-annotation obligation. Both are required.

With that in place, the new actions are **not exempt; they comply directly** — they destructure `{ data, error }`, distinguish returned from thrown, and map infra faults onto `{ kind: "infra_error" }`. The implementation task **amends the file-level annotation** so it no longer claims file-wide that nothing returns a typed union: the legacy helpers keep their throwing contract and their exemption, the two materialize actions are called out as honoring the invariant directly. Leaving the annotation as-is would make it a false statement about its own file.

## 8. Dimensional invariants

`w` sets `max-width` (§4.5), which constrains width only and imposes no parent→child height relationship, so the mandatory fixed-dimension analysis does not apply to the wrapper.

One real-browser assertion **is** required, for a claim §4.2 makes rather than a stretch invariant: that a `MENU_CAP`-item menu actually crosses its scroll threshold, and that simultaneously-open menus stack without overlapping (R1 #6, #28). The plan carries a Playwright task reading `getBoundingClientRect()` on adjacent open menus at the narrowest and widest `w`, asserting no intersection.

## 9. Transition inventory

The gallery adds no animated component; transitions inside `AttentionMenu`, `AttentionBanner`, and `CompactAlertCard` are pre-existing and covered (`tests/components/admin/compactAlertCompoundTransitions.test.tsx`, `transitionAudit.test.tsx`). The gallery's own filter changes are server navigations — instant, no animation.

**`ScenarioBlock`** is a new multi-state client component and carries its own inventory (R2a):

| From | To | Treatment |
| --- | --- | --- |
| menu closed | menu open | the component's existing `transition-[opacity,transform] duration-fast` on the menu root (`components/admin/showpage/AttentionMenu.tsx:99`), inherited unchanged |
| menu open | menu closed | same transition, reversed; `motion-reduce:transition-none` already honored |
| navigation readout unset | set (an item was activated) | instant — a text node appears; animating it would obscure what it records |
| readout set | set to a different item | instant |
| help popover closed | open, **while the menu is open** | instant for the composition; the popover carries its own treatment and does not alter the menu's state |
| help popover open | closed, **while the menu is open** | instant, same reasoning |
| menu open | **closed while the help popover is open** | the menu's own exit transition runs; the popover is a **descendant** (it lives inside a menu row) so it unmounts with the menu. Explicitly **not** animated separately, since a second animation on an unmounting subtree is what produces the orphaned-overlay class of bug |
| warning card collapsed | expanded, **menu open** | instant; warning cards are **siblings** of the menu, so neither transition observes the other |
| warning card expanded | collapsed, **menu open** | instant, same reasoning |
| warning card collapsed | expanded, **menu closed** | instant |
| warning card expanded | collapsed, **menu closed** | instant |
| menu closed | opened **while a warning card is expanded** | the menu's own entry transition, unchanged; the expanded card is unaffected |
| menu open | closed **while a warning card is expanded** | the menu's own exit transition; the card is a sibling and stays expanded |
| warning card toggled | **while the menu is mid-transition** | instant, deliberately not queued: the card is a sibling, and the menu animates only `opacity`/`transform`, so neither observes the other |
| help popover toggled | **while the menu is mid-transition** | instant. Note this case is a **descendant** toggling inside an animating ancestor, unlike the sibling row above; it is still safe because the menu animates only `opacity`/`transform`, which do not re-layout the popover (R4b flagged the earlier wording, which called the popover a sibling here and a descendant elsewhere — the descendant reading is correct) |

No new `AnimatePresence` and no new animated branch is introduced: every transition above is either an existing component's own, or deliberately instant.

The **materialize card** has a state model of its own, omitted from the R1 revision (R1 #22):

| From | To | Treatment |
| --- | --- | --- |
| idle | submitting (Apply or Clear) | instant — controls disable, in-flight text appears |
| submitting | result (`ok` / `partial` / `refused` / `infra_error`) | instant |
| result | idle | instant, on any control change |
| target local | target validation | instant; reveals the confirmation control, which starts unconfirmed |
| target validation | target local | instant; hides the confirmation control **and resets it to unconfirmed** (§10), so the compound "confirmed → switch to local → switch back" cannot arrive pre-confirmed |
| validation, unconfirmed | validation, confirmed | instant |
| validation, confirmed | validation, unconfirmed | instant; reachable by clearing the control directly, and the state the target switch above resets to |
| any result | submitting again | instant; the prior result clears before the request fires, so a stale result never sits beside a live one |

Compound: changing scenario, show, or environment **while a request is in flight** is prevented — the controls are disabled for the duration, which is also the double-submit guard of §5.3. Changing them while a *result* is displayed clears the result, per the row above.

## 10. Flag lifecycle

| Flag / field | Storage | Write path | Read path | Effect |
| --- | --- | --- | --- | --- |
| `ADMIN_DEV_PANEL_ENABLED` | env at build invocation | operator / CI | `scripts/with-admin-dev-flag.mjs` | not `"true"` → route absent from artifact |
| `tier`, `scenario`, `w` | URL query | user | gallery page | §4.5 |
| `scenario.degraded` | catalog literal | catalog author | `ScenarioBlock` | degraded pill + Overview notice |
| `scenario.warnings` presence | catalog literal | catalog author | both consumers | tri-state, §3.4 |
| `context.__devScenario` | `admin_alerts.context` | Apply | Apply + Clear | scopes deletion |
| `sync_holds.created_by` | column | Apply | Apply + Clear | scopes deletion |
| target environment | form field | user | materialize action | local vs validation client (§5.5) |
| validation confirmation | form field, per submit — **not persisted** | user, only while target is validation | materialize action | absent, empty, false, or not the expected token → refusal (§5.3). Resets to unconfirmed whenever the target changes, so a confirmation cannot carry across environments |

No empty column; no zombie flag.

## 11. DB completeness matrix

Dimensioned by tier as well as table (R3b). **Tier applies only to the write path**, because materialize accepts T3 only (§5.0): T1 and T2 have no DB dimension at all — they are gallery-only and touch no table in any layer. Every row below is therefore the T3 row, and the T1/T2 rows are "N/A, never materialized".

| Layer | `admin_alerts` | `sync_holds` | `shows_internal.parse_warnings` |
| --- | --- | --- | --- |
| DDL / CHECK / migration | none — no schema change | none | none |
| Constraints honored | partial unique index (§5.1a) | `unique (show_id, domain, entity_key)` + domain/kind/kind_shape CHECKs (§3.0a) | none |
| RPC read path | unchanged (`fetchPerShowAlerts`) | unchanged (`readShowChangeFeed`) | unchanged (snapshot RPC) |
| RPC write path | N/A — no RPC; direct service-role insert/delete | N/A — no RPC; direct service-role insert/delete | N/A — no RPC; direct service-role update |
| Direct write path | service-role insert/delete | service-role insert/delete | service-role update, **local only** (§5.1 step 4) |
| Propagation trigger | N/A — none defined on this table | N/A — none defined on this table | N/A — none defined on this column |
| Audit page | unchanged — the existing admin alerts view reads these rows and needs no change; synthetic rows appear there exactly as real ones do, which is intended | unchanged | unchanged |
| Cleanup | tag-scoped | tag-scoped | local re-sync only (§5.2) |
| Frontend | gallery + card | gallery hold group + card | `PerShowActionableWarnings` |
| Tests | §12 | §12 | §12 |

## 12. Meta-test inventory

**Extends:** `tests/log/_auditableMutations.ts` (four rows), `tests/log/adminOutcomeBehavior.test.ts` (four behavioral proofs), `tests/admin/withAdminDevFlagDevPanelPresent.test.ts` and `tests/admin/build-artifact-gate.test.ts` (§6).

**Not extended:** any invariant-9 registry — none has `app/admin/dev` in scope (§7.5). The obligation there is an amended file-level annotation plus the typed-result behavior, both covered by the guard tests below rather than by a registry row.

**Creates:** one — the `FILES`-membership meta-test of §6a. It is the CI-enforced half of the build gate, and the only new structural defense this design adds.

**Declined:** a catalog-*completeness* meta-test (§1.1) — one asserting the catalog covers every known code. The alert axis needs none (totality is structural, §3.1); the warning axis has an enumerated residue whose closure is a backlog item.

**Not the same thing:** §3.6's `validateScenario` test asserts every scenario in the catalog is *well-formed*, and §6a's test asserts every dev route is *registered*. Neither gates coverage. Validity and registration are checked; completeness is not.

**Known harness gap:** the shared Supabase mock `chainResult` (`tests/log/adminOutcomeBehavior.test.ts:77-86`) stubs only `eq/is/not/select/update/insert/delete/single/limit`. Any builder method materialize uses beyond that set must be added in the same task, or the behavioral test throws on an undefined method.

**Behavioral tests.** Each states the failure mode it catches; none passes merely by the function being called.

| Test | Catches |
| --- | --- |
| No scenario carries duplicate alert codes or duplicate hold `(domain, entity_key)`, asserted across the whole catalog | a catalog addition that renders fine and fails the unique constraint the first time it is materialized |
| Apply skips a colliding code: seed a real unresolved alert of code C, apply a scenario with C and D; assert D inserted, C in `skipped`, and the pre-existing C row **byte-identical** (same id, `raised_at`, `occurrence_count`, `resolved_at`) | an Apply that "handles" the collision by resolving or overwriting a real alert |
| Apply A then Apply B leaves exactly B's synthetic rows and none of A's | the union/first-wins/last-wins mixture of R1 #2 |
| Apply with `warnings` absent leaves `parse_warnings` byte-identical; with `[]` writes `[]` | the destructive-erase of R1 #3 |
| Apply → Clear leaves **zero** tagged rows, counted directly against the DB, not from the action's own report | a Clear that strands rows while reporting success |
| **Clear preserves authentic rows.** Seed untagged `admin_alerts` and `sync_holds` rows alongside synthetic ones, Clear, then assert every authentic row is **byte-identical** — same id, timestamps, and payload — not merely still counted | a Clear whose predicate is too broad and sweeps production rows out with the synthetic ones. Counting tagged rows alone cannot see this (R3b) |
| **Apply → Clear observes the warning column**, not just tagged rows: on local, `parse_warnings` returns to its authentic content; on validation, Apply never wrote it (§5.1 step 4) so it is unchanged throughout | synthetic warnings surviving a Clear that reports success because alerts and holds went away. `parse_warnings` is untagged, so a tagged-row count is blind to it (R3b) |
| **`LIKE` wildcard safety.** Seed `sync_holds` rows with `created_by` values of `xxdevScenario:real` and `a_bdevScenario:real`; run Apply and Clear; assert both survive byte-identical | the unescaped `_` wildcard of R4a P1 deleting authentic rows. Every fixture that uses only correctly-tagged rows passes while this bug is present |
| **Authentic hold collision.** Seed a real `sync_holds` row, apply a scenario whose hold shares `(domain, entity_key)`; assert the scenario's hold is skipped and named, and the real row is byte-identical | overwriting or deleting a real hold. The catalog duplicate check cannot catch this — it only sees within-scenario duplicates (R3b) |
| Apply twice yields the same row count as once | non-idempotent accumulation |
| Guards (§5.3, Apply-only and both-verb rows): each commits **no writes**, asserted by a **full before/after content snapshot** of `admin_alerts`, `sync_holds`, and `parse_warnings` for the show — not row counts | a guard that returns an error after having already written. Counts alone pass when a field was updated in place, `parse_warnings` was mutated, or a delete and insert offset each other (R3b) |
| **Clear is not blocked by Apply-only guards**: Clear succeeds on an archived show, and with an unknown, malformed, or since-deleted scenario id | a guard table applied to both verbs, which would strand synthetic state permanently (R3a) |
| **Environment gate**: a `local` target whose URL host is not loopback is refused; a `validation` target whose URL-derived ref is not `VALIDATION_PROJECT_REF` is refused even when `VALIDATION_SUPABASE_PROJECT_REF` says otherwise | the R3a P0 — a production URL passing the gate because a separate env string carried the expected value |
| **Invariant-9 boundaries**: inject a returned `{ error }` and a thrown rejection at **each** Supabase call inside Apply and Clear; assert each yields `{ kind: "infra_error" }` or `{ kind: "partial" }` with the failed step named, never a silent success | a boundary that swallows an error or conflates returned with thrown (R3b — the previous plan asserted the typed union existed but never exercised the paths that produce it) |
| **Telemetry semantics**: a partially committed Apply emits once after the final write attempt with accurate step counts; an Apply whose first write fails emits **nothing**; the Clear emit happens after the re-sync has returned, i.e. outside the lock | a post-commit emit that fires inside the lock, double-emits, or reports a partial as a success (R3b) |
| Reserved-key test: no catalog `context` contains `__devScenario`; no production emitter writes it | Clear deleting authentic rows (R1 #12) |
| Fidelity: derived fields the gallery computes equal those `fetchPerShowAlerts` returns for the same row and identity, compared across the two call paths rather than to a hand-written expectation | the gallery and the real modal rendering different copy — the failure that makes the instrument misleading rather than merely incomplete |
| Hold shaping: a scenario hold inserted and read back through `readShowChangeFeed` yields the same `FeedEntry` the gallery shaped | drift between the two shaping call sites |
| `PICKER_EPOCH_RESET` produces no derived item, and is refused by materialize | the cut silently becoming a rendered card |
| T2: each §4.2 row asserts its stated outcome | a fallback predicate that no longer routes as documented |
| Build gate at both flag states (§6) | a gate that permanently deletes, or one that leaks |
| Query-param guards and `scenario`-over-`tier` precedence (§4.5) | the self-contradictory clamp of R1 #24 |
| Layout: adjacent open menus do not intersect at min and max `w`, **and** a `MENU_CAP`-item menu's `scrollHeight` exceeds its `clientHeight` | overlapping menus invalidating the sweep, and a cap chosen too low to actually exercise the scroll state it claims to demonstrate (R3b) |

**Not covered, deliberately:** live `resolveAlertIdentities` behavior against real crew rows (the inherent divergence of §3.3, labelled in the UI), and validation-target writes (exercised by hand, not in CI, since CI has no validation credentials).

## 13. Out of scope

- Screenshot regression gate and the Docker/arch pinning it requires (§1.1).
- Rendering T3 composites in the gallery (§4.3).
- Materializing T1/T2 scenarios (§5.0).
- Widening the internal-code-enum generator's scan heuristic (§3.2, backlog).
- Making gallery server actions functional (§4.4).
- Env-aware re-sync for validation Clear (§5.5).

**Explicitly in scope, contrary to the previous revision** (R1 #23): this design **does** modify production code. §3.3 extracts a pure function out of `fetchPerShowAlerts` and another out of `readShowChangeFeed`, both of which feed the production show modal. The extractions are behavior-preserving and the existing tests for both paths must pass unchanged, but claiming "no production render path is touched" was false and the regression risk is real.
