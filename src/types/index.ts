// Type definitions for Recruitment Matcher

export type CanonicalRole =
  | 'Dentist'
  | 'Dental Nurse'
  | 'Dental Receptionist'
  | 'Dental Hygienist'
  | 'Treatment Coordinator'
  | 'Practice Manager'
  | 'Trainee Dental Nurse';

export type CommuteBand = '🟢🟢🟢' | '🟢🟢' | '🟢' | '🟡';

export interface Candidate {
  id: string; // CAN ID (e.g., "CAN001")
  first_name?: string; // First name
  last_name?: string; // Last name
  email?: string; // Email address
  phone?: string; // Phone number
  role: string; // Normalized role
  postcode: string; // UK postcode or inferred
  salary: string; // Formatted with £ (e.g., "£15–£17")
  days: string; // Working pattern
  added_at: Date;
  notes?: string;
  experience?: string;
  travel_flexibility?: string;
}

export interface Client {
  id: string; // CL ID (e.g., "CL001")
  surgery: string; // Surgery name
  client_name?: string; // Contact person name
  client_phone?: string; // Contact phone number
  client_email?: string; // Contact email address
  role: string; // Normalized role
  postcode: string; // UK postcode
  budget?: string; // Formatted with £
  requirement?: string; // Days needed
  system?: string; // System used by surgery (e.g., "SOE", "Dentally", "R4")
  notes?: string; // Notes about the client
  added_at: Date;
}

export interface Match {
  candidate: Candidate;
  client: Client;
  commute_minutes: number; // From Google Maps API (or mock)
  commute_display: string; // e.g., "🟢🟢🟢 15m" or "🟡 1h 10m"
  commute_band: CommuteBand;
  role_match: boolean; // true if canonical roles match
  role_match_display: string; // "✅ Role Match" or "❌ Location-Only"
}

export interface RoleSynonym {
  [key: string]: CanonicalRole;
}

export interface CommuteResult {
  minutes: number;
  display: string;
  band: CommuteBand;
}
