# Share-link cue — adversary matrix (executed)

Spec §9.0/§9.1.1, plan Task 6. Produced by `node scripts/share-link-flash-adversary-matrix.mjs`
against a committed tree, full mode (browser spec included).

**One declared survivor, and only one kind.** `EQUIVALENT_SURVIVORS` holds A4 alone: it changes nothing observable, which is proven rather than assumed, and the check runs in both directions — an A4 that comes back REJECTED fails the run, because that means something unrelated broke. Anything else that survives fails the run.

There is deliberately no second category for "wrong but uncaught". One existed briefly (`UNPROVEN_SURVIVORS`, for the `useLayoutEffect` ordering) and round-11 review rejected it as laundering — correctly: it had no bidirectional check, so a later regression back to survival would still have passed. That gap was `SHARELINK-COPY-REF-ORDERING-PROOF` in DEFERRED.md, and it is now closed: `tests/components/admin/shareLinkCopyButtonOrdering.test.tsx` settles a clipboard promise inside the commit-to-passive window, and the ordering is registered as adversary `A39` rather than whitelisted. The round-11 ruling stands in both directions: no exemption row was added for it.

**What a row means.** A row is a TEST, not an assertion. Both collectors record test titles, so an adversary that reds any one of a test's assertions credits the whole row; removing a single assertion need not change this table. The matrix shows every registered wrong implementation is caught by SOME row — not that each assertion is load-bearing. Assertions with a history of being vacuous were mutation-checked by hand and say so at the site.

Totals and both tables are generated below. The one survivor is A4, which is a
proven-equivalent mutant rather than a coverage hole — see the section after them.

## Every adversary, and what rejects it

> Both tables below are WRITTEN BY THE SCRIPT on every full run
> (`node scripts/share-link-flash-adversary-matrix.mjs`, no `--only`/`--quick`).
> Do not hand-edit between the markers: a hand-transcribed total is what drifted
> out of sync with the code last round. Prose outside the markers is authored.

**The generated block below is 38 adversaries; the register is 39. `A39` is evidenced here instead, and this note is that evidence.** Regenerating the block means a full run, which mutates and re-runs the whole suite once per adversary, thirty-nine times, with the browser leg on each. bl-orch ruled on 2026-09-01 that one documentation row does not buy hours of local heavy time, and that the scoped rejection is the evidence that matters. So the block keeps the totals its last full run wrote, and nothing between the markers is hand-edited. **Regen trigger: the next full-mode run picks `A39` up with no further action.**

`A39` was run alone, in FULL mode with the browser leg included, on 2026-09-01. Verbatim:

```
$ pnpm heavy node scripts/share-link-flash-adversary-matrix.mjs --only A39
A39  REJECTED  (1 rows)  copy button: urlRef written in a PASSIVE effect, so a promise settling before the passive flush confirms a dead url

1 adversaries · 1 rejected · 0 SURVIVED · 0 unapplied
```

One row, and it is the jsdom harness's `T-ORDER-STALE`. That single number is the whole point rather than a detail: all seven browser rows RAN under the mutant and all seven passed, `T-FLASH-COPY-RACE` included. The row this adversary comes from said exactly that would happen, because Playwright cannot schedule a promise resolution inside the commit-to-passive window, and the full-mode run confirms it rather than assuming it. No browser row rescued the credit.


<!-- BEGIN GENERATED -->

_38 adversaries · 37 rejected · 1 survived · 0 unapplied._

| # | Wrong implementation | Rows red |
|---|---|---|
| A1 | never sets the attribute | 11 |
| A2 | sets it, never clears it | 4 |
| A3 | clears on a duration other than the constant | 1 |
| A4 | sets it unconditionally on mount | SURVIVED |
| A5 | bumps on ANY token change, nulls included | 1 |
| A6 | clears on !open alone | 1 |
| A7 | clears on token-nullity alone | 1 |
| A8 | cues for a rotation the epoch gate rejected | 2 |
| A9 | omits key entirely | 2 |
| A10 | uses key={flash} | 1 |
| A11 | boolean instead of a nonce | 1 |
| A12 | omits the effect cleanup | 2 |
| A13 | wash keyframe replaced by a single opacity stop | 3 |
| A14 | CSS duration drifts from the constant | 3 |
| A15 | no reduced-motion override | 4 |
| A16 | override present but outranked by a later rule | 2 |
| A17 | later duplicate keyframes win the cascade | 4 |
| A18 | ancestor-qualified rule suppresses it in the real tree | 4 |
| A19 | ring suppressed while the wash still works | 3 |
| A20 | component renders its OWN competing keyframes in a <style> element | 2 |
| A23 | attribute on the wrapper row, not the code block | 11 |
| A24 | drops the !open arm | 2 |
| A25 | constant AND CSS moved together | 6 |
| A26 | hold stop and ring width altered, colours kept | 2 |
| A27 | steady wash under reduced motion | 3 |
| A28 | ancestor rule scoped to the real modal ROOT suppresses the cue | 4 |
| A29 | selector widened to `html [data-...]` (defeats substring matching) | 3 |
| A30 | the attribute rule is duplicated (a later copy wins the cascade) | 2 |
| A31 | cue ungated: the URL block animates at rest, with no attribute | 8 |
| A32 | copy button: drops the captured-url check, so a stale write still confirms | 2 |
| A33 | copy button: no reset when the url rotates after a completed copy | 1 |
| A34 | copy button: resets in a PASSIVE effect, painting one stale frame | 1 |
| A35 | copy button: suppresses EVERY deferred confirmation, not only stale ones | 2 |
| A36 | seeded at mount AND never cleared, so opening the panel cues with no rotate | 11 |
| A37 | whole cue block nested inside `@media screen`, defeating contiguity | 1 |
| A38 | `@media screen` nesting hidden by escaped braces that balance the count | 1 |
| A22 | token retuned below the ring's contrast floor | 2 |
| A21 | renders a wrong token / Copy writes a stale one | 2 |

| Test row | Adversaries it rejects |
|---|---|
| ShareLinkCopyButton across a rotate a completed copy stops claiming Copied once the url rotates | A33, A34, A35 |
| ShareLinkCopyButton across a rotate a copy of the CURRENT url still confirms (the guard is not blanket suppression) | A35 |
| ShareLinkCopyButton across a rotate a copy still in flight when the url rotates never announces success | A32 |
| T-FLASH-COPY-RACE | A32 |
| T-FLASH-REDUCED | A1, A15, A16, A23, A27, A29, A30, A31 |
| T-FLASH-REST | A31, A36 |
| T-FLASH-RESTART | A1, A9, A18, A23, A28 |
| T-FLASH-RUN | A1, A13, A14, A18, A19, A20, A23, A25, A28, A31, A36 |
| T-FLASH-SETTLE | A2, A25, A31, A36 |
| T-FLASH-SOLE | A1, A18, A23, A28, A31, A36 |
| accent token contrast floors (2026-07-16 token pass) accent-edge is wired: @theme alias present, runtime value in ALL three blocks, dark blocks identical | A22 |
| accent token contrast floors (2026-07-16 token pass) dark: accent-edge clears >=3:1 on every ground the flash ring touches | A22 |
| branch 1 — the target leaving the screen clears the cue a change while the panel is CLOSED never reaches the DOM | A24, A36 |
| branch 1 — the target leaving the screen clears the cue an UNPUBLISH mid-cue clears it even though the token never changed | A1, A6, A7, A23, A36 |
| branch 1 — the target leaving the screen clears the cue archiving clears it (the whole share half goes) | A1, A23 |
| branch 1 — the target leaving the screen clears the cue closing mid-cue clears it, so reopening inside the window is clean | A1, A23, A24, A36 |
| branch 2 — an accepted token change cues clears at exactly SHARE_LINK_FLASH_MS, not before | A1, A2, A3, A23 |
| branch 2 — an accepted token change cues marks the URL block, and EXACTLY that element | A1, A23, A36 |
| branch 2 — an accepted token change cues re-arms on a second change so the later cue runs its full window | A1, A2, A11, A12, A23, A25 |
| branch 2 — an accepted token change cues remounts the URL block and NOTHING else (N4) | A9 |
| branch 3 — everything else leaves the attribute alone a STRICTLY LOWER epoch is rejected, so nothing cues | A8, A36 |
| branch 3 — everything else leaves the attribute alone a live cue SURVIVES unrelated re-renders | A1, A23 |
| branch 3 — everything else leaves the attribute alone expiry does NOT remount anything (N5) — a text selection survives it | A2, A10 |
| branch 3 — everything else leaves the attribute alone no cue on first render or first open | A36 |
| branch 3 — everything else leaves the attribute alone null becoming a token does NOT cue | A5 |
| share-link cue motion contract (N0/N1) N0: SHARE_LINK_FLASH_MS is 1600 | A25 |
| share-link cue motion contract (N0/N1) N1: both keyframes are declared exactly once | A17 |
| share-link cue motion contract (N0/N1) N1: nothing ELSE in the stylesheet mentions the cue | A15, A16, A17, A18, A28, A30, A31 |
| share-link cue motion contract (N0/N1) N1: the block sits at TOP LEVEL, not nested in an at-rule | A13, A14, A15, A17, A19, A25, A26, A27, A29, A31, A37, A38 |
| share-link cue motion contract (N0/N1) N1: the component declares no keyframes of its own | A20 |
| share-link cue motion contract (N0/N1) N1: the spec's normative block appears in globals.css BYTE FOR BYTE | A13, A14, A15, A17, A19, A25, A26, A27, A29, A31 |
| share-token rotate surface (the ShareHub crew-URL block) a rotate updates the URL instantly — OLD then vanishes everywhere | A21 |
| share-token rotate surface (the ShareHub crew-URL block) a rotation at a STRICTLY LOWER epoch is rejected — the URL does not regress | A8, A21 |
| teardown unmounting mid-cue clears the CUE's timer | A12, A36 |

<!-- END GENERATED -->

## A4 is an equivalent mutant, not a coverage hole

A4 seeds `flash` non-null at mount. It applies cleanly and changes nothing observable:
`open` starts `false`, so the visibility predicate `(!open || !linkActive)` clears the
seed in the SAME render pass, before any element can carry the attribute. By the time the
panel opens, `flash` is null. No test can distinguish it because the design dominates it.

This is worth recording rather than contorting a row to catch: the spec already learned
this lesson once, when review round 2 found that the row then claiming to catch a bad
`prevToken` seed could not, for the same structural reason.


## Harness faults this run exposed

Both were the same shape as the defects the matrix exists to find — a check that appears
to test something and does not.

1. **Ambiguous anchors produced false SURVIVED results.** `String.replace` with a string
   rewrites only the first match, and `key={token}` occurs twice in ShareHub: once in the
   JSX comment explaining the choice, once as the real prop. A9 and A10 were patching
   prose. The harness now hard-errors on an ambiguous anchor; `all: true` is opt-in and
   used only where the duplication is itself the contract (a theme token declared in both
   dark blocks, which a shipped test pins identical).
2. **A8 was a no-op mutant taking credit for another adversary.** It mutated a condition
   that could never be true and bundled A5s mutation alongside. Re-expressed through the
   epoch gate, which is where the claim actually lives.

## Coverage gap this run closed

A5 (bumps on ANY token change, nulls included) was rejected by nothing. Every row started
from a token that already existed, so none could reach the null-to-token transition — the
guard direction where `linkActive` turns TRUE and the visibility predicate suppresses
nothing. A row was added; A5 is now rejected.

## Re-run after the whole-diff review

Regenerated on the final tree. The first recorded run was taken BEFORE the
impeccable fix moved the ring to a shared 45% hold, which made A26's anchor
ambiguous and left the report claiming an unapplied count it no longer had.
Round-1 whole-diff review caught the mismatch; the anchor is now unique to the
wash track and this table is the post-fix result.

The run also gained an easing adversary path: the browser probe now reads the
resolved `animation-timing-function`, which nothing asserted anywhere before —
the source scan only proved the shorthand EXISTED, so a later `linear` override
would have left every assertion green while violating the ratified curve.

## Round-2 whole-diff review: A28, and what running it settled

Round 2 argued the browser harness used a synthetic panel, so a rule scoped to
the modal's own subheader would kill the production cue while the harness stayed
green. The harness was rebuilt on the REAL `ReviewModalShell` with the REAL
`StatusStrip` in its `subHeader` slot, and A28 registered to check it.

Running it settled the question differently than the review framed it. A
SUBHEADER-scoped selector cannot match the cue in production either: the popover
PORTALS out of the subheader into the panel via `PopoverHostContext`, so no
subtree-scoped rule above the portal target can reach it. The reviewer's specific
example was unreachable — and the portal escaping such rules is a property of the
design rather than an accident.

What IS reachable is a rule scoped to an ancestor the portal lands under. A18
covers the panel; A28 is the modal ROOT above it, which the synthetic harness did
not have at all. Retargeted there, A28 is rejected (row count in the generated table) — so the rebuilt
harness does close the class the review identified, just not via the selector it
proposed.
