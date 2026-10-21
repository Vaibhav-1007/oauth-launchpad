"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type StageId = "identify" | "docs" | "oauth" | "scopes" | "composio" | "generate" | "validate" | "save";
type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";
type Ev =
  | { type: "stage"; stage: StageId; status: Exclude<StageStatus, "pending">; detail?: string }
  | { type: "done"; slug: string; reused: boolean }
  | { type: "error"; code: string; message: string; candidates?: string[] };

const STAGES: { id: StageId; label: string }[] = [
  { id: "identify", label: "Identifying the application" },
  { id: "docs", label: "Finding official developer documentation" },
  { id: "oauth", label: "Investigating OAuth registration and setup" },
  { id: "scopes", label: "Checking scopes, approval and troubleshooting" },
  { id: "composio", label: "Checking Composio managed-auth list" },
  { id: "generate", label: "Generating the structured guide (LLM)" },
  { id: "validate", label: "Validating evidence and schema" },
  { id: "save", label: "Saving the guide" },
];

type Status = { liveResearch: boolean; missing: string[]; storage: string; durable: boolean };
type Err = { code: string; message: string; candidates?: string[] };

const mark: Record<StageStatus, string> = { pending: "○", running: "◐", done: "✓", failed: "✕", skipped: "–" };

export function Generator({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [description, setDescription] = useState("");
  const [refresh, setRefresh] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<Record<string, { s: StageStatus; detail?: string }>>({});
  const [error, setError] = useState<Err | null>(null);
  const [result, setResult] = useState<{ slug: string; reused: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setStages({});
    setRunning(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, description: description || undefined, refresh }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as Err | null;
        setError(body ?? { code: "http", message: `Request failed (HTTP ${res.status}).` });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as Ev;
          if (ev.type === "stage") setStages((p) => ({ ...p, [ev.stage]: { s: ev.status, detail: ev.detail } }));
          else if (ev.type === "done") setResult({ slug: ev.slug, reused: ev.reused });
          else setError({ code: ev.code, message: ev.message, candidates: ev.candidates });
        }
      }
    } catch {
      setError({ code: "network", message: "The connection was interrupted. Retrying will reuse any guide that was already saved." });
    } finally {
      setRunning(false);
    }
  }

  const blocked = status !== null && !status.liveResearch;

  return (
    <div className="mt-6">
      {blocked && (
        <div role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Live research is not configured.</b> Missing: {status!.missing.join(", ")}. Set them in <code>.env.local</code> (see <code>.env.example</code>) and restart. Nothing will be researched until then; the curated guides still work.
        </div>
      )}
      {status && (
        <p className="mb-4 text-xs text-muted">
          Storage: {status.storage}
          {status.durable ? " (durable, shareable links persist)" : " (local file: not durable on serverless deployments, links may disappear)"}.
        </p>
      )}
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-line bg-card p-4">
        <label className="block text-sm font-medium">
          App name or website
          <input required minLength={2} maxLength={200} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Linear, or https://linear.app" className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal" />
        </label>
        <label className="block text-sm font-medium">
          What do you want to integrate? <span className="font-normal text-muted">(optional)</span>
          <textarea maxLength={300} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Read issues on behalf of users in my agent" className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} />
          Re-research even if a guide already exists (replaces it)
        </label>
        <button disabled={running || blocked} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {running ? "Researching..." : "Generate guide"}
        </button>
      </form>

      {(running || Object.keys(stages).length > 0) && (
        <ol className="mt-5 space-y-2" aria-live="polite">
          {STAGES.map((s) => {
            const st = stages[s.id];
            if (!st && !running) return null;
            const state = st?.s ?? "pending";
            return (
              <li key={s.id} className="text-sm">
                <span className={`mr-2 inline-block w-4 text-center ${state === "failed" ? "text-rose-700" : state === "done" ? "text-emerald-700" : "text-muted"}`}>{mark[state]}</span>
                <span className={state === "pending" ? "text-muted" : ""}>{s.label}</span>
                {st?.detail && <span className="block pl-6 text-xs text-muted">{st.detail}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {error && (
        <div role="alert" className="mt-5 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          <b>{error.code === "ambiguous" ? "Which app did you mean?" : "Guide not generated"}</b>
          <p className="mt-1">{error.message}</p>
          {error.candidates && error.candidates.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {error.candidates.map((c) => (
                <li key={c}><button type="button" onClick={() => setQuery(c)} className="rounded-full border border-rose-300 bg-white px-2.5 py-1 text-xs">{c}</button></li>
              ))}
            </ul>
          )}
          {error.code !== "not_configured" && error.code !== "invalid_input" && (
            <button onClick={(e) => submit(e as unknown as React.FormEvent)} disabled={running} className="mt-3 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs">Retry</button>
          )}
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {result.reused ? "A guide for this provider already exists; opened the saved one." : "Guide generated and saved."}{" "}
          <Link href={`/guides/${result.slug}`} className="font-medium underline">Open guide</Link>
        </div>
      )}
    </div>
  );
}
