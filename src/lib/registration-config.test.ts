import { describe, expect, it } from "vitest";
import { missingRegistrationConfiguration, registrationDatabaseFailure } from "@/lib/registration-config";

describe("registration configuration", () => {
  it("names required settings without exposing their values", () => {
    expect(missingRegistrationConfiguration({})).toEqual([
      "DATABASE_URL",
      "AUTH_SECRET (at least 32 characters)",
      "RESEND_API_KEY",
      "EMAIL_FROM",
    ]);
  });

  it("accepts a fully configured registration environment", () => {
    expect(missingRegistrationConfiguration({
      DATABASE_URL: "postgresql://localhost/codemind",
      AUTH_SECRET: "x".repeat(32),
      RESEND_API_KEY: "configured",
      EMAIL_FROM: "CodeMind <accounts@example.test>",
    })).toEqual([]);
  });

  it("returns safe, actionable database messages and handles unique races", () => {
    expect(registrationDatabaseFailure({ name: "PrismaClientInitializationError" })).toMatchObject({
      status: 503,
      body: { code: "DATABASE_UNAVAILABLE" },
    });
    expect(registrationDatabaseFailure({ code: "P2002" })).toMatchObject({
      status: 409,
      body: { code: "ACCOUNT_ALREADY_EXISTS" },
    });
    expect(registrationDatabaseFailure(new Error("private database detail"))).toMatchObject({
      status: 503,
      body: { code: "DATABASE_OPERATION_FAILED" },
    });
  });
});
