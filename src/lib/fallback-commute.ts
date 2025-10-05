/**
 * Fallback Commute Calculator
 * Used when Google Maps API is unavailable or fails
 * 
 * Provides reasonable estimates based on UK postcode geography
 * This is a TEMPORARY solution - the real fix is getting Google Maps API working
 */

import { CommuteResult, getCommuteBand, formatCommuteTime } from './google-maps';

// Simplified UK postcode area mapping for rough distance estimates
const UK_POSTCODE_REGIONS = {
  // London
  'E': { lat: 51.5074, lng: -0.1278, region: 'London' },
  'EC': { lat: 51.5174, lng: -0.0968, region: 'London' },
  'N': { lat: 51.5674, lng: -0.1728, region: 'London' },
  'NW': { lat: 51.5474, lng: -0.2078, region: 'London' },
  'SE': { lat: 51.4774, lng: -0.0278, region: 'London' },
  'SW': { lat: 51.4774, lng: -0.1578, region: 'London' },
  'W': { lat: 51.5174, lng: -0.2278, region: 'London' },
  'WC': { lat: 51.5174, lng: -0.1278, region: 'London' },
  
  // Major cities
  'M': { lat: 53.4808, lng: -2.2426, region: 'Manchester' },
  'B': { lat: 52.4862, lng: -1.8904, region: 'Birmingham' },
  'LS': { lat: 53.8008, lng: -1.5491, region: 'Leeds' },
  'S': { lat: 53.3811, lng: -1.4701, region: 'Sheffield' },
  'L': { lat: 53.4084, lng: -2.9916, region: 'Liverpool' },
  'BS': { lat: 51.4545, lng: -2.5879, region: 'Bristol' },
  'LE': { lat: 52.6369, lng: -1.1398, region: 'Leicester' },
  'NG': { lat: 52.9548, lng: -1.1581, region: 'Nottingham' },
  
  // Scotland
  'G': { lat: 55.8642, lng: -4.2518, region: 'Glasgow' },
  'EH': { lat: 55.9533, lng: -3.1883, region: 'Edinburgh' },
  
  // Wales
  'CF': { lat: 51.4816, lng: -3.1791, region: 'Cardiff' },
  
  // Northern Ireland
  'BT': { lat: 54.5973, lng: -5.9301, region: 'Belfast' },
};

/**
 * Extract postcode area from full postcode
 */
function getPostcodeArea(postcode: string): string {
  const cleaned = postcode.trim().toUpperCase().replace(/\s/g, '');
  
  // Try two-letter codes first (EC, WC, etc.)
  const twoLetter = cleaned.substring(0, 2);
  if (UK_POSTCODE_REGIONS[twoLetter as keyof typeof UK_POSTCODE_REGIONS]) {
    return twoLetter;
  }
  
  // Try single letter
  const oneLetter = cleaned.substring(0, 1);
  if (UK_POSTCODE_REGIONS[oneLetter as keyof typeof UK_POSTCODE_REGIONS]) {
    return oneLetter;
  }
  
  return 'UNKNOWN';
}

/**
 * Calculate rough distance between two lat/lng points (Haversine formula)
 */
function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Estimate commute time based on distance and region type
 */
function estimateCommuteMinutes(distanceKm: number, originRegion: string, destRegion: string): number {
  // Base speed assumptions (km/h)
  let averageSpeed = 50; // Default for intercity travel
  
  // Adjust speed based on region types
  if (originRegion === 'London' && destRegion === 'London') {
    averageSpeed = 25; // London traffic is slower
  } else if (originRegion === 'London' || destRegion === 'London') {
    averageSpeed = 35; // One end in London
  } else if (originRegion === destRegion) {
    averageSpeed = 40; // Same city/region
  }
  
  // Add buffer time for urban areas and traffic
  const baseTimeMinutes = (distanceKm / averageSpeed) * 60;
  const bufferMultiplier = 1.3; // 30% buffer for real-world conditions
  
  return Math.round(baseTimeMinutes * bufferMultiplier);
}

/**
 * Generate fallback commute result when Google Maps API fails
 * This should ONLY be used as a last resort
 */
export function calculateFallbackCommute(
  originPostcode: string,
  destinationPostcode: string
): CommuteResult {
  console.log(`🔄 Using fallback calculator: ${originPostcode} -> ${destinationPostcode}`);
  
  const originArea = getPostcodeArea(originPostcode);
  const destArea = getPostcodeArea(destinationPostcode);
  
  const originData = UK_POSTCODE_REGIONS[originArea as keyof typeof UK_POSTCODE_REGIONS];
  const destData = UK_POSTCODE_REGIONS[destArea as keyof typeof UK_POSTCODE_REGIONS];
  
  if (!originData || !destData) {
    console.warn(`⚠️ Unknown postcode areas: ${originArea} or ${destArea}`);
    // Default to 45 minutes for unknown areas
    const minutes = 45;
    return {
      minutes,
      display: formatCommuteTime(minutes) + ' (est)',
      band: getCommuteBand(minutes),
      distance_text: 'Unknown distance',
      duration_text: `${minutes} mins (estimated)`,
    };
  }
  
  // Calculate distance
  const distanceKm = calculateDistanceKm(
    originData.lat, originData.lng,
    destData.lat, destData.lng
  );
  
  const minutes = estimateCommuteMinutes(distanceKm, originData.region, destData.region);
  
  console.log(`📊 Fallback estimate: ${originPostcode} -> ${destinationPostcode} = ${Math.round(distanceKm)}km, ${minutes}min`);
  
  return {
    minutes,
    display: formatCommuteTime(minutes) + ' (est)', // Mark as estimated
    band: getCommuteBand(minutes),
    distance_text: `~${Math.round(distanceKm)}km (estimated)`,
    duration_text: `${minutes} mins (estimated)`,
  };
}

/**
 * Enhanced commute calculation with fallback
 * First tries Google Maps API, falls back to estimation if API fails
 */
export async function calculateCommuteWithFallback(
  originPostcode: string,
  destinationPostcode: string,
  useGoogleMaps: boolean = true
): Promise<CommuteResult & { method: 'google_maps' | 'fallback_estimate' }> {
  
  if (!useGoogleMaps) {
    const result = calculateFallbackCommute(originPostcode, destinationPostcode);
    return { ...result, method: 'fallback_estimate' };
  }
  
  try {
    // Try Google Maps first
    const { calculateCommute } = await import('./google-maps');
    const result = await calculateCommute(originPostcode, destinationPostcode);
    return { ...result, method: 'google_maps' };
    
  } catch (error) {
    console.warn(`⚠️ Google Maps failed for ${originPostcode} -> ${destinationPostcode}, using fallback:`, error);
    
    // Fall back to estimation
    const result = calculateFallbackCommute(originPostcode, destinationPostcode);
    return { ...result, method: 'fallback_estimate' };
  }
}