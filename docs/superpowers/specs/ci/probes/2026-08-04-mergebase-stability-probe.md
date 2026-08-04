# Probe — merge-base stability as an arc identity

**Run:** 2026-08-04 · **Feeds:** [review-round-economy](../2026-08-04-review-round-economy.md) §5.2

## Resolved scope — do not relitigate

| Decision | Why |
| --- | --- |
| An arc is keyed `(branch, merge-base SHA)`. The alternative — branch alone — is refuted by observed name reuse in this repo, not by argument. | Parent spec §5.2 |
| Splitting an arc on rebase or merge-from-main is **accepted, conservative behavior**, not a defect. It under-obliges and is visible in the report. | Parent spec §8.3 |

## Question

§5.2 keys arc identity on `git merge-base origin/main HEAD`. That only works if the merge base is stable for the life of an arc. Is it?

## Method

Scratch repository, four mutations applied in sequence to a branch diverged from `main`, reading `git merge-base main HEAD` after each.

```sh
git init -q .; echo a > f; git add -A; git commit -qm base; git branch -M main
git checkout -qb feat/x; echo b > g; git add -A; git commit -qm work1
# then, in order: advance main; advance main again; commit on the arc;
# merge main into the arc; rebase the arc onto main
```

## Result

```
arc start    merge-base: 50122e01bb3a…
main +1      merge-base: 50122e01bb3a…     stable
main +2      merge-base: 50122e01bb3a…     stable
arc +1       merge-base: 50122e01bb3a…     stable
merged main  merge-base: 9fcb282e22ad…     MOVES
rebased      merge-base: 9fcb282e22ad…     MOVES
```

## Conclusions

1. **`origin/main` advancing does not move the merge base.** This is the common case by a wide margin — main moves many times during a multi-day arc — and it is exactly the case that must not split an arc. Confirmed stable across two advances.
2. **Committing on the arc does not move it.** Also required: every dispatch in an arc must land in the same directory.
3. **Merge-from-main and rebase both move it**, as §5.2 states. Each splits the arc into two directories, which under-obliges rather than over-obliges, is visible in the report as two short arcs, and is documented at §8.3.

The identity is therefore stable under everything that happens to a healthy arc, and degrades conservatively under the two operations invariant 11 already discourages mid-flight.
