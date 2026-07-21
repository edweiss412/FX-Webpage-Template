# Spec review R5c - PROBLEM, SCOPE, NUMBERS, CATALOG (sections 1-3)

## Your role: REVIEWER ONLY

Do not fix issues, do not propose patches, do not imply changes you will make. Surface findings only. Do NOT run shell commands or tools; the artifact is inlined. Do NOT invoke any nested review.

## Context

A DEV-ONLY instrument in a Next.js 16 + Supabase admin app: it renders every alert/warning state of an admin "show modal" without waiting for live data to raise the row. One catalog, two consumers - a build-gated gallery route (renders states, no DB) and a "materialize" dev-panel card (writes tagged rows into a local or validation Supabase so the real modal shows the state for real). Sections 5-13, covering materialize and the invariants, were reviewed separately and are APPROVED.

## Settled - verify consistency, do NOT re-argue direction

- Gallery renders tier 1 (one scenario per code) and tier 2 (a structural matrix) only; tier 3 composites are materialize-only.
- No completeness gate: no screenshot byte-comparison, no meta-test asserting the catalog covers every code. Catalog VALIDITY is tested; coverage is not.
- Scenarios declare storable DB-shaped rows, never derived read-model shapes; the two consumers share one derivation function so they cannot diverge.
- Identity resolution needs real crew rows, so the gallery declares an identity where materialize resolves one. This divergence is inherent and is labelled in the UI.
- Action controls in the gallery render but are neutralized with `inert`.
- Bucketing runs on the server because BucketOpts holds predicate functions; ScenarioBlock receives serializable groups.
- Invariant 5 has a ratified, scope-enumerated dev-instrument exception.

## Binding project invariants (abbreviated)

- Inv 5: no raw error codes in user-visible UI, except the ratified scope above.
- Every prop/input needs stated behavior for null, empty, zero, malformed. The catalog's guard contract is executable (a validateScenario function) rather than prose.
- Tailwind v4 here does NOT default .flex to align-items:stretch; fixed-dimension parents with flex/grid children need explicit dimensional invariants verified in a real browser.
- Components with multiple visual states need a transition inventory covering every state pair and compound transitions.

## What I need from you

This document is near final. Confirm these sections are internally consistent and that their claims about rendering, derivation, and guards hold. If sound, say so and APPROVE. Do NOT manufacture findings to appear thorough, and do not restate settled decisions as findings.

## Output format

Per finding: `SEVERITY (P0/P1/P2/P3) - <claim> - <section> - <why it fails, concretely>`.

End with a final line exactly: `VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`

## ARTIFACT - sections 1 through 3

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
| **No completeness gate.** Specifically: no screenshot byte-comparison, and no meta-test asserting the catalog _covers_ every code. Totality on the alert axis is achieved structurally instead (§3.1). This is **not** a ban on all new tests: §3.6's validator (catalog _validity_) and §6a's `FILES`-membership test (production safety) both run in CI and are in scope. The declined thing is coverage-gating the catalog, not testing the code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | §3.1, §3.6, §6a, §12      |
| **No migration.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | §5.4                      |
| **No new advisory-lock holder.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | §7.2                      |
| Gallery action controls render but cannot fire: they are neutralized with `inert`, not by carrying synthetic ids.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | §4.4                      |
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
// `code` is NOT overridable: the key IS the code. Allowing an override to emit a
// different code would let a row keyed by one route emit another, breaking the
// structural totality of 3.1 (R2a).
const ALERT_ROW_OVERRIDES: Partial<Record<string, Partial<Omit<ScenarioAlertRow, "code">>>> = {
  ...
};
```

`galleryIdentity` **is** overridable and appears in this type deliberately, even though it is not storable. It is the one gallery-only field (§3.0), and the identity-dependent codes below require it. The "storable fields only" rule governs what materialize _inserts_, not what the catalog may declare.

Default row: `context: {}`, `occurrence_count: 1`, `galleryIdentity: null`, fixed `raised_at`. `context` is `{}` and never `null` because `admin_alerts.context` is `jsonb not null`; a null default would be gallery-legal but un-insertable, diverging exactly where §3.3 forbids.

Codes whose rendered content depends on context need an override. **Each row below names the storable context key, not the derived field** (R1 #9 — the previous revision listed `crewName`/`messageParams`/`identityText`, which are derived and unauthorable):

| Code                                                | Storable input required                                                                                                                                                                                       | Derived consequence                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TILE_PROJECTION_FETCH_FAILED`                      | `context.failedKeys: string[]`                                                                                                                                                                                | `readFailedKeys` (`lib/admin/attentionItems.ts:233-236`) returns null for any other code or a non-array                                                                                                                                                         |
| `SHOW_FIRST_PUBLISHED`                              | `context.data_gaps = { total: <number greater than 0>, classes: Record<GapCode, number> }`, keys from `GAP_CLASSES` (`lib/parser/dataGaps.ts:30`)                                                             | `readDataGapsDigest` (`lib/admin/attentionItems.ts:191-207`) returns null unless `data_gaps` is an object, `total` is a number greater than zero, and `classes` is an object; missing per-class counts coerce to 0                                              |
| `PARSE_ERROR_LAST_GOOD`                             | `context.error_code` ∈ `PARSE_FAILURE_ALLOWLIST`                                                                                                                                                              | `readErrorCode` (`lib/admin/attentionItems.ts:242-246`) drops anything else                                                                                                                                                                                     |
| `ROLE_FLAGS_NOTICE`                                 | `context.role_change_crew_names: [string]` (exactly one element, non-blank after trim) **and** `context.role_change_count: 1`                                                                                 | `crewNameFor` (`lib/adminAlerts/fetchPerShowAlerts.ts:63-68`) returns the single name from the **projected context alone**. No identity is consulted, so this code is fully reproducible in both consumers                                                      |
| `AMBIGUOUS_EMAIL_BINDING`, `OAUTH_IDENTITY_CLAIMED` | `context.crew_member_id` matching `UUID_RE` (`lib/adminAlerts/projectIdentityContext.ts:16`) so the resolver has a target, **plus** `galleryIdentity` carrying exactly one `segments` entry labelled `"Crew"` | `crewNameFor` (`lib/adminAlerts/fetchPerShowAlerts.ts:69-72`) reads the **resolved identity's** single `"Crew"` segment; `crewKey` binds only when it yields a name (`lib/admin/attentionItems.ts:255-256`). These two are the identity-dependent codes of §3.3 |

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

| Field                                                      | Value                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`                                                     | the enumerated code                                                                                                                                                                                                                                                                                                                                                                                                              |
| `severity`                                                 | `"warn"` — the card surface is the warn-severity surface; `info` rows render elsewhere and are out of scope                                                                                                                                                                                                                                                                                                                      |
| `message`                                                  | fixed synthetic prose that does **not** contain the raw code — e.g. `"Synthetic warning for gallery review."`. The raw code must not appear here: `message` is rendered card copy, which §1.1's exception explicitly excludes, and warnings are materialized **verbatim**, so a code embedded here would leak into the real modal too (R2a). Distinguishing synthetic from authentic is the readout's job (§4.1), not the card's |
| `blockRef`, `rawSnippet`, `roleToken`, resolution payloads | **absent by default.** Optional fields are set only by the per-code override table below, keeping `exactOptionalPropertyTypes` satisfied and absence meaningful                                                                                                                                                                                                                                                                  |

Per-code overrides, where absence changes the rendered card (R2a: the previous revision promised this table and omitted it):

| Code                          | Required field             | Shape                                                                                                                     |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `UNKNOWN_ROLE_TOKEN`          | `roleToken`                | the canonical role token that failed lookup; absence discriminates on every other code (`lib/parser/types.ts`)            |
| `ROOM_HEADER_SPLIT_AMBIGUOUS` | use-raw resolution payload | `{ resolvable: true, replacement: { kind: "rooms", name, dimensions: null, floor: null } }` (`lib/parser/types.ts:41`)    |
| `HOTEL_GUEST_SPLIT_AMBIGUOUS` | use-raw resolution payload | `{ resolvable: true, replacement: { kind: "hotels", names: [string], confirmationNo: null } }` (`lib/parser/types.ts:42`) |
| `DATE_ORDER_SUGGESTS_DMY`     | use-raw resolution payload | `{ resolvable: true, replacement: { kind: "dates", dmyDates } }` (`lib/parser/types.ts:43`)                               |

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

The database stores less than the modal renders. `fetchPerShowAlerts` selects only `id, code, context, raised_at, occurrence_count` (`lib/adminAlerts/fetchPerShowAlerts.ts:100`) and **derives** `identityText`, `messageParams`, `crewName` (`lib/adminAlerts/fetchPerShowAlerts.ts:169-172`) from `context` plus a resolved `AlertIdentity`. `FeedEntry` (`lib/sync/holds/types.ts:60-77`) is likewise derived by `readShowChangeFeed` from `sync_holds` rows; its `summary` is generated from the disposition, not authored.

| Field                                                                                                                            | Stored?                      | Gallery                                                   | Materialize                                      | Divergence                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`, `context`, `raised_at`, `occurrence_count`                                                                               | yes                          | verbatim                                                  | inserted verbatim                                | none                                                                                                                                                                                                                                                                                                                                                                                                            |
| `identityText`, `messageParams`, `crewName` — **context-only codes** (incl. `ROLE_FLAGS_NOTICE`)                                 | derived                      | shared function                                           | shared function                                  | none by construction                                                                                                                                                                                                                                                                                                                                                                                            |
| `identityText`, `messageParams`, `crewName` — **identity-dependent codes** (`AMBIGUOUS_EMAIL_BINDING`, `OAUTH_IDENTITY_CLAIMED`) | derived                      | shared function, given the **declared** `galleryIdentity` | shared function, given the **resolved** identity | **inherits the identity row's divergence** — if the target show has no matching crew row, materialize yields no `"Crew"` segment, so `crewName` is null, `crewKey` does not bind, and the card routes to the crew section top rather than a crew row. The gallery shows the bound state. (R2a: the previous revision claimed "none by construction" for all three fields, which was false for these two codes.) |
| `AlertIdentity`                                                                                                                  | resolved from real crew rows | **declared**                                              | **resolved**                                     | inherent, labelled (below)                                                                                                                                                                                                                                                                                                                                                                                      |
| hold `summary`, `action`, `status`                                                                                               | derived                      | shared shaping                                            | shared shaping                                   | none by construction                                                                                                                                                                                                                                                                                                                                                                                            |
| `ParseWarning[]`                                                                                                                 | yes, jsonb                   | verbatim                                                  | written verbatim                                 | none                                                                                                                                                                                                                                                                                                                                                                                                            |

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

### 3.6 Catalog validation is executable, not prose

Both R1 (#25) and R2a (#12) reported the same class: catalog and input guards enumerated incompletely. A third prose enumeration would fail the same way, so the guard contract is **code**: `validateScenario(s): ValidationError[]`, run over the whole catalog by a test (§12) and at module load in development.

| Field                       | Rule                                                                                                                                                                                                                                      | On violation                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `id`                        | matches `^[a-z0-9][a-z0-9-]{2,47}$`; unique across the catalog                                                                                                                                                                            | reject                         |
| `label`                     | non-empty after trim                                                                                                                                                                                                                      | reject                         |
| `tier`                      | `1 \| 2 \| 3`                                                                                                                                                                                                                             | reject                         |
| `bucket`, `degraded`        | present only when `tier === 2`                                                                                                                                                                                                            | reject                         |
| `alerts`, `holds`           | arrays, possibly empty; a scenario with no alerts, no holds, and no `warnings` is rejected for materialize (§5.3) but **legal** in the gallery as the empty-state scenario                                                                | reject only the non-array case |
| `alerts[].code`             | non-empty; matches `^[A-Z][A-Z0-9_]*$`; no duplicate code within a scenario (§5.1a)                                                                                                                                                       | reject                         |
| `alerts[].context`          | a plain object, never null or an array; must not contain the reserved `__devScenario` key (§5.1b)                                                                                                                                         | reject                         |
| `alerts[].raised_at`        | parses to a finite `Date`                                                                                                                                                                                                                 | reject                         |
| `alerts[].occurrence_count` | integer, finite, `>= 1` — excludes 0, negative, fractional, `NaN`, `Infinity`                                                                                                                                                             | reject                         |
| `alerts[].galleryIdentity`  | absent, `null`, or an object with a `segments` array                                                                                                                                                                                      | reject other shapes            |
| `holds[]`                   | `domain` and `kind` in their CHECK sets; `entity_key` and `drive_file_id` non-empty after trim; `base_modified_time` parses; `proposed_value.disposition` in the CHECK set; no duplicate `(domain, entity_key)` within a scenario (§3.0a) | reject                         |
| `warnings[]`                | when present, every element has a non-empty `code` and a `severity` of `"warn"`                                                                                                                                                           | reject                         |

"Reject" means the catalog is invalid and the test fails — a malformed scenario never reaches either consumer. The gallery therefore renders only valid scenarios, which is why §4 specifies rendering behavior rather than per-field malformed-input behavior: the malformed cases are unreachable by construction.

**`ScenarioBlock`'s props are a separate boundary** and are not covered by this validator, because they are produced by the page from already-valid scenarios rather than authored. Its contract is the prop list in §4.0; each optional prop states its absent behavior there.
