# Known-section-header source walker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every block parser's section-opener recognition through an exported, introspectable `SECTION_HEADER_TOKENS` const built via one shared matcher factory, then add a filesystem-walked structural meta-test that fails-by-default for any new parser and asserts every parser-recognized opener token is registered.

**Architecture:** A new `lib/parser/blocks/_sectionHeaderMatch.ts` factory is the sole constructor of the *simple* presence/equality section-opener matchers. Each block parser that opens a section exports `SECTION_HEADER_TOKENS` and derives its matcher from that const (behavior-preserving); complex capture-extract parsers (rooms, and the inline-capture matchers of hotels/agenda/transport) export tokens for registry coverage but keep their raw matchers behind a documented `RAW_HEADER_REGEX_ALLOWLIST` / `IMPORT_LINK_EXEMPT`. A new walker meta-test enumerates `lib/parser/blocks/*.ts` + `lib/parser/index.ts`, forcing each to export tokens (registry-checked) or be allowlisted. Behavior preservation is pinned by the existing parser test suite (targeted fidelity assertions over the 7 `exporter-xlsx` fixtures + `unknownSection.test.ts` corpus + every parser unit test), which must stay green with no test edits.

**Tech Stack:** TypeScript, Vitest, Node.js `fs` (filesystem walk in the meta-test).

## Global Constraints

- **This is a behavior-preserving REFACTOR** (spec §7): parser OUTPUT must not change. Any diff in parsed output is a bug, not an accepted change. No snapshot regeneration, no edits to existing parser-test assertions.
- **TDD per task** (AGENTS.md invariant 1): failing test → minimal implementation → passing test → commit. Never implementation before its test.
- **Commit per task**, conventional-commits style `<type>(scope): summary` (invariant 6). Scope `parser`. Use `--no-verify` (shared lint-staged hook belongs to the main checkout).
- Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
  ```
- **`normalizeHeader`** (`lib/parser/knownSections.ts:24`) = `raw.replace(/\s+/g," ").trim().toUpperCase()`. All token comparisons use it so casing/spacing behavior is unchanged.
- **No new §12.4 error code** — this touches no user-visible messaging.
- **Advisory lock: N/A** (spec §11) — pure parser + test.
- **Meta-test inventory** (spec §10): CREATES `tests/parser/_metaKnownSectionsWalker.test.ts`; RETAINS `tests/parser/_metaKnownSectionsRegistry.test.ts` as a redundant deletion guard.
- Verify no behavior change after every parser task by running that parser's unit tests AND `tests/parser/exporterFixtures.test.ts`.

## Parser classification (locked from spec §3–§5 + pre-draft code verification)

| File | Class | Tokens / disposition |
|---|---|---|
| `crew.ts` | token-exporter (factory) | `["CREW","TECH"]` — bare pipe regexes `crew.ts:29-30`, case-SENSITIVE, no leading ws |
| `dates.ts` | token-exporter (factory) | `["DATES"]` — equality `.toUpperCase()==="DATES"` `dates.ts:84` |
| `venue.ts` | token-exporter (factory) | `["VENUE"]` — equality `col0Upper==="VENUE"` `venue.ts:168` (VENUES is registry-only, NOT exported) |
| `client.ts` | token-exporter (factory) | `["CLIENT"]` — equality `label==="CLIENT"` `client.ts:93` |
| `dress.ts` | token-exporter (factory) | `["DRESS"]` — equality `normalizeHeader(...)==="DRESS"` `dress.ts:24` |
| `event.ts` | token-exporter (factory, whole-cell alternation) | `["EVENT DETAILS","DETAILS","DETAILS/ROOM DIAGRAM","GS DETAILS","GS DETAILS (FOR BOTH)"]` — `EVENT_DETAILS_HEADER_RE` `event.ts:40`, `/im` |
| `hotels.ts` | token-exporter (factory for structured + allowlisted inline capture) | `["HOTEL","HOTEL RESERVATION","HOTEL RESERVATIONS","HOTEL STAY","HOTEL STAYS"]` — structured `/^\|\s*HOTEL\s*\|/m` `:313`; inline capture `/^\|\s*Hotel\s*Reservations?\s*\|([^|]+)/im` `:507`, `/^\|\s*Hotel\s*Stays?\s*\|([^|]+)/im` `:519`; D1 detector `:68` |
| `transport.ts` | token-exporter (factory for col0 identity + allowlisted multi-column) | `["TRANSPORTATION","DRIVER"]` — multi-col `:172`; v1 `/^\|\s*Driver\s*\|.../im` `:446` |
| `index.ts` (agenda) | token-exporter (allowlisted capture regex) | `["AGENDA","AGENDA LINK"]` — capture regex `index.ts:339` |
| `rooms.ts` | token-exporter, `IMPORT_LINK_EXEMPT` | `["GENERAL SESSION","BREAKOUT","ADDITIONAL ROOM","LUNCH ROOM"]` — capture-extract/shape matchers (`:621/639/657/1104/1163/1296/1373`), all `RAW_HEADER_REGEX_ALLOWLIST`ed |
| `ops.ts` | metadata-only | `METADATA_FIELD_TOKENS=["COI","PROPOSAL","PO","INVOICE","INVOICE NOTES"]`; NO section tokens; whole-cell `/^\s*COI\s*$/i` matchers (not col0-header shaped) |
| `contacts.ts` | `NO_SECTION_OPENER` | scalar contact-label detection, `cells[1]`-only (spec §3, R1 f1) |
| `gear.ts` | `NO_SECTION_OPENER` | reuses room families already owned by `rooms.ts` (not a distinct opener) |
| `_helpers.ts`, `agenda.ts`, `agendaWarnings.ts`, `scheduleBookends.ts`, `scheduleTimes.ts`, `travelFlights.ts`, `travelFlightWarnings.ts` | `NO_SECTION_OPENER` | no section-opener col0 detection |

**Backstop cross-section references (from complete plan-time preflight).** A file may be `NO_SECTION_OPENER` (opens nothing) yet still REFERENCE another section's registered banner as a boundary/classification/sentinel — these are enumerated in the walker's `RAW_HEADER_REGEX_ALLOWLIST` / `EQUALITY_LITERAL_ALLOWLIST` (Task 14) so the registry-keyed backstop stays high-signal: `event.ts` (GENERAL SESSION/BREAKOUT room-block boundary, `:174`), `gear.ts` (room-family classification, `:97-99`), `scheduleTimes.ts` (DATES boundary, `:114/:122`), `index.ts` (CLIENT title sentinel + agenda capture regex). Sub-labels (START/NAME/PHONE/SET/TRAVEL/SHOW DAY/FINISH/TRT), column headers (FLIGHT DETAILS/MAIN/SECONDARY/DATE/TIME), generic char-class matchers (crew `BLOCK_LABEL_RE`, index `TABLE_ROW_RE`), and terminator arrays (crew `TERMINATING_LABELS`) are NOT registered section openers (or not equality/regex-adjacent) and never fire.

---

### Task 1: Shared matcher factory `_sectionHeaderMatch.ts`

**Files:**
- Create: `lib/parser/blocks/_sectionHeaderMatch.ts`
- Test: `tests/parser/sectionHeaderMatch.test.ts`

**Interfaces:**
- Produces:
  - `buildCol0HeaderRe(tokens: readonly string[], opts?: Col0HeaderOpts): RegExp` — whole-cell pipe-anchored matcher (`^ | TOKEN |`).
  - `buildCol0HeaderAltRe(tokens: readonly string[], opts?: Col0HeaderOpts): RegExp` — token may carry a trailing non-pipe suffix before the closing pipe.
  - `matchesSectionHeader(col0: string, tokens: readonly string[]): boolean` — equality on `normalizeHeader`.
  - `interface Col0HeaderOpts { caseInsensitive?: boolean; allowLeadingWs?: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/sectionHeaderMatch.test.ts
import { describe, it, expect } from "vitest";
import {
  buildCol0HeaderRe,
  buildCol0HeaderAltRe,
  matchesSectionHeader,
} from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("buildCol0HeaderRe", () => {
  it("reproduces the case-sensitive bare crew matcher `/^\\|\\s*CREW\\s*\\|/m`", () => {
    const re = buildCol0HeaderRe(["CREW"]);
    expect(re.test("| CREW | NAME |")).toBe(true);
    expect(re.test("|CREW|")).toBe(true);
    expect(re.test("| crew | NAME |")).toBe(false); // case-sensitive by default
    expect(re.test("| CREW MEMBER | x |")).toBe(false); // whole-cell, not prefix
    // multiline: matches a header on a non-first line
    expect(re.test("intro\n| CREW | NAME |")).toBe(true);
  });

  it("orders alternation longest-first so a short token cannot shadow a longer one", () => {
    const re = buildCol0HeaderRe(["GS DETAILS", "GS DETAILS (FOR BOTH)"], { caseInsensitive: true });
    expect(re.test("| GS DETAILS (FOR BOTH) |")).toBe(true);
    expect(re.test("| GS DETAILS |")).toBe(true);
  });

  it("collapses literal spaces to \\s+ (tolerates multi-space headers) and escapes regex metachars", () => {
    const re = buildCol0HeaderRe(["EVENT DETAILS", "DETAILS/ROOM DIAGRAM"], { caseInsensitive: true });
    expect(re.test("| EVENT  DETAILS |")).toBe(true); // double space
    expect(re.test("| Details/Room Diagram |")).toBe(true); // case-insensitive + slash literal
  });

  it("caseInsensitive + allowLeadingWs opts widen the match", () => {
    const re = buildCol0HeaderRe(["HOTEL"], { caseInsensitive: true, allowLeadingWs: true });
    expect(re.test("   | hotel | x |")).toBe(true);
  });
});

describe("buildCol0HeaderAltRe", () => {
  it("admits a trailing suffix after the token before the closing pipe", () => {
    const re = buildCol0HeaderAltRe(["AGENDA LINK", "AGENDA"], { caseInsensitive: true });
    expect(re.test("| AGENDA LINK - Day 1 | https://x |")).toBe(true);
    expect(re.test("| AGENDA | https://x |")).toBe(true);
  });
});

describe("matchesSectionHeader", () => {
  it("equality on normalizeHeader (upper, single-spaced, trimmed)", () => {
    expect(matchesSectionHeader("  venue ", ["VENUE"])).toBe(true);
    expect(matchesSectionHeader("VENUES", ["VENUE"])).toBe(false);
    expect(matchesSectionHeader("Event  Details", ["EVENT DETAILS"])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/sectionHeaderMatch.test.ts`
Expected: FAIL — cannot resolve `@/lib/parser/blocks/_sectionHeaderMatch`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/parser/blocks/_sectionHeaderMatch.ts
import { normalizeHeader } from "@/lib/parser/knownSections";

export interface Col0HeaderOpts {
  /** Match case-insensitively (adds the `i` flag). Default false (case-sensitive). */
  caseInsensitive?: boolean;
  /** Allow leading whitespace before the opening pipe. Default false. */
  allowLeadingWs?: boolean;
}

/** Escape regex metacharacters, then treat a literal space as `\s+` so multi-space
 *  headers still match (mirrors the historical `EVENT\s+DETAILS` shapes). */
function tokenToPattern(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
}

function altGroup(tokens: readonly string[]): string {
  // longest-first so a prefix token (`GS DETAILS`) cannot shadow a longer one
  // (`GS DETAILS (FOR BOTH)`) inside the alternation.
  return [...tokens]
    .sort((a, b) => b.length - a.length)
    .map(tokenToPattern)
    .join("|");
}

function flags(opts: Col0HeaderOpts): string {
  return opts.caseInsensitive ? "im" : "m";
}

/** Whole-cell pipe-anchored col0 matcher: `^ [ws] | [ws] TOKEN [ws] |`. */
export function buildCol0HeaderRe(tokens: readonly string[], opts: Col0HeaderOpts = {}): RegExp {
  const lead = opts.allowLeadingWs ? "\\s*" : "";
  return new RegExp(`^${lead}\\|\\s*(?:${altGroup(tokens)})\\s*\\|`, flags(opts));
}

/** Alternation matcher allowing a trailing non-pipe suffix after the token
 *  before the closing pipe (agenda `AGENDA LINK - X`, event `DETAILS/ROOM DIAGRAM`). */
export function buildCol0HeaderAltRe(tokens: readonly string[], opts: Col0HeaderOpts = {}): RegExp {
  const lead = opts.allowLeadingWs ? "\\s*" : "";
  return new RegExp(`^${lead}\\|\\s*(?:${altGroup(tokens)})[^|]*\\|`, flags(opts));
}

/** True iff `normalizeHeader(col0)` equals one of the tokens (each also normalized). */
export function matchesSectionHeader(col0: string, tokens: readonly string[]): boolean {
  const n = normalizeHeader(col0);
  return tokens.some((t) => normalizeHeader(t) === n);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/sectionHeaderMatch.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/_sectionHeaderMatch.ts tests/parser/sectionHeaderMatch.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(parser): shared section-opener matcher factory (_sectionHeaderMatch)

buildCol0HeaderRe / buildCol0HeaderAltRe / matchesSectionHeader — the sole
constructor of the simple presence/equality section-opener matchers. Space→\s+
+ metachar escaping + longest-first alternation + per-matcher flags reproduce
the existing per-parser regex shapes (behavior-preserving).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 2: Registry additions + hand-maintained pin update

**Files:**
- Modify: `lib/parser/knownSections.ts` (add `DRIVER`, `DETAILS/ROOM DIAGRAM`, `GS DETAILS (FOR BOTH)` to `KNOWN_SECTION_HEADERS`)
- Modify: `tests/parser/_metaKnownSectionsRegistry.test.ts` (add the three to `REQUIRED_HEADERS`)

**Interfaces:**
- Produces: three new exact-match registry entries. None added to `PREFIX_SECTION_FAMILIES` (spec §5).

- [ ] **Step 1: Write the failing test** — extend the retained pin.

```ts
// in tests/parser/_metaKnownSectionsRegistry.test.ts REQUIRED_HEADERS list, add:
  "DRIVER",
  "DETAILS/ROOM DIAGRAM",
  "GS DETAILS (FOR BOTH)",
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/_metaKnownSectionsRegistry.test.ts`
Expected: FAIL — the three tokens are not yet in `KNOWN_SECTION_HEADERS`.

- [ ] **Step 3: Add the registry entries**

In `lib/parser/knownSections.ts`, inside the `KNOWN_SECTION_HEADERS` set literal (after `"GS DETAILS",` at line 45 and near `"TRANSPORTATION",`), add:
```ts
  "DRIVER",
  "DETAILS/ROOM DIAGRAM",
  "GS DETAILS (FOR BOTH)",
```
Do NOT add any to `PREFIX_SECTION_FAMILIES` (they are exact-match section openers).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/parser/_metaKnownSectionsRegistry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/knownSections.ts tests/parser/_metaKnownSectionsRegistry.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(parser): register DRIVER, DETAILS/ROOM DIAGRAM, GS DETAILS (FOR BOTH) section openers

Spec §5 — currently-recognized-but-unregistered section-opener tokens
(transport v1 Driver record table; event-details block variants). Exact-match
only (not PREFIX_SECTION_FAMILIES). Retained pin extended.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 3: `crew.ts` — factory-derived CREW/TECH matchers

**Files:**
- Modify: `lib/parser/blocks/crew.ts:29-30`
- Test: `tests/parser/crewSectionTokens.test.ts`

**Interfaces:**
- Consumes: `buildCol0HeaderRe` (Task 1).
- Produces: `export const SECTION_HEADER_TOKENS = ["CREW", "TECH"] as const;`

- [ ] **Step 1: Write the failing test** (token export + derived-matcher equivalence).

```ts
// tests/parser/crewSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/crew";
import { buildCol0HeaderRe } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("crew SECTION_HEADER_TOKENS", () => {
  it("exports exactly CREW and TECH", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(["CREW", "TECH"]);
  });
  it("factory-derived matchers reproduce the original accepted set", () => {
    const crewRe = buildCol0HeaderRe(["CREW"]);
    const techRe = buildCol0HeaderRe(["TECH"]);
    expect(crewRe.test("| CREW | NAME |")).toBe(true);
    expect(techRe.test("| TECH | NAME |")).toBe(true);
    expect(crewRe.test("| crew |")).toBe(false); // case-sensitive preserved
    expect(crewRe.test("| CREWS |")).toBe(false); // whole-cell preserved
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/crewSectionTokens.test.ts`
Expected: FAIL — `SECTION_HEADER_TOKENS` not exported.

- [ ] **Step 3: Implement** — replace the two literal regexes with token-derived ones.

In `crew.ts`, add the import (with the other `blocks/` imports near line 17) and replace lines 29-30:
```ts
import { buildCol0HeaderRe } from "./_sectionHeaderMatch";

export const SECTION_HEADER_TOKENS = ["CREW", "TECH"] as const;

const CREW_HEADER_RE = buildCol0HeaderRe(["CREW"]);
const TECH_HEADER_RE = buildCol0HeaderRe(["TECH"]);
```

- [ ] **Step 4: Run to verify it passes + no behavior change**

Run: `pnpm vitest run tests/parser/crewSectionTokens.test.ts tests/parser/exporterFixtures.test.ts` and any `tests/parser/crew*.test.ts`
Expected: PASS, no fixture assertion changes.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/crew.ts tests/parser/crewSectionTokens.test.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(parser): crew exports SECTION_HEADER_TOKENS + factory-built CREW/TECH matchers

Behavior-preserving: buildCol0HeaderRe reproduces the case-sensitive whole-cell
bare-pipe shape. Equivalence test pins the accepted set.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 4: `dates.ts` — factory equality matcher

**Files:**
- Modify: `lib/parser/blocks/dates.ts` — route EVERY `DATES`-header-recognition site through the token/matcher, not just the D1 scan (plan R2 finding 2). The DATES-opener sites are `:84` (`hasDatesHeader` D1 detector), `:105` (`isV1ShapedDatesBlock` header find), `:131`, `:184` (block-start header finds), `:191` (`firstCell.toUpperCase() !== "DATES"` skip-past-header). The `:145` check `!["TRAVEL","SET","SHOW","DATES"].includes(labelU)` is a block-MEMBERSHIP sentinel (DATES is one of several continuation labels, not purely the opener) — leave it as a literal; the walker's equality guard accounts for it because `DATES ∈ SECTION_HEADER_TOKENS`.
- Test: `tests/parser/datesSectionTokens.test.ts`

**Interfaces:**
- Consumes: `matchesSectionHeader` (Task 1).
- Produces: `export const SECTION_HEADER_TOKENS = ["DATES"] as const;`

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/datesSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/dates";
import { matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("dates SECTION_HEADER_TOKENS", () => {
  it("exports exactly DATES", () => {
    expect([...SECTION_HEADER_TOKENS]).toEqual(["DATES"]);
  });
  it("matcher accepts DATES (any casing/spacing) and rejects near-misses", () => {
    expect(matchesSectionHeader("dates", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("DATE", SECTION_HEADER_TOKENS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/datesSectionTokens.test.ts`
Expected: FAIL — no export.

- [ ] **Step 3: Implement** — add the import + export, then replace EACH `DATES`-header-recognition site (`:84`, `:105`, `:131`, `:184`, `:191`) with `matchesSectionHeader(...)`. All are `clean(row[0] ?? "").toUpperCase() === "DATES"` (or its negation at `:191`); `matchesSectionHeader` normalizes identically (`\s+`→single-space, trim, uppercase), so behavior is unchanged for the space-free token `DATES`.

```ts
import { matchesSectionHeader } from "./_sectionHeaderMatch";
export const SECTION_HEADER_TOKENS = ["DATES"] as const;
// :84 (D1 detector)
  const hasDatesHeader = parseTableRows(markdown).some((r) =>
    matchesSectionHeader(clean(r[0] ?? ""), SECTION_HEADER_TOKENS),
  );
// :105 / :131 / :184 (header finds)
    if (matchesSectionHeader(clean(row[0] ?? ""), SECTION_HEADER_TOKENS)) found = true; // (or: ... ) { ... }
// :191 (skip-past-header negation)
    if (firstCell && !matchesSectionHeader(firstCell, SECTION_HEADER_TOKENS)) { /* left header */ }
```
Leave the `:145` membership list `["TRAVEL","SET","SHOW","DATES"]` as-is (DATES is a block-continuation sentinel there, accounted-for by the walker because it is a token).

- [ ] **Step 4: Run to verify it passes + no behavior change**

Run: `pnpm vitest run tests/parser/datesSectionTokens.test.ts tests/parser/exporterFixtures.test.ts` and any `tests/parser/dates*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/dates.ts tests/parser/datesSectionTokens.test.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(parser): dates exports SECTION_HEADER_TOKENS + matchesSectionHeader

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 5: `venue.ts` — factory equality matcher (`["VENUE"]` only)

**Files:**
- Modify: `lib/parser/blocks/venue.ts` (the `col0Upper === "VENUE"` opener at `:168`; the other `col0Upper !== "VENUE"` scope-continuation checks at `:238`/`:305` are NOT openers — leave them as raw equality on the already-uppercased `col0Upper`, or route through the token too; either is behavior-identical)
- Test: `tests/parser/venueSectionTokens.test.ts`

**Interfaces:**
- Consumes: `matchesSectionHeader` (Task 1).
- Produces: `export const SECTION_HEADER_TOKENS = ["VENUE"] as const;` — **NOT** `VENUES` (registry-only alias, spec §4/R8).

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/venueSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/venue";
import { matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("venue SECTION_HEADER_TOKENS", () => {
  it("exports exactly VENUE (NOT VENUES — registry alias only)", () => {
    expect([...SECTION_HEADER_TOKENS]).toEqual(["VENUE"]);
  });
  it("opener matches VENUE only", () => {
    expect(matchesSectionHeader("VENUE", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("VENUES", SECTION_HEADER_TOKENS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/venueSectionTokens.test.ts`
Expected: FAIL — no export.

- [ ] **Step 3: Implement** — add import + export; replace the opener guard `if (col0Upper === "VENUE")` (`:168`) with `if (matchesSectionHeader(col0, SECTION_HEADER_TOKENS))`. (The `col0Upper` continuation guards at `:238`/`:305` are sentinel checks against the SAME token — replace them the same way for consistency, or leave; both are behavior-identical since `col0Upper` is `col0.toUpperCase().trim()` which `matchesSectionHeader` reproduces.)

```ts
import { matchesSectionHeader } from "./_sectionHeaderMatch";
export const SECTION_HEADER_TOKENS = ["VENUE"] as const;
// :168
    if (matchesSectionHeader(col0, SECTION_HEADER_TOKENS)) {
```

- [ ] **Step 4: Run to verify it passes + no behavior change**

Run: `pnpm vitest run tests/parser/venueSectionTokens.test.ts tests/parser/exporterFixtures.test.ts` and any `tests/parser/venue*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/venue.ts tests/parser/venueSectionTokens.test.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(parser): venue exports SECTION_HEADER_TOKENS=["VENUE"] + matchesSectionHeader

VENUES stays a registry-only alias (no parser opens on it). Behavior-preserving.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 6: `client.ts` — factory equality matcher

**Files:**
- Modify: `lib/parser/blocks/client.ts:93` (opener `label === "CLIENT"`; the `:276` occurrence is the same opener in a second pass — replace both)
- Test: `tests/parser/clientSectionTokens.test.ts`

**Interfaces:**
- Consumes: `matchesSectionHeader` (Task 1).
- Produces: `export const SECTION_HEADER_TOKENS = ["CLIENT"] as const;`

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/clientSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/client";
import { matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("client SECTION_HEADER_TOKENS", () => {
  it("exports exactly CLIENT", () => {
    expect([...SECTION_HEADER_TOKENS]).toEqual(["CLIENT"]);
  });
  it("matches CLIENT, rejects near-miss", () => {
    expect(matchesSectionHeader("client", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("CLIENTS", SECTION_HEADER_TOKENS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/clientSectionTokens.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — add import + export; at `:93` and `:276` replace `label === "CLIENT"` with `matchesSectionHeader(label, SECTION_HEADER_TOKENS)`. (`label` is `(row[0] ?? "").toUpperCase()`; `matchesSectionHeader` normalizes, so behavior is identical.)

- [ ] **Step 4: Run to verify it passes + no behavior change**

Run: `pnpm vitest run tests/parser/clientSectionTokens.test.ts tests/parser/exporterFixtures.test.ts` and any `tests/parser/client*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/client.ts tests/parser/clientSectionTokens.test.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(parser): client exports SECTION_HEADER_TOKENS + matchesSectionHeader

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 7: `dress.ts` — factory equality matcher

**Files:**
- Modify: `lib/parser/blocks/dress.ts:24` (`normalizeHeader(clean(cells[0] ?? "")) !== "DRESS"`)
- Test: `tests/parser/dressSectionTokens.test.ts`

**Interfaces:**
- Consumes: `matchesSectionHeader` (Task 1).
- Produces: `export const SECTION_HEADER_TOKENS = ["DRESS"] as const;`

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/dressSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/dress";
import { matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("dress SECTION_HEADER_TOKENS", () => {
  it("exports exactly DRESS", () => {
    expect([...SECTION_HEADER_TOKENS]).toEqual(["DRESS"]);
  });
  it("matches DRESS, rejects near-miss", () => {
    expect(matchesSectionHeader("Dress", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("DRESSES", SECTION_HEADER_TOKENS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/dressSectionTokens.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — add import + export; at `:24` replace `normalizeHeader(clean(cells[0] ?? "")) !== "DRESS"` with `!matchesSectionHeader(clean(cells[0] ?? ""), SECTION_HEADER_TOKENS)`.

- [ ] **Step 4: Run to verify it passes + no behavior change**

Run: `pnpm vitest run tests/parser/dressSectionTokens.test.ts tests/parser/exporterFixtures.test.ts` and any `tests/parser/dress*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/dress.ts tests/parser/dressSectionTokens.test.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(parser): dress exports SECTION_HEADER_TOKENS + matchesSectionHeader

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 8: `event.ts` — factory whole-cell alternation matcher

**Files:**
- Modify: `lib/parser/blocks/event.ts:40` (`EVENT_DETAILS_HEADER_RE`)
- Test: `tests/parser/eventSectionTokens.test.ts`

**Interfaces:**
- Consumes: `buildCol0HeaderRe` (Task 1).
- Produces: `export const SECTION_HEADER_TOKENS = ["EVENT DETAILS","DETAILS","DETAILS/ROOM DIAGRAM","GS DETAILS","GS DETAILS (FOR BOTH)"] as const;`

**Note on equivalence:** the live regex `/^\|\s*(EVENT\s+DETAILS|DETAILS(?:\/Room\s+Diagram)?|GS\s+DETAILS(?:\s+\(FOR\s+BOTH\))?)\s*[|]/im` accepts exactly the 5 canonical forms (whole-cell, `/im`). `buildCol0HeaderRe(tokens, {caseInsensitive:true})` with the 5 tokens (space→`\s+`, `/` and `()` escaped, longest-first ordering) reproduces the same accepted set.

- [ ] **Step 1: Write the failing test** (token export + full-equivalence enumeration against the ORIGINAL regex).

```ts
// tests/parser/eventSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/event";
import { buildCol0HeaderRe } from "@/lib/parser/blocks/_sectionHeaderMatch";

const ORIGINAL =
  /^\|\s*(EVENT\s+DETAILS|DETAILS(?:\/Room\s+Diagram)?|GS\s+DETAILS(?:\s+\(FOR\s+BOTH\))?)\s*[|]/im;

describe("event SECTION_HEADER_TOKENS", () => {
  it("exports the 5 canonical variants", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(
      ["DETAILS", "DETAILS/ROOM DIAGRAM", "EVENT DETAILS", "GS DETAILS", "GS DETAILS (FOR BOTH)"].sort(),
    );
  });
  it("factory regex matches EXACTLY the original's accepted set", () => {
    const rebuilt = buildCol0HeaderRe(SECTION_HEADER_TOKENS, { caseInsensitive: true });
    const accepted = [
      "| EVENT DETAILS |",
      "| DETAILS |",
      "| DETAILS/Room Diagram |",
      "| GS DETAILS |",
      "| GS DETAILS (FOR BOTH) |",
      "| gs details (for both) |", // case-insensitive
      "| EVENT  DETAILS |", // multi-space
    ];
    const rejected = ["| EVENTS |", "| DETAIL |", "| GS |", "| ROOM DIAGRAM |"];
    for (const s of accepted) {
      expect(rebuilt.test(s), `rebuilt should accept ${s}`).toBe(true);
      expect(ORIGINAL.test(s), `original should accept ${s}`).toBe(true);
    }
    for (const s of rejected) {
      expect(rebuilt.test(s), `rebuilt should reject ${s}`).toBe(false);
      expect(ORIGINAL.test(s), `original should reject ${s}`).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/eventSectionTokens.test.ts`
Expected: FAIL — no export.

- [ ] **Step 3: Implement** — add import + export; replace `EVENT_DETAILS_HEADER_RE` at `:40`:

```ts
import { buildCol0HeaderRe } from "./_sectionHeaderMatch";
export const SECTION_HEADER_TOKENS = [
  "EVENT DETAILS",
  "DETAILS",
  "DETAILS/ROOM DIAGRAM",
  "GS DETAILS",
  "GS DETAILS (FOR BOTH)",
] as const;
const EVENT_DETAILS_HEADER_RE = buildCol0HeaderRe(SECTION_HEADER_TOKENS, { caseInsensitive: true });
```

- [ ] **Step 4: Run to verify it passes + no behavior change**

Run: `pnpm vitest run tests/parser/eventSectionTokens.test.ts tests/parser/exporterFixtures.test.ts` and any `tests/parser/event*.test.ts`
Expected: PASS. If any fixture assertion changes, the rebuilt regex diverged — fix the factory/tokens, do NOT edit the fixture assertion.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/event.ts tests/parser/eventSectionTokens.test.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(parser): event exports SECTION_HEADER_TOKENS + factory-built EVENT_DETAILS_HEADER_RE

5 canonical variants; equivalence test enumerates the accepted set vs the
original regex. Behavior-preserving.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 9: `hotels.ts` — factory structured matcher + tokens; inline capture matchers allowlisted

**Files:**
- Modify: `lib/parser/blocks/hotels.ts` — structured `HOTEL_HEADER_RE` (`:313`) → factory; D1 detector (`:68`) → `matchesSectionHeader` over tokens; inline capture regexes (`:507`,`:519`) RETAINED (capture group `([^|]+)`) — they go in the walker's `RAW_HEADER_REGEX_ALLOWLIST` (Task 15)
- Test: `tests/parser/hotelsSectionTokens.test.ts`

**Interfaces:**
- Consumes: `buildCol0HeaderRe`, `matchesSectionHeader` (Task 1).
- Produces: `export const SECTION_HEADER_TOKENS = ["HOTEL","HOTEL RESERVATION","HOTEL RESERVATIONS","HOTEL STAY","HOTEL STAYS"] as const;`

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/hotelsSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/hotels";
import { buildCol0HeaderRe, matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("hotels SECTION_HEADER_TOKENS", () => {
  it("exports HOTEL + reservation/stay singular+plural (all registry members)", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(
      ["HOTEL", "HOTEL RESERVATION", "HOTEL RESERVATIONS", "HOTEL STAY", "HOTEL STAYS"].sort(),
    );
  });
  it("structured HOTEL matcher reproduces /^\\|\\s*HOTEL\\s*\\|/m", () => {
    const re = buildCol0HeaderRe(["HOTEL"]);
    expect(re.test("| HOTEL | RESERVATION #1 |")).toBe(true);
    expect(re.test("| HOTELS |")).toBe(false);
  });
  it("D1 detector matches all inline forms via matchesSectionHeader", () => {
    expect(matchesSectionHeader("Hotel Reservations", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("Hotel Stay", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("Get Hotel Reservations", SECTION_HEADER_TOKENS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/hotelsSectionTokens.test.ts`
Expected: FAIL — no export.

- [ ] **Step 3: Implement**
  - Add `import { buildCol0HeaderRe, matchesSectionHeader } from "./_sectionHeaderMatch";` and the token export.
  - Replace `HOTEL_HEADER_RE = /^\|\s*HOTEL\s*\|/m` at `:313` with `buildCol0HeaderRe(["HOTEL"])`.
  - Replace the D1 detector body at `:68` (`c === "HOTEL" || /^HOTEL\s+RESERVATIONS?$/.test(c) || /^HOTEL\s+STAYS?$/.test(c)`) with `matchesSectionHeader(clean(r[0] ?? ""), SECTION_HEADER_TOKENS)`. (Note: D1 currently uppercases via `.toUpperCase()`; `matchesSectionHeader` normalizes, so the anchored `$`/whole-cell semantics are preserved — it rejects `Get Hotel Reservations`.)
  - Leave the inline capture regexes at `:507`/`:519` AS-IS (they capture the value column). Add a code comment above each: `// RAW_HEADER_REGEX_ALLOWLIST: inline capture matcher; col0 token identity is registry-checked via SECTION_HEADER_TOKENS (see tests/parser/_metaKnownSectionsWalker.test.ts).`

- [ ] **Step 4: Run to verify it passes + no behavior change**

Run: `pnpm vitest run tests/parser/hotelsSectionTokens.test.ts tests/parser/exporterFixtures.test.ts` and any `tests/parser/hotel*.test.ts`
Expected: PASS, no fixture changes.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/hotels.ts tests/parser/hotelsSectionTokens.test.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(parser): hotels exports SECTION_HEADER_TOKENS; structured+D1 via factory

Structured HOTEL opener + D1 empty-drop detector routed through the factory;
inline reservation/stay capture regexes retained (allowlisted — they capture the
value column). Behavior-preserving.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 10: `index.ts` (agenda) — tokens on index.ts; agenda regex retained + equivalence

**Files:**
- Modify: `lib/parser/index.ts` — export `SECTION_HEADER_TOKENS`, import the factory, retain the `:339` capture regex (it captures the value column) with an allowlist comment
- Test: `tests/parser/agendaSectionTokens.test.ts`

**Interfaces:**
- Consumes: `buildCol0HeaderAltRe` (Task 1).
- Produces: `export const SECTION_HEADER_TOKENS = ["AGENDA", "AGENDA LINK"] as const;` **on `lib/parser/index.ts`** (spec §4/R10 — a single path, NOT a separate module).

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/agendaSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser";
import { buildCol0HeaderAltRe } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("index.ts agenda SECTION_HEADER_TOKENS", () => {
  it("exports AGENDA + AGENDA LINK", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(["AGENDA", "AGENDA LINK"]);
  });
  it("factory alt-matcher accepts the same label set as the live agenda regex", () => {
    const re = buildCol0HeaderAltRe(SECTION_HEADER_TOKENS, { caseInsensitive: true, allowLeadingWs: true });
    expect(re.test("| AGENDA | https://x |")).toBe(true);
    expect(re.test("| AGENDA LINK - Day 1 | https://x |")).toBe(true);
    expect(re.test("|  AGENDA  | v |")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/agendaSectionTokens.test.ts`
Expected: FAIL — no export.

- [ ] **Step 3: Implement** — in `lib/parser/index.ts`:
  - Add near the top-of-file exports: `import { buildCol0HeaderAltRe } from "@/lib/parser/blocks/_sectionHeaderMatch";` and `export const SECTION_HEADER_TOKENS = ["AGENDA", "AGENDA LINK"] as const;`
  - Above the `:339` regex add: `// RAW_HEADER_REGEX_ALLOWLIST: agenda label+value capture matcher; label identity is registry-checked via SECTION_HEADER_TOKENS (see _metaKnownSectionsWalker).`
  - The import-link nudge is satisfied by the `buildCol0HeaderAltRe` import (used by the co-located equivalence test's assertion path is sufficient; if the linter flags an unused import, reference it in a `/* c8 ignore */` assertion helper or use it to build a co-located `AGENDA_LABEL_RE` used by `isAgendaLinkRow`). Simplest: keep the import and add a module-level `const AGENDA_LABEL_RE = buildCol0HeaderAltRe(SECTION_HEADER_TOKENS, { caseInsensitive: true, allowLeadingWs: true });` used as a fast pre-filter before the capture regex (behavior-identical — the capture regex still does the extraction).

- [ ] **Step 4: Run to verify it passes + no behavior change**

Run: `pnpm vitest run tests/parser/agendaSectionTokens.test.ts tests/parser/exporterFixtures.test.ts` (exporterFixtures pins East Coast bare-AGENDA capture) and any `tests/parser/agenda*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/index.ts tests/parser/agendaSectionTokens.test.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(parser): index.ts exports agenda SECTION_HEADER_TOKENS + imports factory

Tokens live on index.ts (single path, spec R10). Agenda capture regex retained
(allowlisted — captures the value); factory-built AGENDA_LABEL_RE pre-filter
satisfies the import-link nudge. Behavior-preserving.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 11: `transport.ts` — tokens + factory col0 identity; multi-column matchers allowlisted

**Files:**
- Modify: `lib/parser/blocks/transport.ts` — export tokens; the multi-column header regex (`:172`) and v1 `Driver` header regex (`:446`) capture columns, so they are RETAINED with allowlist comments; add a factory-derived col0 identity assertion
- Test: `tests/parser/transportSectionTokens.test.ts`

**Interfaces:**
- Consumes: `buildCol0HeaderRe` (Task 1).
- Produces: `export const SECTION_HEADER_TOKENS = ["TRANSPORTATION", "DRIVER"] as const;`

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/transportSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/transport";
import { buildCol0HeaderRe, buildCol0HeaderAltRe } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("transport SECTION_HEADER_TOKENS", () => {
  it("exports TRANSPORTATION + DRIVER", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(["DRIVER", "TRANSPORTATION"]);
  });
  it("col0 identity pre-checks are SUPERSETS of the retained /im regexes (case + slash suffix)", () => {
    // Live :172 col0 is `TRANSPORTATION(?:\/[^|]*)?` — accepts a slash suffix, so the
    // pre-check MUST allow a trailing suffix (AltRe), not whole-cell (plan R2 finding 1).
    const tRe = buildCol0HeaderAltRe(["TRANSPORTATION"], { caseInsensitive: true });
    expect(tRe.test("| TRANSPORTATION | TRANSPORTATION | PHONE | EMAIL |")).toBe(true);
    expect(tRe.test("| transportation | transportation | phone | email |")).toBe(true); // case superset
    expect(tRe.test("| TRANSPORTATION/Ground | TRANSPORTATION | PHONE | EMAIL |")).toBe(true); // slash-suffix superset
    // v1 Driver header is whole-cell /^\|\s*Driver\s*\|/im — whole-cell case-insensitive is exact.
    expect(buildCol0HeaderRe(["DRIVER"], { caseInsensitive: true }).test("| Driver | Name | Phone |")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/transportSectionTokens.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — add import + token export. The multi-column header regexes at `:172`/`:446` are RETAINED (they require the PHONE/EMAIL columns and capture slash content / driver name+phone). Add above each: `// RAW_HEADER_REGEX_ALLOWLIST: multi-column header matcher; col0 token identity (TRANSPORTATION / DRIVER) is registry-checked via SECTION_HEADER_TOKENS.` Add a module-level factory reference to satisfy the import-link nudge — **and it MUST be a behavior-SUPERSET of the retained matcher so it never rejects a header the retained regex would accept** (plan R1 finding: the live `:172` regex is `/im` = case-INsensitive). Build the pre-check with the **suffix-tolerant** builder (live `:172` col0 is `TRANSPORTATION(?:\/[^|]*)?` — it accepts a slash suffix, so a whole-cell pre-check would WRONGLY reject `| TRANSPORTATION/Ground | ... |`, plan R2 finding 1): `const TRANSPORT_COL0_RE = buildCol0HeaderAltRe(["TRANSPORTATION"], { caseInsensitive: true });`. `buildCol0HeaderAltRe` allows a trailing non-pipe suffix AND is case-insensitive, so it is a true superset of `:172`'s col0 — as a pre-check it can only pass MORE than the retained regex (which still gates the actual parse), so behavior is preserved. **Do NOT use `buildCol0HeaderRe` (whole-cell) or the case-sensitive default here** — either would reject headers the current parser accepts (slash suffix / lowercase). (Safest alternative: satisfy the import-link nudge by importing `matchesSectionHeader` and using it in a behavior-neutral spot rather than gating with a pre-check at all.)

- [ ] **Step 4: Run to verify it passes + no behavior change**

Run: `pnpm vitest run tests/parser/transportSectionTokens.test.ts tests/parser/exporterFixtures.test.ts` and any `tests/parser/transport*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/transport.ts tests/parser/transportSectionTokens.test.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(parser): transport exports SECTION_HEADER_TOKENS + factory col0 pre-check

Multi-column TRANSPORTATION + v1 Driver header regexes retained (allowlisted —
they require/capture PHONE/EMAIL/name columns); DRIVER now registered (Task 2).
Behavior-preserving.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 12: `rooms.ts` — export tokens only (IMPORT_LINK_EXEMPT; matchers allowlisted)

**Files:**
- Modify: `lib/parser/blocks/rooms.ts` — add `export const SECTION_HEADER_TOKENS`; add allowlist comments above the capture-extract matchers
- Test: `tests/parser/roomsSectionTokens.test.ts`

**Interfaces:**
- Produces: `export const SECTION_HEADER_TOKENS = ["GENERAL SESSION", "BREAKOUT", "ADDITIONAL ROOM", "LUNCH ROOM"] as const;` — NOT `LUNCH SESSION` (spec §4/R9). rooms does NOT import the factory (it is in `IMPORT_LINK_EXEMPT`, Task 15).

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/roomsSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/rooms";
import { KNOWN_SECTION_HEADERS, normalizeHeader } from "@/lib/parser/knownSections";

describe("rooms SECTION_HEADER_TOKENS", () => {
  it("exports the 4 banners rooms opens on (NOT LUNCH SESSION)", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(
      ["ADDITIONAL ROOM", "BREAKOUT", "GENERAL SESSION", "LUNCH ROOM"].sort(),
    );
    expect([...SECTION_HEADER_TOKENS]).not.toContain("LUNCH SESSION");
  });
  it("every exported banner is an exact registry member", () => {
    for (const t of SECTION_HEADER_TOKENS) {
      expect(KNOWN_SECTION_HEADERS.has(normalizeHeader(t))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/roomsSectionTokens.test.ts`
Expected: FAIL — no export.

- [ ] **Step 3: Implement** — add the export near the other rooms consts (after `SECTION_EXACT_TOKENS`, ~`:93`). Add allowlist comments above `boBlockRe` (`:1104`), `lunchRe` (`:1163`), the additional-room `re` (`:1373`), the v4 prefix regexes (`:621/639/657`), and `NEXT_ROOM_HEADER_RE` (`:1296`): `// RAW_HEADER_REGEX_ALLOWLIST: rooms capture-extract/shape matcher (IMPORT_LINK_EXEMPT, spec §4); banner-token identity is registry-checked via SECTION_HEADER_TOKENS.` Do NOT import the factory.

- [ ] **Step 4: Run to verify it passes + no behavior change**

Run: `pnpm vitest run tests/parser/roomsSectionTokens.test.ts tests/parser/exporterFixtures.test.ts` and any `tests/parser/room*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/rooms.ts tests/parser/roomsSectionTokens.test.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(parser): rooms exports SECTION_HEADER_TOKENS (IMPORT_LINK_EXEMPT)

4 banners rooms opens on (not LUNCH SESSION). Capture-extract/shape matchers
stay raw + allowlisted; rooms does not import the factory. Behavior-preserving.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 13: `ops.ts` — export `METADATA_FIELD_TOKENS` (no section tokens)

**Files:**
- Modify: `lib/parser/blocks/ops.ts` (export the metadata field tokens)
- Test: `tests/parser/opsMetadataTokens.test.ts`

**Interfaces:**
- Produces: `export const METADATA_FIELD_TOKENS = ["COI", "PROPOSAL", "PO", "INVOICE", "INVOICE NOTES"] as const;` — NO `SECTION_HEADER_TOKENS` (these are scalar `cells[1]` metadata fields, spec §3).

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/opsMetadataTokens.test.ts
import { describe, it, expect } from "vitest";
import * as ops from "@/lib/parser/blocks/ops";
import { normalizeHeader } from "@/lib/parser/knownSections";

describe("ops METADATA_FIELD_TOKENS", () => {
  it("exports the 5 scalar metadata field tokens", () => {
    expect([...ops.METADATA_FIELD_TOKENS].sort()).toEqual(
      ["COI", "INVOICE", "INVOICE NOTES", "PO", "PROPOSAL"].sort(),
    );
  });
  it("exports NO SECTION_HEADER_TOKENS (ops opens no section)", () => {
    expect("SECTION_HEADER_TOKENS" in ops).toBe(false);
  });
  it("metadata tokens are DISJOINT from ops' section-opener tokens (spec §6.8 disjointness)", () => {
    // NOTE: metadata tokens need NOT be disjoint from KNOWN_SECTION_HEADERS — COI
    // IS a registered header that ops consumes as a scalar field (plan R4). The
    // spec §6.8 disjointness is SECTION_HEADER_TOKENS ∩ METADATA_FIELD_TOKENS per
    // file; ops exports no SECTION_HEADER_TOKENS, so the intersection is empty.
    const sectionTokens = new Set(
      ((ops as Record<string, unknown>).SECTION_HEADER_TOKENS as string[] | undefined ?? []).map(normalizeHeader),
    );
    for (const t of ops.METADATA_FIELD_TOKENS) {
      expect(sectionTokens.has(normalizeHeader(t))).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/opsMetadataTokens.test.ts`
Expected: FAIL — no export.

- [ ] **Step 3: Implement** — add `export const METADATA_FIELD_TOKENS = ["COI", "PROPOSAL", "PO", "INVOICE", "INVOICE NOTES"] as const;` near the whole-cell regex consts (`ops.ts:30-34`). Leave the whole-cell regexes as-is (spec §6.5 — not col0-header-prefix shaped, unaffected).

- [ ] **Step 4: Run to verify it passes + no behavior change**

Run: `pnpm vitest run tests/parser/opsMetadataTokens.test.ts tests/parser/exporterFixtures.test.ts` and any `tests/parser/ops*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/ops.ts tests/parser/opsMetadataTokens.test.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(parser): ops exports METADATA_FIELD_TOKENS (scalar fields, not section openers)

Disjoint from the section registry. No SECTION_HEADER_TOKENS.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 14: The walker meta-test `_metaKnownSectionsWalker.test.ts`

This is the load-bearing structural guard (spec §6). Responsibilities: (0) scanned-file set, (1) filesystem-walk fail-by-default, (2) non-empty, (3) EXACT subset ⊆ registry, (4) import-link nudge, (5) REGISTRY-KEYED source-text backstop (Form A equality/startsWith/includes + Form B anchored regex, keyed to `KNOWN_SECTION_HEADERS` membership), (7) documented residual comment, (8) disjointness, (9) non-vacuity proof + negative controls, (10) no-orphan warn.

**Files:**
- Create: `tests/parser/_metaKnownSectionsWalker.test.ts`

**Interfaces:**
- Consumes: `SECTION_HEADER_TOKENS` / `METADATA_FIELD_TOKENS` exports from Tasks 3–13; `KNOWN_SECTION_HEADERS`, `PREFIX_SECTION_FAMILIES`, `KNOWN_SUB_LABELS`, `normalizeHeader` from `lib/parser/knownSections.ts`.

- [ ] **Step 1: Write the failing test** (the full walker).

```ts
// tests/parser/_metaKnownSectionsWalker.test.ts
//
// STRUCTURAL WALKER (spec 2026-07-06-known-sections-walker §6). Fails-by-default
// for any NEW file under lib/parser/blocks/. Enforced PRIMARY gates: annotation
// (export SECTION_HEADER_TOKENS or be allowlisted), non-empty, EXACT subset of
// KNOWN_SECTION_HEADERS. STRUCTURAL NUDGE: token-exporters (except
// IMPORT_LINK_EXEMPT) import the shared factory. BACKSTOP (registry-keyed): a
// source-text guard flags a hand-rolled matcher (Form A: equality/startsWith/
// includes against a quoted token; Form B: an anchored /^.../ regex containing
// the token) whose token is an EXACT KNOWN_SECTION_HEADERS member the file
// neither owns nor allowlists — high-signal (sub-labels, column headers,
// terminator arrays, .includes(var), and comments do NOT fire). DECLARED
// ACCEPTED RESIDUAL (spec §6.7): the walker proves import, NOT exclusive factory
// USE; and because the backstop is registry-keyed, a hand-rolled matcher for an
// UNREGISTERED token, or a registered token via an exotic mechanism (computed
// token, .match on a built regex, non-anchored/lowercase literal), is not caught
// — behavior on shipped fixtures is pinned by the parser test suite, and the
// COMMON drift (a new parser file) cannot pass silently (annotation gate). Do
// NOT relitigate the residual as an undiscovered hole.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  KNOWN_SECTION_HEADERS,
  PREFIX_SECTION_FAMILIES,
  normalizeHeader,
} from "@/lib/parser/knownSections";

const BLOCKS_DIR = join(process.cwd(), "lib/parser/blocks");
const INDEX_FILE = join(process.cwd(), "lib/parser/index.ts");

// Files that open NO section (per-file reason). Filesystem-walked, so a NEW
// blocks/*.ts that is neither here nor a token-exporter FAILS.
const NO_SECTION_OPENER: Record<string, string> = {
  "_helpers.ts": "pure helpers; no col0 section detection",
  "agenda.ts": "agenda schedule rows; the agenda-link opener lives in index.ts",
  "agendaWarnings.ts": "warning emission only",
  "contacts.ts": "scalar contact-label detection (cells[1]-only), not a multi-row section opener (spec §3 R1 f1)",
  "gear.ts": "classifies rooms it does not open; reuses room families owned by rooms.ts",
  "scheduleBookends.ts": "schedule bookend rows; no section opener",
  "scheduleTimes.ts": "schedule time rows; no section opener",
  "travelFlights.ts": "flight rows; no section opener",
  "travelFlightWarnings.ts": "warning emission only",
  "ops.ts": "metadata scalar fields (METADATA_FIELD_TOKENS); no section opener",
};

// Token-exporters exempt from the import-link nudge (capture-extract/shape
// matchers not buildable from the presence factory — spec §4/§6.4).
const IMPORT_LINK_EXEMPT = new Set(["rooms.ts"]);

// Files with a RETAINED raw matcher (regex or equality) referencing a REGISTERED
// section-opener token — either the file's own token (deliberately kept as a
// capture-extract/multi-column matcher) or another section's banner reused as a
// boundary/classification. Reason travels with each entry. (Populated from a
// complete plan-time preflight scan over the live tree — see plan Task 14 note.)
const RAW_HEADER_REGEX_ALLOWLIST: Record<string, string> = {
  "rooms.ts": "capture-extract/shape room-banner matchers (IMPORT_LINK_EXEMPT, spec §4)",
  "hotels.ts": "inline reservation/stay capture matchers (:507/:519) + /^HOTEL$/i (:356)",
  "transport.ts": "multi-column TRANSPORTATION headers (:173/:336), v1 Driver (:446), /^TRANSPORTATION\\//i (:285)",
  "index.ts": "agenda label+value capture matcher (:339)",
  "event.ts": "references GENERAL SESSION / BREAKOUT as a room-block boundary (:174) — event does not OPEN those",
  "gear.ts": "room-family classification (/^GENERAL/, /^BREAKOUT/, /^LUNCH/ :97-99) — reuses banners owned by rooms.ts",
  "scheduleTimes.ts": "consumes the DATES block boundary owned by dates.ts (:114/:122) — not an opener",
};

// Equality/method literals (registered-section-header tokens) legitimate in a file
// that does not own the token (a cross-section boundary reference, or a sentinel).
const EQUALITY_LITERAL_ALLOWLIST: Record<string, readonly string[]> = {
  "scheduleTimes.ts": ["DATES"], // consumes the dates-block boundary owned by dates.ts (:114/:122)
  "index.ts": ["CLIENT"], // CLIENT-prefix title-exclusion sentinel (client section owned by client.ts)
};

// Registry entries no parser OPENS on but that are intentionally present
// (aliases / prefix-family members / metadata fields) — warned, not failed (spec §6.10).
// COI is in KNOWN_SECTION_HEADERS but is consumed by ops as a scalar METADATA field
// (METADATA_FIELD_TOKENS), not opened as a section.
const EXPECTED_ORPHANS = new Set(["VENUES", "IN HOUSE AV", "LUNCH SESSION", "COI"]);

// POST-IMPLEMENTATION AMENDMENT (whole-diff Codex review R1 [medium] ×2 — shipped
// tighter than the snippets above; the test file is authoritative):
//  1. RAW_HEADER_REGEX_ALLOWLIST is TOKEN-SPECIFIC — Record<string, {tokens, reason}>;
//     the backstop asserts the DETECTED {file, token} is allowed. A file's OWN tokens
//     are exempt via ownTokens (so hotels/transport/scheduleTimes carry NO entry). The
//     map lists only cross-section boundary refs: rooms → [DATES,CREW,DRESS,
//     TRANSPORTATION,HOTEL,VENUE,AGENDA,DETAILS], event/gear/index → [GENERAL SESSION,
//     BREAKOUT]. Proof (h) pins it. Prevents an allowlisted file hiding drift onto a
//     DIFFERENT registered token.
//  2. No-orphan check FAILS (not warns) — a registry entry no parser opens silently
//     suppresses UNKNOWN_SECTION_HEADER. EXPECTED_ORPHANS expanded to the 8 verified
//     non-openers: VENUES, HOTELS, IN HOUSE AV, LUNCH SESSION, COI, DOCUMENT FOLDER
//     LINK, PULL SHEET, FOYER (each consumed elsewhere — reasons travel in-code).

interface Scanned {
  file: string;
  path: string;
  source: string;
  mod: Record<string, unknown>;
}

async function scanFiles(): Promise<Scanned[]> {
  const blockFiles = readdirSync(BLOCKS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({ file: f, path: join(BLOCKS_DIR, f) }));
  const all = [...blockFiles, { file: "index.ts", path: INDEX_FILE }];
  const out: Scanned[] = [];
  for (const { file, path } of all) {
    const source = readFileSync(path, "utf8");
    const mod = (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
    out.push({ file, path, source, mod });
  }
  return out;
}

describe("known-sections source walker", () => {
  it("every scanned file exports SECTION_HEADER_TOKENS or is allowlisted; tokens ⊆ registry; import-link nudge; disjointness", async () => {
    const scanned = await scanFiles();
    for (const s of scanned) {
      const tokens = s.mod.SECTION_HEADER_TOKENS as readonly string[] | undefined;
      const isFactoryFile = s.file === "_sectionHeaderMatch.ts";
      if (isFactoryFile) continue;

      if (!tokens) {
        // Step 1: no tokens → MUST be allowlisted as a no-opener file.
        expect(
          NO_SECTION_OPENER[s.file],
          `${s.file} exports no SECTION_HEADER_TOKENS and is not in NO_SECTION_OPENER — add tokens or an allowlist reason`,
        ).toBeTruthy();
        continue;
      }

      // Step 2: non-empty for a token-exporter.
      expect(tokens.length, `${s.file} exports an empty SECTION_HEADER_TOKENS`).toBeGreaterThan(0);

      // Step 3: EXACT subset ⊆ registry (NOT prefix-match).
      for (const t of tokens) {
        expect(
          KNOWN_SECTION_HEADERS.has(normalizeHeader(t)),
          `${s.file} token "${t}" is not an exact member of KNOWN_SECTION_HEADERS`,
        ).toBe(true);
      }

      // Step 4: import-link nudge (unless IMPORT_LINK_EXEMPT).
      if (!IMPORT_LINK_EXEMPT.has(s.file)) {
        expect(
          /from\s+["'](?:\.\/|@\/lib\/parser\/blocks\/)_sectionHeaderMatch["']/.test(s.source),
          `${s.file} exports SECTION_HEADER_TOKENS but does not import _sectionHeaderMatch (import-link nudge)`,
        ).toBe(true);
      }

      // Step 8: disjointness with METADATA_FIELD_TOKENS if both present.
      const meta = s.mod.METADATA_FIELD_TOKENS as readonly string[] | undefined;
      if (meta) {
        const overlap = tokens.filter((t) => meta.some((m) => normalizeHeader(m) === normalizeHeader(t)));
        expect(overlap, `${s.file} SECTION_HEADER_TOKENS ∩ METADATA_FIELD_TOKENS not empty`).toEqual([]);
      }
    }
  });

  it("BACKSTOP (REGISTERED-TOKEN-KEYED, 2 syntactic forms, CASE-SENSITIVE): no un-allowlisted matcher for a registered opener the file does not own", async () => {
    const scanned = await scanFiles();
    const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    for (const s of scanned) {
      if (s.file === "_sectionHeaderMatch.ts") continue;
      // A file legitimately "owns" a registered token as a SECTION opener OR as a
      // scalar METADATA field (e.g. ops owns COI, which is ALSO in the registry).
      const ownTokens = new Set(
        [
          ...((s.mod.SECTION_HEADER_TOKENS as string[] | undefined) ?? []),
          ...((s.mod.METADATA_FIELD_TOKENS as string[] | undefined) ?? []),
        ].map(normalizeHeader),
      );
      const rawAllowed = s.file in RAW_HEADER_REGEX_ALLOWLIST;
      const eqAllowed = new Set((EQUALITY_LITERAL_ALLOWLIST[s.file] ?? []).map(normalizeHeader));

      // Pre-extract anchored regex literals and NORMALIZE their whitespace
      // (\s, \s+, \s*, literal spaces → single space) so Form B catches both
      // `/^GENERAL SESSION/` and `/^GENERAL\s+SESSION\b/`. CASE-SENSITIVE: real
      // section openers are UPPERCASE; scalar/contacts labels are lowercase and
      // must NOT fire.
      const anchoredRegexNorm = (s.source.match(/\/\\?\^[^/\n]+\//g) ?? []).map((lit) =>
        lit.replace(/\\s[*+]?/g, " ").replace(/\s+/g, " "),
      );

      for (const token of KNOWN_SECTION_HEADERS) {
        if (ownTokens.has(token) || eqAllowed.has(token)) continue; // owned/allowlisted → expected
        const T = esc(token);

        // FORM A — quoted token adjacent to an equality/method operator (CASE-SENSITIVE).
        // Excludes Set-membership arrays (`["T", ...]`) and `.includes(var)`.
        const FORM_A = new RegExp(
          `(?:===|!==|\\.startsWith\\(|\\.includes\\()\\s*["']${T}["']|["']${T}["']\\s*(?:===|!==)`,
        );
        // FORM B — the UPPERCASE token appears (whitespace-normalized) inside an anchored regex literal.
        const formB = anchoredRegexNorm.some((lit) => lit.includes(token));

        if (!FORM_A.test(s.source) && !formB) continue;

        expect(
          rawAllowed,
          `${s.file}: hard-coded matcher for registered section opener "${token}" (which this file does not own) — is this a hidden opener? Export it as a token + build via the factory, or add a RAW_HEADER_REGEX_ALLOWLIST / EQUALITY_LITERAL_ALLOWLIST reason.`,
        ).toBe(true);
      }
    }
  });

  // NOTE (whole-diff R1): shipped as FAILS, not warn — see the post-implementation
  // amendment above and the authoritative test file.
  it("no-orphan (FAILS): every registry entry is claimed by a parser/prefix/sub-label or is an EXPECTED_ORPHAN", async () => {
    const scanned = await scanFiles();
    const claimed = new Set<string>();
    for (const s of scanned) {
      for (const t of ((s.mod.SECTION_HEADER_TOKENS as string[] | undefined) ?? [])) claimed.add(normalizeHeader(t));
    }
    for (const p of PREFIX_SECTION_FAMILIES) claimed.add(normalizeHeader(p));
    const orphans = [...KNOWN_SECTION_HEADERS].filter(
      (h) => !claimed.has(h) && !EXPECTED_ORPHANS.has(h),
    );
    expect(orphans, `unclaimed KNOWN_SECTION_HEADERS entries not in EXPECTED_ORPHANS: ${orphans.join(", ")}`).toEqual([]);
  });
});

// Step 9 — non-vacuity proof. Mirrors the two backstop forms so the proof is
// self-contained; `token` defaults to a REGISTERED opener (GENERAL SESSION).
describe("known-sections walker non-vacuity proof", () => {
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Mirrors the guard: CASE-SENSITIVE Form A + whitespace-normalized anchored-regex Form B.
  const hits = (source: string, token = "GENERAL SESSION"): boolean => {
    const T = esc(token);
    const FORM_A = new RegExp(`(?:===|!==|\\.startsWith\\(|\\.includes\\()\\s*["']${T}["']|["']${T}["']\\s*(?:===|!==)`);
    const anchored = (source.match(/\/\\?\^[^/\n]+\//g) ?? []).map((lit) =>
      lit.replace(/\\s[*+]?/g, " ").replace(/\s+/g, " "),
    );
    return FORM_A.test(source) || anchored.some((lit) => lit.includes(token));
  };

  it("(a) an unregistered token fails the exact-subset check", () => {
    expect(KNOWN_SECTION_HEADERS.has(normalizeHeader("ZZZ_UNREGISTERED"))).toBe(false);
  });
  it("(c) a source exporting tokens but not importing the factory fails the import-link regex", () => {
    const bad = `export const SECTION_HEADER_TOKENS = ["GENERAL SESSION"];`;
    expect(/from\s+["'](?:\.\/|@\/lib\/parser\/blocks\/)_sectionHeaderMatch["']/.test(bad)).toBe(false);
  });
  it("(d) Form B: anchored regex literals referencing a registered token are flagged (incl. \\s+ variant)", () => {
    expect(hits(String.raw`const RE = /^\|\s*GENERAL SESSION\s*\|/;`)).toBe(true);
    expect(hits(`if (/^GENERAL SESSION/.test(col0)) {}`)).toBe(true);
    expect(hits(String.raw`if (/^GENERAL\s+SESSION\b/.test(col0)) {}`)).toBe(true); // R4-2: \s+ normalized
  });
  it("(e)/(f) Form A: equality (both orders) + startsWith/includes for a registered token are flagged", () => {
    expect(hits(`label === "GENERAL SESSION"`)).toBe(true);
    expect(hits(`"GENERAL SESSION" === label`)).toBe(true); // reversed
    expect(hits(`if (col0.startsWith("GENERAL SESSION")) {}`)).toBe(true);
    expect(hits(`if (col0.includes("GENERAL SESSION")) {}`)).toBe(true);
  });
  it("(g) NEGATIVE CONTROLS: benign patterns are NOT flagged", () => {
    // lowercase scalar-label regex (contacts style) — case-sensitive, must NOT fire:
    expect(hits(String.raw`const RE = /^\s*(?:venue|hotel)\s+contact/i;`, "VENUE")).toBe(false);
    // terminator/membership array literal (no ===/method adjacency):
    expect(hits(`const T = new Set(["HOTEL", "DATES", "VENUE"]);`, "HOTEL")).toBe(false);
    expect(hits(`if (["TRAVEL","SET","SHOW","DATES"].includes(labelU)) {}`, "DATES")).toBe(false);
    // prose/comment mentioning a token (no anchored regex, no equality adjacency):
    expect(hits(`// the GENERAL SESSION block is owned by rooms.ts`)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails first, then passes**

Run: `pnpm vitest run tests/parser/_metaKnownSectionsWalker.test.ts`
Expected: initially may FAIL if any parser task is incomplete (missing export, missing factory import, un-allowlisted raw regex). Iterate: each failure names the file + reason. Fix by completing the parser's task or adding the correct allowlist/reason entry — NEVER by weakening a PRIMARY gate. Once all parser tasks (3–13) are done, this passes.

- [ ] **Step 3: Verify the backstop is non-vacuous against the REAL tree**

The Form A/B detectors are registry-keyed, so no fragile char-class tuning is needed. Verify against the live tree: (1) the whole walker passes with the allowlists as written (all real cross-section references — `event`/`gear`/`scheduleTimes`/`index`/`hotels`/`transport`/`rooms` — are accounted for); (2) plant a `/^GENERAL SESSION/.test(col0)` line in a NON-allowlisted, non-owning file (e.g. `dress.ts`) and confirm the backstop FAILS naming `dress.ts` + `GENERAL SESSION`; (3) plant `label === "GENERAL SESSION"` and confirm the same; (4) confirm a benign `["HOTEL","DATES"].includes(x)` in that file does NOT fail. Remove the plants. Document the verification in the commit body.

- [ ] **Step 4: Run the full parser suite to confirm no behavior change**

Run: `pnpm vitest run tests/parser/`
Expected: PASS, including `exporterFixtures.test.ts`, `unknownSection.test.ts`, `_metaKnownSectionsRegistry.test.ts`, and the new walker.

- [ ] **Step 5: Commit**

```bash
git add tests/parser/_metaKnownSectionsWalker.test.ts
git commit --no-verify -m "$(cat <<'EOF'
test(parser): known-sections source walker meta-test (fails-by-default)

Filesystem-walks lib/parser/blocks/*.ts + index.ts. PRIMARY enforced gates:
annotation-or-allowlist, non-empty, EXACT registry subset. Import-link nudge
(rooms exempt). REGISTRY-KEYED backstop (Form A equality/startsWith/includes +
Form B anchored regex, fires only on a KNOWN_SECTION_HEADERS token the file does
not own/allowlist). TOKEN-SPECIFIC RAW_HEADER_REGEX_ALLOWLIST (whole-diff R1 —
rooms/event/gear/index cross-section boundary refs only; own-token matchers exempt
via ownTokens) + EQUALITY_LITERAL_ALLOWLIST (scheduleTimes DATES, index CLIENT).
no-orphan FAILS (whole-diff R1) for entries outside EXPECTED_ORPHANS (the 8:
VENUES, HOTELS, IN HOUSE AV, LUNCH SESSION, COI, DOCUMENT FOLDER LINK, PULL SHEET,
FOYER). 8-part non-vacuity proof incl. negative controls + token-specific proof (h). Declared accepted residual (import != use; exotic /
unregistered matchers) in the header comment. Verified the backstop fails on a
planted /^GENERAL SESSION/.test(col0) in a non-allowlisted file and does NOT fire
on a terminator array.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2kqoCRpKPwLc4BMynrXwt
EOF
)"
```

---

### Task 15: Full-suite + typecheck + lint + format green

**Files:** none (verification task).

- [ ] **Step 1: Typecheck** — `pnpm typecheck` (vitest strips types; `next build`/quality-tsc catches TS errors). Expected: no new errors. Common trap: `as const` token arrays are `readonly string[]` — factory params are `readonly string[]`, compatible.
- [ ] **Step 2: Lint** — `pnpm lint`. Expected: no new errors. Watch for unused-import on the factory in `index.ts`/`transport.ts` (Tasks 10/11 wire a real use — a pre-filter const — to avoid this).
- [ ] **Step 3: Format** — `pnpm format:check`. Expected: clean (run `pnpm format` if not; `--no-verify` commits bypass the prettier hook).
- [ ] **Step 4: Full parser suite** — `pnpm vitest run tests/parser/`. Expected: all green, no snapshot regen.
- [ ] **Step 5: Full suite** — `pnpm test` (or the sharded CI equivalent). Expected: no NEW failures vs merge-base (pre-existing env-only DB/live-project failures excepted — verify each is env-only, not caused by this diff). Commit nothing (verification only); if a fix is needed, fold it into the responsible task's commit.

---

### Task 16: Self-review

**Files:** none.

- [ ] **Step 1: Spec coverage** — walk spec §2 goal (4 walker duties), §4 survey (every parser row → a task), §5 registry additions (Task 2), §6 walker gates (Task 14), §7 behavior preservation (equivalence tests + suite green), §10 meta-test inventory (Task 14 creates, retains pin), §12 acceptance criteria. List any gap; add a task if missing.
- [ ] **Step 2: Anti-tautology** — confirm each token test asserts against the parser's EXPORTED const (data source), not against a container that renders both; confirm equivalence tests enumerate accepted + rejected forms derived from the real matcher, not hardcoded to trivially pass. Confirm the walker's non-vacuity proof actually rejects bogus input.
- [ ] **Step 3: Type/name consistency** — `SECTION_HEADER_TOKENS`, `METADATA_FIELD_TOKENS`, `buildCol0HeaderRe`, `buildCol0HeaderAltRe`, `matchesSectionHeader`, `IMPORT_LINK_EXEMPT`, `RAW_HEADER_REGEX_ALLOWLIST`, `NO_SECTION_OPENER`, `EXPECTED_ORPHANS` — spelled identically across all tasks. Fix inline.

---

### Task 17: Adversarial review (cross-model, Codex)

**Files:** none (review gate — MANDATORY, AGENTS.md writing-plans additions).

- [ ] **Step 1** — after self-review, invoke the `adversarial-review` skill with Codex as the opposing CLI on THIS plan file. REVIEWER ONLY. Iterate to APPROVE (no round budget). Apply the response ladder: class-sweep every finding; ship a structural defense after 3+ same-vector rounds.
- [ ] **Step 2** — do NOT proceed to execution handoff until Codex returns APPROVE.

---

## Self-Review (author checklist — completed at plan-write time)

**1. Spec coverage:** §2 (goal) → Tasks 3–14; §3 (definitions/no-opener) → Task 14 allowlist; §4 (survey) → one task per parser (3–13); §5 (registry adds) → Task 2; §6 (walker) → Task 14; §7 (behavior preservation) → equivalence tests in each parser task + Task 15; §8 (guard conditions) → covered by matcher tests; §10 (meta-test inventory) → Task 14; §11 (advisory lock N/A) → Global Constraints; §12 (acceptance) → Tasks 14–16. No gaps.

**2. Placeholder scan:** no TBD/TODO; every code step shows real code; the two "tune the regex against real source" steps (Task 14 §3) are inherent to a source-text guard and carry an explicit verification procedure (plant `/^\|\s*CATERING\s*\|/`, confirm fail, remove) — not a placeholder.

**3. Type consistency:** const/function names verified identical across tasks (Task 16 §3 list).
