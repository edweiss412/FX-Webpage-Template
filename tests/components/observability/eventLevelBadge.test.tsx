// @vitest-environment jsdom
// tests/components/observability/eventLevelBadge.test.tsx
import { afterEach, describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EventLevelBadge } from "@/components/admin/observability/EventLevelBadge";

afterEach(cleanup);

describe("EventLevelBadge", () => {
  test.each([["info", "Info"], ["warn", "Warn"], ["error", "Error"]] as const)(
    "%s renders a text label (never color-only)", (level, label) => {
      render(<EventLevelBadge level={level} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
});
