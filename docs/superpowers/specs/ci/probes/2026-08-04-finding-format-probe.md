# Probe — finding-shape recognizability in real Codex review output

**Run:** 2026-08-04 · **Revised:** 2026-08-04 (v2, see Correction) · **Feeds:** [review-round-economy](../2026-08-04-review-round-economy.md) §3

## Resolved scope — do not relitigate

| Decision | Why |
| --- | --- |
| The corpus is **machine-local and deliberately not committed**. It is the accumulated scratch output the parent spec exists to make durable; committing it retroactively is explicitly out of scope. | Parent spec §12 |
| The measurement is a **draft-time input**, not a gate. Nothing re-runs it. | Parent spec §3 |
| Conclusions 3 and 4 name defects that are **in scope for the parent spec's work items**, not separate filings. | Parent spec §10 |

## Correction (v1 → v2)

v1 reported n=45 and described it as "every last-message file present on the machine." That was wrong: the glob `/private/tmp/*/attempt-*.last-message.txt` is one level deep and missed every nested scratchpad output. A recursive walk finds **681**. Surfaced by adversarial review r2.

Every figure below is the recursive measurement. The v1 numbers (75% inferred / 24% none) are superseded; the direction of the conclusion is unchanged and the gap is wider.

## Question

Can a durable round record extract a finding count from reviewer output by recognizing its shape, or must the count be declared?

## Method

```python
import re, os
rec = []
for root, d, fs in os.walk('/private/tmp'):
    for f in fs:
        if re.match(r'attempt-.*\.last-message\.txt$', f):
            rec.append(os.path.join(root, f))

pats = {
  'numbered-bold':   re.compile(r'^[0-9]+\. \*\*', re.M),
  'bullet-severity': re.compile(r'^[-*] +\*{0,2}(BLOCKING|NEEDS-ATTENTION|CRITICAL|HIGH|MEDIUM|LOW|P[0-3])', re.M),
  'heading':         re.compile(r'^#{1,4} +.*(BLOCKING|Finding|NEEDS)', re.M | re.I),
}
wrapper = re.compile(r'^\s*VERDICT:\s*\S', re.M)   # codex-guard.mjs:392, verbatim
loose   = re.compile(r'^\s*\**VERDICT:', re.M)
```

## Result

```
n=681

  numbered-bold      327/681   48.0%
  bullet-severity     81/681   11.9%
  heading             68/681   10.0%
  union-of-inferred  441/681   64.8%
  NONE-of-inferred   240/681   35.2%

  wrapper VERDICT    678/681   99.6%    <- codex-guard.mjs:392 accept-set
  loose VERDICT      681/681  100.0%    <- permissive; the delta is bold **VERDICT:
```

## Conclusions

1. **Finding shape is not reliably recognizable.** Three stacked recognizers cover 64.8%. Better than a third of real reviews match none of them. Codex formats findings as it likes — numbered lists, severity-prefixed bullets, headings, and prose that is none of these.
2. **Declared contracts hold.** The mandated `VERDICT:` line is present in every one of the 681 outputs. Declared 99.6% (by the wrapper's own accept-set) against inferred 64.8% is the whole argument for §5.1 and §5.3: the record declares, and never infers.
3. **The existing hook's finding tally is 48% accurate.** `$HOME/.claude/hooks/review-convergence-gate.sh` tallies findings with the numbered-bold pattern alone, so the "~N findings" figure in its block message reads zero for the other 52% of reviews.
4. **The wrapper drops bold verdict lines.** `parseVerdict` filters on `/^\s*VERDICT:\s*\S/` (`scripts/codex-guard.mjs:392`), which a line beginning `**VERDICT:` fails. Three outputs in the corpus do exactly that; each was recorded as `no_verdict` — a whole dispatch spent and then classified as an infrastructure fault. Small in rate (0.4%) and entirely deterministic.

Conclusions 3 and 4 were not the question the probe was asked. Both are pre-existing defects it surfaced, and both are the archetype of what the round-economy loop is for: deterministic, mechanically-checkable wrongness that no amount of adversarial review would find, because no reviewer reads a hook's advisory line or a regex's accept-set against a corpus of 681 real outputs.

That the probe itself shipped a v1 undercount, and that adversarial review caught it, is the same lesson pointing the other way: a measurement is only as good as the accept-set of the thing doing the measuring.
