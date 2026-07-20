# Warning-Card Copy Restore + Trigger Popover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore concise inline guidance to compact warning cards, repoint the `?` popover to new per-code "what triggers this" copy, and fix the trigger to 22px-with-overlay geometry — per spec `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` (Codex APPROVE, R7).

**Architecture:** One copy commit (39-code catalog sweep, §12.4 lockstep, frozen-fixture meta-test with corpus oracle), one adapter commit (`PerShowActionableWarnings` message-slot stack + popover re-point), one geometry commit (`HoverHelp.compactTrigger` + real-browser assertions + contrast pairs). Spec §4.2 is the canonical copy table; the meta-test's frozen fixture is its enforcement arm.

**Tech Stack:** Next.js 16 / React, Tailwind v4 tokens, Vitest (+ jsdom for adapter tests), Playwright real-browser harness (`tests/e2e/compact-alert-card-layout.spec.ts` family, esbuild-bundled live entry).

## Global Constraints

- Spec is canonical: every copy string comes VERBATIM from spec §4.2 (`docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md`). Do not re-author.
- §12.4 lockstep (invariant, AGENTS.md): master-spec prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` land in the SAME commit; `pnpm test:audit:x1-catalog-parity` green.
- Banned vocabulary in the three authored fields (spec §4.1): parse/parser/parsed/parsing, token, extractor, positional, canonical(ize), structured, ingest(ion), fallback, enum, RPC, payload, metadata, variant, null, parseable, unparseable — word-boundary, case-insensitive — plus the em-dash character.
- Length caps: `helpfulContext` ≤ 300 chars, `triggerContext` ≤ 160 chars (spec §3.5.1).
- Boundary: zero `admin_alerts` codes, zero `dougFacing` edits, zero AttentionBanner copy/content changes (geometry-only exception per spec §9).
- TDD per task; commit per task with `--no-verify`; conventional commits.
- UI diff ⇒ impeccable critique + audit before cross-model review (invariant 8).
- Typecheck constraint: repo tsconfig has `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — every snippet below was authored against that; run `pnpm typecheck` before each commit.

## Meta-test inventory (writing-plans rule)

<!-- spec-lint: ignore — new test files created by this plan / quoted test-code fragments, not UI copy -->
CREATES `tests/messages/_metaWarningCardCopy.test.ts` (+ its fixture module `tests/messages/warningCardCopyRegistry.ts`). EXTENDS `tests/e2e/_compactAlertCardLiveEntry.tsx` + `tests/e2e/compact-alert-card-layout.spec.ts` (real-browser geometry) and the `tests/styles/` contrast family (two new token pairs). No advisory-lock surface (no `pg_advisory*` touched). No DB migration.

---

### Task 1: Copy sweep — meta-test, registry fixture, catalog + §12.4 lockstep, AGENTS.md line

**Files:**
<!-- spec-lint: ignore — new test files created by this plan / quoted test-code fragments, not UI copy -->
- Create: `tests/messages/warningCardCopyRegistry.ts`
<!-- spec-lint: ignore — new test files created by this plan / quoted test-code fragments, not UI copy -->
- Create: `tests/messages/_metaWarningCardCopy.test.ts`
- Modify: `lib/messages/catalog.ts` (type at lines 1-40; the 39 code entries; 4 titles)
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 helpfulContext list (region around line 3230) — 36 replaced lines + 3 new lines (`FIELD_UNREADABLE`, `SECTION_HEADER_NO_FIELDS`, `UNKNOWN_SECTION_HEADER`)
- Regenerate: `lib/messages/__generated__/spec-codes.ts` via `pnpm gen:spec-codes`
- Modify: `AGENTS.md` (§12.4 lockstep bullet — one added sentence)
- Test: the new meta-test itself

**Interfaces:**
<!-- spec-lint: ignore — new test files created by this plan / quoted test-code fragments, not UI copy -->
- Produces: `WARNING_CARD_COPY_CODES: ReadonlySet<string>`, `EXPECTED_TRIGGER_CONTEXT: Readonly<Record<string, string>>`, `EXPECTED_TITLE_CHANGES: Readonly<Record<string, string>>`, `EXPECTED_CORPUS_WARN_CODES: ReadonlySet<string>`, `EXPECTED_CORPUS_FIXTURES: ReadonlySet<string>` (all from `tests/messages/warningCardCopyRegistry.ts`); catalog field `MessageCatalogEntry.triggerContext?: string | null`.
- Consumes: `MESSAGE_CATALOG` (`lib/messages/catalog.ts`), `parseSheet` (`lib/parser/index.ts:546`), `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts:369`).

<!-- spec-lint: ignore — new test files created by this plan / quoted test-code fragments, not UI copy -->
- [ ] **Step 1: Write the registry fixture** — `tests/messages/warningCardCopyRegistry.ts`. The 39 codes are spec §3.1's two lists. `EXPECTED_TRIGGER_CONTEXT` = spec §4.2 popover column, byte-for-byte, all 39 rows. `EXPECTED_TITLE_CHANGES` = rows 10/21/26/36: `FIELD_UNREADABLE: "Phone or email we couldn't use"`, `SECTION_HEADER_NO_FIELDS: "Section with nothing under it"`, `UNKNOWN_SECTION_HEADER: "Section we didn't recognize"`, `TRAVEL_FLIGHT_UNPARSEABLE: "Flight we couldn't read"`. Leave `EXPECTED_CORPUS_WARN_CODES`/`EXPECTED_CORPUS_FIXTURES` as empty sets with a `// measured in Step 3` comment. Follow the `tests/messages/adminAlertsRegistry.ts` module style.

```ts
// tests/messages/warningCardCopyRegistry.ts - fixture data for _metaWarningCardCopy.test.ts.
// Nothing in lib/ or components/ imports this module (spec §3.5 registry contract).
export const WARNING_CARD_COPY_CODES: ReadonlySet<string> = new Set([
  "AGENDA_BLOCK_UNRESOLVED", "AGENDA_DAY_AMBIGUOUS", /* … all 39 from spec §3.1 … */
]);
export const EXPECTED_TRIGGER_CONTEXT: Readonly<Record<string, string>> = {
  AGENDA_BLOCK_UNRESOLVED: "Appears when a day in the AGENDA tab has no readable date above it.",
  /* … all 39, popover column of spec §4.2, byte-for-byte … */
};
export const EXPECTED_TITLE_CHANGES: Readonly<Record<string, string>> = { /* 4 rows above */ };
export const EXPECTED_CORPUS_WARN_CODES: ReadonlySet<string> = new Set([]); // measured in Step 3
export const EXPECTED_CORPUS_FIXTURES: ReadonlySet<string> = new Set([]); // measured in Step 3
```

<!-- spec-lint: ignore — new test files created by this plan / quoted test-code fragments, not UI copy -->
- [ ] **Step 2: Write the failing meta-test** — `tests/messages/_metaWarningCardCopy.test.ts`. Untyped `Record` view so the red state is behavioral (spec §8.1):

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { parseSheet } from "@/lib/parser";
import { OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
import {
  WARNING_CARD_COPY_CODES, EXPECTED_TRIGGER_CONTEXT, EXPECTED_TITLE_CHANGES,
  EXPECTED_CORPUS_WARN_CODES, EXPECTED_CORPUS_FIXTURES,
} from "./warningCardCopyRegistry";

// Untyped view: red state must be missing VALUES, not a missing type property (spec §8.1).
const CATALOG = MESSAGE_CATALOG as Record<string, Record<string, unknown>>;
const EM_DASH = String.fromCodePoint(0x2014);
const BANNED = new RegExp(
  String.raw`\b(pars(?:e|er|ed|ing)|token|extractor|positional|canonical(?:ize)?|structured|ingest(?:ion)?|fallback|enum|RPC|payload|metadata|variant|null|(?:un)?parseable)\b` + "|" + EM_DASH,
  "iu",
);
const CORPUS_DIR = "fixtures/shows/raw";

describe("warning-card copy registry (spec 2026-07-20-warning-card-copy-restore §3.5)", () => {
  const codes = [...WARNING_CARD_COPY_CODES].sort();

  it("every registry code has non-empty title, capped helpfulContext, capped triggerContext", () => {
    for (const code of codes) {
      const e = CATALOG[code];
      expect(e, `${code} missing from catalog`).toBeDefined();
      if (!e) continue;
      expect(typeof e.title === "string" && (e.title as string).trim().length > 0, `${code}.title`).toBe(true);
      const hc = e.helpfulContext;
      expect(typeof hc === "string" && hc.trim().length > 0 && hc.length <= 300, `${code}.helpfulContext cap`).toBe(true);
      const tc = e.triggerContext;
      expect(typeof tc === "string" && tc.trim().length > 0 && tc.length <= 160, `${code}.triggerContext cap`).toBe(true);
    }
  });

  it("banned vocabulary + em-dash never appear in the three authored fields", () => {
    for (const code of codes) {
      const e = CATALOG[code];
      if (!e) continue;
      for (const field of ["title", "helpfulContext", "triggerContext"] as const) {
        const v = e[field];
        if (typeof v !== "string") continue;
        const m = BANNED.exec(v);
        expect(m, `${code}.${field} banned term ${JSON.stringify(m?.[0])}`).toBeNull();
      }
    }
  });

  it("frozen copy fixture: triggerContext + changed titles match spec §4.2 byte-for-byte", () => {
    for (const code of codes) {
      expect(CATALOG[code]?.triggerContext, `${code}.triggerContext`).toBe(EXPECTED_TRIGGER_CONTEXT[code]);
    }
    for (const [code, title] of Object.entries(EXPECTED_TITLE_CHANGES)) {
      expect(CATALOG[code]?.title, `${code}.title`).toBe(title);
    }
  });

  it("OPERATOR_ACTIONABLE_ANCHORED is a subset of the registry", () => {
    for (const code of OPERATOR_ACTIONABLE_ANCHORED) {
      expect(WARNING_CARD_COPY_CODES.has(code), code).toBe(true);
    }
  });

  it("corpus oracle: every warn code emitted by the committed corpus is registered; sets frozen (spec §3.5.4)", () => {
    const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".md")).sort();
    expect(new Set(files)).toEqual(EXPECTED_CORPUS_FIXTURES);
    const emitted = new Set<string>();
    for (const f of files) {
      const parsed = parseSheet(readFileSync(join(CORPUS_DIR, f), "utf8"), f);
      for (const w of parsed.warnings) if (w.severity === "warn") emitted.add(w.code);
    }
    for (const code of emitted) {
      expect(WARNING_CARD_COPY_CODES.has(code), `corpus emitted unregistered warn code ${code}`).toBe(true);
    }
    expect(emitted).toEqual(EXPECTED_CORPUS_WARN_CODES);
  });
});
```

(If `parseSheet` is not exported from `@/lib/parser` barrel, import from `@/lib/parser/index` — verify with `rg -n "export function parseSheet" lib/parser/index.ts` = line 546. If `ParsedSheet.warnings` is named differently, check `lib/parser/schema.ts` and adjust — grep before running.)

- [ ] **Step 3: Measure the corpus sets** — run `npx vitest run tests/messages/_metaWarningCardCopy.test.ts` once; the corpus test fails on empty frozen sets. Take the observed fixture list (the 8 files in `fixtures/shows/raw/`) and the observed emitted warn-code set from the failure diff (or add a temporary `console.log([...emitted].sort())`), fill `EXPECTED_CORPUS_FIXTURES` + `EXPECTED_CORPUS_WARN_CODES`, remove any temporary log. Record the observed set in the commit message body.

- [ ] **Step 4: Run the meta-test to verify behavioral red** — `npx vitest run tests/messages/_metaWarningCardCopy.test.ts`. Expected: FAIL — 39 missing `triggerContext`, 3 null titles, 1 stale title (`TRAVEL_FLIGHT_UNPARSEABLE`), over-cap/banned `helpfulContext` rows (e.g. AGENDA_PDF_UNREADABLE contains "parse"). Quote the failure summary in the task log. Corpus test must now PASS (sets frozen in Step 3) — if any corpus-emitted code is missing from the registry, STOP: that is a spec §3.1 audit gap; add it to the registry AND spec §4.2 before continuing (none expected).

- [ ] **Step 5: Land the copy lockstep (same commit)** —
  1. `lib/messages/catalog.ts`: add to `MessageCatalogEntry` (after `helpHref`): `/** Card-popover "what makes this appear" copy (catalog-internal, not §12.4 prose — spec 2026-07-20-warning-card-copy-restore §3.2). */ triggerContext?: string | null;`. For each of the 39 codes: replace `helpfulContext` with the spec §4.2 inline column, add `triggerContext` from the popover column, set the 4 changed titles.
  2. Master spec §12.4 helpfulContext list (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, list region near line 3230): replace the 36 existing `CODE: "…"` lines for registry codes with the §4.2 inline column; ADD three new lines for `FIELD_UNREADABLE`, `SECTION_HEADER_NO_FIELDS`, `UNKNOWN_SECTION_HEADER`. NEVER run prettier on the master spec.
  3. `pnpm gen:spec-codes` — commit the regenerated `lib/messages/__generated__/spec-codes.ts`.
  4. `AGENTS.md`, "§12.4 catalog row edits" bullet: append sentence — `Applies to warning-card codes too: a new warn-severity ParseWarning code also gets a WARNING_CARD_COPY_CODES row + copy per docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md §4.2.`

- [ ] **Step 6: Verify green** — `npx vitest run tests/messages/_metaWarningCardCopy.test.ts` PASS; `pnpm test:audit:x1-catalog-parity` PASS; `npx vitest run tests/messages` PASS (catalog-wide hygiene suites must accept the new copy); `pnpm typecheck` PASS.

<!-- spec-lint: ignore — new test files created by this plan / quoted test-code fragments, not UI copy -->
- [ ] **Step 7: Commit** — `git add -A && git commit --no-verify -m "feat(admin): warning-card copy sweep — condensed helpfulContext + triggerContext for 39 warn codes"` with the red-run quote + corpus set in the body.

---

### Task 2: Adapter — inline guidance line + popover re-point

**Files:**
- Modify: `components/admin/PerShowActionableWarnings.tsx:63-145`
- Test: `tests/admin/perShowActionableRenderControls.test.tsx` (extend), `tests/parser/parseWarningDeepLinkRender.test.tsx` (update popover expectations)

**Interfaces:**
- Consumes: `MessageCatalogEntry.triggerContext` (Task 1), `renderEmphasis` (`components/messages/renderEmphasis.tsx`), `CompactAlertCard` slots (unchanged).
- Produces: `data-testid="per-show-actionable-guidance"` node (guidance line) — Task 3's harness and the e2e specs rely on this exact testid.

- [ ] **Step 1: Write failing tests** — in `tests/admin/perShowActionableRenderControls.test.tsx` add (fixture warnings already exist in that file; derive expectations from `MESSAGE_CATALOG`, never hardcode):

```tsx
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

it("renders the condensed helpfulContext as an inline guidance line (spec §3.3)", () => {
  render(<PerShowActionableWarnings items={[unknownFieldWarning]} driveFileId={null} />);
  const guidance = screen.getByTestId("per-show-actionable-guidance");
  expect(guidance.textContent).toBe(MESSAGE_CATALOG.UNKNOWN_FIELD.helpfulContext);
  expect(guidance.className).toContain("text-warning-text"); // warning tone class binding
});

it("muted tone guidance carries text-text-subtle", () => {
  render(<PerShowActionableWarnings items={[unknownFieldWarning]} driveFileId={null} tone="muted" />);
  expect(screen.getByTestId("per-show-actionable-guidance").className).toContain("text-text-subtle");
});

it("popover body renders triggerContext, scoped to the popover element (spec §3.3)", () => {
  render(<PerShowActionableWarnings items={[unknownFieldWarning]} driveFileId={null} />);
  const body = screen.getByTestId(/per-show-actionable-help-.*-body/);
  expect(body.textContent).toContain(MESSAGE_CATALOG.UNKNOWN_FIELD.triggerContext);
  expect(body.textContent).not.toContain(MESSAGE_CATALOG.UNKNOWN_FIELD.helpfulContext);
});

it("unknown code: no guidance node, no trigger", () => {
  render(<PerShowActionableWarnings items={[{ ...unknownFieldWarning, code: "NOT_A_CODE", message: "human text" }]} driveFileId={null} />);
  expect(screen.queryByTestId("per-show-actionable-guidance")).toBeNull();
  expect(screen.queryByTestId(/per-show-actionable-help-.*-trigger/)).toBeNull();
});
```

Guard matrix (spec §7): also add cases mocking catalog access is NOT allowed — instead pick real codes and synthesize entry-absence via unknown code; for the whitespace spellings, spy is unnecessary: assert via a warning whose code maps to an entry with null helpfulContext is no longer possible post-sweep, so cover the branch with the unknown-code case plus a direct unit of the guard expression (extract `guidanceFor(entry)` if needed — keep inline if trivial).

- [ ] **Step 2: Run to verify red** — `npx vitest run tests/admin/perShowActionableRenderControls.test.tsx`. Expected FAIL: guidance testid absent; popover still shows helpfulContext.

- [ ] **Step 3: Implement** — in `PerShowActionableWarnings.tsx`: replace line 72 `const context = entry?.helpfulContext ?? null;` with:

```tsx
const guidanceRaw = entry?.helpfulContext ?? null;
const guidance = guidanceRaw && guidanceRaw.trim().length > 0 ? guidanceRaw : null;
const triggerRaw = entry?.triggerContext ?? null;
const context = triggerRaw && triggerRaw.trim().length > 0 ? triggerRaw : null;
```

and change the `message` prop (line 126) to a stack:

```tsx
message={
  <span className="flex min-w-0 flex-col gap-1">
    <span className="text-text-strong">{renderEmphasis(title)}</span>
    {guidance ? (
      <span
        data-testid="per-show-actionable-guidance"
        className={`text-xs/relaxed font-normal ${tone === "muted" ? "text-text-subtle" : "text-warning-text"}`}
      >
        {renderEmphasis(guidance)}
      </span>
    ) : null}
  </span>
}
```

(`CompactAlertHelp` keeps its `helpfulContext` prop NAME; it now receives trigger copy — spec §3.3 keeps the leaf API unchanged.)

- [ ] **Step 4: Verify green** — the file's suites + `npx vitest run tests/parser/parseWarningDeepLinkRender.test.tsx` (update any assertion that expected helpfulContext in the popover — repoint to `triggerContext`); `npx vitest run tests/admin tests/components` for adapter-adjacent regressions; `pnpm typecheck`.

- [ ] **Step 5: Commit** — `feat(admin): inline guidance line on warning cards; popover shows trigger context`.

---

### Task 3: Trigger geometry — `compactTrigger` + real-browser proofs + contrast pairs

**Files:**
- Modify: `components/admin/HoverHelp.tsx` (custom-trigger branch, lines 194-201; new prop)
- Modify: `components/admin/compactAlertHelp.tsx` (trigger span lines 122-132; pass `compactTrigger`)
- Modify: `tests/e2e/_compactAlertCardLiveEntry.tsx` (add guidance-bearing warning-card fixture + AttentionBanner-consumption fixture)
- Modify: `tests/e2e/compact-alert-card-layout.spec.ts` (geometry assertions)
- Extend: `tests/styles/status-token-contrast.test.ts` (two pairs × two themes)
- Test: jsdom class regressions in `tests/admin/perShowActionableRenderControls.test.tsx` (trigger class) + a new small case in the wizard/drive-panel suites if one exists — otherwise assert via direct render of `HoverHelp` with `trigger` and no `compactTrigger`.

**Interfaces:**
- Consumes: `data-testid="per-show-actionable-guidance"` (Task 2), `CompactAlertHelp` (Task 2 state), tokens `--color-warning-*`/`--color-text-subtle`/`--color-surface-sunken` (`app/globals.css:270-286, 320-335`).
- Produces: `HoverHelp` prop `compactTrigger?: boolean` (default false).

<!-- spec-lint: ignore — new test files created by this plan / quoted test-code fragments, not UI copy -->
- [ ] **Step 1: Failing jsdom tests** — `HoverHelp` unit (add to an existing HoverHelp/compactAlertHelp test file under `tests/components` or `tests/admin`; create `tests/components/admin/hoverHelpCompactTrigger.test.tsx` if none):

```tsx
it("custom trigger without compactTrigger keeps the 44px box classes", () => {
  render(<HoverHelp label="Help: x" trigger={<span>badge</span>}>body</HoverHelp>);
  const btn = screen.getByTestId("hover-help-trigger");
  expect(btn.className).toContain("min-h-tap-min");
  expect(btn.className).toContain("min-w-tap-min");
});

it("compactTrigger swaps to the 22px box + overlay classes", () => {
  render(<HoverHelp label="Help: x" trigger={<span>?</span>} compactTrigger>body</HoverHelp>);
  const btn = screen.getByTestId("hover-help-trigger");
  expect(btn.className).toContain("size-[22px]");
  expect(btn.className).toContain("before:-inset-[11px]");
  expect(btn.className).not.toContain("min-h-tap-min");
});
```

- [ ] **Step 2: Run red** — new prop absent ⇒ TS error / class assertion fail.

- [ ] **Step 3: Implement** — `HoverHelp.tsx`: add `compactTrigger = false` to props. Custom-trigger button className becomes:

```tsx
className={
  compactTrigger
    ? "relative grid size-[22px] shrink-0 cursor-help place-items-center rounded-pill before:absolute before:-inset-[11px] before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
    : "inline-flex min-h-tap-min min-w-tap-min cursor-help items-center justify-center rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
}
```

`compactAlertHelp.tsx`: pass `compactTrigger` on the `HoverHelp` call; change the inner span from `grid size-[22px] place-items-center rounded-pill border …` to `rounded-pill border border-warning-text text-xs font-bold text-warning-text transition-colors duration-fast hover:bg-warning-text/10 grid size-full place-items-center` — the BUTTON owns the 22px box and centering (spec §3.4); keep the span's border/color skin filling the button (`size-full`).

- [ ] **Step 4: Real-browser fixtures + assertions** — extend `_compactAlertCardLiveEntry.tsx` with two mounts: (a) a `PerShowActionableWarnings` card with a real `UNKNOWN_FIELD`-coded warning (imports the real adapter; catalog gives guidance + trigger); (b) the real `AttentionBanner` with a minimal admin-alert item fixture whose code has `helpfulContext` (check `components/admin/review/AttentionBanner.tsx` props before writing; reuse an existing fixture from `tests/components/admin/review/attentionBanner.test.tsx`). In `compact-alert-card-layout.spec.ts` add for BOTH mounts:

```ts
const btn = page.getByTestId(/-trigger$/).first(); // scope per-mount via container testids
const box = await btn.boundingBox();
expect(Math.abs(box!.width - 22)).toBeLessThanOrEqual(0.5);
expect(Math.abs(box!.height - 22)).toBeLessThanOrEqual(0.5);
// glyph centering (spec §6): glyph span center within ±1px of button center
// title-line alignment (adapter mount only): |btn.top − titleLine.top| ≤ 4 with guidance rendered
// ::before extent: getComputedStyle(btn, "::before") top/right/bottom/left all "-11px"
// elementFromPoint probes at center ±21.5px on both axes resolve to the button
```

Write the four checks as real code in the spec file (use `page.evaluate` for `getComputedStyle`/`elementFromPoint`, viewport coords per the existing harness pattern). Add: unchanged-caller checks live in Step 1's jsdom tests (badge path classes).

- [ ] **Step 5: Contrast pairs** — extend `tests/styles/status-token-contrast.test.ts` following its existing pair-table pattern with `(text-subtle, surface-sunken)` and `(warning-text, warning-bg)` at 4.5:1 in both themes. Expected values (spec §7): 6.09 / 6.94 / 8.79 / 9.64.

- [ ] **Step 6: Run all green** — `npx vitest run tests/components tests/admin tests/styles tests/messages`; `npx playwright test tests/e2e/compact-alert-card-layout.spec.ts` (build the live bundle per that spec's header instructions); `pnpm typecheck`.

- [ ] **Step 7: Commit** — `feat(admin): compact 22px help trigger with overlay hit area; rendered geometry + contrast proofs`.

---

### Task 4: Close-out gates

- [ ] Full local gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` (memory: scoped suites miss registry suites — run FULL).
- [ ] Impeccable dual-gate on the UI diff (`/impeccable critique` + `/impeccable audit`, canonical v3 setup: context.mjs + register read). P0/P1 fixed or DEFERRED.md.
- [ ] Whole-diff Codex review (split tight-scope briefs: copy/catalog surface vs component/geometry surface), REVIEWER ONLY, fresh-eyes, iterate to APPROVE.
- [ ] Push, PR, real CI green (check `mergeStateStatus` CLEAN), `gh pr merge --merge`, ff-sync local main, verify `0  0`.

## Self-review notes

- Spec coverage: §3.1/3.5 → Task 1; §3.2 → Task 1 Step 5; §3.3/§5 → Task 2; §3.4/§6 → Task 3; §4 → Task 1; §7 → Tasks 1-3 test steps; §8 sequencing honored (meta-test red before copy, one commit); AGENTS.md line → Task 1 Step 5.4.
- Anti-tautology: adapter expectations derive from `MESSAGE_CATALOG`; popover assertions scoped to `-body` testid; corpus expectations frozen from measured run, not asserted against themselves (set equality against an explicit fixture that reviewers diff).
- Layout-dimensions rule: fixed-dimension parent (22px button) covered by real-browser Task 3 Step 4 (jsdom insufficient — stated).
- Transition-audit rule: spec §6 declares all 6 pairs instant; no `AnimatePresence` introduced; no new animated state — no dedicated task needed beyond the §6 declaration (popover fade untouched).
