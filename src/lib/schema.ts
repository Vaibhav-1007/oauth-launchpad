import { z } from "zod";

export const EvidenceStatus = z.enum([
  "verified_docs", // supported by retrieved official documentation
  "tested", // observed through a real request/action recorded in the agent log
  "estimated",
  "inferred",
  "unknown",
  "not_applicable",
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

export const FetchMode = z.enum([
  "full_page",
  "page_excerpt",
  "search_snippet",
  "direct_request",
  "not_retrieved",
]);
export type FetchMode = z.infer<typeof FetchMode>;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2}))?$/, "Expected ISO date");

const httpUrl = z
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs are allowed");

const text = (max = 1200) => z.string().trim().min(1).max(max);
const ids = z.array(z.string().min(1)).max(12);

export const SourceSchema = z.object({
  id: z.string().min(1),
  url: httpUrl,
  title: text(300),
  sourceType: z.enum([
    "official_docs",
    "official_console",
    "official_policy",
    "official_reference",
    "direct_test",
    "composio_docs",
    "third_party",
  ]),
  retrievedAt: dateString.nullable(),
  fetchMode: FetchMode,
  supports: z.array(text(300)).max(20),
  limitations: text(600),
});
export type Source = z.infer<typeof SourceSchema>;

export const ClaimSchema = z.object({
  text: text(),
  status: EvidenceStatus,
  sourceIds: ids,
});
export type Claim = z.infer<typeof ClaimSchema>;

export const StepSchema = z.object({
  title: text(200),
  action: text(1500),
  where: text(400),
  expected: text(600),
  status: EvidenceStatus,
  sourceIds: ids,
  humanRequired: z.boolean(),
  optional: z.boolean().default(false),
});
export type Step = z.infer<typeof StepSchema>;

export const ScopeSchema = z.object({
  name: text(200),
  why: text(600),
  note: z.string().max(600).default(""),
  status: EvidenceStatus,
  sourceIds: ids,
});

export const TroubleshootSchema = z.object({
  error: text(300),
  cause: text(600),
  fix: text(800),
  status: EvidenceStatus,
  sourceIds: ids,
});

export const BlockerSchema = z.object({
  title: text(200),
  detail: text(800),
  howToProceed: text(800),
  status: EvidenceStatus,
  sourceIds: ids,
});

export const AgentActionSchema = z.object({
  action: text(300),
  outcome: z.enum(["completed", "attempted", "could_not"]),
  detail: text(1000),
  at: dateString.nullable(),
});
export type AgentAction = z.infer<typeof AgentActionSchema>;

export const HumanActionSchema = z.object({
  text: text(400),
  reason: text(400),
});

const minutesRange = z
  .object({ min: z.number().int().min(0).max(10000), max: z.number().int().min(0).max(10000) })
  .refine((r) => r.min <= r.max, "min must be <= max");

export const EstimateSchema = z.object({
  handsOn: minutesRange,
  testing: minutesRange,
  approval: z.object({
    kind: z.enum(["none", "known", "unknown"]),
    summary: text(600),
    minDays: z.number().int().min(0).max(365).nullable(),
    maxDays: z.number().int().min(0).max(365).nullable(),
    sourceIds: ids,
  }),
  confidence: z.enum(["low", "medium", "high"]),
  assumptions: z.array(text(400)).min(1).max(10),
  scope: text(300), // e.g. "Development setup" vs "public production launch"
});
export type Estimate = z.infer<typeof EstimateSchema>;

export const Difficulty = z.enum(["easy", "moderate", "hard"]);
export const ApprovalLevel = z.enum(["none", "conditional", "required", "unknown"]);

export const GuideSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
  kind: z.enum(["curated", "generated"]),
  appName: text(120),
  provider: text(120),
  officialDomain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Expected a bare domain")
    .max(253),
  officialDocsUrl: httpUrl,
  category: text(60),
  scenario: text(400),
  summary: text(1200),
  difficulty: Difficulty,
  difficultyReason: text(600),
  estimate: EstimateSchema,
  approval: z.object({
    level: ApprovalLevel,
    summary: text(800),
    items: z.array(ClaimSchema).max(12),
  }),
  prerequisites: z.array(ClaimSchema).max(15),
  accounts: z.array(ClaimSchema).max(12),
  setupSteps: z.array(StepSchema).min(1).max(25),
  scopes: z.array(ScopeSchema).max(30),
  redirect: z.object({
    applicable: z.enum(["yes", "no", "unknown"]),
    notes: z.array(ClaimSchema).max(12),
  }),
  testing: z.array(StepSchema).max(12),
  troubleshooting: z.array(TroubleshootSchema).max(15),
  blockers: z.array(BlockerSchema).max(10),
  agentActions: z.array(AgentActionSchema).max(40),
  humanActions: z.array(HumanActionSchema).max(20),
  uncertainty: z.array(text(500)).max(15),
  composio: z.object({
    managedAuth: z.enum(["listed", "not_listed", "unchecked"]),
    note: text(600),
    sourceIds: ids,
  }),
  nextSteps: z.array(text(400)).min(1).max(10),
  sources: z.array(SourceSchema).min(1).max(30),
  researchedAt: dateString,
  generationStatus: z.enum(["complete", "partial", "failed"]),
  verification: z.enum(["verified", "partially_verified", "unverified"]),
});
export type Guide = z.infer<typeof GuideSchema>;

/** What the LLM is allowed to produce. Server-owned fields are excluded. */
export const GuideDraftSchema = GuideSchema.omit({
  id: true,
  slug: true,
  kind: true,
  sources: true,
  agentActions: true,
  researchedAt: true,
  generationStatus: true,
  verification: true,
  composio: true,
  officialDomain: true,
  officialDocsUrl: true,
});
export type GuideDraft = z.infer<typeof GuideDraftSchema>;

export const AppSchema = z.object({
  id: z.string(),
  name: text(120),
  description: text(400),
  officialDomain: z.string(),
  category: z.string(),
  icon: z.object({ letter: z.string().length(1), hue: z.number().int().min(0).max(360) }),
  guideStatus: z.enum(["curated", "generated"]),
  slug: z.string(),
  difficulty: Difficulty,
  approval: ApprovalLevel,
  handsOnLabel: z.string(),
  verification: z.enum(["verified", "partially_verified", "unverified"]),
});
export type App = z.infer<typeof AppSchema>;

type Referencing = { status: EvidenceStatus; sourceIds: string[] };

/** A source can back a verified claim only if official and its content was actually retrieved. */
function isVerifiable(s: Source): boolean {
  return (s.fetchMode === "full_page" || s.fetchMode === "page_excerpt") && s.sourceType !== "third_party" && s.sourceType !== "direct_test";
}

function collectRefs(g: Guide): { path: string; item: Referencing }[] {
  const out: { path: string; item: Referencing }[] = [];
  const add = (path: string, arr: Referencing[]) => arr.forEach((item, i) => out.push({ path: `${path}[${i}]`, item }));
  add("approval.items", g.approval.items);
  add("prerequisites", g.prerequisites);
  add("accounts", g.accounts);
  add("setupSteps", g.setupSteps);
  add("scopes", g.scopes);
  add("redirect.notes", g.redirect.notes);
  add("testing", g.testing);
  add("troubleshooting", g.troubleshooting);
  add("blockers", g.blockers);
  return out;
}

/**
 * Enforces evidence rules that a plain shape check cannot:
 * - cited source ids exist
 * - verified/tested claims cite at least one source
 * - verified_docs requires retrieved content; tested requires a direct_request source
 * - generated guides may never contain "tested" claims
 */
export function evidenceIssues(g: Guide): string[] {
  const issues: string[] = [];
  const byId = new Map(g.sources.map((s) => [s.id, s]));
  for (const { path, item } of collectRefs(g)) {
    for (const id of item.sourceIds) if (!byId.has(id)) issues.push(`${path}: unknown source id "${id}"`);
    const cited = item.sourceIds.map((id) => byId.get(id)).filter(Boolean) as Source[];
    if (item.status === "verified_docs") {
      if (cited.length === 0) issues.push(`${path}: verified_docs without a source`);
      else if (!cited.some(isVerifiable))
        issues.push(`${path}: verified_docs but no cited official source content was retrieved`);
    }
    if (item.status === "tested") {
      if (g.kind === "generated") issues.push(`${path}: generated guides cannot contain tested claims`);
      else if (!cited.some((s) => s.fetchMode === "direct_request"))
        issues.push(`${path}: tested without a direct_request source`);
    }
  }
  return issues;
}

/** Downgrades unsupported claims instead of presenting them as verified. Returns the repaired guide and a log of changes. */
export function downgradeUnsupported(g: Guide): { guide: Guide; changes: string[] } {
  const changes: string[] = [];
  const byId = new Map(g.sources.map((s) => [s.id, s]));
  const copy: Guide = structuredClone(g);
  for (const { path, item } of collectRefs(copy)) {
    item.sourceIds = item.sourceIds.filter((id) => byId.has(id));
    const cited = item.sourceIds.map((id) => byId.get(id)!) ;
    if (item.status === "tested" && copy.kind === "generated") {
      item.status = "inferred";
      changes.push(`${path}: "tested" downgraded to inferred`);
    }
    if (item.status === "verified_docs" && !cited.some(isVerifiable)) {
      item.status = "inferred";
      changes.push(`${path}: "verified_docs" downgraded to inferred (no retrieved official source content)`);
    }
  }
  return { guide: copy, changes };
}

export type ValidationResult =
  | { ok: true; guide: Guide }
  | { ok: false; errors: string[] };

export function validateGuide(input: unknown): ValidationResult {
  const parsed = GuideSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 15).map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const issues = evidenceIssues(parsed.data);
  if (issues.length) return { ok: false, errors: issues.slice(0, 15) };
  return { ok: true, guide: parsed.data };
}

export function toApp(g: Guide): App {
  const letter = (g.appName.trim()[0] ?? "?").toUpperCase();
  let hue = 0;
  for (const c of g.appName) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  return {
    id: g.id,
    name: g.appName,
    description: g.summary.length > 160 ? g.summary.slice(0, 157) + "..." : g.summary,
    officialDomain: g.officialDomain,
    category: g.category,
    icon: { letter, hue },
    guideStatus: g.kind,
    slug: g.slug,
    difficulty: g.difficulty,
    approval: g.approval.level,
    handsOnLabel: `${g.estimate.handsOn.min}-${g.estimate.handsOn.max} min`,
    verification: g.verification,
  };
}
