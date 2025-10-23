/**
 * Candidate Helper Utilities
 * - Email parsing for auto-name extraction
 * - Duplicate candidate detection
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Parse email address to extract potential first and last name
 * Examples:
 * - john.smith@email.com → { firstName: "John", lastName: "Smith" }
 * - jane_doe@company.co.uk → { firstName: "Jane", lastName: "Doe" }
 * - bob.jones123@test.com → { firstName: "Bob", lastName: "Jones" }
 */
export function parseNameFromEmail(email: string): { firstName: string; lastName: string } | null {
  if (!email || !email.includes('@')) {
    return null;
  }

  // Get the part before @
  const localPart = email.split('@')[0];

  // Remove numbers and special characters except dots, underscores, hyphens
  const cleaned = localPart.replace(/[0-9]/g, '').replace(/[^a-zA-Z._-]/g, '');

  // Split by common separators (dot, underscore, hyphen)
  const parts = cleaned.split(/[._-]+/).filter(part => part.length > 0);

  if (parts.length === 0) {
    return null;
  }

  // Capitalize first letter of each part
  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  if (parts.length === 1) {
    // Only one part - use as first name
    return {
      firstName: capitalize(parts[0]),
      lastName: ''
    };
  }

  // Two or more parts - first is firstName, last is lastName
  return {
    firstName: capitalize(parts[0]),
    lastName: capitalize(parts[parts.length - 1])
  };
}

/**
 * Check if a candidate might be a duplicate based on:
 * - Email (exact match)
 * - Phone (exact match)
 * - Name + Postcode (similar match)
 */
export async function findDuplicateCandidates(
  candidate: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    postcode?: string;
  },
  userId: string,
  excludeId?: string // Exclude this ID when checking (for edits)
): Promise<Array<{
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  postcode: string;
  matchReason: 'email' | 'phone' | 'name_postcode';
}>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const duplicates: Array<any> = [];

  // Check email match
  if (candidate.email && candidate.email.trim()) {
    const { data: emailMatches } = await supabase
      .from('candidates')
      .select('id, first_name, last_name, email, phone, postcode')
      .eq('user_id', userId)
      .ilike('email', candidate.email.trim())
      .neq('id', excludeId || '____never_match____');

    if (emailMatches && emailMatches.length > 0) {
      emailMatches.forEach(match => {
        duplicates.push({ ...match, matchReason: 'email' });
      });
    }
  }

  // Check phone match
  if (candidate.phone && candidate.phone.trim()) {
    // Normalize phone: remove spaces, dashes, parentheses
    const normalizedPhone = candidate.phone.replace(/[\s\-()]/g, '');

    const { data: phoneMatches } = await supabase
      .from('candidates')
      .select('id, first_name, last_name, email, phone, postcode')
      .eq('user_id', userId)
      .neq('id', excludeId || '____never_match____');

    if (phoneMatches && phoneMatches.length > 0) {
      phoneMatches.forEach(match => {
        if (match.phone) {
          const matchPhone = match.phone.replace(/[\s\-()]/g, '');
          if (matchPhone === normalizedPhone) {
            // Check if not already added
            if (!duplicates.find(d => d.id === match.id)) {
              duplicates.push({ ...match, matchReason: 'phone' });
            }
          }
        }
      });
    }
  }

  // Check name + postcode match
  if (
    candidate.first_name && candidate.first_name.trim() &&
    candidate.last_name && candidate.last_name.trim() &&
    candidate.postcode && candidate.postcode.trim()
  ) {
    const { data: nameMatches } = await supabase
      .from('candidates')
      .select('id, first_name, last_name, email, phone, postcode')
      .eq('user_id', userId)
      .ilike('first_name', candidate.first_name.trim())
      .ilike('last_name', candidate.last_name.trim())
      .ilike('postcode', `${candidate.postcode.trim().split(' ')[0]}%`) // Match postcode area
      .neq('id', excludeId || '____never_match____');

    if (nameMatches && nameMatches.length > 0) {
      nameMatches.forEach(match => {
        // Check if not already added
        if (!duplicates.find(d => d.id === match.id)) {
          duplicates.push({ ...match, matchReason: 'name_postcode' });
        }
      });
    }
  }

  return duplicates;
}

/**
 * Format duplicate match reason for display
 */
export function getDuplicateReasonText(reason: 'email' | 'phone' | 'name_postcode'): string {
  switch (reason) {
    case 'email':
      return 'Same email address';
    case 'phone':
      return 'Same phone number';
    case 'name_postcode':
      return 'Same name and postcode area';
    default:
      return 'Similar candidate';
  }
}

/**
 * Check if email looks valid (basic check)
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
