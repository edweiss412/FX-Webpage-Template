# Attention scenario gallery + materialize — design

**Date:** 2026-07-20
**Branch:** `feat/attention-scenario-gallery`
**Status:** draft (pending cross-model adversarial review)

---

## 1. Problem

The admin show modal's attention surface — alert pills, section banners, compact alert cards, parse-warning cards — is only observable when live sheet data or an operator action happens to raise the underlying row. Most of the 45 registered alert codes and 43 parse-warning codes never fire against the test shows, so their copy, routing, tone, and layout are unverified by eye. The existing unit and meta tests pin *structure* (routing totality, no-drop, copy parity) but nothing renders the surface for a human.

Two distinct gaps:

1. **No sweep.** There is no way to see every state at once and judge copy/layout/routing.
2. **No drive.** There is no way to put a chosen state in front of the real modal, at the real URL, with working buttons.

This design closes both from one catalog.

## 1.1 Resolved scope — do not relitigate

These were decided during brainstorming. Cite the ratification before re-opening.

| Decision | Ratification |
| --- | --- |
| Gallery renders **T1 + T2 only**; T3 composites are materialize-only. Duplicating a full `get_admin_show_review_snapshot` fixture to mount `ShowReviewSurface` was considered and rejected as a drift liability. | §4.3, §5.1 |
| **No CI gate.** No screenshot byte-comparison, no catalog-completeness meta-test. The eyeball tool is the deliverable. Totality is instead achieved structurally (§3.1) so a gate is not needed for the alert axis. | §3.1, §9 |
| **No migration.** Clear regenerates authentic warnings via the existing re-sync path rather than stashing a backup in a new column or table. | §5.4 |
| **No new advisory-lock holder.** Materialize writes only `admin_alerts`, `shows_internal.parse_warnings`, and `sync_holds` — none in the invariant-2 guarded set. The Clear path's re-sync acquires the lock inside existing code (`POST /api/admin/sync/[slug]`), so the single-holder rule is untouched. | §7.2 |
| Gallery **server actions are dead ends by design** (fake alert ids). Client-side affordances are live. Driving actions for real is materialize's job, not the gallery's. | §4.4 |
| The gallery route is **dev-only and absent from the production artifact**, gated by the existing build-time rename mechanism, not by a runtime check alone. | §6 |
| `attention-gallery-full.png` (an earlier ad-hoc screenshot at the repo root) is **discarded**, not folded in. | user decision, 2026-07-20 |

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

`N_ROUTES_OVERVIEW + N_ROUTES_CREW + N_ROUTES_EVENT + N_ROUTES_ROOMS + N_ROUTES_WARNINGS = N_ALERT_CODES` (34+3+3+3+2 = 45).

Cross-check: `ADMIN_ALERTS_CODES` (`tests/messages/adminAlertsRegistry.ts:9`) also has 45 entries and is pinned set-equal to `ATTENTION_ROUTES` by `tests/admin/_metaAttentionRoutes.test.ts`.

## 3. Catalog — the single source of truth

**Module (new file):** `lib/dev/attentionScenarios.ts (new)`

A scenario declares **storable inputs** — the shapes that actually live in the database — never pre-built `AttentionItem`s and never derived read-model shapes. This is the load-bearing constraint of the whole design (§3.3):

```ts
export type AttentionScenario = {
  id: string;                      // stable slug, used as the DB tag and the gallery anchor
  tier: 1 | 2 | 3;
  label: string;
  alerts: ScenarioAlertRow[];      // storable admin_alerts columns only, see below
  holds: ScenarioHoldRow[];        // storable sync_holds columns only, see below
  warnings: ParseWarning[];        // lib/parser/types.ts:48 - stored verbatim as jsonb
  bucket?: Partial<BucketOpts>;    // T2 only: see §4.2
  degraded?: boolean;              // T2 only: see §4.2
};

// Exactly the columns fetchPerShowAlerts selects (lib/adminAlerts/fetchPerShowAlerts.ts:100),
// plus the identity the gallery cannot resolve for synthetic rows (§3.3).
export type ScenarioAlertRow = {
  code: string;
  context: Record<string, unknown>; // NOT NULL in the DDL - use {} not null
  raisedAt: string;
  occurrenceCount: number;
  galleryIdentity?: AlertIdentity | null; // gallery-only; materialize resolves for real
};

// The storable hold shape (lib/sync/holds/types.ts:12-25), not the derived FeedEntry.
export type ScenarioHoldRow = Omit<SyncHold, "id" | "showId">;
```

Both consumers run the **real** `deriveAttentionItems` (`lib/admin/attentionItems.ts:303`) and the **real** `bucketAttention` (`lib/admin/sectionAttention.ts:85`). Nothing hand-builds an `AttentionItem`. Consequence: routing, `tone`, `actionable`, `autoClearNote`, `crewKey` derivation, `safeDougFacingTemplate` fallback, `catalogHelpHref`, `readFailedKeys`, `readDataGapsDigest`, and `readErrorCode` are all exercised for real. The catalog cannot misrepresent routing, because it never states routing.

### 3.1 Alert totality is structural, not listed

T1 alert scenarios are **derived at runtime** from `Object.keys(ATTENTION_ROUTES)`, not hand-listed. A new alert code appears in the gallery the moment its `ATTENTION_ROUTES` row lands — no catalog edit, no drift, and no completeness meta-test needed (which is why §1.1 can decline the gate without accepting drift).

Realistic params come from an override map keyed by code:

```ts
const ALERT_ROW_OVERRIDES: Partial<Record<string, Partial<ScenarioAlertRow>>> = { ... };
```

A code with no override gets a generic default row (`occurrenceCount: 1`, `context: {}`, `galleryIdentity: null`, fixed `raisedAt`). `context` defaults to `{}` and never `null`: `admin_alerts.context` is `jsonb not null` (`supabase/migrations/20260501001000_internal_and_admin.sql`), so a null default would be gallery-legal but un-insertable, and the two consumers would diverge at exactly the point §3.3 forbids.

Codes whose card content depends on context **must** carry an override or the gallery shows their degenerate form:

| Code | Required override | Why |
| --- | --- | --- |
| `TILE_PROJECTION_FETCH_FAILED` | `context.failedKeys: string[]` | `readFailedKeys` (`lib/admin/attentionItems.ts:233-236`) returns null for any other code or a non-array |
| `SHOW_FIRST_PUBLISHED` | `context` shaped for `readDataGapsDigest` | gated on that exact code (`lib/admin/attentionItems.ts:279`) |
| `PARSE_ERROR_LAST_GOOD` | `context.error_code` ∈ `PARSE_FAILURE_ALLOWLIST` | `readErrorCode` (`lib/admin/attentionItems.ts:242-246`) drops anything else |
| `AMBIGUOUS_EMAIL_BINDING`, `OAUTH_IDENTITY_CLAIMED`, `ROLE_FLAGS_NOTICE` | `crewName` | crew-routed codes bind `crewKey` only when `crewName` is set (`lib/admin/attentionItems.ts:255-256`) |

Any code whose catalog `dougFacing` template carries `<placeholder>` tokens needs `messageParams` that fully interpolate, or `safeDougFacingTemplate` returns null and the card falls back — which is itself a state worth seeing, so T2 keeps one deliberate non-interpolating scenario (§4.2).

**Guard — `PICKER_EPOCH_RESET`:** it has an `ATTENTION_ROUTES` row for registry totality but is filtered out in derive. The gallery renders it as an explicit **"cut in derive, renders nothing"** row rather than silently omitting it, so the absence is legible instead of looking like a bug.

### 3.2 Warning totality and its known gap

No single runtime module enumerates the parse-warning universe:

- `INTERNAL_CODE_ENUMS` (`lib/messages/__generated__/internal-code-enums.ts`) is generated, runtime-importable from `lib/`, and yields `N_WARN_ENUM` codes with `source: "parse_warnings.code"`. Its generator (`scripts/extract-internal-code-enums.ts:71-72`) only scans files matching `/\bParseWarning\b|\bwarnings\b|hardErrors/`, so emitters in other files are missed.
- `WARNING_CARD_COPY_CODES` (`tests/messages/warningCardCopyRegistry.ts:4`) has 40 codes but lives under `tests/` — `lib/` must not import it — and is itself not a superset.
- `MESSAGE_CATALOG` (`lib/messages/catalog.ts`) contains all of them but carries no severity or source field to partition on (see e.g. the all-null `TYPO_NORMALIZED` row at `lib/messages/catalog.ts:1709-1718`).

Measured difference between the two registries:

| In copy registry, absent from generated enum (`N_WARN_GAP` = 4) | In generated enum, absent from copy registry (3) |
| --- | --- |
| `AGENDA_SCHEDULE_LOW_CONFIDENCE` (`lib/agenda/extractAgendaSchedule.ts`) | `BLOCK_DISAPPEARED` (`lib/parser/warnings.ts`) |
| `AGENDA_SCHEDULE_TIME_ADJUSTED` (`lib/sync/enrichAgenda.ts`) | `DAY_RESTRICTION_DOUBLE_LOCATION` (`lib/parser/personalization.ts`) |
| `PULL_SHEET_ON_ARCHIVED_TAB` (`lib/sync/pullSheetOverride.ts`) | `TYPO_NORMALIZED` (`lib/parser/blocks/venue.ts`) |
| `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (`lib/sync/pullSheetOverride.ts`) | |

**Decision:** the warning universe is `INTERNAL_CODE_ENUMS` filtered to `parse_warnings.code`, **plus** an explicit `EXTRA_WARNING_CODES` constant holding the `N_WARN_GAP` codes above, each with the `file:line` comment justifying its presence. Total `N_WARN_CODES`. This is mostly self-updating (new codes in scanned files appear free) and honest about the residue.

**Backlog, not in scope:** widen the generator's scan heuristic so `EXTRA_WARNING_CODES` can be deleted. Filed as `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`.

### 3.3 Fidelity contract between the two consumers

The instrument's entire value rests on one property: **what the gallery shows for a scenario is what materialize produces for that scenario.** A catalog field the gallery honors but materialize cannot reproduce is worse than no tool, because it teaches the operator a state that does not exist.

The database stores less than the modal renders. `fetchPerShowAlerts` selects only `id, code, context, raised_at, occurrence_count` (`lib/adminAlerts/fetchPerShowAlerts.ts:100`) and then **derives** `identityText`, `messageParams`, and `crewName` (`lib/adminAlerts/fetchPerShowAlerts.ts:169-172`) from `context` plus a DB-resolved `AlertIdentity`. Likewise `FeedEntry` (`lib/sync/holds/types.ts:60-77`) is derived by `readShowChangeFeed` from `sync_holds` rows; its `summary` is generated from the hold's disposition, not authored.

Therefore the catalog declares **only storable fields** (§3), and each derived field is produced by the same code in both consumers:

| Field | Stored? | Gallery | Materialize | Divergence risk |
| --- | --- | --- | --- | --- |
| `code`, `context`, `raisedAt`, `occurrenceCount` | yes | honored verbatim | inserted verbatim | none |
| `identityText`, `messageParams`, `crewName` | no — derived | shared pure derivation, given `galleryIdentity` | shared pure derivation, given the resolved identity | none, **provided the derivation is one function** (below) |
| `AlertIdentity` itself | no — resolved from real crew rows | **declared** via `galleryIdentity` | **resolved** by `resolveAlertIdentities` | inherent, see below |
| hold `summary`, `action`, `status` | no — derived | shared feed shaping | shared feed shaping | none, same condition |
| `ParseWarning[]` | yes, jsonb | honored verbatim | written verbatim | none |

**Required refactor:** extract the DB-independent tail of `fetchPerShowAlerts` — the `(row, identity) -> { identityText, messageParams, crewName }` step at `lib/adminAlerts/fetchPerShowAlerts.ts:169-172` — into an exported pure function, and have both `fetchPerShowAlerts` and the gallery call it. Same for the `FeedEntry` shaping step in `readShowChangeFeed` (`lib/sync/feed/readShowChangeFeed.ts:286-318`) if it is not already callable in isolation. Without this the fidelity contract is an aspiration; with it, drift is a compile-or-test failure rather than a silent divergence.

**The one inherent divergence:** identity *resolution* needs real crew rows, which synthetic alerts do not have. The gallery therefore takes a declared `galleryIdentity` where materialize resolves the real thing. This is stated, not hidden: the routing readout (§4.1 step 2) labels the identity as `declared (gallery)`, so the operator knows that one field is the instrument's assumption rather than the system's answer.

## 4. Gallery

**Route (new file):** `app/admin/dev/attention-gallery/page.tsx (new)` — Server Component, `export const dynamic = "force-dynamic"`, `requireDeveloper()` at the top, matching the posture of `app/admin/dev/source-link-dim/page.tsx` and `app/admin/dev/telemetry-dim/page.tsx`.

### 4.1 What a scenario block renders

Rendered elements, in order, per scenario — these are actual DOM, not conceptual descriptions:

1. **Heading** — `<h2>` with the scenario `id` as its `id` attribute (deep-linkable anchor) and `label` as text.
2. **Routing readout** — a `<dl>` listing, per derived item: `code`, `kind`, `tone`, `sectionId`, `anchor` (or `—`), `actionable`, `autoClearNote` (or `—`), `template` resolved vs `fallback`. Wrong routing is then legible as text, not merely as a card in the wrong place.
3. **`AttentionMenu`** (`components/admin/showpage/AttentionMenu.tsx:42`) with `items` = derived items, `open` = true so the menu body is visible without a click, `onClose`/`onNavigate` = no-ops, `pillRef` = a local ref.
4. **Bucketed banners** — `bucketAttention(items, opts)` with `renderCard` = `AttentionBanner` (`components/admin/review/AttentionBanner.tsx:91`), one group per bucketed section, each labelled with its `sectionId`.
5. **Hold rows** — rendered separately and labelled as such, because `bucketAttention` deliberately excludes `kind: "hold"` items (`lib/admin/sectionAttention.ts:93-97`); they belong to the Changes feed via `Mi11GateActions`. Omitting them here would misread as a drop.
6. **`PerShowActionableWarnings`** (`components/admin/PerShowActionableWarnings.tsx:47`) with `items` = `scenario.warnings`, `driveFileId` = a fixed fake id, `renderItemControls` omitted, rendered **twice** for tiers where the scenario declares it — once `tone="warning"`, once `tone="muted"` — since the muted skin is the collapsed "Ignored (N)" state and has its own contrast posture.

### 4.2 T2 structural axes

`BucketOpts` (`lib/admin/sectionAttention.ts:30-39`) already exposes the fallback predicates as injectable functions, so T2 drives them directly with no fake show:

| Axis | Mechanism | Expected visible outcome |
| --- | --- | --- |
| Routed section not rendered | `sectionAvailable: () => false` | banner falls back to Overview |
| Anchor slot absent | `anchorAvailable: () => false` | anchored card falls back to its section top |
| Crew key has no rendered row | `crewKeyRendered: () => false` | crew banner goes to the crew section top |
| Alert vs hold | scenario carries only `alerts` / only `holds` | hold appears in the hold group, never a banner |
| Actionable vs auto-clearing | inbox-routed and auto-resolving codes | resolve control absent; `autoClearNote` line present |
| Occurrence 1 vs N | `occurrence_count: 1` / `7` | repeat-count affordance |
| Identity present/absent | `identityText` set / null | `menuSubtitle` present / absent |
| Uncataloged code | code absent from `MESSAGE_CATALOG` | `ATTENTION_FALLBACK_TITLE` (`lib/admin/attentionItems.ts:84`) |
| Unresolved placeholder | params that leave a `<token>` | `template` null, card falls back |
| Item count 0 / 1 / many | scenario item lists | empty state, single, and a menu long enough to exercise scroll |
| Degraded alert read | `degraded: true` | derived items from holds only, plus the degraded pill + Overview notice the loader produces at `app/admin/_showReviewModal.tsx:304-310` |

**Cap:** the "many" scenario is fixed at 12 items. Above that the menu is a scroll container, and 12 is enough to cross the threshold without turning the gallery into a wall. The cap is a named constant in the catalog, referenced by the scenario, not a bare literal.

### 4.3 Tier boundaries

- **T1** — one scenario per alert code (`N_ALERT_CODES`, of which `N_ALERT_RENDERABLE` render) and one per warning code (`N_WARN_CODES`). Copy and routing sweep.
- **T2** — the §4.2 matrix. Structural sweep.
- **T3** — composites. **Rendered by materialize only.** The gallery lists T3 scenarios by `id` and `label` with a note pointing at the dev panel, so they are discoverable but not faked.

### 4.4 Interactivity boundary

Client-side affordances are genuinely live: menu open/close, `?` help popovers (`components/admin/compactAlertHelp.tsx`), expand/collapse, hover, focus rings. Server actions are **not** — alert ids are synthetic, so a resolve submit fails. This is deliberate and stated on the page: a short standing note at the top reading that actions are inert here and that the dev panel materializes a scenario for real interaction.

**Known fidelity caveat:** `AttentionBanner` reads `usePathname()` (`components/admin/review/AttentionBanner.tsx:101`) and feeds it to a route-gated Learn-more link. Under the gallery the pathname is `/admin/dev/attention-gallery`, not the modal route, so that gate evaluates differently than in production. The routing readout (§4.1 step 2) therefore prints the `route` value it passed, making the difference explicit rather than silently misleading.

### 4.5 Controls

Query params only; no client state.

| Param | Values | Effect | Default |
| --- | --- | --- | --- |
| `tier` | `1`, `2` | render only that tier | both |
| `scenario` | scenario `id` | render only that scenario | all |
| `w` | integer px, clamped `[320, 1280]` | wrap each block in a fixed-width column | unconstrained |

Guards: an unparseable or out-of-range `w` falls back to unconstrained; an unknown `scenario` renders an explicit "no such scenario" line listing valid ids, never an empty page; `tier` outside `{1,2}` renders both. A `tier=3` request renders the T3 list from §4.3 with its materialize note.

## 5. Materialize

**Where:** a new card on the existing `/admin/dev` panel (`app/admin/dev/page.tsx`), which is already `requireDeveloper`-gated and build-gated. Controls: scenario select (all three tiers), target show slug, target environment, **Apply** and **Clear**.

### 5.1 Apply writes

| Target | Write | Tag |
| --- | --- | --- |
| `admin_alerts` | insert one row per `scenario.alerts` | `context.__devScenario = "<scenario id>"` |
| `sync_holds` (`lib/sync/holds/holdPort.ts`) | insert one pending row per `scenario.holds` | same key in the row's context/payload |
| `shows_internal.parse_warnings` | overwrite with `scenario.warnings` (`components/admin/review/publishedAdapter.ts:92` reads this column) | not taggable — jsonb array of `ParseWarning`; see §5.4 |

Apply is **idempotent per (show, scenario)**: it first deletes existing rows tagged with that scenario id for that show, then inserts. Re-applying does not accumulate duplicates.

#### 5.1a The one-unresolved-alert-per-code constraint

`admin_alerts` carries a partial unique index (`supabase/migrations/20260501001000_internal_and_admin.sql`):

```sql
create unique index admin_alerts_one_unresolved_idx
  on public.admin_alerts (coalesce(show_id::text, ''), code) where resolved_at is null;
```

**At most one unresolved row per (show, code).** Two consequences the design must honor rather than discover at implementation:

1. **A scenario may not carry two alert rows of the same code.** Enforced in the catalog by construction and asserted by a test (§12); a duplicate would fail the insert at runtime.
2. **A code that already has a real unresolved row on the target show cannot be inserted.** Apply therefore **skips** that code and names it in the result: `skipped: [{ code, reason: "unresolved row already present" }]`. It does **not** resolve, delete, or overwrite the real row — the promise that Apply never touches untagged rows is kept by declining, not by clobbering.

This also settles materialize's scope. The full per-code sweep (T1, `N_ALERT_RENDERABLE` codes) belongs to the gallery, which has no DB and no constraint. Materialize's scenarios are T3 composites carrying a handful of codes, where a skip is rare, visible, and harmless.

### 5.2 Clear

1. Delete every `admin_alerts` row for the show whose `context.__devScenario` is set — **any** scenario, not just the selected one, so a half-applied state cannot strand rows.
2. Delete every correspondingly tagged `sync_holds` row.
3. Trigger `POST /api/admin/sync/[slug]` (the path `ReSyncButton` already uses, `components/admin/ReSyncButton.tsx:243`) to re-parse from source and full-replace `parse_warnings` with authentic content.

Clear reports which of the three steps succeeded.

### 5.3 Guard conditions

| Condition | Behavior |
| --- | --- |
| Show slug not found | refuse, no writes, named error |
| Show archived | refuse — archived shows have their own modal posture and are not the surface under evaluation |
| Scenario id unknown | refuse, no writes |
| Zero tagged rows at Clear | succeed, report "nothing to clear", still run the re-sync |
| Re-sync unreachable (no Drive creds locally) | Clear reports `warnings_not_regenerated`; tagged alert/hold deletion still committed. Synthetic warnings persist until the next successful sync; the operator escape hatch is a reseed. This is the one non-self-healing edge and it is stated in the card's copy. |
| Apply against a show that already has real (untagged) alerts | allowed. Codes that do not collide are inserted; codes whose unresolved row already exists are **skipped and named** in the result (§5.1a). Real rows are never resolved, deleted, or overwritten. |
| Scenario carries duplicate alert codes | rejected before any write, with the duplicate named (§5.1a) |
| Apply interrupted partway | the next Apply or Clear is safe: both are keyed on the `__devScenario` tag, so a partial write is fully addressable. Clear deletes **every** tagged row for the show regardless of which scenario wrote it (§5.2 step 1). |
| Two Applies race on the same show | last writer wins per code; no lock is taken (invariant 2 does not cover these tables, §7.2). Acceptable because materialize is a single-operator dev instrument, never a concurrent surface. Stated rather than defended. |

### 5.4 Why `parse_warnings` is overwritten rather than backed up

A backup would need durable storage: a new column or a new dev table, i.e. a migration plus the `validation-schema-parity` post-migration checklist. Re-sync already regenerates the column authentically from source, so the backup buys nothing that the existing path does not. The cost is the §5.3 unreachable-Drive edge, accepted explicitly.

### 5.5 Environment targeting

Default target is **local**. Validation requires an explicit confirm in the UI **and** a complete `VALIDATION_SUPABASE_URL` + `VALIDATION_SUPABASE_SECRET_KEY` + `VALIDATION_SUPABASE_PROJECT_REF` triple, resolved exclusively from that triple with no fallback to ambient `SUPABASE_URL` / `SUPABASE_SECRET_KEY` — the same guardrail shape the observe CLI uses (AGENTS.md, Telemetry access). A non-loopback ambient `SUPABASE_URL` is refused without the explicit validation confirm. Any missing or invalid member of the triple is a hard error.

Production is never a target: the route does not exist in the production artifact (§6).

## 6. Build-vs-runtime gate

The gate is **build-time**, not runtime. `scripts/with-admin-dev-flag.mjs` renames the files in its `FILES` array (`scripts/with-admin-dev-flag.mjs:43-55`) to `.disabled-by-build-gate` before `next build` whenever `ADMIN_DEV_PANEL_ENABLED` is not the literal `"true"` at invocation time, so the artifact does not contain the route at all. `requireDeveloper()` remains as runtime defense in depth for dev builds where the panel is enabled.

**Files added to `FILES`:** `app/admin/dev/attention-gallery/page.tsx (new)`. The materialize card lives inside the already-registered `app/admin/dev/page.tsx` and `app/admin/dev/actions.ts`, so it inherits their registration.

**Gate test shape (build-time, not runtime):** extend the existing build-artifact assertion (`tests/admin/build-artifact-gate.test.ts`) so a build produced with the flag **unset** contains no reference to the gallery route, and the `FILES`-membership assertion in `tests/admin/withAdminDevFlagDevPanelPresent.test.ts` covers the new path. A runtime probe alone would not prove the artifact claim.

## 7. Invariant compliance

### 7.1 Invariant 10 — mutation surface observability

Two new admin-gated server actions in `app/admin/dev/actions.ts`, mirroring the existing `parseAndStage` / `resetDevSchema` precedent (`tests/log/_auditableMutations.ts:227-230`):

| Action | Code | Registry |
| --- | --- | --- |
| `applyAttentionScenario` | `DEV_SCENARIO_APPLIED` | `AUDITABLE_MUTATIONS` row + success-branch behavioral proof |
| `clearAttentionScenario` | `DEV_SCENARIO_CLEARED` | same |
| their `*FormAction` wrappers | same codes | rows, as the existing wrappers have |

Emits are post-commit via `logAdminOutcome` (`app/admin/dev/actions.ts:74`), outside any lock. No secret is logged: the emitted context carries the scenario id, show slug, and row counts only.

**These codes do NOT take the §12.4 lockstep.** `logAdminOutcome`'s `code` is a free SHOUTY_SNAKE_CASE string (`lib/log/logAdminOutcome.ts:9`), not a `MessageCode`. The existing `DEV_PARSE_STAGED` and `DEV_SCHEMA_RESET` appear only in `app/admin/dev/actions.ts`, `tests/log/_auditableMutations.ts`, and `tests/log/adminOutcomeBehavior.test.ts` — they have **no** master-spec §12.4 row and **no** `lib/messages/catalog.ts` entry. Adding one would put a non-message code into the message catalog and risk the `x1-catalog-parity` gate rather than satisfying it. The registration surface for these two codes is the two test registries and nothing else; no `pnpm gen:spec-codes` run is required by this change.

### 7.2 Invariant 2 — advisory locks

Materialize writes `admin_alerts`, `sync_holds`, and `shows_internal.parse_warnings`. None is in the invariant-2 guarded set (`shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`). The Clear path's re-sync acquires the per-show lock **inside existing code** behind `POST /api/admin/sync/[slug]`. **Holder topology unchanged; no new holder at any layer.**

### 7.3 Invariant 5 — no raw error codes in UI

The gallery's routing readout prints raw codes deliberately — it is a developer instrument behind `requireDeveloper`, and the codes are the subject under inspection, not an error surfaced to an operator. The rendered **cards** still resolve copy through the real catalog path, so the contract holds where it applies. The materialize card's own errors resolve through `lib/messages/lookup.ts`.

### 7.4 Invariant 8 — UI quality gate

The gallery route and the dev-panel card are UI surfaces. `/impeccable critique` and `/impeccable audit` both run on the diff before close-out; P0/P1 fixed or deferred via `DEFERRED.md`.

### 7.5 Invariant 9 — Supabase call boundary

Every Supabase call in the materialize action destructures `{ data, error }`, distinguishes returned from thrown errors, and surfaces infra faults as a typed discriminable result. New call sites either add a row to the relevant registry meta-test or carry an inline `// not-subject-to-meta: <reason>`.

## 8. Dimensional invariants

**N/A — declared explicitly.** The gallery is a vertical flow of blocks with no fixed-height or fixed-width parent containing flex/grid children whose stretch behavior is load-bearing. The `w` param sets a `max-width` on a wrapper, which constrains width only and imposes no parent→child height relationship. The components rendered inside carry their own production styling and their own dimensional coverage where they have it. No real-browser layout task is required by this change.

## 9. Transition inventory

**Scope boundary:** this change adds no new animated component. The transitions inside `AttentionMenu`, `AttentionBanner`, and `CompactAlertCard` are pre-existing and already covered (`tests/components/admin/compactAlertCompoundTransitions.test.tsx`, `tests/components/admin/transitionAudit.test.tsx`).

The gallery's own states are two, and both are server-rendered navigations, not animated state changes:

| From | To | Treatment |
| --- | --- | --- |
| full list | filtered (`tier` / `scenario` / `w`) | instant — a server navigation, no animation needed |
| filtered | full list | instant — same |

No `AnimatePresence`, no ternary-rendered animated branch, is introduced.

## 10. Flag lifecycle

| Flag / field | Storage | Write path | Read path | Effect on output |
| --- | --- | --- | --- | --- |
| `ADMIN_DEV_PANEL_ENABLED` | env at build invocation | operator / CI env | `scripts/with-admin-dev-flag.mjs` | not `"true"` → route files renamed aside → route absent from artifact |
| `tier` | URL query | user | gallery page | restricts rendered tiers (§4.5) |
| `scenario` | URL query | user | gallery page | restricts to one scenario (§4.5) |
| `w` | URL query | user | gallery page | wrapper `max-width` (§4.5) |
| `scenario.degraded` | catalog literal | catalog author | gallery page | renders the degraded pill + Overview notice branch |
| `context.__devScenario` | `admin_alerts.context` jsonb | Apply | Clear | scopes deletion to synthetic rows |
| target environment | form field | user | materialize action | selects local vs validation client (§5.5) |

No column is empty; no zombie flag introduced.

## 11. DB completeness matrix

| Layer | `admin_alerts` | `sync_holds` | `shows_internal.parse_warnings` |
| --- | --- | --- | --- |
| Table DDL | N/A — no change | N/A — no change | N/A — no change |
| Inline CHECK | N/A — no new code values; existing rows only | N/A | N/A |
| Migration | **None.** No schema change in this design (§1.1). | None | None |
| RPC read path | unchanged — `fetchPerShowAlerts` | unchanged — `readShowChangeFeed` | unchanged — snapshot RPC |
| RPC write path | direct insert/delete from the dev action, service-role client | direct insert/delete via `holdPort` | direct update |
| Propagation trigger | N/A — none on these columns | N/A | N/A |
| Cleanup | Clear, tag-scoped (§5.2) | Clear, tag-scoped | re-sync regeneration (§5.2) |
| Frontend | gallery + dev-panel card | gallery hold group + card | `PerShowActionableWarnings` |
| Tests | §12 | §12 | §12 |

## 12. Meta-test inventory

**Extends:**
- `tests/log/_auditableMutations.ts` — two `AUDITABLE_MUTATIONS` rows plus their `*FormAction` rows (§7.1).
- `tests/log/adminOutcomeBehavior.test.ts` — success-branch behavioral proof for both actions.
- `tests/admin/withAdminDevFlagDevPanelPresent.test.ts` and `tests/admin/build-artifact-gate.test.ts` — the new route path (§6).

**Creates:** none.

**Explicitly declined:** a catalog-completeness meta-test. The alert axis needs none (totality is structural, §3.1); the warning axis has a stated, enumerated residue (§3.2) whose closure is a backlog item, not a gate.

**New behavioral tests (not meta):**
- `deriveAttentionItems` over every catalog scenario returns items whose `sectionId` matches `ATTENTION_ROUTES` — reusing the catalog as fixture data. Failure mode caught: a scenario whose override params make a code derive to an unexpected section.
- Apply → Clear round trip leaves **zero** rows tagged `__devScenario` for the show, asserted by counting tagged rows directly against the DB, not by trusting the action's own report. Failure mode caught: a Clear that deletes only the selected scenario's rows and strands the rest.
- Apply twice with the same (show, scenario) yields the same row count as applying once. Failure mode caught: non-idempotent insert accumulating duplicates.
- Guard cases from §5.3 (unknown slug, archived show, unknown scenario id) commit no writes — asserted by row counts before and after, not by the returned error alone.
- **No scenario carries two alert rows of the same code** (§5.1a). Asserted across the whole catalog, not a sampled scenario. Failure mode caught: a catalog addition that renders fine in the gallery and fails the unique index the first time anyone materializes it.
- **Apply skips a colliding code and names it.** Seed a real unresolved alert of code C on the target show, apply a scenario containing C plus a non-colliding code D. Assert: D inserted, C reported in `skipped`, and the pre-existing C row is **byte-identical afterward** — same `id`, `raised_at`, `occurrence_count`, `resolved_at`. Failure mode caught: an Apply that "handles" the collision by resolving or overwriting the operator's real alert.
- **Fidelity contract (§3.3).** For a scenario applied to the DB, the derived fields the gallery computes (`identityText`, `messageParams`, `crewName`) equal the fields `fetchPerShowAlerts` returns for the same row, given the same identity. Asserted against the two call paths' outputs, not against a hand-written expectation, so the test fails if the shared derivation is forked. Failure mode caught: the gallery and the real modal rendering different copy for the same scenario — the one failure that makes the whole instrument misleading rather than merely incomplete.

## 13. Out of scope

- Screenshot regression gate, byte-compared baselines, and the Docker/arch pinning they require (§1.1).
- Rendering T3 composites in the gallery (§1.1, §4.3).
- Widening the internal-code-enum generator's scan heuristic (§3.2, backlog).
- Any change to the production show modal, its components, or their behavior. This design **adds** dev surfaces and touches no production render path.
- Making gallery server actions functional (§4.4).
