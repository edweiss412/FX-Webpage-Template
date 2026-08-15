// @vitest-environment jsdom
/**
 * tests/components/admin/PublishedToggle.test.tsx (published-toggle plan Task 8)
 *
 * The persistent Published switch in Share & access (spec §3.3). Mode boundaries
 * (archived pages never MOUNT the component — pinned at the page level in
 * per-show-lifecycle.test.tsx):
 *   Live                  → ON,  enabled  ("Crew link is active.")
 *   Held                  → OFF, enabled  ("Crew link is off; nobody can open this show.")
 *   Publishing… (¬pub)    → OFF, disabled (publish-finishing explainer)
 *   Live + finalize-owned → ON,  disabled (changes-finalizing explainer) — R2/R3: a
 *                           pending-changes finalize can own a LIVE show.
 *
 * Failure modes caught: enabled toggle on a finalize-owned show (mid-finalize unpublish
 * race); refusal copy wiped by router.refresh (R10); catalog copy satisfied by a sibling
 * (anti-tautology: assertions scope INSIDE the toggle row's own subtree).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PublishedToggle } from "@/components/admin/PublishedToggle";
import { messageFor } from "@/lib/messages/lookup";
import { computeFittedMaxHeight } from "@/lib/layout/fitWithinClip";

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
  usePathname: () => "/admin/show/s1",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

const okAction = () => vi.fn(async (_next: boolean) => ({ ok: true }) as const);

function renderToggle(
  overrides: Partial<{
    published: boolean;
    finalizeOwned: boolean;
    setPublished: (next: boolean) => Promise<{ ok: true } | { ok: false; code: string }>;
  }> = {},
) {
  return render(
    <PublishedToggle
      slug="s1"
      published={overrides.published ?? true}
      finalizeOwned={overrides.finalizeOwned ?? false}
      setPublished={overrides.setPublished ?? okAction()}
    />,
  );
}

function row(): HTMLElement {
  return screen.getByTestId("published-toggle-row");
}
function switchEl(): HTMLElement {
  return screen.getByTestId("published-toggle");
}

describe("PublishedToggle — mode boundaries", () => {
  it("Live → ON, enabled, active sub-line", () => {
    renderToggle({ published: true });
    expect(switchEl().getAttribute("aria-checked")).toBe("true");
    expect(switchEl().hasAttribute("disabled")).toBe(false);
    expect(row().textContent).toContain("Crew link is active.");
  });

  it("Held → OFF, enabled, off sub-line", () => {
    renderToggle({ published: false });
    expect(switchEl().getAttribute("aria-checked")).toBe("false");
    expect(switchEl().hasAttribute("disabled")).toBe(false);
    expect(row().textContent).toContain("Crew link is off; nobody can open this show.");
  });

  it("Publishing… (finalize-owned, not published) → OFF, DISABLED, publish-finishing explainer", () => {
    renderToggle({ published: false, finalizeOwned: true });
    expect(switchEl().getAttribute("aria-checked")).toBe("false");
    expect(switchEl().hasAttribute("disabled")).toBe(true);
    expect(row().textContent).toContain("A publish is finishing");
  });

  it("Live + finalize-owned → ON, DISABLED, changes-finalizing explainer (R2/R3)", () => {
    renderToggle({ published: true, finalizeOwned: true });
    expect(switchEl().getAttribute("aria-checked")).toBe("true");
    expect(switchEl().hasAttribute("disabled")).toBe(true);
    expect(row().textContent).toContain("Changes are being finalized");
  });

  it("the switch never self-disables synchronously in onClick (React 19 dispatch safety)", () => {
    renderToggle({ published: true });
    const onclick = switchEl().getAttribute("onclick") ?? "";
    expect(onclick).not.toMatch(/disabled\s*=\s*true/i);
  });
});

describe("PublishedToggle — action outcomes", () => {
  it("success → dispatches the OPPOSITE of the current state and refreshes", async () => {
    const setPublished = okAction();
    renderToggle({ published: true, setPublished });
    await act(async () => {
      fireEvent.click(switchEl());
    });
    expect(setPublished).toHaveBeenCalledWith(false); // was ON → next=false
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("PUBLISH_BLOCKED_PENDING_REVIEW → catalog copy renders INSIDE the toggle row; NO refresh (R10)", async () => {
    const setPublished = vi.fn(async () => ({
      ok: false as const,
      code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    }));
    renderToggle({ published: false, setPublished });
    await act(async () => {
      fireEvent.click(switchEl());
    });
    // Anti-tautology: assert within the row's own subtree only (no sibling can satisfy this).
    const error = row().querySelector('[data-testid="published-toggle-error"]');
    expect(error).not.toBeNull();
    const expected = messageFor("PUBLISH_BLOCKED_PENDING_REVIEW").dougFacing;
    expect(expected).toBeTruthy();
    expect(error?.textContent).toContain(expected);
    expect(error?.textContent).not.toContain("PUBLISH_BLOCKED_PENDING_REVIEW"); // invariant 5
    expect(routerRefresh).not.toHaveBeenCalled(); // R10: refresh would wipe this copy
  });

  it("infra_error / unmapped code → plain retry copy, no refresh", async () => {
    const setPublished = vi.fn(async () => ({ ok: false as const, code: "infra_error" }));
    renderToggle({ published: true, setPublished });
    await act(async () => {
      fireEvent.click(switchEl());
    });
    expect(row().querySelector('[data-testid="published-toggle-retry"]')).not.toBeNull();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

// ── CASP-2: inline variant (compact StatusStrip toggle) ──────────────────────
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
    renderToggle({ published: true }); // no variant → default card
    expect(screen.getByTestId("published-toggle-row")).toBeTruthy();
    expect(screen.queryByTestId("published-toggle-inline")).toBeNull();
    cleanup();
    render(
      <PublishedToggle
        slug="s1"
        variant="card"
        published={true}
        finalizeOwned={false}
        setPublished={okAction()}
      />,
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

  it("S2 refusal: error popover (role=alert) w/ catalog copy, NOT raw code, NO in-flow block, NO refresh", async () => {
    const setPublished = vi.fn(async () => ({
      ok: false as const,
      code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    }));
    renderInline({ published: false, setPublished });
    await act(async () => {
      fireEvent.click(screen.getByTestId("published-toggle"));
    });
    const pop = popover()!;
    expect(pop).not.toBeNull();
    // The live region is the INNER node: the outer div is the named scroll
    // region wrapping it (see the region/alert split case below).
    expect(pop.querySelector('[role="alert"]')).not.toBeNull();
    const expected = messageFor("PUBLISH_BLOCKED_PENDING_REVIEW").dougFacing!;
    expect(pop.textContent).toContain(expected);
    expect(pop.textContent).not.toContain("PUBLISH_BLOCKED_PENDING_REVIEW"); // invariant 5
    expect(screen.queryByTestId("published-toggle-error")).toBeNull(); // no in-flow block
    expect(routerRefresh).not.toHaveBeenCalled(); // R10
  });

  it("S3 generic error: retry popover with card's curly-apostrophe copy", async () => {
    const setPublished = vi.fn(async () => ({ ok: false as const, code: "infra_error" }));
    renderInline({ published: true, setPublished });
    await act(async () => {
      fireEvent.click(screen.getByTestId("published-toggle"));
    });
    const pop = popover()!;
    // The live region is the INNER node: the outer div is the named scroll
    // region wrapping it (see the region/alert split case below).
    expect(pop.querySelector('[role="alert"]')).not.toBeNull();
    expect(pop.textContent).toContain("That didn’t go through. Refresh and try again.");
  });

  it("S4a finalize (published): in-flow chip, role-less, aria-describedby wired, visible 'Finalizing…' + full sr-only copy", () => {
    renderInline({ published: true, finalizeOwned: true });
    const sw = screen.getByTestId("published-toggle");
    expect(sw.hasAttribute("disabled")).toBe(true);
    const chip = popover()!;
    expect(chip).not.toBeNull();
    expect(chip.hasAttribute("role")).toBe(false); // role-less, calm (NOT status/note/alert)
    const cls = chip.className.split(/\s+/);
    expect(cls).not.toContain("absolute"); // in-flow, not an absolute overlay
    expect(cls).toContain("bg-surface-sunken");
    expect(chip.textContent).toContain("Finalizing…"); // compact visible label
    expect(chip.textContent).toContain("Changes are being finalized"); // full copy (sr-only span)
    expect(sw.getAttribute("aria-describedby")).toBe(chip.getAttribute("id"));
    expect(chip.getAttribute("id")).toBe("published-toggle-popover-s1");
  });

  it("S4b finalize (not published): visible 'Publishing…' + 'A publish is finishing' sr-only, role-less, aria-describedby wired", () => {
    renderInline({ published: false, finalizeOwned: true });
    const sw = screen.getByTestId("published-toggle");
    expect(sw.hasAttribute("disabled")).toBe(true);
    const chip = popover()!;
    expect(chip.hasAttribute("role")).toBe(false);
    expect(chip.textContent).toContain("Publishing…");
    expect(chip.textContent).toContain("A publish is finishing");
    expect(sw.getAttribute("aria-describedby")).toBe(chip.getAttribute("id"));
  });

  it("S5: a refusal preserved across a finalize flip keeps the ERROR popover (error wins), switch disabled", async () => {
    const setPublished = vi.fn(async () => ({
      ok: false as const,
      code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    }));
    const { rerender } = renderInline({ published: false, finalizeOwned: false, setPublished });
    await act(async () => {
      fireEvent.click(screen.getByTestId("published-toggle"));
    });
    // sibling soft-refresh flips finalizeOwned true; rerender the SAME instance so the local
    // errorCode useState is preserved (models router.refresh's soft, state-preserving behavior).
    rerender(
      <PublishedToggle
        slug="s1"
        variant="inline"
        published={false}
        finalizeOwned={true}
        setPublished={setPublished}
      />,
    );
    const pop = popover()!;
    // error wins, not the finalize hint; the live region is the inner node
    expect(pop.querySelector('[role="alert"]')).not.toBeNull();
    expect(pop.textContent).toContain(messageFor("PUBLISH_BLOCKED_PENDING_REVIEW").dougFacing!);
    expect(screen.getByTestId("published-toggle").hasAttribute("disabled")).toBe(true);
  });

  it("inline B1 dispatch-safety: clicking the enabled switch actually dispatches the form action", async () => {
    const setPublished = vi.fn(async () => ({ ok: true as const }));
    renderInline({ published: true, finalizeOwned: false, setPublished });
    const sw = screen.getByTestId("published-toggle");
    expect(sw.getAttribute("type")).toBe("submit");
    expect(sw.closest("form")).not.toBeNull();
    expect(sw.hasAttribute("disabled")).toBe(false); // enabled at rest
    await act(async () => {
      fireEvent.click(sw);
    });
    expect(setPublished).toHaveBeenCalledTimes(1);
    expect(setPublished).toHaveBeenCalledWith(false); // flipped from published:true
  });

  it("error skin keeps the absolute banner; finalize skin is an in-flow chip (mechanism split)", async () => {
    const POSITION = [
      "absolute",
      "inset-x-0",
      "top-full",
      "z-banner",
      "mt-1",
      // `wrap-break-word` is Tailwind v4's canonical spelling of the old
      // `break-words`; the rule reported the rename once the const moved inside
      // `cn(...)` and became visible to it (quick-wins-2 §2.3).
      "wrap-break-word",
      // The banner is a capped SCROLL REGION now (spec §4.3): useFitWithinClip
      // writes its max-height, so the overflow has to be scrollable rather than
      // clipped away. The x axis is pinned explicitly because `overflow-y: auto`
      // forces the other axis's `visible` to compute to `auto`, which would give
      // the banner a horizontal scroll range it never asked for.
      "overflow-x-hidden",
      "overflow-y-auto",
      "rounded-sm",
      "p-2",
      "text-sm",
      "shadow-tile",
    ]; // === POPOVER_POSITION tokens (ERROR banner only, post-split)
    const ERROR_SKIN = new Set([
      "border",
      "border-border-strong",
      "bg-warning-bg",
      "text-warning-text",
      // tabIndex={0} puts the banner in the tab order, so it needs a visible
      // focus indicator (spec §4.3).
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-focus-ring",
      "focus-visible:ring-inset",
    ]);
    // Finalize chip must carry NONE of the absolute-geometry tokens (it is in-flow, CASP2-4 item 1).
    const ABSOLUTE_GEOMETRY = ["absolute", "inset-x-0", "top-full", "z-banner", "mt-1"];
    const FINALIZE_SKIN = ["bg-surface-sunken", "border-border", "text-xs", "text-text-subtle"];
    // Fixed FORBIDDEN (prior test anchored `$` right after `max-w-`/`min-w-`, so a real `max-w-60`
    // never matched): prefix-match width caps + single-side anchors so any regression trips it.
    const FORBIDDEN =
      /^(left-0|right-0|left-\d|right-\d|w-max|w-\d+|max-w-\S+|min-w-\S+|translate-x-)/;

    // Finalize chip (in-flow).
    const { unmount } = renderInline({ published: true, finalizeOwned: true });
    const chipTokens = popover()!.className.split(/\s+/).filter(Boolean);
    for (const t of ABSOLUTE_GEOMETRY) {
      expect(chipTokens, `finalize chip must be in-flow, not carry ${t}`).not.toContain(t);
    }
    for (const t of FINALIZE_SKIN) {
      expect(chipTokens, `finalize chip missing skin token ${t}`).toContain(t);
    }
    expect(popover()!.hasAttribute("role"), "finalize chip is role-less (calm)").toBe(false);
    // Transition-audit: the finalize chip is INSTANT (spec §6) — no animation utility on it.
    expect(
      chipTokens.some((t) => t.startsWith("animate-")),
      "finalize chip must not animate",
    ).toBe(false);
    unmount();

    // Error banner (absolute full-width, unchanged).
    const setPublished = vi.fn(async () => ({
      ok: false as const,
      code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    }));
    renderInline({ published: false, setPublished });
    await act(async () => {
      fireEvent.click(screen.getByTestId("published-toggle"));
    });
    const errorTokens = popover()!.className.split(/\s+/).filter(Boolean);
    for (const t of POSITION) {
      expect(errorTokens, `error banner missing ${t}`).toContain(t);
    }
    const errorExtra = errorTokens.filter((t) => !POSITION.includes(t));
    expect(new Set(errorExtra)).toEqual(ERROR_SKIN);
    for (const t of errorTokens) {
      expect(t, `forbidden geometry class ${t} on error banner`).not.toMatch(FORBIDDEN);
    }
  });
});

describe("settings variant (spec 2026-07-24-strip-mobile-stacked-band §3 R1)", () => {
  function renderSettings(
    over: Partial<{
      published: boolean;
      finalizeOwned: boolean;
      setPublished: (n: boolean) => Promise<{ ok: true } | { ok: false; code: string }>;
    }> = {},
  ) {
    return render(
      <PublishedToggle
        slug="s1"
        variant="settings"
        published={over.published ?? true}
        finalizeOwned={over.finalizeOwned ?? false}
        setPublished={over.setPublished ?? (async () => ({ ok: true }) as const)}
      />,
    );
  }

  it("renders ONE switch; responsive container classes; both label blocks breakpoint-gated", () => {
    renderSettings({ published: true });
    expect(screen.getAllByTestId("published-toggle")).toHaveLength(1);
    const container = screen.getByTestId("published-toggle-inline");
    for (const cls of [
      "max-sm:flex",
      "max-sm:w-full",
      "max-sm:min-h-tap-min",
      "max-sm:items-center",
      "max-sm:justify-between",
    ]) {
      expect(container.className).toContain(cls);
    }
    const desktopLabel = within(container)
      .getAllByText("Published", { selector: "span" })
      .find((el) => el.className.includes("max-sm:hidden"));
    expect(desktopLabel).toBeDefined();
    const mobileBlock = screen.getByTestId("published-toggle-sublabel").parentElement!;
    expect(mobileBlock.className).toContain("hidden");
    expect(mobileBlock.className).toContain("max-sm:flex");
    expect(mobileBlock.className).toContain("max-sm:min-w-0");
    expect(mobileBlock.className).toContain("max-sm:flex-col");
  });

  it("sublabel branches: visible / hidden / both finalize sublines; truncate; no id", () => {
    renderSettings({ published: true });
    const sub = screen.getByTestId("published-toggle-sublabel");
    expect(sub.textContent).toBe("Visible to crew");
    expect(sub.className).toContain("truncate");
    expect(sub.hasAttribute("id")).toBe(false);
    cleanup();
    renderSettings({ published: false });
    expect(screen.getByTestId("published-toggle-sublabel").textContent).toBe("Hidden from crew");
    cleanup();
    renderSettings({ published: true, finalizeOwned: true });
    expect(screen.getByTestId("published-toggle-sublabel").textContent).toBe(
      "Changes are being finalized; the switch unlocks when they commit.",
    );
    cleanup();
    renderSettings({ published: false, finalizeOwned: true });
    expect(screen.getByTestId("published-toggle-sublabel").textContent).toBe(
      "A publish is finishing; the switch unlocks when it's done.",
    );
  });

  it("aria-describedby rule UNCHANGED: absent normally; popover id under finalize", () => {
    renderSettings({ published: true });
    expect(screen.getByTestId("published-toggle").hasAttribute("aria-describedby")).toBe(false);
    cleanup();
    renderSettings({ published: true, finalizeOwned: true });
    expect(screen.getByTestId("published-toggle").getAttribute("aria-describedby")).toBe(
      "published-toggle-popover-s1",
    );
  });

  it("finalize chip desktop-only; refusal banner class-identical to inline's", async () => {
    renderSettings({ published: true, finalizeOwned: true });
    expect(screen.getByTestId("published-toggle-popover").className).toContain("max-sm:hidden");
    cleanup();
    const failing = async () => ({ ok: false as const, code: "PUBLISH_BLOCKED_PENDING_REVIEW" });
    renderInline({ published: true, setPublished: failing });
    fireEvent.click(screen.getByTestId("published-toggle"));
    const inlineCls = (await screen.findByTestId("published-toggle-popover")).className;
    cleanup();
    renderSettings({ published: true, setPublished: failing });
    fireEvent.click(screen.getByTestId("published-toggle"));
    const settingsCls = (await screen.findByTestId("published-toggle-popover")).className;
    expect(settingsCls).toBe(inlineCls);
  });

  it("compound: switch disables during its own pending without touching sublabel copy", async () => {
    let resolveAction!: (v: { ok: true }) => void;
    renderSettings({
      published: true,
      setPublished: () =>
        new Promise((r) => {
          resolveAction = r;
        }),
    });
    fireEvent.click(screen.getByTestId("published-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("published-toggle").getAttribute("aria-busy")).toBe("true"),
    );
    expect(screen.getByTestId("published-toggle-sublabel").textContent).toBe("Visible to crew");
    await act(async () => {
      resolveAction({ ok: true });
    });
  });
});

/**
 * Clip-fit + scrollable-region contract for the anchored refusal banner
 * (spec 2026-08-01-admin-popover-overlay-cluster §4.3, §8, §9 obligation 3).
 *
 * The banner is absolutely anchored inside the sticky strip, which sits inside
 * the review modal's overflow-clip panel. Real geometry lives in
 * tests/e2e/popover-clip-fit.spec.ts; what is provable here is that the banner
 * declares itself a named, tabbable, scrollable region and takes the fit.
 */
describe("PublishedToggle — refusal banner clip fit (§4.3)", () => {
  const CAP_PX = 384;
  const CLIP_BOTTOM = 560;
  const BANNER_TOP = 230;

  let geometry: { bannerTop: number; clipBottom: number };

  function installLayoutStubs() {
    geometry = { bannerTop: BANNER_TOP, clipBottom: CLIP_BOTTOM };
    const clip = document.createElement("div");
    clip.setAttribute("data-clip-ancestor", "");
    document.body.appendChild(clip);

    const realComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (el: Element, pseudo?: string | null) => {
        const real = realComputedStyle(el, pseudo ?? undefined);
        const isClip = el.hasAttribute?.("data-clip-ancestor") ?? false;
        const isBanner = el.getAttribute?.("data-testid") === "published-toggle-popover";
        return new Proxy(real, {
          get(target, key) {
            if (key === "overflowX" || key === "overflowY") return isClip ? "clip" : "visible";
            if (key === "maxHeight" && isBanner) return `${CAP_PX}px`;
            const value = Reflect.get(target, key) as unknown;
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      },
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const isClip = this.hasAttribute?.("data-clip-ancestor") ?? false;
      const top = isClip ? 0 : geometry.bannerTop;
      const bottom = isClip ? geometry.clipBottom : geometry.bannerTop + 100;
      return {
        left: 0,
        right: 300,
        width: 300,
        top,
        bottom,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => "",
      } as DOMRect;
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    return clip;
  }

  async function refuseInto(clip: HTMLElement) {
    render(
      <PublishedToggle
        slug="s1"
        variant="inline"
        published={false}
        finalizeOwned={false}
        setPublished={vi.fn(async () => ({ ok: false as const, code: "FINALIZE_OWNED_SHOW" }))}
      />,
      { container: clip },
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("published-toggle"));
    });
    return screen.getByTestId("published-toggle-popover");
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("the scroll region is named by the error copy, and the alert carries no author name", async () => {
    const clip = installLayoutStubs();
    const banner = await refuseInto(clip);

    // The tabbable SCROLL REGION and the LIVE REGION are separate nodes.
    // Collapsed onto one, the region's author name competes with its own
    // contents for the announcement, and an operator can hear a generic label
    // instead of the reason the publish was refused. ReSyncButton already
    // splits them for exactly this reason.
    expect(banner.getAttribute("role")).toBe("group");
    expect(banner.tabIndex).toBe(0);
    expect(banner.className).toContain("overflow-y-auto");
    // `overflow-y: auto` forces the other axis's `visible` to compute to
    // `auto`, so the banner silently gains a horizontal scroll range it never
    // wanted. Pin the axis explicitly.
    expect(banner.className).toContain("overflow-x-hidden");
    expect(
      banner.getAttribute("aria-label"),
      "a static author name on the region can shadow the error copy",
    ).toBeNull();

    // Named BY THE ERROR TEXT, so the region's name can never diverge from
    // what is actually displayed.
    const labelledBy = banner.getAttribute("aria-labelledby");
    expect(labelledBy, "the region must be named by its own contents").toBeTruthy();
    const alert = banner.ownerDocument.getElementById(labelledBy ?? "");
    expect(alert, "aria-labelledby must resolve to a real node").not.toBeNull();
    expect(
      alert !== null && banner.contains(alert),
      "the naming node must live inside the region it names",
    ).toBe(true);
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(
      alert?.getAttribute("aria-label"),
      "the live region must announce its contents, not an author name",
    ).toBeNull();
    expect(alert?.textContent?.trim()).not.toBe("");
  });

  it("the banner is capped against the clip ancestor", async () => {
    const clip = installLayoutStubs();
    const banner = await refuseInto(clip);
    const expected = `${computeFittedMaxHeight({
      elementTop: geometry.bannerTop,
      clipBottom: geometry.clipBottom,
      cap: CAP_PX,
    })}px`;
    expect(banner.style.maxHeight).toBe(expected);
    expect(banner.style.maxHeight, "wrote the CSS cap, so nothing was fitted").not.toBe(
      `${CAP_PX}px`,
    );
  });

  it("the finalize chip and the idle state are untouched (instant, classes as today)", () => {
    render(
      <PublishedToggle
        slug="s1"
        variant="inline"
        published={true}
        finalizeOwned={true}
        setPublished={okAction()}
      />,
    );
    // Mode boundary (spec §4.3): the finalize hint SHARES the popover testid but
    // is an IN-FLOW chip, not the anchored overlay. The scroll-region treatment
    // belongs to the error branch alone — a chip that acquired tabIndex or a
    // fitted cap would put a non-scrolling element in the tab order.
    const chip = screen.getByTestId("published-toggle-popover");
    expect(chip.tagName).toBe("SPAN");
    expect(chip.getAttribute("role")).toBeNull();
    expect(chip.getAttribute("aria-label")).toBeNull();
    expect(chip.getAttribute("tabindex")).toBeNull();
    expect(chip.className).not.toContain("overflow-y-auto");
    expect(chip.style.maxHeight).toBe("");
    const inline = screen.getByTestId("published-toggle-inline");
    expect(inline.textContent).toContain("Published");
  });
});
