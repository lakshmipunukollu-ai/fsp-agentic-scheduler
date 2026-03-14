/**
 * Shared Claude API client — TypeScript version
 * Used by FSP, ST6 frontends
 */
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-5";

export async function complete(
  prompt: string,
  options: { system?: string; model?: string; maxTokens?: number; asJson?: boolean } = {}
): Promise<string | unknown> {
  const { system = "", model = MODEL, maxTokens = 4096, asJson = false } = options;
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const text = (message.content[0] as { text: string }).text;
  if (asJson) {
    const clean = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    return JSON.parse(clean);
  }
  return text;
}

export async function* streamComplete(
  prompt: string,
  options: { system?: string; model?: string } = {}
): AsyncGenerator<string> {
  const { system = "", model = MODEL } = options;
  const stream = client.messages.stream({
    model,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      yield chunk.delta.text;
    }
  }
}
