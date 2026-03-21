import { logger } from "./logger";

export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelay: number,
  label: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(
          `${label} — attempt ${attempt}/${maxRetries} failed: ${lastError.message}. Retrying in ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
