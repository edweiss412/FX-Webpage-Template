/**
 * tests/e2e/_uiPolishLiveEntry.tsx
 *
 * Browser ENTRY for the ui-polish class sweep's real-engine checks (design doc
 * `docs/superpowers/specs/2026-08-25-ui-polish-class-sweep-design.md`, T12).
 *
 * WHY A REAL BROWSER AND NOT JSDOM. Two of this arc's claims are not decidable
 * anywhere else. jsdom computes no layout, so every `getBoundingClientRect()`
 * there reads 0 and a tap-floor assertion passes by accident; and jsdom applies
 * no stylesheet, so a `max-sm:` cascade — which is the WHOLE ShareHub defect,
 * a control painting one colour above 640px and another below it — has no
 * observable behaviour to assert at all.
 *
 * TWO KINDS OF CASE, deliberately.
 *
 * `component` cases mount the REAL component, so the label geometry measured is
 * the geometry the crew and Doug get. Two are cheap to mount and are the two the
 * tap-floor rows are about.
 *
 * `classString` cases render a bare element wearing a class string the SPEC
 * extracted from the shipped source at run time and handed over on
 * `window.__UI_POLISH_CLASS`. That is not a copy of the component's classes: it
 * IS the component's class string, read out of the file, so a class that changes
 * in the source changes here with no edit. It exists for the surfaces whose
 * props are a page's worth of fixture (the share hub, the review modal) where
 * the claim under test is about the CASCADE and the TOKEN rather than about the
 * component's own logic.
 *
 * NEVER imported by a Playwright spec (the babel transform rewrites
 * spec-imported .tsx); the spec bundles this out-of-process with the
 * version-pinned esbuild, mirroring _hoverHelpGeometryLiveEntry.
 */
import { createRoot } from "react-dom/client";

import {
  RoleRecognizeControl,
  type RoleRecognizeSaveOutcome,
} from "@/components/admin/RoleRecognizeControl";
import { RoleMappingRow } from "@/app/admin/settings/roles/RoleMappingRow";
import { StagedReviewCard } from "@/components/admin/StagedReviewCard";
import { RunOfShowList } from "@/components/crew/primitives/RunOfShowList";
import type { AgendaEntry } from "@/lib/parser/types";

declare global {
  interface Window {
    /** Set by the spec before navigation; the class string under test. */
    __UI_POLISH_CLASS?: string;
    /** The plate class a `classString` case should stand on, when it has one. */
    __UI_POLISH_PLATE?: string;
  }
}

function harnessCase(): string {
  const c = new URLSearchParams(window.location.search).get("case");
  return c && c.length > 0 ? c : "role-recognize";
}

/** A title past RunOfShowList's 80-char truncation, so the <details> renders. */
const LONG_TITLE =
  "Doors open and the house band loads in through the loading dock on the north side of the arena";

const AGENDA: AgendaEntry[] = [
  { time: "18:00", title: LONG_TITLE, room: null, av: null } as unknown as AgendaEntry,
];

function Case() {
  const kase = harnessCase();

  if (kase === "role-recognize") {
    return (
      <div className="max-w-xl p-4">
        <RoleRecognizeControl
          roleToken="Camera Op"
          onSave={async (): Promise<RoleRecognizeSaveOutcome> => ({
            kind: "saved",
            state: "applied",
            grants: [],
          })}
        />
      </div>
    );
  }

  if (kase === "role-mapping") {
    // The SECOND FINANCIALS row. It is a separate component with the same shape
    // by decision (D6), and "the same shape" is exactly the claim a measurement
    // should not take on trust — the two drifted apart once already.
    return (
      <div className="max-w-2xl p-4">
        <RoleMappingRow
          row={{
            token: "Camera Op",
            grants: ["A1"],
            decidedByLabel: "You",
            decidedAtLabel: "Aug 25",
          }}
        />
      </div>
    );
  }

  if (kase === "staged-review") {
    // The third repaired tap target: the action radio's own label. It needs a
    // triggered review item, because the radios only exist when there is a
    // choice to make.
    return (
      <div className="max-w-2xl p-4">
        <StagedReviewCard
          row={{
            driveFileId: "drive-1",
            stagedId: "staged-1",
            sourceKind: "cron",
            stagedModifiedTime: "2026-05-09T12:00:00Z",
            baseModifiedTime: "2026-05-08T00:00:00Z",
            warningSummary: "",
            triggeredReviewItems: [{ id: "item-mi6", invariant: "MI-6" }],
          }}
        />
      </div>
    );
  }

  if (kase === "run-of-show") {
    return (
      <div className="max-w-xl p-4">
        <RunOfShowList entries={AGENDA} isoDate="2026-08-25" />
      </div>
    );
  }

  // classString: the element wears exactly what the spec read out of the source.
  const className = window.__UI_POLISH_CLASS ?? "";
  const plate = window.__UI_POLISH_PLATE ?? "";
  return (
    <div className={`p-4 ${plate}`} data-testid="plate">
      <button type="button" data-testid="subject" className={className}>
        Subject
      </button>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <>
      <Case />
      {/* Attached last, so a spec that waits on it is waiting on a painted tree. */}
      <span data-testid="harness-ready" />
    </>,
  );
}
