import type { EvidenceStatus, Guide } from "@/lib/schema";

export const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  verified_docs: "Verified from official documentation",
  tested: "Tested directly",
  estimated: "Estimated",
  inferred: "Inferred",
  unknown: "Unknown or needs confirmation",
  not_applicable: "Not applicable",
};

const EVIDENCE_STYLE: Record<EvidenceStatus, string> = {
  verified_docs: "border-emerald-300 bg-emerald-50 text-emerald-800",
  tested: "border-sky-300 bg-sky-50 text-sky-800",
  estimated: "border-amber-300 bg-amber-50 text-amber-800",
  inferred: "border-violet-300 bg-violet-50 text-violet-800",
  unknown: "border-rose-300 bg-rose-50 text-rose-800",
  not_applicable: "border-line bg-white text-muted",
};

const pill = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap";

export function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  return <span className={`${pill} ${EVIDENCE_STYLE[status]}`}>{EVIDENCE_LABEL[status]}</span>;
}

export function DifficultyBadge({ value }: { value: Guide["difficulty"] }) {
  const style = { easy: "border-emerald-300 bg-emerald-50 text-emerald-800", moderate: "border-amber-300 bg-amber-50 text-amber-800", hard: "border-rose-300 bg-rose-50 text-rose-800" }[value];
  return <span className={`${pill} ${style}`}>{value[0].toUpperCase() + value.slice(1)}</span>;
}

export const APPROVAL_LABEL: Record<Guide["approval"]["level"], string> = {
  none: "No approval identified",
  conditional: "Conditional approval",
  required: "Approval required",
  unknown: "Approval unknown",
};

export function ApprovalBadge({ value }: { value: Guide["approval"]["level"] }) {
  const style = { none: "border-emerald-300 bg-emerald-50 text-emerald-800", conditional: "border-amber-300 bg-amber-50 text-amber-800", required: "border-rose-300 bg-rose-50 text-rose-800", unknown: "border-line bg-white text-muted" }[value];
  return <span className={`${pill} ${style}`}>{APPROVAL_LABEL[value]}</span>;
}

export function KindBadge({ kind }: { kind: Guide["kind"] }) {
  return kind === "curated" ? (
    <span className={`${pill} border-accent/40 bg-accent-soft text-accent`}>Curated</span>
  ) : (
    <span className={`${pill} border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800`}>AI-generated</span>
  );
}

export const VERIFICATION_LABEL: Record<Guide["verification"], string> = {
  verified: "Verified",
  partially_verified: "Partially verified",
  unverified: "Unverified",
};

export function VerificationBadge({ value }: { value: Guide["verification"] }) {
  const style = { verified: "border-emerald-300 bg-emerald-50 text-emerald-800", partially_verified: "border-amber-300 bg-amber-50 text-amber-800", unverified: "border-rose-300 bg-rose-50 text-rose-800" }[value];
  return <span className={`${pill} ${style}`}>{VERIFICATION_LABEL[value]}</span>;
}
