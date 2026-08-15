// Holds rollup Task 9 (spec §9.14a) — the copy contract for the held-changes
// rollup. Two tiers, both source-walking (idiom: tests/help/sheetChangesCopy.test.ts):
//
//   PHRASE    — nine per-passage LITERAL anchors, one per edited passage. A
//               single regex provably cannot pin nine different word orders, and
//               a literal is what catches a well-meaning rewrite that drops the
//               held-changes mention entirely.
//   STRUCTURE — the dashboard inventory is a FIVE-bullet list (three kinds became
//               five); the sync-problem bullet must exist as its own bullet, not
//               a clause folded into another one.
//
// Normalization: bold markers stripped, whitespace collapsed — the tour sentence
// wraps across newlines in JSX (app/help/tour/page.mdx:31-34), so a raw match
// would fail on formatting alone (spec R8-M1).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = {
  dashboardTooltip: "components/admin/Dashboard.tsx",
  pageTooltip: "app/admin/needs-attention/page.tsx",
  dashboardHelp: "app/help/admin/dashboard/page.mdx",
  reviewQueues: "app/help/admin/review-queues/page.mdx",
  dailyRhythm: "app/help/daily-rhythm/page.mdx",
  settings: "app/help/admin/settings/page.mdx",
  tour: "app/help/tour/page.mdx",
} as const;

function raw(key: keyof typeof FILES): string {
  return readFileSync(FILES[key], "utf8");
}
function normalized(key: keyof typeof FILES): string {
  return raw(key).replaceAll("**", "").replace(/\s+/g, " ");
}

// The dashboard help page carries the inbox inventory ABOVE the "Changes and
// review" heading and the live-change passage BELOW it; slicing keeps each
// assertion scoped to the passage it is about, so a phrase landing in the wrong
// section fails instead of passing on a whole-file substring match.
function dashboardSlices(): { inventory: string; liveChange: string } {
  const text = raw("dashboardHelp");
  // The inventory is bounded on BOTH sides: the shows-table section above it
  // carries its own `- **` bullet list, so an open-ended slice would count
  // those too and the five-bullet assertion would pass on the wrong list.
  const start = text.indexOf('<h2 id="pending-ingestion">');
  const end = text.indexOf("## Changes and review");
  if (start === -1) throw new Error("dashboard help lost its pending-ingestion heading");
  if (end === -1) throw new Error("dashboard help lost its 'Changes and review' heading");
  return { inventory: text.slice(start, end), liveChange: text.slice(end) };
}

// review-queues carries the where-to-look TABLE above the "Live-show changes"
// section and the per-entry bullets below it.
function reviewQueuesSlices(): { table: string; bullets: string } {
  const text = raw("reviewQueues");
  const marker = '<h2 id="re-stage">Live-show changes</h2>';
  const at = text.indexOf(marker);
  if (at === -1) throw new Error("review-queues lost its 'Live-show changes' heading");
  return { table: text.slice(0, at), bullets: text.slice(at) };
}

function norm(text: string): string {
  return text.replaceAll("**", "").replace(/\s+/g, " ");
}

/**
 * The passage a phrase is supposed to live in, not the whole file. A whole-file
 * search passes when the copy is deleted from the rendered element and survives
 * in a comment, a sibling tooltip, or an unrelated section — every one of which
 * ships a page missing the sentence the test claims to guarantee.
 */
function between(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  if (start === -1) throw new Error(`passage start not found: ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`passage end not found: ${endMarker}`);
  return norm(text.slice(start, end));
}

/** The <p> body of a named HoverHelp tooltip. */
function tooltipBody(key: "dashboardTooltip" | "pageTooltip", testId: string): string {
  const src = raw(key);
  const at = src.indexOf(testId);
  if (at === -1) throw new Error(`tooltip ${testId} not found`);
  return between(src.slice(at), "<p>", "</p>");
}

describe("held-changes copy contract — phrase tier", () => {
  it("1. dashboard tooltip names held crew identity changes", () => {
    expect(tooltipBody("dashboardTooltip", '"needs-attention-help"')).toContain(
      "held crew identity changes",
    );
  });

  it("2. needs-attention page tooltip names held crew identity changes", () => {
    expect(tooltipBody("pageTooltip", '"needs-attention-page-help"')).toContain(
      "held crew identity changes",
    );
    // It must NOT claim every card awaits a decision: sync-problem cards carry no
    // decision control and clear themselves.
    const body = tooltipBody("pageTooltip", '"needs-attention-page-help"');
    expect(body).not.toContain("Everything waiting on a decision from you");
    expect(body).toMatch(/sync problems? appear here too/i);
  });

  it("3. dashboard help inventory carries the Held identity change bullet", () => {
    expect(norm(dashboardSlices().inventory)).toContain("Held identity change.");
  });

  it("4. dashboard help live-change passage points at the inbox", () => {
    expect(norm(dashboardSlices().liveChange)).toContain(
      "That held change also appears as a card in the Needs attention inbox",
    );
  });

  it("5. review-queues table row describes the hold", () => {
    expect(norm(reviewQueuesSlices().table)).toContain("held for your Approve or Reject");
  });

  it("6. review-queues identity bullet points at the inbox", () => {
    expect(norm(reviewQueuesSlices().bullets)).toContain(
      "It also appears in the Needs attention inbox until you decide.",
    );
  });

  it("7. daily-rhythm names it on the Needs attention BULLET, not just somewhere in the page", () => {
    const bullet = between(raw("dailyRhythm"), "- **Needs attention**", "\n-");
    expect(bullet).toContain("Held crew identity changes appear here too");
  });

  it("8. settings names it on the DAILY REVIEW DIGEST bullet", () => {
    const bullet = between(raw("settings"), "- **Daily review digest.**", "\n-");
    expect(bullet).toContain("crew identity changes that are held for your review");
  });

  it("9. tour names it inside the REVIEW QUEUES card", () => {
    // TWO anchors, and both are load-bearing. The card is selected by its
    // aria-label, and the BODY is then selected inside it by the body <p>'s
    // className. Neither spells rendered text: since the hydration fix every
    // text child in this card is a JSX expression child (`{"Review queues"}`),
    // because MDX parses an own-line text child as a markdown paragraph, so a
    // marker that spelled the heading broke on formatting alone. The
    // aria-label and the className are what that arc's AC-2 pins byte-identical.
    //
    // The body anchor is not decoration. Slicing from the aria-label to the
    // first `</p>` would widen the passage to the eyebrow, duration, and
    // heading as well — and this test's whole premise (see `between`) is that
    // a passage-scoped assertion must fail when the copy leaves the element
    // that is supposed to carry it. Probed: with the wide window, moving the
    // phrase from the body into the eyebrow keeps the assertion GREEN while
    // the body no longer explains anything.
    const tour = raw("tour");
    const cardAt = tour.indexOf('aria-label="Review queues: read the reference"');
    expect(cardAt, "review-queues card not found in the tour source").toBeGreaterThan(-1);
    // Bounded by THIS card's closing </a>. Without that bound the slice runs to
    // end-of-file, and every later card carries a body <p> with the same
    // className — so deleting this card's body and putting the phrase in a
    // sibling card leaves both assertions green. Probed.
    const cardEnd = tour.indexOf("</a>", cardAt);
    expect(cardEnd, "review-queues card is unterminated").toBeGreaterThan(-1);
    const card = tour.slice(cardAt, cardEnd);
    const body = between(card, '<p className="text-text leading-relaxed mb-3">', "</p>");
    expect(body).toContain("crew identity changes held for your approval");
    expect(body).not.toContain("Each queue is scoped to one show");
  });

  it("negatives: the stale one-show scoping claim and the absolute never-clears claim are gone", () => {
    // The rollup is cross-show, so "Each queue is scoped to one show" is now false.
    expect(normalized("tour")).not.toContain("Each queue is scoped to one show");
    // Sync-problem cards DO clear themselves, so the absolute claim is wrong.
    expect(norm(dashboardSlices().inventory)).not.toContain("Nothing here clears itself.");
    // review-queues now presents THREE rows, so the intro count must match.
    expect(normalized("reviewQueues")).toContain("Three kinds of change need your attention");
  });

  it("replacement behavior: BOTH auto-clear paths are named, not just the sync-problem one", () => {
    // The original copy claimed "Nothing here clears itself", which was false for
    // sync problems. The first repair said sheets and held changes "stay until you
    // act", which is false the other way: an open mi11_pending hold is DELETED
    // when the sheet reconciles to the held identity (mi11Reconciled -> deleteHold,
    // lib/sync/holds/holdAwareApply.ts:121-171), so a held change can leave the
    // inbox with no decision from Doug. Pin both halves so neither can regress.
    const { inventory } = dashboardSlices();
    expect(inventory).toMatch(/sync problem card goes once the sheet is readable again/i);
    expect(inventory).toMatch(/held change goes if the sheet is edited back/i);
    // and the absolute claim in either direction stays gone
    expect(norm(inventory)).not.toContain("Nothing here clears itself.");
    expect(norm(inventory)).not.toContain("stay in the inbox until you act on them");
  });
});

describe("held-changes copy contract — structure tier", () => {
  it("the dashboard inventory is a five-bullet list including its own sync-problem bullet", () => {
    const { inventory } = dashboardSlices();
    const bullets = inventory.match(/^- \*\*/gm) ?? [];
    expect(bullets).toHaveLength(5);
    expect(inventory).toMatch(/^- \*\*Sync problem\.\*\*/m);
  });
});
