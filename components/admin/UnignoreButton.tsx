"use client";

/**
 * components/admin/UnignoreButton.tsx (Task E2 — spec §6.2/§6.3)
 *
 * Per-row "Un-ignore" control on the Ignored-sheets view. POSTs to the existing
 * route (Task C2):
 *
 *   POST /api/admin/ignored-sheets/[driveFileId]/unignore
 *
 * which deletes the LIVE permanent_ignore deferral under the per-show advisory
 * lock (server-only DML; PostgREST lockdown). On success the sheet re-surfaces
 * on the next scan; the page is refreshed so the row leaves the list
 * immediately (router.refresh()).
 *
 * Quiet, reversible action → a restrained bordered button (not the accent),
 * matching the project's secondary-button idiom (UndoChangeButton). It disables
 * on its own in-flight flag; on failure a plain-language line renders (no raw
 * code in the DOM, invariant 5).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export type UnignoreButtonProps = {
  driveFileId: string;
};

export function UnignoreButton({ driveFileId }: UnignoreButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleClick = async () => {
    if (pending) return;
    setFailed(false);
    setPending(true);
    try {
      const res = await fetch(
        `/api/admin/ignored-sheets/${encodeURIComponent(driveFileId)}/unignore`,
        { method: "POST" },
      );
      const json = (await res.json().catch(() => ({}))) as { status?: string };
      if (res.ok && json.status === "unignored") {
        router.refresh();
      } else {
        setFailed(true);
        setPending(false);
      }
    } catch {
      setFailed(true);
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
        data-testid={`unignore-button-${driveFileId}`}
        className="min-h-tap-min rounded-sm border border-border-strong bg-surface px-4 py-1.5 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Un-ignoring…" : "Un-ignore"}
      </button>
      {failed ? (
        <p
          role="alert"
          data-testid={`unignore-error-${driveFileId}`}
          className="text-sm text-warning-text"
        >
          That didn’t go through. Try again in a moment.
        </p>
      ) : null}
    </div>
  );
}
