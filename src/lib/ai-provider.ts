export type AiMessage = { role: "system"|"user"|"assistant"; content: string };
export type AiRequest = { messages: AiMessage[]; apiKey: string; model: string; baseUrl: string };
export interface AiProvider { complete(request: AiRequest): Promise<string> }
export class AiProviderError extends Error { constructor(readonly kind:"configuration"|"timeout"|"upstream"|"response",readonly status?:number){super(kind);} }
const compatibleProvider: AiProvider = { async complete({ messages, apiKey, model, baseUrl }) {
  let response: Response;
  try { response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model, messages, temperature: 0.2 }), signal: AbortSignal.timeout(25_000) }); }
  catch (error) { if (error instanceof Error && error.name === "TimeoutError") throw new AiProviderError("timeout"); throw new AiProviderError("upstream"); }
  if (!response.ok) throw new AiProviderError("upstream", response.status);
  try { const data = await response.json(); const answer = data.choices?.[0]?.message?.content; if (typeof answer !== "string" || !answer.trim()) throw new AiProviderError("response"); return answer; }
  catch (error) { if(error instanceof AiProviderError)throw error; throw new AiProviderError("response"); }
} };
const providers: Record<string, AiProvider> = { "openai-compatible": compatibleProvider };
export async function completeWithAi(messages:AiMessage[]): Promise<string> {
  const { AI_PROVIDER, AI_API_KEY, AI_MODEL, AI_BASE_URL } = process.env;
  if (!AI_PROVIDER || !AI_API_KEY || !AI_MODEL) throw new AiProviderError("configuration");
  const provider = providers[AI_PROVIDER]; if (!provider) throw new AiProviderError("configuration");
  return provider.complete({ messages:[{role:"system",content:"You are a careful programming assistant. Clearly label uncertainty. Static findings are rule-based observations; do not present suggestions as verified facts. Do not claim to have executed code or verified a security issue."},...messages], apiKey: AI_API_KEY, model: AI_MODEL, baseUrl: AI_BASE_URL || "https://api.openai.com/v1" });
}
