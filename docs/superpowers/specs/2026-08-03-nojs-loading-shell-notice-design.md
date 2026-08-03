# No-JavaScript notice in `LoadingShell` — design

**Date:** 2026-08-03
**Closes:** `BL-ADMIN-NOJS-LOADING-CONFLICT` (BACKLOG.md:1261-1263)
**Surface:** `components/layout/Skeleton.tsx` (UI surface — invariant 8 impeccable dual-gate applies)
**Blast radius:** 1 component, inherited by 9 route loading fallbacks. No DB, no RPC, no advisory locks, no error codes, no mutation surface.

---

## 1. Problem

Every route with a `loading.tsx` streams its skeleton fallback first and delivers the real content in a `hidden` div that an inline script reveals. With JavaScript disabled that script never runs, so the visitor watches a shimmering placeholder forever with no explanation.

### 1.0 Probe evidence (run 2026-08-03, Next 16.2.10, `next dev`)

The empirical-spike rule (`docs/agents/spec-self-review.md:21`) forbids designing against undocumented framework behavior from first principles. A throwaway route (`app/nojs-probe/`, since deleted) was created with a `force-dynamic` async page awaiting 400ms and a `loading.tsx` wrapping `LoadingShell`. `curl http://127.0.0.1:3010/nojs-probe` returned 200 and 18.5 KB. Verbatim excerpts from that response:

Fallback, rendered inline and visible:

```html
<!--$?--><template id="B:0"></template><div data-testid="probe-loading"><p role="status" class="sr-only">Loading probe…</p><div aria-hidden="true" class="animate-pulse rounded-md bg-surface-sunken motion-reduce:animate-none h-20 w-full"></div></div><!--/$-->
```

Real content, delivered but hidden:

```html
<div hidden id="S:1"><main data-testid="probe-real-content">PROBE_REAL_CONTENT_MARKER</main></div>
```

Reveal mechanism, the last thing in `<body>`:

```html
<script>…$RC("B:0","S:0")</script>
```

**Conclusions carried into this design, each grounded in the excerpt above:**

1. The fallback markup is in the initial HTML, so a `<noscript>` block placed inside `LoadingShell` reaches a no-JS visitor. The design's delivery mechanism is proven, not assumed.
2. The real content is present but carries the `hidden` attribute, so it is not rendered and not exposed to assistive technology. Hiding the fallback leaves the notice as the page's only visible content — there is no second copy of the page to collide with.
3. The reveal is a script call. There is no server-side signal that JS is unavailable and no non-JS reveal path, which is why gating `loading.tsx` on JS detection is not an option (see §1.1.3).

### 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|---|---|
| 1 | **The named symptom in the backlog entry is already gone.** The entry cites a failing e2e at tests/e2e/admin-banner.spec.ts:261 (path given unlinked because the file no longer exists). It was deleted wholesale in `67ce6d082` ("feat(admin): mount bell in both chromes; retire AlertBanner"), along with components/admin/AlertBanner.tsx and its `<details>`-based no-JS contract. No no-JS contract survives anywhere: `rg noscript app components` returns zero hits at this branch point. This spec fixes the entry's *structural* half only. | `git show --stat 67ce6d082` |
| 2 | **Scope is the notice, not no-JS support.** The app requires JavaScript. This change makes that legible; it does not make any page work without JS. Restoring full no-JS rendering was considered and declined by the user on 2026-08-03. | §10 |
| 3 | **JS detection cannot be server-side.** The reveal is a client-side `$RC()` call (§1.0). The server cannot know whether the client will run it, so "gate `loading.tsx` behind JS detection" — one of the three options the backlog entry lists — is not implementable and is not being attempted. | §1.0 conclusion 3 |
| 4 | **`<noscript>`-scoped `<style>` is the chosen hide mechanism, deliberately.** A browser with JS enabled does not parse `<noscript>` contents at all, so the rule costs zero bytes of runtime work and cannot affect the JS-on path. No client-side detection, no hydration branch, no `useEffect`. | §2 |
| 5 | **The `role="status"` announcement is suppressed in the no-JS branch on purpose.** "Loading your dashboard…" is false once nothing can arrive; leaving it would announce a lie to a screen-reader user. It stays inside the wrapper element for the JS-on path so `tests/components/layout/PageTransition.test.tsx:103` (`toContainElement(status)`) still holds. | §2, §4 |
| 6 | **Copy is an inline JSX literal, not a `lib/messages` catalog row.** Invariant 5 governs error *codes*. This is static chrome prose, matching the established pattern for component copy (`components/layout/Skeleton.tsx:31` `label = "Loading…"`). No meta-test requires component prose to be registry-backed. | AGENTS.md invariant 5 |
| 7 | **One insertion point covers all nine routes.** Every `loading.tsx` in the repo wraps its skeleton in `LoadingShell` (§11). There is no per-route work and no per-route copy. | §11 |

---

## 2. The change

`components/layout/Skeleton.tsx`, `LoadingShell` (currently `components/layout/Skeleton.tsx:30-44`). The wrapper `<div data-testid={testId}>` and the `<p role="status">` both stay; the children move one level down into a hide-able wrapper, and a `<noscript>` sibling is added ahead of them.

```tsx
export function LoadingShell({
  children,
  label = "Loading…",
  testId,
}: {
  children: ReactNode;
  label?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <noscript>
        <style
          dangerouslySetInnerHTML={{ __html: "[data-loading-shell-content]{display:none}" }}
        />
        <div
          data-testid="loading-nojs-notice"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <p className="font-semibold text-text-strong">JavaScript is required</p>
          <p className="mt-1 text-sm text-text-subtle">
            This page needs JavaScript to load. Turn it on in your browser settings, then reload.
          </p>
        </div>
      </noscript>
      <div data-loading-shell-content>
        <p role="status" className="sr-only">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}
```

**Element-by-element rationale.**

- `<noscript>` first, so a no-JS visitor meets the notice before the (now hidden) shell in document order — this is also the reading order for a screen reader running without JS.
- `dangerouslySetInnerHTML` on `<style>` rather than a text child: React treats `<style>` children as a hoistable-resource signal in some configurations, and the explicit `__html` form renders the rule in place unconditionally. The payload is a fixed string literal with no interpolation, so there is no injection surface.
- The selector is the attribute `[data-loading-shell-content]`, unique to this component, so the rule cannot reach any other element. It is inside `<noscript>`, so it exists only when JS is off.
- `data-testid="loading-nojs-notice"` is the handle for both the component test and the e2e probe.
- Tokens only: `border-border`, `bg-surface`, `text-text-strong`, `text-text-subtle` — all four are existing `@theme` tokens spanning light and dark (`app/globals.css`), so the notice inherits theme correctly with no new token and no new contrast row in `DESIGN.md` §1.2.

**Visual treatment.** A quiet bordered card on the surface fill, with the skeleton hidden — chosen by the user on 2026-08-03 over an amber warning card above a still-shimmering skeleton, and over a bare line of text. Rationale: a shimmer that will never resolve is an active lie about the page's state, so removing it is the point of the change, not a side effect.

---

## 3. Copy

| Element | Text |
|---|---|
| Title | `JavaScript is required` |
| Body | `This page needs JavaScript to load. Turn it on in your browser settings, then reload.` |

Constraints met: no em-dash (U+2014), pinned by `tests/components/crew/loading.test.tsx:67` which scans the crew loading tree's `textContent` and will now see this string; no `SCREAMING_SNAKE` token, pinned by `tests/components/crew/loading.test.tsx:69`; no occurrence of the word budget, pinned by `tests/components/crew/loading.test.tsx:60`; no apostrophes, so no straight-vs-curly question arises. States the fix, not only the fault.

---

## 4. Guard conditions

| Input | Value | Behavior |
|---|---|---|
| `testId` | `undefined` (the `app/me/loading.tsx:11` case) | `data-testid` attribute is omitted; unchanged from today. The notice's own `data-testid` is a literal and is always present. |
| `label` | omitted | Defaults to `"Loading…"` as today. Irrelevant to the no-JS branch, which hides the `role="status"` element. |
| `label` | empty string | Renders an empty `role="status"` element, as today. Not a new case; unchanged. |
| `children` | `null` / empty | Wrapper `<div data-loading-shell-content>` renders empty. No-JS branch is unaffected — the notice does not depend on children. |
| `children` | any tree | Never inspected. The hide rule is attribute-scoped to the wrapper, so arbitrary children are hidden wholesale with no per-child requirement. |

There is no failure mode where both the notice and the skeleton are visible: they are mutually exclusive by the browser's `<noscript>` semantics, not by application logic.

---

## 5. Dimensional invariants

**N/A.** `LoadingShell` has no fixed-height or fixed-width parent and imposes no dimension on its children — it is a bare `<div>` wrapper. The new `<div data-loading-shell-content>` is likewise unstyled (no class attribute), so it is a block box that inherits its parent's width and does not alter any child's box. The notice card is intrinsically sized by its padding and content.

The one relationship worth stating: inserting a `<div>` between the outer wrapper and the children adds a block box to the ancestor chain. Both the outer wrapper and the new inner wrapper are unstyled block `<div>` elements, so each is full-width of its parent and neither establishes a flex or grid context. Percentage-width children therefore resolve against the same containing-block width as today. That matters for exactly one file — `app/help/loading.tsx:13` opens with a width-relative `<Skeleton className="h-8 w-2/3" />` rather than its own layout `<div>` — and it is unaffected, because 2/3 of an unstyled block div is 2/3 of what that div's parent was already giving it. No `loading.tsx` uses a direct-descendant or sibling combinator that crosses the wrapper boundary; all nine style their children with utility classes on the children themselves. The plan verifies this with the real-browser layout assertion rather than resting on the argument.

## 6. Transition inventory

**N/A, with reason.** `LoadingShell` has two branches, JS-on and JS-off, but they are not runtime states and there is no transition between them: which branch renders is decided by the browser at parse time from a static document and cannot change without a reload. There is no state pair to animate, no `AnimatePresence`, no conditional remount, and no compound transition. The skeleton's own `animate-pulse` is unchanged and remains gated behind `motion-reduce:animate-none` (`components/layout/Skeleton.tsx:19`).

---

## 7. Tests

### 7.1 Component test — tests/components/layout/loadingShellNoJs.test.tsx (new file, so the path is unlinked)

React renders `<noscript>` children as real DOM nodes under jsdom, so the block is directly assertable.

| Assertion | Failure it catches |
|---|---|
| A `<noscript>` element exists inside the `LoadingShell` wrapper, and `loading-nojs-notice` is a descendant **of that `<noscript>`**, queried via `container.querySelector("noscript")` and then scoped to that subtree. | The notice rendered outside `<noscript>`, which would show it to every visitor on every route load. This is the anti-tautology point of the test: a bare `getByTestId("loading-nojs-notice")` would pass in that broken state, so the query MUST be scoped to the `<noscript>` subtree. |
| The `<noscript>` subtree contains a `<style>` whose text is exactly `[data-loading-shell-content]{display:none}`. | A typo'd selector or a renamed attribute leaves the skeleton visible under the notice. |
| The element carrying `data-loading-shell-content` exists, contains the `role="status"` element, and contains the passed children (asserted with a sentinel child testid). | The attribute drifted off the wrapper, so the hide rule matches nothing. Asserting `role="status"` is *inside* it is what makes the misleading announcement provably suppressed. |
| The `<style>` rule's selector, extracted from the rendered `<style>` text, is used to `querySelector` the container and MUST return the content wrapper. | Selector and attribute disagreeing — the single defect the two prior assertions cannot catch individually, because each is independently satisfiable. Derives the expectation from the rendered output rather than restating the literal. |
| Notice copy contains no U+2014 and no `/[A-Z]{2,}_[A-Z0-9_]+/`. | Copy-convention drift, caught at the component rather than only through the crew route's tree scan. |

### 7.2 Real-browser probe — tests/e2e/nojs-loading-notice.spec.ts (new file, so the path is unlinked)

jsdom cannot evaluate `<noscript>` semantics or CSS, so the behavioral claim needs a real browser. This test is also the regression guard that the deleted admin-banner spec used to provide, and the standing proof of §1.0.

- `test.use({ javaScriptEnabled: false })` at file scope.
- Authenticate with `signInAs(page, …)` — the helper POSTs through `page.request` (`tests/e2e/helpers/signInAs.ts:60`), not through browser JS, so it works with scripting disabled.
- `page.goto("/admin")`, which has `app/admin/loading.tsx`.
- Assert `getByTestId("loading-nojs-notice")` **is visible** — Playwright's visibility check evaluates computed style, so this also proves the notice is not itself caught by the hide rule.
- Assert `getByTestId("admin-dashboard-loading")`'s skeleton content **is hidden** — scoped to `[data-loading-shell-content]`, asserting `toBeHidden()`. This is the assertion that proves the `<noscript>` `<style>` actually applied; the notice being visible alone does not.
- Assert the dashboard's real content is absent from the accessible tree, matching §1.0 conclusion 2.
- A companion case in the same file with `javaScriptEnabled` left at its default asserts the notice is **not** present, so the test cannot pass by the notice rendering unconditionally.

Register the spec in `playwright.config.ts` under an existing project's `testMatch` (the `desktop-chromium` project, `playwright.config.ts:78`) so it runs against the port-3000 webServer rather than adding a new project and server.

### 7.3 Existing tests that touch this component

All were read before drafting; each is expected to keep passing, and the plan verifies rather than assumes:

- `tests/components/layout/PageTransition.test.tsx:94-103` — asserts the `role="status"` element is `sr-only` and is contained by the testId'd wrapper. Still true: containment is transitive through the new wrapper.
- `tests/app/admin/loadingSkeletons.test.tsx:37-61` — wrapper testId present, exactly one `role="status"`, ≥3 `.animate-pulse.bg-surface-sunken` plates, no raw color class, no raw error code. The notice adds no plate, no second status element, no hex literal, and no code.
- `tests/components/crew/loading.test.tsx:23-69` — 6 tab placeholders, no "budget", no em-dash, no error code. The notice text enters this tree's `textContent`; §3 confirms it violates none of the three scans.

---

## 8. Ledger

`BL-ADMIN-NOJS-LOADING-CONFLICT` moves from `BACKLOG.md` to `BACKLOG-archive.md` in the same PR, with a resolution note recording both halves: the named symptom was already obsolete (`67ce6d082`), and the structural half is fixed here. Per invariant 12 the entry carries `**Status:** IN PROGRESS · **Branch:** fix/nojs-loading-shell-notice` while the branch is live, and the marker is removed by the archive move itself — an archived entry may not hold a flight marker (`tests/docs/_metaLedgerInProgress.test.ts`).

## 9. Documented limits

- **Pages without a `loading.tsx` are untouched.** A no-JS visitor to such a route gets whatever the server rendered, which for most of this app is a non-interactive page. Making those pages announce their own JS requirement is out of scope and would require a different mechanism (a root-layout `<noscript>`), which would then fire on pages that genuinely do render.
- **The notice is unstyled beyond the four tokens.** No icon, no heading landmark, no link to browser instructions. Deliberate: it is a dead-end state that should not invite interaction.
- **A visitor with CSS disabled but JS enabled** sees nothing new; a visitor with both disabled sees the notice text and the skeleton's markup unstyled. Neither is a regression and neither is addressed.
- **`next dev` was the probe environment.** Streaming boundary emission is identical in `next build`, and the e2e in §7.2 runs against the suite's own server, so the behavioral claim is verified in whatever mode CI uses rather than inferred from the probe.

## 10. Out of scope

Restoring real no-JS rendering on any route; removing or restructuring any `loading.tsx`; a root-layout `<noscript>`; any change to the nine skeleton silhouettes; any change to `PageTransition`; any progressive-enhancement work on forms or navigation.

## 11. Citations

Every claim about current code, verified at this branch point (`e2121ff8a`).

| Claim | Anchor |
|---|---|
| `LoadingShell` current shape | `components/layout/Skeleton.tsx:30-44` |
| `Skeleton` primitive, `motion-reduce` gate | `components/layout/Skeleton.tsx:15-21` |
| Nine `loading.tsx`, all wrapping `LoadingShell` | `app/help/loading.tsx:12`, `app/me/loading.tsx:11`, `app/admin/loading.tsx:12`, `app/admin/needs-attention/loading.tsx:13`, `app/admin/settings/loading.tsx:11`, `app/admin/settings/admins/loading.tsx:11`, `app/admin/show/staged/[stagedId]/loading.tsx:11`, `app/admin/show/[slug]/preview/[crewId]/loading.tsx:27`, `app/show/[slug]/[shareToken]/loading.tsx:35` |
| `app/me/loading.tsx` passes no `testId` | `app/me/loading.tsx:11` |
| Deleted no-JS e2e and its component (paths unlinked — they are no longer tracked) | `git show --stat 67ce6d082` lists tests/e2e/admin-banner.spec.ts and components/admin/AlertBanner.tsx among its deletions |
| No `<noscript>` anywhere in `app/` or `components/` | `rg noscript app components` → 0 hits |
| `role="status"` containment assertion | `tests/components/layout/PageTransition.test.tsx:103` |
| Skeleton-plate and status-count assertions | `tests/app/admin/loadingSkeletons.test.tsx:37-61` |
| Em-dash / error-code / "budget" scans on the crew loading tree | `tests/components/crew/loading.test.tsx:57-69` |
| `signInAs` uses `page.request.post`, not browser JS | `tests/e2e/helpers/signInAs.ts:60-66` |
| `desktop-chromium` project `testMatch` and baseURL | `playwright.config.ts:77-86` |
| Tokens exist for both themes | `app/globals.css:292-313` (light `:root`) and the `prefers-color-scheme: dark` block opening at `app/globals.css:341` |
| `rounded-lg` has precedent in `components/` | `components/admin/BellPanel.tsx`, `components/admin/FinalizeButton.tsx` |
| No lint or meta-test bans `dangerouslySetInnerHTML`, `<style>`, or `<noscript>` in components | `rg` over `tests/`, `eslint.config.mjs` → 0 prohibitions; `tests/styles/_metaNewTabAnnouncement.test.ts:236` treats `noscript` as a known intrinsic tag |
| Backlog entry text | `BACKLOG.md:1261-1263` |
