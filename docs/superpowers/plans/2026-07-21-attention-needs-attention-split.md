# Attention menu "needs a look vs monitoring" split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the show-modal attention menu's auto-clearing bucket into "needs a look" (12 codes, 11 with a one-click action link) and "monitoring" (3 self-healing), and make the header pill show both counts instead of hiding the second when action items exist.

**Architecture:** All changes are derived TypeScript + React (no DB). A new two-set code classification drives a `clearingKind` field on `AttentionItem`; `deriveAttentionItems` gains a `driveFileId` arg; `ALERT_ACTIONS` gains sheet/overview builders; the pill composes segments; the menu renders read-only rows with action links; a real-browser probe pins the menu-open→non-interactive focus behavior.

**Tech Stack:** Next.js 16, React, TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + RTL, Playwright (real-browser probe).

**Spec:** `docs/superpowers/specs/2026-07-21-attention-needs-attention-split.md` (APPROVED). Section refs below (§N) point to it.

## Global Constraints

- Universe = 15 doug-audience `resolution:"auto"` codes ONLY; the 12 health-audience auto-resolving codes are excluded upstream and OUT of scope (spec §1.1.1).
- No DB change, no migration, no Ignore mechanic, no new repair routes (spec §1.1.2–4).
- No em-dash in any user-visible string (project rule); use a period or `·` middot.
- Rows are read-only; only interactive descendant is an `<a>`; NO nested popover in the menu (spec §1.1.5).
- Action links are navigations, not resolutions (spec §1.1.6).
- TDD per task: failing test → run-fails → minimal impl → run-passes → commit. Conventional-commit messages `<type>(<scope>): <summary>`, `--no-verify`, end with the two trailer lines.
- Tap targets `min-h-tap-min`; canonical tokens (`text-xs`, `text-text-subtle`).
- The focus mechanism (menu open → pill non-interactive) is UNRATIFIED in prose — its mechanism is decided by the Task 6 probe (spec §6a); do not hand-design it.

---

## File structure

- `lib/adminAlerts/audience.ts` — MODIFY: add `SELF_HEALING_CODES`, `NEEDS_LOOK_CODES`, `NeedsLookCode`, `isSelfHealing`.
- `lib/admin/attentionItems.ts` — MODIFY: `deriveAttentionItems` gains `driveFileId` arg; `toAlertItem` sets `clearingKind` + threads `driveFileId` to actions; clearing sub-order.
- `lib/adminAlerts/alertActions.ts` — MODIFY: `AlertActionBuilder` opts gain `driveFileId`; `openSheet` first-non-empty; new `showAnchor`; register 10 codes.
- `lib/admin/needsLookHints.ts` — CREATE: typed-total `Record<NeedsLookCode, string>` fix-hint map.
- `components/admin/showpage/PublishedReviewModal.tsx` — MODIFY: composite pill; `needsLook`/`selfHeal` derivation; focus close-effect.
- `components/admin/showpage/AttentionMenu.tsx` — MODIFY: needs-a-look group + monitoring group + action links + menu-close onClick; retire footer.
- (No gallery change: after PR #538 the dev gallery no longer calls `deriveAttentionItems` — `buildBlockProps.ts` was deleted, replaced by `buildSwitcherScenarios.ts`. The modal is the sole caller.)
- Tests: `tests/adminAlerts/selfHealingClassification.test.ts` (CREATE), `tests/admin/attentionItems.test.ts` (EXTEND), `tests/adminAlerts/alertActions.test.ts` (EXTEND/CREATE), `tests/admin/needsLookHints.test.ts` (CREATE), `tests/components/admin/showpage/publishedPill.test.tsx` (CREATE), `tests/components/admin/showpage/attentionMenuGroups.test.tsx` (CREATE), `tests/e2e/attention-pill-focus.spec.ts` (CREATE, real-browser probe), `tests/admin/_metaAttentionItemsTopology.test.ts` (EXTEND).

## Meta-test inventory (spec §10)

- CREATE `tests/adminAlerts/selfHealingClassification.test.ts` (exhaustiveness, dual-set XOR).
- EXTEND `tests/admin/_metaAttentionItemsTopology.test.ts` (driveFileId arg keeps the SINGLE modal caller; gallery no longer calls deriveAttentionItems post-#538).
- EXTEND `tests/admin/attentionExclusionSet.test.ts` (confirm 15-code RENDERS set unaffected — assertion-only, no new file).

## Pre-draft reconciliation sweep (run at plan time)

Command run in worktree `origin/main`:
`grep -rn "clearingCount\|clearing on their own" components/admin/showpage/ lib/admin/` (against the post-#537 base) →
- `AttentionMenu.tsx:141-148` (footer, em-dash string) — retired in Task 5.
- `PublishedReviewModal.tsx:299-304` (`clearingCount` derivation), `PublishedReviewModal.tsx:709-730` (pill "clearing" state, now with #537's sr-only accessible-name tail) — replaced in Task 4.
Disposition: all three hits are handled by Tasks 4–5; no orphan references remain (Task 5 Step "grep confirms zero `clearingCount`").

**Post-#537 inheritance (spec §12):** PR #537 (unread-callout-dedup) added an sr-only accessible-name mechanism to the "N clearing" pill (`PublishedReviewModal.tsx:709-730` — visible terse text + a leading-` ` sr-only tail that survives the accessible-name space-trim), plus `tests/**/clearingPillLabel*` pinning it. Task 4 MUST carry this mechanism forward to the new `to review` and `monitoring` segments (each gets a visible short label + sr-only expansion where terse); Task 10 updates the inherited `clearingPillLabel` test to the new copy. Do not drop the a11y tail.

---

### Task 1: Classification sets + exhaustiveness meta-test

**Files:**
- Modify: `lib/adminAlerts/audience.ts`
- Test: `tests/adminAlerts/selfHealingClassification.test.ts` (create)

**Interfaces:**
- Produces: `SELF_HEALING_CODES: ReadonlySet<string>`; `NEEDS_LOOK_CODES: ReadonlySet<string>`; `type NeedsLookCode`; `isSelfHealing(code: string): boolean`.

- [ ] **Step 1: Write the failing test** — `tests/adminAlerts/selfHealingClassification.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { SELF_HEALING_CODES, NEEDS_LOOK_CODES, isSelfHealing } from "@/lib/adminAlerts/audience";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { DOUG_EXCLUDED_CODES } from "@/lib/adminAlerts/audience";

// The universe: doug-audience, resolution:"auto", NOT excluded upstream.
const autoResolvingDoug = Object.entries(MESSAGE_CATALOG)
  .filter(([code, m]) => (m as { resolution?: string }).resolution === "auto" && !DOUG_EXCLUDED_CODES.has(code))
  .map(([code]) => code);

describe("self-healing vs needs-look classification", () => {
  it("has a non-trivial universe (guards against a filter that silently empties it)", () => {
    expect(autoResolvingDoug.length).toBe(15);
  });

  it("classifies every universe code into EXACTLY ONE positive set", () => {
    for (const code of autoResolvingDoug) {
      const inSelf = SELF_HEALING_CODES.has(code);
      const inLook = NEEDS_LOOK_CODES.has(code);
      expect(inSelf || inLook, `${code} is in neither set`).toBe(true);
      expect(inSelf && inLook, `${code} is in both sets`).toBe(false);
    }
  });

  it("both sets contain ONLY universe codes (no extras)", () => {
    const universe = new Set(autoResolvingDoug);
    for (const code of [...SELF_HEALING_CODES, ...NEEDS_LOOK_CODES]) {
      expect(universe.has(code), `${code} classified but not in universe`).toBe(true);
    }
  });

  it("is NOT tautological: the exhaustiveness predicate FAILS on neither and on both", () => {
    // factor the check so we can run it against synthetic set memberships
    const classifiedOk = (inSelf: boolean, inLook: boolean) => (inSelf ? 1 : 0) + (inLook ? 1 : 0) === 1;
    expect(classifiedOk(false, false)).toBe(false); // in NEITHER → not ok (a new unclassified code)
    expect(classifiedOk(true, true)).toBe(false);   // in BOTH → not ok
    expect(classifiedOk(true, false)).toBe(true);
    // and a genuinely-absent synthetic code is in neither real set:
    const synthetic = "SYNTHETIC_NEW_AUTO_CODE";
    expect(classifiedOk(SELF_HEALING_CODES.has(synthetic), NEEDS_LOOK_CODES.has(synthetic))).toBe(false);
  });

  it("isSelfHealing matches the set", () => {
    expect(isSelfHealing("SYNC_STALLED")).toBe(true);
    expect(isSelfHealing("SHEET_UNAVAILABLE")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/adminAlerts/selfHealingClassification.test.ts` → FAIL (`SELF_HEALING_CODES` not exported).

- [ ] **Step 3: Write minimal implementation** — append to `lib/adminAlerts/audience.ts`

```ts
export const SELF_HEALING_CODE_LIST = [
  "DRIVE_FETCH_FAILED",
  "SYNC_STALLED",
  "WATCH_CHANNEL_ORPHANED",
] as const;

export const NEEDS_LOOK_CODE_LIST = [
  "SHEET_UNAVAILABLE",
  "OPENING_REEL_NOT_VIDEO",
  "OPENING_REEL_PERMISSION_DENIED",
  "REEL_DRIFTED",
  "EMBEDDED_ASSET_DRIFTED",
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  "PARSE_ERROR_LAST_GOOD",
  "RESYNC_QUALITY_REGRESSED",
  "RESYNC_SHRINK_HELD",
  "SHOW_UNPUBLISHED",
  "USE_RAW_DECISION_STALE",
  "ASSET_RECOVERY_BYTES_EXCEEDED",
] as const;

export type NeedsLookCode = (typeof NEEDS_LOOK_CODE_LIST)[number];

// Sets are typed ReadonlySet<string> so `.has(anyString)` typechecks under strict mode;
// the literal union for the typed-total hint map comes from NEEDS_LOOK_CODE_LIST, not the Set.
export const SELF_HEALING_CODES: ReadonlySet<string> = new Set(SELF_HEALING_CODE_LIST);
export const NEEDS_LOOK_CODES: ReadonlySet<string> = new Set(NEEDS_LOOK_CODE_LIST);

export function isSelfHealing(code: string): boolean {
  return SELF_HEALING_CODES.has(code);
}
```

Note: the `_LIST` tuples (`as const`) carry the literal union (`NeedsLookCode`) for the typed-total hint map (Task 3) and the totality test; the `ReadonlySet<string>` sets carry the runtime membership so `.has(code: string)` typechecks. Two shapes on purpose — do NOT collapse them (a `Set<literal>` rejects `.has(string)` under strict mode; a lone `ReadonlySet<string>` loses the literal union).

- [ ] **Step 4: Run test to verify it passes** — `pnpm vitest run tests/adminAlerts/selfHealingClassification.test.ts` → PASS (all 5).

- [ ] **Step 5: Typecheck** — `pnpm typecheck` → no errors (confirms `NeedsLookCode` resolves to a literal union under strict tsconfig).

- [ ] **Step 6: Commit**

```bash
git add lib/adminAlerts/audience.ts tests/adminAlerts/selfHealingClassification.test.ts
git commit --no-verify -m "$(printf 'feat(admin): classify auto-resolving codes into self-heal vs needs-look\n\nTwo positive sets + XOR exhaustiveness guard so a new auto-resolving doug\ncode fails CI until classified (non-tautological).\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01JeHy3EJkCEFSxMwjnDeFa8')"
```

---

### Task 2: `clearingKind` on AttentionItem + `driveFileId` thread + bucketing

**Files:**
- Modify: `lib/admin/attentionItems.ts` (`AttentionItemBase` ~63-71, `deriveAttentionItems` 303-341, `toAlertItem` 248-282)
- Test: `tests/admin/attentionItems.test.ts` (extend)

**Interfaces:**
- Consumes: `isSelfHealing` (Task 1).
- Produces: `AttentionItemBase.clearingKind?: "self_heal" | "needs_look"`; `deriveAttentionItems(args: { ...; driveFileId: string | null })`.

- [ ] **Step 1: Write the failing test** — add to `tests/admin/attentionItems.test.ts`

```ts
it("tags clearingKind: self_heal for SYNC_STALLED, needs_look for SHEET_UNAVAILABLE", () => {
  const items = deriveAttentionItems({
    alerts: [
      { id: "a1", code: "SYNC_STALLED", context: {} } as any,
      { id: "a2", code: "SHEET_UNAVAILABLE", context: {} } as any,
    ],
    feed: null,
    slug: "demo",
    driveFileId: "FILE123",
  });
  // narrow to the alert variant, and use a Map (no noUncheckedIndexedAccess violation)
  const byCode = new Map(
    items.filter((i): i is Extract<typeof i, { kind: "alert" }> => i.kind === "alert").map(i => [i.alert.code, i]),
  );
  expect(byCode.get("SYNC_STALLED")?.clearingKind).toBe("self_heal");
  expect(byCode.get("SHEET_UNAVAILABLE")?.clearingKind).toBe("needs_look");
});

it("does not set clearingKind on an actionable alert", () => {
  const items = deriveAttentionItems({
    alerts: [{ id: "a3", code: "AMBIGUOUS_EMAIL_BINDING", context: {} } as any],
    feed: null, slug: "demo", driveFileId: null,
  });
  const it0 = items.find(i => i.kind === "alert");
  expect(it0?.actionable).toBe(true);
  expect(it0 && "clearingKind" in it0 ? it0.clearingKind : undefined).toBeUndefined();
});

it("orders needs_look before self_heal within the clearing tail", () => {
  const items = deriveAttentionItems({
    alerts: [
      { id: "s1", code: "SYNC_STALLED", context: {} } as any,
      { id: "n1", code: "SHEET_UNAVAILABLE", context: {} } as any,
    ],
    feed: null, slug: "demo", driveFileId: "F",
  });
  const codes = items
    .filter((i): i is Extract<typeof i, { kind: "alert" }> => i.kind === "alert")
    .map(i => i.alert.code);
  expect(codes.indexOf("SHEET_UNAVAILABLE")).toBeLessThan(codes.indexOf("SYNC_STALLED"));
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/admin/attentionItems.test.ts -t clearingKind` → FAIL (arg `driveFileId` unknown / `clearingKind` undefined).

- [ ] **Step 3: Write minimal implementation** — `lib/admin/attentionItems.ts`

(a) Extend the `AlertActionBuilder` opts + `resolveAlertAction` signature in `lib/adminAlerts/alertActions.ts` from `{ slug: string | null }` to `{ slug: string | null; driveFileId: string | null }` NOW (Task 3 fills the builders that use `driveFileId`; existing builders ignore it and still compile). This makes the Task 2 call site below typecheck without depending on Task 3.

(b) Add to `AttentionItemBase`:
```ts
  clearingKind?: "self_heal" | "needs_look";
```
(c) Extend the args type and signature:
```ts
export function deriveAttentionItems(args: {
  alerts: AttentionAlertInput[];
  feed: { entries: FeedEntry[] } | null;
  slug: string;
  driveFileId: string | null;
  excludedCodes?: readonly string[];
}): AttentionItem[] {
```
(d) Thread `driveFileId` into `toAlertItem(row, args.slug, args.driveFileId)`; inside `toAlertItem`, after computing `actionable`, build the field with a CONDITIONAL SPREAD (never assign `clearingKind: undefined` — that violates `exactOptionalPropertyTypes`):
```ts
const clearingKindPatch = actionable
  ? {}
  : { clearingKind: (isSelfHealing(row.code) ? "self_heal" : "needs_look") as "self_heal" | "needs_look" };
// ...spread into the returned object: return { ...base, ...clearingKindPatch, kind: "alert", alert: {...} };
```
Pass `driveFileId` into `resolveAlertAction(row.code, row.context, { slug: args.slug, driveFileId: args.driveFileId })`. (e) Replace the final clearing concat with sub-ordering (filter on the base field, then narrow only where needed):
```ts
const clearing = alertItems.filter((i) => !i.actionable);
const needsLook = clearing.filter((i) => i.clearingKind === "needs_look");
const selfHeal = clearing.filter((i) => i.clearingKind === "self_heal");
return [...holdItems, ...actionableAlerts, ...needsLook, ...selfHeal];
```
Import `isSelfHealing` from `@/lib/adminAlerts/audience`. NOTE for Tasks 4/5: `clearingKind` lives on `AttentionItemBase`, so filtering on it does NOT narrow the `AttentionItem` union to its `alert` variant; any code needing `item.alert` must FIRST narrow with `if (item.kind === "alert")` (or a `isAlertItem` guard).

- [ ] **Step 4: Run test to verify it passes** — `pnpm vitest run tests/admin/attentionItems.test.ts` → PASS (existing + 3 new). Fix any existing call sites in this test file that now need `driveFileId` (add `driveFileId: null`).

- [ ] **Step 5: Typecheck** — `pnpm typecheck` → will FAIL at the SOLE `deriveAttentionItems` call site (`app/admin/_showReviewModal.tsx:306`) missing `driveFileId`. (Post-#538 the gallery no longer calls it — no second site.) Fix:
  - `app/admin/_showReviewModal.tsx:306` — add `driveFileId` (already destructured at `_showReviewModal.tsx:257`): `{ alerts: ..., feed: ..., slug, driveFileId }`.
  Re-run `pnpm typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/attentionItems.ts app/admin/_showReviewModal.tsx tests/admin/attentionItems.test.ts
git commit --no-verify -m "$(printf 'feat(admin): clearingKind bucketing + driveFileId thread into deriveAttentionItems\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01JeHy3EJkCEFSxMwjnDeFa8')"
```

---

### Task 3: Action builders (openSheet first-non-empty, showAnchor, register 10) + fix-hint map

**Files:**
- Modify: `lib/adminAlerts/alertActions.ts`
- Create: `lib/admin/needsLookHints.ts`
- Test: `tests/adminAlerts/alertActions.test.ts` (extend/create), `tests/admin/needsLookHints.test.ts` (create)

**Interfaces:**
- Consumes: `NeedsLookCode`, `NEEDS_LOOK_CODES` (Task 1); `buildSheetDeepLink` (`lib/sheet-links/buildSheetDeepLink.ts`).
- Produces: extended `AlertActionBuilder` opts `{ slug, driveFileId }`; `NEEDS_LOOK_HINTS: Record<NeedsLookCode, string>`.

- [ ] **Step 1: Write the failing tests** — `tests/adminAlerts/alertActions.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { resolveAlertAction } from "@/lib/adminAlerts/alertActions";

const SHEET = "https://docs.google.com/spreadsheets/d/FILE/edit#gid=0";

describe("needs-a-look action resolution", () => {
  it.each([
    "SHEET_UNAVAILABLE", "OPENING_REEL_NOT_VIDEO", "OPENING_REEL_PERMISSION_DENIED",
    "REEL_DRIFTED", "EMBEDDED_ASSET_DRIFTED", "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  ])("%s builds an Open in Sheet link from show-level driveFileId with EMPTY context", (code) => {
    const a = resolveAlertAction(code, {}, { slug: "demo", driveFileId: "FILE" });
    expect(a).toEqual({ label: "Open in Sheet", href: SHEET, external: true });
  });

  it.each(["PARSE_ERROR_LAST_GOOD", "RESYNC_QUALITY_REGRESSED", "SHOW_UNPUBLISHED", "USE_RAW_DECISION_STALE"])(
    "%s builds a single-# Overview link", (code) => {
    const a = resolveAlertAction(code, {}, { slug: "demo", driveFileId: "FILE" });
    expect(a).toEqual({ label: "Go to Overview", href: "/admin?show=demo#overview", external: false });
    expect(a?.href.match(/#/g)?.length).toBe(1); // no ##overview
  });

  it("RESYNC_SHRINK_HELD keeps its exact existing registration", () => {
    // pre-registered in alertActions.ts (citation pack :109-117): label "Review & re-sync", internal #overview
    const a = resolveAlertAction("RESYNC_SHRINK_HELD", {}, { slug: "demo", driveFileId: "FILE" });
    expect(a).toEqual({ label: "Review & re-sync", href: "/admin?show=demo#overview", external: false });
    // (re-grep the exact committed label at execution; assert whatever the current registration is, exactly)
  });

  it("ASSET_RECOVERY_BYTES_EXCEEDED resolves to no action", () => {
    expect(resolveAlertAction("ASSET_RECOVERY_BYTES_EXCEEDED", {}, { slug: "demo", driveFileId: "FILE" })).toBeNull();
  });

  it("empty-string driveFileId falls back to context.drive_file_id (not '' via ??)", () => {
    const a = resolveAlertAction("SHEET_UNAVAILABLE", { drive_file_id: "CTX" }, { slug: "demo", driveFileId: "" });
    expect(a?.href).toBe("https://docs.google.com/spreadsheets/d/CTX/edit#gid=0");
  });

  it("both ids absent → null (read-only)", () => {
    expect(resolveAlertAction("SHEET_UNAVAILABLE", {}, { slug: "demo", driveFileId: null })).toBeNull();
  });

  it("null slug → showAnchor null", () => {
    expect(resolveAlertAction("SHOW_UNPUBLISHED", {}, { slug: null, driveFileId: "FILE" })).toBeNull();
  });
});
```

And `tests/admin/needsLookHints.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { NEEDS_LOOK_HINTS } from "@/lib/admin/needsLookHints";
import { NEEDS_LOOK_CODES } from "@/lib/adminAlerts/audience";

import { NEEDS_LOOK_CODE_LIST } from "@/lib/adminAlerts/audience";

describe("needs-look fix hints", () => {
  it("every needs-look code has a non-empty trimmed hint (typed-total; iterate the literal list)", () => {
    for (const code of NEEDS_LOOK_CODE_LIST) {
      const hint = NEEDS_LOOK_HINTS[code]; // typed NeedsLookCode index, no cast/guard
      expect(hint.trim().length, `${code} blank hint`).toBeGreaterThan(0);
    }
  });
  it("ASSET_RECOVERY_BYTES_EXCEEDED hint states the literal limits", () => {
    const h = NEEDS_LOOK_HINTS.ASSET_RECOVERY_BYTES_EXCEEDED;
    for (const lit of ["60", "50MB", "3GB"]) expect(h).toContain(lit);
  });
  it("no em-dash in any hint", () => {
    for (const hint of Object.values(NEEDS_LOOK_HINTS)) expect(hint).not.toContain(String.fromCharCode(0x2014));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail** — `pnpm vitest run tests/adminAlerts/alertActions.test.ts tests/admin/needsLookHints.test.ts` → FAIL.

- [ ] **Step 3: Write minimal implementation**

`lib/adminAlerts/alertActions.ts` (opts type already extended to `{ slug, driveFileId }` in Task 2(a); here add the builders that USE `driveFileId`):
- Add helper + rewrite `openSheet`:
```ts
const firstNonEmpty = (...xs: (string | null | undefined)[]) =>
  xs.map((x) => x?.trim()).find((x): x is string => !!x) ?? null;

const openSheet: AlertActionBuilder = (context, opts) => {
  const id = firstNonEmpty(opts.driveFileId, str(context, "drive_file_id"));
  const href = buildSheetDeepLink(id);
  return href ? { label: "Open in Sheet", href, external: true } : null;
};

function showAnchor(hash: string, label: string): AlertActionBuilder {
  return (_context, opts) => {
    const slug = typeof opts.slug === "string" ? opts.slug.trim() : "";
    if (!slug) return null;
    return { label, href: `/admin?show=${encodeURIComponent(slug)}#${hash}`, external: false };
  };
}
```
- Add the 10 codes to `ALERT_ACTION_CODES` and `ALERT_ACTIONS`: the 6 sheet codes → `openSheet`; `PARSE_ERROR_LAST_GOOD`, `RESYNC_QUALITY_REGRESSED`, `SHOW_UNPUBLISHED`, `USE_RAW_DECISION_STALE` → `showAnchor("overview", "Go to Overview")`. (`RESYNC_SHRINK_HELD` already registered — leave it.)
- Update `resolveAlertAction` signature opts to `{ slug, driveFileId }`.

`lib/admin/needsLookHints.ts` (create):
```ts
import type { NeedsLookCode } from "@/lib/adminAlerts/audience";

export const NEEDS_LOOK_HINTS: Record<NeedsLookCode, string> = {
  SHEET_UNAVAILABLE: "Re-share the sheet with the service account.",
  OPENING_REEL_NOT_VIDEO: "Replace the reel link with a video URL.",
  OPENING_REEL_PERMISSION_DENIED: "Re-share the video, or replace the link.",
  REEL_DRIFTED: "Re-save the sheet to re-stage it.",
  EMBEDDED_ASSET_DRIFTED: "Re-save the sheet to re-stage it.",
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: "Re-save the sheet to recover the diagram.",
  PARSE_ERROR_LAST_GOOD: "Fix the sheet, crew keep the last good version.",
  RESYNC_QUALITY_REGRESSED: "Fix the sheet to restore data quality.",
  RESYNC_SHRINK_HELD: "Review, then re-sync or fix the sheet.",
  SHOW_UNPUBLISHED: "Turn Published back on when ready.",
  USE_RAW_DECISION_STALE: "Re-choose raw text if you still want it.",
  ASSET_RECOVERY_BYTES_EXCEEDED: "Trim the gallery under 60 images / 50MB / 3GB.",
};
```

- [ ] **Step 4: Run tests to verify they pass** — `pnpm vitest run tests/adminAlerts/alertActions.test.ts tests/admin/needsLookHints.test.ts` → PASS. If any existing `resolveAlertAction` caller/test broke on the opts shape, add `driveFileId`.

- [ ] **Step 5: Typecheck** — `pnpm typecheck` → clean (the `Record<NeedsLookCode, string>` is exhaustive; a missing key would error here).

- [ ] **Step 6: Commit**

```bash
git add lib/adminAlerts/alertActions.ts lib/admin/needsLookHints.ts tests/adminAlerts/alertActions.test.ts tests/admin/needsLookHints.test.ts
git commit --no-verify -m "$(printf 'feat(admin): action links for needs-a-look codes + typed fix-hint map\n\nopenSheet selects first non-empty id (not ??), new showAnchor, register 10\ncodes; NEEDS_LOOK_HINTS is a typed-total record.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01JeHy3EJkCEFSxMwjnDeFa8')"
```

---

### Task 4: Composite header pill

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (derivation ~299-304, pill ~665-745 on the post-#537 base; re-grep exact lines at execution)
- Test: `tests/components/admin/showpage/publishedPill.test.tsx` (create — RTL); update the inherited `clearingPillLabel` test (from #537) to the new segments — see the post-#537 inheritance note above (preserve the sr-only accessible-name tail).

**Interfaces:**
- Consumes: `AttentionItem.clearingKind` (Task 2).
- Produces: `needsLook`, `selfHeal` derivations; composite pill segments.

- [ ] **Step 1: Write the failing test** — the FULL 9-row presence matrix from spec §11.5 (all rows, not a subset), RTL. First create the fixtures `tests/components/admin/showpage/__fixtures__/attentionFixtures.tsx`:

```tsx
import type { AttentionItem } from "@/lib/admin/attentionItems";
// build N alert items of a given clearing kind / actionable; ids unique; derive nothing from pill output.
export function makeItems(nA: number, nNeed: number, nSelf: number): AttentionItem[] {
  const mk = (i: number, actionable: boolean, kind?: "needs_look" | "self_heal"): AttentionItem => ({
    id: `${actionable ? "a" : kind}-${i}`, tone: "notice", sectionId: "overview", crewKey: null,
    actionable, menuTitle: "t", menuSubtitle: null, ...(kind ? { clearingKind: kind } : {}),
    kind: "alert", alert: { alertId: `x${i}`, code: "SHEET_UNAVAILABLE", action: null } as any,
  });
  return [
    ...Array.from({ length: nA }, (_, i) => mk(i, true)),
    ...Array.from({ length: nNeed }, (_, i) => mk(i, false, "needs_look")),
    ...Array.from({ length: nSelf }, (_, i) => mk(i, false, "self_heal")),
  ];
}
export function baseProps(over: Partial<React.ComponentProps<typeof import("@/components/admin/showpage/PublishedReviewModal").PublishedReviewModal>>) {
  return { /* minimal required PublishedReviewModal props */ slug: "demo", driveFileId: "FILE", attentionItems: [], alertsDegraded: false, ...over } as any;
}
```

Then the matrix (assert BOTH visible text AND accessible name via `getByRole`, so dropping the inherited sr-only tail fails):

```tsx
import { render, screen } from "@testing-library/react";
import { PublishedReviewModal } from "@/components/admin/showpage/PublishedReviewModal";
import { makeItems, baseProps } from "./__fixtures__/attentionFixtures";

function pill(nA: number, nNeed: number, nSelf: number, degraded = false) {
  render(<PublishedReviewModal {...baseProps({ attentionItems: makeItems(nA, nNeed, nSelf), alertsDegraded: degraded })} />);
  return screen.getByTestId("published-alert-pill");
}
// full spec §11.5 matrix, all 9 rows:
it("(3,4,2)", () => { const p = pill(3,4,2); expect(p.textContent).toMatch(/3 to confirm.*4 to review.*2 monitoring/s); });
it("(3,0,0)", () => { expect(pill(3,0,0).textContent).toMatch(/3 to confirm/); });
it("(3,4,0)", () => { expect(pill(3,4,0).textContent).toMatch(/3 to confirm.*4 to review/s); });
it("(3,0,2) monitoring not vanishing", () => { expect(pill(3,0,2).textContent).toMatch(/3 to confirm.*2 monitoring/s); });
it("(0,4,0) no leading middot", () => { const t = (pill(0,4,0).textContent ?? "").trim(); expect(t.startsWith("·")).toBe(false); expect(t).toMatch(/4 to review/); });
it("(0,4,2)", () => { const t = (pill(0,4,2).textContent ?? "").trim(); expect(t.startsWith("·")).toBe(false); expect(t).toMatch(/4 to review.*2 monitoring/s); });
it("(0,0,1) monitoring-only NON-interactive", () => { render(<PublishedReviewModal {...baseProps({ attentionItems: makeItems(0,0,1) })} />); expect(screen.queryByRole("button", { name: /monitoring/i })).toBeNull(); });
it("(0,0,0) In sync", () => { expect(pill(0,0,0).textContent).toMatch(/In sync/); });
it("degraded → Alerts unavailable", () => { expect(pill(0,0,0,true).textContent).toMatch(/Alerts unavailable/); });
// accessible name carries the sr-only expansion (inherited from #537) for terse segments:
it("accessible name spells out review + monitoring", () => {
  const p = pill(0,4,2);
  expect(p).toHaveAccessibleName(/to review/i);
  expect(p).toHaveAccessibleName(/monitoring/i);
});
```

Counts are derived from the fixture inputs, never hardcoded from pill output.

- [ ] **Step 1b: Reconcile the inherited `clearingPillLabel` test (from #537, now on the base).** Grep for it (`git grep -l clearingPillLabel`) and UPDATE it in THIS task to match the new segments (`to confirm · to review · monitoring`) — do not leave it red across commits. Carry #537's sr-only accessible-name mechanism into each terse segment (a visible short label + an sr-only expansion where the visible text is terse), preserving its leading-space trick (`feedback: sr-only leading space trimmed in accessible-name`).

- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/components/admin/showpage/publishedPill.test.tsx` → FAIL.

- [ ] **Step 3: Write minimal implementation** — in `PublishedReviewModal.tsx`:
  - Replace `clearingCount` derivation (304-309) with:
```ts
const needsLook = useMemo(() => live.filter(i => !i.actionable && i.clearingKind === "needs_look"), [live]);
const selfHeal = useMemo(() => live.filter(i => !i.actionable && i.clearingKind === "self_heal"), [live]);
const needsLookCount = needsLook.length;
const selfHealCount = selfHeal.length;
const interactive = actionable.length > 0 || needsLookCount > 0;
```
  - Rebuild the pill (656-738) as a segment composition: render an interactive `<button>` when `interactive`, containing segments `{actionable.length} to confirm`, `{needsLookCount} to review`, joined by a `·` ONLY between present segments (helper `joinSegments(parts: string[])`), plus a non-interactive `{selfHealCount} monitoring` suffix segment when `selfHealCount>0`. Non-interactive states: `interactive===false && selfHealCount>0` → monitoring-only `<span>`; `alertsDegraded && all zero` → "Alerts unavailable"; else "In sync". Keep existing dot/token classes. `data-testid` stays `${TESTID_BASE}-alert-pill`.
  - Leave the Task 6 focus effect as a follow-up (this task ships the render; the menu-open→non-interactive effect lands in Task 6 with its probe).

- [ ] **Step 4: Run test to verify it passes** — `pnpm vitest run tests/components/admin/showpage/publishedPill.test.tsx` → PASS.

- [ ] **Step 5: Pre-code UI mechanical check + typecheck** — grep the changed pill block for em-dashes and non-canonical tokens; `pnpm typecheck`; `pnpm lint` (canonical Tailwind). Fix inline.

- [ ] **Step 6: Commit** — `feat(admin): composite attention pill (to confirm · to review · monitoring)`.

---

### Task 5: Attention menu groups + action links

**Files:**
- Modify: `components/admin/showpage/AttentionMenu.tsx`
- Test: `tests/components/admin/showpage/attentionMenuGroups.test.tsx` (create — RTL)

**Interfaces:**
- Consumes: `AttentionItem.clearingKind`, `.alert.action` (Tasks 2-3), `NEEDS_LOOK_HINTS` (Task 3), `onClose` prop.

- [ ] **Step 1: Write the failing test** — assert: a `needs_look` row is read-only (no row-level button, `<a>` is the only interactive descendant); external sheet `<a>` has `target="_blank"` AND `rel="noopener noreferrer"` (exact); internal `<a>` has neither; the monitoring group is a single summary row not enumerated; a null-action needs-look item renders its hint with NO `<a>`; clicking an `<a>` calls `onClose`. (Clone-and-strip actionable rows before scanning, per anti-tautology.)

```tsx
// tests/components/admin/showpage/attentionMenuGroups.test.tsx : key assertions
it("external sheet link carries full rel and target", () => {
  render(<AttentionMenu {...menuProps([needsLookItem("SHEET_UNAVAILABLE", { href: SHEET, external: true })])} />);
  const a = screen.getByRole("link", { name: /Open in Sheet/ });
  expect(a).toHaveAttribute("target", "_blank");
  expect(a).toHaveAttribute("rel", "noopener noreferrer");
});
it("clicking an action link closes the menu", async () => {
  const onClose = vi.fn();
  render(<AttentionMenu {...menuProps([needsLookItem("SHOW_UNPUBLISHED", { href: "/admin?show=x#overview", external: false })], { onClose })} />);
  await userEvent.click(screen.getByRole("link", { name: /Go to Overview/ }));
  expect(onClose).toHaveBeenCalled();
});
it("null-action needs-look row shows hint, no link", () => {
  render(<AttentionMenu {...menuProps([needsLookItem("ASSET_RECOVERY_BYTES_EXCEEDED", null)])} />);
  expect(screen.getByText(/Trim the gallery/)).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
});
it("monitoring group is one summary row; individual titles NOT rendered", () => {
  render(<AttentionMenu {...menuProps([selfHealItem("SYNC_STALLED", "Syncing stalled"), selfHealItem("DRIVE_FETCH_FAILED", "Drive fetch failed")])} />);
  expect(screen.getByText(/2 clearing on their own, no action needed/)).toBeInTheDocument();
  expect(screen.queryByText("Syncing stalled")).toBeNull();  // not enumerated
  expect(screen.queryByText("Drive fetch failed")).toBeNull();
});
it("a needs-look ROW has no interactive descendant besides its anchor", () => {
  render(<AttentionMenu {...menuProps([needsLookItem("SHEET_UNAVAILABLE", { href: SHEET, external: true })])} />);
  const row = screen.getByTestId(/attention-needslook-row/);
  // clone-and-strip: within the row, the only role=link/button is the single anchor
  expect(within(row).getAllByRole("link")).toHaveLength(1);
  expect(within(row).queryAllByRole("button")).toHaveLength(0);
});
it("internal anchor carries neither target nor rel", () => {
  render(<AttentionMenu {...menuProps([needsLookItem("SHOW_UNPUBLISHED", { href: "/admin?show=x#overview", external: false })])} />);
  const a = screen.getByRole("link", { name: /Go to Overview/ });
  expect(a).not.toHaveAttribute("target");
  expect(a).not.toHaveAttribute("rel");
});
it("boundary: a needs-look item whose action FAILED to resolve renders hint, no link (through the menu)", () => {
  // SHEET_UNAVAILABLE with a null action (both ids absent), not the intentionally-actionless asset code
  render(<AttentionMenu {...menuProps([needsLookItem("SHEET_UNAVAILABLE", null)])} />);
  expect(screen.getByText(/Re-share the sheet/)).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
});
```

Anti-tautology: when scanning for a monitoring title, the fixtures give self-heal items distinct visible titles so "not rendered" is a real assertion, not vacuous. `within(row)` scopes the interactive-descendant check to the row, not the whole menu.

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Write minimal implementation** — in `AttentionMenu.tsx`: after the actionable rows, render (a) a "Needs a look" subheading + one read-only row (`data-testid="attention-needslook-row-{id}"`) per `needs_look` item. STRICT-TS notes: the item must first be narrowed with `if (item.kind !== "alert") continue;` (or filtered by a type guard) before reading `item.alert.action` (`clearingKind` is on the base type and does not narrow — see Task 2 note). The hint lookup must guard the key: `NEEDS_LOOK_CODES.has(code) ? NEEDS_LOOK_HINTS[code as NeedsLookCode] : ""` (indexing `NEEDS_LOOK_HINTS` with a raw alert-code `string` is a strict-mode error without the `NeedsLookCode` narrowing). Render: dot, `menuTitle`, the hint line, and — if `item.alert.action` is non-null — an `<a>` (label from action; external → `target="_blank" rel="noopener noreferrer"` + "↗"; internal → no target/rel) with `onClick={() => onClose()}`. (b) a "Monitoring" subheading + one summary row "{selfHealCount} clearing on their own, no action needed" (no per-item titles). Retire the old footer (141-148). Reuse the anchor pattern from `AttentionBanner.tsx:160-174`.

- [ ] **Step 4: Run test to verify it passes** — PASS.

- [ ] **Step 5: Reconcile + mechanical check** — `grep -n "clearingCount\|clearing on their own" components/admin/showpage/AttentionMenu.tsx` → only the new monitoring string remains (old footer gone). Em-dash/token/tap-target check; `pnpm typecheck`; `pnpm lint`.

- [ ] **Step 6: Commit** — `feat(admin): needs-a-look + monitoring groups with action links in attention menu`.

---

### Task 6: Menu-open → non-interactive focus probe + mechanism (spec §6a)

**Files:**
- Create: `tests/e2e/attention-pill-focus.spec.ts` (real-browser)
- Modify: `PublishedReviewModal.tsx` (add the close-effect)

**Interfaces:** Consumes `interactive` (Task 4), the rendered menu (Task 5). Ordering: AFTER Tasks 4 and 5 (the probe needs a real composite pill + rendered menu to drive). The probe is written FIRST (red), then the close-effect is implemented and the MECHANISM is chosen by observation — the probe is the authority (spec §6a), not this prose.

**Probe harness driver (concrete — required, not pseudocode).** The published modal renders from `attentionItems` supplied by its parent. Build `tests/e2e/__fixtures__/pillFocusHarness.tsx`: a client page that mounts `PublishedReviewModal` with a `window.__setItems(actionable, needsLook, selfHeal, degraded)` hook (wired to React state) so the test drives live transitions from the browser. Register it as a dev-only e2e route (mirror the existing published-modal e2e harness boot; do NOT use the real data path). The mechanism under test is toggled by an env/query flag the harness reads: `focusMode = useEffect | useLayoutEffect`, `restore = active | suppressed` (4 combinations) — so the probe MEASURES all four, per spec §6a.

- [ ] **Step 1: Write the failing probe test** — `tests/e2e/attention-pill-focus.spec.ts`, real-browser (Playwright), GENERATED 3×3 = 9-cell product. Do NOT hand-list cells. Each cell OPENS the menu, MOVES FOCUS INTO the menu (Tab/click a menu row), then drives to the non-interactive exit and asserts the outcome:

```ts
const ENTRY: Array<[number, number]> = [[1,0],[0,1],[1,1]];
const EXIT = [{ selfHeal: 1, label: "B" }, { degraded: true, label: "C" }, { selfHeal: 0, label: "D" }];
const cells = ENTRY.flatMap(([a, n]) => EXIT.map((x) => ({ a, n, x })));
test("exactly 9 transition cells", () => { expect(cells.length).toBe(9); });
for (const { a, n, x } of cells) {
  test(`open [${a},${n}] -> ${x.label}: menu closed, focus on dialog root`, async ({ page }) => {
    await page.goto("/e2e/pill-focus"); // harness route
    await page.waitForFunction(() => (window as any).__hydrated === true); // hydration gate, not networkidle
    await page.evaluate(([a, n]) => (window as any).__setItems(a, n, 1, false), [a, n]);
    await page.getByTestId("published-alert-pill").click();      // open menu
    await page.getByRole("menu").getByRole("link").first().focus(); // focus INTO the menu (or first focusable)
    // drive to non-interactive exit:
    await page.evaluate(([x]) => (window as any).__setItems(0, 0, x.selfHeal ?? 0, !!x.degraded), [x]);
    const state = await page.evaluate(() => ({
      open: (window as any).__menuOpen,
      activeIsDialog: document.activeElement?.getAttribute("role") === "dialog"
        || document.activeElement?.closest('[role="dialog"]') != null,
      activeIsBody: document.activeElement === document.body,
      staleExpanded: !!document.querySelector('[aria-expanded="true"]'),
    }));
    expect(state.open).toBe(false);
    expect(state.activeIsBody).toBe(false);
    expect(state.activeIsDialog).toBe(true);
    expect(state.staleExpanded).toBe(false);
  });
}
```

Harness-readiness (spec §11.9): the harness route boots the dev server (or prod build) on the configured port; the test awaits the `__hydrated` gate (never `networkidle` alone); the driver mutates React state via `__setItems` (no `locator.evaluate` on a node that unmounts mid-transition — detach-safe).

- [ ] **Step 2: Run to verify it fails** — `pnpm test:e2e attention-pill-focus` → FAIL (menu orphaned / focus on body under the default mechanism).

- [ ] **Step 3: Measure the mechanism matrix, then implement the winner** — run the probe under all four `focusMode × restore` combinations (via the harness flag). Record which combination passes all 9 cells (the observed matrix — spec §6a). Implement THAT combination in `PublishedReviewModal.tsx`: an effect keyed on the composite `interactive` predicate (NEVER `actionable` alone) that, when `interactive` goes false while `menuOpen`, calls `setMenuOpen(false)` and moves focus to the dialog-root ref, using the winning `useEffect`/`useLayoutEffect` + restore-active/suppressed choice. If NO combination passes cleanly, apply the §6a ratified fallback (dialog-root focus via the modal's existing trap, documented single-frame flash). Record the observed matrix + choice in the handoff.

- [ ] **Step 4: Run to verify it passes** — all 9 cells + the count assertion PASS under the chosen mechanism.

- [ ] **Step 5: Add the §11.9 navigation e2e** — in the same harness/spec, a test: open the pill menu, assert a needs-a-look sheet row's `<a>` has the exact `href` (`https://docs.google.com/spreadsheets/d/FILE/edit#gid=0`) and `target="_blank"`, then click it and assert the menu closes (`__menuOpen === false`). This covers spec §11.9 (the focus probe does not exercise the sheet-link nav path). Run → PASS.
- [ ] **Step 6: Commit** — `feat(admin): close attention menu + restore focus when pill goes non-interactive (probe-selected mechanism)`.

---

### Task 7: Transition audit (spec §8)

**Files:** Test: `tests/components/admin/showpage/attentionTransitions.test.tsx` (create).

This is a STRUCTURAL GUARD task (pins spec §8). Red-first is proven by inject-and-revert.

- [ ] **Step 1: Write the guard test** — `attentionTransitions.test.tsx`: statically read the pill + menu source (or render + assert no `motion.*`/`AnimatePresence` in the subtree), asserting no enter/exit animation on the 4 pill states / two groups / each `<a>` (instant per §8), and that a group appearing/disappearing while the menu is open does not throw and keeps the pill segment in lockstep. Reference (do not re-test) the Task 6 probe for compound case 2.
- [ ] **Step 2: Prove it can go red** — temporarily wrap one pill segment in `<AnimatePresence>`; run the guard → it FAILS. Revert the injection.
- [ ] **Step 3: Run against the real code** → PASS.
- [ ] **Step 4: Commit** — `test(admin): transition audit guard for attention pill + menu (all instant)`.

---

### Task 8: Extend topology + exclusion meta-tests

**Files:** Modify `tests/admin/_metaAttentionItemsTopology.test.ts`, `tests/admin/attentionExclusionSet.test.ts`.

STRUCTURAL GUARD task (pins invariants on already-built code). Red-first is proven by inject-and-revert, since assertion-only meta-tests have no natural red state.

- [ ] **Step 1: Update assertions** — topology test admits ONE caller (`app/admin/_showReviewModal.tsx`, count 1) after #538; assert the `driveFileId` arg addition did not add a caller (count stays 1). In `attentionExclusionSet.test.ts`, add an assertion that the 15-code RENDERS set (doug-audience auto-resolving) is unchanged by the new `clearingKind` field.
- [ ] **Step 2: Prove red** — temporarily add a second `deriveAttentionItems` reference in a throwaway source line (or a 16th code to the RENDERS expectation); run → the meta-test FAILS. Revert.
- [ ] **Step 3: Run against real code** → PASS.
- [ ] **Step 4: Commit** — `test(admin): pin driveFileId topology (single caller) + exclusion set unchanged`.

---

### Task 9: Gallery preview fixtures, THEN full suite + impeccable dual-gate

Gallery FIRST so its diff is covered by the suite and evaluated by impeccable (a gate must not run before the last UI change).

- [ ] **Step 1: Gallery preview** — the switcher gallery landed (#538) at `app/admin/dev/attention-gallery/` (`buildSwitcherScenarios.ts`, `page.tsx`). Grep the current scenario shape, then add scenario fixtures for the composite pill + needs-a-look rows (with/without link) + monitoring-only + in-sync via the `buildSwitcherScenarios` / `partitionScenarios` API. If the switcher's scenario type cannot accommodate the new pill states without a larger change, note it in the handoff and defer (do not expand scope). **Commit the gallery change here** (`feat(dev): attention-split scenarios in the modal gallery`) so nothing is left uncommitted.
- [ ] **Step 2: Full local suite (after ALL code incl. gallery)** — `pnpm test` (unit), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. All green. (Env-bound/e2e run separately: `pnpm test:e2e attention-pill-focus`.)
- [ ] **Step 3: impeccable critique** — `/impeccable critique` on the FULL diff (context.mjs load → register read). Fix/defer P0/P1.
- [ ] **Step 4: impeccable audit** — `/impeccable audit` on the FULL diff. Fix/defer P0/P1; record findings + dispositions in the handoff doc §12.
- [ ] **Step 5: Commit** — any impeccable fixes as `fix(admin): impeccable P0/P1 (attention split)`.

---

### Task 10: Final sync, whole-diff review, ship

**Precondition ALREADY MET:** `fix/unread-callout-dedup` (#537) AND `attention-modal-gallery` (#538) have landed on `origin/main`; this branch is already rebased onto them (the `clearingPillLabel` test reconciliation happened in Task 4 Step 1b, NOT here). This task is the final sync + ship, not the first rebase.

- [ ] **Step 1: Final sync** — `git fetch origin`; if `origin/main` advanced again since Task 4, `git rebase origin/main` and re-resolve (the `clearingPillLabel` inheritance already handled in Task 4). Verify `git rev-list --right-only --count HEAD...origin/main` == `0` (0 behind).
- [ ] **Step 2: Re-run full suite + typecheck + lint + format:check + e2e** — all green on the final base.
- [ ] **Step 3: Whole-diff Codex review** — split tight-scope reviews per surface (per the split-review default for large diffs); inline the file list per brief. Iterate to APPROVE.

- [ ] **Step 4: Push + real CI green** — `git push -u origin feat/attention-needs-attention-split`; watch `gh pr checks` to CLEAN.

- [ ] **Step 5: Merge + sync** — `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`; `CronDelete` the nudge; set marker stage `done`.

---

## Self-review (run against the spec)

- **Coverage:** §2 universe → Task 1; §3.1 bucketing/driveFileId → Task 2; §3.2 pill → Task 4; §3.4 menu → Task 5; §4 actions → Task 3; §5 hints → Task 3; §6/§6a focus → Task 6; §7 dims N/A; §8 transitions → Task 7; §10 meta-tests → Tasks 1,8; §11 tests → distributed; §12 sequencing → Task 10. No gap.
- **Placeholder scan:** none — every code step has real code; Task 6 mechanism is intentionally probe-driven (spec-ratified), not a placeholder.
- **Type consistency:** `clearingKind`, `driveFileId`, `NeedsLookCode`, `NEEDS_LOOK_HINTS`, `resolveAlertAction({slug,driveFileId})`, `interactive` — consistent across tasks.
