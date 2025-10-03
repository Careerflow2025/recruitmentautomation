/**
 * Postcode inference for UK areas
 * Maps area names to central postcodes
 */

const AREA_TO_POSTCODE: Record<string, string> = {
  // London areas
  'croydon': 'CR0 1PB',
  'bromley': 'BR1 1AA',
  'lewisham': 'SE13 5AB',
  'greenwich': 'SE10 8EW',
  'kingston': 'KT1 1AA',
  'sutton': 'SM1 1AA',
  'wimbledon': 'SW19 1AA',
  'clapham': 'SW4 7AA',
  'brixton': 'SW2 1AA',
  'shoreditch': 'E1 6AA',
  'hackney': 'E8 1AA',
  'islington': 'N1 0AA',
  'camden': 'NW1 0AA',
  'westminster': 'SW1A 0AA',
  'kensington': 'W8 4AA',
  'chelsea': 'SW3 1AA',
  
  // Other major cities
  'manchester': 'M1 1AA',
  'birmingham': 'B1 1AA',
  'liverpool': 'L1 0AA',
  'leeds': 'LS1 1AA',
  'sheffield': 'S1 1AA',
  'bristol': 'BS1 1AA',
  'nottingham': 'NG1 1AA',
  'newcastle': 'NE1 1AA',
  'cardiff': 'CF10 1AA',
  'edinburgh': 'EH1 1AA',
  'glasgow': 'G1 1AA',
  'oxford': 'OX1 1AA',
  'cambridge': 'CB1 1AA',
  'brighton': 'BN1 1AA',
  'reading': 'RG1 1AA',
  'southampton': 'SO14 0AA',
};

/**
 * Infer postcode from area name or return input if already valid postcode
 * @param input - Area name or postcode
 * @returns Inferred or validated postcode
 */
export function inferPostcode(input: string): string {
  if (!input) return '';
  
  const cleaned = input.trim().toLowerCase();
  
  // Check if it looks like a postcode (contains numbers)
  // UK postcodes format: SW1A 1AA, CR0 1PB, etc.
  const postcodePattern = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i;
  if (postcodePattern.test(input.trim())) {
    // Already a valid postcode format
    return input.trim().toUpperCase();
  }
  
  // Try to match area name
  if (AREA_TO_POSTCODE[cleaned]) {
    return AREA_TO_POSTCODE[cleaned];
  }
  
  // Return original input (may need manual correction)
  return input.trim();
}

/**
 * Validate if string is a valid UK postcode format
 */
export function isValidPostcode(postcode: string): boolean {
  const postcodePattern = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i;
  return postcodePattern.test(postcode.trim());
}
