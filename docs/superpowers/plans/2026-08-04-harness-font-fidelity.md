# Harness font fidelity — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 31 standalone e2e harnesses render the same Inter face the product renders, by defining that face in a committed stylesheet both the app and `compileEntryCss` read, and guard it so neither side can drift.

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

**Architecture:** The app's face moves from `next/font/local` (which emits its `@font-face` only inside a Next build, invisible to the harnesses) to a hand-written `app/fonts.css` over the **same** committed binary the app ships today. `compileEntryCss` gains a post-step that emits a matching face with bare sibling URLs and `font-display: block`, and copies the binary beside its output. A Lightning CSS static guard pins the stylesheet; a harness guard pins the emitted block; a shared Playwright fixture distributes a byte-derived rendering oracle to every harness document.

**Tech Stack:** Next 16, Tailwind v4 (`@tailwindcss/cli`), Lightning CSS 1.32.0 (exact), fontkit 2.0.4, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-harness-font-fidelity-design.md`
**Closes:** `BL-HARNESS-FONT-FIDELITY`
**Branch:** `feat/harness-font-fidelity`

---

## Ratified deviation from the spec — read this first

The spec was drafted and reviewed against a tree where the app used **`next/font/google`**. `origin/main` moved underneath it: `ca8efc694` (2026-08-03 18:09) and `6c2615e9c` (19:27) switched the app to **`next/font/local`** over a vendored **upstream Inter v4.1** subset at `assets/fonts/InterVariable-latin.woff2` (176,696 bytes, Google's `latin` + `latin-ext` ranges combined, built by `scripts/subset-inter.sh`, provenance in `assets/fonts/PROVENANCE.md`). The spec's last commit (2026-08-04 07:05) postdates that merge and mentions `next/font/local`, `assets/fonts` and `InterVariable` **zero times** — it never reconciled.

Consequently these spec statements are **stale and superseded**, ratified by the user 2026-08-04:

| Spec claim | Status |
| --- | --- |
| §1 "`next/font/google` fetches from Google at build time… no lockfile entry, no hash" | **False today.** The binary is committed and checksummed. G2 and G3 are already satisfied by the current tree; this plan preserves them rather than achieving them. |
| §3.3's seven Google **v20** subsets, their hashes, and the byte-identity claim | **Superseded.** Google's build has `ss04`, `zero`, `cv*` and the `opsz` axis **stripped** (`assets/fonts/PROVENANCE.md`, "Why upstream rather than Google Fonts"). Shipping them would revert `BL-INTER-NUMERAL-DISAMBIGUATION` and fail `tests/styles/fontFeatureAvailability.test.ts`. **One** face over the existing upstream binary ships instead. |
| §3.4's Capsize table (90.44 / 22.52 / 0 / 107.12) | **Superseded.** `next/font/local` derives its override figures from *this* binary, not from a static family table; `DESIGN.md:141` already records `size-adjust: 107.89%` measured in the built output. Task 3 reads all four from a real build and pins those. |
| §4.2 "`fontkit` does not resolve in this repo today" | **False.** Declared at `package.json:126` as `^2.0.4`. No dependency task needed for it. |
| The per-subset sweep over seven `unicode-range`s (§4.0, §4.1) | **Collapses to one.** The committed face has a single coverage band; there is no second subset to sweep. Non-Latin text falls back to the system font, which is the shipped behavior today and out of scope here. |

Everything else in the spec stands, including the whole harness half, the wait invariant, the fixture design, the oracle formulation, and the SCOPE DECISION in §4.0. **Do not re-derive the settled items listed under "Settled by execution" below, and do not widen the scope decision.**

Three spec citations are off by a line or two against the live tree; use these:

| Spec cites | Actual |
| --- | --- |
| `tests/assets/singleFontLoader.test.ts:440` and `tests/assets/singleFontLoader.test.ts:456` | asserted at **417** and **440**; `CANONICAL_LOADER` defined at **218** |
| `DESIGN.md:141` (fallback stack) | **139** |
| `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:498-513` | **514-521** |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts:133` | **134** |

---

## Global Constraints

- **TDD per task** (invariant 1). Every task: failing test → minimal implementation → passing test → commit. No implementation before the test that exercises it.
- **Commit per task** (invariant 6), conventional commits. Scopes used here: `assets`, `styles`, `e2e`, `test`, `docs`, `infra`.
- **Worktree only** (invariant 11). All work happens in `/Users/ericweiss/FX-worktrees/harness-font-fidelity`. Never edit `/Users/ericweiss/FX-Webpage-Template`.
- **Invariant 8 applies.** The diff touches `app/layout.tsx`, `app/global-error.tsx`, `app/globals.css` and `DESIGN.md`, so `/impeccable critique` AND `/impeccable audit` both run before close-out, with P0/P1 fixed or deferred via `DEFERRED.md`. Closeout marker line required: `impeccable-gate: …`.
- **Invariant 12.** `BL-HARNESS-FONT-FIDELITY` is already marked `**Status:** IN PROGRESS · **Branch:** feat/harness-font-fidelity` (commit `21aa715ed`). It is cleared **in Task 16, the PR's last content commit, pre-merge** — in the same edit that archives the entry, because `tests/docs/_metaLedgerInProgress.test.ts:77-81` rejects an archived entry that is still in flight. Task 18 verifies none remains; it does not do the removal.
- **`lightningcss` is pinned EXACTLY `1.32.0`** — no caret. The `@tailwindcss/node` package (version 4.2.4 in this tree) pins that exact version; a caret installs 1.33.0 as a second copy and silently voids the guard's "same parser that compiles the file" argument.
- **The font binary is never regenerated in this branch.** Its bytes move directories; they do not change. `pyftsubset` output varies by host, so a regeneration would be an unreviewable diff (`assets/fonts/PROVENANCE.md`).
- **Pre-push gates, all of them:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:lint`. Then real CI green before merge.
- **No em-dashes in user-visible copy**; apostrophes are literal `'`; 44px tap targets; canonical type/token classes. (Pre-code mechanical UI gate — nothing in this plan renders new copy, but the preload `<link>` and `DESIGN.md` edits are in scope.)

## Meta-test inventory (mandatory declaration)

**Creates:**
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- `tests/styles/fontLoading.test.ts` — the Lightning CSS static guard (21 rows, adapted to one face).
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- `tests/e2e/_metaFontFidelityWiring.test.ts` — filesystem-walked: every `compileEntryCss` caller imports `test` from the shared fixture. Fails by default for a new caller.
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- `tests/assets/_metaLightningCssSingleVersion.test.ts` — exactly one `lightningcss` version resolves in the tree.

**Extends / retargets:**
- `tests/assets/singleFontLoader.test.ts` — contract moves from "one `next/font` loader in `app/fonts.ts`" to "no `next/font` import anywhere in the repo-wide source census, and exactly one `@font-face` declaration site".
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- `tests/styles/fontFeatureAvailability.test.ts` — derives the binary path from `app/fonts.css` instead of the `app/fonts.ts` AST.
- `tests/observe/globalError.test.tsx` — asserts the stylesheet import instead of the generated variable class.

**N/A:** Supabase call boundaries, advisory-lock topology, `admin_alerts` catalog, sentinel hiding, email normalization — this milestone touches no DB object, no auth path, no admin alert and no tile. Invariant 2 and invariant 10 are both N/A: no mutation surface and no `pg_advisory*` call is added or altered.

## Settled by execution — port these, do not re-derive

Living code in `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/`:

- `static-guard.mjs` — 21 rows, `mutants.mjs` 42 mutants, Lightning CSS, runs in Node, so the shipped guard belongs in the merge-blocking unit suite. **Port, do not redesign.** Rows keyed on seven subsets collapse to one face; every other row transfers unchanged.
- `harness-guard.mjs` + `harness-mutants.mjs` — 10 rows, 11 mutants over the emitted block.
- `dep-mutants.mjs` — 4 mutants over imported dependency stylesheets.
- `fixture-prototype.ts` — the oracle runs from the **close path plus an in-page `pagehide` listener**, and needs BOTH. A `load`-event-only version was built and demonstrably loses `agendaScheduleLayout`'s two documents. Do not "simplify" it back; the broken version looks correct.
- `consistency.mjs` — run before every review dispatch.
- Oracle arithmetic verified exact (0.0000px delta) against a real browser; the 0.008px figure is the full harness path, a different measurement.
- Census: 56 geometry-reading e2e specs partition exactly 28 harness-backed / 28 dev-server-backed, zero overlap. The predicate is `compileEntryCss`, re-runnable.

Run the spikes with:

```bash
LCSS=$PWD/node_modules/.pnpm/lightningcss@1.32.0/node_modules/lightningcss/node/index.js \
  node docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/mutants.mjs
```

## This plan pins rules, not element-population totals

The spec pins several counts of "how many X exist in the tree", and re-deriving them on this branch found most have drifted. That is not a defect in the spec's reasoning — each was evidence for a rule, and the rule is unaffected — but a plan that repeats a stale total hands a reviewer a finding that changes nothing.

| Spec claim | Re-derived 2026-08-04 |
| --- | --- |
| "16 `<details>` sites across 14 files" | **35 occurrences across 18 files** |
| "16 native controls across 11 files" | **80 occurrences across 30 files** |
| "nine runtime placeholders" | **5 files carry `placeholder=`** |
| "`app/globals.css` contains exactly one `font-family` declaration" | **two**, at `app/globals.css:707` and `app/globals.css:720`, both reading `var(--font-sans)` |

The spec already reached this conclusion for the mono family: *"the spec does not pin a total, because a pinned total is a claim that must be re-derived every time the tree moves and was wrong in two consecutive rounds. What it pins is the RULE."* This plan applies that to every population. Where a count appears it is labelled **measured 2026-08-04** with the command beside it, and the guarantee is always the rule the count illustrates.

Counts that ARE load-bearing here and that verified exactly, so they stay pinned: **88** wait sites across **25** callers (every per-file count matches), **32** census routes (19 page.tsx + 13 page.mdx + 0 page.ts), **15** non-page rendering states (4 + 9 + 1 + 1), **9** `font-mono` utilities, **31** `compileEntryCss` callers, and all seven driven-set surface citations.

## Mutation-operator families (the closure set this review converges against)

Per `docs/agents/writing-plans.md` and the round-economy contract, these are the enumerated families. A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard.

| # | Family | Instrument |
| --- | --- | --- |
| M1 | Descriptor deletion (drop one of the six) | static guard |
| M2 | Descriptor duplication (last-wins divergence) | static guard |
| M3 | Descriptor substitution (`font-style` → `size-adjust: 200%`) | static guard |
| M4 | Value corruption (`font-weight: 100 900` → `400`; `font-style: normal` → `italic`) | static guard |
| M5 | Source-list corruption (`local()`, `tech()`, unsupported `format()`, extra comma-separated source) | static guard |
| M6 | URL corruption (path traversal, subdirectory, wrong basename) | static + harness guard |
| M7 | Byte corruption / wrong file copied | static + harness guard |
| M8 | Spelling and case escapes (`SRC:`, `s\72 c:`, `@FONT-FACE`, `@font-f\61 ce`) | static guard (parser-level, closed by construction) |
| M9 | Fallback-face corruption (second fallback, repointed `local()`, wrong override values, added `unicode-range`) | static guard |
| M10 | Token corruption (`--font-inter` redeclared, truncated, extended) | static guard |
| M11 | Conditional-at-rule override (`@media`/`@supports`/`@container` re-pointing `font-family`, the `font` shorthand, or any `--font-*` token, at any nesting depth) | static guard |
| M12 | Second delivery mechanism (`next/font` reintroduced; `@font-face` in a second file or a source-authored `<style>`) | static guard |
| M13 | Cross-block divergence (harness block differs from app block on a descriptor that must match) | harness guard |
| M14 | Cross-block collusion (rogue descriptor added to BOTH blocks) | harness guard (inventory row) |
| M15 | `font-display` collapse (`block` → `swap` in the harness) | harness guard |
| M16 | Dependency-stylesheet registration (an imported package stylesheet declares `Inter`) | `dep-mutants.mjs` port |
| M17 | Runtime face registration (`new FontFace` + `document.fonts.add`, CSSOM `insertRule`/`replaceSync`) | runtime oracle (face-set row + byte-derived probe) |
| M18 | Descendant/route-local family override (`.help-prose { font-family: Arial }`) | runtime oracle (per-element child probe) |
| M19 | Pseudo-element override (::placeholder, ::marker, ::before, ::after) | runtime oracle (computed family on the pseudo) |
| M20 | Cross-family misclassification (mono ↔ sans in either direction) | mono manifest + freshness assertion |
| M21 | Wait removal / mis-anchoring (removed, once-per-file, or anchored to navigation) | static wait-coverage row |

---

## File structure

**Create:**

| Path | Responsibility |
| --- | --- |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `app/fonts.css` | The one `@font-face`, the `Inter Fallback` face, and `--font-inter`. Imported by both Next roots. |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `public/fonts/InterVariable-latin.woff2` | The served binary (moved from `assets/fonts/`, bytes unchanged). |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `public/fonts/OFL.txt` | SIL Open Font License 1.1 (moved from `assets/fonts/LICENSE.txt`). |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `public/fonts/PROVENANCE.md` | Moved, with its paths corrected. |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `tests/styles/fontLoading.test.ts` | Lightning CSS static guard. |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `tests/styles/fontLoadingMutants.test.ts` | The mutation matrix over that guard. |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `tests/assets/_metaLightningCssSingleVersion.test.ts` | Exactly one `lightningcss` in the tree. |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `tests/e2e/harness-font-face.spec.ts` | Playwright: the emitted face renders the committed bytes. |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `tests/e2e/helpers/fontFidelityFixture.ts` | The shared fixture distributing the oracle to all 31 callers. |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `tests/e2e/helpers/fontOracle.ts` | Byte-derived expectation + probe derivation + the three-way element dispatch, importable by both the fixture and the census. |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `tests/e2e/helpers/monoSurfaces.ts` | The frozen mono manifest. |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `tests/e2e/_metaFontFidelityWiring.test.ts` | Fixture-wiring meta-test. |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
| `tests/e2e/font-rendering-census.spec.ts` | The route-census oracle. |

**Delete:** `app/fonts.ts`, `assets/fonts/` (contents moved).

**Modify:** `app/layout.tsx`, `app/global-error.tsx`, `app/globals.css` (comment only), `tests/e2e/helpers/liveEntryToolchain.ts`, `tests/setup.ts`, `tests/assets/singleFontLoader.test.ts`, `tests/styles/fontFeatureAvailability.test.ts`, `tests/observe/globalError.test.tsx`, `tests/e2e/standalone.config.ts`, `tests/e2e/standalone-baseline.json`, `playwright.config.ts`, `.github/workflows/crew-e2e.yml`, `scripts/check-crew-e2e-executed.mjs`, `tests/ci/_metaE2eWorkflowCoverage.test.ts`, `scripts/subset-inter.sh`, `DESIGN.md`, `BACKLOG.md`, the 31 harness specs, the spec document.

---

## Task 1: Reconcile the spec with the local-font pivot

The spec is canonical (invariant 7). Shipping a mechanism it does not describe, without amending it, leaves the tree documenting a design nobody built. This task lands the ratified deviation **before** any code, so every later reviewer reads one story.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-harness-font-fidelity-design.md`

- [ ] **Step 1: Add a ratified-amendment block to §1.1**

Insert as the first row of the §1.1 table, so it is read before any superseded claim:

```markdown
| **AMENDED 2026-08-04 (user-ratified) — the app already self-hosts, so this spec ships ONE face over the existing binary, not seven Google subsets.** `ca8efc694` and `6c2615e9c` moved the app to `next/font/local` over `assets/fonts/InterVariable-latin.woff2`, an upstream Inter v4.1 subset, AFTER this spec's premises were written. Google's build has `ss04`, `zero`, `cv*` and `opsz` stripped, so §3.3's seven v20 subsets would revert `BL-INTER-NUMERAL-DISAMBIGUATION` and fail `tests/styles/fontFeatureAvailability.test.ts`. §3.3, §3.4, the §1 "unpinned input" paragraph and every per-subset sweep are superseded by the plan's "Ratified deviation" section; the harness half, the wait invariant, the fixture, the oracle formulation and the §4.0 SCOPE DECISION are untouched. | `docs/superpowers/plans/2026-08-04-harness-font-fidelity.md`, "Ratified deviation from the spec". |
```

- [ ] **Step 2: Mark the superseded sections in place**

At the head of §3.3 and §3.4, and at the §1 paragraph beginning "The app side has its own unpinned input", add one line each:

```markdown
> **SUPERSEDED 2026-08-04** — see the amendment at the head of §1.1. Retained as the record of what was reviewed, not as an instruction.
```

- [ ] **Step 3: Correct the four stale citations**

`tests/assets/singleFontLoader.test.ts:440`→`tests/assets/singleFontLoader.test.ts:417`, `tests/assets/singleFontLoader.test.ts:456`→`tests/assets/singleFontLoader.test.ts:440`; `DESIGN.md:141`→`DESIGN.md:139`; `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:498-513`→`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:514-521`; `tests/ci/_metaE2eWorkflowCoverage.test.ts:133`→`tests/ci/_metaE2eWorkflowCoverage.test.ts:134`. Also strike §4.2's "`fontkit` does not resolve in this repo today" — it is declared at `package.json:126`.

- [ ] **Step 4: Verify the spec still lints**

Run: `pnpm spec:lint`
Expected: PASS. `spec:lint` checks that every `file:line` citation resolves; a stale citation left behind fails here.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-03-harness-font-fidelity-design.md
git commit -m "docs(spec): amend harness-font-fidelity for the local-font pivot"
```

---

## Task 2: Pin `lightningcss` exactly, and guard the pin

**Files:**
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Create: `tests/assets/_metaLightningCssSingleVersion.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Produces: a top-level `lightningcss` import resolvable from test code — every later guard task depends on it.

- [ ] **Step 1: Write the failing test**

```ts
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

/**
 * The static font guard's claim to authority is that it parses with the SAME
 * front end that compiles the file: `@tailwindcss/node` pins `lightningcss` at
 * an exact version, and a caret dependency here would install a second copy
 * that compiles nothing in this repo. The argument would be gone and nothing
 * would report it, so this test IS the argument's enforcement.
 */
describe("lightningcss is a single, exactly-pinned instance", () => {
  test("package.json pins it without a range operator", async () => {
    const pkg = (await import("../../package.json")).default as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies.lightningcss).toBe("1.32.0");
  });

  test("exactly one version resolves in the tree", () => {
    // pnpm emits {"lightningcss": {"version": "1.32.0", …}} as a nested OBJECT,
    // never a "name@version" string key. A regex for `"lightningcss@1.32.0"`
    // matches nothing, so the set comes back empty and the test stays red after
    // a correct install: a guard that cannot go green is not a guard. Walk the
    // parsed JSON instead.
    const out = execFileSync("pnpm", ["ls", "lightningcss", "--depth", "Infinity", "--json"], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    const versions = new Set<string>();
    const visit = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const child of node) visit(child);
        return;
      }
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (
          key === "lightningcss" &&
          value &&
          typeof value === "object" &&
          typeof (value as { version?: unknown }).version === "string"
        ) {
          versions.add((value as { version: string }).version);
        }
        visit(value);
      }
    };
    visit(JSON.parse(out));
    expect([...versions]).toEqual(["1.32.0"]);
  });
});
```

**Verify the shape before trusting the walk.** Run `pnpm ls lightningcss --depth Infinity --json | head -30` and confirm the payload is an array of project objects whose `devDependencies` / `dependencies` maps hold a `lightningcss` object with a `version` field. If a pnpm upgrade changes that shape, this walk is what has to move — which is why the assertion is on the collected set and not on a string match.

**Concrete failure mode this catches:** the next Tailwind bump moves its own pin, this explicit pin does not follow, and the tree quietly grows a second `lightningcss` — after which the guard parses with a build that compiles nothing here, while staying green.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/assets/_metaLightningCssSingleVersion.test.ts`

Expected: the **pin assertion FAILS** (`expected undefined to be "1.32.0"` — it is not declared today) while the **single-version assertion already PASSES**. Probed: the walk returns `["1.32.0"]` right now, because `lightningcss` is already in the tree transitively at exactly that version via `@tailwindcss/node`.

**That half-red state is correct, not a broken test.** The single-version row's job is to fail the day a SECOND copy appears — which is precisely what `pnpm add -D lightningcss` without `-E` would do, resolving 1.33.0 alongside. Do not "strengthen" it into something red today; that would make it assert a falsehood.

- [ ] **Step 3: Add the exact pin**

```bash
pnpm add -D -E lightningcss@1.32.0
```

`-E` is load-bearing: it writes `"1.32.0"`, not `"^1.32.0"`. Confirm with `grep lightningcss package.json`.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run tests/assets/_metaLightningCssSingleVersion.test.ts`
Expected: PASS, both cases.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tests/assets/_metaLightningCssSingleVersion.test.ts
git commit -m "infra: pin lightningcss at exactly 1.32.0 with a single-version guard"
```

---

## Task 3: Measure the faces `next/font/local` emits today

**This task runs BEFORE the bytes move, and the order is load-bearing.** `app/fonts.ts:65` resolves
the vendored path under assets/fonts/; moving that file first makes `pnpm build` fail, and a
failed build leaves whatever `.next` was already there — so the extraction reads a stale artifact and
the figures get pinned from the wrong mechanism entirely. Measure first, move second.

`next/font/local` generates the metric-matched `Inter Fallback` face from *this* binary's own metrics. Hand-writing it means reproducing exactly what ships, so PR #676's reflow fix survives the mechanism swap unchanged. Read the figures; do not compute a second answer.

**Files:**

- Modify: this plan's "§11. Measured faces" section (below). The record lands **inside this file**, not as a sibling — a new file in the plans tree would form its own invariant-8 unit and demand its own close-out marker.

- [ ] **Step 1: Build from a clean slate**

```bash
rm -rf .next
pnpm build 2>&1 | tail -5
find .next/static/media -name '*.woff2' | wc -l
```

**Assert the count is `1` before reading anything out of the build.** A count of `7` means the
artifact predates the local-font pivot — the main checkout carries exactly such a build, with
per-subset `unicode-range` values matching the spec's superseded §3.3 table. Pinning the fallback
overrides from it would pin the google-era figures and every guard row built on them would be green
against the wrong target. If the build fails, stop: nothing downstream is measurable.

- [ ] **Step 2: Extract both emitted faces**

```bash
rg -o --no-filename '@font-face\{[^}]*\}' .next/static/chunks/*.css | sed 's/;/;\n  /g'
```

Note the path: Next writes route CSS under `static/chunks/`, not `static/css/`, in this version.

- [ ] **Step 3: Record every descriptor verbatim**

Fill §11 below with two fenced blocks: the Inter face exactly as emitted, and the `Inter Fallback` face exactly as emitted. State explicitly whether the Inter face carries a `unicode-range` — **it determines Task 5's descriptor inventory**, and guessing it is how a guard ends up pinning a descriptor the app never had. Under one file there is likely none, but that is a measurement, not a prediction.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-harness-font-fidelity.md
git commit -m "docs(plan): record the next/font-emitted faces before the mechanism swap"
```

---

## Task 4: Move the font bytes under `public/`, hash-pinned

A hand-written `@font-face` needs a URL the browser can fetch, and `assets/` is bundler input, not a served directory. The bytes move; they do not change.

**Files:**

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->

- Create: `public/fonts/InterVariable-latin.woff2`, `public/fonts/OFL.txt`, `public/fonts/PROVENANCE.md`
- Delete: `assets/fonts/InterVariable-latin.woff2`, `assets/fonts/LICENSE.txt`, `assets/fonts/PROVENANCE.md`
- Modify: `scripts/subset-inter.sh`

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->

- Create: `tests/helpers/fontManifest.ts`, `tests/styles/fontAssets.test.ts`

**Interfaces:**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

- Produces: `PUBLIC_FONT_PATH` and `EXPECTED_SHA256`, exported from **`tests/helpers/fontManifest.ts`** — a plain module with **no Vitest import**, consumed by Tasks 5, 8, 9 and 10. This placement is required, not stylistic: `tests/e2e/helpers/liveEntryToolchain.ts` and the Playwright specs import these, and importing a `*.test.ts` from a Playwright process executes Vitest declarations outside a Vitest suite and dies with `Vitest failed to find the current suite`. The repo's established shape for a pure core split out of a test file is `tests/docs/_invariant8Closeout.ts` beside `tests/docs/_invariant8Closeout.walker.test.ts`.

- [ ] **Step 1: Capture the current digest**

```bash
shasum -a 256 assets/fonts/InterVariable-latin.woff2
```

Record the digest. `assets/fonts/PROVENANCE.md` states `fada467be8d8ebb5dccc346d29dc6ea37423da14c87dafed009631cb85632a54`; use whatever the command actually prints, and if it differs, stop and investigate rather than pinning a value you did not measure.

- [ ] **Step 2: Write the shared manifest module**

```ts
// tests/helpers/fontManifest.ts
// Pure constants shared by the Vitest guards, the harness toolchain and the
// Playwright specs. NO test-framework import may ever enter this file: the
// Playwright processes import it, and a Vitest declaration evaluated outside a
// Vitest suite throws "Vitest failed to find the current suite".

/** The one binary the app and every harness render, relative to the repo root. */
export const PUBLIC_FONT_PATH = "public/fonts/InterVariable-latin.woff2";

/** The URL app/fonts.css requests; the harness rewrites it to a bare sibling. */
export const PUBLIC_FONT_URL = "/fonts/InterVariable-latin.woff2";

/** Digest measured on the committed bytes; see public/fonts/PROVENANCE.md. */
export const EXPECTED_SHA256 = "<digest from Step 1>";
```

- [ ] **Step 3: Write the failing test**

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { EXPECTED_SHA256, PUBLIC_FONT_PATH } from "../helpers/fontManifest";

const REPO_ROOT = resolve(__dirname, "..", "..");

describe("the committed font binary", () => {
  test("is present under public/ and matches its pinned digest", () => {
    const bytes = readFileSync(resolve(REPO_ROOT, PUBLIC_FONT_PATH));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(EXPECTED_SHA256);
  });

  test("ships its licence, matched on distinctive OFL text", () => {
    const licence = readFileSync(resolve(REPO_ROOT, "public/fonts/OFL.txt"), "utf8");
    expect(licence).toContain("SIL OPEN FONT LICENSE");
    expect(licence).toContain("PERMISSION AND CONDITIONS");
  });

  test("no font binary is left behind under assets/", () => {
    expect(() =>
      readFileSync(resolve(REPO_ROOT, "assets/fonts/InterVariable-latin.woff2")),
    ).toThrow();
  });
});
```

**Concrete failure mode this catches:** a rename, a `.gitignore` rule, or an unreviewed byte swap; and a licence file replaced by a placeholder — round 11 probed the weaker predicate and found `"x"` passes a non-empty check.

- [ ] **Step 4: Run it and watch it fail**

Run: `pnpm vitest run tests/styles/fontAssets.test.ts`
Expected: FAIL — `ENOENT … public/fonts/InterVariable-latin.woff2`.

- [ ] **Step 5: Move the bytes**

```bash
mkdir -p public/fonts
git mv assets/fonts/InterVariable-latin.woff2 public/fonts/InterVariable-latin.woff2
git mv assets/fonts/LICENSE.txt public/fonts/OFL.txt
git mv assets/fonts/PROVENANCE.md public/fonts/PROVENANCE.md
```

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->

Then update every path inside `public/fonts/PROVENANCE.md` (`assets/fonts/` → `public/fonts/`, `LICENSE.txt` → `OFL.txt`), repoint `scripts/subset-inter.sh`'s output path at `public/fonts/InterVariable-latin.woff2`, and repoint `app/fonts.ts`'s `src` at `../public/fonts/InterVariable-latin.woff2` so the tree still builds between here and Task 6. Task 6 deletes that module; until it does, leaving it pointing at a moved file is a broken build for three tasks.

- [ ] **Step 6: Run it, and confirm the app still builds**

Run: `pnpm vitest run tests/styles/fontAssets.test.ts && pnpm build 2>&1 | tail -3`
Expected: PASS on all three cases, and a clean build. The build is the check that Step 5's `app/fonts.ts` repoint actually landed.

- [ ] **Step 7: Confirm nothing still points at the old path**

```bash
rg -n 'assets/fonts' --glob '!pnpm-lock.yaml'
```

Expected at this point: hits in `tests/styles/fontFeatureAvailability.test.ts`, `DESIGN.md`, the specs — each retired or corrected by a later task — **and one CI path filter that must be repaired in THIS task**:

`.github/workflows/screenshots-drift.yml:29` path-gates the application screenshot oracle on `assets/fonts/**`. After the move, a binary-only change under `public/fonts/**` would no longer trigger that PR gate, and the drift would surface at the nightly cron instead of on the PR. Repoint the filter to `public/fonts/**` in this task's commit.

**This exact class already happened once**, and the workflow's own comment records it: *"It lived under `app/**` until 2026-08-03, when the page-candidate tripwire moved it out and silently took it off this filter with it (whole-diff review R4)."* A font move that forgets the filter is the same incident a second time.

Any hit beyond those is a surface this plan missed; fix it here.

- [ ] **Step 8: Commit**

```bash
git add -A public/fonts assets scripts/subset-inter.sh app/fonts.ts tests/helpers/fontManifest.ts \
        tests/styles/fontAssets.test.ts .github/workflows/screenshots-drift.yml
git commit -m "feat(assets): serve the committed Inter binary from public/fonts"
```

---

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

## Task 5: `app/fonts.css` behind the Lightning CSS static guard

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

The guard is written first and must go red against a tree with no `app/fonts.css`.

**Files:**

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->

- Create: `app/fonts.css`, `tests/helpers/fontCss.ts`, `tests/styles/fontLoading.test.ts`
- Reference: `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/static-guard.mjs`

**Interfaces:**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

- Consumes: `PUBLIC_FONT_PATH`, `PUBLIC_FONT_URL`, `EXPECTED_SHA256` from `tests/helpers/fontManifest.ts` (Task 4); the measured figures (Task 3).
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

- Produces, from **`tests/helpers/fontCss.ts`** — a plain module with **no Vitest import**, for the same reason `fontManifest.ts` is one: `tests/e2e/helpers/liveEntryToolchain.ts` imports these and runs inside Playwright processes.
  - `parseFontFaces(css: string, opts?: { errorRecovery?: boolean }): ParsedFace[]` — Lightning CSS parse, last-wins, with a `duplicated` list per face. **The option is required, not cosmetic:** Task 5 parses authored CSS strictly (default `false`, so a syntax error in a file this plan writes throws), while Task 8 parses emitted output that contains compiled Tailwind and MUST pass `true` — probed, `{errorRecovery:false} -> threw "Unexpected token in attribute selector: Colon"`, `{errorRecovery:true} -> parsed, 1 face`. A single strict signature makes the harness guard unimplementable with its own produced interface.
  - `EXPECTED_DESCRIPTORS: readonly string[]` and `EXPECTED_FALLBACK_DESCRIPTORS: readonly string[]`
  - `MEASURED_OVERRIDES: Record<string, number>`
  - `srcOf`, `weightOf`, `styleOf`, `displayOf`, `overridesOf`, `tokenDeclarations`, `familyOf` — the accessors, ported from the spike rather than reimplemented
  - `firstVarFallbackFamily(css, token)` — the first literal family inside a `var(<token>, …)` fallback list, used by the literal-binding row. New here, because the spike never needed it: it only ever parsed the fonts stylesheet, never the consuming declaration in `app/globals.css`
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

  - **`assertFontsCss(css: string, opts?: { shipped?: Array<{ label: string; css: string }> }): void`** — runs every row and throws on the first violation. Two inputs, because the rows need two: `css` is the fonts stylesheet, and `opts.shipped` is the **rest of the shipped stylesheet list** that rows 19, 20 and 21 iterate (`app/globals.css` plus the derived dependency sheets). Without that second channel the M16 dependency mutants cannot be driven at all — `dep-mutants.mjs` supplies exactly this via its `EXTRA_CSS` env var, and a single-string signature silently drops four of the plan's own mutation families. Defaults to reading the real derived list when omitted. `tests/styles/fontLoading.test.ts` holds the per-row `test()` bodies; every predicate lives here so Task 7 can call it.

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

  `tests/styles/fontLoading.test.ts` holds only the `test()` bodies that assert over them.

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

**Which artifact each row reads, because getting this wrong makes a correct tree fail.** Every row parses the **authored** source: `app/fonts.css`, `app/globals.css`, and the derived dependency-stylesheet list. **Never** `.next/static/**`. `app/globals.css:1` is `@import "tailwindcss"`, so the compiled artifact carries Tailwind's own theme tokens — including its default `--font-sans` — and the round-32 row 20 ("each `--font-*` token is defined exactly once, tree-wide") would count two definitions and fail against a perfectly correct tree. Parsing the source leaves the import unresolved, which is what keeps the row honest. Task 3's build-output read is the single deliberate exception, and it is a one-time measurement rather than a guard input.

- [ ] **Step 1: Write the failing guard**

Port `static-guard.mjs` row-for-row. Every row below is a separate `test()` so a failure names itself. The seven-subset rows collapse to one face; the rest transfer unchanged.

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transform } from "lightningcss";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const FONTS_CSS = resolve(REPO_ROOT, "app", "fonts.css");

/**
 * Parsed with Lightning CSS, the parser `@tailwindcss/cli` and
 * `@tailwindcss/postcss` already use to compile this tree, NOT with regular
 * expressions. Round 18 broke a regex parser with `SRC:` and round 19 with
 * `s\72 c:`; a regex over a formal grammar is that defect by construction. A
 * real parser handles every escape, case variant and last-wins duplicate by
 * definition, and Lightning CSS runs in Node, which keeps this guard in the
 * merge-blocking unit suite.
 */
function parseFontFaces(css: string) {
  const faces: Array<{ family: string; descriptors: Map<string, unknown> }> = [];
  transform({
    filename: "fonts.css",
    code: Buffer.from(css),
    visitor: {
      Rule: {
        "font-face"(rule) {
          const descriptors = new Map<string, unknown>();
          const duplicated: string[] = [];
          for (const property of rule.value.properties) {
            // `FontFaceProperty` exposes `type` and `value`; there is NO
            // `property` field. Reading `property.property` is both a compile
            // error and `undefined` at runtime, which collapses every
            // descriptor onto one key and leaves the face empty. The spike
            // derives the name from `type`, mapping the two special cases:
            //   { type: "source", ... }                    -> "src"
            //   { type: "custom", value: { name, ... } }     -> value.name
            //   { type: "font-family" | "font-style" | ... }  -> type
            const name =
              property.type === "custom"
                ? (property.value as { name: string }).name
                : property.type === "source"
                  ? "src"
                  : property.type;
            // CSS applies the LAST declaration; a guard that reads the first
            // checks behaviour the browser never exhibits (round 14).
            if (descriptors.has(name)) duplicated.push(name);
            descriptors.set(name, property.value);
          }
          descriptors.set("__duplicated", duplicated);
          faces.push({ family: String(descriptors.get("font-family") ?? ""), descriptors });
          return undefined;
        },
      },
    },
  });
  return faces;
}

describe("app/fonts.css", () => {
  const css = readFileSync(FONTS_CSS, "utf8");
  const faces = parseFontFaces(css);
  const inter = faces.filter((f) => f.family === "Inter");
  const fallback = faces.filter((f) => f.family === "Inter Fallback");

  test("declares exactly one Inter face", () => {
    expect(inter).toHaveLength(1);
  });

  test("declares exactly one Inter Fallback face", () => {
    // Round 19's mutant: a second, ordinary `Inter Fallback` at font-weight 700
    // sourcing local("Times New Roman"). During the swap frame every bold
    // element selects the exact-weight Times face, so Arial's overrides scale
    // the wrong glyphs and G4 fails with every runtime check green.
    expect(fallback).toHaveLength(1);
  });

  test("no face declares any descriptor twice", () => {
    for (const face of faces) expect(face.descriptors.get("__duplicated")).toEqual([]);
  });

  test("the Inter face's descriptor inventory is exactly the expected set", () => {
    const names = [...inter[0]!.descriptors.keys()].filter((k) => !k.startsWith("__")).sort();
    expect(names).toEqual(EXPECTED_DESCRIPTORS);
  });

  test("font-weight is the parsed pair 100 900, not a collapsed single value", () => {
    // Round 22 escaped an inventory-only guard by collapsing this to 400: 56
    // `font-bold` sites across 29 files would then render a SYNTHETIC bold off
    // a face that no longer advertises the axis, with every row green.
    expect(weightOf(inter[0]!)).toEqual([100, 900]);
  });

  test("font-style is normal", () => {
    expect(styleOf(inter[0]!)).toBe("normal");
  });

  test("font-display is swap in the app", () => {
    expect(displayOf(inter[0]!)).toBe("swap");
  });

  test("src is exactly one url() with format woff2, no local(), no tech(), no second source", () => {
    // Round 13 broke a prefix rule three ways: format("definitely-unsupported"),
    // tech(...) with an unsupported value, and url(A) format(unsupported),
    // url(B) format("woff2"). Per CSS Fonts Level 4 an unsupported format/tech
    // EXCLUDES that source, so a later source silently wins.
    const sources = srcOf(inter[0]!);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.type).toBe("url");
    expect(sources[0]!.format).toBe("woff2");
    expect(sources[0]!.tech).toEqual([]);
  });

  test("the src URL resolves to the committed file, with no path traversal", () => {
    // Resolved, not string-inspected: round 12's escape kept a correct basename
    // and a correct hash while pointing one directory deeper.
    const url = srcOf(inter[0]!)[0]!.url;
    expect(url).toBe("/fonts/InterVariable-latin.woff2");
    const bytes = readFileSync(resolve(REPO_ROOT, "public", "fonts", "InterVariable-latin.woff2"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(EXPECTED_SHA256);
  });

  test("the fallback's src equals local(\"Arial\") exactly and its overrides equal the measured figures", () => {
    // Round 17 broke a substring formulation twice: local("Times New Roman"),
    // local("Arial") matches /local\("Arial"\)/ while source order makes Times
    // render; and wrong values pass includes() when the RIGHT values survive in
    // a comment. Values are parsed and compared; comments are stripped first.
    expect(srcOf(fallback[0]!)).toEqual([{ type: "local", value: "Arial" }]);
    expect(overridesOf(fallback[0]!)).toEqual(MEASURED_OVERRIDES);
  });

  test("the fallback's descriptor inventory is exhaustive", () => {
    // Round 18: adding a valid `unicode-range: U+0370-03FF` excludes the
    // fallback from Latin text entirely, so the swap frame reverts to the
    // unadjusted system stack and #676's reflow fix is undone, silently.
    const names = [...fallback[0]!.descriptors.keys()].filter((k) => !k.startsWith("__")).sort();
    expect(names).toEqual(EXPECTED_FALLBACK_DESCRIPTORS);
  });

  test("--font-inter is declared exactly once, with the parsed value Inter, Inter Fallback", () => {
    // Declared-once and parsed-equality, not a regex: a regex is satisfied by a
    // correct declaration ANYWHERE, so redeclaring the token later (CSS takes
    // the last) passed, as did appending a trailing family.
    expect(tokenDeclarations(css, "--font-inter")).toEqual([`"Inter", "Inter Fallback"`]);
  });

  test("app/globals.css's var() fallback literal names the family this stylesheet declares", () => {
    // THE RENAME ESCAPE, and it is live. The app resolves the face through the
    // TOKEN -- app/fonts.css defines --font-inter in :root. Every harness
    // resolves it through the inline LITERAL, because compileEntryCss emits no
    // token definition at all: probed, 0 definitions of --font-inter in the
    // compiled output, and all 31 callers read app/globals.css into their
    // entry, so it is uniform.
    //
    // Rename the family to "InterVariable" on BOTH sides and cross-block
    // equality, descriptor inventory, hashes, URLs and the app's own rendering
    // all stay green -- while every harness resolves var(--font-inter, "Inter",
    // ...) to a face that no longer exists and falls through to ui-sans-serif.
    // That is the ambient host font this whole branch exists to eliminate.
    //
    // So the literal is load-bearing, not vestigial: a cleanup that
    // "simplifies" it to var(--font-inter) breaks all 31 harnesses and nothing
    // else, which is why this row pins the two together.
    const globals = readFileSync(resolve(REPO_ROOT, "app/globals.css"), "utf8");
    expect(firstVarFallbackFamily(globals, "--font-sans")).toBe(familyOf(inter[0]!));
  });
});
```

`EXPECTED_DESCRIPTORS`, `EXPECTED_FALLBACK_DESCRIPTORS` and `MEASURED_OVERRIDES` are filled from Task 3's §11 record. `weightOf`, `styleOf`, `displayOf`, `srcOf`, `overridesOf` and `tokenDeclarations` are small helpers over the parsed Lightning CSS values, ported from `static-guard.mjs` — copy them rather than reimplementing.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/styles/fontLoading.test.ts`
Expected: FAIL — `ENOENT … app/fonts.css`.

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

- [ ] **Step 3: Write `app/fonts.css`**

```css
/* The app's one type family. Hand-written rather than generated by next/font
   because the standalone harnesses have no Next runtime: they compile
   app/globals.css with the Tailwind CLI and serve it beside their own markup,
   so a face that exists only inside a Next build never reaches them, and they
   measured the ambient host font (BL-HARNESS-FONT-FIDELITY). One committed
   binary, one declaration, read by both the app and compileEntryCss.

   The bytes are the upstream Inter v4.1 subset, NOT Google's build: Google
   strips the character variants and stylistic sets DESIGN.md 2.4 depends on.
   public/fonts/PROVENANCE.md records the version and checksums. */
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/InterVariable-latin.woff2") format("woff2");
}

/* The metric-matched companion, reproducing verbatim what next/font/local
   generated from THIS binary before the mechanism swap (the measured figures are in
   §11 of the plan). It is what keeps the `display: swap`
   window from reflowing ~10% -- measured 187.28px -> 168.91px on a real
   string. Repointing `local()` elsewhere would leave the overrides scaling
   glyphs they no longer describe, which is worse than having no fallback. */
@font-face {
  font-family: "Inter Fallback";
  src: local("Arial");
  ascent-override: <measured>%;
  descent-override: <measured>%;
  line-gap-override: <measured>%;
  size-adjust: <measured>%;
}

:root {
  /* BOTH families, because --font-sans consumes this token rather than naming
     a family literally. Dropping the companion here makes the metric-matched
     face unreachable through the token while every other guard row passes. */
  --font-inter: "Inter", "Inter Fallback";
}
```

Fill `<measured>` from Task 3's §11 record. If Task 3 recorded a `unicode-range` on the emitted Inter face, declare it here too and add it to `EXPECTED_DESCRIPTORS`; if not, do not invent one.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run tests/styles/fontLoading.test.ts`
Expected: PASS, every row.

- [ ] **Step 5: Commit**

```bash
git add app/fonts.css tests/helpers/fontCss.ts tests/styles/fontLoading.test.ts
git commit -m "feat(styles): declare the committed Inter face in app/fonts.css"
```

---

## Task 6: Retire `next/font`

**Ten surfaces encode the retired mechanism, not five.** Three are executable guards whose retargeted assertions must fail against the current tree before the swap lands — that is what proves the new assertion has teeth. The rest are prose that would otherwise leave the tree documenting a module this branch deletes, and the sweep in Step 5 is what proves none was missed. The census below was derived, not recalled:

```bash
rg -l 'next/font' --glob '!node_modules' --glob '!pnpm-lock.yaml'
rg -ln 'from "\./fonts"|inter\.variable|NEXT_FONT_TEST_VARIABLE_CLASS' --glob '!node_modules'
```

**Files:**

- Delete: `app/fonts.ts`
- Modify (executable): `tests/assets/singleFontLoader.test.ts:218`, `tests/assets/singleFontLoader.test.ts:417`, `tests/assets/singleFontLoader.test.ts:440`, `tests/observe/globalError.test.tsx:61`, `tests/styles/fontFeatureAvailability.test.ts:76`, `tests/setup.ts:138`, `tests/setup.ts:146`
- Modify (roots): `app/layout.tsx:2`, `app/layout.tsx:58`, `app/global-error.tsx:7`, `app/global-error.tsx:31`
- Modify (prose that names the retired mechanism): `app/globals.css:104`, `app/globals.css:111-112`, `app/show/[slug]/layout.tsx:18`, `tests/e2e/font-binding.spec.ts:5`, `tests/e2e/font-binding.spec.ts:54`, `tests/e2e/font-binding.spec.ts:69`, `tests/e2e/font-binding.spec.ts:100`, `tests/e2e/font-binding.spec.ts:207`, `.github/workflows/crew-e2e.yml:11`
- Modify (registry): `tests/docs/_retiredIdentifiers.ts`

- [ ] **Step 1: Retarget the three existing guards, and watch each fail**

`tests/assets/singleFontLoader.test.ts` — replace `CANONICAL_LOADER = "app/fonts.ts"` and its two assertions (lines 417, 440) with: no file in the repo-wide source census imports `next/font`, and exactly one file declares `@font-face`. **Keep the census walk exactly as it is** (`SOURCE_EXTENSIONS` and `TEXT_SCANNED_EXTENSIONS`, lines 163-164) — scoping it to `app/` is the already-refuted narrower reading a `components/`-hosted loader walks straight through.

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

**Two censuses, not one, because they scan different file sets.** The `next/font`-import census keeps its existing extension list (`SOURCE_EXTENSIONS` = `.ts .tsx .mts .cts .js .jsx .mjs .cjs`, plus text-scanned `.mdx`) — that is the right set for import statements. But `@font-face` now lives in **`app/fonts.css`**, and `.css` is in neither list, so the "exactly one declaration site" assertion cannot see its own intended target. It gets a **second census over `.css` plus the source extensions** (a `@font-face` can be authored inside a template literal in a `.tsx`, which is mutant seven and the reason the source extensions stay in scope).

**The exclusions are by path, named in the test, and there are THREE — not one.** Every one is a file whose job is to contain the thing the census forbids:

- `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/` — the tracked spike corpus, which the spec already excludes for this reason
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

- `tests/styles/fontLoadingMutants.test.ts` — Task 7 ports the M12 mutants into it, and they contain complete `@font-face` and `@FONT-FACE` strings. Omitting this exclusion makes the census report extra declaration sites on the intended tree, which is the same collision one directory over
- `tests/assets/singleFontLoader.test.ts` itself — its corpus carries literal `next/font` imports to prove they are detected

Exclusion is **by path, never by pattern**: a rule keyed on "looks like test data" would grow until it covered a real regression. A new exclusion is a deliberate, reviewable edit.

`tests/observe/globalError.test.tsx:61` — replace the `NEXT_FONT_TEST_VARIABLE_CLASS` assertion with one that the crash screen module imports ./fonts.css. The intent, that `--font-inter` resolves on the second root, is unchanged.

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

`tests/styles/fontFeatureAvailability.test.ts:76` — derive the binary path from `app/fonts.css`'s `src` URL instead of the `app/fonts.ts` AST. **Keep the indirection**: naming `public/fonts/…` directly would keep passing after someone repointed the stylesheet, which is exactly what that file exists to close.

**This one does NOT go red, and saying it would is false.** Task 4 moves the same bytes (`fada467…a54`) and Task 5 already writes CSS pointing at them, so the feature contract — every OpenType tag `app/globals.css` declares is present in the binary the resolver finds — holds before and after. Only the resolver changes. Its red-green proof is therefore a **mutation**, not a state: point the stylesheet's `src` at a fabricated path and confirm the test fails, then restore. Assert that, not a phantom failure.

Run each retargeted file: `pnpm vitest run tests/assets/singleFontLoader.test.ts tests/observe/globalError.test.tsx tests/styles/fontFeatureAvailability.test.ts`
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

Expected: FAIL — `app/fonts.ts` still exists and still imports `next/font/local`; the crash screen still carries the variable class; `app/fonts.css` is not yet what the feature test reads.

- [ ] **Step 2: Swap both roots**

`app/layout.tsx`: replace `import { inter } from "./fonts";` with `import "./fonts.css";`, drop the `${inter.variable} ` fragment from the `<html>` className (line 58), and add the preload link inside the JSX:

```tsx
<link
  rel="preload"
  as="font"
  type="font/woff2"
  href="/fonts/InterVariable-latin.woff2"
  crossOrigin="anonymous"
/>
```

`crossOrigin` is the JSX spelling; raw `crossorigin` fails `pnpm typecheck` against React's `LinkHTMLAttributes`. React 19 hoists it — `app/layout.tsx` renders `<html>` with no explicit `<head>`.

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

**The preload needs its own failing assertion first, and neither the spike nor Task 5 has one.** The spec makes it a static row (the fourth escaping mutant: omitting the preload passes every other row, and `font-binding.spec.ts` cannot see it because it awaits `document.fonts.ready` and therefore cannot observe discovery latency). Add the row to `tests/styles/fontLoading.test.ts` in this task, watch it fail against a layout with no `<link rel="preload">`, then add the tag:

```ts
test("app/layout.tsx preloads the latin subset", () => {
  const layout = readFileSync(resolve(REPO_ROOT, "app/layout.tsx"), "utf8");
  expect(layout).toMatch(/rel="preload"/);
  expect(layout).toMatch(/as="font"/);
  expect(layout).toMatch(/type="font\/woff2"/);
  expect(layout).toMatch(/crossOrigin=/);
  expect(layout).toContain(PUBLIC_FONT_URL);
});
```

`app/global-error.tsx`: same import swap, drop `className={inter.variable}` from its own `<html>` (line 31), and correct the comment at lines 7-13, which names `app/fonts.ts` and the loader.

- [ ] **Step 3: Delete the module and its mocks**

```bash
git rm app/fonts.ts
```

Remove both `vi.mock("next/font/local", …)` (line 138) and `vi.mock("next/font/google", …)` (line 146) from `tests/setup.ts`, with the explanatory comment block above them. With no `next/font` import anywhere, nothing needs the mock, and leaving it is dead infrastructure that quietly permits a reintroduction.

- [ ] **Step 4: Run the three guards and the build**

Run: `pnpm vitest run tests/assets/singleFontLoader.test.ts tests/observe/globalError.test.tsx tests/styles/fontFeatureAvailability.test.ts tests/styles/fontLoading.test.ts && pnpm typecheck && pnpm build`
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

Expected: PASS, and a clean build. A build failure here is the RSC-boundary class — check that `app/fonts.css` is imported, not `require`d.

- [ ] **Step 5: Correct every surface that DESCRIBES the retired mechanism**

None of these is executable, and every one of them would leave the tree asserting in prose that a deleted module ships. Spec §3.0 requires the first two by name; the rest the class sweep found.

| Surface | What it says today |
| --- | --- |
| `app/globals.css:104` and `app/globals.css:111` | the token "is defined by next/font's generated class (`app/fonts.ts`)", and names the generated companion |
| `app/show/[slug]/layout.tsx:18` | "The loader now lives at `app/fonts.ts`, shared by both" |
| `tests/e2e/font-binding.spec.ts:5` and eleven more (54, 69, 100, 207, 217, 226, 271, 273, 289, 302, 307) | "loaded via `next/font/local` from `app/fonts.ts`", plus eleven further references to the loader and to "next/font's generated metric-matched companion". An earlier draft listed five and the sweep found twelve — correct all twelve, since a partial pass leaves the file self-contradicting |
| `.github/workflows/crew-e2e.yml:11` | describes the font-binding oracle in terms of the loader |

**`font-binding.spec.ts`'s ASSERTIONS do not change** — they read the family from the token and are agnostic to delivery (spec §4.2). Its comments and failure messages do.

- [ ] **Step 6: Reconcile the retired-identifier registry**

`tests/docs/retiredIdentifierReferences.test.ts` walks `git ls-files` for references to what was retired, keyed by LINE CONTENT with per-row reasoned exemptions (`tests/docs/_retiredIdentifiers.ts`). Retiring `app/fonts.ts` and `inter.variable` means either registering them with exemptions for the legitimate history — `BACKLOG-archive.md`, the two prior font specs, the reconciliation log — or a stated decision not to register them. Decide explicitly; leaving it unconsidered is how this guard goes red on a later branch for reasons nobody remembers.

- [ ] **Step 7: Confirm the app still renders Inter, and that no reference survives**

```bash
pnpm exec playwright test --project=desktop-chromium tests/e2e/font-binding.spec.ts
pnpm vitest run tests/docs/retiredIdentifierReferences.test.ts
rg -n 'next/font|app/fonts\.ts|inter\.variable' --glob '!node_modules' --glob '!pnpm-lock.yaml' --glob '!docs/**' --glob '!BACKLOG*.md'
```

The browser case PASSES (agnostic to delivery — green before and after is the contract, spec §5) and the registry guard passes.

**The sweep does NOT return zero, and demanding that it does is wrong.** Four hits are legitimate and must survive; anything else is a surface this task missed. Review the list against this table rather than chasing an empty result:

| Surviving hit | Why it stays |
| --- | --- |
| `tests/assets/singleFontLoader.test.ts` (`tests/assets/singleFontLoader.test.ts:461`, `tests/assets/singleFontLoader.test.ts:540`, and the rest of its corpus) | the mutation corpus that PROVES `next/font` imports are detected — deleting it would discard the guard's own evidence |
| `tests/docs/_retiredIdentifiers.ts:173` | the registry must NAME what was retired to register its historical exemptions. Note `--glob '!docs/**'` does not exclude `tests/docs/**` |
| `tests/e2e/section-header-layout.layout.spec.ts:167` | still says "no `@font-face`, no next/font", and is corrected in Task 12 with the pin retarget it justifies, not here |
| `docs/**` and `BACKLOG*.md` | history, already excluded above |
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

| `app/fonts.css` | **only if its comment still names the retired mechanism** — see below |

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

`app/fonts.css`'s header comment as drafted in Task 5 explains why the face is hand-written by contrasting it with `next/font`. That is genuinely useful context, but it puts the retired name in the one file the census is protecting. Resolve it deliberately rather than by accident: **reword the comment to describe the mechanism positively** ("the standalone harnesses have no Next runtime, so a build-time-generated face never reaches them") without naming the retired module. The rationale survives, the sweep stays clean, and no exclusion is needed.

A fifth hit is the finding. This is the same evidence-versus-guard collision the spec solved for the tracked spike directory, and it resolves the same way: name the exceptions, do not widen the pattern.

- [ ] **Step 8: Commit**

```bash
git add -A app tests/setup.ts tests/assets/singleFontLoader.test.ts tests/observe/globalError.test.tsx tests/styles/fontFeatureAvailability.test.ts tests/e2e/font-binding.spec.ts tests/docs/_retiredIdentifiers.ts .github/workflows/crew-e2e.yml
git commit -m "refactor(assets): retire next/font in favour of the committed stylesheet"
```

---

## Task 7: The static guard's mutation matrix

**Files:**
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Create: `tests/styles/fontLoadingMutants.test.ts`
- Reference: `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/mutants.mjs`, `dep-mutants.mjs`

- [ ] **Step 1: Port the mutation corpus**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

Each mutant is a string transform over the real `app/fonts.css`, fed to the same parsing helpers Task 5 exported, asserting **at least one row rejects it**. Families M1-M12 and M16 from the table above. Drop only the mutants that are meaningless with one face (permuting URLs among subsets; copying one subset's bytes under seven names) and say so in a comment naming the family, so a reviewer sees a decision rather than an omission.

```ts
test.each(MUTANTS)("mutant $name is killed", ({ css, name }) => {
  expect(() => assertFontsCss(css)).toThrow();
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/styles/fontLoadingMutants.test.ts`
Expected: PASS — every mutant killed. **A mutant that survives is a guard defect, not a corpus defect**: fix the guard, never weaken the mutant.

- [ ] **Step 3: Port the environment-override rows (M11) — all FOUR of them**

The spike carries rows 18 through 21, and porting only row 18 reintroduces the hole round 32 closed. Port all four, and keep them in this order of authority:

- **Row 18 (round 29)** — no `font-family`, `font` shorthand, or `--font-*` token set inside any conditional at-rule (`@media`, `@supports`, `@container`) at any nesting depth, across every shipped stylesheet. The cheap, direct catch.
- **Rows 20 and 21 (round 32) — the actual closure.** Round 32 showed rows keyed on conditional AT-RULES never see the app's real theme mechanism, which is an **attribute selector**: `[data-theme="dark"] { --font-sans: Arial }` escaped everything, as did a :root:not([data-theme="light"]) selector and a media-conditioned @import. A denylist of contexts cannot enumerate CSS, so the rule inverts, exactly as the descriptor-inventory rule did in round 10:
  - **row 20** — each `--font-*` token is DEFINED exactly once, tree-wide;
  - **row 21** — every `font-family` / `font` declaration outside `@font-face` resolves through a `var()` to one of those tokens.

  A theme-scoped redefinition fails row 20; a literal family fails row 21; and both hold under any selector, at-rule, nesting depth, or importing stylesheet. **Do not "simplify" back to row 18 alone** — it is the version that was already defeated.
- **Row 19** — no `@font-face` outside the fonts stylesheet, in any shipped stylesheet.

Verify rows 20 and 21 pass against the real `app/globals.css` today (they do: `--font-sans` is defined once at line 119, and both `font-family` declarations, at 707 and 720, read `var(--font-sans)`), and fail on an injected dark-mode token override.

- [ ] **Step 4: Derive the shipped-stylesheet list, and run `dep-mutants` against it (M16)**

Rows 19, 20 and 21 all iterate a list of shipped stylesheets, and round 30 found two imported dependency stylesheets (react-pdf) sitting outside it — so a dependency update could ship a conditional override past a row whose prose claimed exhaustiveness. **Derive that list from the source tree's CSS imports** rather than hard-coding it, so a newly imported stylesheet joins by derivation instead of by memory.

Port `dep-mutants.mjs`'s four mutants against the derivation: D1 a dependency declaring an impostor `Inter` face, D2 a dependency redefining a font token under dark mode, D3 the same under a theme attribute, D4 a literal family with `!important`. All four must be killed.

- [ ] **Step 5: Run the whole styles suite**

Run: `pnpm vitest run tests/styles`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/styles/fontLoadingMutants.test.ts tests/styles/fontLoading.test.ts
git commit -m "test(styles): pin the static font guard with its mutation matrix"
```

---

## Task 8: `compileEntryCss` emits the face and copies the binary

**Files:**
- Modify: `tests/e2e/helpers/liveEntryToolchain.ts:124-141`
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Create: `tests/e2e/helpers/liveEntryToolchain.fonts.test.ts`
- Reference: `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/harness-guard.mjs`

**Interfaces:**
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

- Consumes: `parseFontFaces`, `EXPECTED_DESCRIPTORS`, `MEASURED_OVERRIDES` from **`tests/helpers/fontCss.ts`** (Task 5), and `PUBLIC_FONT_PATH` / `EXPECTED_SHA256` from `tests/helpers/fontManifest.ts` (Task 4). Both are Vitest-free modules, because `liveEntryToolchain.ts` runs inside Playwright processes.
- Produces: the emitted-CSS contract every one of the 31 harnesses inherits.

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

**The two guards parse different things, and only one of them may be strict.** Task 5 parses authored `app/fonts.css` — a file this plan writes — so it parses strictly and a syntax error there is a real defect. This task parses `compileEntryCss`'s **output**, which is ~174 KB of compiled Tailwind with an invalid attribute selector in it (see the parse row below), so it MUST pass `errorRecovery: true`. Copying Task 5's strict call here throws on every harness.

**Which harness rows collapse under one face, and why that is not a weakening.** `harness-guard.mjs` ships H1-H9. H6 ("emitted faces map 1:1 onto the app faces by subset") and H7 ("each emitted face's range equals ITS OWN subset's app range") are round 23's repair of an existential-vs-map defect — over a **one-element domain** a bijection is not a claim, so both collapse, and the mutants they killed (filenames permuted among subsets, latin's bytes copied under all seven names) are void for the same reason. That is a consequence of the ratified one-face decision, not a coverage loss, and it is stated here so nobody reads the shorter row list as the old bug returning. H2, H3, H4, H5, H5b, H8 and H9 all survive at full strength.

- [ ] **Step 1: Write BOTH failing guards — the Vitest rows and the browser case**

The browser guard's anti-tautology proof has to happen **here**, before the post-step exists, because it cannot be staged later: Task 9 commits `liveEntryToolchain.ts`, and `git stash push <file>` stashes only *uncommitted* changes, so a stash-based red phase reports "no local changes", leaves the fixed toolchain in place, and the required red never occurs. Both files are therefore written now, against a tree that emits no face at all.

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

Port `harness-guard.mjs`'s rows into `liveEntryToolchain.fonts.test.ts`. It compiles a minimal entry through the real `compileEntryCss` into a temp directory and asserts on the output:

```ts
test("the emitted block matches the app face on every descriptor except font-display and src", () => {
  // Two descriptors differ BY CONSTRUCTION and the rest match. Round 11 caught
  // "everything except font-display" rejecting the measured target state,
  // because the emitted CSS rewrites url("/fonts/ to url(" to make the file a
  // SIBLING of the stylesheet. On src the comparison is filename-normalised:
  // the basename must match, the path prefix must not.
});

test("the emitted src is a bare filename with no path segment", () => {
  // Round 12's escape: emit url("./fonts/InterVariable-latin.woff2") while
  // correctly copying the file beside the stylesheet. Basename pairs, bytes
  // hash, descriptors match, the English probe passes -- and the browser
  // requests a subdirectory that does not exist.
});

test("the copied .woff2 hash-matches the public/fonts original", () => { /* … */ });

test("the emitted face declares font-display: block, not swap", () => {
  // Deliberate divergence: a reader must never stare at invisible text, so the
  // app swaps; a measurement harness must never measure the WRONG face, so it
  // blocks. Collapsing the two onto one value is wrong in whichever place it
  // lands.
});

test("the emitted descriptor inventory is exactly the expected set", () => {
  // Cross-block EQUALITY alone is satisfied by a rogue descriptor present in
  // BOTH blocks -- `size-adjust: 200%` scales real glyph outlines and kept
  // counts, pairings, URLs, hashes, display values, token and preload green.
});

test("exactly one Inter Fallback face is emitted, matching the app's", () => {
  // M13. Every other row here filters or compares `Inter`, so DELETING the
  // emitted fallback block passes all of them -- probed: emittedFallbackFaces=0
  // with 10/10 rows still green. The harness would then lack the
  // metric-matched swap-frame face while the emitted-block contract read as
  // satisfied. Assert its presence, its count, and its descriptor equality
  // against the app's fallback, exempting nothing.
});

test("the emitted stylesheet parses at all, and yields exactly one Inter face", () => {
  // Parsing the emitted output requires `errorRecovery: true`, and that is NOT
  // optional: the compiled Tailwind this block is appended to contains
  //   .data-\[a\:b\]\:text-accent { &[data-a:b] { … } }
  // generated from a literal string Tailwind's scanner picks out of
  // tests/styles/_metaRawAccentText.test.ts:41. `[data-a:b]` is an invalid
  // attribute selector, and lightningcss@1.32.0 THROWS on it rather than
  // skipping the rule:
  //   SyntaxError: Unexpected token in attribute selector: Colon (out.css:4681)
  // Verified: with errorRecovery the same input parses and finds the face.
  //
  // So this row exists to keep a recovered parse honest -- a future Tailwind
  // upgrade that breaks parsing must fail here, not silently recover into
  // zero faces and pass every "no bad face" row vacuously.
});
```

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

Write `tests/e2e/harness-font-face.spec.ts` in the same step, **and register it in `tests/e2e/standalone.config.ts:85-86` before running it.** Registration is part of the red phase, not a later chore: Playwright collects files by the project's `testMatch` FIRST and applies a CLI filename filter only to what that already matched (`projectUtils.js` `collectFilesForProject`, then `loadUtils.js`'s `loadFileFilters`). An unregistered spec therefore collects **zero tests** and reports success — so running it by path would prove nothing at all, and committing it unregistered would leave `_metaSpecRegistration` red at the end of this task.

It builds a minimal entry through `compileEntryCss`, serves the output directory the way callers do, renders a fixed string, and asserts **both**: the emitted block matches the app's on the load-bearing descriptors, and the rendered advance width matches the expectation computed from the committed bytes with fontkit, within 0.5px.

Assert the font **request** succeeded too — a 200 for the `.woff2` and the face reaching `status === "loaded"` — not only that the rendering matches. All 33 harness static servers derive `content-type` from the extension with a single ternary and none has a `.woff2` branch, so the copied file is served as `text/html`. That works (CSS Fonts does not require a font MIME type, Chromium selects on the `format("woff2")` hint and the bytes, and the mechanism spike measured real Inter with zero failed requests through exactly this shape) — but it works by tolerance rather than contract, and a silent fallback under a stricter future server would recreate the ambient-font bug this branch exists to close with every static row green. **Do not add a `.woff2` branch to the 33 servers**; that is 33 files of churn for a case this assertion detects.

A loaded-face check alone is **not** sufficient — round 2's fifth mutant declares `font-family: "Inter"` while sourcing `local("Arial")`, and `some(f => f.family === "Inter" && f.status === "loaded")` returns true, because `FontFace.family` is whatever the author wrote and identifies nothing about the source. `document.fonts.check()` is deliberately not used: it returns true for a system-installed family.

- [ ] **Step 2: Run both and watch both fail — this is the anti-tautology record**

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts harness-font-face --list
pnpm vitest run tests/e2e/helpers/liveEntryToolchain.fonts.test.ts
pnpm exec playwright test --config tests/e2e/standalone.config.ts harness-font-face
```

Expected: `--list` reports **at least one collected test** — run it first, because a zero-collection run exits 0 and a "passing" empty run is indistinguishable from a guard that works. Then the Vitest rows FAIL (`compileEntryCss` emits no `@font-face` at all today) and the Playwright case FAILS for the same reason. Paste both failures into the PR body. **The browser case has no other opportunity to be red** — after Step 3 the toolchain is fixed and committed, and no later task can unwind it.

- [ ] **Step 3: Implement the post-step**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

After the `execFileSync` returns, append the face block to `outFile` and copy the binary into `dirname(outFile)`. Emit `font-display: block` and a bare sibling `src`. Derive the block from `app/fonts.css` by parsing it with the Task 5 helpers — **do not** hand-duplicate the descriptors, or the two blocks drift the first time one is edited.

Keep `compileEntryCss` narrow in the sense its own comment defines (`tests/e2e/helpers/liveEntryToolchain.ts:110-122`): it still does not own how callers build their entry CSS. The face is appended to the compiled **output**, which is why one edit reaches all 31 callers regardless of how each assembled its input.

- [ ] **Step 4: Run both and watch both pass**

```bash
pnpm vitest run tests/e2e/helpers/liveEntryToolchain.fonts.test.ts
pnpm exec playwright test --config tests/e2e/standalone.config.ts harness-font-face
```

Expected: PASS on every row and on the browser case.

- [ ] **Step 5: Port the harness mutation matrix**

Families M6, M7, M13, M14, M15 from `harness-mutants.mjs`, plus the impostor face sourcing `local("Arial")` and a byte-corrupted copy. Run and confirm every one is killed. Record which mutants were dropped as void under one face, per the collapse note above.

- [ ] **Step 6: Commit**

Regenerate `tests/e2e/standalone-baseline.json` before committing — `tests/ci/_metaSpecRegistration.test.ts` pins standalone membership by observation, and the new spec changes it. **Add nothing to CI**: `.github/workflows/standalone-e2e.yml` runs the whole standalone config unfiltered, and naming a spec there would narrow execution and break both the coverage detector and the baseline comparator.

```bash
pnpm vitest run tests/ci/_metaSpecRegistration.test.ts
git add tests/e2e/helpers/liveEntryToolchain.ts tests/e2e/helpers/liveEntryToolchain.fonts.test.ts \
        tests/e2e/harness-font-face.spec.ts tests/e2e/standalone.config.ts tests/e2e/standalone-baseline.json
git commit -m "feat(e2e): emit the committed Inter face from compileEntryCss"
```

The task ends with every gate green — no task commits a red tree.

---

## Task 9: The byte-derived oracle module and the mono manifest

**The mono manifest is created HERE, not with the census.** Task 10's fixture runs the full oracle on its awaiting vantages, and the full oracle includes the mono partition — so the manifest must exist before the fixture imports it. Creating it three tasks later left Task 10 either unable to compile or shipping a reduced oracle nothing later re-widened.

**Files:**

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->

- Create: `tests/e2e/helpers/fontOracle.ts`, `tests/e2e/helpers/fontOracle.test.ts`, `tests/e2e/helpers/monoSurfaces.ts`

**Interfaces:**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

- Produces: `expectedWidth(text: string, fontSize: number): number`, `deriveProbeText(): string`, `PROBE_STYLE: string`, `walkTextBearing(page: Page): Promise<Finding[]>`, `assertRegisteredFaceSet(page: Page): Promise<void>`, and the two small accessors the tests below use — `glyphFor(cp: number)` (a thin wrapper over fontkit's `glyphForCodePoint`, which is the real API name; there is no `glyphFor` on a fontkit font) and `advanceOf(cp: number): number`, and `MONO_SURFACES` plus `assertMonoPartition(page, route)` from `monoSurfaces.ts` — the complete set Task 10's fixture and Task 13's census both consume. Nothing in the "full oracle" may be named in a later task than this one.

- [ ] **Step 1: Write the failing unit test**

```ts
test("the expectation is computed from the committed bytes, not from a pinned literal", () => {
  // layout(text).advanceWidth / unitsPerEm * fontSize, verified against a real
  // browser at delta 0.0000px on latin, greek and cyrillic. Environment-
  // independent by construction: the expectation derives from the same bytes
  // the browser renders, so there is no literal to rot across platforms,
  // Chromium builds or CI images.
  // 130.0938px, measured against this binary -- and exactly the figure the
  // spec recorded against the Google build, so the formula survives the byte swap.
  expect(expectedWidth("Hamburgefonstiv", 16)).toBeCloseTo(130.0938, 4);
});

test("probe text rejects BOTH unmapped and zero-advance codepoints", () => {
  // TWO filters, and a probe against the committed binary proves neither alone
  // is enough. `.notdef` has a real advance width and silently poisons the
  // expectation; combining marks measure 0.0000px under every font, so a probe
  // of them passes under Inter, under Arial, and under a face that never loaded.
  //
  // Measured on assets/fonts/InterVariable-latin.woff2:
  //   U+0301 combining acute   id=0    advance=1344   <- unmapped, NON-zero
  //   U+0041 A                 id=2    advance=1413
  //   U+0021 !                 id=764  advance=589
  //
  // U+0301 is the live case: an advance-only filter ACCEPTS it at 1344 while it
  // renders as a missing-glyph box. The spec's cyrillic argument assumed it
  // measured 0 -- true of the Google build, false of this one.
  for (const cp of [...deriveProbeText()].map((c) => c.codePointAt(0)!)) {
    expect(glyphFor(cp).id, `U+${cp.toString(16)} is .notdef`).not.toBe(0);
    expect(advanceOf(cp), `U+${cp.toString(16)} has zero advance`).toBeGreaterThan(0);
  }
});

test("the derived probe's expected width exceeds a nonzero floor", () => {
  expect(expectedWidth(deriveProbeText(), 16)).toBeGreaterThan(1);
});
```

**Both already verified against the committed binary**, so this task is a port rather than a discovery. `unitsPerEm` is 2048 with axes `opsz,wght` (**two**, not the one the spec's parenthetical claims — harmless, since the probe is forced to weight 400 and never instances the font). `layout("Hamburgefonstiv").advanceWidth / 2048 * 16` yields **130.0938px**, which is *exactly* the spec's measured latin figure — reproduced against the upstream v4.1 subset rather than the Google build the spec measured, which is the best evidence available that the ratified deviation leaves this task untouched. Applying both filters, the derived probe is `"!\"#$%&'("` at **68.02px**, comfortably above any floor.

```ts
```

**Concrete failure mode:** a probe that measures zero passes vacuously against any font, including no font — the single most dangerous shape a width oracle can take.

- [ ] **Step 2: Implement**

`expectedWidth` via `fontkit.openSync(PUBLIC_FONT_PATH).layout(text).advanceWidth / unitsPerEm * fontSize`. Never instance the variable font — `getVariation` throws on this WOFF2 at every weight, which is why the probe is forced to weight 400 and bold elements are covered by the non-bold probe inside them.

`PROBE_STYLE` neutralises everything that changes the glyph run:

```
text-transform: none; font-variant: normal; font-feature-settings: normal;
font-stretch: normal; letter-spacing: normal; word-spacing: normal;
font-weight: 400; position: absolute; visibility: hidden;
```

Measuring the walked element **directly** instead fails on ordinary page styling: with uppercase + bold + `.12em` tracking + `tnum`, an element measures 276.531px against a 194.133px expectation — fontkit lays out the *source* string, the browser renders a *transformed* one. A synthetic probe elsewhere in the document fails the opposite way: it does not inherit the element's cascade, so a descendant override never reaches it. The probe is a **child of the element under test** because that is the only shape with both properties.

`walkTextBearing` implements the three-way dispatch: **can host a child** → byte-derived child probe; **renders text but cannot host a child** (`button, input, select, optgroup, textarea, option, ::file-selector-button`) → computed family on the element; **pseudo-elements** → computed family on the pseudo. Classes two and three are family-level, not byte-level — a documented limit, not an oversight. The walk descends into **open** shadow roots; a closed one is unreachable by construction and is a stated limit.

- [ ] **Step 3: Run it and watch it pass**

Run: `pnpm vitest run tests/e2e/helpers/fontOracle.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the mono manifest and its freshness assertion**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

`monoSurfaces.ts` exports an ordered list of `{ route, selector, scope }`, `scope` being `"element"` or `"subtree"`. **Entries key on identity that survives a typography change** — a `data-testid` where one exists, otherwise a role-plus-accessible-name pair. Keying on `.font-mono` or on `code`/`pre` tag names would mean deleting the class also changes the expected set, which is round 26's exact defect. `components/admin/ShowsTableHeading.tsx` is the element that escape used: delete `font-mono` there and the heading inherits Inter, is classified sans, and passes.

Elements matching no entry are expected-Inter, so **the default is the assertion** and a new surface is covered without anyone adding a row.

The freshness assertion runs both ways: every entry must match at least one element on its route, and every element rendering mono must match an entry. That is what keeps an off-by-one loud instead of persisting as a silently over-broad exemption, and it forces a deliberate typography change to edit the manifest in the same diff.

**Derive the seed with a TypeScript JSX AST walk, not a line grep.** A line-based count is wrong in both directions here, measured: `<pre` matches the word `<prefix>` in prose, and a documentation placeholder `<code>` in `components/admin/HelpAffordance.tsx` is not a rendered surface. AST-derived on this branch:

| | count |
| --- | --- |
| `font-mono` utilities | **9 occurrences across 6 files** — `app/admin/dev/page.tsx` (on an entire `<main>`, so `scope: "subtree"`), `PerShowActionableWarnings.tsx`, `VenueMapTile.tsx`, `SwitcherControls.tsx`, `MaterializeCard.tsx`, `ShowsTableHeading.tsx` |
| semantic `code`/`kbd`/`samp`/`pre` elements | **26 across 6 files** — `app/help/errors/page.tsx` 5, `app/admin/dev/page.tsx` 17, `app/admin/dev/attention-gallery/page.tsx` 1, `Step1Share.tsx` 1, `ContextDetail.tsx` 1, `ShareHub.tsx` 1 |

Plus the `<code>` elements MDX compiles to across the 13 help pages. Re-derive before relying on these; the AST walk is the instrument, the numbers are its output on 2026-08-04.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/fontOracle.ts tests/e2e/helpers/fontOracle.test.ts tests/e2e/helpers/monoSurfaces.ts
git commit -m "feat(e2e): add the byte-derived font-rendering oracle and mono manifest"
```

---

## Task 10: The shared fixture, its wiring meta-test, and all 31 callers

**One task, not two, because the meta-test and the wiring are one red-green cycle.** Splitting them would commit a meta-test that fails all 31 callers and leave the tree red until a later task — a violation of invariant 1's per-task cycle, and a commit nobody can bisect through.

**Files:**

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->

- Create: `tests/e2e/helpers/fontFidelityFixture.ts`, `tests/e2e/_metaFontFidelityWiring.test.ts`
- Modify: the 31 harness specs listed below
- Reference: `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/fixture-prototype.ts`

- [ ] **Step 1: Write the failing meta-test**

```ts
test("every compileEntryCss caller binds `test` from the shared fixture", () => {
  // Filesystem-walked, so a NEW harness spec that imports @playwright/test
  // directly fails by default rather than silently opting out of the oracle --
  // the same property that makes the mutation-surface meta-test work.
  //
  // The predicate is the BINDING, not the module reference. A file that writes
  //   import { test } from "@playwright/test";
  //   import { expect } from "./helpers/fontFidelityFixture";
  // references the fixture and still runs every case on the base `test`, so the
  // oracle never attaches -- a live escaping mutant against a
  // /from "…fontFidelityFixture"/ match, which returns true for exactly that
  // file. Assert instead that NO import binds `test` from @playwright/test, and
  // that SOME import binds `test` from the fixture.
  for (const file of specsCallingCompileEntryCss()) {
    const source = readFileSync(file, "utf8");
    const bindsTestFrom = (module: string) =>
      new RegExp(
        String.raw`import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*["'][^"']*${module}["']`,
      ).test(source);
    expect(bindsTestFrom("@playwright/test"), `${file} still binds test from base`).toBe(false);
    expect(bindsTestFrom("fontFidelityFixture"), `${file} does not bind test from the fixture`).toBe(
      true,
    );
  }
});
```

**Concrete failure mode this catches:** a new harness spec — or an existing one edited back — that imports the fixture for `expect` only and keeps running its cases on base Playwright, so every document it renders goes unchecked while the meta-test reads green.

Run it: FAIL for all 31.

- [ ] **Step 2: Port the fixture**

Copy `fixture-prototype.ts` and adapt. **Do not redesign it.** The load-bearing properties, each of which a plausible simplification breaks:

- It **wraps page creation**, proxying the `browser` fixture, rather than consuming the `page` fixture. `tests/e2e/agendaScheduleLayout.spec.ts:386-411` requests `{ browser }`, builds two of its own contexts and closes both before teardown; an after-test hook on `page` would inspect a blank default page and report green while two real documents went unchecked.
- It instruments the `newContext` wrapper **only**. Playwright's default `context` fixture is itself built by calling `browser.newContext()`, so instrumenting both double-registers the binding and throws.
- It runs the oracle **whenever a document ends** — proxying `goto`, `setContent`, `reload`, `goBack`, `goForward`, `page.close()` and `context.close()` — not on `load`. A `load`-event version was built and loses both of `agendaScheduleLayout`'s documents: the handler's `evaluate` is async, the caller's `close()` wins the race, and the result is discarded by the same `catch` that tolerates a closing page. Close-only is equally wrong in the other direction: six source bodies expand to nine tests rendering **84 documents on reused pages**, of which close-only inspection saw nine.
- It **also** installs an in-page `pagehide` listener via an init script, because the programmatic wrapper cannot see browser-originated replacement, `window.open` pages, or frames. Neither vantage is complete alone; removing either turns a prototype test red.
- The "has anything rendered yet" gate asks the **document**, not the URL — `setContent()` leaves the URL at `about:blank`, so a URL-based guard skips every document a harness builds.
- The `pagehide` vantage runs the **synchronous** subset only (element walk + computed families). `pagehide` cannot postpone destruction, so it cannot await `document.fonts.ready`. The gap is precise and documented: a document that ends only by browser-originated navigation is checked for family but not for width.

**Which walk each vantage runs, because the prototype's is NOT the shipped oracle.** `fixture-prototype.ts` proves the *distribution mechanism*; its `WALK` collects computed `fontFamily` strings and nothing else. Wiring that walk everywhere and calling it done would ship a family-only check where the spec promises a byte-derived one. The split, per spec lines 391-396:

- **Vantages that can await** — `pre-navigate`, `pre-close` (page and context), and the after-body sweep — run the **full** oracle from Task 10: three-way element dispatch, mono manifest, registered face set, and the byte-derived probe with a `document.fonts.ready` await per inserted probe.
- **The `pagehide` vantage** runs the **synchronous** subset: the element walk and its computed families, including open shadow roots.

Each wrapped context gets `exposeBinding("__fontOracle", …)` plus an `addInitScript` carrying the serialized walk; that binding is how the in-page listener reports back.

**The fixture meets real app pages too, and the mono manifest must tolerate that.** Three callers — `published-review-modal.layout`, `step3-review-modal.agenda`, `step3-review-modal.interactions` — are in the `desktop-chromium` project as well as standalone, so the same spec runs once against its own harness document and once against the running server. Two consequences:

- `assertMonoPartition(page, route)` must treat **a page matching no manifest route** as "every element expected-Inter", which is the default the manifest already defines. A harness document has no route at all (`setContent` leaves the URL at `about:blank`), so a lookup that throws or reports a freshness violation there fails all 31 callers the moment the fixture lands.
- The **freshness assertion does not run in the fixture**. "Every manifest entry matches at least one element on its route" is a claim about real routes; evaluated against a harness page it marks every entry stale. It belongs to the census spec only.

The upside is real and worth keeping: those three give the oracle free coverage of live app pages before the census spec exists.

- [ ] **Step 3: Give the fixture's four tests a registered home, then run them**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

They go in a spec of their own, `tests/e2e/fontFidelityFixture.spec.ts`, registered exactly as Task 8 registered its guard: add `fontFidelityFixture` to the `testMatch` alternation in `tests/e2e/standalone.config.ts`, regenerate `tests/e2e/standalone-baseline.json`, and add nothing to CI (the standalone workflow runs the whole config unfiltered).

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

**They must NOT live inside `fontFidelityFixture.ts`.** That module is imported by all 32 callers, so `test()` calls in its body would register four extra cases in every one of them — 128 duplicated tests, each running against whatever document that caller happened to render.

The four, from `fixture-prototype.ts`: a reused page reporting every document rather than only the last (`docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/fixture-prototype.ts:116`); a browser-originated navigation reporting the outgoing document (`docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/fixture-prototype.ts:130`); a caller-owned context that closes itself (`docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/fixture-prototype.ts:142`); shadow-root and frame text both observed (`docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/fixture-prototype.ts:157`).

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts fontFidelityFixture --list
pnpm exec playwright test --config tests/e2e/standalone.config.ts fontFidelityFixture
```

`--list` must report **four** collected tests before you trust any result: a spec in no config collects zero and exits 0, which is indistinguishable from four passes.

Each must pass, and **removing any one mechanism must turn one of them red** — verify by deleting each in turn and watching the corresponding test fail. A mechanism whose removal changes nothing was never load-bearing.

- [ ] **Step 4: Rewrite the import in each of the 32 callers**

From `import { test, expect } from "@playwright/test";` to `import { test, expect } from "./helpers/fontFidelityFixture";`. The fixture re-exports `expect` and the type names unchanged, so nothing else in any caller moves. There are a handful of distinct import shapes — read each before editing; a blind `sed` across 31 files is how a `type` import gets mangled.

Verified callers (31, from `rg -l compileEntryCss tests/e2e --glob '*.spec.ts'`):

```
agendaScheduleLayout, appHealthIndicator.layout, attention-anchor-placement,
attention-pill-focus, autoAppliedCardGrid.layout, blocked-row-resolver-transitions,
bulk-ignore-eyebrow.layout, collapse-panel-morph, compact-alert-card-layout,
dataQualityBadge.layout, developer-toggle-layout, hoverhelp-geometry,
pendingDiscardReal.layout, pendingDiscardReflow.layout, popover-clip-fit,
published-review-modal.layout, pusher-alignment.layout, resolve-label-layout,
section-header-layout.layout, section-header-visual, share-link-flash,
skeletonBandParity, stackedBandLayout, statusStripToggleLayout,
step3-review-modal.agenda, step3-review-modal.interactions,
step3-review-modal.layout, step3-review-page.layout,
step3-schedule-bookend-layout, toggle-edge-layout, wizard-blocker-modal.layout
```

- [ ] **Step 5: Run the meta-test and the standalone suite**

```bash
pnpm vitest run tests/e2e/_metaFontFidelityWiring.test.ts
pnpm exec playwright test --config tests/e2e/standalone.config.ts
pnpm exec playwright test --config tests/e2e/visual.config.ts
```

Expected: meta-test PASS — red at Step 1, green here, in one task. Both suites will show geometry failures: **that is expected and is Task 12's input**, not a defect. Record them; do not fix them here.

**The second Playwright command is not optional.** `section-header-visual` is a `compileEntryCss` caller the standalone config does NOT resolve — `tests/e2e/visual.config.ts:36` is the only config matching it. Its import rewrite would otherwise go unexercised until the pixel rebaseline, and it is exactly the caller whose `boundingBox()` read precedes its screenshot.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/helpers/fontFidelityFixture.ts tests/e2e/_metaFontFidelityWiring.test.ts tests/e2e/*.spec.ts
git commit -m "feat(e2e): distribute the font oracle through a shared fixture"
```

---

## Task 11: The 88 `document.fonts.ready` waits

**Files:** the 25 callers below.

**The invariant, verbatim from spec §3.2 — read it before editing anything:**

> In each of the 25 callers, every document that is measured is awaited: after the content under measurement is present and before the first geometry read **of that document**.

Per document. **Not** per file: 16 of the 25 create more than one document, and a promise settled against the first says nothing about the second. **Not** per navigation: nine callers (`attention-pill-focus`, `bulk-ignore-eyebrow.layout`, `collapse-panel-morph`, `compact-alert-card-layout`, `hoverhelp-geometry`, `popover-clip-fit`, `step3-review-modal.agenda`, `step3-review-modal.interactions`, `wizard-blocker-modal.layout`) navigate to a bare `<div id="root"></div>` and hydrate afterward, so a wait placed at the `goto` settles against a document with no text in it and guarantees nothing. **Not** per geometry read: 206 waits before 206 reads of one settled document buys nothing.

Navigation sites are how the documents are **counted**, not where the await **goes**. In a loop body it lands once per iteration.

- [ ] **Step 1: Write the failing coverage row — anchored at the NAVIGATION SITE, not the test body**

Two earlier formulations are dead, and both died on the corpus rather than on argument.

**A count is not enough.** In `tests/e2e/attention-pill-focus.spec.ts` the navigation sits at line 104 and the first geometry read at 553-554. Hoisting the await to immediately after `goto` keeps the count at its expected value while settling the promise against a document with no measured content in it — the exact mis-anchoring the row claims to reject.

**But a per-test-body region split cannot work either**, because navigation and geometry routinely live in different functions. AST-probed on this branch — every one of these files has a navigation-only helper:

```
attention-pill-focus            boot
hoverhelp-geometry              open, keyboardOpen
popover-clip-fit                openMenu, openToggleBanner
published-review-modal.layout   openHarness
pusher-alignment.layout         open
section-header-layout.layout    openHairline, sweepCell
section-header-visual           openPage
step3-review-modal.agenda       openAgenda
step3-review-modal.interactions openLive, openLiveWithMotion, openMotion
step3-review-modal.layout       openHarness
wizard-blocker-modal.layout     openLive
```

Associating an await inside `boot()` with a geometry read in the calling test needs an interprocedural call graph. Building one is out of proportion to what this guard protects, and a guard that needs one would either false-fail correct placements or silently skip those documents — both worse than a narrower rule that is exactly true.

**So the anchor is the enclosing FUNCTION of each navigation, not the navigation site.** The distinction matters and the spec is emphatic about it: navigation sites are how documents are COUNTED, never where the await goes (round 6's placement rule, which round 21 caught colliding with a count). What this row checks is a containment-and-order property within one function. For every navigation call in the file — wherever it lives, helper or test body — require a `document.fonts.ready` await that:

1. is in the **same function** as that navigation call, and
2. appears **after** it, and
3. appears after that function's last content-establishing statement, where one exists — the four readiness shapes the corpus uses:

   ```
   page.waitForSelector(...)                              bulk-ignore-eyebrow.layout
   await expect(page.locator(...)).toBeVisible()           collapse-panel-morph, wizard-blocker-modal.layout
   page.getByTestId("harness-ready").waitFor(...)          hoverhelp-geometry
   page.waitForFunction(() => window.__hydrated === true)  attention-pill-focus, popover-clip-fit
   ```

   Only **2** of the 25 use `__hydrated`; the rule is "after this function's own readiness signal", never after one named mechanism.

This is checkable with a single-function AST walk and needs no call graph. It is also **strictly weaker** than the per-document invariant §3.2 states, and the plan says so rather than pretending otherwise: it guarantees every navigation is followed by a wait in its own function, not that every measured document is awaited before its first read. The gap is a documented limit — a helper that navigates and awaits correctly, whose caller then mutates the document further before measuring, satisfies this row. **Nothing else available catches that without a call graph, and the per-document invariant remains the thing implementers are asked to satisfy; this row is the mechanical floor under it.**

**Its own mutants, run in Step 3 (family M21):** (a) delete one await; (b) keep the count but hoist the await above its navigation call; (c) move the await before the function's readiness signal; (d) add one await to a file with two navigation sites and leave the other bare. All four must be rejected. Mutant (b) is what makes this an order rule rather than a counter — if it survives, the row is decorative.

Run it: FAIL for all 25 — every one has zero waits today, confirmed by probe.

- [ ] **Step 2: Add the waits, file by file, against this manifest**

| caller | sites | note |
| --- | ---: | --- |
| `agendaScheduleLayout` | 11 | 9 on the default page, plus the two caller-owned pages at `tests/e2e/agendaScheduleLayout.spec.ts:388` and `tests/e2e/agendaScheduleLayout.spec.ts:402` |
| `appHealthIndicator.layout` | 4 | |
| `attention-pill-focus` | 1 | hydrates after an empty `#root` |
| `autoAppliedCardGrid.layout` | 2 | some in loops |
| `bulk-ignore-eyebrow.layout` | 6 | some in loops; hydrates after an empty `#root` |
| `collapse-panel-morph` | 1 | hydrates after an empty `#root` |
| `compact-alert-card-layout` | 2 | some in loops; hydrates after an empty `#root` |
| `dataQualityBadge.layout` | 2 | some in loops |
| `developer-toggle-layout` | 2 | some in loops |
| `hoverhelp-geometry` | 7 | some in loops; hydrates after an empty `#root` |
| `pendingDiscardReal.layout` | 9 | some in loops |
| `pendingDiscardReflow.layout` | 3 | |
| `popover-clip-fit` | 2 | some in loops; hydrates after an empty `#root` |
| `published-review-modal.layout` | 1 | |
| `pusher-alignment.layout` | 1 | |
| `section-header-layout.layout` | 14 | 7 inside loops over cells and viewports |
| `section-header-visual` | 1 | its `boundingBox()` read precedes `toHaveScreenshot()`, which is why it is here |
| `statusStripToggleLayout` | 8 | some in loops |
| `step3-review-modal.agenda` | 1 | hydrates after an empty `#root` |
| `step3-review-modal.interactions` | 3 | some in loops; hydrates after an empty `#root` |
| `step3-review-modal.layout` | 1 | |
| `step3-review-page.layout` | 5 | some in loops |
| `step3-schedule-bookend-layout` | 1 | |
| `toggle-edge-layout` | 1 | |
| `wizard-blocker-modal.layout` | 1 | hydrates after an empty `#root` |

**Total 90 across 25 callers.** `resolve-label-layout`, `skeletonBandParity` and `stackedBandLayout` already await and need nothing.

- [ ] **Step 3: Run the coverage row**

Run: `pnpm vitest run tests/styles/fontLoading.test.ts -t "wait"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/*.spec.ts tests/styles/fontLoading.test.ts
git commit -m "test(e2e): await document.fonts.ready per measured document"
```

---

## Task 12: Re-derive the pinned geometry figures

**Order matters and is a spec risk item:** figures are re-derived only AFTER the face is emitted (Task 8) and the waits have landed (Task 12). Measuring earlier bakes fallback metrics into pinned numbers.

**Files:** whichever of the 28 font-sensitive harnesses fail; `tests/e2e/section-header-layout.layout.spec.ts:182`, `tests/e2e/section-header-layout.layout.spec.ts:360`, `tests/e2e/section-header-layout.layout.spec.ts:361`.

- [ ] **Step 1: Run the standalone suite and record every failure**

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts --reporter=list
pnpm exec playwright test --config tests/e2e/visual.config.ts    --reporter=list
```

The suite run **is** the census — the set cannot be enumerated statically. **Both configs**, because `section-header-visual` is a `compileEntryCss` caller that only `tests/e2e/visual.config.ts:36` resolves; running standalone alone silently skips one of the 28 font-sensitive callers, and specifically the one whose `boundingBox()` read precedes its screenshot.

- [ ] **Step 2: Update each pinned figure to its measured value**

For each failure, record before/after in a scratch file that becomes the PR body table. A figure that moves by more than a glyph-metric difference is a bug, not a rebaseline — investigate before accepting.

- [ ] **Step 3: Retarget the Arial pin**

`tests/e2e/section-header-layout.layout.spec.ts:182` pins `Arial, "Liberation Sans"` because the ambient stack differed across OSes. Once the harness renders a repo-controlled face that is identical everywhere, that reason is gone: retarget the pin at Inter and re-derive `HEADER_LINE_PX` (line 360, currently 44) and `HEADER_WITH_PILL_PX` (line 361, currently 72.8).

**This is not a tolerance widening.** The assertion and its floor stay; only the font it measures under changes, from a stand-in to the one that ships. `BL-HARNESS-FONT-FIDELITY` explicitly refuses widening it as a resolution.

- [ ] **Step 4: Re-run to green**

Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts`
Expected: PASS except `section-header-visual`'s pixel comparisons, which Task 15 rebaselines.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): re-derive harness geometry against the committed face"
```

---

## Task 13: The route-census oracle

**Files:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Create: `tests/e2e/font-rendering-census.spec.ts`, `tests/e2e/helpers/monoSurfaces.ts`
- Modify: `playwright.config.ts:65`, `playwright.config.ts:79`, `.github/workflows/crew-e2e.yml:159`, `scripts/check-crew-e2e-executed.mjs:38`, `tests/ci/_metaE2eWorkflowCoverage.test.ts:134`

**Scope is the ratified sample, not a completeness pursuit (spec §4.0 SCOPE DECISION, user-ratified 2026-08-04). Do not widen it.**

- [ ] **Step 1: Write the census spec**

Routes **derived from the framework's own config**, never a hand list: `next.config.ts:46` registers `pageExtensions: ["ts", "tsx", "mdx"]`, so the census is every page surface under `app/` across all three (19 `page.tsx` + 13 `page.mdx` = 32 today). Five need params or fixtures (`admin/show/[slug]`, `admin/show/[slug]/preview/[crewId]`, `admin/show/staged/[stagedId]`, `show/[slug]/[shareToken]`, `show/[slug]/unpublish`) and use the same seeded data the existing suites use.

Each case signs in (`signInAs`, the pattern at `tests/e2e/help-pages.spec.ts:95-113`) and asserts the final URL and a 200 **before** measuring — `app/help/layout.tsx:19` calls `requireAdmin()`, so a fresh context visiting `/help/**` lands on a correctly-fonted sign-in page and would turn every help case green without executing a single help component.

The driven set, enumerated once so two implementers produce the same sample: all 32 routes at **both** viewports (390×844 and 1280×800); **every `<details>` on each surface** opened and walked (derived per surface, not a pinned total — see the note on populations below); the 13 exercisable non-page rendering states (4 `error.tsx`, 9 `loading.tsx`, 1 `not-found.tsx`; `global-error.tsx` and the crew `error.tsx` carry static import assertions only, per the documented limit); and these seven named surfaces driven into their revealed state: `AppHealthPopover`, the `CleanupAbandonedFinalizeButton` confirmation, the `ReapStaleSessionsButton` confirmation, `GalleryLightbox`, the help skip link's focus state, the `RefAnchor` hover/focus reveal, and the `BellPanel` occurrence tooltip.

Per surface, also assert the **registered face set** via `document.fonts` — family, weight, style, stretch and `unicode-range` — which is what closes a runtime-registered impostor at `weight: "1000"` that the weight-400 probe would never select.

The per-subset sweep collapses to the one committed face (see "Ratified deviation"); state that in a comment rather than leaving a silently absent loop.

**Harness readiness — three things this task must state, because a URL and a 200 prove none of them.**

1. **Server boot.** These cases run against the dev server locally (`pnpm dev`, port 3000) and against `pnpm build && pnpm start` in CI, which is what `crew-e2e.yml` boots. The distinction matters here specifically: the two paths emit CSS through different pipelines, and this whole change is about which stylesheet reaches the page.
2. **A hydration gate before every driven interaction.** A final URL and HTTP 200 prove *server rendering*, not hydration, and **a gesture on a pre-hydration Link is a FULL document navigation** — the click takes a different path or does nothing, so the intended revealed state goes unmeasured while the default-state walk passes green. Never use `waitForLoadState("networkidle")` as the proxy: `tests/e2e/published-review-modal.interactions.spec.ts:129-137` records that it hangs the full test timeout on the CI prod-build server, because background polling keeps the network busy and networkidle never fires — and that it proves nothing about hydration regardless. Use that file's mechanism: poll for React's `__reactProps$…` key carrying the handler on the target node, which appears once and only once the tree has hydrated.
3. **Detach safety.** Every `locator.evaluate` in the walk can outlive its element — the walk opens disclosures and drives state, so nodes unmount underneath it, and Playwright's auto-wait hangs on an unmounted node rather than failing fast. Tolerate a detached node as a recorded skip, never as a wait.

- [ ] **Step 4: Wire it four ways**

1. **Config** — add the filename to the `testMatch` alternation of **both** `mobile-safari` (`playwright.config.ts:65`) and `desktop-chromium` (`playwright.config.ts:79`). Naming both projects on the CI command line does **not** override a project's own `testMatch`.
2. **CI** — append the spec to the existing invocation at `.github/workflows/crew-e2e.yml:159`, which names its specs explicitly. (Contrast the standalone workflow, which must stay unfiltered.)
3. **Executed-spec registry** — add a threshold row beside `"font-binding.spec.ts": 10` at `scripts/check-crew-e2e-executed.mjs:38`. The checker enforces `executed >= min` (`scripts/check-crew-e2e-executed.mjs:93-94`), so **the number is the whole guard**: a row of `1` lets every census case but one skip while CI stays green, which is precisely the failure the registry exists to prevent. Set it by counting the cases the spec actually collects — 32 routes × 2 viewports plus the driven states — and record the derivation in a comment beside the row. Re-derive it if the census grows; a threshold that drifts below the real count is a silently disabled gate.
4. **Workflow coverage** — add the same `PATH_GATED_BY_EXCLUSION` disposition `font-binding.spec.ts` carries at `tests/ci/_metaE2eWorkflowCoverage.test.ts:134`. Without it, "every e2e spec is PR-covered or reason-allowlisted" fails the moment the file exists.

- [ ] **Step 5: Run everything it touches, and confirm the threshold is real**

```bash
pnpm vitest run tests/ci tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts
pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/font-rendering-census.spec.ts --reporter=list
```

Expected: PASS. Count the cases the Playwright run actually reports and confirm the registry row equals it — a threshold set below the observed count is the gate silently disabling itself.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/font-rendering-census.spec.ts tests/e2e/helpers/monoSurfaces.ts playwright.config.ts .github/workflows/crew-e2e.yml scripts/check-crew-e2e-executed.mjs tests/ci/_metaE2eWorkflowCoverage.test.ts
git commit -m "test(e2e): assert the rendered family across the route census"
```

---

## Task 14: Regenerate the pixel baselines

**Files:** `tests/e2e/section-header-visual.spec.ts-snapshots/` (50 PNG)

**This task does not commit the PNGs. The workflow does.** Read all five steps before running any of them — the ordering is what keeps local and remote histories from diverging.

- [ ] **Step 1: Push everything first — the job regenerates from the REMOTE branch**

```bash
git push origin feat/harness-font-fidelity
git rev-list --left-right --count origin/feat/harness-font-fidelity...HEAD
```

Expected: `0  0`. The job checks out `github.ref_name` (`.github/workflows/section-header-visual-regen.yml:33`), so anything still local regenerates against **stale code** — the baselines would capture a tree without the emitted face and look entirely plausible.

- [ ] **Step 2: Regenerate from the pinned image via `workflow_dispatch`**

```bash
gh workflow run section-header-visual-regen.yml --ref feat/harness-font-fidelity
gh run watch "$(gh run list --workflow=section-header-visual-regen.yml --branch feat/harness-font-fidelity --limit 1 --json databaseId --jq '.[0].databaseId')"
```

`--branch` is load-bearing: without it `--limit 1` returns the globally latest run of that workflow, so a concurrent dispatch from another branch becomes the thing this session watches. It would then pull before its own bot commit exists and lose the push race to its own run.

**Never from this arm64 host.** Byte-comparison gates pin BOTH the Docker image and the host architecture; arm64 dev hosts diverge from native-x64 CI runners even on an identical pinned image tag. A local capture produces bytes that look like proposed changes and are not.

- [ ] **Step 3: Fast-forward onto the bot's commit**

```bash
git pull --ff-only origin feat/harness-font-fidelity
git log --oneline -1
```

The job **commits and pushes the baselines itself** (`.github/workflows/section-header-visual-regen.yml:60-70`), so the working copy takes that commit rather than creating a second one. Committing locally on top is how the histories diverge, and it surfaces as a rejected push two tasks later.

If the job reports "No baseline changes to commit", the harness rendering did not move — investigate before continuing, because Task 8 was supposed to change exactly this.

- [ ] **Step 4: Push the validating commit the workflow requires**

```bash
git commit --allow-empty -m "test(admin): validate regenerated section-header baselines"
git push origin feat/harness-font-fidelity
```

**Not optional** (`.github/workflows/section-header-visual-regen.yml:17-20`): bot pushes trigger no CI, so a baseline commit whose SHA never ran the gate is untested, and the in-job re-comparison proves same-runner determinism only.

- [ ] **Step 5: Eyeball the diff, and confirm the 14 admin help WebPs did NOT move**

```bash
git show --stat HEAD~1
git status public/help/screenshots/
```

The PNG diff must be a type-family change and nothing else; a layout shift beyond glyph metrics is a defect to investigate, not a baseline to accept. `public/help/screenshots/` must be clean: application rendering is unchanged, the same bytes render, just delivered differently. **A diff there means the app's face moved, which is a real defect** (spec §8), not a rebaseline. If `pnpm screenshot:help` ran locally at any point, restore with `git restore public/help/screenshots/`.

---

## Task 15: The impeccable dual gate

Invariant 8. The diff touches `app/layout.tsx`, `app/global-error.tsx`, `app/globals.css` and `DESIGN.md`, so both halves run before close-out.

- [ ] **Step 1: Run the canonical setup gates**

<!-- spec-lint: ignore — impeccable skill files, not repo paths -->

`context.mjs` context load (PRODUCT.md + DESIGN.md), then the register reference read (`brand.md` or `product.md`).

- [ ] **Step 2: `/impeccable critique` on the diff**
- [ ] **Step 3: `/impeccable audit` on the diff**
- [ ] **Step 4: Disposition every finding**

P0 and P1 findings are fixed, or explicitly deferred with a `DEFERRED.md` entry. Findings plus dispositions go in the close-out §12.

- [ ] **Step 5: Fill §12's marker line**

Replace the `PENDING` line in §12 below with the real marker, in the grammar the 2026-08-01 invariant-8-closeout-enforcement spec §3.3 defines:

in the form `impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=recorded`
(the template files the guard already knows about carry the canonical spelling; do not
invent a variant).

**`tests/docs/_metaInvariant8Closeout.test.ts` is RED from Task 1 until this step lands**, because this plan declares both gate halves and the marker is a record of a gate that ran — it cannot be written truthfully in advance. This task is where it goes green, which is why the impeccable gate runs BEFORE the ledger task rather than after it.

- [ ] **Step 6: Run the docs suite, and watch the closeout guard go green**

Run: `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts`
Expected: PASS — red before this step, green after. That is this task's own TDD cycle.

- [ ] **Step 7: Commit — including any P0/P1 repairs**

Fix every P0 and P1 in THIS commit, or defer it explicitly with a `DEFERRED.md` entry. Nothing from the gate may land after Task 16, because Task 16 removes the ledger marker and must be the PR's last commit.

```bash
git add -A docs/superpowers/plans/2026-08-04-harness-font-fidelity.md DEFERRED.md app components
git commit -m "docs(plan): record the impeccable dual-gate dispositions"
```

---

## Task 16: Documentation and ledger, and the marker comes off HERE

**Files:** `DESIGN.md:133`, `DESIGN.md:139`, `DESIGN.md:141`, `BACKLOG.md`, `BACKLOG-archive.md`

- [ ] **Step 1: Amend `DESIGN.md` §2.1**

Line 133: replace the `next/font/local` mechanism sentence with the self-hosted stylesheet, naming both root import sites and the harness path. **The typeface commitment is unchanged** — call the amendment out explicitly so a later reader sees it was ratified, not drifted.

Line 139: update the fallback-stack sentence to the live `--font-sans` value. Line 141 carries the `size-adjust` figure and is corrected in Step 5.

Also note in §2.1 that the product ships a **monospace** family too. §2.1 commits to "a single contemporary sans for all UI" and never mentions mono, yet the tree renders it deliberately in many places. This change does not alter that typography; it records it, because the guard has to know about it and a design document that omits a shipped family misleads the next reader the same way it misled this one.

- [ ] **Step 2: Verify the guard row holds**

Run: `pnpm vitest run tests/styles/fontLoading.test.ts -t "DESIGN"`
Expected: PASS.

**That `-t` filter only works if the row exists and is named for it.** Neither `static-guard.mjs` nor any earlier task defines a DESIGN-parity row today, so Task 5 must add one titled with the word `DESIGN` — asserting the `DESIGN.md` §2.1 mechanism sentence and the fallback-stack sentence match the live `app/globals.css` value. Without it this command matches zero tests, exits 0, and reports success on a check that never ran.

- [ ] **Step 3: Graduate the ledger entry, and STRIP the marker in the same commit**

Move `BL-HARNESS-FONT-FIDELITY` to `BACKLOG-archive.md` at its terminal state, add a reconciliation-log line, and **replace `**Status:** IN PROGRESS · **Branch:** feat/harness-font-fidelity` with the entry's terminal status** as part of the same edit.

**The marker comes off HERE, and this task is deliberately LAST.** Two constraints force it:

- `tests/docs/_metaLedgerInProgress.test.ts:77-81` asserts "archived work cannot be in flight", so an archived entry still carrying the marker fails the merge-blocking suite. The marker cannot survive into the archive even for one commit — removal and archiving are the same edit.
- AGENTS.md invariant 12 puts removal in the PR's **last commit**. So nothing may be committed after this task: the impeccable gate and all its P0/P1 repairs are Task 15, and Task 17 pushes and merges without adding commits. If a later review round forces a code change, the marker goes back on, the change lands, and this task runs again — the marker is never left off across a commit that is not the last one.

- [ ] **Step 4: Run the ledger meta-tests**

Run: `pnpm vitest run tests/docs`
Expected: PASS — including `_metaLedgerInProgress` (no in-flight entry in an archive, and no flight field without the status that explains it) and `_metaInvariant8Closeout`, which Task 15 already turned green.

- [ ] **Step 5: Correct `DESIGN.md:141` to what Task 3 measured**

`DESIGN.md:141` currently records `size-adjust: 107.89%` "measured in the built output". That figure matches the spec's *latin-only* derivation, while the committed binary is latin + latin-ext and its vertical metrics (ascent 96.88%, descent 24.12%, line-gap 0%) match the *latin-ext* row. Whatever Task 3 read out of the real build is the truth; replace the recorded figure with it rather than leaving two published numbers that disagree.

- [ ] **Step 6: Commit**

```bash
git add DESIGN.md BACKLOG.md BACKLOG-archive.md
git commit -m "docs: record the self-hosted font mechanism and graduate the entry"
```

---

## Task 17: Close out

- [ ] **Step 1: Full pre-push gates**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm spec:lint`
Expected: all PASS. Scoped gates miss regressions — run the whole suite. `pnpm typecheck` covers both the vitest and playwright tsconfigs.

- [ ] **Step 2: Run the spec consistency checker**

Run: `node docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/consistency.mjs`
Expected: clean, or every hit explained by the ratified deviation.

- [ ] **Step 3: Whole-diff cross-model review to APPROVE**

**Two kinds of review, and the second is not optional.**

First, **three tight-scope dispatches** via `codex-guard` — app+styles; harness toolchain+fixture; census+wiring — because whole-diff reviews died silently on four consecutive PRs and split scopes are the project default for a diff this size (`AGENTS.md`, "Split tight-scope reviews are the default").

Then a **separate whole-milestone fresh-eyes pass** over the entire diff. Per `AGENTS.md` ("Whole-milestone close-out is its own gate"), per-scope reviews catch defects inside their scope; **integration defects between scopes are invisible to all three** — and this diff has exactly that shape, since the app stylesheet, the toolchain post-step and the runtime oracle are three surfaces that must agree about one face. Labelling the split dispatches "whole-diff" and stopping there is the failure that gate exists to prevent.

Every brief carries: fresh-eyes posture, `REVIEWER ONLY`, the consequence bound, the threat-model fence, the mutation-family closure set from this plan, and an `EXPLICITLY DO NOT RELITIGATE` block naming the §4.0 SCOPE DECISION and the ratified deviation above, each cited at `file:line`.

- [ ] **Step 4: Push and get REAL CI green**

Local green plus adversarial APPROVE is necessary but not sufficient. Branch protection requires twelve contexts.

- [ ] **Step 5: Merge and sync**

```bash
gh pr merge --merge
git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only
git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main
```

Expected: `0  0`. The run is complete only when that reports `0  0`.

- [ ] **Step 6: Stage 4.4 teardown**

Clear the pane and agent labels and `CronDelete` the nudge job. Then VERIFY no marker outlives the branch:

```bash
rg -n 'IN PROGRESS' BACKLOG.md BACKLOG-archive.md DEFERRED.md
```

Expected: no `BL-HARNESS-FONT-FIDELITY` row. Task 16 removed it; this step is the check that it did, not the removal.

---

## 11. Measured faces (filled by Task 3)

The `@font-face` rules `next/font/local` emits today, read out of a clean production build that emits exactly ONE `.woff2`. Task 5 reproduces these verbatim; every figure the hand-written stylesheet pins comes from here, never from a static family table.

**Measured 2026-08-04 from a clean `pnpm build` emitting exactly ONE `.woff2`**, so these are the current mechanism's figures, not the google-era ones.

```css
@font-face {
  font-family: inter;
  src: url(../media/InterVariable_latin-s.p.<hash>.woff2) format("woff2");
  font-display: swap;
  font-weight: 100 900;
  font-style: normal;
}
```

```css
@font-face {
  font-family: inter Fallback;
  src: local(Arial);
  ascent-override: 89.79%;
  descent-override: 22.36%;
  line-gap-override: 0.0%;
  size-adjust: 107.89%;
}
```

**Does the emitted Inter face carry a `unicode-range`?** **No.** One file covering its whole range declares none, so `EXPECTED_DESCRIPTORS` is the **five** descriptors above — `font-family`, `src`, `font-display`, `font-weight`, `font-style` — not the spec's six. The sixth was a seven-subset artifact.

**Three things this settles that were open or wrong:**

1. **The overrides are the latin-derived figures** (89.79 / 22.36 / 0 / 107.89), not the Capsize table the spec adopted (90.44 / 22.52 / 0 / 107.12) and not the raw-metric values the binary's `hhea` suggests (96.88 / 24.12). Reproduce these exactly; do not derive a second answer.
2. **`DESIGN.md:141`'s `size-adjust: 107.89%` is CORRECT and current.** An earlier note in this branch guessed it had drifted because the binary's raw ascent/descent match the latin-ext row; it had not. Next computes size-adjust from average advance width, which does not move with the vertical metrics. Task 16 therefore corrects only what actually changed.
3. **The generated family is lowercase `inter`**, derived from the loader module's variable name. The hand-written stylesheet declares `"Inter"` — capital — which is what `app/globals.css`'s `var()` fallback literal already names, and is exactly why the literal-binding row in Task 5 matters. `tests/e2e/font-binding.spec.ts` reads both names out of the token, so the rename is invisible to it.

---

## 12. Invariant-8 close-out (filled by Task 17)

UI surface: `app/layout.tsx`, `app/global-error.tsx`, `app/globals.css`, `DESIGN.md`. Both gate halves apply.

The marker line is written by Task 15 Step 5, in the grammar the invariant-8
closeout spec §3.3 defines. It is deliberately ABSENT until then rather than
present as a placeholder: a marker-SHAPED line that is not valid grammar fails
the "no malformed marker line anywhere in the plans tree" assertion, which is a
different and more confusing failure than the honest one — a declaring unit that
has no marker yet.

Findings and dispositions go here.

---

## Self-review

**Spec coverage.** §3.1 → Tasks 3, 5, 6. §3.2 → Tasks 8, 12. §3.3/§3.4 → superseded, Tasks 1, 3, 4. §4.0 scope decision → Task 14, fenced. §4.1 static rows → Tasks 5, 7; runtime rows → Tasks 10, 11, 14; wait row → Task 12. §4.2 → Tasks 8 and 9. §5 → Tasks 13, 15. §6 → Task 16. §7 → every task's test step. §8 risks → Task 15 Step 5 (WebPs), Task 13's ordering, Task 5's no-`@font-face`-in-globals row, Task 6's repo-wide census.

**Placeholder scan.** Two deliberate fill-ins remain, each with a named source and a step that produces it: `<digest from Step 1>` (Task 4 Step 1) and the `<measured>%` overrides plus `EXPECTED_DESCRIPTORS` (Task 3's §11 record). These are measurements, not TBDs — the plan must not pin a number it did not measure, and Task 3 exists to measure them.

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->

**Type consistency.** `PUBLIC_FONT_PATH` / `PUBLIC_FONT_URL` / `EXPECTED_SHA256` (Task 4, in `tests/helpers/fontManifest.ts`) are consumed unchanged in Tasks 5, 8, 9, 10. `parseFontFaces` / `EXPECTED_DESCRIPTORS` / `EXPECTED_FALLBACK_DESCRIPTORS` / `MEASURED_OVERRIDES` (Task 5, in `tests/helpers/fontCss.ts`) are consumed in Task 8. `expectedWidth` / `deriveProbeText` / `PROBE_STYLE` / `walkTextBearing` (Task 10) are consumed in Tasks 11 and 14. No name is spelled two ways, and **no runtime module imports from a `*.test.ts`** — the property review round 1 found violated three times.

**Every task's red phase is reachable.** Checked explicitly after round 1 found two that were not: Task 8 writes the browser guard *before* the post-step exists, because no later task can unwind a committed `liveEntryToolchain.ts`; Task 9's red is the registration meta-test, not the guard's behaviour; Task 11 merges the fixture, its meta-test and all 31 callers into one cycle so the meta-test is never committed red.

**Ordering constraints, stated once.** Task 3 measures **before** Task 4 moves the bytes (the build resolves the vendored path). Task 13 re-derives figures **after** Tasks 8 and 12. Task 15 pushes **before** dispatching the regen workflow, and takes the bot's commit rather than making its own. Task 16 strips the ledger marker **pre-merge**, in the same commit that archives the entry.

**Known gap carried into review.** The oracle's *distribution* into the 31 callers (Task 11) is the one surface the spikes did not exercise — the mechanism is prototyped, the wiring is not. It is called out here so review scrutinises it rather than discovering it.

## Round 2 review (Codex, 2026-08-04) — BLOCKING, all findings repaired

6 BLOCKING, 3 HIGH, 1 MEDIUM, and several were consequences of round 1's repairs — which is what the round-2 brief asked for. All accepted:

- **Playwright collects by project `testMatch` BEFORE applying a CLI filename filter**, so Task 8's browser red phase collected zero tests and reported success, and Task 9 expected a red commit. Registration folded into Task 8, `--list` asserted first, and Task 9 dissolved.
- **The close-out order was impossible**: Task 16 expected `_metaInvariant8Closeout` green while Task 17 was what turned it green, and the ledger marker has to come off in the PR's *last* commit. The impeccable gate now runs BEFORE the ledger task, and nothing commits after it.
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->

- **Task 10's fixture consumed the mono manifest three tasks before it existed.** `monoSurfaces.ts` moved into Task 9 alongside the oracle, with a rule that nothing in the "full oracle" may be named later than the task that builds it.
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->

- **`tests/helpers/fontCss.ts` was missing from its own commit**, so a clean checkout could not reproduce the passing test; and `assertFontsCss` was invoked by Task 7 while no task defined it. Both fixed.
- **Two evidence-versus-guard collisions**, the same shape the spec already solved for the spike directory: the retirement sweep cannot return zero (the `singleFontLoader` corpus, the retired-identifier registry and the not-yet-retargeted Arial pin all legitimately name `next/font`), and the one-declaration-site census collides with the M12 mutants Task 7 ports. Both now carry named per-path exceptions and a table of what must survive.
- **The wait-coverage guard had no algorithm** — a count-based row passes the exact mis-anchoring mutant it claims to reject, demonstrated on `attention-pill-focus.spec.ts` where hoisting the await to just after `goto` preserves the count. Replaced with an order-aware AST rule over document regions, plus four M21 mutants.
- **Both mono seed censuses were false**: `<pre` matched the word `<prefix>` in prose and a documentation placeholder `<code>` was counted, so the real figures are 9 across **6** files and **26** elements across **6** files by AST. The seed is now AST-derived.
- **`.github/workflows/screenshots-drift.yml:29` path-gates on `assets/fonts/**`** and would have silently stopped gating after the move — the second occurrence of an incident that workflow's own comment already records.
- **`gh run list --limit 1` can attach to another branch's run**; now `--branch`-scoped.

Found in the same pass by self-verification: all 33 harness servers serve the copied `.woff2` as `text/html` (fine by tolerance, so the guard now asserts the request succeeded); all 31 callers write `outFile` flat into the served directory, which is what makes one edit reach 31; the waits have four distinct existing anchor shapes and only 2 callers use `__hydrated`; `U+0301` is `.notdef` with a NON-zero advance of 1344 in this binary, so the probe filter needs both conditions and my test asserted only one; the fontkit arithmetic reproduces the spec's 130.0938px exactly against the new bytes; the descriptor inventory is **five**, not the spec's six, because `unicode-range` is a seven-subset artifact; and `DESIGN.md:139`'s recorded `size-adjust: 107.89%` disagrees with this binary's latin-ext metrics, so Task 16 must correct it to whatever Task 3 measures.

## Round 3 review (Codex, 2026-08-04) — BLOCKING, all findings repaired

6 BLOCKING, 3 HIGH, 1 MEDIUM, all accepted. Round 3 went at the parts rounds 1 and 2 had only described:

- **The pasted Lightning CSS parser could not have compiled.** `FontFaceProperty` exposes `type` and `value`; there is no `property` field, so `property.property` is a type error and `undefined` at runtime, collapsing every descriptor onto one key. The spike derives names from `type` (`source` to `src`, `custom` to `value.name`) and the plan now does too.
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->

- **`tests/helpers/fontCss.ts` was still absent from its producing commit** despite round 2 claiming it fixed. It is staged now.
- **The harness guard let the emitted `Inter Fallback` face vanish** — probed: delete it and 10/10 rows still pass, leaving the harness with no metric-matched swap face. New rows assert its presence, count and descriptor equality.
- **The fixture's four per-vantage tests had no home**: inside the imported helper they would register four extra cases in each of the 31 callers. They get their own registered spec.
- **The wait guard's per-test-body algorithm could not analyse the corpus** — navigation lives in helper functions (`boot()`, `open*()`) in eleven files while geometry lives in the test callback, which needs an interprocedural call graph. The anchor moved to the navigation site inside its own function, with the resulting weakening stated as a documented limit rather than hidden.
- **Three red claims were vacuous**: `fontFeatureAvailability` cannot fail after retargeting (same bytes, same contract, only the resolver moves) so its proof is a mutation; the preload had no failing assertion anywhere; and `-t "DESIGN"` matched no test, so a green run proved nothing.
- **`assertFontsCss(css)` could not drive the M16 dependency mutants** without a second input channel; it now takes the shipped-stylesheet list.
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->

- **Task 6's censuses collided with the planned tree**: the extension list excludes `.css`, so the one-declaration-site row could not see `app/fonts.css` at all; that file's own comment named the retired module; and `font-binding.spec.ts` had twelve references, not five.
- **Close-out had only the three scoped reviews**, missing the separate whole-milestone fresh-eyes pass that exists because integration defects between scopes are invisible to every scoped review.
- **The round-2 renumbering left a class of stale cross-references**, and one citation was wrong in a way that corrected me: `size-adjust: 107.89%` is at `DESIGN.md:141`, not `DESIGN.md:139`.

Found by probe in the same window, and the most expensive one had nothing to do with the review: **`lightningcss@1.32.0` THROWS on `compileEntryCss`'s output.** Tailwind generates `&[data-a:b]` from a literal string its scanner picks out of `tests/styles/_metaRawAccentText.test.ts:41`; that is an invalid attribute selector and the parser refuses the whole 174 KB sheet rather than skipping the rule. The spike never hit it because it parses a minimal entry, not real output. `errorRecovery: true` fixes it, verified — so the two guards are deliberately asymmetric, and Task 8 says so. Also probed: `section-header-visual` is a caller only `visual.config.ts` resolves, so the geometry census must run both configs; three callers run under two configs each, so the fixture meets real app pages too; the harness binds the face through the CSS **literal** rather than the token, which nothing asserted; and the committed subset genuinely covers latin plus latin-ext only.

## Round 1 review (Codex, 2026-08-04) — BLOCKING, all findings repaired

7 BLOCKING, 3 HIGH, 1 LOW, every one probe-backed and every one accepted. Task 3/4 ordering; the `pnpm ls` JSON shape (`lightningcss` is an object with a `version` field, never a `name@version` key); three runtime modules importing from `*.test.ts`; Task 9's `git stash` red phase, which cannot unwind a committed file; the wiring meta-test committed red plus a regex that a caller importing only `expect` walks through; Task 15 dispatching the regen workflow before pushing, and committing PNGs the workflow already commits; the ledger marker surviving into an archive the guard rejects; four unlisted mechanism-description surfaces; the census's missing hydration gate; and an unspecified registry threshold, where the number is the whole guard.

Found in the same pass by self-verification and repaired alongside: rows 20 and 21, added in round 32 (a denylist of conditional at-rules never sees the app's attribute-selector theme mechanism); the guard must parse authored CSS, never compiled, or Tailwind's own `--font-sans` makes row 20 fail on a correct tree; the shipped-stylesheet list must be derived rather than hard-coded; `H6`/`H7` collapse under one face and that must be said out loud; the fixture's vantages run different walks; four element-population totals the spec pins have drifted; and `tests/docs/_retiredIdentifiers.ts` needed a disposition.
