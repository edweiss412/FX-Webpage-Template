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

### The population moves with the branch; the offender count does not

Both blocks above were run at the base `8bf870991`. Re-run on this branch they report
**1204 sites across 498 files, 1123 literal** — the two probe scripts in this directory
each substitute a string literal and joined the population they measure. Offenders are
unmoved at **56 across 32 files**, so every decision in this record stands. The spec's
probe domain is stated as the derivation rather than as the pair of numbers for exactly
this reason.

## 4. The 56, by directory

Sites and files are separate columns because chained calls put several offender sites on
one line — `shapeHoldEntry.ts` contributes three sites at a single line 29.

| Directory | Offender sites | Offender files |
| --- | --- | --- |
| `tests/` | 35 | 18 |
| `lib/` | 9 | 5 |
| `scripts/` | 5 | 4 |
| `docs/` | 4 | 4 |
| `components/` | 3 | 1 |
| **Total** | **56** | **32** |

Derived, not transcribed:

```
$ pnpm exec tsx …/count-conservative.mts --list | sed -n '9,$p' | awk -F/ '{print $1}' | sort | uniq -c | sort -rn
$ pnpm exec tsx …/count-conservative.mts --list | sed -n '9,$p' | awk -F: '{print $1}' | sort -u | awk -F/ '{print $1}' | sort | uniq -c | sort -rn
```

An earlier revision of this section printed `tests 32 / lib 4 / docs 4 / components 3 /
scripts 2`, which sums to 45 — the const-FOLDED offender total from §3, not the 56. The
table above is the conservative judge's own output.

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

## 6. Which const-bound replacements carry a `$`

The wrap repair (`X.replace(a, b)` to `X.replace(a, () => b)`) is behaviour-identical
unless `b` already held a `$` substitution sequence. One shape inverts that: a const the
author DELIBERATELY wrote with a `$n` capture reference. Wrapping one of those turns a
live capture into literal text, so they have to be found before the sweep, not after.

`count-dollar-consts.mts` resolves every offender whose replacement is a bare identifier
back to its same-file `const NAME = "literal"` and reports whether the literal matches
`$(&|` + "`" + `|'|\d|<name>|$)`.

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-dollar-consts.mts | sort
DOLLAR-BEARING  lib/observe/scrubSentryEvent.ts:18   TOKEN_PLACEHOLDER = "$1[shareToken-redacted]"
plain           lib/log/sanitize.ts:6                REDACTED = "[email-redacted]"
plain           lib/test/serialAudit.ts:19           DEEP = "\u0000DEEP\u0000"
plain           lib/test/serialAudit.ts:19           DEEP_SUFFIX = "\u0000DEEPSUF\u0000"
plain           lib/test/serialAudit.ts:19           STAR = "\u0000STAR\u0000"
plain           scripts/audit-cn-operand-kinds.mjs:1019   other = "active ? \"bg-on\" : \"bg-off\""
plain           scripts/audit-cn-operand-kinds.mjs:1019   sanctioned = "tone === \"show\" ? …"
plain           scripts/extract-admin-log-only-codes.ts:38  ESCAPED_PIPE_SENTINEL = "<<ESCAPED-PIPE>>"
plain           tests/admin/needsAttention.test.ts:163      driveFileName = "Validation — Normal day"
plain           tests/paneCompaction/driver.test.ts:40      NONCE = "0123456789abcdef0123456789abcdef"
plain           tests/styles/_metaNewTabAnnouncement.test.ts:3697  hid = "<span aria-hidden=\"true\">Go</span>"
```

**Eleven of the 56 resolve to a same-file const literal, and exactly one is
`$`-bearing:** `lib/observe/scrubSentryEvent.ts:18`, where `$1` carries the
`/show/<slug>/` prefix through the Sentry URL scrub. Its repair is the capture-preserving
form, not the wrap. The other ten take the wrap unchanged.

The derivation resolves const identifiers only. An offender whose replacement is a
property access, template expression, or call holds a RUNTIME value — that is the defect
the wrap fixes, not a capture reference to preserve — so the absence of those from this
list is the expected reading, not a gap. The spec records that boundary as documented
limit 6.
