// @vitest-environment jsdom
/**
 * tests/components/crew/personRow.test.tsx (crew-redesign Task 4)
 *
 * <PersonRow> ports the CrewTile/ContactsTile contact-row idiom into a
 * reusable crew-section primitive. This suite pins the dead-link guard
 * matrix (port of the round-15/16 sentinel-on-actionable-link fix):
 *
 *   - phone-only / email-only / neither / both → exactly the right
 *     tap-action set, never an empty or dead control;
 *   - a sentinel/blank phone never produces a `tel:` href;
 *   - a nameless-but-actionable contact still renders (fallbackLabel)
 *     and keeps its tap actions (preserves ContactsTile behavior);
 *   - notes routes through shouldHideGenericOptional (TBD → hidden);
 *   - a fully-empty person (no name/role/phone/email) omits the row;
 *   - call/email buttons carry an aria-label + the 44px tap floor.
 *
 * Expected values are derived from the per-test fixture, never hardcoded.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PersonRow } from "@/components/crew/primitives/PersonRow";

afterEach(cleanup);

/** Collect every rendered tel:/mailto: anchor href under a container. */
function actionHrefs(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll("a[href]")).map(
    (a) => a.getAttribute("href") ?? "",
  );
}
const telHrefs = (root: ParentNode) => actionHrefs(root).filter((h) => h.startsWith("tel:"));
const mailHrefs = (root: ParentNode) => actionHrefs(root).filter((h) => h.startsWith("mailto:"));

describe("<PersonRow> — actionable-contact matrix", () => {
  test("phone-only → a tel: action, NO mailto:", () => {
    const person = { name: "Doug Larson", phone: "(212) 555-0148" };
    const { container } = render(<PersonRow person={person} />);
    expect(telHrefs(container)).toHaveLength(1);
    expect(mailHrefs(container)).toHaveLength(0);
    // href is digits-only so the dialer opens cleanly.
    expect(telHrefs(container)[0]).toBe(`tel:${person.phone.replace(/\D+/g, "")}`);
  });

  test("email-only → a mailto: action, NO tel:", () => {
    const person = { name: "Doug Larson", email: "doug@fxav.example" };
    const { container } = render(<PersonRow person={person} />);
    expect(mailHrefs(container)).toHaveLength(1);
    expect(telHrefs(container)).toHaveLength(0);
    expect(mailHrefs(container)[0]).toBe(`mailto:${person.email}`);
  });

  test("neither phone nor email → no action buttons", () => {
    const person = { name: "Doug Larson", role: "Producer" };
    const { container } = render(<PersonRow person={person} />);
    expect(actionHrefs(container)).toHaveLength(0);
  });

  test("both phone + email → both buttons", () => {
    const person = {
      name: "Doug Larson",
      phone: "212.555.0148",
      email: "doug@fxav.example",
    };
    const { container } = render(<PersonRow person={person} />);
    expect(telHrefs(container)).toHaveLength(1);
    expect(mailHrefs(container)).toHaveLength(1);
  });
});

describe("<PersonRow> — href sanitization (dead-link guard)", () => {
  test('sentinel phone ("TBD") → NO tel: link rendered (no dead href)', () => {
    const person = { name: "Doug Larson", phone: "TBD" };
    const { container } = render(<PersonRow person={person} />);
    expect(telHrefs(container)).toHaveLength(0);
    // Belt-and-braces: no anchor carries a bare/dead tel: href.
    expect(actionHrefs(container).some((h) => h === "tel:" || h === "tel:TBD")).toBe(false);
  });

  test('blank phone ("") → NO tel: link rendered', () => {
    const person = { name: "Doug Larson", phone: "" };
    const { container } = render(<PersonRow person={person} />);
    expect(telHrefs(container)).toHaveLength(0);
  });

  test('sentinel email ("N/A") → NO mailto: link rendered', () => {
    const person = { name: "Doug Larson", email: "N/A" };
    const { container } = render(<PersonRow person={person} />);
    expect(mailHrefs(container)).toHaveLength(0);
  });
});

describe("<PersonRow> — nameless-but-actionable contact", () => {
  test("name absent + phone present → row renders with fallbackLabel + tap action", () => {
    const person = { fallbackLabel: "Venue contact", phone: "212-555-0199" };
    const { container, getByTestId } = render(<PersonRow person={person} />);
    // Row is NOT dropped — the actionable contact survives the port.
    expect(getByTestId("person-row")).toBeTruthy();
    expect(container.textContent ?? "").toContain(person.fallbackLabel);
    expect(telHrefs(container)).toHaveLength(1);
  });

  test("name absent + email present → row renders with fallbackLabel + mailto", () => {
    const person = { fallbackLabel: "In-house AV", email: "av@venue.example" };
    const { container, getByTestId } = render(<PersonRow person={person} />);
    expect(getByTestId("person-row")).toBeTruthy();
    expect(container.textContent ?? "").toContain(person.fallbackLabel);
    expect(mailHrefs(container)).toHaveLength(1);
  });
});

describe("<PersonRow> — notes sentinel-hiding", () => {
  test("notes present (non-sentinel) → rendered", () => {
    const person = { name: "Doug Larson", notes: "Arriving Tuesday, meet at dock" };
    const { container } = render(<PersonRow person={person} />);
    expect(container.textContent ?? "").toContain(person.notes);
  });

  test('notes = "TBD" → hidden (routed through shouldHideGenericOptional)', () => {
    const person = { name: "Doug Larson", notes: "TBD" };
    const { container } = render(<PersonRow person={person} />);
    expect(container.textContent ?? "").not.toContain("TBD");
  });
});

describe("<PersonRow> — whole-row omission", () => {
  test("name + role + phone + email all absent → row omitted (firstChild null)", () => {
    // notes alone (or none) is not enough to render an identity-less row.
    const { container } = render(<PersonRow person={{}} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("<PersonRow> — tap-target accessibility", () => {
  test("call + email buttons carry an aria-label and the 44px tap floor", () => {
    const person = {
      name: "Doug Larson",
      phone: "212-555-0148",
      email: "doug@fxav.example",
    };
    const { container } = render(<PersonRow person={person} />);
    const anchors = Array.from(container.querySelectorAll("a[href]"));
    expect(anchors.length).toBe(2);
    for (const a of anchors) {
      // accessible name present (icon-only buttons are otherwise unlabeled).
      expect((a.getAttribute("aria-label") ?? "").length).toBeGreaterThan(0);
      // 44px tap floor via the --spacing-tap-min token utility.
      expect(a.className).toContain("min-h-tap-min");
    }
    // The labels name the person so screen-reader users know who they're
    // calling/emailing — derived from the fixture, not hardcoded copy.
    const labels = anchors.map((a) => a.getAttribute("aria-label") ?? "");
    expect(labels.some((l) => l.includes(person.name))).toBe(true);
  });
});

describe("<PersonRow> — icon-only 44px contact buttons (mock .cbtn)", () => {
  test("renders icon-only phone + email controls with accessible names and no visible label text", () => {
    const person = { name: "Jane Doe", phone: "610-456-0711", email: "jane@x.com" };
    const { container } = render(<PersonRow person={person} />);

    // Accessible names survive: getByLabelText-style lookup against the anchors.
    const anchors = Array.from(container.querySelectorAll("a[href]"));
    const call = anchors.find((a) => a.getAttribute("aria-label") === `Call ${person.name}`);
    const email = anchors.find((a) => a.getAttribute("aria-label") === `Email ${person.name}`);
    expect(call).toBeTruthy();
    expect(email).toBeTruthy();

    // Correct tel:/mailto: hrefs (phone digits-only so the dialer opens clean).
    expect(call?.getAttribute("href")).toBe(`tel:${person.phone.replace(/\D+/g, "")}`);
    expect(email?.getAttribute("href")).toBe(`mailto:${person.email}`);

    // Icon-only: the controls must not render a visible "Call"/"Email" text
    // label. Scope the assertion to the action anchors so an unrelated sibling
    // (heading, role, notes) that happens to contain those substrings cannot
    // mask a regression — and so the aria-label (which legitimately contains
    // "Call"/"Email") is not what we're scanning. We read textContent, which
    // excludes attribute values.
    expect((call?.textContent ?? "")).not.toContain("Call");
    expect((email?.textContent ?? "")).not.toContain("Email");

    // Each control is a square 44px tap target per the mock `.cbtn` spec:
    // the centered glyph fills the square, so the anchor carries both the
    // tap-min sizing and `justify-center` (icon centered, not left-aligned).
    for (const a of [call, email]) {
      expect(a?.className).toContain("size-tap-min");
      expect(a?.className).toContain("min-h-tap-min");
      expect(a?.className).toContain("justify-center");
      expect(a?.className).toContain("rounded-[11px]");
    }
  });

  test("dead/sentinel contacts render no control (unchanged gate)", () => {
    const person = { name: "X", phone: "TBD", email: "N/A" };
    const { container } = render(<PersonRow person={person} />);
    const anchors = Array.from(container.querySelectorAll("a[href]"));
    expect(
      anchors.some((a) => (a.getAttribute("aria-label") ?? "").startsWith("Call")),
    ).toBe(false);
    expect(
      anchors.some((a) => (a.getAttribute("aria-label") ?? "").startsWith("Email")),
    ).toBe(false);
    expect(anchors).toHaveLength(0);
  });
});
