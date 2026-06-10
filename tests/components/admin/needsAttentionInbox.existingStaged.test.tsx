// @vitest-environment jsdom
//
// Phase 6 T6.7b (PF31) — prove no legacy `existing_staged` inbox card can strand
// the operator after the Phase 2 cutover. The `existing_staged` card's
// "Open show →" Link targets /admin/show/{slug}, the per-show page whose live
// whole-parse review mount T6.7 removed. The new model never writes a live
// pending_sync and the cutover migration clears any pre-existing ones, so
// buildNeedsAttention — derived from the inbox's ACTUAL data source — can no
// longer emit an `existing_staged` item.
//
// Failure mode it catches: after cutover, a stale live pending_sync still surfaces
// an `existing_staged` "Open show" route to the removed review mount, stranding
// the operator on a page with no apply/discard.
//
// Anti-tautology: the feed is DERIVED from buildNeedsAttention with the
// post-cutover source (syncs: []), NOT a hand-built `existing_staged` fixture — a
// hardcoded item would force a render the live source can no longer produce.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildNeedsAttention } from "@/lib/admin/needsAttention";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";

afterEach(cleanup);

const now = new Date("2026-06-09T12:00:00Z");

describe("NeedsAttentionInbox — no legacy existing_staged route post-cutover (PF31)", () => {
  it("emits no existing_staged item when the live pending_syncs source is empty", () => {
    // Post-cutover source shape: the live pending_syncs feed (input.syncs) is
    // empty — the cutover cleared legacy rows AND the new decision rule never
    // writes a live pending_sync (Task 2.1). `existence` still spans shows, but
    // with no sync entries there is nothing to classify as existing_staged.
    const feed = buildNeedsAttention({
      ingestions: [],
      syncs: [],
      existence: {
        d1: { slug: "rpas", title: "RPAS Central", published: true, archived: false },
      },
      totalCounts: { ingestions: 0, syncs: 0 },
    });

    // The source itself produces zero existing_staged items.
    expect(feed.items.some((i) => i.variant === "existing_staged")).toBe(false);

    render(
      <NeedsAttentionInbox
        items={feed.items}
        totalCount={feed.totalCount}
        renderedCount={feed.renderedCount}
        overflowCount={feed.overflowCount}
        now={now}
      />,
    );

    // No existing_staged card rendered…
    expect(screen.queryByTestId(/needs-attention-item-existing-/)).toBeNull();
    // …and no link points at a per-show route that expects a review mount.
    expect(screen.queryByTestId("needs-attention-link-rpas")).toBeNull();
  });
});
