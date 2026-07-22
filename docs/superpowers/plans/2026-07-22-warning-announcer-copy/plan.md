# Warning Announcer + Elsewhere-Copy Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement spec `docs/superpowers/specs/2026-07-22-warning-announcer-copy-design.md` — actions-only announce-at-arm live region (append-only `role="log"`), pointer-first elsewhere copy, tap-to-reveal overflow (pure over-cap only), and retirement of the count-tuple sentence.

**Architecture:** A new `WarningAnnounceContext` provides `announce(message)` from `ShowReviewSurface` (published surface only); producers (`DataQualityWarningControls`, `BulkIgnoreControls`) call it on their fetch-success branches. The region is an always-mounted sr-only container with `role="log"` whose children are an append-only message log (ref-counter ids, cap 50). The elsewhere pointer sentence is extracted into an `ElsewherePointerSentence` component so reveal/focus state can use hooks.

**Tech Stack:** Next.js 16 / React, Tailwind v4, Vitest + RTL (jsdom), Playwright.

## Global Constraints

- TDD per task: failing test → minimal implementation → passing test → commit (invariant 1). Commit per task, conventional commits (invariant 6).
- No em-dash in user-visible copy; straight apostrophes; 44px tap floors via `min-w/h-tap-min`; canonical type/token classes (AGENTS.md pre-code mechanical UI gate).
- Pinned user-visible strings (spec §2.3, §3, §4.2–4.3) are exact — byte equality in tests.
- No new advisory-lock surfaces, no DB changes, no new mutation surfaces (spec §5 meta-test inventory: none applies — producers reuse existing API routes; `tests/log/_metaMutationSurfaceObservability.test.ts` walks no new files).
- Layout-dimensions task: N/A — spec §4.4 declares no new fixed-dimension parent (reveal button reuses the shipped inline-button recipe).
- All snippets below were written against strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); every test file touched already carries `// @vitest-environment jsdom` + the `next/navigation` mock.
- New test content goes ONLY into existing wired files (`warningsPanelStatusMount.test.tsx`, `pointerSentence.test.tsx`, `dataQualityWarningControls.test.tsx`, `bulkIgnoreControls.test.tsx`, `warning-panel-polish.spec.ts`) — zero new testMatch/workflow wiring. `tests/e2e/warning-panel-polish.spec.ts` is deliberately CI-unwired (verified: no workflow references it); it is a LOCAL verification gate, run explicitly in Task 6/8.
- e2e harness readiness (AGENTS.md checklist): (a) server boot = default `playwright.config.ts` desktop-chromium project against the generic dev server on port 3000 (config header lines 8-12); (b) readiness gate = seeded-show sign-in then `expect(modal).toBeVisible()` (`MODAL` selector, warning-panel-polish.spec.ts:22-23) — never `networkidle` alone; (c) detach-safety = re-query locators after any action that rerenders the panel; no `locator.evaluate` sampler outlives its element.

---

### Task 0: Author the failing e2e pins (feature-level red)

**Files:**
- Modify: `tests/e2e/warning-panel-polish.spec.ts`

TDD at the feature level (plan-review R1 F1): both e2e tests are authored and
run RED before any implementation task, then re-run GREEN in Task 6.

- [ ] **Step 1: Author two tests.**
  - Announcer: appended as the FINAL test of the existing serial describe
    (plan-review R1 F9: it performs a real Ignore round trip that mutates the
    seeded warning population; running last means no later test observes the
    mutation, and the describe's existing `afterAll` seed deletion is the
    restoration). After the modal-visible gate: `await expect(region).toHaveText("")`;
    click a routed card's Ignore control; `await expect(region).toHaveText("Warning ignored.")`.
  - Reveal: its own `test.describe` with its OWN seeded show routing FOUR
    sections (copy `ROUTED_WARNINGS`, add a `transport` blockRef row —
    `KIND_TO_SECTION` maps `transport`, `lib/admin/step3SectionStatus.ts:22`;
    the existing 3-section seed is untouched). Overflow count derived in-test:
    `const extra = SEEDED_SECTION_COUNT - POINTER_NAME_CAP;` and the button
    name built from it (plan-review R1 F7). Pre-click guard: 4th section
    container NOT at aligned scroll position; tap the reveal button; re-query
    (detach-safety); tap the revealed name; assert aligned position within the
    shipped §8.6 test's tolerance.
- [ ] **Step 2: Run RED.** Dev server up, then
  `pnpm playwright test tests/e2e/warning-panel-polish.spec.ts --project=desktop-chromium`.
  Expected: the two new tests FAIL (region never gains text — announcer absent;
  reveal button not found), every pre-existing test still green.
- [ ] **Step 3: Commit.** `git add tests/e2e/warning-panel-polish.spec.ts && git commit -m "test(admin): failing e2e pins for announcer clause + reveal scroll"`

### Task 1: Pointer-first copy reorder

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:2604` (fallback string), `:2634-2650` (named-branch parts order)
- Test: `tests/components/admin/wizard/pointerSentence.test.tsx`

**Interfaces:**
- Produces: pinned strings `"The warnings that need a look are in <names>. Nothing else to note here."` and fallback `"The warnings that need a look are in their own sections. Nothing else to note here."` — Tasks 2-3 and 6 assert against these.

- [ ] **Step 1: Flip every pinned string in the test file.** In `pointerSentence.test.tsx`, update all eight full-sentence expectations from `"Nothing else to note here. The warnings that need a look are in X."` to `"The warnings that need a look are in X. Nothing else to note here."` (1/2/3-name, 4/5-section overflow, both fallback probes, no-callback probe — the name-list grammar and overflow clause are byte-identical, only clause order flips; overflow rows read `"…are in Crew, Contacts, Hotels, and 1 more. Nothing else to note here."`).
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run tests/components/admin/wizard/pointerSentence.test.tsx` — expect the eight string assertions FAIL against current order.
- [ ] **Step 3: Implement.** In `step3ReviewSections.tsx`:
  - Line 2604 branch: return `"The warnings that need a look are in their own sections. Nothing else to note here."`
  - Named branch: change the opening element of `parts` from `"Nothing else to note here. The warnings that need a look are in "` to `"The warnings that need a look are in "`, and after the existing `parts.push(".")` append `parts.push(" Nothing else to note here.")`.
- [ ] **Step 4: Run to verify pass.** Same command — all green.
- [ ] **Step 5: Commit.** `git add -u && git commit -m "feat(admin): pointer-first elsewhere sentence (spec section 3)"`

### Task 2: `pointerSentenceParts` new shape

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:712-719`
- Test: `tests/components/admin/wizard/pointerSentence.test.tsx:30-44`

**Interfaces:**
- Produces: `pointerSentenceParts(targets, totalSections): { named, extra, missCount }` — `named` = first `POINTER_NAME_CAP` targets; `extra` = resolved targets beyond the cap (NEW); `missCount = max(0, totalSections - targets.length)`. Collapsed overflow N = `extra.length + missCount` (numerically equal to the old `moreCount`). Task 3 consumes all three fields.

- [ ] **Step 1: Rewrite the pure-fn test block** (`pointerSentenceParts (pure, spec §3.5)`) to the new shape:

```ts
it("cap boundary, extra split, unified miss count", () => {
  expect(POINTER_NAME_CAP).toBe(3);
  expect(pointerSentenceParts([T("crew", "Crew")], 1)).toEqual({
    named: [T("crew", "Crew")],
    extra: [],
    missCount: 0,
  });
  expect(pointerSentenceParts([T("crew", "Crew"), T("rooms", "Rooms & scope")], 3)).toEqual({
    named: [T("crew", "Crew"), T("rooms", "Rooms & scope")],
    extra: [],
    missCount: 1,
  });
  const five = [T("a", "A"), T("b", "B"), T("c", "C"), T("d", "D"), T("e", "E")];
  expect(pointerSentenceParts(five, 5)).toEqual({
    named: five.slice(0, 3),
    extra: five.slice(3),
    missCount: 0,
  });
  expect(pointerSentenceParts(five.slice(0, 4), 5)).toEqual({
    named: five.slice(0, 3),
    extra: [five[3]!],
    missCount: 1,
  });
});
```

- [ ] **Step 2: Run to verify failure** (shape mismatch). Same vitest command.
- [ ] **Step 3: Implement:**

```ts
export function pointerSentenceParts(
  targets: ReadonlyArray<{ id: SectionId; label: string }>,
  totalSections: number,
): {
  named: ReadonlyArray<{ id: SectionId; label: string }>;
  extra: ReadonlyArray<{ id: SectionId; label: string }>;
  missCount: number;
} {
  return {
    named: targets.slice(0, POINTER_NAME_CAP),
    extra: targets.slice(POINTER_NAME_CAP),
    missCount: Math.max(0, totalSections - targets.length),
  };
}
```

  Update the render call site (currently destructures `{ named, moreCount }`) to `const { named, extra, missCount } = …` with `const moreCount = extra.length + missCount;` so rendering is unchanged this task.
- [ ] **Step 4: Run pointerSentence + typecheck** (`pnpm vitest run tests/components/admin/wizard/pointerSentence.test.tsx && pnpm typecheck`) — green.
- [ ] **Step 5: Commit.** `git commit -am "refactor(admin): pointerSentenceParts exposes extra targets and missCount (spec section 4.1)"`

### Task 3: Tap-to-reveal overflow (`ElsewherePointerSentence`)

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` — extract the elsewhere `<p>` IIFE (`:2588-2652`) into an internal component; add reveal/focus logic
- Test: `tests/components/admin/wizard/pointerSentence.test.tsx`

**Interfaces:**
- Consumes: Task 2 shape; Task 1 strings.
- Produces: reveal button behavior per spec §4.2-4.3 (Task 6 e2e taps it). Button accessible name: `"Show 1 more section"` / `"Show N more sections"`.

- [ ] **Step 1: Write failing tests** — append to `pointerSentence.test.tsx` a `describe("overflow reveal (spec §4.2-4.3)")` using the existing `renderWarningsBreakdownWithChrome` harness (it accepts `pointerTargets` + `onJumpToSection` directly, which is how `extra`/`missCount` fixtures are constructed):

```tsx
const T5 = [
  T("crew", "Crew"),
  T("contacts", "Contacts"),
  T("hotels", "Hotels"),
  T("transport", "Transport"),
  T("rooms", "Rooms & scope"),
];

it("boundary matrix (R1 F9, R2 F4)", () => {
  // extra=2, miss=0, callback: button, plural aria-label
  renderWarningsBreakdownWithChrome({
    pointerTargets: { targets: T5, totalSections: 5 },
    onJumpToSection: vi.fn(),
  });
  const btn = screen.getByRole("button", { name: "Show 2 more sections" });
  expect(btn.textContent).toBe("2 more");
  cleanup();
  // extra=1, miss=0, callback: singular aria-label
  renderWarningsBreakdownWithChrome({
    pointerTargets: { targets: T5.slice(0, 4), totalSections: 4 },
    onJumpToSection: vi.fn(),
  });
  expect(screen.getByRole("button", { name: "Show 1 more section" })).toBeTruthy();
  cleanup();
  // extra=2, miss=0, NO callback: plain clause
  renderWarningsBreakdownWithChrome({
    pointerTargets: { targets: T5, totalSections: 5 },
  });
  expect(screen.queryByRole("button")).toBeNull();
  cleanup();
  // extra=0, miss=1, callback: plain clause (R2 F9 dead-button boundary)
  renderWarningsBreakdownWithChrome({
    pointerTargets: { targets: T5.slice(0, 3), totalSections: 4 },
    onJumpToSection: vi.fn(),
  });
  expect(screen.queryByRole("button", { name: /more/i })).toBeNull();
  cleanup();
  // extra=1, miss=1, callback: plain "and 2 more.", no reveal button
  renderWarningsBreakdownWithChrome({
    pointerTargets: { targets: T5.slice(0, 4), totalSections: 5 },
    onJumpToSection: vi.fn(),
  });
  expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
  expect(screen.getByTestId(/warnings-elsewhere/).textContent).toContain("and 2 more.");
});

it("tap reveals full list, fires jumps, moves focus once (spec §4.3)", async () => {
  const onJump = vi.fn();
  renderWarningsBreakdownWithChrome({
    pointerTargets: { targets: T5, totalSections: 5 },
    onJumpToSection: onJump,
  });
  fireEvent.click(screen.getByRole("button", { name: "Show 2 more sections" }));
  expect(screen.getByTestId(/warnings-elsewhere/).textContent).toBe(
    "The warnings that need a look are in Crew, Contacts, Hotels, Transport, and Rooms & scope. Nothing else to note here.",
  );
  const transport = screen.getByRole("button", { name: "Transport" });
  await waitFor(() => expect(document.activeElement).toBe(transport));
  // Every revealed name has a LIVE handler (plan-review R1 F6): click each
  // revealed button; ids arrive in registry order.
  for (const t of T5.slice(POINTER_NAME_CAP)) {
    fireEvent.click(screen.getByRole("button", { name: t.label }));
  }
  expect(onJump.mock.calls.map((c) => c[0])).toEqual(
    T5.slice(POINTER_NAME_CAP).map((t) => t.id),
  );
});
```

  Derived counts (plan-review R1 F7): compute overflow labels from the fixture
  (`const n = T5.length - POINTER_NAME_CAP;`) and build the expected button
  name/text (`n === 1 ? "Show 1 more section" : \`Show ${n} more sections\``,
  `\`${n} more\``) instead of hardcoding "2"; same derivation in the
  boundary-matrix rows and the Task 0/6 e2e.

  Plus the expanded-then-data-change quartet (R2 F2 / R3 F3 / R4 F3): the chrome harness does not support rerender, so build these on a local `rerender`-capable variant (same provider JSX via `const view = render(...); view.rerender(...)`) driving `pointerTargets` prop changes after tapping reveal: (a) overflow removed → plain ≤cap sentence; (b) restored → full list, `document.activeElement` unchanged; (c) miss introduced → plain folded clause; (d) one extra replaced while staying over-cap → full list with the new name, focus unchanged; (e) callback removed → plain collapsed clause. Consumed-flag boundary (R4 F2): tap reveal and, in the SAME `act`, rerender with overflow dropped → no focus move; restore overflow → still no focus move.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Extract the IIFE into:

```tsx
function ElsewherePointerSentence({
  targets,
  totalSections,
  onJump,
  dfid,
}: {
  targets: ReadonlyArray<{ id: SectionId; label: string }>;
  totalSections: number;
  onJump: ((id: SectionId) => void) | undefined;
  dfid: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const pendingFocusRef = useRef(false);
  const firstRevealedRef = useRef<HTMLButtonElement | null>(null);
  // One-shot pending-focus flag (spec §4.3): consumed UNCONDITIONALLY on the
  // next commit; focuses only if a revealed button rendered in that commit.
  useLayoutEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    firstRevealedRef.current?.focus();
  });
  const { named, extra, missCount } = pointerSentenceParts(targets, totalSections);
  const revealEligible = onJump !== undefined && extra.length > 0 && missCount === 0;
  const showFull = revealEligible && expanded;
  const names = showFull ? [...named, ...extra] : named;
  const overflowN = showFull ? 0 : extra.length + missCount;
  // …existing nameNode() button/strong recipe verbatim (tap-floor overlay,
  //   z-10, focus ring), with ref={i === named.length ? firstRevealedRef : undefined}
  //   on revealed buttons; existing separator grammar over `names` + overflowN;
  //   reveal button rendered in place of the "N more" text when
  //   revealEligible && !expanded, aria-label singular/plural, onClick:
  //   () => { pendingFocusRef.current = true; setExpanded(true); }
  //   Terminal parts: "." then " Nothing else to note here."
}
```

  The full body reuses the existing grammar code moved from the IIFE; the call site becomes `<ElsewherePointerSentence targets={pt?.targets ?? []} totalSections={pt?.totalSections ?? 0} onJump={chrome?.onJumpToSection} dfid={dfid} />` with the zero-targets fallback branch kept above it.
- [ ] **Step 4: Run pointerSentence suite + typecheck — green.**
- [ ] **Step 5: Commit.** `git commit -am "feat(admin): tap-to-reveal pointer overflow, pure over-cap only (spec section 4)"`

### Task 4: Announce context + message-log region (+ tuple retirement)

**Files:**
- Create: `components/admin/review/warningAnnounceContext.ts`
- Modify: `components/admin/review/ShowReviewSurface.tsx:45` (drop import), `:1109-1123` (region), provider around the sections tree
- Delete: `lib/admin/warningsPanelStatus.ts`, `tests/admin/warningsPanelStatus.test.ts`
- Test: rewrite `tests/components/admin/review/warningsPanelStatusMount.test.tsx`

**Interfaces:**
- Produces: `WarningAnnounceContext: React.Context<{ announce(message: string): void }>` (default no-op); region container `data-testid="warnings-panel-status"` with `role="log"`, children `<span data-announce-id={id}>{text}</span>`. Task 5 consumes `announce`.

- [ ] **Step 1: Rewrite the mount test** to the spec §5.1 contract (replacing all four current tests — they pin the retired derived sentence). Test scaffold: a probe component inside the provider exposes `announce` via `useContext`; drive it with `act`. Cover, each as its own `it`: zero children on mount; changed-props rerender with observer recording zero mutations; single announce → one child, exact text, one childList addition, unchanged across a rerender; identical string twice in separate acts → two children, two additions, zero removals; two announces inside one act → both children present; four announces → order + four DISTINCT `data-announce-id` values + earlier element references identical; 51-announce loop — each announce in its OWN `act` so all 50 predecessors are committed DOM nodes before the 51st (plan-review R1 F3; one big `act` would render only the final 50 and no removal record could exist) → 50 children, first id absent, single removal in the final commit; identical-string test additionally asserts ZERO `characterData` records (plan-review R1 F5a — an implementation may not mutate entry 1 and append entry 2); compound append-during-refresh (plan-review R1 F8): ONE `act` that both calls `announce` and rerenders with changed count props → exactly one childList addition, zero other mutations; whitespace-only + empty-string announces → zero mutations; unmount/remount → zero children; wizard-mode (gateOff) → container absent. MutationObserver pattern:

```ts
const region = screen.getByTestId("warnings-panel-status");
expect(region.getAttribute("role")).toBe("log");
const records: MutationRecord[] = [];
const mo = new MutationObserver((r) => records.push(...r));
mo.observe(region, { childList: true, subtree: true, characterData: true });
// … act(...) steps …
mo.disconnect();
const added = records.flatMap((r) => Array.from(r.addedNodes));
```

- [ ] **Step 2: Run to verify failure** (`pnpm vitest run tests/components/admin/review/warningsPanelStatusMount.test.tsx`).
- [ ] **Step 3: Implement.**

```ts
// components/admin/review/warningAnnounceContext.ts
"use client";
import { createContext } from "react";

export type WarningAnnounce = { announce: (message: string) => void };

/** Spec §2.5: default no-op — a control mounted outside the provider
 *  announces nothing and never throws. */
export const NOOP_WARNING_ANNOUNCE: WarningAnnounce = { announce: () => {} };
export const WarningAnnounceContext = createContext<WarningAnnounce>(NOOP_WARNING_ANNOUNCE);
```

  In `ShowReviewSurface`: delete the `warningsPanelStatusSentence` import and derived span; add

```tsx
const ANNOUNCE_CAP = 50; // spec §2.2: appending the 51st removes the oldest
const announceIdRef = useRef(0);
const [announceLog, setAnnounceLog] = useState<ReadonlyArray<{ id: number; text: string }>>([]);
const announce = useCallback((message: string) => {
  if (message.trim() === "") return; // spec §2.5 empty/whitespace no-op
  const id = announceIdRef.current++;
  setAnnounceLog((log) => {
    const next = [...log, { id, text: message }];
    return next.length > ANNOUNCE_CAP ? next.slice(next.length - ANNOUNCE_CAP) : next;
  });
}, []);
const announceCtx = useMemo(() => ({ announce }), [announce]);
```

  Wrap the existing sections tree in `<WarningAnnounceContext.Provider value={routedWarningsRenderElsewhere ? announceCtx : NOOP_WARNING_ANNOUNCE}>` (single always-mounted provider; wizard gets the no-op — spec §2.2). Region, in the exact spot the old span occupied (outside the chrome-suppressible subtree, comment block `:1109-1114` retained):

```tsx
{s.id === "warnings" && routedWarningsRenderElsewhere ? (
  <span role="log" className="sr-only" data-testid="warnings-panel-status">
    {announceLog.map((e) => (
      <span key={e.id} data-announce-id={e.id}>
        {e.text}
      </span>
    ))}
  </span>
) : null}
```

  Delete `lib/admin/warningsPanelStatus.ts` + `tests/admin/warningsPanelStatus.test.ts` (`git rm`).
- [ ] **Step 4: Run mount suite + `pnpm typecheck` + grep sweep** `rg warningsPanelStatusSentence` → zero hits. Green.
- [ ] **Step 5: Commit.** `git add components/admin/review/warningAnnounceContext.ts && git commit -am "feat(admin): actions-only announce log region; retire count-tuple sentence (spec section 2)"` (explicit `add` — `-am` alone never stages a NEW file; plan-review R1 F2).

### Task 5: Producers + integration

**Files:**
- Modify: `components/admin/DataQualityWarningControls.tsx` (announce in success branch, `:55-57`), `components/admin/BulkIgnoreControls.tsx` (announce in success branch, `:89-106`)
- Test: `tests/components/admin/dataQualityWarningControls.test.tsx`, `tests/components/admin/bulkIgnoreControls.test.tsx`, `tests/components/admin/review/warningsPanelStatusMount.test.tsx` (composed-tree wiring)

**Interfaces:**
- Consumes: Task 4 context. Pinned clauses: `"Warning ignored."`, `"Warning restored."`, `"1 ignored."` / `"${n} ignored."`.

- [ ] **Step 1: Write failing tests.**
  - In each controls file: wrap render in `<WarningAnnounceContext.Provider value={{ announce: spy }}>`; mock `fetch` (ok + `{status:"ignored"|"unignored"}` → spy called exactly once with the pinned clause; `res.ok=false`, thrown fetch → spy never called). Announce-before-refresh ordering (plan-review R1 F4), both producers: the `useRouter` mock's `refresh` is a spy in the same test; assert `announceSpy.mock.invocationCallOrder[0]! < refreshSpy.mock.invocationCallOrder[0]!` — a refresh-first implementation can lose the announcement to a surface replacement. Bulk: n derived from fixture `group.items.length`. Chip-region contract (bulk file): observer attached to the chip's sibling status region at initial render with `{ childList: true, subtree: true, characterData: true, characterDataOldValue: true }`; the callback SNAPSHOTS text at mutation time (record `addedNodes` textContent + `oldValue` into an array — post-hoc DOM inspection misses transient text, plan-review R1 F5b); across arm → confirm → success → refresh, every snapshotted value ⊆ {"", "Tap again to confirm."}, and exactly "Tap again to confirm." while armed. No-provider probe (dataQuality file): full success flow with NO provider → no throw; body-wide observer with the same snapshot-in-callback pattern shows no recorded mutation ever carries "Warning ignored." (plan-review R1 F5c).
  - Composed-tree wiring (mount test file, R4 F5): render `<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 1 })} />` (helper wires the REAL `buildSectionWarningExtras`), mock fetch ok, click the real row Ignore control, `await waitFor` → region gains a `"Warning ignored."` child; separately drive the bulk chip two-tap confirm → region gains `"${n} ignored."`.
- [ ] **Step 2: Run to verify failures.**
- [ ] **Step 3: Implement.** `DataQualityWarningControls`: `const { announce } = useContext(WarningAnnounceContext);` then in the success branch before `router.refresh()`: `announce(json.status === "ignored" ? "Warning ignored." : "Warning restored.");`. `BulkIgnoreControls`: in its success branch before `router.refresh()`: `const n = bulk.items.length; announce(n === 1 ? "1 ignored." : `${n} ignored.`);` (use the exact count variable already sent in the request body at `:89-99`).
- [ ] **Step 4: Run all three suites + typecheck — green.**
- [ ] **Step 5: Commit.** `git commit -am "feat(admin): ignore controls announce completion clauses (spec section 2.3)"`

### Task 6: e2e green re-run

**Files:** none (tests authored RED in Task 0)

- [ ] **Step 1: Run** `pnpm playwright test tests/e2e/warning-panel-polish.spec.ts --project=desktop-chromium` with dev server up. Expected: the Task 0 pins now PASS (red in Task 0 → green here = the feature-level TDD cycle), all pre-existing tests still green.
- [ ] **Step 2: No commit** (no file change); record the run in handoff.md notes.

### Task 7: Transition audit + DEFERRED graduation

**Files:**
- Modify: `DEFERRED.md`, `DEFERRED-archive.md`

- [ ] **Step 1: Transition audit (spec §2.6 + §4.3 tables).** Enumerate every conditional render this diff added: log children (append/trim), reveal button ↔ full list, expanded matrix rows. Verify: zero `AnimatePresence`/`motion` imports added (`rg "framer|motion|AnimatePresence" components/admin/review/warningAnnounceContext.ts components/admin/wizard/step3ReviewSections.tsx components/admin/review/ShowReviewSurface.tsx` limited to the diff hunks) — every transition is deliberately instant per the spec tables; compound rows (append-during-refresh, tap-while-data-drop) are covered by Task 4/3 tests. Record the sweep output in the handoff notes.
- [ ] **Step 2: Graduate the four DEFERRED entries** (DEFERRED.md:69-91) to `DEFERRED-archive.md` under a "Warning announcer + elsewhere copy (2026-07-22)" heading, each annotated with its resolution (§1.1 items 1-4, including the item-8 tuple-retirement amendment); update the reconciliation line at DEFERRED.md:7.
- [ ] **Step 3: Add the VoiceOver owner action to DEFERRED.md** (plan-review R1 F11): an autonomous pipeline cannot truthfully perform a manual VoiceOver pass, so the spec §8 F10 mitigation's manual half becomes a tracked owner action — new entry "VOICEOVER-ANNOUNCER-SPOTCHECK: owner runs VoiceOver over ignore / bulk-ignore / reveal on the published panel; un-defer trigger: owner performs and records the pass." Update the spec §8 F10 line's mitigation wording from "part of the implementation plan's verification step" to "tracked as a DEFERRED.md owner action" in the same commit (post-APPROVE amendment, recorded here and in handoff.md §12; the automated halves — impeccable audit a11y dimension + the structural role/mutation tests — remain pre-merge gates).
- [ ] **Step 4: Create `docs/superpowers/plans/2026-07-22-warning-announcer-copy/handoff.md`** (plan-review R1 F10) with: task→commit table, transition-audit sweep output (Step 1), Task 6 e2e run record, and an EMPTY §12 "Impeccable findings + dispositions" section that Task 8 fills — the invariant-8 evidence destination.
- [ ] **Step 5: Commit.** `git commit -am "docs: graduate four warning-panel-polish deferrals; transition-audit sweep; handoff scaffold"`

### Task 8: Verification gates (pre-push)

- [ ] `pnpm test` (full suite — scoped runs miss registry suites), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`
- [ ] Local e2e already green (Task 6); re-run if any later commit touched components
- [ ] Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the diff — UI surface touched (invariant 8); P0/P1 fixed or DEFERRED.md-logged; findings + dispositions recorded in handoff.md §12 (Task 7 Step 4 scaffold)
- [ ] VoiceOver spot-check: tracked as DEFERRED.md owner action (Task 7 Step 3) — NOT performed by the agent, NOT merge-blocking
- [ ] Whole-diff Codex review (split tight-scope briefs if needed) → APPROVE
- [ ] Push, PR, real CI green, `gh pr merge --merge`, ff-sync main

## Reconciliation sweeps (run at plan time)

- `rg -n "warningsPanelStatusSentence" --type ts --type tsx` → 3 files (lib, its test, ShowReviewSurface import/use) — all three are Task 4 deletions/edits; no other consumer. (Ran this session; output in spec §2.4.)
- `rg -n "Nothing else to note here" components lib` → step3ReviewSections.tsx:2604,2635 + ShowReviewSurface.tsx:332 (comment only — wording untouched by Task 1; disposition: comment references the ADJACENCY, not the clause order; update the comment text in Task 1 if the string it quotes appears verbatim).
- `rg -n "moreCount" components tests` (ran 2026-07-22): 10 hits — `pointerSentence.test.tsx:35,39,42` (Task 2 rewrites), `step3ReviewSections.tsx:711,715,717` (Task 2 implementation), `:2599,2601,2633,2646` (render call site, Task 2 shim then Task 3 rewrite). No other consumer.
