# Plan — parser determinism pair (venue typo enumeration + known-sections ledger truth)

**Spec:** `docs/superpowers/specs/parser/2026-08-02-parser-determinism-pair.md` (canonical; this plan implements it and does not override it).
**Branch:** `test/parser-determinism-pair` (worktree off `origin/main` @ `09b6c2178`).
**Preflight:** run and green — `preflight: env ✓ local DB ✓`. (Diff is tests + docs only, but the worktree is fully provisioned.)

impeccable-gate: N/A — no UI surface

## Meta-test inventory

No new guard surface is created. Existing registries touched:

- `tests/docs/_metaDeferralLedgerGraduation.test.ts` → two `{ id, provenance }` rows appended to
  `BACKLOG_GRADUATED` (`:90`). This is the graduation ledger's own registry, required by the
  existing guard when an id moves to the archive — not a new guard.

Not applicable, each with the reason: no Supabase call sites (invariant 9 registry
`tests/auth/_metaInfraContract.test.ts` — N/A); no mutating routes or `"use server"` actions
(invariant 10 registries `tests/log/_auditableMutations.ts`,
`tests/log/mutationSurface/exemptions.ts` — N/A); no `pg_advisory*` call path, so the
single-holder topology at `tests/auth/advisoryLockRpcDeadlock.test.ts` is untouched (invariant 2 —
N/A); no migration, so no `pnpm gen:schema-manifest` and no validation-project apply; no §12.4
error-code row edits, so no `pnpm gen:spec-codes` lockstep; no UI surface, so no impeccable pair.

## Advisory-lock holder topology

N/A — this diff contains no `pg_advisory_xact_lock` / `pg_try_advisory_xact_lock` call site and no
RPC. Nothing acquires or releases a lock.

---

## Task 1 — exhaustive venue typo enumeration

**Files:** `tests/parser/blocks/venue.test.ts` (replaces the single `it(...)` at `:311-332`).

**Implements:** spec §4.

### 1.1 Red first — prove the NEW assertions are non-vacuous before trusting them

This is a test-only task, so "failing test first" means proving the new case can fail rather than
writing production code to satisfy it. Both proofs are performed and their output pasted into the
task's commit message; neither mutation is committed.

- **Mutation A (parser does nothing).** Temporarily edit `lib/parser/blocks/venue.ts` so
  `parseVenue` returns `null` immediately. The new case MUST go red. This is the proof the
  assertion is not absence-only: today's `:311-332` case, which asserts only that `UNKNOWN_FIELD`
  is absent, **passes** under this mutation. Record both results (old case green, new case red) —
  that contrast is the entire justification for the rewrite.
- **Mutation B (coverage silently shrinks).** Temporarily reorder `FIELD_ALIASES`
  (`lib/parser/aliases.ts:19`) so a venue field-bearing alias moves, or delete `venue address`
  from it. The coverage-floor assertion (§1.3) MUST go red. Under today's `.slice(0,4)` the same
  edit changes which cases run and stays green.

Revert both mutations before implementing.

### 1.2 Implementation

Replace the sampled loop. Enumerate **every** alias from `inScopeAliases("venue.")` with
`length >= 5`, and for each, **every** member of
`unambiguousTypos(alias.toUpperCase(), ALL, { minLen: 5 })` where `ALL = inScopeAliases("")`
uppercased — the same vocabulary the current case passes (`:313`), unchanged, because it is what
drops a neighbor colliding with another block's exact alias (`tests/parser/_typoGenerator.ts:32`).
**No `.slice` anywhere in the case.**

Partition each neighbor on `typo.trim() === alias.toUpperCase()` (spec §4.2):

| Partition | Count (measured) | Assert |
| --- | --- | --- |
| Trim-equivalent (leading/trailing space) | 22 | value lands in the alias's own venue field; **zero** warnings of any code |
| Everything else | 8431 | **zero** `UNKNOWN_FIELD`; **exactly one** `FIELD_LABEL_AUTOCORRECTED` with `severity === "warn"` and `blockRef` matching `{ kind: "venue" }` |

The markdown fixture per case stays the current two-row shape (`:322`) so the change is the
enumeration and the assertions, not the input:

```
| VENUE NAME | Four Seasons |
| <typo> | some value |
```

Every failure message names both the alias and the typo, as `:328` does today.

**Timeout (mandatory, spec §4.5):** pass `30_000` as `it()`'s third argument, with an inline
comment recording the measured 3.58s and the fact that vitest's default is 5000 ms with no
override in `vitest.config.ts` / `vitest.projects.ts` / `vitest.sequencer.ts` / `package.json`.
Do NOT raise the global `testTimeout`; every other test stays on the 5s default.

### 1.3 Guard assertions (anti-tautology)

- **Coverage floor.** Assert the enumerated alias set contains `venue name`, `venue address`,
  `loading dock`, `google link` **by name**, not by count. Concrete failure caught: a
  `FIELD_ALIASES` edit drops or renames a field-bearing alias and coverage silently shrinks. A
  count assertion would pass if one alias were swapped for another; the name assertion would not.
- **Non-vacuity.** Assert every enumerated alias contributes ≥1 generated case, and that the total
  case count is > 0. Concrete failure caught: a `_typoGenerator.ts` regression returning `[]`
  turns the whole loop into a silent no-op that reports green.

No hardcoded expected totals (`8453` / `8431` / `22` appear in comments and in this plan as
measurements, never as assertions) — a legitimate new venue alias must raise the count without
editing the test.

### 1.4 Verify

```
pnpm exec vitest run tests/parser/blocks/venue.test.ts        # green
```
Run it **5 times**; pass counts must be byte-identical across runs (spec §6). Record the runtime.

**Commit:** `test(parser): enumerate the venue typo space exhaustively instead of sampling`

---

## Task 2 — archive both backlog entries

**Files:** `BACKLOG.md`, `BACKLOG-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts`.

**Implements:** spec §5.3.

### 2.1 Red first

Append the two `BACKLOG_GRADUATED` rows (`:90`) **before** moving the entries. The guard's
"every graduated id is archive-only" case (`:348`) must go RED, proving the registry row is load
bearing and the guard actually reads it. Then perform the move and watch it go green.

Rows (`provenance` is the string the archived section must contain):

```ts
{ id: "BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE", provenance: "test/parser-determinism-pair" },
{ id: "BL-KNOWN-SECTIONS-WALKER",                  provenance: "test/parser-determinism-pair" },
```

Each row is preceded by a comment recording the corrected finding, matching the file's existing
comment convention (`:90-113`).

### 2.2 The move

Remove both `## BL-…` sections from `BACKLOG.md` **completely** — no stub row, no "see archive"
placeholder. The graduation guard asserts no id is both active and archived (`:338`) and that no
active entry carries a terminal status (`:389`, `:415`), so a leftover heading fails.

Add both to `BACKLOG-archive.md` using the established heading form seen at
`BACKLOG-archive.md:11`:

```
## BL-X — RESOLVED (2026-08-02, `test/parser-determinism-pair`)
```

followed by the resolution text, then the original entry body preserved beneath it so the history
survives. Resolution text must record the **corrected** findings from spec §2, not the original
diagnoses:

- `BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE` — the generator has no RNG (spec §2.1); the defect
  was order-coupled sampling; exhaustive enumeration of 8453 neighbors across all 11 venue aliases
  produced **0** `UNKNOWN_FIELD`, so the entry's open question ("is this a genuine
  `FIELD_LABEL_AUTOCORRECTED` recovery gap?") is answered **no** (spec §2.2); the 22
  no-autocorrect cases are leading/trailing-space neighbors that `.trim()` resolves exactly, which
  is correct behavior; the case now carries an explicit 30s timeout because the exhaustive loop
  measures 3.58s against a 5000 ms default.
- `BL-KNOWN-SECTIONS-WALKER` — delivered 2026-07-06 by
  `tests/parser/_metaKnownSectionsWalker.test.ts` (`c6bd73001`); this branch retired the stale
  entry and the two docstrings that contradicted it. Include the spec §2.4 asked-for/shipped
  mapping so a future reader does not re-derive it.

### 2.3 Verify

```
pnpm exec vitest run tests/docs/                              # green
```

**Commit:** `docs(backlog): archive the venue typo-generator and known-sections-walker entries`

---

## Task 3 — correct the two stale docstrings

**Files:** `lib/parser/knownSections.ts` (`:12-20`), `tests/parser/_metaKnownSectionsRegistry.test.ts` (`:9-17`).

**Implements:** spec §5.1, §5.2. Sequenced after Task 2 so the replacement text can reference the
archived entry rather than an active one.

### 3.1 What is false today

Both docstrings assert the parsers have "no shared introspectable constant," that the walker does
not exist, and that real enforcement "is filed as BL-KNOWN-SECTIONS-WALKER in BACKLOG.md." All
three clauses are false: `lib/parser/blocks/_sectionHeaderMatch.ts` is the shared factory with 9
importers under `lib/`, the parsers export `SECTION_HEADER_TOKENS`, and
`tests/parser/_metaKnownSectionsWalker.test.ts:133-136` reads the directory.

### 3.2 Replacement text must state

- The walker is `tests/parser/_metaKnownSectionsWalker.test.ts` and is the **primary** drift guard:
  filesystem-walked, fails-by-default for a new `blocks/*.ts`, exact-subset ⊆ registry.
- The registry pin is the **secondary** guard, and why it is not redundant (spec §5.2): the
  walker's subset check catches a registry deletion only while some parser still exports the
  token; a single edit removing a header from **both** `KNOWN_SECTION_HEADERS` and the owning
  parser's `SECTION_HEADER_TOKENS` leaves the walker green, and `REQUIRED_HEADERS`
  (`_metaKnownSectionsRegistry.test.ts:35-59`) is what fails then.
- Neither docstring may describe `BL-KNOWN-SECTIONS-WALKER` as open work. A provenance-style
  reference to the now-archived id is fine and stays valid under
  `tests/docs/_metaLedgerReferentialIntegrity.test.ts`, which resolves citations against the
  archive ledgers too (`:48-52`).

### 3.3 Verify

```
pnpm exec vitest run tests/parser/_metaKnownSectionsWalker.test.ts tests/parser/_metaKnownSectionsRegistry.test.ts   # 35 passed
pnpm exec vitest run tests/docs/                                                                                     # green
```

**Commit:** `docs(parser): correct two docstrings that still claim the known-sections walker is unbuilt`

---

## Task 4 — full-suite verification and close-out

No code changes. Run, in the worktree:

```
pnpm exec vitest run tests/parser/    # whole parser suite
pnpm exec vitest run tests/docs/      # ledger guards
pnpm lint && pnpm typecheck
```

Then the whole-diff Codex adversarial review (fresh-eyes, REVIEWER ONLY), push, real CI green,
`gh pr merge --merge`, fast-forward local `main` to `0  0`.

---

## 12. Close-out

impeccable-gate: N/A — no UI surface

Diff touches `tests/parser/blocks/venue.test.ts`, `tests/docs/_metaDeferralLedgerGraduation.test.ts`,
`lib/parser/knownSections.ts` (comment only), `tests/parser/_metaKnownSectionsRegistry.test.ts`
(comment only), `BACKLOG.md`, `BACKLOG-archive.md`, and the spec/plan documents. No file under
`app/` (excluding `app/api/**`), `components/`, `app/globals.css`, `tailwind.config.*`, or
`DESIGN.md` is touched, so the invariant-8 impeccable critique/audit pair does not apply.

Findings and dispositions from the spec review, the plan review, and the whole-diff review are
recorded in the PR body.
