"use client";

/**
 * app/admin/settings/roles/RoleMappingRow.tsx
 *
 * One row of the settings "Roles you've added" list (spec 2026-07-15 §8.2).
 * Client component: a plain-language view (label + grant chips + who/when +
 * quiet actions), an INLINE edit that reopens the same capability checklist and
 * saves through `updateRoleTokenMapping`, and a two-step INLINE remove confirm
 * that deletes through `deleteRoleTokenMapping`. No modals. All state is per-row
 * local, keyed to nothing shared, so one row's edit never migrates into another
 * row's open remove-confirm. Every string flows through `roleRecognizeCopy`.
 *
 * Both actions revalidate the settings path server-side; on success the row
 * either resets to view (edit) or is dropped by the re-render (remove).
 */

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { GRANTABLE_FLAGS, type GrantableFlag } from "@/lib/sync/roleMappingOverlay";
import * as COPY from "@/components/admin/roleRecognizeCopy";
import {
  updateRoleTokenMapping,
  deleteRoleTokenMapping,
} from "@/app/admin/settings/_actions/roleTokenMappings";

export type RoleMappingRowData = {
  token: string;
  grants: GrantableFlag[];
  /** "You" when the decider is the current admin, else their email (§11 display-only). */
  decidedByLabel: string;
  /** Short human date, e.g. "Jun 12". */
  decidedAtLabel: string;
};

type Checks = Record<GrantableFlag, boolean>;
const EMPTY_CHECKS: Checks = { A1: false, V1: false, L1: false, FINANCIALS: false };

const CHECKBOX_LABEL: Record<GrantableFlag, string> = {
  A1: COPY.CHECKBOX_AUDIO,
  V1: COPY.CHECKBOX_VIDEO,
  L1: COPY.CHECKBOX_LIGHTING,
  FINANCIALS: COPY.CHECKBOX_FINANCIAL,
};

const outlineBtn =
  "inline-flex min-h-tap-min items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong " +
  "transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "disabled:cursor-not-allowed disabled:opacity-60";
const ghostBtn =
  "min-h-tap-min rounded-sm px-2 text-sm font-medium text-text-subtle underline underline-offset-2 " +
  "transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "disabled:cursor-not-allowed disabled:opacity-60";
const popIn =
  "motion-safe:animate-[role-recognize-pop_var(--duration-fast)_var(--ease-out-quart)] motion-reduce:animate-none";

function checksFromGrants(grants: readonly GrantableFlag[]): Checks {
  return { ...EMPTY_CHECKS, ...Object.fromEntries(grants.map((g) => [g, true])) } as Checks;
}

export function RoleMappingRow({ row }: { row: RoleMappingRowData }) {
  const uid = useId();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [checks, setChecks] = useState<Checks>(EMPTY_CHECKS);
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setChecks(checksFromGrants(row.grants));
    setMode("edit");
  };
  const toggle = (flag: GrantableFlag) => setChecks((c) => ({ ...c, [flag]: !c[flag] }));
  const noneChecked = GRANTABLE_FLAGS.every((f) => !checks[f]);

  const saveEdit = async () => {
    setBusy(true);
    const r = await updateRoleTokenMapping(
      row.token,
      GRANTABLE_FLAGS.filter((f) => checks[f]),
    );
    setBusy(false);
    if (r.ok) setMode("view");
  };
  const confirmRemove = async () => {
    setBusy(true);
    await deleteRoleTokenMapping(row.token);
    setBusy(false);
    setMode("view");
  };

  const meta = `${row.decidedByLabel} · ${row.decidedAtLabel}`;

  return (
    <li
      data-testid="role-mapping-row"
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-text-strong">{row.token}</span>
        <span className="whitespace-nowrap text-[11px] text-text-subtle">{meta}</span>
      </div>

      {mode === "view" ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {row.grants.length === 0 ? (
              <span
                data-testid="role-mapping-chip"
                className="rounded-full border border-dashed border-border-strong bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-text-subtle"
              >
                {COPY.STANDARD_PAGE_CHIP}
              </span>
            ) : (
              row.grants.map((g) => (
                <span
                  key={g}
                  data-testid="role-mapping-chip"
                  data-financial={g === "FINANCIALS" ? "true" : undefined}
                  className={
                    g === "FINANCIALS"
                      ? "rounded-full border border-border-strong bg-warning-bg px-2.5 py-0.5 text-xs font-medium text-warning-text"
                      : "rounded-full border border-border bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-text"
                  }
                >
                  {COPY.chipLabel(g)}
                </span>
              ))
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={startEdit} className={outlineBtn}>
              {COPY.EDIT_LABEL}
            </button>
            <button type="button" onClick={() => setMode("confirm")} className={ghostBtn}>
              {COPY.REMOVE_LABEL}
            </button>
          </div>
        </>
      ) : null}

      {mode === "edit" ? (
        <div
          className={`flex flex-col gap-3 rounded-md border border-border bg-surface-sunken p-3 ${popIn}`}
        >
          <span className="text-sm font-semibold text-text-strong">{COPY.PANEL_HEADING}</span>
          <div className="flex flex-col">
            {(["A1", "V1", "L1"] as const).map((flag) => (
              <label key={flag} className="flex min-h-tap-min cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  data-testid={`role-mapping-check-${flag}`}
                  checked={checks[flag]}
                  disabled={busy}
                  onChange={() => toggle(flag)}
                  className="size-5 accent-accent"
                />
                <span className="text-sm text-text">{CHECKBOX_LABEL[flag]}</span>
              </label>
            ))}
            <div className="flex min-h-tap-min items-start gap-2.5 py-1">
              <input
                type="checkbox"
                id={`${uid}-fin`}
                data-testid="role-mapping-check-FINANCIALS"
                aria-describedby={`${uid}-fin-cap`}
                checked={checks.FINANCIALS}
                disabled={busy}
                onChange={() => toggle("FINANCIALS")}
                className="mt-0.5 size-5 accent-accent"
              />
              <span className="flex flex-col gap-0.5">
                <label htmlFor={`${uid}-fin`} className="cursor-pointer text-sm text-text">
                  {COPY.CHECKBOX_FINANCIAL}
                </label>
                <span id={`${uid}-fin-cap`} className="text-xs text-warning-text">
                  {COPY.FINANCIAL_CAUTION}
                </span>
              </span>
            </div>
          </div>
          {noneChecked ? (
            <p className="self-start rounded-md bg-surface px-2.5 py-2 text-xs text-text-subtle">
              {COPY.NONE_CHECKED_HELPER}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="role-mapping-save"
              disabled={busy}
              onClick={saveEdit}
              className="inline-flex min-h-tap-min items-center justify-center gap-2 rounded-sm bg-accent px-4 text-sm font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
              {busy ? COPY.SAVING_CHANGES_LABEL : COPY.SAVE_CHANGES_LABEL}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("view")}
              className="min-h-tap-min rounded-sm px-2 text-sm font-medium text-text-subtle transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {COPY.CANCEL_LABEL}
            </button>
          </div>
        </div>
      ) : null}

      {mode === "confirm" ? (
        <div
          className={`flex flex-col gap-2.5 rounded-md border border-border-strong bg-warning-bg p-3 ${popIn}`}
        >
          <p className="text-xs text-warning-text">{COPY.REMOVE_CONFIRM}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="role-mapping-remove"
              disabled={busy}
              onClick={confirmRemove}
              className={outlineBtn}
            >
              {busy ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
              {busy ? COPY.REMOVING_LABEL : COPY.REMOVE_CONFIRM_YES}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("view")}
              className="min-h-tap-min rounded-sm px-2 text-sm font-medium text-text-subtle transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {COPY.REMOVE_KEEP}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
