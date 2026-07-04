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
| D3 | **The ambiguous path still runs the block parsers with the best-guess version, then attaches the hard-error** — it does not return a minimal stub. | Fail-closed (hard_fail → never auto-applied) but the review surface / wizard sees a real best-guess parse. This also closes the v1-legacy gap: a genuine legacy-v1 sheet gets a real v1 parse a human can confirm-and-approve once, rather than an empty stub. (MI-1 — *not a sheet at all* — keeps its minimal-stub early return, since there is nothing to parse.) |
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
2. Score each of v4 and v2: `score_V = count of V's markers present` (case-insensitive substring match against the raw markdown; see §5 for why literal-substring, not the shared canonical alias).
3. `top` = higher-scoring of {v4, v2}; `runnerUp` = the other. On a 0–0 tie, `top` is unspecified but its score is 0 (handled by step 4, which flags it ambiguous regardless).
4. **Confident** iff `score_top >= MIN_ABS` **and** `(score_top - score_runnerUp) >= MIN_MARGIN` → `{ status:"confident", version: top, scores }`.
5. Otherwise `{ status:"ambiguous", bestGuess: legacyBestGuess(...), scores, reason }` where `reason` names the scores (e.g. `"v4=1 v2=1 below margin"` or `"v4=0 v2=0 no known markers"`).

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
- `ambiguous` → push `{ code: "VERSION_AMBIGUOUS", message }` to `hardErrors`, then **continue the normal parse** with `verdict.bestGuess` as `version`. The existing success-path return (`index.ts:~676`) already includes `hardErrors`, so the ambiguous flag rides out with a best-guess parse.
- `confident` → parse normally with `verdict.version` (today's behavior).

`message` names the best guess and the failing signal, e.g. `"Could not confidently determine sheet template version (best guess v4; markers too close: v4=1, v2=1). Staged for review."`

### 4.3 `lib/parser/invariants.ts` — `runInvariants` routing (the load-bearing cron hook)

The cron path derives its outcome solely from `runInvariants(prior, parseResult).failedCodes[0]` (`phase1.ts:286-289`); it does **not** inspect `hardErrors.length` generically, and the MI-1 gate matches only `code === "MI-1_VERSION_DETECTION_FAILED"` (`invariants.ts:111`). So a new dedicated check is required or `VERSION_AMBIGUOUS` would not hard-fail in production cron.

Add, immediately after the MI-1 block (so `VERSION_AMBIGUOUS` sorts to `failedCodes[0]` ahead of MI-2..5 noise from any empty best-guess parse):
```ts
if (next.hardErrors.some((e) => e.code === "VERSION_AMBIGUOUS")) {
  failedCodes.push("VERSION_AMBIGUOUS");
  messages.push("Version detection confidence below threshold; staged for review");
}
```
`hardErrors` reaches `runInvariants` intact: `enrichWithDrivePins.ts:403` copies `parsed.hardErrors` onto the enriched `ParseResult` that becomes `args.parseResult`. The dev-actions path (`app/admin/dev/actions.ts:167-168`) already OR-s `parsed.hardErrors.length > 0` and takes `parsed.hardErrors[0]?.code` as canonical, so it routes without further change.

### 4.4 `lib/messages` + spec §12.4 — the new code (three-way lockstep)

New code `VERSION_AMBIGUOUS`, catalog entry modeled on `MI-1_VERSION_DETECTION_FAILED` (`catalog.ts:561-573`): `dougFacing` (non-null), `crewFacing: null`, `followUp`, `helpfulContext`, `title`, `longExplanation`, `helpHref: "/help/errors#VERSION_AMBIGUOUS"`. Because `dougFacing` is non-null it also needs a `helpfulContext` appendix entry in the spec. Lockstep set (all in one commit):
1. `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` — §12.4 catalog table row (after the MI-1 row ~L2840) **+** the `helpfulContext` appendix entry (~L3112) **+** a companion note in the §6.8/invariant narrative (~L2729) that ambiguity, not just total-miss, now hard-flags.
2. `pnpm gen:spec-codes` → regenerates `lib/messages/__generated__/spec-codes.ts` (never hand-edited).
3. `lib/messages/catalog.ts` — hand-authored `MESSAGE_CATALOG["VERSION_AMBIGUOUS"]` entry.
4. Producer literal `code: "VERSION_AMBIGUOUS"` exists under `lib/` (in `index.ts` and/or `invariants.ts`) — satisfies the x1 producer-reachability assertion.

The `x1` parity gate (`tests/cross-cutting/codes.test.ts`) asserts `MESSAGE_CATALOG` keys ≡ `SPEC_CODES` keys ≡ `CODE_SCENARIOS` keys with field-by-field deep-compare; `code-scenarios.ts` auto-derives. `app/help/errors/_families.ts` — `VERSION_AMBIGUOUS` has no matching family prefix → falls into "Other" (pinned by `tests/help/errors-grouping.test.tsx`); acceptable, matches how standalone codes group.

## 5. Marker sets (verified against the fixture corpus)

Matched as **case-insensitive substrings of the raw markdown** — deliberately *not* via the canonical alias, because the shared canonical `venue.contact_info` resolves for both v2 (`Hotal Contact Info`) and v4 (`VENUE CONTACT INFO`) and is therefore non-discriminating (it is the exact mechanism behind finding #2).

**`V4_MARKERS` (7)** — each present in 4/4 v4 fixtures, 0/6 v2 fixtures:
`Contact Office`, `Contact Title`, `Contact Cell`, `TSA PRECHECK`, `DIETARY`, `Names on Reservation`, `VENUE CONTACT INFO`

**`V2_MARKERS` (4)** — each present in 6/6 v2 fixtures, 0/4 v4 fixtures:
`Hotal Contact Info`, `GS Set Time`, `GS Strike Time`, `BO Setup`

**Excluded (non-discriminating):** `Hotel Contact Info` — present in 4/4 v4 *and* 5/6 v2. Including it would reintroduce the finding-#2 cross-contamination.

**Per-fixture confidence table** (verifies zero false staging; expected values derived from the marker sets, not hardcoded — the test computes them):

| Fixture | v4 score | v2 score | Verdict |
|---------|----------|----------|---------|
| 4 × v4 fixtures (rpas-central-four-seasons, fixed-income-trading-summit, asset-mgmt-cfo-coo-waldorf, fintech-forum-cto-summit) | 7 | 0 | confident v4 |
| 6 × v2 fixtures (east-coast-family-office, asset-mgmt-cfo-coo, dci-rpas-central, redefining-fixed-income, ria-investment-forum, consultants-roundtable) | 0 | 4 | confident v2 |

`MIN_ABS = 2`, `MIN_MARGIN = 2` — single-sourced constants in `schema.ts`; every downstream reference and test imports them rather than restating `2`.

## 6. Guard conditions (every input shape)

| Input | `classifyVersion` | `parseSheet` | Net behavior |
|-------|-------------------|--------------|--------------|
| `""` / no pipe-table row | `not_a_sheet` | MI-1 minimal stub (unchanged) | MI-1 hard_fail (unchanged) |
| Table, ≥2 markers of one version, margin ≥2 | `confident` | parse with that version | apply / normal (unchanged for all 10 fixtures) |
| Table, best version has <2 markers (e.g. novel template, 0/0) | `ambiguous` (bestGuess `v1`) | best-guess parse + `VERSION_AMBIGUOUS` | hard_fail → retain last-good (existing) / wizard (first-seen) |
| Table, v4=1 & v2=1 (margin <2) | `ambiguous` | best-guess parse + flag | hard_fail |
| Table, v4=6 & v2=0 (Contact Office renamed on a v4 sheet) | `confident` v4 | parse v4 | **correct** — resilient; no silent v2 downgrade (fixes #2) |
| Exactly at threshold: score_top=2, margin=2 | `confident` | parse | `>=` is inclusive — 2/2 is confident, not ambiguous |

## 7. Behavior matrix — {show state} × {verdict}

| | not_a_sheet (MI-1) | ambiguous (VERSION_AMBIGUOUS) | confident |
|---|---|---|---|
| **First-seen** | `pending_ingestions`, `last_error_code=MI-1…`, no admin alert (finding #14, unchanged) | `pending_ingestions`, `last_error_code=VERSION_AMBIGUOUS`, no admin alert (finding #14 — item #4) | staged for review or auto-published per `getAutoPublishCleanFirstSeen` (unchanged) |
| **Existing** | retain last-good, `last_sync_status=parse_error`, `PARSE_ERROR_LAST_GOOD` admin alert | retain last-good, `PARSE_ERROR_LAST_GOOD` admin alert, error-code field = `VERSION_AMBIGUOUS` | apply (unchanged) |

## 8. Testing plan (TDD; each test names the failure mode it catches)

- **`schema.classifyVersion` unit suite** — the core. For each: assert verdict.
  - All 10 golden fixtures → `confident` with the expected version, scores computed from the marker sets (not hardcoded). *Catches:* a marker-set edit that would start false-staging real shows.
  - Synthetic "v4 minus Contact Office" (drop the one literal, keep the other 6) → still `confident v4`. *Catches:* regression of finding #2 (single-marker fragility).
  - Synthetic "v4 stripped to 1 marker" and "v2 stripped to 1 marker" → `ambiguous`. *Catches:* under-confident sheet silently applied.
  - Synthetic novel template (a valid pipe table with none of the 11 markers) → `ambiguous` bestGuess v1. *Catches:* finding #1 (silent-v1).
  - `""` and non-table text → `not_a_sheet`. *Catches:* MI-1 regression.
  - Threshold boundary: hand-built markdown scoring exactly 2/margin-2 → `confident`; 2/margin-1 → `ambiguous`. *Catches:* off-by-one in the inequality.
- **`detectVersion` backward-compat** — the existing `schema.test.ts` suite must still pass unchanged (v4/v2/v1-fallback/null). *Catches:* breaking the ~15 block-parser helper call sites.
- **`parseSheet` integration** — feed an ambiguous markdown → `hardErrors` contains `VERSION_AMBIGUOUS`, and the parse still populated a best-guess `show.template_version`. Feed a confident v4 markdown → no `VERSION_AMBIGUOUS`, `template_version==="v4"`. *Catches:* the ambiguous path returning a stub, or the flag firing on clean sheets.
- **`runInvariants` routing** — a `ParseResult` carrying a `VERSION_AMBIGUOUS` hardError → `outcome==="hard_fail"`, `failedCodes[0]==="VERSION_AMBIGUOUS"`. *Catches:* the cron-path gap (flag not reaching hard_fail via invariants).
- **Sync end-to-end (mirror `tests/sync/dev-routing.test.ts:69`)** — ambiguous parse on a first-seen file lands in `pending_ingestions` with `last_error_code="VERSION_AMBIGUOUS"`; on an existing show retains last-good. *Catches:* mis-routing between wizard and last-good.
- **Message catalog** — `messageFor("VERSION_AMBIGUOUS")` returns non-null dougFacing/title (no raw code leaks to UI); x1 parity green. *Catches:* invariant-5 violation, lockstep drift.

## 9. Structural defenses / meta-test inventory

- **Extends** `tests/cross-cutting/codes.test.ts` (x1) coverage by adding the new code — no new registry file, but the code participates in the existing parity gate.
- **New** golden-corpus confidence test (§8 first bullet) is itself the structural guard against corpus-shaped false-staging: it walks *all* fixtures and asserts every one classifies confidently, so any future marker-set narrowing that would start flagging real shows fails CI.
- Marker sets + thresholds are single-sourced exported constants; the test imports them (no independent restatement of `2`).

## 10. Out of scope (deferred, with the item that owns each)

- First-seen ambiguity admin alert — audit finding #14, **work item #4** (wire silent channels).
- "New parse materially worse than last-good" comparator / promoting MI-6/7 shrinkage to staged — audit finding #3, **work item #2** (re-sync quality gate).
- Positive v1 detection / an admin "force-classify as v1" override for a genuine legacy-v1 sheet — no such sheet exists in the corpus; filed as **BL-VERSION-AMBIGUOUS-V1-OVERRIDE** if one ever surfaces.
- Weighted markers / typo-tolerant per-marker matching — YAGNI; multi-marker redundancy already provides the resilience. Filed as a note, not built.

## 11. Watchpoints (disagreement-loop preempts for adversarial review)

- **"You removed the v1 fallback / v1 shows will break."** v1 remains a valid *extraction* template (block parsers unchanged); only *silent auto-classification* as v1 is removed. The corpus has zero v1 sheets (all 10 are v2/v4). A genuine legacy-v1 sheet gets a real best-guess v1 parse (D3), staged once for human confirmation — the fail-closed posture the audit's finding #1 demands. Cite: `schema.ts:53,116`; audit §3 finding #1.
- **"Existing v1 shows will re-flag on every sync (noise)."** Only if a pure-v1 published show exists — none do (corpus evidence). Documented risk + backlog override (§10). Not a regression of any real show.
- **"Why hard_fail and not a pending_syncs stage?"** D1 — reuses the last-good-retention + admin-alert path the audit itself credits (audit §2); Approach B was considered and rejected.
- **"VERSION_AMBIGUOUS should be an admin alert."** D5 — it is the same class as MI-1..5b (not admin alerts); existing shows already get `PARSE_ERROR_LAST_GOOD`. First-seen alerting is finding #14 / item #4, deliberately out of scope.
- **"Markers are overfit to the synthetic corpus."** Only *template field labels* are used (not data values); the 7+4 chosen are each 100%/0% split across the two groups; thresholds leave 5+ markers of headroom. The golden-corpus test pins no-false-staging.
