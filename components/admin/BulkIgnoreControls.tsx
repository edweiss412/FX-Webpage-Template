"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BulkIgnoreGroup } from "@/lib/dataQuality/bulkIgnoreGroups";

export type BulkIgnoreGroupWithLabel = BulkIgnoreGroup & {
  /** Plain-language type label (catalog title / data-gap label), or null. Never the raw code. */
  label: string | null;
};

type Props = { slug: string; groups: BulkIgnoreGroupWithLabel[] };
type State = { kind: "idle" } | { kind: "running"; code: string } | { kind: "error"; copy: string };

// Same neutral button skin as the per-warning Ignore control. Sits on the amber
// warning-bg panel body, so the focus ring-offset matches that background.
const BTN =
  "inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg";

/**
 * DQIGNORE-2 — a per-code "Ignore all N" affordance shown ABOVE the active
 * data-quality card list when a code has >=2 distinct-content ignorable warnings.
 * Each click fans out ONE `/data-quality/ignore` POST per distinct item (precise
 * per-fingerprint inserts, reusing the idempotent single-ignore route), then
 * refreshes so the ignored warnings drop into the "Ignored (N)" subsection.
 * Renders nothing when there are no bulk-eligible groups.
 */
export function BulkIgnoreControls({ slug, groups }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  if (groups.length === 0) return null;

  async function ignoreGroup(group: BulkIgnoreGroupWithLabel) {
    setState({ kind: "running", code: group.code });
    const failCopy = "Couldn't ignore those warnings. Refresh and try again.";
    try {
      const results = await Promise.all(
        group.items.map((it) =>
          fetch(`/api/admin/show/${encodeURIComponent(slug)}/data-quality/ignore`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code: it.code, rawSnippet: it.rawSnippet }),
          })
            .then((r) => r.ok)
            .catch(() => false),
        ),
      );
      if (results.every(Boolean)) {
        router.refresh();
        return;
      }
      setState({ kind: "error", copy: failCopy });
    } catch {
      setState({ kind: "error", copy: failCopy });
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="dq-bulk-ignore">
      {groups.map((group) => {
        const running = state.kind === "running" && state.code === group.code;
        return (
          <button
            key={group.code}
            type="button"
            data-testid={`dq-bulk-ignore-${group.code}`}
            onClick={() => void ignoreGroup(group)}
            disabled={state.kind === "running"}
            className={BTN}
          >
            {running ? "Ignoring…" : `Ignore all ${group.items.length}`}
            {group.label ? (
              <span className="ml-1 font-normal text-text-subtle">· {group.label}</span>
            ) : null}
          </button>
        );
      })}
      {state.kind === "error" ? (
        <p
          role="alert"
          data-testid="dq-bulk-ignore-error"
          className="rounded-sm border border-border-strong bg-warning-bg p-2 text-xs text-warning-text"
        >
          {state.copy}
        </p>
      ) : null}
    </div>
  );
}
