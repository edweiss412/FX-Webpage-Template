// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3RowSlot.test.tsx
 *
 * STEP3-GALLERY-TAP-TARGETS-1 item (d) — the falsifiable acceptance shape from
 * `docs/superpowers/specs/2026-08-09-m-wave-2-design.md:92`, so "resolved under
 * the dual gate" is not a tautology:
 *
 *   (i)  ONE affordance vocabulary for every action in the row slot — the set of
 *        distinct action treatments has size 1 (no bare-text action renders
 *        beside a bordered action).
 *   (ii) Nested chrome flattens to AT MOST one bordered container level inside
 *        the row slot — no bordered card renders inside another bordered
 *        container.
 *
 * The fixture mirrors the SIX seeded gallery variants (`GALLERY_VARIANTS`,
 * tests/e2e/helpers/devCaptureStaged.ts:290) — the surface that exposed the
 * finding — so the assertions measure the same composition the live
 * `/admin?step=3` render puts on screen. jsdom computes no layout; both
 * assertions are class-string and tree-shape properties, which is exactly what
 * both halves of the finding are.
 *
 * WHICH treatment wins and which border yields are the in-branch design calls;
 * the two counts below are the contract.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ParseResult } from "@/lib/parser/types";
import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import { premise, premiseHolds } from "../../../_shared/premise";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

const WIZARD_SESSION_ID = "11111111-1111-1111-1111-111111111111";

// ── The six gallery variants (devCaptureStaged.ts:282-297), as Step3Row props.
// Each name below is the variant it reproduces; the drive_file_id carries it too
// so a failure message names the variant that contributed the offending node.
const READY: Step3Row = {
  driveFileId: "drive-ready",
  driveFileName: "Ready.gsheet",
  status: "staged",
  parseResult: { show: { title: "Ready Show" }, warnings: [] } as unknown as ParseResult,
};
const NEEDS_A_LOOK: Step3Row = {
  driveFileId: "drive-needs-a-look",
  driveFileName: "Needs A Look.gsheet",
  status: "staged",
  parseResult: {
    show: { title: "Needs A Look Show" },
    warnings: [{ code: "FIELD_UNREADABLE", severity: "warn" }],
  } as unknown as ParseResult,
};
const DEMOTED_RESCAN: Step3Row = {
  driveFileId: "drive-demoted-rescan",
  driveFileName: "Demoted Rescan.gsheet",
  status: "staged",
  lastFinalizeFailureCode: RESCAN_REVIEW_REQUIRED,
  parseResult: { show: { title: "Demoted Show" }, warnings: [] } as unknown as ParseResult,
};
// A demoted row on a NON-dirty code takes the other demoted branch (note +
// Re-scan button) — a second action-bearing composition of the same variant.
const DEMOTED_OTHER: Step3Row = {
  driveFileId: "drive-demoted-other",
  driveFileName: "Demoted Other.gsheet",
  status: "staged",
  lastFinalizeFailureCode: "FINALIZE_SHOW_WRITE_FAILED",
  parseResult: { show: { title: "Demoted Other Show" }, warnings: [] } as unknown as ParseResult,
};
// No parse preview and no linked show → the inline Re-scan / Ignore recovery.
const NO_DETAILS: Step3Row = {
  driveFileId: "drive-no-details",
  driveFileName: "No Details.gsheet",
  status: "staged",
  stagedId: "staged-no-details",
};
const BLOCKING: Step3Row = {
  driveFileId: "drive-blocking",
  driveFileName: "Blocking.gsheet",
  status: "hard_failed",
  pendingIngestionId: "pi-blocking",
  errorCode: "MI_PARSE_FAILED",
};
const SET_ASIDE: Step3Row = {
  driveFileId: "drive-set-aside",
  driveFileName: "Set Aside.gsheet",
  status: "permanent_ignore",
};

// The gallery seeds `hard_failed` for its blocking variant, but the plate holds
// three blocking statuses and the other two carry their own actions — the
// manifest-keyed Ignore, and the dashboard resolve exit that was the slot's last
// remaining bare-text action. Same slot, same shape; covered here rather than
// left for a later sweep to rediscover.
const LIVE_ROW_CONFLICT: Step3Row = {
  driveFileId: "drive-live-row-conflict",
  driveFileName: "Conflict.gsheet",
  status: "live_row_conflict",
};
const DISCARD_RETRYABLE: Step3Row = {
  driveFileId: "drive-discard-retryable",
  driveFileName: "Discarded.gsheet",
  status: "discard_retryable",
};

const GALLERY: readonly Step3Row[] = [
  READY,
  NEEDS_A_LOOK,
  DEMOTED_RESCAN,
  DEMOTED_OTHER,
  NO_DETAILS,
  BLOCKING,
  LIVE_ROW_CONFLICT,
  DISCARD_RETRYABLE,
  SET_ASIDE,
];

// The row slot = the regions the Step-3 rows render into. Each root is included
// in its own walk, so the "Needs your attention" plate counts as a container
// around the rows it holds.
const SLOT_ROOT_SELECTOR = [
  '[data-testid="wizard-step3-needs-attention"]',
  '[data-testid="wizard-step3-card-grid"]',
  '[data-testid="wizard-step3-ignored"]',
  '[data-testid="wizard-step3-deferred"]',
  '[data-testid="wizard-step3-skipped"]',
].join(", ");

/**
 * Not every anchor in the slot is an ACTION. Two carve-outs, each with its
 * reason, and each narrow enough that a new action cannot hide behind it:
 *   - the row title is a deep link to the source sheet — navigation to the
 *     document the row is ABOUT, not an operation on the row;
 *   - everything inside the help disclosure is supporting explanation (the
 *     <summary> plus its "Learn more" link), addressed by item (a), which
 *     shipped 2026-08-08 with its own treatment.
 */
function isRowSlotAction(el: Element): boolean {
  // Narrowed after brief B r1 F2, which showed both carve-outs were shaped so a
  // new action could sit behind them: ANY descendant of the help affordance was
  // excluded whatever its purpose, and ANY element whose testid merely ended in
  // `-title-link` was excluded without checking that it was in fact the title
  // link. Both are now pinned to the exact node they were written for.
  if (el.closest('[data-testid="help-affordance"]') !== null) {
    // Inside the help disclosure, only the <summary> and its explanatory links
    // are supporting text. Anything else in there — a <button>, a role=button —
    // is an action and IS collected, which is the half the first carve-out gave
    // away by excluding every descendant.
    return el.tagName !== "A" && el.tagName !== "SUMMARY";
  }
  if (
    el.tagName === "A" &&
    /^wizard-step3-card-.+-title-link$/.test(el.getAttribute("data-testid") ?? "")
  ) {
    return false;
  }
  return true;
}

// Every shape an action takes, not just <button> and <a href> (brief B r1 F2).
const ACTION_SELECTOR = [
  "button",
  "a[href]",
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  '[role="button"]',
  '[role="link"]',
  "summary",
].join(", ");

/**
 * Tokens the signature ignores — each DECLARED with its reason, and each
 * asserted to be in use, so the normalization is visible rather than silent.
 *
 * Brief B r1 F3 is right that these can change rendered geometry: `self-start`
 * stops a control stretching in a column, `shrink-0` and `min-w-0` change how it
 * gives way under constraint. They stay ignored anyway, because the contract is
 * about VOCABULARY — what the control looks like — and these three say only how
 * the parent places it. Two buttons in different containers legitimately need
 * different answers there while wearing the same treatment.
 *
 * What changed in response to the finding is that the strip is no longer a bare
 * Set: every entry carries a reason, and the test below fails on an entry that
 * no longer matches anything, so this cannot quietly grow into a way to make two
 * different-looking controls compare equal. `w-full` and `flex-1` are excluded
 * for exactly that reason — both change the control's own width. `min-w-0` was
 * declared here too until this test's first run reported that no row-slot action
 * uses it.
 */
const PLACEMENT_ONLY: readonly { readonly token: string; readonly reason: string }[] = [
  {
    token: "shrink-0",
    reason: "prevents the control giving way in a flex row; its own box is unchanged",
  },
  {
    token: "self-start",
    reason: "stops a column stretching the control; its own box is unchanged",
  },
];
const PLACEMENT_TOKENS = new Set(PLACEMENT_ONLY.map((p) => p.token));

function treatmentSignature(el: Element): string {
  return el
    .getAttribute("class")!
    .split(/\s+/)
    .filter((t) => t.length > 0 && !PLACEMENT_TOKENS.has(t))
    .sort()
    .join(" ");
}

function collectActions(container: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const root of container.querySelectorAll(SLOT_ROOT_SELECTOR)) {
    for (const el of root.querySelectorAll<HTMLElement>(ACTION_SELECTOR)) {
      if (isRowSlotAction(el)) out.push(el);
    }
  }
  return out;
}

// A bordered CONTAINER, not a bordered control: a button carrying an outline is
// the vocabulary item (i) is about, and nesting one inside a card is correct.
//
// Recognition is by EXCLUSION rather than by an allowlist (brief B r1 F4): the
// first version listed eight tags, so a bordered `<fieldset>` grouping the
// hard-fail actions would have walked straight past it. What makes something not
// a container is that it is a control or an inline run, and that list is short
// and closed; the set of block elements someone might reach for is neither.
const NON_CONTAINER_TAGS = new Set([
  "BUTTON",
  "A",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "LABEL",
  "SPAN",
  "SVG",
  "PATH",
  "IMG",
  "SUMMARY",
]);

// Any real border: bare, sided, sized, arbitrary (`border-[3px]`), or applied
// under a variant (`sm:border`). The rounded requirement is GONE — a square
// bordered box is still a bordered box, and requiring a radius was an invention
// of the first version, not of the contract (brief B r1 F4).
const BORDER_TOKEN =
  /^(?:[a-z][a-z0-9-]*:)*border(?:-(?:t|r|b|l|x|y|s|e))?(?:-(?:[0-9]+|\[[^\]]+\]))?$/;

function isBorderedContainer(el: Element): boolean {
  if (NON_CONTAINER_TAGS.has(el.tagName)) return false;
  const tokens = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  return tokens.some((t) => BORDER_TOKEN.test(t));
}

function describeNode(el: Element): string {
  const testid = el.getAttribute("data-testid");
  return `${el.tagName.toLowerCase()}${testid ? `[${testid}]` : ""}`;
}

function collectBorderedContainers(container: HTMLElement): { root: Element; el: Element }[] {
  const out: { root: Element; el: Element }[] = [];
  for (const root of container.querySelectorAll(SLOT_ROOT_SELECTOR)) {
    if (isBorderedContainer(root)) out.push({ root, el: root });
    for (const el of root.querySelectorAll("*")) {
      if (isBorderedContainer(el)) out.push({ root, el });
    }
  }
  return out;
}

function renderGallery() {
  return render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[...GALLERY]} />);
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("Step-3 row slot (STEP3-GALLERY-TAP-TARGETS-1 item d)", () => {
  test("(i) every row-slot action shares ONE treatment", () => {
    const { container } = renderGallery();
    const actions = collectActions(container);

    // Premise: a single-action slot could not express two vocabularies, and a
    // slot missing a variant could not express the one that drifts.
    premise("the gallery renders more than one row-slot action", actions.length, 1);
    premiseHolds(
      "every gallery variant that renders an action contributed one",
      GALLERY.filter((r) => r !== SET_ASIDE).every(
        (r) =>
          container.querySelector(`[data-testid="wizard-step3-row-${r.driveFileId}"]`) !== null,
      ),
    );

    const byTreatment = new Map<string, string[]>();
    for (const el of actions) {
      const sig = treatmentSignature(el);
      const label = `${describeNode(el)} "${(el.textContent ?? "").trim().slice(0, 32)}"`;
      byTreatment.set(sig, [...(byTreatment.get(sig) ?? []), label]);
    }

    expect(
      Array.from(byTreatment, ([sig, labels]) => `${labels.join(", ")}\n    ${sig}`),
      "distinct action treatments in the Step-3 row slot",
    ).toHaveLength(1);
  });

  // The repair for (ii) chose to flatten the ROW rather than the plate, and that
  // choice rests on a measurement: `--color-surface` against
  // `--color-surface-sunken` is 1.11:1 light / 1.09:1 dark, so a row that kept a
  // fill would NOT be separated from the plate by it — and the plate cannot
  // yield its own border either, since `--color-surface-sunken` on the page
  // `--color-bg` is ~1.05:1. Pinned here because the failure mode is a future
  // edit re-adding `bg-surface` "for separation", which reads as a fix and
  // restores a claim the tokens do not support.
  test("a row inside the bordered plate carries neither a border nor a fill", () => {
    const { container } = renderGallery();
    const plate = container.querySelector('[data-testid="wizard-step3-needs-attention"]');
    premiseHolds("the attention plate rendered", plate !== null);
    const rows = [...plate!.querySelectorAll('[data-testid^="wizard-step3-row-"]')];
    premise("the plate holds rows to check", rows.length, 0);

    const dressed = rows
      .map((row) => ({
        id: describeNode(row),
        tokens: (row.getAttribute("class") ?? "").split(/\s+/).filter(Boolean),
      }))
      .filter(({ tokens }) => tokens.some((t) => BORDER_TOKEN.test(t) || /^bg-/.test(t)))
      .map(
        ({ id, tokens }) =>
          `${id}: ${tokens.filter((t) => BORDER_TOKEN.test(t) || /^bg-/.test(t)).join(" ")}`,
      );

    expect(dressed, "rows inside the plate that still carry a border or a fill").toEqual([]);
  });

  test("every declared placement token is actually in use", () => {
    // A strip entry that matches nothing is a licence nobody is using, and the
    // next person to add one has no way to tell which are load-bearing. Brief B
    // r1 F3 is the reason this exists: the answer to "your normalization can
    // hide a geometry difference" is not to argue, it is to keep the licence
    // list minimal and provably live.
    const { container } = renderGallery();
    const seen = new Set<string>();
    for (const el of collectActions(container)) {
      for (const t of (el.getAttribute("class") ?? "").split(/\s+/)) seen.add(t);
    }
    premise("the gallery renders actions to read tokens from", seen.size, 0);
    expect(
      PLACEMENT_ONLY.filter((p) => !seen.has(p.token)).map((p) => p.token),
      "declared placement tokens that no row-slot action uses — remove the entry",
    ).toEqual([]);
    for (const p of PLACEMENT_ONLY) {
      expect(p.reason.trim().length, `${p.token} needs a reason`).toBeGreaterThan(20);
    }
  });

  test("(ii) no bordered card renders inside another bordered container", () => {
    const { container } = renderGallery();
    const bordered = collectBorderedContainers(container);

    // Premise: with no bordered container anywhere, "none is nested" is vacuous.
    premise("the row slot renders at least one bordered container", bordered.length, 0);

    const nested: string[] = [];
    for (const { root, el } of bordered) {
      for (let p = el.parentElement; p !== null; p = p.parentElement) {
        if (isBorderedContainer(p)) nested.push(`${describeNode(el)} inside ${describeNode(p)}`);
        if (p === root) break;
      }
    }

    expect(nested, "bordered containers nested inside another bordered container").toEqual([]);
  });

  // Brief B r1 F1. The two assertions above read the FIRST render, and the row
  // slot has states the first render cannot reach: a re-scan that returns puts a
  // result block inside the row's own card. That block was bordered, which is
  // item (ii)'s violation in a state no initial-render assertion could see — the
  // reviewer found it by reading, because the guard structurally could not.
  //
  // So the contract is re-asserted after driving every Re-scan in the slot. This
  // is the general lesson of the finding rather than a patch for one block: a
  // guard on a surface with interaction states owes those states an assertion.
  test("(ii) still holds after a re-scan returns a result into the row", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" }),
    } as unknown as Response);

    const { container } = renderGallery();
    const rescans = [
      ...container.querySelectorAll<HTMLElement>('[data-testid^="rescan-sheet-button-"]'),
    ];
    premise("the slot renders re-scan controls to drive", rescans.length, 0);

    for (const button of rescans) {
      await act(async () => {
        fireEvent.click(button);
      });
    }
    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-testid^="rescan-sheet-result-"]').length,
      ).toBeGreaterThan(0),
    );

    const bordered = collectBorderedContainers(container);
    premise("the post-result slot still has bordered containers", bordered.length, 0);
    const nested: string[] = [];
    for (const { root, el } of bordered) {
      for (let parent = el.parentElement; parent !== null; parent = parent.parentElement) {
        if (isBorderedContainer(parent))
          nested.push(`${describeNode(el)} inside ${describeNode(parent)}`);
        if (parent === root) break;
      }
    }
    expect(nested, "bordered containers nested inside another, after a re-scan result").toEqual([]);
  });
});
