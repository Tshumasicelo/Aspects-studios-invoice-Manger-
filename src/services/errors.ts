/** An expected, user-facing business rule violation (shown as-is in notifications). */
export class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}

/** Convert any thrown value into a message that is safe to show to the user. */
export function errorMessage(err: unknown): string {
  if (err instanceof BusinessRuleError) return err.message;
  if (err && typeof err === 'object' && 'name' in err) {
    const name = String((err as { name: unknown }).name);
    if (name === 'ConstraintError') return 'This record conflicts with an existing one (duplicate number or reference).';
    if (name === 'QuotaExceededError') return 'Browser storage is full. Export a backup and free up space.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}
