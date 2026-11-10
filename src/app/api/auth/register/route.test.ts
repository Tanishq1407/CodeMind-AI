import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compare } from "bcryptjs";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    user: { create: vi.fn() },
  },
  consumeRateLimit: vi.fn(),
  readJsonBounded: vi.fn((request: Request) => request.json()),
  requestIp: vi.fn(() => "203.0.113.10"),
  sameOrigin: vi.fn(() => true),
  sendEmail: vi.fn(),
  createRawToken: vi.fn(() => "fresh-verification-token-0123456789"),
  hashToken: vi.fn((token: string) => `sha256:${token}`),
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

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/codemind");
  vi.stubEnv("AUTH_SECRET", "s".repeat(40));
  vi.stubEnv("RESEND_API_KEY", "test-resend-key");
  vi.stubEnv("EMAIL_FROM", "CodeMind AI <noreply@codemindai.site>");
  mocks.consumeRateLimit.mockResolvedValue(true);
  mocks.prisma.$queryRaw.mockResolvedValue([]);
  mocks.prisma.user.create.mockResolvedValue({ id: "user-1", email: "new@example.com" });
  mocks.sendEmail.mockResolvedValue(undefined);
});

function request(data: Record<string, string>) {
  return new Request("https://codemindai.site/api/auth/register", {
    method: "POST",
    headers: { origin: "https://codemindai.site", "content-type": "application/json" },
    body: JSON.stringify(data),
  });
}

const details = (username = "Tanishq14", email = "User@example.com") => ({
  username,
  email,
  password: "SecurePassword123!",
});

describe("POST /api/auth/register", () => {
  it("rejects missing configuration before persistence", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");

    const response = await POST(request(details()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "REGISTRATION_NOT_CONFIGURED" });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects invalid details before persistence", async () => {
    const response = await POST(request({ ...details("x", "invalid"), password: "short" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_REGISTRATION_DETAILS" });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("creates a unique account with a bcrypt hash and a hashed verification token", async () => {
    const response = await POST(request(details("Tanishq14", " User@Example.com ")));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toContain("fresh-verification-token");

    const createCall = mocks.prisma.user.create.mock.calls[0][0];
    expect(createCall.data.username).toBe("tanishq14");
    expect(createCall.data.email).toBe("user@example.com");
    expect(createCall.data.passwordHash).not.toBe("SecurePassword123!");
    await expect(compare("SecurePassword123!", createCall.data.passwordHash)).resolves.toBe(true);
    expect(createCall.data.emailVerificationTokens.create.tokenHash).toBe("sha256:fresh-verification-token-0123456789");
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });

  it("returns the verified-email conflict for an existing email regardless of case", async () => {
    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ emailVerified: new Date() }]);
    const response = await POST(request(details("DifferentName", "USER@EXAMPLE.COM")));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "EMAIL_ALREADY_EXISTS",
      field: "email",
      error: "Email already exists. Please sign in or reset your password.",
    });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("offers resend for an existing unverified email", async () => {
    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ emailVerified: null }]);
    const response = await POST(request(details("DifferentName", "user@example.com")));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "EMAIL_NOT_VERIFIED", field: "email" });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects a username already used with a different email, ignoring case", async () => {
    mocks.prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "existing-user" }]);
    const response = await POST(request(details("TANISHQ14", "different@example.com")));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "USERNAME_ALREADY_EXISTS",
      field: "username",
      error: "Username already exists. Please choose another username.",
    });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("handles simultaneous duplicate submissions through database unique constraints", async () => {
    let emailLookups = 0;
    mocks.prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ").toLowerCase();
      if (sql.includes('"email"')) {
        emailLookups += 1;
        return emailLookups <= 2 ? [] : [{ emailVerified: null }];
      }
      return [];
    });
    let creates = 0;
    mocks.prisma.user.create.mockImplementation(async () => {
      creates += 1;
      if (creates === 1) return { id: "user-1", email: "user@example.com" };
      throw Object.assign(new Error("database detail"), { code: "P2002" });
    });

    const responses = await Promise.all([
      POST(request(details("Tanishq14", "user@example.com"))),
      POST(request(details("TANISHQ14", "USER@example.com"))),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const conflict = await responses.find((response) => response.status === 409)!.json();
    expect(conflict.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("rate-limits before looking up or creating an account", async () => {
    mocks.consumeRateLimit.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const response = await POST(request(details()));
    expect(response.status).toBe(429);
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });
});
