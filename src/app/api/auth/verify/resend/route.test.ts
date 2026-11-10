import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as resendPOST } from "./route";
import { POST as verifyPOST } from "../route";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    emailVerificationToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: { update: vi.fn() },
  },
  consumeRateLimit: vi.fn(),
  readJsonBounded: vi.fn((request: Request) => request.json()),
  requestIp: vi.fn(() => "203.0.113.11"),
  sameOrigin: vi.fn(() => true),
  sendEmail: vi.fn(),
  createRawToken: vi.fn(() => "fresh-token-for-tests-0123456789"),
  hashToken: vi.fn((token: string) => `hash:${token}`),
  validAppOrigin: vi.fn(() => "https://codemindai.site"),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
  readJsonBounded: mocks.readJsonBounded,
  requestIp: mocks.requestIp,
  sameOrigin: mocks.sameOrigin,
}));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/tokens", () => ({
  createRawToken: mocks.createRawToken,
  hashToken: mocks.hashToken,
  validAppOrigin: mocks.validAppOrigin,
}));

const genericMessage = "If an unverified account exists for this email, a verification link has been sent.";

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/codemind");
  vi.stubEnv("AUTH_SECRET", "s".repeat(40));
  vi.stubEnv("RESEND_API_KEY", "test-resend-key");
  vi.stubEnv("EMAIL_FROM", "CodeMind AI <noreply@codemindai.site>");
  mocks.consumeRateLimit.mockResolvedValue(true);
  mocks.prisma.$queryRaw.mockResolvedValue([]);
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  mocks.prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 1 });
  mocks.prisma.emailVerificationToken.create.mockResolvedValue({});
  mocks.prisma.emailVerificationToken.findUnique.mockResolvedValue(null);
  mocks.prisma.user.update.mockResolvedValue({});
  mocks.sendEmail.mockResolvedValue(undefined);
});

function request(path: string, body: unknown) {
  return new Request(`https://codemindai.site${path}`, {
    method: "POST",
    headers: { origin: "https://codemindai.site", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/verify/resend", () => {
  it("issues a fresh hashed token to an existing unverified account", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ id: "user-1", email: "User@Example.com", emailVerified: null }])
      .mockResolvedValueOnce([{ emailVerified: null }]);

    const response = await resendPOST(request("/api/auth/verify/resend", { email: " USER@example.com " }));
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ ok: true, message: genericMessage });
    expect(mocks.prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mocks.prisma.emailVerificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", tokenHash: "hash:fresh-token-for-tests-0123456789" }),
    });
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.sendEmail.mock.calls[0][0]).toBe("user@example.com");
    expect(JSON.stringify(responseBody)).not.toContain("fresh-token-for-tests");
  });

  it.each([
    ["a verified account", [{ id: "user-1", email: "user@example.com", emailVerified: new Date() }]],
    ["a nonexistent account", []],
  ])("returns the same generic response for %s", async (_label, accountRows) => {
    mocks.prisma.$queryRaw.mockResolvedValueOnce(accountRows);
    const response = await resendPOST(request("/api/auth/verify/resend", { email: "user@example.com" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, message: genericMessage });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("returns a safe rate-limit response without checking account existence", async () => {
    mocks.consumeRateLimit.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const response = await resendPOST(request("/api/auth/verify/resend", { email: "user@example.com" }));
    expect(response.status).toBe(429);
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("keeps the response generic if Resend delivery fails", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ id: "user-1", email: "user@example.com", emailVerified: null }])
      .mockResolvedValueOnce([{ emailVerified: null }]);
    mocks.sendEmail.mockRejectedValueOnce(new Error("provider internal detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await resendPOST(request("/api/auth/verify/resend", { email: "user@example.com" }));
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ ok: true, message: genericMessage });
    expect(JSON.stringify(responseBody)).not.toContain("provider internal detail");
    expect(log).toHaveBeenCalledWith("[auth/verify/resend] Email delivery failed", {
      stage: "email_delivery",
      errorName: "Error",
    });
    log.mockRestore();
  });

  it("rejects malformed email input", async () => {
    const response = await resendPOST(request("/api/auth/verify/resend", { email: "not an email" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_EMAIL" });
  });
});

describe("POST /api/auth/verify", () => {
  it("rejects invalid and expired tokens without verifying an account", async () => {
    const invalidResponse = await verifyPOST(request("/api/auth/verify", { token: "short" }));
    expect(invalidResponse.status).toBe(400);
    expect(mocks.prisma.emailVerificationToken.findUnique).not.toHaveBeenCalled();

    mocks.prisma.emailVerificationToken.findUnique.mockResolvedValueOnce({
      id: "token-1", userId: "user-1", expiresAt: new Date(Date.now() - 1000),
    });
    const expiredResponse = await verifyPOST(request("/api/auth/verify", { token: "expired-token-0123456789" }));
    expect(expiredResponse.status).toBe(400);
    await expect(expiredResponse.json()).resolves.toMatchObject({ code: "INVALID_OR_EXPIRED_TOKEN" });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("rate-limits token verification attempts", async () => {
    mocks.consumeRateLimit.mockResolvedValueOnce(false);
    const response = await verifyPOST(request("/api/auth/verify", { token: "valid-token-0123456789" }));
    expect(response.status).toBe(429);
    expect(mocks.prisma.emailVerificationToken.findUnique).not.toHaveBeenCalled();
  });

  it("accepts the fresh token from a resend and verifies only after atomic token consumption", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ id: "user-1", email: "user@example.com", emailVerified: null }])
      .mockResolvedValueOnce([{ emailVerified: null }])
      .mockResolvedValueOnce([{ id: "user-1" }]);
    const resendResponse = await resendPOST(request("/api/auth/verify/resend", { email: "user@example.com" }));
    expect(resendResponse.status).toBe(200);

    mocks.prisma.emailVerificationToken.findUnique.mockResolvedValueOnce({
      id: "token-1", userId: "user-1", expiresAt: new Date(Date.now() + 60_000),
    });
    const verifyResponse = await verifyPOST(request("/api/auth/verify", { token: "fresh-token-for-tests-0123456789" }));
    expect(verifyResponse.status).toBe(200);
    await expect(verifyResponse.json()).resolves.toEqual({ ok: true });
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { emailVerified: expect.any(Date) },
    });
  });
});
