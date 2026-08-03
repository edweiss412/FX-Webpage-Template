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

10. **The coverage-claim class is DESCOPED to `BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES` and is not in this diff** (§1.2, §2.7). Naming a thirteenth instance is not a finding against this branch; it is content for that row. The descope decision is itself the R3 response to three consecutive under-counts, per the AGENTS.md same-vector rule.

11. **Un-skipping the two e2e suites is OUT OF SCOPE and is not a finding.** `tests/e2e/right-now-transitions.spec.ts:154` and `tests/e2e/right-now-transitions.spec.ts:291`, plus `tests/e2e/transport-tile.spec.ts:225`, are `test.describe.skip` for a documented reason recorded in the file itself (`tests/e2e/right-now-transitions.spec.ts:285-290`): the `?crew=`/`?as=admin` dev mock they drive was retired, and each case renders as a specific non-LEAD crew identity that `signInAs` cannot reproduce without per-test crew rows and fixture seeding. This branch neither un-skips them nor edits the artifacts that misdescribe that state — both belong to the descoped class (§1.1 item 10). It files the gap (§2.6, §2.7); restoring the coverage is a separate, much larger piece of work.

### 1.2 In scope

Six instances of one class — **a hand-maintained restatement of a predicate or structure that nothing forces to stay true** — across three files, plus the ledger graduation. Two were filed in the ledger entry; four were found by the class sweep it obliged.

| # | Site | Claim | Status |
| --- | --- | --- | --- |
| A | `lib/visibility/capabilityTransitions.ts:124` | `financialsVisible = isAdmin \|\| LEAD` | Filed as instance 1 of the ledger entry |
| B | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627` (MI-9) | "LEAD additionally grants the admin/ops surface" | Filed as instance 2 |
| C | `lib/visibility/capabilityTransitions.ts:47-52` | a predicate addition "surfaces … in the matrix as a TypeScript error if the matrix is incomplete" | **Found by class sweep** |
| D | `lib/visibility/capabilityTransitions.ts:6-7` | "the five gated tiles" (four are then named) | **Found by class sweep** |
| E | `lib/visibility/capabilityTransitions.ts:56` | "The five gated tiles whose visibility this matrix covers" | **Found by class sweep** |
| F | `tests/visibility/capabilityTransitions.test.ts:26-32` | a hand-listed `ALL_PREDICATES` under `satisfies readonly CapabilityPredicate[]`, which permits a subset and so can silently under-cover a widened union | **Found by class sweep** |

**A sub-class was found, then DESCOPED at review R3 — `BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES`.** Review R1 surfaced two artifacts claiming e2e coverage from suites that are `test.describe.skip`. Successive sweeps grew that set to 4, then 9, then 12, and R3 found three more in a file no sweep had touched (`tests/time/rightNowTransitions.test.ts`) plus two that every sweep's regex had missed because their text says "audit suite" and "the helper covers" without the token `e2e`.

Three consecutive rounds under-counted the same vector, which is the exact condition AGENTS.md's same-vector rule addresses: stop patching per-instance, declare the vector unresolved, and converge structurally rather than retail. It is descoped here for two reasons beyond round count:

1. **It is a different class, not a wider instance of this one.** A through F are restatements of a *predicate, a structure, or an entitlement* — what a function computes, how many predicates exist, which pairs the matrix holds. The coverage claims are restatements of *whether a test executes*. They share a family resemblance ("a sentence nothing forces to stay true") but not a fix: the first kind is closable by a behavioral guard, as §2.2 does; the second would need a guard that parses Playwright skip state and assertion content and binds it to prose.
2. **Its extent is unbounded and unmeasured.** Every sweep so far was scoped to files this branch already had reason to open. Nothing suggests the class stops there — it reached `tests/time/` the moment anyone looked, and the repo has twelve e2e specs containing `describe.skip`.

Bundling an open-ended class into a branch chartered to settle two named claims is what drove three BLOCKING rounds. The row carries every instance found, both failed sweep patterns, and the finding that the sweep must be mechanical rather than hand-run. Nothing is lost; it is handed over rather than half-done.

C through F are not in the ledger entry. They are the same defect shape — a hand-maintained restatement of something the code already knows, with nothing forcing the two to agree — and AGENTS.md requires sweeping the shape before patching the named instance.

**The three files:** `lib/visibility/capabilityTransitions.ts` (A, C, D, E), `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (B), `tests/visibility/capabilityTransitions.test.ts` (F).

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

1. Read `lib/visibility/capabilityTransitions.ts` from disk; locate the quoted-predicate block by its literal `(verbatim branch logic from` sentinel and the blank comment line that terminates it. **A block that is not found, or whose documented set differs from the reflected non-exempt exports, fails the test** — the guard can never silently pass by parsing nothing.
2. For each line, take the text between `=` and the first `(`, normalize whitespace, and require it to match `^<token>( || <token>)*$` where `<token>` is `[A-Za-z0-9_]+`. Any other separator (`&&`, `!`, a nested paren) fails — the guard refuses to interpret an expression shape it was not built to check.
3. Reflect over the `scopeTiles` module namespace (`import * as scopeTiles`, keys ending in `Visible` whose value is a function) and require every such export to be **either documented in the block or carried by a `NOT_FLAG_GATED` exemption row with a reason** — the registry-or-exemption idiom invariants 9 and 10 already use in this repo. A new `*Visible` export is therefore uncovered-by-default and fails until someone classifies it.

   **The exemption exists because the reflection over-captures**, which spec review R2 caught with a probe: `scopeTiles.ts:180` exports `transportTileVisible`, whose parameter is an options object (`{ transportation, viewerId, transportationOwnerIds, viewerName, … }`), not a `RoleFlag[]`. It is not a capability-flag gate and has no place in a block of flag disjunctions. It gets the one exemption row. Naming it in an exemption rather than in a hard-coded "these four" list is what keeps the fail-by-default property: the list of *things to check* stays derived, and only the *classification* is written down. **The reason string is asserted, not merely present** — R3 showed that checking key presence alone makes "blank the reason" an escaping mutation, so the guard requires every exemption value to be a non-empty string that cites a `file:line`. An exemption whose justification has been hollowed out is no longer an exemption.

3b. Do **not** hand-maintain how each predicate is called, and do **not** infer it from arity either. **Pass the second argument unconditionally and sweep both `isAdmin` values for every predicate.**

   Two rounds got here. R2's probe showed the hand-written `TAKES_IS_ADMIN` set was itself an instance of the class under settlement: it silently exempted three predicates from ever being evaluated at `isAdmin = true`. The replacement — `fn.length >= 2` — was refuted in turn at R9, because **default parameters do not contribute to `Function.length`**: `(flags, isAdmin = false) => isAdmin || …` reports length 1, so the guard never tried `isAdmin = true` and a mutant granting every tile to admins swept clean over all 2²⁰ subsets. There is no reliable runtime signal for "does this function take `isAdmin`", so the guard stops asking. A predicate that genuinely ignores the argument answers identically either way, which is exactly what a documented expression carrying no `isAdmin` token predicts — so the unconditional sweep is correct for both kinds and cheaper to reason about than either heuristic.
4. For each predicate, assert behavioral equivalence against the live function **exhaustively over the entire `RoleFlag` powerset** — all 2²⁰ = 1,048,576 flag subsets — and over the full `subset × isAdmin` cross product **for every predicate, not only the one that declares an `isAdmin` parameter**. A documented line is a pure disjunction, so its semantics are total and checkable: for every subset `S` and every `isAdmin` value,

   ```
   fn(S, isAdmin) === (isAdmin && tokens.includes("isAdmin")) || S ∩ tokens ≠ ∅
   ```

   **Why exhaustive rather than a singleton sweep.** A singleton-only sweep (`fn([f])` for each flag, plus the empty set) is defeated by any conjunctive branch: adding `V1 && L1` to `audioScopeVisible` changes no singleton result and no documented token, so the guard would pass while a two-flag viewer sees a tile the comment says is hidden. Measured on this machine: **eight sweeps** (four predicates × two `isAdmin` values), two orderings each, 16,777,216 calls, **2.6 s total** — so there is no reason to accept an arity limit. Exhaustion removes the escaping-mutant question for the input SET: no conjunctive, disjunctive, negated, or cardinality-dependent branch of any arity survives. **It does not establish order-insensitivity.** R6 showed the bitmask emits one ordering per subset (so `flags[0] === "L1" && flags[1] === "V1"` hid); the sweep now also evaluates each subset reversed, and R7 showed even that is escapable by a three-element permutation. 20! is not enumerable, so the precise claim is: **every subset, at two orderings, against both `isAdmin` values.** That is acceptable rather than a hole because the live predicates are `Array.includes` disjunctions — order-insensitive by construction — and a permutation-sensitive rewrite is a conspicuous code change, not the silent comment drift this guard exists to catch.

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

**How the correction is held.** Not by pinning MI-9's wording. Reviews R4 through R6 settled that question empirically: R4 introduced substring bans, R5 refuted them with synonyms, and R6 refuted the R5 repairs with "compiler error" and "seven capability predicates". Three rounds on one vector is the AGENTS.md stop condition, and the conclusion is that **a sentence is not machine-verifiable** — a pin that claims otherwise fails to catch what it advertises and costs a round each time someone probes it. The apparatus is removed.

What replaces it is a pin on **the fact the sentence reports**, asked of the database and answered by CALLING the function rather than by reading its text (`tests/db/isAdminRoleFlagsContract.test.ts`): under an admin JWT role claim `is_admin()` returns true; under a signed-in non-admin it returns false. Probed live: admin `true`, crew `false`.

R7 refuted a containment-only version of this test with a probe — a definition gutted to `select false` that retains `app_metadata` and `admin_emails` as dead strings satisfies every containment assertion. **Those containment assertions are therefore gone**; only behavior and one absence check remain. The absence check is textual and legitimately so: MI-9 claims an ABSENCE, which behavior cannot demonstrate, so the resolved `pg_get_functiondef` of `public.is_admin` must not match `role_flags`. Asking Postgres for the resolved definition also catches a later migration redefining the function, which R6 showed a scan of one historical migration file does not.

If admin is ever routed through a role flag, this fails and MI-9 is forced back open. That is the protection worth having; the wording of the clause is left to review, where it belongs. The same reasoning governs instances C, D, and E: their corrections are verified by review, not by a pin, and what is machine-checked is the thing each sentence now describes (Task 2's synthetic-6 case for C; the `GatedTile` and `CAPABILITY_PREDICATES` definitions for D and E).

**Stated limit, unchanged:** a determined author can still write a false sentence. Prose is not machine-verifiable and nothing here claims otherwise.

### 2.5 The one historical record that endorses the claim

`docs/superpowers/plans/2026-08-02-docs-hygiene-citation-rot-financials-vocab.md:142` does not merely quote the claim — it asserts "LEAD alone additionally grants the admin/ops surface, **stated correctly** at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627`", citing the exact line this branch rewrites. After the fix, that sentence endorses a claim its own citation no longer contains.

**Decision: leave it.** It is a shipped plan describing a deferral as it was understood on 2026-08-02, and the project's rule for shipped plans and design records is that they are execution history, not claims in force (`docs/superpowers/specs/2026-08-02-copy-deadcode-sweep-design.md:34`). Editing a merged plan's reasoning to match a later finding erases the record of what was believed when the work was scoped. Recorded here so a future reader who greps the phrase and finds the endorsement has the resolution attached rather than re-opening the question — which is the same service §2.4's negative claim performs for the spec.

### 2.6 Ledger graduation

`BL-LEAD-CAPABILITY-PROSE-STALE` moves from `BACKLOG.md`'s open queue to `BACKLOG-archive.md` under a `## BL-LEAD-CAPABILITY-PROSE-STALE — RESOLVED (2026-08-03, docs/settle-lead-capability-prose)` heading preserving the entry body, per the convention measured by `tests/docs/_metaDeferralLedgerGraduation.test.ts`. A `{ id, provenance: "docs/settle-lead-capability-prose" }` row is appended to that file's `BACKLOG_GRADUATED` array (`tests/docs/_metaDeferralLedgerGraduation.test.ts:90`), and `BACKLOG.md`'s "Last reconciled" header line gains this pass.

The `**Status:** IN PROGRESS · **Branch:** docs/settle-lead-capability-prose` marker written onto the entry at Stage 0 (invariant 12) leaves with the entry when it graduates, which is the convention's by-construction case — no separate removal step, and `tests/docs/_metaLedgerInProgress.test.ts`'s "archives may not hold in-flight work" rule requires the marker be dropped during the move.

**One new backlog row is filed** — `BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES`. This reverses the draft's "no new row" position. The row does not record a defect this branch declined to fix out of convenience; it records a **class this branch is not chartered to close**, descoped at review R3 after three consecutive rounds under-counted it (§1.2). Its content is specified in §2.7: twelve known instances, the ground-truth probes, the single blocker, the two already-honest sites that must not be touched, and the methodological finding that a hand-run grep cannot bound this class. Filing is also forced mechanically — `tests/docs/_metaLedgerReferentialIntegrity.test.ts` fails on a `BL-` id cited by a document but defined in no ledger.

No row is filed for the other residue: §2.3's unguarded free-text prose is a stated accepted limit, not deferred work.

### 2.7 The descoped sub-class — what the new row must carry

`BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES` is filed with the full product of three review rounds, so the next pass starts from evidence rather than re-deriving it.

**Instances found so far (12; the set is NOT known to be complete):**

| Site | Claim |
| --- | --- |
| `lib/visibility/capabilityTransitions.ts:36-39` | compound transitions "are exercised by the e2e compound-transition tests in `tests/e2e/right-now-transitions.spec.ts`" |
| `lib/visibility/capabilityTransitions.ts:130` | "the delta is empty (the e2e compound tests cover those cases)" |
| `lib/visibility/capabilityTransitions.ts:213` | an entry `reason` ending "LEAD/admin compound interactions are tested by e2e" |
| `tests/visibility/capabilityTransitions.test.ts:8-9` | the first claim restated in the test header |
| `tests/visibility/capabilityTransitions.test.ts:194` | "the e2e compound test verifies the no-flicker invariant" |
| `tests/e2e/helpers/rightNow.ts:183` | skipped pairs "the compound tests handle them with explicit setup" |
| `tests/e2e/helpers/rightNow.ts:239` | "the compound tests … cover the recovery paths" |
| `tests/e2e/helpers/rightNow.ts:286-292` | "the helper covers TIME-DRIVEN transitions"; "the audit suite documents which transitions can be driven via tick-only" |
| `tests/visibility/transportTransitions.test.ts:10` | "animation behavior is exercised in e2e tests" |
| `lib/time/rightNowTransitions.ts:12-14` | the Playwright audit "scaffolded as `test.fixme` until Batch 2 lands `framer-motion`" drives its assertions from this constant |
| `lib/time/rightNowTransitions.ts:82-86` | `unreachable` transitions are "Regression-guarded by the audit suite" |
| `tests/time/rightNowTransitions.test.ts:6-8` | "Animation-behavior tests live in `tests/e2e/right-now-transitions.spec.ts` (scaffolded as `test.fixme()` …)" |

**Ground truth the row records once**, so no future pass re-probes it:

```
$ grep -n 'describe.skip' tests/e2e/right-now-transitions.spec.ts
154:  ... 66-pair pairwise transition audit
291:  ... 6 compound transition audits
$ grep -c 'CAPABILITY_TRANSITION_MATRIX|affectedTilesOnFlip|FinancialsTile|AudioScopeTile' tests/e2e/right-now-transitions.spec.ts
0
$ grep -n 'describe.skip|test.describe(' tests/e2e/transport-tile.spec.ts
225:  ... crew page — TransportTile (Task 4.7, §8.1)      [the file's only describe]
$ grep -c 'AnimatePresence|animation|transition|opacity' tests/e2e/transport-tile.spec.ts
0
$ grep -rl 'describe.skip' tests/e2e/ | wc -l
12
```

The blocker for all of it is one thing: the `?crew=`/`?as=admin` dev mock was retired, and each case renders as a specific non-LEAD crew identity that `signInAs` cannot reproduce without per-test crew rows matching `NON_ADMIN_CREW_FIXTURE` plus per-test fixture seeding (`tests/e2e/right-now-transitions.spec.ts:285-290`). Several claims are stale in a *second* way: they attribute non-execution to `test.fixme` pending `framer-motion`, a blocker that no longer applies.

**Two sites that are already honest** and must NOT be "fixed": `tests/visibility/capabilityTransitions.test.ts:224` says the gap is deferred pending Realtime push (M6); `tests/visibility/capabilityTransitions.test.ts:272` is future-tense about the same thing.

**The methodological finding, which is the row's most valuable content.** Three hand-run sweeps under-counted this class, and each failure was a *pattern* failure rather than an effort failure:

- Sweeping `e2e|E2E` misses claims phrased "the audit suite", "the compound tests", "the helper covers" — no token in common.
- Scoping the sweep to files the branch already had reason to open missed `tests/time/rightNowTransitions.test.ts` entirely.

So the row's fix shape is **not** "grep harder." It is: enumerate every `describe.skip` / `test.fixme` / `test.skip` suite mechanically, resolve which modules and tests cite each one, and check the citing prose — or accept that prose coverage claims are unguardable and delete the class of sentence instead of maintaining it. That decision is the row's open question, and it is a design call this branch has no charter to make.

---

## 3. Files touched

| File | Change |
| --- | --- |
| `lib/visibility/capabilityTransitions.ts` | Instances A, C, D, E: predicate corrected; FINANCIALS exclusion stated; `lib/visibility/capabilityTransitions.ts:47-52` mechanism claim corrected; `CAPABILITY_PREDICATES` const added and the union derived from it; count words removed at `lib/visibility/capabilityTransitions.ts:6-7` and `lib/visibility/capabilityTransitions.ts:56` |
| `tests/visibility/_metaDocumentedPredicateParity.test.ts` | **New.** Documented-predicate behavioral parity guard (§2.2b) |
| `tests/db/isAdminRoleFlagsContract.test.ts` | **New.** Contract pin behind MI-9: the live `is_admin()` definition contains no `role_flags` (§2.4) |
| `tests/visibility/capabilityTransitions.test.ts` | Three hardcoded counts derived from `CAPABILITY_PREDICATES.length`; pair-set equality assertion replaces count-plus-no-duplicates; the duplicate `ALL_PREDICATES` list (instance F) deleted in favour of the import |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` | MI-9 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627`) clause replaced (§2.4). Line-count neutral |
| `BACKLOG.md` | Entry removed from the open queue; `BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES` filed (§2.7); "Last reconciled" updated |
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
| AC-2 | All four documented predicate lines match live behavior over **every one of the 2²⁰ flag subsets, at two orderings, against BOTH `isAdmin` values — for every predicate, not only `financialsVisible`** | New guard green. Negative probe: a conjunctive `V1 && L1` branch spliced into `audioScopeVisible` must turn it red — the exact mutant a singleton-only sweep let through in spec review R1 |
| AC-3 | The guard fails loudly if the block is missing, malformed, or documents a set of predicates that differs from the reflected non-exempt exports (a correctly-documented NEW flag-gated export is therefore accepted, by design — the guard pins agreement, not a fixed count of four) | The block parser is a **pure function taking source text as a parameter** (not a module-level read), so three negative cases drive it over synthetic strings: no header line, a line using `&&`, and a block yielding fewer entries than there are non-exempt exports |
| AC-4 | The guard fails if a `*Visible` export is added to `scopeTiles.ts` without a documented line | Namespace-reflection assertion (§2.2b step 3) |
| AC-5a | Instance C's false mechanism claim is gone | `lib/visibility/capabilityTransitions.ts` no longer promises a compiler error for an incomplete matrix, and names `tests/visibility/capabilityTransitions.test.ts` as the enforcement instead. Verified by review + grep, not by a pin (§2.4) |
| AC-5 | Matrix expectations derive from `CAPABILITY_PREDICATES.length`, not literals | No literal `10` or `4` remains as a matrix-size expectation in `tests/visibility/capabilityTransitions.test.ts` |
| AC-6 | A sixth predicate forces matrix growth | The pair-set builder is likewise a **pure function taking the predicate list as a parameter**, so a negative case passes it a synthetic 6-element list and asserts it demands 15 pairs — proving the expectation tracks `n` rather than coincidentally equalling 10 |
| AC-7 | A `RoleFlag` added without updating the guard's universe is a compile error | `Exclude<…> extends never` check; verified by a scratch `tsc` probe, not asserted |
| AC-8 | MI-9 carries no admin claim, no live document asserts one, and the underlying contract is pinned | `tests/db/isAdminRoleFlagsContract.test.ts` green;  `rg -n "admin/ops" lib app components tests` → 0; and `rg -n "admin/ops" docs` minus this branch's own spec and plan leaves only the historical records enumerated in §1.1 item 4. (This branch's two documents necessarily contain the phrase — they are about it — so they are excluded by construction, not by exception.) |
| AC-9 | Ledger graduated cleanly | `pnpm vitest run tests/docs/` green, including `_metaDeferralLedgerGraduation`, `_metaLedgerInProgress`, `_metaLedgerReferentialIntegrity` |
| AC-10 | No regression elsewhere | Full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:lint` green |
| AC-11a | Instances D and E carry no count that can drift | The sentences name `CAPABILITY_PREDICATES` and the `GatedTile` union instead of counting them. Verified by review + grep |
| AC-11 | The descoped class is handed over, not dropped | `BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES` resolves in `BACKLOG.md` and carries all twelve instances plus the two already-honest exclusions from §2.7; `tests/docs/_metaLedgerReferentialIntegrity.test.ts` green |

---

## 5. Verification commands

```
pnpm vitest run tests/visibility/                       # AC-1..AC-6
pnpm typecheck                                          # AC-7
rg -n "admin/ops" lib app components tests              # AC-8 (expect 0)
pnpm vitest run tests/docs/                             # AC-9
pnpm test && pnpm lint && pnpm format:check             # AC-10
pnpm spec:lint docs/superpowers/specs/2026-08-03-lead-capability-prose-settle-design.md
pnpm spec:lint docs/superpowers/plans/2026-08-03-lead-capability-prose-settle.md   # one doc per invocation
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
| Tier × domain completeness matrix | **Reduced, not N/A.** The branch adds no DDL, migration, RPC, trigger, or write path, so most of the matrix is empty — but it adds a DB-BOUND TEST that opens a connection, sets `request.jwt.claims`, and calls `public.is_admin()`, so the DB dimension is not inapplicable. The one affected cell: **admin-identity read path × test layer** → `tests/db/isAdminRoleFlagsContract.test.ts`, read-only, no seed, no mutation, runs in the `unit-suite-db` legs. Every other cell (DDL, CHECK, RPC read, RPC write, trigger, cleanup, frontend, audit page) → N/A, no such change. |
| CHECK/enum migration matrix | **N/A** — no CHECK, no enum, no migration. |
| Flag lifecycle table | **N/A** — no boolean config field or toggle is added, read, or written. `role_flags` values are pre-existing data this branch only *describes*. |
| Build-vs-runtime gate explicitness | **N/A** — no env-gated feature. |
| Empirical spike before speccing | **Satisfied, not N/A** — every claim in §2 is probe-backed: the predicate comparison table (§2.1), the "no TypeScript error" finding (§2.2c), the `is_admin()` body (§1.1 item 1), and the phrase's git ancestry (§2.4). No prose-first design of a stateful or race surface appears here. |
| Numeric sweep | **Re-run at R10.** The literals are 6 (class instances, A–F), 3 (files they span), 20 (`RoleFlag` values), 4 (documented predicate lines / `GatedTile` members), 5 (`CapabilityPredicate` members), 10 (`C(5,2)` matrix entries), 15 (`C(6,2)`, the hypothetical in §2.2c), 2²⁰ = 1,048,576 (subsets), 8 (sweeps: four predicates × two `isAdmin` values), 16,777,216 (calls) and 2.6 s (measured wall clock). Each is verified against the section it describes; §2.2b is the single source for the sweep figures and §2.2c for the derived counts. |
