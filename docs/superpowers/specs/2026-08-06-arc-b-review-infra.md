# Arc B — review-infra pair (plan-fence gate, codex-guard CommonMark parse)

**Date:** 2026-08-06 · **Authoring branch:** `docs/arc-b-spec` · **Implementation branch:** `feat/review-infra-gates` · **Status:** DRAFT

## §0 Why this arc exists, and its scope

Two review-round-economy entries, both guard/detector surfaces, both fenced under deferral exception (c) by the PRs that filed them: a plan-fence checker that exists only as a lost scratchpad prototype and gates nothing, and codex-guard's hand-rolled code-block recognizer whose escaping-shape enumeration burned four review rounds before being filed as a parser replacement. One implementation branch, no UI surface. **Routing (user 2026-08-06): Claude implements this arc — NOT Codex. Codex still reviews.** Scope brief of record: the arc B scope brief in the session briefs directory (outside the repo; ratified decisions restated in full in §1.1, the in-repo capture of record); batch topology: the ABC authoring kickoff brief beside it.

Claimed entries (invariant 12, marked on `docs/arc-b-spec`, handed off to `feat/review-infra-gates` per §3):

1. `BL-PLAN-SNIPPET-FENCE-GATE` (BACKLOG.md, M) — promote the five-shape fence checker to a real BLOCKING gate; archive.
2. `BL-CODEX-GUARD-COMMONMARK-PARSE` (BACKLOG.md, M) — vendor a minimal block-level CommonMark parse inline into `scripts/codex-guard.mjs`, replacing `stripCodeBlocks`; archive.

## §1.1 Resolved scope — do not relitigate

All ratified 2026-08-06 by the user (the arc B scope brief) unless another source is cited.

1. **The fence gate is BLOCKING in CI, with a per-fence waiver** following the `spec-lint: ignore` idiom (`lib/specLint/parse.ts`, the `WAIVER` regex, drafting locator :35). Advise-only is off the table.
2. **The five decidable shapes are the entry's enumerated set** — `UNIMPORTED_IDENTIFIER`, `DUPLICATE_IMPORT`, `MANGLED_TEMPLATE`, `UNCHECKED_INDEX`, `FENCE_EM_DASH`. Full `tsc` over fences was considered and REJECTED (fences are excerpts referencing helpers in neighbouring fences; they do not typecheck as modules — the entry's own refutation). Do not relitigate.
3. **The prototype is GONE** (untracked session scratchpad). Rebuild from the entry's rule list; the probe committed beside this arc's plan is the calibration of record.
4. **codex-guard VENDORS a minimal block-level CommonMark parse INLINE** in `scripts/codex-guard.mjs`. The script stays dependency-free plain `.mjs` runnable as bare `node` (the AGENTS.md shim one-liner contract; its live import surface is node builtins plus the sibling `scripts/reviewRoundEmit.mjs` — probed). Do NOT add mdast/remark as a dependency — considered and rejected by the user; `tests/docs/_ledgerMdast.ts` is reference-only precedent.
5. **Convergence guard (both entries are guard/detector surfaces):** consequence bound — every input handled correctly OR signaled, never silently wrong; conservative demote plus surfaced warning is a DOCUMENTED LIMIT. Threat-model fence — accidental authoring mistakes by an ordinary contributor; adversarial obfuscation out of scope, files to documented limits. Enumeration over an open class is NOT a convergence criterion: the fence gate converges against its closed five-shape set over a finite corpus; the parser converges against the CommonMark block grammar plus its committed fixture set. Round cap 4 per stage.
6. **Autonomy: both user review gates WAIVED** (user grant 2026-08-06, kickoff brief). Stop only for a genuinely NEW question.
7. **All AGENTS.md invariants bind**; `impeccable-gate: N/A — no UI surface`.

## §2 Per-entry contracts

Entry bodies in BACKLOG.md are the spec-of-record for evidence. Every code claim was grep-verified 2026-08-06 (read-only citation pass at `a0e41551c` plus the corpus probe below); anchors file + symbol — line numbers are drafting-time locators.

### §2.1 BL-PLAN-SNIPPET-FENCE-GATE — promote the checker to a blocking gate

**Architecture (the spec-lint idiom, which this repo already trusts):** a pure read-core under `lib/planFences/` (fence extraction, attribution, the five rules), a CLI adapter under `scripts/` exposed as `pnpm plan:fences`, and the gate itself — a meta-test under `tests/docs/` (final name _metaPlanSnippetFences, its wiring pinned below) walking `docs/superpowers/plans/**` FROM DISK, so a new plan is covered by default, never silently exempt. CI wiring is free by construction: `tests/docs/**/*.test.{ts,tsx}` is in the `parallel` project set (`vitest.projects.ts`, drafting locator :134) run by `unit-suite.yml`'s `unit-suite-nodb` shards (drafting locators :146/:176) — a required check. BLOCKING means: the meta-test fails naming the plan file, fence line, and rule.

**Corpus calibration (probe of record, run 2026-08-06; script + full output committed in this arc's plan directory as fence-gate-probe.mjs with its raw output fence-gate-probe-2026-08-06.txt (both tracked on this branch)).** 395 plan files with fences, 5,434 fences, 3,585 module-ish code fences. Raw hits at probe fidelity: UNIMPORTED_IDENTIFIER 325, DUPLICATE_IMPORT 5, MANGLED_TEMPLATE 14, UNCHECKED_INDEX 145 (syntactic candidates), FENCE_EM_DASH 1,378 at all-fence scope (the probe's overreach — the shipped rule scopes to code fences, §4 limit 4). Two consequences the numbers force:

1. **A legacy baseline ratchet, not 300+ waivers.** The corpus's historical plans are records of shipped work; editing hundreds of them to satisfy a new gate is churn with zero product value, and demanding waiver comments inside them is the same churn in different clothes. The gate therefore ships with a committed shrink-only baseline module beside the meta-test: rows of `{plan path, fence line, rule}` generated by the gate's own first full run at implementation time. A hit present in the baseline passes; a hit NOT in the baseline fails; the baseline may only SHRINK (the meta-test fails if a baseline row's hit no longer exists — the stale-row-removal contract, same idiom as the mutation harness's `staleRows` and the live-region PENDING map). New plans and new fences in old plans are covered by default. The per-fence waiver (§1.1 item 1) is for DELIBERATE new violations with a reason — the two mechanisms are disjoint: baseline = frozen history, waiver = reasoned exception going forward.
2. **Per-rule accept-sets, keyed on structure (the entry's own demand for the attribution heuristic, applied to every rule):**

- **Fence eligibility (what is "code"):** info string in {`ts`, `tsx`, `typescript`, `js`, `jsx`, `mjs`} — or bare — AND module-ish content (contains an import/export statement or statement punctuation). Everything else (output transcripts, prose quotes, `sql`/`yaml`/`sh` fences) is out of scope by name for the four code rules.
- **Attribution (which file a fence appends to):** ACCEPTED iff the nearest preceding non-blank prose line within a bounded window carries EXACTLY ONE backticked source-path token (`*.ts`/`*.tsx`/`*.mjs`/`*.js` shape). Zero or multiple path tokens → the fence is UNATTRIBUTED — still checked by every per-fence rule, only exempt from the cross-fence `DUPLICATE_IMPORT` rule, and the gate reports attribution coverage so unattributed fences are a visible number, never a silent skip.
- **`UNIMPORTED_IDENTIFIER`:** fires only on module-shaped fences (≥1 import line) using an identifier from a COMMITTED known-API registry (vitest globals, common node:fs/path names, testing-library names — a closed list in `lib/planFences/`) that the fence neither imports nor declares. The registry is the rule's accept-set; an API outside it escapes by design (§4 limit 2).
- **`DUPLICATE_IMPORT`:** the same binding imported in two or more fences attributed to the SAME target file within one plan.
- **`MANGLED_TEMPLATE`:** markdown-escape artifacts inside code content (escaped backtick, escaped `${`).
- **`UNCHECKED_INDEX`:** the syntactic candidate `identifier[integer].member` with neither `!` nor `?.` — the probe's 145 candidate hits are the calibration input; the plan fixes the final pattern (including its named exclusions) against a sampled false-positive review of those hits, and the accept-set ships in the rule's header.
- **`FENCE_EM_DASH`:** U+2014 inside CODE-fence content only (pasted snippets become source and copy; prose fences are `docs/**` prose, out of the em-dash policy's scope by its own accept-set). Honors the `spec-lint: ignore` waiver with the existing fence-extension coverage semantics (`lib/specLint/run.ts`, `targetOf`/`coverageOf` — a waiver stack above a fence opener covers the whole block, drafting locators :47-104). The gate REUSES `lib/specLint`'s waiver parsing rather than re-implementing the grammar.

**The five shapes are the closed operator set** (§1.1 item 2). A reviewer-proposed NEW shape is admissible only as a registry change carrying its own before/after corpus numbers — not a round on this arc's diff.

**Premise fixtures (guard-premise rule):** committed planted fixtures under the meta-test's fixture tree — one plan file per rule exhibiting the violation — prove the gate can fail, executed unconditionally (`tests/_shared/premise.ts`). The gate's failure list over the planted tree IS its executable RED at implementation time.

**Archive.** Entry archives with the shipped rule accept-sets, the baseline row count, and the probe cross-referenced.

### §2.2 BL-CODEX-GUARD-COMMONMARK-PARSE — vendor the block parse, retire the recognizer

**What changes.** `stripCodeBlocks` (`scripts/codex-guard.mjs`, drafting locators :537-603; doc comment :505-536; exactly two callers — `parseVerdict` :663 and `parseFindingCount` :737) is replaced by a vendored block-level CommonMark pass, INLINE in the same file (§1.1 item 4). Its contract to the callers is unchanged: given a message, blank the source lines of every code block; a block open at EOF strips nothing (the existing safety posture — the last surviving `VERDICT:` line wins, and a reviewer whose only verdict is inside an unclosed block still fails loudly as `no_verdict`, never silently wrong).

**Grammar scope (block-level line classification only — this is a code/not-code decider, not a renderer).** The vendored pass models, as a container STACK (the recognizer's single-column approximation re-derived from the root is the named defect):

1. Fenced code blocks — opener/closer indentation measured RELATIVE to the container's content column (the two shipped fixes' contract, preserved), both fence characters, info strings.
2. Indented code blocks — 4+ columns past the container content column, with blank-line continuation.
3. List containers — nested, marker-relative content columns, popped on dedent (a stack, not a re-derivation).
4. Block quotes as containers — `>` prefixes participate in the content-column computation.
5. Lazy continuation — a paragraph line that continues a container without its prefix does NOT close the container (and therefore does not spuriously open/close code).
6. HTML blocks — CommonMark type-1..7 openers treated as opaque non-code prose (their content is never mistaken for a fence delimiter), OR explicitly excluded with a probe — decided at plan time against fixture behavior; either outcome is documented in the rewritten limit.

Each of the six either becomes covered or is explicitly re-documented as a REMAINING limit with a probe demonstrating the escaping shape (the entry's own disposition menu; §4 limit 5). The success criterion is not "implements CommonMark" — it is: the limit text shrinks to what is genuinely still outside the model, and every claim in it carries a probe.

**Fixtures (the kill criterion).** The entry's shipped probes become committed regression cases in the existing behavioral harness (`tests/codexGuard/`, CLI-driven via `tests/codexGuard/harness.ts`): indented closers (the false-approvals 4/4 shape), indented openers across depth × marker × fence-character (the 18/18 shape), nested marker-line cases (2/2), plus the existing `verdictEmphasis.test.ts` suites (fenced example not a verdict; every block kind; list-marker-line opener; unclosed block strips nothing; closer at 4+ columns is content; closes at 3; opener past 3 in a container still hides). New fixtures land for each newly covered grammar feature (block-quote container, lazy continuation, dedent pop, HTML block) — RED against the shipped recognizer where the feature is a genuine miss, GREEN under the vendored parse. A reviewer-proposed NEW escaping shape is admissible only with a live escaping mutant demonstrated against the SHIPPED (post-arc) parser.

**Citation repair (recorded so nobody re-derives it).** The entry cites "Spec §8.3 limit 12" without a path; the limit lives at `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` §8.3 (heading at drafting locator :257, limit text :270) — NOT in `docs/superpowers/specs/2026-07-19-codex-guard.md` (no §8.3 exists there). The limit's own text also does not enumerate the four misses the entry paraphrases (block quotes / dedent / lazy continuation / HTML blocks — that enumeration is the entry's). The arc: fixes the entry's citation in its archive record, and REWRITES the §8.3 limit-12 text in the round-economy spec to the post-parse residue, in the same PR (a §-numbered spec edit — docs discipline, no code lockstep).

**Dependency contract, restated executably.** The script's import surface after the change is unchanged: node builtins plus the sibling `scripts/reviewRoundEmit.mjs` (probed: the only non-builtin import, drafting locator :21). The shim one-liner keeps working from any checkout. A structural assertion in the codex-guard test tree pins the import list (no `node_modules` specifier ever appears) — cheap, and it converts the contract from prose to CI.

**Archive.** Entry archives with the fixture inventory, the rewritten limit cross-referenced, and the citation repair recorded.

### Transition Inventory

No visual state exists anywhere in this arc: a docs gate, a markdown parser inside a CLI wrapper, and test fixtures. No component, no render, no animation.

### Dimensional Invariants

None: nothing renders. If implementation contradicts this, the writing-plans layout-dimensions rule fires.

## §3 Sequencing + claim-handoff protocol

Identical protocol to arcs A and C (handoff-by-overlap, the L-wave §3 pattern — `docs/superpowers/specs/2026-08-06-l-wave-design.md` §3):

1. `docs/arc-b-spec` (this branch) claims both entries (Stage 0 commit, pushed 2026-08-06).
2. BEFORE this branch's PR merges: worktree + branch `feat/review-infra-gates` off `origin/main`; `pnpm ledger:claims --check` for the two ids from the main checkout must exit 1 naming `docs/arc-b-spec` ONLY; the implementation branch marks both, commits, pushes.
3. THEN this branch's last pre-merge commit removes its two markers. No undeclared instant on origin.
4. This branch's PR merges first (docs-only, preflight skip declared). The Opus implementer reaches this arc LAST (kickoff sequencing A → C → B, arc-transition protocol between arcs), from the HANDOFF doc in this arc's plan directory.
5. Ledger contention: sibling arcs and L-wave units; id-disjoint; merge `origin/main` before PR and before merge, per-entry resolution.

## §4 Documented limits (this arc's own)

1. **The fence gate covers `docs/superpowers/plans/**` only.** Specs, handoffs outside plan dirs, and other docs trees are out of scope by name; widening is a future decision, not drift.
2. **The known-API registry is a closed list.** An unimported identifier outside it escapes by design; the registry grows by commit, with the corpus re-run in the same commit.
3. **The legacy baseline freezes history.** Baseline rows are frozen defects in historical documents, deliberately not repaired; the ratchet guarantees the set only shrinks. A baseline row is not an endorsement.
4. **FENCE_EM_DASH scopes to code fences.** The probe's 1,378 all-fence count is the calibration argument for that scope: prose fences quote console output and document text that the em-dash policy's own accept-set excludes.
5. **The vendored parser is a block-level line classifier.** Inline constructs (code spans, emphasis) are out of scope by construction — a `VERDICT:` line inside an inline code span on a prose line remains taken as prose; the brief contract's last-line requirement bounds the damage (the pre-existing posture, unchanged). Whatever of the six grammar features lands as excluded is re-documented with its probe in the rewritten limit 12.
6. **UNCHECKED_INDEX is syntactic.** It cannot see types; the accept-set trades false negatives (a typed-safe index it still flags gets a waiver; an unsafe access it cannot parse escapes) for decidability. The pattern and exclusions ship in the rule header.

## §5 Meta-test / registry inventory (pre-declared for the plan)

- **CREATES:** the _metaPlanSnippetFences meta-test under `tests/docs/` (the gate; auto-wired via the `parallel` project's `tests/docs/**` glob — no new testMatch or workflow entry, and a rename out of that glob is forbidden for the same reason the em-dash guard pinned its name); `lib/planFences/**` (pure read-core; enrolls in the same purity posture as `lib/specLint` — no I/O in core); the plan-fences CLI adapter under `scripts/` + `package.json` script `plan:fences`; the shrink-only baseline module; planted premise fixtures per rule; new codex-guard grammar fixtures under `tests/codexGuard/`.
- **EXTENDS:** `tests/codexGuard/verdictEmphasis.test.ts` (grammar fixtures); the codex-guard test tree gains the import-surface structural assertion (§2.2).
- **Registries:** invariant-9/10 — no Supabase call, no mutation surface (scripts + tests + docs). Advisory locks, §12.4 — untouched.

## §6 Acceptance criteria

- **AC-B1 (fence gate):** the meta-test walks the plans tree from disk and fails by name on each planted premise fixture; the five rules ship with their accept-sets in headers; the baseline is committed, shrink-only-enforced, and its row count recorded in the archive; the waiver reuses the `spec-lint: ignore` grammar with fence-extension coverage; `pnpm plan:fences` reports the same findings as the meta-test on the same tree; the full-corpus run at merge shows zero non-baseline, non-waived hits.
- **AC-B2 (CommonMark parse):** `stripCodeBlocks` is replaced by the vendored block-level pass with both callers' behavior pinned by the existing suites; all entry probes are committed fixtures and green; each of the six grammar features is either covered (with its fixture) or re-documented with a probe; the round-economy spec's §8.3 limit 12 is rewritten to the residue; the import-surface assertion is green; the entry's citation drift is repaired in the archive record.
- **AC-B3 (process):** claim handoff per §3 with no undeclared instant; TDD per task (the planted fixtures and the RED-against-recognizer grammar fixtures are the REDs); conventional commits; cross-model diff review APPROVE (round cap 4, §1.1 item 5 wording in the brief); real CI green before merge; main ff'd to `0 0`; both entries archived; `impeccable-gate: N/A — no UI surface` in the closeout.

## §7 Impeccable gate

impeccable-gate: N/A — no UI surface (scripts, lib read-core, tests, docs; if implementation unexpectedly touches an invariant-8 surface, the gate flips before merge)
