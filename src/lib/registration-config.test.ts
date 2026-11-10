import { describe, expect, it } from "vitest";
import { missingRegistrationConfiguration, registrationDatabaseFailure, registrationEmailConflict, registrationUsernameConflict } from "@/lib/registration-config";

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
    expect(registrationDatabaseFailure({ code: "P2021", message: "secret-bearing database details" })).toMatchObject({
      status: 503,
      body: {
        code: "DATABASE_SCHEMA_NOT_READY",
        error: expect.not.stringContaining("secret-bearing"),
      },
    });
    expect(registrationDatabaseFailure(new Error("private database detail"))).toMatchObject({
      status: 503,
      body: { code: "DATABASE_OPERATION_FAILED" },
    });
  });

  it("logs only safe database metadata", async () => {
    const { registrationDatabaseLogMetadata } = await import("@/lib/registration-config");
    expect(registrationDatabaseLogMetadata({ name: "PrismaClientKnownRequestError", code: "P2021", message: "secret" }, "account_create"))
      .toEqual({ stage: "account_create", errorName: "PrismaClientKnownRequestError", prismaCode: "P2021" });
  });

  it("returns field-specific duplicate messages", () => {
    expect(registrationEmailConflict(true).body).toMatchObject({ code: "EMAIL_ALREADY_EXISTS", field: "email" });
    expect(registrationEmailConflict(false).body).toMatchObject({ code: "EMAIL_NOT_VERIFIED", field: "email" });
    expect(registrationUsernameConflict().body).toMatchObject({ code: "USERNAME_ALREADY_EXISTS", field: "username" });
  });
});
