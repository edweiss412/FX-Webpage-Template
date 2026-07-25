# Plan — Hotel ambiguity coverage

**Spec:** `docs/superpowers/specs/parser/2026-07-25-hotel-ambiguity-coverage-design.md` (canonical; §-refs below point there)
**Branch:** `feat/hotel-ambiguity-coverage`
**Implementer:** Opus / Claude Code (invariant: UI work is never delegated — `components/admin/UseRawControl.tsx` is in scope)

---

## 0. Why this plan exists in this shape

The spec ran **9 adversarial rounds / 69 findings**, all verified against live code, none refuted. Two vectors never closed in prose:

- **copy truth** — a string asserts something about the algorithm; some reachable input falsifies it;
- **test-oracle discrimination** — a wrong implementation passes the specified tests.

Per `docs/agents/spec-self-review.md:22` a vector surviving three rounds converges structurally, not by more prose. For the oracle vector the structural convergence is **executable tests**: a test either fails against a wrong implementation or it does not, and running it answers the question that reading cannot. The user ratified moving to plan + TDD on 2026-07-25.

**Consequence for every task below:** the failing test is written FIRST and must be demonstrated to fail **for the stated reason** before implementation. Several spec findings were "this test passes even when the implementation is wrong" — so each task names the wrong implementation its test kills.

---

## 1. Meta-test inventory (mandatory declaration)

| Meta-test | Created / Extended | What it pins |
| --------- | ------------------ | ------------ |
| `tests/parser/_metaTransformSitesWalker.test.ts` | **Extended** | `REQUIRED_DECLARATIONS["hotels.ts"]` gains `HOTEL_ADDRESS_SPLIT_AMBIGUOUS`, **plus a new assertion that `hotels.ts` declares ZERO `deferred:BL-` exempts.** The existing walker only checks a code occurs *somewhere*, and `HOTEL_GUEST_SPLIT_AMBIGUOUS` is already present for the structured site — so without the zero-exempt assertion an implementation can flip only the address site, leave `inline guest paths` deferred with its backlog row intact, and pass every declared check (scope-B finding 2) |
| **New** — `tests/parser/_metaSplitHotelNameAddressPropagation` **.test.ts** (created by T4) | **Created** | Source-scans every `splitHotelNameAddress(` call site in `lib/parser/blocks/hotels.ts` and asserts each destructures the ambiguity field and passes it into a stash. Fails-by-default for a new call site. This exists because the inline-no-guest × P3(a) cell is **not behaviorally observable** (spec §3.1 / §8.1) |
| `tests/parser/ambiguityCodes.test.ts` | **Extended** | New code in the expected sorted list; `AMBIGUITY_CODES ⊆ GAP_CLASSES` still holds |
| `tests/messages/_metaWarningCardCopy.test.ts`, `_metaCatalogCopyHygiene`, `_metaErrorCatalogDocs`, `_metaPopoverContextCoverage` | **Extended by data** | New catalog row must satisfy all four; no code change expected, but each is run and named in the task |
| `tests/parser/dataGapsClassCompleteness.test.ts`, `tests/parser/dataGaps.test.ts` | **Extended** | Hard-coded gap-class counts 33→34 and 53→54, plus the test names and comments that embed them |
| `tests/admin/step3Buckets.test.ts` | **Extended** | Exact-map assertion over `FIELD_LABELS` gains `address` |

**Advisory-lock topology:** N/A — this change touches no `pg_advisory*` surface, no RPC, no migration. Declared explicitly per the mandatory rule.
**Layout-dimensions task:** N/A — spec §7.1 records no fixed-dimension parent and no new flex/grid parent-child pair.
**Transition-audit task:** N/A — spec §7.2 records no new state and no new edge; the change adds values to an existing `disabled` reason set.

---

## 2. CI wiring

`BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`), so **every new test file is auto-discovered** — no `testMatch` entry and no workflow path-filter row is required. Verified, not assumed. Both `tests/messages/**` and `tests/parser/**` run in the **parallel** project (`vitest.projects.ts:92`) — a scoped `--project serial` run finds no parser tests at all (scope-A finding 8 / scope-B finding 7). No new e2e spec, so no workflow coverage row.

---

## 3. Tasks — VERTICAL slices

**Restructured after plan review (both scopes BLOCKING, 15 findings).** The first draft sliced horizontally — types, then emitters, then UI — and five findings were the same consequence: **no task could be red at its own boundary.** T3 asserted warnings whose emitter arrived in T6; T6's privacy test needed T7's overlay; T5 added a map key whose exact-map test waited until T11; T6 and T7 could not typecheck alone.

Each slice below lands **red → minimal implementation → green → commit** on its own. Where a slice is a pure refactor it says so and names its characterization net instead of a red step.

### S1 — splitter ambiguity signal ✅ DONE (`90589bda2`, hardened `e71d73e86`)

### S2 — `commitHotels` single commit point (refactor)

**No red step, by nature** (scope-A finding 2): current code already emits before `cap()` and already uses `result.length`, so every proposed assertion passes pre-refactor. Its net is the characterization guards landed in `1e17e11ba` — emission order asserted by position, and `blockRef.index` with two survivors.

**Adds one genuinely new case:** an over-cap **inline** parse whose truncated last reservation carries an ambiguity (scope-A finding 3). Rank gating currently exists only inside `parseHotelTable`, so an implementation that keeps it structured-only passes every existing test.

### S3 — the ADDRESS warning, end to end

One slice: registration + types + overlay + emitter + UI + copy oracles. Splitting these is what made the first draft untypecheckable.

**Red:** the P3(a)/P3(b) emit tests, which fail because no emitter exists.

**Contents.** Registration (spec §4 rows a–g, dd, plus **row h `WARNING_CARD_COPY_CODES` + `EXPECTED_TRIGGER_CONTEXT` and row i the `HOTEL` help-family check**, both unallocated in the first draft — scope-A finding 6); `pnpm gen:spec-codes` AND `pnpm gen:internal-code-enums`; the `hotel-name` `parsed`/`replacement` variants and both new `resolvable:false` reasons; `USE_RAW_CODES`; `applyReplacement`; and the six `UseRawControl` sites. `FIELD_LABELS.address` lands **with** its exact-map test update (`tests/admin/step3Buckets.test.ts:180`), which goes red the moment the key is added.

**Oracles that must land in THIS slice, not later** (scope-B finding 3): C9–C16, C19–C22 byte-for-byte; the two emitted messages; and the render assertions. A test written after the value it checks can never be red.

**Required discriminators:**
- **P0 privacy** — `Hotel #9999 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601 Eric Weiss - 110525 John Smith - 103316`: `replacement.hotelName` carries no conf token, and `applyUseRawDecisions` leaves `hotel_name` free of `#9999`. Every other P3(b) case is conf-free, so an unstripped implementation passes them all.
- **P3(a) is NOT resolvable** — `resolvable:false`, reason `no-split-to-undo` (scope-A finding 4). An implementation enabling a no-op fix passes the reason and card-count tests otherwise.
- **`segmentRawReading` returns TWO segments** — a test that REJECTS the existing one-plain-segment fallback (scope-B finding 4). Implementing the constants correctly while leaving the boundary unmarked otherwise passes everything.
- **Wizard renders `(hotel name and address)`** — the `FIELD_LABELS` map assertion does not prove the phrase reaches the screen.
- **Two reservations, two address cards**, distinct `blockRef.index`.

### S4 — the INLINE GUEST warning, end to end

Reuses the existing code and is never resolvable, so it needs no overlay work — which is why it is a separate slice from S3.

**Red:** the row 5 / row 6 discriminator pair.

**Required discriminators:**
- **Row 5 vs row 6** — `Hyatt Place Check In: 5/1 Check Out: 5/2 Eric` (MUST emit) vs `Hyatt Place Check In: 5/1 Check Out: 5/2` (MUST NOT). Both parse to `names: []`, opposite requirements. Kills `groupIndex === 0 && names.length > 0` and "warn on every group-0 final return"; **no other test in this plan separates them.**
- **P1 is NOT resolvable** — `resolvable:false`, reason `raw-not-guest-scoped`, **plus** proof that a decision for it cannot mutate `names` (scope-A finding 4). Reusing the resolvable structured-guest emitter otherwise passes.
- One case per emitting enumeration row (1, 3, 4, 5), each `reasons === ["inline-boundary-judgment"]`. The Pattern-2 case must be one Pattern 1 cannot claim first (`lib/parser/blocks/hotels.ts:784`).
- `exporter-xlsx/consultants`: 2 reservations, exactly **1** card.
- C1, C4–C8, C18 byte-for-byte, landing with the values.

### S5 — simultaneous ambiguities

The four cases that fall between slices (scope-A finding 3):

- **P1 + P3(b)** on one reservation: `Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601 Eric Weiss - 110525 John Smith - 103316` → two warnings, one of each code.
- **P1 + P3(a)** on one reservation: `Hyatt Place Chicago 71 Chicago, IL 60601 Eric Weiss - 110525 John Smith - 103316`.
- Two reservations each carrying an address ambiguity (kills parse-global "first address warning wins").
- Over-cap **inline** truncation (kills structured-only rank gating).

**Kills:** a `commitHotels` that keeps only the first ambiguity per reservation — which passes every isolated test in S2, S3 and S4.

### S6 — propagation across all five callers

**9 behavioral cells** (5 callers × P3(b), 4 × P3(a); the inline-no-guest × P3(a) cell is unobservable) **plus** the source-scanning meta-test.

**The guard must be discriminating** (scope-A finding 5). A scanner that counts five calls and five nearby `ambiguity` tokens passes while one caller ignores its result. Required instead: for **each** `splitHotelNameAddress(` call site, parse the enclosing statement and assert the call's own result binding is the identifier subsequently passed to a stash — a per-call binding check, not a file-level token count. Ship it with a **negative fixture**: a synthetic source string where one caller drops its result, asserted to FAIL the scanner.

### S7 — corpus goldens, per fixture

**Per-fixture exact counts and reasons, not family totals** (scope-B finding 5). Family totals are satisfied by one fixture emitting zero and another two. Each of the 9 warning fixtures asserts its own count and reason string; each quiet fixture asserts zero by code.

### S8 — close the deferrals

Flip both `TRANSFORM_SITES` exempts, delete both BACKLOG rows and the section heading, extend `REQUIRED_DECLARATIONS`, and add the **zero-`deferred:BL-`-exempts** assertion (scope-B finding 2). One commit — the walker cross-checks refs against BACKLOG.md.

### S9 — remaining registry expectations

`EXPECTED_CORPUS_WARN_CODES`, `tests/admin/warningFixAffordance.test.tsx:20`, `tests/components/UseRawControl.test.tsx:746`. Each lands **with** the change that makes it red, not after (scope-B finding 3); this slice exists only for rows no earlier slice touched.

### S10 — UI quality gate (evaluation only, no TDD)

`/impeccable critique` AND `/impeccable audit` on the UI diff with the canonical v3 setup gates. P0/P1 fixed or deferred via `DEFERRED.md`. **Findings and dispositions are recorded in a new close-out doc created by this slice, named for this plan with a CLOSEOUT suffix and placed alongside it, §12** (scope-B finding 6 — the first draft said "recorded" without naming a destination). This slice produces no test and is explicitly exempt from commit-per-task TDD.

---

## 4. Checklist

1. S1 … S10, each red → green → commit (S2 and S10 excepted, as stated)
2. Self-review (numeric + citation sweep over this plan)
3. **Adversarial review (cross-model)** to APPROVE — dispatch SPLIT by scope; a single whole-plan dispatch hit the wrapper's `total_timeout` at 1837s. `--attempt-max-secs` is capped at **1380**; a larger value makes `codex-guard` exit immediately without running
4. Full gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, **`pnpm spec:lint`** on both the spec and this plan (registration edits the master spec, so spec:lint is load-bearing — scope-B finding 6)
5. Whole-diff cross-model review to APPROVE
6. Push → **real CI green** (a separate gate from local green)
7. `gh pr merge --merge` → fast-forward local `main` → verify `git rev-list --left-right --count main...origin/main` is `0  0`

## 5. Snippet-typecheck note

Snippets above are prose-level (type names and call shapes), not paste-ready bodies — deliberately, since the repo's strict tsconfig makes paste-time compile errors a known round-burner. Each slice's real test body is typechecked in its own red step.
