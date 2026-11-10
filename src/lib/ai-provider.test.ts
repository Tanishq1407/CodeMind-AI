import { afterEach, describe, expect, it, vi } from "vitest";
import { completeWithAi } from "./ai-provider";

afterEach(() => vi.unstubAllEnvs());

describe("AI provider configuration", () => {
  it("fails explicitly when a server-side provider is not configured", async () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    await expect(completeWithAi([{ role: "user", content: "Explain this code" }])).rejects.toMatchObject({ kind: "configuration" });
  });
});
