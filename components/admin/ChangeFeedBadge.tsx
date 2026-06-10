// Phase 6 T6.1 — ChangeFeedBadge (pure, presentational).
//
// Maps the canonical ChangeStatus (applied | pending | rejected | undone |
// superseded) to a { label, className } pair built from DESIGN.md tokens. The
// status is ALWAYS rendered as a real text node (never color-only) — the §1
// color-blind floor mirrored from StatusIndicator. The raw status string never
// lands in the DOM (invariant 5): the visible copy is a stable UI label, not the
// lowercase enum value.
//
// 'superseded' uses the quiet/muted tokens (bg-surface-sunken / text-text-subtle)
// so a replaced entry reads as inactive history, not an active state.

import type { ChangeStatus } from "@/lib/sync/holds/types";

// Literal class strings (not template-constructed) so Tailwind v4's content scan
// emits each utility into the built CSS.
const BADGE: Record<ChangeStatus, { label: string; title: string; className: string }> = {
  applied: {
    label: "Applied",
    title: "This change was applied.",
    className: "bg-status-positive/15 text-status-positive-text",
  },
  pending: {
    label: "Pending review",
    title: "Waiting for your approval.",
    className: "bg-info-bg text-text-subtle",
  },
  rejected: {
    label: "Rejected",
    title: "This change was rejected.",
    className: "bg-warning-bg text-warning-text",
  },
  undone: {
    label: "Undone",
    title: "This change was undone.",
    className: "bg-surface-sunken text-text-subtle",
  },
  superseded: {
    label: "Superseded",
    title: "Replaced by a newer change.",
    className: "bg-surface-sunken text-text-subtle",
  },
};

export function ChangeFeedBadge({ status }: { status: ChangeStatus }) {
  // Defensive: an out-of-set status falls back to the muted shape so a partial
  // render can never crash or leak a raw enum value.
  const badge = BADGE[status] ?? BADGE.superseded;
  return (
    <span
      data-testid={`change-feed-badge-${status}`}
      title={badge.title}
      className={`inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}
