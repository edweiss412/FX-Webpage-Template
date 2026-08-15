// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/shareHub.test.tsx
 *
 * Behavior-only coverage for <ShareHub> (spec 2026-07-20-share-hub-design.md).
 * Geometry is deliberately NOT asserted here: jsdom computes no layout, so
 * width / placement / clamp / tap-min live in the Playwright layout spec that
 * ships with the styling (plan T4). Everything below is jsdom-provable.
 *
 * The §9 rules R1-R4 are executable here — they replaced a hand-enumerated
 * compound table that four review rounds could not keep correct, so these tests
 * are the authority on composition, not prose.
 */
import "@testing-library/jest-dom/vitest";
import { maxZLevel } from "../../../_shared/zLevel";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rotateMock = vi.hoisted(() => vi.fn());
const epochMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/picker/rotateShareToken", () => ({ rotateShareToken: rotateMock }));
vi.mock("@/lib/auth/picker/resetPickerEpoch", () => ({ resetPickerEpoch: epochMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import {
  expectClasses,
  expectRowBoundary,
  expectRowText,
  NO_BORDER,
  NO_REST_BACKGROUND,
  WRAPPER_CLASSES,
  ROW_TOKENS,
} from "./_rowAssertions";
import { PopoverHostContext } from "@/components/admin/HoverHelp";
import { ShareHub } from "@/components/admin/showpage/ShareHub";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { resolveOrigin } from "@/app/admin/show/[slug]/resolveOrigin";

const SHOW_ID = "11111111-2222-4333-8444-555555555555";
const SLUG = "aurora-fall-tour";
const TOKEN = "b".repeat(64);
const CREW = [
  { id: "c1111111-1111-4111-8111-111111111111", name: "Alice", role: "A1" },
  { id: "c2222222-2222-4222-8222-222222222222", name: "Bob", role: "BO" },
];

type Opts = {
  published?: boolean;
  archived?: boolean;
  finalizeOwned?: boolean;
  token?: string | null;
  crewEmails?: readonly string[];
  showTitle?: string;
  pickerCrew?: typeof CREW;
  archiveAction?: () => Promise<{ ok: true } | { ok: false; code: string }>;
  unarchiveAction?: (showId: string) => Promise<void>;
  attentionMenuOpen?: boolean | undefined;
};

/** The hub's tree WITHOUT rendering it, so a caller can wrap it in a
 *  PopoverHostContext provider before mounting (the portal host is read on the
 *  render after refs populate, so it has to be in place from the start). */
function hubTree({
  published = true,
  archived = false,
  finalizeOwned = false,
  token = TOKEN,
  crewEmails = ["alice@example.com"],
  showTitle = "Aurora Fall Tour",
  pickerCrew = CREW,
  archiveAction = async () => ({ ok: true }) as const,
  unarchiveAction = async () => {},
  attentionMenuOpen,
}: Opts = {}) {
  return (
    <ShareTokenProvider key={SHOW_ID} initialToken={token} initialEpoch={1}>
      <ShareHub
        slug={SLUG}
        showId={SHOW_ID}
        published={published}
        archived={archived}
        finalizeOwned={finalizeOwned}
        crewEmails={crewEmails}
        showTitle={showTitle}
        pickerCrew={pickerCrew}
        archiveAction={archiveAction}
        unarchiveAction={unarchiveAction}
        attentionMenuOpen={attentionMenuOpen}
      />
    </ShareTokenProvider>
  );
}

function renderHub(opts: Opts = {}) {
  return render(hubTree(opts));
}

/**
 * The MAX positive z across ALL tokens of a className. Not a single .exec
 * (`z-10 z-30` must read as 30), and NOT by stripping the variant prefix (its
 * grammar is open-ended — `sm:`, `dark:`, `data-[state=open]:`, `[&:hover]:`,
 * `supports-[display:grid]:` …). The z-utility is matched as a SUFFIX instead:
 * every Tailwind z token ends in `z-<n>` / `z-[<n>]` at token start or right
 * after a colon, whatever precedes it. Negatives never raise the max, so a
 * trigger carrying only `-z-10` reads 0.
 */

const primary = () => screen.getByTestId("share-hub-primary") as HTMLButtonElement;
const kebab = () => screen.getByTestId("share-hub-kebab") as HTMLButtonElement;
const popover = () => screen.getByTestId("share-hub-popover");
const queryPopover = () => screen.queryByTestId("share-hub-popover");
const backdrop = () => screen.getByTestId("share-hub-backdrop");

/**
 * Opens the hub and leaves rotate mid-flight so `busy` stays true, RETURNING the
 * resolver. The caller MUST settle it, in a `finally`: a test that abandons an
 * in-flight transition leaks a pending React transition into the next test in
 * this file (observed — abandoning it made the lifecycle-deferral test fail
 * while passing in isolation). A timed-out gate does not settle the promise on
 * its own, so the busyStuck cases need the same discipline.
 */
const openAndHangWith = async (opts: Opts = {}) => {
  let settle: ((v: unknown) => void) | null = null;
  rotateMock.mockImplementation(
    () =>
      new Promise((res) => {
        settle = res;
      }),
  );
  renderHub(opts);
  fireEvent.click(primary());
  fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
  await act(async () => {
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-confirm-button"));
  });
  return async () => {
    await act(async () => {
      settle?.({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    });
  };
};

const openAndHang = () => openAndHangWith();

beforeEach(() => {
  rotateMock.mockReset();
  epochMock.mockReset();
});
afterEach(cleanup);

describe("ShareHub — triggers", () => {
  it("published: primary reads 'Share link'; unpublished: 'Share link · paused'", () => {
    const { unmount } = renderHub({ published: true });
    expect(primary().textContent).toContain("Share link");
    expect(primary().textContent).not.toMatch(/paused/i);
    unmount();
    renderHub({ published: false });
    expect(primary().textContent).toMatch(/Share link · paused/);
  });

  it("kebab carries its accessible name", () => {
    renderHub();
    expect(kebab()).toHaveAccessibleName("More show actions");
  });

  // Archived is read-only for SHARING — the crew link, Copy, Email, rotate and
  // reset are all gone — but the hub is still the one home for the lifecycle
  // control. The primary must therefore stay LABELLED rather than degrading to
  // a bare kebab: before this change an archived show rendered no hub at all,
  // so a three-dot glyph is the operator's only clue that a way back exists
  // (impeccable critique P1 — recognition, not recall).
  it("archived: the primary relabels to 'Show actions' rather than disappearing", () => {
    renderHub({ archived: true });
    expect(primary().textContent).toBe("Show actions");
    expect(primary().textContent).not.toMatch(/share link/i);
    expect(kebab()).toBeTruthy();
  });

  it("BOTH triggers report aria-expanded false→true and point at the popover", () => {
    // A permanently-collapsed aria-expanded would leave assistive tech with a
    // wrong state while the popover is visibly open.
    renderHub();
    expect(primary().getAttribute("aria-expanded")).toBe("false");
    expect(kebab().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(primary());
    expect(primary().getAttribute("aria-expanded")).toBe("true");
    expect(kebab().getAttribute("aria-expanded")).toBe("true");

    const id = primary().getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).toBe(popover());
    expect(kebab().getAttribute("aria-controls")).toBe(id);
  });
});

describe("ShareHub — open/close semantics", () => {
  it("either trigger opens exactly one labelled dialog; pressing again closes", () => {
    renderHub();
    expect(queryPopover()).toBeNull();

    fireEvent.click(primary());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(popover()).toHaveAccessibleName("Share crew link and show actions");
    fireEvent.click(primary());
    expect(queryPopover()).toBeNull();

    fireEvent.click(kebab());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(kebab());
    expect(queryPopover()).toBeNull();
  });

  it("swallows Escape even when focus has LEFT the panel (impeccable audit P1)", () => {
    // The panel's own onKeyDown only fires while focus is inside it, and this
    // popover deliberately has no focus trap. After tabbing past the last
    // control, Escape would otherwise reach the shell's document listener,
    // which closes the ENTIRE review modal on any Escape without checking
    // defaultPrevented — while the hub is still open, possibly mid-rotate.
    const shellSpy = vi.fn();
    document.addEventListener("keydown", shellSpy);
    try {
      renderHub();
      fireEvent.click(primary());
      // Move focus somewhere outside the panel, as Tab-out would.
      document.body.focus();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(queryPopover()).toBeNull();
      expect(shellSpy, "shell must never see the Escape").not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", shellSpy);
    }
  });

  it("moves focus INTO the dialog on open (impeccable critique P0)", () => {
    // A role="dialog" must receive focus when it opens. Without this, Tab from
    // the primary trigger reaches the kebab before any control inside the
    // panel, and a screen-reader user is never moved into the dialog they
    // just opened.
    renderHub();
    fireEvent.click(primary());
    expect(document.activeElement).toBe(popover());
  });

  it("pins the backdrop and hub-root stacking LEVELS (not hit order)", () => {
    // NOTE (2026-07-24): this pins class-level z values only, and the original
    // title ("keeps both triggers clickable above the backdrop") overclaimed.
    // A real-browser elementFromPoint probe shows the backdrop DOES swallow a
    // trigger tap, on this branch and equally on origin/main: the root's
    // open-gated `z-30` elevates the whole root, backdrop included, and does not
    // order that fixed z-20 child against its non-positioned trigger siblings.
    // Behaviourally near-invisible (the backdrop's own handler closes the
    // popover, so the tap still dismisses, just without focus restore), so it is
    // filed as BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS rather than fixed inside a
    // placement diff. Kept because the LEVELS are still a real contract —
    // T-BACKDROP in admin-lifecycle-layout.spec.ts is what checks paint order.
    renderHub();
    fireEvent.click(primary()); // the backdrop only exists while open
    const group = primary().parentElement!;
    // Word-boundary, not substring: `toContain("z-30")` also passes on `z-300`
    // or `not-z-30`, neither of which emits the stacking rule this pins.
    expect(screen.getByTestId("share-hub-backdrop").className).toMatch(/(^|\s)z-dropdown(\s|$)/);
  });

  it("caps the popover height so destructive controls cannot be pushed off-screen", () => {
    // Email rows are batched by mailto length with no row cap, so a large
    // roster could otherwise push Rotate/Reset below the fold at 390px.
    renderHub();
    fireEvent.click(primary());
    expect(popover().className).toMatch(/max-h-\[min\(70vh,30rem\)\]/);
    expect(popover().className).toContain("overflow-y-auto");
  });

  it("backdrop click closes WITHOUT restoring trigger focus", () => {
    renderHub();
    fireEvent.click(primary());
    (document.activeElement as HTMLElement)?.blur();
    fireEvent.click(backdrop());
    expect(queryPopover()).toBeNull();
    expect(document.activeElement).not.toBe(primary());
  });

  it("Escape closes, restores focus to the trigger that opened it, and does NOT reach the document", () => {
    // ReviewModalShell.tsx:238-245 subscribes a document-level Escape listener
    // that closes the WHOLE review modal on any Escape and never inspects
    // defaultPrevented — so stopPropagation, not preventDefault, is what keeps
    // the modal open. A spy here stands in for the shell.
    const shellSpy = vi.fn();
    document.addEventListener("keydown", shellSpy);
    try {
      renderHub();
      fireEvent.click(kebab());
      fireEvent.keyDown(popover(), { key: "Escape" });
      expect(queryPopover()).toBeNull();
      expect(document.activeElement).toBe(kebab());
      expect(shellSpy).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", shellSpy);
    }
  });
});

describe("ShareHub — z-order (spec §3)", () => {
  it("keeps the root a bare `relative` with NO z-index, open or closed", () => {
    // The root used to gain `z-30` while open, to lift the in-flow popover over
    // sibling content. The popover portals into the ReviewModalShell host now
    // and carries its own z there, so nothing in this subtree needs raising.
    // `relative` stays: the root is the caret's measurement anchor.
    //
    // Asserted in BOTH states, because the failure this replaces was an
    // UNCONDITIONAL z-30 that painted the non-positioned triggers over the
    // attention menu's z-20 panel and stole its clicks.
    renderHub();
    const root = primary().parentElement as HTMLElement;
    expect(root.className).toContain("relative");
    expect(maxZLevel(root.className)).toBe(0);

    fireEvent.click(primary());
    expect(maxZLevel(root.className)).toBe(0);

    fireEvent.click(primary());
    expect(maxZLevel(root.className)).toBe(0);
  });

  it("keeps BOTH triggers below the z-20 menu's stacking level", () => {
    renderHub();
    // The AUTHORITATIVE guard for this defect is T-HUB-ZORDER in the real
    // browser (elementFromPoint over the overlap); jsdom computes no paint
    // order. This is a cheap belt-and-suspenders check on the ONE thing a class
    // scan can decide: a trigger overpaints the menu only if it carries a
    // z-index at or above the menu's level (20). Per CSS 2.1 Appendix E a
    // positioned element at z-auto/z-0 paints BELOW a positive-z context, and
    // z-10 < z-20, so none of `relative`, `z-0`, `z-10`, or `isolate` (a
    // level-0 context) reintroduces it — only z >= 20 does. Parse the level and
    // assert it, so a correct refactor adding a low z stays green.
    // The MAX positive z across ALL tokens. Not a single .exec (`z-10 z-30` must
    // read as 30), and NOT by stripping the variant prefix (its grammar is
    // open-ended — `sm:`, `dark:`, `data-[state=open]:`, `[&:hover]:`,
    // `supports-[display:grid]:` …). Instead the z-utility is matched as a
    // SUFFIX: every Tailwind z token ends in `z-<n>` / `z-[<n>]` at token start
    // or immediately after a colon, whatever precedes it. That closes the whole
    // prefix class rather than enumerating spellings. Negatives never raise the
    // max, so a trigger with only `-z-10` reads 0 and passes.
    for (const el of [primary(), kebab()]) {
      expect(
        maxZLevel(el.className),
        `${el.className} must stay below the menu's z-20`,
      ).toBeLessThan(20);
    }
  });
});

describe("ShareHub — caret (spec §5)", () => {
  it("portals the popover into the PopoverHostContext host when one is provided", () => {
    // The host is load-bearing, not cosmetic: portaling into the
    // ReviewModalShell panel keeps the dialog inside the shell's focus trap,
    // aria-modal subtree and inert handling, and it is the rect placement is
    // bounded by. Falling back to document.body when a provider exists would
    // silently escape all four.
    const host = document.createElement("div");
    host.setAttribute("data-testid", "portal-host");
    document.body.appendChild(host);
    const hostRef = { current: host };
    try {
      render(
        <PopoverHostContext.Provider value={hostRef}>{hubTree()}</PopoverHostContext.Provider>,
      );
      fireEvent.click(screen.getByTestId("share-hub-primary"));
      const popoverNode = screen.getByTestId("share-hub-popover");
      expect(host.contains(popoverNode)).toBe(true);
      expect(host.contains(screen.getByTestId("share-hub-caret"))).toBe(true);
    } finally {
      host.remove();
    }
  });

  it("falls back to document.body when no host provider is present", () => {
    renderHub();
    fireEvent.click(primary());
    // Not asserting a literal document.body parent: what matters is that it
    // left the hub root, which is the clipped in-flow position it used to sit in.
    expect(screen.getByTestId("share-hub-root").contains(popover())).toBe(false);
    expect(document.body.contains(popover())).toBe(true);
  });

  it("renders a decorative caret OUTSIDE the popover, AFTER it, and inert", () => {
    renderHub();
    fireEvent.click(primary());

    const caret = screen.getByTestId("share-hub-caret");
    expect(caret.getAttribute("aria-hidden")).toBe("true");

    // Sibling, NOT a child: a child would be clipped by the panel's
    // overflow-y-auto and silently invisible.
    expect(popover().contains(caret)).toBe(false);

    // Two z-banner siblings: TREE ORDER decides paint order, not z-index. The caret
    // must FOLLOW the popover or the panel's top border cuts the notch.
    expect(
      popover().compareDocumentPosition(caret) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Same parent as the body, or the two are positioned in different
    // coordinate spaces and the notch drifts off the edge it is meant to
    // straddle. Both now live in the PORTAL host (spec §2.1.1), not in the hub
    // root — the old `relative`-ancestor assertion described the superseded
    // in-flow anchoring, where the root was the positioned ancestor.
    expect(caret.parentElement).toBe(popover().parentElement);
    expect(screen.getByTestId("share-hub-root").contains(caret)).toBe(false);
    expect(screen.getByTestId("share-hub-root").contains(popover())).toBe(false);

    // aria-hidden does not disable hit-testing: without pointer-events-none the
    // caret would intercept clicks in its overlap with the panel and any
    // panelRef.contains(target) check would read them as outside the dialog.
    expectClasses(caret, { has: ["pointer-events-none"] });

    // The two are equal-z SIBLINGS, so tree order (asserted above) only decides
    // paint order while both stay at z-banner. Pin the level on both, or lowering the
    // caret's z would drop it behind the panel while order + geometry still pass.
    expectClasses(caret, { has: ["z-banner"] });
    expectClasses(popover(), { has: ["z-banner"] });

    // The dialog keeps its OWN scrolling - the withdrawn outer/inner split would
    // have moved it off the focused element.
    expectClasses(popover(), { has: ["overflow-y-auto", "max-h-[min(70vh,30rem)]"] });

    fireEvent.click(primary());
    expect(screen.queryByTestId("share-hub-caret")).toBeNull();
  });
});

describe("ShareHub — published arm content", () => {
  it("renders the crew URL derived from origin+slug+token, plus Copy", () => {
    renderHub();
    fireEvent.click(primary());
    // Derived from the fixture, never hardcoded.
    const expected = `${resolveOrigin()}/show/${SLUG}/${TOKEN}`;
    expect(screen.getByTestId("admin-current-share-link-url").textContent).toBe(expected);
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });

  it("renders one mailto row per batch, with the multi-batch note only when batched", () => {
    renderHub({ crewEmails: ["a@example.com", "b@example.com"] });
    fireEvent.click(primary());
    const rows = screen.getAllByTestId("admin-current-share-link-email-button");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) expect(r.getAttribute("href")).toMatch(/^mailto:/);
    // Both recipients must survive the batching — dropping one would otherwise
    // pass every assertion above.
    const allHrefs = rows.map((r) => decodeURIComponent(r.getAttribute("href") ?? "")).join(" ");
    expect(allHrefs).toContain("a@example.com");
    expect(allHrefs).toContain("b@example.com");
    // The multi-batch note is present iff there is more than one batch.
    if (rows.length === 1) {
      expect(screen.queryByTestId("admin-current-share-link-email-note")).toBeNull();
    } else {
      expect(screen.getByTestId("admin-current-share-link-email-note").textContent).toContain(
        String(rows.length),
      );
    }
  });

  it("GUARD empty crewEmails: no mailto rows at all", () => {
    renderHub({ crewEmails: [] });
    fireEvent.click(primary());
    expect(screen.queryAllByTestId("admin-current-share-link-email-button")).toHaveLength(0);
  });

  it("GUARD empty showTitle: still emits a usable mailto (subject fallback, no 'undefined')", () => {
    renderHub({ showTitle: "", crewEmails: ["a@example.com"] });
    fireEvent.click(primary());
    const rows = screen.queryAllByTestId("admin-current-share-link-email-button");
    // Anti-vacuity: without this the loop below asserts nothing if an empty
    // title suppressed every row.
    expect(rows.length, "empty title must still emit rows").toBeGreaterThan(0);
    for (const r of rows) {
      const href = r.getAttribute("href") ?? "";
      expect(href).toMatch(/^mailto:/);
      expect(href.toLowerCase()).not.toContain("undefined");
    }
  });

  it("GUARD null token: unavailable sentence instead of a dead URL block", () => {
    renderHub({ token: null });
    fireEvent.click(primary());
    expect(screen.queryByTestId("admin-current-share-link-url")).toBeNull();
    expect(screen.getByTestId("admin-current-share-link-unavailable").textContent).toMatch(
      /share-link is unavailable right now/i,
    );
    // Rotate is the documented recovery from a missing token ("rotate to mint a
    // new link"), so a token-null hub that hid the Careful rows would strand
    // the operator with advice they cannot act on.
    expect(screen.getByTestId("admin-rotate-share-token-button")).toBeTruthy();
    expect(screen.getByTestId("picker-reset-all-button")).toBeTruthy();
  });
});

describe("ShareHub — unpublished arm", () => {
  it("shows the paused note, hides url/copy/email, and KEEPS the Careful rows", () => {
    renderHub({ published: false });
    fireEvent.click(primary());
    expect(popover().textContent).toMatch(
      /crew link is paused while this show is unpublished\. Publish to share it/i,
    );
    expect(screen.queryByTestId("admin-current-share-link-url")).toBeNull();
    expect(screen.queryAllByTestId("admin-current-share-link-email-button")).toHaveLength(0);
    // Spec §1.1: rotate/reset stay reachable while unpublished.
    expect(screen.getByTestId("admin-rotate-share-token-button")).toBeTruthy();
    expect(screen.getByTestId("picker-reset-all-button")).toBeTruthy();
  });
});

/** The prescribed row class list (spec §4.1), shared by both Careful rows. */

describe("ShareHub — Careful section wiring", () => {
  it("rotate idle state is ONE borderless full-width menu row", () => {
    renderHub({ published: true });
    fireEvent.click(primary());

    const rotate = screen.getByTestId("admin-rotate-share-token-button");
    expect(rotate.tagName).toBe("BUTTON");
    // `exactly`, not `has`: the class list is fully prescribed, so an overriding
    // extra (sm:w-auto, items-start, px-0) must FAIL rather than ride along.
    expectClasses(rotate, { exactly: ROW_TOKENS, forbids: [NO_BORDER, NO_REST_BACKGROUND] });

    // One call covers containment, exact text, uniqueness, typography, stacking
    // order, and row topology for BOTH strings (spec §7.0).
    expectRowText(rotate, popover(), {
      label: "Rotate share link",
      description: "Old link stops working immediately",
    });

    const icon = rotate.querySelector("svg")!;
    expect(icon.getAttribute("width")).toBe("16");
    expect(icon.getAttribute("height")).toBe("16");
    // `has`, deliberately: lucide adds its own base `lucide` class, so the list
    // is not complete and `exactly` would be wrong.
    expectClasses(icon, { has: ["shrink-0", "text-text-subtle", "lucide-rotate-ccw"] });

    // The OLD shape must be GONE, not merely joined by the new one.
    expect(within(popover()).queryByRole("button", { name: "Rotate" })).toBeNull();

    // §4.6 width chain link 1: the wrapper, not just the button.
    expectClasses(rotate.parentElement!, { exactly: WRAPPER_CLASSES });
    expectRowBoundary(rotate, {
      scope: popover(),
      descriptionId: rotate.getAttribute("aria-describedby"),
    });
  });

  it("archive idle state is ONE §4.1 menu row anchored to the full section width (spec §2.1/§2.3)", () => {
    renderHub();
    fireEvent.click(primary());

    const archive = screen.getByTestId("archive-show-button");
    expect(archive.tagName).toBe("BUTTON");
    expectClasses(archive, {
      exactly: ROW_TOKENS,
      forbids: [NO_BORDER, NO_REST_BACKGROUND, /(?:^|:)focus-visible:ring-offset-/],
    });
    expectRowText(archive, popover(), {
      label: "Archive show",
      description: "Ends crew access and clears it off the dashboard",
    });
    const icon = archive.querySelector("svg")!;
    expect(icon.getAttribute("width")).toBe("16");
    expect(icon.getAttribute("height")).toBe("16");
    expectClasses(icon, { has: ["shrink-0", "text-text-subtle", "lucide-archive"] });
    expect(within(popover()).queryByRole("button", { name: "Archive" })).toBeNull();
    expectClasses(archive.parentElement!, { exactly: WRAPPER_CLASSES });
    expectRowBoundary(archive, {
      scope: popover(),
      descriptionId: archive.getAttribute("aria-describedby"),
    });
    // §2.3 width-chain link: the Show-section host div is w-full with NO inset.
    const section = screen.getByTestId("share-hub-show-section");
    expectClasses(section, { exactly: ["w-full"] });
  });

  it("rotate row carries its label + description and follows published for isCrewLinkActive", () => {
    renderHub({ published: true });
    fireEvent.click(primary());
    const rotate = screen.getByTestId("admin-rotate-share-token-button");
    expect(rotate).toHaveAccessibleName("Rotate share link");
    const descId = rotate.getAttribute("aria-describedby");
    expect(document.getElementById(descId!)?.textContent).toBe(
      "Old link stops working immediately",
    );
  });

  it("reset idle state is ONE menu row, contributes no heading, tier-1 focus (no offset)", () => {
    renderHub();
    fireEvent.click(primary());

    const reset = screen.getByTestId("picker-reset-all-button");
    expect(reset.tagName).toBe("BUTTON");
    expectClasses(reset, {
      exactly: [
        ...ROW_TOKENS,
        // Disabled-state guard: a disabled row must not light up on hover
        // (a disabled button still matches :hover).
        "disabled:cursor-not-allowed",
        "disabled:opacity-60",
        "disabled:hover:bg-transparent",
      ],
      // Tier 1 (spec 2026-07-23-sharehub-focus-pass §2): the offset pair that
      // used to ride on this row is now reserved for armed destructive
      // confirms. A reappearing `focus-visible:ring-offset-*` here is the pass
      // reverting.
      forbids: [NO_BORDER, NO_REST_BACKGROUND, /(?:^|:)focus-visible:ring-offset-/],
    });

    expectRowText(reset, popover(), {
      label: "Reset everyone's pick",
      description: "Make everyone pick their name again on their next visit.",
    });

    const icon = reset.querySelector("svg")!;
    expect(icon.getAttribute("width")).toBe("16");
    expect(icon.getAttribute("height")).toBe("16");
    // Identity, not just dimensions: a wrong glyph passes a size-only check.
    expectClasses(icon, { has: ["shrink-0", "text-text-subtle", "lucide-refresh-cw"] });

    // §4.3: the PCR-1 (b) heading is deliberately gone at EVERY level
    // (expectRowText rejects any heading inside the row); the `Careful` <h3>
    // still stands.
    expect(within(popover()).queryByRole("heading", { level: 4 })).toBeNull();
    expect(within(popover()).getByRole("heading", { level: 3, name: "Careful" })).toBeTruthy();

    expectClasses(reset.parentElement!, { exactly: WRAPPER_CLASSES });
    expectRowBoundary(reset, {
      scope: popover(),
      descriptionId: reset.getAttribute("aria-describedby"),
      // ONLY reset renders a persistent sr-only live region (PCR-1 (a)); the
      // flag defaults to false so rotate cannot quietly grow one.
      allowLiveRegion: true,
    });
  });

  it("GUARD empty pickerCrew: reset row renders its empty-roster copy and is disabled", () => {
    renderHub({ pickerCrew: [] });
    fireEvent.click(primary());
    expect(within(popover()).getByText("No crew to reset yet.")).toBeTruthy();
    expect((screen.getByTestId("picker-reset-all-button") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe("ShareHub — Show section (lifecycle)", () => {
  const showSection = () => screen.getByTestId("share-hub-show-section");

  it("live/held: the Show section holds Archive, in its own section below Careful", () => {
    renderHub();
    fireEvent.click(kebab());
    const section = showSection();
    expect(within(section).getByTestId("archive-show-button")).toBeTruthy();
    // Its own section, NOT folded into Careful: the rotate/reset rows are
    // share-scoped, the lifecycle control is not.
    expect(within(section).queryByTestId("admin-rotate-share-token-button")).toBeNull();
    expect(within(section).queryByTestId("picker-reset-all-button")).toBeNull();
    // Archive is the lifecycle arm for a non-archived show — never both.
    expect(screen.queryByTestId(`unarchive-show-button-${SHOW_ID}`)).toBeNull();
  });

  it("archived: the Show section holds Unarchive and every share affordance is gone", () => {
    renderHub({ archived: true });
    fireEvent.click(kebab());
    expect(popover()).toHaveAccessibleName("Show actions");
    expect(within(showSection()).getByTestId(`unarchive-show-button-${SHOW_ID}`)).toBeTruthy();
    expect(screen.queryByTestId("archive-show-button")).toBeNull();
    // Read-only: no URL, no Copy, no email rows, no rotate, no reset.
    expect(screen.queryByTestId("admin-current-share-link-url")).toBeNull();
    expect(screen.queryByTestId("admin-current-share-link-email-button")).toBeNull();
    expect(screen.queryByTestId("admin-rotate-share-token-button")).toBeNull();
    expect(screen.queryByTestId("picker-reset-all-button")).toBeNull();
  });

  it("Publishing… (finalize-owned, !archived): NO Show section at all — not an empty heading", () => {
    // The show is immutable during the finalize window (consolidated-admin-show-page
    // §6), so the control is hidden rather than disabled. A heading with nothing
    // under it is the defect this catches.
    renderHub({ finalizeOwned: true });
    fireEvent.click(kebab());
    expect(screen.queryByTestId("share-hub-show-section")).toBeNull();
    expect(screen.queryByTestId("archive-show-button")).toBeNull();
    // The share half is untouched by the finalize window.
    expect(screen.getByTestId("admin-current-share-link-url")).toBeTruthy();
  });

  // impeccable audit P1. The publish axis flips from the toggle OUTSIDE the
  // panel; the archive axis flips from a control INSIDE it, so the auto-close
  // unmounts the subtree that currently holds focus. Bare setOpen(false) drops
  // focus to <body> and a keyboard user restarts from the top of the modal.
  it("a lifecycle close restores focus to the trigger, not <body>", () => {
    const { rerender } = render(
      <ShareTokenProvider key={SHOW_ID} initialToken={TOKEN} initialEpoch={1}>
        <ShareHub
          slug={SLUG}
          showId={SHOW_ID}
          published
          archived={false}
          finalizeOwned={false}
          crewEmails={[]}
          showTitle="T"
          pickerCrew={CREW}
          archiveAction={async () => ({ ok: true }) as const}
          unarchiveAction={async () => {}}
        />
      </ShareTokenProvider>,
    );
    fireEvent.click(kebab());
    expect(document.activeElement).toBe(popover());

    rerender(
      <ShareTokenProvider key={SHOW_ID} initialToken={TOKEN} initialEpoch={1}>
        <ShareHub
          slug={SLUG}
          showId={SHOW_ID}
          published
          archived
          finalizeOwned={false}
          crewEmails={[]}
          showTitle="T"
          pickerCrew={CREW}
          archiveAction={async () => ({ ok: true }) as const}
          unarchiveAction={async () => {}}
        />
      </ShareTokenProvider>,
    );
    expect(queryPopover()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(kebab());
  });

  it("finalize-owned is ignored once archived: Unarchive still renders", () => {
    renderHub({ archived: true, finalizeOwned: true });
    fireEvent.click(kebab());
    expect(within(showSection()).getByTestId(`unarchive-show-button-${SHOW_ID}`)).toBeTruthy();
  });
});

describe("ShareHub — Unarchive failure surface", () => {
  it("a rejected unarchive renders a role=alert retry line instead of failing silently", async () => {
    // The action returns void, so there is no result to branch on — only a
    // rejection. Silence here would be the entire feedback: the button just
    // reverts to "Unarchive" (impeccable audit P2).
    renderHub({
      archived: true,
      unarchiveAction: async () => {
        throw new Error("boom");
      },
    });
    fireEvent.click(kebab());
    await act(async () => {
      fireEvent.click(screen.getByTestId(`unarchive-show-button-${SHOW_ID}`));
    });
    const alert = await screen.findByTestId(`unarchive-show-error-${SHOW_ID}`);
    expect(alert).toHaveAttribute("role", "alert");
    // Plain language, no raw code (invariant 5).
    expect(alert.textContent).toMatch(/didn’t go through/i);
    expect(alert.textContent).not.toMatch(/[A-Z_]{6,}/);
  });
});

describe("ShareHub — the row wrappers are inert (spec §7.0)", () => {
  // The SOURCE guard (_metaRowWrapperInert.test.ts) is the proof that no handler
  // is attached: finite event sampling cannot show absence across ~60 React DOM
  // event props. These are its behavioral complement, and the second half of
  // each - clicking the ROW - is what stops them passing against a dead control.
  const cases = [
    { name: "reset", row: "picker-reset-all-button", confirm: "picker-reset-confirm-row" },
    {
      name: "rotate",
      row: "admin-rotate-share-token-button",
      confirm: "admin-rotate-share-token-confirm-row",
    },
  ] as const;

  for (const { name, row, confirm } of cases) {
    it(`${name}: clicking the WRAPPER does nothing; clicking the ROW still arms`, () => {
      renderHub();
      fireEvent.click(primary());

      const button = screen.getByTestId(row);
      const wrapper = button.parentElement as HTMLElement;

      expect(screen.queryByTestId(confirm)).toBeNull();
      // Enter/over first: fireEvent.click synthesizes no pointer sequence, so a
      // wrapper wired with onPointerEnter/onPointerOver would survive a
      // click-only probe while a real pointer merely entering it arms the row.
      fireEvent.pointerOver(wrapper);
      fireEvent.pointerEnter(wrapper);
      fireEvent.mouseOver(wrapper);
      fireEvent.mouseEnter(wrapper);
      fireEvent.pointerDown(wrapper);
      fireEvent.mouseDown(wrapper);
      fireEvent.pointerUp(wrapper);
      fireEvent.mouseUp(wrapper);
      fireEvent.click(wrapper);
      fireEvent.doubleClick(wrapper);
      fireEvent.contextMenu(wrapper);
      expect(screen.queryByTestId(confirm)).toBeNull();

      fireEvent.click(button);
      expect(screen.getByTestId(confirm)).toBeTruthy();
    });
  }
});

describe("ShareHub — §9 composition rules", () => {
  const openHub = () => {
    renderHub();
    fireEvent.click(primary());
  };

  it("R1: arming a control's confirm clears ITS OWN banner (rotate)", async () => {
    rotateMock.mockResolvedValue({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    openHub();
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-rotate-share-token-confirm-button"));
    });
    await waitFor(() => screen.getByTestId("admin-rotate-share-token-refused"));

    // Re-arm: the banner must go, and confirm must be showing — banner+confirm
    // is unreachable WITHIN one control.
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
    expect(screen.queryByTestId("admin-rotate-share-token-refused")).toBeNull();
    expect(screen.getByTestId("admin-rotate-share-token-confirm-row")).toBeTruthy();
  });

  it("R1 across controls: a rotate banner SURVIVES arming reset's confirm", async () => {
    rotateMock.mockResolvedValue({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    openHub();
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-rotate-share-token-confirm-button"));
    });
    await waitFor(() => screen.getByTestId("admin-rotate-share-token-refused"));

    fireEvent.click(screen.getByTestId("picker-reset-all-button"));
    expect(screen.getByTestId("picker-reset-confirm-row")).toBeTruthy();
    // No cross-clear: the sibling's banner is untouched.
    expect(screen.getByTestId("admin-rotate-share-token-refused")).toBeTruthy();
  });

  it("§6: two confirms may be armed at once — permitted, no cross-clear, no throw", () => {
    openHub();
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
    fireEvent.click(screen.getByTestId("picker-reset-all-button"));
    expect(screen.getByTestId("admin-rotate-share-token-confirm-row")).toBeTruthy();
    expect(screen.getByTestId("picker-reset-confirm-row")).toBeTruthy();
  });

  it("R3: a rotate error banner is role=alert and persists (never auto-dismissed)", async () => {
    vi.useFakeTimers();
    try {
      rotateMock.mockResolvedValue({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      renderHub();
      fireEvent.click(primary());
      fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
      await act(async () => {
        fireEvent.click(screen.getByTestId("admin-rotate-share-token-confirm-button"));
        await vi.advanceTimersByTimeAsync(0);
      });
      const banner = screen.getByTestId("admin-rotate-share-token-refused");
      expect(banner.getAttribute("role")).toBe("alert");
      act(() => vi.advanceTimersByTime(30_000));
      expect(screen.getByTestId("admin-rotate-share-token-refused")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ShareHub — busy gating (spec §6)", () => {
  it("ALL FOUR dismissal paths are inert while a child is resolving", async () => {
    const shellSpy = vi.fn();
    document.addEventListener("keydown", shellSpy);
    let settle: (() => Promise<void>) | null = null;
    try {
      settle = await openAndHang();
      expect(queryPopover()).not.toBeNull();

      fireEvent.click(primary());
      expect(queryPopover()).not.toBeNull();

      fireEvent.click(kebab());
      expect(queryPopover()).not.toBeNull();

      fireEvent.click(backdrop());
      expect(queryPopover()).not.toBeNull();

      fireEvent.keyDown(popover(), { key: "Escape" });
      expect(queryPopover()).not.toBeNull();
      // Escape must STILL be swallowed — otherwise it closes the whole review
      // modal, which is strictly worse than closing the popover.
      expect(shellSpy).not.toHaveBeenCalled();
    } finally {
      // Settle before leaving: never abandon an in-flight transition.
      await settle?.();
      document.removeEventListener("keydown", shellSpy);
    }
  });

  // The lifecycle control is a busy-reporting child like rotate and reset.
  // Without its own report, a backdrop tap mid-archive unmounts the form: the
  // mutation still lands (the crew link is dead) but its refusal/outcome banner
  // never renders — the exact harm §6 exists to prevent.
  it("an in-flight ARCHIVE gates dismissal the same way rotate does", async () => {
    let settleArchive: ((v: { ok: true }) => void) | null = null;
    renderHub({
      archiveAction: () =>
        new Promise<{ ok: true }>((res) => {
          settleArchive = res;
        }),
    });
    fireEvent.click(kebab());
    fireEvent.click(screen.getByTestId("archive-show-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("archive-show-confirm-button"));
    });

    fireEvent.click(backdrop());
    expect(queryPopover()).not.toBeNull();
    // Inert dismissal must be ANNOUNCED, not just enforced: an SR user pressing
    // Escape mid-archive otherwise gets no response and no explanation
    // (impeccable audit P2).
    expect(popover()).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      settleArchive?.({ ok: true });
    });
  });
});

describe("ShareHub — lifecycle close (spec §4)", () => {
  const Harness = ({
    published,
    hang,
    archived = false,
  }: {
    published: boolean;
    hang: boolean;
    archived?: boolean;
  }) => (
    <ShareTokenProvider key={SHOW_ID} initialToken={TOKEN} initialEpoch={1}>
      <ShareHub
        slug={SLUG}
        showId={SHOW_ID}
        published={published}
        archived={archived}
        finalizeOwned={false}
        crewEmails={[]}
        showTitle="T"
        pickerCrew={hang ? CREW : CREW}
        archiveAction={async () => ({ ok: true }) as const}
        unarchiveAction={async () => {}}
      />
    </ShareTokenProvider>
  );

  // The lifecycle the popover now hosts is BOTH axes. Keyed on `published`
  // alone, a successful Archive would leave the popover open across the
  // Archive→Unarchive content swap, so the operator's next tap lands on a
  // different control than the one they aimed at.
  it("ARCHIVED flip while OPEN and IDLE closes the popover", () => {
    const { rerender } = render(<Harness published hang={false} />);
    fireEvent.click(kebab());
    expect(queryPopover()).not.toBeNull();
    rerender(<Harness published hang={false} archived />);
    expect(queryPopover()).toBeNull();
  });

  it("UNPUBLISHED → published while OPEN and IDLE also closes (both directions)", () => {
    // The contract is "a lifecycle change closes it", not "unpublishing closes
    // it". An implementation keyed only on the true→false edge would leave the
    // paused popover open over freshly-published content.
    const { rerender } = render(<Harness published={false} hang={false} />);
    fireEvent.click(primary());
    expect(queryPopover()).not.toBeNull();
    rerender(<Harness published hang={false} />);
    expect(queryPopover()).toBeNull();
  });

  it("published flip while OPEN and IDLE closes the popover immediately", () => {
    // Without this the popover survives the published/unpublished content swap,
    // showing the wrong arm over a stale state.
    const { rerender } = render(<Harness published hang={false} />);
    fireEvent.click(primary());
    expect(queryPopover()).not.toBeNull();
    rerender(<Harness published={false} hang={false} />);
    expect(queryPopover()).toBeNull();
  });

  it("published flip while BUSY keeps the popover OPEN so the outcome stays readable", async () => {
    let resolveRotate: ((v: unknown) => void) | null = null;
    rotateMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveRotate = res;
        }),
    );
    const { rerender } = render(<Harness published hang />);
    fireEvent.click(primary());
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-rotate-share-token-confirm-button"));
    });

    rerender(<Harness published={false} hang />);
    // Still open: unmounting now would lose the outcome of a destructive action.
    expect(queryPopover()).not.toBeNull();

    await act(async () => {
      resolveRotate?.({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    });

    // And still open AFTER the settle. Closing here was self-defeating: `busy`
    // clearing is the same transition that mounts the outcome banner, so an
    // auto-close unmounted it after ~one paint and could swallow its
    // live-region announcement — the exact harm the deferral exists to
    // prevent. A completed destructive action outranks the convenience of
    // auto-closing, so the operator dismisses it.
    expect(queryPopover()).not.toBeNull();
    expect(screen.getByTestId("admin-rotate-share-token-refused")).toBeTruthy();
  });

  it("a never-settling action does not wedge the popover shut forever", async () => {
    // Without a bound, a hung action (network hang, or a proxy that drops the
    // response after the mutation commits) leaves busy true forever: all four
    // dismissal paths inert AND Escape swallowed, so the operator can never
    // close the popover. Being unable to dismiss is worse than losing a banner.
    vi.useFakeTimers();
    try {
      rotateMock.mockImplementation(() => new Promise(() => {}));
      render(<Harness published hang />);
      fireEvent.click(primary());
      fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
      await act(async () => {
        fireEvent.click(screen.getByTestId("admin-rotate-share-token-confirm-button"));
      });

      // Gated while the action is plausibly in flight.
      fireEvent.click(primary());
      expect(queryPopover()).not.toBeNull();

      // Past the bound, the operator gets control back.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      fireEvent.click(primary());
      expect(queryPopover()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ShareHub — two-tier focus contract (spec 2026-07-23-sharehub-focus-pass §2)", () => {
  const TIER1_RING = ["focus-visible:ring-2", "focus-visible:ring-focus-ring"] as const;
  const OFFSET_PAIR = ["focus-visible:ring-offset-2", "focus-visible:ring-offset-surface"] as const;
  // SET EQUALITY over every focus-visible ring-family token (ring width, ring
  // color, offset width, offset color — variant prefixes included). Forbid
  // lists cannot close this class: a lookahead forbid lets
  // `sm:focus-visible:ring-offset-2` coexist with the ratified pair, and no
  // forbid stops a competing `focus-visible:ring-4` or a second ring color
  // from overriding the treatment while every positive assertion stays green.
  const ringTokens = (el: Element) =>
    (el.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter((t) => t.includes("focus-visible:ring"))
      .sort();
  const expectTier1 = (el: Element) => {
    expect(ringTokens(el)).toEqual([...TIER1_RING].sort());
  };
  const expectTier2 = (el: Element) => {
    expect(ringTokens(el)).toEqual([...TIER1_RING, ...OFFSET_PAIR].sort());
  };

  it("tier 1: reset row + reset cancel carry exactly the plain ring set", () => {
    renderHub();
    fireEvent.click(primary());
    const row = screen.getByTestId("picker-reset-all-button");
    expectTier1(row);
    fireEvent.click(row);
    expectTier1(screen.getByTestId("picker-reset-cancel-button"));
  });

  it("tier 2: reset armed confirm carries exactly ring set + offset pair", () => {
    renderHub();
    fireEvent.click(primary());
    fireEvent.click(screen.getByTestId("picker-reset-all-button"));
    expectTier2(screen.getByTestId("picker-reset-confirm-button"));
  });

  it("tier 2: rotate armed confirm exact; its row and cancel stay tier 1", () => {
    renderHub({ published: true });
    fireEvent.click(primary());
    const row = screen.getByTestId("admin-rotate-share-token-button");
    expectTier1(row);
    fireEvent.click(row);
    expectTier2(screen.getByTestId("admin-rotate-share-token-confirm-button"));
    expectTier1(screen.getByTestId("admin-rotate-share-token-cancel-button"));
  });

  it("tier 2: archive armed confirm exact; its row and cancel stay tier 1", () => {
    renderHub();
    fireEvent.click(primary());
    const row = screen.getByTestId("archive-show-button");
    expectTier1(row);
    fireEvent.click(row);
    expectTier2(screen.getByTestId("archive-show-confirm-button"));
    expectTier1(screen.getByTestId("archive-show-cancel-button"));
  });

  it("tier 1 inventory: primary, kebab, mailto row and copy button carry exactly the plain ring set", () => {
    // Set equality: losing the base ring token (unfocusable-looking control),
    // gaining a bare offset (white halo), or a competing ring width/color all
    // fail the same assertion.
    renderHub({ published: true });
    fireEvent.click(primary());
    for (const el of [
      primary(),
      kebab(),
      screen.getByTestId("admin-current-share-link-email-button"),
      screen.getByTestId("admin-current-share-link-copy-button"),
    ]) {
      expectTier1(el);
    }
  });

  it("tier 1: unarchive is a single-tap non-destructive action - exact plain ring set (dark-halo regression)", () => {
    renderHub({ archived: true });
    fireEvent.click(kebab());
    expectTier1(screen.getByTestId(`unarchive-show-button-${SHOW_ID}`));
  });
});

describe("mobile split actions row (spec 2026-07-24-strip-mobile-stacked-band §3 R3)", () => {
  it("root spans; primary carries the FULL §3 R3 class contract; kebab bordered square", () => {
    renderHub();
    const primary = screen.getByTestId("share-hub-primary");
    for (const cls of [
      "max-sm:flex-1",
      "max-sm:justify-center",
      "max-sm:min-h-tap-min",
      "max-sm:rounded-sm",
      "max-sm:border",
      "max-sm:border-border",
      "max-sm:whitespace-nowrap",
      "max-sm:min-w-0",
      "max-sm:overflow-hidden",
    ]) {
      expect(primary.className).toContain(cls);
    }
    const kebab = screen.getByTestId("share-hub-kebab");
    for (const cls of [
      "max-sm:min-h-tap-min",
      "max-sm:min-w-tap-min",
      "max-sm:rounded-sm",
      "max-sm:border",
      "max-sm:border-border",
    ]) {
      expect(kebab.className).toContain(cls);
    }
    const root = screen.getByTestId("share-hub-root");
    expect(root.className).toContain("max-sm:w-full");
    expect(primary.parentElement).toBe(root);
  });

  it("labels unchanged in all lifecycles", () => {
    renderHub({ archived: false, published: true });
    expect(screen.getByTestId("share-hub-primary")).toHaveTextContent("Share link");
    cleanup();
    renderHub({ archived: false, published: false });
    expect(screen.getByTestId("share-hub-primary")).toHaveTextContent("Share link · paused");
    cleanup();
    renderHub({ archived: true });
    expect(screen.getByTestId("share-hub-primary")).toHaveTextContent("Show actions");
  });
});

describe("ShareHub — Archive row copy (spec §2.2)", () => {
  /** The description node the Archive button's aria-describedby actually points
   *  at. Resolved through the IDREF, NOT a text query: the popover also renders
   *  the paused note, so a container-scoped text search would match on either
   *  branch and pass for the wrong reason. */
  const describedText = () => {
    const btn = screen.getByTestId("archive-show-button");
    const id = btn.getAttribute("aria-describedby");
    expect(id, "archive row must describe itself").toBeTruthy();
    return document.getElementById(id!)?.textContent ?? null;
  };

  it("published: names the access loss AND the purpose", () => {
    // Live show: archiving really does end crew access, and the reason anyone
    // reaches for it is to clear a wrapped show off the dashboard.
    renderHub({ published: true });
    fireEvent.click(primary());
    expect(describedText()).toBe("Ends crew access and clears it off the dashboard");
  });

  it("held: does NOT claim to stop access that is already stopped", () => {
    // The old copy was a constant "Ends crew access and clears it off the dashboard", which
    // is false on an unpublished show -- the popover is simultaneously telling
    // the operator the crew link is already paused.
    renderHub({ published: false });
    fireEvent.click(primary());
    expect(describedText()).toBe("Clears this wrapped show off the dashboard");
    expect(describedText()).not.toMatch(/stop working/i);
  });

  it("stops rhyming with the Rotate row, without touching Rotate's copy", () => {
    // The two rows sat adjacent in one 308px popover reading "Old link stops
    // working immediately" and "Ends crew access and clears it off the dashboard" -- same
    // shape, same sentence, and the weaker-sounding one belonged to the larger
    // action. Rotate is unchanged; Archive stopped mirroring it.
    renderHub({ published: true });
    fireEvent.click(primary());
    const rotate = screen.getByTestId("admin-rotate-share-token-button");
    const rotateDescId = rotate.getAttribute("aria-describedby");
    const rotateText = document.getElementById(rotateDescId!)?.textContent ?? null;
    expect(rotateText).toBe("Old link stops working immediately");
    expect(describedText()).not.toBe(rotateText);
  });

  it("never calls archiving permanent, in either state", () => {
    // Unarchive lives in this same section, so copy that implies finality would
    // be wrong (supabase/migrations/20260601000000_b2_show_lifecycle.sql).
    for (const published of [true, false]) {
      const { unmount } = renderHub({ published });
      fireEvent.click(primary());
      expect(describedText()).not.toMatch(/permanent|forever|cannot be undone/i);
      unmount();
    }
  });
});

/**
 * Open-gated trigger elevation (spec §3.1/§3.2, BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS).
 *
 * The backdrop is `fixed inset-0 z-20` inside the hub root and the triggers are
 * NON-POSITIONED siblings, so the backdrop paints over them and swallows their
 * taps. The fix elevates the triggers ABOVE the backdrop while the hub is open —
 * but only when nothing else is competing for the same band, hence a THREE-TERM
 * gate: open AND not busy AND the attention menu not open. The menu's panel is
 * z-20; an unconditional elevation here is exactly the regression that once
 * stole the menu's clicks (share-hub-fidelity-fixes §3).
 */
describe("ShareHub — trigger elevation (spec §3.1)", () => {
  const bothTriggers = () => [primary(), kebab()];

  it("open + idle: both triggers clear the z-20 backdrop", () => {
    renderHub();
    fireEvent.click(primary());
    expect(queryPopover()).not.toBeNull();
    for (const el of bothTriggers()) {
      expect(
        maxZLevel(el.className),
        `${el.className} must clear the backdrop's z-20`,
      ).toBeGreaterThanOrEqual(21);
    }
  });

  it("open + busy: elevation drops instantly", async () => {
    let settle: (() => Promise<void>) | null = null;
    try {
      settle = await openAndHang();
      expect(queryPopover()).not.toBeNull();
      for (const el of bothTriggers()) {
        expect(
          maxZLevel(el.className),
          "a busy hub must not raise its triggers over the backdrop",
        ).toBeLessThan(20);
      }
    } finally {
      // Never abandon an in-flight transition (see openAndHangWith).
      await settle?.();
    }
  });

  it("attentionMenuOpen: suppressed while open, restored on the prop flip", () => {
    const { rerender } = render(hubTree({ attentionMenuOpen: true }));
    fireEvent.click(primary());
    expect(queryPopover()).not.toBeNull();
    for (const el of bothTriggers()) {
      expect(
        maxZLevel(el.className),
        "a trigger at z >= 20 overpaints the attention menu's z-20 panel",
      ).toBeLessThan(20);
    }

    rerender(hubTree({ attentionMenuOpen: false }));
    for (const el of bothTriggers()) {
      expect(maxZLevel(el.className)).toBeGreaterThanOrEqual(21);
    }
  });

  it("attentionMenuOpen stays suppressed through a busy settle", async () => {
    let settle: (() => Promise<void>) | null = null;
    try {
      settle = await openAndHangWith({ attentionMenuOpen: true });
      for (const el of bothTriggers()) {
        expect(maxZLevel(el.className)).toBeLessThan(20);
      }
    } finally {
      await settle?.();
    }
    // Busy is over, but the menu is STILL open — the gate has three terms, so
    // one of them clearing must not restore the elevation.
    for (const el of bothTriggers()) {
      expect(
        maxZLevel(el.className),
        "busy settled but the menu is still open — elevation must stay suppressed",
      ).toBeLessThan(20);
    }
  });

  it("attentionMenuOpen stays suppressed through the busyStuck timeout", async () => {
    vi.useFakeTimers();
    let settle: (() => Promise<void>) | null = null;
    try {
      settle = await openAndHangWith({ attentionMenuOpen: true });
      // busyStuck hands dismissal back to the operator after BUSY_GATE_MAX_MS,
      // which clears `busy` — the menu term must still hold the gate shut.
      await act(async () => {
        vi.advanceTimersByTime(20_000);
      });
      for (const el of bothTriggers()) {
        expect(
          maxZLevel(el.className),
          "busyStuck released the gate while the menu was open",
        ).toBeLessThan(20);
      }
    } finally {
      vi.useRealTimers();
      await settle?.();
    }
  });

  it("prop absent behaves as false (closed state pin is unchanged)", () => {
    renderHub();
    // Closed: no elevation at all — the backdrop does not exist yet.
    for (const el of bothTriggers()) {
      expect(maxZLevel(el.className)).toBeLessThan(20);
    }
    fireEvent.click(primary());
    for (const el of bothTriggers()) {
      expect(maxZLevel(el.className)).toBeGreaterThanOrEqual(21);
    }
  });
});

/**
 * Focus-leave light dismiss (spec §3.4).
 *
 * Inside-set for this surface has FOUR members: the popover panel's
 * descendants, the backdrop, the primary trigger and the kebab. Dismissal here
 * is the light kind — like the backdrop path and unlike Escape, it does NOT
 * restore focus, because whatever just took focus is where the operator meant
 * to go.
 */
describe("ShareHub — focus-leave dismiss (spec §3.4)", () => {
  function outsideTarget() {
    const el = document.createElement("button");
    el.setAttribute("data-testid", "outside-focus-target");
    document.body.appendChild(el);
    return el;
  }

  it("open + idle: focusin outside all four closes WITHOUT restoring focus", () => {
    renderHub();
    fireEvent.click(primary());
    expect(queryPopover()).not.toBeNull();

    const outside = outsideTarget();
    outside.focus();
    fireEvent.focusIn(outside);

    expect(queryPopover()).toBeNull();
    // Escape restores focus to the opener; focus-leave must not, or it yanks
    // the operator back out of wherever they just went.
    expect(document.activeElement).not.toBe(primary());
    expect(document.activeElement).not.toBe(kebab());
  });

  it("focusin on the popover panel keeps it open", () => {
    renderHub();
    fireEvent.click(primary());
    fireEvent.focusIn(popover());
    expect(queryPopover()).not.toBeNull();
  });

  it("focusin on a popover DESCENDANT keeps it open", () => {
    renderHub();
    fireEvent.click(primary());
    fireEvent.focusIn(screen.getByTestId("admin-rotate-share-token-button"));
    expect(queryPopover()).not.toBeNull();
  });

  it("focusin on the backdrop keeps it open", () => {
    renderHub();
    fireEvent.click(primary());
    fireEvent.focusIn(backdrop());
    expect(queryPopover()).not.toBeNull();
  });

  it("focusin on the primary trigger keeps it open", () => {
    renderHub();
    fireEvent.click(primary());
    fireEvent.focusIn(primary());
    expect(queryPopover()).not.toBeNull();
  });

  it("focusin on the kebab keeps it open", () => {
    renderHub();
    fireEvent.click(primary());
    fireEvent.focusIn(kebab());
    expect(queryPopover()).not.toBeNull();
  });

  it("busy: focusin outside does NOT close (busy-exempt, like every other path)", async () => {
    let settle: (() => Promise<void>) | null = null;
    try {
      settle = await openAndHang();
      const outside = outsideTarget();
      fireEvent.focusIn(outside);
      expect(queryPopover()).not.toBeNull();
    } finally {
      await settle?.();
    }
  });

  it("window blur alone does NOT close it (ratified §3.4/§10 exception)", () => {
    renderHub();
    fireEvent.click(primary());
    fireEvent.blur(window);
    fireEvent.focusOut(popover(), { relatedTarget: null });
    expect(queryPopover()).not.toBeNull();
  });
});

/**
 * Threading proof for the self-describing armed confirm (spec §5.1/§5.3).
 * The hub already knows the show's title; the armed Archive confirm is where it
 * matters, because that is the destructive decision.
 */
describe("ShareHub — armed Archive confirm names the show", () => {
  it("threads showTitle into the row-variant ArchiveShowButton", () => {
    renderHub({ showTitle: "Spring Gala" });
    fireEvent.click(primary());
    fireEvent.click(screen.getByTestId("archive-show-button"));
    const confirm = screen.getByTestId("archive-show-confirm-button");
    const prose = document.getElementById(confirm.getAttribute("aria-describedby")!)!;
    expect(prose.textContent).toBe(
      "Crew links for “Spring Gala” stop working now and won’t come back until you re-publish and issue a new link.",
    );
    expect(screen.getByTestId("archive-show-confirm-row").getAttribute("aria-label")).toBe(
      "Confirm archiving “Spring Gala”",
    );
  });
});
