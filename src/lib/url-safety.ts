import net from "node:net";

export type ParsedInput =
  | { ok: true; kind: "name"; name: string }
  | { ok: true; kind: "url"; host: string; domain: string; name: string }
  | { ok: false; error: string };

const MULTI_PART_SUFFIXES = new Set(["co.uk", "org.uk", "ac.uk", "com.au", "co.jp", "co.in", "com.br", "co.nz", "com.sg"]);

export function isPrivateOrLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) return true;
  if (net.isIP(h)) return true; // raw IPs are rejected outright (covers private, loopback, link-local)
  if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return true; // numeric host tricks
  if (!h.includes(".")) return true; // single-label hosts such as "intranet"
  return false;
}

export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  return MULTI_PART_SUFFIXES.has(last2) ? parts.slice(-3).join(".") : last2;
}

export function parseInput(raw: string): ParsedInput {
  const value = raw.trim();
  if (value.length < 2) return { ok: false, error: "Enter an application name or website (at least 2 characters)." };
  if (value.length > 200) return { ok: false, error: "Input is too long (200 characters max)." };
  if (/[\u0000-\u001f<>"'`]/.test(value)) return { ok: false, error: "Input contains unsupported characters." };

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) return { ok: false, error: "Only http(s) websites are supported." };
  const looksLikeUrl = /^https?:\/\//i.test(value) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(value);
  if (!looksLikeUrl) return { ok: true, kind: "name", name: value };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, error: "That does not look like a valid website address." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "Only http(s) websites are supported." };
  if (url.username || url.password) return { ok: false, error: "URLs with embedded credentials are not allowed." };
  const host = url.hostname.toLowerCase();
  if (isPrivateOrLocalHost(host)) return { ok: false, error: "Private, local and IP-address hosts are not supported. Use the provider's public website." };
  const domain = registrableDomain(host);
  const label = domain.split(".")[0];
  return { ok: true, kind: "url", host, domain, name: label.charAt(0).toUpperCase() + label.slice(1) };
}

/** True when `host` equals or is a subdomain of `domain`. */
export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith("." + d);
}

export function safeHttpUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (isPrivateOrLocalHost(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
