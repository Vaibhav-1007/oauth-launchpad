import type { ReactNode } from "react";
import { approvalWaitLabel, formatRange } from "@/lib/estimate";
import type { Claim, EvidenceStatus, Guide, Source } from "@/lib/schema";
import { safeHttpUrl } from "@/lib/url-safety";
import { ApprovalBadge, DifficultyBadge, EvidenceBadge, KindBadge, VerificationBadge } from "./badges";
import { CopyLinkButton } from "./copy-link";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 border-t border-line py-6">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  const safe = safeHttpUrl(href);
  if (!safe) return <span>{children}</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
      {children}
    </a>
  );
}

function Cites({ ids, sources }: { ids: string[]; sources: Source[] }) {
  if (!ids.length) return <span className="text-xs text-rose-700">No source cited</span>;
  return (
    <span className="text-xs text-muted">
      Source:{" "}
      {ids.map((id, i) => {
        const s = sources.find((x) => x.id === id);
        return (
          <span key={id}>
            {i > 0 && ", "}
            {s ? <ExtLink href={s.url}>{s.title.length > 60 ? s.title.slice(0, 57) + "..." : s.title}</ExtLink> : id}
          </span>
        );
      })}
    </span>
  );
}

function ClaimList({ items, sources }: { items: Claim[]; sources: Source[] }) {
  if (!items.length) return <p className="text-sm text-muted">None identified.</p>;
  return (
    <ul className="space-y-3">
      {items.map((c, i) => (
        <li key={i} className="text-sm">
          <p>{c.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <EvidenceBadge status={c.status} />
            <Cites ids={c.sourceIds} sources={sources} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StepList({ steps, sources }: { steps: Guide["setupSteps"]; sources: Source[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li key={i} className="rounded-lg border border-line bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-foreground text-xs text-background">{i + 1}</span>
            <h3 className="font-medium">{s.title}</h3>
            {s.optional && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">Optional</span>}
            {s.humanRequired && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">You must do this</span>}
          </div>
          <dl className="mt-2 space-y-1 text-sm">
            <div><dt className="inline font-medium">Do: </dt><dd className="inline">{s.action}</dd></div>
            <div><dt className="inline font-medium">Where: </dt><dd className="inline">{s.where}</dd></div>
            <div><dt className="inline font-medium">Expect: </dt><dd className="inline">{s.expected}</dd></div>
          </dl>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <EvidenceBadge status={s.status} />
            <Cites ids={s.sourceIds} sources={sources} />
          </div>
        </li>
      ))}
    </ol>
  );
}

const OUTCOME: Record<string, string> = {
  completed: "border-emerald-300 bg-emerald-50 text-emerald-800",
  attempted: "border-amber-300 bg-amber-50 text-amber-800",
  could_not: "border-rose-300 bg-rose-50 text-rose-800",
};
const OUTCOME_LABEL: Record<string, string> = { completed: "Completed", attempted: "Attempted", could_not: "Could not perform" };

const LABEL_ORDER: EvidenceStatus[] = ["verified_docs", "tested", "estimated", "inferred", "unknown"];

export function GuideView({ guide: g }: { guide: Guide }) {
  const e = g.estimate;
  const researched = new Date(g.researchedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <article>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={g.kind} />
            <VerificationBadge value={g.verification} />
            {g.generationStatus !== "complete" && <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-800">Generation {g.generationStatus}</span>}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{g.appName} OAuth setup</h1>
          <p className="mt-1 text-sm text-muted">{g.scenario}</p>
          <p className="mt-2 text-sm text-muted">
            Provider: {g.provider} · Domain: {g.officialDomain} · Researched {researched} ·{" "}
            <ExtLink href={g.officialDocsUrl}>Official documentation</ExtLink>
          </p>
        </div>
        <CopyLinkButton />
      </div>

      {g.kind === "generated" && (
        <p className="mt-4 rounded-md border border-fuchsia-300 bg-fuchsia-50 p-3 text-sm text-fuchsia-900">
          AI-generated guide. An LLM wrote it from search results retrieved at research time. Nothing in it was tested against a live provider account. Confirm important details in the cited sources.
        </p>
      )}

      <p className="mt-4 max-w-3xl">{g.summary}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-line bg-card p-3">
          <div className="text-xs text-muted">Difficulty</div>
          <div className="mt-1"><DifficultyBadge value={g.difficulty} /></div>
          <p className="mt-1 text-xs text-muted">{g.difficultyReason}</p>
        </div>
        <div className="rounded-lg border border-line bg-card p-3">
          <div className="text-xs text-muted">Hands-on setup</div>
          <div className="mt-1 text-lg font-semibold">{formatRange(e.handsOn)}</div>
          <EvidenceBadge status="estimated" />
        </div>
        <div className="rounded-lg border border-line bg-card p-3">
          <div className="text-xs text-muted">Testing</div>
          <div className="mt-1 text-lg font-semibold">{formatRange(e.testing)}</div>
          <EvidenceBadge status="estimated" />
        </div>
        <div className="rounded-lg border border-line bg-card p-3">
          <div className="text-xs text-muted">External approval wait</div>
          <div className="mt-1 text-lg font-semibold">{approvalWaitLabel(e)}</div>
          <EvidenceBadge status={e.approval.kind === "known" ? "verified_docs" : e.approval.kind === "none" ? "inferred" : "unknown"} />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Hands-on time is work you do; the approval wait happens outside your control and is shown separately.</p>

      <nav aria-label="Guide sections" className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-accent">
        {[["concepts", "Concepts"], ["estimate", "Estimate"], ["approval", "Approval"], ["prereq", "Prerequisites"], ["steps", "Setup steps"], ["scopes", "Scopes"], ["redirect", "Redirect URIs"], ["testing", "Testing"], ["errors", "Troubleshooting"], ["blockers", "Blockers"], ["agent", "Agent vs you"], ["evidence", "Evidence"], ["next", "Next"], ["sources", "Sources"]].map(([id, t]) => (
          <a key={id} href={`#${id}`} className="hover:underline">{t}</a>
        ))}
      </nav>

      <Section id="concepts" title="Three different things people confuse">
        <ul className="grid gap-3 text-sm md:grid-cols-3">
          <li className="rounded-lg border border-line bg-card p-3"><b>OAuth application</b><br />The registration you create with the provider: client ID, secret, redirect URIs, requested scopes. Owned by you.</li>
          <li className="rounded-lg border border-line bg-card p-3"><b>Integration</b><br />The code or platform connector (for example a Composio toolkit) that uses an OAuth application to call the provider&apos;s API.</li>
          <li className="rounded-lg border border-line bg-card p-3"><b>Authorized connection</b><br />One end user&apos;s consent and resulting tokens. Created per user, revocable by them, and limited to the scopes they granted.</li>
        </ul>
      </Section>

      <Section id="estimate" title="Effort estimate">
        <div className="space-y-2 text-sm">
          <p><b>Scope of estimate:</b> {e.scope}</p>
          <p><b>Confidence:</b> {e.confidence}</p>
          <p><b>Approval:</b> {e.approval.summary} <Cites ids={e.approval.sourceIds} sources={g.sources} /></p>
          <div><b>Assumptions:</b><ul className="ml-5 list-disc">{e.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
        </div>
      </Section>

      <Section id="approval" title="Approval and verification requirements">
        <div className="mb-3 flex items-center gap-2"><ApprovalBadge value={g.approval.level} /></div>
        <p className="mb-3 text-sm">{g.approval.summary}</p>
        <ClaimList items={g.approval.items} sources={g.sources} />
      </Section>

      <Section id="prereq" title="Prerequisites, accounts and information">
        <h3 className="mb-2 text-sm font-medium">Prerequisites</h3>
        <ClaimList items={g.prerequisites} sources={g.sources} />
        <h3 className="mb-2 mt-5 text-sm font-medium">Required accounts and information</h3>
        <ClaimList items={g.accounts} sources={g.sources} />
      </Section>

      <Section id="steps" title="Step-by-step setup">
        <StepList steps={g.setupSteps} sources={g.sources} />
      </Section>

      <Section id="scopes" title="Scopes and permissions">
        {g.scopes.length === 0 ? <p className="text-sm text-muted">No scopes identified.</p> : (
          <ul className="space-y-3">
            {g.scopes.map((s, i) => (
              <li key={i} className="text-sm">
                <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-xs">{s.name}</code>
                <p className="mt-1">{s.why}</p>
                {s.note && <p className="text-muted">{s.note}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2"><EvidenceBadge status={s.status} /><Cites ids={s.sourceIds} sources={g.sources} /></div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="redirect" title="Redirect URI and callback configuration">
        {g.redirect.applicable === "no" ? <p className="text-sm text-muted">Not applicable for this setup.</p> : g.redirect.applicable === "unknown" ? <p className="mb-2 text-sm text-rose-800">Applicability unknown; confirm in the documentation.</p> : null}
        <ClaimList items={g.redirect.notes} sources={g.sources} />
      </Section>

      <Section id="testing" title="Testing instructions">
        {g.testing.length ? <StepList steps={g.testing} sources={g.sources} /> : <p className="text-sm text-muted">No testing steps were produced.</p>}
      </Section>

      <Section id="errors" title="Common errors and troubleshooting">
        <ul className="space-y-3">
          {g.troubleshooting.map((t, i) => (
            <li key={i} className="rounded-lg border border-line bg-card p-3 text-sm">
              <code className="font-mono text-xs font-semibold">{t.error}</code>
              <p className="mt-1"><b>Likely cause:</b> {t.cause}</p>
              <p><b>Action:</b> {t.fix}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2"><EvidenceBadge status={t.status} /><Cites ids={t.sourceIds} sources={g.sources} /></div>
            </li>
          ))}
          {g.troubleshooting.length === 0 && <li className="text-sm text-muted">No errors identified in the sources.</li>}
        </ul>
      </Section>

      <Section id="blockers" title="Blockers and how to proceed">
        <ul className="space-y-3">
          {g.blockers.map((b, i) => (
            <li key={i} className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm">
              <b>{b.title}</b>
              <p className="mt-1">{b.detail}</p>
              <p><b>How to proceed:</b> {b.howToProceed}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2"><EvidenceBadge status={b.status} /><Cites ids={b.sourceIds} sources={g.sources} /></div>
            </li>
          ))}
          {g.blockers.length === 0 && <li className="text-sm text-muted">No blockers identified.</li>}
        </ul>
      </Section>

      <Section id="agent" title="What the agent did, and what only you can do">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Agent action log</h3>
            <ul className="space-y-2">
              {g.agentActions.map((a, i) => (
                <li key={i} className="text-sm">
                  <span className={`mr-2 rounded-full border px-2 py-0.5 text-[11px] ${OUTCOME[a.outcome]}`}>{OUTCOME_LABEL[a.outcome]}</span>
                  <b>{a.action}</b>
                  <p className="text-muted">{a.detail}{a.at ? ` (${a.at})` : ""}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">You must complete</h3>
            <ul className="space-y-2">
              {g.humanActions.map((h, i) => (
                <li key={i} className="text-sm"><b>{h.text}</b><p className="text-muted">{h.reason}</p></li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="evidence" title="Evidence and uncertainty">
        <div className="mb-3 flex flex-wrap gap-2">{LABEL_ORDER.map((s) => <EvidenceBadge key={s} status={s} />)}</div>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          {g.uncertainty.map((u, i) => <li key={i}>{u}</li>)}
        </ul>
      </Section>

      <Section id="next" title="What should I do next?">
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent-soft p-3 text-sm">
          <b>Check managed OAuth first</b> <EvidenceBadge status={g.composio.managedAuth === "unchecked" ? "unknown" : g.composio.managedAuth === "listed" ? "verified_docs" : "inferred"} />
          <p className="mt-1">{g.composio.note}</p>
          <p className="mt-1 text-xs text-muted">Managed auth may not exist for every app or use case. <ExtLink href="https://docs.composio.dev/toolkits/managed-auth">Composio managed-auth docs</ExtLink></p>
        </div>
        <ol className="ml-5 list-decimal space-y-1 text-sm">{g.nextSteps.map((n, i) => <li key={i}>{n}</li>)}</ol>
      </Section>

      <Section id="sources" title="Sources">
        <ul className="space-y-3">
          {g.sources.map((s) => (
            <li key={s.id} className="text-sm">
              <ExtLink href={s.url}>{s.title}</ExtLink> <span className="text-xs text-muted">({s.sourceType.replace("_", " ")}, {s.fetchMode.replace("_", " ")}{s.retrievedAt ? `, retrieved ${s.retrievedAt}` : ", not retrieved"})</span>
              {s.supports.length > 0 && <p className="text-muted">Supports: {s.supports.join("; ")}</p>}
              <p className="text-xs text-muted">Limitations: {s.limitations}</p>
            </li>
          ))}
        </ul>
      </Section>
    </article>
  );
}
