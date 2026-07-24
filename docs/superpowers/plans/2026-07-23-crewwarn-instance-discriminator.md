# CREWWARN Instance Discriminator + Eyebrow Wrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Same-code FIELD_UNREADABLE warning cards become visually and identity-distinguishable (context-aware detail band + field-folded dedup/identity keys), and the data-quality group eyebrow wraps instead of truncating at 390px.

**Architecture:** One additive `blockRef.field` write in the parser producer fans out to (a) a new detail band in the shared `PerShowActionableWarnings` card, (b) a FIELD_UNREADABLE fold in the `operatorActionableWarnings` dedup key (fixes a latent hidden-card bug), and (c) a FIELD_UNREADABLE fold in `warningIdentityKey` (fixes a latent shared-report-draft bug). The eyebrow fix is a one-class change in `BulkIgnoreControls` plus a new live-bundled standalone browser spec.

**Tech Stack:** Next.js 16 / React server components, Vitest + jsdom, Playwright standalone config (`tests/e2e/standalone.config.ts`), esbuild@0.28.0 live-bundle harness pattern.

**Spec:** `docs/superpowers/specs/2026-07-23-crewwarn-instance-discriminator-design.md` (APPROVED, Codex R3). Spec §1.1 do-not-relitigate list binds every task.

## Global Constraints

- TDD per task: failing test → minimal implementation → passing test → commit (invariant 1). Commit per task, conventional-commits (invariant 6).
- No catalog / §12.4 edits; no new `code:` literals (spec §1.1 #6).
- IGNORE fingerprint (`warningFingerprint`) untouched (spec §1.1 #5).
- USABLE rule everywhere a band segment renders: `typeof v === "string" && v.trim().length > 0`, render trimmed; anything else ⇒ segment absent; `.trim()` never runs on a non-string (spec §2.2).
- Separator is `·` never an em-dash; band is non-interactive (no tap-target requirement).
- No mutation surfaces touched → no telemetry registry rows (invariant 10 n/a; verify no new route/action in final diff).
- Strict tsconfig: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — never assign `undefined` to an optional key; use conditional spread.
- Meta-test inventory (spec §3 test 7): none created/extended — declared "none applies" because no new Supabase boundary, admin mutation, advisory lock, or catalog code.

---

### Task 1: Producer writes `blockRef.field`

**Files:**
- Modify: `lib/parser/warnings.ts:98` (the `emitFieldUnreadable` push)
- Test: `tests/parser/warnings.test.ts`

**Interfaces:**
- Produces: FIELD_UNREADABLE warnings whose `blockRef` is `{ kind, index, name, field: "phone" | "email" }`. Tasks 2–5 rely on `blockRef.field`.

- [ ] **Step 1: Write the failing test** — extend the existing `emitFieldUnreadable` describe block in `tests/parser/warnings.test.ts`:

```ts
test("stores the field discriminator on blockRef (phone and email)", () => {
  const agg = { warnings: [] as ParseWarning[] };
  emitFieldUnreadable(agg as never, {
    section: "crew", field: "phone", rawSnippet: "call me", index: 3, name: "Jordan Ellis",
  });
  emitFieldUnreadable(agg as never, {
    section: "crew", field: "email", rawSnippet: "jordan-at", index: 3, name: "Jordan Ellis",
  });
  expect(agg.warnings[0]?.blockRef).toEqual({ kind: "crew", index: 3, name: "Jordan Ellis", field: "phone" });
  expect(agg.warnings[1]?.blockRef).toEqual({ kind: "crew", index: 3, name: "Jordan Ellis", field: "email" });
  // message shape unchanged (outcome-neutral wording pinned elsewhere; here: field word present)
  expect(agg.warnings[0]?.message).toContain("Crew phone for row 4");
});
```

(Match the aggregator construction style already used in that file — if it builds a real `ParseAggregator`, reuse its helper.)

- [ ] **Step 2: Run** `pnpm vitest run tests/parser/warnings.test.ts` — expect FAIL: `blockRef` missing `field`.
- [ ] **Step 3: Implement** — in `lib/parser/warnings.ts` `emitFieldUnreadable`, change the push's blockRef line:

```ts
blockRef: { kind: params.section, index: params.index, name: params.name, field: params.field },
```

- [ ] **Step 4: Run same command — PASS.** Also run `pnpm vitest run tests/parser/blocks/crew.test.ts` (call sites at `lib/parser/blocks/crew.ts:304` and `lib/parser/blocks/crew.ts:321` already pass `field`; existing assertions must stay green).
- [ ] **Step 5: Commit** `feat(parser): FIELD_UNREADABLE stores blockRef.field discriminator`

### Task 2: Dedup fold — hidden-card fix

**Files:**
- Modify: `lib/parser/dataGaps.ts:420-426` (the `rowDisc` ternary)
- Test: `tests/parser/operatorActionableWarnings.test.ts`

**Interfaces:**
- Consumes: `blockRef.field` (Task 1).
- Produces: `operatorActionableWarnings` keeps same-cell same-index FIELD_UNREADABLE pairs when `field` differs.

- [ ] **Step 1: Failing test** (this pins the latent bug — red BEFORE the fix even with Task 1 landed):

```ts
test("same-member phone+email FIELD_UNREADABLE with one shared anchor BOTH survive (field fold)", () => {
  const base = {
    severity: "warn" as const,
    code: "FIELD_UNREADABLE",
    message: "m",
    sourceCell: { gid: 7, a1: "B9" },
  };
  const ws: ParseWarning[] = [
    { ...base, rawSnippet: "no digits", blockRef: { kind: "crew", index: 2, name: "Jordan", field: "phone" } },
    { ...base, rawSnippet: "no at",     blockRef: { kind: "crew", index: 2, name: "Jordan", field: "email" } },
  ];
  expect(operatorActionableWarnings(ws)).toHaveLength(2);
});

test("legacy field-less pair keeps today's collapse (backward compat)", () => {
  const base = {
    severity: "warn" as const, code: "FIELD_UNREADABLE", message: "m",
    sourceCell: { gid: 7, a1: "B9" },
  };
  const ws: ParseWarning[] = [
    { ...base, rawSnippet: "x", blockRef: { kind: "crew", index: 2, name: "Jordan" } },
    { ...base, rawSnippet: "y", blockRef: { kind: "crew", index: 2, name: "Jordan" } },
  ];
  expect(operatorActionableWarnings(ws)).toHaveLength(1);
});
```

(Adapt `sourceCell` construction to the file's existing anchor fixture helper if one exists.)

- [ ] **Step 2: Run** `pnpm vitest run tests/parser/operatorActionableWarnings.test.ts` — first test FAILS (length 1), second passes.
- [ ] **Step 3: Implement** — in `lib/parser/dataGaps.ts`, extend the FIELD_UNREADABLE branch of `rowDisc`:

```ts
const rowDisc =
  w.code === FIELD_UNREADABLE && w.blockRef?.index != null
    ? `\0${w.blockRef.index}${typeof w.blockRef.field === "string" ? `\0${w.blockRef.field}` : ""}`
    : w.code === "UNKNOWN_ROLE_TOKEN" && typeof w.roleToken === "string"
      ? `\0${w.roleToken}`
      : "";
```

- [ ] **Step 4: Run — both PASS; whole file green.**
- [ ] **Step 5: Commit** `fix(parser): fold blockRef.field into FIELD_UNREADABLE dedup key — same-member phone+email no longer collapses`

### Task 3: Identity fold — shared-report-draft fix

**Files:**
- Modify: `lib/dataQuality/warningIdentity.ts:23-25`
- Test: `tests/dataQuality/warningIdentity.test.ts`

**Interfaces:**
- Consumes: `blockRef.field` (Task 1).
- Produces: distinct `warningIdentityKey` → distinct `buildReportSurfaceId` and suffix-free `stableWarningKeys` for field-bearing pairs.

- [ ] **Step 1: Failing test:**

```ts
test("FIELD_UNREADABLE identity folds blockRef.field; legacy field-less key unchanged", () => {
  const mk = (field?: string): IdentityFields => ({
    code: "FIELD_UNREADABLE",
    sourceCell: { gid: 7, a1: "B9" },
    rawSnippet: "n/a",
    blockRef: { kind: "crew", index: 2, name: "Jordan", ...(field !== undefined ? { field } : {}) },
  });
  expect(warningIdentityKey(mk("phone"))).not.toBe(warningIdentityKey(mk("email")));
  expect(warningIdentityKey(mk())).toBe(warningIdentityKey(mk()));
  // legacy key is byte-identical to the pre-change shape: field absent adds nothing
  expect(warningIdentityKey(mk())).toBe(warningIdentityKey({ ...mk(), blockRef: { kind: "crew", index: 2, name: "Jordan" } }));
  // stableWarningKeys: field-bearing pair needs no occurrence suffix
  const keys = stableWarningKeys([mk("phone"), mk("email")]);
  expect(new Set(keys).size).toBe(2);
  expect(keys[0]).not.toMatch(/#\d+$/);
  expect(keys[1]).not.toMatch(/#\d+$/);
});
```

- [ ] **Step 2: Run** `pnpm vitest run tests/dataQuality/warningIdentity.test.ts` — FAIL (keys equal, suffix used).
- [ ] **Step 3: Implement** — in `warningIdentityKey`, extend the discriminator slot (shared with the roleToken fold; codes are disjoint so the slot cannot collide):

```ts
const rt = w.code === "UNKNOWN_ROLE_TOKEN" && typeof w.roleToken === "string" ? w.roleToken : "";
const fu =
  w.code === "FIELD_UNREADABLE" && typeof w.blockRef?.field === "string" ? w.blockRef.field : "";
return `${w.code}|${cell}|${snippet}|${br}|${rt}${fu}`;
```

(Reusing the tail slot keeps every NON-field key byte-identical — no global key churn; only field-bearing FIELD_UNREADABLE keys change, the deliberate one-time churn the spec §2.1 documents.)

- [ ] **Step 4: Run — PASS.** Also `pnpm vitest run tests/dataQuality/ tests/admin/perShowActionableKeyStability.test.tsx` green.
- [ ] **Step 5: Commit** `fix(admin): fold blockRef.field into FIELD_UNREADABLE warning identity — no shared report surfaceId for phone+email pairs`

### Task 4: Card detail band

**Files:**
- Modify: `components/admin/PerShowActionableWarnings.tsx` (band block near the `rawLabel` logic at lines 199-217, and the `detailBand={...}` prop at 288)
- Test: create tests/components/perShowActionableWarnings.fieldBand.test.tsx (new file)

**Interfaces:**
- Consumes: `blockRef.field/name`, `rawSnippet` via the USABLE rule.
- Produces: `data-testid="per-show-actionable-field-label"` band + `-value` span; `detailBand` slot = `rowLabel band ?? field band`.

- [ ] **Step 1: Failing tests** (new file, header pattern copied from `tests/components/perShowActionableWarnings.autocorrect.test.tsx`: `// @vitest-environment jsdom`, cleanup, RTL render):

```tsx
const fu = (over: Partial<ParseWarning> & { blockRef?: ParseWarning["blockRef"] }): ParseWarning => ({
  severity: "warn", code: "FIELD_UNREADABLE",
  message: "instance message unused by the band",
  rawSnippet: "call the office",
  blockRef: { kind: "crew", index: 2, name: "Jordan Ellis", field: "phone" },
  ...over,
});
const bands = () => screen.getAllByTestId("per-show-actionable-field-label");

test("full mode: phone+email same member render two distinct bands (label + name + quoted value)", () => {
  const items = [fu({}), fu({ rawSnippet: "jordan-at", blockRef: { kind: "crew", index: 2, name: "Jordan Ellis", field: "email" } })];
  render(<PerShowActionableWarnings items={items} driveFileId="df" />);
  const [a, b] = bands();
  // anti-tautology: expectations derive from the fixture fields
  expect(a?.textContent).toBe(`Phone${items[0]!.blockRef!.name} · "${items[0]!.rawSnippet}"`);
  expect(b?.textContent).toBe(`Email${items[1]!.blockRef!.name} · "${items[1]!.rawSnippet}"`);
});

test("condensed: name absent, value present", () => {
  render(<PerShowActionableWarnings items={[fu({})]} driveFileId="df" condensed />);
  const band = bands()[0];
  expect(band?.textContent).toBe(`Phone"call the office"`);
  expect(band?.textContent).not.toContain("Jordan Ellis");
});

// Spec 2.4 guard sweep: every ABSENT class per input; none throws, no dangling separator, no empty quotes
test.each([
  ["missing key", { kind: "crew", index: 2, name: "J" }],
  ["null", { kind: "crew", index: 2, name: "J", field: null }],
  ["empty", { kind: "crew", index: 2, name: "J", field: "" }],
  ["whitespace", { kind: "crew", index: 2, name: "J", field: "   " }],
  ["non-string number", { kind: "crew", index: 2, name: "J", field: 0 }],
  ["non-string object", { kind: "crew", index: 2, name: "J", field: { a: 1 } }],
])("ABSENT field (%s) renders no band", (_label, blockRef) => {
  render(<PerShowActionableWarnings items={[fu({ blockRef: blockRef as never })]} driveFileId="df" />);
  expect(screen.queryByTestId("per-show-actionable-field-label")).toBeNull();
});

test("ABSENT name (full mode) drops the segment, no dangling separator", () => {
  render(<PerShowActionableWarnings items={[fu({ blockRef: { kind: "crew", index: 2, field: "phone" } })]} driveFileId="df" />);
  expect(bands()[0]?.textContent).toBe(`Phone"call the office"`);
});

test("ABSENT rawSnippet drops value + quotes entirely", () => {
  render(<PerShowActionableWarnings items={[fu({ rawSnippet: "   " })]} driveFileId="df" />);
  expect(bands()[0]?.textContent).toBe("PhoneJordan Ellis");
  expect(bands()[0]?.textContent).not.toContain('"');
});

test("non-string name and rawSnippet do not throw on jsonb junk", () => {
  render(<PerShowActionableWarnings items={[fu({ rawSnippet: 42 as never, blockRef: { kind: "crew", index: 2, name: [] as never, field: "phone" } })]} driveFileId="df" />);
  expect(bands()[0]?.textContent).toBe("Phone");
});

test("unknown USABLE field renders trimmed as-is; 200-char junk label carries wrap class", () => {
  const junk = "x".repeat(200);
  render(<PerShowActionableWarnings items={[fu({ blockRef: { kind: "crew", index: 2, name: "J", field: ` ${junk} ` } })]} driveFileId="df" />);
  const label = bands()[0]?.querySelector("span");
  expect(label?.textContent).toBe(junk);
  expect(label?.className).toContain("break-all");
});

test("UNKNOWN_FIELD keeps Sheet row band; never both bands on one card", () => {
  const uf: ParseWarning = { severity: "warn", code: "UNKNOWN_FIELD", message: "m", rawSnippet: "Venue WiFi | pass123" };
  render(<PerShowActionableWarnings items={[uf, fu({})]} driveFileId="df" />);
  const cards = screen.getAllByTestId("per-show-actionable-item");
  expect(within(cards[0]!).queryByTestId("per-show-actionable-row-label")).not.toBeNull();
  expect(within(cards[0]!).queryByTestId("per-show-actionable-field-label")).toBeNull();
  expect(within(cards[1]!).queryByTestId("per-show-actionable-field-label")).not.toBeNull();
  expect(within(cards[1]!).queryByTestId("per-show-actionable-row-label")).toBeNull();
});
```

(`textContent` concatenates the label span and value span with no separator — hence `Phone${name}` with no space in expectations. Visual spacing is flex `gap`, exactly like the existing Sheet-row band.)

- [ ] **Step 2: Run** `pnpm vitest run tests/components/perShowActionableWarnings.fieldBand.test.tsx` — FAIL (testid absent).
- [ ] **Step 3: Implement** — in `PerShowActionableWarnings.tsx`, after the `rowLabel`/`detailBand` block (line ~217), add:

```tsx
// FIELD_UNREADABLE discriminator band (spec 2026-07-23-crewwarn-instance-discriminator §2.2).
// USABLE rule: string + non-empty after trim, rendered trimmed; anything else (null, number,
// object, since the jsonb boundary is unvalidated) is ABSENT. Same shape as warningCardCopyFields.
const usable = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
const fieldRaw = w.code === "FIELD_UNREADABLE" ? usable(w.blockRef?.field) : null;
const fieldLabel =
  fieldRaw === null ? null : fieldRaw === "phone" ? "Phone" : fieldRaw === "email" ? "Email" : fieldRaw;
const bandName = condensed === true ? null : usable(w.blockRef?.name);
const bandValue = usable(w.rawSnippet);
const bandText = [bandName, bandValue !== null ? `"${bandValue}"` : null]
  .filter((s): s is string => s !== null)
  .join(" · ");
const fieldBand: ReactNode = fieldLabel ? (
  <span
    className="inline-flex min-w-0 flex-wrap items-center gap-1.5"
    data-testid="per-show-actionable-field-label"
  >
    <span className="break-all text-[10px] font-semibold tracking-wider text-warning-text uppercase">
      {fieldLabel}
    </span>
    {bandText.length > 0 ? (
      <span
        className="break-all font-mono text-xs text-text"
        data-testid="per-show-actionable-field-label-value"
      >
        {bandText}
      </span>
    ) : null}
  </span>
) : null;
```

and change the card prop: `detailBand={detailBand ?? fieldBand}`.

- [ ] **Step 4: Run — PASS.** Also `pnpm vitest run tests/components/perShowActionableWarnings.autocorrect.test.tsx tests/admin/perShowActionableTransitions.test.tsx tests/components/admin/showpage/` green (no regression on sibling card tests).
- [ ] **Step 5: Commit** `feat(admin): FIELD_UNREADABLE cards carry a context-aware field discriminator band`

### Task 5: Staged surface — band wiring + baseline unchanged

**Files:**
- Test only: extend `tests/components/StagedReviewCard.test.tsx`; run `tests/components/admin/stagedCardBaseline.test.tsx` unmodified

**Interfaces:**
- Consumes: Task 4 band; `StagedRow.operatorActionable` (`components/admin/StagedReviewCard.tsx:151`).

- [ ] **Step 1: Add test** (mirror the file's existing StagedRow fixture builder; router already mocked module-scope):

```tsx
test("staged card renders the full-mode field band for FIELD_UNREADABLE operatorActionable rows", () => {
  const row = baseRow({
    operatorActionable: [{
      severity: "warn", code: "FIELD_UNREADABLE", message: "m", rawSnippet: "call the office",
      blockRef: { kind: "crew", index: 1, name: "Jordan Ellis", field: "phone" },
    }],
  });
  render(<StagedReviewCard row={row} />);
  const band = screen.getByTestId("per-show-actionable-field-label");
  expect(band.textContent).toBe('PhoneJordan Ellis · "call the office"');
});
```

(Adapt `baseRow` to the file's actual fixture helper name and required props.)

- [ ] **Step 2: Run** `pnpm vitest run tests/components/StagedReviewCard.test.tsx` — new test PASSES immediately IF Task 4 landed (this is a wiring pin, not a red-first behavior test — acceptable because the behavior test cycle happened in Task 4; this pins the staged composition).
- [ ] **Step 3: Baseline check:** `pnpm vitest run tests/components/admin/stagedCardBaseline.test.tsx` — PASS with NO snapshot update (fixture has no FIELD_UNREADABLE; spec §2.3). If it demands an update, STOP — that's a spec violation to investigate, not a snapshot to bless.
- [ ] **Step 4: Commit** `test(admin): pin staged-surface field-band wiring; baseline snapshot unchanged`

### Task 6: Eyebrow wrap

**Files:**
- Modify: `components/admin/BulkIgnoreControls.tsx:161`
- Test: extend `tests/components/admin/bulkIgnoreControls.test.tsx`

- [ ] **Step 1: Failing test:**

```tsx
test("eyebrow label wraps instead of truncating (no truncate class)", () => {
  renderGroups(); // file's existing helper that renders BulkIgnoreControls with labeled groups
  const label = screen.getByTestId("dq-group-label-UNKNOWN_FIELD");
  expect(label.className).not.toContain("truncate");
  expect(label.className).toContain("min-w-0");
});
```

- [ ] **Step 2: Run** `pnpm vitest run tests/components/admin/bulkIgnoreControls.test.tsx` — FAIL.
- [ ] **Step 3: Implement** — eyebrow span class at `BulkIgnoreControls.tsx:161` becomes:

```tsx
className="min-w-0 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
```

- [ ] **Step 4: Run — PASS (whole file + `bulkIgnoreControlsTransitionAudit.test.tsx`).**
- [ ] **Step 5: Commit** `fix(admin): group eyebrow wraps at narrow widths instead of ellipsizing`

### Task 7: Real-browser eyebrow spec (390px, idle + armed)

**Files:**
- Create: tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx (new file) (live-bundle entry, pattern: `tests/e2e/_blockedRowResolverLiveEntry.tsx` — React root mount, `AppRouterContext` stub with no-op `refresh`, default `WarningAnnounceContext`)
- Create: tests/e2e/bulk-ignore-eyebrow.layout.spec.ts (new file) (pattern: `tests/e2e/blocked-row-resolver-transitions.spec.ts` — own http server, `pnpm dlx esbuild@0.28.0` bundle, LIVE tree)
- Modify: `tests/e2e/standalone.config.ts:36` — add the bulk-ignore-eyebrow.layout name to the `testMatch` alternation (allow-list; unregistered spec runs nowhere)

**Fixture:** two groups; the FIELD_UNREADABLE group carries `label: "Phone or email we couldn't use"` (the real catalog title — import `MESSAGE_CATALOG.FIELD_UNREADABLE.title` so drift fails the test, not silently passes) and a `bulk` of 2 items; `cards` slot can be a plain placeholder node (the spec measures the eyebrow row, not the cards).

- [ ] **Step 1: Write the spec** (red first — the harness file exists but the config change is what discovers it; assertions in BOTH states):

```ts
for (const state of ["idle", "armed"] as const) {
  test(`390px eyebrow row, ${state}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(harnessUrl);
    await page.waitForSelector('[data-testid="dq-bulk-ignore-FIELD_UNREADABLE"]');
    if (state === "armed") {
      await page.click('[data-testid="dq-bulk-ignore-FIELD_UNREADABLE"]'); // single real click arms the chip
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="dq-bulk-ignore-FIELD_UNREADABLE"]')!.textContent!.startsWith("Confirm"));
    }
    const m = await page.evaluate(() => {
      const eyebrow = document.querySelector('[data-testid="dq-group-label-FIELD_UNREADABLE"]')!;
      const chip = document.querySelector('[data-testid="dq-bulk-ignore-FIELD_UNREADABLE"]')!;
      const row = eyebrow.parentElement!;
      const e = eyebrow.getBoundingClientRect(), c = chip.getBoundingClientRect();
      const ix = Math.min(e.right, c.right) - Math.max(e.left, c.left);
      const iy = Math.min(e.bottom, c.bottom) - Math.max(e.top, c.top);
      return {
        eyebrowClipped: eyebrow.scrollWidth > eyebrow.clientWidth,
        rowOverflow: row.scrollWidth > row.clientWidth,
        overlap: ix > 0.5 && iy > 0.5,
        text: eyebrow.textContent,
      };
    });
    expect(m.eyebrowClipped).toBe(false);       // (a) not ellipsized
    expect(m.rowOverflow).toBe(false);          // (b) no horizontal overflow
    expect(m.overlap).toBe(false);              // (c) eyebrow × chip bboxes disjoint
    expect(m.text).toBe(EXPECTED_TITLE);        // (d) full catalog title present (wrap, not clip)
  });
}
```

- [ ] **Step 2: Register in `standalone.config.ts` testMatch, run** `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts --project=standalone-chromium bulk-ignore-eyebrow` — with Task 6 NOT yet reverted this passes; to honor red-first, run once with the `truncate` class temporarily restored via the harness build of the PRE-Task-6 commit: `git stash` the Task 6 change is NOT required — instead assert red by checking the spec fails against `git stash`-free tree only if Task 6 is unmerged. (Practical order: write spec BEFORE Task 6's Step 3, watch (a)/(d) fail, then land Task 6 and watch it pass. If executing sequentially after Task 6, verify red by temporarily re-adding `truncate` locally, observing (a)+(d) fail, then reverting — note the observation in the commit body.)
- [ ] **Step 3: Commit** `test(admin): real-browser 390px eyebrow wrap + no-overlap spec, idle and armed`

### Task 8: Close-out gates

**Files:** none new (fix-ups only).

- [ ] **Step 1: Full local suite** `pnpm test` — green; `$?` checked (Vitest exits 1 on uncaught errors even with all tests passing — check exit code, not the Tests line).
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm format:check` — green (vitest strips types; eslint pins canonical tailwind; `--no-verify` commits bypassed prettier).
- [ ] **Step 3: Impeccable dual-gate** (invariant 8 — UI surface touched): `/impeccable critique` AND `/impeccable audit` on the diff, canonical v3 setup gates (context.mjs PRODUCT.md + DESIGN.md → register read). P0/P1 fixed or DEFERRED.md-deferred; findings + dispositions recorded in the close-out doc §12.
- [ ] **Step 4: Whole-diff Codex review** (fresh-eyes posture, inline mode if repo-access attempts wedge) to APPROVE.
- [ ] **Step 5:** Update `DEFERRED.md` (graduate both entries to `DEFERRED-archive.md` with resolution provenance), write close-out doc docs/superpowers/plans/2026-07-23-crewwarn-instance-discriminator-closeout.md (new file).
- [ ] **Step 6:** Push, PR, real CI green, `gh pr merge --merge`, fast-forward local main, verify `git rev-list --left-right --count main...origin/main` == `0 0`, CronDelete the nudge job (Stage 4.4 — the ONLY permitted delete site).

## Self-Review Notes

- Spec coverage: §2.1 → Tasks 1-3; §2.2-2.4 → Task 4; §2.3 staged row → Task 5; §2.5 → Task 6; §3 test 6/6b → Tasks 7/4; §2.6/§2.7 → no animation/dimension tasks needed (inventory declares all-instant, no fixed-dimension parent; Task 7 covers the one geometric interaction).
- Type consistency: `usable` local to Task 4; folds in Tasks 2/3 use `typeof ... === "string"` guards (no trim in keys — keys use the raw string; only the BAND trims, per spec: normalization is a render rule, not an identity rule).
- Anti-tautology: Task 4 expectations derive from fixture fields; Task 2's red test pins the bug; Task 7 imports the live catalog title.
