# CREWWARN Instance Discriminator + Eyebrow Wrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Same-code FIELD_UNREADABLE warning cards become visually and identity-distinguishable (context-aware detail band + field-folded dedup/identity keys), and the data-quality group eyebrow wraps instead of truncating at 390px.

**Architecture:** One additive `blockRef.field` write in the parser producer fans out to (a) a new detail band in the shared `PerShowActionableWarnings` card, (b) a FIELD_UNREADABLE fold in the `operatorActionableWarnings` dedup key (fixes a latent hidden-card bug), and (c) a FIELD_UNREADABLE fold in `warningIdentityKey` (fixes a latent shared-report-draft bug). The eyebrow fix is a one-class change in `BulkIgnoreControls`, driven test-first by a live-bundled standalone browser spec.

**Tech Stack:** Next.js 16 / React server components, Vitest + jsdom, Playwright standalone config (`tests/e2e/standalone.config.ts`), esbuild@0.28.0 live-bundle + @tailwindcss/cli 4.2.4 compiled-CSS harness pattern (`tests/e2e/blocked-row-resolver-transitions.spec.ts:35-110`).

**Spec:** `docs/superpowers/specs/2026-07-23-crewwarn-instance-discriminator-design.md` (APPROVED, Codex R3). Spec §1.1 do-not-relitigate list binds every task.

## Global Constraints

- TDD per task: failing test → minimal implementation → passing test → commit (invariant 1). Commit per task, conventional-commits (invariant 6). Every PRODUCTION change is preceded by at least one test observed RED against it; explicitly-identified guard/regression tests (each named in its task's Step 2) legitimately start green and are recorded as guards, not red evidence.
- No catalog / §12.4 edits; no new `code:` literals (spec §1.1 #6).
- IGNORE fingerprint (`warningFingerprint`) untouched (spec §1.1 #5).
- USABLE rule everywhere a band segment renders: `typeof v === "string" && v.trim().length > 0`, render trimmed; anything else ⇒ segment absent; `.trim()` never runs on a non-string (spec §2.2). Render rule only — identity/dedup keys use the raw string untrimmed.
- Separator is `·` never an em-dash; band is non-interactive (no tap-target requirement).
- No mutation surfaces touched → no telemetry registry rows (invariant 10 n/a; re-verify in the final diff).
- Strict tsconfig: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — never assign `undefined` to an optional key; use conditional spread; `as const` on string-literal fixture fields assigned to union-typed properties.
- Meta-test inventory (spec §3 test 7): none created/extended — declared "none applies" because no new Supabase boundary, admin mutation, advisory lock, or catalog code.

## Stage 0 — autonomous-run setup (ALREADY EXECUTED; provenance)

Completed 2026-07-23 in this session BEFORE spec drafting, per the AGENTS.md autonomous-ship gate:

- Worktree `/Users/ericweiss/FX-worktrees/crewwarn-instance-discriminator` created off `origin/main` (c9abd2170) via `git worktree add -b feat/crewwarn-instance-discriminator`.
- `pnpm install` + `pnpm worktree:link-env` (`.env.local` symlink resolves) + `pnpm preflight` → `env ✓ local DB ✓` (known WARN: non-loopback TEST_DATABASE_URL; loopback-guarded DB tests skip locally — none are in this plan's scope).
- Hourly nudge cron REGISTERED: job id `090260d1` (`23 * * * *`), recorded in the worktree ship-state marker (.claude/ship-state.json, gitignored) under cronJobId. Task 7 Step 5's CronDelete refers to THIS job; it is deleted at that step ONLY (Stage 4.4 rule).
- Execution start therefore begins directly at Task 1; re-verify with `pnpm preflight` if the session resumed after a pause.

---

### Task 1: Producer writes `blockRef.field`

**Files:**
- Modify: `lib/parser/warnings.ts:98` (the `emitFieldUnreadable` push)
- Test: `tests/parser/warnings.test.ts`

**Interfaces:**
- Produces: FIELD_UNREADABLE warnings whose `blockRef` is `{ kind, index, name, field: "phone" | "email" }`. Tasks 2–4 rely on `blockRef.field` (Task 5 is independent of it).

- [ ] **Step 1: Write the failing test** — extend the existing `emitFieldUnreadable` describe block in `tests/parser/warnings.test.ts`. The message and rawSnippet contracts are pinned IN FULL for BOTH branches (spec §2.1 "message + rawSnippet unchanged"):

```ts
test("stores the field discriminator on blockRef; message + rawSnippet unchanged (phone and email)", () => {
  const agg = { warnings: [] as ParseWarning[] };
  emitFieldUnreadable(agg as never, {
    section: "crew", field: "phone", rawSnippet: "call me", index: 3, name: "Jordan Ellis",
  });
  emitFieldUnreadable(agg as never, {
    section: "crew", field: "email", rawSnippet: "jordan-at", index: 3, name: "Jordan Ellis",
  });
  expect(agg.warnings[0]?.blockRef).toEqual({ kind: "crew", index: 3, name: "Jordan Ellis", field: "phone" });
  expect(agg.warnings[1]?.blockRef).toEqual({ kind: "crew", index: 3, name: "Jordan Ellis", field: "email" });
  expect(agg.warnings[0]?.rawSnippet).toBe("call me");
  expect(agg.warnings[1]?.rawSnippet).toBe("jordan-at");
  const EM = String.fromCharCode(0x2014); // the producer's em-dash, kept out of this doc's copy scanner
  expect(agg.warnings[0]?.message).toBe(
    `Crew phone for row 4 couldn't be read as a phone number ("call me") ${EM} check the sheet.`,
  );
  expect(agg.warnings[1]?.message).toBe(
    `Crew email for row 4 couldn't be read as an email address ("jordan-at") ${EM} check the sheet.`,
  );
});
```

(The `EM` constant pins the EXISTING producer em-dash at `lib/parser/warnings.ts:93` byte-for-byte; it is not new copy. Match the aggregator construction style already used in that file; if it builds a real `ParseAggregator`, reuse its helper.)

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

- [ ] **Step 1: Failing test** (pins the latent bug — red BEFORE the fix even with Task 1 landed). `code` carries `as const` so the object literal satisfies `ParseWarning` under strict narrowing:

```ts
test("same-member phone+email FIELD_UNREADABLE with one shared anchor BOTH survive (field fold)", () => {
  const base = {
    severity: "warn" as const,
    code: "FIELD_UNREADABLE" as const,
    message: "m",
    sourceCell: { gid: 7, a1: "B9" },
  };
  const ws: ParseWarning[] = [
    { ...base, rawSnippet: "no digits", blockRef: { kind: "crew", index: 2, name: "Jordan", field: "phone" } },
    { ...base, rawSnippet: "no at",     blockRef: { kind: "crew", index: 2, name: "Jordan", field: "email" } },
  ];
  expect(operatorActionableWarnings(ws)).toHaveLength(2);
});

test("fold uses the RAW field string untrimmed: padded vs unpadded field both survive", () => {
  const base = {
    severity: "warn" as const, code: "FIELD_UNREADABLE" as const, message: "m",
    sourceCell: { gid: 7, a1: "B9" },
  };
  const ws: ParseWarning[] = [
    { ...base, rawSnippet: "x", blockRef: { kind: "crew", index: 2, name: "J", field: "phone" } },
    { ...base, rawSnippet: "y", blockRef: { kind: "crew", index: 2, name: "J", field: " phone " } },
  ];
  // Raw-string fold (spec: identity/dedup keys never trim); an implementation that trims would collapse these.
  expect(operatorActionableWarnings(ws)).toHaveLength(2);
});

test("legacy field-less pair keeps today's collapse (backward compat)", () => {
  const base = {
    severity: "warn" as const, code: "FIELD_UNREADABLE" as const, message: "m",
    sourceCell: { gid: 7, a1: "B9" },
  };
  const ws: ParseWarning[] = [
    { ...base, rawSnippet: "x", blockRef: { kind: "crew", index: 2, name: "Jordan" } },
    { ...base, rawSnippet: "y", blockRef: { kind: "crew", index: 2, name: "Jordan" } },
  ];
  expect(operatorActionableWarnings(ws)).toHaveLength(1);
});

test("presence delimiter: field-less vs present-but-empty field are distinct keys (both survive)", () => {
  const base = {
    severity: "warn" as const, code: "FIELD_UNREADABLE" as const, message: "m",
    sourceCell: { gid: 7, a1: "B9" },
  };
  const ws: ParseWarning[] = [
    { ...base, rawSnippet: "x", blockRef: { kind: "crew", index: 2, name: "Jordan" } },
    { ...base, rawSnippet: "y", blockRef: { kind: "crew", index: 2, name: "Jordan", field: "" } },
  ];
  // The NUL delimiter makes "" a PRESENT discriminator; without it this pair aliases and collapses.
  expect(operatorActionableWarnings(ws)).toHaveLength(2);
});
```

(Adapt `sourceCell` construction to the file's existing anchor fixture helper if one exists.)

- [ ] **Step 2: Run** `pnpm vitest run tests/parser/operatorActionableWarnings.test.ts` — RED: the phone/email survival test, the padded-vs-unpadded test, and the presence-delimiter test ALL fail (each collapses to length 1 pre-fix). The legacy-collapse test starts GREEN by design — it is the backward-compat guard, recorded as such.
- [ ] **Step 3: Implement** — in `lib/parser/dataGaps.ts`, extend the FIELD_UNREADABLE branch of `rowDisc` (the bare `FIELD_UNREADABLE` identifier is the existing import at `lib/parser/dataGaps.ts:16` — this snippet edits live code where it is already in scope; no new import):

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
- Produces: distinct `warningIdentityKey` AND distinct `buildReportSurfaceId` (the downstream wiring is asserted, not inferred) plus suffix-free `stableWarningKeys` for field-bearing pairs.

- [ ] **Step 1: Failing test.** The legacy-key check pins the PRE-CHANGE key as a BYTE LITERAL (derived from the current source: `code|gid:a1|normalizedSnippet|kind:index:iso:name|discriminator` with `normalizeSnippet` = trim + whitespace-collapse, `lib/dataQuality/ignorableSnippet.ts:3-5`) — not a self-comparison:

```ts
import { warningIdentityKey, stableWarningKeys, type IdentityFields } from "@/lib/dataQuality/warningIdentity";
import { buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";

test("FIELD_UNREADABLE identity folds blockRef.field; legacy field-less key is byte-identical to today's shape", () => {
  const mk = (field?: string): IdentityFields => ({
    code: "FIELD_UNREADABLE",
    sourceCell: { gid: 7, a1: "B9" },
    rawSnippet: "n/a",
    blockRef: { kind: "crew", index: 2, name: "Jordan", ...(field !== undefined ? { field } : {}) },
  });
  // Byte-literal pin of the PRE-change key format for a field-less warning. If the
  // implementation changes the shared shape (e.g. appends a new "|" slot), this fails.
  expect(warningIdentityKey(mk())).toBe("FIELD_UNREADABLE|7:B9|n/a|crew:2::Jordan|");
  expect(warningIdentityKey(mk("phone"))).not.toBe(warningIdentityKey(mk("email")));
  // RAW fold, presence-delimited: empty, whitespace, and padded fields are each distinct
  // from the field-less key AND from each other (an implementation that trims, or that
  // appends without a presence delimiter, fails one of these).
  const legacy = warningIdentityKey(mk());
  const variants = [mk(""), mk(" "), mk("phone"), mk(" phone ")].map(warningIdentityKey);
  expect(new Set([legacy, ...variants]).size).toBe(5);
  // Downstream wiring: report surfaceIds diverge too (spec 2.1, no shared report draft).
  expect(buildReportSurfaceId("showx", mk("phone"))).not.toBe(buildReportSurfaceId("showx", mk("email")));
  // stableWarningKeys: field-bearing pair needs no occurrence suffix.
  const keys = stableWarningKeys([mk("phone"), mk("email")]);
  expect(new Set(keys).size).toBe(2);
  expect(keys[0]).not.toMatch(/#\d+$/);
  expect(keys[1]).not.toMatch(/#\d+$/);
});
```

(Confirm the file has no `@vitest-environment jsdom` pragma — `buildReportSurfaceId` is SERVER-ONLY via node:crypto and needs the node environment. `tests/dataQuality/warningIdentity.test.ts` currently runs in node; keep it that way.)

- [ ] **Step 2: Run** `pnpm vitest run tests/dataQuality/warningIdentity.test.ts` — FAIL: byte-literal passes but `mk("phone")`/`mk("email")` keys are EQUAL (and surfaceIds equal, suffix used). If the byte-literal itself fails, STOP — the derived format is wrong; fix the literal against the real output BEFORE any production change, since it documents the pre-change contract.
- [ ] **Step 3: Implement** — in `warningIdentityKey`, extend the discriminator slot (shared with the roleToken fold; codes are disjoint so the slot cannot collide, and every non-FIELD_UNREADABLE / field-less key stays byte-identical):

```ts
const rt = w.code === "UNKNOWN_ROLE_TOKEN" && typeof w.roleToken === "string" ? w.roleToken : "";
// NUL presence delimiter: a PRESENT-but-empty field stays distinct from a
// field-less legacy warning (""), mirroring Task 2's NUL-delimited dedup fold; the
// field is folded untrimmed via injective JSON.stringify (identity never normalizes).
const fu =
  w.code === "FIELD_UNREADABLE" && typeof w.blockRef?.field === "string"
    ? `\0F${JSON.stringify(w.blockRef.field)}`
    : "";
return `${w.code}|${cell}|${snippet}|${br}|${rt}${fu}`;
```

> **AMENDED 2026-07-24 (whole-diff review R1).** The snippet above originally folded the RAW field (`` `\0F${w.blockRef.field}` ``). That shape is NUL-forgeable: `blockRef.name` crosses the unvalidated jsonb boundary raw, so a name carrying a literal NUL could fake the presence marker and collide two distinct (name, field) keys — recreating the shared-surfaceId bug this task fixes. Shipped shape (as now shown above): `` `\0F${JSON.stringify(w.blockRef.field)}` `` — JSON output contains no raw NUL, making the delimiter unforgeable while field-less legacy keys stay byte-identical. A NUL-forgery regression test (the exact collision pair + a present-vs-absent forgery pair) lives in `tests/dataQuality/warningIdentity.test.ts`. Do NOT re-implement the raw fold from an earlier revision of this plan.

- [ ] **Step 4: Run — PASS.** Also `pnpm vitest run tests/dataQuality/ tests/admin/perShowActionableKeyStability.test.tsx` green.
- [ ] **Step 5: Commit** `fix(admin): fold blockRef.field into FIELD_UNREADABLE warning identity — no shared report surfaceId for phone+email pairs`

### Task 4: Card detail band (all surfaces, staged included)

**Files:**
- Modify: `components/admin/PerShowActionableWarnings.tsx` (band block near the `rawLabel` logic at lines 199-217, and the `detailBand={...}` prop at 288)
- Test: create tests/components/perShowActionableWarnings.fieldBand.test.tsx (new file); extend `tests/components/StagedReviewCard.test.tsx`
- Verify-only: `tests/components/admin/stagedCardBaseline.test.tsx` (run unmodified — snapshot must NOT change)

**Interfaces:**
- Consumes: `blockRef.field/name`, `rawSnippet` via the USABLE rule.
- Produces: `data-testid="per-show-actionable-field-label"` band + `per-show-actionable-field-name` span (full/staged mode, amended R2) + `per-show-actionable-field-label-value` span (quoted value ONLY); `detailBand` slot = `rowLabel band ?? field band`. The staged-surface wiring test lives HERE so it is written red-first in the same TDD cycle as the band itself.

> **AMENDED 2026-07-24 (whole-diff review R2).** This task's original snippets joined name + value into ONE value span (`.join(" · ")`). That renders two DISTINCT warnings identically when sheet data carries middot-and-quote sequences (a name or raw value embedding the separator glyph plus straight quotes). Shipped shape: name and value in SEPARATE spans. Name span `min-w-0 text-xs break-words text-text` with testid `per-show-actionable-field-name`; `aria-hidden` middot span `text-xs text-text-subtle` only when both present; value span `font-mono text-xs break-all text-text` holding exactly the quoted trimmed value. See spec §2.2 (amended) and `components/admin/PerShowActionableWarnings.tsx` as shipped; regression test "delimiter-bearing name/value pairs stay distinguishable" in `tests/components/perShowActionableWarnings.fieldBand.test.tsx`. The joined-string snippets below are retained as the historical execution record: do NOT re-implement them. Whole-band `textContent` pins changed accordingly (separator span + CSS gap, no joiner spaces).

- [ ] **Step 1: Failing tests.** New file header pattern copied from `tests/components/perShowActionableWarnings.autocorrect.test.tsx` (`// @vitest-environment jsdom`, cleanup, RTL render):

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

// Spec 2.4 guard sweep: FULL per-input ABSENT matrix (missing / null / "" / whitespace /
// non-string) for each of the three inputs; none throws, no dangling separator, no empty quotes.
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

test.each([
  ["missing key", { kind: "crew", index: 2, field: "phone" }],
  ["null", { kind: "crew", index: 2, name: null, field: "phone" }],
  ["empty", { kind: "crew", index: 2, name: "", field: "phone" }],
  ["whitespace", { kind: "crew", index: 2, name: "   ", field: "phone" }],
  ["non-string array", { kind: "crew", index: 2, name: [], field: "phone" }],
])("ABSENT name (%s, full mode) drops the segment, no dangling separator", (_label, blockRef) => {
  render(<PerShowActionableWarnings items={[fu({ blockRef: blockRef as never })]} driveFileId="df" />);
  expect(bands()[0]?.textContent).toBe(`Phone"call the office"`);
});

// Builder thunks so the "missing key" case is TRUE property omission (destructure-drop),
// never an explicit `rawSnippet: undefined` (exactOptionalPropertyTypes forbids that shape).
const dropSnippet = (): ParseWarning => {
  const { rawSnippet: _omit, ...rest } = fu({});
  return rest as ParseWarning;
};
test.each([
  ["missing key", dropSnippet],
  ["null", () => fu({ rawSnippet: null as never })],
  ["empty", () => fu({ rawSnippet: "" })],
  ["whitespace", () => fu({ rawSnippet: "   " })],
  ["non-string number", () => fu({ rawSnippet: 42 as never })],
])("ABSENT rawSnippet (%s) drops value + quotes entirely", (_label, build) => {
  render(<PerShowActionableWarnings items={[build()]} driveFileId="df" />);
  expect(bands()[0]?.textContent).toBe("PhoneJordan Ellis");
  expect(bands()[0]?.textContent).not.toContain('"');
});

test("junk name + junk rawSnippet with a valid field renders the label alone, no throw", () => {
  render(<PerShowActionableWarnings items={[fu({ rawSnippet: 42 as never, blockRef: { kind: "crew", index: 2, name: [] as never, field: "phone" } })]} driveFileId="df" />);
  expect(bands()[0]?.textContent).toBe("Phone");
});

test("padded known field maps to its label; padded name/value render trimmed; value testid pinned", () => {
  const items = [fu({ rawSnippet: "  call the office  ", blockRef: { kind: "crew", index: 2, name: "  Jordan Ellis  ", field: " phone " } })];
  render(<PerShowActionableWarnings items={items} driveFileId="df" />);
  // trim happens BEFORE the label mapping (" phone " renders Phone, not the raw string)
  // and the value span testid is asserted directly, not via band textContent alone
  const value = screen.getByTestId("per-show-actionable-field-label-value");
  expect(value.textContent).toBe(`Jordan Ellis · "call the office"`);
  expect(bands()[0]?.textContent).toBe(`PhoneJordan Ellis · "call the office"`);
});

test("stray blockRef.field on a non-FIELD_UNREADABLE code renders no field band (code gate)", () => {
  const stray: ParseWarning = {
    severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "m", rawSnippet: "MYSTERY",
    blockRef: { kind: "unknown_section", field: "phone" },
  };
  render(<PerShowActionableWarnings items={[stray]} driveFileId="df" />);
  expect(screen.queryByTestId("per-show-actionable-field-label")).toBeNull();
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

AND in `tests/components/StagedReviewCard.test.tsx` (router already mocked module-scope there; adapt the fixture builder name):

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

(`textContent` concatenates the label span and value span with no separator — hence `Phone${name}` with no space in expectations. Visual spacing is flex `gap`, exactly like the existing Sheet-row band.)

- [ ] **Step 2: Run** `pnpm vitest run tests/components/perShowActionableWarnings.fieldBand.test.tsx tests/components/StagedReviewCard.test.tsx` — the run is RED: every POSITIVE band test (full-mode, condensed, padded/label-mapping, value-testid, junk-label, staged wiring, and the field-band half of the exclusivity test) FAILS with the testid absent. Two groups start GREEN by design and are recorded as such: the six ABSENT-field cases and the stray-code gate (both assert the band's absence, true before the band exists). Every OTHER case fails — including the ABSENT-name and ABSENT-rawSnippet sweeps and the junk-name+junk-snippet valid-field case, whose expectations require a rendered band with partial content (that group includes the junk-name+junk-snippet valid-field case). Existing StagedReviewCard tests stay green.
- [ ] **Step 3: Implement** — in `PerShowActionableWarnings.tsx`, after the `rawLabel`/`detailBand` block (line ~217), add:

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

- [ ] **Step 4: Run — all new tests PASS.** Then the no-regression + baseline sweep:
  - `pnpm vitest run tests/components/perShowActionableWarnings.autocorrect.test.tsx tests/admin/perShowActionableTransitions.test.tsx tests/components/admin/showpage/` — green.
  - `pnpm vitest run tests/components/admin/stagedCardBaseline.test.tsx` — PASS with NO snapshot update (fixture `MAPPED_WARNINGS` has no FIELD_UNREADABLE, `tests/helpers/warningSurfaceFixture.ts:88-91`; spec §2.3). If it demands an update, STOP — that's a spec violation to investigate, not a snapshot to bless.
- [ ] **Step 5: Commit** `feat(admin): FIELD_UNREADABLE cards carry a context-aware field discriminator band`

### Task 5: Eyebrow wrap, browser-spec-first

**Files:**
- Create: tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx (new file — live-bundle entry, pattern: `tests/e2e/_blockedRowResolverLiveEntry.tsx`: React root mount, `AppRouterContext` stub with no-op `refresh`, default `WarningAnnounceContext`)
- Create: tests/e2e/bulk-ignore-eyebrow.layout.spec.ts (new file — pattern: `tests/e2e/blocked-row-resolver-transitions.spec.ts`: own http server; `pnpm dlx esbuild@0.28.0` bundles the entry; **CSS is REAL production Tailwind** — `pnpm dlx @tailwindcss/cli@4.2.4 -i entry.css -o out.css` where entry.css = `@source "components/admin/BulkIgnoreControls.tsx"` prepended to a copy of `app/globals.css`, exactly the mechanism at `tests/e2e/blocked-row-resolver-transitions.spec.ts:99-110`; the page `<head>` links out.css so `truncate`/`min-w-0`/flex utilities actually apply and the red run is meaningful)
- Modify: `tests/e2e/standalone.config.ts:36` — add the bulk-ignore-eyebrow.layout name to the `testMatch` alternation (allow-list; an unregistered spec runs nowhere)
- Modify: `components/admin/BulkIgnoreControls.tsx:161` (the fix — LAST, after red is observed)
- Test: extend `tests/components/admin/bulkIgnoreControls.test.tsx` (class pin, also red-first)

**Fixture:** two groups; the FIELD_UNREADABLE group carries the REAL catalog title as `label` (import `MESSAGE_CATALOG.FIELD_UNREADABLE.title` in the HARNESS so the rendered label is live) and a `bulk` of 2 items; `cards` slot is a plain placeholder node (the spec measures the eyebrow row, not the cards).

- [ ] **Step 1: Write the browser spec + harness + config registration.** Assertions in BOTH chip states. `EXPECTED_TITLE` is an INDEPENDENT byte literal in the SPEC file (not read from the catalog) so catalog drift fails assertion (d) rather than moving both sides:

```ts
const EXPECTED_TITLE = "Phone or email we couldn't use"; // independent pin of MESSAGE_CATALOG.FIELD_UNREADABLE.title

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
    expect(m.eyebrowClipped).toBe(false);       // (a) not ellipsized: THE red assertion pre-fix
    expect(m.rowOverflow).toBe(false);          // (b) no horizontal overflow
    expect(m.overlap).toBe(false);              // (c) eyebrow x chip bboxes disjoint
    expect(m.text).toBe(EXPECTED_TITLE);        // (d) catalog-drift pin; NOT expected red pre-fix (ellipsis clips paint, not textContent)
  });
}
```

AND the jsdom class pin in `tests/components/admin/bulkIgnoreControls.test.tsx`:

```tsx
test("eyebrow label wraps instead of truncating (no truncate class)", () => {
  renderGroups(); // file's existing helper that renders BulkIgnoreControls with labeled groups
  const label = screen.getByTestId("dq-group-label-UNKNOWN_FIELD");
  expect(label.className).not.toContain("truncate");
  expect(label.className).toContain("min-w-0");
});
```

- [ ] **Step 2: Observe RED with production code UNCHANGED** (`truncate` still live):
  - `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts --project=standalone-chromium bulk-ignore-eyebrow` — FAILS on (a) `eyebrowClipped === true` (both states). (b)/(c)/(d) may pass pre-fix; (a) is the red evidence.
  - `pnpm vitest run tests/components/admin/bulkIgnoreControls.test.tsx` — new class test FAILS.
- [ ] **Step 3: Implement** — eyebrow span class at `BulkIgnoreControls.tsx:161` becomes:

```tsx
className="min-w-0 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
```

- [ ] **Step 4: Re-run both commands — ALL PASS** (plus `pnpm vitest run tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx` green).
- [ ] **Step 5: Commit** `fix(admin): group eyebrow wraps at 390px instead of ellipsizing — real-browser idle+armed spec`

### Task 6: Close-out docs

**Files:**
- Modify: `DEFERRED.md` (graduate `CREWWARN-INSTANCE-DISCRIMINATOR-1` + `CREWWARN-INCARD-MOBILE-EYEBROW-1` to `DEFERRED-archive.md` with resolution provenance; update the "Last reconciled" line)
- Modify: `DEFERRED-archive.md` (receive both full entries)
- Create: docs/superpowers/plans/2026-07-23-crewwarn-instance-discriminator-closeout.md (new file — §12 holds impeccable findings + dispositions, filled during Task 7; refuted-claims ledger for review rounds)

- [ ] **Step 1:** Write the graduation + archive entries + close-out skeleton (scope, task→commit table, review-round ledger covering EVERY adversarial round of both documents through their approvals — spec rounds R1 through its APPROVE, plan rounds R1 through its APPROVE — with each finding's disposition; the ledger is appended, not frozen, if later rounds occur).
- [ ] **Step 2:** `pnpm format:check` on the touched markdown (prettier rules apply to tracked md; never prettier the master spec).
- [ ] **Step 3: Commit** `docs: graduate CREWWARN discriminator + eyebrow deferrals; close-out ledger`

### Task 7: Gates, review, ship

**Files:**
- Modify: docs/superpowers/plans/2026-07-23-crewwarn-instance-discriminator-closeout.md (§12 impeccable findings + dispositions; review-round ledger updates)
- Modify (conditional): `DEFERRED.md` (only if an impeccable P0/P1 is explicitly deferred), any source file a gate finding requires — each fix-up committed via the Step 3 loop.

- [ ] **Step 1: Full local verification** — `pnpm test` (check `$?`, not the Tests line — Vitest exits 1 on uncaught errors with all tests passing), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, plus the standalone browser spec from Task 5. All green.
- [ ] **Step 2: Impeccable dual-gate** (invariant 8 — UI surface touched): `/impeccable critique` AND `/impeccable audit` on the diff, canonical v3 setup gates (context.mjs PRODUCT.md + DESIGN.md → register read). P0/P1 fixed or DEFERRED.md-deferred; findings + dispositions recorded in the close-out doc §12 — ALWAYS, including an explicit "no findings" entry when both gates pass clean — and that §12 update is COMMITTED (`docs: impeccable dual-gate dispositions`) before Step 4 dispatches.
- [ ] **Step 3: Fix-up loop (applies to Steps 2 and 4):** after ANY fix-up edit — commit it (`fix(admin): <finding>` / `docs: <disposition>`), then RE-RUN Step 1 in full, AND — if the fix touched any UI file (invariant-8 surface set: `app/` non-api, `components/`, globals/tokens/DESIGN.md) — RE-RUN Step 2's impeccable dual-gate on the updated diff and refresh the close-out §12 dispositions BEFORE advancing. Only then (re)dispatch Step 4. Invariant 8 binds the FINAL UI diff, not the first one reviewed; the sequence never advances on an uncommitted, unverified, or un-recritiqued tree.
- [ ] **Step 4: Whole-diff Codex review** (fresh-eyes posture; inline mode if repo-access attempts wedge) over the COMPLETE branch diff INCLUDING Task 6's docs edits and any Step 2 fix-ups, to APPROVE. Findings → Step 3 loop → re-dispatch. On APPROVE: append the final verdict to the close-out review ledger and COMMIT it (`docs: whole-diff review APPROVE ledger entry`) — Step 5 never starts from an uncommitted or stale close-out document.
- [ ] **Step 5: Ship** — push, PR, real CI green (merge-ref rebuilt if behind main), `gh pr merge --merge`, fast-forward local main, verify `git rev-list --left-right --count main...origin/main` == `0 0`, CronDelete the nudge job (Stage 4.4 — the ONLY permitted delete site).

## Self-Review Notes

- Spec coverage: §2.1 → Tasks 1-3 (incl. buildReportSurfaceId wiring pin); §2.2-2.4 → Task 4 (full ABSENT matrix per input); §2.3 staged row → Task 4 (red-first staged wiring + baseline-unchanged check); §2.5 + §3 test 6 → Task 5 (browser spec red BEFORE the class change, real compiled Tailwind); §3 test 6b → Task 4 junk-label test; §2.6/§2.7 → no animation/dimension tasks needed (all-instant inventory, no fixed-dimension parent; Task 5 covers the armed-width geometric interaction).
- TDD ordering: every test lands red before its production change (Task 4 staged test red against missing band; Task 5 browser+class tests red against live `truncate`).
- Type consistency: `usable` local to Task 4; folds in Tasks 2/3 use `typeof ... === "string"` guards on the RAW string (render-side trims, identity-side does not — spec §2.2 note); `as const` on `code` fixture fields.
- Anti-tautology: Task 3 pins the legacy key as a byte literal and the surfaceId divergence; Task 5 pins the title as an independent literal in the spec file; Task 4 expectations derive from fixture fields.
