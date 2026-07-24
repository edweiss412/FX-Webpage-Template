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
4. Bind the producer call sites to that module via static discovery, with a declared escape hatch for computed contexts (§6).
5. Repair the two stale gallery rows and add positive fan-out coverage to the gallery (§7, §8).

Out of scope: any producer edit; any change to placement math (`lib/admin/crewRowMatch.ts`), derivation (`lib/adminAlerts/deriveAlertRowFields.ts:55-73`), or catalog copy (`lib/messages/catalog.ts:73-87`). No DB migration. No §12.4 catalog row edits.

### 1.1 Resolved scope — do not relitigate

- **The production fan-out is correct and untouched.** `deriveCrewMatch` reading `context.crew_member_ids` (`lib/adminAlerts/deriveAlertRowFields.ts:60`) matches what `upsertAmbiguousEmailAlert` writes (`lib/auth/validateGoogleSession.ts:43-46`). Ratified at `docs/superpowers/specs/2026-07-23-warning-trim-undefer-design.md:157` ("No producer change"). The bug is fixture-side only. Do not propose producer edits or new context keys.
- **Names never enter placement.** Matching is by DB id, deliberately (`lib/admin/crewRowMatch.ts:9-10`). Do not propose name-based or email-based row matching.
- **`crewMatch` absent remains legal.** Section-top is the correct fallback, not a defect (`lib/dev/attentionScenarios/validate.ts:126-127`, `lib/admin/crewRowMatch.ts:43-46`). This spec adds a *positive* coverage requirement (§8); it does not make fan-out mandatory per scenario.
- **`OAUTH_IDENTITY_CLAIMED` genuinely uses singular `crew_member_id`.** `app/auth/callback/route.ts:137-143` writes it; `lib/adminAlerts/alertIdentityMap.ts:71` reads it. The validator's current requirement is correct *for that code* and wrong only because `AMBIGUOUS_EMAIL_BINDING` was folded into the same case (`lib/dev/attentionScenarios/validate.ts:106-110`).
- **The gallery is not a snapshot.** It renders the real `PublishedReviewModal` through the real derivation chain (`lib/dev/deriveScenarioAttention.ts:6-16`, an admitted second caller pinned by `tests/admin/_metaAttentionItemsTopology.test.ts`). UI/routing changes flow through automatically. Only fixture *data* drifts. Do not propose rebuilding the gallery or replacing it with snapshots.
- **The 36 vs 45 code-count gap is expected, not drift.** `AdminAlertCode` (`lib/adminAlerts/upsertAdminAlert.ts:3-39`, 36 members) is the subset raised through `upsertAdminAlert`; `ADMIN_ALERTS_CODES` (`tests/adminAlerts/adminAlertCodes.fixture.ts:13-59`, 45 members) is the full registry and is a strict superset. The 9 extra are report/CI-monitor codes raised outside that helper. Verified: no code exists in the union but absent from the registry.

---

## 2. The defect (verified)

### 2.1 What renders today

The gallery's `AMBIGUOUS_EMAIL_BINDING` card renders as one section-top banner in the Crew panel with fully generic copy: "In this show, an email address is shared by two or more crew rows…" — every placeholder at its fallback.

### 2.2 Why placement falls back

`deriveCrewMatch` requires `context.crew_member_ids` to be a non-empty array of UUIDs (`lib/adminAlerts/deriveAlertRowFields.ts:60-72`). The gallery rows supply singular `crew_member_id`:

- `lib/dev/attentionScenarios/tier1.ts:60-65`
- `lib/dev/attentionScenarios/tier2.ts:808-813`

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

Create `tests/adminAlerts/producerContexts.ts` exporting `PRODUCER_CONTEXTS: Record<AdminAlertsCode, ProducerContextEntry>`.

```ts
type ProducerContextEntry = {
  /** Producer call site, `path:line`. Verified by the §6 discovery pass. */
  producer: string;
  /** A representative context the producer actually writes. */
  context: Record<string, unknown>;
  /** Keys the producer ALWAYS writes. Subset of Object.keys(context). */
  requiredKeys: readonly string[];
  /** Keys the producer writes only on some branches (spread-inserted / ternary). */
  optionalKeys?: readonly string[];
  /** Set when the producer builds context from a variable or helper rather than
   *  an object literal at the call site, so §6 static discovery cannot read it.
   *  The string is the reason + the helper's `path:line`. */
  computed?: string;
};
```

Seeded by **moving** the existing `FIXTURES` array out of `tests/adminAlerts/alertIdentityMatrix.test.ts:86` into this module — it is already exhaustive, already producer-annotated, and already correct. `alertIdentityMatrix.test.ts` then imports from it, keeping its 45-code totality assertion (`tests/adminAlerts/alertIdentityMatrix.test.ts:460`) unchanged. This is a move plus enrichment (`requiredKeys` / `optionalKeys` / `computed`), not a reimplementation.

**Guard conditions.** Empty `context` is legal (`SYNC_STALLED` writes `{}`, `lib/notify/detect/stall.ts:15`) and yields `requiredKeys: []`. `showId: null` codes are unaffected — `showId` is a column, not a context key. A code with `computed` set still carries a `context` + `requiredKeys` (hand-authored from reading the helper); `computed` suppresses only the §6 static cross-check, never the §5 gallery binding.

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

- **Key-subset rule.** Every key in a scenario row's `context` MUST appear in that code's `PRODUCER_CONTEXTS[code].context`. A key the producer never writes is a test-suite failure naming the offending key and the producer's `path:line`. This is the rule that would have caught `crew_member_id` on `AMBIGUOUS_EMAIL_BINDING` on the day it was written.
- **Required-key rule.** Every key in `requiredKeys` MUST be present in the scenario row's context. A code whose card is context-dependent cannot ship its degenerate form by omission.
- **Roster-membership rule (crew-id keys).** Any UUID a scenario declares under a crew-id-bearing key (`crew_member_id`, `crew_member_ids[]`) or under `crewMatch.crewMemberIds` MUST be a member of the gallery roster (`lib/dev/publishedModalFixture.ts:106-123`). An id that cannot resolve to a rendered row is a test-suite failure — this closes §2.2's latent second failure permanently.

The existing `DEV_SCENARIO_TAG_KEY` exemption (`validate.ts:159`) is preserved: the gallery's own tagging key is not a producer key and is excluded from the subset rule.

**Interaction with `crewMatch`.** The gallery-only `crewMatch` override (`lib/dev/deriveScenarioAttention.ts:39-42`) stays legal and still wins over the derived value. It gains the roster-membership rule and an added consistency check: when a row declares BOTH `context.crew_member_ids` and `crewMatch`, the two id sets must agree, so the gallery cannot demo a placement its own context contradicts.

---

## 6. Producer-side parity (static discovery)

<!-- spec-lint: ignore — this file is created by this bundle and cannot resolve until implementation -->

New meta-test `tests/adminAlerts/_metaProducerContextParity.test.ts`, filesystem-walked so a new producer fails by default (invariant-10 discovery idiom). It reuses the existing source-walk helper `lib/messages/__internal__/walkSourceFiles.ts` over the same `app` + `lib` roots the §12.4 producer scan already walks (`lib/messages/__internal__/codeProducers.ts:13`), rather than introducing a second walker.

- Walk `lib/**` and `app/**` for `upsertAdminAlert({...})` call sites (including the `tx.`/`deps.` transaction-wrapper forms seen at `lib/drive/watch.ts:409`, `lib/sync/unpublishShow.ts:238`, `lib/sync/runScheduledCronSync.ts:2364`).
- For each call site whose `code:` is a string literal AND whose `context:` is an object literal, extract the literal's top-level keys and assert they equal `requiredKeys ∪ optionalKeys` for that code. Keys inside a conditional spread (`...(cond ? { k: v } : {})`, e.g. `lib/sync/runManualSyncForShow.ts:190`, `lib/sync/runScheduledCronSync.ts:2376`) count as optional.
- A call site whose `code:` or `context:` is a variable/helper/dynamic expression requires `PRODUCER_CONTEXTS[code].computed` to be set, or the test fails. Known members at spec time: `lib/drive/watch.ts:411` (`context` variable), `lib/sync/runScheduledCronSync.ts:378` (`context` variable), the two `buildParseErrorContext(...)` sites (`lib/sync/runManualSyncForShow.ts:266`, `lib/sync/runScheduledCronSync.ts:3389`), and the dynamic-code sites (`lib/sync/applyStaged.ts:1952-1966`, `code: result.adminAlertCode` and the `adminAlertCodes` loop). The plan re-derives this list against live code rather than trusting it.
- Assert every one of the 36 `AdminAlertCode` members has a discovered producer, and that `PRODUCER_CONTEXTS` covers all 45 `ADMIN_ALERTS_CODES` — the 9 non-`upsertAdminAlert` codes are covered by the registry but exempt from producer discovery, declared explicitly rather than by silent absence.

**Explicit bound (declared, not hidden):** static discovery reads object literals only. A helper-built context is verified by its hand-authored `computed` row, not mechanically. The test makes that visible by requiring the `computed` string to name the helper's `path:line`; it does not silently skip.

---

## 7. Fixture repairs

`tier1.ts:60-65` and `tier2.ts:808-813` — the same defect in two places, repaired together (class-sweep, not one instance):

- `context: { email: "<gallery-crew-email>", crew_member_ids: [<two gallery roster UUIDs>] }`, ids drawn from `lib/dev/publishedModalFixture.ts:107-113`.
- `galleryIdentity` gains `Show`, email, and crew-row-count segments per §4, so both cards render real copy instead of placeholders.

Rationale for using two *real* roster ids: it makes tier-1's per-code scenario demo the fan-out — the state production actually produces, since `upsertAmbiguousEmailAlert` always writes both involved ids and the match normally succeeds.

---

## 8. Positive fan-out coverage

One new tier-2 scenario demonstrating the **section-top fallback** (an id absent from the rendered roster, or a row beyond `CREW_CAP = 30`, `components/admin/wizard/step3ReviewSections.tsx:160`), declared via the `crewMatch` override so the fallback is exercised without a malformed context. With §7 making tier-1 the fan-out case, the gallery then shows both placements.

A meta-test asserts the gallery renders at least one fanned-out crew banner **and** at least one section-top crew banner across the scenario catalog — a positive coverage pin, so neither visual state can go dark again without a test failing. Assertion is against derived placement (`bucketAttention` output for the scenario), not against a container that could render either.

---

## 9. Guard table

| Condition | Behavior |
|---|---|
| Scenario context key absent from `PRODUCER_CONTEXTS[code].context` | Catalog-test failure (§5), message names the key + producer `path:line` |
| Scenario omits a `requiredKeys` member | Catalog-test failure (§5) |
| Scenario declares a crew UUID outside the gallery roster | Catalog-test failure (§5) |
| `crew_member_ids` length 1, or duplicate members | Validator reject (§4) |
| `crew_member_ids` and `crewMatch` disagree | Validator reject (§5) |
| Producer context built by helper/variable | Requires `computed` row naming the helper (§6); absent → test failure |
| Code in registry but not raised via `upsertAdminAlert` | Declared exempt from discovery, still requires a `PRODUCER_CONTEXTS` row (§6) |
| Producer writes `{}` (`SYNC_STALLED`) | Legal; `requiredKeys: []` (§3) |
| Existing `crewMatch`-absent scenarios | Unchanged — section-top stays legal (§1.1) |

---

## 10. Flag lifecycle / zombie audit

No new boolean flags, config fields, or toggles. `computed` is a documentation-bearing string consumed by exactly one reader (§6 discovery) — storage: the `PRODUCER_CONTEXTS` module; write: hand-authored per row; read: the §6 parity meta-test; effect: suppresses the static literal cross-check for that code and requires a named helper citation. No empty column.

---

## 11. Meta-test inventory

<!-- spec-lint: ignore — the two files named on the Creates line are created by this bundle and cannot resolve until implementation -->

- **Creates:** `tests/adminAlerts/producerContexts.ts` (module, not a test), `tests/adminAlerts/_metaProducerContextParity.test.ts`, and the §8 gallery placement-coverage pin.
- **Extends:** `lib/dev/attentionScenarios/validate.ts` rules (§4, §5) and their existing test file; `tests/adminAlerts/alertIdentityMatrix.test.ts` (now importing the promoted fixtures, 45-code totality assertion preserved at `tests/adminAlerts/alertIdentityMatrix.test.ts:460`).
- **Not applicable:** advisory-lock topology (no lock surface touched — no producer edit, §1.1); Supabase call-boundary registry (no Supabase read/write path changes); §12.4 catalog parity (no catalog edits); mutation-surface observability (no mutation surface added); validation-schema-parity (no migration); impeccable dual-gate — **applies only if a component file changes**; the current scope touches `lib/dev/**` and `tests/**` only, so the plan re-checks this at implementation time and runs the gate if any `components/**` or `app/**` file enters the diff.

---

## 12. Test strategy

TDD per task (invariant 1). Each rule in §4/§5/§6 gets a failing test asserting the *specific* rejection before the rule exists — the anti-tautology requirement means each test names the concrete drift it catches, and the §5 subset rule's test uses the real historical defect (`crew_member_id` on `AMBIGUOUS_EMAIL_BINDING`) as its fixture. The §8 coverage pin derives expected placement from the scenario catalog rather than hardcoding a count, so adding a scenario cannot silently satisfy it.

---

## 13. Numeric self-check

36 `AdminAlertCode` union members (`lib/adminAlerts/upsertAdminAlert.ts:3-39`); 45 `ADMIN_ALERTS_CODES` registry members (`tests/adminAlerts/adminAlertCodes.fixture.ts:13-59`); 9 registry codes exempt from producer discovery (45 − 36); 2 stale fixture rows repaired (§7); 2 gallery roster UUIDs per repaired row; ≥2 `crew_member_ids` required by §4; 6 gallery crew roster rows (`lib/dev/publishedModalFixture.ts:106-123`); `CREW_CAP` = 30; 1 new scenario (§8); 2 new files + 1 promoted module (§11); 0 migrations; 0 §12.4 edits; 0 producer edits.
