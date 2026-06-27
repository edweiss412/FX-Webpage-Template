import { test, expect } from "vitest";
import { agendaDisplayLabel } from "@/lib/agenda/agendaLabel";
test("strips the AGENDA LINK prefix", () => {
  expect(agendaDisplayLabel("AGENDA LINK - RFI")).toBe("RFI");
  expect(agendaDisplayLabel("AGENDA LINK - PCF")).toBe("PCF");
  expect(agendaDisplayLabel("AGENDA")).toBeNull();
  expect(agendaDisplayLabel("AGENDA LINK")).toBeNull();
});
