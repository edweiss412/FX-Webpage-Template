# Review-round filing — `fix/control-outline-border-token`

Base `2ddbf038bdf4`. Arc: the 2026-08-18 text-ramp ruling for control outlines at `border-border`.
Spec: `docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md`.

## spec — 4 rounds

**Examined:** all four dispatches were `--stage spec` against the same reviewer configuration, 16 findings total (4 / 5 / 3 / 4), verdicts NEEDS-ATTENTION, NEEDS-ATTENTION, BLOCKING, BLOCKING. Every finding was confirmed by probe before repair and none was refuted. Each round independently reproduced the arc's derived counts — universe 362, 42 token carriers, swap set 37, 26 files, 32 source-edit lines, 63 lexical occurrences, 5 dividers, the 12/6/3 hover partition — so the arithmetic is agreed across four independent runs and only the claims about it moved.

**Judgment:** the round count was NOT driven by reviewer imagination or by a recognizer ratcheting, which is the failure mode the round-economy rule exists to catch. It was driven by **the artifact making a factual claim about a live population that the artifact's own author had not measured**. Every round's findings landed on a different axis:

| Round | Axis | Design content? |
| --- | --- | --- |
| 1 | §9 asserted a transition utility across 37 sites without measuring it; chasing that surfaced the hover inversion the swap CAUSES at 21 sites | **Yes** — §3.6 is a real design consequence |
| 2 | the hover classification was computed over the UNION of an element's strings when it must be PER RENDER PATH | **Yes** — moved one site from delete to raise |
| 3 | the "no ground shift can invert" bound was false at 7 sites; one `aria-expanded:` border override was unretargeted | **Partly** — the bound was a claim defect, the `aria-expanded:` miss was a code change |
| 4 | census length 58 vs 57 (an overlapping row), "any state" vs "any enabled state", a false tinted-plate claim, a stale prescription in the probe record | **No** — four consistency and arithmetic errors |

Design content is monotonically decreasing and reached zero at round 4. That is convergence, and it is the signal the count alone hides.

**The recurrence worth recording:** the **cross-path union error appeared twice, two rounds apart, in different sections** — R2 F1 in the §3.6 hover classification, R4 F3 in the §6 tinted-plate claim. Both had the same shape: reasoning over `allStrings(element)` (the union of every render alternative) when the question is about a single render path. The first repair fixed the instance and swept the hover sites; it did not sweep the *document* for other places the same reasoning appeared. **That is the round this arc could have saved**, and the generalisable lesson is narrower than "class-sweep the code": when a review finds a reasoning error, sweep every CLAIM the document makes using that reasoning, not only every code site the finding names.

**Mechanizable:** two of the sixteen.

- **The census overlap (R4 F1) — `declined: repaired in-branch, no ledger row warranted`.** `21 + 37 = 58` was arithmetic done in prose; the live answer is a set union, and `new Set([...old, ...arc]).size` returns 57. Any spec that states a post-change collection size should derive it rather than add it. The plan's Task 1.4 now pins 57 as an assertion, so the implementation cannot ship the wrong number even if a future reader repeats the addition.
- **Citation shorthand (R1 F2, R2 F5) — filed as `BL-CODEX-GUARD-SPECLINT-PREDISPATCH-GATE`.** Pure lint debt — 18 hard failures in round 1 and 13 more in the probe record at round 2, all the empty-path `` `:213` `` form. `pnpm spec:lint` catches every one of them and was not run before the first dispatch. Running it pre-dispatch is free and would have removed two findings' worth of reviewer attention from the count; the filed row moves the check into `codex-guard` itself, beside the mutation-score refusal, because the habit was already written down and was not followed here.

The remaining fourteen are not mechanizable: they required measuring a live population (the transition utilities, the hover overrides, the 20-of-21 predecessor shape, the disabled composite) or reading render paths the way the runtime does.

**Infra:** none. No dispatch was reaped, no `no_verdict` result, no wrapper fault; all four returned `status: "verdict"` with a declared `FINDINGS:` line.
