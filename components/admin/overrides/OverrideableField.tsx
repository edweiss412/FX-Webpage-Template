"use client";

// Task 13 — shared <OverrideableField> (spec §8.1/§8.2/§8.5/§8.6/§8.7).
//
// One client component used by both edit surfaces (Surface A wizard, Surface B
// live-show detail). It renders the live value plus, when an override is active,
// a LOCAL "Overridden" pill (§8.2) — NOT ChangeFeedBadge, whose API is a fixed
// status enum; adding an override status to ChangeStatus would be wrong. The pill
// mirrors ChangeFeedBadge's exact shape/tokens (bg-info-bg text-text-subtle).
//
// Editing calls the injected `onSave` (§8.1 REST2-1) — never a hard-imported
// server action — so Task 13 is independently testable with a spy and Task 14
// passes the real bound `setFieldOverrideAction`.
//
// Transitions (§8.7) are ALL INSTANT: every state change is a plain conditional
// render. No framer-motion / AnimatePresence / motion.* anywhere.
//
// Invariant 5: an {ok:false, code} result is mapped to human copy via
// lib/messages/lookup.ts for cataloged codes; the RPC's own status codes
// (OVERRIDE_STALE_REVIEW / OVERRIDE_INVALID_OP / OVERRIDE_INVALID_STATE) are
// deliberately NOT §12.4 catalog codes (spec §10, mirroring the pull-sheet
// code-less stale_review precedent), so they map through a local copy table.
// Either way the RAW code never reaches the DOM.

import { useState } from "react";

import { getDougFacing, isMessageCode } from "@/lib/messages/lookup";
import type { SetFieldOverrideParams } from "@/lib/overrides/setFieldOverride";

export type OverrideState = {
  overrideValue: unknown;
  sheetValue: unknown;
  active: boolean;
  deactivationCode: "target_missing" | "name_conflict" | null;
  version: number;
};

type OnSave = (
  params: SetFieldOverrideParams,
) => Promise<{ ok: true; value: unknown } | { ok: false; code: string }>;

export type OverrideableFieldProps = {
  driveFileId: string;
  domain: "show" | "crew" | "hotel";
  field: "dates" | "venue" | "name" | "role" | "hotel_name" | "hotel_address";
  matchKey: string; // '' for show; the DURABLE PARSED key (§8.2a) — NOT the display value
  currentValue: React.ReactNode | string; // live (possibly overridden) RENDERED value (display only)
  expectedCurrentValue: unknown; // R17: RAW live field value from loader SOURCE — passed UNCHANGED as CAS-B
  override: OverrideState | null;
  currentOrdinal?: number; // hotel only — advisory (R20)
  currentLiveHotelName?: string; // hotel only (R13) — the p_expected_live_hotel_name CAS row locator
  disabled?: boolean; // archived / first-seen show — suppresses affordances
  onSave: OnSave;
};

// RPC status codes that are NOT §12.4 catalog codes (spec §10). Mapped locally to
// friendly copy so invariant 5 holds (raw code never rendered). The stale copy is
// the §8.7 :536 CAS-409 wording.
const OVERRIDE_RPC_COPY: Record<string, string> = {
  OVERRIDE_STALE_REVIEW: "This field changed since you opened it — reload and try again.",
  OVERRIDE_INVALID_OP: "That action isn't available for this field right now.",
  OVERRIDE_INVALID_STATE: "This override changed since you opened it — reload and try again.",
};

const GENERIC_ERROR = "Something went wrong saving this override. Reload and try again.";

function errorCopyFor(code: string): string {
  if (isMessageCode(code)) {
    const doug = getDougFacing(code);
    if (doug) return doug;
  }
  return OVERRIDE_RPC_COPY[code] ?? GENERIC_ERROR;
}

function toEditableString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

// Literal class strings (not template-constructed) so Tailwind v4's content scan
// emits each utility into the built CSS.
const BUTTON_CLASS =
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const INPUT_CLASS =
  "min-h-tap-min rounded-sm border border-border-strong bg-surface px-2 py-1 text-sm text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

function OverrideChip({
  domain,
  field,
  sheetValue,
}: {
  domain: string;
  field: string;
  sheetValue: unknown;
}) {
  const title =
    sheetValue === null || sheetValue === undefined
      ? "Overridden — sheet has no value"
      : `sheet says "${String(sheetValue)}"`;
  return (
    <span
      data-testid={`override-chip-${domain}-${field}`}
      title={title}
      className="inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 text-xs font-medium bg-info-bg text-text-subtle"
    >
      Overridden
    </span>
  );
}

export function OverrideableField(props: OverrideableFieldProps) {
  const {
    driveFileId,
    domain,
    field,
    matchKey,
    currentValue,
    expectedCurrentValue,
    override,
    currentOrdinal,
    currentLiveHotelName,
    disabled,
    onSave,
  } = props;

  const [mode, setMode] = useState<"idle" | "editing" | "repointing">("idle");
  const [draft, setDraft] = useState("");
  const [newKeyDraft, setNewKeyDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const testId = `overrideable-field-${domain}-${field}`;
  const valueTestId = `override-value-${domain}-${field}`;
  const isEmpty = currentValue === null || currentValue === undefined || currentValue === "";

  async function submit(params: SetFieldOverrideParams) {
    setPending(true);
    setError(null);
    try {
      const result = await onSave(params);
      if (result.ok) {
        setMode("idle");
      } else {
        setError(errorCopyFor(result.code));
      }
    } finally {
      setPending(false);
    }
  }

  function baseParams(op: SetFieldOverrideParams["p_op"]): SetFieldOverrideParams {
    return {
      p_drive_file_id: driveFileId,
      p_op: op,
      p_domain: domain,
      p_field: field,
      p_match_key: matchKey,
      p_new_match_key: null,
      p_override_value: null,
      // p_actor is set server-side (the action canonicalizes the admin email); the
      // component passes "" and the action overwrites it (§8.1 note).
      p_actor: "",
      p_expected_version: override?.version ?? null,
      // R17: pass the loader-source value UNCHANGED — never derive from rendered text.
      p_expected_current_value: expectedCurrentValue,
      p_current_ordinal: currentOrdinal ?? null,
      p_expected_live_hotel_name: currentLiveHotelName ?? null,
    };
  }

  function openEditor() {
    setDraft(
      override && override.active
        ? toEditableString(override.overrideValue)
        : typeof currentValue === "string"
          ? currentValue
          : "",
    );
    setError(null);
    setMode("editing");
  }

  function saveEdit() {
    void submit({ ...baseParams("upsert"), p_override_value: draft });
  }

  function revert() {
    void submit(baseParams("revert"));
  }

  function discard() {
    void submit(baseParams("discard"));
  }

  function openRepoint() {
    setNewKeyDraft("");
    setError(null);
    setMode("repointing");
  }

  function saveRepoint() {
    void submit({
      ...baseParams("repoint"),
      p_new_match_key: newKeyDraft,
      p_override_value: override ? override.overrideValue : null,
    });
  }

  const valueCell = (
    <span data-testid={valueTestId} className="min-w-0 wrap-break-word">
      {isEmpty ? "—" : currentValue}
    </span>
  );

  const errorNode = error ? (
    <p
      data-testid={`override-error-${domain}-${field}`}
      className="mt-1 text-sm text-warning-text"
      role="status"
    >
      {error}
    </p>
  ) : null;

  // Disabled (archived / first-seen show): read-only value, no affordances (§8.5).
  if (disabled) {
    return (
      <div data-testid={testId} className="flex min-w-0 flex-wrap items-center gap-2">
        {valueCell}
      </div>
    );
  }

  // Editing input (shared by plain→create and overridden→re-edit).
  if (mode === "editing") {
    return (
      <div data-testid={testId} className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <input
            data-testid={`override-input-${domain}-${field}`}
            className={INPUT_CLASS}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`Override value for ${field}`}
          />
          <button
            type="button"
            data-testid={`override-save-${domain}-${field}`}
            className={BUTTON_CLASS}
            disabled={pending}
            onClick={saveEdit}
          >
            Save
          </button>
          <button
            type="button"
            data-testid={`override-cancel-${domain}-${field}`}
            className={BUTTON_CLASS}
            disabled={pending}
            onClick={() => setMode("idle")}
          >
            Cancel
          </button>
        </div>
        {errorNode}
      </div>
    );
  }

  // Re-pointing input (stale override → new match key).
  if (mode === "repointing") {
    return (
      <div data-testid={testId} className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {valueCell}
          <input
            data-testid={`override-repoint-input-${domain}-${field}`}
            className={INPUT_CLASS}
            value={newKeyDraft}
            onChange={(e) => setNewKeyDraft(e.target.value)}
            aria-label={`New match key for ${field}`}
            placeholder="New sheet value to re-point to"
          />
          <button
            type="button"
            data-testid={`override-repoint-save-${domain}-${field}`}
            className={BUTTON_CLASS}
            disabled={pending}
            onClick={saveRepoint}
          >
            Re-point
          </button>
          <button
            type="button"
            data-testid={`override-cancel-${domain}-${field}`}
            className={BUTTON_CLASS}
            disabled={pending}
            onClick={() => setMode("idle")}
          >
            Cancel
          </button>
        </div>
        {errorNode}
      </div>
    );
  }

  // Stale (override.active === false): parsed value + muted paused note + Re-point/Discard.
  if (override && !override.active) {
    return (
      <div data-testid={testId} className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {valueCell}
          <button
            type="button"
            data-testid={`override-repoint-${domain}-${field}`}
            className={BUTTON_CLASS}
            onClick={openRepoint}
          >
            Re-point
          </button>
          <button
            type="button"
            data-testid={`override-discard-${domain}-${field}`}
            className={BUTTON_CLASS}
            disabled={pending}
            onClick={discard}
          >
            Discard
          </button>
        </div>
        <p
          data-testid={`override-stale-note-${domain}-${field}`}
          className="mt-1 text-sm text-text-subtle"
        >
          {`Override paused — sheet no longer has «${matchKey}»`}
        </p>
        {errorNode}
      </div>
    );
  }

  // Active override: value + chip + Edit/Revert.
  if (override && override.active) {
    return (
      <div data-testid={testId} className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {valueCell}
          <OverrideChip domain={domain} field={field} sheetValue={override.sheetValue} />
          <button
            type="button"
            data-testid={`override-edit-${domain}-${field}`}
            className={BUTTON_CLASS}
            onClick={openEditor}
          >
            Edit
          </button>
          <button
            type="button"
            data-testid={`override-revert-${domain}-${field}`}
            className={BUTTON_CLASS}
            disabled={pending}
            onClick={revert}
          >
            Revert
          </button>
        </div>
        {errorNode}
      </div>
    );
  }

  // override === null. Empty value → plain empty-state (no affordance, §8.5).
  if (isEmpty) {
    return (
      <div data-testid={testId} className="flex min-w-0 flex-wrap items-center gap-2">
        {valueCell}
      </div>
    );
  }

  // Plain: live value + Edit.
  return (
    <div data-testid={testId} className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {valueCell}
        <button
          type="button"
          data-testid={`override-edit-${domain}-${field}`}
          className={BUTTON_CLASS}
          onClick={openEditor}
        >
          Edit
        </button>
      </div>
      {errorNode}
    </div>
  );
}
