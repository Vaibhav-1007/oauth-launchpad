"use client";

export default function GuideError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">Could not load this guide</h1>
      <p className="mt-2 text-sm text-muted">The guide storage did not respond correctly. This is a temporary error, not a missing guide.</p>
      <button onClick={reset} className="mt-4 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">Retry</button>
    </div>
  );
}
