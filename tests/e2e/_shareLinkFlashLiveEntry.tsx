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
 * PRODUCTION ANCESTRY, not a bare mount and not an imitation of one. A rule
 * scoped to an ancestor selector suppresses the cue in the app while leaving an
 * isolated element green — adversaries A18 and A28.
 *
 * An earlier version of this harness hand-built a panel carrying
 * ReviewModalShell's clip and PopoverHostContext. That was not enough: it
 * reproduced exactly the one attribute A18 happened to target and nothing else,
 * so a rule scoped to any OTHER real ancestor went undetected. It now mounts the
 * REAL `ReviewModalShell` with the REAL `StatusStrip` in its `footer` slot,
 * which is what A28 (a rule scoped to the modal root) needs in order to fail.
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

import { StatusStrip, type StatusStripProps } from "@/components/admin/showpage/StatusStrip";
import { ReviewModalShell } from "@/components/admin/review/ReviewModalShell";
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

/**
 * The REAL ReviewModalShell, with the REAL StatusStrip in its footer slot
 * (docked 2026-08-25; a harness left in the subHeader slot would reproduce a
 * topology production no longer has, and anything measured through it would
 * describe the wrong modal).
 *
 * A hand-built panel carrying `data-review-modal-panel` was not enough: it
 * reproduced only the one attribute an adversary happened to target, so any
 * rule scoped to a real ancestor could suppress the production cue while the
 * synthetic harness stayed green. Mounting the shell means the ancestry under
 * test is the ancestry that ships — the subheader wrapper, the panel's clip,
 * and the PopoverHostContext the popover portals into.
 *
 * Round-2 review proposed a SUBHEADER-scoped rule as that adversary. Running it
 * (A28) disproved the example while confirming the gap: the popover portals OUT
 * of the subheader into the panel, so a subheader-scoped selector cannot match
 * the cue in production either. The reachable version is a rule scoped to the
 * modal ROOT above the panel, which is what A28 now mutates and what this
 * harness — unlike the synthetic one — actually has.
 */
function Harness() {
  const focusRef = useRef<HTMLButtonElement>(null);
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
          <ReviewModalShell
            open
            onClose={() => {}}
            labelledBy="flash-harness-title"
            dataAttrPrefix="review-modal"
            testIdBase="published-show-review"
            initialFocusRef={focusRef}
            header={
              <h2 id="flash-harness-title" className="text-sm font-semibold text-text-strong">
                Flash Harness Show
              </h2>
            }
            footer={<StatusStrip {...stripProps()} />}
          >
            <div className="h-[420px] px-4 py-3 text-sm text-text-subtle">
              Panel body. The popover portals into this panel, so its clip and stacking context are
              the ones production uses.
              <button ref={focusRef} type="button" className="sr-only">
                focus anchor
              </button>
            </div>
          </ReviewModalShell>
        </DevActionOverrideContext.Provider>
      </ShareTokenProvider>
    </AppRouterContext.Provider>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<Harness />);
