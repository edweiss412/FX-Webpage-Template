// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx
 * (BL-DIAGRAM-TILE-CHROME-CONSISTENCY, spec
 *  docs/superpowers/specs/2026-08-28-diagram-tile-chrome-consistency.md Task 1)
 *
 * WHICH ELEMENT carries the tile's box chrome. The ruling (spec §1) is: the
 * wrapper — the element that FORMS the box in each branch.
 *
 * Not "the only element present in every render state". An earlier draft of this
 * header said that and it is false: the `failed` branch returns before the live
 * anchor exists, which this suite itself proves by asserting the failed box is
 * NOT an anchor. The box is declared once per branch either way. What the ruling
 * buys is that both declarations land on their branch's box-forming wrapper,
 * rather than on a container in one branch and an image in the other — which is
 * how they drifted apart in the first place.
 *
 * Concrete failure modes this catches:
 *  - the chrome moving back onto the <img>, under ANY token: the negative
 *    assertion matches chrome SHAPES per token, not today's class string, so a
 *    re-add under `border-border` or a new token still reds.
 *  - the wrapper losing the box, which would leave a tile with no edge at all.
 *  - the two branches' boxes diverging in radius or clip. That is a VISUAL
 *    divergence, not a layout one: neither `rounded-*` nor `overflow-hidden`
 *    changes a box's dimensions, so nothing here reflows the grid. The grid's
 *    stability rests on `aspect-4/3 w-full`, which both branches state and which
 *    the real-browser suite measures.
 *
 * The token difference BETWEEN the branches is deliberate and is NOT asserted
 * here: `border-text-faint` is the control-outline token and the live branch is a
 * control, while the failed branch is a non-interactive placeholder. Spec §6, L1.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import { DiagramTile } from "@/components/admin/wizard/step3ReviewSections";
import { premiseHolds } from "../../../_shared/premise";

const TEST_ID = "chrome-probe-tile";

/** Any box-chrome shape, not just the one shipped today. A negative assertion
 *  keyed to the current token would pass the moment someone re-adds chrome to
 *  the image under a different one.
 *
 *  Matched per TOKEN, not against the whole string. An earlier draft used
 *  `/(^|\s)(rounded(-|$)|border(-|$)|bg-)/`, where `$` means end of the whole
 *  STRING rather than end of a token — so `object-cover border size-full`
 *  returned false and a bare `border` in the middle of a class list slipped
 *  straight through the negative assertion. Anchoring each token with ^...$
 *  removes the boundary case by construction instead of patching it. */
const CHROME_TOKEN = /^(rounded|rounded-.+|border|border-.+|bg-.+)$/;

/** True when ANY class token is box chrome. */
function hasChromeToken(className: string): boolean {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .some((t) => CHROME_TOKEN.test(t));
}

/** Exact utility tokens, NOT substrings. `toContain("border")` is satisfied by
 *  `border-text-faint` on its own, so a diff that dropped the bare `border`
 *  utility — the class that actually draws the 1px line, where the -text-faint
 *  class only colours it — would pass a substring assertion while the border
 *  disappeared. Token membership cannot be fooled that way. */
function tokens(el: Element): Set<string> {
  return new Set(el.className.split(/\s+/).filter(Boolean));
}

afterEach(cleanup);

function tile(hasPreviewSource: boolean) {
  return (
    <DiagramTile
      href="https://example.invalid/diagram"
      sourceKey="diagrams/probe.png"
      loader={({ src, width }) => `/api/probe?k=${encodeURIComponent(src)}&w=${width}`}
      sizes="100px"
      alt="Stage plot"
      testId={TEST_ID}
      hasPreviewSource={hasPreviewSource}
    />
  );
}

function renderTile(hasPreviewSource: boolean) {
  return render(tile(hasPreviewSource));
}

describe("diagram tile chrome lives on the wrapper", () => {
  test("the chrome-token check is a negative control, not a pattern matching everything", () => {
    // The POSITIVE half of this premise lives in the live-branch case below,
    // where it runs against the anchor's real className rather than a literal
    // typed in here. What remains is the other direction, which real data
    // cannot supply: the regex must NOT match a bare fit class, or the negative
    // assertion would be failing for the wrong reason.
    expect(hasChromeToken("object-cover")).toBe(false);
    expect(hasChromeToken("size-full object-cover")).toBe(false);
    // The boundary cases the previous whole-string regex got WRONG. These are
    // the reason this helper is per-token: each has box chrome in the middle of
    // the list, where an end-of-string anchor never reaches.
    expect(hasChromeToken("object-cover border size-full")).toBe(true);
    expect(hasChromeToken("object-cover rounded size-full")).toBe(true);
    expect(hasChromeToken("object-cover bg-surface-sunken size-full")).toBe(true);
  });

  test("live branch: the anchor carries the box, the image carries only its fit", () => {
    const { getByTestId, container } = renderTile(true);
    const anchor = getByTestId(TEST_ID);
    const img = container.querySelector("img");

    // Premise: this must actually BE the live branch. "the image carries no
    // chrome" is vacuously true of a branch that rendered no image.
    premiseHolds("the live branch rendered an <img>", img !== null);
    premiseHolds("the live branch's box element is the anchor", anchor.tagName === "A");

    const have = tokens(anchor);
    for (const cls of ["rounded-md", "border", "border-text-faint", "bg-surface-sunken"]) {
      expect(have.has(cls), `the anchor carries the exact utility ${cls}`).toBe(true);
    }

    // The instrument proved against REAL data from this same render, not against
    // a literal typed into a premise: the regex must fire on the anchor before
    // its silence on the image means anything. This is the discriminating pair.
    premiseHolds(
      "the chrome-token check fires on the anchor's real className",
      hasChromeToken(anchor.className),
    );
    expect(
      hasChromeToken(img!.className),
      `the image carries no box chrome, got: ${img!.className}`,
    ).toBe(false);
    // AC-1's actual contract: the image's class string is EXACTLY this. Stronger
    // than the shape scan above, and it also catches a diff that ADDS something
    // to the image which happens not to look like chrome.
    expect(img!.className.trim()).toBe("object-cover");
  });

  test("failed branch: the placeholder carries the same box", () => {
    const { getByTestId, container } = renderTile(false);
    const box = getByTestId(TEST_ID);

    // Premise: this must be the OTHER branch, or the two cases compare one
    // element to itself.
    premiseHolds("the failed branch rendered no <img>", container.querySelector("img") === null);
    premiseHolds("the failed branch's box element is not the anchor", box.tagName !== "A");

    const have = tokens(box);
    for (const cls of ["rounded-md", "border", "bg-surface-sunken"]) {
      expect(have.has(cls), `the placeholder carries the exact utility ${cls}`).toBe(true);
    }
  });

  // Spec §8's compound case. The two axes (which branch renders, and whether the
  // box is focused) were independent while the chrome sat on the image, because
  // an <img> is never focus-visible. On the anchor one event moves both, so the
  // inventory names it and this asserts it. Focus relocation itself is already
  // covered by step3DiagramTile.failureFocus.test.tsx; what is new here is that
  // the BOX survives the swap.
  test("compound: a FOCUSED live tile fails, and the placeholder still carries the box", () => {
    const { getByTestId, container } = renderTile(true);
    const anchor = getByTestId(TEST_ID);
    anchor.focus();

    // Premises: the compound case needs BOTH axes actually engaged. Without the
    // focus premise this is just the failed-branch test again.
    premiseHolds("the tile held focus before the failure", document.activeElement === anchor);
    const img = container.querySelector("img");
    premiseHolds("the live branch mounted an <img> to fail", img !== null);

    fireEvent.error(img!);

    const box = getByTestId(TEST_ID);
    premiseHolds("the failure swapped the branch", box.tagName !== "A");
    premiseHolds("no <img> survives the swap", container.querySelector("img") === null);
    const have = tokens(box);
    for (const cls of [
      "rounded-md",
      "border",
      "bg-surface-sunken",
      "aspect-4/3",
      "overflow-hidden",
    ]) {
      expect(have.has(cls), `the placeholder still carries ${cls} after a focused failure`).toBe(
        true,
      );
    }
  });

  // Spec §8 route B, and the reason the inventory has two rows rather than one:
  // reconciliation reaches the failed branch WITHOUT the error handler, so a
  // review that only knew about onError would have missed it. Focus is not
  // relocated on this route (spec L4) and that is pre-existing; what this
  // asserts is the part the chrome move owns, which is that the box survives.
  test("compound route B: a FOCUSED live tile reconciles to unavailable, box intact", () => {
    const { getByTestId, container, rerender } = renderTile(true);
    const anchor = getByTestId(TEST_ID);
    anchor.focus();

    premiseHolds("the tile held focus before reconciling", document.activeElement === anchor);
    premiseHolds("the live branch mounted an <img>", container.querySelector("img") !== null);

    // The prop flip, NOT an image error: this is the route that never calls onFailure.
    rerender(tile(false));

    const box = getByTestId(TEST_ID);
    premiseHolds("reconciliation swapped the branch", box.tagName !== "A");
    premiseHolds("no <img> survives reconciliation", container.querySelector("img") === null);
    const have = tokens(box);
    for (const cls of [
      "rounded-md",
      "border",
      "bg-surface-sunken",
      "aspect-4/3",
      "overflow-hidden",
    ]) {
      expect(have.has(cls), `the placeholder still carries ${cls} after reconciling`).toBe(true);
    }
  });

  test("neither box element declares a transition, so no tween can be interrupted", () => {
    // Spec §8 declares every pair instant. That is only true while neither
    // element opts into a transition, so it is asserted rather than assumed.
    const live = renderTile(true).getByTestId(TEST_ID).className;
    cleanup();
    const failed = renderTile(false).getByTestId(TEST_ID).className;
    for (const [label, cn] of [
      ["live", live],
      ["failed", failed],
    ] as const) {
      expect(/(^|\s)transition(-|\s|$)/.test(cn), `${label} branch declares no transition`).toBe(
        false,
      );
    }
  });

  test("both branches state the same box geometry and clip", () => {
    const live = tokens(renderTile(true).getByTestId(TEST_ID));
    cleanup();
    const failed = tokens(renderTile(false).getByTestId(TEST_ID));

    // The shared box contract. `aspect-4/3` and `w-full` are the two that keep a
    // runtime failure from reflowing the grid; `overflow-hidden` and `rounded-md`
    // are here because the two branches should also LOOK like one box, not
    // because they carry any layout dimension. Pinned as real-browser geometry at
    // tests/e2e/step3-review-modal.layout.spec.ts:659.
    for (const cls of ["aspect-4/3", "w-full", "overflow-hidden", "rounded-md"]) {
      expect(live.has(cls), `live branch states the exact utility ${cls}`).toBe(true);
      expect(failed.has(cls), `failed branch states the exact utility ${cls}`).toBe(true);
    }
  });
});
