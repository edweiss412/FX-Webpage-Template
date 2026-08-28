# spec:lint — a declared expectation that nothing enforces

<!-- spec-lint: not-ui — no UI surface; the app/ and components/ mentions below are the §9 impeccable-gate scope statement only. The diff is lib/specLint/**, scripts/spec-lint.ts, tests/specLint/** and the mutation registry. -->

**Row:** `BL-SPECLINT-EXPECT-N-EXIT-STATUS` (BACKLOG.md). Process-facing, `Mint-exception: product-blocked`, Effort S, Reachability PROBED.
**Index entry:** `LIM-EXPECT-N-COMMENT` (`docs/review-rounds/LIMITS.md`), plus `LIM-PLAYWRIGHT-RED-TESTMATCH` for §3.
**Incident:** `fix/fitwithinclip-stale-clip-subscription`, plan round 2 P1 — a declared Playwright regression gate collected `0 tests in 0 files` because the command omitted `--config tests/e2e/standalone.config.ts`. Caught by the reviewer at round 2, not at authoring time (`docs/review-rounds/fix/fitwithinclip-stale-clip-subscription/4cb585b3508a.md`, plan section, second note).

---

## 1. The defect, stated once

A plan author writes down what a command should produce and then writes a command that cannot report whether it produced it. Two shapes, both measured in this corpus:

- **`# expect N` beside a command whose exit status does not encode N.** `git status --porcelain | wc -l  # expect 0` exits 0 whether the count is 0 or 50, because `wc` always exits 0. `grep -c` prints its count and exits on match-presence, not on the count. The number is for a human who may or may not read it; nothing fails.
- **A Playwright command that collects nothing.** `playwright test tests/e2e/popover-clip-fit.spec.ts` collects zero tests, because that spec is reachable only through `tests/e2e/standalone.config.ts`'s explicit `testMatch` allow-list (`tests/e2e/standalone.config.ts:85-86`) and appears in no project of the root config. The declared gate cannot observe its subject — and at authoring time nothing verifies collection, which is how the incident's gate was believed valid without ever being run. When the command IS run, current Playwright exits 1 with `Error: No tests found` (probed at diff round 1, 2026-08-28, both the plain and `--reporter=json` forms; an earlier revision of this spec claimed exit 0, refuted by that probe): a non-zero exit for a COLLECTION reason, which a red-then-green cycle misreads as RED OBSERVED for the wrong reason — the same class `deriveCollectionProbe` names for vitest-shaped reds (`lib/specLint/redContract.ts:648`) — and which a regression gate surfaces as an unexplained failure long after authoring.

Both are the same failure at authoring time: **the document declares an expectation that nothing at authoring time verifies the command can express** — Arm A's exit status is unrelated to the stated N; Arm B's gate cannot observe the file it names.

## 1.1 Resolved scope — do not relitigate

- **Arm A is `advisory`, never `fail`.** Ratified in §4.5 with the reason (ten already-merged documents carry the shape; a `fail` blocks unrelated arcs). The severity split between the arms is §5.3's last paragraph.
- **No static reading of Playwright configs.** §3 third bullet. The configs' `testMatch` values are TypeScript regexes at ten sites (`playwright.config.ts:82-214`); §5 observes collection with `--list` instead. A "parse the config" finding is the recognizer growth this arc is fenced against (brief guardrail: repair direction under recurrence is NARROWING).
- **`deriveCollectionProbe` and `VITEST_SHAPE` are untouched.** §3 fourth bullet. The decline comment at `lib/specLint/redContract.ts:653-661` fences its own surface against wrapper recognizers; Arm B is a separate arm over a different surface, with its own anchoring rationale (§5.4 last paragraph).
- **Truth-of-claim is out of scope.** Whether N is the right number, or a `red=` can be red for its stated reason, is `BL-SPECLINT-RED-TRUTH-PROBE`, explicitly scheduled after this row (BACKLOG.md, that row's Trigger line). This spec reports only that nothing enforces the claim.
- **Extraction covers inline code spans AND fenced lines (§5.1).** Measured before ratifying: span candidates are real declared gates, not prose — e.g. `pnpm exec playwright test tests/e2e/bell-panel-layout.spec.ts` declared five times in spans in `2026-07-18-alert-surface-ui.md` alone. A fence-only rule would miss the incident shape wherever a plan declares its gate inline.
- **Config recognition is the closed two-member flag set `{--config, -c}` positioned after the `playwright test` match (§5.1).** Ratified at round 1: the position rule exists because `sh -c '…'` wrappers precede the token pair in three live `red=` markers, and the set is Playwright's own documented flag plus its alias — no wider shell parsing is accepted (threat fence).
- **The §7 limits are limits, not findings.** Consequence bound in §2: an input the grammar declines draws nothing and files there. Under the 2026-08-25 process mint freeze they carry re-file triggers, not ledger rows.

## 2. Convergence criterion

**Consequence bound.** Every input is either classified correctly or left alone. This arm's only output is an advisory, so its failure mode is NOISE, not silent corruption: an input the grammar cannot classify draws nothing and files to §7. A conservative decline plus a documented limit is the designed outcome, never a finding.

**Probe domain.** `docs/superpowers/plans/**` as tracked at this branch's merge base, plus the two incident commands quoted in §1. A probe outside that set, or more than one ordinary edit away from a document in it, files to §7.

**Threat fence.** Accidental authoring mistakes by an ordinary contributor. Adversarial obfuscation is out of scope: a command deliberately shaped to evade the grammar is not a defect this arm claims to catch, and no widening is accepted to catch one.

**The closable number.** Zero false advisories over the probe domain, with both incident shapes flagged. §4.4 and §5.5 give the measured accept-sets; the corpus suites re-derive them from disk on every run rather than pinning a hand-written list.

**Score.** Both arms land in one new pure module, lib/specLint/expectContract.ts (plain text: created by this arc, not tracked yet), enrolled in `tests/mutation/source/registry.ts` before the first review dispatch, with the score, the unaccepted-survivor set and the `OPERATORS:` tail stated in the round-1 brief's `GUARD SURFACE:` line.

## 3. What this spec does NOT do

- It does not evaluate whether N is the *right* number. Truth-of-claim is `BL-SPECLINT-RED-TRUTH-PROBE`, scheduled after this row. This arm reports only that nothing enforces the claim.
- It does not rewrite the author's command, suggest a specific assertion, or auto-fix.
- It does not parse `playwright.config.ts`. Its per-project `testMatch` regexes are TypeScript at ten sites (`playwright.config.ts:82-214`), and a static reader of them is exactly the recognizer growth this arc is fenced against. §5 observes collection by running `--list` instead.
- It does not touch `deriveCollectionProbe` (`lib/specLint/redContract.ts:648`). That function's `not-vitest-shaped` decline (`lib/specLint/redContract.ts:664`) stays truthful and unchanged; §5 is a separate arm over a different surface, not a widening of `VITEST_SHAPE` (`lib/specLint/redContract.ts:580`).

---

## 4. Arm A — `EXPECT_N_UNENFORCED`

Static. No subprocess. Runs on plan-kind documents in the ordinary `spec:lint` pass, so it is available at authoring time with no flag.

### 4.1 Grammar (CLOSED)

A line draws the advisory when ALL of:

1. The line matches `/^(?<cmd>.*\S)[ \t]+#[ \t]*expect[ \t]+(?<n>\d+)(?:[ \t]*\([^()]*\))?[ \t]*$/`.
2. `cmd` is non-empty after trimming.
3. `cmd`, after leading whitespace, does not begin with one of the CLOSED assertion openers `test `, `[ `, `[[ `.

Nothing else is read. The line's fence membership is deliberately NOT consulted — see §4.3.

### 4.2 Why the pattern is end-anchored

End-anchoring is the whole discriminator, and it was chosen because it is what the measurement showed separates commands from prose ABOUT commands. Two corpus lines quote this exact defect shape inside prose:

- `docs/superpowers/plans/2026-08-21-premisescan-registrar-accept-sets.md:815` — `` `grep -c … # expect 0`, which prints its result and moves on `` — the expectation is inside an inline code span and the sentence continues after it.
- `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12.1-pg-cron-pivot.md:75` — a review-round table cell quoting a proposed verification command mid-sentence.

Both are FALSE positives under any pattern that merely searches for `# expect <digits>`. Both are excluded by end-anchoring alone, because in each the comment is followed by a closing backtick and more text. A document that discusses this arm's own defect class must not trip it.

### 4.3 Why fence membership is not the discriminator

The obvious rule — "only fire inside fenced code blocks" — was measured and rejected. `parseDoc`'s `fencedInfo` (`lib/specLint/parse.ts:20`) tracks ``` fences only, so a command written as an INDENTED code line inside a list item reads as prose. Two of the strongest true positives are exactly that shape:

```
docs/superpowers/plans/2026-08-18-control-outline-border-token.md:169   PROSE
docs/superpowers/plans/2026-08-18-control-outline-border-token.md:170   PROSE
```

A fence rule would drop both while keeping neither false positive that end-anchoring already removes. It buys nothing and costs two.

### 4.4 Measured accept-set (probe, 2026-08-28)

23 lines in the probe domain contain `# expect `. The grammar fires on exactly 10, and every one is a true positive — a command whose exit status cannot report the stated number:

| Site | Command shape | Why the exit status does not encode N |
| --- | --- | --- |
| `2026-08-18-control-outline-border-token.md:169` | `sed … \| grep -c 'border-border'` `# expect 0` | `grep -c` exits 1 on zero matches; the count is stdout only |
| `2026-08-18-control-outline-border-token.md:170` | `sed … \| grep -c 'border-text-faint'` `# expect 1` | exit 0 means "at least one", never "exactly one" |
| `2026-08-03-lead-capability-prose-settle.md:671` | `rg -n 'admin/ops' <spec>` `# expect 0` | `rg` exits 1 on the EXPECTED outcome |
| `2026-08-21-app-e2e-batch2.md:74` | `git status --porcelain \| wc -l` `# expect 0` | `wc` always exits 0 |
| `2026-08-21-app-e2e-batch2.md:76` | `supabase status \| grep -c 'is running'` `# expect 1` | as row 2 |
| `2026-08-21-app-e2e-batch2.md:77` | `pnpm db:seed > /dev/null; echo "seed rc=$?"` `# expect 0` | `echo` always exits 0; the rc is printed, not returned |
| `docs/superpowers/plans/2026-07-20-show-scoped-alert-copy/00-plan.md:407` | `grep -rn … \| wc -l` `# expect 56` | `wc` always exits 0 |
| `docs/superpowers/plans/2026-07-20-show-scoped-alert-copy/00-plan.md:408` | `grep -rn … \| grep -c '"show"'` `# expect 2 (…)` | as row 2 |
| `docs/superpowers/plans/parser/2026-07-06-bo-show-prefixed-breakout-header.md:187` | `git diff … \| grep -icE 'lasalle'` `# expect 2 (…)` | as row 2 |
| `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/01-pivot-tasks.md:1058` | `git diff --cached --name-only \| grep -E … \| wc -l` `# expect 7` | `wc` always exits 0 |

The 13 non-firing lines, each declining for a stated reason:

| Reason | Sites |
| --- | --- |
| Expectation is not a bare integer (`green`, `empty`, `ONLY: …`, `geocode_cache gains …`, `exactly: 0    0`) | premisescan:320,321,508; agenda-file-inaccessible-split/00-overview:149; flow8.3-venue-timezone:256; onboarding-sheet-unreadable:513; venue-degraded-tile-glyph:208 |
| Integer followed by unparenthesised prose (`1 insertion, 1 deletion`; `0 before a run`; `4001 passed / 6 skipped …`) | lead-capability:672; app-e2e-batch2:75; F-screenshot-harness:148 |
| Comment occupies the whole line — no non-blank command precedes the `#`, so the pattern itself never matches (rules 1–2) | 02-phase0-validation-state:867 |
| Not end-anchored — prose quoting a command (§4.2) | premisescan:815; M12.1-pg-cron-pivot:75 |

**10 fire, 0 false. `false advisories = 0` is the number this arm closes on**, and the corpus suite (tests/specLint/expectContractCorpus.test.ts, created by this arc — §8) re-derives both columns by walking `git ls-files docs/superpowers/plans` rather than pinning them, so a document added later is covered by default.

### 4.5 Finding

`check: "taskContract"`, `code: "EXPECT_N_UNENFORCED"`, `severity: "advisory"`, anchored at the line and at the column of the `#`.

Message: ``expectation `N` is stated in a comment; the command's exit status does not encode it``.
Detail: the trimmed command, and the sentence `a reader must compare the printed value by eye; nothing fails when it differs`.

Advisory, not fail, and deliberately: ten live plans carry this shape today and every one of them is a document already merged. A `fail` would red the corpus suites on work nobody is editing, which converts a true finding into a blocker for unrelated arcs. The advisory names it at authoring time, which is the incident's own diagnosis.

---

## 5. Arm B — `PLAYWRIGHT_COLLECTS_NOTHING`

Observed, not static. Runs under the existing `--exec-red` flag, alongside the vitest collection probe it mirrors (`lib/specLint/redContract.ts:777`).

### 5.1 Extraction

From a plan-kind document, a CANDIDATE is any inline code span (`DocModel.spans`, `lib/specLint/parse.ts:21`) or any line inside a fence (`fencedInfo[i]` a string) that BOTH:

1. matches `/\bplaywright\s+test\b/`, and
2. names at least one token matching the GLOBAL pattern `/(?:^|\s)(tests\/e2e\/[A-Za-z0-9._-]+\.spec\.ts)(?=\s|$)/g` — the candidate's file set is EVERY matching token, not the first (23 corpus candidates name more than one file, and one names a collected file before an uncollected one: `docs/superpowers/plans/2026-07-18-modal-header-reconciliation/01-shell-and-strip.md:171`), and
3. does not end with a shell line continuation (`/\\\s*$/`), and
4. contains exactly ONE `playwright test` match (rule 1's pattern with `g`, count == 1). A text with several invocations (`… && playwright test …`) is declined whole: §5.1 assigns one config per candidate, and a multi-invocation text can carry a different config per invocation — the corpus has exactly one such span (`docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md:138`, both invocations default-config and both files collected, so the decline forgoes nothing today), and adding a `--config` to its second invocation (one ordinary edit) would otherwise evaluate the FIRST invocation's file under the second's config — a false fail (round-2 finding). Splitting per invocation is shell parsing; declining is the narrowing this arc is fenced to.

Requirement 2 is the narrowing that makes this arm cheap and quiet. A Playwright invocation that names no spec file selects by config or project alone; this arm makes no claim about it and files that to §7. Requirement 3 exists because a continued command's `--config` can live on the NEXT line: reading the first line alone would classify it `(default)` and could mint the one false-fire shape this arm has. A continued command is declined whole, never assembled (§7). One corpus line is candidate-shaped and ends with `\` today (`docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:173`, a 23-file line inside a multi-line continuation block); rule 3 declines it, conservatively — the block's semantics are recoverable only by assembling shell across lines. The clipsub plan's own repaired form (`docs/superpowers/plans/2026-08-27-fitwithinclip-clip-subscription.md:102-103`) splits the FILE onto the continuation line, so its first line already fails requirement 2 and its second fails requirement 1; requirement 3 closes the remaining permutation. Extraction reads no shell grammar beyond these token matches — no quote handling, no operator parsing — because a candidate is never executed.

The candidate's config is the value of `--config` or of Playwright's documented single-letter alias `-c` — a CLOSED two-member flag set, `/(?:^|\s)(?:--config|-c)[=\s]+(\S+)/` — or the sentinel `(default)` when neither is present. The flag is searched only in the candidate text FROM the `playwright test` match onward: `sh -c '…'` wrappers precede that token pair, and reading their `-c` as a config classifies three live corpus `red=` markers under a garbage config (measured — `docs/superpowers/plans/2026-08-10-diagram-viewing-polish.md:44`, `docs/superpowers/plans/2026-08-10-wifi-password-legibility.md:32`, `docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md:138`). One corpus candidate uses the `-c` alias for real (`docs/superpowers/plans/2026-07-18-modal-close-exit-anim/01-tasks.md:1003`); ignoring the alias would misclassify it `(default)` and mint a false fail one ordinary edit away.

### 5.2 Observation — two spawns for the whole corpus

The adapter collects the DISTINCT config values across all candidates and runs, once per value:

```
playwright test --list --reporter=json [--config <cfg>]
```

`--list` boots no `webServer`; the clipsub reviewer ran it under both configs inside a read-only sandbox (`4cb585b3508a.md`, plan section, Infra note). Measured over the probe domain on 2026-08-28 (dated at-authoring-time scalars — the corpus suite re-derives the SETS these describe, never these numbers, which drift with every merged plan): **253 candidates, 2 distinct configs** (`(default)` = 177, `tests/e2e/standalone.config.ts` = 76; one further line declined by §5.1 rule 3 and one by rule 4). Two spawns, not 253, because collection is a property of the config and not of the command.

**Collected-file identity.** The JSON reporter's `file` values are relative to the report's own `config.rootDir` (both live configs resolve it to `tests/e2e/`), not to the repo root, and not in the `tests/e2e/…` spelling §5.1 tokens use. The ADAPTER normalizes: each reported `file` is joined to that report's `config.rootDir` and relativized against the repo root, so the collected set's keys are repo-relative paths in exactly the token spelling. A literal comparison of raw reporter values against §5.1 tokens fails every membership check (measured: 0 of 301 tokens match unnormalized). The pure core never sees reporter JSON — it receives the normalized sets.

Outcomes reuse `ExecOutcome` (`lib/specLint/types.ts:172`) verbatim. A spawn that times out, is signalled, or fails to start yields NO collected set for that config, and every candidate under it draws the unobserved advisory of §5.3 — never a zero-collection verdict. Absence of an observation is never an observation of absence.

### 5.3 Verdict

Pure core, given `ReadonlyMap<string, ReadonlySet<string> | { unavailable: string }>` keyed by config value:

- Config observed, a named spec file NOT in its collected set → `PLAYWRIGHT_COLLECTS_NOTHING`, `severity: "fail"`, naming the file and the config — **one finding per absent file token**, so a multi-file candidate whose first file is collected still fails on a later absent one (the `01-shell-and-strip.md:171` shape).
- Config observed, every named file present → nothing.
- Config unobserved → `PLAYWRIGHT_COLLECTION_UNVERIFIED`, `severity: "advisory"`, carrying the reason and the stderr tail.
- `--exec-red` not passed → nothing at all. The arm is silent rather than guessing, matching every other observed arm.

`fail` here and `advisory` in §4 is not an inconsistency. A zero-collection verdict is an OBSERVED fact about the repository as it stands, with a known-correct repair (name the config); §4's finding is a judgement about a comment, on ten already-merged documents.

### 5.4 The incident, re-run

The clipsub plan records both forms as a probe table (`docs/superpowers/plans/2026-08-27-fitwithinclip-clip-subscription.md:99-105`):

```
$ pnpm heavy pnpm exec playwright test tests/e2e/popover-clip-fit.spec.ts --list
Total: 0 tests in 0 files
$ pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts \
    tests/e2e/popover-clip-fit.spec.ts --list
Total: 34 tests in 1 file
```

Under §5.1 the round-2 form is a candidate with config `(default)`; `popover-clip-fit.spec.ts` is absent from the default config's collected set, so it draws `PLAYWRIGHT_COLLECTS_NOTHING`. The repaired form draws nothing (its continuation split fails §5.1 requirements 1–2 per line). **That is the row's done condition, discharged: zero collection named rather than believed.**

Note what the arm does NOT depend on. The `pnpm heavy` wrapper is irrelevant — §5.1 matches `playwright test` as a token pair anywhere in the candidate, because nothing is executed from the candidate text and the anchoring rationale that governs `VITEST_SHAPE` (`lib/specLint/redContract.ts:568-579`, where the derived probe IS run) does not apply. That difference is deliberate and is the reason this is a separate arm rather than a widening.

### 5.5 Measured verdict-set over the probe domain (probe, 2026-08-28)

Running §5.3 over every corpus candidate, with both configs' collected sets taken from `--list` itself and normalized per §5.2 (dated 2026-08-28 scalars, same status as §5.2's): **301 file tokens across 253 candidates (22 multi-file); 274 tokens resolve as collected; 27 absent tokens draw the fail verdict across 26 candidates, and every one is TRUE** — the named file is genuinely absent from that config's collection today. The 27 split into the incident line itself (`popover-clip-fit.spec.ts` under `(default)`, the clipsub probe transcript), files collected only under the standalone config but named without `--config` in dated plans (`step3-review-page.layout`, `agendaScheduleLayout`, `tap-target-floor.layout`, `statusStripToggleLayout`, `pendingDiscardReal.layout`, `step3-review-modal.layout` — the last a second file on a multi-file candidate whose first file is collected), and files since renamed or retired (`admin-banner-layout`, `admin-banner`, `attention-gallery-layout`, `published-show-attention`, others). **Zero false verdicts is the number this arm closes on.** The verdict's ground truth IS the `--list` membership, so a false verdict requires an extraction defect, not a collection defect — which is why §5.1 is four closed token rules plus one closed two-member flag set and nothing more.

These 26 sites are dated records in merged plans, and Arm B never fires on them in CI: verdicts exist only under `--exec-red`, which runs on the document under review. A future document that deliberately QUOTES a zero-collection command as a dated transcript (as the clipsub plan §5.4 does) and is then linted with `--exec-red` draws a true-but-unwanted fail; the document waives it (`DocModel.waivers`, `lib/specLint/parse.ts:23`) — the same escape every other check uses.

---

## 6. Surface and wiring

One new pure module, lib/specLint/expectContract.ts (plain text: created by this arc, not tracked yet) — no `node:` imports, pinned by `tests/specLint/_metaPureCore.test.ts` — exporting:

| Export | Purpose |
| --- | --- |
| `checkExpectN(model, kind): Finding[]` | Arm A, §4 |
| `playwrightCollectionPlan(model, kind): PlaywrightCandidate[]` | Arm B extraction, §5.1; a candidate carries `{ line, files: string[], config: string }` — `files` is the FULL token list (§5.1 rule 2 is global) |
| `configsToProbe(plan): string[]` | distinct config values, §5.2 |
| `synthesizeCollectionVerdicts(plan, collected): Finding[]` | Arm B verdict, §5.3 |

`runLint` (`lib/specLint/run.ts:102`) gains ONE appended optional parameter carrying the Arm B observation, following the slot rule its own comment states (`lib/specLint/run.ts:109-125`): one parameter rather than two, appended last. Arm A needs no parameter — it is static and runs unconditionally on plan-kind documents.

`scripts/spec-lint.ts` performs the §5.2 spawns when `--exec-red` is passed, and injects. No new flag.

`Check` and `CHECK_ORDER` (`lib/specLint/types.ts:2-42`) are unchanged: both arms report under `taskContract`, which is where the declared-command contract already lives. Adding a `Check` member would require a `CHECK_ORDER` row and buys no grouping a reader wants.

## 7. Documented limits

Each carries a re-file trigger. Under the 2026-08-25 process mint freeze these are limits, not ledger rows.

1. **`# expect` with a non-integer expectation** (`green`, `empty`, `exactly: 0    0`) is not classified. Seven corpus sites (§4.4 decline table, first row). Recognising them means reading what each command prints, which is `BL-SPECLINT-RED-TRUTH-PROBE`'s domain. *Re-file:* a measured incident where a non-integer expectation was silently unmet.
2. **Integer followed by unparenthesised prose** (`# expect 0 before a run`) does not fire. Three sites, at least one a genuine instance of the defect. Accepting trailing prose is the one-grammar-corner-per-round growth this arc is fenced against; the parenthetical form is accepted because it is a CLOSED bracket, not open prose. *Re-file:* the form appears in a new plan AND a round is burned on it.
3. **A comment on its own line** (`# expect 72`, `02-phase0-validation-state.md:867`) has no command part and does not fire. Binding it to the preceding line requires deciding how far back to look. *Re-file:* two measured instances.
4. **An assertion the closed opener list misses.** A command asserting via `&& exit 1`, `awk 'END{exit …}'` or a helper function still draws the advisory. The advisory is then wrong but harmless, and the author deletes the now-redundant comment. Zero such sites in the corpus today. *Re-file:* one appears.
5. **`--project` filtering is not modelled.** §5.2 lists without `--project`, so the collected set is the union over projects. A command naming `--project X` where the spec is collected only under project Y draws nothing. Conservative by construction. *Re-file:* a measured instance of a zero-collection gate caused by a project filter.
6. **A Playwright command naming no spec file** is not a candidate (§5.1). *Re-file:* a measured zero-collection incident on a config-only or project-only invocation.
7. **Documents outside `docs/superpowers/plans/**`** are out of the probe domain. Spec-kind documents run neither arm.
8. **A text containing several `playwright test` invocations is declined whole** (§5.1 rule 4), never split per invocation. One corpus instance (`2026-08-26-nearmiss-candidate-render.md:138`), both invocations passing today, so the decline forgoes nothing; splitting requires shell parsing, and one config misassociation across invocations is a false fail (round-2 probe). *Re-file:* a measured zero-collection incident on a multi-invocation command.
9. **A command split across shell continuation lines is declined whole** (§5.1 rule 3), never assembled. Assembling would require reading fence structure as shell, and misreading it is the arm's only false-fire shape. One corpus instance is declined today (`2026-08-21-app-e2e-batch2.md:173`; among its 23 files one — `published-show-attention.spec.ts` — is absent from the default collection, so the decline forgoes one TRUE hit rather than risking a false one). *Re-file:* a measured zero-collection incident on a continued command.

## 8. Test plan

TDD per task. Every test derives its expected values from the corpus or from fixture text, never from a hand-copied list.

| Suite | What it catches |
| --- | --- |
| tests/specLint/expectContract.test.ts (new) | Arm A grammar: each §4.1 rule failing independently; the two §4.2 prose shapes; the §4.4 decline reasons; assertion openers |
| tests/specLint/expectPlaywright.test.ts (new) | Arm B extraction: config sentinel, the `-c` alias resolving the config (the `01-tasks.md:1003` shape), a `sh -c '…'`-wrapped command whose config is NOT read from the wrapper flag (the `red=` marker shape), a multi-file candidate with first file present and a later file absent drawing exactly one fail naming the absent file (the `01-shell-and-strip.md:171` shape), a continuation-line non-candidate (rule 3), a multi-invocation non-candidate — two `playwright test` pairs joined by `&&` — declined whole (rule 4, the `docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md:138` shape); verdict trichotomy; an `unavailable` config yields the advisory and NEVER the fail. Adapter: a captured real `--list --reporter=json` fixture is normalized per §5.2 (rootDir join + repo-relativize) into the token spelling — a raw-value passthrough fails this test |
| tests/specLint/expectContractCorpus.test.ts (new) | Walks `git ls-files docs/superpowers/plans` and asserts the Arm A fire-set is exactly the §4.4 ten, and that the Arm B candidate extraction finds the incident line (`docs/superpowers/plans/2026-08-27-fitwithinclip-clip-subscription.md:100`, the `(default)` `--list` transcript line) with config `(default)` and exactly 2 distinct configs corpus-wide, plus the `-c` alias candidate resolving standalone and the multi-file absent-second-file candidate carrying both its tokens — the zero-false-advisory measurement, re-derived from disk rather than pinned (the raw scalars — 253 candidates, 301 tokens at authoring time — drift with every merged plan and are deliberately NOT asserted) |
| tests/specLint/expectContractCli.test.ts (new) | `scripts/spec-lint.ts` renders both codes, and Arm B is silent without `--exec-red` |

Anti-tautology: the corpus suite asserts the fire-set by EQUALITY against a set derived from disk, so an arm that fires on nothing fails it (empty sweep needs a known positive, and the ten are it). The Arm B suite injects a collected set that DOES contain the file and asserts silence, so a verdict function that always fires cannot pass.

**Mutant at the probe.** Before any implementation, the corpus probe is re-run against the pattern with end-anchoring removed; it must report the two §4.2 prose sites as firing. That is production's own grammar failing for production's own reason, run at the probe rather than after the build.

## 9. Closeout

`impeccable-gate: N/A — no UI surface` — the diff touches `lib/specLint/`, `scripts/spec-lint.ts`, `tests/specLint/` and `tests/mutation/source/registry.ts`; nothing under `app/` (except none), `components/`, `app/globals.css`, `DESIGN.md` or `tailwind.config.*`. Confirmed against the actual diff at closeout.
