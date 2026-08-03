# Settling `BL-LEAD-CAPABILITY-PROSE-STALE` — prose that asserts a capability the flag does not confer

**Date:** 2026-08-03 · **Branch:** `docs/settle-lead-capability-prose` · **Class:** docs/contract + structural guard · **Ledger entry:** `BL-LEAD-CAPABILITY-PROSE-STALE` (BACKLOG.md)

`BL-LEAD-CAPABILITY-PROSE-STALE` was filed on 2026-08-02 by `chore/copy-deadcode-sweep` for two deliberate non-fixes. That branch corrected every Doug-visible copy string carrying the claim and stopped at two written statements about what a capability flag confers, because settling either meant reading the contract it belongs to rather than editing a sentence. This branch reads both contracts and settles both, and — per the AGENTS.md class-sweep rule — sweeps the rest of the class in the same files rather than closing only the two named instances.

---

## 1. Scope

### 1.1 Resolved scope — do not relitigate

Each item below is a decision already taken, with its ratification. A reviewer should verify the citation, not re-derive the decision.

1. **The probe is settled: no `role_flags` element grants admin.** `public.is_admin()` is `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` OR an `admin_emails` lookup, and never reads `role_flags` (`supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql:135-149`). `requireAdmin` calls that RPC (`lib/auth/requireAdmin.ts`). The claim under settlement is false as stated; the question this branch answers is what the false clause should become, not whether it is false.

2. **Both dispositions were chosen by the owner at the 2026-08-03 brainstorming gate**, not derived here: the matrix settle is "correct the prose AND make the guard real" (not "also model FINANCIALS as a sixth predicate"), and the MI-9 settle is "correct the clause to what LEAD actually additionally grants" (not "delete the clause" and not "keep it as encoded intent"). Recorded in §2.2 and §2.4.

3. **FINANCIALS is deliberately NOT added as a sixth matrix predicate.** Ratified at the gate. Rationale in §2.2c. This is a scope decision, not an oversight — a reviewer proposing `hasFinancials` is relitigating a closed call. The mechanism that would make such an addition mandatory-and-checked is nonetheless shipped here (§2.2b), so the decision is reversible later at low cost.

4. **Historical design records that quote the false claim are left unedited.** Four documents quote the copy as it stood when they shipped (`docs/superpowers/specs/2026-07-18-alert-copy-full-sweep-design.md` twice, `docs/superpowers/specs/step3-onboarding/2026-07-17-mi9-lead-autoapply-fyi.md:45`, `docs/superpowers/plans/alerts/2026-07-17-condensed-alert-copy.md:409`), and one endorses it (`docs/superpowers/plans/2026-08-02-docs-hygiene-citation-rot-financials-vocab.md:142`, "LEAD alone additionally grants the admin/ops surface, stated correctly at …:1627"). Same reasoning `chore/copy-deadcode-sweep` applied at `docs/superpowers/specs/2026-08-02-copy-deadcode-sweep-design.md:34`: they are history, not claims in force. §2.5 records why the endorsement in particular is left alone.

5. **`lib/visibility/capabilityTransitions.ts` has no production importer.** Its only importers are `tests/visibility/capabilityTransitions.test.ts` and `tests/visibility/transportTransitions.test.ts`. It is a documentation-and-contract artifact. That is why the settle is "make its prose true and machine-checked" rather than "extend its data model" — there is no runtime behavior downstream of the matrix to get wrong.

6. **No UI surface.** `lib/visibility/**` is not under `app/` or `components/`, and no file under either is touched. The invariant-8 impeccable dual gate is N/A; the plan carries `impeccable-gate: N/A — no UI surface`.

7. **No §12.4 lockstep.** The master-spec edit is in §6.8 (MI-9), not the §12.4 error-code catalog, so the three-way lockstep (spec prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`) does not apply. `pnpm test:audit:x1-catalog-parity` is run anyway as a negative check (§5).

8. **No DB, no advisory lock, no migration, no mutation surface.** Invariants 2, 9, and 10 are structurally inapplicable; the tier × domain matrix, CHECK/enum migration matrix, and flag lifecycle table required by `docs/agents/spec-self-review.md` are N/A for the same reason and are declared so in §6 rather than omitted.

9. **No component, no visual state, no fixed-dimension parent.** Dimensional Invariants and Transition Inventory sections are N/A (§6).

10. **Un-skipping the two e2e suites is OUT OF SCOPE and is not a finding.** `tests/e2e/right-now-transitions.spec.ts:154` and `tests/e2e/right-now-transitions.spec.ts:291`, plus `tests/e2e/transport-tile.spec.ts:225`, are `test.describe.skip` for a documented reason recorded in the file itself (`tests/e2e/right-now-transitions.spec.ts:285-290`): the `?crew=`/`?as=admin` dev mock they drive was retired, and each case renders as a specific non-LEAD crew identity that `signInAs` cannot reproduce without per-test crew rows and fixture seeding. This branch corrects the four artifacts that misdescribe that state (§2.7) and files the gap (§2.6); restoring the coverage is a separate, much larger piece of work.

### 1.2 In scope

Ten instances of one class — **a hand-maintained restatement of the code that nothing forces to stay true** — across six files, plus the ledger graduation. Six were found by the author's sweep, four by spec-review R1 and the sweep it triggered.

| # | Site | Claim | Status |
| --- | --- | --- | --- |
| A | `lib/visibility/capabilityTransitions.ts:124` | `financialsVisible = isAdmin \|\| LEAD` | Filed as instance 1 of the ledger entry |
| B | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627` (MI-9) | "LEAD additionally grants the admin/ops surface" | Filed as instance 2 |
| C | `lib/visibility/capabilityTransitions.ts:47-52` | a predicate addition "surfaces … in the matrix as a TypeScript error if the matrix is incomplete" | **Found by class sweep** |
| D | `lib/visibility/capabilityTransitions.ts:6-7` | "the five gated tiles" (four are then named) | **Found by class sweep** |
| E | `lib/visibility/capabilityTransitions.ts:56` | "The five gated tiles whose visibility this matrix covers" | **Found by class sweep** |
| F | `tests/visibility/capabilityTransitions.test.ts:26-32` | a hand-listed `ALL_PREDICATES` under `satisfies readonly CapabilityPredicate[]`, which permits a subset and so can silently under-cover a widened union | **Found by class sweep** |
| G | `lib/visibility/capabilityTransitions.ts:36-39` | compound transitions "are exercised by the e2e compound-transition tests in `tests/e2e/right-now-transitions.spec.ts`" | **Found by spec review R1 + sweep** |
| H | `tests/visibility/capabilityTransitions.test.ts:5-9` | the same claim, restated in the test header | **Found by spec review R1 + sweep** |
| I | `tests/e2e/helpers/rightNow.ts:168-174` | pairs the parametrized audit skips "are covered by the dedicated compound-transition tests" | **Found by the R1 sweep** |
| J | `tests/visibility/transportTransitions.test.ts:5-10` | "animation behavior is exercised in e2e tests" | **Found by the R1 sweep** |

**G through J are one sub-shape: a contract artifact claiming e2e coverage that does not execute.** Probed:

```
$ grep -n 'describe.skip' tests/e2e/right-now-transitions.spec.ts
154:test.describe.skip("RightNow §8.2 — 66-pair pairwise transition audit", () => {
291:test.describe.skip("RightNow §8.2 — 6 compound transition audits (plan Step 3)", () => {

$ grep -c 'CAPABILITY_TRANSITION_MATRIX\|affectedTilesOnFlip\|FinancialsTile\|AudioScopeTile' tests/e2e/right-now-transitions.spec.ts
0

$ grep -n 'describe.skip\|test.describe(' tests/e2e/transport-tile.spec.ts
225:test.describe.skip("crew page — TransportTile (Task 4.7, §8.1)", () => {

$ grep -c 'AnimatePresence\|animation\|transition\|opacity' tests/e2e/transport-tile.spec.ts
0
```

So the named capability suite is skipped **and** carries no capability assertion; the named transport suite is skipped **and** carries no animation assertion. Both skips are deliberate and documented at `tests/e2e/right-now-transitions.spec.ts:285-290` (the `?crew=`/`?as=admin` mock was retired and the migration is non-trivial) — the defect is not the skip, it is four artifacts telling a maintainer the coverage exists.

C through J are not in the ledger entry. They are the same defect shape — a hand-maintained restatement of something the code already knows, with nothing forcing the two to agree — and AGENTS.md requires sweeping the shape before patching the named instance.

### 1.3 Out of scope

- Adding `hasFinancials` to the matrix (§1.1 item 3).
- Editing the historical records in §1.1 item 4.
- Any change to the runtime behavior of `lib/visibility/scopeTiles.ts` — the live predicates are correct and are the reference the prose is corrected *against*.

---

## 2. The settle

### 2.1 Instance A — the stale predicate line

**The contract read.** The line sits inside a block whose own header is `Tile-visibility rules from `lib/visibility/scopeTiles.ts` (verbatim branch logic):` (`lib/visibility/capabilityTransitions.ts:118-119`). Four predicates follow. Three of them are verbatim:

| Documented (`capabilityTransitions.ts`) | Live (`scopeTiles.ts`) | Match |
| --- | --- | --- |
| `lib/visibility/capabilityTransitions.ts:121` `audioScopeVisible = A1 \|\| A2 \|\| LEAD` | `lib/visibility/scopeTiles.ts:85-86` `flags.includes("A1") \|\| flags.includes("A2") \|\| flags.includes("LEAD")` | ✅ |
| `lib/visibility/capabilityTransitions.ts:122` `videoScopeVisible = V1 \|\| LEAD` | `lib/visibility/scopeTiles.ts:96-97` `flags.includes("V1") \|\| flags.includes("LEAD")` | ✅ |
| `lib/visibility/capabilityTransitions.ts:123` `lightingScopeVisible = L1 \|\| LEAD` | `lib/visibility/scopeTiles.ts:113-114` `flags.includes("L1") \|\| flags.includes("LEAD")` | ✅ |
| `lib/visibility/capabilityTransitions.ts:124` `financialsVisible = isAdmin \|\| LEAD` | `lib/visibility/scopeTiles.ts:140-141` `isAdmin \|\| flags.includes("LEAD") \|\| flags.includes("FINANCIALS")` | ❌ |

**Verdict: stale transcription, not deliberate simplification.** The ledger entry left open the possibility that the line accurately describes a matrix that models `hasLead` only. It does not, for two independent reasons. First, the block declares itself verbatim and its three siblings are verbatim — the block's job is to quote `scopeTiles.ts`, so a non-quote in it is a defect regardless of what the matrix models. Second, the matrix's restriction to five predicates is stated separately and in a different place (`lib/visibility/capabilityTransitions.ts:53`, the `CapabilityPredicate` union, and `lib/visibility/capabilityTransitions.ts:213`, "matrix entries are evaluated against the no-LEAD-no-admin viewer"); it is not carried by the quoted-predicate block and does not need to be.

**Fix.** `lib/visibility/capabilityTransitions.ts:124` becomes the live expression verbatim, and the matrix's deliberate exclusion of FINANCIALS is stated once, explicitly, immediately after the block — so a reader who now sees `FINANCIALS` in the quote and then finds no `hasFinancials` in the matrix is not left to guess whether that is an omission. Exact replacement:

```
 *   financialsVisible    = isAdmin || LEAD || FINANCIALS
 *
 * FINANCIALS is deliberately NOT a matrix predicate: it unlocks
 * FinancialsTile and nothing else, so it is held false throughout the
 * matrix, exactly as the entries below hold every unflipped predicate.
 * Add it to CAPABILITY_PREDICATES to model it — the derived pair-set
 * expectations then name every entry the matrix is missing.
```

The parenthetical `(LEAD-or-admin)` is dropped rather than updated: it restated the expression it annotated, which is how it survived a change to that expression.

### 2.2 Instances A + C — making the guard real

#### 2.2a Why prose alone is not the settle

The defect that produced this ledger entry is a comment that desynchronized from the function it quotes, silently, for at least the interval since the 2026-07-15 role-scope-vocab extension added `FINANCIALS`. Correcting the sentence restores truth for exactly as long as nobody edits `scopeTiles.ts` again. Per the AGENTS.md same-vector rule, the closure for a recurrence class is structural.

#### 2.2b Guard 1 — documented-predicate parity (new)

A new structural meta-test, `tests/visibility/_metaDocumentedPredicateParity.test.ts`, pins every documented predicate line to the live function's **behavior**.

Mechanism:

1. Read `lib/visibility/capabilityTransitions.ts` from disk; locate the quoted-predicate block by its literal `(verbatim branch logic):` header and the blank comment line that terminates it. **A block that is not found, or that does not yield exactly four predicate lines, fails the test** — the guard can never silently pass by parsing nothing.
2. For each line, take the text between `=` and the first `(`, normalize whitespace, and require it to match `^<token>( || <token>)*$` where `<token>` is `[A-Za-z0-9_]+`. Any other separator (`&&`, `!`, a nested paren) fails — the guard refuses to interpret an expression shape it was not built to check.
3. Assert the set of documented predicate names equals the set of exported `*Visible` functions obtained by **reflecting over the `scopeTiles` module namespace** (`import * as scopeTiles`, filter keys ending in `Visible` whose value is a function) — not a hand-written list. A predicate function added to, removed from, or renamed in `scopeTiles.ts` therefore fails this test until the documented block matches.
4. For each predicate, assert behavioral equivalence against the live function **exhaustively over the entire `RoleFlag` powerset** — all 2²⁰ = 1,048,576 flag subsets — and, for the predicate that takes an `isAdmin` argument, over the full `subset × isAdmin` cross product. A documented line is a pure disjunction, so its semantics are total and checkable: for every subset `S` and every `isAdmin` value,

   ```
   fn(S, isAdmin) === (isAdmin && tokens.includes("isAdmin")) || S ∩ tokens ≠ ∅
   ```

   **Why exhaustive rather than a singleton sweep.** A singleton-only sweep (`fn([f])` for each flag, plus the empty set) is defeated by any conjunctive branch: adding `V1 && L1` to `audioScopeVisible` changes no singleton result and no documented token, so the guard would pass while a two-flag viewer sees a tile the comment says is hidden. Measured on this machine, the full powerset costs **164 ms per predicate** — five sweeps in total, under a second — so there is no reason to accept an arity limit. Exhaustion removes the escaping-mutant question rather than bounding it: no conjunctive, disjunctive, negated, or cardinality-dependent branch of any arity can survive.

   Implementation constraint that makes this affordable: iterate subsets by bitmask and compute the expected value with a **precomputed token bitmask** (`(subsetMask & tokenMask) !== 0`), so the expected side is O(1) per subset; accumulate mismatches in an array and make **one** `expect(mismatches).toEqual([])` call at the end. A per-subset `expect()` would be a million assertion calls and is the only way to get this wrong.

**The expected value comes from the parsed comment; the actual comes from calling the live function.** Neither side is derived from the other, so the test cannot pass tautologically.

**The concrete failure it catches, stated as required by the writing-plans anti-tautology rule:** with the comment as it stands today, `financialsVisible(["FINANCIALS"], false)` returns `true` while the parsed token set is `{isAdmin, LEAD}`, so expected `false` ≠ actual `true`. This is the TDD red step — the guard is written first and **must be observed failing against the unfixed comment** before `lib/visibility/capabilityTransitions.ts:124` is corrected. It also catches: a new flag branch added to any of the four functions, a flag branch removed, a predicate function renamed or deleted, and a fifth gated predicate added to `scopeTiles.ts` without a documented line.

**The `RoleFlag` universe is exhaustiveness-checked at compile time, not parsed.** The test declares

```ts
const ALL_ROLE_FLAGS = [/* 20 values */] as const satisfies readonly RoleFlag[];
type _NoFlagOmitted = Exclude<RoleFlag, (typeof ALL_ROLE_FLAGS)[number]> extends never ? true : never;
const _exhaustive: _NoFlagOmitted = true;
```

`satisfies` rejects a typo or a non-flag string; the `Exclude` check makes a `RoleFlag` added to `lib/parser/types.ts:146-175` and not added here a **type error**, caught by the `pnpm typecheck` pre-push gate. Without it the sweep would silently under-test a newly added flag, which is the "an accepted limit is a claim" failure. `lib/parser/types.ts` itself is not modified — the exhaustiveness obligation lives with the guard that depends on it. The union holds **20** values as of this branch; that count appears in this spec only as a comment marker, never as an assertion, so it cannot rot into a false pass.

#### 2.2c Guard 2 — matrix completeness (repair of instance C)

`lib/visibility/capabilityTransitions.ts:47-52` claims a predicate addition "surfaces … in the matrix as a TypeScript error if the matrix is incomplete." **Probed: it does not.** `CapabilityPredicate` is a hand-written string-literal union (`lib/visibility/capabilityTransitions.ts:53`) with no link to `CAPABILITY_TRANSITION_MATRIX` (`lib/visibility/capabilityTransitions.ts:132`), and the matrix's size is asserted by three hardcoded numbers in `tests/visibility/capabilityTransitions.test.ts` — `toHaveLength(10)` (`tests/visibility/capabilityTransitions.test.ts:39-40`), `expect(seen.size).toBe(10)` (`tests/visibility/capabilityTransitions.test.ts:57`), and "every predicate appears in exactly 4 entries" (`tests/visibility/capabilityTransitions.test.ts:60`). Adding a sixth predicate to the union produces **no error anywhere**: the type widens, the matrix stays at ten entries, and all three assertions still hold because all three describe five predicates by literal number.

**Fix — make the claim true rather than delete it.** Invert the derivation in `lib/visibility/capabilityTransitions.ts`:

```ts
export const CAPABILITY_PREDICATES = ["hasLead", "hasA1", "hasV1", "hasL1", "hasAdmin"] as const;
export type CapabilityPredicate = (typeof CAPABILITY_PREDICATES)[number];
```

The exported type is unchanged in every consumer (`transportTransitions.test.ts:26` imports it as a type only), so this is a widening of the module's exports, not a breaking change. Then the three hardcoded numbers in the test derive from `CAPABILITY_PREDICATES.length`: expected entries `n*(n-1)/2`, expected partners-per-predicate `n-1`, and — stronger than the current count-plus-no-duplicates pair — an explicit assertion that the matrix's unordered-pair set **equals** the full `C(n, 2)` pair set, which names the missing pair in its failure message.

The same edit retires a **sixth instance of the class, found in the test file**: `tests/visibility/capabilityTransitions.test.ts:26-32` hand-lists its own `ALL_PREDICATES` under `satisfies readonly CapabilityPredicate[]`. `satisfies` permits a *subset*, so that array can silently under-cover a widened union — the identical defect shape as instances A and C, one file over. It is deleted in favour of the imported `CAPABILITY_PREDICATES`, leaving exactly one list in the codebase.

Consequence, and the point of the exercise: adding a predicate now means adding it to `CAPABILITY_PREDICATES`, which raises `n`, which makes the derived expectations fail until the matrix carries every new pair. The header's claim becomes true. It is a test failure rather than literally a TypeScript error, so **the header text is corrected to say what actually happens** — claiming the stronger mechanism is how instance C arose in the first place.

This is also what makes §1.1 item 3 cheaply reversible: whoever later decides FINANCIALS should be modeled adds one array element and is then *told by a failing test* exactly which five entries to write.

### 2.3 Instances D + E — the tile count

`lib/visibility/capabilityTransitions.ts:6-7` says "the five gated tiles" and then names four; `lib/visibility/capabilityTransitions.ts:56` repeats "The five gated tiles." `GatedTile` (`lib/visibility/capabilityTransitions.ts:60-64`) has four members: `FinancialsTile`, `AudioScopeTile`, `VideoScopeTile`, `LightingScopeTile`.

**Fix — delete the rot surface rather than guard it.** The count words are removed, not corrected to "four": "Five derived predicates gate the five gated tiles (…)" becomes a sentence that refers to `CAPABILITY_PREDICATES` and the `GatedTile` union by name, and `lib/visibility/capabilityTransitions.ts:56` becomes "The gated tiles whose visibility this matrix covers." A prose count that no longer exists cannot drift, and unlike the predicate expressions there is nothing load-bearing lost — the authoritative counts are one line away in the code itself.

**Accepted limit, stated explicitly:** free-text prose in this module remains unguarded. The two claims that were load-bearing — what each predicate evaluates to (§2.2b) and whether the matrix is complete (§2.2c) — are now machine-checked; a future sentence asserting something else about the module could still go stale. This is a bounded, named residue, not an assumption that the file is now fully guarded.

### 2.4 Instance B — master spec MI-9

**The contract read.** The clause is the tail of MI-9's capability parenthetical (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627`), quoted verbatim:

> **LEAD and FINANCIALS are the capability-granting `role_flags` elements** (both gate `shows_internal.financials` access — …; LEAD additionally grants the admin/ops surface).

Three findings settle it:

1. **The claim is false.** §1.1 item 1.
2. **It inverts a real implication.** `lib/visibility/scopeTiles.ts:55` records the live posture — an admin viewer has no crew row, so "admins are super-LEADs per §4.4". The direction is admin ⇒ LEAD-equivalent visibility. MI-9 states the converse.
3. **It is reaching for something true.** LEAD *does* confer strictly more than FINANCIALS, which is presumably why the clause exists: FINANCIALS unlocks the financials payload and nothing else, while LEAD additionally unlocks all three scope tiles — `audioScopeVisible` (`lib/visibility/scopeTiles.ts:85-86`), `videoScopeVisible` (`lib/visibility/scopeTiles.ts:96-97`), `lightingScopeVisible` (`lib/visibility/scopeTiles.ts:113-114`). The asymmetry is real; only its content is wrong.

**No evidence supports the "encoded intent" reading.** A sweep of the corpus for any planned or contemplated LEAD→admin grant finds nothing: no migration, no route gate, no spec, no backlog entry. The phrase's ancestry runs through `9700c447b` → `aaab97102` → `d53072e3b`, and `docs/superpowers/specs/alerts/2026-07-17-role-flags-notice-lead-only-doug.md:178` shows `aaab97102` explicitly auditing this exact sentence — it corrected "LEAD is the only capability element" to "LEAD and FINANCIALS" and carried "admin/ops" through untouched. It is inherited text that survived a partial edit, not a design position.

**Fix.** The clause is replaced with the true asymmetry plus the negative claim that keeps the next reader from re-deriving it. It stays a single line (the row is one markdown table cell) and is line-count neutral. Exact replacement text in the plan; substance:

> LEAD additionally unlocks the Audio / Video / Lighting scope tiles (`audioScopeVisible` / `videoScopeVisible` / `lightingScopeVisible`, `lib/visibility/scopeTiles.ts`). **No `role_flags` element grants admin** — `is_admin()` reads the JWT `app_metadata.role` claim and the `admin_emails` table and never consults `role_flags` (`supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql`); the §4.4 posture is the converse, an admin viewer is a super-LEAD.

**Why the negative claim is included rather than just deleting the false half.** This is the second branch to touch this sentence and the third document to re-derive the same probe. Recording the result where the claim lived is what stops a fourth.

### 2.5 The one historical record that endorses the claim

`docs/superpowers/plans/2026-08-02-docs-hygiene-citation-rot-financials-vocab.md:142` does not merely quote the claim — it asserts "LEAD alone additionally grants the admin/ops surface, **stated correctly** at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627`", citing the exact line this branch rewrites. After the fix, that sentence endorses a claim its own citation no longer contains.

**Decision: leave it.** It is a shipped plan describing a deferral as it was understood on 2026-08-02, and the project's rule for shipped plans and design records is that they are execution history, not claims in force (`docs/superpowers/specs/2026-08-02-copy-deadcode-sweep-design.md:34`). Editing a merged plan's reasoning to match a later finding erases the record of what was believed when the work was scoped. Recorded here so a future reader who greps the phrase and finds the endorsement has the resolution attached rather than re-opening the question — which is the same service §2.4's negative claim performs for the spec.

### 2.6 Ledger graduation

`BL-LEAD-CAPABILITY-PROSE-STALE` moves from `BACKLOG.md`'s open queue to `BACKLOG-archive.md` under a `## BL-LEAD-CAPABILITY-PROSE-STALE — RESOLVED (2026-08-03, docs/settle-lead-capability-prose)` heading preserving the entry body, per the convention measured by `tests/docs/_metaDeferralLedgerGraduation.test.ts`. A `{ id, provenance: "docs/settle-lead-capability-prose" }` row is appended to that file's `BACKLOG_GRADUATED` array (`tests/docs/_metaDeferralLedgerGraduation.test.ts:90`), and `BACKLOG.md`'s "Last reconciled" header line gains this pass.

The `**Status:** IN PROGRESS · **Branch:** docs/settle-lead-capability-prose` marker written onto the entry at Stage 0 (invariant 12) leaves with the entry when it graduates, which is the convention's by-construction case — no separate removal step, and `tests/docs/_metaLedgerInProgress.test.ts`'s "archives may not hold in-flight work" rule requires the marker be dropped during the move.

**One new backlog row is filed** — `BL-TRANSITION-MATRICES-E2E-COVERAGE-SKIPPED`. This reverses the draft's "no new row" position, on the R1 finding: correcting instances G through J removes a false claim of coverage, which converts an invisible gap into a visible one, and a visible gap with no ledger row is how it becomes invisible again. The row records that both `*Transitions` contract matrices have an un-executing e2e half, names the blocker (`?crew=` mock retirement, `tests/e2e/right-now-transitions.spec.ts:285-290`), and cites this spec. Filing is also forced mechanically: `tests/docs/_metaLedgerReferentialIntegrity.test.ts` fails on a `BL-` id cited by a document but defined in no ledger, so naming it here obliges the row.

No row is filed for the other residue: §2.3's unguarded free-text prose is a stated accepted limit, not deferred work.

### 2.7 Instances G through J — claimed e2e coverage that does not execute

Four artifacts tell a maintainer that compound capability transitions and transport animation behavior are covered by e2e suites. Probes in §1.2 show both named suites are `test.describe.skip` and neither contains an assertion about the thing claimed.

**Fix: state what is true, in each of the four places, and name the blocker once.** Each claim becomes an explicit statement that the compound half is NOT currently exercised, that the named suite is skipped, and that the gap is tracked by `BL-TRANSITION-MATRICES-E2E-COVERAGE-SKIPPED`. The suites are not un-skipped and no new e2e is written (§1.1 item 10).

**Why not simply delete the sentences.** A comment saying nothing is not better than one saying something false — the next reader re-derives the same question, which is exactly the cost this whole branch exists to stop. The corrected form is strictly more informative than silence: it says the compound surface is uncovered, why, and where that is tracked.

**Why these are the same class and not scope creep.** The defect shape under settlement is a hand-maintained restatement that nothing forces to stay true. A comment asserting "this is covered by that suite" is exactly that: nothing links it to the suite's skip state or its assertion content. It is the same shape as instance A (nothing linked the quoted predicate to the function) and instance C (nothing linked the completeness claim to the test). Instance J lives in the sibling matrix module, one file over, and was found by the mandated shape-grep rather than by looking for more work.

**Accepted limit:** unlike the predicate and matrix claims, these four are not machine-checked. A guard would have to parse a Playwright file's skip state and assertion content and bind it to a prose sentence, which is a substantially larger and more brittle artifact than the gap justifies. Named here so it is a stated residue rather than an implied guarantee.

---

## 3. Files touched

| File | Change |
| --- | --- |
| `lib/visibility/capabilityTransitions.ts` | Instances A, C, D, E, G: predicate corrected; FINANCIALS exclusion stated; `lib/visibility/capabilityTransitions.ts:47-52` mechanism claim corrected; `CAPABILITY_PREDICATES` const added and the union derived from it; count words removed at `lib/visibility/capabilityTransitions.ts:6-7` and `lib/visibility/capabilityTransitions.ts:56` |
| `tests/visibility/_metaDocumentedPredicateParity.test.ts` | **New.** Documented-predicate behavioral parity guard (§2.2b) |
| `tests/visibility/capabilityTransitions.test.ts` | Three hardcoded counts derived from `CAPABILITY_PREDICATES.length`; pair-set equality assertion replaces count-plus-no-duplicates; the duplicate `ALL_PREDICATES` list (instance F) deleted in favour of the import |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` | MI-9 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627`) clause replaced (§2.4). Line-count neutral |
| `tests/visibility/transportTransitions.test.ts` | Instance J — the e2e animation-coverage claim corrected |
| `tests/e2e/helpers/rightNow.ts` | Instance I — the compound-transition coverage claim corrected |
| `BACKLOG.md` | Entry removed from the open queue; `BL-TRANSITION-MATRICES-E2E-COVERAGE-SKIPPED` filed; "Last reconciled" updated |
| `BACKLOG-archive.md` | Entry added under a RESOLVED heading |
| `tests/docs/_metaDeferralLedgerGraduation.test.ts` | One `BACKLOG_GRADUATED` row |
| `docs/superpowers/specs/2026-08-03-lead-capability-prose-settle-design.md` | This spec |
| `docs/superpowers/plans/2026-08-03-lead-capability-prose-settle.md` | The plan |

Flat (non-subdirectory) specs and plans are not indexed in `docs/superpowers/specs/README.md` — verified against the seven existing flat entries, none of which appears there — so no README row is added.

---

## 4. Acceptance criteria

| ID | Criterion | Proof |
| --- | --- | --- |
| AC-1 | The documented-predicate guard fails against the unfixed comment | Run the new test at the commit that adds it, before `lib/visibility/capabilityTransitions.ts:124` is corrected; the failure names `financialsVisible` and `FINANCIALS` |
| AC-2 | All four documented predicate lines match live behavior over **every one of the 2²⁰ flag subsets**, and over the full `subset × isAdmin` cross product for `financialsVisible` | New guard green. Negative probe: a conjunctive `V1 && L1` branch spliced into `audioScopeVisible` must turn it red — the exact mutant a singleton-only sweep let through in spec review R1 |
| AC-3 | The guard fails loudly if the block is missing, malformed, or yields ≠ 4 lines | The block parser is a **pure exported function taking source text as a parameter** (not a module-level read), so three negative cases drive it over synthetic strings: no header line, a line using `&&`, and a block of three lines |
| AC-4 | The guard fails if a `*Visible` export is added to `scopeTiles.ts` without a documented line | Namespace-reflection assertion (§2.2b step 3) |
| AC-5 | Matrix expectations derive from `CAPABILITY_PREDICATES.length`, not literals | No literal `10` or `4` remains as a matrix-size expectation in `tests/visibility/capabilityTransitions.test.ts` |
| AC-6 | A sixth predicate forces matrix growth | The pair-set builder is likewise a **pure exported function taking the predicate list as a parameter**, so a negative case passes it a synthetic 6-element list and asserts it demands 15 pairs — proving the expectation tracks `n` rather than coincidentally equalling 10 |
| AC-7 | A `RoleFlag` added without updating the guard's universe is a compile error | `Exclude<…> extends never` check; verified by a scratch `tsc` probe, not asserted |
| AC-8 | MI-9 carries no admin claim, and no live (non-historical) document asserts one | `rg -n "admin/ops" lib app components tests` → 0; `rg -n "admin/ops" docs` leaves only the historical records enumerated in §1.1 item 4 |
| AC-9 | Ledger graduated cleanly | `pnpm vitest run tests/docs/` green, including `_metaDeferralLedgerGraduation`, `_metaLedgerInProgress`, `_metaLedgerReferentialIntegrity` |
| AC-10 | No regression elsewhere | Full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:lint` green |
| AC-11 | No artifact claims e2e coverage that does not execute | Each of instances G–J states the suite is skipped and cites the tracking row; `rg -n "exercised by|covered by the dedicated" lib tests --include='*.ts'` has no hit naming a `describe.skip` suite without saying so |
| AC-12 | The newly-visible gap is tracked | `BL-TRANSITION-MATRICES-E2E-COVERAGE-SKIPPED` resolves in `BACKLOG.md`; `tests/docs/_metaLedgerReferentialIntegrity.test.ts` green |

---

## 5. Verification commands

```
pnpm vitest run tests/visibility/                       # AC-1..AC-6
pnpm typecheck                                          # AC-7
rg -n "admin/ops" lib app components tests              # AC-8 (expect 0)
pnpm vitest run tests/docs/                             # AC-9
pnpm test && pnpm lint && pnpm format:check             # AC-10
pnpm spec:lint docs/superpowers/specs/2026-08-03-lead-capability-prose-settle-design.md
pnpm test:audit:x1-catalog-parity                       # negative check: §12.4 untouched (§1.1 item 7)
```

---

## 6. Spec-self-review sections declared N/A

Declared rather than omitted, per `docs/agents/spec-self-review.md`.

| Required section | Disposition |
| --- | --- |
| Guard conditions for every prop | **N/A** — no component, no props. The guard test's input-robustness obligations are covered instead by AC-3. |
| Mode boundaries | **N/A** — no component modes. |
| Cap/truncation behavior | **N/A** — no unbounded rendered list. The one enumerable set (`RoleFlag`, 20 values) is exhaustiveness-checked at compile time (§2.2b). |
| Rendered vs conceptual | **N/A** — nothing rendered. |
| Dimensional Invariants | **N/A** — no fixed-dimension parent, no flex/grid child, no `app/` or `components/` file touched. |
| Transition Inventory | **N/A** — no component with visual states. The "transition matrix" in scope is a data structure, not an animation surface. |
| Tier × domain completeness matrix | **N/A** — no DB-touching change. |
| CHECK/enum migration matrix | **N/A** — no CHECK, no enum, no migration. |
| Flag lifecycle table | **N/A** — no boolean config field or toggle is added, read, or written. `role_flags` values are pre-existing data this branch only *describes*. |
| Build-vs-runtime gate explicitness | **N/A** — no env-gated feature. |
| Empirical spike before speccing | **Satisfied, not N/A** — every claim in §2 is probe-backed: the predicate comparison table (§2.1), the "no TypeScript error" finding (§2.2c), the `is_admin()` body (§1.1 item 1), and the phrase's git ancestry (§2.4). No prose-first design of a stateful or race surface appears here. |
| Numeric sweep | Re-run after the R1 repair. The literals are 20 (`RoleFlag` values), 4 (documented predicate lines / `GatedTile` members), 5 (`CapabilityPredicate` members), 10 (`C(5,2)` matrix entries, and separately the instance count A–J), 15 (`C(6,2)`, cited once in §2.2c as the hypothetical), 2²⁰ = 1,048,576 (the powerset, §2.2b), and 164 ms (the measured per-predicate sweep cost, §2.2b). Each is verified against the file it describes in §2, and none is duplicated as an independent assertion — §2.2c is the single source for the derived counts, §2.2b for the flag universe. |
