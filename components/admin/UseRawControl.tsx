"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import type { ParseWarning, UseRawResolution } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";

/**
 * `<UseRawControl>` — the shared presentational control for the three recoverable
 * structural-transform warnings (spec 2026-07-10-structural-transform-use-raw §8).
 *
 * It shows the transform's parsed reading next to what the sheet's RAW text would
 * render, and a single toggle between them. It is a PURE function of its props:
 * `(warning.resolution, decision.preference, decision.applied, inFlight)` fully
 * determine the render — there is no free-standing state machine. `current` (the
 * parsed value) is ALWAYS read from `warning.resolution.parsed`, NEVER the entity
 * rows (which the overlay may already have rewritten to the raw value).
 *
 * Guard precedence (§8): out-of-scope code → nothing; `resolution` absent → the
 * transient `legacy-unavailable` note; `resolvable:false` → `disabled` with reason;
 * else derive `transform-active`/`apply-pending`/`raw-active`/`clear-pending` from
 * `preference`+`applied`. `apply-pending`/`clear-pending` exist ONLY where an
 * immediate re-sync applies (the per-show surface); the wizard never reaches them.
 *
 * Copy is plain static microcopy (no §12.4 code renders here — invariant 5 governs
 * error CODES, not button labels). No red/green as a sole state carrier (every
 * state pairs colour with words). Both toggle directions use the neutral outline
 * button treatment: this is an escape-hatch override, not a primary CTA, so the FXAV
 * orange accent is reserved (DESIGN §1.1 ≤10%-viewport cap + accent-bg-text bold-≥14pt
 * restriction — a 12px accent fill would breach both).
 */

export type UseRawControlState =
  | "transform-active"
  | "apply-pending"
  | "raw-active"
  | "clear-pending"
  | "disabled"
  | "legacy-unavailable"
  | "pending";

/** The three in-scope codes (the caller also filters; the control guards too). */
const IN_SCOPE = new Set([
  "ROOM_HEADER_SPLIT_AMBIGUOUS",
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "DATE_ORDER_SUGGESTS_DMY",
]);

/**
 * Pure state derivation (spec §8 guard precedence + persisted-state machine). Kept
 * exported + free-standing so the transition-audit test can drive every cell
 * without rendering. `inFlight` overlays the optimistic `pending` state.
 */
export function deriveUseRawControlState(
  warning: Pick<ParseWarning, "code" | "resolution">,
  decision: UseRawDecision | undefined,
  inFlight: boolean,
): UseRawControlState | null {
  if (!IN_SCOPE.has(warning.code)) return null; // (1) out of scope → render nothing
  // Resolution guards precede the optimistic in-flight overlay: a warning with no
  // resolvable resolution can never show a "pending" raw substitution. A refresh mid-toggle
  // can deliver an unresolvable version of the SAME in-scope warning while `inFlight` is
  // still set; guarding first keeps "pending" resolvable-only, so the resolvable cast in the
  // render (`warning.resolution as {resolvable:true}`) is always sound and never crashes on
  // an undefined/`{resolvable:false}` resolution (Codex R8 F2).
  if (warning.resolution === undefined) return "legacy-unavailable"; // (2) pre-feature warning
  if (warning.resolution.resolvable === false) return "disabled"; // (3) §4 guard
  if (inFlight) return "pending"; // (4) optimistic in-flight overlay (resolvable only)
  // (5) resolvable → derive from the persisted decision
  if (!decision) return "transform-active";
  if (decision.preference === "raw") return decision.applied ? "raw-active" : "apply-pending";
  return "clear-pending"; // preference "transform" (applied:false is the only persisted form)
}

/** Plain-language room-type labels (never the machine token — DESIGN principle 5). */
const ROOM_KIND_LABELS: Record<"gs" | "breakout" | "additional", string> = {
  gs: "General Session",
  breakout: "Breakout",
  additional: "Additional room",
};

/**
 * The parsed reading as labeled field lines (spec §8 — parsed side). One line
 * per field the transform produced, so the row SHOWS the split instead of
 * re-gluing the fields into a string that reads like the raw cell. Null/empty
 * fields are omitted, never rendered as empty lines.
 */
function parsedFields(
  resolution: Extract<UseRawResolution, { resolvable: true }>,
): { label: string; value: string }[] {
  const p = resolution.parsed;
  if (p.kind === "rooms") {
    // Type leads when present: the raw line starts with the kind label
    // ("GENERAL SESSION <name> …"), so the parsed lines mirror the raw order and
    // show the label was consumed as the room's type, not dropped. Absent on
    // warnings persisted before roomKind existed.
    const typeLabel = p.roomKind ? ROOM_KIND_LABELS[p.roomKind] : null;
    return [
      ...(typeLabel ? [{ label: "Type", value: typeLabel }] : []),
      { label: "Room", value: p.name },
      ...(p.dimensions ? [{ label: "Dimensions", value: p.dimensions }] : []),
      ...(p.floor ? [{ label: "Floor", value: p.floor }] : []),
    ];
  }
  if (p.kind === "hotels") {
    const guests =
      p.names.length === 0
        ? [{ label: "Guests", value: "(no guests read)" }]
        : p.names.map((n, i) => ({ label: `Guest ${i + 1}`, value: n }));
    // A confirmation number the split pulled out of the cell gets its own line —
    // it is exactly the "stray number between names" the judgment call is about.
    return p.confirmationNo
      ? [...guests, { label: "Confirmation", value: p.confirmationNo }]
      : guests;
  }
  const d = p.dates;
  const fields: { label: string; value: string }[] = [];
  if (d.travelIn) fields.push({ label: "Travel in", value: d.travelIn });
  if (d.set) fields.push({ label: "Set", value: d.set });
  if (d.showDays.length > 0) fields.push({ label: "Show days", value: d.showDays.join(", ") });
  if (d.travelOut) fields.push({ label: "Travel out", value: d.travelOut });
  return fields.length > 0 ? fields : [{ label: "Dates", value: "(no dates read)" }];
}

/** Human rendering of the raw replacement (spec §8 — raw side). */
function formatRaw(resolution: Extract<UseRawResolution, { resolvable: true }>): string {
  const r = resolution.replacement;
  if (r.kind === "rooms") return r.name;
  if (r.kind === "hotels") return r.names[0];
  return formatDates(r.dmyDates);
}

function formatDates(d: {
  travelIn: string | null;
  set: string | null;
  showDays: string[];
  travelOut: string | null;
}): string {
  const parts: string[] = [];
  if (d.travelIn) parts.push(`in ${d.travelIn}`);
  if (d.set) parts.push(`set ${d.set}`);
  if (d.showDays.length > 0) parts.push(`show ${d.showDays.join(", ")}`);
  if (d.travelOut) parts.push(`out ${d.travelOut}`);
  return parts.length > 0 ? parts.join(" · ") : "(no dates read)";
}

const DISABLED_REASON: Record<"empty-raw" | "invalid-dmy", string> = {
  "empty-raw": "The sheet cell is blank, so there's no raw text to use here.",
  "invalid-dmy": "The raw dates don't read cleanly the other way, so we can't swap them in.",
};

// 2026-07-15 redesign: the two readings render as a two-option choice group
// (radio semantics) instead of a "Parsed / Raw" definition list + action button.
// Rationale: the old shape said WHICH value was live only by implication, used
// parser jargon as labels (DESIGN principle 5), and made the admin diff two long
// strings by eye before finding the button. Choice rows make the live value
// explicit ("In use" marker + checked radio), name the options in plain language,
// and make switching a single tap on the other row.
//
// This stays an escape-hatch override inside an attention callout, not the page's
// primary correction path (Re-sync / Report / fix-in-sheet own that). Per DESIGN §1.1
// the FXAV orange accent is reserved for primary CTAs and keeps a ≤10%-viewport cap, and
// accent-bg text is restricted to bold ≥14pt — so the selected state is carried by the
// neutral radio dot + sunken tint + "In use" text, never an accent fill. No ring-offset
// colour: the control mounts on warning-bg (per-show) AND info-bg (wizard), so the focus
// ring is inset instead of offset.

/** One selectable reading. A button with radio semantics: clicking the checked
 *  row is a no-op; clicking the other row fires the surface's toggle action. */
function ChoiceRow({
  checked,
  disabled,
  label,
  marker,
  buttonTestId,
  onSelect,
  onArrowKey,
  buttonRef,
  children,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  /** Visible state word on the checked row: "In use" when the entity rows
   *  already reflect this choice, "Selected" while an apply/revert is pending
   *  (critique P2 — "In use" must never claim a crew-visible truth it lacks). */
  marker: string | null;
  buttonTestId: string;
  onSelect: () => void;
  /** WAI radio keyboard contract (critique P1): any arrow key moves focus to
   *  the other row and selects it if not already selected. */
  onArrowKey: () => void;
  buttonRef: React.Ref<HTMLButtonElement>;
  /** The reading itself — a single string for the raw side, labeled field
   *  lines for the parsed side (the split made visible). */
  children: React.ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={checked}
      // Roving tab stop: the checked row is the radiogroup's single tab stop;
      // arrow keys reach the other row (WAI-ARIA radio pattern).
      tabIndex={checked ? 0 : -1}
      data-testid={buttonTestId}
      // Soft-disable while a toggle is in flight (Codex R1 F2): native `disabled`
      // would drop both rows from the tab order and destroy focus mid-save.
      // aria-disabled keeps the roving tab stop; activation is guarded below.
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!checked && !disabled) onSelect();
      }}
      onKeyDown={(e) => {
        if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          onArrowKey();
        }
      }}
      className={`flex min-h-tap-min w-full items-start gap-2.5 px-3 py-2 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      } ${checked ? "bg-surface-sunken" : disabled ? "" : "hover:bg-surface-sunken"}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${
          // border-strong sits at ~1.6:1 on bg-surface in both modes — below the
          // WCAG 1.4.11 3:1 graphical floor. text-subtle clears it (6.8:1 / 6.5:1).
          checked ? "border-text-strong" : "border-text-subtle"
        }`}
      >
        {checked ? <span className="size-2 rounded-full bg-text-strong" /> : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={`text-xs font-semibold ${checked ? "text-text-strong" : "text-text"}`}>
            {label}
          </span>
          {checked && marker ? (
            <span className="text-xs font-medium text-text-subtle">{marker}</span>
          ) : null}
        </span>
        {children}
      </span>
    </button>
  );
}

export function UseRawControl({
  warning,
  decision,
  onToggle,
}: {
  warning: Pick<ParseWarning, "code" | "resolution">;
  /** The persisted decision for this warning's `(code, contentHash)`, or undefined. */
  decision: UseRawDecision | undefined;
  /** Binds to the surface's server action; resolves after the re-read. */
  onToggle: (useRaw: boolean) => Promise<void> | void;
}) {
  const [isPending, startTransition] = useTransition();
  // Local error surface: a typed action failure re-reads state and shows plain copy.
  // NEVER renders a raw code (invariant 5) — the surface's action returns a typed
  // discriminant, never a code string, and this copy is static.
  const [failed, setFailed] = useState(false);
  // Which side the admin just chose, for the optimistic `pending` overlay
  // (Codex R1 F1): the persisted `decision` prop lags the click, so without
  // this the marker would sit on the STALE side during the save. Consulted
  // only while the transition is in flight.
  const [pendingChoice, setPendingChoice] = useState<"raw" | "parsed" | null>(null);
  // Roving-focus targets for the WAI radio arrow-key contract.
  const parsedRowRef = useRef<HTMLButtonElement | null>(null);
  const rawRowRef = useRef<HTMLButtonElement | null>(null);

  const state = deriveUseRawControlState(warning, decision, isPending);
  if (state === null) return null;

  const fire = (useRaw: boolean) => {
    setFailed(false);
    setPendingChoice(useRaw ? "raw" : "parsed");
    startTransition(async () => {
      try {
        await onToggle(useRaw);
      } catch {
        setFailed(true);
      }
    });
  };

  // Guard states carry no toggle.
  if (state === "legacy-unavailable") {
    return (
      <p data-testid="use-raw-control" data-state={state} className="mt-1 text-xs text-text-subtle">
        Re-sync this show to enable the &ldquo;use the sheet&rsquo;s raw value&rdquo; option.
      </p>
    );
  }
  if (state === "disabled") {
    const reason =
      warning.resolution !== undefined && warning.resolution.resolvable === false
        ? DISABLED_REASON[warning.resolution.reason]
        : "";
    return (
      <p data-testid="use-raw-control" data-state={state} className="mt-1 text-xs text-text-subtle">
        {reason}
      </p>
    );
  }

  // From here on the warning is resolvable — narrow it for the value formatters.
  const resolution = warning.resolution as Extract<UseRawResolution, { resolvable: true }>;
  const parsed = parsedFields(resolution);
  const raw = formatRaw(resolution);
  const busy = state === "pending";
  // Which side is checked. During the optimistic `pending` overlay the checked
  // side is the one the admin JUST CHOSE (pendingChoice) — the persisted
  // `decision` lags the click, so reading it here would mark the stale side
  // (Codex R1 F1). Rows are soft-disabled while busy, so no double-submit.
  const rawChecked =
    state === "raw-active" || state === "apply-pending" || (busy && pendingChoice === "raw");
  // The raw-side label is honest per kind (Codex R1 F3): rooms substitute the
  // literal raw header; hotels substitute the cell as ONE guest with
  // confirmation tokens STRIPPED (never "exactly" the sheet); dates are a
  // re-INTERPRETATION (day-first), not sheet text at all (spec 2026-07-10 §4).
  const rawLabel =
    resolution.parsed.kind === "rooms"
      ? "Exactly as the sheet says"
      : resolution.parsed.kind === "hotels"
        ? "The whole cell as one guest"
        : "Dates read day-first";
  // "In use" only when the entity rows already reflect the choice; a pending
  // apply/revert (or in-flight toggle) reads "Selected" — crew still see the
  // other value until the next successful sync (critique P2).
  const settled = state === "transform-active" || state === "raw-active";
  const marker = settled ? "In use" : "Selected";
  // Any arrow key moves focus to the OTHER row and selects it when it isn't
  // already the checked side (WAI radio pattern: arrows move + select).
  const arrowFrom = (from: "parsed" | "raw") => {
    const targetRef = from === "parsed" ? rawRowRef : parsedRowRef;
    targetRef.current?.focus();
    const targetChecked = from === "parsed" ? rawChecked : !rawChecked;
    if (!targetChecked && !busy) fire(from === "parsed");
  };

  return (
    <div data-testid="use-raw-control" data-state={state} className="mt-1.5 flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label="Which reading crew pages use"
        className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-surface"
      >
        <ChoiceRow
          checked={!rawChecked}
          disabled={busy}
          label="Our reading"
          marker={marker}
          buttonTestId="use-raw-toggle-off"
          onSelect={() => fire(false)}
          onArrowKey={() => arrowFrom("parsed")}
          buttonRef={parsedRowRef}
        >
          <span
            data-testid="use-raw-parsed"
            className="grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs"
          >
            {parsed.map((f, i) => (
              <Fragment key={`${f.label}-${i}`}>
                <span data-field-label="" className="text-text-subtle">
                  {f.label}
                </span>
                {/* sr-only punctuation pairs label with value for screen readers
                    ("Room: Grand Ballroom,") without touching the visual grid. */}
                <span className="wrap-break-word text-text">
                  <span className="sr-only">: </span>
                  {f.value}
                  <span className="sr-only">,</span>
                </span>
              </Fragment>
            ))}
          </span>
        </ChoiceRow>
        <ChoiceRow
          checked={rawChecked}
          disabled={busy}
          label={rawLabel}
          marker={marker}
          buttonTestId="use-raw-toggle-on"
          onSelect={() => fire(true)}
          onArrowKey={() => arrowFrom("raw")}
          buttonRef={rawRowRef}
        >
          <span data-testid="use-raw-raw" className="min-w-0 wrap-break-word text-xs text-text">
            {raw}
          </span>
        </ChoiceRow>
      </div>

      {state === "apply-pending" && (
        <p data-testid="use-raw-pending-note" className="text-xs text-text-subtle">
          Saved. The crew-visible values will update on the next successful sync.
        </p>
      )}

      {state === "clear-pending" && (
        <p data-testid="use-raw-pending-note" className="text-xs text-text-subtle">
          Reverting. The crew-visible values still show the sheet&rsquo;s text until the next
          successful sync.
        </p>
      )}

      {busy && (
        <p className="text-xs text-text-subtle" aria-live="polite">
          Saving&hellip;
        </p>
      )}

      {failed && (
        <p data-testid="use-raw-error" role="alert" className="text-xs text-warning-text">
          That didn&rsquo;t save. The cell may have changed. Refresh and try again.
        </p>
      )}
    </div>
  );
}
