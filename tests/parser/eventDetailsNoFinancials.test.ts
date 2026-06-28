import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseSheet } from "@/lib/parser/index";
import { isSensitiveCanonicalKey } from "@/lib/parser/gearClassification";

// Permission-boundary corpus tripwire (spec §6): crew-visible event_details must never
// carry a financial/internal key OR a PII/contact-metadata key, across EVERY fixture.
// The closed-vocab form harvest (§3.4) enforces this structurally — only known canonical
// labels are emitted — so this test fails loudly if that boundary ever regresses.

const PII_KEY_RE =
  /^(your_name|email_address|phone_number|title_of_event|logistics_director|venue_name.*|program_(start|end).*|timestamp|onsite_av.*|hotel_contact.*|technician.*|.*room_setup.*|.*room_strike.*|.*_name|.*_names)$/;

const files = ["raw", "exporter-xlsx"].flatMap((d) =>
  readdirSync(`fixtures/shows/${d}`)
    .filter((f) => f.endsWith(".md") && !/readme/i.test(f))
    .map((f) => `${d}/${f}`),
);

describe("crew-visible event_details never carries a financial/internal or PII key (spec §6)", () => {
  it.each(files)("%s", (rel) => {
    const ed =
      parseSheet(readFileSync(`fixtures/shows/${rel}`, "utf8"), rel).show.event_details ?? {};
    const financial = Object.keys(ed).filter(isSensitiveCanonicalKey);
    expect(financial, `financial leak: ${financial.join(",")}`).toEqual([]);
    const pii = Object.keys(ed).filter((k) => PII_KEY_RE.test(k));
    expect(pii, `PII leak: ${pii.join(",")}`).toEqual([]);
  });

  it("synthetic injection: a closed-vocab form block drops financial + PII labels and harvests only known fields", () => {
    // The financial/PII rows live in a SEPARATE form block (after the blank that ends the
    // classic EVENT DETAILS block), mirroring real sheets where the intake form is a distinct
    // block the classic pass never reaches — only the closed-vocab harvest does, and it skips
    // every UNKNOWN label (financial in every PO spelling, the other money roots, and PII).
    const synthetic = [
      "| EVENT DETAILS | EVENT DETAILS |",
      "| :---: | :---: |",
      "| Virtual Speaker | yes |", // classic block (1 field), then blank ends it
      "",
      // form block — 3 KNOWN-vocab labels guarantee the >=3-known anchor fires:
      "| Keynote Requirements | RECOVERED |",
      "| Virtual Audience | no |",
      "| Polling | yes |",
      // financial labels in every PO spelling + the other roots — all UNKNOWN → skipped:
      "| Budget | 50000 |",
      "| PO# | 12345 |",
      "| P.O. Number | 1 |",
      "| P O Number | 3 |",
      "| PONumber | 4 |",
      "| Proposal | x |",
      "| Invoice Notes | z |",
      "| Internal | q |",
      // PII labels — also UNKNOWN → skipped:
      "| Your Name | Jane Client |",
      "| Email Address | jane@client.com |",
      "| Phone Number | 555-1234 |",
      "| Logistics Director Name(s) | Jane |",
    ].join("\n");
    const ed = parseSheet(synthetic, "s.md").show.event_details;
    expect(ed["keynote_requirements"]).toBe("RECOVERED"); // PROVES the harvest ran past the noise
    expect(ed["polling"]).toBe("yes"); // another known field after the financial rows (skip-not-stop)
    // (a) via the helper AND (b) by EXACT key shape — independent of the helper:
    expect(Object.keys(ed).filter(isSensitiveCanonicalKey)).toEqual([]);
    expect(Object.keys(ed).filter((k) => PII_KEY_RE.test(k))).toEqual([]);
    for (const k of Object.keys(ed))
      expect(k.replace(/_/g, "")).not.toMatch(
        /^po(num(ber)?|s)?$|budget|invoice|proposal|cost|price|quote|estimate|internal|purchase/,
      );
  });
});
