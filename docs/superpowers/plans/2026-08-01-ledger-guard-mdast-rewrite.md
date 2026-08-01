# Plan: ledger-guard mdast rewrite + guard-hardening restore

**Spec:** `docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md` (canonical; this plan implements it, TDD per task, one commit per task). **Branch:** `test/ledger-guard-mdast-rewrite`. **Charter:** `BL-LEDGER-GUARD-MDAST-REWRITE`.

## Meta-test inventory (mandatory declaration)

This milestone CREATES no new registry meta-test and EXTENDS none of the standing registries (`tests/auth/_metaInfraContract.test.ts`, sentinel-hiding, admin-alert catalog, advisory-lock topology, no-inline-email-normalization): the change is test-infrastructure over docs plus a test-file restore — the ledger guard itself IS the structural meta-test being rebuilt, and the containment guard being restored is another. No auth, DB, alert, or tile surface is touched.

## Mutation-family closure set (round-economy rule; the review converges against THIS enumeration)

| Family | Escaping mutant shape | Pinned by |
| --- | --- | --- |
| M1 lane deletion | remove one lane wiring from `entryTerminal` | one executable plant per lane (r40 architecture) |
| M2 terminal-word removal | drop a member from `TERMINAL_WORDS` | one hit-plant per word (8) |
| M3 veto widening | make the word-position veto line-wide | r17 sequenced plant (`**PARTIALLY CLOSED, then CLOSED**` must still hit) |
| M4 flatten leak | claim-flatten stops dropping `delete`/`link`/`code`/`html`/`table` | silent plants per dropped type — a leak turns them into hits |
| M5 field-lane loss | delete either new lane (mid-line field-label / line-wide terminal-label) or widen the confined scans past line-led field lines | P1/P2 plants (loss direction) + line-607 plant (widening direction) |
| M6 token-boundary regression | readmit ASCII hyphen at either boundary | P4–P6 plants + P7 control |
| M7 entry-boundary drift | nested/quoted heading opens an entry | blockquote-quoted-heading plant asserting entry count |
| M8 registry decoupling | graduation invariants stop reading the walker's id extraction | existing 4 graduation `it()` cases (self-pinning — a broken extractor empties the id sets and the presence assertions fail) |

A reviewer-proposed NEW family is admissible only with a live escaping mutant against the shipped guard (AGENTS.md finding-admissibility (c)).

## Plan-time facts (verified, commands run 2026-08-01)

- Restored containment test vs today's tree: **1 of 7 tests fails, two count rows only** — `components/admin/wizard/Step3SheetCard.tsx` 1→2 (PR #640 `3a6eac4aa` split the label into a ternary pair at lines 156-157) and `tests/components/a11y/newTabAnnouncementBehavior.test.tsx` 2→6 (same PR's test). All censuses (symlink set, dotfile set, config pins, icon anchors, URL builder) green across the 110-commit drift. Reconcile = exactly those two rows.
- `remark@15.0.1` installs clean beside `remark-gfm@4.0.1` (pnpm add -D verified in this worktree).
- mdast behavior probes: 14/14 decisive (spec §2 probed-facts bullet; harness committed as spec sibling).
- r41 ledger probes: P1–P7 (spec §4; harness committed as spec sibling).

## Tasks (TDD; conventional commit per task)

### T1 `test(docs): mdast walker helper — parseLedger/extractEntries/flattenLines (+ remark devDependency)`
The remark dep (`pnpm add -D remark@^15`, package.json + pnpm-lock.yaml already staged in worktree) lands INSIDE this TDD commit — the RED test is its first consumer (spec §9, r4 P0: no testless standalone dep commit).
RED: new `tests/docs/_ledgerMdast.walker.test.ts` asserting, from fixture strings: entry extraction (top-level only, SHOUTY rules, struck ids, arbitrary-bracket prefixes, no-terminator parity, BL- prefix filter, 2|3 levels, id-heading-to-id-heading partition incl. the nested-H3 shape), flatten semantics per the spec §2 disposition table (all node types, strong spans, code-contributed spans, `\n`-splitting of text values, container descent, footnoteDefinition NON-descent). GREEN: implement `tests/docs/_ledgerMdast.ts` — the committed spec sibling `2026-08-01-ledger-guard-mdast-rewrite-lane-probe.mjs` is the working prototype to port. Failure mode caught: a walker that reads rendered text where it should read structure (e.g. keeps link text) turns a silent plant into a hit — asserted directly.

### T2 `test(docs): port the ledger guard onto the walker`
RED: rewrite the two terminal-status `it()` bodies + `shoutyIds` call sites in `tests/docs/_metaDeferralLedgerGraduation.test.ts` to consume `_ledgerMdast.ts` (eight `it()` names unchanged), AND mechanically re-target the file's EXISTING r21 plants `it()` body (current lines ~512–563 — it references `STATUS_TERMINAL`/`HEADING_TERMINAL`/`boldFieldTerminalHit`/etc., so leaving it would break the compile when those symbols die; r7 P0) to walker verdicts, verdict-preserving, no new fixtures. The rewritten bodies are RED against the not-yet-wired evaluator. GREEN: wire `entryTerminal`. Live ledgers must stay green (spec §5 live-clean criterion). Regex lanes, `normalizeSection`, `WRAP`, `AFTER`, `CONTAINER` deleted — zero dangling references. NEW fixtures all belong to T3.

### T3 `test(docs): plants corpus — snapshot port + review-round fixtures (single fixture owner)`
Port the ~230-line r15–r40 plants verbatim from `a1cfce98d` (annotations kept), re-targeted at walker verdicts; add ALL spec §5 plants (P1–P7, fenced-code, table/link/html silents, setext, 3-space heading, entity, autolink, lazy-continuation, `Resolution`, `Not CLOSED`, ✅ pair, r2–r6 review-round shapes, M2's per-word hit plants, M7 quoted-heading plant). Each plant states its mutation family (M1–M8) in a comment. RED edge (fixture-port task, spec §1.1.14): per lane family, run the lane-deletion mutant (comment out the wiring) — family reds; restore — family greens. Both runs recorded in the commit body.

### T4 `test(admin): restore r22–r41 containment hardening + two-row reconcile + sheet-icon spec §7.10 lockstep`
ONE commit (spec §6.1, r2 F3): `git checkout a1cfce98d -- tests/components/admin/sheetIconLinkContainment.test.ts`; update the two count rows per plan-time facts (verified legitimate adopters, PR #640); restore the reverted §7-item-10 paragraph of `docs/superpowers/specs/2026-07-26-sheet-icon-link-affordance-class.md` from `a1cfce98d` (spec-is-canonical; mirrors `2d9d0ba11` in reverse); run full file green. Census probe per the spec §6.3 EXHAUSTIVE table (eight rows, per-row obligation: 3-variant probe / loud-failure variant / set-equality green / plant citation); escaping variant ⇒ fix + plant, none ⇒ documented-limits note in the guard header. Probe outputs recorded in the commit body.

### T5 `docs: graduate BL-LEDGER-GUARD-MDAST-REWRITE`
Move the entry to `BACKLOG-archive.md` with provenance `test/ledger-guard-mdast-rewrite`; add the `BACKLOG_GRADUATED` registry row. Reference sweep RUN 2026-08-01 (`rg -n "BL-LEDGER-GUARD-MDAST-REWRITE" --no-heading`, excluding this arc's own spec/plan): exactly two hits — `BACKLOG.md:7` (reconciliation-note prose recording the 2026-07-31 split: KEEP, historical record; the graduation layers its own note per house style) and `BACKLOG.md:11` (the entry heading itself: MOVES to archive). `BL-SOUND-REDIRECT-GUARD` does NOT cite the id (an earlier draft assumed it did — refuted by this sweep); the r30 header citation exists only in the `a1cfce98d` snapshot file, which this branch's rewrite replaces. The new walker validates its own graduation row — the guard polices this commit.

### T6 Close-out
Full `pnpm test`; `tsc` both configs; eslint; `format:check`. Whole-diff cross-model review (fresh-eyes brief, split-scope if needed); push; CI green; merge; ff-sync main; delete `test/guard-hardening-followup`; CronDelete nudge + clear pane.

## Snippet typecheck note

Task bodies above carry no pasted TS snippets (shapes are named, not inlined) — the T1/T2/T3 test bodies are authored in-branch under the repo's strict tsconfig at implementation time, which is where the typecheck-pasted-snippets rule lands.

## e2e/CI wiring

No new workflow, no new e2e spec, no testMatch change: `_ledgerMdast.ts` (underscore helper, not matched by `**/*.test.ts` globs) plus edits inside two existing registered test files and one new `tests/docs/_ledgerMdast.walker.test.ts` — verify at T1 that the `tests/docs/` glob of the vitest project that runs `_metaDeferralLedgerGraduation.test.ts` also matches the new walker test (same directory, same suffix).
