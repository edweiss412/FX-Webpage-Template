# Durable keys for line-keyed test registries

**Branch:** `feat/line-keyed-registry-durable-keys` · **Row:** `BL-LINE-KEYED-REGISTRY-ROWS` · **Facing:** process · **Mint-exception:** recurrence (`LIM-LINE-KEYED-SITEID`) · **Date:** 2026-08-28

## 0. Guardrails

This is a guard-adjacent arc. The four bounds below are stated before the design so every later section can cite them, and so a reviewer can settle a finding against them rather than against taste.

**Consequence bound.** Every registry row either resolves to exactly one site, or FAILS LOUD naming the row. A row never silently rebinds to a site that is not the one its author meant. A key form that resolves to zero sites and a key form that resolves to two are both loud failures, and they carry different messages. Conservative refusal plus a surfaced reason is a documented limit, not a finding.

**Probe domain.** The live registries under `tests/**`, enumerated from disk by a walker, never hand-listed. §1 states the enumeration command. A probe drawn from outside that set, or more than one ordinary edit away from an input in it, files to §7 documented limits rather than to a review round.

**Threat fence.** The defect this defends against is the ordinary refactor: a hoisted emit, a new import, a new header button, a reordered block. An author deliberately constructing two indistinguishable sites to defeat the key is out of scope and files to §7. Nothing here is a security boundary.

**Narrowing.** Where the key form cannot express a site, it DECLINES with a surfaced reason and the row stays line-keyed. The key grammar is closed and stated in §3.2. It does not grow a new anchor kind to capture the next awkward site. §4.3 measures the decline set at 40 of 207 rows and treats that as the design working, not as debt.

## 1. What is actually keyed by line

Enumerated from disk, not hand-listed. One command produces every number in this section and in §4:

```
node scripts/line-key-census.mjs --anchors
```

The census walks all 2696 files under `tests/**` for two shapes: a `line:`/`lines:` field whose owning row carries a `file:`, and a string literal pairing a source path with a line number after a colon. It splits code from comment so a prose citation is never counted as a key, and it splits targets that exist on disk from targets that do not. That separates three populations a bare `rg` count conflates:

| population | tokens | churns? | why |
| --- | --- | --- | --- |
| Synthetic in-test fixtures | 136 | no | The path names a string the test itself defines. `tests/specLint/citations.test.ts:41` runs against an inline virtual filesystem `{ "lib/a.ts": "one\ntwo\n" }`; six `_metaChildlessGrowable` rows name a `violation` component under `components/` that has never existed. Nothing above them can move. |
| Comment citations | 125 | no | Prose pointing a reader at a definition. Drift here is a docs defect, not a suite failure. `spec:lint` already owns citation freshness. |
| Load-bearing registry rows | 289 | YES | A hand-authored row whose line is JOINED against a machine-recomputed line. This is the whole subject. |

The rows naming a nonexistent file were each opened before being classified, because "registry row bound to nothing" would have been a live P0. All of them are constructed fixtures. There is no such defect on main.

**Two independent methods agree.** The census above reads the working tree. A separate pass read `git log` per registry and counted pure re-keys (a diff hunk where the `-` and `+` lines are identical once every digit run is masked). The two disagree by at most two rows on any registry, from synthetic-row classification at the margin. Where this spec states a row count it is the census; where it states churn it is the git pass.

## 1.1 Resolved scope — do not relitigate

Each row is settled. A reviewer verifies the ratification rather than re-deriving the decision.

| decision | posture | ratified at |
| --- | --- | --- |
| The anchor grammar is CLOSED at three kinds | Narrowing is a constraint of the arc, not an omission. A site the grammar cannot name declines. | the arc brief (untracked, `FX-worktrees/_briefs/`), section "Subject", clause NARROWING; restated at §0, §3.2 |
| Declining rows keep their line keys | 40 rows (§4.3) stay as they are. This is the narrowing rule working, not partial migration. | §3.4, §4.3 |
| Migrate-everything is rejected | Scope is set by measured churn. 289 load-bearing rows exist; 207 migrate. | arc brief, "do NOT migrate everything"; §4.2 |
| `postgrest-dml-lockdown` declines wholesale | It churns (35 re-keys, blast 11) but its targets are SQL and the grammar has no SQL anchor. Adding one is the forbidden ratchet. | §4.2, §7 item 4 |
| `_metaServerTimeGuard` and `acAmbiguousRecord` are excluded | Both measured ZERO re-keys. Excluding an unchurning surface is evidence, not oversight. | §4.1, §4.2 |
| Comment citations are out of scope | 125 of them. `spec:lint` owns citation freshness. | §1, §7 item 5 |
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

Across the six migrating registries, **16 keyed-row pairs sit within 20 lines of each other** (7 in `alertProducerScope`, 4 in `controlOutlineScan`, 2 each in `tapTargetCensus` and `_metaControlOutlineFill`, 1 in `subtleInteractiveExemptions`), so an ordinary insert of that size can land one row's line on another's. This is a LOWER BOUND on the real exposure, because the collision only needs some SCANNED element on the vacated line, and the scanner's element set is much denser than the keyed subset it is compared against.

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

`rows` and the anchor columns are the census, verbatim. `re-keys` is the count of pure line-only edits in git history, `commits` how many distinct commits carried at least one, and `blast` the most that landed in a single commit, which is the wholesale-invalidation signature.

**The table is every census registry with 10 or more rows, and nothing else.** That is the stated filter; the census emits a long tail of 1-to-5-row files that no incident names and that no scope decision turns on. `n/a` in a churn column means the git pass did not cover that registry, not that it measured zero.

One registry the ledger row mentions is deliberately ABSENT from this table: `tests/specLint/acAmbiguousRecord.ts` keys its 14 rows on a `plan:` field rather than a `file:` field, so the census does not emit it at all and no number here is derived for it. It is dispositioned in §4.2 on a hand count, flagged as such.

| registry | rows | re-keys | commits | blast | testid | label | emit | decline |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tests/adminAlerts/alertProducerScope.registry.ts` | 47 | **189** | 44 | **20** | 0 | 0 | 40 | 7 |
| `tests/styles/tapTargetCensus.ts` | 51 | 43 | 28 | 5 | 37 | 2 | 0 | 12 |
| `tests/styles/controlOutlineScan.ts` | 62 | 35 | 19 | 4 | 50 | 3 | 0 | 9 |
| `tests/db/postgrest-dml-lockdown.test.ts` | 33 | 35 | 4 | 11 | 0 | 0 | 0 | **33** |
| `tests/styles/subtleInteractiveExemptions.ts` | 13 | 9 | 9 | 1 | 8 | 0 | 0 | 5 |
| `tests/styles/_metaControlOutlineResidue.test.ts` | 12 | 9 | 8 | 2 | 8 | 0 | 0 | 4 |
| `tests/styles/_metaControlOutlineFill.test.ts` | 22 | 3 | 3 | 1 | 17 | 2 | 0 | 3 |
| `tests/help/_metaServerTimeGuard.test.ts` | 13 | **0** | 0 | 0 | 0 | 0 | 13 | 0 |
| `tests/specLint/expectContractCorpus.test.ts` | 10 | n/a | n/a | n/a | 0 | 0 | 0 | 10 |

`alertProducerScope` is the churn engine on its own: 189 pure re-keys across 44 of its 56 commits, and a single commit (`9d6a93db8`, "re-pin the producer registry on the merged tree") moved 20 anchors with no semantic change at all.

### 4.2 What migrates

**Migrating: six registries, 207 rows, carrying 288 of the 323 measured re-keys (89%).** `alertProducerScope.registry`, `tapTargetCensus`, `controlOutlineScan`, `subtleInteractiveExemptions`, `_metaControlOutlineResidue`, `_metaControlOutlineFill`. The first five are ranked by measured churn. `_metaControlOutlineFill` has only 3 measured re-keys, but it is incident (3) in the ledger row, it keys the same tree through the same scanner as its four style siblings, and migrating it with them is the class-sweep default rather than a sixth arc later.

**Not migrating, each with its reason rather than silence:**

- **`tests/db/postgrest-dml-lockdown.test.ts` DECLINES WHOLESALE (33 of 33 rows).** An earlier draft of this spec excluded it on the theory that shipped migrations are immutable, so its keys were durable by the property of the tree. **The git history falsifies that: 35 re-keys in 4 commits, blast 11.** Migrations do get edited, and when one is, every anchor below the edit re-keys at once. The honest reason to exclude it is different and narrower: its rows key statements inside `.sql` files, and the closed grammar in §3.2 has no SQL anchor. Adding one is exactly the ratchet §0 forbids, so the registry declines with a surfaced reason and a re-file trigger in §7. This correction is recorded rather than quietly edited out, because the falsified claim is the more instructive half.
- **`tests/help/_metaServerTimeGuard.test.ts` is excluded on evidence: zero re-keys in 13 commits.** Its 13 `lib/` keys have never moved. Its 9 numeric edits in history were population-count churn (`toBe(213)` to `toBe(214)`), not key churn. Nothing here needs repair, and all 13 rows would be `emit`-expressible if that ever changes.
- **`tests/specLint/acAmbiguousRecord.ts`: zero re-keys**, pointing at rarely-edited plan documents. Same disposition.
- **The remaining specLint members** key on documents or on fixtures the test defines. `spec:lint` owns them.

**Migrate-everything is rejected explicitly.** 289 load-bearing tokens exist; 207 migrate. The rest either measured zero churn, or cannot be named by a closed grammar.

### 4.3 The decline set is 40 of 207, and that is the design working

Within the migrating six: 120 rows carry a `data-testid`, 7 an `id` or `aria-label`, 40 an emit signature, and 40 carry nothing the grammar can name (120 + 7 + 40 + 40 = 207). Sample declines, all bare interactive elements with no intrinsic identity: `app/help/errors/page.tsx:82` (`<a href={\`#${family.id}\`}>`), `components/admin/dev/MaterializeCard.tsx:198` (bare `<input type="checkbox">`), `components/admin/wizard/Step3ReviewModal.tsx:972` (`<input type="radio">`).

A declined row keeps exactly today's behaviour. The suite gets no weaker: it is the grammar refusing to guess.

## 5. The collision measurement, which is the load-bearing evidence

The `emit` anchor was almost `(file, code)`. Measured against the live registry, `(file, code)` is NOT unique: **6 surplus rows in 5 colliding groups across 47 rows, 41 distinct pairs**, reproduced by `node scripts/line-key-census.mjs --collisions`. Shipping that key would have merged distinct rows into one, which is precisely the silent misbind §2 says is worse than the disease.

Adding the content-derived discriminators the row already carries (`contextKeys` and `scope`) resolves **1 of 5** collision groups. In each of the other four, at least two rows remain identical in every field the registry holds. Note the third `assetRecovery` row is NOT identical to its two siblings; it is listed because its group still contains an identical pair, and the anchor must decline for the whole group:

```
lib/sync/runScheduledCronSync.ts::PARSE_ERROR_LAST_GOOD   lines 2768, 3635   ctx=[drive_file_id,sheet_name] scope=per-show
lib/sync/applyStaged.ts::EMBEDDED_RECOVERY_REQUIRES_RESTAGE  lines 2097, 2107  ctx=[drive_file_id] scope=per-show
lib/sync/assetRecovery.ts::ASSET_RECOVERY_REVISION_DRIFT
  :546  ctx=[currentSnapshotRevisionId,snapshotRevisionId] scope=per-show
  :633  ctx=[currentSnapshotRevisionId,snapshotRevisionId] scope=per-show   <- identical to :546
  :656  ctx=[snapshotRevisionId] scope=per-show                            <- distinguishable
app/api/drive/webhook/route.ts::WEBHOOK_TOKEN_INVALID     lines 332, 348     ctx=[channel_id,reason] scope=global
```

Nine rows are genuinely indistinguishable by content. Under §3.4 they DECLINE and stay line-keyed. The alternative, an ordinal to separate them, is the rejected trade from §2, and this measurement is why the grammar is closed rather than one anchor kind longer.

## 6. Proving it

### 6.1 The P0 mutant: an edit above a row must keep the binding correct or red loudly

The test that matters is not "the key works". It is "the key cannot quietly be wrong". Executable, on a fixture tree:

1. Build a fixture component with three `data-testid` buttons and a registry row keyed to the third.
2. Insert a fourth button ABOVE all three, the ordinary refactor from §0's fence.
3. Assert the row still binds to the SAME element (same testid). A durable row holds no line to change (§3.1), so what is asserted is that the registry FILE is byte-identical before and after the insert. That is the churn claim stated executably.
4. Mutate the fixture so two elements carry the SAME testid. Assert `Ambiguous`, and assert the failure message names the row and both sites.
5. Delete the anchored element. Assert `Unresolved`, and assert the message names the row.

Step 3 is the churn repair. Steps 4 and 5 are the consequence bound. A resolver that passed 1 to 3 and picked a winner in step 4 would be the quiet-and-wrong cure, so step 4 fails the build if `resolve` ever returns `Bound` from a two-match set.

### 6.2 Enrolment precedes review

The resolver ships as an importable module with a referring Vitest suite, never a terminal script, so the source-mutation runner can overlay it. It is enrolled in `tests/mutation/source/registry.ts` and scored with `pnpm mutation:guards` BEFORE the first diff dispatch. The round-1 brief states the score, the unaccepted-survivor set, and the `OPERATORS:` tail. Class lock for `heavy:mutation` is requested from bl-orch before that run.

## 6.2 Dimensional Invariants

N/A — no UI surface. This spec ships no component, no layout, and no fixed-dimension parent. Its only artifacts are a resolver module under `lib/`, a census script under `scripts/`, and edits to registry files under `tests/`. The `.tsx` paths named throughout are the TARGETS the registries key on, never files this arc renders or modifies.

## 6.3 Transition Inventory

N/A — no UI surface, for the same reason. The resolver has three outcomes (§3.3), but they are return values, not visual states, so there is nothing to animate between.

impeccable-gate: N/A — no UI surface

## 7. Documented limits

1. **Nine content-identical emit sites cannot be keyed** (§5). They decline. Re-file trigger: a row among them is re-keyed twice more by unrelated edits, or an author gives two of them distinguishing context keys.
2. **A renamed `data-testid` reads as Unresolved, not as a move.** Correct under §3.2 (a changed anchor is a different site) but it means a testid rename costs a registry edit. That trade is deliberate: the alternative is guessing, and it is bounded because testids change far less often than lines above them.
3. **The grammar has no anchor for a bare interactive element** (§4.3, 40 rows). Widening it is the ratchet §0 forbids. Re-file trigger: the same declined row is re-keyed in three independent arcs.
4. **`postgrest-dml-lockdown` declines wholesale for want of a SQL anchor** (§4.2), while measurably churning: 35 re-keys, blast 11. This is the largest knowingly-unrepaired surface in the arc. Re-file trigger: a further wholesale re-key of that file, at which point the question is a SQL statement anchor as its own arc with its own hit/miss table, never an anchor kind bolted onto this grammar.
5. **Comment citations are out of scope** (§1). `spec:lint` owns them.

## 8. Done condition, as a number outside the process

Re-keys per arc, as the ledger row states. The next two arcs touching any migrated registry report zero pure re-key edits in their registry commits. Not "the guard pins what it claims", which would be unclosable.
