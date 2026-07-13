'use client';

/**
 * Phase N3 — Error boundary.
 *
 * Catches render-time errors in any descendant and shows a recoverable
 * fallback rather than blanking the whole page. Used at the root of each
 * major route group (students, teachers, sponsors, guardian, admin) via
 * the new `app/students/error.tsx` etc. Next.js conventional error
 * boundaries handle most of this for us, but those only fire for server
 * errors and unhandled mutations — this component covers pure render
 * blowups (e.g. a stale API shape) and gives us one consistent fallback
 * UI to test.
 *
 * Designed to be invisible in happy paths: no wrapper element when no
 * error has been caught.
 */

import React from 'react';

interface Props {
  fallback?: React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info);
    this.props.onError?.(error, info);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          className="min-h-[300px] flex items-center justify-center p-8"
        >
          <div className="max-w-md text-center bg-cream-50 border-2 border-coral-200 rounded-2xl p-6 shadow-kid">
            <h2 className="text-lg font-semibold text-coral-400 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-espresso/65 mb-4">
              The page hit an unexpected error. You can try again or head back to your
              dashboard.
            </p>
            <p className="text-xs text-espresso/40 mb-4 font-mono break-words">
              {this.state.error.message}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={this.reset}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-cream font-semibold text-sm border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = '/';
                  }
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-espresso/15 hover:border-espresso/40 bg-cream-50 text-espresso text-sm font-semibold px-5 py-2.5 transition-colors"
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
