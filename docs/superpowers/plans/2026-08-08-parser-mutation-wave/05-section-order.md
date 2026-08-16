# Branch 5: feat/mutation-section-order — venue-scope hardening + contract ratification

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Read [00-overview.md](./00-overview.md) first — Stage 0 (worktree, claim `BL-MUTATION-SECTION-ORDER`, marker, push) precedes Task 1. Branches 1-4 merged.

**Goal:** Make unknown-field emission coverage a function of block identity rather than document position (spec §7.2), closing the 10 real-loss rows; re-map the 72 ratified rows to a documented finding (spec §7.4).

**Hard constraints (spec §7.2, verbatim):** (a) unreordered corpus emission multiset IDENTICAL to today's; (b) multiset preserved under any adjacent-block swap; (c) no new warn code — existing `UNKNOWN_FIELD` code and `{block:"venue", ...}` keys verbatim. If (a) proves unreachable, STOP the branch and ratify the delta explicitly before landing.

## Acceptance criteria

- **AC-S1:** A baseline signal-parity test pins today's per-fixture emission multiset across all 17 fixtures and stays green after the refactor.
- **AC-S2:** The 10 probe-named swaps (rpas-central B14/B15/B19, asset-mgmt B14/B15, ria B3/B4/B7/B8, consultants-roundtable B22 — ledger probe §2.3) preserve the signal multiset post-fix.
- **AC-S3:** `OPERATOR_FINDING_MAP["section-reorder"]` re-maps to a documented-finding ref accepted by `knownHoles.test.ts`; the 72 ratified rows stay; only the 10 rows delete; backlog row closes with the documented-limit note.
- **AC-S4:** Full harness green (four buckets empty); no live render change on any surface.

<!-- tasks: depth=3 -->

### Task 1: Baseline signal-parity pin (BEFORE any refactor)

<!-- task: red=`pnpm exec vitest run tests/parser/venueSignalParity.test.ts` ac=AC-S1 -->

**Files:**
- Create: `tests/parser/venueSignalParity.test.ts`

- [ ] **Step 1: Write and run GREEN against the CURRENT parser** (this is a pin, not a RED — its red state is Task 2's refactor breaking parity):

```ts
// tests/parser/venueSignalParity.test.ts
// Spec §7.2(a): the venue-scope hoist must not change ONE emission on the unreordered
// corpus. Multiset of signal keys per fixture, snapshot-pinned. Failure mode caught:
// the refactor silently widening or narrowing the unknown-field coverage window.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseSheet } from "@/lib/parser";
import { signalKeys } from "@/tests/parser/mutation/oracle";

const multiset = (md: string, name: string): string =>
  [...signalKeys(parseSheet(md, name)).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}x${n}`)
    .join("\n");

// r1 F8: an EXPLICIT committed baseline, not toMatchSnapshot() - a missing snapshot
// (or any -u run) silently re-pins, which is the exact failure mode this gate exists
// to prevent. Regenerate deliberately: UPDATE_VENUE_PARITY_BASELINE=1 vitest run <this file>.
const BASELINE = "tests/parser/__fixtures__/venueSignalParity.baseline.json";

describe("venue signal parity (spec §7.2a)", () => {
  const actual: Record<string, string> = {};
  for (const dir of ["fixtures/shows/exporter-xlsx", "fixtures/shows/raw"]) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
      actual[`${dir}/${f}`] = multiset(readFileSync(`${dir}/${f}`, "utf8"), f);
    }
  }
  if (process.env["UPDATE_VENUE_PARITY_BASELINE"]) {
    mkdirSync(dirname(BASELINE), { recursive: true }); // retro F5: tests/parser/__fixtures__/ does not exist yet
    writeFileSync(BASELINE, JSON.stringify(actual, null, 2));
  }

  it("baseline file exists and covers every fixture, and every multiset matches it", () => {
    const pinned = JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, string>;
    expect(Object.keys(pinned).sort()).toEqual(Object.keys(actual).sort());
    for (const [path, m] of Object.entries(actual)) {
      expect(m, path).toBe(pinned[path]);
    }
  });
});
```

- [ ] **Step 2:** Generate the baseline (`UPDATE_VENUE_PARITY_BASELINE=1 pnpm exec vitest run tests/parser/venueSignalParity.test.ts`), verify the test is GREEN without the env var, and commit BOTH files: `test(parser): pin per-fixture signal multisets before venue-scope hoist`

### Task 2: RED — swap-invariance test (the 10 real losses)

<!-- task: red=`pnpm exec vitest run tests/parser/venueSwapInvariance.test.ts` ac=AC-S2 -->

**Files:**
- Create: `tests/parser/venueSwapInvariance.test.ts`

- [ ] **Step 1: Write the failing test** — the ledger probe §2.3 reproduce block is the template; the 10 CASES are its REAL-LOSS rows:

```ts
// tests/parser/venueSwapInvariance.test.ts
// Spec §7.2(b): an adjacent-block swap must not change the signal multiset.
// These 10 swaps each extinguish warnings today (up to 120 -> 2, ledger probe §2.3).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { signalKeys } from "@/tests/parser/mutation/oracle";
import { premiseHolds } from "@/tests/_shared/premise";

const CASES: Array<[string, number[]]> = [
  ["fixtures/shows/raw/2025-03-dci-rpas-central.md", [14, 15, 19]],
  ["fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", [14, 15]],
  ["fixtures/shows/raw/2025-06-ria-investment-forum.md", [3, 4, 7, 8]],
  ["fixtures/shows/raw/2025-10-consultants-roundtable.md", [22]],
];

const mkeys = (m: Map<string, number>) =>
  [...m.entries()].sort().map(([k, n]) => `${k}x${n}`).join(",");

describe("venue swap invariance (spec §7.2b)", () => {
  for (const [path, pairs] of CASES) {
    const md = readFileSync(path, "utf8");
    const blocks = md.split(/\n\s*\n/);
    const base = mkeys(signalKeys(parseSheet(md, path)));
    for (const i of pairs) {
      it(`${path} swap B${i}<->B${i + 1} preserves the signal multiset`, () => {
        premiseHolds("swap index in range", blocks.length > i + 1);
        const swapped = [...blocks.slice(0, i), blocks[i + 1]!, blocks[i]!, ...blocks.slice(i + 2)].join("\n\n");
        expect(mkeys(signalKeys(parseSheet(swapped, path)))).toBe(base);
      });
    }
  }
});
```

- [ ] **Step 2: FAIL — all 10 cases** (today's positional scope drops warnings under these swaps).
- [ ] **Step 3 (retro F3, wiring corrected r5 — spec §7.2(b) says ANY adjacent swap, not ten):** the EXHAUSTIVE sweep lives in a NEW file `tests/parser/mutationHarness.venueSwapSweep.test.ts` — the `mutationHarness.*.test.ts` name is what the mutation project actually collects (`vitest.projects.ts:83`); a differently-named file would never execute under `--project mutation`. Same env-gate idiom as the shard files. It iterates the SEVENTEEN fixtures from `tests/parser/mutation/fixtures.ts` (NOT a raw directory walk — that picks up `exporter-xlsx/README.md` and inflates the count to 508), and for EVERY adjacent block pair i/i+1 (corpus total 497 swaps) asserts the post-fix signal multiset equals baseline. The 10 named cases stay in the ungated fast file `tests/parser/venueSwapInvariance.test.ts`; the exhaustive file is the spec-letter proof and runs with the harness project at branch close-out. The mutation harness alone is NOT equivalent (its oracle accepts a changed multiset when a stronger signal fires).

### Task 3: Hoist the unknown-field sweep

<!-- task: red=`pnpm exec vitest run tests/parser/venueSignalParity.test.ts tests/parser/venueSwapInvariance.test.ts tests/parser/blocks/venue.test.ts` ac=AC-S1,AC-S2 -->

**Files:**
- Modify: `lib/parser/blocks/venue.ts` — remove the `inVenueFieldScope` gating of the `emitUnknownField` branch (`venue.ts:314`; scope flag at `venue.ts:77`, terminators `venue.ts:81-99`). `parseVenue` keeps parsing venue FIELDS exactly as today; it stops being the document-tail unknown-field detector.
- Create: `lib/parser/unknownFieldSweep.ts` — the hoisted document-level pass.
- Modify: `lib/parser/index.ts` — call the sweep where block parsers finish (agg in hand).

**Mechanism (iterate until Task 1 parity is GREEN — that test, not this prose, is the authority):**

```ts
// lib/parser/unknownFieldSweep.ts
// Spec §7.2: emission coverage keyed on block identity, not document position.
// Replicates the EXACT emission set parseVenue's positional scope produced on the
// unreordered corpus (venueSignalParity.test.ts pins it), while being invariant
// under adjacent-block swaps: membership is "rows swept" computed per BLOCK from
// what it is (unrecognized col-0 within a swept block), never from where it sits.
import { emitUnknownField } from "@/lib/parser/warnings"; // the exact emitter parseVenue uses (venue.ts:4)
```

Implementation notes for the engineer (the parity snapshots arbitrate every choice):
1. Compute the swept-block set from block identity: a pipe-block is SWEPT unless its opening col-0 resolves to a venue canonical or it is the venue block itself, mirroring the current window's membership on the unreordered corpus. Start from the straight replication (walk rows exactly as `parseVenue` does — same `col0` derivation, same `VENUE_BLOCK_TERMINATORS` exclusion applied per-BLOCK, same `emitUnknownField(agg, { block: "venue", kind: "venue", key, value })` call) and diff against the parity snapshots.
2. Terminator blocks and everything ordered inside them: replicate by excluding rows of blocks whose OWN opening label is a terminator — not rows positioned after one.
3. If parity cannot be reached without a behavior change (e.g. an unrecognized block BEFORE the venue block on some fixture that today escapes the sweep), STOP per spec §7.2 — do not ship a delta; escalate for explicit ratification with the failing snapshot diff as evidence.

- [ ] **Step 1:** Implement; iterate until Task 1 (parity) AND Task 2 (swap invariance) are both green; `tests/parser/blocks/venue.test.ts` green (venue field parsing untouched).
- [ ] **Step 2: Commit** `feat(parser): hoist unknown-field sweep to block-identity coverage (venue scope)`

### Task 4: Re-map + ledger + PR

<!-- task: red=`pnpm exec vitest run tests/parser/mutation/knownHoles.test.ts` ac=AC-S3,AC-S4 -->

- [ ] **Step 1:** Delete EXACTLY these 10 rows from `RAW_HOLES` (the §2.3 real-loss siteIds):

```bash
perl -ni -e 'print unless /^section-reorder:(2025-03-dci-rpas-central:B1[459]|2025-04-asset-mgmt-cfo-coo:B1[45]|2025-06-ria-investment-forum:B[3478]|2025-10-consultants-roundtable:B22):/' tests/parser/mutation/knownHoles.ts
```

- [ ] **Step 2 (PINNED — r1 F4):** `OPERATOR_FINDING_MAP["section-reorder"]` KEEPS the exact string `"BL-MUTATION-SECTION-ORDER"` — no map value change. `knownHoles.test.ts:153` validates SHAPE only (audit #N or BL- id), and the umbrella precedent (its comment at `knownHoles.test.ts:135-138`) is that an ARCHIVED row keeps its id resolvable — this PR's backlog close moves the row to `BACKLOG-archive.md` carrying the §7 ratification + 72-row documented-limit note, exactly like `BL-MUTATION-HARNESS-OPEN-HOLES` before it. Update the map's inline comment from "parser order-sensitivity" to "documented: source order ratified (spec 2026-08-07 §7; archived row)" and the suite's comment to name the archive location.
- [ ] **Step 3:** Full harness: four buckets empty (72 section-reorder rows remain, documented; 10 gone). `knownHoles.test.ts` green.
- [ ] **Step 4:** Backlog: close `BL-MUTATION-SECTION-ORDER` (archive move carrying the §7 ratification + 72-row documented-limit note), remove the IN PROGRESS marker in the PR's last commit.
- [ ] **Step 5:** Full suite + typecheck + lint + format; PR (parity evidence, ledger-regeneration record, re-map, substitute-review deviation); merge; `0  0`. Wave complete: verify AC-W1 against the MEASURED census. **Amended 2026-08-16 (implementation):** the "10-row shrink" and the `≈1,107` replay are both refuted — the collected harness run closes 86 holes, opens 17, drifts 1,002 fingerprints, and the ledger is regenerated to **1,019** rows (section-reorder 59, all kind `wrong`). See `00-overview.md` AC-W1 and `docs/superpowers/specs/parser/probes/2026-08-16-newhole-mechanism.md`.

<!-- tasks: end -->
