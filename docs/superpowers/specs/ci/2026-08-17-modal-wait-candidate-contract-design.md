<!-- spec-lint: not-ui — no UI surface: changes land in tests/ci/modalWaitHelper/**, tests/ci/_metaModalWaitHelper.test.ts, tests/mutation/source/registry.ts, and docs; e2e specs and app/ files are cited as evidence, not modified surfaces -->

# Modal-wait candidate contract v2 — statement-unit census + site-associated wait labels

**Date:** 2026-08-17 · **Ledger:** `BL-MODAL-WAIT-SITE-ASSOCIATED-COUNTS` + `BL-MODAL-WAIT-LINE-GRANULARITY-ACTIVATION` · **Branch:** `fix/modal-wait-candidate-contract`
**Status:** DRAFT (spec/plan-only arc; implementation is a separate session)
**Parent:** `docs/superpowers/specs/ci/2026-08-16-modal-wait-boundary-helper-adoption-design.md` (PR #830, merge `db54037f0`) — the census, the guard, and the helper contract all ship there and are extended, never re-derived, here.

The parent arc shipped a census-plus-disposition guard for the modal-wait helper adoption: `tests/ci/modalWaitHelper/scan.ts` enumerates every open-site candidate from five origins, `tests/ci/modalWaitHelper/disposition.ts` says what a human decided about each, and `tests/ci/_metaModalWaitHelper.test.ts` asserts the disposition is total. Two documented limits shipped with it, each filed as its own ledger row and each probed rather than inferred (both probe transcripts are in the rows and in `scan.ts`'s header, `tests/ci/modalWaitHelper/scan.ts:26-57`):

1. **Aggregate counts** (`BL-MODAL-WAIT-SITE-ASSOCIATED-COUNTS`): origin (f) counts adopted waits per §4.2 shape (30 G / 9 U / 12 N as of authoring), so a DELETED wait is caught but a MOVED one is not — cut the wait after the Enter-open in `published-review-modal.interactions.spec.ts` and paste it beside the already-protected click, and the count still reads 12 while one member is orphaned.
2. **Line granularity** (`BL-MODAL-WAIT-LINE-GRANULARITY-ACTIVATION`): a candidate carries the ONE physical line its testid appears on, so origin (d) can only answer "does THIS LINE activate". An activation whose verb lands on another line — a chained call split by ordinary formatting, or a `click()` inside a `page.evaluate` body whose testid sits on the argument line — is certified as a pure reference.

Both rows prescribe the same repair direction: change the CONTRACT, not the grammar — "build candidates from TypeScript statements … so the existing activation-verb refusal covers both members at once" (row 2), and "a model of 'this wait belongs to that open' … requiring each Shape-N member site to carry an explicit `label`" (row 1). This arc is that contract change, done once for both rows because they are one contract: the label a Shape-N call carries is on a DIFFERENT physical line than the call for 4 of the 12 live sites (probe, §2.2), so the site-association repair is unbuildable on the line unit — row 1 structurally requires row 2.

## 1. Scope

In scope:

- **Candidate contract v2** in `tests/ci/modalWaitHelper/scan.ts`: `enumerateCandidates` rebuilt on TypeScript statement units (§4.1). The `typescript` package is already a dependency of this tree (`tests/_shared/stripComments.ts:5`, `tests/mutation/source/operators.ts:1`).
- **Disposition rewrite** in `tests/ci/modalWaitHelper/disposition.ts`: every rule re-authored against the v2 candidate shape; comment-mention rules retired (comments leave the candidate domain by construction); counts re-derived (§4.3).
- **Site-associated N-wait registry** (§4.2): a declared table associating each `awaitReviewModalOrRecover` call with the file and test/describe scope it protects, asserted exactly.
- **Meta-test extension** in `tests/ci/_metaModalWaitHelper.test.ts`: premise proofs for both ledger probes (now red-by-construction) and for the registry assertions (§4.4).
- **Mutation-registry duties**: `modal-wait-helper-scan` re-scored (every accepted `siteId` relocates on any `scan.ts` edit — `tests/mutation/source/registry.ts:280-284` NOTE); enrolment posture for `disposition.ts` resolved with a probe run (§4.5).
- Ledger graduation for both rows + README index row (§4.7).

Out of scope:

- **`scanForViolations` (the §4.4 violation guard) is untouched.** Its single-line recognizer, its exemption mechanism, and its two pinned exemptions are ratified with an explicit fence (parent §4.4, parent limit 5); this arc changes the CENSUS, not the guard.
- **The helper module's contract** (`tests/e2e/helpers/openShowReviewModal.ts`) — no signature, timeout, recovery-bound, or label-semantics change. The `label` option already exists (`AwaitModalOptions`, `tests/e2e/helpers/openShowReviewModal.ts:58`); this arc reads it, it does not redefine it.
- **Behavioral edits to any e2e spec.** All 12 live `awaitReviewModalOrRecover` calls already carry an extractable `label:` property (probe, §2.2), so the expected e2e diff is zero. If implementation-time re-derivation finds a label missing or unextractable, a label-only edit is permitted; nothing else is.
- **`BL-MODAL-WAIT-SKELETON-TOLERANT-SITES`** — deliberately fenced out. It changes different files (the helper's wait contract plus two specs' assertions, `published-review-modal.deeplink.spec.ts:344` / `published-review-modal.realtime.spec.ts:913`) and it DEPENDS on this arc's contract: when it lands, its new member sites must enroll in the census this spec defines. §4.6 states the extension seam so that arc re-opens neither of this arc's rows.

### 1.1 Resolved scope — do not relitigate

- **Repair direction is ratified in both ledger rows: change of unit / declared association, never recognizer growth.** Both rows record that the filing arc spent counted rounds 3-5 adding one grammar corner per round on this axis and cite AGENTS.md's repair-direction rule (narrowing or documented limit, never growth). Findings proposing a third grammar corner, a "check the next line too" arm, or control-flow analysis through wrappers/loops relitigate the filed disposition of both rows.
- **The violation guard's fence stays.** Parent §4.4 + parent limit 5: the guard recognizes the single-line navigation shape only. This arc does not widen it, and findings that it "misses" a spelling file to the parent's documented limits, not here.
- **Wait-to-site association is DECLARED, never inferred.** The registry (§4.2) is an author-written claim checked for consistency, exactly like the ledger's invariant-12 status markers ("the ledger only ever reports what an author wrote down", AGENTS.md invariant 12). Proposals to INFER association — following calls through local wrappers, loops, or `release()` gates — are the control-flow analysis both rows explicitly declined; a lying declaration is outside the threat fence (§6).
- **`readySelector` stays removed; recovery bound stays 1; `--retries=0` posture untouched** (parent §1.1, §4.1). No finding on helper semantics is in scope — the helper is not an edited surface.
- **Counts are as-of-authoring and non-normative** (parent §2 precedent). Every `expectedCount` and the registry row set are re-derived at implementation; the tables in this spec render the probe of 2026-08-17. Findings that a count in this document is stale against the live tree are not admissible; the meta-test's drift check is the normative comparison.
- **The two skeleton-tolerant sites stay excluded** (parent §2.5, limit 3b; `d/skeleton-tolerant-click` at `tests/ci/modalWaitHelper/disposition.ts:403-412`). Their repair is the fenced-out sibling arc (§1, §4.6).
- **Comment-mention candidates leave the domain deliberately, via strip-before-match** (§4.1). The parent's five prose rules existed only because the line unit had to disposition comment lines; v2 blanks comment bytes before any origin regex runs (shared `stripCommentsForFile`, the single source `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` pins), and a comment-out of a member site reds the member count. Findings that the census "lost" comment coverage relitigate the unit change both rows prescribe. The violation guard's own comment handling (`stripCommentsForFile` at `tests/ci/modalWaitHelper/scan.ts:232`) is unchanged.

## 2. Current mechanism and probes (run 2026-08-17; re-derive at implementation)

### 2.1 What the line unit sees

`enumerateCandidates` (`tests/ci/modalWaitHelper/scan.ts:300-347`) walks `tests/e2e/*.spec.ts` line by line; a candidate is one line plus one origin. `disposition.ts`'s rules then match candidate TEXT — one line of it. The activation-verb refusal (`ACTIVATION_VERB`, `tests/ci/modalWaitHelper/disposition.ts:66-67`) and the reference-only allowlist (`d/reference-not-activation`, `tests/ci/modalWaitHelper/disposition.ts:424-462`) therefore see one line, which is the entire mechanism of ledger row 2. Origin (f)'s three member rules pin aggregate shape counts (`tests/ci/modalWaitHelper/disposition.ts:183`, `tests/ci/modalWaitHelper/disposition.ts:194`, `tests/ci/modalWaitHelper/disposition.ts:206`), which is the entire mechanism of ledger row 1.

### 2.2 Probe: statement-unit census over the live corpus

A throwaway `tsx` probe (parse each spec with `ts.createSourceFile`; attribute each origin-match position to its nearest enclosing `ts.Statement`; dedupe per statement × origin) run against the live corpus at `59a9ef25a`:

| origin | line-unit candidates | statement-unit candidates |
| --- | --- | --- |
| a | 36 | 22 |
| b | 102 | 95 |
| c | 42 | 27 |
| d | 41 | 41 |
| e | 21 | 20 |
| f | 51 | 51 |

The collapse in (a)/(c) is comments and multi-match statements leaving the domain; (d) and (f) are unchanged, which is what lets the member arithmetic carry over. All 12 `awaitReviewModalOrRecover` statements yield an extractable `label:` property source text, and 4 of the 12 carry it on a different line than the call (`tests/e2e/published-review-modal.deeplink.spec.ts:248`, `tests/e2e/published-review-modal.deeplink.spec.ts:283`, `tests/e2e/published-review-modal.realtime.spec.ts:790`, `admin-lifecycle-transitions.spec.ts:176`) — the fact that makes row 1 depend on row 2. Every one of the 12 resolves an enclosing test/describe title or module scope:

| file | line | label source | enclosing scope |
| --- | --- | --- | --- |
| `admin-lifecycle-transitions.spec.ts` | 176 | `"reload:expectFlipLanded"` | (module scope — `expectFlipLanded`) |
| `alert-action-links.spec.ts` | 365 | `` `route-loop:${route}` `` | "every internal bell link's fragment resolves…" |
| `needs-attention-holds.spec.ts` | 338 | `"click:inbox-identity-hold"` | "card link opens the show's review surface…" |
| `published-review-modal.closeFreshness.spec.ts` | 59 | `"click:dashboard-row"` | "published review modal / dashboard freshness…" |
| `published-review-modal.deeplink.spec.ts` | 248 | `"legacy-307:alert_id"` | "SIGNED-IN legacy /admin/show/… 307…" |
| `published-review-modal.deeplink.spec.ts` | 283 | `"legacy-307:alert_id+fragment"` | "SIGNED-IN combined legacy…" |
| `published-review-modal.interactions.spec.ts` | 268 | `"keyboard-enter:row"` | "focus continuity: Esc-close restores focus…" |
| `published-review-modal.interactions.spec.ts` | 362 | `"click:row-trigger"` | "row-click open leaves NO stranded optimistic…" |
| `published-review-modal.interactions.spec.ts` | 533 | `"gated-open:sheet"` | "§6.5 closed→open entrance: the SKELETON plays shee…" |
| `published-review-modal.interactions.spec.ts` | 555 | `"gated-open:popup"` | "§6.5 closed→open entrance at ≥sm…" |
| `published-review-modal.realtime.spec.ts` | 790 | `"click:dashboard-row"` | "an ABORTED close clears armed freshness cues…" |
| `published-review-modal.reopen.spec.ts` | 70 | `"click:dashboard-row"` | "published review modal / reopen the same show" (describe) |

`"click:dashboard-row"` recurs in three FILES and never within one scope, so identity keyed on (file, scope, label source) needs zero corpus renames.

The probe matched RAW text and excluded only trivia with no enclosing statement; the shipped strip-before-match contract (§4.1) also excludes comment matches that inherit an enclosing statement's span, so implementation-time counts re-derive at or below these. Both ledger probes re-confirmed under the statement unit: the hydration poll whose testid sits on the evaluate ARGUMENT line resolves to one 15-line statement at `published-review-modal.realtime.spec.ts:92` whose text carries NO activation verb today — so replacing a body read with `.click()` flips the statement-level refusal, which is exactly the visibility row 2 asks for. The multiline chained style the corpus uses at `admin-layout-dimensions.spec.ts:297-299` (`await page` / `.getByTestId(…)` / `.evaluate(…)`) attributes the same way; rewriting the single-line activation at `admin-layout-dimensions.spec.ts:260` into that style lands the verb inside one statement rather than off the candidate line.

## 3. Approaches considered

1. **Statement-unit census + declared N-wait registry (CHOSEN, §4).** One unit change closes row 2 (the statement text carries the verb wherever formatting put it) and enables row 1 (labels become census-visible wherever formatting put THEM); a declared registry keyed (file, scope, label) closes the cross-scope move without any flow analysis. Cons: every disposition rule re-authored and every count re-derived — accepted, both rows already say the repair "changes the candidate contract, every count in disposition.ts, and the mutation ledger".
2. **Control-flow association** — resolve which open each wait follows through local wrappers, loops, and `release()` gates. Rejected: this is verbatim the analysis both rows declined at filing, on a surface AGENTS.md's repair-direction rule already places under same-axis recurrence. Recorded so it is not re-proposed.
3. **Label SET assertion alone** (the ledger row's minimal sketch: unique labels, pinned set). Rejected as insufficient by the ledger's own probe: a verbatim cut-paste move carries its label with it, so the set — like the count — is invariant under exactly the defect being closed. The scope key is what makes the move observable, and the probe (§2.2) shows it costs nothing today.
4. **Line-window proximity association** ("the wait must sit within K lines of its open"). Rejected: a recognizer bounded by a number, the shape `docs/agents/writing-plans.md` repair-economy rule (1) names as the next reviewer's first finding; and wrapper-mediated sites (reopen's one wait for four clicks) sit legitimately far from every open they protect.
5. **Blanking nested function bodies out of statement text** (to keep container statements small). Rejected: it destroys precisely the evidence row 2 exists to surface — the `page.evaluate` body's `.click()` is inside a nested function. Container-statement discrimination is handled at the rule layer instead (§4.3).

## 4. Design

### 4.1 Candidate contract v2 — the statement unit

`enumerateCandidates` parses each population file with `ts.createSourceFile` and attributes every origin-match position to its **nearest enclosing `ts.Statement`**. Origin predicates run over the **comment-STRIPPED file text** — the shared `stripCommentsForFile` (`tests/_shared/stripComments.ts:215`), which blanks every comment to spaces "preserving length, offsets and line numbers" (its own contract), so a match offset in the stripped text addresses the same location in the raw AST. The regexes and the shared `MODAL_ROUTE_PATTERN` (AC-2b-pattern) are unchanged; what changes is the attribution unit and the match domain.

The v2 `Candidate`:

```ts
export type Candidate = {
  file: string;
  /** 1-based start line of the owning statement; the stable report anchor. */
  line: number;
  endLine: number;
  origin: CandidateOrigin;
  /** Statement span sliced from the comment-STRIPPED text (nested callback bodies included). */
  text: string;
  /** 1-based line of the first origin match inside the statement. */
  matchLine: number;
  /** That line, from the stripped text; the discrimination handle for title/assertion rules. */
  matchLineText: string;
  /** Nearest enclosing test()/describe() title, or null at module scope. */
  scopeTitle: string | null;
  exemptReason: string | null;
};
```

Contract consequences, each deliberate:

- **Comments produce no candidates — because their bytes are blanked BEFORE matching, not by any parser premise.** Spec-review R2 refuted the earlier "trivia has no enclosing statement" premise with a probe: comment-out the live activation at `needs-attention-holds.spec.ts:336` and the comment position sits inside an enclosing statement's span, whose `getText` includes interior comments — the raw-text census silently re-certified the disabled site at all nine current-corpus instances of the class. Strip-before-match is the mechanism that survives it: a comment byte is a space when the regexes run, so no origin can match there, whatever statement spans it. Candidate `text` and `matchLineText` are sliced from the SAME stripped text over the statement's span, so rules and refusal gates see live code only. The five prose rules (`a/prose`, `b/prose`, `c/prose`, `d/prose`, `e/prose`) and the `isComment` field are retired; a commented-out helper call is no longer an origin-(f) candidate, matching what `scan.ts:331-343` achieves by stripped-line regex today. The violation guard keeps its own comment handling unchanged.
- **A comment-out is loud, not silent.** Commenting out a member open site removes its candidate, and the member rule's pinned count drifts — the census REDS naming the rule (v1 reached the same loudness through prose-rule counts; v2 reaches it through domain exclusion plus the same count pins). An executable premise proof pins this (§4.4).
- **Nested attribution is automatic.** A match inside a callback BODY attributes to the innermost statement in that body; a match in a statement's direct expression — arguments, chained calls, template literals — attributes to the whole statement. That is what re-unites a split-chained activation (`await page` / `.getByTestId(…)` / `.press("Enter")` is ONE statement) and what puts a `page.evaluate` body's `.click()` into the same candidate text as the testid on the argument line — the two probed members of row 2, closed by the same property.
- **Dedupe per (statement, origin).** Several matches of one origin in one statement yield one candidate; `matchLine`/`matchLineText` come from the first. Distinct origins on one statement still yield distinct candidates, as today.
- **Container statements are legal candidates.** A route mention in a `test(…)` TITLE attributes to the whole test-call statement, whose text contains the body. Rules discriminate these via `matchLineText` (§4.3); the safety net is unchanged — a mis-claimed container turns up as `ambiguous` or `undisposed`, both loud.
- **`exemptReason`** resolves by the same marker grammar as today (`// modal-wait-exempt:` on the match line or the line above it), reusing the guard's `exemptionReasonAt`.
- **`scanForViolations` and `productOpenSurfaces` are byte-unchanged.** The statement machinery lives in the candidate producer only.

### 4.2 Site-associated N-waits — the declared registry

`disposition.ts` exports a registry declaring, for every `awaitReviewModalOrRecover` call in the corpus, which site it protects:

```ts
export type NWaitSite = {
  file: string;
  /** Enclosing test()/describe() title, or null at module scope. */
  scopeTitle: string | null;
  /** SOURCE TEXT of the call's label property value, verbatim: identity, not runtime value. */
  labelSource: string;
  /** Prose: the open site(s) this wait discharges. Human documentation, not machine-checked. */
  protects: string;
};
export const N_WAIT_SITES: NWaitSite[] = [ /* 12 rows as of authoring; see the probe table in this spec */ ];
```

The meta-test asserts, replacing the bare `f/member-shape-N` count:

1. **Extractability:** every origin-(f) candidate whose statement calls `awaitReviewModalOrRecover` yields a `label:` property whose value's source text is extractable from the statement. A call with no label, or a label the extractor cannot resolve, is reported by file:line and FAILS — the census refuses to certify what it cannot identify.
2. **Exact registry match:** the multiset of observed `(file, scopeTitle, labelSource)` triples equals `N_WAIT_SITES` exactly — a missing row names the wait that vanished (the DELETE case, now failing with its site named instead of `12 ≠ 11`), an extra row names the wait nobody declared, and a triple whose `scopeTitle` moved names the wait that changed scope (the ledger's MOVE probe: the wait cut from the Enter-open's test and pasted into the click's test arrives with the wrong scope and REDS, count intact). A move that stays INSIDE its declared scope — including below the assertions it protects — keeps its triple; that is documented limit 2, deliberately outside these assertions.
3. **Scope-local uniqueness:** `labelSource` is unique within `(file, scopeTitle)`. Cross-file and cross-scope repetition stays legal — `"click:dashboard-row"` in three files (§2.2) needs no rename.
4. **Derived count:** `f/member-shape-N`'s `expectedCount` becomes `N_WAIT_SITES.length`, never a retyped literal.

Identity is the label's SOURCE TEXT, so `` `route-loop:${route}` `` — a template whose runtime value varies per loop iteration — is one stable identity without corpus changes.

**Mode boundary:** Shapes G and U keep aggregate counts. Their helper call IS the open site — navigation and wait are one statement, so "moving the wait" is re-siting the open, which the census re-derives; the orphaning defect of row 1 exists only where the wait is decoupled from its open, which is Shape N by definition (parent §4.2).

**What the registry is:** a declaration checked for consistency, in the invariant-12 sense — the census verifies that what authors wrote (labels, scopes) matches what the corpus holds, and never infers which open a wait "really" protects. The `protects` field is documentation for the human adding or moving a row; checking it would be the control-flow analysis both rows declined (§6 fence, documented limit 1).

### 4.3 Disposition rewrite — rule-authoring contract

Every rule is re-authored against the v2 shape. Three binding principles, replacing per-rule improvisation:

1. **Refusal gates read the whole statement.** Any rule whose disposition is "this is a reference, not an activation" — `d/reference-not-activation` and any successor — MUST refuse (return false, falling the candidate through to `undisposed`) when `ACTIVATION_VERB` matches `candidate.text`. This single clause is row 2's closure: both probed members carry their verb in the statement text, so both now land in front of a human instead of inside a silent exclusion. The four hydration-poll statements get an explicit exclusion rule carrying the same statement-level refusal, so editing a poll body to activate REDS the census (§2.2 probe: their statements carry no verb today).
2. **Title and assertion discrimination reads `matchLineText`.** `isTestTitle`, URL-assertion, and continuation-line predicates ask about the line the match landed on, not the container's full text — a `test(…)` container claimed via its title must not also be claimable by a body-reading member rule, and member rules for origins (a)/(f) exclude title-line matches (`!isTestTitle(matchLineText)`) where the collision is possible. The disjointness assertions (`ambiguous === []`) remain the executable check that the discrimination held.
3. **Every count re-derived; every rule still counted.** The meta-test's existing every-rule-carries-a-count and drift assertions (`tests/ci/_metaModalWaitHelper.test.ts:395-421`) carry over unchanged in kind; the §4.2 arithmetic test (`tests/ci/_metaModalWaitHelper.test.ts:423-435`) is updated to the v2 numbers with `f/member-shape-N` derived from the registry. As-of-authoring expectation from the probe: candidate total ~256 vs today's ~293, member arithmetic 30 G + 9 U + 12 N unchanged.

### 4.4 Meta-test extension — premise proofs, red-first

New executable premise proofs (fixture-root pattern already in the suite, `tests/ci/_metaModalWaitHelper.test.ts:68-74`), each pinning one ledger probe:

- **Split-chained activation is not certifiable as reference** (row 2, member 1): a fixture spec holding `await page`\n`.getByTestId("shows-table-row-x")`\n`.press("Enter");` — the candidate is one statement, `ACTIVATION_VERB` matches its text, and classification against the shipped rules reports it `undisposed`, never claimed by a reference-only rule.
- **Evaluate-body activation is not certifiable as reference** (row 2, member 2): a fixture with the corpus's hydration-poll shape whose body contains `(el as HTMLElement).click()` — same assertion. The un-mutated poll shape (body reads only) is separately asserted NOT undisposed once its exclusion rule lands, so the pair proves the refusal discriminates rather than blanket-fails.
- **A deleted N-wait fails naming its row** (row 1): classification of a fixture corpus derived from a registry of 2 rows with one wait removed reports the missing `(file, scopeTitle, labelSource)` triple.
- **A cross-scope move fails naming both ends** (row 1, the ledger's probe): the same wait relocated into a different test block reds with the declared scope and the observed scope in the message.
- **An unlabeled N-wait fails extractability**: `awaitReviewModalOrRecover(page, { timeoutMs: 30_000 })` in a fixture is reported by file:line.
- **A commented-out member activation is not silently certified** (spec-review R2 pin): a fixture holding a live row activation plus its N-wait passes; the same fixture with the activation line commented out drops the activation candidate and REDS the member-count assertion — and the commented line yields no candidate of ANY origin (the strip-before-match mechanism, asserted directly).
- **Container discrimination**: a fixture `test("covers /admin?show= deeplinks", …)` whose body holds an adopted helper call classifies the container to the title rule and the call to its member rule, with `ambiguous === []`.

Existing guard premise proofs (`tests/ci/_metaModalWaitHelper.test.ts:82-204`), the shared-route-constant cases (`tests/ci/_metaModalWaitHelper.test.ts:206-234`), and the exemption-inventory pin (`tests/ci/_metaModalWaitHelper.test.ts:247-263`) stay green; edits to them are limited to the v2 candidate field names.

### 4.5 Mutation-registry duties

- **`modal-wait-helper-scan` is re-scored in the same commit as any `scan.ts` edit.** Both accepted rows relocate (`statement-removal:189:9`, `integer-literal:384:83` — `tests/mutation/source/registry.ts:283-296`); the registry NOTE mandates same-commit id refresh. `scoreFloor` stays 0.95; new survivors are repaid with deciding cases or accepted with per-row reasons, and the score plus the unaccepted-survivor set is reported in the implementation arc's round-1 diff brief (AGENTS.md convergence criterion 4). Scoped run mechanics per the 2026-08-17 lessons file: filter `GUARD_SURFACES` in a temporary shard file, run, delete it.
- **`disposition.ts` enrolment is resolved at implementation, before the first diff-review dispatch.** It is now more than a literal table (registry semantics + statement-level refusals), it is an importable module, and its referring suite exists — registry-expressible shape. Enrolment is attempted with a probe run; if the survivor set is dominated by equivalent mutants of prose `reason`/`protects` strings, the honest outcomes are per-row accepted entries or a probe-backed not-expressible disposition (the step3 precedent, AGENTS.md criterion 4) — never symbolic enrolment.

### 4.6 Extension seam — how the skeleton-tolerant arc lands without re-opening these rows

`BL-MODAL-WAIT-SKELETON-TOLERANT-SITES` will give the helper a skeleton-aware wait and adopt `published-review-modal.deeplink.spec.ts:344` + `published-review-modal.realtime.spec.ts:913`. Under this contract that arc touches exactly:

1. The helper module (its own fenced surface — out of scope here).
2. The two spec files' waits (new helper calls carrying `label:`s).
3. `disposition.ts`: two `N_WAIT_SITES` rows added; the `d/skeleton-tolerant-click` exclusion (`tests/ci/modalWaitHelper/disposition.ts:403-412`) retired or narrowed; if the new entry point is a new function name, one alternation added to the origin-(f) `HELPER_CALL` pattern (`tests/ci/modalWaitHelper/scan.ts:108-109`).
4. The meta-test's pinned exemption inventory: the `published-review-modal.deeplink.spec.ts:344` exemption row removed.

Nothing in the candidate producer, the statement unit, or the registry ASSERTIONS changes — new member sites are new rows in existing vocabularies. That is the seam: this arc's rows re-open only if that arc must change the census MECHANISM, and the enumeration above shows it does not.

### 4.7 Ledger + docs bookkeeping

- Both rows graduate to `BACKLOG-archive.md` on the implementation PR's merge, each recording the contract change and this spec as the durable form; the in-progress markers come off in that PR's last commit (invariant 12).
- This spec gets its `docs/superpowers/specs/ci/README.md` index row in this arc's own commits.
- The plan carries `impeccable-gate: N/A — no UI surface`.

## 5. Acceptance criteria

- **AC-1 (statement unit):** `enumerateCandidates` produces v2 candidates per §4.1 — statement-attributed, matched and texted on the comment-stripped bytes, container-legal, deduped per (statement, origin) — and the row-2 premise proofs (§4.4) pass: both probed member shapes classify `undisposed` against the shipped rules, and the comment-out proof reds the member count, red-first (asserted failing against the v1 line-unit rules before the rewrite lands, in the plan's RED step).
- **AC-2 (registry):** `N_WAIT_SITES` ships with the §4.2 assertions — extractability, exact (file, scopeTitle, labelSource) match, scope-local uniqueness, derived N count — and the three row-1 premise proofs (delete, cross-scope move, unlabeled) pass red-first. The live corpus passes with 12 rows and zero e2e spec edits (or label-only edits, each named in the PR body).
- **AC-3 (total disposition preserved):** on the live corpus, `undisposed === []`, `ambiguous === []`, drift `=== []`; every rule carries a count and matches ≥1 candidate; member shapes remain G/U/N with the §4.2 arithmetic asserted, `f/member-shape-N` derived from the registry.
- **AC-4 (route-pattern single source):** `MODAL_ROUTE_PATTERN` remains the one exported route regex consumed by both the guard and origin (a) (`tests/ci/_metaModalWaitHelper.test.ts:227-233` green with at most candidate-shape edits).
- **AC-5 (guard untouched):** `scanForViolations` behavior is unchanged — all guard premise proofs and the two-entry exemption-inventory pin pass without assertion edits.
- **AC-6 (mutation duties):** `modal-wait-helper-scan` re-scored ≥0.95 with accepted-row ids refreshed in the same commit as the `scan.ts` edit; `disposition.ts` enrolment resolved per §4.5 with its probe evidence; both stated in the implementation round-1 diff brief.
- **AC-7 (bookkeeping):** ledger graduation wiring, README index row, review-rounds corpus rows land with their respective arcs (README row with this arc; graduation with the implementation PR).

## 6. Consequence bound, probe domain, threat fence (for review dispatches)

- **Consequence bound:** over the finite candidate set the census enumerates from the live corpus, plus the declared registry: every candidate is claimed by exactly one rule or the suite fails naming it (`undisposed`/`ambiguous`); every declared N-wait row is observed exactly once at its declared (file, scope) or the suite fails naming the row; every N-wait statement yields an extractable label or the suite fails naming the call. There is no silent-pass path through those claims; a conservative refusal that surfaces as a loud `undisposed` is a DOCUMENTED LIMIT, not a finding. The bound ranges over the census's OWN claims — candidate disposition totality, wait presence, scope, label identity — and over that machine-enumerated set only. Statement ORDER within a declared scope is outside the bound by design (documented limit 2): the corpus-semantics residue there is a loud generic test failure, never a silent test pass, and findings on it file to that limit. The bound is never quantified over all imaginable specs, formattings, or navigation spellings.
- **PROBE DOMAIN:** `tests/e2e/*.spec.ts` at the branch head, `tests/ci/modalWaitHelper/**`, and `tests/ci/_metaModalWaitHelper.test.ts` (its fixture specs included). An admissible probe is an input drawn from those files or one ordinary edit away from one (a reformat, a cut-paste move, a comment-out, a deletion). A constructed input further away files to documented limits, not to a finding.
- **Threat fence:** ordinary authoring mistakes by a contributor editing the corpus — moving, deleting, reformatting, or copy-pasting existing patterns. Out of scope: adversarial obfuscation; a label or registry row that deliberately LIES about what it protects (declarations are trusted as declarations, invariant-12 posture); activations reached through project-defined helper functions the statement does not textually contain. Each files to documented limits. Every admissibility judgement cites this fence and the probe domain together.
- **Convergence criterion:** `modal-wait-helper-scan` is enrolled (`tests/mutation/source/registry.ts:248`); for implementation-stage review, convergence is the mutation score plus an empty unaccepted-survivor set, and a "the guard does not pin what it claims" finding is admissible only with a surviving mutant from the declared operator set. For THIS arc's spec/plan stages, convergence is: no finding admissible under the bound, domain, and fence above — a review that finds none says so plainly and APPROVEs.

## 7. Documented limits

1. **Wrapper-mediated association is declared, not verified.** `published-review-modal.reopen.spec.ts:70`'s one wait discharges four click sites; the registry row says so in `protects` prose, and no machine checks that the four clicks are the sites it names. Verifying it is flow analysis through the wrapper — the analysis both ledger rows declined. Cost: a wrapper whose caller set drifts keeps a stale `protects` note; the waits and scopes themselves stay pinned.
2. **Within-scope PLACEMENT is invisible — the registry pins presence and scope, never position.** A wait relocated WITHIN its declared (file, scope) keeps its triple, and that includes the worst placement: one ordinary cut-paste can move a wait BELOW the assertions it exists to protect while every registry assertion still passes (spec-review R1 probe: `published-review-modal.reopen.spec.ts:70` moved below the wrapper's own modal/focus assertions — triples equal, count 1 → 1; every one of the 12 rows admits the same edit). The census claim is deliberately "this scope declares and contains this wait", not "this wait runs before what depends on it": verifying position against the assertions a wait protects means classifying downstream assertions, which is the flow analysis both ledger rows declined (§6 fence). Cost, stated exactly: a mis-placed wait leaves its scope failing the gateway-502 class as the generic downstream timeout, without the annotation or the `show_review_snapshot_failed` hint — degraded but LOUD, never a silent test pass. That is the same outcome class both ledger rows carried as OPEN (severity LOW, "the orphaned site still FAILS; it just fails generically"), now narrowed from "any move anywhere" to "a placement change inside the wait's own declared scope". Re-open trigger: an actual mis-placement surfaced in review or CI.
3. **A lying declaration passes.** A registry row (or label) that names the wrong site is consistent as far as the census can see — declarations are trusted, per the fence. The census makes the lie REVIEWABLE (the label sits in the diff next to the site it claims), which is the row-1 posture: self-evidencing, not self-verifying.
4. **Origin omission is unchanged** (parent limit 7): a load produced by none of the five origins stays invisible; this arc changes the unit of what the origins see, not the origin set.
5. **The violation guard's limits are unchanged** (parent limits 5, 7c): single-line goto shape, variable-URL and click-open spellings unrecognized by the GUARD (the census dispositions them; the guard does not block them).
6. **Cross-statement split activation still needs a declared rule.** A binding statement (`const trigger = page.locator(…)`) and a later `trigger.click()` are two statements; the testid match sees only the first, exactly as the line unit did. The declared per-site member rule (`d/member-split-activation`, `tests/ci/modalWaitHelper/disposition.ts:376-390`) remains the mechanism; a new split spelling falls to `undisposed` via principle §4.3-1's narrowed reference arms, not to silent certification — that fall-through is the inherited safety net, not new coverage.
7. **Cross-function activation is invisible.** An activation inside a project helper function called BY the statement (`await openRowViaHelper(page, slug)`) is not in the statement's text. Following the call is flow analysis; out of fence.

## 8. Invariant-8 disposition

No UI surface: changes land in `tests/ci/**`, `tests/mutation/source/registry.ts`, and docs. The plan closeout carries `impeccable-gate: N/A — no UI surface`.
