import { Match, Candidate, Client } from '@/types';
import { mockCandidates } from './candidates';
import { mockClients } from './clients';
import { normalizeRole, rolesMatch } from '../utils/roleNormalizer';
import { calculateCommute } from '../utils/commuteCalculator';

/**
 * @CRITICAL - THREE STRICT RULES ENFORCED HERE
 * RULE 1: Sort by commute time ascending
 * RULE 2: Exclude matches >80 minutes
 * RULE 3: Use Google Maps API (mocked in Phase 1)
 */

/**
 * Generate all possible matches between candidates and clients
 * Filters and sorts according to THREE STRICT RULES
 */
export function generateMatches(): Match[] {
  const matches: Match[] = [];
  
  // Generate all candidate × client combinations
  for (const candidate of mockCandidates) {
    for (const client of mockClients) {
      // Calculate commute time (MOCK in Phase 1, Google Maps in Phase 2)
      const commuteResult = calculateCommute(candidate.postcode, client.postcode);
      
      // RULE 2: Exclude if >80 minutes or calculation failed
      if (!commuteResult) {
        continue;
      }
      
      // Normalize roles
      const candidateRole = normalizeRole(candidate.role);
      const clientRole = normalizeRole(client.role);
      
      // Check if roles match
      const roleMatch = rolesMatch(candidate.role, client.role);
      
      matches.push({
        candidate,
        client,
        commute_minutes: commuteResult.minutes,
        commute_display: commuteResult.display,
        commute_band: commuteResult.band,
        role_match: roleMatch,
        role_match_display: roleMatch ? '✅ Role Match' : '❌ Location-Only',
      });
    }
  }
  
  // RULE 1: Sort by commute time ascending (PRIMARY)
  // Then by role match (✅ before ❌ for same time)
  // Then by IDs for ties
  matches.sort((a, b) => {
    // PRIMARY: Commute time ascending
    if (a.commute_minutes !== b.commute_minutes) {
      return a.commute_minutes - b.commute_minutes;
    }
    
    // SECONDARY: Role match (true before false)
    if (a.role_match !== b.role_match) {
      return a.role_match ? -1 : 1;
    }
    
    // TERTIARY: Candidate ID
    if (a.candidate.id !== b.candidate.id) {
      return a.candidate.id.localeCompare(b.candidate.id);
    }
    
    // QUATERNARY: Client ID
    return a.client.id.localeCompare(b.client.id);
  });
  
  return matches;
}

/**
 * Get matches with optional filters
 */
export function getFilteredMatches(options?: {
  roleMatchOnly?: boolean;
  maxMinutes?: number;
  role?: string;
}): Match[] {
  let matches = generateMatches();
  
  if (options?.roleMatchOnly) {
    matches = matches.filter(m => m.role_match);
  }
  
  if (options?.maxMinutes) {
    matches = matches.filter(m => m.commute_minutes <= options.maxMinutes);
  }
  
  if (options?.role) {
    const normalizedFilter = normalizeRole(options.role);
    matches = matches.filter(m => 
      normalizeRole(m.candidate.role) === normalizedFilter ||
      normalizeRole(m.client.role) === normalizedFilter
    );
  }
  
  return matches;
}

/**
 * Get match statistics
 */
export function getMatchStats() {
  const allMatches = generateMatches();
  const roleMatches = allMatches.filter(m => m.role_match);
  const under20 = allMatches.filter(m => m.commute_minutes <= 20);
  const under40 = allMatches.filter(m => m.commute_minutes <= 40);
  
  return {
    total: allMatches.length,
    roleMatches: roleMatches.length,
    locationOnly: allMatches.length - roleMatches.length,
    under20Minutes: under20.length,
    under40Minutes: under40.length,
  };
}
