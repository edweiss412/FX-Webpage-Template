# Crew Warning Under-Row Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three deferred crew-warning findings — 24px indent binding (INDENT-1), condensed under-row copy (COPY-CONDENSE-1), and the capped-stack visual fixture (CAP-FIXTURE-1) — per spec `docs/superpowers/specs/2026-07-23-crewwarn-underrow-polish-design.md` (Codex-APPROVEd R5).

**Architecture:** A `condensed` boolean prop on `PerShowActionableWarnings` moves catalog guidance into the `?` popover body (composition derived from full mode's slots via a new exported pure helper `condensedPopoverSlots`); `renderCrewUnderRowCards` wraps each node in a `pl-6` div and passes `condensed`; the e2e harness gains a `withCappedCrewWarnings` fixture + `crewWarningsCapped` page (mixed banner + 3 warnings); the layout spec gains hop-by-hop width assertions for both stack subtrees.

**Tech Stack:** React 19 / Next 16, Tailwind v4, Vitest jsdom units, Playwright static-harness layout spec (standalone config — no web server).

## Global Constraints

- TDD per task; commit per task, conventional-commits (`feat(admin):`, `test(admin):`, `docs:`) — AGENTS.md invariants 1, 6.
- No raw error codes in UI (invariant 5) — this diff renders catalog copy only, never codes.
- Spec §1.1 is ratified: 24px (`pl-6`), per-kind widths (banners full), instance guidance stays inline, NO edits to `lib/messages/catalog.ts` / §12.4 / `tests/messages/warningCardCopyRegistry.ts`.
- Strict TS: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — index with `!` only after a length assertion; never pass `undefined` to optional props explicitly.
- Worktree: `/Users/ericweiss/FX-worktrees/crewwarn-underrow-polish` (branch `feat/crewwarn-underrow-polish`). All commands run there.
- UI diff ⇒ impeccable dual-gate (critique + audit) before whole-diff review (invariant 8); findings + dispositions land in the close-out doc (Task 4/5), the single-PR equivalent of a milestone handoff §12.
- Playwright commands for the layout spec ALWAYS use the standalone config (`tests/e2e/standalone.config.ts`, project `standalone-chromium`) — the default config owns app web servers this spec must not boot (plan-R1 F8).

**Meta-test inventory (mandatory declaration):** None created or extended. Reason: no new Supabase call boundaries (invariant 9 registries untouched), no new mutation surfaces (invariant 10), no new §12.4/admin-alert codes, no advisory locks. The sentinel-hiding and catalog meta-tests are unaffected because no catalog strings or tile sentinels change.

**e2e harness readiness (mandatory declaration):** The layout spec boots NO server — it renders static pages via `renderToStaticMarkup` (harness CLI) + Tailwind CLI css, served from a temp dir (`tests/e2e/published-review-modal.layout.spec.ts:95-160`). Readiness gate = `await expect(page.locator(MODAL)).toBeVisible()` inside `openHarness` (`tests/e2e/published-review-modal.layout.spec.ts:175-183`) with reduced-motion emulation; no hydration exists, so no hydration gate applies. Detach-safety: all measurements use `locator.boundingBox()` / one-shot `evaluate` on elements that persist (native `<details>` toggle never unmounts the measured nodes).

**Workflow wiring:** new tests live INSIDE the existing `tests/e2e/published-review-modal.layout.spec.ts` (already in the workflow paths and run list, `.github/workflows/published-modal-e2e.yml:51` and `.github/workflows/published-modal-e2e.yml:144`, and in the standalone allow-list, `tests/e2e/standalone.config.ts:36`) and existing vitest globs (`tests/components/admin/**` matches BASE_INCLUDE). Task 3 adds the two missing component paths to the workflow filter.

---

### Task 1: `condensed` prop + `condensedPopoverSlots` on PerShowActionableWarnings

**Files:**
- Modify: `components/admin/PerShowActionableWarnings.tsx`
- Test (create): tests/components/admin/perShowActionableCondensed.test.tsx

**Interfaces:**
- Produces: `condensedPopoverSlots(args: { movedGuidance: string | null; context: string | null; followUp: string | null }): { popoverBody: string | null; afterBodyText: string | null }` (exported, pure); `PerShowActionableWarnings` prop `condensed?: boolean` (rendering switches on `condensed === true`).
- Consumes: existing `resolveGuidance`, `warningCardCopyFields` (same file).

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/components/admin/perShowActionableCondensed.test.tsx
// @vitest-environment jsdom
/** Spec 2026-07-23-crewwarn-underrow-polish §3: condensed moves CATALOG guidance
 *  into the popover BODY (described run - superset of full mode), instance lines
 *  stay inline, and the 8-row slot table is total. Failure modes caught: guidance
 *  demoted to afterBodyText (outside aria-describedby), catalog line still inline
 *  or leaking into any OTHER card element when condensed (anti-tautology: the card
 *  subtree is checked whole, spec §6), condensed={false} diverging from omission. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PerShowActionableWarnings,
  condensedPopoverSlots,
} from "@/components/admin/PerShowActionableWarnings";
import { messageFor } from "@/lib/messages/lookup";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

// FIELD_UNREADABLE carries BOTH helpfulContext and triggerContext in the catalog
// (registry rows in tests/messages/warningCardCopyRegistry.ts), so it exercises
// table row 2 (g + c, no f). Expected strings DERIVE from the catalog at runtime
// (anti-tautology: a copy edit moves the expectation with it).
const fieldWarn: ParseWarning = {
  severity: "warn",
  code: "FIELD_UNREADABLE",
  message: 'Crew phone for row 1 could not be read ("N/A")',
  rawSnippet: "N/A",
  blockRef: { kind: "crew", index: 0, name: "Alice Anders" },
};

// ROLE_TOKEN_AUTOCORRECTED with an autocorrect payload → INSTANCE guidance
// (resolveGuidance short-circuits; spec Resolved Decision 3).
const instanceWarn: ParseWarning = {
  severity: "warn",
  code: "ROLE_TOKEN_AUTOCORRECTED",
  message: "Role token autocorrected",
  rawSnippet: "A2 Audoi",
  // Producer shape per lib/parser/types.ts:93-96 (subject + corrections pairs).
  autocorrect: { subject: "Alice Anders", corrections: [{ detected: "Audoi", corrected: "Audio" }] },
};

const entry = messageFor("FIELD_UNREADABLE");
const guidance = (entry.helpfulContext ?? "").trim().replace(/[*_`]/g, "");
const trigger = (entry.triggerContext ?? "").trim().replace(/[*_`]/g, "");

function popoverFor(i: number) {
  const item = screen.getAllByTestId("per-show-actionable-item")[i]!;
  const btn = item.querySelector("[data-testid$='-trigger']")!;
  const describedEl = document.getElementById(btn.getAttribute("aria-describedby") ?? "");
  return { item, btn, describedEl };
}

describe("condensedPopoverSlots (8-row table, spec §3)", () => {
  const g = "G sentence.";
  const c = "C sentence.";
  const f = "F sentence.";
  it.each([
    [g, c, f, `${g} ${c}`, f],
    [g, c, null, `${g} ${c}`, null],
    [g, null, f, `${g} ${f}`, null],
    [g, null, null, g, null],
    [null, c, f, c, f],
    [null, c, null, c, null],
    [null, null, f, f, null],
    [null, null, null, null, null],
  ])("g=%s c=%s f=%s", (movedGuidance, context, followUp, body, after) => {
    expect(condensedPopoverSlots({ movedGuidance, context, followUp })).toEqual({
      popoverBody: body,
      afterBodyText: after,
    });
  });
});

describe("condensed rendering (spec §3)", () => {
  it("catalog guidance leaves the CARD subtree entirely and joins the DESCRIBED popover body", () => {
    render(<PerShowActionableWarnings items={[fieldWarn]} driveFileId={null} condensed />);
    expect(screen.queryByTestId("per-show-actionable-guidance")).toBeNull();
    const { item, describedEl } = popoverFor(0);
    // Anti-tautology (spec §6): the popover body is PORTALED out of the card
    // (hoverhelp-smart-position #549), so the card subtree must not contain the
    // guidance in ANY element, tagged or not.
    expect(item.textContent ?? "").not.toContain(guidance);
    const text = describedEl?.textContent ?? "";
    expect(text).toContain(trigger);
    expect(text).toContain(guidance);
  });

  it("full mode is untouched: guidance inline, popover body = triggerContext only", () => {
    render(<PerShowActionableWarnings items={[fieldWarn]} driveFileId={null} />);
    expect(screen.getByTestId("per-show-actionable-guidance").textContent).toContain(guidance);
    const { describedEl } = popoverFor(0);
    expect(describedEl?.textContent ?? "").not.toContain(guidance);
  });

  it("instance guidance stays inline under condensed (Resolved Decision 3)", () => {
    render(<PerShowActionableWarnings items={[instanceWarn]} driveFileId={null} condensed />);
    const inline = screen.getByTestId("per-show-actionable-guidance");
    expect(inline.textContent).toContain("Audio");
  });

  it("condensed={false} renders byte-identically to omission (spec guard, R1-F6)", () => {
    const { container: a } = render(
      <PerShowActionableWarnings items={[fieldWarn]} driveFileId={null} condensed={false} />,
    );
    const htmlA = a.innerHTML;
    cleanup();
    const { container: b } = render(
      <PerShowActionableWarnings items={[fieldWarn]} driveFileId={null} />,
    );
    expect(htmlA).toBe(b.innerHTML);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run tests/components/admin/perShowActionableCondensed.test.tsx`
Expected: FAIL — `condensedPopoverSlots` is not exported; condensed cards still render inline guidance.

- [ ] **Step 3: Implement**

In `components/admin/PerShowActionableWarnings.tsx`:

Add after `resolveGuidance` (below line 65):

```ts
/** Condensed popover slots (spec 2026-07-23-crewwarn-underrow-polish §3): DERIVED
 *  from full mode's two slots so the described set is {movedGuidance} ∪ full mode's
 *  described set in every row - fullBody keeps its described position, followUp
 *  keeps its full-mode slot. Pure + exported so the 8-row table is unit-testable. */
export function condensedPopoverSlots(args: {
  movedGuidance: string | null;
  context: string | null;
  followUp: string | null;
}): { popoverBody: string | null; afterBodyText: string | null } {
  const { movedGuidance, context, followUp } = args;
  const fullBody = context ?? followUp;
  const fullAfter = context !== null ? followUp : null;
  const popoverBody =
    movedGuidance !== null && fullBody !== null
      ? `${movedGuidance} ${fullBody}`
      : (movedGuidance ?? fullBody);
  return { popoverBody, afterBodyText: fullAfter };
}
```

Add the prop (after `followUpCopy?: string;` in the props type, with doc comment):

```ts
  /** Under-row placement (spec 2026-07-23-crewwarn-underrow-polish §3): the catalog
   *  guidance line moves into the `?` popover BODY; instance (autocorrect) guidance
   *  stays inline. Switches on `condensed === true`; false ≡ omitted. Group,
   *  fallback, ignored, and staged surfaces omit this - full copy unchanged. */
  condensed?: boolean;
```

Destructure it alongside `tone = "warning"`, `followUpCopy`.

Replace the current slot computation (the two lines `const popoverBody = context ?? followUp;` and `const afterBodyText: string | null = context !== null ? followUp : null;`):

```ts
        const isCondensed = condensed === true;
        const movedGuidance =
          isCondensed && guidanceResult.kind === "catalog" ? guidanceResult.markup : null;
        const { popoverBody, afterBodyText } = condensedPopoverSlots({
          movedGuidance,
          context,
          followUp,
        });
```

(Full mode: `movedGuidance` is null, so `condensedPopoverSlots` degenerates to exactly the two expressions it replaces — byte-identical output. The `followUp` sourceCell gate above this block is untouched.)

Suppress the inline catalog branch under condensed — change the ternary's second arm condition from `guidanceResult.markup ?` to `!isCondensed && guidanceResult.markup ?`.

- [ ] **Step 4: Run tests + existing guards**

Run: `pnpm exec vitest run tests/components/admin/perShowActionableCondensed.test.tsx tests/components/admin/perShowActionableFollowUp.test.tsx tests/components/admin/warningCardFollowUp.test.tsx tests/admin/stagedCrewWarn.parity.test.tsx`
Expected: all PASS (full-mode surfaces byte-unchanged).

- [ ] **Step 5: Commit**

```bash
git add components/admin/PerShowActionableWarnings.tsx tests/components/admin/perShowActionableCondensed.test.tsx
git commit -m "feat(admin): condensed under-row warning-card variant (catalog guidance into popover body)"
```

---

### Task 2: 24px indent wrapper + condensed call site, with membership/compound coverage as the red phase

Both test files below are written and run RED **before** the call-site implementation lands (plan-R1 F1: the membership suite depends on the `pl-6` wrapper and the condensed under-row variant, so it fails legitimately until Step 4).

**Files:**
- Modify: `components/admin/showpage/sectionWarningExtras.tsx:45-65` (`renderCrewUnderRowCards`)
- Test (create): tests/components/admin/showpage/crewUnderRowIndent.test.tsx
- Test (create): tests/components/admin/showpage/crewUnderRowMembership.test.tsx

**Interfaces:**
- Consumes: Task 1's `condensed` prop; the `AttachHarness` composition pattern from `tests/components/admin/showpage/crewWarningAttachment.test.tsx:106-146` (copied, not imported).
- Produces: each map value node's OUTERMOST element is `<div class="pl-6">`; node count unchanged (one per warning).

**Transition-audit declaration (mandatory):** no `AnimatePresence`, no new ternary render with animated arms, no motion props anywhere in this diff; every §5 pair is instant (no animation needed) by design. The membership suite pins the DATA consequences of the instant transitions. The "sibling Report modal open while toggling the disclosure" compound is declared unaffected by spec §5 (native disclosure, no animation tree) and carries no assertion — recorded as a deliberate non-test in the close-out doc.

- [ ] **Step 1: Write the failing indent test**

```tsx
// tests/components/admin/showpage/crewUnderRowIndent.test.tsx
// @vitest-environment jsdom
/** Spec 2026-07-23-crewwarn-underrow-polish §2: every under-row node is wrapped in
 *  a pl-6 indent div at PER-NODE granularity (cap + "N more" count operate per
 *  warning), and the cards render CONDENSED (no inline catalog guidance). Failure
 *  modes: one wrapper around all nodes (cap collapses to 1), indent applied to the
 *  stack (banners would indent too), full-copy under-row cards. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderCrewUnderRowCards } from "@/components/admin/showpage/sectionWarningExtras";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

const warn = (index: number, snippet: string): ParseWarning => ({
  severity: "warn",
  code: "FIELD_UNREADABLE",
  message: `Crew phone could not be read (${snippet})`,
  rawSnippet: snippet,
  blockRef: { kind: "crew", index, name: "Alice Anders" },
});

function nodesFor(warnings: ParseWarning[]) {
  const bySection = buildSectionWarningModel({
    slug: "s",
    warnings,
    ignoredFingerprints: new Set(),
    renderedSectionIds: new Set<SectionId>(["crew"]),
  });
  return renderCrewUnderRowCards({
    model: bySection.crew,
    published: { slug: "s", showId: "x", driveFileId: null, useRawDecisions: [] },
    renderedKeys: new Set(["alice anders"]),
  });
}

describe("under-row node shape (spec §2)", () => {
  it("one pl-6 wrapper per warning; cards condensed", () => {
    const map = nodesFor([warn(0, "N/A"), warn(1, "nope"), warn(2, "??")]);
    const nodes = map.get("alice anders")!;
    expect(nodes).toHaveLength(3);
    render(<div data-testid="host">{nodes}</div>);
    const host = screen.getByTestId("host");
    const wrappers = Array.from(host.children);
    expect(wrappers).toHaveLength(3);
    for (const w of wrappers) {
      expect(w.tagName).toBe("DIV");
      expect(w.className).toBe("pl-6");
    }
    // Condensed: FIELD_UNREADABLE's catalog guidance does not render inline.
    expect(screen.queryAllByTestId("per-show-actionable-guidance")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Write the failing membership/compound suite**

Card identity in these tests is the help-trigger testid, `per-show-actionable-help-<stableWarningKeys key>` (`components/admin/PerShowActionableWarnings.tsx:250`) — the only per-warning distinguisher in the DOM: FIELD_UNREADABLE cards all render the same catalog title, `message` is displaced by the title, and `rawSnippet` renders only for UNKNOWN_FIELD (plan-R1 F2).

```tsx
// tests/components/admin/showpage/crewUnderRowMembership.test.tsx
// @vitest-environment jsdom
/** Spec 2026-07-23-crewwarn-underrow-polish §5 membership rule + §6 item 4.
 *  visible = nodes.slice(0,2); hidden = nodes.slice(2) (step3ReviewSections.tsx:1481-1483).
 *  Card identity = help-trigger testid (stableWarningKeys) - the cards' visible text
 *  is IDENTICAL across FIELD_UNREADABLE fixtures, so text-based assertions would be
 *  vacuous (plan-R1 F2). Failure modes: hidden-removal disturbing the visible pair;
 *  visible-removal not promoting hidden[0]; details open-state lost while hidden
 *  remains; a 0→>0 disclosure mounting OPEN; restoration not returning a condensed
 *  indented card; fallback group card losing full copy. */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/membership-fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import {
  buildSectionWarningExtras,
  renderCrewUnderRowCards,
} from "@/components/admin/showpage/sectionWarningExtras";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { deriveRoutedWarnings } from "@/lib/admin/routedWarnings";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { stableWarningKeys } from "@/lib/dataQuality/warningIdentity";

afterEach(cleanup);

const SHOW_ID = "44444444-4444-4444-8444-444444444444";
const SLUG = "membership-fixture";
const DFID = "DRIVE_MEMBERSHIP";

const warn = (index: number, snippet: string): ParseWarning => ({
  severity: "warn",
  code: "FIELD_UNREADABLE",
  message: `Crew phone could not be read (${snippet})`,
  rawSnippet: snippet,
  blockRef: { kind: "crew", index, name: "Alice Anders" },
});
const W1 = warn(0, "AAA");
const W2 = warn(1, "BBB");
const W3 = warn(2, "CCC");
const W4 = warn(3, "DDD");

const idFor = (w: ParseWarning) => `per-show-actionable-help-${stableWarningKeys([w])[0]!}`;

function snapshot(warnings: ParseWarning[]): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Membership Fixture Show",
      client_label: "Acme",
      client_contact: null,
      dates: { travelIn: "2026-05-01", set: null, showDays: ["2026-05-02"], travelOut: "2026-05-03" },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: DFID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: warnings,
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: [{ id: "bbbbbbbb-0000-4000-8000-000000000001", name: "Alice Anders", role: "PM" }],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

function Harness({
  warnings,
  ignoredFingerprints = new Set<string>(),
  matched = true,
}: {
  warnings: ParseWarning[];
  ignoredFingerprints?: ReadonlySet<string>;
  matched?: boolean;
}) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const data = buildPublishedSectionData(snapshot(warnings), { slug: SLUG }) as PublishedSectionData;
  const bySection = buildSectionWarningModel({
    slug: SLUG,
    warnings: data.warnings,
    ignoredFingerprints,
    renderedSectionIds: new Set<SectionId>(step3Sections(data).map((s) => s.id)),
  });
  const renderedCrewKeys = new Set(matched ? ["alice anders"] : []);
  return (
    <ShowReviewSurface
      data={data}
      scrollerRef={scrollerRef}
      layout="page"
      renderSectionExtras={buildSectionWarningExtras({ bySection, renderedCrewKeys })}
      routedWarnings={deriveRoutedWarnings(bySection)}
      crewUnderRowCards={renderCrewUnderRowCards({
        model: bySection.crew,
        published: { slug: SLUG, showId: SHOW_ID, driveFileId: DFID, useRawDecisions: data.useRawDecisions },
        renderedKeys: renderedCrewKeys,
      })}
    />
  );
}

const stack = () => screen.getByTestId("crew-warn-stack-alice anders");
const detailsEl = () =>
  screen.queryByTestId("crew-warn-more-alice anders") as HTMLDetailsElement | null;
/** Visible = pl-6 wrappers that are DIRECT stack children (hidden ones live under
 *  the details element). Identity via the help-trigger testid prefix. */
const visibleIds = () =>
  Array.from(stack().children)
    .filter((el): el is HTMLElement => el.tagName === "DIV" && el.className === "pl-6")
    .map(
      (el) =>
        el
          .querySelector('[data-testid^="per-show-actionable-help-"]')
          ?.getAttribute("data-testid") ?? "",
    );
const hasId = (ids: string[], w: ParseWarning) => ids.some((t) => t.startsWith(idFor(w)));

describe("§5 membership rule across rerenders", () => {
  it("hidden removal: visible pair UNCHANGED; open survives while hidden remains; details unmounts when hidden empties", () => {
    const { rerender } = render(<Harness warnings={[W1, W2, W3, W4]} />);
    const d = detailsEl()!;
    expect(d.textContent).toContain("2 more");
    d.open = true;
    // Remove a HIDDEN node (W4): visible pair identical, open persists, count drops.
    const before = visibleIds();
    expect(before).toHaveLength(2);
    rerender(<Harness warnings={[W1, W2, W3]} />);
    expect(visibleIds()).toEqual(before);
    const dAfter = detailsEl()!;
    expect(dAfter.open).toBe(true);
    expect(dAfter.textContent).toContain("1 more");
    // Remove the LAST hidden node: details unmounts entirely.
    rerender(<Harness warnings={[W1, W2]} />);
    expect(detailsEl()).toBeNull();
  });

  it("visible removal: hidden[0] promotes into the visible slice", () => {
    const { rerender } = render(<Harness warnings={[W1, W2, W3]} />);
    expect(hasId(visibleIds(), W3)).toBe(false);
    rerender(<Harness warnings={[W2, W3]} />);
    const after = visibleIds();
    expect(after).toHaveLength(2);
    expect(hasId(after, W2)).toBe(true);
    expect(hasId(after, W3)).toBe(true);
    expect(detailsEl()).toBeNull();
  });

  it("re-entry crossing 0 → >0 mounts the disclosure CLOSED", () => {
    const { rerender } = render(<Harness warnings={[W1, W2]} />);
    expect(detailsEl()).toBeNull();
    rerender(<Harness warnings={[W1, W2, W3]} />);
    const d = detailsEl()!;
    expect(d.open).toBe(false);
    expect(d.textContent).toContain("1 more");
  });
});

describe("§5 active↔ignored variant flip (both directions)", () => {
  const fp = () => {
    const v = warningFingerprint(W3);
    expect(v).not.toBeNull();
    return v!;
  };

  it("ignored card renders FULL copy, muted, unindented in the group; under-row card unmounts", () => {
    render(<Harness warnings={[W1, W2, W3]} ignoredFingerprints={new Set([fp()])} />);
    expect(detailsEl()).toBeNull();
    expect(hasId(visibleIds(), W3)).toBe(false);
    const ignored = screen.getByTestId("section-ignored-list-crew");
    const guidance = within(ignored).getAllByTestId("per-show-actionable-guidance");
    expect(guidance.length).toBeGreaterThan(0);
    // Muted skin (tone="muted"): guidance uses text-text-subtle, not warning-text.
    expect(guidance[0]!.className).toContain("text-text-subtle");
    expect(ignored.querySelector(".pl-6")).toBeNull();
  });

  it("restoration returns a condensed, indented card under the row", () => {
    const { rerender } = render(
      <Harness warnings={[W1, W2, W3]} ignoredFingerprints={new Set([fp()])} />,
    );
    rerender(<Harness warnings={[W1, W2, W3]} />);
    // Back to 3 actives: capped stack, W3 hidden behind "1 more", all condensed.
    expect(detailsEl()!.textContent).toContain("1 more");
    expect(within(stack()).queryAllByTestId("per-show-actionable-guidance")).toHaveLength(0);
    detailsEl()!.open = true;
    const hiddenWrapper = detailsEl()!.querySelector("div.pl-6");
    expect(hiddenWrapper).not.toBeNull();
  });
});

describe("§5 matched↔fallback variant flip", () => {
  it("fallback group card is FULL (inline guidance); matched under-row card is condensed", () => {
    const { rerender } = render(<Harness warnings={[W1]} matched={false} />);
    const group = screen.getByTestId("section-warning-controls-crew");
    expect(within(group).getAllByTestId("per-show-actionable-guidance").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("crew-warn-stack-alice anders")).toBeNull();
    rerender(<Harness warnings={[W1]} matched />);
    expect(screen.queryByTestId("section-warning-controls-crew")).toBeNull();
    expect(within(stack()).queryAllByTestId("per-show-actionable-guidance")).toHaveLength(0);
    expect(visibleIds()).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run BOTH suites to verify failure**

Run: `pnpm exec vitest run tests/components/admin/showpage/crewUnderRowIndent.test.tsx tests/components/admin/showpage/crewUnderRowMembership.test.tsx`
Expected: FAIL — no `pl-6` wrappers exist yet (indent suite's className assertion; membership suite's `visibleIds()`/wrapper queries return empty), and under-row cards still render inline guidance.

- [ ] **Step 4: Implement**

In `renderCrewUnderRowCards` (`sectionWarningExtras.tsx`), replace the `items.map(...)` element with the wrapped, condensed form (key moves to the wrapper):

```tsx
      items.map((it, i) => (
        // Spec 2026-07-23-crewwarn-underrow-polish §2: 24px indent binds the card
        // to ITS member's name column; per-node wrapper keeps cap granularity.
        // Banners are NOT wrapped (per-kind rule, spec §1.1 #2).
        <div key={`crew-warn-${key}-${i}`} className="pl-6">
          <PerShowActionableWarnings
            items={[it.warning]}
            driveFileId={driveFileId}
            condensed
            renderItemControls={(w) => (
              <SectionWarningItemControls
                warning={w}
                reportSurfaceId={it.reportSurfaceId}
                mode="active"
                slug={slug}
                showId={showId}
                driveFileId={driveFileId}
                useRawDecisions={useRawDecisions}
              />
            )}
          />
        </div>
      )),
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run tests/components/admin/showpage/ tests/admin/stagedCrewWarn.parity.test.tsx`
Expected: PASS (incl. existing `crewWarningAttachment` conservation suite — testids unchanged).

- [ ] **Step 6: Commit**

```bash
git add components/admin/showpage/sectionWarningExtras.tsx tests/components/admin/showpage/crewUnderRowIndent.test.tsx tests/components/admin/showpage/crewUnderRowMembership.test.tsx
git commit -m "feat(admin): indent under-row warning cards 24px, condensed, with membership coverage"
```

---

### Task 3: Capped harness fixture + hop-by-hop layout assertions + workflow paths

**Files:**
- Modify: `tests/e2e/_publishedReviewModalHarness.tsx` (overrides type `tests/e2e/_publishedReviewModalHarness.tsx:242-253`, fixtures `tests/e2e/_publishedReviewModalHarness.tsx:255-276`, `modalElement` `tests/e2e/_publishedReviewModalHarness.tsx:278-299`, CLI entry `tests/e2e/_publishedReviewModalHarness.tsx:354-382`)
- Modify: `tests/e2e/published-review-modal.layout.spec.ts` (beforeAll pages block `tests/e2e/published-review-modal.layout.spec.ts:118-140`, `@source` list `tests/e2e/published-review-modal.layout.spec.ts:141-150`; new test block after the T5 block)
- Modify: `.github/workflows/published-modal-e2e.yml:37-60` (add two paths)

**Interfaces:**
- Consumes: `HarnessStateOverrides.attentionItems` (replace-wholesale, `tests/e2e/_publishedReviewModalHarness.tsx:315`), `harnessAttentionItems` (`tests/e2e/_publishedReviewModalHarness.tsx:56`).
- Produces: harness JSON key `crewWarningsCapped`; page file crewwarningscapped.html; exported `crewCappedAttentionItem()`.

- [ ] **Step 1: Write the failing layout tests** (append after the existing T5 `test.describe` block)

The banner node is inserted DIRECTLY as a stack child and its root div carries `data-attention-anchor` + `data-testid="attention-banner-<id>"` on ONE element (`components/admin/review/AttentionBanner.tsx:222-227`) — selector is `${STACK} > [data-testid^="attention-banner-"]`, no intermediate div (plan-R1 F3). Every §2 hop in BOTH subtrees is asserted (plan-R1 F4).

```ts
// crewwarn-underrow-polish §2/§4: hop-by-hop width invariants + the capped mixed
// stack (banner consumes a cap slot; per-kind widths in ONE stack). TOL = 0.5px.
test.describe("crew warning indent + cap (crewwarn-underrow-polish)", () => {
  const STACK = '[data-testid="crew-warn-stack-crew member a"]';
  const MORE = '[data-testid="crew-warn-more-crew member a"]';
  const CARD = '[data-testid="compact-alert-card"]';

  async function widthOf(page: Page, selector: string, nth = 0): Promise<number> {
    const box = await page.locator(selector).nth(nth).boundingBox();
    expect(box, `no box for ${selector} [${nth}]`).not.toBeNull();
    return box!.width;
  }

  /** Asserts the FULL visible-card chain wrapper→ul→li→card for the pl-6 wrapper
   *  rooted at `wrapperSel` (nth), against the given parent width. */
  async function expectCardChain(
    page: Page,
    wrapperSel: string,
    nth: number,
    parentWidth: number,
  ): Promise<void> {
    const w = await widthOf(page, wrapperSel, nth);
    expect(Math.abs(w - parentWidth), `wrapper vs parent`).toBeLessThanOrEqual(TOL);
    const ulW = await widthOf(page, `${wrapperSel} > ul`, nth);
    expect(Math.abs(ulW - (w - 24)), `ul vs wrapper - 24`).toBeLessThanOrEqual(TOL);
    const liW = await widthOf(page, `${wrapperSel} > ul > li`, nth);
    expect(Math.abs(liW - ulW), `li vs ul`).toBeLessThanOrEqual(TOL);
    const cardW = await widthOf(page, `${wrapperSel} > ul > li > ${CARD}`, nth);
    expect(Math.abs(cardW - liW), `card vs li`).toBeLessThanOrEqual(TOL);
  }

  test("T-WARN-INDENT @1280: single-warning page, full visible chain", async ({ page }) => {
    await openHarness(page, { width: 1280, height: 900 }, "crewwarnings.html");
    const stackW = await widthOf(page, STACK);
    await expect(page.locator(`${STACK} > div.pl-6`)).toHaveCount(1);
    await expectCardChain(page, `${STACK} > div.pl-6`, 0, stackW);
  });

  for (const vp of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`T-WARN-CAP @${vp.width}: banner + 1 warning visible, "2 more" hidden, per-kind widths, both subtrees hop-by-hop`, async ({
      page,
    }) => {
      await openHarness(page, vp, "crewwarningscapped.html");
      const stackW = await widthOf(page, STACK);

      // Cap slots: exactly 1 banner + 1 visible warning wrapper as DIRECT children.
      const bannerSel = `${STACK} > [data-testid^="attention-banner-"]`;
      await expect(page.locator(bannerSel)).toHaveCount(1);
      await expect(page.locator(`${STACK} > div.pl-6`)).toHaveCount(1);

      // Per-kind widths in ONE stack (spec §1.1 #2 + §2) + full visible chain.
      expect(Math.abs((await widthOf(page, bannerSel)) - stackW)).toBeLessThanOrEqual(TOL);
      await expectCardChain(page, `${STACK} > div.pl-6`, 0, stackW);

      // Disclosure subtree, closed state first: details spans the stack, summary
      // spans the details, hidden wrappers exist but are NOT visible.
      const detailsSel = `${STACK} > details`;
      expect(Math.abs((await widthOf(page, detailsSel)) - stackW)).toBeLessThanOrEqual(TOL);
      const summary = page.locator(`${MORE} > summary`);
      await expect(summary).toContainText("2 more");
      const sBox = await summary.boundingBox();
      expect(sBox).not.toBeNull();
      expect(sBox!.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(sBox!.width - (await widthOf(page, detailsSel)))).toBeLessThanOrEqual(TOL);
      await expect(page.locator(`${MORE} div.pl-6`)).toHaveCount(2);
      await expect(page.locator(`${MORE} div.pl-6`).first()).toBeHidden();

      // Open natively; disclosure body + BOTH hidden card chains (spec §2 table).
      await summary.click();
      const bodySel = `${MORE} > div`;
      expect(
        Math.abs((await widthOf(page, bodySel)) - (await widthOf(page, detailsSel))),
      ).toBeLessThanOrEqual(TOL);
      const bodyW = await widthOf(page, bodySel);
      for (const nth of [0, 1]) {
        await expect(page.locator(`${MORE} div.pl-6`).nth(nth)).toBeVisible();
        await expectCardChain(page, `${bodySel} > div.pl-6`, nth, bodyW);
      }
    });
  }
});
```

- [ ] **Step 2: Wire the new page into beforeAll** (same spec file)

Add `crewWarningsCapped: string;` to the `pages` type annotation, and after the crewwarnings.html write:

```ts
  // crewwarn-underrow-polish §4: capped mixed stack (banner + 3 warnings, one member).
  writeFileSync(join(workDir, "crewwarningscapped.html"), pageHtml("out.css", pages.crewWarningsCapped));
```

Add `"crewwarningscapped.html"` to the `@source` file list array.

- [ ] **Step 3: Run to verify failure**

Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts --project=standalone-chromium tests/e2e/published-review-modal.layout.spec.ts -g "crewwarn-underrow-polish"`
Expected: FAIL — `pages.crewWarningsCapped` is undefined, so beforeAll writes a page whose body is the string "undefined" and each new test fails at `openHarness`'s modal-visible gate (the type assertion on the parsed JSON does not validate at runtime; plan-R1 F9).

- [ ] **Step 4: Implement the harness fixture**

In `tests/e2e/_publishedReviewModalHarness.tsx`:

Extend the overrides type (after `withCrewWarnings?: boolean;`):

```ts
  /** crewwarn-underrow-polish §4: seed THREE FIELD_UNREADABLE warnings that all
   *  strip to "Crew Member A" (distinct blockRef.index per the live dedup key,
   *  lib/parser/dataGaps.ts:409-435) plus the unmatched "Ghost Crew" fallback.
   *  false ≡ omitted; takes precedence over withCrewWarnings when both are set. */
  withCappedCrewWarnings?: boolean;
```

Add fixtures + the crew-keyed attention item (after `crewWarningFixtures`):

```tsx
function cappedCrewWarningFixtures(): ParseWarning[] {
  const mk = (index: number, field: string, snippet: string): ParseWarning => ({
    severity: "warn",
    code: "FIELD_UNREADABLE",
    message: `Crew ${field} for row ${index + 1} couldn't be read ("${snippet}") - check the sheet.`,
    rawSnippet: snippet,
    blockRef: { kind: "crew", index, name: "Crew Member A (5/3 ONLY)" },
  });
  return [
    mk(0, "phone", "N/A"),
    mk(1, "email", "nope"),
    mk(2, "cell", "???"),
    {
      severity: "warn",
      code: "FIELD_UNREADABLE",
      message: 'Crew email for row 9 couldn\'t be read as an address ("nope") - check the sheet.',
      rawSnippet: "nope",
      blockRef: { kind: "crew", index: 8, name: "Ghost Crew" },
    },
  ];
}

/** Crew-routed attention item for the capped page: no ATTENTION_ROUTES anchor for
 *  HARNESS_FAKE_CODE, so bucketAttention lands it in byCrewKey (sectionAttention.ts:122-126)
 *  and the modal's crewKeyRendered predicate admits the rendered roster key. */
export function crewCappedAttentionItem(): AttentionItem {
  return {
    id: "alert:harness-crewcap",
    kind: "alert" as const,
    tone: "notice" as const,
    sectionId: "crew" as const,
    crewKey: "crew member a",
    actionable: true,
    menuTitle: "Crew attention item",
    menuSubtitle: null,
    alert: {
      alertId: "harness-crewcap",
      code: "HARNESS_FAKE_CODE",
      template: null,
      params: {},
      action: null,
      helpHref: null,
      raisedAt: "2026-05-02T10:00:00.000Z",
      occurrenceCount: 1,
      autoClearNote: null,
      failedKeys: null,
      dataGaps: null,
      errorCode: null,
    },
  };
}
```

In `modalElement`, replace the `bySection` ternary condition and warnings source:

```ts
  const wantsCrewWarnings = state.withCappedCrewWarnings === true || state.withCrewWarnings === true;
  const bySection: SectionWarningRecord = wantsCrewWarnings
    ? buildSectionWarningModel({
        slug: MODAL_SLUG,
        warnings:
          state.withCappedCrewWarnings === true
            ? cappedCrewWarningFixtures()
            : crewWarningFixtures(),
        ignoredFingerprints: new Set(),
        renderedSectionIds: new Set(
          renderedSectionIds({ mode: "published", agendaBaseline: [] } as never) as SectionId[],
        ),
      })
    : {};
```

CLI entry — add after the `crewWarnings` page:

```ts
      // crewwarn-underrow-polish §4: capped mixed stack - banner rides the
      // replace-wholesale attentionItems override, defaults preserved.
      crewWarningsCapped: renderModalHtml(HARNESS_ALERT_COUNT, {
        withCappedCrewWarnings: true,
        attentionItems: [...harnessAttentionItems(HARNESS_ALERT_COUNT), crewCappedAttentionItem()],
      }),
```

- [ ] **Step 5: Run the layout block**

Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts --project=standalone-chromium tests/e2e/published-review-modal.layout.spec.ts -g "crewwarn-underrow-polish"`
Expected: PASS (3 tests). Then the FULL spec: `pnpm exec playwright test --config tests/e2e/standalone.config.ts --project=standalone-chromium tests/e2e/published-review-modal.layout.spec.ts` — Expected: PASS (T5 containment tolerates the indent).

- [ ] **Step 6: Add workflow paths** — in `.github/workflows/published-modal-e2e.yml`, after the `components/admin/HoverHelp.tsx` entry add:

```yaml
      - "components/admin/PerShowActionableWarnings.tsx"
      - "components/admin/compactAlertHelp.tsx"
```

(The layout spec now measures these components' output; a future solo change to either must re-fire this workflow.)

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/_publishedReviewModalHarness.tsx tests/e2e/published-review-modal.layout.spec.ts .github/workflows/published-modal-e2e.yml
git commit -m "test(admin): capped mixed-stack harness page + hop-by-hop indent layout assertions"
```

---

### Task 4: Impeccable dual-gate (invariant 8)

**Files:**
- Create: docs/superpowers/plans/2026-07-23-crewwarn-underrow-polish-closeout.md (the single-PR close-out doc; its §12 carries impeccable findings + dispositions, per AGENTS.md invariant 8 — plan-R1 F7)

- [ ] **Step 1:** Run `/impeccable critique` on the branch diff (canonical v3 setup: context.mjs context load with PRODUCT.md + DESIGN.md, then register reference read). Scope: the under-row card surfaces (crew section, condensed cards, capped disclosure) using the harness pages from Task 3 for visual states.
- [ ] **Step 2:** Run `/impeccable audit` on the same diff with the same setup gates.
- [ ] **Step 3:** Fix P0/P1 findings inline (commit per fix, `fix(admin): ...`), or defer each explicitly with a DEFERRED.md entry + un-defer trigger.
- [ ] **Step 4:** Create the close-out doc with: §1 shipped scope (three findings + mechanisms), §12 impeccable findings + dispositions table (every finding, severity, disposition), and a refuted-claims log seeded with: plan-R1 F5's sibling-Report-modal sub-point (spec §5 declares that compound unaffected — native disclosure, no animation tree — so no assertion exists by design).
- [ ] **Step 5:** Commit: `git add docs/superpowers/plans/2026-07-23-crewwarn-underrow-polish-closeout.md && git commit -m "docs: crewwarn under-row polish close-out (impeccable dispositions)"` (plus any fix commits from Step 3).

---

### Task 5: Docs close-out — DEFERRED.md graduation

**Files:**
- Modify: `DEFERRED.md` (remove the three entries, currently lines 11-33; update the Last reconciled line, currently line 7)
- Modify: `DEFERRED-archive.md` (append the three full entries with resolution notes)

- [ ] **Step 1:** Move `CREWWARN-UNDERROW-INDENT-1`, `CREWWARN-UNDERROW-COPY-CONDENSE-1`, `CREWWARN-CAP-FIXTURE-1` (full text) into `DEFERRED-archive.md` under a "Crew warning under-row polish (2026-07-23)" heading, each with: RESOLVED by `feat/crewwarn-underrow-polish`, spec ref, the shipped mechanism one-liner (24px per-kind indent; condensed variant; capped harness page), and a pointer to the close-out doc for impeccable dispositions. `CREWWARN-INCARD-MOBILE-EYEBROW-1` STAYS in DEFERRED.md.
- [ ] **Step 2:** Update DEFERRED.md's Last reconciled line to record the graduation with a pointer to the close-out doc.
- [ ] **Step 3:** Commit: `git add DEFERRED.md DEFERRED-archive.md && git commit -m "docs: graduate three CREWWARN under-row deferrals to the archive"`

---

### Task 6: Pre-push gates + ship

- [ ] **Step 1:** `pnpm typecheck` — Expected: clean (vitest strips types; this is the real gate).
- [ ] **Step 2:** `pnpm lint` — Expected: clean (canonical Tailwind classes).
- [ ] **Step 3:** `pnpm format:check` — Expected: clean.
- [ ] **Step 4:** `pnpm test` — Expected: full local suite green (registry/meta suites included; env-bound + e2e excluded by design).
- [ ] **Step 5:** Full layout e2e once more: `pnpm exec playwright test --config tests/e2e/standalone.config.ts --project=standalone-chromium tests/e2e/published-review-modal.layout.spec.ts` — Expected: PASS.
- [ ] **Step 6:** Whole-diff Codex cross-model review (codex-guard, fresh-eyes brief, REVIEWER ONLY, §1.1 do-not-relitigate block) to APPROVE; class-sweep before patching any finding.
- [ ] **Step 7:** Push, open PR (merge-commit convention), wait REAL CI green (`gh pr checks <PR#> --watch`), `gh pr merge --merge`, fast-forward local main, verify `git rev-list --left-right --count main...origin/main` == `0  0`. Stage 4.4: CronDelete the nudge job, set ship-state `stage: "done"`.
