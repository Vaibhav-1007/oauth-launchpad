import type { Estimate } from "./schema";

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`;
}

export function formatRange(r: { min: number; max: number }): string {
  if (r.min === r.max) return formatMinutes(r.min);
  if (r.max < 60 || r.min >= 60) return `${formatMinutes(r.min).replace(" min", "")}-${formatMinutes(r.max)}`;
  return `${formatMinutes(r.min)}-${formatMinutes(r.max)}`;
}

export function approvalWaitLabel(e: Estimate): string {
  const a = e.approval;
  if (a.kind === "none") return "No external review identified";
  if (a.kind === "unknown" || a.minDays === null || a.maxDays === null) return "Unknown (no published timeline)";
  return a.minDays === a.maxDays ? `${a.minDays} days` : `${a.minDays}-${a.maxDays} days`;
}

/**
 * Normalises a model-produced estimate: a numeric approval wait is only kept when
 * it cites a source; otherwise it is converted to "unknown". Ranges are reordered.
 */
export function normalizeEstimate(e: Estimate): { estimate: Estimate; changes: string[] } {
  const changes: string[] = [];
  const est: Estimate = structuredClone(e);
  for (const key of ["handsOn", "testing"] as const) {
    if (est[key].min > est[key].max) {
      [est[key].min, est[key].max] = [est[key].max, est[key].min];
      changes.push(`${key} range reordered`);
    }
  }
  const a = est.approval;
  const hasNumbers = a.minDays !== null || a.maxDays !== null;
  if (a.kind === "known" && (a.sourceIds.length === 0 || !hasNumbers)) {
    a.kind = "unknown";
    a.minDays = null;
    a.maxDays = null;
    a.summary = `${a.summary} (Numeric timeline removed: no cited source for it.)`.slice(0, 600);
    changes.push("approval timeline converted to unknown (no cited source)");
  }
  if (a.kind !== "known" && hasNumbers) {
    a.minDays = null;
    a.maxDays = null;
    changes.push("numeric approval days dropped for non-known timeline");
  }
  if (a.minDays !== null && a.maxDays !== null && a.minDays > a.maxDays) {
    [a.minDays, a.maxDays] = [a.maxDays, a.minDays];
  }
  return { estimate: est, changes };
}
