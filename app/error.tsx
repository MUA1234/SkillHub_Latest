'use client';

/**
 * Phase N3 — Global error boundary for the App Router.
 *
 * Next.js calls this component when a server or render error escapes
 * any nested error.tsx. The `reset` prop attempts a soft re-render
 * (rebuilds the segment); when that's not enough the user can navigate
 * away via the link.
 */

import React, { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('App error boundary:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-md text-center bg-cream-50 border border-coral/30 rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-coral mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-espresso/70 mb-4">
          The page hit an unexpected error. You can try again, or head back to your
          dashboard.
        </p>
        {error?.digest && (
          <p className="text-xs text-espresso/45 mb-4 font-mono">Ref: {error.digest}</p>
        )}
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={reset}
            className="bg-terracotta hover:bg-terracotta-500 text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            Try again
          </button>
          <a
            href="/"
            className="border border-espresso/20 hover:bg-cream-100 text-espresso text-sm font-medium px-4 py-2 rounded-md"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
