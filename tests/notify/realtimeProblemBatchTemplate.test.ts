import { describe, expect, test } from "vitest";
import {
  renderRealtimeProblem,
  renderRealtimeProblemBatch,
  type RealtimeInput,
} from "@/lib/notify/templates/realtimeProblem";

const ORIGIN = "https://fxav.example";

function showMember(
  i: number,
  overrides: Partial<Extract<RealtimeInput, { kind: "show" }>> = {},
): RealtimeInput {
  return {
    kind: "show",
    origin: ORIGIN,
    slug: `show-${i}`,
    showTitle: `Show ${i}`,
    code: "SHEET_UNAVAILABLE",
    contextSheetName: `Sheet ${i}`,
    ...overrides,
  };
}
function ingestionMember(i: number): RealtimeInput {
  return {
    kind: "ingestion",
    origin: ORIGIN,
    driveFileName: `File ${i}`,
    lastErrorCode: "SHEET_PROCESS_FAILED",
  };
}

describe("renderRealtimeProblemBatch (batching spec §2.4)", () => {
  test("N=1 is byte-identical to the single template (show, global, ingestion)", () => {
    const cases: RealtimeInput[] = [
      showMember(1),
      { kind: "global", origin: ORIGIN },
      ingestionMember(1),
    ];
    for (const member of cases) {
      const group = member.kind === "ingestion" ? "stuck_files" : "sync_problems";
      expect(renderRealtimeProblemBatch(group, ORIGIN, [member])).toEqual(
        renderRealtimeProblem(member),
      );
    }
  });

  test("sync_problems N=3 (2 shows + global): count subject, one catalog line per member, ONE dashboard link", () => {
    const members: RealtimeInput[] = [
      showMember(1),
      showMember(2),
      { kind: "global", origin: ORIGIN },
    ];
    const batch = renderRealtimeProblemBatch("sync_problems", ORIGIN, members);
    expect(batch.subject).toBe("FXAV: sync problems on 3 shows");
    expect(batch.text).toContain("Show 1");
    expect(batch.text).toContain("Show 2");
    // per-member copy is catalog copy — never a raw code (invariant 5)
    expect(batch.text).not.toContain("SHEET_UNAVAILABLE");
    expect(batch.html).not.toContain("SHEET_UNAVAILABLE");
    // the global member renders its catalog line under the "Syncing" label — never the raw code
    expect(batch.text).toContain("Syncing:");
    expect(batch.text).not.toContain("SYNC_STALLED");
    expect(batch.html).not.toContain("SYNC_STALLED");
    expect(batch.text.match(/Open the dashboard: https:\/\/fxav\.example\/admin/g)).toHaveLength(1);
  });

  test("stuck_files N=2: count subject, per-file resolver copy, no raw code", () => {
    const batch = renderRealtimeProblemBatch("stuck_files", ORIGIN, [
      ingestionMember(1),
      ingestionMember(2),
    ]);
    expect(batch.subject).toBe("FXAV: 2 new sheets need attention");
    expect(batch.text).toContain("File 1");
    expect(batch.text).toContain("File 2");
    expect(batch.text).not.toContain("SHEET_PROCESS_FAILED");
  });

  test("N=21 caps at 20 lines + overflow line with correct remainder", () => {
    const members = Array.from({ length: 21 }, (_, i) => showMember(i + 1));
    const batch = renderRealtimeProblemBatch("sync_problems", ORIGIN, members);
    expect(batch.text).toContain("Show 20");
    expect(batch.text).not.toContain("Show 21:");
    expect(batch.text).toContain("…and 1 more — open the dashboard: https://fxav.example/admin");
  });

  test("HTML-escapes member titles", () => {
    const batch = renderRealtimeProblemBatch("sync_problems", ORIGIN, [
      showMember(1, { showTitle: "Danger <x> & Co", contextSheetName: null }),
      showMember(2),
    ]);
    expect(batch.html).toContain("Danger &lt;x&gt; &amp; Co");
    expect(batch.html).not.toContain("Danger <x>");
  });

  test.each([2, 21])("text mirrors html paragraph-for-paragraph at N=%i (spec §2.4)", (n) => {
    const members = Array.from({ length: n }, (_, i) => showMember(i + 1));
    const batch = renderRealtimeProblemBatch("sync_problems", ORIGIN, members);
    const htmlParagraphs = (batch.html.match(/<p>/g) ?? []).length;
    expect(batch.text.split("\n\n")).toHaveLength(htmlParagraphs);
    if (n === 21) {
      const overflowLine = "…and 1 more — open the dashboard: https://fxav.example/admin";
      expect(batch.text).toContain(overflowLine);
      expect(batch.html).toContain("and 1 more");
    }
  });
});
