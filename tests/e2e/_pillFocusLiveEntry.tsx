/**
 * tests/e2e/_pillFocusLiveEntry.tsx
 * (spec 2026-07-21-attention-needs-attention-split §6a — the focus probe entry)
 *
 * Browser ENTRY for the LIVE hydrated harness: mounts the REAL
 * <PublishedReviewModal> (via the shared modalElement fixture builder) and
 * exposes `window.__setItems(a, n, s, degraded)` so the Playwright probe can
 * drive LIVE attention-item transitions while the menu is open. React
 * reconciles by component identity, so re-rendering with new items preserves
 * the modal's internal state (menuOpen) — exactly the mid-open live-update the
 * §6 outcome contract covers.
 *
 * `window.__hydrated` flips true after the first mount commit — the spec gates
 * on it (never networkidle). All state driving goes through React state (no
 * locator.evaluate on nodes that unmount mid-transition — detach-safe).
 *
 * NEVER imported by a Playwright spec (babel transform rewrites JSX);
 * attention-pill-focus.spec.ts bundles this out-of-process with pinned esbuild
 * and serves it, mirroring _compactAlertCardLiveEntry.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { modalElement, type HarnessStateOverrides } from "./_publishedReviewModalHarness";
import type { AttentionItem } from "@/lib/admin/attentionItems";

type AlertItem = Extract<AttentionItem, { kind: "alert" }>;

function mkItem(
  id: string,
  code: string,
  over: Partial<AlertItem> & { action?: AlertItem["alert"]["action"] } = {},
): AttentionItem {
  const { action = null, ...rest } = over;
  return {
    id: `alert:${id}`,
    kind: "alert",
    tone: "notice",
    sectionId: "overview",
    crewKey: null,
    actionable: false,
    menuTitle: `Probe ${id}`,
    menuSubtitle: null,
    alert: {
      alertId: id,
      code,
      template: null,
      params: {},
      action,
      helpHref: null,
      raisedAt: "2026-07-21T09:00:00.000Z",
      occurrenceCount: 1,
      autoClearNote: "note",
      failedKeys: null,
      dataGaps: null,
      errorCode: null,
    },
    ...rest,
  };
}

const SHEET_HREF = "https://docs.google.com/spreadsheets/d/PROBEFILE/edit#gid=0";

/** A title long enough to force the row's `truncate` to engage, so the layout
 *  probe can prove a long title ellipsises instead of widening the panel. */
const LONG_TITLE =
  "A crew member's row changed while a rename was still pending and nobody has picked what happens next yet";

function buildItems(a: number, n: number, s: number, longTitles = false): AttentionItem[] {
  const title = (fallback: string) => (longTitles ? LONG_TITLE : fallback);
  return [
    ...Array.from({ length: a }, (_, i) =>
      mkItem(`a${i}`, "AMBIGUOUS_EMAIL_BINDING", {
        actionable: true,
        menuTitle: title(`Probe a${i}`),
      }),
    ),
    ...Array.from({ length: n }, (_, i) =>
      mkItem(`n${i}`, "SHEET_UNAVAILABLE", {
        clearingKind: "needs_look",
        menuTitle: title(`Probe n${i}`),
        action: { label: "Open in Sheet", href: SHEET_HREF, external: true },
      }),
    ),
    ...Array.from({ length: s }, (_, i) =>
      mkItem(`s${i}`, "SYNC_STALLED", { clearingKind: "self_heal" }),
    ),
  ];
}

declare global {
  interface Window {
    __setItems?: (a: number, n: number, s: number, degraded: boolean, longTitles?: boolean) => void;
    /** review-modal-strip-dock §7: drives a REFUSAL through the real modal.
     *  `null` restores the default, so a probe can turn it back off. */
    __setRefusal?: (code: string | null) => void;
    __hydrated?: boolean;
    /** Installed by the spec's frame-hold init script, not by this entry. */
    __releaseFrames?: () => void;
    __heldFrameCount?: () => number;
  }
}

function App() {
  const [state, setState] = useState({
    a: 1,
    n: 1,
    s: 1,
    degraded: false,
    longTitles: false,
  });
  const [refusalCode, setRefusalCode] = useState<string | null>(null);
  useEffect(() => {
    window.__setItems = (a, n, s, degraded, longTitles = false) =>
      setState({ a, n, s, degraded, longTitles });
    window.__setRefusal = (code) => setRefusalCode(code);
    window.__hydrated = true;
  }, []);
  const overrides: HarnessStateOverrides = {
    attentionItems: buildItems(state.a, state.n, state.s, state.longTitles),
    alertsDegraded: state.degraded,
    // Passed ONLY when set, so the DEFAULT tree is byte-identical (AC-10).
    // The consumer census, taken from disk on 2026-08-30 rather than from
    // memory: TWO other e2e suites bundle and DRIVE this entry --
    // attention-pill-focus.spec.ts and popover-clip-fit.spec.ts -- and neither
    // calls __setRefusal or __setCrewWarnings, so both see exactly the tree
    // they saw before these fields existed. A third consumer,
    // tests/components/admin/sheetIconLinkContainment.test.ts, does not render
    // this entry at all: it SCANS this file's source and pins the count of the
    // Google Sheets URL literal, so it is sensitive to that literal rather
    // than to the rendered tree. An earlier version of this comment named two
    // consumers when three existed, and miscategorised one of them.
    //
    // DOCUMENTED LIMIT (spec 2026-08-30 AC-2b, probed 2026-08-30): this entry
    // CANNOT render the pill's sheet-warnings segment, so the pill's
    // three-segment worst case is unreachable here. `withCrewWarnings` makes
    // the harness build the real section warning model, which reaches
    // `node:crypto` through report surface ids and is subprocess-only; a
    // browser bundle throws and the whole modal fails to render. Probed by
    // adding the opt-in setter and watching all seven cases in
    // attention-autoopen-suppress.spec.ts fail with the panel absent. The
    // occlusion cases therefore run at the tallest load this entry CAN reach,
    // `6 issues · 3 monitoring`. Re-file trigger: the next arc touching the
    // attention pill's hit band, or any change that makes the warning model
    // bundle-safe.
    ...(refusalCode !== null
      ? { setPublished: async () => ({ ok: false as const, code: refusalCode }) }
      : {}),
  };
  return modalElement(0, overrides);
}

const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(<App />);
