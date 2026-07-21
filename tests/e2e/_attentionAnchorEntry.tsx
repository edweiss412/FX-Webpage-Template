/**
 * tests/e2e/_attentionAnchorEntry.tsx
 * (spec 2026-07-20-attention-alert-routing §3.3)
 *
 * Browser ENTRY for the anchored-placement harness: mounts the REAL
 * <RoomsDiagramsSubBlock> and <EventDetailsBreakdown> against the compiled Tailwind
 * output, each wrapped in a Step3SectionChromeContext provider carrying an anchored
 * card. The spec then proves — in a real DOM, by ancestry, NOT geometry — that a
 * `diagrams`-routed card lands inside the Diagrams sub-block and an `opening_reel`-
 * routed card lands inside the opening_reel field. The card's `?` trigger is present
 * but its geometry is NOT asserted (spec §9: the 22px trigger is owned/pinned by the
 * sibling warning-card spec).
 *
 * NEVER imported by a Playwright spec directly (Playwright's babel transform rewrites
 * spec-imported .tsx JSX into component-testing payloads react-dom cannot render).
 * attention-anchor-placement.spec.ts bundles this out-of-process with a version-pinned
 * esbuild and serves it, mirroring _compactAlertCardLiveEntry.
 */
import { createRoot } from "react-dom/client";
import {
  RoomsDiagramsSubBlock,
  EventDetailsBreakdown,
  Step3SectionChromeContext,
} from "@/components/admin/wizard/step3ReviewSections";
import type { SectionData } from "@/components/admin/review/sectionData";

// A stand-in for the pre-rendered attention card (production uses <AttentionBanner>,
// which needs a Next runtime this bundle lacks). The MOUNT MECHANISM — chrome →
// sub-block wrapper → card — is what is under test, not the card's internals; the
// card carries the code testid and the adjacent `?` trigger the real card carries.
function AnchorCard({ code }: { code: string }) {
  return (
    <div
      data-testid={`attention-card-${code}`}
      className="flex items-center gap-2 rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
    >
      <span className="min-w-0 flex-1">{code}</span>
      <button
        type="button"
        data-testid={`attention-card-help-${code}`}
        aria-label="What is this?"
        className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-pill border border-border text-xs text-text-subtle"
      >
        ?
      </button>
    </div>
  );
}

const DIAGRAM_SIGNAL = {
  snapshot_revision_id: "rev-1",
  linkedFolder: { id: "folder-1", name: "Diagrams" },
  embeddedImages: [],
  linkedFolderItems: [],
};

const roomsData = {
  mode: "published",
  showId: "show-1",
  driveFileId: "drive-1",
  rooms: [],
  diagrams: DIAGRAM_SIGNAL,
} as unknown as SectionData;

function Harness() {
  const icon = (() => null) as never;
  return (
    <div className="flex flex-col gap-8 p-6" style={{ width: 480 }}>
      <section data-testid="rooms-host">
        <Step3SectionChromeContext.Provider
          value={{
            Icon: icon,
            label: "Rooms & scope",
            flagged: false,
            diagramAttention: [<AnchorCard key="d" code="EMBEDDED_ASSET_DRIFTED" />],
          }}
        >
          <RoomsDiagramsSubBlock data={roomsData} />
        </Step3SectionChromeContext.Provider>
      </section>

      <section data-testid="event-host">
        <Step3SectionChromeContext.Provider
          value={{
            Icon: icon,
            label: "Event details",
            flagged: false,
            reelAttention: [<AnchorCard key="r" code="REEL_DRIFTED" />],
          }}
        >
          <EventDetailsBreakdown
            dfid="drive-1"
            eventDetails={{ opening_reel: "Sizzle reel intro" }}
          />
        </Step3SectionChromeContext.Provider>
      </section>
    </div>
  );
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<Harness />);
