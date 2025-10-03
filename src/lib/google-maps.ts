/**
 * Google Maps Distance Matrix API Service
 * RULE 3: Use ONLY Google Maps for distance calculations
 */

export interface CommuteResult {
  minutes: number;
  display: string;
  band: string;
  distance_text: string;
  duration_text: string;
}

export interface GoogleMapsDistanceResponse {
  rows: Array<{
    elements: Array<{
      status: string;
      duration?: {
        value: number; // seconds
        text: string;
      };
      distance?: {
        value: number; // meters
        text: string;
      };
    }>;
  }>;
}

/**
 * Get commute band emoji based on minutes
 * RULE 2: Max 80 minutes
 */
export function getCommuteBand(minutes: number): string {
  if (minutes <= 20) return '🟢🟢🟢';
  if (minutes <= 40) return '🟢🟢';
  if (minutes <= 55) return '🟢';
  if (minutes <= 80) return '🟡';
  return ''; // Over 80 minutes - should be excluded
}

/**
 * Format commute time for display
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
 * Calculate commute time between two UK postcodes using Google Maps Distance Matrix API
 * RULE 3: ONLY use Google Maps API - no alternatives allowed
 */
export async function calculateCommute(
  originPostcode: string,
  destinationPostcode: string
): Promise<CommuteResult> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error('Google Maps API key is not configured');
  }

  // Clean postcodes
  const origin = originPostcode.trim().toUpperCase();
  const destination = destinationPostcode.trim().toUpperCase();

  // Build Google Maps Distance Matrix API URL
  const params = new URLSearchParams({
    origins: origin,
    destinations: destination,
    mode: 'driving', // Car commute
    units: 'imperial', // UK uses miles
    key: apiKey,
  });

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Google Maps API error: ${response.status} ${response.statusText}`);
    }

    const data: GoogleMapsDistanceResponse = await response.json();

    // Check if we got valid results
    if (!data.rows || data.rows.length === 0 || !data.rows[0].elements || data.rows[0].elements.length === 0) {
      throw new Error('No route found between postcodes');
    }

    const element = data.rows[0].elements[0];

    if (element.status !== 'OK' || !element.duration || !element.distance) {
      throw new Error(`Route calculation failed: ${element.status}`);
    }

    // Convert seconds to minutes
    const minutes = Math.round(element.duration.value / 60);

    // RULE 2: Exclude matches over 80 minutes
    if (minutes > 80) {
      throw new Error(`Commute time ${minutes} minutes exceeds maximum of 80 minutes (RULE 2)`);
    }

    return {
      minutes,
      display: formatCommuteTime(minutes),
      band: getCommuteBand(minutes),
      distance_text: element.distance.text,
      duration_text: element.duration.text,
    };
  } catch (error) {
    // Re-throw the error with proper message
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Google Maps API request failed: ${String(error)}`);
  }
}

/**
 * Calculate commute times for multiple origin-destination pairs
 * Uses Google Maps API efficiently with batch requests where possible
 */
export async function calculateBatchCommutes(
  pairs: Array<{ origin: string; destination: string }>
): Promise<Array<CommuteResult | null>> {
  // Google Maps allows up to 25 origins × 25 destinations per request
  // For simplicity, we'll do individual requests but could optimize later

  const results = await Promise.allSettled(
    pairs.map(pair => calculateCommute(pair.origin, pair.destination))
  );

  return results.map(result => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    console.warn('Commute calculation failed:', result.reason);
    return null;
  });
}
