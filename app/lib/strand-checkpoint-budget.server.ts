// A single deadline for all checkpoint I/O. A timed-out database request may
// still commit remotely; stop awaiting it and never start subsequent operations.
// Immutable identities make a later retry safe even if acknowledgement was lost.
export class CheckpointBudgetExceeded extends Error {
  constructor() { super("Checkpoint budget exhausted; an in-flight write may still complete. Inspect stored records before retrying."); }
}

export function checkpointBudget(deadlineMs = Infinity, now: () => number = Date.now) {
  return {
    expired: () => now() >= deadlineMs,
    async run<T>(operation: () => PromiseLike<T>): Promise<T> {
      const remaining = deadlineMs - now();
      if (remaining <= 0) throw new CheckpointBudgetExceeded();
      if (!Number.isFinite(remaining)) return await operation();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CheckpointBudgetExceeded()), remaining); }),
          operation(),
        ]);
        if (now() >= deadlineMs) throw new CheckpointBudgetExceeded();
        return result;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
