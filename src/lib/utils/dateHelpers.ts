/**
 * Date utility functions for new item detection
 */

/**
 * Check if a date is within the last N hours
 * @param date - Date to check
 * @param hours - Number of hours threshold (default: 48)
 * @returns true if date is within threshold
 */
export function isWithinHours(date: Date, hours: number = 48): boolean {
  const now = new Date();
  const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  return hoursDiff <= hours && hoursDiff >= 0;
}

/**
 * Check if item is "new" (added within last 48 hours)
 * @param addedAt - Date when item was added
 * @returns true if new (show 🟨 marker)
 */
export function isNewItem(addedAt: Date): boolean {
  return isWithinHours(addedAt, 48);
}

/**
 * Format ID with new marker if applicable
 * @param id - Item ID
 * @param addedAt - Date when item was added
 * @returns ID with 🟨 prefix if new
 */
export function formatIdWithMarker(id: string, addedAt: Date): string {
  return isNewItem(addedAt) ? `🟨 ${id}` : id;
}
