/**
 * BRONEE HRMS — input rules for the registration form.
 *
 * Every free-text field on the registration form accepts Latin characters
 * only. Characters written in any other script are silently discarded as they
 * are typed, so the field simply never contains them.
 */

/** Characters kept in a Latin-only field: letters, digits, spaces and light punctuation. */
const LATIN_ALLOWED = /[^\p{Script=Latin}\p{N}\s.,'&/()-]/gu;

/** Keeps only Latin letters, digits, spaces and light punctuation. */
export function stripNonLatin(value: string): string {
  return value.replace(LATIN_ALLOWED, '');
}

/** True when the value contains no characters outside the Latin script. */
export function isLatinOnly(value: string): boolean {
  return stripNonLatin(value) === value;
}
