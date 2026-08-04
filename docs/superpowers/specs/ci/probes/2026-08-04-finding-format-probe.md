# Probe — finding-shape recognizability in real Codex review output

**Run:** 2026-08-04 · **Feeds:** [review-round-economy](../2026-08-04-review-round-economy.md) §3

## Resolved scope — do not relitigate

| Decision | Why |
| --- | --- |
| The corpus is **machine-local and deliberately not committed**. It is the accumulated scratch output the parent spec exists to make durable; committing it retroactively is explicitly out of scope. | Parent spec §12 |
| The measurement is a **draft-time input**, not a gate. Nothing re-runs it. | Parent spec §3 |
| Conclusion 3 (the hook's tally is wrong) is **in scope for the parent spec's work items**, not a separate filing. | Parent spec §10 item 6 |

## Question

Can a durable round record extract a finding count from reviewer output by recognizing its shape, or must the count be declared?

## Corpus

45 `attempt-*.last-message.txt` files under `/private/tmp/*/`, the accumulated `--out` directories of real `codex-guard review` dispatches on 2026-08-03 and 2026-08-04. Not a curated sample — every last-message file present on the machine at probe time.

The corpus is machine-local and ephemeral by construction (§2 of the spec is about exactly that), so it is not committed. The script below reproduces the measurement wherever such directories exist.

## Script

```python
import re, glob
files = sorted(glob.glob('/private/tmp/*/attempt-*.last-message.txt'))
pats = {
  'numbered-bold':   re.compile(r'^[0-9]+\. \*\*', re.M),
  'bullet-severity': re.compile(r'^[-*] +\*{0,2}(BLOCKING|NEEDS-ATTENTION|CRITICAL|HIGH|MEDIUM|LOW|P[0-3])', re.M),
  'heading':         re.compile(r'^#{1,4} +.*(BLOCKING|Finding|NEEDS)', re.M | re.I),
  'VERDICT-line':    re.compile(r'^ *\**VERDICT:', re.M),
}
c = {k: 0 for k in pats}; none = 0
for f in files:
    t = open(f, encoding='utf-8', errors='replace').read()
    hits = {k: bool(p.search(t)) for k, p in pats.items()}
    for k, v in hits.items(): c[k] += v
    if not any(hits[k] for k in ('numbered-bold', 'bullet-severity', 'heading')): none += 1
```

## Result

```
corpus: n=45

  numbered-bold     23/45   51%
  bullet-severity    9/45   20%
  heading            3/45    6%
  VERDICT-line      45/45  100%
  NONE-of-inferred  11/45   24%
```

Three stacked inferred recognizers cover 75%. The one declared contract covers 100%.

## Conclusions

1. **Finding shape is not reliably recognizable.** A quarter of real reviews match none of the three most plausible patterns. Codex formats findings as it likes — numbered-bold lists, severity-prefixed bullets, headings, and prose that is none of these.
2. **Declared contracts hold.** `VERDICT:` is mandated by the brief and detected by the wrapper, and it is present in every single output. This is the mechanism to extend, not the recognizer.
3. **The existing hook's finding tally is wrong about half the time.** `$HOME/.claude/hooks/review-convergence-gate.sh` tallies findings with `grep -cE '^[0-9]+\. \*\*'` alone, so the "~N findings" figure in its block message reads near-zero on the 49% of reviews that use another shape.

Conclusion 3 was not the question the probe was asked. It is a pre-existing defect the probe surfaced, and it is the archetype of what the round-economy loop is for: a deterministic, mechanically-checkable wrongness that no amount of adversarial review would have found, because no reviewer reads the hook's advisory line against a corpus.
