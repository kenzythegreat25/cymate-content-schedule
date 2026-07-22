"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <div className="mb-4 text-2xl">Something went wrong</div>
        <p className="mb-2 text-sm text-ink-soft">
          The dashboard encountered an error. Details below:
        </p>
        <pre className="mb-6 overflow-auto rounded-lg bg-surface-2 p-3 text-left text-xs text-red-600">
          {error.message || String(error)}
          {error.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>
        <button
          onClick={reset}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
