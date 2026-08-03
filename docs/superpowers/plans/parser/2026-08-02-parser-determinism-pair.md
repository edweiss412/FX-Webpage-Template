# Plan — parser determinism pair (venue typo enumeration + known-sections ledger truth)

**Spec:** `docs/superpowers/specs/parser/2026-08-02-parser-determinism-pair.md` (canonical; this plan implements it and does not override it).
**Branch:** `test/parser-determinism-pair` (worktree off `origin/main` @ `09b6c2178`).
**Preflight:** run and green — `preflight: env ✓ local DB ✓`. Diff is tests plus docs only, but the worktree is fully provisioned.

impeccable-gate: N/A — no UI surface

## Meta-test inventory

No new guard surface. Existing registries touched:

- `tests/docs/_metaDeferralLedgerGraduation.test.ts` → two `{ id, provenance }` rows appended to
  `BACKLOG_GRADUATED` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:90`). Required by the
  existing guard when an id moves to the archive; spec §5.3 records that without them the ledger
  verification is false-green. Not a new guard.

Not applicable, each with its reason: no Supabase call sites (invariant 9 registry
`tests/auth/_metaInfraContract.test.ts`); no mutating routes and no `"use server"` actions
(invariant 10 registries `tests/log/_auditableMutations.ts`,
`tests/log/mutationSurface/exemptions.ts`); no `pg_advisory*` call path, so the single-holder
topology at `tests/auth/advisoryLockRpcDeadlock.test.ts` is untouched (invariant 2); no migration,
so no `pnpm gen:schema-manifest` and no validation-project apply; no §12.4 error-code row edits, so
no `pnpm gen:spec-codes` lockstep; no UI surface, so no impeccable pair.

## Advisory-lock holder topology

N/A — no `pg_advisory_xact_lock` / `pg_try_advisory_xact_lock` call site and no RPC in this diff.

---

## Task 1 — exhaustive venue typo enumeration

**File:** `tests/parser/blocks/venue.test.ts` (replaces the single `it(...)` at
`tests/parser/blocks/venue.test.ts:311`).

**Implements:** spec §4.

### 1.1 Red first — six mutations, per spec §4.6

The deliverable is a test, so the red state comes from mutating the tree rather than from
production code that does not yet exist. Run all six, paste the output into the commit message,
revert each before the next. **None is committed.**

| Mutation | Edit | Required result |
| --- | --- | --- |
| **A** — parser does nothing | `parseVenue` returns `null` immediately (`lib/parser/blocks/venue.ts`) | **new** case RED **and old case at `tests/parser/blocks/venue.test.ts:311` GREEN** — the proof the rewrite removed an absence-only assertion |
| **B** — shadowing anchor | anchor every case with `\| VENUE NAME \| Four Seasons \|` | `venue.name` value assertions RED — proves the derived non-colliding anchor is load-bearing |
| **C** — coverage shrink | delete the `venue.notes` alias list from `FIELD_ALIASES` (`lib/parser/aliases.ts:34`) | derived coverage floor RED, and **only** that — `venue.notes` is its canonical's sole alias and no fixture case asserts `notes` |
| **D** — mis-routed correction | reroute `venue.contact_info` / `venue.in_house_av` / `venue.hotel_reservations` to `venue.address` inside `parseVenue` | non-assignable no-stray-value assertion RED on all 4517 cases |
| **E** — resampling | reintroduce `.slice(0, 1)` on the generator output | per-alias volume floor RED for every alias |
| **F** — collateral anchor corruption | after a correct assignment, also overwrite the populated anchor field | anchor-integrity clause RED — measured 1444 corrupted outputs with 0 failures against the A-E design |

Mutations A, D, E are the load-bearing ones: today's case passes under A, and D and E are the two
mutants cross-model review used to refute weaker drafts of this design. Capture each result
verbatim.

Do **not** use `"Hotel Address"` for mutation C: `venue.address` keeps its second alias
`venue address`, so the canonical stays represented and the floor does not red (review round 2).

### 1.2 Implementation

Enumerate **every** alias from `inScopeAliases("venue.")` with `length >= 5`, and for each,
**every** member of `unambiguousTypos(alias.toUpperCase(), ALL, { minLen: 5 })` where
`ALL = inScopeAliases("")` uppercased — unchanged from `tests/parser/blocks/venue.test.ts:313`.
**No `.slice` anywhere in the case.**

**Canonical→field table.** Mirror `parseVenue`'s five assignment sites
(`lib/parser/blocks/venue.ts:254`, `lib/parser/blocks/venue.ts:265`,
`lib/parser/blocks/venue.ts:276`, `lib/parser/blocks/venue.ts:287`,
`lib/parser/blocks/venue.ts:298`):

```ts
const VENUE_OUTPUT_FIELD: Record<string, string> = {
  "venue.name": "name",
  "venue.address": "address",
  "venue.loading_dock": "loadingDock",
  "venue.google_link": "googleLink",
  "venue.notes": "notes",
};
```

A canonical absent from this table is non-assignable (`venue.contact_info`, `venue.in_house_av`,
`venue.hotel_reservations` — owned by `contacts.ts` / `hotels.ts`, spec §2.2). Derive each alias's
canonical with `resolveAlias(alias)`; never hardcode a per-alias list.

**Anchor, derived.** One anchor row per case, whose canonical differs from the alias under test:
`| VENUE NAME | Four Seasons |` normally, and a different venue row (e.g.
`| LOADING DOCK | dock ref |`) when `resolveAlias(alias) === "venue.name"`. The anchor is required —
a lone typo row does not open the block (spec §2.3).

**Three-way partition and assertions** (spec §4.2):

| Partition | Assert |
| --- | --- |
| Trim-equivalent (`typo.trim() === alias.toUpperCase()`) | no `UNKNOWN_FIELD`; no `FIELD_LABEL_AUTOCORRECTED`; `TYPO_NORMALIZED` present **iff** the alias is in `TYPO_ALIASES` (`lib/parser/aliases.ts:142`) |
| Non-trim, assignable alias | no `UNKNOWN_FIELD`; exactly one `FIELD_LABEL_AUTOCORRECTED` with `severity === "warn"` and `blockRef` matching `{ kind: "venue" }`; the typo's value reaches `VENUE_OUTPUT_FIELD[canonical]`; **and no other output field carries it** |
| Non-trim, non-assignable alias | no `UNKNOWN_FIELD`; exactly one `FIELD_LABEL_AUTOCORRECTED` of the same shape; **and no output field carries the typo's value at all** |

Use a distinctive sentinel as the typo row's value and scan the whole result object, not one field —
that is what makes this a routing assertion and what kills mutation D.

**Anchor integrity, every partition:** also assert the anchor row's own field still holds the
anchor's exact value. Kills mutation F, which otherwise passes with 1444 corrupted outputs and 0
assertion failures.

Failure messages name both alias and typo, as `tests/parser/blocks/venue.test.ts:328` does today.

**Timeout:** `30_000` as `it()`'s third argument, with an inline comment recording the measured
3.58s and that no `testTimeout` override exists in `vitest.config.ts`, `vitest.projects.ts`,
`vitest.sequencer.ts`, or `package.json` (so the default is 5000 ms). Do **not** raise the global.

### 1.3 Guard assertions (anti-tautology)

- **Derived coverage floor.** Assert the enumerated alias set covers **every** key of
  `VENUE_OUTPUT_FIELD` — all five assignable canonicals. Derived, not a four-name list, so dropping
  the **last** alias of any assignable canonical is caught (spec §4.3; review round-1 finding F5).
  It does **not** catch dropping one alias of a multi-alias canonical — see the accepted limit
  below.
- **Per-alias volume floor.** Assert each alias contributes ≥ `alias.length * 10` cases. Derived,
  not hardcoded; measured ratios run 53.8–56.6, so ~5x headroom. Reds mutation E (`.slice(0, 1)`,
  ratio 0.09) and the original `.slice(0, 6)`.
- **Non-vacuity.** Assert every enumerated alias contributes ≥1 case and the total is > 0. Catches
  a `_typoGenerator.ts` regression returning `[]` that would make the loop a silent no-op.

**Accepted limit (spec §4.3):** the floor is per-canonical, so deleting one alias of a multi-alias
canonical does not red it. `Hotel Address` is guarded instead by the corpus fixture case at
`tests/parser/blocks/venue.test.ts:105`.

No hardcoded totals: `8453` / `3926` / `4527` / `22` may appear in comments as measurements, never
in assertions, so a legitimate new venue alias raises coverage without a test edit.

### 1.4 Verify

```
pnpm exec vitest run tests/parser/blocks/venue.test.ts     # green, x5, identical pass counts
```

**Commit:** `test(parser): enumerate the venue typo space exhaustively and assert value assignment`

---

## Task 2 — archive both backlog entries

**Files:** `BACKLOG.md`, `BACKLOG-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts`.

**Implements:** spec §5.3.

### 2.1 Red first

Append the two `BACKLOG_GRADUATED` rows **before** moving the entries. The guard's "every graduated
id is archive-only" case must go RED — proving the registry row is load-bearing and the guard reads
it. Then perform the move and watch it go green.

```ts
{ id: "BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE", provenance: "test/parser-determinism-pair" },
{ id: "BL-KNOWN-SECTIONS-WALKER",                  provenance: "test/parser-determinism-pair" },
```

Each row is preceded by a comment recording the corrected finding, matching the file's existing
convention.

### 2.2 The move

Remove both `## BL-…` sections from `BACKLOG.md` **completely** — no stub, no "see archive" line.
The guard asserts no id is both active and archived, and that no active entry carries a terminal
status, so a leftover heading fails.

Add both to `BACKLOG-archive.md` in the established form (`BACKLOG-archive.md:11`):

```
## BL-X — RESOLVED (2026-08-02, `test/parser-determinism-pair`)
```

The branch string must appear in the archived section — it is the `provenance` the guard checks.
Resolution text carries the corrected findings from spec §5.3 (no RNG; order-coupled sampling over
aliases `parseVenue` never assigns; 0 `UNKNOWN_FIELD` across all 8453 neighbors so the recovery-gap
question is answered no; the 22 trim-equivalent cases with 2 emitting `TYPO_NORMALIZED`; the
non-colliding anchor and 30s timeout; and for the walker, delivered 2026-07-06 by `c6bd73001` with
the §2.6 asked-for/shipped mapping). Original bodies are preserved beneath.

### 2.3 Verify

```
pnpm exec vitest run tests/docs/      # green
```

**Commit:** `docs(backlog): archive the venue typo-generator and known-sections-walker entries`

---

## Task 3 — correct the two stale docstrings

**Files:** `lib/parser/knownSections.ts` (`lib/parser/knownSections.ts:15`),
`tests/parser/_metaKnownSectionsRegistry.test.ts` (`tests/parser/_metaKnownSectionsRegistry.test.ts:9`).

**Implements:** spec §5.1, §5.2. Sequenced after Task 2 so the text can reference the archived
entry rather than an active one. **Comment-only: no executable line changes.**

### 3.1 Red first — the docstring-truth guard

A comment-only edit has no red state on its own (review round 3, BLOCKING), and invariant 1 is
non-negotiable. So Task 3 begins by adding the assertion that makes the stale wording fail, as a
new case appended to `tests/parser/_metaKnownSectionsWalker.test.ts`:

- Read the source of `lib/parser/knownSections.ts` and
  `tests/parser/_metaKnownSectionsRegistry.test.ts`.
- Assert neither contains any stale-absence claim. Pin the exact phrases present today —
  `no shared introspectable constant`, `does NOT walk`, `not cheaply achievable` — as a small
  named list, so the assertion names what it forbids rather than pattern-guessing.
- Assert both name `_metaKnownSectionsWalker` (the correct pointer), so the guard cannot be
  satisfied by deleting the paragraph and saying nothing.

This case MUST go RED on the unmodified tree — the three phrases are present in both files right
now — and green after §3.2. Capture the red output for the commit message.

**Admissibility.** This is a new guard, so it needs a probe of the corruption it prevents rather
than a hypothetical: both docstrings asserted the walker did not exist for the ~4 weeks after it
shipped on 2026-07-06, and that false claim is what scoped `BL-KNOWN-SECTIONS-WALKER` as open work
at the start of this branch. The corruption is measured, not imagined. The guard is deliberately
narrow — two named files, one phrase list, one required pointer — and carries no allowlist, so it
cannot become the drift-prone parallel artifact this project distrusts.

### 3.2 What is false today

Both assert the parsers have "no shared introspectable constant," that the walker does not exist,
and that real enforcement "is filed as BL-KNOWN-SECTIONS-WALKER in BACKLOG.md." All three clauses
are false: `lib/parser/blocks/_sectionHeaderMatch.ts:31` is the shared factory with 8 importers
under `lib/parser/blocks/` plus `lib/parser/index.ts`, the parsers export `SECTION_HEADER_TOKENS`, and
`tests/parser/_metaKnownSectionsWalker.test.ts:133` reads the directory.

### 3.3 Replacement text must state

- The walker is `tests/parser/_metaKnownSectionsWalker.test.ts`, the **primary** drift guard:
  filesystem-walked, fails-by-default for a new `blocks/*.ts`, exact-subset ⊆ registry.
- The registry pin is the **secondary** guard and why it is not redundant (spec §5.2): the walker's
  subset check catches a registry deletion only while some parser still exports the token; a single
  edit removing a header from **both** `KNOWN_SECTION_HEADERS` and the owning parser's
  `SECTION_HEADER_TOKENS` leaves the walker green, and `REQUIRED_HEADERS`
  (`tests/parser/_metaKnownSectionsRegistry.test.ts:35`) is what fails then.
- Neither may describe `BL-KNOWN-SECTIONS-WALKER` as open work. A provenance reference to the
  archived id stays valid under `tests/docs/_metaLedgerReferentialIntegrity.test.ts:48`, which
  resolves citations against the archive ledgers too.

### 3.4 Verify

```
pnpm exec vitest run tests/parser/_metaKnownSectionsWalker.test.ts tests/parser/_metaKnownSectionsRegistry.test.ts   # 35 passed
pnpm exec vitest run tests/docs/
```

**Commit:** `test(parser): guard the known-sections docstrings against stale-absence claims, and correct them`

---

## Task 4 — full verification and close-out

No code changes.

```
pnpm exec vitest run tests/parser/
pnpm exec vitest run tests/docs/
pnpm spec:lint docs/superpowers/specs/parser/2026-08-02-parser-determinism-pair.md   # 0 hard
pnpm spec:lint docs/superpowers/plans/parser/2026-08-02-parser-determinism-pair.md   # 0 hard
pnpm lint && pnpm typecheck
```

Then whole-diff Codex adversarial review (fresh-eyes, REVIEWER ONLY) to APPROVE, push, real CI
green, `gh pr merge --merge`, fast-forward local `main` to `0  0`.

---

## 12. Close-out

impeccable-gate: N/A — no UI surface

The diff touches `tests/parser/blocks/venue.test.ts`,
`tests/docs/_metaDeferralLedgerGraduation.test.ts`, `lib/parser/knownSections.ts` (comment only),
`tests/parser/_metaKnownSectionsRegistry.test.ts` (comment only), `BACKLOG.md`,
`BACKLOG-archive.md`, and the spec/plan documents. No file under `app/` (excluding `app/api/**`),
`components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md` is touched, so the
invariant-8 impeccable critique/audit pair does not apply.

Findings and dispositions from the spec reviews, the plan review, and the whole-diff review are
recorded in the PR body.
