/**
 * CV Contact Detection Service
 * Detects and extracts contact information from CV text for redaction
 * Optimized for UK dental recruitment context
 */

export interface DetectedContacts {
  emails: string[];
  phones: string[];
  addresses: string[];
  postcodes: string[];
  linkedIn: string[];
  socialMedia: string[];
  websites: string[];
  names?: string[];
  employers: string[];
  references: string[];
}

export interface DetectionResult {
  contacts: DetectedContacts;
  totalFound: number;
  confidence: number;
  rawMatches: Array<{
    type: string;
    value: string;
    position: { start: number; end: number };
  }>;
}

// UK Phone Number Patterns
const UK_PHONE_PATTERNS = [
  // Mobile: 07xxx xxx xxx or +447xxx xxx xxx
  /(?:\+44\s?7|07)\d{3}\s?\d{3}\s?\d{3}/g,
  // Mobile with dashes
  /(?:\+44\s?7|07)\d{3}[-\s]?\d{3}[-\s]?\d{3}/g,
  // Landline: 01xxx xxxxxx or 02x xxxx xxxx
  /(?:\+44\s?[12]|0[12])\d{2,4}\s?\d{3,4}\s?\d{3,4}/g,
  // Landline with area code in parentheses: (01onal) xxxxxx
  /\(0\d{2,5}\)\s?\d{5,8}/g,
  // International format: +44 (0) xxxx xxx xxx
  /\+44\s?\(0\)\s?\d{2,4}\s?\d{3,4}\s?\d{3,4}/g,
  // Generic UK phone with spaces/dashes
  /(?:tel|phone|mobile|cell|mob|contact)[\s:]*(?:\+44|0)\d[\d\s\-()]{8,15}/gi,
];

// Email Patterns
const EMAIL_PATTERNS = [
  // Standard email
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Email with mailto
  /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
  // Email with label
  /(?:email|e-mail|e\.mail)[\s:]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
];

// UK Postcode Pattern
const UK_POSTCODE_PATTERNS = [
  // Full UK postcode: AA9A 9AA, A9A 9AA, A9 9AA, A99 9AA, AA9 9AA, AA99 9AA
  /\b([A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2})\b/gi,
  // Postcode with address context
  /(?:postcode|post code|zip)[\s:]*([A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2})/gi,
];

// UK Address Patterns
const UK_ADDRESS_PATTERNS = [
  // House number + street name patterns
  /\d{1,4}\s+[A-Z][a-zA-Z\s]+(?:Street|Road|Lane|Avenue|Drive|Way|Close|Court|Gardens|Place|Terrace|Crescent|Grove|Park|Square|Mews|Hill|Rise|Row|Walk|Green|Gate|End|View|Mount)\b/gi,
  // Flat/Apartment numbers
  /(?:Flat|Apartment|Unit|Suite)\s+\d+[A-Za-z]?[,\s]+\d{1,4}\s+[A-Z][a-zA-Z\s]+(?:Street|Road|Lane|Avenue|Drive|Way|Close)/gi,
  // Full address with city
  /\d{1,4}\s+[A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/gi,
];

// LinkedIn Patterns
const LINKEDIN_PATTERNS = [
  // LinkedIn URL
  /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-]+\/?/gi,
  // LinkedIn mention
  /linkedin[\s:]*[a-zA-Z0-9\-\/\.]+/gi,
  // LinkedIn profile name
  /(?:linkedin|linked-in)[\s:]*(?:profile)?[\s:]*([a-zA-Z0-9\-]+)/gi,
];

// Other Social Media Patterns
const SOCIAL_MEDIA_PATTERNS = [
  // Twitter/X
  /(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_]+/gi,
  /(?:twitter|@)[:\s]*@?([a-zA-Z0-9_]+)/gi,
  // Facebook
  /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[a-zA-Z0-9.]+/gi,
  // Instagram
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]+/gi,
  /(?:instagram|ig)[:\s]*@?([a-zA-Z0-9_.]+)/gi,
];

// Website Patterns (personal/portfolio)
const WEBSITE_PATTERNS = [
  // URLs that aren't social media
  /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9][a-zA-Z0-9\-]*\.[a-zA-Z]{2,}(?:\/[^\s]*)?/gi,
  // Portfolio/website mentions
  /(?:website|portfolio|blog)[:\s]*((?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9][a-zA-Z0-9\-]*\.[a-zA-Z]{2,})/gi,
];

// Common name patterns (for potential redaction)
const NAME_PATTERNS = [
  // "Name: John Smith" format
  /(?:name|full name|candidate)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
];

// Employer/Surgery/Clinic name patterns
const EMPLOYER_PATTERNS = [
  // Dental practices with specific names: "Smile Dental Clinic", "Park Dental Surgery"
  /\b([A-Z][a-zA-Z\s&']+)\s+(Dental\s+)?(Surgery|Clinic|Centre|Center|Practice|Hospital|NHS Trust)\b/gi,
  // Medical centers: "Village Medical Centre", "Healthcare Clinic"
  /\b([A-Z][a-zA-Z\s&']+)\s+(Medical\s+|Health\s+|Healthcare\s+)?(Centre|Center|Clinic|Practice|Surgery|Hospital)\b/gi,
  // GP practices: "GP Village Medical Centre"
  /\bGP\s+([A-Z][a-zA-Z\s&']+)\s+(Medical\s+|Health\s+)?(Centre|Center|Clinic|Practice|Surgery)\b/gi,
  // Named hospitals: "St Mary's Hospital", "Royal London Hospital"
  /\b(St\.?\s+[A-Z][a-zA-Z']+('s)?|Royal|Queen's|King's|Princess)\s+[A-Z][a-zA-Z\s]+\s+(Hospital|Medical Centre|NHS Trust)\b/gi,
  // NHS Trust names
  /\b[A-Z][a-zA-Z\s]+\s+NHS\s+(Foundation\s+)?Trust\b/gi,
  // Private healthcare chains
  /\b(Bupa|Nuffield|Spire|HCA|BMI)\s+[A-Z][a-zA-Z\s]+\s+(Hospital|Healthcare|Clinic)?\b/gi,
  // Common dental chain names
  /\b(mydentist|Portman|Dental Beauty|Damira|Smile Dental|Rodericks|Oasis|Bupa Dental|Denplan)\s+[A-Z][a-zA-Z\s]*/gi,
];

// Reference patterns (people who can be contacted)
const REFERENCE_PATTERNS = [
  // "References: Dr. John Smith" or "Reference: Jane Doe (Manager)"
  /(?:reference|referee|referees)[\s:]+(?:available\s+)?(?:upon\s+request|on\s+request)?[\s:]*([A-Z][a-zA-Z\s.,']+)/gi,
  // Specific reference format with title
  /(?:reference|referee)[\s:]+(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Miss)\s+([A-Z][a-zA-Z\s.,']+)/gi,
  // "Contact: Name (Title)" in reference context
  /(?:contact|supervisor|manager|line\s+manager)[\s:]+([A-Z][a-zA-Z\s.,']+)(?:\s*\(|\s*-|\s*,)/gi,
];

/**
 * Detect all contact information in text
 */
export function detectContacts(text: string): DetectionResult {
  const contacts: DetectedContacts = {
    emails: [],
    phones: [],
    addresses: [],
    postcodes: [],
    linkedIn: [],
    socialMedia: [],
    websites: [],
    names: [],
    employers: [],
    references: [],
  };

  const rawMatches: Array<{
    type: string;
    value: string;
    position: { start: number; end: number };
  }> = [];

  // Detect emails
  EMAIL_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const email = match[1] || match[0];
      if (!contacts.emails.includes(email.toLowerCase())) {
        contacts.emails.push(email.toLowerCase());
        rawMatches.push({
          type: 'email',
          value: match[0],
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }
  });

  // Detect phone numbers
  UK_PHONE_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const phone = normalizePhone(match[0]);
      if (phone && !contacts.phones.includes(phone)) {
        contacts.phones.push(phone);
        rawMatches.push({
          type: 'phone',
          value: match[0],
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }
  });

  // Detect postcodes
  UK_POSTCODE_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const postcode = (match[1] || match[0]).toUpperCase().replace(/\s+/g, ' ');
      if (!contacts.postcodes.includes(postcode)) {
        contacts.postcodes.push(postcode);
        rawMatches.push({
          type: 'postcode',
          value: match[0],
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }
  });

  // Detect addresses
  UK_ADDRESS_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const address = match[0].trim();
      if (!contacts.addresses.some((a) => a.includes(address) || address.includes(a))) {
        contacts.addresses.push(address);
        rawMatches.push({
          type: 'address',
          value: match[0],
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }
  });

  // Detect LinkedIn
  LINKEDIN_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const linkedin = match[0].toLowerCase();
      if (!contacts.linkedIn.includes(linkedin)) {
        contacts.linkedIn.push(linkedin);
        rawMatches.push({
          type: 'linkedin',
          value: match[0],
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }
  });

  // Detect other social media
  SOCIAL_MEDIA_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const social = match[0].toLowerCase();
      // Exclude if it's a LinkedIn match
      if (!social.includes('linkedin') && !contacts.socialMedia.includes(social)) {
        contacts.socialMedia.push(social);
        rawMatches.push({
          type: 'social',
          value: match[0],
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }
  });

  // Detect websites (filter out social media and common domains)
  WEBSITE_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const website = (match[1] || match[0]).toLowerCase();
      const excludedDomains = [
        'linkedin.com', 'facebook.com', 'twitter.com', 'x.com',
        'instagram.com', 'youtube.com', 'tiktok.com',
        'google.com', 'microsoft.com', 'apple.com',
        'nhs.uk', 'gov.uk', 'gdc-uk.org',
      ];
      const isExcluded = excludedDomains.some((d) => website.includes(d));
      if (!isExcluded && !contacts.websites.includes(website)) {
        contacts.websites.push(website);
        rawMatches.push({
          type: 'website',
          value: match[0],
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }
  });

  // Detect names
  NAME_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const name = match[1] || match[0];
      if (name && !contacts.names?.includes(name)) {
        contacts.names?.push(name);
        rawMatches.push({
          type: 'name',
          value: match[0],
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }
  });

  // Detect employer/surgery/clinic names
  EMPLOYER_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const employer = match[0].trim();
      // Skip very short matches or generic terms
      if (employer.length < 10) return;
      // Skip duplicates
      if (!contacts.employers.some((e) => e.toLowerCase() === employer.toLowerCase())) {
        contacts.employers.push(employer);
        rawMatches.push({
          type: 'employer',
          value: match[0],
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }
  });

  // Detect references
  REFERENCE_PATTERNS.forEach((pattern) => {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const reference = (match[1] || match[0]).trim();
      // Skip "available upon request" type matches
      if (reference.toLowerCase().includes('available') || reference.toLowerCase().includes('request')) {
        continue;
      }
      if (reference.length > 3 && !contacts.references.includes(reference)) {
        contacts.references.push(reference);
        rawMatches.push({
          type: 'reference',
          value: match[0],
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }
  });

  // Calculate total found and confidence
  const totalFound =
    contacts.emails.length +
    contacts.phones.length +
    contacts.addresses.length +
    contacts.postcodes.length +
    contacts.linkedIn.length +
    contacts.socialMedia.length +
    contacts.websites.length +
    contacts.employers.length +
    contacts.references.length;

  // Confidence based on diversity of contact types found
  const typesFound = [
    contacts.emails.length > 0,
    contacts.phones.length > 0,
    contacts.addresses.length > 0 || contacts.postcodes.length > 0,
    contacts.linkedIn.length > 0 || contacts.socialMedia.length > 0,
  ].filter(Boolean).length;

  const confidence = Math.min(0.95, 0.5 + typesFound * 0.15);

  return {
    contacts,
    totalFound,
    confidence,
    rawMatches: rawMatches.sort((a, b) => a.position.start - b.position.start),
  };
}

/**
 * Normalize phone number to consistent format
 */
function normalizePhone(phone: string): string | null {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Must have at least 10 digits (UK mobile: 11 digits)
  const digitCount = cleaned.replace(/\+/g, '').length;
  if (digitCount < 10) return null;

  // Normalize +44 format
  if (cleaned.startsWith('+44')) {
    return cleaned;
  } else if (cleaned.startsWith('44') && cleaned.length >= 12) {
    return '+' + cleaned;
  } else if (cleaned.startsWith('0')) {
    return '+44' + cleaned.substring(1);
  }

  return cleaned;
}

/**
 * Check if a CV appears to contain contact information
 * Quick check without full extraction
 */
export function hasContactInfo(text: string): boolean {
  // Quick checks for common contact patterns
  const quickPatterns = [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email
    /(?:\+44|07)\d{9,10}/, // UK phone
    /linkedin\.com\/in\//, // LinkedIn
  ];

  return quickPatterns.some((pattern) => pattern.test(text));
}

/**
 * Get redaction statistics for reporting
 */
export function getRedactionStats(result: DetectionResult): {
  summary: string;
  details: Record<string, number>;
} {
  const details: Record<string, number> = {
    emails: result.contacts.emails.length,
    phones: result.contacts.phones.length,
    addresses: result.contacts.addresses.length,
    postcodes: result.contacts.postcodes.length,
    linkedIn: result.contacts.linkedIn.length,
    socialMedia: result.contacts.socialMedia.length,
    websites: result.contacts.websites.length,
    employers: result.contacts.employers.length,
    references: result.contacts.references.length,
  };

  const parts: string[] = [];
  if (details.emails) parts.push(`${details.emails} email${details.emails > 1 ? 's' : ''}`);
  if (details.phones) parts.push(`${details.phones} phone${details.phones > 1 ? 's' : ''}`);
  if (details.addresses) parts.push(`${details.addresses} address${details.addresses > 1 ? 'es' : ''}`);
  if (details.postcodes) parts.push(`${details.postcodes} postcode${details.postcodes > 1 ? 's' : ''}`);
  if (details.linkedIn) parts.push(`${details.linkedIn} LinkedIn profile${details.linkedIn > 1 ? 's' : ''}`);
  if (details.socialMedia) parts.push(`${details.socialMedia} social link${details.socialMedia > 1 ? 's' : ''}`);
  if (details.employers) parts.push(`${details.employers} employer name${details.employers > 1 ? 's' : ''}`);
  if (details.references) parts.push(`${details.references} reference${details.references > 1 ? 's' : ''}`);

  return {
    summary: parts.length > 0 ? `Found: ${parts.join(', ')}` : 'No contact information detected',
    details,
  };
}
