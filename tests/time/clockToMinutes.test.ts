import { describe, expect, test } from "vitest";
import { clockToMinutes } from "@/lib/time/clockToMinutes";

describe("clockToMinutes", () => {
  test("bare hour ≡ explicit minutes (catches a parser that ignores bare hours)", () => {
    expect(clockToMinutes("9 AM")).toBe(540);
    expect(clockToMinutes("9:00 AM")).toBe(540);
  });
  test("12-hour wrap (catches noon/midnight inversion)", () => {
    expect(clockToMinutes("12:00 AM")).toBe(0);
    expect(clockToMinutes("12:30 AM")).toBe(30);
    expect(clockToMinutes("12:00 PM")).toBe(720);
    expect(clockToMinutes("12:30 PM")).toBe(750);
    expect(clockToMinutes("1:00 PM")).toBe(780);
  });
  test("range → start", () => {
    expect(clockToMinutes("9:00 AM – 9:40 AM")).toBe(540); // en-dash
    expect(clockToMinutes("9:00 AM - 9:40 AM")).toBe(540); // hyphen
  });
  test("lowercase meridiem accepted (sheet/agenda case variance)", () => {
    expect(clockToMinutes("12:00pm")).toBe(720);
  });
  test("no meridiem / trailing garbage → null (proves the ^…$ anchor)", () => {
    expect(clockToMinutes("9:00")).toBeNull();
    expect(clockToMinutes("TBD")).toBeNull();
    expect(clockToMinutes("9:00 AM x")).toBeNull();
  });
  test("impossible clocks → null (range-validation; corrupt JSONB cannot become a placeable position)", () => {
    expect(clockToMinutes("13:00 PM")).toBeNull();
    expect(clockToMinutes("99:99 PM")).toBeNull();
    expect(clockToMinutes("9:75 AM")).toBeNull();
    expect(clockToMinutes("0:00 AM")).toBeNull();
  });
});
