# Harness font fidelity — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 31 standalone e2e harnesses render the same Inter face the product renders, by defining that face in a committed stylesheet both the app and `compileEntryCss` read, and guard it so neither side can drift.

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
| §3.4's Capsize table (90.44 / 22.52 / 0 / 107.12) | **Superseded.** `next/font/local` derives its override figures from *this* binary, not from a static family table; `DESIGN.md:139` already records `size-adjust: 107.89%` measured in the built output. Task 3 reads all four from a real build and pins those. |
| §4.2 "`fontkit` does not resolve in this repo today" | **False.** Declared at `package.json:126` as `^2.0.4`. No dependency task needed for it. |
| The per-subset sweep over seven `unicode-range`s (§4.0, §4.1) | **Collapses to one.** The committed face has a single coverage band; there is no second subset to sweep. Non-Latin text falls back to the system font, which is the shipped behavior today and out of scope here. |

Everything else in the spec stands, including the whole harness half, the wait invariant, the fixture design, the oracle formulation, and the SCOPE DECISION in §4.0. **Do not re-derive the settled items listed under "Settled by execution" below, and do not widen the scope decision.**

Three spec citations are off by a line or two against the live tree; use these:

| Spec cites | Actual |
| --- | --- |
| `tests/assets/singleFontLoader.test.ts:440` and `:456` | asserted at **417** and **440**; `CANONICAL_LOADER` defined at **218** |
| `DESIGN.md:141` (fallback stack) | **139** |
| `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:498-513` | **514-521** |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts:133` | **134** |

---

## Global Constraints

- **TDD per task** (invariant 1). Every task: failing test → minimal implementation → passing test → commit. No implementation before the test that exercises it.
- **Commit per task** (invariant 6), conventional commits. Scopes used here: `assets`, `styles`, `e2e`, `test`, `docs`, `infra`.
- **Worktree only** (invariant 11). All work happens in `/Users/ericweiss/FX-worktrees/harness-font-fidelity`. Never edit `/Users/ericweiss/FX-Webpage-Template`.
- **Invariant 8 applies.** The diff touches `app/layout.tsx`, `app/global-error.tsx`, `app/globals.css` and `DESIGN.md`, so `/impeccable critique` AND `/impeccable audit` both run before close-out, with P0/P1 fixed or deferred via `DEFERRED.md`. Closeout marker line required: `impeccable-gate: …`.
- **Invariant 12.** `BL-HARNESS-FONT-FIDELITY` is already marked `**Status:** IN PROGRESS · **Branch:** feat/harness-font-fidelity` (commit `21aa715ed`). It is cleared at Stage 4.4, after the `0  0` check.
- **`lightningcss` is pinned EXACTLY `1.32.0`** — no caret. `@tailwindcss/node@4.2.4` pins that exact version; a caret installs 1.33.0 as a second copy and silently voids the guard's "same parser that compiles the file" argument.
- **The font binary is never regenerated in this branch.** Its bytes move directories; they do not change. `pyftsubset` output varies by host, so a regeneration would be an unreviewable diff (`assets/fonts/PROVENANCE.md`).
- **Pre-push gates, all of them:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:lint`. Then real CI green before merge.
- **No em-dashes in user-visible copy**; apostrophes are literal `'`; 44px tap targets; canonical type/token classes. (Pre-code mechanical UI gate — nothing in this plan renders new copy, but the preload `<link>` and `DESIGN.md` edits are in scope.)

## Meta-test inventory (mandatory declaration)

**Creates:**
- `tests/styles/fontLoading.test.ts` — the Lightning CSS static guard (21 rows, adapted to one face).
- `tests/e2e/_metaFontFidelityWiring.test.ts` — filesystem-walked: every `compileEntryCss` caller imports `test` from the shared fixture. Fails by default for a new caller.
- `tests/assets/_metaLightningCssSingleVersion.test.ts` — exactly one `lightningcss` version resolves in the tree.

**Extends / retargets:**
- `tests/assets/singleFontLoader.test.ts` — contract moves from "one `next/font` loader in `app/fonts.ts`" to "no `next/font` import anywhere in the repo-wide source census, and exactly one `@font-face` declaration site".
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
| M19 | Pseudo-element override (`::placeholder`, `::marker`, `::before`, `::after`) | runtime oracle (computed family on the pseudo) |
| M20 | Cross-family misclassification (mono ↔ sans in either direction) | mono manifest + freshness assertion |
| M21 | Wait removal / mis-anchoring (removed, once-per-file, or anchored to navigation) | static wait-coverage row |

---

## File structure

**Create:**

| Path | Responsibility |
| --- | --- |
| `app/fonts.css` | The one `@font-face`, the `Inter Fallback` face, and `--font-inter`. Imported by both Next roots. |
| `public/fonts/InterVariable-latin.woff2` | The served binary (moved from `assets/fonts/`, bytes unchanged). |
| `public/fonts/OFL.txt` | SIL Open Font License 1.1 (moved from `assets/fonts/LICENSE.txt`). |
| `public/fonts/PROVENANCE.md` | Moved, with its paths corrected. |
| `tests/styles/fontLoading.test.ts` | Lightning CSS static guard. |
| `tests/styles/fontLoadingMutants.test.ts` | The mutation matrix over that guard. |
| `tests/assets/_metaLightningCssSingleVersion.test.ts` | Exactly one `lightningcss` in the tree. |
| `tests/e2e/harness-font-face.spec.ts` | Playwright: the emitted face renders the committed bytes. |
| `tests/e2e/helpers/fontFidelityFixture.ts` | The shared fixture distributing the oracle to all 31 callers. |
| `tests/e2e/helpers/fontOracle.ts` | Byte-derived expectation + probe derivation + the three-way element dispatch, importable by both the fixture and the census. |
| `tests/e2e/helpers/monoSurfaces.ts` | The frozen mono manifest. |
| `tests/e2e/_metaFontFidelityWiring.test.ts` | Fixture-wiring meta-test. |
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

`tests/assets/singleFontLoader.test.ts:440`→`:417`, `:456`→`:440`; `DESIGN.md:141`→`DESIGN.md:139`; `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:498-513`→`:514-521`; `tests/ci/_metaE2eWorkflowCoverage.test.ts:133`→`:134`. Also strike §4.2's "`fontkit` does not resolve in this repo today" — it is declared at `package.json:126`.

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
 * would report it — so this test IS the argument's enforcement.
 */
describe("lightningcss is a single, exactly-pinned instance", () => {
  test("package.json pins it without a range operator", async () => {
    const pkg = (await import("../../package.json")).default as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies.lightningcss).toBe("1.32.0");
  });

  test("exactly one version resolves in the tree", () => {
    const out = execFileSync("pnpm", ["ls", "lightningcss", "--depth", "Infinity", "--json"], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    const versions = new Set(Array.from(out.matchAll(/"lightningcss@?([\d.]+)"/g), (m) => m[1]));
    const found = [...versions].filter((v): v is string => typeof v === "string" && v.length > 0);
    expect(found).toEqual(["1.32.0"]);
  });
});
```

**Concrete failure mode this catches:** the next Tailwind bump moves its own pin, this explicit pin does not follow, and the tree quietly grows a second `lightningcss` — after which the guard parses with a build that compiles nothing here, while staying green.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/assets/_metaLightningCssSingleVersion.test.ts`
Expected: FAIL — `expected undefined to be "1.32.0"` (it is not declared today).

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

## Task 3: Move the font bytes under `public/`, hash-pinned

A hand-written `@font-face` needs a URL the browser can fetch, and `assets/` is bundler input, not a served directory. The bytes move; they do not change.

**Files:**
- Create: `public/fonts/InterVariable-latin.woff2`, `public/fonts/OFL.txt`, `public/fonts/PROVENANCE.md`
- Delete: `assets/fonts/InterVariable-latin.woff2`, `assets/fonts/LICENSE.txt`, `assets/fonts/PROVENANCE.md`
- Modify: `scripts/subset-inter.sh`
- Create: `tests/styles/fontAssets.test.ts`

**Interfaces:**
- Produces: `PUBLIC_FONT_PATH = "public/fonts/InterVariable-latin.woff2"` and `EXPECTED_SHA256` — consumed by Tasks 5, 8 and 10.

- [ ] **Step 1: Capture the current digest**

```bash
shasum -a 256 assets/fonts/InterVariable-latin.woff2
```

Record the digest. `assets/fonts/PROVENANCE.md` states `fada467be8d8ebb5dccc346d29dc6ea37423da14c87dafed009631cb85632a54`; use whatever the command actually prints, and if it differs, stop and investigate rather than pinning a value you did not measure.

- [ ] **Step 2: Write the failing test**

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");

/** The one binary the app and every harness render. Moved from assets/ so it is servable. */
export const PUBLIC_FONT_PATH = "public/fonts/InterVariable-latin.woff2";
/** Digest measured on the committed bytes; see public/fonts/PROVENANCE.md. */
export const EXPECTED_SHA256 = "<digest from Step 1>";

describe("the committed font binary", () => {
  test("is present under public/ and matches its pinned digest", () => {
    const bytes = readFileSync(resolve(REPO_ROOT, PUBLIC_FONT_PATH));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(EXPECTED_SHA256);
  });

  test("ships its licence, matched on distinctive OFL text", () => {
    const licence = readFileSync(resolve(REPO_ROOT, "public/fonts/OFL.txt"), "utf8");
    expect(licence).toContain("SIL OPEN FONT LICENSE");
    expect(licence).toContain("PERMISSION & CONDITIONS");
  });

  test("no font binary is left behind under assets/", () => {
    expect(() => readFileSync(resolve(REPO_ROOT, "assets/fonts/InterVariable-latin.woff2"))).toThrow();
  });
});
```

**Concrete failure mode this catches:** a rename, a `.gitignore` rule, or an unreviewed byte swap; and a licence file replaced by a placeholder — round 11 probed the weaker predicate and found `"x"` passes a non-empty check.

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm vitest run tests/styles/fontAssets.test.ts`
Expected: FAIL — `ENOENT … public/fonts/InterVariable-latin.woff2`.

- [ ] **Step 4: Move the bytes**

```bash
mkdir -p public/fonts
git mv assets/fonts/InterVariable-latin.woff2 public/fonts/InterVariable-latin.woff2
git mv assets/fonts/LICENSE.txt public/fonts/OFL.txt
git mv assets/fonts/PROVENANCE.md public/fonts/PROVENANCE.md
```

Then update every path inside `public/fonts/PROVENANCE.md` (`assets/fonts/` → `public/fonts/`, `LICENSE.txt` → `OFL.txt`) and repoint `scripts/subset-inter.sh`'s output path at `public/fonts/InterVariable-latin.woff2`.

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm vitest run tests/styles/fontAssets.test.ts`
Expected: PASS, all three cases.

- [ ] **Step 6: Confirm nothing still points at the old path**

```bash
rg -n 'assets/fonts' --glob '!pnpm-lock.yaml'
```

Expected at this point: hits only in `app/fonts.ts`, `tests/styles/fontFeatureAvailability.test.ts`, `DESIGN.md` and the spec — each retired or corrected by a later task. Any OTHER hit is a surface this plan missed; fix it here.

- [ ] **Step 7: Commit**

```bash
git add -A public/fonts assets scripts/subset-inter.sh tests/styles/fontAssets.test.ts
git commit -m "feat(assets): serve the committed Inter binary from public/fonts"
```

---

## Task 4: Derive the fallback metric overrides from a real build

`next/font/local` generates the metric-matched `Inter Fallback` face from *this* binary's own metrics. Hand-writing it means reproducing exactly what ships, so PR #676's reflow fix survives the mechanism swap unchanged. Read the figures; do not compute a second answer.

**Files:**
- Modify: this plan's "§11. Measured faces" section (below). The record lands **inside this file**, not as a sibling — a new file in the plans tree would form its own invariant-8 unit and demand its own close-out marker.

- [ ] **Step 1: Build and extract the emitted faces**

```bash
pnpm build >/dev/null 2>&1
rg -o --no-filename '@font-face\{[^}]*\}' .next/static/css/*.css | sed 's/;/;\n/g'
```

- [ ] **Step 2: Record every descriptor of both emitted faces verbatim**

Fill §11 below with two fenced blocks: the Inter face exactly as emitted, and the `Inter Fallback` face exactly as emitted. State explicitly whether the Inter face carries a `unicode-range` — **it determines Task 5's descriptor inventory**, and guessing it is how a guard ends up pinning a descriptor the app never had.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-harness-font-fidelity.md
git commit -m "docs(plan): record the next/font-emitted faces before the mechanism swap"
```

---

## Task 5: `app/fonts.css` behind the Lightning CSS static guard

The guard is written first and must go red against a tree with no `app/fonts.css`.

**Files:**
- Create: `app/fonts.css`, `tests/styles/fontLoading.test.ts`
- Reference: `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/static-guard.mjs`

**Interfaces:**
- Consumes: `PUBLIC_FONT_PATH`, `EXPECTED_SHA256` (Task 3); the measured figures (Task 4).
- Produces: `parseFontsCss(): { faces: FontFace[]; tokens: Record<string, string> }` and `EXPECTED_DESCRIPTORS: readonly string[]`, used by Task 8's harness guard for cross-block comparison.

- [ ] **Step 1: Write the failing guard**

Port `static-guard.mjs` row-for-row into a Vitest file. Every row below is a separate `test()` so a failure names itself. The seven-subset rows collapse to one face; the rest transfer unchanged.

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transform } from "lightningcss";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const FONTS_CSS = resolve(REPO_ROOT, "app", "fonts.css");

/**
 * Parsed with Lightning CSS — the parser `@tailwindcss/cli` and
 * `@tailwindcss/postcss` already use to compile this tree — NOT with regular
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
            // CSS applies the LAST declaration; a guard that reads the first
            // checks behaviour the browser never exhibits (round 14).
            if (descriptors.has(property.property)) duplicated.push(property.property);
            descriptors.set(property.property, property.value);
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
});
```

`EXPECTED_DESCRIPTORS`, `EXPECTED_FALLBACK_DESCRIPTORS` and `MEASURED_OVERRIDES` are filled from Task 4's record. `weightOf`, `styleOf`, `displayOf`, `srcOf`, `overridesOf` and `tokenDeclarations` are small helpers over the parsed Lightning CSS values, ported from `static-guard.mjs` — copy them rather than reimplementing.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/styles/fontLoading.test.ts`
Expected: FAIL — `ENOENT … app/fonts.css`.

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
   generated from THIS binary before the mechanism swap (measured figures in
   the plan's measured-fallback.md). It is what keeps the `display: swap`
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

Fill `<measured>` from Task 4. If Task 4 recorded a `unicode-range` on the emitted Inter face, declare it here too and add it to `EXPECTED_DESCRIPTORS`; if not, do not invent one.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run tests/styles/fontLoading.test.ts`
Expected: PASS, every row.

- [ ] **Step 5: Commit**

```bash
git add app/fonts.css tests/styles/fontLoading.test.ts
git commit -m "feat(styles): declare the committed Inter face in app/fonts.css"
```

---

## Task 6: Retire `next/font`

Five surfaces encode the retired mechanism. Each retargeted assertion must fail against the current tree before the swap lands — that is what proves the new assertion has teeth.

**Files:**
- Delete: `app/fonts.ts`
- Modify: `app/layout.tsx:2,58`, `app/global-error.tsx:7-13,31`, `tests/setup.ts:138,146`, `tests/assets/singleFontLoader.test.ts:218,417,440`, `tests/observe/globalError.test.tsx:61`, `tests/styles/fontFeatureAvailability.test.ts:76`

- [ ] **Step 1: Retarget the three existing guards, and watch each fail**

`tests/assets/singleFontLoader.test.ts` — replace `CANONICAL_LOADER = "app/fonts.ts"` and its two assertions (lines 417, 440) with: no file in the repo-wide source census imports `next/font`, and exactly one file declares `@font-face`. **Keep the census walk exactly as it is** (`SOURCE_EXTENSIONS` and `TEXT_SCANNED_EXTENSIONS`, lines 163-164) — scoping it to `app/` is the already-refuted narrower reading a `components/`-hosted loader walks straight through. Exclude `docs/` and the spike directory **by path**, named in the test, or the guard goes red against this spec's own tracked mutation corpus.

`tests/observe/globalError.test.tsx:61` — replace the `NEXT_FONT_TEST_VARIABLE_CLASS` assertion with one that the crash screen module imports `./fonts.css`. The intent, that `--font-inter` resolves on the second root, is unchanged.

`tests/styles/fontFeatureAvailability.test.ts:76` — derive the binary path from `app/fonts.css`'s `src` URL instead of the `app/fonts.ts` AST. **Keep the indirection**: naming `public/fonts/…` directly would keep passing after someone repointed the stylesheet, which is exactly what that file exists to close.

Run each retargeted file: `pnpm vitest run tests/assets/singleFontLoader.test.ts tests/observe/globalError.test.tsx tests/styles/fontFeatureAvailability.test.ts`
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

`app/global-error.tsx`: same import swap, drop `className={inter.variable}` from its own `<html>` (line 31), and correct the comment at lines 7-13, which names `app/fonts.ts` and the loader.

- [ ] **Step 3: Delete the module and its mocks**

```bash
git rm app/fonts.ts
```

Remove both `vi.mock("next/font/local", …)` (line 138) and `vi.mock("next/font/google", …)` (line 146) from `tests/setup.ts`, with the explanatory comment block above them. With no `next/font` import anywhere, nothing needs the mock, and leaving it is dead infrastructure that quietly permits a reintroduction.

- [ ] **Step 4: Run the three guards and the build**

Run: `pnpm vitest run tests/assets/singleFontLoader.test.ts tests/observe/globalError.test.tsx tests/styles/fontFeatureAvailability.test.ts tests/styles/fontLoading.test.ts && pnpm typecheck && pnpm build`
Expected: PASS, and a clean build. A build failure here is the RSC-boundary class — check that `app/fonts.css` is imported, not `require`d.

- [ ] **Step 5: Confirm the app still renders Inter**

Run: `pnpm exec playwright test --project=desktop-chromium tests/e2e/font-binding.spec.ts`
Expected: PASS. It reads the family from the token and measures rendered text against it, so it is agnostic to how the face is delivered — green before and after is the contract (spec §5).

- [ ] **Step 6: Commit**

```bash
git add -A app tests/setup.ts tests/assets/singleFontLoader.test.ts tests/observe/globalError.test.tsx tests/styles/fontFeatureAvailability.test.ts
git commit -m "refactor(assets): retire next/font in favour of the committed stylesheet"
```

---

## Task 7: The static guard's mutation matrix

**Files:**
- Create: `tests/styles/fontLoadingMutants.test.ts`
- Reference: `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/mutants.mjs`, `dep-mutants.mjs`

- [ ] **Step 1: Port the mutation corpus**

Each mutant is a string transform over the real `app/fonts.css`, fed to the same parsing helpers Task 5 exported, asserting **at least one row rejects it**. Families M1-M12 and M16 from the table above. Drop only the mutants that are meaningless with one face (permuting URLs among subsets; copying one subset's bytes under seven names) and say so in a comment naming the family, so a reviewer sees a decision rather than an omission.

```ts
test.each(MUTANTS)("mutant $name is killed", ({ css, name }) => {
  expect(() => assertFontsCss(css)).toThrow();
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/styles/fontLoadingMutants.test.ts`
Expected: PASS — every mutant killed. **A mutant that survives is a guard defect, not a corpus defect**: fix the guard, never weaken the mutant.

- [ ] **Step 3: Add the conditional-at-rule row (M11) and its mutants**

A row that forbids `font-family`, the `font` shorthand, **and any `--font-*` token** inside any conditional at-rule at any nesting depth, scanning the rule tree of **every** shipped stylesheet — not just `app/fonts.css`. Round 29 corrected an earlier version that registered a `media` visitor only and read one file, so `@supports`, `@container`, `app/globals.css` and a conditionally-redefined token all walked through prose claiming otherwise. Verify it passes against the real `app/globals.css` today and fails on an injected dark-mode token override.

- [ ] **Step 4: Run the whole styles suite**

Run: `pnpm vitest run tests/styles`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/styles/fontLoadingMutants.test.ts tests/styles/fontLoading.test.ts
git commit -m "test(styles): pin the static font guard with its mutation matrix"
```

---

## Task 8: `compileEntryCss` emits the face and copies the binary

**Files:**
- Modify: `tests/e2e/helpers/liveEntryToolchain.ts:124-141`
- Create: `tests/e2e/helpers/liveEntryToolchain.fonts.test.ts`
- Reference: `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/harness-guard.mjs`

**Interfaces:**
- Consumes: `parseFontsCss`, `EXPECTED_DESCRIPTORS` (Task 5).
- Produces: the emitted-CSS contract every one of the 31 harnesses inherits.

- [ ] **Step 1: Write the failing harness guard**

Port `harness-guard.mjs`'s 10 rows. It compiles a minimal entry through the real `compileEntryCss` into a temp directory and asserts on the output:

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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/e2e/helpers/liveEntryToolchain.fonts.test.ts`
Expected: FAIL — `compileEntryCss` emits no `@font-face` at all today.

- [ ] **Step 3: Implement the post-step**

After the `execFileSync` returns, append the face block to `outFile` and copy the binary into `dirname(outFile)`. Emit `font-display: block` and a bare sibling `src`. Derive the block from `app/fonts.css` by parsing it — **do not** hand-duplicate the descriptors, or the two blocks drift the first time one is edited.

Keep `compileEntryCss` narrow in the sense its own comment defines (`tests/e2e/helpers/liveEntryToolchain.ts:110-122`): it still does not own how callers build their entry CSS. The face is appended to the compiled **output**, which is why one edit reaches all 31 callers regardless of how each assembled its input.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run tests/e2e/helpers/liveEntryToolchain.fonts.test.ts`
Expected: PASS, all 10 rows.

- [ ] **Step 5: Port the harness mutation matrix**

Families M6, M7, M13, M14, M15 from `harness-mutants.mjs`, plus the impostor face sourcing `local("Arial")` and a byte-corrupted copy. Run and confirm every one is killed.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/helpers/liveEntryToolchain.ts tests/e2e/helpers/liveEntryToolchain.fonts.test.ts
git commit -m "feat(e2e): emit the committed Inter face from compileEntryCss"
```

---

## Task 9: The harness-face browser guard

**Files:**
- Create: `tests/e2e/harness-font-face.spec.ts`
- Modify: `tests/e2e/standalone.config.ts:85-86`, `tests/e2e/standalone-baseline.json`

- [ ] **Step 1: Write the failing spec**

It builds a minimal entry through `compileEntryCss`, serves the output directory the way callers do, renders a fixed string, and asserts **both**: the emitted block matches the app's on the load-bearing descriptors, and the rendered advance width matches the expectation computed from the committed bytes with fontkit, within 0.5px.

A loaded-face check alone is **not** sufficient — round 2's fifth mutant declares `font-family: "Inter"` while sourcing `local("Arial")`, and `some(f => f.family === "Inter" && f.status === "loaded")` returns true, because `FontFace.family` is whatever the author wrote and identifies nothing about the source. `document.fonts.check()` is deliberately not used: it returns true for a system-installed family.

- [ ] **Step 2: Verify it fails on the pre-change toolchain**

Temporarily stash Task 8's post-step (`git stash push tests/e2e/helpers/liveEntryToolchain.ts`), run the spec, confirm FAIL, then `git stash pop`. **This anti-tautology check is required by the spec** (§4.2) — a guard that cannot fail on the tree it was written against proves nothing.

- [ ] **Step 3: Register it**

Add `harness-font-face` to the `testMatch` alternation in `tests/e2e/standalone.config.ts:85-86`, then regenerate `tests/e2e/standalone-baseline.json` in the same commit. `tests/ci/_metaSpecRegistration.test.ts` rejects any test-shaped e2e file resolved by no Playwright config, and pins standalone membership by observation.

**Add nothing to CI.** `.github/workflows/standalone-e2e.yml` runs the WHOLE standalone config unfiltered; naming a spec in it would narrow execution and break both the coverage detector and the baseline comparator.

- [ ] **Step 4: Run it**

Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts harness-font-face`
Expected: PASS.

- [ ] **Step 5: Run the registration meta-test**

Run: `pnpm vitest run tests/ci/_metaSpecRegistration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/harness-font-face.spec.ts tests/e2e/standalone.config.ts tests/e2e/standalone-baseline.json
git commit -m "test(e2e): prove the harness renders the committed Inter bytes"
```

---

## Task 10: The byte-derived oracle module

**Files:**
- Create: `tests/e2e/helpers/fontOracle.ts`, `tests/e2e/helpers/fontOracle.test.ts`

**Interfaces:**
- Produces: `expectedWidth(text: string, fontSize: number): number`, `deriveProbeText(): string`, `PROBE_STYLE: string`, `walkTextBearing(page: Page): Promise<Finding[]>` — consumed by Tasks 11 and 15.

- [ ] **Step 1: Write the failing unit test**

```ts
test("the expectation is computed from the committed bytes, not from a pinned literal", () => {
  // layout(text).advanceWidth / unitsPerEm * fontSize, verified against a real
  // browser at delta 0.0000px on latin, greek and cyrillic. Environment-
  // independent by construction: the expectation derives from the same bytes
  // the browser renders, so there is no literal to rot across platforms,
  // Chromium builds or CI images.
  expect(expectedWidth("Hamburgefonstiv", 16)).toBeCloseTo(measuredFromFontkit, 4);
});

test("probe text rejects zero-advance codepoints", () => {
  // Rejecting glyphForCodePoint(cp).id === 0 removes characters the face cannot
  // DRAW. It does not remove characters it draws with NO ADVANCE -- combining
  // marks measure 0.0000px under every font, so a probe of them passes under
  // Inter, under Arial, and under a face that fails to load at all.
  for (const cp of [...deriveProbeText()].map((c) => c.codePointAt(0)!)) {
    expect(advanceOf(cp)).toBeGreaterThan(0);
  }
});

test("the derived probe's expected width exceeds a nonzero floor", () => {
  expect(expectedWidth(deriveProbeText(), 16)).toBeGreaterThan(1);
});
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

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/helpers/fontOracle.ts tests/e2e/helpers/fontOracle.test.ts
git commit -m "feat(e2e): add the byte-derived font-rendering oracle"
```

---

## Task 11: The shared fixture and its wiring meta-test

**Files:**
- Create: `tests/e2e/helpers/fontFidelityFixture.ts`, `tests/e2e/_metaFontFidelityWiring.test.ts`
- Reference: `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/fixture-prototype.ts`

- [ ] **Step 1: Write the failing meta-test**

```ts
test("every compileEntryCss caller imports test from the shared fixture", () => {
  // Filesystem-walked, so a NEW harness spec that imports @playwright/test
  // directly fails by default rather than silently opting out of the oracle --
  // the same property that makes the mutation-surface meta-test work.
  for (const file of specsCallingCompileEntryCss()) {
    expect(readFileSync(file, "utf8")).toMatch(/from "\.\/helpers\/fontFidelityFixture"/);
  }
});
```

Run it: FAIL for all 31.

- [ ] **Step 2: Port the fixture**

Copy `fixture-prototype.ts` and adapt. **Do not redesign it.** The load-bearing properties, each of which a plausible simplification breaks:

- It **wraps page creation**, proxying the `browser` fixture, rather than consuming the `page` fixture. `tests/e2e/agendaScheduleLayout.spec.ts:386-411` requests `{ browser }`, builds two of its own contexts and closes both before teardown; an after-test hook on `page` would inspect a blank default page and report green while two real documents went unchecked.
- It instruments the `newContext` wrapper **only**. Playwright's default `context` fixture is itself built by calling `browser.newContext()`, so instrumenting both double-registers the binding and throws.
- It runs the oracle **whenever a document ends** — proxying `goto`, `setContent`, `reload`, `goBack`, `goForward`, `page.close()` and `context.close()` — not on `load`. A `load`-event version was built and loses both of `agendaScheduleLayout`'s documents: the handler's `evaluate` is async, the caller's `close()` wins the race, and the result is discarded by the same `catch` that tolerates a closing page. Close-only is equally wrong in the other direction: six source bodies expand to nine tests rendering **84 documents on reused pages**, of which close-only inspection saw nine.
- It **also** installs an in-page `pagehide` listener via an init script, because the programmatic wrapper cannot see browser-originated replacement, `window.open` pages, or frames. Neither vantage is complete alone; removing either turns a prototype test red.
- The "has anything rendered yet" gate asks the **document**, not the URL — `setContent()` leaves the URL at `about:blank`, so a URL-based guard skips every document a harness builds.
- The `pagehide` vantage runs the **synchronous** subset only (element walk + computed families). `pagehide` cannot postpone destruction, so it cannot await `document.fonts.ready`. The gap is precise and documented: a document that ends only by browser-originated navigation is checked for family but not for width.

- [ ] **Step 3: Run the fixture's own tests**

Port the prototype's per-vantage tests. Run them; each must pass, and removing any one mechanism must turn one of them red. Verify that by deleting each mechanism in turn and watching the corresponding test fail.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/helpers/fontFidelityFixture.ts tests/e2e/_metaFontFidelityWiring.test.ts
git commit -m "feat(e2e): distribute the font oracle through a shared fixture"
```

---

## Task 12: Wire the 31 callers

**Files:** the 31 harness specs listed under "Verified callers" below.

- [ ] **Step 1: Rewrite the import in each of the 31**

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

- [ ] **Step 2: Run the meta-test and the standalone suite**

Run: `pnpm vitest run tests/e2e/_metaFontFidelityWiring.test.ts && pnpm exec playwright test --config tests/e2e/standalone.config.ts`
Expected: meta-test PASS. The standalone suite will show geometry failures — **that is expected and is Task 14's input**, not a defect. Record the failures; do not fix them here.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/*.spec.ts
git commit -m "test(e2e): route all 31 harness specs through the font fixture"
```

---

## Task 13: The 88 `document.fonts.ready` waits

**Files:** the 25 callers below.

**The invariant, verbatim from spec §3.2 — read it before editing anything:**

> In each of the 25 callers, every document that is measured is awaited: after the content under measurement is present and before the first geometry read **of that document**.

Per document. **Not** per file: 16 of the 25 create more than one document, and a promise settled against the first says nothing about the second. **Not** per navigation: nine callers (`attention-pill-focus`, `bulk-ignore-eyebrow.layout`, `collapse-panel-morph`, `compact-alert-card-layout`, `hoverhelp-geometry`, `popover-clip-fit`, `step3-review-modal.agenda`, `step3-review-modal.interactions`, `wizard-blocker-modal.layout`) navigate to a bare `<div id="root"></div>` and hydrate afterward, so a wait placed at the `goto` settles against a document with no text in it and guarantees nothing. **Not** per geometry read: 206 waits before 206 reads of one settled document buys nothing.

Navigation sites are how the documents are **counted**, not where the await **goes**. In a loop body it lands once per iteration.

- [ ] **Step 1: Write the failing coverage row**

Add to the static guard a row asserting, per caller, that every measured document is awaited. Run it: FAIL for all 25 — all have zero waits today, confirmed by probe.

**Concrete failure mode:** removing a wait, adding only one to a multi-navigation file, or anchoring it to the navigation. All three leave geometry read against fallback metrics, which then get re-derived into pinned figures — a worse outcome than today, because today's ambient measurement is at least stable.

- [ ] **Step 2: Add the waits, file by file, against this manifest**

| caller | sites | note |
| --- | ---: | --- |
| `agendaScheduleLayout` | 9 | some in loops |
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

**Total 88 across 25 callers.** `resolve-label-layout`, `skeletonBandParity` and `stackedBandLayout` already await and need nothing.

- [ ] **Step 3: Run the coverage row**

Run: `pnpm vitest run tests/styles/fontLoading.test.ts -t "wait"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/*.spec.ts tests/styles/fontLoading.test.ts
git commit -m "test(e2e): await document.fonts.ready per measured document"
```

---

## Task 14: Re-derive the pinned geometry figures

**Order matters and is a spec risk item:** figures are re-derived only AFTER the face is emitted (Task 8) and the waits have landed (Task 13). Measuring earlier bakes fallback metrics into pinned numbers.

**Files:** whichever of the 28 font-sensitive harnesses fail; `tests/e2e/section-header-layout.layout.spec.ts:182,360,361`.

- [ ] **Step 1: Run the standalone suite and record every failure**

Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts --reporter=list`
The suite run **is** the census — the set cannot be enumerated statically.

- [ ] **Step 2: Update each pinned figure to its measured value**

For each failure, record before/after in a scratch file that becomes the PR body table. A figure that moves by more than a glyph-metric difference is a bug, not a rebaseline — investigate before accepting.

- [ ] **Step 3: Retarget the Arial pin**

`tests/e2e/section-header-layout.layout.spec.ts:182` pins `Arial, "Liberation Sans"` because the ambient stack differed across OSes. Once the harness renders a repo-controlled face that is identical everywhere, that reason is gone: retarget the pin at Inter and re-derive `HEADER_LINE_PX` (line 360, currently 44) and `HEADER_WITH_PILL_PX` (line 361, currently 72.8).

**This is not a tolerance widening.** The assertion and its floor stay; only the font it measures under changes, from a stand-in to the one that ships. `BL-HARNESS-FONT-FIDELITY` explicitly refuses widening it as a resolution.

- [ ] **Step 4: Re-run to green**

Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts`
Expected: PASS except `section-header-visual`'s pixel comparisons, which Task 16 rebaselines.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): re-derive harness geometry against the committed face"
```

---

## Task 15: The route-census oracle

**Files:**
- Create: `tests/e2e/font-rendering-census.spec.ts`, `tests/e2e/helpers/monoSurfaces.ts`
- Modify: `playwright.config.ts:65,79`, `.github/workflows/crew-e2e.yml:159`, `scripts/check-crew-e2e-executed.mjs:38`, `tests/ci/_metaE2eWorkflowCoverage.test.ts:134`

**Scope is the ratified sample, not a completeness pursuit (spec §4.0 SCOPE DECISION, user-ratified 2026-08-04). Do not widen it.**

- [ ] **Step 1: Write the mono manifest**

`monoSurfaces.ts` exports an ordered list of `{ route, selector, scope }`, `scope` being `"element"` or `"subtree"`. **Entries key on identity that survives a typography change** — a `data-testid` where one exists, otherwise a role-plus-accessible-name pair. Keying on `.font-mono` or on `code`/`pre` tag names would mean deleting the class also changes the expected set, which is round 26's exact defect.

Seeded from today's nine `font-mono` utilities plus the semantic `code`/`kbd`/`samp`/`pre` elements Tailwind preflight puts on the mono stack, including those MDX compiles to. A container carrying the utility for a region (`app/admin/dev/page.tsx:85` puts `font-mono` on an entire `<main>`) is entered once as `scope: "subtree"`.

Elements matching no entry are expected-Inter, so **the default is the assertion** and a new surface is covered without anyone adding a row.

- [ ] **Step 2: Write the freshness assertion**

Every entry must match at least one element on its route, and every element rendering mono must match an entry. This is what keeps an off-by-one in the seed loud instead of persisting as a silently over-broad exemption. A deliberate typography change then requires editing the manifest in the same diff — the property wanted, not an inconvenience.

- [ ] **Step 3: Write the census spec**

Routes **derived from the framework's own config**, never a hand list: `next.config.ts:46` registers `pageExtensions: ["ts", "tsx", "mdx"]`, so the census is every page surface under `app/` across all three (19 `page.tsx` + 13 `page.mdx` = 32 today). Five need params or fixtures (`admin/show/[slug]`, `admin/show/[slug]/preview/[crewId]`, `admin/show/staged/[stagedId]`, `show/[slug]/[shareToken]`, `show/[slug]/unpublish`) and use the same seeded data the existing suites use.

Each case signs in (`signInAs`, the pattern at `tests/e2e/help-pages.spec.ts:95-113`) and asserts the final URL and a 200 **before** measuring — `app/help/layout.tsx:19` calls `requireAdmin()`, so a fresh context visiting `/help/**` lands on a correctly-fonted sign-in page and would turn every help case green without executing a single help component.

The driven set, enumerated once so two implementers produce the same sample: all 32 routes at **both** viewports (390×844 and 1280×800); every `<details>` opened and walked (16 sites across 14 files, 15 default-collapsed); the 13 exercisable non-page rendering states (4 `error.tsx`, 9 `loading.tsx`, 1 `not-found.tsx`; `global-error.tsx` and the crew `error.tsx` carry static import assertions only, per the documented limit); and these seven named surfaces driven into their revealed state: `AppHealthPopover`, the `CleanupAbandonedFinalizeButton` confirmation, the `ReapStaleSessionsButton` confirmation, `GalleryLightbox`, the help skip link's focus state, the `RefAnchor` hover/focus reveal, and the `BellPanel` occurrence tooltip.

Per surface, also assert the **registered face set** via `document.fonts` — family, weight, style, stretch and `unicode-range` — which is what closes a runtime-registered impostor at `weight: "1000"` that the weight-400 probe would never select.

The per-subset sweep collapses to the one committed face (see "Ratified deviation"); state that in a comment rather than leaving a silently absent loop.

- [ ] **Step 4: Wire it four ways**

1. **Config** — add the filename to the `testMatch` alternation of **both** `mobile-safari` (`playwright.config.ts:65`) and `desktop-chromium` (`:79`). Naming both projects on the CI command line does **not** override a project's own `testMatch`.
2. **CI** — append the spec to the existing invocation at `.github/workflows/crew-e2e.yml:159`, which names its specs explicitly. (Contrast the standalone workflow, which must stay unfiltered.)
3. **Executed-spec registry** — add a threshold row beside `"font-binding.spec.ts": 10` at `scripts/check-crew-e2e-executed.mjs:38`. Without it, `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:514-521` fails, and nothing would stop the new suite from collecting cases and skipping them all while CI stays green.
4. **Workflow coverage** — add the same `PATH_GATED_BY_EXCLUSION` disposition `font-binding.spec.ts` carries at `tests/ci/_metaE2eWorkflowCoverage.test.ts:134`. Without it, "every e2e spec is PR-covered or reason-allowlisted" fails the moment the file exists.

- [ ] **Step 5: Run everything it touches**

Run: `pnpm vitest run tests/ci tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts && pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/font-rendering-census.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/font-rendering-census.spec.ts tests/e2e/helpers/monoSurfaces.ts playwright.config.ts .github/workflows/crew-e2e.yml scripts/check-crew-e2e-executed.mjs tests/ci/_metaE2eWorkflowCoverage.test.ts
git commit -m "test(e2e): assert the rendered family across the route census"
```

---

## Task 16: Regenerate the pixel baselines

**Files:** `tests/e2e/section-header-visual.spec.ts-snapshots/` (50 PNG)

- [ ] **Step 1: Regenerate from the pinned image via `workflow_dispatch`**

```bash
gh workflow run section-header-visual-regen.yml --ref feat/harness-font-fidelity
```

**Never from this arm64 host.** Byte-comparison gates pin BOTH the Docker image and the host architecture; arm64 dev hosts diverge from native-x64 CI runners even on an identical pinned image tag. A local capture produces bytes that look like proposed changes and are not.

- [ ] **Step 2: Pull the regenerated baselines and eyeball a diff**

Confirm the change is a type-family change and nothing else. A layout shift beyond glyph metrics is a defect to investigate, not a baseline to accept.

- [ ] **Step 3: Confirm the 14 admin help WebPs did NOT move**

Run: `git status public/help/screenshots/`
Expected: clean. Application rendering is unchanged — the same bytes render, just delivered differently. **A diff here means the app's face moved, which is a real defect** (spec §8), not a rebaseline. If `pnpm screenshot:help` was run locally at any point, restore with `git restore public/help/screenshots/`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/section-header-visual.spec.ts-snapshots
git commit -m "test(e2e): rebaseline section-header pixels against the committed face"
```

---

## Task 17: Documentation and ledger

**Files:** `DESIGN.md:133,139`, `BACKLOG.md`, `BACKLOG-archive.md`

- [ ] **Step 1: Amend `DESIGN.md` §2.1**

Line 133: replace the `next/font/local` mechanism sentence with the self-hosted stylesheet, naming both root import sites and the harness path. **The typeface commitment is unchanged** — call the amendment out explicitly so a later reader sees it was ratified, not drifted.

Line 139: update the fallback-stack sentence to the live `--font-sans` value.

Also note in §2.1 that the product ships a **monospace** family too. §2.1 commits to "a single contemporary sans for all UI" and never mentions mono, yet the tree renders it deliberately in many places. This change does not alter that typography; it records it, because the guard has to know about it and a design document that omits a shipped family misleads the next reader the same way it misled this one.

- [ ] **Step 2: Verify the guard row holds**

Run: `pnpm vitest run tests/styles/fontLoading.test.ts -t "DESIGN"`
Expected: PASS. The row compares the `DESIGN.md` sentences against the live `app/globals.css` value, so G5 cannot regress silently.

- [ ] **Step 3: Graduate the ledger entry**

Move `BL-HARNESS-FONT-FIDELITY` to `BACKLOG-archive.md` at its terminal state, and add a reconciliation-log line. **The `**Status:** IN PROGRESS · **Branch:**` marker goes with it** — an entry that graduates takes its marker along by construction (invariant 12).

- [ ] **Step 4: Run the ledger meta-tests**

Run: `pnpm vitest run tests/docs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md BACKLOG.md BACKLOG-archive.md
git commit -m "docs: record the self-hosted font mechanism and graduate the entry"
```

---

## Task 18: The impeccable dual gate

Invariant 8. The diff touches `app/layout.tsx`, `app/global-error.tsx`, `app/globals.css` and `DESIGN.md`, so both halves run before close-out.

- [ ] **Step 1: Run the canonical setup gates**

`context.mjs` context load (PRODUCT.md + DESIGN.md), then the register reference read (`brand.md` or `product.md`).

- [ ] **Step 2: `/impeccable critique` on the diff**
- [ ] **Step 3: `/impeccable audit` on the diff**
- [ ] **Step 4: Disposition every finding**

P0 and P1 findings are fixed, or explicitly deferred with a `DEFERRED.md` entry. Findings plus dispositions go in the close-out §12.

- [ ] **Step 5: Fill §12's marker line**

Replace the `PENDING` line in §12 below with the real marker, in the grammar the 2026-08-01 invariant-8-closeout-enforcement spec §3.3 defines:

```
impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=recorded
```

**`tests/docs/_metaInvariant8Closeout.test.ts` is RED until this lands**, because this plan declares both gate halves. That is by design — the marker is a record of a gate that ran, so it cannot be written truthfully in advance. Task 19 Step 1 is where its green is verified.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-harness-font-fidelity.md DEFERRED.md
git commit -m "docs(plan): record the impeccable dual-gate dispositions"
```

---

## Task 19: Close out

- [ ] **Step 1: Full pre-push gates**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm spec:lint`
Expected: all PASS. Scoped gates miss regressions — run the whole suite. `pnpm typecheck` covers both the vitest and playwright tsconfigs.

- [ ] **Step 2: Run the spec consistency checker**

Run: `node docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/consistency.mjs`
Expected: clean, or every hit explained by the ratified deviation.

- [ ] **Step 3: Whole-diff cross-model review to APPROVE**

Dispatch via `codex-guard`, **split into tight-scope reviews** (app+styles; harness toolchain+fixture; census+wiring) rather than one whole-diff attempt. Every brief carries: fresh-eyes posture, `REVIEWER ONLY`, the consequence bound, the threat-model fence, the mutation-family closure set from this plan, and an `EXPLICITLY DO NOT RELITIGATE` block naming the §4.0 SCOPE DECISION and the ratified deviation above, each cited at `file:line`.

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

Clear the pane and agent labels, confirm no `IN PROGRESS` marker outlives the branch, and `CronDelete` the nudge job.

---

## 11. Measured faces (filled by Task 4)

The `@font-face` rules `next/font/local` emits today, read out of a real production build. Task 5 reproduces these verbatim; every figure the hand-written stylesheet pins comes from here, never from a static family table.

```css
/* Inter — PENDING Task 4 */
```

```css
/* Inter Fallback — PENDING Task 4 */
```

**Does the emitted Inter face carry a `unicode-range`?** PENDING Task 4. This determines Task 5's `EXPECTED_DESCRIPTORS`.

---

## 12. Invariant-8 close-out (filled by Task 18)

UI surface: `app/layout.tsx`, `app/global-error.tsx`, `app/globals.css`, `DESIGN.md`. Both gate halves apply.

```
impeccable-gate: PENDING — filled by Task 18 Step 5
```

Findings and dispositions go here.

---

## Self-review

**Spec coverage.** §3.1 → Tasks 4, 5, 6. §3.2 → Tasks 8, 13. §3.3/§3.4 → superseded, Tasks 1, 3, 4. §4.0 scope decision → Task 15, fenced. §4.1 static rows → Tasks 5, 7; runtime rows → Tasks 10, 11, 15; wait row → Task 13. §4.2 → Task 9. §5 → Tasks 14, 16. §6 → Task 17. §7 → every task's test step. §8 risks → Task 16 Step 3 (WebPs), Task 14 ordering, Task 5's no-`@font-face`-in-globals row, Task 6's repo-wide census.

**Placeholder scan.** Three deliberate fill-ins remain, each with a named source and a step that produces it: `<digest from Step 1>` (Task 3 Step 1), `<measured>%` overrides and `EXPECTED_DESCRIPTORS` (Task 4's record). These are measurements, not TBDs — the plan must not pin a number it did not measure, and Task 4 exists to measure them.

**Type consistency.** `PUBLIC_FONT_PATH` / `EXPECTED_SHA256` (Task 3) are consumed unchanged in Tasks 5, 8, 10. `parseFontsCss` / `EXPECTED_DESCRIPTORS` (Task 5) are consumed in Task 8. `expectedWidth` / `deriveProbeText` / `PROBE_STYLE` / `walkTextBearing` (Task 10) are consumed in Tasks 11, 15. No name is spelled two ways.

**Known gap carried into review.** The oracle's *distribution* into the 31 callers (Tasks 11, 12) is the one surface the spikes did not exercise — the mechanism is prototyped, the wiring is not. It is called out here so the review scrutinises it rather than discovering it.
