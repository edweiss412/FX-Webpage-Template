# Spec: MI-1 garbage-sheet early-return end-to-end coverage

**Date:** 2026-07-06
**Type:** Test-coverage gap-fill (no production source change)
**Origin:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/edge-case-preparedness-audit-2026-07-04.md` rec-6 item (b): "MI-1 e2e test".

## 1. Problem

The audit's Tier-4 test-coverage section (audit line 69) states:

> **MI-1 (garbage sheet → hardError) untested end-to-end** at `parseSheet` — `parseSheet.test.ts:207` deliberately avoids the early-return path.

`parseSheet` has an early-return "not a sheet" branch (`lib/parser/index.ts:536-544`): when `classifyVersion(markdown).status === "not_a_sheet"` it pushes a single `MI-1_VERSION_DETECTION_FAILED` hardError and returns `buildMinimalParsedSheet("v4", hardErrors)` (`lib/parser/index.ts:481-514`) — a minimal-but-valid stub with empty crew/rooms/hotel/contacts, `template_version: "v4"` placeholder, empty title, `transportation: null`, `pullSheet: null`. This stub is the fail-closed contract that Phase-1 depends on: `runInvariants` (`lib/parser/invariants.ts:98`) must map the resulting `hardErrors` to `hard_fail` so the sheet is held for review, never applied.

### What is and is not already covered

- `tests/parser/schema.test.ts:177-179` — `classifyVersion("")` / non-table prose → `not_a_sheet` (unit, one layer only).
- `tests/parser/parseSheet.test.ts:318-322` (added 2026-07-04 alongside VERSION_AMBIGUOUS) — `parseSheet("# A document\n\nno tables here")` asserts the MI-1 hardError **code is present** and VERSION_AMBIGUOUS is absent. It does **not** assert the full stub contract (empty crew/rooms, v4 placeholder, empty title, no-throw, exactly-one hardError, empty warnings).
- `tests/invariants/mi.test.ts:126-134` — `runInvariants` hard-fails when a `MI-1_VERSION_DETECTION_FAILED` hardError is present, but the input is a **hand-constructed** `ParseResult` with an otherwise-VALID crew/rooms body (`synthParseResult`). The real garbage stub has **empty** crew and rooms.
- `tests/sync/dev-routing.test.ts:290` — feeds garbage markdown (`SYNTHETIC_NO_VERSION_MARKDOWN`, no version markers) to the real dev-tool action `parseAndStage` (`@/app/admin/dev/actions`, seam at `app/admin/dev/actions.ts:51-53`) and asserts a fuller chain: `result.hardFailCodes` contains MI-1, `result.outcome === "hard_fail"`, staging kind `pending_ingestion`, and the `dev.pending_ingestions` row's `last_error_code === "MI-1_VERSION_DETECTION_FAILED"`. This test **does run in CI** — `.github/workflows/unit-suite.yml` boots local Supabase (`scripts/ci/supabase-local-bootstrap.sh`) and runs the whole sharded vitest suite, excluding only three env-bound files (`ENV_BOUND_EXCLUDES` at `vitest.projects.ts:34-38`: `tests/admin/test-auth-gate.test.ts`, `tests/cross-cutting/pg-cron-coverage.test.ts`, `tests/cross-cutting/email-canonicalization.test.ts`, gated by `VITEST_EXCLUDE_ENV_BOUND=1` set in `unit-suite.yml`); dev-routing is not among them. **But** it (a) **requires a booted Supabase** — it uses `admin.schema("dev")` against a real DB (`tests/e2e/helpers/supabaseAdmin`), so it does NOT run in a plain local `pnpm test` without DB infra (it is in the env-dependent set that fails locally with no Supabase); (b) routes through the heavyweight `parseAndStage` admin dev-tool + `dev.*` shadow schema, not the production parser boundary; and (c) asserts only the error **code** + DB row, never the parser's early-return **stub shape**.

### The genuine remaining gap

Two things remain unproven by a **fast, DB-free, hermetic** test at the parser boundary:

1. **The early-return stub CONTRACT (shape, not just code).** `parseSheet.test.ts:318-322` already covers what a code-level regression would break for its one prose input: it asserts the MI-1 code IS present and VERSION_AMBIGUOUS is absent, and — because it calls `parseSheet(...)` directly — it would also fail if that path threw. What NO test asserts is the full early-return **stub shape**: empty crew/rooms/hotel/contacts, `transportation: null`, `pullSheet: null`, `template_version: "v4"` placeholder, empty title, **empty warnings**, and **exactly ONE** hardError. `dev-routing.test.ts:290` checks only code + DB row; `buildMinimalParsedSheet` (`lib/parser/index.ts:481-514`) has no direct shape test. A regression that added a spurious warning, populated a stray field, or emitted a second hardError alongside MI-1 would slip past every existing test. This shape is the fail-closed contract PR #339 (finding #17) relies on.

2. **The parser→invariants COMPOSITION without the DB / dev-tool layer.** The documented production seam is `parseSheet → enrichWithDrivePins → runInvariants → phase1` (`lib/sync/enrichWithDrivePins.ts:12-13`; dev-tool variant `app/admin/dev/actions.ts:51-53`). The only end-to-end garbage→hard_fail proof (`dev-routing.test.ts:290`) requires a booted Supabase and goes through `parseAndStage` + `dev.*`; it does **not** run in a DB-free `pnpm test` and does **not** isolate the pure `parseSheet(garbage) → enrichWithDrivePins → runInvariants` composition. `mi.test.ts:126` proves `runInvariants` on a **hand-fed** hardError atop a valid crew/rooms body, never the real empty-crew/empty-rooms garbage stub.

Closing both in one fast, hermetic test guards the fail-closed contract that item (a) / finding #17 relies on — a regression in the early-return stub shape (or in how `classifyVersion` gates garbage) that stopped the sheet hard-failing would auto-apply an empty sheet over a live show — with a signal that runs in a plain `pnpm test` and needs no Supabase, unlike the only existing end-to-end proof (which requires DB infra and routes through the dev-tool layer).

## 2. Goal

Add one test file that closes the gap with two assertions, using only REAL production functions (no hand-fed hardError, no invalid cast):

1. **Stub-contract assertion.** For several genuinely-garbage inputs, REAL `parseSheet` returns the complete early-return stub without throwing.
2. **Composed-hard_fail assertion.** The REAL stub, bridged through REAL `enrichWithDrivePins` into a genuine `ParseResult`, is classified `hard_fail` by REAL `runInvariants` with `MI-1_VERSION_DETECTION_FAILED` in `failedCodes`.

## 3. Scope

- **In scope:** one new test file `tests/parser/mi1EarlyReturnE2e.test.ts`. No production source change.
- **Out of scope:** widening `classifyVersion` acceptance (that is audit rec-1, not rec-6b); fuzz/property testing (rec-5, separate item); the sync-layer first-seen/existing-show routing (already covered end-to-end for the throw path by `tests/sync/parseSheetCallSiteGuard.test.ts` shipped in PR #339); the DB-backed dev-tool routing to `dev.pending_ingestions` (already covered by the DB-gated `tests/sync/dev-routing.test.ts:290`). This spec deliberately does not duplicate the sync/DB layers — it adds the **fast, DB-free** parser-boundary stub-contract + parser→invariants composition proof, which is the layer the audit line scopes with "at `parseSheet`" and which no existing fast unit test covers.

## 4. Detailed behavior

### 4.1 Garbage inputs to cover

Each must make `classifyVersion` return `not_a_sheet` (no pipe-table markers at all). Cover the distinct not-a-sheet shapes so the test is not a single-input point-check:

| # | Input | Why it is not-a-sheet |
|---|-------|-----------------------|
| 1 | `""` (empty string) | zero content |
| 2 | `"# A document\n\nno pipe tables here"` | prose, no pipe tables (mirrors schema.test.ts:179) |
| 3 | `"   \n\t\n   "` (whitespace only) | blank |
| 4 | `"Just one line of plain text with no pipes"` | single prose line |

If any input does NOT classify as `not_a_sheet` (e.g. a future `classifyVersion` change starts recognizing one), the stub-contract assertion for that input fails loudly rather than silently passing — see §4.4 guard.

### 4.2 Stub-contract assertion (per input)

For each garbage input, call `const parsed = parseSheet(input, "<name>.md")` and assert — the call must not throw, and:

- `parsed.hardErrors` deep-equals exactly `[{ code: "MI-1_VERSION_DETECTION_FAILED", message: <the index.ts:539-541 message> }]` — exactly ONE hardError, the MI-1 code, no VERSION_AMBIGUOUS. (Assert length === 1 AND the code, to pin "exactly one".)
- `parsed.crewMembers` deep-equals `[]`
- `parsed.rooms` deep-equals `[]`
- `parsed.hotelReservations` deep-equals `[]`
- `parsed.contacts` deep-equals `[]`
- `parsed.transportation` === `null`
- `parsed.pullSheet` === `null`
- `parsed.show.template_version` === `"v4"`
- `parsed.show.title` === `""`
- `parsed.warnings` deep-equals `[]`

The message literal is derived from `lib/parser/index.ts:539-541` at authoring time and cited in a code comment; if the production message changes, the test must be updated in the same commit (a deliberate change-detector on the user-facing MI-1 message, not an incidental coupling).

### 4.3 Composed-hard_fail assertion

Using the ready-made helpers `mockDriveClient` (`@/lib/sync/mocks/mockDriveClient`) and a `baseCtx` (mirroring `tests/sync/enrichWithDrivePins.runOfShow.test.ts:39-48`):

```
const parsed = parseSheet("# A document\n\nno pipe tables here", "garbage.md");
const enriched = await enrichWithDrivePins(parsed, mockDriveClient, baseCtx); // ParseResult
const outcome = runInvariants(null, enriched);
expect(outcome.outcome).toBe("hard_fail");
expect(outcome.failedCodes).toContain("MI-1_VERSION_DETECTION_FAILED");
```

- `runInvariants` is called with `prior = null` (first-seen framing — the harshest, no last-good to fall back to).
- No cast: `enrichWithDrivePins` returns a genuine `ParseResult`, which is `runInvariants`'s exact input type — this is the real seam, so the test cannot pass by an invalid type coercion.
- The garbage stub has empty crew AND empty rooms, so other MI invariants (no-crew / no-rooms) may ALSO fire; the assertion is `toContain` (MI-1 is present among the failed codes), not `toEqual` a single code — asserting the sheet hard-fails AND that MI-1 specifically is one reason. This is intentional: the contract is "garbage hard-fails and MI-1 is a stated cause", not "MI-1 is the only cause".

### 4.4 Non-tautology / anti-self-satisfaction guards

- **Every function under test is the REAL production function** (`parseSheet`, `enrichWithDrivePins`, `runInvariants`, `classifyVersion` transitively). The only mock is `mockDriveClient`, which is a noop for a garbage stub (no reel, no linked folder, no embedded images) — it exists solely to satisfy the seam's signature, not to shape the outcome.
- **The stub-contract assertion asserts the data source** (`parsed.*`), not a container that also renders it — there is no rendering layer here, so the anti-tautology rule reduces to "assert the real return value", satisfied.
- **Hermeticity (no Supabase / no network).** Both the garbage path and the negative control pass venue-**less** sheets through `enrichWithDrivePins`. `enrichWithDrivePins` always calls `enrichVenueGeocode` (`lib/sync/enrichWithDrivePins.ts:417`), which **early-returns before any cache/Supabase/network access when `venue` is null or has no name** (`lib/sync/enrichVenueGeocode.ts:74`). The garbage stub has `venue: null` (`buildMinimalParsedSheet`, `lib/parser/index.ts:491`); the negative-control synthetic sheet (below) has no venue block, so its parsed `show.venue` is `null` too. This makes the geocode path a guaranteed noop **regardless of whether `GOOGLE_GEOCODING_API_KEY` is set** — the test cannot enter the DB/network branch (`enrichVenueGeocode.ts:76-107`). A real fixture with a venue (e.g. `east-coast.md`, which has a venue at line 9) is therefore deliberately NOT used, since with the key set it would read the geocode cache via Supabase.
- **Negative control (anti-self-satisfaction).** To prove the MI-1 hard-fail is caused by the garbage — not by the harness/enrich/invariants always hard-failing on MI-1 — run a version-**valid, venue-less** synthetic sheet through the SAME `parseSheet → enrichWithDrivePins → runInvariants` chain and assert `failedCodes` does NOT contain `MI-1_VERSION_DETECTION_FAILED`. Use `"| RENTAL PICKUP | Mon |\n| RENTAL RETURN | Fri |\n| CONTACT OFFICE | 555 |\n| SITE CONTACT | Jane |"` — verified at authoring time to yield `classifyVersion → { status: "confident", version: "v4" }`, `parseSheet` with `hardErrors: []` and `show.venue: null`. (This sheet has no crew/rooms, so it may still hard-fail on MI-2/MI-3 — that is fine and expected; the control asserts only the **absence of MI-1** among `failedCodes`, which is the anti-self-satisfaction guarantee.)

## 5. Guard conditions

- **Empty-string input:** covered (§4.1 #1) — must not throw, must produce the stub.
- **Whitespace-only input:** covered (§4.1 #3).
- **A garbage input that unexpectedly classifies as a sheet:** the exactly-one-MI-1-hardError assertion fails for that input (its hardErrors would differ), surfacing the drift rather than silently passing.

## 6. Meta-test inventory

None created or extended. This is a leaf test with no new structural registry. (Declared per the writing-plans additions rule.)

## 7. Advisory-lock topology

N/A — no `pg_advisory*` surface touched; pure parser+invariants composition, no DB, no lock.

## 8. Acceptance criteria

- `tests/parser/mi1EarlyReturnE2e.test.ts` exists and passes.
- It calls REAL `parseSheet`, REAL `enrichWithDrivePins`, REAL `runInvariants` — no hand-constructed hardError, no `as ParseResult` cast on the invariants input.
- Stub-contract assertion covers ≥4 distinct garbage shapes incl. empty string and whitespace-only.
- Composed-hard_fail assertion proves `hard_fail` with MI-1 in `failedCodes` from `prior = null`.
- Negative control (version-valid, venue-less synthetic sheet) proves a valid sheet's `failedCodes` does NOT contain MI-1 through the same chain.
- The whole test is hermetic: no Supabase, no network — both paths are venue-less so the geocode branch is a guaranteed noop regardless of `GOOGLE_GEOCODING_API_KEY`.
- No production source file changes; full suite has no NEW failures vs merge-base (pre-existing env-only DB/live-suite failures excepted).
