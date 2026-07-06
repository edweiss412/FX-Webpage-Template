import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseContacts } from "@/lib/parser/blocks/contacts";
import { parseClient } from "@/lib/parser/blocks/client";

// The committed fixture has INFO POPULATED (Contact Cell 845-270-1900, Contact Email, Hotel
// Contact Info Kurt Ashcraft, In House AV Chris Mercado + Danilo). The FORM fallback must be
// INERT here (INFO wins). This is a full-output snapshot regression: any change to contacts[] or
// client_contact from the pre-change baseline fails. The baseline was captured by running the
// parser on the committed fixture on origin/main BEFORE this change.
const RAW = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");

const BASELINE_CONTACTS = [
  {
    kind: "venue",
    name: "Kurt Ashcraft",
    email: "kurt.ashcraft@hyatt.com",
    phone: "312 239 4217",
    notes: "Kurt Ashcraft Senior Event Planning Manager 312 239 4217 kurt.ashcraft@hyatt.com",
  },
  {
    kind: "in_house_av",
    name: "Chris Mercado",
    email: "chris.mercado@encoreglobal.com",
    phone: null,
    notes: "Chris Mercado chris.mercado@encoreglobal.com",
  },
  {
    kind: "in_house_av",
    name: "Danilo Scekic",
    email: "danilo.scekic@encoreglobal.com",
    phone: null,
    notes: "Danilo Scekic danilo.scekic@encoreglobal.com",
  },
];
const BASELINE_CLIENT = {
  client_label: "Institutional Investor",
  client_contact: {
    name: "Ashley Morgan",
    email: "ashley.morgan@institutionalinvestor.com",
    phone: "845-270-1900",
  },
};

describe("FORM fallback is byte-identical-inert on an INFO-populated show", () => {
  it("produces identical parseContacts output (full array)", () => {
    expect(parseContacts(RAW, "v4")).toEqual(BASELINE_CONTACTS);
  });
  it("produces identical parseClient output (full object)", () => {
    expect(parseClient(RAW, "v4")).toEqual(BASELINE_CLIENT);
  });
});
