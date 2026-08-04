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

The boundary ids differ between the two excerpts — the content div is boundary 1, the reveal call names boundary 0 — because the response carried more than one suspense boundary — the layout's and the page's — and the excerpts were pulled from different ones by searching for different markers. Nothing turns on the pairing; what matters is that every such pair is completed by a `$RC` call and there is no non-script completion path.

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
        <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
          <div
            data-testid="loading-nojs-notice"
            className="rounded-md border border-border bg-surface p-tile-pad"
          >
            <h1 className="text-2xl font-semibold text-text-strong">JavaScript is required</h1>
            <p className="mt-2 text-base text-text-subtle">
              This page needs JavaScript to load. Turn it on, then reload.
            </p>
          </div>
        </div>
      </noscript>
      <div data-loading-shell-content="">
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
- `dangerouslySetInnerHTML` on `<style>` rather than a text child: React treats `<style>` children as a hoistable-resource signal in some configurations, and the explicit `__html` form renders the rule in place unconditionally. The payload is a fixed string literal with no interpolation, so there is no injection surface. **Verified, not assumed** — see §2.1.
- `data-loading-shell-content=""` with an explicit empty string, not the bare JSX attribute. Bare `<div data-loading-shell-content>` is `={true}` in JSX and serializes to `data-loading-shell-content="true"`, which the attribute selector still matches, but the empty-string form keeps the rendered HTML and the test's expected markup identical and free of a meaningless value.
- The selector is the attribute `[data-loading-shell-content]`, unique to this component, so the rule cannot reach any other element. It is inside `<noscript>`, so it exists only when JS is off.
- `data-testid="loading-nojs-notice"` is the handle for both the component test and the e2e probe.
- **The notice carries its own gutter and width cap** (`mx-auto w-full max-w-2xl px-4 py-8 sm:px-8`), which is not optional polish. Seven of the nine `loading.tsx` routes put their layout padding on a child of `data-loading-shell-content` — the half the rule hides — so the notice inherits no page padding there. (`app/me` and `app/help` are the exceptions: their padding sits on a parent of `LoadingShell`, so the gutter double-applies and the card is ~32px narrower. Dispositioned as a P3 in the plan's §12.) Without the gutter the card runs flush to both edges of a 390px phone on the crew route (`app/show/[slug]/layout.tsx:37` is a bare `flex min-h-screen flex-col` shell and adds none) and stretches past 1500px on a wide admin viewport. Surfaced as the impeccable critique's only P1.
- `rounded-md` and `p-tile-pad` rather than `rounded-lg`/`p-4`: DESIGN.md §4 reserves the 16px radius for modal and dialog surfaces, and on `border-border` cards this repo runs `rounded-md` roughly 129 times to `rounded-lg`'s 9 (of which 9 of 10 are popovers). `p-tile-pad` (20px) is the house card padding, 64 uses. Structural twin: `components/admin/RecentAutoAppliedStrip.tsx:676`.
- The title is an `<h1>`, not a styled `<p>`. For a no-JS visitor the routed content never renders (§1.0), so within the route segment this notice is all there is, and a screen-reader user navigating by heading reaches a landmark that says what state the page is in. It is not always the document's *only* heading — a persistent layout outside the suspense boundary still renders, and `app/help/layout.tsx` keeps a sidebar whose links are `<h3>` elements (`app/help/_components/Sidebar.tsx:56`). An `<h1>` above those is a correct hierarchy, not a collision. The type scale matches the app's other dead-end screens — `app/admin/layout.tsx:95-96` pairs a `text-2xl` title with a `text-base` body for exactly this kind of state — so the notice reads in the same register as every other 'this page cannot show you anything' state rather than as a caption. (The earlier draft used a `<p>` and justified it as "should not invite interaction"; heading semantics do not imply interactivity, and the two undifferentiated paragraphs that produced were a real a11y defect.)
- Tokens only: `border-border`, `bg-surface`, `text-text-strong`, `text-text-subtle` — all four are existing `@theme` tokens spanning light and dark (`app/globals.css`), so the notice inherits theme correctly with no new token and no new contrast row in `DESIGN.md` §1.2.

### 2.1 SSR probe — React does not hoist the `<noscript>` `<style>`

React 19 promotes some `<style>` elements to hoisted stylesheet resources, which would move the rule out of `<noscript>` and apply it to every visitor, hiding the skeleton for everyone. That risk was measured rather than reasoned about. A standalone script rendered the tree above through the worktree's own `react-dom/server` (React 19, from `node_modules`, run 2026-08-03) via both `renderToStaticMarkup` and `renderToString`, with one deliberate difference: the wrapper used the bare JSX attribute rather than the empty-string form, which is why the transcript below reads `="true"`. Both renderers produced byte-identical output, with the rule in place:

```html
<div data-testid="shell"><noscript><style>[data-loading-shell-content]{display:none}</style><div data-testid="loading-nojs-notice">…</div></noscript><div data-loading-shell-content="true"><p role="status" class="sr-only">Loading your dashboard…</p><div data-testid="child"></div></div></div>
```

No hoisting, no dedupe, no drop. Independently corroborated by the round-1 cross-model review, which reproduced it against React 19.2.4 in both static and streaming SSR and additionally confirmed that no existing selector or `!important` rule in the stylesheet competes with the unclassed wrapper.

**Visual treatment.** A quiet bordered card on the surface fill, with the skeleton hidden — chosen by the user on 2026-08-03 over an amber warning card above a still-shimmering skeleton, and over a bare line of text. Rationale: a shimmer that will never resolve is an active lie about the page's state, so removing it is the point of the change, not a side effect.

---

## 3. Copy

| Element | Text |
|---|---|
| Title | `JavaScript is required` |
| Body | `This page needs JavaScript to load. Turn it on, then reload.` |

Constraints met: no em-dash (U+2014), no `SCREAMING_SNAKE` token, no occurrence of the word budget, no apostrophes (so no straight-vs-curly question arises). States the fix, not only the fault.

The body deliberately does **not** name where the setting lives. An earlier draft said "Turn it on in your browser settings", which is wrong on the primary persona's device: on iOS, JavaScript is under Settings → Apps → Safari → Advanced, not in Safari itself. Naming no location is correct everywhere; naming one is wrong on the platform most of this app's crew actually use.

Those first three mirror the scans at `tests/components/crew/loading.test.tsx:60`, `tests/components/crew/loading.test.tsx:67` and `tests/components/crew/loading.test.tsx:69`, but note that those scans do **not** reach this string: under jsdom the notice never enters the rendered tree at all (§7.0). The copy constraints are therefore enforced by the new SSR component test in §7.1, not inherited from the crew route's scans.

---

## 4. Guard conditions

| Input | Value | Behavior |
|---|---|---|
| `testId` | `undefined` (the `app/me/loading.tsx:11` case) | `data-testid` attribute is omitted; unchanged from today. The notice's own `data-testid` is a literal and is always present. |
| `label` | omitted | Defaults to `"Loading…"` as today. Irrelevant to the no-JS branch, which hides the `role="status"` element. |
| `label` | empty string | Renders an empty `role="status"` element, as today. Not a new case; unchanged. |
| `children` | `null` / empty | Wrapper `<div data-loading-shell-content>` renders empty. No-JS branch is unaffected — the notice does not depend on children. |
| `children` | any tree | Never inspected. The hide rule is attribute-scoped to the wrapper, so arbitrary children are hidden wholesale with no per-child requirement. |

With CSS applied, there is no failure mode where both the notice and the skeleton are visible: they are mutually exclusive by the browser's `<noscript>` semantics, not by application logic. With CSS disabled *and* JS disabled both appear, which is a stylesheet-less rendering of the whole app and is out of scope (§9).

---

## 5. Dimensional invariants

**N/A.** `LoadingShell` has no fixed-height or fixed-width parent and imposes no dimension on its children — it is a bare `<div>` wrapper. The new `<div data-loading-shell-content>` is likewise unstyled (no class attribute), so it is a block box that inherits its parent's width and does not alter any child's box. The notice card is intrinsically sized by its padding and content.

The one relationship worth stating: inserting a `<div>` between the outer wrapper and the children adds a block box to the ancestor chain. Both the outer wrapper and the new inner wrapper are unstyled block `<div>` elements, so each is full-width of its parent and neither establishes a flex or grid context. Percentage-width children therefore resolve against the same containing-block width as today. That matters for the two files whose first child under `LoadingShell` is width-relative rather than a self-contained layout `<div>`: `app/help/loading.tsx:13` (`<Skeleton className="h-8 w-2/3" />`) and `app/admin/show/[slug]/preview/[crewId]/loading.tsx:29` (a `w-full` skeleton). Both are unaffected for the same reason: a percentage of an unstyled block div is a percentage of what that div's parent was already giving it, and `w-full` is 100% of an unchanged width. No `loading.tsx` uses a direct-descendant or sibling combinator that crosses the wrapper boundary; all nine style their children with utility classes on the children themselves.

No dedicated layout assertion is specified, because there is no dimensional invariant to assert — this section is N/A, and promising a real-browser measurement here would oblige the plan to invent a route, a measurement, and an invariant that the spec never states. The JS-on control case in §7.2 exercises the new wrapper in a real browser as a side effect, which is the appropriate level of coverage for a change that imposes no dimension.

## 6. Transition inventory

**N/A, with reason.** `LoadingShell` has two branches, JS-on and JS-off, but they are not runtime states and there is no transition between them: which branch renders is decided by the browser at parse time from a static document and cannot change without a reload. There is no state pair to animate, no `AnimatePresence`, no conditional remount, and no compound transition. The skeleton's own `animate-pulse` is unchanged and remains gated behind `motion-reduce:animate-none` (`components/layout/Skeleton.tsx:19`).

---

## 7. Tests

### 7.0 Why the component test renders on the server, not through jsdom

The obvious test — `render(<LoadingShell/>)` from `@testing-library/react`, then query the notice — **does not work, and this was measured before the test was designed.** A throwaway probe rendered the patched `LoadingShell` through the project's existing jsdom setup and reported:

```json
{ "found": true, "childElementCount": 0, "innerHTML": "",
  "scopedQueryFindsNotice": false, "styleText": null,
  "wrapperFound": true, "containerText": "Loading…" }
```

The `<noscript>` element exists; its children do not. React's client renderer leaves the subtree empty under jsdom, so nothing inside the block is queryable and its text never joins `container.textContent`.

Two consequences, both load-bearing:

1. **The component test must render through `react-dom/server`.** `renderToStaticMarkup` emits the block in full (verified — the exact output is in §7.1), which is also the more faithful test: a no-JS visitor receives server HTML, and server HTML is precisely what this feature is made of.
2. **No existing jsdom test can see the notice**, which is why §7.3's three files are unaffected rather than merely believed to be.

Anyone later "fixing" this test to use `@testing-library/react` will get a test that passes vacuously against a component that renders nothing. That is the trap this section exists to mark.

### 7.1 Component test — tests/components/layout/loadingShellNoJs.test.tsx (new file, so the path is unlinked)

`// @vitest-environment jsdom`, asserting on `renderToStaticMarkup(<LoadingShell testId="probe" label="Loading your dashboard…"><div data-testid="child" /></LoadingShell>)`. The file renders on the server but runs under the jsdom environment, because jsdom is what supplies `DOMParser` (§7.1 assertions) — `node` has no DOM parser, and an earlier draft that specified `node` was not executable. Re-run against a throwaway patch carrying the final `<h1>` markup, that call returns, verbatim:

```html
<div data-testid="probe"><noscript><style>[data-loading-shell-content]{display:none}</style><div class="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8"><div data-testid="loading-nojs-notice" class="rounded-md border border-border bg-surface p-tile-pad"><h1 class="text-2xl font-semibold text-text-strong">JavaScript is required</h1><p class="mt-2 text-base text-text-subtle">This page needs JavaScript to load. Turn it on, then reload.</p></div></div></noscript><div data-loading-shell-content=""><p role="status" class="sr-only">Loading your dashboard…</p><div data-testid="child"></div></div></div>
```

**Assertions are structural, not positional.** An earlier draft asserted that the status element and the sentinel child appear *after* the wrapper attribute in the string. That is a false-green: `<div data-loading-shell-content=""></div>` followed by a visible status element and a visible skeleton satisfies every "appears after" check while leaving the feature completely broken, and the e2e's `toBeHidden()` — scoped to that same empty wrapper — would pass too. Ordering is not containment.

So the test splits the markup at the `<noscript>` boundary and parses each half as DOM, which is possible precisely because neither half then contains a `<noscript>` element (HTML parsers treat `<noscript>` contents inconsistently depending on whether scripting is considered enabled; removing the element sidesteps that entirely):

1. `noscriptInner` — the substring strictly between `<noscript>` and `</noscript>`.
2. `outer` — the full markup with that whole element removed.

Each is parsed with `DOMParser` (so the test file runs under `// @vitest-environment jsdom` while still rendering via `react-dom/server` — jsdom supplies the parser, not the renderer). Assertions then use real DOM containment.

The test must NOT snapshot the whole string, which would fail on every unrelated class-order change.

| # | Assertion | Failure it catches |
|---|---|---|
| 1 | `noscriptInner` contains `[data-testid="loading-nojs-notice"]`, and `outer` contains **no** such element. | The notice rendered outside `<noscript>`, showing the card to every visitor on every route load. A bare `toContain` passes in exactly that state, so presence alone is not an assertion. |
| 2 | `noscriptInner`'s `<style>` has `textContent` exactly `[data-loading-shell-content]{display:none}`. | A typo'd selector, a renamed attribute, or React hoisting the style out of the block (§2.1). |
| 3 | Extract the selector from that `<style>` with a regex, then `outer.querySelector(<extracted>)` is non-null. | Style and wrapper attribute disagreeing — independently satisfiable while 2 and 4 both pass. |
| 4 | `wrapper.contains(status)` and `wrapper.contains(sentinelChild)`, where `wrapper` is `outer.querySelector("[data-loading-shell-content]")`. | An empty wrapper rendered as a *sibling* of the announcement and children. Containment, never ordering. |
| 5 | The `h1` has `textContent` exactly `JavaScript is required`; the `p` exactly `This page needs JavaScript to load. Turn it on, then reload.` | A benign but wrong message, which every other assertion tolerates. |
| 6 | The notice's title element is an `h1` (assert `tagName`). | Silent regression to a styled `<p>`. |
| 7 | The notice text contains no U+2014 and no `/[A-Z]{2,}_[A-Z0-9_]+/`. | Copy-convention drift, which no existing scan reaches (§7.0). |
| 8 | The notice's **parent** carries `mx-auto`, `max-w-2xl`, `px-4`. | Loss of the gutter. Every `loading.tsx` puts its page padding inside the hidden half, so without this the card runs edge-to-edge at 390px and past 1500px on wide admin. |
| 9 | The notice's class list contains `rounded-md`, `border`, `border-border`, `bg-surface`, `p-tile-pad` (membership, so order is not pinned). | A classless card that keeps the copy and discards the treatment. |
| 10 | The heading's class list contains `text-2xl`, `font-semibold`, `text-text-strong`; the body's contains `mt-2`, `text-base`, `text-text-subtle`. | Token drift on the text elements — separate from 9 because fixing the card does not imply fixing these. |
| 11 | `notice.contains(h1)` and `notice.contains(bodyParagraph)`. | An empty padded card beside loose copy, which assertion 5 alone accepts. |
| 12 | The serialized `outer` markup contains the literal `data-loading-shell-content=""`. | Regression to the bare JSX attribute, which serializes to `="true"`; the attribute *selector* matches either way. |

### 7.2 Real-browser probe — tests/e2e/nojs-loading-notice.spec.ts (new file, so the path is unlinked)

jsdom cannot evaluate `<noscript>` semantics or CSS, so the behavioral claim needs a real browser. This test is also the regression guard that the deleted admin-banner spec used to provide, and the standing proof of §1.0.

**Two `describe` blocks, each with its own `test.use` — never a file-scoped one.** A file-scoped `test.use({ javaScriptEnabled: false })` applies to every case in the file, including the JS-on control, which would then silently test the same configuration twice and prove nothing about the JS-on path. The JS-on control is not a race in either direction: with JavaScript enabled the browser never parses `<noscript>` contents at all, so the count is 0 from first paint onward and stays 0. Both reads below are therefore stable. The structure is:

```ts
test.describe("JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });
  // cases 1-3
});

test.describe("JavaScript enabled (control)", () => {
  test.use({ javaScriptEnabled: true });
  // case 4
});
```

Both blocks authenticate with `signInAs(page, ADMIN_FIXTURE)` — the helper POSTs through `page.request` (`tests/e2e/helpers/signInAs.ts:60`), not through browser JS, so it works with scripting disabled — then `page.goto("/admin")`, which has `app/admin/loading.tsx`.

| # | Block | Assertion | Failure it catches |
|---|---|---|---|
| 1 | JS off | `getByTestId("admin-dashboard-loading")` is **attached** to the DOM. | The run landed on a different page. `/admin` can resolve to a checkpoint or onboarding branch rather than the dashboard (`app/admin/page.tsx:175`, `app/admin/page.tsx:237`, `app/admin/page.tsx:250`), so without this the remaining assertions could be measuring some other route entirely. Pinning the admin loading fallback's own testId is what makes cases 2 and 3 mean something. Note this holds regardless of which branch the page *would* have resolved to, because with JS off it never resolves at all. |
| 2 | JS off | `getByTestId("loading-nojs-notice")` is **visible**. | The notice absent, or itself caught by the hide rule. Playwright's visibility check evaluates computed style, so this is a real rendering assertion, not a DOM-presence one. |
| 3 | JS off | The `[data-loading-shell-content]` element **inside** `admin-dashboard-loading` is **hidden**, located as `getByTestId("admin-dashboard-loading").locator("[data-loading-shell-content]")`. | The `<noscript>` `<style>` never applied — the single thing case 2 cannot prove. Scoping through the admin testId rather than page-wide also means an empty stray wrapper elsewhere cannot satisfy it. |
| 4 | JS on | Assert the notice count is 0 **at `commit`**, then again after the fallback has disappeared (`toHaveCount(0)` on the loading testId is the settle edge), and separately that the served HTML *does* contain the notice markup. | The notice rendering unconditionally. The stronger form — fallback attached AND notice count 0 at that instant — is **unobservable**: measured 2026-08-03, `/admin` resolves before any assertion can poll, so `toBeAttached()` on the fallback fails outright with JS on. The failure mode it would guard (a notice outside `<noscript>`, visible during load and gone by settle) is caught deterministically by component assertion 1 instead, which is where the guarantee actually lives. Asserting the markup was served is what keeps the counts evidence rather than absence. |

The earlier draft also asserted "the real dashboard content is absent from the accessible tree." That is dropped: with JS off nothing ever resolves, so the assertion holds no matter what is wrong, and it would equally hold if the fixture had landed on onboarding. Case 1 replaces it with a claim that can actually fail.

**Registration is two steps, and one of them is the whole point of the test.**

1. `playwright.config.ts:78` — add the spec to the `desktop-chromium` project's `testMatch`, so it runs against the port-3000 baseline webServer rather than needing a new project and server.
2. `.github/workflows/admin-layout-e2e.yml` — add it to that job's explicit spec-file list.

Step 2 is not bookkeeping. Most Playwright workflows here name explicit spec files (8 of the 11 that invoke `playwright test`; the exceptions are `standalone-e2e.yml`, `help-affordances.yml` and `dev-gate-e2e.yml`, which run whole configs or projects). The `desktop-chromium` project is in none of those three, so a spec registered only in `testMatch` runs on no CI job at all. `admin-layout-e2e.yml` exists *because of this exact failure*, and says so in its own header: "the spec ran in NO workflow… this gate has been dark since it was written," and a 104-143px `/admin` overflow shipped unnoticed as a result (`.github/workflows/admin-layout-e2e.yml:1-12`). The predecessor of the test being written here failed on `main` from M12.11 until it was deleted, for the same reason. Shipping the replacement into the same blind spot would reproduce the original defect while looking like a fix.

`admin-layout-e2e.yml` is the right host rather than a new workflow: it already runs `desktop-chromium` on `pull_request`, boots only the :3000 baseline via `BASELINE_SERVER_ONLY` (`.github/workflows/admin-layout-e2e.yml:80`), and seeds the corpus the `signInAs(ADMIN_FIXTURE)` path needs (`.github/workflows/admin-layout-e2e.yml:95`).

### 7.3 Existing tests that touch this component

All three were read before drafting, then **measured**: the change from §2 was applied as a throwaway patch, `pnpm vitest run` was run across all three files, and **31 of 31 tests passed**; the patch was then reverted. This is a result, not a prediction. The mechanism is §7.0 — nothing the notice renders is visible to jsdom, so none of these scans can see it.

- `tests/components/layout/PageTransition.test.tsx:94-103` — asserts the `role="status"` element is `sr-only` and is contained by the testId'd wrapper. Still true: containment is transitive through the new wrapper.
- `tests/app/admin/loadingSkeletons.test.tsx:37-61` — wrapper testId present, exactly one `role="status"`, ≥3 `.animate-pulse.bg-surface-sunken` plates, no raw color class, no raw error code. The notice adds no plate, no second status element, no hex literal, and no code.
- `tests/components/crew/loading.test.tsx:23-69` — 6 tab placeholders, no "budget", no em-dash, no error code. The notice text does **not** enter this tree's `textContent` (§7.0), so all three scans are untouched. The copy satisfies them regardless (§3), which is belt-and-braces rather than the load-bearing reason.

---

## 8. Ledger

`BL-ADMIN-NOJS-LOADING-CONFLICT` moves from `BACKLOG.md` to `BACKLOG-archive.md` in the same PR, with a resolution note recording both halves: the named symptom was already obsolete (`67ce6d082`), and the structural half is fixed here. Per invariant 12 the entry carries `**Status:** IN PROGRESS · **Branch:** fix/nojs-loading-shell-notice` while the branch is live, and the marker is removed by the archive move itself — an archived entry may not hold a flight marker (`tests/docs/_metaLedgerInProgress.test.ts`).

## 9. Documented limits

- **Pages without a `loading.tsx` are untouched.** A no-JS visitor to such a route gets whatever the server rendered, which for most of this app is a non-interactive page. Making those pages announce their own JS requirement is out of scope and would require a different mechanism (a root-layout `<noscript>`), which would then fire on pages that genuinely do render.
- **The notice is plain.** It has a gutter, a card, and a type scale (§2), but no icon, no link to per-browser instructions, and no `<main>` landmark. Deliberate: it is a dead-end state that should not invite interaction. It does carry an `<h1>` (§2) — heading semantics describe structure, not interactivity, and a page whose entire content is one card should say so programmatically.
- **A visitor with CSS disabled but JS enabled** sees nothing new; a visitor with both disabled sees the notice text and the skeleton's markup unstyled. Neither is a regression and neither is addressed.
- **`next dev` was the probe environment; CI is not.** The §1.0 probe and any local e2e run against `next dev` (`playwright.config.ts:248`, the non-CI branch of the baseline webServer command). In CI the same entry takes its `process.env.CI` branch and runs `pnpm build && pnpm start` (`playwright.config.ts:245-247`), a production build. So the two modes are covered by different runs of the same spec — dev locally, production in `admin-layout-e2e` — and neither is inferred from the other. This is a strength of routing the test through CI rather than leaving it local-only, and it is the second reason step 2 of §7.2's registration matters.

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
| Tokens exist for both themes | `app/globals.css:292-313` (the light-mode root block) and the `prefers-color-scheme: dark` block opening at `app/globals.css:341` |
| `rounded-lg` has precedent in `components/` | `components/admin/BellPanel.tsx`, `components/admin/FinalizeButton.tsx` |
| No lint or meta-test bans `dangerouslySetInnerHTML`, `<style>`, or `<noscript>` in components | `rg` over `tests/`, `eslint.config.mjs` → 0 prohibitions; `tests/styles/_metaNewTabAnnouncement.test.ts:236` treats `noscript` as a known intrinsic tag |
| Backlog entry text | `BACKLOG.md:1261-1263` |
