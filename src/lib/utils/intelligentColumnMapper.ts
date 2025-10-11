/**
 * AI-Powered Intelligent Column Mapper
 *
 * Automatically detects and maps Excel columns to the correct database fields
 * using pattern recognition, fuzzy matching, and AI classification.
 */

// UK Postcode regex - comprehensive pattern
const UK_POSTCODE_REGEX = /^([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}|GIR\s?0AA)$/i;

// Phone number patterns (UK format)
const UK_PHONE_REGEX = /^(\+44\s?|0)(\d{10}|\d{4}\s?\d{6}|\d{5}\s?\d{5}|7\d{3}\s?\d{6})$/;

// Email regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Salary patterns
const SALARY_REGEX = /^£?\s*\d+(\.\d{2})?\s*[-–]\s*£?\s*\d+(\.\d{2})?|^£?\s*\d+k?$/i;

// Days patterns (Mon-Fri, Monday-Friday, 1-5, etc)
const DAYS_REGEX = /^(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+)\s*[-–]\s*(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+)$/i;

interface FieldDetectionResult {
  field: string;
  confidence: number;
  reason: string;
}

/**
 * Detect UK postcode
 */
export function isPostcode(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.trim().toUpperCase();
  return UK_POSTCODE_REGEX.test(cleaned);
}

/**
 * Detect UK phone number
 */
export function isPhoneNumber(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.replace(/\s/g, '');
  return UK_PHONE_REGEX.test(cleaned);
}

/**
 * Detect email address
 */
export function isEmail(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  return EMAIL_REGEX.test(value.trim());
}

/**
 * Detect salary format
 */
export function isSalary(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  return SALARY_REGEX.test(value.trim());
}

/**
 * Detect days format
 */
export function isDays(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  return DAYS_REGEX.test(value.trim());
}

/**
 * Detect if value is a name (simple heuristic)
 */
export function isName(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.trim();
  // Name should be 2-50 characters, only letters, spaces, hyphens, apostrophes
  return /^[A-Za-z\s\-']{2,50}$/.test(cleaned);
}

/**
 * Detect role/job title keywords
 */
const ROLE_KEYWORDS = [
  'dentist', 'nurse', 'receptionist', 'hygienist', 'coordinator',
  'manager', 'trainee', 'dt', 'dn', 'tdn', 'pm', 'tco'
];

export function isRole(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.toLowerCase().trim();
  return ROLE_KEYWORDS.some(keyword => cleaned.includes(keyword));
}

/**
 * Fuzzy match column header to field name
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  'postcode': ['postcode', 'post code', 'postal code', 'zip', 'pc', 'location', 'address'],
  'phone': ['phone', 'telephone', 'tel', 'mobile', 'cell', 'number'],
  'email': ['email', 'e-mail', 'mail', 'email address'],
  'first_name': ['first name', 'firstname', 'fname', 'given name', 'forename'],
  'last_name': ['last name', 'lastname', 'surname', 'family name', 'lname'],
  'role': ['role', 'position', 'job', 'job title', 'title'],
  'salary': ['salary', 'pay', 'wage', 'compensation', 'rate', 'budget'],
  'days': ['days', 'availability', 'schedule', 'hours', 'working days'],
  'experience': ['experience', 'exp', 'years', 'background'],
  'notes': ['notes', 'comments', 'remarks', 'additional info', 'info'],
  'client_name': ['contact name', 'client name', 'contact person', 'contact'],
  'client_phone': ['contact phone', 'client phone', 'contact tel', 'contact number'],
  'client_email': ['contact email', 'client email', 'contact e-mail'],
  'surgery': ['surgery', 'practice', 'clinic', 'surgery name', 'practice name'],
  'budget': ['budget', 'pay', 'rate', 'daily rate'],
  'requirement': ['requirement', 'requirements', 'needed', 'days needed'],
  'system': ['system', 'software', 'pms', 'practice management'],
};

export function fuzzyMatchColumnName(columnName: string): string | null {
  if (!columnName) return null;

  const cleaned = columnName.toLowerCase().trim();

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some(alias => cleaned.includes(alias) || alias.includes(cleaned))) {
      return field;
    }
  }

  return null;
}

/**
 * Intelligently detect what field a value belongs to
 */
export function detectFieldFromValue(value: string, columnName?: string): FieldDetectionResult {
  if (!value || typeof value !== 'string') {
    return { field: 'unknown', confidence: 0, reason: 'Empty or invalid value' };
  }

  const trimmed = value.trim();

  // First priority: Check column name if provided
  if (columnName) {
    const matchedField = fuzzyMatchColumnName(columnName);
    if (matchedField) {
      return {
        field: matchedField,
        confidence: 0.9,
        reason: `Column header matched: "${columnName}" → ${matchedField}`
      };
    }
  }

  // Second priority: Pattern detection (high confidence)
  if (isPostcode(trimmed)) {
    return { field: 'postcode', confidence: 0.95, reason: 'UK postcode pattern detected' };
  }

  if (isEmail(trimmed)) {
    return { field: 'email', confidence: 0.95, reason: 'Email format detected' };
  }

  if (isPhoneNumber(trimmed)) {
    return { field: 'phone', confidence: 0.90, reason: 'UK phone number pattern detected' };
  }

  if (isSalary(trimmed)) {
    return { field: 'salary', confidence: 0.85, reason: 'Salary format detected' };
  }

  if (isDays(trimmed)) {
    return { field: 'days', confidence: 0.80, reason: 'Days pattern detected' };
  }

  if (isRole(trimmed)) {
    return { field: 'role', confidence: 0.75, reason: 'Role keywords detected' };
  }

  if (isName(trimmed) && trimmed.split(' ').length === 1) {
    return { field: 'first_name', confidence: 0.60, reason: 'Single word name detected' };
  }

  // Low confidence - could be notes or experience
  if (trimmed.length > 100) {
    return { field: 'notes', confidence: 0.50, reason: 'Long text, likely notes' };
  }

  // Default to notes for unknown data
  return { field: 'notes', confidence: 0.30, reason: 'Unrecognized format, defaulting to notes' };
}

/**
 * Intelligently map a row of Excel data to candidate/client fields
 */
export interface MappedCandidate {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  postcode?: string;
  salary?: string;
  days?: string;
  experience?: string;
  notes?: string;
  // Client-specific fields
  surgery?: string;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  budget?: string;
  requirement?: string;
  system?: string;
  unmappedData?: string[]; // Extra data that couldn't be mapped
}

export function intelligentlyMapRow(row: any): MappedCandidate {
  const mapped: MappedCandidate = {};
  const unmapped: string[] = [];
  const usedValues = new Set<string>();

  // Track what we've already mapped to avoid duplicates
  const fieldAssignments: Record<string, string> = {};

  // Process each column in the row
  for (const [columnName, value] of Object.entries(row)) {
    if (!value || String(value).trim() === '') continue;

    const valueStr = String(value).trim();

    // Skip if we've already used this exact value
    if (usedValues.has(valueStr)) continue;

    // Detect what field this belongs to
    const detection = detectFieldFromValue(valueStr, columnName);

    console.log(`🔍 Column "${columnName}" with value "${valueStr}" → Detected as: ${detection.field} (confidence: ${detection.confidence}, reason: ${detection.reason})`);

    // Only assign if confidence is reasonable and field not already assigned
    if (detection.confidence >= 0.6 && !fieldAssignments[detection.field]) {
      fieldAssignments[detection.field] = valueStr;
      usedValues.add(valueStr);
    } else if (detection.confidence < 0.6) {
      // Low confidence - add to unmapped
      unmapped.push(`${columnName}: ${valueStr}`);
    } else {
      // Field already assigned - add to unmapped
      unmapped.push(`${columnName} (duplicate ${detection.field}): ${valueStr}`);
    }
  }

  // Assign detected fields (candidates)
  mapped.id = fieldAssignments['id'];
  mapped.first_name = fieldAssignments['first_name'];
  mapped.last_name = fieldAssignments['last_name'];
  mapped.email = fieldAssignments['email'];
  mapped.phone = fieldAssignments['phone'];
  mapped.role = fieldAssignments['role'];
  mapped.postcode = fieldAssignments['postcode'];
  mapped.salary = fieldAssignments['salary'];
  mapped.days = fieldAssignments['days'];
  mapped.experience = fieldAssignments['experience'];
  mapped.notes = fieldAssignments['notes'];

  // Assign client-specific fields
  mapped.surgery = fieldAssignments['surgery'];
  mapped.client_name = fieldAssignments['client_name'];
  mapped.client_phone = fieldAssignments['client_phone'];
  mapped.client_email = fieldAssignments['client_email'];
  mapped.budget = fieldAssignments['budget'];
  mapped.requirement = fieldAssignments['requirement'];
  mapped.system = fieldAssignments['system'];

  // Combine unmapped data into notes
  if (unmapped.length > 0) {
    const unmappedText = unmapped.join(' | ');
    if (mapped.notes) {
      mapped.notes = `${mapped.notes}\n\n[Auto-detected data]: ${unmappedText}`;
    } else {
      mapped.notes = `[Auto-detected data]: ${unmappedText}`;
    }
  }

  mapped.unmappedData = unmapped;

  return mapped;
}
