import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/auth/register configuration handling", () => {
  it("names missing required configuration and returns without pretending to create an account", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");

    const response = await POST(new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ username: "codemind_user", email: "user@example.com", password: "SecurePassword123!" }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "REGISTRATION_NOT_CONFIGURED",
      error: expect.stringContaining("DATABASE_URL, AUTH_SECRET (at least 32 characters), RESEND_API_KEY, EMAIL_FROM"),
    });
  });

  it("rejects invalid details before attempting account persistence", async () => {
    const response = await POST(new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ username: "x", email: "invalid", password: "short" }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_REGISTRATION_DETAILS" });
  });
});
