# Parser determinism pair — venue typo-generator coverage + known-sections-walker ledger truth

**Date:** 2026-08-02
**Branch:** `test/parser-determinism-pair`
**Backlog entries:** `BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE`, `BL-KNOWN-SECTIONS-WALKER`
**Status:** spec

---

## 1. Summary

Two backlog entries were paired as "parser determinism." Investigation shows each one's
recorded diagnosis is wrong in a different direction, and the corrected work is smaller and
sharper than either entry describes:

1. **`BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE`** — the entry says the generator "constructs
   single-edit typos, so the input set varies per run." It does not. The generator has no
   randomness of any kind. The real defect is that the test **samples** 4 aliases × 6 typos out
   of 8453 available cases, and the sample window is the first-N of a list whose order comes from
   `FIELD_ALIASES` object-insertion order — so an unrelated edit to `lib/parser/aliases.ts`
   silently changes *which* cases run. Today the window covers only the four contact-info aliases
   and never exercises `venue name`, `venue address`, `loading dock`, or `google link` at all.
   **Fix: enumerate exhaustively, assert positively, pin an explicit timeout.**

2. **`BL-KNOWN-SECTIONS-WALKER`** — the entry asks for "real auto-drift enforcement … not cheaply
   achievable today." It shipped on 2026-07-06 and is green on `main`. The entry is stale, and two
   source files still carry docstrings asserting the walker does not exist. **Fix: archive the
   entry, correct the two docstrings.** No new guard.

There is **no parser behavior change** in this work. Both halves are test/ledger truth.

---

## 2. Evidence (probes)

Per the AGENTS.md finding-admissibility contract, every behavioral claim below is settled by a
probe run against this branch's tree (`origin/main` @ `09b6c2178`), not by reading.

### 2.1 The generator has no randomness

`tests/parser/_typoGenerator.ts:6-17` (`singleEditNeighbors`) and `:24-39` (`unambiguousTypos`)
are pure functions over `Set` insertion order and `damerauLevenshtein`. A repo-wide scan found no
RNG, no `process.env` read, and no module-level mutable state anywhere under `lib/parser/`:

```
grep -rn "process\.env" lib/parser          → (no matches)
grep -rn "^let \|globalThis" lib/parser     → (no matches)
```

`REVERSE_MAP` (`lib/parser/aliases.ts:153-157`) is built once at module load from
`FIELD_ALIASES` and is never mutated. `inScopeAliases` (`:187-191`) is a pure filter over it.
Vitest also isolates modules per test file by default, so cross-file pollution is not available as
a mechanism either. **The "varies per run" diagnosis is disproven.**

### 2.2 There is no `FIELD_LABEL_AUTOCORRECTED` recovery gap

Exhaustive probe over **every** venue alias of length ≥5 and **every** unambiguous single-edit
neighbor of each (vocabulary = every `REVERSE_MAP` key, uppercased — the same vocabulary the
existing test passes):

```
VENUE ALIASES (11): hotel contact info, hotal contact info, venue contact info, in house av,
                    hotel reservations, venue name, venue address, hotel address,
                    loading dock, google link, venue notes
TOTAL=8453  unknownField=0  noAutocorrect=22  multiAutocorrect=0  elapsedMs=3581
```

- **0 of 8453** produce `UNKNOWN_FIELD`. The backlog's open question — "decide whether the failing
  edit is a genuine gap in `FIELD_LABEL_AUTOCORRECTED` recovery" — is answered: **no gap exists.**
- **22 of 8453** produce no `FIELD_LABEL_AUTOCORRECTED`. All 22 are exactly the leading-space and
  trailing-space insertions (2 per alias × 11 aliases). `ALPHA`
  (`tests/parser/_typoGenerator.ts:3`) includes a literal space, and `resolveAliasScoped`
  lowercases and `.trim()`s its input (`lib/parser/aliases.ts:204`), so `" VENUE NAME"` resolves
  **exactly**, correctly, and by design emits no autocorrect warning. These are not typos and are
  handled as their own case (§4.2), not as an exception to the main assertion.
- **0 of 8453** produce more than one `FIELD_LABEL_AUTOCORRECTED`.

Interior whitespace edits (`VENUE  NAME`) are *not* in the 22 — `resolveAliasScoped` trims but does
not collapse interior runs, so those go through the fuzzy gate and do warn. That is what makes
`n.trim() === member` (§4.2) the exact and complete partition.

### 2.3 The original sighting does not reproduce

`tests/parser/blocks/venue.test.ts` is green on this tree (56/56, 2.49s), and the exhaustive
enumeration that supersets its sampled cases is green too. The sighting was recorded on a box at
load 34+ with a sibling vitest session running. This spec does not claim to explain that specific
run; it makes any future failure reproducible by construction, which is what the entry asked for
("make the case deterministic or make the recovery cover the edit").

### 2.4 The known-sections walker is shipped and green

`tests/parser/_metaKnownSectionsWalker.test.ts` exists (323 lines), landed 2026-07-06
(`c6bd73001 test(parser): known-sections source walker meta-test (fails-by-default)`), and is
green together with the registry pin:

```
pnpm exec vitest run tests/parser/_metaKnownSectionsWalker.test.ts \
                     tests/parser/_metaKnownSectionsRegistry.test.ts
→ Test Files 2 passed (2) · Tests 35 passed (35)
```

Its spec is `docs/superpowers/specs/parser/2026-07-06-known-sections-walker.md`; its plan is
`docs/superpowers/plans/parser/2026-07-06-known-sections-walker.md`. It delivers precisely what the
backlog entry asked for:

| `BL-KNOWN-SECTIONS-WALKER` asked for | Shipped as |
| --- | --- |
| "route ALL section-header detection through a single shared, introspectable constant/helper (e.g. a per-parser exported `SECTION_HEADERS` const)" | per-file `SECTION_HEADER_TOKENS` exports + the shared factory `lib/parser/blocks/_sectionHeaderMatch.ts` (9 importers) |
| "have the meta-test import each parser's constant and assert it ⊆ `KNOWN_SECTION_HEADERS`" | walker step 3, exact-subset (`_metaKnownSectionsWalker.test.ts:167-172`) |
| "Add a proof test that an unregistered header fails" | the non-vacuity proof describe-block (`:271-323`), 6 cases incl. negative controls |
| (implied) new parser must not pass silently | filesystem-walked `readdirSync(BLOCKS_DIR)` (`:133-136`) — a new `blocks/*.ts` fails unless it exports tokens or is allowlisted |

### 2.5 A BL-citation freshness guard is not viable, and is not in scope

The obvious follow-on — "fail CI when source cites a BL- id that has been archived" — was measured
before being proposed, and the measurement kills it. Of 113 distinct `BL-` ids cited from
`lib/`, `tests/`, `scripts/`, `app/` (excluding the ledger-guard files under `tests/docs/`),
**70 already resolve archive-only**, and essentially all are legitimate historical provenance
("fixed under BL-X"), not stale open-work claims. Such a guard would ship as a 70-row allowlist —
the same hand-maintained drift-prone artifact `BL-KNOWN-SECTIONS-WALKER` itself declined to build.
Per the admissibility contract, a guard needs a probe demonstrating the corruption it prevents; this
probe demonstrates the opposite. **Explicitly out of scope. Do not relitigate.**

The existing guards are also not the gap: `tests/docs/_metaLedgerReferentialIntegrity.test.ts`
checks that a cited id resolves to *some* ledger (archive counts, so the citations stay valid after
archival), and `tests/docs/_metaDeferralLedgerGraduation.test.ts` checks ledger-internal
consistency (no id both active and archived; no terminal status on an active entry). Neither reads
prose in `lib/`, and neither should.

---

## 3. Scope

**In scope**

- W1. Rewrite the venue typo-generator case to exhaustive enumeration with positive assertions and
  an explicit timeout (§4).
- W2. Archive `BL-KNOWN-SECTIONS-WALKER` and correct the two stale docstrings (§5).
- W3. Archive `BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE`, recording the corrected diagnosis and
  the "no recovery gap" finding (§5.3).

**Out of scope (each with a reason, so review does not re-derive them)**

- Any change to `lib/parser/**`. Probe §2.2 shows nothing to fix. A test-only change is the whole
  of the venue work.
- A BL-citation freshness guard — §2.5, measured and refused.
- Reworking the other four `unambiguousTypos` consumers. Class-sweep (§4.4) shows venue is the only
  sampled one; the rest already enumerate fully.
- Deleting `tests/parser/_metaKnownSectionsRegistry.test.ts`. It retains real, non-redundant value
  (§5.2) and keeping it is cheaper than proving the walker subsumes it.
- Any change to the walker's declared accepted residual (`_metaKnownSectionsWalker.test.ts:16-23`).
  It is ratified and explicitly marked do-not-relitigate.

---

## 4. W1 — exhaustive venue typo enumeration

Replaces `tests/parser/blocks/venue.test.ts:311-332` (the single `it(...)` named
`generator: single-edit typos of venue field aliases (≥5 chars) recover`).

### 4.1 What is wrong today

```ts
for (const alias of venueAliases.slice(0, 4)) {        // :315
  for (const typo of unambiguousTypos(...).slice(0, 6)) {   // :321
```

Three separate defects, all fixed by the same change:

- **Order-coupled coverage.** `venueAliases` comes from `inScopeAliases("venue.")`, whose order is
  `Object.entries(FIELD_ALIASES)` insertion order (`lib/parser/aliases.ts:153-157, 187-191`).
  Inserting or reordering a venue alias in `FIELD_ALIASES` silently changes which 24 of 8453 cases
  run. That is the only real "varies" in the entry, and it varies per *edit*, not per *run*.
- **Coverage hole.** The current window is `hotel contact info`, `hotal contact info`,
  `venue contact info`, `in house av` — four contact-info aliases. The four field-bearing aliases
  the block actually exists to parse (`venue name`, `venue address`, `loading dock`, `google link`)
  are never reached.
- **Absence-only assertion.** The case asserts only that `UNKNOWN_FIELD` is absent. A parser that
  silently dropped the row, assigning nothing and warning nothing, would pass.

### 4.2 Required behavior

Enumerate **every** alias in `inScopeAliases("venue.")` with `length >= 5`, and for each, **every**
member of `unambiguousTypos(alias.toUpperCase(), ALL, { minLen: 5 })`, where `ALL` is every
`REVERSE_MAP` key uppercased (unchanged from today — that is what makes a generated neighbor which
collides with another block's exact alias get dropped). No `.slice`.

Partition each generated neighbor on `typo.trim() === alias.toUpperCase()`:

- **Trim-equivalent neighbors** (the 22 leading/trailing-space insertions). Expected: the value
  lands in the alias's own venue field, **zero** warnings of any code — no `UNKNOWN_FIELD`, no
  `FIELD_LABEL_AUTOCORRECTED`. This is exact resolution after `.trim()`, not a correction.
- **Every other neighbor** (8431 cases). Expected: **zero** `UNKNOWN_FIELD` **and exactly one**
  `FIELD_LABEL_AUTOCORRECTED`, whose `severity` is `"warn"` and whose `blockRef` matches
  `{ kind: "venue" }` — the same shape the two hand-written cases at `:263-267` and `:284-288`
  already assert.

The positive half is what makes the case non-tautological: it can no longer pass by the parser
doing nothing.

Failure messages must name both the alias and the typo (today's message at `:328` already does;
keep that shape) so a red run is actionable without re-deriving the input.

### 4.3 Guards against the defect returning

Two assertions, both derived from live data rather than hardcoded, so they fail on a real
regression and not on an unrelated edit:

- **Coverage floor.** The enumerated alias set MUST contain `venue name`, `venue address`,
  `loading dock`, and `google link`. These are the field-bearing aliases the old window missed;
  if a future `FIELD_ALIASES` edit removes or renames one, coverage silently shrinks and this
  fails loudly. (Names, not a count — a count assertion would pass if one alias were swapped for
  another.)
- **Non-vacuity.** Every enumerated alias MUST contribute at least one generated case, and the
  total case count MUST be > 0. This catches a `_typoGenerator.ts` regression that returns `[]`
  and turns the whole loop into a no-op — the classic way an exhaustive test becomes vacuous.

### 4.4 Class-sweep (AGENTS.md: sweep the shape, not the instance)

Every consumer of the typo generator, checked before fixing the named one:

| Consumer | Shape | Action |
| --- | --- | --- |
| `tests/parser/blocks/venue.test.ts:315,321` | `.slice(0,4)` / `.slice(0,6)` over a **derived** alias list | **FIX** (this spec) |
| `tests/parser/blocks/event.test.ts:384` | full enumeration over pinned `EVENT_LABEL_VOCAB` | none |
| `tests/parser/blocks/transport.test.ts:540` | full enumeration over pinned `TRANSPORT_SCHEDULE_VOCAB` | none |
| `tests/parser/blocks/rooms.test.ts:358` | full enumeration over pinned `V4_BARE_LABEL_VOCAB` | none |
| `tests/parser/sectionHeaderNormalize.test.ts:33` | full enumeration over pinned `VOCAB` | none |
| `tests/parser/_typoGenerator.test.ts` | unit tests of the generator itself | none |

Venue is the only sampled instance. The other four enumerate exhaustively over a **pinned local
vocabulary const**; venue's derived list is the better source (it cannot drift from
`FIELD_ALIASES`), so the fix keeps the derivation and removes the sampling rather than converting
venue to a pinned const.

### 4.5 Runtime and the timeout (mandatory, not optional)

Measured: the exhaustive enumeration is **3.58s** for 8453 cases; the whole of
`venue.test.ts` is **2.49s / 56 tests** today. No `testTimeout` is set in `vitest.config.ts`,
`vitest.projects.ts`, `vitest.sequencer.ts`, or `package.json`, so vitest's **default 5000 ms**
applies.

A 3.58s test under a 5s default is precisely the shape that fails on a loaded box — the condition
the original sighting was recorded under. Shipping the exhaustive loop without raising the timeout
would therefore *manufacture* the flake this work exists to remove. The case MUST carry an explicit
per-test timeout of **30000 ms**, passed as vitest's third `it()` argument, with an inline comment
citing the measured 3.58s so a future reader does not "tidy" it away.

Scoping the timeout to this one case (not a global `testTimeout` bump) keeps every other test in the
repo held to the 5s default.

---

## 5. W2/W3 — ledger and docstring truth

### 5.1 Stale docstrings to correct

Both currently assert the walker does not exist. Both are wrong as of 2026-07-06.

- `lib/parser/knownSections.ts:12-20` — "It does NOT walk lib/parser/blocks/\*.ts (the parsers match
  headers via heterogeneous inline literals + regexes with no shared introspectable constant) …
  Real auto-drift enforcement (a source walker) is filed as BL-KNOWN-SECTIONS-WALKER in
  BACKLOG.md." Every clause is false today: `_sectionHeaderMatch.ts` is the shared factory, the
  parsers export `SECTION_HEADER_TOKENS`, and the walker reads the directory.
- `tests/parser/_metaKnownSectionsRegistry.test.ts:9-17` — same claim, plus "Real auto-drift
  enforcement (a walker over the block-parser sources) is filed as BL-KNOWN-SECTIONS-WALKER; it is
  not cheaply achievable today."

Replacement text must state: the walker is `tests/parser/_metaKnownSectionsWalker.test.ts`, it is
the primary drift guard, and this registry pin is the secondary one — with §5.2's reason for
keeping it. Neither replacement may cite `BL-KNOWN-SECTIONS-WALKER` as open work; a
provenance-style reference to the archived id is fine and stays valid under the referential-
integrity guard (which accepts archive resolution).

### 5.2 Why `_metaKnownSectionsRegistry.test.ts` survives

Not redundant. The walker's step-3 subset check catches a registry deletion only for a token some
parser still exports; if a header were removed from `KNOWN_SECTION_HEADERS` **and** from the owning
parser's `SECTION_HEADER_TOKENS` in the same edit, the walker stays green. `REQUIRED_HEADERS`
(`:35-59`) is an independent hand-pin that fails in exactly that case. Its docstring must say this
instead of describing the walker as absent.

### 5.3 Ledger moves

Both entries graduate from `BACKLOG.md` to `BACKLOG-archive.md`, using the archive's established
heading form (`## BL-X — RESOLVED (YYYY-MM-DD, \`branch\`)`, e.g.
`BACKLOG-archive.md:11`), each followed by the original entry body so the history is not lost.
The archived text must record the corrected findings, not the original wrong diagnoses:

- `BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE`: no RNG existed; the defect was order-coupled
  sampling; exhaustive enumeration of 8453 cases shows **zero** recovery gaps; the case now carries
  an explicit 30s timeout.
- `BL-KNOWN-SECTIONS-WALKER`: already delivered 2026-07-06 by
  `tests/parser/_metaKnownSectionsWalker.test.ts`; this branch only retired the stale entry and the
  two docstrings that contradicted it.

`tests/docs/_metaDeferralLedgerGraduation.test.ts` enforces that a graduated id is archive-only and
that no active entry carries a terminal status, so the removal from `BACKLOG.md` must be complete
(no stub row left behind).

---

## 6. Verification

| Check | Command | Expected |
| --- | --- | --- |
| Venue block, exhaustive | `pnpm exec vitest run tests/parser/blocks/venue.test.ts` | green; case count 8453 across 11 aliases |
| Repeat-run determinism | the same command ×5 | byte-identical pass counts every run |
| Known-sections guards | `pnpm exec vitest run tests/parser/_metaKnownSectionsWalker.test.ts tests/parser/_metaKnownSectionsRegistry.test.ts` | 35 passed |
| Ledger guards | `pnpm exec vitest run tests/docs/` | green (graduation + referential integrity accept the archive move) |
| Whole parser suite | `pnpm exec vitest run tests/parser/` | green |

## 7. Guard-conditions and edge cases

- **`inScopeAliases("venue.")` returns fewer than 4 field-bearing aliases** → §4.3 coverage-floor
  assertion fails by name. Intended.
- **`unambiguousTypos` returns `[]` for some alias** → §4.3 non-vacuity assertion fails. Intended.
- **A new venue alias is added to `FIELD_ALIASES`** → it is enumerated automatically; case count
  rises; no test edit needed. This is the point of keeping the derivation.
- **A new venue alias shorter than 5 chars** → excluded by the existing `length >= 5` filter, which
  mirrors the parser's own `minLen: 5` gate (`lib/parser/aliases.ts:213`). Unchanged.
- **A generated neighbor equal to another block's exact alias** → already dropped inside
  `unambiguousTypos` by the `vocab.includes(n)` check (`_typoGenerator.ts:32`). Unchanged; this is
  why `ALL` and not the venue-only list is passed as vocabulary.

## 8. Non-goals restated for review

No parser behavior changes. No new guard surface. No new mutation family, therefore no escaping-
mutant demonstration is owed. No UI surface — `impeccable-gate: N/A — no UI surface` is carried in
the plan.
