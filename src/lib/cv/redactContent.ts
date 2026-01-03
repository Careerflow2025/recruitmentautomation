/**
 * CV Content Redaction Service
 * Redacts contact information from CV content while preserving professional formatting
 */

import { DetectionResult, DetectedContacts, detectContacts } from './detectContacts';

export interface RedactionConfig {
  redactEmails: boolean;
  redactPhones: boolean;
  redactAddresses: boolean;
  redactPostcodes: boolean;
  redactLinkedIn: boolean;
  redactSocialMedia: boolean;
  redactWebsites: boolean;
  redactNames: boolean;
  redactEmployers: boolean;
  redactReferences: boolean;
  placeholder: string;
  anonymousReference?: string;
}

export interface RedactedCV {
  originalText: string;
  redactedText: string;
  detectionResult: DetectionResult;
  redactionCount: number;
  redactionLog: Array<{
    type: string;
    original: string;
    replacement: string;
    position: { start: number; end: number };
  }>;
  anonymousReference: string;
  redactedAt: string;
}

export interface RedactedContent {
  candidateReference: string;
  role: string;
  generalArea: string;
  summary: string;
  skills: string[];
  experience: Array<{
    title: string;
    company: string;
    duration: string;
    description: string;
  }>;
  education: Array<{
    qualification: string;
    institution: string;
    year: string;
  }>;
  qualifications: string[];
}

// Default configuration
const DEFAULT_CONFIG: RedactionConfig = {
  redactEmails: true,
  redactPhones: true,
  redactAddresses: true,
  redactPostcodes: true,
  redactLinkedIn: true,
  redactSocialMedia: true,
  redactWebsites: true,
  redactNames: false, // Names usually kept for context
  redactEmployers: true, // Anonymize surgery/clinic names
  redactReferences: true, // Remove reference contact details
  placeholder: '[Contact details available upon successful placement]',
  anonymousReference: undefined,
};

/**
 * Generate anonymous candidate reference
 */
export function generateAnonymousReference(): string {
  const prefix = 'DN'; // Dental
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${year}-${random}`;
}

/**
 * Redact contact information from CV text
 */
export function redactCV(
  text: string,
  config: Partial<RedactionConfig> = {}
): RedactedCV {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const anonymousRef = fullConfig.anonymousReference || generateAnonymousReference();

  // Detect all contacts
  const detectionResult = detectContacts(text);
  const { contacts, rawMatches } = detectionResult;

  let redactedText = text;
  const redactionLog: RedactedCV['redactionLog'] = [];
  let offset = 0;

  // Sort matches by position to redact from end to start (preserves positions)
  const sortedMatches = [...rawMatches].sort((a, b) => b.position.start - a.position.start);

  for (const match of sortedMatches) {
    // Check if this type should be redacted
    const shouldRedact = shouldRedactType(match.type, fullConfig);
    if (!shouldRedact) continue;

    const replacement = getReplacementText(match.type, fullConfig.placeholder, match.value);

    // Calculate actual position with offset
    const start = match.position.start;
    const end = match.position.end;

    // Perform the redaction
    redactedText =
      redactedText.substring(0, start) +
      replacement +
      redactedText.substring(end);

    redactionLog.push({
      type: match.type,
      original: match.value,
      replacement,
      position: { start, end },
    });
  }

  // Additional cleanup: remove multiple consecutive placeholder occurrences
  const placeholderEscaped = fullConfig.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const consecutivePlaceholderPattern = new RegExp(
    `(${placeholderEscaped}[\\s,;]*)+`,
    'g'
  );
  redactedText = redactedText.replace(consecutivePlaceholderPattern, fullConfig.placeholder + '\n');

  // Clean up empty lines and excessive whitespace
  redactedText = cleanupText(redactedText);

  return {
    originalText: text,
    redactedText,
    detectionResult,
    redactionCount: redactionLog.length,
    redactionLog,
    anonymousReference: anonymousRef,
    redactedAt: new Date().toISOString(),
  };
}

/**
 * Check if a type should be redacted based on config
 */
function shouldRedactType(type: string, config: RedactionConfig): boolean {
  switch (type) {
    case 'email':
      return config.redactEmails;
    case 'phone':
      return config.redactPhones;
    case 'address':
      return config.redactAddresses;
    case 'postcode':
      return config.redactPostcodes;
    case 'linkedin':
      return config.redactLinkedIn;
    case 'social':
      return config.redactSocialMedia;
    case 'website':
      return config.redactWebsites;
    case 'name':
      return config.redactNames;
    case 'employer':
      return config.redactEmployers;
    case 'reference':
      return config.redactReferences;
    default:
      return true;
  }
}

/**
 * Get appropriate replacement text for each type
 */
function getReplacementText(type: string, defaultPlaceholder: string, originalValue?: string): string {
  switch (type) {
    case 'email':
      return '[Email available upon placement]';
    case 'phone':
      return '[Phone available upon placement]';
    case 'address':
      return '[Address available upon placement]';
    case 'postcode':
      return '[Area: Available upon request]';
    case 'linkedin':
      return '[LinkedIn profile available upon request]';
    case 'social':
      return '[Social media available upon request]';
    case 'website':
      return '[Portfolio available upon request]';
    case 'employer':
      return anonymizeEmployerName(originalValue || '');
    case 'reference':
      return '[References available upon request]';
    default:
      return defaultPlaceholder;
  }
}

/**
 * Anonymize employer/surgery/clinic name while preserving type and location context
 * Example: "GP Village Medical Centre in London" → "GP Practice in London"
 * Example: "Smile Dental Clinic Croydon" → "Dental Practice in Croydon"
 */
function anonymizeEmployerName(original: string): string {
  if (!original) return '[Healthcare Practice]';

  const text = original.trim();

  // Extract location if present (common UK cities/areas)
  const locationPatterns = [
    /\b(London|Manchester|Birmingham|Leeds|Liverpool|Bristol|Glasgow|Edinburgh|Cardiff|Belfast|Sheffield|Newcastle|Nottingham|Leicester|Brighton|Cambridge|Oxford|Croydon|Bromley|Sutton|Greenwich|Lewisham|Hackney|Islington|Camden|Westminster|Kensington|Chelsea|Hammersmith|Fulham|Wandsworth|Lambeth|Southwark|Tower Hamlets|Newham|Barking|Dagenham|Redbridge|Havering|Bexley|Enfield|Barnet|Haringey|Waltham Forest|Ealing|Hounslow|Richmond|Kingston|Merton|Harrow|Hillingdon|Brent)\b/gi,
  ];

  let location = '';
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) {
      location = match[0];
      break;
    }
  }

  // Determine the type of facility
  let facilityType = 'Healthcare Practice';

  if (/dental/i.test(text)) {
    facilityType = 'Dental Practice';
  } else if (/GP|general\s+practitioner/i.test(text)) {
    facilityType = 'GP Practice';
  } else if (/hospital/i.test(text)) {
    facilityType = 'Hospital';
  } else if (/NHS\s+Trust/i.test(text)) {
    facilityType = 'NHS Trust';
  } else if (/medical\s+centre|medical\s+center/i.test(text)) {
    facilityType = 'Medical Centre';
  } else if (/clinic/i.test(text)) {
    facilityType = 'Medical Clinic';
  } else if (/surgery/i.test(text)) {
    facilityType = 'Surgery';
  } else if (/health\s*care|healthcare/i.test(text)) {
    facilityType = 'Healthcare Provider';
  }

  // Return anonymized version with location if available
  if (location) {
    return `${facilityType} in ${location}`;
  }

  return facilityType;
}

/**
 * Clean up text after redaction
 */
function cleanupText(text: string): string {
  return text
    // Remove multiple consecutive blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Remove lines that only contain whitespace
    .replace(/^\s+$/gm, '')
    // Trim leading/trailing whitespace
    .trim();
}

/**
 * Create a structured redacted content object for professional formatting
 */
export function createRedactedContent(
  parsedCV: {
    full_name?: string;
    role?: string;
    location?: string;
    summary?: string;
    skills?: string[];
    experience?: Array<{
      job_title?: string;
      company?: string;
      dates?: string;
      description?: string;
    }>;
    education?: Array<{
      degree?: string;
      institution?: string;
      year?: string;
    }>;
    qualifications?: string[];
  },
  anonymousReference: string
): RedactedContent {
  // Generalize location to just the area
  const generalArea = generalizeLocation(parsedCV.location || '');

  return {
    candidateReference: anonymousReference,
    role: parsedCV.role || 'Dental Professional',
    generalArea,
    summary: parsedCV.summary || 'Experienced dental professional seeking new opportunities.',
    skills: parsedCV.skills || [],
    experience: (parsedCV.experience || []).map((exp) => ({
      title: exp.job_title || 'Dental Professional',
      company: anonymizeCompany(exp.company || ''),
      duration: exp.dates || '',
      description: exp.description || '',
    })),
    education: (parsedCV.education || []).map((edu) => ({
      qualification: edu.degree || '',
      institution: anonymizeInstitution(edu.institution || ''),
      year: edu.year || '',
    })),
    qualifications: parsedCV.qualifications || [],
  };
}

/**
 * Generalize location to just the area (e.g., "SW1A 1AA" -> "Central London")
 */
function generalizeLocation(location: string): string {
  if (!location) return 'UK';

  // UK Postcode area mappings
  const areaMap: Record<string, string> = {
    'SW': 'South West London',
    'SE': 'South East London',
    'NW': 'North West London',
    'NE': 'North East London',
    'N': 'North London',
    'S': 'South London',
    'E': 'East London',
    'W': 'West London',
    'EC': 'Central London',
    'WC': 'Central London',
    'BR': 'Bromley area',
    'CR': 'Croydon area',
    'DA': 'Dartford area',
    'EN': 'Enfield area',
    'HA': 'Harrow area',
    'IG': 'Ilford area',
    'KT': 'Kingston area',
    'RM': 'Romford area',
    'SM': 'Sutton area',
    'TW': 'Twickenham area',
    'UB': 'Uxbridge area',
    'WD': 'Watford area',
    'B': 'Birmingham area',
    'M': 'Manchester area',
    'L': 'Liverpool area',
    'LS': 'Leeds area',
    'S': 'Sheffield area',
    'BS': 'Bristol area',
    'G': 'Glasgow area',
    'EH': 'Edinburgh area',
    'CF': 'Cardiff area',
    'BT': 'Belfast area',
  };

  // Try to extract postcode prefix
  const postcodeMatch = location.match(/^([A-Z]{1,2})\d/i);
  if (postcodeMatch) {
    const prefix = postcodeMatch[1].toUpperCase();
    if (areaMap[prefix]) {
      return areaMap[prefix];
    }
  }

  // If it's already a general area name, use it
  if (location.toLowerCase().includes('london')) return 'London area';
  if (location.toLowerCase().includes('manchester')) return 'Manchester area';
  if (location.toLowerCase().includes('birmingham')) return 'Birmingham area';

  // Default: just say "UK" to be safe
  return 'UK';
}

/**
 * Anonymize company names in structured content
 * Uses the same logic as employer name anonymization
 */
function anonymizeCompany(company: string): string {
  if (!company || company.trim() === '') return 'Healthcare Provider';
  return anonymizeEmployerName(company);
}

/**
 * Anonymize institution names (keep major ones, anonymize small ones)
 */
function anonymizeInstitution(institution: string): string {
  // Keep major dental schools/universities as they're relevant qualifications
  const majorInstitutions = [
    'King\'s College', 'UCL', 'Manchester', 'Birmingham', 'Bristol',
    'Leeds', 'Newcastle', 'Sheffield', 'Glasgow', 'Edinburgh', 'Cardiff',
    'Queen Mary', 'Peninsula', 'Plymouth', 'Aberdeen',
  ];

  for (const major of majorInstitutions) {
    if (institution.toLowerCase().includes(major.toLowerCase())) {
      return institution; // Keep major institutions
    }
  }

  // For unknown institutions, generalize
  if (institution.toLowerCase().includes('university')) {
    return 'UK University';
  }
  if (institution.toLowerCase().includes('college')) {
    return 'UK College';
  }

  return institution;
}

/**
 * Generate a redaction summary for logging
 */
export function generateRedactionSummary(result: RedactedCV): string {
  const { redactionCount, redactionLog } = result;

  if (redactionCount === 0) {
    return 'No contact information was redacted.';
  }

  const typeCounts: Record<string, number> = {};
  for (const entry of redactionLog) {
    typeCounts[entry.type] = (typeCounts[entry.type] || 0) + 1;
  }

  const parts: string[] = [];
  if (typeCounts.email) parts.push(`${typeCounts.email} email(s)`);
  if (typeCounts.phone) parts.push(`${typeCounts.phone} phone number(s)`);
  if (typeCounts.address) parts.push(`${typeCounts.address} address(es)`);
  if (typeCounts.postcode) parts.push(`${typeCounts.postcode} postcode(s)`);
  if (typeCounts.linkedin) parts.push(`${typeCounts.linkedin} LinkedIn profile(s)`);
  if (typeCounts.social) parts.push(`${typeCounts.social} social media link(s)`);
  if (typeCounts.website) parts.push(`${typeCounts.website} website(s)`);
  if (typeCounts.employer) parts.push(`${typeCounts.employer} employer name(s)`);
  if (typeCounts.reference) parts.push(`${typeCounts.reference} reference(s)`);

  return `Redacted ${redactionCount} item(s): ${parts.join(', ')}.`;
}
