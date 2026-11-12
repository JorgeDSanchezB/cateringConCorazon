/**
 * Dinero en centavos USD (enteros; sin flotantes, sin Intl no determinista).
 * Formato manual determinista con notación US-style ($1,250.50), la
 * convención habitual de Ecuador dolarizado (decisión en ADR-009).
 */

export function formatMoney(cents: number, symbol = "$"): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const centsPart = String(abs % 100).padStart(2, "0");
  const grouped = dollars
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${symbol}${grouped}.${centsPart}`;
}

/**
 * Convierte entrada de dinero del admin ("3.50", "3,50", "3") a centavos.
 * Devuelve null si no es parseable (el caller decide si es error).
 */
export function parseMoneyToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Math.round(value * 100);
}

/** Parseo estricto para APIs: solo enteros en centavos. */
export function requireCents(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0) return null;
  if (input > 100_000_000) return null; // límite técnico anti-overflow: $1M
  return input;
}
