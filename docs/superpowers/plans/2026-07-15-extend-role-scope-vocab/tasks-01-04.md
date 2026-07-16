# Tasks 1–4 — parser foundation, migration, FINANCIALS read paths

Read `00-overview.md` first. Spec sections cited per task are canonical.

---

### Task 1: Vocabulary leaf module (`lib/parser/roleVocabulary.ts`)

Spec §5.3. Move the vocabulary to a dependency-free leaf; add `canonicalRoleToken` + `isBuiltInRoleToken`; parser imports the leaf (one-way dependency, parity by construction).

**Files:**
- Create: `lib/parser/roleVocabulary.ts`
- Modify: `lib/parser/personalization.ts` (remove moved constants at :18-45, import + re-export from leaf, use `canonicalRoleToken` in the tokenizer at :344-346)
- Test: `tests/parser/roleVocabulary.test.ts` (new)

**Interfaces (Produces):**
- `canonicalRoleToken(raw: string): string`
- `isBuiltInRoleToken(token: string): boolean`
- `ROLE_NORMALIZATIONS: Record<string, RoleFlag>`, `MULTI_WORD_TOKENS: string[]` (now exported from the leaf; `personalization.ts` re-exports both so `lib/parser/stageClause.ts:18` keeps compiling unchanged)

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/roleVocabulary.test.ts
import { describe, expect, test } from "vitest";
import {
  ROLE_NORMALIZATIONS,
  MULTI_WORD_TOKENS,
  canonicalRoleToken,
  isBuiltInRoleToken,
} from "@/lib/parser/roleVocabulary";
import { extractRoleFlags } from "@/lib/parser/personalization";

describe("canonicalRoleToken", () => {
  test("trims and uppercases, preserves internal whitespace VERBATIM (spec §5.3)", () => {
    expect(canonicalRoleToken("  drone   op ")).toBe("DRONE   OP");
    expect(canonicalRoleToken("a1")).toBe("A1");
  });
});

describe("isBuiltInRoleToken — tie-to-emission matrix (spec §8.3)", () => {
  test("(a) every exact ROLE_NORMALIZATIONS key is built-in", () => {
    for (const key of Object.keys(ROLE_NORMALIZATIONS)) {
      expect(isBuiltInRoleToken(key), key).toBe(true);
    }
  });

  test("(b) repeated-internal-whitespace variants of SPACE-CONTAINING keys are built-in AND emit no UNKNOWN_ROLE_TOKEN", () => {
    for (const mwt of MULTI_WORD_TOKENS) {
      const variant = mwt.replace(/ /g, "   ");
      expect(isBuiltInRoleToken(variant), variant).toBe(true);
      const { warnings } = extractRoleFlags(variant);
      expect(warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
    }
  });

  test("(c) ONLY is built-in (tokenizer skips it before lookup, personalization.ts:352)", () => {
    expect(isBuiltInRoleToken("ONLY")).toBe(true);
    const { warnings } = extractRoleFlags("ONLY");
    expect(warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
  });

  test("a genuinely novel token is NOT built-in", () => {
    expect(isBuiltInRoleToken("DRONE OP")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/parser/roleVocabulary.test.ts`
Expected: FAIL — `Cannot find module '@/lib/parser/roleVocabulary'`.

- [ ] **Step 3: Create the leaf module**

Create `lib/parser/roleVocabulary.ts`. MOVE the two constants VERBATIM from `lib/parser/personalization.ts` (the `ROLE_NORMALIZATIONS` object literal currently at :18-42 and `MULTI_WORD_TOKENS` at :45 — cut the exact lines, do not retype them), then add the helpers:

```ts
// lib/parser/roleVocabulary.ts
// Dependency-free vocabulary leaf (spec 2026-07-15-extend-role-scope-vocab §5.3).
// Single source for the role vocabulary + token canonicality. Imported by the
// parser (personalization.ts), the admin action boundary, and UI echoes —
// one-way dependency, so parser/action parity holds by construction.
import type { RoleFlag } from "./types";

export const ROLE_NORMALIZATIONS: Record<string, RoleFlag> = {
  /* MOVED VERBATIM from personalization.ts:18-42 — do not edit values */
};

export const MULTI_WORD_TOKENS: string[] = [
  /* MOVED VERBATIM from personalization.ts:45 */
];

/**
 * EXACTLY the tokenizer's per-token transform (split on '/'/'-' happens at the
 * call site; this is the .trim().toUpperCase() applied to each token). Internal
 * whitespace is preserved VERBATIM — collapsing it would store mapping keys the
 * parser never emits (spec §5.3, Codex R1 F3).
 */
export function canonicalRoleToken(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * True when the parser can never emit this token as UNKNOWN_ROLE_TOKEN:
 * exact map key, flexible-whitespace multi-word form (parser regex uses \s+,
 * personalization.ts multi-word extraction), or the ONLY restriction marker
 * (tokenizer `continue`s on it before lookup). Spec §8.3.
 */
export function isBuiltInRoleToken(token: string): boolean {
  if (token === "ONLY") return true;
  if (Object.hasOwn(ROLE_NORMALIZATIONS, token)) return true;
  return Object.hasOwn(ROLE_NORMALIZATIONS, token.replace(/\s+/g, " "));
}
```

- [ ] **Step 4: Rewire `personalization.ts`**

Replace the removed definitions with an import + re-export (keeps `stageClause.ts:18` and every other consumer compiling):

```ts
import { ROLE_NORMALIZATIONS, MULTI_WORD_TOKENS, canonicalRoleToken } from "./roleVocabulary";
export { ROLE_NORMALIZATIONS };
```

(`MULTI_WORD_TOKENS` was module-private before — keep it un-re-exported unless a grep shows an external consumer; `SHORT_ROLE_CODES` at :48 derives from `ROLE_NORMALIZATIONS` and stays where it is.)

In the tokenizer (currently `:344-346`), replace `.map((t) => t.trim().toUpperCase())` with `.map((t) => canonicalRoleToken(t))`.

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run tests/parser/roleVocabulary.test.ts tests/parser` — the new file passes and NO existing parser test regresses (behavior is unchanged; this is a mechanical move).
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A lib/parser tests/parser/roleVocabulary.test.ts
git commit --no-verify -m "refactor(parser): extract role vocabulary to dependency-free leaf module

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `roleToken` on `UNKNOWN_ROLE_TOKEN` warnings

Spec §5.1/§5.2. Additive machine-readable token; never parse prose.

**Files:**
- Modify: `lib/parser/types.ts:38-68` (ParseWarning), `lib/parser/personalization.ts` (emit site, currently :374-381)
- Test: `tests/parser/roleTokenWarningField.test.ts` (new)

**Interfaces (Produces):** `ParseWarning.roleToken?: string` — ALWAYS set on `UNKNOWN_ROLE_TOKEN`, ABSENT on every other code.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/roleTokenWarningField.test.ts
import { describe, expect, test } from "vitest";
import { extractRoleFlags } from "@/lib/parser/personalization";

describe("UNKNOWN_ROLE_TOKEN roleToken payload (spec §5.1)", () => {
  test("carries the canonical token, one warning per unknown token", () => {
    const { warnings } = extractRoleFlags("drone   op / A1 / grip");
    const unknown = warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN");
    expect(unknown.map((w) => w.roleToken).sort()).toEqual(["DRONE   OP", "GRIP"]);
  });

  test("absent on every other code (autocorrect keeps no roleToken)", () => {
    const { warnings } = extractRoleFlags("CONTENT CRETION");
    const auto = warnings.filter((w) => w.code === "ROLE_TOKEN_AUTOCORRECTED");
    expect(auto.length).toBe(1);
    expect(auto[0]!.roleToken).toBeUndefined();
    expect(warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/parser/roleTokenWarningField.test.ts`
Expected: FAIL — `roleToken` is `undefined` on the unknown warnings (field doesn't exist yet). (If the first assertion fails on tokenization instead, check the fixture string against the tokenizer split chars `/` and `-`.)

- [ ] **Step 3: Implement**

`lib/parser/types.ts`, inside `ParseWarning` after `rawSnippet?` (follow the `resolution?` comment style at :52-61):

```ts
  // The exact canonical role token that failed vocabulary lookup. ALWAYS set on
  // UNKNOWN_ROLE_TOKEN; ABSENT on every other warning code (absence discriminates).
  // jsonb-persisted — additive, backward-compatible, no migration (spec
  // 2026-07-15-extend-role-scope-vocab §5.1).
  roleToken?: string;
```

`lib/parser/personalization.ts` emit site (the `else` branch currently at :374-381): add `roleToken: tok,` to the pushed warning object (`tok` is already canonical — it went through `canonicalRoleToken` in Task 1).

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run tests/parser/roleTokenWarningField.test.ts tests/parser`
Expected: PASS, no parser regressions (additive field; fixtures asserting exact warning shapes with `toEqual` may need the new field added — that is the test telling you which fixtures now see richer output; update those assertions to include `roleToken`, per the optional-field/exact-shape memory).

- [ ] **Step 5: Commit**

```bash
git add -A lib/parser tests/parser
git commit --no-verify -m "feat(parser): stamp machine-readable roleToken on UNKNOWN_ROLE_TOKEN warnings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Migration + read posture + DML lockdown row

Spec §3. One-shot migration; RLS no-policy default-deny; explicit service_role grant; two-sided posture test; lockdown registry row; validation parity.

**Files:**
- Create: `supabase/migrations/20260716000000_role_token_mappings.sql`
- Modify: `tests/db/postgrest-dml-lockdown.test.ts` (`RPC_GATED_TABLES`, :147), `supabase/__generated__/schema-manifest.json` (regenerated)
- Test: `tests/db/roleTokenMappingsPosture.test.ts` (new; DB-bound — follows the env-gating pattern of the other `tests/db/*` files: skip when no local DB)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260716000000_role_token_mappings.sql
-- Global admin-editable role-token -> capability mapping
-- (spec docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md §3).
create table public.role_token_mappings (
  token text primary key,
  grants text[] not null default '{}',
  decided_by text not null
    constraint role_token_mappings_decided_by_canonical
    check (decided_by = lower(btrim(decided_by)) and decided_by <> ''),
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_token_mappings_token_canonical
    check (token = upper(btrim(token)) and length(token) between 1 and 64),
  constraint role_token_mappings_grants_allowed
    check (
      grants <@ array['A1','V1','L1','FINANCIALS']::text[]
      and array_position(grants, null) is null
    )
);

-- Read posture (spec §3): RLS enabled with ZERO policies = default-deny for
-- anon/authenticated PostgREST access. Deliberately STRICTER than the
-- admin_only-policy tables (20260501002000_rls_policies.sql:61-85) — this
-- table has NO client-session readers; every reader/writer is server-side
-- service-role. Do NOT add an admin_only policy here.
alter table public.role_token_mappings enable row level security;
grant all privileges on table public.role_token_mappings to service_role;
revoke insert, update, delete on public.role_token_mappings from anon, authenticated;
```

- [ ] **Step 2: Apply locally + regenerate the manifest**

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260716000000_role_token_mappings.sql   # or supabase db reset if that is your local loop
pnpm gen:schema-manifest
git diff --stat supabase/__generated__/schema-manifest.json   # must show the new table
```

- [ ] **Step 3: Write the failing posture test**

```ts
// tests/db/roleTokenMappingsPosture.test.ts
// Two-sided read-posture proof (spec §3, Codex R3 F2): authenticated SELECT is
// empty/denied AND a service-role round-trip succeeds — a missing service_role
// grant can never false-pass as "denial works". Copy the env-gating +
// client-construction helpers from tests/db/postgrest-dml-lockdown.test.ts
// (same SUPABASE_URL/keys source, same describe.skipIf condition).
import { describe, expect, test } from "vitest";

describe("role_token_mappings read posture", () => {
  test("authenticated SELECT is denied/empty (RLS no-policy default-deny)", async () => {
    // authenticated-role PostgREST client (anon key + authenticated JWT, as in the lockdown test)
    // GET /rest/v1/role_token_mappings?select=token
    // expect: [] (RLS filters all rows) — and NEVER a row.
  });

  test("service-role insert -> select -> delete round-trip succeeds", async () => {
    // service-role client:
    // insert { token: "POSTURE TEST", grants: [], decided_by: "posture@test.local" }
    // select it back (1 row), delete it, expect no error at each step.
  });
});
```

(The bodies use the exact fetch/client helpers already present in `postgrest-dml-lockdown.test.ts` — reuse them; the comments above are the behavioral contract, the assertions are real code in the final test.)

- [ ] **Step 4: Add the lockdown registry row**

In `tests/db/postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES` (:147), add:

```ts
  {
    table: "role_token_mappings",
    closed_at: "supabase/migrations/20260716000000_role_token_mappings.sql:24",
    selectAnon: false,
    selectAuthenticated: false,
    postBody: { token: "LOCKDOWN TEST", grants: [], decided_by: "lockdown@test.local" },
    rowFilter: "?token=eq.LOCKDOWN%20TEST",
  },
```

(Adjust the `closed_at` line number to the actual `revoke` line in the committed migration.)

- [ ] **Step 5: Run the DB tests locally**

Run: `pnpm exec vitest run tests/db/roleTokenMappingsPosture.test.ts tests/db/postgrest-dml-lockdown.test.ts`
Expected: PASS against the local stack (skip-clean without one; real CI is the arbiter).

- [ ] **Step 6: Apply to the validation project (from the MAIN checkout, where `.env.local` has the validation triple)**

```bash
cd /Users/ericweiss/FX-Webpage-Template
psql "$TEST_DATABASE_URL" -f .claude/worktrees/role-vocab/supabase/migrations/20260716000000_role_token_mappings.sql
psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260716000000_role_token_mappings.sql supabase/__generated__/schema-manifest.json tests/db
git commit --no-verify -m "feat(db): role_token_mappings table with zero-policy RLS posture + lockdown row

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `FINANCIALS` flag — both read paths

Spec §4/§4.1 (flag lifecycle table is the contract). New `RoleFlag` member; `financialsVisible` extension; `getShowForViewer` projection gate; `capabilityTransitions` check.

**Files:**
- Modify: `lib/parser/types.ts:98-123` (RoleFlag union), `lib/visibility/scopeTiles.ts:137-139`, `lib/data/getShowForViewer.ts` (:365 gate + :746 read slot + header comments :29,:37,:75,:128), `lib/visibility/capabilityTransitions.ts` (only if its matrix covers financials — read it first)
- Test: `tests/visibility/financialsFlag.test.ts` (new), plus the projection test in Task 14

- [ ] **Step 1: Write the failing test**

```ts
// tests/visibility/financialsFlag.test.ts
import { describe, expect, test } from "vitest";
import { financialsVisible, audioScopeVisible, videoScopeVisible, lightingScopeVisible } from "@/lib/visibility/scopeTiles";

describe("FINANCIALS flag (spec §4.1)", () => {
  test("financialsVisible accepts FINANCIALS without admin/LEAD", () => {
    expect(financialsVisible(["FINANCIALS"], false)).toBe(true);
  });
  test("existing gates unchanged", () => {
    expect(financialsVisible([], false)).toBe(false);
    expect(financialsVisible(["LEAD"], false)).toBe(true);
    expect(financialsVisible([], true)).toBe(true);
    // FINANCIALS unlocks NOTHING else
    expect(audioScopeVisible(["FINANCIALS"])).toBe(false);
    expect(videoScopeVisible(["FINANCIALS"])).toBe(false);
    expect(lightingScopeVisible(["FINANCIALS"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/visibility/financialsFlag.test.ts`
Expected: FAIL — TS error: `"FINANCIALS"` not assignable to `RoleFlag`.

- [ ] **Step 3: Implement**

`lib/parser/types.ts` — add to the union with the provenance comment:

```ts
  // Admin-granted financial visibility (spec 2026-07-15-extend-role-scope-vocab §4.1).
  // Reachable ONLY via role_token_mappings grants — ROLE_NORMALIZATIONS never maps
  // any sheet token to it; no sheet content can grant financial visibility.
  | "FINANCIALS"
```

`lib/visibility/scopeTiles.ts:138`:

```ts
  return isAdmin || flags.includes("LEAD") || flags.includes("FINANCIALS");
```

`lib/data/getShowForViewer.ts` — introduce the explicit entitlement next to :365, leaving every OTHER `isLead` consumer untouched:

```ts
  const isLead = isAdmin || derivedFlags.includes("LEAD");
  // Financial-data entitlement (spec §4.1): the FINANCIALS mapping grant reads
  // financials through the same service-role path LEADs use; every other isLead
  // consumer in this file is NOT financial-specific and stays LEAD-only.
  const financialsEntitled = isLead || derivedFlags.includes("FINANCIALS");
```

and at the read slot (:746): `financialsEntitled ? readFinancials() : Promise.resolve(undefined)`. Update the header application-gate comments (:29, :37, :75, :128) to name `financialsEntitled` where they currently say `isLead` decides the financials JOIN.

Read `lib/visibility/capabilityTransitions.ts` (:53 `CapabilityPredicate`, :132 matrix, :296 `affectedTilesOnFlip`): if financials participates in the transition matrix, add the FINANCIALS flip → financials-tile delta row and a matrix test mirroring the file's existing test style; if financials is NOT in that machinery, add a one-line comment in the plan-execution notes and skip (spec §4.1 explicitly delegates this check).

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run tests/visibility tests/parser`
Expected: PASS (RoleFlag widening is additive; any exact-union exhaustiveness switch the compiler flags gets a FINANCIALS arm).

- [ ] **Step 5: Commit**

```bash
git add -A lib/parser/types.ts lib/visibility lib/data/getShowForViewer.ts tests/visibility
git commit --no-verify -m "feat(crew-page): FINANCIALS role flag — render predicate + data-projection entitlement

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
