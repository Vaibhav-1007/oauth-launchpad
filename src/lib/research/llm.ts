import type { z } from "zod";
import { getConfig, ResearchError } from "./config";

type ChatResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
};

// Accepts JSON wrapped in a markdown code fence or surrounded by prose.
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body);
}

export async function llmJson<T extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: T;
  maxTokens?: number;
}): Promise<{ ok: true; data: z.infer<T> } | { ok: false; errors: string[]; raw: string }> {
  const cfg = getConfig();
  if (!cfg.llmKey) throw new ResearchError("not_configured", "LLM API key is not configured.");
  let res: Response;
  try {
    res = await fetch(`${cfg.llmBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.llmKey}` },
      body: JSON.stringify({
        model: cfg.llmModel,
        temperature: 0.1,
        max_tokens: opts.maxTokens ?? 6000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
      signal: AbortSignal.timeout(cfg.llmTimeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ResearchError(timedOut ? "llm_timeout" : "llm_unreachable", timedOut ? "The LLM request timed out." : "The LLM provider could not be reached.");
  }
  if (res.status === 401 || res.status === 403) throw new ResearchError("llm_auth", "The LLM API rejected the configured key.");
  if (res.status === 429) throw new ResearchError("llm_rate_limited", "The LLM provider rate limit or quota was reached.");
  if (!res.ok) throw new ResearchError("llm_failed", `The LLM provider returned HTTP ${res.status}.`);
  const body = (await res.json()) as ChatResponse;
  const raw = body.choices?.[0]?.message?.content ?? "";
  let parsedJson: unknown;
  try {
    parsedJson = extractJson(raw);
  } catch {
    const cutOff = body.choices?.[0]?.finish_reason === "length";
    return {
      ok: false,
      errors: [cutOff ? "Response was cut off at the token limit" : "Response was not valid JSON"],
      raw,
    };
  }
  const parsed = opts.schema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".")}: ${i.message}`), raw };
  }
  return { ok: true, data: parsed.data };
}
