"use client";

import { useState } from "react";

export function CopyLinkButton() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }
  return (
    <button onClick={copy} className="rounded-md border border-line bg-card px-3 py-1.5 text-sm hover:border-accent/60" aria-live="polite">
      {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed: copy from address bar" : "Copy share link"}
    </button>
  );
}
