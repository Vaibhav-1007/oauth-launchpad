import Link from "next/link";
import { Directory } from "@/components/directory";
import { toApp } from "@/lib/schema";
import { SEED_GUIDES } from "@/lib/seed-guides";
import { listGeneratedGuides, storageIsDurable } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { generated, generatedError } = await listGeneratedGuides().then(
    (generated) => ({ generated, generatedError: false }),
    () => ({ generated: [], generatedError: true }),
  );
  const apps = [...SEED_GUIDES, ...generated].map(toApp);

  return (
    <div>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Know what an OAuth integration will really take.</h1>
        <p className="mt-2 text-muted">
          Source-backed setup guides that separate hands-on work from approval waits, mark what is documented versus estimated, and say exactly what only you can do.
          Not in the library? Our research agent can build a guide from the provider&apos;s official docs.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href="/generate" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Generate a guide</Link>
          <span className="text-xs text-muted">
            {storageIsDurable() ? "Generated guides are stored in Supabase." : "Local storage mode: generated guides are not durable across deployments."}
          </span>
        </div>
      </div>
      {generatedError && (
        <p role="alert" className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          Generated guides could not be loaded from storage. Curated guides are shown.
        </p>
      )}
      <div className="mt-8">
        <Directory apps={apps} />
      </div>
    </div>
  );
}
