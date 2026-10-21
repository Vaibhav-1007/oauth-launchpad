import { Generator } from "@/components/generator";

export const dynamic = "force-dynamic";

export default async function GeneratePage({ searchParams }: PageProps<"/generate">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : "";
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Generate a guide</h1>
      <p className="mt-1 text-sm text-muted">
        Enter an app name or its website. The server runs real web searches against the provider&apos;s official domains, then an LLM turns the retrieved text into a structured, validated guide. Never enter secrets here.
      </p>
      <Generator initialQuery={q} />
    </div>
  );
}
