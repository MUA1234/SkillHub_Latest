'use client';

/**
 * Reusable upload progress bar, used on every video/content upload surface.
 * `value` is 0–100. `speed` (bytes/sec, optional) is shown as a live network
 * rate next to the bar. At 100% it shows "Finishing up…" since the server may
 * still be persisting metadata after the bytes finish.
 */
function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return '';
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${Math.round(bps / 1024)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

export function UploadProgress({
  value,
  label = 'Uploading',
  speed,
  className = '',
}: {
  value: number;
  label?: string;
  speed?: number;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  const speedText = pct < 100 ? formatSpeed(speed) : '';
  return (
    <div className={`w-full ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex items-center justify-between text-xs font-semibold text-espresso/70 mb-1.5">
        <span>{pct >= 100 ? 'Finishing up…' : `${label}…`}</span>
        <span className="flex items-center gap-2">
          {speedText && <span className="text-espresso/50 tabular-nums">{speedText}</span>}
          <span className="tabular-nums">{pct}%</span>
        </span>
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
