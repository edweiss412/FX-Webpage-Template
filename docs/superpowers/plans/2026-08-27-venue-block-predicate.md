# Plan — venue-block predicate: one shared definition

**Spec:** `docs/superpowers/specs/parser/2026-08-27-venue-block-predicate-design.md` (ratified; §§ referenced below are its).
**Branch:** `fix/typo-v4-venue-shape`, worktree `FX-worktrees/typov4`, base `origin/main` at `44b0d74b1`.
**Closes:** `BL-TYPO-NORMALIZED-V4-VENUE-SHAPE`.
impeccable-gate: N/A — no UI surface

---

## 0. Pre-draft verification, run rather than described

Every claim a task below rests on, checked against the live tree at `44b0d74b1` before this plan was written.

### 0.1 Line-shift budget for the mutation registry (the trap this plan is designed around)

`fieldNearMiss` is an enrolled mutation surface (`tests/mutation/source/registry.ts:2473-2504`) whose two `accepted` rows are keyed BY LINE:

```
statement-removal:161:11:break;>(removed)
relational-boundary:156:27:>>>=
```

Both sites are in `findMatch`, below the import block this plan edits. An added import line shifts both keys, and the gate then reports two stale rows PLUS two unaccepted survivors.

**The edit is therefore designed to be line-neutral, not re-keyed.** Live import block, `lib/parser/fieldNearMiss.ts:28-32`:

```ts
import {
  EVENT_SECTION_HEADER_TOKENS,
  SECTION_HEADER_TOKEN_SETS,
  VENUE_SECTION_HEADER_TOKENS,     // <- line 31, the only use besides :217
} from "./sectionHeaderTokens";
```

Task 1 removes line 31 (`VENUE_SECTION_HEADER_TOKENS` has exactly two occurrences in the file, `lib/parser/fieldNearMiss.ts:31` and `lib/parser/fieldNearMiss.ts:217`, both retired) and adds one line, `import { isVenueBlockOpener } from "./blocks/venue";`. **Net delta 0**, so `lib/parser/fieldNearMiss.ts:156` and `lib/parser/fieldNearMiss.ts:161` keep their content and both keys stay valid. Task 1's GREEN step verifies this mechanically before committing:

```
sed -n '156p;161p' lib/parser/fieldNearMiss.ts
# must still print:  if (candTokens.size > entry.tokens.size) continue; // subset OR equal
#                        break;
```

No cycle is introduced: `sectionHeaderTokens.ts:22` already imports from `./blocks/venue`, and `venue.ts` does not import `fieldNearMiss`.

`venue.ts` is NOT enrolled (nor is `unknownFieldAnchors.ts` or `catalog.ts`), so line growth there is free. The predicate needs `resolveAlias` (`venue.ts:2`) and `matchesSectionHeader` (`venue.ts:6`), both already imported, plus `normalizeHeader` from `@/lib/parser/knownSections`, which is ONE new import in `venue.ts`. No cycle: `knownSections.ts` has no imports at all (verified at plan time), and the sibling `lib/parser/blocks/_sectionHeaderMatch.ts:2` already imports it exactly this way.

### 0.2 Registry count reconciliation, run at plan time

```
$ node --import tsx .probe/registry-recon.ts
WARNING_CARD_COPY_CODES: 47
EXPECTED_TRIGGER_CONTEXT keys: 47
EXPECTED_TITLE_CHANGES keys: 7
EXPECTED_HELPFUL_CONTEXT keys: 47
TYPO_NORMALIZED already a member? false

$ node --import tsx .probe/numeric-sweep.ts | head -1
CARD_SURFACED_LOG_ONLY size: 3 FIELD_UNREADABLE, SECTION_HEADER_NO_FIELDS, UNKNOWN_SECTION_HEADER
```

Task 4 moves exactly these five counts, each by one:

| registry | before | after |
| --- | --- | --- |
| `CARD_SURFACED_LOG_ONLY` | 3 | 4 |
| `WARNING_CARD_COPY_CODES` | 47 | 48 |
| `EXPECTED_TRIGGER_CONTEXT` | 47 | 48 |
| `EXPECTED_TITLE_CHANGES` | 7 | 8 |
| `EXPECTED_HELPFUL_CONTEXT` | 47 | 48 |

`EXPECTED_TITLE_CHANGES` moves because `TYPO_NORMALIZED`'s title goes from null to authored, and only codes listed there are byte-compared — a title absent from it is governed by no live check (the registry's own comment at `tests/messages/warningCardCopyRegistry.ts:134-138` records exactly that hole being closed for `UNKNOWN_FIELD`).

### 0.3 The authored copy, checked against the live gates before it enters a task

```
$ node --import tsx .probe/copy-check.ts
title: len=30 capOk=true banned=none
helpfulContext: len=229 capOk=true banned=none
triggerContext: len=69 capOk=true banned=none
ALL COPY GATES PASS
```

Run against the banned-vocabulary regex copied verbatim from `tests/messages/_metaWarningCardCopy.test.ts:42-47` and the caps at `tests/messages/_metaWarningCardCopy.test.ts:53-79` (`helpfulContext` ≤ 300, `triggerContext` ≤ 160, `title` non-empty).

### 0.4 Meta-test inventory

**Creates:** none.
**Extends:** `tests/messages/warningCardCopyRegistry.ts` (four registry arrays, Task 4) and `lib/messages/cardSurfacedLogOnly.ts` (the carve-out set read by `tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts:36-43`). Both are existing registries gaining one row; neither is a new structural guard.
**Declared N/A, with reason:** Supabase call-boundary contract (`tests/auth/_metaInfraContract.test.ts`) — no Supabase client call is added or changed. Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no `pg_advisory*` call is touched. Sentinel hiding, `admin_alerts` catalog, no-inline-email-normalization — no tile, alert, or email surface in the diff.

### 0.5 Sections this plan declares N/A rather than omitting

**Layout-dimensions task:** N/A — no file under `app/` or `components/` is edited, so there is no fixed-dimension parent to assert with `getBoundingClientRect()`.
**Transition-audit task:** N/A — no `AnimatePresence`, ternary render, or conditional block is added or modified; spec §1.4.
**e2e harness readiness:** N/A — no Playwright test is attached.
**Advisory-lock holder topology:** N/A — §0.4.
**Mutation-family closure:** the surface is enrolled with `operators: [...OPERATOR_NAMES]` (all), so the closure set is the registry's full operator set applied to `lib/parser/fieldNearMiss.ts`, scored in Task 5. A reviewer-proposed new family is admissible only with a live escaping mutant against the shipped code.

### 0.6 Declared-limit pins over the surfaces this plan moves

`lib/parser/fieldNearMiss.ts`'s deciding suites are `tests/parser/fieldNearMiss.test.ts` and `tests/parser/fieldNearMissBaseline.test.ts`. The zero this plan is closest to invalidating is AC-N8's corpus `TYPO_NORMALIZED` census of 0. **It is deliberately retained, not retired:** spec §2.2 chose predicate A precisely because it holds that census at 0 (measured: A adds 7 tables, 0 of which carry a typo alias). Task 2's regen step is the executable confirmation. Predicate B would have moved it 0 → 6, which is why B was rejected rather than adopted with a re-pin.

### 0.7 Acceptance criteria this plan discharges

Restated from the spec so every `ac=` id resolves in this document, and so a reader sees which task owns which criterion. The spec's §7 is normative; this is the index.

| id | criterion, in one line | task |
| --- | --- | --- |
| AC-V1 | a typo alias in a v4 `VENUE NAME` table emits exactly one `TYPO_NORMALIZED` | 1 |
| AC-V2 | one predicate, two callers; `SECTION_HEADER_TOKENS` still `["VENUE"]` | 1 |
| AC-V3 | corpus `TYPO_NORMALIZED` census 0 before and 0 after | 2 |
| AC-V4 | the two swap suites green UNCHANGED | 2 |
| AC-V5 | the 65-row baseline does not move; `EXPECTED_TOTAL` stays 65 | 2 |
| AC-V6 | the four old-direction pins re-derived, not deleted or folded to constants | 2 |
| AC-V7 | a REAL near-miss (`Diagrams?`) in a v4 venue table resolves to its own cell | 3 |
| AC-V8 | Doug reads catalog copy, not an internal key; carve-out 3 to 4 members | 4 |
| AC-V9 | `fieldNearMiss` scored at the shipping head, floor 0.95, 0 unaccepted survivors | 5 |
| AC-V10 | no UI surface touched; invariant 8 marker is N/A | all |
| AC-V11 | `CARD_SURFACED_LOG_ONLY` is asserted a subset of `WARNING_CARD_COPY_CODES` | 4 |

---

## 1. Tasks

<!-- tasks: depth=2 red-contract -->

## Task 1 — one predicate, two callers, and the v4 witness

<!-- task: red=`pnpm exec vitest run tests/parser/fieldNearMissBaseline.test.ts` red-state=authored red-target=`lib/parser/blocks/venue.ts:110` why=`the gate calls matchesSectionHeader against SECTION_HEADER_TOKENS, which is whole-cell equality, so a VENUE NAME opener is false and the new v4 witness finds zero TYPO_NORMALIZED where it asserts one` ac=AC-V1,AC-V2 -->

**What is red and why.** The new witness asserts exactly one `TYPO_NORMALIZED` for a typo-alias row inside a `VENUE NAME`-opened table. On the live tree `venue.ts:110` evaluates `matchesSectionHeader("VENUE NAME", ["VENUE"])`, which is `false` because `matchesSectionHeader` is whole-cell equality after `normalizeHeader` (`lib/parser/blocks/_sectionHeaderMatch.ts:44-47`). The emission at `venue.ts:113-121` is guarded by that flag, so the witness sees an empty array. The production line whose defect makes it fail is `lib/parser/blocks/venue.ts:110`.

**RED.** Add to `tests/parser/fieldNearMissBaseline.test.ts`, inside the existing `describe("TYPO_NORMALIZED after the venue-block-membership re-gate (AC-N8)")` block, beside the two v2 cases at `tests/parser/fieldNearMissBaseline.test.ts:273-307`, a third case in the SAME shape:

```ts
it("FIRES for a typo-alias row inside a v4 VENUE NAME-opened block", () => {
  // The v4 two-column shape is the CURRENT template (2026-03/04/05 all carry it and
  // carry no standalone VENUE cell). Both rows are real sheet text: the opener is the
  // shape at fixtures/shows/raw/2026-03-rpas-central-four-seasons.md:40, and
  // `Hotal Contact Info` is the corpus's own misspelling.
  const md = ["| VENUE NAME | Four Seasons Hotel Chicago |", "| Hotal Contact Info | Ashley M |"].join("\n");
  premiseHolds("the label really resolves through a TYPO alias", holdsTypoRow(md.split("\n")[1]!));
  premiseHolds("the opener is the v4 spelling, not the v2 one", !matchesSectionHeader("VENUE NAME", VENUE_SECTION_HEADER_TOKENS));
  const agg = newAggregator();
  parseVenue(md, "v4", agg);
  const typo = agg.warnings.filter((w) => w.code === "TYPO_NORMALIZED");
  expect(typo).toHaveLength(1);
  expect(typo[0]!.severity).toBe("info");
  expect(typo[0]!.blockRef?.kind).toBe("venue");
  expect(typo[0]!.rawSnippet).toBe("Hotal Contact Info");
});
```

Both premises execute unconditionally relative to what they guard (no `.each` callback). The second is the one that makes this case discriminating rather than a duplicate of the v2 witness: it proves the opener really is outside the old token set, so a green here can only come from the new predicate.

**Why the four-mutant procedure does NOT apply to this witness, stated rather than silently skipped.** The rule binds any test asserting "this string appears in this output". Task 4's copy assertions are exactly that and get all four. This one is a different shape: `rawSnippet === "Hotal Contact Info"` compares against a label the test itself writes into the input markdown, so it identifies WHICH row produced the warning rather than proving a string exists. Its discriminating power is carried by `toHaveLength(1)` under the second premise (that the opener is outside the old token set) — together those make the case fail on the live tree for the one reason the change exists to fix. Running four mutants against a value the test supplies end to end would prove only that the test controls its own input.

**Two imports this file does not yet have** (verified at plan time — `grep -n 'matchesSectionHeader\|VENUE_SECTION_HEADER_TOKENS' tests/parser/fieldNearMissBaseline.test.ts` returns nothing): add `matchesSectionHeader` from `@/lib/parser/blocks/_sectionHeaderMatch` and `VENUE_SECTION_HEADER_TOKENS` from `@/lib/parser/sectionHeaderTokens`. Both still exist after Task 1 — Task 1 removes only `fieldNearMiss.ts`'s use of the token set, not the export. `holdsTypoRow` is a hoisted function declaration at the bottom of the file and needs no import.

Observe red. Record the failure text in the commit.

**A second RED in the same task: the whitespace-parity cases.** Beside the witness, assert the predicate accepts the ordinary whitespace variants of the v4 opener, which the unwrapped arm rejects:

```ts
it.each([["double space", "VENUE  NAME"], ["tab", "VENUE\tNAME"], ["non-breaking space", "VENUE\u00a0NAME"]])(   // escape, never a literal
  "FIRES for a typo-alias row under an ordinary %s variant of the v4 opener",
  (_label, opener) => { /* … exactly one TYPO_NORMALIZED, blockRef.kind === "venue" … */ },
);
```

**Write the non-breaking space as `\u00a0`, never as a literal character.** A literal nbsp is invisible in the source, survives no review, and a formatter or an editor's whitespace normalisation silently turns it into an ordinary space — at which point the case still passes and proves nothing, which is exactly the tautology shape the anti-tautology rule exists to catch. The premise below is what makes that failure loud.

**Premise placement.** A `premise` inside an `it.each` callback is unreachable when the case list is empty — the documented fifth shape of vacuous premise. So the non-vacuity check goes in a plain `it` BESIDE the `.each`: assert the case list is non-empty, and assert each variant really differs from the canonical `"VENUE NAME"` spelling, so a green cannot come from three copies of the already-passing string.

Observe red. Record the failure text in the commit.

**GREEN.**

1. `lib/parser/blocks/venue.ts`, immediately after `SECTION_HEADER_TOKENS` at `lib/parser/blocks/venue.ts:8`, export the predicate with the comment that ratifies it (spec §2.3). Both arms content-keyed on the opener text, and **both normalized through `normalizeHeader`** — `matchesSectionHeader` does it internally, arm 2 does it explicitly, so the two arms cannot disagree about what counts as the same string. It stops at `normalizeHeader` and does NOT add `decodeEntities`: arm 1 rejects the `&#10;` form, so decoding would make arm 2 strictly more permissive and reopen the asymmetry in the other direction (spec §2.3's parity table, §9's limit).
2. `venue.ts:110` calls it: `const inVenueBlock = isVenueBlockOpener(opener);`
3. `lib/parser/fieldNearMiss.ts:217` calls it: `if (isVenueBlockOpener(opener)) return "venue";`
4. The line-neutral import swap of §0.1.

**Verify before committing:**

**If either line's content has MOVED, the swap was not line-neutral.** Re-key the two `accepted` rows in `tests/mutation/source/registry.ts` to their new line numbers IN THIS COMMIT and say so in the message. Do not defer it: the alternative surfaces much later as two stale rows plus two unaccepted survivors in a score run, which reads as a guard regression rather than as a line shift.

```
sed -n '156p;161p' lib/parser/fieldNearMiss.ts        # mutation keys still valid (§0.1)
grep -n 'SECTION_HEADER_TOKENS = ' lib/parser/blocks/venue.ts   # still ["VENUE"] (AC-V2)
grep -rn 'VENUE_SECTION_HEADER_TOKENS' lib/parser/fieldNearMiss.ts   # zero hits
pnpm exec vitest run tests/parser/fieldNearMissBaseline.test.ts tests/parser/fieldNearMiss.test.ts
```

**Ratified text, IN THIS COMMIT (invariant 7).** A separate task for this would contradict the invariant it serves: the text lands with the code it describes, not after it. Two of the three texts belong to this task; the scanner's comment belongs to Task 3 (the anchor widening) and is written there.

1. `lib/parser/blocks/venue.ts:99-109` — currently ratifies the v4 silence as "the ratified outcome". Becomes the shared predicate, both callers named, the v4 shape firing, and the parity rule of spec §2.3.
2. `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md:37` (§2.1), `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md:49-55` (§2.2) and `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md:96` (AC-N8) — the venue block re-stated as `isVenueBlockOpener`, this arc's spec cited. Same file `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md:150` (§9 limits) — the entry that FILED this row becomes a closed pointer to this spec and the archived row.

A comment that survives its own repair is the next reviewer's finding.

**Commit:** `feat(parser): one venue-block predicate, so a v4 typo stops being silent`

## Task 2 — re-derive every pin of the old direction

<!-- task: red=`pnpm exec vitest run tests/parser/blocks/venue.test.ts tests/parser/warnings.test.ts` red-state=authored red-target=`lib/parser/blocks/venue.ts:110` why=`after Task 1 re-points that gate at the shared predicate, the 8453-case generator's expectation is still derived from the old token set, so it contradicts the parser on every VENUE NAME anchor row and reds` ac=AC-V3,AC-V4,AC-V5,AC-V6 -->

**What is red and why, and why it is `authored` rather than `live`.** The command passes on the tree as it stands TODAY, so declaring it `live` would be a plan defect — and is one the lint catches: `spec:lint --exec-red` runs every `red-state=live` command and reported `RED_ALREADY_GREEN` on this exact marker when it was first written that way. The red is real but it is CAUSED BY TASK 1, not by the current tree and not by a case this task authors, so the marker names the production line that creates it (`lib/parser/blocks/venue.ts:110`) and the observed-red lands in this task's RED step, after Task 1's commit. `tests/parser/blocks/venue.test.ts:426-434` derives `opensVenueBlock` from `matchesSectionHeader(...)` against the old token set; its own comment at `tests/parser/blocks/venue.test.ts:415-424` says the anchor rows open v4 tables and therefore pin the SILENT direction, and that "re-widening the gate reds all 8453 cases instead of passing." Task 1 re-widens the gate. That is by design: the generator was authored to fail loudly here rather than to pass quietly.

**The class, swept once rather than dripped.** Four sites pin the old direction. All four are repaired in this task:

1. `tests/parser/blocks/venue.test.ts:426-434` — switch the derivation from `matchesSectionHeader(col0, VENUE_SECTION_HEADER_TOKENS)` to `isVenueBlockOpener(col0)`. **Derive, do not fold to a constant.** The generator then pins the FIRING direction on the `VENUE NAME` anchor row, from the same 8453 cases. Rewrite the `tests/parser/blocks/venue.test.ts:415-424` comment to what is now true.

   **State the generator's limit in that comment rather than overclaiming it.** Only ONE of the four registered typo aliases is venue-scoped (`hotal contact info` -> `venue.contact_info`; `diagrams`, `virtaul audience` and `goosneck` all resolve to `details.*`, measured at plan time). So the `LOADING DOCK` arm carries no typo alias and its silence holds whatever the predicate says: it is a NON-REGRESSION check, not a discriminating one. The discriminating silence witness is the byte-identical `| HOTEL |` case at `tests/parser/fieldNearMissBaseline.test.ts:294-307` — same row, same parser, same position, only the opener differs. The comment says which arm does which job, so the next reader does not mistake exhaustiveness for discrimination.
2. `tests/parser/warnings.test.ts:168-207` — the comment at `tests/parser/warnings.test.ts:171-174` asserts a v4 typo row "is deliberately silent". Rewrite it, and add the v4 twin beside the existing v2 positive.
3. `tests/parser/fieldNearMissBaseline.test.ts` AC-N8 census block `tests/parser/fieldNearMissBaseline.test.ts:248-271` — unchanged in expectation (still 0) but its comment names the v2 shape as the only firing one; correct it.
4. `lib/parser/blocks/venue.ts:99-109` — handled in Task 1, in the same commit as the code it describes (invariant 7), cross-referenced here so the sweep reads as complete rather than partial.

**Anti-tautology.** The generator's expectation stays DERIVED from the document under test. Folding it to `true`/`false` would make it pass for the wrong reason and would not red if the predicate regressed — which is precisely the property its own comment claims for it.

**Verify:** `pnpm exec vitest run tests/parser/blocks/venue.test.ts tests/parser/warnings.test.ts tests/parser/fieldNearMissBaseline.test.ts`

### Step: regenerate the 65-row baseline and report the moved-row count (AC-V3, AC-V5)

Folded into this task rather than standing alone, because it has **no honest RED**: spec §2.2 measured `baselineRowsMoved = 0` for predicate A, and the baseline's kind census carries no block that normalizes to a `venue.*` alias, so the regen is expected to be a no-op. A test asserting "nothing changed" is a PIN, not a red, and manufacturing a failing state for it would mean breaking the tree to watch it break.

**Steps.**
1. `UPDATE_NEAR_MISS_BASELINE=1 pnpm exec vitest run tests/parser/fieldNearMissBaseline.test.ts`
2. `git diff --stat tests/parser/__fixtures__/fieldNearMiss.baseline.json` — expected empty.
3. Row-level count: `git diff --numstat` on that path, plus a diff of the parsed `rows` arrays if `--stat` is non-empty.
4. `EXPECTED_TOTAL` stays 65 (`tests/parser/fieldNearMissBaseline.test.ts:41`).
**Stop condition, per Eric's condition 1.** If the diff is NOT empty, do not commit. Report to bl-orch with the moved rows enumerated, and wait. A non-zero count contradicts spec §2.2's measurement and means either the predicate or the measurement is wrong; either way it is not a number to absorb quietly.
**Commit:** only if the regen is a no-op — folded into Task 2's commit rather than an empty commit of its own, with the `--stat` output pasted in the message.

**Commit:** `test(parser): re-derive the venue-gate pins against the shared predicate`

## Task 3 — teach the anchor scanner the v4 opener

<!-- task: red=`pnpm exec vitest run tests/drive/unknownFieldAnchors.test.ts` red-state=authored red-target=`lib/drive/unknownFieldAnchors.ts:41` why=`the venue BLOCKS row is /^VENUE$/i, so a VENUE NAME-headed workbook matches no header, extractUnknownFieldAnchors returns zero anchors of any kind, and the new by-resolution case asserting a non-null cell fails` ac=AC-V7 -->

**What is red and why.** Probed on `44b0d74b1`: a `VENUE NAME`-headed workbook yields **0** anchors of ANY kind and `resolveUnknownFieldCell` returns null under both `kind: "venue"` and `kind: "venue name"`. The production line is `lib/drive/unknownFieldAnchors.ts:41`, whose regex `/^VENUE$/i` never matches the v4 header.

**RED.** Two cases in `tests/drive/unknownFieldAnchors.test.ts`, both by RESOLUTION (never by reading `kind`), in the shape of `tests/parser/fieldNearMissBaseline.test.ts:434-454`. Both use that file's existing `buildInfoWorkbook(rows: (string | null)[][])` helper (`tests/drive/unknownFieldAnchors.test.ts:11-20`), which wraps `XLSX.utils.aoa_to_sheet` and returns `{ buffer, gids }` — verified at plan time, so neither case adds a helper or an import:

- **The repair case.** A workbook built via the file's existing `buildInfoWorkbook` helper, whose venue table opens on `VENUE NAME`. **The witness row is `Diagrams?`, NOT `Venu Notes`** — measured at plan time, `Venu Notes` is RECOVERED by `parseVenue`'s scoped fuzzy path (`FIELD_LABEL_AUTOCORRECTED`, `raw_unrecognized=[]`), so it never becomes an `UNKNOWN_FIELD` and an anchor assertion over it would pass without exercising the routing key this arc changes. `Diagrams?` yields a real `UNKNOWN_FIELD(kind="venue name")` — literally the value predicate A moves to `"venue"`.

  Two premises, both before the resolution assertion: that the scan produced at least one venue anchor (a null resolution over an empty anchor set is null for the wrong reason), and — through `parseSheet` on the same two rows — that the witness really is an `UNKNOWN_FIELD` rather than a consumed row. Then assert `resolveUnknownFieldCell(anchors, "venue", "Diagrams?", <value>)` is the expected cell. Measured before and after the widening: 0 anchors and null, then 2 anchors and `A3`; v2 unchanged at 2 and `A3`.
- **The false-early guard**, modelled on the existing exact-header case at `tests/drive/unknownFieldAnchors.test.ts:119-132`, which proves a `Details Notes` field row above the real `DETAILS` header is not mistaken for it. A workbook carrying BOTH a bare `VENUE` block and a later `VENUE NAME` reference table, asserting the scan selects the bare `VENUE` row — so the widening cannot silently re-point v2 sheets at a reference table.

**GREEN.** `lib/drive/unknownFieldAnchors.ts:41`:

```
{ kind: "venue", header: /^VENUE$/i }   ->   { kind: "venue", header: /^VENUE(\s+NAME)?$/i }
```

Verified by throwaway patch on `44b0d74b1`: v4 goes 0 anchors → 2 and null → `A3`; v2 unchanged at 2 anchors and `A3`.

**Comment, in the same commit.** The design comment at `lib/drive/unknownFieldAnchors.ts:16-39` argues exact-anchored headers because a false-early match can yield a wrong cell. Widening one header needs its reason recorded there: the scan takes the FIRST match and breaks, no corpus fixture has `VENUE NAME` preceding `VENUE` (the only fixture with both, 2025-10-fixed-income, has them 219 rows apart in that order), and a v2 header row's first non-blank cell is `VENUE` regardless. Also record the over-inclusion of §4.3 — `TERMINATORS` carries `VENUE` and not `VENUE NAME`, deliberately, because the collision rule already bounds the consequence to null.

**`TERMINATORS` is NOT widened.** Spec §1.1 fences this.

**Commit:** `fix(drive): anchor a v4 VENUE NAME venue table, so its near-miss rows can open in the sheet`

## Task 4 — operator copy for TYPO_NORMALIZED across eight sites

<!-- task: red=`pnpm exec vitest run tests/messages/_metaWarningCardCopy.test.ts tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts` red-state=authored red-target=`lib/messages/catalog.ts:2043` why=`every operator-facing field on the TYPO_NORMALIZED catalog row is null, so adding the code to WARNING_CARD_COPY_CODES makes the registry suite demand a non-empty title, helpfulContext and triggerContext it will not find` ac=AC-V8,AC-V11 -->

**What is red and why.** `lib/messages/catalog.ts:2037-2047` has `helpfulContext: null`, `title: null`, and no `triggerContext` key at all. The moment `TYPO_NORMALIZED` joins `WARNING_CARD_COPY_CODES`, `_metaWarningCardCopy.test.ts:53-79` demands all three non-empty and capped. The production line is `lib/messages/catalog.ts:2043` (`helpfulContext: null`).

**The eight sites, one class, one PR** (spec §5.3 and §5.4). Six were the original inventory; site 7 is the carve-out assertion round 3 showed was missing, and site 8 is the dependent-claim sweep round 2 showed was omitted. Sites 2, 3 and 4 land in ONE commit — invariant 5 lockstep, because `x1-catalog-parity` (`tests/cross-cutting/codes.test.ts:69-92`) compares the runtime catalog against the §12.4 prose directly:

1. `lib/messages/cardSurfacedLogOnly.ts:9-13` — add `TYPO_NORMALIZED` (3 → 4).
2. `lib/messages/catalog.ts:2037-2047` — `title`, `helpfulContext`, `triggerContext`, modelled on `SECTION_HEADER_NO_FIELDS` at `lib/messages/catalog.ts:2052-2064`. `dougFacing`, `crewFacing`, `longExplanation`, `helpHref` stay null.
3. `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` YAML appendix — a `TYPO_NORMALIZED: "…"` line modelled on `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3270`. The §12.4 row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2947` keeps its "(admin log only …)" Doug cell so `scripts/extract-spec-codes.ts:173-180` keeps `dougFacing` null.
4. `pnpm gen:spec-codes` — regenerate `lib/messages/__generated__/spec-codes.ts`, SAME commit as 2 and 3.
5. `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:144` §4.2 table — a new row (byte-compared by `_metaWarningCardCopy.test.ts:88-92`).
6. `tests/messages/warningCardCopyRegistry.ts` — the four arrays of §0.2.
7. **The carve-out implication, as an assertion (AC-V11).** In `tests/messages/_metaWarningCardCopy.test.ts`, assert `CARD_SURFACED_LOG_ONLY` is a subset of `WARNING_CARD_COPY_CODES`. Nothing enforced this before — probed, `CARD_SURFACED_LOG_ONLY` is imported by four test modules and by none of them for this, so all three current members are registry members by coincidence. Without it a contributor can drop this code from the registry while leaving it card-surfaced, and its copy escapes the banned-vocabulary regex, the caps and the byte-fidelity freeze while still rendering to Doug.

   **One new import.** Verified at plan time: `tests/messages/_metaWarningCardCopy.test.ts` does NOT import `CARD_SURFACED_LOG_ONLY` today (that absence is the finding), so the task adds `import { CARD_SURFACED_LOG_ONLY } from "@/lib/messages/cardSurfacedLogOnly";` beside its existing `@/lib/messages/catalog` import. It already imports `premise` from `../_shared/premise`, so the non-vacuity guard needs nothing new.

   **Its RED is constructed, not waited for.** The assertion is green the moment it is written, which is the shape the anti-tautology rule rejects, so the task proves it discriminates by temporarily removing one member from the registry and observing the failure, then restoring it. Record that observation in the commit. (This is the structural-defense calibration rule taken at first occurrence rather than after a recurrence.)
8. **The copy-restore spec's DEPENDENT COUNT CLAIMS** (spec §5.4). Adding a row to that registry falsifies every prose claim keyed to its size, and an enumerated list of them re-opens the moment someone adds an eighth site, so the cover is the rerunnable scan `.probe/copy-claim-sweep`. Eleven confirmed dependents, each cited in full: `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:44` (47 codes), `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:53` (the 47 below), `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:61` (parser emitters 34, plus its alphabetical list), `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:65` (All 47 verified; Three carry all-null copy), `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:104` (13 of the 47), `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:105` (47 triggerContext strings; seven changed titles), `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:167` (§4.2's last row number), `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:169` (title-exception roster — APPEND a dated `UPDATE 2026-08-27` line, the form that line already uses twice), `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:171` (provenance chain — EXTEND with the next link, never rewrite: it records how the table grew), `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:177` (per-code emitter census); plus `tests/messages/_metaWarningCardCopy.test.ts:10`.

   **Rerun the scan after the edit; a surviving `47` in a claim position is a miss.** The scan also surfaces row numbers, clock times and section refs that merely contain the digits — those are not claims. **One claim deliberately does NOT move:** `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:104`'s corpus oracle ranges over WARN-severity codes, and `TYPO_NORMALIZED` is info, so only that bullet's parenthetical count changes, not its contract.

**The copy** (validated in §0.3):

- title: `Label we matched to a known field`
- helpfulContext: `A row's label in your sheet matched one of the alternate spellings we keep for a field, so it wasn't listed as a row we didn't recognize. This is a record for us; there is nothing for you to fix.`
- triggerContext: `Appears when a row's label matches one of the alternate spellings we keep for a field.`

**It does not say "misspelled".** `TYPO_ALIASES` includes `"diagrams"`, annotated in place as a capitalisation case rather than a user typo, and `resolveAliasFull` lowercases before testing membership — so the correct spelling `Diagrams` emits this code too. Copy calling that a misspelling is false on the most ordinary casing of one of the four aliases.

**It claims RECOGNITION and nothing more, because that is all the parser does.** Probed across all four registered typo aliases in a v4 venue table: the row's value appears NOWHERE in the parse result, `show.event_details` is `{}`, `contacts` is `[]`. `venue.contact_info` is a field `parseVenue` never writes. The one thing alias resolution genuinely buys is that the row is not reported as unrecognized (`raw_unrecognized` empty), and that is exactly what the copy says.

**It invites no correction, and that is forced rather than chosen.** `INFO_CODE_ACTIONABILITY` states the criterion in its own comments (`lib/admin/infoCodeActionability.ts:13-16`): the actionable row is actionable *because* "Catalog copy directs a sheet edit", and this code is not-actionable *because* "The parser already fixed it; nothing for the operator to do". Copy that directs an edit is exactly what would reclassify the code.

It promises no action, because `lib/admin/infoCodeActionability.ts:16` says there is none. **And it asserts nothing about the crew page, deliberately.** An earlier draft said "the row still shows on the crew page"; probed across all four registered typo aliases under a v4 venue table, every one yields empty contacts and no event output, and `venue.contact_info` is a field `parseVenue` never writes. Clearing the banned-word regex and the caps is necessary and NOT sufficient — a sentence can pass every mechanical gate and still tell Doug something untrue, and only a probe against the rendered payload catches that.

**The rendered assertion (AC-V8).** It goes in `tests/components/admin/sheetWarningsPanel.test.tsx`, NOT by editing any component. That file is the right home and needs no new wiring: verified at plan time, it already carries the `// @vitest-environment jsdom` pragma and already imports `notePopoverParts`, `reviewWarningTitle`, `MESSAGE_CATALOG` and `ParseWarning` (`tests/components/admin/sheetWarningsPanel.test.tsx:1`, `tests/components/admin/sheetWarningsPanel.test.tsx:16-20`). Derive the expected title from `MESSAGE_CATALOG` (already imported) rather than adding a `messageFor` import:

```ts
const w = { code: "TYPO_NORMALIZED", severity: "info",
            message: "Typo alias 'Hotal Contact Info' normalized to canonical 'venue.contact_info'",
            blockRef: { kind: "venue" }, rawSnippet: "Hotal Contact Info", sourceCell: null } as ParseWarning;
// Derived from the catalog, never restated:
expect(reviewWarningTitle(w)).toBe(MESSAGE_CATALOG.TYPO_NORMALIZED.title);
expect(reviewWarningTitle(w)).not.toContain("venue.contact_info");
expect(notePopoverParts(w).copy).not.toBeNull();
```

**Four pre-dispatch mutants, run and recorded in the commit** (these assertions are string-presence guards):

(a) catalog `title` emptied → the equality must fail, not pass against an empty fallback.
(b) catalog `title` plus an appended suffix → must fail.
(c) the copy present but not live — `title` moved onto a different code's row → must fail.
(d) each discriminating parameter varied: `w.code` changed to a code with a null title → `reviewWarningTitle` must fall through to the message path, proving the assertion reads the catalog rather than any string.

**Plus the four SEMANTIC classes the spec rounds caught, which no mechanical gate sees.** All four spec-review rounds landed on copy that cleared the banned-vocabulary regex and the caps and was still wrong: publication (r1), an action invitation contradicting not-actionable (r2), storage (r3), and a misspelling claim false for `Diagrams` (r4). `.probe/copy-check5` now asserts the absence of all four classes alongside the mechanical gates, and it runs before the copy enters the catalog. Clearing the regex is necessary and not sufficient.

**Do NOT edit `components/admin/NoteWarningCard.tsx`.** The copy reaches it through the catalog; touching it makes invariant 8's dual gate mandatory (spec §1.3).

**Commits:** `feat(messages): give TYPO_NORMALIZED operator copy` (sites 2+3+4 lockstep), then `test(messages): pin the TYPO_NORMALIZED card copy` (1+5+6 and the rendered assertion).

<!-- tasks: end -->

## Task 5 — score fieldNearMiss at the shipping head

**No RED, and that is the honest declaration.** This is a verification step, not a red-green cycle: the score either holds at the floor or it does not, and there is no failing state to author first. It sits OUTSIDE the plan's `red-contract` region for that reason.

**Class lock first.** Message bl-orch at `wP:p1A` with the surface name and expected duration, wait for the take, then run, then announce the release. `pnpm heavy:mutation`, never plain `pnpm heavy` — the class is a single-slot admission taken beside an ordinary heavy slot, and `pnpm heavy --class mutation` does not work (the `heavy` script already ends in its own `--`, so the flag is swallowed as the command).

**Scope: this arc scores TWO surfaces, not all 54.** `pnpm mutation:guards` runs every `guardSurfaces.shard*` file plus the gates — 54 enrolled surfaces, whose declared boot costs alone sum to 2.4 minutes before a single mutant runs, and the block's own measured datapoint is ~93s for ONE surface. Quoting that as the class-lock duration would be a large and unnecessary ask.

`scripts/mutation-score-surfaces.ts` exists for exactly this and is the documented path (its header, `scripts/mutation-score-surfaces.ts:15-20`). It enters through `runSurface` + `evaluateGate` — the gate's own conditions decide pass or fail, so a scoped run is not a re-implemented substitute — and it prints both the score with its survivors and the measured milliseconds per modelled boot. It needs no scoped-shard scratch file, so the `guardSurfaces.shardTMP*` hazard the repo's `.gitignore` documents does not arise here.

```
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy:mutation pnpm tsx \
  scripts/mutation-score-surfaces.ts fieldNearMiss rowScanOpener
```

Three parts of that line are load-bearing and none is decoration: `VITEST_INCLUDE_MUTATION_HARNESS=1`, because the mutation vitest project is opt-in and without it the run dies on "no projects matched" AFTER the queue wait; `heavy:mutation` rather than plain `pnpm heavy`, because only the former takes the single-slot mutation admission that serialises score runs against each other; and the surface ids rather than a shard file.

**Ask bl-orch for the lock with the scoped figure, not the full-run one.** Two surfaces, `fieldNearMiss` (`millisPerBoot: 2124`) and `rowScanOpener` (`millisPerBoot: 2441`), both declaring the same two suites. State the estimate as minutes and say it is an estimate; the run itself prints the measured rate, which goes into readiness.

Floor stays `0.95` (`registry.ts:2484`). The two accepted rows stay, re-keyed ONLY if §0.1's line-neutrality check failed. `rowScanOpener` (`registry.ts:2506-2532`, `sourcePath: lib/parser/blocks/_rowScan.ts`, `millisPerBoot: 2441`, floor `0.95`) declares the SAME two suites and is scored by the same run — verified at plan time. Task 1 does not edit `_rowScan.ts`, so its score is a regression check rather than a deliverable.

The round-1 diff brief then carries, on one line, verbatim:

```
GUARD SURFACE: fieldNearMiss, MUTATION SCORE: <killed>/<total>, 0 unaccepted survivors, OPERATORS: all
```

**Commit:** only if a registry row changed; otherwise the score is a readiness artifact, not a commit.

## Task 6 — archive the row, marker off in the PR's last commit

**No RED.** Archiving a row is bookkeeping, not a red-green cycle; it sits OUTSIDE the `red-contract` region. `tests/docs/_metaLedgerInProgress.test.ts` is still run as a gate — it is what makes a marker that outlives its branch fail — but it is green before and after, so declaring it as a red would be a manufactured one.

Archive `BL-TYPO-NORMALIZED-V4-VENUE-SHAPE` into `BACKLOG-archive.md` in the heading form of the newest entry, read at plan time from the newest archive entry:

```
## BL-<ID> — <one-line summary> — CLOSED 2026-08-27

**Status:** CLOSED 2026-08-27 · **Effort (as shipped):** S · **Shipped by:** `fix/typo-v4-venue-shape` · **Spec:** `docs/superpowers/specs/parser/2026-08-27-venue-block-predicate-design.md`
```

The entry records: the decision, its author and date (Eric, 2026-08-26 05:05); the predicate chosen with the §2.2 table; the moved-row count from Task 2's regen step; the rejected predicate's cost (B: corpus census 0 to 6, hotel-contact tables re-namespaced); the anchor disposition (absent before, repaired in Task 3); and the eight copy sites.

**The IN PROGRESS marker comes off in this same commit, and this is the PR's LAST commit before any merge.** A marker that merges into main names a branch the merge just deleted, and the origin-existence rule in `tests/docs/_metaLedgerInProgress.test.ts` then reds main until someone clears it.

**A `BACKLOG.md` merge conflict here is resolved by set arithmetic, never keep-both** — keep-both text resurrects an archived row. Open = main's open minus rows this branch archived; archive == exact union; assert zero rows both open and archived, zero lost; cut rows heading-to-any-next-heading.

**Commit:** `docs(backlog): archive BL-TYPO-NORMALIZED-V4-VENUE-SHAPE, and take the in-progress marker off`



---

## 2. Checklist

- [ ] Task 1 — the shared predicate, the v4 witness, the parity cases, and the ratified text it describes
- [ ] Task 2 — re-derive the old-direction pins; baseline regen with the moved-row count reported
- [ ] Task 3 — anchor scanner learns the v4 opener
- [ ] Task 4 — operator copy, eight sites (incl. the AC-V11 assertion and the dependent-claim sweep)
- [ ] Self-review
- [ ] **Adversarial review (cross-model)** — Codex, to APPROVE
- [ ] Task 5 — mutation score at the shipping head
- [ ] Whole-diff cross-model review to APPROVE
- [ ] CI: twelve required checks green on a non-stale base
- [ ] Task 6 — archive the row, marker off in the last commit
- [ ] READINESS to bl-orch at `wP:p1A`. **The arc never merges on its own.**

## 3. Order and why

Tasks 1 and 2 are one causal chain: the predicate lands with the ratified text it rewrites, then the pins that recorded its opposite are re-derived and the regenerated baseline confirms nothing moved. Task 3 is independent (it touches the scanner, not the parser) and could run in parallel, but it ships after so a bisect between them separates a parser regression from an anchor regression. Task 4 is independent of all three. There is no separate ratified-text task, deliberately: invariant 7 puts each text in the same commit as the code it describes, so a task that batched them at the end would violate the invariant it exists to serve. Task 5 needs the shipping head. Task 6 is last by construction — its commit is the PR's last, because the in-progress marker must not reach main.

## 4. Whole-tree green before every push

`pnpm heavy pnpm test` — the whole suite, not the task's file list. Necessary, not sufficient: a CI-only class remains, so real CI green is a separate gate. Never `git add -A`; stage by path. Never chain typecheck into a commit — `pnpm typecheck` is its own command, because vitest strips types and a green suite proves nothing about type errors.
