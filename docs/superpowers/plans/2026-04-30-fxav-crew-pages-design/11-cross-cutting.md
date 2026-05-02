# Cross-cutting tasks (AC-X.1..X.6)

> Part of [the FXAV crew pages design plan](README.md).

Spec context: §17.2.

### Task X.1: No orphan error codes — three-way §12.4 parity (AC-X.1)

**Files:** Test: `tests/cross-cutting/codes.test.ts`. Build: `scripts/extract-spec-codes.ts`.

**Spec-driven.** Earlier draft compared source to `lib/messages/catalog.ts` keys. That's two-way (source ↔ catalog) but not spec-anchored — if `catalog.ts` drifts from §12.4 (Doug-facing copy edited, ID renamed), the test goes green while users see stale or wrong copy. The corrected design treats **§12.4 as the authoritative input** and asserts three-way parity: spec code ↔ catalog key ↔ at least one producer site ↔ at least one renderer that uses catalog copy via the lookup helper (not interpolated raw IDs).

- [ ] **Step 1: Build a §12.4 extractor** — `scripts/extract-spec-codes.ts` parses the canonical messages section in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` and emits a typed manifest with active codes AND retired codes separately classified.

  **SPEC_CODES carries the FULL §12.4 row payload — not just `audience`/`copy`.** Earlier draft collapsed each code to a 2-field shape `{ audience, copy }`, and the parity test (Step 2) only compared `Object.keys`. That proves IDs match but says nothing about the actual user-facing copy in each column — a row whose `dougFacing` was edited in §12.4 but never propagated to `catalog.ts` would still pass the keys-only check. The corrected extractor emits every column the spec defines: `dougFacing`, `crewFacing`, `followUp`, and `helpfulContext` — verbatim from §12.4 — and the parity test (Step 2 below) deep-compares each catalog entry against `SPEC_CODES[code]` field-by-field. The duplicate-active-code dedup invariant uses the FULL row payload as its key, so duplicate rows with identical content remain detectable separately from duplicate rows whose copy diverges.

  ** Fix 1 amendment: extractor reads `helpfulContext` from the §12.4 YAML appendix.** The spec's §12.4 markdown table carries `dougFacing` / `crewFacing` / `followUp` (the four-column visual table). The fifth field `helpfulContext` lives in a structured YAML block immediately following the table, anchored by the HTML comment `<!-- §12.4 helpfulContext appendix -->` (see spec §12.4). The extractor parses BOTH sources:
  1. **Markdown table parser**: walks the `| Code | .. | Doug-facing message | Crew-facing message | Follow-up |` table, extracts non-retired rows (rejects `~~strikethrough~~` rows into a separate `RETIRED_CODES` set), normalizes `—` / `n/a` / empty cells to `null`, emits `{ dougFacing, crewFacing, followUp }` per code. Header rows (e.g., `**Auth — signed-link redemption**` with empty data cells) are skipped.
  2. **YAML appendix parser**: locates the fenced ```yaml block after the `<!-- §12.4 helpfulContext appendix -->`HTML comment, parses with the`yaml`package, emits a`{ [code]: helpfulContext }`mapping. A missing key is normalized to`helpfulContext: null`(admin-log-only codes whose`dougFacing` is null are intentionally absent from the appendix).
  3. **Merge + invariant checks**: - For every code from (1) whose `dougFacing` is non-null, (2) MUST have a non-null, non-empty entry. Mismatch fails extraction with `§12.4 helpfulContext appendix missing entry for code <X> (dougFacing is non-null)`.
     - For every code in (2), it MUST appear in (1) — orphan YAML keys fail extraction with `§12.4 helpfulContext appendix references unknown code <X>`.
     - For every code from (1) whose `dougFacing` is null, (2) MUST omit the key — a YAML entry for an admin-log-only code fails extraction with `§12.4 helpfulContext appendix has entry for code <X> whose dougFacing is null (admin-log-only codes never surface to Doug — remove the YAML entry)`.
     - ** — em-dash sentinel discipline**: the table parser MUST recognize `—` (em-dash), empty cell, and the `(admin log only ...)` parenthetical preamble as the canonical null markers per spec §12.4 Conventions; pseudo-null sentinel text (`null`, `none`, `n/a`, prose like "no Doug-facing message" without an em-dash) fails extraction with `§12.4 row uses pseudo-null sentinel '<X>' for code <Y>; use '—' (em-dash) or empty cell per §12.4 Conventions`. This protects the invariant above from misclassifying genuine admin-log-only rows as Doug-facing (which would then incorrectly demand a YAML entry).
     - ** — Task 10.9 messageFor coverage cross-check**: after extraction succeeds, for every code that appears as the literal first argument to a `messageFor(<code>, ...).dougFacing` call site in plan Task 10.9's renderer (or any §9.0.1 `<ErrorExplainer code="<X>" />`), the extractor cross-checks that `<code>` has a non-null `helpfulContext` entry in the YAML appendix. A `messageFor(<X>).dougFacing` call site for a code missing from the YAML fails extraction with `§12.4 helpfulContext appendix missing entry for <X>; the code is rendered to Doug via messageFor at <fileName>:<line> but has no helpfulContext for the <ErrorExplainer> link to render`. This is the symmetric guard against the finding-4 omission shape: UNKNOWN_FIELD, PULL_SHEET_PARSE_PARTIAL, and WIZARD_ISOLATION_INDEXES_MISSING all had non-null Doug-facing copy in the table but were absent from the YAML; the X.1 cross-check ensures the next such omission fails the build instead of shipping silently.
  4. Final emit: `SPEC_CODES[code] = { dougFacing, crewFacing, followUp, helpfulContext }` with all four fields populated from the merged sources.

  Required regression-test fixtures for the extractor (`tests/cross-cutting/fixtures/extract-spec-codes/`):
  - `bad-missing-helpful-context.md`: synthetic spec excerpt where the table has a code with non-null dougFacing but the YAML appendix omits it — extractor MUST throw with the missing-entry message.
  - `bad-orphan-yaml-key.md`: YAML appendix has an entry for a code that doesn't appear in the table — extractor MUST throw with the unknown-code message.
  - `bad-yaml-entry-for-null-dougfacing.md`: YAML appendix has an entry for a code whose table `dougFacing` is `—` (admin-log-only) — extractor MUST throw with the admin-log-only message.
  - `good-complete.md`: every code with non-null dougFacing has a YAML entry; admin-log-only codes have no entry — extractor MUST succeed and emit four-field `SPEC_CODES`.

  ```ts
  // Output: lib/messages/__generated__/spec-codes.ts (committed, regenerated by CI)

  // Per-row payload — every column from §12.4. Schema MUST match the catalog's row shape exactly so
  // the deep-compare parity test can assert byte-for-byte equality. `null` is the canonical "—" / "n/a"
  // marker; the extractor normalizes "—" / "n/a" / empty cells to `null`. `helpfulContext` is the
  // column added by Fix 4's spec amendment; codes whose `dougFacing` is null don't
  // need `helpfulContext` (they're admin-log only and never reach Doug's UI).
  export type SpecCodePayload = {
    dougFacing: string | null;
    crewFacing: string | null;
    followUp: string | null;
    helpfulContext: string | null; // column; non-null when dougFacing is non-null
  };

  export const SPEC_CODES: Record<string, SpecCodePayload> = {
    LINK_NO_CREW_MATCH: {
      dougFacing: null,
      crewFacing: "You've been removed from this show. Contact Doug if this is a mistake.",
      followUp: null,
      helpfulContext: null,
    },
    LINK_VERSION_MISMATCH: {
      dougFacing: null,
      crewFacing: "This link is out of date. Ask Doug for a new link.",
      followUp: null,
      helpfulContext: null,
    },
    AMBIGUOUS_EMAIL_BINDING: {
      dougFacing: "We can't tell which crew member is signing in — two emails are the same.",
      crewFacing: "We can't sign you in right now. Doug has been alerted.",
      followUp: "Fix the duplicate email in your sheet, then re-sync.",
      helpfulContext:
        "When two people on the crew list share the same email address, we can't safely tell who's logging in...",
    },
    /* ...every ACTIVE code in §12.4 with all four columns verbatim.. */
  } as const;

  // Retired codes — the spec marks rows with `~~CODE~~` (markdown strikethrough) when a code is
  // retired in favor of a canonical replacement. The extractor classifies struck-through rows
  // separately and emits an inverse invariant: no producer, no renderer, no scenario.
  export const RETIRED_CODES = {
    WATCH_CHANNEL_CREATE_FAILED: { replacedBy: "WATCH_CHANNEL_ORPHANED", retiredInRound: 44 },
    /* ...every retired code.. */
  } as const;
  ```

  The generator parses the markdown table rows in §12.4. Rows whose code cell is wrapped in `~~...~~` are retired; rows without strikethrough are active. The generator fails CI if a row is malformed OR if an active row's code appears in `RETIRED_CODES` (active + retired exclusivity) **OR if the same active code appears in two different rows whose FULL payload differs**. A flat object keyed by code silently last-write-wins on duplicate keys; the corrected extractor explicitly fails when two active rows share the same code AND any column differs. Required test: synthesize a spec with two active `SHEET_UNAVAILABLE` rows whose Doug/crew copy differs; assert the extractor throws `SPEC_DUPLICATE_ACTIVE_CODE` with both row line numbers AND a column-by-column diff in the error message.

- [ ] **Step 2: Code-to-scenario registry.** AC-X.1 requires every code to be reachable from at least one fixture or synthesized scenario. Earlier draft only proved string-literal existence in source — that lets dead branches and unused producer code paths satisfy the test. The grep for `messageFor('CODE')` literals also clashes with the realistic dynamic-rendering pattern `messageFor(error.code)` where `error.code` is a runtime variable. The corrected design uses a typed registry that maps every spec code to at least one named test that drives the production path:

  ```ts
  // tests/cross-cutting/code-scenarios.ts — committed file, one entry per §12.4 code.
  // Failing the build is intentional when a new §12.4 code lacks a scenario.
  export const CODE_SCENARIOS: Record<keyof typeof SPEC_CODES, => Promise<void>> = {
    LINK_NO_CREW_MATCH: => scenarios.crewRemovedThenSessionValidated,
    LINK_VERSION_MISMATCH: => scenarios.linkSessionWithStaleVersion,
    LINK_REVOKED_FLOOR: => scenarios.linkSessionBelowRevokedFloor,
    LINK_REVOKED_SURGICAL: => scenarios.linkSessionExactRevokedRow,
    SESSION_IDLE_TIMEOUT: => scenarios.linkSessionPastIdle,
    SESSION_ABSOLUTE_TIMEOUT: => scenarios.linkSessionPastAbsolute,
    LEAKED_LINK_DETECTED: => scenarios.tQueryParamCurrentTokenLeak,
    GOOGLE_NO_CREW_MATCH: => scenarios.googleSessionNoCrewMatch,
    AMBIGUOUS_EMAIL_BINDING: => scenarios.googleSessionDuplicateEmailCollision,
    /* …every §12.4 code maps to a named scenario. Compile fails if a code is missing or extra. */
  };
  ```

  ```ts
  it("AC-X.1 three-way parity: every §12.4 code maps to spec ↔ catalog ↔ scenario", (async) => {
    const specCodes = Object.keys(SPEC_CODES);
    const catalogKeys = Object.keys(catalog);
    const scenarioKeys = Object.keys(CODE_SCENARIOS);

    // **: deep-compare every catalog entry against SPEC_CODES[code] field-by-field.**
    // Earlier draft only compared Object.keys; that proved IDs match but said nothing about whether
    // the actual user-facing copy in each column matches. The corrected assertion verifies key parity
    // AND every column's value verbatim, so a row whose `dougFacing` was edited in §12.4 but never
    // propagated to `catalog.ts` fails immediately.
    expect(catalogKeys.sort).toEqual(specCodes.sort); // catalog == spec keys
    expect(scenarioKeys.sort).toEqual(specCodes.sort); // scenario registry covers every code

    // Field-by-field deep-compare for every catalog entry .
    for (const code of specCodes) {
      const specRow = SPEC_CODES[code];
      const catalogRow = catalog[code];
      expect(catalogRow.dougFacing, `catalog ${code}.dougFacing differs from §12.4`).toEqual(
        specRow.dougFacing,
      );
      expect(catalogRow.crewFacing, `catalog ${code}.crewFacing differs from §12.4`).toEqual(
        specRow.crewFacing,
      );
      expect(catalogRow.followUp, `catalog ${code}.followUp differs from §12.4`).toEqual(
        specRow.followUp,
      );
      expect(
        catalogRow.helpfulContext,
        `catalog ${code}.helpfulContext differs from §12.4`,
      ).toEqual(specRow.helpfulContext);
    }

    for (const [code, runScenario] of Object.entries(CODE_SCENARIOS)) {
      // Drive the production path — assert the code is actually emitted in the structured log/response/admin_alerts row.
      const observed = await captureEmittedCodes(runScenario);
      expect(observed, `scenario for ${code} did not emit it`).toContain(code);
    }
    // Reverse: no orphan literals (codes in source not in spec).
    const sourceCodes = await extractAllCodeLiteralsFromSource;
    for (const c of sourceCodes) {
      expect(specCodes, `orphan code in source: ${c} not in §12.4`).toContain(c);
    }
  });
  ```

  This catches:
  - Codes with no producer (compile fails — registry missing the entry).
  - Codes with a producer but no actual reachability (scenario runs but doesn't emit the code).
  - Drift where catalog disagrees with spec at the **column-value level**.
  - Orphan codes in source that aren't in §12.4 (reverse assertion fails).
  - **Retired-code resurrection**: an inverse-invariant test asserts NO source file across **every renderable surface** (TSX components included) references any code in `RETIRED_CODES`. Earlier draft scanned only `lib/**/*.ts`, `app/**/*.ts`, `middleware.ts` — that excluded `components/**/*.tsx` where retired codes can reappear in JSX strings:
    ```ts
    it("AC-X.1 retired §12.4 codes have no producer / renderer / scenario across all source surfaces", (async) => {
      for (const code of Object.keys(RETIRED_CODES)) {
        const producers = await grepRepo(`['"\`]${code}['"\`]`, {
          include:
            "lib/**/*.{ts,tsx},app/**/*.{ts,tsx},components/**/*.{ts,tsx},middleware.{ts,tsx}",
        });
        expect(
          producers,
          `retired code ${code} still has a producer at ${producers.join(", ")}`,
        ).toEqual([]);
        expect(Object.keys(catalog), `retired code ${code} still in catalog`).not.toContain(code);
        expect(
          Object.keys(CODE_SCENARIOS),
          `retired code ${code} still in scenario registry`,
        ).not.toContain(code);
      }
    });
    ```

- [ ] **Step 3: Commit** `test(cross-cutting): three-way §12.4 / catalog / source parity (AC-X.1)`.

### Task X.2: No raw error codes in user-visible UI — substring leak detection (AC-X.2)

**Files:** Test: `tests/e2e/cross-cutting.spec.ts`. Builds on Task X.1's `SPEC_CODES`.

**Catalog-driven.** Earlier draft used `/^[A-Z][A-Z_]+$/` against text nodes. That regex misses real code shapes — `MI-5b_DUPLICATE_CREW_EMAIL` has lowercase + digits + hyphens; `LINK_REVOKED_FLOOR` is fine but appears INLINE in longer strings ("Got error LINK_REVOKED_FLOOR — try again") and the regex's `^...$` anchors only catch full-text-node leaks. The corrected design drives the test from `SPEC_CODES` directly and uses substring detection.

**Forbidden-code source set extended.** Earlier draft built `ALL_FORBIDDEN_CODES` from `SPEC_CODES + RETIRED_CODES` only — that's the §12.4 catalog. But internal enums NOT in §12.4 can also leak to UI: `parse_warnings[].code` values (UNKNOWN_FIELD, UNKNOWN_DAY_RESTRICTION, UNKNOWN_ROLE_TOKEN, TYPO_NORMALIZED, etc.), `last_sync_status` enum values (`drive_error`, `sheet_unavailable`, `parse_error`, `pending_review`), `pending_ingestions.last_error_code` values (`MI-1_VERSION_DETECTION_FAILED`, `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`, etc.), and any other `admin_alerts.code` values not yet promoted to §12.4. These are internal status/diagnostic codes — they SHOULD always render via `messageFor` lookup that maps the internal code to user-facing copy, never raw. The forbidden-code set extends to all of these:

```ts
// lib/messages/__generated__/internal-code-enums.ts (committed, regenerated by CI)
// Extracted from typed enum sources in the codebase, NOT from §12.4.
export const INTERNAL_CODE_ENUMS = {
  // From `parse_warnings[].code` enum — defined in lib/parser/types.ts; emitted by lib/parser/blocks/**.
  UNKNOWN_FIELD: { source: "parse_warnings.code" },
  UNKNOWN_DAY_RESTRICTION: { source: "parse_warnings.code" },
  UNKNOWN_ROLE_TOKEN: { source: "parse_warnings.code" },
  TYPO_NORMALIZED: { source: "parse_warnings.code" },
  // From `shows.last_sync_status` enum — values that may appear in admin tooling without
  // catalog binding if a developer renders the raw column. Tile/footer code MUST use
  // messageFor lookup keyed on a §12.4 mapping (DRIVE_FETCH_FAILED, SHEET_UNAVAILABLE, etc.),
  // never the raw status string.
  drive_error: { source: "shows.last_sync_status" },
  sheet_unavailable: { source: "shows.last_sync_status" },
  parse_error: { source: "shows.last_sync_status" },
  pending_review: { source: "shows.last_sync_status" },
  ok: { source: "shows.last_sync_status" }, // raw 'ok' MUST NOT render — but it's a common 2-letter substring; see exclusion below.
  // From `pending_ingestions.last_error_code` enum — every MI-N_* code from spec §6.8.
  // Auto-extracted from lib/parser/invariants.ts and lib/sync/applyParseResult.ts.
  // (the generator scans for `last_error_code: '<VALUE>'` writes and unions them in.)
  /* MI-1_VERSION_DETECTION_FAILED, MI-2_*, …, MI-14_* — full set extracted at build time */
  // From `admin_alerts.code` values written by lib/auth/**, lib/sync/**, lib/reports/** that
  // are NOT yet promoted to §12.4 (catch-all — every alert code SHOULD have catalog copy,
  // but if a new code lands in lib/ before §12.4 is updated, this audit fails the build).
} as const;

// Exclusions for substring-leak detection: short tokens whose raw appearance in text content
// would produce false positives (e.g., 'ok' is two letters; 'pending_review' is unambiguous).
// Tokens shorter than 4 characters are excluded from substring-leak detection at runtime; they
// remain enforced via the AST audit's exact-match check on text/attr nodes.
export const SUBSTRING_LEAK_MIN_LENGTH = 4;
```

The forbidden-set source becomes:

```ts
const ALL_FORBIDDEN_CODES = [
  ...Object.keys(SPEC_CODES),
  ...Object.keys(RETIRED_CODES),
  ...Object.keys(INTERNAL_CODE_ENUMS), //
];
```

The audit fails if any of these strings appear as text-content / user-visible attribute / JSX literal in app/components surfaces. Internal codes ALWAYS render via `messageFor` lookup that returns Doug-facing or crew-facing copy from §12.4; they MUST NOT be rendered raw. False-positive guard: `INTERNAL_CODE_ENUMS` keys shorter than `SUBSTRING_LEAK_MIN_LENGTH` (4) are excluded from substring scans at runtime; AST scans still enforce exact-match on those.

- [ ] **Step 1: Failing test** — Playwright crawls every reachable surface (loop over fixture-seeded routes + admin routes + asset-route 410 / 401 surfaces). The audit covers BOTH visible text AND user-visible attributes. For every element on every surface, assert that **textContent AND the attribute set ['aria-label', 'title', 'alt', 'placeholder', 'value', 'aria-description', 'aria-roledescription']** do NOT contain any literal code from `SPEC_CODES` OR `RETIRED_CODES` OR `INTERNAL_CODE_ENUMS`:

  ```ts
  const ALL_FORBIDDEN_CODES = [
    ...Object.keys(SPEC_CODES),
    ...Object.keys(RETIRED_CODES),
    ...Object.keys(INTERNAL_CODE_ENUMS).filter((c) => c.length >= SUBSTRING_LEAK_MIN_LENGTH),
  ];
  const USER_VISIBLE_ATTRS = [
    "aria-label",
    "title",
    "alt",
    "placeholder",
    "value",
    "aria-description",
    "aria-roledescription",
  ];
  for await (const surface of crawlAllSurfaces(page)) {
    // 1a. textContent on every element
    const allText = await surface.evaluate((el) => {
      const out: string[] = [];
      function walk(n: Element) {
        out.push(n.textContent ?? "");
        for (const child of n.children) walk(child);
      }
      walk(el as Element);
      return out;
    });
    for (const text of allText) {
      for (const code of ALL_FORBIDDEN_CODES) {
        expect(
          text,
          `surface ${surface.url} leaked code ${code} via textContent: ${text.slice(0, 200)}`,
        ).not.toContain(code);
      }
    }
    // 1b. User-visible attributes on every element.
    const allAttrs = await surface.evaluate((el, attrs) => {
      const out: { attr: string; value: string }[] = [];
      function walk(n: Element) {
        for (const a of attrs) {
          const v = n.getAttribute(a);
          if (v) out.push({ attr: a, value: v });
        }
        for (const child of n.children) walk(child);
      }
      walk(el as Element);
      return out;
    }, USER_VISIBLE_ATTRS);
    for (const { attr, value } of allAttrs) {
      for (const code of ALL_FORBIDDEN_CODES) {
        expect(
          value,
          `surface ${surface.url} leaked code ${code} via @${attr}: ${value.slice(0, 200)}`,
        ).not.toContain(code);
      }
    }
    // 1c. **Live DOM property values on form controls.**
    // The previous getAttribute('value') scan only sees the SERVER-RENDERED initial value attribute;
    // it MISSES every controlled-input value owned by client React state — `<textarea value={state} />`
    // / `<select value={state}><option>...</option></select>` / contenteditable `<div>{state}</div>`,
    // where React reconciles the live `.value` (or `.textContent`) property AFTER hydration without
    // ever writing the new value to the HTML `value` attribute. A user-visible spec code that lives
    // ONLY in client state would slip past 1a (textContent doesn't include input internals) AND past
    // 1b (no `value` attribute is ever written). Read the LIVE DOM PROPERTIES post-hydration:
    const liveProps = await surface.evaluate((el) => {
      const out: { tag: string; kind: string; value: string }[] = [];
      function walk(n: Element) {
        // <input value> — controlled OR uncontrolled; the property always reflects the rendered state.
        if (n.tagName === "INPUT") {
          const v = (n as HTMLInputElement).value;
          if (v) out.push({ tag: "INPUT", kind: "input.value", value: v });
        }
        // <textarea value> — same.
        if (n.tagName === "TEXTAREA") {
          const v = (n as HTMLTextAreaElement).value;
          if (v) out.push({ tag: "TEXTAREA", kind: "textarea.value", value: v });
        }
        // <select> — read the selected option's text AND value; both are user-visible.
        if (n.tagName === "SELECT") {
          const s = n as HTMLSelectElement;
          const opt = s.selectedOptions?.[0];
          if (opt?.text)
            out.push({ tag: "SELECT", kind: "select.selectedOptions[0].text", value: opt.text });
          if (opt?.value)
            out.push({ tag: "SELECT", kind: "select.selectedOptions[0].value", value: opt.value });
        }
        // contenteditable — `textContent` is owned by client React state for these elements.
        if ((n as HTMLElement).isContentEditable) {
          const t = n.textContent ?? "";
          if (t) out.push({ tag: n.tagName, kind: "contenteditable.textContent", value: t });
        }
        // **React state via __reactFiber$ / __reactProps$ fallback (advanced; defense-in-depth).**
        // When a component binds spec-code text to a non-form prop (e.g., `<span>{errorCode}</span>`),
        // the rendered textContent is captured by 1a. But for components that mount the text into a
        // form control's value via `defaultValue` + ref-mutation pattern, the live DOM property is
        // the only place to see it. The above checks cover that. Reading React Fiber internals
        // (`Object.keys(node).find(k => k.startsWith('__reactFiber$'))`) to traverse memoized state
        // is intentionally OUT OF SCOPE for this audit — it depends on React internals that change
        // between minor versions and would create flaky tests. The DOM-property reads above are
        // the supported surface; if a future component manages a user-visible value entirely
        // through a ref-attached imperative handle without writing it to a DOM property, the AST
        // audit (Step 2) catches it via the JSXAttribute / JSXText scan instead.
        for (const child of n.children) walk(child);
      }
      walk(el as Element);
      return out;
    });
    for (const { kind, value } of liveProps) {
      for (const code of ALL_FORBIDDEN_CODES) {
        expect(
          value,
          `surface ${surface.url} leaked code ${code} via live DOM ${kind}: ${value.slice(0, 200)}`,
        ).not.toContain(code);
      }
    }
  }
  ```

  ** Fix 5 regression-test fixture (mandatory)** — `tests/cross-cutting/fixtures/x2-controlled-input/`:
  - `bad-controlled-textarea.tsx`: a route renders `<textarea value={errorCode} onChange={...} />` where `errorCode` is bound to React state initialized to a raw spec code (e.g., `useState('LINK_REVOKED_FLOOR')`). The HTML `value` attribute is NEVER written because React owns the value via the property setter. Crawl Step 1a (textContent) misses it (textarea internals aren't text). Crawl Step 1b (`getAttribute('value')`) misses it (no attribute). Crawl Step 1c (`textarea.value` live DOM property) MUST catch it and fail the audit.
  - `bad-controlled-select.tsx`: a route renders `<select value={errorCode}><option value="LINK_REVOKED_FLOOR">LINK_REVOKED_FLOOR</option></select>`. Step 1a may catch the option's textContent, but Step 1c MUST also flag the live `select.selectedOptions[0].value` and `.text` reads — covers the case where the options come from a typed enum constant.
  - `bad-controlled-input.tsx`: a route renders `<input value={errorCode} readOnly />`. Step 1c MUST catch via `input.value`.
  - `bad-contenteditable.tsx`: a route renders `<div contentEditable>{errorCode}</div>`. Step 1c's `isContentEditable` branch MUST catch via the live `textContent`.
  - `good-noncontrolled.tsx`: a route renders `<input defaultValue="placeholder text" />` (no spec code anywhere). All three crawl phases (1a/1b/1c) MUST NOT flag this surface.

- [ ] **Step 2: Static-analysis test**. Earlier draft used a regex grep for `\{[^}]*['"\`]CODE['"\`][^}]\*\}|>CODE<`which only catches text-content + plain interpolation. JSX-attribute leaks like`title="LINK_REVOKED_FLOOR"`, `alt={'MI-5b_DUPLICATE_CREW_EMAIL'}`, or `placeholder={someRetiredCode}`slip through. The corrected design uses ts-morph to walk every`JSXAttribute` node:

  ```ts
  // tests/cross-cutting/no-raw-code-render.test.ts
  import { Project, SyntaxKind, Node } from "ts-morph";
  // forbidden set includes INTERNAL_CODE_ENUMS (parse_warnings.code,
  // last_sync_status enum, last_error_code values, admin_alerts.code values not in §12.4).
  // AST audit enforces exact-match on every entry regardless of length — runtime
  // SUBSTRING_LEAK_MIN_LENGTH guard does NOT apply here (false-positive risk is lower at AST
  // level since we're matching entire string-literal/template-literal values).
  const ALL_FORBIDDEN_CODES = [
    ...Object.keys(SPEC_CODES),
    ...Object.keys(RETIRED_CODES),
    ...Object.keys(INTERNAL_CODE_ENUMS),
  ];
  const project = new Project({ tsConfigFilePath: "tsconfig.json" });

  for (const sf of project.getSourceFiles(["app/**/*.tsx", "components/**/*.tsx"])) {
    // 1. Text content + plain JSX interpolation (existing coverage)
    for (const text of sf.getDescendantsOfKind(SyntaxKind.JsxText)) {
      const t = text.getText;
      for (const code of ALL_FORBIDDEN_CODES) {
        if (t.includes(code))
          throw new Error(
            `Raw code ${code} in JSX text at ${sf.getFilePath}:${text.getStartLineNumber}`,
          );
      }
    }
    // 2. JSXAttribute audit — covers literal AND expression initializers
    for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
      const init = attr.getInitializer;
      if (!init) continue;
      // 2a. String-literal initializer: title="LINK_REVOKED_FLOOR"
      if (init.getKind === SyntaxKind.StringLiteral) {
        const v = (init as any).getLiteralValue;
        for (const code of ALL_FORBIDDEN_CODES) {
          if (v === code || v.includes(code)) {
            throw new Error(
              `Raw code ${code} in @${attr.getName}="${v}" at ${sf.getFilePath}:${attr.getStartLineNumber}`,
            );
          }
        }
      }
      // 2b. Expression initializer: alt={'CODE'}, placeholder={someRetiredCode}, title={`...${error.code}...`}
      if (init.getKind === SyntaxKind.JsxExpression) {
        // Walk every StringLiteral/NoSubstitutionTemplateLiteral inside the expression
        for (const lit of init.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
          const v = lit.getLiteralValue;
          for (const code of ALL_FORBIDDEN_CODES) {
            if (v === code || v.includes(code)) {
              throw new Error(
                `Raw code ${code} in @${attr.getName}={...} at ${sf.getFilePath}:${lit.getStartLineNumber}`,
              );
            }
          }
        }
        for (const lit of init.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
          const v = lit.getLiteralText;
          for (const code of ALL_FORBIDDEN_CODES) {
            if (v.includes(code))
              throw new Error(
                `Raw code ${code} in @${attr.getName}={\`...\`} at ${sf.getFilePath}:${lit.getStartLineNumber}`,
              );
          }
        }
        // Variable references like `placeholder={someRetiredCode}` aren't literal — those are caught
        // by the runtime crawl in Step 1, since the rendered attribute value will be the variable's
        // resolved string. Static analysis can't follow arbitrary data flow without a full type-check
        // pass; the runtime crawl is the backstop.
      }
    }
  }
  ```

- [ ] **Step 3: Commit** `test(cross-cutting): substring + AST raw-code leak detection (AC-X.2)`.

### Task X.3: Single auth-validation entry point — semantic audit (AC-X.3)

**Files:** Test: `tests/cross-cutting/auth.test.ts`.

The earlier draft was an import-presence check: if a route imported `validateLinkSession`/`validateGoogleSession`/`requireAdmin` it passed. : that's too weak. A route can import the helper, also fetch with the service-role client first, gate auth on only one branch, or reimplement a partial hand-rolled check on a side path — all while passing the import audit. The actual invariant is **the validator MUST be called BEFORE any protected-data access on every protected route**.

**Files:** Test: `tests/cross-cutting/auth.test.ts`.

**Trust-domain classification + AST control-flow audit.** Earlier drafts of this task tried two heuristics:

1. "First occurrence of any validator before any of four sinks" — too lax (a validator in a dead branch passes; non-listed sinks slip through).
2. "Per-route ExpectedChain tuples + comprehensive sinks via `text.indexOf` and `text.match`" — still too lax: file-text ordering doesn't prove ANYTHING about the executed request path. Validator calls inside dead branches, after early returns, or in unused helper functions pass the audit. Conversely, helper functions called from the handler that themselves access protected sinks are invisible to the regex scan.

The corrected design has two parts:

**(A) Trust-domain classification — NOT a path-segment sweep.** `app/api/**`, `app/admin/**`, `app/show/**`, `app/me/**` cover four very different trust models. The earlier draft's catch-all sweep ("any unlisted file under those paths is a protected-shaped route") swept in cron handlers, the Drive webhook, server actions, and component files that don't share the user/session-auth trust model — forcing implementers to add bogus exceptions or fail CI permanently. The corrected classifier explicitly assigns each file to one of:

| Domain             | Examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Auth contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crew-session`     | `app/show/[slug]/page.tsx`, `app/api/asset/diagram/**`, `app/api/asset/reel/**`, `app/api/report/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Terminal-success branches**. The auth chain has **OR semantics**: success at ANY validator TERMINATES the chain (subsequent validators do NOT run). The audit accepts a path if it matches ANY of the spec-allowed terminal-success branches. Each branch enumerates the validators that MUST be called, in order; the LAST entry on a branch is the validator that produces terminal success on that path; subsequent validators are NOT invoked on that path. **Admin-precedence ordering**: `isAdminSession(req)` is checked FIRST as a side-effect-free predicate; when it returns true, `requireAdmin` runs immediately and the chain stops there — even when a valid redeemed-link cookie is also present (link-first ordering would have silently downgraded the admin to crew-mode). Branches: <br>**B1 — admin-precedence wins**: `[requireAdmin]` under the `isAdminSession(req) === true` guard. Admin succeeds → chain stops; link + google never run; the cookie (if present) is left in place. <br>**B2 — link wins (admin not detected)**: `[validateLinkSession]`. `isAdminSession` returned false; cookie present + valid → success → chain stops; google + admin never run. <br>**B3 — link continue → google wins**: `[validateLinkSession, validateGoogleSession]`. Admin not detected; link continue; google succeeds → chain stops. <br>**B4 — link continue → google continue → admin wins**: `[validateLinkSession, validateGoogleSession, requireAdmin]`. Belt-and-suspenders fallback for non-OAuth admin paths (e.g., session-refresh races where admin metadata appears mid-render). <br>The audit recognizes B1's admin-precedence branch as ANY conditional whose test statically resolves to a call to `isAdminSession` from `lib/auth/isAdminSession.ts`; using the shared helper that Task 5.7's runtime uses keeps the static audit and the executed branch from diverging. Audit fixtures: `admin-not-on-crew.fixture` MUST pass via B1 (admin-precedence); `admin-also-on-crew.fixture` MUST pass via B1 (admin role, NOT crew downgrade); `admin-with-valid-link-cookie.fixture` MUST pass via B1 (admin role, link branch never runs); `crew-only.fixture` MUST pass via B2 or B3; `crew-removed-but-google.fixture` MUST pass via B4. Earlier placed `validateLinkSession` first on every branch — that rejected admin-precedence (admin runs without link being called) AND silently downgraded admins to crew-mode whenever a valid link cookie existed for the same show. The ordering closes both holes. |
| `admin`            | `app/admin/**/page.tsx`, `app/api/admin/**` (excluding cron)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `requireAdmin` only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `me`               | `app/me/page.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **`validateGoogleIdentity` ONLY.** `validateGoogleSession` is strictly show-bound (its step 2 looks up `crew_members WHERE show_id = $requestedShowId AND email = canonicalize(...)`) and CANNOT be called from a cross-show signed-in surface like `/me`. The `me` trust domain uses `validateGoogleIdentity(req)` that returns `{ kind: 'success', email, providerSub }` from the Supabase Auth session ONLY (no show binding) per spec §7.2.2. A file under `app/me/**` that imports `validateGoogleSession` MUST FAIL X.3; canonical fixtures: `bad-me-route-uses-validateGoogleSession.tsx` (fail) + `good-me-route-uses-validateGoogleIdentity.tsx` (pass).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `auth-library`     | `lib/auth/**`, `app/api/auth/redeem-link/route.ts`, `middleware.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | exempt — these are the validators themselves and the cookie-mint route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `public-bootstrap` | `app/show/[slug]/p/page.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | exempt — bootstrap shell renders without a cookie (Task 5.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `public-webhook`   | `app/api/drive/webhook/route.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | uses constant-time token compare, NOT the user-session validator chain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `cron-internal`    | `app/api/cron/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | uses Vercel cron auth header, NOT user validators                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `server-action`    | **AST-DETECTED, NOT path-classified.** Any `.ts`/`.tsx` file under `app/**` containing a `'use server'` directive — module-level OR function-scoped — exposes server actions. This includes `app/**/actions.ts` AND component files like `app/show/components/*.tsx`, `app/admin/dev/page.tsx`, etc. that declare `'use server'` inline at the top of an async function (Next.js inline-action pattern) or as a module-level directive in a non-`actions.ts` file. **Server actions are detected by AST scan BEFORE path-based classification skip** — a component file does NOT escape audit because of its filename. | subject to chain audit per spec §7.2.2 (`validateLinkSession` required on any action mutating state for a redeemed user). **Trust domain is inherited from the containing route subtree, NOT the file's path-based bucket**: an action in `app/show/[slug]/components/foo.tsx` inherits `crew-session`; an action in `app/admin/**/components/bar.tsx` inherits `admin`; an action in `app/me/**/*.tsx` inherits `me`. The chain audit runs over the discovered server-action entry (the action function), NOT the file as a whole. Earlier draft only matched `app/**/actions.ts` via filename, so inline `'use server'` actions in component files (which Next.js fully supports for forms) silently slipped past audit — closes that hole.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `non-route`        | `app/**/components/*.tsx`, `*.test.ts`, `app/**/loading.tsx`, `app/**/error.tsx`, `app/**/layout.tsx` (layouts that don't fetch data) — **only if the file does NOT contain any `'use server'` directive**. The `'use server'` AST scan runs FIRST; if it finds any module-level or function-scoped directive, the file is reclassified as `server-action` (with the chain inherited from its containing route subtree) regardless of its filename.                                                                                                                                                                    | not a request entry point AND don't mutate state — exempt from chain audit but subject to `BANNED_OUTSIDE_AUTH_LIB` primitive checks. A non-route file that contains a `'use server'` directive is NOT non-route; it's `server-action`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Every `app/**` file MUST appear in exactly one classification entry. Adding a new file in `app/api/`, `app/admin/`, `app/show/`, or `app/me/` without classifying it fails CI.

**(B) Path-sensitive AST control-flow audit.** Replace text-position heuristics with a real call-graph analysis. For each `crew-session` / `admin` / `me` route file:

1. Locate every request entry point in the file. `findRequestEntries` discovers the FULL set of server-side execution entries that App Router invokes during a request lifecycle, NOT just `page.tsx` default + `route.ts` HTTP-method handlers. Discovered entries:
   - **Page default export** (`page.tsx`/`page.ts`): the Server Component render.
   - **Route HTTP-method named exports** (`route.ts`/`route.tsx`): `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD` — each treated as a separate entry.
   - **Server-action default export for `actions.ts`** plus AST-detected inline `'use server'` functions in any file.
   - **`generateMetadata` / `generateViewport` named exports** (`page.tsx`, `layout.tsx`, `route.ts`, or sibling `metadata.ts`/`viewport.ts`): App Router invokes these server-side BEFORE page render to compute `<head>` content; they receive `params`/`searchParams` and can independently fetch from any DB. A `generateMetadata` that calls `from('shows_internal')` without auth leaks data through Open Graph tags / page titles. Each exported `generateMetadata`/`generateViewport` function is its own entry, classified via the SAME path-based trust-domain chain that classifies the page itself.
   - **`head.tsx`/`head.ts` default export** (legacy App Router `<head>` Server Component, supported through Next 15+): same trust-domain chain as the page.
   - **`loading.tsx`/`loading.ts` default export**: streaming loading UI Server Component. Renders before page completes; can fetch data; counts as a request entry.
   - **`error.tsx`/`error.ts` default export**: server-rendered error boundary fallback (NOTE: error.tsx is `'use client'` per Next.js convention but `global-error.tsx` and any non-`'use client'` error file render server-side; AST scan detects the directive and skips audit when present).
   - **`not-found.tsx`/`not-found.ts` default export**: rendered server-side when `notFound` fires; can fetch data.
   - **`template.tsx`/`template.ts` default export**: re-rendered server-side per navigation; same trust-domain chain.
   - **`middleware.ts` matcher-scoped exports**: classified as `auth-library` (exempt) — the cookie-mint flow legitimately runs here.

   Every discovered entry is classified via `classifyTrustDomain(path)` (the file path's trust domain applies to all its entries) and runs through the chain audit independently. **Required negative fixture**: `bad-generate-metadata-touches-shows-internal.tsx` — a `crew-session` page file whose `generateMetadata` named export calls `from('shows_internal')` WITHOUT calling `validateLinkSession` first. The audit MUST throw because `generateMetadata` is now a discovered entry and the chain must dominate every reachable sink. Companion fixtures: `bad-loading-touches-protected-table.tsx` (`loading.tsx` default export fetches from `reports`); `bad-not-found-touches-protected-table.tsx` (`not-found.tsx` fetches from `pending_syncs`); `bad-head-tsx-touches-protected-table.tsx` (`head.tsx` reads `shows_internal`); `good-generate-metadata-via-validator.tsx` — `generateMetadata` calls `validateLinkSession` first then `from('shows_internal')` (must NOT throw).

2. Walk every reachable statement on EVERY control-flow path from the entry. For each protected sink encountered, prove (via dominator analysis on the call graph) that EVERY path from the entry to that sink passes through the required validator chain in the declared order.
3. Validator calls in unreachable branches (early-returned, conditional-false-only) do NOT count.
4. Helper functions called from the handler are inlined into the analysis (transitive flow): if `handler → fetchShow → from('shows_internal')` and `fetchShow` is defined locally, the audit walks into `fetchShow` rather than treating it as opaque.

- [ ] **Step 1: Author the protected-routes allowlist** with per-route **valid terminal-success paths**. The auth chain has **OR semantics**: success at ANY validator TERMINATES the chain, and subsequent validators do NOT run. The allowlist therefore declares a SET of `ValidPath`s; each is the ordered list of validators that must all be CALLED on that runtime path AND whose LAST entry is the validator that produces terminal success on that path. The audit accepts the actual control-flow if it matches ANY single `ValidPath`: (1) every validator on the path is called, (2) in declared order, (3) the path ends at the last validator's call site as the terminal-success producer, (4) sinks fire AFTER that last validator (sinks before, or paths whose terminating validator differs from the one that actually returned success, are rejected).

  ```ts
  type ChainStep =
    | "validateLinkSession"
    | "validateGoogleSession"
    | "validateGoogleIdentity"
    | "requireAdmin"; // validateGoogleIdentity is the cross-show identity-only validator used EXCLUSIVELY by `/me` and other no-show-context signed-in surfaces; show-bound surfaces still use validateGoogleSession.
  type ValidPath = ReadonlyArray<ChainStep>; // ordered list; LAST entry = terminal-success validator on this path
  type ExpectedChain =
    | ValidPath // single valid terminal-success path required
    | { anyOf: ReadonlyArray<ValidPath> }; // terminal-success branches (OR semantics)
  type RouteSpec = { path: string; chain: ExpectedChain | "auth-library-exception" };
  // Backwards-compat alias: older code references `SingleChain`. New code MUST use ValidPath.
  type SingleChain = ValidPath;

  // crew-session routes accept the following terminal-success branches. The audit
  // recognizes the runtime branch on the SHARED `lib/auth/isAdminSession.ts` predicate (Task 5.7).
  // Success at ANY validator terminates the chain — subsequent validators do NOT run. The audit
  // checks each enumerated control-flow path against ANY ValidPath in the set.
  //
  // Branches:
  // B1 — admin-precedence wins: requireAdmin runs FIRST under the `isAdminSession(req) === true`
  // guard. Chain stops at requireAdmin; validateLinkSession + validateGoogleSession never run.
  // B2 — link wins (admin not detected): isAdminSession returns false, validateLinkSession returns
  // success. Chain stops at validateLinkSession; google + admin never run.
  // B3 — link continue → google wins.
  // B4 — link continue → google continue → admin wins (signed-in user not on crew but admin
  // metadata appears later, e.g., session refreshed mid-render). Belt-and-suspenders branch.
  const CREW_SESSION_CHAINS: { anyOf: ReadonlyArray<ValidPath> } = {
    anyOf: [
      ["requireAdmin"], // B1: admin-precedence — `isAdminSession(req)` true → requireAdmin succeeds → chain stops
      ["validateLinkSession"], // B2: admin not detected → link succeeds → chain stops
      ["validateLinkSession", "validateGoogleSession"], // B3: admin not detected → link continue → google succeeds
      ["validateLinkSession", "validateGoogleSession", "requireAdmin"], // B4: admin not detected initially → link continue → google continue → admin succeeds (rare; covers session-refresh races)
    ],
  };

  const PROTECTED_ROUTES: RouteSpec[] = [
    // Crew page — terminal-success branches.
    { path: "app/show/[slug]/page.tsx", chain: CREW_SESSION_CHAINS },
    // /me — Google session only (signed-in user's own list); no admin path needed.
    { path: "app/me/page.tsx", chain: ["validateGoogleIdentity"] }, // cross-show identity-only validator (NOT show-bound validateGoogleSession; see spec §7.2.2 cross-show identity-only validator amendment)
    // Admin surfaces — admin only.
    { path: "app/admin/page.tsx", chain: ["requireAdmin"] },
    { path: "app/admin/show/[slug]/page.tsx", chain: ["requireAdmin"] },
    { path: "app/admin/show/[slug]/preview/[crewId]/page.tsx", chain: ["requireAdmin"] },
    { path: "app/admin/dev/page.tsx", chain: ["requireAdmin"] },
    // + : no `app/admin/onboarding/page.tsx` — the wizard renders
    // inline at `/admin` per Task 10.1's single-inline-route-owner contract. `/admin` is
    // already in this map above and gates with requireAdmin.
    { path: "app/admin/settings/page.tsx", chain: ["requireAdmin"] },
    // Asset routes — terminal-success branches.
    { path: "app/api/asset/diagram/[show]/[rev]/[key]/route.ts", chain: CREW_SESSION_CHAINS },
    { path: "app/api/asset/reel/[show]/route.ts", chain: CREW_SESSION_CHAINS },
    // Report routes — same branching chain (Task 8.3).
    { path: "app/api/report/route.ts", chain: CREW_SESSION_CHAINS },
    // Admin API — admin only.
    { path: "app/api/admin/sync/[slug]/route.ts", chain: ["requireAdmin"] },
    { path: "app/api/admin/staged/[fileId]/apply/route.ts", chain: ["requireAdmin"] },
    { path: "app/api/admin/staged/[fileId]/discard/route.ts", chain: ["requireAdmin"] },
    { path: "app/api/admin/onboarding/finalize/route.ts", chain: ["requireAdmin"] },
    // Phase D final-CAS endpoint (Task 10.5 step 2 Phase D pseudo-code).
    { path: "app/api/admin/onboarding/finalize-cas/route.ts", chain: ["requireAdmin"] },
    // cleanup-abandoned-finalize route owned by Task 10.1 (wraps the
    // cleanupAbandonedFinalize helper with route-level requireAdmin + sync_audit before/after rows).
    {
      path: "app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts",
      chain: ["requireAdmin"],
    },
    // previously-missing onboarding routes (Task 10.3 scan + Task 10.4 hard-fail action endpoints).
    { path: "app/api/admin/onboarding/scan/route.ts", chain: ["requireAdmin"] },
    {
      path: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
      chain: ["requireAdmin"],
    },
    {
      path: "app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified/route.ts",
      chain: ["requireAdmin"],
    },
    {
      path: "app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route.ts",
      chain: ["requireAdmin"],
    },
    // Auth library exceptions (the validators themselves, the cookie-mint route, the compromise handler):
    { path: "app/api/auth/redeem-link/route.ts", chain: "auth-library-exception" },
    { path: "middleware.ts", chain: "auth-library-exception" },
  ];
  ```

  Every protected route in the codebase MUST appear in this list. Step 2's audit fails on any unlisted route under `app/api/`, `app/show/`, `app/me/`, or `app/admin/`.

- [ ] **Step 2: Failing semantic-audit test** via `ts-morph`:

  ````ts
  import { Project, SyntaxKind, Node } from 'ts-morph';
  // Allowed direct consumers of low-level auth/session primitives:
  const AUTH_LIB_ALLOWLIST = [
    'lib/auth/jwt.ts',
    'lib/auth/validateLinkSession.ts',
    'lib/auth/validateGoogleSession.ts',
    'lib/auth/validateGoogleIdentity.ts', // cross-show identity-only validator (used by /me, kept distinct from show-bound validateGoogleSession)
    'lib/auth/requireAdmin.ts',
    'lib/auth/isAdminSession.ts', // shared admin-precedence predicate (Task 5.7 / X.3)
    'lib/auth/cookies.ts', // shared __Host-fxav_session set/clear helper
    'lib/auth/constants.ts',
    'app/api/auth/redeem-link/route.ts', // mints the session — must touch primitives
    'middleware.ts', // ?t= compromise handler — service-role
  ];
  // Banned identifiers outside the auth library (catches direct primitive use).
  // **Scanned in BOTH Identifier nodes AND StringLiteral nodes** — the
  // dangerous access pattern in practice is `from('link_sessions')` / `cookies.get('__Host-...')`
  // where the table or cookie name is a string-literal argument, NOT a JS identifier. Earlier draft
  // only walked Identifier nodes, so `from('link_sessions')` slipped through.
  const BANNED_OUTSIDE_AUTH_LIB = [
    'link_sessions', // direct DB access bypassing the validator
    'crew_member_auth', // direct auth-state read
    /^__Host-fxav_session$/, // REVERTED to literal-only — per-show NAMING is retired because browsers index cookies by `(domain, path)` not by name, so per-show suffix delivered zero isolation while making the Cookie header grow linearly. Direct cookie read bypasses the validator.
    'verifyLinkJwt', // raw JWT verify outside the validator
    'revoked_links', // direct revocation-state read
  ];
  // Comprehensive protected-data sinks (ANY of these called before the chain completes is a violation).
  // earlier draft only had 4 sinks (shows_internal / reports / createServiceClient /
  // getShowForViewer). That left every other protected DB table, Storage client, and Drive client unguarded.
  //
  // **: PROTECTED_SINKS table list is GENERATED from spec §4.3 admin-only list at
  // build time, not hand-rolled.** A small build-time script (`scripts/extract-protected-sinks.ts`)
  // parses the spec's §4.3 bullets to extract the admin-only table set and emits a generated module
  // the audit imports. The generator output — NOT a hand-rolled count in this comment — is the
  // canonical sink list; future schema additions auto-update PROTECTED_SINKS without regex drift.
  // **: hardcoded count language removed.** The earlier comment said "currently
  // 14 tables" and enumerated the §4.3 admin-only set. That stale count became wrong when
  // added `onboarding_scan_manifest` (15) and again when added `bootstrap_nonces` (16).
  // The canonical list is now ALWAYS read from the build-time-generated reference (`scripts/
  // extract-protected-sinks.ts` parsing §4.3) — the comment no longer hardcodes a count or
  // enumeration. Crew-readable tables are also included as protected sinks: `shows`,
  // `shows_internal`, `crew_members`, `hotel_reservations`, `rooms`, `transportation`, `contacts`.
  // The literal regex list below is the bootstrap set the generator's output is checked against;
  // CI fails if the generator's parsed §4.3 set disagrees with this list (pre-generation safety
  // net). Paired with the / findings that grew AC-2.5 to 17 tables: spec §4.3 already
  // lists `bootstrap_nonces`; AC-2.5 (M2 owner) and PROTECTED_SINKS (this audit) both grow
  // automatically because they read §4.3 as the single source of truth. added
  // `onboarding_scan_manifest` to §4.3 but the plan's regex list missed it; added
  // `bootstrap_nonces` to §4.3 but the plan's regex list missed it. Generation (driven by §4.3
  // parsing) closes both bug classes uniformly.
  // **: PROTECTED_SINKS regexes are now BUILD-GENERATED from Task 2.3's
  // ADMIN_TABLES registry, not hand-maintained inline.** The earlier hand-maintained list drifted
  // three times: added `onboarding_scan_manifest` to §4.3 but missed it here;
  // added `bootstrap_nonces` to §4.3 but missed it here; admin-only enumeration
  // already named `crew_member_auth` and `link_sessions` but those NEVER landed in this regex list
  // either (silent gap). added `pending_snapshot_uploads` to §4.3 — the same drift
  // would happen if this list were still hand-rolled. **X.1-X.6 : prior
  // wording used `<task-2.3>/admin-tables.ts` as a placeholder import path with no concrete
  // build-script step or emitted-file path; that left every "PROTECTED_SINKS sample" comment
  // (and any prose enumeration of admin tables) as a hand-maintained drift surface — the
  // -era sample illustrated only ~14 of the 17 tables, silently omitting
  // `crew_member_auth`, `link_sessions`, and `pending_snapshot_uploads`. The corrected design
  // specifies the exact generation file paths, build-script step, and diff-or-fail contract.**
  //
  // **Generation contract:**
  // 1. Build script `scripts/generate-admin-tables.ts` parses spec §4.3's admin-only bullet
  // list at build time. **X.1-X.6 : generation MUST be a HARD prerequisite
  // of every TS entrypoint**, not just `prebuild` + Vitest setup. The earlier wording left
  // `tsc --noEmit` (manual run, IDE/editor language server, the `pnpm typecheck` script,
  // and `pnpm lint`) free to consume a stale generated file because none of those entry
  // points fire `prebuild`. A spec edit to §4.3 with a forgotten `pnpm gen:admin-tables`
  // run could therefore typecheck green locally and only fail at `pnpm build` — far too
  // late. The corrected wiring runs `gen:admin-tables` automatically before EVERY entry
  // point that consumes the generated module:
  // (a) Add explicit `gen:admin-tables` script to `package.json`'s `scripts` block:
  // `"gen:admin-tables": "tsx scripts/generate-admin-tables.ts"`.
  // (b) Wire `pretypecheck`, `prelint`, `pretest`, `prebuild` ALL to `gen:admin-tables`.
  // npm/pnpm/yarn run `pre<script>` automatically before `<script>` — so a developer
  // running `pnpm typecheck` or `pnpm lint` or `pnpm test` ALWAYS regenerates first.
  // The generated file is then committed to Git (point (c) below) — local writes are
  // a no-op when §4.3 hasn't changed because the script writes only on diff.
  // (c) Commit the generated file to Git as `lib/audit/admin-tables.generated.ts` with
  // a `// @generated` header on line 1 so ESLint's overrides config can match the
  // file glob and skip lint rules that fight machine output (no-multi-spaces,
  // import-order, etc.). Add `lib/audit/admin-tables.generated.ts` to the project's
  // `eslint.config.js` (or `.eslintrc.json`) `overrides` array with `rules: {}` to
  // silence rule violations on the generated file. Do NOT add it to `.gitignore` —
  // committing it is the entire point of the "committed source of truth + diff-on-CI"
  // contract; CI cannot run a freshness check against an ignored file.
  // (d) Add a CI step BEFORE every job in `.github/workflows/x-audits.yml` (and any
  // other workflow that runs `pnpm typecheck`/`pnpm lint`/`pnpm test`/`pnpm build`):
  // ```yaml
  // - run: pnpm gen:admin-tables
  // - run: git diff --exit-code lib/audit/admin-tables.generated.ts
  // ```
  // The first command regenerates from the spec; the second fails the workflow if
  // the regeneration produced any diff against the committed file. A PR that edits
  // §4.3 without running `pnpm gen:admin-tables` locally will fail this gate with a
  // named diff — surfaced BEFORE typecheck/lint/test consume the stale module.
  // **Standalone `tsc --noEmit` / editor / typecheck MUST also see fresh generated file
  // because `pretypecheck` runs first** — the `pre<script>` hook fires for `pnpm typecheck`
  // and `pnpm lint` and `pnpm test` regardless of how invoked (CLI, IDE task runner, CI).
  // The single uncovered path is direct `tsc --noEmit` invocation that bypasses the
  // `package.json` script — the X.6 traceability-audit Step 2 asserts the project's CI
  // and pre-commit hook (if present) ALWAYS go through `pnpm typecheck`, NEVER raw `tsc`.
  // Emits `lib/audit/admin-tables.generated.ts`
  // containing a **PLAIN STRING ARRAY** (NOT objects with `.name` keys;
  // — earlier example mixed shapes, causing the consumer regex builder to do `t.name` against
  // plain strings and either typecheck-fail OR silently produce `RegExp("undefined")` patterns):
  // ```ts
  // // AUTO-GENERATED — do not edit. Run `pnpm gen:admin-tables` to regenerate.
  // // Source: docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md §4.3 admin-only.
  // // Count: 19 tables as of (wizard_finalize_checkpoints added).
  // export const ADMIN_TABLES: readonly string[] = [
  // 'shows_internal',
  // 'sync_log',
  // 'reports',
  // 'pending_syncs',
  // 'pending_ingestions',
  // 'crew_member_auth',
  // 'revoked_links',
  // 'link_sessions',
  // 'bootstrap_nonces',
  // 'app_settings',
  // 'deferred_ingestions',
  // 'admin_alerts',
  // 'sync_audit',
  // 'drive_watch_channels',
  // 'report_rate_limits',
  // 'onboarding_scan_manifest',
  // 'pending_snapshot_uploads',
  // 'revision_race_cooldowns', // — 18th admin-only table
  // 'wizard_finalize_checkpoints', // — 19th admin-only table
  // ] as const;
  // ```
  // 2. The X.3 audit, AC-2.5's harness in Task 2.3, and every other consumer import this
  // single file (NOT a hand-rolled list); the regex builder consumes the strings DIRECTLY
  // (the array elements ARE the table-name strings — NEVER `t.name`). Backticks also match
  // template-literal-quoted table names (`from(\`shows_internal\`)`):
  // ```ts
  // import { ADMIN_TABLES } from '@/lib/audit/admin-tables.generated';
  // const ADMIN_FROM_REGEXES = ADMIN_TABLES.map(t =>
  // new RegExp(`\\.from\\(['"\`]${t}['"\`]\\)`)
  // );
  // ```
  // The AC-2.5 `ADMIN_TABLES` registry in Task 2.3 (the test-side `AdminTableSpec[]`) is
  // a SEPARATE structure — it carries `name`/`pk`/`seed`/`validInsert`/`validUpdate` per
  // entry — but its `name` field MUST come from the generated string list (a parity check
  // asserts every Task-2.3 registry entry's `name` is a member of the generated string
  // array, and every generated string has exactly one Task-2.3 registry entry).
  // 3. **Diff-or-fail step**: every CI job in
  // `.github/workflows/x-audits.yml` (and any other workflow that runs `pnpm typecheck`,
  // `pnpm lint`, `pnpm test`, or `pnpm build`) MUST include the two-step pre-job freshness
  // check enumerated in point 1(d) above:
  // `- run: pnpm gen:admin-tables` then `- run: git diff --exit-code lib/audit/admin-tables.generated.ts`.
  // The first command regenerates from the live spec; the second fails the workflow if
  // the regeneration produced any diff against the committed file. The diff line emits
  // `+missing_in_generated:<name>` / `-extra_in_generated:<name>` when the spec and the
  // committed module disagree on table membership — surfacing the staleness BEFORE the
  // job's typecheck/lint/test step consumes the stale module. **Every job step that
  // could execute TS code touching `ADMIN_TABLES` MUST be preceded by this two-step
  // check** — the new `verify-branch-protection` job is exempted only because it does
  // not import the generated file.
  // 4. **Sweep mandate**: every other hand-maintained inline enumeration of admin tables
  // anywhere in this plan or in implementation code (`ADMIN_BOOTSTRAP_NAMES` reference
  // list below; AC-2.5's `ADMIN_TABLES` registry in Task 2.3; any future "admin only:"
  // prose enumeration) MUST import from `lib/audit/admin-tables.generated.ts`. The
  // `traceability-audit` CI check (Task X.6 Step 3) additionally fails if ANY plan section
  // enumerates admin tables in prose and disagrees with the generated file by name or
  // count.
  //
  // The CREW_READABLE_FROM_REGEXES list (`shows`, `crew_members`, `hotel_reservations`, `rooms`,
  // `transportation`, `contacts`) is the small fixed addition for crew-readable tables that ALSO
  // need protection (because they leak per-show identity even though RLS allows crew SELECT —
  // the chain audit must prove auth ran first so the right show's row is what gets fetched).
  // CI fails (Task X.6 parity gate, line ~8019) if Task 2.3's ADMIN_TABLES count/identity
  // disagrees with the spec §4.3 admin-only bullet list parsed at build time.
  // ADMIN_TABLES is a `readonly string[]` (plain strings, NOT objects
  // with `.name`), so the regex builder consumes `t` directly. Backticks also match
  // template-literal-quoted table names (`from(\`shows_internal\`)`). Earlier draft was
  // `${t.name}` which silently produced RegExp("undefined") patterns — typecheck would catch
  // it now that the generated module uses an explicit `readonly string[]` type.
  const ADMIN_FROM_REGEXES = ADMIN_TABLES.map(t => new RegExp(`\\.from\\(['"\`]${t}['"\`]\\)`));
  // Bootstrap reference list — the canonical 19-table set as of
  //. CI cross-checks ADMIN_TABLES against this
  // list AND against spec §4.3; any drift fails the audit.
  const ADMIN_BOOTSTRAP_NAMES = [
    'shows_internal', 'sync_log', 'reports', 'pending_syncs', 'pending_ingestions',
    'crew_member_auth', 'revoked_links', 'link_sessions', 'bootstrap_nonces', 'app_settings',
    'deferred_ingestions', 'admin_alerts', 'sync_audit', 'drive_watch_channels',
    'report_rate_limits', 'onboarding_scan_manifest', 'pending_snapshot_uploads',
    'revision_race_cooldowns', 'wizard_finalize_checkpoints',
  ] as const;
  const PROTECTED_SINKS = [
    // DB tables — auto-generated from Task 2.3 ADMIN_TABLES registry (spec §4.3 admin-only list,
    // 19 tables: shows_internal, sync_log, reports, pending_syncs, pending_ingestions,
    // crew_member_auth, revoked_links, link_sessions, bootstrap_nonces, app_settings,
    // deferred_ingestions, admin_alerts, sync_audit, drive_watch_channels, report_rate_limits,
    // onboarding_scan_manifest, pending_snapshot_uploads, revision_race_cooldowns,
    // wizard_finalize_checkpoints):
    ...ADMIN_FROM_REGEXES,
    // Crew-readable tables — small fixed list, NOT generated from §4.3 (these are the §4.3
    // crew-readable bullets; the chain audit must still prove auth ran first so RLS scopes the
    // SELECT to the right show).
    /\.from\(['"]shows['"]\)/,
    /\.from\(['"]crew_members['"]\)/,
    /\.from\(['"]hotel_reservations['"]\)/,
    /\.from\(['"]rooms['"]\)/,
    /\.from\(['"]transportation['"]\)/,
    /\.from\(['"]contacts['"]\)/,
    // Service-role + storage + Drive clients:
    /createServiceClient\b/,
    /getServiceRoleClient\b/,
    /supabaseAdmin\b/,
    /\.storage\.from\(/, // Storage reads/writes — diagram + reel snapshot bytes
    /getDriveClient\b/, /driveClient\b/, // Drive API — must never run before auth on user-facing routes
    // Role-aware data fetcher (its own validators must have run upstream).
    /getShowForViewer\b/,
  ];

  // **RPC sinks — protected-by-default.** Every `supabase.rpc(<name>, ...)` call
  // is a sink unless `<name>` is explicitly allowlisted. SECURITY DEFINER functions can read any
  // table at service-role privilege; treating RPCs as opaque "not a `from`" calls left every
  // SECURITY DEFINER helper unguarded. `RPC_ALLOWLIST` starts EMPTY — adding an entry requires a
  // reviewed return-shape contract documenting why the RPC is safe to call before auth. The
  // cookie-mint RPC inside `app/api/auth/redeem-link/route.ts` remains exempt via the file-level
  // `AUTH_LIB_ALLOWLIST`, NOT via `RPC_ALLOWLIST`. Audit treats `client.rpc('<name>', ...)`,
  // `supabase.rpc('<name>', ...)`, and named imports of RPC wrappers as protected sinks unless the
  // literal `<name>` is in `RPC_ALLOWLIST`. Non-literal RPC names (e.g., `rpc(varName)`) are ALWAYS
  // sinks — the audit cannot statically prove safety.
  const RPC_ALLOWLIST: ReadonlyArray<string> = [
    // Initially empty. Entries require a reviewed return-shape contract. Format example:
    // { name: 'rpcFoo', reason: 'pure utility — reads no protected rows', return_shape: '...' }
  ];
  function isProtectedRpcCall(node: Node): boolean {
    if (!Node.isCallExpression(node)) return false;
    const expr = node.getExpression;
    if (!Node.isPropertyAccessExpression(expr)) return false;
    if (expr.getName !== 'rpc') return false;
    const args = node.getArguments;
    if (args.length === 0) return true; // rpc with no args — anomalous; treat as sink
    const first = args[0];
    if (Node.isStringLiteral(first) || Node.isNoSubstitutionTemplateLiteral(first)) {
      const name = (first as any).getLiteralValue
        ? (first as any).getLiteralValue
        : (first as any).getLiteralText;
      return !RPC_ALLOWLIST.includes(name); // not allowlisted → sink
    }
    return true; // dynamic name → conservatively a sink
  }
  // findProtectedSinks(callGraph, PROTECTED_SINKS) is extended to ALSO classify any node for which
  // isProtectedRpcCall(node) returns true as a sink. The chain audit treats RPC sinks identically
  // to table/Storage/Drive sinks — they must fire AFTER the terminal validator's success on every
  // control-flow path.

  // **`.from(<arg>)` sinks — AST-aware, protected-by-default for non-literal arguments
  //.** The string-literal `PROTECTED_SINKS` regex list above only
  // matches `from('shows_internal')`, `from('bootstrap_nonces')`, etc. — call sites where the
  // table name is a JS string literal. A non-literal argument (`from(tableName)` where `tableName`
  // is a parameter, or `` from(`${expr}`) `` with a substitution template) bypasses every regex
  // and would silently allow a route to touch a protected table BEFORE auth completes. An
  // attacker (or a refactor) could intentionally write `.from(req.query.table)` and bypass the
  // entire admin-table allowlist. The audit therefore treats EVERY `.from(<non-literal>)` call as
  // a protected sink unless the call site is explicitly listed in `DYNAMIC_FROM_ALLOWLIST` with a
  // reviewed justification. Mirrors the `.rpc(<dynamic-name>)` rule in isProtectedRpcCall above.
  // **X.1-X.6 — call-site-scoped fingerprint, NOT file-scoped.**
  // Earlier wording keyed entries on `{ file, reason }` and exempted via `filePath.endsWith(e.file)`.
  // That made allowlisting transitive: ONE legitimate dynamic-from in `lib/auth/internal/some-
  // resolver.ts` blessed every FUTURE dynamic `.from` added to the same file forever. A refactor
  // that introduced a SECOND, unrelated dynamic-from in that file would silently pass the audit,
  // bypassing the admin-only allowlist on the second site. The corrected design fingerprints the
  // EXACT call-site AST node so each call site requires its own allowlist entry; adding a new
  // dynamic .from in the same file requires reviewing and listing that NEW entry — the existing
  // entry's exemption does NOT extend to it.
  //
  // **X.1-X.6 — semantic identity via enclosing_symbol, NOT
  // (line, columnRange).** The design keyed entries on `(file, line, columnRange,
  // fingerprint, reason)`. That made entry identity FRAGILE under any change to the file ABOVE
  // the call site: adding an import, inserting a new helper 200 lines earlier, or running a
  // formatter that wraps lines differently shifts `line` and `columnRange` even though the call
  // site itself is unchanged. Reviewers would see "stale entry" CI failures on PRs that did NOT
  // touch the allowlisted call — eroding trust in the gate and pressuring the team to either
  // disable it or rubber-stamp every "stale" claim. The corrected design replaces `(file, line,
  // columnRange)` with `(file, enclosing_symbol, fingerprint)`:
  // - `enclosing_symbol` is the qualified name of the function/method/class lexically
  // containing the call expression — e.g., `lib/data/showRouter.tsx::resolveTableName` for
  // a module-level function, `lib/auth/internal/some-resolver.ts::SomeClass.lookup` for a
  // class method, `lib/foo.ts::default` for the default-exported anonymous function, or
  // `lib/foo.ts::<module>` for top-level program scope. Resolved via ts-morph: walk
  // `node.getParent` until hitting FunctionDeclaration / FunctionExpression /
  // ArrowFunction / MethodDeclaration / GetAccessor / SetAccessor / ClassDeclaration; emit
  // `<repo-relative-file>::<class>.<method>` (or `<file>::<fn>`, `<file>::default`,
  // `<file>::<module>`).
  // - `fingerprint` is the SHA-256 of the call-site's normalized AST text (unchanged from
  // ). Cosmetic reformatting does NOT change the fingerprint; argument-list edits DO.
  // - The match key is `(file, enclosing_symbol, fingerprint)`. `line` and `columnRange` are
  // RETAINED on the entry as ADVISORY metadata for diagnostics (audit failure messages
  // print "<file>:<line>" so reviewers can find the call quickly), but they are NOT part of
  // the identity used for matching. Reformatting that shifts line/column but does not alter
  // the enclosing symbol or the call's normalized text passes — no false-stale failures.
  //
  // **Ambiguity disambiguator:** when two `.from(<dynamic>)` calls live in
  // the SAME enclosing symbol with the SAME normalized fingerprint (rare but possible — e.g.,
  // two retries of the same call in different branches of one function), the allowlist entry
  // MUST include `occurrence_index: 0 | 1 | 2 | ...` specifying which 0-indexed occurrence (in
  // source order, top-to-bottom) the entry covers. The audit walks the enclosing symbol's body
  // in source order, counts occurrences with a matching `(file, enclosing_symbol, fingerprint)`,
  // and matches the n-th occurrence against the entry whose `occurrence_index` equals n. An
  // ambiguous match (multiple occurrences but no `occurrence_index` provided) fails the audit
  // with `DYNAMIC_FROM_AMBIGUOUS_ALLOWLIST` naming the file and enclosing symbol; the operator
  // must add `occurrence_index` to the entry. For singleton matches, `occurrence_index` is
  // optional and defaults to `0` — most entries omit it.
  //
  // **Fingerprint stability test:** `tests/cross-cutting/auth.test.ts`
  // includes a stability test that pretty-prints the SAME source file under multiple formatter
  // configs (single-quote vs double-quote, semicolons-on vs semicolons-off, 2-space vs 4-space
  // indent) and asserts `fingerprintCallSite` returns the SAME hash for the same logical call
  // expression across all formatter outputs. Test fixture `fingerprint-stability/` contains the
  // same `.from(tableName)` call rendered three ways; the test loads each, fingerprints the
  // call site, and asserts equality. A future regression that lets formatter cosmetics leak
  // into the fingerprint surfaces as a failed test, NOT a flood of false-stale CI failures.
  type DynamicFromAllowEntry = {
    file: string; // repo-relative path (matched via endsWith)
    enclosing_symbol: string; // qualified `<file>::<symbol>` of the lexically enclosing function/method/class
    fingerprint: string; // SHA-256 of the AST node text (the .from(...) call expression source,
                                   // trimmed and normalized — leading/trailing whitespace stripped, runs
                                   // of internal whitespace collapsed to a single space). Recomputed on
                                   // every audit run from the live AST node; mismatch => stale entry.
    occurrence_index?: number; // 0-indexed nth occurrence within the enclosing symbol when the same fingerprint appears multiple times; optional for singleton occurrences (defaults to 0)
    reason: string; // human-readable reviewed justification + reviewer date
    // ADVISORY-ONLY metadata (NOT part of the match key — present so failure diagnostics can
    // print "<file>:<line>" without re-walking the AST; line/column WILL drift under formatter
    // / above-the-call edits and that is fine because they are not consulted during match):
    line_advisory?: number; // 1-indexed source line at last entry-write (diagnostic-only)
    column_advisory?: [number, number]; // 0-indexed [start, end) column range at last entry-write (diagnostic-only)
  };
  const DYNAMIC_FROM_ALLOWLIST: ReadonlyArray<DynamicFromAllowEntry> = [
    // Initially EMPTY. Format example:
    // {
    // file: 'lib/auth/internal/some-resolver.ts',
    // enclosing_symbol: 'lib/auth/internal/some-resolver.ts::SomeClass.lookup',
    // fingerprint: 'sha256-…',
    // // occurrence_index omitted because the fingerprint appears only once in the symbol
    // reason: 'table name comes from a static enum literal map; resolver is auth-library-
    // internal and never reaches user-facing routes; reviewed by Eric on YYYY-MM-DD.',
    // line_advisory: 47, // diagnostic-only — drifts under formatter edits
    // column_advisory: [12, 56], // diagnostic-only — drifts under formatter edits
    // }
  ];
  function fingerprintCallSite(node: Node): string {
    // Normalize: trim, collapse internal whitespace runs to a single space. SHA-256 the result.
    // Stable across cosmetic reformat (indentation, line breaks within the call) but breaks on
    // argument changes — editing the call's argument list invalidates the entry and forces
    // re-review. Audit imports `import { createHash } from 'node:crypto'` at the top of the file.
    const raw = node.getText;
    const normalized = raw.trim.replace(/\s+/g, ' ');
    return 'sha256-' + createHash('sha256').update(normalized).digest('hex');
  }
  function getEnclosingSymbol(node: Node): string {
    // X.1-X.6 : walk upward through the AST to find the nearest
    // FunctionDeclaration / FunctionExpression / ArrowFunction / MethodDeclaration / GetAccessor
    // / SetAccessor / ClassDeclaration that lexically contains `node`. Compose
    // `<repo-relative-file>::<symbol>` where <symbol> is:
    // - For a named FunctionDeclaration: the function name.
    // - For a MethodDeclaration / GetAccessor / SetAccessor: `<ClassName>.<methodName>` (or
    // `<ClassName>.[get|set]<accessorName>`).
    // - For an ArrowFunction / FunctionExpression assigned to a const/let/var: the binding name.
    // - For a default export of an anonymous function: `default`.
    // - For top-level module scope (no enclosing function): `<module>`.
    // ts-morph: walk `node.getParent` until matching one of the kinds above; for class methods,
    // also walk up to the ClassDeclaration to compose the class-qualified name. The repo-relative
    // file path strips the project root prefix and uses forward slashes on all platforms
    // (`path.relative(repoRoot, sf.getFilePath).replaceAll('\\', '/')`).
    //
    // **Wrapped inline route handler pattern.** The bare
    // walk-to-FunctionLike strategy above produces an UNSTABLE / non-deterministic enclosing
    // symbol for inline-function arguments to higher-order wrappers, which is the dominant
    // shape of Next.js App Router route handlers in this codebase
    // (`export const GET = withAdmin(async (req) => { ... })`,
    // `export const POST = withAdmin(withRateLimit(async (req) => { ... }))`,
    // and deeply anonymous nested forms). Without explicit handling, the walk would emit
    // `route.ts::default` or `route.ts::<module>` for the inline arrow body — both of which
    // collide across every route handler in the same file. `composeQualifiedSymbol` therefore
    // implements an explicit wrapped-pattern scheme:
    //
    // 1. **Bare named export** (no wrapper): `export const GET = async (req) => { ... }`
    //    → emit `<file>::GET` (the binding name on the `export const`).
    // 2. **Single wrapper, inline arg**: `export const GET = withAdmin(async (req) => { ... })`
    //    → walk up from the inline arrow until reaching a `CallExpression` whose result is bound
    //    to an `export const` (or `export default`) declaration; emit
    //    `<file>::<exportName>-><wrapperCalleeName>[<argIndex>]` where `argIndex` is the 0-indexed
    //    position of the inline function within the call's argument list. So the example emits
    //    `<file>::GET->withAdmin[0]`. The export name and the wrapper-callee name BOTH appear so
    //    the symbol is stable when the file is reformatted (line/column shifts) and unambiguous
    //    when multiple wrapped-export sites coexist in the same file.
    // 3. **Nested wrappers, inline arg**:
    //    `export const POST = withAdmin(async (req) => withRateLimit(req, async (r) => { ... }))`
    //    → walk all enclosing `CallExpression` ancestors and chain the wrapper segments outermost-
    //    to-innermost: emit `<file>::POST->withAdmin[0]->withRateLimit[1]`. Each segment carries
    //    its callee name + the argIndex of the next-deeper enclosing function within that call.
    // 4. **Deeply anonymous nested** (no wrapper-bound export name at the top): when no
    //    enclosing `CallExpression` chain terminates at an `export const <name> =` or
    //    `export default`, fall back to `<module>` as the export name — but ALWAYS continue the
    //    wrapper chain from there: e.g.,
    //    `<file>::<module>->mountRoute[0]->withAdmin[0].body[N]` where `body[N]` is the
    //    statement-index (0-indexed within the enclosing function body) of the statement that
    //    transitively contains the call expression. The `body[N]` suffix is appended ONLY when
    //    the wrapper chain terminates at a statement-level expression rather than at a binding;
    //    for cases (1)-(3) it is omitted because the binding name already disambiguates.
    // 5. **Stability requirements** — every emitted symbol MUST satisfy:
    //    - **Determinism**: re-running the walk against the same source file produces a
    //      bit-equal symbol.
    //    - **Format-tolerance**: cosmetic reformatting (indentation, line breaks, parentheses
    //      around the inline function) does NOT change the symbol — only the export name,
    //      wrapper callee names, and arg indices are consulted.
    //    - **Disambiguation**: two distinct call sites within the same file produce DIFFERENT
    //      symbols (or the same symbol with `occurrence_index` populated; see ambiguity
    //      disambiguator above). Two route handlers `export const GET = withAdmin(async () => {
    //      // call A })` and `export const POST = withAdmin(async () => { // call B })` must
    //      emit `<file>::GET->withAdmin[0]` vs `<file>::POST->withAdmin[0]` — the export name
    //      forces a different symbol for each call site.
    //
    // **Mandatory test fixtures** (added to `tests/cross-cutting/auth.test.ts` /
    // `tests/cross-cutting/fixtures/auth-x3/`):
    //  - `wrapped-route-handler-named-arg.fixture` — `export const GET = withAdmin(async (req) => {
    //    // dynamic `.from(tableName)` here })`. Asserts `getEnclosingSymbol` returns
    //    `<file>::GET->withAdmin[0]` (deterministic, format-stable, distinct from a sibling
    //    `export const POST` in the same file).
    //  - `wrapped-route-handler-nested-wrappers.fixture` — `export const POST =
    //    withAdmin(withRateLimit(async (req) => { // dynamic `.from` }))`. Asserts symbol
    //    `<file>::POST->withAdmin[0]->withRateLimit[0]` (the inline arrow is the 0th arg of the
    //    inner `withRateLimit`; `withRateLimit` itself is the 0th arg of the outer `withAdmin`).
    //    A variant with the wrappers swapped (`withRateLimit(withAdmin(async (req) => { ... }))`)
    //    asserts the symbol changes to `<file>::POST->withRateLimit[0]->withAdmin[0]` — proving
    //    wrapper-order changes are detected by the audit (both as a fingerprint nuance AND as a
    //    semantic-identity change).
    //  - `wrapped-route-handler-anonymous-deep.fixture` — top-level `mountRoute('/api/foo',
    //    withAdmin(async (req) => { // dynamic `.from` }))` where the outer call is a statement
    //    (not bound to an export). Asserts symbol
    //    `<file>::<module>->mountRoute[1]->withAdmin[0].body[N]` where `N` is the 0-indexed
    //    position of the `mountRoute(...)` statement within the module's top-level statement
    //    list. A second `mountRoute` call later in the same file emits a different `body[M]`
    //    suffix, proving the audit can distinguish two statement-level wrapped sites.
    //  - `wrapped-route-handler-second-arg-position.fixture` — `withRateLimit(60, async (req) =>
    //    { // dynamic `.from` })` (the inline function is the SECOND arg, not the first).
    //    Asserts the argIndex segment is `withRateLimit[1]`, not `withRateLimit[0]`.
    //
    // Each fixture pair includes a "format-tolerance sibling" that re-renders the same file
    // with different formatter outputs and asserts `getEnclosingSymbol` returns a bit-equal
    // string (mirrors the `fingerprintCallSite` stability test). A future refactor that lets
    // line/column shifts leak into the symbol surfaces as a failed test, NOT as a flood of
    // false-stale CI failures across every route handler in the repo.
    return composeQualifiedSymbol(node);
  }
  function isProtectedFromCall(node: Node): boolean {
    if (!Node.isCallExpression(node)) return false;
    const expr = node.getExpression;
    if (!Node.isPropertyAccessExpression(expr)) return false;
    if (expr.getName !== 'from') return false; // not a .from(...) sink
    const args = node.getArguments;
    if (args.length === 0) return true; // from with no args — anomalous; treat as sink
    const first = args[0];
    // String-literal table names go through the existing PROTECTED_SINKS regex list — leave them
    // to that path so the static admin-only check still emits its specific error message. Here we
    // are policing the dynamic-from gap.
    if (Node.isStringLiteral(first) || Node.isNoSubstitutionTemplateLiteral(first)) {
      return false; // string literal: handled by PROTECTED_SINKS regex elsewhere
    }
    // Any non-literal argument (Identifier, PropertyAccessExpression, TemplateExpression with
    // substitutions, conditional expression, call expression, `as any` escape, etc.) is a dynamic-
    // from sink unless THIS SPECIFIC call site is allowlisted by `(file, enclosing_symbol,
    // fingerprint)` semantic identity.
    const sf = node.getSourceFile;
    const filePath = sf.getFilePath;
    const enclosingSymbol = getEnclosingSymbol(node);
    const fingerprint = fingerprintCallSite(node);
    // Find every entry whose (file, enclosing_symbol, fingerprint) matches.
    const candidates = DYNAMIC_FROM_ALLOWLIST.filter(e =>
      filePath.endsWith(e.file) &&
      e.enclosing_symbol === enclosingSymbol &&
      e.fingerprint === fingerprint
    );
    if (candidates.length === 0) return true; // no match → sink (audit must throw)
    if (candidates.length === 1 && candidates[0].occurrence_index === undefined) {
      // Singleton entry without disambiguator: only valid if THIS call site is the sole
      // occurrence of (enclosing_symbol, fingerprint) in the file. If multiple occurrences share
      // the same enclosing symbol AND fingerprint and the entry omits `occurrence_index`, the
      // entry is AMBIGUOUS — fail with DYNAMIC_FROM_AMBIGUOUS_ALLOWLIST.
      const allOccurrences = collectFromCallsInSymbol(sf, enclosingSymbol).filter(n =>
        fingerprintCallSite(n) === fingerprint
      );
      if (allOccurrences.length > 1) {
        throw new Error(`DYNAMIC_FROM_AMBIGUOUS_ALLOWLIST at ${filePath}::${enclosingSymbol} — ${allOccurrences.length} occurrences with fingerprint ${fingerprint} but allowlist entry omits occurrence_index`);
      }
      return false; // singleton match → exempt
    }
    // Disambiguator path: at least one entry has `occurrence_index`. Compute THIS node's
    // 0-indexed occurrence within (enclosing_symbol, fingerprint) and find the matching entry.
    const occurrencesInSymbol = collectFromCallsInSymbol(sf, enclosingSymbol).filter(n =>
      fingerprintCallSite(n) === fingerprint
    );
    const nodeIndex = occurrencesInSymbol.findIndex(n => n.getStart === node.getStart);
    const matched = candidates.find(e => (e.occurrence_index ?? 0) === nodeIndex);
    return !matched;
  }
  // findProtectedSinks is ALSO extended to classify any node for which isProtectedFromCall(node)
  // returns true as a protected sink. Audit emit message:
  // `AC-X.3 violation: dynamic .from(<arg>) sink at <file>:<line> — non-literal table-name
  // argument bypasses the static admin-only allowlist. Either (a) refactor the call site to
  // use a string literal so PROTECTED_SINKS can audit it, or (b) add an entry to
  // DYNAMIC_FROM_ALLOWLIST with reviewed justification.`
  //
  // **Required negative fixture (X.1-X.6 , mandatory):**
  // - `bad-dynamic-from-bypass.tsx`: a route file outside AUTH_LIB_ALLOWLIST whose handler does
  // `const tableName = req.query.table; await supabase.from(tableName).select('*');` (the
  // classic dynamic-from bypass pattern — `tableName` is a parameter, NOT a string literal).
  // The audit MUST throw because (a) the call site is outside DYNAMIC_FROM_ALLOWLIST and (b)
  // `from`'s argument is non-literal. A bug-class regression: prior to this fixture
  // would silently pass because every PROTECTED_SINKS regex requires a quoted table name and
  // `from(tableName)` matches none of them.
  // - Companion `bad-template-from-bypass.tsx`: same bug class via a template literal with a
  // substitution: `` await supabase.from(`${prefix}_${suffix}`).select('*') `` — must also throw.
  // - Companion `good-from-string-literal.tsx`: a route doing `from('shows')` (string literal) —
  // must NOT throw the dynamic-from rule because the literal goes through PROTECTED_SINKS
  // regex (separate audit path; the auth chain still gates the call).
  // - **Required negative fixture:**
  // `bad-second-dynamic-from-in-allowlisted-file.fixture` — a file whose path is `lib/auth/
  // internal/some-resolver.ts` (i.e., the SAME file allowlisted in `DYNAMIC_FROM_ALLOWLIST`
  // for an EXISTING dynamic .from in `SomeClass.lookup`). The file contains a SECOND, NEW
  // dynamic `.from(otherTable)` in a DIFFERENT enclosing symbol (e.g., a new top-level helper
  // `resolveSecondaryTable`) than the existing allowlist entry. The audit MUST throw because
  // the new call site's `(file, enclosing_symbol, fingerprint)` does not match any allowlist
  // entry — even though the file path does. This directly tests the file-scoped-vs-symbol-
  // scoped distinction: a file-scoped allowlist would silently bless the new site; the corrected semantic-identity contract rejects it. Companion
  // fixture `good-allowlisted-call-site-unchanged.fixture`: the SAME file with ONLY the
  // existing allowlisted call site (no new dynamic-from added) — must NOT throw.
  //
  // - **Required positive fixture: formatter-edit
  // tolerance.** `good-allowlisted-call-site-after-formatter.fixture` — the SAME allowlisted
  // call site as `good-allowlisted-call-site-unchanged.fixture`, but with 50 import lines
  // inserted at the top of the file AND with the call expression's argument list reformatted
  // onto multiple lines (preserved fingerprint via whitespace normalization). `line` and
  // `columnRange` of the call site shift — but `enclosing_symbol` is unchanged AND
  // `fingerprint` is unchanged. The audit MUST NOT throw. This directly tests
  // finding 3's "no false-stale failures under formatter edits" promise. Companion negative
  // fixture `bad-allowlisted-argument-changed.fixture` — same allowlisted site but the
  // argument list is edited (`.from(tableName)` → `.from(tableName + suffix)`); fingerprint
  // changes; entry is now stale. The audit MUST throw — argument-list changes invalidate the
  // reviewed exemption.
  //
  // - **Required ambiguity fixture.**
  // `bad-ambiguous-from-without-occurrence-index.fixture` — a file with TWO `.from(tableName)`
  // calls in the SAME enclosing symbol (`SomeClass.retryLookup`), with the SAME normalized
  // fingerprint (e.g., one in the try-block, one in the catch-block retry path). Allowlist
  // contains one entry for this `(file, enclosing_symbol, fingerprint)` tuple WITHOUT
  // `occurrence_index`. The audit MUST throw `DYNAMIC_FROM_AMBIGUOUS_ALLOWLIST` naming the
  // file and enclosing symbol. Companion positive fixture
  // `good-ambiguous-from-with-explicit-occurrence-index.fixture` — same file, but the
  // allowlist entry adds `occurrence_index: 1` (covering only the catch-block retry); a
  // second entry covers `occurrence_index: 0` (the try-block). The audit MUST NOT throw, and
  // each occurrence must match exactly one entry.
  //
  // - **Required fingerprint stability test — added
  // to Step 1 test list (see Step 1 below).** Fixture directory `fingerprint-stability/`
  // contains three sibling files `singleq.ts`, `doubleq.ts`, `tabs4.ts` — all three render
  // the SAME logical `.from(tableName)` call inside the SAME enclosing symbol but with
  // different formatter outputs (single-quote string literals + 2-space indent + semicolons;
  // double-quote + 2-space + no-semicolons; double-quote + 4-space + semicolons). The test
  // loads each, finds the `.from(...)` CallExpression, fingerprints it, and asserts all three
  // fingerprints are bit-equal. A future regression (e.g., a non-whitespace-normalizing
  // change to `fingerprintCallSite`) fails this test instead of producing a flood of CI
  // stale-entry false positives on real PRs.
  //
  // **Defense-in-depth note**: the same rule already applies to `.rpc(<arg>)` via
  // isProtectedRpcCall above — non-literal RPC names are ALWAYS sinks (no allowlist). The
  // `.from` rule mirrors that contract for symmetry; the only difference is `.from` gets a
  // (reviewed, initially-empty) escape-hatch allowlist because some auth-internal resolvers
  // legitimately resolve table names from static maps. Verify the .rpc rule is still in place
  // — it is, see `isProtectedRpcCall` above.

  function chainPositions(text: string, chain: readonly string[]): { name: string; pos: number }[] {
    return chain.map(name => {
      const m = text.indexOf(name + '('); // call site, not just import
      return { name, pos: m >= 0 ? m : -1 };
    });
  }

  for (const sf of project.getSourceFiles) {
    const path = sf.getFilePath;

    // 1. Banned-identifier + banned-string-literal audit (any file outside the auth-library allowlist).
    if (!AUTH_LIB_ALLOWLIST.some(p => path.endsWith(p))) {
      // 1a. Identifier nodes (catches `import { link_sessions } from ...`-style use).
      for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
        if (BANNED_OUTSIDE_AUTH_LIB.includes(id.getText)) {
          throw new Error(`Banned auth primitive '${id.getText}' at ${path}:${id.getStartLineNumber} — must go through lib/auth/`);
        }
      }
      // 1b. StringLiteral nodes. Catches `.from('link_sessions')`,
      // `.rpc('crew_member_auth_lookup')`, `cookies.get('__Host-fxav_session')`, etc.
      for (const lit of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
        const v = lit.getLiteralValue;
        if (BANNED_OUTSIDE_AUTH_LIB.includes(v)) {
          throw new Error(`Banned auth primitive string '${v}' at ${path}:${lit.getStartLineNumber} — must go through lib/auth/`);
        }
      }
      // 1c. NoSubstitutionTemplateLiteral (template strings without ${}) for the same surface.
      for (const lit of sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
        const v = lit.getLiteralText;
        if (BANNED_OUTSIDE_AUTH_LIB.includes(v)) {
          throw new Error(`Banned auth primitive template-string '${v}' at ${path}:${lit.getStartLineNumber} — must go through lib/auth/`);
        }
      }
    }

    // 2. Per-route chain audit using trust-domain classification.
    // AST-driven server-action detection runs FIRST, before any path-based skip.
    // Earlier draft classified by filename only (`app/**/actions.ts` = server-action), which
    // meant inline `'use server'` actions in component files (`app/show/components/*.tsx`,
    // `app/admin/dev/page.tsx`) escaped audit because the path-based classifier put them in
    // `non-route` and the early-continue skipped them. The corrected design scans EVERY .ts/.tsx
    // file under `app/**` for `'use server'` directives BEFORE the classification skip.
    const serverActions = findServerActionsInFile(sf);
    // findServerActionsInFile walks every directive in the file and returns:
    // [{ node: FunctionDeclaration|ArrowFunction|MethodDeclaration, name: string,
    // directiveKind: 'module' | 'function-scoped' | 'inline-form-action' }]
    // Detection rules:
    // - Module-level `'use server'` directive at the top of a file → EVERY exported function in
    // that file is a server action (regardless of filename).
    // - Function-scoped `'use server'` directive at the top of an async function body →
    // that specific function is a server action (Next.js inline-action pattern, common in
    // component files for forms).
    // - Server actions wired via Next.js `<form action={...}>` patterns where the action is
    // itself a function defined with a function-scoped directive — caught by the same
    // function-scoped scan.

    const pathClassification = classifyTrustDomain(path); // 'crew-session' | 'admin' | 'me' | 'auth-library' | 'public-bootstrap' | 'public-webhook' | 'cron-internal' | 'non-route' | 'unclassified'
    if (pathClassification === 'unclassified') {
      throw new Error(`File ${path} is not classified in TRUST_DOMAINS. Add it to the classification map (Task X.3).`);
    }

    // 2a. If the file declares any server actions, audit each action separately with a chain
    // inherited from its containing route subtree (NOT the file's path-based classification).
    // Trust domain inference for server-action entries:
    // - file under `app/show/**` → 'crew-session' chain
    // - file under `app/admin/**` → 'admin' chain
    // - file under `app/me/**` → 'me' chain
    // - file under `app/api/**` → defer to the route's path-based classification
    // This ensures component files with inline `'use server'` get audited even though the
    // file as a whole would otherwise be `non-route`.
    if (serverActions.length > 0) {
      const inheritedChain = inheritedChainForAction(path); // returns CREW_SESSION_CHAINS / ['requireAdmin'] / ['validateGoogleSession']
      for (const action of serverActions) {
        // Each action is its own audit entry; build a call graph rooted at action.node.
        auditEntryAgainstChain(sf, action.node, inheritedChain, `${path} server-action ${action.name}`);
      }
      // Continue so file-as-a-whole audit still runs for any non-action exports (page render,
      // route handler) — those are checked by the regular entry resolver below.
    }

    // 2b. File-as-a-whole audit for non-action entries (page.tsx, route.ts).
    if (pathClassification === 'auth-library' || pathClassification === 'public-bootstrap' ||
        pathClassification === 'public-webhook' || pathClassification === 'cron-internal' ||
        pathClassification === 'non-route') {
      continue; // these domains have their own auth contract; the user-validator chain doesn't apply
                  // (server actions in these files were already audited in 2a above)
    }
    const expectedChain: ExpectedChain =
        pathClassification === 'crew-session' ? CREW_SESSION_CHAINS // terminal-success branches
      : pathClassification === 'admin' ? ['requireAdmin']
      : pathClassification === 'me' ? ['validateGoogleIdentity'] // cross-show identity-only validator (NOT validateGoogleSession, which is show-bound)
      : pathClassification === 'server-action' ? inheritedChainForAction(path) // legacy path-based server-action classification (still recognized for `actions.ts` files)
      : ( => { throw new Error(`unhandled domain: ${pathClassification}`); });

    // Helper: normalize ExpectedChain to a set of candidate single-chain orderings the audit can iterate.
    function candidateChains(chain: ExpectedChain): ReadonlyArray<ValidPath> {
      if (Array.isArray(chain)) return [chain]; // single ValidPath required
      return chain.anyOf; // terminal-success branches (OR semantics)
    }

    // 2c. AST-driven control-flow audit on remaining (non-action) request entries.
    // Server-action entries were already audited in 2a above (regardless of file path); this block
    // catches every OTHER server-side App Router entry. NOTE:
    // `findRequestEntries` no longer enumerates server actions — those are owned by 2a's
    // `findServerActionsInFile` which detects them via AST regardless of filename. Earlier
    // draft conflated them, which (combined with the path-based classification skip) meant inline
    // `'use server'` actions in component files were skipped twice — once because the file was
    // classified `non-route`, again because `findRequestEntries` was only scoped to `actions.ts`.
    //
    // **X.1-X.6 **: `findRequestEntries` now discovers the FULL set of
    // server-side execution entries App Router invokes per request, NOT just page-default and
    // route-HTTP-methods. Each discovered entry runs through the chain audit independently because
    // each can touch protected sinks before the page itself renders (or after it short-circuits).
    // `findRequestEntries` classifies each entry via the kind discriminator below; the audit treats
    // every kind identically (chain must dominate sinks on every control-flow path):
    // - `kind: 'page'` — `page.tsx`/`page.ts` default export.
    // - `kind: 'route-handler'` — `route.ts` named exports `GET`/`POST`/`PUT`/`DELETE`/`PATCH`/`OPTIONS`/`HEAD`.
    // - `kind: 'generate-metadata'` — `page.tsx`/`layout.tsx`/`route.ts`/`metadata.ts` named export
    // `generateMetadata`.
    // - `kind: 'generate-viewport'` — same files, named export `generateViewport` (server-side, same
    // capability profile as `generateMetadata`).
    // - `kind: 'head'` — `head.tsx`/`head.ts` default export (legacy App Router head
    // Server Component; still supported through Next 15+).
    // - `kind: 'loading'` — `loading.tsx`/`loading.ts` default export (streaming loading
    // UI Server Component; renders before page completes; can fetch).
    // - `kind: 'error'` — `error.tsx`/`error.ts` default export iff the file does NOT
    // contain a `'use client'` directive at the top (Next.js
    // convention is client error boundaries, but `global-error.tsx`
    // and non-`'use client'` error files render server-side).
    // - `kind: 'not-found'` — `not-found.tsx`/`not-found.ts` default export (server-rendered
    // when `notFound` fires; can fetch).
    // - `kind: 'template'` — `template.tsx`/`template.ts` default export (re-rendered server-
    // side per navigation).
    // Each entry uses the SAME trust-domain classification that `classifyTrustDomain(path)` returned
    // for the file: a `crew-session` page's `generateMetadata` is `crew-session`, an `admin` page's
    // `loading.tsx` is `admin`, etc. The candidate-chain matching in 2c below is identical for every
    // entry kind.
    const entries = findRequestEntries(sf); // returns [{ node, kind: 'page' | 'route-handler' | 'generate-metadata' | 'generate-viewport' | 'head' | 'loading' | 'error' | 'not-found' | 'template', name? }]
    if (entries.length === 0) continue; // no entry points — file is config/component-only (server actions, if any, were already audited in 2a)

    for (const entry of entries) {

    // Build a call graph rooted at the entry. Walk every reachable statement on every control-flow path.
    const callGraph = buildCallGraph(sf, entry.node); // resolves local helpers transitively

    // Find every protected sink in the reachable subgraph.
    const reachableSinks = findProtectedSinks(callGraph, PROTECTED_SINKS);

      for (const sink of reachableSinks) {
        // For each path from entry → sink, prove SOME ValidPath terminates the chain BEFORE the sink
        //.
        const paths = enumerateControlFlowPaths(callGraph, entry.node, sink.node);
        const candidates = candidateChains(expectedChain); // [ValidPath, ...] — 1 entry for linear, 2+ for terminal-success branches
        for (const flowPath of paths) {
          // Try each candidate chain; the path is valid if AT LEAST ONE candidate dominates.
          let matched = false;
          let lastError = '';
          for (const candidate of candidates) {
            const chainCallsInOrder = candidate.map(name =>
              flowPath.findIndex(stmt => isCallTo(stmt, name))
            );
            // Every chain step must be present on this path:
            if (chainCallsInOrder.some(i => i < 0)) {
              lastError = `missing '${candidate[chainCallsInOrder.findIndex(i => i < 0)]}' from candidate ${candidate.join(' → ')}`;
              continue; // try next candidate
            }
            // Chain steps must appear in declared order on this path:
            let orderOk = true;
            for (let i = 1; i < chainCallsInOrder.length; i++) {
              if (chainCallsInOrder[i] < chainCallsInOrder[i - 1]) {
                lastError = `wrong order (${candidate[i]} before ${candidate[i - 1]}) for candidate ${candidate.join(' → ')}`;
                orderOk = false;
                break;
              }
            }
            if (!orderOk) continue;
            // The last chain step must precede the sink on this path:
            const lastChainIndex = chainCallsInOrder[chainCallsInOrder.length - 1];
            const sinkIndex = flowPath.indexOf(sink.node);
            if (sinkIndex < lastChainIndex) {
              lastError = `sink fires BEFORE chain completion for candidate ${candidate.join(' → ')}`;
              continue;
            }
            // **Outcome-discriminator audit.** Calling the validator is not
            // enough — the route MUST inspect the discriminated-union result (`{ kind: 'success' |
            // 'continue' | 'terminal_failure' }`, spec §7.2.2; plan ~line 2545) before any sink
            // fires. A route that calls `validateLinkSession`, IGNORES the result, then touches
            // `from('shows_internal')` would otherwise match the candidate even though no
            // discriminator was checked. The walker asserts:
            // (a) for the TERMINAL validator (last entry on the matched candidate), some node
            // BETWEEN its call site and the sink checks `result.kind === 'success'` (or
            // equivalent: `if (result.kind === 'success')`, switch-case 'success', early-
            // return on non-success, ts-pattern `match(result).with({ kind: 'success' }, ...)`).
            // Walking a `result.viewer` property is NOT sufficient — TypeScript narrowing
            // requires the discriminator literal check.
            // (b) for each NON-TERMINAL (preceding) validator, some node BETWEEN its call site and
            // the next validator checks `result.kind === 'continue'` (or equivalent — early-
            // return on `success`/`terminal_failure`, switch-case 'continue').
            const outcomeOk = verifyOutcomeDiscriminators(flowPath, candidate, chainCallsInOrder, sink.node);
            if (!outcomeOk.ok) {
              lastError = `outcome-discriminator missing: ${outcomeOk.reason} for candidate ${candidate.join(' → ')}`;
              continue; // try next candidate
            }
            matched = true;
            break; // this candidate dominates — accept the path
          }
          if (!matched) {
            const candidateList = candidates.map(c => c.join(' → ')).join(' OR ');
            throw new Error(`Protected route ${path} (${classification}, entry=${entry.name ?? entry.kind}): path to sink ${sink.name} matches NO candidate chain. Last error: ${lastError}. Candidates: ${candidateList}`);
          }
        }
      }
    }
  }

  // verifyOutcomeDiscriminators(flowPath, candidate, chainCallsInOrder, sinkNode):
  // Returns { ok: true } | { ok: false, reason: string }.
  // For each validator on the candidate at index i:
  // - Resolve `binding`: walk from chainCallsInOrder[i] upward through Parent until a
  // VariableDeclaration whose initializer (or AwaitExpression argument) IS the validator
  // CallExpression. If the call result is not bound (e.g., `await validateLinkSession;`
  // with the value discarded), return { ok: false, reason: `result of '${candidate[i]}' is
  // discarded — must be captured in a const and the .kind discriminator checked` }.
  // - Determine `windowEnd`:
  // - terminal validator (i === candidate.length - 1): the sinkNode index on flowPath.
  // - non-terminal validator: chainCallsInOrder[i+1] (the next validator's call site).
  // - Determine `requiredDiscriminator`:
  // - terminal validator: 'success'
  // - non-terminal validator: 'continue'
  // - Walk flowPath nodes between chainCallsInOrder[i] (exclusive) and windowEnd (exclusive).
  // Accept the candidate as proven for this validator if any of the following appears on the
  // path AND dominates the next call/sink:
  // (a) `if (binding.kind === '<requiredDiscriminator>')` — IfStatement whose Expression is
  // a BinaryExpression (===) with left = PropertyAccess(binding, 'kind') and right =
  // StringLiteral(requiredDiscriminator). The protected sink/next-validator must reside
  // inside the then-branch (terminal validator) OR after the if-block (non-terminal
  // with early-return-on-non-success).
  // (b) Early-return on the OPPOSITE: `if (binding.kind !== '<requiredDiscriminator>') return
  // ...` (or `redirect(...)`, `NextResponse.json(...)`, `notFound`) — accepted because
  // control flow after the IfStatement is narrowed by TypeScript to the success branch.
  // (c) `switch (binding.kind) { case '<requiredDiscriminator>': .. }` — SwitchStatement on
  // PropertyAccess(binding, 'kind') with a CaseClause for the required discriminator
  // whose body dominates the remaining flow.
  // (d) ts-pattern `match(binding).with({ kind: '<requiredDiscriminator>' }, handler)` —
  // CallExpression chain (`match(binding).with(...).otherwise(...)` or `.exhaustive`)
  // with a `.with({ kind: '<requiredDiscriminator>' }, ...)` call where the handler
  // reaches the sink/next-validator.
  // - If no acceptable discriminator check is found on the path window, return
  // { ok: false, reason: `validator '${candidate[i]}' result captured but its .kind
  // discriminator was never inspected before ${i === candidate.length - 1 ? 'sink ' +
  // sinkNode.name : 'next validator ' + candidate[i+1]}` }.
  // - Bare fall-through (next validator runs unconditionally without ever reading
  // `binding.kind`) is REJECTED — that's the exact bug class this audit catches.
  // If all validators on the candidate satisfy the rule, return { ok: true }.
  ````

  This audit asserts:
  - **(a)** no file outside the auth-library allowlist references low-level auth primitives;
  - **(b)** every classified route's reachable paths to a protected sink pass through the declared chain in declared order;
  - **(c)** validator calls in DEAD branches (provably unreachable) do NOT count toward the audit — only paths that reach a sink matter;
  - **(d)** helper functions are inlined transitively across module boundaries — `handler → loadShow → from('shows_internal')` is attributed correctly whether `loadShow` is defined locally OR imported from another file. The call-graph builder follows imports via `tsmorph`'s `ImportDeclaration` resolution. **An imported helper that touches a protected sink before the local validator chain runs is a violation, NOT an exempt black box.** Earlier draft only inlined locally-defined helpers, leaving `import { loadShow } from '@/lib/data/loadShow'` as an escape hatch where the imported function could fetch from `shows_internal` before any validator. Required regression fixture: `bad-imported-helper.tsx` — a route that imports `loadShow` from a sibling module, calls `loadShow` BEFORE `validateLinkSession`, where `loadShow` queries `shows_internal`. Audit MUST reject this even though the sink call doesn't appear textually in the route file. As a defense-in-depth fallback when an import resolves to an external module the audit can't statically inline (e.g., a node_modules helper), the audit conservatively treats the call site as a sink unless the function is explicitly added to a `KNOWN_PURE_HELPERS` allowlist;
  - **(e)** any new file in `app/api/`, `app/admin/`, `app/show/`, or `app/me/` that isn't classified in `TRUST_DOMAINS` fails CI immediately, forcing the engineer to declare its trust domain explicitly;
  - **(f)** every validator's discriminated-union outcome is INSPECTED before any sink fires. A route that calls `validateLinkSession` and IGNORES the `{ kind: 'continue' }` result, then touches a protected sink, is rejected even though presence + order + sink-after-call all pass. The terminal validator's `kind === 'success'` discriminator MUST be checked before the sink; each preceding validator's `kind === 'continue'` discriminator MUST be checked before falling through to the next validator.

- [ ] **Step 2: Regression fixtures** in `tests/cross-cutting/fixtures/auth-x3/`:
  - `bad-import-only.tsx`: imports `validateLinkSession` but never calls it; queries `shows_internal` — must throw.
  - `bad-access-before-validate.tsx`: queries `shows_internal` then later calls `validateLinkSession` — must throw.
  - `bad-direct-link-sessions.ts`: a route file outside the allowlist that does `from('link_sessions')` — must throw.
  - **`bad-bootstrap-nonces-direct-access.tsx`**: a route file outside the auth-library allowlist that does `supabase.from('bootstrap_nonces').select(...)` (or any verb) — must throw because `bootstrap_nonces` is admin-only per spec §4.3 and is now in PROTECTED_SINKS. Only auth-library files (`app/api/auth/redeem-link/route.ts` consume path; `/show/<slug>/p` mint path via the bootstrap-shell route) may legitimately touch this table; any other route reading or writing it bypasses the login-CSRF defense.
  - `good-validator-first.tsx`: calls `validateLinkSession` on the first line, then `getShowForViewer` — must NOT throw.
  - `good-allowlisted.ts`: `app/api/auth/redeem-link/route.ts` reads `link_sessions` directly — must NOT throw (allowlisted).
  - **`good-redeem-link-via-auth-lib.tsx`**: `app/api/auth/redeem-link/route.ts` legitimately reads/UPSERTs `bootstrap_nonces` for the atomic single-use consumption per §7.2 / AC-5.13; because the file is in `AUTH_LIB_ALLOWLIST`, the audit MUST NOT throw. Companion fixture `good-bootstrap-shell-mint.tsx`: the `/show/<slug>/p` server-rendered bootstrap shell INSERTs a `bootstrap_nonces` row at mint time per the contract — this file MUST also be in the allowlist (it's the only legitimate non-redeem-link mint surface). If the shell route is not yet in `AUTH_LIB_ALLOWLIST`, this fixture's failure is the signal to add it.
  - ** / Fix 2 terminal-success branches — one fixture per spec-allowed branch (must NOT throw)**. The current 4-branch design (B1 admin-precedence; B2 link wins; B3 link continue → google; B4 link continue → google continue → admin) replaces the link-first ordering. **Branch B1 starts with `requireAdmin` (under the `isAdminSession(req) === true` guard), NOT with `validateLinkSession`** — admin-precedence is the whole point of B1. Branches B2/B3/B4 all start with `validateLinkSession` because admin was not detected:
    - `good-b1-admin-precedence.tsx`: route guards on `isAdminSession(req)`; in the true-branch runs `requireAdmin` AS THE FIRST validator on the path; link + google are NEVER called; sinks fire after admin's success. Audit accepts via B1. **The retired `good-b1-link-wins.tsx` fixture's link-success behavior is now covered by `good-b2-link-wins.tsx`** — link-success is B2 in the current design, not B1.
    - `good-b2-link-wins.tsx`: route calls `isAdminSession(req)` (returns false in this fixture), then `validateLinkSession`; on `success` returns/renders directly; google + admin are NEVER called; sinks fire after link's success. Audit accepts via B2.
    - `good-b3-google-wins.tsx`: admin not detected → `validateLinkSession` continue → `validateGoogleSession` succeeds; admin never called. Audit accepts via B3.
    - `good-b4-google-then-admin.tsx`: admin not detected → link continue → google continue → admin succeeds; sinks fire after admin. Audit accepts via B4.
    - **`good-admin-precedence-no-link.fixture`**: route classified `crew-session`; admin session present (per `isAdminSession`); NO `__Host-fxav_session` cookie present at all; NO Google session. Route calls `isAdminSession(req)` → true; calls `requireAdmin` → success; sinks fire after admin's success. Audit MUST accept via B1 with link + google NEVER called. Proves B1 doesn't require a cookie or a Google session — it's the canonical admin-only path. **There is NO B5 in the current 4-branch design (B1..B4); the retired `good-b5-admin-precedence.tsx` fixture from earlier drafts is removed by Fix 2.**
  - ** / Fix 2 negative cases (must throw)**: - **`bad-link-before-admin-precedence.fixture`**: an old-style chain that runs `validateLinkSession` BEFORE checking `isAdminSession`. Specifically: route calls `validateLinkSession` first, then conditionally calls `requireAdmin` only on link's `continue` outcome. This was the link-first ordering that the retired — it silently downgrades admins-with-valid-link-cookies to crew-mode because link returns `success` and the chain stops before admin is checked. Audit MUST throw because no `ValidPath` in `CREW_SESSION_CHAINS` permits link-before-admin-precedence: B1 starts with `requireAdmin` (under the admin guard); B2/B3/B4 only start with `validateLinkSession` AFTER `isAdminSession(req)` has been called and returned false. The audit recognizes admin-precedence as a conditional whose test statically resolves to a call to `isAdminSession` from `lib/auth/isAdminSession.ts` — a route that calls `validateLinkSession` without that admin-precedence guard preceding it fails the audit.
    - `bad-skip-link.tsx`: route calls `requireAdmin` directly WITHOUT the `isAdminSession(req)` admin-precedence guard preceding it AND WITHOUT calling `validateLinkSession` on any non-admin code path. Audit MUST throw because: (a) for B1 acceptance the admin call must be reached through the `isAdminSession(req) === true` guard — a bare `requireAdmin` call without that guard is NOT B1; (b) for B2/B3/B4 the path must start with `validateLinkSession`. Neither holds, so no `ValidPath` matches. **The earlier rationale "every B1..B5 starts with validateLinkSession" is wrong on the current 4-branch design** (B1 starts with `requireAdmin` under the admin guard; only B2/B3/B4 start with `validateLinkSession`); this fixture's CORRECT rationale per Fix 2 is the dual-condition statement above. The retired B5 reference is removed.
    - `bad-google-before-link.tsx`: route reaches the non-admin code path (admin guard returned false), then calls `validateGoogleSession` BEFORE `validateLinkSession` → wrong order on every non-admin branch (B2/B3/B4 all start with `validateLinkSession`).
    - `bad-sink-before-terminal.tsx`: route calls `validateLinkSession` (returns success), but ALSO accesses `from('shows_internal')` BEFORE the link call → sink fires before terminal validator on every branch.
    - **`bad-ignored-continue.tsx` ( outcome-discriminator regression)**: route calls `await validateLinkSession`, IGNORES the result (e.g., `await validateLinkSession;` with no binding, OR `const r = await validateLinkSession;` with `r.kind` never inspected), then accesses `from('shows_internal')` directly. Presence + order + sink-after-call all pass, but `verifyOutcomeDiscriminators` MUST throw because the terminal validator's `kind === 'success'` discriminator is never checked before the sink. Variant: `bad-ignored-continue-bound.tsx` binds the result to `const r` and reads `r.viewer.crewMemberId` (touching `viewer` is NOT the discriminator check) — must throw with reason "captured but its .kind discriminator is never inspected."
    - **`bad-fallthrough-no-continue-check.tsx` ( non-terminal outcome regression)**: route calls `validateLinkSession`, binds the result, then unconditionally calls `validateGoogleSession` and `requireAdmin` without ever reading `linkResult.kind`. Even though every validator on B4 is called in order, the non-terminal validators' `kind === 'continue'` discriminator was never checked — must throw.
    - **`bad-inline-action-in-component.tsx`**: a component file under `app/show/[slug]/components/` declares an async function with a function-scoped `'use server'` directive at the top of its body, and that action body calls `from('shows_internal')` WITHOUT calling `validateLinkSession` first. 's `findServerActionsInFile` MUST detect the inline directive, infer `crew-session` chain from the path subtree, and throw. Earlier draft would have skipped this file entirely because path classification put it in `non-route`.
    - **`bad-module-use-server-non-actions-file.ts`**: a file at `app/admin/dev/helpers.ts` (NOT named `actions.ts`) starts with a top-of-file `'use server'` directive, and exports a function that calls `from('admin_alerts')` without `requireAdmin`. MUST detect the module-level directive and audit every exported function with the inherited `admin` chain.
  - **Superset proof**: `good-stale-linear-tuple.tsx`: route reaches the non-admin code path (admin guard returned false), then calls `validateLinkSession → validateGoogleSession → requireAdmin` and accesses sinks AFTER admin → audit accepts this via B4 (the path is a valid ValidPath in the set). Documented here to prove the audit is a STRICT SUPERSET of : every previously-accepted route still passes.
  - **`good-inline-action-with-validation.tsx` (positive case for inline-action audit)**: a component file under `app/show/[slug]/components/` declares an async function with a function-scoped `'use server'` directive that calls `validateLinkSession` first then `from('shows_internal')`. Audit accepts via B2 (link-success on the non-admin path; B1 would require `isAdminSession`-guarded admin precedence).
  - **DYNAMIC_FROM_ALLOWLIST semantic-identity tests** — added to Step 1 / Step 2 of this task per the new contract above:
    - `good-allowlisted-call-site-after-formatter.fixture` (formatter-edit tolerance) — same allowlisted site as `good-allowlisted-call-site-unchanged.fixture` but with 50 import lines inserted at the top + the call's argument list reformatted onto multiple lines. `enclosing_symbol` and `fingerprint` unchanged. Audit MUST NOT throw.
    - `bad-allowlisted-argument-changed.fixture` — same allowlisted site but the argument list edited (e.g., `.from(tableName)` → `.from(tableName + suffix)`); fingerprint changes; entry stale. Audit MUST throw.
    - `bad-second-dynamic-from-different-symbol.fixture` — `lib/auth/internal/some-resolver.ts` has the existing allowlisted call in `SomeClass.lookup` AND a NEW dynamic `.from(otherTable)` in a NEW top-level helper `resolveSecondaryTable`. The new call has a different `enclosing_symbol` than the existing entry, so audit MUST throw — file-scoped exemption does NOT extend.
    - `bad-ambiguous-from-without-occurrence-index.fixture` (ambiguity required) — file with TWO `.from(tableName)` calls in `SomeClass.retryLookup` with the SAME normalized fingerprint. Allowlist has ONE entry without `occurrence_index`. Audit MUST throw `DYNAMIC_FROM_AMBIGUOUS_ALLOWLIST` naming the file and `SomeClass.retryLookup`.
    - `good-ambiguous-from-with-explicit-occurrence-index.fixture` — same file, but allowlist has TWO entries: `occurrence_index: 0` and `occurrence_index: 1`. Audit MUST NOT throw and each occurrence matches exactly one entry.
    - **Fingerprint stability test (`fingerprint-stability/`)**: three sibling files (`singleq.ts`, `doubleq.ts`, `tabs4.ts`) render the same logical `.from(tableName)` call inside the same enclosing symbol with different formatter outputs (single-quote 2-space + semis; double-quote 2-space no-semis; double-quote 4-space + semis). Test asserts all three `fingerprintCallSite` results are bit-equal. Catches future regressions where formatter cosmetics leak into the fingerprint.
    - **Wrapped inline route handler fixtures — mandatory enclosing_symbol stability for the `export const GET = withAdmin(async ...)` shape**:
      - `wrapped-route-handler-named-arg.fixture` — `export const GET = withAdmin(async (req) => { /* dynamic .from(tableName) */ })` plus a sibling `export const POST = withAdmin(async (req) => { /* dynamic .from(otherTable) */ })`. Test asserts `getEnclosingSymbol` returns `<file>::GET->withAdmin[0]` for the first call and `<file>::POST->withAdmin[0]` for the second — proving the export name disambiguates two route handlers in the same file that would otherwise collide on a bare `<module>` symbol. Each call requires its own allowlist entry; the bare walk-to-FunctionLike strategy would have produced the same `<module>` (or `default`) symbol for both, allowing one allowlist entry to silently exempt the other.
      - `wrapped-route-handler-nested-wrappers.fixture` — `export const POST = withAdmin(withRateLimit(async (req) => { /* dynamic .from */ }))`. Test asserts symbol `<file>::POST->withAdmin[0]->withRateLimit[0]` (the inline arrow is the 0th arg of the inner `withRateLimit`; `withRateLimit` itself is the 0th arg of the outer `withAdmin`). A swapped-wrapper sibling `export const PUT = withRateLimit(withAdmin(async (req) => { /* dynamic .from */ }))` MUST emit a different symbol `<file>::PUT->withRateLimit[0]->withAdmin[0]` — proving wrapper-order changes are detected (a refactor that reorders wrappers should invalidate the allowlist entry, not silently inherit the old exemption). Also includes a non-zero argIndex variant: `export const PATCH = withRateLimit(60, async (req) => { /* dynamic .from */ })` MUST emit `<file>::PATCH->withRateLimit[1]` (the inline function is the 1st arg, after the literal `60`), proving argIndex tracks the inline function's actual position.
      - `wrapped-route-handler-anonymous-deep.fixture` — top-level `mountRoute('/api/foo', withAdmin(async (req) => { /* dynamic .from */ }))` where the outer call is a statement (not bound to an `export const`). Test asserts symbol `<file>::<module>->mountRoute[1]->withAdmin[0].body[N]` where `N` is the 0-indexed top-level statement index of the `mountRoute(...)` statement. A second `mountRoute(...)` statement later in the same file emits `body[M]` with `M !== N` — proving statement-level disambiguation works without a binding name.
      - **Format-tolerance siblings** (one per fixture above): re-render each fixture with different formatter outputs (single-quote vs double-quote, 2-space vs 4-space, line-broken arg list vs single-line). Test asserts `getEnclosingSymbol` returns a bit-equal string across all formatter outputs. Catches a future regression where line/column data leaks into the wrapped symbol — without this guard, every route handler in the repo would generate false-stale CI failures on a `prettier` config bump.
- [ ] **Step 3: Commit** `test(cross-cutting): single auth-entry-point semantic audit (AC-X.3)`.

### Task X.4: No global cursor — positive invariant audit (AC-X.4)

The earlier draft of this task was a defensive grep for the literal `lastPollAt`. That's insufficient: an implementer can introduce a global watermark under any other name (`lastSyncCheck`, `globalCursor`, `app_settings.last_processed_at`, `last_processed_at`) and still pass. The actual invariant is **all sync-decision watermarks are per-show**. This task asserts that positively, with **three layers**: (a) name-based heuristic catches the obvious cases, (b) **semantic data-flow audit** catches the cases that bypass naming, (c) DDL event trigger blocks new columns. The semantic layer is mandatory — naming heuristics alone fail when an engineer introduces a singleton sync checkpoint under a domain-neutral name like `processedAt` or `runStartedAt` on `app_settings`.

**Semantic layer**: every code path that participates in sync gating decisions (Phase 1's invariant gate, Phase 2's monotonic guard, perFileProcessor's watermark check) MUST read its watermark from a per-show or per-row source. The audit walks the call graph from `runScheduledCronSync`, `runManualSyncForShow`, `runPushSyncForShow`, `runOnboardingScan`, and `assetRecovery`; for every comparison against a `modifiedTime`-shape value, asserts the comparison's right-hand operand resolves (transitively) to a column on `shows`, `pending_syncs`, `deferred_ingestions`, or another per-row table on the Step-1 allowlist. A comparison whose right-hand operand resolves to a singleton table or a constant fails the audit regardless of naming.

**Files:** Test: `tests/cross-cutting/no-global-cursor.test.ts`. Migration: `supabase/migrations/20260501T0040_no_global_cursor_event_trigger.sql`.

- [ ] **Step 1: Authored allowlist** — enumerate the only watermark-shaped fields that may participate in sync decisions. ** Fix 3 amendment**: the allowlist is now SPLIT into two named sets so the semantic layer (Step 2 layer 3) can fail the audit when a sync-decision comparison reads a display-only value:

  **AUTHORITATIVE_GATING_WATERMARKS — valid as the RHS of a sync-decision comparison (Drive-derived per-row sources only):**
  - `shows.last_seen_modified_time` (per-show; spec §4.1, §5.2)
  - ** — corrected schema names**: - `pending_syncs.base_modified_time`.
    - `shows.diagrams ->> 'snapshot_revision_id'` (NOT `shows.snapshot_revision_id` — there is no top-level column; the value lives inside the `shows.diagrams` JSONB at JSON path `->> 'snapshot_revision_id'`. Apply-time snapshot-stability checks compare against the JSONB-path expression `(shows.diagrams ->> 'snapshot_revision_id')::uuid = reviewed_revision_id`. The audit MUST recognize the JSONB-path form, not just bare column references; §7 / §6.11; Fix 3 mis-located it).
  - `pending_syncs.staged_modified_time` and `pending_syncs.base_modified_time` (per-row; §6.8.1)
  - `pending_syncs.staged_id`
  - `fileMeta.modifiedTime` / `fileMeta.driveModifiedTime` (per-file; Drive-direct read in `processOneFile(fileMeta)`)
  - `fileMeta.headRevisionId` / `fileMeta.md5Checksum`
  - `deferred_ingestions.deferred_at_modified_time` (per-file; §4.5)
  - `drive_watch_channels.expires_at`, `activated_at`, `superseded_at`, `stopped_at`, `created_at` (per-channel; §5.5.1)

  **DISPLAY_ONLY_TIMESTAMPS — rendered to the operator but NEVER read as the RHS of a sync-decision comparison; a sync-decision read fails the audit:**
  - `shows.last_synced_at` (per-show display field; §5.4 stale-data footer / §9 admin display)
  - `pending_syncs.parsed_at` (display only; §9.2 staged-review panel)
  - `pending_ingestions.last_attempt_at`
  - `pending_ingestions.first_seen_at`
  - `deferred_ingestions.deferred_at` (display only; §9.2 deferred-list)

  **Out-of-scope timestamps — auth/quota/event log; never read by sync gating:**
  - `crew_member_auth.{current_token_version, max_issued_version, revoked_below_version}` (per-crew; auth, not sync)
  - `link_sessions.{expires_at, last_active_at, created_at}` (per-session; auth, not sync)
  - `report_rate_limits.hour_bucket` (per-identity-bucket; bug-report quota, not sync)
  - `sync_log.occurred_at`, `sync_audit.applied_at`, `admin_alerts.{raised_at,last_seen_at,resolved_at}`, `reports.created_at` (per-row event timestamps; never read by sync gating)

  Anything outside the union of these lists with a watermark-shape name (matches `/last_(seen|sync|poll|processed|run|cursor)|watermark|cursor/i`) is a violation. **A sync-decision comparison whose RHS resolves to a `DISPLAY_ONLY_TIMESTAMPS` member is ALSO a violation**, with error message `AC-X.4 violation: sync-decision comparison reads display-only timestamp '<X>'. Display-only timestamps are rendered to the operator but never gate writes; replace with the corresponding authoritative gating watermark (e.g., last_seen_modified_time, base_modified_time, staged_modified_time, or fileMeta.modifiedTime).`

  Anything outside this list with a watermark-shape name (matches `/last_(seen|sync|poll|processed|run|cursor)|watermark|cursor/i`) is a violation.

- [ ] **Step 2: Failing test — three layers of audit:**
  1. **Schema audit (positive allowlist over `information_schema.columns`):**
     ```sql
     SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (column_name ~* 'last_(seen|sync|poll|processed|run|cursor)' OR column_name ~* 'watermark|cursor');
     ```
     Every returned row must be in the Step-1 allowlist. Any new column matching the heuristic without an allowlist entry fails the test. The `app_settings` table specifically must NOT contain any column matching this heuristic.
  2. **Code audit via `ts-morph` (replaces the earlier grep) — token-aware identifier match:**

     ```ts
     import { Project, SyntaxKind, Node } from 'ts-morph';
     const project = new Project({ tsConfigFilePath: 'tsconfig.json' });

     // Tokenize an identifier so 'lastWatermark' → ['last','watermark'] and
     // 'last_processed_at' → ['last','processed','at']. Casing-agnostic.
     function tokens(name: string): string[] {
       return name
         .replace(/([a-z\d])([A-Z])/g, '$1 $2') // camelCase split
         .replace(/[_\-\.]+/g, ' ') // snake/kebab/dot split
         .toLowerCase
         .split(/\s+/)
         .filter(Boolean);
     }

     // Banned token combinations (any identifier whose tokens are a superset of
     // ANY entry below is rejected unless it appears in the allowlist):
     const BANNED_COMBOS: ReadonlyArray<ReadonlyArray<string>> = [
       ['last','watermark'], ['global','watermark'], // catches lastWatermark, globalWatermark, last_watermark, global.watermark
       ['last','cursor'], ['global','cursor'], // catches lastCursor, globalCursor, etc.
       ['last','poll'], ['last','sync','at'],
       ['last','run'], ['last','processed'],
       ['watermark','at'], ['cursor','at'],
       ['app','watermark'], ['app','cursor'], // catches appState.watermark, app_state.cursor
     ];

     // Qualified-reference allowlist — entries are joined property paths like
     // 'shows.last_seen_modified_time'. AST audit accepts these even though
     // they trip BANNED_COMBOS, because they're per-show/per-row and reviewed
     // in the Step-1 allowlist.
     const ALLOWED_REFS = new Set([
       'shows.last_seen_modified_time', 'shows.last_synced_at',
       'pending_syncs.staged_modified_time', 'pending_syncs.base_modified_time', 'pending_syncs.parsed_at',
       'deferred_ingestions.deferred_at_modified_time', 'deferred_ingestions.deferred_at',
       'drive_watch_channels.expires_at', 'drive_watch_channels.activated_at',
       'drive_watch_channels.superseded_at', 'drive_watch_channels.stopped_at', 'drive_watch_channels.created_at',
       'crew_member_auth.current_token_version', 'crew_member_auth.max_issued_version',
       'crew_member_auth.revoked_below_version',
       'link_sessions.expires_at', 'link_sessions.last_active_at', 'link_sessions.created_at',
       'report_rate_limits.hour_bucket',
       'sync_log.occurred_at', 'sync_audit.applied_at',
       'admin_alerts.raised_at', 'admin_alerts.last_seen_at', 'admin_alerts.resolved_at',
       'reports.created_at', 'reports.processing_lease_until',
     ]);

     function isBanned(name: string): boolean {
       const t = new Set(tokens(name));
       return BANNED_COMBOS.some(combo => combo.every(tok => t.has(tok)));
     }

     // Walk every identifier-bearing node. For property accesses, resolve to
     // 'object.property' and check the allowlist before banning.
     // **Source set is driven by tsconfig.json's full TypeScript program**, NOT
     // by hand-coded file globs. The observed that hard-coded
     // globs (lib/, app/, components/, middleware) miss any new root file or
     // directory, which is the exact regression class AC-X.4 must block.
     // `Project` loaded with `tsConfigFilePath: 'tsconfig.json'` enumerates
     // every TS/TSX file the compiler considers — that's the authoritative
     // surface. Test fixture files in tests/cross-cutting/fixtures/ are
     // explicitly EXCLUDED via tsconfig 'exclude' so the audit doesn't trip
     // on its own bad fixtures.
     const allSourceFiles = project.getSourceFiles.filter(sf => {
       const p = sf.getFilePath;
       return !p.includes('/node_modules/') &&
              !p.includes('/tests/cross-cutting/fixtures/') &&
              !p.endsWith('.d.ts');
     });
     for (const sf of allSourceFiles) {
       for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
         const name = id.getText;
         if (!isBanned(name)) continue;
         const parent = id.getParent;
         let qualified = name;
         if (parent && parent.getKind === SyntaxKind.PropertyAccessExpression) {
           const expr = (parent as any).getExpression?.;
           if (expr && Node.isIdentifier(expr)) qualified = `${expr.getText}.${name}`;
         }
         // Element access via brackets, e.g. obj['lastWatermark'] or process.env['LAST_WATERMARK']:
         if (parent && parent.getKind === SyntaxKind.ElementAccessExpression) {
           qualified = parent.getText;
         }
         if (!ALLOWED_REFS.has(qualified) && !ALLOWED_REFS.has(name)) {
           throw new Error(
             `Banned watermark identifier '${qualified}' at ${sf.getFilePath}:${id.getStartLineNumber}. ` +
             `If this is a legitimate per-row watermark, add the qualified reference to ALLOWED_REFS.`
           );
         }
       }
       // Also scan StringLiteral nodes for env-var/process.env access patterns.
       for (const lit of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
         const v = lit.getLiteralValue;
         if (isBanned(v) && !ALLOWED_REFS.has(v)) {
           const parent = lit.getParent;
           // Allow string literals that are unambiguously NOT identifier-shaped
           // references (e.g., a markdown comment in a JSX <pre>).
           if (parent && parent.getKind === SyntaxKind.ElementAccessExpression) {
             throw new Error(
               `Banned watermark string used as element access '${v}' at ${sf.getFilePath}:${lit.getStartLineNumber}.`
             );
           }
         }
       }
     }
     ```

     **Why token-based, not anchored-regex:** the observed that `/^last_?(seen|sync|poll|processed|run|cursor)/` doesn't match `lastWatermark` (token "watermark" is not in the alternation) nor `appState.lastWatermark` (anchor `^` won't match in the middle of a property access). Tokenizing first and asking "does this identifier contain BOTH `last` AND `watermark`?" catches the entire family — `lastWatermark`, `last_watermark`, `LAST_WATERMARK`, `appState.lastWatermark`, `process.env.LAST_WATERMARK` (via the StringLiteral element-access scan), and snake_case variants like `app_state.last_cursor`.

     **Required regression-test fixtures** — the test ships a small `tests/cross-cutting/fixtures/no-global-cursor/` directory containing test files that MUST be detected:
     - `bad-camel.ts`: `export const lastWatermark = new Date;` — must throw.
     - `bad-snake.ts`: `export const last_cursor = 0;` — must throw.
     - `bad-property.ts`: `appState.lastWatermark = Date.now;` — must throw.
     - `bad-bracket.ts`: `process.env['LAST_WATERMARK']` — must throw (StringLiteral element-access scan).
     - `bad-aliased.ts`: `import { state as s } from './x'; s.lastWatermark = 1;` — must throw.
     - **`bad-component.tsx`**: a React Server Component or page like
       ```tsx
       export default function Page {
         const lastWatermark = Date.now;
         return <div>{lastWatermark}</div>;
       }
       ```
       must throw — covers the .tsx blind spot the review surfaced.
     - **`bad-page-prop.tsx`**: a page that destructures `params` and reads `params.lastWatermark` — must throw via PropertyAccessExpression resolution.
     - `good-allowlisted.ts`: `shows.last_seen_modified_time` — must NOT throw.
     - `good-unrelated.ts`: `const lastUserAction = ...` — must NOT throw (no `watermark`/`cursor`/`poll`/etc. token).
     - `good-component.tsx`: a React component using `shows.last_seen_modified_time` from props — must NOT throw.
       The audit test runs the matcher over each fixture file and asserts the expected pass/fail. Then the audit is run over the real `lib/`, `app/` (including .tsx), `components/`, and `middleware.{ts,tsx}` tree.

     The earlier `lastPollAt` literal-string grep is preserved as a defense-in-depth secondary check, but the token-based AST audit is the primary mechanism.

  3. **Semantic data-flow audit.** Naming heuristics alone fail when an engineer introduces a singleton sync checkpoint under a domain-neutral name like `processedAt`, `runStartedAt`, or `checkpoint` on `app_settings` — every word slips through the `last_(seen|sync|poll|processed|run|cursor)|watermark|cursor` regex AND the token combos. The semantic layer catches this by walking the call graph rooted at sync entry points and resolving the SOURCE of every value compared against a `modifiedTime`-shape RHS:

     ```ts
     // tests/cross-cutting/no-global-cursor.test.ts — semantic layer.
     import { Project, SyntaxKind, Node, Type } from "ts-morph";
     const project = new Project({ tsConfigFilePath: "tsconfig.json" });

     // Sync entry points the audit roots at — every sync-decision call graph starts here.
     // Amend this list whenever Task 6.x adds a new entry point.
     // ** Fix 3 amendment**: Apply-time and Discard-time CAS paths are sync-decision
     // entry points too — Task 6.11's Apply CAS (staged_id + base_modified_time IS NOT
     // DISTINCT FROM, per §5.2 / §6.8.2) and Task 6.12's Discard CAS (staged_id, per §6.8.1)
     // both gate writes against per-row Drive-derived watermarks. Earlier draft listed only
     // the cron/push/manual/onboarding/asset-recovery entry points; the Apply/Discard CAS
     // paths went un-audited.
     const SYNC_ENTRY_POINTS = [
       "runScheduledCronSync", // Task 6.7 cron path
       "runManualSyncForShow", // Task 6.8 admin-triggered single-show sync
       "runPushSyncForShow", // Task 6.9 push-mode (Drive webhook)
       "runOnboardingScan", // Task 10.3 wizard scan
       "retrySingleFile", // Task 10.4 hard-fail retry
       "assetRecovery", // Task 7.4 asset_recovery loop
       "applyStagedParse", // Task 6.11 Apply CAS: staged_id + base_modified_time CAS, §5.2 / §6.8.2
       "discardStagedParse", // Task 6.12 Discard CAS: staged_id CAS, §6.8.1
     ];

     // ** Fix 3 amendment**: per-row sources are split into TWO sets — one set of
     // AUTHORITATIVE GATING WATERMARKS (Drive-derived; valid as the RHS of a sync-decision
     // comparison) and one set of DISPLAY-ONLY TIMESTAMPS (rendered to the operator but
     // NEVER gates a write). The earlier flat `ACCEPTABLE_PER_ROW_SOURCES` set blessed
     // `shows.last_synced_at` and `pending_syncs.parsed_at` even though Step 1 explicitly
     // marks them "never gates writes." That permitted an implementer to drift the CAS
     // predicate from the canonical Drive-derived watermark to a display value. The
     // corrected design fails the audit if a sync-decision comparison reads a DISPLAY_ONLY
     // value with: `AC-X.4 violation: sync-decision comparison reads display-only
     // timestamp '<X>'. Display-only timestamps are rendered to the operator but never
     // gate writes; replace with the corresponding authoritative gating watermark (e.g.,
     // last_seen_modified_time, base_modified_time, staged_modified_time, or
     // fileMeta.modifiedTime).`
     //
     // ts-morph resolves a SQL builder call like `from('shows').select('last_seen_modified_time')`
     // OR a typed row property like `showRow.last_seen_modified_time` to one of these.
     const AUTHORITATIVE_GATING_WATERMARKS = new Set([
       // Per-show Drive-derived (§4.1, §5.2, §6.11):
       "shows.last_seen_modified_time",
       // ** — corrected schema names**: // - `shows.base_modified_time` was a stale name; the column lives on `pending_syncs`,
       // NOT `shows`. The Apply-time CAS predicate per §5.2 / §6.8.2 is
       // `shows.last_seen_modified_time IS NOT DISTINCT FROM pending_syncs.base_modified_time`
       // joining the live snapshot against the staged base across the two tables.
       // - `shows.snapshot_revision_id` was a stale name; there is no top-level column. The
       // value lives inside the `shows.diagrams` JSONB at JSON path `->> 'snapshot_revision_id'`.
       // Apply-time snapshot-stability checks read the JSONB-path expression
       // `(shows.diagrams ->> 'snapshot_revision_id')::uuid`. The audit MUST recognize the
       // JSONB-path form as well as a bare column reference.
       "shows.diagrams->>snapshot_revision_id", // JSONB-path form per spec §X.4
       // Per-row Drive-derived (§4.1, §6.8.1):
       "pending_syncs.staged_modified_time",
       "pending_syncs.base_modified_time", // Fix 3: Apply-time CAS predicate per §5.2 / §6.8.2 — column lives on pending_syncs (NOT shows; correction)
       "pending_syncs.staged_id", // Fix 3: Apply/Discard CAS predicate per §5.2 / §6.8.1
       // Per-file from Drive (Task 6.x's processOneFile(fileMeta) parameter):
       "fileMeta.modifiedTime",
       "fileMeta.driveModifiedTime",
       "fileMeta.headRevisionId",
       "fileMeta.md5Checksum", // Fix 3: revision-pin verification per §6.11
       // Per-file (deferred ingestions):
       "deferred_ingestions.deferred_at_modified_time",
       // Per-channel (push-mode subscription lifecycle; gates webhook activation):
       "drive_watch_channels.expires_at",
       "drive_watch_channels.activated_at",
     ]);

     // Display-only timestamps — rendered to the operator (footer freshness, parse panel,
     // retry log) but NEVER read as the RHS of a sync-decision comparison. A sync-decision
     // read of any of these fails the audit.
     const DISPLAY_ONLY_TIMESTAMPS = new Set([
       "shows.last_synced_at", // §5.4 stale-data footer / §9 admin display
       "pending_syncs.parsed_at", // §9.2 staged-review panel display
       // ** — corrected schema name**: real column is `last_attempt_at`
       // (no -ed; per spec §4.1 `create table pending_ingestions` block). Earlier draft used
       // `last_attempted_at` which doesn't exist; resolve calls would never match and the
       // display-only check would silently no-op.
       "pending_ingestions.last_attempt_at", // §9.2 retry-log display ( corrected from `last_attempted_at`)
       "pending_ingestions.first_seen_at", // §9.2 retry-log display
       "deferred_ingestions.deferred_at", // §9.2 deferred-list display
     ]);

     // Legacy flat-set view kept ONLY for backward-compat with code that asks
     // "is this a per-row source at all?". The audit ITSELF uses the SPLIT sets — a sync-
     // decision comparison reading any DISPLAY_ONLY_TIMESTAMPS member fails the audit; an
     // admin-UI / non-sync-decision read of either set is fine.
     const ACCEPTABLE_PER_ROW_SOURCES = new Set([
       ...AUTHORITATIVE_GATING_WATERMARKS,
       ...DISPLAY_ONLY_TIMESTAMPS,
     ]);

     // Forbidden source kinds — any RHS resolving (transitively) to one of these fails the audit
     // regardless of variable name:
     // (a) `from('app_settings')` / `from('system_state')` / `from('runtime_config')` / any singleton table read.
     // (b) `process.env.<NAME>` / `import.meta.env.<NAME>` — env-var-derived watermarks.
     // (c) module-level mutable consts in non-fixture source files (a runtime-mutable export
     // declared at top-of-module is effectively a singleton).
     // (d) untyped JSON literals or `as any` escapes whose source can't be resolved.
     const FORBIDDEN_SOURCE_KINDS: ReadonlyArray<(node: Node) => boolean> = [
       isAppSettingsRead, // matches `from('app_settings')` / supabase RPC variants reading the singleton
       isSingletonTableRead, // matches `from('system_state')`, `from('runtime_config')`, etc. — any table whose row count is 1 and whose name is NOT in ACCEPTABLE_PER_ROW_SOURCES
       isEnvVarRead, // matches `process.env.X`, `import.meta.env.X`, `Deno.env.get('X')`
       isModuleLevelMutableConst, // matches `let WATERMARK = ...` / `export const STATE = { .. }` at module scope
     ];

     // **: missing sync roots are a HARD FAILURE, not a silent skip.**
     // Earlier draft used `if (!decl) continue` so an entry point that vanished from the codebase
     // (rename, accidental deletion, refactor that split it across files) would silently pass the
     // semantic audit. The corrected design runs a precheck FIRST that asserts every name in
     // SYNC_ENTRY_POINTS resolves to exactly one declaration; if any resolves to zero or multiple,
     // the audit throws with the unresolved name(s). The inner loop then trusts the precheck and
     // throws on a missing decl as a defensive backstop (should never fire after the precheck).
     // Required regression test: rename one entry point temporarily and verify the audit fails
     // at the precheck (not silently passes).
     const unresolvedEntries: string[] = [];
     const ambiguousEntries: { name: string; matches: number }[] = [];
     for (const entry of SYNC_ENTRY_POINTS) {
       const matches = findAllFunctionDeclarationsByName(project, entry); // returns FunctionDeclaration[]
       if (matches.length === 0) unresolvedEntries.push(entry);
       else if (matches.length > 1) ambiguousEntries.push({ name: entry, matches: matches.length });
     }
     if (unresolvedEntries.length > 0 || ambiguousEntries.length > 0) {
       const parts: string[] = [];
       if (unresolvedEntries.length > 0) {
         parts.push(
           `unresolved sync entry points (zero declarations): ${unresolvedEntries.join(", ")}`,
         );
       }
       if (ambiguousEntries.length > 0) {
         parts.push(
           `ambiguous sync entry points (multiple declarations): ${ambiguousEntries
             .map((e) => `${e.name} (${e.matches} matches)`)
             .join(", ")}`,
         );
       }
       throw new Error(
         `AC-X.4 semantic-layer precheck failed — ${parts.join("; ")}. ` +
           `Update SYNC_ENTRY_POINTS to match the live codebase, or restore the missing declarations.`,
       );
     }

     // For each entry point: walk the call graph; for every comparison/expression whose operands
     // are typed `Date | number | string`, resolve the SOURCE of each operand transitively.
     for (const entry of SYNC_ENTRY_POINTS) {
       const decl = findFunctionDeclarationByName(project, entry);
       if (!decl) {
         // Defensive backstop — the precheck above should have caught this. If we reach here, the
         // precheck logic and the inner resolver disagree; fail loudly rather than silently skip.
         throw new Error(
           `AC-X.4 invariant violation: '${entry}' resolved during precheck but is null in main loop`,
         );
       }
       const callGraph = buildCallGraph(decl); // resolves local + imported helpers transitively
       const watermarkComparisons = findWatermarkShapeComparisons(callGraph);
       for (const comp of watermarkComparisons) {
         for (const operand of [comp.lhs, comp.rhs]) {
           const source = resolveSourceOfValue(operand); // walks back through assignments, parameters, returns
           const fqName = qualifiedName(source); // 'shows.last_seen_modified_time' / 'fileMeta.modifiedTime' / 'app_settings.processed_at' / 'process.env.LAST_WATERMARK' / etc.
           if (ACCEPTABLE_PER_ROW_SOURCES.has(fqName)) continue;
           if (FORBIDDEN_SOURCE_KINDS.some((test) => test(source))) {
             throw new Error(
               `AC-X.4 semantic-layer violation at ${comp.fileName}:${comp.line}: ` +
                 `watermark-shape comparison consumes forbidden source '${fqName}'. ` +
                 `Sync gating decisions MUST read watermarks from per-row sources only.`,
             );
           }
           // Unresolvable source (e.g., `as any` escape) → fail closed. The semantic layer is
           // conservative: anything not provably per-row is rejected.
           throw new Error(
             `AC-X.4 semantic-layer violation at ${comp.fileName}:${comp.line}: ` +
               `watermark-shape source '${fqName}' could not be resolved to a per-row column. ` +
               `If this is a legitimate per-row watermark, add it to ACCEPTABLE_PER_ROW_SOURCES.`,
           );
         }
       }
     }
     ```

     **Implementation notes:**
     - **`findWatermarkShapeComparisons(callGraph)`**. The earlier matcher only inspected comparisons that referenced a layer-2 BANNED_COMBO token OR a property whose declared type was `modified_time | last_synced_at`-shape. That left **pure UUID gates out of scope** — `staged_id === reviewedStagedId`, `snapshot_revision_id === reviewedRevisionId`, `headRevisionId === pinnedRevisionId`, `md5Checksum === pinnedChecksum`, `embeddedFingerprint === pinnedFingerprint`, `base_modified_time === reviewedBaseModifiedTime` — none of which match a BANNED_COMBO when the property is `staged_id`/`snapshot_revision_id`/etc. The matcher is **driven from the Step-1 authoritative/display-only symbol sets directly**, so EVERY gating-watermark CAS site is in scope regardless of the operand's textual shape:
       - **Match rule (revised)**: a `BinaryExpression` (operators `<`, `<=`, `>`, `>=`, `===`, `!==`, `==`, `!=`) is in scope iff AT LEAST ONE operand resolves (via `resolveSourceOfValue`) to a member access into `AUTHORITATIVE_GATING_WATERMARKS` (per Step-1, ** corrected schema names**: `shows.last_seen_modified_time`, `pending_syncs.base_modified_time` (NOT `shows.base_modified_time` — column lives on `pending_syncs`), `shows.diagrams ->> 'snapshot_revision_id'` (NOT `shows.snapshot_revision_id` — JSONB path, not top-level column), `pending_syncs.staged_modified_time`, `pending_syncs.staged_id`, `fileMeta.modifiedTime`, `fileMeta.driveModifiedTime`, `fileMeta.headRevisionId`, `fileMeta.md5Checksum`, `deferred_ingestions.deferred_at_modified_time`, the `drive_watch_channels.*` lifecycle columns, and the §6.11 `embeddedFingerprint`/`sheetsRevisionId` per-row tokens) — regardless of whether the operand name contains `modified_time` or `last_synced_at`. **Audit MUST recognize the JSONB-path expression form** (e.g., `(shows.diagrams ->> 'snapshot_revision_id')::uuid = reviewed_revision_id`) as a member access into `AUTHORITATIVE_GATING_WATERMARKS`, not just bare column references — the resolver must extract the JSONB-path operator chain and normalize it to the `'shows.diagrams->>snapshot_revision_id'` set entry.
       - **Audit checks (per matched comparison)**: - **(a) Other-operand provenance**: the OTHER operand MUST derive (transitively, via `resolveSourceOfValue`) from a **reviewed/staged context input** — e.g., `reviewedStagedId`, `reviewedRevisionId`, `reviewedBaseModifiedTime`, `req.params.rev`, `payload.expected_revision`, `expectedRevisionId`, `pinnedFingerprint`, an explicitly-passed function parameter, or another `AUTHORITATIVE_GATING_WATERMARKS` member already CAS'd against an upstream review token. It MUST NOT derive from a **fresh DB read inside the same statement / block** (e.g., `(await db.from('shows').select('snapshot_revision_id').eq('id', showId).single).data.snapshot_revision_id`) — that pattern collapses CAS to "compare a row to itself" and is the bug class this matcher catches. The audit emits `AC-X.4 violation: gating-watermark CAS at <fileName>:<line> compares <FQN-of-watermark> against a fresh-read value; the other operand must come from the reviewed/staged context (e.g., reviewedStagedId, payload.expected_revision), NOT from a fresh SELECT inside the comparison.` when the resolver attributes the other operand to a `from(<sameTable>)` read in the same call's data-flow lineage.
         - **(b) Coverage sweep**: the audit ALSO emits a positive scan over every member access into `AUTHORITATIVE_GATING_WATERMARKS` across the call graph from each entry point in `SYNC_ENTRY_POINTS` (now including `applyStagedParse` and `discardStagedParse`). For each gating field, the audit asserts at least ONE in-scope CAS comparison reaches a write sink (UPDATE / DELETE / UPSERT) along that entry point's call graph. A gating field that's READ but NEVER compared as a CAS predicate before a write is itself a violation: `AC-X.4 violation: gating watermark <FQN> is read by <entry> but never enforced as a CAS predicate before a write sink. Every AUTHORITATIVE_GATING_WATERMARKS member must be CAS'd against the reviewed/staged context value before mutating writes.`
       - The display-only check from Fix 3 is preserved: any sync-decision comparison whose operand resolves to `DISPLAY_ONLY_TIMESTAMPS` still throws with the existing display-only message.
     - `resolveSourceOfValue(operand)` walks back through `VariableDeclaration`, `Parameter`, `ReturnStatement`, and `PropertyAccessExpression` to find the originating call/literal/property read. ts-morph's type checker handles transitive imports.
     - For SQL builder calls, the resolver matches patterns: `client.from(<table>).select(<col>).single` → `<table>.<col>`; `await rpc(<fnName>, args)` → resolved to the RPC's known return shape (registry hand-maintained for SECURITY DEFINER functions used in sync paths).

     **Required regression-test fixtures** — `tests/cross-cutting/fixtures/no-global-cursor-semantic/`:
     - **`bad-app-settings-cursor.ts`**: synthetic sync function `runScheduledCronSync` reads `await client.from('app_settings').select('processed_at').single` (column name `processed_at` slips past layer 2 — no `last_` prefix means no BANNED_COMBO match) and compares it to `fileMeta.modifiedTime`. Layer 3 MUST throw on `app_settings.processed_at` resolved as a singleton-table read regardless of column name.
     - **`bad-env-watermark.ts`**: function reads `new Date(process.env.LAST_WATERMARK)` (layer 2 catches the StringLiteral element-access; layer 3 catches the use-site too — important when the env name is constructed: `process.env[`${prefix}\_AT`]`).
     - **`bad-module-const-checkpoint.ts`**: `export let CHECKPOINT = 0; .. if (fileMeta.modifiedTime > CHECKPOINT) ...` — layer 2 misses `CHECKPOINT` (no banned combo); layer 3 catches it as a module-level mutable const used as a watermark RHS.
     - **`bad-untyped-any.ts`**: `const cursor = (rows[0] as any).runStartedAt;` — layer 3 catches the unresolvable `as any` escape via the conservative-fail rule.
     - **`good-per-row.ts`**: synthetic function reads `await client.from('shows').select('last_seen_modified_time').eq('id', showId).single` and compares to `fileMeta.modifiedTime` — both operands resolve to ACCEPTABLE_PER_ROW_SOURCES. Audit MUST NOT throw.
     - **`good-fileMeta-only.ts`**: function uses only `fileMeta.modifiedTime` and a per-row column — must NOT throw.
     - **`bad-display-only-in-sync-decision.fixture`**: synthetic `applyStagedParse` body reads `await client.from('shows').select('last_synced_at').eq('id', showId).single` and uses the result as the RHS of a CAS predicate (`WHERE last_synced_at = $reviewedTimestamp`). Both layers 1–2 pass (the name `last_synced_at` is on the legacy flat allowlist). Layer 3 (semantic layer) MUST throw with `AC-X.4 violation: sync-decision comparison reads display-only timestamp 'shows.last_synced_at'. Display-only timestamps are rendered to the operator but never gate writes; replace with the corresponding authoritative gating watermark (e.g., last_seen_modified_time, base_modified_time, staged_modified_time, or fileMeta.modifiedTime).`. Companion fixture `bad-display-only-parsed-at.fixture`: `discardStagedParse` body reads `pending_syncs.parsed_at` as the CAS predicate (instead of `staged_id`) — must throw with the same shape of message naming `pending_syncs.parsed_at`. Companion fixture `bad-display-only-last-attempt-at.fixture`: a sync-entry-point function reads `pending_ingestions.last_attempt_at` and compares against `fileMeta.modifiedTime` — must throw with the same shape of message naming `pending_ingestions.last_attempt_at`.
     - **`good-apply-cas.fixture`**: `applyStagedParse` body reads `pending_syncs.staged_id` AND `pending_syncs.base_modified_time` for the CAS predicate. Both operands resolve to AUTHORITATIVE_GATING_WATERMARKS — must NOT throw. Companion `good-discard-cas.fixture`: `discardStagedParse` body reads `pending_syncs.staged_id` for the CAS predicate (per §6.8.1) — must NOT throw.
     - **`good-apply-cas-staged-id.fixture` ( — UUID-gate positive case for Apply)**: `applyStagedParse` enforces `WHERE staged_id = $reviewedStagedId` where `reviewedStagedId` is a function parameter sourced from the operator's review payload. The new matcher MUST recognize `pending_syncs.staged_id` as an in-scope gating watermark even though the operand name carries no `modified_time` token, and MUST accept because the other operand derives from a reviewed-context input — not from a fresh DB read. Audit MUST NOT throw.
     - **`good-discard-cas-staged-id.fixture` ( — UUID-gate positive case for Discard)**: `discardStagedParse` enforces `WHERE staged_id = $reviewedStagedId` per §6.8.1; matcher in scope, provenance OK — audit MUST NOT throw.
     - **`good-asset-route-cas-revision-id.fixture`**: `app/api/asset/diagram/[show]/[rev]/[key]/route.ts`-shape fixture compares `(shows.diagrams ->> 'snapshot_revision_id')::uuid === req.params.rev`. Matcher recognizes the JSONB-path expression as a gating watermark; the other operand derives from a route param (reviewed/staged context input). Audit MUST NOT throw. Companion `good-asset-route-cas-head-revision.fixture`: compares `fileMeta.headRevisionId === pinnedRevisionId` — must NOT throw. Companion `good-asset-route-cas-md5.fixture`: compares `fileMeta.md5Checksum === pinnedChecksum` — must NOT throw.
     - **`bad-uuid-cas-against-fresh-read.fixture` ( — fresh-read regression for UUID gate)**: `applyStagedParse` regenerates `expected_revision` via a fresh SELECT inside the comparison: `WHERE staged_id = (await db.from('pending_syncs').select('staged_id').eq('drive_file_id', fid).single).data.staged_id`. The matcher recognizes `pending_syncs.staged_id` as a gating watermark AND audit check (a) MUST throw because the other operand resolves to a fresh `from('pending_syncs').select('staged_id')` read in the same data-flow lineage — i.e., the CAS is comparing the row to itself. Companion `bad-uuid-cas-revision-id-against-fresh-read.fixture`: same shape but with the JSONB-path expression `(shows.diagrams ->> 'snapshot_revision_id')::uuid` as the watermark and a fresh `from('shows').select('diagrams').single` regenerating the RHS via `.diagrams.snapshot_revision_id` — must throw with the same shape of message naming the JSONB-path expression.
     - **`bad-uncovered-gating-watermark.fixture`**: a synthetic project where `applyStagedParse` READS the JSONB-path expression `(shows.diagrams ->> 'snapshot_revision_id')` (e.g., to log it) but never CAS-compares it against any reviewed-context value before its UPDATE statement. Audit check (b) MUST throw with `AC-X.4 violation: gating watermark shows.diagrams->>snapshot_revision_id is read by applyStagedParse but never enforced as a CAS predicate before a write sink.`
     - **`bad-missing-entry-point.fixture`**: a fixture project where `runScheduledCronSync` (declared in SYNC_ENTRY_POINTS) is RENAMED to `runScheduledCronSyncRenamed` everywhere in source. The semantic-layer precheck MUST throw with `unresolved sync entry points (zero declarations): runScheduledCronSync` — silently skipping the entry would let an engineer rename the cron path and bypass the audit entirely. Companion fixture `bad-ambiguous-entry-point.fixture`: `runScheduledCronSync` is declared in TWO files (e.g., a stale duplicate left after a refactor); precheck MUST throw with `ambiguous sync entry points (multiple declarations): runScheduledCronSync (2 matches)`. adds analogous regression fixtures for the Apply/Discard entry points: `bad-missing-applyStagedParse-entry-point.fixture` (renames `applyStagedParse` to `applyStagedParseRenamed`) and `bad-missing-discardStagedParse-entry-point.fixture` (renames `discardStagedParse`); each MUST throw at the precheck.

     The semantic layer is the primary gate against the 's named-bypass class. Layers 1–2 (regex + token-based identifier audit) remain as defense in depth.

  4. **DDL guard via Postgres event trigger — global, allowlist-based (replaces the table CHECK approach, which cannot police future column names):**
     The earlier draft scoped the trigger to `app_settings` only. The observed this leaves a different singleton table (`system_state`, `runtime_config`, etc.) able to reintroduce a global cursor while the guard stays green. The corrected design rejects watermark-shaped column names on **any** table in the `public` schema, with a positive allowlist of permitted (table, column) pairs that exactly matches the Step-1 allowlist.

     ```sql
     -- Allowlist table: (table_name, column_name) pairs that are exempt from
     -- the watermark-name ban. Seeded once with the Step-1 allowlist; every
     -- migration that adds a legitimate per-row watermark column MUST also
     -- add a row here in the same migration. Tested by AC-X.4.
     CREATE TABLE IF NOT EXISTS _allowed_watermark_columns (
       table_name text NOT NULL,
       column_name text NOT NULL,
       PRIMARY KEY (table_name, column_name)
     );
     INSERT INTO _allowed_watermark_columns (table_name, column_name) VALUES
       ('shows','last_seen_modified_time'),
       ('shows','last_synced_at'),
       ('pending_syncs','staged_modified_time'),
       ('pending_syncs','base_modified_time'),
       ('pending_syncs','parsed_at'),
       ('deferred_ingestions','deferred_at_modified_time'),
       ('deferred_ingestions','deferred_at'),
       ('drive_watch_channels','expires_at'),
       ('drive_watch_channels','activated_at'),
       ('drive_watch_channels','superseded_at'),
       ('drive_watch_channels','stopped_at'),
       ('drive_watch_channels','created_at'),
       ('crew_member_auth','current_token_version'),
       ('crew_member_auth','max_issued_version'),
       ('crew_member_auth','revoked_below_version'),
       ('link_sessions','expires_at'),
       ('link_sessions','last_active_at'),
       ('link_sessions','created_at'),
       ('report_rate_limits','hour_bucket'),
       ('sync_log','occurred_at'),
       ('sync_audit','applied_at'),
       ('admin_alerts','raised_at'),
       ('admin_alerts','last_seen_at'),
       ('admin_alerts','resolved_at'),
       ('reports','created_at'),
       ('reports','processing_lease_until')
     ON CONFLICT DO NOTHING;

     CREATE OR REPLACE FUNCTION reject_global_watermark_columns
     RETURNS event_trigger AS $$
     DECLARE
       offender record;
     BEGIN
       -- Look at every public-schema column. If a name matches the watermark
       -- heuristic AND is NOT in the allowlist → reject.
       FOR offender IN
         SELECT c.table_name, c.column_name
           FROM information_schema.columns c
           LEFT JOIN _allowed_watermark_columns a
             ON a.table_name = c.table_name AND a.column_name = c.column_name
          WHERE c.table_schema = 'public'
            AND a.table_name IS NULL
            AND (c.column_name ~* 'last_(seen|sync|poll|processed|run|cursor)'
                 OR c.column_name ~* 'watermark'
                 OR c.column_name ~* '(^|_)cursor($|_)'
                 OR c.column_name ~* 'global_(state|cursor)')
       LOOP
         RAISE EXCEPTION
           'AC-X.4 violation: column %.% has watermark-shaped name and is not in _allowed_watermark_columns. '
           'If this is a legitimate per-row watermark, add it to _allowed_watermark_columns in the same migration.',
           offender.table_name, offender.column_name;
       END LOOP;
     END;
     $$ LANGUAGE plpgsql;

     CREATE EVENT TRIGGER no_global_cursor_columns
       ON ddl_command_end
       WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE')
       EXECUTE FUNCTION reject_global_watermark_columns;
     ```

     The test introspects via:

     ```sql
     SELECT evtname FROM pg_event_trigger WHERE evtname = 'no_global_cursor_columns';
     ```

     and asserts exactly one row. It then exercises the trigger by:
     - Attempting `ALTER TABLE app_settings ADD COLUMN last_processed_at timestamptz` inside a single transactional probe → expect exception (no allowlist row).
     - Attempting `CREATE TABLE system_state (last_run_at timestamptz)` → expect exception.
     - Attempting `ALTER TABLE shows ADD COLUMN global_cursor int` → expect exception.
     - Attempting `ALTER TABLE shows ADD COLUMN last_seen_modified_time timestamptz` (already allowlisted) → expect success (the allowlist exempts the existing column shape).
       This catches DDL-time additions on **any** table, not just `app_settings`.

- [ ] **Step 3: Run** — FAIL initially because the event trigger and migration haven't been added yet. Add the migration. Re-run, expect PASS.
- [ ] **Step 4: Commit** `test(cross-cutting): no global cursor — AST audit + event-trigger DDL guard (AC-X.4)`.

### Task X.5: Email canonicalization at every boundary (AC-X.5)

The earlier draft was a string-grep over `INSERT .. email`. That misses JSONB fields, RLS helpers, parser outputs, and Google-session lookup paths — all of which the spec lists as canonicalization boundaries. This task replaces the grep with an explicit allowlist of every email-bearing path with a corresponding boundary check.

**Files:** Test: `tests/cross-cutting/email-canonicalization.test.ts`.

- [ ] **Step 1: Authored allowlist** — enumerate every email-bearing path the spec calls out (§4.1.1, §7.2.2, §13.2):

  | Layer        | Path                                                                                                                                                   | Boundary check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Parser write | `lib/parser/blocks/crew.ts` → `crew_members.email`                                                                                                     | `canonicalize` called before populating `CrewMemberRow.email`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
  | Parser write | `lib/parser/blocks/client.ts` → `shows.client_contact.email` (JSONB)                                                                                   | `canonicalize` before populating `ClientContact.email` and `secondary.email`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
  | Parser write | `lib/parser/blocks/transport.ts` → `transportation.driver_email`                                                                                       | `canonicalize` before populating `TransportationRow.driver_email`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
  | Parser write | `lib/parser/blocks/contacts.ts` → `contacts.email`                                                                                                     | `canonicalize` before populating `ContactRow.email`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
  | DB write     | `lib/sync/applyParseResult.ts` → all `INSERT/UPSERT` of email columns                                                                                  | **defensive `canonicalize` at the write boundary** — even though `ParseResult` should already be canonicalized, the DB-layer write helper runs `canonicalize` again per spec §4.1.1's mandate. Catches: a future caller (test fixtures, import jobs) that bypasses the parser; a parser regression that misses a normalization site; a JSONB payload constructed directly.                                                                                                                                                                                                      |
  | DB write     | `lib/reports/submit.ts` → `reports.reported_by` (when admin email; never crew email)                                                                   | admin path: `canonicalize(adminEmail)`. Crew path: `crew_members.id::text` (no email written)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
  | DB write     | `lib/reports/rateLimit.ts` → `report_rate_limits.identity` UPSERT                                                                                      | admin path's identity is canonical email; without canonicalization, `Doug@...` and `doug@...` land in different bucket rows and double the effective quota. The atomic UPSERT MUST canonicalize before the `INSERT .. ON CONFLICT (kind, identity, hour_bucket)` call. Test: insert via mixed-case admin identity in two requests; assert exactly one bucket row with the canonical identity AND `count=2`.                                                                                                                                                                     |
  | DB write     | `lib/sync/applyStaged.ts` → `sync_audit.applied_by`                                                                                                    | spec §6.8.3 stores the admin email of the operator who clicked Apply in `sync_audit.applied_by`. §4.1.1 requires every persisted email to be canonicalized; without canonicalization here, mixed-case admin emails would persist into the audit trail uncanonicalized AND the schema's `*_email_canonical` CHECK on this column (if added) would reject the row. The Apply path MUST `canonicalize(adminEmail)` before INSERT. Test: synthesize an Apply call with admin identity `'Doug@FXAV.NET'`; assert the resulting `sync_audit.applied_by` row stores `'doug@fxav.net'`. |
  | DB write     | `lib/admin/onboarding/finalize.ts` → `app_settings.watched_folder_set_by_email` AND `app_settings.pending_folder_set_by_email`                         | spec §4.5 stores the admin email that promoted/staged the folder. Both columns require canonicalize before write; without it, mixed-case admin identities leak into the audit trail. Test: synthesize folder promotion with admin identity `'Eric@example.com'`; assert both columns store `'eric@example.com'`.                                                                                                                                                                                                                                                                |
  | DB write     | `lib/sync/discard.ts` AND `lib/admin/onboarding/pendingIngestionsActions.ts` → `deferred_ingestions.deferred_by_email`                                 | spec §4.5 records the admin who triggered defer_until_modified / permanent_ignore. Same canonicalize-before-write contract. Test: defer-with-permanent-ignore via mixed-case admin; assert canonical persisted email.                                                                                                                                                                                                                                                                                                                                                           |
  | DB write     | `lib/admin/alerts.ts` → `admin_alerts.resolved_by`                                                                                                     | spec §4.6 records who resolved an alert. canonicalize before the resolution UPDATE. Test: resolve alert as mixed-case admin; assert canonical persisted email.                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | DB write     | `lib/auth/validateGoogleSession.ts` → `admin_alerts.context` JSONB on `AMBIGUOUS_EMAIL_BINDING` UPSERT                                                 | the duplicate-email collision payload — emails of the colliding crew rows — must be canonicalized BEFORE being stored in the JSONB. Without this, mixed-case emails in `context.collidingEmails[]` make operator triage and any future comparison against canonical DB values inconsistent.                                                                                                                                                                                                                                                                                     |
  | DB write     | any other `admin_alerts.context` write that includes an email field (e.g., a future `WEBHOOK_TOKEN_INVALID` payload that captures the requester email) | every email-bearing field within the JSONB payload runs through `canonicalize` before UPSERT                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
  | Read         | `lib/auth/validateGoogleSession.ts` → `WHERE email = canonicalize(supabaseAuth.user.email)`                                                            | explicit `canonicalize` call before `WHERE`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
  | Read         | `lib/data/listShowsForCrew.ts` → `/me` email-driven show list                                                                                          | the `/me` page reads `crew_members.email = canonicalize(supabaseAuth.user.email)` to enumerate shows the signed-in user is on. Without canonicalization, mixed-case Google emails (`Doug@FXAV.NET`) would miss the crew row stored as `doug@fxav.net` and the user would see an empty `/me` list. Test: sign in with `' Doug@FXAV.NET '`; assert `listShowsForCrew` returns the same shows as `'doug@fxav.net'`.                                                                                                                                                                |
  | Read         | RLS policies that compare `auth.email` to `crew_members.email`                                                                                         | use the SQL helper `auth_email_canonical()` (zero-arg, defined in Task 2.3 — every callsite invokes it as a function call with parens, never as a bare identifier)                                                                                                                                                                                                                                                                                                                                                                                                              |
  | Schema       | `crew_members.email`, `transportation.driver_email`, `contacts.email`, `client_contact.email` JSONB extracted via CHECK if reachable                   | every one has a `*_email_canonical` CHECK constraint per §4.1.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

- [ ] **Step 2: Failing test** — six positive assertions across the boundary layers:
  1. **Parser canonicalization at every write site.** Static analysis: every assignment to a property whose name matches `/^email$|_email$/` in `lib/parser/**/*.ts` is the result of a call to `canonicalize(...)` (or is the literal `null`). Test parses each file with `ts-morph`, walks property assignments, and asserts the right-hand side is a `canonicalize` CallExpression or `null`/`undefined`.
  2. **DB-write-helper defensive canonicalization.** Static analysis: every `INSERT`/`UPSERT` in `lib/sync/applyParseResult.ts`, `lib/reports/submit.ts`, and any helper that writes to email-bearing tables MUST run `canonicalize` on email-bearing values immediately before the SQL call. Test walks each file with ts-morph, finds `from(<table>).insert(<obj>)` / `from(<table>).upsert(<obj>)` / equivalent SQL builder calls where `<table>` is in the email-bearing tables list, and asserts every email-shaped property in `<obj>` is the result of a `canonicalize` call.
  3. **DB schema CHECK exact-expression match.** SQL introspection: for each email-bearing column, assert `pg_get_constraintdef` returns the exact normalized form `CHECK ((<column> = lower(btrim(<column>))))`. Catches a CHECK with the right name but a wrong/weakened body (e.g., a regex check instead of the canonical-form check).
  4. **RLS helper definition.** `SELECT proname, pronargs FROM pg_proc WHERE proname='auth_email_canonical' AND pronamespace = 'public'::regnamespace` returns exactly one row with `pronargs = 0`; `pg_get_functiondef(oid)` body lowercases + trims `auth.email()` (or delegates to `canonicalize_email(auth.email())`). Companion assertions: `is_admin` returns one row with `pronargs = 0`; `canonicalize_email` returns one row with `pronargs = 1`. All three helper definitions match the canonical bodies documented in Task 2.3.
  5. **Validator canonicalization.** `lib/auth/validateGoogleSession.ts` contains a call `canonicalize(supabaseAuth.user.email)` (or equivalent named binding) BEFORE the SELECT against `crew_members.email`. Verified via `ts-morph`.
  6. **Reports `reported_by` canonicalization.** `lib/reports/submit.ts` admin path canonicalizes the admin email before INSERT. Crew path writes `crew_members.id::text` — test asserts no email-shaped string ever lands in `reports.reported_by` for crew submissions (round-trip: insert a crew report, re-read, assert `!/.+@.+/.test(reported_by)`).
  7. **`admin_alerts.context` JSONB email canonicalization.** Any UPSERT into `admin_alerts` whose `context` payload includes email fields canonicalizes them first. Test: synthesize `validateGoogleSession` against two crew rows with mixed-case duplicate emails (e.g., `Alice@FXAV.NET` and `alice@fxav.net`). Trigger `AMBIGUOUS_EMAIL_BINDING`. Read the resulting `admin_alerts.context` JSONB. Assert every email field within the payload (e.g., `context.collidingEmails[]`, `context.matchedEmail`) is already canonicalized — `lower(trim(value))` matches the stored value. Repeat for any other path that writes email-bearing context (operator-only paths flagged in Step 1's allowlist).
- [ ] **Step 3: Failure modes the test catches**
  - A new email-bearing column added without the `*_email_canonical` CHECK → test fails because the introspection misses an entry.
  - A new email write site in `lib/parser/blocks/` that bypasses `canonicalize` → ts-morph audit fails.
  - The `auth_email_canonical()` helper getting renamed or dropped without RLS being updated → introspection fails. Same for `is_admin()` and `canonicalize_email(text)` — any drop/rename/arity-change is caught by the `pg_proc` pronargs assertion.
  - Any code path inserting a raw `auth.email` value without canonicalization → grep-as-fallback (the v1 grep is retained as a defense-in-depth secondary check).
- [ ] **Step 4: Run** — iterate until every layer passes.
- [ ] **Step 5: Commit** `test(cross-cutting): email canonicalization at every boundary — allowlist audit (AC-X.5)`.

### Task X.6: Spec-to-implementation traceability — machine-generated matrix (AC-X.6)

**Mechanized matrix.** Earlier draft was a manual checklist that collapsed whole sections (`§13 → M8 tasks 8.1..8.5`) and skipped §16 entirely. Manual checklists at this scale can't reliably catch (a) the ParsedSheet/ParseResult split staying mapped, (b) the /40 `lease_holder` protocol amendments being represented, (c) orphaned ACs beyond human diligence, or (d) §16 secrets/env coverage being addressed. The corrected design generates the matrix from spec headings + AC anchors.

**Files:** Create: `scripts/generate-traceability.ts`, `scripts/verify-branch-protection.ts`, `.github/workflows/x-audits.yml`. Test: `tests/cross-cutting/traceability.test.ts`, `tests/cross-cutting/verify-branch-protection.test.ts`. Output: `docs/superpowers/plans/coverage.md`.

- [ ] **Step 1: Implement the generator** `scripts/generate-traceability.ts` that:
  1. Walks every heading in the spec markdown — H1/H2/H3/H4 — and records the `§N`, `§N.M`, `§N.M.O`, and `§N.M.O.P` anchors plus their titles.
  2. **Walks every non-heading normative unit via stable spec-id anchors**. Section §6.8 derivation tables, §13.2.3 amendment blocks, round-NN amendment text, and any other non-heading normative obligation MUST be preceded by an HTML-comment anchor of the form `<!-- spec-id: <kebab-case-slug> -->`. The generator extracts these IDs and treats them as first-class coverage targets equal to heading anchors. **No implicit-text fallback** — earlier draft accepted prose mentions like `ParsedSheet` + `enrichWithDrivePins` as evidence of coverage, but that reintroduces the heuristic matching X.6 was redesigned to eliminate. The corrected design rejects unanchored coverage as `MISSING`.

  **Prerequisite spec-id insertion task**: BEFORE the generator runs against any plan, every existing non-heading normative unit in the spec MUST receive a `<!-- spec-id: .. -->` anchor. This is a one-time spec edit landing as part of X.6 Task 1's setup. Required slugs (initial set):
  - `<!-- spec-id: section-6-8-derivation-table -->` — §6.8 invariants derivation table
  - `<!-- spec-id: section-6-8-2-auth-side-effects-derivation -->` — §6.8.2 derivation table for Apply auth side-effects
  - `<!-- spec-id: section-13-2-3-lease-holder-protocol -->` — §13.2.3 lease ownership amendment
  - `<!-- spec-id: -40-reports-lease-amendment -->` — /40 reports schema amendment
  - `<!-- spec-id: -parsedsheet-parseresult-split -->` — type split
  - `<!-- spec-id: -immutable-pin-amendment -->` — reel + linked-folder + embedded immutable pins
  - `<!-- spec-id: -cookie-session-validator-rewrite -->` — §17.1 cookie-session reconciliation
  - (Add new slugs as future spec amendments land. Each new normative unit MUST get a unique slug.)

  Generator failure modes:
  - Plan task references an anchor that doesn't exist in spec → `MISSING_ANCHOR`.
  - Spec normative unit has no anchor → `UNANCHORED_NORMATIVE_UNIT` (detected by parsing spec subsections and flagging blocks that aren't headings + don't start with a spec-id comment).
  - Plan task uses a free-form prose mention (e.g., `ParsedSheet`) WITHOUT a structured `<!-- coverage: -parsedsheet-parseresult-split -->` marker → that task counts as `MISSING` for , not implemented.

    ```markdown
    <!-- spec-id: section-6-8-derivation-table -->

    | MI-12 | … | apply rename + bump auth floor for both names |

    <!-- spec-id: section-13-2-3-lease-holder-protocol -->

    The lease_holder UUID is written at reservation time and rotated on every reacquisition…

    <!-- spec-id: -immutable-pin-amendment -->

    [ text]
    ```

    Coverage markers in plan tasks resolve against the union of heading anchors AND `spec-id:` slugs. This eliminates the heuristic string-matching approach (`§5.2-phase-2`, `ParsedSheet` + `enrichWithDrivePins`) that would let prose mentions satisfy coverage.
  3. Walks every `AC-*` row from §17 and records its identifier + body.
  4. **Scopes the plan-side scan to TASK BLOCKS ONLY.** A raw grep across the entire plan markdown finds spec anchors and AC references in non-executable prose — the self-review checklist near the end of the plan blanket-maps whole spec sections to milestones (`§13 → M8 tasks 8.1..8.5`), and the review-history appendix mentions amendments/types/codes extensively. Counting those as coverage produces a false-zero `MISSING` result. The corrected scope: only count anchor/AC references inside **task blocks** delimited by `^### Task N\.M:` headers, plus their bodies up to the next `### ` heading at the same level. Explicitly EXCLUDE these sections from coverage extraction:
     - `# Self-review checklist` and everything beneath it.
     - `# Adversarial review history` / `## Convergence summary` / any `# Review history` heading.
     - `# How to use this plan` / `## Glossary` / `## Round-N notes` prose blocks.
     - Any heading whose title matches `/review|history|retrospective|how[- ]to[- ]use|glossary|appendix/i`.
  5. Each task block must include a structured **Coverage Annotation** at the start, e.g.:

     ```markdown
     ### Task 6.5: Phase 2 — destructive snapshot replacement

     <!-- coverage: §5.2-phase-2, §6.8.2-derivation-table, AC-6.8, AC-6.21 -->
     ```

     The generator parses `<!-- coverage: .. -->` markers as the **sole** authoritative mapping. Free-form prose mentions of spec anchors are NOT evidence; only structured markers count. A task body that mentions `§5.2` without a `<!-- coverage: §5.2 -->` marker counts as MISSING for that anchor.

  6. Emits a Markdown table with columns: `Spec anchor | Title | Owning task ID(s) | Status | Implementation evidence | Notes`. Status is one of:
     - `planned` — ≥1 task's coverage marker references this anchor (default state once a marker exists).
     - `implemented` — `planned` AND the implementation evidence column is populated by file/symbol references emitted from a separate code-side annotation (e.g., a structured `// @covers §6.5` comment on the implementing function, parsed by a companion script). **`planned` does NOT imply `implemented`** — task markers are plan-side metadata; the gate must inspect actual code to claim implementation.
     - `deferred` — explicit `<!-- coverage: deferred-v2 -->` annotation.
     - `intentionally out of scope` — explicit `<!-- coverage: out-of-scope -->`.
     - `MISSING` — no marker mapping.
  7. Same per-AC table.
  8. Writes to `docs/superpowers/plans/coverage.md`.

- [ ] **Step 2: Failing test** — runs the generator and asserts:
  - Zero anchors at status `MISSING`.
  - ** ParsedSheet/ParseResult split** is mapped via an explicit `<!-- coverage: -parsedsheet-parseresult-split -->` marker on Task 1.1 AND any task that uses the type split. The generator only counts structured markers.
  - **/40 lease_holder amendments** are mapped.
  - **§16 (secrets/env)** has at least one explicit task. (Earlier draft skipped §16 entirely — this assertion catches that regression.)
  - Every code in §12.4 has a producer site (cross-references X.1's three-way parity).
  - **§4.3 ↔ AC-2.5 admin-table parity (/ build-time invariant)**: parse the spec's §4.3 admin-only bullet list to extract the canonical admin-only table set; parse Task 2.3's `ADMIN_TABLES` registry (and the equivalent regex list in Task X.3's `PROTECTED_SINKS`); assert `setEqual(specAdminTables, ac25AdminTables)` AND `specAdminTables.every(t => protectedSinksRegexList.includes(t))`. The test fails with a named diff (`+missing_in_ac25:bootstrap_nonces`, `-missing_in_spec:foo`) when any one of the three lists drifts. This is the cross-cutting parity gate that catches the / finding (`bootstrap_nonces` was added to spec §4.3 but missed in plan Task 2.3's inline enumeration / Task X.3's PROTECTED_SINKS regex list); future admin-only tables added to §4.3 must propagate to all three lists or CI fails.
  - **`.github/workflows/x-audits.yml` freshness-gate parity.** The traceability test parses `.github/workflows/x-audits.yml` as YAML and asserts: (a) every audit job in the set `{traceability-audit, x1-catalog-parity, x2-no-raw-codes, x3-trust-domain, x4-no-global-cursor, x5-rls-coverage}` contains a step named `Verify generated admin tables file is fresh` whose `if` clause is `github.event_name != 'schedule'` and whose `run` body invokes `pnpm gen:admin-tables` followed by `git diff --exit-code lib/audit/admin-tables.generated.ts`; (b) the privileged `verify-branch-protection` job is gated to `if: github.event_name == 'push' || github.event_name == 'schedule'` (NEVER fires on `pull_request`); (c) the lightweight reader `verify-branch-protection-status` exists, has NO secrets in its env block, and uses only `GH_TOKEN: ${{ github.token }}`; (d) the file does NOT contain the string `pull_request_target` (security hole guard). Any missing freshness step, any privileged-job exposure to PR_HEAD, or any `pull_request_target` usage fails the audit with a named diff (`+missing_freshness_step:<job>`, `+privileged_on_pull_request:<job>`, `+pull_request_target_used`, `+secrets_in_reader_job:<key>`). This catches the regression class where a future YAML edit drops the freshness step from one job (silently letting that job consume a stale generated module) or accidentally promotes the privileged job to PR-required (resurfacing the fork-PR merge deadlock).
  - **Reel pin 4-column atomic-NULL/SET invariant.** Static AST scan of every TypeScript / SQL source file finds every UPDATE/INSERT/UPSERT statement whose targeted column set intersects `REEL_PIN_COLUMNS = { 'opening_reel_drive_file_id', 'opening_reel_drive_modified_time', 'opening_reel_head_revision_id', 'opening_reel_mime_type' }`. For each such statement, assert ONE OF: (a) all four columns appear in the SET clause and all four are assigned the same NULL literal (atomic-NULL drift / non-video / permission-denied path), OR (b) all four columns appear in the SET clause and all four are assigned non-NULL bound parameters (atomic-SET success path), OR (c) the statement is part of an explicit allowlist with reviewed justification (initially empty). A statement that updates 1, 2, or 3 of the four columns in isolation (or mixes NULL with non-NULL across the four) fails CI with `REEL_PIN_PARTIAL_UPDATE` naming the offending file:line. **Symbol set is driven from §4.1 column comments**, not hardcoded — the audit re-reads §4.1 at build time and discovers the canonical reel-pin column set, so a future 5th pin column added to §4.1 auto-grows the invariant. This static gate catches the regression class that surfaced in / (multiple plan/spec sites enumerated only 3 of the 4 reel pin columns; the runtime test asserts pass with all-NULL but the source still wrote partial NULLs through helper functions that bypassed the test path). **Companion plan/spec-side cardinality check**: every plan/spec reference to "reel pin tuple" / "reel pin triple" / "reel pin quadruple" / "all N reel columns" / "ALL N persisted reel columns" / "ALL N pin columns" / "<N> NULLs together" is parsed and the cardinality must match `|REEL_PIN_COLUMNS| === 4`; a `triple` / `three` / `3` mention fails with `REEL_PIN_CARDINALITY_DRIFT` naming the offending file:line. Allowlist exception: prose explicitly framing a count as "earlier wording said three" (a deliberate retrospective reference) passes if the corrected `four`/`4` mention appears in the same paragraph.
- [ ] **Step 3: CI gating — substantive parity assertions are PR-required.** The earlier wording fired CI ONLY on `MISSING > 0` count, which left every Step-2 substantive parity assertion un-wired into the PR-required check — a spec drift that broke admin-table parity but left every anchor still mapped would have a green CI. The corrected contract: **CI MUST run the X.6 traceability test file (`tests/cross-cutting/traceability.test.ts`) on EVERY pull request and EVERY branch build. Failing ANY Step-2 assertion blocks merge** — not just `MISSING > 0`, but every parity, coverage, and code-producer check enumerated in Step 2. The required GitHub status check is named **`traceability-audit`** (registered as a required check on the `main` branch via repository settings; spec §17.2 acceptance language references this exact check name as a hard ship gate). Required checks for the full X._ gate set (each implemented as a separate Vitest project / script + GitHub status check, all required for merge): `traceability-audit` (X.6 — this task), `x1-catalog-parity` (X.1 — Task X.1 owner), `x2-no-raw-codes` (X.2 — Task X.2 owner), `x3-trust-domain` (X.3 — Task X.3 owner), `x4-no-global-cursor` (X.4 — Task X.4 owner), `x5-rls-coverage` (X.5 — Task X.5 owner), `verify-branch-protection-status` (X.6 drift-detector reader — this task; the 7th required check is the LIGHTWEIGHT READER, NOT the privileged `verify-branch-protection` job itself, because GitHub does not send secrets on `pull_request` from forks and `pull_request_target` would expose secrets to untrusted PR code — a known security hole. The reader uses only the auto-injected read-only `GITHUB_TOKEN` to query the latest successful run of `verify-branch-protection` on `main` and asserts it succeeded within an 8-day freshness window; if so, the reader passes — if not, it fails and blocks merge. This satisfies "merge requires recent successful verification" without exposing secrets to fork code). The privileged `verify-branch-protection` job itself runs ONLY on `push` to `main` + weekly `schedule` cron (both contexts run committed-to-main code with secrets safely available). The CI workflow file is `.github/workflows/x-audits.yml`; each job uploads its respective audit artifact (`coverage.md` for X.6; named diffs for X.1–X.5; `branch-protection-report.json` for the privileged verify-branch-protection job) on every run regardless of pass/fail. \*\*Post-merge / deploy-only audits are NOT acceptable for any X._ gate** — they must run on the PR-required check path so a regression cannot land. This X.6 task additionally asserts spec §17.2 enumerates all SEVEN required check names verbatim (`traceability-audit`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-rls-coverage`, `verify-branch-protection-status`); a spec edit that drops any name fails the audit. **Trust-boundary documentation:\*\* the spec §17.2.1 runbook documents the split — privileged check runs on trusted contexts only; reader is the PR-required check that runs on untrusted PR_HEAD; the two together close the fork-PR merge-deadlock that an earlier draft would have hit (every fork PR would have failed `verify-branch-protection` because secrets are not sent to fork workflows → permanent merge block on every external contribution).
- [ ] **Step 3a: Create `.github/workflows/x-audits.yml`.** Earlier draft mandated six PR-required status checks but never owned the workflow file — Task X.6's file list created only the generator + test + coverage.md, leaving the CI gate un-wired. This step creates the workflow file as a Task X.6 deliverable. Workflow structure:
  ```yaml
  name: Cross-cutting audits
  on:
    pull_request:
    push:
      branches: [main]
    schedule:
      # X.1-X.6 : weekly cron trigger so the
      # `verify-branch-protection` job runs even when no PRs flow through.
      # All other jobs gate themselves with `if: github.event_name != 'schedule'`
      # so the cron run executes ONLY the branch-protection verification.
      - cron: "0 9 * * 1"
  jobs:
    traceability-audit:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with: { node-version: "20", cache: "pnpm" }
        - run: pnpm install --frozen-lockfile
        # Freshness gate: regenerate the admin-tables module from the live
        # spec §4.3 and fail if the committed file is stale. Required on
        # every audit job so a stale generated module cannot silently feed
        # into typecheck/lint/test consumers. Skipped on `schedule` (cron
        # runs only the privileged verify-branch-protection job).
        - name: Verify generated admin tables file is fresh
          if: github.event_name != 'schedule'
          run: |
            pnpm gen:admin-tables
            git diff --exit-code lib/audit/admin-tables.generated.ts \
              || (echo "::error::admin-tables.generated.ts is stale - run 'pnpm gen:admin-tables' locally and commit"; exit 1)
        - run: pnpm test:audit:traceability
        - uses: actions/upload-artifact@v4
          if: always
          with: { name: traceability-coverage, path: docs/superpowers/plans/coverage.md }
    x1-catalog-parity:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with: { node-version: "20", cache: "pnpm" }
        - run: pnpm install --frozen-lockfile
        - name: Verify generated admin tables file is fresh
          if: github.event_name != 'schedule'
          run: |
            pnpm gen:admin-tables
            git diff --exit-code lib/audit/admin-tables.generated.ts \
              || (echo "::error::admin-tables.generated.ts is stale - run 'pnpm gen:admin-tables' locally and commit"; exit 1)
        - run: pnpm test:audit:x1-catalog
        - uses: actions/upload-artifact@v4
          if: always
          with: { name: x1-catalog-diff, path: artifacts/x1-catalog-diff.txt }
    x2-no-raw-codes:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with: { node-version: "20", cache: "pnpm" }
        - run: pnpm install --frozen-lockfile
        - name: Verify generated admin tables file is fresh
          if: github.event_name != 'schedule'
          run: |
            pnpm gen:admin-tables
            git diff --exit-code lib/audit/admin-tables.generated.ts \
              || (echo "::error::admin-tables.generated.ts is stale - run 'pnpm gen:admin-tables' locally and commit"; exit 1)
        - run: pnpm test:audit:x2-no-raw-codes
        - uses: actions/upload-artifact@v4
          if: always
          with: { name: x2-raw-codes-diff, path: artifacts/x2-raw-codes-diff.txt }
    x3-trust-domain:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with: { node-version: "20", cache: "pnpm" }
        - run: pnpm install --frozen-lockfile
        - name: Verify generated admin tables file is fresh
          if: github.event_name != 'schedule'
          run: |
            pnpm gen:admin-tables
            git diff --exit-code lib/audit/admin-tables.generated.ts \
              || (echo "::error::admin-tables.generated.ts is stale - run 'pnpm gen:admin-tables' locally and commit"; exit 1)
        - run: pnpm test:audit:x3-trust-domain
        - uses: actions/upload-artifact@v4
          if: always
          with: { name: x3-trust-domain-diff, path: artifacts/x3-trust-domain-diff.txt }
    x4-no-global-cursor:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with: { node-version: "20", cache: "pnpm" }
        - run: pnpm install --frozen-lockfile
        - name: Verify generated admin tables file is fresh
          if: github.event_name != 'schedule'
          run: |
            pnpm gen:admin-tables
            git diff --exit-code lib/audit/admin-tables.generated.ts \
              || (echo "::error::admin-tables.generated.ts is stale - run 'pnpm gen:admin-tables' locally and commit"; exit 1)
        - run: pnpm test:audit:x4-no-global-cursor
        - uses: actions/upload-artifact@v4
          if: always
          with: { name: x4-cursor-diff, path: artifacts/x4-cursor-diff.txt }
    x5-rls-coverage:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with: { node-version: "20", cache: "pnpm" }
        - run: pnpm install --frozen-lockfile
        - name: Verify generated admin tables file is fresh
          if: github.event_name != 'schedule'
          run: |
            pnpm gen:admin-tables
            git diff --exit-code lib/audit/admin-tables.generated.ts \
              || (echo "::error::admin-tables.generated.ts is stale - run 'pnpm gen:admin-tables' locally and commit"; exit 1)
        - run: pnpm test:audit:x5-rls-coverage
        - uses: actions/upload-artifact@v4
          if: always
          with: { name: x5-rls-diff, path: artifacts/x5-rls-diff.txt }
    verify-branch-protection:
      # Privileged drift-detector. **Trust boundary**: this job consumes
      # GitHub App / PAT credentials AND the Supabase service-role key, so
      # it MUST NOT execute untrusted PR-fork code. The job is therefore
      # gated to `push` (to main) + `schedule` (weekly cron) ONLY — both
      # contexts run committed-to-main code with secrets available. The
      # job is NEVER fired on `pull_request` (forks don't receive secrets,
      # and `pull_request_target` is explicitly NOT used because it would
      # run untrusted PR code with privileged secrets — a known security
      # hole). Drift is therefore detected on every push to `main` and at
      # least once weekly via cron. Fork PRs surface drift via the
      # separate `verify-branch-protection-status` reader job (defined
      # below) which has no secrets and is safe to run on PR_HEAD code.
      if: github.event_name == 'push' || github.event_name == 'schedule'
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with: { node-version: "20", cache: "pnpm" }
        - run: pnpm install --frozen-lockfile
        - run: pnpm tsx scripts/verify-branch-protection.ts
          env:
            # Preferred: GitHub App installation token minted at job start
            # via a separate composite action (least-privilege, no PAT
            # rotation burden). Fallback: `BRANCH_PROTECTION_PAT` repo
            # secret (PAT with `repo` scope — must be rotated quarterly).
            # The script picks `GH_APP_TOKEN` first and falls back to
            # `BRANCH_PROTECTION_PAT` if the App token is absent. CI fails
            # if NEITHER secret is set.
            GH_APP_TOKEN: ${{ secrets.GH_APP_TOKEN }}
            BRANCH_PROTECTION_PAT: ${{ secrets.BRANCH_PROTECTION_PAT }}
            SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
            SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
        - uses: actions/upload-artifact@v4
          if: always
          with: { name: branch-protection-report, path: artifacts/branch-protection-report.json }
    verify-branch-protection-status:
      # **PR-required reader job — runs on EVERY pull_request (incl. forks)
      # AND on push to main.** This job does NOT execute untrusted code
      # paths against secrets: it uses ONLY the auto-injected
      # `GITHUB_TOKEN` (which on `pull_request` from a fork is read-only,
      # by design) to query the latest successful run of the privileged
      # `verify-branch-protection` workflow against `main`. If a recent
      # successful run exists within the freshness window, this job
      # passes (green check). If no successful run exists within the
      # window, this job fails — blocking merge. This is the 7th REQUIRED
      # status check on `main` (NOT `verify-branch-protection` itself,
      # which would deadlock fork PRs because GitHub does not send
      # secrets to fork-triggered workflow runs and the privileged job
      # would always fail closed). Trust-boundary contract: privileged
      # check runs on trusted contexts (push/schedule) where secrets are
      # safe; PR-required reader has no secrets and is safe to run on
      # untrusted PR_HEAD code. Together they satisfy "merge requires
      # recent successful drift verification" without exposing secrets.
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with: { node-version: "20", cache: "pnpm" }
        - run: pnpm install --frozen-lockfile
        - name: Assert recent successful verify-branch-protection run on main
          env:
            GH_TOKEN: ${{ github.token }}
          run: |
            # Find the most recent successful run of x-audits.yml on main
            # whose `verify-branch-protection` job succeeded. Fail if the
            # run is older than 8 days (cron is weekly @ Mon 09:00 UTC, so
            # 8 days covers one missed schedule-trigger before alerting).
            LATEST_RUN_JSON=$(gh run list \
              --workflow=x-audits.yml \
              --branch=main \
              --status=success \
              --limit=1 \
              --json databaseId,conclusion,createdAt,headSha)
            echo "$LATEST_RUN_JSON"
            LATEST_RUN_ID=$(echo "$LATEST_RUN_JSON" | jq -r '.[0].databaseId // empty')
            LATEST_RUN_AT=$(echo "$LATEST_RUN_JSON" | jq -r '.[0].createdAt // empty')
            if [ -z "$LATEST_RUN_ID" ]; then
              echo "::error::No successful verify-branch-protection run on main found. Privileged drift-detector has never run successfully — branch protection cannot be verified."
              exit 1
            fi
            # Confirm THIS run's verify-branch-protection job specifically succeeded.
            JOB_CONCLUSION=$(gh run view "$LATEST_RUN_ID" --json jobs \
              | jq -r '.jobs[] | select(.name=="verify-branch-protection") | .conclusion')
            if [ "$JOB_CONCLUSION" != "success" ]; then
              echo "::error::Latest x-audits.yml run on main ($LATEST_RUN_ID) had verify-branch-protection job conclusion=$JOB_CONCLUSION. Drift may exist."
              exit 1
            fi
            # Freshness: fail if older than 8 days.
            NOW_EPOCH=$(date -u +%s)
            RUN_EPOCH=$(date -u -d "$LATEST_RUN_AT" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$LATEST_RUN_AT" +%s)
            AGE_SECONDS=$((NOW_EPOCH - RUN_EPOCH))
            MAX_AGE_SECONDS=$((8 * 24 * 60 * 60))
            if [ "$AGE_SECONDS" -gt "$MAX_AGE_SECONDS" ]; then
              echo "::error::Latest verify-branch-protection success on main is $AGE_SECONDS seconds old (> 8d). Privileged drift-detector has gone stale. Trigger workflow_dispatch on x-audits.yml against main to refresh."
              exit 1
            fi
            echo "OK: verify-branch-protection on main succeeded $AGE_SECONDS seconds ago (run $LATEST_RUN_ID)."
        - uses: actions/upload-artifact@v4
          if: always
          with: { name: branch-protection-status-report, path: /dev/null }
  ```
  Each job pinned to `ubuntu-latest`, runs `pnpm install --frozen-lockfile` then \***\* runs `pnpm gen:admin-tables` followed by `git diff --exit-code lib/audit/admin-tables.generated.ts` BEFORE its `pnpm test:audit:<name>` step. The first command regenerates the admin-tables module from the live spec §4.3; the second fails the workflow if the regeneration produced any diff against the committed `lib/audit/admin-tables.generated.ts` (named diff: `+missing_in_generated:<table>` / `-extra_in_generated:<table>`). This freshness gate is required on EVERY audit job so a stale generated module cannot silently feed into typecheck/lint/test consumers. The `verify-branch-protection` job is exempt only because it does not import the generated file. Then runs `pnpm test:audit:<name>` (the audit scripts are added to `package.json`'s `scripts` block by the respective Task X.1..X.6 owners — `test:audit:traceability`, `test:audit:x1-catalog`, `test:audit:x2-no-raw-codes`, `test:audit:x3-trust-domain`, `test:audit:x4-no-global-cursor`, `test:audit:x5-rls-coverage`; this Task X.6 step adds `test:audit:traceability` to `package.json` as part of the workflow-creation step). Additionally, `package.json`'s `scripts` block is wired so `pretypecheck`, `prelint`, `pretest`, `prebuild` ALL run `gen:admin-tables` first — so any local `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` ALWAYS sees a fresh generated file even outside CI. Each job uploads its named artifact via `actions/upload-artifact@v4` with `if: always` so failure runs still surface diffs. **All non-`verify-branch-protection` jobs gate themselves on `if: github.event_name != 'schedule'`** so the weekly cron trigger fires only the branch-protection verification. **Branch-protection step (manual one-time admin action, called out in Step 3a's commit body for the operator):** after the workflow lands and runs green at least once on `main`, an admin must navigate to repository **Settings → Branches → Branch protection rules → `main`**, enable **"Require status checks to pass before merging"**, and add all SEVEN check names verbatim to the **"Required status checks"** list: `traceability-audit`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-rls-coverage`, `verify-branch-protection-status`. The 7th name is the LIGHTWEIGHT READER (`verify-branch-protection-status`), NOT the privileged `verify-branch-protection` job itself — the privileged job cannot be PR-required because GitHub does not send secrets on `pull_request` from forks (every fork PR would fail closed → permanent merge deadlock). The reader uses only the auto-injected read-only `GITHUB_TOKEN` (safe on fork PRs) to assert the privileged job succeeded recently on `main` (8-day freshness window). The recursive-bootstrap property still holds: the privileged `verify-branch-protection` script (Step 3c) asserts `verify-branch-protection-status` is in the required-checks set, so a future admin who removes it from the list will trigger drift on the very next privileged run. First-deploy bootstrap: the operator explicitly types all seven names; subsequent runs of the verify script confirm all seven are still present. Repo-settings ownership lives outside the codebase, so this is a manual admin task that lands as a one-time follow-up (the spec §17.2 acceptance language already mandates these as PR-blocking; the workflow file alone does not configure protection — GitHub requires the admin step). **X.1-X.6 : the manual step is followed by Step 3c's programmatic verification** — `scripts/verify-branch-protection.ts` runs both as the privileged `verify-branch-protection` workflow job (which fires only on `push` to `main` + weekly `schedule` cron, never on `pull_request` from forks) AND as a weekly scheduled cron (a `schedule:` trigger added at the top of `x-audits.yml` with `cron: '0 9 * * 1'` Monday 09:00 UTC running ONLY the privileged `verify-branch-protection` job — separate `push`/`schedule` event filter on the job's `if:` gate), so any later revert of the manual settings is caught within at most 7 days regardless of whether new PRs flow through. **`pull_request_target` is explicitly NOT used\*\* anywhere in this workflow — using it would run untrusted PR_HEAD code with privileged secrets attached (a documented security hole). The trust-boundary contract is: privileged check on trusted contexts (`push` to main + `schedule`) where committed-to-main code runs with secrets; PR-required reader on untrusted contexts (`pull_request` from forks) where only the read-only `GITHUB_TOKEN` is used to query the privileged job's history.
- [ ] **Step 3b: Verify workflow runs against a known-bad fixture branch and fails as expected.** Create a throwaway branch `verify/x6-workflow-fails-on-bad-spec` that intentionally introduces a spec drift — e.g., remove one entry from §4.3's admin-only bullet list while leaving Plan Task 2.3's `ADMIN_TABLES` registry unchanged (this should fail the §4.3 ↔ AC-2.5 admin-table parity assertion in `tests/cross-cutting/traceability.test.ts`). Push the branch and open a draft PR. Assert: (a) GitHub Actions kicks off the workflow on the PR; (b) the `traceability-audit` job FAILS with a named diff (`+missing_in_ac25:<dropped-table>` or equivalent); (c) the PR shows `traceability-audit` as a failed check; (d) the artifact upload succeeded despite the failure (proving the `if: always` clause works). Repeat for at least one other audit (e.g., introduce a raw `'WIZARD_SESSION_SUPERSEDED'` string literal inside a `components/**/*.tsx` user-facing JSX attribute so `x2-no-raw-codes` fails). Once both verifications pass, close the throwaway PR and delete the verify branch. **This step does NOT block the rest of Task X.6**, but it MUST run before Step 4's commit lands on `main` so the operator has evidence the gate works end-to-end.
- [ ] **Step 3c: Implement `scripts/verify-branch-protection.ts` and its test.** The Step 3a manual admin action ("after the workflow runs green, configure required status checks in GitHub Settings") is plain prose in a commit body — there is nothing in the codebase that detects when the settings are absent OR later reverted. A future admin who disables `enforce_admins` to land an emergency hotfix, or who removes one X._ check from the required list during a flaky-CI episode, leaves the X._ gate suite advisory and there is no automated alarm. This step adds a programmatic verification.
      Script contract (`scripts/verify-branch-protection.ts`):
  1. **Authentication**: prefers `GH_APP_TOKEN` env var (GitHub App installation token, least-privilege); falls back to `BRANCH_PROTECTION_PAT` env var (PAT with `repo` scope). **Auth-failure is treated as an alertable control failure, NOT a silent operator-misconfiguration:** if BOTH env vars are absent OR neither authenticates against the GitHub API (the protection / rulesets calls return 401 / 403 / token-expired), the script emits a `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` admin alert (new §12.4 catalog code) into `admin_alerts` with `context: { gh_app_token_set: boolean, pat_set: boolean, http_status: number | null, last_successful_auth: timestamptz | null, repo: '<owner>/<repo>' }`, then exits non-zero so the workflow job fails (and, since `verify-branch-protection` is now a 7th required check, blocks merge). Without this contract, a token rotation that silently expires both creds would leave the verifier going blind in CI with no admin signal — drift could ship undetected. **Escalation procedure (also documented in spec §17.2 / runbook):** if `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` fires, an admin must rotate the GH App credentials (or the PAT) within 24h or branch-protection drift can ship undetected.
  2. **API call**: `GET /repos/{owner}/{repo}/branches/main/protection` (Branch Protection REST endpoint) AND `GET /repos/{owner}/{repo}/rulesets` (Rulesets API — covers organizations using rulesets instead of legacy branch protection). Owner/repo are read from `GITHUB_REPOSITORY` env var when running in Actions, or from `git remote get-url origin` parsing locally. The script accepts EITHER protection model: if a legacy branch-protection rule exists for `main`, validate against its fields; if a `ref_name` ruleset targets `main`, validate against its rules instead. Drift in either model fails identically.
  3. **Assertions** (every failure produces a named diff line in the JSON report at `artifacts/branch-protection-report.json`):
     - `required_status_checks.strict === true` (require branches up-to-date with base before merging).
     - `required_status_checks.contexts` contains ALL SEVEN names verbatim: `traceability-audit`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-rls-coverage`, `verify-branch-protection-status`. Missing any name → `BRANCH_PROTECTION_DRIFT` with `+missing_check:<name>` diff. The 7th name (`verify-branch-protection-status`) is the lightweight reader job, NOT the privileged `verify-branch-protection` job itself — the privileged job cannot be PR-required because GitHub does not send secrets on `pull_request` from forks (every fork PR would fail closed → permanent merge deadlock). The recursive-bootstrap property still holds: this privileged script asserts the reader is in the required-checks set, so an admin who removes it from required-checks triggers drift on the next privileged run. The reader, in turn, asserts the privileged job has succeeded recently on `main` (8-day freshness window), so removing or breaking the privileged job also fails the merge gate within 8 days. Extra check names not in the spec are allowed (defense-in-depth).
     - `required_pull_request_reviews.required_approving_review_count >= 1`.
     - `required_pull_request_reviews.dismiss_stale_reviews === true` (so a force-push doesn't preserve old approvals).
     - `enforce_admins === true` (admins cannot bypass the gate).
     - `allow_force_pushes.enabled === false` AND `allow_deletions.enabled === false` on `main`.
  4. **On drift**: emits the JSON report (one entry per failed assertion), prints a human-readable summary to stdout, AND inserts a row into the `admin_alerts` table:
     ```ts
     await supabaseAdmin.from("admin_alerts").insert({
       code: "BRANCH_PROTECTION_DRIFT",
       context: {
         failures: failedAssertions,
         repo: `${owner}/${repo}`,
         ts: new Date.toISOString(),
       },
       severity: "high",
     });
     ```
     Then exits non-zero (workflow job fails; required-check status surfaces in the `verify-branch-protection` job and any cron-only run also fails its check). Insertion uses the Supabase service-role client (`SUPABASE_SECRET_KEY`) since CI runs outside any user session; the workflow injects the secret via env (see Step 3a's `verify-branch-protection` job env block).
  5. **On success**: emits a green report (`{ status: 'ok', checks: [...] }`) and exits zero.
     Test (`tests/cross-cutting/verify-branch-protection.test.ts`) — the script's behavior is exercised against mocked GitHub API responses (`nock` or `msw` intercepts the REST calls; `supabaseAdmin.from('admin_alerts').insert` is mocked to a Vitest spy). Required cases:
  - `missing-check-name` fixture: API response omits `x3-trust-domain` from `contexts` → script exits 1, `admin_alerts` insert called with `code: 'BRANCH_PROTECTION_DRIFT'` and `context.failures` includes `+missing_check:x3-trust-domain`.
  - `insufficient-review-count` fixture: API returns `required_approving_review_count: 0` → exits 1, named diff `review_count:0 < 1`.
  - `enforce-admins-disabled` fixture: API returns `enforce_admins.enabled: false` → exits 1, named diff `enforce_admins:false`.
  - `strict-false` fixture: API returns `required_status_checks.strict: false` → exits 1, named diff `strict:false`.
  - `dismiss-stale-disabled` fixture: API returns `dismiss_stale_reviews: false` → exits 1, named diff.
  - `allow-force-push-enabled` fixture: API returns `allow_force_pushes.enabled: true` → exits 1, named diff.
  - `ruleset-only-happy-path` fixture: legacy branch-protection 404, Rulesets API returns a `ref_name=main` ruleset with all six checks + admin enforcement + 1 review required → exits 0, no `admin_alerts` insert.
  - `legacy-protection-happy-path` fixture: legacy branch-protection returns full passing config → exits 0, no `admin_alerts` insert.
  - `no-token` fixture: neither `GH_APP_TOKEN` nor `BRANCH_PROTECTION_PAT` set → exits 1 AND `admin_alerts` insert called with `code: 'BRANCH_PROTECTION_MONITOR_AUTH_FAILED'` and `context.gh_app_token_set === false` AND `context.pat_set === false` AND `context.http_status === null`. Auth failure is now treated as an alertable control failure, NOT a silent operator misconfiguration, because a verifier that goes blind cannot detect downstream drift.
  - `gh-app-token-401` fixture: `GH_APP_TOKEN` set but expired; protection-API call returns 401 → exits 1 AND `admin_alerts` insert called with `code: 'BRANCH_PROTECTION_MONITOR_AUTH_FAILED'` and `context.http_status === 401` and `context.gh_app_token_set === true`.
  - `pat-403` fixture: PAT set but lacks `repo` scope; API call returns 403 → exits 1 AND `admin_alerts` insert with `code: 'BRANCH_PROTECTION_MONITOR_AUTH_FAILED'` and `context.http_status === 403` and `context.pat_set === true`.
  - `expired-token` fixture: API returns the GitHub-specific expired-token signal (401 with body `{ "message": "Bad credentials" }` or `X-GitHub-SSO` re-auth header) → exits 1 AND `admin_alerts` insert with `code: 'BRANCH_PROTECTION_MONITOR_AUTH_FAILED'` and `context.http_status === 401`.
  - **Anti-tautology**: each test scopes its assertion to the specific spy call's payload (`expect(insertSpy).toHaveBeenCalledWith({ code: 'BRANCH_PROTECTION_DRIFT', context: expect.objectContaining({ failures: expect.arrayContaining([...]) }), severity: 'high' })`), NOT to "exit code is non-zero" alone — the latter would pass for any thrown error and not prove the alert mechanism works.
    Add `pnpm test:audit:branch-protection` to `package.json` (runs the test file). The Step 3a workflow's `verify-branch-protection` job runs the SCRIPT (live API call); the test file runs against the mocks.
- [ ] **Step 4: Commit** `feat(cross-cutting): machine-generated traceability matrix + §16 coverage gate + x-audits.yml workflow + verify-branch-protection (AC-X.6)`.

---
