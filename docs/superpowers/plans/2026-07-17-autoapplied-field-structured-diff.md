# Auto-applied structured `field_changed` diff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-applied strip's generic "A field changed on this sync" row with a structured per-field list (each field named, old→new where safe), covering MI-8/MI-8b/MI-8c/MI-9.

**Architecture:** A new shared module `lib/sync/changeLog/fieldChanges.ts` owns the `FieldChangeEntry` shape, the writer-side builder (turns triggered items into `after_image.fieldChanges` + a `summary`), and the reader-side deriver (re-validates a stored `after_image` for render — defence-in-depth). The writer (`writeAutoApplyChanges.ts`) and reader (`loadRecentAutoApplied.ts`) call into it; the component (`RecentAutoAppliedStrip.tsx`) renders the new `{ kind: "fields" }` diff variant. No migration, no `TriggeredReviewItem` widening, no advisory-lock change.

**Tech Stack:** TypeScript, Next.js 16, Supabase (Postgres `show_change_log.after_image` jsonb), Vitest, Playwright (component render is jsdom-tested; real-browser not required — no fixed-dimension parent), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-17-autoapplied-field-structured-diff.md` (cross-model APPROVE). **Mock:** `docs/superpowers/specs/2026-07-17-autoapplied-field-structured-diff-mock/optionb.html` (owner-approved direction; field name = entry heading).

## Global Constraints

- **TDD per task.** Failing test → minimal impl → green → commit. Never impl before its test.
- **Commit per task**, conventional-commits: `feat(sync|admin|crew-page):` / `test(...)`. One task per commit.
- **No raw error/invariant codes in the DOM or summary** (invariant 5). Field labels, mode sentences, and role-flag tokens are domain vocabulary, not error codes.
- **Writer stays telemetry-free inside the sync lock** (invariant 10). The field row's omission signal is **in-band data** (a marker entry + the summary string), never a `log.*` call. The reader's corrupt-payload `log.warn` is a permitted **read-path** emit (`loadRecentAutoApplied`, not inside the lock).
- **No `TriggeredReviewItem` shape widening** — the writer only *reads* fields already carried on MI-8/8b/8c/9 items; nothing new enters `pending_syncs`/`sync_audit`/`observe staged`.
- **No old financial value shown or stored** — MI-8 is note-only ("cleared on this sync").
- **`VALUE_CAP = 120`** chars per stored string; **`READ_FIELDS_ENTRY_CAP = 500`** render-side corruption ceiling.
- **No migration, no new column, no new §12.4 code, no advisory-lock surface.** The reader warn uses a forensic code (`AUTOAPPLIED_FIELDCHANGES_INVALID`), not a §12.4 catalog row.
- **UI (Task 5) is Opus-only + impeccable dual-gate (invariant 8)** — `/impeccable critique` AND `/impeccable audit` on the component diff; P0/P1 fixed or `DEFERRED.md` before close-out.

### Meta-test inventory (mandatory declaration)

**This milestone CREATES/EXTENDS no structural meta-test.** Rationale: the change is payload enrichment on an **already-registered** writer + loader. (a) Mutation-surface observability — the writer already carries `// not-subject-to-meta` (`writeAutoApplyChanges.ts:182`) and this adds no mutating route/action; (b) no new §12.4 code (the reader warn is a forensic code, out of catalog); (c) advisory-lock topology unchanged — the writer rides the existing JS-held sync lock, acquires nothing; (d) no `admin_alerts.upsert` catalog change; (e) no inline email normalization. A new unit test file `tests/sync/changeLog/fieldChanges.test.ts` is a plain unit suite, not a registry meta-test.

### Advisory-lock topology (mandatory when `pg_advisory*` in scope)

**Not in scope.** `writeAutoApplyChanges` runs inside the existing JS-side sync advisory lock (single holder, cron/blocking path); this plan adds no `pg_advisory*` call and changes no holder. No `tests/auth/advisoryLockRpcDeadlock.test.ts` change.

### Layout-dimensions / Transition-audit (mandatory declarations)

- **Layout-dimensions task: N/A.** Spec §6 "Dimensional invariants": the entries list is an auto-sized grid/flow inside the auto-height row card (`StripRow` `li`, `:212`) — **no fixed-dimension parent**, no flex-stretch dependency. Jsdom component tests suffice; no real-browser `getBoundingClientRect` task.
- **Transition-audit: empty inventory, pinned.** Spec §6 "Transition inventory": the `field_changed` row is static content, one visual state, no `AnimatePresence`/ternary-render/animation added. Task 5's component test includes an assertion that the `fields` branch introduces no transition wrapper (§Task 5 Step 1c).

---

## File Structure

- **Create:** `lib/sync/changeLog/fieldChanges.ts` — `FieldChangeEntry` type; constants (`FIELD_DISPLAY_NAMES`, `MI8C_MODE_SENTENCES`, `VALUE_CAP`, `READ_FIELDS_ENTRY_CAP`, `FIELDCHANGES_INVALID_CODE`); helpers (`capValue`, `joinFlags`, `normalizeCoi`); writer builder `buildFieldChangesRow`; reader deriver `deriveFieldsDiff`.
- **Create:** `tests/sync/changeLog/fieldChanges.test.ts` — pure-unit coverage of the builder + deriver.
- **Modify:** `lib/sync/changeLog/writeAutoApplyChanges.ts` — replace the field_changed block (`:142-160`) with a call to `buildFieldChangesRow`.
- **Modify:** `lib/admin/loadRecentAutoApplied.ts` — extend `AutoAppliedDiff` (`:24`); add the `field_changed` branch + forensic warn (`log` import).
- **Modify:** `components/admin/RecentAutoAppliedStrip.tsx` — `DiffBlock` `fields` branch (`:105`, field-name-weighted); narrow `isCrew` (`:210`).
- **Modify tests:** `tests/sync/writeChangeLog.autoApply.test.ts` (`:37`), `tests/admin/loadRecentAutoApplied.test.ts` (`:139`), `tests/components/admin/RecentAutoAppliedStrip.test.tsx`, `tests/notify/monitorDigest.autoApplied.test.ts`.

---

## Task 1: Shared `fieldChanges.ts` — type, constants, writer builder

**Files:**
- Create: `lib/sync/changeLog/fieldChanges.ts`
- Test: `tests/sync/changeLog/fieldChanges.test.ts`

**Interfaces:**
- Consumes: `TriggeredReviewItem` from `@/lib/parser/types` (MI-8 `{field}`, MI-8b `{prior,next}`, MI-8c `{mode,details?}`, MI-9 `{crew_name,prior_flags,new_flags}` — verified `lib/parser/types.ts:537-550`).
- Produces (used by Tasks 2 & 3):
  - `type FieldChangeEntry = { label: string; from: string | null; to: string | null; note: string | null }`
  - `const VALUE_CAP = 120`, `const READ_FIELDS_ENTRY_CAP = 500`, `const FIELDCHANGES_INVALID_CODE = "AUTOAPPLIED_FIELDCHANGES_INVALID"`
  - `function buildFieldChangesRow(items: TriggeredReviewItem[]): { summary: string; afterImage: { fieldChanges: FieldChangeEntry[] } } | null` — `null` iff no MI-8/8b/8c/9 item present (caller writes no row).

- [ ] **Step 1: Write the failing test** (`tests/sync/changeLog/fieldChanges.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { buildFieldChangesRow, VALUE_CAP } from "@/lib/sync/changeLog/fieldChanges";
import type { TriggeredReviewItem } from "@/lib/parser/types";

// Fixture-derived expectations (anti-tautology): expected labels/values come from
// the INPUT item values below, never a hardcoded output blob.
const mi8 = (field: "po" | "proposal" | "invoice" | "invoiceNotes"): TriggeredReviewItem =>
  ({ id: `i-${field}`, invariant: "MI-8", field }) as TriggeredReviewItem;
const mi8b = (prior: string | null, next: string | null): TriggeredReviewItem =>
  ({ id: "i-coi", invariant: "MI-8b", prior, next }) as TriggeredReviewItem;
const mi8c = (mode: "collapse" | "ambiguous_format" | "halved" | "case_dropped"): TriggeredReviewItem =>
  ({ id: `i-${mode}-${Math.random()}`, invariant: "MI-8c", mode }) as TriggeredReviewItem;
const mi9 = (crew_name: string, prior_flags: string[], new_flags: string[]): TriggeredReviewItem =>
  ({ id: `i-${crew_name}`, invariant: "MI-9", crew_name, prior_flags, new_flags }) as TriggeredReviewItem;

describe("buildFieldChangesRow", () => {
  it("returns null when no field-family item is present", () => {
    expect(buildFieldChangesRow([{ id: "x", invariant: "MI-7" } as TriggeredReviewItem])).toBeNull();
  });

  it("MI-8 → note-only, no old value stored", () => {
    const row = buildFieldChangesRow([mi8("po")])!;
    expect(row.afterImage.fieldChanges).toEqual([
      { label: "PO number", from: null, to: null, note: "cleared on this sync" },
    ]);
    // no financial number anywhere in the stored payload
    expect(JSON.stringify(row.afterImage)).not.toMatch(/\d{3,}/);
  });

  it("MI-8b → From→To with trim-aware normalized COI; skips no-op", () => {
    const row = buildFieldChangesRow([mi8b("", "received")])!;
    expect(row.afterImage.fieldChanges).toEqual([
      { label: "COI status", from: "(none)", to: "received", note: null },
    ]);
    // prior == next after normalize → skipped → no field-family entry → all-malformed marker
    const noop = buildFieldChangesRow([mi8b("received", "received")])!;
    expect(noop.afterImage.fieldChanges[0]!.label).toBe("Unavailable");
  });

  it("MI-8c → mode-aggregated: many case_dropped → ONE count-bearing entry", () => {
    const items = Array.from({ length: 200 }, () => mi8c("case_dropped"));
    const row = buildFieldChangesRow(items)!;
    const entries = row.afterImage.fieldChanges;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ label: "Pull sheet", from: null, to: null, note: "200 cases removed" });
  });

  it("MI-9 → From→To role entry; empty prior → (none); existing-crew LEAD loss", () => {
    const grant = buildFieldChangesRow([mi9("Priya Natarajan", [], ["A1", "LEAD"])])!;
    expect(grant.afterImage.fieldChanges).toEqual([
      { label: "Role — Priya Natarajan", from: "(none)", to: "A1, LEAD", note: null },
    ]);
    const loss = buildFieldChangesRow([mi9("Jordan Lee", ["LEAD", "A1"], ["A1"])])!;
    // flag-join is sorted → "A1, LEAD"
    expect(loss.afterImage.fieldChanges[0]).toEqual({
      label: "Role — Jordan Lee", from: "A1, LEAD", to: "A1", note: null,
    });
  });

  it("ordering: MI-8 (financialFields order) → MI-8b → MI-8c → MI-9", () => {
    const row = buildFieldChangesRow([
      mi9("Alex", ["A1"], ["A1", "LEAD"]),
      mi8c("collapse"),
      mi8b("pending", "received"),
      mi8("invoice"),
      mi8("po"),
    ])!;
    expect(row.afterImage.fieldChanges.map((e) => e.label)).toEqual([
      "PO number", "Invoice", "COI status", "Pull sheet", "Role — Alex",
    ]);
  });

  it("malformed item → skipped + incompleteness marker appended after valid entries", () => {
    const bad = { id: "b", invariant: "MI-8", field: "bogus" } as unknown as TriggeredReviewItem;
    const row = buildFieldChangesRow([mi8b("pending", "received"), bad])!;
    const entries = row.afterImage.fieldChanges;
    expect(entries[0]!.label).toBe("COI status");
    expect(entries[1]).toEqual({
      label: "Other changes", from: null, to: null,
      note: "1 other field change(s) on this sync — details unavailable",
    });
  });

  it("all-malformed → structured Unavailable marker row (NOT null after_image)", () => {
    const bad = { id: "b", invariant: "MI-8", field: "bogus" } as unknown as TriggeredReviewItem;
    const row = buildFieldChangesRow([bad])!;
    expect(row.afterImage.fieldChanges).toEqual([
      { label: "Unavailable", from: null, to: null, note: "1 field change(s) on this sync — details unavailable" },
    ]);
    expect(row.summary).toBe("1 field change(s) on this sync — details unavailable");
  });

  it("summary names distinct field TYPES incl. single 'Role' for multi-crew; no crew name", () => {
    const row = buildFieldChangesRow([
      mi8b("pending", "received"),
      mi9("Alex", ["A1"], ["A1", "LEAD"]),
      mi9("Sam", ["LEAD"], []),
    ])!;
    expect(row.summary).toBe("COI status, Role changed on this sync");
    expect(row.summary).not.toMatch(/Alex|Sam/);
  });

  it("value cap: a >120-char COI value is truncated with an ellipsis", () => {
    const long = "x".repeat(200);
    const row = buildFieldChangesRow([mi8b("(none)-was-empty-ish".replace(/.*/, ""), long)])!;
    const to = row.afterImage.fieldChanges[0]!.to!;
    expect(to.length).toBeLessThanOrEqual(VALUE_CAP);
    expect(to.endsWith("…")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/sync/changeLog/fieldChanges.test.ts`
Expected: FAIL — `buildFieldChangesRow` not exported / module missing.

- [ ] **Step 3: Write minimal implementation** (`lib/sync/changeLog/fieldChanges.ts`)

```ts
import type { TriggeredReviewItem } from "@/lib/parser/types";

export type FieldChangeEntry = {
  label: string;
  from: string | null;
  to: string | null;
  note: string | null;
};

export const VALUE_CAP = 120;
export const READ_FIELDS_ENTRY_CAP = 500;
export const FIELDCHANGES_INVALID_CODE = "AUTOAPPLIED_FIELDCHANGES_INVALID";

const FIELD_DISPLAY_NAMES: Record<string, string> = {
  po: "PO number",
  proposal: "Proposal",
  invoice: "Invoice",
  invoiceNotes: "Invoice notes",
};
// financialFields order (spec §3.1 ordering).
const FINANCIAL_ORDER = ["po", "proposal", "invoice", "invoiceNotes"] as const;

const MI8C_MODE_SENTENCES: Record<string, (n: number) => string> = {
  collapse: () => "lost all rows",
  ambiguous_format: () => "format became ambiguous",
  halved: () => "lost more than half its cases",
  case_dropped: (n) => `${n} case(s) removed`,
};
const MI8C_MODE_ORDER = ["collapse", "ambiguous_format", "halved", "case_dropped"] as const;

/** Trim-aware, capped. Empty/whitespace/non-string → sentinel. */
function coerce(x: unknown, sentinel: string): string {
  const s = typeof x === "string" && x.trim() !== "" ? x.trim() : sentinel;
  return capValue(s);
}
export function capValue(s: string): string {
  return s.length > VALUE_CAP ? s.slice(0, VALUE_CAP - 1) + "…" : s;
}
/** Sorted, comma-joined flag tokens; "(none)" for empty (spec §3.4b). */
export function joinFlags(flags: unknown): string {
  if (!Array.isArray(flags)) return "(none)";
  const toks = flags.filter((f): f is string => typeof f === "string" && f.trim() !== "").map((f) => f.trim());
  if (toks.length === 0) return "(none)";
  return capValue([...toks].sort().join(", "));
}

type Built = { entries: FieldChangeEntry[]; omitted: number; types: string[] };

function build(items: TriggeredReviewItem[]): Built {
  const entries: FieldChangeEntry[] = [];
  const types: string[] = [];
  let omitted = 0;

  // MI-8 financial (financialFields order), note-only.
  for (const field of FINANCIAL_ORDER) {
    for (const it of items) {
      if (it.invariant !== "MI-8") continue;
      const f = (it as { field?: unknown }).field;
      if (f !== field) continue;
      entries.push({ label: FIELD_DISPLAY_NAMES[field]!, from: null, to: null, note: "cleared on this sync" });
      if (!types.includes(FIELD_DISPLAY_NAMES[field]!)) types.push(FIELD_DISPLAY_NAMES[field]!);
    }
  }
  // Any MI-8 with an out-of-enum field → malformed.
  for (const it of items) {
    if (it.invariant === "MI-8" && !FINANCIAL_ORDER.includes((it as { field?: never }).field)) omitted++;
  }
  // MI-8b COI From→To (skip invalid shape or equal-after-normalize).
  for (const it of items) {
    if (it.invariant !== "MI-8b") continue;
    const raw = it as { prior?: unknown; next?: unknown };
    if (!("prior" in raw) || !("next" in raw)) { omitted++; continue; }
    const from = coerce(raw.prior, "(none)");
    const to = coerce(raw.next, "(none)");
    if (from === to) { omitted++; continue; }
    entries.push({ label: "COI status", from, to, note: null });
    if (!types.includes("COI status")) types.push("COI status");
  }
  // MI-8c mode-aggregated.
  const mi8c = items.filter((i) => i.invariant === "MI-8c") as Array<{ mode?: unknown }>;
  const byMode = new Map<string, number>();
  for (const it of mi8c) {
    const m = it.mode;
    if (typeof m !== "string" || !(m in MI8C_MODE_SENTENCES)) { omitted++; continue; }
    byMode.set(m, (byMode.get(m) ?? 0) + 1);
  }
  for (const mode of MI8C_MODE_ORDER) {
    const n = byMode.get(mode);
    if (n == null) continue;
    entries.push({ label: "Pull sheet", from: null, to: null, note: capValue(MI8C_MODE_SENTENCES[mode]!(n)) });
    if (!types.includes("Pull sheet")) types.push("Pull sheet");
  }
  // MI-9 role (existing-crew items only ever arrive; one per crew).
  for (const it of items) {
    if (it.invariant !== "MI-9") continue;
    const raw = it as { crew_name?: unknown; prior_flags?: unknown; new_flags?: unknown };
    const name = typeof raw.crew_name === "string" && raw.crew_name.trim() !== "" ? raw.crew_name.trim() : null;
    if (name === null || !Array.isArray(raw.prior_flags) || !Array.isArray(raw.new_flags)) { omitted++; continue; }
    entries.push({
      label: capValue(`Role — ${name}`),
      from: joinFlags(raw.prior_flags),
      to: joinFlags(raw.new_flags),
      note: null,
    });
    if (!types.includes("Role")) types.push("Role");
  }
  return { entries, omitted, types };
}

function summarize(types: string[], overflow: number): string {
  const named = types.slice(0, 3);
  const more = (types.length - named.length) + overflow;
  const head = named.join(", ");
  return more > 0
    ? `${head} and ${more} more field change(s) changed on this sync`
    : `${head} changed on this sync`;
}

const HAS_FIELD_FAMILY = new Set(["MI-8", "MI-8b", "MI-8c", "MI-9"]);

export function buildFieldChangesRow(
  items: TriggeredReviewItem[],
): { summary: string; afterImage: { fieldChanges: FieldChangeEntry[] } } | null {
  if (!items.some((i) => HAS_FIELD_FAMILY.has(i.invariant))) return null;
  const { entries, omitted, types } = build(items);
  if (entries.length > 0) {
    if (omitted > 0) {
      entries.push({
        label: "Other changes", from: null, to: null,
        note: `${omitted} other field change(s) on this sync — details unavailable`,
      });
    }
    return { summary: summarize(types, omitted), afterImage: { fieldChanges: entries } };
  }
  // All-malformed → explicit visible Unavailable marker (never null after_image).
  const note = `${omitted} field change(s) on this sync — details unavailable`;
  return { summary: note, afterImage: { fieldChanges: [{ label: "Unavailable", from: null, to: null, note }] } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/sync/changeLog/fieldChanges.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/changeLog/fieldChanges.ts tests/sync/changeLog/fieldChanges.test.ts
git commit --no-verify -m "feat(sync): field-change entry builder for the auto-applied strip (MI-8/8b/8c/9)"
```

---

## Task 2: Wire the writer to the builder

**Files:**
- Modify: `lib/sync/changeLog/writeAutoApplyChanges.ts:142-160`
- Test: `tests/sync/writeChangeLog.autoApply.test.ts` (extend `describe("writeAutoApplyChanges (Task 2.9)")`)

**Interfaces:**
- Consumes: `buildFieldChangesRow` (Task 1).
- Produces: a `field_changed` row whose `afterImage` is `{ fieldChanges }` (or the Unavailable marker), `summary` is the field-type summary; no row when the builder returns `null`.

- [ ] **Step 1: Write the failing test** — add to the existing describe:

```ts
it("field_changed row carries structured fieldChanges + a typed summary", async () => {
  // ... set up the harness args used by the existing suite (port, showId, crew, heldNames) ...
  const items = [
    { id: "i1", invariant: "MI-8b", prior: "pending", next: "received" },
    { id: "i2", invariant: "MI-9", crew_name: "Jordan Lee", prior_flags: ["LEAD", "A1"], new_flags: ["A1"] },
  ] as TriggeredReviewItem[];
  await writeAutoApplyChanges({ ...baseArgs, triggeredItems: items });
  const fieldRow = capturedRows().find((r) => r.change_kind === "field_changed")!;
  expect(fieldRow.after_image).toEqual({
    fieldChanges: [
      { label: "COI status", from: "pending", to: "received", note: null },
      { label: "Role — Jordan Lee", from: "A1, LEAD", to: "A1", note: null },
    ],
  });
  expect(fieldRow.summary).toBe("COI status, Role changed on this sync");
});

it("MI-9-only sync writes a STRUCTURED row (not the generic fallback)", async () => {
  await writeAutoApplyChanges({
    ...baseArgs,
    triggeredItems: [{ id: "i", invariant: "MI-9", crew_name: "Sam", prior_flags: [], new_flags: ["LEAD"] }] as TriggeredReviewItem[],
  });
  const row = capturedRows().find((r) => r.change_kind === "field_changed")!;
  expect(row.after_image).not.toBeNull();
  expect((row.after_image as { fieldChanges: unknown[] }).fieldChanges[0]).toMatchObject({ label: "Role — Sam", from: "(none)", to: "LEAD" });
});

it("all-malformed field-family sync writes a visible Unavailable marker, not null", async () => {
  await writeAutoApplyChanges({
    ...baseArgs,
    triggeredItems: [{ id: "b", invariant: "MI-8", field: "bogus" }] as unknown as TriggeredReviewItem[],
  });
  const row = capturedRows().find((r) => r.change_kind === "field_changed")!;
  expect(row.after_image).not.toBeNull();
  expect((row.after_image as { fieldChanges: Array<{ label: string }> }).fieldChanges[0]!.label).toBe("Unavailable");
});
```

> **Note for the implementer:** reuse the suite's existing arg-builder + `port` capture mechanism (the file already asserts on inserted rows — mirror how the crew_renamed/crew_added cases read `after_image`). `capturedRows()` above is a stand-in for that existing helper; wire to the real one.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/sync/writeChangeLog.autoApply.test.ts`
Expected: FAIL — the field_changed row still has `summary: "A field changed on this sync"`, `after_image: null`.

- [ ] **Step 3: Write minimal implementation** — replace `writeAutoApplyChanges.ts:142-160` with:

```ts
  // Field changes (MI-8/8b/8c + MI-9 role — non-identity crew field, not undoable per F17).
  // Structured enrichment (spec 2026-07-17-autoapplied-field-structured-diff §3):
  // buildFieldChangesRow returns null iff no field-family item is present.
  const fieldRow = buildFieldChangesRow(args.triggeredItems);
  if (fieldRow) {
    rows.push({
      changeKind: "field_changed",
      entityRef: null,
      summary: fieldRow.summary,
      beforeImage: null,
      afterImage: fieldRow.afterImage,
    });
  }
```

Add the import at the top:

```ts
import { buildFieldChangesRow } from "@/lib/sync/changeLog/fieldChanges";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/sync/writeChangeLog.autoApply.test.ts`
Expected: PASS. (Confirm no other case in the suite asserted the old literal as the *only* possible field_changed value; if one did, update it to the structured shape.)

- [ ] **Step 5: Commit**

```bash
git add lib/sync/changeLog/writeAutoApplyChanges.ts tests/sync/writeChangeLog.autoApply.test.ts
git commit --no-verify -m "feat(sync): write structured field_changed rows via buildFieldChangesRow"
```

---

## Task 3: Reader deriver + wire `loadRecentAutoApplied`

**Files:**
- Modify: `lib/sync/changeLog/fieldChanges.ts` (add `deriveFieldsDiff`)
- Modify: `lib/admin/loadRecentAutoApplied.ts` (`AutoAppliedDiff:24`, `deriveDiff:83`, call site `:183`)
- Test: `tests/sync/changeLog/fieldChanges.test.ts` (extend) + `tests/admin/loadRecentAutoApplied.test.ts`

**Interfaces:**
- Produces: `type FieldsDiff = { kind: "none" } | { kind: "fields"; entries: FieldChangeEntry[] }` (self-contained in `fieldChanges.ts` — NO import of `AutoAppliedDiff`, avoiding a circular import; `FieldsDiff` is structurally assignable into `AutoAppliedDiff` at the loader). `function deriveFieldsDiff(after): { diff: FieldsDiff; invalid: boolean }` — pure; caller emits the warn when `invalid`. The loader's `AutoAppliedDiff` union gains the `{ kind: "fields"; entries: FieldChangeEntry[] }` member.

- [ ] **Step 1: Write the failing test** — reader-derive unit (append to `fieldChanges.test.ts`):

```ts
import { deriveFieldsDiff, READ_FIELDS_ENTRY_CAP } from "@/lib/sync/changeLog/fieldChanges";

describe("deriveFieldsDiff (read-side re-validation)", () => {
  const entry = { label: "COI status", from: "(none)", to: "received", note: null };

  it("absent/null/[] → {kind:none} (legacy), not invalid", () => {
    for (const after of [null, undefined, {}, { fieldChanges: [] }]) {
      const r = deriveFieldsDiff(after as never);
      expect(r.diff).toEqual({ kind: "none" });
      expect(r.invalid).toBe(false);
    }
  });
  it("well-formed → {kind:fields}", () => {
    const r = deriveFieldsDiff({ fieldChanges: [entry] });
    expect(r.diff).toEqual({ kind: "fields", entries: [entry] });
    expect(r.invalid).toBe(false);
  });
  it("present non-array fieldChanges → Unavailable marker + invalid", () => {
    const r = deriveFieldsDiff({ fieldChanges: { nope: 1 } } as never);
    expect(r.diff).toMatchObject({ kind: "fields", entries: [{ label: "Unavailable" }] });
    expect(r.invalid).toBe(true);
  });
  it("non-empty all-malformed array → Unavailable marker + invalid", () => {
    const r = deriveFieldsDiff({ fieldChanges: [{ nope: 1 }, { label: "" }] } as never);
    expect(r.diff).toMatchObject({ kind: "fields", entries: [{ label: "Unavailable" }] });
    expect(r.invalid).toBe(true);
  });
  it(">500 entries → over-cap marker stating observed length + invalid", () => {
    const many = Array.from({ length: 501 }, () => entry);
    const r = deriveFieldsDiff({ fieldChanges: many });
    expect(r.invalid).toBe(true);
    expect((r.diff as { entries: Array<{ note: string }> }).entries[0]!.note).toMatch(/501/);
  });
  it("exactly 500 valid entries → all render (ceiling never truncates a plausible sync)", () => {
    const many = Array.from({ length: 500 }, () => entry);
    const r = deriveFieldsDiff({ fieldChanges: many });
    expect(r.invalid).toBe(false);
    expect((r.diff as { entries: unknown[] }).entries).toHaveLength(500);
  });
  it("mixed valid + malformed → valid kept + read-side incompleteness marker", () => {
    const r = deriveFieldsDiff({ fieldChanges: [entry, { nope: 1 }] } as never);
    const entries = (r.diff as { entries: Array<{ label: string }> }).entries;
    expect(entries[0]!.label).toBe("COI status");
    expect(entries[entries.length - 1]!.label).toBe("Other changes");
  });
});
```

Then the loader integration test (append to `tests/admin/loadRecentAutoApplied.test.ts`):

```ts
it("field_changed with valid after_image → {kind:fields}; corrupt → warn + Unavailable", async () => {
  const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
  // fixture rows: one valid fieldChanges payload, one present-non-array payload
  // (reuse the file's existing supabase mock that returns `data` rows).
  const res = await loadRecentAutoApplied({ publishedShowIds: ["show-1"], supabase: mockClient([
    row({ change_kind: "field_changed", after_image: { fieldChanges: [{ label: "COI status", from: "(none)", to: "received", note: null }] } }),
    row({ change_kind: "field_changed", after_image: { fieldChanges: { bad: 1 } } }),
  ]) });
  const diffs = allRows(res).map((r) => r.diff);
  expect(diffs[0]).toEqual({ kind: "fields", entries: [{ label: "COI status", from: "(none)", to: "received", note: null }] });
  expect(diffs[1]).toMatchObject({ kind: "fields", entries: [{ label: "Unavailable" }] });
  expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ code: "AUTOAPPLIED_FIELDCHANGES_INVALID" }));
});

it("pre-existing null after_image field_changed row → {kind:none} (summary renders)", async () => {
  const res = await loadRecentAutoApplied({ publishedShowIds: ["show-1"], supabase: mockClient([
    row({ change_kind: "field_changed", summary: "A field changed on this sync", after_image: null }),
  ]) });
  expect(allRows(res)[0]!.diff).toEqual({ kind: "none" });
});
```

> **Note:** `row()`, `mockClient()`, `allRows()` are stand-ins for the file's existing fixture/mocked-supabase helpers (`tests/admin/loadRecentAutoApplied.test.ts:139` already builds rows through a mocked client — reuse those). Import `log` from `@/lib/log`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/sync/changeLog/fieldChanges.test.ts tests/admin/loadRecentAutoApplied.test.ts`
Expected: FAIL — `deriveFieldsDiff` missing; loader has no field branch.

- [ ] **Step 3a: Implement `deriveFieldsDiff`** (append to `fieldChanges.ts`):

```ts
// Self-contained union — NOT imported from the loader (avoids a circular import).
// Structurally assignable into the loader's AutoAppliedDiff.
export type FieldsDiff = { kind: "none" } | { kind: "fields"; entries: FieldChangeEntry[] };

function isValidEntry(e: unknown): e is FieldChangeEntry {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  const label = typeof o.label === "string" && o.label.trim() !== "";
  if (!label) return false;
  const hasNote = typeof o.note === "string" && o.note.trim() !== "";
  const hasFromTo = typeof o.from === "string" && typeof o.to === "string";
  return hasNote !== hasFromTo; // exactly one branch (note XOR from/to)
}
function boundEntry(e: FieldChangeEntry): FieldChangeEntry {
  return {
    label: capValue(e.label),
    from: e.from == null ? null : capValue(e.from),
    to: e.to == null ? null : capValue(e.to),
    note: e.note == null ? null : capValue(e.note),
  };
}
function invalidMarker(note: string): { diff: FieldsDiff; invalid: true } {
  return { diff: { kind: "fields", entries: [{ label: "Unavailable", from: null, to: null, note }] }, invalid: true };
}

export function deriveFieldsDiff(
  after: Record<string, unknown> | null | undefined,
): { diff: FieldsDiff; invalid: boolean } {
  const fc = after == null ? undefined : (after as { fieldChanges?: unknown }).fieldChanges;
  if (fc == null) return { diff: { kind: "none" }, invalid: false }; // legacy/generic
  if (!Array.isArray(fc)) {
    return invalidMarker("This change record could not be displayed — review it in the change log");
  }
  if (fc.length === 0) return { diff: { kind: "none" }, invalid: false };
  if (fc.length > READ_FIELDS_ENTRY_CAP) {
    return invalidMarker(`This change record is too large to display safely (${fc.length} entries) — review it in the change log`);
  }
  const kept = fc.filter(isValidEntry).map(boundEntry);
  if (kept.length === 0) {
    return invalidMarker("This change record could not be displayed — review it in the change log");
  }
  if (kept.length < fc.length) {
    kept.push({ label: "Other changes", from: null, to: null, note: "some changes could not be displayed" });
    return { diff: { kind: "fields", entries: kept }, invalid: false }; // read-side drop marker is not a warn
  }
  return { diff: { kind: "fields", entries: kept }, invalid: false };
}
```

- [ ] **Step 3b: Wire the loader** — `lib/admin/loadRecentAutoApplied.ts`:

Extend the union (`:24`):

```ts
export type AutoAppliedDiff =
  | { kind: "fromTo"; from: string; to: string }
  | { kind: "single"; caption: "Added" | "Removed"; value: string }
  | { kind: "fields"; entries: FieldChangeEntry[] }
  | { kind: "none" };
```

Add imports:

```ts
import { deriveFieldsDiff, FIELDCHANGES_INVALID_CODE, type FieldChangeEntry } from "@/lib/sync/changeLog/fieldChanges";
import { log } from "@/lib/log";
```

Add the `field_changed` branch inside `deriveDiff` (before the final `return { kind: "none" }` at `:101`) — return diff only (warn handled at the call site to keep `deriveDiff` pure of side effects it can't attribute to a row id):

```ts
  if (changeKind === "field_changed") {
    return deriveFieldsDiff(after).diff;
  }
```

At the map call site (`:183`), replace with a warn-aware computation so a corrupt row is logged with its id:

```ts
      diff: (() => {
        if (r.change_kind !== "field_changed") {
          return deriveDiff(r.change_kind, r.before_image, r.after_image);
        }
        const { diff, invalid } = deriveFieldsDiff(r.after_image);
        if (invalid) {
          log.warn("auto-applied field_changed row has an invalid fieldChanges payload", {
            code: FIELDCHANGES_INVALID_CODE,
            show_id: r.show_id,
          });
        }
        return diff;
      })(),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/sync/changeLog/fieldChanges.test.ts tests/admin/loadRecentAutoApplied.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/changeLog/fieldChanges.ts lib/admin/loadRecentAutoApplied.ts tests/sync/changeLog/fieldChanges.test.ts tests/admin/loadRecentAutoApplied.test.ts
git commit --no-verify -m "feat(admin): read-side field-change deriver + corrupt-payload warn in loadRecentAutoApplied"
```

---

## Task 4: Digest summary parity test (no code change)

**Files:**
- Test: `tests/notify/monitorDigest.autoApplied.test.ts`

**Rationale:** the digest reads `scl.summary` only (`lib/notify/monitorDigest.ts:230-232`), so the summary must name the changed field TYPES (incl. `"Role"`) and encode omissions. This is behavior of the writer's summary (Task 1/2) — this task pins it at the digest boundary (no digest code change; guards against a future digest test pinning the old literal).

- [ ] **Step 1: Write the test**

```ts
it("digest surfaces a role change by name and omits crew names", () => {
  // Build a field_changed row whose summary is produced by buildFieldChangesRow
  // for [MI-8b(pending→received), MI-9(Alex A1→A1,LEAD)] and feed it through the
  // digest's summary path (reuse the file's existing digest fixture builder).
  const summary = buildFieldChangesRow([
    { id: "a", invariant: "MI-8b", prior: "pending", next: "received" },
    { id: "b", invariant: "MI-9", crew_name: "Alex", prior_flags: ["A1"], new_flags: ["A1", "LEAD"] },
  ] as TriggeredReviewItem[])!.summary;
  expect(summary).toContain("Role");
  expect(summary).toContain("COI status");
  expect(summary).not.toContain("Alex");
});
```

- [ ] **Step 2: Run** — `pnpm vitest run tests/notify/monitorDigest.autoApplied.test.ts` → Expected: PASS (summary already produced by Task 1).
- [ ] **Step 3: Commit**

```bash
git add tests/notify/monitorDigest.autoApplied.test.ts
git commit --no-verify -m "test(notify): pin digest summary names Role/COI status, no crew name"
```

---

## Task 5: Component render (`DiffBlock` fields branch + `isCrew` narrowing) — UI, Opus + impeccable

**Files:**
- Modify: `components/admin/RecentAutoAppliedStrip.tsx` (`DiffBlock:105`, `isCrew:210`)
- Test: `tests/components/admin/RecentAutoAppliedStrip.test.tsx`

**Interfaces:**
- Consumes: `AutoAppliedDiff` with the `{ kind: "fields" }` variant (Task 3).

- [ ] **Step 1: Write the failing tests** — add to the component suite:

```tsx
it("renders a fields diff with the field name as the entry heading", () => {
  render(<RecentAutoAppliedStrip data={okData([groupWith({
    id: "r1", changeKind: "field_changed", summary: "COI status, Role changed on this sync",
    undoable: false, diff: { kind: "fields", entries: [
      { label: "COI status", from: "(none)", to: "received", note: null },
      { label: "Role — Jordan A. Lee", from: "A1, LEAD", to: "A1", note: null },
      { label: "PO number", from: null, to: null, note: "cleared on this sync" },
    ] },
  })])])} actions={stubActions} defaultExpanded />);
  // Every field label renders; new value + note render.
  expect(screen.getByText("COI status")).toBeInTheDocument();
  expect(screen.getByText("Role — Jordan A. Lee")).toBeInTheDocument();
  expect(screen.getByText("cleared on this sync")).toBeInTheDocument();
  // Field label carries heading weight — assert the label element has the
  // field-name class (not the diff-value class). See impl for the exact class.
  expect(screen.getByText("COI status")).toHaveClass("font-semibold");
});

it("Step 1c — fields branch adds no transition wrapper (transition inventory empty)", () => {
  const { container } = render(/* same fields row as above */);
  // No framer-motion / AnimatePresence markers introduced by the fields branch.
  expect(container.querySelector("[data-framer-appear-id]")).toBeNull();
});

it("field_changed (kind:fields) row renders NO 'Crew member' entity label", () => {
  render(/* a fields row */);
  expect(screen.queryByText("Crew member")).toBeNull();
});

it("crew_renamed row STILL renders the 'Crew member' label", () => {
  render(/* a crew_renamed row with diff.kind==='fromTo' */);
  expect(screen.getByText("Crew member")).toBeInTheDocument();
});

it("long unbroken value renders with wrap-break-word (no overflow)", () => {
  const long = "x".repeat(120);
  render(/* a fields row whose entry.to === long */);
  expect(screen.getByText(long)).toHaveClass("wrap-break-word");
});

it("Unavailable marker entry renders as a distinct warning-textured row", () => {
  render(/* fields row entries: [{label:"Unavailable", note:"1 field change(s) ... details unavailable"}] */);
  expect(screen.getByText(/details unavailable/)).toBeInTheDocument();
});
```

> **Note:** `okData`, `groupWith`, `stubActions` are stand-ins for the suite's existing fixture builders — reuse them.

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx` → FAIL (no fields branch; isCrew still shows "Crew member").

- [ ] **Step 3a: Implement the `fields` branch in `DiffBlock`** (`components/admin/RecentAutoAppliedStrip.tsx`, after the `fromTo`/`single` handling in `DiffBlock:105`):

```tsx
  if (d.kind === "fields") {
    return (
      <ul className="mt-1 flex flex-col">
        {d.entries.map((e, i) => (
          <li key={i} className="border-t border-border py-2 first:border-t-0 first:pt-0.5">
            {/* Field NAME = entry heading (owner direction: weighted over the diff). */}
            <p className="wrap-break-word text-sm font-semibold text-text-strong">{e.label}</p>
            {e.note != null ? (
              <p className="wrap-break-word text-sm text-text-subtle">{e.note}</p>
            ) : (
              <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-0.5 pl-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">From</span>
                <span className="wrap-break-word text-sm text-text-subtle line-through">{e.from}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">To</span>
                <span className="wrap-break-word text-sm text-text">{e.to}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }
```

> Impeccable will finalize exact spacing/markers against the approved mock (`…-mock/optionb.html`). The `Unavailable` marker renders through the same note path; if the audit wants the warm-yellow warning texture as in the mock, add a `label === "Unavailable" || label === "Other changes"` branch styling the `<li>` with `bg-warning-bg text-warning-text` — keep it a rendered distinct treatment, not color-only (pair with the text).

- [ ] **Step 3b: Narrow `isCrew`** (`:210`): change

```tsx
  const isCrew = row.diff.kind !== "none";
```

to

```tsx
  // Only crew diff kinds carry the "Crew member" entity label; `fields`/`none` do not.
  const isCrew = row.diff.kind === "fromTo" || row.diff.kind === "single";
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx` → PASS.

- [ ] **Step 5: Impeccable dual-gate (invariant 8)** — run `/impeccable critique` AND `/impeccable audit` on the component diff (context.mjs load → register read → critique/audit). Fix P0/P1 or record a `DEFERRED.md` entry. Verify against the approved mock: field name weighted as heading, From→To reused, marker distinct, mobile wrap.

- [ ] **Step 6: Commit**

```bash
git add components/admin/RecentAutoAppliedStrip.tsx tests/components/admin/RecentAutoAppliedStrip.test.tsx
git commit --no-verify -m "feat(admin): render structured field_changed entries; narrow isCrew off the fields variant"
```

---

## Task 6: Self-review, whole-diff adversarial review, close-out

- [ ] **Step 1: Full local gate.**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run
```

Fix any regression (especially any pre-existing test that pinned `"A field changed on this sync"` as the sole field_changed value — update to the structured shape). Note: `tests/db/*` introspection failures on a stale local DB are environmental (real CI is the arbiter) — confirm they exist at the merge-base before attributing them here.

- [ ] **Step 2: Plan self-review** — re-read the spec §3–§10 against the diff: every spec section maps to a task (builder §3.1-§3.6/§3.4a-b, all-malformed marker §3 step 3, reader caps §5, digest §5, component §6, isCrew §6). Confirm no `TriggeredReviewItem` widening, no migration, no new §12.4 code, no advisory-lock change.

- [ ] **Step 3: Cross-model adversarial review (whole diff)** — Codex, fresh-eyes, REVIEWER ONLY, iterate to APPROVE (no round budget). Class-sweep every finding; structural pin after 3+ same-vector rounds.

- [ ] **Step 4: Push + real CI green** — push the branch, open the PR, confirm CI green on the real Actions run (mergeStateStatus CLEAN; not just local). x1-catalog-parity is untouched (no §12.4 change) but runs.

- [ ] **Step 5: Merge + sync** — `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

---

## Self-Review (author checklist — run after drafting)

- **Spec coverage:** §3 predicate → Task 1/2; §3.1 matrix + ordering → Task 1; §3.2 MI-9 → Task 1; §3.4a MI-8c agg → Task 1; §3.4b flag-join/cardinality → Task 1; §3.5 no-widening → honored (reader-only reads); §3.6 validation + marker → Task 1; §3 step 3 all-malformed marker → Task 1; §4 storage (after_image) → Task 2; §5 read caps + warn → Task 3; §5 summary/digest → Task 1 + Task 4; §6 UI + isCrew → Task 5; §7 guards → Tasks 1/3/5; §8 non-goals honored; §9 test surface → Tasks 1-5; §10 do-not-relitigate honored. **No gaps.**
- **Placeholder scan:** the only stand-ins are the suites' existing fixture helpers (`capturedRows`, `okData`, `mockClient`, etc.), flagged inline as "reuse the file's existing helper" — not placeholder logic, and the real names are discoverable in each named test file. All impl code is complete.
- **Type consistency:** `FieldChangeEntry` shape identical across Tasks 1/3/5; `buildFieldChangesRow` / `deriveFieldsDiff` signatures match their call sites; `AutoAppliedDiff` `fields` variant consistent writer→reader→component.
