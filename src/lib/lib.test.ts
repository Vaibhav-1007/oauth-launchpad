import { describe, expect, it } from "vitest";
import { downgradeUnsupported, GuideSchema, toApp, validateGuide, type Guide } from "./schema";
import { SEED_GUIDES } from "./seed-guides";
import { approvalWaitLabel, formatRange, normalizeEstimate } from "./estimate";
import { defaultFilters, filterApps } from "./directory";
import { isPrivateOrLocalHost, parseInput, registrableDomain, safeHttpUrl } from "./url-safety";
import { rateLimit, resetRateLimits } from "./rate-limit";
import { lookupManaged, parseManagedAuth } from "./research/composio";
import { buildSources } from "./research/pipeline";

const clone = (g: Guide): Guide => structuredClone(g);
const generated = (): Guide => ({ ...clone(SEED_GUIDES[0]), kind: "generated" });

describe("guide validation", () => {
  it("accepts every seeded guide", () => {
    for (const g of SEED_GUIDES) {
      const r = validateGuide(g);
      expect(r.ok, g.slug + JSON.stringify(r)).toBe(true);
    }
  });

  it("rejects malformed structure and invalid URLs", () => {
    const g = clone(SEED_GUIDES[0]);
    g.sources[0].url = "javascript:alert(1)";
    expect(GuideSchema.safeParse(g).success).toBe(false);
    const missing = { ...clone(SEED_GUIDES[0]), setupSteps: [] };
    expect(validateGuide(missing).ok).toBe(false);
  });

  it("rejects unknown source ids", () => {
    const g = clone(SEED_GUIDES[0]);
    g.setupSteps[0].sourceIds = ["nope"];
    const r = validateGuide(g);
    expect(r.ok).toBe(false);
  });

  it("rejects verified_docs backed only by an unretrieved source", () => {
    const g = clone(SEED_GUIDES[0]);
    g.setupSteps[0].status = "verified_docs";
    g.setupSteps[0].sourceIds = ["gh-authorize"]; // not retrieved
    const r = validateGuide(g);
    expect(r.ok).toBe(false);
  });

  it("rejects generated guides that claim 'tested'", () => {
    const g = generated();
    g.troubleshooting[0].status = "tested";
    g.troubleshooting[0].sourceIds = ["gh-test"];
    expect(validateGuide(g).ok).toBe(false);
  });

  it("downgrades unsupported claims instead of leaving them verified", () => {
    const g = generated();
    g.setupSteps[0].status = "tested";
    g.setupSteps[1].status = "verified_docs";
    g.setupSteps[1].sourceIds = ["gh-authorize"];
    const { guide, changes } = downgradeUnsupported(g);
    expect(guide.setupSteps[0].status).toBe("inferred");
    expect(guide.setupSteps[1].status).toBe("inferred");
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(validateGuide(guide).ok).toBe(true);
  });

  it("derives a directory app record", () => {
    const app = toApp(SEED_GUIDES[0]);
    expect(app.guideStatus).toBe("curated");
    expect(app.icon.letter).toBe("G");
  });
});

describe("estimates", () => {
  it("formats ranges and approval waits", () => {
    expect(formatRange({ min: 10, max: 25 })).toBe("10-25 min");
    expect(formatRange({ min: 30, max: 90 })).toBe("30 min-1.5 h");
    expect(approvalWaitLabel(SEED_GUIDES[1].estimate)).toMatch(/Unknown/);
    expect(approvalWaitLabel(SEED_GUIDES[0].estimate)).toMatch(/No external review/);
  });

  it("drops numeric approval days that cite no source", () => {
    const e = clone(SEED_GUIDES[1]).estimate;
    e.approval = { kind: "known", summary: "Reviews take a week", minDays: 5, maxDays: 7, sourceIds: [] };
    const { estimate, changes } = normalizeEstimate(e);
    expect(estimate.approval.kind).toBe("unknown");
    expect(estimate.approval.minDays).toBeNull();
    expect(changes.length).toBeGreaterThan(0);
  });

  it("keeps a sourced numeric timeline and reorders reversed ranges", () => {
    const e = clone(SEED_GUIDES[1]).estimate;
    e.approval = { kind: "known", summary: "Docs say 3-5 days", minDays: 5, maxDays: 3, sourceIds: ["slack-oauth"] };
    e.handsOn = { min: 30, max: 10 };
    const { estimate } = normalizeEstimate(e);
    expect(estimate.approval).toMatchObject({ kind: "known", minDays: 3, maxDays: 5 });
    expect(estimate.handsOn).toEqual({ min: 10, max: 30 });
  });

  it("rejects inverted minute ranges in the schema", () => {
    const g = clone(SEED_GUIDES[0]);
    g.estimate.handsOn = { min: 50, max: 5 };
    expect(GuideSchema.safeParse(g).success).toBe(false);
  });
});

describe("directory search and filtering", () => {
  const apps = SEED_GUIDES.map(toApp);
  it("searches by name and category", () => {
    expect(filterApps(apps, { ...defaultFilters, q: "slack" }).map((a) => a.name)).toEqual(["Slack"]);
    expect(filterApps(apps, { ...defaultFilters, q: "messaging" })).toHaveLength(1);
  });
  it("filters by difficulty and approval", () => {
    expect(filterApps(apps, { ...defaultFilters, difficulty: "hard" }).map((a) => a.name)).toEqual(["Google APIs"]);
    expect(filterApps(apps, { ...defaultFilters, approval: "needed" })).toHaveLength(3);
    expect(filterApps(apps, { ...defaultFilters, approval: "none" })).toHaveLength(0);
  });
  it("returns empty for no match and for generated-only with no generated guides", () => {
    expect(filterApps(apps, { ...defaultFilters, q: "zzzz" })).toHaveLength(0);
    expect(filterApps(apps, { ...defaultFilters, kind: "generated" })).toHaveLength(0);
  });
});

describe("input safety", () => {
  it("parses names and URLs", () => {
    expect(parseInput("Linear")).toMatchObject({ ok: true, kind: "name" });
    expect(parseInput("https://www.linear.app/docs")).toMatchObject({ ok: true, kind: "url", domain: "linear.app" });
    expect(parseInput("stripe.com")).toMatchObject({ ok: true, kind: "url", domain: "stripe.com" });
  });
  it("rejects local, private, IP and credentialed targets", () => {
    for (const bad of ["http://localhost:3000", "http://127.0.0.1", "http://169.254.169.254/latest", "https://10.0.0.5", "http://[::1]/", "https://user:pw@example.com", "http://intranet", "https://foo.internal", "ftp://example.com", "https://2130706433"]) {
      expect(parseInput(bad).ok, bad).toBe(false);
    }
  });
  it("rejects short, long and markup input", () => {
    expect(parseInput("a").ok).toBe(false);
    expect(parseInput("x".repeat(201)).ok).toBe(false);
    expect(parseInput("<script>").ok).toBe(false);
  });
  it("detects private hosts and safe URLs", () => {
    expect(isPrivateOrLocalHost("192.168.1.1")).toBe(true);
    expect(isPrivateOrLocalHost("docs.github.com")).toBe(false);
    expect(safeHttpUrl("https://docs.github.com/x")).toBe("https://docs.github.com/x");
    expect(safeHttpUrl("http://localhost/x")).toBeNull();
    expect(registrableDomain("docs.example.co.uk")).toBe("example.co.uk");
  });
});

describe("rate limit", () => {
  it("blocks after the limit and recovers after the window", () => {
    resetRateLimits();
    expect(rateLimit("k", 2, 1000, 0).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, 10).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, 20).ok).toBe(false);
    expect(rateLimit("k", 2, 1000, 1500).ok).toBe(true);
  });
});

describe("composio managed-auth parsing", () => {
  const md = `## Composio-managed OAuth available (2)\n| Toolkit | Slug |\n|---|---|\n| [GitHub](/toolkits/github.md) | \`GITHUB\` |\n| [Slack](/toolkits/slack.md) | \`SLACK\` |\n\n## Bring your own OAuth app (1)\n| [Shopify](/toolkits/shopify.md) | \`SHOPIFY\` |\n`;
  it("separates managed from bring-your-own", () => {
    const l = parseManagedAuth(md);
    expect(l.managed).toEqual(["GitHub", "Slack"]);
    expect(l.byo).toEqual(["Shopify"]);
    expect(lookupManaged("github", l).status).toBe("listed");
    expect(lookupManaged("Shopify", l).status).toBe("not_listed");
  });
});

describe("source building", () => {
  it("keeps official sources first, drops unsafe URLs, dedupes, and flags snippets", () => {
    const long = "x".repeat(800);
    const { sources } = buildSources(
      [
        { title: "Blog", url: "https://blog.example.net/a", snippet: "s", content: long },
        { title: "Docs", url: "https://docs.example.com/oauth#frag", snippet: "s", content: long },
        { title: "Docs dup", url: "https://docs.example.com/oauth", snippet: "s", content: long },
        { title: "Local", url: "http://localhost/x", snippet: "s", content: long },
        { title: "Snip", url: "https://example.com/scopes", snippet: "only a snippet", content: "" },
      ],
      ["example.com"],
      "2026-01-01T00:00:00.000Z",
    );
    expect(sources.map((s) => s.url)).toEqual(["https://docs.example.com/oauth", "https://example.com/scopes", "https://blog.example.net/a"]);
    expect(sources[0].fetchMode).toBe("full_page");
    expect(sources[1].fetchMode).toBe("search_snippet");
    expect(sources[1].sourceType).toBe("official_reference");
    expect(sources[2].sourceType).toBe("third_party");
    expect(sources.map((s) => s.id)).toEqual(["S1", "S2", "S3"]);
  });
});
