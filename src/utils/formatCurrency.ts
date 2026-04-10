/**
 * formatCurrency.ts
 *
 * Locale-aware currency formatting using the native Intl.NumberFormat API.
 * No additional dependencies required.
 *
 * Usage:
 *   formatCurrency(50000)                       // "$50,000.00" (default USD/en)
 *   formatCurrency(50000, 'en-NG', 'NGN')       // "₦50,000.00"
 *   formatCurrency(50000, 'sl-SI', 'EUR')       // "50.000,00 €"
 */

export function formatCurrency(
  amount: number,
  locale: string = 'en',
  currency: string = 'USD'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Fallback if locale/currency is invalid
    return `${currency} ${amount.toLocaleString()}`;
  }
}

/**
 * @deprecated Use formatCurrency() instead.
 * Kept for backward compatibility — formats as Nigerian Naira.
 */
export function formatNaira(amount: number): string {
  return formatCurrency(amount, 'en-NG', 'NGN');
}
