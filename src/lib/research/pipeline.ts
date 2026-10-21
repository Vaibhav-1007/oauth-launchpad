import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { downgradeUnsupported, GuideDraftSchema, validateGuide, type AgentAction, type Guide, type Source } from "../schema";
import { normalizeEstimate } from "../estimate";
import { getGeneratedGuide, saveGuide } from "../store";
import { hostMatches, isPrivateOrLocalHost, parseInput, safeHttpUrl, slugify } from "../url-safety";
import { getConfig, missingServices, ResearchError } from "./config";
import { fetchManagedAuthLists, lookupManaged } from "./composio";
import { llmJson } from "./llm";
import { tavilySearch, type SearchResult } from "./tavily";

export type StageId = "identify" | "docs" | "oauth" | "scopes" | "composio" | "generate" | "validate" | "save";
export type ResearchEvent =
  | { type: "stage"; stage: StageId; status: "running" | "done" | "failed" | "skipped"; detail?: string }
  | { type: "done"; slug: string; reused: boolean }
  | { type: "error"; code: string; message: string; candidates?: string[] };

export const STAGE_LABELS: Record<StageId, string> = {
  identify: "Identifying the application",
  docs: "Finding official developer documentation",
  oauth: "Investigating OAuth registration and setup",
  scopes: "Checking scopes, approval and troubleshooting",
  composio: "Checking Composio managed-auth list",
  generate: "Generating the structured guide (LLM)",
  validate: "Validating evidence and schema",
  save: "Saving the guide",
};

const IdentifySchema = z.object({
  providerName: z.string().min(1).max(100),
  officialDomain: z.string().min(3).max(100),
  docDomains: z.array(z.string().max(100)).max(5).default([]),
  confidence: z.enum(["high", "medium", "low"]),
  ambiguous: z.boolean(),
  candidates: z.array(z.string().max(100)).max(5).default([]),
  category: z.string().max(60).default("Other"),
  oauthSupport: z.enum(["yes", "no", "unknown"]),
});

const MAX_SOURCES = 10;
const MAX_CHARS_PER_SOURCE = 5000;

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const hash6 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 6);

function classify(url: string): Source["sourceType"] {
  const p = url.toLowerCase();
  if (/scope|permission/.test(p)) return "official_reference";
  if (/verif|review|policy|policies|approval|terms/.test(p)) return "official_policy";
  return "official_docs";
}

export function buildSources(results: SearchResult[], trusted: string[], now: string): { sources: Source[]; text: Map<string, string> } {
  const seen = new Set<string>();
  const official: Source[] = [];
  const third: Source[] = [];
  const text = new Map<string, string>();
  for (const r of results) {
    const safe = safeHttpUrl(r.url);
    if (!safe) continue;
    const key = safe.replace(/#.*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const isOfficial = trusted.some((d) => hostMatches(hostOf(key), d));
    const body = (r.content || r.snippet || "").slice(0, MAX_CHARS_PER_SOURCE);
    const full = r.content.length >= 500;
    const src: Source = {
      id: "",
      url: key,
      title: r.title.slice(0, 300),
      sourceType: isOfficial ? classify(key) : "third_party",
      retrievedAt: now,
      fetchMode: full ? "full_page" : "search_snippet",
      supports: [],
      limitations: isOfficial
        ? full
          ? `Page text retrieved through the search provider and truncated to ${MAX_CHARS_PER_SOURCE} characters before analysis; the LLM may have misread it.`
          : "Only a search-result excerpt was available, so this source cannot back verified claims."
        : "Not on an identified official domain; it cannot back verified claims.",
    };
    (isOfficial ? official : third).push(src);
    text.set(key, body);
  }
  const chosen = [...official.slice(0, MAX_SOURCES - 1), ...third.slice(0, 2)].slice(0, MAX_SOURCES);
  chosen.forEach((s, i) => (s.id = `S${i + 1}`));
  const byId = new Map<string, string>();
  for (const s of chosen) byId.set(s.id, text.get(s.url) ?? "");
  return { sources: chosen, text: byId };
}

const SYSTEM = `You are an OAuth research analyst producing a developer setup guide as JSON.
Rules:
- Use ONLY the numbered sources provided. Never invent URLs, scopes, limits, prices or timelines.
- Every provider-specific claim must list the ids of the sources that support it in sourceIds (e.g. ["S1"]).
- status values: "verified_docs" only when the cited source text explicitly states the claim; "inferred" when you reasoned from the sources; "estimated" for time estimates; "unknown" when the sources do not say; "not_applicable" when a field does not apply to this provider. NEVER use "tested".
- Approval/review waiting time: only give numbers (approval.kind "known", minDays/maxDays) when a source states them, and cite it; otherwise approval.kind "unknown" or "none" with null days.
- Distinguish a basic development setup from public production launch in estimate.scope and assumptions.
- Explain that an OAuth app (registered by the developer), an integration (your code or a platform's connector), and an end user's authorized connection are different things, in summary or prerequisites.
- Mark steps humanRequired=true when they need the developer to log in, accept terms, enter private/business details, or handle secrets.
- Never ask the developer to paste secrets anywhere. Do not claim anything was tested or created.
- If the sources do not support OAuth for this provider, say so in summary and uncertainty and keep setupSteps to what the sources support.
- Keep text concise and actionable. Output a single JSON object only.`;

function sourcesBlock(sources: Source[], text: Map<string, string>): string {
  return sources
    .map((s) => `### ${s.id} | ${s.sourceType} | ${s.url}\nTitle: ${s.title}\n${(text.get(s.id) ?? "").replace(/\s+\n/g, "\n")}`)
    .join("\n\n");
}

export async function runResearch(
  input: { query: string; description?: string; refresh?: boolean },
  emit: (e: ResearchEvent) => void,
): Promise<void> {
  const log: AgentAction[] = [];
  const now = () => new Date().toISOString();
  const stage = (s: StageId, status: "running" | "done" | "failed" | "skipped", detail?: string) =>
    emit({ type: "stage", stage: s, status, detail });
  let current: StageId = "identify";

  try {
    const missing = missingServices();
    if (missing.length) {
      throw new ResearchError("not_configured", `Live research is unavailable because these environment variables are not set: ${missing.join(", ")}. No research was performed.`);
    }
    const parsed = parseInput(input.query);
    if (!parsed.ok) throw new ResearchError("invalid_input", parsed.error);
    const description = (input.description ?? "").trim().slice(0, 300);

    // ---- A. identify
    stage("identify", "running");
    const idQuery =
      parsed.kind === "url" ? `${parsed.domain} official developer platform API` : `${parsed.name} official website developer API`;
    const idResults = await tavilySearch({
      query: idQuery,
      includeDomains: parsed.kind === "url" ? [parsed.domain] : undefined,
      maxResults: 8,
    });
    log.push({ action: `Web search (Tavily): "${idQuery}"`, outcome: "completed", detail: `${idResults.length} results used to identify the provider.`, at: now() });
    if (idResults.length === 0) {
      throw new ResearchError(
        parsed.kind === "url" ? "unverified_site" : "not_found",
        parsed.kind === "url"
          ? `No searchable content was found for ${parsed.domain}, so it could not be verified as an API provider. Check the address or enter the product name.`
          : `No results were found for "${parsed.name}". Check the spelling or enter the official website.`,
      );
    }
    const resultHosts = new Set(idResults.map((r) => hostOf(r.url)));
    const listing = idResults
      .map((r, i) => `${i + 1}. ${r.title} | ${r.url}\n${r.snippet.slice(0, 300)}`)
      .join("\n");
    const idPrompt =
      `User input: ${parsed.kind === "url" ? `website ${parsed.domain}` : `app name "${parsed.name}"`}\n` +
      `Search results:\n${listing}\n\n` +
      `Return JSON {providerName, officialDomain (registrable domain only, e.g. example.com), docDomains (other official domains that host developer docs and that appear in the results), confidence ("high"|"medium"|"low"), ambiguous (true if several unrelated products match the name), candidates (alternative product names if ambiguous), category (short), oauthSupport ("yes"|"no"|"unknown")}. ` +
      `Use only domains present in the results. If unsure, set confidence low.`;
    const idRes = await llmJson({ system: "You identify the official provider behind an app name or website. Output JSON only.", user: idPrompt, schema: IdentifySchema, maxTokens: 600 });
    if (!idRes.ok) throw new ResearchError("llm_invalid", "The LLM did not return a usable provider identification.");
    const ident = idRes.data;
    const officialDomain = ident.officialDomain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(officialDomain) || isPrivateOrLocalHost(officialDomain)) {
      throw new ResearchError("unverified_site", "The provider's official domain could not be determined safely.");
    }
    if (ident.ambiguous || ident.confidence === "low") {
      throw new ResearchError("ambiguous", `"${input.query}" could not be matched to a single provider with confidence. Enter the official website to disambiguate.`, ident.candidates);
    }
    const domainSeen = [...resultHosts].some((h) => hostMatches(h, officialDomain));
    if (!domainSeen) {
      throw new ResearchError("unverified_site", `${officialDomain} did not appear in the search results, so it cannot be verified as the intended provider. Enter the official website.`, ident.candidates);
    }
    if (parsed.kind === "url" && !hostMatches(officialDomain, parsed.domain) && !hostMatches(parsed.domain, officialDomain)) {
      throw new ResearchError("unverified_site", `The submitted website (${parsed.domain}) does not appear to belong to ${ident.providerName} (${officialDomain}). Check the address.`, ident.candidates);
    }
    const docDomains = ident.docDomains
      .map((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) && !isPrivateOrLocalHost(d) && [...resultHosts].some((h) => hostMatches(h, d)));
    const trusted = [...new Set([officialDomain, ...docDomains])];
    stage("identify", "done", `${ident.providerName} (${officialDomain}); doc domains: ${trusted.join(", ")}`);

    const slug = `${slugify(ident.providerName) || "app"}-${hash6(officialDomain)}`;
    if (!input.refresh) {
      const existing = await getGeneratedGuide(slug);
      if (existing) {
        emit({ type: "done", slug, reused: true });
        return;
      }
    }

    // ---- B/C. docs, oauth, scopes
    const collected: SearchResult[] = [];
    current = "docs";
    stage("docs", "running");
    const q1 = `${ident.providerName} OAuth 2.0 developer documentation authorization`;
    const docs = await tavilySearch({ query: q1, includeDomains: trusted, maxResults: 6, rawContent: true });
    collected.push(...docs);
    log.push({ action: `Web search restricted to ${trusted.join(", ")}: "${q1}"`, outcome: "completed", detail: `${docs.length} official results, with page text where the provider returned it.`, at: now() });
    if (docs.length === 0) {
      throw new ResearchError("no_official_docs", `No official developer documentation about OAuth was found on ${trusted.join(", ")}. The app may not support OAuth, or its docs are on an unidentified domain. No guide was generated.`);
    }
    stage("docs", "done", `${docs.length} official pages found`);

    current = "oauth";
    stage("oauth", "running");
    const q2 = `${ident.providerName} register OAuth application client ID client secret redirect URI create app`;
    const reg = await tavilySearch({ query: q2, includeDomains: trusted, maxResults: 6, rawContent: true });
    collected.push(...reg);
    log.push({ action: `Web search restricted to official domains: "${q2}"`, outcome: "completed", detail: `${reg.length} results.`, at: now() });
    stage("oauth", "done", `${reg.length} registration/setup pages found`);

    current = "scopes";
    stage("scopes", "running");
    const q3 = `${ident.providerName} OAuth scopes permissions app review verification approval publish`;
    const q4 = `${ident.providerName} OAuth errors troubleshooting invalid redirect_uri`;
    const [sc, tr] = await Promise.all([
      tavilySearch({ query: q3, includeDomains: trusted, maxResults: 5, rawContent: true }),
      tavilySearch({ query: q4, includeDomains: trusted, maxResults: 4, rawContent: true }),
    ]);
    collected.push(...sc, ...tr);
    log.push({ action: `Two web searches on scopes/review and error troubleshooting`, outcome: "completed", detail: `${sc.length} + ${tr.length} results.`, at: now() });
    stage("scopes", "done", `${sc.length + tr.length} scope/approval/troubleshooting pages found`);

    const retrievedAt = now();
    const { sources, text } = buildSources(collected, trusted, retrievedAt);
    const full = sources.filter((s) => s.fetchMode === "full_page").length;
    const officialCount = sources.filter((s) => s.sourceType !== "third_party").length;
    if (officialCount === 0) throw new ResearchError("no_official_docs", "Search returned no usable official sources.");
    log.push({
      action: "Compiled source set",
      outcome: full > 0 ? "completed" : "attempted",
      detail: `${sources.length} unique sources (${officialCount} official). Page text available for ${full}; the rest are search excerpts only. The agent did not fetch pages itself; text comes from the search provider.`,
      at: retrievedAt,
    });

    // ---- composio
    current = "composio";
    stage("composio", "running");
    const lists = await fetchManagedAuthLists();
    let composio: Guide["composio"];
    if (lists) {
      const hit = lookupManaged(ident.providerName, lists);
      const sid = `S${sources.length + 1}`;
      sources.push({
        id: sid,
        url: "https://docs.composio.dev/toolkits/managed-auth",
        title: "Composio: Managed OAuth apps",
        sourceType: "composio_docs",
        retrievedAt: now(),
        fetchMode: "full_page",
        supports: ["Composio-managed vs bring-your-own OAuth toolkit lists"],
        limitations: "Matched by exact toolkit name; a toolkit may exist under a different name, and availability varies per account and use case.",
      });
      composio = {
        managedAuth: hit.status,
        note:
          hit.status === "listed"
            ? `"${hit.matched}" appears in Composio's managed OAuth list. Confirm via GET /api/v3.1/toolkits/<slug> (composio_managed_auth_schemes) before building your own OAuth app.`
            : `No exact toolkit-name match in Composio's managed OAuth list (checked automatically). It may still be supported under another name or need your own OAuth app; check the toolkit endpoint before manual setup.`,
        sourceIds: [sid],
      };
      log.push({ action: "Fetched Composio managed-auth page and matched the provider name", outcome: "completed", detail: `Result: ${hit.status}.`, at: now() });
      stage("composio", "done", hit.status === "listed" ? "Listed as managed" : "Not found in managed list");
    } else {
      composio = { managedAuth: "unchecked", note: "The Composio managed-auth page could not be fetched. Check https://docs.composio.dev/toolkits/managed-auth manually before building your own OAuth app.", sourceIds: [] };
      log.push({ action: "Fetch Composio managed-auth page", outcome: "could_not", detail: "Request failed or the page format was not recognised.", at: now() });
      stage("composio", "skipped", "Could not fetch the Composio list");
    }

    // ---- E. generate
    current = "generate";
    stage("generate", "running", `Model: ${getConfig().llmModel}`);
    const jsonShape = JSON.stringify(z.toJSONSchema(GuideDraftSchema));
    const userBase =
      `Provider: ${ident.providerName} (${officialDomain}). Category: ${ident.category}. OAuth support per identification: ${ident.oauthSupport}.\n` +
      (description ? `The developer wants to integrate: ${description}\n` : "") +
      `\nSOURCES\n${sourcesBlock(sources.filter((s) => s.id !== composio.sourceIds[0]), text)}\n\n` +
      `Return one JSON object matching this JSON Schema (all required fields, enum values exactly as listed):\n${jsonShape}`;
    let draft = await llmJson({ system: SYSTEM, user: userBase, schema: GuideDraftSchema, maxTokens: 7000 });
    if (!draft.ok) {
      log.push({ action: "LLM draft failed schema validation; retrying once with error feedback", outcome: "attempted", detail: draft.errors.join("; ").slice(0, 400), at: now() });
      draft = await llmJson({
        system: SYSTEM,
        user: `${userBase}\n\nYour previous output was rejected with these errors. Fix them and return the full JSON again:\n${draft.errors.join("\n")}`,
        schema: GuideDraftSchema,
        maxTokens: 7000,
      });
    }
    if (!draft.ok) throw new ResearchError("llm_invalid", `The LLM output did not pass validation after a retry (${draft.errors.slice(0, 3).join("; ")}). No guide was saved; retry later.`);
    log.push({ action: `LLM structured generation (${getConfig().llmModel})`, outcome: "completed", detail: "Draft passed schema validation. The LLM wrote the text; it did not run any test.", at: now() });
    stage("generate", "done");

    // ---- F. validate
    current = "validate";
    stage("validate", "running");
    const d = draft.data;
    const { estimate, changes: estChanges } = normalizeEstimate(d.estimate);
    const officialDocs = sources.find((s) => s.sourceType === "official_docs") ?? sources.find((s) => s.sourceType !== "third_party")!;
    for (const s of sources) {
      s.supports = [];
    }
    const base: Guide = {
      ...d,
      id: randomUUID(),
      slug,
      kind: "generated",
      officialDomain,
      officialDocsUrl: officialDocs.url,
      category: d.category || ident.category,
      estimate,
      composio,
      sources,
      agentActions: [],
      researchedAt: now(),
      generationStatus: officialCount >= 2 && full >= 1 ? "complete" : "partial",
      verification: "unverified",
      uncertainty: [...d.uncertainty],
    };
    const { guide: repaired, changes } = downgradeUnsupported(base);
    // fill "supports" from cited claims
    const bySrc = new Map<string, Set<string>>();
    const cite = (ids: string[], t: string) => ids.forEach((id) => (bySrc.get(id) ?? bySrc.set(id, new Set()).get(id)!).add(t.slice(0, 160)));
    repaired.setupSteps.forEach((s) => cite(s.sourceIds, s.title));
    repaired.scopes.forEach((s) => cite(s.sourceIds, s.name));
    repaired.troubleshooting.forEach((s) => cite(s.sourceIds, s.error));
    repaired.prerequisites.forEach((s) => cite(s.sourceIds, s.text));
    repaired.approval.items.forEach((s) => cite(s.sourceIds, s.text));
    repaired.redirect.notes.forEach((s) => cite(s.sourceIds, s.text));
    for (const s of repaired.sources) s.supports = [...(bySrc.get(s.id) ?? [])].slice(0, 8);

    const all = [
      ...repaired.setupSteps, ...repaired.scopes, ...repaired.troubleshooting, ...repaired.prerequisites,
      ...repaired.approval.items, ...repaired.redirect.notes, ...repaired.blockers,
    ];
    const verifiedShare = all.length ? all.filter((c) => c.status === "verified_docs").length / all.length : 0;
    repaired.verification = verifiedShare >= 0.5 && repaired.generationStatus === "complete" ? "partially_verified" : "unverified";
    const extra = [...estChanges, ...changes];
    if (extra.length) repaired.uncertainty.push(`${extra.length} automatic correction(s) were applied before saving, e.g. ${extra[0]}.`);
    repaired.uncertainty.push("This guide was written by an LLM from retrieved text and has not been tested against a live provider account.");

    log.push({ action: "Schema and evidence validation", outcome: "completed", detail: `${extra.length} automatic correction(s). ${Math.round(verifiedShare * 100)}% of claims remain labelled verified_docs.`, at: now() });
    log.push({ action: "Register an OAuth application or test the flow with real credentials", outcome: "could_not", detail: "Needs your authenticated provider account; never attempted. No claim in this guide is labelled 'tested'.", at: null });
    log.push({ action: "Submit for provider review or approval", outcome: "could_not", detail: "Requires your business details and acceptance of provider terms.", at: null });
    repaired.agentActions = log.slice(0, 40);
    repaired.humanActions = [
      ...repaired.humanActions,
      { text: "Never paste client secrets into this tool or share them in the guide.", reason: "Secrets belong in your server-side environment only." },
    ].slice(0, 20);

    const final = validateGuide(repaired);
    if (!final.ok) throw new ResearchError("validation_failed", `The generated guide failed validation and was not saved: ${final.errors.slice(0, 3).join("; ")}`);
    stage("validate", "done", `${final.guide.verification}; ${Math.round(verifiedShare * 100)}% verified claims`);

    // ---- G. save
    current = "save";
    stage("save", "running");
    await saveGuide(final.guide);
    stage("save", "done");
    emit({ type: "done", slug, reused: false });
  } catch (e) {
    if (e instanceof ResearchError) {
      stage(current, "failed", e.message);
      emit({ type: "error", code: e.code, message: e.message, candidates: e.candidates });
    } else {
      console.error("research failure", e instanceof Error ? e.message : "unknown");
      stage(current, "failed");
      emit({ type: "error", code: "internal", message: "Unexpected error while researching. Please retry." });
    }
  }
}
