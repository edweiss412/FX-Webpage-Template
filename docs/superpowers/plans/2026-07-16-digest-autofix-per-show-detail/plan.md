# Digest Autofix Per-Show Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the digest's aggregate autofix line with per-show groups of deduped, sanitized parser notices, deduping across all in-window applied sync rows by source-aware fingerprint.

**Architecture:** A new pure helper `listAutoFixItems` (lib/parser/dataGaps.ts) normalizes/redacts autofix warning messages and extracts anchors; a new pure `computeAutofixShows` (lib/notify/monitorDigest.ts) fingerprints and groups them per show from an ORDER-BY-pinned query; `renderMonitorSection` renders the group like sub-block 1. No DB change, no lock change, no new call boundary.

**Tech Stack:** TypeScript, postgres.js, vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-digest-autofix-per-show-detail.md` (ratified amendment to Flow 6.2 §3/§8). Spec is canonical; every contract below cites it.

## Global Constraints

- Count caps (`DIGEST_MAX_SHOWS` 12 / `DIGEST_MAX_ITEMS_PER_SHOW` 5, `lib/notify/constants.ts:16-17`) are RENDER-ONLY; the model preserves every show/item (spec §3).
- Per-item text pipeline order (spec §4): normalize → shape-check on UNREDACTED string (label fallback) → token/email redaction on accepted prose → 200-char cap + `…` LAST. Fingerprint uses the UNCAPPED item.
- Fingerprint: `` `${code}|${anchor ?? ""}|${item}` ``; anchor = `` `${gid}!${a1}` `` only when `sourceCell.gid` is a number and `a1` a non-empty string (spec §3/§4).
- The email renders NO per-correction number; intro renders the show count only (spec §5, R10 structural closure).
- Query ORDER BY exactly `sl.occurred_at desc, sl.drive_file_id asc, sl.id asc` (spec §3).
- Invariant 5: no raw codes render; exact class labels on fallback.
- No advisory-lock surface touched (read-only builder); no `pg_advisory*` anywhere in this diff.
- Meta-test inventory (spec §8): `tests/notify/_metaInfraContract.test.ts` (registration `:23`) — no registry change, MUST pass after every `monitorDigest.ts` edit. No other registry applies; none created.
- Run per-task scoped tests, then Task 4 runs the FULL gate set before push (`pnpm test`, typecheck via `pnpm build`, eslint, `pnpm format:check`).
- Commits: conventional, one per task, `--no-verify` (worktree hook rule), with Claude trailer lines.

---

### Task 1: `listAutoFixItems` helper (parser lib)

**Files:**
- Modify: `lib/parser/dataGaps.ts` (after `summarizeAutoFixes`, ~line 145)
- Test: `tests/parser/dataGaps.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: `AUTO_FIX_CLASSES`, `AUTO_FIX_CODES`, `AutoFixCode`, `ParseWarning` (all already in `lib/parser/dataGaps.ts` / `lib/parser/types.ts`).
- Produces: `export type AutoFixItem = { code: AutoFixCode; item: string; anchor: string | null }` and `export function listAutoFixItems(warnings: readonly ParseWarning[] | null | undefined): AutoFixItem[]`. Task 2 consumes both.

- [ ] **Step 1: Write the failing tests** — append to `tests/parser/dataGaps.test.ts`:

```ts
import { listAutoFixItems, summarizeAutoFixes } from "@/lib/parser/dataGaps";
// (merge into the file's existing import from "@/lib/parser/dataGaps")

describe("listAutoFixItems (spec 2026-07-16 §4)", () => {
  const w = (over: Record<string, unknown>) => ({
    severity: "warn",
    code: "STAGE_WORD_AUTOCORRECTED",
    message: "Read likely-misspelled stage word(s) 'Sage' as 'Stage' in role cell: 'A1 Sage'",
    ...over,
  });

  test("gating parity: skips payload object, info severity, non-autofix codes", () => {
    const warnings = [
      { kind: "delta", outcome: "applied", code: null }, // payload row — skipped
      w({}),
      w({ severity: "info" }), // skipped
      w({ code: "FIELD_UNREADABLE" }), // not an autofix — skipped
    ] as never;
    const items = listAutoFixItems(warnings);
    expect(items).toHaveLength(1);
    expect(items[0]!.code).toBe("STAGE_WORD_AUTOCORRECTED");
  });

  test("null/undefined/[] → []", () => {
    expect(listAutoFixItems(null)).toEqual([]);
    expect(listAutoFixItems(undefined)).toEqual([]);
    expect(listAutoFixItems([])).toEqual([]);
  });

  test("label fallback emits the EXACT class label (never [redacted-token])", () => {
    // message === code, and an unrelated SHOUTY token — both are 24+ char tokens;
    // a redact-before-shape-check implementation would emit "[redacted-token]" and FAIL here.
    for (const msg of ["STAGE_WORD_AUTOCORRECTED", "SOME_OTHER_SHOUTY_TOKEN_XYZ"]) {
      const items = listAutoFixItems([w({ message: msg })] as never);
      expect(items[0]!.item).toBe("corrected stage word");
    }
    for (const msg of [undefined, "", "   ", 42]) {
      const items = listAutoFixItems([w({ message: msg })] as never);
      expect(items[0]!.item).toBe("corrected stage word");
    }
  });

  test("normalization: multiline/controls/zero-width collapse to one line", () => {
    const items = listAutoFixItems([
      w({ message: "Read​ likely-misspelled\n stage word(s)\t 'A'  as 'B'" }),
    ] as never);
    expect(items[0]!.item).toBe("Read likely-misspelled stage word(s) 'A' as 'B'");
  });

  test("redaction on accepted prose: tokens and emails always", () => {
    const items = listAutoFixItems([
      w({ message: "cell had ABCDEF0123456789ABCDEF0123 and bob@example.com in it" }),
    ] as never);
    expect(items[0]!.item).toBe("cell had [redacted-token] and [redacted-email] in it");
  });

  test("returns UNCAPPED item (cap is the caller's display concern)", () => {
    const long = `corrected 'x' as 'y' in ${"z".repeat(400)}`;
    const items = listAutoFixItems([w({ message: long })] as never);
    expect(items[0]!.item.length).toBeGreaterThan(200);
  });

  test("token deep in an overlong message is redacted in the UNCAPPED item (redaction cannot be deferred past the helper)", () => {
    // Token placed so it would START beyond a 200-char cap — a cap-then-redact
    // implementation would never see it. The helper's uncapped output must
    // already carry the placeholder.
    const msg = `corrected 'x' as 'y' in ${"p".repeat(190)} SECRETTOKEN0123456789ABCDEF tail`;
    const items = listAutoFixItems([w({ message: msg })] as never);
    expect(items[0]!.item).toContain("[redacted-token]");
    expect(items[0]!.item).not.toContain("SECRETTOKEN");
  });

  test("overlong SHOUTY-token message → exact label (shape check sees the whole string, pre-cap)", () => {
    const items = listAutoFixItems([w({ message: `${"A_".repeat(150)}Z` })] as never);
    expect(items[0]!.item).toBe("corrected stage word");
  });

  test("anchor extraction: gid!a1 when both valid, else null", () => {
    expect(
      listAutoFixItems([w({ sourceCell: { title: "T", gid: 7, a1: "C3" } })] as never)[0]!.anchor,
    ).toBe("7!C3");
    expect(
      listAutoFixItems([w({ sourceCell: { title: "T", gid: 7, a1: "B2:D9" } })] as never)[0]!
        .anchor,
    ).toBe("7!B2:D9"); // range a1 is a valid anchor at its native granularity
    for (const sc of [undefined, null, { title: "T", gid: 7 }, { title: "T", gid: "7", a1: "C3" }, { title: "T", gid: 7, a1: "" }]) {
      expect(listAutoFixItems([w({ sourceCell: sc })] as never)[0]!.anchor).toBeNull();
    }
  });

  test("property: emits exactly one entry per counted warning", () => {
    const sets = [
      [w({}), w({ code: "ROLE_TOKEN_AUTOCORRECTED" }), w({ severity: "info" })],
      [{ kind: "payload" }, w({ message: "" })],
      [],
    ] as never[];
    for (const s of sets) {
      expect(listAutoFixItems(s as never)).toHaveLength(summarizeAutoFixes(s as never).total);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/parser/dataGaps.test.ts`
Expected: FAIL — `listAutoFixItems` is not exported.

- [ ] **Step 3: Implement** — in `lib/parser/dataGaps.ts`, after `summarizeAutoFixes`:

```ts
// --- listAutoFixItems (spec docs/superpowers/specs/2026-07-16-digest-autofix-per-show-detail.md §4) ---
// Code-point ranges replicate the sanitizeIdentityString step-1 contract
// (lib/adminAlerts/sanitizeIdentityString.ts:15-24) — built from numeric code
// points so no invisible character is embedded in this file.
const cpRange = (a: number, b: number) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`;
const AUTOFIX_FORMAT_RE = new RegExp(
  `[${cpRange(0x200b, 0x200d)}${String.fromCodePoint(0xfeff)}${cpRange(0x202a, 0x202e)}${cpRange(0x2066, 0x2069)}]`,
  "g",
);
const AUTOFIX_CONTROL_RE = new RegExp(`[${cpRange(0x0000, 0x001f)}${cpRange(0x007f, 0x009f)}]`, "g");
const AUTOFIX_TOKEN_RE = /[A-Za-z0-9+/_-]{24,}/g;
const AUTOFIX_EMAIL_RE = /\S+@\S+/g;
const AUTOFIX_CODE_SHAPED_RE = /^[A-Z][A-Z0-9_]*$/;
const AUTO_FIX_LABELS: ReadonlyMap<string, string> = new Map(
  AUTO_FIX_CLASSES.map((c) => [c.code, c.label]),
);

export type AutoFixItem = { code: AutoFixCode; item: string; anchor: string | null };

/**
 * One entry per counted autofix warning (same gating as summarizeAutoFixes, so
 * listAutoFixItems(w).length === summarizeAutoFixes(w).total for any input).
 * Item pipeline order is load-bearing (spec §4): normalize → shape check on the
 * UNREDACTED string (label fallback — a raw catalog code is itself a 24-char
 * token and must become the label, not "[redacted-token]") → token/email
 * redaction on accepted prose → UNCAPPED return (display cap is the caller's).
 */
export function listAutoFixItems(
  warnings: readonly ParseWarning[] | null | undefined,
): AutoFixItem[] {
  if (!warnings) return [];
  const out: AutoFixItem[] = [];
  for (const w of warnings) {
    if (w.severity === "info") continue;
    if (!AUTO_FIX_CODES.has(w.code)) continue;
    const code = w.code as AutoFixCode;
    const label = AUTO_FIX_LABELS.get(code)!;
    const normalized = String((w as { message?: unknown }).message ?? "")
      .replace(AUTOFIX_FORMAT_RE, "")
      .replace(AUTOFIX_CONTROL_RE, " ")
      .replace(/\s+/g, " ")
      .trim();
    const item =
      normalized === "" || normalized === w.code || AUTOFIX_CODE_SHAPED_RE.test(normalized)
        ? label
        : normalized
            .replace(AUTOFIX_TOKEN_RE, "[redacted-token]")
            .replace(AUTOFIX_EMAIL_RE, "[redacted-email]");
    const sc = (w as { sourceCell?: { gid?: unknown; a1?: unknown } | null }).sourceCell;
    const anchor =
      sc && typeof sc.gid === "number" && typeof sc.a1 === "string" && sc.a1 !== ""
        ? `${sc.gid}!${sc.a1}`
        : null;
    out.push({ code, item, anchor });
  }
  return out;
}
```

Note: `String(42)` → `"42"` is accepted prose — that violates the "non-string message → label" test case. Guard it: replace the `String(...)` line with

```ts
    const rawMessage = (w as { message?: unknown }).message;
    const normalized = (typeof rawMessage === "string" ? rawMessage : "")
```

(keep the same `.replace` chain). Non-string messages then normalize to `""` → label fallback.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/dataGaps.test.ts`
Expected: PASS (all new + existing cases).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/dataGaps.ts tests/parser/dataGaps.test.ts
git commit --no-verify -m "feat(parser): listAutoFixItems — normalized, redacted, anchored autofix notices"
```

---

### Task 2: `computeAutofixShows` pure function

**Files:**
- Modify: `lib/notify/monitorDigest.ts` (add types + function; do NOT touch the model/query yet — repo stays compiling)
- Test: `tests/notify/monitorDigest.autofix.test.ts` (full rewrite)
- Test: `tests/notify/monitorDigest.autofixAnchors.test.ts` (new — live-resolver integration, spec §9.6; written in this task's RED batch since it imports the not-yet-existing `computeAutofixShows`)

**Interfaces:**
- Consumes: `listAutoFixItems`, `AutoFixItem` from Task 1; existing `MonitorShowGroup` (`lib/notify/monitorDigest.ts:27`).
- Produces: `export type AutofixRow = { drive_file_id: string; slug: string | null; title: string | null; parse_warnings: unknown[]; occurred_at: string }`; `export type MonitorAutofix = { total: number; shows: MonitorShowGroup[] }`; `export function computeAutofixShows(rows: AutofixRow[]): MonitorAutofix`. Task 3 wires them into the model.

- [ ] **Step 1: Rewrite the test file** — replace `tests/notify/monitorDigest.autofix.test.ts` entirely:

```ts
import { describe, expect, test } from "vitest";
import { computeAutofixShows, type AutofixRow } from "@/lib/notify/monitorDigest";

// Spec 2026-07-16 §3 — source-aware notice fingerprint (code|anchor|item), per-show
// grouping in stream order, NO count capping in the model, 200-char display cap
// AFTER dedupe. Rows arrive pre-ordered (occurred_at desc) — the query owns ordering.
const warn = (over: Record<string, unknown> = {}) => ({
  severity: "warn",
  code: "STAGE_WORD_AUTOCORRECTED",
  message: "Read likely-misspelled stage word(s) 'Sage' as 'Stage' in role cell: 'A1 Sage'",
  ...over,
});
const row = (drive: string, warnings: unknown[], over: Partial<AutofixRow> = {}): AutofixRow => ({
  drive_file_id: drive,
  slug: `slug-${drive}`,
  title: `Title ${drive}`,
  parse_warnings: warnings,
  occurred_at: "2099-01-01T10:00:00Z",
  ...over,
});

describe("computeAutofixShows", () => {
  test("same notice across two rows of one show collapses (the inflation bug)", () => {
    const r = computeAutofixShows([row("a", [warn()]), row("a", [warn()])]);
    expect(r.total).toBe(1);
    expect(r.shows).toHaveLength(1);
    expect(r.shows[0]!.items).toHaveLength(1);
  });

  test("distinct notices across rows ALL survive (event semantics)", () => {
    const r = computeAutofixShows([
      row("a", [warn({ message: "corrected 'x' as 'y'" })]),
      row("a", [warn({ message: "corrected 'p' as 'q'" })]),
    ]);
    expect(r.total).toBe(2);
    expect(r.shows[0]!.items).toEqual(["corrected 'x' as 'y'", "corrected 'p' as 'q'"]);
  });

  test("same item text under two codes stays distinct (label-fallback isolation)", () => {
    const r = computeAutofixShows([
      row("a", [
        warn({ message: "same text" }),
        warn({ code: "ROLE_TOKEN_AUTOCORRECTED", message: "same text" }),
      ]),
    ]);
    expect(r.total).toBe(2);
  });

  test("anchored identity: same message, different cells → 2; same range → 1; different ranges → 2; unanchored pair → 1; same anchor different messages → 2", () => {
    const m = "Read likely-misspelled stage word(s) 'A' as 'B' in role cell: 'X'";
    const sc = (a1: string) => ({ title: "T", gid: 7, a1 });
    const cases: Array<[unknown[], number]> = [
      [[warn({ message: m, sourceCell: sc("C3") }), warn({ message: m, sourceCell: sc("D4") })], 2],
      [[warn({ message: m, sourceCell: sc("B2:D9") }), warn({ message: m, sourceCell: sc("B2:D9") })], 1],
      [[warn({ message: m, sourceCell: sc("B2:D9") }), warn({ message: m, sourceCell: sc("E2:G9") })], 2],
      [[warn({ message: m }), warn({ message: m })], 1],
      [[warn({ message: m, sourceCell: sc("C3") }), warn({ message: "other 'x' as 'y'", sourceCell: sc("C3") })], 2],
    ];
    for (const [warnings, expected] of cases) {
      expect(computeAutofixShows([row("a", warnings)]).total).toBe(expected);
    }
  });

  test("dedupe keys on the UNCAPPED item; display caps at 200 + ellipsis", () => {
    const prefix = "corrected 'x' as 'y' " + "p".repeat(220);
    const r = computeAutofixShows([
      row("a", [warn({ message: `${prefix}-ONE` }), warn({ message: `${prefix}-TWO` })]),
    ]);
    expect(r.total).toBe(2); // shared >200-char prefix must NOT collapse
    for (const item of r.shows[0]!.items) {
      expect(item.length).toBe(201); // 200 + ellipsis
      expect(item.endsWith("…")).toBe(true);
    }
  });

  test("token straddling the 200-char cap boundary never leaks a partial secret into the capped item", () => {
    // Token spans chars ~185-215: a cap-then-redact pipeline would truncate it to a
    // sub-24-char prefix that escapes the redactor and ships in the email.
    const msg = `corrected 'x' as 'y' ${"p".repeat(160)} STRADDLE0123456789ABCDEF0123456789 tail`;
    const r = computeAutofixShows([row("a", [warn({ message: msg })])]);
    const item = r.shows[0]!.items[0]!;
    expect(item).not.toContain("STRADDLE");
    expect(item).toContain("[redacted-token]");
  });

  test("NO count capping in the model: 13 shows and >5 items all preserved, stream order kept", () => {
    const rows: AutofixRow[] = [];
    for (let i = 0; i < 13; i++) {
      rows.push(row(`show-${i}`, [warn({ message: `corrected 'a' as 'b' #${i}` })]));
    }
    rows.push(
      row("show-0", [
        ...Array.from({ length: 6 }, (_, j) => warn({ message: `extra 'c' as 'd' #${j}` })),
      ]),
    );
    const r = computeAutofixShows(rows);
    expect(r.shows).toHaveLength(13); // all preserved — caps are render-only
    expect(r.shows.map((s) => s.slug)).toEqual(rows.slice(0, 13).map((x) => x.slug));
    expect(r.shows[0]!.items).toHaveLength(7); // 1 + 6, all preserved
    expect(r.total).toBe(19);
  });

  test("show with zero autofix items is omitted; empty rows → total 0", () => {
    const r = computeAutofixShows([
      row("a", [{ kind: "payload" }, warn({ code: "FIELD_UNREADABLE" })]),
    ]);
    expect(r).toEqual({ total: 0, shows: [] });
    expect(computeAutofixShows([])).toEqual({ total: 0, shows: [] });
  });

  test("carries title/slug (attribution)", () => {
    const r = computeAutofixShows([row("a", [warn()])]);
    expect(r.shows[0]).toMatchObject({ showTitle: "Title a", slug: "slug-a" });
  });
});
```

Also create `tests/notify/monitorDigest.autofixAnchors.test.ts` in the same RED batch (it imports `computeAutofixShows`, which does not exist yet — genuine failing phase). Interfaces: `attachSourceCellAnchors`, `WarningAnchorSources` (`lib/drive/showDayTimeAnchors.ts:120,100`), `CrewRoleAnchor` (`lib/drive/crewRoleAnchors.ts:8`); mirror the anchor `name` fixture idioms of `tests/drive/crewRoleAnchors.test.ts` (the resolver compares `normalizeCrewNameKey(blockRef.name)` to the stored keys).

```ts
import { describe, expect, test } from "vitest";
import { attachSourceCellAnchors } from "@/lib/drive/showDayTimeAnchors";
import { computeAutofixShows } from "@/lib/notify/monitorDigest";
import type { ParseWarning } from "@/lib/parser/types";

// Spec 2026-07-16 §9.6 — unique-name-only crew anchors THROUGH THE REAL RESOLVER:
// duplicate-name crew rows anchor to null (resolveCrewRoleCell returns null on
// multiple matches, lib/drive/crewRoleAnchors.ts:177-185), so byte-identical
// notices from those rows collapse; a unique-name pair anchors both and stays
// distinct. Fixture-injected sourceCell values cannot catch this class (R11).
describe("autofix dedupe through the real anchor resolver", () => {
  const stageWarn = (name: string): ParseWarning => ({
    severity: "warn",
    code: "STAGE_WORD_AUTOCORRECTED",
    message: "Read likely-misspelled stage word(s) 'Sage' as 'Stage' in role cell: 'A1 Sage'",
    blockRef: { kind: "crew", name },
  });
  const anchor = (a1: string) => ({ title: "PULL SHEET", gid: 7, a1 });
  // NOTE: build `name` keys exactly as tests/drive/crewRoleAnchors.test.ts does
  // (the resolver compares normalizeCrewNameKey(blockRef.name) === anchors[].name).
  const sources = {
    showDay: [],
    crewRole: [
      { name: "jane doe", anchor: anchor("C3") },
      { name: "jane doe", anchor: anchor("C9") }, // duplicate name — resolver must null out
      { name: "bob roe", anchor: anchor("C5") },
      { name: "ann poe", anchor: anchor("C7") },
    ],
    region: {},
  };

  test("duplicate names → both unanchored → identical notices collapse to 1", () => {
    const warnings = [stageWarn("Jane Doe"), stageWarn("Jane Doe")];
    attachSourceCellAnchors(warnings, sources);
    expect(warnings.every((w) => w.sourceCell == null)).toBe(true);
    const r = computeAutofixShows([
      { drive_file_id: "d", slug: "s", title: "T", parse_warnings: warnings, occurred_at: "2099-01-01T10:00:00Z" },
    ]);
    expect(r.total).toBe(1);
  });

  test("unique names → both anchored → identical notices stay distinct", () => {
    const warnings = [stageWarn("Bob Roe"), stageWarn("Ann Poe")];
    attachSourceCellAnchors(warnings, sources);
    expect(warnings.map((w) => w.sourceCell?.a1)).toEqual(["C5", "C7"]);
    const r = computeAutofixShows([
      { drive_file_id: "d", slug: "s", title: "T", parse_warnings: warnings, occurred_at: "2099-01-01T10:00:00Z" },
    ]);
    expect(r.total).toBe(2);
  });
});
```

(If `blockRef`'s type or the anchor `name` normalization differs from the sketch, mirror the exact fixture idioms in `tests/drive/crewRoleAnchors.test.ts` — the CONTRACT under test is: dup-name → null anchors → collapse; unique-name → distinct anchors → both survive.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/notify/monitorDigest.autofix.test.ts tests/notify/monitorDigest.autofixAnchors.test.ts`
Expected: FAIL — `computeAutofixShows` is not exported (both files).

- [ ] **Step 3: Implement** — in `lib/notify/monitorDigest.ts`: add to the imports from `@/lib/parser/dataGaps`: `listAutoFixItems`. Then add after `groupAutoApplied`:

```ts
export type AutofixRow = {
  drive_file_id: string;
  slug: string | null;
  title: string | null;
  parse_warnings: unknown[];
  occurred_at: string;
};

export type MonitorAutofix = { total: number; shows: MonitorShowGroup[] };

const AUTOFIX_ITEM_DISPLAY_CAP = 200;

/**
 * Spec 2026-07-16 §3 — source-aware notice dedupe per show. Fingerprint
 * `${code}|${anchor ?? ""}|${item}` keys on the UNCAPPED item; the 200-char
 * display cap applies to kept items only (identity vs display separation).
 * NO count capping here — DIGEST_MAX_* caps are render-only (template).
 * Rows arrive query-ordered (occurred_at desc, drive_file_id, id); shows keep
 * first-seen stream order, items keep stream order.
 */
export function computeAutofixShows(rows: AutofixRow[]): MonitorAutofix {
  const groups = new Map<
    string,
    { showTitle: string | null; slug: string | null; seen: Set<string>; items: string[] }
  >();
  for (const r of rows) {
    const g =
      groups.get(r.drive_file_id) ??
      ({ showTitle: r.title, slug: r.slug, seen: new Set(), items: [] } as const & {
        seen: Set<string>;
        items: string[];
      });
    for (const it of listAutoFixItems(r.parse_warnings as never)) {
      const fingerprint = `${it.code}|${it.anchor ?? ""}|${it.item}`;
      if (g.seen.has(fingerprint)) continue;
      g.seen.add(fingerprint);
      g.items.push(
        it.item.length > AUTOFIX_ITEM_DISPLAY_CAP
          ? `${it.item.slice(0, AUTOFIX_ITEM_DISPLAY_CAP)}…`
          : it.item,
      );
    }
    groups.set(r.drive_file_id, g);
  }
  let total = 0;
  const shows: MonitorShowGroup[] = [];
  for (const g of groups.values()) {
    if (g.items.length === 0) continue;
    total += g.items.length;
    shows.push({ showTitle: g.showTitle, slug: g.slug, items: g.items });
  }
  return { total, shows };
}
```

(If the `as const &` intersection reads awkwardly under the repo's TS config, use a plain typed object literal — the shape is what matters.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/notify/monitorDigest.autofix.test.ts tests/notify/monitorDigest.autofixAnchors.test.ts tests/drive/crewRoleAnchors.test.ts tests/notify/_metaInfraContract.test.ts`
Expected: PASS. (`accumulateAutoFixes` still exists — deleted in Task 3.)

- [ ] **Step 5: Commit**

```bash
git add lib/notify/monitorDigest.ts tests/notify/monitorDigest.autofix.test.ts tests/notify/monitorDigest.autofixAnchors.test.ts
git commit --no-verify -m "feat(sync): computeAutofixShows — source-aware notice dedupe grouped per show"
```

---

### Task 3: Wire model + query + template + fixture sweep + DB proof (one atomic green commit)

**Files:**
- Modify: `lib/notify/monitorDigest.ts` (model type, query, delete `accumulateAutoFixes`/`WarningsRow`)
- Modify: `lib/notify/templates/digest.ts` (sub-block 2)
- Modify: `tests/notify/renderDigest.monitor.test.ts`, `tests/notify/renderDigest.newShowGaps.test.ts`, `tests/notify/deliver.test.ts`, `tests/notify/runDigestNotify.monitor.test.ts` (fixture shape sweep + new render assertions)
- Modify: `tests/notify/monitorDigest.autofix.db.test.ts` (rewrite in the SAME commit — the old test pins the inflation bug and MUST flip together with the semantics; committing the model change with a known-red DB test would violate the per-task TDD invariant)
- Test (new case): fake-sql ORDER BY shape test appended to `tests/notify/monitorDigest.autofix.test.ts`

**Fixture class-sweep (mandatory):** `rg -n "autofix" tests lib --type ts | rg "classes"` — every `MonitorDigestModel` fixture using the old `{ total, classes }` shape must be updated in this commit. Known sites: `renderDigest.monitor.test.ts:9-18`, `renderDigest.newShowGaps.test.ts:10`, `deliver.test.ts:631`, `runDigestNotify.monitor.test.ts:11-20`. The sweep catches any the plan missed.

**Interfaces:**
- Consumes: `computeAutofixShows`, `MonitorAutofix`, `AutofixRow` (Task 2).
- Produces: `MonitorDigestModel.autofix: MonitorAutofix` (replaces `AutoFixSummary`) — consumed by `renderMonitorSection` and `deliverDigest` (`monitor_totals.autofixTotal` keeps reading `.total`, no deliver.ts change).

- [ ] **Step 1: Write failing render tests** — in `tests/notify/renderDigest.monitor.test.ts`, replace the `autofix` fixture value and the label assertion, and add sub-block-2 cases:

```ts
// fixture: replace the old { total, classes } autofix with:
  autofix: {
    total: 2,
    shows: [
      {
        showTitle: "East Coast",
        slug: "east",
        items: [
          "Read likely-misspelled stage word(s) 'Sage' as 'Stage' in role cell: 'A1 Sage'",
          "Read likely-misspelled role 'A2 Teck' as 'A2 Tech' in role cell: 'A2 Teck'",
        ],
      },
    ],
  },
```

Replace the old `expect(r.html).toContain("corrected stage word")` line with:

```ts
    expect(r.html).toContain("Autocorrects applied");
    expect(r.html).toContain("We applied automatic corrections to 1 show:");
    expect(r.html).toContain("'Sage' as 'Stage'");
```

Add new tests to the describe:

```ts
  test("autofix sub-block: intro renders ONLY the show count number (no per-correction count)", () => {
    const r = renderDigest({ origin, shows: [], monitor });
    const intro = r.text.split("\n").find((l) => l.includes("We applied automatic corrections"));
    expect(intro).toBe("We applied automatic corrections to 1 show:");
    expect(intro!.match(/\d+/g)).toEqual(["1"]); // negative: no other number in the intro
  });

  test("autofix sub-block: plural show count", () => {
    const two: MonitorDigestModel = {
      ...monitor,
      autofix: {
        total: 2,
        shows: [
          { showTitle: "A", slug: "a", items: ["corrected 'x' as 'y'"] },
          { showTitle: "B", slug: "b", items: ["corrected 'p' as 'q'"] },
        ],
      },
    };
    const r = renderDigest({ origin, shows: [], monitor: two });
    expect(r.text).toContain("We applied automatic corrections to 2 shows:");
  });

  test("autofix sub-block: per-show link href from slug; /admin fallback when slug null", () => {
    const m: MonitorDigestModel = {
      ...monitor,
      autofix: {
        total: 2,
        shows: [
          { showTitle: "East Coast", slug: "east", items: ["corrected 'a' as 'b'"] },
          { showTitle: null, slug: null, items: ["corrected 'c' as 'd'"] },
        ],
      },
    };
    const r = renderDigest({ origin, shows: [], monitor: m });
    expect(r.html).toContain(`<h4><a href="${origin}/admin/show/east">East Coast</a></h4>`);
    expect(r.html).toContain(`<h4><a href="${origin}/admin">Untitled show</a></h4>`);
  });

  test("autofix sub-block: items HTML-escaped", () => {
    const m: MonitorDigestModel = {
      ...monitor,
      autofix: {
        total: 1,
        shows: [{ showTitle: "E", slug: "e", items: ["corrected '<b>' as '&'"] }],
      },
    };
    const r = renderDigest({ origin, shows: [], monitor: m });
    expect(r.html).not.toContain("corrected '<b>'");
    expect(r.html).toContain("corrected &#39;&lt;b&gt;&#39; as &#39;&amp;&#39;");
  });

  test("autofix sub-block: caps 12 shows / 5 items with SOURCE-derived overflow", () => {
    const shows = Array.from({ length: 13 }, (_, i) => ({
      showTitle: `Show ${i}`,
      slug: `s${i}`,
      items:
        i === 0
          ? Array.from({ length: 7 }, (_, j) => `corrected 'a' as 'b' #${j}`)
          : ["corrected 'x' as 'y'"],
    }));
    const m: MonitorDigestModel = {
      ...monitor,
      autoApplied: [],
      drift: [],
      autofix: { total: 19, shows },
    };
    const r = renderDigest({ origin, shows: [], monitor: m });
    expect(r.html).toContain("We applied automatic corrections to 13 shows:");
    expect(r.html).toContain("+2 more on this show"); // 7 items → +2
    expect(r.html).toContain("+1 more shows"); // 13 shows → +1
  });

  test("autofix sub-block absent when total 0", () => {
    const m: MonitorDigestModel = { ...monitor, autofix: { total: 0, shows: [] } };
    const r = renderDigest({ origin, shows: [], monitor: m });
    expect(r.html).not.toContain("Autocorrects applied");
    expect(r.html).not.toContain("We applied automatic corrections");
  });
```

In `tests/notify/renderDigest.newShowGaps.test.ts`, `tests/notify/deliver.test.ts` (line ~631), and `tests/notify/runDigestNotify.monitor.test.ts` (line ~11 — its fixture has `total: 0`, so use `autofix: { total: 0, shows: [] }` there), replace the `autofix: { total, classes: {...} }` fixture with the shape-equivalent (deliver keeps `autofixTotal: 2` expectations valid):

```ts
    autofix: {
      total: 2,
      shows: [{ showTitle: "East", slug: "east", items: ["corrected 'a' as 'b'", "corrected 'c' as 'd'"] }],
    },
```

Append the ORDER BY shape test to `tests/notify/monitorDigest.autofix.test.ts`:

```ts
import { buildMonitorDigestModel } from "@/lib/notify/monitorDigest";
import type { DigestBuilderSql } from "@/lib/notify/digest";

describe("autofix query shape (spec §3 ORDER BY pin)", () => {
  test("query orders by occurred_at desc, drive_file_id asc, id asc", async () => {
    const captured: string[] = [];
    const sqlFake = ((strings: TemplateStringsArray, ..._v: unknown[]) => {
      captured.push(strings.join("?"));
      return Promise.resolve([]);
    }) as unknown as DigestBuilderSql;
    const r = await buildMonitorDigestModel(new Date("2099-01-01T12:00:00Z"), {
      sql: sqlFake,
      getWatermark: async () => ({ kind: "value", watermark: new Date("2098-01-01T00:00:00Z") }),
    });
    expect(r.kind).toBe("empty");
    const autofixQuery = captured.find((q) => q.includes("parse_warnings") && !q.includes("row_number"));
    expect(autofixQuery).toMatch(/order by sl\.occurred_at desc, sl\.drive_file_id asc, sl\.id asc/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/notify/renderDigest.monitor.test.ts tests/notify/monitorDigest.autofix.test.ts`
Expected: FAIL — type errors on the new fixture shape / missing template output.

- [ ] **Step 3: Implement**

`lib/notify/monitorDigest.ts`:
1. `MonitorDigestModel.autofix: MonitorAutofix` (replace `AutoFixSummary`); drop `AutoFixSummary`/`summarizeAutoFixes` from the dataGaps import if now unused (keep `summarizeDataGaps`, `isQualityRegression`, `GAP_CLASSES`; `AUTO_FIX_CLASSES` import goes too — it was only used by `accumulateAutoFixes`).
2. Delete `accumulateAutoFixes` and `WarningsRow`.
3. Replace the autofix query + accumulation:

```ts
    // Signal 2 — autocorrect notices over ALL in-window applied rows of published
    // shows (spec 2026-07-16 §3: event semantics + source-aware dedupe; ORDER BY
    // is load-bearing for deterministic caps at render time).
    const autofixRows = await sql<AutofixRow>`
      select sl.drive_file_id, s.slug, s.title, sl.parse_warnings, sl.occurred_at
        from public.sync_log sl
        join public.shows s on s.drive_file_id = sl.drive_file_id
       where s.published = true
         and sl.status = 'applied'
         and sl.occurred_at > ${windowIso}
       order by sl.occurred_at desc, sl.drive_file_id asc, sl.id asc
    `;
    const autofix = computeAutofixShows(autofixRows);
```

(The empty-gate `autofix.total === 0 && ...` at `:232-239` keeps compiling unchanged.)

`lib/notify/templates/digest.ts` — replace sub-block 2 (`lib/notify/templates/digest.ts:66-74`) with a grouped render. Extract the show-group loop shared with sub-block 1 so both stay byte-identical in markup:

```ts
function pushShowGroups(
  shows: { showTitle: string | null; slug: string | null; items: string[] }[],
  origin: string,
  dashboard: string,
  text: string[],
  html: string[],
): void {
  const shownShows = shows.slice(0, DIGEST_MAX_SHOWS);
  for (const show of shownShows) {
    const title = show.showTitle ?? "Untitled show";
    const href = showHref(origin, show.slug);
    const shownItems = show.items.slice(0, DIGEST_MAX_ITEMS_PER_SHOW);
    const overflowItems = Math.max(0, show.items.length - DIGEST_MAX_ITEMS_PER_SHOW);
    text.push(`${title} (${href})`);
    html.push(`<h4><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></h4>`);
    const itemHtml: string[] = [];
    for (const item of shownItems) {
      text.push(`  - ${item}`);
      itemHtml.push(`<li>${escapeHtml(item)}</li>`);
    }
    if (overflowItems > 0) {
      const more = `+${overflowItems} more on this show`;
      text.push(`  ${more}: ${dashboard}`);
      itemHtml.push(`<li><a href="${escapeHtml(dashboard)}">${escapeHtml(more)}</a></li>`);
    }
    html.push(`<ul>${itemHtml.join("")}</ul>`);
  }
  const overflowShows = Math.max(0, shows.length - DIGEST_MAX_SHOWS);
  if (overflowShows > 0) {
    const more = `+${overflowShows} more shows`;
    text.push(`${more}: ${dashboard}`);
    html.push(`<p><a href="${escapeHtml(dashboard)}">${escapeHtml(more)}</a></p>`);
  }
}
```

Sub-block 1 body (`:35-64`) becomes:

```ts
  if (monitor.autoApplied.length > 0) {
    text.push("Auto-applied changes:");
    html.push("<h3>Auto-applied changes</h3>");
    pushShowGroups(monitor.autoApplied, origin, dashboard, text, html);
  }
```

Sub-block 2 becomes:

```ts
  // Sub-block 2: autocorrect notices grouped by show (spec 2026-07-16 §5 — the
  // intro renders the SHOW COUNT only; no per-correction number exists to render).
  if (monitor.autofix.total > 0) {
    const showCount = monitor.autofix.shows.length;
    const intro = `We applied automatic corrections to ${showCount} ${showCount === 1 ? "show" : "shows"}:`;
    text.push("Autocorrects applied:", intro);
    html.push("<h3>Autocorrects applied</h3>", `<p>${escapeHtml(intro)}</p>`);
    pushShowGroups(monitor.autofix.shows, origin, dashboard, text, html);
  }
```

Update fixtures in the three test files per Step 1.

Do NOT add `assertNoUnresolvedPlaceholder` to the digest path — it runs only on realtimeProblem templates (`lib/notify/templates/realtimeProblem.ts:34`), and `renderDigest`'s existing comment (`templates/digest.ts:188-190`) deliberately excludes per-item guards: an autofix item quoting a `<word>`-shaped sheet token must render (escaped in HTML), never throw.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/notify tests/parser/dataGaps.test.ts`
Expected: PASS — including `tests/notify/_metaInfraContract.test.ts`, the pre-existing sub-block-1 cap test (byte-stable markup via `pushShowGroups`), and the rewritten `tests/notify/monitorDigest.autofix.db.test.ts` (Step 3b below — rewritten in this SAME task so the commit is green with the local DB up; it self-skips via `describe.runIf(dbUp)` when the DB is down, with real CI as arbiter).

- [ ] **Step 3b: Rewrite the DB proof (same commit)** — in `tests/notify/monitorDigest.autofix.db.test.ts`: keep the header/scaffold (probe, MARK, afterAll; extend cleanup to the new drive ids `${MARK}-second`, `${MARK}-tied` in both the `sync_log` and `shows` delete lists). Replace the single test with:

```ts
describe.runIf(dbUp)("buildMonitorDigestModel — autofix DB proof (spec 2026-07-16 §3, §9.2)", () => {
  const build = (now: string) =>
    buildMonitorDigestModel(new Date(now), {
      sql: sql as unknown as DigestBuilderSql,
      getWatermark: async () => ({ kind: "value", watermark: new Date("2098-01-01T00:00:00Z") }),
    });

  test("filter + dedupe + event semantics + ordering", async () => {
    if (!sql) throw new Error("db not up");
    const SECOND = `${MARK}-second`;
    await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${PUB}, ${MARK + "-ps"}, ${"Pub"}, ${"c"}, ${"v1"}, true)`;
    await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${SECOND}, ${MARK + "-ss"}, ${"Second"}, ${"c"}, ${"v1"}, true)`;
    await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${UNPUB}, ${MARK + "-us"}, ${"Unpub"}, ${"c"}, ${"v1"}, false)`;

    const fix = (msg: string) => [
      { code: "STAGE_WORD_AUTOCORRECTED", severity: "warn", message: msg },
    ];
    const log = (drive: string, status: string, msg: string, at: string) => sql!`
      insert into public.sync_log (drive_file_id, status, message, parse_warnings, occurred_at)
      values (${drive}, ${status}, ${status}, ${sql!.json(fix(msg))}, ${at})
    `;
    // PUB: same notice on two rows (collapses) + a distinct notice on the older row (survives).
    await log(PUB, "applied", "corrected 'a' as 'b'", "2099-01-01T10:00:00Z");
    await log(PUB, "applied", "corrected 'a' as 'b'", "2099-01-01T09:00:00Z");
    await log(PUB, "applied", "corrected 'p' as 'q'", "2099-01-01T09:00:00Z");
    // SECOND: most recent activity → must group FIRST.
    await log(SECOND, "applied", "corrected 'm' as 'n'", "2099-01-01T11:00:00Z");
    // Excluded rows: non-applied / unpublished / orphan.
    await log(PUB, "drive_error", "corrected 'z' as 'w'", "2099-01-01T10:30:00Z");
    await log(UNPUB, "applied", "corrected 'z' as 'w'", "2099-01-01T10:30:00Z");
    await log(ORPHAN, "applied", "corrected 'z' as 'w'", "2099-01-01T10:30:00Z");

    const r = await build("2099-01-01T12:00:00Z");
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.model.autofix.total).toBe(3); // 1 collapsed + 1 distinct + second show's 1
    expect(r.model.autofix.shows.map((s) => s.showTitle)).toEqual(["Second", "Pub"]); // newest-first
    const pub = r.model.autofix.shows[1]!;
    expect(pub.items).toEqual(["corrected 'a' as 'b'", "corrected 'p' as 'q'"]);
  });

  test("tied occurred_at rows: model preserves ALL items in the exact id-asc order (seeded uuids)", async () => {
    if (!sql) throw new Error("db not up");
    const TIED = `${MARK}-tied`;
    await sql`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${TIED}, ${MARK + "-ts"}, ${"Tied"}, ${"c"}, ${"v1"}, true)`;
    const at = "2099-06-01T10:00:00Z";
    // 7 rows, identical occurred_at. RUN-UNIQUE uuids (a fixed literal id is a
    // primary key on public.sync_log — a crashed run or sibling worktree on the
    // shared local DB would collide on retry); the expected order is DERIVED by
    // sorting the generated ids, so uniqueness costs nothing.
    const ids = Array.from({ length: 7 }, () => crypto.randomUUID());
    for (const [i, id] of ids.entries()) {
      await sql!`insert into public.sync_log (id, drive_file_id, status, message, parse_warnings, occurred_at)
        values (${id}, ${TIED}, ${"applied"}, ${"applied"}, ${sql!.json([
          { code: "STAGE_WORD_AUTOCORRECTED", severity: "warn", message: `corrected 'x' as 'y' #${i}` },
        ])}, ${at})`;
    }
    const r = await build("2099-06-01T12:00:00Z");
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    const tied = r.model.autofix.shows.find((s) => s.showTitle === "Tied")!;
    // Expected order = uuid ascending (id asc), NOT insert order — derived from the
    // run-unique generated ids. Model preserves all 7 (count caps are render-only);
    // index i in the message identifies the source row. NOTE: Postgres orders uuid
    // by byte value, which matches lexicographic order of the lowercase hex string
    // crypto.randomUUID() returns, so a plain string sort is a valid oracle.
    const byIdAsc = [...ids.entries()].sort(([, a], [, b]) => (a < b ? -1 : 1)).map(([i]) => i);
    expect(tied.items).toEqual(byIdAsc.map((i) => `corrected 'x' as 'y' #${i}`));
  });
});
```

Extend `afterAll` cleanup deletes with the new ids (`${MARK}-second`, `${MARK}-tied` in both `sync_log` and `shows` delete lists).

- [ ] **Step 4: Run the full scoped suite to verify pass**

Run: `pnpm vitest run tests/notify tests/parser/dataGaps.test.ts`
Expected: PASS with the local DB up (the rewritten DB proof flips together with the semantics — TDD evidence: the OLD db test red-on-new-code, the NEW one green). DB down → `describe.runIf(dbUp)` self-skips; real CI is the arbiter.

- [ ] **Step 5: Commit (one atomic green commit)**

```bash
git add lib/notify/monitorDigest.ts lib/notify/templates/digest.ts tests/notify/renderDigest.monitor.test.ts tests/notify/renderDigest.newShowGaps.test.ts tests/notify/deliver.test.ts tests/notify/runDigestNotify.monitor.test.ts tests/notify/monitorDigest.autofix.test.ts tests/notify/monitorDigest.autofix.db.test.ts
git commit --no-verify -m "feat(sync): per-show autofix notices in digest — model, ordered query, grouped render, DB proof"
```

---

### Task 4: Full gates + spec docs in tree

**Files:**
- Verify only (no source edits expected). Spec + Flow 6.2 amendments are already committed on this branch.

- [ ] **Step 1: Full suite** — `pnpm test` → expect green (env-bound/e2e tests self-skip locally; real CI is the arbiter for those).
- [ ] **Step 2: Meta-tests explicitly** — `pnpm vitest run tests/notify/_metaInfraContract.test.ts tests/admin/no-inline-email-normalization.test.ts` → green (the second: Task 1 added `.trim()`/`.toLowerCase()`-class string ops in `lib/parser`, which that guard does NOT scan — run to be sure, not to satisfy).
- [ ] **Step 3: Build + lint + format** — `pnpm build`, `pnpm lint` (or the repo's eslint script), `pnpm format:check` → all green. Fix violations (e.g. canonical Tailwind classes rule does not apply here; prettier might reflow new code).
- [ ] **Step 4: Grep sweeps** — `rg -n "accumulateAutoFixes|WarningsRow" lib tests` → zero hits; `rg -n "corrected N values|automatically corrected" lib` → zero hits in source (spec/docs may mention historically).
- [ ] **Step 5: Commit any gate fixes** — `fix(sync): <what the gate caught>` (only if needed).

## Meta-test inventory (declared)

- EXTENDS: none. RUNS: `tests/notify/_metaInfraContract.test.ts` (existing registration `lib/notify/monitorDigest.ts` at `:23` — query modified in place). No advisory-lock topology change (no `pg_advisory*` in diff). No §12.4 code changes, no migrations, no UI surface (email templates are not under `app/`/`components/` — invariant-8 impeccable gate does not fire).
