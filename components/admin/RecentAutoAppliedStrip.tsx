// Flow-4 T6 — RecentAutoAppliedStrip (spec §6.2).
//
// The admin dashboard's "Recently auto-applied" strip: the un-dispositioned
// auto-applied changes loaded by lib/admin/loadRecentAutoApplied.ts, grouped by
// show. Each group is a card (mirroring NeedsAttentionInbox's card styling) with
// a header (showName + "Accept all" always, "Undo all" when undoableIds is
// non-empty) and one row per change (kind tag, verbatim summary, Accept on every
// row, Undo only on undoable rows).
//
// Accept controls delegate to <AcceptChangeButton> (form-action submit-safe,
// typed-failure surfacing via ErrorExplainer — invariant 5). Per-row Undo
// delegates to <UndoChangeButton>. "Undo all" is gated behind an inline confirm
// panel mirroring ReSyncButton's held-shrink two-button gate (state-driven, no
// native window.confirm), then dispatches undoFromDashboardAction once per
// undoableId.
//
// Guard conditions:
//   - data.kind === "ok" && groups.length === 0 → render nothing (return null),
//     never an empty card.
//   - data.kind === "infra_error" → a bounded, plain-language sentence; the raw
//     kind token and internal message NEVER reach the DOM (invariant 5).
"use client";
import { useState, useTransition } from "react";
import type {
  AutoAppliedGroup,
  AutoAppliedRow,
  RecentAutoApplied,
} from "@/lib/admin/loadRecentAutoApplied";
import { AcceptChangeButton, type AcceptButtonResult } from "@/components/admin/AcceptChangeButton";
import { UndoChangeButton, type UndoButtonResult } from "@/components/admin/UndoChangeButton";

type AcceptAction = (
  prev: AcceptButtonResult | null,
  formData: FormData,
) => AcceptButtonResult | Promise<AcceptButtonResult>;

type UndoAction = (
  prev: UndoButtonResult | null,
  formData: FormData,
) => UndoButtonResult | Promise<UndoButtonResult>;

export type RecentAutoAppliedStripActions = {
  acceptChangeAction: AcceptAction;
  acceptAllAction: AcceptAction;
  undoFromDashboardAction: UndoAction;
};

// Human labels for the 5 strip change_kinds (spec §6.1 STRIP_KINDS). Unknown
// kinds fall back to a neutral "Change" tag rather than leaking the raw enum.
const KIND_LABEL: Record<string, string> = {
  crew_added: "Added",
  crew_removed: "Removed",
  crew_renamed: "Renamed",
  field_changed: "Field",
  crew_email_changed: "Email",
};

function kindLabel(changeKind: string): string {
  return KIND_LABEL[changeKind] ?? "Change";
}

function StripRow({
  row,
  group,
  actions,
}: {
  row: AutoAppliedRow;
  group: AutoAppliedGroup;
  actions: RecentAutoAppliedStripActions;
}) {
  return (
    <li
      data-testid={`auto-applied-row-${row.id}`}
      className="flex flex-col gap-2 border-b border-border p-tile-pad last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
    >
      <span className="inline-flex shrink-0 items-center rounded-sm border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {kindLabel(row.changeKind)}
      </span>
      <span className="flex-1 text-sm text-text-strong">{row.summary}</span>
      <span className="flex flex-wrap items-center gap-2">
        <AcceptChangeButton
          acceptAction={actions.acceptChangeAction}
          hiddenFields={{ showId: group.showId, changeLogId: row.id }}
        />
        {row.undoable ? (
          <UndoChangeButton changeLogId={row.id} undoAction={actions.undoFromDashboardAction} />
        ) : null}
      </span>
    </li>
  );
}

function GroupSection({
  group,
  actions,
}: {
  group: AutoAppliedGroup;
  actions: RecentAutoAppliedStripActions;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const undoableCount = group.undoableIds.length;

  function confirmUndoAll() {
    // Dispatch undoFromDashboardAction once per undoableId. Each undo self-resolves
    // its show server-side (reads ONLY changeLogId from FormData), so we carry just
    // that field — mirrors UndoChangeButton's single hidden input.
    startTransition(async () => {
      for (const id of group.undoableIds) {
        const fd = new FormData();
        fd.set("changeLogId", id);
        await actions.undoFromDashboardAction(null, fd);
      }
      setConfirming(false);
    });
  }

  return (
    <li
      data-testid={`auto-applied-group-${group.showId}`}
      className="flex flex-col rounded-md border border-border bg-surface shadow-tile"
    >
      <div className="flex flex-col gap-2 border-b border-border bg-surface-sunken p-tile-pad sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-text-strong">{group.showName}</p>
        <span className="flex flex-wrap items-center gap-2">
          <span data-testid={`auto-applied-accept-all-${group.showId}`}>
            <AcceptChangeButton
              acceptAction={actions.acceptAllAction}
              hiddenFields={{ showId: group.showId, ids: group.acceptableIds.join(",") }}
              label="Accept all"
            />
          </span>
          {undoableCount > 0 ? (
            <button
              type="button"
              data-testid={`auto-applied-undo-all-${group.showId}`}
              onClick={() => setConfirming(true)}
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              Undo all
            </button>
          ) : null}
        </span>
      </div>

      {confirming ? (
        <div
          role="status"
          data-testid={`auto-applied-undo-all-confirm-${group.showId}`}
          className="flex flex-col gap-2 border-b border-border bg-warning-bg p-tile-pad text-warning-text"
        >
          <p className="text-sm">
            Undo all {undoableCount} roster {undoableCount === 1 ? "change" : "changes"} for this
            show? Each is reversed and a hold is written.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              data-testid={`auto-applied-undo-all-cancel-${group.showId}`}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
            >
              Keep changes
            </button>
            <button
              type="button"
              onClick={confirmUndoAll}
              disabled={pending}
              aria-busy={pending}
              data-testid={`auto-applied-undo-all-confirm-go-${group.showId}`}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending
                ? "Undoing…"
                : `Undo all ${undoableCount} ${undoableCount === 1 ? "change" : "changes"}`}
            </button>
          </div>
        </div>
      ) : null}

      <ul className="flex flex-col">
        {group.rows.map((row) => (
          <StripRow key={row.id} row={row} group={group} actions={actions} />
        ))}
      </ul>
    </li>
  );
}

export function RecentAutoAppliedStrip({
  data,
  actions,
}: {
  data: RecentAutoApplied;
  actions: RecentAutoAppliedStripActions;
}) {
  if (data.kind === "infra_error") {
    // Bounded, plain-language fallback — never the raw kind token or internal
    // message (invariant 5). No error code is available at this layer to route
    // through ErrorExplainer, so we render a fixed sentence.
    return (
      <section data-testid="recent-auto-applied-strip" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-text-strong">Recently auto-applied</h2>
        <p
          role="status"
          data-testid="auto-applied-error"
          className="rounded-md border border-border bg-surface p-tile-pad text-sm text-text-subtle"
        >
          We couldn&apos;t load recently auto-applied changes right now. Refresh to try again.
        </p>
      </section>
    );
  }

  // ok with no groups → render nothing (no empty card).
  if (data.groups.length === 0) return null;

  return (
    <section
      data-testid="recent-auto-applied-strip"
      className="flex flex-col gap-2"
      aria-label="Recently auto-applied changes"
    >
      <h2 className="text-sm font-semibold text-text-strong">Recently auto-applied</h2>
      <ul className="flex flex-col gap-2">
        {data.groups.map((group) => (
          <GroupSection key={group.showId} group={group} actions={actions} />
        ))}
      </ul>
      {data.overflowCount > 0 ? (
        <p
          data-testid="auto-applied-overflow"
          className="rounded-md border border-dashed border-border p-tile-pad text-sm text-text-subtle"
        >
          +{data.overflowCount} older changes not shown
        </p>
      ) : null}
    </section>
  );
}
