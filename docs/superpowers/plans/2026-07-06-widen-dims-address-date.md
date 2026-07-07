# Widen dims / address / date parser format tolerance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Additively widen three parser input-format tolerances (dates, hotel address, room dims) so unambiguous new formats are accepted, with every widening gated so it cannot swallow non-date / non-address / non-dims text.

**Architecture:** Pure parser + exporter-heuristic change. `normalizeDate` / `extractAllDates` / `inferShowYear` gain new date shapes; `STREET_ADDRESS_RE` / `STREET_ADDRESS_ZIP_RE` + the exporter's `shouldPreserveNewlines` gain Canadian address forms in lockstep; `rooms.ts` gains shared `DIMS_START` / `DIMS_FULL` matchers applied to all seven dims-token sites. No UI, no DB, no schema, no new §12.4 codes.

**Tech Stack:** TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-07-06-widen-dims-address-date.md`.

## Global Constraints

- **Behavior-preserving.** Every input accepted today is still accepted identically. The full existing parser suite + `tests/parser/exporterFixtures.test.ts` MUST stay green with NO fixture edits and no snapshot regen. (Spec Guiding principle.)
- **TDD per task.** Failing test → minimal implementation → passing test → commit. Never implementation before its test. (AGENTS.md invariant 1.)
- **Commit per task**, conventional-commits (`feat(parser):` / `test(parser):` / `feat(assets):` for the exporter). `--no-verify`. Every commit ends with the two trailers:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
  ```
- **Each widening is gated with an explicit STAYS-REJECTED list** (see spec §A/§B/§C). Derive test expectations from the spec's canonical case tables — do not hand-invent.
- **Meta-test inventory:** CREATES two focused structural pins (dims seven-site invariant; address postal parity). EXTENDS `_helpers.test.ts`, `dates.test.ts`, `rooms.test.ts`/`roomsHeaderHardening.test.ts`, `hotels.test.ts`, `exporterFixtures.test.ts`. Advisory-lock topology: N/A (no `pg_advisory*`, no DB).
- **Not UI work** (no file under `app/`, `components/`, CSS, tokens) — Opus/impeccable gate does not apply.

---

## File Structure

- `lib/parser/blocks/_helpers.ts` — `normalizeDate` (widen); `inferShowYear` (slash-first fallback). Add a shared long-form month map + ISO/long-form/dash matchers used by both `normalizeDate` and the free-scan.
- `lib/parser/blocks/dates.ts` — `extractAllDates` free-scan alternation gains ISO + long-form.
- `lib/parser/blocks/hotels.ts` — `STREET_ADDRESS_RE` suffix vocab; `STREET_ADDRESS_ZIP_RE` Canadian postal tail.
- `lib/drive/exportSheetToMarkdown.ts` — `shouldPreserveNewlines:80` Canadian postal tail (lockstep with hotels ZIP).
- `lib/parser/blocks/_dimsToken.ts` **(new)** — exported dims fragments + composed `DIMS_START` / `DIMS_FULL` / `DIMS_SEP`. Single source so the seven sites cannot drift.
- `lib/parser/blocks/rooms.ts` — the seven dims sites + cleanup consume `_dimsToken.ts`.
- Tests under `tests/parser/blocks/` and `tests/parser/`.

---

## Task 1 (A1): `normalizeDate` — ISO + long-form + cell-dash

**Files:**
- Modify: `lib/parser/blocks/_helpers.ts:86-116`
- Test: `tests/parser/blocks/_helpers.test.ts`

**Interfaces:**
- Produces: `normalizeDate(raw)` unchanged signature (`string → string|null`), now accepting ISO `YYYY-MM-DD`, long-form `Month D, YYYY` / `D Month YYYY` (full or 3-letter month), and cell-only dash `M-D-YYYY` (4-digit year). All routed through the SAME calendar-validity round-trip and returning the same ISO output.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/blocks/_helpers.test.ts (add a describe block)
import { normalizeDate } from "@/lib/parser/blocks/_helpers";

describe("normalizeDate widened shapes (rec-6d)", () => {
  it.each([
    ["2026-07-04", "2026-07-04"],       // ISO
    ["June 24, 2026", "2026-06-24"],    // long-form full month
    ["24 Jun 2026", "2026-06-24"],      // day-first 3-letter month
    ["6-24-2026", "2026-06-24"],        // cell-only dash, 4-digit year
    ["7/4/2026", "2026-07-04"],         // existing slash still works
    ["Wed 7/4/26", "2026-07-04"],       // existing dow + 2-digit still works
  ])("accepts %s -> %s", (raw, iso) => {
    expect(normalizeDate(raw)).toBe(iso);
  });

  it.each([
    ["6-24", null],           // dash, no year
    ["6-24-26", null],        // dash, 2-digit year (ambiguous) rejected
    ["June 24, 26", null],    // long-form 2-digit year rejected
    ["2026-02-30", null],     // calendar-invalid ISO
    ["Feb 30 2026", null],    // calendar-invalid long-form
    ["10:30", null],          // time
    ["2026", null],           // bare year
  ])("rejects %s", (raw) => {
    expect(normalizeDate(raw)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/blocks/_helpers.test.ts -t "widened shapes"`
Expected: FAIL (ISO/long-form/dash return null today).

- [ ] **Step 3: Write minimal implementation**

Refactor `normalizeDate` so all shapes converge on one `(year, month, day) → validated ISO` tail. Add near the top of `_helpers.ts` (module scope):

```ts
const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};
const MONTH_ALT = "January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept|Sep|October|Oct|November|Nov|December|Dec";
// Exported so extractAllDates (dates.ts) reuses the EXACT same self-delimiting shapes.
// SELF-DELIMITING: `\b` (or the anchored `^` in normalizeDate) prevents embedded hits
// like `12026-07-04` (5-digit-prefixed) or `2026-07-041` (trailing digit) — Codex plan R1.
export const ISO_DATE_RE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
export const LONGFORM_MDY_RE = new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i");
export const LONGFORM_DMY_RE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?,?\\s+(\\d{4})\\b`, "i");
```

Then rewrite the body to try each shape and funnel into one validator:

```ts
export function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const stripped = raw.replace(
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?,?\s*/i,
    "",
  );

  let month: number, day: number, year: number;

  const slash = stripped.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  const dash = stripped.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\b/); // 4-digit year ONLY
  const iso = stripped.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  const lfMDY = stripped.match(LONGFORM_MDY_RE);
  const lfDMY = stripped.match(LONGFORM_DMY_RE);

  if (iso) {
    year = parseInt(iso[1]!, 10); month = parseInt(iso[2]!, 10); day = parseInt(iso[3]!, 10);
  } else if (slash) {
    month = parseInt(slash[1]!, 10); day = parseInt(slash[2]!, 10);
    const ry = parseInt(slash[3]!, 10); year = ry < 100 ? 2000 + ry : ry;
  } else if (dash) {
    month = parseInt(dash[1]!, 10); day = parseInt(dash[2]!, 10); year = parseInt(dash[3]!, 10);
  } else if (lfMDY && lfMDY.index === 0) {
    month = MONTHS[lfMDY[1]!.toLowerCase()]!; day = parseInt(lfMDY[2]!, 10); year = parseInt(lfMDY[3]!, 10);
  } else if (lfDMY && lfDMY.index === 0) {
    day = parseInt(lfDMY[1]!, 10); month = MONTHS[lfDMY[2]!.toLowerCase()]!; year = parseInt(lfDMY[3]!, 10);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
```

Note the `^...` anchor on slash/dash/iso keeps the existing "leading token only" behavior; the long-form matches require `index === 0` after the day-of-week strip so a long-form date embedded mid-string in a CELL is not silently pulled (free-scan is Task 2's job).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/blocks/_helpers.test.ts -t "widened shapes"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/_helpers.ts tests/parser/blocks/_helpers.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(parser): normalizeDate accepts ISO, long-form month, and 4-digit dash dates

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

## Task 2 (A2): `extractAllDates` free-scan — ISO + long-form (NOT dash)

**Files:**
- Modify: `lib/parser/blocks/dates.ts:313-326`
- Test: `tests/parser/blocks/dates.test.ts`

**Interfaces:**
- Consumes: `ISO_DATE_RE`, `LONGFORM_MDY_RE`, `LONGFORM_DMY_RE` exported from `_helpers.ts` (Task 1).
- Produces: `extractAllDates(text)` free-scans slash + ISO + long-form (self-delimiting), routes each hit through `normalizeDate`. The dash form is NOT added to the free scan (ranges/scores like `12-0`, `7-4` must never become dates).

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/blocks/dates.test.ts
// extractAllDates is not exported; assert via its public consumer OR export it for test.
// If not exported, add: `export` to `function extractAllDates` and import it.
import { extractAllDates } from "@/lib/parser/blocks/dates";

describe("extractAllDates widened free-scan (rec-6d)", () => {
  it("picks up ISO and long-form dates", () => {
    const text = "Load in 2026-07-04, show June 24, 2026 and 7/5/2026.";
    expect(extractAllDates(text)).toEqual(
      expect.arrayContaining(["2026-07-04", "2026-06-24", "2026-07-05"]),
    );
  });
  it("does NOT turn ranges/scores/times/dash-dates into dates", () => {
    expect(extractAllDates("score 12-0, lead 7-4 at 10:30, memo 6-24-2026")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/blocks/dates.test.ts -t "widened free-scan"`
Expected: FAIL (ISO/long-form not picked up).

- [ ] **Step 3: Write minimal implementation**

Replace the single slash regex with a global alternation over slash | ISO | long-form (both orders), each routed through `normalizeDate` for calendar-validity. Because `normalizeDate` anchors with `^`, pass each matched substring (not the whole text):

```ts
import { normalizeDate, ISO_DATE_RE, LONGFORM_MDY_RE, LONGFORM_DMY_RE } from "./_helpers";

export function extractAllDates(text: string): string[] {
  const results: string[] = [];
  const slash =
    /(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?,?\s*)?\d{1,2}\/\d{1,2}\/\d{2,4}/gi;
  const patterns: RegExp[] = [
    slash,
    new RegExp(ISO_DATE_RE.source, "g"),
    new RegExp(LONGFORM_MDY_RE.source, "gi"),
    new RegExp(LONGFORM_DMY_RE.source, "gi"),
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const iso = normalizeDate(m[0].trim());
      if (iso !== null) results.push(iso);
    }
  }
  return results;
}
```

(If `extractAllDates` must stay unexported, keep it private and instead assert through its caller at `dates.ts:165`; prefer exporting for a direct, non-tautological test.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/blocks/dates.test.ts -t "widened free-scan"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/dates.ts tests/parser/blocks/dates.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(parser): extractAllDates free-scan picks up ISO and long-form dates

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

## Task 3 (A3): `inferShowYear` — STRICT slash-first fallback

**Files:**
- Modify: `lib/parser/blocks/_helpers.ts:123-128`
- Test: `tests/parser/blocks/_helpers.test.ts`

**Interfaces:**
- Produces: `inferShowYear(markdown)` unchanged signature. Runs the EXISTING slash scan first and returns its year if any slash date exists; ONLY when no slash date exists does it fall back to the first ISO/long-form date. NOT a combined alternation (prevents mixed-sheet year regression).

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/blocks/_helpers.test.ts
import { inferShowYear } from "@/lib/parser/blocks/_helpers";

describe("inferShowYear slash-first fallback (rec-6d)", () => {
  it("infers from ISO when NO slash date exists", () => {
    expect(inferShowYear("Header\n2027-03-01 setup\nmore")).toBe("2027");
  });
  it("infers from long-form when NO slash date exists", () => {
    expect(inferShowYear("Show March 1, 2027 onward")).toBe("2027");
  });
  it("mixed sheet: an ISO date BEFORE the first slash still yields the SLASH year", () => {
    // ISO 2027 appears first in document order; slash date is 2025.
    // Slash-first fallback MUST return 2025 (no regression to a combined alternation).
    expect(inferShowYear("plan 2027-01-01 ... actual 3/15/2025 ...")).toBe("2025");
  });
  it("no-slash sheet: earliest date in DOCUMENT ORDER wins across ISO/long-form", () => {
    // long-form 2028 appears BEFORE ISO 2029 — must return 2028, not ISO-priority 2029.
    expect(inferShowYear("kickoff March 1, 2028 then rev 2029-06-01")).toBe("2028");
  });
  it("does NOT match an embedded ISO inside a longer digit run", () => {
    // 12026-07-04 must NOT yield 2026 (self-delimiting \b guard).
    expect(inferShowYear("code 12026-07-04 only")).toBeNull();
  });
  it("returns null when no date at all", () => {
    expect(inferShowYear("no dates here")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/blocks/_helpers.test.ts -t "slash-first"`
Expected: FAIL (ISO-only returns null today; and a naive combined-alternation impl would fail the mixed-sheet case).

- [ ] **Step 3: Write minimal implementation**

```ts
export function inferShowYear(markdown: string): string | null {
  // Slash FIRST — unchanged behavior for any sheet with a slash date anywhere.
  const slash = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.exec(markdown);
  if (slash) {
    const iso = normalizeDate(slash[0]);
    if (iso) return iso.slice(0, 4);
  }
  // Fallback ONLY when no slash date exists: the EARLIEST date in DOCUMENT ORDER
  // across ISO + long-form (NOT ISO-priority — Codex plan R1: an ISO-first loop would
  // return the year of a later ISO date over an earlier long-form date on a no-slash sheet).
  let best: { index: number; iso: string } | null = null;
  for (const src of [ISO_DATE_RE, LONGFORM_MDY_RE, LONGFORM_DMY_RE]) {
    const re = new RegExp(src.source, src.flags.includes("g") ? src.flags : src.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(markdown)) !== null) {
      const iso = normalizeDate(m[0].trim());
      if (iso && (best === null || m.index < best.index)) best = { index: m.index, iso };
    }
  }
  return best ? best.iso.slice(0, 4) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/blocks/_helpers.test.ts -t "slash-first"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/_helpers.ts tests/parser/blocks/_helpers.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(parser): inferShowYear falls back to ISO/long-form only when no slash date exists

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

## Task 4 (B1): `STREET_ADDRESS_RE` — distinctive Canadian/broader suffixes

**Files:**
- Modify: `lib/parser/blocks/hotels.ts:258-259`
- Test: `tests/parser/blocks/hotels.test.ts`

**Interfaces:**
- Produces: `STREET_ADDRESS_RE` gains ONLY distinctive suffixes `Crescent|Cres|Commons|Close|Mews|Quay|Wharf|Gardens|Gdns|Esplanade|Promenade|Concourse`. Ordinary-noun suffixes (`Bay|Gate|Green|Common|Landing|Crossing|Grove|Alley|Bend`) are deliberately NOT added (would false-split place/brand names). Split path (`splitHotelNameAddress`) inherits this vocab; it is the ONLY split surface changed by this task.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/blocks/hotels.test.ts
// splitHotelNameAddress is not exported; assert via the public hotel parser OR export it.
import { splitHotelNameAddress } from "@/lib/parser/blocks/hotels"; // export if needed

describe("STREET_ADDRESS_RE distinctive suffixes (rec-6d)", () => {
  // NON-TAUTOLOGICAL (Codex plan R1): each input's ONLY street suffix is a NEWLY-added
  // one — no St/Ave/Blvd/etc. present — so a passing split PROVES the new suffix works,
  // not a pre-existing one. Address begins at the house number preceding the new suffix.
  it.each([
    ["The Fairmont Hotel 100 Harbour Crescent", "Crescent"],
    ["Dockside Inn 250 Marina Quay", "Quay"],
    ["Elmwood Lodge 5 Rosewood Gardens", "Gardens"],
    ["Harbourfront 12 Kings Esplanade", "Esplanade"],
  ])("splits on a NEW distinctive suffix only: %s", (cell, suffix) => {
    const { name, address } = splitHotelNameAddress(cell);
    expect(name).toBeTruthy();
    expect(name).not.toMatch(/\d/); // house number went to the address, not the name
    expect(address).toMatch(new RegExp(suffix));
  });

  it.each([
    "5 Bay Club Hotel",       // Bay dropped — must NOT split
    "10 Green Suites",        // Green dropped
    "The Landing Hotel 12",   // Landing dropped
  ])("does NOT split on a dropped ordinary noun: %s", (cell) => {
    const { name, address } = splitHotelNameAddress(cell);
    expect(name).toBe(cell.replace(/\s+/g, " ").trim());
    expect(address).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/blocks/hotels.test.ts -t "distinctive suffixes"`
Expected: FAIL (new suffixes not recognized).

- [ ] **Step 3: Write minimal implementation**

Append the distinctive suffixes to the closed alternation in `STREET_ADDRESS_RE` (do not touch the ordinary-noun set):

```ts
const STREET_ADDRESS_RE =
  /\s(\d{1,5})\s+(?:(?:[NSEW]{1,2}|North|South|East|West)\.?\s+)?(?:(?:\d{1,3}(?:st|nd|rd|th)|\p{L}[\p{L}.'-]*)\s+){0,4}(?:St|Street|Ave|Avenue|Av|Blvd|Boulevard|Dr|Drive|Rd|Road|Pl|Place|Ln|Lane|Way|Ct|Court|Pkwy|Parkway|Sq|Square|Ter|Terrace|Cir|Circle|Hwy|Highway|Pike|Row|Walk|Trl|Trail|Loop|Path|Plaza|Crescent|Cres|Commons|Close|Mews|Quay|Wharf|Gardens|Gdns|Esplanade|Promenade|Concourse)\b/iu;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/blocks/hotels.test.ts -t "distinctive suffixes"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/hotels.ts tests/parser/blocks/hotels.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(parser): STREET_ADDRESS_RE recognizes distinctive Canadian/broader street suffixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

## Task 5 (B2): Canadian postal tail — `STREET_ADDRESS_ZIP_RE` + exporter `:80` lockstep

**Files:**
- Modify: `lib/parser/blocks/hotels.ts:264-265`
- Modify: `lib/drive/exportSheetToMarkdown.ts:80`
- Test: `tests/parser/blocks/hotels.test.ts`, `tests/parser/exporterFixtures.test.ts` (or a focused exporter unit test)

**Interfaces:**
- Produces: both `STREET_ADDRESS_ZIP_RE` (discriminator) and the exporter's inline address regex at `:80` accept the SAME Canadian postal shape `[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d` in addition to the US `<ST> <5-digit ZIP>`. The postal tail affects ONLY the Hotel-Stays discriminator (`looksLikeStreetStart`) and the exporter flatten — it is NOT a split path (`splitHotelNameAddress` stays suffix-only, hotels.ts:266 comment invariant).

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/blocks/hotels.test.ts
import { looksLikeStreetStart } from "@/lib/parser/blocks/hotels"; // export if needed
describe("Canadian postal tail — discriminator (rec-6d)", () => {
  it("looksLikeStreetStart recognizes a Canadian suffixless street via postal tail", () => {
    expect(looksLikeStreetStart(" 100 Wellington, ON K1A 0A6")).toBe(true);
  });
  it("does NOT split on postal tail (split stays suffix-only)", () => {
    // A suffixless Canadian address stays glued — SAFE (same as suffixless US).
    const { address } = splitHotelNameAddress("Hotel 71 Toronto, ON K1A 0A6");
    expect(address).toBeNull();
  });
});
```

```ts
// tests/parser/exporterExtra.test.ts (new focused unit test for shouldPreserveNewlines via normalizeNewlines)
// If shouldPreserveNewlines/normalizeNewlines are not exported, export normalizeNewlines for test.
import { normalizeNewlines } from "@/lib/drive/exportSheetToMarkdown";
describe("Canadian postal tail — exporter flatten parity (rec-6d)", () => {
  it("FLATTENS a 2-line Canadian address cell (name+address on one line)", () => {
    const cell = "Fairmont Hotel\nOttawa, ON K1A 0A6";
    expect(normalizeNewlines(cell)).toBe("Fairmont Hotel Ottawa, ON K1A 0A6");
  });
  it("still flattens the US case", () => {
    const cell = "Marriott\nChicago, IL 60601";
    expect(normalizeNewlines(cell)).toBe("Marriott Chicago, IL 60601");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/blocks/hotels.test.ts -t "Canadian postal" tests/parser/exporterExtra.test.ts`
Expected: FAIL (Canadian postal not recognized; Canadian cell keeps `&#10;`).

- [ ] **Step 3: Write minimal implementation**

`hotels.ts` — add the Canadian postal alternative to the ZIP tail:

```ts
const STREET_ADDRESS_ZIP_RE =
  /\s(\d{1,5})\s+\p{L}[\p{L}\p{M}\s.'#/-]*?,\s*[A-Z]{2}\s+(?:\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)\b/u;
```

`exportSheetToMarkdown.ts:80` — mirror the same tail in the inline address recognizer:

```ts
if (lines[1] && /^[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\s+(?:\d{5}|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)/.test(lines[1])) return false;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/blocks/hotels.test.ts -t "Canadian postal" tests/parser/exporterExtra.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/hotels.ts lib/drive/exportSheetToMarkdown.ts tests/parser/blocks/hotels.test.ts tests/parser/exporterExtra.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(parser): recognize Canadian postal tail in address discriminator and exporter flatten

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

## Task 6 (C1): Shared dims fragments module + `DIMS_START` / `DIMS_FULL`

**Files:**
- Create: `lib/parser/blocks/_dimsToken.ts`
- Test: `tests/parser/blocks/dimsToken.test.ts`

**Interfaces:**
- Produces exported regex-source strings + compiled matchers (spec §C invariant 1, machine-verified):
  - `DIMS_SEP = "[x×]"`
  - `DIMS_OPERAND_UNIT = "\\d+\\s*(?:['′]|ft\\b)"`
  - `DIMS_OPERAND_BARE = "\\d{2,3}(?!\\d)"`
  - `DIMS_OPERAND = "(?:" + DIMS_OPERAND_UNIT + "|" + DIMS_OPERAND_BARE + ")"`
  - `DIMS_START_SRC = "(?:\\d+\\s*(?:['′]|ft\\b)\\s*[x×]|\\b\\d{2,3}\\s*[x×]\\s*\\d{2,3}\\b)"` (partial — "a dims token begins here")
  - `DIMS_FULL_SRC = "(\\b" + DIMS_OPERAND + "\\s*[x×]\\s*" + DIMS_OPERAND + "(?:\\s*[x×]\\s*" + DIMS_OPERAND + ")?)(?![0-9A-Za-z])"`
  - Helper builders `dimsStartRe(anchored: boolean)` → `new RegExp((anchored?"^\\s*":"")+DIMS_START_SRC, "i")`, and `dimsFullRe()` → `new RegExp(DIMS_FULL_SRC, "i")`.

- [ ] **Step 1: Write the failing test (the canonical case table from spec §C, verbatim)**

```ts
// tests/parser/blocks/dimsToken.test.ts
import { dimsFullRe, dimsStartRe, DIMS_SEP } from "@/lib/parser/blocks/_dimsToken";

describe("DIMS_FULL capture (spec §C canonical table)", () => {
  const admit: [string, string][] = [
    ["50' x 40'", "50' x 40'"], ["50'x40'", "50'x40'"], ["50′×45′", "50′×45′"],
    ["50ft x 40ft", "50ft x 40ft"], ["50 FT X 40'", "50 FT X 40'"], ["50 x 40", "50 x 40"],
    ["120x80", "120x80"], ["8' x 10'", "8' x 10'"], ["APPROXIMATELY 60' x 45'", "60' x 45'"],
    ["TOTAL 120 x 80", "120 x 80"], ["2026' x 40'", "2026' x 40'"], ["50' x 40' x 30'", "50' x 40' x 30'"],
    ["50 x 40 x 1200", "50 x 40"], // partial-capture-then-drop
  ];
  it.each(admit)("captures %s -> %s", (input, cap) => {
    expect(dimsFullRe().exec(input)?.[1]).toBe(cap);
  });
  const reject = ["5 x 8", "3x4", "2026 x 40", "1200x50", "Box40x2", "Room4x4",
    "120x80B", "SKU 40x20A", "50 x 1200", "Box", "Matrix", "50' x"];
  it.each(reject)("rejects %s", (input) => {
    expect(dimsFullRe().exec(input)).toBeNull();
  });
});

describe("DIMS_START (unanchored contains)", () => {
  const reject = ["5 x 8", "2026 x 40", "1200x50", "Box40x2", "120x80B", "SKU 40x20A", "50 x 1200"];
  it.each(reject)("rejects %s", (s) => expect(dimsStartRe(false).exec(s)).toBeNull());
  const admit = ["50' x 40'", "50 x 40", "120x80", "2026' x 40'", "50' x"];
  it.each(admit)("admits %s", (s) => expect(dimsStartRe(false).exec(s)).not.toBeNull());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/blocks/dimsToken.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Write minimal implementation** — create `lib/parser/blocks/_dimsToken.ts` with the exact fragments/builders in Interfaces above.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/blocks/dimsToken.test.ts`
Expected: PASS. (These are the exact machine-verified patterns from the spec.)

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/_dimsToken.ts tests/parser/blocks/dimsToken.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(parser): shared dims-token fragments (DIMS_START / DIMS_FULL / DIMS_SEP)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

## Task 7 (C2): Apply shared fragments to all seven `rooms.ts` sites + cleanup

**Files:**
- Modify: `lib/parser/blocks/rooms.ts` — sites 134, 167, 875, 934, 1214, 1270, 1486, cleanup 1497
- Test: `tests/parser/blocks/rooms.test.ts` (or `roomsHeaderHardening.test.ts`)

**Interfaces:**
- Consumes: `dimsStartRe`, `dimsFullRe`, `DIMS_SEP` from `_dimsToken.ts`.
- Site mapping (spec §C):
  - **Class A anchored:** `roomHeaderNameShape:134` = `dimsStartRe(true)` (anchored). `headerDayMarker:167` is the DOCUMENTED EXCEPTION — keep an inline `/^\s*\d+\s*(?:['′]|ft\b)?\s*[x×]\s*\d/i` (digit-ungated superset; adds `×`/`′`/`ft` only; preserves `5 x 8`/`60 x 45`).
  - **Class B unanchored:** GS evidence `:875`, BO evidence `:934` use `dimsStartRe(false)`; `dimStart:1486` keeps its `(?:TOTAL|APPROXIMATELY|A/B:)` prefix then `DIMS_START_SRC`.
  - **Class C full-capture:** DAY-header extract `:1214` and `harvestSameNameHeaderDims:1270` use `dimsFullRe()`.
  - **Cleanup `:1497`** uses `DIMS_SEP`: `.replace(new RegExp("\\s*" + DIMS_SEP + "\\s*$", "i"), "")`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/blocks/rooms.test.ts
import { roomHeaderNameShape, headerDayMarker, splitRoomHeader } from "@/lib/parser/blocks/rooms";

describe("dims widening across rooms sites (rec-6d)", () => {
  it("roomHeaderNameShape rejects a new-format dims-leading cell", () => {
    expect(roomHeaderNameShape("50′×45′ SALON")).toBe(false);
    expect(roomHeaderNameShape("50 x 40 SALON")).toBe(false);
  });
  it("headerDayMarker admits a ×/′ dims-only line after a DAY anchor AND keeps 5 x 8", () => {
    expect(headerDayMarker("MERIDIAN&#10;DAY 1&#10;60′ × 45′")).toBe(true);
    expect(headerDayMarker("MERIDIAN&#10;DAY 1&#10;5 x 8")).toBe(true); // preserved
  });
  it("splitRoomHeader extracts new-format dims and strips a dangling ×", () => {
    expect(splitRoomHeader("ADLER BALLROOM 75′ × 37′ ×", "breakout").dimensions).toBe("75′ × 37′");
    expect(splitRoomHeader("SALON 50ft x 40ft", "breakout").dimensions).toBe("50ft x 40ft");
  });
});
```

Plus the matched-pair test proving `:1214` and `:1270` both populate dims (spec §C testing) — assert via `parseRooms` on a fixture-shaped markdown where a `50′×45′` token rides a DAY header (→ `:1214`) and, in a second shape, only a same-name sibling header (→ `:1270`); both yield `room.dimensions === "50′×45′"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/blocks/rooms.test.ts -t "dims widening"`
Expected: FAIL (sites still on old `'\s*x`).

- [ ] **Step 3: Write minimal implementation** — replace each of the seven site regexes with the shared matcher per the mapping. Import from `./_dimsToken`. Leave `167` as the inline superset. Update cleanup `:1497` to `DIMS_SEP`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/blocks/rooms.test.ts -t "dims widening"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/rooms.ts tests/parser/blocks/rooms.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(parser): apply shared dims matchers to all seven rooms.ts sites + widen cleanup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

## Task 8 (C3): Seven-site dims invariant meta-test

**Files:**
- Create: `tests/parser/blocks/_metaDimsTokenSites.test.ts`

**Interfaces:**
- Structural pin (spec §C invariant 1 test clauses a–d): reads `rooms.ts` source and asserts:
  - (a) No re-inlined `'\s*x` / `\d+'\s*x` dims literal survives in `rooms.ts` EXCEPT the single allow-listed `headerDayMarker:167` superset (pinned by its exact expected pattern string).
  - (b) The dangling-separator cleanup line references `DIMS_SEP` (not a bare `x`).
  - (c) Behavioral: `dimsFullRe()`/`dimsStartRe()` reject `2026 x 40` and accept `2026' x 40'` (guards the 4-digit-bare hole).
  - (d) Behavioral matched-pair: a `50′×45′` token is captured identically by the DAY-header path (`:1214`) and the `:1270` fallback (assert via `parseRooms` on the two fixture shapes from Task 7).

- [ ] **Step 1: Write the failing test** — implement clauses a–d. For (a), read the file text, strip the known 167 line, and assert `!/\d\+?'\\?\\s\*x/`-style leftover matches remain. For (c)/(d) import the matchers + `parseRooms`.

- [ ] **Step 2: Run** — Expected: FAIL initially if any site was missed (fails-by-default). If Task 7 was complete, it should PASS; deliberately confirm by temporarily reverting one site to see it fail, then restore.

- [ ] **Step 3: (implementation is the meta-test itself)** — no source change; the test IS the deliverable.

- [ ] **Step 4: Run** — `pnpm vitest run tests/parser/blocks/_metaDimsTokenSites.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/parser/blocks/_metaDimsTokenSites.test.ts
git commit --no-verify -m "$(cat <<'EOF'
test(parser): seven-site dims-token invariant + matched-pair meta-test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

## Task 9: Behavior-preservation full-suite gate

**Files:** none (verification only).

- [ ] **Step 1:** Run the full parser suite + exporter fixtures:
  `pnpm vitest run tests/parser` and `pnpm vitest run tests/parser/exporterFixtures.test.ts`
- [ ] **Step 2:** Confirm ZERO fixture edits and no snapshot regen: `git status --porcelain fixtures/ && git diff --stat -- '*.snap'` → empty.
- [ ] **Step 3:** Run typecheck + lint + format (CI parity): `pnpm typecheck && pnpm lint && pnpm format:check`.
- [ ] **Step 4:** If anything fails, fix in the OWNING task's commit (amend only if unpushed; else a new `fix(parser):` commit). Do not edit fixtures to make a test pass — a fixture that would need editing is a behavior regression to investigate.
- [ ] **Step 5:** No commit if clean (verification task).

---

## Task 10: Adversarial review (cross-model, Codex)

- [ ] Fetch + rebase onto `origin/main`; verify `git diff --name-only origin/main..HEAD` shows only the intended parser/exporter/test files.
- [ ] Run the whole-diff Codex review (fresh-eyes, REVIEWER ONLY) via `codex exec` (companion wedges — use the `codex exec --sandbox read-only -o <verdict> "<lean prompt>" < /dev/null` fallback). Iterate to `VERDICT: APPROVE`, no round budget. Class-sweep every finding; ship a structural pin after 3+ same-vector rounds.
- [ ] Do NOT proceed to handoff until APPROVE.

---

## Task 11: Execution handoff

- [ ] Push; open PR (base `main`). Confirm real CI green (PR number, `mergeStateStatus == CLEAN`).
- [ ] `gh pr merge --merge`. Fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.
- [ ] Record memory + MEMORY.md pointer. Delete the resume cron.

---

## Self-Review notes (filled during writing-plans self-review)

- **Spec coverage:** §A → Tasks 1–3; §B → Tasks 4–5; §C → Tasks 6–8; behavior-preservation → Task 9. All spec sections mapped.
- **Anti-tautology:** dims tests assert against `dimsFullRe()`/`dimsStartRe()` directly (the data source), not a container; the matched-pair test asserts `room.dimensions`, derived from fixture-shaped input, not hardcoded. Address exporter test asserts `normalizeNewlines` output string, not the caller. Date expectations are the spec's canonical values.
- **Type consistency:** `dimsStartRe(anchored)`, `dimsFullRe()`, `DIMS_SEP` names are stable across Tasks 6–8. `ISO_DATE_RE`/`LONGFORM_MDY_RE`/`LONGFORM_DMY_RE` exported in Task 1, consumed in Tasks 2–3.
- **Export-for-test caveat:** Tasks 2/4/5 may require adding `export` to `extractAllDates` / `splitHotelNameAddress` / `looksLikeStreetStart` / `normalizeNewlines`. Prefer a real export over a tautological through-the-caller assertion; note it in the commit.
