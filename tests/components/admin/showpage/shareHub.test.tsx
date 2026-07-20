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
} from "./_rowAssertions";
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
};

function renderHub({
  published = true,
  archived = false,
  finalizeOwned = false,
  token = TOKEN,
  crewEmails = ["alice@example.com"],
  showTitle = "Aurora Fall Tour",
  pickerCrew = CREW,
  archiveAction = async () => ({ ok: true }) as const,
  unarchiveAction = async () => {},
}: Opts = {}) {
  return render(
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
      />
    </ShareTokenProvider>,
  );
}

const primary = () => screen.getByTestId("share-hub-primary") as HTMLButtonElement;
const kebab = () => screen.getByTestId("share-hub-kebab") as HTMLButtonElement;
const popover = () => screen.getByTestId("share-hub-popover");
const queryPopover = () => screen.queryByTestId("share-hub-popover");
const backdrop = () => screen.getByTestId("share-hub-backdrop");

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
  // a bare kebab: an archived show has never rendered a hub before, so a
  // three-dot glyph is the operator's only clue that a way back exists
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

  it("keeps both triggers clickable above the backdrop (impeccable critique P1)", () => {
    // The backdrop is `fixed inset-0 z-20`. If the trigger group does not sit
    // above it, a second click on the trigger lands on the overlay instead —
    // the toggle path becomes dead code and jsdom cannot catch it (no
    // z-index hit-testing), so this pins the stacking contract in source.
    renderHub();
    fireEvent.click(primary()); // the backdrop only exists while open
    const group = primary().parentElement!;
    // Word-boundary, not substring: `toContain("z-30")` also passes on `z-300`
    // or `not-z-30`, neither of which emits the stacking rule this pins.
    expect(group.className).toMatch(/(^|\s)z-30(\s|$)/);
    expect(screen.getByTestId("share-hub-backdrop").className).toMatch(/(^|\s)z-20(\s|$)/);
  });

  it("caps the popover height so destructive controls cannot be pushed off-screen", () => {
    // Email rows are batched by mailto length with no row cap, so a large
    // roster could otherwise push Rotate/Reset below the fold at 390px.
    renderHub();
    fireEvent.click(primary());
    expect(popover().className).toMatch(/max-h-\[min\(70vh,32rem\)\]/);
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
  it("elevates its root ONLY while open, so a closed hub cannot paint over the attention menu", () => {
    renderHub();
    const root = primary().parentElement as HTMLElement;
    expect(root.className).toContain("relative");
    expect(root.className).not.toContain("z-30");

    fireEvent.click(primary());
    expect(root.className).toContain("z-30");

    fireEvent.click(primary());
    expect(root.className).not.toContain("z-30");
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
    const zLevel = (cls: string): number => {
      const m = /(^|\s)(-?)z-(\[(-?\d+)\]|\d+)(\s|$)/.exec(cls);
      if (!m) return 0;
      const raw = m[4] ?? m[3];
      return (m[2] === "-" ? -1 : 1) * Number(raw);
    };
    for (const el of [primary(), kebab()]) {
      expect(zLevel(el.className), `${el.className} must stay below the menu's z-20`).toBeLessThan(
        20,
      );
    }
  });
});

describe("ShareHub — caret (spec §5)", () => {
  it("renders a decorative caret OUTSIDE the popover, AFTER it, and inert", () => {
    renderHub();
    fireEvent.click(primary());

    const caret = screen.getByTestId("share-hub-caret");
    expect(caret.getAttribute("aria-hidden")).toBe("true");

    // Sibling, NOT a child: a child would be clipped by the panel's
    // overflow-y-auto and silently invisible.
    expect(popover().contains(caret)).toBe(false);

    // Two z-40 siblings: TREE ORDER decides paint order, not z-index. The caret
    // must FOLLOW the popover or the panel's top border cuts the notch.
    expect(
      popover().compareDocumentPosition(caret) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Same positioned parent, or the caret is anchored to the wrong ancestor.
    expect(caret.parentElement).toBe(popover().parentElement);
    expectClasses(caret.parentElement!, { has: ["relative"] });

    // aria-hidden does not disable hit-testing: without pointer-events-none the
    // caret would intercept clicks in its overlap with the panel and any
    // panelRef.contains(target) check would read them as outside the dialog.
    expectClasses(caret, { has: ["pointer-events-none"] });

    // The two are equal-z SIBLINGS, so tree order (asserted above) only decides
    // paint order while both stay at z-40. Pin the level on both, or lowering the
    // caret's z would drop it behind the panel while order + geometry still pass.
    expectClasses(caret, { has: ["z-40"] });
    expectClasses(popover(), { has: ["z-40"] });

    // The dialog keeps its OWN scrolling - the withdrawn outer/inner split would
    // have moved it off the focused element.
    expectClasses(popover(), { has: ["overflow-y-auto", "max-h-[min(70vh,32rem)]"] });

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
const ROW_TOKENS = [
  "flex",
  "w-full",
  "items-center",
  "gap-2",
  "rounded-sm",
  "min-h-tap-min",
  "p-2",
  "text-left",
  "hover:bg-surface-sunken",
  "transition-colors",
  "duration-fast",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-focus-ring",
] as const;

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

  it("reset idle state is ONE menu row, contributes no heading, keeps its ring offset", () => {
    renderHub();
    fireEvent.click(primary());

    const reset = screen.getByTestId("picker-reset-all-button");
    expect(reset.tagName).toBe("BUTTON");
    expectClasses(reset, {
      exactly: [
        ...ROW_TOKENS,
        // reset-ONLY: the guard against silently homogenizing the two rows'
        // focus treatment, and against a disabled row lighting up on hover
        // (a disabled button still matches :hover).
        "focus-visible:ring-offset-2",
        "focus-visible:ring-offset-surface",
        "disabled:cursor-not-allowed",
        "disabled:opacity-60",
        "disabled:hover:bg-transparent",
      ],
      forbids: [NO_BORDER, NO_REST_BACKGROUND],
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
  /**
   * Leaves rotate mid-flight so busy stays true, and RETURNS the resolver. The
   * caller must settle it: a test that abandons an in-flight transition leaks a
   * pending React transition into the next test in this file (observed —
   * abandoning it made the lifecycle-deferral test below fail while passing in
   * isolation).
   */
  const openAndHang = async () => {
    let settle: ((v: unknown) => void) | null = null;
    rotateMock.mockImplementation(
      () =>
        new Promise((res) => {
          settle = res;
        }),
    );
    renderHub();
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
