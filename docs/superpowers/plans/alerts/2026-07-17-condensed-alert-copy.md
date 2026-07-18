# Condensed Inline-Context Alert Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold at-a-glance identity into admin alert message text (catalog templates + read-time derived params), drop the identity chip for 13 converted codes, add a show-page action link to ROLE_FLAGS_NOTICE.

**Architecture:** A pure helper `deriveAlertMessageParams(code, context, identity)` merges raw `admin_alerts.context` scalars with params derived from the already-resolved `AlertIdentity` (sheet/show title) plus code-specific derivations (ROLE_FLAGS_NOTICE change lines + lead hint). Three render surfaces pass the merged params: bell feed (with identity), per-show alert section (with identity), telemetry health panel (identity-less → fallback phrases). Catalog `dougFacing` strings become `<placeholder>` templates; §12.4 master-spec prose is edited in lockstep.

**Tech Stack:** Next.js 16, TypeScript strict (`exactOptionalPropertyTypes`), Vitest, existing `lib/messages/lookup.ts` interpolation.

**Spec:** `docs/superpowers/specs/2026-07-17-condensed-alert-copy-design.md` (canonical; on conflict the spec wins).

## Global Constraints

- Invariant 5: no raw codes and no literal `<placeholder>` tokens in user-visible UI. Guard: unresolved template → message line dropped, chip retained.
- Invariant 6: one conventional commit per task, exactly as given in each task's commit step.
- §12.4 lockstep (same commit per catalog edit): master spec §12.4 prose + `pnpm gen:spec-codes` regen (`lib/messages/__generated__/spec-codes.ts`) + `lib/messages/catalog.ts`. Gate: `pnpm test:audit:x1-catalog-parity`.
- `resolveAlertAction` (single) keeps its exact current signature; only the new `resolveAlertActions` (list) is added. `HealthAlertsPanel.tsx:78` caller stays untouched.
- Derived param keys: `sheet-name`, `show-name`, `role-changes`, `lead-hint`. Derived values ALWAYS resolve (fallbacks `this sheet` / `this show` / `a crew member's role flags changed — see the show page.` / `""`). Derived keys override context keys on collision.
- Show/sheet titles wrap in straight single quotes `'` (U+0027) — never smart quotes.
- Flags join with ` + `. Change-line cap = 3, overflow line `+N more — see show page.`
- Run all commands from the worktree root `/Users/ericweiss/FX-wt-alert-copy`.
- After the last task: full suite `VITEST_EXCLUDE_ENV_BOUND=1 npx vitest run`, `pnpm typecheck`, whole-changed-set eslint, `pnpm format:check` — all before push (pre-push gates memory class).

---

### Task 1: `deriveAlertMessageParams` helper

**Files:**
- Create: `lib/adminAlerts/deriveMessageParams.ts`
- Test: `tests/adminAlerts/deriveMessageParams.test.ts`

**Interfaces:**
- Consumes: `MessageParams` (`lib/messages/lookup.ts:10`), `AlertIdentity` (`lib/adminAlerts/identityTypes.ts:60` — `{ segments: AlertIdentitySegment[]; global: boolean }`, segment = `{ label: string | null; value: string; pii?: true }`).
- Produces: `deriveAlertMessageParams(code: string, context: Record<string, unknown> | null, identity: AlertIdentity | null): MessageParams` — later tasks import it from `@/lib/adminAlerts/deriveMessageParams`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/adminAlerts/deriveMessageParams.test.ts
import { describe, expect, it } from "vitest";
import { deriveAlertMessageParams } from "@/lib/adminAlerts/deriveMessageParams";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";

const identity = (segments: Array<{ label: string | null; value: string }>): AlertIdentity => ({
  segments,
  global: false,
});

const change = (crew_name: string, prior_flags: string[], new_flags: string[]) => ({
  crew_name,
  prior_flags,
  new_flags,
});

describe("deriveAlertMessageParams — identity params", () => {
  it("quotes the Sheet segment into sheet-name and Show into show-name", () => {
    const p = deriveAlertMessageParams("REPORT_LEASE_THRASHING", null, identity([
      { label: "Sheet", value: "II - East Coast 2026" },
      { label: "Show", value: "II - East Coast 2026" },
    ]));
    expect(p["sheet-name"]).toBe("'II - East Coast 2026'");
    expect(p["show-name"]).toBe("'II - East Coast 2026'");
  });

  it("falls back to unquoted phrases when identity is null or segment missing", () => {
    const p = deriveAlertMessageParams("REPORT_LEASE_THRASHING", null, null);
    expect(p["sheet-name"]).toBe("this sheet");
    expect(p["show-name"]).toBe("this show");
  });

  it("passes context scalars through and lets derived keys win on collision", () => {
    const p = deriveAlertMessageParams(
      "BRANCH_PROTECTION_DRIFT",
      { repo: "edweiss412/FX-Webpage-Template", "show-name": "spoofed" },
      null,
    );
    expect(p.repo).toBe("edweiss412/FX-Webpage-Template");
    expect(p["show-name"]).toBe("this show");
  });
});

describe("deriveAlertMessageParams — ROLE_FLAGS_NOTICE", () => {
  const sheetIdentity = identity([{ label: "Sheet", value: "II - RIA Investment Forum" }]);

  it("single modified member reads as one sentence", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      { changes: [change("Doug Larson", ["A1"], ["A1", "LEAD"])] },
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe("Doug Larson's role changed from A1 to A1 + LEAD.");
    expect(p["lead-hint"]).toBe(" Lead changes must be confirmed in the show page.");
  });

  it("single added member (empty prior)", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      { changes: [change("Jane Doe", [], ["FINANCIALS"])] },
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe("Jane Doe was added with FINANCIALS.");
    expect(p["lead-hint"]).toBe("");
  });

  it("single removed member (empty new)", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      { changes: [change("Sam Roe", ["LEAD"], [])] },
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe("Sam Roe (LEAD) was removed from the crew.");
    expect(p["lead-hint"]).toBe(" Lead changes must be confirmed in the show page.");
  });

  it("multi renders header + bullets, exact composition", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      {
        changes: [
          change("Doug Larson", ["A1"], ["A1", "LEAD"]),
          change("Jane Doe", [], ["FINANCIALS"]),
          change("Sam Roe", ["LEAD"], []),
        ],
      },
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe(
      "3 role changes:\n• Doug Larson: A1 → A1 + LEAD\n• Jane Doe: added with FINANCIALS\n• Sam Roe: LEAD → (removed)",
    );
  });

  it("caps at 3 lines with an overflow line at 4+", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      {
        changes: [
          change("A", ["A1"], ["LEAD", "A1"]),
          change("B", ["V1"], ["FINANCIALS", "V1"]),
          change("C", [], ["LEAD"]),
          change("D", ["FINANCIALS"], []),
          change("E", ["A1"], ["A1", "FINANCIALS"]),
        ],
      },
      sheetIdentity,
    );
    const lines = String(p["role-changes"]).split("\n");
    expect(lines[0]).toBe("5 role changes:");
    expect(lines).toHaveLength(5); // header + 3 bullets + overflow
    expect(lines[4]).toBe("+2 more — see show page.");
  });

  it("FINANCIALS-only delta yields no lead hint", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      { changes: [change("Jane Doe", ["A1"], ["A1", "FINANCIALS"])] },
      sheetIdentity,
    );
    expect(p["lead-hint"]).toBe("");
  });

  it("LEAD loss (not just gain) yields the hint", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      { changes: [change("Doug Larson", ["LEAD", "A1"], ["A1"])] },
      sheetIdentity,
    );
    expect(p["lead-hint"]).toBe(" Lead changes must be confirmed in the show page.");
  });

  it.each([
    ["missing changes", {}],
    ["non-array changes", { changes: "nope" }],
    ["empty array", { changes: [] }],
    ["all entries malformed", { changes: [{ crew_name: 7, prior_flags: "x", new_flags: null }] }],
    ["null context", null],
  ])("falls back on %s", (_label, context) => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      context as Record<string, unknown> | null,
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe("a crew member's role flags changed — see the show page.");
    expect(p["lead-hint"]).toBe("");
  });

  it("skips malformed entries but keeps well-formed ones", () => {
    const p = deriveAlertMessageParams(
      "ROLE_FLAGS_NOTICE",
      {
        changes: [
          { crew_name: "", prior_flags: ["A1"], new_flags: ["LEAD"] }, // empty name → skipped
          change("Doug Larson", ["A1"], ["A1", "LEAD"]),
        ],
      },
      sheetIdentity,
    );
    expect(p["role-changes"]).toBe("Doug Larson's role changed from A1 to A1 + LEAD.");
  });

  it("non-ROLE_FLAGS codes get no role-changes/lead-hint params", () => {
    const p = deriveAlertMessageParams("REPORT_LEASE_THRASHING", { changes: [] }, null);
    expect(p["role-changes"]).toBeUndefined();
    expect(p["lead-hint"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adminAlerts/deriveMessageParams.test.ts`
Expected: FAIL — `Cannot find module '@/lib/adminAlerts/deriveMessageParams'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/adminAlerts/deriveMessageParams.ts
/**
 * Read-time message params for alert copy templates (spec
 * docs/superpowers/specs/2026-07-17-condensed-alert-copy-design.md §4.1).
 *
 * Merges the row's raw producer context (scalars only — interpolate() ignores
 * non-scalars) with params derived from the ALREADY-RESOLVED identity, so
 * catalog dougFacing templates can name the sheet/show inline. Every derived
 * key always resolves (fallback phrases), so converted codes never leak a
 * literal <placeholder>; the render-site unresolved-placeholder guard stays as
 * defense-in-depth only. Derived keys override context keys on collision (a
 * producer bag can never spoof the resolved identity). Pure — no I/O.
 */
import type { MessageParams } from "@/lib/messages/lookup";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";

const LEAD_HINT = " Lead changes must be confirmed in the show page.";
const ROLE_CHANGES_FALLBACK = "a crew member's role flags changed — see the show page.";
const CHANGE_LINE_CAP = 3;

type RoleChange = { crew_name: string; prior_flags: string[]; new_flags: string[] };

function segmentValue(identity: AlertIdentity | null, label: string): string | null {
  const seg = identity?.segments.find((s) => s.label === label);
  return seg && seg.value ? seg.value : null;
}

function quoted(value: string | null, fallback: string): string {
  return value ? `'${value}'` : fallback;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parseChanges(context: Record<string, unknown> | null): RoleChange[] {
  const raw = context?.changes;
  if (!Array.isArray(raw)) return [];
  const out: RoleChange[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.crew_name !== "string" || e.crew_name === "") continue;
    if (!isStringArray(e.prior_flags) || !isStringArray(e.new_flags)) continue;
    out.push({ crew_name: e.crew_name, prior_flags: e.prior_flags, new_flags: e.new_flags });
  }
  return out;
}

const fmt = (flags: string[]): string => flags.join(" + ");

function singleSentence(c: RoleChange): string {
  if (c.prior_flags.length === 0) return `${c.crew_name} was added with ${fmt(c.new_flags)}.`;
  if (c.new_flags.length === 0)
    return `${c.crew_name} (${fmt(c.prior_flags)}) was removed from the crew.`;
  return `${c.crew_name}'s role changed from ${fmt(c.prior_flags)} to ${fmt(c.new_flags)}.`;
}

function bulletLine(c: RoleChange): string {
  if (c.prior_flags.length === 0) return `• ${c.crew_name}: added with ${fmt(c.new_flags)}`;
  if (c.new_flags.length === 0) return `• ${c.crew_name}: ${fmt(c.prior_flags)} → (removed)`;
  return `• ${c.crew_name}: ${fmt(c.prior_flags)} → ${fmt(c.new_flags)}`;
}

function roleChangesParam(changes: RoleChange[]): string {
  if (changes.length === 0) return ROLE_CHANGES_FALLBACK;
  if (changes.length === 1) return singleSentence(changes[0]!);
  const lines = changes.slice(0, CHANGE_LINE_CAP).map(bulletLine);
  const overflow =
    changes.length > CHANGE_LINE_CAP
      ? [`+${changes.length - CHANGE_LINE_CAP} more — see show page.`]
      : [];
  return [`${changes.length} role changes:`, ...lines, ...overflow].join("\n");
}

function leadHintParam(changes: RoleChange[]): string {
  const leadDelta = changes.some(
    (c) => c.prior_flags.includes("LEAD") !== c.new_flags.includes("LEAD"),
  );
  return leadDelta ? LEAD_HINT : "";
}

export function deriveAlertMessageParams(
  code: string,
  context: Record<string, unknown> | null,
  identity: AlertIdentity | null,
): MessageParams {
  const params: Record<string, string | number | boolean | null | undefined> = {};
  for (const [key, value] of Object.entries(context ?? {})) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      params[key] = value;
    }
  }
  params["sheet-name"] = quoted(segmentValue(identity, "Sheet"), "this sheet");
  params["show-name"] = quoted(segmentValue(identity, "Show"), "this show");
  if (code === "ROLE_FLAGS_NOTICE") {
    const changes = parseChanges(context);
    params["role-changes"] = roleChangesParam(changes);
    params["lead-hint"] = leadHintParam(changes);
  }
  return params as MessageParams;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/adminAlerts/deriveMessageParams.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/adminAlerts/deriveMessageParams.ts tests/adminAlerts/deriveMessageParams.test.ts
git commit --no-verify -m "feat(admin): add deriveAlertMessageParams read-time alert copy params"
```

---

### Task 2: ROLE_FLAGS_NOTICE catalog rewrite (§12.4 lockstep)

**Files:**
- Modify: `lib/messages/catalog.ts:866-880` (ROLE_FLAGS_NOTICE entry)
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2865` (§12.4 row dougFacing cell) and the helpfulContext appendix line starting `ROLE_FLAGS_NOTICE:` (~line 3159)
- Regen: `lib/messages/__generated__/spec-codes.ts` via `pnpm gen:spec-codes`
- Test: `tests/messages/roleFlagsNoticeCopy.test.ts` (create)

**Interfaces:**
- Produces: catalog entry `ROLE_FLAGS_NOTICE` with `title: "Role change applied"`, templated `dougFacing`, `helpfulContext: null`. Tasks 6–8 rely on `lookupHelpfulContext("ROLE_FLAGS_NOTICE") === null` (caret disappears) and on the template placeholders `<sheet-name>`, `<role-changes>`, `<lead-hint>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/messages/roleFlagsNoticeCopy.test.ts
import { describe, expect, it } from "vitest";
import { messageFor, lookupHelpfulContext, plainCatalogText } from "@/lib/messages/lookup";

describe("ROLE_FLAGS_NOTICE condensed copy (spec 2026-07-17 §3.1)", () => {
  it("has the inline-context template, real title, and no helpfulContext", () => {
    const entry = messageFor("ROLE_FLAGS_NOTICE");
    expect(entry.title).toBe("Role change applied");
    expect(entry.dougFacing).toBe("In <sheet-name>, <role-changes><lead-hint>");
    expect(lookupHelpfulContext("ROLE_FLAGS_NOTICE")).toBeNull();
  });

  it("interpolates fully with derived params (no unresolved placeholder)", () => {
    const text = plainCatalogText(messageFor("ROLE_FLAGS_NOTICE").dougFacing ?? "", {
      "sheet-name": "'II - RIA Investment Forum'",
      "role-changes": "Doug Larson's role changed from A1 to A1 + LEAD.",
      "lead-hint": " Lead changes must be confirmed in the show page.",
    });
    expect(text).toBe(
      "In 'II - RIA Investment Forum', Doug Larson's role changed from A1 to A1 + LEAD. Lead changes must be confirmed in the show page.",
    );
    expect(text).not.toMatch(/<[a-zA-Z_][a-zA-Z0-9_-]*>/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/messages/roleFlagsNoticeCopy.test.ts`
Expected: FAIL — title is `null`, dougFacing is the old prose.

- [ ] **Step 3: Edit the catalog entry**

In `lib/messages/catalog.ts` ROLE_FLAGS_NOTICE entry (starts line 866), change exactly three fields:

```ts
  ROLE_FLAGS_NOTICE: {
    code: "ROLE_FLAGS_NOTICE",
    resolution: "manual",
    audience: "doug",
    severity: "info",
    dougFacing: "In <sheet-name>, <role-changes><lead-hint>",
    crewFacing: null,
    followUp: "none (informational)",
    helpfulContext: null,
    title: "Role change applied",
    longExplanation: null,
    helpHref: null,
  },
```

- [ ] **Step 4: Edit the master spec §12.4 in lockstep**

In `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`:

1. Line 2865 (`ROLE_FLAGS_NOTICE` table row): replace ONLY the quoted dougFacing cell — `"A crew member's role flags changed and were applied automatically — this entry is here for your audit. If the change included LEAD status (which grants admin/ops/financials access), confirm it was intentional."` — with `"In <sheet-name>, <role-changes><lead-hint>"`. Do not touch the trigger, crewFacing (`—`), or followUp cells. (Never run prettier on this file.)
2. In the §12.4 helpfulContext appendix (yaml fence near line 3159), DELETE the entire line beginning `ROLE_FLAGS_NOTICE: "A crew member's role flags changed…`.

Then regenerate: `pnpm gen:spec-codes`
Expected: `lib/messages/__generated__/spec-codes.ts` diff shows the ROLE_FLAGS_NOTICE dougFacing swap and helpfulContext going to null.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/messages/roleFlagsNoticeCopy.test.ts && pnpm test:audit:x1-catalog-parity && npx vitest run tests/messages/_metaCatalogCopyHygiene.test.ts tests/admin/roleFlagsNoticeReclassify.test.ts`
Expected: all PASS. If `roleFlagsNoticeReclassify.test.ts` pins the old copy string, update its expectation to the new template (behavioral assertions stay).

- [ ] **Step 6: Commit**

```bash
git add lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md tests/messages/roleFlagsNoticeCopy.test.ts tests/admin/roleFlagsNoticeReclassify.test.ts
git commit --no-verify -m "feat(messages): ROLE_FLAGS_NOTICE inline-context template + title, drop helpfulContext"
```

---

### Task 3: Sweep 12 codes' dougFacing (§12.4 lockstep)

**Files:**
- Modify: `lib/messages/catalog.ts` (12 entries — lines per table below)
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 rows (lines per table below; dougFacing cell only)
- Regen: `lib/messages/__generated__/spec-codes.ts`
- Test: `tests/messages/inlineIdentityCopy.test.ts` (create)

**Interfaces:**
- Produces: the 12 templated dougFacing strings below. Task 5's `INLINE_IDENTITY_CODES` set and meta-test depend on these exact placeholders.

New dougFacing strings (catalog + §12.4 cell, verbatim — catalog line = entry start, spec line = §12.4 row):

| Code | catalog.ts | spec §12.4 | New dougFacing |
|---|---|---|---|
| REPORT_ORPHANED_LOST_LEASE | 2397 | 2995 | `A duplicate bug-report issue for <show-name> was auto-closed during a retry race. Click through to verify it closed correctly. If this recurs, increase the lease window.` |
| REPORT_LOOKUP_INCONCLUSIVE | 2888 | 3042 | `We couldn't confirm whether a report for <show-name> went through. Try again in a few minutes.` |
| REPORT_DUPLICATE_LIVE_MATCHES | 2856 | 3040 | `Multiple live GitHub issues match one report for <show-name>. Recovery is paused until Eric reviews the duplicates.` |
| REPORT_OPEN_ORPHAN_LABEL | 2907 | 3043 | `An open GitHub issue for <show-name> carries the orphan-cleanup label. Eric needs to re-close it or remove the label.` |
| REPORT_LEASE_THRASHING | 2433 | 2997 | `Bug-report processing is thrashing on <show-name> — retries are racing against leases. This usually means the lease window needs tuning.` |
| STALE_ORPHAN_REPORT | 3076 | 3056 | `A stale bug-report reservation for <show-name> expired before it could create a GitHub issue. No action needed unless it repeats.` |
| PENDING_SNAPSHOT_PROMOTE_STUCK | 2046 | 2965 | `A diagram snapshot promotion for <show-name> has been stuck for more than 15 minutes. Eric needs to run the snapshot-promote repair tool before cleanup can finish.` |
| PENDING_SNAPSHOT_ROLLBACK_STUCK | 2064 | 2966 | `A diagram snapshot rollback for <sheet-name> stalled after moving some assets. Eric needs to run the snapshot-rollback repair tool before cleanup can finish.` |
| EMAIL_DELIVERY_FAILED | 2299 | 2986 | `A notification email for <show-name> couldn't be sent. We'll keep retrying automatically; if it persists, the developer will check the email provider setup.` |
| WIZARD_SESSION_SUPERSEDED_RACE | 255 | 2809 | `A leftover wizard action (<attempted-action>) for <file-name> was safely cancelled before it could change the new wizard's state. Continue in the active wizard tab.` |
| BRANCH_PROTECTION_DRIFT | 2082 | 2967 | `Branch protection on <repo> no longer matches the X.6 contract. Restore the required checks and review settings before merging.` |
| BRANCH_PROTECTION_MONITOR_AUTH_FAILED | 2100 | 2968 | `Branch-protection monitoring for <repo> cannot authenticate with GitHub. Rotate the GH App token or PAT within 24 hours.` |

(Line numbers are as of branch point ead3d9dd5; re-locate by grepping the code name if drifted. Only `dougFacing` changes — titles, severity, helpfulContext, followUp untouched.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/messages/inlineIdentityCopy.test.ts
import { describe, expect, it } from "vitest";
import { messageFor, type MessageCode } from "@/lib/messages/lookup";

// Spec 2026-07-17 §6: converted codes and the identity placeholder each template carries.
export const SWEEP_EXPECTATIONS: Record<string, string> = {
  REPORT_ORPHANED_LOST_LEASE: "<show-name>",
  REPORT_LOOKUP_INCONCLUSIVE: "<show-name>",
  REPORT_DUPLICATE_LIVE_MATCHES: "<show-name>",
  REPORT_OPEN_ORPHAN_LABEL: "<show-name>",
  REPORT_LEASE_THRASHING: "<show-name>",
  STALE_ORPHAN_REPORT: "<show-name>",
  PENDING_SNAPSHOT_PROMOTE_STUCK: "<show-name>",
  PENDING_SNAPSHOT_ROLLBACK_STUCK: "<sheet-name>",
  EMAIL_DELIVERY_FAILED: "<show-name>",
  WIZARD_SESSION_SUPERSEDED_RACE: "<file-name>",
  BRANCH_PROTECTION_DRIFT: "<repo>",
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: "<repo>",
};

describe("sweep codes carry identity inline (spec 2026-07-17 §6)", () => {
  it.each(Object.entries(SWEEP_EXPECTATIONS))("%s dougFacing contains %s", (code, token) => {
    expect(messageFor(code as MessageCode).dougFacing).toContain(token);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/messages/inlineIdentityCopy.test.ts`
Expected: FAIL — 12 assertions, none of the current strings contain placeholders.

- [ ] **Step 3: Apply the 12 catalog edits + 12 §12.4 dougFacing-cell edits from the table, then regen**

Each catalog entry: replace the `dougFacing` string with the table's value. Each §12.4 row: replace only the quoted dougFacing cell with the same value (keep surrounding cells; `WIZARD_SESSION_SUPERSEDED_RACE`'s appendix helpfulContext line stays untouched). Then:

Run: `pnpm gen:spec-codes`

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/messages/inlineIdentityCopy.test.ts && pnpm test:audit:x1-catalog-parity && npx vitest run tests/messages/_metaCatalogCopyHygiene.test.ts tests/messages/catalog.test.ts`
Expected: PASS. (`_metaCatalogCopyHygiene` bans SCREAMING_SNAKE code names in copy — the templates contain none.)

- [ ] **Step 5: Commit**

```bash
git add lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md tests/messages/inlineIdentityCopy.test.ts
git commit --no-verify -m "feat(messages): weave identity placeholders into 12 alert dougFacing templates"
```

---

### Task 4: `resolveAlertActions` list resolver

**Files:**
- Modify: `lib/adminAlerts/alertActions.ts` (append after `resolveAlertAction`, line ~136)
- Test: `tests/adminAlerts/alertActions.test.ts` (extend)
- Test: `tests/messages/_metaAlertActionsContract.test.ts` (extend if it walks exported resolvers; read it first — if its registry is per-code builders only, no change needed)

**Interfaces:**
- Consumes: existing `resolveAlertAction(code: string, context: Record<string, unknown> | null, opts: { slug: string | null }): AlertActionLink | null` (`alertActions.ts:129-136`) — signature unchanged.
- Produces: `resolveAlertActions(code, context, opts): AlertActionLink[]` — Task 6 (bell feed) imports it.

- [ ] **Step 1: Write the failing test (extend `tests/adminAlerts/alertActions.test.ts`)**

```ts
// append to tests/adminAlerts/alertActions.test.ts
import { resolveAlertActions } from "@/lib/adminAlerts/alertActions";

describe("resolveAlertActions (spec 2026-07-17 §3.4)", () => {
  it("ROLE_FLAGS_NOTICE with slug: show-page link leads, Open in Sheet second", () => {
    const actions = resolveAlertActions(
      "ROLE_FLAGS_NOTICE",
      { drive_file_id: "abc123" },
      { slug: "ria-forum" },
    );
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({
      label: "Review in show page",
      href: "/admin/show/ria-forum",
      external: false,
    });
    expect(actions[1]?.label).toBe("Open in Sheet");
    expect(actions[1]?.external).toBe(true);
  });

  it("ROLE_FLAGS_NOTICE without slug: sheet link only", () => {
    const actions = resolveAlertActions("ROLE_FLAGS_NOTICE", { drive_file_id: "abc123" }, { slug: null });
    expect(actions.map((a) => a.label)).toEqual(["Open in Sheet"]);
  });

  it("other codes delegate to the single resolver (0 or 1 element)", () => {
    expect(resolveAlertActions("SYNC_STALLED", null, { slug: null })).toEqual([]);
    const single = resolveAlertActions("PICKER_EPOCH_RESET", {}, { slug: "ria-forum" });
    expect(single).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adminAlerts/alertActions.test.ts`
Expected: FAIL — `resolveAlertActions` not exported.

- [ ] **Step 3: Implement (append to `lib/adminAlerts/alertActions.ts`)**

```ts
/**
 * Ordered action list for surfaces that can render more than one link (bell
 * panel — spec 2026-07-17 §3.4). resolveAlertAction keeps its single-link
 * signature untouched for its other callers (HealthAlertsPanel). For
 * ROLE_FLAGS_NOTICE the internal show-page review link LEADS and the sheet
 * deep link stays second; every other code delegates to the single resolver.
 */
export function resolveAlertActions(
  code: string,
  context: Record<string, unknown> | null,
  opts: { slug: string | null },
): AlertActionLink[] {
  const single = resolveAlertAction(code, context, opts);
  if (code === "ROLE_FLAGS_NOTICE") {
    const showPage: AlertActionLink | null = opts.slug
      ? { label: "Review in show page", href: `/admin/show/${opts.slug}`, external: false }
      : null;
    return [showPage, single].filter((a): a is AlertActionLink => a !== null);
  }
  return single ? [single] : [];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/adminAlerts/alertActions.test.ts tests/messages/_metaAlertActionsContract.test.ts`
Expected: PASS. If the meta-contract test enumerates exported functions and fails on the new export, add the registry row it demands (follow the error message's instruction — that test is fail-by-default by design).

- [ ] **Step 5: Commit**

```bash
git add lib/adminAlerts/alertActions.ts tests/adminAlerts/alertActions.test.ts tests/messages/_metaAlertActionsContract.test.ts
git commit --no-verify -m "feat(admin): resolveAlertActions ordered list with ROLE_FLAGS_NOTICE show-page link"
```

---

### Task 5: `INLINE_IDENTITY_CODES` + bidirectional meta-test

**Files:**
- Modify: `lib/adminAlerts/alertIdentityMap.ts` (append export)
- Test: `tests/adminAlerts/_metaInlineIdentityContract.test.ts` (create)

**Interfaces:**
- Produces: `INLINE_IDENTITY_CODES: ReadonlySet<string>` from `@/lib/adminAlerts/alertIdentityMap` — Tasks 7 and 8 consume it for chip suppression.

- [ ] **Step 1: Write the failing meta-test**

```ts
// tests/adminAlerts/_metaInlineIdentityContract.test.ts
/**
 * Structural contract (spec 2026-07-17 §5): a code suppresses its identity
 * chip iff its dougFacing template carries the identity inline. Bidirectional:
 * (a) every INLINE_IDENTITY_CODES member's dougFacing contains an
 * identity-bearing placeholder; (b) every segment-bearing code whose
 * dougFacing contains one is a member. Catches: adding a template without
 * suppressing the (now-duplicate) chip, and suppressing a chip while the
 * message no longer names the entity.
 */
import { describe, expect, it } from "vitest";
import { ALERT_IDENTITY_MAP, INLINE_IDENTITY_CODES } from "@/lib/adminAlerts/alertIdentityMap";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";

const IDENTITY_TOKENS = ["<sheet-name>", "<show-name>", "<repo>", "<file-name>", "<role-changes>"];

const hasIdentityToken = (s: string | null): boolean =>
  s !== null && IDENTITY_TOKENS.some((t) => s.includes(t));

describe("inline-identity contract", () => {
  it("every member's dougFacing carries an identity placeholder", () => {
    for (const code of INLINE_IDENTITY_CODES) {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as
        | MessageCatalogEntry
        | undefined;
      expect(entry, `${code} not in catalog`).toBeDefined();
      expect(hasIdentityToken(entry!.dougFacing), `${code} dougFacing has no identity token`).toBe(
        true,
      );
    }
  });

  it("every segment-bearing code with an identity token is a member", () => {
    const violations: string[] = [];
    for (const [code, decl] of Object.entries(ALERT_IDENTITY_MAP)) {
      if (!("segments" in decl)) continue;
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as
        | MessageCatalogEntry
        | undefined;
      if (entry && hasIdentityToken(entry.dougFacing) && !INLINE_IDENTITY_CODES.has(code)) {
        violations.push(code);
      }
    }
    expect(violations, violations.join(", ")).toEqual([]);
  });

  it("membership is exactly the 13 converted codes", () => {
    expect([...INLINE_IDENTITY_CODES].sort()).toEqual([
      "BRANCH_PROTECTION_DRIFT",
      "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
      "EMAIL_DELIVERY_FAILED",
      "PENDING_SNAPSHOT_PROMOTE_STUCK",
      "PENDING_SNAPSHOT_ROLLBACK_STUCK",
      "REPORT_DUPLICATE_LIVE_MATCHES",
      "REPORT_LEASE_THRASHING",
      "REPORT_LOOKUP_INCONCLUSIVE",
      "REPORT_OPEN_ORPHAN_LABEL",
      "REPORT_ORPHANED_LOST_LEASE",
      "ROLE_FLAGS_NOTICE",
      "STALE_ORPHAN_REPORT",
      "WIZARD_SESSION_SUPERSEDED_RACE",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adminAlerts/_metaInlineIdentityContract.test.ts`
Expected: FAIL — `INLINE_IDENTITY_CODES` not exported.

- [ ] **Step 3: Implement (append to `lib/adminAlerts/alertIdentityMap.ts`)**

```ts
/**
 * Codes whose dougFacing template names the entity inline (spec
 * docs/superpowers/specs/2026-07-17-condensed-alert-copy-design.md §5).
 * Render surfaces suppress the separate identity chip for these codes when
 * the message rendered (interpolation succeeded); on the guard path the chip
 * renders as before so identity is never lost. Pinned bidirectionally by
 * tests/adminAlerts/_metaInlineIdentityContract.test.ts.
 */
export const INLINE_IDENTITY_CODES: ReadonlySet<string> = new Set([
  "ROLE_FLAGS_NOTICE",
  "REPORT_ORPHANED_LOST_LEASE",
  "REPORT_LOOKUP_INCONCLUSIVE",
  "REPORT_DUPLICATE_LIVE_MATCHES",
  "REPORT_OPEN_ORPHAN_LABEL",
  "REPORT_LEASE_THRASHING",
  "STALE_ORPHAN_REPORT",
  "PENDING_SNAPSHOT_PROMOTE_STUCK",
  "PENDING_SNAPSHOT_ROLLBACK_STUCK",
  "EMAIL_DELIVERY_FAILED",
  "WIZARD_SESSION_SUPERSEDED_RACE",
  "BRANCH_PROTECTION_DRIFT",
  "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
]);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/adminAlerts/_metaInlineIdentityContract.test.ts tests/adminAlerts/alertIdentityMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/adminAlerts/alertIdentityMap.ts tests/adminAlerts/_metaInlineIdentityContract.test.ts
git commit --no-verify -m "feat(admin): INLINE_IDENTITY_CODES chip-suppression registry + bidirectional meta-test"
```

---

### Task 6: Bell feed — `messageParams` + `actions` array

**Files:**
- Modify: `lib/admin/bellFeed.ts` (BellEntry type line 27-47; entry construction ~118-126, 240-256)
- Test: `tests/admin/bellFeed.test.ts` (extend/adjust)

**Interfaces:**
- Consumes: `deriveAlertMessageParams` (Task 1), `resolveAlertActions` (Task 4).
- Produces: `BellEntry` gains `messageParams: MessageParams` and `actions: AlertActionLink[]`; the singular `action` field is REMOVED. Task 7 (BellPanel) consumes both.

- [ ] **Step 1: Write the failing test (extend `tests/admin/bellFeed.test.ts`)**

Locate the existing test that asserts an entry's `action` (grep `action` in the file) and follow its harness pattern (mock supabase + resolver fixtures). Add:

```ts
it("attaches messageParams (identity-derived) and an ordered actions list", async () => {
  // Use the file's existing feed harness with a ROLE_FLAGS_NOTICE row whose
  // context = { drive_file_id: "df1", changes: [{ crew_name: "Doug Larson",
  // prior_flags: ["A1"], new_flags: ["A1", "LEAD"] }] } and a resolvable show
  // (slug "ria-forum", title "II - RIA Investment Forum").
  const feed = await buildFeedUnderTest(); // existing harness helper name may differ — reuse it
  const entry = feed.entries.find((e) => e.code === "ROLE_FLAGS_NOTICE")!;
  expect(entry.messageParams["sheet-name"]).toBe("'II - RIA Investment Forum'");
  expect(entry.messageParams["role-changes"]).toBe(
    "Doug Larson's role changed from A1 to A1 + LEAD.",
  );
  expect(entry.messageParams["lead-hint"]).toBe(
    " Lead changes must be confirmed in the show page.",
  );
  expect(entry.actions.map((a) => a.label)).toEqual(["Review in show page", "Open in Sheet"]);
  expect(entry).not.toHaveProperty("action");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/admin/bellFeed.test.ts`
Expected: FAIL — `messageParams`/`actions` undefined.

- [ ] **Step 3: Implement in `lib/admin/bellFeed.ts`**

1. Imports: replace `resolveAlertAction` import with `resolveAlertActions`; add `import { deriveAlertMessageParams } from "@/lib/adminAlerts/deriveMessageParams";` and `import type { MessageParams } from "@/lib/messages/lookup";`.
2. `BellEntry` type: replace `action: { href: string; label: string; external: boolean } | null;` (line 45) with:

```ts
  /** Ordered action links (spec 2026-07-17 §3.4) — 0..n; first leads. */
  actions: { href: string; label: string; external: boolean }[];
  /** Merged copy params (raw context scalars + identity-derived — spec §4.1/§4.2). */
  messageParams: MessageParams;
```

3. Entry construction (~line 125): `action: resolveAlertAction(...)` → `actions: resolveAlertActions(r.code!, r.context, { slug: r.slug }),` and add a placeholder `messageParams: {},` if construction happens before identity resolution.
4. Where identities attach (~line 240-256, after `resolveAlertIdentities`): stamp `messageParams: deriveAlertMessageParams(e.code, contextByAlertId.get(e.alertId) ?? null, identities.get(e.alertId) ?? null)` onto each entry (follow the file's existing identity-attachment map pattern).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/admin/bellFeed.test.ts tests/admin/bellAudience.test.ts tests/admin/bellValidation.test.ts && pnpm typecheck`
Expected: PASS; typecheck surfaces every `entry.action` consumer still uncompiled — ONLY `BellPanel.tsx` may remain (fixed in Task 7); if typecheck fails on BellPanel, note it and proceed (Task 7 fixes), but no OTHER file may reference `.action`.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/bellFeed.ts tests/admin/bellFeed.test.ts
git commit --no-verify -m "feat(admin): bell feed carries messageParams + ordered actions list"
```

---

### Task 7: BellPanel render — params, guard, chip suppression, actions list, `whitespace-pre-line`

**Files:**
- Modify: `components/admin/BellPanel.tsx` (rowCopy ~104, contextParams ~117, IdentityChip ~195, ActionCell ~218-296, ActiveRow ~298-430)
- Test: `tests/components/bellPanelRedesign.test.tsx` (extend) + adjust `tests/components/bellPanel.test.tsx` / `bellPanelActions.test.tsx` fixtures (`action` → `actions`, add `messageParams`)

**Interfaces:**
- Consumes: `BellEntry.messageParams` / `BellEntry.actions` (Task 6), `INLINE_IDENTITY_CODES` (Task 5), `plainCatalogText` (`lib/messages/lookup.ts:51`).
- Produces: final bell rendering; testids unchanged (`bell-identity-*`, `bell-action-*` now indexed: `bell-action-{alertId}-{i}`).

- [ ] **Step 1: Write the failing tests (extend `tests/components/bellPanelRedesign.test.tsx`, reusing its render harness)**

```tsx
describe("condensed inline-context rows (spec 2026-07-17)", () => {
  const roleFlagsEntry = makeEntry({
    // reuse the file's existing entry factory; fields below are the ones that matter
    code: "ROLE_FLAGS_NOTICE",
    context: { changes: [{ crew_name: "Doug Larson", prior_flags: ["A1"], new_flags: ["A1", "LEAD"] }] },
    messageParams: {
      "sheet-name": "'II - RIA Investment Forum'",
      "role-changes": "Doug Larson's role changed from A1 to A1 + LEAD.",
      "lead-hint": " Lead changes must be confirmed in the show page.",
    },
    actions: [
      { label: "Review in show page", href: "/admin/show/ria-forum", external: false },
      { label: "Open in Sheet", href: "https://docs.google.com/x", external: true },
    ],
  });

  it("renders the interpolated one-line message and suppresses the identity chip", () => {
    renderPanelWith([roleFlagsEntry]);
    expect(
      screen.getByText(
        "In 'II - RIA Investment Forum', Doug Larson's role changed from A1 to A1 + LEAD. Lead changes must be confirmed in the show page.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(`bell-identity-${roleFlagsEntry.alertId}`)).toBeNull();
    expect(screen.queryByTestId(`bell-caret-${roleFlagsEntry.alertId}`)).toBeNull(); // helpfulContext now null
  });

  it("renders both action links in order", () => {
    renderPanelWith([roleFlagsEntry]);
    const first = screen.getByTestId(`bell-action-${roleFlagsEntry.alertId}-0`);
    const second = screen.getByTestId(`bell-action-${roleFlagsEntry.alertId}-1`);
    expect(first).toHaveTextContent("Review in show page");
    expect(first).toHaveAttribute("href", "/admin/show/ria-forum");
    expect(first).not.toHaveAttribute("target");
    expect(second).toHaveTextContent("Open in Sheet");
    expect(second).toHaveAttribute("target", "_blank");
  });

  it("guard path: unresolved placeholder drops the message line and KEEPS the chip", () => {
    const broken = makeEntry({
      code: "ROLE_FLAGS_NOTICE",
      messageParams: {}, // sheet-name/role-changes missing → template unresolved
      identity: { segments: [{ label: "Sheet", value: "II - RIA Investment Forum" }], global: false },
      actions: [],
    });
    renderPanelWith([broken]);
    expect(screen.queryByText(/In <sheet-name>/)).toBeNull();
    expect(screen.getByTestId(`bell-identity-${broken.alertId}`)).toBeInTheDocument();
  });

  it("multi-line message span carries whitespace-pre-line", () => {
    const multi = makeEntry({
      code: "ROLE_FLAGS_NOTICE",
      messageParams: {
        "sheet-name": "'X'",
        "role-changes": "2 role changes:\n• A: A1 → LEAD + A1\n• B: added with FINANCIALS",
        "lead-hint": "",
      },
      actions: [],
    });
    renderPanelWith([multi]);
    const span = screen.getByText(/2 role changes:/);
    expect(span.className).toContain("whitespace-pre-line");
  });

  it("non-member codes keep their chip exactly as before", () => {
    const watch = makeEntry({ code: "WATCH_CHANNEL_ORPHANED", messageParams: {}, actions: [] });
    renderPanelWith([watch]);
    expect(screen.getByTestId(`bell-identity-${watch.alertId}`)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/bellPanelRedesign.test.tsx`
Expected: FAIL (chip renders, single-action markup, no pre-line class).

- [ ] **Step 3: Implement in `components/admin/BellPanel.tsx`**

1. Imports: add `plainCatalogText` to the `@/lib/messages/lookup` import; add `import { INLINE_IDENTITY_CODES } from "@/lib/adminAlerts/alertIdentityMap";`.
2. Params source — replace `contextParams(entry.context)` in `ActiveRow` with `entry.messageParams` (keep `contextParams` fallback for absent field: `const params = Object.keys(entry.messageParams ?? {}).length > 0 ? entry.messageParams : contextParams(entry.context);`).
3. Guard + suppression in `ActiveRow` (after `const params = …`):

```tsx
  // Spec 2026-07-17 §4.3/§4.5: render the message only when the template fully
  // interpolates; a leftover <placeholder> (defense-in-depth — derived params
  // always resolve) drops the message line and keeps the identity chip.
  const UNRESOLVED = /<[a-zA-Z_][a-zA-Z0-9_-]*>/;
  const messageResolved =
    message !== null && !UNRESOLVED.test(plainCatalogText(message, params));
  const suppressChip = INLINE_IDENTITY_CODES.has(entry.code) && messageResolved;
```

Message block: `{message ? (…)}` → `{message && messageResolved ? (…)}`; message span className gains `whitespace-pre-line`. IdentityChip call: `<IdentityChip entry={entry} />` → `{suppressChip ? null : <IdentityChip entry={entry} />}`.
4. `ActionCell`: replace the single `entry.action ? (<a …>)` block with:

```tsx
      ) : entry.actions.length > 0 ? (
        entry.actions.map((action, i) => (
          <a
            key={action.href}
            href={action.href}
            data-testid={`bell-action-${entry.alertId}-${i}`}
            {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={LINK_CTA}
          >
            {action.label}
            {action.external ? <span aria-hidden="true"> ↗</span> : null}
          </a>
        ))
      ) : null}
```

5. Fix remaining `entry.action` references (grep the file — health/watch branches unaffected).

- [ ] **Step 4: Run tests + fixture sweep**

Run: `npx vitest run tests/components/bellPanelRedesign.test.tsx tests/components/bellPanel.test.tsx tests/components/bellPanelActions.test.tsx tests/components/bellPanelDeferrals.test.tsx && pnpm typecheck`
Expected: PASS after mechanically updating fixtures (`action: X` → `actions: X ? [X] : []`, add `messageParams: {}`); update `bell-action-${id}` testid lookups to `bell-action-${id}-0`. Behavioral assertions must not weaken.

- [ ] **Step 5: Commit**

```bash
git add components/admin/BellPanel.tsx tests/components/
git commit --no-verify -m "feat(admin): bell panel inline-context messages, chip suppression, ordered action links"
```

---

### Task 8: PerShowAlertSection — derived params + chip suppression

**Files:**
- Modify: `components/admin/PerShowAlertSection.tsx` (`safeDougFacingTemplate` ~106-117; identity attach ~223-225; render ~296, ~338-343, ~396-400)
- Test: `tests/components/PerShowAlertSection.test.tsx` (extend)

**Interfaces:**
- Consumes: `deriveAlertMessageParams` (Task 1), `INLINE_IDENTITY_CODES` (Task 5). Identity objects already resolved in `fetchPerShowAlerts` (`identities.get(r.id)` ~line 223).
- Produces: `AdminAlertRow` gains `messageParams: MessageParams` (computed server-side next to `identityText`); chip (`per-show-alert-identity`) suppressed for member codes when the template resolves.

- [ ] **Step 1: Write the failing test (extend `tests/components/PerShowAlertSection.test.tsx`, reusing its harness)**

```tsx
it("ROLE_FLAGS_NOTICE renders inline-context copy, no identity line (spec 2026-07-17 §4.2)", async () => {
  // Harness: ROLE_FLAGS_NOTICE row, context.changes = [{ crew_name: "Doug Larson",
  // prior_flags: ["A1"], new_flags: ["A1", "LEAD"] }], resolvable show title
  // "II - RIA Investment Forum" (reuse the file's supabase mock pattern).
  await renderSectionWithRoleFlagsRow();
  expect(
    screen.getByText(
      "In 'II - RIA Investment Forum', Doug Larson's role changed from A1 to A1 + LEAD. Lead changes must be confirmed in the show page.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByTestId("per-show-alert-identity")).toBeNull();
});

it("keeps the identity line when the template cannot resolve (guard path)", async () => {
  // Same row but with identity resolution degraded (mock the show read to fail →
  // fetchPerShowAlerts falls back to identityText null + derived fallbacks).
  // With fallbacks the template RESOLVES ("In this sheet, …") — so to hit the
  // guard, use a NON-member code whose copy has no placeholders and assert its
  // identity line still renders (regression pin for untouched codes).
  await renderSectionWithNonMemberAlert(); // e.g. PICKER_EPOCH_RESET
  expect(screen.getByTestId("per-show-alert-identity")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/PerShowAlertSection.test.tsx`
Expected: FAIL — old generic copy renders; identity line present for ROLE_FLAGS_NOTICE.

- [ ] **Step 3: Implement in `components/admin/PerShowAlertSection.tsx`**

1. Imports: `deriveAlertMessageParams`, `INLINE_IDENTITY_CODES`.
2. In `fetchPerShowAlerts`'s final map (~line 222-226), compute alongside `identityText`:

```ts
    const identity = identities.get(r.id);
    const identityText = identity ? describeAlert(identity, { includePii: true }) : null;
    const messageParams = deriveAlertMessageParams(r.code, r.context, identity ?? null);
    return { ...r, identityText, messageParams };
```

Add `messageParams: MessageParams;` to the `AdminAlertRow` type next to `identityText` (~line 61).
3. `safeDougFacingTemplate(code, context)` → `safeDougFacingTemplate(code, params: MessageParams | undefined)`: drop the internal cast, interpolate with the passed params. Update its call site (~296) to pass `alert.messageParams` and the render call (~338-343) to `renderCatalogEmphasis(copyTemplate, alert.messageParams)`.
4. Identity line render (~396-400): wrap with suppression —

```tsx
{alert.identityText && !(INLINE_IDENTITY_CODES.has(alert.code) && copyTemplate !== null) ? (
  <p data-testid="per-show-alert-identity" …>{alert.identityText}</p>
) : null}
```

(`copyTemplate !== null` IS the "message resolved" signal — `safeDougFacingTemplate` returns null on any unresolved placeholder.)
5. Message `<p>` gains `whitespace-pre-line` (multi-change ROLE_FLAGS rows).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/PerShowAlertSection.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/PerShowAlertSection.tsx tests/components/PerShowAlertSection.test.tsx
git commit --no-verify -m "feat(admin): per-show alert cards render inline-context copy, suppress duplicate identity line"
```

---

### Task 9: HealthAlertsPanel — identity-less derived params (leak prevention)

**Files:**
- Modify: `components/admin/telemetry/HealthAlertsPanel.tsx:73` (params line)
- Test: `tests/components/healthAlertsPanel.test.tsx` (extend)

**Interfaces:**
- Consumes: `deriveAlertMessageParams` (Task 1). `resolveAlertAction` call at line 78 UNTOUCHED.

- [ ] **Step 1: Write the failing test (extend `tests/components/healthAlertsPanel.test.tsx`)**

```tsx
import { SWEEP_EXPECTATIONS } from "@/tests/messages/inlineIdentityCopy.test"; // if cross-import is awkward, inline the 12-code list

it.each(Object.keys(SWEEP_EXPECTATIONS))(
  "%s renders with EMPTY context and no literal <placeholder> leaks (spec 2026-07-17 §4.2)",
  (code) => {
    renderPanelWithRow({ code, context: null }); // reuse the file's row factory
    const row = screen.getByTestId(/health-alert-row-/);
    expect(row.textContent).not.toMatch(/<[a-zA-Z_][a-zA-Z0-9_-]*>/);
    expect(row.textContent).toMatch(/this show|this sheet|GitHub|wizard/); // fallback phrasing rendered
  },
);
```

(If `SWEEP_EXPECTATIONS` import from a test file trips lint, copy the 12-code array literal into this file with a comment pointing at `tests/messages/inlineIdentityCopy.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/healthAlertsPanel.test.tsx`
Expected: FAIL — literal `<show-name>` in DOM for show-segment codes.

- [ ] **Step 3: Implement**

`components/admin/telemetry/HealthAlertsPanel.tsx:73`:

```tsx
  // Identity-less derived params (spec 2026-07-17 §4.2): this panel has no
  // identity resolution, so sheet/show params take their fallback phrases —
  // never a literal <placeholder> (invariant 5).
  const params = deriveAlertMessageParams(row.code, row.context, null);
```

(plus the import; delete the old `const params = (row.context as MessageParams | null) ?? undefined;`).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/healthAlertsPanel.test.tsx tests/admin/healthAlerts.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/telemetry/HealthAlertsPanel.tsx tests/components/healthAlertsPanel.test.tsx
git commit --no-verify -m "fix(admin): health panel derives fallback copy params — no placeholder leak"
```

---

### Task 10: Full-suite gates + impeccable dual-gate + close-out

**Files:** none new (fix fallout only).

- [ ] **Step 1: Full local gates**

```bash
VITEST_EXCLUDE_ENV_BOUND=1 npx vitest run
pnpm typecheck
git diff --name-only origin/main...HEAD | grep -E '\.tsx?$' | xargs pnpm exec eslint
pnpm format:check
```

Expected: all green. Structural source-scanning meta-tests (jsonb boundary, no-inline-email, mutation-surface observability) walk `lib/adminAlerts` — new files must pass them; fix per each test's error instruction, never by weakening the test.

- [ ] **Step 2: Impeccable v3 dual-gate (invariant 8 — UI surface touched: BellPanel, PerShowAlertSection, HealthAlertsPanel)**

Run `/impeccable critique` then `/impeccable audit` on the affected diff with the canonical setup gates (context.mjs load → register read). Fix P0/P1 or record explicit deferrals in `DEFERRED.md`. Record findings + dispositions for the handoff.

- [ ] **Step 3: Whole-diff cross-model review**

Attempt `codex exec` whole-diff review (REVIEWER ONLY brief, fresh-eyes, VERDICT marker). If codex remains dead (models-cache TTL bug — see spec Status note), document the fallback (extended self-review + CI) in the PR body and proceed; CI is the hard gate.

- [ ] **Step 4: Push, PR, CI, merge**

```bash
git push -u origin feat/condensed-alert-copy
gh pr create --title "Condensed inline-context admin alert copy" --body "<summary + spec link + review-fallback note>"
gh pr checks <PR#> --watch   # confirm mergeStateStatus CLEAN before merge
gh pr merge <PR#> --merge
```

Then fast-forward local `main` in the MAIN checkout and verify `git rev-list --left-right --count main...origin/main` → `0	0`; remove the worktree.

---

## Meta-test inventory (declared)

- CREATES `tests/adminAlerts/_metaInlineIdentityContract.test.ts` (Task 5).
- EXTENDS `tests/adminAlerts/alertActions.test.ts`, `tests/messages/_metaAlertActionsContract.test.ts` (Task 4), bell feed/panel tests (Tasks 6-7), per-show tests (Task 8), health panel tests (Task 9).
- Advisory-lock topology: N/A — no `pg_advisory*` surface touched. Supabase call-boundary registry: N/A — no new Supabase call sites (helper is pure; feed/section reuse existing reads). Mutation-surface observability: N/A — no new mutation surface.
