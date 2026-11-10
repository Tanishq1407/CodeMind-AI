import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Resend email delivery", () => {
  it("uses the verified CodeMind sender without exposing credentials", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-secret-key");
    vi.stubEnv("EMAIL_FROM", "CodeMind AI <noreply@codemindai.site>");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail("user@example.com", "Verify", "Verification message");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: "CodeMind AI <noreply@codemindai.site>",
      to: "user@example.com",
      subject: "Verify",
    });
    expect(String(init.body)).not.toContain("test-secret-key");
  });
});
