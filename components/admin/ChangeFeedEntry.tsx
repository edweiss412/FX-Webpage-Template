// Phase 6 T6.5 — ChangeFeedEntry (row shell + mode dispatch).
//
// Renders one feed row: summary <p> (the old→new text for a pending row IS the
// server-rendered entry.summary — PF17), <ChangeFeedTime>, <ChangeFeedBadge>, and
// a per-`action` affordance:
//   - undo            → <UndoChangeButton changeLogId={entry.changeLogId} />
//   - approve_reject  → <Mi11GateActions holdId/disposition/baseModifiedTime />
//   - none            → no button
//
// PF17/PF14/PF40: consumes ONLY the canonical FeedEntry fields (summary, gate =
// {holdId, disposition, baseModifiedTime}, changeLogId). It reads NO detail /
// groupState / conflictCode — those are not on FeedEntry; the swap/collision
// outcome surfaces post-submit from the Approve action's typed result inside
// Mi11GateActions, so the page performs NO second query. entry.gate.baseModifiedTime
// is threaded VERBATIM into Mi11GateActions (the staleness token the admin SAW).
//
// Defensive guard: if action==='approve_reject' but gate is undefined (or 'undo'
// but changeLogId undefined), the row renders notification-only — never a dangling
// Approve with no hold / Undo with no target.
"use client";

import { ChangeFeedBadge } from "@/components/admin/ChangeFeedBadge";
import { ChangeFeedTime } from "@/components/admin/ChangeFeedTime";
import { Mi11GateActions, type Mi11GateActionResult } from "@/components/admin/Mi11GateActions";
import { UndoChangeButton, type UndoButtonResult } from "@/components/admin/UndoChangeButton";
import type { FeedEntry } from "@/lib/sync/holds/types";

type GateServerAction = (
  prev: Mi11GateActionResult | null,
  formData: FormData,
) => Mi11GateActionResult | Promise<Mi11GateActionResult>;

type UndoServerAction = (
  prev: UndoButtonResult | null,
  formData: FormData,
) => UndoButtonResult | Promise<UndoButtonResult>;

export function ChangeFeedEntry({
  entry,
  now,
  undoAction,
  approveAction,
  rejectAction,
}: {
  entry: FeedEntry;
  now: Date;
  undoAction: UndoServerAction;
  approveAction: GateServerAction;
  rejectAction: GateServerAction;
}) {
  const canUndo = entry.action === "undo" && entry.changeLogId != null;
  const canGate = entry.action === "approve_reject" && entry.gate != null;

  return (
    <li
      data-testid={`change-feed-entry-${entry.id}`}
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-tile-pad sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p data-testid="change-feed-summary" className="text-sm text-text-strong">
          {entry.summary}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ChangeFeedBadge status={entry.status} />
          <ChangeFeedTime occurredAt={entry.occurredAt} now={now} />
        </div>
      </div>
      {canUndo ? (
        <div className="shrink-0">
          <UndoChangeButton changeLogId={entry.changeLogId!} undoAction={undoAction} />
        </div>
      ) : canGate ? (
        <div className="shrink-0">
          <Mi11GateActions
            holdId={entry.gate!.holdId}
            disposition={entry.gate!.disposition}
            baseModifiedTime={entry.gate!.baseModifiedTime}
            approveAction={approveAction}
            rejectAction={rejectAction}
          />
        </div>
      ) : null}
    </li>
  );
}
