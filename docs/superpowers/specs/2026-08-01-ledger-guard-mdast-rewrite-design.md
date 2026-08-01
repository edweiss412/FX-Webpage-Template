<!-- spec-lint: not-ui — test-infrastructure + docs only; no layout, component, token, or dimensional change (component paths below are census subjects, not UI deliverables) -->

# Ledger graduation guard: mdast rewrite + guard-hardening restore — design

**Date:** 2026-08-01 · **Branch:** `test/ledger-guard-mdast-rewrite` · **Charter:** `BL-LEDGER-GUARD-MDAST-REWRITE` (BACKLOG.md, `## BL-LEDGER-GUARD-MDAST-REWRITE` heading) · **Class:** test infrastructure · **Effort:** M

Port `tests/docs/_metaDeferralLedgerGraduation.test.ts` from line-anchored regex lanes onto the remark/mdast AST, restore the owner-split r22–r41 hardening of `tests/components/admin/sheetIconLinkContainment.test.ts`, and close the three r41 open findings by probe. No UI, no DB, no advisory locks; one new devDependency.

---

## §1 Current state (verified live 2026-08-01 at `b31e601a5`)

- **The split is a revert, not a divergence.** Snapshot `a1cfce98d` (branch `test/guard-hardening-followup`) is an ANCESTOR of `origin/main`: `git rev-list --left-right --count a1cfce98d...origin/main` = `0 110`. Commit `2d9d0ba11` (`refactor(test): split guard-hardening arms race out of the shipping PR (owner-directed)`) restored both guard files to their whole-diff-r21 state. Restore = checkout of two paths from the snapshot + replay of registry rows added since, not a rebase.
- **Ledger guard delta:** `tests/docs/_metaDeferralLedgerGraduation.test.ts` 1012 → 616 lines (−454/+36). The revert removed, besides the container/normalization/field lanes: the r26/r29 **negation vetoes** (`NOT`/`NEVER`/`NO LONGER`/`PREVIOUSLY`/`FORMERLY` — main's `PARTIAL_BEFORE` today is `/PARTIAL(?:LY)?[\s*_`:—–-]*$/i` only, so `**Not CLOSED:**` in a bold field segment force-graduates an open entry), the r32 **`Resolution` label lane** (`**Resolution:** Shipped` closes three archive entries verbatim; main's filters match only `Status`/`Filed`), the r30 **anchored ✅ lane** (main's heading test uses bare `/✅/.test(heading)` — any ✅ in an open entry's title is an offender), and the r40 **single evaluator** `entrySectionTerminal` (main's status test re-inlines drifted copies of the field-line filters).
- **Registry replay set:** graduation rows added to the r21 file after the split — `BL-HARNESS-RESOLVER-POLICY` + `BL-HARNESS-PACKLIST-SERVER-GRAPH` (25e15388e), `BL-HEADER-JUDGMENT-CHIP-CONTRAST` + `BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA` (f7f7d32d2), three drive-timeout rows (6281ce122), `BL-CI-VITEST-EXCLUSION-COVERAGE` (669f41791). All live in `BACKLOG_GRADUATED` / `GRADUATED` (symbols, current file lines ~208/229 — line numbers are drafting-time hints).
- **Containment guard delta:** `tests/components/admin/sheetIconLinkContainment.test.ts` 1947 → 1407 (−551/+11). Companion spec text: `docs/superpowers/specs/2026-07-26-sheet-icon-link-affordance-class.md` §7 item 10 — the snapshot version's r22–r30 additions (`resolveExtensions`/`extensions` extension-redirect pins, MDX loader `extension` key, graph-wide `pageExtensions` token pin, tracked-symlink set pin, extensionless-dotfile pin, string-literal binding denial, npmrc pnpmfile pin) were reverted in the same commit (spec-is-canonical lockstep); the live spec ↔ snapshot diff is exactly that paragraph.
- **The r41 WIP patch is unrecoverable.** Branch tip IS `a1cfce98d`; no stash, no loose patch. The three r41 findings survive only as the BACKLOG sentence "census expression shapes; later same-line fields; hyphenated-id false positives" — re-derived by probe below (§4), per the finding-admissibility contract (`docs/agents/adversarial-round-economy-2026-07-31.md`).
- **Dependency claim in the charter is WRONG.** "parse each ledger with remark + remark-gfm (already dependencies)": only `remark-gfm@^4.0.1` is present (`package.json` `dependencies` — consumed at runtime by `app/help/_components/HelpTable.tsx`). `remark`, `remark-parse`, `unified`, `mdast-util-from-markdown` are absent from manifest and `node_modules`. `remark-gfm` is a unified plugin — no parser without `remark`. This spec adds **`remark@^15`** (bundles `remark-parse@11` + `unified@11`, compatible with `remark-gfm@4`) as a **devDependency** (test-tree-only consumer).
- **Guard scope today:** terminal-claim lanes run on `BACKLOG.md` active entries only; `DEFERRED.md` is covered by the graduation/no-overlap invariants, not by terminal-claim scanning. The **eight** `it()` cases: "no id is both active and archived" ×2, "every graduated id is archive-only" ×2, "no active backlog entry carries a terminal status", "no active backlog entry heading carries a terminal status", "terminal matchers catch wrapped values and the ascii-hyphen heading form (r15)" (the plants), and "the descoped origin-gate follow-up is filed with its substance intact".
- **Exemption registry:** `HEADING_TERMINAL_EXEMPT` = `{BL-CI-STALE-BRANCH-PROTECTION-COMMENT}` (mainline #628 deliberate keep — sub-entry of a still-open parent).

## §1.1 Resolved scope — do not relitigate

1. **Render-equivalent obfuscation is review's failure class, not this guard's** (r28 ratification; its full text lives in the snapshot's `normalizeSection` header — `git show a1cfce98d:tests/docs/_metaDeferralLedgerGraduation.test.ts`, "RATIFIED SCOPE" block — and in the BACKLOG charter prose; the r21 revert removed it from main's file, and the walker's header restores it). HTML wrappers, character references, escaped delimiters, commented-out headings: a ledger author reaching for those is hiding, not drifting. The AST port narrows the open instances of this class (HTML comments, `__` twins, containers now structural) but does NOT reopen the ratification for what remains (links, tables, code, raw-HTML islands — §7).
2. **Regex reimplementation of markdown grammar is out of scope** (r30 ratification). The AST port IS the sanctioned resolution — grammar questions go to the parser. Findings of the form "the walker's flattening mis-handles CommonMark construct X" are in scope ONLY with a probe showing a wrong verdict on a live-plausible ledger shape; parser-internals trivia without a verdict flip files to §7.
3. **Finding admissibility** (AGENTS.md finding-admissibility contract; `docs/agents/adversarial-round-economy-2026-07-31.md`): behavior claims are settled by probe; a hypothetical input is a finding only if a probe shows a wrong verdict (silent false negative, or false positive blocking an honest edit); a new mutation family against the guard requires a live escaping mutant demonstrated against the shipped guard. Worst-case-conservative shapes file to §7 without a round.
4. **The r22–r41 containment hardening is already 19-rounds-reviewed.** Its restore is mechanical; review of the restore covers reconcile-with-tree deltas and the census probe (§6), not relitigation of the shipped denial surfaces. `2d9d0ba11` records the owner decision that the split was PR-size hygiene, not a defect finding.
5. **Terminal-token boundaries exclude ASCII hyphen on BOTH sides** (this spec's resolution of the hyphenated-id class, §4 P4–P6; extends r40's dash-separator ratification symmetrically). `RESOLVED-vs-CLOSED` is one non-terminal token; `BL-DRIVE-RESOLVED:` is not a field claim. A compound like `re-CLOSED` is likewise not a bare claim. Ratified here; do not relitigate per-spelling.
6. **Owner-approved autonomous ship** (this session, 2026-08-01): spec/plan user gates waived; pipeline per AGENTS.md.
7. **Plants keep their historical round annotations.** The corpus is evidence; rewriting its comments is churn, not review surface.
8. **The eight `it()` names are stable.** Continuity with handoffs/HANDOFF docs that cite them; internals swap freely.

## §2 Design — parse layer and module shape

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

New helper module `tests/docs/_ledgerMdast.ts` (test-tree infra, walked by no shipped bundle):

- `parseLedger(text: string): Root` — `remark().use(remarkGfm).parse(text)`. One parse per ledger file per run.
- `extractEntries(root, text, opts: { levels: 2|3 mask; requirePrefix: string | null }): LedgerEntry[]` — **top-level headings only** (direct children of `Root`; matches today's `^`-anchored semantics — a heading nested in a blockquote neither opens an entry nor mints an id, §7). A heading is an entry when its id-flattened text yields a SHOUTY token per the existing rules: optional `[P*]` bracket prefix, optional `~~strikethrough~~` (id-flatten INCLUDES `delete` content — a struck id still occupies the heading for the no-overlap invariant), token judged whole (contains no lowercase), `BL-` prefix required where `requirePrefix` says so, token followed by dash/em-dash/en-dash/end. Entry body = subsequent top-level nodes until the next same-or-shallower top-level heading.
- `flattenLines(nodes, mode: "claim" | "id"): FlatLine[]` — depth-first over the entry's block nodes, descending `blockquote`, `list`/`listItem` (the whole r22–r26 CONTAINER class — markers, task checkboxes, nesting depth — dissolves here), `footnoteDefinition`. Contributes text from `text`, `strong`, `emphasis` inline nodes; records `strong` character spans per line. Splits at `break` nodes and block boundaries. **Drops** `code`, `inlineCode`, `html`, `link`/`linkReference`/`image` (label text included), `table` subtrees, and — in `"claim"` mode — `delete` (`~~CLOSED~~` negates; r15 ratification unchanged). `"id"` mode keeps `delete` (struck ids). `normalizeSection` and its `__`-fold/comment-strip die: both are structural now.
- `type FlatLine = { text: string; strongSpans: [start, end][] }`.
- `entryTerminal(entry: LedgerEntry): { hit: boolean; lane: string } | null` — the single evaluator (r40 architecture kept: one function used by the live walk AND exercised directly by every plant, so removing a lane wiring breaks an executable plant).

The test file keeps: registries (`GRADUATED`, `BACKLOG_GRADUATED` with provenance rows), `HEADING_TERMINAL_EXEMPT`, the eight `it()` cases including the origin-gate substance check. `TERMINAL_WORDS` union unchanged: `CLOSED|WITHDRAWN|RESOLVED|SUPERSEDED|SHIPPED|DONE|OBSOLETE|REFUTED`.

## §3 Lane semantics on the AST

Terminal TOKEN rule (all lanes): a maximal run matching `[A-Za-z0-9-]+` in flattened text that case-insensitively EQUALS a `TERMINAL_WORDS` member — hyphen excluded from both boundaries by token maximality (§1.1.5). The veto window runs on the flattened line prefix before the token: `PARTIAL(?:LY)?`, `NOT`, `NEVER`, `NO LONGER`, `PREVIOUSLY`, `FORMERLY`, with one optional intervening non-terminal word (full r29 semantics restored; emphasis marks no longer appear in flattened text, so the veto's tail class shrinks to whitespace/colon/dashes).

| Lane (regex era) | AST rule |
| --- | --- |
| `STATUS_TERMINAL` / `FILED_TERMINAL` + r22 `CONTAINER` + r27 `__`-fold + r29–r30 emphasis-label wrappers + r32 `Resolution` | **Line-leading field lane:** flattened line begins `Status` / `Resolution` / `Filed` (label word, case-insensitive) + optional colon / dash separator; terminal token directly after (through optional `✅`/whitespace) is a claim. Containers and emphasis already dissolved by flattening. |
| `boldFieldTerminalHit` (r13/r17/r27/r35/r36 label rule + particle chains) | **Bold-label lane:** per `strong` span on the line — a span is a LABEL when its text ends with a colon or the text following the span opens with a colon or dash. For labels: strip trailing closed-class particles (`PARTICLE_WORDS` inventory, r38/r39, ported verbatim); final remaining word terminal ⇒ claim (`**Resolved by:** PR #621` hits, `**Shipped precedent:**` does not). Non-label spans: per-occurrence terminal-token scan. Veto window = line prefix (r27). |
| `FIELD_VALUE_TERMINAL` (r39/r40 bare fields) | **Bare-field lane:** terminal token followed (through optional particle chain) by a colon, an em/en dash, or a whitespace-delimited ASCII dash ⇒ field-value claim. Runs on field lines only (see detection below). |
| field-line detection (`STATUS_FIELD_LINE`/`FILED_FIELD_LINE`, line-start anchored) | **WIDENED (fixes P1/P2):** a line is a field line when (a) it is line-led by `Status`/`Resolution`/`Filed`, OR (b) it carries ANY bold label (strong span, colon-terminated or externally colon/dash-labeled). Evaluation of a field line = all three lanes above. Prose lines without bold labels stay unscanned (r5/r6: narrative must not close entries). |
| `HEADING_TERMINAL` + r30 `CHECKED_TERMINAL` | **Heading lane:** flattened heading text after the id token — dash-anchored (em/en dash, or whitespace-preceded ASCII dash) terminal token, or `✅`-anchored terminal token (r30 anchored form REPLACES main's bare-`/✅/` heading test predicate; a decorative ✅ in an open title is not a claim). |
| `OPENING_TERMINAL_BOLD` / `_BARE` + r26 `firstContentLine` | **Opening lane:** first non-empty flattened line of the body (container-only lines produce no flattened text, so r26 falls out). Terminal token at line start counts any-case when inside a `strong` span, ALL-CAPS-only when bare. |

Deleted with nothing ported: `normalizeSection`, `CONTAINER`, `CONTAINER_ONLY`, `WRAP`, `AFTER`, the r27 intraword-`__` carve, the r28 comment-deletion bounds — every one is a regex workaround for structure the parser now owns.

## §4 r41 probe results (draft-time data; harness committed as sibling file `docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-probes.mjs`, r40 machinery ported verbatim from `a1cfce98d`; re-run with `node <file>`)

| # | Shape | r40 verdict | Defect | Status |
| --- | --- | --- | --- | --- |
| P1 | `**Class:** CI wiring · **Status:** CLOSED` (Status not line-leading) | silent | false NEGATIVE — line matches neither field filter, no lane sees it | **REPRODUCED** |
| P2 | `**Effort:** M. **Resolved:** by PR #700.` (closure field after non-field lead) | silent | false NEGATIVE, same filter hole | **REPRODUCED** |
| P3 | control: `**Status:** CLOSED` line-leading | hit | — | control holds (port faithful) |
| P4 | heading `## BL-P4 — RESOLVED-vs-CLOSED naming sweep` | hit | false POSITIVE — `AFTER = (?![A-Za-z0-9])` lets `-` through | **REPRODUCED** |
| P5 | heading `## BL-P5 — DONE-state gallery polish` | hit | false POSITIVE, same | **REPRODUCED** |
| P6 | `**Filed:** … see BL-DRIVE-RESOLVED: details` (hyphenated id's last segment terminal, colon after) | hit | false POSITIVE — r40 fixed only dash separators; the before-boundary also admits `-` | **REPRODUCED** |
| P7 | control: r40's own `BL-CLOSED-LOOP-FIX —` ratified fix | silent | — | control holds |

Live sweep: **zero** instances of either defect shape in today's `BACKLOG.md`/`DEFERRED.md` (0 later-field lines, 0 hyphen-terminal headings). Both classes are forward-looking; both are admissible — P1/P2 is the guard silently failing its one job (a reordered field row would drift invisibly), P4–P6 blocks honest ledger titles. Fixes: field-line detection widening (§3 row 4) and hyphen-excluded token boundaries (§1.1.5). All seven probe shapes become permanent fixtures.

The third r41 finding, "census expression shapes," names the containment file — probed in §6 after the restore, not against ledger machinery.

## §5 Fixture corpus

The snapshot's plants test (`a1cfce98d`, `it("terminal matchers catch wrapped values and the ascii-hyphen heading form (r15)")`, ~230 lines, r15–r40 annotations) ports verbatim as walker-verdict assertions: each plant's markdown feeds `parseLedger` → `entryTerminal` (or the lane-level helper the plant targets) and asserts the annotated hit/no-hit. Where a plant exercised a deleted mechanism (`normalizeSection` folds, container regex composition), the plant's MARKDOWN and verdict stay; the mechanism assertion becomes a walker assertion on the same input. New plants: P1–P7 (§4); fenced-code Status example (the r30-removed countermeasure's motivating shape — must stay silent); table-cell / link-text / HTML-comment / raw-HTML terminal words (must stay silent, §7 boundary pins); setext-heading entry (newly visible — asserted as covered); `**Resolution:** Shipped` (r32 restore); `**Not CLOSED:**` open-claim veto (r26/r29 restore); anchored-✅ heading pair (decorative ✅ silent, `✅ RESOLVED` hit).

Acceptance: every plant green; live run over today's ledgers reports zero offenders (the live-clean criterion — any hit on current `BACKLOG.md` is a walker false positive by definition, since the current tree passes the shipped guard and the sweep found no defect shapes).

## §6 Containment restore + census probe

1. `git checkout a1cfce98d -- tests/components/admin/sheetIconLinkContainment.test.ts`; restore the reverted §7-item-10 paragraph of `docs/superpowers/specs/2026-07-26-sheet-icon-link-affordance-class.md` from the snapshot in the same commit (spec-is-canonical lockstep, mirroring `2d9d0ba11`'s own procedure in reverse).
2. Run against the current tree. 110 commits landed since the snapshot; censused sets (per-file literal counts, adopter set, tracked-symlink set, extensionless dotfile set, config-graph pins) may have legitimate adopters. Reconcile by updating expected SETS only; never widen a predicate or drop a denial. Every reconcile delta is enumerated in the PR body.
3. **Census-expression-shapes probe:** against the restored censuses, attempt render-equivalent EXPRESSION variants of censused patterns — for each census (URL-builder consumers, icon-only anchors, extension/symlink/dotfile sets): a conditional expression, a template-literal composition, and a wrapped/asserted form of a pattern the census pins. A variant that ESCAPES (census stays green while the surface changed) is the reproduced finding — fix in the census, add the mutant as a plant. No escape ⇒ the finding files to the containment guard's documented-limits header, no speculative hardening (§1.1.3).

## §7 Documented limits (round-0 budget; consequence-bound)

Posture: the guard is a drift TRIPWIRE over first-party ledger prose. Its consequence bound: an honest in-place closure in prose position is caught loudly; everything else is at worst silent-open (an entry stays in the queue — the conservative direction for an archive guard), never a false graduation.

- Terminal words inside **table cells, link text/labels, images, code spans/fences, HTML comments, raw-HTML islands**: invisible by construction (dropped in flatten). r28 obfuscation ratification owns these.
- **Character references** (`C&#76;OSED`): remark cooks entities in text nodes, so SOME of this class now resolves — but it stays ratified-out; no plants chase entity spellings.
- **Nested headings** (inside blockquotes/lists) neither open entries nor mint ids (§2) — matches today; quoted entry headings in prose stay inert.
- **Bare non-leading fields without bold** (`Closed: 2026` mid-prose, no strong span): unscanned — prose legitimately discusses closure dates; the bold label or the line-lead is what makes it the entry's own field (r39 parity).
- **Compound prepositions** (`as part of`, `in favor of`): interior tokens are open-class nouns; not added to `PARTICLE_WORDS` (r40 ratification carried).
- **DEFERRED.md terminal-claim scanning**: out of scope (parity with today); graduation invariants cover it. Widening is a separate, cheap follow-up if wanted.
- **Postfix reopening semantics** (`CLOSED but reopened`): r30 boundary carried — honest reopenings are written `Status: REOPENED` or narrative, both silent.

## §8 Acceptance criteria

1. All eight `it()` cases green with walker internals; plants corpus (ported + §5 additions) green.
2. P1/P2 shapes HIT; P4–P6 shapes SILENT; P3/P7 controls unchanged. Probe harness assertions land as fixtures, not a separate script.
3. Live ledgers: zero offenders; zero changes to `BACKLOG.md`/`DEFERRED.md` needed to stay green.
4. Containment file restored; suite green after set-reconcile; census probe outcome recorded (fix or documented limit).
5. Mutation-family closure (plan-side, `docs/agents/writing-plans.md`): each lane wiring in `entryTerminal` is executable-pinned — deleting any lane breaks a named plant. Demonstrated by mutation, not read-through.
6. `pnpm test` full suite green; `tsc` (vitest AND playwright configs), eslint, `format:check` green pre-push.

## §9 Ship shape

Commits (conventional, one per task): `chore(infra): add remark parser dep` → `test(docs): mdast walker helper (TDD)` → `test(docs): port ledger guard onto walker` → `test(docs): plants corpus port + r41 fixtures` → `test(admin): restore r22–r41 containment hardening + set reconcile` → `docs(spec): sheet-icon §7.10 lockstep restore` → `docs: graduate BL-LEDGER-GUARD-MDAST-REWRITE` (guard polices its own graduation — the new walker validates the row; repo-wide reference sweep for the id, including the r30 header citation in the ledger guard itself and `BL-SOUND-REDIRECT-GUARD`'s cross-reference). PR body enumerates containment reconcile deltas. Post-merge: delete `test/guard-hardening-followup` (charter fulfilled; snapshot content merged or superseded), ff-sync main.
