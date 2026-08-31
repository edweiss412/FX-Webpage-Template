/**
 * tests/e2e/helpers/occlusionProbe.ts
 * (spec 2026-08-29-attention-auto-open-phone-suppression §9.1)
 *
 * The ONE occlusion test both the wizard probe (P-1) and the published
 * suppression assertions (P-2) use. It answers one question: is a control the
 * operator needs being hit-tested to something that is not it?
 *
 * Spec review round 1 killed two earlier designs for being unable to answer
 * that. Both are recorded here so neither is reinvented:
 *
 *   - "does the panel's rect intersect any interactive control" is positive by
 *     CONSTRUCTION, because the panel's own rows are buttons
 *     (components/admin/showpage/AttentionMenu.tsx:304), its scroller is
 *     focusable, and the modal scrim is a button
 *     (components/admin/review/ReviewModalShell.tsx:609).
 *   - "does elementFromPoint return the PANEL element" is negative by
 *     CONSTRUCTION, because what intercepts is a ROW inside the panel. The
 *     original defect measurement says exactly that: "pointer events
 *     intercepted by an attention monitoring row".
 */
import type { Page } from "@playwright/test";

const INTERACTIVE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

export type Interception = {
  /** data-testid of the control, or a DOM description when it has none. */
  control: string;
  /** data-testid of the node that intercepted, or its tag plus classes. */
  interceptedBy: string;
  /** Which of the five sample points hit it. */
  at: "centre" | "tl" | "tr" | "bl" | "br";
  /**
   * Whether the interceptor is inside the attention panel.
   *
   * Load-bearing, and absent from the first draft. Without it the probe reports
   * every pre-existing overlap in the modal as though this arc caused it. The
   * concrete case: `elementFromPoint` returns the ORIGINATING element for a
   * pseudo-element, and the pill draws its 44px hit band with
   * `before:-inset-y-3`, so a neighbouring control whose sample points fall in
   * that band reports the PILL as its interceptor. That is a real fact about
   * the pill's band, it is true with or without suppression, and it is not this
   * arc's. Callers therefore ASSERT on `insidePanel` interceptions and RECORD
   * the rest.
   */
  insidePanel: boolean;
};

export type OcclusionReport = {
  /** Every control considered, so a NEGATIVE result is auditable. */
  controls: string[];
  /** One entry per (control, point) that a foreign node intercepted. */
  interceptions: Interception[];
};

/**
 * Run the §9.1 test inside the page.
 *
 * @param clipSel    the modal's CLIP: `[data-review-modal-panel]` published,
 *                   `[data-step3-review-panel]` wizard. Not `[role="dialog"]` —
 *                   the scrim lives outside the clip, so the tighter root
 *                   excludes it structurally as well as by selector.
 * @param panelSel   the attention panel, or NULL when the caller expects it
 *                   absent. Its subtree is excluded from the control set, and
 *                   it decides `insidePanel`.
 * @param triggerSel the panel's own trigger, excluded: a panel overlapping the
 *                   control that OWNS it is not an occlusion.
 * @param mustInclude testids the caller's claim is ABOUT. Throws when one is
 *                   missing, so a clean result cannot come from a control set
 *                   that never contained the subject.
 *
 * NON-VACUITY, and why it is only this much. An earlier version also threw when
 * the panel was absent. That is right for P-1, whose question is meaningless
 * without a panel, and it is the exact INVERSE of P-2, whose whole claim is
 * that the panel is closed — review round 2 found the helper could not pass the
 * behaviour it exists to accept. So the helper guards only what is universal: a
 * non-empty control set, and the presence of every control the caller names.
 * Each probe asserts its own panel precondition.
 */
export async function probeOcclusion(
  page: Page,
  clipSel: string,
  panelSel: string | null,
  triggerSel: string,
  mustInclude: readonly string[] = [],
): Promise<OcclusionReport> {
  return page.evaluate(
    ({ clipSel, panelSel, triggerSel, mustInclude, INTERACTIVE }) => {
      const clip = document.querySelector(clipSel);
      if (clip === null) throw new Error(`occlusion probe: no clip at ${clipSel}`);
      // May legitimately be absent: that is the suppressed case's whole claim.
      const panel = panelSel === null ? null : document.querySelector(panelSel);
      const trigger = document.querySelector(triggerSel);

      const name = (el: Element): string => {
        const id = el.getAttribute("data-testid");
        if (id !== null) return id;
        const cls = el.className;
        return `<${el.tagName.toLowerCase()}${
          typeof cls === "string" && cls ? ` class="${cls.slice(0, 60)}"` : ""
        }>`;
      };

      const controls = [...clip.querySelectorAll(INTERACTIVE)].filter((el) => {
        if (panel !== null && panel.contains(el)) return false; // rows and scroller
        if (el.closest('[data-testid$="-backdrop"]') !== null) return false; // the scrim
        if (trigger !== null && (el === trigger || trigger.contains(el) || el.contains(trigger)))
          return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });

      if (controls.length === 0) {
        throw new Error("occlusion probe: control set is empty, so the test would be vacuous");
      }
      const names = controls.map(name);
      for (const id of mustInclude) {
        if (!names.some((n) => n.includes(id))) {
          throw new Error(
            `occlusion probe: ${id} is not in the control set, so a result would say nothing about it`,
          );
        }
      }

      const interceptions: {
        control: string;
        interceptedBy: string;
        at: "centre" | "tl" | "tr" | "bl" | "br";
        insidePanel: boolean;
      }[] = [];
      for (const c of controls) {
        const r = c.getBoundingClientRect();
        const points = [
          ["centre", r.left + r.width / 2, r.top + r.height / 2],
          ["tl", r.left + r.width / 4, r.top + r.height / 4],
          ["tr", r.left + (3 * r.width) / 4, r.top + r.height / 4],
          ["bl", r.left + r.width / 4, r.top + (3 * r.height) / 4],
          ["br", r.left + (3 * r.width) / 4, r.top + (3 * r.height) / 4],
        ] as const;
        for (const [at, x, y] of points) {
          const hit = document.elementFromPoint(x, y);
          // Occluded when the hit is neither the control nor inside it. A null
          // hit means the point is outside the viewport, which is a different
          // problem and is not an interception.
          if (hit !== null && hit !== c && !c.contains(hit)) {
            interceptions.push({
              control: name(c),
              interceptedBy: name(hit),
              at,
              insidePanel: panel !== null && panel.contains(hit),
            });
          }
        }
      }
      return { controls: names, interceptions };
    },
    { clipSel, panelSel, triggerSel, mustInclude, INTERACTIVE },
  );
}
