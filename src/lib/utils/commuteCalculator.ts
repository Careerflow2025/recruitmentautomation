import { CommuteBand, CommuteResult } from '@/types';

/**
 * @CRITICAL - THREE STRICT RULES IMPLEMENTATION
 * RULE 2: Maximum 80 minutes (1h 20m)
 * RULE 3: Must use Google Maps API (this is MOCK for Phase 1)
 */

const MAX_COMMUTE_MINUTES = 80; // RULE 2: Hard limit

/**
 * MOCK commute time calculator for Phase 1
 * In Phase 2, this will call Google Maps Distance Matrix API
 * 
 * @param postcodeA - Origin postcode
 * @param postcodeB - Destination postcode
 * @returns Commute time in minutes (MOCK DATA)
 */
export function calculateCommuteTime(postcodeA: string, postcodeB: string): number {
  // MOCK: Generate random commute time based on postcode similarity
  // In production, this will be replaced with actual Google Maps API call
  
  // Simple hash function for consistent random values
  const hash = (postcodeA + postcodeB).split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);
  
  // Generate random time between 5 and 90 minutes (some will be filtered)
  const mockTime = (hash % 86) + 5; // 5-90 minutes range
  
  return mockTime;
}

/**
 * Get commute band based on minutes
 */
export function getCommuteBand(minutes: number): CommuteBand {
  if (minutes <= 20) return '🟢🟢🟢';
  if (minutes <= 40) return '🟢🟢';
  if (minutes <= 55) return '🟢';
  if (minutes <= 80) return '🟡';
  
  // Should never reach here due to RULE 2 filtering
  return '🟡';
}

/**
 * Format commute time for display
 * @param minutes - Commute time in minutes
 * @returns Formatted string with icons
 */
export function formatCommuteTime(minutes: number): string {
  const band = getCommuteBand(minutes);
  
  if (minutes < 60) {
    return `${band} ${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${band} ${hours}h`;
  }
  
  return `${band} ${hours}h ${remainingMinutes}m`;
}

/**
 * Calculate full commute result
 * @CRITICAL - Enforces RULE 2: Returns null if >80 minutes
 */
export function calculateCommute(postcodeA: string, postcodeB: string): CommuteResult | null {
  const minutes = calculateCommuteTime(postcodeA, postcodeB);
  
  // RULE 2: Exclude matches over 80 minutes
  if (minutes > MAX_COMMUTE_MINUTES) {
    return null;
  }
  
  return {
    minutes,
    display: formatCommuteTime(minutes),
    band: getCommuteBand(minutes),
  };
}

/**
 * Check if commute time is within acceptable range
 */
export function isCommuteAcceptable(minutes: number): boolean {
  return minutes <= MAX_COMMUTE_MINUTES;
}
