# Adversarial review — spec, round 3

**Your role: REVIEWER ONLY. Do not fix issues, propose patches as commits, or imply changes you will make.**
Challenge the design and surface findings. Fixes are the implementer session's job in a separate dispatch.
Do NOT invoke any nested cross-model review (`/codex:adversarial-review`, the companion script,
`/codex:review`) from inside this session. Your verdict comes from your own direct output.

## Subject

`docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md` on branch
`fix/control-outline-cover`, worktree root is the `--cwd` you were given. Base `b30413cf5`.

It closes `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` (`BACKLOG.md`, heading
`## BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER`). Read that row before the spec.

The subject surface is a structural GUARD (a JSX scanner and the censuses that consume it), so the
finding-admissibility contract below is in force.

## What rounds 1 and 2 found, and what changed

Round 1 returned BLOCKING with 3 findings, all confirmed and repaired in `24471717d`. Round 2 verified
those repairs ("Round-one repairs are verified. The transcript contains all 13 Family A and 22 Family B
elements; the resulting 23 swaps, 12 registrations, 29 new keys, and 22-row census reconcile.") and
returned NEEDS-ATTENTION with 2 more, repaired in `8c4e67598`. Do not re-raise any of the five; verify
the repairs instead.

Round 1: the declined component edge (accepted in full, the walk now follows a capitalised tag one
import hop); the wizard pill's transition (accepted, §15 now enumerates all six state pairs); two stale
counts (59, eight).

Round 2, and the second one is worth your attention because the reviewer's own count was also wrong:

- **§12's accepted-row inventory.** I wrote nine rows for `controlOutlineResidue`, round 2 said eleven,
  and the registry has FOURTEEN across twelve distinct source lines. §12 no longer carries a hand
  count; it carries the extractor and its output, and the consequence changed with it: lines 504 and
  591 sit below the category additions where 415 does not, so FOUR rows shift rather than one.
- **Four stale counts** the round-1 repair stranded. Repaired by sweeping every numeric literal in the
  document rather than the four named, which also caught a "nine" that counted lines where the sentence
  claimed rows.

## What the spec must get right, in priority order

1. **The sweep must be DERIVED.** The row's whole reason for existing is that it refuses to
   hand-extend a swap set. The spec's order is: widen the cover, run the guards, move exactly what the
   red names. A site repaired that does not appear in the §6 red transcript is a P0. Attack §6: does
   the measured transcript actually cover the swap set in §6.1 and §6.2, and is any site in those
   tables absent from `docs/superpowers/specs/probes/2026-08-26-control-outline-cover-red.txt`?
2. **The per-consumer decision (§4, D1).** `scanInteractiveElements` has six consumers. The spec gives
   two of them the widened vocabulary and four the default, and argues each. Is any of those four
   arguments wrong, and does any consumer's population actually move in a way §7 does not state?
3. **The Family B mechanism (§5, D2) and its two limits (§5.2, §17 L1/L2).** The spec admits a painted
   child as its own element, follows exactly one extra edge (a bare local identifier bound to a
   JSX-valued const), and declines to follow a component invocation. Is the declined edge really
   declinable, and does the spec's accept-set (§5.3) leave an input unaccounted for?
4. **The arithmetic.** §6's counts, §7.1's key-multiplicity derivation, §8's category counts and AC-7
   must all agree with each other and with the committed transcript. Check them against the transcript,
   not against each other only.
5. **The `inner-chrome` category (§8).** Its bar is one structural fact plus a citation form. Is the
   structural half real (can it be satisfied by a row it should refuse), and is the sorting rule in
   §6.2 applied consistently across all 14 Family B elements?

## Convergence criterion

**Consequence bound.** Every element the widened cover admits is either moved to an outline token
`DESIGN.md` §1.2 pins at >= 3:1 for that element's ground, or registered in `RESIDUE_CENSUS` with a
category and a reason whose form the suite checks. Never silently left at a weak outline, and never
silently dropped from the cover. An element that turns out to need a registered reason rather than a
swap, plus that registered reason, is a DOCUMENTED LIMIT and not a finding. So is a conservative
`unresolved` demotion on a className the resolver could not statically read.

**PROBE DOMAIN:** `app/**` and `components/**` as walked by `scanInteractiveElements`, plus
`app/globals.css`, `DESIGN.md`, `tests/styles/**`, `tests/mutation/source/registry.ts` and
`BACKLOG.md`. A probe outside that set, or more than one ordinary edit away from a file in it, files
to documented limits and not to a round. A constructed component exercising a JSX shape the corpus
does not contain is outside the domain.

**Threat fence.** Accidental authoring mistakes by an ordinary contributor adding or editing a control
in `app/**` or `components/**`. Adversarial obfuscation of a className (computed strings, dynamic token
construction, a class assembled across module boundaries beyond the resolver's declared bounds at
`tests/styles/interactiveScanCore.ts:79-81`) is OUT OF SCOPE and files to documented limits; the
scanner already reports `unresolved` for what it could not statically read, which is the
surfaced-signal half of the bound.

Every admissibility clause above cites this fence and this domain. A claim about current behaviour or
corpus content is settled by PROBE, and your finding includes the probe output. No guard tightening is
accepted without a probe demonstrating the corruption it prevents.

## Exhaust the vector

Enumerate ALL instances of each finding class you identify in THIS round. A repeated vector dripped one
instance per round is a review defect, not thoroughness. If you find one stale count, sweep every count
in the document before writing the finding.

## EXPLICITLY DO NOT RELITIGATE

Each is ratified; verify the citation rather than re-deriving the decision.

- **Eric's two rulings** (spec §1). Taken 2026-08-26 04:53 against a rendered mockup carrying the
  measured ratios, the same bar as the 2026-08-16 and 2026-08-18 rulings. Arguing that a text field's
  border is a field affordance rather than a control outline, or that an open-state child outline is a
  state cue rather than a resting boundary, is relitigating a rendered ruling.
- **The switch tracks stay OUT.** `DESIGN.md:250-261`, ruled 2026-08-16. Family B's open state carries
  the same token pair and the same 1.43:1 / 1.75:1 numbers; the tracks are excluded for the ON/OFF
  RELATIONSHIP, not for the ratio. `components/admin/telemetry/AutoRefreshControl.tsx:105` becoming
  visible to the widened cover is a residue-registration duty, not a reopening.
- **The 2026-08-18 `border-border` ruling.** `DESIGN.md:295-302`. A control's resting `border-border`
  on a neutral ground or unfilled takes the text ramp. The closed arms of the menu triggers are that
  ruling reaching a site the cover could not see, not a new question.
- **No structural predicate for trackness, and none for chrome-ness.** Five mechanisms tried to recover
  structure from the scanner's projection and each escaped structurally
  (`tests/styles/controlOutlineScan.ts:16-20`, `tests/styles/controlOutlineResidue.ts:9-13`). Asking
  for a function that decides whether an arbitrary element is a toggle, or is chrome, is asking for the
  axis that is already closed.
- **`tests/styles/subtleInteractiveScan.ts` stays unenrolled** in the mutation registry
  (`tests/mutation/source/registry.ts:2657-2671`): it produced zero mutants and the harness rejected it
  by its own no-mutants condition. A vacuous row is worse than an honest absence.
- **The specLint fixtures** under `tests/specLint/fixtures/claimSweep/` are frozen copies of a prior
  arc's spec, not live claims. Their sentence "The scanner's element vocabulary is unchanged" is
  fixture content; editing it reds specLint.
- **The row's own line citations** anchor on paint lines and several have drifted. Spec §3 supersedes
  them, re-derived against `b30413cf5`.
- **No new `BL-`/`DEF-` row of any facing** (Eric's directive, 2026-08-25, stronger than the AGENTS.md
  process mint freeze). Every peer defect is repaired in this PR, demoted to the owning surface's
  documented-limits record, or raised to the orchestrator. Do not propose a ledger row.

## Output

End with exactly two lines:

```
FINDINGS: <n>
VERDICT: <APPROVE | NEEDS-ATTENTION | BLOCKING>
```

`FINDINGS: 0` when you raise none.
