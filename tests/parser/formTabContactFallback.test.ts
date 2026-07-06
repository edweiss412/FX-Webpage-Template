import { describe, it, expect } from "vitest";
import { parseContacts } from "@/lib/parser/blocks/contacts";
import { parseClient } from "@/lib/parser/blocks/client";
import { canonicalize } from "@/lib/email/canonicalize";

// Minimal live-shape markdown: INFO CLIENT block (name only, empty email/phone), empty INFO
// In House AV / Hotel Contact Info, then a FORM intake block. Callers override the FORM rows.
function md(opts: {
  infoAv?: string; // value cell for INFO "In House AV" (default empty)
  infoHotel?: string; // value cell for INFO "Hotel Contact Info" (default empty)
  infoEmail?: string; // value for INFO "Contact Email" (default empty)
  infoCell?: string; // value for INFO "Contact Cell" (default empty)
  clientBlock?: boolean; // include the INFO CLIENT block (default true)
  formBlock?: boolean; // include the FORM intake block (default true)
  formEmail?: string; // FORM "Email Address" value
  formPhone?: string; // FORM "Phone Number" value
  formAv?: string; // FORM "Onsite AV Contact" value
  formHotel?: string; // FORM "Hotel Contact Information" value (inside the FORM block)
  trailingStrayEmail?: string; // a stray "| Email Address | x |" AFTER the FORM block (separate run)
}): string {
  const {
    infoAv = "",
    infoHotel = "",
    infoEmail = "",
    infoCell = "",
    clientBlock = true,
    formBlock = true,
    formEmail = "",
    formPhone = "",
    formAv = "",
    formHotel,
    trailingStrayEmail,
  } = opts;
  const lines: string[] = [];
  if (clientBlock) {
    lines.push(
      "| CLIENT | Institutional Investor | | | |",
      "| :--: | :--: | :--: | :--: | :--: |",
      "| | MAIN | SECONDARY | | |",
      "| Contact | Ashley Morgan | | | |",
      `| Contact Cell | ${infoCell} | | | |`,
      "| Contact Office | | | | |",
      `| Contact Email | ${infoEmail} | | | |`,
      "",
    );
  }
  lines.push(`| Hotel Contact Info | ${infoHotel} | | |`, `| In House AV | ${infoAv} | | |`, "");
  if (formBlock) {
    lines.push(
      "| Timestamp | 9/23/2025 16:13:24 |",
      "| :--: | :--: |",
      "| Your Name | Ashley Morgan |",
      `| Email Address | ${formEmail} |`,
      `| Phone Number | ${formPhone} |`,
      ...(formHotel !== undefined ? [`| Hotel Contact Information | ${formHotel} |`] : []),
      `| Onsite AV Contact | ${formAv} |`,
      "",
    );
  }
  if (trailingStrayEmail !== undefined) {
    lines.push("| Some Other Section | header |", `| Email Address | ${trailingStrayEmail} |`, "");
  }
  return lines.join("\n");
}

describe("FORM-tab AV contact fallback", () => {
  it("surfaces the FORM Onsite AV Contact when INFO In House AV is empty", () => {
    const AV = "chris.mercado@encoreglobal.com";
    const contacts = parseContacts(md({ formAv: AV }), "v4");
    const av = contacts.filter((c) => c.kind === "in_house_av");
    expect(av).toHaveLength(1);
    expect(av[0]!.email).toBe(canonicalize(AV)); // expected derived from the input, canonicalized
  });

  it("keeps INFO AV and discards the FORM fallback when INFO In House AV is populated", () => {
    const INFO_AV = "chris.mercado@encoreglobal.com";
    const FORM_AV = "different.person@x.com";
    const contacts = parseContacts(
      md({ infoAv: `Chris Mercado ${INFO_AV}`, formAv: FORM_AV }),
      "v4",
    );
    const emails = contacts.filter((c) => c.kind === "in_house_av").map((c) => c.email);
    expect(emails).toContain(canonicalize(INFO_AV));
    expect(emails).not.toContain(canonicalize(FORM_AV));
  });

  it("rejects a prose placeholder in the FORM Onsite AV Contact cell", () => {
    const contacts = parseContacts(md({ formAv: "Not Applicable" }), "v4");
    expect(contacts.filter((c) => c.kind === "in_house_av")).toHaveLength(0);
  });

  it("does not regress the venue contact from the FORM Hotel Contact Information label", () => {
    // VENUE_LABEL_RE already matches "Hotel Contact Information" INSIDE the FORM block; verify the
    // AV change is inert on the venue path.
    const VENUE = "kurt.ashcraft@hyatt.com";
    const AV = "chris.mercado@encoreglobal.com";
    const contacts = parseContacts(md({ formAv: AV, formHotel: VENUE }), "v4");
    expect(contacts.some((c) => c.kind === "venue" && c.email === canonicalize(VENUE))).toBe(true);
  });
});

describe("FORM-tab client email/phone fallback", () => {
  it("fills client email + phone from the FORM block when INFO cells are empty", () => {
    const EMAIL = "ashley.morgan@institutionalinvestor.com";
    const PHONE = "8452701900";
    const { client_contact } = parseClient(md({ formEmail: EMAIL, formPhone: PHONE }), "v4");
    expect(client_contact).toMatchObject({
      name: "Ashley Morgan", // from the builder's INFO Contact row (constant across the suite)
      email: canonicalize(EMAIL),
      phone: PHONE,
    });
  });

  it("keeps the INFO client email when populated (INFO wins)", () => {
    const INFO = "real@info.com";
    const FORM = "other@form.com";
    const { client_contact } = parseClient(md({ infoEmail: INFO, formEmail: FORM }), "v4");
    expect(client_contact!.email).toBe(canonicalize(INFO));
    expect(client_contact!.email).not.toBe(canonicalize(FORM));
  });

  it("is a no-op when there is no INFO CLIENT block", () => {
    const { client_contact } = parseClient(
      md({ clientBlock: false, formEmail: "ashley.morgan@institutionalinvestor.com" }),
      "v4",
    );
    expect(client_contact).toBeNull();
  });

  it("does not fill from a stray Email Address with no FORM anchor (case a)", () => {
    const stray = md({ formBlock: false }) + "\n| Email Address | stray@x.com |\n";
    const { client_contact } = parseClient(stray, "v4");
    expect(client_contact!.email).toBeNull();
  });

  it("does not fill email OR phone from a stray row after the FORM run ends (case b)", () => {
    // FORM block present with EMPTY Email Address AND EMPTY Phone Number; strays in a later
    // separate run must not fill either field (the bounding gate applies to both labels equally).
    const strayBlock =
      md({ formEmail: "", formPhone: "" }) +
      "\n| Some Other Section | header |\n| Email Address | stray@x.com |\n| Phone Number | 5559999999 |\n";
    const { client_contact } = parseClient(strayBlock, "v4");
    expect(client_contact!.email).toBeNull();
    expect(client_contact!.phone).toBeNull();
  });

  it("extracts only the email substring from a wrapped FORM value", () => {
    const EMAIL = "ashley.morgan@institutionalinvestor.com";
    const { client_contact } = parseClient(md({ formEmail: `Ashley Morgan <${EMAIL}>` }), "v4");
    expect(client_contact!.email).toBe(canonicalize(EMAIL)); // substring extracted from the wrapper
  });

  it("fills only the empty field on partial INFO data", () => {
    // INFO email present, INFO phone empty → phone filled, email kept.
    const INFO_EMAIL = "keep@info.com";
    const FORM_PHONE = "8452701900";
    const a = parseClient(md({ infoEmail: INFO_EMAIL, formPhone: FORM_PHONE }), "v4");
    expect(a.client_contact!.email).toBe(canonicalize(INFO_EMAIL));
    expect(a.client_contact!.phone).toBe(FORM_PHONE);
    // INFO phone present, INFO email empty → email filled, phone kept.
    const INFO_PHONE = "111-222-3333";
    const FORM_EMAIL = "fill@form.com";
    const b = parseClient(md({ infoCell: INFO_PHONE, formEmail: FORM_EMAIL }), "v4");
    expect(b.client_contact!.phone).toBe(INFO_PHONE);
    expect(b.client_contact!.email).toBe(canonicalize(FORM_EMAIL));
  });

  it("rejects a prose email placeholder (TBD @ client)", () => {
    const { client_contact } = parseClient(md({ formEmail: "TBD @ client" }), "v4");
    expect(client_contact!.email).toBeNull();
  });
});
