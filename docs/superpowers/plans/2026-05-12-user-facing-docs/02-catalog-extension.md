# Phase B — Catalog extension + alignment

**Scope:** Extend `MessageCatalogEntry` with three new nullable string fields (`title`, `longExplanation`, `helpHref`). Reconcile the live catalog with master-spec §12.4's admin-log-only contract via a derived parser (`scripts/extract-admin-log-only-codes.ts`). Ship the catalog meta-test (test #2) and the catalog-alignment meta-test (test #17).

**Prereqs:** Phase A complete (strict sequential per 00-overview.md). `lib/messages/lookup.ts` and `lib/messages/catalog.ts` from M8/M9/M10 state.

**Tasks:** B.1 → B.5 (5 tasks). B.1 must land before B.2 (alignment writes nulls to the extended schema). B.3 + B.4 + B.5 can interleave once B.2 commits.

---

### Task B.1: Extend `MessageCatalogEntry` with three new fields

**Files:**
- Modify: `lib/messages/catalog.ts` (extend `MessageCatalogEntry` type; do NOT mutate any existing entries yet — that's Task B.2)
- Modify: `lib/messages/lookup.ts` (re-export remains unchanged; widened return type travels automatically)

Per spec §5.2 / AC-12.5: the additive extension keeps `messageFor` signature identical; every existing caller compiles unchanged.

- [ ] **Step 1: Write the failing test**

Create `tests/messages/catalog-schema-extension.test.ts`:

```ts
import { describe, it, expect, expectTypeOf } from "vitest";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";

describe("MessageCatalogEntry M12 extension", () => {
  it("type declares title, longExplanation, helpHref as `string | null`", () => {
    expectTypeOf<MessageCatalogEntry["title"]>().toEqualTypeOf<string | null>();
    expectTypeOf<MessageCatalogEntry["longExplanation"]>().toEqualTypeOf<string | null>();
    expectTypeOf<MessageCatalogEntry["helpHref"]>().toEqualTypeOf<string | null>();
  });

  it("every live catalog entry has the three new fields present (initially null)", () => {
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      expect(entry, `${code} missing title field`).toHaveProperty("title");
      expect(entry, `${code} missing longExplanation field`).toHaveProperty("longExplanation");
      expect(entry, `${code} missing helpHref field`).toHaveProperty("helpHref");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/messages/catalog-schema-extension.test.ts`
Expected: FAIL — type properties don't exist; live entries don't have the fields.

- [ ] **Step 3: Extend the `MessageCatalogEntry` type**

Modify `lib/messages/catalog.ts:1-8`:

```ts
// lib/messages/catalog.ts
export type MessageCatalogEntry = {
  code: string;
  severity?: "info" | "warning";
  dougFacing: string | null;
  crewFacing: string | null;
  followUp: string | null;
  helpfulContext: string | null;
  title: string | null;             // NEW in M12 (Phase B.1) — short heading on /help/errors#<code>
  longExplanation: string | null;   // NEW in M12 (Phase B.1) — body on /help/errors#<code>
  helpHref: string | null;          // NEW in M12 (Phase B.1) — deep-link to /help/...
};
```

- [ ] **Step 4: Add `title: null`, `longExplanation: null`, `helpHref: null` to every live entry**

This is the **mechanical seed** — every existing entry gets `null` for all three new fields. Phase E will populate `title`/`longExplanation`/`helpHref` on Doug-facing admin entries via per-page content commits. Phase B.2 will keep these `null` on the admin-log-only entries that Task B.2 also nulls `dougFacing`/`crewFacing`/`helpfulContext` on.

Use a small migration script — do NOT hand-edit 100+ entries. Create `scripts/seed-m12-catalog-fields.ts`:

```ts
// scripts/seed-m12-catalog-fields.ts — M12 Phase B.1 one-shot
//
// Reads lib/messages/catalog.ts and adds `title: null, longExplanation: null,
// helpHref: null` to every entry that doesn't already have them. Idempotent —
// re-running on an already-seeded catalog is a no-op.
//
// r2 fix: original regex anchored on `helpfulContext:[^\n]*,` only matched
// single-line helpfulContext values; ~50% of live entries use the multiline form
//
//     helpfulContext:
//       "long string here",
//
// which the regex skipped silently. This implementation parses the file
// line-by-line and inserts the three new fields immediately BEFORE each entry's
// closing `  },` line — agnostic to the inner field shapes.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "lib/messages/catalog.ts");
const lines = readFileSync(path, "utf8").split("\n");

const ENTRY_OPEN_RE = /^ {2}[A-Z][A-Z0-9_]*: \{$/;
const ENTRY_CLOSE = "  },";
const TITLE_RE = /^ +title:/;
const ALREADY_LAST_CLOSE = "  }"; // last entry in some styles

const out: string[] = [];
let inEntry = false;
let entryHasTitle = false;

for (const line of lines) {
  if (!inEntry && ENTRY_OPEN_RE.test(line)) {
    inEntry = true;
    entryHasTitle = false;
    out.push(line);
    continue;
  }
  if (inEntry) {
    if (TITLE_RE.test(line)) entryHasTitle = true;
    if (line === ENTRY_CLOSE || line === ALREADY_LAST_CLOSE) {
      if (!entryHasTitle) {
        out.push("    title: null,");
        out.push("    longExplanation: null,");
        out.push("    helpHref: null,");
      }
      out.push(line);
      inEntry = false;
      continue;
    }
    out.push(line);
    continue;
  }
  out.push(line);
}

writeFileSync(path, out.join("\n"), "utf8");
console.log("Seeded title / longExplanation / helpHref on catalog entries.");
```

Run once:

```bash
pnpm dlx tsx scripts/seed-m12-catalog-fields.ts
```

**Post-script verification (r2-added):** After running, confirm every catalog entry was seeded. The fail-loud check:

```bash
node -e '
const src = require("node:fs").readFileSync("lib/messages/catalog.ts","utf8");
const opens = (src.match(/^ {2}[A-Z][A-Z0-9_]*: \{$/gm) || []).length;
const titles = (src.match(/^ {4}title: null,$/gm) || []).length;
if (opens !== titles) {
  console.error(`MISMATCH: ${opens} entry opens vs ${titles} title:null inserts`);
  process.exit(1);
}
console.log(`OK: ${opens} entries seeded`);
'
```

Expected: `OK: <N> entries seeded` with N matching the count of `[A-Z]+:` keys in `MESSAGE_CATALOG`. If MISMATCH, the seed script missed entries — fix the script before commit.

- [ ] **Step 5: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test tests/messages/catalog-schema-extension.test.ts`
Expected: PASS.

Also run the existing catalog-completeness test to confirm no regression:

```bash
pnpm test tests/messages/_metaAdminAlertCatalog.test.ts
```

Expected: PASS (the schema widening doesn't break that meta-test).

- [ ] **Step 6: Commit**

```bash
git add lib/messages/catalog.ts scripts/seed-m12-catalog-fields.ts tests/messages/catalog-schema-extension.test.ts
git commit -m "feat(messages): extend MessageCatalogEntry with title/longExplanation/helpHref (Task B.1)"
```

---

### Task B.2: Catalog-alignment subtask (set admin-log-only entries to `dougFacing: null`)

**Files:**
- Modify: `lib/messages/catalog.ts` (set `dougFacing: null`, `crewFacing: null`, `helpfulContext: null` on every admin-log-only code per master-spec §12.4)

Per spec AC-12.35 / r8 catalog alignment. Task B.3 writes the derivation parser and Task B.5 the meta-test. For Task B.2, hand-align named codes that **exist** in the live catalog AND need user-facing fields nulled; B.5's meta-test catches drift the hand-alignment misses AND surfaces codes that are present in master-spec but missing from the catalog.

**Codes to align (r2-reconciled against master-spec §12.4 + live `lib/messages/catalog.ts`):**

`STALE_WRITE_ABORTED`, `STALE_PUSH_ABORTED`, `CONCURRENT_SYNC_SKIPPED`, `STAGED_PARSE_REVISION_RACE`, `STAGED_PARSE_REVISION_RACE_COOLDOWN`, `WEBHOOK_NOOP_ALREADY_SYNCED`, `ASSET_RECOVERY_REVISION_DRIFT`, `ASSET_RECOVERY_DRIFT_COOLDOWN`, `WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, `LOCK_OWNERSHIP_ASSERTION_FAILED`, `DIAGRAMS_TAB_MISSING`, `DIAGRAMS_EMBEDDED_CAP_EXCEEDED`, `PENDING_SNAPSHOT_ROLLBACK_STUCK`, `PENDING_SNAPSHOT_PROMOTE_STUCK`. (**14 codes.**)

**Removed from the r1 list (r2-fix):**

- `STALE_MANUAL_REPLAY_ABORTED` — master-spec line 2724 carries explicit Doug-facing copy ("This manual sync is stale — a newer parse has already been applied. Refresh the page to see the current state.") and the live catalog has non-null `dougFacing` at `lib/messages/catalog.ts:192-200`. Nulling this code would violate AGENTS.md invariant #7 (spec is canonical). It is Doug-facing; Phase E gives it `title` / `longExplanation` / `helpHref` like other Doug-facing entries.
- `LINK_CROSS_SHOW_REUSE`, `UNEXPECTED_PARENT`, `TYPO_NORMALIZED` — present in master-spec §12.4 but **absent from live `lib/messages/catalog.ts`** (grep confirmed). Phase B.2 cannot "align" entries that don't exist. B.5's meta-test surfaces them via `expect(entry).toBeDefined()` failure — a structural drift signal that needs a follow-up commit to either add entries or amend master spec. Tracking these is out of B.2's scope; B.5 is the right surface to flag them.

Count drop 18 → 14 is intentional and reconciled against live state. The B.5 meta-test still derives from the full master-spec set, so the four removed codes are not lost — they surface via the meta-test as either "live catalog out of sync (missing)" or "Doug-facing as designed" depending on the derivation outcome.

- [ ] **Step 1: Write the failing test**

Add to `tests/messages/catalog-schema-extension.test.ts`:

```ts
describe("Catalog alignment with master-spec admin-log-only contract (Task B.2)", () => {
  // 14 codes that exist in the live catalog AND need user-facing fields nulled
  // per master-spec §12.4. Task B.5's meta-test covers the full derivation set.
  const NAMED_ADMIN_LOG_ONLY = [
    "STALE_WRITE_ABORTED", "STALE_PUSH_ABORTED",
    "CONCURRENT_SYNC_SKIPPED", "STAGED_PARSE_REVISION_RACE",
    "STAGED_PARSE_REVISION_RACE_COOLDOWN", "WEBHOOK_NOOP_ALREADY_SYNCED",
    "ASSET_RECOVERY_REVISION_DRIFT", "ASSET_RECOVERY_DRIFT_COOLDOWN",
    "WIZARD_SESSION_SUPERSEDED_DURING_SCAN", "LOCK_OWNERSHIP_ASSERTION_FAILED",
    "DIAGRAMS_TAB_MISSING", "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
    "PENDING_SNAPSHOT_ROLLBACK_STUCK", "PENDING_SNAPSHOT_PROMOTE_STUCK",
  ] as const;

  for (const code of NAMED_ADMIN_LOG_ONLY) {
    it(`${code}: dougFacing / crewFacing / helpfulContext / title / longExplanation / helpHref are all null`, () => {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
      expect(entry, `${code} expected to exist in live catalog`).toBeDefined();
      expect(entry.dougFacing).toBeNull();
      expect(entry.crewFacing).toBeNull();
      expect(entry.helpfulContext).toBeNull();
      expect(entry.title).toBeNull();
      expect(entry.longExplanation).toBeNull();
      expect(entry.helpHref).toBeNull();
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/messages/catalog-schema-extension.test.ts -t "Task B.2"`
Expected: 14 FAIL — each named code has non-null `dougFacing` (or `helpfulContext`) per the drifted catalog state.

- [ ] **Step 3: Hand-edit each named entry**

For each of the 14 codes in `lib/messages/catalog.ts`, set the user-facing fields to `null`. Example for `STALE_WRITE_ABORTED` (currently at `lib/messages/catalog.ts:175-181`):

```ts
  STALE_WRITE_ABORTED: {
    code: "STALE_WRITE_ABORTED",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
```

(Repeat for all 14 entries; do NOT remove the entries — they exist for `sync_log` structured logging per master-spec line 2691.)

- [ ] **Step 4: Run tests + impacted downstream tests**

Run: `pnpm typecheck && pnpm test tests/messages/`
Expected: B.2 tests PASS. Existing `_metaAdminAlertCatalog.test.ts` continues to pass (its predicate excludes severity-info; B.2 codes are warning-or-default, but the AlertBanner default-warning rule at `components/admin/AlertBanner.tsx:39-50` only renders entries with non-null `dougFacing` — which is now `null` for all 14).

Also check that the admin layout doesn't break — its `messageFor("ADMIN_SESSION_LOOKUP_FAILED")` call returns the existing crewFacing fallback (master-spec line 2691 explicitly normalizes that entry differently — verify by re-reading `lib/messages/catalog.ts:148-154`; `ADMIN_SESSION_LOOKUP_FAILED` is NOT in the admin-log-only list, so it keeps its current shape).

- [ ] **Step 5: Manual regression sweep**

Run the existing AdminBanner / AdminParsePanel tests:

```bash
pnpm test tests/components/admin/
```

If any tests fail, they were testing drifted behavior (per spec §5.2 distinction note). Update those tests in the same commit — they should now assert the entries do NOT surface to Doug.

- [ ] **Step 6: Commit**

```bash
git add lib/messages/catalog.ts tests/messages/catalog-schema-extension.test.ts tests/components/admin/
git commit -m "feat(messages): align 14 admin-log-only codes to dougFacing:null per master-spec §12.4 (Task B.2)"
```

---

### Task B.3: `scripts/extract-admin-log-only-codes.ts` parser + unit test

**Files:**
- Create: `scripts/extract-admin-log-only-codes.ts`
- Create: `tests/messages/extract-admin-log-only-codes.test.ts`

Per spec AC-12.35 derivation rule + r10 normalization clarification + **r2 fix**: parse master-spec §12.4 markdown and emit the canonical admin-log-only set.

**r2 fix — table shape (CRITICAL):** the master-spec §12.4 table is **5 columns**, not 4:

```
| Code | Where it surfaces | Doug-facing message | Crew-facing message | Follow-up |
```

After splitting a row on `|` and dropping the leading/trailing empty slots, the cells indexed as `cells[0..4]` map to `Code / Where it surfaces / Doug / Crew / Follow-up`. The Doug-facing cell is **`cells[2]`**, not `cells[1]`. The original r1 parser read `cells[1]` (the "Where it surfaces" column), which derives 0 codes from the live master spec.

**r2 fix — both Doug AND Crew cells must be null-shaped:** per master-spec line 2691 the admin-log-only contract requires BOTH cells to be null. Checking only Doug would mis-classify codes like `CSRF_DENIED` (Doug-only operator hint, but non-null Crew copy) as admin-log-only.

**r2 fix — section slicing (defensive):** the master spec contains other markdown tables (DDL, RPC tables, etc.). Slice to §12.4 only by anchoring on `### 12.4 ` and ending at the next `## ` or `### ` heading.

Three accepted null-cell shapes (master-spec line 2692): (a) literal em-dash `—`, (b) empty cell, (c) parenthetical starting `(admin log only`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/messages/extract-admin-log-only-codes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractAdminLogOnlyCodes } from "@/scripts/extract-admin-log-only-codes";

// All fixtures use the real 5-column shape: Code | Where it surfaces | Doug | Crew | Follow-up
describe("extractAdminLogOnlyCodes — null-cell normalization (Doug AND Crew)", () => {
  it("classifies literal em-dash in both Doug and Crew as admin-log-only", () => {
    const src = "| `X` | sync race | — | — | none |";
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });

  it("classifies empty Doug + Crew cells as admin-log-only", () => {
    const src = "| `X` | sync race |  |  | none |";
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });

  it("classifies '(admin log only — hint)' parenthetical in Doug + em-dash Crew as admin-log-only", () => {
    const src = "| `X` | sync race | (admin log only — transient) | — | none |";
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });

  it("does NOT classify a real Doug-facing message as admin-log-only", () => {
    const src = "| `X` | sync race | Refresh the admin page. | — | Doug -> refresh |";
    expect(extractAdminLogOnlyCodes(src)).toEqual([]);
  });

  it("does NOT classify codes with non-null Crew copy (Doug-only operator hint, Crew sees something)", () => {
    // CSRF_DENIED-shape: Doug is operator-only paren, but Crew has user-facing copy
    const src = "| `X` | login | (operator log only — debug) | Try again. | Crew -> retry |";
    expect(extractAdminLogOnlyCodes(src)).toEqual([]);
  });

  it("does NOT classify pseudo-null sentinels (null / none / n/a) in Doug", () => {
    // master-spec line 2692 requires em-dash / empty / `(admin log only` — these are not.
    expect(extractAdminLogOnlyCodes("| `X` | s | null | — | none |")).toEqual([]);
    expect(extractAdminLogOnlyCodes("| `X` | s | none | — | none |")).toEqual([]);
    expect(extractAdminLogOnlyCodes("| `X` | s | n/a | — | none |")).toEqual([]);
  });

  it("does NOT classify retired (strikethrough) rows like ~~`CODE`~~", () => {
    const src = "| ~~`X`~~ | sync race | — | — | — |";
    expect(extractAdminLogOnlyCodes(src)).toEqual([]);
  });

  it("does NOT classify rows outside §12.4 (e.g., DDL or RPC tables) when section slicing is on", () => {
    // A 5-column table that LOOKS like an admin-log-only row but sits in a different section.
    const src = [
      "## 4. Database",
      "",
      "| `Y` | some surface | — | — | none |",
      "",
      "### 12.4 User-facing message catalog",
      "",
      "| `X` | sync race | — | — | none |",
      "",
      "## 13. Bug reporting",
    ].join("\n");
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });
});

describe("extractAdminLogOnlyCodes — live master spec", () => {
  it("derives a non-empty set from docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const masterSpec = readFileSync(
      join(process.cwd(), "docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md"),
      "utf8",
    );
    const codes = extractAdminLogOnlyCodes(masterSpec);
    expect(codes.length).toBeGreaterThan(10);
    // Spot-check a known set per spec AC-12.35:
    expect(codes).toContain("STALE_WRITE_ABORTED");
    expect(codes).toContain("CONCURRENT_SYNC_SKIPPED");
    expect(codes).toContain("DIAGRAMS_EMBEDDED_CAP_EXCEEDED");
    expect(codes).toContain("PENDING_SNAPSHOT_ROLLBACK_STUCK");
    // Negative spot-check: STALE_MANUAL_REPLAY_ABORTED is Doug-facing per master-spec line 2724.
    expect(codes).not.toContain("STALE_MANUAL_REPLAY_ABORTED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/messages/extract-admin-log-only-codes.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the parser**

```ts
// scripts/extract-admin-log-only-codes.ts
//
// M12 Phase B.3 — parses master-spec §12.4 markdown and returns the canonical
// admin-log-only code set per master-spec line 2691.
//
// r2 fixes:
//   - §12.4 table is 5 columns: Code | Where it surfaces | Doug | Crew | Follow-up
//     so the Doug cell is cells[2] (not cells[1]).
//   - Both Doug AND Crew cells must match a null shape (master-spec line 2691).
//   - Section slicing: only rows BETWEEN `### 12.4 ` and the next `## ` or `### `
//     heading are considered, so DDL / RPC tables elsewhere can't pollute.
//
// Three accepted null-cell shapes (master-spec line 2692):
//   (a) literal em-dash `—`
//   (b) empty cell
//   (c) parenthetical starting `(admin log only`
//
// Other sentinels (`null`, `none`, `n/a`, `(operator log only`) are NOT recognized.

function sliceSection124(markdown: string): string {
  const lines = markdown.split("\n");
  const startIdx = lines.findIndex((l) => /^### 12\.4 /.test(l));
  // No §12.4 heading? Treat whole input as the section (so unit-test fixtures
  // that don't include the heading still work).
  if (startIdx === -1) return markdown;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^(## |### )/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

function isNullShape(cell: string): boolean {
  if (cell === "—") return true;
  if (cell === "") return true;
  if (/^\(admin log only(\b| —)/.test(cell)) return true;
  return false;
}

/**
 * Scan markdown text for §12.4-shaped 5-column table rows and return the code
 * names (the leading `\`CODE\`` cell) whose BOTH Doug-facing and Crew-facing
 * message cells are one of the three canonical null shapes.
 */
export function extractAdminLogOnlyCodes(markdown: string): string[] {
  const section = sliceSection124(markdown);
  const codes: string[] = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    if (line.includes("---")) continue;

    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    // 5-column table — need cells[0..4] (Code / Surface / Doug / Crew / Follow-up).
    // Allow >5 in case of embedded `|` characters (table writers sometimes
    // escape with `\|`); the indices we care about are stable.
    if (cells.length < 4) continue;

    // First cell must look like `\`CODE\`` (rejects ~~`CODE`~~ retired rows).
    const codeMatch = cells[0].match(/^`([A-Z][A-Z0-9_]*)`$/);
    if (!codeMatch) continue;

    const dougCell = cells[2];
    const crewCell = cells[3];

    if (isNullShape(dougCell) && isNullShape(crewCell)) {
      codes.push(codeMatch[1]);
    }
  }
  return codes;
}

// CLI entry point — print the codes one per line for shell use.
if (require.main === module) {
  const path = process.argv[2] ??
    "docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md";
  const fs = require("node:fs");
  const codes = extractAdminLogOnlyCodes(fs.readFileSync(path, "utf8"));
  for (const c of codes) console.log(c);
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm typecheck && pnpm test tests/messages/extract-admin-log-only-codes.test.ts`
Expected: PASS — all 8 unit cases + the live-spec assertion pass.

- [ ] **Step 5: Manually inspect output against the live master spec**

Run: `pnpm dlx tsx scripts/extract-admin-log-only-codes.ts`
Expected: prints ~12-25 codes. The set MUST include all 14 from Task B.2 (`STALE_WRITE_ABORTED`, …, `PENDING_SNAPSHOT_PROMOTE_STUCK`) and MUST NOT include `STALE_MANUAL_REPLAY_ABORTED` (Doug-facing per master-spec line 2724).

Cross-check: the parser may also derive codes that B.2 didn't hand-align — typically because they're in master-spec §12.4 but missing from `lib/messages/catalog.ts` (e.g., `LINK_CROSS_SHOW_REUSE` if its Doug cell becomes `(admin log only`, `UNEXPECTED_PARENT`, `TYPO_NORMALIZED`). B.5's meta-test surfaces those via `expect(entry).toBeDefined()` — flag in the commit message so a follow-up commit either adds them to the catalog as null stubs or amends master-spec.

If the output includes codes NOT in Task B.2's hand-list, those split two ways:
- **Code exists in live catalog but B.2 missed nulling it** → align it in the same B.2 follow-up commit.
- **Code is in master-spec but missing from `lib/messages/catalog.ts`** (e.g., `UNEXPECTED_PARENT`, `TYPO_NORMALIZED`) → flag in commit message; B.5's meta-test will surface as a `expect(entry).toBeDefined()` failure that drives a separate follow-up commit (add as null stubs or amend master spec). Phase B.3 does not block on this — the parser correctly derived; the catalog/spec drift is the next layer's problem.

- [ ] **Step 6: Commit**

```bash
git add scripts/extract-admin-log-only-codes.ts tests/messages/extract-admin-log-only-codes.test.ts
git commit -m "feat(messages): admin-log-only derivation parser for master-spec §12.4 (Task B.3)"
```

---

### Task B.4: Catalog meta-test (test #2)

**Files:**
- Create: `lib/messages/catalogDocsValidator.ts` (NEW — the validator module the meta-test imports)
- Create: `tests/messages/_metaErrorCatalogDocs.test.ts`

Per spec §7.1 test 2 — biconditional predicate ↔ "all three M12 fields non-null." Includes 7 forced-fixture cases for anti-tautology (covers biconditional AND helpHref shape).

**r2 fix — real red→green TDD:** the original r1 task defined the predicate functions *inside* the test file, so the test passed immediately once B.1's type extension existed (no source-of-truth module to fail). r2 extracts the predicate logic into `lib/messages/catalogDocsValidator.ts`; the test imports it; first run fails with module-not-found (the genuine red state). Step 3 implements the module minimally.

- [ ] **Step 1: Write the failing test**

```ts
// tests/messages/_metaErrorCatalogDocs.test.ts
import { describe, it, expect } from "vitest";
import { type MessageCatalogEntry } from "@/lib/messages/catalog";
import {
  predicate,
  allM12FieldsNonNull,
  helpHrefShapeOk,
  HELP_HREF_RE,
} from "@/lib/messages/catalogDocsValidator";

/**
 * The r8 biconditional predicate (spec §5.2):
 *   predicate := severity !== "info" AND dougFacing != null
 *   biconditional: predicate ↔ (title !== null AND longExplanation !== null AND helpHref !== null)
 *
 * B.4 commits ONLY the forced-fixture coverage below (TDD green).
 * Phase E Task E.13 (per r6 — r4's H.6 was removed) extends this file with the
 * live-catalog biconditional assertion after all Phase E backfills land.
 */

function makeEntry(overrides: Partial<MessageCatalogEntry>): MessageCatalogEntry {
  return {
    code: "SYNTHETIC",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
    ...overrides,
  };
}

describe("Catalog meta-test (test #2 — biconditional forced fixtures)", () => {
  it("fixture: severity warning + dougFacing + all M12 fields → biconditional holds (predicate ↔ allM12)", () => {
    const e = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      title: "Sync race",
      longExplanation: "A newer sync already won. Refresh.",
      helpHref: "/help/admin/parse-warnings#STALE",
    });
    expect(predicate(e)).toBe(true);
    expect(allM12FieldsNonNull(e)).toBe(true);
    expect(predicate(e) === allM12FieldsNonNull(e)).toBe(true);
  });

  it("fixture: severity warning + dougFacing + helpHref null → biconditional violated (predicate fires; allM12 false)", () => {
    const e = makeEntry({ severity: "warning", dougFacing: "Refresh." });
    expect(predicate(e)).toBe(true);
    expect(allM12FieldsNonNull(e)).toBe(false);
    expect(predicate(e) === allM12FieldsNonNull(e)).toBe(false);
  });

  it("fixture: severity info + dougFacing + helpHref null → biconditional holds (info-tier exempt)", () => {
    const e = makeEntry({ severity: "info", dougFacing: "Just FYI." });
    expect(predicate(e)).toBe(false);
    expect(allM12FieldsNonNull(e)).toBe(false);
    expect(predicate(e) === allM12FieldsNonNull(e)).toBe(true);
  });

  it("fixture: crew-only entry (dougFacing null) with all M12 fields null → biconditional holds (crew deferred to phase 2)", () => {
    const e = makeEntry({ crewFacing: "Crew message." });
    expect(predicate(e)).toBe(false);
    expect(allM12FieldsNonNull(e)).toBe(false);
    expect(predicate(e) === allM12FieldsNonNull(e)).toBe(true);
  });

  it("fixture: crew-only entry with helpHref populated → biconditional violated", () => {
    const e = makeEntry({
      crewFacing: "Crew message.",
      helpHref: "/help/errors#X",
    });
    expect(predicate(e)).toBe(false);
    expect(allM12FieldsNonNull(e)).toBe(false); // title/longExplanation still null
    // Even though both are false the inequality should not fire — verify still equal
    expect(predicate(e) === allM12FieldsNonNull(e)).toBe(true);
  });
});

describe("Catalog meta-test (test #2 — helpHref shape forced fixtures)", () => {
  it("rejects non-/help/ helpHref values (https://, anchor-only, relative)", () => {
    expect(helpHrefShapeOk("https://example.com/help/errors")).toBe(false);
    expect(helpHrefShapeOk("#STALE_WRITE")).toBe(false);
    expect(helpHrefShapeOk("errors/STALE")).toBe(false);
    expect(helpHrefShapeOk("/admin/help")).toBe(false);
  });

  it("accepts /help/* helpHref values (path, hash, query)", () => {
    expect(helpHrefShapeOk("/help/errors")).toBe(true);
    expect(helpHrefShapeOk("/help/admin/parse-warnings#STALE_WRITE")).toBe(true);
    expect(helpHrefShapeOk("/help/onboarding?step=2")).toBe(true);
  });

  it("accepts null (entries without a help link)", () => {
    expect(helpHrefShapeOk(null)).toBe(true);
  });

  it("HELP_HREF_RE is exposed for re-use by E.13 live-catalog assertion", () => {
    expect(HELP_HREF_RE).toBeInstanceOf(RegExp);
    expect("/help/x".match(HELP_HREF_RE)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED — module not found)**

Run: `pnpm test tests/messages/_metaErrorCatalogDocs.test.ts`
Expected: FAIL with "Cannot find module '@/lib/messages/catalogDocsValidator'" or equivalent resolution error. This is the genuine red state; the test cannot be satisfied without creating the module.

- [ ] **Step 3: Implement `lib/messages/catalogDocsValidator.ts` (minimal GREEN)**

```ts
// lib/messages/catalogDocsValidator.ts
//
// M12 Phase B.4 — predicate + biconditional helpers for the catalog-docs
// meta-tests (test #2 at B.4, live-catalog assertion at E.13).
//
// Centralized here (rather than inlined in the test file) so:
//   1. B.4's red state is a real module-not-found.
//   2. E.13 can import the same predicate for its live-catalog assertion,
//      keeping a single source of truth for the biconditional rule.

import type { MessageCatalogEntry } from "@/lib/messages/catalog";

/**
 * /help/* hrefs are the only shape M12 accepts. External URLs, anchor-only
 * fragments, and non-/help/ paths are rejected so the deep-link walker can
 * resolve every catalog entry to a docs page.
 */
export const HELP_HREF_RE = /^\/help\/.+/;

/**
 * Spec §5.2 predicate: an entry is "Doug-facing" for /help/ purposes when its
 * severity is NOT info AND its dougFacing copy is populated.
 *
 * Entries with severity:"info" are advisory and don't need help-page coverage.
 * Entries with dougFacing:null are crew-only or admin-log-only (Phase 2 / §12.4
 * admin-log-only contract) and also don't need help-page coverage.
 */
export function predicate(entry: MessageCatalogEntry): boolean {
  return entry.severity !== "info" && entry.dougFacing !== null;
}

/** All three M12 docs fields populated. Used as the right side of the biconditional. */
export function allM12FieldsNonNull(entry: MessageCatalogEntry): boolean {
  return (
    entry.title !== null &&
    entry.longExplanation !== null &&
    entry.helpHref !== null
  );
}

/** Help href shape gate — null is OK (no link); non-null must match /help/* . */
export function helpHrefShapeOk(href: string | null): boolean {
  if (href === null) return true;
  return HELP_HREF_RE.test(href);
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

Run: `pnpm typecheck && pnpm test tests/messages/_metaErrorCatalogDocs.test.ts`
Expected: PASS — 9 forced-fixture cases (5 biconditional + 3 helpHref shape + 1 HELP_HREF_RE export). No live-catalog assertion at this commit; that's E.13.

**Note on E.13 deferral (r6 — r4's H.6 was removed):** at B.4 commit time, the live catalog still has Doug-facing entries with `title`/`longExplanation`/`helpHref` all null (Phase E.5–E.11 backfills haven't landed). A live biconditional assertion would FAIL on every such entry. E.13 lands AFTER Phase E backfills, writes the live-catalog assertion (importing `predicate` + `allM12FieldsNonNull` from this module), and commits red→green. Forced fixtures from B.4 stay green throughout — they're synthetic and don't depend on live state.

- [ ] **Step 5: Commit (green state)**

```bash
git add lib/messages/catalogDocsValidator.ts tests/messages/_metaErrorCatalogDocs.test.ts
git commit -m "test(messages): catalog meta-test #2 — validator module + 9 forced fixtures; live-catalog biconditional deferred to E.13 (Task B.4 — TDD red→green)"
```

**Note:** Phase E Task E.13 extends this file with the live-catalog biconditional assertion as part of its own TDD red→green loop (writing the assertion + closing any final backfill gaps in one commit). The forced fixtures stay; the live-catalog assertion is E.13's deliverable.

---

### Task B.5: Catalog-alignment meta-test (test #17)

**Files:**
- Create: `tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts`

Per spec §7.1 test 17. Reads master-spec §12.4 via `extract-admin-log-only-codes.ts`; asserts every derived code has all six user-facing fields `null` in the live catalog.

- [ ] **Step 1: Write the failing test**

```ts
// tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { extractAdminLogOnlyCodes } from "@/scripts/extract-admin-log-only-codes";

describe("Catalog ↔ master-spec admin-log-only alignment (test #17)", () => {
  const masterSpec = readFileSync(
    join(process.cwd(), "docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md"),
    "utf8",
  );
  const derivedCodes = extractAdminLogOnlyCodes(masterSpec);

  it("derives a non-empty set", () => {
    expect(derivedCodes.length).toBeGreaterThan(0);
  });

  for (const code of derivedCodes) {
    it(`${code}: live catalog entry has all 6 user-facing fields null`, () => {
      const entry = (MESSAGE_CATALOG as Record<string, any>)[code];
      // If the code exists in master spec but not in the live catalog, that's
      // a different drift class (master spec adds without runtime) — flag it.
      expect(entry, `${code} present in master spec but missing from live catalog`).toBeDefined();
      expect(entry.dougFacing, `${code}.dougFacing should be null per master-spec admin-log-only`).toBeNull();
      expect(entry.crewFacing, `${code}.crewFacing should be null`).toBeNull();
      expect(entry.helpfulContext, `${code}.helpfulContext should be null`).toBeNull();
      expect(entry.title, `${code}.title should be null`).toBeNull();
      expect(entry.longExplanation, `${code}.longExplanation should be null`).toBeNull();
      expect(entry.helpHref, `${code}.helpHref should be null`).toBeNull();
    });
  }
});
```

- [ ] **Step 2: Run test to verify it passes (Task B.2's hand-alignment should cover the derived set)**

Run: `pnpm test tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts`
Expected: PASS for every code Task B.2's hand-list covered. If any code FAILS, it's a Task B.2 miss — return to Task B.2, align that code, re-run.

This back-and-forth is intentional: the meta-test is the structural guard that catches enumeration drift. Task B.2's hand-list is necessarily non-exhaustive; B.5's meta-test enforces the canonical set.

- [ ] **Step 3: Commit**

```bash
git add tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts
git commit -m "test(messages): catalog-alignment meta-test #17 — master-spec derivation (Task B.5)"
```

---

## Phase B close-out

After B.1 – B.5 commits land:

- [ ] `MessageCatalogEntry` has three new nullable fields; every entry has them present
- [ ] 14 hand-aligned admin-log-only codes have all six user-facing fields `null` (B.2 list). The master-spec full set may be larger; B.5's meta-test is the structural guard.
- [ ] Any master-spec admin-log-only codes that derive via B.3 but are missing from the live catalog (e.g., `UNEXPECTED_PARENT`, `TYPO_NORMALIZED`) are flagged by B.5's `expect(entry).toBeDefined()` failure for a follow-up commit — NOT silently passed
- [ ] `extract-admin-log-only-codes.ts` parses master-spec §12.4 and emits the canonical set
- [ ] Test #2 (catalog meta-test) PASSES with forced-fixture coverage only — no live-catalog biconditional assertion exists at Phase B. The live-catalog biconditional lives in **Task E.13** (per r6 — r4's H.6 was removed); E.13 commits the assertion alongside its final catalog backfills in a red→green TDD loop.
- [ ] Test #17 (catalog-alignment) PASSES
- [ ] `pnpm test tests/messages/` is **fully green** at Phase B close-out (no documented-red exception — r5 fix per AGENTS.md invariant #1)
- [ ] **Hand off to Phase C** ([03-time-utility.md](03-time-utility.md))

Phase B introduces ~5 commits, ~150 LOC of new code + ~50 LOC of catalog mutations.
