# Intent fixture plan

This plan cites `relocationHints` at `lib/specLint/emDash.ts:1`, which is the
wrong file: the identifier appears nowhere in it.

The real home is `lib/specLint/citationIntent.ts:1`, cited LATER than the wrong
citation so a single-pass relocation search would find nothing.
