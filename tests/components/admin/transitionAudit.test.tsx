// @vitest-environment jsdom
// M12.2 Phase A Task 12 — transition audit (spec §10 inventory). Enumerates the
// transition treatment of every new admin surface and pins it:
//
//   | Live status dot      | CSS ping; DISABLED under prefers-reduced-motion   |
//   | Synced dot heartbeat | subtle CSS pulse on positive+pulse (sync surfaces); slower/smaller than the live ping; DISABLED under prefers-reduced-motion |
//   | Copy chip            | idle→copied→idle text swap, instant, no layout shift |
//   | Rotate / Reset       | preserve existing button-state behavior (no change) |
//   | Route enter          | INSTANT (V6 decision — no mount animation)        |
//   | Inbox empty↔populated| server-rendered — instant, no client transition   |
//   | Status pill / footer | server-rendered — instant, no client transition   |
//
// Compound: the copy-feedback timeout and the live-dot ping live in different
// components and share no state → no compound-transition hazard.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusIndicator } from "@/components/admin/StatusIndicator";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

afterEach(cleanup);

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

// No-motion admin surfaces: no client motion library, no AnimatePresence, no
// mount/route-enter animation. Most are server-rendered; the M12.13 undo
// islands (PublishedToggle) and the attention surfaces (AttentionBanner, AttentionMenu) are client components
// but are deliberately motion-free — pinned here so future framer drift on
// them surfaces as a clean test failure (spec §9 / T12 reviewer note).
const SERVER_RENDERED = [
  "components/admin/StatStrip.tsx",
  "components/admin/ShowsTable.tsx",
  "components/admin/NeedsAttentionInbox.tsx",
  "components/admin/StatusIndicator.tsx",
  "components/admin/Dashboard.tsx",
  "app/admin/show/[slug]/page.tsx",
  "components/admin/PublishedToggle.tsx",
  "components/admin/review/AttentionBanner.tsx",
  // show-alert-compact: the compact card shell and its two remaining adapters.
  // Listed so R9 (card-owned transitions are instant) cannot be violated on a
  // surface outside the original scan.
  "components/admin/CompactAlertCard.tsx",
  "components/admin/PerShowActionableWarnings.tsx",
  "components/admin/telemetry/HealthAlertsPanel.tsx",
  "components/admin/showpage/AttentionMenu.tsx",
  // admin-show-modal Task 7: the published review modal surface. All three are
  // client components but deliberately motion-free in SOURCE — the modal's
  // entrance/exit animation lives in app/globals.css keyframes hooked via
  // data-review-modal-scrim/-panel attributes (pinned by the shell's own
  // transition suite), never framer/AnimatePresence or mount-animation classes.
  "components/admin/showpage/PublishedReviewModal.tsx",
  "components/admin/review/ReviewModalShell.tsx",
  "components/admin/showpage/ShowReviewModalSkeleton.tsx",
  // gallery-global-scope-exclusion: the excluded panel gained a third
  // reason line. Its transition inventory is all-instant (it mounts and
  // unmounts with the already-untransitioned panel), so it is pinned here
  // rather than given an interaction test with no animation to observe.
  "components/admin/dev/SwitcherControls.tsx",
];

describe("transition audit (§10)", () => {
  it("live status dot pings, and the ping is disabled under prefers-reduced-motion", () => {
    render(<StatusIndicator status="live" label="Live" />);
    const dot = screen.getByTestId("status-dot-live");
    // The ping is a sibling within the same relative wrapper.
    const ping = dot.parentElement?.querySelector(".animate-ping");
    expect(ping, "live variant must render a ping element").not.toBeNull();
    expect(ping!.className).toMatch(/motion-reduce:hidden/);
  });

  it("non-live status has no ping (static dot only)", () => {
    render(<StatusIndicator status="positive" label="Synced" />);
    const dot = screen.getByTestId("status-dot-positive");
    expect(dot.parentElement?.querySelector(".animate-ping")).toBeNull();
  });

  it("positive+pulse renders the subtle heartbeat halo, disabled under prefers-reduced-motion", () => {
    // Sanctioned second animation (SYNC-PULSE-1): a slower/smaller heartbeat behind the
    // synced dot on the sync surfaces. Distinct from the live ping (never animate-ping) and
    // motion-reduce gated, same as the ping.
    render(<StatusIndicator status="positive" label="Synced" pulse />);
    const halo = screen.getByTestId("status-pulse-positive");
    expect(halo.className).toMatch(/animate-\[sync-heartbeat_/);
    expect(halo.className).not.toMatch(/animate-ping/); // it is NOT the live ping
    expect(halo.className).toMatch(/motion-reduce:hidden/);
  });

  it("the heartbeat pulse does not fire without the pulse flag (positive dot stays static)", () => {
    render(<StatusIndicator status="positive" label="Synced" />);
    expect(screen.queryByTestId("status-pulse-positive")).toBeNull();
  });

  it("StatusIndicator is a pure server component — no useState/useEffect (no shared timeout state)", () => {
    const s = src("components/admin/StatusIndicator.tsx");
    expect(s).not.toMatch(/useState|useEffect|"use client"/);
  });

  it("server-rendered admin surfaces use no client motion library / AnimatePresence (instant)", () => {
    for (const rel of SERVER_RENDERED) {
      const s = src(rel);
      expect(s, `${rel} must not import a client motion library`).not.toMatch(
        /framer-motion|motion\/react/,
      );
      expect(s, `${rel} must not use AnimatePresence`).not.toMatch(/AnimatePresence/);
    }
  });

  it("route enter is instant — no mount-animation classes on the new surfaces (V6)", () => {
    for (const rel of SERVER_RENDERED) {
      const s = src(rel);
      // No prototype route-enter/stagger mount animations. The only sanctioned motion on
      // these surfaces is the live-dot ping (`animate-ping`) and the synced-dot heartbeat
      // (`animate-[sync-heartbeat_…]`, SYNC-PULSE-1) — both inside StatusIndicator, both
      // status-dot micro-signals, not mount/route-enter transitions. Any OTHER arbitrary
      // `animate-[…]` (a route-enter, a stagger, a framer refugee) still fails here.
      // Also catches the tailwindcss-animate enter/exit utilities
      // (`animate-in`, `animate-out`, `fade-in-*`, `slide-in-*`, `zoom-in-*`):
      // they are mount animations by definition, and the original pattern —
      // arbitrary `animate-[…]` only — let them through. Verified by mutation
      // while adding the compact-card surfaces (show-alert-compact Task 6).
      const animateMatches = (
        s.match(
          /animate-\[[^\]]*\]|\banimate-(?:in|out)\b|\b(?:fade|slide|zoom|spin)-(?:in|out)-[\w./[\]-]+|route-enter|stagger/g,
        ) ?? []
      ).filter((m) => !m.startsWith("animate-[sync-heartbeat"));
      expect(animateMatches, `${rel} should have no mount/route-enter animation`).toEqual([]);
    }
  });

  it("copy chip swap is text-only, instant, no layout shift (ShareLinkCopyButton text toggle)", () => {
    // ShareLinkCopyButton swaps its label idle→copied within the SAME button
    // element (no element add/remove → no layout shift) and uses no AnimatePresence.
    const s = src("app/admin/show/[slug]/ShareLinkCopyButton.tsx");
    expect(s).not.toMatch(/AnimatePresence|framer-motion|motion\/react/);
    expect(s).toMatch(/Copied|Copy/);
  });
});

/**
 * Resolve-label intent swap (spec 2026-07-20-show-scoped-alert-copy-design §10).
 *
 * | idle → pending   | instant text swap inside an already-disabled button |
 * | pending → idle   | instant; existing failure behavior                  |
 * | pending → removed| inherits the card's existing exit; unchanged here    |
 * | idle → removed   | same exit; reachable when another surface resolves   |
 * | removed → *      | unreachable: a returning row is a fresh mount        |
 *
 * Compound case: resolveActionIntent is a pure function of `code`, so a card's
 * verb is fixed for its whole lifetime and cannot be re-read mid-transition.
 */
describe("resolve-label transitions", () => {
  it("concurrent pending cards keep their own verbs", async () => {
    const { PerShowAlertResolveButton } =
      await import("@/components/admin/PerShowAlertResolveButton");
    const { fireEvent, waitFor } = await import("@testing-library/react");
    const { vi } = await import("vitest");

    // BOTH resolves hang, so both cards sit pending simultaneously and neither
    // label can vanish before it is observed. An already-resolved second
    // promise would clear "Resolving…" before waitFor saw it — flaky, not
    // deterministic.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    const { getByTestId, queryByTestId, unmount } = render(
      <>
        <PerShowAlertResolveButton alertId="ta" slug="s" code="ROLE_FLAGS_NOTICE" />
        <PerShowAlertResolveButton alertId="tb" slug="s" code="AMBIGUOUS_EMAIL_BINDING" />
      </>,
    );

    expect(getByTestId("per-show-alert-resolve-ta")).toHaveTextContent(/^Confirm$/);
    expect(getByTestId("per-show-alert-resolve-tb")).toHaveTextContent(/^Mark resolved$/);

    fireEvent.click(getByTestId("per-show-alert-resolve-ta"));
    await waitFor(() =>
      expect(getByTestId("per-show-alert-resolve-ta")).toHaveTextContent(/^Confirming…$/),
    );

    // B transitions while A is mid-flight: the compound case from §10.
    fireEvent.click(getByTestId("per-show-alert-resolve-tb"));
    await waitFor(() =>
      expect(getByTestId("per-show-alert-resolve-tb")).toHaveTextContent(/^Resolving…$/),
    );

    // Read the LIVE nodes: neither adopted the other's verb while both were
    // pending together.
    expect(getByTestId("per-show-alert-resolve-ta")).toHaveTextContent(/^Confirming…$/);
    expect(getByTestId("per-show-alert-resolve-tb")).toHaveTextContent(/^Resolving…$/);

    // Teardown smoke check. RTL's unmount necessarily removes both nodes, so
    // this is not evidence about label lifetime; the interleaving above is.
    unmount();
    expect(queryByTestId("per-show-alert-resolve-ta")).toBeNull();
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// The refusal banner's transition inventory (spec
// 2026-08-25-review-modal-strip-dock §6). Asserted HERE, in the task that
// creates the states, rather than in a task of its own — a separate task could
// have no valid red for it, since the subject it would assert is created by
// this one, so a case authored afterwards passes the moment it is written and
// one authored beforehand leaves the tree red across a commit boundary. The
// rule's purpose is that the inventory gets asserted; this serves it.
//
// Rows A↔B and A↔C ("instant BY DESIGN") are already covered for this file by
// the SERVER_RENDERED sweep above, which bans motion libraries, AnimatePresence
// and mount-animation utilities across every listed surface. What that sweep
// does NOT pin is the banner's own `transition-` classes or the single-side
// invariant, so those are here. The compound rows that need real layout —
// one placement per resize frame, the entrance transform, a Re-sync overlay
// open at the same time — are exercised against a real browser in
// tests/e2e/popover-clip-fit.spec.ts and published-review-modal.interactions.spec.ts,
// because jsdom computes no geometry and could not tell those outcomes apart.
// ---------------------------------------------------------------------------
describe("refusal banner — transition inventory (§6)", () => {
  const banner = () => src("components/admin/PublishedToggle.tsx");

  it("A↔B and A↔C are instant: the banner skin declares no transition or animation", () => {
    // POPOVER_POSITION is the banner's own class const. A `transition-*` here
    // would animate a box whose left/top the module rewrites on every resize
    // frame, which is the layout-property animation DESIGN.md §5.4 bans.
    // THE WHOLE `cn(...)` CALL, not its first argument. Round 3 proved the
    // earlier regex fake by planting `transition-opacity` as a SECOND argument:
    // the capture group only ever saw the first string, so the test reported no
    // transition while one was declared. `cn()` takes any number of arguments
    // and conditional ones, so reading argument one pins nothing.
    const call = /const POPOVER_POSITION = cn\(([\s\S]*?)\n\);/.exec(banner())?.[1] ?? "";
    expect(call, "PREMISE: the skin const must be found, or this asserts nothing").not.toBe("");
    // PREMISE the premise: the captured text must contain a class we KNOW is
    // there, or an empty-ish match would satisfy every negative below.
    expect(call, "PREMISE: the captured call must hold the real skin").toMatch(/z-banner/);
    expect(call).not.toMatch(/\btransition-/);
    expect(call).not.toMatch(/\banimate-/);
    expect(call).not.toMatch(/\bduration-/);
  });

  it("B↔C: exactly ONE node carries data-popover-side, written and cleared in one place", () => {
    const s = banner();
    // ONE WRITE is the discriminating claim: two write sites would mean two
    // nodes could carry the attribute at once and a reader could not tell which
    // side won. CLEARS are a different matter and are asserted as "at least
    // one", deliberately loosened from "exactly one" — diff review round 1
    // added a second clear on the degenerate path, where a bare return used to
    // leave a stale side behind. Pinning the clear count would have made a
    // correctness fix look like a regression, which is the wrong thing for a
    // guard to do; what must stay unique is the write.
    const writes = s.match(/dataset\["popoverSide"\]\s*=/g) ?? [];
    const deletes = s.match(/delete\s+\w+\.dataset\["popoverSide"\]/g) ?? [];
    expect(writes, "exactly one write site for the side").toHaveLength(1);
    expect(deletes.length, "at least one clear site for the side").toBeGreaterThanOrEqual(1);
    // And exactly one PLACED node. Counting `data-testid` occurrences would be
    // wrong here and the first draft of this case got it wrong: the finalize
    // hint deliberately SHARES the popover testid while being an in-flow chip
    // (see "the finalize chip and the idle state are untouched" in
    // PublishedToggle.test.tsx), so there are two such elements by design and
    // they are mutually exclusive branches of one ternary. What must be unique
    // is the node the placement effect drives, which is the one holding the
    // body ref.
    const placed = s.match(/ref=\{bodyRef\}/g) ?? [];
    expect(placed, "exactly one node is placed by the effect").toHaveLength(1);
  });

  it("a resize burst schedules through the shared coalescer and cancels on unmount", () => {
    const s = banner();
    // The compound row "side changes mid-resize": every listener schedules
    // through createRafCoalescer, so a burst produces one applyPlacement per
    // frame rather than one per event. The cancel is what stops a pending
    // frame from firing into an unmounted tree.
    expect(s).toMatch(/createRafCoalescer\(applyPlacement\)/);
    expect(s).toMatch(/coalescer\.cancel\(\)/);
    // (TARGET, EVENT) PAIRS, not counts. Round 3 proved the count version fake
    // by turning the scroll removal into a DUPLICATE resize removal: three
    // additions, three removals, test green, one leaked scroll listener. A
    // count cannot see a mismatched target or event name, which is the only
    // interesting way this breaks.
    const pairs = (re: RegExp) =>
      [...s.matchAll(re)].map(([, target, event]) => `${target}:${event}`).sort();
    const added = pairs(/(\w+)\??\.addEventListener\(\s*"(\w+)"/g);
    const removed = pairs(/(\w+)\??\.removeEventListener\(\s*"(\w+)"/g);
    expect(added.length, "PREMISE: the effect must add listeners").toBeGreaterThan(0);
    expect(removed, `every (target, event) added is removed — added ${added.join(", ")}`).toEqual(
      added,
    );
  });
});
