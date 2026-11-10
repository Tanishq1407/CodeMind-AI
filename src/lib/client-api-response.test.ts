import { describe, expect, it } from "vitest";
import { readJsonResponse } from "@/lib/client-api-response";

describe("readJsonResponse", () => {
  it("returns JSON error details from the registration API", async () => {
    const response = new Response(JSON.stringify({ error: "Already registered" }), {
      status: 409, headers: { "content-type": "application/json" },
    });
    await expect(readJsonResponse(response)).resolves.toEqual({ error: "Already registered" });
  });

  it("does not try to parse a Next.js HTML error page as JSON", async () => {
    const response = new Response("<!DOCTYPE html><html><body>Server Error</body></html>", {
      status: 500, headers: { "content-type": "text/html" },
    });
    await expect(readJsonResponse(response)).rejects.toThrow(/server could not complete registration/i);
  });

  it("rejects malformed JSON even when content type claims JSON", async () => {
    const response = new Response("<html>", { status: 500, headers: { "content-type": "application/json" } });
    await expect(readJsonResponse(response)).rejects.toThrow(/invalid response/i);
  });
});
