# Share-link cue — adversary matrix (executed)

Spec §9.0/§9.1.1, plan Task 6. Produced by `node scripts/share-link-flash-adversary-matrix.mjs`
against a committed tree, full mode (browser spec included).

Totals and both tables are generated below. The one survivor is A4, which is a
proven-equivalent mutant rather than a coverage hole — see the section after them.

## Every adversary, and what rejects it

> Both tables below are WRITTEN BY THE SCRIPT on every full run
> (`node scripts/share-link-flash-adversary-matrix.mjs`, no `--only`/`--quick`).
> Do not hand-edit between the markers: a hand-transcribed total is what drifted
> out of sync with the code last round. Prose outside the markers is authored.


<!-- BEGIN GENERATED -->

_30 adversaries · 29 rejected · 1 survived · 0 unapplied._

| # | Wrong implementation | Rows red |
|---|---|---|
| A1 | never sets the attribute | 13 |
| A2 | sets it, never clears it | 9 |
| A3 | clears on a duration other than the constant | 1 |
| A4 | sets it unconditionally on mount | SURVIVED |
| A5 | bumps on ANY token change, nulls included | 1 |
| A6 | clears on !open alone | 1 |
| A7 | clears on token-nullity alone | 1 |
| A8 | cues for a rotation the epoch gate rejected | 2 |
| A9 | omits key entirely | 7 |
| A10 | uses key={flash} | 1 |
| A11 | boolean instead of a nonce | 1 |
| A12 | omits the effect cleanup | 2 |
| A13 | empty keyframe bodies | 7 |
| A14 | CSS duration drifts from the constant | 7 |
| A15 | no reduced-motion override | 7 |
| A16 | override present but outranked by a later rule | 7 |
| A17 | later duplicate keyframes win the cascade | 2 |
| A18 | ancestor-qualified rule suppresses it in the real tree | 7 |
| A19 | ring suppressed while the wash still works | 7 |
| A20 | keyframes moved into the component | 1 |
| A23 | attribute on the wrapper row, not the code block | 7 |
| A24 | drops the !open arm | 2 |
| A25 | constant AND CSS moved together | 9 |
| A26 | hold stop and ring width altered, colours kept | 1 |
| A27 | steady wash under reduced motion | 7 |
| A28 | ancestor rule scoped to the real modal ROOT suppresses the cue | 7 |
| A29 | selector widened to `html [data-...]` (defeats substring matching) | 7 |
| A30 | the attribute rule is duplicated (a later copy wins the cascade) | 7 |
| A22 | token retuned below the ring's contrast floor | 2 |
| A21 | renders a wrong token / Copy writes a stale one | 2 |

| Test row | Adversaries it rejects |
|---|---|
| N0: SHARE_LINK_FLASH_MS is 1600 | A25 |
| N1: both keyframes are declared exactly once | A17 |
| N1: the component declares no keyframes of its own | A20 |
| N1: the shipped cue rules EQUAL the spec's normative block | A13, A14, A15, A16, A17, A18, A19, A25, A26, A27, A28, A29, A30 |
| T-FLASH-REDUCED | A1, A2, A9, A13, A14, A15, A16, A18, A19, A23, A25, A27, A28, A29, A30 |
| T-FLASH-REST | A1, A2, A9, A13, A14, A15, A16, A18, A19, A23, A25, A27, A28, A29, A30 |
| T-FLASH-RESTART | A1, A2, A9, A13, A14, A15, A16, A18, A19, A23, A25, A27, A28, A29, A30 |
| T-FLASH-RUN | A1, A2, A9, A13, A14, A15, A16, A18, A19, A23, A25, A27, A28, A29, A30 |
| T-FLASH-SETTLE | A1, A2, A9, A13, A14, A15, A16, A18, A19, A23, A25, A27, A28, A29, A30 |
| T-FLASH-SOLE | A1, A2, A9, A13, A14, A15, A16, A18, A19, A23, A25, A27, A28, A29, A30 |
| a STRICTLY LOWER epoch is rejected, so nothing cues | A8 |
| a change while the panel is CLOSED never reaches the DOM | A24 |
| a live cue SURVIVES unrelated re-renders | A1 |
| a rotate updates the URL instantly — OLD then vanishes everywhere | A21 |
| a rotation at a STRICTLY LOWER epoch is rejected — the URL does not regress | A8, A21 |
| accent-edge is wired: @theme alias present, runtime value in ALL three blocks, dark blocks identical | A22 |
| an UNPUBLISH mid-cue clears it even though the token never changed | A1, A6, A7 |
| archiving clears it (the whole share half goes) | A1 |
| clears at exactly SHARE_LINK_FLASH_MS, not before | A1, A2, A3 |
| closing mid-cue clears it, so reopening inside the window is clean | A1, A24 |
| dark: accent-edge clears >=3:1 on every ground the flash ring touches | A22 |
| expiry does NOT remount anything (N5) — a text selection survives it | A2, A10 |
| marks the URL block, and EXACTLY that element | A1, A23 |
| null becoming a token does NOT cue | A5 |
| re-arms on a second change so the later cue runs its full window | A1, A2, A11, A12, A25 |
| remounts the URL block and NOTHING else (N4) | A9 |
| unmounting mid-cue clears the CUE's timer | A12 |

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
