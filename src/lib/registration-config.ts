export type RegistrationEnvironment = {
  DATABASE_URL?: string;
  AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};

export function missingRegistrationConfiguration(env: RegistrationEnvironment): string[] {
  const missing: string[] = [];
  if (!env.DATABASE_URL?.trim()) missing.push("DATABASE_URL");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) missing.push("AUTH_SECRET (at least 32 characters)");
  if (!env.RESEND_API_KEY?.trim()) missing.push("RESEND_API_KEY");
  if (!env.EMAIL_FROM?.trim()) missing.push("EMAIL_FROM");
  return missing;
}

export function registrationDatabaseFailure(error: unknown) {
  const value = error && typeof error === "object" ? error as { code?: unknown; name?: unknown } : {};
  const code = typeof value.code === "string" ? value.code : "";
  if (code === "P2002") {
    return {
      status: 409,
      body: { error: "Unable to create this account. Check the details or sign in.", code: "ACCOUNT_ALREADY_EXISTS" },
    };
  }
  if (value.name === "PrismaClientInitializationError" || /^P10\d\d$/.test(code)) {
    return {
      status: 503,
      body: { error: "PostgreSQL is unavailable. Check DATABASE_URL and confirm the database is running.", code: "DATABASE_UNAVAILABLE" },
    };
  }
  return {
    status: 503,
    body: { error: "The account could not be saved. Check PostgreSQL connectivity and apply the database migrations.", code: "DATABASE_OPERATION_FAILED" },
  };
}
