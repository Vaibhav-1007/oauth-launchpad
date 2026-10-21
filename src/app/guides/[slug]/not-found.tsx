import Link from "next/link";

export default function GuideNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">Guide not found</h1>
      <p className="mt-2 text-sm text-muted">
        This link does not match a curated guide or a saved generated guide. If it was generated in a local-storage deployment, it may be gone because that storage is not durable.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Link href="/" className="rounded-md border border-line px-3 py-2 text-sm">Browse guides</Link>
        <Link href="/generate" className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">Generate a guide</Link>
      </div>
    </div>
  );
}
