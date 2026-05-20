// @vitest-environment jsdom
// tests/help/tip-from-sheets.test.tsx
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TipFromSheets } from "@/app/help/_components/TipFromSheets";

afterEach(() => cleanup());

describe("<TipFromSheets>", () => {
  it("renders the 'From Sheets' label + children", () => {
    render(<TipFromSheets>In your old workflow…</TipFromSheets>);
    expect(screen.getByText(/from sheets/i)).toBeInTheDocument();
    expect(screen.getByText(/In your old workflow/)).toBeInTheDocument();
  });
});
