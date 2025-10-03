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
 * Check if two roles match (after normalization)
 */
export function rolesMatch(role1: string, role2: string): boolean {
  const normalized1 = normalizeRole(role1);
  const normalized2 = normalizeRole(role2);
  
  // Only match if both are canonical roles and equal
  return CANONICAL_ROLES.includes(normalized1 as CanonicalRole) &&
         CANONICAL_ROLES.includes(normalized2 as CanonicalRole) &&
         normalized1 === normalized2;
}
