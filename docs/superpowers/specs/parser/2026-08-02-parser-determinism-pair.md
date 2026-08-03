# Parser determinism pair — venue typo-generator coverage + known-sections-walker ledger truth

**Date:** 2026-08-02
**Branch:** `test/parser-determinism-pair`
**Backlog entries:** `BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE`, `BL-KNOWN-SECTIONS-WALKER`
**Status:** spec, revised after cross-model review rounds 1-6 (7 + 2 + 5 + 2 + 3 + 3 findings, all landed)

---

## 1. Summary

Two backlog entries were paired as "parser determinism." Each entry's recorded diagnosis is wrong
in a different direction, and the corrected work is smaller and sharper than either describes:

1. **`BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE`** — the entry says the generator "constructs
   single-edit typos, so the input set varies per run." It does not. The generator has no
   randomness of any kind. The real defect is that the test **samples** 4 aliases x 6 typos out of
   8453 available cases, and the sample window is the first-N of a list ordered by `FIELD_ALIASES`
   object-insertion order, so an unrelated edit to `lib/parser/aliases.ts` silently changes *which*
   cases run. The window covers only aliases whose values `parseVenue` never assigns, so today the
   case exercises no venue output field at all. **Fix: enumerate exhaustively, assert value
   assignment and not merely warning shape, pin an explicit timeout.**

2. **`BL-KNOWN-SECTIONS-WALKER`** — the entry asks for "real auto-drift enforcement … not cheaply
   achievable today." It shipped 2026-07-06 and is green on `main`. The entry is stale, and two
   source files still carry docstrings asserting the walker does not exist. **Fix: archive the
   entry, correct the two docstrings, and add one narrow guard so the false claim cannot return**
   (§5.4). That guard is the only new test surface in this work.

No `lib/parser/**` behavior changes. The only `lib/` edit is a comment block (§5.1).

---

## 2. Evidence (probes)

Per the AGENTS.md finding-admissibility contract, every behavioral claim is settled by a probe run
against this branch (`origin/main` @ `09b6c2178`), not by reading.

### 2.1 The generator has no randomness

`singleEditNeighbors` and `unambiguousTypos` (`tests/parser/_typoGenerator.ts:6`,
`tests/parser/_typoGenerator.ts:24`) are pure over `Set` insertion order and `damerauLevenshtein`.
A repo-wide scan found no RNG, no `process.env` read, and no module-level mutable state under
`lib/parser/`:

```
grep -rn "process\.env" lib/parser          -> (no matches)
grep -rn "^let \|globalThis" lib/parser     -> (no matches)
```

`REVERSE_MAP` (`lib/parser/aliases.ts:153`) is built once at module load and never mutated;
`inScopeAliases` (`lib/parser/aliases.ts:187`) is a pure filter over it. Vitest isolates modules
per test file by default, so cross-file pollution is not available as a mechanism either.

Cross-model review confirmed this independently: five separate processes each produced 8453 cases
with the identical SHA-256 `54fdb2f8630680cb5d2d54dc5acd8af2a2a8f52d512a7c09210679ce768418de`.
**The "varies per run" diagnosis is disproven.**

### 2.2 Alias assignability — the fact the original test design missed

`parseVenue` assigns exactly five canonical keys (`lib/parser/blocks/venue.ts:254`,
`lib/parser/blocks/venue.ts:265`, `lib/parser/blocks/venue.ts:276`,
`lib/parser/blocks/venue.ts:287`, `lib/parser/blocks/venue.ts:298`, with the sub-row mirrors at
`lib/parser/blocks/venue.ts:182` and `lib/parser/blocks/venue.ts:225`). Every venue alias of length
≥5, its canonical, and whether `parseVenue` has an output field for it:

| Alias | Canonical | `parseVenue` field | Neighbors |
| --- | --- | --- | --- |
| `hotel contact info` | `venue.contact_info` | none | 969 |
| `hotal contact info` | `venue.contact_info` | none | 969 |
| `venue contact info` | `venue.contact_info` | none | 998 |
| `in house av` | `venue.in_house_av` | none | 593 |
| `hotel reservations` | `venue.hotel_reservations` | none | 998 |
| `venue name` | `venue.name` | `name` | 566 |
| `venue address` | `venue.address` | `address` | 724 |
| `hotel address` | `venue.address` | `address` | 724 |
| `loading dock` | `venue.loading_dock` | `loadingDock` | 674 |
| `google link` | `venue.google_link` | `googleLink` | 618 |
| `venue notes` | `venue.notes` | `notes` | 620 |

**6 assignable aliases / 3926 neighbors; 5 non-assignable / 4527 neighbors; 8453 total.**

The three non-assignable canonicals are **not** a data-loss gap and are **not** in scope here.
They are owned by sibling parsers: `contacts.ts` parses "Venue Contact Info" / "Hotel Contact
Info" / "Hotal Contact Info" and the IN HOUSE AV label (`lib/parser/blocks/contacts.ts:7`,
`lib/parser/blocks/contacts.ts:80`), and `hotels.ts` owns HOTEL RESERVATIONS
(`lib/parser/blocks/hotels.ts:52`). Their venue-scoped aliases exist so the row resolves rather
than firing `UNKNOWN_FIELD`, and so v2 version detection can key on them
(`lib/parser/schema.ts:49`). `parseVenue` correctly ignores their values.

The old sample window is the first four rows of that table — all non-assignable. **Not one of the
24 sampled cases could ever have proved a value reached a venue field.**

### 2.3 First-wins assignment makes the anchor row load-bearing

Every assignment site is guarded first-wins (`&& name === null` etc.,
`lib/parser/blocks/venue.ts:254`). The current case seeds `| VENUE NAME | Four Seasons |` as the
anchor (`tests/parser/blocks/venue.test.ts:322`), so any typo resolving to `venue.name` is
**shadowed** — the field is already set and the typo's value is discarded while every warning-shape
assertion still passes.

The anchor cannot simply be dropped: a lone typo row does not open the block.

```
LONE "VENUE ADRESS": parseVenue -> null,  warns=FIELD_LABEL_AUTOCORRECTED
LONE "LOADIN DOCK":  parseVenue -> null,  warns=FIELD_LABEL_AUTOCORRECTED
```

The anchor must therefore be present but **must not share the canonical under test** (§4.2).

### 2.4 Exhaustive probe with a non-colliding anchor

All 8453 neighbors, per alias, anchor chosen to avoid the canonical under test:

```
alias                [canonical]              n    trimEq trimEqWarned unknown noAuto multiAuto notAssigned
hotel contact info   [venue.contact_info]    969      2         0         0      0       0          n/a
hotal contact info   [venue.contact_info]    969      2         2         0      0       0          n/a
venue contact info   [venue.contact_info]    998      2         0         0      0       0          n/a
in house av          [venue.in_house_av]     593      2         0         0      0       0          n/a
hotel reservations   [venue.hotel_reservations] 998   2         0         0      0       0          n/a
venue name           [venue.name]            566      2         0         0      0       0           0
venue address        [venue.address]         724      2         0         0      0       0           0
hotel address        [venue.address]         724      2         0         0      0       0           0
loading dock         [venue.loading_dock]    674      2         0         0      0       0           0
google link          [venue.google_link]     618      2         0         0      0       0           0
venue notes          [venue.notes]           620      2         0         0      0       0           0
```

- **0 of 8453** produce `UNKNOWN_FIELD`. The entry's open question — "is the failing edit a genuine
  gap in `FIELD_LABEL_AUTOCORRECTED` recovery?" — is answered: **no such gap exists.**
- **0 of 8431** non-trim neighbors produce zero or more-than-one `FIELD_LABEL_AUTOCORRECTED`;
  exactly one is emitted every time.
- **0 of 3926** assignable-alias neighbors fail to place the value in the resolved field, **once
  the anchor no longer shadows.** This is what makes the §4 assertion a recovery assertion rather
  than a warning-shape assertion.
- **22 of 8453** are trim-equivalent (leading/trailing space, 2 per alias). `ALPHA` includes a
  literal space (`tests/parser/_typoGenerator.ts:3`) and `resolveAliasScoped` trims its input
  (`lib/parser/aliases.ts:204`), so these resolve **exactly** and emit no autocorrect. **2 of the
  22 do warn** — `TYPO_NORMALIZED`, on the `hotal contact info` neighbors, because that alias is
  itself a registered typo alias (`lib/parser/aliases.ts:143`). The trim partition is therefore
  "no `UNKNOWN_FIELD`, no `FIELD_LABEL_AUTOCORRECTED`," with `TYPO_NORMALIZED` expected exactly
  when the alias is in `TYPO_ALIASES` (`lib/parser/aliases.ts:142`).

Interior-whitespace edits (`VENUE  NAME`) are not in the 22 — `resolveAliasScoped` trims but does
not collapse interior runs, so they go through the fuzzy gate and do warn. That is what makes
`typo.trim() === alias.toUpperCase()` the exact and complete partition.

### 2.5 The original sighting does not reproduce

`tests/parser/blocks/venue.test.ts` is green on this tree (56/56, 2.49s), and the exhaustive
enumeration that supersets its sampled cases is green too. The sighting was recorded on a box at
load 34-plus with a sibling vitest session running. This spec does not claim to explain that run;
it makes any future failure reproducible by construction, which is what the entry asked for.

### 2.6 The known-sections walker is shipped and green

`tests/parser/_metaKnownSectionsWalker.test.ts` exists (323 lines), landed 2026-07-06
(`c6bd73001 test(parser): known-sections source walker meta-test (fails-by-default)`), and is
green with the registry pin:

```
pnpm exec vitest run tests/parser/_metaKnownSectionsWalker.test.ts \
                     tests/parser/_metaKnownSectionsRegistry.test.ts
-> Test Files 2 passed (2) - Tests 35 passed (35)
```

Its spec is `docs/superpowers/specs/parser/2026-07-06-known-sections-walker.md`. It delivers what
the backlog entry asked for:

| The entry asked for | Shipped as |
| --- | --- |
| "route ALL section-header detection through a single shared, introspectable constant/helper" | per-file `SECTION_HEADER_TOKENS` exports plus the shared factory `lib/parser/blocks/_sectionHeaderMatch.ts` (8 importers under `lib/parser/blocks/`, plus `lib/parser/index.ts`) |
| "have the meta-test import each parser's constant and assert it ⊆ `KNOWN_SECTION_HEADERS`" | walker step 3, exact-subset, `tests/parser/_metaKnownSectionsWalker.test.ts:167` |
| "Add a proof test that an unregistered header fails" | non-vacuity proof block, `tests/parser/_metaKnownSectionsWalker.test.ts:271`, 6 cases including negative controls |
| (implied) a new parser must not pass silently | filesystem walk at `tests/parser/_metaKnownSectionsWalker.test.ts:133` — a new `blocks/*.ts` fails unless it exports tokens or is allowlisted |

### 2.7 A BL-citation freshness guard is measured and refused

Of 113 distinct `BL-` ids cited from `lib/`, `tests/`, `scripts/`, `app/` (excluding the ledger
guards under `tests/docs/`), **70 already resolve archive-only**, essentially all as legitimate
historical provenance ("fixed under BL-X"), not stale open-work claims. Such a guard ships as a
70-row allowlist — the same hand-maintained drift-prone artifact `BL-KNOWN-SECTIONS-WALKER` itself
declined to build. The admissibility contract requires a probe demonstrating the corruption a
guard prevents; this probe demonstrates the opposite.

The existing guards are also not the gap: `tests/docs/_metaLedgerReferentialIntegrity.test.ts`
checks that a cited id resolves to *some* ledger (archive counts, so citations stay valid after
archival), and `tests/docs/_metaDeferralLedgerGraduation.test.ts` checks ledger-internal
consistency. Neither reads prose in `lib/`, and neither should.

---

## 3. Scope

**In scope**

- W1. Rewrite the venue typo-generator case: exhaustive enumeration, non-colliding anchor,
  value-assignment assertions, explicit timeout (§4).
- W2. Archive both backlog entries, including their `BACKLOG_GRADUATED` registry rows (§5.3).
- W3. Correct the two stale docstrings (§5.1) and add the narrow guard that keeps them correct
  (§5.4).

**Out of scope**

- Any change to `lib/parser/**` **other than the comment block in `lib/parser/knownSections.ts`
  (§5.1)**. Probe §2.4 shows no parser defect to fix; the docstring edit changes no executable
  line.
- A BL-citation freshness guard — §2.7, measured and refused.
- Giving `venue.contact_info` / `venue.in_house_av` / `venue.hotel_reservations` output fields on
  `parseVenue`. §2.2 establishes sibling parsers own them.
- Reworking the other four `unambiguousTypos` consumers — §4.5 class-sweep shows venue is the only
  sampled one.
- Deleting `tests/parser/_metaKnownSectionsRegistry.test.ts` — §5.2 gives its non-redundant value.

---

## 4. W1 — exhaustive venue typo enumeration

Replaces the single `it(...)` at `tests/parser/blocks/venue.test.ts:311`.

### 4.1 What is wrong today

```ts
for (const alias of venueAliases.slice(0, 4)) {              // :315
  for (const typo of unambiguousTypos(...).slice(0, 6)) {    // :321
```

Four defects, all fixed by one rewrite:

- **Order-coupled coverage.** `venueAliases` order is `Object.entries(FIELD_ALIASES)` insertion
  order (`lib/parser/aliases.ts:153`, `lib/parser/aliases.ts:187`). Inserting or reordering a venue
  alias silently changes which 24 of 8453 cases run. That is the only real "varies" in the entry,
  and it varies per *edit*, not per *run*.
- **Coverage hole with no field reach.** The window is the five non-assignable aliases' prefix
  (§2.2); no sampled case can prove a value reached a venue field.
- **Absence-only assertion.** The case asserts only that `UNKNOWN_FIELD` is absent. A parser that
  silently dropped the row would pass.
- **Shadowing anchor.** The seeded `| VENUE NAME | Four Seasons |` makes every `venue.name` typo
  unassignable by first-wins (§2.3), so even a value assertion would be vacuous for that alias.

### 4.2 Required behavior

Enumerate **every** alias in `inScopeAliases("venue.")` with `length >= 5`, and for each, **every**
member of `unambiguousTypos(alias.toUpperCase(), ALL, { minLen: 5 })` where `ALL = inScopeAliases("")`
uppercased — unchanged from `tests/parser/blocks/venue.test.ts:313`, because that full vocabulary
is what drops a neighbor colliding with another block's exact alias
(`tests/parser/_typoGenerator.ts:32`). **No `.slice` anywhere.**

**Anchor.** Per case, seed one anchor row whose canonical differs from the alias under test —
`| VENUE NAME | Four Seasons |` normally, and a different venue row (e.g.
`| LOADING DOCK | dock ref |`) when the alias under test resolves to `venue.name`. Derive the
choice from `resolveAlias(alias)`; never hardcode a per-alias table.

**Assertions, per partition:**

| Partition | Count | Assert |
| --- | --- | --- |
| Trim-equivalent (`typo.trim() === alias.toUpperCase()`) | 22 | no `UNKNOWN_FIELD`; no `FIELD_LABEL_AUTOCORRECTED`; `TYPO_NORMALIZED` present **iff** the alias is in `TYPO_ALIASES` |
| Non-trim, **assignable** alias | 3914 | no `UNKNOWN_FIELD`; **exactly one** `FIELD_LABEL_AUTOCORRECTED` with `severity === "warn"` and `blockRef` matching `{ kind: "venue" }` |
| Non-trim, **non-assignable** alias | 4517 | no `UNKNOWN_FIELD`; exactly one `FIELD_LABEL_AUTOCORRECTED` of the same shape |

**One strict deep-equality assertion applies to EVERY case, in every partition.** Four consecutive
review rounds each found an escaping mutant against a weaker design — round 3 corrupted the anchor
field, round 4 exploited trim cases that had no routing assertion, round 5 corrupted a *third*
field with a non-sentinel marker, and round 6 showed that even an exact **populated**-field-set rule
("non-empty string values") stays green when a stray field is `null`, `""`, a non-string, or when a
required key is deleted outright. Each fix was another point check, and each left the next hole. The
design therefore stops describing which fields to inspect and compares the **entire returned
object** against a derived expectation:

> `parseVenue`'s return value must **deep-equal** an expected object built from the case's own
> inputs: `name` and `address` always present, the anchor field holding exactly the anchor value,
> the target field holding exactly the sentinel when the alias's canonical is assignable, and any
> remaining required field at its `""` default.

Deep equality is exhaustive in both directions — an extra key, a missing key, a `null`, an empty
string, a non-string, or a wrong value all fail — so there is no "field the assertion forgot." That
is what ends the sequence: the oracle is no longer a list of properties to check but the whole
value. It subsumes target routing, stray routing, anchor integrity, and collateral corruption of
any other field, and it closes review round-2 finding 1 (a mutant rerouting the three
non-assignable canonicals into `venue.address`, which corrupted 4517 cases while passing every
warning-shape assertion).

Measured over the full space, this holds with **0 mismatches in 8453 cases**, across exactly six
distinct expected objects:

```
4527x  {name:<anchor>, address:""}                             (the five non-assignable aliases)
1448x  {name:<anchor>, address:<sentinel>}                     (venue address + hotel address)
 566x  {name:<sentinel>, address:"", loadingDock:<anchor>}     (venue name, anchored on LOADING DOCK)
 674x  {name:<anchor>, address:"", loadingDock:<sentinel>}     (loading dock)
 620x  {name:<anchor>, address:"", notes:<sentinel>}           (venue notes)
 618x  {name:<anchor>, address:"", googleLink:<sentinel>}      (google link)
```

The typo row's value is a distinctive sentinel so the assertion reads routing, not coincidence.

The assignable/non-assignable split is **derived**, not hardcoded: map `resolveAlias(alias)` through
a canonical→output-field table that mirrors `parseVenue`'s assignment sites, and treat a canonical
absent from that table as non-assignable. A future `parseVenue` that starts assigning
`venue.contact_info` requires one table row, and until then the alias is honestly excluded from the
value assertion rather than silently unasserted.

Every failure message names both the alias and the typo, as `tests/parser/blocks/venue.test.ts:328`
does today.

**Timeout (mandatory, §4.4):** pass `30_000` as `it()`'s third argument, with an inline comment
recording the measured runtime and the absent global override. Do **not** raise the global
`testTimeout`.

### 4.3 Guard assertions (anti-tautology)

- **Coverage floor, derived not listed.** Assert that the enumerated set contains **every** alias
  whose canonical has a `parseVenue` output field — i.e. that the assignable partition is non-empty
  and covers all five assignable canonicals (`venue.name`, `venue.address`, `venue.loading_dock`,
  `venue.google_link`, `venue.notes`). Deriving from the canonical→field table rather than naming
  four aliases means dropping the **last** alias of any assignable canonical is caught — the review
  round-1 gap in an earlier draft of this spec. It does **not** catch dropping one alias of a
  multi-alias canonical; see the accepted limit below.
- **Per-alias volume floor.** Assert each alias contributes at least `alias.length * 10` generated
  cases. Derived from the alias, not hardcoded. Measured ratios of unambiguous-neighbours to alias
  length run **53.8 to 56.6** across all eleven aliases, so the floor has ~5x headroom against a
  legitimate vocabulary change while redding any re-introduction of sampling: review round 2 showed
  a `unambiguousTypos(...).slice(0, 1)` mutant keeps every alias and canonical represented, passes a
  bare "≥1 case per alias" check, and silently drops 8442 of 8453 cases. A ratio of 0.09 fails this
  floor; so does the original `.slice(0, 6)`.
- **Non-vacuity.** Assert the total case count is > 0 and every alias contributes ≥1 case. Catches a
  `_typoGenerator.ts` regression returning `[]`. Subsumed by the volume floor for realistic
  regressions; kept because it produces the clearer failure message for a total collapse.

**Accepted limit of the coverage floor.** The floor is per-*canonical*, so deleting one alias of a
multi-alias canonical does not red it — `venue.address` has two aliases (`venue address`,
`hotel address`) and `venue.contact_info` has three. That case is guarded elsewhere and
deliberately not duplicated here: the `Hotel Address` alias is asserted by the corpus fixture case
at `tests/parser/blocks/venue.test.ts:105`, which reds on its deletion. Making the floor
alias-level would mean either naming aliases (the round-1 F5 defect) or pinning a count (a
hardcoded total that blocks legitimate additions).

No hardcoded expected totals. The counts in this document are measurements, never assertions, so a
legitimate new venue alias raises coverage without a test edit.

### 4.4 Runtime and the timeout

Measured: exhaustive enumeration is **3.58s** for 8453 cases (value assertions add no measurable
cost); the whole of `venue.test.ts` is **2.49s / 56 tests** today. No `testTimeout` is set in
`vitest.config.ts`, `vitest.projects.ts`, `vitest.sequencer.ts`, or `package.json`, so vitest's
default **5000 ms** applies.

A 3.58s test under a 5s default is exactly the shape that fails on a loaded box — the condition the
original sighting was recorded under. Shipping the exhaustive loop without raising the timeout would
*manufacture* the flake this work removes. Scoping the raise to this one case keeps every other test
on the 5s default.

### 4.5 Class-sweep (sweep the shape, not the instance)

| Consumer | Shape | Action |
| --- | --- | --- |
| `tests/parser/blocks/venue.test.ts:315` and `tests/parser/blocks/venue.test.ts:321` | `.slice` sampling over a **derived** alias list | **FIX** |
| `tests/parser/blocks/event.test.ts:384` | full enumeration over pinned `EVENT_LABEL_VOCAB` | none |
| `tests/parser/blocks/transport.test.ts:540` | full enumeration over pinned `TRANSPORT_SCHEDULE_VOCAB` | none |
| `tests/parser/blocks/rooms.test.ts:358` | full enumeration over pinned `V4_BARE_LABEL_VOCAB` | none |
| `tests/parser/sectionHeaderNormalize.test.ts:33` | full enumeration over pinned `VOCAB` | none |
| `tests/parser/_typoGenerator.test.ts:13` | unit tests of the generator itself | none |

Venue is the only sampled instance. The other four enumerate exhaustively over a **pinned local
vocabulary const**; venue's derived list is the better source (it cannot drift from
`FIELD_ALIASES`), so the fix keeps the derivation and removes the sampling.

### 4.6 Red state (invariant 1) for a test-only deliverable

The rewritten assertions pass against unmodified `main`, so the red state is established by
mutation rather than by production code that does not yet exist, and the chronology matters (review
round 6): mutations B–H exercise assertions that do not exist until the case is written, so they
cannot precede it. The order is:

1. **Defect proof, before any rewrite.** Apply Mutation A to the unmodified tree and run the
   **existing** case at `tests/parser/blocks/venue.test.ts:311`. It stays **GREEN**. That is the
   documented failure this work removes: a test that cannot fail when the parser does nothing.
2. **Write the case** (§4.2, §4.3) and confirm it is green on the clean tree.
3. **Mutation battery.** Run A–H against the new case; each must go red for its own stated reason.
   For a test-only deliverable this battery *is* the red state invariant 1 requires — each mutation
   is a state in which the assertion fails — and step 1 is the evidence the prior test had none.

All eight mutations are run, their output recorded in the task commit message, and none is
committed:

- **Mutation A — parser does nothing.** Make `parseVenue` return `null` immediately. The **new**
  case must go red, and the **old** case at `tests/parser/blocks/venue.test.ts:311` must stay
  **green**. That contrast is the proof the
  rewrite removed an absence-only assertion, and it is the finding an earlier draft could not
  demonstrate.
- **Mutation B — restore the shadowing anchor.** Use `| VENUE NAME | Four Seasons |` as the anchor
  for every alias. The `venue.name` value assertions must go red, proving the non-colliding anchor
  (§4.2) is load-bearing rather than cosmetic.
- **Mutation C — coverage shrink.** Delete the `venue.notes` alias list from `FIELD_ALIASES`
  (`lib/parser/aliases.ts:34`). The derived coverage floor (§4.3) must go red. `venue.notes` is
  chosen deliberately: it is the sole alias entry for its canonical, and no fixture case asserts
  the `notes` field, so the floor is the **only** thing that reds and the proof is unambiguous.
  (Review round 2 correctly refuted an earlier draft that used `"Hotel Address"`: `venue.address`
  keeps its second alias `venue address`, so the canonical stays represented and the floor does not
  red — see the accepted limit in §4.3.)
- **Mutation D — mis-routed correction.** Reroute the three non-assignable canonicals
  (`venue.contact_info`, `venue.in_house_av`, `venue.hotel_reservations`) to `venue.address` inside
  `parseVenue`. The non-assignable partition's no-stray-value assertion (§4.2) must go red on all
  4517 applicable cases. This is review round-2 finding 1 executed as a standing proof: without
  that clause the mutant passes every warning-shape assertion.
- **Mutation E — resampling.** Reintroduce `.slice(0, 1)` on the generator output. The per-alias
  volume floor (§4.3) must go red for every alias. Without the floor this mutant keeps all eleven
  aliases and all five canonicals and passes, while dropping 8442 of 8453 cases.
- **Mutation F — collateral anchor corruption.** After a correct fuzzy assignment, also overwrite
  the already-populated anchor field with a marker value. Measured against the A–E design in review
  round 3: **1444 corrupted outputs, 0 assertion failures, and all 56 current venue tests green.**
- **Mutation G — collateral corruption of a third field.** After a correct fuzzy `venue.address`
  assignment, also set `notes` to a marker that is neither the sentinel nor the anchor value.
  Measured against the A–F point-clause design in review round 5: **1444 corrupted outputs, 0
  assertion failures.**
- **Mutation H — type-valid stray field.** Four arms, each measured green in review round 6 against
  an exact **populated-field-set** rule because none is a non-empty string: set an unexpected
  optional field to `null`; to `""`; to a non-string value; and delete the required `address` key
  from an anchor-only result. All four must go red under deep equality (§4.2). F, G and H together
  are why the oracle is a whole-object comparison rather than any list of clauses.

---

## 5. W2/W3 — ledger and docstring truth

### 5.1 Stale docstrings to correct

Both assert the walker does not exist. Both are wrong as of 2026-07-06.

- `lib/parser/knownSections.ts:15` — "It does NOT walk lib/parser/blocks/\*.ts (the parsers match
  headers via heterogeneous inline literals + regexes with no shared introspectable constant) …
  Real auto-drift enforcement (a source walker) is filed as BL-KNOWN-SECTIONS-WALKER in
  BACKLOG.md." Every clause is false: `lib/parser/blocks/_sectionHeaderMatch.ts:31` is the shared
  factory, the parsers export `SECTION_HEADER_TOKENS`, and the walker reads the directory.
- `tests/parser/_metaKnownSectionsRegistry.test.ts:9` — the same claim, plus "it is not cheaply
  achievable today."

Replacement text must state that the walker is `tests/parser/_metaKnownSectionsWalker.test.ts` and
is the **primary** drift guard, and that this registry pin is the **secondary** one, with §5.2's
reason. Neither may describe `BL-KNOWN-SECTIONS-WALKER` as open work; a provenance reference to the
archived id is fine and stays valid under the referential-integrity guard, which resolves against
the archive ledgers too (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:48`).

These are comment-only edits. No executable line in `lib/parser/knownSections.ts` changes.

### 5.4 The docstring-truth guard (the one new test surface)

A comment-only edit has no red state, and invariant 1 is non-negotiable, so W3 opens by adding the
assertion that makes the stale wording fail — one case appended to
`tests/parser/_metaKnownSectionsWalker.test.ts`, not a new file:

- Neither `lib/parser/knownSections.ts` nor `tests/parser/_metaKnownSectionsRegistry.test.ts` may
  contain any phrase from a small named stale-absence list.
- Both must name `_metaKnownSectionsWalker`, so the guard cannot be satisfied by deleting the
  paragraph and saying nothing.

**Admissibility.** The corruption is measured, not hypothesised: both docstrings asserted the walker
did not exist for the ~4 weeks after it shipped on 2026-07-06, and that false claim is what scoped
`BL-KNOWN-SECTIONS-WALKER` as open work at the start of this branch. The guard is deliberately
narrow — two named files, one phrase list, one required pointer, no allowlist — so it cannot become
the drift-prone parallel artifact this project distrusts.

**Declared limit.** It is semantically circumventable: a *new* false paraphrase that also names
`_metaKnownSectionsWalker` would pass. It is a regression pin on the specific claim that was
actually wrong, not a prose classifier. Building the latter is the `_ledgerMdast` problem, which
took thirty review rounds; it is deliberately not attempted here.

### 5.2 Why `tests/parser/_metaKnownSectionsRegistry.test.ts` survives

Not redundant. The walker's exact-subset check catches a registry deletion only for a token some
parser still exports; if a header were removed from `KNOWN_SECTION_HEADERS` **and** from the owning
parser's `SECTION_HEADER_TOKENS` in one edit, the walker stays green. `REQUIRED_HEADERS`
(`tests/parser/_metaKnownSectionsRegistry.test.ts:35`) is the independent hand-pin that fails then.
Its docstring must say this instead of describing the walker as absent.

### 5.3 Ledger moves, and the registry row that makes them enforced

Both entries graduate from `BACKLOG.md` to `BACKLOG-archive.md` using the archive's established
heading form (`BACKLOG-archive.md:11`):

```
## BL-X — RESOLVED (2026-08-02, `test/parser-determinism-pair`)
```

followed by the resolution text and then the original body, so history survives.

**A move alone is not enough.** `tests/docs/_metaDeferralLedgerGraduation.test.ts` iterates its
`BACKLOG_GRADUATED` registry (`tests/docs/_metaDeferralLedgerGraduation.test.ts:90`); an id absent
from it is simply not checked, so both files could be edited correctly — or incorrectly — and
`tests/docs/` would stay green either way. Each archived id therefore gets a
`{ id, provenance }` row whose `provenance` is `test/parser-determinism-pair`, the string the
archived section must contain. Without these rows the ledger verification in §6 is false-green.

Resolution text records the **corrected** findings, not the original diagnoses:

- `BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE` — no RNG existed (§2.1); the defect was order-coupled
  sampling over aliases `parseVenue` never assigns (§2.2); exhaustive enumeration of all 8453
  neighbors gives **0** `UNKNOWN_FIELD`, so the entry's recovery-gap question is answered **no**
  (§2.4); the 22 trim-equivalent neighbors resolve exactly, 2 of them emitting `TYPO_NORMALIZED`
  because `hotal contact info` is a registered typo alias; the case now asserts value assignment
  behind a non-colliding anchor and carries a 30s timeout.
- `BL-KNOWN-SECTIONS-WALKER` — delivered 2026-07-06 by `tests/parser/_metaKnownSectionsWalker.test.ts`
  (`c6bd73001`); this branch retired the stale entry and the two contradicting docstrings. Include
  the §2.6 asked-for/shipped mapping so a future reader does not re-derive it.

Removal from `BACKLOG.md` must be complete — no stub heading. The graduation guard asserts no id is
both active and archived, and that no active entry carries a terminal status.

---

## 6. Verification

| Check | Command | Expected |
| --- | --- | --- |
| Venue block, exhaustive | `pnpm exec vitest run tests/parser/blocks/venue.test.ts` | green |
| Repeat-run determinism | the same command x5 | identical pass counts every run |
| Known-sections guards | `pnpm exec vitest run tests/parser/_metaKnownSectionsWalker.test.ts tests/parser/_metaKnownSectionsRegistry.test.ts` | 36 passed (35 today + the §5.4 guard) |
| Ledger guards | `pnpm exec vitest run tests/docs/` | green, with both `BACKLOG_GRADUATED` rows present |
| Whole parser suite | `pnpm exec vitest run tests/parser/` | green |
| Spec lint | `pnpm spec:lint docs/superpowers/specs/parser/2026-08-02-parser-determinism-pair.md` | 0 hard |

## 7. Guard conditions and edge cases

- **`inScopeAliases("venue.")` loses an assignable alias** → derived coverage floor (§4.3) fails.
- **`unambiguousTypos` returns `[]` for some alias** → non-vacuity assertion fails.
- **A new venue alias is added to `FIELD_ALIASES`** → enumerated automatically; the count rises; no
  test edit needed. That is the point of keeping the derivation.
- **A new venue alias shorter than 5 chars** → excluded by the existing `length >= 5` filter, which
  mirrors the parser's own `minLen: 5` gate (`lib/parser/aliases.ts:213`). Unchanged.
- **`parseVenue` gains an output field for a currently non-assignable canonical** → add one row to
  the canonical→field table and that alias moves into the value-asserting partition.
- **A generated neighbor equal to another block's exact alias** → already dropped inside
  `unambiguousTypos` (`tests/parser/_typoGenerator.ts:32`). Unchanged; this is why `ALL` and not the
  venue-only list is the vocabulary.
- **A new alias added to `TYPO_ALIASES`** → its trim-equivalent neighbors begin emitting
  `TYPO_NORMALIZED`; the iff-form assertion (§4.2) tracks that automatically.

## 8. Resolved scope — do not relitigate

- **The walker's declared accepted residual** (`tests/parser/_metaKnownSectionsWalker.test.ts:17`):
  the walker proves import, not exclusive factory use, and its backstop is registry-keyed. Ratified
  in `docs/superpowers/specs/parser/2026-07-06-known-sections-walker.md` and marked
  do-not-relitigate in the source.
- **Keeping `tests/parser/_metaKnownSectionsRegistry.test.ts`** rather than deleting it — §5.2.
- **Keeping venue's alias list derived** from `inScopeAliases` rather than converting it to a pinned
  const like the other four consumers — §4.5.
- **No output fields for `venue.contact_info` / `venue.in_house_av` / `venue.hotel_reservations`** —
  §2.2; sibling parsers own them; this is not silent data loss.
- **No BL-citation freshness guard** — §2.7, refused on measurement.
- **No `lib/parser/**` behavior change.** The one `lib/` edit is a comment block (§5.1). Unless a
  probe shows an actual parser defect, this is settled.
- **No UI surface**, so `impeccable-gate: N/A — no UI surface` is carried in the plan.

The assertion design WAS strengthened three times after this fence was first written, each against
a live escaping mutant and each with the admissibility contract met by demonstration rather than
waived: anchor integrity (round 3), universal application across partitions (round 4), and the
whole-object exact-shape rule that replaced all point clauses (round 5). The fence covers settled
decisions, not future evidence.

The one new test surface in this work is the docstring-truth guard (§5.4). The
known-sections **registry-drift** enforcement the backlog entry asked for is already shipped and is
not rebuilt here.
