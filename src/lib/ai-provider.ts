export type AiRequest = { prompt: string; apiKey: string; model: string; baseUrl: string };
export interface AiProvider { complete(request: AiRequest): Promise<string> }
const compatibleProvider: AiProvider = { async complete({ prompt, apiKey, model, baseUrl }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "system", content: "You are a careful programming assistant. Clearly label uncertainty. Do not claim to have executed code or verified a security issue." }, { role: "user", content: prompt }], temperature: 0.2 }), signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error("Provider request failed");
  const data = await response.json(); const answer = data.choices?.[0]?.message?.content;
  if (typeof answer !== "string") throw new Error("Provider returned no message");
  return answer;
} };
const providers: Record<string, AiProvider> = { "openai-compatible": compatibleProvider };
export async function completeWithAi(prompt: string): Promise<string> {
  const { AI_PROVIDER, AI_API_KEY, AI_MODEL, AI_BASE_URL } = process.env;
  if (!AI_PROVIDER || !AI_API_KEY || !AI_MODEL) throw new Error("AI is not configured");
  const provider = providers[AI_PROVIDER]; if (!provider) throw new Error("Unsupported AI provider");
  return provider.complete({ prompt, apiKey: AI_API_KEY, model: AI_MODEL, baseUrl: AI_BASE_URL || "https://api.openai.com/v1" });
}
