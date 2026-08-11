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
import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
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
  if (el.closest('[data-testid="help-affordance"]') !== null) return false;
  if (el.matches('[data-testid$="-title-link"]')) return false;
  return true;
}

/**
 * Classes that PLACE a control rather than dress it: they say where it sits in
 * its parent's flex line, not what it looks like.
 *
 * `w-full` and `flex-1` are deliberately NOT here even though they read as
 * layout. Both change the control's rendered width, so two actions differing
 * only in one of them look different on screen — stripping them would let a
 * full-width button and a content-width button share a signature and satisfy
 * "the set has size 1" while the slot plainly showed two treatments.
 */
const PLACEMENT_ONLY = new Set(["shrink-0", "self-start", "min-w-0"]);

function treatmentSignature(el: Element): string {
  return el
    .getAttribute("class")!
    .split(/\s+/)
    .filter((t) => t.length > 0 && !PLACEMENT_ONLY.has(t))
    .sort()
    .join(" ");
}

function collectActions(container: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const root of container.querySelectorAll(SLOT_ROOT_SELECTOR)) {
    for (const el of root.querySelectorAll<HTMLElement>("button, a[href]")) {
      if (isRowSlotAction(el)) out.push(el);
    }
  }
  return out;
}

// A bordered CONTAINER, not a bordered control: a button carrying an outline is
// the vocabulary item (i) is about, and nesting one inside a card is correct.
const CONTAINER_TAGS = new Set(["SECTION", "ARTICLE", "DIV", "UL", "LI", "ASIDE", "HEADER", "P"]);
const BORDER_TOKEN = /^border(-[0-9]+)?$|^border-(t|r|b|l|x|y|s|e)(-[0-9]+)?$/;

function isBorderedContainer(el: Element): boolean {
  if (!CONTAINER_TAGS.has(el.tagName)) return false;
  const tokens = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  return tokens.some((t) => BORDER_TOKEN.test(t)) && tokens.some((t) => /^rounded(-|$)/.test(t));
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
});
