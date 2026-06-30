# Parser INFO-tab fidelity cluster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three parser-only INFO-tab data-fidelity defects (dropped dress code, duplicated lunch room, mangled show title) so they reach the existing crew/review consumers.

**Architecture:** Three independent, surgical parser changes, each TDD'd and committed separately. (1) New `parseDress` block parser writing the existing `event_details.dress_code` via sentinel-aware merge. (2) Two scoped lines in `gear.ts newRoom` so the GEAR lunch room aligns with the INFO lunch room and merges. (3) A new title priority #0 (exporter banner) plus a shared `isAcceptableTitleCell` guard in `extractTitleFromMarkdown`.

**Tech Stack:** TypeScript, Vitest, the existing `lib/parser/**` block-parser architecture. No DB, no UI, no new deps.

**Spec:** `docs/superpowers/specs/2026-06-29-parser-info-tab-fidelity-design.md` (Codex-APPROVED, 10 rounds).

## Global Constraints

- **TDD per task** — failing test → run-it-fails → minimal impl → run-it-passes → commit. Never impl before its test.
- **Commit per task**, conventional commits: `feat(parser):` / `fix(parser):` / `test(parser):`. One task per commit; don't batch.
- **Non-UI only** — touch only `lib/parser/**` and `tests/parser/**`. No `app/`, `components/`, CSS, migrations.
- **Fixture discipline** — `fixtures/shows/exporter-xlsx/consultants.md` is the prod-format fixture; `fixtures/shows/raw/*` is legacy — **never regenerate it**. New unit tests use small inline markdown strings.
- **`--no-verify` on commits** (shared lint-staged hook belongs to the main checkout).
- Working dir: `/Users/ericweiss/fxav-parser-info-tab-fidelity` (branch `feat/parser-info-tab-fidelity`).
- Run tests from the worktree root, e.g. `pnpm vitest run tests/parser/dress.test.ts`.

---

## File Structure

- **Create** `lib/parser/blocks/dress.ts` — `parseDress(markdown): string | null` + `mergeDressCode(eventDetails, dress): void`.
- **Create** `tests/parser/dress.test.ts` — dress unit + sentinel-precedence tests.
- **Modify** `lib/parser/index.ts` — import + call `parseDress`/`mergeDressCode` after `parseEventDetails`; add title priority #0 + shared `isAcceptableTitleCell`.
- **Modify** `lib/parser/blocks/gear.ts` — `newRoom`: `^LUNCH` → `breakout` kind + lunch-scoped leading-`GRAND` strip.
- **Modify** `tests/parser/_metaKnownSectionsRegistry.test.ts` — add `"DRESS"` to `REQUIRED_HEADERS`.
- **Modify/extend** `tests/parser/exporterFixtures.test.ts` or a new `tests/parser/infoTabFidelity.test.ts` — lunch-dedup, title-banner, and structural title-guard assertions against the consultants fixture + inline fixtures.

---

## Task 1: DRESS-block capture (H1)

**Files:**
- Create: `lib/parser/blocks/dress.ts`
- Create: `tests/parser/dress.test.ts`
- Modify: `lib/parser/index.ts` (orchestrator wiring, after `parseEventDetails`)
- Modify: `tests/parser/_metaKnownSectionsRegistry.test.ts` (+`DRESS`)

**Interfaces:**
- Produces: `parseDress(markdown: string): string | null` and `mergeDressCode(eventDetails: Record<string, string>, dress: string | null): void` from `lib/parser/blocks/dress.ts`.
- Consumes: `clean`, `splitRow` from `./_helpers`; `normalizeHeader` from `@/lib/parser/knownSections`; `shouldHideGenericOptional` from `@/lib/visibility/emptyState`.

- [ ] **Step 1: Write the failing unit test** — `tests/parser/dress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDress, mergeDressCode } from "@/lib/parser/blocks/dress";

// Exact exporter shape from fixtures/shows/exporter-xlsx/consultants.md:31-34 —
// header row, a markdown SEPARATOR row, a continuation row, then a blank line.
const DRESS_BLOCK = [
  "| DRESS | Set/Strike: Black Pants, Black Polo Shirt, Black Footwear |",
  "| :---: | :---: |",
  "|  | Show: Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear |",
  "",
  "| DOCUMENT FOLDER LINK | DOCUMENT FOLDER LINK |",
].join("\n");

describe("parseDress", () => {
  it("captures both labeled lines, skipping the separator row", () => {
    expect(parseDress(DRESS_BLOCK)).toBe(
      "Set/Strike: Black Pants, Black Polo Shirt, Black Footwear\n" +
        "Show: Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear",
    );
  });

  it("returns null when there is no DRESS block", () => {
    expect(parseDress("| VENUE | Four Seasons |\n| DATES | |")).toBeNull();
  });

  it("stops at the next real labeled row", () => {
    const md = "| DRESS | Black Tie |\n| DETAILS | DETAILS |\n| LED | NO LED WALL |";
    expect(parseDress(md)).toBe("Black Tie");
  });

  // Negative-regression: if an impl treats the separator as a terminator it loses Show.
  it("does NOT stop at the separator (regression guard)", () => {
    expect(parseDress(DRESS_BLOCK)).toContain("Show:");
  });
});

describe("mergeDressCode (sentinel-aware precedence)", () => {
  it("a real block wins over absent", () => {
    const ed: Record<string, string> = {};
    mergeDressCode(ed, "Black Tie");
    expect(ed.dress_code).toBe("Black Tie");
  });
  it("a sentinel block does NOT clobber an existing real value", () => {
    const ed: Record<string, string> = { dress_code: "Black Tie" };
    mergeDressCode(ed, "N/A");
    expect(ed.dress_code).toBe("Black Tie");
  });
  it("a real block replaces an existing sentinel", () => {
    const ed: Record<string, string> = { dress_code: "N/A" };
    mergeDressCode(ed, "Black Tie");
    expect(ed.dress_code).toBe("Black Tie");
  });
  it("null block is a no-op", () => {
    const ed: Record<string, string> = { dress_code: "Black Tie" };
    mergeDressCode(ed, null);
    expect(ed.dress_code).toBe("Black Tie");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/parser/dress.test.ts`
Expected: FAIL — `Cannot find module '@/lib/parser/blocks/dress'`.

- [ ] **Step 3: Write the minimal implementation** — `lib/parser/blocks/dress.ts`:

```ts
/**
 * DRESS block parser (BL-PARSER-DRESS-DROP).
 *
 * The INFO `DRESS` block sits BEFORE the DETAILS header, so parseEventDetails
 * (which slices from the DETAILS header) never reads it. This standalone parser
 * captures the full block — header value + continuation rows, skipping the
 * exporter's `| :---: | :---: |` separator — into a label-retaining multi-line
 * string, then merges it into the existing `event_details.dress_code` consumer
 * via the same sentinel-aware precedence parseEventDetails uses (event.ts:314).
 */
import { clean, splitRow } from "./_helpers";
import { normalizeHeader } from "@/lib/parser/knownSections";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

const isSeparatorRow = (cells: string[]): boolean =>
  cells.length > 0 && cells.every((c) => /^[\s:|*-]*$/.test(c));

export function parseDress(markdown: string): string | null {
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (!t.startsWith("|")) continue;
    const cells = splitRow(t);
    if (normalizeHeader(clean(cells[0] ?? "")) !== "DRESS") continue;

    const collected: string[] = [];
    const headerVal = clean(cells[1] ?? "");
    if (headerVal) collected.push(headerVal);

    for (let j = i + 1; j < lines.length; j++) {
      const ct = lines[j]!.trim();
      if (!ct.startsWith("|")) break; // blank / non-table line ends the block
      const ccells = splitRow(ct);
      if (isSeparatorRow(ccells)) continue; // skip markdown separator row
      if (clean(ccells[0] ?? "")) break; // a real labeled row ends the block
      const val = clean(ccells[1] ?? "");
      if (val) collected.push(val);
    }

    const joined = collected.join("\n").trim();
    return joined.length > 0 ? joined : null;
  }
  return null;
}

/**
 * Sentinel-aware merge into event_details.dress_code (mirrors event.ts:314
 * writeField): a sentinel dress block never clobbers an existing real value;
 * otherwise the dress block wins.
 */
export function mergeDressCode(
  eventDetails: Record<string, string>,
  dress: string | null,
): void {
  if (dress === null) return;
  const existing = eventDetails["dress_code"];
  const existingIsReal = existing !== undefined && !shouldHideGenericOptional(existing);
  const incomingIsSentinel = shouldHideGenericOptional(dress);
  if (incomingIsSentinel && existingIsReal) return;
  eventDetails["dress_code"] = dress;
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `pnpm vitest run tests/parser/dress.test.ts`
Expected: PASS (all 8 cases).

- [ ] **Step 5: Wire into the orchestrator** — `lib/parser/index.ts`. Add the import near the other block imports (after line 27 `import { parseEventDetails } from "./blocks/event";`):

```ts
import { parseDress, mergeDressCode } from "./blocks/dress";
```

Then, immediately after the existing `const eventDetails = parseEventDetails(markdown, version, agg);` line (~line 454), add:

```ts
  mergeDressCode(eventDetails, parseDress(markdown));
```

- [ ] **Step 6: Add the end-to-end dress assertion** — append to `tests/parser/dress.test.ts`:

```ts
import { parseSheet } from "@/lib/parser/index";
import { readFileSync } from "node:fs";

describe("dress capture — real exporter fixture", () => {
  it("populates event_details.dress_code with both lines on consultants", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/consultants.md", "utf8");
    const dc = parseSheet(md).show.event_details.dress_code ?? "";
    expect(dc).toContain("Set/Strike:");
    expect(dc).toContain("Show:");
  });

  it("sentinel DRESS does not clobber a real DETAILS dress value (mixed source)", () => {
    const md = [
      "| AII Test | AII Test | AII Test |",
      "| DRESS | N/A |",
      "| :---: | :---: |",
      "",
      "| DETAILS | DETAILS |",
      "| Dress Code | Black Tie |",
    ].join("\n");
    expect(parseSheet(md).show.event_details.dress_code).toBe("Black Tie");
  });
});
```

- [ ] **Step 7: Run, verify pass**

Run: `pnpm vitest run tests/parser/dress.test.ts`
Expected: PASS. (If the mixed-source case fails, the orchestrator must call `parseEventDetails` BEFORE `mergeDressCode` — confirm ordering.)

- [ ] **Step 8: Extend the meta-test** — in `tests/parser/_metaKnownSectionsRegistry.test.ts`, add `"DRESS"` to the `REQUIRED_HEADERS` array (e.g. after `"DATES"`), and add `dress.ts DRESS` to the citing comment list above the array.

- [ ] **Step 9: Run the meta-test + event suite (no regressions)**

Run: `pnpm vitest run tests/parser/_metaKnownSectionsRegistry.test.ts tests/parser/event.test.ts tests/parser/eventDetailsNoFinancials.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/parser/blocks/dress.ts tests/parser/dress.test.ts lib/parser/index.ts tests/parser/_metaKnownSectionsRegistry.test.ts
git commit --no-verify -m "feat(parser): capture DRESS block into event_details.dress_code (BL-PARSER-DRESS-DROP)"
```

---

## Task 2: Lunch-room dedup (H2)

**Files:**
- Modify: `lib/parser/blocks/gear.ts` (`newRoom`, ~lines 92-110)
- Create/extend: `tests/parser/infoTabFidelity.test.ts`

**Interfaces:**
- Consumes: nothing new. Produces: no new exports — behavior change to `parseGearTab` output (GEAR lunch room kind/name), consumed by `mergeGearIntoRooms` in `index.ts:350`.

- [ ] **Step 1: Write the failing test** — create `tests/parser/infoTabFidelity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser/index";

const consultants = () =>
  parseSheet(readFileSync("fixtures/shows/exporter-xlsx/consultants.md", "utf8"));

describe("lunch-room dedup (H2)", () => {
  it("merges the GEAR lunch room onto the INFO lunch room (no duplicate)", () => {
    const rooms = consultants().rooms;
    const ballroomC = rooms.filter((r) => /\bBALLROOM C\b/i.test(r.name));
    // Exactly one BALLROOM C room (the INFO breakout), carrying GEAR audio.
    expect(ballroomC).toHaveLength(1);
    const lunch = ballroomC[0]!;
    expect(lunch.kind).toBe("breakout");
    expect(lunch.audio).toBeTruthy(); // GEAR audio merged in
    // No separate GRAND BALLROOM C room remains.
    expect(rooms.some((r) => /^GRAND BALLROOM C$/i.test(r.name))).toBe(false);
  });

  it("leaves GS and FOYER rooms intact", () => {
    const rooms = consultants().rooms;
    expect(rooms.some((r) => r.kind === "gs")).toBe(true);
    expect(rooms.some((r) => /^FOYER$/i.test(r.name))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm vitest run tests/parser/infoTabFidelity.test.ts -t "lunch-room dedup"`
Expected: FAIL — currently two BALLROOM C rooms (the INFO `BALLROOM C` + the GEAR `GRAND BALLROOM C`), so `toHaveLength(1)` fails.

- [ ] **Step 3: Implement** — in `lib/parser/blocks/gear.ts`, change `newRoom` (lines 92-110) to:

```ts
// Exported so the lunch-scoped GRAND-strip is unit-testable on the REAL code
// path (Codex plan-R1) — a global strip would regress GS/other rooms.
export function newRoom(header: string): GearRoom {
  const upper = header.toUpperCase();
  let kind: RoomKind = "additional";
  if (/^GENERAL\b/.test(upper)) kind = "gs";
  else if (/^BREAKOUT\b/.test(upper)) kind = "breakout";
  else if (/^LUNCH\b/.test(upper)) kind = "breakout"; // align with INFO lunchRe (rooms.ts:721)
  let stripped = header
    .replace(ROOM_PREFIX_RE, "")
    .replace(/\s*(Dimensions|Floor)\s*$/i, "")
    .trim();
  // Lunch-scoped only: the GEAR sheet names the lunch room "GRAND BALLROOM C"
  // while INFO names it "BALLROOM C". Strip the leading GRAND so the (kind, token)
  // merge key matches. NOT applied to other rooms (no global GRAND strip), so
  // distinct GRAND X / X rooms never false-merge.
  if (/^LUNCH\b/.test(upper)) stripped = stripped.replace(/^GRAND\s+/i, "");
  return {
    kind,
    name: stripped.length > 0 ? stripped : header.trim(),
    audio: null,
    video: null,
    lighting: null,
    scenic: null,
    other: null,
  };
}
```

- [ ] **Step 4: Run, verify the dedup test passes**

Run: `pnpm vitest run tests/parser/infoTabFidelity.test.ts -t "lunch-room dedup"`
Expected: PASS.

- [ ] **Step 5: Add the collision guard ON THE REAL CODE PATH (Codex plan-R1)** — the GRAND-strip lives in `newRoom`, so the guard must exercise `newRoom`, not a hand-built object fed to `mergeGearIntoRooms` (which would still pass if `newRoom` stripped GRAND *globally*). Append to `tests/parser/infoTabFidelity.test.ts`:

```ts
import { newRoom } from "@/lib/parser/blocks/gear";

// Direct newRoom coverage — proves the GRAND strip is scoped to ^LUNCH only.
describe("gear newRoom — GRAND strip is lunch-scoped (H2 collision safety)", () => {
  it("strips leading GRAND from a LUNCH room and sets kind=breakout", () => {
    expect(newRoom("LUNCH SESSION - GRAND BALLROOM C")).toMatchObject({
      kind: "breakout",
      name: "BALLROOM C",
    });
  });
  it("does NOT strip GRAND from a non-lunch additional room (no global strip)", () => {
    expect(newRoom("ADDITIONAL ROOM - GRAND FOYER")).toMatchObject({
      kind: "additional",
      name: "GRAND FOYER",
    });
  });
  it("does NOT strip GRAND from a GS room (a global strip would break GS merge)", () => {
    expect(newRoom("GENERAL SESSION - GRAND BALLROOM A/B")).toMatchObject({
      kind: "gs",
      name: "GRAND BALLROOM A/B",
    });
  });
});

// Integration guard on the real parser path: a global strip would de-merge GS
// (GEAR "GRAND BALLROOM A/B" → "BALLROOM A/B" ≠ INFO GS "GRAND BALLROOM A/B"),
// so the GS room would lose its merged gear.
describe("gear-merge integration — GS gear retained (H2)", () => {
  it("the consultants GS room keeps its merged GEAR audio", () => {
    const gs = consultants().rooms.find((r) => r.kind === "gs");
    expect(gs?.audio).toBeTruthy();
  });
});
```

> Rationale (Codex plan-R1): the earlier draft built a `GRAND FOYER` GearRoom literal and called `mergeGearIntoRooms` directly — that bypasses `newRoom`/`parseGearTab` where the strip is implemented, so a buggy global strip would still pass. Testing `newRoom` directly (the non-lunch `GRAND FOYER` → name unchanged) and asserting GS gear survives on the real fixture both exercise the actual code path and fail under a global strip.

- [ ] **Step 6: Run, verify pass**

Run: `pnpm vitest run tests/parser/infoTabFidelity.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the gear + exporter-fixture suites (no regressions)**

Run: `pnpm vitest run tests/parser/gear.test.ts tests/parser/exporterFixtures.test.ts tests/parser/parseSheet.test.ts`
Expected: PASS. (If `exporterFixtures.test.ts` pins a consultants room count or the GS/breakout triples, update only the lunch-room expectation to the merged single room; do NOT touch the inline-GS-header `#1a` assertions.)

- [ ] **Step 8: Commit**

```bash
git add lib/parser/blocks/gear.ts tests/parser/infoTabFidelity.test.ts tests/parser/exporterFixtures.test.ts
git commit --no-verify -m "fix(parser): dedupe lunch room by aligning GEAR lunch kind+name to INFO (BL-ROOM-GEAR-MERGE-DEDUP)"
```

---

## Task 3: Title banner-preference + shared guard (M3)

**Files:**
- Modify: `lib/parser/index.ts` (`extractTitleFromMarkdown` — add priority #0 + `isAcceptableTitleCell`; refactor #6)
- Extend: `tests/parser/infoTabFidelity.test.ts`

**Interfaces:**
- Consumes: `isKnownSectionHeader` from `@/lib/parser/knownSections` (new import in index.ts); existing `isKnownNonTitle`, `CELL_SPLIT_RE`, `TABLE_ROW_RE`, `KNOWN_NON_TITLES`.
- Produces: no new exports; `show.title` now prefers the banner.

- [ ] **Step 1: Write the failing test** — append to `tests/parser/infoTabFidelity.test.ts`:

```ts
import { KNOWN_SECTION_HEADERS, PREFIX_SECTION_FAMILIES } from "@/lib/parser/knownSections";

describe("title banner-preference (M3)", () => {
  it("uses the proper-cased line-1 banner, not the uppercase Event Name cell", () => {
    expect(consultants().show.title).toBe("AII/III - Consultants Roundtable 2025");
  });

  it.each([
    ["fintech", "II - FinTech Forum CTO Summit 2026"],
    ["fixed-income", "II - Fixed Income Trading Summit 2025"],
    ["rpas", "II - Retirement Plan Advisor Institute - Central 2026"],
  ])("%s uses the proper-cased banner", (slug, expected) => {
    const md = readFileSync(`fixtures/shows/exporter-xlsx/${slug}.md`, "utf8");
    expect(parseSheet(md).show.title).toBe(expected);
  });

  it("a positive banner that is not a section header is accepted", () => {
    const md = "| Acme Annual Forum 2026 | Acme Annual Forum 2026 |\n| CLIENT | X |";
    expect(parseSheet(md).show.title).toBe("Acme Annual Forum 2026");
  });
});

describe("title guard — section headers never become the title (structural, M3)", () => {
  const bare = [...KNOWN_SECTION_HEADERS];
  const suffixed = [...PREFIX_SECTION_FAMILIES].flatMap((fam) => [
    `${fam} - SYNTHETIC ROOM`,
    `${fam} 2 - SYNTHETIC`,
    `${fam} SYNTHETIC ROOM`, // no-separator shape
  ]);
  it.each([...bare, ...suffixed])(
    "duplicated first-row header %s is not promoted to show.title",
    (header) => {
      // no-banner sheet whose first table row is the header, column-duplicated
      const md = `| ${header} | ${header} |\n| CLIENT | X |\n| DATES | |`;
      expect(parseSheet(md).show.title).not.toBe(header);
    },
  );
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm vitest run tests/parser/infoTabFidelity.test.ts -t "title"`
Expected: FAIL — consultants title is currently `AII/III - CONSULTANTS ROUNDTABLE` (uppercase Event Name), and some duplicated-header cases return the header.

- [ ] **Step 3: Implement** — `lib/parser/index.ts`. Add the import (with the other `knownSections` imports, or near the top of the title section):

```ts
import { isKnownSectionHeader } from "@/lib/parser/knownSections";
```

Add the shared guard helper just above `extractTitleFromMarkdown` (after `isKnownNonTitle`, ~line 109):

```ts
// Shared title-cell acceptance guard, used by BOTH the banner (#0) and the
// first-cell fallback (#6) so they cannot drift. Rejects empties, known
// non-titles, CLIENT/NO_HEADER label rows, escaped error cells, and — via the
// parser's OWN canonical recognizer — any bare or room-family section header
// (so a duplicated "DOCUMENT FOLDER LINK" / "GENERAL SESSION SALON ABC" first
// row can never become show.title). See spec Fix 3.
function isAcceptableTitleCell(cell: string): boolean {
  if (cell.length === 0) return false;
  if (isKnownNonTitle(cell)) return false;
  if (cell.toUpperCase().startsWith("CLIENT")) return false;
  if (cell.toUpperCase().startsWith("NO_HEADER")) return false;
  if (cell === "\\#NUM\\!") return false;
  if (/^\\#/.test(cell)) return false;
  if (isKnownSectionHeader(cell)) return false;
  return true;
}
```

Add priority #0 at the very start of `extractTitleFromMarkdown`'s body (before the existing `// 1. Scan ... "Event Name:"` loop):

```ts
  // 0. Exporter banner: line 1 is the show title, column-duplicated across cells.
  //    Examine only the first non-separator table row; require the first cell to
  //    be duplicated in another cell AND pass the shared title guard.
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|\s*[:|-]+\s*\|/.test(trimmed)) continue; // skip separator row
    const cells = trimmed
      .split(CELL_SPLIT_RE)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells[0] && cells[1] && cells[0] === cells[1] && isAcceptableTitleCell(cells[0])) {
      return cells[0];
    }
    break; // only the first non-separator table row is a banner candidate
  }
```

Refactor the existing #6 guard (index.ts:202-209) to use the shared helper — replace the inline boolean with:

```ts
      const cell = match[1]?.trim() ?? "";
      if (isAcceptableTitleCell(cell)) {
        return cell;
      }
```

- [ ] **Step 4: Run, verify the title tests pass**

Run: `pnpm vitest run tests/parser/infoTabFidelity.test.ts -t "title"`
Expected: PASS (banner-preference, the it.each proper-cased banners, the positive, and the full structural it.each over the registry).

- [ ] **Step 5: Run the title-corpus guard + full parser title surface (no regressions)**

Run: `pnpm vitest run tests/parser/parseSheet.test.ts tests/parser/exporterFixtures.test.ts tests/parser/slug.test.ts`
Expected: PASS. (`parseSheet.test.ts:44/54` generic guards — "no column header as title", "not suspiciously short" — must still pass. If any test snapshotted the OLD uppercase consultants/fintech/etc. title, update it to the proper-cased banner.)

- [ ] **Step 6: Commit**

```bash
git add lib/parser/index.ts tests/parser/infoTabFidelity.test.ts
git commit --no-verify -m "fix(parser): prefer line-1 banner over Event Name for show title (BL-TITLE-EVENT-NAME-PREFERENCE)"
```

---

## Task 4: Full-suite verification + live-sheet validation gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full parser test suite**

Run: `pnpm vitest run tests/parser/`
Expected: PASS, no regressions. Pay attention to `dataGaps.test.ts`, `warnings.test.ts`, `unknownSection.test.ts`, `parseSheet.test.ts`, `exporterFixtures.test.ts`, `_metaKnownSectionsRegistry.test.ts`.

- [ ] **Step 2: Run typecheck + lint on the touched files**

Run: `pnpm tsc --noEmit` (or the repo's typecheck script) and `pnpm lint lib/parser tests/parser` (or the repo's lint script). Fix any type/lint errors.
Expected: clean.

- [ ] **Step 3: Re-confirm the live-sheet validation gate** (spec §"Live-sheet validation"). Using gsheets MCP on sheet `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4`, re-confirm the three content assumptions still hold and the implementation matches:
  - `INFO` DRESS block (rows ~27-28) has `Set/Strike:` + `Show:` lines.
  - `GEAR` has `LUNCH SESSION - GRAND BALLROOM C`; `INFO` has `LUNCH ROOM … BALLROOM C`.
  - `INFO` row 1 banner is proper-cased; `GEAR` `Event Name:` is uppercase.

  Record the result (pass/fail + any drift) in the PR description. If the live sheet has drifted from these assumptions, STOP and reconcile before merge.

- [ ] **Step 4: Run the broader suite touched by parser output** (defense vs. cross-surface breakage)

Run: `pnpm vitest run tests/parser tests/onboarding tests/components/tiles 2>/dev/null || pnpm vitest run tests/parser`
Expected: PASS. (If the wider suite is slow/oversized, at minimum run any suite that imports `parseSheet`/room/title/event output. Note in the PR which suites ran.)

- [ ] **Step 5: No commit** (verification task — its evidence lands in the PR body). If Step 2 required a formatting fix, commit it as `chore(parser): formatting`.

---

## Task 5: Whole-diff cross-model review → CI → merge (Stage 4 close-out)

**Files:** none (process).

- [ ] **Step 1: Whole-diff adversarial review** — run the Codex companion `adversarial-review --wait` against the full implementation diff (fresh-eyes, REVIEWER ONLY, no round budget). Triage findings via deferral discipline (land-now / DEFERRED.md / BACKLOG.md). Iterate to APPROVE.

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin feat/parser-info-tab-fidelity
gh pr create --base main --title "parser: INFO-tab fidelity cluster (dress, lunch dedup, title)" --body "<summary + live-sheet validation result + per-fix BL refs>"
```

- [ ] **Step 3: Confirm REAL CI green** — `gh pr checks <PR#> --watch`; re-confirm `mergeStateStatus == CLEAN` (not DIRTY/behind base). Local-green is necessary but NOT sufficient.

- [ ] **Step 4: Merge as a merge commit**

```bash
gh pr merge <PR#> --merge
```

- [ ] **Step 5: Fast-forward local main + verify no divergence**

```bash
git -C /Users/ericweiss/FX-Webpage-Template fetch origin
git -C /Users/ericweiss/FX-Webpage-Template merge --ff-only origin/main
git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main   # expect: 0  0
```

- [ ] **Step 6: Mark the three resolved BL entries** — in a follow-up (or final) commit on the branch BEFORE merge, flip `BL-PARSER-DRESS-DROP`, `BL-ROOM-GEAR-MERGE-DEDUP`, `BL-TITLE-EVENT-NAME-PREFERENCE` to `✅ RESOLVED — PR #<n>` in `BACKLOG.md` (keep the prose). If done post-merge, it's a separate tiny docs PR.

---

## Self-Review

- **Spec coverage:** Fix 1 (dress) → Task 1; Fix 2 (lunch dedup) → Task 2; Fix 3 (title) → Task 3; dropped Fix 4 → not implemented (correct); meta-test → Task 1 Step 8; live-sheet gate → Task 4 Step 3; companion surfaces (dataGaps/warnings/exporterFixtures) → Task 4 Step 1. ✓
- **Anti-tautology:** dress test asserts the parsed value (not a container); lunch test asserts `rooms` array shape derived from the fixture; title structural test derives cases from the live registry (not hardcoded). Each test states the failure mode it catches and has a negative-regression. ✓
- **Type consistency:** `parseDress`/`mergeDressCode` signatures match between Task 1 def and the orchestrator call; `newRoom` is exported from gear.ts and imported in the Task 2 collision test (real code-path coverage, Codex plan-R1); `isAcceptableTitleCell` used identically by #0 and #6. ✓
- **No placeholders:** every code step shows real code; every run step shows the exact command + expected result. ✓

## Execution Handoff

This plan is executed inline as Stage 3 of the autonomous ship-feature pipeline (subagent-driven not required for a 3-task parser change; tasks are small and sequential). After the plan's own Codex adversarial-review APPROVES, implement Tasks 1→5 in order.
