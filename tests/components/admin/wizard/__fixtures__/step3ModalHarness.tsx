// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/__fixtures__/step3ModalHarness.tsx
 *
 * Shared render harness for the wizard's Step-3 review modal.
 *
 * Promoted out of Step3ReviewModal.test.tsx, where `sectionData` and
 * `renderModal` were file-local, when the auto-open width-suppression suite
 * became their second consumer. Two copies of a render contract drift, and the
 * suppression suite needs the SAME call site the existing assertions use or it
 * proves something about a different tree.
 *
 * NOTE: `next/navigation` is not mocked here. `vi.mock` is hoisted per-file, so
 * the importing module owns that.
 */
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { buildParseResult, sectionDataArgs } from "../_step3ReviewFixture";

export const DFID = "drive-abc-123";

/** Assemble the modal's SectionData from the shared fixture builders. */
export function sectionData(
  prOverrides: Partial<ParseResult> = {},
  dataOverrides: Partial<StagedSectionData> = {},
): StagedSectionData {
  // Row/dfid may be overridden via dataOverrides; the shared builder derives the
  // row/dfid-dependent SectionCore fields from the FINAL values, so an
  // overridden row propagates to title/sourceAnchors/driveFileId.
  return {
    ...buildStagedSectionData(sectionDataArgs(prOverrides, dataOverrides)),
    ...dataOverrides,
  };
}

/** SectionData with show-level overrides (client_label, dates, …). */
export function sectionDataWithShow(
  showOverrides: Partial<ParseResult["show"]>,
  prOverrides: Partial<ParseResult> = {},
): StagedSectionData {
  const pr = buildParseResult(prOverrides);
  return sectionData({ ...prOverrides, show: { ...pr.show, ...showOverrides } });
}

/** A needs-look warning. The wizard's auto-open predicate counts THESE
 *  (`const n = attention.needsLook.length`, Step3ReviewModal.tsx:335), not the
 *  actionable items the published surface uses -- a mirrored suite that copies
 *  the published fixture drives nothing. */
export function warning(kind: string): ParseWarning {
  return { severity: "warn", code: "SHEET_TAB_MISSING", message: "", blockRef: { kind } };
}

export type RenderModalOpts = {
  d?: StagedSectionData;
  checked?: boolean;
  isDirtyRescan?: boolean;
  onRequestSetChecked?: (next: boolean) => Promise<boolean>;
  onClose?: () => void;
};

/** Re-render the SAME tree with new props, for cases that must move one of the
 *  auto-open effect's dependencies without remounting. Lives here rather than in
 *  each suite so no test has to import the component and rebuild its prop set. */
export function rerenderStep3Modal(
  rendered: ReturnType<typeof renderStep3Modal>,
  opts: RenderModalOpts = {},
) {
  rendered.q.rerender(
    <Step3ReviewModal
      data={opts.d ?? rendered.d}
      checked={opts.checked ?? false}
      isDirtyRescan={opts.isDirtyRescan ?? false}
      onRequestSetChecked={opts.onRequestSetChecked ?? rendered.onRequestSetChecked}
      onClose={opts.onClose ?? rendered.onClose}
    />,
  );
}

export function renderStep3Modal(opts: RenderModalOpts = {}) {
  const onClose = opts.onClose ?? vi.fn();
  const onRequestSetChecked = opts.onRequestSetChecked ?? vi.fn(async () => true);
  const d = opts.d ?? sectionData();
  const q = render(
    <Step3ReviewModal
      data={d}
      checked={opts.checked ?? false}
      isDirtyRescan={opts.isDirtyRescan ?? false}
      onRequestSetChecked={onRequestSetChecked}
      onClose={onClose}
    />,
  );
  return { q, d, onClose, onRequestSetChecked };
}
