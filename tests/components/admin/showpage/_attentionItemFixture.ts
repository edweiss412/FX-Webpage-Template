/**
 * tests/components/admin/showpage/_attentionItemFixture.ts
 * (wizard-review-attention-menu spec §12.19a — Task 1)
 *
 * The `AttentionItem` builders shared by `attentionMenuGroups.test.tsx` and the
 * byte baselines in `publishedAttentionBaseline.test.tsx`. Moved here verbatim
 * from the groups suite so both render the SAME fixture: two independently
 * assembled item shapes would make the baseline comparison meaningless the
 * moment one of them drifted.
 */
import type { AttentionItem } from "@/lib/admin/attentionItems";

type AlertItem = Extract<AttentionItem, { kind: "alert" }>;

export function item(
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
    menuTitle: `Title ${id}`,
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

export const needsLookItem = (
  id: string,
  code = "SHEET_UNAVAILABLE",
  action: AlertItem["alert"]["action"] = null,
) => item(id, code, { clearingKind: "needs_look", action });

export const selfHealItem = (id: string, menuTitle: string) =>
  item(id, "SYNC_STALLED", { clearingKind: "self_heal", menuTitle });
