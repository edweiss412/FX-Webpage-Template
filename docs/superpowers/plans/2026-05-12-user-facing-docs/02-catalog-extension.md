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
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "lib/messages/catalog.ts");
const src = readFileSync(path, "utf8");

// Pattern: each entry ends with a line containing only `},` or `  },`.
// We insert the three new fields immediately before that closing brace,
// but ONLY when the entry doesn't already have them.
const replaced = src.replace(
  /(\n {4}code: "([A-Z_]+)",[\s\S]*?\n {4}helpfulContext:[^\n]*,)(\n {2}}(?:,)?)/g,
  (_match, head, _code, tail) => {
    if (head.includes("title:")) return head + tail; // already seeded
    return (
      head +
      "\n    title: null,\n    longExplanation: null,\n    helpHref: null," +
      tail
    );
  },
);

writeFileSync(path, replaced, "utf8");
console.log("Seeded title / longExplanation / helpHref on catalog entries.");
```

Run once:

```bash
pnpm dlx tsx scripts/seed-m12-catalog-fields.ts
```

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

Per spec AC-12.35 / r8 catalog alignment. The 14+ codes named at spec-write time are a non-exhaustive list — Task B.3 will write the derivation parser and Task B.5 the meta-test. For Task B.2, hand-align the named codes; B.5's meta-test will fail for any drift the hand-alignment misses.

**Codes to align (from spec AC-12.35 + master-spec line 2691 examples + r9 additions):**

`STALE_WRITE_ABORTED`, `STALE_PUSH_ABORTED`, `STALE_MANUAL_REPLAY_ABORTED`, `CONCURRENT_SYNC_SKIPPED`, `STAGED_PARSE_REVISION_RACE`, `STAGED_PARSE_REVISION_RACE_COOLDOWN`, `WEBHOOK_NOOP_ALREADY_SYNCED`, `ASSET_RECOVERY_REVISION_DRIFT`, `ASSET_RECOVERY_DRIFT_COOLDOWN`, `WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, `LOCK_OWNERSHIP_ASSERTION_FAILED`, `LINK_CROSS_SHOW_REUSE`, `UNEXPECTED_PARENT`, `DIAGRAMS_TAB_MISSING`, `TYPO_NORMALIZED`, `DIAGRAMS_EMBEDDED_CAP_EXCEEDED`, `PENDING_SNAPSHOT_ROLLBACK_STUCK`, `PENDING_SNAPSHOT_PROMOTE_STUCK`.

- [ ] **Step 1: Write the failing test**

Add to `tests/messages/catalog-schema-extension.test.ts`:

```ts
describe("Catalog alignment with master-spec admin-log-only contract (Task B.2)", () => {
  // Subset of the canonical set; Task B.5's meta-test covers the full derivation.
  const NAMED_ADMIN_LOG_ONLY = [
    "STALE_WRITE_ABORTED", "STALE_PUSH_ABORTED", "STALE_MANUAL_REPLAY_ABORTED",
    "CONCURRENT_SYNC_SKIPPED", "STAGED_PARSE_REVISION_RACE",
    "STAGED_PARSE_REVISION_RACE_COOLDOWN", "WEBHOOK_NOOP_ALREADY_SYNCED",
    "ASSET_RECOVERY_REVISION_DRIFT", "ASSET_RECOVERY_DRIFT_COOLDOWN",
    "WIZARD_SESSION_SUPERSEDED_DURING_SCAN", "LOCK_OWNERSHIP_ASSERTION_FAILED",
    "LINK_CROSS_SHOW_REUSE", "UNEXPECTED_PARENT", "DIAGRAMS_TAB_MISSING",
    "TYPO_NORMALIZED", "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
    "PENDING_SNAPSHOT_ROLLBACK_STUCK", "PENDING_SNAPSHOT_PROMOTE_STUCK",
  ] as const;

  for (const code of NAMED_ADMIN_LOG_ONLY) {
    it(`${code}: dougFacing / crewFacing / helpfulContext / title / longExplanation / helpHref are all null`, () => {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
      expect(entry).toBeDefined();
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
Expected: 18 FAIL — each named code has non-null `dougFacing` (or `helpfulContext`) per the drifted catalog state.

- [ ] **Step 3: Hand-edit each named entry**

For each of the 18 codes in `lib/messages/catalog.ts`, set the user-facing fields to `null`. Example for `STALE_WRITE_ABORTED` (currently at `lib/messages/catalog.ts:175-181`):

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

(Repeat for all 18 entries; do NOT remove the entries — they exist for `sync_log` structured logging per master-spec line 2691.)

- [ ] **Step 4: Run tests + impacted downstream tests**

Run: `pnpm typecheck && pnpm test tests/messages/`
Expected: B.2 tests PASS. Existing `_metaAdminAlertCatalog.test.ts` continues to pass (its predicate excludes severity-info; B.2 codes are warning-or-default, but the AlertBanner default-warning rule at `components/admin/AlertBanner.tsx:39-50` only renders entries with non-null `dougFacing` — which is now `null` for all 18).

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
git commit -m "feat(messages): align 18 admin-log-only codes to dougFacing:null per master-spec §12.4 (Task B.2)"
```

---

### Task B.3: `scripts/extract-admin-log-only-codes.ts` parser + unit test

**Files:**
- Create: `scripts/extract-admin-log-only-codes.ts`
- Create: `tests/messages/extract-admin-log-only-codes.test.ts`

Per spec AC-12.35 derivation rule + r10 normalization clarification: parse master-spec §12.4 markdown and emit the canonical admin-log-only set. Three accepted null-cell shapes (master-spec line 2692): (a) literal em-dash `—`, (b) empty cell, (c) parenthetical starting `(admin log only`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/messages/extract-admin-log-only-codes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractAdminLogOnlyCodes } from "@/scripts/extract-admin-log-only-codes";

describe("extractAdminLogOnlyCodes — null-cell normalization", () => {
  it("classifies literal em-dash as admin-log-only", () => {
    const src = "| `X` | — | — | none | none |";
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });

  it("classifies empty Doug cell as admin-log-only", () => {
    const src = "| `X` |  | — | none | none |";
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });

  it("classifies '(admin log only — hint)' parenthetical as admin-log-only", () => {
    const src = "| `X` | (admin log only — transient race) | — | none | none |";
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });

  it("does NOT classify a real Doug-facing message as admin-log-only", () => {
    const src = "| `X` | Refresh the admin page. | — | Doug -> refresh | none |";
    expect(extractAdminLogOnlyCodes(src)).toEqual([]);
  });

  it("does NOT classify pseudo-null sentinels", () => {
    // master-spec line 2692 requires em-dash / empty / `(admin log only` — these are not.
    expect(extractAdminLogOnlyCodes("| `X` | null | — | none | none |")).toEqual([]);
    expect(extractAdminLogOnlyCodes("| `X` | none | — | none | none |")).toEqual([]);
    expect(extractAdminLogOnlyCodes("| `X` | n/a | — | none | none |")).toEqual([]);
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
// Three accepted null-cell shapes (master-spec line 2692):
//   (a) literal em-dash `—`
//   (b) empty cell
//   (c) parenthetical starting `(admin log only`
//
// Other sentinels (`null`, `none`, `n/a`) are NOT recognized.

/**
 * Scan markdown text for §12.4-shaped table rows and return the code names
 * (the leading `\`CODE\`` cell) whose Doug-facing-message cell is one of the
 * three canonical null shapes.
 */
export function extractAdminLogOnlyCodes(markdown: string): string[] {
  const codes: string[] = [];
  for (const line of markdown.split("\n")) {
    // Only consider table rows: must start and end with `|`.
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    // Skip header / divider rows (---).
    if (line.includes("---")) continue;

    // Split on `|`, drop the empty leading/trailing slots.
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;

    // First cell must look like `\`CODE\``.
    const codeMatch = cells[0].match(/^`([A-Z][A-Z0-9_]*)`$/);
    if (!codeMatch) continue;

    const dougCell = cells[1];
    // Three accepted null shapes:
    const isEmDash = dougCell === "—";
    const isEmpty = dougCell === "";
    const isAdminLogParen = /^\(admin log only(\b| —)/.test(dougCell);

    if (isEmDash || isEmpty || isAdminLogParen) {
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
Expected: PASS.

- [ ] **Step 5: Manually inspect output against the live master spec**

Run: `pnpm dlx tsx scripts/extract-admin-log-only-codes.ts`
Expected: prints ~15-25 codes including all 18 from Task B.2 plus any others master-spec also marks admin-log-only.

If the output includes codes NOT in Task B.2's hand-list, those are misses that Task B.5's meta-test will catch — flag them in the commit message so a follow-up commit aligns them.

- [ ] **Step 6: Commit**

```bash
git add scripts/extract-admin-log-only-codes.ts tests/messages/extract-admin-log-only-codes.test.ts
git commit -m "feat(messages): admin-log-only derivation parser for master-spec §12.4 (Task B.3)"
```

---

### Task B.4: Catalog meta-test (test #2)

**Files:**
- Create: `tests/messages/_metaErrorCatalogDocs.test.ts`

Per spec §7.1 test 2 — biconditional predicate ↔ "all three M12 fields non-null." Includes 5 forced-fixture cases for anti-tautology.

- [ ] **Step 1: Write the failing test**

```ts
// tests/messages/_metaErrorCatalogDocs.test.ts
import { describe, it, expect } from "vitest";
import { type MessageCatalogEntry } from "@/lib/messages/catalog";

const HELP_HREF_RE = /^\/help\/.+/;

/**
 * The r8 biconditional predicate (spec §5.2):
 *   predicate := severity !== "info" AND dougFacing != null
 *   biconditional: predicate ↔ (title !== null AND longExplanation !== null AND helpHref !== null)
 *
 * B.4 commits ONLY the forced-fixture coverage below (TDD green).
 * Phase E Task E.13 (per r6 — r4's H.6 was removed) extends this file with the live-catalog biconditional
 * assertion after all Phase E backfills land.
 */
function predicate(entry: MessageCatalogEntry): boolean {
  return entry.severity !== "info" && entry.dougFacing !== null;
}

function allM12FieldsNonNull(entry: MessageCatalogEntry): boolean {
  return entry.title !== null && entry.longExplanation !== null && entry.helpHref !== null;
}

describe("Catalog meta-test (test #2 — biconditional forced fixtures)", () => {
  // Anti-tautology forced fixtures — synthetic entries proving each exclusion band.
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

  it("fixture: severity warning + dougFacing + all M12 fields → PASS (predicate fires; biconditional matches)", () => {
    const e = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      title: "Sync race",
      longExplanation: "A newer sync already won. Refresh.",
      helpHref: "/help/admin/parse-warnings#STALE",
    });
    expect(predicate(e) === allM12FieldsNonNull(e)).toBe(true);
  });

  it("fixture: severity warning + dougFacing + helpHref null → FAIL (predicate fires but biconditional broken)", () => {
    const e = makeEntry({ severity: "warning", dougFacing: "Refresh." });
    expect(predicate(e) === allM12FieldsNonNull(e)).toBe(false);
  });

  it("fixture: severity info + dougFacing + helpHref null → PASS (info-tier exempt)", () => {
    const e = makeEntry({ severity: "info", dougFacing: "Just FYI." });
    expect(predicate(e) === allM12FieldsNonNull(e)).toBe(true);
  });

  it("fixture: crew-only entry (dougFacing null) with all M12 fields null → PASS (crew deferred to phase 2)", () => {
    const e = makeEntry({ crewFacing: "Crew message." });
    expect(predicate(e) === allM12FieldsNonNull(e)).toBe(true);
  });

  it("fixture: crew-only entry with helpHref populated → FAIL (biconditional violation)", () => {
    const e = makeEntry({
      crewFacing: "Crew message.",
      helpHref: "/help/errors#X",
    });
    expect(predicate(e) === allM12FieldsNonNull(e)).toBe(false);
  });
});
```

- [ ] **Step 2: Strip the "every live entry" assertion from Task B.4's commit (r4 TDD fix)**

Per AGENTS.md plan-wide invariant #1, every task commits in a green state. The forward direction of the biconditional ("predicate fires → all three M12 fields non-null") FAILS for every Doug-facing entry at B.4 commit time — those entries aren't backfilled until Phase E.5 – E.11.

**Restructure (r4 → r6 → r10):** Task B.4 commits ONLY the forced-fixture tests (5 synthetic cases that exercise the predicate's logic). The live-catalog biconditional assertion is deferred to **Task E.13** (per r6 — r4's H.6 was removed). At E.13 commit time, every Doug-facing admin entry has `title` / `longExplanation` / `helpHref` populated (Phase E.5 – E.11 + the parse-warnings backfill of E.7); E.13 writes the live-catalog biconditional alongside its final catalog backfills as a red→green TDD loop.

Replace the test body with the forced fixtures only — drop the `it("every live entry satisfies the biconditional", ...)` block. Keep the synthetic-fixture `it()` blocks.

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm test tests/messages/_metaErrorCatalogDocs.test.ts`
Expected: PASS — forced fixtures exercise the predicate logic against synthetic entries; no live-catalog assertion at this commit.

- [ ] **Step 4: Commit (green state)**

```bash
git add tests/messages/_metaErrorCatalogDocs.test.ts
git commit -m "test(messages): catalog meta-test #2 — 5 forced fixtures only; live-catalog biconditional deferred to E.13 (Task B.4 — TDD green)"
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
- [ ] 18+ master-spec admin-log-only codes have all six user-facing fields `null` (B.2 hand-list + B.5 meta-test net)
- [ ] `extract-admin-log-only-codes.ts` parses master-spec §12.4 and emits the canonical set
- [ ] Test #2 (catalog meta-test) PASSES with forced-fixture coverage only — no live-catalog biconditional assertion exists at Phase B. The live-catalog biconditional lives in **Task E.13** (per r6 — r4's H.6 was removed); E.13 commits the assertion alongside its final catalog backfills in a red→green TDD loop.
- [ ] Test #17 (catalog-alignment) PASSES
- [ ] `pnpm test tests/messages/` is **fully green** at Phase B close-out (no documented-red exception — r5 fix per AGENTS.md invariant #1)
- [ ] **Hand off to Phase C** ([03-time-utility.md](03-time-utility.md))

Phase B introduces ~5 commits, ~150 LOC of new code + ~50 LOC of catalog mutations.
