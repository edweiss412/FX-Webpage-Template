# Tasks 5–8 — overlay module, gate, phase2 integration, threading + emission

---

### Task 5: `normalizeRoleTokenMappings` boundary

Spec §6.2. Single validation boundary for DB rows; mirrors `normalizeUseRawDecisions` (`lib/sync/useRawOverlay.ts:188-222` — read it first, copy its posture).

**Files:**
- Create: `lib/sync/roleMappingOverlay.ts` (types + normalize; overlay function arrives in Task 6)
- Test: `tests/sync/roleMappingOverlay.test.ts` (new)

**Interfaces (Produces):**

```ts
export const GRANTABLE_FLAGS = ["A1", "V1", "L1", "FINANCIALS"] as const;
export type GrantableFlag = (typeof GRANTABLE_FLAGS)[number];
export type RoleTokenMapping = {
  token: string;          // canonical (trim/upper, internal whitespace verbatim)
  grants: GrantableFlag[]; // deduped, stable GRANTABLE_FLAGS order; may be []
  decidedBy: string;
  decidedAt: string;
};
export function normalizeRoleTokenMappings(raw: unknown): RoleTokenMapping[];
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/sync/roleMappingOverlay.test.ts
import { describe, expect, test } from "vitest";
import { normalizeRoleTokenMappings } from "@/lib/sync/roleMappingOverlay";

const ROW = { token: "DRONE OP", grants: ["A1"], decided_by: "doug@fxav.com", decided_at: "2026-07-16T00:00:00.000Z" };

describe("normalizeRoleTokenMappings (spec §6.2) — never throws, drops corrupt rows", () => {
  test("non-array → []", () => {
    expect(normalizeRoleTokenMappings(null)).toEqual([]);
    expect(normalizeRoleTokenMappings("x")).toEqual([]);
  });
  test("valid row passes; snake_case columns map to camelCase fields", () => {
    expect(normalizeRoleTokenMappings([ROW])).toEqual([
      { token: "DRONE OP", grants: ["A1"], decidedBy: "doug@fxav.com", decidedAt: "2026-07-16T00:00:00.000Z" },
    ]);
  });
  test("drops: non-canonical token, out-of-set grant, blank decidedBy, bad decidedAt", () => {
    expect(normalizeRoleTokenMappings([{ ...ROW, token: " drone op" }])).toEqual([]);
    expect(normalizeRoleTokenMappings([{ ...ROW, grants: ["LEAD"] }])).toEqual([]);
    expect(normalizeRoleTokenMappings([{ ...ROW, decided_by: "  " }])).toEqual([]);
    expect(normalizeRoleTokenMappings([{ ...ROW, decided_at: "not-a-date" }])).toEqual([]);
  });
  test("dedupes grants into stable A1,V1,L1,FINANCIALS order (spec §8.3/Codex R2 F4)", () => {
    const out = normalizeRoleTokenMappings([{ ...ROW, grants: ["FINANCIALS", "A1", "A1", "V1"] }]);
    expect(out[0]!.grants).toEqual(["A1", "V1", "FINANCIALS"]);
  });
  test("recognize-only (empty grants) is valid", () => {
    expect(normalizeRoleTokenMappings([{ ...ROW, grants: [] }])[0]!.grants).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run tests/sync/roleMappingOverlay.test.ts` → module not found.

- [ ] **Step 3: Implement**

```ts
// lib/sync/roleMappingOverlay.ts
import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import { canonicalRoleToken } from "@/lib/parser/roleVocabulary";

export const GRANTABLE_FLAGS = ["A1", "V1", "L1", "FINANCIALS"] as const;
export type GrantableFlag = (typeof GRANTABLE_FLAGS)[number];
const GRANTABLE = new Set<string>(GRANTABLE_FLAGS);

export type RoleTokenMapping = {
  token: string;
  grants: GrantableFlag[];
  decidedBy: string;
  decidedAt: string;
};

/** Dedupe + stable order (spec §8.3): filter GRANTABLE_FLAGS by membership. */
export function normalizeGrants(raw: readonly unknown[]): GrantableFlag[] | null {
  for (const g of raw) if (typeof g !== "string" || !GRANTABLE.has(g)) return null;
  const set = new Set(raw as string[]);
  return GRANTABLE_FLAGS.filter((f) => set.has(f));
}

/**
 * The SINGLE validation boundary for role_token_mappings rows (spec §6.2).
 * Mirrors normalizeUseRawDecisions (useRawOverlay.ts:188): non-array -> [];
 * corrupt rows dropped; NEVER throws.
 */
export function normalizeRoleTokenMappings(raw: unknown): RoleTokenMapping[] {
  if (!Array.isArray(raw)) return [];
  const out: RoleTokenMapping[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    // canonical token: exact canonicalRoleToken fixpoint, 1..64 chars
    if (typeof e.token !== "string") continue;
    if (e.token !== canonicalRoleToken(e.token) || e.token.length === 0 || e.token.length > 64) continue; // canonicalize-exempt: role-token canonicality check, not email
    if (!Array.isArray(e.grants)) continue;
    const grants = normalizeGrants(e.grants);
    if (grants === null) continue;
    if (typeof e.decided_by !== "string" || e.decided_by.trim() === "") continue; // canonicalize-exempt: blank-check of a validation field, not email normalization
    if (typeof e.decided_at !== "string" || Number.isNaN(Date.parse(e.decided_at))) continue;
    out.push({ token: e.token, grants, decidedBy: e.decided_by, decidedAt: e.decided_at });
  }
  return out;
}
```

(The `// canonicalize-exempt:` markers are same-line, required by the no-inline-email-normalization guard which scans ALL of `lib/sync` — run `pnpm exec vitest run tests/admin/no-inline-email-normalization.test.ts` in Step 4.)

- [ ] **Step 4: Run** — `pnpm exec vitest run tests/sync/roleMappingOverlay.test.ts tests/admin/no-inline-email-normalization.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/roleMappingOverlay.ts tests/sync/roleMappingOverlay.test.ts
git commit --no-verify -m "feat(sync): normalizeRoleTokenMappings validation boundary

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `applyRoleTokenMappings` overlay

Spec §6 semantics, all pinned: exact token match, crew row via `blockRef` guard, union+dedupe flags, drop matched warnings, recognize-only, fail-closed skips, pure.

**Files:**
- Modify: `lib/sync/roleMappingOverlay.ts`
- Test: `tests/sync/roleMappingOverlay.test.ts` (extend)

**Interfaces (Produces):**

```ts
export type AppliedRoleMapping = {
  token: string;
  grants: GrantableFlag[];
  memberIndex: number;
  memberName: string;
  blockRefName: string | null; // consumed warning's blockRef.name (raw NAME cell) — gate identity (§10)
};
export type ApplyRoleMappingsResult = { result: ParseResult; applied: AppliedRoleMapping[] };
export function applyRoleTokenMappings(parseResult: ParseResult, mappings: RoleTokenMapping[]): ApplyRoleMappingsResult;
```

- [ ] **Step 1: Write the failing tests** (extend the Task 5 file; build a minimal `ParseResult` fixture the way `tests/sync/useRawOverlay.test.ts` does — copy its fixture helper and add a crew member + warning)

```ts
import { applyRoleTokenMappings } from "@/lib/sync/roleMappingOverlay";

const MAPPING = { token: "DRONE OP", grants: ["A1" as const], decidedBy: "doug@fxav.com", decidedAt: "2026-07-16T00:00:00.000Z" };

function crewFixture() {
  // Reuse the ParseResult fixture builder pattern from tests/sync/useRawOverlay.test.ts,
  // with crewMembers[0] = { name: "Marcus Webb", role: "Drone Op", role_flags: [], ... }
  // and warnings = [{ severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "…",
  //   rawSnippet: "Drone Op", roleToken: "DRONE OP",
  //   blockRef: { kind: "crew", index: 0, name: "Marcus Webb" } }]
}

describe("applyRoleTokenMappings (spec §6)", () => {
  test("matched token: grants unioned (deduped) onto the crew row, warning removed, applied recorded", () => {
    const { result, applied } = applyRoleTokenMappings(crewFixture(), [MAPPING]);
    expect(result.crewMembers[0]!.role_flags).toContain("A1");
    expect(result.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
    expect(applied).toEqual([
      { token: "DRONE OP", grants: ["A1"], memberIndex: 0, memberName: "Marcus Webb", blockRefName: "Marcus Webb" },
    ]);
  });
  test("never removes existing flags; union only", () => { /* pre-set role_flags: ["V1"] → expect ["V1","A1"] membership */ });
  test("recognize-only: warning removed, flags unchanged, still recorded", () => { /* grants: [] */ });
  test("legacy warning without roleToken: untouched (fail-closed)", () => { /* delete roleToken → warning stays, flags unchanged, applied [] */ });
  test("unmapped token: untouched", () => { /* mappings [] */ });
  test("bad blockRef (index out of range / kind !== crew / missing): warning kept, nothing applied", () => {});
  test("multi-member same token: each matched independently", () => {});
  test("multi-token same cell: two warnings, matched independently", () => {});
  test("input ParseResult is never mutated (structuredClone)", () => {});
});
```

Every `/* … */` body above is real code in the final test file — derive the expectations from the fixture, never hardcode values the fixture can't produce (anti-tautology rule). Concrete failure modes these catch: flag loss on union, warning leak after match, prose-parsing fallback on legacy warnings, wrong-row writes on corrupt blockRef, and input mutation (which would corrupt the caller's parse).

- [ ] **Step 2: Run to verify failure** — `applyRoleTokenMappings` not exported.

- [ ] **Step 3: Implement**

```ts
export type AppliedRoleMapping = {
  token: string;
  grants: GrantableFlag[];
  memberIndex: number;
  memberName: string;
  blockRefName: string | null;
};
export type ApplyRoleMappingsResult = { result: ParseResult; applied: AppliedRoleMapping[] };

/**
 * "Recognize this role" overlay (spec 2026-07-15-extend-role-scope-vocab §6).
 * PURE and gate-free: consumes UNKNOWN_ROLE_TOKEN warnings whose roleToken has a
 * mapping — unions grants onto the crew row located by blockRef, removes the
 * warning, records the application. Everything else is fail-closed untouched.
 */
export function applyRoleTokenMappings(
  parseResult: ParseResult,
  mappings: RoleTokenMapping[],
): ApplyRoleMappingsResult {
  const result: ParseResult = structuredClone(parseResult);
  const applied: AppliedRoleMapping[] = [];
  if (mappings.length === 0) return { result, applied };
  const byToken = new Map(mappings.map((m) => [m.token, m]));

  const kept: ParseWarning[] = [];
  for (const w of result.warnings) {
    const mapping =
      w.code === "UNKNOWN_ROLE_TOKEN" && typeof w.roleToken === "string"
        ? byToken.get(w.roleToken)
        : undefined;
    if (!mapping) {
      kept.push(w);
      continue;
    }
    const idx = w.blockRef?.kind === "crew" ? w.blockRef.index : undefined;
    if (typeof idx !== "number" || idx < 0 || idx >= result.crewMembers.length) {
      kept.push(w); // corrupt/missing anchor — fail closed, warning stays
      continue;
    }
    const member = result.crewMembers[idx]!;
    for (const flag of mapping.grants) {
      if (!member.role_flags.includes(flag)) member.role_flags.push(flag);
    }
    applied.push({
      token: mapping.token,
      grants: mapping.grants,
      memberIndex: idx,
      memberName: member.name,
      blockRefName: typeof w.blockRef?.name === "string" ? w.blockRef.name : null,
    });
  }
  result.warnings = kept;
  return { result, applied };
}
```

- [ ] **Step 4: Run** — full file green: `pnpm exec vitest run tests/sync/roleMappingOverlay.test.ts`.

- [ ] **Step 5: Commit** — `feat(sync): applyRoleTokenMappings pure overlay`.

---

### Task 7: Delta gate + phase2 integration

Spec §10 points 2–4 (the 7-point contract is canonical). Gate = pure helper in the overlay module; `phase2` threads.

**Files:**
- Modify: `lib/sync/roleMappingOverlay.ts` (gate), `lib/sync/phase2.ts` (`Phase2Args` :131 region, overlay call after :263, `Phase2Result` :143, result assembly)
- Test: `tests/sync/roleMappingOverlay.test.ts` (gate unit tests), `tests/sync/phase2RoleMappings.test.ts` (integration — follow the existing `runPhase2` test harness patterns in `tests/sync/`)

**Interfaces (Produces):**

```ts
export type GatedRoleMapping = { token: string; grants: GrantableFlag[]; newMemberCount: number };
export function gateAppliedRoleMappings(
  applied: AppliedRoleMapping[],
  priorCrew: ReadonlyArray<{ name: string; role_flags: readonly string[] }> | undefined,
  priorWarnings: readonly ParseWarning[] | undefined,
): GatedRoleMapping[];
// Phase2Args additions:  roleTokenMappings?: RoleTokenMapping[];  priorParseWarnings?: ParseWarning[];
// Phase2Result "applied" arm addition:  appliedRoleMappings: GatedRoleMapping[];   // always present, [] when none
```

- [ ] **Step 1: Write the failing gate tests** (all semantics from §10 point 2; derive expectations from fixtures)

```ts
describe("gateAppliedRoleMappings (spec §10 point 2 — prior-persisted state only)", () => {
  test("same-token entries carry identical grants by construction (one row per token); the grouped entry uses them verbatim — documented, not inferred (Codex plan-R1 F5)", () => {});
  test("grants branch: emits when a granted flag is newly present vs prior role_flags", () => {});
  test("grants branch: silent when the member's prior flags already include every grant (steady state)", () => {});
  test("recognize-only branch: emits when prior warnings still contained (roleToken, blockRefName)", () => {});
  test("recognize-only branch: silent when prior warnings did not contain it (already suppressed)", () => {});
  test("recognize-only with blockRefName null: SKIPPED fail-closed (Codex R10 F2)", () => {});
  test("legacy prior warnings without roleToken never match (accepted carve-out, Codex R12 F4)", () => {});
  test("absent prior state (both undefined): everything is new -> emit", () => {});
  test("grouping: one entry per token, newMemberCount = gate-passing members (Codex R14 F4)", () => {});
  test("crew reorder does not re-emit (identity is name-based, never index)", () => {});
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement the gate**

```ts
export type GatedRoleMapping = { token: string; grants: GrantableFlag[]; newMemberCount: number };

/**
 * Delta gate (spec §10 point 2). Inputs are PRIOR-PERSISTED state only — never
 * this parse's pre-overlay output (a fresh parse always re-emits the warning;
 * gating on it would emit every sync). Steady state must be silent.
 */
export function gateAppliedRoleMappings(
  applied: AppliedRoleMapping[],
  priorCrew: ReadonlyArray<{ name: string; role_flags: readonly string[] }> | undefined,
  priorWarnings: readonly ParseWarning[] | undefined,
): GatedRoleMapping[] {
  const priorFlagsByName = new Map((priorCrew ?? []).map((m) => [m.name, m.role_flags]));
  const priorWarnKeys = new Set(
    (priorWarnings ?? [])
      .filter((w) => w.code === "UNKNOWN_ROLE_TOKEN" && typeof w.roleToken === "string" && typeof w.blockRef?.name === "string")
      .map((w) => `${w.roleToken}\0${w.blockRef!.name}`),
  );
  const noPrior = priorCrew === undefined && priorWarnings === undefined;

  const counts = new Map<string, { grants: GrantableFlag[]; members: Set<string> }>();
  for (const a of applied) {
    let passes: boolean;
    if (a.grants.length > 0) {
      const prior = priorFlagsByName.get(a.memberName);
      passes = noPrior || prior === undefined || a.grants.some((g) => !prior.includes(g));
    } else {
      if (a.blockRefName === null) continue; // no identity — fail closed (Codex R10 F2)
      passes = noPrior || priorWarnKeys.has(`${a.token}\0${a.blockRefName}`);
    }
    if (!passes) continue;
    const group = counts.get(a.token) ?? { grants: a.grants, members: new Set<string>() };
    group.members.add(a.blockRefName ?? a.memberName);
    counts.set(a.token, group);
  }
  return [...counts.entries()].map(([token, g]) => ({ token, grants: g.grants, newMemberCount: g.members.size }));
}
```

(Nuance the tests pin: for the grants branch, a member ABSENT from prior crew counts as new — that is a genuinely new person, emit.)

- [ ] **Step 4: phase2 integration**

In `lib/sync/phase2.ts`:
- `Phase2Args` (after `useRawDecisions?` at :131): `roleTokenMappings?: RoleTokenMapping[];` and `priorParseWarnings?: ParseWarning[];`
- Immediately after the use-raw overlay block (:263-266):

```ts
  const roleMappingOutcome = applyRoleTokenMappings(parseResult, args.roleTokenMappings ?? []);
  parseResult = roleMappingOutcome.result;
```

- Where the "applied" `Phase2Result` is assembled (locate the object literal that returns `outcome: "applied"`), compute and attach:

```ts
  appliedRoleMappings: gateAppliedRoleMappings(
    roleMappingOutcome.applied,
    /* the SAME prior-crew source nonLeadRoleFlagChanges receives (see its call at :468) */ previousCrewMembers,
    args.priorParseWarnings,
  ),
```

- `Phase2Result` "applied" arm gains `appliedRoleMappings: GatedRoleMapping[]` (always present).

Integration test (`tests/sync/phase2RoleMappings.test.ts`): drive `runPhase2` twice with the SAME fixture, first with `priorParseWarnings: undefined` (emit expected), second passing the first run's persisted warnings + crew as prior (silent expected), asserting `role_flags` were upserted with the grant and `parseWarnings` no longer contain the mapped warning. Follow the existing fixture/tx harness used by the current phase2 tests in `tests/sync/` — do not build a new harness.

- [ ] **Step 5: Run** — overlay + phase2 test files green, plus `pnpm exec vitest run tests/sync` for regressions.

- [ ] **Step 6: Commit** — `feat(sync): role-mapping overlay + delta gate wired into phase2`.

---

### Task 8: Loader threading + post-commit emission + walker

Spec §6.2 loading pattern, §10 points 3/5/7. THREE surfaces: cron+manual shared core, staged apply.

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (the shared `processOneFile` core — the region that loads `use_raw_decisions` at :920 and assembles Phase2Args, incl. the prior-show read). **VERIFIED (Codex plan-R1 F1): `runManualSyncForShow.ts:12-13` imports `processOneFile as defaultProcessOneFile` / `processOneFile_unlocked as defaultProcessOneFile_unlocked` FROM `runScheduledCronSync.ts` (`:2643`/`:3146`) and runs them at `:282`/`:299` — one shared core, so this single load site covers cron AND manual by construction.** Also `lib/sync/applyStaged.ts` (:530 region) + `lib/sync/applyStagedCore.ts` (:456,583 — optional-field conditional-spread pattern already used for `useRawDecisions`)
- Create: `lib/log/emitRoleTokenMapped.ts` (or colocate the emit helper in `lib/sync` beside the existing post-commit telemetry of those callers — match whichever module the surrounding emits live in)
- Test: `tests/sync/roleMappingThreading.test.ts` (walker) + telemetry lifecycle assertions in the Task 7 integration file

- [ ] **Step 1: Write the failing walker test**

```ts
// tests/sync/roleMappingThreading.test.ts
// Static walker (spec §10 point 3 + Codex R10 F4): every phase2 caller either
// threads BOTH roleTokenMappings and priorParseWarnings into its Phase2Args, or
// carries an inline `// first-publish-only:` exemption on the call. Grep-based,
// same style as tests/parser/_metaKnownSectionsWalker.test.ts (filesystem-walked,
// fails by default on a NEW caller).
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Extract the argument-object region of each runPhase2 CALL (from "runPhase2(" to
 * its closing on brace-balance) so the assertion proves the fields are IN the args,
 * not merely somewhere in the file (Codex plan-R1 F2). Same extraction serves the
 * emission clause (plan-R1 F3): a caller that consumes an applied Phase2Result must
 * also call emitRoleTokenMapped(...) post-commit or carry an inline exemption.
 */
function runPhase2CallRegions(src: string): string[] { /* brace-balanced slice from each "runPhase2(" index */ }

test("every runPhase2 caller threads BOTH fields inside the call args, or is exempted", () => {
  const callers = execSync(`grep -rln "runPhase2(" lib --include='*.ts'`, { encoding: "utf8" })
    .trim().split("\n").filter((f) => f !== "lib/sync/phase2.ts");
  expect(callers.length).toBeGreaterThan(0);
  for (const file of callers) {
    const src = readFileSync(file, "utf8");
    if (src.includes("// first-publish-only:")) continue;
    for (const region of runPhase2CallRegions(src)) {
      expect(region.includes("roleTokenMappings"), `${file}: roleTokenMappings missing from runPhase2 args`).toBe(true);
      expect(region.includes("priorParseWarnings"), `${file}: priorParseWarnings missing from runPhase2 args`).toBe(true);
    }
    // Emission clause (spec §10 point 5): the same caller must emit or exempt.
    const emits = src.includes("emitRoleTokenMapped(") || src.includes("// no-telemetry:");
    expect(emits, `${file} applies flags telemetry-dark — emit ROLE_TOKEN_MAPPED post-commit or exempt`).toBe(true);
  }
});
```

- [ ] **Step 2: Run to verify failure** — the callers don't thread yet.

- [ ] **Step 3: Implement threading**

In the cron/manual shared core (same place `use_raw_decisions` is loaded, `runScheduledCronSync.ts:920` region):

```ts
  const mappingRows = await tx.unsafe(`select token, grants, decided_by, decided_at from role_token_mappings`);
  // read-only global table read inside the existing pipeline tx; postgres.js path,
  // not a supabase-js call site -> outside _metaInfraContract scope by construction.
  const roleTokenMappings = normalizeRoleTokenMappings(mappingRows);
```

and thread into the Phase2Args object alongside `useRawDecisions`, plus `priorParseWarnings: priorShow?.parseWarnings` (use the SAME prior-show read that already feeds `useRawDecisions`/prior state at :3441 region; if the prior read returns no row, omit the field — that IS first publish). Mirror in the staged path (`applyStaged.ts:530` + conditional spread at `applyStagedCore.ts:583`), where prior = the prior staged row's parse warnings.

- [ ] **Step 4: Implement post-commit emission**

Helper (match `log.info` code-stamp style — the `code:` must be a top-level key of the second arg, AST-checkable):

```ts
// lib/log/emitRoleTokenMapped.ts
import { log } from "@/lib/log";
import type { GatedRoleMapping } from "@/lib/sync/roleMappingOverlay";

/** Post-commit only (invariant 10): call AFTER the sync tx commits, never inside it. */
export async function emitRoleTokenMapped(entries: readonly GatedRoleMapping[], ctx: { showId: string; source: string }): Promise<void> {
  for (const e of entries) {
    await log.info("role token mapping applied", {
      code: "ROLE_TOKEN_MAPPED",
      showId: ctx.showId,
      source: ctx.source,
      context: { token: e.token, grants: e.grants, newMemberCount: e.newMemberCount },
    });
  }
}
```

(Adapt the exact `log.info` signature to `lib/log`'s real API — read it first; the contract is: durable `code: "ROLE_TOKEN_MAPPED"`, context `{token, grants, newMemberCount}`, no names.) Call it at each surface's existing post-commit telemetry site with that surface's `Phase2Result.appliedRoleMappings` — cron/manual shared core AND staged apply. A rolled-back/`stale` result emits nothing (only the `outcome: "applied"` arm carries entries).

- [ ] **Step 5: Telemetry lifecycle tests** (extend `tests/sync/phase2RoleMappings.test.ts`, deriving all expectations from fixtures): steady-state second sync emits zero (both branches); grants edit `[A1]`→`[A1,V1]` emits exactly once; delete → zero events + warning returns; first-publish (fields omitted) emits once then silent; rollback — structural, since ONLY the `outcome:"applied"` result arm carries `appliedRoleMappings` and emission reads the result post-commit: assert a `stale`-outcome run produces zero emissions (spec §10 point 7).

- [ ] **Step 6: Run** — walker + lifecycle + `pnpm exec vitest run tests/sync tests/log`.

- [ ] **Step 7: Commit** — `feat(sync): thread role mappings + prior warnings through all apply surfaces; post-commit ROLE_TOKEN_MAPPED emission`.
