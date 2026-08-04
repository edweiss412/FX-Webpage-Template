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

`mutants.mjs` applies 30 mutations to a known-good stylesheet and asserts the
guard rejects every one.

## Running it

Lightning CSS is a transitive dependency until the plan adds the exact pin, so
point `LCSS` at the resolved copy:

```
LCSS=$PWD/node_modules/.pnpm/lightningcss@1.32.0/node_modules/lightningcss/node/index.js \
  node docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/mutants.mjs
```

Expected: `15/15 rows passing` for the target state, `30/30 mutants killed`.

`SPIKE_DIR` defaults to `/tmp/spike-fonts` — a directory holding `fonts.css`
plus the seven `.woff2` files. Those bytes are byte-identical to the seven a
production build emits under `.next/static/media/`, verified by hashing both
sides; they are not committed here because the plan commits them under
`public/fonts/` as the real deliverable.
