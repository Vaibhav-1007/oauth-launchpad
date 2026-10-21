import type { App } from "./schema";

export type Filters = {
  q: string;
  difficulty: "all" | App["difficulty"];
  approval: "all" | "none" | "needed" | "unknown";
  kind: "all" | "curated" | "generated";
};

export const defaultFilters: Filters = { q: "", difficulty: "all", approval: "all", kind: "all" };

export function filterApps(apps: App[], f: Filters): App[] {
  const q = f.q.trim().toLowerCase();
  return apps.filter((a) => {
    if (q && !`${a.name} ${a.category} ${a.officialDomain} ${a.description}`.toLowerCase().includes(q)) return false;
    if (f.difficulty !== "all" && a.difficulty !== f.difficulty) return false;
    if (f.kind !== "all" && a.guideStatus !== f.kind) return false;
    if (f.approval === "none" && a.approval !== "none") return false;
    if (f.approval === "needed" && a.approval !== "required" && a.approval !== "conditional") return false;
    if (f.approval === "unknown" && a.approval !== "unknown") return false;
    return true;
  });
}
