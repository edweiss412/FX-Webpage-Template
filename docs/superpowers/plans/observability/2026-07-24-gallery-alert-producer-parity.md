# Gallery alert producer-parity — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-24-gallery-alert-producer-parity.md` (canonical; section references below are to it)
**Branch:** `fix/gallery-alert-producer-parity`
**Date:** 2026-07-24

---

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal implementation → passing test → commit. One commit per task, conventional-commits style.
- **No producer edits.** Every task below touches fixtures, validators, registries, and tests only. If a task appears to need a producer change, stop — the spec's §1.1 forbids it and the need signals a misread.
- **No DB migration, no §12.4 catalog edit, no `components/**` or `app/**` file.** The impeccable dual-gate (invariant 8) is therefore not triggered. Task 8 re-checks this against the actual diff rather than trusting the plan.
- **Advisory-lock topology (invariant 2):** N/A — no task touches `pg_advisory*`, and no producer call shape changes, so no lock surface is added or moved.
- **Supabase call-boundary discipline (invariant 9):** N/A — no task adds or edits a Supabase client call.
- **Mutation-surface observability (invariant 10):** N/A — no mutating route or `"use server"` action is added or edited.

## Meta-test inventory (declared per AGENTS.md writing-plans rule)

- **Creates:** `tests/adminAlerts/producerContexts.ts` (a module, not a test file — it will not be collected, since both `BASE_INCLUDE` and `PARALLEL_TEST_GLOBS` match only `*.test.ts{,x}`).
- **Extends:** `tests/adminAlerts/_metaAlertProducerScope.test.ts` + `tests/adminAlerts/alertProducerScope.registry.ts` (context-key dimension, §6); `tests/adminAlerts/alertIdentityMatrix.test.ts` (imports the promoted fixtures); `tests/admin/crewMatchFanout.test.ts` (validator rules + the §8 placement-coverage pin); `tests/dev/attentionScenariosTier1.test.ts` and `tests/dev/attentionScenariosIndex.test.ts` (unchanged assertions that must keep passing — they are the regression net for Tasks 4–7).
- **Vitest wiring:** no config change needed. `tests/adminAlerts/**/*.test.{ts,tsx}` is already in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:83`); `tests/admin/**` and `tests/dev/**` are already collected via `BASE_INCLUDE` (`vitest.projects.ts:34`).

## Pre-draft code-verification pass (run 2026-07-24, before this plan body)

Every identifier named below was grepped against the live tree on this branch:

| Claim | Verified at |
|---|---|
| `PRODUCER_SCOPE`, 46 `(site, code)` rows | `tests/adminAlerts/alertProducerScope.registry.ts:29` |
| `ProducerScopeRow` type with `dynamic?` + `note?` | `tests/adminAlerts/alertProducerScope.registry.ts:17-27` |
| AST walk over `lib` + `app` + `supabase/**/*.sql` | `tests/adminAlerts/_metaAlertProducerScope.test.ts:1-45` |
| local `Fixture` type (`code`/`showId`/`context`/`occurrenceCount?`) | `tests/adminAlerts/alertIdentityMatrix.test.ts:75-81` |
| `FIXTURES` array, 45-code totality assertion | `tests/adminAlerts/alertIdentityMatrix.test.ts:86`, `:460` |
| `ADMIN_ALERTS_CODES`, 45 members | `tests/adminAlerts/adminAlertCodes.fixture.ts:13-59` |
| `AdminAlertCode` union, 36 members | `lib/adminAlerts/upsertAdminAlert.ts:3-39` |
| conflated validator case | `lib/dev/attentionScenarios/validate.ts:106-120` |
| `validateAlert`, `DEV_SCENARIO_TAG_KEY` exemption | `lib/dev/attentionScenarios/validate.ts:154`, `:159` |
| `validateCrewMatch` | `lib/dev/attentionScenarios/validate.ts:128-152` |
| stale fixture rows | `lib/dev/attentionScenarios/tier1.ts:60-65`, `lib/dev/attentionScenarios/tier2.ts:808-813` |
| `ALERT_ROW_OVERRIDES`, 6 entries | `lib/dev/attentionScenarios/tier1.ts:37` |
| gallery roster ids `cccccccc-…-00000000000{1..6}` | `lib/dev/publishedModalFixture.ts:106-123` |
| `deriveCrewMatch` reads `crew_member_ids` | `lib/adminAlerts/deriveAlertRowFields.ts:55-73` |
| `ALERT_IDENTITY_MAP` segment specs | `lib/adminAlerts/alertIdentityMap.ts:58-75` |
| `EMAIL_FIELD_BY_CODE` per-code email source | `lib/adminAlerts/resolveAlertIdentities.ts:69-72` |
| `crew_member_count` derived from `crew_member_ids.length` | `lib/adminAlerts/projectIdentityContext.ts:101` |
| `crewRowIndexesForIds` / `buildCrewRowResolver` | `lib/admin/crewRowMatch.ts:24`, `:61` |
| `CREW_CAP = 30` | `components/admin/wizard/step3ReviewSections.tsx:160` |
| existing fan-out test file + describes | `tests/admin/crewMatchFanout.test.ts:28,76,112,170` |
| gate commands | `package.json` scripts: `test`, `typecheck`, `lint`, `format:check` |

Measured (not estimated) via `npx tsx` over `ALL_SCENARIOS`: **163 scenarios (88 tier-1, 71 tier-2, 4 tier-3); 67 carry ≥1 alert; 85 alert rows; 70 of them with `context: {}`.** These are the figures Tasks 5 and 7 must not regress.

---

## Task 1: Promote the producer-context fixtures to a shared module

**Failing test first.** In a new `tests/adminAlerts/producerContexts.test.ts`: assert `Object.keys(PRODUCER_CONTEXTS).sort()` equals `[...ADMIN_ALERTS_CODES].sort()` (45 codes), and that every entry's `requiredKeys` is a subset of `Object.keys(entry.context)`. Both fail because the module does not exist.

**Implementation.** Create `tests/adminAlerts/producerContexts.ts`. Move the `FIXTURES` array body out of `tests/adminAlerts/alertIdentityMatrix.test.ts:86` verbatim, keyed by code. Export `ProducerContextEntry` as a strict superset of the old local `Fixture` (§3 field-preservation rule): `code`, `showId`, `context`, `occurrenceCount?` keep name/type/optionality; `producer`, `requiredKeys`, `optionalKeys?`, `computed?` are additive. `alertIdentityMatrix.test.ts` imports `PRODUCER_CONTEXTS` and derives its local `FIXTURES` from it.

**Failure mode this catches:** a future code added to `ADMIN_ALERTS_CODES` without a producer-context row — today that silently leaves the identity matrix short, and after this task it fails loudly. **Anti-tautology:** the totality assertion compares against the live `ADMIN_ALERTS_CODES` import, never a hardcoded 45; the subset assertion is derived from each entry's own `context`, so an entry cannot satisfy it by declaring an empty `requiredKeys` while also carrying keys it lies about.

**Regression net:** `tests/adminAlerts/alertIdentityMatrix.test.ts` must pass unchanged in substance — its 45-code assertion at `:460` and every per-code identity expectation. A drop or rename during the move surfaces as a compile error, not a passing test.

**Commit:** `refactor(alerts): promote per-code producer-context fixtures to a shared module`

---

## Task 2: Add the context-key dimension to the producer-scope registry

**Failing test first.** Extend `tests/adminAlerts/_metaAlertProducerScope.test.ts` with a case asserting that for every discovered call site whose `context:` argument is an object literal, the literal's top-level keys equal `contextKeys ∪ optionalContextKeys` on the matching `PRODUCER_SCOPE` row. Fails because the fields do not exist yet and no row declares them.

**Implementation.** Extend `ProducerScopeRow` (`tests/adminAlerts/alertProducerScope.registry.ts:17`) with `contextKeys?: readonly string[]`, `optionalContextKeys?: readonly string[]`, and `computedContext?: true`. Extend the existing AST discovery to also visit the `context:` property of each `upsertAdminAlert` CallExpression's object argument:

- `ObjectLiteralExpression` → collect `PropertyAssignment` / `ShorthandPropertyAssignment` names as required; collect names inside a `SpreadAssignment` whose expression is a `ConditionalExpression` as optional (the `...(cond ? { k: v } : {})` form at `lib/sync/runManualSyncForShow.ts:190` and `lib/sync/runScheduledCronSync.ts:2376`).
- anything else (`Identifier`, `CallExpression`) → require `computedContext: true` on the row, plus a non-empty `note`.

Populate every row. Sites known to need `computedContext` at plan time — **re-derived by the implementer against live code, not trusted from this list**: `lib/drive/watch.ts:409` (`context` variable), `lib/sync/runScheduledCronSync.ts:375` (`context` variable), `lib/sync/runManualSyncForShow.ts:261` and `lib/sync/runScheduledCronSync.ts:3386` (`buildParseErrorContext(...)`), and the dynamic-code sites at `lib/sync/applyStaged.ts:1952` / `:1962`.

**Failure mode this catches:** a producer that starts writing a new context key, or stops writing one, without any fixture or consumer noticing — precisely the drift that produced this whole bundle. **Anti-tautology:** the expected key set comes from the AST of the real call site, never from the registry row being tested; a row that simply mirrors whatever the test computed would still fail the `dynamic`/`computedContext` classification assertions.

**Commit:** `test(alerts): pin producer context keys in the producer-scope registry`

---

## Task 3: Derive `requiredKeys` from the registry so the two cannot drift

**Failing test first.** Assert that for every code, `PRODUCER_CONTEXTS[code].requiredKeys` equals the union of `contextKeys` across that code's `PRODUCER_SCOPE` rows (a code may have several producer sites). Fails while `requiredKeys` is hand-authored.

**Implementation.** Replace the hand-authored `requiredKeys` with a derivation over `PRODUCER_SCOPE`, keeping `context` (the representative *value*) hand-authored in the module. §3's split stands: the registry owns *which keys exist*; the module owns *what a realistic value looks like*.

**Guard condition:** a code with multiple producer sites writing different key sets (e.g. `SHEET_UNAVAILABLE` at `lib/sync/runManualSyncForShow.ts:185`, `lib/sync/runScheduledCronSync.ts:2573`, `:2633`) takes the **intersection** for required and the **union minus intersection** for optional — a key only some sites write is not guaranteed present. The test states this explicitly with `SHEET_UNAVAILABLE` as the worked example, since it is the live multi-site case.

**Commit:** `refactor(alerts): derive producer-context required keys from the scope registry`

---

## Task 4: Split the conflated validator case

**Failing test first.** In `tests/admin/crewMatchFanout.test.ts`, add to the `validateScenario` describe: a scenario whose `AMBIGUOUS_EMAIL_BINDING` row carries `context: { crew_member_id: <uuid> }` must be REJECTED with an error naming both codes; one carrying `{ email, crew_member_ids: [uuidA, uuidB] }` plus a conforming `galleryIdentity` must be ACCEPTED. `OAUTH_IDENTITY_CLAIMED` keeps its current accept/reject behavior. The first two fail today (the historical defect currently *passes* validation — that is the regression this pins).

**Implementation.** Replace `lib/dev/attentionScenarios/validate.ts:106-120`'s fall-through with one case per code, per §4: `AMBIGUOUS_EMAIL_BINDING` requires ≥2 distinct UUIDs in `context.crew_member_ids` and a non-blank `context.email`, and requires a `galleryIdentity` carrying Show + email + crew-row-count segments; `OAUTH_IDENTITY_CLAIMED` unchanged (UUID `context.crew_member_id`, exactly one `Crew` segment).

**Boundary cases, each its own assertion** (§4): `crew_member_ids` of length 1 → reject; duplicate members → reject; non-array → reject; empty array → reject; non-UUID member → reject. Distinct message per case.

**Commit:** `fix(dev): validate AMBIGUOUS_EMAIL_BINDING against its own producer context shape`

---

## Task 5: Generic gallery↔producer binding rules

**Failing test first.** Three cases, each pinning one rule and each using a shape that passes today: (a) a scenario row carrying a key absent from that code's `PRODUCER_CONTEXTS` context → rejected, message names the key and the producer site; (b) a row omitting a key the *renderer* reads for its code → rejected; (c) a row declaring a crew UUID outside the gallery roster → rejected. Plus two negative cases that must stay ACCEPTED: a row carrying `context: {}` for a code whose card reads no context, and a row whose `crewMatch` is absent.

**Implementation.** Add the rules to `validateAlert` (`lib/dev/attentionScenarios/validate.ts:154`) per §5. The renderer-read key set is derived per code by walking `ALERT_IDENTITY_MAP[code].segments` and mapping each `SegmentSpec` to the context key it consumes: `email` → `EMAIL_FIELD_BY_CODE[code] ?? "email"` (`lib/adminAlerts/resolveAlertIdentities.ts:69-72`); `crewName`/`count`/`contextField` → the spec's own `key`, except that `crew_member_count` maps to its underlying `crew_member_ids` (`lib/adminAlerts/projectIdentityContext.ts:101`); `showName` reads no context key. Preserve the `DEV_SCENARIO_TAG_KEY` exemption (`validate.ts:159`). Add the `crewMatch` ↔ `context.crew_member_ids` agreement check.

**The 70-row constraint is a hard acceptance criterion.** After this task, `tests/dev/attentionScenariosTier1.test.ts` and `tests/dev/attentionScenariosIndex.test.ts` must still pass with zero scenario edits beyond Tasks 6–7. If any of the 70 empty-context alert rows starts failing, the renderer-read derivation is wrong — fix the derivation, never the scenarios.

**Anti-tautology:** case (a) uses the real historical defect (`crew_member_id` on `AMBIGUOUS_EMAIL_BINDING`) as its fixture, so the test would have caught the actual bug. The roster-membership case derives the roster from `publishedModalFixture` rather than hardcoding ids, so a roster edit cannot silently neuter it.

**Commit:** `feat(dev): bind gallery scenario contexts to their producers' key sets`

---

## Task 6: Repair the two stale fixture rows

**Failing test first.** Task 4 and Task 5's tests already fail against the live `tier1.ts` / `tier2.ts` rows once those tasks land — this task is the repair that makes the whole catalog green again. Add one explicit assertion that the tier-1 `AMBIGUOUS_EMAIL_BINDING` scenario derives a non-undefined `crewMatch` whose ids resolve to rendered roster indexes via `buildCrewRowResolver`.

**Implementation.** Per §7, in both `lib/dev/attentionScenarios/tier1.ts:60-65` and `lib/dev/attentionScenarios/tier2.ts:808-813`: `context: { email, crew_member_ids: [<two gallery roster UUIDs>] }` drawn from `lib/dev/publishedModalFixture.ts:107-113`, and a `galleryIdentity` carrying Show + email + crew-row-count segments.

**Class-sweep before finishing:** `rg -n "crew_member_id\b" lib/dev/` must return no `AMBIGUOUS_EMAIL_BINDING`-adjacent hit. Record the command and its output in the commit body.

**Commit:** `fix(dev): give the gallery duplicate-email scenarios their real producer context`

---

## Task 7: Section-top fallback scenario + placement-coverage pin

**Failing test first.** In `tests/admin/crewMatchFanout.test.ts`, assert over the whole scenario catalog that at least one scenario produces a **fanned-out** crew placement and at least one produces a **section-top** crew placement. Fails before the new scenario exists (after Task 6, every `AMBIGUOUS_EMAIL_BINDING` scenario fans out).

**Implementation.** Add one tier-2 scenario per §8 declaring a `crewMatch` whose ids are legal UUIDs but resolve to no rendered row, so `crewRowIndexesForIds` returns `null` (`lib/admin/crewRowMatch.ts:46`) and placement falls back to section-top — exercising the fallback without a malformed context. Note the §5 roster-membership rule must admit this deliberate case: scope that rule to `context` crew-id keys, and let a `crewMatch` declare a non-roster id **only** when the scenario is explicitly marked as a fallback demo. The implementer resolves the exact marker; the constraint is that "unresolvable id" stays expressible for this scenario and stays rejected everywhere else.

**Anti-tautology:** the assertion runs `bucketAttention` over each scenario's derived items and inspects which bucket the banner landed in — not a container that could render either placement, and not the scenario's own declaration.

**Commit:** `test(dev): pin gallery coverage of both crew-banner placements`

---

## Task 8: Whole-suite verification + gates

Run and record output for each, in order:

1. `pnpm typecheck` — catches what vitest's type-stripping hides.
2. `pnpm lint`
3. `pnpm format:check` — the branch commits with `--no-verify`, so prettier is not otherwise enforced.
4. `pnpm test` — the FULL suite, not a scoped selection. Scoped runs miss the registry suites (`tests/styles`, `tests/help`) that source-scanning meta-tests live in.
5. `pnpm spec:lint` on both the spec and this plan.
6. Re-check the invariant-8 trigger against the real diff: `git diff --name-only origin/main... | grep -E '^(components/|app/(?!api/))'` must be empty. If it is not, the impeccable dual-gate applies and must run before merge.

Fix-forward on any failure; do not merge on a red gate. Verify pre-existing failures at the merge base before attributing them to this branch.

**Commit:** `chore(alerts): whole-suite verification for the producer-parity bundle`

---

## Self-review notes (writing-plans)

- **Snippets:** this plan embeds no TypeScript snippet. Every task names exact identifiers and `file:line` targets instead, so there is no paste-time compile surface to typecheck. Implementation code is written test-first inside each task.
- **Reconciliation sweeps authored AND run:** the `ALL_SCENARIOS` measurement (163/67/85/70) and the 36-vs-45 code-set diff were both executed at plan time and their outputs recorded above, not left as instructions.
- **e2e harness:** N/A — no Playwright test is added. The existing fan-out e2e (`tests/e2e/published-show-attention.spec.ts:132`) is untouched and remains the production-side proof.
- **Layout-dimensions / transition-audit tasks:** N/A — no component renders differently as a result of this bundle; the gallery's visual change comes entirely from fixture data flowing through unchanged components.
- **Structural-defense calibration:** the defense (Tasks 2, 3, 5) ships in the same bundle as the instance fix (Task 6), per the "nameable at first occurrence" tightening — not deferred to a later round.
- **Ordering risk:** Tasks 4 and 5 deliberately turn the catalog red before Task 6 repairs it. Each of those commits therefore has a failing catalog test by construction. This is the TDD invariant working as intended, but Task 6 must land in the same PR; the branch is never merged between Task 4 and Task 6.
