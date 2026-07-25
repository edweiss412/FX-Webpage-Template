/**
 * tests/e2e/_shareLinkFlashLiveEntry.tsx
 *
 * Browser ENTRY for the LIVE share-link cue harness (spec
 * 2026-07-24-share-link-chrome-backlog-design §9.2/§9.3): mounts the REAL
 * StatusStrip -> ShareHub tree against compiled Tailwind CSS so the cue's
 * RESOLVED style can be measured in a real engine. jsdom applies no CSS and a
 * regex over the stylesheet cannot see the cascade, so this is the only place
 * an ancestor-qualified override, a later duplicate keyframe or a paused track
 * would be caught.
 *
 * PRODUCTION ANCESTRY, not a bare mount. A rule scoped to an ancestor selector
 * would suppress the cue in the app while leaving an isolated element green —
 * adversary A18 exactly. The chain here is the real StatusStrip inside a panel
 * carrying ReviewModalShell's `overflow-clip` + `PopoverHostContext`, which is
 * what the popover portals into in production.
 *
 * The rotate is driven through the PRODUCTION OVERRIDE SEAM, not the server
 * action: the bundle elides `"use server"` modules into throwing stubs, so a
 * real action call cannot resolve. `RotateShareTokenButton` already reads
 * `useDevActionOverride("rotateShareToken")` and prefers it, so supplying a
 * fake there exercises the real two-tap confirm, the real epoch gate and the
 * real remount, substituting only the network hop.
 *
 * NEVER imported by a Playwright spec (its babel transform rewrites
 * spec-imported .tsx); share-link-flash.spec.ts bundles this out of process.
 */
import React, { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

import { PopoverHostContext } from "@/components/admin/HoverHelp";
import { StatusStrip, type StatusStripProps } from "@/components/admin/showpage/StatusStrip";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { DevActionOverrideContext } from "@/components/admin/dev/actionOverrideContext";

const SLUG = "share-link-flash-show";
const T1 = "a".repeat(64);
const T2 = "b".repeat(64);
const T3 = "c".repeat(64);

const stubRouter = {
  refresh() {},
  push() {},
  replace() {},
  back() {},
  forward() {},
  prefetch() {},
  hmrRefresh() {},
} as unknown as AppRouterInstance;

function stripProps(): StatusStripProps {
  return {
    showId: "11111111-2222-4333-8444-555555555555",
    crewEmails: [],
    showTitle: "Flash Harness Show",
    pickerCrew: [],
    archiveAction: async () => ({ ok: true }) as const,
    unarchiveAction: async () => {},
    slug: SLUG,
    archived: false,
    published: true,
    finalizeOwned: false,
    setPublished: async () => ({ ok: true }) as const,
    isLive: false,
    lastSyncedAt: "2026-05-02T12:00:00.000Z",
    lastCheckedAt: "2026-05-02T12:00:00.000Z",
    lastSyncStatus: "ok",
    now: new Date("2026-05-02T13:00:00.000Z"),
  };
}

/** ReviewModalShell's panel, reduced to the properties that matter for the
 *  cascade and the portal: the clip container that hosts the popover. */
function Harness() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [rotations, setRotations] = useState(0);

  // Successive tokens, so a second rotate is a genuinely different URL. The
  // real epoch gate still adjudicates each one.
  const rotateShareToken = useCallback(async () => {
    const next = rotations === 0 ? T2 : T3;
    setRotations((n) => n + 1);
    return { ok: true as const, new_share_token: next, new_epoch: 6 + rotations };
  }, [rotations]);

  return (
    <AppRouterContext.Provider value={stubRouter}>
      <ShareTokenProvider initialToken={T1} initialEpoch={5}>
        <DevActionOverrideContext.Provider value={{ rotateShareToken }}>
          <div
            ref={panelRef}
            data-review-modal-panel=""
            className="relative mx-auto mt-10 w-[720px] overflow-clip rounded-md border border-border bg-surface shadow-popover"
          >
            <PopoverHostContext.Provider value={panelRef}>
              <div className="border-b border-border px-4 py-2">
                <StatusStrip {...stripProps()} />
              </div>
              <div className="h-[420px] px-4 py-3 text-sm text-text-subtle">
                Panel body — the popover portals into this panel, so its clip and stacking context
                are the ones production uses.
              </div>
            </PopoverHostContext.Provider>
          </div>
        </DevActionOverrideContext.Provider>
      </ShareTokenProvider>
    </AppRouterContext.Provider>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<Harness />);
