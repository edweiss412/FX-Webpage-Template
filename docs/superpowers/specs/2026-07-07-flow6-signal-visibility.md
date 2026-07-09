# Flow 6 — Notice something broke: signal visibility + email-deliverability

**Date:** 2026-07-07
**Slug:** `flow6-signal-visibility`
**Audit source:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §6 Flow 6 (grade C+ → A−).
**Working base:** `origin/main` @ `45251ddd8`.

## 0. Problem & thesis

Flow 6 of the preparedness audit: "a Doug who never opens the app still learns about failures and drift within a day." The audit's Flow 6 has four items. This spec covers the three buildable ones (6.1 is a raw secret the operator sets, out of scope for code):

- **6.3** — `*_AUTOCORRECTED` codes are excluded from every operator count surface. Ten wrong canonicalizations = badge total 0. And the published-show regression gate misses real drift (3→7 unreadable fields per sync auto-applies without a push).
- **6.4** — a genuine venue-geocode failure is fully silent (`enrichVenueGeocode.ts:98-101` returns on `res.error` with no signal). The crew page falls back to the address; nobody is told the city lookup failed.
- **6.2** — the daily digest (`lib/notify/digest.ts`) mirrors only the needs-attention stream (staged ingestions/syncs). The audit's "pull-only band" — new data gaps, autocorrects applied, auto-applied roster changes, sub-threshold drift — is entirely absent from it.

### Scope split (sequencing)

| Part | Items | Ships | Gate |
|---|---|---|---|
| **Part 1** | 6.3 + 6.4 | This PR, now | Independent of all inflight work |
| **Part 2** | 6.2 digest band | Follow-on PR | **Blocked on `feat/flow4-auto-applied-strip` merging** — the digest's "auto-applied roster changes" sub-band consumes that branch's `roster_shift_counts` RPC |

Part 2 is **specified here** (§5) so the design is ratified as one coherent Flow 6, but its implementation plan and PR are deferred until Flow 4 lands. Part 1's tasks (§3, §4) are the only ones executed in this arc.

## 1. Non-goals

- **6.1 Resend key / recipient** — operator sets `RESEND_API_KEY` + `EMAIL_FROM` (secrets). No code.
- **Autocorrect push alerts.** Autocorrects surface in-app (chip) + digest only; they never trip the hard `RESYNC_QUALITY_REGRESSED` push alert (avoids alert-spam on ten benign canonicalizations — audit §6.3).
- **Geocode retry/queue.** 6.4 is signal-only. The existing breaker + cache self-heal path is unchanged; we add one warning on the `res.error` branch, nothing else.
- **`AGENDA_SCHEDULE_TIME_ADJUSTED` / `AGENDA_SCHEDULE_LOW_CONFIDENCE`.** These are `warn`-severity benign codes (`tests/parser/dataGapsClassCompleteness.test.ts` BENIGN_WARN_CODES) but are NOT `*_AUTOCORRECTED`. The audit item is specifically autocorrects; the auto-fixed sibling scopes to the five `*_AUTOCORRECTED` codes only. Extending to the agenda codes is a documented follow-on (§7).
- **New tables / RPCs / advisory-lock surfaces in Part 1.** Part 1 is pure lib + catalog + one component + meta-tests. No DB migration.

## 2. Live-code citations (verified against the worktree @ `45251ddd8`)

| Concept | Location | Fact |
|---|---|---|
| Data-gap registry | `lib/parser/dataGaps.ts:30-56` | `GAP_CLASSES` — 25 entries `{code,label}`; drives `GapCode` union, `summarizeDataGaps`, badge/chip/digest. |
| Gap summary | `lib/parser/dataGaps.ts:60-63,88-103` | `DataGapsSummary = {total, classes: Record<GapCode,number>}`; `summarizeDataGaps` skips `severity:"info"`, counts `warn` codes in `DATA_GAP_CODES`. |
| Regression gate | `lib/parser/dataGaps.ts:110-118` | `isQualityRegression(prior,next)` — fires on new-class (0→>0) OR (n−p≥5 AND n≥p·1.5). Loops `GAP_CLASSES`. |
| Recovery gate | `lib/parser/dataGaps.ts:125-133` | `hasRecoveredToBaseline(baseline,current)` — loops `GAP_CLASSES`. |
| Gate function | `lib/sync/runScheduledCronSync.ts:299-359` | `evaluateQualityRegression_unlocked`. Guard L309 `if (!showId || priorParseWarningsRaw === null) return; // not published`. Calls `isQualityRegression` L327, `hasRecoveredToBaseline` L336, `buildRegressionPayload` L259/331/341. |
| Gate call sites (2) | cron applied epilogue `runScheduledCronSync.ts:3429` (real prior snapshot → tuned rule runs); first-seen retry `runManualStageForFirstSeen.ts:139` passes `priorParseWarningsRaw: null` → L309 early-returns. **The tuned rule only ever executes from the cron epilogue**; both tails kept structurally identical by `_phase2ArgsParityContract`. |
| The five autocorrect codes | `blocks/crew.ts:345` (STAGE_WORD), `personalization.ts:369` (ROLE_TOKEN), `blocks/crew.ts:148` (COLUMN_HEADER), `sectionHeaderNormalize.ts:128` (SECTION_HEADER), `blocks/client.ts:200` (FIELD_LABEL) | all `severity:"warn"`, all suffixed `_AUTOCORRECTED`; no sixth exists. |
| ParseWarning type | `lib/parser/types.ts:7` | `{severity:"info"\|"warn", code, message, blockRef?, rawSnippet?, sourceCell?}`. `ParseResult.warnings` is a mutable `ParseWarning[]`. |
| Geocode enrich | `lib/sync/enrichVenueGeocode.ts:68-111` | `enrichVenueGeocode(result, deps)`; `res.error` branch L98-101 `recordGeocodeFailure(); return;` — silent. Single caller `lib/sync/enrichWithDrivePins.ts:423` `await enrichVenueGeocode(result)`; has `result.warnings`. |
| Badge | `components/admin/DataQualityBadge.tsx:9-32` | reads `DataGapsSummary`; renders amber `TriangleAlert` iff `total>0`; aria-label from `formatDataGapBreakdown`. |
| Chip | `components/admin/ShowsTable.tsx:241-257` | `DataGapsChip` — amber pill "N data gap(s)", `total>0` gate. |
| Dashboard read | `components/admin/Dashboard.tsx` | `readDataGaps` async → `Map<string,DataGapsSummary>` by show. |
| Partition meta-test | `tests/parser/dataGapsClassCompleteness.test.ts:38-74` | `ALL_PERSISTED_WARNING_CODES` = **45** = 25 gap + 7 benign-warn (5 autocorrect + 2 agenda) + 2 benign-info + 11 asset. `BENIGN_WARN_CODES` holds the 5 autocorrects. |
| Catalog row shape | `lib/messages/catalog.ts:1177-1189` (UNKNOWN_ROLE_TOKEN) | `{code, dougFacing, crewFacing, followUp, helpfulContext, title, longExplanation, helpHref}`. Severity/audience live in the §12.4 spec table (generated). No geocode code exists in catalog or spec. |
| Code generators | `scripts/extract-spec-codes.ts` (spec §12.4 → `lib/messages/__generated__/spec-codes.ts`); `scripts/extract-internal-code-enums.ts` (catalog → `internal-code-enums.ts`) | `pnpm gen:spec-codes`, `pnpm gen:internal-code-enums`. |
| Flow-4 dependency (Part 2) | `feat/flow4-auto-applied-strip` migration | `roster_shift_counts(p_show_ids uuid[]) → (show_id, added, removed, renamed)`, service_role-only, counts unacknowledged `auto_apply` `crew_added/removed/renamed` in `show_change_log`. NOT on main. |

## 3. Part 1 — 6.3 autocorrect visibility + tuned gate

### 3.1 `AUTO_FIX_CLASSES` registry + `summarizeAutoFixes` (`lib/parser/dataGaps.ts`)

New sibling registry, parallel to `GAP_CLASSES`, single-sourcing the five codes and their plain labels (invariant 5 — never the raw code):

```ts
export const AUTO_FIX_CLASSES = [
  { code: "STAGE_WORD_AUTOCORRECTED",    label: "corrected stage word" },
  { code: "ROLE_TOKEN_AUTOCORRECTED",    label: "corrected role" },
  { code: "COLUMN_HEADER_AUTOCORRECTED", label: "corrected column header" },
  { code: "SECTION_HEADER_AUTOCORRECTED",label: "corrected section header" },
  { code: "FIELD_LABEL_AUTOCORRECTED",   label: "corrected field label" },
] as const;
export type AutoFixCode = (typeof AUTO_FIX_CLASSES)[number]["code"];
export type AutoFixSummary = { total: number; classes: Record<AutoFixCode, number> };
export function summarizeAutoFixes(warnings): AutoFixSummary
```

`summarizeAutoFixes` mirrors `summarizeDataGaps`: skip `severity:"info"` (defensive — these are all `warn`), count only `AUTO_FIX_CODES` members, `null`/`undefined`/`[]` → `{total:0}`. A companion `formatAutoFixBreakdown` (cap 4, "+N more") mirrors `formatDataGapBreakdown` so the hover title is bounded.

**Guard conditions.** `null`/`undefined`/empty warnings → `{total:0, classes: allZero}`. A warning whose code isn't one of the five → uncounted. `severity:"info"` autocorrect (none exist today) → skipped. Same fail-safe posture as `summarizeDataGaps`.

**Rationale for a separate type (not an `autoFixed` field on `DataGapsSummary`).** `DataGapsSummary` is consumed by ~8 surfaces with exact-`toEqual` tests (`Dashboard`, `StagedReviewCard`, `DataQualityBadge`, `ShowsTable`, `PerShowAlertSection`, `showDisplay`, `runScheduledCronSync`, `rescanDecision`). Adding an optional field breaks every exact assertion (memory: enriching a shape breaks exact `toEqual`; `?:` is absent-not-undefined). A parallel type isolates the change.

### 3.2 Neutral "N auto-fixed" sibling pill (`components/admin/ShowsTable.tsx`)

A new `AutoFixChip` rendered adjacent to `DataGapsChip` in the same Held-shows row-action bar. **Visually distinct** from the amber gap chip — this is benign-positive ("we fixed it"), NOT a warning:

- Neutral token colors (e.g. `border-border`, `text-muted-foreground`, a neutral dot) — NOT `status-warn`.
- Text: "N auto-fixed"; `total===1` → "1 auto-fixed" (no plural distinction needed — "auto-fixed" is an adjective).
- Hover `title` = `formatAutoFixBreakdown(summary)`.
- `total===0` / `undefined` → renders `null` (instant, no animation — matches `DataGapsChip` §4.2 contract).
- `data-testid={`shows-auto-fixed-chip-${slug}`}`.

The Dashboard `readDataGaps` path (`components/admin/Dashboard.tsx`) **already fetches each show's `parse_warnings` rows** to build the gap summary. `summarizeAutoFixes` is computed from that **same in-memory warnings array** — the read is extended to return both summaries from one fetch, **NOT** a second query. **No new Supabase call site is introduced** (resolves the §6 "no new Supabase boundary" contract — invariant 9 is not triggered because no new `.select` boundary exists). `ShowsTable` receives an `autoFixes?: AutoFixSummary` per row alongside `dataGaps`. Prop is optional; absent → chip hidden.

**Mode boundary.** The auto-fixed chip appears ONLY where `DataGapsChip` appears today (Held-shows row-action bar). It does NOT appear on the crew-facing surface, the wizard Step-3 card, or the archived rows unless those already render `DataGapsChip` (they do not get the new chip in Part 1 — documented scope).

**Guard conditions (props).** `autoFixes` null/undefined → hidden. `autoFixes.total===0` → hidden. Non-null with total>0 → rendered.

### 3.3 Tuned published-show regression gate (`lib/parser/dataGaps.ts:110-118`)

`isQualityRegression` is called from exactly one site whose L309 guard already restricts it to published-equivalent shows (existing show + a non-null prior warnings snapshot). So the tuned rule needs **no new `published` param** — the caller's guard is the publish gate.

**Single-source the per-class predicate (closes a fire-vs-payload drift the tuning would otherwise introduce).** `isQualityRegression` (the fire decision) and `buildRegressionPayload` (`runScheduledCronSync.ts:259`, the "why it fired" payload — `new_classes` / `worsened`) currently duplicate the classification logic. If only `isQualityRegression` adopts the tuned rule, a 3→7 class would *fire* but appear in neither `new_classes` nor `worsened` (that list uses `n−p≥5 AND n≥p·1.5`), leaving the Bell/per-show copy with an empty reason. Fix: extract one exported predicate

```ts
export function regressionKind(p: number, n: number): "new" | "worsened" | null {
  if (p === 0 && n > 0) return "new";
  if (p > 0 && (n - p >= REGRESSION_ABS_JUMP ||
               (n >= p * REGRESSION_REL_FACTOR && n - p >= REGRESSION_REL_ABS_FLOOR))) return "worsened";
  return null;
}
```

- `isQualityRegression` → fires iff any non-gate-exempt class has `regressionKind(p,n) !== null`.
- `buildRegressionPayload` → `new_classes`/`worsened` derived from `regressionKind` (same skip for `gateExempt`). Both now share one rule and cannot drift.

The `≥2` absolute floor suppresses the 1→2 (+100%) noise the audit flagged while catching the 3→7 (+133%, +4 abs) drift the current AND-gate misses. `hasRecoveredToBaseline` is unchanged (recovery is still "every class at-or-below baseline" — asymmetric hysteresis is intentional, `dataGaps.ts:120-133`).

**Numeric single-source.** The three literals `5`, `1.5`, `2` are defined once as named consts at the top of `dataGaps.ts` (`REGRESSION_ABS_JUMP=5`, `REGRESSION_REL_FACTOR=1.5`, `REGRESSION_REL_ABS_FLOOR=2`) and referenced only by `regressionKind`; the test section derives expected outcomes from those consts, never hardcodes.

**Guard conditions.** `p===0, n===0` → no fire. `p===0, n>0` → fire (new class). `p>0, n<p` (recovery) → no fire. `p===4, n===5` → `+1<5`, `5≥6`? no → no fire (correctly, small drift). `p===3, n===7` → `+4<5` but `7≥4.5 AND +4≥2` → fire. `p===1, n===2` → `+1<5`, `2≥1.5 AND +1≥2`? `+1<2` → **no fire** (noise suppressed). `p===2, n===3` → `+1<5`, `3≥3 AND +1≥2`? no → no fire. `p===2, n===4` → `+2<5`, `4≥3 AND +2≥2` → fire.

### 3.4 Autocorrects in the digest (Part 2 hook)

The digest's autocorrect band is Part 2 (§5). Part 1 ships only the in-app chip + `summarizeAutoFixes` helper; Part 2 reuses that helper. No digest change in Part 1.

## 4. Part 1 — 6.4 geocode-failure signal

### 4.1 New code `VENUE_GEOCODE_UNRESOLVED`

A new `warn`-severity §12.4 code. Three-way lockstep (cross-cutting discipline "§12.4 catalog row edits require three lockstep updates"):

1. **Spec §12.4** row in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` — severity `warn`, audience Doug (admin), crewFacing null.
2. `pnpm gen:spec-codes` → regenerates `lib/messages/__generated__/spec-codes.ts`.
3. **Catalog** row in `lib/messages/catalog.ts` (full shape per §2). Then `pnpm gen:internal-code-enums`.

**Copy (honest about transience — must not blame Doug for a Google outage).**
- `dougFacing`: "We couldn't automatically look up the city for _<venue>_, so the crew page shows the venue address instead of a city name. This often clears on the next sync; if it sticks, double-check the venue address in the sheet."
- `crewFacing`: null.
- `followUp`: "Doug → optional fix (auto-retries)".
- `title`: "Couldn't look up the venue city".
- `helpHref`: `/help/errors#VENUE_GEOCODE_UNRESOLVED`.

Downstream §12.4 fan-out (from memory "new §12.4 code = 4 more CI gates"): x1 catalog-parity, x2 gen:internal-code-enums, help `_families` mapping (`app/help/errors/_families.ts` — the partition meta-test imports `familyFor`, so the new code needs a family), and the full `tests/messages/` suite. All run before push.

### 4.2 `GAP_CLASSES` gains the code with `gateExempt: true`

`GAP_CLASSES` entry (25→26): `{ code: "VENUE_GEOCODE_UNRESOLVED", label: "unresolved venue location", gateExempt: true }`. The `gateExempt` optional flag is a new first-class field on the registry (all existing 25 omit it → `undefined` → gated as today).

`gateExempt` is honored in the three GAP_CLASSES iterators so a transient outage NEVER pushes an alert:

- `isQualityRegression` — `for (const c of GAP_CLASSES) { if (c.gateExempt) continue; if (regressionKind(p,n)) return true; }`.
- `hasRecoveredToBaseline` — same skip (a gate-exempt class never opens an alert, so it must not affect recovery).
- `buildRegressionPayload` (`runScheduledCronSync.ts:259`) — same skip, and its `breakdown[code]` line also skips gate-exempt (never list a gate-exempt class in the push payload/breakdown).

`summarizeDataGaps` / badge / chip / digest do **NOT** skip it — it counts toward `total`, so the amber badge + chip show "unresolved venue location" automatically (audit's "badge-visible" requirement, satisfied with zero component edits).

**Flag lifecycle table (`gateExempt`).**

| Field | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| `gateExempt` | literal on the `GAP_CLASSES` entry (`lib/parser/dataGaps.ts`) | authored in the registry only | the 3 gate iterators | class counts on badge/chip/digest but is skipped by the push-alert regression/recovery/payload logic |

Not a zombie flag: every column filled.

### 4.2a New-`GapCode` shape ripple (enumerate — same class as `CREW_COLUMN_POSITIONAL_FALLBACK` 24→25)

Adding a 26th `GAP_CLASSES` entry adds a key to the `Record<GapCode, number>` that `zeroClasses()` / `summarizeDataGaps` produce. Every surface asserting an **exact** `DataGapsSummary.classes` shape shifts by one key. Enumerated (verified consumers, §2 + Codex R2 sweep):

- **`summarizeDataGaps` output** — now carries `VENUE_GEOCODE_UNRESOLVED: 0` in the zeroed record. Any test doing `expect(summary).toEqual({...})` on a full summary must add the key. Expected + mechanical.
- **Alert-context `baseline`** (`runScheduledCronSync.ts:332` stores `baseline: prior`, a full `DataGapsSummary`) — the persisted `admin_alerts.context.baseline` now includes the geocode key. `gateExempt` keeps geocode OUT of `buildRegressionPayload.breakdown`/`new_classes`/`worsened` (§4.2), so the **push payload** is unchanged; only the stored `baseline` snapshot gains a zero-key. Any exact-shape test on the alert context updates.
- **`hasRecoveredToBaseline`** iterates `GAP_CLASSES` with the `gateExempt` skip → geocode never blocks recovery (a gate-exempt class that only ever holds a badge count must not keep the alert open).
- **`PerShowAlertSection` `data_gaps` digest** (`components/admin/PerShowAlertSection.tsx:77` reads `context.data_gaps`) — renders the geocode count when present (desired: badge/panel visibility). No shape break (reads by key, not exact `toEqual`).
- **Partition meta-test** — §6 (`ALL_PERSISTED_WARNING_CODES` 45→46, `DATA_GAP_CODES` 25→26; the test literally asserts `.size` at `dataGapsClassCompleteness.test.ts:202,206`).

No consumer reads geocode as an *operator-actionable* gap (it is not in `OPERATOR_ACTIONABLE_ANCHORED`), so no source-anchor / deep-link surface changes.

### 4.3 Emit on `res.error` only (`lib/sync/enrichVenueGeocode.ts`)

On the `res.error` branch (currently L98-101), after `recordGeocodeFailure()`, push exactly one warning into `result.warnings` before returning:

```ts
result.warnings.push({
  severity: "warn",
  code: "VENUE_GEOCODE_UNRESOLVED",
  message: "VENUE_GEOCODE_UNRESOLVED",
});
```

**Scope (guard conditions — emit exactly when a real lookup failed):**
- `res.error` (genuine geocode request failure) → **emit**.
- `!deps.isConfigured()` (no API key) → **no emit** (expected offline; L76 early-return, unchanged).
- `geocodeBreakerOpen()` (outage already counted) → **no emit** (L93 early-return, unchanged — avoids N identical warnings across a big scan).
- `venue.city` already set / no venue / no venue name → **no emit** (early returns L73-75, unchanged).
- cache hit with null city (a "no city" *success*) → **no emit** (L86-90 unchanged — the address genuinely has no city; audit anchor is the `res.error` path specifically).
- `res.data.city === null` (geocoder succeeded, returned no city) → **no emit** (L103-107 unchanged — success, not failure).

The `result.warnings.push` mutates the same `ParseResult.warnings` the enrichment already receives; it persists through the normal parse-warnings write path (no new persistence surface). `message` = the code literal is fine — it is never rendered raw (invariant 5: UI routes through `lib/messages/lookup.ts`; the badge/chip render the plain `label`).

**Telemetry (invariant 10).** `enrichVenueGeocode` is a system helper (not an admin-gated action, not a route under `app/api/admin/`). It already carries no `logAdminOutcome`. The new warning IS a persisted `code:`-carrying signal (it lands in `parse_warnings`), but per invariant 10 the mechanism for non-admin surfaces is a durable `code:` on a log call OR an inline exemption. A `parse_warnings` push is not a `log.*` emit. Resolution: the function is not a mutation *surface* under invariant 10's discovery (it's a `void` best-effort mutator called inside the sync pipeline, not an exported action or route handler). Confirm during implementation that `_metaMutationSurfaceObservability` does not discover it; if it does, add an inline `// no-telemetry: best-effort enrichment; failure persists as VENUE_GEOCODE_UNRESOLVED parse_warning` exemption. (Verified pre-draft: the file exports only `enrichVenueGeocode` + `__resetGeocodeBreaker`, neither a route nor a `"use server"` action.)

## 5. Part 2 — 6.2 digest pull-only band (specified, implementation deferred)

**Blocked on `feat/flow4-auto-applied-strip` merge.** Ratified design; no code in this arc.

### 5.1 New digest section: "Quality since last digest"

Extend `buildDigestModel` (`lib/notify/digest.ts:120`) with a per-show quality band appended to the existing needs-attention groups. Bands (per published show, only when non-empty):

1. **New data gaps** — `summarizeDataGaps` delta since the last digest send.
2. **Autocorrects applied** — `summarizeAutoFixes` (the Part-1 helper) delta.
3. **Auto-applied roster changes** — `roster_shift_counts([...showIds])` (Flow-4 RPC): added/removed/renamed unacknowledged `auto_apply` crew changes.
4. **Sub-threshold drift** — gap classes that grew but did not trip `isQualityRegression` (below the tuned gate).

### 5.2 "Since last digest" watermark

Reuse the existing `email_deliveries` dedup pattern already in `buildDigestModel` (L152-159 `not exists (select 1 from public.email_deliveries …)`). The digest computes the delta against the last `kind='daily_digest'` `status='sent'` row's timestamp for the recipient. No new table; a new `dedup_key` shape for the quality band. (Exact watermark mechanism finalized in the Part-2 plan against the then-current schema.)

### 5.3 Template

New block in `lib/notify/templates/digest.ts` (currently 65 lines) rendering the four bands under a "Quality since last digest" heading, plain-language labels (reuse `DATA_GAP_CLASS_LABELS` + `AUTO_FIX_CLASSES` labels), bounded per band.

### 5.4 Part-2 open items (resolved in its own plan)

- Watermark storage vs `email_deliveries` timestamp precision.
- Digest window / cadence interaction (`runNotify.ts:390` `outside_digest_window`).
- Whether roster-change acknowledgement (Flow-4 `acknowledge_changes`) should clear the digest band.

## 6. Meta-test inventory

| Meta-test | CREATE / EXTEND | Why |
|---|---|---|
| `tests/parser/dataGapsClassCompleteness.test.ts` | **EXTEND** | `DATA_GAP_CODES` 25→26 (add `VENUE_GEOCODE_UNRESOLVED`); `ALL_PERSISTED_WARNING_CODES` total 45→46. The 5 autocorrects stay in `BENIGN_WARN_CODES` (unchanged — the auto-fixed chip reads them but they remain benign-warn, not gaps). |
| `app/help/errors/_families.ts` + its test | **EXTEND** | new code needs a `familyFor` mapping (partition meta-test imports it). |
| `tests/messages/` (catalog parity x1, internal-code-enums x2) | **EXTEND** | new §12.4 code — 3-way lockstep. |
| Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) | **N/A** | Part 1 touches no `pg_advisory*` surface (emits are in the existing sync pipeline; no new lock holder). |
| Supabase call-boundary (`_metaInfraContract`) | **N/A** | Part 1 adds no new Supabase client call site (geocode uses cache deps; regression gate uses existing `tx`). |
| Mutation-surface observability (`_metaMutationSurfaceObservability`) | **VERIFY** | confirm `enrichVenueGeocode` is not discovered as a mutation surface (§4.3); add inline exemption only if it is. |

## 7. Follow-ons (BACKLOG)

- Extend the auto-fixed sibling to `AGENDA_SCHEDULE_TIME_ADJUSTED` / `AGENDA_SCHEDULE_LOW_CONFIDENCE` if operators want them counted.
- Emit `VENUE_GEOCODE_UNRESOLVED` on the "geocoder succeeded but returned no city" path too, if that proves a real signal (currently silent by design).
- 2.1 follow-ons (room-split / hotel-glue / ambiguous-date confidence warnings) — separate `worktree-ambiguity-warnings-v1` effort.

## 8. Disagreement-loop preempts (for the reviewer)

- **"Geocode isn't a sheet data gap — don't put it in `GAP_CLASSES`."** The audit requirement (§6.4) is "warn-level, **badge-visible**." The amber `DataQualityBadge`/`DataGapsChip` read `GAP_CLASSES` via `summarizeDataGaps`; membership is the zero-component-edit path to badge visibility. `gateExempt:true` (§4.2) prevents the only hazard of membership (a transient outage tripping the push alert). A separate enrichment-summary would re-wire badge + chip + Dashboard + digest for one code with no user-visible benefit.
- **"The auto-fixed chip should reuse `DataGapsSummary`."** No — §3.1 rationale: 8 exact-`toEqual` consumers break on an added field. Parallel type is deliberate.
- **"Tuned OR is too noisy / not noisy enough."** The `≥2` absolute floor is the tuning: it suppresses 1→2 (audit's stated noise concern) while catching 3→7 (audit's stated miss). Chosen over pure OR (user decision, this session).
- **"Autocorrects should push an alert."** Explicitly out of scope (§1, audit §6.3) — their delivery is the digest (Part 2) + the in-app chip, never the hard push.
- **Part 2 is not stubbed-and-forgotten** — it is gated on a specific inflight branch (`feat/flow4-auto-applied-strip`) whose `roster_shift_counts` contract is cited (§2). It ships as its own reviewed PR once Flow 4 merges.
