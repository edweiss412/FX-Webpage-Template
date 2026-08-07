# L-wave closeout

Three units, three PRs, all merged: **W-LDOCS** (#720), **W-PUSH** (#721), **W-EMDASH** (#722).
Spec: `docs/superpowers/specs/2026-08-06-l-wave-design.md`. Plan: `plan.md` in this directory.

## AC-PROG — the pinned claim, recomputed

Baseline (spec §0, `pnpm ledger:mass` at post-#717 `a8b3a4128`): **80 open entries, mass 460**
(XS 3 / S 16 / M 32 / L 29).

At wave close:

```
queue           open   XS   S   M   L  unsized    mass
BACKLOG.md        63    3  15  31  14        0     338
DEFERRED.md       12    0   3   6   3        0      54
TOTAL             75    3  18  37  17        0     392
```

**Strictly below the baseline on both pinned axes: 75 < 80 entries, 392 < 460 mass.**

The arithmetic is worth reading, because the headline number understates the work. **The L tier — the
wave's actual target — went 29 → 17**, a 41% reduction. Net entry count moved only 80 → 75 because
the wave deliberately traded umbrellas for schedulable rows: **14 entries archived, 10 filed.** An
L-sized umbrella that nobody could pick up became five M children that anyone can; that is a queue
getting more useful while barely getting shorter, and it is the outcome the wave was designed for.

## What each unit settled

**W-LDOCS (#720)** — 27 claimed entries screened. The coverage-claim sentence class deleted (and
deliberately NOT guarded, per ratification); six archives; four umbrellas decomposed
(`BL-MUTATION-HARNESS-OPEN-HOLES` → 5 sized children, `BL-OPS-LOG` → 3, `BL-E2E-LIFECYCLE-SPECS-CI-DARK`
refiled at honest scope, `BL-RESURRECT-MOBILE-SAFARI-E2E` rewritten in place); one new honest filing;
11 classification stamps; two probe-decided dispositions.

**W-PUSH (#721)** — the "Report a problem" footer link in every push email, both body channels, one
unit row per RENDER SHAPE (five entry points produce nine shapes). `BL-PUSH-NOTIFICATIONS` resized
L → S in the shipping commit and archived.

**W-EMDASH (#722)** — `DESIGN.md` §9 enforced by a structural guard over ~50 repaired strings and ~80
test pins, with an exemption registry and 12 permanent premises.

## Both probe-gated dispositions, and what they returned

The spec pre-ratified BOTH outcomes for each, so neither result was a surprise or a judgment call.

**`BL-CI-PARALLEL-DB-FALLBACK-AUDIT` → ARCHIVED (answered-negative).** Ran the `parallel` project
twice, once with every Supabase endpoint live and once with all three at `127.0.0.1:1` (a REFUSED
connection, which is the entry's own distinction from merely omitting the database): 890 files, 12271
passing tests both sides, **0 degrading**. Two corrections were made mid-probe, each of which would
otherwise have produced a false negative indistinguishable from the real one — the first baseline had
all three endpoint variables UNSET (comparing *absent* to *closed*, the exact two states the entry
exists to distinguish), and the instrument was proven sensitive by a planted sentinel before the zero
was believed. Differ and transcript are committed so re-measuring is a command.

**`BL-TRANSPORT-ID-RESOLUTION` → RESIZED, stays open.** The id-visibility half landed (Flow 8.3b/#380,
`scopeTiles.ts` Branch 0), but the deferred regression pins did not — `rg 'Bill Werner|William Werner'`
returns nothing. Resized L → S with its body reduced to exactly the pin list.

## Impeccable gate

`impeccable-gate: N/A — no UI surface` (W-LDOCS: ledger prose, code comments, probe transcripts)
`impeccable-gate: N/A — no UI surface` (W-PUSH: email HTML in `lib/notify/`, outside invariant 8's UI definition)
`impeccable-gate: critique + audit run on the W-EMDASH diff; all P0/P1/P2 fixed, none deferred`

**The gate earned its keep, and this is the part worth carrying forward.** Both halves returned FAIL
with real findings, and the audit's was a **genuine guard bypass**: the sentinel carve-out tested
`text.trim() === EM_DASH`, so any bare-glyph literal was skipped regardless of its neighbours. Three
mutants defeated it — `<span>Notifications{" — "}unseen</span>`, `"Notifications " + "—" + …`, and
`` `Notifications ${"—"} …` `` — each rendering a visible em dash while the guard stayed green, and
each idiomatic authoring rather than obfuscation, i.e. squarely inside the declared threat model. The
rule now refuses to trim string literals and refuses sentinel status to any literal whose parent
builds a string; all three ship as permanent regression premises, with two more pinning the opposite
boundary so the tightening cannot start flagging real sentinels.

The critique found one P0 copy corruption (`Diagram 1 , image unavailable`, a stray space from the
mechanical sweep) plus four P1s where a mechanical dash-swap was ungrammatical or changed meaning, and
a voice note — semicolons had become a monoculture across ~50 repairs — which was acted on rather than
filed.

**Findings + dispositions:** every P0/P1/P2 from both halves is fixed in `267678f77`. Nothing deferred,
so no `DEFERRED.md` entry was opened.

## Screenshot baselines: measured, not assumed

Not regenerated, because none is stale. The `screenshots-drift` CI job re-captures all 14 help WebPs
inside the pinned `mcr.microsoft.com/playwright:v1.59.1-jammy` image on a **native-amd64 runner** and
byte-compares against the committed baselines; it PASSED on the repaired tree. Per the
byte-comparison discipline that verdict had to come from CI — an arm64 dev host diverges from the
native-x64 runner even on an identical pinned image tag, so a local capture could not have settled it
either way. The plan's step-1 RED explicitly allows this branch: "a capture that does NOT differ is
recorded as unaffected and not regenerated."

## Review economy

Both units that reached the round threshold filed their retrospectives:
`docs/review-rounds/feat/l-wave-docs/c23208e1334f.md` (4 rounds, 16 findings) and
`docs/review-rounds/feat/l-wave-push/a0e41551c059.md` (4 rounds, 4 findings). They record the same
lesson from two directions: **every finding in both arcs was in a TEST or a CLAIM, never in shipped
behaviour**, and nearly all were found by MUTATING the artifact rather than by reading it. The
W-PUSH filing's concrete lever — run the four cheap mutants (empty value, value-plus-suffix,
content-present-but-not-live, each discriminating parameter) before dispatching a review — is what
would have collapsed four rounds into one, and it is exactly what caught the W-EMDASH bypass.
