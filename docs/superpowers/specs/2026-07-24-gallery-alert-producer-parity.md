# Gallery alert producer-parity — closing hand-authored fixture drift

**Date:** 2026-07-24
**Status:** draft
**Surface:** dev attention gallery (`lib/dev/attentionScenarios/**`), alert-context fixtures, structural meta-tests
**Predecessor:** `docs/superpowers/specs/2026-07-23-warning-trim-undefer-design.md` §6 (id-matched crew-row fan-out)

<!-- spec-lint: not-ui — scope is lib/dev/**, lib/adminAlerts/**, and tests/**; no components/** or app/** file changes, so dimensional-invariant and transition-inventory sections do not apply -->


---

## 1. Scope

The id-matched crew-row fan-out shipped in `7349d10e0` (spec §6.2/§6.3). It is live in production and covered by e2e (`tests/e2e/published-show-attention.spec.ts:132`). It is **invisible in the dev attention gallery**, because the gallery's hand-authored `AMBIGUOUS_EMAIL_BINDING` scenario row carries the *wrong code's* context shape and the gallery's own validator enforces that wrong shape.

This spec closes the specific defect and the class it belongs to: **two independent families of hand-authored per-code alert-context fixtures exist, neither is bound to what the producer actually writes, and they have silently diverged.**

In scope:

1. Split the conflated validator case so each code is validated against its own producer's context shape (§4).
2. Promote the already-exhaustive, producer-accurate context fixtures to a shared module and make both fixture families consume it (§3).
3. Bind the gallery scenario catalog to that module so a fixture supplying keys the producer never writes fails the scenario-catalog test suite (§5).
4. Add a context-key dimension to the EXISTING producer-scope registry and its AST guard, rather than building a second discovery mechanism (§6).
5. Repair the five stale gallery fixture rows found by class-sweep, and pin coverage of BOTH crew-banner placements by scenario id (§7, §8).

Out of scope: any producer edit; any change to placement math (`lib/admin/crewRowMatch.ts`), derivation (`lib/adminAlerts/deriveAlertRowFields.ts:55-73`), or catalog copy (`lib/messages/catalog.ts:73-87`). No DB migration. No §12.4 catalog row edits.

### 1.1 Resolved scope — do not relitigate

- **The production fan-out is correct and untouched.** `deriveCrewMatch` reading `context.crew_member_ids` (`lib/adminAlerts/deriveAlertRowFields.ts:60`) matches what `upsertAmbiguousEmailAlert` writes (`lib/auth/validateGoogleSession.ts:43-46`). Ratified at `docs/superpowers/specs/2026-07-23-warning-trim-undefer-design.md:157` ("No producer change"). The bug is fixture-side only. Do not propose producer edits or new context keys.
- **Names never enter placement.** Matching is by DB id, deliberately (`lib/admin/crewRowMatch.ts:9-10`). Do not propose name-based or email-based row matching.
- **`crewMatch` absent remains legal.** Section-top is the correct fallback, not a defect (`lib/dev/attentionScenarios/validate.ts:126-127`, `lib/admin/crewRowMatch.ts:43-46`). This spec adds a *positive* coverage requirement (§8); it does not make fan-out mandatory per scenario.
- **`OAUTH_IDENTITY_CLAIMED` genuinely uses singular `crew_member_id`.** `app/auth/callback/route.ts:137-143` writes it; `lib/adminAlerts/alertIdentityMap.ts:71` reads it. The validator's current requirement is correct *for that code* and wrong only because `AMBIGUOUS_EMAIL_BINDING` was folded into the same case (`lib/dev/attentionScenarios/validate.ts:106-110`).
- **The gallery is not a snapshot.** It renders the real `PublishedReviewModal` through the real derivation chain (`lib/dev/deriveScenarioAttention.ts:6-16`, an admitted second caller pinned by `tests/admin/_metaAttentionItemsTopology.test.ts`). UI/routing changes flow through automatically. Only fixture *data* drifts. Do not propose rebuilding the gallery or replacing it with snapshots.
- **The 36 vs 45 code-count gap is expected, not drift.** `AdminAlertCode` (`lib/adminAlerts/upsertAdminAlert.ts:3-39`, 36 members) is the subset raised through `upsertAdminAlert`; `ADMIN_ALERTS_CODES` (`tests/adminAlerts/adminAlertCodes.fixture.ts:13-59`, 45 members) is the full registry and is a strict superset. The 9 extra are report/CI-monitor codes raised outside that helper. Verified: no code exists in the union but absent from the registry. **This 9 is NOT the producer-discovery exempt count** — those are different sets and an earlier draft wrongly derived one from the other. Discovery also covers SQL sites, so its coverage is computed directly: 13 of the 45 codes have no `PRODUCER_SCOPE` row (§6), a figure obtained by running the set difference, not by subtracting union sizes.

---

## 2. The defect (verified)

### 2.1 What renders today

The gallery's `AMBIGUOUS_EMAIL_BINDING` card renders as one section-top banner in the Crew panel with fully generic copy: "In this show, an email address is shared by two or more crew rows…" — every placeholder at its fallback.

### 2.2 Why placement falls back

`deriveCrewMatch` requires `context.crew_member_ids` to be a non-empty array of UUIDs (`lib/adminAlerts/deriveAlertRowFields.ts:60-72`). The gallery rows supply singular `crew_member_id` — at `lib/dev/attentionScenarios/tier1.ts:61` and `lib/dev/attentionScenarios/tier2.ts:809` among others; **§7 carries the complete class-swept inventory of five stale rows**, and the two named here are only the pair that motivated the investigation.

Not an array → `crewMatch` undefined → `bucketAttention` takes the section-top branch (`lib/admin/sectionAttention.ts:138-139`). A second, independent failure is latent behind it: the declared UUID `3f8c1e2a-5b6d-4c7e-8f90-1a2b3c4d5e6f` matches no gallery roster row — the roster ids are `cccccccc-0000-4000-8000-00000000000{1..6}` (`lib/dev/publishedModalFixture.ts:106-123`) — so even with the plural key the resolver would return `null` (`lib/admin/crewRowMatch.ts:46`) and placement would still be section-top. **Both must be fixed; fixing only the key leaves the bug.**

### 2.3 Why the copy is generic

The card's placeholders resolve from the alert *identity*, not raw context (`lib/adminAlerts/deriveMessageParams.ts:316-340`). The gallery declares `galleryIdentity` with a single `Crew` segment (`tier1.ts:62-64`), but `AMBIGUOUS_EMAIL_BINDING`'s identity map wants `showName`, `email`, and a `crew_member_count` count segment (`lib/adminAlerts/alertIdentityMap.ts:60-66`). Missing segments → the `"this show"` fallback (`lib/adminAlerts/deriveMessageParams.ts:320`), the `"an email address"` fallback (`lib/adminAlerts/deriveMessageParams.ts:333`), and the `"two or more crew rows"` fallback (`lib/adminAlerts/deriveMessageParams.ts:339`). Production is unaffected: `crew_member_count` is derived from `crew_member_ids.length` (`lib/adminAlerts/projectIdentityContext.ts:101`).

### 2.4 Why the validator did not catch it

`lib/dev/attentionScenarios/validate.ts:106-110` validates `AMBIGUOUS_EMAIL_BINDING` and `OAUTH_IDENTITY_CLAIMED` in one fall-through case requiring a UUID `context.crew_member_id`. For `OAUTH_IDENTITY_CLAIMED` that is right; for `AMBIGUOUS_EMAIL_BINDING` it enforces a key its producer never writes and cannot enforce the key it does. The validator is the mechanism that was supposed to prevent exactly this drift, and it encoded the drift.

### 2.5 Why the class is real, not a one-off

A second family of hand-authored per-code context fixtures already exists at `tests/adminAlerts/alertIdentityMatrix.test.ts:86` (`FIXTURES`), exhaustive over all 45 registered codes (pinned at `tests/adminAlerts/alertIdentityMatrix.test.ts:460`), each annotated with its producer's `file:line`. Its `AMBIGUOUS_EMAIL_BINDING` entry is **correct** — `{ email, crew_member_ids: [...] }` (`tests/adminAlerts/alertIdentityMatrix.test.ts:91`). Two families, same purpose, one right and one wrong, with nothing binding either to the producer. That divergence is the defect class this spec closes.

Ordering evidence: `d489fb4a3` (gallery validator) predates `7349d10e0` (fan-out). The gallery was authored against the pre-fan-out world and never revisited; the fan-out bundle's meta-test inventory (`2026-07-23-warning-trim-undefer-design.md:186-189`) does not name the gallery.

---

## 3. Producer-context single source of truth

<!-- spec-lint: ignore — this file is created by this bundle and cannot resolve until implementation -->

Create `tests/adminAlerts/producerContexts.ts` exporting a **list**, not a map — preserving the existing collection shape so the identity-matrix test's array-based assertions survive the move verbatim:

```ts
export type ProducerContextEntry = {
  /** Unchanged from the existing local Fixture type. */
  code: string;
  showId: string | null;
  context: Record<string, unknown>;
  occurrenceCount?: number;
};

export const PRODUCER_CONTEXT_LIST: ProducerContextEntry[];
export const PRODUCER_CONTEXT_BY_CODE: ReadonlyMap<string, ProducerContextEntry>;
```

**Ownership split (one fact, one home).** This module owns exactly one thing: a *representative context value* per code. It does **not** own key sets, producer citations, or computed-context provenance — those live on the §6 registry, keyed per `(site, code)`, which is the only place that knows a code can have several producer sites. Earlier drafts put `producer`, `requiredKeys`, `optionalKeys`, and `computed` here as well; that created two competing homes for the same facts and is withdrawn. `PRODUCER_CONTEXT_BY_CODE` is a convenience index over the list, not a second source.

**Field-preservation rule (the move must be lossless).** The existing local `Fixture` type (`tests/adminAlerts/alertIdentityMatrix.test.ts:75-81`) carries `code`, `showId`, `context`, and optional `occurrenceCount`. `ProducerContextEntry` keeps all four with identical names, types, and optionality — including `code`, whose omission in an earlier draft would have broken compilation. `Fixture` is module-local and unexported today; after the move `alertIdentityMatrix.test.ts` imports the promoted type and binds `const FIXTURES = PRODUCER_CONTEXT_LIST`, so its 45-code totality assertion (`tests/adminAlerts/alertIdentityMatrix.test.ts:460`) and every per-code expectation run against the same array shape they run against today. A dropped or renamed field is a compile error, not a silent test change.

**Guard conditions.** Empty `context` is legal (`SYNC_STALLED` writes `{}`, `lib/notify/detect/stall.ts:15`). `showId: null` codes are unaffected — `showId` is a column, not a context key. A code whose producer builds context from a helper still carries a hand-authored representative `context` here; its exemption from the §6 static cross-check is recorded on the registry row, never on this entry.

**Declared residual risk (key names only).** Every gate in this spec compares *top-level key names*. None validates value types or nested shapes: a fixture could supply producer-valid keys whose values are of the wrong type — `claimed_at_millis` as a string, `crew_member_ids` as an array of non-UUIDs on a code where §4's per-code rule does not apply — and pass every rule here. Closing that would require a per-code value schema, which is deliberately out of scope for this bundle. Stated so it is a known bound rather than an assumed guarantee.

---

## 4. Validator case split

Replace the conflated case at `lib/dev/attentionScenarios/validate.ts:106-120` with one case per code:

- `AMBIGUOUS_EMAIL_BINDING` — requires `context.crew_member_ids`: an array of ≥2 distinct UUID strings (the alert is definitionally about two-or-more rows sharing an address), and a non-blank `context.email`. Rejects any `crew_member_id` key as a misuse of the sibling code's shape, with an error naming both codes.
- `OAUTH_IDENTITY_CLAIMED` — unchanged: UUID `context.crew_member_id`, exactly one `Crew` identity segment.

The `galleryIdentity` requirement diverges per code: `OAUTH_IDENTITY_CLAIMED` keeps "exactly one `Crew` segment"; `AMBIGUOUS_EMAIL_BINDING` instead requires segments satisfying its identity map — a `Show` segment, an email segment, and a crew-row count segment (`lib/adminAlerts/alertIdentityMap.ts:60-66`) — so the rendered card cannot silently degrade to placeholder copy again.

**Boundary cases.** `crew_member_ids` present but length 1 → reject (fan-out needs ≥2; production never writes 1 for this code). Duplicate ids within the array → reject (`crewRowIndexesForIds` treats it as malformed, `lib/admin/crewRowMatch.ts:30`). Non-array, empty array, non-UUID member → reject, each with a distinct message.

---

## 5. Gallery ↔ producer binding

**Gate evaluation moment (explicit).** `validateScenario` is a **test-time** gate, not a build-time or runtime one: its only callers are `tests/dev/attentionScenariosTier1.test.ts:4` and `tests/admin/crewMatchFanout.test.ts:13`. The gallery route does not call it while rendering, so a malformed scenario degrades visually rather than throwing in the browser — which is exactly how this defect stayed invisible. The rules below therefore prove themselves by a test that feeds the catalog through `validateScenario` and asserts a non-empty error list for each malformed shape; they do not need a build-artifact probe.

`validateAlert` (`lib/dev/attentionScenarios/validate.ts:154`) gains a generic, code-agnostic rule applied to **every** scenario alert row:

- **Key-subset rule — checked against the REGISTRY's aggregated key set, not against a representative value.** For a code with producer sites `S₁…Sₙ` on the §6 registry, define:

  - `allowedKeys(code) = ⋃ᵢ (contextKeys(Sᵢ) ∪ optionalContextKeys(Sᵢ))`
  - `guaranteedKeys(code) = ⋂ᵢ contextKeys(Sᵢ)`

  Every key in a scenario row's `context` MUST be in `allowedKeys(code)`. Checking against `Object.keys(PRODUCER_CONTEXTS[code].context)` — an earlier draft's rule — would wrongly reject a legitimate key that only one site or one conditional branch writes; the representative value is a sample, not the key universe. Live example of why the aggregation is mandatory: `SHEET_UNAVAILABLE` has three sites (`lib/sync/runManualSyncForShow.ts:185`, `lib/sync/runScheduledCronSync.ts:2573`, `lib/sync/runScheduledCronSync.ts:2633`) and `failure_code` is written by only two of them, so it belongs to `allowedKeys` but not `guaranteedKeys`.

  A violating key is a test-suite failure naming the offending key, the code, and every registered producer site for it. This is the rule that would have caught `crew_member_id` on `AMBIGUOUS_EMAIL_BINDING` on the day it was written.
- **Required-key rule — scoped to RENDERER-READ keys, not to the producer's full key list.** This scoping is load-bearing, not a softening.

  Measured against the live catalog rather than estimated (`npx tsx` over `ALL_SCENARIOS`, run 2026-07-24): the gallery holds **163 scenarios** (88 tier-1, 71 tier-2, 4 tier-3), of which **67 carry at least one alert**, totalling **85 alert rows — and 70 of those 85 carry `context: {}`**. Tier-1 alone synthesizes one scenario per routed code with `context: override.context ?? {}` (`lib/dev/attentionScenarios/tier1.ts:87`) and only 6 of the 45 routed codes have an `ALERT_ROW_OVERRIDES` entry (`lib/dev/attentionScenarios/tier1.ts:37`), giving 39 empty-context rows there; tier-2 and tier-3 supply the rest.

  Both `tests/dev/attentionScenariosTier1.test.ts:31-36` (tier-1) and `tests/dev/attentionScenariosIndex.test.ts` (the `ALL_SCENARIOS` union) already assert that every scenario passes `validateScenario`, so a rule demanding every producer key would fail **70 of 85 alert rows** on the day it landed — for cards that render correctly with no context at all.

  **Mechanical definition of `rendererReadKeys(code)` (no judgement calls).** Walk `ALERT_IDENTITY_MAP[code].segments` (`lib/adminAlerts/alertIdentityMap.ts:58`) and map each `SegmentSpec` to the context key it consumes, by `kind`:

  | Segment `kind` | Context key it requires | Authority |
  |---|---|---|
  | `showName` | **none when the row's `show_id` column is set**; when it is null (global-scope alerts) the resolver falls back to `context.show_id` via the projection's resolution group, so `show_id` IS a renderer-read key for codes stored with `showId: null` | `lib/adminAlerts/resolveAlertIdentities.ts:84-86` (`row.show_id ?? row.identityContext.resolution.show_id`) |
  | `email` | `EMAIL_FIELD_BY_CODE[code] ?? "email"` (so `user_email` for `OAUTH_IDENTITY_CLAIMED`, `email` for every other) | `lib/adminAlerts/resolveAlertIdentities.ts:69-72` |
  | `crewName` | the spec's own `key` (`crew_member_id` / `stale_crew_member_id`) | `lib/adminAlerts/resolveAlertIdentities.ts:88-92` |
  | `contextField` | the spec's own `key` | `lib/adminAlerts/resolveAlertIdentities.ts:95-96` |
  | `count` | the **underlying** key the count is derived from, not the count key itself: `crew_member_count` → `crew_member_ids`, `role_change_count` → `changes`, `failed_sheet_names_count` → `failed_sheet_names` | `lib/adminAlerts/projectIdentityContext.ts:101`, `lib/adminAlerts/projectIdentityContext.ts:88-97` |

  The `count` row is the subtle one and is why "any key backing a placeholder" was too vague to implement: `crew_member_count` never appears in any producer's context — it is projected from `crew_member_ids.length`. The derivation table above is declared here, implemented once, and pinned by a test asserting it covers every `kind` in the `SegmentSpec` union, so a new segment kind fails rather than silently contributing nothing.

  `rendererReadKeys(code)` is then intersected with `allowedKeys(code)`; the result is what the scenario row must supply. A code whose card reads nothing from context has an empty required set and `{}` stays valid.
- **Roster-membership rule (crew-id keys).** Any UUID a scenario declares under a crew-id-bearing key (`crew_member_id`, `crew_member_ids[]`) or under `crewMatch.crewMemberIds` MUST be a member of **that scenario's own rendered roster**, which is the fixture-resolved roster — not the six-row default. A scenario declaring `volumes.crew = N` (`lib/dev/publishedModalFixture.ts:484-488`) has an `N`-row roster whose generated ids are deterministic (`genCrewRow`, `lib/dev/publishedModalFixture.ts:273-279`). This distinction is load-bearing: it is what makes §8's beyond-cap fallback expressible without an exemption. An id belonging to no roster row at all remains a test-suite failure, closing §2.2's latent second failure permanently.

The existing `DEV_SCENARIO_TAG_KEY` exemption (`validate.ts:159`) is preserved: the gallery's own tagging key is not a producer key and is excluded from the subset rule.

**Interaction with `crewMatch`.** The gallery-only `crewMatch` override (`lib/dev/deriveScenarioAttention.ts:39-42`) stays legal and still wins over the derived value. Three rules constrain it, closing the "synthetic state production cannot produce" gap:

1. **Code restriction.** `crewMatch` is legal ONLY on a code that production can actually fan out — today exactly `AMBIGUOUS_EMAIL_BINDING`, mirroring `deriveCrewMatch`'s own code guard (`lib/adminAlerts/deriveAlertRowFields.ts:59`). A `crewMatch` on any other code is rejected; without this, a non-fan-out code could declare roster-valid ids and demo a placement production never produces.
2. **Context agreement — no exceptions.** When a row declares both `context.crew_member_ids` and `crewMatch`, the two id sets must be equal. There is no §8 carve-out: the fallback scenario declares no `crewMatch` at all and lets derivation produce it, so agreement is structural rather than asserted (§8).
3. **Identity agreement.** For `AMBIGUOUS_EMAIL_BINDING`, the declared `galleryIdentity`'s email segment must equal `context.email`, and its crew-row count segment must equal `context.crew_member_ids.length`. Without this a fixture can render a card whose copy contradicts its own data — a state no producer can emit.

---

## 6. Producer-side parity — EXTEND the existing registry, do not build a second one

**The producer-discovery infrastructure this spec needs already exists.** `tests/adminAlerts/alertProducerScope.registry.ts:29` (`PRODUCER_SCOPE`, 45 rows, one per `(site, code)`; 33 distinct code strings, of which 32 are real `ADMIN_ALERTS_CODES` members and one is `p_code`, a SQL parameter name the existing walker captures literally) is guarded by `tests/adminAlerts/_metaAlertProducerScope.test.ts`, which performs a TypeScript-compiler-API AST walk over `lib` + `app` for any CallExpression whose callee's rightmost identifier is `upsertAdminAlert` — so the `tx.` / `deps.` / `recoveryTx.` wrapper forms are already covered — **plus** `upsert_admin_alert(` invocations in `supabase/**/*.sql`. It already fails by default on an unregistered site, already fails on a stale row, and already models dynamic sites with `dynamic: true` plus a mandatory provenance note (`tests/adminAlerts/alertProducerScope.registry.ts:17-27`).

Building a second walker would duplicate that guarantee and would *lose* one this spec's original design missed entirely: the SQL-side producer discovery.

The change is therefore a **dimension added to the existing registry**, not a new mechanism:

- Extend `ProducerScopeRow` with the context-key dimension: `contextKeys` (always written) and `optionalContextKeys` (written only on some branches — conditional spreads such as `lib/sync/runManualSyncForShow.ts:190` and `lib/sync/runScheduledCronSync.ts:2376`). A row that is already `dynamic: true` carries hand-authored keys plus its existing provenance `note` naming the helper, and is exempt from the literal cross-check.
- Extend `_metaAlertProducerScope.test.ts`'s existing AST walk to also read the `context:` property of each discovered call site, with an explicitly total classification:

  | `context:` initializer | Classification | Registry requirement |
  |---|---|---|
  | `ObjectLiteralExpression`, all members `PropertyAssignment` / `ShorthandPropertyAssignment` | static | keys equal `contextKeys`; `optionalContextKeys` empty |
  | `ObjectLiteralExpression` containing a `SpreadAssignment` over a `ConditionalExpression` (`...(cond ? { k: v } : {})`) | static-with-branches | plain members → `contextKeys`; keys appearing in **either** arm of the conditional → `optionalContextKeys` |
  | `ObjectLiteralExpression` containing any other `SpreadAssignment` (spread of an identifier or call) | computed | `computedContext: true` + provenance `note` |
  | `Identifier` or `CallExpression` | computed | `computedContext: true` + provenance `note` |

  **How "always" vs "optionally" is proven, not assumed:** a key is `contextKeys` only if it appears as a direct property of the object literal, outside every conditional spread. A key inside a conditional spread is `optionalContextKeys` regardless of which arm it sits in, because the walker does not evaluate `cond`. This is a deliberately conservative rule — it can classify an always-written key as optional (if an author wraps it in a tautological ternary) but can never classify an optional key as guaranteed, which is the direction that matters for `guaranteedKeys` in §5.

  Sites needing `computedContext` at spec time — **re-derived by the implementer against live code, not trusted from this list**: `lib/drive/watch.ts:409` and `lib/sync/runScheduledCronSync.ts:375` (bare `context` identifier), and the two `buildParseErrorContext(...)` calls at `lib/sync/runManualSyncForShow.ts:261` and `lib/sync/runScheduledCronSync.ts:3386`. Separately, `lib/sync/applyStaged.ts:1952` and `lib/sync/applyStaged.ts:1962` are already `dynamic: true` rows (their **code** is `result.adminAlertCode` / a loop variable); their `context` is the object literal `{ drive_file_id: args.driveFileId }`, so they are static on the context axis and dynamic on the code axis. The two axes are independent and the registry must model them independently — an earlier draft conflated them.

- **SQL-site behavior (declared, previously undefined).** The existing walk also discovers `upsert_admin_alert(` invocations in `supabase/**/*.sql`, where the context argument is a SQL expression or a `jsonb` literal, not a TypeScript object literal. The extended check does **not** attempt SQL context-key extraction. SQL rows are classified `computedContext: true` with a provenance note naming the migration file, and are exempt from the literal cross-check while remaining subject to the existing site/code discovery. The rationale is the same as the registry's own acknowledged §3.0 residual risk (`tests/adminAlerts/alertProducerScope.registry.ts:6-14`): every such site emits health-audience codes that the gallery never renders, so the parity gap has no gallery consequence. The test asserts this classification positively rather than letting SQL rows fall through a TypeScript-shaped branch.
- Key sets live ONLY on the registry; §3's module carries no key fields to derive or restate. The registry is the source of *which keys exist*; §3's module is the source of *what a realistic value looks like*. One fact, one home, each — and §3's list is cross-checked against `allowedKeys(code)` rather than feeding it.

**Explicit bound (declared, not hidden).** The AST cross-check reads object literals only. A helper-built context is verified by its hand-authored row plus the provenance note naming the helper's `path:line`; it is not mechanically verified. This bound is inherited from the existing registry's acknowledged §3.0 residual risk (`tests/adminAlerts/alertProducerScope.registry.ts:6-14`), not newly introduced here. Raw `INSERT INTO admin_alerts` sites remain undiscovered, exactly as today.

---

## 7. Fixture repairs

**There are FIVE stale rows, not two.** Earlier drafts named only the two that motivated this spec. A class-sweep of the whole scenario tree (`rg -n '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' lib/dev/attentionScenarios/*.ts`, run 2026-07-24) returns every one:

| Row | Code | Current context | Problem |
|---|---|---|---|
| `lib/dev/attentionScenarios/tier1.ts:61` | `AMBIGUOUS_EMAIL_BINDING` | `crew_member_id: "3f8c1e2a-…"` | wrong key **and** non-roster id |
| `lib/dev/attentionScenarios/tier1.ts:67` | `OAUTH_IDENTITY_CLAIMED` | `crew_member_id: "7a1b2c3d-…"` | correct key, **non-roster id** |
| `lib/dev/attentionScenarios/tier2.ts:245` | `crewCode()` — resolves to `AMBIGUOUS_EMAIL_BINDING` | `crew_member_id: "3f8c1e2a-…"` | wrong key + non-roster id, via the shared `crewAlert()` helper |
| `lib/dev/attentionScenarios/tier2.ts:809` | `AMBIGUOUS_EMAIL_BINDING` | `crew_member_id: "3f8c1e2a-…"` | wrong key + non-roster id |
| `lib/dev/attentionScenarios/tier3.ts:55` | `AMBIGUOUS_EMAIL_BINDING` | `crew_member_id: "3f8c1e2a-…"` | wrong key + non-roster id |

The `OAUTH_IDENTITY_CLAIMED` row is a genuinely distinct sub-case: its **key** is correct (that code's producer does write singular `crew_member_id`, `app/auth/callback/route.ts:137-143`), but its **id** belongs to no roster row, so §5's roster-membership rule fails it. It is repaired by swapping the id for a roster member, not by changing the key. `tier2.ts:245` is a shared helper (`crewAlert()`), so repairing it fixes every scenario that calls it — the implementer counts those call sites rather than assuming one.

Repairs:

- The four `AMBIGUOUS_EMAIL_BINDING` rows: `context: { email: <shared address>, crew_member_ids: [<two roster UUIDs>] }`, ids drawn from `lib/dev/publishedModalFixture.ts:107-113`, plus a `galleryIdentity` carrying Show + email + crew-row-count segments agreeing with that context per §4 and §5's identity-agreement rule.
- The `OAUTH_IDENTITY_CLAIMED` row: `crew_member_id` swapped to a roster member id; key and identity shape otherwise unchanged.

Rationale for real roster ids on the ambiguous-email rows: it makes them demo the fan-out — the state production actually produces, since `upsertAmbiguousEmailAlert` always writes both involved ids and the match normally succeeds.

---

## 8. Positive fan-out coverage

**The fallback demo uses NO `crewMatch` override at all — it is driven entirely by real context.** Two earlier drafts got this wrong in opposite directions. The first made the scenario impossible (§5 rejected non-roster ids while §8 needed an unresolvable one). The second fixed that with a `crewMatch` naming a beyond-cap id absent from `context.crew_member_ids` — but that is a **producer-impossible state**: production derives `crewMatch` *from* `context.crew_member_ids` (`lib/adminAlerts/deriveAlertRowFields.ts:60-72`), so a `crewMatch` that disagrees with its own context can never occur. Demoing it would put a fiction in the gallery, which is the exact class of defect this spec exists to eliminate.

The correct design needs no override and no carve-out. The new tier-2 scenario declares `volumes: { crew: 35 }`, growing the fixture roster to 35 deterministic generated rows (`lib/dev/publishedModalFixture.ts:484-488`, ids from `genCrewRow`, `lib/dev/publishedModalFixture.ts:273-279`), and puts **two real roster ids in `context.crew_member_ids`, at least one of them at index ≥ 30**. Then:

- `deriveCrewMatch` derives `crewMatch` naturally from that context — identical to production;
- §5's roster-membership rule passes, because both ids are genuine roster members;
- §5's context-agreement rule passes trivially, because `crewMatch` **is** the context;
- `buildCrewRowResolver` slices to `CREW_CAP = 30` before matching (`lib/admin/crewRowMatch.ts:64`, `components/admin/wizard/step3ReviewSections.tsx:160`), so the beyond-cap id has `hits === 0`, the resolver returns `null` (`lib/admin/crewRowMatch.ts:46`), and the banner lands section-top.

This is precisely the production fallback the placement contract documents — "row beyond `CREW_CAP`" — reproduced with no synthetic state. **Consequently §5's rule 2 has no exception:** `crewMatch` and `context.crew_member_ids` must agree, always, with no §8 carve-out.

With §7 making the ambiguous-email rows fan out, the gallery then shows both placements.

**Coverage pin — by scenario id, not by existence.** An existential "somewhere in the catalog there is one of each" assertion can be satisfied by an unrelated scenario after the intended one regresses. The pin therefore names its subjects: the tier-1 `AMBIGUOUS_EMAIL_BINDING` scenario id (`scenarioIdForCode("alert", "AMBIGUOUS_EMAIL_BINDING")`) must derive a **fanned-out** placement, and the new tier-2 fallback scenario id must derive a **section-top** placement. Both assertions run `bucketAttention` over the scenario's derived items and inspect which bucket the banner landed in — never a container that could render either, and never the scenario's own declaration. A third assertion keeps the existential form as a weaker backstop for the rest of the catalog.

---

## 9. Guard table

| Condition | Behavior |
|---|---|
| Scenario context key absent from `allowedKeys(code)` (registry union across sites) | Catalog-test failure (§5), message names the key, the code, and every registered site |
| Key written by only some of a code's producer sites (`SHEET_UNAVAILABLE.failure_code`) | Legal — in `allowedKeys`, absent from `guaranteedKeys` (§5) |
| Scenario omits a key in `rendererReadKeys(code) ∩ allowedKeys(code)` | Catalog-test failure (§5) |
| Scenario carries `{}` for a code whose card reads no context (70 of 85 alert rows today) | Legal — required set is empty (§5) |
| Scenario declares a crew UUID belonging to no row of **that scenario's** roster | Catalog-test failure (§5) |
| `context.crew_member_ids` names a roster member beyond `CREW_CAP` | Legal — §8's fallback demo; derivation yields a crewMatch that resolves to section-top |
| `crewMatch` on any code other than `AMBIGUOUS_EMAIL_BINDING` | Validator reject (§5 rule 1) |
| `crew_member_ids` length 1, or duplicate members | Validator reject (§4) |
| `crew_member_ids` and `crewMatch` disagree | Validator reject (§5 rule 2) — no exceptions |
| `galleryIdentity` email or crew-row count disagrees with `context` | Validator reject (§5 rule 3) |
| Producer context built by helper/variable/non-conditional spread | Requires `computedContext: true` + provenance note on the REGISTRY row (§6); absent → test failure |
| Producer site in `supabase/**/*.sql` | Classified `computedContext: true`, exempt from literal cross-check, still discovered (§6) |
| Code with no `PRODUCER_SCOPE` row (13 today) | Declared exempt from discovery; still requires a producer-context entry (§6) |
| Producer writes `{}` (`SYNC_STALLED`) | Legal; empty key sets (§3) |
| Fixture supplies producer-valid keys with wrong-typed values | **Not caught** — declared residual risk (§3) |
| Existing `crewMatch`-absent scenarios | Unchanged — section-top stays legal (§1.1) |

---

## 10. Flag lifecycle / zombie audit

No new boolean flags, config fields, or toggles. `computedContext` is the one new flag: **storage** — the `PRODUCER_SCOPE` registry row (`tests/adminAlerts/alertProducerScope.registry.ts:17`), never the §3 module; **write** — hand-authored per row alongside a mandatory provenance `note`; **read** — the §6 parity meta-test; **effect** — suppresses the AST literal cross-check for that site and requires the note to name the helper or migration. No empty column.

---

## 11. Meta-test inventory

<!-- spec-lint: ignore — the two files named on the Creates line are created by this bundle and cannot resolve until implementation -->

- **Creates:** `tests/adminAlerts/producerContexts.ts` (module, not a test) and the §8 gallery placement-coverage pin. No new meta-test file: §6 extends the existing producer-scope guard rather than adding a second one.
- **Extends:** `lib/dev/attentionScenarios/validate.ts` rules (§4, §5) and their existing test file; `tests/adminAlerts/alertProducerScope.registry.ts` + `tests/adminAlerts/_metaAlertProducerScope.test.ts` (the context-key dimension, §6); `tests/adminAlerts/alertIdentityMatrix.test.ts` (now importing the promoted fixtures, 45-code totality assertion preserved at `tests/adminAlerts/alertIdentityMatrix.test.ts:460`).
- **Not applicable:** advisory-lock topology (no lock surface touched — no producer edit, §1.1); Supabase call-boundary registry (no Supabase read/write path changes); §12.4 catalog parity (no catalog edits); mutation-surface observability (no mutation surface added); validation-schema-parity (no migration); impeccable dual-gate — **applies only if a component file changes**; the current scope touches `lib/dev/**` and `tests/**` only, so the plan re-checks this at implementation time and runs the gate if any `components/**` or `app/**` file enters the diff.

---

## 12. Test strategy

TDD per task (invariant 1). Each rule in §4/§5/§6 gets a failing test asserting the *specific* rejection before the rule exists — the anti-tautology requirement means each test names the concrete drift it catches, and the §5 subset rule's test uses the real historical defect (`crew_member_id` on `AMBIGUOUS_EMAIL_BINDING`) as its fixture. The §8 coverage pin derives expected placement from the scenario catalog rather than hardcoding a count, so adding a scenario cannot silently satisfy it.

---

## 13. Numeric self-check

36 `AdminAlertCode` union members (`lib/adminAlerts/upsertAdminAlert.ts:3-39`); 45 `ADMIN_ALERTS_CODES` registry members (`tests/adminAlerts/adminAlertCodes.fixture.ts:13-59`); 45 `ATTENTION_ROUTES` codes, hence 45 tier-1 alert scenarios; 163 gallery scenarios (88 tier-1, 71 tier-2, 4 tier-3), 67 carrying at least one alert, 85 alert rows total, 70 of them with an empty context; 6 `ALERT_ROW_OVERRIDES` entries (`lib/dev/attentionScenarios/tier1.ts:37`) leaving 39 empty-context tier-1 alert rows (§5); 13 registry codes with no producer-scope row — and this now reconciles exactly: 45 codes minus the 32 REAL codes the registry covers = 13. The registry's 33 distinct code strings include `p_code`, which is not a code; conflating 33 with 32 was the source of an earlier 45/33/13 contradiction. 4 of the 45 rows are SQL sites; 5 stale fixture rows repaired — 4 AMBIGUOUS_EMAIL_BINDING + 1 OAUTH_IDENTITY_CLAIMED, across 3 tier files (§7); 2 gallery roster UUIDs per repaired ambiguous-email row; 35-row roster (`volumes.crew`) in the §8 fallback scenario, whose crewMatch id sits at index ≥30; ≥2 `crew_member_ids` required by §4; 6 gallery crew roster rows (`lib/dev/publishedModalFixture.ts:106-123`); `CREW_CAP` = 30; 1 new scenario (§8); 1 new module + 1 new coverage pin, with §6 extending the existing 45-row producer-scope registry rather than adding a file (§11); 0 migrations; 0 §12.4 edits; 0 producer edits.
