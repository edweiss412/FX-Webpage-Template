# Spike — static font guard (Lightning CSS)

The executable evidence behind §4.1 of the harness-font-fidelity spec. Committed
because a spike cited from `/tmp` is not reviewable: round 21 read a stale
regex-era file at a `/tmp` path the spec still named and correctly reported that
the claimed guard did not exist.

`static-guard.mjs` parses the fonts stylesheet with **Lightning CSS** — the same
parser `@tailwindcss/cli` and `@tailwindcss/postcss` use to compile
`app/globals.css` and every harness entry through `compileEntryCss`. It runs in
Node, with no browser, which is what lets the shipped guard live in the
merge-blocking unit suite.

`mutants.mjs` applies 32 mutations to a known-good stylesheet and asserts the
guard rejects every one.

`harness-guard.mjs` + `harness-mutants.mjs` are the harness-side twin. They
simulate the target-state `compileEntryCss` post-step — rewrite `/fonts/` URLs
to bare siblings, `swap` to `block`, copy the seven files beside the output —
and check the four §4.1 harness rows plus their preconditions: 10 rows, 11
mutants, all killed. Together the two instruments are 27 rows and 43 mutants.

## Running it

Lightning CSS is a transitive dependency until the plan adds the exact pin, so
point `LCSS` at the resolved copy:

```
LCSS=$PWD/node_modules/.pnpm/lightningcss@1.32.0/node_modules/lightningcss/node/index.js \
  node docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/mutants.mjs
```

Expected: `17/17 rows passing` for the target state, `32/32 mutants killed`.

`SPIKE_DIR` defaults to `/tmp/spike-fonts` — a directory holding `fonts.css`
plus the seven `.woff2` files. Those bytes are byte-identical to the seven a
production build emits under `.next/static/media/`, verified by hashing both
sides; they are not committed here because the plan commits them under
`public/fonts/` as the real deliverable.

## `consistency.mjs`

A self-consistency checker for the spec, run before every review dispatch.

Rounds 19, 20 and 21 each spent findings on one defect: a statement was updated
and its peers were not. Resolving to sweep more carefully had already failed
three times, so the sweep is mechanical — counts that must agree, the guard's
parser (CSSOM is legal only when describing a mutant or the retired draft), the
probe's zero-advance filter, the wait anchor, and any citation of an untracked
scratch path.

```
node docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/consistency.mjs
```

Validated the way the guard is: run against the spec as round 21 reviewed it, it
fires on four of that round's six findings — the stale `24`, the
`CSSStyleSheet.replaceSync()` mandate, the combining-mark contradiction, and the
navigation-site placement rule. The two it misses are not textual-consistency
defects (a mechanism I verified with a grep that could not have found the case,
and two files left unnamed), which is the honest boundary of what this can do.
