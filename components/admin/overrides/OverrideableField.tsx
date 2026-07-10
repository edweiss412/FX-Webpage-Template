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
import type { RepointTargetIndex } from "@/lib/overrides/loadShowOverrides";

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
  // Serializable lookup of live targets' CAS-B inputs for repoint (R6): the RPC validates
  // p_expected_current_value against the NEW target B, so the client resolves B's live value
  // (+ live hotel name) for the entered key from this index. A closure cannot cross the RSC
  // boundary, so the Server page passes DATA. Absent / no match → repoint sends null CAS-B
  // (RPC fail-closes 409); surfaces that offer repoint MUST pass it.
  repointTargets?: RepointTargetIndex;
  onSave: OnSave;
};

// RPC status codes that are NOT §12.4 catalog codes (spec §10). Mapped locally to
// friendly copy so invariant 5 holds (raw code never rendered). The stale copy is
// the §8.7 :536 CAS-409 wording.
const OVERRIDE_RPC_COPY: Record<string, string> = {
  OVERRIDE_STALE_REVIEW: "This field changed since you opened it. Reload and try again.",
  OVERRIDE_INVALID_OP: "That action isn't available for this field right now.",
  OVERRIDE_INVALID_STATE: "This override changed since you opened it. Reload and try again.",
  OVERRIDE_INVALID_SHAPE:
    "That value isn't the right shape for this field. Check it and try again.",
};

// Last-resort fallback for an unrecognized RPC code (§10 leaves the override RPC
// status codes uncataloged); routing through messageFor(code) is impossible when the
// code is not in §12.4. Invariant-5 (raw code never rendered) is upheld by
// errorCopyFor below, the sole render path.
// not-subject:M5-D8
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

// Sheet-value presentation (§8.5): the "sheet says X" comparison is the chip's
// whole purpose, so it must be reachable by keyboard AND touch (Doug on a phone),
// never hover-only `title` (PRODUCT: no hover-only affordances). Scalar sheet
// values (crew name/role, hotel name/address) render as a visible muted line;
// object-valued fields (show dates/venue) have no clean one-liner, so the chip's
// aria-label carries the state for screen readers and the visible override value
// cell already shows the correction.
function formatSheetValue(v: unknown): { visible: string | null; aria: string } {
  if (v === null || v === undefined) {
    return { visible: "Sheet has no value", aria: "Overridden; the sheet has no value" };
  }
  if (typeof v === "string" || typeof v === "number") {
    const s = String(v);
    return { visible: `Sheet: "${s}"`, aria: `Overridden; the sheet says "${s}"` };
  }
  return { visible: null, aria: "Overridden; see the sheet for the previous value" };
}

function OverrideChip({
  domain,
  field,
  ariaLabel,
}: {
  domain: string;
  field: string;
  ariaLabel: string;
}) {
  return (
    <span
      data-testid={`override-chip-${domain}-${field}`}
      aria-label={ariaLabel}
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
    repointTargets,
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
  // show `dates`/`venue` are structured jsonb OBJECTS, not scalar strings — the RPC
  // rejects a non-object p_override_value (invalid_shape). The editor therefore edits
  // the object's JSON shape (§8: "reuse the existing structured shapes; no rich
  // editor") and saveEdit parses it back to an object; the four text fields keep the
  // scalar-string path (the RPC wants a JSON string for those).
  const isStructured = domain === "show";

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
    if (isStructured) {
      // Seed the JSON editor with the current structured value (the active override
      // object, else the raw live object from the loader — never the rendered display).
      const seed =
        override && override.active ? override.overrideValue : (expectedCurrentValue ?? null);
      setDraft(seed == null ? "" : JSON.stringify(seed));
    } else {
      setDraft(
        override && override.active
          ? toEditableString(override.overrideValue)
          : typeof currentValue === "string"
            ? currentValue
            : "",
      );
    }
    setError(null);
    setMode("editing");
  }

  function saveEdit() {
    if (isStructured) {
      // dates/venue: parse the JSON draft to the structured object the RPC requires.
      // Pass the parsed value RAW (postgres.js sends it to $N::jsonb; never
      // JSON.stringify a value bound to ::jsonb — that double-encodes to a string
      // scalar and the RPC's object-shape check rejects it).
      let parsed: unknown;
      try {
        parsed = JSON.parse(draft);
      } catch {
        // not-subject:M5-D8 — client-side pre-submit JSON hint, never a §12.4 server code.
        setError("That isn't valid JSON. Fix the value and try again.");
        return;
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        // not-subject:M5-D8 — client-side pre-submit JSON hint, never a §12.4 server code.
        setError("This field needs a structured value (a JSON object).");
        return;
      }
      void submit({ ...baseParams("upsert"), p_override_value: parsed });
      return;
    }
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

  function resolveRepointTarget(): {
    expectedCurrentValue: unknown;
    expectedLiveHotelName: string | null;
  } | null {
    if (!repointTargets) return null;
    if (domain === "crew") {
      const t = repointTargets.crew[newKeyDraft];
      if (!t) return null;
      return {
        expectedCurrentValue: field === "name" ? t.name : t.role,
        expectedLiveHotelName: null,
      };
    }
    if (domain === "hotel") {
      const t = repointTargets.hotel[newKeyDraft];
      if (!t) return null;
      return {
        expectedCurrentValue: field === "hotel_name" ? t.hotel_name : t.hotel_address,
        expectedLiveHotelName: t.liveHotelName,
      };
    }
    return null; // show is a singleton; repoint does not apply.
  }

  function saveRepoint() {
    // R6 HIGH: the RPC validates CAS-B against the NEW target B (not the old paused target
    // baseParams carries) and, for hotel, resolves B's row via p_expected_live_hotel_name.
    // Resolve B's live values from the loaded views by the entered key; null (no match) →
    // send null so the RPC fail-closes 409 rather than guessing a wrong row.
    const target = resolveRepointTarget();
    void submit({
      ...baseParams("repoint"),
      p_new_match_key: newKeyDraft,
      p_override_value: override ? override.overrideValue : null,
      p_expected_current_value: target ? target.expectedCurrentValue : null,
      p_expected_live_hotel_name: target ? target.expectedLiveHotelName : null,
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
      role="alert"
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
          {`Override paused: the sheet no longer has «${matchKey}»`}
        </p>
        {errorNode}
      </div>
    );
  }

  // Active override: value + chip + visible sheet-value line + Edit/Revert.
  if (override && override.active) {
    const sheet = formatSheetValue(override.sheetValue);
    return (
      <div data-testid={testId} className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {valueCell}
          <OverrideChip domain={domain} field={field} ariaLabel={sheet.aria} />
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
        {sheet.visible ? (
          <p
            data-testid={`override-sheet-value-${domain}-${field}`}
            className="mt-1 text-xs text-text-subtle"
          >
            {sheet.visible}
          </p>
        ) : null}
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
