import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { missingServices } from "@/lib/research/config";
import { parseInput } from "@/lib/url-safety";
import { runResearch, type ResearchEvent } from "@/lib/research/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  query: z.string().trim().min(2).max(200),
  description: z.string().trim().max(300).optional(),
  refresh: z.boolean().optional(),
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(`generate:${ip}`, Number(process.env.GENERATE_RATE_LIMIT) || 5, 10 * 60_000);
  if (!limit.ok) {
    return json(429, { code: "rate_limited", message: `Too many guide generations. Try again in ${limit.retryAfterSec}s.` }, { "retry-after": String(limit.retryAfterSec) });
  }
  let parsed;
  try {
    parsed = BodySchema.safeParse(await req.json());
  } catch {
    return json(400, { code: "invalid_input", message: "Request body must be JSON." });
  }
  if (!parsed.success) return json(400, { code: "invalid_input", message: "Enter an application name or website (2-200 characters)." });

  const input = parseInput(parsed.data.query);
  if (!input.ok) return json(400, { code: "invalid_input", message: input.error });

  const missing = missingServices();
  if (missing.length) {
    return json(503, {
      code: "not_configured",
      message: `Live research is not configured. Missing: ${missing.join(", ")}. No research was performed; seeded guides remain available.`,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ResearchEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* client disconnected */
        }
      };
      await runResearch(parsed.data, emit);
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
