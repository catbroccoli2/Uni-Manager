/**
 * Small typed readers for FormData.
 *
 * Deliberately hand-rolled rather than reaching for a schema library: the whole
 * surface is six entities with a dozen fields, and the failure these guard
 * against is narrow — FormData values arrive as `string | File`, and a `Number('')`
 * is 0, which would silently turn a cleared weighting field into a real zero.
 *
 * Every parser distinguishes "absent or blank" (null) from "present but
 * unparseable" (an error), because for `mark` in particular those mean
 * genuinely different things: blank is "not graded yet", garbage is a mistake.
 */

export class FormError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = 'FormError';
  }
}

function raw(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function optionalText(form: FormData, field: string): string | null {
  return raw(form, field);
}

export function requiredText(form: FormData, field: string, label: string): string {
  const value = raw(form, field);
  if (value === null) throw new FormError(`${label} is required.`, field);
  return value;
}

export function optionalNumber(form: FormData, field: string, label: string): number | null {
  const value = raw(form, field);
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new FormError(`${label} must be a number.`, field);
  return parsed;
}

export function requiredNumber(form: FormData, field: string, label: string): number {
  const value = optionalNumber(form, field, label);
  if (value === null) throw new FormError(`${label} is required.`, field);
  return value;
}

export function boolean(form: FormData, field: string): boolean {
  const value = form.get(field);
  return value === 'on' || value === 'true' || value === '1';
}

/**
 * Narrows a free string to one of a known set. Returns the fallback rather than
 * throwing, so a stale option in a form never blocks a save.
 */
export function oneOf<const T extends readonly string[]>(
  form: FormData,
  field: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  const value = raw(form, field);
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

export function requiredId(form: FormData, field: string): number {
  const value = requiredNumber(form, field, 'Identifier');
  if (!Number.isInteger(value) || value <= 0) {
    throw new FormError('Identifier must be a positive whole number.', field);
  }
  return value;
}

/** The shape every Server Action in this app returns. */
export type ActionResult = { ok: true } | { ok: false; error: string; field?: string };

export function failure(error: unknown): ActionResult {
  if (error instanceof FormError) return { ok: false, error: error.message, field: error.field };
  // Never leak a driver message into the UI; log it where the developer sees it.
  console.error(error);
  return { ok: false, error: 'Could not save. Check the values and try again.' };
}
