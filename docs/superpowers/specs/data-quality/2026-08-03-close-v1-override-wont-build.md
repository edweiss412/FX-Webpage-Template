# Close `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` as RESOLVED — WON'T BUILD

**Date:** 2026-08-03 · **Branch:** `docs/close-v1-override-wont-build` · **Class:** ledger / spec hygiene · **Scope:** docs-only (no code, no DB, no UI)

Closes the open backlog entry `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` (`BACKLOG.md:59`, the entry heading) at a terminal WON'T-BUILD state, and reconciles the four sites in the version-detection confidence-gate spec that still describe it as deferred-pending-a-trigger (three cite the id; the fourth carries the same framing without naming it).

---

## 1. Problem

`BACKLOG.md:59` holds an open entry asking whether an admin "force-classify as v1" override should exist for a sheet that lands in `VERSION_AMBIGUOUS`. Its own body already records why nobody built it — an admin override IS an approve-ambiguous path, which is the exact thing the confidence gate exists to prevent — and then leaves the question open anyway, on the theory that a real legacy-v1 sheet appearing would make it live.

That theory does not survive being written out. The entry rests on a claim that is false as stated:

> A genuine legacy-v1 sheet has neither [resolution], and none exists in the corpus today — it would flag ambiguous with no way forward but those same two actions. (`BACKLOG.md:63`)

"Has neither" conflates *no markers registered today* with *no registrable structure*. Those are different claims, and the second one is what the entry needs to be true. It is not.

So the entry sits in the open queue as speculative work with a trigger that cannot fire in the shape it describes, and three spec sites cite it as a live deferral. Both are wrong in the same direction, and the fix is one decision rather than three prose patches.

## 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
| --- | --- | --- |
| R1 | **The won't-build decision itself.** No admin force-classify override gets built — not now, not trigger-gated. Eric selected this (Option C of three) on 2026-08-03; the autonomous-ship brief records the approval. This spec documents and executes that call; it does not re-open it. | Owner decision, 2026-08-03 |
| R2 | **Marker registration covers a future real legacy sheet.** Any real sheet has *some* stable column-0 labels; a developer registers them as a version entry. That is spec §7.1 resolution #2, which is not limited to new templates. Probe-settled below (§3). | `lib/parser/schema.ts:37` and `lib/parser/schema.ts:53`; §3 probe |
| R3 | **`v1` is a fallback bucket, not a confirmed legacy template.** `lib/parser/schema.ts:37` names it the fallback when markdown table syntax is present but no v2/v4 markers, and the registry entry at `lib/parser/schema.ts:53` is `{ id: "v1", fallback: true }` — no `requires` array, so nothing positively identifies a v1 sheet. | `lib/parser/schema.ts:37`, `lib/parser/schema.ts:53`; D2 of the 2026-07-04 spec (L30) says the same thing |
| R4 | **The confidence gate itself is out of scope.** Thresholds, marker sets, scoring, routing, and the `VERSION_AMBIGUOUS` code are all shipped and ratified by the 2026-07-04 spec. This change touches none of them and proposes no behavior change. | `docs/superpowers/specs/data-quality/2026-07-04-version-detection-confidence-gate-design.md` |
| R5 | **The entry graduates rather than being deleted.** `BACKLOG.md`'s own header requires the whole entry to move to `BACKLOG-archive.md` at close, and the id must stay a `##`/`###` heading because the archive is a registered ledger (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:55-60`, the `LEDGERS` array) and three spec citations must keep resolving. | `BACKLOG.md:5`; the `LEDGERS` registry |
| R6 | **A "documented limits" close is the right shape, not a weaker one.** The preparedness-audit posture — every input "parsed correctly or signaled, never silently wrong" — is already met for this bucket: an unrecognized sheet is *signaled*, never silently applied. Closing the override question does not widen any silent-corruption surface. | `docs/audits/edge-case-preparedness-audit-2026-07-04.md:92` |

## 2. Goal

One decision, recorded once, with a re-open trigger stated precisely enough to actually fire.

**In scope**, seven files: the `BACKLOG.md` entry (declared in flight, then removed), the `BACKLOG-archive.md` entry (added at terminal state with full rationale), the graduation-guard registry row in `tests/docs/_metaDeferralLedgerGraduation.test.ts`, the four stale sites in the 2026-07-04 spec, this spec document, its index row in `docs/superpowers/specs/data-quality/README.md`, and the implementation plan at `docs/superpowers/plans/2026-08-03-close-v1-override-wont-build.md`. Of the four stale sites, three cite `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` by id (L171, L205, L211) and one carries the same deferral framing without naming it (L212). The id-citation count stays **3** across the change; the site count is **4**.

**Out of scope:** any change to `lib/parser/schema.ts`, the marker sets, the thresholds, the `VERSION_AMBIGUOUS` code, `lib/messages/catalog.ts`, or any runtime behavior. No `§12.4` row is touched, so the three-way catalog lockstep does not apply.

## 3. The argument, with its probe

### 3.1 What is actually in the ambiguous bucket

`VERSION_AMBIGUOUS` fires when no version scores confidently (`MIN_ABS = 2`, `MIN_MARGIN = 2`, `MIN_BLOCKS = 2` — `lib/parser/schema.ts:101-103`). Four things can land there, and they are **indistinguishable by construction** — which is precisely why the gate pauses for human triage instead of publishing a guess:

| # | Occupant | Existing resolution | Would an override help? |
| --- | --- | --- | --- |
| 1 | A damaged v2/v4 sheet (renamed or dropped marker row) | Operator restores the markers; next sync scores confidently (spec §7.1 bullet 1) | No — force-classifying a damaged v2 sheet as **v1** parses it with the wrong template. Strictly worse than the repair. |
| 2 | A genuinely new template | Developer registers its markers as a version entry (spec §7.1 bullet 2) | No — the override would ship a permanent wrong classification instead of a one-time registration. |
| 3 | A junk non-show spreadsheet with a table, sitting in the synced folder | Disregard, or remove it from the folder | No — the correct outcome is *not parsing it at all*. An override would publish garbage. |
| 4 | A hypothetical genuine legacy-v1 sheet | See §3.3 | No — see §3.3. |

Occupants 1–3 are all made **worse** by a force-classify affordance. Only #4 was ever the argument for it.

### 3.2 Probe — the committed corpus contains no v1 sheet

Run against the committed fixture corpus (`fixtures/shows/raw/*.md`, all 10) via `classifyVersion` (`lib/parser/schema.ts:177`):

```
2024-05-east-coast-family-office.md                {"status":"confident","version":"v2","scores":{"v4":0,"v2":7}}
2025-03-dci-rpas-central.md                        {"status":"confident","version":"v2","scores":{"v4":0,"v2":7}}
2025-04-asset-mgmt-cfo-coo.md                      {"status":"confident","version":"v2","scores":{"v4":0,"v2":7}}
2025-05-redefining-fixed-income-private-credit.md  {"status":"confident","version":"v2","scores":{"v4":0,"v2":7}}
2025-06-ria-investment-forum.md                    {"status":"confident","version":"v2","scores":{"v4":0,"v2":7}}
2025-10-consultants-roundtable.md                  {"status":"confident","version":"v2","scores":{"v4":0,"v2":7}}
2025-10-fixed-income-trading-summit.md             {"status":"confident","version":"v4","scores":{"v4":8,"v2":0}}
2026-03-rpas-central-four-seasons.md               {"status":"confident","version":"v4","scores":{"v4":8,"v2":0}}
2026-04-asset-mgmt-cfo-coo-waldorf.md              {"status":"confident","version":"v4","scores":{"v4":8,"v2":0}}
2026-05-fintech-forum-cto-summit.md                {"status":"confident","version":"v4","scores":{"v4":8,"v2":0}}
```

10/10 confident, zero ambiguous, zero v1 **in the committed fixture corpus**. That is the whole of what this probe establishes; §3.3 is deliberately built so the stronger claim is never needed. The **oldest** sheet in the corpus — `2024-05-east-coast-family-office.md`, the one a legacy-v1 template would most plausibly be — scores 7/0 for v2, on the typo spelling "Hotal Contact Info" (`lib/parser/schema.ts:32-35`). Margins are 7 and 8 against a `MIN_MARGIN` of 2, so this is not a near-miss: the corpus is not merely v1-free, it is nowhere near the ambiguity boundary.

**Limit, stated plainly:** the corpus is a non-exhaustive sample by declaration, and this probe covers the committed markdown fixtures, which are conversions of the live sheets rather than the sheets themselves. So the probe supports exactly one claim — *the committed corpus contains no v1 sheet* — and neither of the two stronger ones it is easy to slide into: it does not establish that no v1 sheet has ever existed anywhere, and it does not characterise the live-sheet population. **The archive entry must state the narrow claim, not either broad one.** §3.3 is the argument that makes the broad claims unnecessary: it turns on what the resolution path can do with a sheet, not on whether such a sheet exists.

### 3.3 The insight that closes the question

The backlog entry's case for staying open is: a real legacy-v1 sheet would flag ambiguous and have *no way forward*. That is the "has neither" claim at `BACKLOG.md:63`.

It is false, and the refutation is short: **a real legacy-v1 sheet, once actually seen, is indistinguishable from occupant #2.**

A sheet that exists has structure. Doug's sheets are per-show copies of a template, and every template in the corpus carries stable column-0 labels spanning multiple blocks — that is exactly what the confidence-scoring marker sets are built from — `V4_BLOCKS` and `V2_BLOCKS` at `lib/parser/schema.ts:90-99`, whose own comment records that each version's markers span 3 independent blocks against a diversity clause requiring ≥2 (the legacy `VERSIONS` registry at `lib/parser/schema.ts:39-54` is the separate `detectVersion` path, not the scorer). If a genuine legacy sheet ever surfaces, the developer reads its column-0 labels and registers them as a version entry, the same action spec §7.1 bullet 2 already prescribes. Nothing about that path is restricted to *new* templates; it is restricted to *unregistered* ones, and a legacy sheet nobody registered is unregistered.

So the entry's premise conflates two different things:

- **"No markers registered today"** — true of a hypothetical legacy sheet, and true of every new template before someone registers it. This is the condition §7.1 bullet 2 exists to resolve.
- **"No registrable structure"** — what the entry needs to be true for the two existing resolutions to be unavailable. Nothing supports it, and a sheet with no stable column-0 labels spanning ≥2 blocks would not be parseable by the block parsers either, override or not: force-classifying it as v1 would hand the block parsers a document they cannot read, producing a confidently-wrong parse instead of a signaled one.

That last clause is the whole argument in one line. **The override does not turn an unparseable sheet into a parseable one.** It turns a *signaled* failure into a *silent* one, which inverts the posture the preparedness audit requires (`docs/audits/edge-case-preparedness-audit-2026-07-04.md:92`).

### 3.4 Why not keep it open "just in case"

Because an open backlog row is a claim that the work might be done, and this one cannot be done well. The 2026-07-04 spec already ratified the general form of this refusal twice — §7.1's "deliberately no in-app approve-the-ambiguous-parse affordance," and §11's watchpoint on the same question — and then filed the v1-shaped special case as though it were a different question. It is not a different question. Closing it puts the ledger and the spec into agreement instead of leaving one arguing with the other.

### 3.5 Re-open trigger

Recorded verbatim in the archive entry, and deliberately conjunctive:

> A real legacy sheet surfaces **AND** marker registration proves impossible — i.e. the sheet has no stable column-0 labels spanning ≥2 blocks.

Both halves are required. The first alone is not enough (that is occupant #2, already resolved). If the second ever holds, the correct follow-up is still probably not a force-classify override — a sheet with no registrable structure is a sheet the block parsers cannot read — but the question would at least be live again, which it is not today.

## 4. Changes

Seven files, across two commits to `BACKLOG.md` — the first declares the work in flight, the second graduates the entry. That split is required, not stylistic: see §4.0.

### 4.0 Invariant 12 — the in-flight lifecycle (declaration, then graduation)

Invariant 12 (`AGENTS.md`, landed in `origin/main` at `67074d4dc`) states that **the moment a branch starts work traceable to a `BL-`/`DEF-` entry, that entry is marked in the ledger**, and that the marker goes away when the PR merges — an entry that graduates to an archive takes its marker with it by construction. This change is traceable to `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` by definition: closing it *is* the work. So the invariant applies, and the branch performs the full lifecycle rather than skipping the declaration on the grounds that the entry is about to leave anyway.

Concretely, two steps on the same entry:

1. **Declare** (first commit). The entry's `**Status:** OPEN.` line becomes `**Status:** IN PROGRESS · **Branch:** docs/close-v1-override-wont-build`.
2. **Graduate** (second commit). The entry leaves `BACKLOG.md` for `BACKLOG-archive.md`, taking the marker with it — the archived entry carries a terminal `**Resolution:**` and no flight field, because `tests/docs/_metaLedgerInProgress.test.ts` forbids in-flight state in an archive.

**Ordering constraint, and why it does not conflict with invariant 1.** The guard's staleness case resolves the declared branch with `git ls-remote --heads origin` and fails when the branch is absent (`tests/docs/_metaLedgerInProgress.test.ts:200-217`) — deliberately not skipped, since an unverifiable in-flight claim is the case worth failing on. It matches on the **branch name**, not on whether the declaring commit has been pushed. So the branch is pushed **before the declaring edit is made**, publishing the ref at the base commit:

```sh
git push -u origin docs/close-v1-override-wont-build   # ref exists; no task work on it yet
```

The task then runs red → edit → green → commit, in that order, with the push already behind it. Invariant 1's sequence is preserved exactly; nothing is committed before its test passes. After step 2 no marker remains, so the origin dependency lapses and the merged state is unaffected.

**Step 1 has a real red state, and it is the guard's own assertion.** Invariant 1 binds here — this task edits a tracked file and produces a commit, the same reasoning `tests/docs/backlogClusterArchival.test.ts:3` records for its own Task 7 ("Task 7 edits tracked files and commits, so invariant 1 binds and it needs a real red step"). The red is obtained by declaring the status without anything to check it against:

- **RED** — write `**Status:** IN PROGRESS` with no `**Branch:**` field. Exactly one case fails: `gives every in-progress entry a branch or a PR to point at`, with the message "IN PROGRESS with nothing to check it against". Every other in-progress case stays green (no flight field is present, the entry is not in an archive, and the staleness case returns early on an empty branch list) — so the red is attributable to one assertion, not a smear.
- **GREEN** — append `· **Branch:** docs/close-v1-override-wont-build`, which also arms the staleness case that the pre-push above satisfies.

That is a genuine red, not a manufactured one: an in-progress marker with nothing to resolve is precisely the unfalsifiable-when-stale state the guard exists to reject.

The narrow reading — the guard is opt-in and conditional, so declaring nothing also passes — is true of the *guard* and false of the *invariant*. The guard's own header says it asserts nothing about an entry that does not opt in; that is a statement about enforcement coverage, not permission. The invariant is the rule; the guard is one harness's partial check of it.

### 4.1 `BACKLOG.md`

Two commits, per §4.0.

- **Declaring commit:** replace the entry's `**Status:** OPEN.` line with `**Status:** IN PROGRESS · **Branch:** docs/close-v1-override-wont-build`. The value must match the guard's `BRANCH_SHAPE` (`tests/docs/_metaLedgerInProgress.test.ts:123`), which `docs/close-v1-override-wont-build` does.
- **Graduating commit:** delete the whole `## BL-VERSION-AMBIGUOUS-V1-OVERRIDE` entry (heading at L59 through its status line and trailing `---`), and update the `Last reconciled:` line (L7): a new leading segment naming this branch and what it graduated, previous content demoted behind `Prior:`.
- **The historical `Prior:` chain is NOT rewritten.** The phrase "Eight open rows here" and its parenthesised list — which names both `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` and `BL-UNPUBLISH-TO-HELD` — sits inside the 2026-08-02 segment. It describes the state *at that reconciliation*, when it was true, and demoting it behind `Prior:` is what makes it read as history rather than as a current-state claim. Editing it would falsify a dated record. This is the precedent set the same day by `docs/graduate-bl-unpublish-to-held`, which graduated one of those eight and left the list untouched. **Only the new leading segment states current state, and only it must be accurate.** With both same-day graduations landed, **six** of the original eight remain open; the new segment says so explicitly, so a reader never has to infer a live count from a historical sentence.

### 4.2 `BACKLOG-archive.md`

Add, following the archive's established two-heading shape (terminal heading, then the original entry heading and body, then a `**Resolution:**` paragraph — the `BL-UNPUBLISH-TO-HELD` entry at L35-L45 is the closest precedent, same day, same docs-only class):

```
## BL-VERSION-AMBIGUOUS-V1-OVERRIDE — RESOLVED — WON'T BUILD (2026-08-03, `docs/close-v1-override-wont-build`)

## BL-VERSION-AMBIGUOUS-V1-OVERRIDE — no admin force-classify for a genuine legacy-v1 sheet

<original body: the Filed line and the two prose paragraphs, verbatim — but NOT the status line>

**Resolution (2026-08-03): WON'T BUILD.** <rationale from §3, re-open trigger from §3.5>
```

**The status line does not travel with the body.** By the time this commit runs, that line reads `**Status:** IN PROGRESS · **Branch:** docs/close-v1-override-wont-build` (§4.0 step 1), and `tests/docs/_metaLedgerInProgress.test.ts` fails on any in-flight state inside an archive. Copying the body "verbatim" would therefore red the suite. The terminal heading carries the status instead. Note the narrow scope of that necessity: archived entries commonly DO retain an `**Status:** OPEN` line inside their copied body (37 occurrences in `BACKLOG-archive.md`, probed 2026-08-03), so this is not a general "strip the status line" convention — it is specifically that **in-flight** state is forbidden in an archive, and 0 archived entries carry one.

Both headings keep the id, so the three spec citations and the referential-integrity guard keep resolving. Placement: immediately after the `BL-UNPUBLISH-TO-HELD` block, keeping same-day graduations adjacent — the archive's ordering note (L5) says order follows the original BACKLOG.md layout and to grep by id, so exact position is not load-bearing.

### 4.3 `tests/docs/_metaDeferralLedgerGraduation.test.ts`

Add one row to the `BACKLOG_GRADUATED` array (L90-L334):

```ts
{ id: "BL-VERSION-AMBIGUOUS-V1-OVERRIDE", provenance: "docs/close-v1-override-wont-build" },
```

with the comment convention the surrounding rows use. This makes the graduation itself executable: the guard then asserts the id is archive-only in both directions (the `every graduated id is archive-only` case, L384-L391) and that the archived section names this branch (the per-id provenance case, L393-L412). Every graduation since the guard shipped carries such a row; omitting it would leave this one covered only by the weaker no-overlap invariant.

### 4.4 `docs/superpowers/specs/data-quality/2026-07-04-version-detection-confidence-gate-design.md`

Four sites, one sentence each, every `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` citation preserved. The brief named three; the class sweep over the document found a fourth (L212) carrying the same stale backlog-override framing. Line numbers are drafting-time locators into that one file; each row also names its section so the anchor survives drift.

| Line | Section | Stale phrase to replace | Amendment |
| --- | --- | --- | --- |
| L171 | §7.1, third bullet | `is **not** built here (deferred` | Becomes `is **not** built, and will not be` with the citation restated as resolved won't-build (2026-08-03), plus one clause of reason: a real legacy sheet is registrable like any other unregistered template. |
| L205 | §10 out-of-scope list | `filed as **BL-VERSION-AMBIGUOUS-V1-OVERRIDE** if one ever surfaces` | Records the closure and its conjunctive re-open trigger, keeping the bold id so the citation still resolves. |
| L211 | §11 watchpoint 2 | `is deferred (` | Becomes resolved won't-build (2026-08-03), keeping the backticked id, plus one clause on why the override helps no bucket occupant. |
| L212 | §11 watchpoint 3 | `Documented risk + backlog override (§10).` | Becomes a statement that the override is closed won't-build, still pointing at §10. |

§11 watchpoint 1 (L210) needs **no** edit: it already states the correct resolution (a genuine legacy-v1 sheet flags ambiguous and is resolved via §7.1, by restoring a marker or by the developer registering it), which is the position this change ratifies. Recorded here so a reviewer does not read its absence from the change list as an oversight.

### 4.5 `docs/superpowers/specs/data-quality/README.md`

This spec doc gets its index row — `tests/docs/specsReadmeIndexParity.test.ts` walks the directory in both directions, so a new doc without a row fails. The index file is `docs/superpowers/specs/data-quality/README.md`.

## 5. What this change does NOT touch

Stated explicitly because each has a guard that would fire, and a reviewer scanning for fan-out should be able to close each one without grepping:

| Surface | Why not touched |
| --- | --- |
| `lib/parser/schema.ts` | No behavior change. The `v1` fallback entry, marker sets, and thresholds are unchanged. |
| §12.4 catalog / `lib/messages/catalog.ts` / `pnpm gen:spec-codes` | No error-code row is edited. `VERSION_AMBIGUOUS` keeps its existing copy, so the three-way lockstep does not apply. |
| `supabase/migrations/` | No DB change, so no `gen:schema-manifest` regen and no validation-project apply. |
| UI (`app/`, `components/`, `DESIGN.md`) | None. `impeccable-gate: N/A — no UI surface`. |
| `DEFERRED.md` / `DEFERRED-archive.md` | This is a BACKLOG entry, not a deferral. Its pair is untouched. |
| Advisory locks, telemetry, `AUDITABLE_MUTATIONS` | No mutation surface. Invariants 2, 9, 10 are inapplicable. |

## 6. Guard conditions

| Guard | What it checks here | Expected |
| --- | --- | --- |
| `tests/docs/_metaDeferralLedgerGraduation.test.ts` | id is archive-only, both directions; archived section names `docs/close-v1-override-wont-build`; no active entry carries a terminal status | green (the new registry row is the executable proof) |
| `tests/docs/_metaLedgerReferentialIntegrity.test.ts` | the three spec citations of the id still resolve to a heading in a registered ledger | green — the id keeps `##` headings in the archive |
| `tests/docs/specsReadmeIndexParity.test.ts` | this spec doc has a row in `docs/superpowers/specs/data-quality/README.md` | green after §4.5 |
| `tests/docs/_metaLedgerInProgress.test.ts` | the declared marker has a branch, that branch is on origin, and no in-flight state survives into the archive (§4.0) | green — but only once the branch is pushed; see the §4.0 ordering constraint |
| `tests/docs/_metaInvariant8Closeout.test.ts` | plan-unit closeout marker grammar | green — `impeccable-gate: N/A — no UI surface`, the `NA_FORM` spelling at `tests/docs/_invariant8Closeout.ts:46` |
| `pnpm spec:lint` on both spec docs | citation/link rot | no new findings; the 2026-07-04 spec's pre-existing 7-hard/16-advisory baseline must not rise |

**`tests/docs/backlogClusterArchival.test.ts` does NOT cover this change,** and is listed here only so its absence is not read as an oversight: it hardcodes three ids (`BL-ADMIN-POSTGREST-DML-LOCKDOWN`, `BL-RLS-COVERAGE-CROSSCUTTING`, `BL-X5-INTROSPECTION-GAP`) plus one follow-up, so it cannot fire on this graduation and supplies no coverage for it. The graduation guard in the first row is the coverage.

## 7. Testing plan

No new test is written: the change is a ledger move plus prose, and the executable assertion that it happened correctly **already exists** — adding the `BACKLOG_GRADUATED` row (§4.3) turns the graduation into a red-then-green test, which is the pattern that guard was built for (its own header records that it shipped precisely because a ledger task had "no genuine red state, only post-hoc checks that were already green," `tests/docs/_metaDeferralLedgerGraduation.test.ts:1-6`).

TDD order for the implementation task, therefore:

1. **Declare in flight** (§4.0 step 1). Push the branch ref first (no task work on it), then: write `**Status:** IN PROGRESS` with no branch → `pnpm test tests/docs/` **RED** on exactly one case (`gives every in-progress entry a branch or a PR to point at`); append `· **Branch:** docs/close-v1-override-wont-build` → **GREEN**; commit. Committed on its own, because a declaration landing in the same commit as the graduation never existed as an observable state.
2. Add the `BACKLOG_GRADUATED` row and run `pnpm test tests/docs/` → **RED**, on exactly two assertions: `every graduated id is archive-only` (`missing from BACKLOG-archive.md`) and the per-id provenance case (`has no heading in the archive`). A red for any other reason is a different defect and stops the task.
3. Move the entry (delete from `BACKLOG.md` incl. the `Last reconciled` update, add to `BACKLOG-archive.md` with the resolution) → **GREEN**. The in-flight marker leaves with the entry, completing §4.0 step 2.
4. Amend the four spec sites + README row; re-run `pnpm test tests/docs/` and `pnpm spec:lint` on both docs against the recorded baselines.

Steps 2 and 3 land in one commit — a commit whose suite is red is not a valid history entry here, and the two halves are one logical move.

Verification commands: `pnpm test tests/docs/`, `pnpm spec:lint docs/superpowers/specs/data-quality/2026-08-03-close-v1-override-wont-build.md`, `pnpm spec:lint docs/superpowers/specs/data-quality/2026-07-04-version-detection-confidence-gate-design.md`, `pnpm format:check`, `pnpm lint`.

## 8. Documented limits

- The probe (§3.2) covers the committed fixture corpus, not the live Google Sheets. It establishes exactly one thing — *the committed corpus contains no v1 sheet* — and that is the claim the archive entry is limited to. It establishes neither that no v1 sheet has ever existed nor anything about the live-sheet population, and it cannot establish "cannot exist." §3.3 is the argument that needs none of those: it turns on what the resolution path can do with a sheet, not on whether such a sheet exists.
- The re-open trigger's second half ("no stable column-0 labels spanning ≥2 blocks") is a judgment a developer makes by reading a real sheet, not a mechanized check. That is deliberate: mechanizing it would mean building the v1 detector this change declines to build.
- Closing the entry removes a speculative row; it does not add coverage. Nothing about the ambiguity gate's behavior improves or degrades as a result.
