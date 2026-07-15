// Flow-4 T6 — RecentAutoAppliedStrip (spec §6.2).
//
// The admin dashboard's "Recently auto-applied" strip: the un-dispositioned
// auto-applied changes loaded by lib/admin/loadRecentAutoApplied.ts, grouped by
// show. Each group is a card (mirroring NeedsAttentionInbox's card styling) whose
// header is a collapse toggle (chevron + showName + count badge; WAI accordion,
// collapsed by default on the dashboard). Expanding discloses a panel holding the
// bulk actions on their own row ("Accept all" always, "Undo all" when undoableIds
// is non-empty), then one row per change (kind pill, diff/summary, Accept on every
// row, Undo only on undoable rows). `defaultExpanded` opens groups flat for a
// show-scoped surface (one group, no click to reveal).
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
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
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

// Full literal token classes per change kind (spec §4). Tailwind v4 JIT scans
// source for complete class strings — these MUST stay literals, never `${token}`
// interpolation, or the utility is never emitted and the pill renders bg-less.
const KIND_PILL: Record<string, { label: string; cls: string; dot: string }> = {
  crew_added: {
    label: "Added",
    cls: "border-status-positive/40 bg-status-positive/12 text-status-positive-text",
    dot: "bg-status-positive",
  },
  crew_renamed: {
    label: "Renamed",
    cls: "border-status-review/40 bg-status-review/12 text-status-review-text",
    dot: "bg-status-review",
  },
  crew_removed: {
    label: "Removed",
    cls: "border-status-warn/40 bg-status-warn/12 text-status-warn-text",
    dot: "bg-status-warn",
  },
  field_changed: {
    label: "Field",
    cls: "border-border bg-surface-sunken text-status-idle-text",
    dot: "bg-status-idle",
  },
  crew_email_changed: {
    label: "Email",
    cls: "border-border bg-surface-sunken text-status-idle-text",
    dot: "bg-status-idle",
  },
};
// Unknown kinds fall back to a neutral "Change" pill rather than leaking the raw enum.
const FALLBACK_PILL = {
  label: "Change",
  cls: "border-border bg-surface-sunken text-status-idle-text",
  dot: "bg-status-idle",
};

function KindPill({ changeKind }: { changeKind: string }) {
  const pill = KIND_PILL[changeKind] ?? FALLBACK_PILL;
  return (
    <span
      data-testid="auto-applied-kind-pill"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${pill.cls}`}
    >
      <span className={`size-1.5 rounded-full ${pill.dot}`} />
      {pill.label}
    </span>
  );
}

// The From→To / single-value diff block. `none` renders the summary sentence
// (field_changed / crew_email_changed / unknown — no structured diff stored).
function DiffBlock({ row }: { row: AutoAppliedRow }) {
  const d = row.diff;
  if (d.kind === "none") {
    return <p className="wrap-break-word text-sm text-text-strong">{row.summary}</p>;
  }
  // text-subtle (not faint): these captions carry the diff DIRECTION — the
  // non-color mechanism (From/To/Added/Removed) — so they must clear AA-body
  // contrast, and DESIGN forbids faint on actionable/meaningful copy.
  const cap = "text-xs font-semibold uppercase tracking-wide text-text-subtle";
  if (d.kind === "fromTo") {
    return (
      <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-0.5">
        <span className={cap}>From</span>
        <span className="text-sm text-text-subtle line-through">{d.from}</span>
        <span className={cap}>To</span>
        <span className="text-sm font-semibold text-text-strong">{d.to}</span>
      </div>
    );
  }
  const removed = d.caption === "Removed";
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-0.5">
      <span className={cap}>{d.caption}</span>
      <span
        className={
          removed
            ? "text-sm text-text-subtle line-through"
            : "text-sm font-semibold text-text-strong"
        }
      >
        {d.value}
      </span>
    </div>
  );
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
  // Crew kinds carry a structured diff → show a "Crew member" entity label; the
  // none-kinds (field/email/unknown) render their summary sentence instead.
  const isCrew = row.diff.kind !== "none";
  return (
    <li
      data-testid={`auto-applied-row-${row.id}`}
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
    >
      <div className="flex items-center gap-2">
        <KindPill changeKind={row.changeKind} />
        {isCrew ? (
          <span className="text-sm font-semibold text-text-strong">Crew member</span>
        ) : null}
      </div>
      <DiffBlock row={row} />
      <div className={`grid gap-1.5 ${row.undoable ? "grid-cols-2" : "grid-cols-1"}`}>
        <AcceptChangeButton
          acceptAction={actions.acceptChangeAction}
          hiddenFields={{ showId: group.showId, changeLogId: row.id }}
          stretch
        />
        {row.undoable ? (
          <UndoChangeButton
            changeLogId={row.id}
            undoAction={actions.undoFromDashboardAction}
            stretch
            quiet
          />
        ) : null}
      </div>
    </li>
  );
}

function GroupSection({
  group,
  actions,
  defaultExpanded,
}: {
  group: AutoAppliedGroup;
  actions: RecentAutoAppliedStripActions;
  // Collapsed-by-default on the admin dashboard (defaultExpanded=false); a
  // show-scoped surface passes defaultExpanded so its single group opens flat.
  defaultExpanded: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const undoableCount = group.undoableIds.length;
  const panelId = `auto-applied-panel-${group.showId}`;

  // Focus the safe "Keep changes" control when the confirm opens — mirrors
  // ReSyncButton's keepCurrentRef pattern (WCAG 2.4.3). Prevents a stray Enter
  // from firing the destructive bulk undo the instant the panel appears.
  const keepChangesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) keepChangesRef.current?.focus();
  }, [confirming]);

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
      {/* Collapsible header: the whole bar IS the disclosure toggle (WAI accordion
          pattern — an <h5> wraps the <button> so the heading role survives; a
          <button> takes phrasing content only, so the bulk Accept/Undo controls
          live in the disclosed panel below, never nested inside the trigger).
          Level is h5: it descends from the strip's own <h4> "Recently
          auto-applied", which itself sits under the dashboard section's <h3>
          "Needs attention" — so an h5 keeps the SR outline monotonic (h3→h4→h5).
          (The IgnoredSheetsDisclosure mirror legitimately uses h3 because it is a
          top-level section, not nested under a heading; the level is not portable.) */}
      <h5 className="min-w-0">
        <button
          type="button"
          data-testid={`auto-applied-toggle-${group.showId}`}
          aria-expanded={open}
          // Only reference the panel while it exists (mounted on expand) — a
          // dangling aria-controls idref confuses strict screen readers.
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((v) => !v)}
          // ring-inset (not the token's offset ring) is deliberate: this toggle is
          // a full-bleed sunken bar flush to the card's top edge + rounded-t
          // corners, so an outset ring would protrude past the card border. The
          // sibling bulk buttons below keep the standard offset ring.
          className={`group flex min-h-tap-min w-full min-w-0 items-center gap-2 bg-surface-sunken p-tile-pad text-left transition-colors duration-fast hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring ${
            open ? "rounded-t-md border-b border-border" : "rounded-md"
          }`}
        >
          <ChevronRight
            aria-hidden="true"
            className={`size-4 shrink-0 text-text-subtle transition-transform duration-fast group-hover:text-text-strong ${
              open ? "rotate-90" : ""
            }`}
          />
          <span className="min-w-0 flex-1 wrap-break-word text-sm font-semibold text-text-strong">
            {group.showName}
          </span>
          <span
            data-testid={`auto-applied-count-${group.showId}`}
            aria-label={`${group.rows.length} ${group.rows.length === 1 ? "change" : "changes"}`}
            className="shrink-0 rounded-full border border-border bg-surface px-2 text-xs font-semibold tabular-nums text-text-subtle"
          >
            {group.rows.length}
          </span>
        </button>
      </h5>

      {open ? (
        <div
          id={panelId}
          data-testid={panelId}
          role="region"
          aria-label={`Auto-applied changes for ${group.showName}`}
        >
          {/* Bulk actions sit on their OWN row underneath the show name, not beside
              it — and outside the toggle <button> (a11y: no nested interactives). */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-tile-pad">
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
          </div>

          {confirming ? (
            <div
              role="status"
              data-testid={`auto-applied-undo-all-confirm-${group.showId}`}
              className="flex flex-col gap-2 border-b border-border bg-warning-bg p-tile-pad text-warning-text"
            >
              <p className="text-sm">
                Undo all {undoableCount} roster {undoableCount === 1 ? "change" : "changes"} for
                this show? Each is reversed and a hold is written.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  ref={keepChangesRef}
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

          <ul className="flex flex-col gap-2.5 p-tile-pad">
            {group.rows.map((row) => (
              <StripRow key={row.id} row={row} group={group} actions={actions} />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export function RecentAutoAppliedStrip({
  data,
  actions,
  defaultExpanded = false,
}: {
  data: RecentAutoApplied;
  actions: RecentAutoAppliedStripActions;
  // Per-group starting disclosure state. Omitted on the admin dashboard → every
  // group is collapsed by default; a show-scoped surface passes `defaultExpanded`
  // so its group renders flat (no click to reveal).
  defaultExpanded?: boolean;
}) {
  if (data.kind === "infra_error") {
    // Bounded, plain-language fallback — never the raw kind token or internal
    // message (invariant 5). No error code is available at this layer to route
    // through ErrorExplainer, so we render a fixed sentence.
    return (
      <section data-testid="recent-auto-applied-strip" className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold text-text-strong">Recently auto-applied</h4>
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
      <h4 className="text-sm font-semibold text-text-strong">Recently auto-applied</h4>
      <ul className="flex flex-col gap-2">
        {data.groups.map((group) => (
          <GroupSection
            key={group.showId}
            group={group}
            actions={actions}
            defaultExpanded={defaultExpanded}
          />
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
