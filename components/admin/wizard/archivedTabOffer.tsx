"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";
import { overrideSnapshotsEqual, type OverrideSnapshot } from "@/lib/sync/pullSheetOverride";

/**
 * Pure S-state derivation for archived-tab pull-sheet offers (spec §4.2), the
 * SINGLE source shared by PackListBreakdown and the Step-3 Resolve box. Extracted
 * verbatim from `step3ReviewSections.tsx` (incl. PSAT-1's durable-snapshot /
 * S5-divergence model) so both surfaces show exactly the same offer set (parity).
 *
 *  - includedTab:     the tab flagged `included` in the parse preview (staged only).
 *  - previewSnapshot: {tabName,fingerprint} of that included tab, else null.
 *  - overrideActive:  a durable override snapshot exists (`pullSheetOverride !== null`).
 *  - divergent (S5):  the durable override and the preview disagree — only a re-scan
 *                     heals it, so it preempts the S2/S3 offer/revoke affordances.
 *  - offers:          non-included tabs to offer, empty when not staged, divergent,
 *                     or an override is already active (single-override contract).
 */
export function deriveArchivedOffers(
  tabs: ArchivedPullSheetTab[],
  staged: boolean,
  pullSheetOverride: OverrideSnapshot,
): {
  overrideActive: boolean;
  includedTab: ArchivedPullSheetTab | null;
  previewSnapshot: OverrideSnapshot;
  divergent: boolean;
  offers: ArchivedPullSheetTab[];
} {
  const includedTab = staged ? (tabs.find((t) => t.included) ?? null) : null;
  const previewSnapshot: OverrideSnapshot = includedTab
    ? { tabName: includedTab.tabName, fingerprint: includedTab.fingerprint }
    : null;
  const overrideActive = pullSheetOverride !== null;
  const divergent = staged && !overrideSnapshotsEqual(pullSheetOverride, previewSnapshot);
  const offers = staged && !divergent && !overrideActive ? tabs.filter((t) => !t.included) : [];
  return { overrideActive, includedTab, previewSnapshot, divergent, offers };
}

// The archived-tab CTA grammar. The load-bearing action (accept / revoke) is the
// bordered button that mirrors RescanSheetButton; the dismiss ("Keep skipped") is
// a quieter ghost so a glancing operator reads the primary action first (impeccable
// critique P2 — hierarchy WITHIN the neutral palette, never spending the ≤10% orange).
const ARCHIVED_TAB_BTN =
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
// Resting color is text-text (NOT text-subtle — DESIGN.md:27 bars subtle on action
// targets); the border-transparent + no-fill is what makes it read as secondary.
const ARCHIVED_TAB_GHOST_BTN =
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-transparent px-4 text-sm font-medium text-text transition-colors duration-fast hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

export async function postPullSheetOverride(
  body: unknown,
): Promise<{ ok: boolean; refresh: boolean }> {
  const response = await fetch("/api/admin/onboarding/pull-sheet-override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // On success OR a 409 stale-review (the server re-scanned to the new
  // fingerprint), re-fetch the preview so the re-rendered card carries the fresh
  // state instead of a bespoke error (plan-R1-3). Any other status is a real
  // failure surfaced as an inline line (no raw code — invariant 5).
  return { ok: response.ok, refresh: response.ok || response.status === 409 };
}

// Generic client-side transport-failure chrome (accept/revoke POST failed with no server
// code to route through the message catalog; success + 409 both re-fetch the preview).
// This is a plain inline literal, NOT catalog copy — no raw code (invariant 5).
// not-subject:M5-D8 — friendly fallback copy, not a §12.4-coded message.
const ARCHIVED_TAB_ERROR =
  "That didn’t go through. Refresh and try again, or contact the developer if it keeps happening.";

type ArchivedTabOfferProps = {
  dfid: string | null;
  wizardSessionId: string;
  tab: ArchivedPullSheetTab;
  /** Distinct test id per surface (box vs pack-list). Defaults to the pack-list id. */
  testId?: string;
} & (
  | { showDismiss?: true; onDismissFocus: () => void }
  | { showDismiss: false; onDismissFocus?: never }
);

/** S2 offer / S4 re-confirm: a warning card offering to fold one archived-tab
 *  pull sheet into this show's gear. Accept POSTs the row-state-CAS body (no
 *  active override → expectedOverrideSnapshot null). "Keep skipped" is a local
 *  dismiss — the default state is already skipped, so nothing is written. When
 *  `showDismiss` is false (the Resolve box) the dismiss is omitted so the box's
 *  archived region is a pure function of server offers (spec §4.5b). */
export function ArchivedTabOffer(props: ArchivedTabOfferProps) {
  const { dfid, wizardSessionId, tab, testId } = props;
  const showDismiss = props.showDismiss !== false;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  async function accept() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const { refresh } = await postPullSheetOverride({
        driveFileId: dfid,
        wizardSessionId,
        tabName: tab.tabName,
        expectedFingerprint: tab.fingerprint,
        expectedOverrideSnapshot: null,
      });
      if (refresh) {
        router.refresh();
        return;
      }
      setError(ARCHIVED_TAB_ERROR);
    } catch {
      setError(ARCHIVED_TAB_ERROR);
    } finally {
      setPending(false);
    }
  }

  // S4 (content changed after acceptance) is a genuine "act before it publishes"
  // state → warm warning tone. S2 (first discovery) is neutral information, not a
  // problem → the quieter info tone (impeccable critique P3).
  const changed = tab.contentChangedSinceAccept;
  // Both tones use border-strong so the tinted card edge stays visible when the
  // offer renders inside the Resolve box's `bg-surface-sunken` panel (info-bg fill
  // is ~1:1 against sunken in light mode — the border is the only delineation;
  // impeccable audit P3). S2↔S4 stay distinct via info-vs-warning fill + text.
  const cardTone = changed
    ? "border-border-strong bg-warning-bg text-warning-text"
    : "border-border-strong bg-info-bg text-text-strong";

  return (
    <div
      data-testid={testId ?? `pack-list-archived-offer-${dfid}-${tab.tabName}`}
      className={`flex flex-col gap-2 rounded-sm border p-3 text-sm ${cardTone}`}
    >
      <p className="font-medium">
        {changed
          ? `The archived tab ‘${tab.tabName}’ changed. Re-confirm before it publishes.`
          : `Found a pull sheet on archived tab ‘${tab.tabName}’.`}
      </p>
      <ul className="flex flex-col gap-0.5 text-xs">
        {tab.headerPreviews.map((preview, i) => (
          <li key={`${tab.tabName}-preview-${i}`} className="wrap-break-word">
            Case {i + 1} header reads ‘{preview.trim() ? preview : "(no header text)"}’.
          </li>
        ))}
      </ul>
      {/* The "leave it skipped" clause names the ghost dismiss; omit it in the
          box variant (showDismiss=false) where inaction — not a button — is the skip. */}
      <p>
        If this is this show’s gear, include it{showDismiss ? "; otherwise leave it skipped" : ""}.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={pending}
          aria-busy={pending}
          className={ARCHIVED_TAB_BTN}
        >
          {pending ? "Including…" : "Use this show’s gear"}
        </button>
        {showDismiss ? (
          <button
            type="button"
            onClick={() => {
              // Move focus to the persistent section BEFORE the card (and this
              // button) unmount, so focus never drops to <body> in the trapped modal.
              props.onDismissFocus?.();
              setDismissed(true);
            }}
            disabled={pending}
            className={ARCHIVED_TAB_GHOST_BTN}
          >
            Keep skipped
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="status" aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** S3: the subtle "this pack list came from an archived tab" note + Revoke.
 *  Revoke POSTs tabName:null with the active override's snapshot as the row-state
 *  CAS baseline (spec §5.4). */
export function ArchivedTabIncludedNote({
  dfid,
  wizardSessionId,
  tab,
}: {
  dfid: string | null;
  wizardSessionId: string;
  tab: ArchivedPullSheetTab;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const { refresh } = await postPullSheetOverride({
        driveFileId: dfid,
        wizardSessionId,
        tabName: null,
        expectedOverrideSnapshot: { tabName: tab.tabName, fingerprint: tab.fingerprint },
      });
      if (refresh) {
        router.refresh();
        return;
      }
      setError(ARCHIVED_TAB_ERROR);
    } catch {
      setError(ARCHIVED_TAB_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-info-bg px-3 py-2 text-sm text-text-strong">
      <p className="wrap-break-word min-w-0 flex-1">Included from archived tab ‘{tab.tabName}’.</p>
      <button
        type="button"
        onClick={revoke}
        disabled={pending}
        aria-busy={pending}
        className={ARCHIVED_TAB_BTN}
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {error ? (
        <p role="status" aria-live="polite" className="basis-full">
          {error}
        </p>
      ) : null}
    </div>
  );
}
