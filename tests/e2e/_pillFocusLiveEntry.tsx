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

function buildItems(a: number, n: number, s: number): AttentionItem[] {
  return [
    ...Array.from({ length: a }, (_, i) =>
      mkItem(`a${i}`, "AMBIGUOUS_EMAIL_BINDING", { actionable: true }),
    ),
    ...Array.from({ length: n }, (_, i) =>
      mkItem(`n${i}`, "SHEET_UNAVAILABLE", {
        clearingKind: "needs_look",
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
    __setItems?: (a: number, n: number, s: number, degraded: boolean) => void;
    __hydrated?: boolean;
  }
}

function App() {
  const [state, setState] = useState({ a: 1, n: 1, s: 1, degraded: false });
  useEffect(() => {
    window.__setItems = (a, n, s, degraded) => setState({ a, n, s, degraded });
    window.__hydrated = true;
  }, []);
  const overrides: HarnessStateOverrides = {
    attentionItems: buildItems(state.a, state.n, state.s),
    alertsDegraded: state.degraded,
  };
  return modalElement(0, overrides);
}

const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(<App />);
