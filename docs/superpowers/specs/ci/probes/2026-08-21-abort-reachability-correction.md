# Probe record correction — Task 6's abort-reachability proof

`319808fc2`'s message claims: "the abort proved reachable by removing it and
observing the total-fault case red, restored byte-identical."

**That proof did not happen as described.** The excision cut mid-object-literal,
so the module stopped parsing and vitest reported `no tests`. An uncollectable
file is not a red — it is the green-from-birth shape wearing a failure's
clothes, and it proves nothing about the assertion under test. The claim was
written from the intent of the probe rather than from its output.

**The proof, redone so the file still COLLECTS:** neutralise the abort's
CONDITION rather than excising its block.

    condition `observations.length === 0` -> `false`
    blob 82bdd092 -> 1d457dfb
    collected: Tests  1 failed | 41 passed (42)
    AssertionError: expected 'result' to be 'refusal'
    restored byte-identical to 82bdd092

Now the suite collects 42 cases and exactly the total-fault case reds, naming
the asserted reason: with the abort unable to fire, a run in which every
attempt faulted returns a `result` — a distribution over an empty population —
where a `refusal` is required.

**The general form, which is why this is recorded rather than quietly redone.**
A mutation probe must leave the subject COLLECTABLE. `no tests` and `1 failed`
are different outcomes and only the second is evidence; a probe that breaks the
parse cannot distinguish "the assertion caught it" from "nothing ran". Prefer
neutralising a CONDITION to excising a BLOCK, because the first is
parse-preserving by construction.
