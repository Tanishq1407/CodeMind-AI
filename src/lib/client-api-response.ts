export async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error(response.status >= 500
      ? "The server could not complete registration. Check the server logs and database configuration, then try again."
      : `The server returned an unexpected response (HTTP ${response.status}).`);
  }
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // A proxy or server error can return malformed JSON despite its content type.
  }
  throw new Error("The server returned an invalid response. Please try again later.");
}
