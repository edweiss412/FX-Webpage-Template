import { describe, expect, test } from "vitest";
import { botLoginConfigured } from "@/lib/reports/botLoginAlert";

describe("botLoginConfigured", () => {
  test("true only for a non-empty GITHUB_BOT_LOGIN", () => {
    const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;
    expect(botLoginConfigured(env({ GITHUB_BOT_LOGIN: "fxav-bot" }))).toBe(true);
    expect(botLoginConfigured(env({ GITHUB_BOT_LOGIN: "  " }))).toBe(false);
    expect(botLoginConfigured(env({ GITHUB_BOT_LOGIN: "" }))).toBe(false);
    expect(botLoginConfigured(env({}))).toBe(false);
  });
});
