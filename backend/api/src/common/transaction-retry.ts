import { Prisma } from '@app/storage';

function retryable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return true;
  if (!(error instanceof Error)) return false;
  return /(?:serialization failure|deadlock detected|could not serialize)/i.test(error.message);
}

export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  maximumAttempts = 5,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await operation();
    } catch (error: unknown) {
      attempt += 1;
      if (attempt >= maximumAttempts || !retryable(error)) throw error;
      const delay = 5 * 2 ** (attempt - 1) + Math.floor(Math.random() * 15);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
}
