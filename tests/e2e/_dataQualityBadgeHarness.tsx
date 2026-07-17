/**
 * tests/e2e/_dataQualityBadgeHarness.tsx — renderToStaticMarkup harness for the
 * DataQualityBadge dimensional gate (spec §5.4). Run via `tsx` from the layout
 * spec (NOT imported — Playwright's test transform rewrites JSX in every .tsx it
 * loads into component-testing payloads that react-dom/server cannot render; same
 * boundary as _step3ReviewModalHarness.tsx). The main-guard writes { body } — the
 * rendered HTML string — to argv[2].
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";
import type { RosterShiftSummary } from "@/lib/admin/showDisplay";
import { mkDataGaps } from "./../helpers/dataGapsFixture";

const ROSTER: RosterShiftSummary = { added: 2, removed: 0, renamed: 0, total: 2 };
const GAPS = mkDataGaps({ UNKNOWN_FIELD: 3 }); // total 3, full valid classes record

// Each badge sits in an inline flex row beside a title span, reproducing the
// shows-table header context (ShowsTable.tsx:468) so the measured layout is
// representative. The `#badge-*` id wraps the badge for measurement.
function Row({ id, node }: { id: string; node: ReactNode }): ReactNode {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
      <span>East Coast Tour</span>
      <span id={id}>{node}</span>
    </div>
  );
}

export function renderBadgeHarnessBody(): string {
  return renderToStaticMarkup(
    <main style={{ padding: "2rem", maxWidth: "480px" }}>
      <Row id="badge-gap" node={<DataQualityBadge slug="gap" dataGaps={GAPS} />} />
      <Row
        id="badge-roster"
        node={<DataQualityBadge slug="roster" dataGaps={undefined} rosterShift={ROSTER} />}
      />
      <Row
        id="badge-both"
        node={<DataQualityBadge slug="both" dataGaps={GAPS} rosterShift={ROSTER} />}
      />
    </main>,
  );
}

// Direct-execution entry: `tsx _dataQualityBadgeHarness.tsx <out.json>` writes the
// rendered body so the layout spec never imports this .tsx (see file header).
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("usage: tsx _dataQualityBadgeHarness.tsx <out.json>");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS main-guard CLI
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(outPath, JSON.stringify({ body: renderBadgeHarnessBody() }));
}
