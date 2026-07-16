/**
 * app/admin/settings/roles/RolesSettingsView.tsx
 *
 * Presentational body for the settings "Roles you've added" page (spec 2026-07-15
 * §8.2). Pure — no server-only deps — so it renders in both the RSC page and the
 * component tests. Three branches, kept explicitly distinct (invariant 9 /
 * plan-R2 F5): an `infra_error` load result renders a plain-language FAILURE state,
 * NEVER the empty state — a masked infra fault must never read as "no roles added".
 * Every string flows through `roleRecognizeCopy`.
 */

import type { RoleMappingListResult } from "@/lib/admin/roleTokenMappings";
import * as COPY from "@/components/admin/roleRecognizeCopy";
import { RoleMappingRow } from "@/app/admin/settings/roles/RoleMappingRow";

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RolesSettingsView({
  result,
  actorEmail,
}: {
  result: RoleMappingListResult;
  actorEmail: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
          {COPY.SETTINGS_EYEBROW}
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-text-strong">
          {COPY.SETTINGS_TITLE}
        </h1>
        <p className="text-sm text-text-subtle">{COPY.SETTINGS_SUBTITLE}</p>
      </div>

      {result.kind === "infra_error" ? (
        <div
          data-testid="roles-settings-load-error"
          className="rounded-md border border-border-strong bg-warning-bg px-4 py-3 text-sm text-warning-text"
          role="alert"
        >
          {COPY.LOAD_FAILURE}
        </div>
      ) : result.rows.length === 0 ? (
        <div
          data-testid="roles-settings-empty"
          className="flex flex-col gap-1.5 rounded-md border border-dashed border-border-strong bg-surface px-4 py-5 text-center"
        >
          <span className="text-sm font-semibold text-text-strong">{COPY.EMPTY_TITLE}</span>
          <p className="text-sm text-text-subtle">{COPY.EMPTY_BODY}</p>
        </div>
      ) : (
        <ul className="flex list-none flex-col gap-2.5 p-0">
          {result.rows.map((r) => (
            <RoleMappingRow
              key={r.token}
              row={{
                token: r.token,
                grants: r.grants,
                decidedByLabel: r.decidedBy === actorEmail ? COPY.YOU_LABEL : r.decidedBy,
                decidedAtLabel: shortDate(r.decidedAt),
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
