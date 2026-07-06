# Parser Mutation-Testing Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CI-gating vitest harness that mutates the 17 committed parser fixtures with 8 operators (9 registered keys — `blank-row` emits `:inject` + `:remove`) and asserts every mutant is either parsed identically, signaled, or recorded in a bidirectional known-holes ledger — never silently wrong.

**Architecture:** Pure test-only modules under `tests/parser/mutation/`. A metamorphic oracle compares each mutant's `parseSheet` output against the pristine baseline (data payload + full signal channels). Header-anchored logical-section segmentation assigns each mutation site to a parser domain; a floor-first selection guarantees per-domain coverage; a behavior-fingerprinted ledger ratchets known holes bidirectionally; an implementation-independent applicability audit + golden inventory prevents self-referential coverage.

**Tech Stack:** TypeScript, vitest, `node:crypto` (sha256 digests). No product-source change; no new deps.

**Spec:** `docs/superpowers/specs/2026-07-06-mutation-testing-harness.md` (Codex-APPROVED, 17 rounds).

## Global Constraints

- **Zero product-source change; a dedicated nightly workflow is added (spec AC-5, amended 2026-07-06).** New test files live under `tests/parser/mutation/**` + `tests/parser/mutationHarness.test.ts`. Because Task 8 Step 1 measured the exhaustive corpus at ~50 min serial (101,795 mutants), Task 12 places the harness on a dedicated NIGHTLY workflow OFF the merge-gating fast path — editing `vitest.projects.ts` + `vitest.config.ts` to EXCLUDE the harness from the default/unit-suite discovery (opt-in via `VITEST_INCLUDE_MUTATION_HARNESS=1`), extending `tests/cross-cutting/vitest-projects-partition.test.ts` to pin that gating contract, and creating `.github/workflows/mutation-harness.yml` (`schedule:` + `workflow_dispatch:`). NO PRODUCT source (`lib/parser`, `app/`, `components/`, `supabase/`) is touched; the only non-`tests/` files are the two vitest-config modules (test-config surface) and the workflow YAML (CI infra). (History: R19–R21 x-audits placement → R22 unit-suite weighted merge-gate → 2026-07-06 nightly, once the real ~50-min runtime made any merge-gating placement infeasible without sampling. The R22 `lib/test/vitest.weights.ts` / `vitest-shard-balance.test.ts` edits are NOT made — the file leaves the sequencer's path.)
- **TDD per task:** failing test → minimal implementation → passing test → commit. Never implementation before its test.
- **Commit per task**, conventional-commits (`test(parser):` / `feat(parser):` / `chore(parser):`). One task per commit. Use `--no-verify` (shared lint-staged hook belongs to the main checkout).
- **Determinism:** no `Math.random`, no `Date.now`. All site enumeration is a deterministic top-to-bottom scan.
- **Import surface from the parser (read-only):** `parseSheet` (`@/lib/parser`, `lib/parser/index.ts:516`), `ParsedSheet`/`ParseWarning`/`ParseError` (`@/lib/parser/types`, `types.ts:371,4,22`), `normalizeHeader`/`KNOWN_SECTION_HEADERS`/`PREFIX_SECTION_FAMILIES` (`@/lib/parser/knownSections`, `knownSections.ts:24,34,79`). `matchesTokenPrefix` is NOT exported — replicate its rule (`knownSections.ts:155-161`).
- **PII-safe:** free-text/PII values are only ever stored as `sha256(normalize(v)).slice(0,12)` digests in the committed ledger, never raw.
- **`@/*` path alias** maps to repo root (`tsconfig.json:25-26`); vitest discovers `tests/**/*.test.ts` (`vitest.projects.ts:20`).

---

## File Structure

| File | Responsibility |
|---|---|
| `tests/parser/mutation/rows.ts` | Row taxonomy (header/alignment/spacer/data), run + logical-section segmentation |
| `tests/parser/mutation/classify.ts` | `resolveHeader`, `SECTION_DOMAIN_MAP`, `Domain`, `classifySection`, `domains(site)`, `floorEligible` |
| `tests/parser/mutation/expectedDomains.ts` | `EXPECTED_HEADER_DOMAINS` — hand-authored domain oracle, SEPARATE from the classifier impl so the gate is not self-referential (plan-R21) |
| `tests/parser/mutation/operators.ts` | 8 operators → 9 registered keys (`blank-row:inject`/`:remove`), applicability predicates, exhaustive site enumeration, `floorEligible`, `skippedInapplicable` |
| `tests/parser/mutation/oracle.ts` | baseline capture, `payloadOf`/`signalOf`, `payloadChanged`, `signalEq`, `signalKeys`, `newSignalFired`, `verdict`, `fingerprint` |
| `tests/parser/mutation/knownHoles.ts` | `KnownHole` type + `KNOWN_SILENT_HOLES` ledger |
| `tests/parser/mutation/fixtures.ts` | 17-entry fixture registry `{ slug, family, path }` |
| `tests/parser/mutation/applicabilityAudit.ts` | independent raw-markdown site inventory + hand-verified golden table |
| `tests/parser/mutationHarness.test.ts` | driver: fixtures × operators × sites → verdicts → ledger diff + every structural gate + negative controls |

Segmentation/classification helpers live in `rows.ts`/`classify.ts` and are imported by `operators.ts`. **`applicabilityAudit.ts` deliberately does NOT import `rows.ts`/`classify.ts`/`operators.ts`** — it re-derives its own minimal scan (spec §4.3 audit-independence, Codex R13).

---

## Shared type vocabulary (defined in Task 1, used throughout)

```ts
// rows.ts
export type RowClass = "header" | "alignment" | "spacer" | "data";
export type Row = { line: number; cells: string[]; cls: RowClass };
export type LogicalSection = { index: number; headerRow: Row | null; rows: Row[]; runIndex: number };
export type Run = { index: number; sections: LogicalSection[]; startLine: number };
export type Segmentation = { runs: Run[]; sections: LogicalSection[] };
```

```ts
// operators.ts
export type Bucket = "corrupting" | "cosmetic";
export type Mutant = { md: string; siteId: string; bucket: Bucket; domains: Domain[]; dataRowCount?: number };
```

---

### Task 1: Row taxonomy + segmentation

**Files:**
- Create: `tests/parser/mutation/rows.ts`
- Test: `tests/parser/mutation/rows.test.ts`

**Interfaces:**
- Produces: `splitCells(line)`, `classifyRow(cells)`, `segment(md): Segmentation`, types `RowClass`/`Row`/`LogicalSection`/`Run`/`Segmentation`.
- Consumes: `resolveHeader` from `classify.ts` — to avoid a cycle, `segment` takes `isHeader: (cells: string[]) => boolean` as a parameter (Task 2 passes the real classifier; tests pass a stub).

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/mutation/rows.test.ts
import { describe, it, expect } from "vitest";
import { splitCells, classifyRow, segment } from "./rows";
import { splitRow } from "@/lib/parser/blocks/_helpers";

const isHeader = (cells: string[]) => /^(DATES|CREW|DRESS|HOTEL|GENERAL SESSION)/.test((cells[0] ?? "").trim());

describe("row taxonomy", () => {
  it("splits a pipe row into trimmed cells (drops leading/trailing pipe framing)", () => {
    expect(splitCells("|  A | B  | C |")).toEqual(["A", "B", "C"]);
  });
  it("mirrors the parser's splitRow on an ESCAPED-PIPE row (\\| fragments, same as parser) (plan-R11)", () => {
    // Real fixture shape: a hotel cell containing "... \| Events ...". The live parser splits
    // on the raw pipe too (splitRow), so the harness must fragment IDENTICALLY — a mutation on
    // any fragment is then a single-site change in parser-space, not a false alarm.
    const line = "| Hilton | Gabriella Decker \\| Events gd@hilton.com | Austin |";
    expect(splitCells(line)).toEqual(splitRow(line));           // byte-for-byte parser parity
    expect(splitCells(line).length).toBe(4);                    // \| fragments the middle cell into 2
  });
  it("matches parser splitRow on a MISSING trailing pipe (drops final cell) (plan-R13)", () => {
    // parser: "| A | B".split("|").slice(1,-1) === ["A"] — the final segment is dropped.
    expect(splitCells("| A | B")).toEqual(splitRow("| A | B"));
    expect(splitCells("| A | B")).toEqual(["A"]);
    expect(splitCells("| A")).toEqual(splitRow("| A"));          // ["", " A"].slice(1,-1) === []
    expect(splitCells("| A")).toEqual([]);
  });
  it("classifies alignment / spacer / header / data rows", () => {
    expect(classifyRow([":---:", ":---"]).valueOf()).toBe("alignment");
    expect(classifyRow(["", "", ""]).valueOf()).toBe("spacer");
    expect(classifyRow(["DATES", "", "DAY"], isHeader)).toBe("header");
    expect(classifyRow(["", "Doug Larson", "917-..."], isHeader)).toBe("data");
  });
});

describe("logical-section segmentation (Codex R10)", () => {
  it("splits one pipe run holding DATES/CREW/DRESS into distinct header-anchored sections", () => {
    const md = [
      "| DATES | DAY |",
      "| :---: | :---: |",
      "|  | Tuesday |",
      "|  |  |",
      "| CREW | NAME |",
      "|  | Doug Larson |",
      "|  |  |",
      "| DRESS | Black |",
    ].join("\n");
    const seg = segment(md, isHeader);
    expect(seg.sections.map((s) => (s.headerRow?.cells[0] ?? "").trim())).toEqual(["DATES", "CREW", "DRESS"]);
    // all three sections belong to ONE run (no blank line separates them)
    expect(new Set(seg.sections.map((s) => s.runIndex)).size).toBe(1);
  });
  it("rows before the first header in a run form a headerless section (headerRow null)", () => {
    const md = ["|  | orphan data |", "| CREW | NAME |", "|  | Doug |"].join("\n");
    const seg = segment(md, isHeader);
    expect(seg.sections[0]!.headerRow).toBeNull();
    expect(seg.sections[1]!.headerRow!.cells[0]!.trim()).toBe("CREW");
  });
  it("a blank line starts a new run", () => {
    const md = ["| CREW | NAME |", "|  | Doug |", "", "| HOTEL | X |"].join("\n");
    const seg = segment(md, isHeader);
    expect(seg.runs).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/parser/mutation/rows.test.ts`
Expected: FAIL (module not found / functions undefined).

- [ ] **Step 3: Write the implementation**

```ts
// tests/parser/mutation/rows.ts
export type RowClass = "header" | "alignment" | "spacer" | "data";
export type Row = { line: number; cells: string[]; cls: RowClass };
export type LogicalSection = { index: number; headerRow: Row | null; rows: Row[]; runIndex: number };
export type Run = { index: number; sections: LogicalSection[]; startLine: number };
export type Segmentation = { runs: Run[]; sections: LogicalSection[] };

/**
 * A markdown pipe-table row split into trimmed cell strings (framing pipes dropped).
 *
 * DELIBERATELY mirrors the live parser's `lib/parser/blocks/_helpers.ts:splitRow`
 * (`line.split("|").slice(1,-1)`): the parser does NOT honor `\|` escapes at split
 * time — it splits on the raw pipe and strips the backslash later in `clean()` (plan-R11).
 * So an escaped `\|` inside a cell fragments into TWO cells here EXACTLY as it does for the
 * parser. This preserves the metamorphic property: a mutation on one fragment is still a
 * single-site change in PARSER-space (baseline and mutant both flow through the same
 * splitRow), so it does not manufacture a false alarm. The harness follows parser behavior
 * rather than "correct" markdown escaping ON PURPOSE — pinned by the escaped-pipe test below.
 */
export function splitCells(line: string): string[] {
  const t = line.trim();
  if (!t.startsWith("|")) return [];
  // EXACT parser parity: `split("|").slice(1,-1)` (splitRow). This DROPS the final segment
  // when the trailing pipe is ABSENT (`| A | B` → ["A"]), matching parseSheet's cell model —
  // NOT an "optional trailing pipe" strip, which would over-count that pinned edge (plan-R13).
  return t.split("|").slice(1, -1).map((c) => c.trim());
}

const ALIGN = /^:?-{1,}:?$/;

export function classifyRow(cells: string[], isHeader?: (cells: string[]) => boolean): RowClass {
  const nonEmpty = cells.filter((c) => c.length > 0);
  if (nonEmpty.length === 0) return "spacer";
  if (nonEmpty.every((c) => ALIGN.test(c))) return "alignment";
  if (isHeader && isHeader(cells)) return "header";
  return "data";
}

/**
 * Segment markdown into pipe RUNS (blank-line delimited) and, within each run,
 * header-anchored LOGICAL SECTIONS. A section starts at each header row and owns
 * subsequent rows until the next header row or the run boundary. Rows before the
 * first header in a run form a headerless (`headerRow: null`) section.
 */
export function segment(md: string, isHeader: (cells: string[]) => boolean): Segmentation {
  const lines = md.split("\n");
  const runs: Run[] = [];
  const sections: LogicalSection[] = [];
  let curRun: Run | null = null;
  let curSec: LogicalSection | null = null;

  const closeRun = () => {
    if (curSec && curRun && !curRun.sections.includes(curSec)) curRun.sections.push(curSec);
    curSec = null;
    curRun = null;
  };

  lines.forEach((line, i) => {
    if (line.trim() === "" || !line.trim().startsWith("|")) {
      // blank line (or non-table line) ends the current run
      closeRun();
      return;
    }
    if (!curRun) {
      curRun = { index: runs.length, sections: [], startLine: i };
      runs.push(curRun);
      curSec = null;
    }
    const cells = splitCells(line);
    const cls = classifyRow(cells, isHeader);
    const row: Row = { line: i, cells, cls };
    if (cls === "header") {
      if (curSec) curRun.sections.push(curSec);
      curSec = { index: sections.length, headerRow: row, rows: [row], runIndex: curRun.index };
      sections.push(curSec);
    } else {
      if (!curSec) {
        curSec = { index: sections.length, headerRow: null, rows: [], runIndex: curRun.index };
        sections.push(curSec);
      }
      curSec.rows.push(row);
    }
  });
  closeRun();
  return { runs, sections };
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/parser/mutation/rows.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutation/rows.ts tests/parser/mutation/rows.test.ts
git commit --no-verify -m "test(parser): row taxonomy + header-anchored logical-section segmentation"
```

---

### Task 2: Classifier — resolveHeader, SECTION_DOMAIN_MAP, parity gate

**Files:**
- Create: `tests/parser/mutation/classify.ts`
- Create: `tests/parser/mutation/expectedDomains.ts` (external domain oracle, Step 3b)
- Test: `tests/parser/mutation/classify.test.ts`

**Interfaces:**
- Consumes: `KNOWN_SECTION_HEADERS`, `PREFIX_SECTION_FAMILIES`, `normalizeHeader` (`@/lib/parser/knownSections`); `LogicalSection`, `splitCells` (`./rows`).
- Produces: `Domain`, `RISK_CRITICAL: Domain[]`, `SECTION_DOMAIN_MAP`, `resolveHeader(col0): string|null`, `isHeaderCells(cells): boolean`, `classifySection(sec): Domain` (`classify.ts`); `EXPECTED_HEADER_DOMAINS: ReadonlyArray<readonly [string, Domain]>` (`expectedDomains.ts` — the SEPARATE oracle consumed by the classifier gate here AND by Task 9).

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/mutation/classify.test.ts
import { describe, it, expect } from "vitest";
import { KNOWN_SECTION_HEADERS, PREFIX_SECTION_FAMILIES, normalizeHeader } from "@/lib/parser/knownSections";
import { EXPECTED_HEADER_DOMAINS } from "./expectedDomains"; // SEPARATE hand-authored domain oracle (Step 3b)
import { resolveHeader, SECTION_DOMAIN_MAP, classifySection, RISK_CRITICAL } from "./classify";

describe("classifier parity (Codex R2/R4/R8)", () => {
  it("every KNOWN_SECTION_HEADERS entry maps to a non-other domain", () => {
    for (const h of KNOWN_SECTION_HEADERS) {
      const d = SECTION_DOMAIN_MAP[h];
      expect(d, `unmapped parser header: ${h}`).toBeDefined();
      expect(d, `${h} resolved to other`).not.toBe("other");
    }
  });
  it("resolves suffixed room headers via PREFIX_SECTION_FAMILIES → rooms (R4)", () => {
    for (const fam of PREFIX_SECTION_FAMILIES) {
      expect(SECTION_DOMAIN_MAP[resolveHeader(`${fam} GRAND BALLROOM`)!]).toBe("rooms");
    }
  });
  it("EXPECTED_HEADER_DOMAINS COVERS the live registry — a new parser header forces a row (R20)", () => {
    // Anchors the domain oracle to the EXTERNAL source of truth (knownSections.ts), not a private
    // subset. If KNOWN_SECTION_HEADERS gains a header, this fails until the oracle gets a row —
    // so the domain gate can't silently omit a new registry header (Codex plan-R20 [medium]).
    const covered = new Set(EXPECTED_HEADER_DOMAINS.map(([h]) => normalizeHeader(h)));
    for (const h of KNOWN_SECTION_HEADERS) expect(covered, `no expected-domain row for registry header ${h}`).toContain(h);
  });
  it("lockstep: SECTION_DOMAIN_MAP agrees with the independent EXPECTED_HEADER_DOMAINS oracle (R8/R20)", () => {
    // SECTION_DOMAIN_MAP and EXPECTED_HEADER_DOMAINS are two SEPARATELY hand-derived structures;
    // this asserts they AGREE, so a wrong domain (e.g. CREW→hotel) in one is caught by mismatch
    // with the other — not self-reference against a single table.
    for (const [header, domain] of EXPECTED_HEADER_DOMAINS) {
      expect(SECTION_DOMAIN_MAP[resolveHeader(header)!], header).toBe(domain);
    }
  });
  it("a genuinely-unknown header resolves to null → other", () => {
    expect(resolveHeader("CATERING")).toBeNull();
  });
  it("v4 TRANSPORTATION/<label> slash header → transportation (transport.ts:170, plan-R11)", () => {
    const h = resolveHeader("TRANSPORTATION/Equipment Transporter");
    expect(h).toBe("TRANSPORTATION");
    expect(SECTION_DOMAIN_MAP[h!]).toBe("transportation");
    expect(classifySection({ index: 0, runIndex: 0, rows: [], headerRow: { line: 0, cls: "header" as const, cells: ["TRANSPORTATION/Equipment Transporter", "PHONE"] } })).toBe("transportation");
    // a space-suffixed (non-slash) form is NOT a v4 header → other (matches the parser regex)
    expect(resolveHeader("TRANSPORTATION SCHEDULE")).toBeNull();
  });
});

describe("classifySection", () => {
  const sec = (col0: string) => ({ index: 0, runIndex: 0, rows: [], headerRow: { line: 0, cls: "header" as const, cells: [col0, "x"] } });
  it("classifies by the header row's col-0 token", () => {
    expect(classifySection(sec("CREW"))).toBe("crew");
    expect(classifySection(sec("GENERAL SESSION GRAND BALLROOM"))).toBe("rooms");
  });
  it("a headerless section is other", () => {
    expect(classifySection({ index: 0, runIndex: 0, rows: [], headerRow: null })).toBe("other");
  });
  it("RISK_CRITICAL is exactly the seven audit domains", () => {
    expect([...RISK_CRITICAL].sort()).toEqual(
      ["agenda", "crew", "dates", "event_details", "hotel", "rooms", "transportation"].sort(),
    );
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/parser/mutation/classify.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// tests/parser/mutation/classify.ts
import { KNOWN_SECTION_HEADERS, PREFIX_SECTION_FAMILIES, normalizeHeader } from "@/lib/parser/knownSections";
import type { LogicalSection } from "./rows";

export type Domain =
  | "crew" | "hotel" | "rooms" | "transportation" | "agenda" | "dates" | "event_details"
  | "venue" | "dress" | "contacts" | "client" | "pull_sheet" | "documents" | "other";

export const RISK_CRITICAL: readonly Domain[] = [
  "crew", "hotel", "rooms", "transportation", "agenda", "dates", "event_details",
];

/** Every current KNOWN_SECTION_HEADERS member (knownSections.ts:34-65) → domain. */
export const SECTION_DOMAIN_MAP: Record<string, Domain> = {
  CREW: "crew", TECH: "crew",
  HOTEL: "hotel", HOTELS: "hotel", "HOTEL RESERVATIONS": "hotel", "HOTEL RESERVATION": "hotel",
  "HOTEL STAYS": "hotel", "HOTEL STAY": "hotel",
  "GENERAL SESSION": "rooms", BREAKOUT: "rooms", BREAKOUTS: "rooms", "ADDITIONAL ROOM": "rooms",
  "LUNCH ROOM": "rooms", "LUNCH SESSION": "rooms", FOYER: "rooms",
  "EVENT DETAILS": "event_details", DETAILS: "event_details", "GS DETAILS": "event_details",
  TRANSPORTATION: "transportation", DATES: "dates", AGENDA: "agenda", "AGENDA LINK": "agenda",
  VENUE: "venue", VENUES: "venue", DRESS: "dress", "IN HOUSE AV": "contacts",
  CLIENT: "client", "PULL SHEET": "pull_sheet", COI: "documents", "DOCUMENT FOLDER LINK": "documents",
};

// NOTE: the intended-domain oracle EXPECTED_HEADER_DOMAINS is DELIBERATELY NOT defined here.
// It lives in its own data module `tests/parser/mutation/expectedDomains.ts` (Step 3b) so the
// classifier gate compares SECTION_DOMAIN_MAP against a SEPARATELY-authored surface, not a table
// co-located with (and co-editable in lockstep with) the map itself (Codex plan-R21 [high]).

// Replicates matchesTokenPrefix (knownSections.ts:155-161): startsWith + token boundary.
function tokenPrefix(n: string, entry: string): boolean {
  return n.startsWith(entry) && (n.length === entry.length || /[^A-Z0-9]/.test(n[entry.length] ?? " "));
}

/** Resolve a col-0 cell to its canonical parser header (exact or prefix family), else null. */
export function resolveHeader(col0: string): string | null {
  const n = normalizeHeader(col0);
  if (KNOWN_SECTION_HEADERS.has(n)) return n;
  // v4 transportation SLASH header: raw col-0 is `TRANSPORTATION/<name>` (lib/parser/blocks/
  // transport.ts:170 `TRANSPORTATION(?:\/[^|]*)?`). Recognize it so those real fixture sections
  // are credited to `transportation`, not silently classified `other` (plan-R11). Bare
  // TRANSPORTATION is already the exact match above; a space-suffixed form is NOT a v4 header.
  if (/^TRANSPORTATION\//.test(n)) return "TRANSPORTATION";
  for (const fam of PREFIX_SECTION_FAMILIES) if (tokenPrefix(n, fam)) return fam;
  return null;
}

export function isHeaderCells(cells: string[]): boolean {
  return resolveHeader(cells[0] ?? "") !== null;
}

export function classifySection(sec: LogicalSection): Domain {
  if (!sec.headerRow) return "other";
  const h = resolveHeader(sec.headerRow.cells[0] ?? "");
  return h ? (SECTION_DOMAIN_MAP[h] ?? "other") : "other";
}
```

- [ ] **Step 3b: Write the SEPARATE domain oracle** (`tests/parser/mutation/expectedDomains.ts`)

This module is the anti-tautology anchor for the classifier gate: a hand-authored intended-domain oracle that is NOT in `classify.ts`, so `SECTION_DOMAIN_MAP` and the oracle are two SEPARATELY-authored surfaces the gate cross-checks (Codex plan-R21). It imports only the `Domain` *type* from `classify.ts` (a type-only import — no dependency on the map's runtime values). Every current `KNOWN_SECTION_HEADERS` token (knownSections.ts:34-65, 30 entries) MUST appear here — the gate asserts coverage, so a new parser header forces a new row.

```ts
// tests/parser/mutation/expectedDomains.ts
import type { Domain } from "./classify";

/** Hand-authored intended-domain oracle for EVERY current KNOWN_SECTION_HEADERS entry. Authored
 *  independently of SECTION_DOMAIN_MAP (different file, hand-derived). The classifier-parity gate
 *  asserts (a) this COVERS the live registry (new header → forced row) and (b) SECTION_DOMAIN_MAP
 *  AGREES with it — a wrong non-`other` domain is caught by cross-mismatch, not self-reference. */
export const EXPECTED_HEADER_DOMAINS: ReadonlyArray<readonly [string, Domain]> = [
  ["CREW", "crew"], ["TECH", "crew"],
  ["HOTEL", "hotel"], ["HOTELS", "hotel"], ["HOTEL RESERVATIONS", "hotel"], ["HOTEL RESERVATION", "hotel"],
  ["HOTEL STAYS", "hotel"], ["HOTEL STAY", "hotel"],
  ["GENERAL SESSION", "rooms"], ["BREAKOUT", "rooms"], ["BREAKOUTS", "rooms"], ["ADDITIONAL ROOM", "rooms"],
  ["LUNCH ROOM", "rooms"], ["LUNCH SESSION", "rooms"], ["FOYER", "rooms"],
  ["EVENT DETAILS", "event_details"], ["DETAILS", "event_details"], ["GS DETAILS", "event_details"],
  ["TRANSPORTATION", "transportation"], ["DATES", "dates"], ["AGENDA", "agenda"], ["AGENDA LINK", "agenda"],
  ["VENUE", "venue"], ["VENUES", "venue"], ["DRESS", "dress"], ["IN HOUSE AV", "contacts"],
  ["CLIENT", "client"], ["PULL SHEET", "pull_sheet"], ["COI", "documents"], ["DOCUMENT FOLDER LINK", "documents"],
];
```

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/parser/mutation/classify.test.ts`
Expected: PASS.

- [ ] **Step 4b: Prove the domain-agreement gate is LIVE — RED via injected classifier drift (TDD red phase, plan-R21)**

The coverage assertion alone doesn't prove the gate independently pins the domain (a wrong-but-non-`other` map would still pass coverage). Prove the AGREEMENT gate catches a domain misattribution:
  1. Temporarily edit `tests/parser/mutation/classify.ts` — change `SECTION_DOMAIN_MAP.DRESS` from `"dress"` to `"venue"` (a wrong but non-`other` domain; coverage still green). Do NOT touch `expectedDomains.ts`.
  2. Run: `pnpm vitest run tests/parser/mutation/classify.test.ts -t "SECTION_DOMAIN_MAP agrees"`. Expected: FAIL (oracle says `dress`, map says `venue`).
  3. Revert; confirm `git diff --stat tests/parser/mutation/classify.ts` shows no change.

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutation/classify.ts tests/parser/mutation/classify.test.ts tests/parser/mutation/expectedDomains.ts
git commit --no-verify -m "test(parser): prefix-resolving classifier + SECTION_DOMAIN_MAP parity + external domain oracle"
```

---

### Task 3: Oracle — baseline, payload/signal split, verdict, fingerprint

**Files:**
- Create: `tests/parser/mutation/oracle.ts`
- Test: `tests/parser/mutation/oracle.test.ts`

**Interfaces:**
- Consumes: `parseSheet` (`@/lib/parser`), `ParsedSheet`/`ParseWarning`/`ParseError` (`@/lib/parser/types`), `node:crypto`.
- Produces: `Verdict` type, `capture(md, filename)`, `payloadOf`, `signalOf`, `payloadChanged`, `signalEq`, `newSignalFired`, `verdict(base, mut): Verdict`, `fingerprint(base, mut): string`, `digest(v)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/mutation/oracle.test.ts
import { describe, it, expect } from "vitest";
import { capture, verdict, fingerprint, signalRows } from "./oracle";
import type { ParsedSheet } from "@/lib/parser/types";

// Minimal ParsedSheet builder for oracle unit tests (only the fields the oracle reads).
const base = (over: Partial<ParsedSheet> = {}): ParsedSheet =>
  ({
    show: {} as never, crewMembers: [], hotelReservations: [], rooms: [], transportation: null,
    contacts: [], pullSheet: null, diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null, raw_unrecognized: [], warnings: [], hardErrors: [], ...over,
  }) as ParsedSheet;

describe("verdict (corrupting bucket, Codex R5 SILENT_SIGNAL_LOSS)", () => {
  it("payload+signals identical → ABSORBED", () => {
    expect(verdict(base(), base())).toBe("ABSORBED");
  });
  it("payload changed, no new signal → SILENT_WRONG", () => {
    expect(verdict(base(), base({ crewMembers: [{ name: "X" } as never] }))).toBe("SILENT_WRONG");
  });
  it("payload changed + new warning → SIGNALED", () => {
    const m = base({ crewMembers: [{ name: "X" } as never], warnings: [{ severity: "warn", code: "W", message: "m" }] });
    expect(verdict(base(), m)).toBe("SIGNALED");
  });
  it("payload equal, a baseline warning REMOVED (no compensating signal) → SILENT_SIGNAL_LOSS", () => {
    const b = base({ warnings: [{ severity: "warn", code: "W", message: "m" }] });
    expect(verdict(b, base())).toBe("SILENT_SIGNAL_LOSS");
  });
  it("payload equal, a warning ADDED → SIGNALED", () => {
    const m = base({ warnings: [{ severity: "warn", code: "W", message: "m" }] });
    expect(verdict(base(), m)).toBe("SIGNALED");
  });
  it("undefined ≠ null: an optional signal field flipping undefined→null is NOT absorbed (plan-R5)", () => {
    const wU = { severity: "warn" as const, code: "W", message: "m" };                    // sourceCell absent (undefined)
    const wN = { severity: "warn" as const, code: "W", message: "m", sourceCell: null };   // sourceCell null
    // same code → newSignalFired false; full signalEq must see the difference → SILENT_SIGNAL_LOSS
    expect(verdict(base({ warnings: [wN] }), base({ warnings: [wU] }))).toBe("SILENT_SIGNAL_LOSS");
  });
  it("toEqual parity: {a: undefined} is equal to {} (no false alarm)", () => {
    const wA = { severity: "warn" as const, code: "W", message: "m", sourceCell: undefined };
    const wB = { severity: "warn" as const, code: "W", message: "m" };
    expect(verdict(base({ warnings: [wA] }), base({ warnings: [wB] }))).toBe("ABSORBED");
  });
});

describe("fingerprint signal component — redaction boundary is EXECUTABLE (Codex R26)", () => {
  it("keeps STRUCTURAL fields verbatim and DIGESTS pii/free-text (never raw in the ledger)", () => {
    const w = {
      severity: "warn" as const, code: "MI_7",
      message: "secret@example.com", rawSnippet: "raw pii row",
      blockRef: { kind: "crew", index: 2 },
    };
    const [row] = signalRows(base({ warnings: [w] }));
    // structural fields present VERBATIM (a reviewer can see WHY a ledger row moved):
    expect(row).toContain(`"code":"MI_7"`);
    expect(row).toContain(`"severity":"warn"`);
    expect(row).toContain(`"kind":"crew"`);
    expect(row).toContain(`"index":2`);
    // PII / free-text NOT present raw (digested):
    expect(row).not.toContain("secret@example.com");
    expect(row).not.toContain("raw pii row");
  });
  it("a code (structural) change and a message (pii) change BOTH move the fingerprint", () => {
    const b = base();
    const w = (over: object) => base({ warnings: [{ severity: "warn" as const, code: "W", message: "m", ...over }] });
    expect(fingerprint(b, w({ code: "W2" }))).not.toBe(fingerprint(b, w({}))); // structural
    expect(fingerprint(b, w({ message: "n" }))).not.toBe(fingerprint(b, w({}))); // pii
  });
  it("distinguishes sourceCell ABSENT vs NULL vs value — matches signalEq's 3-state (R28)", () => {
    const b = base();
    const absent = base({ warnings: [{ severity: "warn", code: "W", message: "m" }] });
    const asNull = base({ warnings: [{ severity: "warn", code: "W", message: "m", sourceCell: null }] });
    const asVal = base({ warnings: [{ severity: "warn", code: "W", message: "m", sourceCell: { tab: "DATES", a1: "B2" } as never }] });
    // premise: signalEq (toEqual) treats these three as distinct → a change among them is signal drift
    expect(verdict(absent, asNull)).not.toBe("ABSORBED"); // a null anchor gained/lost is NOT invisible
    // fingerprint must move for each pair (else a ledgered SILENT_SIGNAL_LOSS could drift undetected)
    const [fa, fn, fv] = [fingerprint(b, absent), fingerprint(b, asNull), fingerprint(b, asVal)];
    expect(new Set([fa, fn, fv]).size).toBe(3);
  });
});

describe("fingerprint (Codex R7/R8/R15/R16)", () => {
  it("changes when the same payload path takes a different value (R8)", () => {
    const b = base({ crewMembers: [{ name: "A" } as never] });
    const m1 = base({ crewMembers: [{ name: "B" } as never] });
    const m2 = base({ crewMembers: [{ name: "C" } as never] });
    expect(fingerprint(b, m1)).not.toBe(fingerprint(b, m2));
  });
  it("changes when a same-block|key raw_unrecognized VALUE drifts with payload equal (R9/R15)", () => {
    const b = base({ raw_unrecognized: [{ block: "X", key: "k", value: "v1" }] });
    const m1 = base({ raw_unrecognized: [{ block: "X", key: "k", value: "v2" }] });
    expect(fingerprint(b, base())).not.toBe(fingerprint(b, m1));
  });
  it("changes when two warnings are REORDERED (order-sensitive, R16)", () => {
    const w = (c: string) => ({ severity: "warn" as const, code: c, message: c });
    const b = base();
    const m1 = base({ warnings: [w("A"), w("B")] });
    const m2 = base({ warnings: [w("B"), w("A")] });
    expect(fingerprint(b, m1)).not.toBe(fingerprint(b, m2));
  });
  it("changes on empty-container payload drift [] -> [{}] and {} -> [] (plan-R4)", () => {
    const b = base({ rooms: [] });
    expect(fingerprint(b, base({ rooms: [{} as never] }))).not.toBe(fingerprint(b, base({ rooms: [] })));
    // adding an empty nested container is visible
    const b2 = base({ contacts: [] });
    expect(fingerprint(b2, base({ contacts: [{} as never] }))).not.toBe(fingerprint(b2, b2));
  });
  it("is sensitive to EVERY warning anchoring field: message/rawSnippet/blockRef/sourceCell (plan-R9)", () => {
    const b = base();
    const mk = (over: Partial<import("@/lib/parser/types").ParseWarning>) =>
      base({ warnings: [{ severity: "warn", code: "W", message: "m", ...over }] });
    const baseFp = fingerprint(b, mk({}));
    const variants = {
      message: mk({ message: "different" }),
      rawSnippet: mk({ rawSnippet: "snip" }),
      blockRef: mk({ blockRef: { kind: "crew" } }),
      sourceCell: mk({ sourceCell: { tab: "DATES", a1: "B2" } as never }),
    };
    const fps = Object.values(variants).map((v) => fingerprint(b, v));
    for (const [name, v] of Object.entries(variants)) {
      expect(fingerprint(b, v), `warning ${name} must move the fingerprint`).not.toBe(baseFp);
    }
    expect(new Set(fps).size, "each warning field is independently distinguishable").toBe(fps.length);
  });
  it("is sensitive to a hardError blockRef change (plan-R9)", () => {
    const b = base();
    const m1 = base({ hardErrors: [{ code: "E", message: "m" }] });
    const m2 = base({ hardErrors: [{ code: "E", message: "m", blockRef: { kind: "hotel" } }] });
    expect(fingerprint(b, m1)).not.toBe(fingerprint(b, m2));
  });
});

describe("capture", () => {
  it("parses a real fixture and returns a ParsedSheet", () => {
    const cap = capture("| CREW | NAME |\n|  | Doug |", "x.md");
    expect(cap).toHaveProperty("warnings");
    expect(cap).toHaveProperty("crewMembers");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/parser/mutation/oracle.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// tests/parser/mutation/oracle.ts
import { createHash } from "node:crypto";
import { parseSheet } from "@/lib/parser";
import type { ParsedSheet, ParseWarning, ParseError } from "@/lib/parser/types";

export type Verdict = "ABSORBED" | "SIGNALED" | "SILENT_WRONG" | "SILENT_SIGNAL_LOSS";

export const capture = (md: string, filename: string): ParsedSheet => parseSheet(md, filename);

/** The data payload = ParsedSheet minus the three signal channels. */
export function payloadOf(p: ParsedSheet) {
  const { warnings, hardErrors, raw_unrecognized, ...payload } = p;
  return payload;
}
type SignalChannels = { warnings: ParseWarning[]; hardErrors: ParseError[]; raw_unrecognized: ParsedSheet["raw_unrecognized"] };
export const signalOf = (p: ParsedSheet): SignalChannels => ({
  warnings: p.warnings, hardErrors: p.hardErrors, raw_unrecognized: p.raw_unrecognized,
});

const deepEq = (a: unknown, b: unknown): boolean => canon(a) === canon(b);
/**
 * Canonical, key-sorted string matching Vitest `toEqual` semantics (plan-R5):
 * - `undefined` and `null` are DISTINCT tokens (toEqual: undefined ≠ null at a leaf).
 * - object keys whose value is `undefined` are OMITTED (toEqual: {a:undefined} == {}).
 * - object key order never affects the result.
 */
function canon(v: unknown): string {
  if (v === undefined) return "__undef__";
  if (v === null) return "__null__";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
}

export const payloadChanged = (b: ParsedSheet, m: ParsedSheet): boolean => !deepEq(payloadOf(b), payloadOf(m));
export const signalEq = (b: ParsedSheet, m: ParsedSheet): boolean => deepEq(signalOf(b), signalOf(m));

/** Reduced signal-key multiset for newSignalFired (spec §3.2). */
export function signalKeys(p: ParsedSheet): Map<string, number> {
  const map = new Map<string, number>();
  const bump = (k: string) => map.set(k, (map.get(k) ?? 0) + 1);
  for (const h of p.hardErrors) bump(`H:${h.code}`);
  for (const w of p.warnings) bump(`W:${w.code}`);
  for (const r of p.raw_unrecognized) bump(`R:${r.block}|${r.key}`);
  return map;
}
export function newSignalFired(b: ParsedSheet, m: ParsedSheet): boolean {
  const bk = signalKeys(b), mk = signalKeys(m);
  for (const [k, n] of mk) if (n > (bk.get(k) ?? 0)) return true;
  return false;
}

/** Corrupting-bucket verdict (spec §3.4, top-down). */
export function verdict(b: ParsedSheet, m: ParsedSheet): Verdict {
  const pEq = !payloadChanged(b, m), sEq = signalEq(b, m), stronger = newSignalFired(b, m);
  if (pEq && sEq) return "ABSORBED";
  if (pEq && !sEq && stronger) return "SIGNALED";
  if (pEq && !sEq && !stronger) return "SILENT_SIGNAL_LOSS";
  if (!pEq && stronger) return "SIGNALED";
  return "SILENT_WRONG";
}

/** Short redacted digest of any value — PII never stored raw (spec §5). */
export const digest = (v: unknown): string =>
  createHash("sha256").update(canon(typeof v === "string" ? v.normalize("NFC") : v)).digest("hex").slice(0, 12);

/**
 * Flatten to sorted [path, value] pairs. Every CONTAINER node also emits a shape
 * token (`#arr:<len>` / `#obj:<sortedKeys>`) so an empty-container change like
 * `[] -> [{}]` or `{} -> []` moves the fingerprint (plan-R4). Leaf scalars emit
 * their value; arrays use indexed paths.
 */
function leaves(v: unknown, prefix = ""): Array<[string, unknown]> {
  if (v === null || typeof v !== "object") return [[prefix, v]];
  if (Array.isArray(v)) {
    const out: Array<[string, unknown]> = [[prefix, `#arr:${v.length}`]];
    v.forEach((e, i) => out.push(...leaves(e, `${prefix}[${i}]`)));
    return out;
  }
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort(); // omit undefined keys (toEqual parity)
  const out: Array<[string, unknown]> = [[prefix, `#obj:${keys.join(",")}`]];
  for (const k of keys) out.push(...leaves(o[k], `${prefix}.${k}`));
  return out;
}

/**
 * Behavior fingerprint (spec §5): payload-path diff (type + redacted value digests)
 * PLUS order-sensitive full-signal-object diff. Deterministic per static fixture.
 */
export function fingerprint(b: ParsedSheet, m: ParsedSheet): string {
  const bl = new Map(leaves(payloadOf(b)).map(([p, v]) => [p, v]));
  const ml = new Map(leaves(payloadOf(m)).map(([p, v]) => [p, v]));
  const paths = [...new Set([...bl.keys(), ...ml.keys()])].sort();
  const payloadDiff: string[] = [];
  for (const p of paths) {
    const bv = bl.get(p), mv = ml.get(p);
    if (canon(bv) === canon(mv)) continue;
    payloadDiff.push(`${p}:${typeof bv}->${typeof mv}:${digest(bv)}->${digest(mv)}`);
  }
  // Order-sensitive signal component: index-keyed, per-field REDACTED canonical entries (spec §5,
  // R15/R16, R26). Structural fields (severity, code, blockRef.kind/index/iso/name, block, key) are
  // kept VERBATIM so a reviewer can see WHY a ledger row moved (code vs anchor vs message vs raw
  // value); PII/free-text (message, rawSnippet, sourceCell, value) is digest()-ed so the committed
  // ledger never carries raw PII. `signalRows` is exported so the redaction boundary is testable.
  const signalDiff = `B[${signalRows(b).join(",")}]|M[${signalRows(m).join(",")}]`;
  return createHash("sha256").update(`${payloadDiff.join(";")}||${signalDiff}`).digest("hex").slice(0, 16);
}

/** Per-entry redaction (spec §5.179): structural fields VERBATIM, PII/free-text digest()-ed, then
 *  canonicalized order-stably. Exported so a test can inspect the pre-hash field boundary. */
// `nullish3` preserves the absent-vs-null-vs-value distinction that `signalEq` (a toEqual)
// makes — collapsing `undefined` and `null` to one token would let a SILENT_SIGNAL_LOSS that only
// gains/loses a null anchor keep the same fingerprint while signalEq sees the change (Codex R28).
const nullish3 = <T>(v: T | null | undefined, present: (x: T) => string): string =>
  v === undefined ? "__undef__" : v === null ? "__null__" : present(v);
const redactWarning = (w: ParseWarning) => ({
  severity: w.severity,
  code: w.code,
  message: digest(w.message ?? ""),
  blockRef: w.blockRef
    ? { kind: w.blockRef.kind, index: w.blockRef.index ?? null, iso: w.blockRef.iso ?? null, name: w.blockRef.name ?? null }
    : null,
  rawSnippet: nullish3(w.rawSnippet, (s) => digest(s)), // rawSnippet?: string (never null, but absent≠"")
  sourceCell: nullish3(w.sourceCell, (s) => digest(JSON.stringify(s))), // SourceAnchor | null | undefined — 3-state
});
const redactError = (h: ParseError) => ({ code: h.code, message: digest(h.message ?? ""), blockRef: h.blockRef ? { kind: h.blockRef.kind } : null });
const redactRaw = (r: { block?: string; key?: string; value?: unknown }) => ({
  block: r.block ?? null,
  key: r.key ?? null,
  value: nullish3(r.value, (v) => digest(typeof v === "string" ? v : JSON.stringify(v))), // preserve undefined≠null
});

/** The index-keyed, redacted signal-entry list used by `fingerprint` (exported for the redaction-
 *  boundary test). Order-preserving: swapping two entries changes which content sits at which index. */
export function signalRows(p: ParsedSheet): string[] {
  const rows: string[] = [];
  p.warnings.forEach((w, i) => rows.push(`W#${i}:${canon(redactWarning(w))}`));
  p.hardErrors.forEach((h, i) => rows.push(`H#${i}:${canon(redactError(h))}`));
  (p.raw_unrecognized as Array<{ block?: string; key?: string; value?: unknown }>).forEach((r, i) => rows.push(`R#${i}:${canon(redactRaw(r))}`));
  return rows;
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/parser/mutation/oracle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutation/oracle.ts tests/parser/mutation/oracle.test.ts
git commit --no-verify -m "test(parser): metamorphic oracle — verdict (incl. SILENT_SIGNAL_LOSS) + order-sensitive fingerprint"
```

---

### Task 4: Operators + floor-first selection

**Files:**
- Create: `tests/parser/mutation/operators.ts`
- Test: `tests/parser/mutation/operators.test.ts`

**Interfaces:**
- Consumes: `segment`/`splitCells`/types (`./rows`), `isHeaderCells`/`classifySection`/`resolveHeader`/`Domain`/`RISK_CRITICAL` (`./classify`).
- Produces: `Mutant`, `Bucket`, `MUTANT_BUDGET: number` (single-source fanout ceiling), `guardStream<T>(gen, budget, label): Generator<T>` (shared fail-fast guard), `boundedMutants(op, md): Generator<Mutant>` (THE corpus-scale iterator — guarded), `OPERATORS: Record<string, (md) => Mutant[]>` (derived `[...gen]` array form, BOUNDED synthetic tests only), `floorEligible(mutants): Set<Domain>`, `skippedInapplicable(md, op): Domain[]`. **`OPERATOR_GENS` (the raw generators) is module-PRIVATE — not exported** (plan-R24 structural closure: the only corpus path is `boundedMutants`).
- **domains(site)** is carried on each `Mutant.domains`; boundary (`blank-row:remove`) mutants carry a 2-element `domains`.
- **Exhaustive:** operators emit ALL applicable sites; there is no cap/`select` (plan-R2). The driver parses every generated mutant.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/mutation/operators.test.ts
import { describe, it, expect } from "vitest";
import { OPERATORS, OPERATOR_NAMES, boundedMutants, floorEligible, skippedInapplicable } from "./operators";
import { splitCells } from "./rows";
import { splitRow, clean } from "@/lib/parser/blocks/_helpers";

const CONSULTANTS_RUN = [
  "| DATES | DAY |",
  "| :---: | :---: |",
  "|  | Tuesday |",
  "|  |  |",
  "| CREW | NAME |",
  "|  | Doug Larson |",
  "|  | Eric Weiss |",
  "|  |  |",
  "| DRESS | Black Polo |",
].join("\n");

describe("operator inventory is complete (plan-R7)", () => {
  it("exactly the 9 expected operators are registered (7 corrupting + 2 cosmetic)", () => {
    expect(Object.keys(OPERATORS).sort()).toEqual(
      [
        "header-typo", "ref-sub", "unicode-inject", "column-shift",
        "blank-row:inject", "blank-row:remove", "merged-cell",
        "section-reorder", "trailing-whitespace",
      ].sort(),
    );
    expect([...OPERATOR_NAMES].sort()).toEqual(Object.keys(OPERATORS).sort()); // names ⟺ array keys
  });
  it("OPERATORS[op](md) is exactly the guarded stream materialized — no unguarded path (plan-R25)", () => {
    // Pins that the eager array form wraps `boundedMutants` (the budget-guarded stream), so any
    // fail-fast/O(1) guarantee proven for boundedMutants transitively holds for OPERATORS too —
    // there is NO unguarded enumeration path in the module.
    for (const op of OPERATOR_NAMES) {
      expect(OPERATORS[op]!(CONSULTANTS_RUN)).toEqual([...boundedMutants(op, CONSULTANTS_RUN)]);
    }
  });
});

describe("operator determinism + uniqueness", () => {
  it("every operator returns byte-distinct mutated markdown and unique siteIds", () => {
    for (const [name, op] of Object.entries(OPERATORS)) {
      const ms = op(CONSULTANTS_RUN);
      const ids = ms.map((m) => m.siteId);
      expect(new Set(ids).size, `${name} siteId collision`).toBe(ids.length);
      for (const m of ms) expect(m.md, `${name} no-op mutant`).not.toBe(CONSULTANTS_RUN);
    }
  });
});

describe("data-row-only exclusion (Codex R12)", () => {
  it("ref-sub never targets an alignment or spacer row", () => {
    for (const m of OPERATORS["ref-sub"]!(CONSULTANTS_RUN)) {
      expect(m.md).not.toMatch(/\| :?-+:? \| #REF! \|/); // never mutated the :---: row
    }
  });
});

describe("ref-sub skips already-#REF! cells — no byte-identical no-op (plan-R18)", () => {
  it("a cell already #REF! is not a site; only the real cell is mutated, none equal baseline", () => {
    const md = "| CREW | NAME | ROLE |\n|  | #REF! | Lead |"; // NAME already #REF!, ROLE=Lead
    const ms = OPERATORS["ref-sub"]!(md);
    expect(ms.length).toBe(1);                        // only ROLE=Lead is an eligible site
    expect(ms.every((m) => m.md !== md)).toBe(true);  // no emitted mutant is byte-identical to baseline
  });
});

describe("blank-row:inject is per data-row gap, not per section (plan-R3)", () => {
  it("a section with 3 data rows yields 2 injection mutants with distinct siteIds", () => {
    const md = "| CREW | NAME |\n|  | Doug |\n|  | Eric |\n|  | Carl |";
    const ms = OPERATORS["blank-row:inject"]!(md);
    expect(ms).toHaveLength(2);
    expect(new Set(ms.map((m) => m.siteId)).size).toBe(2);
  });
});

describe("merged-cell is per interior pipe, not just the first (plan-R5)", () => {
  it("a 4-cell data row yields 3 merge mutants with distinct pipe loci", () => {
    const md = "| CREW | NAME | ROLE | PHONE |\n|  | Doug | Lead | 917 |"; // data row: ["", "Doug", "Lead", "917"] → 4 cells
    const ms = OPERATORS["merged-cell"]!(md);
    expect(ms).toHaveLength(3); // cells.length - 1
    expect(new Set(ms.map((m) => m.siteId)).size).toBe(3);
  });
});

describe("single-site invariant holds on ESCAPED-PIPE rows (plan-R14)", () => {
  it("mutating a NON-escaped cell leaves every other parser-space value (splitRow+clean) byte-identical", () => {
    // cell1 carries an escaped `\|` (fragments into 2 parser cells). Mutate cell0 (Hilton→#REF!)
    // and assert exactly ONE parser-space value changes — the raw-segment rewrite must not reshape
    // the escaped-pipe fragments in the untouched cells.
    const md = "| CREW | X |\n| Hilton | Gabriella \\| Events gd@hilton.com | Austin |";
    const before = splitRow(md.split("\n")[1]!).map(clean);
    const m = OPERATORS["ref-sub"]!(md).find((x) => x.md.includes("#REF!"))!;
    const after = splitRow(m.md.split("\n")[1]!).map(clean);
    expect(after.length).toBe(before.length);                       // no column count change
    expect(before.map((v, i) => v !== after[i]).filter(Boolean).length).toBe(1); // exactly one cell moved
  });
  it("merged-cell removes exactly one delimiter and preserves other segments byte-for-byte", () => {
    const md = "| A | Gabriella \\| Events | Austin |";
    const m = OPERATORS["merged-cell"]!(md)[0]!; // fuse cells 0,1
    expect((m.md.match(/\|/g) || []).length).toBe((md.match(/\|/g) || []).length - 1); // one fewer pipe
    expect(m.md).toContain("Austin"); // untouched tail cell present verbatim
  });
});

describe("section-reorder is exhaustive over adjacent block pairs (plan-R10)", () => {
  it("3 blocks yield 2 adjacent-pair swaps, INCLUDING the late (2nd–3rd) pair", () => {
    const md = "| CREW | NAME |\n|  | A |\n\n| HOTEL | G |\n|  | B |\n\n| DATES | D |\n|  | C |";
    const ms = OPERATORS["section-reorder"]!(md);
    expect(ms).toHaveLength(2);                                   // (0,1) and (1,2)
    expect(new Set(ms.map((m) => m.siteId)).size).toBe(2);
    expect(ms.some((m) => m.siteId.includes("Xpair1"))).toBe(true); // the late pair is generated + will be parsed
  });
});

describe("column-shift requires a data row and is credited per logical section (Codex R11/R13)", () => {
  it("emits a crew-credited column-shift, none for a header/alignment-only section", () => {
    const ms = OPERATORS["column-shift"]!(CONSULTANTS_RUN);
    expect(ms.some((m) => m.domains.includes("crew"))).toBe(true);
    // DRESS section has only its header row + no data row → no column-shift site there
    expect(ms.every((m) => m.dataRowCount! >= 1)).toBe(true);
  });
  it("inserts a REAL empty leading cell so splitCells sees the shift (plan-R2)", () => {
    const md = "| CREW | NAME |\n|  | Doug Larson | 917 |";
    const m = OPERATORS["column-shift"]!(md)[0]!;
    const shiftedDataLine = m.md.split("\n").find((l) => l.includes("Doug Larson"))!;
    const cells = splitCells(shiftedDataLine);
    expect(cells[0]).toBe("");            // new empty leading cell
    expect(cells).toContain("Doug Larson"); // originals preserved, shifted right
    expect(cells.length).toBeGreaterThan(splitCells("|  | Doug Larson | 917 |").length - 1);
  });
});

describe("unicode-inject needs ≥2 scalar values (Codex R14)", () => {
  it("skips single-char cells", () => {
    const md = "| CREW | NAME |\n|  | A |"; // 'A' single char
    const ms = OPERATORS["unicode-inject"]!(md);
    expect(ms.every((m) => m.md !== md)).toBe(true); // any emitted are real
    // 'NAME' (header col1) is a header row cell → excluded; 'A' is 1-char → excluded ⇒ zero sites
    expect(ms).toHaveLength(0);
  });
});

describe("exhaustive generation + floor eligibility (plan-R2)", () => {
  it("every applicable site is generated (no cap) — a late section is still emitted", () => {
    const md = [
      ...Array.from({ length: 15 }, (_, i) => `| CLIENT | meta${i} |`).flatMap((h) => [h, "|  | v |", ""]),
      "| CREW | NAME |", "|  | Doug Larson |",
    ].join("\n");
    // exhaustive: the late CREW section's ref-sub site is present in the FULL output.
    expect(OPERATORS["ref-sub"]!(md).some((m) => m.domains.includes("crew"))).toBe(true);
  });
  it("floorEligible over all generated mutants includes each present risk-critical domain that has sites", () => {
    const md = "| CREW | NAME |\n|  | Doug Larson |";
    expect(floorEligible(OPERATORS["ref-sub"]!(md)).has("crew")).toBe(true);
  });
});

describe("skippedInapplicable surfacing (Codex R5)", () => {
  it("a present risk-critical domain with no applicable site for an op is reported", () => {
    // A HOTEL section with only a 2-column data row → no merged-cell (needs ≥3 cells).
    const md = "| HOTEL | Kimpton |\n|  | 122 W Monroe |\n\n| CREW | NAME |\n|  | Doug | 917 | x |";
    expect(skippedInapplicable(md, "merged-cell")).toContain("hotel");
    expect(skippedInapplicable(md, "merged-cell")).not.toContain("crew"); // crew row has ≥3 cells
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/parser/mutation/operators.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// tests/parser/mutation/operators.ts
import { segment, splitCells } from "./rows";
import type { LogicalSection, Row, Segmentation } from "./rows";
import { isHeaderCells, classifySection, RISK_CRITICAL } from "./classify";
import type { Domain } from "./classify";

export type Bucket = "corrupting" | "cosmetic";
export type Mutant = { md: string; siteId: string; bucket: Bucket; domains: Domain[]; dataRowCount?: number };

const seg = (md: string): Segmentation => segment(md, isHeaderCells);
const lines = (md: string) => md.split("\n");
const dataRows = (s: LogicalSection): Row[] => s.rows.filter((r) => r.cls === "data");
const scalars = (s: string) => [...s].length;

// RAW-SEGMENT rewrite (plan-R14). Parser cell `i` === `line.split("|")[i+1]` (splitRow drops
// framing via slice(1,-1)). Replacing ONLY segment i+1 preserves every OTHER segment
// byte-for-byte — including escaped `\|` fragments in non-target cells — so the mutation is
// genuinely single-site in parser-space. Never rebuild the row from trimmed cells with
// `join(" | ")`: that collapses original padding and reshapes escaped-pipe segments elsewhere,
// silently corrupting non-target hotel/contact values. The target segment's surrounding
// whitespace is preserved; only its trimmed content is swapped.
function replaceRawCell(line: string, cellIdx: number, next: string): string {
  const parts = line.split("|");
  const seg = parts[cellIdx + 1] ?? "";
  const lead = seg.match(/^\s*/)![0];
  const trail = seg.match(/\s*$/)![0];
  parts[cellIdx + 1] = `${lead}${next}${trail}`;
  return parts.join("|");
}
/** Fuse parser cells p and p+1 by DELETING the pipe delimiter between them; concatenates the
 *  two raw segments (padding preserved) and leaves every other segment untouched (plan-R14). */
function mergeRawCells(line: string, p: number): string {
  const parts = line.split("|");
  parts.splice(p + 1, 2, `${parts[p + 1] ?? ""}${parts[p + 2] ?? ""}`);
  return parts.join("|");
}

// Replace one cell in a specific line; returns the whole mutated markdown (raw-segment safe).
function withCell(md: string, line: number, cellIdx: number, next: string): string {
  const ls = lines(md);
  ls[line] = replaceRawCell(ls[line]!, cellIdx, next);
  return ls.join("\n");
}

function eachDataCell(md: string): Array<{ line: number; cellIdx: number; sec: LogicalSection; val: string }> {
  const out: Array<{ line: number; cellIdx: number; sec: LogicalSection; val: string }> = [];
  for (const s of seg(md).sections) for (const r of dataRows(s))
    r.cells.forEach((v, i) => { if (v.length > 0) out.push({ line: r.line, cellIdx: i, sec: s, val: v }); });
  return out;
}
const dom = (s: LogicalSection): Domain[] => [classifySection(s)];
const sid = (op: string, s: LogicalSection, line: number, locus: number | string) =>
  `${op}:B${s.index}:L${line}:X${locus}`;

// ---- corrupting operators (data-row scoped) ----
// Every operator is a LAZY GENERATOR (`function*`), yielding one Mutant at a time. The driver
// streams them so it can enforce MUTANT_BUDGET before parsing each mutant, never materializing a
// full operator array (Codex plan-R20 [high]). The array form used by tests is derived below.
function* refSub(md: string): Generator<Mutant> {
  for (const c of eachDataCell(md)) {
    // Skip cells already `#REF!` — rewriting them to `#REF!` is a byte-identical no-op that
    // would still claim a siteId and count toward coverage without exercising the parser
    // (Codex plan-R18 [medium]). The independent audit applies the identical exclusion.
    if (c.val.trim() === "#REF!") continue;
    yield { md: withCell(md, c.line, c.cellIdx, "#REF!"), siteId: sid("ref-sub", c.sec, c.line, c.cellIdx), bucket: "corrupting", domains: dom(c.sec) };
  }
}

function* unicodeInject(md: string): Generator<Mutant> {
  for (const c of eachDataCell(md)) {
    if (scalars(c.val) < 2) continue;
    const mid = Math.floor([...c.val].length / 2);
    const ZWNJ = "\u200C"; // zero-width non-joiner (fintech live shape)
    const injected = [...c.val].slice(0, mid).join("") + ZWNJ + [...c.val].slice(mid).join("");
    yield { md: withCell(md, c.line, c.cellIdx, injected), siteId: sid("unicode-inject", c.sec, c.line, c.cellIdx), bucket: "corrupting", domains: dom(c.sec) };
  }
}

function* mergedCell(md: string): Generator<Mutant> {
  for (const s of seg(md).sections) for (const r of dataRows(s)) {
    if (r.cells.length < 3) continue;
    // one mutant per interior pipe p (fuse cells p and p+1 via raw delimiter deletion) — plan-R5/R14
    for (let p = 0; p < r.cells.length - 1; p++) {
      const ls = lines(md); ls[r.line] = mergeRawCells(ls[r.line]!, p);
      yield { md: ls.join("\n"), siteId: sid("merged-cell", s, r.line, p), bucket: "corrupting", domains: dom(s) };
    }
  }
}

function* headerTypo(md: string): Generator<Mutant> {
  for (const s of seg(md).sections) {
    if (!s.headerRow) continue;
    const tok = s.headerRow.cells[0]!.trim();
    if (tok.length < 2) continue;
    // transpose the first adjacent pair of distinct chars
    const chars = [...tok];
    let pos = -1;
    for (let i = 0; i < chars.length - 1; i++) if (chars[i] !== chars[i + 1]) { pos = i; break; }
    if (pos < 0) continue;
    [chars[pos], chars[pos + 1]] = [chars[pos + 1]!, chars[pos]!];
    const typo = chars.join("");
    if (isHeaderCells([typo])) continue; // guard: must not produce a real header
    yield { md: withCell(md, s.headerRow.line, 0, typo), siteId: sid("header-typo", s, s.headerRow.line, 0), bucket: "corrupting", domains: dom(s) };
  }
}

function* columnShift(md: string): Generator<Mutant> {
  for (const s of seg(md).sections) {
    const dr = dataRows(s);
    if (dr.length < 1) continue; // Codex R13: require ≥1 data row
    const ls = lines(md);
    // insert a REAL empty leading cell (new pipe delimiter), not just whitespace (plan-R2):
    // "| x | y |" -> "|  | x | y |"
    for (const r of s.rows) ls[r.line] = ls[r.line]!.replace(/^\|/, "|  |");
    yield { md: ls.join("\n"), siteId: sid("column-shift", s, s.headerRow?.line ?? s.rows[0]!.line, 0), bucket: "corrupting", domains: dom(s), dataRowCount: dr.length };
  }
}

function* blankRowInject(md: string): Generator<Mutant> {
  for (const s of seg(md).sections) {
    const dr = dataRows(s);
    // one mutant per interior data-row gap (plan-R3, exhaustive)
    for (let i = 0; i < dr.length - 1; i++) {
      const gapAfter = dr[i]!.line; // absolute line index in the ORIGINAL md
      const ls = lines(md); ls.splice(gapAfter + 1, 0, "");
      yield { md: ls.join("\n"), siteId: sid("blank-row:inject", s, gapAfter, `gap${i}`), bucket: "corrupting", domains: dom(s) };
    }
  }
}

function* blankRowRemove(md: string): Generator<Mutant> {
  const { runs } = seg(md);
  const ls = lines(md);
  for (let i = 0; i < runs.length - 1; i++) {
    const a = runs[i]!, b = runs[i + 1]!;
    // the blank line index between run a's last section and run b's first section
    const lastRow = Math.max(...a.sections.flatMap((s) => s.rows.map((r) => r.line)).concat(a.sections.map((s) => s.headerRow?.line ?? -1)));
    const blankLine = lastRow + 1;
    if (ls[blankLine]?.trim() !== "") continue;
    const md2 = ls.filter((_, idx) => idx !== blankLine).join("\n");
    const domA = classifySection(a.sections[a.sections.length - 1]!);
    const domB = classifySection(b.sections[0]!);
    // dedup: adjacent same-domain runs must credit the domain ONCE (matches the audit, plan-R8)
    const domains = [...new Set([domA, domB])];
    yield { md: md2, siteId: `blank-row:remove:B${a.index}:L${blankLine}:Xgap`, bucket: "corrupting", domains };
  }
}

// ---- cosmetic operators ----
function* sectionReorder(md: string): Generator<Mutant> {
  // EXHAUSTIVE (plan-R10): one cosmetic mutant per ADJACENT block-pair swap, not just the
  // first two — a parser order-dependence between late blocks must also be exercised.
  const blocks = md.split(/\n\s*\n/);
  if (blocks.length < 2) return;
  for (let i = 0; i < blocks.length - 1; i++) {
    const swapped = [...blocks.slice(0, i), blocks[i + 1], blocks[i], ...blocks.slice(i + 2)].join("\n\n");
    if (swapped === md) continue; // identical blocks → no-op, skip
    yield { md: swapped, siteId: `section-reorder:B${i}:L0:Xpair${i}`, bucket: "cosmetic", domains: [] };
  }
}

function* trailingWhitespace(md: string): Generator<Mutant> {
  const swapped = md.replace(/\n/g, "  \n") + "\n\n"; // trailing spaces on each line + trailing blank lines
  if (swapped === md) return;
  yield { md: swapped, siteId: "trailing-whitespace:B0:L0:Xeof", bucket: "cosmetic", domains: [] };
}

// MUTANT_BUDGET — SINGLE SOURCE OF TRUTH (imported by the driver + every gate). A per-(operator,
// fixture) ceiling on generated mutants; the healthy corpus is ~1e5 total (hundreds per op×fixture),
// so 150k with headroom catches a fanout regression (e.g. per-char) without ever false-firing.
export const MUTANT_BUDGET = 150_000;

/** Raw LAZY operators — MODULE-PRIVATE (Codex plan-R24 [high]). Deliberately NOT exported: the
 *  ONLY way to enumerate an operator over corpus-scale input is `boundedMutants` below, which wraps
 *  the generator in the budget-guarded `guardStream`. Making the raw generators unreachable means
 *  no consumer can iterate an UNguarded stream and OOM/hang on a fanout regression — the guarded
 *  path is the only path (the structural closure of the R17–R24 memory/streaming vector). */
const OPERATOR_GENS: Record<string, (md: string) => Generator<Mutant>> = {
  "header-typo": headerTypo, "ref-sub": refSub, "unicode-inject": unicodeInject,
  "column-shift": columnShift, "blank-row:inject": blankRowInject, "blank-row:remove": blankRowRemove,
  "merged-cell": mergedCell, "section-reorder": sectionReorder, "trailing-whitespace": trailingWhitespace,
};

/** Shared fail-fast streaming guard (Codex plan-R24 [high]): yields items one at a time and THROWS
 *  before yielding the (budget+1)th, so an unbounded/fanned-out source fails deterministically with
 *  O(1) heap instead of being collected into an array. EVERY corpus-scale consumer routes through
 *  this via `boundedMutants`; a negative control (Task 10) exercises it directly. */
export function* guardStream<T>(gen: Iterable<T>, budget: number, label: string): Generator<T> {
  let n = 0;
  for (const x of gen) {
    if (++n > budget) throw new Error(`${label} exceeded budget ${budget} before array materialization`);
    yield x;
  }
}

/** THE canonical corpus-scale operator iterator: a budget-guarded stream of `op`'s mutants for
 *  `md`. The ONLY way to enumerate an operator over a real fixture — runAll, skippedInapplicable,
 *  the count-agreement gate, and the coverage summary all use it. */
export function boundedMutants(op: string, md: string): Generator<Mutant> {
  return guardStream(OPERATOR_GENS[op]!(md), MUTANT_BUDGET, `${op} fanout`);
}

/** The 9 operator names — for KEY iteration without importing the eager array form (`OPERATOR_NAMES`
 *  replaces `Object.keys(OPERATORS)` at the corpus call sites, so nothing depends on OPERATORS just
 *  to enumerate op names). */
export const OPERATOR_NAMES: readonly string[] = Object.keys(OPERATOR_GENS);

/** Eager ARRAY form for BOUNDED synthetic-input test call sites ONLY (which use
 *  `.filter/.map/.length/.find/.some/.slice`). It wraps `boundedMutants` — NOT the raw private
 *  generator — so even this path is budget-GUARDED (Codex plan-R25 [high]): a caller who mistakenly
 *  spreads it over a real fixture still hits the MUTANT_BUDGET fail-fast, never an unbounded
 *  materialization. There is therefore NO unguarded enumeration path in the module. Corpus loops
 *  MUST still stream `boundedMutants` (never build the array); the equivalence
 *  `[...boundedMutants(op, md)] === OPERATORS[op](md)` is pinned by a Task-4 unit test. */
export const OPERATORS: Record<string, (md: string) => Mutant[]> = Object.fromEntries(
  OPERATOR_NAMES.map((k) => [k, (md: string) => [...boundedMutants(k, md)]]),
);

export function floorEligible(mutants: Mutant[]): Set<Domain> {
  const s = new Set<Domain>();
  for (const m of mutants) for (const d of m.domains) if (RISK_CRITICAL.includes(d)) s.add(d);
  return s;
}

/**
 * Risk-critical domains PRESENT in the fixture (≥1 section classified to them)
 * but with NO applicable site for operator `op` — surfaced, never silently excused
 * (spec §4.3, Codex R5). A domain is "present" if any section classifies to it.
 */
export function skippedInapplicable(md: string, op: string): Domain[] {
  const present = new Set<Domain>();
  for (const s of seg(md).sections) { const d = classifySection(s); if (RISK_CRITICAL.includes(d)) present.add(d); }
  // Route through the shared budget-guarded stream (Codex plan-R23/R24 [high]): never materialize
  // the operator's full array here — this runs across the whole corpus (Task 11), so `boundedMutants`
  // gives both O(1) heap AND fail-fast on a fanout regression (it wraps guardStream over MUTANT_BUDGET).
  const eligible = new Set<Domain>();
  for (const m of boundedMutants(op, md)) for (const d of m.domains) if (RISK_CRITICAL.includes(d)) eligible.add(d);
  return [...present].filter((d) => !eligible.has(d)).sort();
}

// NOTE (plan-R2): detection is EXHAUSTIVE. The driver parses EVERY generated mutant —
// there is no cap and no `select`/reservation limiter, because a silent-wrong parse in an
// un-parsed site would ship undetected (spec §2 "every fixture × operator × site"). The
// coverage floor + independent applicability audit remain as guards that each risk-critical
// domain HAS applicable sites (catching an operator that stops enumerating a domain).
```

*(Note for the implementer: the `sectionReorder`/`blankRowRemove` line-arithmetic above is the reference algorithm; if a fixture's exact blank-line indexing differs, keep the CONTRACT — a byte-distinct mutant, correct `domains`, unique `siteId` — and adjust the mechanics. The Task-4 tests pin the contract.)*

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/parser/mutation/operators.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutation/operators.ts tests/parser/mutation/operators.test.ts
git commit --no-verify -m "test(parser): 8 mutation operators + floor-first selection + domains(site)"
```

---

### Task 5: Fixture registry + parity gate

**Files:**
- Create: `tests/parser/mutation/fixtures.ts`
- Test: `tests/parser/mutation/fixtures.test.ts`

**Interfaces:**
- Produces: `FIXTURES: Array<{ slug: string; family: "xlsx"|"raw"; path: string }>`, `readFixture(f): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/mutation/fixtures.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { FIXTURES } from "./fixtures";

describe("fixture registry parity (Codex R9)", () => {
  it("registry equals the committed .md set (minus README) in both dirs", () => {
    const md = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md").sort();
    const expected = [
      ...md("fixtures/shows/exporter-xlsx").map((f) => `fixtures/shows/exporter-xlsx/${f}`),
      ...md("fixtures/shows/raw").map((f) => `fixtures/shows/raw/${f}`),
    ].sort();
    expect(FIXTURES.map((f) => f.path).sort()).toEqual(expected);
  });
  it("has 17 entries (7 xlsx + 10 raw)", () => {
    expect(FIXTURES.filter((f) => f.family === "xlsx")).toHaveLength(7);
    expect(FIXTURES.filter((f) => f.family === "raw")).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/parser/mutation/fixtures.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// tests/parser/mutation/fixtures.ts
import { readFileSync } from "node:fs";

export type FixtureRef = { slug: string; family: "xlsx" | "raw"; path: string };

const XLSX = ["consultants", "east-coast", "fintech", "fixed-income", "redefining-fi", "ria", "rpas"];
const RAW = [
  "2024-05-east-coast-family-office", "2025-03-dci-rpas-central", "2025-04-asset-mgmt-cfo-coo",
  "2025-05-redefining-fixed-income-private-credit", "2025-06-ria-investment-forum",
  "2025-10-consultants-roundtable", "2025-10-fixed-income-trading-summit",
  "2026-03-rpas-central-four-seasons", "2026-04-asset-mgmt-cfo-coo-waldorf", "2026-05-fintech-forum-cto-summit",
];

export const FIXTURES: FixtureRef[] = [
  ...XLSX.map((slug): FixtureRef => ({ slug, family: "xlsx", path: `fixtures/shows/exporter-xlsx/${slug}.md` })),
  ...RAW.map((slug): FixtureRef => ({ slug, family: "raw", path: `fixtures/shows/raw/${slug}.md` })),
];

export const readFixture = (f: FixtureRef): string => readFileSync(f.path, "utf8");
```

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/parser/mutation/fixtures.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutation/fixtures.ts tests/parser/mutation/fixtures.test.ts
git commit --no-verify -m "test(parser): fixture registry + directory-parity gate"
```

---

### Task 6: Independent applicability audit + golden inventory

**Files:**
- Create: `tests/parser/mutation/applicabilityAudit.ts`
- Test: `tests/parser/mutation/applicabilityAudit.test.ts`

**Interfaces:**
- Consumes: ONLY `@/lib/parser/knownSections` (`normalizeHeader`, `KNOWN_SECTION_HEADERS`, `PREFIX_SECTION_FAMILIES`) + `./fixtures`. **Must NOT import `rows.ts`/`classify.ts`/`operators.ts`** (independence, Codex R13).
- Produces: `auditSites(md): Map<`\``${op}|${domain}`\``, number>`, `auditPresentRiskCritical(md): Set<string>`, `expectedSkipped(md, op): string[]` (independent zero-site domain presence, plan-R10), `GOLDEN_INVENTORY: Array<{ fixture; op; domain; count: number; lines: string }>` (exact HAND-COUNTED counts + line-range provenance).

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/mutation/applicabilityAudit.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { auditSites, GOLDEN_INVENTORY } from "./applicabilityAudit";
import { OPERATORS } from "./operators";

// ─── EXTERNAL ORACLE (plan-R8) ────────────────────────────────────────────────
// A tiny HAND-AUTHORED fixture whose per-operator/per-domain site counts were
// derived by a human reading the markdown — NOT copied from auditSites output.
// This is the true anti-tautology guard: if auditSites over/under-counts, these
// literals (counted by hand below) diverge and the test fails. Two sections:
//   CREW (crew): 2 data rows, each ["","Doug|Eric","917|646"] → 2 non-empty cells
//   HOTEL (hotel): 1 data row ["","Doug","3"] → 2 non-empty; "3" is 1-char
const HAND_FIXTURE =
  "| CREW | NAME | PHONE |\n|  | Doug | 917 |\n|  | Eric | 646 |\n\n| HOTEL | GUEST | NIGHTS |\n|  | Doug | 3 |";
// Hand-counted expected sites (see per-line reasoning in the plan body):
const HAND_EXPECTED: Record<string, number> = {
  "header-typo|crew": 1, "header-typo|hotel": 1,
  "ref-sub|crew": 4, "ref-sub|hotel": 2,          // non-empty data cells: 2+2 / 2
  "unicode-inject|crew": 4, "unicode-inject|hotel": 1, // ≥2-scalar cells; "3" excluded
  "merged-cell|crew": 4, "merged-cell|hotel": 2,  // (row.length-1) per ≥3-cell row
  "column-shift|crew": 1, "column-shift|hotel": 1, // one per section
  "blank-row:inject|crew": 1,                      // (dataRows-1); hotel has 1 row → 0
  "blank-row:remove|crew": 1, "blank-row:remove|hotel": 1, // one boundary, both domains
};

describe("independent applicability audit (Codex R9/R13)", () => {
  it("EXTERNAL ORACLE: auditSites matches hand-counted sites on a hand-authored fixture (plan-R8)", () => {
    const sites = auditSites(HAND_FIXTURE);
    const got: Record<string, number> = {};
    for (const [k, v] of sites) if (v > 0) got[k] = v;
    expect(got).toEqual(HAND_EXPECTED); // exact set + counts — no extra keys, no missing keys
  });
  it("counts a nonzero ref-sub|crew for consultants-roundtable's embedded CREW section", () => {
    const md = readFileSync("fixtures/shows/raw/2025-10-consultants-roundtable.md", "utf8");
    const sites = auditSites(md);
    expect(sites.get("ref-sub|crew") ?? 0).toBeGreaterThan(0);
    expect(sites.get("column-shift|crew") ?? 0).toBeGreaterThan(0);
  });
  it("every GOLDEN_INVENTORY count is present in the real fixture (sanity; EXACT pin is the excerpt test, plan-R7/R26)", () => {
    // The count is SECTION-scoped (a `lines` excerpt), so the whole-fixture total is >= it (a
    // domain can recur in other sections — e.g. rpas has HOTEL at L43 AND "HOTELS FOR DOUG'S DRIVE
    // BACK" at L59). The EXACT anti-tautology pin is the excerpt-localization test below
    // (`auditSites(excerpt) === count`); here we only sanity-check the section's sites exist in the
    // real fixture, so a wholesale audit failure (0 sites) is still caught.
    for (const g of GOLDEN_INVENTORY) {
      const md = readFileSync(g.fixture, "utf8");
      expect(auditSites(md).get(`${g.op}|${g.domain}`) ?? 0, `${g.fixture} ${g.op} ${g.domain}`).toBeGreaterThanOrEqual(g.count);
    }
  });
  it("every GOLDEN_INVENTORY row has CONCRETE, REAL, LOCALIZING provenance (plan-R10)", () => {
    for (const g of GOLDEN_INVENTORY) {
      // (a) concrete line range, never a TODO placeholder
      expect(g.lines, `${g.fixture} ${g.op} ${g.domain} lines must be a concrete range like "40-58"`).toMatch(/^\d+-\d+$/);
      const [start, end] = g.lines.split("-").map(Number) as [number, number];
      expect(start).toBeGreaterThanOrEqual(1);
      expect(end).toBeGreaterThanOrEqual(start);
      // (b) the range exists in the fixture
      const all = readFileSync(g.fixture, "utf8").split("\n");
      expect(end, `${g.fixture} lines ${g.lines} exceed file length ${all.length}`).toBeLessThanOrEqual(all.length);
      // (c) the count LOCALIZES to exactly those lines — auditing the excerpt alone reproduces
      //     the count. A number pasted from a different section (or the whole file) fails here,
      //     so provenance cannot be bogus while the count still matches.
      const excerpt = all.slice(start - 1, end).join("\n");
      expect(auditSites(excerpt).get(`${g.op}|${g.domain}`) ?? 0, `${g.fixture} ${g.op} ${g.domain} does not localize to lines ${g.lines}`).toBe(g.count);
    }
  });
  it("GOLDEN_INVENTORY is structurally non-vacuous (plan-R6)", () => {
    const CORRUPT = ["header-typo", "ref-sub", "unicode-inject", "column-shift", "blank-row:inject", "blank-row:remove", "merged-cell"];
    expect(GOLDEN_INVENTORY.length).toBeGreaterThanOrEqual(CORRUPT.length);
    const ops = new Set(GOLDEN_INVENTORY.map((g) => g.op));
    for (const op of CORRUPT) expect(ops.has(op), `golden inventory missing operator ${op}`).toBe(true);
    const has = (op: string, domain: string) => GOLDEN_INVENTORY.some((g) => g.op === op && g.domain === domain && g.count >= 1);
    expect(has("ref-sub", "hotel"), "need a ref-sub × hotel row").toBe(true);
    expect(has("merged-cell", "hotel"), "need a merged-cell × hotel row").toBe(true);
    expect(has("ref-sub", "crew"), "need a ref-sub × crew row").toBe(true);
    const domains = new Set(GOLDEN_INVENTORY.map((g) => g.domain));
    expect(domains.size, "golden inventory too narrow").toBeGreaterThanOrEqual(3);
  });
});

describe("audit independence is EXECUTABLE (plan-R7/R8/R25)", () => {
  it("NO import/export-from/require/import() in applicabilityAudit.ts RESOLVES to a shared harness module", () => {
    // Codex plan-R25 [medium]: a string-match on `./rows` misses alias/parent forms
    // (`../mutation/rows`, `@/tests/parser/mutation/rows`). Instead RESOLVE every specifier to an
    // absolute path and compare against the three forbidden sibling files — fail-closed for any
    // form that actually resolves to rows.ts / classify.ts / operators.ts.
    const auditPath = resolve("tests/parser/mutation/applicabilityAudit.ts");
    const src = readFileSync(auditPath, "utf8");
    const dir = dirname(auditPath);
    const repoRoot = resolve("."); // `@/*` → repo root (tsconfig.json:25-26)
    const forbidden = new Set(["rows", "classify", "operators"].map((m) => resolve(dir, `${m}.ts`)));
    const specifiers = [
      ...src.matchAll(/(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g),
    ]
      .map((m) => m[1] ?? m[2]!)
      .filter(Boolean);
    for (const spec of specifiers) {
      const base = spec.startsWith("@/") ? resolve(repoRoot, spec.slice(2)) : resolve(dir, spec);
      const withTs = base.endsWith(".ts") ? base : `${base}.ts`;
      expect(
        forbidden.has(withTs),
        `applicabilityAudit must not depend on a shared harness module (resolved ${spec} → ${withTs})`,
      ).toBe(false);
    }
  });
});

describe("blank-row:remove same-domain boundary is credited ONCE (plan-R8)", () => {
  it("two adjacent same-domain runs → operator and audit both count exactly 1 for that domain", () => {
    // two CREW runs separated by one blank line — same domain on both sides.
    const md = "| CREW | NAME |\n|  | Doug |\n\n| CREW | NAME |\n|  | Eric |";
    const gen = OPERATORS["blank-row:remove"]!(md).filter((m) => m.domains.includes("crew"));
    expect(gen).toHaveLength(1);                       // one physical boundary, not double-counted
    expect(gen[0]!.domains).toEqual(["crew"]);         // deduped
    expect(auditSites(md).get("blank-row:remove|crew") ?? 0).toBe(1);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/parser/mutation/applicabilityAudit.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation** — self-contained scan (own segmentation, own classifier). The `HAND_FIXTURE` external-oracle test is the anti-tautology anchor: its counts are human-derived, so `auditSites` must be MADE CORRECT to match them (never edit `HAND_EXPECTED` to match a buggy audit). For the real-fixture `GOLDEN_INVENTORY` rows, hand-count each `(op, domain)` by reading the fixture markdown directly and set `count` to that hand-derived number — do NOT copy `auditSites` output into the table (that would make the guard circular, plan-R8). If a hand-count and the audit disagree, one of them is wrong: reconcile by re-reading the fixture, not by trusting the code.

```ts
// tests/parser/mutation/applicabilityAudit.ts
import { normalizeHeader, KNOWN_SECTION_HEADERS, PREFIX_SECTION_FAMILIES } from "@/lib/parser/knownSections";

// --- own minimal, independent header/domain resolution (NOT imported from classify.ts) ---
const DOMAIN_OF: Record<string, string> = {
  CREW: "crew", TECH: "crew", HOTEL: "hotel", HOTELS: "hotel", "HOTEL RESERVATIONS": "hotel",
  "HOTEL RESERVATION": "hotel", "HOTEL STAYS": "hotel", "HOTEL STAY": "hotel",
  "GENERAL SESSION": "rooms", BREAKOUT: "rooms", BREAKOUTS: "rooms", "ADDITIONAL ROOM": "rooms",
  "LUNCH ROOM": "rooms", "LUNCH SESSION": "rooms", FOYER: "rooms",
  "EVENT DETAILS": "event_details", DETAILS: "event_details", "GS DETAILS": "event_details",
  TRANSPORTATION: "transportation", DATES: "dates", AGENDA: "agenda", "AGENDA LINK": "agenda",
  VENUE: "venue", VENUES: "venue", DRESS: "dress", "IN HOUSE AV": "contacts", CLIENT: "client",
  "PULL SHEET": "pull_sheet", COI: "documents", "DOCUMENT FOLDER LINK": "documents",
};
function resolve(col0: string): string | null {
  const n = normalizeHeader(col0);
  if (KNOWN_SECTION_HEADERS.has(n)) return n;
  if (/^TRANSPORTATION\//.test(n)) return "TRANSPORTATION"; // v4 slash header (transport.ts:170) — independent mirror, plan-R11
  for (const fam of PREFIX_SECTION_FAMILIES)
    if (n.startsWith(fam) && (n.length === fam.length || /[^A-Z0-9]/.test(n[fam.length] ?? " "))) return fam;
  return null;
}
// EXACT parser parity (splitRow): split on raw pipe, drop framing via slice(1,-1) — so a
// missing trailing pipe drops the final cell, identical to parseSheet (plan-R13).
const cellsOf = (line: string) => line.trim().split("|").slice(1, -1).map((c) => c.trim());
const ALIGN = /^:?-{1,}:?$/;
const rowClass = (cells: string[]): "header" | "alignment" | "spacer" | "data" => {
  const ne = cells.filter((c) => c);
  if (ne.length === 0) return "spacer";
  if (ne.every((c) => ALIGN.test(c))) return "alignment";
  if (resolve(cells[0] ?? "")) return "header";
  return "data";
};

type Sec = { domain: string; headerToken: string | null; dataRows: string[][]; runIndex: number };
function sections(md: string): Sec[] {
  const out: Sec[] = [];
  let cur: Sec | null = null, runIndex = -1, inRun = false;
  for (const line of md.split("\n")) {
    if (line.trim() === "" || !line.trim().startsWith("|")) { cur = null; inRun = false; continue; }
    if (!inRun) { inRun = true; runIndex++; }
    const cells = cellsOf(line), cls = rowClass(cells);
    if (cls === "header") { cur = { domain: DOMAIN_OF[resolve(cells[0]!)!] ?? "other", headerToken: (cells[0] ?? "").trim(), dataRows: [], runIndex }; out.push(cur); }
    else if (cls === "data") { if (!cur) { cur = { domain: "other", headerToken: null, dataRows: [], runIndex }; out.push(cur); } cur.dataRows.push(cells); }
  }
  return out;
}

/**
 * Independently replicate the operator's header-typo eligibility guard (plan-R4):
 * ≥2 chars, an adjacent distinct pair exists, and the transposition is NOT itself a
 * recognized header. Kept minimal + local so the audit stays implementation-independent
 * of operators.ts while counting the SAME eligible sites for exact agreement.
 */
function typoEligible(token: string): boolean {
  const chars = [...token];
  if (chars.length < 2) return false;
  let pos = -1;
  for (let i = 0; i < chars.length - 1; i++) if (chars[i] !== chars[i + 1]) { pos = i; break; }
  if (pos < 0) return false;
  [chars[pos], chars[pos + 1]] = [chars[pos + 1]!, chars[pos]!];
  return resolve(chars.join("")) === null; // transposed token must not be a real header
}

/** Independent site counts per `${op}|${domain}` from raw markdown (covers ALL 7 corrupting ops, plan-R1). */
export function auditSites(md: string): Map<string, number> {
  const m = new Map<string, number>();
  const bump = (op: string, domain: string, n = 1) => m.set(`${op}|${domain}`, (m.get(`${op}|${domain}`) ?? 0) + n);
  const secs = sections(md);
  for (const s of secs) {
    if (s.headerToken && typoEligible(s.headerToken)) bump("header-typo", s.domain); // exact typo-eligible count (plan-R4)
    for (const row of s.dataRows) {
      const cells = row.filter((c) => c.length > 0);
      // ref-sub excludes cells already `#REF!` (no-op parity with the operator, plan-R18);
      // unicode-inject keeps them (injecting a ZWNJ into `#REF!` IS a real, non-identical change).
      bump("ref-sub", s.domain, cells.filter((c) => c.trim() !== "#REF!").length);
      bump("unicode-inject", s.domain, cells.filter((c) => [...c].length >= 2).length);
      if (row.length >= 3) bump("merged-cell", s.domain, row.length - 1); // one per interior pipe (plan-R5)
    }
    if (s.dataRows.length >= 1) bump("column-shift", s.domain);
    if (s.dataRows.length >= 2) bump("blank-row:inject", s.domain, s.dataRows.length - 1); // one per gap (plan-R3)
  }
  // blank-row:remove — one boundary site per adjacent run pair; credited to EACH adjacent
  // section's domain (the last section of run i and the first of run i+1).
  const firstOfRun = new Map<number, Sec>(), lastOfRun = new Map<number, Sec>();
  for (const s of secs) { if (!firstOfRun.has(s.runIndex)) firstOfRun.set(s.runIndex, s); lastOfRun.set(s.runIndex, s); }
  const runs = [...new Set(secs.map((s) => s.runIndex))].sort((a, b) => a - b);
  for (let i = 0; i < runs.length - 1; i++) {
    const a = lastOfRun.get(runs[i]!)!, b = firstOfRun.get(runs[i + 1]!)!;
    bump("blank-row:remove", a.domain);
    if (b.domain !== a.domain) bump("blank-row:remove", b.domain);
  }
  return m;
}

/** The 7 risk-critical domains — DUPLICATED here (not imported from classify.ts) so this
 *  audit's domain-presence view is independent of the shared classifier (plan-R10). */
const RISK_CRITICAL_AUDIT: ReadonlySet<string> = new Set([
  "crew", "hotel", "rooms", "transportation", "agenda", "dates", "event_details",
]);

/** Risk-critical domains the INDEPENDENT scan finds present (≥1 section), regardless of
 *  whether any operator has a site there — the reference for "present but inapplicable". */
export function auditPresentRiskCritical(md: string): Set<string> {
  const s = new Set<string>();
  for (const sec of sections(md)) if (RISK_CRITICAL_AUDIT.has(sec.domain)) s.add(sec.domain);
  return s;
}

/** Independently-derived expected `skippedInapplicable(md, op)`: every present risk-critical
 *  domain with ZERO audit sites for `op`. If the shared classifier regresses and drops a
 *  present domain, the shared `skippedInapplicable` omits it while THIS still lists it →
 *  the driver's equality assertion fails (plan-R10). Includes zero-site domains by design. */
export function expectedSkipped(md: string, op: string): string[] {
  const sites = auditSites(md);
  return [...auditPresentRiskCritical(md)].filter((d) => (sites.get(`${op}|${d}`) ?? 0) === 0).sort();
}

/**
 * EXACT counts HAND-DERIVED from the fixture markdown (plan-R7/R9). The `count` for each row
 * is obtained by a human OPENING the fixture at the cited `lines` range, reading the section,
 * and counting the operator's applicable sites BY HAND — it is NOT copied from `auditSites`
 * output (that would make this guard circular: a miscounting audit could preserve its own bad
 * number, plan-R9). The test asserts `auditSites(...) === count` exactly, so a hand-count that
 * disagrees with the audit means the AUDIT is wrong and must be fixed — never adjust `count` to
 * match the code. The `lines` field is provenance: it forces the derivation to be reproducible
 * and makes a lazy copy-from-code visible in review. MUST cover every corrupting operator + the
 * required rows the structural gate checks: ref-sub×hotel, merged-cell×hotel, ref-sub×crew, one
 * header-typo, one blank-row:remove. (The `HAND_FIXTURE` test above is the separate, fully
 * self-contained external oracle; this table extends that guarantee onto the real corpus.)
 */
export const GOLDEN_INVENTORY: Array<{ fixture: string; op: string; domain: string; count: number; lines: string }> = [
  // Every `count` is a real HAND-COUNT against the fixture excerpt at `lines` (Step 3b), NOT pasted
  // from auditSites. `lines` is a concrete `<start>-<end>` range (the provenance test enforces the
  // shape AND that auditSites(excerpt)===count). The rows below are the author's hand-count; the
  // implementer RE-VERIFIES each against `auditSites(sliceLines(fixture, lines))` before the green
  // run — the localization test is the arbiter, and per plan-R9 a disagreement means the AUDIT is
  // wrong (fix auditSites), never adjust the count to match code.
  //
  // consultants CREW section — header L69, six data rows L70-75, spacer L76; each data row has 3
  // non-empty cells (name / role / phone; col0 + trailing col empty):
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "ref-sub", domain: "crew", count: 18, lines: "69-76" }, // 6 rows × 3 cells
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "unicode-inject", domain: "crew", count: 18, lines: "69-76" }, // all 3 cells ≥2 scalars
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "merged-cell", domain: "crew", count: 24, lines: "69-76" }, // 6 rows × (5 cells − 1)
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "column-shift", domain: "crew", count: 1, lines: "69-76" }, // 1 per section w/ ≥1 data row
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "header-typo", domain: "crew", count: 1, lines: "69-76" }, // CREW header, typo-eligible
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "blank-row:inject", domain: "crew", count: 5, lines: "69-76" }, // 6 data rows → 5 gaps
  // consultants DRESS-run → TRANSPORTATION-run boundary (blank L79):
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "blank-row:remove", domain: "transportation", count: 1, lines: "77-80" }, // one inter-run boundary
  // rpas HOTEL section — header L43, alignment L44, 13 data rows L45-57 (L58 is blank, L59 starts the
  // separate "HOTELS FOR DOUG'S DRIVE BACK" section); each data row has 4 non-empty cells (Codex R27):
  { fixture: "fixtures/shows/exporter-xlsx/rpas.md", op: "ref-sub", domain: "hotel", count: 52, lines: "43-57" }, // 13 rows × 4 cells
  { fixture: "fixtures/shows/exporter-xlsx/rpas.md", op: "merged-cell", domain: "hotel", count: 52, lines: "43-57" }, // 13 rows × (5 cells − 1)
];
```

> **Note on the exact counts:** the values above are the author's hand-count from the cited fixtures at the cited lines. During Step 3b the implementer opens each excerpt and re-derives the number; if `auditSites(excerpt)` yields a different value, first re-count by hand — if the hand-count still disagrees, the AUDIT is wrong and `auditSites` is fixed (plan-R9), and only if the author's committed number here was the miscount is THIS table corrected. No row ever carries a `TODO`/non-numeric `lines`.

- [ ] **Step 3b (hand-count RE-VERIFICATION, precedes green):** the `GOLDEN_INVENTORY` above ships with concrete hand-counted values + real `<start>-<end>` line ranges (no `TODO`). Before running, RE-VERIFY each row: open the fixture at `lines`, hand-count the operator's applicable sites in that excerpt, and confirm it matches the committed `count`. Do NOT paste `auditSites` output into `count`. If your hand-count disagrees with `auditSites(excerpt)`, the AUDIT is wrong — fix `auditSites`, not the golden number (plan-R9); only correct THIS table if the committed number was itself a miscount.

- [ ] **Step 4: Run it — verify it passes.** The provenance test asserts every `lines` matches `/^\d+-\d+$/` AND `auditSites(sliceLines(fixture, lines)) === count`; the non-vacuity test asserts all 7 corrupting operators + `ref-sub×hotel` + `merged-cell×hotel` + `ref-sub×crew` are present. Expected: PASS.

Run: `pnpm vitest run tests/parser/mutation/applicabilityAudit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutation/applicabilityAudit.ts tests/parser/mutation/applicabilityAudit.test.ts
git commit --no-verify -m "test(parser): implementation-independent applicability audit + golden inventory"
```

---

### Task 7: Known-holes ledger + bidirectional reconcile (TDD)

**Files:**
- Create: `tests/parser/mutation/knownHoles.ts`
- Test: `tests/parser/mutation/knownHoles.test.ts`

**Interfaces:**
- Produces: `KnownHole` type, `Alarm` type, `ledgerKey(a)`, `reconcileLedger(actual, ledger): { newAlarms; staleRows }`, `KNOWN_SILENT_HOLES: readonly KnownHole[]`.
- Consumed by: the driver (Task 8) — the driver builds the `actual` alarm set and calls `reconcileLedger`, so the bidirectional comparison lives in ONE tested function, not inline in the driver (plan-R9).

- [ ] **Step 1: Write the failing test FIRST (red — module does not exist yet)**

```ts
// tests/parser/mutation/knownHoles.test.ts
import { describe, it, expect } from "vitest";
import { reconcileLedger, ledgerKey, KNOWN_SILENT_HOLES } from "./knownHoles";
import type { Alarm, KnownHole } from "./knownHoles";

const A = (siteId: string, kind: Alarm["kind"], fingerprint: string): Alarm => ({ siteId, kind, fingerprint });
const H = (siteId: string, kind: KnownHole["kind"], fingerprint: string): KnownHole =>
  ({ siteId, kind, fingerprint, finding: "#1", note: "n" });

describe("reconcileLedger is bidirectional (plan-R9)", () => {
  it("empty vs empty → clean", () => {
    expect(reconcileLedger([], [])).toEqual({ newAlarms: [], staleRows: [] });
  });
  it("actual ∖ ledger → newAlarms (a NEW silent hole fails)", () => {
    const r = reconcileLedger([A("s1", "wrong", "fp")], []);
    expect(r.newAlarms).toEqual(["s1|wrong|fp"]);
    expect(r.staleRows).toEqual([]);
  });
  it("ledger ∖ actual → staleRows (a FIXED/drifted hole fails, forces shrinkage)", () => {
    const r = reconcileLedger([], [H("s1", "wrong", "fp")]);
    expect(r.newAlarms).toEqual([]);
    expect(r.staleRows).toEqual(["s1|wrong|fp"]);
  });
  it("same site+kind but CHANGED fingerprint → BOTH directions fire (deepened hole not masked)", () => {
    const r = reconcileLedger([A("s1", "wrong", "fpNEW")], [H("s1", "wrong", "fpOLD")]);
    expect(r.newAlarms).toEqual(["s1|wrong|fpNEW"]);
    expect(r.staleRows).toEqual(["s1|wrong|fpOLD"]);
  });
  it("kind is part of the key (wrong vs signal_loss are distinct holes)", () => {
    const r = reconcileLedger([A("s1", "signal_loss", "fp")], [H("s1", "wrong", "fp")]);
    expect(r.newAlarms).toEqual(["s1|signal_loss|fp"]);
    expect(r.staleRows).toEqual(["s1|wrong|fp"]);
  });
  it("exact match → clean (order-independent)", () => {
    expect(reconcileLedger([A("a", "wrong", "1"), A("b", "signal_loss", "2")], [H("b", "signal_loss", "2"), H("a", "wrong", "1")]))
      .toEqual({ newAlarms: [], staleRows: [] });
  });
});

describe("committed ledger shape", () => {
  it("KNOWN_SILENT_HOLES rows all carry the required fields", () => {
    for (const h of KNOWN_SILENT_HOLES) {
      expect(typeof h.siteId).toBe("string");
      expect(["wrong", "signal_loss"]).toContain(h.kind);
      expect(typeof h.fingerprint).toBe("string");
      expect(h.finding.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/parser/mutation/knownHoles.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the module (starts with an empty ledger; populated in Task 8 from the day-1 run)**

```ts
// tests/parser/mutation/knownHoles.ts
export type Alarm = { siteId: string; kind: "wrong" | "signal_loss"; fingerprint: string };
export type KnownHole = Alarm & {
  finding: string;                       // audit finding ref e.g. "#3" | "#5" | "unaudited"
  note: string;
};

/** Stable comparison key — a hole is identified by (siteId, kind, fingerprint) so a
 *  DEEPENED hole (same site/kind, changed behavior fingerprint) reads as both a stale
 *  old row AND a new alarm, never silently absorbed (plan-R9). */
export const ledgerKey = (a: Alarm): string => `${a.siteId}|${a.kind}|${a.fingerprint}`;

/** Bidirectional set diff: newAlarms = actual ∖ ledger (fail — undocumented hole),
 *  staleRows = ledger ∖ actual (fail — fixed/drifted; forces the ledger to shrink). */
export function reconcileLedger(
  actual: readonly Alarm[],
  ledger: readonly KnownHole[],
): { newAlarms: string[]; staleRows: string[] } {
  const a = new Set(actual.map(ledgerKey));
  const l = new Set(ledger.map(ledgerKey));
  return {
    newAlarms: [...a].filter((k) => !l.has(k)),
    staleRows: [...l].filter((k) => !a.has(k)),
  };
}

// Populated in Task 8 from the day-1 harness run against branch HEAD.
export const KNOWN_SILENT_HOLES: readonly KnownHole[] = [];
```

- [ ] **Step 4: Run it — verify GREEN**

Run: `pnpm vitest run tests/parser/mutation/knownHoles.test.ts`
Expected: PASS (reconcile bidirectional; ledger empty so shape test is vacuously green).

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutation/knownHoles.ts tests/parser/mutation/knownHoles.test.ts
git commit --no-verify -m "test(parser): known-holes ledger + bidirectional reconcile (TDD red→green)"
```

---

### Task 8: Driver — full harness + all structural gates + day-1 ledger population

**Files:**
- Create: `tests/parser/mutationHarness.test.ts`
- Modify: `tests/parser/mutation/knownHoles.ts` (populate `KNOWN_SILENT_HOLES` from the day-1 run)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Measure the exhaustive corpus size + wall-clock budget (plan-R17)**

Before committing to the exhaustive design, measure it. The count is cheap (operators are pure string transforms — no `parseSheet`); the full parse is the expensive part, timed once here to confirm it fits the 300s hook ceiling with margin.

Run a throwaway measurement as a temporary vitest file (vitest resolves the `@/` alias the operator/oracle modules use — a bare `tsx` run does not). Delete after recording — do not commit:

```ts
// tests/parser/mutation/_measure.test.ts   (TEMPORARY — delete before committing Task 8)
import { it } from "vitest";
import { FIXTURES, readFixture } from "./fixtures";
import { boundedMutants, OPERATOR_NAMES } from "./operators";
import { capture, verdict } from "./oracle";
it("measure corpus size + wall-clock", () => {
  let count = 0;
  // Stream through boundedMutants (no array materialization) — mirrors runAll's O(1) shape, so peak
  // heap here matches the real driver, not an accumulate-then-count proxy (Codex plan-R19/R20/R24).
  for (const f of FIXTURES) for (const op of OPERATOR_NAMES) for (const _ of boundedMutants(op, readFixture(f))) count++;
  const t0 = performance.now();
  for (const f of FIXTURES) { const md = readFixture(f); const b = capture(md, `${f.slug}.md`);
    for (const op of OPERATOR_NAMES) for (const m of boundedMutants(op, md)) verdict(b, capture(m.md, `${f.slug}.md`)); }
  console.log(`[measure] mutant count: ${count}  full-parse wall-clock ms: ${Math.round(performance.now() - t0)}`);
}, 300_000);
```

Run: `pnpm vitest run tests/parser/mutation/_measure.test.ts` then `rm tests/parser/mutation/_measure.test.ts`.

Record both numbers in the Task 8 commit message. **MEASURED (2026-07-06): 101,795 mutants; ~29.8 ms/parse; ≈ 3,029 s (~50 min) serial full parse.** The count (101,795) sets the corpus-budget assertion (≤ `MUTANT_BUDGET` 150,000 — comfortably under; no raise needed). The wall-clock outcome:
  - **count ≤ `MUTANT_BUDGET` (150_000)** ✔ — 101,795 with ~48k headroom. (If a future fixture pushes it near the ceiling, raise `MUTANT_BUDGET` deliberately after confirming the fanout is intended, not a per-char bug.)
  - **wall-clock ≈ 3,029 s — 20× the ~150 s a merge-gating `unit-suite` leg can absorb.** Sampling was rejected (a silent-wrong parse in an un-parsed site would ship undetected, §4.3); ~20-file FILE-level sharding is fragile against the 20-min leg timeout. **RESOLUTION (user-directed 2026-07-06): keep full exhaustiveness and move the harness OFF the merge-gating path onto a dedicated NIGHTLY workflow** (Task 12) — excluded from the default suite, run only via `VITEST_INCLUDE_MUTATION_HARNESS=1` on a `schedule:` + `workflow_dispatch:` job with a 90-min leg timeout. The single-`beforeAll` design below is unchanged EXCEPT its hook timeout is raised to 75 min (`4_500_000 ms`) to cover the ~50-min run.

Proceed with the single-`beforeAll` design below (nightly-scoped per Task 12).

- [ ] **Step 2: Write the driver test (initially expected RED — the ledger is empty but real holes exist)**

```ts
// tests/parser/mutationHarness.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { FIXTURES, readFixture } from "./mutation/fixtures";
import { boundedMutants, MUTANT_BUDGET, OPERATOR_NAMES } from "./mutation/operators";
import type { Mutant } from "./mutation/operators";
import { capture, verdict, fingerprint } from "./mutation/oracle";
import { KNOWN_SILENT_HOLES, reconcileLedger } from "./mutation/knownHoles";
import type { Alarm } from "./mutation/knownHoles";

// MUTANT_BUDGET is the single source of truth in operators.ts (imported above) — the per-(operator,
// fixture) fanout ceiling. Here it doubles as the GLOBAL corpus-size guard (below) and is asserted
// by the "corpus size within budget" test. Op names come from `OPERATOR_NAMES` (NOT the eager
// `OPERATORS` array form); the corpus is streamed through `boundedMutants`.

// Prefix each operator's siteId with the fixture slug so keys are globally unique across
// the corpus. Operator siteIds start "<op>:B..:L..:X.." → "<op>:<slug>:B..:L..:X..".
const withSlug = (m: Mutant, op: string, slug: string): Mutant =>
  ({ ...m, siteId: `${op}:${slug}:${m.siteId.slice(op.length + 1)}` });

/** Exhaustive: parse EVERY generated mutant across all fixtures × operators (plan-R2).
 *  SINGLE-PASS STREAMING (Codex plan-R18–R24 [high], memory vector closed STRUCTURALLY): the corpus
 *  is streamed through `boundedMutants(op, md)` — the only exported corpus-scale iterator, which
 *  embeds the per-(op,fixture) `guardStream(..., MUTANT_BUDGET)` fail-fast guard — so an explosive
 *  single-operator fanout throws with O(1) heap before any array materializes. A SECOND, global
 *  `++n > MUTANT_BUDGET` guard here caps the whole-corpus total (defends the many-ops-each-large
 *  case). Nothing corpus-wide is retained except short siteId strings (+ actual alarms/noOps).
 *  `noOps` flags any operator emitting a byte-identical mutant (plan-R18). */
function runAll(): { alarms: Alarm[]; allSiteIds: string[]; cosmeticViolations: string[]; noOps: string[] } {
  const alarms: Alarm[] = [];
  const allSiteIds: string[] = [];
  const cosmeticViolations: string[] = [];
  const noOps: string[] = [];
  let n = 0;
  for (const f of FIXTURES) {
    const md = readFixture(f);
    const baseline = capture(md, `${f.slug}.md`);
    for (const op of OPERATOR_NAMES) {
      for (const raw of boundedMutants(op, md)) { // per-(op,fixture) budget guard inside boundedMutants
        if (++n > MUTANT_BUDGET) {
          throw new Error(`corpus mutant count exceeded MUTANT_BUDGET ${MUTANT_BUDGET} — operator fanout regression?`);
        }
        const m = withSlug(raw, op, f.slug);
        allSiteIds.push(m.siteId);
        if (m.md === md) noOps.push(m.siteId); // byte-identical mutant = false coverage (plan-R18)
        const mut = capture(m.md, `${f.slug}.md`);
        const v = verdict(baseline, mut);
        if (m.bucket === "cosmetic") {
          if (v !== "ABSORBED") cosmeticViolations.push(m.siteId); // cosmetic must be fully invisible
          continue;
        }
        if (v === "SILENT_WRONG") alarms.push({ siteId: m.siteId, kind: "wrong", fingerprint: fingerprint(baseline, mut) });
        if (v === "SILENT_SIGNAL_LOSS") alarms.push({ siteId: m.siteId, kind: "signal_loss", fingerprint: fingerprint(baseline, mut) });
      }
    }
  }
  return { alarms, allSiteIds, cosmeticViolations, noOps };
}

// The exhaustive corpus parse is DEFERRED into a beforeAll (NOT executed at describe-collection
// time) and scoped to THIS describe only. Consequence (closes Codex plan-R17 [high]): a targeted
// run of the cheap structural-gate describes added in Task 9 — `-t "classifier parity"`,
// `-t "COUNT-level audit agreement"`, and their red-phase probes — collects this module but runs
// only the matched describe's hooks/tests, so `runAll()` never fires for those. Only tests INSIDE
// this describe pay the corpus cost. The hook carries an explicit 75-min (4_500_000 ms) timeout
// because the measured corpus wall-clock (Step 1) is ~50 min — far past vitest's default hookTimeout
// (10s) AND past the 300s originally planned before the exhaustive corpus was measured. This heavy
// file is EXCLUDED from the default/unit-suite discovery and run ONLY by the nightly workflow
// (opt-in VITEST_INCLUDE_MUTATION_HARNESS, Task 12) — the beforeAll deferral additionally keeps its
// cost off any targeted `-t` sibling-gate run within the same file.
describe("mutation harness — bidirectional known-holes ledger", () => {
  let R: { alarms: Alarm[]; allSiteIds: string[]; cosmeticViolations: string[]; noOps: string[] };
  beforeAll(() => {
    R = runAll(); // throws (fails the hook) if Phase-1 mutant count exceeds MUTANT_BUDGET before any parse
  }, 4_500_000);

  it("corpus size is within the documented runtime budget (plan-R17)", () => {
    expect(R.allSiteIds.length).toBeGreaterThan(0);
    expect(R.allSiteIds.length, `mutant count exceeds MUTANT_BUDGET — measure + update deliberately`).toBeLessThanOrEqual(MUTANT_BUDGET);
  });
  it("no emitted mutant is byte-identical to its baseline fixture (plan-R18)", () => {
    expect(R.noOps, `byte-identical no-op mutants (false coverage):\n${R.noOps.join("\n")}`).toEqual([]);
  });
  it("all generated siteIds are globally unique (Codex R2)", () => {
    expect(new Set(R.allSiteIds).size).toBe(R.allSiteIds.length);
  });
  it("cosmetic operators are fully invisible (payload + signals unchanged)", () => {
    expect(R.cosmeticViolations).toEqual([]);
  });
  it("actual alarms == committed ledger, keyed (siteId, kind, fingerprint) — bidirectional", () => {
    const { newAlarms, staleRows } = reconcileLedger(R.alarms, KNOWN_SILENT_HOLES);
    expect(newAlarms, `NEW/changed alarms not in ledger:\n${newAlarms.join("\n")}`).toEqual([]);
    expect(staleRows, `stale ledger rows (fixed or drifted):\n${staleRows.join("\n")}`).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it — observe the day-1 alarm set**

Run: `pnpm vitest run tests/parser/mutationHarness.test.ts`
Expected: FAIL on the ledger test with a printed list of `newHoles` (the day-1 `SILENT_WRONG`/`SILENT_SIGNAL_LOSS` alarms — these are the real audit findings #1–#13). The uniqueness + cosmetic tests should PASS. If cosmetic FAILS, fix the operator (a cosmetic op changed output) before proceeding.

- [ ] **Step 4: Populate the ledger** — copy each printed `siteId|kind|fingerprint` into `KNOWN_SILENT_HOLES`, mapping each to its audit finding (`#1`–`#13`, or `"unaudited"` + a `BACKLOG.md` note). Example row:

```ts
export const KNOWN_SILENT_HOLES: readonly KnownHole[] = [
  { siteId: "header-typo:rpas:B..:L..:X0", kind: "wrong", fingerprint: "abc123...", finding: "#5", note: "HOTEL header typo silently drops the section (short-header no typo tolerance)" },
  // ...one row per day-1 alarm, finding mapped from the audit table.
];
```

- [ ] **Step 5: Re-run — verify GREEN**

Run: `pnpm vitest run tests/parser/mutationHarness.test.ts`
Expected: PASS (ledger == day-1 alarm set; corpus-budget test green).

- [ ] **Step 6: Commit**

```bash
git add tests/parser/mutationHarness.test.ts tests/parser/mutation/knownHoles.ts
git commit --no-verify -m "feat(parser): mutation harness driver + day-1 known-holes ledger (audit findings #1-#13)

Measured corpus: <count> mutants, <ms> ms full parse (plan-R17 runtime budget)."
```

---

### Task 9: Classifier-parity + coverage-floor + audit-agreement gates in the driver

**Files:**
- Modify: `tests/parser/mutationHarness.test.ts` (add gate blocks)

**Interfaces:**
- Consumes: `SECTION_DOMAIN_MAP`, `resolveHeader` (`./mutation/classify`), `EXPECTED_HEADER_DOMAINS` (`./mutation/expectedDomains`), `OPERATORS` (`./mutation/operators`), `auditSites` (`./mutation/applicabilityAudit`), `KNOWN_SECTION_HEADERS`/`PREFIX_SECTION_FAMILIES`/`normalizeHeader` (`@/lib/parser/knownSections`).

- [ ] **Step 1: Add the gate tests**

```ts
// append to tests/parser/mutationHarness.test.ts
import { KNOWN_SECTION_HEADERS, PREFIX_SECTION_FAMILIES, normalizeHeader } from "@/lib/parser/knownSections";
import { SECTION_DOMAIN_MAP, resolveHeader } from "./mutation/classify";
import { EXPECTED_HEADER_DOMAINS } from "./mutation/expectedDomains";
import { OPERATORS as OPS } from "./mutation/operators";
import { auditSites } from "./mutation/applicabilityAudit";

describe("classifier parity gate (Codex R2/R4/R8/R20)", () => {
  it("every KNOWN_SECTION_HEADERS entry is mapped and non-other", () => {
    for (const h of KNOWN_SECTION_HEADERS) {
      expect(SECTION_DOMAIN_MAP[h], `unmapped: ${h}`).toBeDefined();
      expect(SECTION_DOMAIN_MAP[h], `${h}=other`).not.toBe("other");
    }
  });
  it("suffixed room families resolve to rooms", () => {
    for (const fam of PREFIX_SECTION_FAMILIES) expect(SECTION_DOMAIN_MAP[resolveHeader(`${fam} SALON A`)!]).toBe("rooms");
  });
  it("EXPECTED_HEADER_DOMAINS covers the live registry (a new parser header forces a row, R20)", () => {
    const covered = new Set(EXPECTED_HEADER_DOMAINS.map(([h]) => normalizeHeader(h)));
    for (const h of KNOWN_SECTION_HEADERS) expect(covered, `no expected-domain row for ${h}`).toContain(h);
  });
  it("lockstep: SECTION_DOMAIN_MAP agrees with the independent EXPECTED_HEADER_DOMAINS oracle", () => {
    for (const [h, d] of EXPECTED_HEADER_DOMAINS) expect(SECTION_DOMAIN_MAP[resolveHeader(h)!], h).toBe(d);
  });
});

describe("coverage floor + COUNT-level audit agreement (Codex R5/R9, exhaustive plan-R3)", () => {
  // EXACT: operator emit count per domain must EQUAL the independent audit count
  // (identical applicability predicate). header-typo is exact too — the audit replicates
  // its typo-eligibility guard (plan-R4). blank-row:remove is exact — its 2-domain mutant
  // credits each adjacent domain once, matching the audit's dual bump.
  const EXACT = ["header-typo", "ref-sub", "unicode-inject", "merged-cell", "column-shift", "blank-row:inject", "blank-row:remove"];

  // Array form — for the BOUNDED synthetic-input tests below only.
  const genCounts = (raw: { domains: string[] }[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const mut of raw) for (const d of mut.domains) m.set(d, (m.get(d) ?? 0) + 1);
    return m;
  };
  // STREAMING form for the FULL-CORPUS loop (Codex plan-R23/R24 [high]): route through the shared
  // `boundedMutants` (imported at the top of this file), which embeds the guardStream+MUTANT_BUDGET
  // fail-fast guard — never materialize the operator array over real fixtures.
  const genCountsStreamed = (op: string, md: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const mut of boundedMutants(op, md)) for (const d of mut.domains) m.set(d, (m.get(d) ?? 0) + 1);
    return m;
  };

  it("EXACT operators: per-domain generated count === independent audit count", () => {
    for (const f of FIXTURES) {
      const md = readFixture(f);
      const audit = auditSites(md);
      for (const op of EXACT) {
        const gen = genCountsStreamed(op, md); // streaming + budget-guarded (never an eager array)
        const domains = new Set<string>([...gen.keys(), ...[...audit.keys()].filter((k) => k.startsWith(`${op}|`)).map((k) => k.split("|")[1]!)]);
        for (const d of domains) {
          expect(gen.get(d) ?? 0, `${f.slug} ${op}|${d} count`).toBe(audit.get(`${op}|${d}`) ?? 0);
        }
      }
    }
  });

  it("header-typo count matches for TWO same-domain headers (one-emitted-only would fail, plan-R4)", () => {
    const md = "| CREW | NAME |\n|  | Doug |\n\n| TECH | NAME |\n|  | Eric |"; // two crew-domain headers
    const gen = genCounts(OPS["header-typo"]!(md));
    expect(gen.get("crew") ?? 0).toBe(auditSites(md).get("header-typo|crew") ?? 0);
    expect(gen.get("crew") ?? 0).toBe(2); // both CREW + TECH headers → 2 crew-domain typo sites
  });
});
```

- [ ] **Step 2: Verify each gate is LIVE — RED via injected regression (TDD red phase, plan-R15)**

These gates run over already-implemented code, so the red phase is proven by injecting a regression into the PROTECTED code and confirming the specific gate fails (then reverting). Do all three, one at a time:
  1. **Classifier parity:** temporarily edit `tests/parser/mutation/classify.ts` — change `SECTION_DOMAIN_MAP.TRANSPORTATION` to `"other"`. Run: `pnpm vitest run tests/parser/mutationHarness.test.ts -t "classifier parity"`. Expected: FAIL (`TRANSPORTATION=other`). Revert.
  2. **Count agreement:** temporarily edit `tests/parser/mutation/operators.ts` — make `refSub` return `eachDataCell(md).slice(0, -1).map(...)` (drop one site). Run: `pnpm vitest run tests/parser/mutationHarness.test.ts -t "COUNT-level audit agreement"`. Expected: FAIL (gen ≠ audit for a `ref-sub|<domain>`). Revert.
  3. Confirm both reverts restored the files (`git diff --stat` shows no change under `tests/parser/mutation/`).

- [ ] **Step 3: Run — verify GREEN**

Run: `pnpm vitest run tests/parser/mutationHarness.test.ts`
Expected: PASS. If a floor miss fires, the day-1 fixtures genuinely lack that op×domain — confirm via `auditSites` and relax that specific case only if the audit also reports zero (never weaken the gate globally).

- [ ] **Step 4: Commit**

```bash
git add tests/parser/mutationHarness.test.ts
git commit --no-verify -m "test(parser): classifier-parity + coverage-floor + audit-agreement gates"
```

---

### Task 10: Negative-control tests (prove every gate can go RED)

**Files:**
- Create: `tests/parser/mutation/negativeControls.test.ts`

**Interfaces:** Consumes oracle/operators/classify helpers. Each control constructs a synthetic input and asserts the relevant gate would fail.

- [ ] **Step 1: Write the controls** (each asserts a broken input flips the verdict/gate)

```ts
// tests/parser/mutation/negativeControls.test.ts
import { describe, it, expect } from "vitest";
import { verdict, fingerprint } from "./oracle";
import { OPERATORS } from "./operators";
import type { ParsedSheet } from "@/lib/parser/types";

const base = (over: Partial<ParsedSheet> = {}): ParsedSheet =>
  ({ show: {} as never, crewMembers: [], hotelReservations: [], rooms: [], transportation: null, contacts: [],
     pullSheet: null, diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
     openingReel: null, raw_unrecognized: [], warnings: [], hardErrors: [], ...over } as ParsedSheet);

describe("negative controls — every alarm class is reachable", () => {
  it("SILENT_WRONG: payload change, no signal", () => {
    expect(verdict(base(), base({ rooms: [{} as never] }))).toBe("SILENT_WRONG");
  });
  it("SILENT_SIGNAL_LOSS: baseline warning removed, payload equal", () => {
    expect(verdict(base({ warnings: [{ severity: "warn", code: "W", message: "m" }] }), base())).toBe("SILENT_SIGNAL_LOSS");
  });
  it("fingerprint: same-path new value (R8)", () => {
    const b = base({ crewMembers: [{ name: "A" } as never] });
    expect(fingerprint(b, base({ crewMembers: [{ name: "B" } as never] })))
      .not.toBe(fingerprint(b, base({ crewMembers: [{ name: "C" } as never] })));
  });
  it("fingerprint: signal reorder (R16)", () => {
    const w = (c: string) => ({ severity: "warn" as const, code: c, message: c });
    expect(fingerprint(base(), base({ warnings: [w("A"), w("B")] })))
      .not.toBe(fingerprint(base(), base({ warnings: [w("B"), w("A")] })));
  });
  it("fingerprint: raw_unrecognized value drift same block|key (R9/R15)", () => {
    const b = base();
    expect(fingerprint(b, base({ raw_unrecognized: [{ block: "X", key: "k", value: "v1" }] })))
      .not.toBe(fingerprint(b, base({ raw_unrecognized: [{ block: "X", key: "k", value: "v2" }] })));
  });
  it("unicode-inject: no site on a single-char data cell (R14)", () => {
    expect(OPERATORS["unicode-inject"]!("| CREW | N |\n|  | A |")).toHaveLength(0);
  });
  it("column-shift: no site on a header/alignment-only section (R13)", () => {
    expect(OPERATORS["column-shift"]!("| CREW | NAME |\n| :---: | :---: |")).toHaveLength(0);
  });
  it("ref-sub: never targets a :---: alignment row (R12)", () => {
    const md = "| CREW | NAME |\n| :---: | :---: |\n|  | Doug |";
    for (const m of OPERATORS["ref-sub"]!(md)) expect(m.md).not.toContain("#REF! | :---:");
  });
});

// The audit independently counts header + boundary ops, so a crippled operator (emitting
// zero header-typo / blank-row:remove sites) is caught by audit-agreement + golden inventory
// rather than self-reported (plan-R1). Prove the audit sees these classes independently.
import { auditSites } from "./applicabilityAudit";
import { OPERATORS as OPS2 } from "./operators";
describe("audit covers header + boundary operators independently (plan-R1)", () => {
  const md = ["| CREW | NAME |", "|  | Doug Larson |", "", "| TRANSPORTATION | NAME |", "|  | Carlos |"].join("\n");
  it("counts a header-typo site for crew and a blank-row:remove boundary between the runs", () => {
    const s = auditSites(md);
    expect(s.get("header-typo|crew") ?? 0).toBeGreaterThan(0);
    // boundary between run0 (crew) and run1 (transportation) → credited to both domains
    expect((s.get("blank-row:remove|crew") ?? 0) + (s.get("blank-row:remove|transportation") ?? 0)).toBeGreaterThan(0);
  });
});

describe("count-level agreement catches partial under-enumeration (plan-R3)", () => {
  it("a crew section with N cells yields exactly N ref-sub mutants (== audit count)", () => {
    const md = "| CREW | NAME | ROLE | PHONE |\n|  | Doug | Lead | 917 |\n|  | Eric | BO | 508 |";
    const auditCrew = auditSites(md).get("ref-sub|crew") ?? 0;
    const genCrew = OPS2["ref-sub"]!(md).filter((m) => m.domains.includes("crew")).length;
    expect(genCrew).toBe(auditCrew);
    expect(genCrew).toBeGreaterThan(1); // proves it is NOT collapsed to one mutant
  });
});

// The gates above must go RED when the harness itself is crippled — otherwise a green run
// proves nothing. These controls INJECT the regressions Codex R13 named and assert the exact
// gate expression (count agreement, boundary coverage, skipped-inapplicable equality, ledger
// reconcile) detects the failure. If any of these ever passes, the corresponding real gate is
// tautological.
import { expectedSkipped } from "./applicabilityAudit";
import { reconcileLedger } from "./knownHoles";

describe("structural gates FAIL under injected regressions (plan-R13)", () => {
  const genCounts = (raw: { domains: string[] }[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const mut of raw) for (const d of mut.domains) m.set(d, (m.get(d) ?? 0) + 1);
    return m;
  };
  it("count-agreement: dropping ONE generated ref-sub|crew mutant makes gen !== audit", () => {
    const md = "| CREW | NAME | PHONE |\n|  | Doug | 917 |\n|  | Eric | 508 |";
    const audit = auditSites(md).get("ref-sub|crew") ?? 0;
    const healthy = OPS2["ref-sub"]!(md).filter((m) => m.domains.includes("crew"));
    // Liveness FIRST: the healthy generator must MATCH the audit. This is the assertion the
    // injected regression (refSub => []) trips — without it, a fully-dead operator yields
    // crippled=[] whose count 0 still satisfies `not.toBe(audit>0)`, so the RED proof was a
    // false positive (Codex plan-R16 [high]).
    expect(genCounts(healthy).get("crew") ?? 0).toBe(audit);
    const crippled = healthy.slice(0, -1); // remove one
    expect(genCounts(crippled).get("crew") ?? 0).not.toBe(audit); // the `=== audit` gate would fail
  });
  it("boundary-coverage: removing ALL blank-row:remove mutants leaves an audited boundary uncovered", () => {
    const md = "| CREW | NAME |\n|  | Doug |\n\n| TRANSPORTATION | NAME |\n|  | Carlos |";
    const auditHasBoundary = [...auditSites(md).keys()].some((k) => k.startsWith("blank-row:remove|"));
    const crippledGen: { domains: string[] }[] = []; // operator emits nothing for this class
    expect(auditHasBoundary).toBe(true);
    expect(genCounts(crippledGen).size).toBe(0); // gen 0 vs audit>0 → presence/agreement gate fails
  });
  it("skipped-inapplicable: a classifier that drops a PRESENT domain diverges from expectedSkipped", () => {
    const md = "| HOTEL | Kimpton |\n|  | 122 W Monroe |"; // hotel present, zero merged-cell sites
    const expected = expectedSkipped(md, "merged-cell"); // includes "hotel"
    expect(expected).toContain("hotel");
    const crippledShared = expected.filter((d) => d !== "hotel"); // shared classifier regressed hotel → other
    expect(crippledShared).not.toEqual(expected); // the `toEqual(expectedSkipped)` gate would fail
  });
  it("ledger ratchet: an undocumented NEW alarm fails, and a STALE row fails (both directions)", () => {
    expect(reconcileLedger([{ siteId: "s", kind: "wrong", fingerprint: "f" }], []).newAlarms.length).toBeGreaterThan(0);
    expect(reconcileLedger([], [{ siteId: "s", kind: "wrong", fingerprint: "f", finding: "#1", note: "n" }]).staleRows.length).toBeGreaterThan(0);
  });
});

import { guardStream } from "./operators";

describe("guardStream — the shared guard behind boundedMutants — fails fast BEFORE array materialization (plan-R24)", () => {
  it("stops an UNBOUNDED generator by throwing at budget+1, never collecting it into an array", () => {
    // guardStream is the SINGLE primitive every corpus-scale consumer routes through: boundedMutants
    // wraps it, and runAll / skippedInapplicable / the count-agreement gate / the coverage summary
    // all iterate boundedMutants. OPERATOR_GENS is module-private, so there is NO unguarded corpus
    // path. A non-streaming impl (`[...gen]` / `.map`) would HANG/OOM on this infinite generator; the
    // guarded loop TERMINATING with a throw proves fail-fast for ALL of those consumers at once
    // (the Codex plan-R23/R24 [high] failure class — closed structurally, not per-call-site).
    function* unbounded(): Generator<number> {
      let i = 0;
      while (true) yield i++;
    }
    expect(() => {
      for (const _m of guardStream(unbounded(), 100, "test")) { /* consume — never terminates unless the guard throws */ }
    }).toThrow(/test exceeded budget 100/);
  });
});
```

- [ ] **Step 2: Verify the controls are LIVE — RED, not dead assertions (TDD red phase, plan-R15)**

Prove the controls actually exercise the machinery (a dead assertion would pass even against a broken oracle):
  1. Temporarily edit `tests/parser/mutation/oracle.ts` — make `verdict` `return "ABSORBED"` unconditionally. Run: `pnpm vitest run tests/parser/mutation/negativeControls.test.ts -t "every alarm class"`. Expected: FAIL (SILENT_WRONG / SILENT_SIGNAL_LOSS controls no longer reach their verdicts). Revert.
  2. Temporarily edit `tests/parser/mutation/operators.ts` — make `refSub` return `[]`. Run: `pnpm vitest run tests/parser/mutation/negativeControls.test.ts -t "structural gates FAIL"`. Expected: FAIL (the count-agreement injected-regression control can no longer form its crippled set). Revert.
  3. Confirm `git diff --stat` shows no residual change under `tests/parser/mutation/`.

- [ ] **Step 3: Run — verify GREEN**

Run: `pnpm vitest run tests/parser/mutation/negativeControls.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/parser/mutation/negativeControls.test.ts
git commit --no-verify -m "test(parser): negative controls — every alarm class + operator gate reachable"
```

---

### Task 11: Coverage summary + skippedInapplicable surfacing

**Files:**
- Modify: `tests/parser/mutationHarness.test.ts` (emit a legible summary; assert it is non-trivial)

- [ ] **Step 1: Add a summary assertion**

```ts
// append to tests/parser/mutationHarness.test.ts
import { skippedInapplicable } from "./mutation/operators";
import { expectedSkipped } from "./mutation/applicabilityAudit";

const CORRUPTING = [
  "header-typo", "ref-sub", "unicode-inject", "column-shift",
  "blank-row:inject", "blank-row:remove", "merged-cell",
];

describe("present-but-inapplicable domains cannot be silently excused (plan-R10)", () => {
  it("shared skippedInapplicable === independent expectedSkipped for every fixture × corrupting op", () => {
    // The independent audit computes present-risk-critical domains (incl. ZERO-site ones) from
    // its OWN segmentation. If the shared classifier regresses and drops a present domain, the
    // shared skippedInapplicable omits it while expectedSkipped still lists it → this fails.
    for (const f of FIXTURES) {
      const md = readFixture(f);
      for (const op of CORRUPTING) {
        expect(skippedInapplicable(md, op), `${f.slug}/${op} skipped-inapplicable mismatch (classifier drift?)`)
          .toEqual(expectedSkipped(md, op));
      }
    }
  });
  it("a present zero-site domain IS surfaced by both sides (merged-cell on a 2-col HOTEL section)", () => {
    const md = "| HOTEL | Kimpton |\n|  | 122 W Monroe |"; // 2-col → no merged-cell site; hotel present
    expect(skippedInapplicable(md, "merged-cell")).toContain("hotel");
    expect(expectedSkipped(md, "merged-cell")).toContain("hotel");
  });
});

describe("coverage legibility (exhaustive; skippedInapplicable surfaced)", () => {
  it("emits total mutant count + per-fixture/op skippedInapplicable and covers >3 domains", () => {
    let total = 0;
    const domains = new Set<string>();
    const skips: string[] = [];
    for (const f of FIXTURES) {
      const md = readFixture(f);
      for (const op of OPERATOR_NAMES) {
        for (const m of boundedMutants(op, md)) { total++; for (const dm of m.domains) domains.add(dm); } // guarded stream (plan-R24)
        if (op.startsWith("section-reorder") || op.startsWith("trailing")) continue; // cosmetic: no floor
        const sk = skippedInapplicable(md, op);
        if (sk.length) skips.push(`${f.slug}/${op}: ${sk.join(",")}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[mutation-harness] total=${total} domains=${[...domains].sort().join(",")}\n  skippedInapplicable:\n  ${skips.join("\n  ") || "(none)"}`);
    expect(total).toBeGreaterThan(50);
    expect(domains.size).toBeGreaterThan(3);
  });

  it("skippedInapplicable is a pure function of the fixture (deterministic, surfaced not silent)", () => {
    // A present risk-critical domain with no applicable site must appear — merged-cell on a
    // 2-column HOTEL section. Assert the surfacing helper reports it (never a silent excusal).
    const md = "| HOTEL | Kimpton |\n|  | 122 W Monroe |";
    expect(skippedInapplicable(md, "merged-cell")).toContain("hotel");
  });
});
```

- [ ] **Step 2: Verify the skipped-inapplicable equality gate is LIVE — RED via injected classifier drift (TDD red phase, plan-R15)**

Temporarily edit `tests/parser/mutation/classify.ts` — in `classifySection`, force `if (SECTION_DOMAIN_MAP[h] === "hotel") return "other"` (a classifier that drops the hotel domain). Run: `pnpm vitest run tests/parser/mutationHarness.test.ts -t "cannot be silently excused"`. Expected: FAIL for any fixture whose hotel section has a zero-site operator — the shared `skippedInapplicable` now omits `hotel` while the independent `expectedSkipped` still lists it. (If no committed fixture exercises it, add the 2-col HOTEL synthetic to the equality loop for the red run.) Revert the edit; confirm `git diff --stat` is clean under `tests/parser/mutation/`.

- [ ] **Step 3: Run — verify GREEN** (note the printed summary line)

Run: `pnpm vitest run tests/parser/mutationHarness.test.ts`
Expected: PASS; a `[mutation-harness] total=… domains=…` + `skippedInapplicable` line printed.

- [ ] **Step 4: Commit**

```bash
git add tests/parser/mutationHarness.test.ts
git commit --no-verify -m "test(parser): surface total mutant count + skippedInapplicable + domain coverage"
```

---

### Task 12: CI wiring — dedicated nightly workflow + default-suite exclusion (non-merge-gating)

**Why (user-directed 2026-07-06, superseding the R22 merge-gate decision):** Task 8 Step 1 measured the exhaustive corpus at **101,795 mutants × ~29.8 ms/parse ≈ 3,029 s (~50 min) serial** — 20× the ~150 s a merge-gating `unit-suite` leg (20-min timeout, `unit-suite.yml:52`) can absorb, and the leg also runs the rest of the suite. Sampling to fit the budget was rejected (it would let a silent-wrong parse in an un-parsed site ship undetected, spec §4.3); ~20-file sharding is fragile against the leg timeout. The user chose to **keep full exhaustiveness and move the harness OFF the merge-gating fast path onto a dedicated nightly workflow** (spec §Non-goals + AC-5, amended). Consequence: the harness is (a) **excluded from the default discovered suite** so a bare `pnpm test` and the `unit-suite` legs never pick up the 50-min file, and (b) run by a new **scheduled + `workflow_dispatch`** GitHub Actions workflow. It is NOT merge-blocking; a ledger divergence fails the nightly run and is triaged. The R22-era `lib/test/vitest.weights.ts` weight row and `vitest-shard-balance.test.ts` HOT-pair edit are **NOT made** — they only matter for a file the unit-suite sequencer runs, and this file leaves that path.

**Files:**
- Modify: `vitest.projects.ts` (add `NIGHTLY_ONLY_EXCLUDES`)
- Modify: `vitest.config.ts` (gate the exclusion behind opt-in `VITEST_INCLUDE_MUTATION_HARNESS`)
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts` (pin the new opt-in gating contract, mirroring the env-bound gating tests)
- Create: `.github/workflows/mutation-harness.yml` (nightly `schedule:` + `workflow_dispatch:`)

**Interfaces:** the harness is a normally-named `tests/parser/mutationHarness.test.ts` that is EXCLUDED from both vitest projects by default (so it runs in NO project on a bare `pnpm test`/`unit-suite`), and INCLUDED only when `VITEST_INCLUDE_MUTATION_HARNESS=1` — the single env var the nightly workflow (and a dev who wants to run it) sets. This mirrors the established `VITEST_EXCLUDE_ENV_BOUND` gating pattern (`vitest.config.ts:15`), inverted to opt-IN because the default posture is "don't run the 50-min file."

- [ ] **Step 1: Add the exclusion constant** — in `vitest.projects.ts`, after `ENV_BOUND_EXCLUDES` (`:34-38`), add:

```ts
// The mutation harness (tests/parser/mutationHarness.test.ts) exhaustively parses
// ~102k mutants (~50 min serial, Task 8 Step 1) — far past any merge-gating leg
// budget. It is therefore EXCLUDED from the default discovered suite (local
// `pnpm test` + the unit-suite legs) and run ONLY by the nightly workflow, which
// opts IN via VITEST_INCLUDE_MUTATION_HARNESS=1. Opt-IN (not the env-bound opt-OUT
// pattern) because the safe default is "skip the 50-min file". (User-directed
// nightly placement, 2026-07-06; spec §Non-goals + AC-5.)
export const NIGHTLY_ONLY_EXCLUDES = ["**/tests/parser/mutationHarness.test.ts"];
```

- [ ] **Step 2: Gate the exclusion in the config** — in `vitest.config.ts`, import the new constant and add the gated exclude to the serial project:

```ts
// (add NIGHTLY_ONLY_EXCLUDES to the existing import from "./vitest.projects")
import { BASE_INCLUDE, PARALLEL_TEST_GLOBS, ENV_BOUND_EXCLUDES, NIGHTLY_ONLY_EXCLUDES } from "./vitest.projects";

// The nightly mutation harness is OPT-IN: excluded from the default suite unless
// the nightly workflow (or a dev) sets VITEST_INCLUDE_MUTATION_HARNESS=1. Same
// project-level-exclude mechanism as the env-bound gate (CLI --exclude is ignored
// once a project defines its own exclude).
const nightlyExcludes = process.env.VITEST_INCLUDE_MUTATION_HARNESS === "1" ? [] : NIGHTLY_ONLY_EXCLUDES;
```

and extend the serial project's `exclude` array (`:65`):

```ts
          exclude: [...configDefaults.exclude, ...PARALLEL_TEST_GLOBS, ...envBoundExcludes, ...nightlyExcludes],
```

- [ ] **Step 3: Pin the gating contract in the partition meta-test** — append to `tests/cross-cutting/vitest-projects-partition.test.ts` (it already imports the config and stubs env vars for the env-bound test at `:155-179`; add `NIGHTLY_ONLY_EXCLUDES` to the `@/vitest.projects` import). New tests:

```ts
it("the mutation harness is NOT in the parallel set (must be excludable from serial)", () => {
  for (const glob of NIGHTLY_ONLY_EXCLUDES) {
    const path = glob.replace(/^\*\*\//, "");
    expect(allTestFiles, `${path} should exist`).toContain(path);
    expect(matchesParallel(path), `${path} must be SERIAL so the opt-in gate governs it`).toBe(false);
  }
});

it("VITEST_INCLUDE_MUTATION_HARNESS gates the harness in the serial exclude (opt-IN)", async () => {
  const serialExcludeFor = async (value: string | undefined): Promise<string[]> => {
    vi.resetModules();
    if (value === undefined) vi.stubEnv("VITEST_INCLUDE_MUTATION_HARNESS", "");
    else vi.stubEnv("VITEST_INCLUDE_MUTATION_HARNESS", value);
    try {
      const cfg = (await import("@/vitest.config")).default as { test?: { projects?: ProjectEntry[] } };
      return cfg.test?.projects?.find((p) => p.test.name === "serial")?.test.exclude ?? [];
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  };
  const optedIn = await serialExcludeFor("1");   // nightly workflow
  const def = await serialExcludeFor(undefined); // local pnpm test + unit-suite
  for (const f of NIGHTLY_ONLY_EXCLUDES) {
    expect(def, `${f} excluded by default (kept off the fast path)`).toContain(f);
    expect(optedIn, `${f} runs when VITEST_INCLUDE_MUTATION_HARNESS=1 (nightly)`).not.toContain(f);
  }
});

it("the nightly workflow sets the opt-in var and targets the harness file", () => {
  const wf = readFileSync(join(ROOT, ".github", "workflows", "mutation-harness.yml"), "utf8");
  expect(wf.includes("VITEST_INCLUDE_MUTATION_HARNESS"), "workflow must opt IN to the harness").toBe(true);
  expect(wf.includes("tests/parser/mutationHarness.test.ts"), "workflow must target the harness file").toBe(true);
  expect(/schedule:/.test(wf) && /workflow_dispatch:/.test(wf), "workflow must be scheduled + dispatchable").toBe(true);
});
```

- [ ] **Step 4: Create the nightly workflow** — `.github/workflows/mutation-harness.yml`. Mirror the setup steps of `unit-suite.yml` (checkout, pnpm, node, install) but run ONLY the harness with the opt-in var and a generous timeout (the ~50-min run + install headroom):

```yaml
name: mutation-harness
on:
  schedule:
    - cron: "0 7 * * *" # 07:00 UTC nightly (off-peak); triage a red run manually
  workflow_dispatch: {} # close-out verifies green on the PR branch before merge
concurrency:
  group: mutation-harness-${{ github.ref }}
  cancel-in-progress: true
jobs:
  mutation-harness:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.2 # match unit-suite.yml:61 (pinned, not `latest`)
      - uses: actions/setup-node@v4
        with:
          node-version: 20 # match unit-suite.yml:64
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      # NO supabase/setup-cli, psql, or bootstrap: the harness is pure-parser / DB-free.
      - name: Run exhaustive mutation harness (nightly, ~50 min)
        env:
          VITEST_INCLUDE_MUTATION_HARNESS: "1"
        run: pnpm exec vitest run tests/parser/mutationHarness.test.ts
```

> Pins mirror the live `unit-suite.yml` (pnpm `10.33.2` `:61`, node `20` `:64`, `pnpm install --frozen-lockfile` `:66`). The Supabase/psql/bootstrap steps (`:67-80`) are intentionally OMITTED — the harness only reads committed markdown fixtures + calls `parseSheet`, touching no DB.

- [ ] **Step 5: Verify locally — excluded by default, runs opted-in, meta-tests green**

```bash
# Excluded by default (0 harness tests collected — fast):
pnpm vitest run tests/parser/mutationHarness.test.ts 2>&1 | tail -3
# Expected: "No test files found" / 0 files — the default exclude drops it.

# The gating + partition meta-tests stay green:
pnpm vitest run tests/cross-cutting/vitest-projects-partition.test.ts 2>&1 | tail -5
```
Expected: partition meta-test PASS (every file still logically partitioned; new opt-in gating tests green; the nightly workflow file exists and is wired). Do NOT run the full harness here (50 min) — Task 8/13 already validated it opted-in.

- [ ] **Step 6: Commit**

```bash
git add vitest.projects.ts vitest.config.ts tests/cross-cutting/vitest-projects-partition.test.ts .github/workflows/mutation-harness.yml
git commit --no-verify -F - <<'MSG'
ci(parser): run exhaustive mutation harness nightly, off the merge-gating path

~102k-mutant exhaustive corpus is ~50 min serial (Task 8 Step 1) — excluded from
the default suite (opt-in VITEST_INCLUDE_MUTATION_HARNESS) and run by a dedicated
nightly workflow. Non-merge-gating; ledger divergence fails the nightly run.
MSG
```

---

### Task 13: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full parser suite**

Run: `pnpm vitest run tests/parser/`
Expected: PASS (including the pre-existing `exporterFixtures.test.ts`, `_metaKnownSectionsRegistry.test.ts`).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (vitest strips types; `next build`/tsc catches what vitest misses — memory `feedback_typecheck_before_push_vitest_strips_types`).

- [ ] **Step 3: Lint + format**

Run: `pnpm lint && pnpm format:check`
Expected: clean. (CI `quality` runs eslint canonical-Tailwind + prettier; `--no-verify` bypassed the local hook — memory `feedback_run_eslint_before_push_canonical_tailwind`, `feedback_format_check_before_push_noverify_bypasses_prettier`.) Run `pnpm format` if needed, re-commit.

- [ ] **Step 4: Full suite (regression sweep)**

Run: `pnpm test`
Expected: PASS. A shared-chokepoint change is not expected here (test-only), but confirm no collateral (memory `feedback_full_suite_before_push_scoped_gates_miss_regressions`).

- [ ] **Step 5: Commit any format fixups**

```bash
git add -A && git commit --no-verify -m "chore(parser): format + final verification for mutation harness"
```

- [ ] **Step 6: Confirm the nightly harness workflow actually ran GREEN on the PR branch via `workflow_dispatch` (memory `feedback_ci_local_passes_ci_fails`, "local-passes-CI-fails is its own bug class")**

Local green is necessary but NOT sufficient. The harness is NOT on the merge-gating `unit-suite` path (Task 12, user-directed nightly placement) — its real runner is the `mutation-harness` workflow. Before merge, trigger it on the PR branch and confirm it ran the harness and PASSED (proves the opt-in wiring + workflow setup are correct on a real runner, not just locally):

```bash
BR="$(git branch --show-current)"
gh workflow run mutation-harness.yml --ref "$BR"        # workflow_dispatch on the PR branch
sleep 20
RID=$(gh run list --workflow=mutation-harness.yml --branch "$BR" --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RID" --exit-status                        # ~50 min; exits non-zero if the run fails
gh run view "$RID" --log 2>/dev/null | grep -i "mutation harness — bidirectional known-holes ledger" | head
```
Expected: `gh run watch --exit-status` concludes success, and the grep finds the harness describe in the log (proving it EXECUTED, i.e. the opt-in var actually included it — not 0 tests). Treat as a CLOSE-OUT gate distinct from local-green. If the run fails or ran 0 tests, the opt-in/exclusion wiring or workflow setup (Task 12) is wrong — fix before merge. (The `mutation-harness` workflow is NOT a required check, so it does not block the `gh pr merge`; this manual dispatch-and-watch is the substitute close-out proof.)

> **Note (Step 4 scope):** the default `pnpm test` in Step 4 does NOT run the 50-min harness — it is excluded from the default suite (Task 12). Step 4 confirms the fast Tasks 1–7 + 10 tests + the Task 12 config/partition meta-tests are green; the harness itself is validated opted-in (Task 8 Step 5, and this Step 6 nightly-workflow dispatch).

---

## Self-Review checklist (run before adversarial review)

1. **Spec coverage:** every spec section maps to a task — segmentation/row-taxonomy (T1), classifier+parity+lockstep (T2), oracle+verdict+fingerprint+redaction (T3), 8-operator/9-key generators+selection+domains (T4), fixture registry+parity (T5), independent audit+golden (T6), ledger type (T7), driver+day-1 ledger+uniqueness+cosmetic+bidirectional (T8), classifier/floor/audit gates (T9), negative controls incl. R12/R13/R14/R15/R16 (T10), coverage legibility (T11), CI wiring as a dedicated NIGHTLY workflow off the merge-gating path + default-suite exclusion (T12, user-directed 2026-07-06 after the ~50-min corpus was measured), verification (T13). ✔
2. **Placeholder scan:** the only deferred concrete values are `GOLDEN_INVENTORY` exact counts and `KNOWN_SILENT_HOLES` rows — both are DATA populated from an observed run and hand-verified in-task (T6 S4, T8 S3), not code placeholders. ✔
3. **Type consistency:** `Mutant.domains: Domain[]`, `floorEligible(): Set<Domain>`, `skippedInapplicable(): Domain[]`, `verdict(): Verdict`, `fingerprint(): string`, `KnownHole` fields — consistent across T3/T4/T7/T8. Detection is exhaustive (no `select`/cap). ✔

## Adversarial review (cross-model)

After self-review, invoke `adversarial-review` (Codex) on this plan; iterate to APPROVE before execution handoff.
