/**
 * Utility function to create a promise that resolves after a specified delay
 * @param ms - The number of milliseconds to wait
 * @returns A promise that resolves after the specified delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
