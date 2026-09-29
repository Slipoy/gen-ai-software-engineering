/**
 * Money helpers. Amounts arrive as JS numbers with up to 2 decimals; all arithmetic
 * is done in integer cents to avoid floating point drift (0.1 + 0.2 !== 0.3).
 */

const EPSILON = 1e-9;

export function hasAtMostTwoDecimals(value: number): boolean {
  const cents = value * 100;
  return Math.abs(cents - Math.round(cents)) < EPSILON;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Rounds to 2 decimals using "round half away from zero". */
export function roundMoney(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) * 100 + EPSILON) / 100;
}
