# Line-keyed registries: a content-anchored key was designed, measured, and does not pay

**OUTCOME: no registry migrates.** This document is a refutation record. The design in §3 is
sound and its resolver was built and passed; §4 is the measurement that says shipping it would
cost a full arc to remove under half the churn on one registry. What ships is the measurement
instrument, the corrected numbers, and the documented limits (§6).


**Branch:** `feat/line-keyed-registry-durable-keys` · **Row:** `BL-LINE-KEYED-REGISTRY-ROWS` · **Facing:** process · **Mint-exception:** recurrence (`LIM-LINE-KEYED-SITEID`) · **Date:** 2026-08-28

## 0. Guardrails

This is a guard-adjacent arc. The four bounds below are stated before the design so every later section can cite them, and so a reviewer can settle a finding against them rather than against taste.

**Consequence bound.** Every registry row either resolves to exactly one site, or FAILS LOUD naming the row. A row never silently rebinds to a site that is not the one its author meant. A key form that resolves to zero sites and a key form that resolves to two are both loud failures, and they carry different messages. Conservative refusal plus a surfaced reason is a documented limit, not a finding.

**Probe domain.** The live registries under `tests/**`, enumerated from disk by a walker, never hand-listed. §1 states the enumeration command. A probe drawn from outside that set, or more than one ordinary edit away from an input in it, files to §7 documented limits rather than to a review round.

**Threat fence.** The defect this defends against is the ordinary refactor: a hoisted emit, a new import, a new header button, a reordered block. An author deliberately constructing two indistinguishable sites to defeat the key is out of scope and files to §7. Nothing here is a security boundary.

**Narrowing.** Where the key form cannot express a site, it DECLINES with a surfaced reason and the row stays line-keyed. The key grammar is closed and stated in §3.2. It does not grow a new anchor kind to capture the next awkward site. §4.3 measures declining as the common case rather than the exception, and treats that as the design working, not as debt. Once the declining set is the majority (it is, on both sides — `--ambiguity` and `--derivability` print it), the honest reading is §4.5's: the key does not pay.

## 0.1 Where every number in this document comes from

Three review rounds each found stale figures here, and the finding rate did not decay, because
the defect is the SIZE of the numeric surface rather than the bookkeeping over it. So this
document now holds itself to one rule, stated before any number appears.

**Every quantity is in one of exactly four classes, and each is marked where it appears:**

| class | how it is written | how to check it |
| --- | --- | --- |
| Command output | a fenced block headed by the command | run the command |
| Arithmetic over a printed block | stated as a sum, immediately under that block | add the printed rows |
| Historical measurement | labelled as such, with its method named (§4.5 only) | not reproducible by design; the method is the warrant |
| Citation | a `file:line`, a section number, a date | read the file |

Commands, all committed:

```
node scripts/line-key-census.mjs                # populations
node scripts/line-key-census.mjs --anchors      # syntactic anchor presence
node scripts/line-key-census.mjs --ambiguity    # anchor presence AND discrimination
node scripts/line-key-census.mjs --collisions   # emit-anchor collision groups
node scripts/line-key-census.mjs --proximity    # silent-misbind reachability
node scripts/line-key-census.mjs --derivability # site-derivable vs hand-authored emit rows
npx tsx scripts/ledger-key-census.mts           # the mutation accepted-survivor ledger
```

**A number that fits none of the four classes is a defect in this document, not a fact about the
subject.** `--anchors` and `--ambiguity` are DIFFERENT metrics and are never mixed in one table
without saying which is which (§4.1).

## 1. What is actually keyed by line

Enumerated from disk, not hand-listed. The populations below come from one command; §4's anchor columns come from a different mode of it, and the ledger from a different script entirely (§0.1 has the full map):

```
node scripts/line-key-census.mjs --anchors
```

The census walks all 2697 files under `tests/**` for two shapes: a `line:`/`lines:` field whose owning row carries a `file:`, and a string literal pairing a source path with a line number after a colon. It splits code from comment so a prose citation is never counted as a key, and it splits targets that exist on disk from targets that do not. That separates three populations a bare `rg` count conflates:

| population | tokens | churns? | why |
| --- | --- | --- | --- |
| Synthetic in-test fixtures | 136 | no | The path names a string the test itself defines. `tests/specLint/citations.test.ts:41` runs against an inline virtual filesystem `{ "lib/a.ts": "one\ntwo\n" }`; six `_metaChildlessGrowable` rows name a `violation` component under `components/` that has never existed. Nothing above them can move. |
| Comment citations | 125 | no | Prose pointing a reader at a definition. Drift here is a docs defect, not a suite failure. `spec:lint` already owns citation freshness. |
| Constructed test-local inputs | 2 | no | An object the test builds as INPUT, naming a real file but never joined to a recomputed line, so nothing above it can invalidate it. Two `ScanElement` literals in `_metaControlOutlineResidue`. Existing on disk is not sufficient to be load-bearing, which the census asserted until review probed it. |
| Load-bearing registry rows | 287 | YES | A hand-authored row whose line is JOINED against a machine-recomputed line. This is the whole subject. |

**A third shape exists and the census deliberately does not emit it.** The mutation harness keys accepted-survivor rows by `operator:line:col:text` (`tests/mutation/source/registry.ts:65` splits the operator off the front), which matches neither census shape. That population is the largest line-keyed registry in the repo and it is dispositioned in §4.2 on its own measurement, not on a census row. The census is not widened to cover it, because widening a recognizer to reach a surface that is going to decline anyway is motion.

The rows naming a nonexistent file were each opened before being classified, because "registry row bound to nothing" would have been a live P0. All of them are constructed fixtures. There is no such defect on main.

**Two independent methods agree.** The census above reads the working tree. A separate pass read `git log` per registry and counted pure re-keys (a diff hunk where the `-` and `+` lines are identical once every digit run is masked). The two disagree by at most two rows on any registry, from synthetic-row classification at the margin. Where this spec states a row count it is the census; where it states churn it is the git pass.

## 1.1 Resolved scope — do not relitigate

Each row is settled. A reviewer verifies the ratification rather than re-deriving the decision.

| decision | posture | ratified at |
| --- | --- | --- |
| The anchor grammar is CLOSED at three kinds | Narrowing is a constraint of the arc, not an omission. A site the grammar cannot name declines. | the arc brief (untracked, `FX-worktrees/_briefs/`), section "Subject", clause NARROWING; restated at §0, §3.2 |
| Every row keeps its line key | Under §4.5's outcome nothing migrates, so this is universal rather than a declining subset. The declining counts in §4.3 are evidence about the key, not a migration boundary. | §4.3, §4.5 |
| Migrate-everything is rejected | Scope is set by measured churn. 287 load-bearing rows exist; §4.5 migrates none. | arc brief, "do NOT migrate everything"; §4.2 |
| `postgrest-dml-lockdown` declines wholesale | It churns (35 re-keys, blast 11) but its targets are SQL and the grammar has no SQL anchor. Adding one is the forbidden ratchet. | §4.2, §7 item 4 |
| `_metaServerTimeGuard` and `acAmbiguousRecord` are excluded | Both measured ZERO re-keys. Excluding an unchurning surface is evidence, not oversight. | §4.1, §4.2 |
| No registry migrates | Ruled by the orchestrator's decision function 2026-08-28: migrate only if MORE THAN HALF the measured re-keys land on rows whose anchor the scanner can actually derive. Measured 41.5%. | §4.5 |
| The design is not withdrawn as WRONG, only as NOT WORTH SHIPPING | §3's resolver passes every guard case (§6.2). The refutation is economic, and stating it as a design failure would mislead the next arc. | §3, §4.5 |
| The mutation accepted-survivor ledger declines wholesale | 268 rows, incident (1). Not an oversight: measured, and the repair its own header prescribes leaves 28% of rows uniquely resolvable. | §4.2, §7 item 5 |
| Comment citations are out of scope | 125 of them. `spec:lint` owns citation freshness. | §1, §7 item 6 |
| Resolution never tie-breaks | Ambiguity fails loud. There is deliberately no "first match" or "nearest line" branch. | §0 consequence bound, §3.3, §6.1 step 4 |
| Today's line keys CAN misbind silently | An earlier draft claimed otherwise; the claim was falsified by probe and the correction is kept in place rather than edited out. | §2 |

## 2. The mechanism, and what today's failure actually is

A scanner walks the TypeScript AST and computes a line for each site it finds:

- `tests/styles/interactiveScanCore.ts:1114` — `line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1`
- `tests/adminAlerts/_metaAlertProducerScope.test.ts:112` — `site: \`${file}:${line + 1}\``

A hand-authored registry then joins against that output on the line:

- `tests/styles/controlOutlineScan.ts:261` — `scanned.find((e) => e.file === row.file && e.line === row.line) ?? null`
- `tests/adminAlerts/_metaAlertProducerScope.test.ts:149` — the discovered-site direction, `new Set(PRODUCER_SCOPE.map((r) => r.site))`.
- `tests/adminAlerts/_metaAlertProducerScope.test.ts:155` — the reverse direction, computing `stale` as the registry rows discovery did not find.

So the line is a join key between a value the tree computes and a value a human typed. Any edit above the site moves the computed value and not the typed one, and the join breaks for every row below the edit at once. That is the wholesale invalidation the ledger row names.

**What breaks is USUALLY loud, and the exception matters more than the rule.** Both join shapes above normally fail by NOT MATCHING: `find(...) ?? null` yields null, and the set join reports the row as stale. The dominant cost today is therefore re-key edits and the rounds spent separating them from genuine gaps.

But `find((e) => e.file === row.file && e.line === row.line)` does not return "the element that moved". It returns **whatever element now occupies that line number**. If an edit shifts the intended element down and an unrelated interactive element comes to rest on the vacated line, the row binds to the wrong element and the assertion runs against it, silently. A first draft of this spec asserted that today's keys cannot misbind. That is false, and the probe that falsifies it is:

```
node scripts/line-key-census.mjs --proximity
```

`node scripts/line-key-census.mjs --proximity` prints, per registry, how many keyed-row pairs sit within 20 lines of each other. They are common, so an ordinary insert of that size can land one row's line on another's. This is a LOWER BOUND on the real exposure, because the collision only needs some SCANNED element on the vacated line, and the scanner's element set is much denser than the keyed subset it is compared against.

Two consequences, and they point the same way:

1. The case for content anchoring is stronger than "it saves re-key edits". Line keys are quietly wrong on a reachable path, not merely expensive.
2. The bar for the replacement rises. It is not enough for the durable key to be no worse than a line. **It must fail loud on ambiguity rather than pick a winner** (§0, §3.3), because "pick whatever is at this position" is exactly the defect being removed. A cure that silently picks would reproduce the disease with a longer key.

That reframes the job. The disease is loud and expensive. The obvious cure is quiet and wrong: key a site by its ordinal position ("the 3rd button in this component") and an inserted earlier button silently rebinds every row after it to its neighbour, with the suite green. **A cure that trades loud-and-expensive for quiet-and-wrong is worse than the disease.** §3 is built around refusing that trade, and §6.1 is the mutant that proves we refused it.

## 3. The durable key

### 3.1 Shape

A durable key is a pair: an `anchor` that names the site by its own content, and the `file` it lives in. It never contains a line, an ordinal, or a byte offset.

```ts
type DurableKey = { file: string; anchor: Anchor };
```

### 3.2 The closed anchor grammar

Exactly three anchor kinds. This list is closed: a site expressible by none of them declines (§3.4).

| kind | form | applies to | derived from |
| --- | --- | --- | --- |
| `testid` | `{ kind: "testid", value: string }` | JSX elements | the element's own `data-testid` attribute |
| `label` | `{ kind: "label", value: string }` | JSX elements with no testid | the element's own `id` or `aria-label`, in that order |
| `emit` | `{ kind: "emit", code: string, context: string, scope: string }` | `lib/**` and `app/api/**` call sites | the emitted code, the sorted context-key signature, and the `scope` the row already carries. `scope` is part of the anchor because §5 measures the disambiguation WITH it: dropping it would make §5's "resolves 1 of 5" unreproducible by the shipped grammar. |

Each anchor value is read out of the SITE, never authored freehand. That is what makes it content-anchored: an edit above the site cannot change it, and an edit to the site itself changes it, which is correct, because that is a different site.

### 3.3 Resolution, and the only three outcomes

```
resolve(key, scannedSites) -> Bound(site) | Unresolved(key) | Ambiguous(key, sites)
```

- exactly one scanned site carries the anchor: `Bound`.
- zero: `Unresolved`. The suite fails naming the row and its anchor.
- two or more: `Ambiguous`. The suite fails naming the row and every site that matched.

Every input case is named, so no case falls through to an implicit branch:

| input condition | outcome | message names |
| --- | --- | --- |
| exactly one scanned site carries the anchor | `Bound` | — |
| no scanned site carries it, target file EXISTS | `Unresolved` | the row, its anchor, the file |
| the target file does not exist or cannot be read | `Unresolved` | the row and the unreadable path, distinct copy from the case above |
| the target file exists but the scanner produced NO sites for it | `Unresolved` | the row, plus that the scanner saw the file and found nothing, so a scanner-scope bug is distinguishable from a moved element |
| two or more scanned sites carry it, same file | `Ambiguous` | the row and EVERY matching site |
| two or more carry it across DIFFERENT files | `Ambiguous` | as above. The anchor is scoped by `file` (§3.1), so this can only arise from a malformed row, and it is loud rather than filtered |
| anchor value is empty or whitespace-only | `Unresolved`, and the registry guard rejects the row at load | the row. An empty anchor is an authoring error, never a wildcard |
| `emit` anchor with no `code` | rejected at load | the row and the missing field |
| row carries BOTH an `anchor` and a `declined` reason | rejected at load | the row. The two are mutually exclusive by construction |

Anchor comparison is exact: byte equality after no normalisation at all. Not trimmed, not case-folded. A `data-testid` that differs by whitespace is a different anchor, and saying so loudly beats guessing which one was meant.

**There is no fourth branch and no tie-break.** No "first match", no "nearest to the old line", no ordinal. The absence of a tie-break IS the consequence bound from §0, and §6.1 pins its absence executably rather than by reading the code.

### 3.4 Declining

A site with no `data-testid`, no `id`, no `aria-label`, and no distinguishing emit signature cannot be named by the grammar. The migration then leaves the row line-keyed and records the reason in the row itself:

```ts
{ file: "components/admin/wizard/Step3ReviewModal.tsx", line: 972,
  declined: "no-intrinsic-anchor: bare <input type=radio>" }
```

The reason is not free text. It is one of a CLOSED prefix set, asserted by the guard, so `declined: "x"` cannot satisfy it:

| prefix | means |
| --- | --- |
| `no-intrinsic-anchor:` | the element carries no testid, id, or aria-label (§4.3) |
| `ambiguous-emit:` | the emit signature collides with a sibling row (§5) |
| `unsupported-target:` | the target language has no anchor kind in the grammar, e.g. SQL (§4.2) |

The prefix is followed by a free-text note for the reader. The guard asserts the prefix; the note is documentation.

A declined row keeps exactly the behaviour it has today. It is not a regression and not a TODO. It is the grammar refusing to guess, which is the whole point, and a guard asserts that every non-migrated row in a migrated registry carries a `declined` reason, so declining stays a deliberate act rather than an omission.

## 4. Scope: which registries migrate

### 4.1 The churn table

**This table is a HISTORICAL measurement** in the sense of §0.1: its `re-keys`, `commits` and `blast` columns come from the git-history passes described in §4.5 and are not reproducible from a committed command. `rows` is `--anchors`. **The anchor columns are `--ambiguity`, and the two are DIFFERENT
metrics**: `--anchors` counts whether a syntactic anchor is present, `--ambiguity` whether it
also discriminates. `--anchors` reports `_metaControlOutlineResidue` as `testid=7 /
no-syntactic-anchor=3`; `--ambiguity` reports `2 / 8`. The columns below are `--ambiguity`'s,
because presence without discrimination is the whole subject (§7 item 6). `re-keys` is the count of pure line-only edits in git history, `commits` how many distinct commits carried at least one, and `blast` the most that landed in a single commit, which is the wholesale-invalidation signature.

**The table is every census registry with 10 or more rows, and nothing else.** That is the stated filter; the census emits a long tail of 1-to-5-row files that no incident names and that no scope decision turns on. `n/a` in a churn column means the git pass did not cover that registry, not that it measured zero.

One registry the ledger row mentions is deliberately ABSENT from this table: `tests/specLint/acAmbiguousRecord.ts` keys its 14 rows on a `plan:` field rather than a `file:` field, so the census does not emit it at all and no number here is derived for it. It is dispositioned in §4.2 on a hand count, flagged as such.

| registry | rows | re-keys | commits | blast | testid-uniq | label-uniq | emit | declining |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tests/adminAlerts/alertProducerScope.registry.ts` | 47 | **189** | 44 | **20** | 0 | 0 | 40 | 7 |
| `tests/styles/tapTargetCensus.ts` | 51 | 43 | 28 | 5 | 19 | 3 | 0 | 29 |
| `tests/styles/controlOutlineScan.ts` | 62 | 35 | 19 | 4 | 26 | 0 | 0 | 36 |
| `tests/db/postgrest-dml-lockdown.test.ts` | 33 | 35 | 4 | 11 | 0 | 0 | 0 | **33** |
| `tests/styles/subtleInteractiveExemptions.ts` | 13 | 9 | 9 | 1 | 3 | 0 | 0 | 10 |
| `tests/styles/_metaControlOutlineResidue.test.ts` | 10 | 9 | 8 | 2 | 2 | 0 | 0 | 8 |
| `tests/styles/_metaControlOutlineFill.test.ts` | 22 | 3 | 3 | 1 | 8 | 0 | 0 | 14 |
| `tests/help/_metaServerTimeGuard.test.ts` | 13 | **0** | 0 | 0 | 0 | 0 | 13 | 0 |
| `tests/specLint/expectContractCorpus.test.ts` | 10 | n/a | n/a | n/a | 0 | 0 | 0 | 10 |
| `tests/mutation/source/registry.ts` accepted rows | 268 | see §4.2 | — | wholesale | 0 | 0 | 0 | **268** |

`alertProducerScope` is the churn engine on its own: 189 pure re-keys across 44 of its 56 commits, and a single commit (`9d6a93db8`, "re-pin the producer registry on the merged tree") moved 20 anchors with no semantic change at all.

### 4.2 What was going to migrate

The candidate was `tests/adminAlerts/alertProducerScope.registry.ts`: 47 rows, 189 of the 323
measured re-keys, and the worst blast in the corpus (`9d6a93db8` moved 20 anchors with no
semantic change). The five style registries were descoped first, on anchorability; the emit
registry was then descoped on §4.5. §4.3 and §4.4 are why the first number could not be
trusted, and they are kept because the error is the reusable part.

### 4.3 Anchorability, measured three times, wrong twice

**JSX side: 39%, not the 79% first stated.** The opening-tag window truncated at the first `>`,
and an inline `onClick={() => ...}` contains one, so a present `data-testid` read as absent.

```
node scripts/line-key-census.mjs --ambiguity
```

prints the per-registry split, a `DUPLICATE-TESTID-FILES` line, and a `JSX-SUBTOTAL` line. **The five style registries are 39%
anchorable.** The per-registry rows are not restated here; the command prints them, and a table
copied into prose is a line-key into a moving tree, which is this document's own subject.

**A duplicate anchor is not rare.** `app/me/meShowSections.tsx` renders one
`` data-testid={`me-show-card-${show.slug}`} `` at three separate sites, so a template literal
produces the SAME anchor at all three and every row keyed to them returns `Ambiguous`. The same
command prints `DUPLICATE-TESTID-FILES`. A template-literal testid identifies a runtime instance,
not a site.

**Emit side: 43%, not the 83% stated when the scope call was made.** Reproduced by
`node scripts/line-key-census.mjs --derivability`. This is the one that
mattered, and it is the sharpest error in the arc. The grammar requires `code`, `context` and
`scope`, and §3.2 says anchor content is read out of the SITE. For most rows it cannot be:

```
$ node scripts/line-key-census.mjs --derivability
rows=47  dynamic=20  computedContext=12  both=5
site-derivable (neither flag) = 20 of 47 = 43%
  of those: Bound=20  Ambiguous=0   (anchor without the registry-authored scope)
```

Discovery represents a dynamic code as `code == null`
(`tests/adminAlerts/_metaAlertProducerScope.test.ts:174`), computed context keys are
hand-authored by contract, and `scope` comes from the registry row for every row without
exception. So for 27 of 47 rows the "content anchor" would compare registry fields against
registry fields: **self-validating, which is the tautology this arc exists to remove.** An
ordinary dynamic-code or scope drift would stay green.

The 43% is not meaningfully better than the 39% the JSX side was descoped FOR.

### 4.4 Method note: five numeric claims, four wrong until executed

1. JSX anchorability 79% → **39%** (window truncated at `>`).
2. The census `emit` column 40 → a PATH test (`lib/`, `app/api/`), not an anchorability test.
3. Decline count **9 under whole-group refusal, 8 under per-row resolution.** An earlier draft
   of this item said the two differ because `--collisions` groups by `(file, code)` alone. That
   was wrong, and it is the same class of error as the rest of this list: BOTH apply
   `contextKeys` and `scope`. They differ in POLICY. `--collisions` finds 5 colliding groups,
   resolves 1 by content, and declines every row of the 4 it cannot fully separate (2+2+3+2 =
   **9**). The resolver in §3.3 asks per row whether that row's anchor matches exactly
   one site, so the third `ASSET_RECOVERY_REVISION_DRIFT` row binds alone and only 2 of its
   group decline (**8**). **Per-row resolution governs, because §3.3 specifies it**; 9 is the
   more conservative policy `--collisions` implements, reported as such.
4. Emit anchorability 83% → **43%** (counted rows whose anchor fields are hand-authored).
5. Ledger expressibility 45% → **28%** (counted distinct KEYS, not resolvable ROWS; §4.2).

Two further census defects, both found by review rather than by me:

- **`existsSync(target)` is not enough to call a row load-bearing.** Two rows in
  `_metaControlOutlineResidue` are constructed `ScanElement` objects that happen to name real
  files (`ShareHub.tsx`, `PublishedToggle.tsx`); they are test-local inputs, never joined to a
  recomputed line, and cannot churn. The census counted them.
- **The `decline` column measures "no syntactic anchor present", not the final declined
  population.** The column counts rows with no syntactic anchor at all; a row whose anchor
  exists but does not discriminate declines too, and is counted nowhere in it. Three sections
  asserted the column's figure as if it were the final one. `--ambiguity` now prints both, and
  §4.3 quotes it.

Every one of these shares a shape: **an anchor, or a row, that EXISTS counted as one that
DISCRIMINATES.** On an arc whose subject is keys drifting from their referents, a
hand-maintained number is the same defect in prose, so the rule this document ends with is
that §4 states no figure the committed census does not print.

### 4.5 The refutation

The orchestrator set the test before the measurement, so it could not be chosen to fit:
migrate only if MORE THAN HALF the measured re-keys land on rows whose anchor is genuinely
site-derivable. Measured by two independent methods that agree:

```
56 commits, 192 pure re-keys, 188 attributed (97.9%), 4 unattributed
  on site-derivable rows      :  78  = 41.5%
  on non-derivable rows       : 110  = 58.5%
```

**Both passes are git-history analyses, not committed commands**, and are recorded as historical
measurements with their methods named. The two methods: (1) hunk-pairing, treating a `-`/`+` pair
as a pure re-key when the two lines are identical after masking every digit run, attributing each
to a row by exact post-image line number; (2) a set-based per-commit recount. They agree at 192.

**On 189 versus 192, since both appear in this document.** The FIRST pass (§4.1's corpus survey)
counted 189 on this registry; the SECOND (above) counted 192 on it alone, with the stricter
attribution that classification required. §4.1's corpus total of 323 comes from the first pass and
is NOT commensurable with 192; **no ratio in this document mixes the two**, and 41.5% is computed
entirely within the second.

**41.5% is under half, so nothing migrates.** The reason it fails is worth more than the
number: churn is PROPORTIONAL, not concentrated. Derivable rows are 20 of 47 (42.6%) of the
registry and take 41.5% of the churn, so there is no pocket of value to extract. The top
churning row is non-derivable (`lib/drive/watch.ts` · `WATCH_CHANNEL_ORPHANED`, 20 re-keys),
and derivable and non-derivable rows alternate down the whole top five. Migrating the 20 would
erase 78 of 192 re-keys, and those same 20 are the only rows that would additionally need a
live site-extraction proof.

## 5. The collision measurement, which is the load-bearing evidence

The `emit` anchor was almost `(file, code)`. Measured against the live registry, `(file, code)` is NOT unique: **6 surplus rows in 5 colliding groups across 47 rows, 41 distinct pairs**, reproduced by `node scripts/line-key-census.mjs --collisions`. Shipping that key would have merged distinct rows into one, which is precisely the silent misbind §2 says is worse than the disease.

Adding the content-derived discriminators the row already carries (`contextKeys` and `scope`)
resolves **1 of 5** collision groups. In each of the other four, at least two rows remain
identical in every field the registry holds.

**`--collisions` reports nine declining rows; per-row resolution declines eight.** That is
a policy difference, not a measurement disagreement (§4.4 item 3). `--collisions` refuses a whole
group it cannot fully separate, so all three `ASSET_RECOVERY_REVISION_DRIFT` rows are counted;
§3.3 resolves per row, and the third of those at line 656 has different context keys, so its anchor
matches exactly one site and it BINDS. **Per-row governs, because that is what §3.3 specifies.**
Nine is `--collisions`' conservative output, reported here as its own policy and not as the
document's conclusion:

```
lib/sync/runScheduledCronSync.ts::PARSE_ERROR_LAST_GOOD   lines 2768, 3635   ctx=[drive_file_id,sheet_name] scope=per-show
lib/sync/applyStaged.ts::EMBEDDED_RECOVERY_REQUIRES_RESTAGE  lines 2097, 2107  ctx=[drive_file_id] scope=per-show
lib/sync/assetRecovery.ts::ASSET_RECOVERY_REVISION_DRIFT
  :546  ctx=[currentSnapshotRevisionId,snapshotRevisionId] scope=per-show
  :633  ctx=[currentSnapshotRevisionId,snapshotRevisionId] scope=per-show   <- identical to :546
  :656  ctx=[snapshotRevisionId] scope=per-show                            <- distinguishable
app/api/drive/webhook/route.ts::WEBHOOK_TOKEN_INVALID     lines 332, 348     ctx=[channel_id,reason] scope=global
```

The alternative, an ordinal to separate colliding rows, is the rejected trade from §2, and this measurement is why the grammar is closed rather than one anchor kind longer. §4.4 item 3 owns the decline count.

## 6. What ships

No registry migrates and no resolver ships. Three things do.

### 6.1 The measurement instrument

`scripts/line-key-census.mjs` — walker-derived, five modes (`--anchors`, `--collisions`,
`--proximity`, `--ambiguity`, `--derivability`), plus `scripts/ledger-key-census.mts` for the
mutation ledger. §0.1 maps every quantity in this document to one of the seven commands, to
arithmetic over a printed block, to a named historical measurement, or to a citation. It carries the two
repairs review found: a row is load-bearing only when it is actually joined against a
recomputed line, so a constructed `ScanElement` naming a real file no longer counts (§4.4);
and the `decline` column is named for what it measures, "no syntactic anchor present", with
the final declined population computed separately.

The instrument is the durable part. Every number here was cheap to re-derive and expensive to
maintain by hand, which is the same lesson the subject matter teaches.

### 6.2 The design, recorded as sound but unshipped

`§3`'s resolver was built and exercised against all nine guard-condition rows: unique anchor
binds; an edit ABOVE the site keeps the binding to the same site; a duplicate anchor returns
`Ambiguous` naming every match and NEVER `Bound`; the four zero-match causes stay
distinguishable; exact comparison is not relaxed by trimming. It passes.

**It is recorded here, not shipped, and that distinction is the point.** The refutation in §4.5
is economic, not technical. A future arc that reads this as "content anchoring does not work"
would have learned the wrong thing.

One caveat travels with it, because it is the trap this arc nearly shipped: **that prototype
compared registry-parsed anchors against registry-parsed anchors.** It never extracted an
anchor from a live site, which is exactly why it could pass while 27 of 47 rows had no
site-derivable anchor at all (§4.3). A green that never touches the real input is a green
about nothing, and any future attempt starts with live site extraction, not with a resolver.

### 6.3 The documented limits

§7, which is now the deliverable rather than an appendix.

### 6.4 Dimensional Invariants

N/A — no UI surface. Nothing renders. §6.1 lists what the arc ships; the `.tsx` paths named
throughout are TARGETS the registries key on, never files this arc modifies.

### 6.5 Transition Inventory

N/A — no UI surface, same reason. The resolver's three outcomes are return values, not visual
states, and it does not ship in any case.

impeccable-gate: N/A — no UI surface

## 7. Documented limits

This section is the arc's deliverable. Each limit names what would change the answer, in terms
someone could measure rather than feel.

1. **Every registry keeps its `file:line` keys, and every re-key they cost is still coming.**
   Every load-bearing row the census counts. The record is §4.1's churn table (kept in full, not
   trimmed to the once-candidate registry) and §4.5's attribution. Re-file trigger: §8's two arms.

2. **The emit anchor cannot express 27 of 47 rows on the registry it was designed for** (§4.3).
   20 rows carry `dynamic: true`, 12 `computedContext: true`, 5 both. Discovery yields
   `code == null` for a dynamic site, computed context keys are hand-authored by contract, and
   `scope` is registry-authored for every row. Re-file trigger: a discovery pass that resolves a
   dynamic code to its emitted literal, or a scope the site itself carries.

3. **A template-literal `data-testid` identifies a runtime instance, not a site** (§4.3).
   `app/me/meShowSections.tsx` renders one at three sites, so every row keyed to
   them matches all three. `--ambiguity` prints the affected-file count as
   `DUPLICATE-TESTID-FILES`. This is what an anchor grammar for JSX would have to solve first,
   and it is harder than the presence of a testid suggests. Re-file trigger: the duplicates are disambiguated by their
   authors, or a grammar appears that can name one branch of a conditional render.

4. **`postgrest-dml-lockdown` has no SQL anchor** (§4.2), while measurably churning: 35 re-keys,
   blast 11, and 12 of its 12 adjacent row pairs sit within 20 lines. Re-file trigger: a further
   wholesale re-key, at which point a SQL statement anchor is its own arc with its own hit/miss
   table, never a kind bolted onto this grammar.

5. **The mutation accepted-survivor ledger keeps its positional siteIds** (§4.2; counts printed by
   `npx tsx scripts/ledger-key-census.mts`). The only SILENT failure in the whole subject: `score()`
   (`tests/mutation/source/ledger.ts:79-89`) excludes ledgered equivalents from the denominator,
   so a mis-keyed row counts its mutant twice. The repair its own in-tree header prescribes
   leaves 28% of rows resolvable, printed by `npx tsx scripts/ledger-key-census.mts`:

   ```
   surfaces=57 surfacesWithRows=31 rows=268
   scopedDistinctKeys=121 uniquelyResolvableRows=76
   expressible=28%
   ```

   That script IMPORTS `GUARD_SURFACES` rather than parsing it, which is both the method and the
   reason it is a separate file: the regex parse this spec first used undercounted every figure
   it produced (57 surfaces read as 58, 268 rows as 265). And 121 is the count of distinct
   scoped KEYS, not resolvable rows; expressibility is 76/268, because counting keys keeps one
   representative per collision group and discards the rest, which is the merge §0 forbids. Re-file trigger: a non-positional disambiguator for
   same-operator-same-text mutants, the harness keying mutants by something other than site, one
   re-key commit per calendar month on accepted rows, or a scoring incident traced to a mis-key.

6. **An anchor that EXISTS is not an anchor that DISCRIMINATES**, and the shape appeared five
   times in this document's own numbers before review caught the last of them (§4.4). Swept
   across every anchor kind rather than patched per instance: `emit` declines on ambiguity and
   cannot derive its hand-authored rows at all (`--derivability`, and §4.4 item 3 on the two
   decline policies); `testid` is duplicated in the files `--ambiguity` names; `label` measured
   unique. The derived cover is the census's `--ambiguity` mode, not this
   list, so a newly-duplicated anchor is caught without re-running the analysis.

7. **Comment citations are out of scope** (§1). 125 of them. `spec:lint` owns citation freshness.

## 8. Done condition

The ledger row's done condition was re-keys per arc falling to zero on migrated registries.
**That condition is not met and is not reachable by this design**, so the row is re-dispositioned
rather than left open implying someone should retry the same thing: `BL-LINE-KEYED-REGISTRY-ROWS`
becomes a documented limit carrying the churn table (§4.1), both attribution methods (§4.5), and
the anchorability measurements (§4.3).

**Re-file trigger, two arms, both measured rather than felt:**

1. An anchor design appears that can derive the 27 hand-authored rows — a discovery pass that
   resolves a dynamic `code` to its emitted literal, or a `scope` the site itself carries. That
   is what would move 43% toward the threshold.
2. Churn CONCENTRATION shifts: the site-derivable share of attributed re-keys rises above half,
   re-measured by the same two methods. Today it is 41.5% against a 42.6% registry share, and
   the near-equality is the whole finding.

What this arc is worth, stated plainly: it spent its budget establishing that a plausible repair
does not pay, and left behind the instrument that will settle the same question in minutes next
time. That is the honest return, and it is the reason the numbers above are reproducible rather
than asserted.
