"use client";

/**
 * components/admin/telemetry/TelemetryRetryButton.tsx
 *
 * The recourse half of every infra fallback on the telemetry page
 * (BL-TELEMETRY-FALLBACK-RETRY, #601 impeccable critique P1). Each of the three states
 * the cause and offers nothing to do about it, so the only way to re-read is a full page
 * reload. One of the three even says "Refresh in a moment.", instructing the reader to do
 * by hand what this button does.
 *
 * The treatment is `SECONDARY_ACTION_ON_TINTED_CLASS` (`lib/ui/actionClass.ts:78`), taken
 * rather than rewritten: that constant exists so "the next tinted-plate caller finds a
 * treatment instead of inventing a sixth one", and an earlier draft of this file invented
 * the sixth, diverging on padding and on the disabled states.
 *
 * It is the manual-refresh idiom this page already carries: same rotate icon, same one-tap
 * contract, same `router.refresh()` (`AutoRefreshControl.tsx:19`). Deliberately NOT the
 * same border token. That button stands on `bg-surface`; all three fallbacks are
 * `bg-warning-bg`, where `text-faint` misses the 3:1 non-text floor in one theme, so
 * tinted plates get their own outline token (2026-08-25 ui-polish-class-sweep D2). That is
 * enforced: `tests/styles/tintedPlateOutline.test.ts` derives its subjects from the
 * ring-offset token, so this control enrols on arrival.
 *
 * No pending state, deliberately. `router.refresh()` returns no in-flight signal, the
 * control this mirrors has none either, and a disable would introduce the one piece of
 * state that could strand a surface whose entire defect is having no recourse.
 *
 * The status region is mounted WITH the button and filled on activation. A live region
 * inserted together with its text is never announced.
 *
 * It is the SANCTIONED APPEND CHANNEL, not a hand-rolled text swap. Two message kinds
 * now share one region and either can recur verbatim across taps, which is exactly the
 * condition DESIGN.md §15 names for choosing `role="log"` over `role="status"`: an
 * identical text change may not re-announce, while an identical addition always does.
 * `components/admin/announceLog.tsx` is that implementation, and the same section says
 * not to hand-roll a third copy. Taking it deletes the sequence counter and the
 * trailing-U+00A0 parity trick this control used to carry, whose reliability varies by
 * assistive technology.
 *
 * The owner-stability half of that rule is knowingly excepted here. The region unmounts
 * with the fallback branch, which is the settled success-path silence: every message
 * this control sends is sent while the branch is still standing, so no announcement is
 * ever racing the flip that destroys it.
 *
 * The OUTCOME half (TELEMETRY-RETRY-OUTCOME-ANNOUNCEMENT-1). `router.refresh()` hands
 * back no completion signal, so the only honest one is a value the SERVER render
 * changes: `renderedAt` is the timestamp of the render that produced this fallback. A
 * tap records what it saw; a later render carrying a different value means a server
 * re-read completed and this branch STILL failed, which is a settled outcome. The
 * baseline clears with the announcement, so later renders stay quiet until the next tap.
 * Success needs nothing here, since it unmounts this control with its branch.
 *
 * Any difference settles it, in either direction, never an ordering test: a clock
 * correction can move the value backwards and that render still re-read. Both guards
 * are `Number.isFinite` rather than truthiness or an `isNaN` test, because zero is a
 * valid instant and ±Infinity is not a completed render.
 *
 * `what` is a noun phrase naming the thing being re-read, and all three strings derive
 * from it, so a call site cannot spell the label and the announcement differently.
 */
import { RotateCw } from "lucide-react";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/ui/cn";
import { AnnounceLogRegion, useAnnounceLog } from "@/components/admin/announceLog";
import { SECONDARY_ACTION_ON_TINTED_CLASS } from "@/lib/ui/actionClass";

/** The visible label, identical at every site: the button does the same thing everywhere,
 *  and the accessible name carries the site-specific half. */
export const TELEMETRY_RETRY_TEXT = "Try again";
/** Opens with the visible text (WCAG 2.5.3, label in name), then names what is being
 *  retried, for someone who lands on the control out of context. */
export const retryLabel = (what: string) => `${TELEMETRY_RETRY_TEXT} to load ${what}`;
export const retryAnnouncement = (what: string) => `Retrying ${what}`;
/** Said when a re-read completed and the fallback is still standing. */
export const retryOutcomeAnnouncement = (what: string) => `Still couldn\u2019t load ${what}`;

export function TelemetryRetryButton({
  what,
  testId,
  renderedAt,
}: {
  what: string;
  testId: string;
  renderedAt: number;
}) {
  const router = useRouter();
  const { announce, entries } = useAnnounceLog();
  const [baseline, setBaseline] = useState<number | null>(null);

  // Adjusted DURING render rather than in an effect, so the outcome text and the
  // cleared baseline land in the same commit as the prop that settled them. The
  // inequality guard is what makes it terminate: the very update clears the baseline.
  if (baseline !== null && Number.isFinite(renderedAt) && renderedAt !== baseline) {
    setBaseline(null);
    announce(retryOutcomeAnnouncement(what));
  }

  return (
    <>
      <button
        type="button"
        data-testid={testId}
        aria-label={retryLabel(what)}
        onClick={() => {
          announce(retryAnnouncement(what));
          if (Number.isFinite(renderedAt)) setBaseline(renderedAt);
          router.refresh();
        }}
        className={cn(
          SECONDARY_ACTION_ON_TINTED_CLASS,
          // Placement and the plate-specific focus offset are the CALLER's, per that
          // module's own contract: it omits `ring-offset-*` because one constant cannot
          // carry a correct offset COLOUR across the surfaces it lands on. Keeping the
          // offset here is also what keeps this control inside the DERIVED population of
          // tests/styles/tintedPlateOutline.test.ts, which filters on a tinted ring-offset
          // plus a resting outline. Dropping it would make the control invisible to that
          // scan and oblige a registry row in the same chain RescanSheetButton sits in.
          "gap-1.5 focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg",
        )}
      >
        <RotateCw className="size-4" aria-hidden />
        {TELEMETRY_RETRY_TEXT}
      </button>
      <AnnounceLogRegion entries={entries} label={retryLabel(what)} testId={`${testId}-status`} />
    </>
  );
}
