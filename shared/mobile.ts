/**
 * BRONEE HRMS — mobile number normalisation.
 *
 * Every mobile number is stored and pushed to Google Sheets in the local
 * Bangladesh format: eleven digits that always start with 0
 * (for example 01711000016). The registration form only accepts a number that
 * begins with 01 and is exactly eleven digits — anything else is not taken.
 */

/**
 * Strict formatter for the registration field.
 *
 * The number must begin with 01 and may not exceed eleven digits. A value that
 * breaks either rule is rejected rather than corrected, so the field never
 * holds a number the system would refuse.
 */
export function formatBdMobileInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  // The number has to start with 0.
  if (digits[0] !== '0') return '';
  // …and the second digit has to be 1.
  if (digits.length >= 2 && digits[1] !== '1') return '0';
  // Eleven digits at most.
  return digits.slice(0, 11);
}

/** True when the value is a complete local Bangladesh mobile number. */
export function isValidBdMobile(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('01');
}

/**
 * Normalises a number that arrived from another system into the local format.
 * Returns null when the value cannot be read as a mobile number.
 */
export function normalizeBdMobile(input: string): string | null {
  const digits = input.replace(/\D/g, '');

  if (digits.length === 13 && digits.startsWith('880')) {
    return `0${digits.slice(3)}`;
  }
  if (digits.length === 12 && digits.startsWith('880')) {
    return `0${digits.slice(3)}`;
  }
  if (digits.length === 10 && digits.startsWith('8')) {
    return `0${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits;
  }
  if (digits.length === 10 && digits.startsWith('1')) {
    return `0${digits}`;
  }
  return null;
}
