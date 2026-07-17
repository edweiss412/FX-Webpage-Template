# CASP-2 — Compact StatusStrip toggle variant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `PublishedToggle` a compact `variant="inline"` (switch + "Published" label + an out-of-flow popover for errors/finalize) so the sticky `StatusStrip` stays slim on a phone.

**Architecture:** One new optional prop `variant?: "card" | "inline"` on `PublishedToggle` (default `"card"` = today's exact card). The shared `<form>` action + error `useState` + `SwitchButton` stay in place (B1 dispatch-safety untouched); only the *rendering* of errors/finalize differs by variant — card renders an in-flow block + subline, inline renders an absolutely-positioned popover. `StatusStrip` passes `variant="inline"`. The dropped subline's copy is already carried by the Overview `admin-share-link-inactive` notice (single source).

**Tech Stack:** Next.js 16, React 19 (`useFormStatus`, form actions), Tailwind v4, Vitest + jsdom (unit), Playwright (real-browser layout).

**Spec:** `docs/superpowers/specs/2026-07-17-casp2-inline-toggle-variant.md` (adversarial-review APPROVED, 5 rounds).

## Global Constraints

- **TDD per task:** failing test → minimal impl → green → commit. Never impl before its test. (AGENTS invariant 1)
- **Commit per task**, conventional-commits: `<type>(<scope>): <summary>`. Scope `admin`. One task per commit. (invariant 6)
- **No raw error codes in UI** — errors render via `ErrorExplainer` (`components/messages/ErrorExplainer.tsx`, a `messageFor()` consumer) + `HelpAffordance`. (invariant 5)
- **B1 dispatch-safety:** the switch stays the form SUBMITTER and disables ONLY on `useFormStatus().pending` or `finalizeOwned` — never synchronously in its own `onClick`. Refusals do NOT `router.refresh()`. (spec §6)
- **No motion:** `PublishedToggle` is in the `SERVER_RENDERED` motion-pin (`tests/components/admin/transitionAudit.test.tsx:39`, assertions `:64-80`) — no `framer-motion`/`motion/react`, no `AnimatePresence`, no `animate-[`/`route-enter`/`stagger`. The popover is a conditional mount (instant). (spec §4.8)
- **UI surface → impeccable dual-gate (invariant 8):** `/impeccable critique` + `/impeccable audit` on the diff before close-out review; P0/P1 fixed or deferred.
- **Popover copy is byte-identical to card:** the generic-retry string and refusal rendering reuse card's exact nodes/const (curly apostrophe `’`). (spec §4.4)

## Meta-test inventory (spec §10)

**No new registry.** Presentational change: no mutation surface, admin route, Supabase call boundary, `admin_alerts` code, advisory-lock holder, or drive-keyed table. `setShowPublishedAction` (the mutation) is untouched. Existing pins re-run (not extended): `transitionAudit.test.tsx` (motion), `statusStrip.test.tsx` (strip contract), `_metaBgAccentInventory.test.ts` (switch `bg-accent` unchanged). No `pg_advisory*` touched → no advisory-lock topology section needed.

## File Structure

- `components/admin/PublishedToggle.tsx` — MODIFY: add `variant` prop; extract shared `formAction` + `RETRY_COPY` const + `POPOVER_POSITION` const; add inline branch with popover; add optional `describedBy` to `SwitchButton`. Card branch stays byte-identical.
- `components/admin/showpage/StatusStrip.tsx` — MODIFY: pass `variant="inline"`; drop the now-needless `min-w-0` on the wrapper.
- `tests/components/admin/PublishedToggle.test.tsx` — MODIFY: add inline-variant cases (states S1–S5, precedence, a11y, class-equality).
- `tests/components/admin/showpage/statusStrip.test.tsx` — MODIFY: assert the strip renders the inline variant.
- `tests/e2e/_statusStripToggleHarness.tsx` — CREATE: static harness rendering the inline toggle in idle / finalize / card-baseline states for real-browser geometry.
- `tests/e2e/statusStripToggleLayout.spec.ts` — CREATE: Playwright 390px geometry (height-invariance, compaction, horizontal-containment).
- `tests/e2e/admin-lifecycle-transitions.spec.ts` — MODIFY: update the OFF-state subline assertion to the Overview inactive notice.
- `DEFERRED.md` — MODIFY: mark CASP-2 RESOLVED.

---

### Task 1: `PublishedToggle` inline variant + popover

**Files:**
- Modify: `components/admin/PublishedToggle.tsx`
- Test: `tests/components/admin/PublishedToggle.test.tsx`

**Interfaces:**
- Produces: `PublishedToggleProps.variant?: "card" | "inline"` (default `"card"`). Inline DOM: container `data-testid="published-toggle-inline"` (a `<div>`), a `<span>Published</span>` label, the shared switch (`data-testid="published-toggle"`), and — when applicable — a popover `data-testid="published-toggle-popover"` with `id="published-toggle-popover-<slug>"`. Card DOM unchanged (`published-toggle-row`, `-subline`, `-error`, `-retry`).
- Consumes: `ErrorExplainer` (`code`, `surface="admin"`), `HelpAffordance` (`code`), `messageFor` (tests only), `useFormStatus`.

- [ ] **Step 1: Write failing tests — inline render + states.** Append to `tests/components/admin/PublishedToggle.test.tsx`. The file ALREADY imports `act, cleanup, fireEvent, render, screen` (`:19`), `PublishedToggle` (`:20`), `messageFor` (`:21`), `vi` (`:18`) — do NOT re-import them (duplicate declarations). Reuse the existing `okAction()` and `renderToggle` helpers; add the inline helpers + `describe` block below:

```tsx
function renderInline(
  overrides: Partial<{
    published: boolean;
    finalizeOwned: boolean;
    setPublished: (n: boolean) => Promise<{ ok: true } | { ok: false; code: string }>;
  }> = {},
) {
  return render(
    <PublishedToggle
      slug="s1"
      variant="inline"
      published={overrides.published ?? true}
      finalizeOwned={overrides.finalizeOwned ?? false}
      setPublished={overrides.setPublished ?? okAction()}
    />,
  );
}
const inlineRoot = () => screen.getByTestId("published-toggle-inline");
const popover = () => screen.queryByTestId("published-toggle-popover");

describe("PublishedToggle — inline variant", () => {
  it("card is the default AND explicit variant='card' renders the card row (both)", () => {
    renderToggle({ published: true }); // existing helper, no variant → default card
    expect(screen.getByTestId("published-toggle-row")).toBeTruthy();
    expect(screen.queryByTestId("published-toggle-inline")).toBeNull();
    cleanup();
    // explicit variant="card" (Task 3 consumes this for the baseline) — must match the default
    render(
      <PublishedToggle slug="s1" variant="card" published={true} finalizeOwned={false} setPublished={okAction()} />,
    );
    expect(screen.getByTestId("published-toggle-row")).toBeTruthy();
    expect(screen.queryByTestId("published-toggle-inline")).toBeNull();
  });

  it("S1 idle: renders label + switch, no card chrome, no popover", () => {
    renderInline({ published: true, finalizeOwned: false });
    expect(inlineRoot()).toBeTruthy();
    expect(screen.getByTestId("published-toggle").getAttribute("aria-checked")).toBe("true");
    expect(inlineRoot().textContent).toContain("Published");
    expect(screen.queryByTestId("published-toggle-row")).toBeNull();
    expect(screen.queryByTestId("published-toggle-subline")).toBeNull();
    expect(popover()).toBeNull();
  });

  it("S2 refusal: error popover (role=alert) with catalog copy, NOT the raw code, NO in-flow block, NO refresh", async () => {
    const setPublished = vi.fn(async () => ({ ok: false as const, code: "PUBLISH_BLOCKED_PENDING_REVIEW" }));
    renderInline({ published: false, setPublished });
    await act(async () => { fireEvent.click(screen.getByTestId("published-toggle")); });
    const pop = popover()!;
    expect(pop).not.toBeNull();
    expect(pop.getAttribute("role")).toBe("alert");
    const expected = messageFor("PUBLISH_BLOCKED_PENDING_REVIEW").dougFacing!;
    expect(pop.textContent).toContain(expected);
    expect(pop.textContent).not.toContain("PUBLISH_BLOCKED_PENDING_REVIEW"); // invariant 5
    expect(screen.queryByTestId("published-toggle-error")).toBeNull(); // no in-flow block
    expect(routerRefresh).not.toHaveBeenCalled(); // R10
  });

  it("S3 generic error: retry popover with card's curly-apostrophe copy", async () => {
    const setPublished = vi.fn(async () => ({ ok: false as const, code: "infra_error" }));
    renderInline({ published: true, setPublished });
    await act(async () => { fireEvent.click(screen.getByTestId("published-toggle")); });
    const pop = popover()!;
    expect(pop.getAttribute("role")).toBe("alert");
    expect(pop.textContent).toContain("That didn’t go through. Refresh and try again.");
  });

  it("S4 finalize: disabled switch + calm popover (NOT role=alert) described-by wired", () => {
    renderInline({ published: true, finalizeOwned: true });
    const sw = screen.getByTestId("published-toggle");
    expect(sw.hasAttribute("disabled")).toBe(true);
    const pop = popover()!;
    expect(pop).not.toBeNull();
    expect(pop.getAttribute("role")).not.toBe("alert");
    expect(pop.textContent).toContain("Changes are being finalized");
    expect(sw.getAttribute("aria-describedby")).toBe(pop.getAttribute("id"));
    expect(pop.getAttribute("id")).toBe("published-toggle-popover-s1");
  });

  it("S5: a refusal preserved across a finalize flip keeps the ERROR popover (error wins), switch now disabled", async () => {
    const setPublished = vi.fn(async () => ({ ok: false as const, code: "PUBLISH_BLOCKED_PENDING_REVIEW" }));
    const { rerender } = renderInline({ published: false, finalizeOwned: false, setPublished });
    await act(async () => { fireEvent.click(screen.getByTestId("published-toggle")); });
    // sibling soft-refresh flips finalizeOwned; local errorCode is preserved
    rerender(
      <PublishedToggle slug="s1" variant="inline" published={false} finalizeOwned={true} setPublished={setPublished} />,
    );
    const pop = popover()!;
    expect(pop.getAttribute("role")).toBe("alert"); // error wins, not the finalize hint
    expect(pop.textContent).toContain(messageFor("PUBLISH_BLOCKED_PENDING_REVIEW").dougFacing!);
    expect(screen.getByTestId("published-toggle").hasAttribute("disabled")).toBe(true);
  });

  it("error and finalize popovers share the EXACT positioning class set; only skin/role differ", async () => {
    // Strong form (Codex plan-R1 finding 3): the S4 geometry is the real-browser proxy for S2's
    // geometry (§8.10), so the two popovers must not merely share SOME tokens — the non-skin
    // token set must be IDENTICAL, and neither may carry a stray geometry class (right-0,
    // translate-x-*, a max-w other than max-w-60) that would let the error popover overflow
    // while the measured finalize popover stays in-viewport.
    const POSITION = ["absolute", "left-0", "top-full", "z-40", "mt-1", "w-max", "max-w-60",
      "break-words", "rounded-sm", "p-2", "text-sm", "shadow-tile"]; // === POPOVER_POSITION tokens
    const ERROR_SKIN = new Set(["border", "border-border-strong", "bg-warning-bg", "text-warning-text"]);
    const FINALIZE_SKIN = new Set(["border", "border-border", "bg-surface", "text-text-subtle"]);
    const FORBIDDEN = /^(right-0|right-\d|translate-x-|max-w-(?!60\b))/; // any geometry that breaks the proxy

    const { unmount } = renderInline({ published: true, finalizeOwned: true });
    const finalizeTokens = popover()!.className.split(/\s+/).filter(Boolean);
    unmount();
    const setPublished = vi.fn(async () => ({ ok: false as const, code: "PUBLISH_BLOCKED_PENDING_REVIEW" }));
    renderInline({ published: false, setPublished });
    await act(async () => { fireEvent.click(screen.getByTestId("published-toggle")); });
    const errorTokens = popover()!.className.split(/\s+/).filter(Boolean);

    for (const t of POSITION) {
      expect(finalizeTokens, `finalize missing ${t}`).toContain(t);
      expect(errorTokens, `error missing ${t}`).toContain(t);
    }
    // Non-position tokens must be exactly the allowed skin — no stray geometry.
    const finalizeExtra = finalizeTokens.filter((t) => !POSITION.includes(t));
    const errorExtra = errorTokens.filter((t) => !POSITION.includes(t));
    expect(new Set(finalizeExtra)).toEqual(FINALIZE_SKIN);
    expect(new Set(errorExtra)).toEqual(ERROR_SKIN);
    for (const t of [...finalizeTokens, ...errorTokens]) {
      expect(t, `forbidden geometry class ${t}`).not.toMatch(FORBIDDEN);
    }
  });

  it("inline B1 dispatch-safety: clicking the enabled switch actually dispatches the form action", async () => {
    // The B1 revoke-hang bug is a SYNCHRONOUS onClick disable, which cancels the React form
    // submit (feedback_react_form_action_synchronous_disable_cancels_submit). Proof the submit
    // fires: setPublished is CALLED with the flipped value. If a synchronous disable regressed
    // in, the action would never run and this assertion would fail.
    const setPublished = vi.fn(async () => ({ ok: true as const }));
    renderInline({ published: true, finalizeOwned: false, setPublished });
    const sw = screen.getByTestId("published-toggle");
    expect(sw.getAttribute("type")).toBe("submit");
    expect(sw.closest("form")).not.toBeNull();
    expect(sw.hasAttribute("disabled")).toBe(false); // enabled at rest
    await act(async () => { fireEvent.click(sw); });
    expect(setPublished).toHaveBeenCalledTimes(1);
    expect(setPublished).toHaveBeenCalledWith(false); // flipped from published:true
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx`
Expected: FAIL — `variant` prop unknown / `published-toggle-inline` not found.

- [ ] **Step 3: Implement the variant.** Edit `components/admin/PublishedToggle.tsx`:

  1. Add to `PublishedToggleProps`:
  ```ts
  /** Presentation. "card" (default) = full bordered box w/ h3 + subline + in-flow error.
   *  "inline" = compact switch + "Published" label; refusal/finalize copy → anchored popover. */
  variant?: "card" | "inline";
  ```
  2. Destructure with default: `variant = "card"` in the function params.
  3. Above the component (module scope), add the shared const:
  ```ts
  // Reused verbatim by card (published-toggle-retry) and inline (popover) so the copy is byte-identical.
  const RETRY_COPY = "That didn’t go through. Refresh and try again.";
  // Shared popover positioning — pinned equal across error+finalize skins (spec §8.11d). left-0
  // (not right-0) keeps a 240px popover on-screen when the toggle wraps left on a 390px phone.
  const POPOVER_POSITION =
    "absolute left-0 top-full z-40 mt-1 w-max max-w-60 break-words rounded-sm p-2 text-sm shadow-tile";
  // break-words (overflow-wrap:break-word) hard-caps content within max-w-60 (240px) so the
  // error popover's long ErrorExplainer/HelpAffordance content can never overflow horizontally
  // — only grow vertically (out of flow). Load-bearing for the §8.10d error-content probe.
  ```
  4. Change the card's retry `<p>` text to `{RETRY_COPY}` (byte-identical — `&rsquo;` and `’` both render U+2019).
  5. Add the shared form action closure as a local `const formAction` (lift the existing `async () => {…}` currently inline on the card `<form action=>` so both branches share it).
  6. Add `describedBy?: string` to `SwitchButton` and pass it to `aria-describedby={describedBy}`. Card call passes nothing (undefined → attribute absent, byte-identical).
  7. Before the card `return`, add the inline branch:
  ```tsx
  if (variant === "inline") {
    const popoverId = `published-toggle-popover-${_slug}`;
    const showError = errorCode != null || genericError;
    const showFinalize = !showError && finalizeOwned;
    return (
      <div data-testid="published-toggle-inline" className="relative inline-flex items-center gap-2">
        <span className="text-sm font-medium text-text-strong">Published</span>
        <form action={formAction} className="contents">
          <SwitchButton
            on={published}
            disabled={finalizeOwned}
            describedBy={showFinalize ? popoverId : undefined}
          />
        </form>
        {showError ? (
          <div
            id={popoverId}
            data-testid="published-toggle-popover"
            role="alert"
            className={`${POPOVER_POSITION} border border-border-strong bg-warning-bg text-warning-text`}
          >
            {errorCode ? (
              <>
                <ErrorExplainer code={errorCode} surface="admin" />
                <HelpAffordance code={errorCode} />
              </>
            ) : (
              RETRY_COPY
            )}
          </div>
        ) : showFinalize ? (
          <div
            id={popoverId}
            data-testid="published-toggle-popover"
            className={`${POPOVER_POSITION} border border-border bg-surface text-text-subtle`}
          >
            {subline}
          </div>
        ) : null}
      </div>
    );
  }
  ```
  (`subline` already computes the finalize copy for the `finalizeOwned` case; `showFinalize` implies it.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx`
Expected: PASS (all card + inline cases).

- [ ] **Step 5: Re-run the motion pin (must stay green)**

Run: `pnpm vitest run tests/components/admin/transitionAudit.test.tsx`
Expected: PASS — no motion import added.

- [ ] **Step 6: Commit**

```bash
git add components/admin/PublishedToggle.tsx tests/components/admin/PublishedToggle.test.tsx
git commit --no-verify -m "feat(admin): add inline variant + popover to PublishedToggle (CASP-2)"
```

---

### Task 2: `StatusStrip` renders the inline variant

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx:124-136`
- Test: `tests/components/admin/showpage/statusStrip.test.tsx`

**Interfaces:**
- Consumes: `PublishedToggle` `variant="inline"` from Task 1.

- [ ] **Step 1: Write failing test.** In `tests/components/admin/showpage/statusStrip.test.tsx`, add:

```tsx
it("renders the compact inline toggle (not the full card) in the strip", () => {
  renderStrip({ published: true });
  const wrapper = screen.getByTestId("strip-publish-toggle");
  expect(within(wrapper).getByTestId("published-toggle-inline")).toBeTruthy();
  expect(within(wrapper).queryByTestId("published-toggle-row")).toBeNull();
  expect(within(wrapper).getByTestId("published-toggle").getAttribute("aria-checked")).toBe("true");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx`
Expected: FAIL — `published-toggle-inline` not found (strip still renders the card).

- [ ] **Step 3: Implement.** In `components/admin/showpage/StatusStrip.tsx`, change the wrapper + toggle:

```tsx
<div data-testid="strip-publish-toggle" className="shrink-0">
  <PublishedToggle
    slug={slug}
    variant="inline"
    published={published}
    finalizeOwned={finalizeOwned}
    setPublished={setPublished}
  />
</div>
```
(Drop `min-w-0` — no wrapping prose child now.)

- [ ] **Step 4: Run to verify pass (whole strip suite — existing "wraps the existing PublishedToggle" test must still pass)**

Run: `pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/showpage/StatusStrip.tsx tests/components/admin/showpage/statusStrip.test.tsx
git commit --no-verify -m "feat(admin): StatusStrip renders the inline PublishedToggle (CASP-2)"
```

---

### Task 3: Real-browser 390px geometry (static harness)

**Files:**
- Create: `tests/e2e/_statusStripToggleHarness.tsx`
- Create: `tests/e2e/statusStripToggleLayout.spec.ts`
- Modify: `tests/e2e/standalone.config.ts:24-25` (add the new spec to the `testMatch` allowlist — Step 1b)

**Interfaces:**
- Consumes: `StatusStrip` (inline, Task 2) + `PublishedToggle variant="card"` for the baseline.
- Produces: real-browser assertions (spec §8.10 a/b/c/d).

**Approach:** replicate the static-harness scaffold from `tests/e2e/showPageLayout.spec.ts` (tsx subprocess renders `renderToStaticMarkup` → JSON of `{ idleHtml, finalizeHtml, cardHtml }`; compile `app/globals.css` via Tailwind CLI with `@source` at the rendered markup; serve over `node:http`; measure with Playwright at 390px). Runs under `tests/e2e/standalone.config.ts` (no webServer/Supabase). The harness wraps each strip in the real admin-layout shell width so wrapping is faithful, and renders inside `ShareTokenProvider` (token null → no copy-link, irrelevant to geometry).

- [ ] **Step 1: Write the harness.** Create `tests/e2e/_statusStripToggleHarness.tsx`. Model the subprocess main-guard + prop fixtures on `_showPageLayoutHarness.tsx`. **Critical (Codex plan-R1 finding 2): `PublishedToggle` calls `useRouter()` (`PublishedToggle.tsx:27,57`), so each render MUST be wrapped in `AppRouterContext.Provider` with a stub router — copy the exact `stubRouter` + `AppRouterContext.Provider` wrapping from `_showPageLayoutHarness.tsx:32-34,229-238`, else `renderToStaticMarkup` throws "invariant expected app router to be mounted".** Wrap in `ShareTokenProvider` (token null) too. It must emit markup strings via `renderToStaticMarkup`, each the `StatusStrip` at a 390px-width shell:
  - `idle`: `StatusStrip` with `published:true, finalizeOwned:false` (inline S1).
  - `finalize`: `StatusStrip` with `published:true, finalizeOwned:true` (inline S4 — popover renders from the prop, no test-only path).
  - `card`: a strip-like row that renders `<PublishedToggle variant="card" …>` in place of the inline toggle (the pre-CASP-2 baseline). Build this by rendering `StatusStrip` but with a `variant` seam is NOT available — instead render a minimal wrapper `<div className="... same strip classes ...">` containing `<PublishedToggle variant="card" .../>` plus the same title `<h1>`, to represent the old strip layout for the compaction delta. (Only its height is compared; exact chrome parity is not required — it just needs the card toggle in a strip-width row.)
  - `errorProbe` (spec §8.10d, Codex plan-R3 F1): the REAL error-popover CONTENT in a box carrying the width-governing classes, to measure whether the actual `ErrorExplainer`/`HelpAffordance` output respects the 240px cap (the finalize hint's short copy would never reveal an error-content overflow). Render, inside the same 390px strip shell + `relative` container:
    ```tsx
    <div data-testid="error-content-probe" className="absolute left-0 top-full max-w-60 break-words rounded-sm p-2 text-sm">
      <ErrorExplainer code="PUBLISH_BLOCKED_PENDING_REVIEW" surface="admin" />
      <HelpAffordance code="PUBLISH_BLOCKED_PENDING_REVIEW" />
    </div>
    ```
    (`max-w-60 break-words` are the load-bearing width classes — pinned on the real popover by the §8.11d class-equality test, so the probe faithfully reflects the real popover's width behavior. `PUBLISH_BLOCKED_PENDING_REVIEW` is the LONG catalog row — the worst case for width.)

  Run the strip states at both `SHOWPAGE_TITLE` (short) and `SHOWPAGE_LONG_TITLE` for the containment sub-check. Emit JSON `{ idleShort, idleLong, finalizeShort, finalizeLong, cardShort, errorProbe }` to stdout.

- [ ] **Step 1b: Register the new spec in the standalone config.** `tests/e2e/standalone.config.ts:24-25` has an explicit `testMatch` regex allowlist (no glob) — a new spec NOT listed is silently never run (Codex plan-R1 finding 1). Add `statusStripToggleLayout` to the alternation:

```ts
// tests/e2e/standalone.config.ts — add to the testMatch regex alternation
/(…|showPageLayout|statusStripToggleLayout|blocked-row-resolver-transitions)\.spec\.ts/,
```
Verify discovery after writing the spec: `pnpm exec playwright test --config tests/e2e/standalone.config.ts --list | grep statusStripToggleLayout` must print the test.

- [ ] **Step 2: Write the failing spec.** Create `tests/e2e/statusStripToggleLayout.spec.ts`, scaffold copied from `showPageLayout.spec.ts` (execFileSync tsx, Tailwind compile, node:http serve; pass `HASH_FOR_LOG_PEPPER` in the subprocess env as `showPageLayout.spec.ts:90` does — a transitively-imported auth helper has a module-load guard). Set viewport 390. Assertions:

```ts
// (a) height-invariance: popover is out of flow
const idleH = await stripHeight("idleShort");
const finalizeH = await stripHeight("finalizeShort");
expect(Math.abs(idleH - finalizeH)).toBeLessThanOrEqual(0.5);

// (b) compaction: inline < card by > one text-line
const cardH = await stripHeight("cardShort");
expect(cardH - idleH).toBeGreaterThan(20);

// (c) horizontal containment (finalize popover in viewport, no page overflow), both titles
for (const key of ["finalizeShort", "finalizeLong"]) {
  const rect = await popoverRect(key);            // getBoundingClientRect of published-toggle-popover
  expect(rect.left).toBeGreaterThanOrEqual(0);
  expect(rect.right).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(overflow).toBe(true);
}

// (d) error-content probe: the REAL ErrorExplainer+HelpAffordance content respects the 240px cap
const probe = await rectOf("errorProbe", "error-content-probe"); // load errorProbe markup, measure the probe testid
expect(probe.width).toBeLessThanOrEqual(240.5);
expect(probe.left).toBeGreaterThanOrEqual(0);
expect(probe.right).toBeLessThanOrEqual(390);
const probeOverflow = await page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth);
expect(probeOverflow).toBe(true);
```
where `stripHeight`/`popoverRect` load the given markup key into the served page and read the testid's rect (mirror the `measure` helper in `showPageLayout.spec.ts`).

- [ ] **Step 3: Run to verify failure**

Run: `pnpm exec playwright test tests/e2e/statusStripToggleLayout.spec.ts --config tests/e2e/standalone.config.ts`
Expected: FAIL first because the harness/spec are new (compile/scaffold), then — once scaffolded — it exercises the real classes. (If the popover overflowed, `left>=0`/`right<=390` would fail; with `left-0 max-w-60` it passes.)

- [ ] **Step 4: Make it pass.** With Tasks 1–2 already implemented, the assertions pass against the real classes. Fix only harness/scaffold wiring (paths, Tailwind `@source`, server) until green. Do NOT weaken assertions to pass.

Run: `pnpm exec playwright test tests/e2e/statusStripToggleLayout.spec.ts --config tests/e2e/standalone.config.ts`
Expected: PASS (a, b, c).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/_statusStripToggleHarness.tsx tests/e2e/statusStripToggleLayout.spec.ts tests/e2e/standalone.config.ts
git commit --no-verify -m "test(admin): real-browser 390px geometry for inline toggle strip (CASP-2)"
```

---

### Task 4: Update the OFF-state e2e (subline → Overview notice)

**Files:**
- Modify: `tests/e2e/admin-lifecycle-transitions.spec.ts:247-258`

- [ ] **Step 1: Update the assertion.** The strip no longer renders `published-toggle-subline`. Replace the subline expectation after the OFF flip with the switch state (already asserted) plus the Overview inactive notice:

```ts
await expect(toggle).toHaveAttribute("aria-checked", "false");
// The strip no longer carries a subline (CASP-2 inline variant); the paused-state
// copy now lives once in the Overview #share-access inactive notice.
await expect(page.getByTestId("admin-share-link-inactive")).toContainText(
  "The crew link is inactive while this show is unpublished.",
);
```
Remove the old `getByTestId("published-toggle-subline")` expectation and its comment.

- [ ] **Step 2: Run**

Run: `pnpm exec playwright test tests/e2e/admin-lifecycle-transitions.spec.ts`
Expected: PASS (this is an app-boot e2e; run against the local stack per the repo's e2e config). If the local stack is unavailable in this environment, confirm the assertion compiles/typechecks and rely on real CI to execute it (note it in the task closure).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-lifecycle-transitions.spec.ts
git commit --no-verify -m "test(admin): OFF-state e2e asserts Overview inactive notice, not the removed subline (CASP-2)"
```

---

### Task 5: Regression sweep, impeccable dual-gate, DEFERRED close-out

**Files:**
- Modify: `DEFERRED.md` (CASP-2 → RESOLVED)

- [ ] **Step 1: Full regression sweep.** Grep the source-scanning meta-tests that reference the touched files and run the full unit suite:

```bash
grep -rln "PublishedToggle\|StatusStrip" tests/
pnpm vitest run tests/components/admin/ tests/components/admin/showpage/ tests/styles/_metaBgAccentInventory.test.ts
pnpm typecheck
pnpm lint
pnpm format:check
```
Expected: all green. Fix any drift (e.g. a card-render test that assumed the old retry literal — none expected since `RETRY_COPY` renders the identical text).

- [ ] **Step 2: Impeccable dual-gate (invariant 8).** Run `/impeccable critique` and `/impeccable audit` on the diff (setup gates: `context.mjs` PRODUCT.md+DESIGN.md → register reference). Fix P0/P1 in-branch or defer via `DEFERRED.md`. Record findings + dispositions in the branch notes / this plan's closure.

- [ ] **Step 3: Mark CASP-2 resolved.** In `DEFERRED.md`, update the CASP-2 header (line ~616) to `✅ RESOLVED` with a one-line pointer to this branch + spec, mirroring the CASP-1 RESOLVED-RETIRED format.

- [ ] **Step 4: Commit**

```bash
git add DEFERRED.md
git commit --no-verify -m "docs: mark CASP-2 resolved (inline StatusStrip toggle variant shipped)"
```

---

## Self-Review

**Spec coverage:** §4.1 variant prop → T1. §4.2 card unchanged → T1 (default-card test). §4.3 inline render → T1. §4.4 popover (skins, left-0, max-w-60, RETRY_COPY, ErrorExplainer/HelpAffordance) → T1. §4.5 a11y (describedby, no role=alert on finalize, single aria-label) → T1 (S4 test). §4.6 StatusStrip → T2. §4.7 Overview single-source → T4 (e2e asserts the notice). §4.8 transition inventory → T1 (S1–S5 + class-equality). §5 guards → T1 states. §6 / §8.7 B1 → preserved + proven by the new inline dispatch test (T1) + existing suite (T5). §7/§8.10 dimensional (a height-invariance, b compaction, c finalize-containment, d error-content probe) → T3. §8.11 (incl. d break-words class-equality) → T1. §8.12 → T4. §9 impeccable → T5. §10 meta → declared above.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `variant?: "card" | "inline"` used identically in T1 (definition), T2/T3 (consumers). `describedBy?: string` on `SwitchButton` matches its single call sites. `POPOVER_POSITION`/`RETRY_COPY` referenced consistently in impl + the class-equality test. Popover id `published-toggle-popover-<slug>` consistent across impl (T1 step 3), S4 test, and aria-describedby.

**B1 note:** the shared `formAction` and `SwitchButton` are lifted, not rewritten — the switch stays the submitter, disables only on `pending`/`finalizeOwned`. The **inline-specific** B1 proof is the new Task 1 test "inline B1 dispatch-safety: clicking the enabled switch actually dispatches the form action" — it asserts `setPublished` is CALLED on click (a synchronous-onClick-disable regression would cancel the submit and fail this), which is a real behavioral guard, not the weak `onclick`-attribute / initial-disabled checks in the existing suite (Codex plan-R1 finding 6). The existing tests still run in T5 as a secondary regression net.
