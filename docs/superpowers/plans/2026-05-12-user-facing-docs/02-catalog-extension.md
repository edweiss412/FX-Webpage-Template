# Phase B — Catalog extension + alignment

**Scope:** Extend `MessageCatalogEntry` with three new nullable string fields (`title`, `longExplanation`, `helpHref`). Reconcile the live catalog with master-spec §12.4's admin-log-only contract via a derived parser (`scripts/extract-admin-log-only-codes.ts`). Ship the catalog meta-test (test #2) and the catalog-alignment meta-test (test #17).

**Prereqs:** Phase A complete (strict sequential per 00-overview.md). `lib/messages/lookup.ts` and `lib/messages/catalog.ts` from M8/M9/M10 state.

**Tasks:** B.1 → B.5 (5 tasks). Task order **r3-reordered** so the parser (now B.2) lands before the catalog-alignment subtask (now B.3) — the alignment is driven by the parser's derived set, not a hand-list:

1. **B.1** — extend `MessageCatalogEntry` + seed all entries with `null` M12 fields.
2. **B.2** — `scripts/extract-admin-log-only-codes.ts` parser + unit tests (was B.3 in r2).
3. **B.3** — catalog-alignment subtask (was B.2 in r2). Now derives the canonical set from B.2's parser output; aligns existing entries to null AND adds null-stub entries for derived codes that are absent from live `lib/messages/catalog.ts`. **Hard gate** — B.3 close-out requires every derived code to either be aligned or null-stubbed.
4. **B.4** — `lib/messages/catalogDocsValidator.ts` + catalog meta-test #2 (forced-fixture coverage; live-catalog assertion deferred to E.13).
5. **B.5** — catalog-alignment meta-test #17 (structural guard).

**r3 reordering rationale:** in r2, B.2 maintained a hand-list of 14 codes, while B.5 derived 23+ from master-spec. The mismatch meant B.5's `expect(entry).toBeDefined()` failed for ~8 codes that master-spec named but the live catalog (and B.2's hand-list) didn't cover — Phase B couldn't both close out AND defer the missing-code fix. r3 makes B.2 (parser) land first; B.3 (alignment) uses parser output as the canonical set, so B.5's gate is satisfiable at close-out.

---

### Task B.1: Extend `MessageCatalogEntry` with three new fields

**Files:**
- Modify: `lib/messages/catalog.ts` (extend `MessageCatalogEntry` type; do NOT mutate any existing entries' user-facing copy yet — that's Task B.3 in the r3 reordering)
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

This is the **mechanical seed** — every existing entry gets `null` for all three new fields. Phase E will populate `title`/`longExplanation`/`helpHref` on Doug-facing admin entries via per-page content commits. Task B.3 (r3 reordered — the alignment subtask) keeps these `null` on the admin-log-only entries it derives from the parser and also nulls their `dougFacing`/`crewFacing`/`helpfulContext`.

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

### Task B.2: `scripts/extract-admin-log-only-codes.ts` parser + unit test

(**r3 reordering** — this task was numbered B.3 in r2. It must land BEFORE the catalog-alignment subtask, which is now B.3.)

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
    expect(codes).toContain("STALE_WRITE_ABORTED");
    expect(codes).toContain("CONCURRENT_SYNC_SKIPPED");
    expect(codes).toContain("DIAGRAMS_EMBEDDED_CAP_EXCEEDED");
    expect(codes).toContain("PENDING_SNAPSHOT_ROLLBACK_STUCK");
    // Negative: STALE_MANUAL_REPLAY_ABORTED is Doug-facing per master-spec line 2724.
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
// M12 Phase B.2 — parses master-spec §12.4 markdown and returns the canonical
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
    if (cells.length < 4) continue;

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

Run: `pnpm dlx tsx scripts/extract-admin-log-only-codes.ts > /tmp/derived-admin-log-only-codes.txt && cat /tmp/derived-admin-log-only-codes.txt`

Expected: prints ~15-25 codes. Save the output — Task B.3 (alignment) consumes it as the canonical set. The output MUST NOT include `STALE_MANUAL_REPLAY_ABORTED` (Doug-facing per master-spec line 2724).

- [ ] **Step 6: Commit**

```bash
git add scripts/extract-admin-log-only-codes.ts tests/messages/extract-admin-log-only-codes.test.ts
git commit -m "feat(messages): admin-log-only derivation parser for master-spec §12.4 (Task B.2)"
```

---

### Task B.3: Catalog-alignment subtask (derives canonical set from B.2 parser; HARD GATE)

**Files:**
- Modify: `lib/messages/catalog.ts` (set six user-facing fields `null` on each derived admin-log-only code; ADD null-stub entries for derived codes that are absent from the live catalog)
- Modify: `tests/messages/catalog-schema-extension.test.ts` (extend with the alignment test driven by B.2's derived set)

**r3 design (replaces r2's hand-list approach):** Task B.3 is the **hard gate** for master-spec / catalog alignment. It runs the B.2 parser against the live master spec, takes the derived set as the canonical admin-log-only code list, then for each derived code:

1. **If the code exists in `lib/messages/catalog.ts`** with any non-null user-facing field → set all six to `null` (`dougFacing`, `crewFacing`, `helpfulContext`, `title`, `longExplanation`, `helpHref`).
2. **If the code is absent from `lib/messages/catalog.ts`** → ADD a null-stub entry. Master-spec line 2691 requires every admin-log-only code to be emitted to `sync_log` for operator debugging; the runtime needs the entry to format that log row. The stub shape is mechanical:

```ts
  UNEXPECTED_PARENT: {
    code: "UNEXPECTED_PARENT",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
```

3. **Do NOT remove existing entries** — they exist for `sync_log` structured logging even when nulled.

This makes B.5's `expect(entry).toBeDefined()` assertion satisfiable for every derived code at Phase B close-out. No follow-up commits are needed for the M12 admin-scope (Phase 2 may amend master-spec for the operator-only / crew-facing edge cases like `LINK_CROSS_SHOW_REUSE`, which the parser correctly does not derive).

**Known examples** (from running B.2's parser against the live master-spec as of `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` r-latest):

- **Existing entries to null (14, verified):** `STALE_WRITE_ABORTED`, `STALE_PUSH_ABORTED`, `CONCURRENT_SYNC_SKIPPED`, `STAGED_PARSE_REVISION_RACE`, `STAGED_PARSE_REVISION_RACE_COOLDOWN`, `WEBHOOK_NOOP_ALREADY_SYNCED`, `ASSET_RECOVERY_REVISION_DRIFT`, `ASSET_RECOVERY_DRIFT_COOLDOWN`, `WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, `LOCK_OWNERSHIP_ASSERTION_FAILED`, `DIAGRAMS_TAB_MISSING`, `DIAGRAMS_EMBEDDED_CAP_EXCEEDED`, `PENDING_SNAPSHOT_ROLLBACK_STUCK`, `PENDING_SNAPSHOT_PROMOTE_STUCK`.

- **New entries to add as null stubs (~7, verified):** `UNEXPECTED_PARENT`, `TYPO_NORMALIZED`, `WIZARD_FINALIZE_BATCHES_PENDING`, `SHOW_REALTIME_SUBSCRIPTION_FAILED`, `SHOW_REALTIME_JWT_RENEWED`, `SLUG_COLLISION_EXHAUSTED`, `BRANCH_PROTECTION_DRIFT`. (Plus any others the parser derives — the implementer runs the parser at execution time and aligns whatever it returns.)

**Explicitly NOT in scope** (master-spec drift, out of M12):

- `LINK_CROSS_SHOW_REUSE` — master-spec Doug cell starts with `(operator log only` (line 2846), which is NON-canonical per master-spec line 2692. The parser correctly does not derive it. M12 does NOT add or modify this entry. A future commit may amend master-spec to use `(admin log only` if appropriate.
- `STALE_MANUAL_REPLAY_ABORTED` — master-spec line 2724 carries explicit Doug-facing copy. The parser correctly does not derive it. Phase E gives it `title` / `longExplanation` / `helpHref` like other Doug-facing entries (see spec r11 amendment in §5.2).

- [ ] **Step 1: Write the failing test**

Add to `tests/messages/catalog-schema-extension.test.ts`:

```ts
import { extractAdminLogOnlyCodes } from "@/scripts/extract-admin-log-only-codes";

describe("Catalog alignment with master-spec admin-log-only contract (Task B.3 hard gate)", () => {
  // Single source of truth — derive at test time from the live master spec
  // via the B.2 parser. This makes the gate insensitive to hand-list drift.
  let derivedCodes: string[] = [];
  beforeAll(async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const masterSpec = readFileSync(
      join(process.cwd(), "docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md"),
      "utf8",
    );
    derivedCodes = extractAdminLogOnlyCodes(masterSpec);
  });

  it("derives a non-empty set (sanity check)", () => {
    expect(derivedCodes.length).toBeGreaterThan(10);
  });

  it("every derived code exists in MESSAGE_CATALOG (no missing-from-catalog drift)", () => {
    const missing = derivedCodes.filter(
      (code) => !(code in (MESSAGE_CATALOG as Record<string, unknown>)),
    );
    expect(missing, `derived but missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("every derived code has all six user-facing fields null", () => {
    const violations: string[] = [];
    for (const code of derivedCodes) {
      const entry = (MESSAGE_CATALOG as Record<string, any>)[code];
      if (!entry) continue; // covered by the missing test above
      for (const field of [
        "dougFacing",
        "crewFacing",
        "helpfulContext",
        "title",
        "longExplanation",
        "helpHref",
      ] as const) {
        if (entry[field] !== null) {
          violations.push(`${code}.${field} = ${JSON.stringify(entry[field])} (expected null)`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/messages/catalog-schema-extension.test.ts -t "Task B.3 hard gate"`
Expected: FAIL — the "every derived code exists" test fails for codes missing from the live catalog AND the "all six user-facing fields null" test fails for entries with non-null user-facing fields.

- [ ] **Step 3: Generate the canonical derived set**

```bash
pnpm dlx tsx scripts/extract-admin-log-only-codes.ts > /tmp/m12-derived-admin-log-only.txt
sort -u /tmp/m12-derived-admin-log-only.txt
```

Save the output. Every line is a code that must be in the catalog with all six user-facing fields `null` after B.3 commits.

- [ ] **Step 4: Hand-edit `lib/messages/catalog.ts` for each derived code**

For each code in the derived set:

(a) **If already present in catalog** — set six user-facing fields to `null`. Example for `STALE_WRITE_ABORTED` (currently at `lib/messages/catalog.ts:175-181`):

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

(b) **If absent from catalog** — append a null-stub entry near logically-related entries. Example for `UNEXPECTED_PARENT` (parser-derived, missing from live catalog):

```ts
  UNEXPECTED_PARENT: {
    code: "UNEXPECTED_PARENT",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
```

Process every derived code mechanically — do not skip any. The post-script verification (Step 5) catches missed entries.

- [ ] **Step 5: Run all tests + impacted downstream tests**

Run: `pnpm typecheck && pnpm test tests/messages/`
Expected: B.3 hard gate tests PASS. Existing `_metaAdminAlertCatalog.test.ts` continues to pass (AlertBanner default-warning rule at `components/admin/AlertBanner.tsx:39-50` only renders entries with non-null `dougFacing` — now `null` for all derived codes).

Also check that the admin layout doesn't break — its `messageFor("ADMIN_SESSION_LOOKUP_FAILED")` call returns the existing crewFacing fallback (`ADMIN_SESSION_LOOKUP_FAILED` is NOT in the derived set, so it keeps its current shape).

- [ ] **Step 6: Manual regression sweep**

Run the existing AdminBanner / AdminParsePanel tests:

```bash
pnpm test tests/components/admin/
```

If any tests fail, they were testing drifted behavior (per spec §5.2 distinction note). Update those tests in the same commit — they should now assert the entries do NOT surface to Doug.

- [ ] **Step 7: Commit**

```bash
git add lib/messages/catalog.ts tests/messages/catalog-schema-extension.test.ts tests/components/admin/
git commit -m "feat(messages): align all derived admin-log-only codes (existing+new) to null per master-spec §12.4 (Task B.3 — hard gate)"
```

---

### Task B.4: Catalog meta-test (test #2)

**Files:**
- Create: `lib/messages/catalogDocsValidator.ts` (NEW — the validator module the meta-test imports)
- Create: `tests/messages/_metaErrorCatalogDocs.test.ts`

Per spec §7.1 test 2 — full contract gate: predicate-entries must have all three M12 fields non-null AND helpHref shape `/help/*`; non-predicate-entries must have all three M12 fields **null**. The contract has two halves; the biconditional `predicate ↔ allM12FieldsNonNull` is necessary but NOT sufficient.

**r3 fix — biconditional alone is too weak (Codex r2 finding):** the r2 forced fixture "crew-only entry with helpHref populated" had `crewFacing` set, `helpHref` set, but `title` and `longExplanation` null. `predicate(e)` is false (crew-only). `allM12FieldsNonNull(e)` is also false (title/longExplanation null). The biconditional `false === false` trivially holds, even though the entry violates the contract (a non-predicate entry must have ALL THREE M12 fields null, not just two of three). r3 replaces the biconditional helper with a `contractViolations(entry): string[]` function that returns the specific violation messages for both halves, and fixtures assert exact violations.

**r2 carryover — real red→green TDD:** the original r1 task defined the predicate functions *inside* the test file, so the test passed immediately once B.1's type extension existed (no source-of-truth module to fail). r2 extracts the predicate logic into `lib/messages/catalogDocsValidator.ts`; the test imports it; first run fails with module-not-found (the genuine red state). Step 3 implements the module minimally.

- [ ] **Step 1: Write the failing test**

```ts
// tests/messages/_metaErrorCatalogDocs.test.ts
import { describe, it, expect } from "vitest";
import { type MessageCatalogEntry } from "@/lib/messages/catalog";
import {
  predicate,
  allM12FieldsNonNull,
  helpHrefShapeOk,
  contractViolations,
  HELP_HREF_RE,
} from "@/lib/messages/catalogDocsValidator";

/**
 * Spec §5.2 full contract:
 *
 *   predicate(e) := e.severity !== "info" AND e.dougFacing != null
 *
 *   IF predicate(e) THEN: e.title != null AND e.longExplanation != null
 *                         AND e.helpHref != null AND helpHrefShapeOk(e.helpHref)
 *
 *   IF NOT predicate(e) THEN: e.title === null AND e.longExplanation === null
 *                             AND e.helpHref === null
 *
 * B.4 commits ONLY the forced-fixture coverage below (TDD green).
 * Phase E Task E.13 extends this file with the LIVE-catalog full-contract
 * assertion (importing `contractViolations` from the same validator module).
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

describe("Catalog meta-test (test #2 — predicate-entry contract)", () => {
  it("predicate-entry with all three M12 fields populated + valid helpHref → no violations", () => {
    const e = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      title: "Sync race",
      longExplanation: "A newer sync already won. Refresh.",
      helpHref: "/help/admin/parse-warnings#STALE",
    });
    expect(predicate(e)).toBe(true);
    expect(contractViolations(e)).toEqual([]);
  });

  it("predicate-entry missing helpHref → violation 'predicate entry: helpHref is null'", () => {
    const e = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      title: "Sync race",
      longExplanation: "A newer sync already won.",
      // helpHref intentionally null
    });
    expect(predicate(e)).toBe(true);
    expect(contractViolations(e)).toContain("predicate entry: helpHref is null");
  });

  it("predicate-entry with invalid helpHref shape → violation cites the bad value", () => {
    const e = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      title: "Sync race",
      longExplanation: "A newer sync already won.",
      helpHref: "https://example.com/help/errors",
    });
    expect(predicate(e)).toBe(true);
    const violations = contractViolations(e);
    expect(violations.some((v) => v.includes("must match /help/*"))).toBe(true);
  });

  it("severity-info entry is non-predicate even when dougFacing populated", () => {
    const e = makeEntry({ severity: "info", dougFacing: "FYI." });
    expect(predicate(e)).toBe(false);
    expect(contractViolations(e)).toEqual([]); // info-tier: all three null is correct
  });
});

describe("Catalog meta-test (test #2 — non-predicate-entry contract: ALL THREE must be null)", () => {
  it("crew-only entry with all three M12 fields null → no violations", () => {
    const e = makeEntry({ crewFacing: "Crew message." });
    expect(predicate(e)).toBe(false);
    expect(contractViolations(e)).toEqual([]);
  });

  it("crew-only entry with stray helpHref (title+longExplanation null) → violation 'non-predicate entry: helpHref must be null'", () => {
    // THIS is the bug class the r2 biconditional could not catch.
    const e = makeEntry({
      crewFacing: "Crew message.",
      helpHref: "/help/errors#X",
    });
    expect(predicate(e)).toBe(false);
    expect(allM12FieldsNonNull(e)).toBe(false); // biconditional trivially holds
    // contractViolations correctly catches the stray helpHref:
    expect(contractViolations(e)).toContain("non-predicate entry: helpHref must be null");
  });

  it("crew-only entry with stray title (longExplanation+helpHref null) → violation 'non-predicate entry: title must be null'", () => {
    const e = makeEntry({
      crewFacing: "Crew message.",
      title: "Stray title",
    });
    expect(predicate(e)).toBe(false);
    expect(contractViolations(e)).toContain("non-predicate entry: title must be null");
  });

  it("crew-only entry with stray longExplanation → violation cites it", () => {
    const e = makeEntry({
      crewFacing: "Crew message.",
      longExplanation: "Stray long explanation.",
    });
    expect(predicate(e)).toBe(false);
    expect(contractViolations(e)).toContain("non-predicate entry: longExplanation must be null");
  });

  it("admin-log-only entry (all six user-facing fields null) → no violations", () => {
    const e = makeEntry({ severity: "warning" }); // dougFacing/crewFacing/etc all null
    expect(predicate(e)).toBe(false); // dougFacing is null
    expect(contractViolations(e)).toEqual([]);
  });
});

describe("Catalog meta-test (test #2 — helpHref shape sanity)", () => {
  it("rejects non-/help/ shapes (https://, anchor-only, relative, wrong root)", () => {
    expect(helpHrefShapeOk("https://example.com/help/errors")).toBe(false);
    expect(helpHrefShapeOk("#STALE_WRITE")).toBe(false);
    expect(helpHrefShapeOk("errors/STALE")).toBe(false);
    expect(helpHrefShapeOk("/admin/help")).toBe(false);
  });

  it("accepts /help/* shapes (path, hash, query)", () => {
    expect(helpHrefShapeOk("/help/errors")).toBe(true);
    expect(helpHrefShapeOk("/help/admin/parse-warnings#STALE_WRITE")).toBe(true);
    expect(helpHrefShapeOk("/help/onboarding?step=2")).toBe(true);
  });

  it("accepts null (non-predicate entries explicitly carry helpHref:null)", () => {
    expect(helpHrefShapeOk(null)).toBe(true);
  });

  it("HELP_HREF_RE is exported for re-use by E.13 live-catalog assertion", () => {
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
// M12 Phase B.4 — full contract validator for the catalog-docs meta-tests
// (test #2 at B.4, live-catalog assertion at E.13).
//
// Centralized here so:
//   1. B.4's red state is a real module-not-found.
//   2. E.13's live-catalog assertion imports the SAME functions — one source
//      of truth for the contract.
//   3. The full contract — both halves of the biconditional PLUS the shape
//      gate — is a single function (`contractViolations`) that returns
//      specific violation strings. Tests can assert exact violation messages,
//      so a fixture cannot pass by accident.

import type { MessageCatalogEntry } from "@/lib/messages/catalog";

/** /help/* hrefs are the only shape M12 accepts. */
export const HELP_HREF_RE = /^\/help\/.+/;

/** Spec §5.2 predicate: an entry is "Doug-facing" for /help/ purposes when severity is NOT info AND dougFacing is populated. */
export function predicate(entry: MessageCatalogEntry): boolean {
  return entry.severity !== "info" && entry.dougFacing !== null;
}

/** Convenience: all three M12 docs fields populated. Used as the predicate-side check in `contractViolations`. */
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

/**
 * Full contract validator. Returns an empty array when the entry satisfies the
 * spec §5.2 contract. Returns one or more violation strings (specific to each
 * field) otherwise.
 *
 * Predicate-entries (Doug-facing) must have all three M12 fields non-null AND
 * helpHref matching /help/*. Non-predicate-entries (crew-only, info-tier, or
 * admin-log-only) must have all three M12 fields exactly `null`.
 */
export function contractViolations(entry: MessageCatalogEntry): string[] {
  const violations: string[] = [];
  if (predicate(entry)) {
    if (entry.title === null) violations.push("predicate entry: title is null");
    if (entry.longExplanation === null) {
      violations.push("predicate entry: longExplanation is null");
    }
    if (entry.helpHref === null) {
      violations.push("predicate entry: helpHref is null");
    } else if (!HELP_HREF_RE.test(entry.helpHref)) {
      violations.push(`predicate entry: helpHref must match /help/* (got ${JSON.stringify(entry.helpHref)})`);
    }
  } else {
    if (entry.title !== null) violations.push("non-predicate entry: title must be null");
    if (entry.longExplanation !== null) {
      violations.push("non-predicate entry: longExplanation must be null");
    }
    if (entry.helpHref !== null) {
      violations.push("non-predicate entry: helpHref must be null");
    }
  }
  return violations;
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

Run: `pnpm typecheck && pnpm test tests/messages/_metaErrorCatalogDocs.test.ts`
Expected: PASS — 13 forced-fixture cases (4 predicate + 5 non-predicate + 4 shape). All exercise `contractViolations`; the crew-only-with-stray-helpHref case from Codex r2 is now caught.

**Note on E.13 deferral (r6 — r4's H.6 was removed):** at B.4 commit time, the live catalog still has Doug-facing entries with `title`/`longExplanation`/`helpHref` all null (Phase E.5–E.11 backfills haven't landed). A live full-contract assertion would FAIL on every such entry. E.13 lands AFTER Phase E backfills, writes the live-catalog assertion (importing `contractViolations` from this module), and commits red→green. Forced fixtures from B.4 stay green throughout — they're synthetic and don't depend on live state.

- [ ] **Step 5: Commit (green state)**

```bash
git add lib/messages/catalogDocsValidator.ts tests/messages/_metaErrorCatalogDocs.test.ts
git commit -m "test(messages): catalog meta-test #2 — validator module + 13 forced fixtures (predicate + non-predicate + shape); live-catalog assertion deferred to E.13 (Task B.4 — TDD red→green)"
```

**Note:** Phase E Task E.13 extends this file with the live-catalog biconditional assertion as part of its own TDD red→green loop (writing the assertion + closing any final backfill gaps in one commit). The forced fixtures stay; the live-catalog assertion is E.13's deliverable.

---

### Task B.5: Catalog-alignment meta-test (test #17)

**Files:**
- Create: `tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts`

Per spec §7.1 test 17. **Independent structural guard** — a separate test file from B.3's inline alignment assertions, so that if B.3's tests are ever loosened (e.g., refactored to skip codes), B.5 still gates Phase B close-out and any future drift on master-spec edits.

Reads master-spec §12.4 via `extract-admin-log-only-codes.ts`; asserts every derived code has all six user-facing fields `null` in the live catalog. Different from B.3 in scope: B.3 is the implementation-driving assertion (used during the alignment work itself); B.5 is the standalone meta-test that runs in `pnpm test tests/messages/` as the long-term canary.

- [ ] **Step 1: Write the test (passes once B.3 commits — this is verification-of-alignment, not red→green for new logic)**

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
    it(`${code}: live catalog entry exists AND has all 6 user-facing fields null`, () => {
      const entry = (MESSAGE_CATALOG as Record<string, any>)[code];
      expect(entry, `${code} present in master spec but missing from live catalog — B.3 must add a null stub`).toBeDefined();
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

**Why this isn't a red→green TDD task in the usual sense:** B.3's hard gate already established alignment correctness; B.5 codifies that guarantee as a separate, long-running meta-test. B.5 commits in a green state. If B.5 fails when first run, it means B.3 missed a derived code — return to B.3, complete the alignment (which is the hard gate's job), then re-run B.5.

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts`
Expected: PASS for every code in the derived set. Any FAIL signals B.3 missed a code — fix B.3, do not loosen B.5.

- [ ] **Step 3: Commit**

```bash
git add tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts
git commit -m "test(messages): catalog-alignment meta-test #17 — long-running canary on master-spec derivation (Task B.5)"
```

---

## Phase B close-out

After B.1 – B.5 commits land:

- [ ] `MessageCatalogEntry` has three new nullable fields; every entry has them present (B.1)
- [ ] `extract-admin-log-only-codes.ts` parses master-spec §12.4 and emits the canonical set; 8 unit fixtures + 1 live-spec assertion PASS (B.2)
- [ ] **Hard gate (r3):** Every code in B.2's derived set exists in `lib/messages/catalog.ts` (either pre-existing or newly null-stubbed by B.3) AND has all six user-facing fields `null` (B.3). No follow-up commits deferred.
- [ ] `lib/messages/catalogDocsValidator.ts` exports `predicate`, `allM12FieldsNonNull`, `helpHrefShapeOk`, `contractViolations`, `HELP_HREF_RE`; Test #2 (forced-fixture coverage, 13 cases) PASSES. Live-catalog full-contract assertion lives in **Task E.13** (per r6 — r4's H.6 was removed); E.13 imports `contractViolations` from this same module (no inline redefinition).
- [ ] Test #17 (catalog-alignment meta-test, B.5) PASSES
- [ ] `pnpm test tests/messages/` is **fully green** at Phase B close-out (no documented-red exception — r5 fix per AGENTS.md invariant #1)
- [ ] **Hand off to Phase C** ([03-time-utility.md](03-time-utility.md))

Phase B introduces ~5 commits, ~150 LOC of new code + ~50 LOC of catalog mutations.
