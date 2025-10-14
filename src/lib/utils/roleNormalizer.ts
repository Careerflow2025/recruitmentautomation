import { CanonicalRole, RoleSynonym } from '@/types';

// @CRITICAL - Role normalization logic following matching_json_final.json spec
const ROLE_SYNONYMS: RoleSynonym = {
  // Dentist variants
  'dt': 'Dentist',
  'dds': 'Dentist',
  'bds': 'Dentist',
  'dentist': 'Dentist',
  
  // Dental Nurse variants
  'nurse': 'Dental Nurse',
  'dn': 'Dental Nurse',
  'd n': 'Dental Nurse',
  'd.n.': 'Dental Nurse',
  'dental nurse': 'Dental Nurse',
  
  // Dental Receptionist variants
  'receptionist': 'Dental Receptionist',
  'front desk': 'Dental Receptionist',
  'reception': 'Dental Receptionist',
  'foh': 'Dental Receptionist',
  'rcp': 'Dental Receptionist',
  'rcpn': 'Dental Receptionist',
  'dental receptionist': 'Dental Receptionist',
  
  // Dental Hygienist variants
  'hygienist': 'Dental Hygienist',
  'dental hygienist': 'Dental Hygienist',
  
  // Treatment Coordinator variants
  'tco': 'Treatment Coordinator',
  'tc': 'Treatment Coordinator',
  'treatment coordinator': 'Treatment Coordinator',
  
  // Practice Manager variants
  'pm': 'Practice Manager',
  'mgr': 'Practice Manager',
  'manager': 'Practice Manager',
  'practice manager': 'Practice Manager',
  
  // Trainee Dental Nurse variants
  'trainee dn': 'Trainee Dental Nurse',
  'tdn': 'Trainee Dental Nurse',
  'trainee dental nurse': 'Trainee Dental Nurse',
};

export const CANONICAL_ROLES: CanonicalRole[] = [
  'Dentist',
  'Dental Nurse',
  'Dental Receptionist',
  'Dental Hygienist',
  'Treatment Coordinator',
  'Practice Manager',
  'Trainee Dental Nurse',
];

/**
 * Normalize a role string to canonical role
 * @param roleInput - Raw role input from user
 * @returns Normalized canonical role or original input if no match
 */
export function normalizeRole(roleInput: string): string {
  if (!roleInput) return '';
  
  // Clean input: lowercase, trim, remove extra spaces
  const cleaned = roleInput.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Direct match in synonyms map
  if (ROLE_SYNONYMS[cleaned]) {
    return ROLE_SYNONYMS[cleaned];
  }
  
  // Try to find longest matching keyword
  let longestMatch: CanonicalRole | null = null;
  let longestLength = 0;
  
  for (const [synonym, canonical] of Object.entries(ROLE_SYNONYMS)) {
    if (cleaned.includes(synonym) && synonym.length > longestLength) {
      longestMatch = canonical;
      longestLength = synonym.length;
    }
  }
  
  if (longestMatch) {
    return longestMatch;
  }
  
  // Return original input if no match (will show as ❌ Location-Only)
  return roleInput;
}

/**
 * Split multi-role string into array of individual roles
 * Handles formats like "Dental Nurse/ANP/PN", "Dental Nurse / ANP / PN", "DentalNurse/ANP/PN"
 *
 * @param roleInput - Raw role string that may contain multiple roles separated by "/"
 * @returns Array of individual role strings (trimmed)
 *
 * @example
 * splitMultiRole("Dental Nurse/ANP/PN") → ["Dental Nurse", "ANP", "PN"]
 * splitMultiRole("Dental Nurse / ANP / PN") → ["Dental Nurse", "ANP", "PN"]
 * splitMultiRole("Dental Nurse") → ["Dental Nurse"]
 */
export function splitMultiRole(roleInput: string): string[] {
  if (!roleInput || roleInput.trim() === '') {
    return [];
  }

  // Split by "/" and trim each role
  // Handle flexible spacing: " / ", "/", " /", "/ "
  return roleInput
    .split('/')
    .map(role => role.trim())
    .filter(role => role.length > 0); // Remove empty strings
}

/**
 * Check if two roles match (after normalization)
 * Now supports multi-role candidates: if role1 contains multiple roles (e.g., "Dental Nurse/ANP/PN"),
 * it matches if ANY of those roles match role2
 *
 * @param role1 - Candidate role (may be multi-role like "Dental Nurse/ANP/PN")
 * @param role2 - Client role (single role)
 * @returns true if any candidate role matches the client role
 *
 * @example
 * rolesMatch("Dental Nurse/ANP/PN", "Dental Nurse") → true
 * rolesMatch("Dental Nurse/ANP/PN", "ANP") → true
 * rolesMatch("Dental Nurse/ANP/PN", "Practice Manager") → false
 */
export function rolesMatch(role1: string, role2: string): boolean {
  // Split role1 into individual roles (handles multi-role format)
  const candidateRoles = splitMultiRole(role1);

  // Normalize the client role
  const normalizedRole2 = normalizeRole(role2);

  // Check if ANY candidate role matches the client role
  for (const candidateRole of candidateRoles) {
    const normalizedRole1 = normalizeRole(candidateRole);

    // Match if both are canonical roles and equal
    const isMatch = CANONICAL_ROLES.includes(normalizedRole1 as CanonicalRole) &&
                   CANONICAL_ROLES.includes(normalizedRole2 as CanonicalRole) &&
                   normalizedRole1 === normalizedRole2;

    if (isMatch) {
      return true; // Match found, no need to check other roles
    }
  }

  return false; // No match found
}
