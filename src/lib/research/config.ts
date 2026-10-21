export type ServiceConfig = {
  tavilyKey?: string;
  llmKey?: string;
  llmBaseUrl: string;
  llmModel: string;
  searchTimeoutMs: number;
  llmTimeoutMs: number;
};

export function getConfig(): ServiceConfig {
  return {
    tavilyKey: process.env.TAVILY_API_KEY || undefined,
    llmKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || undefined,
    llmBaseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    llmModel: process.env.LLM_MODEL || "gpt-4.1-mini",
    searchTimeoutMs: Number(process.env.SEARCH_TIMEOUT_MS) || 25_000,
    llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 90_000,
  };
}

export function missingServices(c = getConfig()): string[] {
  const missing: string[] = [];
  if (!c.tavilyKey) missing.push("TAVILY_API_KEY (web search)");
  if (!c.llmKey) missing.push("LLM_API_KEY or OPENAI_API_KEY (LLM)");
  return missing;
}

export class ResearchError extends Error {
  constructor(
    public code: string,
    message: string,
    public candidates?: string[],
  ) {
    super(message);
  }
}
