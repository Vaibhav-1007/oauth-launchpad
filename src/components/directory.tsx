"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { defaultFilters, filterApps, type Filters } from "@/lib/directory";
import type { App } from "@/lib/schema";
import { APPROVAL_LABEL, ApprovalBadge, DifficultyBadge, KindBadge, VerificationBadge } from "./badges";

const select = "rounded-md border border-line bg-card px-2.5 py-2 text-sm";

export function Directory({ apps }: { apps: App[] }) {
  const [f, setF] = useState<Filters>(defaultFilters);
  const shown = useMemo(() => filterApps(apps, f), [apps, f]);
  const active = f.q || f.difficulty !== "all" || f.approval !== "all" || f.kind !== "all";

  return (
    <section aria-label="App directory">
      <div className="flex flex-col gap-3 md:flex-row">
        <label className="flex-1">
          <span className="sr-only">Search apps</span>
          <input
            type="search"
            value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })}
            placeholder="Search apps, e.g. GitHub, Slack, Google"
            className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm placeholder:text-muted"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Difficulty" className={select} value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value as Filters["difficulty"] })}>
            <option value="all">Any difficulty</option>
            <option value="easy">Easy</option>
            <option value="moderate">Moderate</option>
            <option value="hard">Hard</option>
          </select>
          <select aria-label="Approval requirements" className={select} value={f.approval} onChange={(e) => setF({ ...f, approval: e.target.value as Filters["approval"] })}>
            <option value="all">Any approval</option>
            <option value="none">No approval identified</option>
            <option value="needed">Approval required or conditional</option>
            <option value="unknown">Approval unknown</option>
          </select>
          <select aria-label="Guide type" className={select} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Filters["kind"] })}>
            <option value="all">Curated + AI-generated</option>
            <option value="curated">Curated only</option>
            <option value="generated">AI-generated only</option>
          </select>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted" aria-live="polite">
        {shown.length} of {apps.length} guides{active ? " match your filters" : ""}
      </p>

      {shown.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-line bg-card p-8 text-center">
          <h2 className="font-semibold">No guide matches{f.q ? ` "${f.q}"` : ""}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            The library is small. Our research agent can investigate the app&apos;s official docs and build a new guide.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href={`/generate${f.q ? `?q=${encodeURIComponent(f.q)}` : ""}`} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">
              Generate a guide{f.q ? ` for "${f.q}"` : ""}
            </Link>
            {active && (
              <button onClick={() => setF(defaultFilters)} className="rounded-md border border-line px-3 py-2 text-sm">Clear filters</button>
            )}
          </div>
        </div>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((a) => (
            <li key={a.id}>
              <Link href={`/guides/${a.slug}`} className="flex h-full flex-col rounded-lg border border-line bg-card p-4 transition hover:border-accent/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span aria-hidden className="grid h-9 w-9 place-items-center rounded-md text-sm font-semibold text-white" style={{ background: `hsl(${a.icon.hue} 45% 38%)` }}>
                      {a.icon.letter}
                    </span>
                    <div>
                      <h2 className="font-semibold leading-tight">{a.name}</h2>
                      <p className="text-xs text-muted">{a.category} · {a.officialDomain}</p>
                    </div>
                  </div>
                  <KindBadge kind={a.guideStatus} />
                </div>
                <p className="mt-3 flex-1 text-sm text-muted">{a.description}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-muted">Hands-on</dt><dd className="font-medium">{a.handsOnLabel}</dd></div>
                  <div><dt className="text-muted">Approval</dt><dd className="font-medium">{APPROVAL_LABEL[a.approval]}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <DifficultyBadge value={a.difficulty} />
                  <ApprovalBadge value={a.approval} />
                  <VerificationBadge value={a.verification} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
