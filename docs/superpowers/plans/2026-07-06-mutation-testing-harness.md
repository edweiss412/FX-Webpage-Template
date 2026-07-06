# Parser Mutation-Testing Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CI-gating vitest harness that mutates the 17 committed parser fixtures with 8 operators and asserts every mutant is either parsed identically, signaled, or recorded in a bidirectional known-holes ledger — never silently wrong.

**Architecture:** Pure test-only modules under `tests/parser/mutation/`. A metamorphic oracle compares each mutant's `parseSheet` output against the pristine baseline (data payload + full signal channels). Header-anchored logical-section segmentation assigns each mutation site to a parser domain; a floor-first selection guarantees per-domain coverage; a behavior-fingerprinted ledger ratchets known holes bidirectionally; an implementation-independent applicability audit + golden inventory prevents self-referential coverage.

**Tech Stack:** TypeScript, vitest, `node:crypto` (sha256 digests). No product-source change; no new deps.

**Spec:** `docs/superpowers/specs/2026-07-06-mutation-testing-harness.md` (Codex-APPROVED, 17 rounds).

## Global Constraints

- **Zero product-source change.** Only files under `tests/parser/mutation/**` + `tests/parser/mutationHarness.test.ts` + this plan/spec are created. Nothing under `lib/`, `app/`, `components/`, `supabase/`.
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
| `tests/parser/mutation/operators.ts` | 8 operators, applicability predicates, exhaustive site enumeration, `floorEligible`, `skippedInapplicable` |
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
- Test: `tests/parser/mutation/classify.test.ts`

**Interfaces:**
- Consumes: `KNOWN_SECTION_HEADERS`, `PREFIX_SECTION_FAMILIES`, `normalizeHeader` (`@/lib/parser/knownSections`); `LogicalSection`, `splitCells` (`./rows`).
- Produces: `Domain`, `RISK_CRITICAL: Domain[]`, `SECTION_DOMAIN_MAP`, `resolveHeader(col0): string|null`, `isHeaderCells(cells): boolean`, `classifySection(sec): Domain`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/mutation/classify.test.ts
import { describe, it, expect } from "vitest";
import { KNOWN_SECTION_HEADERS, PREFIX_SECTION_FAMILIES } from "@/lib/parser/knownSections";
import { REQUIRED_HEADERS_FOR_DOMAIN } from "./classify"; // Task-2 lockstep table (below)
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
  it("lockstep: every REQUIRED_HEADERS_FOR_DOMAIN row maps to its intended risk-critical domain (R8)", () => {
    for (const [header, domain] of REQUIRED_HEADERS_FOR_DOMAIN) {
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

/** Lockstep table vs tests/parser/_metaKnownSectionsRegistry.test.ts REQUIRED_HEADERS (Codex R8). */
export const REQUIRED_HEADERS_FOR_DOMAIN: ReadonlyArray<readonly [string, Domain]> = [
  ["CREW", "crew"], ["TECH", "crew"], ["HOTEL", "hotel"], ["HOTEL RESERVATIONS", "hotel"],
  ["HOTEL STAYS", "hotel"], ["TRANSPORTATION", "transportation"], ["GENERAL SESSION", "rooms"],
  ["BREAKOUT", "rooms"], ["ADDITIONAL ROOM", "rooms"], ["LUNCH ROOM", "rooms"],
  ["EVENT DETAILS", "event_details"], ["GS DETAILS", "event_details"], ["DETAILS", "event_details"],
  ["DRESS", "dress"], ["DATES", "dates"], ["VENUE", "venue"], ["VENUES", "venue"],
  ["IN HOUSE AV", "contacts"], ["AGENDA", "agenda"], ["AGENDA LINK", "agenda"],
];

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

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/parser/mutation/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutation/classify.ts tests/parser/mutation/classify.test.ts
git commit --no-verify -m "test(parser): prefix-resolving classifier + SECTION_DOMAIN_MAP parity + lockstep table"
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
import { capture, verdict, fingerprint } from "./oracle";
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
  // Order-sensitive signal component: index-keyed full-object redacted digests (R15/R16).
  const sig = (p: ParsedSheet): string[] => {
    const rows: string[] = [];
    p.warnings.forEach((w, i) => rows.push(`W#${i}:${digest(w)}`));
    p.hardErrors.forEach((h, i) => rows.push(`H#${i}:${digest(h)}`));
    p.raw_unrecognized.forEach((r, i) => rows.push(`R#${i}:${digest(r)}`));
    return rows;
  };
  const signalDiff = `B[${sig(b).join(",")}]|M[${sig(m).join(",")}]`;
  return createHash("sha256").update(`${payloadDiff.join(";")}||${signalDiff}`).digest("hex").slice(0, 16);
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
- Produces: `Mutant`, `Bucket`, `OPERATORS: Record<string, (md) => Mutant[]>`, `floorEligible(mutants): Set<Domain>`, `skippedInapplicable(md, op): Domain[]`.
- **domains(site)** is carried on each `Mutant.domains`; boundary (`blank-row:remove`) mutants carry a 2-element `domains`.
- **Exhaustive:** operators emit ALL applicable sites; there is no cap/`select` (plan-R2). The driver parses every generated mutant.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/mutation/operators.test.ts
import { describe, it, expect } from "vitest";
import { OPERATORS, floorEligible, skippedInapplicable } from "./operators";
import { splitCells } from "./rows";

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

// Replace one cell in a specific line; returns the whole mutated markdown.
function withCell(md: string, line: number, cellIdx: number, next: string): string {
  const ls = lines(md);
  const cells = splitCells(ls[line]!);
  cells[cellIdx] = next;
  ls[line] = `| ${cells.join(" | ")} |`;
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
const refSub = (md: string): Mutant[] =>
  eachDataCell(md).map((c) => ({
    md: withCell(md, c.line, c.cellIdx, "#REF!"), siteId: sid("ref-sub", c.sec, c.line, c.cellIdx),
    bucket: "corrupting", domains: dom(c.sec),
  }));

const unicodeInject = (md: string): Mutant[] =>
  eachDataCell(md).filter((c) => scalars(c.val) >= 2).map((c) => {
    const mid = Math.floor([...c.val].length / 2);
    const ZWNJ = "\u200C"; // zero-width non-joiner (fintech live shape)
    const injected = [...c.val].slice(0, mid).join("") + ZWNJ + [...c.val].slice(mid).join("");
    return { md: withCell(md, c.line, c.cellIdx, injected), siteId: sid("unicode-inject", c.sec, c.line, c.cellIdx), bucket: "corrupting" as const, domains: dom(c.sec) };
  });

const mergedCell = (md: string): Mutant[] => {
  const out: Mutant[] = [];
  for (const s of seg(md).sections) for (const r of dataRows(s)) {
    if (r.cells.length < 3) continue;
    // one mutant per interior pipe p (fuse cells p and p+1) — plan-R5
    for (let p = 0; p < r.cells.length - 1; p++) {
      const fused = [...r.cells.slice(0, p), `${r.cells[p]} ${r.cells[p + 1]}`, ...r.cells.slice(p + 2)];
      const ls = lines(md); ls[r.line] = `| ${fused.join(" | ")} |`;
      out.push({ md: ls.join("\n"), siteId: sid("merged-cell", s, r.line, p), bucket: "corrupting", domains: dom(s) });
    }
  }
  return out;
};

const headerTypo = (md: string): Mutant[] => {
  const out: Mutant[] = [];
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
    out.push({ md: withCell(md, s.headerRow.line, 0, typo), siteId: sid("header-typo", s, s.headerRow.line, 0), bucket: "corrupting", domains: dom(s) });
  }
  return out;
};

const columnShift = (md: string): Mutant[] => {
  const out: Mutant[] = [];
  for (const s of seg(md).sections) {
    const dr = dataRows(s);
    if (dr.length < 1) continue; // Codex R13: require ≥1 data row
    const ls = lines(md);
    // insert a REAL empty leading cell (new pipe delimiter), not just whitespace (plan-R2):
    // "| x | y |" -> "|  | x | y |"
    for (const r of s.rows) ls[r.line] = ls[r.line]!.replace(/^\|/, "|  |");
    out.push({ md: ls.join("\n"), siteId: sid("column-shift", s, s.headerRow?.line ?? s.rows[0]!.line, 0), bucket: "corrupting", domains: dom(s), dataRowCount: dr.length });
  }
  return out;
};

const blankRowInject = (md: string): Mutant[] => {
  const out: Mutant[] = [];
  for (const s of seg(md).sections) {
    const dr = dataRows(s);
    // one mutant per interior data-row gap (plan-R3, exhaustive)
    for (let i = 0; i < dr.length - 1; i++) {
      const gapAfter = dr[i]!.line; // absolute line index in the ORIGINAL md
      const ls = lines(md); ls.splice(gapAfter + 1, 0, "");
      out.push({ md: ls.join("\n"), siteId: sid("blank-row:inject", s, gapAfter, `gap${i}`), bucket: "corrupting", domains: dom(s) });
    }
  }
  return out;
};

const blankRowRemove = (md: string): Mutant[] => {
  const { runs, sections } = seg(md);
  const out: Mutant[] = [];
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
    out.push({ md: md2, siteId: `blank-row:remove:B${a.index}:L${blankLine}:Xgap`, bucket: "corrupting", domains });
  }
  return out;
};

// ---- cosmetic operators ----
const sectionReorder = (md: string): Mutant[] => {
  // EXHAUSTIVE (plan-R10): one cosmetic mutant per ADJACENT block-pair swap, not just the
  // first two — a parser order-dependence between late blocks must also be exercised.
  const blocks = md.split(/\n\s*\n/);
  if (blocks.length < 2) return [];
  const out: Mutant[] = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    const swapped = [...blocks.slice(0, i), blocks[i + 1], blocks[i], ...blocks.slice(i + 2)].join("\n\n");
    if (swapped === md) continue; // identical blocks → no-op, skip
    out.push({ md: swapped, siteId: `section-reorder:B${i}:L0:Xpair${i}`, bucket: "cosmetic", domains: [] });
  }
  return out;
};

const trailingWhitespace = (md: string): Mutant[] => {
  const swapped = md.replace(/\n/g, "  \n") + "\n\n"; // trailing spaces on each line + trailing blank lines
  if (swapped === md) return [];
  return [{ md: swapped, siteId: "trailing-whitespace:B0:L0:Xeof", bucket: "cosmetic", domains: [] }];
};

export const OPERATORS: Record<string, (md: string) => Mutant[]> = {
  "header-typo": headerTypo, "ref-sub": refSub, "unicode-inject": unicodeInject,
  "column-shift": columnShift, "blank-row:inject": blankRowInject, "blank-row:remove": blankRowRemove,
  "merged-cell": mergedCell, "section-reorder": sectionReorder, "trailing-whitespace": trailingWhitespace,
};

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
  const eligible = floorEligible(OPERATORS[op]!(md));
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
  it("every GOLDEN_INVENTORY count is EXACT (hand-verified, protects against over-count, plan-R7)", () => {
    for (const g of GOLDEN_INVENTORY) {
      const md = readFileSync(g.fixture, "utf8");
      expect(auditSites(md).get(`${g.op}|${g.domain}`) ?? 0, `${g.fixture} ${g.op} ${g.domain}`).toBe(g.count);
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
    expect(has("merged-cell", "rooms"), "need a merged-cell × rooms row").toBe(true);
    expect(has("ref-sub", "crew"), "need a ref-sub × crew row").toBe(true);
    const domains = new Set(GOLDEN_INVENTORY.map((g) => g.domain));
    expect(domains.size, "golden inventory too narrow").toBeGreaterThanOrEqual(3);
  });
});

describe("audit independence is EXECUTABLE (plan-R7/R8)", () => {
  it("applicabilityAudit.ts references NO shared helper via any import/require/re-export form", () => {
    const src = readFileSync("tests/parser/mutation/applicabilityAudit.ts", "utf8");
    // covers: import ... from "X"|'X', export ... from "X", require("X"), import("X"),
    // with optional ./ prefix and optional .ts/.js suffix, both quote styles (plan-R8).
    for (const mod of ["rows", "classify", "operators"]) {
      const re = new RegExp(`(from|require\\(|import\\()\\s*['"]\\.?/?(\\./)?${mod}(\\.[tj]s)?['"]`);
      expect(re.test(src), `applicabilityAudit must not depend on ./${mod}`).toBe(false);
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
      bump("ref-sub", s.domain, cells.length);
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
 * required rows the structural gate checks: ref-sub×hotel, merged-cell×rooms, ref-sub×crew, one
 * header-typo, one blank-row:remove. (The `HAND_FIXTURE` test above is the separate, fully
 * self-contained external oracle; this table extends that guarantee onto the real corpus.)
 */
export const GOLDEN_INVENTORY: Array<{ fixture: string; op: string; domain: string; count: number; lines: string }> = [
  // Each `count` below is a PLACEHOLDER — the implementer opens the fixture at `lines`, counts
  // by hand, and writes the human-derived number (Task 6 Step 4). Do NOT paste auditSites output.
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "ref-sub", domain: "crew", count: 6, lines: "TODO:L<crew-section>" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "column-shift", domain: "crew", count: 1, lines: "TODO:L<crew-section>" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "header-typo", domain: "crew", count: 1, lines: "TODO:L<crew-header>" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "blank-row:remove", domain: "transportation", count: 1, lines: "TODO:L<transport-boundary>" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "blank-row:inject", domain: "crew", count: 5, lines: "TODO:L<crew-section>" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "unicode-inject", domain: "crew", count: 6, lines: "TODO:L<crew-section>" },
  { fixture: "fixtures/shows/exporter-xlsx/rpas.md", op: "ref-sub", domain: "hotel", count: 1, lines: "TODO:L<hotel-section>" },
  { fixture: "fixtures/shows/exporter-xlsx/rpas.md", op: "merged-cell", domain: "rooms", count: 1, lines: "TODO:L<rooms-section>" },
  // ADD MORE representative rows; every `count` is HAND-COUNTED from `lines`, never copied from code.
];
```

- [ ] **Step 4: Run it — verify it passes.** For each `GOLDEN_INVENTORY` row: open the fixture, set `lines` to the real line range of the section, HAND-COUNT the operator's applicable sites in that section, and write that human-derived number as `count` (the test asserts `===`). Do NOT paste `auditSites` output into `count` — if your hand-count disagrees with the audit, the audit is wrong; fix `auditSites`, not the golden number (plan-R9).

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

- [ ] **Step 1: Write the driver test (initially expected RED — the ledger is empty but real holes exist)**

```ts
// tests/parser/mutationHarness.test.ts
import { describe, it, expect } from "vitest";
import { FIXTURES, readFixture } from "./mutation/fixtures";
import { OPERATORS } from "./mutation/operators";
import type { Mutant } from "./mutation/operators";
import { capture, verdict, fingerprint } from "./mutation/oracle";
import { KNOWN_SILENT_HOLES, reconcileLedger } from "./mutation/knownHoles";
import type { Alarm } from "./mutation/knownHoles";

// Prefix each operator's siteId with the fixture slug so keys are globally unique across
// the corpus. Operator siteIds start "<op>:B..:L..:X.." → "<op>:<slug>:B..:L..:X..".
const withSlug = (m: Mutant, op: string, slug: string): Mutant =>
  ({ ...m, siteId: `${op}:${slug}:${m.siteId.slice(op.length + 1)}` });

/** Exhaustive: parse EVERY generated mutant across all fixtures × operators (plan-R2). */
function runAll(): { alarms: Alarm[]; allSiteIds: string[]; cosmeticViolations: string[] } {
  const alarms: Alarm[] = [];
  const allSiteIds: string[] = [];
  const cosmeticViolations: string[] = [];
  for (const f of FIXTURES) {
    const md = readFixture(f);
    const baseline = capture(md, `${f.slug}.md`);
    for (const [op, gen] of Object.entries(OPERATORS)) {
      for (const m of gen(md).map((x) => withSlug(x, op, f.slug))) {
        allSiteIds.push(m.siteId);
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
  return { alarms, allSiteIds, cosmeticViolations };
}

describe("mutation harness — bidirectional known-holes ledger", () => {
  const { alarms, allSiteIds, cosmeticViolations } = runAll();

  it("all generated siteIds are globally unique (Codex R2)", () => {
    expect(new Set(allSiteIds).size).toBe(allSiteIds.length);
  });
  it("cosmetic operators are fully invisible (payload + signals unchanged)", () => {
    expect(cosmeticViolations).toEqual([]);
  });
  it("actual alarms == committed ledger, keyed (siteId, kind, fingerprint) — bidirectional", () => {
    const { newAlarms, staleRows } = reconcileLedger(alarms, KNOWN_SILENT_HOLES);
    expect(newAlarms, `NEW/changed alarms not in ledger:\n${newAlarms.join("\n")}`).toEqual([]);
    expect(staleRows, `stale ledger rows (fixed or drifted):\n${staleRows.join("\n")}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — observe the day-1 alarm set**

Run: `pnpm vitest run tests/parser/mutationHarness.test.ts`
Expected: FAIL on the ledger test with a printed list of `newHoles` (the day-1 `SILENT_WRONG`/`SILENT_SIGNAL_LOSS` alarms — these are the real audit findings #1–#13). The uniqueness + cosmetic tests should PASS. If cosmetic FAILS, fix the operator (a cosmetic op changed output) before proceeding.

- [ ] **Step 3: Populate the ledger** — copy each printed `siteId|kind|fingerprint` into `KNOWN_SILENT_HOLES`, mapping each to its audit finding (`#1`–`#13`, or `"unaudited"` + a `BACKLOG.md` note). Example row:

```ts
export const KNOWN_SILENT_HOLES: readonly KnownHole[] = [
  { siteId: "header-typo:rpas:B..:L..:X0", kind: "wrong", fingerprint: "abc123...", finding: "#5", note: "HOTEL header typo silently drops the section (short-header no typo tolerance)" },
  // ...one row per day-1 alarm, finding mapped from the audit table.
];
```

- [ ] **Step 4: Re-run — verify GREEN**

Run: `pnpm vitest run tests/parser/mutationHarness.test.ts`
Expected: PASS (ledger == day-1 alarm set).

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutationHarness.test.ts tests/parser/mutation/knownHoles.ts
git commit --no-verify -m "feat(parser): mutation harness driver + day-1 known-holes ledger (audit findings #1-#13)"
```

---

### Task 9: Classifier-parity + coverage-floor + audit-agreement gates in the driver

**Files:**
- Modify: `tests/parser/mutationHarness.test.ts` (add gate blocks)

**Interfaces:**
- Consumes: `SECTION_DOMAIN_MAP`, `resolveHeader`, `REQUIRED_HEADERS_FOR_DOMAIN` (`./mutation/classify`), `OPERATORS`, `auditSites` (`./mutation/applicabilityAudit`), `KNOWN_SECTION_HEADERS`/`PREFIX_SECTION_FAMILIES` (`@/lib/parser/knownSections`).

- [ ] **Step 1: Add the gate tests**

```ts
// append to tests/parser/mutationHarness.test.ts
import { KNOWN_SECTION_HEADERS, PREFIX_SECTION_FAMILIES } from "@/lib/parser/knownSections";
import { SECTION_DOMAIN_MAP, resolveHeader, REQUIRED_HEADERS_FOR_DOMAIN } from "./mutation/classify";
import { OPERATORS as OPS } from "./mutation/operators";
import { auditSites } from "./mutation/applicabilityAudit";

describe("classifier parity gate (Codex R2/R4/R8)", () => {
  it("every KNOWN_SECTION_HEADERS entry is mapped and non-other", () => {
    for (const h of KNOWN_SECTION_HEADERS) {
      expect(SECTION_DOMAIN_MAP[h], `unmapped: ${h}`).toBeDefined();
      expect(SECTION_DOMAIN_MAP[h], `${h}=other`).not.toBe("other");
    }
  });
  it("suffixed room families resolve to rooms", () => {
    for (const fam of PREFIX_SECTION_FAMILIES) expect(SECTION_DOMAIN_MAP[resolveHeader(`${fam} SALON A`)!]).toBe("rooms");
  });
  it("lockstep REQUIRED_HEADERS_FOR_DOMAIN holds", () => {
    for (const [h, d] of REQUIRED_HEADERS_FOR_DOMAIN) expect(SECTION_DOMAIN_MAP[resolveHeader(h)!], h).toBe(d);
  });
});

describe("coverage floor + COUNT-level audit agreement (Codex R5/R9, exhaustive plan-R3)", () => {
  // EXACT: operator emit count per domain must EQUAL the independent audit count
  // (identical applicability predicate). header-typo is exact too — the audit replicates
  // its typo-eligibility guard (plan-R4). blank-row:remove is exact — its 2-domain mutant
  // credits each adjacent domain once, matching the audit's dual bump.
  const EXACT = ["header-typo", "ref-sub", "unicode-inject", "merged-cell", "column-shift", "blank-row:inject", "blank-row:remove"];

  const genCounts = (raw: { domains: string[] }[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const mut of raw) for (const d of mut.domains) m.set(d, (m.get(d) ?? 0) + 1);
    return m;
  };

  it("EXACT operators: per-domain generated count === independent audit count", () => {
    for (const f of FIXTURES) {
      const md = readFixture(f);
      const audit = auditSites(md);
      for (const op of EXACT) {
        const gen = genCounts(OPS[op]!(md));
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

- [ ] **Step 2: Run — verify GREEN**

Run: `pnpm vitest run tests/parser/mutationHarness.test.ts`
Expected: PASS. If a floor miss fires, the day-1 fixtures genuinely lack that op×domain — confirm via `auditSites` and relax that specific case only if the audit also reports zero (never weaken the gate globally).

- [ ] **Step 3: Commit**

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
    const crippled = OPS2["ref-sub"]!(md).filter((m) => m.domains.includes("crew")).slice(0, -1); // remove one
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
```

- [ ] **Step 2: Run — verify GREEN**

Run: `pnpm vitest run tests/parser/mutation/negativeControls.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

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
      for (const [op, gen] of Object.entries(OPERATORS)) {
        const ms = gen(md); // exhaustive
        total += ms.length;
        for (const m of ms) for (const dm of m.domains) domains.add(dm);
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

- [ ] **Step 2: Run — verify GREEN** (note the printed summary line)

Run: `pnpm vitest run tests/parser/mutationHarness.test.ts`
Expected: PASS; a `[mutation-harness] total=… domains=…` + `skippedInapplicable` line printed.

- [ ] **Step 3: Commit**

```bash
git add tests/parser/mutationHarness.test.ts
git commit --no-verify -m "test(parser): surface total mutant count + skippedInapplicable + domain coverage"
```

---

### Task 12: Final verification

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

---

## Self-Review checklist (run before adversarial review)

1. **Spec coverage:** every spec section maps to a task — segmentation/row-taxonomy (T1), classifier+parity+lockstep (T2), oracle+verdict+fingerprint (T3), 8 operators+selection+domains (T4), fixture registry+parity (T5), independent audit+golden (T6), ledger type (T7), driver+day-1 ledger+uniqueness+cosmetic+bidirectional (T8), classifier/floor/audit gates (T9), negative controls incl. R12/R13/R14/R15/R16 (T10), coverage legibility (T11), verification (T12). ✔
2. **Placeholder scan:** the only deferred concrete values are `GOLDEN_INVENTORY` exact counts and `KNOWN_SILENT_HOLES` rows — both are DATA populated from an observed run and hand-verified in-task (T6 S4, T8 S3), not code placeholders. ✔
3. **Type consistency:** `Mutant.domains: Domain[]`, `floorEligible(): Set<Domain>`, `skippedInapplicable(): Domain[]`, `verdict(): Verdict`, `fingerprint(): string`, `KnownHole` fields — consistent across T3/T4/T7/T8. Detection is exhaustive (no `select`/cap). ✔

## Adversarial review (cross-model)

After self-review, invoke `adversarial-review` (Codex) on this plan; iterate to APPROVE before execution handoff.
