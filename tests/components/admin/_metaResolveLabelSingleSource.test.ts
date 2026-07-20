/**
 * Defense 4 (spec 2026-07-20-show-scoped-alert-copy-design §7): the resolve
 * label strings exist in exactly one module.
 *
 * An import assertion is vacuous here — a component can import the module,
 * ignore it, and reimplement the conditional locally. Scanning for the words
 * catches what an import check cannot, including a JSX text node
 * (<button>Confirm</button>) that no quoted-literal search would find.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { stripComments } from "../../styles/_classScanUtils";

/** Words that must NOT appear in the three component files. */
const FORBIDDEN_IN_COMPONENTS = [
  "Mark resolved",
  "Confirm",
  "Confirming",
  "Resolving",
  "Dismiss",
  "Dismissing",
];

/**
 * Words that MUST appear in the label module. Deliberately NOT the same list:
 * "Dismiss"/"Dismissing" were the bell's old spelling and are removed by this
 * work, so requiring them in the module would fail.
 */
const REQUIRED_IN_MODULE = ["Mark resolved", "Confirm", "Confirming", "Resolving"];

const BUTTON_FILES = [
  "components/admin/PerShowAlertResolveButton.tsx",
  "components/admin/telemetry/HealthAlertResolveButton.tsx",
  "components/admin/BellPanel.tsx",
];

const LABEL_MODULE = "lib/adminAlerts/resolveActionLabel.ts";

describe("resolve labels have exactly one home", () => {
  for (const file of BUTTON_FILES) {
    it(`${file} contains no hardcoded label text`, () => {
      const src = stripComments(readFileSync(file, "utf8"));
      const hits = FORBIDDEN_IN_COMPONENTS.filter((w) => new RegExp(`\\b${w}\\b`).test(src));
      expect(hits, "import the pair from lib/adminAlerts/resolveActionLabel.ts").toEqual([]);
    });
  }

  it("the label module DOES contain them, proving the scan looks for live strings", () => {
    // Without this control the scan would still pass if someone renamed every
    // label and the strings no longer existed anywhere. Comment-stripped too,
    // so a label surviving only in a JSDoc example does not satisfy it.
    const live = stripComments(readFileSync(LABEL_MODULE, "utf8"));
    for (const w of REQUIRED_IN_MODULE) {
      expect(live, `${w} vanished from the label module`).toMatch(new RegExp(`\\b${w}\\b`));
    }
  });
});
