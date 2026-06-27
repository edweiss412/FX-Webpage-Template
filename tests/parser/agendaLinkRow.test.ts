import { test, expect } from "vitest";
import { isAgendaLinkRow } from "@/lib/parser/agendaLinkRow";
test("matches AGENDA LINK rows with a non-empty value, mirroring parseAgendaLinks", () => {
  expect(isAgendaLinkRow("AGENDA LINK - RFI", "file.pdf")).toBe(true);
  expect(isAgendaLinkRow("AGENDA", "https://x")).toBe(true);
  expect(isAgendaLinkRow("AGENDA LINK - RFI", "   ")).toBe(false); // blank value
  expect(isAgendaLinkRow("AGENDA DAY", "x")).toBe(false); // not an agenda-link label
  expect(isAgendaLinkRow("CREW", "x")).toBe(false);
});
