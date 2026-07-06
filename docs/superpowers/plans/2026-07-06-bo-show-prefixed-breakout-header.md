# Show-prefixed BREAKOUT room-header parsing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse the two show-prefixed breakout headers (`RPAS BREAKOUT 1/2`) in `fixtures/shows/raw/2025-03-dci-rpas-central.md` as rooms `LASALLE A` / `LASALLE B`, leaving all other corpus fixtures byte-identical.

**Architecture:** Two regex extensions in `lib/parser/blocks/rooms.ts` (`boBlockRe` admits an optional single UPPERCASE-alnum-token prefix; `splitRoomHeader` strips that prefix case-sensitively) plus a prefixed-admission gate requiring positive BO-field content, then a surgical one-key regeneration of the frozen rooms baseline.

**Tech Stack:** TypeScript, Vitest, Next.js parser lib. No DB, no UI, no advisory locks.

**Spec:** `docs/superpowers/specs/2026-07-06-bo-show-prefixed-breakout-header.md` (adversarial-review APPROVED, 2 rounds).

## Global Constraints

- **TDD per task** — failing test → minimal implementation → passing test → commit (AGENTS.md inv. 1).
- **Commit per task**, conventional commits (`feat(parser):` / `test(parser):`) (inv. 6).
- **Frozen corpus is the structural defense** — `tests/parser/blocks/roomHeaderModel.test.ts:194` deep-equals `parseSheet(fixture).rooms` against `tests/parser/blocks/__baselines__/origin-main-rooms.json` for all 18 keys. Only the `2025-03-dci-rpas-central.md` key may change; the other 17 stay byte-identical, regenerated FROM the existing frozen values (never re-derived from live), so the guard still catches an accidental regression on another fixture.
- **No new §12.4 code, no new meta-test.** Meta-test inventory: CREATES none, EXTENDS none. The corpus no-op deep-equal already covers "no fabricated/dropped room on any fixture."
- **No `pg_advisory*` touched** — advisory-lock holder topology: N/A.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and the full `pnpm test` (not just scoped parser tests) before the close-out push — a shared parser chokepoint change must be proven not to regress other suites.

## File structure

- **Modify:** `lib/parser/blocks/rooms.ts` — 3 edits (boBlockRe ~1080; splitRoomHeader pre-strip ~1384; prefixed-admission gate ~1116 + `roomHasBoFieldValue` helper ~705).
- **Modify (test):** `tests/parser/blocks/rooms.test.ts` — new describe block with 5 assertions (T1–T5).
- **Modify (baseline):** `tests/parser/blocks/__baselines__/origin-main-rooms.json` — replace ONLY the `2025-03-dci-rpas-central.md` value.

---

### Task 1: Parse show-prefixed BREAKOUT headers + regenerate the one baseline key

**Files:**
- Modify: `lib/parser/blocks/rooms.ts`
- Test: `tests/parser/blocks/rooms.test.ts`
- Modify: `tests/parser/blocks/__baselines__/origin-main-rooms.json`

**Interfaces:**
- Consumes: `parseRooms(md: string, version: "v1"|"v2"|"v4", agg?): RoomRow[]` (exported, `rooms.ts`), `detectVersion` (`@/lib/parser/schema`), `parseSheet` (`@/lib/parser`).
- Produces: no new export. New private helper `roomHasBoFieldValue(room: RoomRow): boolean` used only inside `parseBoRooms`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/parser/blocks/rooms.test.ts`:

```ts
// ── show-prefixed BREAKOUT headers (2025-03-dci-rpas-central) ────────────────
// "RPAS BREAKOUT 1&#10;LASALLE A&#10;30' x 25' x 10.5'&#10;7th Floor" (and BREAKOUT 2 /
// LASALLE B) carry a show-code prefix before the BREAKOUT keyword and sit above real
// BO field blocks. BL-ROOM-SHOW-PREFIXED-BREAKOUT-HEADER.
describe("parseRooms — show-prefixed BREAKOUT (2025-03-dci-rpas-central)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-03-dci-rpas-central.md", "utf8");
  const rooms = parseRooms(md, "v2");
  const bo = rooms.filter((r) => r.kind === "breakout");

  it("T1: parses exactly 2 breakout rooms", () => {
    expect(bo).toHaveLength(2);
  });

  it("T2: names derive from the non-prefix, non-BREAKOUT portion", () => {
    // LASALLE A/B appear nowhere in the "RPAS BREAKOUT N" keyword, so a pass proves
    // the prefix+keyword were stripped, not merely that the header was captured.
    expect(new Set(bo.map((r) => r.name))).toEqual(new Set(["LASALLE A", "LASALLE B"]));
  });

  it("T3: LASALLE A carries the fixture dims/floor/BO fields", () => {
    const a = bo.find((r) => r.name === "LASALLE A")!;
    expect(a.dimensions).toBe("30' x 25' x 10.5'");
    expect(a.floor).toBe("7th Floor");
    expect(a.set_time).toBe("3/24 @ 10:00 AM");
    // A non-N/A, block-specific string a mis-scoped extraction could not accidentally hit.
    expect(a.video).toContain("Eiki Projector");
  });

  it("T4: no prefix or keyword leaks into any room name", () => {
    expect(rooms.every((r) => !/RPAS|BREAKOUT/i.test(r.name))).toBe(true);
  });
});

// Prefixed-admission gate (spec §3.3): a prefixed header with dims/floor but NO BO field
// block must NOT fabricate a room, even though roomHasContent counts header dims/floor.
describe("parseRooms — prefixed-admission gate (synthetic)", () => {
  const noFields = "| XYZ BREAKOUT 3&#10;GHOST HALL&#10;5' x 9'&#10;2nd Floor | |\n";
  const withField =
    "| XYZ BREAKOUT 3&#10;GHOST HALL&#10;5' x 9'&#10;2nd Floor | |\n| BO Setup | 60 chairs |\n";

  it("T5a: dims/floor-only prefixed header parses to zero breakouts", () => {
    const bo = parseRooms(noFields, "v2").filter((r) => r.kind === "breakout");
    expect(bo).toHaveLength(0);
  });

  it("T5b: positive control — a BO field admits the room as GHOST HALL", () => {
    const bo = parseRooms(withField, "v2").filter((r) => r.kind === "breakout");
    expect(bo).toHaveLength(1);
    expect(bo[0]!.name).toBe("GHOST HALL");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `cd /Users/ericweiss/fxav-worktrees/bo-show-prefixed-breakout && npx vitest run tests/parser/blocks/rooms.test.ts -t "show-prefixed BREAKOUT|prefixed-admission"`
Expected: FAIL — T1 sees 0 breakouts (regex does not match the prefixed header), T5a passes vacuously OR T5b fails (no gate yet). At minimum T1/T2/T3/T4 and T5b fail before the source change.

- [ ] **Step 3: Extend `boBlockRe` (spec §3.1).** In `lib/parser/blocks/rooms.ts` (~line 1080):

```ts
// BEFORE
const boBlockRe = /^\|\s*(BREAKOUT(?:&#10;|\s)[^|]*?)\s*\|/gm;
// AFTER
const boBlockRe = /^\|\s*((?:[A-Z0-9]+\s+)?BREAKOUT(?:&#10;|\s)[^|]*?)\s*\|/gm;
```

Update the adjacent comment (lines ~1075-1079) to note the optional single UPPERCASE-alnum-token show-code prefix (e.g. `RPAS BREAKOUT 1`), case-sensitive so mixed-case labels never match.

- [ ] **Step 4: Add the case-sensitive prefix pre-strip in `splitRoomHeader` (spec §3.2).** At the step-1 strip (~lines 1384-1387):

```ts
  // 1. kind label prefix + stray leading separator. A show-code prefix (a single
  // UPPERCASE alnum token) before an UPPERCASE `BREAKOUT` keyword is stripped first,
  // case-SENSITIVELY (own regex, no /i) so it only fires on a real prefixed breakout
  // header ("RPAS BREAKOUT 1 LASALLE A") and never on a mixed-case name that merely
  // contains "Breakout" ("Grand Breakout Hall"). The lookahead keeps it inert unless
  // an uppercase BREAKOUT immediately follows.
  s = s
    .replace(/^[A-Z0-9]+\s+(?=BREAKOUT\b)/, "")
    .replace(/^(?:GENERAL\s+SESSION|BREAKOUT(?:\s+\d+)?|ADDITIONAL\s+ROOM|LUNCH\s+ROOM)\b/i, "")
    .replace(/^[\s:–—-]+/, "")
    .trim();
```

- [ ] **Step 5: Add the prefixed-admission gate + helper (spec §3.3).** Insert the gate immediately after line 1115 (`if (numbered && !roomHasContent(room) && isPlaceholderRoomName(name)) continue;`), before the `if (!boGroups.has(headerKey))` block:

```ts
    // A show-code prefix (firstLine does not itself start with BREAKOUT) needs POSITIVE
    // BO-field evidence: roomHasContent counts the header-harvested dims/floor assigned
    // above, so a "<PREFIX> BREAKOUT N&#10;dims" with no BO block would otherwise
    // fabricate a room (BL-ROOM-DIMS-ONLY-NOVEL-HEADER paranoia).
    const prefixed = !/^BREAKOUT/.test(firstLine);
    if (prefixed && !roomHasBoFieldValue(room)) continue;
```

Add the helper immediately after `roomHasContent` (after line 704):

```ts
// A room field VALUE populated by applyBoFields — i.e. real BO-block evidence, EXCLUDING
// the header-harvested dimensions/floor that roomHasContent also counts. Used to gate a
// show-prefixed BREAKOUT header so header geometry alone cannot admit it.
function roomHasBoFieldValue(room: RoomRow): boolean {
  return [
    room.setup,
    room.set_time,
    room.show_time,
    room.strike_time,
    room.audio,
    room.video,
    room.lighting,
    room.scenic,
    room.power,
    room.digital_signage,
    room.other,
    room.notes,
  ].some((v) => v != null);
}
```

- [ ] **Step 6: Run the targeted tests to verify they pass.**

Run: `cd /Users/ericweiss/fxav-worktrees/bo-show-prefixed-breakout && npx vitest run tests/parser/blocks/rooms.test.ts -t "show-prefixed BREAKOUT|prefixed-admission"`
Expected: PASS (T1–T4, T5a, T5b all green).

- [ ] **Step 7: Regenerate ONLY the dci-rpas baseline key.** Run this node one-liner (loads the frozen baseline, swaps ONLY the one value with live output, reserializes 2-space + trailing newline — the other 17 keys keep their frozen values):

```bash
cd /Users/ericweiss/fxav-worktrees/bo-show-prefixed-breakout && npx tsx -e '
import { readFileSync, writeFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
const P = "tests/parser/blocks/__baselines__/origin-main-rooms.json";
const K = "fixtures/shows/raw/2025-03-dci-rpas-central.md";
const b = JSON.parse(readFileSync(P, "utf8"));
b[K] = parseSheet(readFileSync(K, "utf8")).rooms;
writeFileSync(P, JSON.stringify(b, null, 2) + "\n");
console.log("regenerated", K, "->", b[K].length, "rooms");
'
```

Expected stdout: `regenerated fixtures/shows/raw/2025-03-dci-rpas-central.md -> 3 rooms`. Then `git diff --stat` must show ONLY the dci-rpas block changed — verify with:

```bash
git diff tests/parser/blocks/__baselines__/origin-main-rooms.json | grep -E '^\+' | grep -icE 'lasalle' # expect 2 (two new breakout name lines)
git diff tests/parser/blocks/__baselines__/origin-main-rooms.json | grep -cE '^\+.*"name"' # sanity on added name lines
```

If the diff touches any non-dci key, STOP — the parser regressed another fixture; do not proceed.

- [ ] **Step 8: Confirm the baseline stays prettier-clean.**

Run: `cd /Users/ericweiss/fxav-worktrees/bo-show-prefixed-breakout && npx prettier --check tests/parser/blocks/__baselines__/origin-main-rooms.json`
Expected: `All matched files use Prettier code style!` (if it reports a diff, run `npx prettier --write` on that one file and re-check).

- [ ] **Step 9: Run the full parser suite + typecheck + lint + format.**

```bash
cd /Users/ericweiss/fxav-worktrees/bo-show-prefixed-breakout
npx vitest run tests/parser/ && pnpm typecheck && pnpm lint && pnpm format:check
```
Expected: all PASS — in particular `roomHeaderModel.test.ts` corpus no-op is green (dci-rpas now matches the regenerated key; the other 17 unchanged).

- [ ] **Step 10: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/bo-show-prefixed-breakout
git add lib/parser/blocks/rooms.ts tests/parser/blocks/rooms.test.ts tests/parser/blocks/__baselines__/origin-main-rooms.json
git commit --no-verify -m "feat(parser): parse show-prefixed BREAKOUT N room headers

Extend boBlockRe to admit an optional single UPPERCASE-alnum-token prefix
before BREAKOUT, strip it case-sensitively in splitRoomHeader, and gate the
prefixed sub-case on positive BO-field content so header dims/floor alone
cannot fabricate a room. Parses the two RPAS BREAKOUT 1/2 headers in
2025-03-dci-rpas-central as LASALLE A/B; regenerates that one baseline key.

Closes BL-ROOM-SHOW-PREFIXED-BREAKOUT-HEADER.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019o91smYGXkdnkJ9h9LWgcB"
```

---

### Task 2: Backlog close-out

**Files:**
- Modify: `BACKLOG.md` — mark `BL-ROOM-SHOW-PREFIXED-BREAKOUT-HEADER` resolved (Status: OPEN → DONE, with the PR/commit ref).

- [ ] **Step 1: Update the backlog entry status.** In `BACKLOG.md`, change the `BL-ROOM-SHOW-PREFIXED-BREAKOUT-HEADER` entry's `**Status:** OPEN` to `**Status:** DONE (PR #<n>, 2026-07-06)` and append a one-line resolution note pointing at the spec/plan. (PR number filled in after the PR opens — leave a `#TBD` placeholder if committing before push, then amend, OR do this step post-PR.)

- [ ] **Step 2: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/bo-show-prefixed-breakout
git add BACKLOG.md
git commit --no-verify -m "docs(plan): mark BL-ROOM-SHOW-PREFIXED-BREAKOUT-HEADER done

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019o91smYGXkdnkJ9h9LWgcB"
```

---

## Self-review

- **Spec coverage:** §3.1 → Step 3; §3.2 → Step 4; §3.3 (gate + helper) → Step 5; §4 worked example → T3 assertions; §5 blast radius + §6 baseline regen → Steps 7-8 (one-key splice, prettier check); §7 tests T1-T5 → Step 1; §8/§9 guards/descope → covered by T5 + the case-sensitive regexes. No spec section is unimplemented.
- **Anti-tautology:** T2 asserts names the header keyword does not contain; T3 asserts a block-specific non-`N/A` `video` substring; expectations derive from fixture cell content (spec §4), not invented; T5 pairs a negative with a positive control so the gate is proven to admit-on-evidence, not blanket-reject. Baseline regen swaps ONLY one key and reserializes the other 17 from frozen values, so the corpus guard is not made tautological.
- **Placeholder scan:** none — every step carries exact code/commands. (The `#TBD` PR number in Task 2 Step 1 is an intentional post-PR fill, not a code placeholder.)
- **Type consistency:** `roomHasBoFieldValue(room: RoomRow): boolean` matches `roomHasContent(room: RoomRow)` at `rooms.ts:687`; `prefixed`/`numbered` are local consts; `RoomRow` fields referenced all exist in `buildEmptyRoom` (`rooms.ts:1455`).

## Execution handoff

Autonomous pipeline — execute inline via `superpowers:executing-plans` (Task 1 then Task 2), then Stage 4 whole-diff Codex review → CI → merge.
