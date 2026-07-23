"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PullSheetOverrideWire } from "@/components/admin/review/sectionData";
import {
  ARCHIVED_TAB_BTN,
  ARCHIVED_TAB_GHOST_BTN,
} from "@/components/admin/wizard/archivedTabOffer";

/**
 * Published-show Gear-section archived-tab include (spec 2026-07-23 §2.1). Distinct from the
 * wizard offer (that one posts to the onboarding route with a wizard session); this posts to
 * the published route with scan-at-click + structural CAS. Two modes: an OFFER card (P2, one
 * per un-included archived tab) and an override NOTE (P3, with Undo when the show is mutable).
 *
 * Failure copy is inline component text (invariant 5 — no raw status token reaches the DOM).
 * Only a 409 `stale_review` auto-refreshes (§2.4 P-err lifetime rule); `lifecycle_conflict`
 * keeps its own copy and does NOT take the auto-refresh path.
 */

// §7 copy table. Keyed by wire status; the generic bucket is total over anything unrecognized.
const COPY = {
  stale_review: "This changed elsewhere. Refreshing to the latest state.",
  no_pull_sheet_region: "That tab is no longer in the sheet. Re-check the sheet, then try again.",
  lifecycle_conflict: "This show is no longer editable here. Refresh to see its current state.",
  generic: "Something went wrong on our side. Try again in a moment.",
} as const;

function syncLine(kind: "set" | "cleared", syncKind: string): string {
  const verb = kind === "set" ? "Saved" : "Undone";
  if (syncKind === "stage") {
    return kind === "set"
      ? "Saved. This change is held for review, so gear appears after that review is applied."
      : "Undone. This change is held for review, so it shows after that review is applied.";
  }
  return `${verb}. The sync did not finish, so the change shows after the next sync, or use Re-sync.`;
}

type PostResult = { ok: boolean; status?: string; sync?: { ok: boolean; kind: string } };

async function postOverride(body: unknown): Promise<{ res: Response; json: PostResult }> {
  const res = await fetch("/api/admin/show/pull-sheet-override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: PostResult = { ok: false };
  try {
    json = (await res.json()) as PostResult;
  } catch {
    // non-JSON body → generic
  }
  return { res, json };
}

type BaseProps = {
  slug: string;
  driveFileId: string | null;
  wire: PullSheetOverrideWire;
  /** published && !archived && driveFileId != null — gates the mutating actions. */
  canMutate: boolean;
  onDismissFocus?: () => void;
};

/** P2 offer card: fold one archived-tab pull sheet into this published show's gear. */
export function PublishedArchivedTabOffer(props: BaseProps & { tabName: string }) {
  const { tabName, driveFileId, wire, canMutate, onDismissFocus } = props;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transient, setTransient] = useState<string | null>(null);

  if (dismissed) return null;
  // A read-only surface (archived / unpublished / no drive id) has no acceptable action, so the
  // offer would dangle a descriptive line with no button. Suppress it entirely (the P3 note
  // still renders read-only as status; only the actionable offer is hidden). In practice the
  // modal never attaches an offer for a non-mutable show — this is a defensive guard.
  if (!canMutate) return null;

  async function include() {
    if (pending || !canMutate) return;
    setError(null);
    setTransient(null);
    setPending(true);
    try {
      const { res, json } = await postOverride({
        driveFileId,
        tabName, // RAW, exact (no trim)
        expectedOverrideSnapshot: wire,
      });
      if (res.ok) {
        if (json.sync && !json.sync.ok) setTransient(syncLine("set", json.sync.kind));
        router.refresh();
        return;
      }
      if (json.status === "stale_review") {
        setError(COPY.stale_review);
        router.refresh();
        return;
      }
      setError(COPY[json.status as keyof typeof COPY] ?? COPY.generic);
    } catch {
      setError(COPY.generic);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-testid="published-archived-tab-offer"
      className="flex flex-col gap-2 rounded-sm border border-border-strong bg-surface-sunken p-3 text-sm"
    >
      <p className="text-text">
        Gear list found on the archived tab{" "}
        <span className="font-medium text-text-strong">{tabName}</span>. We left it out to avoid
        mixing in old gear.
      </p>
      {transient ? <p className="text-xs text-text-subtle">{transient}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-warning-text">
          {error}
        </p>
      ) : null}
      {canMutate ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={ARCHIVED_TAB_BTN}
            disabled={pending}
            aria-busy={pending}
            onClick={include}
          >
            {pending ? "Including…" : "Include this gear"}
          </button>
          <button
            type="button"
            className={ARCHIVED_TAB_GHOST_BTN}
            disabled={pending}
            onClick={() => {
              setDismissed(true);
              onDismissFocus?.();
            }}
          >
            Skip
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** P3 override-active note: states intent (gear included on next sync), with Undo when mutable. */
export function PublishedArchivedTabIncludedNote(props: BaseProps) {
  const { wire, driveFileId, canMutate } = props;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transient, setTransient] = useState<string | null>(null);

  // Generic label when the stored tab name is unusable (null or empty) — degraded P3.
  const label =
    wire && typeof wire.tabName === "string" && wire.tabName.length > 0
      ? wire.tabName
      : "an archived tab";

  async function undo() {
    if (pending || !canMutate) return;
    setError(null);
    setTransient(null);
    setPending(true);
    try {
      const { res, json } = await postOverride({
        driveFileId,
        tabName: null, // revoke
        expectedOverrideSnapshot: wire,
      });
      if (res.ok) {
        if (json.sync && !json.sync.ok) setTransient(syncLine("cleared", json.sync.kind));
        router.refresh();
        return;
      }
      if (json.status === "stale_review") {
        setError(COPY.stale_review);
        router.refresh();
        return;
      }
      setError(COPY[json.status as keyof typeof COPY] ?? COPY.generic);
    } catch {
      setError(COPY.generic);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-testid="published-archived-tab-note"
      className="flex flex-col gap-2 rounded-sm border border-border-strong bg-surface-sunken p-3 text-sm"
    >
      <p className="text-text">
        Gear from tab <span className="font-medium text-text-strong">{label}</span> is included when
        this show syncs.
      </p>
      {transient ? <p className="text-xs text-text-subtle">{transient}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-warning-text">
          {error}
        </p>
      ) : null}
      {canMutate ? (
        <div className="flex flex-wrap gap-2">
          {/* Lone action → bordered button (not ghost): with nothing to contrast against, a
              ghost reads as a text link. Mirrors the wizard S3 Revoke's bordered treatment. */}
          <button
            type="button"
            className={ARCHIVED_TAB_BTN}
            disabled={pending}
            aria-busy={pending}
            onClick={undo}
          >
            {pending ? "Undoing…" : "Undo"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
