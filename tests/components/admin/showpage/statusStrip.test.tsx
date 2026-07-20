// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/statusStrip.test.tsx (consolidated-admin-show-page Task 10)
 *
 * The pinned status strip (spec §4 element table, §6 mode matrix, §11 guards). The strip
 * is DISPLAY + 2 actions max (publish toggle, copy link); everything else lives in Overview.
 *
 * Failure modes caught:
 *   - live badge rendered when the show is not live (spec §4 "render only when live").
 *   - sync-age element rendered (as "never") when last_synced_at is null — the omit
 *     contract (spec §11): formatRelative("never") must NOT reach the DOM.
 *   - copy-link shown while the crew link is paused (unpublished) or archived, or with no
 *     token — a misleading dead link (spec §11 "no active share token → hidden").
 *   - archived strip still exposing the publish toggle / copy link (must be read-only),
 *     OR sneaking an Unarchive button into the strip (mock README delta 5: Unarchive is an
 *     Overview control; the strip caps at two actions).
 *   - an alert element coming BACK into the strip (modal-header-reconciliation §6.6
 *     relocated it to the modal header; rendered in both places = a duplicated count).
 *
 * Anti-tautology: sync/live/copy assertions scope INTO the element's own testid subtree so
 * a sibling that independently renders the same word (e.g. the toggle's "Published", the
 * copy button's "Copy") cannot satisfy them. Expected values derive from the props fixture.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { StatusStrip, type StatusStripProps } from "@/components/admin/showpage/StatusStrip";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
  usePathname: () => "/admin/show/east-coast-summit",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

/** Source path for the §6.5 dead-API scan (a deleted TS prop leaves no runtime trace). */
const STRIP_SRC = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "components/admin/showpage/StatusStrip.tsx",
);

// Fixed clock so formatRelative is deterministic. last_synced_at (Edited) 12 min before;
// last_checked_at (the badge time for `ok`) 2 min before — distinct so assertions can tell
// which field feeds which element.
const NOW = new Date("2026-07-16T12:00:00.000Z");
const SYNCED_12M = "2026-07-16T11:48:00.000Z";
const CHECKED_2M = "2026-07-16T11:58:00.000Z";

function baseProps(overrides: Partial<StatusStripProps> = {}): StatusStripProps {
  return {
    slug: "east-coast-summit",
    archived: false,
    published: true,
    finalizeOwned: false,
    setPublished: vi.fn(async () => ({ ok: true }) as const),
    isLive: false,
    lastSyncedAt: SYNCED_12M,
    lastCheckedAt: CHECKED_2M,
    lastSyncStatus: "ok",
    now: NOW,
    // share-hub T4: threaded through to <ShareHub>.
    showId: "11111111-2222-4333-8444-555555555555",
    crewEmails: [],
    showTitle: "East Coast Broadcast Summit",
    pickerCrew: [],
    ...overrides,
  };
}

function renderStrip(
  overrides: Partial<StatusStripProps> = {},
  { token = "TOK" as string | null, epoch = 5 } = {},
) {
  return render(
    <ShareTokenProvider initialToken={token} initialEpoch={epoch}>
      <StatusStrip {...baseProps(overrides)} />
    </ShareTokenProvider>,
  );
}

describe("StatusStrip", () => {
  // RETIRED (modal-header-reconciliation §6.5, Task 2): "renders the show title",
  // "renders the show title as the page's h1", and "falls back to the slug when
  // title is null". Their subject — the strip's internal `<h1 data-testid=
  // "strip-title">{title ?? slug}</h1>` and the `title` prop feeding it — is
  // deleted. The strip's only production render site is the published modal,
  // whose `<h2>` header owns the title; the `<h1>` branch was dead there and had
  // no other consumer. The replacement guard (the strip renders NO h1 and no
  // title text) lives in the "no internal title" describe below — retiring
  // without it would silently drop the single-title-node contract.

  it("renders the strip container", () => {
    renderStrip();
    expect(screen.getByTestId("show-status-strip")).toBeTruthy();
  });

  it("shows the live-now badge when the show is live", () => {
    renderStrip({ isLive: true });
    expect(within(screen.getByTestId("strip-live-badge")).getByText(/live now/i)).toBeTruthy();
  });

  it("hides the live-now badge when the show is not live", () => {
    renderStrip({ isLive: false });
    expect(screen.queryByTestId("strip-live-badge")).toBeNull();
  });

  it("wraps the existing PublishedToggle and reflects the published state", () => {
    renderStrip({ published: true });
    const wrapper = screen.getByTestId("strip-publish-toggle");
    const toggle = within(wrapper).getByTestId("published-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("renders the compact INLINE toggle (not the full card) in the strip (CASP-2)", () => {
    renderStrip({ published: true });
    const wrapper = screen.getByTestId("strip-publish-toggle");
    expect(within(wrapper).getByTestId("published-toggle-inline")).toBeTruthy();
    expect(within(wrapper).queryByTestId("published-toggle-row")).toBeNull();
    expect(within(wrapper).getByTestId("published-toggle").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  // share-hub T4: the standalone strip copy-link is RETIRED. Copy now lives
  // inside the hub popover, so a "hidden when unpublished/tokenless" contract no
  // longer applies to the strip — the hub renders in both lifecycles and gates
  // its own crew-link arm (covered by shareHub.test.tsx). What the strip owes is
  // below: the hub mounts for non-archived shows, is absent when archived, and
  // the retired testid is gone everywhere.
  describe("share hub (share-hub T4)", () => {
    it("mounts the hub right-flushed for a published, non-archived show", () => {
      renderStrip({ published: true, archived: false }, { token: "TOK" });
      const group = screen.getByTestId("share-hub-group");
      expect(within(group).getByTestId("share-hub-primary")).toBeTruthy();
      expect(within(group).getByTestId("share-hub-kebab")).toBeTruthy();
      expect(group.className).toContain("ml-auto");
    });

    it("mounts the hub for an UNPUBLISHED show (paused arm still offers rotate/reset)", () => {
      renderStrip({ published: false, archived: false }, { token: "TOK" });
      expect(screen.getByTestId("share-hub-primary").textContent).toMatch(/paused/i);
    });

    it("omits the hub entirely when archived (read-only)", () => {
      renderStrip({ archived: true }, { token: "TOK" });
      expect(screen.queryByTestId("share-hub-group")).toBeNull();
      expect(screen.queryByTestId("share-hub-primary")).toBeNull();
    });

    it("THREADS crewEmails / showTitle / pickerCrew all the way into the hub", () => {
      // The prop chain is _showReviewModal → PublishedReviewModal → StatusStrip
      // → ShareHub, and every downstream unit test supplies its own fixture. A
      // dropped prop anywhere in that chain would leave the email rows absent
      // and the reset control disabled with the whole suite still green, so the
      // threading is asserted end-to-end HERE, through the real hub.
      renderStrip(
        {
          published: true,
          archived: false,
          crewEmails: ["ann@example.com"],
          showTitle: "East Coast Broadcast Summit",
          pickerCrew: [{ id: "c1", name: "Ann", role: "A1" }],
        },
        { token: "TOK" },
      );
      fireEvent.click(screen.getByTestId("share-hub-primary"));

      const mailto = decodeURIComponent(
        screen.getByTestId("admin-current-share-link-email-button").getAttribute("href") ?? "",
      );
      expect(mailto, "crewEmails reached the builder").toContain("ann@example.com");
      expect(mailto, "showTitle reached the mailto subject").toContain(
        "East Coast Broadcast Summit",
      );
      // A non-empty roster leaves the everyone-reset ENABLED; an empty one
      // disables it, so this distinguishes threaded from dropped.
      expect((screen.getByTestId("picker-reset-all-button") as HTMLButtonElement).disabled).toBe(
        false,
      );
    });

    it("the retired strip-copy-link testid no longer renders in ANY lifecycle", () => {
      for (const props of [
        { published: true, archived: false },
        { published: false, archived: false },
        { archived: true },
      ]) {
        const { unmount } = renderStrip(props, { token: "TOK" });
        expect(screen.queryByTestId("strip-copy-link")).toBeNull();
        unmount();
      }
    });
  });

  describe("#share-access anchor (share-hub T4)", () => {
    // lib/adminAlerts/alertActions.ts:51 builds /admin?show=<slug>#share-access.
    // The anchor moved off OverviewSection onto the strip root so it survives
    // every lifecycle — including archived, where the hub itself is absent. A
    // conditional host would silently dead-link the alert action.
    it("is on the strip root in ALL THREE lifecycles", () => {
      for (const props of [
        { published: true, archived: false },
        { published: false, archived: false },
        { archived: true },
      ]) {
        const { unmount } = renderStrip(props, { token: "TOK" });
        const strip = screen.getByTestId("show-status-strip");
        expect(strip.getAttribute("id")).toBe("share-access");
        unmount();
      }
    });
  });

  describe("control divider (CASP2-4)", () => {
    it("renders the divider when the ONLY signal is isLive (isolates the isLive disjunct)", () => {
      // baseProps sets lastSyncedAt: SYNCED_12M — null it so ONLY isLive drives hasSignal;
      // a guard that dropped the isLive disjunct would still pass if sync co-fired.
      renderStrip({ isLive: true, lastSyncedAt: null });
      expect(screen.getByTestId("strip-control-divider")).toBeTruthy();
    });

    it("renders the divider when the only signal is the sync line (isolates the sync disjunct)", () => {
      renderStrip({ isLive: false, lastSyncedAt: SYNCED_12M });
      expect(screen.getByTestId("strip-control-divider")).toBeTruthy();
    });

    // REPLACES the pre-change case "renders the divider when the only signal is
    // an alert", whose premise INVERTED: the alert left the strip (§6.6), so
    // `alertCount > 0` is no longer a strip signal and keeping the disjunct
    // would draw a divider with NOTHING after it.
    //
    // This case can no longer construct the alerts-only input — `alertCount` is
    // not a StatusStrip prop any more — so it is a keep-green guard on the
    // remaining two disjuncts, NOT the red proof. T-DIVIDER-ALERT-ONLY lives at
    // the modal level (publishedReviewModal.test.tsx), the only surface that can
    // still pass an alert count in.
    it("omits the divider when the show has no signal (not live, never synced)", () => {
      renderStrip({ isLive: false, lastSyncedAt: null });
      expect(screen.queryByTestId("strip-control-divider")).toBeNull();
      // Nothing follows the toggle: no live badge, no sync line, no alert.
      expect(screen.queryByTestId("strip-live-badge")).toBeNull();
      expect(screen.queryByTestId("strip-sync-age")).toBeNull();
      expect(screen.queryByTestId("strip-alert-badge")).toBeNull();
    });

    it("omits the divider when archived, even if a sync signal would render", () => {
      renderStrip({ archived: true, lastSyncedAt: SYNCED_12M });
      expect(screen.queryByTestId("strip-control-divider")).toBeNull();
    });

    it("carries the responsive-suppression + decorative recipe", () => {
      renderStrip({ isLive: true, lastSyncedAt: null });
      const divider = screen.getByTestId("strip-control-divider");
      expect(divider.className).toContain("hidden");
      expect(divider.className).toContain("sm:block");
      expect(divider.getAttribute("aria-hidden")).toBe("true");
    });
  });

  // REWRITTEN from the "renderTitle" describe (modal-header-reconciliation §6.5,
  // Task 2). The prop is gone, so the suppression is no longer conditional — it
  // is the strip's only behavior. The INTENT (the strip contributes no title
  // node, so the dialog has exactly one title and no `<h1>`) is what survives,
  // and these are now unconditional guards against the `<h1>` branch coming back.
  describe("no internal title (modal-header-reconciliation §6.5)", () => {
    it("never renders an h1, a strip-title node, or the title text", () => {
      renderStrip();
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
      expect(screen.queryByTestId("strip-title")).toBeNull();
      // The title TEXT must not sneak in via another node (the modal's h2 owns
      // it). Scoped to the strip so a sibling cannot satisfy it.
      const strip = screen.getByTestId("show-status-strip");
      expect(within(strip).queryByText("East Coast Broadcast Summit")).toBeNull();
      // No orphan leading separator — the strip starts at the publish toggle.
      expect(screen.queryByTestId("strip-title-divider")).toBeNull();
    });

    it("PublishedToggle, live badge, and the share hub are untouched by the title removal", () => {
      renderStrip({ isLive: true, published: true }, { token: "TOK" });
      const wrapper = screen.getByTestId("strip-publish-toggle");
      expect(within(wrapper).getByTestId("published-toggle").getAttribute("aria-checked")).toBe(
        "true",
      );
      expect(screen.getByTestId("strip-live-badge")).toBeTruthy();
      expect(screen.getByTestId("share-hub-group")).toBeTruthy();
    });

    it("archived: the badge renders, still no h1 and no divider", () => {
      renderStrip({ archived: true, published: false });
      expect(screen.getByTestId("strip-archived-badge")).toBeTruthy();
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
      expect(screen.queryByTestId("strip-title-divider")).toBeNull();
    });
  });

  // T-RESYNC-MOVED / T-RESYNC-ARCHIVED, strip half (modal-header-reconciliation
  // §4.3 ratified amendment — the strip's action budget becomes 3). The Overview
  // half (no duplicate there) lives in overviewSection.test.tsx; both halves are
  // required, because "exactly one Re-sync" is what the amendment actually says.
  describe("Re-sync moved into the strip (§4.3 / §6.7)", () => {
    it("T-RESYNC-MOVED: the strip renders the Re-sync trigger, mounted with NO wrapper element", () => {
      renderStrip();
      const strip = screen.getByTestId("show-status-strip");
      const trigger = screen.getByTestId("admin-resync-button");
      // Failure mode: a `<div data-testid="strip-resync">` wrapper becomes the
      // flex item, so the row gap and `items-center` apply to the wrapper and
      // the absolute panels lose the band's full width — while every focus and
      // order test still passes. The trigger must be a DIRECT strip child.
      expect(trigger.parentElement, "Re-sync is a bare strip row item").toBe(strip);
      expect(screen.getAllByTestId("admin-resync-button")).toHaveLength(1);
    });

    it("DOM order is normative: Re-sync precedes the share hub (§10 confirm-proximity)", () => {
      // The hub group is right-flushed by `ml-auto`, so a hub-then-Re-sync DOM
      // order still LOOKS correct while producing the tab order toggle → hub →
      // Re-sync → confirm controls. This is an a11y contract, not a visual one.
      renderStrip();
      const kids = Array.from(screen.getByTestId("show-status-strip").children);
      const resyncIdx = kids.indexOf(screen.getByTestId("admin-resync-button"));
      const hubIdx = kids.indexOf(screen.getByTestId("share-hub-group"));
      expect(resyncIdx).toBeGreaterThanOrEqual(0);
      expect(hubIdx).toBeGreaterThan(resyncIdx);
    });

    it("T-RESYNC-ARCHIVED: an archived show gets NO Re-sync trigger (it mutates via /api/admin/sync)", () => {
      renderStrip({ archived: true });
      expect(screen.queryByTestId("admin-resync-button")).toBeNull();
    });

    it("an unpublished (held) show keeps Re-sync — only `archived` gates it", () => {
      // Anti-tautology: gating on `published` instead of `archived` would pass
      // the archived case above for the wrong reason.
      renderStrip({ published: false });
      expect(screen.getByTestId("admin-resync-button")).toBeTruthy();
    });
  });

  describe("archived (read-only)", () => {
    it("shows the archived badge and hides the toggle, copy-link, and live badge", () => {
      renderStrip({ archived: true, published: false, isLive: true }, { token: "TOK" });
      expect(screen.getByTestId("strip-archived-badge").textContent).toMatch(/read-only/i);
      expect(screen.queryByTestId("strip-publish-toggle")).toBeNull();
      expect(screen.queryByTestId("strip-copy-link")).toBeNull();
      expect(screen.queryByTestId("strip-live-badge")).toBeNull();
    });

    it("does NOT render an Unarchive button in the strip (Overview owns it — README delta 5)", () => {
      renderStrip({ archived: true, published: false }, { token: "TOK" });
      const strip = screen.getByTestId("show-status-strip");
      expect(within(strip).queryByText(/unarchive/i)).toBeNull();
    });
  });

  // RETIRED + REPLACED (modal-header-reconciliation §6.6, Task 5). The former
  // "alert badge" describe lost its SUBJECT: the badge moved to the modal
  // header as `published-show-review-alert-pill`, and `alertCount` is no longer
  // a StatusStrip prop at all. Every surviving assertion of intent — link to
  // #overview, singular/plural, the before:-inset-y tap-min extension, the
  // focus-ring offset — was carried to the pill's suite in
  // publishedReviewModal.test.tsx, NOT dropped. What remains here is the guard
  // that the badge does not come BACK: the strip must render no alert element
  // no matter what props it is given, or the count renders twice.
  describe("alert badge is gone from the strip (relocated to the header, §6.6)", () => {
    it("renders no alert element in ANY strip mode", () => {
      for (const overrides of [{}, { archived: true }, { isLive: true }, { published: false }]) {
        cleanup();
        renderStrip(overrides);
        const strip = screen.getByTestId("show-status-strip");
        expect(screen.queryByTestId("strip-alert-badge")).toBeNull();
        // Shape-level, not testid-level: a re-added badge under a NEW testid
        // would still be an #overview jump link inside the strip.
        expect(strip.querySelector('a[href="#overview"]')).toBeNull();
        expect(within(strip).queryByText(/\balerts?\b/i)).toBeNull();
      }
    });

    it("StatusStrip's props no longer carry alertCount (dead API deleted, §6.5)", () => {
      // A source scan, because a deleted TS prop is invisible to a runtime
      // assertion — vitest strips types. `pnpm typecheck` is the other half.
      //
      // Comments are stripped first: the file deliberately DOCUMENTS the removed
      // `alertCount > 0` disjunct so a future reader does not re-add it, and that
      // prose must not read as a live reference.
      const code = readFileSync(STRIP_SRC, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(code).not.toMatch(/alertCount/);
      // Non-vacuity: the comment-stripper must not have eaten the whole file.
      expect(code).toMatch(/export function StatusStrip/);
    });
  });

  describe("sync age", () => {
    it("omits the sync-age element entirely when last_synced_at is null (does not render 'never')", () => {
      renderStrip({ lastSyncedAt: null });
      expect(screen.queryByTestId("strip-sync-age")).toBeNull();
      expect(screen.queryByText(/never/i)).toBeNull();
    });

    it("shows 'Synced <relative>' using last_CHECKED_at (not last_synced_at) for the ok bucket", () => {
      // The Synced line time is the last successful Drive reach (2 min ago), NOT the last
      // content edit (12 min ago) — that is the stacked Edited line. Scope to the synced
      // line so the sibling Edited line (which holds 12 min ago) can't satisfy the assertion.
      renderStrip({ lastSyncedAt: SYNCED_12M, lastCheckedAt: CHECKED_2M, lastSyncStatus: "ok" });
      const synced = screen.getByTestId("strip-synced-line");
      expect(synced.textContent).toMatch(/synced/i);
      expect(synced.textContent).toMatch(/2 min ago/i);
      expect(synced.textContent).not.toMatch(/12 min ago/i);
    });

    it("falls back to last_synced_at for the synced-line time when last_checked_at is null", () => {
      renderStrip({ lastSyncedAt: SYNCED_12M, lastCheckedAt: null, lastSyncStatus: "ok" });
      const synced = screen.getByTestId("strip-synced-line");
      expect(synced.textContent).toMatch(/synced/i);
      expect(synced.textContent).toMatch(/12 min ago/i);
      expect(synced.textContent).not.toMatch(/never/i);
    });

    it("shows the health-bucket label (not 'Synced') when the last sync failed", () => {
      renderStrip({ lastSyncedAt: SYNCED_12M, lastSyncStatus: "parse_error" });
      const synced = screen.getByTestId("strip-synced-line");
      expect(synced.textContent).toMatch(/couldn.t read the sheet/i);
      expect(synced.textContent).not.toMatch(/synced/i);
    });

    it("colors the single health dot by sync health (bucket), not the edit time", () => {
      // ok → positive dot; a failing bucket → warn dot. The dot must track last_sync_status,
      // never last_synced_at/last_checked_at.
      const { rerender } = renderStrip({ lastSyncStatus: "ok" });
      expect(
        within(screen.getByTestId("strip-sync-age")).getByTestId("status-dot-positive"),
      ).toBeTruthy();
      rerender(
        <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
          <StatusStrip {...baseProps({ lastSyncStatus: "parse_error" })} />
        </ShareTokenProvider>,
      );
      expect(
        within(screen.getByTestId("strip-sync-age")).getByTestId("status-dot-warn"),
      ).toBeTruthy();
    });

    // REWRITTEN from "stacks Synced over Edited as two equally-weighted lines"
    // (modal-header-reconciliation §4.5, Task 8). The two-line column collapses
    // to ONE row: dot · "Synced {rel}" · 3px bullet · "Edited {rel}".
    //
    // The class clause below is the SHARED STRUCTURAL CLAUSE this describe's
    // three §4.5 cases all carry. It is what makes them genuinely red: an
    // implementer who restyles colors/order but leaves `flex-col` in place
    // passes every other status assertion (null-edited, error-bucket, dot
    // color, time source) while the headline delta is silently unimplemented.
    // jsdom computes no layout, so the real single-row geometry is asserted in
    // the browser by T-STATUS-INLINE (published-review-modal.layout.spec.ts);
    // this is its cheap, always-run structural counterpart.
    function expectSingleRowStatus(): HTMLElement {
      const line = screen.getByTestId("strip-status-line");
      expect(line.className).toMatch(/inline-flex/);
      expect(line.className).toMatch(/items-center/);
      expect(line.className).not.toMatch(/flex-col/);
      return line;
    }

    it("renders Synced and Edited on ONE row, equally weighted, separated by a 3px bullet", () => {
      renderStrip({ lastSyncedAt: SYNCED_12M, lastCheckedAt: CHECKED_2M, lastSyncStatus: "ok" });
      const line = expectSingleRowStatus();
      const synced = screen.getByTestId("strip-synced-line");
      const edited = screen.getByTestId("strip-edited-age");
      // Equal weight = same typography; they inherit the row's class rather than
      // setting per-line size/weight overrides.
      expect(synced.className).not.toMatch(/text-(xs|sm|base|lg)|font-/);
      expect(edited.className).not.toMatch(/text-(xs|sm|base|lg)|font-/);
      expect(synced.parentElement).toBe(line);
      expect(edited.parentElement).toBe(line);
      // The separator: 3px, pill, aria-hidden — the same atom as the header
      // subline's bullet (PublishedReviewModal.tsx:299-303), and decorative
      // (§9's decorative-dot rule), so it must never reach the a11y tree.
      const bullet = screen.getByTestId("strip-status-bullet");
      expect(bullet.getAttribute("aria-hidden")).toBe("true");
      expect(bullet.className).toMatch(/size-\[3px\]/);
      expect(bullet.className).toMatch(/rounded-pill/);
      // Bullet sits BETWEEN the two texts, not before or after both.
      const order = Array.from(line.children);
      expect(order.indexOf(synced)).toBeLessThan(order.indexOf(bullet));
      expect(order.indexOf(bullet)).toBeLessThan(order.indexOf(edited));
    });

    // T-STATUS-INLINE-NO-EDITED (§4.5's main NEW failure mode): the collapse
    // turns the stacked column's implicit separation into an explicit
    // separator, so the null-edited case can now strand it.
    it("renders ONE row with NO trailing bullet and no 'Edited' when editedRel is null", () => {
      // parse_error is in the showsEditedClause deny-set → editedRel === null
      // while the status element itself still renders.
      renderStrip({ lastSyncedAt: SYNCED_12M, lastSyncStatus: "parse_error" });
      const line = expectSingleRowStatus();
      expect(screen.queryByTestId("strip-edited-age")).toBeNull();
      expect(screen.queryByTestId("strip-status-bullet")).toBeNull();
      expect(line.textContent).not.toMatch(/edited/i);
    });

    // T-STATUS-ERROR-BUCKET — DECLARED PARTLY-RED (plan 03-resync.md:148).
    // The bucket behavior already exists (`syncLabel` resolves to the health
    // label for non-ok, `StatusDot` is keyed on the bucket), so this half is a
    // KEEP-GREEN guard against the collapse hardcoding the mock's green
    // "Synced just now" — one bucket of several. Its red comes from the shared
    // single-row structural clause above.
    it("shows the health label + bucket-colored dot (never 'Synced …') on one row for a non-ok bucket", () => {
      renderStrip({
        lastSyncedAt: SYNCED_12M,
        lastCheckedAt: CHECKED_2M,
        lastSyncStatus: "drive_error",
      });
      const line = expectSingleRowStatus();
      expect(line.textContent).not.toMatch(/synced/i);
      expect(screen.getByTestId("strip-synced-line").textContent).toMatch(/couldn.t reach/i);
      expect(
        within(screen.getByTestId("strip-sync-age")).getByTestId("status-dot-warn"),
      ).toBeTruthy();
    });
  });

  describe("edited age", () => {
    it("shows 'Edited <relative>' from last_synced_at, alongside the checked-time badge", () => {
      renderStrip({ lastSyncedAt: SYNCED_12M, lastCheckedAt: CHECKED_2M, lastSyncStatus: "ok" });
      const edited = screen.getByTestId("strip-edited-age");
      expect(edited.textContent).toMatch(/edited/i);
      expect(edited.textContent).toMatch(/12 min ago/i);
    });

    it("omits the edited element when last_synced_at is null (never edited)", () => {
      renderStrip({ lastSyncedAt: null });
      expect(screen.queryByTestId("strip-edited-age")).toBeNull();
    });

    it.each(["parse_error", "drive_error", "sheet_unavailable"])(
      "omits the edited element for the %s bucket (last_synced_at is an error stamp, not a content edit)",
      (status) => {
        renderStrip({ lastSyncedAt: SYNCED_12M, lastSyncStatus: status });
        expect(screen.queryByTestId("strip-edited-age")).toBeNull();
      },
    );

    it("keeps the edited element for a non-error warn bucket (shrink_held, not in the deny-set)", () => {
      renderStrip({ lastSyncedAt: SYNCED_12M, lastSyncStatus: "shrink_held" });
      expect(screen.getByTestId("strip-edited-age").textContent).toMatch(/edited/i);
    });
  });

  // REWRITTEN from the "chrome variant" describe (modal-header-reconciliation
  // §6.5, Task 2). The `chrome` prop is deleted and both arms collapse to ONE
  // layout literal — the `subHeader` band (ReviewModalShell.tsx) owns the
  // surface, the seam and the padding now.
  //
  // The "defaults to page chrome" case is RETIRED: the `page` arm ceases to
  // exist, so it has no subject. Its sibling is NOT retired — the intent (the
  // strip must not carry container chrome, which would double-seam and
  // double-pad the band) is the only guard against page chrome being re-added,
  // and retiring both would remove it silently.
  describe("container chrome", () => {
    const PAGE_ONLY_CHROME = [
      "sticky",
      "top-0",
      "z-30",
      "border-b",
      "border-border",
      "shadow-tile",
      "bg-surface",
      "px-4",
      "sm:px-6",
      "py-2",
    ];

    it("carries NO container chrome — the band supplies surface, seam and padding", () => {
      renderStrip();
      const classes = screen.getByTestId("show-status-strip").className.split(/\s+/);
      for (const token of PAGE_ONLY_CHROME) {
        expect(classes, `strip must not carry \`${token}\` (the band owns it)`).not.toContain(
          token,
        );
      }
    });

    it("keeps the strip layout (wrapping flex row, gaps, alignment)", () => {
      renderStrip();
      const classes = screen.getByTestId("show-status-strip").className.split(/\s+/);
      for (const token of [
        "flex",
        "flex-wrap",
        "items-center",
        "gap-x-4",
        "gap-y-2",
        "sm:flex-nowrap",
      ]) {
        expect(classes, `layout class \`${token}\` must survive the collapse`).toContain(token);
      }
    });
  });
});
