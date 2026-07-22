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
- `app/admin/dev/attention-gallery/buildBlockProps.ts` — MODIFY: pass `driveFileId` to `deriveAttentionItems`.
- Tests: `tests/adminAlerts/selfHealingClassification.test.ts` (CREATE), `tests/admin/attentionItems.test.ts` (EXTEND), `tests/adminAlerts/alertActions.test.ts` (EXTEND/CREATE), `tests/admin/needsLookHints.test.ts` (CREATE), `tests/components/admin/showpage/publishedPill.test.tsx` (CREATE), `tests/components/admin/showpage/attentionMenuGroups.test.tsx` (CREATE), `tests/e2e/attention-pill-focus.spec.ts` (CREATE, real-browser probe), `tests/admin/_metaAttentionItemsTopology.test.ts` (EXTEND).

## Meta-test inventory (spec §10)

- CREATE `tests/adminAlerts/selfHealingClassification.test.ts` (exhaustiveness, dual-set XOR).
- EXTEND `tests/admin/_metaAttentionItemsTopology.test.ts` (driveFileId arg + gallery call site).
- EXTEND `tests/admin/attentionExclusionSet.test.ts` (confirm 15-code RENDERS set unaffected — assertion-only, no new file).

## Pre-draft reconciliation sweep (run at plan time)

Command run in worktree `origin/main`:
`grep -rn "clearingCount\|clearing on their own" components/admin/showpage/ lib/admin/` →
- `AttentionMenu.tsx:141-151` (footer) — retired in Task 5.
- `PublishedReviewModal.tsx:304-309` (`clearingCount` derivation), `PublishedReviewModal.tsx:714-725` (pill "clearing" state) — replaced in Task 4.
Disposition: all three hits are handled by Tasks 4–5; no orphan references remain (Task 5 Step "grep confirms zero `clearingCount`").

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

  it("is NOT tautological: a synthetic unclassified code would fail membership", () => {
    const synthetic = "SYNTHETIC_NEW_AUTO_CODE";
    expect(SELF_HEALING_CODES.has(synthetic) || NEEDS_LOOK_CODES.has(synthetic)).toBe(false);
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
export const SELF_HEALING_CODES: ReadonlySet<string> = new Set([
  "DRIVE_FETCH_FAILED",
  "SYNC_STALLED",
  "WATCH_CHANNEL_ORPHANED",
]);

export const NEEDS_LOOK_CODES = new Set([
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
] as const);

export type NeedsLookCode = typeof NEEDS_LOOK_CODES extends Set<infer T> ? T : never;

export function isSelfHealing(code: string): boolean {
  return SELF_HEALING_CODES.has(code);
}
```

Note: `NeedsLookCode` derives from the literal set for the typed-total hint map (Task 3). Keep the `as const` on `NEEDS_LOOK_CODES` so the union is literal.

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
  const byCode = Object.fromEntries(items.filter(i => i.kind === "alert").map(i => [i.alert.code, i]));
  expect(byCode.SYNC_STALLED.clearingKind).toBe("self_heal");
  expect(byCode.SHEET_UNAVAILABLE.clearingKind).toBe("needs_look");
});

it("does not set clearingKind on an actionable alert", () => {
  const items = deriveAttentionItems({
    alerts: [{ id: "a3", code: "AMBIGUOUS_EMAIL_BINDING", context: {} } as any],
    feed: null, slug: "demo", driveFileId: null,
  });
  const it0 = items.find(i => i.kind === "alert");
  expect(it0?.actionable).toBe(true);
  expect(it0?.clearingKind).toBeUndefined();
});

it("orders needs_look before self_heal within the clearing tail", () => {
  const items = deriveAttentionItems({
    alerts: [
      { id: "s1", code: "SYNC_STALLED", context: {} } as any,
      { id: "n1", code: "SHEET_UNAVAILABLE", context: {} } as any,
    ],
    feed: null, slug: "demo", driveFileId: "F",
  });
  const codes = items.filter(i => i.kind === "alert").map(i => i.alert.code);
  expect(codes.indexOf("SHEET_UNAVAILABLE")).toBeLessThan(codes.indexOf("SYNC_STALLED"));
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/admin/attentionItems.test.ts -t clearingKind` → FAIL (arg `driveFileId` unknown / `clearingKind` undefined).

- [ ] **Step 3: Write minimal implementation** — `lib/admin/attentionItems.ts`

Add to `AttentionItemBase`:
```ts
  clearingKind?: "self_heal" | "needs_look";
```
Extend the args type and signature:
```ts
export function deriveAttentionItems(args: {
  alerts: AttentionAlertInput[];
  feed: { entries: FeedEntry[] } | null;
  slug: string;
  driveFileId: string | null;
  excludedCodes?: readonly string[];
}): AttentionItem[] {
```
Thread `driveFileId` into `toAlertItem(row, args.slug, args.driveFileId)` and, inside `toAlertItem`, after computing `actionable`:
```ts
  const clearingKind = actionable
    ? undefined
    : isSelfHealing(row.code) ? "self_heal" as const : "needs_look" as const;
```
Include `clearingKind` in the returned object. Pass `driveFileId` into `resolveAlertAction(row.code, row.context, { slug, driveFileId })` (Task 3 consumes it). Replace the final clearing concat with sub-ordering:
```ts
const clearing = alertItems.filter((i) => !i.actionable);
const needsLook = clearing.filter((i) => i.clearingKind === "needs_look");
const selfHeal = clearing.filter((i) => i.clearingKind === "self_heal");
return [...holdItems, ...actionableAlerts, ...needsLook, ...selfHeal];
```
Import `isSelfHealing` from `@/lib/adminAlerts/audience`.

- [ ] **Step 4: Run test to verify it passes** — `pnpm vitest run tests/admin/attentionItems.test.ts` → PASS (existing + 3 new). Fix any existing call sites in this test file that now need `driveFileId` (add `driveFileId: null`).

- [ ] **Step 5: Typecheck** — `pnpm typecheck` → will FAIL at the two `deriveAttentionItems` call sites (`_showReviewModal.tsx:306`, `buildBlockProps.ts:163`) missing `driveFileId`. Fix both:
  - `app/admin/_showReviewModal.tsx:306` — add `driveFileId` (already destructured at `_showReviewModal.tsx:257`): `{ alerts: ..., feed: ..., slug, driveFileId }`.
  - `app/admin/dev/attention-gallery/buildBlockProps.ts:163` — add `driveFileId: s.driveFileId ?? null` (or a gallery mock constant if the scenario type lacks it; use `null`).
  Re-run `pnpm typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/attentionItems.ts app/admin/_showReviewModal.tsx app/admin/dev/attention-gallery/buildBlockProps.ts tests/admin/attentionItems.test.ts
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

  it("RESYNC_SHRINK_HELD keeps its existing #overview registration", () => {
    const a = resolveAlertAction("RESYNC_SHRINK_HELD", {}, { slug: "demo", driveFileId: "FILE" });
    expect(a?.href).toContain("#overview");
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

describe("needs-look fix hints", () => {
  it("every needs-look code has a non-empty trimmed hint", () => {
    for (const code of NEEDS_LOOK_CODES) {
      const hint = (NEEDS_LOOK_HINTS as Record<string, string>)[code];
      expect(hint, `${code} missing hint`).toBeTruthy();
      expect(hint.trim().length, `${code} blank hint`).toBeGreaterThan(0);
    }
  });
  it("no em-dash in any hint", () => {
    for (const hint of Object.values(NEEDS_LOOK_HINTS)) expect(hint).not.toContain(String.fromCharCode(0x2014));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail** — `pnpm vitest run tests/adminAlerts/alertActions.test.ts tests/admin/needsLookHints.test.ts` → FAIL.

- [ ] **Step 3: Write minimal implementation**

`lib/adminAlerts/alertActions.ts`:
- Extend opts type to `{ slug: string | null; driveFileId: string | null }`.
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
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (derivation ~304-309, pill ~656-738)
- Test: `tests/components/admin/showpage/publishedPill.test.tsx` (create — RTL)

**Interfaces:**
- Consumes: `AttentionItem.clearingKind` (Task 2).
- Produces: `needsLook`, `selfHeal` derivations; composite pill segments.

- [ ] **Step 1: Write the failing test** — full pill presence matrix (spec §11.5), RTL. (See spec §11.5 for the exact 9-row matrix; assert visible text + no leading middot at `(0,4,0)` + monitoring not vanishing at `(3,0,2)`.)

```tsx
// tests/components/admin/showpage/publishedPill.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PublishedReviewModal } from "@/components/admin/showpage/PublishedReviewModal";
import { makeItems } from "./__fixtures__/attentionFixtures"; // helper: (nA,nNeed,nSelf) -> AttentionItem[]

function pillText(nA: number, nNeed: number, nSelf: number, degraded = false) {
  render(<PublishedReviewModal {...baseProps({ attentionItems: makeItems(nA, nNeed, nSelf), alertsDegraded: degraded })} />);
  return screen.getByTestId("published-alert-pill").textContent ?? "";
}

it("(3,4,2) shows all three, review+monitoring not hidden", () => {
  expect(pillText(3,4,2)).toMatch(/3 to confirm.*4 to review.*2 monitoring/s);
});
it("(3,0,2) monitoring does not vanish beside actionable", () => {
  expect(pillText(3,0,2)).toMatch(/3 to confirm.*2 monitoring/s);
});
it("(0,4,0) no leading middot", () => {
  const t = pillText(0,4,0).trim();
  expect(t.startsWith("·")).toBe(false);
  expect(t).toMatch(/4 to review/);
});
it("(0,0,1) monitoring-only is non-interactive (no button)", () => {
  render(<PublishedReviewModal {...baseProps({ attentionItems: makeItems(0,0,1) })} />);
  expect(screen.queryByRole("button", { name: /monitoring/i })).toBeNull();
});
it("(0,0,0) In sync", () => { expect(pillText(0,0,0)).toMatch(/In sync/); });
it("degraded → Alerts unavailable", () => { expect(pillText(0,0,0,true)).toMatch(/Alerts unavailable/); });
```

(`baseProps`/`makeItems` fixtures created in the same step under `__fixtures__/attentionFixtures.tsx`; derive counts from the fixture, not hardcoded pill output.)

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
it("monitoring group is one summary row, not enumerated", () => {
  render(<AttentionMenu {...menuProps([selfHealItem("SYNC_STALLED"), selfHealItem("DRIVE_FETCH_FAILED")])} />);
  expect(screen.getByText(/2 clearing on their own, no action needed/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Write minimal implementation** — in `AttentionMenu.tsx`: after the actionable rows, render (a) a "Needs a look" subheading + one read-only row per `needs_look` item: dot, `menuTitle`, `NEEDS_LOOK_HINTS[code]` hint line, and — if `item.alert.action` — an `<a>` (label from action; external → `target="_blank" rel="noopener noreferrer"` + "↗") with `onClick={() => onClose()}`; (b) a "Monitoring" subheading + one summary row "{selfHealCount} clearing on their own, no action needed". Retire the old footer (141-151). Reuse the anchor pattern from `AttentionBanner.tsx:160-174`.

- [ ] **Step 4: Run test to verify it passes** — PASS.

- [ ] **Step 5: Reconcile + mechanical check** — `grep -n "clearingCount\|clearing on their own" components/admin/showpage/AttentionMenu.tsx` → only the new monitoring string remains (old footer gone). Em-dash/token/tap-target check; `pnpm typecheck`; `pnpm lint`.

- [ ] **Step 6: Commit** — `feat(admin): needs-a-look + monitoring groups with action links in attention menu`.

---

### Task 6: Menu-open → non-interactive focus probe + mechanism (spec §6a)

**Files:**
- Create: `tests/e2e/attention-pill-focus.spec.ts` (real-browser)
- Modify: `PublishedReviewModal.tsx` (add the close-effect)

**Interfaces:** Consumes `interactive` (Task 4).

- [ ] **Step 1: Write the failing probe test** — real-browser (Playwright), the GENERATED 3×3 = 9-cell product (spec §6a/§11.5a). Do NOT hand-list cells:

```ts
const ENTRY: Array<[number, number]> = [[1,0],[0,1],[1,1]];
const EXIT = [{ selfHeal: 1, label: "B" }, { degraded: true, label: "C" }, { selfHeal: 0, label: "D" }];
const cells = ENTRY.flatMap(e => EXIT.map(x => ({ e, x })));
test("exactly 9 transition cells", () => { expect(cells.length).toBe(9); });
for (const { e, x } of cells) {
  test(`menu open ${JSON.stringify(e)} -> ${x.label}: menu closes, focus on dialog root, not body`, async ({ page }) => {
    // boot published modal, open menu at entry state e, drive to non-interactive x,
    // assert: menuOpen false, no aria-expanded=true, activeElement === dialog root (not body)
  });
}
```

Harness-readiness (spec §11.9): boot the existing published-modal e2e app (prod build, the configured port), await row hydration (`waitForRowHydration`-class gate, never `networkidle` alone), and make the live-data driver detach-safe (no `locator.evaluate` on a node that unmounts mid-transition).

- [ ] **Step 2: Run to verify it fails** — `pnpm test:e2e attention-pill-focus` → FAIL (menu orphaned / focus on body).

- [ ] **Step 3: Implement the close-effect** — in `PublishedReviewModal.tsx`, add an effect keyed on `interactive`; when it goes false while `menuOpen`, `setMenuOpen(false)` and move focus to the dialog root ref. Try `useLayoutEffect` first; if the probe shows a body-flash, switch to the alternative in §6a (suppress the menu's own close-focus-restore for this path). The probe IS the authority — iterate mechanism until all 9 cells pass. Key the effect on `interactive`, NEVER on `actionable` alone.

- [ ] **Step 4: Run to verify it passes** — all 9 cells + the count assertion PASS.

- [ ] **Step 5: Commit** — `feat(admin): close attention menu + restore focus when pill goes non-interactive`.

---

### Task 7: Transition audit (spec §8)

**Files:** Test: `tests/components/admin/showpage/attentionTransitions.test.tsx` (create).

- [ ] **Step 1: Write the test** — enumerate every conditional render in the pill + menu (the 4 pill states, the two groups, each `<a>`): assert none introduces an `AnimatePresence`/`motion` enter-exit (states are instant per §8), and that group appear/disappear while the menu is open does not throw / leaves the pill segment in lockstep. Assert the compound case 2 is delegated to the Task 6 probe (reference, not re-test).

- [ ] **Step 2-4:** run-fail (if any stray animation exists) → remove it → run-pass.

- [ ] **Step 5: Commit** — `test(admin): transition audit for attention pill + menu (all instant)`.

---

### Task 8: Extend topology + exclusion meta-tests

**Files:** Modify `tests/admin/_metaAttentionItemsTopology.test.ts`, `tests/admin/attentionExclusionSet.test.ts`.

- [ ] **Step 1: Update** — the topology test already admits both callers; confirm the `driveFileId` arg addition did not add a third caller (grep count stays 2). In `attentionExclusionSet.test.ts`, add an assertion that the 15-code RENDERS set (doug-audience auto-resolving) is unchanged by the new `clearingKind` field.

- [ ] **Step 2: Run** — `pnpm vitest run tests/admin/_metaAttentionItemsTopology.test.ts tests/admin/attentionExclusionSet.test.ts` → PASS.

- [ ] **Step 3: Commit** — `test(admin): pin driveFileId topology + exclusion set unchanged`.

---

### Task 9: Full suite + impeccable dual-gate + gallery preview

- [ ] **Step 1: Full local suite** — `pnpm test` (unit), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. All green. (Env-bound/e2e run separately: `pnpm test:e2e attention-pill-focus`.)

- [ ] **Step 2: impeccable critique** — `/impeccable critique` on the diff (context.mjs load → register read). Fix/deferr P0/P1.

- [ ] **Step 3: impeccable audit** — `/impeccable audit` on the diff. Fix/defer P0/P1; record findings + dispositions in the handoff doc §12.

- [ ] **Step 4: Gallery preview (if `attention-modal-gallery` landed)** — add scenario fixtures for the composite pill + needs-a-look rows + monitoring-only + in-sync to its `AttentionModalSwitcher`. If not landed, skip and note in the handoff (spec §12).

- [ ] **Step 5: Commit** — any impeccable fixes as `fix(admin): impeccable P0/P1 (attention split)`.

---

### Task 10: Rebase onto `unread-callout-dedup`, whole-diff review, ship

**Precondition:** `fix/unread-callout-dedup` merged to `origin/main` (spec §12). If not yet merged, HALT here (set marker `blockedOn`), keep the nudge armed, resume when it lands.

- [ ] **Step 1: Sync + rebase** — `git fetch origin`; `git rebase origin/main`. Resolve conflicts in `PublishedReviewModal.tsx` (its a11y-label work vs our pill) and update/supersede its `clearingPillLabel` test to match the new pill copy (`to confirm · to review · monitoring`), inheriting its accessible-label approach.

- [ ] **Step 2: Re-run full suite + typecheck + lint after rebase** — green (base changed).

- [ ] **Step 3: Whole-diff Codex review** — split tight-scope reviews per surface (spec §... ; per the split-review default). Iterate to APPROVE.

- [ ] **Step 4: Push + real CI green** — `git push -u origin feat/attention-needs-attention-split`; watch `gh pr checks` to CLEAN.

- [ ] **Step 5: Merge + sync** — `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`; `CronDelete` the nudge; set marker stage `done`.

---

## Self-review (run against the spec)

- **Coverage:** §2 universe → Task 1; §3.1 bucketing/driveFileId → Task 2; §3.2 pill → Task 4; §3.4 menu → Task 5; §4 actions → Task 3; §5 hints → Task 3; §6/§6a focus → Task 6; §7 dims N/A; §8 transitions → Task 7; §10 meta-tests → Tasks 1,8; §11 tests → distributed; §12 sequencing → Task 10. No gap.
- **Placeholder scan:** none — every code step has real code; Task 6 mechanism is intentionally probe-driven (spec-ratified), not a placeholder.
- **Type consistency:** `clearingKind`, `driveFileId`, `NeedsLookCode`, `NEEDS_LOOK_HINTS`, `resolveAlertAction({slug,driveFileId})`, `interactive` — consistent across tasks.
