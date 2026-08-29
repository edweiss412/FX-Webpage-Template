# `docs/review-rounds/` — the durable adversarial-review round corpus

One row per Codex dispatch, one directory per arc, committed with the branch that produced it. Design: [`../superpowers/specs/ci/2026-08-04-review-round-economy.md`](../superpowers/specs/ci/2026-08-04-review-round-economy.md).

## Layout

```
docs/review-rounds/<branch>/<baseSha12>.jsonl   the corpus — one JSON object per line, one line per dispatch
docs/review-rounds/<branch>/<baseSha12>.md      the filing — written by hand, only once the arc is obliged
```

`<branch>` is `git rev-parse --abbrev-ref HEAD` used as a **nested path**, not slugged: branch `feat/foo` writes under `docs/review-rounds/feat/foo/`. `<baseSha12>` is the first 12 characters of `git merge-base origin/main HEAD`, which is what makes an arc an identity rather than a name — this repository has already reused three branch names across distinct PRs, and keyed on the name alone a later arc would inherit a merged arc's rounds and its filing (spec §5.2).

## Who writes what

- **The `.jsonl` rows are written by `scripts/codex-guard.mjs`** (via `scripts/reviewRoundEmit.mjs`) at dispatch COMPLETION, not when a dispatch starts, from the `--stage` and `--round` flags that every dispatch is now required to pass. `emitReviewRoundRow` fires immediately after the wrapper writes `result.json` (`scripts/codex-guard.mjs:1614`; and again at `:2152`, where it sits deliberately outside the `try` that writes `result.json` so a round is still recorded when that write throws). No row exists while a dispatch is in flight, which is the contract rather than a broken wrapper, so a session counting its own rounds mid-arc counts committed rows PLUS anything in flight. Nothing appends rows by hand, and nothing backfills them. The corpus root resolves against the git toplevel of `--cwd`, so a dispatch launched from a subdirectory still lands in the one gated corpus.
- **The `.md` filing is written by a human or the arc's driving session**, in the format in spec §6, once a stage crosses the threshold.
- **Both are committed with the arc**, like any other tracked file. A row that is never committed is invisible to CI, which is a documented limit (spec §8.3), not a defect the gate tries to close.

## The filing duty

A stage owes a filing once it reaches `ROUND_THRESHOLD` counted rounds (`4`, `lib/reviewRounds/constants.ts`). **Counted** means distinct `round` values among rows with `status: "verdict"` whose `stage` is `spec`, `plan`, or `diff` — `no_verdict` rows and `stage: "task"` rows are recorded for completeness and never count (spec §5.4).

A stage reaches the threshold **either way**: by one base's rounds, or by the arc's rounds summed across every base of that branch directory, counting distinct `(base, round)` pairs (spec `docs/superpowers/specs/ci/2026-08-22-review-round-arc-sum.md`, 2026-08-22). The second clause exists because re-merging `origin/main` moves the merge base, so the next dispatch writes into a new file and the counter restarts at 1 — four rounds burned across two bases used to oblige nothing at all.

Four consequences worth knowing before you file:

- **A re-merge restarts `--round` at 1 by design.** That is not a mistake to correct, and it does not affect the arc sum, which counts pairs rather than numbers.
- **The first row at a new base should carry `_roundAtPreviousBase`**, so a reader can follow one review thread across the move. It is traceability only: nothing validates it and no gate outcome depends on it.
- **A filing owed by the arc sum goes at the LATEST base holding rows for that stage.** Any one section for that stage discharges the whole directory, so a second is never required.
- **Its heading declares THAT FILE's count; its `**Examined:**` line names the cross-base total.** `## diff — 1 rounds` on a five-base arc is legal and reads oddly. The heading answers to `count_mismatch`, which is per base; the span belongs in the prose beneath it.

The filing is one `##` section per triggered stage:

```markdown
## diff — 7 rounds

**Examined:** R1–R7, 23 findings.

**Mechanizable:**
- "spec cites a symbol that no longer exists" (R2, R4, R5) —
  extend `spec:lint` to resolve every `file:line` citation → BL-SPEC-CITATION-RESOLVE

**Judgment:** R1 scope call on the picker pivot; R6 copy decision.
**Infra:** R3 reaped, no verdict.
```

`**Mechanizable:** none` is legal and expected. Mechanization work items are ordinary `BL-` rows in `BACKLOG.md` — no third ledger.

**Ledger parity (filings authored after 2026-08-15).** A non-none `**Mechanizable:**` entry either cites the `BL-`/`DEF-` row it filed, or declines in the form `declined: <reason>` (on the marker line or as a block paragraph/list item) — "belongs to whoever next touches X" is a decline and is written in that form. The entry's citation must sit INSIDE the Mechanizable block (from the marker to the next bold field or heading): an id in a following `**Judgment:**` paragraph does not satisfy it. The analysis is AST-derived, so fenced examples, HTML comments, and struck-through text (`~~declined: …~~`) satisfy nothing, and the field must be a top-level paragraph — nested under a list item it is rejected. Pre-existing filings are frozen in `lib/reviewRounds/mechanizableGrandfather.ts` and exempt. Canonical contract: `docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md` §3.

**Parked-class slugs (`LIM-`, filings authored after 2026-08-27).** A `declined:` disposition parks a mechanizable class as a documented limit, and parked classes recur across arcs: the authored-red class (a plan task's `red=` that cannot fire) was named independently by six arcs before anything joined the namings, because each filing described it in its own words and no join key existed. So every parked class carries a stable slug, `LIM-<UPPER-KEBAB>`, and the declined entry includes it, e.g. `declined: LIM-AUTHORED-RED, authored reds are a specLint documented limit`. Before coining one, grep the corpus for an existing slug covering the same shape (`rg "LIM-" docs/review-rounds`); a later arc cites the existing slug instead of coining a twin. [`LIMITS.md`](LIMITS.md) indexes the identified classes: slug, shape, the filings that named it, the owning documented-limits record, and the re-file trigger. The index makes no completeness claim; a parked class it misses gains a section when next named. Recurrence is then one grep. A slug named by three or more distinct arcs has fired its re-file trigger (the default; a class whose filing stated its own trigger keeps that one, and LIMITS.md records which), and the arc count is the incident evidence a `product-blocked` filing cites when a product arc is the one blocked; the slug makes recurrence countable, it does not change disposition rules, so a ledger row still needs the freeze's `invariant` or `product-blocked` exception and the count alone never satisfies the freeze's admission test. Filings are immutable evidence and pre-slug filings are never edited: classes parked before this convention are retro-indexed in LIMITS.md as they are identified, with citations pointing at the filings and arc counts held in the index rows. The slug is convention, not gate surface: nothing validates it, deliberately, per the freeze's warning about the measuring tool becoming the subject.

## The gate

[`tests/docs/_metaReviewRoundEconomy.test.ts`](../../tests/docs/_metaReviewRoundEconomy.test.ts) walks this directory **from disk**, recursively, over both extensions, so a new arc's files are covered by default and can never be silently exempt. It asserts schema and stage validity, contiguous `round` runs, the filing's existence and its per-stage sections once the threshold is crossed, that every `BL-`/`DEF-` id cited in a filing resolves against the live ledgers, that each row's `branch` and `baseSha` match its containing path, and that no filing is an orphan. It deliberately does **not** judge prose quality or whether a disposition is *correct* (spec §7.2).

Discovery is keyed on the arc filename shape `^[0-9a-f]{12}\.(jsonl|md)$`. A file that misses that shape is classified, not dropped: a stray `.jsonl` is **data** and fails loudly, while a stray `.md` — this README included — is **prose** and is ignored.

## Why this directory can be legitimately empty

The corpus starts empty and accumulates forward; there is no retroactive backfill (spec §12). The arc that introduced this system burned its own rounds before any writer existed to record them, so it is pre-adoption by construction. **The first arc the gate can oblige is the first one dispatched after that work merged.** An empty corpus is therefore a legal clean state, and the gate's live-corpus case passes over it.

This README also gives the directory a reason to exist in git, so `docs/review-rounds/` is present in a fresh clone and the gate's directory guard is exercised against a real path rather than an absent one.

## Reading the corpus

`pnpm review:economy` (`scripts/review-economy.ts`) is the read-only cross-arc report — rounds per stage per arc, counted versus recorded rows, trigger rate by month, declared finding totals with undeclared rows reported separately, and silent arcs (arcs that merged with zero rows). It gates nothing.
