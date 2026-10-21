import { getConfig, ResearchError } from "./config";

export type SearchResult = { title: string; url: string; snippet: string; content: string };

type TavilyResponse = {
  results?: { title?: string; url?: string; content?: string; raw_content?: string | null }[];
};

export async function tavilySearch(opts: {
  query: string;
  includeDomains?: string[];
  maxResults?: number;
  rawContent?: boolean;
}): Promise<SearchResult[]> {
  const cfg = getConfig();
  if (!cfg.tavilyKey) throw new ResearchError("not_configured", "Search API key is not configured.");
  let res: Response;
  try {
    res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.tavilyKey}` },
      body: JSON.stringify({
        query: opts.query.slice(0, 380),
        search_depth: "basic",
        max_results: opts.maxResults ?? 6,
        include_domains: opts.includeDomains?.length ? opts.includeDomains : undefined,
        include_raw_content: opts.rawContent ? true : false,
        include_answer: false,
      }),
      signal: AbortSignal.timeout(cfg.searchTimeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ResearchError(timedOut ? "search_timeout" : "search_unreachable", timedOut ? "The search provider timed out." : "The search provider could not be reached.");
  }
  if (res.status === 401 || res.status === 403) throw new ResearchError("search_auth", "The search API rejected the configured key.");
  if (res.status === 429 || res.status === 432 || res.status === 433) throw new ResearchError("search_rate_limited", "The search provider rate limit or plan limit was reached.");
  if (!res.ok) throw new ResearchError("search_failed", `The search provider returned HTTP ${res.status}.`);
  const json = (await res.json()) as TavilyResponse;
  return (json.results ?? []).flatMap((r) =>
    r.url && r.title
      ? [{ title: r.title, url: r.url, snippet: r.content ?? "", content: r.raw_content ?? "" }]
      : [],
  );
}
