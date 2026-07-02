# Data Quality — Report + Ignore Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Report control (reusing the existing ReportModal→GitHub-issue pipeline) and a per-warning Ignore/Un-ignore control (content-fingerprint persistence in a new `ignored_warnings` table) — plus a collapsible "Ignored (N)" subsection — to the admin per-show "Data quality" panel.

**Architecture:** Ignore state is a one-way SHA-256 fingerprint of `code + normalized rawSnippet`, stored in a new admin-only `public.ignored_warnings` table (Pattern A: `admin_only` RLS, no REVOKE) and matched against freshly-parsed warnings at render time (so it survives the `parse_warnings` full-replace on each sync). Two POST routes (mirroring the alert-resolve route: raw `postgres()`, `requireAdminIdentity` in try/catch, **no advisory lock**) write/delete the fingerprint. UI: a client `DataQualityWarningControls` component mounts a quiet `ReportButton` (always) and neutral Ignore/Un-ignore buttons (when the warning has an ignorable snippet); failures render a plain human sentence (no §12.4 code). Fingerprint hashing is **server-only**; the client uses a pure `hasIgnorableSnippet` predicate.

**Tech Stack:** Next.js 16 (App Router, RSC + `"use client"` islands), React 19, TypeScript, Supabase Postgres, `postgres` (postgres.js), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-02-dq-report-ignore.md` (Codex-approved). Every task's requirements implicitly include the spec + Global Constraints below.

## Global Constraints

- **TDD per task** — failing test → run-and-see-fail → minimal impl → run-and-see-pass → commit. Never impl before its test.
- **Commit per task**, conventional-commits (`feat(admin):`, `test(admin):`, `feat(db):`, `test(db):`, `feat(data-quality):`). One task per commit. Commit with `--no-verify` (shared lint-staged hook belongs to the main checkout).
- **No advisory lock** — the ignore write touches only `ignored_warnings` (not the locked `shows`/`shows_internal`/sync-family set); mirrors the alert-resolve route which takes none (spec §8.1). Do NOT add `pg_advisory*`.
- **No raw error codes in UI** — ignore/un-ignore failures render a plain human sentence (spec D6, §7.3); the `ReportModal` handles Report failures via the existing catalog. No new §12.4 code.
- **Supabase call-boundary** — the one new Supabase read helper destructures `{ data, error }`; construction-throw / query-throw / returned-error all resolve to `{ kind: "infra_error"; message }` (invariant 9); it is registered in `tests/admin/_metaInfraContract.test.ts` `infraRegistry`.
- **Email canonicalization** — `ignored_by = canonicalize(admin.email)` at the write chokepoint (invariant 3); DB CHECK is the safety net.
- **PII** — the raw snippet is used transiently server-side to compute the fingerprint and is **NEVER persisted** (no `raw_snippet` column).
- **Pattern A DB archetype** — `admin_only` RLS + GRANT DML; **no** REVOKE ⇒ **must NOT** appear in `RPC_GATED_TABLES`; **must** add `"ignored_warnings"` to `admin-rls-runtime.baseline.json` + bump `toHaveLength(18)`→`19`.
- **UI = Opus + invariant-8 impeccable dual-gate** — `/impeccable critique` AND `/impeccable audit` on the UI diff before close-out; HIGH/CRITICAL fixed or DEFERRED.md.
- **Migration→validation parity** — apply migration locally (54322), `pnpm gen:schema-manifest` + commit manifest, apply surgically to the validation project (`TEST_DATABASE_URL`), all in the migration's task.
- **Test runner:** `pnpm test` = `vitest run`. Single file: `pnpm vitest run <path>`. Single test: `pnpm vitest run <path> -t "<name>"`. Typecheck: `pnpm typecheck`.

## Meta-test inventory (declared)

| Registry / gate | Action | Task |
|---|---|---|
| `tests/admin/_metaInfraContract.test.ts` `infraRegistry` | ADD a row for `lib/admin/loadIgnoredWarnings.ts` | T8 |
| `tests/db/admin-rls-runtime.test.ts` + `admin-rls-runtime.baseline.json` | ADD `"ignored_warnings"`; bump `toHaveLength(18)`→`19` | T7 |
| `tests/db/postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES` | **NO CHANGE** (no REVOKE; bidirectional test would flag an orphan) | — |
| `tests/db/validation-schema-parity.test.ts` | Auto (no registry) — requires manifest regen + validation apply | T7 |
| `tests/log/_metaAdminOutcomeContract.test.ts` | **NO CHANGE** (no `logAdminOutcome`, spec D7) | — |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | **NO CHANGE** (no `pg_advisory*`) | — |
| `tests/cross-cutting/codes.test.ts` (x1) | **NO CHANGE** (no new §12.4 code, spec D6) | — |
| `lib/audit/trustDomains.ts` (+ `tests/cross-cutting/auth-chain-audit.test.ts`) | ADD two `{ path, chain:["requireAdmin"] }` rows for the ignore/unignore routes | T9, T10 |
| NEW `tests/db/ignored-warnings-schema.test.ts` | CREATE (columns/constraints/RLS; assert NO `raw_snippet`) | T5, T6 |
| NEW `tests/dataQuality/clientBundleBoundary.test.ts` | CREATE (client component never imports node:crypto/fingerprint) | T11 |

## Advisory-lock holder topology

**N/A** — this plan introduces no `pg_advisory*` acquisition. The ignore write mutates only the new `ignored_warnings` table, which is not in the locked hashkey set (`shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions`) and does not touch `shows_internal.parse_warnings`. Zero holders → single-holder rule satisfied vacuously (spec §8.1). No change to `tests/auth/advisoryLockRpcDeadlock.test.ts`.

## File Structure

- Create `lib/dataQuality/ignorableSnippet.ts` — client-safe: `normalizeSnippet`, `hasIgnorableSnippet`. No `node:*`.
- Create `lib/dataQuality/warningFingerprint.ts` — server-only: `warningFingerprint` (imports `node:crypto` via `sha256Base64Url`).
- Create `lib/dataQuality/partitionByIgnored.ts` — server: `partitionByIgnored(warnings, ignoredFps)` → `{ active, ignored }`.
- Create `lib/dataQuality/warningIdentity.ts` — client-safe: `warningIdentityKey`, `stableWarningKeys` (order-independent React keys). `buildReportSurfaceId` is added to the server `warningFingerprint.ts`.
- Create `lib/admin/loadIgnoredWarnings.ts` — Supabase read helper (RLS session client).
- Create `supabase/migrations/20260702120000_ignored_warnings.sql` — table DDL.
- Create `supabase/migrations/20260702120100_ignored_warnings_rls.sql` — RLS + grants.
- Create `app/api/admin/show/[slug]/data-quality/ignore/route.ts` — POST ignore.
- Create `app/api/admin/show/[slug]/data-quality/unignore/route.ts` — POST un-ignore.
- Create `components/admin/DataQualityWarningControls.tsx` — `"use client"` controls.
- Modify `components/admin/PerShowActionableWarnings.tsx` — add optional `renderItemControls` prop + switch `<li>` keys to order-independent `stableWarningKeys`.
- Modify `app/admin/show/[slug]/page.tsx` — load ignored fingerprints, partition, render controls + "Ignored (N)" subsection, panel visibility.
- Modify `lib/audit/trustDomains.ts` — two route rows.
- Modify `tests/admin/_metaInfraContract.test.ts` — one `infraRegistry` row.
- Modify `tests/db/admin-rls-runtime.baseline.json` + `tests/db/admin-rls-runtime.test.ts` — baseline + count.
- Modify `supabase/__generated__/schema-manifest.json` — regenerated.
- Modify `DEFERRED.md` — v1 scope-boundary entries.

---

### Task 1: Client-safe snippet predicate

**Files:**
- Create: `lib/dataQuality/ignorableSnippet.ts`
- Test: `tests/dataQuality/ignorableSnippet.test.ts`

**Interfaces:**
- Produces: `normalizeSnippet(raw: string): string`; `hasIgnorableSnippet(w: Pick<ParseWarning, "rawSnippet">): boolean`. No `node:*` imports (safe for client bundles).

- [ ] **Step 1: Write the failing test**

```ts
// tests/dataQuality/ignorableSnippet.test.ts
import { describe, expect, test } from "vitest";
import { normalizeSnippet, hasIgnorableSnippet } from "@/lib/dataQuality/ignorableSnippet";

describe("normalizeSnippet", () => {
  test("trims and collapses internal whitespace, preserves case", () => {
    expect(normalizeSnippet("  Storage   |   Row  ")).toBe("Storage | Row");
    expect(normalizeSnippet("A\t\nB")).toBe("A B");
    expect(normalizeSnippet("MixedCase")).toBe("MixedCase");
  });
});

describe("hasIgnorableSnippet", () => {
  test("true for a non-empty snippet, false for missing/blank", () => {
    expect(hasIgnorableSnippet({ rawSnippet: "Storage | x" })).toBe(true);
    expect(hasIgnorableSnippet({ rawSnippet: "   " })).toBe(false);
    expect(hasIgnorableSnippet({ rawSnippet: "" })).toBe(false);
    expect(hasIgnorableSnippet({ rawSnippet: undefined })).toBe(false);
    // @ts-expect-error non-string guard
    expect(hasIgnorableSnippet({ rawSnippet: 123 })).toBe(false);
  });
});
```

Failure mode caught: a warning with only whitespace (or no) content being treated as ignorable, or normalization diverging from the fingerprint's (which would break re-sync matching).

- [ ] **Step 2: Run test — verify it fails**

Run: `pnpm vitest run tests/dataQuality/ignorableSnippet.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/dataQuality/ignorableSnippet.ts
import type { ParseWarning } from "@/lib/parser/types";

export function normalizeSnippet(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Pure string predicate — SAFE to import in a "use client" component (no node:*). */
export function hasIgnorableSnippet(w: Pick<ParseWarning, "rawSnippet">): boolean {
  return typeof w.rawSnippet === "string" && normalizeSnippet(w.rawSnippet).length > 0;
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `pnpm vitest run tests/dataQuality/ignorableSnippet.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dataQuality/ignorableSnippet.ts tests/dataQuality/ignorableSnippet.test.ts
git commit --no-verify -m "feat(data-quality): client-safe hasIgnorableSnippet predicate"
```

---

### Task 2: Server-only warning fingerprint

**Files:**
- Create: `lib/dataQuality/warningFingerprint.ts`
- Test: `tests/dataQuality/warningFingerprint.test.ts`

**Interfaces:**
- Consumes: `normalizeSnippet`, `hasIgnorableSnippet` (Task 1); `sha256Base64Url` (`lib/crypto/sha256.ts`).
- Produces: `warningFingerprint(w: Pick<ParseWarning, "code" | "rawSnippet">): string | null`. **Server-only** (imports `node:crypto`); imported ONLY by `page.tsx`, `partitionByIgnored`, and the POST routes.

- [ ] **Step 1: Write the failing test** (AC-1, AC-2)

```ts
// tests/dataQuality/warningFingerprint.test.ts
import { describe, expect, test } from "vitest";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";

describe("warningFingerprint", () => {
  test("AC-1: stable across whitespace-only differences, distinct on real content change", () => {
    const a = warningFingerprint({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" });
    const b = warningFingerprint({ code: "UNKNOWN_FIELD", rawSnippet: "Storage  |  x" });
    const c = warningFingerprint({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | y" });
    expect(a).toBe(b); // benign whitespace edit → same fingerprint (stays ignored)
    expect(a).not.toBe(c); // real content change → new fingerprint (re-surfaces)
    expect(a).toBeTypeOf("string");
  });

  test("code is part of the key (same snippet, different code → different fp)", () => {
    const r1 = warningFingerprint({ code: "ROLE_TOKEN_AUTOCORRECTED", rawSnippet: "LD" });
    const r2 = warningFingerprint({ code: "UNKNOWN_ROLE_TOKEN", rawSnippet: "LD" });
    expect(r1).not.toBe(r2);
  });

  test("AC-2: null (not ignorable) when snippet is missing or blank", () => {
    expect(warningFingerprint({ code: "AGENDA_GRID_MALFORMED" })).toBeNull();
    expect(warningFingerprint({ code: "X", rawSnippet: "   " })).toBeNull();
    expect(warningFingerprint({ code: "X", rawSnippet: undefined })).toBeNull();
  });
});
```

Failure mode caught: (a) benign whitespace edits wrongly re-surfacing an ignore (a≠b); (b) a genuinely changed row wrongly staying ignored (a==c); (c) code collision across two codes on the same cell; (d) rendering/accepting an ignore on a non-fingerprintable warning. Expected values are derived from the normalization rule, not hardcoded hashes.

- [ ] **Step 2: Run test — verify it fails**

Run: `pnpm vitest run tests/dataQuality/warningFingerprint.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/dataQuality/warningFingerprint.ts
// SERVER-ONLY module — never import from a "use client" file (it pulls in node:crypto
// via sha256Base64Url). Enforced by tests/dataQuality/clientBundleBoundary.test.ts (T11).
import { sha256Base64Url } from "@/lib/crypto/sha256";
import type { ParseWarning } from "@/lib/parser/types";
import { normalizeSnippet, hasIgnorableSnippet } from "./ignorableSnippet";

/** Content-key for ignore state. Returns null when the warning is not ignorable. */
export function warningFingerprint(w: Pick<ParseWarning, "code" | "rawSnippet">): string | null {
  if (!hasIgnorableSnippet(w)) return null;
  const normalized = normalizeSnippet(w.rawSnippet as string);
  // Single-space delimiter: codes are [A-Z_]+ (no spaces), so `code + " " + snippet`
  // splits uniquely at the first space (no collision).
  return sha256Base64Url(Buffer.from(`${w.code} ${normalized}`, "utf8"));
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `pnpm vitest run tests/dataQuality/warningFingerprint.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dataQuality/warningFingerprint.ts tests/dataQuality/warningFingerprint.test.ts
git commit --no-verify -m "feat(data-quality): server-only warningFingerprint (content key)"
```

---

### Task 3: Partition warnings into active vs ignored

**Files:**
- Create: `lib/dataQuality/partitionByIgnored.ts`
- Test: `tests/dataQuality/partitionByIgnored.test.ts`

**Interfaces:**
- Consumes: `warningFingerprint` (Task 2), `ParseWarning` (`lib/parser/types`).
- Produces: `partitionByIgnored(warnings: readonly ParseWarning[], ignoredFps: ReadonlySet<string>): { active: ParseWarning[]; ignored: ParseWarning[] }`.

- [ ] **Step 1: Write the failing test** (AC-3, AC-4)

```ts
// tests/dataQuality/partitionByIgnored.test.ts
import { describe, expect, test } from "vitest";
import { partitionByIgnored } from "@/lib/dataQuality/partitionByIgnored";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import type { ParseWarning } from "@/lib/parser/types";

const w = (code: string, rawSnippet?: string): ParseWarning => ({ severity: "warn", code, message: `${code} msg`, rawSnippet });

describe("partitionByIgnored", () => {
  test("AC-3: a warning whose fingerprint is stored lands in `ignored`; others in `active`", () => {
    const ignored = w("UNKNOWN_FIELD", "Storage | x");
    const active = w("UNKNOWN_FIELD", "Truss | y");
    const fps = new Set([warningFingerprint(ignored)!]);
    const out = partitionByIgnored([ignored, active], fps);
    expect(out.ignored.map((x) => x.rawSnippet)).toEqual(["Storage | x"]);
    expect(out.active.map((x) => x.rawSnippet)).toEqual(["Truss | y"]);
  });

  test("AC-4: after the content changes, the same-row warning re-surfaces as active", () => {
    const original = w("UNKNOWN_FIELD", "Storage | x");
    const fps = new Set([warningFingerprint(original)!]);
    const edited = w("UNKNOWN_FIELD", "Storage | EDITED");
    const out = partitionByIgnored([edited], fps);
    expect(out.active).toHaveLength(1);
    expect(out.ignored).toHaveLength(0);
  });

  test("non-ignorable warnings (no fingerprint) are always active", () => {
    const out = partitionByIgnored([w("AGENDA_GRID_MALFORMED")], new Set());
    expect(out.active).toHaveLength(1);
    expect(out.ignored).toHaveLength(0);
  });
});
```

Failure mode caught: the core D2 risk — the `parse_warnings` full-replace defeating ignore (re-parsed warnings not matching stored fingerprints), and location-only keying masking a changed/new problem. Asserts against the partition function output (the data source), NOT a rendered container (anti-tautology).

- [ ] **Step 2: Run — verify fail.** `pnpm vitest run tests/dataQuality/partitionByIgnored.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/dataQuality/partitionByIgnored.ts
import type { ParseWarning } from "@/lib/parser/types";
import { warningFingerprint } from "./warningFingerprint";

export function partitionByIgnored(
  warnings: readonly ParseWarning[],
  ignoredFps: ReadonlySet<string>,
): { active: ParseWarning[]; ignored: ParseWarning[] } {
  const active: ParseWarning[] = [];
  const ignored: ParseWarning[] = [];
  for (const w of warnings) {
    const fp = warningFingerprint(w);
    if (fp !== null && ignoredFps.has(fp)) ignored.push(w);
    else active.push(w);
  }
  return { active, ignored };
}
```

- [ ] **Step 4: Run — verify pass.**

- [ ] **Step 5: Commit**

```bash
git add lib/dataQuality/partitionByIgnored.ts tests/dataQuality/partitionByIgnored.test.ts
git commit --no-verify -m "feat(data-quality): partitionByIgnored (active vs ignored)"
```

---

### Task 4: Warning identity + report surfaceId (ORDER-INDEPENDENT stable)

Two identity requirements interact (see spec §7.2): (1) uniqueness — distinguishable cards must not share a `ReportModal` `surfaceId`; (2) stability — an ignore-driven `router.refresh()` must NOT change a surviving sibling's React key or surfaceId, or its open Report modal remounts and its draft is lost (Codex plan-R1 HIGH). Both are met by an **order-independent** identity derived from content + location — NOT the display index.

**Files:**
- Create: `lib/dataQuality/warningIdentity.ts` — client-safe: `warningIdentityKey`, `stableWarningKeys`.
- Modify: `lib/dataQuality/warningFingerprint.ts` — add server `buildReportSurfaceId` (hashes the identity).
- Test: `tests/dataQuality/warningIdentity.test.ts`

**Interfaces:**
- Produces (client-safe): `warningIdentityKey(w: Pick<ParseWarning, "code"|"sourceCell"|"rawSnippet">): string`; `stableWarningKeys(items): string[]`.
- Produces (server): `buildReportSurfaceId(slug: string, w: Pick<ParseWarning, "code"|"sourceCell"|"rawSnippet">): string`.

- [ ] **Step 1: Write the failing test** (AC-14)

```ts
// tests/dataQuality/warningIdentity.test.ts
import { describe, expect, test } from "vitest";
import { warningIdentityKey, stableWarningKeys } from "@/lib/dataQuality/warningIdentity";
import { buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";
import type { ParseWarning } from "@/lib/parser/types";

const w = (code: string, rawSnippet?: string, gid?: number, a1?: string): ParseWarning => ({
  severity: "warn", code, message: "m", rawSnippet,
  sourceCell: gid === undefined ? null : { title: "STAGE", gid, a1 },
});

describe("warningIdentityKey / buildReportSurfaceId (AC-14)", () => {
  test("STABLE: same identity regardless of position; independent of index", () => {
    const a = w("UNKNOWN_FIELD", "Storage | x", 5, "A1");
    expect(warningIdentityKey(a)).toBe(warningIdentityKey({ ...a }));
    expect(buildReportSurfaceId("rpas", a)).toBe(buildReportSurfaceId("rpas", { ...a }));
    // whitespace-only diff normalizes to the same identity
    expect(warningIdentityKey(w("UNKNOWN_FIELD", "Storage | x"))).toBe(warningIdentityKey(w("UNKNOWN_FIELD", "Storage  |  x")));
  });
  test("UNIQUE: distinct when code / sourceCell / content differ", () => {
    expect(buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "a"))).not.toBe(buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "b")));
    expect(buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "a", 1))).not.toBe(buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "a", 2)));
    expect(buildReportSurfaceId("rpas", w("A", "x"))).not.toBe(buildReportSurfaceId("rpas", w("B", "x")));
  });
  test("stableWarningKeys: per-render unique; removing a DIFFERENT-identity sibling does not change a later key", () => {
    const A = w("UNKNOWN_FIELD", "A | 1"); const B = w("UNKNOWN_FIELD", "B | 2");
    const both = stableWarningKeys([A, B]);
    const afterIgnoreA = stableWarningKeys([B]); // A removed
    expect(new Set(both).size).toBe(2);           // unique within the render
    expect(afterIgnoreA[0]).toBe(both[1]);        // B's key is unchanged (stability)
  });
  test("perfect duplicates get an occurrence suffix in keys but SHARE a surfaceId", () => {
    const d = w("UNKNOWN_FIELD", "dup"); // no sourceCell → indistinguishable
    const keys = stableWarningKeys([d, { ...d }]);
    expect(keys[0]).not.toBe(keys[1]);
    expect(buildReportSurfaceId("rpas", d)).toBe(buildReportSurfaceId("rpas", { ...d }));
  });
});
```

Failure mode caught: (1) an index-based key/surfaceId remounting a sibling on an ignore refresh and destroying its open Report modal (plan-R1 HIGH); (2) two distinguishable cards sharing a `ReportModal` scope (spec-R1 HIGH). Expected values derived from fixture identities, not hardcoded ids/indices.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Write implementations**

```ts
// lib/dataQuality/warningIdentity.ts  (client-safe — pure string, no node:*)
import type { ParseWarning } from "@/lib/parser/types";
import { normalizeSnippet } from "./ignorableSnippet";

export function warningIdentityKey(w: Pick<ParseWarning, "code" | "sourceCell" | "rawSnippet">): string {
  const cell = w.sourceCell ? `${w.sourceCell.gid}:${w.sourceCell.a1 ?? ""}` : "";
  const snippet = typeof w.rawSnippet === "string" ? normalizeSnippet(w.rawSnippet) : "";
  return `${w.code}|${cell}|${snippet}`;
}

/** Per-render UNIQUE React keys; identity + occurrence suffix for perfect duplicates.
 *  Distinguishable items always get suffix 0, so removing a different-identity sibling
 *  never changes another item's key (stability across an ignore refresh). */
export function stableWarningKeys(
  items: readonly Pick<ParseWarning, "code" | "sourceCell" | "rawSnippet">[],
): string[] {
  const seen = new Map<string, number>();
  return items.map((w) => {
    const base = warningIdentityKey(w);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}
```

Append to `lib/dataQuality/warningFingerprint.ts` (already server-only, already imports `sha256Base64Url`):

```ts
import { warningIdentityKey } from "./warningIdentity";

/** Order-independent, opaque, stable per-warning-identity surfaceId. SERVER-ONLY. */
export function buildReportSurfaceId(
  slug: string,
  w: Pick<ParseWarning, "code" | "sourceCell" | "rawSnippet">,
): string {
  return `admin-dq-${slug}-${sha256Base64Url(Buffer.from(warningIdentityKey(w), "utf8"))}`;
}
```

- [ ] **Step 4: Run — verify pass.** `pnpm vitest run tests/dataQuality/warningIdentity.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/dataQuality/warningIdentity.ts lib/dataQuality/warningFingerprint.ts tests/dataQuality/warningIdentity.test.ts
git commit --no-verify -m "feat(data-quality): order-independent warning identity + report surfaceId"
```

---

### Task 5: Migration — `ignored_warnings` table DDL

**Files:**
- Create: `supabase/migrations/20260702120000_ignored_warnings.sql`
- Test: `tests/db/ignored-warnings-schema.test.ts`

Note: this is a DB-backed test (psql against the local all-migrations-applied DB). The migration must sort **after** every existing migration (it does — `20260702…`).

- [ ] **Step 1: Write the failing test** (AC-11 columns)

```ts
// tests/db/ignored-warnings-schema.test.ts
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

describe("ignored_warnings schema", () => {
  test("exact column set — NO raw_snippet (PII not persisted)", () => {
    const cols = runPsql(`
      select column_name
        from information_schema.columns
       where table_schema = 'public' and table_name = 'ignored_warnings'
       order by column_name;
    `).split("\n");
    expect(cols).toEqual(["code", "fingerprint", "id", "ignored_at", "ignored_by", "show_id"]);
    expect(cols).not.toContain("raw_snippet");
  });

  test("unique (show_id, fingerprint), FK cascade, email-canonical CHECK", () => {
    const indexes = runPsql(`
      select pg_get_indexdef(indexrelid)
        from pg_index where indrelid = 'public.ignored_warnings'::regclass;
    `);
    expect(indexes).toMatch(/UNIQUE INDEX ignored_warnings_unique .*\(show_id, fingerprint\)/);
    const fk = runPsql(`
      select confdeltype from pg_constraint
       where conrelid='public.ignored_warnings'::regclass and contype='f';
    `);
    expect(fk).toBe("c"); // ON DELETE CASCADE
    const check = runPsql(`
      select pg_get_constraintdef(oid) from pg_constraint
       where conrelid='public.ignored_warnings'::regclass and conname='ignored_warnings_ignored_by_canonical';
    `);
    expect(check).toContain("lower(trim(");
  });
});
```

Failure mode caught: accidental PII column, missing idempotency unique index (would allow duplicate ignores + break `on conflict do nothing`), missing cascade (orphan rows on show delete), un-canonicalized `ignored_by`.

- [ ] **Step 2: Run — verify fail.** `pnpm vitest run tests/db/ignored-warnings-schema.test.ts` → FAIL (relation does not exist).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260702120000_ignored_warnings.sql
create table public.ignored_warnings (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  fingerprint text not null,
  code text not null,
  ignored_by text not null,
  ignored_at timestamptz not null default now(),
  constraint ignored_warnings_ignored_by_canonical
    check (ignored_by = lower(trim(ignored_by)) and ignored_by <> ''),
  constraint ignored_warnings_unique unique (show_id, fingerprint)
);
create index ignored_warnings_show_idx on public.ignored_warnings (show_id);
```

- [ ] **Step 4: Apply locally + run test**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/migrations/20260702120000_ignored_warnings.sql
pnpm vitest run tests/db/ignored-warnings-schema.test.ts
```
Expected: the RLS-specific assertions (T6) will not exist yet; the column/index/FK/CHECK tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260702120000_ignored_warnings.sql tests/db/ignored-warnings-schema.test.ts
git commit --no-verify -m "feat(db): ignored_warnings table (content-keyed ignore state)"
```

---

### Task 6: Migration — RLS + grants (Pattern A)

**Files:**
- Create: `supabase/migrations/20260702120100_ignored_warnings_rls.sql`
- Modify: `tests/db/ignored-warnings-schema.test.ts` (add RLS assertions)

- [ ] **Step 1: Add the failing RLS test**

```ts
// append to tests/db/ignored-warnings-schema.test.ts
describe("ignored_warnings RLS (Pattern A: admin_only, no REVOKE)", () => {
  test("RLS enabled + admin_only FOR ALL policy using is_admin()", () => {
    const rls = runPsql(`
      select relrowsecurity from pg_class where oid='public.ignored_warnings'::regclass;
    `);
    expect(rls).toBe("t");
    const policy = runPsql(`
      select policyname || '|' || cmd || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'')
        from pg_policies where schemaname='public' and tablename='ignored_warnings';
    `);
    expect(policy).toMatch(/^admin_only\|ALL\|.*is_admin.*\|.*is_admin/);
  });

  test("DML granted to authenticated (Pattern A, not REVOKE-locked)", () => {
    const grants = runPsql(`
      select string_agg(privilege_type, ',' order by privilege_type)
        from information_schema.role_table_grants
       where table_schema='public' and table_name='ignored_warnings' and grantee='authenticated';
    `);
    expect(grants).toContain("INSERT");
    expect(grants).toContain("DELETE");
  });
});
```

Failure mode caught: forgetting RLS (public table exposed via Data API), wrong policy predicate (non-admin write), or accidentally REVOKE-locking (which would then require an `RPC_GATED_TABLES` row and break the bidirectional lockdown test).

- [ ] **Step 2: Run — verify fail.** `pnpm vitest run tests/db/ignored-warnings-schema.test.ts` → new tests FAIL (RLS not enabled).

- [ ] **Step 3: Write the RLS migration**

```sql
-- supabase/migrations/20260702120100_ignored_warnings_rls.sql
grant select, insert, update, delete on table public.ignored_warnings to anon, authenticated;
grant all privileges on table public.ignored_warnings to service_role;
alter table public.ignored_warnings enable row level security;
create policy admin_only on public.ignored_warnings
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

- [ ] **Step 4: Apply locally + run test**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/migrations/20260702120100_ignored_warnings_rls.sql
pnpm vitest run tests/db/ignored-warnings-schema.test.ts
```
Expected: PASS (all column + RLS assertions).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260702120100_ignored_warnings_rls.sql tests/db/ignored-warnings-schema.test.ts
git commit --no-verify -m "feat(db): ignored_warnings admin_only RLS + grants (Pattern A)"
```

---

### Task 7: Schema-manifest regen + admin-rls baseline + validation apply

**Files:**
- Modify: `supabase/__generated__/schema-manifest.json` (regenerated)
- Modify: `tests/db/admin-rls-runtime.baseline.json` (add table)
- Modify: `tests/db/admin-rls-runtime.test.ts` (`toHaveLength(18)`→`19`)

- [ ] **Step 1: Regenerate the manifest**

```bash
pnpm gen:schema-manifest   # introspects local 54322 (both migrations already applied in T5/T6)
```
Confirm `supabase/__generated__/schema-manifest.json` now has an `"ignored_warnings"` key listing exactly `["code","fingerprint","id","ignored_at","ignored_by","show_id"]`.

- [ ] **Step 2: Update the admin-rls-runtime baseline (add table)**

Edit `tests/db/admin-rls-runtime.baseline.json` — insert `"ignored_warnings"` into `class_a_tables` in sorted position (between `"drive_watch_channels"` and `"onboarding_scan_manifest"`).

- [ ] **Step 3: Bump the count assertion**

In `tests/db/admin-rls-runtime.test.ts`, change `expect(CLASS_A_TABLES).toHaveLength(18);` → `toHaveLength(19);` (AC-12).

- [ ] **Step 4: Run the DB gates**

```bash
pnpm vitest run tests/db/admin-rls-runtime.test.ts tests/db/validation-schema-parity.test.ts
```
Expected: `admin-rls-runtime` PASS (19 tables, zero drift). `validation-schema-parity` Layer 1 (manifest freshness) PASS; Layer 2 requires the validation apply (Step 5) — if Layer 2 fails "superset" here, complete Step 5 then re-run.

- [ ] **Step 5: Apply both migrations to the validation project**

```bash
# TEST_DATABASE_URL is in the MAIN checkout .env.local (copied into this worktree's .env.local).
set -a; . ./.env.local; set +a
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260702120000_ignored_warnings.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260702120100_ignored_warnings_rls.sql
psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"
pnpm vitest run tests/db/validation-schema-parity.test.ts   # Layer 2 now PASS
```

- [ ] **Step 6: Commit**

```bash
git add supabase/__generated__/schema-manifest.json tests/db/admin-rls-runtime.baseline.json tests/db/admin-rls-runtime.test.ts
git commit --no-verify -m "chore(db): regen manifest + admin-rls baseline for ignored_warnings"
```

---

### Task 8: `loadIgnoredWarnings` read helper + infra registry

**Files:**
- Create: `lib/admin/loadIgnoredWarnings.ts`
- Test: `tests/admin/loadIgnoredWarnings.test.ts`
- Modify: `tests/admin/_metaInfraContract.test.ts` (`infraRegistry` row)

**Interfaces:**
- Produces: `loadIgnoredWarnings(showId: string, opts?: { supabase? }): Promise<{ kind: "ok"; fingerprints: Set<string> } | { kind: "infra_error"; message: string }>`.

- [ ] **Step 1: Write the failing test** (AC-7 helper)

```ts
// tests/admin/loadIgnoredWarnings.test.ts
import { describe, expect, test } from "vitest";
import { loadIgnoredWarnings } from "@/lib/admin/loadIgnoredWarnings";

function fakeSupabase(behavior: "ok" | "returned-error" | "throw") {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              if (behavior === "throw") throw new Error("boom");
              if (behavior === "returned-error") return Promise.resolve({ data: null, error: { message: "bad" } });
              return Promise.resolve({ data: [{ fingerprint: "fp1" }, { fingerprint: "fp2" }], error: null });
            },
          };
        },
      };
    },
  } as never;
}

describe("loadIgnoredWarnings", () => {
  test("ok → Set of fingerprints", async () => {
    const r = await loadIgnoredWarnings("s1", { supabase: fakeSupabase("ok") });
    expect(r.kind).toBe("ok");
    expect(r.kind === "ok" && [...r.fingerprints].sort()).toEqual(["fp1", "fp2"]);
  });
  test("returned {error} → infra_error with message", async () => {
    const r = await loadIgnoredWarnings("s1", { supabase: fakeSupabase("returned-error") });
    expect(r).toMatchObject({ kind: "infra_error" });
    expect(r.kind === "infra_error" && r.message).toMatch(/query failed/);
  });
  test("query throw → infra_error (threw message)", async () => {
    const r = await loadIgnoredWarnings("s1", { supabase: fakeSupabase("throw") });
    expect(r).toMatchObject({ kind: "infra_error" });
    expect(r.kind === "infra_error" && r.message).toMatch(/threw/);
  });
});
```

Failure mode caught: a DB read fault silently returning "no ignores" (which would be fine) vs an undiscriminated throw crashing the page; and conflating returned-error with thrown-error (invariant 9).

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/admin/loadIgnoredWarnings.ts
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoadIgnoredWarningsResult =
  | { kind: "ok"; fingerprints: Set<string> }
  | { kind: "infra_error"; message: string };

export async function loadIgnoredWarnings(
  showId: string,
  opts?: { supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>> },
): Promise<LoadIgnoredWarningsResult> {
  let supabase = opts?.supabase;
  if (!supabase) {
    try {
      supabase = await createSupabaseServerClient();
    } catch (err) {
      return { kind: "infra_error", message: `supabase client construction failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  try {
    const { data, error } = await supabase
      .from("ignored_warnings")
      .select("fingerprint")
      .eq("show_id", showId);
    if (error) return { kind: "infra_error", message: `ignored_warnings query failed: ${error.message}` };
    return { kind: "ok", fingerprints: new Set((data ?? []).map((r) => r.fingerprint as string)) };
  } catch (err) {
    return { kind: "infra_error", message: `ignored_warnings query threw: ${err instanceof Error ? err.message : String(err)}` };
  }
}
```

- [ ] **Step 4: Run — verify pass.**

- [ ] **Step 5: Register in the infra meta-test**

Add to `tests/admin/_metaInfraContract.test.ts` `infraRegistry`:

```ts
  {
    helper: "loadIgnoredWarnings",
    path: "lib/admin/loadIgnoredWarnings.ts",
    contract:
      "ignored_warnings read (show partition; .eq('show_id')); client construction throw + .from() query throw + returned {error} → { kind: 'infra_error' } (table-specific 'failed'/'threw' message); caller treats infra_error as an empty ignore set (warnings stay visible)",
  },
```

Run: `pnpm vitest run tests/admin/_metaInfraContract.test.ts tests/admin/loadIgnoredWarnings.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/loadIgnoredWarnings.ts tests/admin/loadIgnoredWarnings.test.ts tests/admin/_metaInfraContract.test.ts
git commit --no-verify -m "feat(admin): loadIgnoredWarnings read helper + infra registry row"
```

---

### Task 9: Ignore POST route

**Files:**
- Create: `app/api/admin/show/[slug]/data-quality/ignore/route.ts`
- Test: `tests/api/dataQualityIgnore.test.ts`
- Modify: `lib/audit/trustDomains.ts`

**Interfaces:**
- Consumes: `warningFingerprint` (T2), `canonicalize` (`lib/email/canonicalize`).
- Produces: `POST` handler + `handleIgnore(request, context, deps?)` with DI `{ requireAdminIdentity?, withTx? }` mirroring `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts`. Body `{ code, rawSnippet }`; success `{ status: "ignored" }`; error `{ ok:false, code }`.

- [ ] **Step 1: Write the failing test** (AC-5)

```ts
// tests/api/dataQualityIgnore.test.ts
import { describe, expect, test, vi } from "vitest";
import { handleIgnore } from "@/app/api/admin/show/[slug]/data-quality/ignore/route";

const ctx = (slug = "rpas") => ({ params: Promise.resolve({ slug }) });
const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const admin = async () => ({ email: "Admin@Example.com" });

function fakeTx(captured: { sql: string; params: unknown[] }[], show: { id: string } | null = { id: "sid" }) {
  return async <R>(fn: (tx: { queryOne<T>(sql: string, p: unknown[]): Promise<T | null>; run(sql: string, p: unknown[]): Promise<void> }) => Promise<R>) =>
    fn({
      async queryOne<T>(sql: string, params: unknown[]) {
        captured.push({ sql, params });
        return (/from public\.shows/.test(sql) ? show : null) as T | null;
      },
      async run(sql: string, params: unknown[]) {
        captured.push({ sql, params });
      },
    });
}

describe("handleIgnore", () => {
  test("AC-5: inserts one row with canonical ignored_by + computed fingerprint", async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const res = await handleIgnore(req({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" }), ctx(), {
      requireAdminIdentity: admin,
      withTx: fakeTx(captured),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ignored" });
    const insert = captured.find((c) => /insert into public\.ignored_warnings/.test(c.sql))!;
    expect(insert.sql).toMatch(/on conflict \(show_id, fingerprint\) do nothing/);
    expect(insert.params).toContain("admin@example.com"); // canonicalized
    expect(insert.sql).not.toMatch(/raw_snippet/); // PII never stored
  });

  test("non-admin → 403 ADMIN_FORBIDDEN", async () => {
    const res = await handleIgnore(req({ code: "X", rawSnippet: "y" }), ctx(), {
      requireAdminIdentity: async () => { throw { code: "NOT_ADMIN" }; },
      withTx: fakeTx([]),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, code: "ADMIN_FORBIDDEN" });
  });

  test("infra auth fault → 500 ADMIN_SESSION_LOOKUP_FAILED", async () => {
    const res = await handleIgnore(req({ code: "X", rawSnippet: "y" }), ctx(), {
      requireAdminIdentity: async () => { throw { code: "ADMIN_SESSION_LOOKUP_FAILED" }; },
      withTx: fakeTx([]),
    });
    expect(res.status).toBe(500);
  });

  test("empty/blank snippet → 400 (not ignorable)", async () => {
    const res = await handleIgnore(req({ code: "X", rawSnippet: "   " }), ctx(), { requireAdminIdentity: admin, withTx: fakeTx([]) });
    expect(res.status).toBe(400);
  });

  test("missing show → 404", async () => {
    const res = await handleIgnore(req({ code: "X", rawSnippet: "y" }), ctx(), {
      requireAdminIdentity: admin, withTx: fakeTx([], null),
    });
    expect(res.status).toBe(404);
  });
});
```

Failure mode caught: duplicate rows, auth bypass, mis-mapped infra vs forbidden, accepting an un-fingerprintable ignore, and PII (`raw_snippet`) leaking into the insert.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Write the route** (mirror `resolve/route.ts`)

```ts
// app/api/admin/show/[slug]/data-quality/ignore/route.ts
import { NextResponse } from "next/server";
import postgres from "postgres";
import { canonicalize } from "@/lib/email/canonicalize";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";

export type IgnoreTx = {
  queryOne<T>(sql: string, params: unknown[]): Promise<T | null>;
  run(sql: string, params: unknown[]): Promise<void>;
};
export type IgnoreRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withTx?: <R>(fn: (tx: IgnoreTx) => Promise<R>) => Promise<R>;
};
type RouteContext = { params: Promise<{ slug: string }> };

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("data-quality ignore route requires DATABASE_URL in production");
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}
function txAdapter(rawTx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }): IgnoreTx {
  return {
    async queryOne<T>(sql: string, params: unknown[]) { return ((await rawTx.unsafe(sql, params)) as T[])[0] ?? null; },
    async run(sql: string, params: unknown[]) { await rawTx.unsafe(sql, params); },
  };
}
async function defaultWithTx<R>(fn: (tx: IgnoreTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) => fn(txAdapter(rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> })))) as R;
  } finally { await sql.end({ timeout: 5 }); }
}
async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}
function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function handleIgnore(request: Request, context: RouteContext, routeDeps: IgnoreRouteDeps = {}): Promise<Response> {
  const requireAdminIdentity = routeDeps.requireAdminIdentity ?? defaultRequireAdminIdentity;
  const withTx = routeDeps.withTx ?? defaultWithTx;
  let admin: { email: string };
  try {
    admin = await requireAdminIdentity();
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }
  let body: { code?: unknown; rawSnippet?: unknown };
  try { body = await request.json(); } catch { return errorResponse(400, "BAD_REQUEST"); }
  if (typeof body?.code !== "string" || typeof body?.rawSnippet !== "string") return errorResponse(400, "BAD_REQUEST");
  const fingerprint = warningFingerprint({ code: body.code, rawSnippet: body.rawSnippet });
  if (fingerprint === null) return errorResponse(400, "BAD_REQUEST");
  const { slug } = await context.params;
  try {
    return await withTx(async (tx) => {
      const show = await tx.queryOne<{ id: string }>(`select id from public.shows where slug = $1 limit 1`, [slug]);
      if (!show) return errorResponse(404, "SHOW_NOT_FOUND");
      await tx.run(
        `insert into public.ignored_warnings (show_id, fingerprint, code, ignored_by)
         values ($1::uuid, $2, $3, $4)
         on conflict (show_id, fingerprint) do nothing`,
        [show.id, fingerprint, body.code, canonicalize(admin.email)],
      );
      return NextResponse.json({ status: "ignored" });
    });
  } catch {
    return errorResponse(500, "DATA_QUALITY_INFRA_ERROR");
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleIgnore(request, context);
}
```

- [ ] **Step 4: Run — verify pass.** `pnpm vitest run tests/api/dataQualityIgnore.test.ts`

- [ ] **Step 5: Register the route in trustDomains**

Add to `lib/audit/trustDomains.ts` (near `:71`, the show-alerts resolve row):

```ts
  { path: "app/api/admin/show/[slug]/data-quality/ignore/route.ts", chain: ["requireAdmin"] },
```

Run: `pnpm vitest run tests/cross-cutting/auth-chain-audit.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/api/admin/show/[slug]/data-quality/ignore/route.ts" tests/api/dataQualityIgnore.test.ts lib/audit/trustDomains.ts
git commit --no-verify -m "feat(admin): POST data-quality/ignore route (fingerprint insert)"
```

---

### Task 10: Un-ignore POST route

**Files:**
- Create: `app/api/admin/show/[slug]/data-quality/unignore/route.ts`
- Test: `tests/api/dataQualityUnignore.test.ts`
- Modify: `lib/audit/trustDomains.ts`

- [ ] **Step 1: Write the failing test** (AC-6)

```ts
// tests/api/dataQualityUnignore.test.ts
import { describe, expect, test } from "vitest";
import { handleUnignore } from "@/app/api/admin/show/[slug]/data-quality/unignore/route";

const ctx = () => ({ params: Promise.resolve({ slug: "rpas" }) });
const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const admin = async () => ({ email: "a@b.com" });
function fakeTx(captured: { sql: string; params: unknown[] }[], show: { id: string } | null = { id: "sid" }) {
  return async <R>(fn: (tx: { queryOne<T>(s: string, p: unknown[]): Promise<T | null>; run(s: string, p: unknown[]): Promise<void> }) => Promise<R>) =>
    fn({
      async queryOne<T>(sql: string, params: unknown[]) { captured.push({ sql, params }); return (/from public\.shows/.test(sql) ? show : null) as T | null; },
      async run(sql: string, params: unknown[]) { captured.push({ sql, params }); },
    });
}

describe("handleUnignore", () => {
  test("AC-6: deletes by (show_id, fingerprint) → { status: 'unignored' }", async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const res = await handleUnignore(req({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" }), ctx(), { requireAdminIdentity: admin, withTx: fakeTx(captured) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "unignored" });
    expect(captured.find((c) => /delete from public\.ignored_warnings/.test(c.sql))).toBeTruthy();
  });
  test("non-admin → 403", async () => {
    const res = await handleUnignore(req({ code: "X", rawSnippet: "y" }), ctx(), { requireAdminIdentity: async () => { throw { code: "NOPE" }; }, withTx: fakeTx([]) });
    expect(res.status).toBe(403);
  });
});
```

Failure mode caught: un-ignore failing to reverse the ignore (wrong key), or auth bypass. Absent-row delete is a natural no-op (idempotent) — no separate row needed since `delete … where` matches zero rows harmlessly.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Write the route** — identical scaffolding to Task 9 (copy the helpers `databaseUrl`/`txAdapter`/`defaultWithTx`/`defaultRequireAdminIdentity`/`errorResponse` verbatim), with the handler body:

```ts
// app/api/admin/show/[slug]/data-quality/unignore/route.ts — handler core
export async function handleUnignore(request: Request, context: RouteContext, routeDeps: IgnoreRouteDeps = {}): Promise<Response> {
  const requireAdminIdentity = routeDeps.requireAdminIdentity ?? defaultRequireAdminIdentity;
  const withTx = routeDeps.withTx ?? defaultWithTx;
  try { await requireAdminIdentity(); }
  catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }
  let body: { code?: unknown; rawSnippet?: unknown };
  try { body = await request.json(); } catch { return errorResponse(400, "BAD_REQUEST"); }
  if (typeof body?.code !== "string" || typeof body?.rawSnippet !== "string") return errorResponse(400, "BAD_REQUEST");
  const fingerprint = warningFingerprint({ code: body.code, rawSnippet: body.rawSnippet });
  if (fingerprint === null) return errorResponse(400, "BAD_REQUEST");
  const { slug } = await context.params;
  try {
    return await withTx(async (tx) => {
      const show = await tx.queryOne<{ id: string }>(`select id from public.shows where slug = $1 limit 1`, [slug]);
      if (!show) return errorResponse(404, "SHOW_NOT_FOUND");
      await tx.run(`delete from public.ignored_warnings where show_id = $1::uuid and fingerprint = $2`, [show.id, fingerprint]);
      return NextResponse.json({ status: "unignored" });
    });
  } catch { return errorResponse(500, "DATA_QUALITY_INFRA_ERROR"); }
}
export async function POST(request: Request, context: RouteContext): Promise<Response> { return await handleUnignore(request, context); }
```

(To keep DRY, the shared route helpers may be extracted into `app/api/admin/show/[slug]/data-quality/_shared.ts` and imported by both routes — do this if the reviewer prefers; otherwise inline-duplicate is acceptable per the resolve/unignore precedent which each inline their own.)

- [ ] **Step 4: Run — verify pass.**

- [ ] **Step 5: trustDomains row**

```ts
  { path: "app/api/admin/show/[slug]/data-quality/unignore/route.ts", chain: ["requireAdmin"] },
```
Run: `pnpm vitest run tests/cross-cutting/auth-chain-audit.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/api/admin/show/[slug]/data-quality/unignore/route.ts" tests/api/dataQualityUnignore.test.ts lib/audit/trustDomains.ts
git commit --no-verify -m "feat(admin): POST data-quality/unignore route (fingerprint delete)"
```

---

### Task 11: `DataQualityWarningControls` client component + bundle-boundary test

**Files:**
- Create: `components/admin/DataQualityWarningControls.tsx`
- Test: `tests/components/admin/dataQualityWarningControls.test.tsx`
- Create: `tests/dataQuality/clientBundleBoundary.test.ts`

**Interfaces:**
- Consumes: `hasIgnorableSnippet` (T1, client-safe), `ReportButton` (`components/shared/ReportButton`), `ParseWarning`.
- Produces: `DataQualityWarningControls({ slug, showId, warning, driveFileId, mode, reportSurfaceId })`.

- [ ] **Step 1: Write the component test**

```tsx
// tests/components/admin/dataQualityWarningControls.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { DataQualityWarningControls } from "@/components/admin/DataQualityWarningControls";
import type { ParseWarning } from "@/lib/parser/types";

const w = (rawSnippet?: string): ParseWarning => ({ severity: "warn", code: "UNKNOWN_FIELD", message: "m", rawSnippet });
const base = { slug: "rpas", showId: "00000000-0000-0000-0000-000000000001", driveFileId: "df", reportSurfaceId: "sid-1" } as const;

describe("DataQualityWarningControls", () => {
  test("active + ignorable → Report + Ignore, no Un-ignore", () => {
    render(<DataQualityWarningControls {...base} warning={w("Storage | x")} mode="active" />);
    expect(screen.getByRole("button", { name: /report/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^ignore$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /un-ignore/i })).toBeNull();
  });
  test("active + NOT ignorable (no snippet) → Report only", () => {
    render(<DataQualityWarningControls {...base} warning={w(undefined)} mode="active" />);
    expect(screen.getByRole("button", { name: /report/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^ignore$/i })).toBeNull();
  });
  test("ignored mode → Un-ignore + Report", () => {
    render(<DataQualityWarningControls {...base} warning={w("Storage | x")} mode="ignored" />);
    expect(screen.getByRole("button", { name: /un-ignore/i })).toBeTruthy();
  });
});
```

Failure mode caught: rendering an Ignore control on a non-fingerprintable warning; missing Report; wrong control per mode.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Write the component** (uses `hasIgnorableSnippet`, NEVER the fingerprint module)

```tsx
// components/admin/DataQualityWarningControls.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReportButton } from "@/components/shared/ReportButton";
import { hasIgnorableSnippet } from "@/lib/dataQuality/ignorableSnippet";
import type { ParseWarning } from "@/lib/parser/types";

type Props = {
  slug: string;
  showId: string;
  warning: ParseWarning;
  driveFileId: string | null;
  mode: "active" | "ignored";
  reportSurfaceId: string;
};
type State = { kind: "idle" } | { kind: "running" } | { kind: "error"; copy: string };

const NEUTRAL_BTN =
  "inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg";

export function DataQualityWarningControls({ slug, showId, warning, driveFileId, mode, reportSurfaceId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const ignorable = hasIgnorableSnippet(warning);
  const action = mode === "active" ? "ignore" : "unignore";
  const failCopy = action === "ignore" ? "Couldn't ignore that warning. Refresh and try again." : "Couldn't un-ignore that warning. Refresh and try again.";

  async function run() {
    setState({ kind: "running" });
    try {
      const res = await fetch(`/api/admin/show/${encodeURIComponent(slug)}/data-quality/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: warning.code, rawSnippet: warning.rawSnippet ?? "" }),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string };
      if (res.ok && (json.status === "ignored" || json.status === "unignored")) { router.refresh(); return; }
      setState({ kind: "error", copy: failCopy });
    } catch { setState({ kind: "error", copy: failCopy }); }
  }

  const showIgnoreBtn = (mode === "active" && ignorable) || mode === "ignored";
  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <ReportButton
          surface="admin"
          variant="text"
          label="Report"
          showId={showId}
          surfaceId={reportSurfaceId}
          autocapture={{
            parseWarnings: [warning],
            fieldRef: { surface: "data-quality", code: warning.code, sourceCell: warning.sourceCell ?? null, blockRef: warning.blockRef ?? null },
            rawSnippet: warning.rawSnippet ?? undefined,
            viewerVisibleSection: "data-quality",
          }}
        />
        {showIgnoreBtn ? (
          <button type="button" data-testid={`dq-${action}-${reportSurfaceId}`} onClick={run} disabled={state.kind === "running"} className={NEUTRAL_BTN}>
            {mode === "active" ? (state.kind === "running" ? "Ignoring…" : "Ignore") : state.kind === "running" ? "Un-ignoring…" : "Un-ignore"}
          </button>
        ) : null}
      </div>
      {state.kind === "error" ? (
        <p role="alert" data-testid={`dq-error-${reportSurfaceId}`} className="rounded-sm border border-border-strong bg-warning-bg p-2 text-xs text-warning-text">
          {state.copy}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run — verify pass.** `pnpm vitest run tests/components/admin/dataQualityWarningControls.test.tsx`

- [ ] **Step 5: Write the client-bundle-boundary structural test** (AC-13)

```ts
// tests/dataQuality/clientBundleBoundary.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("client-bundle boundary (Codex R1)", () => {
  test("DataQualityWarningControls never imports node:crypto or the fingerprint module", () => {
    const src = readFileSync("components/admin/DataQualityWarningControls.tsx", "utf8");
    expect(src).toContain('"use client"');
    expect(src).toMatch(/from ["']@\/lib\/dataQuality\/ignorableSnippet["']/);
    expect(src).not.toMatch(/warningFingerprint/);
    expect(src).not.toMatch(/@\/lib\/crypto\/sha256/);
    expect(src).not.toMatch(/node:crypto/);
    expect(src).not.toMatch(/\bsha256\b/);
  });
});
```

Failure mode caught: re-introducing a `node:crypto` import into a `"use client"` bundle — a jsdom unit test would pass while the real client build breaks, so this is a source-grep assertion.

Run: `pnpm vitest run tests/dataQuality/clientBundleBoundary.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/DataQualityWarningControls.tsx tests/components/admin/dataQualityWarningControls.test.tsx tests/dataQuality/clientBundleBoundary.test.ts
git commit --no-verify -m "feat(admin): DataQualityWarningControls (Report + Ignore, client-safe)"
```

---

### Task 12: `PerShowActionableWarnings` render-prop

**Files:**
- Modify: `components/admin/PerShowActionableWarnings.tsx`
- Test: `tests/admin/perShowActionableRenderControls.test.tsx`

**Interfaces:**
- Produces: adds optional `renderItemControls?: (w: ParseWarning, i: number) => ReactNode` to the existing props; renders it inside each `<li>` after the "Open in Sheet" link.

- [ ] **Step 1: Write the failing test** (AC-8)

```tsx
// tests/admin/perShowActionableRenderControls.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

const items: ParseWarning[] = [{ severity: "warn", code: "UNKNOWN_FIELD", message: "m", rawSnippet: "Storage | x" }];

describe("PerShowActionableWarnings renderItemControls", () => {
  test("AC-8: WITHOUT the prop → no controls (StagedReviewCard usage unchanged)", () => {
    render(<PerShowActionableWarnings items={items} driveFileId="df" />);
    expect(screen.queryByTestId("dq-controls")).toBeNull();
  });
  test("WITH the prop → controls rendered, receives (w, i)", () => {
    render(
      <PerShowActionableWarnings
        items={items}
        driveFileId="df"
        renderItemControls={(w, i) => <span data-testid="dq-controls">{`${w.code}#${i}`}</span>}
      />,
    );
    expect(screen.getByTestId("dq-controls").textContent).toBe("UNKNOWN_FIELD#0");
  });
});
```

Failure mode caught: leaking interactive controls onto the staged-review preview surface (which has no persisted show); and the `i` argument being unavailable to the closure (Codex R1).

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Modify the component** — three edits:
  1. Add to the props type: `renderItemControls?: (w: ParseWarning, i: number) => ReactNode;` (import `ReactNode` from `react`).
  2. **Change the `<li>` key from the index-based `${w.code}-${i}` to an order-independent stable key** (Codex plan-R1 HIGH): compute `const keys = stableWarningKeys(items);` (import from `@/lib/dataQuality/warningIdentity`) before the `.map`, and use `key={keys[i]}` on each `<li>`. This ensures an ignore-driven refresh does not remount surviving siblings (preserving an open Report modal).
  3. Inside the `.map((w, i) => …)`, after the `Open in Sheet` `<a>` block and before `</li>`, add `{renderItemControls ? renderItemControls(w, i) : null}`.

- [ ] **Step 3b: Add a key-stability test** to `tests/admin/perShowActionableRenderControls.test.tsx`:

```tsx
test("stable <li> key survives removal of an earlier sibling (no remount)", () => {
  // render [A, B] with a stateful child, capture B's DOM node identity; re-render [B] (A ignored);
  // assert B's rendered node is preserved (same key) — e.g. via a data-key attr set to keys[i].
  // Minimal form: assert the component emits data-testid/data-key derived from stableWarningKeys,
  // and that keys([A,B])[1] === keys([B])[0].
});
```

- [ ] **Step 4: Run — verify pass.** Also run the existing `pnpm vitest run tests/admin/perShowDataQualityActionable.test.tsx` to confirm no regression on the shared component.

- [ ] **Step 5: Commit**

```bash
git add components/admin/PerShowActionableWarnings.tsx tests/admin/perShowActionableRenderControls.test.tsx
git commit --no-verify -m "feat(admin): PerShowActionableWarnings renderItemControls render-prop"
```

---

### Task 13: `page.tsx` integration — load, partition, render, "Ignored (N)"

**Files:**
- Modify: `app/admin/show/[slug]/page.tsx`
- Test: `tests/app/admin/dataQualityIgnoreIntegration.test.tsx` (extend `perShowPage.test.tsx` patterns)

**Interfaces:**
- Consumes: `loadIgnoredWarnings` (T8), `partitionByIgnored` (T3), `buildReportSurfaceId` (T4), `DataQualityWarningControls` (T11).

- [ ] **Step 1: Write the failing integration test** (AC-3/4 integration, AC-7, AC-9)

Render the per-show page (or extract a small pure `renderDataQualitySection(active, ignored, failed, …)` helper and test it) asserting:
1. A warning whose fingerprint is in the ignored set renders inside the `per-show-ignored-warnings` `<details>`, not the active list (AC-3); an edited-content warning renders active (AC-4).
2. When `loadIgnoredWarnings` returns `infra_error`, ALL warnings render active (AC-7 — fail toward visible).
3. When every active warning is ignored, the panel still renders (heading + "Ignored (N)"); when N=0 and no active/failed, `per-show-ignored-warnings` is absent (AC-9).
4. The "Ignored (N)" summary shows the correct count from the partition data source (`ignored.length`), asserted against the partition result, NOT by counting rendered rows.

```tsx
// sketch — assert against partition data, not the container
import { partitionByIgnored } from "@/lib/dataQuality/partitionByIgnored";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
// build fixtures; compute expected N from partitionByIgnored(...).ignored.length; then assert the
// rendered `per-show-ignored-summary` text is `Ignored (${expectedN})`.
```

Failure mode caught: full-replace defeating ignore; hiding warnings on a read fault; an empty "Ignored (0)" resurrecting an otherwise-empty panel or the panel vanishing while ignores exist; a self-satisfying count read off the wrong container.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Modify `page.tsx`**
  - In the existing `Promise.all`, add `loadIgnoredWarnings(show.id)`.
  - After `const actionableItems = selectActionableForDisplay(dataQuality.actionable);`, compute `const ignoredFps = ignoredResult.kind === "ok" ? ignoredResult.fingerprints : new Set<string>();` then `const { active, ignored } = partitionByIgnored(actionableItems, ignoredFps);`.
  - Change the panel render condition to `dataQuality.messages.length > 0 || active.length > 0 || ignored.length > 0` (plus the existing `failed` branch).
  - Pass `renderItemControls={(w) => <DataQualityWarningControls slug={slug} showId={show.id} warning={w} driveFileId={show.drive_file_id} mode="active" reportSurfaceId={buildReportSurfaceId(slug, w)} />}` to `<PerShowActionableWarnings items={active} … />`. (`buildReportSurfaceId` is server-only and takes only `(slug, w)` — no index/list.)
  - Below it, when `ignored.length > 0`, render the `<details data-testid="per-show-ignored-warnings" className="group">` with a `per-show-ignored-summary` `Ignored ({ignored.length})` + chevron, and a `<ul>` keyed by `stableWarningKeys(ignored)` mapping `ignored` through the same card skin (muted: `opacity-75`) with `mode="ignored"` controls and `reportSurfaceId={buildReportSurfaceId(slug, w)}`. Use the exact marker-suppression + chevron classes from spec §7.4.

- [ ] **Step 4: Run — verify pass.** Then run the pre-existing `pnpm vitest run tests/app/admin/perShowPage.test.tsx tests/admin/perShowDataQualityActionable.test.tsx` to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/show/[slug]/page.tsx" tests/app/admin/dataQualityIgnoreIntegration.test.tsx
git commit --no-verify -m "feat(admin): wire Report/Ignore + Ignored(N) into the Data quality panel"
```

---

### Task 14: Transition audit (mandatory)

**Files:**
- Test: `tests/components/admin/dataQualityTransitionAudit.test.tsx`

Body includes the spec's Transition Inventory table (§7.6). Assert:
1. Each conditional/ternary render in `DataQualityWarningControls` is deliberate: the error `<p role="alert">` appears only in `error` state; the button label swaps on `running`; no `AnimatePresence`/motion props (transitions are instant by design — D9).
2. The `<details>` uses only a `transition-transform` chevron (grep the component/page source), no `max-height` animation.
3. **Compound transition (Codex plan-R1):** ignoring an earlier sibling must NOT remount a later card. Force a parent re-render with a **shifted list** — render active `[A, B]`, then re-render active `[B]` (A ignored). Assert: `stableWarningKeys([A,B])[1] === stableWarningKeys([B])[0]` (B's key unchanged) AND `buildReportSurfaceId(slug, B)` is identical before/after (surfaceId unchanged). This is the property that keeps B's open `ReportButton` modal + draft alive across an ignore refresh. An index-based key/surfaceId implementation FAILS this test — that is the point of the assertion (it would have caught the index bug).

Failure mode caught: an unintended animation on the instant transitions; a compound-state bug where an ignore action disrupts an in-progress report on another card.

- [ ] **Steps:** write test → run-fail (if it exercises not-yet-true behavior) or run-pass (audit of existing structure) → commit.

```bash
git add tests/components/admin/dataQualityTransitionAudit.test.tsx
git commit --no-verify -m "test(admin): data-quality controls transition audit"
```

---

### Task 15: DEFERRED.md + full-suite gate

**Files:**
- Modify: `DEFERRED.md`

- [ ] **Step 1: Add v1 scope-boundary entries** (spec §11): (a) Report/Ignore on the data-gap digest group (`UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED`) — needs `readDataQuality` widened to carry warning objects; `BLOCK_DISAPPEARED` remains non-ignorable; (b) bulk "Ignore all N of this type"; (c) orphaned-ignore GC; (d) `logAdminOutcome` audit trail for ignore/un-ignore. Each entry: what, why deferred, and the re-entry condition. If `DEFERRED.md` does not exist, create it following the repo's existing deferral-entry format (check `git log` for prior entries).

- [ ] **Step 2: Run the FULL suite + typecheck**

```bash
pnpm typecheck && pnpm test
```
Expected: green. Investigate any failure before proceeding.

- [ ] **Step 3: Commit**

```bash
git add DEFERRED.md
git commit --no-verify -m "docs(data-quality): DEFERRED entries for v1 scope boundaries"
```

---

## Close-out (post-implementation, before merge)

1. **Impeccable dual-gate (invariant 8):** run `/impeccable critique` AND `/impeccable audit` on the UI diff (`components/admin/DataQualityWarningControls.tsx`, `components/admin/PerShowActionableWarnings.tsx`, `app/admin/show/[slug]/page.tsx`). Fix HIGH/CRITICAL or record a `DEFERRED.md` entry. Both run with the v3 preflight gates (PRODUCT.md / DESIGN.md / register / preflight).
2. **Whole-diff cross-model review (Codex):** fresh-eyes adversarial review of the entire branch diff → APPROVE. Triage findings via deferral discipline (land-now / DEFERRED.md / BACKLOG.md).
3. **Migration→validation parity confirmed:** both migrations applied to the validation project; `pnpm vitest run tests/db/validation-schema-parity.test.ts` green (Layer 1 + Layer 2).
4. **Real CI green:** push, open PR, confirm the actual GitHub Actions run is green (mergeStateStatus CLEAN); local-green is necessary but not sufficient.
5. **Merge:** `gh pr merge --merge` (merge commit; squash/rebase disabled).
6. **Fast-forward local `main`:** `git checkout main && git pull --ff-only`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

## Self-Review (author checklist — run before adversarial review)

1. **Spec coverage:** every spec section maps to a task — D1 Report (T4/T11/T13), D2 table (T5), D3 fingerprint (T1/T2), D4 Pattern A (T6/T7), D5 routes (T9/T10), D6 plain-sentence failure (T11), D8 scope (T15 DEFERRED), D9 collapsible (T13), D10 render-prop (T12); AC-1..14 each have an owning test task.
2. **Placeholder scan:** no TBD/TODO; every code step shows the code.
3. **Type consistency:** `warningFingerprint`/`hasIgnorableSnippet`/`partitionByIgnored`/`buildReportSurfaceId`/`loadIgnoredWarnings`/`handleIgnore`/`handleUnignore`/`DataQualityWarningControls`/`renderItemControls` signatures are identical across the tasks that define and consume them.
