import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GuideSchema, validateGuide, type Guide } from "./schema";
import { SEED_GUIDES } from "./seed-guides";

export type StorageMode = "supabase" | "local-file";

export function storageMode(): StorageMode {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local-file";
}

/** Local fallback is NOT durable on serverless hosts: Vercel's filesystem is ephemeral. */
export function storageIsDurable(): boolean {
  return storageMode() === "supabase";
}

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return client;
}

const localFile = () =>
  process.env.LOCAL_STORE_PATH ?? path.join(process.env.VERCEL ? os.tmpdir() : process.cwd(), ".data", "guides.json");

async function readLocal(): Promise<Guide[]> {
  try {
    const raw = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ localFile(), "utf8")) as unknown[];
    return raw.flatMap((r) => {
      const v = validateGuide(r);
      return v.ok ? [v.guide] : [];
    });
  } catch {
    return [];
  }
}

async function writeLocal(guides: Guide[]) {
  const file = localFile();
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  await fs.writeFile(/*turbopackIgnore: true*/ file, JSON.stringify(guides, null, 2), "utf8");
}

export async function getGeneratedGuide(slug: string): Promise<Guide | null> {
  if (storageMode() === "supabase") {
    const { data, error } = await supabase().from("guides").select("data").eq("slug", slug).maybeSingle();
    if (error) throw new Error(`Database read failed: ${error.message}`);
    if (!data) return null;
    const v = validateGuide(data.data);
    return v.ok ? v.guide : null;
  }
  return (await readLocal()).find((g) => g.slug === slug) ?? null;
}

export async function getGuide(slug: string): Promise<Guide | null> {
  const seed = SEED_GUIDES.find((g) => g.slug === slug);
  if (seed) return seed;
  return getGeneratedGuide(slug);
}

export async function listGeneratedGuides(): Promise<Guide[]> {
  if (storageMode() === "supabase") {
    const { data, error } = await supabase()
      .from("guides")
      .select("data")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Database read failed: ${error.message}`);
    return (data ?? []).flatMap((r) => {
      const v = validateGuide(r.data);
      return v.ok ? [v.guide] : [];
    });
  }
  return readLocal();
}

/** Upsert on slug so a retry overwrites instead of creating a duplicate. */
export async function saveGuide(guide: Guide): Promise<void> {
  const parsed = GuideSchema.parse(guide);
  if (storageMode() === "supabase") {
    const { error } = await supabase()
      .from("guides")
      .upsert({ slug: parsed.slug, app_name: parsed.appName, official_domain: parsed.officialDomain, data: parsed }, { onConflict: "slug" });
    if (error) throw new Error(`Database write failed: ${error.message}`);
    return;
  }
  const all = await readLocal();
  const next = [parsed, ...all.filter((g) => g.slug !== parsed.slug)];
  await writeLocal(next);
}
