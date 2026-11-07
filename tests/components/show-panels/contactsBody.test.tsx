// @vitest-environment jsdom
/**
 * tests/components/show-panels/contactsBody.test.tsx
 * (crew page redesign PR B plan, Task 7; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §6.1, §6.2
 * `contacts` row, line 304)
 *
 * The Contacts body is the admin's `ContactsBreakdown` list and its
 * `contactBlocks` shaping, shared. The admin rendering is pinned byte for byte
 * by the Task 1 golden (tests/components/admin/wizard/adminSectionDom.test.tsx)
 * and asserted nowhere else: every case here is about the body itself or the
 * crew page around it.
 *
 * Crew: `includeClient: false` (the client contact never reaches the crew props
 * or HTML), capped at `CONTACTS_INLINE_CAP` with the crew's overflow copy,
 * notes shown, sentinels hidden, Call only when the phone has digits and Email
 * behind its sentinel gate, each a drawn icon (BL-CREW-SECTION-GLYPH-ICONS, the
 * contacts half), in the crew panel card titled "Contacts" (spec line 404) with
 * the `crew-contacts` card's actions. Also here: the body called inside the
 * section's `WrappedSection` (spec line 291), the contacts load-failure block's
 * audience (admin only, spec line 241), and the Crew section no longer holding
 * the contacts.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ContactsBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import { SECTION_ICON } from "@/components/crew/sectionIcon";
import { ContactsSection } from "@/components/crew/sections/ContactsSection";
import { CrewSection } from "@/components/crew/sections/CrewSection";
import {
  CONTACTS_CARD_ID,
  CONTACTS_INLINE_CAP,
  contactsPanel,
} from "@/components/crew/sections/contactsRows";
import { crewMailtoHref, crewTelHref } from "@/components/crew/sections/crewRows";
import { ContactsBody, type ContactsBodyProps } from "@/components/show-panels/ContactsBody";
import * as contactsBodyModule from "@/components/show-panels/ContactsBody";
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import type { ClientContact, ContactRow } from "@/lib/parser/types";
import { showSection } from "@/lib/showSections/registry";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { expectUntitledPanel } from "@/tests/components/show-panels/_panelCardAssert";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-contacts";

/** A client contact with a secondary and an office line: every field the admin shows of it. */
const CLIENT: ClientContact = {
  name: "Dana Clientside",
  phone: "(415) 555-0100",
  email: "dana@client.example",
  officePhone: "(415) 555-0101",
  secondary: { name: "Sam Backupclient", phone: "415-555-0102", email: null },
};
/** Every value of the client contact a page could show, for the payload searches. */
const CLIENT_VALUES = [
  CLIENT.name,
  CLIENT.phone!,
  CLIENT.email!,
  CLIENT.officePhone!,
  CLIENT.secondary!.name,
  CLIENT.secondary!.phone!,
  // The digits the crew builder would turn each phone into.
  "4155550100",
  "4155550101",
  "4155550102",
];

function contact(name: string | null, over: Partial<ContactRow> = {}): ContactRow {
  return { kind: "venue", name, email: null, phone: null, notes: null, ...over };
}

function renderContacts(
  contacts: ContactRow[],
  viewer: Viewer = { kind: "admin" },
  ledger = createTileRenderLedger(),
  over: Partial<ShowForViewer> = {},
) {
  return render(
    <ContactsSection
      ledger={ledger}
      data={makeShowForViewer({ contacts, ...over })}
      viewer={viewer}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
}

const contactsCard = () =>
  document.querySelector<HTMLElement>(
    `[data-testid="crew-panel-card"][data-card-id="${CONTACTS_CARD_ID}"]`,
  );
const rows = () => [...document.querySelectorAll('[data-testid="crew-panel-contact-row"]')];

/** Crew-style body props: every required prop, the crew's builders, nothing else. */
function bodyProps(contacts: ContactRow[], over: Partial<ContactsBodyProps> = {}) {
  return {
    includeClient: false,
    contacts,
    cap: 8,
    overflow: (hidden: number) => <p data-testid="overflow">{`${hidden} hidden`}</p>,
    showNotes: true,
    telHref: crewTelHref,
    mailtoHref: crewMailtoHref,
    sentinels: "hide",
    actionsPlacement: "below",
    ...over,
  } as ContactsBodyProps;
}

/** A plain crew-style body call. */
function body(contacts: ContactRow[], over: Partial<ContactsBodyProps> = {}) {
  return ContactsBody(bodyProps(contacts, over));
}

describe("ContactsBody", () => {
  test("the cap is a prop: the same contacts under two caps show that many rows, and the overflow gets the rest", () => {
    const list = Array.from({ length: 5 }, (_, i) => contact(`Person ${i}`, { phone: "555 0100" }));
    for (const cap of [3, 4]) {
      const { container } = render(body(list, { cap }));
      expect(container.querySelectorAll("li"), `cap ${cap}`).toHaveLength(cap);
      expect(screen.getByTestId("overflow").textContent, `cap ${cap}`).toBe(
        `${list.length - cap} hidden`,
      );
      // The tail is cut, not the head.
      expect(container).toHaveTextContent(`Person ${cap - 1}`);
      expect(container).not.toHaveTextContent(`Person ${cap}`);
      cleanup();
    }
    // No cap (the admin's): every contact renders and no overflow does.
    const uncapped: Partial<ContactsBodyProps> = bodyProps(list);
    delete uncapped.cap;
    const { container } = render(ContactsBody(uncapped as ContactsBodyProps));
    expect(container.querySelectorAll("li")).toHaveLength(list.length);
    expect(screen.queryByTestId("overflow")).toBeNull();
  });

  test("includeClient: the client contact's blocks come first only when the surface includes it", () => {
    const venue = [contact("Vic Venue", { phone: "555 0120" })];
    const withClient = render(
      body(venue, { includeClient: true, clientContact: CLIENT } as Partial<ContactsBodyProps>),
    ).container;
    const names = [...withClient.querySelectorAll("li")].map(
      (li) => li.querySelector("span.font-medium")?.textContent,
    );
    expect(names).toEqual([CLIENT.name, CLIENT.secondary!.name, "Vic Venue"]);
    cleanup();
    const without = render(body(venue)).container;
    for (const value of CLIENT_VALUES) expect(without.innerHTML, value).not.toContain(value);
    expect(without.querySelectorAll("li")).toHaveLength(1);
  });

  test("showNotes: a note renders only when the surface shows notes; under sentinels hide a sentinel note does not", () => {
    const list = [
      contact("Stella", { phone: "555 0100", notes: "Loading dock combo 4471" }),
      contact("Omar", { phone: "555 0101", notes: "TBD" }),
    ];
    const shown = render(body(list)).container;
    expect(shown).toHaveTextContent("Loading dock combo 4471");
    expect(shown).not.toHaveTextContent("TBD");
    cleanup();
    expect(render(body(list, { showNotes: false })).container).not.toHaveTextContent(
      "Loading dock combo 4471",
    );
  });

  test("under sentinels: hide a sentinel name is not the heading (the kind is); under show it renders as parsed", () => {
    const list = [contact("N/A", { phone: "555 0199" })];
    const hidden = render(body(list)).container;
    expect(hidden).not.toHaveTextContent("N/A");
    expect(screen.getByRole("link", { name: "Call Venue contact" })).toBeInTheDocument();
    cleanup();
    const shown = render(body(list, { sentinels: "show" })).container;
    expect(shown).toHaveTextContent("N/A");
  });

  test("a named contact's kind is the line under the name; a nameless one's kind is its heading", () => {
    const { container } = render(
      body([
        contact("Vic Venue", { phone: "555 0120" }),
        contact(null, { kind: "in_house_av", email: "av@venue.example" }),
      ]),
    );
    // The identity column's lines, the avatar's initials aside.
    const lines = (li: Element) =>
      [...li.querySelectorAll("span.wrap-break-word")].map((el) => el.textContent);
    const [named, nameless] = [...container.querySelectorAll("li")];
    expect(lines(named!)).toEqual(["Vic Venue", "Venue contact"]);
    expect(lines(nameless!)).toEqual(["In-house AV"]);
  });

  test("Call uses the surface's builder and Email its builder; each is a drawn icon, never a glyph", () => {
    const { container } = render(
      body([contact("Pat Venue", { phone: "(646) 256-3148", email: "pat@venue.example" })]),
    );
    const call = screen.getByRole("link", { name: "Call Pat Venue" });
    const email = screen.getByRole("link", { name: "Email Pat Venue" });
    expect(call).toHaveAttribute("href", "tel:6462563148");
    expect(email).toHaveAttribute("href", "mailto:pat@venue.example");
    for (const a of [call, email]) {
      expect(a.querySelector("svg"), a.getAttribute("aria-label")!).not.toBeNull();
      expect(a.textContent).toBe("");
    }
    expect(container.textContent).not.toMatch(/[☎✉]/);
  });

  test("a phone the builder refuses renders no Call action, and a row with no name and nothing to tap renders nothing", () => {
    const { container } = render(
      body([
        contact("Pat Venue", { phone: "call the office", email: "pat@venue.example" }),
        contact(null, { phone: "TBD", notes: "Unreachable note" }),
      ]),
    );
    expect(screen.queryByRole("link", { name: /^Call / })).toBeNull();
    expect(screen.getByRole("link", { name: "Email Pat Venue" })).toBeInTheDocument();
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(container).not.toHaveTextContent("Unreachable note");
  });

  test("search markers come only from the target map", () => {
    const list = [contact("Pat Venue", { phone: "555 0100", notes: "Side door" })];
    const key = contactsBodyModule.contactsBodyBlocks(null, list)[0]!.key;
    const { container } = render(
      body(list, { targets: { [key]: { identity: "t-id", notes: "t-note" } } }),
    );
    const found = [...container.querySelectorAll("[data-search-target]")].map((el) => [
      el.getAttribute("data-search-target"),
      el.textContent,
    ]);
    expect(found).toEqual([
      ["t-id", "Pat VenueVenue contact"],
      ["t-note", "Side door"],
    ]);
    // The avatar's initials and the actions are not sheet text.
    expect(container.querySelectorAll("[data-search-skip]").length).toBe(2);

    cleanup();
    const bare = render(body(list)).container;
    expect(
      bare.querySelector("[data-search-target],[data-search-skip],[data-search-group]"),
    ).toBeNull();
  });

  test("row test ids come only from rowTestId, and action test ids only from testIdPrefix", () => {
    const list = [contact("Pat Venue", { phone: "555 0100" })];
    // The avatar's own test id is the atom's, on every surface.
    const ids = (root: HTMLElement) =>
      [...root.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid"));
    expect(ids(render(body(list)).container)).toEqual(["avatar"]);
    cleanup();
    const named = render(body(list, { rowTestId: "row-x", testIdPrefix: "pre" })).container;
    expect(ids(named)).toEqual(["row-x", "avatar", "pre-contact-contact-0-phone"]);
  });
});

describe("crew contacts props", () => {
  test("AC-6: the client contact never reaches the crew props or HTML; the admin popup renders it from the same fixture", () => {
    const data = makeShowForViewer({
      show: { client_contact: CLIENT },
      contacts: [contact("Vic Venue", { phone: "555 0120", email: "vic@venue.example" })],
    });
    // Positive control: the admin popup's body shows the client contact today.
    const admin = render(
      <ContactsBreakdown
        dfid="drive-1"
        clientContact={data.show.client_contact}
        contacts={data.contacts}
      />,
    ).container;
    for (const value of [CLIENT.name, CLIENT.secondary!.name]) {
      expect(admin.innerHTML, value).toContain(value);
    }
    cleanup();

    const serialized = JSON.stringify(contactsPanel(data));
    premiseHolds("the crew props carry the venue contact", serialized.includes("Vic Venue"));
    for (const value of CLIENT_VALUES) expect(serialized, value).not.toContain(value);
    expect(serialized).not.toContain("clientContact");

    const html = render(
      <ContactsSection
        ledger={createTileRenderLedger()}
        data={data}
        viewer={{ kind: "admin" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container.innerHTML;
    premiseHolds("the crew section renders the venue contact", html.includes("Vic Venue"));
    for (const value of CLIENT_VALUES) expect(html, value).not.toContain(value);
  });

  test("the cap boundary: CONTACTS_INLINE_CAP rows render with no overflow, one past it renders the cap and a +1 stub", () => {
    const list = (n: number) =>
      Array.from({ length: n }, (_, i) => contact(`Venue Contact ${i}`, { phone: "555 0100" }));
    renderContacts(list(CONTACTS_INLINE_CAP));
    expect(rows()).toHaveLength(CONTACTS_INLINE_CAP);
    expect(screen.queryByTestId("contacts-overflow-stub")).toBeNull();
    cleanup();
    renderContacts(list(CONTACTS_INLINE_CAP + 1));
    expect(rows()).toHaveLength(CONTACTS_INLINE_CAP);
    const stub = screen.getByTestId("contacts-overflow-stub");
    expect(stub).toHaveAttribute("data-tile-show-more", "true");
    expect(stub.textContent).toBe("+1 more contact on the source sheet");
  });

  test("Call is absent for a digit-less phone and Email for a sentinel address; a phone with digits calls its digits", () => {
    renderContacts([contact("Pat Venue", { phone: "call the office", email: "N/A" })]);
    const card = contactsCard();
    premiseHolds("the contacts card rendered", card !== null);
    expect(within(card!).queryByRole("link", { name: /^Call / })).toBeNull();
    expect(within(card!).queryByRole("link", { name: /^Email / })).toBeNull();
    expect(card).toHaveTextContent("Pat Venue");
    cleanup();
    renderContacts([contact("Pat Venue", { phone: "(555) 010-0100", email: "pat@venue.example" })]);
    expect(within(contactsCard()!).getByRole("link", { name: "Call Pat Venue" })).toHaveAttribute(
      "href",
      "tel:5550100100",
    );
    expect(within(contactsCard()!).getByRole("link", { name: "Email Pat Venue" })).toHaveAttribute(
      "href",
      "mailto:pat@venue.example",
    );
  });
});

describe("ContactsSection (crew)", () => {
  test('the contacts are the crew panel card titled with the registry label, "Contacts" (spec line 404), with card id crew-contacts and its actions', () => {
    renderContacts([contact("Pat Venue", { phone: "555 0100" })]);
    const root = screen.getByTestId("section-contacts");
    const card = contactsCard();
    premiseHolds("the section renders the panel card", card !== null && root.contains(card));
    expectUntitledPanel(card!, showSection("contacts").label);
    expect(showSection("contacts").label).toBe("Contacts");
    expect(card!.querySelector('[data-slot="section-card-action"]')).not.toBeNull();
    expect(card).toHaveTextContent("Pat Venue");
  });

  test("contacts' label and glyph are the registry's (decisions 2 and 3)", () => {
    expect(SECTION_ICON.contacts).toBe(showSection("contacts").icon);
  });

  test("no contacts: the section's empty state and no card", () => {
    renderContacts([]);
    const root = screen.getByTestId("section-contacts");
    const empty = within(root).getByTestId("section-empty");
    expect(empty.textContent).toBe("No contacts on file yet.");
    expect(empty).toBeVisible();
    expect(contactsCard()).toBeNull();
  });

  test.each([
    ["admin", { kind: "admin" } as Viewer, true],
    ["crew", { kind: "crew", crewMemberId: "c1" } as Viewer, false],
    ["admin_preview", { kind: "admin_preview", crewMemberId: "c1" } as Viewer, false],
  ])(
    "a failed contacts fetch shows its load-failure block to an admin only: %s",
    (_kind, viewer, expected) => {
      renderContacts([], viewer, createTileRenderLedger(), {
        crewMembers: [
          {
            id: "c1",
            name: "Pat Crew",
            email: null,
            phone: null,
            role: "",
            roleFlags: [],
            dateRestriction: { kind: "none" },
            stageRestriction: { kind: "none" },
          },
        ],
        tileErrors: { contacts: "contacts read failed" },
      });
      const root = screen.getByTestId("section-contacts");
      expect(root.querySelector('[data-testid="section-tile-error-contacts"]') !== null).toBe(
        expected,
      );
      // Never both: the failure is not rendered as an empty list to the viewer who sees it.
      expect(root.querySelector('[data-testid="section-empty"]') !== null).toBe(!expected);
    },
  );

  test("the Crew section no longer renders the contacts", () => {
    const contacts = [contact("Vic Venue", { phone: "555 0120", notes: "Ask for Vic" })];
    const { container } = render(
      <CrewSection
        ledger={createTileRenderLedger()}
        data={makeShowForViewer({
          contacts,
          crewMembers: [
            {
              id: "c1",
              name: "Pat Crew",
              email: null,
              phone: null,
              role: "A1",
              roleFlags: [],
              dateRestriction: { kind: "none" },
              stageRestriction: { kind: "none" },
            },
          ],
        })}
        viewer={{ kind: "admin" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    premiseHolds(
      "the Crew section renders its roster",
      container.textContent!.includes("Pat Crew"),
    );
    expect(container).not.toHaveTextContent("Vic Venue");
    expect(container).not.toHaveTextContent("Ask for Vic");
    expect(container.querySelector(`[data-card-id="${CONTACTS_CARD_ID}"]`)).toBeNull();
  });
});

describe("error containment (spec line 291, line 507)", () => {
  test("a throw from ContactsBody inside the crew WrappedSection renders the fallback and records crew:contacts:list", () => {
    const ledger = createTileRenderLedger();
    const spy = vi.spyOn(contactsBodyModule, "ContactsBody").mockImplementation(() => {
      throw new Error("planted contacts body fault");
    });
    renderContacts([contact("Pat Venue", { phone: "555 0100" })], { kind: "admin" }, ledger);
    premise("the section called the body", spy.mock.calls.length, 0);
    expect(screen.getByTestId("tile-error-fallback")).toBeInTheDocument();
    expect(ledger.failed.get("crew:contacts:list")?.message).toBe("planted contacts body fault");
    expect(screen.getByTestId("section-contacts")).not.toHaveTextContent("Pat Venue");
  });
});

/**
 * PR B invariant-8 UI gate rows 13, 17 and 20: the crew contacts' empty case
 * and contact actions. The body props default to the admin's markup.
 */
describe("Contacts crew presentation (gate rows 13, 17, 20)", () => {
  const withActions = [contact("Vic Venue", { phone: "555 0120", email: "vic@venue.example" })];
  const squares = (root: Element) =>
    [...root.querySelectorAll("a[aria-label]")].map((a) => a.firstElementChild as HTMLElement);

  test('actionTone "text": the glyph is body text with the home "Who to call" hover; the default stays subtle with no hover', () => {
    const plain = render(body(withActions)).container;
    const rest = squares(plain);
    premise("drawn actions", rest.length, 1);
    for (const sq of rest) expect(sq.className).toContain("text-text-subtle");
    cleanup();
    const drawn = squares(render(body(withActions, { actionTone: "text" })).container);
    premise("drawn actions", drawn.length, 1);
    for (const sq of drawn) {
      const cls = sq.className.split(/\s+/);
      expect(cls).toContain("text-text");
      expect(cls).not.toContain("text-text-subtle");
      expect(cls).toEqual(
        expect.arrayContaining(["group-hover:bg-surface-sunken", "group-hover:text-accent-on-bg"]),
      );
      expect(sq.parentElement!.className.split(/\s+/)).toContain("group");
    }
  });

  test('actionsPlacement "below-until-split": under the identity below the threshold, at the row end from it; the note stays under both', () => {
    const noted = [
      contact("Vic Venue", { phone: "555 0120", email: "vic@venue.example", notes: "Ask for Vic" }),
    ];
    const root = render(body(noted, { actionsPlacement: "below-until-split" })).container;
    const actions = root.querySelector("a[aria-label]")!.parentElement!;
    const pair = actions.parentElement!;
    expect(pair.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        "flex-col",
        "@min-crew-split:flex-row",
        "@min-crew-split:items-center",
      ]),
    );
    expect(pair.firstElementChild).toHaveTextContent("Vic Venue");
    expect(pair.lastElementChild).toBe(actions);
    expect(actions.className.split(/\s+/)).toContain("@min-crew-split:ml-0");
    // The note follows the identity-and-actions pair, in the same column.
    expect(pair.nextElementSibling).toHaveTextContent("Ask for Vic");
  });

  test("every contact without a name or anything to tap: the section's own empty state, never the admin's \"No contacts parsed.\" or an empty card", () => {
    // Two blocks the body drops: a sentinel name with a digit-less phone, and a
    // nameless contact whose only email is a sentinel.
    const unrenderable = [
      contact("TBD", { phone: "ask at desk" }),
      contact(null, { email: "N/A" }),
    ];
    renderContacts(unrenderable);
    const root = screen.getByTestId("section-contacts");
    expect(root).not.toHaveTextContent("No contacts parsed.");
    expect(within(root).getByTestId("section-empty").textContent).toBe("No contacts on file yet.");
    expect(contactsCard()).toBeNull();
    cleanup();
    // POSITIVE CONTROL: one renderable contact among them brings the card back.
    renderContacts([...unrenderable, contact("Vic Venue", { phone: "555 0120" })]);
    expect(contactsCard()).not.toBeNull();
    expect(
      screen.getByTestId("section-contacts").querySelector('[data-testid="section-empty"]'),
    ).toBeNull();
  });

  test("the crew contacts pass both: their actions are drawn in body text and close the row from the threshold", () => {
    renderContacts(withActions);
    const row = rows()[0]!;
    premiseHolds("the contact row rendered", row !== undefined);
    const square = row.querySelector("a[aria-label] > span")!;
    expect(square.className.split(/\s+/)).toContain("text-text");
    expect(row.querySelector("[class*='@min-crew-split:flex-row']")).not.toBeNull();
  });
});
