# Parser Typo-Tolerance PR-D3 (rooms V4 bare labels) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover misspelled v4 room field labels. In `parseV4RoomBlock` a field row is recognized only by an exact `if/else` chain over `V4_BARE_LABELS` (rooms.ts:352-365); a typo (e.g. `Lightng`, `Scnic`, `Digtal Signage`) hits no branch and the field value is silently dropped. PR-D3 adds a gated fuzzy fallback so a near-miss recovers into the right field with a `FIELD_LABEL_AUTOCORRECTED` warning — mirroring the shipped PR-D1 event pattern (deferred-commit + sentinel-aware `exactReal`).

**Architecture:** Replace the exact `if/else` chain with a `V4_LABEL_TO_FIELD` map lookup (so each label resolves to a field). An EXACT label assigns immediately and claims the field in `exactReal` (only when its value is real — non-null and non-sentinel). A non-exact label runs `gatedVocabCorrect` over the **12 bare labels** and records a deferred fuzzy candidate. After the block loop, fuzzy candidates are applied for fields no exact label claimed, with a **phantom-room guard** so fuzzy-only content can never resurrect a placeholder stub. Threads the existing `ParseAggregator` from `parseRooms` → `parseV4Rooms` → `parseV4RoomBlock`. The v2/v1 sub-parsers (`parseGsRoom`/`parseBoRooms`/`parseAdditionalRoom`) are out of scope.

**Tech Stack:** TypeScript, Next.js 16 parser modules, Vitest. No DB, no UI, no migrations.

> **Design provenance:** this plan was stress-tested by a 3-prober design workflow before drafting; the four must-fix items it surfaced (sentinel fidelity, phantom-room elevation, agg threading, exact-map completeness) are baked in as hard contracts below. The workflow also proved the collision check clean (zero cross-vocab Damerau≤1; only `DIGITAL SIGNAGE` overlaps `eventFieldAlias` and is identical → skipped by the tripwire).

## Scope (v4-only, deliberate)

- **In scope:** `parseV4RoomBlock` (the v4 GENERAL SESSION / BREAKOUT / ADDITIONAL ROOM field rows). Fuzzy targets are the **12 bare labels** in `V4_BARE_LABELS` (rooms.ts:183-196).
- **Out of scope (documented):** the v2/v1 sub-parsers (`parseGsRoom`/`parseBoRooms`/`parseAdditionalRoom` via `collectV2V1Rooms`); v4-block **detection** (`hasBareV4DataRow`, rooms.ts:198-207, still requires ≥1 exact bare label as the first data row — PR-D3 recovers typo'd labels *inside an already-detected v4 block*, it does not change detection); multiword-suffix-header typo recovery (e.g. `Backdrop Scnic`) stays **P4** — the fuzzy vocab is the 12 bare labels only, so a multiword-alias typo is dropped (asserted as a boundary test).

## Global Constraints

- **TDD per task** (invariant 1). One task per commit (`feat(parser):` / `test(parser):`).
- **No new error code.** Reuse `FIELD_LABEL_AUTOCORRECTED` (catalog `lib/messages/catalog.ts:1117`, OPERATOR_ACTIONABLE `lib/parser/dataGaps.ts:131`, dispatch `lib/drive/showDayTimeAnchors.ts:141`, `_families` `app/help/errors/_families.ts:61`). `rooms` is a RegionId (`lib/sheet-links/buildSheetDeepLink.ts:27`) → region-level deep-link. **No §12.4 lockstep.**
- **Single source / no drift:** `V4_BARE_LABEL_VOCAB` is DERIVED from `V4_BARE_LABELS` (uppercased) and exported once; the registry imports it; a registration test re-derives.

## Behavior contract (the four hard guardrails)

1. **Exact-real wins; sentinel-aware (mirror PR-D1 exactly).** An exact label claims its field only when its value is **real** — `presence(col1) !== null` AND `!shouldHideGenericOptional(presence(col1))` (i.e. not `''`/`TBD`/`N/A`/`TBA`). An empty or sentinel exact value does NOT claim, so a real fuzzy sibling still recovers (no data loss). Among fuzzy siblings: last-write-wins, but a sentinel candidate never displaces a real one held (same rule as the exact write). Import `shouldHideGenericOptional` alongside `presence`.
2. **Phantom-room guard (rooms-specific).** `parseV4Rooms` drops a breakout/additional room when `!roomHasContent(room) && isPlaceholderRoomName(name)` (rooms.ts:256/274). Fuzzy candidates are applied INSIDE `parseV4RoomBlock` before the room is returned, so they would otherwise count toward `roomHasContent`. Therefore: if the room is a **gated kind** (`breakout`/`additional`) AND has **no exact content** (`!roomHasContent(room)` evaluated BEFORE applying fuzzy) AND a placeholder name, then **skip the fuzzy application entirely** (no assignment, no warning) — fuzzy-only content may not resurrect a placeholder stub, and a dropped room emits no warning. `gs` kind is ungated and unaffected; non-placeholder-named rooms are unaffected (they pass via `!isPlaceholderRoomName`).
3. **Agg threading.** Add `agg?: ParseAggregator` to `parseV4Rooms` (rooms.ts:209) and `parseV4RoomBlock` (rooms.ts:316); pass from `parseRooms` (rooms.ts:61) through the per-block calls (rooms.ts:236/254/272). A test must assert the warning is present in `agg.warnings`, not just that the field was assigned.
4. **Exact-map completeness.** `V4_LABEL_TO_FIELD` carries the **12 bare labels + 3 aliases** (`backdrop / scenic`→scenic, `gs other`→other, `bo other`→other) = **15 keys**, lowercase keys, underscore field names. These aliases stay EXACT-only and must NOT enter `V4_BARE_LABEL_VOCAB` (the fuzzy vocab = the 12 bare labels). A registration test pins the 15 keys.

## Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/parser/typoVocabCollision.test.ts` — adds a derived `roomV4Label` fuzzable row + a registration test. The standing tripwire asserts no member within Damerau-1 of any OTHER registered vocab (workflow-verified clean).
- **N/A — declared:** advisory-lock, Supabase call-boundary, admin_alerts, postgrest-dml-lockdown — parser-only.
- **N/A — no new warn code** → no `x1` catalog-parity lockstep.

## File Structure

- **Modify** `lib/parser/blocks/rooms.ts` — imports (`gatedVocabCorrect`, `shouldHideGenericOptional`); `RoomFieldKey` type + `V4_LABEL_TO_FIELD` (15) + exported `V4_BARE_LABEL_VOCAB` + gate opts; refactor `parseV4RoomBlock` (map lookup + exactReal + deferred fuzzy + phantom guard); thread `agg`; update the header docstring.
- **Modify** `lib/parser/typoVocabRegistry.ts` — add the `roomV4Label` entry importing `V4_BARE_LABEL_VOCAB`.
- **Modify** `tests/parser/blocks/rooms.test.ts` — fuzzy-recovery describe block (Task 1) + property test (Step 5).
- **Modify** `tests/parser/typoVocabCollision.test.ts` — `roomV4Label` registration test (Task 2).

---

## Task 1: Fuzzy field-label recovery in parseV4RoomBlock

**Files:**
- Modify: `lib/parser/blocks/rooms.ts`
- Test: `tests/parser/blocks/rooms.test.ts`

**Interfaces:**
- Consumes: `gatedVocabCorrect` (`lib/parser/typoGate.ts:16`), `shouldHideGenericOptional` (`lib/visibility/emptyState.ts:75`), `ParseAggregator` + `newAggregator` (`lib/parser/warnings.ts`).
- Produces (Task 2): `export const V4_BARE_LABEL_VOCAB: readonly string[]` from `lib/parser/blocks/rooms.ts`.

**Test-construction note (critical):** a v4 block is only *detected* when `hasBareV4DataRow` (rooms.ts:198-207) sees an exact bare label as the first data row. So every recovery test block must START with an exact bare label row (for detection), and put the **typo on a *different* field** than the detector label (else the exact label claims that field and the fuzzy is correctly suppressed). All fixtures below follow this.

- [ ] **Step 1: Write the failing BEHAVIOR tests** — append to `tests/parser/blocks/rooms.test.ts`. Add `import { newAggregator } from "@/lib/parser/warnings";`. Then append:

```ts
// ── PR-D3: v4 fuzzy field-label recovery ─────────────────────────────────────
const FLA = (agg: ReturnType<typeof newAggregator>) =>
  agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
// A v4 GS block. First row MUST be an exact bare label so hasBareV4DataRow detects v4.
function v4Gs(name: string, rows: string[]): string {
  return [`| GENERAL SESSION ${name} | |`, ...rows].join("\n") + "\n";
}
function v4Breakout(name: string, rows: string[]): string {
  return [`| BREAKOUT 1 ${name} | |`, ...rows].join("\n") + "\n";
}

describe("parseRooms — v4 fuzzy field-label recovery (PR-D3)", () => {
  it("recovers a misspelled label into the right field and warns once (kind=rooms)", () => {
    // "Setup" exact = detector + claims setup; "Lightng" typo recovers into lighting.
    const agg = newAggregator();
    const rooms = parseRooms(v4Gs("BALLROOM", ["| Setup | 100 chairs |", "| Lightng | 4 movers |"]), "v4", agg);
    const gs = rooms.find((r) => r.kind === "gs")!;
    expect(gs.setup).toBe("100 chairs");
    expect(gs.lighting).toBe("4 movers");
    const warns = FLA(agg);
    expect(warns).toHaveLength(1);
    expect(warns[0]!.severity).toBe("warn");
    expect(warns[0]!.blockRef?.kind).toBe("rooms");
    expect(warns[0]!.rawSnippet).toBe("Lightng");
  });

  it("exact-wins: an exact label beats a typo'd sibling for the same field, either order, no warn", () => {
    const a = newAggregator();
    const ra = parseRooms(v4Gs("A", ["| Setup | REAL |", "| Setp | WRONG |"]), "v4", a).find((r) => r.kind === "gs")!;
    expect(ra.setup).toBe("REAL");
    expect(FLA(a)).toHaveLength(0);
    const b = newAggregator();
    const rb = parseRooms(v4Gs("B", ["| Setp | WRONG |", "| Setup | REAL |"]), "v4", b).find((r) => r.kind === "gs")!;
    expect(rb.setup).toBe("REAL");
    expect(FLA(b)).toHaveLength(0);
  });

  it("empty exact does NOT claim: a real typo sibling recovers and warns", () => {
    // "Lighting" exact (detector) is real; "Setup" exact is EMPTY so does not claim setup;
    // "Setp" typo recovers into setup.
    const agg = newAggregator();
    const gs = parseRooms(v4Gs("C", ["| Lighting | x |", "| Setup | |", "| Setp | 80 rounds |"]), "v4", agg).find((r) => r.kind === "gs")!;
    expect(gs.setup).toBe("80 rounds");
    expect(FLA(agg)).toHaveLength(1);
  });

  it("SENTINEL exact does NOT claim: a sentinel exact value never blocks a real fuzzy recovery", () => {
    // "Setup | TBD" is a sentinel → does not claim setup; "Setp | Real" recovers.
    const agg = newAggregator();
    const gs = parseRooms(v4Gs("D", ["| Lighting | x |", "| Setup | TBD |", "| Setp | Real |"]), "v4", agg).find((r) => r.kind === "gs")!;
    expect(gs.setup).toBe("Real");
    expect(FLA(agg)).toHaveLength(1);
  });

  it("two fuzzy siblings: last-write-wins, single warn", () => {
    const agg = newAggregator();
    const gs = parseRooms(v4Gs("E", ["| Setup | x |", "| Lightng | A |", "| Lightng | B |"]), "v4", agg).find((r) => r.kind === "gs")!;
    expect(gs.lighting).toBe("B");
    expect(FLA(agg)).toHaveLength(1);
  });

  it("PHANTOM guard: fuzzy-only content does NOT resurrect a placeholder breakout (room dropped, no warn)", () => {
    // Placeholder name + all exact rows empty + one typo with a value → room must be DROPPED.
    const agg = newAggregator();
    const rooms = parseRooms(v4Breakout("BREAKOUT ROOM", ["| Setup | |", "| Scnic | white cyc |"]), "v4", agg);
    expect(rooms.some((r) => r.kind === "breakout")).toBe(false);
    expect(FLA(agg)).toHaveLength(0);
  });

  it("REAL-ROOM fuzzy: a non-placeholder breakout recovers a typo'd field and warns", () => {
    const agg = newAggregator();
    const rooms = parseRooms(v4Breakout("SALON D", ["| Setup | |", "| Scnic | white cyc |"]), "v4", agg);
    const bo = rooms.find((r) => r.kind === "breakout");
    expect(bo?.scenic).toBe("white cyc");
    expect(FLA(agg)).toHaveLength(1);
  });

  it("exact alias 'backdrop / scenic' routes to scenic with NO fuzzy warning", () => {
    const agg = newAggregator();
    const gs = parseRooms(v4Gs("F", ["| Setup | x |", "| backdrop / scenic | blue |"]), "v4", agg).find((r) => r.kind === "gs")!;
    expect(gs.scenic).toBe("blue");
    expect(FLA(agg)).toHaveLength(0);
  });

  it("multi-block isolation: the same typo in two blocks emits two independent warnings", () => {
    const agg = newAggregator();
    const md = v4Gs("G", ["| Setup | x |", "| Lightng | A |"]) + v4Breakout("SALON E", ["| Setup | y |", "| Lightng | B |"]);
    parseRooms(md, "v4", agg);
    expect(FLA(agg)).toHaveLength(2);
  });

  it("below-minLen / tie-abort: short or ambiguous labels are not fuzz-recognized (field stays null)", () => {
    const agg = newAggregator();
    const gs = parseRooms(v4Gs("H", ["| Setup | x |", "| Pwr | y |"]), "v4", agg).find((r) => r.kind === "gs")!;
    expect(gs.power).toBeNull(); // "Pwr" (3 chars) < minLen 5 → not corrected
    expect(FLA(agg)).toHaveLength(0);
  });

  it("multiword-alias typo stays P4 (dropped, not recovered): 'Backdrop Scnic' is not fuzzed", () => {
    const agg = newAggregator();
    const gs = parseRooms(v4Gs("I", ["| Setup | x |", "| Backdrop Scnic | blue |"]), "v4", agg).find((r) => r.kind === "gs")!;
    expect(gs.scenic).toBeNull(); // distance > 1 from the 12 bare labels → null
    expect(FLA(agg)).toHaveLength(0);
  });
});
```

  **Concrete failure modes these catch:** value-into-wrong-field (recover); a typo clobbering an exact field, both orders (exact-wins); silent data loss when the exact row is empty/sentinel (empty + SENTINEL — the latter is the test that fails if `presence!==null` is used instead of the sentinel check); first-vs-last fuzzy siblings (two-siblings); **a phantom placeholder room surfacing via fuzzy-only content (PHANTOM)** and the converse real-room recovery (REAL-ROOM); alias-into-fuzzy regression (alias); cross-block state leakage (multi-block); over-eager short/ambiguous matching (below-minLen); P4 scope boundary (multiword-alias).

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run tests/parser/blocks/rooms.test.ts`. Expected: the **recover**, **empty-exact**, **SENTINEL**, **two-siblings**, **REAL-ROOM**, and **multi-block** tests FAIL on their assertions (today the typo'd field is dropped, no warn); the **exact-wins**, **PHANTOM**, **alias**, **below-minLen**, and **multiword-alias** tests already PASS (current behavior drops the typos and the phantom room). Confirm that split.

- [ ] **Step 3: Implement in `lib/parser/blocks/rooms.ts`.**

  3a. Imports (extend the existing `_helpers` import line, rooms.ts:29, and add two):
```ts
import { clean, presence, splitRow } from "./_helpers";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
```

  3b. After the `V4_BARE_LABELS` Set (after rooms.ts:196) add the field type, the exact map (15), the derived fuzzy vocab, and gate opts:
```ts
type RoomFieldKey =
  | "setup" | "set_time" | "show_time" | "strike_time" | "audio" | "video"
  | "lighting" | "scenic" | "power" | "digital_signage" | "other" | "notes";

// EXACT label → field. 12 bare labels + 3 aliases the if/else chain handled
// ("backdrop / scenic"→scenic, "gs other"/"bo other"→other). Lowercase keys (col0 is
// lowercased), underscore field names. These aliases stay EXACT-only — they are NOT in
// the fuzzy vocab below.
const V4_LABEL_TO_FIELD: Record<string, RoomFieldKey> = {
  setup: "setup",
  "set time": "set_time",
  "show time": "show_time",
  "strike time": "strike_time",
  audio: "audio",
  video: "video",
  lighting: "lighting",
  scenic: "scenic",
  "backdrop / scenic": "scenic",
  power: "power",
  "digital signage": "digital_signage",
  other: "other",
  "gs other": "other",
  "bo other": "other",
  notes: "notes",
};

// Uppercase fuzzable vocab the v4 fuzzy fallback corrects toward — DERIVED from V4_BARE_LABELS
// (single source; lib/parser/typoVocabRegistry.ts imports this exact const so it can't drift).
// All 12 members are >=5 chars, so minLen:5 never trips.
export const V4_BARE_LABEL_VOCAB: readonly string[] = [...V4_BARE_LABELS].map((s) =>
  s.toUpperCase(),
);
// Do-not-fuzz tokens (belt-and-suspenders — all <5 chars so minLen:5 already drops them;
// passed for parity with the milestone's gate-exclusion convention).
const ROOM_GATE_EXCLUDE = ["LED", "LEAD", "DATE", "DAY", "ROOM", "TBD", "TBA", "N/A"] as const;
const ROOM_GATE_OPTS = { minLen: 5, tieAbort: true, exclude: ROOM_GATE_EXCLUDE } as const;
```

  3c. Refactor `parseV4RoomBlock` (rooms.ts:316-369). Replace the body from `let j = startLine;` through the closing of the `while` loop and the `return`, with:
```ts
  let j = startLine;

  // PR-D3 deferred-commit state (block-LOCAL — fresh per block, no cross-block leakage):
  // fields an EXACT label gave a REAL (non-null, non-sentinel) value, and fuzzy candidates.
  const exactReal = new Set<RoomFieldKey>();
  const fuzzyCandidates = new Map<RoomFieldKey, { rawLabel: string; value: string }>();

  while (j < lines.length) {
    const line = (lines[j] ?? "").trim();
    j++;

    if (!line.startsWith("|")) break;

    const cells = splitRow(line);
    const col0 = clean(cells[0] ?? "");
    const col1 = clean(cells[1] ?? "");

    // Separator row
    if (cells.every((c) => /^[\s:|*-]*$/.test(c))) continue;

    // Stop at another room header (all-caps only, same rule as detection above)
    if (
      /^GENERAL SESSION\b/.test(col0) ||
      /^BREAKOUT \d/.test(col0) ||
      /^ADDITIONAL\s+ROOM\b/.test(col0)
    ) {
      j--; // back up so the outer loop sees this
      break;
    }

    const label = col0.toLowerCase();
    const exactField = V4_LABEL_TO_FIELD[label];
    if (exactField !== undefined) {
      const v = presence(col1);
      room[exactField] = v;
      // A real value claims the field (sentinel/empty does NOT — mirrors PR-D1).
      if (v !== null && !shouldHideGenericOptional(v)) exactReal.add(exactField);
    } else {
      // Not an exact label: try a gated fuzzy recovery on the LABEL only (never the value).
      const fix = gatedVocabCorrect(col0.toUpperCase(), V4_BARE_LABEL_VOCAB, ROOM_GATE_OPTS);
      const v = presence(col1);
      if (fix?.corrected && v !== null) {
        const field = V4_LABEL_TO_FIELD[fix.match.toLowerCase()];
        if (field) {
          // Last-write-wins with sentinel-aware precedence (a sentinel never displaces a real
          // candidate held), matching the exact-write rule.
          const prev = fuzzyCandidates.get(field);
          const prevIsReal = prev !== undefined && !shouldHideGenericOptional(prev.value);
          if (!(shouldHideGenericOptional(v) && prevIsReal)) {
            fuzzyCandidates.set(field, { rawLabel: col0, value: v });
          }
        }
      }
    }
  }

  // Phantom-room guard: for gated kinds (breakout/additional), fuzzy-only content must NOT
  // resurrect a placeholder stub. roomHasContent here is evaluated on EXACT content only
  // (fuzzy not yet applied). A dropped room emits no warning. gs is ungated.
  const gatedKind = kind === "breakout" || kind === "additional";
  const droppedAsPlaceholder = gatedKind && !roomHasContent(room) && isPlaceholderRoomName(room.name);
  if (!droppedAsPlaceholder) {
    for (const [field, cand] of fuzzyCandidates) {
      if (exactReal.has(field)) continue;
      room[field] = cand.value;
      agg?.warnings.push({
        severity: "warn",
        code: "FIELD_LABEL_AUTOCORRECTED",
        message: `Read likely-misspelled room label '${cand.rawLabel}' as field '${field}'`,
        blockRef: { kind: "rooms", name: room.name },
        rawSnippet: cand.rawLabel,
      });
    }
  }

  return { room, nextLine: j };
}
```
  (Note: the old `let j = startLine;` and the entire old `while`/`return` are replaced. The header/`splitRoomHeader`/`buildEmptyRoom` lines above `let j` are unchanged.)

  3d. Thread `agg`. Change `parseV4RoomBlock`'s signature (rooms.ts:316-321) to add `agg?: ParseAggregator`:
```ts
function parseV4RoomBlock(
  lines: string[],
  startLine: number,
  headerText: string,
  kind: RoomKind,
  agg?: ParseAggregator,
): { room: RoomRowInternal; nextLine: number } {
```
  Change `parseV4Rooms`'s signature (rooms.ts:209) to `function parseV4Rooms(markdown: string, agg?: ParseAggregator): RoomRow[] {` and pass `agg` to all three `parseV4RoomBlock(lines, i, col0, "<kind>", agg)` calls (rooms.ts:236/254/272). Change the call in `parseRooms` (rooms.ts:61) from `parseV4Rooms(markdown)` to `parseV4Rooms(markdown, agg)`.

  3e. Update the header docstring (rooms.ts:1-24) to note v4 bare-label coverage is all 12 fields (setup, set/show/strike time, audio, video, lighting, scenic, power, digital signage, other, notes), so future maintainers do not strip the map's aliases.

- [ ] **Step 4: Run behavior tests + corpus** — `pnpm vitest run tests/parser/blocks/rooms.test.ts` → all green. Then `pnpm vitest run tests/parser` → whole-corpus rooms coverage unchanged (fixtures are correctly spelled — no fuzzy fires, no phantom rooms).

- [ ] **Step 5: Add the property test.** Add imports: `import { gatedVocabCorrect } from "@/lib/parser/typoGate";`, `import { V4_BARE_LABEL_VOCAB } from "@/lib/parser/blocks/rooms";`, `import { unambiguousTypos } from "../_typoGenerator";`. Append:
```ts
describe("parseRooms — v4 label gate corrects unseen typos (PR-D3)", () => {
  it("corrects unambiguous single-edit typos of every bare label back to that label", () => {
    const opts = { minLen: 5, tieAbort: true } as const;
    expect(V4_BARE_LABEL_VOCAB.length).toBe(12);
    for (const member of V4_BARE_LABEL_VOCAB) {
      for (const typo of unambiguousTypos(member, V4_BARE_LABEL_VOCAB, { minLen: 5 })) {
        const fix = gatedVocabCorrect(typo, V4_BARE_LABEL_VOCAB, opts);
        expect(fix?.corrected, `${typo} → ${member}`).toBe(true);
        expect(fix?.match, `${typo} → ${member}`).toBe(member);
      }
    }
  }, 30000); // generous timeout (PR-D1 CI-shard lesson; small vocab here, but be safe)
});
```
  Run `pnpm vitest run tests/parser/blocks/rooms.test.ts` → green.

- [ ] **Step 6: Anti-tautology mutation proofs (run, confirm RED, revert — do NOT commit).**
  - **Sentinel-aware exactReal is load-bearing:** temporarily change `if (v !== null && !shouldHideGenericOptional(v))` to `if (v !== null)`. Run → the **SENTINEL** test goes RED (`Setup | TBD` now claims setup and blocks the fuzzy). Revert.
  - **Phantom guard is load-bearing:** temporarily change `if (!droppedAsPlaceholder)` to `if (true)`. Run → the **PHANTOM** test goes RED (the placeholder room surfaces). Revert.
  - **Exact-real guard is load-bearing:** temporarily delete `if (exactReal.has(field)) continue;`. Run → the **exact-wins** test goes RED. Revert.
  Confirm `git diff lib/parser/blocks/rooms.ts` is empty after reverting all three.

- [ ] **Step 7: Commit**
```bash
git add lib/parser/blocks/rooms.ts tests/parser/blocks/rooms.test.ts
git commit -m "feat(parser): fuzzy field-label recovery in v4 room block"
```

---

## Task 2: Register `roomV4Label` + map-completeness guard

**Files:**
- Modify: `lib/parser/typoVocabRegistry.ts`
- Test: `tests/parser/typoVocabCollision.test.ts`

**Interfaces:**
- Consumes: `V4_BARE_LABEL_VOCAB` from `lib/parser/blocks/rooms.ts` (Task 1).

- [ ] **Step 1: Write the failing registration test** — append to `tests/parser/typoVocabCollision.test.ts`. Add `import { V4_BARE_LABEL_VOCAB } from "@/lib/parser/blocks/rooms";` at the top, then:
```ts
/**
 * PR-D3: the v4 room-label fuzzy fallback (gatedVocabCorrect over V4_BARE_LABELS) must have a
 * matching registry entry so the collision tripwire guards it. DERIVED from the exported vocab.
 */
describe("room v4-label vocab registration (PR-D3)", () => {
  it("registers a roomV4Label fuzzable vocab matching V4_BARE_LABEL_VOCAB", () => {
    const rm = TYPO_VOCABS.find((v) => v.id === "roomV4Label");
    expect(rm).toBeDefined();
    expect(rm!.klass).toBe("fuzzable");
    expect([...rm!.members].sort()).toEqual([...V4_BARE_LABEL_VOCAB].sort());
    expect(rm!.members).toContain("DIGITAL SIGNAGE");
    expect(rm!.members.every((m) => m.length >= 5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run tests/parser/typoVocabCollision.test.ts` → the registration test FAILS (`roomV4Label` undefined); the collision tripwire still PASSES.

- [ ] **Step 3: Add the registry entry** — in `lib/parser/typoVocabRegistry.ts`, add the import (after the PR-D2 `TRANSPORT_SCHEDULE_VOCAB` import):
```ts
import { V4_BARE_LABEL_VOCAB } from "@/lib/parser/blocks/rooms";
```
and the entry after the `transportScheduleLabel` row:
```ts
  // PR-D3: v4 room field-label fuzzy fallback (gatedVocabCorrect over V4_BARE_LABELS). Members
  // are the SAME derived vocab the gate fuzzes, so the tripwire guards exactly what ships.
  { id: "roomV4Label", klass: "fuzzable", minLen: 5, members: V4_BARE_LABEL_VOCAB },
```

- [ ] **Step 4: Run + mutation proof.** `pnpm vitest run tests/parser/typoVocabCollision.test.ts` → both the registration test and the collision tripwire PASS (the design workflow proved zero cross-vocab Damerau-1 collisions; `DIGITAL SIGNAGE` is identical to the event member → skipped). **If a REAL collision surfaces**, do NOT weaken the test — resolve it (exclude the genuinely-ambiguous member from the gate vocab + registration derivation with a documented carve-out). Then the mutation proof: temporarily add a Damerau-1 neighbor of a bare label (e.g. `"LIGHTING "` → `"LIGHTINGS"`) to the `sentinels` excluded entry → confirm the collision tripwire FAILS → revert.

- [ ] **Step 5: Commit**
```bash
git add lib/parser/typoVocabRegistry.ts tests/parser/typoVocabCollision.test.ts
git commit -m "test(parser): register roomV4Label fuzzable vocab + collision guard"
```

---

## Task 3: Full verification

- [ ] **Step 1:** `pnpm typecheck && pnpm eslint lib tests && pnpm prettier --check lib/parser/blocks/rooms.ts tests/parser/blocks/rooms.test.ts lib/parser/typoVocabRegistry.ts tests/parser/typoVocabCollision.test.ts` → clean.
- [ ] **Step 2:** `pnpm vitest run` (FULL). Expected: only the 3 known env-bound live-infra suites fail locally; `tests/parser`, `tests/help`, the collision meta-test green.
- [ ] **Step 3:** `git diff --name-only origin/main..HEAD` lists exactly the 4 code files + this plan — no `lib/messages/`, no `docs/superpowers/specs/`.

---

## Self-Review (checklist)

1. **Spec coverage:** §5.3 names rooms V4 bare labels; the design-stress workflow scoped it to `parseV4RoomBlock` + confirmed v4-only. Covered by Task 1.
2. **Four blockers baked in:** sentinel-aware `exactReal` (mirrors PR-D1; pinned by the SENTINEL test + mutation), phantom-room guard (pinned by PHANTOM + REAL-ROOM + mutation), agg threading (pinned by every warn assertion), exact-map completeness 15 keys (pinned by the alias test + the multiword-alias boundary).
3. **Drift:** `V4_BARE_LABEL_VOCAB` derived + exported once; registry imports; registration test re-derives.
4. **No new code:** `FIELD_LABEL_AUTOCORRECTED` reused; `rooms` is a RegionId; Task 3 Step 3 guards against catalog drift.
5. **Type consistency:** `RoomFieldKey` union; `V4_LABEL_TO_FIELD: Record<string, RoomFieldKey>`; `room[exactField] = presence(col1)` (all RoomRow fields are `string | null`); `gatedVocabCorrect(...).match` is uppercase, mapped back via `V4_LABEL_TO_FIELD[fix.match.toLowerCase()]`.

## Adversarial review (cross-model)

After implementation, send the whole diff to Codex (`codex exec`, read-only, high reasoning) as a REVIEWER-ONLY adversarial review. Iterate to APPROVE. Do-not-relitigate preempts (all design-workflow-verified): (a) **v4-only scope** — v2/v1 sub-parsers + v4-block detection out of scope, multiword-alias typos are P4 (the fuzzy vocab is the 12 bare labels); (b) sentinel-aware `exactReal` + phantom-room guard are required mirrors/guards, not optional; (c) `FIELD_LABEL_AUTOCORRECTED` reuse + `kind:"rooms"` (a RegionId) — no new code; (d) `V4_LABEL_TO_FIELD` 15 keys (12 bare + 3 aliases) is intentional — aliases stay exact-only; (e) `ROOM_GATE_EXCLUDE` is belt-and-suspenders parity with event (minLen:5 already covers all <5 do-not-fuzz tokens); (f) the collision check is clean (only `DIGITAL SIGNAGE` overlaps `eventFieldAlias`, identical → tripwire-skipped).

## Execution Handoff

Inline execution (TDD per task, commit per task), then whole-diff Codex review → push → real CI green → `gh pr merge --merge` → fast-forward local `main`.
