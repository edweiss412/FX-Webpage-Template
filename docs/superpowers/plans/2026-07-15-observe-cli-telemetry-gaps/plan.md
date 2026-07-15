# Observe CLI Telemetry Read-Gap Fill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six read-only commands (`staged`, `failures`, `warnings`, `synclog`, `deferred`, `watch`) to `pnpm observe`, make `--env validation` resolve from `VALIDATION_*` vars only, and give `--code`/`--source` comma-list support on `events`/`tail`.

**Architecture:** One query module per surface under `lib/observe/query/` (mirrors `queryEvents`), a shared warning serializer as the single redaction chokepoint, formatters in `scripts/observe/format.ts`, adapter branches in `scripts/observe.ts`, fail-closed flag validation in `scripts/observe/args.ts`, and target mapping via `applyResolvedTarget` in `scripts/observe/env.ts`.

**Tech Stack:** TypeScript, supabase-js (PostgREST), vitest, tsx CLI.

**Spec (canonical):** `docs/superpowers/specs/2026-07-15-observe-cli-telemetry-gaps-design.md`. On any conflict, the spec wins.

## Global Constraints

- Read-only hard guarantee: every file in `lib/observe/query/` issues only `.select(...)`, never imports `@/lib/log` (auto-pinned by `tests/observe/_metaReadOnlyQueryCore.test.ts` — recursive walk, no edit needed).
- Every Supabase call destructures `{ data, error }`; returned-error vs thrown distinguished; result type `{ kind: "ok" | "infra_error" }` (AGENTS.md invariant 9).
- Every list read bounded: `.select(SELECT, { count: "exact" }).limit(clampLimit(limit, 100))` — clamp [1,500].
- §5.0 emitted-column trust classification is the emission contract; a column not in that table must not be emitted. `webhook_secret` NEVER selected. `parse_result` never selected wholesale.
- Fail-closed: on the six NEW commands, a present-but-invalid `--session`/`--show`/`--file`/`--status`/`--code`/`--since` is a CLI error (exit 1), never a silent drop. Existing commands keep drop/fallback posture.
- New commands take single-value flags (comma lists only for `events`/`tail` `--code`/`--source`).
- Commit per task, `--no-verify`, conventional commits. Run task-scoped tests before each commit.
- All paths below relative to worktree root `/Users/ericweiss/fxav-worktrees/observe-cli-gaps`.
- Meta-test inventory (declared): EXTENDS `tests/admin/_metaBoundedReads.test.ts`; RELIES ON `tests/observe/_metaReadOnlyQueryCore.test.ts` (auto-walk); CREATES `webhook_secret`-exclusion pin (in `tests/observe/queryWatch.test.ts`). Advisory locks: N/A (read-only). Mutation-surface observability: N/A (zero mutation surfaces).

---

### Task 1: Warning serializer + emittable-code validators

**Files:**
- Create: `lib/observe/query/serializeWarning.ts`
- Modify: `lib/observe/query/index.ts` (add exports)
- Test: `tests/observe/serializeWarning.test.ts`

**Interfaces (Produces):**
```ts
export type SerializedWarning = { severity: string; code: string; message: string; iso?: string; field?: string };
export function serializeParseWarning(raw: unknown, opts: { includePii: boolean }): SerializedWarning;
export function serializeWarningArray(raw: unknown, opts: { includePii: boolean }): SerializedWarning[]; // [] unless raw is an array
export function emitClassDCode(raw: unknown): { code: string; unrecognized: boolean }; // union membership INTERNAL_CODE_ENUMS ∪ isMessageCode
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/observe/serializeWarning.test.ts
import { describe, expect, it } from "vitest";
import {
  serializeParseWarning,
  serializeWarningArray,
  emitClassDCode,
} from "@/lib/observe/query/serializeWarning";

const TOKEN = "AAAABBBBCCCCDDDDEEEEFFFF1234567890"; // 34 chars, matches sanitizer TOKEN class
const EMAIL = "doug@example.com";

describe("serializeParseWarning", () => {
  it("allowlists and sanitizes a real warning", () => {
    const w = serializeParseWarning(
      {
        severity: "warn",
        code: "AGENDA_DAY_EMPTIED",
        message: `contact ${EMAIL} token ${TOKEN}`,
        iso: "2026-07-15",
        field: "dims",
        rawSnippet: `SECRET ${TOKEN} ${EMAIL}`,
        blockRef: { kind: "agenda", name: `leak ${EMAIL}` },
        sourceCell: { tab: "x" },
      },
      { includePii: false },
    );
    expect(w.severity).toBe("warn");
    expect(w.code).toBe("AGENDA_DAY_EMPTIED"); // source parse_warnings.code — passes
    expect(w.message).not.toContain(TOKEN);
    expect(w.message).not.toContain(EMAIL);
    expect(w.iso).toBe("2026-07-15");
    expect(w.field).toBe("dims");
    // dropped fields never appear anywhere
    expect(JSON.stringify(w)).not.toContain("rawSnippet");
    expect(JSON.stringify(w)).not.toContain(TOKEN);
    expect(JSON.stringify(w)).not.toContain(EMAIL);
  });
  it("reveals email in message only with includePii", () => {
    const w = serializeParseWarning(
      { severity: "info", code: "AGENDA_DAY_EMPTIED", message: `by ${EMAIL}` },
      { includePii: true },
    );
    expect(w.message).toContain(EMAIL);
  });
  it("rejects token-shaped values that pass naive shape regexes (Codex R3 F1)", () => {
    const w = serializeParseWarning(
      {
        severity: "warn",
        code: "AAAAAAAAAAAAAAAAAAAAAAAA", // 24 A's — code-shaped, not an enum member
        message: "m",
        field: "abcdefghijklmnopqrstuvwxyz", // 26 chars > 23-cap
        iso: "not-a-date",
      },
      { includePii: false },
    );
    expect(w.code).toBe("");
    expect(w.field).toBeUndefined();
    expect(w.iso).toBeUndefined();
  });
  it("rejects cross-domain enum members in code (Codex R7 F1)", () => {
    // ADMIN_SESSION_LOOKUP_FAILED is in INTERNAL_CODE_ENUMS with source admin_alerts.code
    const w = serializeParseWarning(
      { severity: "warn", code: "ADMIN_SESSION_LOOKUP_FAILED", message: "m" },
      { includePii: false },
    );
    expect(w.code).toBe("");
  });
  it("rejects malformed severity and non-object elements", () => {
    expect(
      serializeParseWarning({ severity: "info<script>", code: "X", message: "m" }, { includePii: false })
        .severity,
    ).toBe("");
    expect(serializeParseWarning("scalar", { includePii: false })).toEqual({
      severity: "",
      code: "",
      message: "",
    });
    expect(serializeParseWarning(null, { includePii: false })).toEqual({
      severity: "",
      code: "",
      message: "",
    });
  });
});

describe("serializeWarningArray", () => {
  it("maps arrays, returns [] for non-arrays (live scalar jsonb case)", () => {
    expect(serializeWarningArray("oops", { includePii: false })).toEqual([]);
    expect(serializeWarningArray({ a: 1 }, { includePii: false })).toEqual([]);
    expect(serializeWarningArray(null, { includePii: false })).toEqual([]);
    expect(
      serializeWarningArray([{ severity: "warn", code: "AGENDA_DAY_EMPTIED", message: "m" }], {
        includePii: false,
      }),
    ).toHaveLength(1);
  });
});

describe("emitClassDCode (INTERNAL_CODE_ENUMS ∪ message catalog)", () => {
  it("passes internal-enum codes", () => {
    expect(emitClassDCode("AGENDA_DAY_EMPTIED")).toEqual({ code: "AGENDA_DAY_EMPTIED", unrecognized: false });
  });
  it("passes catalog-only codes verbatim (Codex R6 F1 — RESCAN_REVIEW_REQUIRED)", () => {
    expect(emitClassDCode("RESCAN_REVIEW_REQUIRED")).toEqual({
      code: "RESCAN_REVIEW_REQUIRED",
      unrecognized: false,
    });
  });
  it("rejects non-members, token-shaped, and non-strings", () => {
    expect(emitClassDCode(TOKEN)).toEqual({ code: "", unrecognized: true });
    expect(emitClassDCode(EMAIL)).toEqual({ code: "", unrecognized: true });
    expect(emitClassDCode(42)).toEqual({ code: "", unrecognized: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/observe/serializeWarning.test.ts`
Expected: FAIL — `Cannot find module '@/lib/observe/query/serializeWarning'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/observe/query/serializeWarning.ts
//
// §5.1 single chokepoint: the ONLY way a ParseWarning jsonb element reaches any
// CLI output path. Allowlist + per-field runtime validation — jsonb is untrusted
// (Codex R1 F1, R2 F2, R3 F1, R7 F1). §5.0 class-D validator for code-valued
// unconstrained columns (Codex R5 F3, R6 F1).
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";
import { isMessageCode } from "@/lib/messages/lookup";

export type SerializedWarning = {
  severity: string;
  code: string;
  message: string;
  iso?: string;
  field?: string;
};

// iso: fixed 10-char date shape; field: max 23 chars — both strictly below the
// sanitizer's 24-char TOKEN floor, so a passing value cannot be token-shaped.
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const FIELD_RE = /^[a-z][a-zA-Z0-9_.-]{0,22}$/;

function isParseWarningCode(code: string): boolean {
  const entry = INTERNAL_CODE_ENUMS[code as keyof typeof INTERNAL_CODE_ENUMS];
  return entry !== undefined && entry.source.includes("parse_warnings.code");
}

export function serializeParseWarning(
  raw: unknown,
  opts: { includePii: boolean },
): SerializedWarning {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { severity: "", code: "", message: "" };
  }
  const r = raw as Record<string, unknown>;
  const severity = r.severity === "info" || r.severity === "warn" ? r.severity : "";
  const code = typeof r.code === "string" && isParseWarningCode(r.code) ? r.code : "";
  const message = sanitizeIdentityString(r.message, opts);
  const out: SerializedWarning = { severity, code, message };
  if (typeof r.iso === "string" && ISO_RE.test(r.iso)) out.iso = r.iso;
  if (typeof r.field === "string" && FIELD_RE.test(r.field)) out.field = r.field;
  return out;
}

export function serializeWarningArray(
  raw: unknown,
  opts: { includePii: boolean },
): SerializedWarning[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((w) => serializeParseWarning(w, opts));
}

// §5.0 class D: code-valued but unconstrained in DDL. Raw emission only on
// membership in INTERNAL_CODE_ENUMS ∪ the §12.4 message catalog — both finite
// generated/curated sets (union: real finalize codes like RESCAN_REVIEW_REQUIRED
// are catalog-only).
export function emitClassDCode(raw: unknown): { code: string; unrecognized: boolean } {
  if (
    typeof raw === "string" &&
    (raw in INTERNAL_CODE_ENUMS || isMessageCode(raw))
  ) {
    return { code: raw, unrecognized: false };
  }
  return { code: "", unrecognized: true };
}
```

Append to `lib/observe/query/index.ts`:

```ts
export {
  serializeParseWarning,
  serializeWarningArray,
  emitClassDCode,
  type SerializedWarning,
} from "./serializeWarning";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/observe/serializeWarning.test.ts tests/observe/_metaReadOnlyQueryCore.test.ts`
Expected: PASS (meta-test auto-covers the new file). If the `@/lib/messages/lookup` import trips the meta-test's `LOG_IMPORT` regex it will fail loud here — it must not (lookup is not `@/lib/log`). Also verify `grep -n 'lib/log' lib/messages/lookup.ts` returns nothing (no transitive app_events write path).

- [ ] **Step 5: Commit**

```bash
git add lib/observe/query/serializeWarning.ts lib/observe/query/index.ts tests/observe/serializeWarning.test.ts
git commit --no-verify -m "feat(infra): observe warning serializer + class-D code validators"
```

---

### Task 2: `queryStagedParses` (pending_syncs)

**Files:**
- Create: `lib/observe/query/staged.ts`
- Modify: `lib/observe/query/types.ts`, `lib/observe/query/index.ts`
- Test: `tests/observe/queryStaged.test.ts`

**Interfaces (Produces):**
```ts
export type StagedFilters = { sessionId?: string; driveFileId?: string; warningsOnly?: boolean; sinceHours?: number | null; limit?: number; includePii?: boolean };
export type StagedRow = { id: string; driveFileId: string; parsedAt: string; stagedModifiedTime: string; sourceKind: string; wizardSessionId: string | null; wizardApproved: boolean; warningSummary: string; lastFinalizeFailureCode: string; lastFinalizeFailureCodeUnrecognized: boolean; warnings: SerializedWarning[]; wizardApprovedByEmail?: string | null };
export type QueryStagedResult = { kind: "ok"; rows: StagedRow[] } | { kind: "infra_error"; message: string };
export async function queryStagedParses(filters: StagedFilters): Promise<QueryStagedResult>;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/observe/queryStaged.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  calls: [] as Array<{ method: string; args: unknown[] }>,
  selectArg: "",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      (...args: unknown[]) => {
        state.calls.push({ method, args });
        if (method === "select") state.selectArg = args[0] as string;
        return builder;
      };
    for (const m of ["select", "eq", "gte", "not", "order"]) builder[m] = chain(m);
    builder.limit = (...args: unknown[]) => {
      state.calls.push({ method: "limit", args });
      return Promise.resolve({ data: state.rows, error: state.error });
    };
    return { from: chain("from") };
  },
}));

import { queryStagedParses } from "@/lib/observe/query/staged";

const SESSION = "8e5568a8-b3cd-4033-9840-18cba07a55c6";
const TOKEN = "AAAABBBBCCCCDDDDEEEEFFFF1234567890";
const baseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  drive_file_id: "1N1PK",
  parsed_at: "2026-07-15T05:19:14Z",
  staged_modified_time: "2026-07-15T05:00:00Z",
  source_kind: "onboarding_scan",
  wizard_session_id: SESSION,
  wizard_approved: false,
  warning_summary: `Strke token ${TOKEN}`,
  last_finalize_failure_code: "RESCAN_REVIEW_REQUIRED",
  warnings: [{ severity: "warn", code: "AGENDA_DAY_EMPTIED", message: "m", rawSnippet: TOKEN }],
};

beforeEach(() => {
  state.rows = [baseRow];
  state.error = null;
  state.calls = [];
  state.selectArg = "";
});

describe("queryStagedParses", () => {
  it("SELECT is the exact §5.0-allowlisted projection (never parse_result wholesale)", async () => {
    await queryStagedParses({});
    expect(state.selectArg).toBe(
      "id, drive_file_id, parsed_at, staged_modified_time, source_kind, wizard_session_id, wizard_approved, warning_summary, last_finalize_failure_code, warnings:parse_result->warnings",
    );
    expect(state.selectArg).not.toMatch(/parse_result(?!->warnings)/);
  });
  it("selects wizard_approved_by_email ONLY under includePii", async () => {
    await queryStagedParses({ includePii: true });
    expect(state.selectArg).toContain("wizard_approved_by_email");
  });
  it("applies filters: session eq, file eq, since gte, warningsOnly ->0 not-is-null pre-cap, bound", async () => {
    await queryStagedParses({ sessionId: SESSION, driveFileId: "1N1PK", warningsOnly: true, sinceHours: 168, limit: 7 });
    const names = state.calls.map((c) => c.method);
    expect(names).toContain("not");
    const not = state.calls.find((c) => c.method === "not")!;
    expect(not.args).toEqual(["parse_result->warnings->0", "is", null]);
    const limitCall = state.calls.find((c) => c.method === "limit")!;
    expect(limitCall.args).toEqual([7]);
    // DB filter ordered before the terminal limit (pre-cap)
    expect(names.indexOf("not")).toBeLessThan(names.indexOf("limit"));
  });
  it("maps rows: warnings serialized (token dropped), class-D code passthrough, count clamp default 100", async () => {
    const r = await queryStagedParses({});
    if (r.kind !== "ok") throw new Error("expected ok");
    const row = r.rows[0]!;
    expect(row.lastFinalizeFailureCode).toBe("RESCAN_REVIEW_REQUIRED");
    expect(row.lastFinalizeFailureCodeUnrecognized).toBe(false);
    expect(JSON.stringify(row.warnings)).not.toContain(TOKEN);
    expect(row.warningSummary).not.toContain(TOKEN);
    expect(state.calls.find((c) => c.method === "limit")!.args).toEqual([100]);
  });
  it("returned error → infra_error; throw → infra_error", async () => {
    state.error = { message: "boom" };
    expect((await queryStagedParses({})).kind).toBe("infra_error");
  });
  it("non-array warnings jsonb → []", async () => {
    state.rows = [{ ...baseRow, warnings: "scalar" }];
    const r = await queryStagedParses({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rows[0]!.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/observe/queryStaged.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/observe/query/types.ts`:

```ts
export type StagedFilters = {
  sessionId?: string;
  driveFileId?: string;
  warningsOnly?: boolean;
  sinceHours?: number | null;
  limit?: number;
  includePii?: boolean;
};
export type StagedRow = {
  id: string;
  driveFileId: string;
  parsedAt: string;
  stagedModifiedTime: string;
  sourceKind: string;
  wizardSessionId: string | null;
  wizardApproved: boolean;
  warningSummary: string;
  lastFinalizeFailureCode: string;
  lastFinalizeFailureCodeUnrecognized: boolean;
  warnings: SerializedWarning[];
  wizardApprovedByEmail?: string | null;
};
export type QueryStagedResult =
  | { kind: "ok"; rows: StagedRow[] }
  | { kind: "infra_error"; message: string };
```

(Import `SerializedWarning` at the top of `types.ts`: `import type { SerializedWarning } from "./serializeWarning";`)

```ts
// lib/observe/query/staged.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
import { serializeWarningArray } from "./serializeWarning";
import { emitClassDCode } from "./serializeWarning";
import { clampLimit, type QueryStagedResult, type StagedFilters, type StagedRow } from "./types";

// §5.0-allowlisted projection. parse_result is NEVER selected wholesale — the
// aliased ->warnings jsonb projection keeps the full show payload off the wire.
const SELECT_BASE =
  "id, drive_file_id, parsed_at, staged_modified_time, source_kind, wizard_session_id, wizard_approved, warning_summary, last_finalize_failure_code, warnings:parse_result->warnings";

type RawRow = {
  id: string;
  drive_file_id: string;
  parsed_at: string;
  staged_modified_time: string;
  source_kind: string;
  wizard_session_id: string | null;
  wizard_approved: boolean;
  warning_summary: string;
  last_finalize_failure_code: string | null;
  warnings: unknown;
  wizard_approved_by_email?: string | null;
};

export async function queryStagedParses(filters: StagedFilters): Promise<QueryStagedResult> {
  try {
    const includePii = filters.includePii ?? false;
    const supabase = createSupabaseServiceRoleClient();
    // PII class F: email column is not fetched at all unless revealed.
    const select = includePii ? `${SELECT_BASE}, wizard_approved_by_email` : SELECT_BASE;
    let query = supabase.from("pending_syncs").select(select, { count: "exact" });
    if (filters.sessionId) query = query.eq("wizard_session_id", filters.sessionId);
    if (filters.driveFileId) query = query.eq("drive_file_id", filters.driveFileId);
    // First-element-exists predicate BEFORE the row cap: excludes empty arrays,
    // NULLs, scalars, and objects DB-side (Codex R1 F2 + R2 F3).
    if (filters.warningsOnly) query = query.not("parse_result->warnings->0", "is", null);
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null) {
      query = query.gte("parsed_at", new Date(Date.now() - sinceHours * 3_600_000).toISOString());
    }
    const { data, error } = await query
      .order("parsed_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "pending_syncs read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r): StagedRow => {
      const finalize = emitClassDCode(r.last_finalize_failure_code ?? "");
      const out: StagedRow = {
        id: r.id,
        driveFileId: r.drive_file_id,
        parsedAt: r.parsed_at,
        stagedModifiedTime: r.staged_modified_time,
        sourceKind: r.source_kind,
        wizardSessionId: r.wizard_session_id,
        wizardApproved: r.wizard_approved,
        warningSummary: sanitizeIdentityString(r.warning_summary, { includePii }),
        lastFinalizeFailureCode: finalize.code,
        lastFinalizeFailureCodeUnrecognized: finalize.unrecognized,
        warnings: serializeWarningArray(r.warnings, { includePii }),
      };
      if (includePii) out.wizardApprovedByEmail = r.wizard_approved_by_email ?? null;
      return out;
    });
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "pending_syncs read threw" };
  }
}
```

Note: an empty-string `last_finalize_failure_code` maps to `{ code: "", unrecognized: true }` — the formatter (Task 8) renders `-` when the raw column was NULL/empty; to distinguish, pass `r.last_finalize_failure_code ?? ""` and have the formatter show `-` when `code === "" && !row.lastFinalizeFailureCodeUnrecognized` is impossible — instead: treat NULL/empty DB value as `{ code: "", unrecognized: false }`:

```ts
const rawCode = r.last_finalize_failure_code;
const finalize =
  rawCode == null || rawCode === "" ? { code: "", unrecognized: false } : emitClassDCode(rawCode);
```

Use this exact guard (a NULL column is "no failure", not "unrecognized code"). Add a test case:

```ts
it("NULL last_finalize_failure_code → empty, NOT flagged unrecognized", async () => {
  state.rows = [{ ...baseRow, last_finalize_failure_code: null }];
  const r = await queryStagedParses({});
  if (r.kind !== "ok") throw new Error("expected ok");
  expect(r.rows[0]!.lastFinalizeFailureCode).toBe("");
  expect(r.rows[0]!.lastFinalizeFailureCodeUnrecognized).toBe(false);
});
```

Export from `lib/observe/query/index.ts`:

```ts
export { queryStagedParses } from "./staged";
export type { StagedFilters, StagedRow, QueryStagedResult } from "./types";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/observe/queryStaged.test.ts tests/observe/_metaReadOnlyQueryCore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/observe/query/staged.ts lib/observe/query/types.ts lib/observe/query/index.ts tests/observe/queryStaged.test.ts
git commit --no-verify -m "feat(infra): observe staged command query core (pending_syncs)"
```

---

### Task 3: `queryIngestFailures` (pending_ingestions)

**Files:**
- Create: `lib/observe/query/failures.ts`
- Modify: `lib/observe/query/types.ts`, `lib/observe/query/index.ts`
- Test: `tests/observe/queryFailures.test.ts`

**Interfaces (Produces):**
```ts
export type FailureFilters = { sessionId?: string; code?: string; sinceHours?: number | null; limit?: number; includePii?: boolean };
export type FailureRow = { id: string; driveFileId: string; driveFileName: string; firstSeenAt: string; lastAttemptAt: string; attemptCount: number; lastErrorCode: string; lastErrorCodeUnrecognized: boolean; lastErrorMessage: string; lastWarnings: SerializedWarning[]; wizardSessionId: string | null };
export type QueryFailuresResult = { kind: "ok"; rows: FailureRow[] } | { kind: "infra_error"; message: string };
export async function queryIngestFailures(filters: FailureFilters): Promise<QueryFailuresResult>;
```

- [ ] **Step 1: Write the failing test** (same mock-builder pattern as Task 2 — copy the `vi.hoisted`/`vi.mock` block verbatim)

```ts
// tests/observe/queryFailures.test.ts — assertions beyond the shared pattern:
it("SELECT exact §5.0 allowlist", async () => {
  await queryIngestFailures({});
  expect(state.selectArg).toBe(
    "id, drive_file_id, drive_file_name, first_seen_at, last_attempt_at, attempt_count, last_error_code, last_error_message, last_warnings, wizard_session_id",
  );
});
it("filters: --code eq matches RAW column value (filter is not an emission); since on last_attempt_at", async () => {
  await queryIngestFailures({ code: "DRIVE_FETCH_FAILED", sinceHours: 1 });
  expect(state.calls.find((c) => c.method === "eq")!.args).toEqual([
    "last_error_code",
    "DRIVE_FETCH_FAILED",
  ]);
  expect(state.calls.find((c) => c.method === "gte")!.args[0]).toBe("last_attempt_at");
});
it("class-D gating on last_error_code; free text sanitized; warnings serialized", async () => {
  const TOKEN = "AAAABBBBCCCCDDDDEEEEFFFF1234567890";
  state.rows = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      drive_file_id: "d",
      drive_file_name: `name ${TOKEN}`,
      first_seen_at: "t",
      last_attempt_at: "t",
      attempt_count: 3,
      last_error_code: TOKEN, // token-shaped garbage — not a member
      last_error_message: `msg ${TOKEN}`,
      last_warnings: [{ severity: "warn", code: "AGENDA_DAY_EMPTIED", message: "m", rawSnippet: TOKEN }],
      wizard_session_id: null,
    },
  ];
  const r = await queryIngestFailures({});
  if (r.kind !== "ok") throw new Error("expected ok");
  const row = r.rows[0]!;
  expect(row.lastErrorCode).toBe("");
  expect(row.lastErrorCodeUnrecognized).toBe(true);
  expect(JSON.stringify(row)).not.toContain(TOKEN);
});
```

- [ ] **Step 2: Run — expect FAIL** (`pnpm vitest run tests/observe/queryFailures.test.ts`)

- [ ] **Step 3: Implementation** — mirror `staged.ts` structure exactly:

```ts
// lib/observe/query/failures.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
import { emitClassDCode, serializeWarningArray } from "./serializeWarning";
import { clampLimit, type FailureFilters, type FailureRow, type QueryFailuresResult } from "./types";

const SELECT =
  "id, drive_file_id, drive_file_name, first_seen_at, last_attempt_at, attempt_count, last_error_code, last_error_message, last_warnings, wizard_session_id";

type RawRow = {
  id: string;
  drive_file_id: string;
  drive_file_name: string;
  first_seen_at: string;
  last_attempt_at: string;
  attempt_count: number;
  last_error_code: string;
  last_error_message: string;
  last_warnings: unknown;
  wizard_session_id: string | null;
};

export async function queryIngestFailures(filters: FailureFilters): Promise<QueryFailuresResult> {
  try {
    const includePii = filters.includePii ?? false;
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase.from("pending_ingestions").select(SELECT, { count: "exact" });
    if (filters.sessionId) query = query.eq("wizard_session_id", filters.sessionId);
    if (filters.code) query = query.eq("last_error_code", filters.code);
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null) {
      query = query.gte(
        "last_attempt_at",
        new Date(Date.now() - sinceHours * 3_600_000).toISOString(),
      );
    }
    const { data, error } = await query
      .order("last_attempt_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "pending_ingestions read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r): FailureRow => {
      const code = emitClassDCode(r.last_error_code);
      return {
        id: r.id,
        driveFileId: r.drive_file_id,
        driveFileName: sanitizeIdentityString(r.drive_file_name, { includePii }),
        firstSeenAt: r.first_seen_at,
        lastAttemptAt: r.last_attempt_at,
        attemptCount: r.attempt_count,
        lastErrorCode: code.code,
        lastErrorCodeUnrecognized: code.unrecognized,
        lastErrorMessage: sanitizeIdentityString(r.last_error_message, { includePii }),
        lastWarnings: serializeWarningArray(r.last_warnings, { includePii }),
        wizardSessionId: r.wizard_session_id,
      };
    });
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "pending_ingestions read threw" };
  }
}
```

Types in `types.ts` per the Interfaces block; exports in `index.ts` (`queryIngestFailures`, `FailureFilters`, `FailureRow`, `QueryFailuresResult`).

- [ ] **Step 4: Run — expect PASS** (`pnpm vitest run tests/observe/queryFailures.test.ts tests/observe/_metaReadOnlyQueryCore.test.ts`)

- [ ] **Step 5: Commit**

```bash
git add lib/observe/query/failures.ts lib/observe/query/types.ts lib/observe/query/index.ts tests/observe/queryFailures.test.ts
git commit --no-verify -m "feat(infra): observe failures command query core (pending_ingestions)"
```

---

### Task 4: `queryPublishedWarnings` (shows_internal)

**Files:**
- Create: `lib/observe/query/warnings.ts`
- Modify: `lib/observe/query/types.ts`, `lib/observe/query/index.ts`
- Test: `tests/observe/queryWarnings.test.ts`

**Interfaces (Produces):**
```ts
export type PublishedWarningsFilters = { showId?: string; limit?: number; includePii?: boolean };
export type PublishedWarningsRow = { showId: string; showTitle: string | null; showSlug: string | null; warnings: SerializedWarning[] };
export type QueryPublishedWarningsResult = { kind: "ok"; rows: PublishedWarningsRow[] } | { kind: "infra_error"; message: string };
export async function queryPublishedWarnings(filters: PublishedWarningsFilters): Promise<QueryPublishedWarningsResult>;
```

- [ ] **Step 1: Failing test** (shared mock pattern; embed-shape handling like `events.ts:37`):

```ts
it("SELECT: embed via FK, never financials/raw_unrecognized", async () => {
  await queryPublishedWarnings({});
  expect(state.selectArg).toBe("show_id, parse_warnings, shows(title, slug)");
});
it("non-empty filter is DB-side first-element predicate, pre-cap; ordered by show_id", async () => {
  await queryPublishedWarnings({});
  expect(state.calls.find((c) => c.method === "not")!.args).toEqual([
    "parse_warnings->0",
    "is",
    null,
  ]);
  expect(state.calls.find((c) => c.method === "order")!.args[0]).toBe("show_id");
});
it("--show filter eq; warnings serialized; embed array/object both map", async () => {
  state.rows = [
    {
      show_id: "22222222-2222-4222-8222-222222222222",
      parse_warnings: [{ severity: "warn", code: "AGENDA_DAY_EMPTIED", message: "m" }],
      shows: [{ title: "East Coast", slug: "east-coast" }],
    },
  ];
  const r = await queryPublishedWarnings({ showId: "22222222-2222-4222-8222-222222222222" });
  if (r.kind !== "ok") throw new Error("expected ok");
  expect(r.rows[0]!.showTitle).toBe("East Coast");
  expect(r.rows[0]!.warnings).toHaveLength(1);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implementation**

```ts
// lib/observe/query/warnings.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { serializeWarningArray } from "./serializeWarning";
import {
  clampLimit,
  type PublishedWarningsFilters,
  type PublishedWarningsRow,
  type QueryPublishedWarningsResult,
} from "./types";

// §5.0: financials / raw_unrecognized are NEVER selected. shows(title, slug)
// embed rides the shows_internal.show_id → shows(id) FK (class H precedent —
// events/alerts already print title/slug raw).
const SELECT = "show_id, parse_warnings, shows(title, slug)";

type RawRow = {
  show_id: string;
  parse_warnings: unknown;
  shows: { title: string | null; slug: string | null } | { title: string | null; slug: string | null }[] | null;
};

export async function queryPublishedWarnings(
  filters: PublishedWarningsFilters,
): Promise<QueryPublishedWarningsResult> {
  try {
    const includePii = filters.includePii ?? false;
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase
      .from("shows_internal")
      .select(SELECT, { count: "exact" })
      // First-element-exists, BEFORE the cap: warning-free/NULL/malformed rows
      // can never consume the page (Codex R1 F2 + R2 F3).
      .not("parse_warnings->0", "is", null);
    if (filters.showId) query = query.eq("show_id", filters.showId);
    const { data, error } = await query
      .order("show_id", { ascending: true })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "shows_internal read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r): PublishedWarningsRow => {
      const show = Array.isArray(r.shows) ? r.shows[0] : r.shows;
      return {
        showId: r.show_id,
        showTitle: show?.title ?? null,
        showSlug: show?.slug ?? null,
        warnings: serializeWarningArray(r.parse_warnings, { includePii }),
      };
    });
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "shows_internal read threw" };
  }
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `feat(infra): observe warnings command query core (shows_internal)`

---

### Task 5: `querySyncLog` (sync_log)

**Files:**
- Create: `lib/observe/query/syncLog.ts`
- Modify: `lib/observe/query/types.ts`, `lib/observe/query/index.ts`
- Test: `tests/observe/querySyncLog.test.ts`

**Interfaces (Produces):**
```ts
export type SyncLogFilters = { showId?: string; driveFileId?: string; status?: string; sinceHours?: number | null; limit?: number; includePii?: boolean };
export type SyncLogRow = { id: string; showId: string | null; driveFileId: string | null; status: string; message: string; warningCount: number; warnings: SerializedWarning[]; durationMs: number | null; occurredAt: string };
export type QuerySyncLogResult = { kind: "ok"; rows: SyncLogRow[] } | { kind: "infra_error"; message: string };
export async function querySyncLog(filters: SyncLogFilters): Promise<QuerySyncLogResult>;
```

- [ ] **Step 1: Failing test** — key assertions:

```ts
it("SELECT exact; since on occurred_at (column is occurred_at NOT created_at)", async () => {
  await querySyncLog({ sinceHours: 24 });
  expect(state.selectArg).toBe(
    "id, show_id, drive_file_id, status, message, parse_warnings, duration_ms, occurred_at",
  );
  expect(state.calls.find((c) => c.method === "gte")!.args[0]).toBe("occurred_at");
});
it("status is class C (unconstrained text): sanitized, lossless for real values", async () => {
  const TOKEN = "AAAABBBBCCCCDDDDEEEEFFFF1234567890";
  state.rows = [
    { id: "i", show_id: null, drive_file_id: "d", status: `watermark ${TOKEN}`, message: `m ${TOKEN}`, parse_warnings: "scalar", duration_ms: 12, occurred_at: "t" },
  ];
  const r = await querySyncLog({});
  if (r.kind !== "ok") throw new Error("expected ok");
  expect(r.rows[0]!.status).toContain("watermark");
  expect(JSON.stringify(r.rows[0])).not.toContain(TOKEN);
  expect(r.rows[0]!.warningCount).toBe(0); // scalar jsonb guard
  expect(r.rows[0]!.warnings).toEqual([]);
});
it("filters: show eq, file eq, status eq (raw match for filtering)", async () => {
  await querySyncLog({ showId: "22222222-2222-4222-8222-222222222222", driveFileId: "d", status: "watermark" });
  const eqArgs = state.calls.filter((c) => c.method === "eq").map((c) => c.args);
  expect(eqArgs).toContainEqual(["show_id", "22222222-2222-4222-8222-222222222222"]);
  expect(eqArgs).toContainEqual(["drive_file_id", "d"]);
  expect(eqArgs).toContainEqual(["status", "watermark"]);
});
```

- [ ] **Step 2: FAIL** → **Step 3: Implementation:**

```ts
// lib/observe/query/syncLog.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
import { serializeWarningArray } from "./serializeWarning";
import { clampLimit, type QuerySyncLogResult, type SyncLogFilters, type SyncLogRow } from "./types";

const SELECT = "id, show_id, drive_file_id, status, message, parse_warnings, duration_ms, occurred_at";

type RawRow = {
  id: string;
  show_id: string | null;
  drive_file_id: string | null;
  status: string;
  message: string | null;
  parse_warnings: unknown;
  duration_ms: number | null;
  occurred_at: string;
};

export async function querySyncLog(filters: SyncLogFilters): Promise<QuerySyncLogResult> {
  try {
    const includePii = filters.includePii ?? false;
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase.from("sync_log").select(SELECT, { count: "exact" });
    if (filters.showId) query = query.eq("show_id", filters.showId);
    if (filters.driveFileId) query = query.eq("drive_file_id", filters.driveFileId);
    if (filters.status) query = query.eq("status", filters.status);
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null) {
      query = query.gte("occurred_at", new Date(Date.now() - sinceHours * 3_600_000).toISOString());
    }
    const { data, error } = await query
      .order("occurred_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "sync_log read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r): SyncLogRow => ({
      id: r.id,
      showId: r.show_id,
      driveFileId: r.drive_file_id,
      // §5.0 class C: sync_log.status is unconstrained text in the DDL — sanitized
      // (lossless for real values like "watermark"; token-proof for garbage).
      status: sanitizeIdentityString(r.status, { includePii }),
      message: sanitizeIdentityString(r.message, { includePii }),
      warningCount: Array.isArray(r.parse_warnings) ? r.parse_warnings.length : 0,
      warnings: serializeWarningArray(r.parse_warnings, { includePii }),
      durationMs: r.duration_ms,
      occurredAt: r.occurred_at,
    }));
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "sync_log read threw" };
  }
}
```

Types per the Interfaces block into `types.ts`; exports (`querySyncLog`, `SyncLogFilters`, `SyncLogRow`, `QuerySyncLogResult`) into `index.ts`.

- [ ] **Step 4: PASS** (`pnpm vitest run tests/observe/querySyncLog.test.ts tests/observe/_metaReadOnlyQueryCore.test.ts`) → **Step 5: Commit** `feat(infra): observe synclog command query core (sync_log)`

---

### Task 6: `queryDeferred` + `queryWatchChannels`

**Files:**
- Create: `lib/observe/query/deferred.ts`, `lib/observe/query/watch.ts`
- Modify: `lib/observe/query/types.ts`, `lib/observe/query/index.ts`
- Test: `tests/observe/queryDeferred.test.ts`, `tests/observe/queryWatch.test.ts`

**Interfaces (Produces):**
```ts
export type DeferredFilters = { limit?: number; includePii?: boolean };
export type DeferredRow = { id: string; driveFileId: string; wizardSessionId: string | null; deferredKind: string; deferredAt: string; deferredAtModifiedTime: string | null; reason: string; deferredByEmail?: string | null };
export type QueryDeferredResult = { kind: "ok"; rows: DeferredRow[] } | { kind: "infra_error"; message: string };
export type WatchFilters = { limit?: number };
export type WatchRow = { id: string; status: string; watchedFolderId: string; resourceId: string | null; expiresAt: string | null; createdAt: string; activatedAt: string | null; supersededAt: string | null; stoppedAt: string | null };
export type QueryWatchResult = { kind: "ok"; rows: WatchRow[] } | { kind: "infra_error"; message: string };
```

- [ ] **Step 1: Failing tests.** `queryDeferred.test.ts`: SELECT without email by default (`"id, drive_file_id, wizard_session_id, deferred_kind, deferred_at, deferred_at_modified_time, reason"`), `+ ", deferred_by_email"` under `includePii`; `reason` sanitized; order `deferred_at` desc; bound. `queryWatch.test.ts`: SELECT exactly `"id, status, watched_folder_id, resource_id, expires_at, created_at, activated_at, superseded_at, stopped_at"`; order `created_at` desc; PLUS the structural secret pin:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
it("STRUCTURAL PIN: module source never references webhook_secret and never selects *", () => {
  const src = readFileSync(join(process.cwd(), "lib/observe/query/watch.ts"), "utf8");
  expect(src).not.toContain("webhook_secret");
  expect(src).not.toMatch(/select\(\s*["'`]\s*\*\s*["'`]/);
});
```

- [ ] **Step 2: FAIL** → **Step 3: Implementation:**

```ts
// lib/observe/query/deferred.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
import { clampLimit, type DeferredFilters, type DeferredRow, type QueryDeferredResult } from "./types";

const SELECT_BASE =
  "id, drive_file_id, wizard_session_id, deferred_kind, deferred_at, deferred_at_modified_time, reason";

type RawRow = {
  id: string;
  drive_file_id: string;
  wizard_session_id: string | null;
  deferred_kind: string;
  deferred_at: string;
  deferred_at_modified_time: string | null;
  reason: string | null;
  deferred_by_email?: string | null;
};

export async function queryDeferred(filters: DeferredFilters): Promise<QueryDeferredResult> {
  try {
    const includePii = filters.includePii ?? false;
    const supabase = createSupabaseServiceRoleClient();
    // §5.0 class F: deferred_by_email fetched only under --reveal-email.
    const select = includePii ? `${SELECT_BASE}, deferred_by_email` : SELECT_BASE;
    const { data, error } = await supabase
      .from("deferred_ingestions")
      .select(select, { count: "exact" })
      .order("deferred_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "deferred_ingestions read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r): DeferredRow => {
      const out: DeferredRow = {
        id: r.id,
        driveFileId: r.drive_file_id,
        wizardSessionId: r.wizard_session_id,
        deferredKind: r.deferred_kind, // §5.0 class B: CHECK-constrained enum
        deferredAt: r.deferred_at,
        deferredAtModifiedTime: r.deferred_at_modified_time,
        reason: sanitizeIdentityString(r.reason, { includePii }),
      };
      if (includePii) out.deferredByEmail = r.deferred_by_email ?? null;
      return out;
    });
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "deferred_ingestions read threw" };
  }
}
```

```ts
// lib/observe/query/watch.ts
// §5.0: webhook_secret is NEVER selected (live shared secret) — structural pin
// in tests/observe/queryWatch.test.ts scans this file. No free-text columns
// (status is CHECK-constrained, class B) — no sanitizer needed.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { clampLimit, type QueryWatchResult, type WatchFilters, type WatchRow } from "./types";

const SELECT =
  "id, status, watched_folder_id, resource_id, expires_at, created_at, activated_at, superseded_at, stopped_at";

type RawRow = {
  id: string;
  status: string;
  watched_folder_id: string;
  resource_id: string | null;
  expires_at: string | null;
  created_at: string;
  activated_at: string | null;
  superseded_at: string | null;
  stopped_at: string | null;
};

export async function queryWatchChannels(filters: WatchFilters): Promise<QueryWatchResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("drive_watch_channels")
      .select(SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "drive_watch_channels read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r): WatchRow => ({
      id: r.id,
      status: r.status,
      watchedFolderId: r.watched_folder_id,
      resourceId: r.resource_id,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      activatedAt: r.activated_at,
      supersededAt: r.superseded_at,
      stoppedAt: r.stopped_at,
    }));
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "drive_watch_channels read threw" };
  }
}
```

Types per the Interfaces block into `types.ts`; exports (`queryDeferred`, `queryWatchChannels` + the four types) into `index.ts`.

- [ ] **Step 4: PASS + meta-test** (`pnpm vitest run tests/observe/queryDeferred.test.ts tests/observe/queryWatch.test.ts tests/observe/_metaReadOnlyQueryCore.test.ts`) → **Step 5: Commit** `feat(infra): observe deferred + watch command query cores`

---

### Task 7: args — new commands, fail-closed validation, comma lists

**Files:**
- Modify: `scripts/observe/args.ts`, `lib/admin/telemetryTypes.ts` (AppEventFilters plural fields), `lib/observe/query/events.ts` (`.in` filters)
- Test: `tests/observe/args.test.ts` (extend), `tests/observe/queryEvents.test.ts` (extend)

**Interfaces (Produces):**
```ts
// ParsedArgs ok-variant gains:
stagedFilters: StagedFilters; failureFilters: FailureFilters; warningsFilters: PublishedWarningsFilters;
syncLogFilters: SyncLogFilters; deferredFilters: DeferredFilters; watchFilters: WatchFilters;
// AppEventFilters gains: codes?: string[]; sources?: string[];
// ObserveCommand union gains: "staged" | "failures" | "warnings" | "synclog" | "deferred" | "watch"
```

- [ ] **Step 1: Failing tests** (append to `tests/observe/args.test.ts`):

```ts
const SESSION = "8e5568a8-b3cd-4033-9840-18cba07a55c6";

describe("new-command fail-closed validation (Codex R4 F1 / R5 F1)", () => {
  it.each([
    [["staged", "--session", "not-a-uuid"], /--session must be a UUID/],
    [["staged", "--session", "not-a-uuid", "--reveal-email"], /--session must be a UUID/],
    [["warnings", "--show", "not-a-uuid"], /--show must be a UUID/],
    [["synclog", "--file", ""], /--file/],
    [["failures", "--code", "x".repeat(201)], /--code/],
    [["staged", "--since", "30d"], /--since must be 1h\|24h\|7d\|all/],
    [["synclog", "--status", ""], /--status/],
  ])("%j → kind error", (argv, re) => {
    const p = parseObserveArgs(argv as string[]);
    expect(p.kind).toBe("error");
    if (p.kind === "error") expect(p.message).toMatch(re);
  });
  it("existing events posture unchanged: bad --show / --since silently fall back", () => {
    const p = parseObserveArgs(["events", "--show", "not-a-uuid", "--since", "30d"]);
    expect(p.kind).toBe("ok");
    if (p.kind === "ok") {
      expect(p.eventFilters.showId).toBeUndefined();
      expect(p.eventFilters.sinceHours).toBe(24);
    }
  });
  it("valid staged flags map to stagedFilters incl. includePii from --reveal-email", () => {
    const p = parseObserveArgs(["staged", "--session", SESSION, "--warnings-only", "--full", "--reveal-email"]);
    expect(p.kind).toBe("ok");
    if (p.kind === "ok") {
      expect(p.stagedFilters).toMatchObject({ sessionId: SESSION, warningsOnly: true, includePii: true });
      expect(p.full).toBe(true);
    }
  });
});

describe("comma lists on events/tail --code/--source (spec §3.2)", () => {
  it("single token → singular field (back-compat)", () => {
    const p = parseObserveArgs(["events", "--code", "A", "--source", "sync"]);
    if (p.kind !== "ok") throw new Error("expected ok");
    expect(p.eventFilters.code).toBe("A");
    expect(p.eventFilters.codes).toBeUndefined();
  });
  it("multi token → plural field, empties dropped", () => {
    const p = parseObserveArgs(["events", "--code", "A,B,,C", "--source", "s1,s2"]);
    if (p.kind !== "ok") throw new Error("expected ok");
    expect(p.eventFilters.codes).toEqual(["A", "B", "C"]);
    expect(p.eventFilters.code).toBeUndefined();
    expect(p.eventFilters.sources).toEqual(["s1", "s2"]);
  });
});
```

Extend `tests/observe/queryEvents.test.ts` (existing mock pattern in that file):

```ts
it("plural codes/sources use .in; plural wins over singular", async () => {
  await queryEvents({ codes: ["A", "B"], sources: ["s1"], code: "ignored", source: "ignored" });
  const inArgs = state.calls.filter((c) => c.method === "in").map((c) => c.args);
  expect(inArgs).toContainEqual(["code", ["A", "B"]]);
  expect(inArgs).toContainEqual(["source", ["s1"]]);
});
```

(Adapt to that file's actual mock-state shape — read it first; it already tests `.eq` filters.)

- [ ] **Step 2: Run both — expect FAIL**

- [ ] **Step 3: Implementation.**

`lib/admin/telemetryTypes.ts` — add to `AppEventFilters` (line ~20): `codes?: string[]; sources?: string[];` (optional fields; `parseAppEventFilters` untouched).

`lib/observe/query/events.ts` — replace the two `.eq` lines:

```ts
if (filters.sources?.length) query = query.in("source", filters.sources);
else if (filters.source) query = query.eq("source", filters.source);
if (filters.codes?.length) query = query.in("code", filters.codes);
else if (filters.code) query = query.eq("code", filters.code);
```

`scripts/observe/args.ts` — additions:

```ts
export type ObserveCommand =
  | "events" | "alerts" | "cron" | "changes" | "codes" | "tail" | "help"
  | "staged" | "failures" | "warnings" | "synclog" | "deferred" | "watch";
const COMMANDS: ObserveCommand[] = [
  "events", "alerts", "cron", "changes", "codes", "tail", "help",
  "staged", "failures", "warnings", "synclog", "deferred", "watch",
];
const NEW_COMMANDS = new Set(["staged", "failures", "warnings", "synclog", "deferred", "watch"]);
const SINCE_TOKENS = new Set(["1h", "24h", "7d", "all"]);
```

parseArgs options additions: `session: { type: "string" }, file: { type: "string" }, status: { type: "string" }, full: { type: "boolean", default: false }, "warnings-only": { type: "boolean", default: false }`.

Fail-closed validator, run only when `NEW_COMMANDS.has(command)` (before building filter objects; helper returns the error `ParsedArgs` variant):

```ts
function requireValid(command: string, values: Record<string, unknown>): { kind: "error"; message: string } | null {
  const err = (m: string) => ({ kind: "error" as const, message: m });
  const bad = (v: unknown) => typeof v === "string" && (v.trim().length === 0 || v.trim().length > 200);
  if (typeof values.session === "string" && !isUuid(values.session.trim()))
    return err("--session must be a UUID");
  if (typeof values.show === "string" && !isUuid(values.show.trim()))
    return err("--show must be a UUID");
  if (bad(values.file)) return err("--file must be a non-empty string of at most 200 chars");
  if (bad(values.status)) return err("--status must be a non-empty string of at most 200 chars");
  if (bad(values.code)) return err("--code must be a non-empty string of at most 200 chars");
  if (typeof values.since === "string" && !SINCE_TOKENS.has(values.since))
    return err("--since must be 1h|24h|7d|all");
  return null;
}
```

Comma-list split (events/tail only):

```ts
const codeTokens = (values.code ?? "").split(",").map((s) => s.trim()).filter(Boolean).filter((s) => s.length <= 200);
const sourceTokens = (values.source ?? "").split(",").map((s) => s.trim()).filter(Boolean).filter((s) => s.length <= 200);
// eventFilters:
...(sourceTokens.length === 1 ? { source: sourceTokens[0]! } : {}),
...(sourceTokens.length > 1 ? { sources: sourceTokens } : {}),
...(codeTokens.length === 1 ? { code: codeTokens[0]! } : {}),
...(codeTokens.length > 1 ? { codes: codeTokens } : {}),
```

NOTE: `alertFilters.code` keeps the old single-value `cap(values.code)` (comma-list out of scope for alerts). New-command filter objects built with `exactOptionalPropertyTypes`-safe spreads (same idiom as `eventFilters`, `scripts/observe/args.ts:99-107`), each including `includePii: revealEmail` for `staged`/`deferred` and `...(limit !== undefined ? { limit } : {})`. `ParsedArgs` ok-variant gains `full: boolean` and the six filter objects.

- [ ] **Step 4: Run — expect PASS**: `pnpm vitest run tests/observe/args.test.ts tests/observe/queryEvents.test.ts`
- [ ] **Step 5: Commit**

```bash
git add scripts/observe/args.ts lib/admin/telemetryTypes.ts lib/observe/query/events.ts tests/observe/args.test.ts tests/observe/queryEvents.test.ts
git commit --no-verify -m "feat(infra): observe new-command args (fail-closed) + events comma-list filters"
```

---

### Task 8: formatters + adapter branches + USAGE

**Files:**
- Modify: `scripts/observe/format.ts`, `scripts/observe.ts`
- Test: `tests/observe/format.test.ts` (extend), `tests/observe/dispatch.test.ts` (extend)

**Interfaces (Produces):** `formatStaged(rows, json, full)`, `formatFailures(rows, json)`, `formatPublishedWarnings(rows, json)`, `formatSyncLog(rows, json)`, `formatDeferred(rows, json)`, `formatWatch(rows, json)` — all `(rows: XRow[], json: boolean) => string`, `(no rows)` on empty. `ObserveDeps` gains the six query functions.

- [ ] **Step 1: Failing tests.** `format.test.ts`: per formatter — empty → `(no rows)`; `--json` → `JSON.stringify(rows)`; table line contains the §2 output-row fields; `formatStaged` with `full=false` shows `warningSummary` + count, with `full=true` one line per serialized warning (`severity  code  message`); class-D `UNKNOWN_CODE` rendering when `lastErrorCodeUnrecognized`. `dispatch.test.ts` (extends existing `runObserve` tests — read the file's dep-stub pattern first): each new command routes to its query dep with the parsed filters; infra_error → exit 1; `--reveal-email` on `staged`/`deferred` prints the PII stderr warning (same string as alerts, `scripts/observe.ts:110-112`); invalid-filter args error → exit 1 and the query dep is NEVER called:

```ts
it("staged --session not-a-uuid: exit 1, query never called (fail-closed at dispatch)", async () => {
  const deps = makeDeps();
  const r = await runObserve(["staged", "--session", "nope"], deps);
  expect(r.exitCode).toBe(1);
  expect(deps.queryStagedParses).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: FAIL** → **Step 3: Implementation.** Formatters follow `formatChanges` shape (`scripts/observe/format.ts:45`). `formatStaged` table line: `${r.parsedAt}  ${r.driveFileId.padEnd(44)}  ${r.sourceKind.padEnd(15)}  ${r.wizardApproved ? "approved" : "pending "}  w:${r.warnings.length}  ${trunc(r.warningSummary, 60)}`, plus when `full`: warning lines `    ${w.severity.padEnd(5)}  ${w.code.padEnd(28)}  ${trunc(w.message)}`. Class-D display helper: `const codeCell = (code: string, unrecognized: boolean) => (unrecognized ? "UNKNOWN_CODE" : code || "-");`. `runObserve` branches (after `changes`, same shape): destructure new deps; `staged`/`deferred` emit the reveal-email stderr warning when `parsed.revealEmail`. USAGE gains six lines. Entry `deps` object gains the six real imports.

- [ ] **Step 4: PASS**: `pnpm vitest run tests/observe/format.test.ts tests/observe/dispatch.test.ts`
- [ ] **Step 5: Commit** — `feat(infra): observe staged/failures/warnings/synclog/deferred/watch CLI wiring`

---

### Task 9: env — VALIDATION_*-only `--env validation` + applyResolvedTarget

**Files:**
- Modify: `scripts/observe/env.ts`, `scripts/observe.ts` (entry + runObserve + runTailFollow)
- Test: `tests/observe/env.test.ts` (extend), `tests/observe/dispatch.test.ts` (extend)

**Interfaces (Produces):**
```ts
export type TargetResult =
  | { kind: "ok"; envName: "local" | "validation" | "prod"; url?: string; key?: string }
  | { kind: "error"; message: string };
export function applyResolvedTarget(target: TargetResult, env?: NodeJS.ProcessEnv): void; // no-op unless ok+mapped pair
```

- [ ] **Step 1: Failing tests** (`env.test.ts`):

```ts
const V = {
  VALIDATION_SUPABASE_URL: "https://vzakgrxqwcalbmagufjh.supabase.co",
  VALIDATION_SUPABASE_SECRET_KEY: "k",
  VALIDATION_SUPABASE_PROJECT_REF: "vzakgrxqwcalbmagufjh",
};
describe("--env validation is VALIDATION_*-only (Codex R3 F2)", () => {
  it("full valid triple → ok + mapped pair, regardless of ambient", () => {
    const r = resolveTarget("validation", { ...V, SUPABASE_URL: "https://prod-other.supabase.co" });
    expect(r).toEqual({ kind: "ok", envName: "validation", url: V.VALIDATION_SUPABASE_URL, key: "k" });
  });
  it.each([
    ["URL absent", { VALIDATION_SUPABASE_SECRET_KEY: "k", VALIDATION_SUPABASE_PROJECT_REF: "r" }],
    ["URL loopback", { ...V, VALIDATION_SUPABASE_URL: "http://127.0.0.1:54321" }],
    ["secret absent", { VALIDATION_SUPABASE_URL: V.VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_PROJECT_REF: "vzakgrxqwcalbmagufjh" }],
    ["ref absent", { VALIDATION_SUPABASE_URL: V.VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY: "k" }],
    ["ref mismatch", { ...V, VALIDATION_SUPABASE_PROJECT_REF: "otherref" }],
    ["branch-preview host", { ...V, VALIDATION_SUPABASE_URL: "https://vzakgrxqwcalbmagufjh--branch.supabase.co" }],
    ["plain http", { ...V, VALIDATION_SUPABASE_URL: "http://vzakgrxqwcalbmagufjh.supabase.co" }],
  ])("%s → hard error even with valid ambient (never fall-through)", (_name, env) => {
    const r = resolveTarget("validation", { ...env, SUPABASE_URL: "https://prod-other.supabase.co", SUPABASE_SECRET_KEY: "ak" });
    expect(r.kind).toBe("error");
  });
  it("local + prod paths byte-identical to before", () => {
    expect(resolveTarget(undefined, {})).toEqual({ kind: "ok", envName: "local" });
    expect(resolveTarget(undefined, { SUPABASE_URL: "https://x.supabase.co" }).kind).toBe("error");
    expect(resolveTarget("prod", { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "k" })).toEqual({ kind: "ok", envName: "prod" });
    expect(resolveTarget("prod", { SUPABASE_URL: "http://127.0.0.1:54321" }).kind).toBe("error");
  });
});
describe("applyResolvedTarget (Codex R5 F2)", () => {
  it("assigns mapped pair; no-op for unmapped/local/error", () => {
    const env: Record<string, string | undefined> = {};
    applyResolvedTarget({ kind: "ok", envName: "validation", url: "u", key: "k" }, env as NodeJS.ProcessEnv);
    expect(env.SUPABASE_URL).toBe("u");
    expect(env.SUPABASE_SECRET_KEY).toBe("k");
    const env2: Record<string, string | undefined> = {};
    applyResolvedTarget({ kind: "ok", envName: "local" }, env2 as NodeJS.ProcessEnv);
    expect(env2.SUPABASE_URL).toBeUndefined();
  });
});
```

`dispatch.test.ts` boundary test: `runObserve(["staged", "--env", "validation"], deps)` with `deps.env` = full valid triple and a `queryStagedParses` stub that records `process.env.SUPABASE_URL` at call time → equals the `VALIDATION_*` URL (save/restore `process.env` around the test). Structural tail pin: read `scripts/observe.ts` source, assert `runTailFollow` body calls `applyResolvedTarget` before its first `collectEvents` (`src.indexOf("applyResolvedTarget", tailFnStart) < src.indexOf("collectEvents", tailFnStart)`).

- [ ] **Step 2: FAIL** → **Step 3: Implementation.**

`scripts/observe/env.ts` — validation branch replaces the current one:

```ts
import {
  assertProdEquivalentTarget,
  assertSupabaseTargetMatchesProjectRef,
} from "../lib/validation-target";

if (name === "validation") {
  const vUrl = ambient.VALIDATION_SUPABASE_URL;
  const vKey = ambient.VALIDATION_SUPABASE_SECRET_KEY;
  if (!vUrl || isLoopback(vUrl) || !vKey) {
    return {
      kind: "error",
      message:
        "--env validation requires VALIDATION_SUPABASE_URL (hosted https) + VALIDATION_SUPABASE_SECRET_KEY (+ matching VALIDATION_SUPABASE_PROJECT_REF) in .env.local; use --env prod for an explicit ambient remote target",
    };
  }
  try {
    assertProdEquivalentTarget(vUrl, false);
    assertSupabaseTargetMatchesProjectRef(vUrl, ambient.VALIDATION_SUPABASE_PROJECT_REF, false);
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "validation target binding failed" };
  }
  return { kind: "ok", envName: "validation", url: vUrl, key: vKey };
}
```

(`isLoopback` here treats only genuinely-loopback URLs as loopback — an ABSENT url is handled by the `!vUrl` clause first, so the `isLoopback(undefined) → true` quirk never mislabels.) Add:

```ts
export function applyResolvedTarget(target: TargetResult, env: NodeJS.ProcessEnv = process.env): void {
  if (target.kind !== "ok" || !target.url || !target.key) return;
  env.SUPABASE_URL = target.url;
  env.SUPABASE_SECRET_KEY = target.key;
}
```

`scripts/observe.ts`: `import { loadValidationEnv } from "./lib/validation-env";` — call `loadValidationEnv()` first inside the `isEntry` block; add `applyResolvedTarget(target)` immediately after each of the two `resolveTarget` success paths (in `runObserve` after line 100's guard, and in `runTailFollow` after line 184's guard).

- [ ] **Step 4: PASS**: `pnpm vitest run tests/observe/env.test.ts tests/observe/dispatch.test.ts`
- [ ] **Step 5: Commit** — `feat(infra): observe --env validation VALIDATION_*-only + applyResolvedTarget boundary`

---

### Task 10: `_metaBoundedReads` registry + docs lockstep

**Files:**
- Modify: `tests/admin/_metaBoundedReads.test.ts` (READ_MODULES + UNBOUNDED_TABLES), `AGENTS.md` (observe section)

- [ ] **Step 1:** Add to `READ_MODULES`: the six new `lib/observe/query/*.ts` module paths (+ comment citing this plan). Add to `UNBOUNDED_TABLES`: `"sync_log", "deferred_ingestions", "drive_watch_channels"` (NOT `shows_internal` — spec §7: existing UI reads are parent-bounded/single-row but unrecognized by the heuristic). Run: `pnpm vitest run tests/admin/_metaBoundedReads.test.ts` — expect PASS (every new module carries `count:"exact"` + `.limit`). A deliberate-violation spot check: temporarily delete `.limit(...)` from `watch.ts`, re-run, expect FAIL, restore.
- [ ] **Step 2:** AGENTS.md observe section: add six command rows to the table (flags per spec §2); rewrite the `--env` guardrail paragraph: validation = `VALIDATION_*` triple from `.env.local` (auto-loaded at entry), ambient remote = `--env prod` only; note fail-closed invalid filters on the new commands.
- [ ] **Step 3:** Run `pnpm vitest run tests/observe/ tests/admin/_metaBoundedReads.test.ts` — PASS.
- [ ] **Step 4: Commit** — `test(infra): register observe query modules in bounded-reads meta-test + AGENTS.md observe docs`

---

### Task 11: Full gates + live verification

- [ ] **Step 1:** `pnpm test` (FULL suite — scoped gates miss shared-chokepoint regressions; `AppEventFilters`/`telemetryTypes` is shared with the admin UI). Expected: PASS. Any failure in `tests/admin/` or `tests/messages/` traces to the `telemetryTypes`/import changes — fix before proceeding.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm format:check` — PASS (vitest strips types; `--no-verify` skipped prettier).
- [ ] **Step 3:** `pnpm build` — PASS (scripts are not app routes, but `lib/admin/telemetryTypes.ts` and `lib/observe/query` feed the admin bundle).
- [ ] **Step 4:** Live verification (read-only): `pnpm observe staged --session 8e5568a8-b3cd-4033-9840-18cba07a55c6 --env validation` from the MAIN checkout dir or worktree with linked `.env.local` — expect 7 rows, 14 warnings total, no raw emails/tokens in output. Also `pnpm observe watch --env validation` (channels listed, no `webhook_secret` anywhere) and `pnpm observe events --code CRON_RUN_SUMMARY,ONBOARDING_SCAN_COMPLETED --since 7d --env validation` (comma list works).
- [ ] **Step 5: Commit** any fixes as `fix(infra): <what>`; otherwise nothing to commit.

---

## Self-review notes (completed inline)

- Spec coverage: §2.1→T2/T8, §2.2→T3/T8, §2.3→T4/T8, §2.4→T5/T8, §2.5/2.6→T6/T8, §3.1→T9, §3.2→T7, §5.0/5.1→T1 (+ SELECT-allowlist assertions in T2-T6), §6→T7/T8 dispatch tests, §7 meta-tests→T10, §8→T10, live check→T11.
- Type consistency: `SerializedWarning` (T1) consumed by T2-T6 row types; `StagedFilters`…`WatchFilters` (T2-T6) consumed by T7 ParsedArgs and T8 deps; `TargetResult` url/key (T9) consumed by entry.
- No placeholders: every code step carries the code; T3/T5/T6 "mirror Task 2/3" statements are accompanied by the full module code or the complete field-level delta.
