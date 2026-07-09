# Parser Property-Fuzz Layer (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the fast-check property-fuzz layer over `parseSheet` per spec `docs/superpowers/specs/2026-07-09-parser-property-fuzz-design.md` (Phase 1): model-first generator with contract-cited dials, Tier-1 robustness + Tier-2 plant-and-find properties, PR fixed-seed run + nightly deep run, regression corpus, dial-registry meta-test.

**Architecture:** A semantic `ShowModel` arbitrary (v4-only, five entity kinds) renders to markdown through per-section templates copied from a real fixture; a runtime `validateGeneratedCase` gate enforces every generator-honesty invariant before render; `groundTruth.ts` implements the field-complete plant-and-find oracle with section-scoped, identity-value-only signal attribution. A model-free chaos arbitrary feeds Tier-1 only.

**Tech Stack:** fast-check (new devDependency), vitest (existing serial project — `tests/parser/fuzz/*.fuzz.test.ts` matches `BASE_INCLUDE` `vitest.projects.ts:20` and is corpus-adjacent so SERIAL is correct), GitHub Actions (`x-audits.yml`).

## Global Constraints

- **Spec is canonical**: `docs/superpowers/specs/2026-07-09-parser-property-fuzz-design.md`. Where this plan and the spec disagree, the spec wins; open a question.
- TDD per task (AGENTS.md invariant 1); commit per task, `test(parser):` / `infra:` scopes (invariant 6).
- All run numbers live ONLY in `tests/parser/fuzz/seeds.ts`: `PR_SEED = 20260709`, `PR_NUM_RUNS = 100`, `DEEP_NUM_RUNS = 5000`. Env: `FUZZ_DEEP=1` enables deep numbers, `FUZZ_SEED=<n>` overrides seed, `FUZZ_NUM_RUNS=<n>` overrides run count.
- Chaos caps (jointly enforced): ≤10k chars/cell, ≤400 lines, ≤120 cells/row, ≤256KB total document.
- Model: v4 ONLY (`model.version` is the literal `"v4"`); five entity kinds (crew 1–12, hotels 0–3, rooms 0–6, venue, dates); one calendar year (2020–2035), pairwise-distinct days.
- `validateGeneratedCase(model, dialChoices)` invariants (a)–(g) per spec §3.1 — single honesty layer; `render.ts` never checks honesty.
- Tier-2 attribution: identity values only, boundary-delimited, domain-aware date matchers, NO bare `blockRef.index`, NO hardError absolution (hardErrors on model input = property failure).
- No production code changes in this milestone UNLESS the fuzz finds a real parser bug (then: TDD fix, separate commit, class-sweep).
- PR fuzz runtime budget: < 60 s total.
- Before push: `pnpm test` (full suite), `pnpm typecheck`, `pnpm lint`, `pnpm format:check` — scoped gates are not sufficient.
- **Meta-test inventory:** CREATES `tests/parser/fuzz/_metaDialRegistry.test.ts`. EXTENDS none (no Supabase calls, no tiles, no admin-alert codes, no advisory locks — declared per AGENTS.md writing-plans rule).

## Verified code contracts (pre-draft verification pass, all cited from live worktree)

- `parseSheet(markdown: string, filename?: string): ParsedSheet` — `lib/parser/index.ts:546`.
- `ParsedSheet` fields — `lib/parser/types.ts:378-402`; `ParseWarning` `{code, severity, message, blockRef?}` `types.ts:7-28`; `ParseError` `types.ts:29`.
- Day-restriction grammar: `PAREN_ONLY_PATTERN` `lib/parser/personalization.ts:58`, `BARE_DATES_ONLY_PATTERN` `:60-62`, `DATE_TOKEN_PATTERN = /\d{1,2}\/\d{1,2}/g` `:59`; `extractDayRestriction` `:86-140` → `{kind:'explicit', days:['M/D',...]}`; `***` → `unknown_asterisk` only when no other restriction (`crew.ts:386-396`).
- Crew columns: `CREW_COLUMN_VOCAB = ["NAME","ROLE","PHONE","EMAIL"]` `crew.ts:75`; positional defaults name=1 role=2 phone=3 email=-1 `crew.ts:80-84`; `CREW_COLUMN_POSITIONAL_FALLBACK` emit `crew.ts:159`; email canonicalized `crew.ts:317-318` via `lib/email/canonicalize.ts:2-5`.
- v4 crew fixture shape (`fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md:224-227`): `| CREW | NAME | ROLE | PHONE | |` header + data rows with col0 empty.
- Dates v4 5-col shape (fixture `:216-222`): `| DATES | | DAY | DATE | TIME |`, data rows `| | TRAVEL | Sunday | 4/6/25 | |`, `| | SHOW DAY 1 | Tuesday | 4/8/25 | ... |`; `classifyLabel` regexes `lib/parser/blocks/dates.ts:48-60`.
- Venue labels: `VENUE NAME` / `VENUE ADDRESS` alias rows (fixture `:311+`; `lib/parser/blocks/venue.ts:58-62`).
- Rooms: `SECTION_HEADER_TOKENS = ["GENERAL SESSION","BREAKOUT","ADDITIONAL ROOM","LUNCH ROOM"]` `rooms.ts:108-113`; `roomHeaderNameShape /^[A-Z0-9][A-Z0-9 &',./-]*$/` + gates `rooms.ts:134-178`; structured room = header cell `GENERAL SESSION <name> <dims> <floor>` + bare-label rows (SETUP, SET TIME, …).
- Version markers: `V4_BLOCKS` (contact/rental/logistics) `lib/parser/schema.ts:91-94`; `MIN_ABS=2` `:101`, `MIN_MARGIN=2` `:102`; v2 GS markers create rooms (`rooms.ts:978-1019`) — that's why v4-only.
- Exporter section separation: `tables.join("\n\n")` `lib/drive/exportSheetToMarkdown.ts:357` — render always emits ≥1 blank line between sections; `blankPadding` dial range 1–3.
- Vitest: `BASE_INCLUDE = ["tests/**/*.test.ts", ...]` `vitest.projects.ts:20`; mutation project env-gated `VITEST_INCLUDE_MUTATION_HARNESS` `vitest.projects.ts:98-109` — fuzz files must NOT collide with `MUTATION_TEST_GLOBS` (`tests/parser/mutationHarness.*.test.ts`) and don't.
- Reusable oracle exports: `capture`, `payloadOf`, `signalOf`, `fingerprint` — `tests/parser/mutation/oracle.ts:8,11,20,103`.
- x-audits.yml: triggers pull_request/push/schedule/workflow_dispatch (`:1-10`); job template with pnpm 10.33.2 / node 20 (`:81-121`); schedule-only gating via `if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'`.

## File Structure

```
tests/parser/fuzz/
  seeds.ts                    run-count/seed single source + env plumbing
  shape.ts                    assertParsedSheetShape structural validator
  chaos.ts                    model-free hostile-markdown arbitrary (Tier 1 only)
  model.ts                    ShowModel type + arbitraries + validateGeneratedCase
  dials.ts                    dial registry {name, contractFile, contractSymbol, note?, arbitrary}
  render.ts                   (model, dialChoices) → markdown (serialization only)
  groundTruth.ts              Tier-2 oracle: field matrix + attribution tiers
  robustness.fuzz.test.ts     Tier 1 properties (chaos + model-rendered)
  plantAndFind.fuzz.test.ts   Tier 2 property + sabotage sensitivity test
  regressions/
    index.test.ts             replays every committed counterexample
  _metaDialRegistry.test.ts   walker meta-test
.github/workflows/x-audits.yml   + parser-fuzz-deep job
package.json                     + fast-check devDep, + test:fuzz / test:fuzz:deep scripts
```

---

### Task 1: seeds.ts — run-config single source

**Files:**
- Create: `tests/parser/fuzz/seeds.ts`
- Test: `tests/parser/fuzz/seeds.test.ts`
- Modify: `package.json` (add `fast-check` devDependency; scripts `test:fuzz`, `test:fuzz:deep`)

**Interfaces:**
- Produces: `fuzzRunConfig(): { seed: number; numRuns: number; deep: boolean }`; constants `PR_SEED = 20260709`, `PR_NUM_RUNS = 100`, `DEEP_NUM_RUNS = 5000`.

- [ ] **Step 1: Install fast-check**

```bash
cd /Users/ericweiss/FX-Webpage-Template/.claude/worktrees/parser-property-fuzz
pnpm add -D fast-check
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/parser/fuzz/seeds.test.ts
// seeds.ts resolves its config ONCE at module evaluation (singleton — the
// deep seed must be one replay coordinate per process). Tests therefore set
// process.env BEFORE a fresh dynamic import, via vi.resetModules().
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ENV_KEYS = ["FUZZ_DEEP", "FUZZ_SEED", "FUZZ_NUM_RUNS"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
beforeEach(() => {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const load = () => import("./seeds");

describe("fuzzRunConfig", () => {
  it("defaults to the fixed PR seed and PR run count (deterministic PR runs)", async () => {
    const m = await load();
    expect(m.fuzzRunConfig()).toEqual({ seed: m.PR_SEED, numRuns: m.PR_NUM_RUNS, deep: false });
  });
  it("FUZZ_DEEP=1 raises numRuns to DEEP_NUM_RUNS and randomizes the seed", async () => {
    process.env.FUZZ_DEEP = "1";
    const m = await load();
    const a = m.fuzzRunConfig();
    expect(a.deep).toBe(true);
    expect(a.numRuns).toBe(m.DEEP_NUM_RUNS);
    expect(Number.isInteger(a.seed)).toBe(true);
  });
  it("FUZZ_SEED and FUZZ_NUM_RUNS give exact replay", async () => {
    process.env.FUZZ_DEEP = "1";
    process.env.FUZZ_SEED = "424242";
    process.env.FUZZ_NUM_RUNS = "77";
    const m = await load();
    expect(m.fuzzRunConfig()).toEqual({ seed: 424242, numRuns: 77, deep: true });
  });
  it("is a stable singleton within one module instance", async () => {
    process.env.FUZZ_DEEP = "1";
    const m = await load();
    expect(m.fuzzRunConfig().seed).toBe(m.fuzzRunConfig().seed);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/fuzz/seeds.test.ts`
Expected: FAIL — `Cannot find module './seeds'`.

- [ ] **Step 4: Write minimal implementation**

```ts
// tests/parser/fuzz/seeds.ts
// Single source of every fuzz run number (spec §5). PR runs are deterministic
// (fixed seed) — a regression net, not exploration. Deep runs (nightly) explore
// with a random seed unless FUZZ_SEED pins an exact replay.
export const PR_SEED = 20260709;
export const PR_NUM_RUNS = 100;
export const DEEP_NUM_RUNS = 5000;

// MODULE-LEVEL SINGLETON: the random deep seed is drawn ONCE per process, so
// every fuzz test file (robustness + plantAndFind, separate vitest imports of
// this module in the SAME serial-project process) shares one replay coordinate.
// If vitest ever isolates the files into separate processes, each logs its own
// FUZZ-CONFIG line — still replayable, one line per file.
const RESOLVED: { seed: number; numRuns: number; deep: boolean } = (() => {
  const deep = process.env.FUZZ_DEEP === "1";
  const seed = process.env.FUZZ_SEED
    ? Number.parseInt(process.env.FUZZ_SEED, 10)
    : deep
      ? // Date.now is fine here: deep runs WANT a fresh seed; drawn once,
        // printed via FUZZ-CONFIG, replayed via FUZZ_SEED.
        Date.now() % 2 ** 31
      : PR_SEED;
  const numRuns = process.env.FUZZ_NUM_RUNS
    ? Number.parseInt(process.env.FUZZ_NUM_RUNS, 10)
    : deep
      ? DEEP_NUM_RUNS
      : PR_NUM_RUNS;
  return { seed, numRuns, deep };
})();

export function fuzzRunConfig(): { seed: number; numRuns: number; deep: boolean } {
  return RESOLVED;
}
```

- [ ] **Step 5: Add package.json scripts** (in `"scripts"`, alongside `test:parser`):

```json
"test:fuzz": "vitest run tests/parser/fuzz",
"test:fuzz:deep": "FUZZ_DEEP=1 vitest run tests/parser/fuzz"
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/fuzz/seeds.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml tests/parser/fuzz/seeds.ts tests/parser/fuzz/seeds.test.ts
git commit --no-verify -m "infra: fast-check dep + fuzz run-config single source (seeds.ts)"
```

---

### Task 2: shape.ts — ParsedSheet structural validator

**Files:**
- Create: `tests/parser/fuzz/shape.ts`
- Test: `tests/parser/fuzz/shape.test.ts`

**Interfaces:**
- Consumes: `ParsedSheet` type (`lib/parser/types.ts:378-402`), `parseSheet` (`lib/parser/index.ts:546`).
- Produces: `assertParsedSheetShape(p: unknown): asserts p is ParsedSheet` — throws with a path-labeled message on the first violation.

Required fields (spec §4.1): every REQUIRED `ParsedSheet` field present with correct container type. CAUTION — not all fields are arrays: `transportation: TransportationRow | null` (`types.ts:383`) and `diagrams` is an OBJECT `{ linkedFolder, embeddedImages, linkedFolderItems }` (`types.ts:386`). Read `lib/parser/types.ts:378-402` and mirror it field-by-field exactly (arrays: `crewMembers`/`hotelReservations`/`rooms`/`raw_unrecognized`/`warnings`/`archivedPullSheetTabs`/`hardErrors`; the rest per their declared types); `runOfShow` validated only when present; each `warnings[]` entry has non-empty string `code`, valid `severity`, non-empty `message` (`types.ts:7-10`); each `hardErrors[]` entry non-empty `code` + `message` (`types.ts:29`); whole value JSON-round-trippable (`JSON.parse(JSON.stringify(p))` does not throw; note the round-trip drops `undefined`-valued keys, which is toEqual-equivalent under the oracle's canon — assert with vitest `toEqual`, not `toStrictEqual`, and not `fingerprint` which always returns a hash).

- [ ] **Step 1: Write the failing test** — three cases: (a) `assertParsedSheetShape(parseSheet(realFixtureMarkdown, "f.md"))` passes for a real fixture read from `fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md`; (b) a hand-built object missing `warnings` throws mentioning `warnings`; (c) a valid parse with one warning mutated to `{code: ""}` throws mentioning `code`.
- [ ] **Step 2: Run — expect FAIL (module missing).** `pnpm vitest run tests/parser/fuzz/shape.test.ts`
- [ ] **Step 3: Implement `shape.ts`** — plain hand-rolled guards (no zod; repo has no runtime-validation dep and YAGNI). Mirror the type file field-by-field; comment each guard with the `types.ts` line it mirrors.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `test(parser): fuzz shape validator for ParsedSheet structural property`

---

### Task 3: chaos.ts + Tier-1 robustness over chaos

**Files:**
- Create: `tests/parser/fuzz/chaos.ts`, `tests/parser/fuzz/robustness.fuzz.test.ts`
- Test: `tests/parser/fuzz/chaos.test.ts` (cap enforcement)

**Interfaces:**
- Consumes: `fuzzRunConfig` (Task 1), `assertParsedSheetShape` (Task 2), `capture`/`payloadOf`/`fingerprint` from `tests/parser/mutation/oracle.ts:8,11,103`.
- Produces: `chaosMarkdown: fc.Arbitrary<string>`; the Tier-1 property runner `runTier1(input: string)` reused by Task 8.

- [ ] **Step 1: Write failing cap test** — `fc.sample(chaosMarkdown, {numRuns: 200, seed: 1})` and assert for every sample: `Buffer.byteLength(s) <= 262144`, `s.split("\n").length <= 400`, every line's `split("|").length - 1 <= 121` guard, no cell > 10k chars.
- [ ] **Step 2: Run — FAIL (module missing).**
- [ ] **Step 3: Implement `chaos.ts`** — compose `fc.array` of line arbitraries biased toward: pipe-delimited rows of `fc.string({maxLength: 100})` cells (some with zero-width `‌`, bidi `‮`, control chars, CRLF), occasional 10k-char cell (bounded count so the 256KB doc cap binds), occasional 120-cell row, occasional header-ish tokens drawn from `["CREW","HOTEL","DATES","VENUE","GENERAL SESSION","| | |"]`. Enforce the total-byte cap structurally: build lines, then `fc.pre`-free truncation is FORBIDDEN (silent truncation misreports coverage) — instead constrain generators so worst case ≤ 256KB by construction: ≤ 20 long-cell lines × 10,240B = 204,800B, plus ≤ 380 short lines × 128B = 48,640B, plus ≤ 400 newlines = 253,840B < 262,144B. Comment this exact arithmetic in the file; the cap test proves it empirically over samples AND the constants are asserted statically (20×10240 + 380×128 + 400 < 262144).
- [ ] **Step 4: Run cap test — PASS.**
- [ ] **Step 5: Write the Tier-1 property test** in `robustness.fuzz.test.ts`:

```ts
import fc from "fast-check";
import { describe, it } from "vitest";
import { parseSheet } from "@/lib/parser";
import { fuzzRunConfig } from "./seeds";
import { assertParsedSheetShape } from "./shape";
import { payloadChanged, signalEq } from "../mutation/oracle";
import { chaosMarkdown } from "./chaos";

const { seed, numRuns } = fuzzRunConfig();
// Replay coordinates — the deep-job summary greps this exact prefix (spec §5:
// seed + numRuns + fast-check version must be recoverable from CI output).
// (ESM: no bare require) — createRequire for the version lookup.
import { createRequire } from "node:module";
const fcVersion = createRequire(import.meta.url)("fast-check/package.json").version as string;
// eslint-disable-next-line no-console
console.log(`FUZZ-CONFIG seed=${seed} numRuns=${numRuns} fast-check=${fcVersion}`);

describe("Tier 1 robustness — chaos inputs", () => {
  it("parseSheet never throws, is deterministic, and returns a structurally valid ParsedSheet", () => {
    fc.assert(
      fc.property(chaosMarkdown, (md) => {
        const a = parseSheet(md, "fuzz.md");   // never throws (property fails on throw)
        const b = parseSheet(md, "fuzz.md");
        assertParsedSheetShape(a);
        JSON.stringify(a);                      // JSON-round-trippable
        // determinism via the oracle's boolean comparators (oracle.ts:45-48):
        // payloadChanged(a,b) diffs payloads, signalEq(a,b) diffs the three
        // signal channels — both use the toEqual-parity canon(). Do NOT use
        // fingerprint() here: it returns a 16-char hash for EVERY input pair
        // (never an empty string), so hash-length checks are meaningless.
        if (payloadChanged(a, b) || !signalEq(a, b))
          throw new Error("parseSheet nondeterministic on identical input");
      }),
      { seed, numRuns, verbose: 2 },
    );
  }, 120_000);
});
```

(Adjust the `fingerprint` call signature to its real export shape — read `tests/parser/mutation/oracle.ts:103-112` first; if it takes the full ParsedSheet, compare `fingerprint(a)`/`fingerprint(b)` directly. Vitest timeout 120s is the Tier-1 "bounded" property — a catastrophic-backtracking regression trips it.)
- [ ] **Step 6: Run — PASS** (`pnpm vitest run tests/parser/fuzz/robustness.fuzz.test.ts`, note wall time — record in commit message).
- [ ] **Step 7: Commit** `test(parser): chaos arbitrary + Tier-1 robustness properties over hostile markdown`

---

### Task 4: dials.ts registry + DialChoices + walker meta-test

(Ordered BEFORE model.ts so Task 5 can import `DialChoices` from an existing module — no forward dependency.)

**Files:**
- Create: `tests/parser/fuzz/dials.ts`, `tests/parser/fuzz/_metaDialRegistry.test.ts`

**Interfaces:**
- Produces: `type DialChoices = { dateFormat: "slash" | "dash" | "iso" | "longMDY" | "longDMY"; dimsFormat: "unit" | "bare" | "unicode"; crewSectionToken: "CREW" /* Phase 1: CREW only — TECH routes to parseTechBlock (crew.ts:64-66,214+) which expects a DIFFERENT layout (Name - Role merged col0, no email); a TECH dial value needs its own layout template + oracle rules, deferred to Phase 1.5 with the other layout-family deferrals (spec §3.2 (token,layout) pairing) */; crewHeader: "labeled" | "permuted" | "headerless"; sectionOrder: number /* permutation index over model.sections */; blankPadding: 1 | 2 | 3; headerTypo: null | { section: "long" | "short"; which: string }; dayRestrictionOn: boolean }`; `DIAL_REGISTRY: ReadonlyArray<{ name: string; contractFile: string; contractSymbol: string; note?: string; key: keyof DialChoices | null; arbitrary: fc.Arbitrary<unknown> | null }>` — the spec-normative row shape (`{name, contractFile, contractSymbol, note?, arbitrary}` spec §3.2) plus `key` binding each row to its `DialChoices` field. `dialChoices: fc.Arbitrary<DialChoices>` is COMPOSED FROM the registry (`fc.record` over the keyed rows' arbitraries) — the registry row IS the source of each dial's range, so ranges cannot drift from their contract rows. `key: null` rows are model-side contracts (address) or pure guards (short-vocab exclude); their `arbitrary` is the model-side generator or null for guards. (`sectionHeader` dial = `crewSectionToken` — crew is the only multi-token opener in Phase 1; room-section variation rides `RoomModel.kind`; `dimsFormat` maps to the three `DIMS_FULL_SRC` shapes.)

Registry rows (from spec §3.2 dial table — contractFile/contractSymbol per row):

| name | contractFile | contractSymbol | note | key |
|---|---|---|---|---|
| sectionHeader | lib/parser/blocks/crew.ts | SECTION_HEADER_TOKENS | (token,layout) pairs; hotels Phase 1 = structured HOTEL only | crewSectionToken |
| headerTypo-long | lib/parser/sectionHeaderNormalize.ts | LONG_SECTION_VOCAB | long-vocab typos label-only OK | headerTypo |
| headerTypo-short | lib/parser/sectionHeaderNormalize.ts | SHORT_SECTION_VOCAB | short-vocab typos require field-band row; never composes with headerless | headerTypo (shared key with -long; meta-test allows N rows per key) |
| headerTypo-short-exclude | lib/parser/sectionHeaderNormalize.ts | SHORT_SECTION_VOCAB_EXCLUDE | guard row: typo dial must never emit an excluded plural | null (guard) |
| dateFormat | lib/parser/blocks/_helpers.ts | normalizeDate | | dateFormat |
| dimsFormat | lib/parser/blocks/_dimsToken.ts | DIMS_FULL_SRC | | dimsFormat |
| crewColumns | lib/parser/blocks/crew.ts | CREW_COLUMN_VOCAB | headerless = positional defaults, warning expected + full round-trip | crewHeader |
| dayRestriction | lib/parser/personalization.ts | PAREN_ONLY_PATTERN | sole producer of restriction clauses | dayRestrictionOn |
| sectionOrder | lib/parser/index.ts | parseSheet | structural: blocks scan whole doc, order-independent given ≥1 blank-line separation | sectionOrder |
| blankPadding | lib/parser/index.ts | parseSheet | structural: 1–3 blank rows; 0 out of contract (exporter join("\n\n")) | blankPadding |
| address | lib/parser/blocks/hotels.ts | STREET_ADDRESS_RE | suffix-bearing only; ZIP-tail regex is discriminator-only | null (model-side; `arbitrary` = the address generator model.ts consumes) |

- [ ] **Step 1: Write the failing meta-test** (`_metaDialRegistry.test.ts`): for every `DIAL_REGISTRY` row — (a) `existsSync(contractFile)` from repo root; (b) file content matches `new RegExp(String.raw`^\s*(export\s+)?(const|let|function|class|type)\s+${escapeRegExp(contractSymbol)}\b`, "m")` (declaration match, not string mention); (c) rows anchored on `parseSheet` have non-empty `note`. Plus fails-by-default coverage BOTH directions: every key of `DialChoices` (via a literal key list kept next to the type, asserted equal to `Object.keys` of a sample) appears in ≥1 row's `key`, AND every non-null row `key` is a real `DialChoices` key — a new dial key without a registry row fails, and a stale row fails. Every keyed row has non-null `arbitrary`; `dialChoices` composition from the registry is asserted: `dialChoices` is literally built via the exported `buildDialChoices(DIAL_REGISTRY)` helper. Duplicate-key semantics (headerTypo has two keyed rows): rows sharing a `key` each carry an arbitrary over the SAME field type; `buildDialChoices` unions them with `fc.oneof(...rowArbs)` — grouping is by key, order-independent, and the helper throws if any keyed group is empty or a keyed row's arbitrary is null.
- [ ] **Step 2: Run — FAIL.** `pnpm vitest run tests/parser/fuzz/_metaDialRegistry.test.ts`
- [ ] **Step 3: Implement `dials.ts`** (type + registry + `dialChoices` arbitrary; composition exclusion headerTypo(short)×headerless enforced in `validateGeneratedCase` (Task 5) — dials.ts declares data only).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `test(parser): dial registry with declaration-matched contract citations + walker meta-test`

---

### Task 5: model.ts — ShowModel arbitraries + validateGeneratedCase

**Files:**
- Create: `tests/parser/fuzz/model.ts`
- Test: `tests/parser/fuzz/model.test.ts`

**Interfaces:**
- Produces:
  - `type SectionKind = "crew" | "hotels" | "rooms" | "venue" | "dates"`
  - `type ShowModel = { version: "v4"; year: number; dates: { travelIn: IsoDate; showDays: IsoDate[]; travelOut: IsoDate }; crew: CrewModel[]; hotels: HotelModel[]; rooms: RoomModel[]; venue: { name: string; address: string }; sections: SectionKind[] }` — `sections` is the ORDERED list of present sections (spec §3.1 presence/content coupling: always contains crew/venue/dates; contains hotels/rooms iff their list is non-empty; `dials.sectionOrder` permutes THIS list at render). `CrewModel = { name: string; role: string; phone: string; email?: string; dayRestriction?: IsoDate[] }`, `HotelModel = { name: string; address: string; guests: string[] }`, `RoomModel = { kind: "GENERAL SESSION" | "BREAKOUT" | "ADDITIONAL ROOM" | "LUNCH ROOM"; name: string; dims: { w: number; d: number } }`.
  - `showModel: fc.Arbitrary<ShowModel>`
  - `validateGeneratedCase(model: ShowModel, dials: DialChoices): void` (throws on violation)
  - `mdToken(d: IsoDate): string` (yearless `M/D`), `renderDateToken(d: IsoDate, fmt: DialChoices["dateFormat"]): string`
- Consumes: `DialChoices` from `./dials` (Task 4 — already exists).

Construction rules (spec §3.1, all enforced in the arbitrary AND re-checked by `validateGeneratedCase`):

1. Identity serials: every identity string embeds a unique token — LETTERS ONLY (spec §3.1 letter-safe; the hotel guest tokenizer `hotels.ts:185` `/[\p{L}][\p{L}\p{M}.'\- ]*?/` accepts no digits in names — a digit-bearing name truncates at the digit). Serials are FIXED-WIDTH letter codes: index → base-26 two-letter code (`AA`, `AB`, …, fixed width so no serial is a prefix of another) with a section prefix letter — crew `QAA`/`QAB`, hotels `HAA`, rooms `RAA` (uppercase, inside `roomHeaderNameShape`), venue `VAA`. Names like `Amara QAB Quinn` via `fc.uniqueArray` over a letter-name arbitrary + stamped serial. Same pattern for hotel names (`Harborview HAA Hotel`), room names (`ALPINE RAA`, uppercase to satisfy `roomHeaderNameShape` `rooms.ts:134-152`), venue (`Vantage VAA Center`). Substring-disjointness follows from the fixed-width serials; the gate re-checks pairwise.
2. Role vocab: fixed clean list `["Video Engineer", "Audio A2", "LED Tech", "Camera Op", "Graphics Op"]` — screened: no `ONLY`, no `***`, no `\d{1,2}/\d{1,2}`, no parens, and NO stage-clause words (Load In / Set / Strike / Load Out / Show are the stage-restriction grammar tokens — `parseStageClause` `lib/parser/personalization.ts:162-195` — so none of them may appear in a role; the screen is asserted in the model test, not just eyeballed).
3. Dates: pick `year ∈ [2020,2035]`, pick 3–6 distinct month/day pairs in that year, sort; first = travelIn, last = travelOut, middle = showDays. Distinct days ⇒ ISO, rendered, and `M/D` tokens all unique (invariant g).
4. `dayRestriction` (optional per crew member): non-empty subset of `showDays` — rendered later by the `dayRestriction` dial as `(<M/D> & <M/D> ONLY)` appended to the role cell (grammar: `PAREN_ONLY_PATTERN` `personalization.ts:58`; expected parse `{kind:'explicit', days:[mdToken(...)]}`).
5. Guests: partition — each crew name appears in ≤1 hotel's guest list (invariant b).
6. Phones: `fc.integer`-derived `AAA-BBB-CCCC` strings; emails lowercase `q<n>@fuzz.example` (canonicalize()-stable, so oracle equality is trivially canonical).
7. Addresses: US suffix-bearing per `STREET_ADDRESS_RE` `hotels.ts:319-320` — template `<n> <StreetName> <Suffix>` with suffix drawn from the regex's own list (`St`, `Ave`, `Blvd`, `Crescent`, `Mews`, …) and `<StreetName>` letter-only.
8. `validateGeneratedCase` throws `GeneratorInvariantViolation` naming the invariant letter (a–g) — each invariant is a separately testable function.

- [ ] **Step 1: Write failing tests** — for each invariant (a)–(g): one passing sample (use `fc.sample(showModel, {seed: 1, numRuns: 25})` — all satisfy `validateGeneratedCase` with a default all-dials-off `DialChoices`), and one hand-built violating model per invariant asserting the gate throws with the invariant letter (e.g. duplicate crew name → `/invariant \(a\)/`; guest in two hotels → `(b)`; role `"Rigger 4/7 ONLY"` → `(c)`; year 2050 → `(d)`; hotels non-empty but sections omit hotels → `(f)`; two dates same day → `(g)`).
- [ ] **Step 2: Run — FAIL.** `pnpm vitest run tests/parser/fuzz/model.test.ts`
- [ ] **Step 3: Implement `model.ts`.**
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `test(parser): ShowModel arbitraries + validateGeneratedCase honesty gate (invariants a-g)`

---

### Task 6: render.ts — deterministic serialization

**Files:**
- Create: `tests/parser/fuzz/render.ts`
- Test: `tests/parser/fuzz/render.test.ts`

**Interfaces:**
- Consumes: `ShowModel`, `DialChoices`, `renderDateToken` (Task 4/5).
- Produces: `renderCase(model: ShowModel, dials: DialChoices): string`.

Section templates — copied from the live fixture `fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md` (verbatim shapes verified in the pre-draft pass; re-grep before implementing):

- **v4 scaffold (byte-constant, always rendered LAST — after the final planted section and a blank line; placement is fixed, not dialed):** marker label rows for `contact` + `rental` blocks (`V4_BLOCKS` `schema.ts:91-94`): rows `| CONTACT OFFICE | 000-000-0000 |`, `| CONTACT CELL | 000-000-0000 |`, `| CONTACT EMAIL | scaffold@fuzz.example |`, `| RENTAL PICKUP | TBD |`, `| RENTAL RETURN | TBD |`. Byte-identical across every case. FIRST TEST of this task (ordering of tests, not of output): parse the scaffold alone + assert `classifyVersion` confident-v4 and zero rooms/crew/hotels payload (guards the fabrication concern before anything composes).
- **DATES (5-col v4):** `| DATES | | DAY | DATE | TIME |` header; rows `| | TRAVEL IN | <weekday> | <renderDateToken(travelIn, fmt)> | |`, `| | SHOW DAY <n> | <weekday> | <token> | |`, `| | TRAVEL OUT | ... |`. Weekday computed from the ISO date (`Intl` or manual table — must be CORRECT; a wrong weekday is an unplanted inconsistency).
- **CREW:** the parser ALWAYS consumes the section's first line as the header row and starts data at `i = 1` (`crew.ts:140-167`) — so "headerless" means "header row with NO recognized column labels", never "data in row 0". Three `dials.crewHeader` variants: labeled `| CREW | NAME | ROLE | PHONE | EMAIL |`; permuted (the four vocab labels permuted, data cells permuted identically); headerless `| CREW | | | | |` (label-only row 0 — `detectColumns` recognizes nothing, positional fallback fires, data rows still start at row 1 with name/role/phone in positional columns 1/2/3 per `crew.ts:80-84`). All crew data rows are `| | <name> | <role> | <phone> | <email?> |`. Role cell gets ` (<M/D> & <M/D> ONLY)` appended when that member has `dayRestriction` and `dials.dayRestrictionOn`.
- **VENUE:** `| VENUE | VENUE NAME | <name> |` + `| | VENUE ADDRESS | <address> |`.
- **HOTEL (structured):** copy the fixture's exact reservation-column shape (`fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md:66-74`; opener gate `hotels.ts:381-384`): `| HOTEL | RESERVATION #1 | ... |` header, then label/value row pairs — `Hotel Name / Address` → `<name> <address>` (glued cell; `splitHotelNameAddress` separates on the suffix-bearing street), `Names on Reservation` → ALL guests in ONE cell as `<Guest1> - #<conf1> <Guest2> - #<conf2>` (the parser consumes a single value row after the label, `parseHotelTable` `hotels.ts:468-527`, and glue-splits the multi-guest cell `hotels.ts:129-151` — one-guest-per-row is NOT the parsed shape), `Check In Date`/`Check Out Date` → date cells. Conf numbers are generator serials (`#3<six digits>`), unique per guest, screened by the identity-disjointness gate.
- **ROOMS:** each kind has its OWN admitted header shape — enumerate ALL FOUR from `rooms.ts` before implementing (v4 gates live around `rooms.ts:640-760`): BREAKOUT requires a NUMBERED header `^BREAKOUT \d` (`rooms.ts:689-695`) so render emits `BREAKOUT <n> <name> <dims> Floor 1`; GENERAL SESSION / ADDITIONAL ROOM / LUNCH ROOM per their gate lines (grep each token's gate; ADDITIONAL ROOM is content-gated like BREAKOUT — a room must carry real dims and/or populated fields to survive the placeholder rejection). Dims via the dial's format: `50' x 40'`, `50 x 40`, `50′ × 40′` (`DIMS_FULL_SRC` `_dimsToken.ts:40-47`). Header cell followed by structured bare-label rows (`SETUP`, `SET TIME`, `SHOW TIME`, `STRIKE TIME`, `AUDIO`, `VIDEO`, `LIGHTING`, `SCENIC`, `POWER`, `DIGITAL SIGNAGE`, `OTHER`, `NOTES`) each as `| <LABEL> | |`, with at least one populated field so `roomHasContent` admits it. **Anchor test (g) below covers ALL FOUR kinds, one room each — not just GENERAL SESSION** (a kind whose render shape misses its gate must fail at the anchor, not surface later as Tier-2 generator overreach).
- **Assembly:** sections ordered per `dials.sectionOrder` permutation, joined with `"\n".repeat(dials.blankPadding + 1)` wait — joined with `1 + blankPadding` newlines is wrong arithmetic; a "blank row" between sections means `"\n\n"` minimum (one blank line). Use `sections.join("\n" + "\n".repeat(dials.blankPadding))` and unit-test that `blankPadding=1` yields exactly one empty line. Scaffold appended last, after a blank line.

- [ ] **Step 1 (TDD anchor tests, failing first):** deterministic unit tests, no fast-check — fixed model + fixed dials per section: (a) scaffold-only guard test above; (b) plant 2 crew (one with restriction) → `parseSheet` returns both names verbatim, roles cleaned, restriction `{kind:'explicit', days:[...mdTokens]}`; (c) headerless variant → `CREW_COLUMN_POSITIONAL_FALLBACK` warning fires AND both crew round-trip; (d) dates → travelIn/showDays/travelOut ISO-equal; (e) venue name+address; (f) 1 hotel + 2 guests round-trip; (g) FOUR room anchors — one per kind (GENERAL SESSION, `BREAKOUT 1`, ADDITIONAL ROOM, LUNCH ROOM), each round-tripping name+dims; (h) render is deterministic (two calls byte-equal); (i) blankPadding=1 emits exactly one blank line between sections.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `render.ts`.** Iterate until anchors pass — if an anchor cannot pass because the parser genuinely rejects an in-contract shape, STOP: that is either a render-template bug (most likely — recheck the fixture) or a real parser finding (then: record it, fix via TDD in a separate commit, class-sweep).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `test(parser): fuzz render templates (fixture-derived) + deterministic section anchors`

---

### Task 7: groundTruth.ts — plant-and-find oracle

**Files:**
- Create: `tests/parser/fuzz/groundTruth.ts`
- Test: `tests/parser/fuzz/groundTruth.test.ts`

**Interfaces:**
- Consumes: `ShowModel`, `DialChoices`, `ParsedSheet`, `mdToken`/`renderDateToken` (Task 4), `canonicalize` (`lib/email/canonicalize.ts`).
- Produces: `checkPlantAndFind(model: ShowModel, dials: DialChoices, parsed: ParsedSheet): { ok: true } | { ok: false; misses: string[] }`.

Implements spec §4.2 exactly:

1. Precondition: `parsed.hardErrors.length > 0` → `{ok:false}` listing the codes (never absolution).
2. Field-complete matrix (spec §4.2 table): crew name/role/phone verbatim-canon, email `canonicalize()` equality, dayRestriction `M/D` multiset via `mdToken`, dates ISO-equal, rooms name + numeric dims, hotels name + address split (`STREET_ADDRESS_RE` shapes must split: parsed `hotel_name`/address fields — read the actual `ParsedSheet` hotel field names from `types.ts` before coding), guests multiset, venue name+address. One-to-one matching: match greedily by identity serial, consume matched rows.
3. Attribution on miss: (t1) same-section warning with `blockRef.iso` domain-aware match / `blockRef.name` identity match / message+context boundary-delimited identity-value containment; NO bare `blockRef.index`; (t2) section-structural allowlist — initial contents: the empty-section warn codes ONLY (enumerate from `lib/parser/warnings.ts` / `emitEmptySection` call sites at implementation time; each entry gets a justification comment). `CREW_COLUMN_POSITIONAL_FALLBACK` explicitly NOT listed — headerless dial requires round-trip; (t3) `raw_unrecognized` same-block + identity containment.
4. Zero-fabrication: for each modeled section with zero planted entities → parsed section payload empty, no absolution.
5. Date matchers domain-aware: full-token match rejects adjacent `/`/digit; `M/D` match rejects following `/digit`.

- [ ] **Step 1 (failing tests, anti-tautology by construction):** feed HAND-BUILT parsed objects, not real parses — (a) perfect parse of a 2-crew model → ok; (b) same but one crew member deleted from parsed, no signals → miss naming that serial; (c) deleted + unrelated same-section warning (code X, blockRef `{kind:"crew", index:0}`, context without the name) → STILL a miss (bare-index + wrong-value cannot absolve); (d) deleted + warning whose message contains the full name → absolved; (e) deleted + `raw_unrecognized` row in ANOTHER block containing the name → still a miss (section scope); (f) hotel guests subset (1 of 2) no signal → miss; (g) `hardErrors: [{code:"VERSION_AMBIGUOUS",...}]` → fail regardless; (h) zero-rooms model but parsed rooms non-empty → fabrication failure; (i) `Ann`/`Annette` control: identity `Ann Q1 Roe` planted; warning containing `Ann Q1 Roeder`-like superstring must NOT absolve (boundary match); (j) restriction `M/D` matcher rejects `3/24` found inside `3/24/2026`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `test(parser): plant-and-find ground-truth oracle (field matrix + scoped attribution)`

---

### Task 8: Tier-1 over model-rendered + Tier-2 property + sabotage sensitivity

**Files:**
- Modify: `tests/parser/fuzz/robustness.fuzz.test.ts` (add model-rendered Tier-1 block)
- Create: `tests/parser/fuzz/plantAndFind.fuzz.test.ts`

**Interfaces:** consumes everything above.

- [ ] **Step 1: Add model-rendered Tier-1 property** — same assertions as chaos Tier-1 but over `fc.tuple(showModel, dialChoices)` → `validateGeneratedCase` → `renderCase` → parse. Run: PASS expected (fails only on a real parser bug — triage per spec §6).
- [ ] **Step 2: Write the Tier-2 property:**

```ts
import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { parseSheet } from "@/lib/parser";
import { fuzzRunConfig } from "./seeds";
import { showModel, validateGeneratedCase } from "./model";
import { dialChoices } from "./dials";
import { renderCase } from "./render";
import { checkPlantAndFind } from "./groundTruth";

const { seed, numRuns } = fuzzRunConfig();

describe("Tier 2 plant-and-find", () => {
  it("every planted entity round-trips or an attributable signal fires", () => {
    fc.assert(
      fc.property(showModel, dialChoices, (model, dials) => {
        validateGeneratedCase(model, dials); // throws = generator bug, not parser finding
        const parsed = parseSheet(renderCase(model, dials), "fuzz.md");
        const verdict = checkPlantAndFind(model, dials, parsed);
        if (!verdict.ok) throw new Error(`plant-and-find misses:\n${verdict.misses.join("\n")}`);
      }),
      { seed, numRuns, verbose: 2 },
    );
  }, 300_000);
});
```

- [ ] **Step 3: Run.** If it fails: shrunk case is either a render-template bug (fix render, re-run) or a REAL parser finding — commit the counterexample under `regressions/` (Task 9 harness), triage per spec §6 (fix parser TDD, or `// contract-narrowed:` + BACKLOG).
- [ ] **Step 4: Sabotage sensitivity test (spec success criterion 3 — proves the oracle is not tautological)** in the same file. Sabotage must be BOTH silent (no warning the oracle could attribute) AND payload-corrupting; cell-swap can emit attributable warnings, so don't use it. Instead sabotage the ORACLE'S INPUT, not the markdown: render + parse a fixed 3-crew case normally (green path — zero warnings, verified by the anchor tests), then hand the oracle a `parsed` object whose `crewMembers[1].phone` digits are altered and whose warnings array is UNTOUCHED (still empty of crew signals) — `expect(checkPlantAndFind(model, dials, tampered).ok).toBe(false)`. This simulates exactly the P0-2 class (confident wrong value, zero signal) end-to-end at the oracle boundary. Concrete failure mode caught: a future oracle refactor that stops comparing field values (e.g., matches on name only) turns Tier 2 vacuous — this test fails then. Second variant: delete `crewMembers[2]` entirely (still no signals) → must also be `ok: false`.
- [ ] **Step 5: Run — PASS. Record total fuzz-suite wall time; must be < 60 s (Global Constraints). If over: reduce per-property numRuns is FORBIDDEN (spec pins 100); instead profile render/oracle overhead.**
- [ ] **Step 6: Commit** `test(parser): Tier-1 model-rendered + Tier-2 plant-and-find properties + sabotage sensitivity`

---

### Task 9: regressions/ replay harness

**Files:**
- Create: `tests/parser/fuzz/regressions/index.test.ts`, `tests/parser/fuzz/regressions/cases.ts`

**Interfaces:**
- Produces: `REGRESSION_CASES: ReadonlyArray<{ id: string; markdown: string; expect: "tier1" | { model: ShowModel; dials: DialChoices } }>` in `cases.ts` (starts EMPTY); `index.test.ts` replays each: `tier1` cases through the Tier-1 assertions, model cases through `checkPlantAndFind`. No fast-check dependency at replay time (plain explicit inputs, spec §6).

- [ ] **Step 1: Failing test** — with a temporary in-test sample case (a copy of a Task 6 anchor input), assert the harness executes it; also assert `REGRESSION_CASES` array exists (empty OK) and every entry has a unique `id`.
- [ ] **Step 2: Run — FAIL. Step 3: Implement. Step 4: Run — PASS (sample case removed from cases.ts, kept in the test file as the harness self-check).**
- [ ] **Step 5: Commit** `test(parser): fuzz regression replay harness (explicit-input, fast-check-free)`

---

### Task 10: nightly deep job (x-audits.yml) + docs

**Files:**
- Create: `tests/parser/fuzz/_metaDeepJob.test.ts` (structural pin for the workflow wiring)
- Modify: `.github/workflows/x-audits.yml` (new job `parser-fuzz-deep`)
- Modify: `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` (§7 item 5: mark fuzz half shipped, cite this spec/plan)

- [ ] **Step 1: Write the failing structural test** — `_metaDeepJob.test.ts` reads `.github/workflows/x-audits.yml` as text and asserts: (a) a `parser-fuzz-deep:` job key exists; (b) its `if:` line matches `github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'`; (c) the job body invokes `test:fuzz:deep`; (d) the summary step greps for `FUZZ-CONFIG` (so the replay-coordinate contract can't be silently dropped in a later workflow edit). Text-level assertions on the committed YAML — same pattern as other structural pins; run `pnpm vitest run tests/parser/fuzz/_metaDeepJob.test.ts`, expect FAIL (no job yet).

- [ ] **Step 2: Add the job** (template mirrors `x1-catalog-parity` `:81-121`, but schedule/dispatch-gated):

```yaml
  parser-fuzz-deep:
    # Deep property-fuzz exploration (spec 2026-07-09-parser-property-fuzz §5).
    # Random seed each run; failures print seed + shrunk counterexample —
    # replay locally: FUZZ_DEEP=1 FUZZ_SEED=<seed> FUZZ_NUM_RUNS=<numRuns> pnpm test:fuzz
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Deep fuzz run
        shell: bash
        run: |
          set -o pipefail
          pnpm test:fuzz:deep 2>&1 | tee parser-fuzz-deep.log
      - name: Surface replay coordinates in summary
        if: always()
        shell: bash
        run: |
          { echo '## parser-fuzz-deep'; grep -E "FUZZ-CONFIG|seed|numRuns|Counterexample|Shrunk" parser-fuzz-deep.log | head -60; } >> "$GITHUB_STEP_SUMMARY" || true
      - name: Upload log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: parser-fuzz-deep-${{ github.run_id }}-${{ github.run_attempt }}
          if-no-files-found: warn
          path: parser-fuzz-deep.log
```

- [ ] **Step 3: Run the structural test — PASS.** Then validate workflow syntax: `command -v actionlint && actionlint .github/workflows/x-audits.yml` (and `gh workflow list` after push).
- [ ] **Step 4: Update the audit doc** §7 item 5 status line: fuzz half shipped (leave provenance-model half open).
- [ ] **Step 5: Commit** `infra: nightly parser-fuzz-deep job (schedule + workflow_dispatch) + structural pin + audit-doc status`

---

### Task 11: full-suite close-out gates

- [ ] **Step 1:** `pnpm test` — full suite green (fuzz suite total < 60 s within it).
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm format:check` — all green (`--no-verify` commits skipped hooks; CI `quality` runs all three).
- [ ] **Step 3:** Re-run BOTH admin structural meta-tests if any scanned surface was touched (they weren't — fuzz lives under tests/; verify with `git diff --stat origin/main..HEAD -- lib/ app/` = empty unless a parser bug was fixed).
- [ ] **Step 4:** Commit any stragglers; branch ready for whole-diff adversarial review.

**Post-merge close-out (recorded here; executes after merge):** trigger `gh workflow run x-audits.yml` and verify the `parser-fuzz-deep` job goes green on real CI (local-passes-CI-fails discipline; the job is dispatch-gated so this works immediately).

## Self-review checklist (run after drafting — done 2026-07-09)

- Spec coverage: §3 files → Tasks 1–7,9; §4.1 → Tasks 3,8; §4.2 → Tasks 7,8; §5 → Tasks 1,10,11; §6 → Task 9 + Task 8 step 3; §8 meta-test → Task 5; §9 success criteria → criterion 1 Task 11, criterion 2 Task 10 post-merge, criterion 3 Task 8 step 4, criterion 4 Task 5, criterion 5 Task 1 (devDep) + Task 11 diff check.
- Anti-tautology: Task 7 tests use hand-built parsed objects (oracle tested against its spec, not against the parser); Task 8 step 4 proves end-to-end sensitivity; expected values derive from the model, never hardcoded from parser output.
- Type consistency: `fuzzRunConfig`/`showModel`/`dialChoices`/`renderCase`/`checkPlantAndFind`/`validateGeneratedCase` names identical across tasks.
- No layout-dimensions/transition tasks: no UI in scope.
