export type ComposioLookup = { status: "listed" | "not_listed"; matched: string | null };

/** Parses the markdown from docs.composio.dev/toolkits/managed-auth into managed vs bring-your-own names. */
export function parseManagedAuth(md: string): { managed: string[]; byo: string[] } {
  const managedIdx = md.search(/##\s*Composio-managed OAuth available/i);
  const byoIdx = md.search(/##\s*Bring your own OAuth app/i);
  const rows = (chunk: string) =>
    [...chunk.matchAll(/^\|\s*\[([^\]]+)\]\([^)]*\)\s*\|/gm)].map((m) => m[1].trim());
  if (managedIdx < 0) return { managed: [], byo: [] };
  const managedChunk = md.slice(managedIdx, byoIdx > managedIdx ? byoIdx : undefined);
  const byoChunk = byoIdx >= 0 ? md.slice(byoIdx) : "";
  return { managed: rows(managedChunk), byo: rows(byoChunk) };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function lookupManaged(provider: string, lists: { managed: string[]; byo: string[] }): ComposioLookup {
  const p = norm(provider);
  if (!p) return { status: "not_listed", matched: null };
  const hit = lists.managed.find((n) => norm(n) === p);
  if (hit) return { status: "listed", matched: hit };
  return { status: "not_listed", matched: null };
}

export async function fetchManagedAuthLists(): Promise<{ managed: string[]; byo: string[] } | null> {
  try {
    const res = await fetch("https://docs.composio.dev/toolkits/managed-auth.md", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const lists = parseManagedAuth(await res.text());
    return lists.managed.length ? lists : null;
  } catch {
    return null;
  }
}
