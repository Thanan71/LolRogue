export class AdminMutationOutcomeUnknown extends Error {
  constructor() {
    super('Admin mutation outcome is unknown.');
    this.name = 'AdminMutationOutcomeUnknown';
  }
}

/** Bound the UI wait even when a transport does not settle after abort. Never retry a write. */
export async function runAdminMutation<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  controller: AbortController,
  timeoutMs: number,
): Promise<T> {
  if (controller.signal.aborted) throw new AdminMutationOutcomeUnknown();
  let abort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(new AdminMutationOutcomeUnknown());
    controller.signal.addEventListener('abort', abort, { once: true });
    if (controller.signal.aborted) abort();
  });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([operation(controller.signal), aborted]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', abort);
  }
}
