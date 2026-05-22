// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Screenshot } from "@/app/help/_components/Screenshot";
import { MANIFEST } from "@/scripts/help-screenshots.manifest";

afterEach(() => cleanup());

describe("<Screenshot> <picture>-contract per manifest entry (F.6 / test #10)", () => {
  for (const entry of MANIFEST) {
    it(`${entry.key}: emits <picture> + <source media=dark> + <img>`, () => {
      const { container } = render(<Screenshot name={entry.key} alt="Test alt" />);

      const picture = container.querySelector("picture");
      expect(picture, `<picture> missing for ${entry.key}`).not.toBeNull();

      const darkSource = picture!.querySelector('source[media="(prefers-color-scheme: dark)"]');
      expect(darkSource, `dark <source> missing for ${entry.key}`).not.toBeNull();
      expect(darkSource!.getAttribute("srcset")).toBe(`/help/screenshots/${entry.key}-dark.webp`);

      const img = picture!.querySelector("img");
      expect(img, `<img> missing for ${entry.key}`).not.toBeNull();
      expect(img!.getAttribute("src")).toBe(`/help/screenshots/${entry.key}-light.webp`);
      expect(img!.getAttribute("alt")).toBe("Test alt");
    });
  }
});
