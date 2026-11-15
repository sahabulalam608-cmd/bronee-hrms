/** Tiny classname joiner — keeps conditional Tailwind classes readable. */
export function cn(
  ...parts: Array<string | number | boolean | null | undefined>
): string {
  return parts.filter((part) => typeof part === 'string' && part.length > 0).join(' ');
}
