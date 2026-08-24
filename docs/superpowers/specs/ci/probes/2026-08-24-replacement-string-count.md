# Replacement-string offender count, repo-wide — 2026-08-24

Probe record for `BL-REPLACEMENT-STRING-CLASS-SWEEP` (`BACKLOG.md`). The row's first
scheduled step is a report-only run of the AST walk over the whole repository, because
the offender count is what decides whether the gate can ship as `fail` or has to ship
advisory-first.

Base: `origin/main` at `8bf8709914a3af247fc816f7c3e5329854a322c7`, worktree
`FX-worktrees/replsweep`, TypeScript compiler API via `pnpm exec tsx`. Scripts are
committed beside this record at
`docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/` and re-run from
the repository root.

---

## 1. The judge, and why it is the shipped one

`tests/paneCompaction/literalSubstitution.test.ts` already walks two files and judges
every `.replace`/`.replaceAll` call's SECOND argument: a string literal is fine, a
replacer function is fine, anything else is the defect. This probe is that judge with
the file list replaced by a walker-derived population — `git ls-files` filtered to
JS/TS extensions — and the assertion replaced by a tally.

Nothing about the judge changed. That matters for reading the number: it is the count
the shipped guard would produce on day one, not the count of a recognizer invented for
the probe.

## 2. Conservative count (the shipped judge, unchanged)

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-conservative.mts
files scanned (tracked, JS/TS ext):   3664
files containing a replace call:      496
replace/replaceAll call sites:        1201
  literal replacement:                1120
  replacer function:                  25
  single-argument (no replacement):   0
  OFFENDERS (runtime value):          56
  offender files:                     32
```

**56 offender sites across 32 files.** A gate shipping `fail` against this population
reds the repository on its first run.

### The empty bucket is explained, not assumed

`single-argument (no replacement): 0` is the bucket that would hold `router.replace(url)`
— a call with the same method name and no replacement position at all, which the judge
would otherwise flag as an offender with no defect behind it. The zero is real:

```
$ rg -n 'router\.replace\(' -g '*.ts' -g '*.tsx' --glob '!node_modules/**'
(no matches)
$ rg -c 'replaceState' -g '*.ts' -g '*.tsx' --glob '!node_modules/**'
components/admin/review/ShowReviewSurface.tsx:4
tests/devcapture/useDevCapture.test.tsx:1
tests/components/admin/review/showReviewSurfaceSyncHash.test.tsx:11
```

This app navigates with `history.replaceState`, a different method name the walk never
matches, and uses no router `replace`. An empty bucket read without this check would be
indistinguishable from a walker that never reached the construct.

## 3. Same-file const folding moves the number by 11, and does not change the decision

The obvious narrowing is to resolve an identifier whose same-file declaration is
`const NAME = "literal"` — those carry no runtime value even though they are not spelled
inline. Measured:

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-constfold.mts
literal            1120
function             25
const-literal        11
one-arg               0
offender             45
TOTAL              1201   files 496
offender files       24
```

**45 sites in 24 files**, against 56 in 32. The resolver buys 11 sites and costs a
name-keyed const map, which is unsound under shadowing — a module-level
`const X = "a"` and an inner-scope `const X = runtimeValue` collapse to one key and the
inner site is cleared wrongly. Eleven sites is not worth a resolver that can clear a
real offender, and the conservative judge's answer for those eleven is a mechanical
repair, not an exemption. **The gate ships the conservative judge.** The folding probe
is recorded because it is the measurement that retires the resolver, not because the
resolver is planned.

Either number reds the repository, so the tier decision does not turn on this.

## 4. The 56, by directory

```
tests        32
lib           4
docs          4
components    3
scripts       2
```

Full list at `count-conservative.mts --list`; reproduced in the spec's work list.

## 5. What the count does NOT settle

The tier rule says a gate that instantly reds N historical files ships advisory-first.
That rule assumes the historical population survives the PR. It does not have to: every
one of these 56 is a `.replace(a, b)` whose repair is `.replace(a, () => b)`, which is
mechanical and behaviour-identical wherever `b` holds no `$` sequence. If the PR repairs
the population, the gate reds nothing on day one and can ship `fail`.

Two site classes complicate that and are resolved in the spec, not here:

- **Intentional grammar.** `docs/.../support.js:381` passes `"$1" + alias`, where `$1`
  is a deliberate capture reference and `alias` is the runtime part. Wrapping the whole
  argument in `() =>` would silently kill the capture. These repair to a replacer
  function taking capture parameters.
- **Frozen records.** Four sites live under `docs/**`, in dated probe and spike
  artifacts whose value is that they are what was run. Editing them falsifies the
  record.
