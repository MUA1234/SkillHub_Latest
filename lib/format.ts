/**
 * Locale + currency formatting helpers.
 *
 * Sri Lanka is the default audience: when nothing else is known we render
 * amounts as LKR with grouping that the local audience expects. The helper
 * sticks to the platform Intl APIs so rendering stays consistent across the
 * dashboards that mix `recharts` labels, table cells, and inline copy.
 */

export type SupportedLocale = 'en' | 'si' | 'ta';
export type SupportedCurrency = 'LKR' | 'USD' | 'EUR' | 'GBP';

/**
 * Map a UI locale to the BCP-47 tag we hand to Intl. Sri Lanka variants give
 * locally-correct grouping ("1,00,000" style is *not* used in LK, both ICU
 * data and our users expect "1,000,000"), so en-LK / si-LK / ta-LK all return
 * the right separators without further configuration.
 */
function resolveLocaleTag(locale?: string): string {
  switch ((locale || '').toLowerCase()) {
    case 'si':
      return 'si-LK';
    case 'ta':
      return 'ta-LK';
    case 'en':
      return 'en-LK';
    default:
      return locale && locale.includes('-') ? locale : 'en-LK';
  }
}

/**
 * Default currency for a given UI locale. LKR for the Sri Lankan audience,
 * USD for plain en (when the caller doesn't say otherwise — e.g. an
 * international visitor browsing in English). Callers can always override.
 */
export function defaultCurrencyForLocale(locale?: string): SupportedCurrency {
  switch ((locale || '').toLowerCase()) {
    case 'si':
    case 'ta':
      return 'LKR';
    default:
      return 'LKR';
  }
}

interface FormatOptions {
  /** Override the auto-derived locale tag. */
  locale?: string;
  /** ISO 4217 code. Defaults from locale (LKR for si/ta, otherwise LKR). */
  currency?: SupportedCurrency | string;
  /** When true (default) drop fractional digits — LKR fares are integer in practice. */
  truncateFractionDigits?: boolean;
  /** Render compact form (1.2M, 250K) — useful for dashboard metric cards. */
  compact?: boolean;
}

/**
 * Render a money amount honoring the active locale + currency.
 *
 * Examples:
 *   formatCurrency(1500, { locale: 'si' })            → "රු. 1,500"
 *   formatCurrency(1500, { currency: 'USD' })         → "USD 1,500" (en-LK fallback)
 *   formatCurrency(2_400_000, { compact: true })      → "LKR 2.4M"
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options: FormatOptions = {},
): string {
  const numeric = typeof amount === 'string' ? Number(amount) : amount ?? 0;
  if (!Number.isFinite(numeric)) return '—';

  const localeTag = resolveLocaleTag(options.locale);
  const currency = (options.currency || defaultCurrencyForLocale(options.locale)) as string;

  const wantsTruncation = options.truncateFractionDigits ?? true;

  const fmt = new Intl.NumberFormat(localeTag, {
    style: 'currency',
    currency,
    notation: options.compact ? 'compact' : 'standard',
    maximumFractionDigits: wantsTruncation ? 0 : 2,
    minimumFractionDigits: 0,
    currencyDisplay: 'narrowSymbol',
  });

  try {
    return fmt.format(numeric);
  } catch {
    return `${currency} ${new Intl.NumberFormat(localeTag, {
      maximumFractionDigits: wantsTruncation ? 0 : 2,
    }).format(numeric)}`;
  }
}

/**
 * Render the currency *symbol only* (e.g. "රු.", "$") for inline labels next
 * to a separately-formatted number.
 */
export function currencySymbol(currency: string = 'LKR', locale?: string): string {
  try {
    const parts = new Intl.NumberFormat(resolveLocaleTag(locale), {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    const symbol = parts.find((p) => p.type === 'currency');
    return symbol?.value || currency;
  } catch {
    return currency;
  }
}

/**
 * Format an arbitrary number using the locale's grouping rules. Thin wrapper
 * over Intl.NumberFormat, but the centralization keeps tests / dashboards
 * consistent without each caller re-instantiating the formatter.
 */
export function formatNumber(
  value: number | string | null | undefined,
  options: { locale?: string; compact?: boolean; maximumFractionDigits?: number } = {},
): string {
  const numeric = typeof value === 'string' ? Number(value) : value ?? 0;
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat(resolveLocaleTag(options.locale), {
    notation: options.compact ? 'compact' : 'standard',
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
  }).format(numeric);
}
