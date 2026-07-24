'use client';

/**
 * Reusable upload progress bar, used on every video/content upload surface.
 * `value` is 0–100. When the value is 100 it shows a "Finishing up…" hint since
 * the server may still be persisting metadata after the bytes finish.
 */
export function UploadProgress({
  value,
  label = 'Uploading',
  className = '',
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className={`w-full ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex items-center justify-between text-xs font-semibold text-espresso/70 mb-1.5">
        <span>{pct >= 100 ? 'Finishing up…' : `${label}…`}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-espresso/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-terracotta transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default UploadProgress;
