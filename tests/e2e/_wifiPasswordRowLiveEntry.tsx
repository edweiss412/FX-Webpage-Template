/**
 * tests/e2e/_wifiPasswordRowLiveEntry.tsx
 * (spec 2026-08-10-wifi-password-legibility §6 (b) — the standalone harness entry)
 *
 * Browser ENTRY for wifi-password-row.layout.spec.ts. Mounts the REAL
 * `FactRows` + `CopyFactValue` + `SectionCard`, never transcribed markup: this
 * spec's subject is which class strings sit on which elements, so a harness
 * carrying its own copy of them would pass with the corrected copy while
 * production stayed unrepaired (the live-entry rule at
 * tests/e2e/tap-target-floor.layout.spec.ts:8).
 *
 * WHY A STANDALONE HARNESS EXISTS AT ALL. The production crew route renders the
 * password row exactly ONCE, so the oracles that need the same row rendered
 * twice — with a copy control versus with an icon — and the two list positions
 * (mid-list versus the `last:pb-0` last row) are unreachable there. Everything
 * that CAN be measured on the live route is measured there instead
 * (tests/e2e/crew-page.spec.ts).
 *
 * NEVER imported by a Playwright spec (its test transform rewrites JSX into
 * component-testing payloads). The spec bundles this out of process with the
 * UNMODIFIED tests/e2e/_step3ReviewModalBundle.mjs — this graph reaches no
 * `"use server"` module and no node builtin, so the shared bundler needs no
 * sibling.
 *
 * FOUR ISLANDS ON ONE PAGE is a harness artifact, stated rather than hidden.
 * Production renders one, so `CopyFactValue` hardcodes one announce-region
 * testid, and four islands share one identity here. Neither matters here:
 * this spec measures geometry and never clicks, so no clipboard write is ever
 * dispatched and no announcement is ever routed. The click behavior is proven
 * in jsdom (tests/components/crew/primitives/copyFactValue.test.tsx), where a
 * single island is the real shape.
 *
 * READINESS: `document.body[data-harness-ready="true"]` is set after the first
 * commit, and the spec ALSO waits for the copy control to be enabled — an
 * island that never hydrated still lays out, so the ready flag alone would let
 * geometry pass on a dead control. Fonts settle after both.
 */
import { useEffect } from "react";
import { createRoot } from "react-dom/client";

import { WifiIcon } from "@/components/crew/icons/sectionIcons";
import { FactRows, type FactRow } from "@/components/crew/primitives/FactRows";
import { SectionCard } from "@/components/crew/primitives/SectionCard";

/** The live FinTech Forum password — trailing period included, deliberately. */
const PASSWORD = "ORDTG.";
/** Exactly 40 characters, the wrap fixture. */
const LONG_PASSWORD = "Astoria2026-Ballroom-Guest-Access-Key-42";
const COPY_LABEL = "Copy the Wi-Fi password";

function control(testId: string, value = PASSWORD): FactRow {
  return { k: "Wi-Fi password", v: value, testId, code: true, copyLabel: COPY_LABEL };
}

function Mount({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div data-mount={name} className="w-full">
      <SectionCard title="Facilities">{children}</SectionCard>
    </div>
  );
}

function App() {
  useEffect(() => {
    document.body.setAttribute("data-harness-ready", "true");
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* MID-LIST: the password row has rows above AND below it, so its own box
          carries full `py-3` padding on both sides. */}
      <Mount name="mid-list">
        <FactRows
          rows={[
            { k: "Loading dock", v: "Rear of house", icon: <WifiIcon />, testId: "mid-dock" },
            control("mid-password"),
            { k: "Power", v: "3 x 20A", testId: "mid-power" },
          ]}
        />
      </Mount>

      {/* LAST ROW: `last:pb-0` drops the bottom padding, so the row box is 40px
          and the 44px target legitimately reaches into the card's padding.
          Row-rect containment is FALSE here by design; card containment is not. */}
      <Mount name="last-row">
        <FactRows
          rows={[
            { k: "Wi-Fi network", v: "WaldorfMeeting", icon: <WifiIcon />, testId: "last-ssid" },
            control("last-password"),
          ]}
        />
      </Mount>

      {/* COUNTERFACTUAL: the SAME row three ways in one list under one
          stylesheet — with a control, with an icon instead, and bare. The
          heights are the oracle: equal to the icon row, strictly taller than
          the bare one. Rendering them together is what makes the comparison a
          measurement rather than an arithmetic claim about padding.

          THE SANDWICH ROWS ARE LOAD-BEARING, not decoration. `FactRows` gives
          the first row `pt-0` and the last `pb-0`, so three comparison rows
          placed at positions 1..3 of a 3-row list sit in THREE DIFFERENT
          padding regimes (40 / 52 / 32px), and a height comparison across them
          measures the padding rather than the control — this spec measured
          exactly that 12px artifact before the sandwich existed. Head and tail
          rows absorb both edge regimes so all three comparison rows carry a
          full `py-3`; DI-1 asserts that shared regime as a premise rather than
          trusting this comment. */}
      <Mount name="counterfactual">
        <FactRows
          rows={[
            { k: "Room", v: "Grand Ballroom", testId: "cf-head" },
            control("cf-with-control"),
            {
              k: "Wi-Fi password",
              v: PASSWORD,
              icon: <WifiIcon />,
              code: true,
              testId: "cf-with-icon",
            },
            { k: "Wi-Fi password", v: PASSWORD, code: true, testId: "cf-bare" },
            { k: "Power", v: "3 x 20A", testId: "cf-tail" },
          ]}
        />
      </Mount>

      {/* WRAP: a 40-character value at 390px. The value must take more lines
          rather than push the control out of the row. */}
      <Mount name="wrap">
        <FactRows
          rows={[
            { k: "Wi-Fi network", v: "WaldorfMeeting", icon: <WifiIcon />, testId: "wrap-ssid" },
            control("wrap-password", LONG_PASSWORD),
            { k: "Power", v: "3 x 20A", testId: "wrap-power" },
          ]}
        />
      </Mount>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(<App />);
