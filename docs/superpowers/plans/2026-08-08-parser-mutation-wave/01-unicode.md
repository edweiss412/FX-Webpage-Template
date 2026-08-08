# Branch 1: feat/mutation-unicode — document-seam zero-width strip

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Read [00-overview.md](./00-overview.md) Global Constraints first — Stage 0 (worktree, claim `BL-MUTATION-UNICODE`, marker, push) precedes Task 1.

**Goal:** Close all 827 `unicode-inject` holes with one whole-document strip at `parseSheet` entry (spec §3).

## Acceptance criteria

- **AC-U1:** A ZWNJ injected into any data cell of any corpus fixture parses to output identical to the un-mutated baseline (verdict `ABSORBED`).
- **AC-U2:** `payloadOf(parseSheet(md))` contains no codepoint in `[​-‍﻿]` for every corpus fixture, and the guard's premise (fintech's 18 pre-existing ZWNJ + one seeded injection) executes unconditionally.
- **AC-U3:** All 827 `unicode-inject:` rows deleted from `RAW_HOLES`; full 8-shard harness green (all four buckets empty).
- **AC-U4:** `tests/parser/blocks/transport.test.ts` ZWNJ regression (line ~409) stays green untouched.

<!-- tasks: depth=3 -->

### Task 1: RED — seeded-ZWNJ absorption test

<!-- task: red=`pnpm exec vitest run tests/parser/payloadZeroWidth.test.ts` ac=AC-U1,AC-U2 -->

**Files:**
- Create: `tests/parser/payloadZeroWidth.test.ts`

**Interfaces:**
- Consumes: `parseSheet` (`lib/parser/index.ts:553`), `payloadOf` (`tests/parser/mutation/oracle.ts:11`), `premiseHolds` (`tests/_shared/premise.ts:36`).
- Produces: the spec §3.4 structural guard file later branches leave untouched.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/payloadZeroWidth.test.ts
// Spec §3.4: after the parseSheet-entry strip, no zero-width codepoint reaches payload.
// Failure mode caught: a cell-read path that bypasses the strip (or a future revert)
// silently re-admits invisible characters that defeat string equality.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { payloadOf } from "@/tests/parser/mutation/oracle";
import { premiseHolds } from "@/tests/_shared/premise";

const ZW = /[​-‍﻿]/;
const FIXTURE_DIRS = ["fixtures/shows/exporter-xlsx", "fixtures/shows/raw"];

const fixtures: Array<{ name: string; md: string }> = FIXTURE_DIRS.flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ name: `${d}/${f}`, md: readFileSync(`${d}/${f}`, "utf8") })),
);

function zwInPayload(md: string, name: string): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (typeof v === "string") {
      if (ZW.test(v)) hits.push(`${name} ${path}`);
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    }
  };
  walk(payloadOf(parseSheet(md, name)), "payload");
  return hits;
}

describe("payload zero-width freedom (spec §3.4)", () => {
  it("premise: the corpus and the seeded mutant both carry zero-width input", () => {
    // Premise 1: fintech.md carries 18 pre-existing ZWNJ (corpus probe §13.D).
    const fintech = fixtures.find((f) => f.name.endsWith("exporter-xlsx/fintech.md"));
    premiseHolds("fintech fixture carries raw ZWNJ", fintech !== undefined && ZW.test(fintech.md));
    // Premise 2: the seeded mutant used below is genuinely mutated.
    premiseHolds("seeded mutant carries ZWNJ", ZW.test(seedZwnj(fixtures[0]!.md)));
  });

  it("no corpus fixture leaks a zero-width codepoint into payload", () => {
    const hits = fixtures.flatMap((f) => zwInPayload(f.md, f.name));
    expect(hits).toEqual([]);
  });

  it("a seeded ZWNJ mid-cell is absorbed: payload equals the un-mutated baseline", () => {
    for (const f of fixtures) {
      const mutated = seedZwnj(f.md);
      expect(payloadOf(parseSheet(mutated, f.name))).toEqual(payloadOf(parseSheet(f.md, f.name)));
    }
  });
});

/** Inject U+200C into the middle of the first data cell with >= 2 chars (operator shape, operators.ts:85). */
function seedZwnj(md: string): string {
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("|") || /^\|\s*:?-+/.test(line)) continue;
    const cells = line.split("|");
    for (let c = 1; c < cells.length - 1; c++) {
      const t = cells[c]!.trim();
      if (t.length >= 2 && !/[​-‍﻿]/.test(t)) {
        const mid = Math.floor(t.length / 2);
        cells[c] = cells[c]!.replace(t, t.slice(0, mid) + "‌" + t.slice(mid));
        lines[i] = cells.join("|");
        return lines.join("\n");
      }
    }
  }
  throw new Error("no eligible cell found - premise violated");
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/parser/payloadZeroWidth.test.ts`
Expected: FAIL — the fintech fixture leaks ZWNJ into payload today (its cells bypass `clean()`), and seeded mutants change payload.

### Task 2: Implement the strip; tests green; ledger shrink

<!-- task: red=`pnpm exec vitest run tests/parser/payloadZeroWidth.test.ts` ac=AC-U1,AC-U2,AC-U3,AC-U4 -->

**Files:**
- Modify: `lib/parser/index.ts` (function `parseSheet`, entry at `lib/parser/index.ts:553`)
- Modify: `tests/parser/mutation/knownHoles.ts` (delete 827 rows)

- [ ] **Step 1: Add the strip as the FIRST statement of `parseSheet`, before `classifyVersion` (`index.ts:557`)**

```ts
export function parseSheet(markdown: string, filename?: string): ParsedSheet {
  // Spec 2026-08-07-parser-mutation-wave §3.1: strip zero-width characters from the
  // whole document before ANY read - including classifyVersion's label reads
  // (schema.ts:68,127), which run before the normalizeSectionHeaders seam. Same
  // character class clean() strips at the cell boundary; clean() keeps its strip.
  markdown = markdown.replace(/[​-‍﻿]/g, "");
  const hardErrors: ParseError[] = [];
  // ... existing body unchanged
```

- [ ] **Step 2: Run the new test — PASS.** `pnpm exec vitest run tests/parser/payloadZeroWidth.test.ts`
- [ ] **Step 3: Existing pins stay green:** `pnpm exec vitest run tests/parser/blocks/transport.test.ts tests/parser/mutation/negativeControls.test.ts`
- [ ] **Step 4: Delete the class's ledger rows**

```bash
perl -ni -e 'print unless /^unicode-inject:/' tests/parser/mutation/knownHoles.ts
pnpm exec vitest run tests/parser/mutation/knownHoles.test.ts
```

- [ ] **Step 5: Full 8-shard harness — expect ALL FOUR buckets empty (spec §9).** Any survivor (`fixedHoles` residue would have shown BEFORE deletion; `newHoles`/drift after) blocks the branch until explained — spec §3.3's expectation is exactly 827 closures, and a shortfall contradicts the ledger probe census.

```bash
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation
```

- [ ] **Step 6: Full suite + typecheck + lint + format (pre-push gates):** `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
- [ ] **Step 7: Commit**

```bash
git add lib/parser/index.ts tests/parser/payloadZeroWidth.test.ts tests/parser/mutation/knownHoles.ts
git commit -m "feat(parser): strip zero-width characters at parseSheet entry, closing all 827 unicode-inject holes"
```

### Task 3: Behavior-delta notes + PR

<!-- task: red=`pnpm exec vitest run tests/parser/payloadZeroWidth.test.ts tests/parser/mutation/knownHoles.test.ts` ac=AC-U3 -->

- [ ] **Step 1:** PR body records: spec §3.2 deltas (use-raw contentHash re-keys once on ZW-carrying sheets; `rawSnippet`/`sourceCell` render post-strip text), the substitute-review deviation (overview), and the ledger shrink count (7,842 → 7,015).
- [ ] **Step 2:** Remove the `BL-MUTATION-UNICODE` IN PROGRESS marker in the PR's last commit; close the backlog row (entry closes fully — zero residue expected; if residue emerged, the row records it per spec §11.5 instead of closing).
- [ ] **Step 3:** Verify the PR-head `mutation-harness` workflow run green; merge; fast-forward main; confirm `git rev-list --left-right --count main...origin/main` = `0  0`.

<!-- tasks: end -->
