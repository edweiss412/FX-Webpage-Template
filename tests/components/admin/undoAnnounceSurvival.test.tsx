// @vitest-environment jsdom
//
// Task 8 — survival probes (spec §11).
//
// Each probe names a branch that a review round PROVED could replace a
// per-surface region. Under the layout/dialog owner none of them may.
//
// Every probe captures the region node first and asserts `toBe` on it
// afterwards. Text equality alone is not acceptable here: it passes even when
// the original region was destroyed and a populated replacement mounted, which
// is the exact failure mode round 2 caught in an earlier draft's probes.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminAnnounceProvider } from "@/components/admin/AdminAnnounceProvider";
import { ChangesFeed } from "@/components/admin/ChangesFeed";
import { RecentAutoAppliedStrip } from "@/components/admin/RecentAutoAppliedStrip";
import type { RecentAutoApplied } from "@/lib/admin/loadRecentAutoApplied";

afterEach(cleanup);

const now = new Date("2026-06-09T12:00:00Z");
const noop = vi.fn();
const acceptNoop = vi.fn(async () => ({ ok: true as const, count: 1 }));
const SUMMARY = "Crew member Alice Chen removed";
const ANNOUNCED = `Undone. \"${SUMMARY}\" no longer applies.`;

const undoableEntry = {
  id: "e1",
  occurredAt: "2026-06-09T10:00:00Z",
  status: "applied" as const,
  action: "undo" as const,
  changeLogId: "log-1",
  summary: SUMMARY,
  entityRef: null,
  acceptable: false,
  acknowledgedAt: null,
};

/** Same entry after a successful undo: the read path flips it to action:'none'
 *  because status leaves 'applied' (shapeChangeFeed.ts:65). */
const undoneEntry = { ...undoableEntry, action: "none" as const, status: "undone" as const };

const feed = (entries: unknown[]) => (
  <ChangesFeed
    entries={entries as never}
    truncated={false}
    now={now}
    showId="show-1"
    undoAction={vi.fn().mockResolvedValue({ ok: true })}
    acceptAction={acceptNoop}
    acceptAllAction={acceptNoop}
    approveAction={noop}
    rejectAction={noop}
  />
);

const stripActions = () => ({
  acceptChangeAction: vi.fn().mockResolvedValue({ ok: true }),
  acceptAllAction: vi.fn().mockResolvedValue({ ok: true }),
  undoFromDashboardAction: vi.fn().mockResolvedValue({ ok: true }),
});

const stripOk = (): Extract<RecentAutoApplied, { kind: "ok" }> => ({
  kind: "ok",
  renderedCount: 1,
  overflowCount: 0,
  rosterShiftByShow: {},
  groups: [
    {
      showId: "show-1",
      slug: "s1",
      showName: "Show One",
      acceptableIds: [],
      undoableIds: ["r1"],
      rows: [
        {
          id: "r1",
          changeKind: "crew_removed",
          summary: SUMMARY,
          occurredAt: "2026-06-09T10:00:00Z",
          undoable: true,
          // Shape copied from the strip's own fixture rather than hand-rolled:
          // StripRow reads row.diff.kind, so an invented row crashes on render.
          diff: { kind: "single", caption: "Removed", value: "Alice Chen" },
        },
      ],
    },
  ],
});

const stripEmpty = (): Extract<RecentAutoApplied, { kind: "ok" }> => ({
  kind: "ok",
  renderedCount: 0,
  overflowCount: 0,
  rosterShiftByShow: {},
  groups: [],
});

const wrap = (children: React.ReactNode) => (
  <AdminAnnounceProvider testId="admin-undo-status" label="Undo updates">
    {children}
  </AdminAnnounceProvider>
);

const regionNode = () => screen.getByTestId("admin-undo-status");

it("probe 1: strip empties to zero groups after the undo", async () => {
  // The original F1 sequence: the undone row leaves the applied result set, the
  // group empties, and the strip returns null. Under a strip-owned region this
  // destroyed the announcement.
  const { rerender } = render(
    wrap(<RecentAutoAppliedStrip data={stripOk()} actions={stripActions()} defaultExpanded />),
  );
  const before = regionNode();
  await act(async () => {
    fireEvent.click(screen.getAllByTestId("change-feed-undo")[0]!);
  });
  rerender(
    wrap(<RecentAutoAppliedStrip data={stripEmpty()} actions={stripActions()} defaultExpanded />),
  );
  expect(regionNode()).toBe(before);
  expect(before).toHaveTextContent(ANNOUNCED);
  expect(screen.queryByTestId("recent-auto-applied-strip")).toBeNull();
});

it("probe 2: strip re-renders to zero groups WHILE the action is unresolved", async () => {
  // The narrower race: a continuation running after its own surface is gone.
  let resolve!: (v: { ok: true }) => void;
  const actions = stripActions();
  actions.undoFromDashboardAction = vi.fn(
    () => new Promise<{ ok: true }>((r) => (resolve = r)),
  ) as never;
  const { rerender } = render(
    wrap(<RecentAutoAppliedStrip data={stripOk()} actions={actions} defaultExpanded />),
  );
  const before = regionNode();
  act(() => {
    fireEvent.click(screen.getAllByTestId("change-feed-undo")[0]!);
  });
  rerender(wrap(<RecentAutoAppliedStrip data={stripEmpty()} actions={actions} defaultExpanded />));
  await act(async () => {
    resolve({ ok: true });
  });
  expect(regionNode()).toBe(before);
  expect(before).toHaveTextContent(ANNOUNCED);
});

it("probe 3: strip flips to its infra_error rendering mid-action", async () => {
  let resolve!: (v: { ok: true }) => void;
  const actions = stripActions();
  actions.undoFromDashboardAction = vi.fn(
    () => new Promise<{ ok: true }>((r) => (resolve = r)),
  ) as never;
  const { rerender } = render(
    wrap(<RecentAutoAppliedStrip data={stripOk()} actions={actions} defaultExpanded />),
  );
  const before = regionNode();
  act(() => {
    fireEvent.click(screen.getAllByTestId("change-feed-undo")[0]!);
  });
  rerender(
    wrap(
      <RecentAutoAppliedStrip
        data={{ kind: "infra_error", message: "read failed" } as never}
        actions={actions}
        defaultExpanded
      />,
    ),
  );
  await act(async () => {
    resolve({ ok: true });
  });
  expect(regionNode()).toBe(before);
  expect(before).toHaveTextContent(ANNOUNCED);
});

it("probe 4: the feed row flips to action:'none' after the undo", async () => {
  // The feed's own version: the button unmounts, the section does not.
  const { rerender } = render(wrap(feed([undoableEntry])));
  const before = regionNode();
  await act(async () => {
    fireEvent.click(screen.getByTestId("change-feed-undo"));
  });
  rerender(wrap(feed([undoneEntry])));
  expect(regionNode()).toBe(before);
  expect(before).toHaveTextContent(ANNOUNCED);
  expect(screen.queryByTestId("change-feed-undo")).toBeNull();
});

it("probe 5: the feed is replaced wholesale by its infra-error rendering", async () => {
  // ChangesSection.tsx:60 chooses between the error rendering and <ChangesFeed>
  // on feed === null, which replaced a ChangesFeed-owned region.
  const { rerender } = render(wrap(feed([undoableEntry])));
  const before = regionNode();
  await act(async () => {
    fireEvent.click(screen.getByTestId("change-feed-undo"));
  });
  rerender(wrap(<p data-testid="change-feed-infra-error">could not load</p>));
  expect(regionNode()).toBe(before);
  expect(before).toHaveTextContent(ANNOUNCED);
  expect(screen.getByTestId("change-feed-infra-error")).toBeInTheDocument();
});

it("probe 6: the layout's own branch flips to a DIFFERENT return's provider", async () => {
  // §3.5's central claim: the provider wraps EACH layout return. The earlier
  // version of this probe mounted ONE provider and swapped only children, which
  // is probes 1-5's shape and stays green even if a wrapper is deleted from
  // layout.tsx. This models the real thing: each branch renders its OWN provider
  // element at the same position, so React reconciles them as the same element
  // type and the region node must survive the swap.
  const branchA = (
    <AdminAnnounceProvider testId="admin-undo-status" label="Undo updates">
      <div data-testid="admin-layout">{feed([undoableEntry])}</div>
    </AdminAnnounceProvider>
  );
  const branchB = (
    <AdminAnnounceProvider testId="admin-undo-status" label="Undo updates">
      <div data-testid="admin-layout-infra-error">Admin session unavailable</div>
    </AdminAnnounceProvider>
  );
  const { rerender } = render(branchA);
  const before = regionNode();
  await act(async () => {
    fireEvent.click(screen.getByTestId("change-feed-undo"));
  });
  rerender(branchB);
  expect(regionNode()).toBe(before);
  expect(before).toHaveTextContent(ANNOUNCED);
  expect(screen.getByTestId("admin-layout-infra-error")).toBeInTheDocument();
  expect(screen.queryByTestId("admin-layout")).toBeNull();
});

it("probe 7: two undos across two different branches both survive", async () => {
  // Compound: the region accumulates across successive branch changes rather
  // than losing history at each one.
  const { rerender } = render(wrap(feed([undoableEntry])));
  const before = regionNode();
  await act(async () => {
    fireEvent.click(screen.getByTestId("change-feed-undo"));
  });
  rerender(
    wrap(<RecentAutoAppliedStrip data={stripOk()} actions={stripActions()} defaultExpanded />),
  );
  await act(async () => {
    fireEvent.click(screen.getAllByTestId("change-feed-undo")[0]!);
  });
  expect(regionNode()).toBe(before);
  expect(Array.from(before.children)).toHaveLength(2);
});
