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

<!-- spec-lint: ignore — created by this bundle; cannot resolve until implementation -->

- **Creates:** `tests/adminAlerts/producerContexts.ts` (a module, not a test file — it will not be collected, since both `BASE_INCLUDE` and `PARALLEL_TEST_GLOBS` match only `*.test.ts{,x}`).
- **Extends:** `tests/adminAlerts/_metaAlertProducerScope.test.ts` + `tests/adminAlerts/alertProducerScope.registry.ts` (context-key dimension, §6); `tests/adminAlerts/alertIdentityMatrix.test.ts` (imports the promoted fixtures); `tests/admin/crewMatchFanout.test.ts` (validator rules + the §8 placement-coverage pin); `tests/dev/attentionScenariosTier1.test.ts` and `tests/dev/attentionScenariosIndex.test.ts` (unchanged assertions that must keep passing — they are the regression net for Tasks 4–7).
- **Vitest wiring:** no config change needed. `tests/adminAlerts/**/*.test.{ts,tsx}` is already in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:83`); `tests/admin/**` and `tests/dev/**` are already collected via `BASE_INCLUDE` (`vitest.projects.ts:34`).

## Pre-draft code-verification pass (run 2026-07-24, before this plan body)

Every identifier named below was grepped against the live tree on this branch:

| Claim | Verified at |
|---|---|
| `PRODUCER_SCOPE`, 45 `(site, code)` rows covering 33 distinct codes; 4 rows are SQL sites; 13 of the 45 registry codes have no row | `tests/adminAlerts/alertProducerScope.registry.ts:29` (counts computed via `npx tsx`, not eyeballed) |
| `volumes.crew` grows the roster with deterministic generated ids | `lib/dev/publishedModalFixture.ts:484-488`, `lib/dev/publishedModalFixture.ts:273-279` |
| `ProducerScopeRow` type with `dynamic?` + `note?` | `tests/adminAlerts/alertProducerScope.registry.ts:17-27` |
| AST walk over `lib` + `app` + `supabase/**/*.sql` | `tests/adminAlerts/_metaAlertProducerScope.test.ts:1-45` |
| local `Fixture` type (`code`/`showId`/`context`/`occurrenceCount?`) | `tests/adminAlerts/alertIdentityMatrix.test.ts:75-81` |
| `FIXTURES` array, 45-code totality assertion | `tests/adminAlerts/alertIdentityMatrix.test.ts:86` and `tests/adminAlerts/alertIdentityMatrix.test.ts:460` |
| `ADMIN_ALERTS_CODES`, 45 members | `tests/adminAlerts/adminAlertCodes.fixture.ts:13-59` |
| `AdminAlertCode` union, 36 members | `lib/adminAlerts/upsertAdminAlert.ts:3-39` |
| conflated validator case | `lib/dev/attentionScenarios/validate.ts:106-120` |
| `validateAlert`, `DEV_SCENARIO_TAG_KEY` exemption | `lib/dev/attentionScenarios/validate.ts:154` and `lib/dev/attentionScenarios/validate.ts:159` |
| `validateCrewMatch` | `lib/dev/attentionScenarios/validate.ts:128-152` |
| stale fixture rows (FIVE, class-swept) | `lib/dev/attentionScenarios/tier1.ts:61`, `lib/dev/attentionScenarios/tier1.ts:67`, `lib/dev/attentionScenarios/tier2.ts:245`, `lib/dev/attentionScenarios/tier2.ts:809`, `lib/dev/attentionScenarios/tier3.ts:55` |
| `ALERT_ROW_OVERRIDES`, 6 entries | `lib/dev/attentionScenarios/tier1.ts:37` |
| gallery roster ids `cccccccc-…-00000000000{1..6}` | `lib/dev/publishedModalFixture.ts:106-123` |
| `deriveCrewMatch` reads `crew_member_ids` | `lib/adminAlerts/deriveAlertRowFields.ts:55-73` |
| `ALERT_IDENTITY_MAP` segment specs | `lib/adminAlerts/alertIdentityMap.ts:58-75` |
| `EMAIL_FIELD_BY_CODE` per-code email source | `lib/adminAlerts/resolveAlertIdentities.ts:69-72` |
| `crew_member_count` derived from `crew_member_ids.length` | `lib/adminAlerts/projectIdentityContext.ts:101` |
| `crewRowIndexesForIds` / `buildCrewRowResolver` | `lib/admin/crewRowMatch.ts:24` and `lib/admin/crewRowMatch.ts:61` |
| `CREW_CAP = 30` | `components/admin/wizard/step3ReviewSections.tsx:160` |
| existing fan-out test file + describes | `tests/admin/crewMatchFanout.test.ts:28` |
| gate commands | `package.json` scripts: `test`, `typecheck`, `lint`, `format:check` |

Measured (not estimated) via `npx tsx` over `ALL_SCENARIOS`: **163 scenarios (88 tier-1, 71 tier-2, 4 tier-3); 67 carry ≥1 alert; 85 alert rows; 70 of them with `context: {}`.** These are the figures Tasks 5 and 7 must not regress.

---

## Task 1: Promote the producer-context fixtures to a shared module

<!-- spec-lint: ignore — created by this bundle; cannot resolve until implementation -->

**Failing test first.** In a new `tests/adminAlerts/producerContexts.test.ts`: assert `PRODUCER_CONTEXT_LIST.map(e => e.code).sort()` equals `[...ADMIN_ALERTS_CODES].sort()` (45 codes), and that `PRODUCER_CONTEXT_BY_CODE` has an entry for each. Both fail because the module does not exist.

<!-- spec-lint: ignore — created by this bundle; cannot resolve until implementation -->

**Implementation.** Create `tests/adminAlerts/producerContexts.ts`. Move the `FIXTURES` array body out of `tests/adminAlerts/alertIdentityMatrix.test.ts:86` **verbatim, as an array** — the collection shape is preserved deliberately (§3), so `alertIdentityMatrix.test.ts` can bind `const FIXTURES = PRODUCER_CONTEXT_LIST` and keep every array-based assertion unchanged. Export `ProducerContextEntry` with exactly the old local `Fixture` fields: `code`, `showId`, `context`, `occurrenceCount?`. **Nothing else.** Key sets, producer citations, and computed-context provenance belong to the §6 registry, not here — an earlier draft put them in both places and that contradiction was a round-1 HIGH. `PRODUCER_CONTEXT_BY_CODE` is a derived index over the list, not a second source.

**Failure mode this catches:** a future code added to `ADMIN_ALERTS_CODES` without a producer-context row — today that silently leaves the identity matrix short, and after this task it fails loudly. **Anti-tautology:** the totality assertion compares against the live `ADMIN_ALERTS_CODES` import, never a hardcoded 45; the subset assertion is derived from each entry's own `context`, so an entry cannot satisfy it by declaring an empty `requiredKeys` while also carrying keys it lies about.

**Regression net:** `tests/adminAlerts/alertIdentityMatrix.test.ts` must pass unchanged in substance — its 45-code assertion at `tests/adminAlerts/alertIdentityMatrix.test.ts:460` and every per-code identity expectation. A drop or rename during the move surfaces as a compile error, not a passing test.

**Commit:** `refactor(alerts): promote per-code producer-context fixtures to a shared module`

---

## Task 2: Add the context-key dimension to the producer-scope registry

**Failing test first.** Extend `tests/adminAlerts/_metaAlertProducerScope.test.ts` with a case asserting that for every discovered call site whose `context:` argument is an object literal, the literal's top-level keys equal `contextKeys ∪ optionalContextKeys` on the matching `PRODUCER_SCOPE` row. Fails because the fields do not exist yet and no row declares them.

**Implementation.** Extend `ProducerScopeRow` (`tests/adminAlerts/alertProducerScope.registry.ts:17`) with `contextKeys?: readonly string[]`, `optionalContextKeys?: readonly string[]`, and `computedContext?: true`. Extend the existing AST discovery to visit the `context:` property of each `upsertAdminAlert` CallExpression's object argument, using the spec §6 classification table — which is **total**, so no initializer shape falls through unclassified:

- `ObjectLiteralExpression`, plain members only → `contextKeys` = those names; `optionalContextKeys` empty.
- `ObjectLiteralExpression` containing a `SpreadAssignment` over a `ConditionalExpression` → plain members are `contextKeys`; keys in either arm are `optionalContextKeys` (`lib/sync/runManualSyncForShow.ts:190`, `lib/sync/runScheduledCronSync.ts:2376`).
- `ObjectLiteralExpression` with any other spread, or an `Identifier` / `CallExpression` → `computedContext: true` plus a non-empty provenance `note`.

**The code axis and the context axis are independent** — conflating them was a round-1 HIGH. `lib/sync/applyStaged.ts:1952` and `lib/sync/applyStaged.ts:1962` are `dynamic: true` on the **code** axis (`result.adminAlertCode`, and a loop variable) while their **context** is the plain literal `{ drive_file_id: args.driveFileId }`, i.e. static. The row must say both.

**SQL sites** (4 today, e.g. `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:16`) are classified `computedContext: true` with a note naming the migration; the walker does not attempt SQL context extraction. Assert this classification positively so a SQL row cannot silently take a TypeScript-shaped branch. Note one existing SQL row registers the literal code `p_code` (a parameter name, not a real code) — leave it as-is; it is pre-existing and out of scope.

Sites needing `computedContext` on the context axis at plan time — **re-derived by the implementer against live code, not trusted from this list**: `lib/drive/watch.ts:409`, `lib/sync/runScheduledCronSync.ts:375` (bare `context` identifier), `lib/sync/runManualSyncForShow.ts:261` and `lib/sync/runScheduledCronSync.ts:3386` (`buildParseErrorContext(...)`).

**Failure mode this catches:** a producer that starts writing a new context key, or stops writing one, without any fixture or consumer noticing — precisely the drift that produced this whole bundle. **Anti-tautology:** the expected key set comes from the AST of the real call site, never from the registry row being tested; a row that simply mirrors whatever the test computed would still fail the `dynamic`/`computedContext` classification assertions.

**Commit:** `test(alerts): pin producer context keys in the producer-scope registry`

---

## Task 3: `allowedKeys` / `guaranteedKeys` aggregation helpers

**Failing test first.** Assert, for the live multi-site code `SHEET_UNAVAILABLE` (three sites: `lib/sync/runManualSyncForShow.ts:185`, `lib/sync/runScheduledCronSync.ts:2573`, `lib/sync/runScheduledCronSync.ts:2633`), that `failure_code` is in `allowedKeys` but NOT in `guaranteedKeys`, while `drive_file_id` is in both. Also assert every code's representative `context` from Task 1 has all its keys inside `allowedKeys` — the cross-check that the two modules agree without either owning the other's fact.

**Implementation.** Export from the registry module:

- `allowedKeys(code)` = union over that code's rows of (`contextKeys` and `optionalContextKeys`)
- `guaranteedKeys(code)` = intersection over that code's rows of `contextKeys`

A code whose only rows are `computedContext` still returns the hand-authored sets from those rows. A code with **no** row (13 of the 45) returns empty sets, making §5's subset rule vacuous for it — assert that explicitly so the vacuity is a stated property rather than an accident.

**Failure mode this catches:** a single-site sample mistaken for the key universe, which would reject a legitimate branch-specific key — the round-1 HIGH. **Anti-tautology:** expectations are derived from the registry rows, and `SHEET_UNAVAILABLE` is asserted by name because it is the live proof that union differs from intersection.

**Commit:** `feat(alerts): aggregate producer context keys across a code's sites`

---

## Task 4: Split the conflated validator case

**Failing test first.** In `tests/admin/crewMatchFanout.test.ts`, add to the `validateScenario` describe: a scenario whose `AMBIGUOUS_EMAIL_BINDING` row carries `context: { crew_member_id: <uuid> }` must be REJECTED with an error naming both codes; one carrying `{ email, crew_member_ids: [uuidA, uuidB] }` plus a conforming `galleryIdentity` must be ACCEPTED. `OAUTH_IDENTITY_CLAIMED` keeps its current accept/reject behavior. The first two fail today (the historical defect currently *passes* validation — that is the regression this pins).

**Implementation.** Replace `lib/dev/attentionScenarios/validate.ts:106-120`'s fall-through with one case per code, per §4: `AMBIGUOUS_EMAIL_BINDING` requires ≥2 distinct UUIDs in `context.crew_member_ids` and a non-blank `context.email`, and requires a `galleryIdentity` carrying Show + email + crew-row-count segments; `OAUTH_IDENTITY_CLAIMED` unchanged (UUID `context.crew_member_id`, exactly one `Crew` segment).

**Boundary cases, each its own assertion** (§4): `crew_member_ids` of length 1 → reject; duplicate members → reject; non-array → reject; empty array → reject; non-UUID member → reject. Distinct message per case.

**Commit:** `fix(dev): validate AMBIGUOUS_EMAIL_BINDING against its own producer context shape`

---

## Task 5: Generic gallery-to-producer binding rules

**Failing test first.** Five cases pinning the rules, each using a shape that passes today, plus three that must stay ACCEPTED:

REJECT: (a) a row carrying a key outside `allowedKeys(code)` — fixture is the real historical defect, `crew_member_id` on `AMBIGUOUS_EMAIL_BINDING`; (b) a row omitting a key in `rendererReadKeys(code)` intersect `allowedKeys(code)`; (c) a row declaring a crew UUID belonging to no row of that scenario's roster; (d) a `crewMatch` on any code other than `AMBIGUOUS_EMAIL_BINDING`; (e) a `galleryIdentity` whose email or crew-row count disagrees with `context`.

ACCEPT: (f) a row carrying `context: {}` for a code whose card reads no context; (g) a row with no `crewMatch`; (h) a row whose key is written by only some of its code's producer sites (`SHEET_UNAVAILABLE.failure_code`).

**Implementation.** Add the rules to `validateAlert` (`lib/dev/attentionScenarios/validate.ts:154`) per spec §5. Implement `rendererReadKeys(code)` from the spec's per-segment-kind table, walking `ALERT_IDENTITY_MAP[code].segments`:

| Segment kind | Context key required |
|---|---|
| `showName` | none (resolved from the `show_id` column) |
| `email` | `EMAIL_FIELD_BY_CODE[code] ?? "email"` |
| `crewName` | the spec's own `key` |
| `contextField` | the spec's own `key` |
| `count` | the UNDERLYING key: `crew_member_count` maps to `crew_member_ids`, `role_change_count` to `changes`, `failed_sheet_names_count` to `failed_sheet_names` |

Add a totality test asserting this mapping covers every `kind` in the `SegmentSpec` union, so a new segment kind fails loudly instead of silently contributing nothing. Preserve the `DEV_SCENARIO_TAG_KEY` exemption (`lib/dev/attentionScenarios/validate.ts:159`).

**Roster scoping.** The membership rule resolves against **that scenario's own** roster, not the six-row default — a scenario declaring `volumes.crew = N` has an N-row roster (`lib/dev/publishedModalFixture.ts:484-488`). This is what makes Task 7's beyond-cap case expressible without an exemption; getting it wrong reintroduces the round-1 BLOCKING.

**The 70-row constraint is a hard acceptance criterion.** After this task, `tests/dev/attentionScenariosTier1.test.ts` and `tests/dev/attentionScenariosIndex.test.ts` must still pass with zero scenario edits beyond Tasks 6-7. If any of the 70 empty-context alert rows starts failing, the `rendererReadKeys` derivation is wrong — fix the derivation, never the scenarios.

**Anti-tautology:** case (a) uses the actual historical defect as its fixture, so the test would have caught the real bug. The roster case derives the roster from the fixture builder rather than hardcoding ids, so a roster edit cannot silently neuter it.

**Commit:** `feat(dev): bind gallery scenario contexts to their producers' key sets`

---

## Task 6: Repair all five stale fixture rows

**Failing test first.** Tasks 4 and 5 already turn these rows red. Add one explicit assertion that the tier-1 `AMBIGUOUS_EMAIL_BINDING` scenario derives a non-undefined `crewMatch` whose ids resolve to rendered roster indexes via `buildCrewRowResolver`.

**Implementation.** Five rows, not two — the class-sweep inventory in spec §7:

| Row | Code | Repair |
|---|---|---|
| `lib/dev/attentionScenarios/tier1.ts:61` | `AMBIGUOUS_EMAIL_BINDING` | plural `crew_member_ids` + `email`, roster ids, agreeing identity |
| `lib/dev/attentionScenarios/tier1.ts:67` | `OAUTH_IDENTITY_CLAIMED` | id only — swap `7a1b2c3d-…` for a roster member; the singular key is CORRECT for this code |
| `lib/dev/attentionScenarios/tier2.ts:245` | `crewCode()` helper | same as tier1:61; count the `crewAlert()` call sites rather than assuming one |
| `lib/dev/attentionScenarios/tier2.ts:809` | `AMBIGUOUS_EMAIL_BINDING` | same as tier1:61 |
| `lib/dev/attentionScenarios/tier3.ts:55` | `AMBIGUOUS_EMAIL_BINDING` | same as tier1:61 |

Roster ids come from `lib/dev/publishedModalFixture.ts:107-113`. Identity segments must satisfy Task 5 rule (e): email equals `context.email`, count equals `crew_member_ids.length`.

**Class-sweep before finishing.** Re-run `rg -n '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' lib/dev/attentionScenarios/*.ts` and confirm every hit is a roster member. Record the command and output in the commit body.

**Commit:** `fix(dev): give the gallery crew-alert scenarios their real producer context`

---

## Task 7: Beyond-cap fallback scenario + placement-coverage pin

**Failing test first.** In `tests/admin/crewMatchFanout.test.ts`, assert BY SCENARIO ID:

- `scenarioIdForCode("alert", "AMBIGUOUS_EMAIL_BINDING")` derives a **fanned-out** placement;
- the new tier-2 fallback scenario id derives a **section-top** placement.

Both fail before the new scenario exists (after Task 6 every ambiguous-email scenario fans out). A third, weaker existential assertion covers the rest of the catalog. Naming the ids is the point: an existential-only pin can be satisfied by an unrelated scenario after the intended one regresses — that was a round-1 MEDIUM.

**Implementation.** Add one tier-2 scenario declaring `volumes: { crew: 35 }`, growing its roster to 35 generated rows (`lib/dev/publishedModalFixture.ts:484-488`, ids from `genCrewRow`, `lib/dev/publishedModalFixture.ts:273-279`). Its `crewMatch` names a roster member at index >= 30. That id IS a roster member, so Task 5's membership rule passes; but `buildCrewRowResolver` slices to `CREW_CAP = 30` before matching (`lib/admin/crewRowMatch.ts:64`), so `hits(id) === 0`, the resolver returns null (`lib/admin/crewRowMatch.ts:46`), and placement falls back to section-top.

**Generated ids — derived at plan time, to be re-derived at implementation time.** `genCrewRow` builds `cccccccc-0000-4000-8000-${pad3(i)}000000000` then `.slice(0, 36)`. Note the growth loop starts from the existing roster length: with the 6 default rows present, `volumes.crew = 35` appends `genCrewRow(7)` through `genCrewRow(35)`, so **0-based index 30 (the 31st row) is `genCrewRow(31)` = `cccccccc-0000-4000-8000-031000000000`**.

Verified by direct computation (2026-07-24): all 35 ids match the `UUID_RE` shape used by the validators, all 35 are distinct, and none collides with the six default roster ids. The implementer still recomputes rather than pasting — a `.slice(0, 36)` off-by-one would silently yield a non-roster id and reintroduce the exact failure this scenario exists to demonstrate legitimately — but the value above is the expected answer and a mismatch means something moved.

**Anti-tautology:** assertions run `bucketAttention` over each scenario's derived items and inspect which bucket the banner landed in — never a container that could render either, never the scenario's own declaration.

**Commit:** `test(dev): pin gallery coverage of both crew-banner placements by scenario id`

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
- **Round-1 adversarial findings** (2 BLOCKING, 6 HIGH, 3 MEDIUM) were all accepted and folded into the spec before this plan was finalized; Tasks 1, 3, 5, 6, and 7 were rewritten to match. The plan was never dispatched for review in its pre-repair form.
- **Ordering risk:** Tasks 4 and 5 deliberately turn the catalog red before Task 6 repairs it. Each of those commits therefore has a failing catalog test by construction. This is the TDD invariant working as intended, but Task 6 must land in the same PR; the branch is never merged between Task 4 and Task 6.
