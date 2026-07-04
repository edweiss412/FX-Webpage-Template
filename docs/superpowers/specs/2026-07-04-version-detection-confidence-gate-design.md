# Version-Detection Confidence Gate — Design Spec

**Date:** 2026-07-04
**Author:** autonomous ship (Opus / Claude Code)
**Source:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/edge-case-preparedness-audit-2026-07-04.md` findings #1–#2 (Tier 1), recommendation #1 ("Version-detection confidence gate… the highest-leverage fix in the audit").
**Grounded against HEAD:** `fa3872d1` (worktree `feat/version-detection-confidence-gate`).

---

## 1. Problem

Template-version detection (`lib/parser/schema.ts:102` `detectVersion`) selects the field-extraction rules for the entire parse — the returned `"v1"|"v2"|"v4"` is threaded into every block parser (`lib/parser/index.ts:537-553`), each of which branches its extraction logic on it. Detection is fragile in two ways the audit flagged:

- **Finding #1 — v1 is a catch-all.** `detectVersion` returns `"v1"` for *any* markdown that "looks like a sheet" (contains one pipe-table row: `schema.ts:83-85,116`) once the v4/v2 markers miss. A novel template that Doug adopts, or a corrupted export, silently parses under v1 rules with zero signal.
- **Finding #2 — v4/v2 each hinge on ONE marker.** v4 requires only the `Contact Office` row (alias `client.contact_office`, `schema.ts:42`); v2 requires only the `venue.contact_info` alias (`schema.ts:48`). Worse, v4 sheets *also* satisfy the v2 requirement — `VENUE CONTACT INFO` resolves to `venue.contact_info` via `lib/parser/aliases.ts:27`. Detection only lands on v4 because v4 is checked first. **If Doug renames or drops `Contact Office`, a v4 sheet silently downgrades to v2** and every field is extracted with the wrong rules. No error, no warning — a plausible-looking wrong parse.

Both failures land in the audit's "quiet middle band": no admin alert, no hard error, at most a passive data-quality signal a human sees only if they open that show.

## 2. Goal

Replace single-literal / catch-all version detection with **multi-marker confidence scoring**. When the winning version is not clearly ahead — too few markers, or too close a margin — raise a distinct hard-flag `VERSION_AMBIGUOUS` and route the show to the existing human-review / retain-last-good machinery instead of silently applying a guessed version's rules.

Non-goals (explicitly deferred — see §10): pushing an admin alert on *first-seen* ambiguity (audit finding #14 = work item #4); a "new parse materially worse than last-good" comparator (audit finding #3 = work item #2); widening date/address/room regexes (item #6).

## 3. Resolved decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Emit `VERSION_AMBIGUOUS` as a parser hard-fail (Approach A), reusing the existing `MI-1` hard-error machinery** — not a new `pending_syncs` stage path. | The audit already credits "existing-show hard failure retains last-good + raises `PARSE_ERROR_LAST_GOOD`" as good behavior (audit §2). Reusing it means: existing shows retain last-good and get the existing admin alert; first-seen shows route to the onboarding wizard (`pending_ingestions`); zero new sync-routing surgery. hard_fail is the codebase's "don't trust this parse" contract and version-ambiguity is exactly that. (Alternative B — inject a `triggeredReviewItems` stage at `phase1.ts:345` — was rejected: more delicate sync-routing surface, and it does not retain last-good as cleanly.) |
| D2 | **Score only v2 and v4** (the positively-defined templates); **v1 is not positively scored.** A table-bearing sheet that clears neither v2 nor v4's confidence bar is `ambiguous`, not silent-v1. | v1 is defined purely by absence (`schema.ts:53`); the corpus contains **zero** v1 sheets (all 10 fixtures are v2/v4, 2024–2026); the sole v1-*shaped* fixture classifies v2 because it carries `Hotal Contact Info`. Eliminating silent auto-v1 *is* the audit's finding #1 goal. |
| D3 | **The ambiguous path returns a minimal stub mirroring MI-1** (`index.ts:494-522`) — it does *not* run the block parsers under a version we do not trust. | Fail-closed and identical to the proven MI-1 sibling. The `VERSION_AMBIGUOUS` hard-error *message* names the best-guess version and the per-version marker scores, which is the diagnostic the operator needs. (An earlier draft ran a best-guess parse to make it "approvable," but the hard_fail route never persists that parse for approval — `pending_ingestions` stores only `last_error_code`/message/warnings, and existing-show hard_fail retains last-good — so a best-guess parse would be computed and discarded. Minimal stub is simpler and honest.) See §7.1 for the (MI-1-identical) resolution path. |
| D4 | **`detectVersion` keeps its signature** `(markdown) => "v1"|"v2"|"v4"|null` as a thin best-guess wrapper; a new `classifyVersion` returns the richer verdict. | ~15 block-parser tests call `detectVersion` as a helper with `?? "v2"`/`?? "v4"` fallbacks (`tests/parser/*`). Preserving it avoids churn; `parseSheet` and the new tests consume `classifyVersion`. |
| D5 | **`VERSION_AMBIGUOUS` is a §12.4 catalog code of the same class as `MI-1..MI-5b`** (parser hard-fail staging reason written to `pending_ingestions.last_error_code`) — **not** an `AdminAlertCode`. | MI-1..5b are not admin alerts (`upsertAdminAlert.ts:3-37` union excludes them). Existing shows already get the `PARSE_ERROR_LAST_GOOD` *admin alert* via the shared hard_fail path; the specific reason travels in the error-code field. Adding a first-seen admin alert is finding #14 / item #4. |
| D6 | **Thresholds `MIN_ABS = 2`, `MIN_MARGIN = 2`, derived from fixture marker counts**, not hand-tuned. | Every v4 fixture scores 7-vs-0; every v2 fixture 4-vs-0 (§5). A 2/2 bar leaves 5+ markers of headroom on every real fixture (no false staging) while forcing a sheet to lose ≥4 discriminating markers before it flags. |
| D7 | **No DB migration, no new UI surface.** | The code is a new text value in the existing `pending_ingestions.last_error_code` column, rendered by existing surfaces via `messageFor()`. No `@theme`/component/`DESIGN.md` change → invariant 8 (impeccable dual-gate) does not apply. No schema change → no `validation-schema-parity` step. |

## 4. Architecture

Four layers, smallest-blast-radius first.

### 4.1 `lib/parser/schema.ts` — scoring core (new `classifyVersion`)

```ts
export type VersionVerdict =
  | { status: "confident"; version: "v1" | "v2" | "v4"; scores: VersionScores }
  | { status: "ambiguous"; bestGuess: "v1" | "v2" | "v4"; scores: VersionScores; reason: string }
  | { status: "not_a_sheet" };

export function classifyVersion(markdown: string): VersionVerdict;
```

Algorithm:
A private helper `legacyBestGuess(markdown, cellLabels): "v1"|"v2"|"v4"` holds today's priority-order alias match (v4 alias first, else v2 alias, else `"v1"`) — extracted verbatim from the current `detectVersion` body so behavior is identical. Both `classifyVersion` and the `detectVersion` wrapper call it; there is no circular reference.

`classifyVersion`:
1. If `!looksLikeSheet(markdown)` → `{ status: "not_a_sheet" }` (preserves today's `null` → MI-1 behavior).
2. Score each of v4 and v2: `score_V = count of V's markers present`. A marker is "present" iff it **equals the normalized text of a strict physical column-0 cell**. A new helper `extractLabelCells(markdown)`: for each table-row line (`trimmed.startsWith("|")` and not a separator row), take `trimmed.split("|")[1]` — the **first physical cell immediately after the leading pipe**, *without* skipping empties — then `trim → collapse internal whitespace → UPPERCASE`; **if that cell is empty, the row contributes no label.** A marker (stored pre-normalized) scores iff it is a member of the resulting set. Because it is the *first physical cell* (not "first non-empty cell"), a row like `| | CONTACT OFFICE |` — blank column 0, marker in a value/header cell — contributes **nothing** (Codex R4 HIGH). Value data (times, phones, names, header cells) lives in columns 1+, so it cannot inflate confidence (Codex R2/R3 HIGH). This is strictly more rigorous than today's alias detection, which resolves *every* cell.
   Markers are organized into **named blocks** per version (§5). For each version compute two numbers: `score_V` = total markers present, and `blocks_V` = the count of that version's **distinct blocks** with ≥1 marker present.
3. `top` = higher-`score` of {v4, v2}; `runnerUp` = the other. On a 0–0 tie, `top` is unspecified but its score is 0 (handled by step 4, which flags it ambiguous regardless).
4. **Confident** iff `score_top >= MIN_ABS` **and** `(score_top - score_runnerUp) >= MIN_MARGIN` **and** `blocks_top >= MIN_BLOCKS` → `{ status:"confident", version: top, scores }`. The **block-diversity clause** (`blocks_top >= MIN_BLOCKS`, i.e. ≥2 distinct blocks) is what stops two markers from a single generic block (e.g. `GS SET TIME` + `GS SETUP`, both pull-sheet-timing) from reading as confident — flat count + margin alone would pass that, silently applying the wrong version (Codex R6 HIGH).
5. Otherwise `{ status:"ambiguous", bestGuess: legacyBestGuess(...), scores, reason }` where `reason` names the scores and block counts (e.g. `"v4=1 v2=1 below margin"`, `"v2=2 but only 1 block"`, or `"v4=0 v2=0 no known markers"`).

`detectVersion` becomes:
```ts
export function detectVersion(markdown: string): "v1" | "v2" | "v4" | null {
  const v = classifyVersion(markdown);
  if (v.status === "not_a_sheet") return null;
  return v.status === "confident" ? v.version : v.bestGuess;
}
```
Because `legacyBestGuess` is the old match verbatim, `detectVersion`'s existing tests are unaffected.

### 4.2 `lib/parser/index.ts` — `parseSheet` integration

- `not_a_sheet` → **unchanged** MI-1 minimal-stub early return (`index.ts:486-523`).
- `ambiguous` → push `{ code: "VERSION_AMBIGUOUS", message }` to `hardErrors` and **return a minimal stub** with the same shape as the MI-1 path (empty crew/rooms/etc.; `template_version` set to `verdict.bestGuess`, a valid enum value, for diagnostics). The block parsers do **not** run. This mirrors MI-1 exactly (D3).
- `confident` → parse normally with `verdict.version` (today's behavior).

`message` **must** name the best guess **and both marker scores** (`v4=…, v2=…`) — this is the operator's evidence for §7.1 recovery and it is the string persisted to `last_error_message`/`last_sync_error` (§4.3). Canonical form: `"Could not confidently determine sheet template version (best guess v4; scores v4=1, v2=1). Fix the sheet's version markers so it is recognizable again."` The scores are formatted from the `verdict.scores` object so the test can assert both are present.

(Because the ambiguous stub is empty, `runInvariants` will also raise MI-2..MI-5 on it — exactly as it already does for the MI-1 stub. §4.3 orders the `VERSION_AMBIGUOUS` check ahead of MI-2 so it is `failedCodes[0]`, the code that routes and renders.)

### 4.3 `lib/parser/invariants.ts` — `runInvariants` routing (the load-bearing cron hook)

The cron path derives its outcome solely from `runInvariants(prior, parseResult).failedCodes[0]` (`phase1.ts:286-289`); it does **not** inspect `hardErrors.length` generically, and the MI-1 gate matches only `code === "MI-1_VERSION_DETECTION_FAILED"` (`invariants.ts:111`). So a new dedicated check is required or `VERSION_AMBIGUOUS` would not hard-fail in production cron.

Add, immediately after the MI-1 block (so `VERSION_AMBIGUOUS` sorts to `failedCodes[0]` ahead of the MI-2..5 codes the empty ambiguous stub also trips — exactly as the MI-1 stub does today). **Forward the parser's original hardError message** (which carries the best guess + both marker scores) rather than a generic string — the cron path persists `invariant.messages.join("; ")` (`phase1.ts:289-290`), so this is the only way the diagnostic reaches `last_error_message` / `last_sync_error` (Codex R5 HIGH):
```ts
const versionAmbiguous = next.hardErrors.find((e) => e.code === "VERSION_AMBIGUOUS");
if (versionAmbiguous) {
  failedCodes.push("VERSION_AMBIGUOUS");
  messages.push(versionAmbiguous.message); // e.g. "…best guess v4; scores v4=1, v2=1…"
}
```
`hardErrors` reaches `runInvariants` intact: `enrichWithDrivePins.ts:403` copies `parsed.hardErrors` onto the enriched `ParseResult` that becomes `args.parseResult`. The dev-actions path (`app/admin/dev/actions.ts:167-168`) already OR-s `parsed.hardErrors.length > 0` and takes `parsed.hardErrors[0]?.code` as canonical (and surfaces `parsed.hardErrors[0].message`), so it routes and shows the diagnostic without further change.

**Existing-show persistence fix.** The first-seen path stores code and message in *separate* columns (`pending_ingestions.last_error_code` / `last_error_message`), so the scored message survives. But the existing-show path calls `updateShowParseError` (`runScheduledCronSync.ts:809-828`), which currently writes `shows.last_sync_error = $2` with **only `error.code`** — the message (and its scores) is discarded. To make the diagnostic survive on existing shows too, `updateShowParseError` must persist `` `${error.code}: ${error.message}` `` (which is exactly what the phase1 test fake already writes — the fake currently diverges from production). This is safe: `last_sync_error` is never consumed as a bare code (no `messageFor`/lookup call takes it — verified 2026-07-04); it is displayed and carried as an opaque `prior_last_sync_error` passthrough. The change applies to every parse-error code (MI-1..5b included) — a strict diagnostic improvement. A source-level structural test pins production to persist the message so the fake cannot silently diverge again.

### 4.4 `lib/messages` + spec §12.4 — the new code (three-way lockstep)

New code `VERSION_AMBIGUOUS`, catalog entry modeled on `MI-1_VERSION_DETECTION_FAILED` (`catalog.ts:561-573`): `dougFacing` (non-null), `crewFacing: null`, `followUp`, `helpfulContext`, `title`, `longExplanation`, `helpHref: "/help/errors#VERSION_AMBIGUOUS"`. Because `dougFacing` is non-null it also needs a `helpfulContext` appendix entry in the spec.

**Full touchpoint set — every item lands in ONE commit** (this is a §12.4 code; per the "New §12.4 code = 4 CI gates beyond the 3-way lockstep" rule, x2 and the full-suite run are NOT optional):

1. `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` — §12.4 catalog table row (after the MI-1 row ~L2840) **+** the `helpfulContext` appendix entry (~L3112) **+** a companion note in the §6.8/invariant narrative (~L2729) that ambiguity, not just total-miss, now hard-flags. (Never run prettier on the master spec — it mangles §12.4 cells → x1 divergence.)
2. `pnpm gen:spec-codes` → regenerates `lib/messages/__generated__/spec-codes.ts` (never hand-edited).
3. `lib/messages/catalog.ts` — hand-authored `MESSAGE_CATALOG["VERSION_AMBIGUOUS"]` entry.
4. Producer literal `code: "VERSION_AMBIGUOUS"` under `lib/parser/` (the `hardErrors.push` in `index.ts`) — satisfies x1 producer-reachability **and** is scanned by the x2 generator.
5. **`pnpm gen:internal-code-enums` → regenerate and commit `lib/messages/__generated__/internal-code-enums.ts`.** `scripts/extract-internal-code-enums.ts` scans `lib/parser` files containing `hardErrors` for `code:` literals and records them as `pending_ingestions.last_error_code` values; `tests/cross-cutting/no-raw-codes.test.ts` (**x2**) asserts the committed generated file matches a fresh extraction. Skipping this leaves x2 red. (Codex R1 HIGH.)

**Gate verification before push:** run the FULL suite, not just the touched dir — at minimum `tests/cross-cutting/codes.test.ts` (x1), `tests/cross-cutting/no-raw-codes.test.ts` (x2), `tests/help/errors-grouping.test.tsx`, and `pnpm typecheck`.

`app/help/errors/_families.ts` — `VERSION_AMBIGUOUS` has no matching family prefix → falls into "Other" (pinned by `tests/help/errors-grouping.test.tsx`); acceptable, matches how standalone codes group. No new admin route → `TRUST_DOMAINS` unaffected.

## 5. Marker sets (verified against the fixture corpus)

Markers are stored **pre-normalized (UPPERCASE)** and matched by **normalized column-0 label equality** (§4.1) — deliberately *not* via the canonical alias, because the shared canonical `venue.contact_info` resolves for both v2 (`Hotal Contact Info`) and v4 (`VENUE CONTACT INFO`) and is non-discriminating (it is the exact mechanism behind finding #2). Every literal below was verified present as an exact **column-0 label** in the stated fixtures (col-0 equality sweep over `fixtures/shows/raw/*.md`, 2026-07-04). Each set spans **three independent structural blocks**; the block-diversity clause (§4.1) requires ≥2 of them, so no single block-rename can collapse detection and no single generic block can confer confidence.

Markers are grouped into **3 named blocks per version**; the block-diversity clause (§4.1) requires hits in ≥2 of them.

**`V4_MARKERS` (8, 3 blocks)** — each an exact col-0 label in 4/4 v4, 0/6 v2:
- `contact`: `CONTACT OFFICE`, `CONTACT CELL`, `CONTACT EMAIL`
- `rental`: `RENTAL PICKUP`, `RENTAL RETURN`
- `logistics`: `LOAD AT WAREHOUSE`, `UNLOAD AT WAREHOUSE`, `LOAD IN AT VENUE`

**`V2_MARKERS` (7, 3 blocks)** — each an exact col-0 label in 6/6 v2, 0/4 v4:
- `hotel_contact`: `HOTAL CONTACT INFO`
- `gs_timing`: `GS SET TIME`, `GS SETUP`, `GS STRIKE TIME`
- `bo_timing`: `BO SET TIME`, `BO SETUP`, `BO STRIKE TIME`

**Excluded:** `HOTEL CONTACT INFO` (present in 4/4 v4 *and* 5/6 v2); `CONTACT TITLE` (not reliably col-0 across v4 fixtures — it appears in a header row in some); header-row personalization labels like `TSA PRECHECK`/`DIETARY RESTRICT` (they live mid-row in a wide crew-intake header, not col-0, so they are outside the col-0 mechanism); single-word pull-sheet headers `AUDIO`/`VIDEO`/`LIGHTS` (collision-prone).

**Per-fixture confidence table** (verified 2026-07-04 with the col-0 equality mechanism; the test recomputes these from the marker sets — never hardcoded):

| Fixture group | v4 score / blocks | v2 score / blocks | Verdict |
|---------|----------|----------|---------|
| 4 × v4 (rpas-central-four-seasons, fixed-income-trading-summit, asset-mgmt-cfo-coo-waldorf, fintech-forum-cto-summit) | 8 / 3 | 0 / 0 | confident v4 |
| 6 × v2 (east-coast-family-office, asset-mgmt-cfo-coo, dci-rpas-central, redefining-fixed-income, ria-investment-forum, consultants-roundtable) | 0 / 0 | 7 / 3 | confident v2 |

`MIN_ABS = 2`, `MIN_MARGIN = 2`, `MIN_BLOCKS = 2` — single-sourced constants in `schema.ts`; every downstream reference and test imports them rather than restating the numbers. Headroom: every corpus fixture hits all 3 of its version's blocks (score 7–8), so a sheet must lose 2 entire blocks before it flags — while any pair of same-block markers (1 block) already reads as ambiguous.

## 6. Guard conditions (every input shape)

| Input | `classifyVersion` | `parseSheet` | Net behavior |
|-------|-------------------|--------------|--------------|
| `""` / no pipe-table row | `not_a_sheet` | MI-1 minimal stub (unchanged) | MI-1 hard_fail (unchanged) |
| Table, ≥2 markers of one version, margin ≥2 | `confident` | parse with that version | apply / normal (unchanged for all 10 fixtures) |
| Table, best version has <2 markers (e.g. novel template, 0/0) | `ambiguous` (bestGuess `v1`) | minimal stub + `VERSION_AMBIGUOUS` | hard_fail → retain last-good (existing) / wizard ingestion (first-seen) |
| Table, v4=1 & v2=1 (margin <2) | `ambiguous` | minimal stub + flag | hard_fail |
| Table, v2=2 but from **1 block** (`GS SET TIME`+`GS SETUP`) | `ambiguous` (blocks <2) | minimal stub + flag | hard_fail — block-diversity clause; same-block markers are weak evidence (Codex R6) |
| Table, v4=7 & v2=0 (Contact Office renamed on a v4 sheet) | `confident` v4 (blocks 3) | parse v4 | **correct** — resilient; no silent v2 downgrade (fixes #2) |
| Table, entire CONTACT block gone (v4=5 from rental+logistics = 2 blocks, v2=0) | `confident` v4 | parse v4 | **correct** — 2-block redundancy holds |
| Table, only the rental block present (v4=2, 1 block) | `ambiguous` (blocks <2) | minimal stub + flag | hard_fail — single surviving block is not enough |
| Exactly at threshold: score_top=2, margin=2 | `confident` | parse | `>=` is inclusive — 2/2 is confident, not ambiguous |

## 7. Behavior matrix — {show state} × {verdict}

| | not_a_sheet (MI-1) | ambiguous (VERSION_AMBIGUOUS) | confident |
|---|---|---|---|
| **First-seen** | `pending_ingestions`, `last_error_code=MI-1…`, no admin alert (finding #14, unchanged) | `pending_ingestions`, `last_error_code=VERSION_AMBIGUOUS`, no admin alert (finding #14 — item #4) | staged for review or auto-published per `getAutoPublishCleanFirstSeen` (unchanged) |
| **Existing** | retain last-good, `last_sync_status=parse_error`, `PARSE_ERROR_LAST_GOOD` admin alert | retain last-good, `PARSE_ERROR_LAST_GOOD` admin alert, error-code field = `VERSION_AMBIGUOUS` | apply (unchanged) |

Note the ambiguous column is **byte-for-byte the MI-1 column with a different code** — that is the point of D1/D3: no new routing, no new persistence, identical operator surfaces.

### 7.1 Resolution path (identical to MI-1's today)

`VERSION_AMBIGUOUS` is resolved the same way MI-1 already is — there is deliberately **no in-app "approve the ambiguous parse as-is" affordance**, because approving a parse we are not confident about would defeat the gate. Concretely:

- **A renamed/dropped marker (the finding-#2 case):** the operator restores the sheet's version markers (e.g. renames the row back to `Contact Office`). The next sync re-runs `classifyVersion`, scores confidently, and applies. Multi-marker redundancy means only a *badly* degraded sheet reaches ambiguity in the first place.
- **A genuinely new-but-valid template (the finding-#1 case):** the developer registers the new template's markers (extend `V4_MARKERS`/`V2_MARKERS` or add a version entry) — exactly the `followUp` MI-1 already prescribes ("Eric → add new version detector if real"). Next sync parses confidently.
- **A genuine legacy-v1 sheet:** none exist in the corpus; it would flag ambiguous and require one of the two actions above. An admin "force-classify as v1" override is **not** built here (deferred — `BL-VERSION-AMBIGUOUS-V1-OVERRIDE`, §10), because building an approve-ambiguous path is precisely what the gate is designed to avoid.

This round-trip (ambiguous → operator makes the sheet recognizable → confident → applies) is an explicit test in §8.

## 8. Testing plan (TDD; each test names the failure mode it catches)

- **`schema.classifyVersion` unit suite** — the core. For each: assert verdict.
  - All 10 golden fixtures → `confident` with the expected version, scores computed from the marker sets (not hardcoded). *Catches:* a marker-set edit that would start false-staging real shows.
  - Synthetic "v4 minus Contact Office" (drop the one literal, keep the other 6) → still `confident v4`. *Catches:* regression of finding #2 (single-marker fragility).
  - Synthetic "v4 stripped to 1 marker" and "v2 stripped to 1 marker" → `ambiguous`. *Catches:* under-confident sheet silently applied.
  - **Same-block negatives (both versions):** `GS SET TIME`+`GS SETUP` (both `gs_timing`) → `ambiguous`; `RENTAL PICKUP`+`RENTAL RETURN` (both `rental`) → `ambiguous`. And the positive control: `GS SET TIME`+`BO SET TIME` (two blocks) → `confident v2`. *Catches:* the flat-count-without-diversity hole (Codex R6 HIGH) — 2 markers alone must not confer confidence unless they span ≥2 blocks.
  - **Block-redundancy positives:** v2 with `gs_timing`+`bo_timing` but no `hotel_contact` → `confident v2`; v4 with `rental`+`logistics` but no `contact` → `confident v4`. *Catches:* the diversity clause being too strict (false-staging a sheet that merely lost one block).
  - Synthetic novel template (a valid pipe table with none of the 15 markers in column 0) → `ambiguous` bestGuess v1. *Catches:* finding #1 (silent-v1).
  - **Spoofing negatives:** (a) **≥2 marker literals in value cells (column 1+)** of a table whose column-0 labels are unrelated → score 0, `ambiguous` (Codex R3). (b) **≥2 marker literals in rows with a blank physical column 0** (`| | CONTACT OFFICE | RENTAL PICKUP |`) → score 0, `ambiguous` (Codex R4 — proves `split("|")[1]` semantics, not "first non-empty"). (c) marker phrases in a free-text note line that is not a table row → score 0. (d) a marker as a substring of a larger col-0 cell (`NOTES: GS SET TIME WAS LATE`) → not an exact label → score 0. *Catches:* the value-cell / blank-col-0 / substring spoofing class — confidence comes only from strict physical column-0 labels, never arbitrary cell text.
  - `""` and non-table text → `not_a_sheet`. *Catches:* MI-1 regression.
  - Threshold boundary: hand-built markdown scoring exactly 2/margin-2 → `confident`; 2/margin-1 → `ambiguous`. *Catches:* off-by-one in the inequality.
- **`detectVersion` backward-compat** — the existing `schema.test.ts` suite must still pass unchanged (v4/v2/v1-fallback/null). *Catches:* breaking the ~15 block-parser helper call sites.
- **`parseSheet` integration** — feed an ambiguous markdown → `hardErrors` contains `VERSION_AMBIGUOUS` and the return is a minimal stub (empty crew/rooms) with a valid best-guess `template_version`. Feed a confident v4 markdown → no `VERSION_AMBIGUOUS`, fully-populated parse, `template_version==="v4"`. *Catches:* the flag firing on clean sheets, or the ambiguous path leaking a partial parse.
- **`runInvariants` routing** — a `ParseResult` carrying a `VERSION_AMBIGUOUS` hardError → `outcome==="hard_fail"`, `failedCodes[0]==="VERSION_AMBIGUOUS"` (ahead of the MI-2..5 the empty stub also raises). *Catches:* the cron-path gap (flag not reaching hard_fail via invariants) **and** wrong `failedCodes` ordering.
- **Sync end-to-end (mirror `tests/sync/dev-routing.test.ts:69`)** — ambiguous parse on a first-seen file lands in `pending_ingestions` with `last_error_code="VERSION_AMBIGUOUS"` **and `last_error_message` containing the best guess and both marker scores** (`v4=…, v2=…`); on an existing show retains last-good, does not apply, and `last_sync_error` carries the same diagnostic. *Catches:* mis-routing between wizard and last-good, **and** the diagnostic being dropped on the cron persistence path (Codex R5 HIGH — the message must survive `invariant.messages.join`).
- **Resolution round-trip** — the same source sheet, first ambiguous (markers stripped) → hard_fail; then with markers restored → `confident` → applies cleanly. *Catches:* a gate that flags but can never clear (proves the §7.1 resolution path is real, not just that the code is stored — Codex R1 HIGH #2).
- **Message catalog** — `messageFor("VERSION_AMBIGUOUS")` returns non-null dougFacing/title (no raw code leaks to UI); x1 parity green. *Catches:* invariant-5 violation, lockstep drift.
- **x2 internal-code-enum parity** — after regenerating, `tests/cross-cutting/no-raw-codes.test.ts` is green with `VERSION_AMBIGUOUS` present in the committed `internal-code-enums.ts`. *Catches:* the missed-regeneration CI break (Codex R1 HIGH #1).

## 9. Structural defenses / meta-test inventory

- **Extends** `tests/cross-cutting/codes.test.ts` (x1) and `tests/cross-cutting/no-raw-codes.test.ts` (x2) coverage by adding the new code — no new registry file, but the code participates in both existing parity gates (x1 catalog↔spec, x2 producer↔internal-code-enums).
- **New** golden-corpus confidence test (§8 first bullet) is itself the structural guard against corpus-shaped false-staging: it walks *all* fixtures and asserts every one classifies confidently, so any future marker-set narrowing that would start flagging real shows fails CI.
- Marker sets + thresholds are single-sourced exported constants; the test imports them (no independent restatement of `2`).

## 10. Out of scope (deferred, with the item that owns each)

- First-seen ambiguity admin alert — audit finding #14, **work item #4** (wire silent channels).
- "New parse materially worse than last-good" comparator / promoting MI-6/7 shrinkage to staged — audit finding #3, **work item #2** (re-sync quality gate).
- Positive v1 detection / an admin "force-classify as v1" override for a genuine legacy-v1 sheet — no such sheet exists in the corpus; filed as **BL-VERSION-AMBIGUOUS-V1-OVERRIDE** if one ever surfaces.
- Weighted markers / typo-tolerant per-marker matching — YAGNI; multi-marker redundancy already provides the resilience. Filed as a note, not built.

## 11. Watchpoints (disagreement-loop preempts for adversarial review)

- **"You removed the v1 fallback / v1 shows will break."** v1 remains a valid *extraction* template (block parsers unchanged); only *silent auto-classification* as v1 is removed. The corpus has zero v1 sheets (all 10 are v2/v4). A genuine legacy-v1 sheet flags ambiguous and is resolved via §7.1 (restore a marker, or the developer registers it) — the fail-closed posture the audit's finding #1 demands. Cite: `schema.ts:53,116`; audit §3 finding #1.
- **"The gate should let the operator approve the ambiguous parse in-app."** Deliberately not built — approving a parse we are not confident about defeats the gate (§7.1). Resolution is making the sheet recognizable again (the MI-1 pattern), not rubber-stamping an untrusted parse. A force-classify override for a genuinely-new template is deferred (`BL-VERSION-AMBIGUOUS-V1-OVERRIDE`). The hard_fail route also cannot persist a best-guess parse for approval anyway (`pending_ingestions` has no `parse_result` column) — Codex R1 confirmed this.
- **"Existing v1 shows will re-flag on every sync (noise)."** Only if a pure-v1 published show exists — none do (corpus evidence). Documented risk + backlog override (§10). Not a regression of any real show.
- **"Why hard_fail and not a pending_syncs stage?"** D1 — reuses the last-good-retention + admin-alert path the audit itself credits (audit §2); Approach B was considered and rejected.
- **"VERSION_AMBIGUOUS should be an admin alert."** D5 — it is the same class as MI-1..5b (not admin alerts); existing shows already get `PARSE_ERROR_LAST_GOOD`. First-seen alerting is finding #14 / item #4, deliberately out of scope.
- **"Markers are overfit to the synthetic corpus."** Only *column-0 template labels* matched by exact equality are used (not data values, not value cells, not substrings); the 8 v4 + 7 v2 chosen are each a 100%/0% split across the two groups and drawn from three independent structural blocks per version; the block-diversity clause requires ≥2 blocks, so neither a single-block coincidence nor a synthetic-corpus quirk in one block can confer confidence. The golden-corpus test pins no-false-staging.
